import { z } from 'zod';
import { extractAgentAuth } from '@/shared/http/agent-auth';
import { agentError, agentSuccess, handleAgentError } from '@/shared/http/agent-responses';
import {
  agentExecutionRepository,
  agentExecutionEventRepository,
  agentRepository,
  auditLogRepository,
  commentRepository,
  executionLeaseRepository,
  taskRepository,
} from '@/infra/adapters/prisma';
import { updateTask } from '@/domain/use-cases/tasks/update-task';
import { ingestExecutionMemory } from '@/domain/use-cases/memory/ingest-execution-memory';

export const dynamic = 'force-dynamic';

const taskStatusSchema = z.enum(['BACKLOG', 'TODO', 'DOING', 'REVIEW', 'QA_READY', 'DONE']);

const finalizeEvidenceSchema = z.object({
  artifact: z.object({
    workKind: z.string().optional(),
    gitPolicy: z.string().optional(),
    mode: z.string().optional(),
    baseBranch: z.string().nullable().optional(),
    branch: z.string().nullable().optional(),
    baselineHeadSha: z.string().optional(),
    finalHeadSha: z.string().optional(),
    newCommitShas: z.array(z.string()).optional(),
    changedFiles: z.array(z.string()).optional(),
    hasVerifiableDelta: z.boolean().optional(),
    policyVerified: z.boolean().optional(),
    prUrl: z.string().nullable().optional(),
    prNumber: z.number().int().nullable().optional(),
  }).passthrough().optional(),
  workflow: z.record(z.string(), z.unknown()).optional(),
  qa: z.record(z.string(), z.unknown()).optional(),
}).passthrough();

const finalizeSchema = z.object({
  status: z.enum(['SUCCESS', 'FAILED', 'TIMEOUT', 'CANCELLED']),
  expectedExecutionId: z.string().min(1).optional(),
  callerRoleHint: z.string().max(50).optional(),
  disposition: z.object({
    fromStatus: taskStatusSchema.optional(),
    requestedNextStatus: taskStatusSchema.nullable().optional(),
    nextAssigneeAgentId: z.string().uuid().nullable().optional(),
    reason: z.string().max(500).optional(),
    blockReason: z.string().nullable().optional(),
  }).passthrough().optional(),
  evidence: finalizeEvidenceSchema.optional(),
  output: z.string().optional(),
  resultSummary: z.string().optional(),
  result: z.record(z.string(), z.unknown()).optional(),
  errorMessage: z.string().optional(),
  exitCode: z.number().int().optional(),
  duration: z.number().int().nonnegative().optional(),
  finishedAt: z.string().datetime().optional(),
  nextStatus: taskStatusSchema.optional(),
  nextAssigneeAgentId: z.string().uuid().nullable().optional(),
  blockReason: z.string().nullable().optional(),
  comment: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

type FinalizeExecutionStatus = 'SUCCESS' | 'FAILED' | 'TIMEOUT' | 'CANCELLED';
type FinalizeRequest = z.infer<typeof finalizeSchema>;
type TaskStatus = z.infer<typeof taskStatusSchema>;

function isFinalizeExecutionStatus(value: string): value is FinalizeExecutionStatus {
  return ['SUCCESS', 'FAILED', 'TIMEOUT', 'CANCELLED'].includes(value);
}

function buildMemoryIngestionState(status: 'pending' | 'completed' | 'failed', updatedAt: Date) {
  return {
    status,
    updatedAt: updatedAt.toISOString(),
  };
}

function extractStoredResult(metadata: Record<string, unknown>): Record<string, unknown> | undefined {
  const storedResult = metadata.result;
  if (!storedResult || typeof storedResult !== 'object' || Array.isArray(storedResult)) {
    return undefined;
  }

  return storedResult as Record<string, unknown>;
}

function extractGitPayload(data: {
  result?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  evidence?: z.infer<typeof finalizeEvidenceSchema>;
}): Record<string, unknown> | undefined {
  const evidenceGit = data.evidence?.artifact;
  if (evidenceGit && typeof evidenceGit === 'object') {
    return evidenceGit as Record<string, unknown>;
  }

  const resultGit = data.result?.git;
  if (resultGit && typeof resultGit === 'object') {
    return resultGit as Record<string, unknown>;
  }

  const metadataGit = data.metadata?.git;
  if (metadataGit && typeof metadataGit === 'object') {
    return metadataGit as Record<string, unknown>;
  }

  return undefined;
}

function mergeEvidenceIntoMetadata(
  metadata: Record<string, unknown>,
  evidence: z.infer<typeof finalizeEvidenceSchema> | undefined,
): Record<string, unknown> {
  if (!evidence) {
    return metadata;
  }

  return {
    ...metadata,
    evidence,
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function policyRequiresWrite(policy: string | null): boolean {
  return policy !== null && policy !== 'no_write';
}

function policyRequiresPullRequest(policy: string | null): boolean {
  return policy === 'branch_commit_pr';
}

function normalizeRole(role: string | null): string | null {
  if (!role) {
    return null;
  }

  const normalized = role.toLowerCase().trim();
  if (['builder', 'reviewer', 'qa', 'recovery', 'orchestrator'].includes(normalized)) {
    return normalized;
  }

  return null;
}

function deriveEffectiveRole(args: {
  execution: { metadata: Record<string, unknown> };
  agent: { type?: string | null; config?: Record<string, unknown> };
  taskStatus: TaskStatus;
}): string {
  const agentConfig = asRecord(args.agent.config);
  const persistedRole = normalizeRole(readString(args.execution.metadata.runRole));
  if (persistedRole) {
    return persistedRole;
  }

  const configuredRole =
    normalizeRole(readString(agentConfig?.runRole)) ??
    normalizeRole(readString(agentConfig?.run_role)) ??
    normalizeRole(readString(agentConfig?.role));
  if (configuredRole) {
    return configuredRole;
  }

  if (args.taskStatus === 'QA_READY') {
    return 'qa';
  }
  if (args.taskStatus === 'REVIEW') {
    return 'reviewer';
  }

  return 'builder';
}

function validateQaPassEvidence(data: FinalizeRequest): string | null {
  const qaEvidence = asRecord(data.evidence?.qa);
  if (!qaEvidence) {
    return 'QA pass requires qa evidence';
  }

  if (qaEvidence.passed !== true) {
    return 'QA pass requires evidence.qa.passed=true';
  }

  const checks = qaEvidence.checks;
  if (!Array.isArray(checks) || checks.length === 0) {
    return 'QA pass requires at least one QA check';
  }

  return null;
}

function validateTransition(args: {
  effectiveRole: string;
  taskStatus: TaskStatus;
  executionStatus: FinalizeExecutionStatus;
  data: FinalizeRequest;
}): string | null {
  const requestedNextStatus = args.data.disposition?.requestedNextStatus ?? args.data.nextStatus;
  const fromStatus = args.data.disposition?.fromStatus;

  if (fromStatus && fromStatus !== args.taskStatus) {
    return `Disposition fromStatus ${fromStatus} does not match current task status ${args.taskStatus}`;
  }

  if (args.executionStatus !== 'SUCCESS' || !requestedNextStatus) {
    return null;
  }

  if (requestedNextStatus === args.taskStatus) {
    return null;
  }

  const allowedByRole: Record<string, Partial<Record<TaskStatus, TaskStatus[]>>> = {
    builder: {
      TODO: ['DOING', 'REVIEW'],
      DOING: ['TODO', 'REVIEW'],
    },
    reviewer: {
      REVIEW: ['QA_READY', 'DOING', 'TODO'],
    },
    qa: {
      QA_READY: ['DONE', 'REVIEW', 'DOING'],
    },
    recovery: {
      TODO: ['REVIEW', 'QA_READY'],
      DOING: ['TODO', 'REVIEW', 'QA_READY'],
      REVIEW: ['TODO', 'QA_READY'],
      QA_READY: ['TODO', 'REVIEW', 'DONE'],
    },
    orchestrator: {},
  };

  const allowed = allowedByRole[args.effectiveRole]?.[args.taskStatus] ?? [];
  if (!allowed.includes(requestedNextStatus)) {
    return `Role ${args.effectiveRole} cannot move task from ${args.taskStatus} to ${requestedNextStatus}`;
  }

  if (args.effectiveRole === 'qa' && requestedNextStatus === 'DONE') {
    return validateQaPassEvidence(args.data);
  }

  return null;
}

async function recordFinalizeValidationRejected(
  executionId: string,
  reason: string,
  metadata: Record<string, unknown>,
): Promise<void> {
  const lastSeq = await agentExecutionEventRepository.getLastSeq(executionId);
  await agentExecutionEventRepository.createMany(executionId, [{
    seq: lastSeq + 1,
    kind: 'finalize.validation_rejected',
    content: reason,
    metadata,
  }]);
}

function executionRequiresArtifactEvidence(execution: { metadata: Record<string, unknown> }): boolean {
  const runtimeBinding = asRecord(execution.metadata.runtimeBinding);
  const storedGit = asRecord(execution.metadata.git);
  const policy =
    readString(runtimeBinding?.gitPolicy) ??
    readString(storedGit?.gitPolicy) ??
    readString(storedGit?.mode);

  return policyRequiresWrite(policy);
}

function isProtectedBranch(branch: string | null, baseBranch: string | null): boolean {
  if (!branch) {
    return false;
  }

  return branch === baseBranch || branch === 'main' || branch === 'master';
}

function branchAllowed(branch: string | null, allowedPrefix: string | null): boolean {
  if (!allowedPrefix || !branch) {
    return true;
  }

  const normalizedPrefix = allowedPrefix.replace(/^\/+|\/+$/g, '');
  return normalizedPrefix === '' || branch === normalizedPrefix || branch.startsWith(`${normalizedPrefix}/`);
}

function validateArtifactEvidence(
  execution: { metadata: Record<string, unknown> },
  data: FinalizeRequest,
): string | null {
  const artifact = data.evidence?.artifact;
  if (data.status !== 'SUCCESS') {
    return null;
  }

  if (!artifact) {
    return executionRequiresArtifactEvidence(execution)
      ? 'Artifact evidence is required for write success'
      : null;
  }

  const runtimeBinding = asRecord(execution.metadata.runtimeBinding);
  const storedGit = asRecord(execution.metadata.git);
  const expectedPolicy =
    readString(runtimeBinding?.gitPolicy) ??
    readString(storedGit?.mode) ??
    readString(storedGit?.gitPolicy);
  const artifactPolicy = readString(artifact.gitPolicy) ?? readString(artifact.mode);

  if (expectedPolicy && artifactPolicy && artifactPolicy !== expectedPolicy) {
    return `Artifact gitPolicy ${artifactPolicy} does not match expected ${expectedPolicy}`;
  }

  const effectivePolicy = artifactPolicy ?? expectedPolicy;
  if (!policyRequiresWrite(effectivePolicy)) {
    return null;
  }

  const baseBranch = readString(artifact.baseBranch);
  const expectedBaseBranch = readString(runtimeBinding?.defaultBaseBranch);
  if (expectedBaseBranch && baseBranch !== expectedBaseBranch) {
    return `Artifact baseBranch ${baseBranch ?? '<missing>'} does not match expected ${expectedBaseBranch}`;
  }

  const branch = readString(artifact.branch);
  const allowedPrefix = readString(runtimeBinding?.allowedBranchPrefix);
  if (!branchAllowed(branch, allowedPrefix)) {
    return `Artifact branch ${branch ?? '<missing>'} is outside allowed prefix ${allowedPrefix}`;
  }

  if (isProtectedBranch(branch, baseBranch ?? expectedBaseBranch)) {
    return `Artifact branch ${branch} is protected`;
  }

  if (!artifact.hasVerifiableDelta) {
    return 'Artifact evidence must include hasVerifiableDelta=true for write success';
  }

  if (!artifact.newCommitShas || artifact.newCommitShas.length === 0) {
    return 'Artifact evidence must include at least one new commit for write success';
  }

  if (!artifact.baselineHeadSha || !artifact.finalHeadSha) {
    return 'Artifact evidence must include baselineHeadSha and finalHeadSha for write success';
  }

  if (artifact.baselineHeadSha === artifact.finalHeadSha) {
    return 'Artifact baselineHeadSha and finalHeadSha must differ for write success';
  }

  if (policyRequiresPullRequest(effectivePolicy) && !artifact.prUrl && !artifact.prNumber) {
    return 'Artifact evidence must include a PR reference for branch_commit_pr success';
  }

  return null;
}

function shouldIngestMemory(
  execution: { status: FinalizeExecutionStatus; metadata: Record<string, unknown> },
  effectiveStatus: FinalizeExecutionStatus,
  result: Record<string, unknown> | undefined,
): boolean {
  if (effectiveStatus !== 'SUCCESS' || !result) {
    return false;
  }

  const memoryState = execution.metadata.memoryIngestion;
  if (!memoryState || typeof memoryState !== 'object' || Array.isArray(memoryState)) {
    return true;
  }

  return (memoryState as Record<string, unknown>).status !== 'completed';
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await extractAgentAuth();
    const { id } = await params;
    const execution = await agentExecutionRepository.findById(id);
    if (!execution || execution.orgId !== auth.orgId) {
      return agentError('NOT_FOUND', 'Execution not found', 404);
    }

    const agent = await agentRepository.findById(execution.agentId);
    if (!agent || agent.orgId !== auth.orgId) {
      return agentError('NOT_FOUND', 'Agent not found', 404);
    }

    const terminalExecutionStatus = isFinalizeExecutionStatus(execution.status)
      ? execution.status
      : null;
    const alreadyTerminal = terminalExecutionStatus !== null;
    const body = await request.json();
    const data = finalizeSchema.parse(body);
    if (data.expectedExecutionId && data.expectedExecutionId !== execution.id) {
      return agentError(
        'EXECUTION_MISMATCH',
        'expectedExecutionId does not match the execution being finalized',
        409,
      );
    }
    const task = await taskRepository.findById(execution.taskId, auth.orgId);
    if (task && !alreadyTerminal && task.currentExecutionId && task.currentExecutionId !== execution.id) {
      return agentError(
        'EXECUTION_NOT_CURRENT',
        'Execution is not the current owner of this task',
        409,
      );
    }
    if (!alreadyTerminal) {
      const artifactValidationError = validateArtifactEvidence(execution, data);
      if (artifactValidationError) {
        await recordFinalizeValidationRejected(execution.id, artifactValidationError, {
          gate: 'artifact',
          expectedExecutionId: data.expectedExecutionId ?? null,
        }).catch(() => {});
        return agentError('FINALIZE_VALIDATION_REJECTED', artifactValidationError, 422);
      }
    }

    if (task && !alreadyTerminal) {
      const effectiveRole = deriveEffectiveRole({
        execution: {
          ...execution,
          metadata: execution.metadata ?? {},
        },
        agent,
        taskStatus: task.status as TaskStatus,
      });
      const requestedNextStatus = data.disposition?.requestedNextStatus ?? data.nextStatus;
      const transitionValidationError = validateTransition({
        effectiveRole,
        taskStatus: task.status as TaskStatus,
        executionStatus: data.status,
        data,
      });
      if (transitionValidationError) {
        await recordFinalizeValidationRejected(execution.id, transitionValidationError, {
          gate: 'transition',
          effectiveRole,
          fromStatus: task.status,
          requestedNextStatus: requestedNextStatus ?? null,
        }).catch(() => {});
        return agentError('FINALIZE_VALIDATION_REJECTED', transitionValidationError, 422);
      }
    }

    const finishedAt = data.finishedAt ? new Date(data.finishedAt) : new Date();
    const resultPayload = data.result ?? extractStoredResult(execution.metadata ?? {});
    let executionForMemory: {
      status: FinalizeExecutionStatus;
      metadata: Record<string, unknown>;
    };
    if (terminalExecutionStatus) {
      executionForMemory = {
        status: terminalExecutionStatus,
        metadata: execution.metadata ?? {},
      };
    } else {
      executionForMemory = {
        status: data.status,
        metadata: execution.metadata ?? {},
      };
    }
    const effectiveExecutionStatus = executionForMemory.status;
    const shouldQueueMemoryIngestion = shouldIngestMemory(executionForMemory, effectiveExecutionStatus, resultPayload);
    const mergedMetadata = mergeEvidenceIntoMetadata({
      ...(execution.metadata ?? {}),
      ...(data.metadata ?? {}),
      ...(resultPayload ? { result: resultPayload } : {}),
      ...(shouldQueueMemoryIngestion ? {
        memoryIngestion: buildMemoryIngestionState('pending', finishedAt),
      } : {}),
    }, data.evidence);
    let updatedExecution = alreadyTerminal
      ? execution
      : await agentExecutionRepository.updateStatus(id, {
          status: data.status,
          output: data.output,
          resultSummary: data.resultSummary,
          errorMessage: data.errorMessage,
          exitCode: data.exitCode,
          duration: data.duration,
          finishedAt,
          lastHeartbeatAt: finishedAt,
          metadata: mergedMetadata,
        });

    if (alreadyTerminal && shouldQueueMemoryIngestion) {
      updatedExecution = await agentExecutionRepository.updateStatus(id, {
        status: execution.status,
        metadata: mergedMetadata,
      });
    }

    let responseExecution = updatedExecution;

    if (task && !alreadyTerminal) {
      const requestedNextStatus = data.disposition?.requestedNextStatus ?? data.nextStatus;
      const requestedNextAssigneeAgentId =
        data.disposition?.nextAssigneeAgentId ?? data.nextAssigneeAgentId;
      const requestedBlockReason = data.disposition?.blockReason ?? data.blockReason;

      const taskUpdate: {
        status?: 'BACKLOG' | 'TODO' | 'DOING' | 'REVIEW' | 'QA_READY' | 'DONE';
        blocked: boolean;
        blockReason?: string | null;
        assigneeAgentId?: string | null;
      } = {
        blocked: effectiveExecutionStatus !== 'SUCCESS',
      };

      if (requestedNextStatus) {
        taskUpdate.status = requestedNextStatus;
      }

      if (effectiveExecutionStatus === 'SUCCESS') {
        taskUpdate.blocked = false;
        if (requestedNextAssigneeAgentId !== undefined) {
          taskUpdate.assigneeAgentId = requestedNextAssigneeAgentId;
        }
      } else {
        taskUpdate.blockReason = requestedBlockReason ?? data.errorMessage ?? 'Execution failed';
      }

      const shouldUpdateTask =
        (taskUpdate.status !== undefined && task.status !== taskUpdate.status) ||
        task.blocked !== taskUpdate.blocked ||
        (taskUpdate.blockReason !== undefined && task.blockReason !== taskUpdate.blockReason) ||
        (taskUpdate.assigneeAgentId !== undefined && task.assigneeAgentId !== taskUpdate.assigneeAgentId);

      if (shouldUpdateTask) {
        await updateTask(
          execution.taskId,
          auth.orgId,
          auth.userId,
          taskUpdate,
          { taskRepository, auditLogRepository, agentRepository },
          {
            source: 'agent',
            agentName: auth.agentName,
            keyPrefix: auth.keyPrefix,
            authMethod: auth.authMethod,
            keyId: auth.keyId,
          }
        );
      }

      const gitResult = extractGitPayload({
        result: resultPayload,
        metadata: data.metadata,
        evidence: data.evidence,
      });
      if (gitResult) {
        const prUrl = typeof gitResult.prUrl === 'string' ? gitResult.prUrl : undefined;
        const prNumber = typeof gitResult.prNumber === 'number' ? gitResult.prNumber : undefined;
        if (prUrl || prNumber !== undefined) {
          const prUpdate: {
            githubPrUrl?: string | null;
            githubPrNumber?: number | null;
            githubPrStatus?: 'open' | 'closed' | 'merged' | null;
          } = {};
          if (prUrl) prUpdate.githubPrUrl = prUrl;
          if (prNumber !== undefined) prUpdate.githubPrNumber = prNumber;
          prUpdate.githubPrStatus = 'open';
          await taskRepository.update(execution.taskId, auth.orgId, prUpdate);
        }
      }

      await taskRepository.clearCurrentExecution(execution.taskId, auth.orgId, execution.id);
    }

    await executionLeaseRepository.deleteByExecutionId(id);

    if (data.comment) {
      const existingComments = await commentRepository.findByTaskId(execution.taskId, auth.orgId);
      const alreadyCommented = existingComments.some(
        (comment) => comment.agentId === execution.agentId && comment.content === data.comment
      );

      if (!alreadyCommented) {
        await commentRepository.create({
          orgId: auth.orgId,
          taskId: execution.taskId,
          userId: auth.userId,
          content: data.comment,
          agentId: execution.agentId,
        });
      }
    }

    if (shouldQueueMemoryIngestion) {
      const memoryIngestionSucceeded = await ingestExecutionMemory({
        orgId: auth.orgId,
        projectId: execution.projectId,
        taskId: execution.taskId,
        executionId: execution.id,
        agentName: auth.agentName,
        tool: execution.tool,
        model: execution.model,
        result: resultPayload,
      }).then(() => true).catch((error) => {
        console.error('[agent-api] Memory ingestion failed during execution finalize', error);
        return false;
      });

      const memoryIngestionUpdatedAt = new Date();
      responseExecution = await agentExecutionRepository.updateStatus(id, {
        status: updatedExecution.status,
        metadata: {
          memoryIngestion: buildMemoryIngestionState(
            memoryIngestionSucceeded ? 'completed' : 'failed',
            memoryIngestionUpdatedAt,
          ),
        },
      }).catch((error) => {
        console.error('[agent-api] Failed to persist memory ingestion status', error);
        return responseExecution;
      });
    }

    return agentSuccess(responseExecution);
  } catch (error) {
    return handleAgentError(error);
  }
}

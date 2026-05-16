import { z } from 'zod';
import { extractAgentAuth } from '@/shared/http/agent-auth';
import { agentError, agentSuccess, handleAgentError } from '@/shared/http/agent-responses';
import {
  agentExecutionRepository,
  agentRepository,
  auditLogRepository,
  commentRepository,
  executionLeaseRepository,
  taskRepository,
} from '@/infra/adapters/prisma';
import { updateTask } from '@/domain/use-cases/tasks/update-task';
import { ingestExecutionMemory } from '@/domain/use-cases/memory/ingest-execution-memory';

export const dynamic = 'force-dynamic';

const finalizeSchema = z.object({
  status: z.enum(['SUCCESS', 'FAILED', 'TIMEOUT', 'CANCELLED']),
  output: z.string().optional(),
  resultSummary: z.string().optional(),
  result: z.record(z.string(), z.unknown()).optional(),
  errorMessage: z.string().optional(),
  exitCode: z.number().int().optional(),
  duration: z.number().int().nonnegative().optional(),
  finishedAt: z.string().datetime().optional(),
  nextStatus: z.enum(['BACKLOG', 'TODO', 'DOING', 'REVIEW', 'QA_READY', 'DONE']).optional(),
  nextAssigneeAgentId: z.string().uuid().nullable().optional(),
  blockReason: z.string().nullable().optional(),
  comment: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

type FinalizeExecutionStatus = 'SUCCESS' | 'FAILED' | 'TIMEOUT' | 'CANCELLED';

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
}): Record<string, unknown> | undefined {
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
    const mergedMetadata = {
      ...(execution.metadata ?? {}),
      ...(data.metadata ?? {}),
      ...(resultPayload ? { result: resultPayload } : {}),
      ...(shouldQueueMemoryIngestion ? {
        memoryIngestion: buildMemoryIngestionState('pending', finishedAt),
      } : {}),
    };
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

    const task = await taskRepository.findById(execution.taskId, auth.orgId);
    if (task && !alreadyTerminal) {
      const taskUpdate: {
        status?: 'BACKLOG' | 'TODO' | 'DOING' | 'REVIEW' | 'QA_READY' | 'DONE';
        blocked: boolean;
        blockReason?: string | null;
        assigneeAgentId?: string | null;
      } = {
        blocked: effectiveExecutionStatus !== 'SUCCESS',
      };

      if (data.nextStatus) {
        taskUpdate.status = data.nextStatus;
      }

      if (effectiveExecutionStatus === 'SUCCESS') {
        taskUpdate.blocked = false;
        if (data.nextAssigneeAgentId !== undefined) {
          taskUpdate.assigneeAgentId = data.nextAssigneeAgentId;
        }
      } else {
        taskUpdate.blockReason = data.blockReason ?? data.errorMessage ?? 'Execution failed';
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

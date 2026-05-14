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

    const alreadyTerminal = ['SUCCESS', 'FAILED', 'TIMEOUT', 'CANCELLED'].includes(execution.status);
    const body = await request.json();
    const data = finalizeSchema.parse(body);

    const finishedAt = data.finishedAt ? new Date(data.finishedAt) : new Date();
    const mergedMetadata = {
      ...(execution.metadata ?? {}),
      ...(data.metadata ?? {}),
      ...(data.result ? { result: data.result } : {}),
    };
    const updatedExecution = alreadyTerminal
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

    const taskUpdate: {
      status?: 'BACKLOG' | 'TODO' | 'DOING' | 'REVIEW' | 'QA_READY' | 'DONE';
      blocked: boolean;
      blockReason?: string | null;
      assigneeAgentId?: string | null;
    } = {
      blocked: data.status !== 'SUCCESS',
    };

    if (data.nextStatus) {
      taskUpdate.status = data.nextStatus;
    }

    if (data.status === 'SUCCESS') {
      taskUpdate.blocked = false;
      if (data.nextAssigneeAgentId !== undefined) {
        taskUpdate.assigneeAgentId = data.nextAssigneeAgentId;
      }
    } else {
      taskUpdate.blockReason = data.blockReason ?? data.errorMessage ?? 'Execution failed';
    }

    const task = await taskRepository.findById(execution.taskId, auth.orgId);
    if (task) {
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
        result: data.result,
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

    return agentSuccess(updatedExecution);
  } catch (error) {
    return handleAgentError(error);
  }
}

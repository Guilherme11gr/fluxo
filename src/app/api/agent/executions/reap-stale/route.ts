import { z } from 'zod';
import { extractAgentAuth } from '@/shared/http/agent-auth';
import { agentSuccess, handleAgentError } from '@/shared/http/agent-responses';
import { agentExecutionRepository, executionLeaseRepository, taskRepository, auditLogRepository, agentRepository } from '@/infra/adapters/prisma';
import { updateTask } from '@/domain/use-cases/tasks/update-task';

export const dynamic = 'force-dynamic';

const reapSchema = z.object({
  staleAfterMs: z.number().int().positive().max(7 * 24 * 60 * 60 * 1000).optional(),
});

export async function POST(request: Request) {
  try {
    const auth = await extractAgentAuth();
    const body = await request.json().catch(() => ({}));
    const data = reapSchema.parse(body);
    const staleAfterMs = data.staleAfterMs ?? 10 * 60 * 1000;

    const staleExecutions = await agentExecutionRepository.findActiveByOrg(
      auth.orgId,
      new Date(Date.now() - staleAfterMs)
    );

    for (const execution of staleExecutions) {
      await updateTask(
        execution.taskId,
        auth.orgId,
        auth.userId,
        {
          blocked: false,
          blockReason: null,
          status: 'TODO',
        },
        { taskRepository, auditLogRepository, agentRepository },
        {
          source: 'agent',
          agentName: auth.agentName,
          keyPrefix: auth.keyPrefix,
          authMethod: auth.authMethod,
          keyId: auth.keyId,
        }
      ).catch(() => {});
    }

    const timedOut = await agentExecutionRepository.markStaleAsTimeout(auth.orgId, staleAfterMs);
    const expiredLeases = await executionLeaseRepository.deleteExpired(auth.orgId);

    return agentSuccess({ timedOut, expiredLeases });
  } catch (error) {
    return handleAgentError(error);
  }
}

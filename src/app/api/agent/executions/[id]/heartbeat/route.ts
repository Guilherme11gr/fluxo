import { extractAgentAuth } from '@/shared/http/agent-auth';
import { agentError, agentSuccess, handleAgentError } from '@/shared/http/agent-responses';
import { agentExecutionRepository, executionLeaseRepository, taskRepository } from '@/infra/adapters/prisma';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const LEASE_HEARTBEAT_MS = 90 * 1000;
const heartbeatSchema = z.object({
  expectedExecutionId: z.string().min(1).optional(),
});

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

    const body = await request.json().catch(() => ({}));
    const data = heartbeatSchema.parse(body);
    if (data.expectedExecutionId && data.expectedExecutionId !== id) {
      return agentError('EXECUTION_MISMATCH', 'expectedExecutionId does not match the heartbeat execution', 409);
    }

    if (!['CLAIMED', 'RUNNING'].includes(execution.status)) {
      return agentError('EXECUTION_NOT_ACTIVE', 'Execution is not active', 409);
    }

    const task = await taskRepository.findById(execution.taskId, auth.orgId);
    if (task && task.currentExecutionId && task.currentExecutionId !== id) {
      return agentError('EXECUTION_NOT_CURRENT', 'Execution is not the current owner of this task', 409);
    }

    const updated = await agentExecutionRepository.heartbeat(id);
    const lease = await executionLeaseRepository.findByProject(auth.orgId, execution.projectId);
    if (lease && lease.executionId === id) {
      await executionLeaseRepository.renew(lease.id, new Date(Date.now() + LEASE_HEARTBEAT_MS));
    }

    return agentSuccess(updated);
  } catch (error) {
    return handleAgentError(error);
  }
}

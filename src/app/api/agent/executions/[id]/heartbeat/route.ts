import { extractAgentAuth } from '@/shared/http/agent-auth';
import { agentError, agentSuccess, handleAgentError } from '@/shared/http/agent-responses';
import { agentExecutionRepository, executionLeaseRepository } from '@/infra/adapters/prisma';

export const dynamic = 'force-dynamic';

const LEASE_HEARTBEAT_MS = 90 * 1000;

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await extractAgentAuth();
    const { id } = await params;
    const execution = await agentExecutionRepository.findById(id);
    if (!execution || execution.orgId !== auth.orgId) {
      return agentError('NOT_FOUND', 'Execution not found', 404);
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

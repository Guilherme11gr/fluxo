/**
 * Agent API - Heartbeat
 * POST /api/agent/agents/[id]/heartbeat
 */

import { z } from 'zod';
import { extractAgentAuth } from '@/shared/http/agent-auth';
import { agentSuccess, agentError, handleAgentError } from '@/shared/http/agent-responses';
import { agentRepository } from '@/infra/adapters/prisma';

export const dynamic = 'force-dynamic';

const heartbeatSchema = z.object({
  status: z.enum(['ONLINE', 'OFFLINE', 'BUSY']).default('ONLINE'),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await extractAgentAuth();
    const { id } = await params;

    const agent = await agentRepository.findById(id);
    if (!agent || agent.orgId !== auth.orgId) {
      return agentError('NOT_FOUND', 'Agent not found', 404);
    }

    const body = await request.json().catch(() => ({}));
    const data = heartbeatSchema.parse(body);
    const updated = await agentRepository.updateStatus(id, data.status);
    return agentSuccess(updated);
  } catch (error) {
    return handleAgentError(error);
  }
}

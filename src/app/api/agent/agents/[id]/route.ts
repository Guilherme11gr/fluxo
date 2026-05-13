/**
 * Agent API - Single Agent CRUD
 * 
 * GET    /api/agent/agents/[id] - Get agent
 * PATCH  /api/agent/agents/[id] - Update agent
 * DELETE /api/agent/agents/[id] - Delete agent
 */

import { z } from 'zod';
import { extractAgentAuth } from '@/shared/http/agent-auth';
import { agentSuccess, agentError, handleAgentError } from '@/shared/http/agent-responses';
import { agentRepository } from '@/infra/adapters/prisma';

export const dynamic = 'force-dynamic';

const updateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  type: z.enum(['RUNNER', 'REVIEWER', 'CUSTOM']).optional(),
  tool: z.string().max(50).optional(),
  workdir: z.string().optional(),
  config: z.record(z.unknown()).optional(),
  status: z.enum(['ONLINE', 'OFFLINE', 'BUSY']).optional(),
});

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await extractAgentAuth();
    const { id } = await params;
    const agent = await agentRepository.findById(id);
    if (!agent || agent.orgId !== auth.orgId) {
      return agentError('NOT_FOUND', 'Agent not found', 404);
    }
    return agentSuccess(agent);
  } catch (error) {
    return handleAgentError(error);
  }
}

export async function PATCH(
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

    const body = await request.json();
    const data = updateSchema.parse(body);
    const updated = await agentRepository.update(id, data);
    return agentSuccess(updated);
  } catch (error) {
    return handleAgentError(error);
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await extractAgentAuth();
    const { id } = await params;

    const agent = await agentRepository.findById(id);
    if (!agent || agent.orgId !== auth.orgId) {
      return agentError('NOT_FOUND', 'Agent not found', 404);
    }

    await agentRepository.delete(id);
    return agentSuccess({ deleted: true });
  } catch (error) {
    return handleAgentError(error);
  }
}

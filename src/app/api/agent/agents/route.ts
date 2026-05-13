/**
 * Agent API - Agent Registry
 * 
 * GET  /api/agent/agents - List agents for org
 * POST /api/agent/agents - Register a new agent
 */

import { z } from 'zod';
import { extractAgentAuth } from '@/shared/http/agent-auth';
import { agentList, agentSuccess, agentError, handleAgentError } from '@/shared/http/agent-responses';
import { agentRepository } from '@/infra/adapters/prisma';

export const dynamic = 'force-dynamic';

const createSchema = z.object({
  name: z.string().min(1).max(100),
  type: z.enum(['RUNNER', 'REVIEWER', 'CUSTOM']).default('RUNNER'),
  tool: z.string().max(50).optional(),
  workdir: z.string().optional(),
  config: z.record(z.string(), z.unknown()).optional(),
});

export async function GET() {
  try {
    const auth = await extractAgentAuth();
    const agents = await agentRepository.findByOrgId(auth.orgId);
    return agentList(agents);
  } catch (error) {
    return handleAgentError(error);
  }
}

export async function POST(request: Request) {
  try {
    const auth = await extractAgentAuth();
    const body = await request.json();
    const data = createSchema.parse(body);

    // Check if agent with same name already exists
    const existing = await agentRepository.findByName(auth.orgId, data.name);
    if (existing) {
      // Update status to ONLINE instead of erroring
      const updated = await agentRepository.updateStatus(existing.id, 'ONLINE');
      return agentSuccess(updated);
    }

    const agent = await agentRepository.create({
      orgId: auth.orgId,
      name: data.name,
      type: data.type,
      tool: data.tool,
      workdir: data.workdir,
      config: data.config,
      createdBy: auth.userId,
    });

    return agentSuccess(agent, 201);
  } catch (error) {
    return handleAgentError(error);
  }
}

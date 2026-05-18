/**
 * Agent API - Agent Registry
 * 
 * GET  /api/agent/agents - List agents for org
 * POST /api/agent/agents - Register a new agent
 */

import { z } from 'zod';
import { extractAgentAuth } from '@/shared/http/agent-auth';
import { agentList, agentSuccess, handleAgentError } from '@/shared/http/agent-responses';
import { agentRepository } from '@/infra/adapters/prisma';

export const dynamic = 'force-dynamic';

const createSchema = z.object({
  name: z.string().min(1).max(100),
  type: z.enum(['RUNNER', 'REVIEWER', 'CUSTOM']).default('RUNNER'),
  tool: z.string().max(50).optional(),
  workdir: z.string().optional(),
  projectId: z.string().uuid().optional(),
  config: z.record(z.string(), z.unknown()).optional(),
});

export async function GET(request: Request) {
  try {
    const auth = await extractAgentAuth();
    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get('projectId');
    const agents = await agentRepository.findByOrgId(auth.orgId, projectId ?? undefined);
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
      // Update status to ONLINE and merge config (preserving available_models)
      const existingConfig = (existing.config as Record<string, unknown>) ?? {};
      const mergedConfig = { ...existingConfig, ...(data.config ?? {}) };
      const updated = await agentRepository.update(existing.id, {
        type: data.type,
        tool: data.tool,
        workdir: data.workdir,
        projectId: data.projectId,
        status: 'ONLINE',
        config: mergedConfig,
      });
      return agentSuccess(updated);
    }

    const agent = await agentRepository.create({
      orgId: auth.orgId,
      name: data.name,
      type: data.type,
      tool: data.tool,
      workdir: data.workdir,
      projectId: data.projectId,
      config: data.config,
      createdBy: auth.userId,
    });

    return agentSuccess(agent, 201);
  } catch (error) {
    return handleAgentError(error);
  }
}

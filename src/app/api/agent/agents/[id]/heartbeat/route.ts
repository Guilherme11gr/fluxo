/**
 * Agent API - Heartbeat
 * POST /api/agent/agents/[id]/heartbeat
 */

import { z } from 'zod';
import { extractAgentAuth } from '@/shared/http/agent-auth';
import { agentSuccess, agentError } from '@/shared/http/agent-responses';
import { agentRepository } from '@/infra/adapters/prisma';

export const dynamic = 'force-dynamic';

const heartbeatSchema = z.object({
  status: z.enum(['ONLINE', 'OFFLINE', 'BUSY']).default('ONLINE'),
  config: z.record(z.string(), z.unknown()).optional(),
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

    // Merge config: if available_models is sent, merge it into existing config
    let mergedConfig: Record<string, unknown> | undefined;
    if (data.config) {
      const existingConfig = (agent.config as Record<string, unknown>) ?? {};
      mergedConfig = { ...existingConfig, ...data.config };
    }

    const updated = await agentRepository.updateWithConfig(id, {
      status: data.status,
      lastHeartbeat: new Date(),
      ...(mergedConfig ? { config: mergedConfig } : {}),
    });
    return agentSuccess(updated);
  } catch {
    return Response.json({ error: 'Failed to process heartbeat' }, { status: 500 });
  }
}

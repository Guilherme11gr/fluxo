import { z } from 'zod';
import { extractAgentAuth } from '@/shared/http/agent-auth';
import { agentSuccess, handleAgentError } from '@/shared/http/agent-responses';
import { runnerInstanceRepository } from '@/infra/adapters/prisma';

export const dynamic = 'force-dynamic';

const registerSchema = z.object({
  hostname: z.string().max(255).optional(),
  pid: z.number().int().positive().optional(),
  version: z.string().max(50).optional(),
  status: z.string().max(20).optional(),
  capabilities: z.record(z.string(), z.unknown()).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export async function POST(request: Request) {
  try {
    const auth = await extractAgentAuth();
    const body = await request.json().catch(() => ({}));
    const data = registerSchema.parse(body);

    const runner = await runnerInstanceRepository.create({
      orgId: auth.orgId,
      hostname: data.hostname ?? null,
      pid: data.pid ?? null,
      version: data.version ?? null,
      status: data.status ?? 'ONLINE',
      capabilities: data.capabilities,
      metadata: {
        authMethod: auth.authMethod,
        keyPrefix: auth.keyPrefix,
        ...data.metadata,
      },
    });

    return agentSuccess(runner, 201);
  } catch (error) {
    return handleAgentError(error);
  }
}

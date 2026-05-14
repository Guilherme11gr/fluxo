import { z } from 'zod';
import { extractAgentAuth } from '@/shared/http/agent-auth';
import { agentError, agentSuccess, handleAgentError } from '@/shared/http/agent-responses';
import { runnerInstanceRepository } from '@/infra/adapters/prisma';

export const dynamic = 'force-dynamic';

const heartbeatSchema = z.object({
  status: z.string().max(20).optional(),
  capabilities: z.record(z.string(), z.unknown()).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await extractAgentAuth();
    const { id } = await params;
    const runner = await runnerInstanceRepository.findById(id);

    if (!runner || runner.orgId !== auth.orgId) {
      return agentError('NOT_FOUND', 'Runner instance not found', 404);
    }

    const body = await request.json().catch(() => ({}));
    const data = heartbeatSchema.parse(body);
    const updated = await runnerInstanceRepository.updateHeartbeat(id, data);
    return agentSuccess(updated);
  } catch (error) {
    return handleAgentError(error);
  }
}

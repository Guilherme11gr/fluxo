import { z } from 'zod';
import { extractAgentAuth } from '@/shared/http/agent-auth';
import { agentError, agentList, agentSuccess, handleAgentError } from '@/shared/http/agent-responses';
import { agentExecutionEventRepository, agentExecutionRepository, taskRepository } from '@/infra/adapters/prisma';

export const dynamic = 'force-dynamic';

const createSchema = z.object({
  expectedExecutionId: z.string().min(1).optional(),
  events: z.array(z.object({
    seq: z.number().int().positive(),
    kind: z.string().min(1).max(50),
    content: z.string(),
    metadata: z.record(z.string(), z.unknown()).optional(),
  })).min(1),
});

export async function GET(
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

    const { searchParams } = new URL(request.url);
    const afterSeq = searchParams.get('afterSeq');
    const limit = Math.min(500, Math.max(1, parseInt(searchParams.get('limit') || '200', 10)));
    const page = await agentExecutionEventRepository.findPageByExecutionId(
      id,
      afterSeq ? parseInt(afterSeq, 10) : undefined,
      limit
    );

    return agentList(page.items, page.returnedCount, {
      lastSeq: page.lastSeq,
      nextAfterSeq: page.nextAfterSeq,
      hasMore: page.hasMore,
    });
  } catch (error) {
    return handleAgentError(error);
  }
}

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

    const body = await request.json();
    const data = createSchema.parse(body);
    if (data.expectedExecutionId && data.expectedExecutionId !== id) {
      return agentError('EXECUTION_MISMATCH', 'expectedExecutionId does not match the event execution', 409);
    }

    if (!['CLAIMED', 'RUNNING'].includes(execution.status)) {
      return agentError('EXECUTION_NOT_ACTIVE', 'Execution is not active', 409);
    }

    const task = await taskRepository.findById(execution.taskId, auth.orgId);
    if (task && task.currentExecutionId && task.currentExecutionId !== id) {
      return agentError('EXECUTION_NOT_CURRENT', 'Execution is not the current owner of this task', 409);
    }

    const created = await agentExecutionEventRepository.createMany(id, data.events);
    return agentSuccess({ created });
  } catch (error) {
    return handleAgentError(error);
  }
}

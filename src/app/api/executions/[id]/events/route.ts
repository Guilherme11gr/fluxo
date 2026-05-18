import { createClient } from '@/lib/supabase/server';
import { extractAuthenticatedTenant } from '@/shared/http/auth.helpers';
import { jsonSuccess, jsonError } from '@/shared/http/responses';
import { handleError } from '@/shared/errors';
import { agentExecutionEventRepository, agentExecutionRepository } from '@/infra/adapters/prisma';

export const dynamic = 'force-dynamic';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const { tenantId } = await extractAuthenticatedTenant(supabase);
    const { id } = await params;
    const execution = await agentExecutionRepository.findById(id);

    if (!execution || execution.orgId !== tenantId) {
      return jsonError('NOT_FOUND', 'Execution not found', 404);
    }

    const { searchParams } = new URL(request.url);
    const afterSeq = searchParams.get('afterSeq');
    const limit = Math.min(500, Math.max(1, parseInt(searchParams.get('limit') || '200', 10)));
    const page = await agentExecutionEventRepository.findPageByExecutionId(
      id,
      afterSeq ? parseInt(afterSeq, 10) : undefined,
      limit
    );

    return jsonSuccess({
      items: page.items,
      lastSeq: page.lastSeq,
      nextAfterSeq: page.nextAfterSeq,
      returnedCount: page.returnedCount,
      hasMore: page.hasMore,
    });
  } catch (error) {
    const { status, body } = handleError(error);
    return jsonError(body.error.code, body.error.message, status);
  }
}

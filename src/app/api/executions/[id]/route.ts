/**
 * Web UI API - Single Execution
 *
 * GET /api/executions/[id] - Get execution detail (includes full output)
 */

import { createClient } from '@/lib/supabase/server';
import { extractAuthenticatedTenant } from '@/shared/http/auth.helpers';
import { jsonSuccess, jsonError } from '@/shared/http/responses';
import { handleError } from '@/shared/errors';
import { agentExecutionRepository } from '@/infra/adapters/prisma';

export const dynamic = 'force-dynamic';

export async function GET(
  _request: Request,
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

    return jsonSuccess(execution);
  } catch (error) {
    const { status, body } = handleError(error);
    return jsonError(body.error.code, body.error.message, status);
  }
}
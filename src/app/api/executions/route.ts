/**
 * Web UI API - Executions
 *
 * GET /api/executions - List executions for current org with filters and pagination
 */

import { createClient } from '@/lib/supabase/server';
import { extractAuthenticatedTenant } from '@/shared/http/auth.helpers';
import { jsonSuccess, jsonError } from '@/shared/http/responses';
import { handleError } from '@/shared/errors';
import { agentExecutionRepository } from '@/infra/adapters/prisma';
import { AgentExecStatus } from '@prisma/client';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const supabase = await createClient();
    const { tenantId } = await extractAuthenticatedTenant(supabase);

    const { searchParams } = new URL(request.url);
    const statusParam = searchParams.get('status');
    const status = statusParam ? (statusParam as AgentExecStatus) : undefined;
    const agentId = searchParams.get('agentId') || undefined;
    const projectId = searchParams.get('projectId') || undefined;
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const limit = Math.min(50, Math.max(1, parseInt(searchParams.get('limit') || '20', 10)));

    const result = await agentExecutionRepository.findByOrgId(tenantId, {
      status,
      agentId,
      projectId,
    }, page, limit);

    return jsonSuccess(result);
  } catch (error) {
    const { status, body } = handleError(error);
    return jsonError(body.error.code, body.error.message, status);
  }
}
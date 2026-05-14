/**
 * Agent API (Web UI) - Single Agent CRUD
 *
 * GET    /api/agents/[id] - Get agent
 * PATCH  /api/agents/[id] - Update agent
 * DELETE /api/agents/[id] - Delete agent
 */

import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { extractAuthenticatedTenant, requireRole } from '@/shared/http/auth.helpers';
import { jsonSuccess, jsonNotFound, jsonError } from '@/shared/http/responses';
import { handleError } from '@/shared/errors';
import { agentRepository } from '@/infra/adapters/prisma';

export const dynamic = 'force-dynamic';

const updateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  type: z.enum(['RUNNER', 'REVIEWER', 'CUSTOM']).optional(),
  tool: z.string().max(50).optional(),
  workdir: z.string().optional(),
  projectId: z.string().uuid().nullable().optional(),
  config: z.record(z.string(), z.unknown()).optional(),
});

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const { tenantId } = await extractAuthenticatedTenant(supabase);
    const { id } = await params;

    const agent = await agentRepository.findById(id);
    if (!agent || agent.orgId !== tenantId) {
      return jsonNotFound('Agent');
    }
    return jsonSuccess(agent);
  } catch (error) {
    const { status, body } = handleError(error);
    return jsonError(body.error.code, body.error.message, status);
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const { tenantId, userId } = await extractAuthenticatedTenant(supabase);
    await requireRole(supabase, userId, ['OWNER', 'ADMIN'], tenantId);
    const { id } = await params;

    const agent = await agentRepository.findById(id);
    if (!agent || agent.orgId !== tenantId) {
      return jsonNotFound('Agent');
    }

    const body = await request.json();
    const data = updateSchema.parse(body);
    const updated = await agentRepository.update(id, data);
    return jsonSuccess(updated);
  } catch (error) {
    const { status, body } = handleError(error);
    return jsonError(body.error.code, body.error.message, status);
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const { tenantId, userId } = await extractAuthenticatedTenant(supabase);
    await requireRole(supabase, userId, ['OWNER', 'ADMIN'], tenantId);
    const { id } = await params;

    const agent = await agentRepository.findById(id);
    if (!agent || agent.orgId !== tenantId) {
      return jsonNotFound('Agent');
    }

    await agentRepository.delete(id);
    return jsonSuccess({ deleted: true });
  } catch (error) {
    const { status, body } = handleError(error);
    return jsonError(body.error.code, body.error.message, status);
  }
}
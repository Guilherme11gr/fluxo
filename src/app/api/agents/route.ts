/**
 * Agents API (Web UI)
 *
 * GET  /api/agents - List agents for current org
 * POST /api/agents - Register a new agent
 */

import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { extractAuthenticatedTenant, requireRole } from '@/shared/http/auth.helpers';
import { jsonSuccess, jsonError } from '@/shared/http/responses';
import { handleError } from '@/shared/errors';
import { agentRepository } from '@/infra/adapters/prisma';
import { Prisma } from '@prisma/client';

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
    const supabase = await createClient();
    const { tenantId } = await extractAuthenticatedTenant(supabase);
    const agents = await agentRepository.findByOrgId(tenantId);
    return jsonSuccess(agents);
  } catch (error) {
    const { status, body } = handleError(error);
    return jsonError(body.error.code, body.error.message, status);
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { tenantId, userId } = await extractAuthenticatedTenant(supabase);
    await requireRole(supabase, userId, ['OWNER', 'ADMIN'], tenantId);

    const body = await request.json();
    const data = createSchema.parse(body);

    const existing = await agentRepository.findByName(tenantId, data.name);
    if (existing) {
      return jsonError('CONFLICT', 'Já existe um agent com esse nome', 409);
    }

    const agent = await agentRepository.create({
      orgId: tenantId,
      name: data.name,
      type: data.type,
      tool: data.tool,
      workdir: data.workdir,
      config: data.config,
      createdBy: userId,
    });

    return jsonSuccess(agent, { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return jsonError('CONFLICT', 'Já existe um agent com esse nome', 409);
    }
    const { status, body } = handleError(error);
    return jsonError(body.error.code, body.error.message, status);
  }
}
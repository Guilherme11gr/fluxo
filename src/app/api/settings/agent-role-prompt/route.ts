import { createClient } from '@/lib/supabase/server';
import { extractAuthenticatedTenant, requireRole } from '@/shared/http/auth.helpers';
import { jsonSuccess, jsonError } from '@/shared/http/responses';
import { handleError } from '@/shared/errors';
import { prisma } from '@/infra/adapters/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const authClient = await createClient();
    const { userId, tenantId } = await extractAuthenticatedTenant(authClient);

    await requireRole(authClient, userId, ['OWNER'], tenantId);

    const org = await prisma.organization.findUnique({
      where: { id: tenantId },
      select: { defaultAgentRolePrompt: true },
    });

    return jsonSuccess({ prompt: org?.defaultAgentRolePrompt || null });
  } catch (error) {
    const { status, body } = handleError(error);
    return jsonError(body.error.code, body.error.message, status);
  }
}

export async function PATCH(request: Request) {
  try {
    const authClient = await createClient();
    const { userId, tenantId } = await extractAuthenticatedTenant(authClient);

    await requireRole(authClient, userId, ['OWNER'], tenantId);

    const body = (await request.json()) as Record<string, unknown>;
    const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : '';

    if (prompt.length > 2000) {
      return jsonError('VALIDATION_ERROR', 'O prompt deve ter no máximo 2000 caracteres.', 400);
    }

    await prisma.organization.update({
      where: { id: tenantId },
      data: { defaultAgentRolePrompt: prompt || null },
    });

    return jsonSuccess({ prompt: prompt || null });
  } catch (error) {
    const { status, body } = handleError(error);
    return jsonError(body.error.code, body.error.message, status);
  }
}

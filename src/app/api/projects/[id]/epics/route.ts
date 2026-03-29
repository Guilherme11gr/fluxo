import { NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { extractAuthenticatedTenant, extractUserId } from '@/shared/http/auth.helpers';
import { jsonSuccess, jsonError } from '@/shared/http/responses';
import { handleError } from '@/shared/errors';
import { projectRepository, epicRepository, userProfileRepository } from '@/infra/adapters/prisma';
import { getProjectById } from '@/domain/use-cases/projects/get-project-by-id';
import { getEpics } from '@/domain/use-cases/epics/get-epics';
import { createEpic } from '@/domain/use-cases/epics/create-epic';
import { broadcastEpicEvent } from '@/lib/supabase/broadcast';
import { z } from 'zod';

const createEpicSchema = z.object({
  title: z.string().min(3).max(200),
  description: z.string().max(5000).nullable().optional(),
  status: z.enum(['OPEN', 'CLOSED']).default('OPEN'),
});

/**
 * GET /api/projects/:id/epics
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: projectId } = await params;
    const supabase = await createClient();
    const { tenantId } = await extractAuthenticatedTenant(supabase);

    await getProjectById(projectId, tenantId, { projectRepository });
    const epics = await getEpics(projectId, tenantId, { epicRepository });
    // Private cache (browser only) - org-specific data MUST NOT be cached by CDN
    return jsonSuccess(epics, { private: true });

  } catch (error) {
    const { status, body } = handleError(error);
    return jsonError(body.error.code, body.error.message, status);
  }
}

/**
 * POST /api/projects/:id/epics
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: projectId } = await params;
    const supabase = await createClient();
    const { tenantId } = await extractAuthenticatedTenant(supabase);
    const userId = await extractUserId(supabase);

    await getProjectById(projectId, tenantId, { projectRepository });

    const body = await request.json();
    const parsed = createEpicSchema.safeParse(body);
    if (!parsed.success) {
      return jsonError('VALIDATION_ERROR', 'Dados inválidos', 400, {
        errors: parsed.error.flatten().fieldErrors,
      } as Record<string, unknown>);
    }

    const epic = await createEpic({ orgId: tenantId, projectId, ...parsed.data }, { epicRepository });

    // Broadcast for real-time updates
    const userProfile = await userProfileRepository.findByIdGlobal(userId);
    await broadcastEpicEvent(
      tenantId,
      projectId,
      'created',
      epic.id,
      {
        type: 'user',
        name: userProfile?.displayName || 'Unknown',
        id: userId,
      }
    );

    return jsonSuccess(epic, { status: 201 });

  } catch (error) {
    const { status, body } = handleError(error);
    return jsonError(body.error.code, body.error.message, status, body.error.details as Record<string, unknown>);
  }
}

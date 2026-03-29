import { NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { extractAuthenticatedTenant, extractUserId } from '@/shared/http/auth.helpers';
import { jsonSuccess, jsonError } from '@/shared/http/responses';
import { handleError } from '@/shared/errors';
import { epicRepository, userProfileRepository } from '@/infra/adapters/prisma';
import { getEpicById } from '@/domain/use-cases/epics/get-epic-by-id';
import { updateEpic } from '@/domain/use-cases/epics/update-epic';
import { deleteEpic } from '@/domain/use-cases/epics/delete-epic';
import { broadcastEpicEvent } from '@/lib/supabase/broadcast';
import { z } from 'zod';

const updateEpicSchema = z.object({
  title: z.string().min(3).max(200).optional(),
  description: z.string().max(5000).nullable().optional(),
  status: z.enum(['OPEN', 'CLOSED']).optional(),
});

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const { tenantId } = await extractAuthenticatedTenant(supabase);

    const epic = await getEpicById(id, tenantId, { epicRepository });
    // Private cache (browser only) - org-specific data MUST NOT be cached by CDN
    return jsonSuccess(epic, { private: true });

  } catch (error) {
    const { status, body } = handleError(error);
    return jsonError(body.error.code, body.error.message, status);
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const { tenantId } = await extractAuthenticatedTenant(supabase);

    const body = await request.json();
    if (!body || Object.keys(body).length === 0) {
      return jsonError('VALIDATION_ERROR', 'Nenhum campo fornecido para atualizar', 400);
    }

    const parsed = updateEpicSchema.safeParse(body);
    if (!parsed.success) {
      return jsonError('VALIDATION_ERROR', 'Dados inválidos', 400, {
        errors: parsed.error.flatten().fieldErrors,
      } as Record<string, unknown>);
    }

    const epic = await updateEpic(id, tenantId, parsed.data, { epicRepository });

    // Broadcast event for real-time updates
    const userId = await extractUserId(supabase);
    const userProfile = await userProfileRepository.findByIdGlobal(userId);
    await broadcastEpicEvent(
      tenantId,
      epic.projectId,
      'updated',
      epic.id,
      {
        type: 'user',
        name: userProfile?.displayName || 'Unknown',
        id: userId,
      }
    );

    return jsonSuccess(epic);

  } catch (error) {
    const { status, body } = handleError(error);
    return jsonError(body.error.code, body.error.message, status, body.error.details as Record<string, unknown>);
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const { tenantId } = await extractAuthenticatedTenant(supabase);
    const userId = await extractUserId(supabase);

    // Get epic before deletion for broadcast
    const epic = await epicRepository.findById(id, tenantId);
    if (!epic) {
      return jsonError('NOT_FOUND', 'Epic não encontrado', 404);
    }

    await deleteEpic(id, tenantId, { epicRepository });

    // Broadcast deletion event
    const userProfile = await userProfileRepository.findByIdGlobal(userId);
    await broadcastEpicEvent(
      tenantId,
      epic.projectId,
      'deleted',
      id,
      {
        type: 'user',
        name: userProfile?.displayName || 'Unknown',
        id: userId,
      }
    );

    return new Response(null, { status: 204 });

  } catch (error) {
    const { status, body } = handleError(error);
    return jsonError(body.error.code, body.error.message, status);
  }
}

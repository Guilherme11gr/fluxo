import { NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { extractAuthenticatedTenant, extractUserId } from '@/shared/http/auth.helpers';
import { jsonSuccess, jsonError } from '@/shared/http/responses';
import { handleError } from '@/shared/errors';
import { featureRepository, userProfileRepository, epicRepository } from '@/infra/adapters/prisma';
import { updateFeature } from '@/domain/use-cases/features/update-feature';
import { deleteFeature } from '@/domain/use-cases/features/delete-feature';
import { broadcastFeatureEvent } from '@/lib/supabase/broadcast';
import { z } from 'zod';

const updateFeatureSchema = z.object({
  title: z.string().min(3).max(200).optional(),
  description: z.string().max(5000).nullable().optional(),
  status: z.enum(['BACKLOG', 'TODO', 'DOING', 'DONE']).optional(),
});

/**
 * GET /api/features/[id] - Get feature with relations
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const { tenantId } = await extractAuthenticatedTenant(supabase);

    const feature = await featureRepository.findByIdWithRelations(id, tenantId);
    if (!feature) {
      return jsonError('NOT_FOUND', 'Feature não encontrada', 404);
    }
    return jsonSuccess(feature);

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

    const parsed = updateFeatureSchema.safeParse(body);
    if (!parsed.success) {
      return jsonError('VALIDATION_ERROR', 'Dados inválidos', 400, {
        errors: parsed.error.flatten().fieldErrors,
      } as Record<string, unknown>);
    }

    const feature = await updateFeature(id, tenantId, parsed.data, { featureRepository });

    // Broadcast event for real-time updates
    const userId = await extractUserId(supabase);
    const userProfile = await userProfileRepository.findByIdGlobal(userId);
    
    // Get epic to retrieve projectId
    const epic = await epicRepository.findByIdWithProject(feature.epicId, tenantId);
    if (!epic) {
      return jsonError('NOT_FOUND', 'Epic não encontrado', 404);
    }
    
    await broadcastFeatureEvent(
      tenantId,
      epic.projectId,
      'updated',
      feature.id,
      {
        type: 'user',
        name: userProfile?.displayName || 'Unknown',
        id: userId,
      },
      { epicId: feature.epicId }
    );

    return jsonSuccess(feature);

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

    // Get feature before deletion for broadcast
    const feature = await featureRepository.findById(id, tenantId);
    if (!feature) {
      return jsonError('NOT_FOUND', 'Feature não encontrada', 404);
    }

    await deleteFeature(id, tenantId, { featureRepository });

    // Broadcast deletion event
    const userProfile = await userProfileRepository.findByIdGlobal(userId);
    
    // Get epic to retrieve projectId
    const epic = await epicRepository.findByIdWithProject(feature.epicId, tenantId);
    if (!epic) {
      return jsonError('NOT_FOUND', 'Epic não encontrado', 404);
    }
    
    await broadcastFeatureEvent(
      tenantId,
      epic.projectId,
      'deleted',
      id,
      {
        type: 'user',
        name: userProfile?.displayName || 'Unknown',
        id: userId,
      },
      { epicId: feature.epicId }
    );

    return new Response(null, { status: 204 });

  } catch (error) {
    const { status, body } = handleError(error);
    return jsonError(body.error.code, body.error.message, status);
  }
}

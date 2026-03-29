import { NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { extractAuthenticatedTenant, extractUserId } from '@/shared/http/auth.helpers';
import { jsonSuccess, jsonError } from '@/shared/http/responses';
import { handleError } from '@/shared/errors';
import { taskRepository, auditLogRepository, userProfileRepository } from '@/infra/adapters/prisma';
import { updateTask } from '@/domain/use-cases/tasks/update-task';
import { deleteTask } from '@/domain/use-cases/tasks/delete-task';
import { broadcastTaskEvent } from '@/lib/supabase/broadcast';
import type { StoryPoints } from '@/shared/types';
import { updateTaskSchema } from '@/shared/utils';

/**
 * GET /api/tasks/[id] - Get task with relations
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const { tenantId } = await extractAuthenticatedTenant(supabase);

    const task = await taskRepository.findByIdWithRelations(id, tenantId);
    if (!task) {
      return jsonError('NOT_FOUND', 'Task não encontrada', 404);
    }
    return jsonSuccess(task);

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
    const userId = await extractUserId(supabase);

    const body = await request.json();
    if (!body || Object.keys(body).length === 0) {
      return jsonError('VALIDATION_ERROR', 'Nenhum campo fornecido para atualizar', 400);
    }

    const parsed = updateTaskSchema.safeParse(body);
    if (!parsed.success) {
      return jsonError('VALIDATION_ERROR', 'Dados inválidos', 400, {
        errors: parsed.error.flatten().fieldErrors,
      } as Record<string, unknown>);
    }

    const task = await updateTask(id, tenantId, userId, {
      ...parsed.data,
      points: parsed.data.points as StoryPoints | null | undefined,
    }, { taskRepository, auditLogRepository });

    // Broadcast event for real-time updates
    const userProfile = await userProfileRepository.findByIdGlobal(userId);
    await broadcastTaskEvent(
      tenantId,
      task.projectId,
      body.status !== undefined && body.status !== task.status ? 'status_changed' : 'updated',
      task.id,
      {
        type: 'user',
        name: userProfile?.displayName || 'Unknown',
        id: userId,
      },
      {
        featureId: task.featureId,
        previousStatus: body.status !== undefined ? task.status : undefined,
        newStatus: body.status !== undefined ? body.status : undefined,
      }
    );

    return jsonSuccess(task);

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

    // Get task before deletion for broadcast
    const task = await taskRepository.findById(id, tenantId);
    if (!task) {
      return jsonError('NOT_FOUND', 'Task não encontrada', 404);
    }

    await deleteTask(id, tenantId, { taskRepository });

    // Broadcast deletion event
    const userProfile = await userProfileRepository.findByIdGlobal(userId);
    await broadcastTaskEvent(
      tenantId,
      task.projectId,
      'deleted',
      id,
      {
        type: 'user',
        name: userProfile?.displayName || 'Unknown',
        id: userId,
      },
      { featureId: task.featureId }
    );

    return new Response(null, { status: 204 });

  } catch (error) {
    const { status, body } = handleError(error);
    return jsonError(body.error.code, body.error.message, status);
  }
}

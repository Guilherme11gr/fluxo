import { NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { extractAuthenticatedTenant, extractUserId } from '@/shared/http/auth.helpers';
import { jsonSuccess, jsonError } from '@/shared/http/responses';
import { handleError } from '@/shared/errors';
import { taskRepository, auditLogRepository, userProfileRepository } from '@/infra/adapters/prisma';
import { updateTaskStatus } from '@/domain/use-cases/tasks/update-task-status';
import { broadcastTaskEvent } from '@/lib/supabase/broadcast';
import { z } from 'zod';

const updateStatusSchema = z.object({
  status: z.enum(['BACKLOG', 'TODO', 'DOING', 'REVIEW', 'QA_READY', 'DONE']),
});

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
    const parsed = updateStatusSchema.safeParse(body);

    if (!parsed.success) {
      return jsonError('VALIDATION_ERROR', 'Dados inválidos', 400, {
        errors: parsed.error.flatten().fieldErrors,
      } as Record<string, unknown>);
    }

    const task = await updateTaskStatus(
      id,
      tenantId,
      parsed.data.status,
      userId,
      { taskRepository, auditLogRepository }
    );

    // Broadcast for real-time updates
    const userProfile = await userProfileRepository.findByIdGlobal(userId);
    await broadcastTaskEvent(
      tenantId,
      task.projectId,
      'updated',
      id,
      {
        type: 'user',
        name: userProfile?.displayName || 'Unknown',
        id: userId,
      },
      { featureId: task.featureId }
    );

    return jsonSuccess(task);

  } catch (error) {
    const { status, body } = handleError(error);
    return jsonError(body.error.code, body.error.message, status, body.error.details as Record<string, unknown>);
  }
}

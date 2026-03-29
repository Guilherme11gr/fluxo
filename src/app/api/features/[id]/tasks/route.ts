import { NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { extractAuthenticatedTenant } from '@/shared/http/auth.helpers';
import { jsonSuccess, jsonError } from '@/shared/http/responses';
import { handleError } from '@/shared/errors';
import { taskRepository, featureRepository } from '@/infra/adapters/prisma';
import { getTasksByFeature } from '@/domain/use-cases/tasks/get-tasks-by-feature';
import { createTask } from '@/domain/use-cases/tasks/create-task';
import type { StoryPoints } from '@/shared/types';
import { createTaskSchema } from '@/shared/utils';

// Schema for this endpoint omits featureId (comes from URL path)
const createTaskForFeatureSchema = createTaskSchema.omit({ featureId: true });

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: featureId } = await params;
    const supabase = await createClient();
    const { tenantId } = await extractAuthenticatedTenant(supabase);

    const tasks = await getTasksByFeature(featureId, tenantId, { taskRepository });
    // Private cache (browser only) - org-specific data MUST NOT be cached by CDN
    return jsonSuccess(tasks, { private: true });

  } catch (error) {
    const { status, body } = handleError(error);
    return jsonError(body.error.code, body.error.message, status);
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: featureId } = await params;
    const supabase = await createClient();
    const { tenantId } = await extractAuthenticatedTenant(supabase);

    const body = await request.json();
    const parsed = createTaskForFeatureSchema.safeParse(body);
    if (!parsed.success) {
      return jsonError('VALIDATION_ERROR', 'Dados inválidos', 400, {
        errors: parsed.error.flatten().fieldErrors,
      } as Record<string, unknown>);
    }

    // Task requires projectId. We resolve it from the feature.
    const feature = await featureRepository.findByIdWithBreadcrumb(featureId, tenantId);
    if (!feature) {
      return jsonError('NOT_FOUND', 'Feature não encontrada', 404);
    }
    const projectId = feature.epic.projectId;

    const task = await createTask({
      orgId: tenantId,
      ...parsed.data,
      projectId,
      featureId, // Override any featureId from body with URL param
      points: parsed.data.points as StoryPoints | null | undefined,
    }, { taskRepository, featureRepository });
    return jsonSuccess(task, { status: 201 });

  } catch (error) {
    const { status, body } = handleError(error);
    return jsonError(body.error.code, body.error.message, status, body.error.details as Record<string, unknown>);
  }
}

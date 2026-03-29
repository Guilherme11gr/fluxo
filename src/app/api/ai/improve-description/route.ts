import { NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';

import { createClient } from '@/lib/supabase/server';
import { extractAuthenticatedTenant } from '@/shared/http/auth.helpers';
import { jsonSuccess, jsonError } from '@/shared/http/responses';
import { handleError } from '@/shared/errors';
import { taskRepository, featureRepository, projectDocRepository } from '@/infra/adapters/prisma';
import { aiAdapter } from '@/infra/adapters/ai';
import { improveTaskDescription } from '@/domain/use-cases/ai';
import { z } from 'zod';

const improveDescriptionSchema = z.object({
    taskId: z.string().uuid('ID da task inválido'),
    includeProjectDocs: z.boolean().optional().default(false),
    docIds: z.array(z.string().uuid()).optional(),
});

/**
 * POST /api/ai/improve-description
 * 
 * Uses AI to generate an improved task description based on context.
 * Returns the improved description without modifying the task.
 */
export async function POST(request: NextRequest) {
    try {
        const supabase = await createClient();
        const { tenantId } = await extractAuthenticatedTenant(supabase);

        const body = await request.json();
        const parsed = improveDescriptionSchema.safeParse(body);

        if (!parsed.success) {
            return jsonError('VALIDATION_ERROR', 'Dados inválidos', 400, {
                errors: parsed.error.flatten().fieldErrors,
            } as Record<string, unknown>);
        }

        const { taskId, includeProjectDocs, docIds } = parsed.data;

        // 1. Fetch task with relations (includes feature.title)
        const task = await taskRepository.findByIdWithRelations(taskId, tenantId);
        if (!task) {
            return jsonError('NOT_FOUND', 'Task não encontrada', 404);
        }

        // 2. Fetch feature description (not included in task relations by default)
        const feature = await featureRepository.findById(task.featureId, tenantId);

        // 3. Fetch project docs - specific IDs or all
        let projectDocs: Array<{ title: string; content: string }> | undefined;

        if (docIds && docIds.length > 0) {
            projectDocs = await projectDocRepository.findByIds(docIds, tenantId);
        } else if (includeProjectDocs) {
            projectDocs = await projectDocRepository.findForAIContext(
                task.projectId,
                tenantId
            );
        }

        // 4. Generate improved description using AI
        const improvedDescription = await improveTaskDescription(
            {
                task,
                featureDescription: feature?.description ?? null,
                projectDocs,
            },
            { aiAdapter }
        );

        return jsonSuccess({
            description: improvedDescription,
            taskId,
        });

    } catch (error) {
        console.error('[AI] Improve description error:', error);
        const { status, body } = handleError(error);
        return jsonError(body.error.code, body.error.message, status);
    }
}

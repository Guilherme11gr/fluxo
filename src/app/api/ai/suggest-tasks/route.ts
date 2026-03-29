import { NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';

import { createClient } from '@/lib/supabase/server';
import { extractAuthenticatedTenant } from '@/shared/http/auth.helpers';
import { jsonSuccess, jsonError } from '@/shared/http/responses';
import { handleError } from '@/shared/errors';
import { featureRepository, projectDocRepository } from '@/infra/adapters/prisma';
import { aiAdapter } from '@/infra/adapters/ai';
import { suggestTasksForFeature } from '@/domain/use-cases/ai';
import { z } from 'zod';

const suggestTasksSchema = z.object({
    featureId: z.string().uuid('ID da feature inválido'),
    includeProjectDocs: z.boolean().optional().default(false),
});

/**
 * POST /api/ai/suggest-tasks
 * 
 * Uses AI to analyze a Feature and suggest child Tasks.
 * Returns structured suggestions for user review before creation.
 */
export async function POST(request: NextRequest) {
    try {
        const supabase = await createClient();
        const { tenantId } = await extractAuthenticatedTenant(supabase);

        const body = await request.json();
        const parsed = suggestTasksSchema.safeParse(body);

        if (!parsed.success) {
            return jsonError('VALIDATION_ERROR', 'Dados inválidos', 400, {
                errors: parsed.error.flatten().fieldErrors,
            } as Record<string, unknown>);
        }

        const { featureId, includeProjectDocs } = parsed.data;

        // 1. Fetch feature with relations
        const feature = await featureRepository.findByIdWithRelations(featureId, tenantId);
        if (!feature) {
            return jsonError('NOT_FOUND', 'Feature não encontrada', 404);
        }

        // 2. Fetch project docs if requested
        let projectDocs: Array<{ title: string; content: string }> | undefined;
        if (includeProjectDocs && feature.epic?.project?.id) {
            projectDocs = await projectDocRepository.findForAIContext(
                feature.epic.project.id,
                tenantId
            );
        }

        // 3. Generate task suggestions using AI
        const suggestions = await suggestTasksForFeature(
            {
                feature: {
                    title: feature.title,
                    description: feature.description,
                    status: feature.status,
                },
                epic: feature.epic ? {
                    title: feature.epic.title,
                    description: null, // Epic description not loaded by default
                } : null,
                projectDocs,
            },
            { aiAdapter }
        );

        return jsonSuccess({
            suggestions,
            featureId,
        });

    } catch (error) {
        console.error('[AI] Suggest tasks error:', error);
        const { status, body } = handleError(error);
        return jsonError(body.error.code, body.error.message, status);
    }
}

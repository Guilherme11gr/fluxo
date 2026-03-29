import { NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';

import { createClient } from '@/lib/supabase/server';
import { extractAuthenticatedTenant } from '@/shared/http/auth.helpers';
import { jsonSuccess, jsonError } from '@/shared/http/responses';
import { handleError } from '@/shared/errors';
import { featureRepository, epicRepository, projectDocRepository } from '@/infra/adapters/prisma';
import { aiAdapter } from '@/infra/adapters/ai';
import { improveFeatureDescription } from '@/domain/use-cases/ai';
import { z } from 'zod';

const improveFeatureDescriptionSchema = z.object({
    featureId: z.string().uuid('ID da feature inválido').optional(),
    title: z.string().min(1, 'Título é obrigatório'),
    description: z.string().optional(),
    epicId: z.string().uuid('ID do epic inválido').optional(),
    includeProjectDocs: z.boolean().optional().default(false),
    docIds: z.array(z.string().uuid()).optional(),
});

/**
 * POST /api/ai/improve-feature-description
 * 
 * Uses AI to generate or improve a Feature description.
 * Can be used with existing feature (featureId) or inline data (title + epicId).
 */
export async function POST(request: NextRequest) {
    try {
        const supabase = await createClient();
        const { tenantId } = await extractAuthenticatedTenant(supabase);

        const body = await request.json();
        const parsed = improveFeatureDescriptionSchema.safeParse(body);

        if (!parsed.success) {
            return jsonError('VALIDATION_ERROR', 'Dados inválidos', 400, {
                errors: parsed.error.flatten().fieldErrors,
            } as Record<string, unknown>);
        }

        const { featureId, title, description, epicId, includeProjectDocs, docIds } = parsed.data;

        let featureData = { title, description: description || null };
        let epicData: { title: string; description: string | null } | null = null;
        let projectId: string | null = null;

        // If featureId provided, fetch feature and epic data
        if (featureId) {
            const feature = await featureRepository.findByIdWithRelations(featureId, tenantId);
            if (!feature) {
                return jsonError('NOT_FOUND', 'Feature não encontrada', 404);
            }
            featureData = { title: feature.title, description: feature.description };
            if (feature.epic) {
                epicData = { title: feature.epic.title, description: null };
                projectId = feature.epic.project?.id || null;
            }
        } else if (epicId) {
            // Fetch epic data for context
            const epic = await epicRepository.findById(epicId, tenantId);
            if (epic) {
                epicData = { title: epic.title, description: epic.description };
                projectId = epic.projectId;
            }
        }

        // Fetch project docs - specific IDs or all
        let projectDocs: Array<{ title: string; content: string }> | undefined;

        if (docIds && docIds.length > 0) {
            projectDocs = await projectDocRepository.findByIds(docIds, tenantId);
        } else if (includeProjectDocs && projectId) {
            projectDocs = await projectDocRepository.findForAIContext(projectId, tenantId);
        }

        // Generate improved description using AI
        const improvedDescription = await improveFeatureDescription(
            {
                feature: featureData,
                epic: epicData,
                projectDocs,
            },
            { aiAdapter }
        );

        return jsonSuccess({
            description: improvedDescription,
            featureId: featureId || null,
        });

    } catch (error) {
        console.error('[AI] Improve feature description error:', error);
        const { status, body } = handleError(error);
        return jsonError(body.error.code, body.error.message, status);
    }
}

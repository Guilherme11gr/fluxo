import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

import { createClient } from '@/lib/supabase/server';
import { extractAuthenticatedTenant } from '@/shared/http/auth.helpers';
import { jsonSuccess, jsonError } from '@/shared/http/responses';
import { handleError } from '@/shared/errors';
import { featureRepository, projectDocRepository } from '@/infra/adapters/prisma';
import { aiAdapter } from '@/infra/adapters/ai';
import { generateTaskDescription, generateTaskDescriptionStream } from '@/domain/use-cases/ai';
import { z } from 'zod';

const generateDescriptionSchema = z.object({
    title: z.string().min(1, 'Título é obrigatório'),
    featureId: z.string().uuid('ID da feature inválido'),
    currentDescription: z.string().optional(),
    type: z.enum(['TASK', 'BUG']).optional(),
    priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).optional(),
    includeProjectDocs: z.boolean().optional().default(false),
    docIds: z.array(z.string().uuid()).optional(),
    projectId: z.string().uuid('ID do projeto inválido').optional(),
    stream: z.boolean().optional().default(false), // JKILL-224: Streaming support
});

/**
 * Converts an AsyncGenerator<string> into a ReadableStream
 */
function iteratorToStream(iterator: AsyncGenerator<string>) {
    return new ReadableStream({
        async start(controller) {
            try {
                for await (const chunk of iterator) {
                    controller.enqueue(new TextEncoder().encode(chunk));
                }
                controller.close();
            } catch (e) {
                console.error('Stream error:', e);
                controller.error(e);
            }
        },
    });
}

/**
 * POST /api/ai/generate-description
 *
 * Generates a task description using AI without needing an existing task.
 * Used when creating new tasks or editing tasks before they're saved.
 *
 * JKILL-224: Now supports streaming by passing stream=true in the request body.
 * When streaming, returns a text/plain response with the content chunks.
 * When not streaming, returns JSON with the complete description.
 */
export async function POST(request: NextRequest) {
    try {
        const supabase = await createClient();
        const { tenantId } = await extractAuthenticatedTenant(supabase);

        const body = await request.json();
        const parsed = generateDescriptionSchema.safeParse(body);

        if (!parsed.success) {
            return jsonError('VALIDATION_ERROR', 'Dados inválidos', 400, {
                errors: parsed.error.flatten().fieldErrors,
            } as Record<string, unknown>);
        }

        const { title, featureId, currentDescription, type, priority, includeProjectDocs, docIds, projectId: providedProjectId, stream } = parsed.data;

        // Fetch feature for context (with breadcrumb to get projectId if needed)
        const feature = includeProjectDocs && !providedProjectId
            ? await featureRepository.findByIdWithBreadcrumb(featureId, tenantId)
            : await featureRepository.findById(featureId, tenantId);

        if (!feature) {
            return jsonError('NOT_FOUND', 'Feature não encontrada', 404);
        }

        // Resolve project ID and fetch docs
        let projectDocs: Array<{ title: string; content: string }> | undefined;

        // If specific docIds provided, use those
        if (docIds && docIds.length > 0) {
            projectDocs = await projectDocRepository.findByIds(docIds, tenantId);
        } else if (includeProjectDocs) {
            // Fallback to all docs if includeProjectDocs is true
            let resolvedProjectId = providedProjectId;
            if (!resolvedProjectId && 'epic' in feature) {
                const featureWithEpic = feature as { epic: { projectId: string } };
                resolvedProjectId = featureWithEpic.epic.projectId;
            }
            if (resolvedProjectId) {
                projectDocs = await projectDocRepository.findForAIContext(
                    resolvedProjectId,
                    tenantId
                );
            }
        }

        const input = {
            title,
            type,
            priority,
            currentDescription,
            feature: {
                title: feature.title,
                description: feature.description,
            },
            projectDocs,
        };

        // JKILL-224: Streaming support
        if (stream) {
            const streamGenerator = await generateTaskDescriptionStream(input, { aiAdapter });
            const readableStream = iteratorToStream(streamGenerator);

            return new NextResponse(readableStream, {
                headers: {
                    'Content-Type': 'text/plain; charset=utf-8',
                    'X-Content-Type-Options': 'nosniff',
                },
            });
        }

        // Non-streaming: Generate description using AI (original behavior)
        const description = await generateTaskDescription(input, { aiAdapter });

        return jsonSuccess({
            description,
            featureId,
        });

    } catch (error) {
        console.error('[AI] Generate description error:', error);
        const { status, body } = handleError(error);
        return jsonError(body.error.code, body.error.message, status);
    }
}

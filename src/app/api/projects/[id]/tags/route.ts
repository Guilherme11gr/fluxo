/**
 * Project Tags API Routes
 * POST /api/projects/[id]/tags - Create new tag
 * GET /api/projects/[id]/tags - List project tags
 */
import { NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { extractAuthenticatedTenant } from '@/shared/http/auth.helpers';
import { jsonSuccess, jsonError } from '@/shared/http/responses';
import { handleError } from '@/shared/errors';
import { docTagRepository, projectRepository } from '@/infra/adapters/prisma';
import { createTag } from '@/domain/use-cases/tags/create-tag';
import { listTags } from '@/domain/use-cases/tags/list-tags';
import { z } from 'zod';

const createTagSchema = z.object({
    name: z.string().trim().min(1, 'Nome da tag é obrigatório').max(50, 'Nome muito longo'),
});

/**
 * POST /api/projects/[id]/tags
 * Create a new tag for the project
 */
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id: projectId } = await params;
        const supabase = await createClient();
        const { tenantId } = await extractAuthenticatedTenant(supabase);

        // Verify project exists and belongs to org
        const project = await projectRepository.findById(projectId, tenantId);
        if (!project) {
            return jsonError('NOT_FOUND', 'Projeto não encontrado', 404);
        }

        const body = await request.json();
        const parsed = createTagSchema.safeParse(body);

        if (!parsed.success) {
            return jsonError('VALIDATION_ERROR', 'Dados inválidos', 400, {
                errors: parsed.error.flatten().fieldErrors,
            });
        }

        const tag = await createTag(
            { name: parsed.data.name, projectId, orgId: tenantId },
            { docTagRepository }
        );

        return jsonSuccess(tag, { status: 201 });
    } catch (error) {
        const { status, body } = handleError(error);
        return jsonError(body.error.code, body.error.message, status, body.error.details as Record<string, unknown>);
    }
}

/**
 * GET /api/projects/[id]/tags
 * List all tags for the project with document counts
 */
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id: projectId } = await params;
        const supabase = await createClient();
        const { tenantId } = await extractAuthenticatedTenant(supabase);

        // Verify project exists and belongs to org
        const project = await projectRepository.findById(projectId, tenantId);
        if (!project) {
            return jsonError('NOT_FOUND', 'Projeto não encontrado', 404);
        }

        const tags = await listTags(projectId, tenantId, { docTagRepository });
        return jsonSuccess(tags);
    } catch (error) {
        const { status, body } = handleError(error);
        return jsonError(body.error.code, body.error.message, status);
    }
}

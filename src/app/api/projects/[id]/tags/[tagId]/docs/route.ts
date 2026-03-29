/**
 * Documents by Tag API Route
 * GET /api/projects/[id]/tags/[tagId]/docs - List documents with tag
 */
import { NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { extractAuthenticatedTenant } from '@/shared/http/auth.helpers';
import { jsonSuccess, jsonError } from '@/shared/http/responses';
import { handleError } from '@/shared/errors';
import { docTagRepository, projectDocRepository, projectRepository } from '@/infra/adapters/prisma';
import { getDocsByTag } from '@/domain/use-cases/tags/get-docs-by-tag';

/**
 * GET /api/projects/[id]/tags/[tagId]/docs
 * Get all documents that have a specific tag
 */
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string; tagId: string }> }
) {
    try {
        const { id: projectId, tagId } = await params;
        const supabase = await createClient();
        const { tenantId } = await extractAuthenticatedTenant(supabase);

        // Verify project exists and belongs to org
        const project = await projectRepository.findById(projectId, tenantId);
        if (!project) {
            return jsonError('NOT_FOUND', 'Projeto não encontrado', 404);
        }

        const docs = await getDocsByTag(tagId, projectId, tenantId, { docTagRepository, projectDocRepository });
        return jsonSuccess(docs);
    } catch (error) {
        const { status, body } = handleError(error);
        return jsonError(body.error.code, body.error.message, status);
    }
}

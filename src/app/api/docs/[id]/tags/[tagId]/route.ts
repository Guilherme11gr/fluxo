/**
 * Document Tag Removal API Route
 * DELETE /api/docs/[id]/tags/[tagId] - Remove tag from document
 */
import { NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { extractAuthenticatedTenant } from '@/shared/http/auth.helpers';
import { jsonSuccess, jsonError } from '@/shared/http/responses';
import { handleError } from '@/shared/errors';
import { docTagRepository, projectDocRepository } from '@/infra/adapters/prisma';
import { unassignTag } from '@/domain/use-cases/tags/unassign-tag';

/**
 * DELETE /api/docs/[id]/tags/[tagId]
 * Remove a specific tag from a document
 */
export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ id: string; tagId: string }> }
) {
    try {
        const { id: docId, tagId } = await params;
        const supabase = await createClient();
        const { tenantId } = await extractAuthenticatedTenant(supabase);

        const tags = await unassignTag(
            { docId, tagId, orgId: tenantId },
            { docTagRepository, projectDocRepository }
        );

        return jsonSuccess(tags);
    } catch (error) {
        const { status, body } = handleError(error);
        return jsonError(body.error.code, body.error.message, status);
    }
}

/**
 * Tag Delete API Route
 * DELETE /api/tags/[id] - Delete a tag
 */
import { NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { extractAuthenticatedTenant } from '@/shared/http/auth.helpers';
import { jsonError } from '@/shared/http/responses';
import { handleError } from '@/shared/errors';
import { docTagRepository } from '@/infra/adapters/prisma';
import { deleteTag } from '@/domain/use-cases/tags/delete-tag';

/**
 * DELETE /api/tags/[id]
 * Delete a tag and cascade to all assignments
 */
export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id: tagId } = await params;
        const supabase = await createClient();
        const { tenantId } = await extractAuthenticatedTenant(supabase);

        await deleteTag(tagId, tenantId, { docTagRepository });
        return new Response(null, { status: 204 });
    } catch (error) {
        const { status, body } = handleError(error);
        return jsonError(body.error.code, body.error.message, status);
    }
}

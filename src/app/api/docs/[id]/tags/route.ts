/**
 * Document Tags API Routes
 * POST /api/docs/[id]/tags - Assign tags to document
 * GET /api/docs/[id]/tags - Get tags for document
 */
import { NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { extractAuthenticatedTenant } from '@/shared/http/auth.helpers';
import { jsonSuccess, jsonError } from '@/shared/http/responses';
import { handleError } from '@/shared/errors';
import { docTagRepository, projectDocRepository } from '@/infra/adapters/prisma';
import { assignTags } from '@/domain/use-cases/tags/assign-tags';
import { getDocTags } from '@/domain/use-cases/tags/get-doc-tags';
import { z } from 'zod';

const assignTagsSchema = z.object({
    tagIds: z.array(z.string().uuid()).min(1, 'Pelo menos uma tag é necessária'),
});

/**
 * POST /api/docs/[id]/tags
 * Assign one or more tags to a document
 */
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id: docId } = await params;
        const supabase = await createClient();
        const { tenantId } = await extractAuthenticatedTenant(supabase);

        const body = await request.json();
        const parsed = assignTagsSchema.safeParse(body);

        if (!parsed.success) {
            return jsonError('VALIDATION_ERROR', 'Dados inválidos', 400, {
                errors: parsed.error.flatten().fieldErrors,
            });
        }

        const tags = await assignTags(
            { docId, tagIds: parsed.data.tagIds, orgId: tenantId },
            { docTagRepository, projectDocRepository }
        );

        return jsonSuccess(tags);
    } catch (error) {
        const { status, body } = handleError(error);
        return jsonError(body.error.code, body.error.message, status, body.error.details as Record<string, unknown>);
    }
}

/**
 * GET /api/docs/[id]/tags
 * Get all tags assigned to a document
 */
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id: docId } = await params;
        const supabase = await createClient();
        const { tenantId } = await extractAuthenticatedTenant(supabase);

        const tags = await getDocTags(docId, tenantId, { docTagRepository, projectDocRepository });
        return jsonSuccess(tags);
    } catch (error) {
        const { status, body } = handleError(error);
        return jsonError(body.error.code, body.error.message, status);
    }
}

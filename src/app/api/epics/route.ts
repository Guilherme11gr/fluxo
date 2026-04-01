import { NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { extractAuthenticatedTenant } from '@/shared/http/auth.helpers';
import { jsonSuccess, jsonError } from '@/shared/http/responses';
import { handleError } from '@/shared/errors';
import { epicRepository } from '@/infra/adapters/prisma';
import { z } from 'zod';

// Disable Next.js cache - data depends on org cookie
export const dynamic = 'force-dynamic';

const epicsQuerySchema = z.object({
    status: z.enum(['OPEN', 'IN_PROGRESS', 'DONE']).optional(),
    projectId: z.string().uuid().optional(),
    search: z.string().optional(),
    limit: z.coerce.number().int().min(1).max(50).default(50),
});

/**
 * GET /api/epics - Get ALL epics in organization
 * Single query, no N+1
 * Query params: status, projectId, search, limit
 */
export async function GET(request: NextRequest) {
    try {
        const supabase = await createClient();
        const { tenantId } = await extractAuthenticatedTenant(supabase);

        const { searchParams } = new URL(request.url);
        const parsed = epicsQuerySchema.safeParse(Object.fromEntries(searchParams));
        if (!parsed.success) {
            return jsonError('INVALID_PARAMS', parsed.error.issues.map(i => i.message).join(', '), 400);
        }

        const { status, projectId, search, limit } = parsed.data;

        let epics;
        if (projectId) {
            epics = await epicRepository.findMany(projectId, tenantId);
        } else {
            epics = await epicRepository.findAllByOrg(tenantId);
        }

        if (status) {
            epics = epics.filter(e => e.status === status);
        }

        if (search) {
            const lowerSearch = search.toLowerCase();
            epics = epics.filter(e =>
                e.title?.toLowerCase().includes(lowerSearch) ||
                e.description?.toLowerCase().includes(lowerSearch)
            );
        }

        return jsonSuccess(epics.slice(0, limit));

    } catch (error) {
        const { status, body } = handleError(error);
        return jsonError(body.error.code, body.error.message, status);
    }
}

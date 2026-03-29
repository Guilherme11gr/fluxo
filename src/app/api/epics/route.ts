import { NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { extractAuthenticatedTenant } from '@/shared/http/auth.helpers';
import { jsonSuccess, jsonError } from '@/shared/http/responses';
import { handleError } from '@/shared/errors';
import { epicRepository } from '@/infra/adapters/prisma';

// Disable Next.js cache - data depends on org cookie
export const dynamic = 'force-dynamic';

/**
 * GET /api/epics - Get ALL epics in organization
 * Single query, no N+1
 */
export async function GET(request: NextRequest) {
    try {
        const supabase = await createClient();
        const { tenantId } = await extractAuthenticatedTenant(supabase);

        const epics = await epicRepository.findAllByOrg(tenantId);
        return jsonSuccess(epics);

    } catch (error) {
        const { status, body } = handleError(error);
        return jsonError(body.error.code, body.error.message, status);
    }
}

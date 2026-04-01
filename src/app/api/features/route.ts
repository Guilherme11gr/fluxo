import { NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { extractAuthenticatedTenant } from '@/shared/http/auth.helpers';
import { jsonSuccess, jsonError } from '@/shared/http/responses';
import { handleError } from '@/shared/errors';
import { featureRepository } from '@/infra/adapters/prisma';
import { z } from 'zod';

// Disable Next.js cache - data depends on org cookie
export const dynamic = 'force-dynamic';

const featuresQuerySchema = z.object({
    epicId: z.string().uuid().optional(),
    status: z.enum(['BACKLOG', 'TODO', 'DOING', 'DONE']).optional(),
    search: z.string().optional(),
    limit: z.coerce.number().int().min(1).max(50).default(50),
});

/**
 * GET /api/features - Get features
 * Query params: epicId, status, search, limit
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { tenantId } = await extractAuthenticatedTenant(supabase);

    const { searchParams } = new URL(request.url);
    const parsed = featuresQuerySchema.safeParse(Object.fromEntries(searchParams));
    if (!parsed.success) {
      return jsonError('INVALID_PARAMS', parsed.error.issues.map(i => i.message).join(', '), 400);
    }

    const { epicId, status, search, limit } = parsed.data;

    let features;
    if (epicId) {
      features = await featureRepository.findManyWithStats(epicId, tenantId);
    } else {
      features = await featureRepository.findAll(tenantId);
    }

    if (status) {
      features = features.filter(f => f.status === status);
    }

    if (search) {
      const lowerSearch = search.toLowerCase();
      features = features.filter(f =>
        f.title?.toLowerCase().includes(lowerSearch) ||
        f.description?.toLowerCase().includes(lowerSearch)
      );
    }

    return jsonSuccess(features.slice(0, limit));

  } catch (error) {
    const { status, body } = handleError(error);
    return jsonError(body.error.code, body.error.message, status);
  }
}

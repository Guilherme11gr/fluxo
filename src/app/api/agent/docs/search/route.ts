/**
 * Agent API - Doc Search
 *
 * GET /api/agent/docs/search - Full-text search across docs content
 *
 * Combines tsvector (Portuguese stemming) with pg_trgm (typo tolerance)
 * in a single query. Results ranked by (ts_rank * 2) + similarity.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { extractAgentAuth } from '@/shared/http/agent-auth';
import { agentError, handleAgentError } from '@/shared/http/agent-responses';
import { docSearchRepository } from '@/infra/adapters/prisma';

export const dynamic = 'force-dynamic';

const searchQuerySchema = z.object({
  q: z.string().min(2, 'Query must be at least 2 characters'),
  projectId: z.string().uuid().optional(),
  limit: z.coerce.number().min(1).max(50).default(10),
});

export async function GET(request: NextRequest) {
  try {
    const { orgId } = await extractAgentAuth();

    const { searchParams } = new URL(request.url);
    const query = searchQuerySchema.safeParse({
      q: searchParams.get('q'),
      projectId: searchParams.get('projectId') || undefined,
      limit: searchParams.get('limit') || 10,
    });

    if (!query.success) {
      return agentError('VALIDATION_ERROR', query.error.issues[0].message, 400);
    }

    const { q, projectId, limit } = query.data;

    const results = await docSearchRepository.search(orgId, q, {
      projectId,
      limit,
    });

    return NextResponse.json({
      success: true,
      data: results,
      meta: { total: results.length, query: q },
    });
  } catch (error) {
    return handleAgentError(error);
  }
}

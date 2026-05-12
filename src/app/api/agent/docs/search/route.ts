/**
 * Agent API - Doc Search
 *
 * GET /api/agent/docs/search - Hybrid search across docs content
 *
 * Uses pg_vector cosine similarity (semantic) + tsvector (keyword)
 * in a single query. Returns top chunks (~500 chars each) instead of
 * full docs to minimize token consumption.
 *
 * Ranking: (ts_rank * 2) + (1 - cosine_distance) * 3
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { extractAgentAuth } from '@/shared/http/agent-auth';
import { agentError, handleAgentError } from '@/shared/http/agent-responses';
import { docChunksRepository } from '@/infra/adapters/prisma';

export const dynamic = 'force-dynamic';

const searchQuerySchema = z.object({
  q: z.string().min(2, 'Query must be at least 2 characters'),
  projectId: z.string().uuid().optional(),
  limit: z.coerce.number().min(1).max(50).default(5),
});

export async function GET(request: NextRequest) {
  try {
    const { orgId } = await extractAgentAuth();

    const { searchParams } = new URL(request.url);
    const query = searchQuerySchema.safeParse({
      q: searchParams.get('q'),
      projectId: searchParams.get('projectId') || undefined,
      limit: searchParams.get('limit') || 5,
    });

    if (!query.success) {
      return agentError('VALIDATION_ERROR', query.error.issues[0].message, 400);
    }

    const { q, projectId, limit } = query.data;

    const results = await docChunksRepository.hybridSearch(orgId, q, {
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

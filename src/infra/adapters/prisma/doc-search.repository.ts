/**
 * DocSearch Repository - Full-text search for project docs
 *
 * Combines two PostgreSQL techniques in a single query:
 * - tsvector + GIN index: semantic matching with Portuguese stemming
 * - pg_trgm: typo tolerance on titles
 *
 * Both run in parallel via OR in the WHERE clause — no fallback, no 2 queries.
 * Ranking: (ts_rank * 2) + similarity — tsvector resolves semantic match,
 * trgm catches typos that tsvector misses.
 */
import type { PrismaClient } from '@prisma/client';
import { Prisma } from '@prisma/client';

export interface DocSearchResult {
  id: string;
  title: string;
  snippet: string;
  rank: number;
  projectId: string;
  updatedAt: Date;
}

export class DocSearchRepository {
  constructor(private prisma: PrismaClient) {}

  /**
   * Unified search: tsvector matching + trgm similarity in one query.
   *
   * The WHERE clause uses OR — both indexes run in parallel:
   *   search_vector @@ query  (semantic match via GIN index)
   *   title % query           (fuzzy match via trgm GIN index)
   *
   * Ranking combines both scores:
   *   (ts_rank * 2) + similarity(title, query)
   *
   * ts_headline extracts a snippet from content when tsvector matched,
   * falls back to content slice when only trgm matched.
   */
  async search(
    orgId: string,
    query: string,
    options?: { projectId?: string; limit?: number }
  ): Promise<DocSearchResult[]> {
    const limit = options?.limit ?? 10;

    const projectFilter = options?.projectId
      ? Prisma.sql`AND d.project_id = ${options.projectId}::uuid`
      : Prisma.empty;

    const tsQuery = `plainto_tsquery('portuguese', '${query.replace(/'/g, "''")}')`;

    return this.prisma.$queryRaw<DocSearchResult[]>`
      SELECT
        d.id,
        d.title,
        CASE
          WHEN d.search_vector @@ plainto_tsquery('portuguese', ${query})
            THEN ts_headline(
              'portuguese',
              d.content,
              plainto_tsquery('portuguese', ${query}),
              'MaxFragments=3, MaxWords=30, MinWords=10, StartSel=<<, StopSel=>>'
            )
          ELSE left(d.content, 300) || '...'
        END as snippet,
        (ts_rank(d.search_vector, plainto_tsquery('portuguese', ${query})) * 2
          + similarity(d.title, ${query})) as rank,
        d.project_id as "projectId",
        d.updated_at as "updatedAt"
      FROM public.project_docs d
      WHERE d.org_id = ${orgId}::uuid
        AND (
          d.search_vector @@ plainto_tsquery('portuguese', ${query})
          OR d.title % ${query}
        )
        ${projectFilter}
      ORDER BY rank DESC
      LIMIT ${limit}
    `;
  }
}

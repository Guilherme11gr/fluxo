/**
 * DocChunks Repository - Manages document chunks with embeddings
 *
 * Handles:
 * - Inserting/updating/deleting chunks for a doc
 * - Hybrid search: tsvector (keyword) + pg_vector cosine similarity (semantic)
 * - Automatic chunking + embedding generation via OpenAI
 */
import type { PrismaClient } from '@prisma/client';
import { Prisma } from '@prisma/client';
import { chunkDoc } from '@/shared/rag/chunking';
import { getEmbeddings } from '@/shared/rag/embedding';

export interface DocChunkSearchResult {
  docId: string;
  docTitle: string;
  projectId: string;
  chunkContent: string;
  chunkIndex: number;
  rank: number;
}

export class DocChunksRepository {
  constructor(private prisma: PrismaClient) {}

  /**
   * Generate chunks + embeddings for a doc and upsert them.
   * Called after doc creation or update.
   *
   * Steps:
   * 1. Chunk the doc content (title + body)
   * 2. Generate embeddings for all chunks via OpenAI
   * 3. Delete old chunks for this doc
   * 4. Insert new chunks with embeddings
   */
  async indexDoc(
    docId: string,
    orgId: string,
    title: string,
    content: string
  ): Promise<{ chunkCount: number; tokensUsed: number }> {
    // 1. Chunk
    const chunks = chunkDoc(title, content);

    if (chunks.length === 0) {
      return { chunkCount: 0, tokensUsed: 0 };
    }

    // 2. Generate embeddings
    const texts = chunks.map((c) => c.content);
    let embeddings: number[][];

    try {
      embeddings = await getEmbeddings(texts);
    } catch (error) {
      // If embedding fails, log but don't block the doc operation
      console.error('[DocChunks] Embedding failed for doc', docId, error);
      return { chunkCount: 0, tokensUsed: 0 };
    }

    // 3. Delete old chunks + insert new ones in a transaction
    await this.prisma.$executeRaw`DELETE FROM doc_chunks WHERE doc_id = ${docId}::uuid`;

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const embedding = embeddings[i];

      // Format embedding as pg_vector string: '[0.1,0.2,...]'
      const vectorStr = `[${embedding.join(',')}]`;

      await this.prisma.$executeRaw`
        INSERT INTO doc_chunks (doc_id, org_id, content, chunk_index, embedding)
        VALUES (
          ${docId}::uuid,
          ${orgId}::uuid,
          ${chunk.content},
          ${chunk.index},
          ${vectorStr}::vector
        )
      `;
    }

    return { chunkCount: chunks.length, tokensUsed: 0 };
  }

  /**
   * Remove all chunks for a doc.
   * Called when a doc is deleted (cascade FK handles this too).
   */
  async deleteChunksForDoc(docId: string): Promise<void> {
    await this.prisma.$executeRaw`
      DELETE FROM doc_chunks WHERE doc_id = ${docId}::uuid
    `;
  }

  /**
   * Hybrid search: combines full-text (tsvector) with semantic (pg_vector).
   *
   * Ranking formula:
   *   ts_rank * 2  +  (1 - cosine_distance) * 3
   *
   * tsvector catches exact keyword matches.
   * cosine similarity catches semantic/contextual matches.
   *
   * Falls back to vector-only if no tsvector match (semantic only).
   */
  async hybridSearch(
    orgId: string,
    query: string,
    options?: { projectId?: string; limit?: number }
  ): Promise<DocChunkSearchResult[]> {
    const limit = options?.limit ?? 5;

    const projectFilter = options?.projectId
      ? Prisma.sql`AND d.project_id = ${options.projectId}::uuid`
      : Prisma.empty;

    // Generate embedding for the query
    const { getEmbedding } = await import('@/shared/rag/embedding');
    let queryEmbedding: number[];

    try {
      queryEmbedding = await getEmbedding(query);
    } catch (error) {
      console.error('[DocChunks] Query embedding failed, falling back to tsvector only', error);
      // Fall back to tsvector-only search
      return this.keywordSearch(orgId, query, options);
    }

    const vectorStr = `[${queryEmbedding.join(',')}]`;

    return this.prisma.$queryRaw<DocChunkSearchResult[]>`
      SELECT
        c.doc_id as "docId",
        d.title as "docTitle",
        d.project_id as "projectId",
        c.content as "chunkContent",
        c.chunk_index as "chunkIndex",
        (
          -- Keyword score (tsvector)
          COALESCE(
            ts_rank(d.search_vector, websearch_to_tsquery('public.portuguese_unaccent', ${query})) * 2,
            0
          )
          +
          -- Semantic score (cosine similarity, higher = more similar)
          -- 1 - cosine_distance gives us similarity (0 to 1, where 1 = identical)
          (1 - (c.embedding <=> ${vectorStr}::vector)) * 3
        ) as rank
      FROM doc_chunks c
      JOIN project_docs d ON d.id = c.doc_id
      WHERE d.org_id = ${orgId}::uuid
        ${projectFilter}
      ORDER BY rank DESC
      LIMIT ${limit}
    `;
  }

  /**
   * Keyword-only search (tsvector fallback).
   * Used when embedding API is unavailable.
   */
  private async keywordSearch(
    orgId: string,
    query: string,
    options?: { projectId?: string; limit?: number }
  ): Promise<DocChunkSearchResult[]> {
    const limit = options?.limit ?? 5;

    const projectFilter = options?.projectId
      ? Prisma.sql`AND d.project_id = ${options.projectId}::uuid`
      : Prisma.empty;

    return this.prisma.$queryRaw<DocChunkSearchResult[]>`
      SELECT
        c.doc_id as "docId",
        d.title as "docTitle",
        d.project_id as "projectId",
        c.content as "chunkContent",
        c.chunk_index as "chunkIndex",
        ts_rank(d.search_vector, websearch_to_tsquery('public.portuguese_unaccent', ${query})) * 2 as rank
      FROM doc_chunks c
      JOIN project_docs d ON d.id = c.doc_id
      WHERE d.org_id = ${orgId}::uuid
        AND d.search_vector @@ websearch_to_tsquery('public.portuguese_unaccent', ${query})
        ${projectFilter}
      ORDER BY rank DESC
      LIMIT ${limit}
    `;
  }

  /**
   * Get all doc IDs that have chunks indexed.
   * Useful for backfill script to skip already-indexed docs.
   */
  async getIndexedDocIds(): Promise<Set<string>> {
    const rows = await this.prisma.$queryRaw<{ doc_id: string }[]>`
      SELECT DISTINCT doc_id FROM doc_chunks
    `;
    return new Set(rows.map((r) => r.doc_id));
  }

  /**
   * Count total chunks in the database.
   */
  async countChunks(): Promise<number> {
    const [result] = await this.prisma.$queryRaw<{ count: bigint }[]>`
      SELECT count(*) as count FROM doc_chunks
    `;
    return Number(result.count);
  }
}

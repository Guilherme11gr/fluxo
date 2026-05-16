/* eslint-disable @typescript-eslint/no-explicit-any */
import { createHash } from 'node:crypto';
import { Prisma, PrismaClient } from '@prisma/client';
import { chunkText } from '@/shared/rag/chunking';
import { getEmbedding, getEmbeddings } from '@/shared/rag/embedding';

export type ProjectMemoryKind = 'memory' | 'skill_candidate';

export interface ProjectMemoryRecord {
  id: string;
  orgId: string;
  projectId: string;
  taskId: string | null;
  executionId: string | null;
  kind: ProjectMemoryKind;
  title: string | null;
  content: string;
  source: string;
  contentHash: string;
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface ProjectMemorySearchResult {
  id: string;
  kind: ProjectMemoryKind;
  title: string | null;
  content: string;
  source: string;
  score: number;
  metadata: Record<string, unknown>;
}

interface ProjectMemoryRow {
  id: string;
  orgId: string;
  projectId: string;
  taskId: string | null;
  executionId: string | null;
  kind: ProjectMemoryKind;
  title: string | null;
  content: string;
  source: string;
  contentHash: string;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
  updatedAt: Date;
}

function mapRecord(row: ProjectMemoryRow): ProjectMemoryRecord {
  return {
    id: row.id,
    orgId: row.orgId,
    projectId: row.projectId,
    taskId: row.taskId,
    executionId: row.executionId,
    kind: row.kind,
    title: row.title,
    content: row.content,
    source: row.source,
    contentHash: row.contentHash,
    metadata: row.metadata ?? {},
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function buildContentHash(kind: ProjectMemoryKind, title: string | null, content: string): string {
  return createHash('sha256')
    .update(`${kind}\n${title ?? ''}\n${content}`)
    .digest('hex');
}

function truncateMemoryContent(content: string, maxChars = 400): string {
  const trimmed = content.trim();
  if (trimmed.length <= maxChars) {
    return trimmed;
  }
  return `${trimmed.slice(0, maxChars - 3)}...`;
}

export class ProjectMemoryRepository {
  constructor(private prisma: PrismaClient) {}

  async upsert(data: {
    orgId: string;
    projectId: string;
    taskId?: string | null;
    executionId?: string | null;
    kind: ProjectMemoryKind;
    title?: string | null;
    content: string;
    source?: string;
    metadata?: Record<string, unknown>;
  }): Promise<ProjectMemoryRecord> {
    const contentHash = buildContentHash(data.kind, data.title ?? null, data.content);
    const metadataJson = JSON.stringify(data.metadata ?? {});
    const source = data.source ?? 'execution_result';

    const rows = await this.prisma.$queryRaw<ProjectMemoryRow[]>`
      INSERT INTO public.project_memories (
        org_id,
        project_id,
        task_id,
        execution_id,
        kind,
        title,
        content,
        source,
        content_hash,
        metadata
      )
      VALUES (
        ${data.orgId}::uuid,
        ${data.projectId}::uuid,
        ${data.taskId ?? null}::uuid,
        ${data.executionId ?? null}::uuid,
        ${data.kind},
        ${data.title ?? null},
        ${data.content},
        ${source},
        ${contentHash},
        ${metadataJson}::jsonb
      )
      ON CONFLICT (org_id, project_id, kind, content_hash)
      DO UPDATE SET
        task_id = COALESCE(EXCLUDED.task_id, public.project_memories.task_id),
        execution_id = COALESCE(EXCLUDED.execution_id, public.project_memories.execution_id),
        title = COALESCE(EXCLUDED.title, public.project_memories.title),
        source = EXCLUDED.source,
        metadata = COALESCE(public.project_memories.metadata, '{}'::jsonb) || EXCLUDED.metadata,
        updated_at = now()
      RETURNING
        id,
        org_id AS "orgId",
        project_id AS "projectId",
        task_id AS "taskId",
        execution_id AS "executionId",
        kind,
        title,
        content,
        source,
        content_hash AS "contentHash",
        metadata,
        created_at AS "createdAt",
        updated_at AS "updatedAt"
    `;

    return mapRecord(rows[0]);
  }

  async indexMemory(memoryId: string, orgId: string, title: string | null, content: string): Promise<{ chunkCount: number }> {
    const fullText = title?.trim() ? `${title.trim()}\n\n${content}` : content;
    const chunks = chunkText(fullText, 500, 80);

    if (chunks.length === 0) {
      return { chunkCount: 0 };
    }

    let embeddings: number[][];

    try {
      embeddings = await getEmbeddings(chunks.map((chunk) => chunk.content));
    } catch (error) {
      console.error('[ProjectMemory] Embedding failed for memory', memoryId, error);
      throw new Error(`Failed to generate embeddings for project memory ${memoryId}`);
    }

    await this.prisma.$executeRaw`
      DELETE FROM public.project_memory_chunks
      WHERE memory_id = ${memoryId}::uuid
    `;

    for (let index = 0; index < chunks.length; index += 1) {
      const chunk = chunks[index];
      const vector = `[${embeddings[index].join(',')}]`;

      await this.prisma.$executeRaw`
        INSERT INTO public.project_memory_chunks (memory_id, org_id, content, chunk_index, embedding)
        VALUES (
          ${memoryId}::uuid,
          ${orgId}::uuid,
          ${chunk.content},
          ${chunk.index},
          ${vector}::vector
        )
      `;
    }

    return { chunkCount: chunks.length };
  }

  async hybridSearch(
    orgId: string,
    query: string,
    options?: { projectId?: string; limit?: number }
  ): Promise<ProjectMemorySearchResult[]> {
    const normalizedQuery = query.trim();
    if (normalizedQuery.length < 2) {
      return [];
    }

    const limit = options?.limit ?? 5;
    const projectFilter = options?.projectId
      ? Prisma.sql`AND m.project_id = ${options.projectId}::uuid`
      : Prisma.empty;

    try {
      const embedding = await getEmbedding(normalizedQuery);
      const vector = `[${embedding.join(',')}]`;

      const results = await this.prisma.$queryRaw<ProjectMemorySearchResult[]>`
        WITH ranked_chunks AS (
          SELECT
            c.memory_id AS id,
            m.kind,
            m.title,
            m.source,
            m.metadata,
            c.content,
            (
              COALESCE(
                ts_rank(m.search_vector, websearch_to_tsquery('public.portuguese_unaccent', ${normalizedQuery})) * 2,
                0
              )
              +
              (1 - (c.embedding <=> ${vector}::vector)) * 3
            ) AS score
          FROM public.project_memory_chunks c
          INNER JOIN public.project_memories m ON m.id = c.memory_id
          WHERE m.org_id = ${orgId}::uuid
            ${projectFilter}
          ORDER BY score DESC
          LIMIT 50
        )
        SELECT
          rc.id,
          rc.kind,
          rc.title,
          LEFT(
            (
              SELECT rc2.content
              FROM ranked_chunks rc2
              WHERE rc2.id = rc.id
              ORDER BY rc2.score DESC
              LIMIT 1
            ),
            400
          ) AS content,
          rc.source,
          MAX(rc.score) AS score,
          rc.metadata
        FROM ranked_chunks rc
        GROUP BY rc.id, rc.kind, rc.title, rc.source, rc.metadata
        ORDER BY score DESC
        LIMIT ${limit}
      `;

      if (results.length > 0) {
        return results.map((result) => ({
          ...result,
          content: truncateMemoryContent(result.content),
          metadata: result.metadata ?? {},
        }));
      }
    } catch (error) {
      console.error('[ProjectMemory] Query embedding failed, falling back to keyword search', error);
    }

    return this.keywordSearch(orgId, normalizedQuery, options);
  }

  private async keywordSearch(
    orgId: string,
    query: string,
    options?: { projectId?: string; limit?: number }
  ): Promise<ProjectMemorySearchResult[]> {
    const limit = options?.limit ?? 5;
    const projectFilter = options?.projectId
      ? Prisma.sql`AND project_id = ${options.projectId}::uuid`
      : Prisma.empty;

    const results = await this.prisma.$queryRaw<ProjectMemorySearchResult[]>`
      SELECT
        id,
        kind,
        title,
        LEFT(content, 400) AS content,
        source,
        ts_rank(search_vector, websearch_to_tsquery('public.portuguese_unaccent', ${query})) * 2 AS score,
        metadata
      FROM public.project_memories
      WHERE org_id = ${orgId}::uuid
        AND search_vector @@ websearch_to_tsquery('public.portuguese_unaccent', ${query})
        ${projectFilter}
      ORDER BY score DESC, created_at DESC
      LIMIT ${limit}
    `;

    return results.map((result) => ({
      ...result,
      content: truncateMemoryContent(result.content),
      metadata: result.metadata ?? {},
    }));
  }
}

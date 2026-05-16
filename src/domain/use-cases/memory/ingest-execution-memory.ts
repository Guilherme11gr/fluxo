import { projectMemoryRepository } from '@/infra/adapters/prisma';
import type { ProjectMemoryKind } from '@/infra/adapters/prisma/project-memory.repository';

const MAX_MEMORY_CANDIDATES = 10;
const MAX_SKILL_CANDIDATES = 10;
const MAX_CONTENT_LENGTH = 2000;

export interface ExecutionMemoryEntry {
  kind: ProjectMemoryKind;
  title: string | null;
  content: string;
  metadata: Record<string, unknown>;
}

export interface IngestExecutionMemoryInput {
  orgId: string;
  projectId: string;
  taskId?: string | null;
  executionId?: string | null;
  agentName?: string | null;
  tool?: string | null;
  model?: string | null;
  result?: Record<string, unknown>;
}

function normalizeText(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim().replace(/\s+/g, ' ');
  if (!normalized) {
    return null;
  }

  if (normalized.length <= MAX_CONTENT_LENGTH) {
    return normalized;
  }

  return normalized.slice(0, MAX_CONTENT_LENGTH);
}

export function buildExecutionMemoryEntries(input: Pick<IngestExecutionMemoryInput, 'result' | 'agentName' | 'tool' | 'model'>): ExecutionMemoryEntry[] {
  const result = input.result;
  if (!result) {
    return [];
  }

  const entries: ExecutionMemoryEntry[] = [];
  const seen = new Set<string>();

  const memoryCandidates = Array.isArray(result.memoryCandidates)
    ? result.memoryCandidates.slice(0, MAX_MEMORY_CANDIDATES)
    : [];

  for (const candidate of memoryCandidates) {
    const content = normalizeText(candidate);
    if (!content) {
      continue;
    }

    const key = `memory:${content}`;
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    entries.push({
      kind: 'memory',
      title: null,
      content,
      metadata: {
        candidateType: 'memory_candidate',
        agentName: input.agentName ?? null,
        tool: input.tool ?? null,
        model: input.model ?? null,
      },
    });
  }

  const skillCandidates = Array.isArray(result.skillCandidates)
    ? result.skillCandidates.slice(0, MAX_SKILL_CANDIDATES)
    : [];

  for (const candidate of skillCandidates) {
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
      continue;
    }

    const skillName = normalizeText((candidate as Record<string, unknown>).name);
    const reason = normalizeText((candidate as Record<string, unknown>).reason);

    if (!skillName || !reason) {
      continue;
    }

    const content = normalizeText(`Skill candidate: ${skillName}. Reason: ${reason}`);
    if (!content) {
      continue;
    }

    const key = `skill:${skillName}:${reason}`;
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    entries.push({
      kind: 'skill_candidate',
      title: skillName,
      content,
      metadata: {
        candidateType: 'skill_candidate',
        skillName,
        reason,
        agentName: input.agentName ?? null,
        tool: input.tool ?? null,
        model: input.model ?? null,
      },
    });
  }

  return entries;
}

export async function ingestExecutionMemory(input: IngestExecutionMemoryInput): Promise<number> {
  const entries = buildExecutionMemoryEntries(input);
  if (entries.length === 0) {
    return 0;
  }

  let persistedCount = 0;

  for (const entry of entries) {
    const memory = await projectMemoryRepository.upsert({
      orgId: input.orgId,
      projectId: input.projectId,
      taskId: input.taskId ?? null,
      executionId: input.executionId ?? null,
      kind: entry.kind,
      title: entry.title,
      content: entry.content,
      source: 'execution_result_v1',
      metadata: entry.metadata,
    });

    await projectMemoryRepository.indexMemory(memory.id, input.orgId, entry.title, entry.content);
    persistedCount += 1;
  }

  return persistedCount;
}

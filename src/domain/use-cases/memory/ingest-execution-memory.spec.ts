import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockUpsert, mockIndexMemory } = vi.hoisted(() => ({
  mockUpsert: vi.fn(),
  mockIndexMemory: vi.fn(),
}));

vi.mock('@/infra/adapters/prisma', () => ({
  projectMemoryRepository: {
    upsert: mockUpsert,
    indexMemory: mockIndexMemory,
  },
}));

import { buildExecutionMemoryEntries, ingestExecutionMemory } from './ingest-execution-memory';

describe('buildExecutionMemoryEntries', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUpsert.mockResolvedValue({ id: 'memory-1' });
    mockIndexMemory.mockResolvedValue({ chunkCount: 1 });
  });

  it('extracts memory and skill candidates from structured result', () => {
    const entries = buildExecutionMemoryEntries({
      agentName: 'fluxo-runner-go',
      tool: 'opencode',
      model: 'glm-5.1',
      result: {
        memoryCandidates: [
          'Deploy em VPS usa docker compose no diretorio /srv/app.',
        ],
        skillCandidates: [
          {
            name: 'deploy-vps',
            reason: 'Fluxo recorrente de deploy em VPS para este projeto.',
          },
        ],
      },
    });

    expect(entries).toHaveLength(2);
    expect(entries[0]).toEqual(
      expect.objectContaining({
        kind: 'memory',
        content: 'Deploy em VPS usa docker compose no diretorio /srv/app.',
      }),
    );
    expect(entries[1]).toEqual(
      expect.objectContaining({
        kind: 'skill_candidate',
        title: 'deploy-vps',
      }),
    );
  });

  it('deduplicates repeated candidates and ignores invalid entries', () => {
    const entries = buildExecutionMemoryEntries({
      result: {
        memoryCandidates: ['  mesma memoria  ', 'mesma memoria', '', 42],
        skillCandidates: [
          { name: 'skill-a', reason: 'motivo' },
          { name: 'skill-a', reason: 'motivo' },
          { name: 'skill-b' },
        ],
      },
    });

    expect(entries).toHaveLength(2);
    expect(entries[0].content).toBe('mesma memoria');
    expect(entries[1].title).toBe('skill-a');
  });

  it('fails ingestion when indexing a persisted memory fails', async () => {
    mockUpsert.mockResolvedValueOnce({ id: 'memory-1' });
    mockIndexMemory.mockRejectedValueOnce(new Error('embedding unavailable'));

    await expect(ingestExecutionMemory({
      orgId: 'org-1',
      projectId: 'project-1',
      taskId: 'task-1',
      executionId: 'exec-1',
      result: {
        memoryCandidates: ['Usar docker compose no deploy.'],
      },
    })).rejects.toThrow('embedding unavailable');
  });
});

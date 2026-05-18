import { describe, expect, it, vi, beforeEach } from 'vitest';
import { AgentExecutionEventRepository } from './agent-execution-event.repository';

function makeRecord(
  seq: number,
  overrides: Record<string, unknown> = {}
) {
  return {
    id: `evt-${seq}`,
    executionId: 'exec-1',
    seq,
    kind: 'log',
    content: `event ${seq}`,
    metadata: {},
    createdAt: new Date(),
    ...overrides,
  };
}

describe('AgentExecutionEventRepository', () => {
  describe('findPageByExecutionId', () => {
    it('returns items ordered by seq asc', async () => {
      const findMany = vi.fn().mockResolvedValue([
        makeRecord(1),
        makeRecord(2),
        makeRecord(3),
      ]);
      const findFirst = vi.fn().mockResolvedValue({ seq: 3 });

      const repo = new AgentExecutionEventRepository({
        agentExecutionEvent: { findMany, findFirst },
      } as any);

      const page = await repo.findPageByExecutionId('exec-1', undefined, 10);

      expect(page.items.map((i) => i.seq)).toEqual([1, 2, 3]);
      expect(findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { seq: 'asc' },
        })
      );
    });

    it('filters events after the given afterSeq', async () => {
      const findMany = vi.fn().mockResolvedValue([makeRecord(5), makeRecord(6)]);
      const findFirst = vi.fn().mockResolvedValue({ seq: 6 });

      const repo = new AgentExecutionEventRepository({
        agentExecutionEvent: { findMany, findFirst },
      } as any);

      await repo.findPageByExecutionId('exec-1', 4, 10);

      expect(findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            seq: { gt: 4 },
          }),
        })
      );
    });

    it('returns hasMore true when more events exist than limit', async () => {
      const records = Array.from({ length: 6 }, (_, i) => makeRecord(i + 1));
      const findMany = vi.fn().mockResolvedValue(records);
      const findFirst = vi.fn().mockResolvedValue({ seq: 10 });

      const repo = new AgentExecutionEventRepository({
        agentExecutionEvent: { findMany, findFirst },
      } as any);

      const page = await repo.findPageByExecutionId('exec-1', undefined, 5);

      expect(page.hasMore).toBe(true);
      expect(page.items.length).toBe(5);
    });

    it('returns hasMore false when all events fit within limit', async () => {
      const records = [makeRecord(1), makeRecord(2)];
      const findMany = vi.fn().mockResolvedValue(records);
      const findFirst = vi.fn().mockResolvedValue({ seq: 2 });

      const repo = new AgentExecutionEventRepository({
        agentExecutionEvent: { findMany, findFirst },
      } as any);

      const page = await repo.findPageByExecutionId('exec-1', undefined, 5);

      expect(page.hasMore).toBe(false);
      expect(page.items.length).toBe(2);
    });

    it('sets nextAfterSeq to the last returned item seq', async () => {
      const records = [makeRecord(10), makeRecord(11), makeRecord(12)];
      const findMany = vi.fn().mockResolvedValue(records);
      const findFirst = vi.fn().mockResolvedValue({ seq: 12 });

      const repo = new AgentExecutionEventRepository({
        agentExecutionEvent: { findMany, findFirst },
      } as any);

      const page = await repo.findPageByExecutionId('exec-1', undefined, 5);

      expect(page.nextAfterSeq).toBe(12);
    });

    it('sets nextAfterSeq to 0 when no items are returned', async () => {
      const findMany = vi.fn().mockResolvedValue([]);
      const findFirst = vi.fn().mockResolvedValue({ seq: 5 });

      const repo = new AgentExecutionEventRepository({
        agentExecutionEvent: { findMany, findFirst },
      } as any);

      const page = await repo.findPageByExecutionId('exec-1', 10, 5);

      expect(page.nextAfterSeq).toBe(0);
    });

    it('returns lastSeq from the execution even when no items match afterSeq', async () => {
      const findMany = vi.fn().mockResolvedValue([]);
      const findFirst = vi.fn().mockResolvedValue({ seq: 42 });

      const repo = new AgentExecutionEventRepository({
        agentExecutionEvent: { findMany, findFirst },
      } as any);

      const page = await repo.findPageByExecutionId('exec-1', 100, 5);

      expect(page.lastSeq).toBe(42);
      expect(page.nextAfterSeq).toBe(0);
    });

    it('returns returnedCount equal to items length', async () => {
      const records = [makeRecord(1), makeRecord(2), makeRecord(3)];
      const findMany = vi.fn().mockResolvedValue(records);
      const findFirst = vi.fn().mockResolvedValue({ seq: 3 });

      const repo = new AgentExecutionEventRepository({
        agentExecutionEvent: { findMany, findFirst },
      } as any);

      const page = await repo.findPageByExecutionId('exec-1', undefined, 5);

      expect(page.returnedCount).toBe(3);
    });

    it('truncates items to limit even when more are fetched', async () => {
      const records = Array.from({ length: 4 }, (_, i) => makeRecord(i + 1));
      const findMany = vi.fn().mockResolvedValue(records);
      const findFirst = vi.fn().mockResolvedValue({ seq: 4 });

      const repo = new AgentExecutionEventRepository({
        agentExecutionEvent: { findMany, findFirst },
      } as any);

      const page = await repo.findPageByExecutionId('exec-1', undefined, 3);

      expect(page.items.length).toBe(3);
      expect(page.items.map((i) => i.seq)).toEqual([1, 2, 3]);
      expect(page.hasMore).toBe(true);
    });

    it('fetches limit + 1 to detect hasMore without a separate count query', async () => {
      const findMany = vi.fn().mockResolvedValue([]);
      const findFirst = vi.fn().mockResolvedValue(null);

      const repo = new AgentExecutionEventRepository({
        agentExecutionEvent: { findMany, findFirst },
      } as any);

      await repo.findPageByExecutionId('exec-1', undefined, 10);

      expect(findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 11,
        })
      );
    });
  });

  describe('findByExecutionId', () => {
    it('returns only items array for backward compatibility', async () => {
      const findMany = vi.fn().mockResolvedValue([makeRecord(1), makeRecord(2)]);
      const findFirst = vi.fn().mockResolvedValue({ seq: 2 });

      const repo = new AgentExecutionEventRepository({
        agentExecutionEvent: { findMany, findFirst },
      } as any);

      const result = await repo.findByExecutionId('exec-1', undefined, 10);

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(2);
    });
  });
});

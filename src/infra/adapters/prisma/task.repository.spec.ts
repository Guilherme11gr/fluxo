import { describe, expect, it, vi } from 'vitest';
import { TaskRepository } from './task.repository';

describe('TaskRepository board filter', () => {
  it('keeps active tasks visible even when feature is done', async () => {
    const findMany = vi.fn().mockResolvedValue([]);

    const repo = new TaskRepository({
      task: { findMany },
    } as any);

    await repo.findMany('org-1', {
      status: 'DOING',
      pageSize: 20,
    });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          AND: expect.arrayContaining([
            expect.objectContaining({
              OR: [
                { feature: { status: { in: ['TODO', 'DOING'] } } },
                { status: { in: ['TODO', 'DOING', 'REVIEW', 'QA_READY'] } },
              ],
            }),
            { feature: { epic: { status: { not: 'CLOSED' } } } },
          ]),
        }),
      })
    );
  });
});

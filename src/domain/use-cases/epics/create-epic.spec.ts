import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createEpic } from './create-epic';
import type { EpicRepository } from '@/infra/adapters/prisma';
import type { Epic } from '@/shared/types';

describe('createEpic', () => {
  const mockRepo = {
    create: vi.fn(),
    findById: vi.fn(),
    findManyWithStats: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  } as unknown as EpicRepository;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should create an epic successfully', async () => {
    const input = {
      orgId: 'org-1',
      projectId: 'proj-1',
      title: 'New Epic',
      description: 'Epic description',
    };

    const expectedEpic: Epic = {
      id: 'epic-1',
      orgId: input.orgId,
      projectId: input.projectId,
      title: input.title,
      description: input.description,
      status: 'OPEN',
      createdAt: new Date(),
      updatedAt: new Date(),
      risk: 'low',
      riskUpdatedAt: new Date(),
      riskReason: null,
    };

    vi.mocked(mockRepo.create).mockResolvedValue(expectedEpic);

    const result = await createEpic(input, { epicRepository: mockRepo });

    expect(result).toEqual(expectedEpic);
    expect(mockRepo.create).toHaveBeenCalledWith(input);
  });
});

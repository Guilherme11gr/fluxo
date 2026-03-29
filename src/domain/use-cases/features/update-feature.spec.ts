import { describe, it, expect, vi, beforeEach } from 'vitest';
import { updateFeature } from './update-feature';
import { NotFoundError } from '@/shared/errors';
import type { FeatureRepository } from '@/infra/adapters/prisma';
import type { Feature } from '@/shared/types';

describe('updateFeature', () => {
  const mockRepo = {
    create: vi.fn(),
    findById: vi.fn(),
    findManyWithStats: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  } as unknown as FeatureRepository;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should update the feature successfully', async () => {
    const id = 'feat-1';
    const orgId = 'org-1';
    const input = {
      title: 'Updated Feature',
      status: 'DOING' as const,
    };

    const existingFeature: Feature = {
      id,
      orgId,
      epicId: 'epic-1',
      title: 'Old Feature',
      description: null,
      status: 'BACKLOG',
      createdAt: new Date(),
      updatedAt: new Date(),
      isSystem: false,
      health: 'healthy',
      healthUpdatedAt: new Date(),
      healthReason: null,
    };

    const updatedFeature: Feature = {
      ...existingFeature,
      title: 'Updated Title',
      status: 'DOING',
      updatedAt: new Date(), // This would change in reality
    };
    vi.mocked(mockRepo.findById).mockResolvedValue(existingFeature);
    vi.mocked(mockRepo.update).mockResolvedValue(updatedFeature);

    const result = await updateFeature(id, orgId, input, { featureRepository: mockRepo });

    expect(result).toEqual(updatedFeature);
    expect(mockRepo.update).toHaveBeenCalledWith(id, orgId, input);
  });

  it('should throw NotFoundError if feature does not exist', async () => {
    const id = 'feat-1';
    const orgId = 'org-1';
    const input = { title: 'Updated Feature' };

    vi.mocked(mockRepo.findById).mockResolvedValue(null);

    await expect(updateFeature(id, orgId, input, { featureRepository: mockRepo }))
      .rejects.toThrow(NotFoundError);
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { listTags } from './list-tags';
import type { DocTagRepository } from '@/infra/adapters/prisma/doc-tag.repository';

describe('listTags', () => {
    const mockRepo = {
        create: vi.fn(),
        findById: vi.fn(),
        findByProjectId: vi.fn(),
        findByName: vi.fn(),
        delete: vi.fn(),
    } as unknown as DocTagRepository;

    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should return all tags for a project', async () => {
        const projectId = 'proj-1';
        const orgId = 'org-1';

        const expectedTags = [
            { id: 'tag-1', name: 'API', projectId, orgId, createdAt: new Date(), _count: { assignments: 3 } },
            { id: 'tag-2', name: 'Onboarding', projectId, orgId, createdAt: new Date(), _count: { assignments: 1 } },
        ];

        vi.mocked(mockRepo.findByProjectId).mockResolvedValue(expectedTags);

        const result = await listTags(projectId, orgId, { docTagRepository: mockRepo });

        expect(result).toEqual(expectedTags);
        expect(mockRepo.findByProjectId).toHaveBeenCalledWith(projectId, orgId);
    });

    it('should return empty array when project has no tags', async () => {
        const projectId = 'proj-1';
        const orgId = 'org-1';

        vi.mocked(mockRepo.findByProjectId).mockResolvedValue([]);

        const result = await listTags(projectId, orgId, { docTagRepository: mockRepo });

        expect(result).toEqual([]);
        expect(mockRepo.findByProjectId).toHaveBeenCalledWith(projectId, orgId);
    });
});

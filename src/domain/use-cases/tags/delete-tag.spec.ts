import { describe, it, expect, vi, beforeEach } from 'vitest';
import { deleteTag } from './delete-tag';
import { NotFoundError } from '@/shared/errors';
import type { DocTagRepository } from '@/infra/adapters/prisma/doc-tag.repository';

describe('deleteTag', () => {
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

    it('should delete a tag successfully', async () => {
        const tagId = 'tag-1';
        const orgId = 'org-1';

        vi.mocked(mockRepo.findById).mockResolvedValue({
            id: tagId,
            name: 'API',
            projectId: 'proj-1',
            orgId,
            createdAt: new Date(),
        });

        await deleteTag(tagId, orgId, { docTagRepository: mockRepo });

        expect(mockRepo.findById).toHaveBeenCalledWith(tagId, orgId);
        expect(mockRepo.delete).toHaveBeenCalledWith(tagId, orgId);
    });

    it('should throw NotFoundError if tag does not exist', async () => {
        const tagId = 'non-existent';
        const orgId = 'org-1';

        vi.mocked(mockRepo.findById).mockResolvedValue(null);

        await expect(deleteTag(tagId, orgId, { docTagRepository: mockRepo }))
            .rejects.toThrow(NotFoundError);

        await expect(deleteTag(tagId, orgId, { docTagRepository: mockRepo }))
            .rejects.toThrow('Tag not found');

        expect(mockRepo.delete).not.toHaveBeenCalled();
    });
});

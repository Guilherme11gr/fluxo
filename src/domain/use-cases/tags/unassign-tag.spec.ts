import { describe, it, expect, vi, beforeEach } from 'vitest';
import { unassignTag } from './unassign-tag';
import { NotFoundError } from '@/shared/errors';
import type { DocTagRepository } from '@/infra/adapters/prisma/doc-tag.repository';
import type { ProjectDocRepository } from '@/infra/adapters/prisma/project-doc.repository';

describe('unassignTag', () => {
    const mockDocTagRepo = {
        unassignFromDoc: vi.fn(),
        findTagsByDocId: vi.fn(),
    } as unknown as DocTagRepository;

    const mockProjectDocRepo = {
        findById: vi.fn(),
    } as unknown as ProjectDocRepository;

    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should unassign a tag from a document successfully', async () => {
        const input = {
            docId: 'doc-1',
            tagId: 'tag-1',
            orgId: 'org-1',
        };

        vi.mocked(mockProjectDocRepo.findById).mockResolvedValue({
            id: 'doc-1',
            projectId: 'proj-1',
            title: 'Test Doc',
            content: 'Content',
            createdAt: new Date(),
            updatedAt: new Date(),
        });

        const remainingTags = [
            { id: 'tag-2', name: 'Guide', projectId: 'proj-1', orgId: 'org-1', createdAt: new Date() },
        ];
        vi.mocked(mockDocTagRepo.findTagsByDocId).mockResolvedValue(remainingTags);

        const result = await unassignTag(input, {
            docTagRepository: mockDocTagRepo,
            projectDocRepository: mockProjectDocRepo,
        });

        expect(result).toEqual(remainingTags);
        expect(mockProjectDocRepo.findById).toHaveBeenCalledWith('doc-1', 'org-1');
        expect(mockDocTagRepo.unassignFromDoc).toHaveBeenCalledWith('doc-1', 'tag-1');
        expect(mockDocTagRepo.findTagsByDocId).toHaveBeenCalledWith('doc-1', 'org-1');
    });

    it('should throw NotFoundError if document does not exist', async () => {
        const input = {
            docId: 'non-existent',
            tagId: 'tag-1',
            orgId: 'org-1',
        };

        vi.mocked(mockProjectDocRepo.findById).mockResolvedValue(null);

        await expect(
            unassignTag(input, {
                docTagRepository: mockDocTagRepo,
                projectDocRepository: mockProjectDocRepo,
            })
        ).rejects.toThrow(NotFoundError);

        expect(mockDocTagRepo.unassignFromDoc).not.toHaveBeenCalled();
    });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { assignTags } from './assign-tags';
import { NotFoundError } from '@/shared/errors';
import type { DocTagRepository } from '@/infra/adapters/prisma/doc-tag.repository';
import type { ProjectDocRepository } from '@/infra/adapters/prisma/project-doc.repository';

describe('assignTags', () => {
    const mockDocTagRepo = {
        bulkAssignToDoc: vi.fn(),
        findTagsByDocId: vi.fn(),
    } as unknown as DocTagRepository;

    const mockProjectDocRepo = {
        findById: vi.fn(),
    } as unknown as ProjectDocRepository;

    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should assign tags to a document successfully', async () => {
        const input = {
            docId: 'doc-1',
            tagIds: ['tag-1', 'tag-2'],
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

        const expectedTags = [
            { id: 'tag-1', name: 'API', projectId: 'proj-1', orgId: 'org-1', createdAt: new Date() },
            { id: 'tag-2', name: 'Guide', projectId: 'proj-1', orgId: 'org-1', createdAt: new Date() },
        ];
        vi.mocked(mockDocTagRepo.findTagsByDocId).mockResolvedValue(expectedTags);

        const result = await assignTags(input, {
            docTagRepository: mockDocTagRepo,
            projectDocRepository: mockProjectDocRepo,
        });

        expect(result).toEqual(expectedTags);
        expect(mockProjectDocRepo.findById).toHaveBeenCalledWith('doc-1', 'org-1');
        expect(mockDocTagRepo.bulkAssignToDoc).toHaveBeenCalledWith('doc-1', ['tag-1', 'tag-2']);
        expect(mockDocTagRepo.findTagsByDocId).toHaveBeenCalledWith('doc-1', 'org-1');
    });

    it('should throw NotFoundError if document does not exist', async () => {
        const input = {
            docId: 'non-existent',
            tagIds: ['tag-1'],
            orgId: 'org-1',
        };

        vi.mocked(mockProjectDocRepo.findById).mockResolvedValue(null);

        await expect(
            assignTags(input, {
                docTagRepository: mockDocTagRepo,
                projectDocRepository: mockProjectDocRepo,
            })
        ).rejects.toThrow(NotFoundError);

        expect(mockDocTagRepo.bulkAssignToDoc).not.toHaveBeenCalled();
    });
});

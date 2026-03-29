import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getDocsByTag } from './get-docs-by-tag';
import { NotFoundError } from '@/shared/errors';
import type { DocTagRepository } from '@/infra/adapters/prisma/doc-tag.repository';
import type { ProjectDocRepository } from '@/infra/adapters/prisma/project-doc.repository';

describe('getDocsByTag', () => {
    const mockDocTagRepo = {
        findById: vi.fn(),
        findDocIdsByTagId: vi.fn(),
    } as unknown as DocTagRepository;

    const mockProjectDocRepo = {
        findByProjectId: vi.fn(),
    } as unknown as ProjectDocRepository;

    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should return documents that have the specified tag', async () => {
        const tagId = 'tag-1';
        const projectId = 'proj-1';
        const orgId = 'org-1';

        vi.mocked(mockDocTagRepo.findById).mockResolvedValue({
            id: tagId,
            name: 'API',
            projectId,
            orgId,
            createdAt: new Date(),
        });

        vi.mocked(mockDocTagRepo.findDocIdsByTagId).mockResolvedValue(['doc-1', 'doc-3']);

        const allDocs = [
            { id: 'doc-1', projectId, title: 'API Guide', content: 'Content 1', createdAt: new Date(), updatedAt: new Date() },
            { id: 'doc-2', projectId, title: 'Intro', content: 'Content 2', createdAt: new Date(), updatedAt: new Date() },
            { id: 'doc-3', projectId, title: 'API Reference', content: 'Content 3', createdAt: new Date(), updatedAt: new Date() },
        ];
        vi.mocked(mockProjectDocRepo.findByProjectId).mockResolvedValue(allDocs);

        const result = await getDocsByTag(tagId, projectId, orgId, {
            docTagRepository: mockDocTagRepo,
            projectDocRepository: mockProjectDocRepo,
        });

        expect(result).toHaveLength(2);
        expect(result.map(d => d.id)).toEqual(['doc-1', 'doc-3']);
    });

    it('should return empty array when no docs have the tag', async () => {
        const tagId = 'tag-1';
        const projectId = 'proj-1';
        const orgId = 'org-1';

        vi.mocked(mockDocTagRepo.findById).mockResolvedValue({
            id: tagId,
            name: 'Unused',
            projectId,
            orgId,
            createdAt: new Date(),
        });

        vi.mocked(mockDocTagRepo.findDocIdsByTagId).mockResolvedValue([]);

        const result = await getDocsByTag(tagId, projectId, orgId, {
            docTagRepository: mockDocTagRepo,
            projectDocRepository: mockProjectDocRepo,
        });

        expect(result).toEqual([]);
        expect(mockProjectDocRepo.findByProjectId).not.toHaveBeenCalled();
    });

    it('should throw NotFoundError if tag does not exist', async () => {
        const tagId = 'non-existent';
        const projectId = 'proj-1';
        const orgId = 'org-1';

        vi.mocked(mockDocTagRepo.findById).mockResolvedValue(null);

        await expect(
            getDocsByTag(tagId, projectId, orgId, {
                docTagRepository: mockDocTagRepo,
                projectDocRepository: mockProjectDocRepo,
            })
        ).rejects.toThrow(NotFoundError);
    });
});

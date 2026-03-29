import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createTag } from './create-tag';
import { ConflictError } from '@/shared/errors';
import type { DocTagRepository } from '@/infra/adapters/prisma/doc-tag.repository';

describe('createTag', () => {
    const mockRepo = {
        create: vi.fn(),
        findById: vi.fn(),
        findByProjectId: vi.fn(),
        findByName: vi.fn(),
        delete: vi.fn(),
        assignToDoc: vi.fn(),
        unassignFromDoc: vi.fn(),
        findTagsByDocId: vi.fn(),
        findDocIdsByTagId: vi.fn(),
        bulkAssignToDoc: vi.fn(),
        setDocTags: vi.fn(),
    } as unknown as DocTagRepository;

    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should create a tag successfully', async () => {
        const input = {
            orgId: 'org-1',
            projectId: 'proj-1',
            name: 'API',
        };

        const expectedTag = {
            id: 'tag-1',
            orgId: input.orgId,
            projectId: input.projectId,
            name: 'API',
            createdAt: new Date(),
        };

        vi.mocked(mockRepo.findByName).mockResolvedValue(null);
        vi.mocked(mockRepo.create).mockResolvedValue(expectedTag);

        const result = await createTag(input, { docTagRepository: mockRepo });

        expect(result).toEqual(expectedTag);
        expect(mockRepo.findByName).toHaveBeenCalledWith('API', 'proj-1', 'org-1');
        expect(mockRepo.create).toHaveBeenCalledWith({
            name: 'API',
            projectId: 'proj-1',
            orgId: 'org-1',
        });
    });

    it('should trim whitespace from tag name', async () => {
        const input = {
            orgId: 'org-1',
            projectId: 'proj-1',
            name: '  Onboarding  ',
        };

        vi.mocked(mockRepo.findByName).mockResolvedValue(null);
        vi.mocked(mockRepo.create).mockResolvedValue({
            id: 'tag-1',
            orgId: input.orgId,
            projectId: input.projectId,
            name: 'Onboarding',
            createdAt: new Date(),
        });

        await createTag(input, { docTagRepository: mockRepo });

        expect(mockRepo.findByName).toHaveBeenCalledWith('Onboarding', 'proj-1', 'org-1');
        expect(mockRepo.create).toHaveBeenCalledWith({
            name: 'Onboarding',
            projectId: 'proj-1',
            orgId: 'org-1',
        });
    });

    it('should throw ConflictError if tag name already exists in project', async () => {
        const input = {
            orgId: 'org-1',
            projectId: 'proj-1',
            name: 'API',
        };

        vi.mocked(mockRepo.findByName).mockResolvedValue({
            id: 'existing-tag',
            orgId: 'org-1',
            projectId: 'proj-1',
            name: 'API',
            createdAt: new Date(),
        });

        await expect(createTag(input, { docTagRepository: mockRepo }))
            .rejects.toThrow(ConflictError);

        await expect(createTag(input, { docTagRepository: mockRepo }))
            .rejects.toThrow("Tag 'API' already exists in this project");

        expect(mockRepo.create).not.toHaveBeenCalled();
    });

    it('should throw error if tag name is empty', async () => {
        const input = {
            orgId: 'org-1',
            projectId: 'proj-1',
            name: '   ',
        };

        await expect(createTag(input, { docTagRepository: mockRepo }))
            .rejects.toThrow('Tag name is required');
    });
});

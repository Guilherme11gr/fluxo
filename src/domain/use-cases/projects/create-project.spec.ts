import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createProject } from './create-project';
import { ValidationError } from '@/shared/errors';
import type { ProjectRepository } from '@/infra/adapters/prisma';
import type { Project } from '@/shared/types';

describe('createProject', () => {
  const mockRepo = {
    create: vi.fn(),
    findById: vi.fn(),
    findMany: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  } as unknown as ProjectRepository;
  const mockEpicRepository = {
    create: vi.fn(),
  };
  const mockFeatureRepository = {
    create: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockEpicRepository.create.mockResolvedValue({ id: 'epic-sustentation' });
    mockFeatureRepository.create.mockResolvedValue({ id: 'feature-sustentation' });
  });

  it('should create a project successfully', async () => {
    const input = {
      orgId: 'org-1',
      name: 'My Project',
      key: 'PROJ',
      description: 'A test project',
      modules: ['kanban', 'scrum'],
    };

    const expectedProject: Project = {
      id: 'proj-1',
      orgId: input.orgId,
      name: input.name,
      key: input.key,
      description: input.description,
      modules: input.modules,
      githubInstallationId: null,
      githubRepoFullName: null,
      githubRepoUrl: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    vi.mocked(mockRepo.create).mockResolvedValue(expectedProject);

    const result = await createProject(input, {
      projectRepository: mockRepo,
      epicRepository: mockEpicRepository as any,
      featureRepository: mockFeatureRepository as any,
    });

    expect(result).toEqual(expectedProject);
    expect(mockRepo.create).toHaveBeenCalledWith({
      orgId: input.orgId,
      name: input.name,
      key: input.key,
      description: input.description,
      modules: input.modules,
    });
    expect(mockEpicRepository.create).toHaveBeenCalledWith(expect.objectContaining({
      orgId: input.orgId,
      projectId: expectedProject.id,
      isSystem: true,
    }));
    expect(mockFeatureRepository.create).toHaveBeenCalledWith(expect.objectContaining({
      orgId: input.orgId,
      epicId: 'epic-sustentation',
      isSystem: true,
    }));
  });

  it('should throw ValidationError if key is invalid', async () => {
    const input = {
      orgId: 'org-1',
      name: 'My Project',
      key: 'invalid-key', // Lowercase and hyphen
    };

    await expect(createProject(input, {
      projectRepository: mockRepo,
      epicRepository: {} as any,
      featureRepository: {} as any,
    }))
      .rejects.toThrow(ValidationError);

    await expect(createProject(input, {
      projectRepository: mockRepo,
      epicRepository: {} as any,
      featureRepository: {} as any,
    }))
      .rejects.toThrow('Key deve ter 2-10 caracteres');
  });

  it('should throw ValidationError if modules are duplicated', async () => {
    const input = {
      orgId: 'org-1',
      name: 'My Project',
      key: 'PROJ',
      modules: ['kanban', 'kanban'],
    };

    await expect(createProject(input, {
      projectRepository: mockRepo,
      epicRepository: {} as any,
      featureRepository: {} as any,
    }))
      .rejects.toThrow(ValidationError);

    await expect(createProject(input, {
      projectRepository: mockRepo,
      epicRepository: {} as any,
      featureRepository: {} as any,
    }))
      .rejects.toThrow('Módulos duplicados não são permitidos');
  });
});

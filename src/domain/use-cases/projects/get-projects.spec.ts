import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getProjects } from './get-projects';
import type { ProjectRepository } from '@/infra/adapters/prisma';

describe('getProjects', () => {
  const mockRepo = {
    create: vi.fn(),
    findById: vi.fn(),
    findMany: vi.fn(),
    findManyWithAnalytics: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  } as unknown as ProjectRepository;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return projects for the organization', async () => {
    const orgId = 'org-1';
    const expectedProjects: any[] = [
      {
        id: 'proj-1',
        orgId,
        name: 'Project 1',
        key: 'PROJ1',
        description: null,
        modules: [],
        githubInstallationId: null,
        githubRepoFullName: null,
        githubRepoUrl: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        _count: { epics: 0, tasks: 0 },
        progress: 0,
        activeCount: 0,
        blockedCount: 0,
        recentAssignees: [],
        tasks: [],
      },
      {
        id: 'proj-2',
        orgId,
        name: 'Project 2',
        key: 'PROJ2',
        description: null,
        modules: [],
        githubInstallationId: null,
        githubRepoFullName: null,
        githubRepoUrl: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        _count: { epics: 0, tasks: 0 },
        progress: 0,
        activeCount: 0,
        blockedCount: 0,
        recentAssignees: [],
        tasks: [],
      },
    ];

    vi.mocked(mockRepo.findManyWithAnalytics).mockResolvedValue(expectedProjects);

    const result = await getProjects(orgId, { projectRepository: mockRepo });

    expect(result).toEqual(expectedProjects);
    expect(mockRepo.findManyWithAnalytics).toHaveBeenCalledWith(orgId);
  });
});

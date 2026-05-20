import { describe, it, expect, vi, beforeEach } from 'vitest';
import { searchTasks } from './search-tasks';
import type { TaskRepository } from '@/infra/adapters/prisma';
import type { TaskWithReadableId } from '@/shared/types';

describe('searchTasks', () => {
  const mockRepo = {
    create: vi.fn(),
    findById: vi.fn(),
    findMany: vi.fn(),
    count: vi.fn(),
    update: vi.fn(),
    updateStatus: vi.fn(),
    delete: vi.fn(),
  } as unknown as TaskRepository;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return paginated tasks and total count', async () => {
    const orgId = 'org-1';
    const filters = { page: 1, pageSize: 10, status: 'TODO' as const };

    const expectedTasks: TaskWithReadableId[] = [
      {
        id: 'task-1',
        orgId,
        featureId: 'feat-1',
        projectId: 'proj-1',
        localId: 1,
        readableId: 'PROJ-1',
        title: 'Task 1',
        status: 'TODO',
        type: 'TASK',
        priority: 'MEDIUM',
        description: null,
        modules: [],
        assigneeId: null,
        blocked: false,
        statusChangedAt: new Date(),
        points: null,
        feature: {} as any, // Simple mock for nested
        assignee: undefined,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];
    const totalCount = 1;

    vi.mocked(mockRepo.findMany).mockResolvedValue(expectedTasks);
    vi.mocked(mockRepo.count).mockResolvedValue(totalCount);

    const result = await searchTasks(orgId, filters, { taskRepository: mockRepo });

    expect(result).toEqual({
      items: expectedTasks,
      nextCursor: null,
      total: totalCount,
      page: 1,
      pageSize: 10,
      totalPages: 1,
    });
    expect(mockRepo.findMany).toHaveBeenCalledWith(orgId, filters);
    expect(mockRepo.count).toHaveBeenCalledWith(orgId, filters);
  });

  it('should skip count query when skipCount=true', async () => {
    const orgId = 'org-1';
    const filters = { page: 1, pageSize: 10, skipCount: true };

    const expectedTasks: TaskWithReadableId[] = [
      {
        id: 'task-1',
        orgId,
        featureId: 'feat-1',
        projectId: 'proj-1',
        localId: 1,
        readableId: 'PROJ-1',
        title: 'Task 1',
        status: 'TODO',
        type: 'TASK',
        priority: 'MEDIUM',
        description: null,
        modules: [],
        assigneeId: null,
        statusChangedAt: new Date(),
        points: null,
        feature: {} as any,
        assignee: undefined,
        createdAt: new Date(),
        updatedAt: new Date(),
        blocked: false,
      },
    ];

    vi.mocked(mockRepo.findMany).mockResolvedValue(expectedTasks);

    const result = await searchTasks(orgId, filters, { taskRepository: mockRepo });

    // Total deve ser -1 quando skipCount=true
    expect(result).toEqual({
      items: expectedTasks,
      nextCursor: null,
      total: -1,
      page: 1,
      pageSize: 10,
      totalPages: -1,
    });

    // count() NÃO deve ter sido chamado
    expect(mockRepo.findMany).toHaveBeenCalledWith(orgId, filters);
    expect(mockRepo.count).not.toHaveBeenCalled();
  });
});

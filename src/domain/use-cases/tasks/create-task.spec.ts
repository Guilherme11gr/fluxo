import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createTask } from './create-task';
import type { TaskRepository } from '@/infra/adapters/prisma';
import type { Task } from '@/shared/types';

describe('createTask', () => {
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

  const mockFeatureRepository = {
    findById: vi.fn(),
    findSystemFeature: vi.fn(),
    update: vi.fn(),
  } as any;

  it('should create a task successfully', async () => {
    const input = {
      orgId: 'org-1',
      featureId: 'feat-1',
      title: 'New Task',
      projectId: 'proj-1',
      description: 'Task description',
      type: 'TASK' as const,
      priority: 'MEDIUM' as const,
      points: 3 as const,
    };

    const expectedTask: Task = {
      id: 'task-1',
      orgId: input.orgId,
      featureId: input.featureId,
      projectId: 'proj-1',
      localId: 1,
      title: input.title,
      description: input.description,
      status: 'TODO',
      type: input.type,
      priority: input.priority,
      points: input.points,
      createdAt: new Date(),
      updatedAt: new Date(),
      modules: [],
      assigneeId: null, // default
      blocked: false,
      statusChangedAt: null,
    };

    vi.mocked(mockRepo.create).mockResolvedValue(expectedTask);
    vi.mocked(mockFeatureRepository.findById).mockResolvedValue({ id: 'feat-1', status: 'TODO' });

    const result = await createTask(input, {
      taskRepository: mockRepo,
      featureRepository: mockFeatureRepository,
    });

    expect(result).toEqual(expectedTask);
    expect(mockRepo.create).toHaveBeenCalledWith(input);
  });

  it('should reopen a done feature when creating an active task', async () => {
    const input = {
      orgId: 'org-1',
      featureId: 'feat-1',
      title: 'Follow-up Task',
      status: 'DOING' as const,
    };

    vi.mocked(mockFeatureRepository.findById).mockResolvedValue({ id: 'feat-1', status: 'DONE' });
    vi.mocked(mockRepo.create).mockResolvedValue({
      id: 'task-2',
      orgId: 'org-1',
      featureId: 'feat-1',
      projectId: 'proj-1',
      localId: 2,
      title: 'Follow-up Task',
      description: null,
      status: 'DOING',
      type: 'TASK',
      priority: 'MEDIUM',
      points: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      modules: [],
      assigneeId: null,
      blocked: false,
      statusChangedAt: null,
    } as Task);

    await createTask(input, {
      taskRepository: mockRepo,
      featureRepository: mockFeatureRepository,
    });

    expect(mockRepo.create).toHaveBeenCalledWith(expect.objectContaining({ featureId: 'feat-1', status: 'DOING' }));
  });
});

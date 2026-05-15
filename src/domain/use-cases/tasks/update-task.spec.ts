import { describe, it, expect, vi, beforeEach } from 'vitest';
import { updateTask } from './update-task';
import { NotFoundError } from '@/shared/errors';
import type { TaskRepository, AuditLogRepository } from '@/infra/adapters/prisma';
import type { Task } from '@/shared/types';

describe('updateTask', () => {
  const mockRepo = {
    create: vi.fn(),
    findById: vi.fn(),
    findMany: vi.fn(),
    count: vi.fn(),
    update: vi.fn(),
    updateStatus: vi.fn(),
    delete: vi.fn(),
  } as unknown as TaskRepository;

  const mockAuditRepo = {
    log: vi.fn(),
  } as unknown as AuditLogRepository;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should update the task successfully', async () => {
    const id = 'task-1';
    const orgId = 'org-1';
    const userId = 'user-1';
    const input = {
      title: 'Updated Task',
      points: 5 as const,
    };

    const existingTask: Task = {
      id,
      orgId,
      featureId: 'feat-1',
      projectId: 'proj-1',
      localId: 1,
      title: 'Old Task',
      status: 'TODO',
      type: 'TASK',
      priority: 'MEDIUM',
      points: 3,
      description: null,
      modules: [],
      assigneeId: null,
      blocked: false,
      statusChangedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const updatedTask: Task = {
      ...existingTask,
      ...input,
      updatedAt: new Date(),
    };

    vi.mocked(mockRepo.findById).mockResolvedValue(existingTask);
    vi.mocked(mockRepo.update).mockResolvedValue(updatedTask);

    const result = await updateTask(id, orgId, userId, input, { 
      taskRepository: mockRepo,
      auditLogRepository: mockAuditRepo,
    });

    expect(result).toEqual(updatedTask);
    expect(mockRepo.update).toHaveBeenCalledWith(id, orgId, input);
    expect(mockAuditRepo.log).not.toHaveBeenCalled(); // No significant changes
  });

  it('should create audit log when status changes', async () => {
    const id = 'task-1';
    const orgId = 'org-1';
    const userId = 'user-1';
    const input = {
      status: 'DOING' as const,
    };

    const existingTask: Task = {
      id,
      orgId,
      featureId: 'feat-1',
      projectId: 'proj-1',
      localId: 1,
      title: 'Test Task',
      status: 'TODO',
      type: 'TASK',
      priority: 'MEDIUM',
      points: null,
      description: null,
      modules: [],
      assigneeId: null,
      blocked: false,
      statusChangedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const updatedTask: Task = {
      ...existingTask,
      status: 'DOING',
      updatedAt: new Date(),
    };

    vi.mocked(mockRepo.findById).mockResolvedValue(existingTask);
    vi.mocked(mockRepo.update).mockResolvedValue(updatedTask);

    await updateTask(id, orgId, userId, input, { 
      taskRepository: mockRepo,
      auditLogRepository: mockAuditRepo,
    });

    expect(mockAuditRepo.log).toHaveBeenCalledWith(
      expect.objectContaining({
        orgId,
        userId,
        action: 'task.status.changed',
        targetType: 'task',
        targetId: id,
      })
    );
  });

  it('should include agent metadata in audit log when context is provided', async () => {
    const id = 'task-1';
    const orgId = 'org-1';
    const userId = 'user-1';
    const input = {
      status: 'DONE' as const,
    };

    const existingTask: Task = {
      id,
      orgId,
      featureId: 'feat-1',
      projectId: 'proj-1',
      localId: 42,
      title: 'Agent Test Task',
      status: 'DOING',
      type: 'TASK',
      priority: 'MEDIUM',
      points: null,
      description: null,
      modules: [],
      assigneeId: null,
      blocked: false,
      statusChangedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const updatedTask: Task = {
      ...existingTask,
      status: 'DONE',
      updatedAt: new Date(),
    };

    vi.mocked(mockRepo.findById).mockResolvedValue(existingTask);
    vi.mocked(mockRepo.update).mockResolvedValue(updatedTask);

    await updateTask(id, orgId, userId, input, { 
      taskRepository: mockRepo,
      auditLogRepository: mockAuditRepo,
    }, {
      source: 'agent',
      agentName: 'Gepeto',
      keyPrefix: 'abcd',
      authMethod: 'tenant_api_key',
      metadata: {
        changeReason: 'PR foi mergeado',
        aiReasoning: 'Task relacionada ao PR #123',
      }
    });

    expect(mockAuditRepo.log).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          source: 'agent',
          agentName: 'Gepeto',
          changeReason: 'PR foi mergeado',
          aiReasoning: 'Task relacionada ao PR #123',
          fromStatus: 'DOING',
          toStatus: 'DONE',
          taskTitle: 'Agent Test Task',
          localId: 42,
        })
      })
    );
  });

  it('should throw NotFoundError if task does not exist', async () => {
    const id = 'task-1';
    const orgId = 'org-1';
    const userId = 'user-1';
    const input = { title: 'Updated Task' };

    vi.mocked(mockRepo.findById).mockResolvedValue(null);

    await expect(updateTask(id, orgId, userId, input, { 
      taskRepository: mockRepo,
      auditLogRepository: mockAuditRepo,
    }))
      .rejects.toThrow(NotFoundError);
  });
});

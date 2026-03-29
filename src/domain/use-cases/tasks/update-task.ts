import type { Task, TaskStatus, TaskType, TaskPriority, StoryPoints } from '@/shared/types';
import type { TaskRepository, AuditLogRepository } from '@/infra/adapters/prisma';
import { NotFoundError } from '@/shared/errors';
import { AUDIT_ACTIONS } from '@/infra/adapters/prisma/audit-log.repository';
import type { AgentProvidedMetadata } from '@/shared/types/audit-metadata';

export interface UpdateTaskInput {
  title?: string;
  description?: string | null;
  status?: TaskStatus;
  type?: TaskType;
  priority?: TaskPriority;
  points?: StoryPoints | null;
  modules?: string[];
  assigneeId?: string | null;
  blocked?: boolean;
  blockReason?: string | null; // ✅ null explícito (não undefined)
  blockedAt?: Date | null; // Timestamp do bloqueio
  blockedBy?: string | null; // User ID que bloqueou
}

/**
 * Contexto de automação (agente)
 */
export interface AutomationContext {
  source: 'agent';
  agentName: string;
  metadata?: AgentProvidedMetadata;
}

/**
 * Contexto de ação humana
 */
export interface HumanContext {
  source: 'human';
}

export type ActionContext = AutomationContext | HumanContext;

export interface UpdateTaskDeps {
  taskRepository: TaskRepository;
  auditLogRepository: AuditLogRepository;
}

export async function updateTask(
  id: string,
  orgId: string,
  userId: string,
  input: UpdateTaskInput,
  deps: UpdateTaskDeps,
  context?: ActionContext
): Promise<Task> {
  const { taskRepository, auditLogRepository } = deps;

  const existing = await taskRepository.findById(id, orgId);
  if (!existing) {
    throw new NotFoundError('Task', id);
  }

  const updated = await taskRepository.update(id, orgId, input);

  // Build base metadata based on context
  // Note: projectKey is not available here since findById returns Task without relations
  // The UI can fetch it from the task if needed via targetId
  const baseMetadata = {
    source: context?.source || 'human',
    ...(context?.source === 'agent' && {
      agentName: context.agentName,
      ...(context.metadata && {
        changeReason: context.metadata.changeReason,
        aiReasoning: context.metadata.aiReasoning,
        relatedTaskIds: context.metadata.relatedTaskIds,
      }),
    }),
    taskTitle: existing.title,
    localId: existing.localId,
  };

  // Create audit logs for significant changes
  const auditPromises: Promise<any>[] = [];

  // Status changed
  if (input.status && input.status !== existing.status) {
    auditPromises.push(
      auditLogRepository.log({
        orgId,
        userId,
        action: AUDIT_ACTIONS.TASK_STATUS_CHANGED,
        targetType: 'task',
        targetId: id,
        metadata: {
          ...baseMetadata,
          fromStatus: existing.status,
          toStatus: input.status,
        }
      })
    );
  }

  // Assignee changed
  if (input.assigneeId !== undefined && input.assigneeId !== existing.assigneeId) {
    auditPromises.push(
      auditLogRepository.log({
        orgId,
        userId,
        action: AUDIT_ACTIONS.TASK_ASSIGNED,
        targetType: 'task',
        targetId: id,
        metadata: {
          ...baseMetadata,
          fromAssigneeId: existing.assigneeId,
          toAssigneeId: input.assigneeId,
        }
      })
    );
  }

  // Blocked status changed
  if (input.blocked !== undefined && input.blocked !== existing.blocked) {
    auditPromises.push(
      auditLogRepository.log({
        orgId,
        userId,
        action: input.blocked ? 'task.blocked' : 'task.unblocked',
        targetType: 'task',
        targetId: id,
        metadata: baseMetadata
      })
    );
  }

  // Execute all audit logs in parallel (best-effort, don't block success)
  if (auditPromises.length > 0) {
    await Promise.allSettled(auditPromises);
  }

  return updated;
}

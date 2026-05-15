import type { Task, TaskStatus, TaskType, TaskPriority, StoryPoints, TaskFocus } from '@/shared/types';
import type { TaskRepository, AuditLogRepository, AgentRepository } from '@/infra/adapters/prisma';
import { NotFoundError, ValidationError } from '@/shared/errors';
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
  assigneeAgentId?: string | null;
  blocked?: boolean;
  blockReason?: string | null;
  blockedAt?: Date | null;
  blockedBy?: string | null;
  focus?: TaskFocus | null;
  githubPrUrl?: string | null;
  githubPrNumber?: number | null;
  githubPrStatus?: 'open' | 'closed' | 'merged' | null;
}

/**
 * Contexto de automação (agente)
 */
export interface AutomationContext {
  source: 'agent';
  agentName: string;
  keyPrefix: string;
  authMethod: 'tenant_api_key';
  keyId?: string;
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
  agentRepository?: AgentRepository;
}

export async function updateTask(
  id: string,
  orgId: string,
  userId: string,
  input: UpdateTaskInput,
  deps: UpdateTaskDeps,
  context?: ActionContext
): Promise<Task> {
  const { taskRepository, auditLogRepository, agentRepository } = deps;

  const existing = await taskRepository.findById(id, orgId);
  if (!existing) {
    throw new NotFoundError('Task', id);
  }

  if (input.assigneeId && input.assigneeAgentId) {
    throw new ValidationError('Task não pode ser atribuída simultaneamente a usuário e agent');
  }

  if (input.assigneeAgentId && agentRepository) {
    const assigneeAgent = await agentRepository.findById(input.assigneeAgentId);
    if (!assigneeAgent || assigneeAgent.orgId !== orgId) {
      throw new ValidationError('Agent responsável inválido para esta organização');
    }
    if (assigneeAgent.projectId && assigneeAgent.projectId !== existing.projectId) {
      throw new ValidationError('Agent responsável não pertence ao projeto desta task');
    }
  }

  const normalizedInput: UpdateTaskInput = { ...input };
  if (input.assigneeId) {
    normalizedInput.assigneeAgentId = null;
  }
  if (input.assigneeAgentId) {
    normalizedInput.assigneeId = null;
  }

  const updated = await taskRepository.update(id, orgId, normalizedInput);

  // Build base metadata based on context
  // Note: projectKey is not available here since findById returns Task without relations
  // The UI can fetch it from the task if needed via targetId
  const baseMetadata = {
    source: context?.source || 'human',
    ...(context?.source === 'agent' && {
      agentName: context.agentName,
      keyPrefix: context.keyPrefix,
      authMethod: context.authMethod,
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
  if (normalizedInput.status && normalizedInput.status !== existing.status) {
    auditPromises.push(
      auditLogRepository.log({
        orgId,
        userId,
        action: AUDIT_ACTIONS.TASK_STATUS_CHANGED,
        targetType: 'task',
        targetId: id,
        actorType: context?.source === 'agent' ? 'agent' : 'user',
        clientId: context?.source === 'agent' ? context.keyId : undefined,
        metadata: {
          ...baseMetadata,
          fromStatus: existing.status,
          toStatus: normalizedInput.status,
        }
      })
    );
  }

  // Assignee changed
  if (normalizedInput.assigneeId !== undefined && normalizedInput.assigneeId !== existing.assigneeId) {
    auditPromises.push(
      auditLogRepository.log({
        orgId,
        userId,
        action: AUDIT_ACTIONS.TASK_ASSIGNED,
        targetType: 'task',
        targetId: id,
        actorType: context?.source === 'agent' ? 'agent' : 'user',
        clientId: context?.source === 'agent' ? context.keyId : undefined,
        metadata: {
          ...baseMetadata,
          fromAssigneeId: existing.assigneeId,
          toAssigneeId: normalizedInput.assigneeId,
        }
      })
    );
  }

  if (normalizedInput.assigneeAgentId !== undefined && normalizedInput.assigneeAgentId !== existing.assigneeAgentId) {
    auditPromises.push(
      auditLogRepository.log({
        orgId,
        userId,
        action: AUDIT_ACTIONS.TASK_ASSIGNED,
        targetType: 'task',
        targetId: id,
        actorType: context?.source === 'agent' ? 'agent' : 'user',
        clientId: context?.source === 'agent' ? context.keyId : undefined,
        metadata: {
          ...baseMetadata,
          fromAssigneeAgentId: existing.assigneeAgentId,
          toAssigneeAgentId: normalizedInput.assigneeAgentId,
        }
      })
    );
  }

  // Blocked status changed
  if (normalizedInput.blocked !== undefined && normalizedInput.blocked !== existing.blocked) {
    auditPromises.push(
      auditLogRepository.log({
        orgId,
        userId,
        action: normalizedInput.blocked ? 'task.blocked' : 'task.unblocked',
        targetType: 'task',
        targetId: id,
        actorType: context?.source === 'agent' ? 'agent' : 'user',
        clientId: context?.source === 'agent' ? context.keyId : undefined,
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

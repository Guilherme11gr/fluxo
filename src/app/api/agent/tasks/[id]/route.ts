/**
 * Agent API - Task by ID
 * 
 * GET /api/agent/tasks/:id - Get task by ID
 * PATCH /api/agent/tasks/:id - Update task
 * DELETE /api/agent/tasks/:id - Delete task
 */

import { NextRequest } from 'next/server';
import { z } from 'zod';
import { extractAgentAuth } from '@/shared/http/agent-auth';
import { agentSuccess, agentError, handleAgentError } from '@/shared/http/agent-responses';
import { taskRepository, taskTagRepository, auditLogRepository } from '@/infra/adapters/prisma';
import { updateTask } from '@/domain/use-cases/tasks/update-task';

export const dynamic = 'force-dynamic';

// ============ GET - Get Task by ID ============

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { orgId } = await extractAgentAuth();
    const { id } = await params;

    if (!z.string().uuid().safeParse(id).success) {
      return agentError('VALIDATION_ERROR', 'Invalid task ID', 400);
    }

    const task = await taskRepository.findByIdWithRelations(id, orgId);
    if (!task) {
      return agentError('NOT_FOUND', 'Task not found', 404);
    }

    return agentSuccess(task);
  } catch (error) {
    return handleAgentError(error);
  }
}

// ============ PATCH - Update Task ============

const agentMetadataSchema = z.object({
  changeReason: z.string().optional(),
  aiReasoning: z.string().optional(),
  relatedTaskIds: z.array(z.string().uuid()).optional(),
}).optional();

const updateTaskSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().optional(),
  type: z.enum(['TASK', 'BUG']).optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).optional(),
  status: z.enum(['BACKLOG', 'TODO', 'DOING', 'REVIEW', 'QA_READY', 'DONE']).optional(),
  blocked: z.boolean().optional(),
  assigneeId: z.string().uuid().nullable().optional(),
  tagIds: z.array(z.string().uuid()).optional(),
  // Agent-provided metadata (optional)
  _metadata: agentMetadataSchema,
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { orgId, userId, agentName, keyPrefix, authMethod, keyId } = await extractAgentAuth();
    const { id } = await params;

    if (!z.string().uuid().safeParse(id).success) {
      return agentError('VALIDATION_ERROR', 'Invalid task ID', 400);
    }

    const body = await request.json();
    const parsed = updateTaskSchema.safeParse(body);

    if (!parsed.success) {
      return agentError('VALIDATION_ERROR', parsed.error.issues[0].message, 400);
    }

    // Extract metadata before filtering
    const agentMetadata = parsed.data._metadata;
    const tagIds = parsed.data.tagIds;

    // Filter out undefined values, _metadata, and tagIds
    const updateData = Object.fromEntries(
      Object.entries(parsed.data).filter(([k, v]) => k !== '_metadata' && k !== 'tagIds' && v !== undefined)
    );

    // Handle tag assignment FIRST (validate before updating task fields)
    // This ensures tag validation happens before any task mutation
    if (tagIds !== undefined) {
      await taskTagRepository.assignToTask(id, tagIds, orgId);
    }

    // Update task fields (if any non-tag fields provided)
    let updated;
    if (Object.keys(updateData).length > 0) {
      updated = await updateTask(id, orgId, userId, updateData, { 
        taskRepository,
        auditLogRepository
      }, {
        source: 'agent',
        agentName,
        keyPrefix,
        authMethod,
        keyId,
        metadata: agentMetadata,
      });
    }

    // Audit log for tag changes (best-effort, after successful operations)
    if (tagIds !== undefined) {
      await auditLogRepository.log({
        orgId,
        userId,
        action: 'task.tags.set',
        targetType: 'task',
        targetId: id,
        actorType: 'agent',
        clientId: keyId,
        metadata: {
          source: 'agent',
          agentName,
          keyPrefix,
          authMethod,
          tagIds,
        },
      }).catch((err) => console.error('[agent-api] Audit log failed for task.tags.set:', err));
    }

    // Return task with tags
    const result = await taskRepository.findByIdWithRelations(id, orgId);
    if (!result) {
      return agentError('NOT_FOUND', 'Task not found', 404);
    }
    return agentSuccess(result);
  } catch (error) {
    return handleAgentError(error);
  }
}

// ============ DELETE - Delete Task ============

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { orgId } = await extractAgentAuth();
    const { id } = await params;

    if (!z.string().uuid().safeParse(id).success) {
      return agentError('VALIDATION_ERROR', 'Invalid task ID', 400);
    }

    // Verify task exists and belongs to org
    const task = await taskRepository.findById(id, orgId);
    if (!task) {
      return agentError('NOT_FOUND', 'Task not found', 404);
    }

    await taskRepository.delete(id, orgId);
    return agentSuccess({ deleted: true, id });
  } catch (error) {
    return handleAgentError(error);
  }
}

/**
 * Agent API - Tasks List & Create
 * 
 * GET /api/agent/tasks - List tasks with filters
 * POST /api/agent/tasks - Create a new task
 */

import { NextRequest } from 'next/server';
import { z } from 'zod';
import { extractAgentAuth } from '@/shared/http/agent-auth';
import { agentList, agentSuccess, agentError, handleAgentError } from '@/shared/http/agent-responses';
import { taskRepository, featureRepository, auditLogRepository } from '@/infra/adapters/prisma';

export const dynamic = 'force-dynamic';

// ============ GET - List Tasks ============

const listQuerySchema = z.object({
  featureId: z.string().uuid().optional(),
  epicId: z.string().uuid().optional(),
  projectId: z.string().uuid().optional(),
  status: z.enum(['BACKLOG', 'TODO', 'DOING', 'REVIEW', 'QA_READY', 'DONE']).optional(),
  type: z.enum(['TASK', 'BUG']).optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).optional(),
  assigneeId: z.string().uuid().optional(),
  assigneeAgentId: z.string().uuid().optional(),
  tagId: z.string().uuid().optional(),
  blocked: z.enum(['true', 'false']).transform((val) => val === 'true').optional(),
  search: z.string().optional(),
  limit: z.coerce.number().min(1).max(100).default(50),
});

export async function GET(request: NextRequest) {
  try {
    const { orgId } = await extractAgentAuth();

    const { searchParams } = new URL(request.url);
    const query = listQuerySchema.safeParse({
      featureId: searchParams.get('featureId') || undefined,
      epicId: searchParams.get('epicId') || undefined,
      projectId: searchParams.get('projectId') || undefined,
      status: searchParams.get('status') || undefined,
      type: searchParams.get('type') || undefined,
      priority: searchParams.get('priority') || undefined,
      assigneeId: searchParams.get('assigneeId') || undefined,
      assigneeAgentId: searchParams.get('assigneeAgentId') || undefined,
      tagId: searchParams.get('tagId') || undefined,
      blocked: searchParams.get('blocked') || undefined,
      search: searchParams.get('search') || undefined,
      limit: searchParams.get('limit') || 50,
    });

    if (!query.success) {
      return agentError('VALIDATION_ERROR', 'Invalid query parameters', 400);
    }

    const {
      featureId, epicId, projectId, status,
      type, priority, assigneeId, assigneeAgentId, tagId, blocked, search,
      limit
    } = query.data;

    // Build filter object
    const filter: Record<string, unknown> = {};
    if (featureId) filter.featureId = featureId;
    if (projectId) filter.projectId = projectId;
    if (status) filter.status = status;
    if (type) filter.type = type;
    if (priority) filter.priority = priority;
    if (assigneeId) filter.assigneeId = assigneeId;
    if (assigneeAgentId) filter.assigneeAgentId = assigneeAgentId;
    if (tagId) filter.tagId = tagId;
    if (blocked !== undefined) filter.blocked = blocked;
    if (search) filter.search = search;
    if (epicId) filter.epicId = epicId;

    // Fix: Explicitly map limit to pageSize to override repository default (20)
    filter.pageSize = limit;

    const tasks = await taskRepository.findMany(orgId, filter);
    const limited = tasks.slice(0, limit);

    return agentList(limited, tasks.length);
  } catch (error) {
    return handleAgentError(error);
  }
}

// ============ POST - Create Task ============

const agentMetadataSchema = z.object({
  changeReason: z.string().optional(),
  aiReasoning: z.string().optional(),
  relatedTaskIds: z.array(z.string().uuid()).optional(),
}).optional();

const createTaskSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  featureId: z.string().uuid('Invalid feature ID'),
  description: z.string().optional(),
  type: z.enum(['TASK', 'BUG']).default('TASK'),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).default('MEDIUM'),
  status: z.enum(['BACKLOG', 'TODO', 'DOING', 'REVIEW', 'QA_READY', 'DONE']).default('BACKLOG'),
  _metadata: agentMetadataSchema,
});

export async function POST(request: NextRequest) {
  try {
    const { orgId, userId, agentName, keyPrefix, authMethod, keyId } = await extractAgentAuth();

    const body = await request.json();
    const parsed = createTaskSchema.safeParse(body);

    if (!parsed.success) {
      return agentError('VALIDATION_ERROR', parsed.error.issues[0].message, 400);
    }

    const { title, featureId, description, type, priority, status, _metadata: agentMetadata } = parsed.data;

    // Verify feature exists
    const feature = await featureRepository.findById(featureId, orgId);
    if (!feature) {
      return agentError('NOT_FOUND', 'Feature not found', 404);
    }

    const task = await taskRepository.create({
      title,
      featureId,
      description: description || null,
      type,
      priority,
      status,
      orgId,
    });

    // Create audit log for task creation
    await auditLogRepository.log({
      orgId,
      userId,
      action: 'task.created',
      targetType: 'task',
      targetId: task.id,
      metadata: {
        source: 'agent',
        agentName,
        keyPrefix,
        authMethod,
        taskTitle: title,
        localId: task.localId,
        type,
        priority,
        status,
        featureId,
        ...(agentMetadata && {
          changeReason: agentMetadata.changeReason,
          aiReasoning: agentMetadata.aiReasoning,
          relatedTaskIds: agentMetadata.relatedTaskIds,
        }),
      },
      actorType: 'agent',
      clientId: keyId,
    }).catch(() => {}); // Best-effort, don't fail task creation

    return agentSuccess(task, 201);
  } catch (error) {
    return handleAgentError(error);
  }
}

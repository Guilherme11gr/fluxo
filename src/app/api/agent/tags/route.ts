/**
 * Agent API - Task Tags List & Create
 *
 * GET /api/agent/tags - List tags for a project
 * POST /api/agent/tags - Create a new tag (with optional color)
 */

import { NextRequest } from 'next/server';
import { z } from 'zod';
import { extractAgentAuth } from '@/shared/http/agent-auth';
import { agentList, agentSuccess, agentError, handleAgentError } from '@/shared/http/agent-responses';
import { taskTagRepository, auditLogRepository } from '@/infra/adapters/prisma';

export const dynamic = 'force-dynamic';

const listQuerySchema = z.object({
  projectId: z.string().uuid(),
  limit: z.coerce.number().min(1).max(100).default(50),
});

export async function GET(request: NextRequest) {
  try {
    const { orgId } = await extractAgentAuth();

    const { searchParams } = new URL(request.url);
    const query = listQuerySchema.safeParse({
      projectId: searchParams.get('projectId'),
      limit: searchParams.get('limit') || 50,
    });

    if (!query.success) {
      return agentError('VALIDATION_ERROR', 'projectId is required', 400);
    }

    const { projectId, limit } = query.data;

    const tags = await taskTagRepository.findByProject(projectId, orgId);
    const limited = tags.slice(0, limit);

    return agentList(limited, tags.length);
  } catch (error) {
    return handleAgentError(error);
  }
}

const createTagSchema = z.object({
  name: z.string().min(1, 'Name is required').max(50, 'Name too long'),
  projectId: z.string().uuid('Invalid project ID'),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
});

export async function POST(request: NextRequest) {
  try {
    const { orgId, userId, agentName, keyPrefix, authMethod, keyId } = await extractAgentAuth();

    const body = await request.json();
    const parsed = createTagSchema.safeParse(body);

    if (!parsed.success) {
      return agentError('VALIDATION_ERROR', parsed.error.issues[0].message, 400);
    }

    const { name, projectId, color } = parsed.data;

    const existing = await taskTagRepository.findByProject(projectId, orgId);
    if (existing.some((t) => t.name.toLowerCase() === name.toLowerCase())) {
      return agentError('CONFLICT', 'Tag with this name already exists', 409);
    }

    const tag = await taskTagRepository.create(orgId, {
      name,
      projectId,
      color: color ?? '#6366f1',
    });

    await auditLogRepository.log({
      orgId,
      userId,
      action: 'tag.created',
      targetType: 'project_tag',
      targetId: tag.id,
      actorType: 'agent',
      clientId: keyId,
      metadata: {
        source: 'agent',
        agentName,
        keyPrefix,
        authMethod,
        name: tag.name,
        projectId: tag.projectId,
      },
    }).catch(() => {});

    return agentSuccess(tag, 201);
  } catch (error) {
    return handleAgentError(error);
  }
}

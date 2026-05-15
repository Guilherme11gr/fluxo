/**
 * Agent API - Project Docs List & Create
 * 
 * GET /api/agent/docs - List docs with filters
 * POST /api/agent/docs - Create a new doc
 */

import { NextRequest } from 'next/server';
import { z } from 'zod';
import { extractAgentAuth } from '@/shared/http/agent-auth';
import { agentList, agentSuccess, agentError, handleAgentError } from '@/shared/http/agent-responses';
import { projectDocRepository, projectRepository, auditLogRepository, docChunksRepository } from '@/infra/adapters/prisma';

export const dynamic = 'force-dynamic';

// ============ GET - List Docs ============

const listQuerySchema = z.object({
  projectId: z.string().uuid(),
  tagId: z.string().uuid().optional(),
  limit: z.coerce.number().min(1).max(100).default(50),
});

export async function GET(request: NextRequest) {
  try {
    const { orgId } = await extractAgentAuth();

    const { searchParams } = new URL(request.url);
    const query = listQuerySchema.safeParse({
      projectId: searchParams.get('projectId'),
      tagId: searchParams.get('tagId') || undefined,
      limit: searchParams.get('limit') || 50,
    });

    if (!query.success) {
      if (!searchParams.get('projectId')) {
        return agentError('VALIDATION_ERROR', 'projectId is required', 400);
      }

      return agentError('VALIDATION_ERROR', query.error.issues[0].message, 400);
    }

    const { projectId, tagId, limit } = query.data;

    const docs = await projectDocRepository.findByProjectId(projectId, orgId);
    const filtered = tagId
      ? docs.filter((doc) => doc.tags?.some((assignment) => assignment.tag.id === tagId))
      : docs;
    const limited = filtered.slice(0, limit);

    return agentList(limited, filtered.length);
  } catch (error) {
    return handleAgentError(error);
  }
}

// ============ POST - Create Doc ============

const createDocSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  projectId: z.string().uuid('Invalid project ID'),
  content: z.string().min(1, 'Content is required'),
  tagIds: z.array(z.string().uuid()).optional(),
});

export async function POST(request: NextRequest) {
  try {
    const { orgId, userId, agentName, keyPrefix, authMethod, keyId } = await extractAgentAuth();

    const body = await request.json();
    const parsed = createDocSchema.safeParse(body);

    if (!parsed.success) {
      return agentError('VALIDATION_ERROR', parsed.error.issues[0].message, 400);
    }

    const { title, projectId, content, tagIds } = parsed.data;

    // Verify project exists
    const project = await projectRepository.findById(projectId, orgId);
    if (!project) {
      return agentError('NOT_FOUND', 'Project not found', 404);
    }

    const doc = await projectDocRepository.create({
      title,
      projectId,
      content,
      tagIds,
      orgId,
    });

    const createdDoc = await projectDocRepository.findByIdWithTags(doc.id, orgId);

    // Index chunks for semantic search (fire-and-forget, non-blocking)
    docChunksRepository.indexDoc(doc.id, orgId, title, content).catch((err) => {
      console.error('[Agent Docs] Chunk indexing failed for new doc', doc.id, err);
    });

    await auditLogRepository.log({
      orgId,
      userId,
      action: 'doc.created',
      targetType: 'project_doc',
      targetId: doc.id,
      actorType: 'agent',
      clientId: keyId,
      metadata: {
        source: 'agent',
        agentName,
        keyPrefix,
        authMethod,
        title: doc.title,
        projectId: doc.projectId,
        tagIds,
      },
    }).catch(() => {});

    return agentSuccess(createdDoc ?? doc, 201);
  } catch (error) {
    return handleAgentError(error);
  }
}

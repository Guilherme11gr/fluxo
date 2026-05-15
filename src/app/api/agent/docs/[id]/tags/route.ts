/**
 * Agent API - Document Tags
 *
 * GET /api/agent/docs/:id/tags - Get tags for a document
 * PUT /api/agent/docs/:id/tags - Set tags for a document (replaces all)
 * POST /api/agent/docs/:id/tags - Add tags to a document (append)
 */

import { NextRequest } from 'next/server';
import { z } from 'zod';
import { extractAgentAuth } from '@/shared/http/agent-auth';
import { agentSuccess, agentError, handleAgentError } from '@/shared/http/agent-responses';
import { auditLogRepository, docTagRepository, projectDocRepository } from '@/infra/adapters/prisma';

export const dynamic = 'force-dynamic';

const paramsSchema = z.string().uuid();

const setTagsSchema = z.object({
  tagIds: z.array(z.string().uuid()).default([]),
});

const addTagsSchema = z.object({
  tagIds: z.array(z.string().uuid()).min(1, 'At least one tag ID is required'),
});

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { orgId } = await extractAgentAuth();
    const { id } = await params;

    if (!paramsSchema.safeParse(id).success) {
      return agentError('VALIDATION_ERROR', 'Invalid doc ID', 400);
    }

    const doc = await projectDocRepository.findById(id, orgId);
    if (!doc) {
      return agentError('NOT_FOUND', 'Doc not found', 404);
    }

    const tags = await docTagRepository.findTagsByDocId(id, orgId);
    return agentSuccess(tags);
  } catch (error) {
    return handleAgentError(error);
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { orgId, userId, agentName, keyPrefix, authMethod, keyId } = await extractAgentAuth();
    const { id } = await params;

    if (!paramsSchema.safeParse(id).success) {
      return agentError('VALIDATION_ERROR', 'Invalid doc ID', 400);
    }

    const doc = await projectDocRepository.findById(id, orgId);
    if (!doc) {
      return agentError('NOT_FOUND', 'Doc not found', 404);
    }

    const body = await request.json();
    const parsed = setTagsSchema.safeParse(body);

    if (!parsed.success) {
      return agentError('VALIDATION_ERROR', parsed.error.issues[0].message, 400);
    }

    await projectDocRepository.update(id, orgId, { tagIds: parsed.data.tagIds });

    await auditLogRepository.log({
      orgId,
      userId,
      action: 'doc.tags.set',
      targetType: 'project_doc',
      targetId: id,
      actorType: 'agent',
      clientId: keyId,
      metadata: {
        source: 'agent',
        agentName,
        keyPrefix,
        authMethod,
        tagIds: parsed.data.tagIds,
      },
    }).catch(() => {});

    const tags = await docTagRepository.findTagsByDocId(id, orgId);
    return agentSuccess(tags);
  } catch (error) {
    return handleAgentError(error);
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { orgId, userId, agentName, keyPrefix, authMethod, keyId } = await extractAgentAuth();
    const { id } = await params;

    if (!paramsSchema.safeParse(id).success) {
      return agentError('VALIDATION_ERROR', 'Invalid doc ID', 400);
    }

    const doc = await projectDocRepository.findById(id, orgId);
    if (!doc) {
      return agentError('NOT_FOUND', 'Doc not found', 404);
    }

    const body = await request.json();
    const parsed = addTagsSchema.safeParse(body);

    if (!parsed.success) {
      return agentError('VALIDATION_ERROR', parsed.error.issues[0].message, 400);
    }

    const currentTags = await docTagRepository.findTagsByDocId(id, orgId);
    const currentTagIds = currentTags.map((tag) => tag.id);
    const mergedTagIds = Array.from(new Set([...currentTagIds, ...parsed.data.tagIds]));

    await projectDocRepository.update(id, orgId, { tagIds: mergedTagIds });

    await auditLogRepository.log({
      orgId,
      userId,
      action: 'doc.tags.added',
      targetType: 'project_doc',
      targetId: id,
      actorType: 'agent',
      clientId: keyId,
      metadata: {
        source: 'agent',
        agentName,
        keyPrefix,
        authMethod,
        addedTagIds: parsed.data.tagIds,
        totalTagIds: mergedTagIds,
      },
    }).catch(() => {});

    const tags = await docTagRepository.findTagsByDocId(id, orgId);
    return agentSuccess(tags);
  } catch (error) {
    return handleAgentError(error);
  }
}

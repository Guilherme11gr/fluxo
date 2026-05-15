/**
 * Agent API - Document Tag Removal
 *
 * DELETE /api/agent/docs/:id/tags/:tagId - Remove a tag from a document
 */

import { NextRequest } from 'next/server';
import { z } from 'zod';
import { extractAgentAuth } from '@/shared/http/agent-auth';
import { agentSuccess, agentError, handleAgentError } from '@/shared/http/agent-responses';
import { auditLogRepository, docTagRepository, projectDocRepository } from '@/infra/adapters/prisma';

export const dynamic = 'force-dynamic';

const uuidSchema = z.string().uuid();

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; tagId: string }> }
) {
  try {
    const { orgId, userId, agentName, keyPrefix, authMethod, keyId } = await extractAgentAuth();
    const { id, tagId } = await params;

    if (!uuidSchema.safeParse(id).success) {
      return agentError('VALIDATION_ERROR', 'Invalid doc ID', 400);
    }

    if (!uuidSchema.safeParse(tagId).success) {
      return agentError('VALIDATION_ERROR', 'Invalid tag ID', 400);
    }

    const doc = await projectDocRepository.findById(id, orgId);
    if (!doc) {
      return agentError('NOT_FOUND', 'Doc not found', 404);
    }

    const currentTags = await docTagRepository.findTagsByDocId(id, orgId);
    if (!currentTags.some((tag) => tag.id === tagId)) {
      return agentError('NOT_FOUND', 'Tag is not assigned to this doc', 404);
    }

    const remainingTagIds = currentTags
      .map((tag) => tag.id)
      .filter((currentTagId) => currentTagId !== tagId);

    await projectDocRepository.update(id, orgId, { tagIds: remainingTagIds });

    await auditLogRepository.log({
      orgId,
      userId,
      action: 'doc.tags.removed',
      targetType: 'project_doc',
      targetId: id,
      actorType: 'agent',
      clientId: keyId,
      metadata: {
        source: 'agent',
        agentName,
        keyPrefix,
        authMethod,
        removedTagId: tagId,
        totalTagIds: remainingTagIds,
      },
    }).catch(() => {});

    const tags = await docTagRepository.findTagsByDocId(id, orgId);
    return agentSuccess(tags);
  } catch (error) {
    return handleAgentError(error);
  }
}

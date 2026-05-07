/**
 * Agent API - Board Item by ID
 * 
 * PATCH /api/agent/board/items/:id - Update an item
 * DELETE /api/agent/board/items/:id - Delete an item
 */

import { NextRequest } from 'next/server';
import { z } from 'zod';
import { extractAgentAuth } from '@/shared/http/agent-auth';
import { agentSuccess, agentError, handleAgentError } from '@/shared/http/agent-responses';
import { personalBoardRepository, auditLogRepository, prisma } from '@/infra/adapters/prisma';
import { NotFoundError } from '@/shared/errors';

export const dynamic = 'force-dynamic';

const updateItemSchema = z.object({
  title: z.string().min(1, 'Title is required').max(200, 'Title must be at most 200 characters').optional(),
  description: z.string().max(1000, 'Description must be at most 1000 characters').optional().nullable(),
  priority: z.enum(['none', 'low', 'medium', 'high', 'urgent']).optional().nullable(),
  dueDate: z.string().min(1, 'Invalid date').optional().nullable(),
});

async function getItemWithAgentAuth(itemId: string, orgId: string, userId: string) {
  const item = await prisma.personalBoardItem.findUnique({
    where: { id: itemId },
    include: { column: true },
  });

  if (!item) {
    throw new NotFoundError('Board item');
  }

  if (item.column.orgId !== orgId || item.column.userId !== userId) {
    throw new NotFoundError('Board item');
  }

  return item;
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { orgId, userId, agentName, keyPrefix, authMethod, keyId } = await extractAgentAuth();

    const body = await request.json();
    if (!body || Object.keys(body).length === 0) {
      return agentError('VALIDATION_ERROR', 'No fields provided to update', 400);
    }

    const parsed = updateItemSchema.safeParse(body);

    if (!parsed.success) {
      return agentError('VALIDATION_ERROR', parsed.error.issues[0].message, 400);
    }

    const item = await getItemWithAgentAuth(id, orgId, userId);

    const updated = await personalBoardRepository.updateItem(id, item.columnId, parsed.data);

    await auditLogRepository.log({
      orgId,
      userId,
      action: 'board_item.updated',
      targetType: 'board_item',
      targetId: id,
      metadata: {
        source: 'agent',
        agentName,
        keyPrefix,
        authMethod,
        changes: parsed.data,
      },
      actorType: 'agent',
      clientId: keyId,
    }).catch(() => {});

    return agentSuccess(updated);
  } catch (error) {
    return handleAgentError(error);
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { orgId, userId, agentName, keyPrefix, authMethod, keyId } = await extractAgentAuth();

    const item = await getItemWithAgentAuth(id, orgId, userId);

    await personalBoardRepository.deleteItem(id, item.columnId);

    await auditLogRepository.log({
      orgId,
      userId,
      action: 'board_item.deleted',
      targetType: 'board_item',
      targetId: id,
      metadata: {
        source: 'agent',
        agentName,
        keyPrefix,
        authMethod,
      },
      actorType: 'agent',
      clientId: keyId,
    }).catch(() => {});

    return new Response(JSON.stringify({ success: true, data: { deleted: true } }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return handleAgentError(error);
  }
}

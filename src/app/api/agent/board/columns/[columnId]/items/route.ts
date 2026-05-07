/**
 * Agent API - Board Items
 * 
 * POST /api/agent/board/columns/:columnId/items - Create a new item
 */

import { NextRequest } from 'next/server';
import { z } from 'zod';
import { extractAgentAuth } from '@/shared/http/agent-auth';
import { agentSuccess, agentError, handleAgentError } from '@/shared/http/agent-responses';
import { personalBoardRepository, auditLogRepository } from '@/infra/adapters/prisma';

export const dynamic = 'force-dynamic';

const createItemSchema = z.object({
  title: z.string().min(1, 'Title is required').max(200, 'Title must be at most 200 characters'),
  description: z.string().max(1000, 'Description must be at most 1000 characters').optional(),
  priority: z.enum(['none', 'low', 'medium', 'high', 'urgent']).optional(),
  dueDate: z.string().min(1, 'Invalid date').optional().nullable(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ columnId: string }> }
) {
  try {
    const { columnId } = await params;
    const { orgId, userId, agentName, keyPrefix, authMethod, keyId } = await extractAgentAuth();

    const body = await request.json();
    const parsed = createItemSchema.safeParse(body);

    if (!parsed.success) {
      return agentError('VALIDATION_ERROR', parsed.error.issues[0].message, 400);
    }

    const item = await personalBoardRepository.createItem({
      columnId,
      ...parsed.data,
    });

    await auditLogRepository.log({
      orgId,
      userId,
      action: 'board_item.created',
      targetType: 'board_item',
      targetId: item.id,
      metadata: {
        source: 'agent',
        agentName,
        keyPrefix,
        authMethod,
        itemTitle: parsed.data.title,
        columnId,
        priority: parsed.data.priority,
        dueDate: parsed.data.dueDate,
      },
      actorType: 'agent',
      clientId: keyId,
    }).catch(() => {});

    return agentSuccess(item, 201);
  } catch (error) {
    return handleAgentError(error);
  }
}

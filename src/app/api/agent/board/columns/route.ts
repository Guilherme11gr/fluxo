/**
 * Agent API - Board Columns
 * 
 * POST /api/agent/board/columns - Create a new column
 */

import { NextRequest } from 'next/server';
import { z } from 'zod';
import { extractAgentAuth } from '@/shared/http/agent-auth';
import { agentSuccess, agentError, handleAgentError } from '@/shared/http/agent-responses';
import { personalBoardRepository, auditLogRepository } from '@/infra/adapters/prisma';

export const dynamic = 'force-dynamic';

const createColumnSchema = z.object({
  title: z.string().min(1, 'Title is required').max(100, 'Title must be at most 100 characters'),
  color: z.string().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const { orgId, userId, agentName, keyPrefix, authMethod, keyId } = await extractAgentAuth();

    const body = await request.json();
    const parsed = createColumnSchema.safeParse(body);

    if (!parsed.success) {
      return agentError('VALIDATION_ERROR', parsed.error.issues[0].message, 400);
    }

    const column = await personalBoardRepository.createColumn({
      orgId,
      userId,
      ...parsed.data,
    });

    await auditLogRepository.log({
      orgId,
      userId,
      action: 'board_column.created',
      targetType: 'board_column',
      targetId: column.id,
      metadata: {
        source: 'agent',
        agentName,
        keyPrefix,
        authMethod,
        columnTitle: parsed.data.title,
        color: parsed.data.color,
      },
      actorType: 'agent',
      clientId: keyId,
    }).catch(() => {});

    return agentSuccess(column, 201);
  } catch (error) {
    return handleAgentError(error);
  }
}

/**
 * Agent API - Board Column by ID
 * 
 * PATCH /api/agent/board/columns/:id - Update a column
 * DELETE /api/agent/board/columns/:id - Delete a column
 */

import { NextRequest } from 'next/server';
import { z } from 'zod';
import { extractAgentAuth } from '@/shared/http/agent-auth';
import { agentSuccess, agentError, handleAgentError } from '@/shared/http/agent-responses';
import { personalBoardRepository, auditLogRepository } from '@/infra/adapters/prisma';

export const dynamic = 'force-dynamic';

const updateColumnSchema = z.object({
  title: z.string().min(1, 'Title is required').max(100, 'Title must be at most 100 characters').optional(),
  color: z.string().optional(),
});

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

    const parsed = updateColumnSchema.safeParse(body);

    if (!parsed.success) {
      return agentError('VALIDATION_ERROR', parsed.error.issues[0].message, 400);
    }

    const column = await personalBoardRepository.updateColumn(id, orgId, userId, parsed.data);

    await auditLogRepository.log({
      orgId,
      userId,
      action: 'board_column.updated',
      targetType: 'board_column',
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

    return agentSuccess(column);
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

    await personalBoardRepository.deleteColumn(id, orgId, userId);

    await auditLogRepository.log({
      orgId,
      userId,
      action: 'board_column.deleted',
      targetType: 'board_column',
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

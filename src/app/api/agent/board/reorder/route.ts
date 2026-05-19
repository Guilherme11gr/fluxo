/**
 * Agent API - Board Reorder
 *
 * POST /api/agent/board/reorder - Reorder columns and/or items
 */

import { NextRequest } from 'next/server';
import { z } from 'zod';
import { extractAgentAuth } from '@/shared/http/agent-auth';
import { agentSuccess, agentError, handleAgentError } from '@/shared/http/agent-responses';
import { personalBoardRepository, auditLogRepository } from '@/infra/adapters/prisma';

export const dynamic = 'force-dynamic';

const reorderColumnItem = z.object({
  id: z.string().uuid(),
  order: z.number().int().min(0),
});

const reorderItemEntry = z.object({
  id: z.string().uuid(),
  columnId: z.string().uuid(),
  order: z.number().int().min(0),
});

const reorderSchema = z.object({
  columns: z.array(reorderColumnItem).optional(),
  items: z.array(reorderItemEntry).optional(),
}).refine(
  (data) => data.columns || data.items,
  { message: 'Provide at least columns or items to reorder' }
);

export async function POST(request: NextRequest) {
  try {
    const { orgId, userId, agentName, keyPrefix, authMethod, keyId } = await extractAgentAuth();

    const body = await request.json();
    const parsed = reorderSchema.safeParse(body);

    if (!parsed.success) {
      return agentError('VALIDATION_ERROR', parsed.error.issues[0].message, 400);
    }

    const { columns, items } = parsed.data;

    if (columns && columns.length > 0) {
      await personalBoardRepository.reorderColumns(orgId, userId, { columns });
    }

    if (items && items.length > 0) {
      await personalBoardRepository.reorderItems({ items });
    }

    await auditLogRepository.log({
      orgId,
      userId,
      action: 'board.reordered',
      targetType: 'board',
      targetId: orgId,
      metadata: {
        source: 'agent',
        agentName,
        keyPrefix,
        authMethod,
        columnsReordered: columns?.length || 0,
        itemsReordered: items?.length || 0,
      },
      actorType: 'agent',
      clientId: keyId,
    }).catch(() => {});

    return agentSuccess({ success: true });
  } catch (error) {
    return handleAgentError(error);
  }
}

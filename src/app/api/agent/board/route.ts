/**
 * Agent API - Personal Board
 * 
 * GET /api/agent/board - Get full personal board (columns + items)
 */

import { extractAgentAuth } from '@/shared/http/agent-auth';
import { agentSuccess, agentError, handleAgentError } from '@/shared/http/agent-responses';
import { personalBoardRepository } from '@/infra/adapters/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const { orgId, userId } = await extractAgentAuth();

    const board = await personalBoardRepository.getBoard(orgId, userId);

    return agentSuccess({ columns: board });
  } catch (error) {
    return handleAgentError(error);
  }
}

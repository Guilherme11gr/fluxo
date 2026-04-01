import { NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { extractAuthenticatedTenant } from '@/shared/http/auth.helpers';
import { jsonSuccess, jsonError } from '@/shared/http/responses';
import { handleError } from '@/shared/errors';
import { Pool } from 'pg';

export const dynamic = 'force-dynamic';

const globalForMessages = globalThis as unknown as { messagesPool?: Pool };

function getMessagesPool(): Pool {
  if (!globalForMessages.messagesPool) {
    globalForMessages.messagesPool = new Pool({
      connectionString: process.env.DATABASE_URL,
    });
  }
  return globalForMessages.messagesPool;
}

// GET /api/chat/sessions/[sessionId]/messages - Load session messages
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    const supabase = await createClient();
    const { tenantId, userId } = await extractAuthenticatedTenant(supabase);

    const { sessionId } = await params;

    if (!sessionId) {
      return jsonError('VALIDATION_ERROR', 'sessionId é obrigatório', 400);
    }

    // Verify session belongs to user
    const pool = getMessagesPool();
    const session = await pool.query(
      `SELECT messages FROM public.agent_sessions 
       WHERE id = $1 AND user_id = $2 AND tenant_id = $3`,
      [sessionId, userId, tenantId]
    );

    if (session.rows.length === 0) {
      return jsonError('NOT_FOUND', 'Sessão não encontrada', 404);
    }

    return jsonSuccess({ messages: session.rows[0].messages || [] });
  } catch (error) {
    const { status, body } = handleError(error);
    return jsonError(body.error.code, body.error.message, status);
  }
}

import { NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { extractAuthenticatedTenant } from '@/shared/http/auth.helpers';
import { jsonSuccess, jsonError } from '@/shared/http/responses';
import { handleError } from '@/shared/errors';
import { Pool } from 'pg';

export const dynamic = 'force-dynamic';

const globalForSessions = globalThis as unknown as { sessionsPool?: Pool };

function getSessionsPool(): Pool {
  if (!globalForSessions.sessionsPool) {
    globalForSessions.sessionsPool = new Pool({
      connectionString: process.env.DATABASE_URL,
    });
  }
  return globalForSessions.sessionsPool;
}

// GET /api/chat/sessions - List user sessions
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { tenantId, userId } = await extractAuthenticatedTenant(supabase);

    const { searchParams } = new URL(request.url);
    const limit = Math.min(parseInt(searchParams.get('limit') || '30', 10), 100);
    const offset = parseInt(searchParams.get('offset') || '0', 10);

    const pool = getSessionsPool();

    const result = await pool.query(
      `SELECT id, title, created_at, updated_at,
              jsonb_array_length(messages) as message_count
       FROM public.agent_sessions
       WHERE user_id = $1 AND tenant_id = $2
       ORDER BY updated_at DESC
       LIMIT $3 OFFSET $4`,
      [userId, tenantId, limit, offset]
    );

    const countResult = await pool.query(
      `SELECT COUNT(*) as total FROM public.agent_sessions WHERE user_id = $1 AND tenant_id = $2`,
      [userId, tenantId]
    );

    const sessions = result.rows.map(row => ({
      id: row.id,
      title: row.title || 'Nova conversa',
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      messageCount: row.message_count || 0,
    }));

    return jsonSuccess({
      sessions,
      total: parseInt(countResult.rows[0]?.total || '0', 10),
    });
  } catch (error) {
    const { status, body } = handleError(error);
    return jsonError(body.error.code, body.error.message, status);
  }
}

// DELETE /api/chat/sessions - Delete a session
export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { tenantId, userId } = await extractAuthenticatedTenant(supabase);

    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get('sessionId');

    if (!sessionId) {
      return jsonError('VALIDATION_ERROR', 'sessionId é obrigatório', 400);
    }

    const pool = getSessionsPool();

    const result = await pool.query(
      `DELETE FROM public.agent_sessions
       WHERE id = $1 AND user_id = $2 AND tenant_id = $3
       RETURNING id`,
      [sessionId, userId, tenantId]
    );

    if (result.rows.length === 0) {
      return jsonError('NOT_FOUND', 'Sessão não encontrada', 404);
    }

    return jsonSuccess({ deleted: true });
  } catch (error) {
    const { status, body } = handleError(error);
    return jsonError(body.error.code, body.error.message, status);
  }
}

import { Pool } from 'pg';

type AgentHistoryMessage = {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_calls?: unknown[];
  tool_call_id?: string;
};

type AgentHistoryStore = {
  get(sessionId: string): Promise<AgentHistoryMessage[]>;
  set(sessionId: string, messages: AgentHistoryMessage[]): Promise<void>;
  clear(sessionId: string): Promise<void>;
};

const globalForAgentChat = globalThis as unknown as {
  agentChatPool?: Pool;
  agentChatHistoryStore?: AgentHistoryStore;
};

function getAgentChatPool(): Pool {
  if (!globalForAgentChat.agentChatPool) {
    globalForAgentChat.agentChatPool = new Pool({
      connectionString: process.env.DATABASE_URL,
    });
  }

  return globalForAgentChat.agentChatPool;
}

export function getAgentChatHistoryStore(): AgentHistoryStore {
  if (globalForAgentChat.agentChatHistoryStore) {
    return globalForAgentChat.agentChatHistoryStore;
  }

  const pool = getAgentChatPool();

  globalForAgentChat.agentChatHistoryStore = {
    async get(sessionId) {
      const result = await pool.query<{ messages: AgentHistoryMessage[] }>(
        'SELECT messages FROM public.agent_sessions WHERE id = $1',
        [sessionId]
      );

      return result.rows[0]?.messages ?? [];
    },

    async set(sessionId, messages) {
      await pool.query(
        `INSERT INTO public.agent_sessions (id, messages, updated_at)
         VALUES ($1, $2::jsonb, NOW())
         ON CONFLICT (id)
         DO UPDATE SET messages = EXCLUDED.messages, updated_at = NOW()`,
        [sessionId, JSON.stringify(messages)]
      );
    },

    async clear(sessionId) {
      await pool.query('DELETE FROM public.agent_sessions WHERE id = $1', [sessionId]);
    },
  };

  return globalForAgentChat.agentChatHistoryStore;
}

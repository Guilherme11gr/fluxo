import { NextRequest } from 'next/server';
import { createAgentRoute } from '@guilherme/agent-sdk/next';
import { createClient } from '@/lib/supabase/server';
import { extractAuthenticatedTenant } from '@/shared/http/auth.helpers';
import { jsonError } from '@/shared/http/responses';
import { userProfileRepository } from '@/infra/adapters/prisma';
import { buildAgentChatSystemPrompt, buildAgentChatTools } from '@/lib/agent-chat/tools';
import {
  AGENT_CHAT_HEADER_NAMES,
  encodeAgentChatHeader,
  getAgentChatContextFromHeaders,
} from '@/lib/agent-chat/internal-api';
import { getAgentChatProviderConfig } from '@/lib/agent-chat/provider';
import { getAgentChatHistoryStore } from '@/lib/agent-chat/history-store';
import {
  createAgentChatErrorResponse,
  namespaceAgentChatSessionId,
  normalizeAgentChatSessionId,
} from '@/lib/agent-chat/route-helpers';

export const dynamic = 'force-dynamic';

const agentHandler = createAgentRoute({
  provider: () => getAgentChatProviderConfig(),
  historyStore: () => getAgentChatHistoryStore() as any,
  systemPrompt: ({ req }) => buildAgentChatSystemPrompt(getAgentChatContextFromHeaders(req.headers)),
  tools: ({ req }) => buildAgentChatTools(getAgentChatContextFromHeaders(req.headers)),
  historySize: 24,
  temperature: 0.25,
  maxIterations: 8,
  promptEnhancer: {
    timezone: 'America/Sao_Paulo',
    locale: 'pt-BR',
  },
});

export async function POST(request: NextRequest) {
  try {
    const authClient = await createClient();
    const { userId, tenantId, memberships } = await extractAuthenticatedTenant(authClient);
    const profile = await userProfileRepository.findByIdGlobal(userId);
    const currentMembership =
      memberships.find((membership) => membership.orgId === tenantId) || memberships[0];

    const body = (await request.json()) as Record<string, unknown>;
    const rawSessionId = normalizeAgentChatSessionId(body.sessionId);

    if (!rawSessionId) {
      return jsonError('VALIDATION_ERROR', 'sessionId é obrigatório e deve ser curto', 400);
    }

    const rewrittenHeaders = new Headers(request.headers);
    rewrittenHeaders.set('content-type', 'application/json');
    rewrittenHeaders.set(
      AGENT_CHAT_HEADER_NAMES.tenantId,
      encodeAgentChatHeader(tenantId)
    );
    rewrittenHeaders.set(
      AGENT_CHAT_HEADER_NAMES.userId,
      encodeAgentChatHeader(userId)
    );
    rewrittenHeaders.set(
      AGENT_CHAT_HEADER_NAMES.role,
      encodeAgentChatHeader(currentMembership?.role || 'MEMBER')
    );
    rewrittenHeaders.set(
      AGENT_CHAT_HEADER_NAMES.orgName,
      encodeAgentChatHeader(currentMembership?.orgName || '')
    );
    rewrittenHeaders.set(
      AGENT_CHAT_HEADER_NAMES.orgSlug,
      encodeAgentChatHeader(currentMembership?.orgSlug || '')
    );
    rewrittenHeaders.set(
      AGENT_CHAT_HEADER_NAMES.userDisplayName,
      encodeAgentChatHeader(profile?.displayName || '')
    );
    rewrittenHeaders.set(
      AGENT_CHAT_HEADER_NAMES.origin,
      encodeAgentChatHeader(request.nextUrl.origin)
    );

    const rewrittenBody = JSON.stringify({
      ...body,
      sessionId: namespaceAgentChatSessionId(rawSessionId, tenantId, userId),
    });

    const rewrittenRequest = new NextRequest(request.url, {
      method: 'POST',
      headers: rewrittenHeaders,
      body: rewrittenBody,
    });

    return agentHandler(rewrittenRequest);
  } catch (error) {
    return createAgentChatErrorResponse(error);
  }
}

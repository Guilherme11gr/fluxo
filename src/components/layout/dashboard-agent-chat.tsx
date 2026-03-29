'use client';

import { AgentChat } from '@guilherme/agent-sdk/react';
import { invalidateAndRefetchAll } from '@/lib/query';
import { useAuth } from '@/hooks/use-auth';

export function DashboardAgentChat() {
  const { profile, isAuthenticated, isLoading } = useAuth();

  if (!isAuthenticated || isLoading || !profile?.id || !profile.currentOrgId) {
    return null;
  }

  const currentMembership = profile.memberships.find(
    (membership) => membership.orgId === profile.currentOrgId
  );

  const sessionId = 'dashboard';
  const subtitle = currentMembership
    ? `${currentMembership.orgName} • ${profile.currentRole}`
    : 'Tenant atual';

  return (
    <AgentChat
      key={sessionId}
      endpoint="/api/chat"
      sessionId={sessionId}
      title="Fluxo Agent"
      subtitle={subtitle}
      theme="light"
      examples={[
        'Liste minhas tasks em DOING e destaque as bloqueadas.',
        'Quem está no workspace hoje e quais tasks estão com cada pessoa?',
        'Crie uma feature para exportação CSV no épico selecionado.',
        'Mostre o contexto completo de um épico e sugira próximos passos.',
        'Crie uma task de bug, aplique as tags certas e já deixe um comentário com o plano.',
      ]}
      labels={{
        placeholder: 'Pergunte ou peça uma ação no Fluxo...',
        processing: 'Pensando e escolhendo tools...',
        clearHistory: 'Nova conversa',
      }}
      onToolExecuted={() => {
        void invalidateAndRefetchAll();
      }}
    />
  );
}

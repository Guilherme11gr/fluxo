'use client';

import * as React from 'react';
import { AgentChat } from '@guilherme/agent-sdk/react';
import { invalidateAndRefetchAll } from '@/lib/query';
import { useAuth } from '@/hooks/use-auth';

export function DashboardAgentChat() {
  const { profile, isAuthenticated, isLoading } = useAuth();
  const stableProfileRef = React.useRef<typeof profile>(null);

  React.useEffect(() => {
    if (isAuthenticated && profile?.id && profile.currentOrgId) {
      stableProfileRef.current = profile;
      return;
    }

    if (!isAuthenticated && !isLoading) {
      stableProfileRef.current = null;
    }
  }, [isAuthenticated, isLoading, profile]);

  const resolvedProfile = profile?.id && profile.currentOrgId ? profile : stableProfileRef.current;

  if ((!isAuthenticated && !isLoading) || !resolvedProfile?.id || !resolvedProfile.currentOrgId) {
    return null;
  }

  const currentMembership = resolvedProfile.memberships.find(
    (membership) => membership.orgId === resolvedProfile.currentOrgId
  );

  const sessionId = 'dashboard';
  const subtitle = currentMembership
    ? `${currentMembership.orgName} • ${resolvedProfile.currentRole}`
    : 'Tenant atual';

  return (
    <AgentChat
      endpoint="/api/chat"
      sessionId={sessionId}
      title="Fluxo Agent"
      subtitle={subtitle}
      theme="dark"
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

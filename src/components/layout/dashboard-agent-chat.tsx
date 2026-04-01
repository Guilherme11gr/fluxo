'use client';

import * as React from 'react';
import { AgentChat } from '@guilherme/agent-sdk/react';
import { Infinity } from 'lucide-react';
import { invalidateAndRefetchAll } from '@/lib/query';
import { useAuth } from '@/hooks/use-auth';

export function DashboardAgentChat() {
  const { viewer, isAuthenticated, isLoading } = useAuth();
  const stableViewerRef = React.useRef<typeof viewer>(null);

  React.useEffect(() => {
    if (isAuthenticated && viewer?.id && viewer.currentOrgId) {
      stableViewerRef.current = viewer;
      return;
    }

    if (!isAuthenticated && !isLoading) {
      stableViewerRef.current = null;
    }
  }, [isAuthenticated, isLoading, viewer]);

  const resolvedViewer = viewer?.id && viewer.currentOrgId ? viewer : stableViewerRef.current;

  if ((!isAuthenticated && !isLoading) || !resolvedViewer?.id || !resolvedViewer.currentOrgId) {
    return null;
  }

  const currentMembership = resolvedViewer.memberships.find(
    (membership) => membership.orgId === resolvedViewer.currentOrgId
  );

  const sessionId = 'dashboard';
  const subtitle = resolvedViewer.displayName || currentMembership?.orgName || '';

  return (
    <AgentChat
      endpoint="/api/chat"
      sessionId={sessionId}
      title="FluXo"
      subtitle={subtitle}
      theme="dark"
      icon={<Infinity className="w-5 h-5" />}
      examples={[
        'Liste minhas tasks em DOING e destaque as bloqueadas.',
        'Quem está no workspace e quais tasks estão com cada pessoa?',
        'Crie uma feature para exportação CSV no épico selecionado.',
        'Mostre o contexto completo de um épico e sugira próximos passos.',
        'Crie uma task de bug, aplique as tags certas e deixe um comentário com o plano.',
      ]}
      labels={{
        placeholder: 'Pergunte ou peça uma ação no Fluxo...',
        processing: 'Pensando e escolhendo tools...',
        clearHistory: 'Nova conversa',
      }}
      onToolExecuted={() => {
        void invalidateAndRefetchAll();
      }}
      sessionManagement={{ level: 'basic' }}
    />
  );
}

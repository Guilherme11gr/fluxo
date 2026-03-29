'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Plus, RefreshCw, Loader2, Coffee } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import {
  useMyTasks,
  useActiveProjects,
  useActivityFeed,
} from '@/lib/query';
import {
  TodayBlock,
  BlockedBlock,
  ActivityBlock,
  ActiveProjectsBlock,
  QuickTaskDialog,
} from '@/components/features/dashboard';
import { CreateWorkspaceCTAModal } from '@/components/features/workspace-cta/CreateWorkspaceCTAModal';
import { CreateWorkspaceCard } from '@/components/features/workspace-cta/CreateWorkspaceCard';
import { useWorkspaceCTA } from '@/hooks/useWorkspaceCTA';

/**
 * Dashboard Page - Painel de Comando
 * 
 * 4 blocos fixos, sempre na mesma ordem:
 * 1. Bloqueios (se houver)
 * 2. Hoje (tasks ativas)
 * 3. Mudou desde ontem (atividades)
 * 4. Projetos Ativos
 */
export default function DashboardPage() {
  const [isQuickTaskOpen, setIsQuickTaskOpen] = useState(false);
  const { profile, isLoading: isLoadingAuth } = useAuth();

  // Workspace CTA hook
  const {
    showModal,
    setShowModal,
    handleDismiss,
    handleWorkspaceCreated,
    openModal,
    shouldShowCard,
  } = useWorkspaceCTA();

  // Queries otimizadas para dashboard
  // Bloqueios: modo equipe (todos os bloqueios dos projetos)
  const {
    data: blockedTasksData,
    isLoading: isLoadingBlocked,
  } = useMyTasks({ teamView: true });

  // Tasks individuais (apenas assigned ao usuário)
  const {
    data: myTasksData,
    isLoading: isLoadingTasks,
    refetch: refetchTasks,
    isFetching: isFetchingTasks,
  } = useMyTasks();

  const {
    data: activeProjectsData,
    isLoading: isLoadingProjects,
  } = useActiveProjects();

  const {
    data: activityData,
    isLoading: isLoadingActivity,
  } = useActivityFeed();

  const blockedTasks = blockedTasksData?.items ?? [];
  const tasks = myTasksData?.items ?? [];
  const projects = activeProjectsData?.items ?? [];
  const activities = activityData?.items ?? [];

  const handleRefresh = () => {
    refetchTasks();
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            {isLoadingAuth ? (
              <div className="flex items-center gap-2">
                <Skeleton className="h-8 w-8 rounded-full" />
                <Skeleton className="h-8 w-[200px]" />
              </div>
            ) : profile?.displayName ? (
              <>
                <Coffee className="h-7 w-7 text-primary" />
                Bem-vindo de volta, {profile.displayName.split(' ')[0]}
              </>
            ) : (
              <>
                <Coffee className="h-7 w-7 text-primary" />
                Meu Trabalho
              </>
            )}
          </h1>
          <p className="text-sm text-muted-foreground">
            O que você precisa fazer agora
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={handleRefresh}
            disabled={isFetchingTasks}
            title="Atualizar"
          >
            {isFetchingTasks ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
          </Button>

          <Button
            onClick={() => setIsQuickTaskOpen(true)}
            className="gap-2"
          >
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">Nova Task</span>
          </Button>
        </div>
      </div>

      {/* Blocos da Dashboard */}
      <div className="grid gap-6">
        {/* CTA Card: Criar Workspace (só para MEMBERs) */}
        {shouldShowCard && (
          <CreateWorkspaceCard onCreateClick={openModal} />
        )}

        {/* BLOCO 1: Bloqueios da Equipe (só aparece se houver) */}
        <BlockedBlock
          tasks={blockedTasks}
          teamView={true}
        />

        {/* BLOCO 2: Hoje (minhas tasks) */}
        <TodayBlock tasks={tasks} isLoading={isLoadingTasks} />

        {/* BLOCO 3: Atividade da Equipe */}
        <ActivityBlock activities={activities} isLoading={isLoadingActivity} />

        {/* BLOCO 4: Projetos Ativos */}
        <ActiveProjectsBlock projects={projects} isLoading={isLoadingProjects} />
      </div>

      {/* Quick Task Dialog */}
      <QuickTaskDialog
        open={isQuickTaskOpen}
        onOpenChange={setIsQuickTaskOpen}
      />

      {/* Workspace CTA Modal */}
      <CreateWorkspaceCTAModal
        open={showModal}
        onOpenChange={(open) => {
          if (!open) handleDismiss();
          setShowModal(open);
        }}
        onWorkspaceCreated={handleWorkspaceCreated}
      />
    </div>
  );
}

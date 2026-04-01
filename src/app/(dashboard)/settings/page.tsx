"use client";

import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Users, History, User, ChevronRight, Crown, Building2 } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useWorkspaceCTA } from "@/hooks/useWorkspaceCTA";
import { CreateWorkspaceCTAModal } from "@/components/features/workspace-cta/CreateWorkspaceCTAModal";
import { AgentAccessCard } from "@/components/features/settings/agent-access-card";
import { AgentRolePromptCard } from "@/components/features/settings/agent-role-prompt-card";

export default function SettingsPage() {
  const { viewer } = useAuth();
  const isOwner = viewer?.currentRole === 'OWNER';
  const { showModal, setShowModal, handleWorkspaceCreated } = useWorkspaceCTA();

  const settingsLinks = [
    {
      title: "Equipe",
      description: "Gerencie membros e convites",
      href: "/settings/team",
      icon: Users,
      visible: true,
    },
    {
      title: "Logs de Auditoria",
      description: "Histórico de ações na organização",
      href: "/settings/audit",
      icon: History,
      visible: isOwner,
    },
  ];

  return (
    <div className="container max-w-4xl py-8 space-y-8">
      <div>
        <h1 className="text-3xl font-bold">Configurações</h1>
        <p className="text-muted-foreground">Gerencie sua organização e perfil</p>
      </div>

      {/* User Info */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="w-5 h-5" />
            Seu Perfil
          </CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-between">
          <div>
            <p className="font-medium">{viewer?.displayName || 'Usuário'}</p>
            <p className="text-sm text-muted-foreground flex items-center gap-1">
              {viewer?.currentRole === 'OWNER' && <Crown className="w-3 h-3" />}
              {viewer?.currentRole === 'OWNER' ? 'Proprietário' :
                viewer?.currentRole === 'ADMIN' ? 'Administrador' : 'Membro'}
            </p>
          </div>
          <Button variant="outline" disabled>
            Editar Perfil (em breve)
          </Button>
        </CardContent>
      </Card>

      {/* Settings Links */}
      <div className="grid gap-4">
        {/* Create Workspace - Always visible */}
        <Card 
          className="hover:bg-accent/50 transition-colors cursor-pointer border-primary/20"
          onClick={() => setShowModal(true)}
        >
          <CardContent className="flex items-center justify-between py-4">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <Building2 className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="font-medium">Criar Workspace</p>
                <p className="text-sm text-muted-foreground">Gerencie seus próprios projetos</p>
              </div>
            </div>
            <ChevronRight className="w-5 h-5 text-muted-foreground" />
          </CardContent>
        </Card>

        {settingsLinks.filter(l => l.visible).map((link) => (
          <Link key={link.href} href={link.href}>
            <Card className="hover:bg-accent/50 transition-colors cursor-pointer">
              <CardContent className="flex items-center justify-between py-4">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                    <link.icon className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <p className="font-medium">{link.title}</p>
                    <p className="text-sm text-muted-foreground">{link.description}</p>
                  </div>
                </div>
                <ChevronRight className="w-5 h-5 text-muted-foreground" />
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      {isOwner && <AgentAccessCard />}

      {isOwner && <AgentRolePromptCard />}

      {/* Modal for workspace creation */}
      <CreateWorkspaceCTAModal
        open={showModal}
        onOpenChange={setShowModal}
        onWorkspaceCreated={handleWorkspaceCreated}
      />
    </div>
  );
}

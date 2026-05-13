"use client";

import { useMemo } from "react";
import {
  CheckCircle2,
  Circle,
  Clock,
  MoreHorizontal,
  Pencil,
  Trash2,
  AlertTriangle,
  XCircle,
  PlayCircle,
  User as UserIcon
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FeatureHealthBadge } from "@/components/features/features/feature-health-badge";
import { FocusBadge } from "@/components/features/tasks/focus-badge";
import { cn } from "@/lib/utils";
import type { FeatureHealth, TaskFocus } from "@/shared/types/project.types";
import Link from "next/link";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useUpdateFeature } from "@/lib/query";

// Reuse the type matching the one in page.tsx but expanded with assignee data from our API update
export interface FeatureTableItem {
  id: string;
  title: string;
  status: string;
  _count?: { tasks: number };
  tasks?: Array<{
    status: string;
    type: string;
    assignee?: {
      user_profiles: {
        displayName: string;
        avatarUrl: string | null
      } | null
    } | null
  }>;
  health?: FeatureHealth;
  healthReason?: string | null;
  healthUpdatedAt?: string | Date | null;
  focus?: TaskFocus | null;
}

interface FeaturesTableViewProps {
  features: FeatureTableItem[];
  projectId: string;
  epicId: string;
  onEdit: (feature: any) => void;
  onDelete: (feature: any) => void;
}

export function FeaturesTableView({
  features,
  projectId,
  epicId,
  onEdit,
  onDelete
}: FeaturesTableViewProps) {
  const updateFeature = useUpdateFeature();

  // Helper to find active agents (assignees on DOING tasks)
  const getActiveAgents = (tasks: FeatureTableItem['tasks']) => {
    if (!tasks) return [];
    const doingTasks = tasks.filter(t => t.status === 'DOING' && t.assignee?.user_profiles);
    // Deduplicate agents
    const uniqueAgents = new Map();
    doingTasks.forEach(t => {
      const profile = t.assignee!.user_profiles;
      if (profile && !uniqueAgents.has(profile.displayName)) {
        uniqueAgents.set(profile.displayName, profile);
      }
    });
    return Array.from(uniqueAgents.values());
  };

  if (features.length === 0) {
    return (
      <div className="text-center py-10 text-muted-foreground bg-muted/20 rounded-lg border border-dashed">
        Nenhuma feature ativa neste filtro.
      </div>
    );
  }

  return (
    <div className="rounded-md border bg-card">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/40 transition-colors">
            <th className="h-10 px-4 text-left font-medium text-muted-foreground">Feature</th>
            <th className="h-10 px-4 text-left font-medium text-muted-foreground w-[120px]">Status</th>
            <th className="h-10 px-4 text-left font-medium text-muted-foreground w-[180px]">Health</th>
            <th className="h-10 px-4 text-left font-medium text-muted-foreground w-[200px]">Progresso</th>
            <th className="h-10 px-4 text-left font-medium text-muted-foreground w-[100px]">Atividade</th>
            <th className="h-10 px-4 text-right w-[50px]"></th>
          </tr>
        </thead>
        <tbody>
          {features.map((feature) => {
            const tasks = feature.tasks || [];
            const completed = tasks.filter(t => t.status === 'DONE').length;
            const total = tasks.length;
            const progress = total > 0 ? (completed / total) * 100 : 0;
            const activeAgents = getActiveAgents(tasks);
            const isDoing = feature.status === 'DOING';

            return (
              <tr
                key={feature.id}
                className={cn(
                  "border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted",
                  isDoing && "bg-blue-500/5 hover:bg-blue-500/10"
                )}
              >
                <td className="p-4 align-middle font-medium">
                  <div className="flex flex-col gap-0.5">
                    <Link
                      href={`/projects/${projectId}/epics/${epicId}/features/${feature.id}`}
                      prefetch={false}
                      className="hover:underline flex items-center gap-2"
                    >
                      <span className="text-muted-foreground font-mono text-xs">F-{feature.id.slice(0, 4)}</span>
                      {feature.title}
                    </Link>
                    <div className="flex items-center gap-1.5">
                      {feature.status === 'DOING' && (
                        <div className="flex items-center gap-1.5 text-[10px] text-blue-500 font-medium">
                          <PlayCircle className="w-3 h-3" />
                          Em Desenvolvimento
                        </div>
                      )}
                      {feature.focus && (
                        <FocusBadge focus={feature.focus} size="sm" />
                      )}
                    </div>
                  </div>
                </td>
                <td className="p-4 align-middle">
                  <Select
                    value={feature.status}
                    onValueChange={(newStatus) => {
                      updateFeature.mutate({
                        id: feature.id,
                        data: { status: newStatus as any },
                      });
                    }}
                    disabled={updateFeature.isPending && updateFeature.variables?.id === feature.id}
                  >
                    <SelectTrigger className="h-7 w-[110px] text-xs font-normal capitalize">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="BACKLOG">Backlog</SelectItem>
                      <SelectItem value="TODO">To Do</SelectItem>
                      <SelectItem value="DOING">Doing</SelectItem>
                      <SelectItem value="DONE">Done</SelectItem>
                    </SelectContent>
                  </Select>
                </td>
                <td className="p-4 align-middle">
                  {feature.health && (
                    <FeatureHealthBadge
                      health={feature.health}
                      healthReason={feature.healthReason}
                      healthUpdatedAt={feature.healthUpdatedAt}
                      showLabel={true}
                      size="sm"
                    />
                  )}
                </td>
                <td className="p-4 align-middle">
                  <div className="w-full max-w-[140px] space-y-1">
                    <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                      <span>{completed}/{total} tasks</span>
                      <span>{Math.round(progress)}%</span>
                    </div>
                    <div className="h-1.5 w-full bg-secondary rounded-full overflow-hidden">
                      <div
                        className={cn(
                          "h-full transition-all duration-500",
                          progress === 100 ? "bg-emerald-500" : "bg-primary"
                        )}
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                  </div>
                </td>
                <td className="p-4 align-middle">
                  <div className="flex -space-x-2 overflow-hidden">
                    {activeAgents.length > 0 ? (
                      activeAgents.map((agent, i) => (
                        <Tooltip key={i}>
                          <TooltipTrigger>
                            <Avatar className="inline-block h-6 w-6 rounded-full ring-2 ring-background animate-pulse">
                              <AvatarImage src={agent.avatarUrl || undefined} />
                              <AvatarFallback className="text-[10px] bg-blue-100 text-blue-700">
                                {agent.displayName.substring(0, 2).toUpperCase()}
                              </AvatarFallback>
                            </Avatar>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>{agent.displayName} está trabalhando nisto</p>
                          </TooltipContent>
                        </Tooltip>
                      ))
                    ) : (
                      feature.status === 'DOING' && (
                        <span className="text-[10px] text-muted-foreground italic">Sem agente</span>
                      )
                    )}
                  </div>
                </td>
                <td className="p-4 align-middle text-right">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" className="h-8 w-8 p-0">
                        <span className="sr-only">Open menu</span>
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        onClick={() => {
                          const newFocus = feature.focus === 'TODAY' ? null : 'TODAY';
                          updateFeature.mutate({
                            id: feature.id,
                            data: { focus: newFocus as any },
                          });
                        }}
                      >
                        🔥 {feature.focus === 'TODAY' ? 'Remover Hoje' : 'Fazer Hoje'}
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => {
                          const newFocus = feature.focus === 'THIS_WEEK' ? null : 'THIS_WEEK';
                          updateFeature.mutate({
                            id: feature.id,
                            data: { focus: newFocus as any },
                          });
                        }}
                      >
                        📅 {feature.focus === 'THIS_WEEK' ? 'Remover Semana' : 'Fazer Esta Semana'}
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => onEdit(feature)}>
                        <Pencil className="mr-2 h-4 w-4" />
                        Editar
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => onDelete(feature)}
                        className="text-destructive focus:text-destructive"
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Excluir
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

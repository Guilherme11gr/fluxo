"use client";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { MoreHorizontal, Pencil, Trash2, FolderKanban, Zap, AlertCircle } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

interface ProjectAnalytics {
  progress: number;
  activeCount?: number;
  blockedCount?: number;
  recentAssignees: Array<{
    displayName: string;
    avatarUrl: string | null;
  }>;
  _count?: {
    epics: number;
    tasks: number;
  };
}

interface ProjectCardProps {
  project: {
    id: string;
    name: string;
    key: string;
    description?: string | null;
    modules?: string[];
  } & ProjectAnalytics;
  onEdit: () => void;
  onDelete: () => void;
}

export function ProjectCard({ project, onEdit, onDelete }: ProjectCardProps) {
  // Generate consistent gradient based on key
  const gradients = [
    "from-blue-600 to-purple-600",
    "from-emerald-500 to-teal-500",
    "from-orange-500 to-red-500",
    "from-pink-500 to-rose-500",
    "from-indigo-500 to-cyan-500",
  ];
  const gradientIndex = project.key.length % gradients.length;
  const gradientClass = gradients[gradientIndex];

  // Determine health based on "activity" (simulated by progress > 0 or recent activity)
  const isHealthy = project.progress > 0 || project.recentAssignees.length > 0;

  return (
    <div className="group relative rounded-xl border border-border/40 bg-card hover:bg-muted/5 hover:border-primary/20 transition-all duration-300 shadow-sm hover:shadow-md cursor-pointer h-full flex flex-col">
      <Link href={`/projects/${project.id}`} prefetch={false} className="flex-1 p-5">
        {/* Header: Identity + Badge */}
        <div className="flex justify-between items-start mb-4">
          <div className="flex items-center gap-4">
            {/* Project Avatar */}
            <div className={cn(
              "h-12 w-12 rounded-lg bg-gradient-to-br flex items-center justify-center shadow-lg shadow-primary/5 text-white font-bold text-lg",
              gradientClass
            )}>
              {project.key.slice(0, 2)}
            </div>
            
            {/* Project Illustration (Fallback) */}
            <div className="absolute -top-2 -right-2 h-6 w-6 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center text-white text-xs font-medium shadow-lg">
              <FolderKanban className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-lg font-semibold tracking-tight text-foreground group-hover:text-primary transition-colors">
                {project.name}
              </h3>
              <p className="text-xs font-mono text-muted-foreground">
                {project.key}
              </p>
            </div>
          </div>

          {/* Health Badge (Simulated) */}
          <div className={cn(
            "px-2.5 py-1 rounded-full text-[10px] font-medium border flex items-center gap-1.5 transition-colors",
            isHealthy
              ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20"
              : "bg-yellow-500/10 text-yellow-500 border-yellow-500/20"
          )}>
            <div className={cn(
              "h-1.5 w-1.5 rounded-full animate-pulse",
              isHealthy ? "bg-emerald-500" : "bg-yellow-500"
            )} />
            {isHealthy ? "Saudável" : "Inativo"}
          </div>
        </div>

        {/* Description */}
        <p className="text-sm text-muted-foreground line-clamp-2 mb-6 h-10">
          {project.description || "Sem descrição disponível."}
        </p>

        {/* Pulse Metrics */}
        <div className="mb-6 grid grid-cols-2 gap-3">
          <div className="bg-primary/5 rounded-lg p-2 border border-primary/10 flex flex-col justify-center">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold flex items-center gap-1.5 mb-1">
              <Zap className="w-3 h-3 text-blue-500 fill-blue-500/20" />
              Em Andamento
            </span>
            <span className="text-xl font-bold text-foreground tracking-tight">
              {project.activeCount || 0}
            </span>
          </div>

          <div className="bg-destructive/5 rounded-lg p-2 border border-destructive/10 flex flex-col justify-center">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold flex items-center gap-1.5 mb-1">
              <AlertCircle className="w-3 h-3 text-red-500" />
              Travados
            </span>
            <span className="text-xl font-bold text-foreground tracking-tight">
              {project.blockedCount || 0}
            </span>
          </div>
        </div>

        {/* Footer: Tags & Facepile */}
        <div className="flex justify-between items-center pt-4 border-t border-border/30 mt-auto">
          {/* Modules / Tags */}
          <div className="flex gap-1.5">
            {project.modules?.slice(0, 2).map(m => (
              <Badge key={m} variant="secondary" className="text-[10px] px-1.5 h-5 font-normal text-muted-foreground">
                {m}
              </Badge>
            ))}
            {(project.modules?.length || 0) > 2 && (
              <Badge variant="secondary" className="text-[10px] px-1.5 h-5 font-normal text-muted-foreground">
                +{(project.modules?.length || 0) - 2}
              </Badge>
            )}
          </div>

          {/* Facepile */}
          <div className="flex -space-x-2 pl-2">
            {project.recentAssignees.length > 0 ? (
              <>
                {project.recentAssignees.slice(0, 3).map((assignee, i) => (
                  <Avatar key={i} className="h-6 w-6 border-2 border-card ring-1 ring-background">
                    <AvatarImage src={assignee.avatarUrl || undefined} />
                    <AvatarFallback className="text-[9px] bg-secondary text-secondary-foreground">
                      {assignee.displayName[0]}
                    </AvatarFallback>
                  </Avatar>
                ))}
                {project.recentAssignees.length > 3 && (
                  <div className="h-6 w-6 rounded-full bg-muted border-2 border-card flex items-center justify-center text-[9px] font-medium text-muted-foreground">
                    +{project.recentAssignees.length - 3}
                  </div>
                )}
              </>
            ) : (
              <span className="text-[10px] text-muted-foreground italic">Sem atividade</span>
            )}
          </div>
        </div>
      </Link>

      {/* Action Menu (Absolute) */}
      <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity z-20">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground hover:bg-background/80 bg-background/50 backdrop-blur-sm shadow-sm">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onEdit(); }}>
              <Pencil className="mr-2 h-4 w-4" />
              Editar
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={(e) => { e.stopPropagation(); onDelete(); }}
              className="text-destructive focus:text-destructive"
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Excluir
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

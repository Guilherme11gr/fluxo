'use client';

import Link from 'next/link';
import { FolderKanban, Bug, AlertTriangle, ChevronRight, Activity } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import type { ActiveProject } from '@/lib/query/hooks/use-dashboard';

interface ActiveProjectsBlockProps {
  projects: ActiveProject[];
  isLoading?: boolean;
}

/**
 * ActiveProjectsBlock - Bloco "Projetos Ativos" da dashboard
 * 
 * Cards simples de projetos onde o usuário tem tasks ativas.
 * Ordenados por bugs > quantidade de tasks.
 */
export function ActiveProjectsBlock({ projects, isLoading }: ActiveProjectsBlockProps) {
  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <FolderKanban className="h-5 w-5 text-muted-foreground" />
            Projetos Ativos
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-20 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (projects.length === 0) {
    return null;
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <FolderKanban className="h-5 w-5 text-muted-foreground" />
          Projetos Ativos
          <span className="text-sm font-normal text-muted-foreground ml-auto">
            {projects.length} {projects.length === 1 ? 'projeto' : 'projetos'}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {projects.map((project) => (
            <ProjectCard key={project.id} project={project} />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

interface ProjectCardProps {
  project: ActiveProject;
}

function ProjectCard({ project }: ProjectCardProps) {
  const hasBugs = project.bugCount > 0;
  const hasBlocked = project.blockedCount > 0;
  const healthStatus = project.health.status;

  const healthConfig = {
    healthy: {
      color: 'text-green-500 bg-green-500/10',
      label: 'Saudável',
    },
    attention: {
      color: 'text-yellow-500 bg-yellow-500/10',
      label: 'Atenção',
    },
    critical: {
      color: 'text-red-500 bg-red-500/10',
      label: 'Crítico',
    },
  };

  const config = healthConfig[healthStatus];
  const hasHealthIssues = healthStatus !== 'healthy';

  return (
    <Link href={`/tasks?projectId=${project.id}`} prefetch={false}>
      <div
        className={cn(
          'group p-4 rounded-lg border transition-all',
          'hover:border-primary/50 hover:bg-accent/30',
          hasBugs && 'border-red-500/30'
        )}
      >
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h3 className="font-medium text-sm truncate group-hover:text-primary transition-colors">
                {project.name}
              </h3>
              
              {/* Health Badge */}
              <TooltipProvider delayDuration={200}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className={cn(
                      'p-1 rounded-full transition-colors',
                      config.color
                    )}>
                      <Activity className="h-3 w-3" />
                    </div>
                  </TooltipTrigger>
                  {hasHealthIssues && (
                    <TooltipContent side="top" className="text-xs max-w-[200px]">
                      <div className="space-y-1">
                        <p className="font-medium">{config.label}</p>
                        {project.health.stagnatedTasks > 0 && (
                          <p>• {project.health.stagnatedTasks} task{project.health.stagnatedTasks > 1 ? 's' : ''} estagnada{project.health.stagnatedTasks > 1 ? 's' : ''}</p>
                        )}
                        {project.health.oldBlockedTasks > 0 && (
                          <p>• {project.health.oldBlockedTasks} bloqueio{project.health.oldBlockedTasks > 1 ? 's' : ''} antigo{project.health.oldBlockedTasks > 1 ? 's' : ''}</p>
                        )}
                        {project.health.unassignedCritical > 0 && (
                          <p>• {project.health.unassignedCritical} crítica{project.health.unassignedCritical > 1 ? 's' : ''} sem responsável</p>
                        )}
                      </div>
                    </TooltipContent>
                  )}
                  {!hasHealthIssues && (
                    <TooltipContent side="top" className="text-xs">
                      <p>Projeto saudável</p>
                    </TooltipContent>
                  )}
                </Tooltip>
              </TooltipProvider>
            </div>
            <Badge variant="outline" className="font-mono text-[10px] px-1.5 mt-1">
              {project.key}
            </Badge>
          </div>
          <ChevronRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0 mt-1" />
        </div>

        <div className="flex items-center gap-3 text-xs text-muted-foreground mt-3">
          <span className="flex items-center gap-1">
            <FolderKanban className="h-3 w-3" />
            {project.taskCount} {project.taskCount === 1 ? 'task' : 'tasks'}
          </span>

          {hasBugs && (
            <span className="flex items-center gap-1 text-red-400 font-medium">
              <Bug className="h-3 w-3" />
              {project.bugCount} {project.bugCount === 1 ? 'bug' : 'bugs'}
            </span>
          )}

          {hasBlocked && (
            <span className="flex items-center gap-1 text-amber-400 font-medium">
              <AlertTriangle className="h-3 w-3" />
              {project.blockedCount}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}

'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
  Play, 
  CheckCircle2, 
  XCircle, 
  Clock, 
  Loader2, 
  GitBranch, 
  ExternalLink,
  Terminal,
  RefreshCw
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface KaiCommand {
  id: string;
  commandType: string;
  status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED';
  output: string | null;
  resultSummary: string | null;
  branchName: string | null;
  prUrl: string | null;
  createdAt: string;
  updatedAt: string;
  task: {
    id: string;
    title: string;
  };
  project: {
    id: string;
    name: string;
  };
}

const statusConfig = {
  PENDING: { 
    label: 'Pendente', 
    color: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
    icon: Clock 
  },
  RUNNING: { 
    label: 'Executando', 
    color: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    icon: Loader2 
  },
  COMPLETED: { 
    label: 'Concluído', 
    color: 'bg-green-500/20 text-green-400 border-green-500/30',
    icon: CheckCircle2 
  },
  FAILED: { 
    label: 'Falhou', 
    color: 'bg-red-500/20 text-red-400 border-red-500/30',
    icon: XCircle 
  },
};

const commandTypeConfig = {
  FIX: { label: 'Fix', color: 'bg-red-500/20 text-red-300' },
  REFACTOR: { label: 'Refactor', color: 'bg-blue-500/20 text-blue-300' },
  TEST: { label: 'Test', color: 'bg-green-500/20 text-green-300' },
  DOCS: { label: 'Docs', color: 'bg-yellow-500/20 text-yellow-300' },
};

type FilterStatus = 'all' | 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED';

export default function KaiExecutionsPage() {
  const [commands, setCommands] = useState<KaiCommand[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCommand, setSelectedCommand] = useState<KaiCommand | null>(null);
  const [filter, setFilter] = useState<FilterStatus>('all');

  const fetchCommands = async () => {
    try {
      const res = await fetch('/api/kai/executions');
      const data = await res.json();
      setCommands(data.commands || []);
    } catch (error) {
      console.error('Error fetching commands:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCommands();
    const interval = setInterval(fetchCommands, 5000);
    return () => clearInterval(interval);
  }, []);

  const filteredCommands = commands.filter(cmd => filter === 'all' || cmd.status === filter);

  const filterButtons: { key: FilterStatus; label: string; count: number }[] = [
    { key: 'all', label: 'Todas', count: commands.length },
    { key: 'PENDING', label: 'Pendentes', count: commands.filter(c => c.status === 'PENDING').length },
    { key: 'RUNNING', label: 'Executando', count: commands.filter(c => c.status === 'RUNNING').length },
    { key: 'COMPLETED', label: 'Concluídas', count: commands.filter(c => c.status === 'COMPLETED').length },
    { key: 'FAILED', label: 'Falhas', count: commands.filter(c => c.status === 'FAILED').length },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Kai Executions</h1>
          <p className="text-muted-foreground">
            Acompanhe as execuções automáticas de tasks
          </p>
        </div>
        <Button variant="outline" onClick={fetchCommands}>
          <RefreshCw className="w-4 h-4 mr-2" />
          Atualizar
        </Button>
      </div>

      <div className="grid grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">{commands.length}</div>
            <p className="text-sm text-muted-foreground">Total</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-yellow-400">
              {commands.filter(c => c.status === 'PENDING').length}
            </div>
            <p className="text-sm text-muted-foreground">Pendentes</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-blue-400">
              {commands.filter(c => c.status === 'RUNNING').length}
            </div>
            <p className="text-sm text-muted-foreground">Executando</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-green-400">
              {commands.filter(c => c.status === 'COMPLETED').length}
            </div>
            <p className="text-sm text-muted-foreground">Concluídos</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-3 gap-6">
        <Card className="col-span-2">
          <CardHeader>
            <CardTitle>Execuções</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-2 mb-4 flex-wrap">
              {filterButtons.map((btn) => (
                <Button
                  key={btn.key}
                  variant={filter === btn.key ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setFilter(btn.key)}
                >
                  {btn.label} ({btn.count})
                </Button>
              ))}
            </div>

            <div className="space-y-2">
              {filteredCommands.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  Nenhuma execução {filter === 'all' ? '' : filter.toLowerCase()}
                </div>
              ) : (
                filteredCommands.map((cmd) => {
                  const StatusIcon = statusConfig[cmd.status].icon;
                  const typeConfig = commandTypeConfig[cmd.commandType as keyof typeof commandTypeConfig];
                  
                  return (
                    <div
                      key={cmd.id}
                      onClick={() => setSelectedCommand(cmd)}
                      className={cn(
                        'p-4 rounded-lg border cursor-pointer transition-colors',
                        selectedCommand?.id === cmd.id 
                          ? 'border-primary bg-primary/5' 
                          : 'hover:bg-accent'
                      )}
                    >
                      <div className="flex items-start justify-between">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <Badge className={cn('text-xs', typeConfig?.color)}>
                              {typeConfig?.label || cmd.commandType}
                            </Badge>
                            <Badge 
                              variant="outline" 
                              className={cn('text-xs', statusConfig[cmd.status].color)}
                            >
                              <StatusIcon className={cn(
                                'w-3 h-3 mr-1',
                                cmd.status === 'RUNNING' && 'animate-spin'
                              )} />
                              {statusConfig[cmd.status].label}
                            </Badge>
                          </div>
                          <p className="font-medium">{cmd.task.title}</p>
                          <p className="text-sm text-muted-foreground">
                            {cmd.project.name} • {new Date(cmd.createdAt).toLocaleString('pt-BR')}
                          </p>
                        </div>
                        {cmd.status === 'RUNNING' && (
                          <Loader2 className="w-5 h-5 animate-spin text-primary" />
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Detalhes</CardTitle>
          </CardHeader>
          <CardContent>
            {selectedCommand ? (
              <div className="space-y-4">
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">Task</p>
                  <p className="font-medium">{selectedCommand.task.title}</p>
                </div>
                
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">Projeto</p>
                  <p>{selectedCommand.project.name}</p>
                </div>

                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">Status</p>
                  <Badge className={statusConfig[selectedCommand.status].color}>
                    {statusConfig[selectedCommand.status].label}
                  </Badge>
                </div>

                {selectedCommand.branchName && (
                  <div className="space-y-2">
                    <p className="text-sm text-muted-foreground">Branch</p>
                    <div className="flex items-center gap-2">
                      <GitBranch className="w-4 h-4" />
                      <code className="text-sm">{selectedCommand.branchName}</code>
                    </div>
                  </div>
                )}

                {selectedCommand.prUrl && (
                  <div className="space-y-2">
                    <p className="text-sm text-muted-foreground">Pull Request</p>
                    <a 
                      href={selectedCommand.prUrl} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 text-primary hover:underline"
                    >
                      <ExternalLink className="w-4 h-4" />
                      Ver no GitHub
                    </a>
                  </div>
                )}

                {selectedCommand.resultSummary && (
                  <div className="space-y-2">
                    <p className="text-sm text-muted-foreground">Resumo</p>
                    <p className="text-sm">{selectedCommand.resultSummary}</p>
                  </div>
                )}

                {selectedCommand.output && (
                  <div className="space-y-2">
                    <p className="text-sm text-muted-foreground flex items-center gap-2">
                      <Terminal className="w-4 h-4" />
                      Output
                    </p>
                    <pre className="text-xs bg-muted p-3 rounded-lg overflow-auto max-h-60">
                      {selectedCommand.output}
                    </pre>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                Selecione uma execução para ver os detalhes
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

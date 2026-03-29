'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Play, Loader2, Check, X, GitBranch } from 'lucide-react';
import { cn } from '@/lib/utils';

interface KaiExecuteButtonProps {
  taskId: string;
  projectHasRepo: boolean;
  onExecute?: (commandType: string) => void;
  className?: string;
}

const COMMAND_TYPES = [
  { id: 'FIX', label: 'Fix', color: 'bg-red-500/20 text-red-300 hover:bg-red-500/30' },
  { id: 'REFACTOR', label: 'Refactor', color: 'bg-blue-500/20 text-blue-300 hover:bg-blue-500/30' },
  { id: 'TEST', label: 'Test', color: 'bg-green-500/20 text-green-300 hover:bg-green-500/30' },
  { id: 'DOCS', label: 'Docs', color: 'bg-yellow-500/20 text-yellow-300 hover:bg-yellow-500/30' },
];

export function KaiExecuteButton({ 
  taskId, 
  projectHasRepo, 
  onExecute,
  className 
}: KaiExecuteButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [lastCommand, setLastCommand] = useState<{ type: string; status: string } | null>(null);

  const handleExecute = async (commandType: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (!projectHasRepo) return;
    
    setIsLoading(true);
    setIsOpen(false);
    
    try {
      const res = await fetch('/api/kai/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId, commandType }),
      });
      
      const data = await res.json();
      
      if (data.success) {
        setLastCommand({ type: commandType, status: 'PENDING' });
        onExecute?.(commandType);
      } else {
        setLastCommand({ type: commandType, status: 'FAILED' });
      }
    } catch (error) {
      setLastCommand({ type: commandType, status: 'FAILED' });
    } finally {
      setIsLoading(false);
    }
  };

  if (!projectHasRepo) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            disabled
            className={cn('opacity-50', className)}
          >
            <GitBranch className="w-4 h-4 mr-1" />
            Sem repo
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          <p className="text-xs">Configure o GitHub repo no projeto</p>
        </TooltipContent>
      </Tooltip>
    );
  }

  if (isLoading) {
    return (
      <Button
        variant="outline"
        size="sm"
        disabled
        className={cn('border-primary/50', className)}
      >
        <Loader2 className="w-4 h-4 mr-1 animate-spin" />
        Executando...
      </Button>
    );
  }

  if (lastCommand) {
    const statusIcon = lastCommand.status === 'COMPLETED' ? <Check className="w-3 h-3" /> : 
                      lastCommand.status === 'FAILED' ? <X className="w-3 h-3" /> : 
                      <Loader2 className="w-3 h-3 animate-spin" />;
    
    return (
      <Badge 
        variant="outline" 
        className={cn(
          'cursor-pointer hover:bg-accent',
          lastCommand.status === 'COMPLETED' && 'border-green-500/50 text-green-400',
          lastCommand.status === 'FAILED' && 'border-red-500/50 text-red-400',
          lastCommand.status === 'PENDING' && 'border-yellow-500/50 text-yellow-400',
          className
        )}
        onClick={() => setLastCommand(null)}
      >
        {statusIcon}
        <span className="ml-1 text-xs">{lastCommand.type}</span>
      </Badge>
    );
  }

  if (isOpen) {
    return (
      <div className={cn('flex items-center gap-1', className)}>
        {COMMAND_TYPES.map((cmd) => (
          <Button
            key={cmd.id}
            variant="ghost"
            size="sm"
            className={cn('px-2 py-0 h-6 text-xs', cmd.color)}
            onClick={(e) => handleExecute(cmd.id, e)}
          >
            {cmd.label}
          </Button>
        ))}
        <Button
          variant="ghost"
          size="sm"
          className="px-2 py-0 h-6 text-xs"
          onClick={(e) => { e.stopPropagation(); setIsOpen(false); }}
        >
          <X className="w-3 h-3" />
        </Button>
      </div>
    );
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className={cn('hover:bg-primary/10', className)}
          onClick={(e) => { e.stopPropagation(); setIsOpen(true); }}
        >
          <Play className="w-4 h-4 mr-1" />
          Kai
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        <p className="text-xs">Executar com Kai</p>
      </TooltipContent>
    </Tooltip>
  );
}

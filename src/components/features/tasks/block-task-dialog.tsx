"use client";

import { useState, useEffect } from 'react';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { AlertTriangle, Loader2 } from 'lucide-react';

interface BlockTaskDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (reason: string) => void;
  onCancel: () => void;
  taskTitle?: string;
  isPending?: boolean;
}

/**
 * Modal para capturar motivo obrigatório ao bloquear uma task
 * 
 * Critérios:
 * - Textarea obrigatório (mínimo 10 caracteres)
 * - Botão confirmar desabilitado se motivo inválido
 * - Exibe título da task para contexto
 * - Disabled durante mutation (isPending)
 */
export function BlockTaskDialog({
  open,
  onOpenChange,
  onConfirm,
  onCancel,
  taskTitle,
  isPending = false,
}: BlockTaskDialogProps) {
  const [reason, setReason] = useState('');
  
  // ✅ Validação: min 10, max 500 caracteres
  const trimmedLength = reason.trim().length;
  const isReasonValid = trimmedLength >= 10 && trimmedLength <= 500;
  
  // ✅ Reset state ao fechar dialog (evita reuso de motivo antigo)
  useEffect(() => {
    if (!open) {
      setReason('');
    }
  }, [open]);

  const handleConfirm = (e: React.MouseEvent) => {
    e.preventDefault(); // Prevent default form submission behavior
    if (isReasonValid && !isPending) {
      onConfirm(reason.trim());
      setReason(''); // Reset para próxima abertura
    }
  };

  const handleCancel = () => {
    setReason(''); // Reset ao cancelar
    onCancel();
  };

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      setReason(''); // Reset ao fechar
    }
    onOpenChange(newOpen);
  };

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogContent className="sm:max-w-[500px]">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            Bloquear Task
          </AlertDialogTitle>
          <AlertDialogDescription className="text-left space-y-2">
            {taskTitle && (
              <div className="text-sm font-medium text-foreground/80 mb-3">
                Task: <span className="text-foreground">{taskTitle}</span>
              </div>
            )}
            <p>
              Informe o motivo do bloqueio. Esta informação será exibida para todos
              os membros da equipe e mantida no histórico.
            </p>
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-2 py-4">
          <Label htmlFor="block-reason" className="text-sm font-medium">
            Motivo do bloqueio <span className="text-red-500">*</span>
          </Label>
          <Textarea
            id="block-reason"
            placeholder="Ex: Aguardando aprovação do cliente, falta de informações, dependência bloqueada..."
            value={reason}
            onChange={(e) => {
              const value = e.target.value;
              // ✅ Hard limit: previne digitar mais de 500 chars
              if (value.length <= 500) {
                setReason(value);
              }
            }}
            maxLength={500}
            className="min-h-[100px] resize-none"
            disabled={isPending}
            autoFocus
          />
          <p className="text-xs text-muted-foreground">
            {trimmedLength > 500 ? (
              <span className="text-destructive font-medium">Máximo 500 caracteres</span>
            ) : (
              <span>
                {trimmedLength}/500 caracteres {trimmedLength < 10 && '(mínimo 10)'}
              </span>
            )}
          </p>
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel onClick={handleCancel} disabled={isPending}>
            Cancelar
          </AlertDialogCancel>
          <Button
            onClick={handleConfirm}
            disabled={!isReasonValid || isPending}
            className="bg-red-500 hover:bg-red-600"
          >
            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isPending ? 'Bloqueando...' : 'Bloquear Task'}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

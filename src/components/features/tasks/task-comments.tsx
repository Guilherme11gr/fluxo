'use client';

import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { UserAvatar } from '@/components/features/shared';
import { Skeleton } from '@/components/ui/skeleton';
import { useComments, useAddComment, useDeleteComment } from '@/lib/query/hooks/use-comments';
import { Loader2, Send, Trash2, MessageSquare, AlertCircle, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'sonner';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface TaskCommentsProps {
  taskId: string;
  className?: string;
}

export function TaskComments({ taskId, className }: TaskCommentsProps) {
  const [newComment, setNewComment] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const { data: comments = [], isLoading, isError, refetch } = useComments(taskId);
  const addComment = useAddComment();
  const deleteComment = useDeleteComment(taskId);

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!newComment.trim()) return;

    try {
      await addComment.mutateAsync({ taskId, content: newComment.trim() });
      setNewComment('');
      // Optional: scroll to bottom or focus
    } catch {
      // Error handled by hook toast
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleDelete = (commentId: string) => {
    toast.custom((t) => (
      <div className="bg-background border rounded-lg shadow-lg p-4 w-full max-w-sm">
        <div className="flex flex-col gap-2">
          <h4 className="font-semibold text-sm">Excluir comentário?</h4>
          <p className="text-xs text-muted-foreground">Esta ação não pode ser desfeita.</p>
          <div className="flex justify-end gap-2 mt-2">
            <Button size="sm" variant="outline" onClick={() => toast.dismiss(t)}>Cancelar</Button>
            <Button size="sm" variant="destructive" onClick={() => {
              deleteComment.mutate(commentId);
              toast.dismiss(t);
            }}>Excluir</Button>
          </div>
        </div>
      </div>
    ));
  };

  const formatDate = (date: string) => {
    return formatDistanceToNow(new Date(date), {
      addSuffix: true,
      locale: ptBR,
    });
  };

  return (
    <div className={cn('flex flex-col h-full', className)}>
      {/* Header with improved styling */}
      <div className="flex items-center justify-between pb-4">
        <div className="flex items-center gap-2">
          <div className="bg-primary/10 p-1.5 rounded-md">
            <MessageSquare className="size-4 text-primary" />
          </div>
          <h3 className="text-sm font-semibold tracking-tight">Comentários</h3>
          {comments.length > 0 && (
            <span className="text-xs font-medium text-muted-foreground bg-muted px-2 py-0.5 rounded-full border">
              {comments.length}
            </span>
          )}
        </div>

        {/* Helper Actions */}
        {isError && (
          <Button variant="ghost" size="sm" onClick={() => refetch()} className="text-destructive h-7 px-2 text-xs">
            <AlertCircle className="w-3 h-3 mr-1" />
            Erro. Tentar novamente
          </Button>
        )}
      </div>

      {/* Content Area */}
      <div className="space-y-6 overflow-y-auto pr-2 -mr-2 mb-4 custom-scrollbar">
        {isLoading ? (
          <div className="space-y-6 pt-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex gap-3">
                <Skeleton className="size-8 rounded-full shrink-0" />
                <div className="space-y-2 flex-1">
                  <div className="flex gap-2 items-center">
                    <Skeleton className="h-4 w-24 rounded-md" />
                    <Skeleton className="h-3 w-16 rounded-md" />
                  </div>
                  <Skeleton className="h-14 w-full rounded-lg rounded-tl-none" />
                </div>
              </div>
            ))}
          </div>
        ) : isError ? (
          <div className="flex flex-col items-center justify-center h-48 text-center space-y-3 opacity-80">
            <AlertCircle className="size-8 text-destructive/60" />
            <p className="text-sm text-muted-foreground">Não foi possível carregar os comentários.</p>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              <RefreshCw className="w-3 h-3 mr-2" />
              Tentar novamente
            </Button>
          </div>
        ) : comments.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-center space-y-3 bg-muted/5 rounded-xl border border-dashed border-muted-foreground/20 m-1">
            <div className="size-10 rounded-full bg-muted/50 flex items-center justify-center">
              <MessageSquare className="size-5 text-muted-foreground/60" />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium text-foreground">Nenhum comentário ainda</p>
              <p className="text-xs text-muted-foreground max-w-[220px]">
                Seja o primeiro a colaborar nesta tarefa.
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-5">
            {comments.map((comment) => (
              <div
                key={comment.id}
                className="group flex gap-3 animate-in fade-in slide-in-from-bottom-1 duration-300"
              >
                <UserAvatar
                  displayName={comment.user?.displayName}
                  avatarUrl={comment.user?.avatarUrl}
                  userId={comment.userId}
                  size="sm"
                  className="mt-0.5 shadow-sm ring-2 ring-background"
                />

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-foreground/90">
                        {comment.user?.displayName || 'Usuário'}
                      </span>
                      <span className="text-[10px] text-muted-foreground tabular-nums">
                        {formatDate(comment.createdAt)}
                      </span>
                    </div>

                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-6 opacity-0 group-hover:opacity-100 transition-all hover:bg-destructive/10 hover:text-destructive -mr-2"
                      onClick={() => handleDelete(comment.id)}
                      title="Excluir comentário"
                    >
                      <Trash2 className="size-3" />
                    </Button>
                  </div>

                  <div className="relative bg-muted/40 hover:bg-muted/60 transition-colors p-3.5 rounded-2xl rounded-tl-none text-sm text-foreground/90 leading-relaxed break-words border border-border/50 shadow-sm">
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      components={{
                        p: ({ children }) => <p className="m-0 mb-2 last:mb-0">{children}</p>,
                        a: ({ children, href }) => (
                          <a
                            href={href}
                            className="text-primary hover:text-primary/80 underline underline-offset-2"
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            {children}
                          </a>
                        ),
                        strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
                        em: ({ children }) => <em className="italic text-foreground/80">{children}</em>,
                        code: ({ children, className }) => {
                          const isInline = !className;
                          return isInline ? (
                            <code className="px-1.5 py-0.5 rounded text-xs bg-muted-foreground/10 text-foreground/90 font-mono border border-border/50">
                              {children}
                            </code>
                          ) : (
                            <code className={cn("block p-2 rounded-lg bg-muted-foreground/10 text-foreground font-mono text-xs overflow-x-auto border border-border/50", className)}>
                              {children}
                            </code>
                          );
                        },
                        ul: ({ children }) => <ul className="m-0 mb-2 pl-4 space-y-1 list-disc">{children}</ul>,
                        ol: ({ children }) => <ol className="m-0 mb-2 pl-4 space-y-1 list-decimal">{children}</ol>,
                        li: ({ children }) => <li className="text-foreground/90">{children}</li>,
                        h1: ({ children }) => <h1 className="text-base font-semibold text-foreground mt-0 mb-2">{children}</h1>,
                        h2: ({ children }) => <h2 className="text-sm font-semibold text-foreground mt-0 mb-2">{children}</h2>,
                        h3: ({ children }) => <h3 className="text-sm font-medium text-foreground mt-0 mb-1">{children}</h3>,
                        blockquote: ({ children }) => (
                          <blockquote className="m-0 mb-2 pl-3 border-l-2 border-border/50 text-foreground/70 italic">
                            {children}
                          </blockquote>
                        ),
                        hr: () => <hr className="my-2 border-border/50" />,
                      }}
                    >
                      {comment.content}
                    </ReactMarkdown>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer / Input */}
      <div className="relative">
        <div className="flex gap-3 items-end">
          <div className="flex-1 relative group rounded-2xl border bg-background/50 hover:bg-background focus-within:bg-background focus-within:ring-2 focus-within:ring-primary/10 focus-within:border-primary/50 transition-all shadow-sm">
            <Textarea
              ref={textareaRef}
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Escreva um comentário..."
              className="min-h-[48px] max-h-[150px] w-full resize-none border-0 focus-visible:ring-0 bg-transparent py-3.5 pl-4 pr-12 text-sm placeholder:text-muted-foreground/60"
              disabled={addComment.isPending}
            />

            <div className="absolute bottom-1.5 right-1.5">
              <Button
                size="icon"
                type="button"
                className={cn(
                  "size-8 rounded-xl transition-all duration-200",
                  newComment.trim()
                    ? "opacity-100 scale-100 shadow-sm"
                    : "opacity-40 scale-90"
                )}
                disabled={!newComment.trim() || addComment.isPending}
                onClick={() => handleSubmit()}
              >
                {addComment.isPending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Send className="size-4 ml-0.5" />
                )}
              </Button>
            </div>
          </div>
        </div>
        <div className="flex justify-between items-center mt-2">
          <p className="text-[10px] text-muted-foreground/50">
            <span className="hidden sm:inline">Markdown: **negrito** *itálico* `código` [link](url)</span>
          </p>
          <p className="text-[10px] text-muted-foreground/50 text-right">
            <strong>Enter</strong> para enviar • <strong>Shift + Enter</strong> para quebra de linha
          </p>
        </div>
      </div>
    </div>
  );
}

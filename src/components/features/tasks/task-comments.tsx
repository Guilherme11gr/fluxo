'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { UserAvatar } from '@/components/features/shared';
import { Skeleton } from '@/components/ui/skeleton';
import { useComments, useAddComment, useDeleteComment } from '@/lib/query/hooks/use-comments';
import { useUsers, type User } from '@/lib/query/hooks/use-users';
import { useMention } from '@/lib/query/hooks/use-mention';
import { Loader2, Send, Trash2, MessageSquare, AlertCircle, RefreshCw, AtSign } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'sonner';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

// Regex to match @mentions: @DisplayName (with optional trailing punctuation/space)
const MENTION_REGEX = /@([\wÀ-ÿ\s]+?)(?=[\s,.\-!?;:)\]}>]|$)/g;

/**
 * Highlight @mentions in rendered comment text.
 * Wraps matched @mentions in styled spans with bold + color.
 */
function MentionHighlight({ children }: { children: React.ReactNode }) {
  if (typeof children !== 'string') return <>{children}</>;

  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  // Reset lastIndex for the global regex
  MENTION_REGEX.lastIndex = 0;

  while ((match = MENTION_REGEX.exec(children)) !== null) {
    // Add text before the mention
    if (match.index > lastIndex) {
      parts.push(children.slice(lastIndex, match.index));
    }
    // Add the styled mention
    parts.push(
      <span
        key={match.index}
        className="font-semibold text-primary bg-primary/10 px-1 py-0.5 rounded-md hover:bg-primary/20 transition-colors cursor-default"
      >
        @{match[1]}
      </span>
    );
    lastIndex = match.index + match[0].length;
  }

  // Add remaining text
  if (lastIndex < children.length) {
    parts.push(children.slice(lastIndex));
  }

  // If no mentions found, return original
  if (parts.length === 0) return <>{children}</>;

  return <>{parts}</>;
}

/**
 * Markdown components for rendering comments with mention support.
 */
const commentMarkdownComponents = {
  p: ({ children }: any) => <p className="m-0 mb-2 last:mb-0">{children}</p>,
  text: ({ children }: any) => <MentionHighlight>{children}</MentionHighlight>,
  a: ({ children, href }: any) => (
    <a
      href={href}
      className="text-primary hover:text-primary/80 underline underline-offset-2"
      target="_blank"
      rel="noopener noreferrer"
    >
      {children}
    </a>
  ),
  strong: ({ children }: any) => <strong className="font-semibold text-foreground">{children}</strong>,
  em: ({ children }: any) => <em className="italic text-foreground/80">{children}</em>,
  code: ({ children, className }: any) => {
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
  ul: ({ children }: any) => <ul className="m-0 mb-2 pl-4 space-y-1 list-disc">{children}</ul>,
  ol: ({ children }: any) => <ol className="m-0 mb-2 pl-4 space-y-1 list-decimal">{children}</ol>,
  li: ({ children }: any) => <li className="text-foreground/90">{children}</li>,
  h1: ({ children }: any) => <h1 className="text-base font-semibold text-foreground mt-0 mb-2">{children}</h1>,
  h2: ({ children }: any) => <h2 className="text-sm font-semibold text-foreground mt-0 mb-2">{children}</h2>,
  h3: ({ children }: any) => <h3 className="text-sm font-medium text-foreground mt-0 mb-1">{children}</h3>,
  blockquote: ({ children }: any) => (
    <blockquote className="m-0 mb-2 pl-3 border-l-2 border-border/50 text-foreground/70 italic">
      {children}
    </blockquote>
  ),
  hr: () => <hr className="my-2 border-border/50" />,
};

interface TaskCommentsProps {
  taskId: string;
  className?: string;
}

export function TaskComments({ taskId, className }: TaskCommentsProps) {
  const [newComment, setNewComment] = useState('');
  const localTextareaRef = useRef<HTMLTextAreaElement>(null);

  const { data: comments = [], isLoading, isError, refetch } = useComments(taskId);
  const { data: users = [] } = useUsers();
  const addComment = useAddComment();
  const deleteComment = useDeleteComment(taskId);

  const {
    isOpen: mentionOpen,
    activeIndex,
    suggestions,
    textareaRef: mentionTextareaRef,
    detectMention,
    insertMention,
    moveActiveIndex,
    closeMention,
    selectActive,
  } = useMention({ users });

  // Sync refs so the mention hook can control the textarea
  const syncRef = useCallback(
    (node: HTMLTextAreaElement | null) => {
      (localTextareaRef as React.MutableRefObject<HTMLTextAreaElement | null>).current = node;
      (mentionTextareaRef as React.MutableRefObject<HTMLTextAreaElement | null>).current = node;
    },
    [mentionTextareaRef]
  );

  // Track cursor position for mention detection
  const cursorRef = useRef(0);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const value = e.target.value;
      const cursorPos = e.target.selectionStart;
      cursorRef.current = cursorPos;
      setNewComment(value);
      detectMention(value, cursorPos);
    },
    [detectMention]
  );

  const handleSelect = useCallback(
    (e: React.SyntheticEvent<HTMLTextAreaElement>) => {
      const target = e.target as HTMLTextAreaElement;
      const cursorPos = target.selectionStart;
      cursorRef.current = cursorPos;
      detectMention(newComment, cursorPos);
    },
    [detectMention, newComment]
  );

  const handleSubmit = useCallback(
    async (e?: React.FormEvent) => {
      e?.preventDefault();
      if (!newComment.trim()) return;

      try {
        await addComment.mutateAsync({ taskId, content: newComment.trim() });
        setNewComment('');
        cursorRef.current = 0;
      } catch {
        // Error handled by hook toast
      }
    },
    [newComment, addComment, taskId]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      // If mention dropdown is open, intercept navigation keys
      if (mentionOpen) {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          moveActiveIndex('down');
          return;
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          moveActiveIndex('up');
          return;
        }
        if (e.key === 'Enter') {
          e.preventDefault();
          const result = selectActive(newComment, cursorRef.current);
          if (result) {
            setNewComment(result.text);
            cursorRef.current = result.cursorPosition;
          }
          return;
        }
        if (e.key === 'Escape') {
          e.preventDefault();
          closeMention();
          return;
        }
      }

      // Normal submit: Enter without Shift
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSubmit();
      }
    },
    [mentionOpen, moveActiveIndex, selectActive, newComment, closeMention, handleSubmit]
  );

  const handleDelete = (commentId: string) => {
    toast.custom((t) => (
      <div className="bg-background border rounded-lg shadow-lg p-4 w-full max-w-sm">
        <div className="flex flex-col gap-2">
          <h4 className="font-semibold text-sm">Excluir comentario?</h4>
          <p className="text-xs text-muted-foreground">Esta acao nao pode ser desfeita.</p>
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

  // Close mention on click outside
  useEffect(() => {
    if (!mentionOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (
        localTextareaRef.current &&
        !localTextareaRef.current.contains(e.target as Node) &&
        !(e.target as HTMLElement).closest('[data-mention-dropdown]')
      ) {
        closeMention();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [mentionOpen, closeMention]);

  return (
    <div className={cn('flex flex-col h-full', className)}>
      {/* Header with improved styling */}
      <div className="flex items-center justify-between pb-4">
        <div className="flex items-center gap-2">
          <div className="bg-primary/10 p-1.5 rounded-md">
            <MessageSquare className="size-4 text-primary" />
          </div>
          <h3 className="text-sm font-semibold tracking-tight">Comentarios</h3>
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
            <p className="text-sm text-muted-foreground">Nao foi possivel carregar os comentarios.</p>
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
              <p className="text-sm font-medium text-foreground">Nenhum comentario ainda</p>
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
                        {comment.user?.displayName || 'Usuario'}
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
                      title="Excluir comentario"
                    >
                      <Trash2 className="size-3" />
                    </Button>
                  </div>

                  <div className="relative bg-muted/40 hover:bg-muted/60 transition-colors p-3.5 rounded-2xl rounded-tl-none text-sm text-foreground/90 leading-relaxed break-words border border-border/50 shadow-sm">
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      components={commentMarkdownComponents}
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
              ref={syncRef}
              value={newComment}
              onChange={handleChange}
              onSelect={handleSelect}
              onKeyDown={handleKeyDown}
              placeholder="Escreva um comentario... (use @ para mencionar)"
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

            {/* Mention Dropdown */}
            {mentionOpen && suggestions.length > 0 && (
              <div
                data-mention-dropdown
                className="absolute bottom-full left-0 right-0 mb-1 mx-1 bg-popover border border-border rounded-xl shadow-lg overflow-hidden z-50 animate-in fade-in slide-in-from-bottom-1 duration-150"
              >
                <div className="px-3 py-2 border-b border-border/50 bg-muted/30">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <AtSign className="size-3" />
                    <span>Mencionar usuario</span>
                  </div>
                </div>
                <div className="max-h-[200px] overflow-y-auto p-1">
                  {suggestions.map((user, index) => (
                    <button
                      key={user.id}
                      type="button"
                      className={cn(
                        "w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-left transition-colors text-sm",
                        index === activeIndex
                          ? "bg-primary/10 text-primary"
                          : "hover:bg-muted/60 text-foreground/90"
                      )}
                      onMouseDown={(e) => {
                        e.preventDefault(); // Prevent textarea blur
                        const result = insertMention(user, newComment, cursorRef.current);
                        if (result) {
                          setNewComment(result.text);
                          cursorRef.current = result.cursorPosition;
                        }
                      }}
                      onMouseEnter={() => {
                        // Update active index on hover
                      }}
                    >
                      <UserAvatar
                        userId={user.id}
                        displayName={user.displayName}
                        avatarUrl={user.avatarUrl}
                        size="sm"
                        showTooltip={false}
                        className="size-5 shrink-0"
                      />
                      <span className="font-medium truncate">{user.displayName || 'Usuario'}</span>
                      <span className="text-[10px] text-muted-foreground ml-auto shrink-0">{user.role}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
        <div className="flex justify-between items-center mt-2">
          <p className="text-[10px] text-muted-foreground/50">
            <span className="hidden sm:inline">Markdown: **negrito** *italico* `codigo` [link](url) • @nome para mencionar</span>
          </p>
          <p className="text-[10px] text-muted-foreground/50 text-right">
            <strong>Enter</strong> para enviar • <strong>Shift + Enter</strong> para quebra de linha
          </p>
        </div>
      </div>
    </div>
  );
}

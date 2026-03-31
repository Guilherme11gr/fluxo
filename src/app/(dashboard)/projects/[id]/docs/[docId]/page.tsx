"use client";

import { use } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ArrowLeft, Calendar, Clock, Edit, FileText, Share2, MoreHorizontal, Tag, Loader2, Link as LinkIcon, Copy, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import { useDoc, useShareDoc, useDisableDocSharing } from "@/lib/query/hooks/use-project-docs";
import { useDocTags, useProjectTags, useAssignTags, useUnassignTag } from "@/lib/query/hooks/use-doc-tags";
import { UserAvatar } from "@/components/features/shared/user-avatar";
import { DocTagBadge, DocTagInput } from "@/components/features/docs";
import { MermaidDiagram } from "@/components/ui/mermaid-diagram";

export default function ProjectDocPage({
  params,
}: {
  params: Promise<{ id: string; docId: string }>;
}) {
  const { id: projectId, docId } = use(params);
  const router = useRouter();
  const { data: doc, isLoading, isError } = useDoc(docId);
  const { data: docTags = [], isLoading: tagsLoading } = useDocTags(docId);
  const { data: projectTags = [] } = useProjectTags(projectId);
  const assignTags = useAssignTags(projectId);
  const unassignTag = useUnassignTag(projectId);

  // JKILL-63: Share functionality
  const shareDoc = useShareDoc();
  const disableSharing = useDisableDocSharing();
  const [copied, setCopied] = useState(false);

  const handleAddTag = (tagId: string) => {
    assignTags.mutate({ docId, tagIds: [tagId] });
  };

  const handleRemoveTag = (tagId: string) => {
    unassignTag.mutate({ docId, tagId });
  };

  // JKILL-63: Handle share button click
  const handleShare = () => {
    shareDoc.mutate(docId);
  };

  // JKILL-63: Handle disable sharing
  const handleDisableSharing = () => {
    disableSharing.mutate(docId);
  };

  // JKILL-63: Copy share URL to clipboard with null safety fix
  const handleCopyLink = async () => {
    const token = doc?.shareToken;
    if (token) {
      const shareUrl = `${window.location.origin}/shared/docs/${token}`;
      try {
        // Try modern clipboard API first
        if (navigator.clipboard && window.isSecureContext) {
          await navigator.clipboard.writeText(shareUrl);
        } else {
          // Fallback for older browsers or non-secure contexts
          const textArea = document.createElement('textarea');
          textArea.value = shareUrl;
          textArea.style.position = 'fixed';
          textArea.style.left = '-999999px';
          textArea.style.top = '-999999px';
          document.body.appendChild(textArea);
          textArea.focus();
          textArea.select();
          document.execCommand('copy');
          document.body.removeChild(textArea);
        }
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch (err) {
        console.error('Failed to copy:', err);
      }
    }
  };

  if (isLoading) {
    return <DocDetailSkeleton />;
  }

  if (isError || !doc) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] space-y-4">
        <FileText className="size-12 text-muted-foreground/50" />
        <h2 className="text-xl font-semibold">Documento não encontrado</h2>
        <Button variant="outline" onClick={() => router.back()}>
          Voltar
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto pb-20 animate-in fade-in duration-500">
      {/* Navigation */}
      <div className="mb-6 flex items-center justify-between">
        <Link href={`/projects/${projectId}`}>
          <Button variant="ghost" className="gap-2 pl-0 hover:pl-2 transition-all text-muted-foreground hover:text-foreground">
            <ArrowLeft className="size-4" />
            Voltar para o projeto
          </Button>
        </Link>
        <div className="flex gap-2">
          {/* Actions would go here */}
        </div>
      </div>

      {/* Header */}
      <div className="space-y-4 mb-8">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <Badge variant="outline" className="mb-2 hover:bg-muted transition-colors">
              Documentação / {doc.title}
            </Badge>
            <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-foreground">
              {doc.title}
            </h1>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="icon" title="Editar (Em breve)">
              <Edit className="size-4" />
            </Button>
            {/* JKILL-63: Share status indicator */}
            {doc.isPublic && (
              <Badge variant="secondary" className="h-9 px-3 text-xs">
                <LinkIcon className="mr-1 size-3" />
                Público
              </Badge>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" disabled={shareDoc.isPending || disableSharing.isPending}>
                  <MoreHorizontal className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {doc.isPublic ? (
                  <>
                    <DropdownMenuItem onClick={handleCopyLink}>
                      <Copy className="mr-2 size-4" />
                      {copied ? 'Copiado!' : 'Copiar link'}
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={handleDisableSharing} className="text-red-600 focus:text-red-600">
                      <X className="mr-2 size-4" />
                      Desativar compartilhamento
                    </DropdownMenuItem>
                  </>
                ) : (
                  <DropdownMenuItem onClick={handleShare}>
                    <Share2 className="mr-2 size-4" />
                    Compartilhar publicamente
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Metadata */}
        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <Calendar className="size-4" />
            <span>
              Criado {formatDistanceToNow(new Date(doc.createdAt), { locale: ptBR, addSuffix: true })}
            </span>
          </div>
          <Separator orientation="vertical" className="h-4" />
          <div className="flex items-center gap-2">
            <Clock className="size-4" />
            <span>
              Atualizado {formatDistanceToNow(new Date(doc.updatedAt), { locale: ptBR, addSuffix: true })}
            </span>
          </div>
        </div>

        {/* Tags Section */}
        <div className="pt-4 border-t">
          <div className="flex items-center gap-2 mb-3">
            <Tag className="size-4 text-muted-foreground" />
            <span className="text-sm font-medium">Tags</span>
            {(assignTags.isPending || unassignTag.isPending) && (
              <Loader2 className="size-3 animate-spin text-muted-foreground" />
            )}
          </div>
          <DocTagInput
            value={docTags}
            availableTags={projectTags}
            onAdd={handleAddTag}
            onRemove={handleRemoveTag}
            isLoading={tagsLoading}
          />
        </div>
      </div>

      {/* Content */}
      <article className="prose prose-zinc dark:prose-invert max-w-none prose-headings:font-semibold prose-a:text-primary prose-a:no-underline hover:prose-a:underline prose-pre:bg-muted/50 prose-pre:border prose-pre:rounded-xl">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            h1: ({ children }) => <h1 className="text-3xl font-bold mt-8 mb-4 border-b pb-2">{children}</h1>,
            h2: ({ children }) => <h2 className="text-2xl font-semibold mt-8 mb-4 flex items-center gap-2">{children}</h2>,
            h3: ({ children }) => <h3 className="text-xl font-semibold mt-6 mb-3 text-foreground/90">{children}</h3>,
            ul: ({ children }) => <ul className="my-4 ml-6 list-disc [&>li]:mt-2">{children}</ul>,
            ol: ({ children }) => <ol className="my-4 ml-6 list-decimal [&>li]:mt-2">{children}</ol>,
            li: ({ children }) => <li className="text-foreground/90 leading-relaxed">{children}</li>,
            p: ({ children }) => <p className="leading-7 [&:not(:first-child)]:mt-4 text-foreground/90">{children}</p>,
            blockquote: ({ children }) => (
              <blockquote className="mt-6 border-l-4 border-primary/30 pl-6 italic text-muted-foreground bg-muted/20 p-4 rounded-r-lg">
                {children}
              </blockquote>
            ),
            code: ({ className, children, ...props }) => {
              const match = /language-(\w+)/.exec(className || "");
              const isInline = !match && !String(children).includes("\n");

              if (match?.[1] === "mermaid") {
                return <MermaidDiagram chart={String(children)} />;
              }

              if (isInline) {
                return (
                  <code className="bg-muted px-[0.3rem] py-[0.2rem] rounded text-sm font-mono text-primary font-medium" {...props}>
                    {children}
                  </code>
                );
              }

              return (
                <div className="relative group my-4 rounded-xl overflow-hidden border bg-zinc-950 dark:bg-zinc-900 text-zinc-50">
                  <div className="flex items-center justify-between px-4 py-2 bg-zinc-900/50 border-b border-zinc-800">
                    <span className="text-xs text-zinc-400 font-mono">{match?.[1] || 'text'}</span>
                  </div>
                  <pre className="p-4 overflow-x-auto text-sm font-mono leading-relaxed">
                    <code className={className} {...props}>
                      {children}
                    </code>
                  </pre>
                </div>
              );
            },
            table: ({ children }) => (
              <div className="my-6 w-full overflow-y-auto rounded-lg border">
                <table className="w-full text-sm">{children}</table>
              </div>
            ),
            thead: ({ children }) => <thead className="bg-muted/50 text-left font-semibold">{children}</thead>,
            tbody: ({ children }) => <tbody className="divide-y">{children}</tbody>,
            tr: ({ children }) => <tr className="transition-colors hover:bg-muted/10 m-0 p-0 even:bg-muted/5">{children}</tr>,
            th: ({ children }) => <th className="px-4 py-3 text-left align-middle font-medium text-muted-foreground [&:has([role=checkbox])]:pr-0">{children}</th>,
            td: ({ children }) => <td className="p-4 align-middle [&:has([role=checkbox])]:pr-0">{children}</td>,
            hr: () => <hr className="my-8 border-muted" />,
          }}
        >
          {doc.content}
        </ReactMarkdown>
      </article>
    </div>
  );
}

function DocDetailSkeleton() {
  return (
    <div className="mx-auto space-y-8 animate-pulse">
      <div className="flex items-center justify-between">
        <Skeleton className="h-9 w-32" />
      </div>
      <div className="space-y-4">
        <div className="flex justify-between">
          <div className="space-y-2">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-10 w-3/4" />
          </div>
          <Skeleton className="h-10 w-10" />
        </div>
        <div className="flex gap-4 border-b pb-6">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-5 w-1" />
          <Skeleton className="h-5 w-32" />
        </div>
      </div>
      <div className="space-y-4">
        <Skeleton className="h-6 w-full" />
        <Skeleton className="h-6 w-5/6" />
        <Skeleton className="h-6 w-full" />
        <Skeleton className="h-40 w-full rounded-xl" />
        <Skeleton className="h-6 w-11/12" />
      </div>
    </div>
  );
}

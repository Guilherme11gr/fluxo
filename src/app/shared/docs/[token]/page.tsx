import { notFound } from 'next/navigation';
import { projectDocRepository } from '@/infra/adapters/prisma';
import { Lock, FileText, Calendar } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { MarkdownViewer } from '@/components/ui/markdown-viewer';

interface PublicDocPageProps {
  params: Promise<{ token: string }>;
}

/**
 * Public Doc Page - Read-only view of shared documentation
 *
 * JKILL-63: This page allows anyone with a valid share token to view
 * a project document without authentication. The doc must be marked
 * as public (isPublic=true) to be accessible.
 */
export default async function PublicDocPage({ params }: PublicDocPageProps) {
  const { token } = await params;

  // Fetch the shared doc
  const doc = await projectDocRepository.findByShareToken(token);

  // Return 404 if doc not found or not public
  if (!doc) {
    notFound();
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-muted/30 via-background to-muted/20">
      {/* Header */}
      <header className="bg-background/80 backdrop-blur-sm border-b sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between max-w-4xl">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary/10 rounded-lg">
              <FileText className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-sm font-semibold text-foreground">Documentação Pública</h1>
              <p className="text-xs text-muted-foreground">{doc.projectName}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 px-3 py-1.5 rounded-full">
            <Lock className="h-3.5 w-3.5" />
            <span>Apenas leitura</span>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8 max-w-4xl">
        {/* Doc Header */}
        <div className="mb-8">
          <div className="flex items-start justify-between gap-4 mb-4">
            <div className="flex-1">
              <h2 className="text-3xl font-bold mb-3 tracking-tight">{doc.title}</h2>
              {doc.sharedAt && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Calendar className="h-4 w-4" />
                  <span>
                    Compartilhado {formatDistanceToNow(new Date(doc.sharedAt), { locale: ptBR, addSuffix: true })}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Doc Content */}
        <div className="bg-background rounded-xl border shadow-sm p-8">
          <div className="prose prose-sm md:prose-base dark:prose-invert max-w-none
                      prose-headings:font-semibold prose-headings:text-foreground/90
                      prose-p:leading-relaxed prose-p:text-muted-foreground
                      prose-strong:text-foreground
                      prose-blockquote:border-violet-300 prose-blockquote:bg-violet-50/50
                      prose-blockquote:py-1 prose-blockquote:px-4 prose-blockquote:rounded-r-sm
                      prose-blockquote:not-italic prose-blockquote:text-violet-700
                      dark:prose-blockquote:bg-violet-900/20 dark:prose-blockquote:border-violet-700
                      dark:prose-blockquote:text-violet-300
                      prose-code:break-words prose-pre:overflow-x-auto prose-pre:max-w-full
                      prose-hr:border-border">
            <MarkdownViewer value={doc.content} />
          </div>
        </div>

        {/* Footer */}
        <div className="mt-8 text-center text-sm text-muted-foreground">
          <p>
            Compartilhado via <span className="font-mono text-xs bg-muted px-2 py-1 rounded">Jira Killer</span>
          </p>
          <p className="text-xs mt-1">
            Este é um link público de leitura. Qualquer pessoa com o link pode visualizar este documento.
          </p>
        </div>
      </main>

      {/* Background Decoration */}
      <div className="fixed inset-0 -z-10 pointer-events-none overflow-hidden">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-primary/5 rounded-full blur-3xl" />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-violet-500/5 rounded-full blur-3xl" />
      </div>
    </div>
  );
}

/**
 * Generate metadata for the public doc page
 */
export async function generateMetadata({ params }: PublicDocPageProps) {
  const { token } = await params;
  const doc = await projectDocRepository.findByShareToken(token);

  if (!doc) {
    return {
      title: 'Documento não encontrado',
    };
  }

  return {
    title: `${doc.title} - ${doc.projectName}`,
    description: `Documento compartilhado: ${doc.title.substring(0, 160)}...`,
  };
}

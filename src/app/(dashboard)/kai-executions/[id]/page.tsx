'use client';

import { useParams, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import { ExecutionDetailPanel } from '@/components/features/executions/execution-detail-panel';

export default function ExecutionDetailPage() {
  const params = useParams();
  const router = useRouter();
  const executionId = params?.id as string;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" className="gap-1" onClick={() => router.push('/kai-executions')}>
          <ArrowLeft className="h-4 w-4" />
          Voltar
        </Button>
        <div>
          <h1 className="text-2xl font-bold">Execução</h1>
          <p className="text-sm text-muted-foreground font-mono">{executionId}</p>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-card p-5">
        <ExecutionDetailPanel executionId={executionId} />
      </div>
    </div>
  );
}

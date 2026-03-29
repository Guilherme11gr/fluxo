import { NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { extractAuthenticatedTenant } from '@/shared/http/auth.helpers';
import { jsonError } from '@/shared/http/responses';
import { handleError } from '@/shared/errors';
import { prisma } from '@/infra/adapters/prisma';

export const dynamic = 'force-dynamic';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const { tenantId } = await extractAuthenticatedTenant(supabase);

    const { id } = await params;

    // Verificar se o comando existe e pertence ao tenant
    const kaiCommand = await prisma.kaiCommand.findUnique({
      where: { id },
      include: { project: true },
    });

    if (!kaiCommand) {
      return new Response(
        `data: ${JSON.stringify({ error: 'Command not found' })}\n\n`,
        { status: 404, headers: { 'Content-Type': 'text/event-stream' } }
      );
    }

    if (!kaiCommand.project || kaiCommand.project.orgId !== tenantId) {
      return new Response(
        `data: ${JSON.stringify({ error: 'Command does not belong to your organization' })}\n\n`,
        { status: 403, headers: { 'Content-Type': 'text/event-stream' } }
      );
    }

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const sendEvent = (data: unknown) => {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        };

        // Enviar status inicial
        sendEvent({
          type: 'status',
          status: kaiCommand.status,
          output: kaiCommand.output,
          result_summary: kaiCommand.resultSummary,
          branch_name: kaiCommand.branchName,
          pr_url: kaiCommand.prUrl,
        });

        // Se já estiver completo ou falhou, fechar stream
        if (kaiCommand.status === 'COMPLETED' || kaiCommand.status === 'FAILED') {
          sendEvent({ type: 'done' });
          controller.close();
          return;
        }

        // Polling para atualizações (a cada 2 segundos)
        const interval = setInterval(async () => {
          try {
            const updated = await prisma.kaiCommand.findUnique({
              where: { id },
            });

            if (!updated) {
              sendEvent({ type: 'error', message: 'Command not found' });
              clearInterval(interval);
              controller.close();
              return;
            }

            sendEvent({
              type: 'status',
              status: updated.status,
              output: updated.output,
              result_summary: updated.resultSummary,
              branch_name: updated.branchName,
              pr_url: updated.prUrl,
            });

            if (updated.status === 'COMPLETED' || updated.status === 'FAILED') {
              sendEvent({ type: 'done' });
              clearInterval(interval);
              controller.close();
            }
          } catch (error) {
            console.error('Error polling Kai command:', error);
            sendEvent({ type: 'error', message: 'Polling error' });
            clearInterval(interval);
            controller.close();
          }
        }, 2000);

        // Cleanup após 10 minutos
        setTimeout(() => {
          clearInterval(interval);
          controller.close();
        }, 10 * 60 * 1000);
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });

  } catch (error) {
    const { body } = handleError(error);
    return new Response(
      `data: ${JSON.stringify({ error: body.error.message })}\n\n`,
      { status: 500, headers: { 'Content-Type': 'text/event-stream' } }
    );
  }
}

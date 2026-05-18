import { createClient } from '@/lib/supabase/server';
import { extractAuthenticatedTenant } from '@/shared/http/auth.helpers';
import { jsonError } from '@/shared/http/responses';
import { handleError } from '@/shared/errors';
import { agentExecutionEventRepository, agentExecutionRepository } from '@/infra/adapters/prisma';

export const dynamic = 'force-dynamic';

export const TERMINAL_STATUSES = new Set(['SUCCESS', 'FAILED', 'TIMEOUT', 'CANCELLED']);
export const POLL_INTERVAL_MS = 1000;
export const HEARTBEAT_INTERVAL_MS = 15000;
export const MAX_STREAM_DURATION_MS = 5 * 60 * 1000;
export const MAX_CONSECUTIVE_ERRORS = 10;

function formatSSE(event: string, data: string): string {
  return `event: ${event}\ndata: ${data}\n\n`;
}

function formatEventData(item: { id: string; seq: number; kind: string; content: string; metadata: Record<string, unknown>; createdAt: Date }): string {
  return JSON.stringify({
    id: item.id,
    seq: item.seq,
    kind: item.kind,
    content: item.content,
    metadata: item.metadata,
    createdAt: item.createdAt.toISOString(),
  });
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const { tenantId } = await extractAuthenticatedTenant(supabase);
    const { id } = await params;

    const execution = await agentExecutionRepository.findById(id);
    if (!execution || execution.orgId !== tenantId) {
      return jsonError('NOT_FOUND', 'Execution not found', 404);
    }

    const { searchParams } = new URL(request.url);
    const lastSeqParam = searchParams.get('lastSeq') ?? searchParams.get('afterSeq');
    const initialSeq = lastSeqParam ? parseInt(lastSeqParam, 10) : 0;

    if (isNaN(initialSeq)) {
      return jsonError('BAD_REQUEST', 'Invalid lastSeq parameter', 400);
    }

    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();
        let currentSeq = initialSeq;
        const startTime = Date.now();
        let heartbeatHandle: ReturnType<typeof setInterval> | null = null;
        let closed = false;

        const send = (text: string) => {
          if (closed) return;
          controller.enqueue(encoder.encode(text));
        };

        const close = () => {
          if (closed) return;
          closed = true;
          if (heartbeatHandle !== null) clearInterval(heartbeatHandle);
          try { controller.close(); } catch {}
        };

        try {
          const replayPage = await agentExecutionEventRepository.findPageByExecutionId(id, initialSeq, 500);
          for (const item of replayPage.items) {
            send(formatSSE('event', formatEventData(item)));
            currentSeq = Math.max(currentSeq, item.seq);
          }
        } catch (err) {
          console.error('[exec-stream] replay error:', err);
          send(formatSSE('error', JSON.stringify({ message: 'replay_failed' })));
        }

        let consecutiveErrors = 0;

        const poll = async () => {
          if (closed) return;

          if (request.signal.aborted) {
            close();
            return;
          }

          if (Date.now() - startTime > MAX_STREAM_DURATION_MS) {
            send(formatSSE('done', JSON.stringify({ reason: 'timeout' })));
            close();
            return;
          }

          try {
            const page = await agentExecutionEventRepository.findPageByExecutionId(id, currentSeq, 100);

            for (const item of page.items) {
              send(formatSSE('event', formatEventData(item)));
              currentSeq = Math.max(currentSeq, item.seq);
            }

            consecutiveErrors = 0;

            const fresh = await agentExecutionRepository.findById(id);
            if (!fresh || TERMINAL_STATUSES.has(fresh.status)) {
              send(formatSSE('done', JSON.stringify({
                reason: 'completed',
                status: fresh?.status ?? 'unknown',
                lastSeq: currentSeq,
              })));
              close();
              return;
            }

            setTimeout(poll, POLL_INTERVAL_MS);
          } catch (err) {
            consecutiveErrors++;
            console.error('[exec-stream] poll error:', err);

            if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
              send(formatSSE('error', JSON.stringify({ message: 'too_many_errors' })));
              close();
              return;
            }

            setTimeout(poll, POLL_INTERVAL_MS);
          }
        };

        heartbeatHandle = setInterval(() => {
          if (closed) {
            if (heartbeatHandle !== null) clearInterval(heartbeatHandle);
            return;
          }
          try {
            send(formatSSE('heartbeat', JSON.stringify({ lastSeq: currentSeq, ts: Date.now() })));
          } catch {
            if (heartbeatHandle !== null) clearInterval(heartbeatHandle);
          }
        }, HEARTBEAT_INTERVAL_MS);

        request.signal.addEventListener('abort', () => {
          close();
        });

        poll();
      },

      cancel() {
        // Called by the runtime when the consumer cancels the stream
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      },
    });
  } catch (error) {
    const { status, body } = handleError(error);
    return jsonError(body.error.code, body.error.message, status);
  }
}

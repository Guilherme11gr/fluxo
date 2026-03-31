import { NextRequest, NextResponse } from 'next/server';
import { verifyWebhookSignature, parseWebhookEvent, truncatePushPayload, type WebhookEvent } from '@/shared/github/webhook-handler';
import {
  handleInstallation,
  handlePush,
  handlePullRequest,
  handleInstallationRepositories,
} from '@/shared/github/webhook-handlers';
import { gitHubEventRepository } from '@/infra/adapters/prisma';

export async function POST(request: NextRequest) {
  const signature = request.headers.get('x-hub-signature-256');
  const eventType = request.headers.get('x-github-event');
  const eventId = request.headers.get('x-github-delivery');

  if (!signature || !eventType || !eventId) {
    return NextResponse.json({ error: 'Missing required headers' }, { status: 400 });
  }

  const body = await request.text();

  if (!verifyWebhookSignature(body, signature)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  let parsedBody: unknown;
  try {
    parsedBody = JSON.parse(body);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const truncatedPayload = eventType === 'push' ? truncatePushPayload(parsedBody as WebhookEvent) : parsedBody;

  await gitHubEventRepository.recordEvent(eventId, eventType, truncatedPayload);

  const isProcessed = await gitHubEventRepository.isProcessed(eventId);
  if (isProcessed) {
    return NextResponse.json({ ok: true, deduplicated: true });
  }

  let payload: WebhookEvent;
  try {
    payload = parseWebhookEvent(parsedBody);
  } catch {
    return NextResponse.json({ error: 'Invalid payload structure' }, { status: 400 });
  }

  try {
    switch (eventType) {
      case 'installation':
        await handleInstallation(payload);
        break;
      case 'push':
        await handlePush(payload);
        break;
      case 'pull_request':
        await handlePullRequest(payload);
        break;
      case 'installation_repositories':
        await handleInstallationRepositories(payload);
        break;
    }

    await gitHubEventRepository.markProcessed(eventId, eventType, truncatedPayload);
  } catch (error) {
    console.error(`[GitHub Webhook] Error processing ${eventType} (${eventId}):`, error);
    return NextResponse.json({ error: 'Processing failed', eventId }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

import { prisma } from '@/infra/adapters/prisma';
import { parseCommitMessages } from './task-reference-parser';
import type { WebhookEvent } from './webhook-handler';

export async function handleInstallation(event: WebhookEvent): Promise<void> {
  if (!event.installation?.id) return;

  if (event.action === 'deleted') {
    const ghInstall = await prisma.githubInstallation.findFirst({
      where: { installationId: event.installation.id },
    });
    if (ghInstall) {
      await prisma.project.updateMany({
        where: { githubInstallationId: ghInstall.id },
        data: {
          githubInstallationId: null,
          githubRepoFullName: null,
          githubRepoUrl: null,
        },
      });
      await prisma.githubInstallation.delete({
        where: { id: ghInstall.id },
      });
    }
    return;
  }

  if (event.action === 'created' || event.action === 'new_permissions_accepted') {
    const repo = event.repository;
    const ghInstall = await prisma.githubInstallation.findFirst({
      where: { installationId: event.installation.id },
    });
    if (ghInstall && repo) {
      await prisma.project.updateMany({
        where: { githubInstallationId: ghInstall.id },
        data: {
          githubRepoFullName: repo.full_name,
          githubRepoUrl: repo.html_url,
        },
      });
    }
  }
}

export async function handlePush(event: WebhookEvent): Promise<void> {
  if (!event.commits?.length || !event.repository?.full_name) return;

  const project = await prisma.project.findFirst({
    where: { githubRepoFullName: event.repository.full_name },
    select: { id: true, orgId: true, key: true },
    orderBy: { createdAt: 'asc' },
  });
  if (!project) return;

  const references = parseCommitMessages(event.commits);
  if (references.length === 0) return;

  const matchingRefs = references.filter(
    (ref) => ref.projectKey.toUpperCase() === project.key.toUpperCase()
  );
  if (matchingRefs.length === 0) return;

  const localIds = matchingRefs.map((ref) => ref.localId);
  const tasks = await prisma.task.findMany({
    where: {
      projectId: project.id,
      localId: { in: localIds },
      status: { not: 'DONE' },
    },
    select: { id: true },
  });

  if (tasks.length === 0) return;

  await prisma.$transaction(
    tasks.map((task) =>
      prisma.task.update({
        where: { id: task.id },
        data: { status: 'REVIEW' },
      })
    )
  );
}

export async function handlePullRequest(event: WebhookEvent): Promise<void> {
  if (!event.pull_request || !event.repository?.full_name) return;
  if (!event.installation?.id) return;

  const project = await prisma.project.findFirst({
    where: { githubRepoFullName: event.repository.full_name },
    select: { id: true, orgId: true, key: true },
    orderBy: { createdAt: 'asc' },
  });
  if (!project) return;

  const pr = event.pull_request;
  const references = parseCommitMessages([{ message: pr.title + '\n' + (pr.body || '') }]);
  if (references.length === 0) return;

  const matchingRefs = references.filter(
    (ref) => ref.projectKey.toUpperCase() === project.key.toUpperCase()
  );
  if (matchingRefs.length === 0) return;

  const localIds = matchingRefs.map((ref) => ref.localId);
  const tasks = await prisma.task.findMany({
    where: { projectId: project.id, localId: { in: localIds }, status: { not: 'DONE' } },
    select: { id: true },
  });

  if (tasks.length === 0) return;

  const prStatus = pr.merged ? 'merged' : pr.state === 'closed' ? 'closed' : 'open';

  await prisma.$transaction(
    tasks.map((task) =>
      prisma.task.update({
        where: { id: task.id },
        data: {
          githubPrNumber: pr.number,
          githubPrUrl: pr.html_url,
          githubPrStatus: prStatus,
          githubPrMergedAt: pr.merged && pr.merged_at ? new Date(pr.merged_at) : null,
          ...(prStatus === 'merged' ? { status: 'DONE' } : {}),
        },
      })
    )
  );
}

export async function handleInstallationRepositories(event: WebhookEvent): Promise<void> {
  console.log(`[GitHub Webhook] installation_repositories event received: ${event.action}`);
}
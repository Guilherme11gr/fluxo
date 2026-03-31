import { NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { extractAuthenticatedTenant } from '@/shared/http/auth.helpers';
import { jsonSuccess, jsonError } from '@/shared/http/responses';
import { handleError } from '@/shared/errors';
import { prisma } from '@/infra/adapters/prisma';
import { generateAppJwt } from '@/shared/github/app-auth';
import { z } from 'zod';

const linkRepoSchema = z.object({
  installationId: z.number().int().positive(),
  repoFullName: z.string().min(1),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const { tenantId } = await extractAuthenticatedTenant(supabase);

    const project = await prisma.project.findFirst({
      where: { id, orgId: tenantId },
      select: { id: true, githubInstallationId: true },
    });

    if (!project) {
      return jsonError('NOT_FOUND', 'Project not found', 404);
    }

    if (project.githubInstallationId) {
      return jsonError('CONFLICT', 'Project already has a GitHub integration', 409);
    }

    const body = await request.json();
    const parsed = linkRepoSchema.safeParse(body);
    if (!parsed.success) {
      return jsonError('VALIDATION_ERROR', 'Invalid data', 400, {
        errors: parsed.error.flatten().fieldErrors,
      });
    }

    const { installationId, repoFullName } = parsed.data;

    const jwt = generateAppJwt();
    const installationRes = await fetch(
      `https://api.github.com/app/installations/${installationId}`,
      {
        headers: {
          Authorization: `Bearer ${jwt}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
        },
      }
    );

    if (!installationRes.ok) {
      return jsonError('INVALID_INSTALLATION', 'Installation not found', 400);
    }

    await prisma.project.update({
      where: { id },
      data: {
        githubInstallationId: installationId,
        githubRepoFullName: repoFullName,
        githubRepoUrl: `https://github.com/${repoFullName}`,
      },
    });

    return jsonSuccess({ linked: true });
  } catch (error) {
    const { status, body } = handleError(error);
    return jsonError(body.error.code, body.error.message, status);
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const contentType = request.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      return jsonError('INVALID_CONTENT_TYPE', 'Content-Type must be application/json', 415);
    }

    const { id } = await params;
    const supabase = await createClient();
    const { tenantId } = await extractAuthenticatedTenant(supabase);

    const project = await prisma.project.findFirst({
      where: { id, orgId: tenantId },
      select: { id: true, githubInstallationId: true },
    });

    if (!project) {
      return jsonError('NOT_FOUND', 'Project not found', 404);
    }

    await prisma.project.update({
      where: { id },
      data: {
        githubInstallationId: null,
        githubRepoFullName: null,
        githubRepoUrl: null,
      },
    });

    return jsonSuccess({ disconnected: true });
  } catch (error) {
    const { status, body } = handleError(error);
    return jsonError(body.error.code, body.error.message, status);
  }
}

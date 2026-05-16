import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/infra/adapters/prisma';
import { createClient } from '@/lib/supabase/server';
import { extractAuthenticatedTenant } from '@/shared/http/auth.helpers';
import { createHmac, timingSafeEqual } from 'crypto';

const STATE_SECRET = process.env.GITHUB_STATE_SECRET || process.env.NEXTAUTH_SECRET || 'default-state-secret';

interface StatePayload {
  projectId: string;
  orgId: string;
  timestamp: number;
  signature: string;
}

function generateStateSignature(projectId: string, orgId: string, timestamp: number): string {
  const payload = `${projectId}:${orgId}:${timestamp}`;
  return createHmac('sha256', STATE_SECRET).update(payload).digest('hex');
}

function verifyStateSignature(state: StatePayload): boolean {
  const expectedSignature = generateStateSignature(state.projectId, state.orgId, state.timestamp);
  const expectedBuffer = Buffer.from(expectedSignature, 'utf8');
  const actualBuffer = Buffer.from(state.signature, 'utf8');
  if (expectedBuffer.length !== actualBuffer.length) {
    return false;
  }
  return timingSafeEqual(expectedBuffer, actualBuffer);
}

function isValidUuid(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(value);
}

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_DOMAIN || '';

export async function GET(request: NextRequest) {
  const baseUrl = APP_URL || request.url;
  const { searchParams } = new URL(request.url);
  const installationId = searchParams.get('installation_id');
  const setupAction = searchParams.get('setup_action');
  const stateParam = searchParams.get('state');

  if (!installationId) {
    return NextResponse.redirect(
      new URL('/projects?github_error=missing_installation', baseUrl)
    );
  }

  const installationIdNum = parseInt(installationId, 10);
  if (Number.isNaN(installationIdNum)) {
    return NextResponse.redirect(
      new URL('/projects?github_error=invalid_installation_id', baseUrl)
    );
  }

  let state: StatePayload | null = null;
  if (stateParam) {
    try {
      const decoded = JSON.parse(Buffer.from(stateParam, 'base64url').toString('utf-8'));
      if (
        isValidUuid(decoded.projectId) &&
        isValidUuid(decoded.orgId) &&
        typeof decoded.timestamp === 'number' &&
        typeof decoded.signature === 'string'
      ) {
        state = decoded;
      }
    } catch {
      // ignore malformed state
    }
  }

  if (state) {
    if (!verifyStateSignature(state)) {
      return NextResponse.redirect(
        new URL('/projects?github_error=invalid_state_signature', baseUrl)
      );
    }

    const stateAge = Date.now() - state.timestamp;
    if (stateAge > 10 * 60 * 1000) {
      return NextResponse.redirect(
        new URL('/projects?github_error=state_expired', baseUrl)
      );
    }
  }

  if (setupAction === 'uninstall') {
    if (state?.projectId && state?.orgId) {
      await prisma.project.update({
        where: { id: state.projectId },
        data: {
          githubInstallationId: null,
          githubRepoFullName: null,
          githubRepoUrl: null,
        },
      });

      const ghInstall = await prisma.githubInstallation.findFirst({
        where: { installationId: installationIdNum },
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
    }
    return NextResponse.redirect(
      new URL(`/projects/${state?.projectId || ''}?github=uninstalled`, baseUrl)
    );
  }

  if (!state) {
    const ghInstall = await prisma.githubInstallation.findFirst({
      where: { installationId: installationIdNum },
    });
    if (ghInstall) {
      const project = await prisma.project.findFirst({
        where: { githubInstallationId: ghInstall.id },
        select: { id: true },
      });
      if (project) {
        return NextResponse.redirect(
          new URL(`/projects/${project.id}?github=installed`, baseUrl)
        );
      }
    }
    return NextResponse.redirect(
      new URL('/projects?github=installed', baseUrl)
    );
  }

  try {
    const supabase = await createClient();
    const { tenantId } = await extractAuthenticatedTenant(supabase);

    if (tenantId !== state.orgId) {
      return NextResponse.redirect(
        new URL('/projects?github_error=unauthorized_org', baseUrl)
      );
    }
  } catch {
    return NextResponse.redirect(
      new URL('/login?redirect_reason=auth_required', baseUrl)
    );
  }

  const ghInstallation = await prisma.githubInstallation.upsert({
    where: { installationId: installationIdNum },
    update: {},
    create: {
      orgId: state.orgId,
      installationId: installationIdNum,
    },
  });

  await prisma.project.update({
    where: { id: state.projectId },
    data: {
      githubInstallationId: ghInstallation.id,
    },
  });

  return NextResponse.redirect(
    new URL(`/projects/${state.projectId}?github=installed`, baseUrl)
  );
}
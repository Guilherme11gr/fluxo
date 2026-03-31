import { NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { extractAuthenticatedTenant } from '@/shared/http/auth.helpers';
import { jsonSuccess, jsonError } from '@/shared/http/responses';
import { handleError } from '@/shared/errors';
import { prisma } from '@/infra/adapters/prisma';
import { generateAppJwt, getInstallationToken } from '@/shared/github/app-auth';

const GITHUB_APP_ID = process.env.GITHUB_APP_ID || '';

interface GitHubRepo {
  id: number;
  full_name: string;
}

export async function GET(request: NextRequest) {
  try {
    if (!GITHUB_APP_ID) {
      return jsonError('GITHUB_NOT_CONFIGURED', 'GitHub App not configured', 503);
    }

    const supabase = await createClient();
    const { tenantId } = await extractAuthenticatedTenant(supabase);

    const orgId = request.nextUrl.searchParams.get('orgId');
    if (orgId && orgId !== tenantId) {
      return jsonError('FORBIDDEN', 'Unauthorized org', 403);
    }

    const existingProject = await prisma.project.findFirst({
      where: { orgId: tenantId, githubInstallationId: { not: null } },
      select: { githubInstallationId: true },
    });

    if (!existingProject?.githubInstallationId) {
      return jsonSuccess({ hasInstallation: false });
    }

    const installationId = existingProject.githubInstallationId;

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
      if (installationRes.status === 404) {
        return jsonSuccess({ hasInstallation: false });
      }
      throw new Error(`GitHub API error: ${installationRes.status}`);
    }

    const { token } = await getInstallationToken(installationId);

    const reposRes = await fetch(
      'https://api.github.com/installation/repositories?per_page=100',
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
        },
      }
    );

    if (!reposRes.ok) {
      throw new Error(`GitHub API error fetching repos: ${reposRes.status}`);
    }

    const reposData = await reposRes.json();
    const repositories: GitHubRepo[] = reposData.repositories.map(
      (repo: { id: number; full_name: string }) => ({
        id: repo.id,
        full_name: repo.full_name,
      })
    );

    return jsonSuccess(
      { hasInstallation: true, installationId, repositories },
      { private: true }
    );
  } catch (error) {
    const { status, body } = handleError(error);
    return jsonError(body.error.code, body.error.message, status);
  }
}

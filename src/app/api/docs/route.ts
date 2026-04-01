import { NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { extractAuthenticatedTenant } from '@/shared/http/auth.helpers';
import { jsonSuccess, jsonError } from '@/shared/http/responses';
import { handleError } from '@/shared/errors';
import { prisma } from '@/infra/adapters/prisma';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const docsQuerySchema = z.object({
  search: z.string().optional(),
  projectId: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

/**
 * GET /api/docs - List docs across all projects (global search)
 *
 * Used by the agent chat's resolveDocId to avoid 1+N calls.
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { tenantId } = await extractAuthenticatedTenant(supabase);

    const { searchParams } = new URL(request.url);
    const parsed = docsQuerySchema.safeParse(Object.fromEntries(searchParams));
    if (!parsed.success) {
      return jsonError('INVALID_PARAMS', parsed.error.issues.map(i => i.message).join(', '), 400);
    }

    const { search, projectId, limit } = parsed.data;

    const docs = await prisma.projectDoc.findMany({
      where: {
        projectId: {
          in: await getProjectIds(tenantId, projectId),
        },
        ...(search ? {
          title: { contains: search, mode: 'insensitive' },
        } : {}),
      },
      select: {
        id: true,
        title: true,
        projectId: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { updatedAt: 'desc' },
      take: limit,
    });

    return jsonSuccess(docs);

  } catch (error) {
    const { status, body } = handleError(error);
    return jsonError(body.error.code, body.error.message, status);
  }
}

/** Get project IDs for this org, optionally filtered */
async function getProjectIds(orgId: string, projectId?: string): Promise<string[]> {
  if (projectId) {
    // Verify project belongs to org
    const project = await prisma.project.findFirst({
      where: { id: projectId, orgId },
      select: { id: true },
    });
    return project ? [projectId] : [];
  }

  const projects = await prisma.project.findMany({
    where: { orgId },
    select: { id: true },
  });
  return projects.map(p => p.id);
}

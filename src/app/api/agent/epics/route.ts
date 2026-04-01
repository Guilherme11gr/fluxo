/**
 * Agent API - Epics
 * 
 * GET /api/agent/epics - List epics with filters
 * POST /api/agent/epics - Create new epic
 */

import { NextRequest } from 'next/server';
import { z } from 'zod';
import { extractAgentAuth } from '@/shared/http/agent-auth';
import { agentList, agentSuccess, agentError, handleAgentError } from '@/shared/http/agent-responses';
import { epicRepository } from '@/infra/adapters/prisma';

export const dynamic = 'force-dynamic';

const listQuerySchema = z.object({
  projectId: z.string().uuid().optional(),
  status: z.enum(['OPEN', 'IN_PROGRESS', 'DONE']).optional(),
  search: z.string().optional(),
  limit: z.coerce.number().min(1).max(100).default(50),
});

const createEpicSchema = z.object({
  title: z.string().min(1).max(200),
  projectId: z.string().uuid(),
  description: z.string().optional(),
  status: z.enum(['OPEN', 'IN_PROGRESS', 'DONE']).default('OPEN'),
});

export async function GET(request: NextRequest) {
  try {
    const { orgId } = await extractAgentAuth();

    const { searchParams } = new URL(request.url);
    const query = listQuerySchema.safeParse({
      projectId: searchParams.get('projectId') || undefined,
      status: searchParams.get('status') || undefined,
      search: searchParams.get('search') || undefined,
      limit: searchParams.get('limit') || 50,
    });

    if (!query.success) {
      return agentError('VALIDATION_ERROR', 'Invalid query parameters', 400);
    }

    const { projectId, status, search, limit } = query.data;

    let epics;
    if (projectId) {
      epics = await epicRepository.findMany(projectId, orgId);
    } else {
      epics = await epicRepository.findAllByOrg(orgId);
    }

    // Apply status filter if provided
    if (status) {
      epics = epics.filter((e: { status: string }) => e.status === status);
    }

    // Apply search filter if provided
    if (search) {
      const lowerSearch = search.toLowerCase();
      epics = epics.filter((e: any) =>
        e.title?.toLowerCase().includes(lowerSearch) ||
        e.description?.toLowerCase().includes(lowerSearch)
      );
    }

    // Apply limit
    epics = epics.slice(0, limit);

    return agentList(epics, epics.length);
  } catch (error) {
    return handleAgentError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const { orgId } = await extractAgentAuth();

    const body = await request.json();
    const parsed = createEpicSchema.safeParse(body);

    if (!parsed.success) {
      return agentError('VALIDATION_ERROR', parsed.error.issues[0].message, 400);
    }

    const { title, projectId, description, status } = parsed.data;

    const epic = await epicRepository.create({
      orgId,
      projectId,
      title,
      description: description || null,
      status: status === 'DONE' ? 'CLOSED' : 'OPEN',
    });

    return agentSuccess(epic, 201);
  } catch (error) {
    return handleAgentError(error);
  }
}
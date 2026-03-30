/**
 * Agent API - Members List & Search
 *
 * GET /api/agent/members - List all org members
 * GET /api/agent/members?search=Name - Search by name/email
 */

import { NextRequest } from 'next/server';
import { z } from 'zod';
import { extractAgentAuth } from '@/shared/http/agent-auth';
import { agentList, agentError, handleAgentError } from '@/shared/http/agent-responses';
import { prisma } from '@/infra/adapters/prisma';

export const dynamic = 'force-dynamic';

const listQuerySchema = z.object({
  search: z.string().optional(),
  limit: z.coerce.number().min(1).max(100).default(50),
});

export async function GET(request: NextRequest) {
  try {
    const { orgId } = await extractAgentAuth();

    const { searchParams } = new URL(request.url);
    const query = listQuerySchema.safeParse({
      search: searchParams.get('search') || undefined,
      limit: searchParams.get('limit') || 50,
    });

    if (!query.success) {
      return agentError('VALIDATION_ERROR', 'Invalid query parameters', 400);
    }

    const { search, limit } = query.data;

    // Query memberships with user profile data
    const memberships = await prisma.orgMembership.findMany({
      where: { orgId },
      include: {
        user: {
          select: { id: true, email: true },
        },
      },
      orderBy: [{ role: 'asc' }, { createdAt: 'asc' }],
    });

    const userIds = memberships.map((m) => m.userId);

    // Get profiles for display names
    const profiles = await prisma.userProfile.findMany({
      where: { id: { in: userIds } },
      select: { id: true, displayName: true, avatarUrl: true },
    });

    const profileMap = new Map(profiles.map((p) => [p.id, p]));

    const members = memberships.map((m) => {
      const profile = profileMap.get(m.userId);
      return {
        id: m.userId,
        email: m.user.email ?? null,
        displayName: profile?.displayName ?? m.user.email?.split('@')[0] ?? 'Unknown',
        avatarUrl: profile?.avatarUrl ?? null,
        role: m.role,
        createdAt: m.createdAt,
      };
    });

    // Client-side search filter (case-insensitive, partial match)
    const filtered = search
      ? members.filter(
          (m) =>
            m.displayName.toLowerCase().includes(search.toLowerCase()) ||
            (m.email ?? '').toLowerCase().includes(search.toLowerCase())
        )
      : members;

    return agentList(filtered.slice(0, limit), filtered.length);
  } catch (error) {
    return handleAgentError(error);
  }
}

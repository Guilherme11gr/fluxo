import { NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { extractAuthenticatedTenant } from '@/shared/http/auth.helpers';
import { jsonSuccess, jsonError } from '@/shared/http/responses';
import { handleError } from '@/shared/errors';
import { prisma } from '@/infra/adapters/prisma';
import { z } from 'zod';

// Disable Next.js cache - data depends on org cookie
export const dynamic = 'force-dynamic';

const usersQuerySchema = z.object({
    search: z.string().optional(),
    role: z.enum(['OWNER', 'ADMIN', 'MEMBER']).optional(),
    limit: z.coerce.number().int().min(1).max(50).default(50),
});

/**
 * GET /api/users - List all members of the current organization
 * Uses OrgMembership table for accurate multi-org member listing.
 * Query params: search, role, limit
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { tenantId } = await extractAuthenticatedTenant(supabase);

    const { searchParams } = new URL(request.url);
    const parsed = usersQuerySchema.safeParse(Object.fromEntries(searchParams));
    if (!parsed.success) {
      return jsonError('INVALID_PARAMS', parsed.error.issues.map(i => i.message).join(', '), 400);
    }

    const { search, role, limit } = parsed.data;

    // Query memberships for this org, including user profile data
    const memberships = await prisma.orgMembership.findMany({
      where: { orgId: tenantId, ...(role ? { role } : {}) },
      include: {
        user: {
          select: {
            id: true,
            email: true,
          }
        }
      },
      orderBy: [
        { role: 'asc' }, // OWNER first, then ADMIN, then MEMBER
        { createdAt: 'asc' }
      ]
    });

    // Get user profiles for display names/avatars
    const userIds = memberships.map(m => m.userId);
    const profiles = await prisma.userProfile.findMany({
      where: { id: { in: userIds } },
      select: { id: true, displayName: true, avatarUrl: true }
    });
    const profileMap = new Map(profiles.map(p => [p.id, p]));

    // Map to a simpler format for the frontend
    let mappedUsers = memberships.map(m => {
      const profile = profileMap.get(m.userId);
      return {
        id: m.userId,
        displayName: profile?.displayName ?? m.user?.email?.split('@')[0] ?? 'Usuário',
        avatarUrl: profile?.avatarUrl ?? null,
        role: m.role,
      };
    });

    if (search) {
      const lowerSearch = search.toLowerCase();
      mappedUsers = mappedUsers.filter(u =>
        u.displayName?.toLowerCase().includes(lowerSearch) ||
        u.id?.toLowerCase().includes(lowerSearch)
      );
    }

    return jsonSuccess(mappedUsers.slice(0, limit));

  } catch (error) {
    const { status, body } = handleError(error);
    return jsonError(body.error.code, body.error.message, status);
  }
}

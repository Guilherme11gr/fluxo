import type { AuthenticatedTenant } from '@/shared/types';
import type { AppAuthUser } from '@/shared/types/auth.types';
import { UnauthorizedError, ForbiddenError } from '@/shared/errors';
import { cookies, headers } from 'next/headers';
import { prisma } from '@/infra/adapters/prisma';
import { membershipCache } from '@/shared/cache/membership-cache';

// Cookie name for storing current org selection
export const CURRENT_ORG_COOKIE = 'jt-current-org';
// Header name for org selection (takes precedence over cookie)
export const ORG_ID_HEADER = 'x-org-id';

interface AuthClientLike {
  auth: {
    getUser(): Promise<{
      data: { user: AppAuthUser | null };
      error: Error | null;
    }>;
  };
}

/**
 * Extract authenticated user and tenant from the current auth session.
 * Use this in ALL protected API routes.
 * 
 * Performance optimizations:
 * - In-memory cache (5min TTL) to avoid DB query per request
 * - Supports X-Org-Id header (preferred) OR jt-current-org cookie
 * 
 * Determines current org from (in order):
 * 1. Header X-Org-Id (best for APIs/mobile)
 * 2. Cookie jt-current-org
 * 3. Default org (isDefault = true)
 * 4. First org in list
 * 
 * @throws UnauthorizedError if not authenticated
 * @throws ForbiddenError if user has no organization
 */
export async function extractAuthenticatedTenant(
  authClient: AuthClientLike
): Promise<AuthenticatedTenant> {
  // 1. Get current user
  const {
    data: { user },
    error: authError,
  } = await authClient.auth.getUser();

  if (authError || !user) {
    throw new UnauthorizedError('Sessão inválida ou expirada');
  }

  // 2. Try to get memberships from cache first
  let cachedMemberships = membershipCache.get(user.id);

  // 3. If not cached or cache miss, fetch from DB
  if (!cachedMemberships) {
    const memberships = await prisma.$queryRaw<
      Array<{
        orgId: string;
        role: 'OWNER' | 'ADMIN' | 'MEMBER';
        isDefault: boolean;
        orgName: string;
        orgSlug: string;
      }>
    >`
      SELECT 
        om.org_id as "orgId",
        om.role,
        om.is_default as "isDefault",
        o.name as "orgName",
        o.slug as "orgSlug"
      FROM public.org_memberships om
      INNER JOIN public.organizations o ON om.org_id = o.id
      WHERE om.user_id = ${user.id}::uuid
      ORDER BY om.is_default DESC, om.created_at ASC
    `;

    if (memberships.length === 0) {
      throw new ForbiddenError('Usuário não vinculado a uma organização');
    }

    // Transform and cache
    cachedMemberships = memberships.map((m) => ({
      orgId: m.orgId,
      orgName: m.orgName,
      orgSlug: m.orgSlug,
      role: m.role,
      isDefault: m.isDefault,
    }));

    membershipCache.set(user.id, cachedMemberships);
  }

  // 4. Determine current org from header, cookie, or default
  let currentOrgId: string | undefined;

  // Priority 1: Header X-Org-Id (best for APIs)
  try {
    const headerStore = await headers();
    currentOrgId = headerStore.get(ORG_ID_HEADER) || undefined;
  } catch {
    // Headers may not be available
  }

  // Priority 2: Cookie (fallback for browser)
  if (!currentOrgId) {
    try {
      const cookieStore = await cookies();
      currentOrgId = cookieStore.get(CURRENT_ORG_COOKIE)?.value;
    } catch {
      // Cookies may not be available
    }
  }

  // Find the current org - prefer header/cookie, then default, then first
  const currentMembership =
    (currentOrgId && cachedMemberships.find(m => m.orgId === currentOrgId)) ||
    cachedMemberships.find(m => m.isDefault) ||
    cachedMemberships[0];

  return {
    userId: user.id,
    tenantId: currentMembership.orgId,
    memberships: cachedMemberships,
  };
}

/**
 * Check if user has required role in the current org.
 * Uses cache when possible.
 * 
 * @throws ForbiddenError if user doesn't have required role
 */
export async function requireRole(
  authClient: AuthClientLike,
  userId: string,
  allowedRoles: Array<'OWNER' | 'ADMIN' | 'MEMBER'>,
  orgId?: string
): Promise<void> {
  // If orgId provided, check that specific org; otherwise get from context
  let targetOrgId = orgId;

  if (!targetOrgId) {
    const tenant = await extractAuthenticatedTenant(authClient);
    targetOrgId = tenant.tenantId;
  }

  // Try cache first
  const cachedMemberships = membershipCache.get(userId);
  if (cachedMemberships) {
    const membership = cachedMemberships.find(m => m.orgId === targetOrgId);
    if (!membership) {
      throw new ForbiddenError('Você não é membro desta organização');
    }
    if (!allowedRoles.includes(membership.role)) {
      throw new ForbiddenError('Permissão insuficiente para esta ação');
    }
    return;
  }

  // Fallback to DB if not cached
  const membership = await prisma.$queryRaw<
    Array<{ role: 'OWNER' | 'ADMIN' | 'MEMBER' }>
  >`
    SELECT role
    FROM public.org_memberships
    WHERE user_id = ${userId}::uuid AND org_id = ${targetOrgId}::uuid
    LIMIT 1
  `;

  if (!membership || membership.length === 0) {
    throw new ForbiddenError('Você não é membro desta organização');
  }

  if (!allowedRoles.includes(membership[0].role)) {
    throw new ForbiddenError('Permissão insuficiente para esta ação');
  }
}

/**
 * Invalidate membership cache for a user.
 * Call this after role changes, org transfers, etc.
 */
export function invalidateMembershipCache(userId: string): void {
  membershipCache.invalidate(userId);
}

/**
 * Extract user ID from the current auth session.
 * Simpler than extractAuthenticatedTenant when you only need the user ID.
 * 
 * @throws UnauthorizedError if not authenticated
 */
export async function extractUserId(authClient: AuthClientLike): Promise<string> {
  const {
    data: { user },
    error: authError,
  } = await authClient.auth.getUser();

  if (authError || !user) {
    throw new UnauthorizedError('Sessão inválida ou expirada');
  }

  return user.id;
}

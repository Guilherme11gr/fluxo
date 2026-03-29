import { prisma } from '@/infra/adapters/prisma';
import { invalidateMembershipCache } from '@/shared/http/auth.helpers';

/**
 * Max workspaces per user
 */
const MAX_WORKSPACES_PER_USER = 5;

export interface CreateWorkspaceInput {
  userId: string;
  workspaceName: string;
  displayName?: string;
  currentOrgId?: string; // For analytics/tracking where they came from
}

export interface CreateWorkspaceOutput {
  orgId: string;
  orgName: string;
  orgSlug: string;
}

/**
 * Create a new workspace (organization) for a user.
 * User becomes OWNER of the new org.
 * Limits: Max 5 workspaces per user.
 * 
 * @throws Error if user already has 5+ workspaces
 * @throws Error if slug generation fails
 */
export async function createWorkspace(
  input: CreateWorkspaceInput
): Promise<CreateWorkspaceOutput> {
  const { userId, workspaceName, displayName } = input;

  // 1. Check workspace limit
  const existingOwnerships = await prisma.orgMembership.count({
    where: {
      userId,
      role: 'OWNER',
    },
  });

  if (existingOwnerships >= MAX_WORKSPACES_PER_USER) {
    throw new Error(`Você já possui ${MAX_WORKSPACES_PER_USER} workspaces. Limite atingido.`);
  }

  // 2. Generate unique slug
  const baseSlug = workspaceName
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remove accents
    .replace(/[^a-z0-9]+/g, '-') // Replace non-alphanumeric with dash
    .replace(/^-|-$/g, ''); // Remove leading/trailing dashes

  let slug = baseSlug;
  let counter = 1;
  const MAX_ATTEMPTS = 100;

  while (await prisma.organization.findUnique({ where: { slug } })) {
    if (counter > MAX_ATTEMPTS) {
      throw new Error('Não foi possível gerar um identificador único para o workspace. Tente outro nome.');
    }
    slug = `${baseSlug}-${counter}`;
    counter++;
  }

  // 3. Create organization + membership in transaction
  const result = await prisma.$transaction(async (tx) => {
    // Create organization
    const org = await tx.organization.create({
      data: {
        name: workspaceName,
        slug,
      },
    });

    // Check if this is the user's ONLY org (set as default)
    const totalMemberships = await tx.orgMembership.count({
      where: { userId },
    });
    const isFirstOrg = totalMemberships === 0;

    // Create membership (OWNER)
    await tx.orgMembership.create({
      data: {
        userId,
        orgId: org.id,
        role: 'OWNER',
        isDefault: isFirstOrg, // Only if it's the very first org
      },
    });

    // Update user profile if this is first org
    // (Or create if doesn't exist - shouldn't happen but defensive)
    const existingProfile = await tx.userProfile.findUnique({
      where: { id: userId },
    });

    if (!existingProfile) {
      // Create profile (shouldn't happen in normal flow)
      await tx.userProfile.create({
        data: {
          id: userId,
          orgId: org.id,
          displayName: displayName || 'Usuário',
          role: 'OWNER',
        },
      });
    }
    // Note: We DON'T update the profile's orgId here
    // because profile stays on the first org for backward compat

    return {
      orgId: org.id,
      orgName: org.name,
      orgSlug: org.slug,
    };
  });

  // 4. Invalidate membership cache (critical!)
  invalidateMembershipCache(userId);

  return result;
}

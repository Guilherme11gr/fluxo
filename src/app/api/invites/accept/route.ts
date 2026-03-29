import { NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { jsonSuccess, jsonError } from '@/shared/http/responses';
import { handleError, NotFoundError, BadRequestError, UnauthorizedError } from '@/shared/errors';
import { inviteRepository, auditLogRepository, prisma, AUDIT_ACTIONS } from '@/infra/adapters/prisma';
import { invalidateMembershipCache } from '@/shared/http/auth.helpers';
import { z } from 'zod';

const acceptInviteSchema = z.object({
  token: z.string().uuid(),
});

/**
 * POST /api/invites/accept - Accept an invite and join organization
 * Now supports multi-org: users can join multiple organizations
 * Requires: Authenticated user
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();

    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      throw new UnauthorizedError('Você precisa estar logado para aceitar um convite');
    }

    const body = await request.json();
    const parsed = acceptInviteSchema.safeParse(body);

    if (!parsed.success) {
      return jsonError('VALIDATION_ERROR', 'Token inválido', 400);
    }

    const { token } = parsed.data;

    // Find the invite
    const invite = await inviteRepository.findByToken(token);

    if (!invite) {
      throw new NotFoundError('Convite não encontrado');
    }

    // Check if invite is valid
    if (invite.status !== 'PENDING') {
      throw new BadRequestError('Este convite já foi utilizado ou revogado');
    }

    if (invite.expiresAt < new Date()) {
      throw new BadRequestError('Este convite expirou');
    }

    // Check if user is already a member of THIS organization
    const existingMembership = await prisma.orgMembership.findUnique({
      where: {
        userId_orgId: {
          userId: user.id,
          orgId: invite.orgId,
        }
      }
    });

    if (existingMembership) {
      throw new BadRequestError('Você já faz parte desta organização');
    }

    // Check if user has a profile (for display info)
    const existingProfile = await prisma.userProfile.findUnique({
      where: { id: user.id },
    });

    // Check if this is the user's first org (to set as default)
    const membershipCount = await prisma.orgMembership.count({
      where: { userId: user.id }
    });
    const isFirstOrg = membershipCount === 0;

    // Mark invite as accepted
    await inviteRepository.accept(invite.token, user.id);

    // Create org membership
    await prisma.orgMembership.create({
      data: {
        userId: user.id,
        orgId: invite.orgId,
        role: invite.role,
        isDefault: isFirstOrg, // Only set as default if it's the first org
      },
    });

    // Create user profile if doesn't exist (for display name/avatar)
    if (!existingProfile) {
      const displayName = typeof user.user_metadata.display_name === 'string'
        ? user.user_metadata.display_name
        : user.email?.split('@')[0] || 'Usuário';

      await prisma.userProfile.create({
        data: {
          id: user.id,
          orgId: invite.orgId,
          displayName,
          role: invite.role,
        },
      });
    }

    // Invalidate membership cache (critical for new membership)
    invalidateMembershipCache(user.id);

    // Log the action
    await auditLogRepository.log({
      orgId: invite.orgId,
      userId: user.id,
      action: AUDIT_ACTIONS.USER_JOINED,
      targetType: 'user',
      targetId: user.id,
      metadata: {
        via: 'invite',
        inviteId: invite.id,
        role: invite.role,
        isAdditionalOrg: !isFirstOrg,
      },
    });

    return jsonSuccess({
      message: 'Bem-vindo à organização!',
      orgId: invite.orgId,
    });

  } catch (error) {
    const { status, body } = handleError(error);
    return jsonError(body.error.code, body.error.message, status);
  }
}

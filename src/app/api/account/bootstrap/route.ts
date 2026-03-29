import { cookies } from 'next/headers';
import { z } from 'zod';
import { prisma, auditLogRepository, AUDIT_ACTIONS } from '@/infra/adapters/prisma';
import { createWorkspace } from '@/domain/use-cases/workspace/create-workspace';
import { getServerAuthSession } from '@/lib/auth/session';
import { invalidateMembershipCache, CURRENT_ORG_COOKIE } from '@/shared/http/auth.helpers';
import { jsonError, jsonSuccess } from '@/shared/http/responses';
import { UnauthorizedError, handleError } from '@/shared/errors';

const COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

const bootstrapSchema = z.object({
  inviteToken: z.string().uuid().optional(),
  orgName: z.string().min(2).max(80).optional(),
  displayName: z.string().min(1).max(100).optional(),
}).refine((value) => value.inviteToken || value.orgName, {
  message: 'Invite token ou nome da organização é obrigatório',
});

function resolveDisplayName(
  sessionUser: NonNullable<Awaited<ReturnType<typeof getServerAuthSession>>>['user'],
  explicitName?: string
): string {
  const metadataName = typeof sessionUser.user_metadata.display_name === 'string'
    ? sessionUser.user_metadata.display_name
    : null;

  return explicitName || metadataName || sessionUser.name || sessionUser.email?.split('@')[0] || 'Usuário';
}

async function setOrgCookie(orgId: string): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(CURRENT_ORG_COOKIE, orgId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: COOKIE_MAX_AGE,
    path: '/',
  });
}

export async function POST(request: Request) {
  try {
    const authSession = await getServerAuthSession();
    const currentUser = authSession?.user;

    if (!currentUser) {
      throw new UnauthorizedError('Você precisa estar autenticado');
    }

    const body = await request.json();
    const parsed = bootstrapSchema.safeParse(body);

    if (!parsed.success) {
      return jsonError('VALIDATION_ERROR', parsed.error.issues[0]?.message || 'Dados inválidos', 400);
    }

    const displayName = resolveDisplayName(currentUser, parsed.data.displayName);
    const existingMemberships = await prisma.orgMembership.findMany({
      where: { userId: currentUser.id },
      orderBy: [
        { isDefault: 'desc' },
        { createdAt: 'asc' },
      ],
    });

    if (parsed.data.inviteToken) {
      const invite = await prisma.invite.findUnique({
        where: { token: parsed.data.inviteToken },
      });

      if (!invite) {
        return jsonError('NOT_FOUND', 'Convite não encontrado', 404);
      }

      if (invite.status !== 'PENDING') {
        return jsonError('BAD_REQUEST', 'Este convite já foi utilizado ou revogado', 400);
      }

      if (invite.expiresAt < new Date()) {
        return jsonError('BAD_REQUEST', 'Este convite expirou', 400);
      }

      const existingMembership = await prisma.orgMembership.findUnique({
        where: {
          userId_orgId: {
            userId: currentUser.id,
            orgId: invite.orgId,
          },
        },
      });

      if (existingMembership) {
        await setOrgCookie(invite.orgId);

        return jsonSuccess({
          orgId: invite.orgId,
          alreadyMember: true,
        });
      }

      await prisma.$transaction(async (tx) => {
        await tx.invite.update({
          where: { id: invite.id },
          data: {
            status: 'ACCEPTED',
            acceptedBy: currentUser.id,
            acceptedAt: new Date(),
          },
        });

        await tx.orgMembership.create({
          data: {
            userId: currentUser.id,
            orgId: invite.orgId,
            role: invite.role,
            isDefault: existingMemberships.length === 0,
          },
        });

        const existingProfile = await tx.userProfile.findUnique({
          where: { id: currentUser.id },
        });

        if (!existingProfile) {
          await tx.userProfile.create({
            data: {
              id: currentUser.id,
              orgId: invite.orgId,
              displayName,
              role: invite.role,
            },
          });
        } else if (!existingProfile.displayName && displayName) {
          await tx.userProfile.update({
            where: { id: currentUser.id },
            data: {
              displayName,
            },
          });
        }
      });

      invalidateMembershipCache(currentUser.id);
      await setOrgCookie(invite.orgId);

      await auditLogRepository.log({
        orgId: invite.orgId,
        userId: currentUser.id,
        action: AUDIT_ACTIONS.USER_JOINED,
        targetType: 'user',
        targetId: currentUser.id,
        metadata: {
          via: 'invite',
          inviteId: invite.id,
          role: invite.role,
          isAdditionalOrg: existingMemberships.length > 0,
        },
      });

      return jsonSuccess({
        orgId: invite.orgId,
      });
    }

    const existingDefaultMembership = existingMemberships.find((membership) => membership.isDefault) || existingMemberships[0];
    if (existingDefaultMembership) {
      await setOrgCookie(existingDefaultMembership.orgId);

      return jsonSuccess({
        orgId: existingDefaultMembership.orgId,
        alreadyBootstrapped: true,
      });
    }

    const workspace = await createWorkspace({
      userId: currentUser.id,
      workspaceName: parsed.data.orgName!,
      displayName,
    });

    await setOrgCookie(workspace.orgId);

    return jsonSuccess({
      orgId: workspace.orgId,
      workspace,
    });
  } catch (error) {
    const { status, body } = handleError(error);
    return jsonError(body.error.code, body.error.message, status);
  }
}

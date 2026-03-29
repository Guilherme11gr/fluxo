import { prisma } from '@/infra/adapters/prisma';
import { getServerAuthSession } from '@/lib/auth/session';
import { jsonError, jsonSuccess } from '@/shared/http/responses';
import { handleError, UnauthorizedError } from '@/shared/errors';

export async function POST() {
  try {
    const authSession = await getServerAuthSession();
    const currentUser = authSession?.user;

    if (!currentUser) {
      throw new UnauthorizedError('Você precisa estar autenticado');
    }

    await prisma.$executeRaw`
      UPDATE auth.users
      SET force_password_reset = false
      WHERE id = ${currentUser.id}::uuid
    `;

    return jsonSuccess({
      success: true,
    });
  } catch (error) {
    const { status, body } = handleError(error);
    return jsonError(body.error.code, body.error.message, status);
  }
}

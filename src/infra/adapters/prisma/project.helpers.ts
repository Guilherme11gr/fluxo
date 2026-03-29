import { prisma } from './index';

/**
 * getUserProjectIds - Busca IDs dos projetos onde o usuário participa
 *
 * Um usuário "participa" de um projeto se:
 * - É assignee de alguma task do projeto
 * - Criou alguma task do projeto
 *
 * Usado para calcular "zona de influência" na dashboard.
 *
 * ✅ Otimizado: usa groupBy ao invés de distinct para evitar buscar todos os registros
 */
export async function getUserProjectIds(
  orgId: string,
  userId: string
): Promise<string[]> {
  const result = await prisma.task.groupBy({
    by: ['projectId'],
    where: {
      orgId,
      OR: [
        { assigneeId: userId },
        { createdBy: userId },
      ],
    },
  });

  return result.map((r) => r.projectId);
}

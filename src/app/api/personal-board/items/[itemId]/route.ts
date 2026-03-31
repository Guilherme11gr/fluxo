import { NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { extractAuthenticatedTenant } from '@/shared/http/auth.helpers';
import { jsonSuccess, jsonError } from '@/shared/http/responses';
import { handleError, NotFoundError } from '@/shared/errors';
import { personalBoardRepository, prisma } from '@/infra/adapters/prisma';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const updateItemSchema = z.object({
  title: z.string().min(1, 'Título é obrigatório').max(200, 'Título deve ter no máximo 200 caracteres').optional(),
  description: z.string().max(1000, 'Descrição deve ter no máximo 1000 caracteres').optional().nullable(),
  priority: z.enum(['none', 'low', 'medium', 'high', 'urgent']).optional().nullable(),
  dueDate: z.string().datetime({ message: 'Data inválida' }).optional().nullable(),
});

async function getItemWithAuth(itemId: string, orgId: string, userId: string) {
  const item = await prisma.personalBoardItem.findUnique({
    where: { id: itemId },
    include: { column: true },
  });

  if (!item) {
    throw new NotFoundError('Item do quadro pessoal');
  }

  if (item.column.orgId !== orgId || item.column.userId !== userId) {
    throw new NotFoundError('Item do quadro pessoal');
  }

  return item;
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ itemId: string }> }
) {
  try {
    const { itemId } = await params;
    const supabase = await createClient();
    const { tenantId, userId } = await extractAuthenticatedTenant(supabase);

    const body = await request.json();
    if (!body || Object.keys(body).length === 0) {
      return jsonError('VALIDATION_ERROR', 'Nenhum campo fornecido para atualizar', 400);
    }

    const parsed = updateItemSchema.safeParse(body);

    if (!parsed.success) {
      return jsonError('VALIDATION_ERROR', 'Dados inválidos', 400, {
        errors: parsed.error.flatten().fieldErrors,
      } as Record<string, unknown>);
    }

    // Find item to get columnId for authorization
    const item = await getItemWithAuth(itemId, tenantId, userId);

    const updated = await personalBoardRepository.updateItem(
      itemId,
      item.columnId,
      parsed.data
    );

    return jsonSuccess(updated);
  } catch (error) {
    const { status, body } = handleError(error);
    return jsonError(body.error.code, body.error.message, status);
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ itemId: string }> }
) {
  try {
    const { itemId } = await params;
    const supabase = await createClient();
    const { tenantId, userId } = await extractAuthenticatedTenant(supabase);

    // Find item to get columnId for authorization
    const item = await getItemWithAuth(itemId, tenantId, userId);

    await personalBoardRepository.deleteItem(itemId, item.columnId);
    return new Response(null, { status: 204 });
  } catch (error) {
    const { status, body } = handleError(error);
    return jsonError(body.error.code, body.error.message, status);
  }
}

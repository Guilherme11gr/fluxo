import { NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { extractAuthenticatedTenant } from '@/shared/http/auth.helpers';
import { jsonSuccess, jsonError } from '@/shared/http/responses';
import { handleError } from '@/shared/errors';
import { personalBoardRepository } from '@/infra/adapters/prisma';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const updateColumnSchema = z.object({
  title: z.string().min(1, 'Título é obrigatório').max(100, 'Título deve ter no máximo 100 caracteres').optional(),
  color: z.string().optional(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ columnId: string }> }
) {
  try {
    const { columnId } = await params;
    const supabase = await createClient();
    const { tenantId, userId } = await extractAuthenticatedTenant(supabase);

    const body = await request.json();
    if (!body || Object.keys(body).length === 0) {
      return jsonError('VALIDATION_ERROR', 'Nenhum campo fornecido para atualizar', 400);
    }

    const parsed = updateColumnSchema.safeParse(body);

    if (!parsed.success) {
      return jsonError('VALIDATION_ERROR', 'Dados inválidos', 400, {
        errors: parsed.error.flatten().fieldErrors,
      } as Record<string, unknown>);
    }

    const column = await personalBoardRepository.updateColumn(
      columnId,
      tenantId,
      userId,
      parsed.data
    );

    return jsonSuccess(column);
  } catch (error) {
    const { status, body } = handleError(error);
    return jsonError(body.error.code, body.error.message, status);
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ columnId: string }> }
) {
  try {
    const { columnId } = await params;
    const supabase = await createClient();
    const { tenantId, userId } = await extractAuthenticatedTenant(supabase);

    await personalBoardRepository.deleteColumn(columnId, tenantId, userId);
    return new Response(null, { status: 204 });
  } catch (error) {
    const { status, body } = handleError(error);
    return jsonError(body.error.code, body.error.message, status);
  }
}

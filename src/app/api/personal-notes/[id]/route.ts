import { NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { extractAuthenticatedTenant } from '@/shared/http/auth.helpers';
import { jsonSuccess, jsonError } from '@/shared/http/responses';
import { handleError } from '@/shared/errors';
import { personalNoteRepository } from '@/infra/adapters/prisma';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const updateNoteSchema = z.object({
  content: z.string().min(1, 'Conteúdo é obrigatório').max(1000, 'Conteúdo muito longo (máx. 1000 caracteres)').optional(),
  isPinned: z.boolean().optional(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const { tenantId, userId } = await extractAuthenticatedTenant(supabase);

    const { id } = await params;

    const body = await request.json();
    const parsed = updateNoteSchema.safeParse(body);

    if (!parsed.success) {
      return jsonError('VALIDATION_ERROR', 'Dados inválidos', 400, {
        errors: parsed.error.flatten().fieldErrors,
      } as Record<string, unknown>);
    }

    const note = await personalNoteRepository.update(id, tenantId, userId, parsed.data);

    return jsonSuccess({ note });
  } catch (error) {
    const { status, body } = handleError(error);
    return jsonError(body.error.code, body.error.message, status);
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const { tenantId, userId } = await extractAuthenticatedTenant(supabase);

    const { id } = await params;

    await personalNoteRepository.delete(id, tenantId, userId);

    return jsonSuccess({ message: 'Nota removida com sucesso' });
  } catch (error) {
    const { status, body } = handleError(error);
    return jsonError(body.error.code, body.error.message, status);
  }
}

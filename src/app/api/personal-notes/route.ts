import { NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { extractAuthenticatedTenant } from '@/shared/http/auth.helpers';
import { jsonSuccess, jsonError } from '@/shared/http/responses';
import { handleError } from '@/shared/errors';
import { personalNoteRepository } from '@/infra/adapters/prisma';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const createNoteSchema = z.object({
  content: z.string().min(1, 'Conteúdo é obrigatório').max(1000, 'Conteúdo muito longo (máx. 1000 caracteres)'),
  isPinned: z.boolean().optional(),
});

export async function GET() {
  try {
    const supabase = await createClient();
    const { tenantId, userId } = await extractAuthenticatedTenant(supabase);

    const notes = await personalNoteRepository.findAll(tenantId, userId);

    return jsonSuccess({ notes });
  } catch (error) {
    const { status, body } = handleError(error);
    return jsonError(body.error.code, body.error.message, status);
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { tenantId, userId } = await extractAuthenticatedTenant(supabase);

    const body = await request.json();
    const parsed = createNoteSchema.safeParse(body);

    if (!parsed.success) {
      return jsonError('VALIDATION_ERROR', 'Dados inválidos', 400, {
        errors: parsed.error.flatten().fieldErrors,
      } as Record<string, unknown>);
    }

    const { content, isPinned } = parsed.data;

    const note = await personalNoteRepository.create({
      orgId: tenantId,
      userId,
      content,
      isPinned,
    });

    return jsonSuccess({ note }, { status: 201 });
  } catch (error) {
    const { status, body } = handleError(error);
    return jsonError(body.error.code, body.error.message, status);
  }
}

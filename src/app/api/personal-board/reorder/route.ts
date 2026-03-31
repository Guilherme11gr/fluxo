import { NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { extractAuthenticatedTenant } from '@/shared/http/auth.helpers';
import { jsonSuccess, jsonError } from '@/shared/http/responses';
import { handleError } from '@/shared/errors';
import { personalBoardRepository } from '@/infra/adapters/prisma';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const reorderColumnItem = z.object({
  id: z.string().uuid(),
  order: z.number().int().min(0),
});

const reorderItemItem = z.object({
  id: z.string().uuid(),
  columnId: z.string().uuid(),
  order: z.number().int().min(0),
});

const reorderSchema = z.object({
  columns: z.array(reorderColumnItem).optional(),
  items: z.array(reorderItemItem).optional(),
}).refine(
  (data) => data.columns || data.items,
  { message: 'Forneça ao menos columns ou items para reordenar' }
);

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { tenantId, userId } = await extractAuthenticatedTenant(supabase);

    const body = await request.json();
    const parsed = reorderSchema.safeParse(body);

    if (!parsed.success) {
      return jsonError('VALIDATION_ERROR', 'Dados inválidos', 400, {
        errors: parsed.error.flatten().fieldErrors,
      } as Record<string, unknown>);
    }

    const { columns, items } = parsed.data;

    if (columns && columns.length > 0) {
      await personalBoardRepository.reorderColumns(tenantId, userId, { columns });
    }

    if (items && items.length > 0) {
      await personalBoardRepository.reorderItems({ items });
    }

    return jsonSuccess({ success: true });
  } catch (error) {
    const { status, body } = handleError(error);
    return jsonError(body.error.code, body.error.message, status);
  }
}

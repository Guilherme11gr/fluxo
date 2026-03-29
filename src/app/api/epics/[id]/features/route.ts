import { NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { extractAuthenticatedTenant, extractUserId } from '@/shared/http/auth.helpers';
import { jsonSuccess, jsonError } from '@/shared/http/responses';
import { handleError } from '@/shared/errors';
import { epicRepository, featureRepository, userProfileRepository } from '@/infra/adapters/prisma';
import { getEpicById } from '@/domain/use-cases/epics/get-epic-by-id';
import { getFeatures } from '@/domain/use-cases/features/get-features';
import { createFeature } from '@/domain/use-cases/features/create-feature';
import { broadcastFeatureEvent } from '@/lib/supabase/broadcast';
import { z } from 'zod';

const createFeatureSchema = z.object({
  title: z.string().min(3).max(200),
  description: z.string().max(5000).nullable().optional(),
  status: z.enum(['BACKLOG', 'TODO', 'DOING', 'DONE']).default('BACKLOG'),
});

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: epicId } = await params;
    const supabase = await createClient();
    const { tenantId } = await extractAuthenticatedTenant(supabase);

    await getEpicById(epicId, tenantId, { epicRepository });
    const features = await getFeatures(epicId, tenantId, { featureRepository });
    // Private cache (browser only) - org-specific data MUST NOT be cached by CDN
    return jsonSuccess(features, { private: true });

  } catch (error) {
    const { status, body } = handleError(error);
    return jsonError(body.error.code, body.error.message, status);
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: epicId } = await params;
    const supabase = await createClient();
    const { tenantId } = await extractAuthenticatedTenant(supabase);

    const epic = await getEpicById(epicId, tenantId, { epicRepository });

    const body = await request.json();
    const parsed = createFeatureSchema.safeParse(body);
    if (!parsed.success) {
      return jsonError('VALIDATION_ERROR', 'Dados inválidos', 400, {
        errors: parsed.error.flatten().fieldErrors,
      } as Record<string, unknown>);
    }

    const feature = await createFeature({ orgId: tenantId, epicId, ...parsed.data }, { featureRepository });

    // Broadcast event for real-time updates
    const userId = await extractUserId(supabase);
    const userProfile = await userProfileRepository.findByIdGlobal(userId);
    await broadcastFeatureEvent(
      tenantId,
      epic.projectId,
      'created',
      feature.id,
      {
        type: 'user',
        name: userProfile?.displayName || 'Unknown',
        id: userId,
      },
      { epicId }
    );

    return jsonSuccess(feature, { status: 201 });

  } catch (error) {
    const { status, body } = handleError(error);
    return jsonError(body.error.code, body.error.message, status, body.error.details as Record<string, unknown>);
  }
}

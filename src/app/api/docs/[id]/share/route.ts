import { NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { extractAuthenticatedTenant } from '@/shared/http/auth.helpers';
import { jsonSuccess, jsonError } from '@/shared/http/responses';
import { handleError } from '@/shared/errors';
import { projectDocRepository } from '@/infra/adapters/prisma';

/**
 * POST /api/docs/[id]/share
 *
 * Enables public sharing for a doc and generates a share token.
 * Returns the public URL that can be shared with anyone.
 *
 * JKILL-63: Public doc sharing feature
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const { tenantId, userId } = await extractAuthenticatedTenant(supabase);

    // Generate share token and enable public sharing
    const shareToken = await projectDocRepository.generateShareToken(id, tenantId, userId);

    // Build the public share URL
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin;
    const shareUrl = `${baseUrl}/shared/docs/${shareToken}`;

    return jsonSuccess({
      shareUrl,
      shareToken,
    });
  } catch (error) {
    console.error('[Share Doc] Error enabling sharing:', error);
    const { status, body } = handleError(error);
    return jsonError(body.error.code, body.error.message, status);
  }
}

/**
 * DELETE /api/docs/[id]/share
 *
 * Disables public sharing for a doc and invalidates the share token.
 *
 * JKILL-63: Public doc sharing feature
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const { tenantId } = await extractAuthenticatedTenant(supabase);

    // Disable sharing and remove token
    await projectDocRepository.disableSharing(id, tenantId);

    return jsonSuccess({
      message: 'Sharing disabled successfully',
    });
  } catch (error) {
    console.error('[Share Doc] Error disabling sharing:', error);
    const { status, body } = handleError(error);
    return jsonError(body.error.code, body.error.message, status);
  }
}

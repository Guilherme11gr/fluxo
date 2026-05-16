/**
 * Agent API - Feature by ID
 * 
 * GET /api/agent/features/:id - Get feature by ID
 * PATCH /api/agent/features/:id - Update feature
 * DELETE /api/agent/features/:id - Delete feature
 */

import { NextRequest } from 'next/server';
import { z } from 'zod';
import { extractAgentAuth } from '@/shared/http/agent-auth';
import { agentSuccess, agentError, handleAgentError } from '@/shared/http/agent-responses';
import { featureRepository, auditLogRepository } from '@/infra/adapters/prisma';

export const dynamic = 'force-dynamic';

// ============ GET - Get Feature by ID ============

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { orgId } = await extractAgentAuth();
    const { id } = await params;

    if (!z.string().uuid().safeParse(id).success) {
      return agentError('VALIDATION_ERROR', 'Invalid feature ID', 400);
    }

    const feature = await featureRepository.findByIdWithRelations(id, orgId);
    if (!feature) {
      return agentError('NOT_FOUND', 'Feature not found', 404);
    }

    return agentSuccess(feature);
  } catch (error) {
    return handleAgentError(error);
  }
}

// ============ PATCH - Update Feature ============

const updateFeatureSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().optional(),
  status: z.enum(['BACKLOG', 'TODO', 'DOING', 'DONE']).optional(),
  focus: z.enum(['TODAY', 'THIS_WEEK']).nullable().optional(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { orgId, userId, agentName, keyPrefix, authMethod, keyId } = await extractAgentAuth();
    const { id } = await params;

    if (!z.string().uuid().safeParse(id).success) {
      return agentError('VALIDATION_ERROR', 'Invalid feature ID', 400);
    }

    // Verify feature exists
    const existing = await featureRepository.findById(id, orgId);
    if (!existing) {
      return agentError('NOT_FOUND', 'Feature not found', 404);
    }

    const body = await request.json();
    const parsed = updateFeatureSchema.safeParse(body);

    if (!parsed.success) {
      return agentError('VALIDATION_ERROR', parsed.error.issues[0].message, 400);
    }

    // Filter out undefined values
    const updateData = Object.fromEntries(
      Object.entries(parsed.data).filter(([_, v]) => v !== undefined)
    );

    if (Object.keys(updateData).length === 0) {
      return agentError('VALIDATION_ERROR', 'No fields to update', 400);
    }

    const updated = await featureRepository.update(id, orgId, updateData);

    await auditLogRepository.log({
      orgId,
      userId,
      action: 'feature.updated',
      targetType: 'feature',
      targetId: id,
      actorType: 'agent',
      clientId: keyId,
      metadata: {
        source: 'agent',
        agentName,
        keyPrefix,
        authMethod,
        previousTitle: existing.title,
        nextTitle: updated.title,
        previousStatus: existing.status,
        nextStatus: updated.status,
      },
    }).catch(() => {});

    return agentSuccess(updated);
  } catch (error) {
    return handleAgentError(error);
  }
}

// ============ DELETE - Delete Feature ============

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { orgId, userId, agentName, keyPrefix, authMethod, keyId } = await extractAgentAuth();
    const { id } = await params;

    if (!z.string().uuid().safeParse(id).success) {
      return agentError('VALIDATION_ERROR', 'Invalid feature ID', 400);
    }

    // Verify feature exists
    const existing = await featureRepository.findById(id, orgId);
    if (!existing) {
      return agentError('NOT_FOUND', 'Feature not found', 404);
    }

    await featureRepository.delete(id, orgId);

    await auditLogRepository.log({
      orgId,
      userId,
      action: 'feature.deleted',
      targetType: 'feature',
      targetId: id,
      actorType: 'agent',
      clientId: keyId,
      metadata: {
        source: 'agent',
        agentName,
        keyPrefix,
        authMethod,
        title: existing.title,
        status: existing.status,
      },
    }).catch(() => {});

    return agentSuccess({ deleted: true, id });
  } catch (error) {
    return handleAgentError(error);
  }
}

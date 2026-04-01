/**
 * Agent API - Features List & Create
 * 
 * GET /api/agent/features - List features with filters
 * POST /api/agent/features - Create a new feature
 */

import { NextRequest } from 'next/server';
import { z } from 'zod';
import { extractAgentAuth } from '@/shared/http/agent-auth';
import { agentList, agentSuccess, agentError, handleAgentError } from '@/shared/http/agent-responses';
import { featureRepository, epicRepository, auditLogRepository } from '@/infra/adapters/prisma';

export const dynamic = 'force-dynamic';

// ============ GET - List Features ============

const listQuerySchema = z.object({
  epicId: z.string().uuid().optional(),
  projectId: z.string().uuid().optional(),
  status: z.enum(['BACKLOG', 'TODO', 'DOING', 'DONE']).optional(),
  search: z.string().optional(),
  limit: z.coerce.number().min(1).max(100).default(50),
});

export async function GET(request: NextRequest) {
  try {
    const { orgId } = await extractAgentAuth();

    const { searchParams } = new URL(request.url);
    const query = listQuerySchema.safeParse({
      epicId: searchParams.get('epicId') || undefined,
      projectId: searchParams.get('projectId') || undefined,
      status: searchParams.get('status') || undefined,
      search: searchParams.get('search') || undefined,
      limit: searchParams.get('limit') || 50,
    });

    if (!query.success) {
      return agentError('VALIDATION_ERROR', 'Invalid query parameters', 400);
    }

    const { epicId, projectId, status, search, limit } = query.data;

    // Build filter
    let features;
    if (epicId) {
      features = await featureRepository.findManyWithStats(epicId, orgId);
    } else {
      // Find all features for org
      features = await featureRepository.findAll(orgId);
    }

    // Apply status filter if provided
    if (status) {
      features = features.filter(f => f.status === status);
    }

    // Apply search filter if provided
    if (search) {
      const lowerSearch = search.toLowerCase();
      features = features.filter((f: any) =>
        f.title?.toLowerCase().includes(lowerSearch) ||
        f.description?.toLowerCase().includes(lowerSearch)
      );
    }

    // Apply limit
    features = features.slice(0, limit);

    return agentList(features, features.length);
  } catch (error) {
    return handleAgentError(error);
  }
}

// ============ POST - Create Feature ============

const createFeatureSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  epicId: z.string().uuid('Invalid epic ID'),
  description: z.string().optional(),
  status: z.enum(['BACKLOG', 'TODO', 'DOING', 'DONE']).default('BACKLOG'),
});

export async function POST(request: NextRequest) {
  try {
    const { orgId, userId, agentName, keyPrefix, authMethod, keyId } = await extractAgentAuth();

    const body = await request.json();
    const parsed = createFeatureSchema.safeParse(body);

    if (!parsed.success) {
      return agentError('VALIDATION_ERROR', parsed.error.issues[0].message, 400);
    }

    const { title, epicId, description, status } = parsed.data;

    // Verify epic exists
    const epic = await epicRepository.findById(epicId, orgId);
    if (!epic) {
      return agentError('NOT_FOUND', 'Epic not found', 404);
    }

    const feature = await featureRepository.create({
      title,
      epicId,
      description: description || null,
      status,
      orgId,
    });

    await auditLogRepository.log({
      orgId,
      userId,
      action: 'feature.created',
      targetType: 'feature',
      targetId: feature.id,
      actorType: 'agent',
      clientId: keyId,
      metadata: {
        source: 'agent',
        agentName,
        keyPrefix,
        authMethod,
        title: feature.title,
        status: feature.status,
        epicId: feature.epicId,
      },
    }).catch(() => {});

    return agentSuccess(feature, 201);
  } catch (error) {
    return handleAgentError(error);
  }
}

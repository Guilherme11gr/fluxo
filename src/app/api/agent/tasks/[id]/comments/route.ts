/**
 * Agent API - Task Comments
 *
 * GET /api/agent/tasks/:id/comments - List comments for a task
 * POST /api/agent/tasks/:id/comments - Add a comment to a task
 */

import { NextRequest } from 'next/server';
import { z } from 'zod';
import { extractAgentAuth } from '@/shared/http/agent-auth';
import { agentSuccess, agentError, agentList, handleAgentError } from '@/shared/http/agent-responses';
import { taskRepository, commentRepository } from '@/infra/adapters/prisma';

export const dynamic = 'force-dynamic';

// ============ GET - List Comments ============

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { orgId } = await extractAgentAuth();
    const { id: taskId } = await params;

    if (!z.string().uuid().safeParse(taskId).success) {
      return agentError('VALIDATION_ERROR', 'Invalid task ID', 400);
    }

    // Verify task exists and belongs to org
    const task = await taskRepository.findById(taskId, orgId);
    if (!task) {
      return agentError('NOT_FOUND', 'Task not found', 404);
    }

    // List comments ordered by creation date
    const comments = await commentRepository.findByTaskId(taskId, orgId);

    return agentList(comments, comments.length);
  } catch (error) {
    return handleAgentError(error);
  }
}

// ============ POST - Create Comment ============

const createCommentSchema = z.object({
  content: z.string().min(1, 'Content is required'),
  agentId: z.string().uuid().optional(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { orgId, userId } = await extractAgentAuth();
    const { id: taskId } = await params;

    if (!z.string().uuid().safeParse(taskId).success) {
      return agentError('VALIDATION_ERROR', 'Invalid task ID', 400);
    }

    // Verify task exists
    const task = await taskRepository.findById(taskId, orgId);
    if (!task) {
      return agentError('NOT_FOUND', 'Task not found', 404);
    }

    const body = await request.json();
    const parsed = createCommentSchema.safeParse(body);

    if (!parsed.success) {
      return agentError('VALIDATION_ERROR', parsed.error.issues[0].message, 400);
    }

    const { content, agentId } = parsed.data;

    // If agentId provided, validate it belongs to this org
    if (agentId) {
      const { agentRepository } = await import('@/infra/adapters/prisma');
      const agent = await agentRepository.findById(agentId);
      if (!agent || agent.orgId !== orgId) {
        return agentError('NOT_FOUND', 'Agent not found', 404);
      }
    }

    const comment = await commentRepository.create({
      taskId,
      userId,
      agentId,
      content,
      orgId,
    });

    return agentSuccess(comment, 201);
  } catch (error: any) {
    if (error.code === 'P2003') {
      return agentError('VALIDATION_ERROR', 'Referenced user not found', 400);
    }
    return handleAgentError(error);
  }
}

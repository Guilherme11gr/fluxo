/**
 * Agent API Response Helpers
 * 
 * Standardized responses for the Agent API.
 * Simpler than the main API responses for easier parsing.
 */

import { NextResponse } from 'next/server';
import { AgentAuthError } from './agent-auth';
import { DomainError } from '@/shared/errors';

interface AgentSuccessResponse<T> {
  success: true;
  data: T;
}

interface AgentListResponse<T> {
  success: true;
  data: T[];
  meta: {
    total: number;
  };
}

interface AgentErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
  };
}

/**
 * Return success response with data
 */
export function agentSuccess<T>(data: T, status = 200): NextResponse<AgentSuccessResponse<T>> {
  return NextResponse.json({ success: true, data }, { status });
}

/**
 * Return success response with list data
 */
export function agentList<T>(data: T[], total?: number): NextResponse<AgentListResponse<T>> {
  return NextResponse.json({
    success: true,
    data,
    meta: { total: total ?? data.length },
  });
}

/**
 * Return error response
 */
export function agentError(
  code: string,
  message: string,
  status = 400
): NextResponse<AgentErrorResponse> {
  return NextResponse.json(
    {
      success: false,
      error: { code, message },
    },
    { status }
  );
}

/**
 * Handle any error and return appropriate response
 */
export function handleAgentError(error: unknown): NextResponse<AgentErrorResponse> {
  if (error instanceof AgentAuthError) {
    return agentError('AUTH_ERROR', error.message, error.statusCode);
  }

  if (error instanceof DomainError) {
    return agentError(error.code, error.message, error.statusCode);
  }

  if (error instanceof Error) {
    console.error('[Agent API] Error:', error.message);

    // Check for known error types
    if (error.message.includes('not found') || error.message.includes('não encontrad')) {
      return agentError('NOT_FOUND', error.message, 404);
    }

    return agentError('INTERNAL_ERROR', error.message, 500);
  }

  console.error('[Agent API] Unknown error:', error);
  return agentError('INTERNAL_ERROR', 'An unexpected error occurred', 500);
}

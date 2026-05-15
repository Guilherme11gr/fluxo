/**
 * JT-Kill Agent API Client
 * Centralizes all HTTP calls to the Agent API
 */

const DEFAULT_AGENT_API_URL = 'http://localhost:3005/api/agent';
const BASE_URL = process.env.AGENT_API_URL || DEFAULT_AGENT_API_URL;
const API_KEY = process.env.AGENT_API_KEY || '';

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  meta?: { total: number };
  error?: { code: string; message: string };
}

export class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/**
 * Make authenticated request to Agent API
 */
export async function apiRequest<T = unknown>(
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  path: string,
  body?: Record<string, unknown>,
  queryParams?: Record<string, string | number | boolean | undefined>
): Promise<ApiResponse<T>> {
  // Build URL with query params
  let url = `${BASE_URL}${path}`;
  
  if (queryParams) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(queryParams)) {
      if (value !== undefined && value !== null && value !== '') {
        params.append(key, String(value));
      }
    }
    const queryString = params.toString();
    if (queryString) {
      url += `?${queryString}`;
    }
  }

  const headers: Record<string, string> = {
    'Authorization': `Bearer ${API_KEY}`,
    'Content-Type': 'application/json; charset=utf-8',
    'X-Agent-Name': process.env.AGENT_NAME || 'Claude-MCP',
  };

  const options: RequestInit = {
    method,
    headers,
  };

  if (body && method !== 'GET') {
    // Auto-inject _metadata for mutations
    const bodyWithMetadata = {
      ...body,
      _metadata: {
        source: 'mcp',
        agentName: process.env.AGENT_NAME || 'Claude-MCP',
        ...(body._metadata as Record<string, unknown> || {}),
      },
    };
    options.body = JSON.stringify(bodyWithMetadata);
  }

  try {
    const response = await fetch(url, options);
    const data = await response.json() as ApiResponse<T>;

    if (!response.ok || !data.success) {
      throw new ApiError(
        data.error?.code || 'UNKNOWN_ERROR',
        data.error?.message || 'Unknown error occurred',
        response.status
      );
    }

    return data;
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    throw new ApiError('NETWORK_ERROR', `Failed to connect: ${(error as Error).message}`, 0);
  }
}

/**
 * Check if string is a valid UUID
 */
export function isUUID(str: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(str);
}

/**
 * Check if string is a readable ID (e.g., JKILL-123)
 */
export function isReadableId(str: string): boolean {
  const readableIdRegex = /^[A-Z]+-\d+$/;
  return readableIdRegex.test(str);
}

/**
 * Resolve a task identifier (UUID or readable ID) to UUID
 * If it's a readable ID, searches for the task and returns the UUID
 */
export async function resolveTaskId(taskId: string): Promise<string> {
  // Already a UUID
  if (isUUID(taskId)) {
    return taskId;
  }
  
  // Readable ID - need to search
  if (isReadableId(taskId)) {
    const response = await apiRequest<Array<{ id: string; readableId: string }>>('GET', '/tasks', undefined, {
      search: taskId,
      limit: 1,
    });
    
    const tasks = response.data || [];
    const task = tasks.find(t => t.readableId === taskId);
    
    if (!task) {
      throw new ApiError('NOT_FOUND', `Task ${taskId} not found`, 404);
    }
    
    return task.id;
  }
  
  // Invalid format
  throw new ApiError('VALIDATION_ERROR', `Invalid task ID format: ${taskId}. Use UUID or readable ID (e.g., JKILL-123)`, 400);
}

/**
 * Format API response for MCP tool output
 */
export function formatResponse(data: unknown, summary?: string): string {
  const output: string[] = [];
  
  if (summary) {
    output.push(summary);
    output.push('');
  }
  
  output.push('```json');
  output.push(JSON.stringify(data, null, 2));
  output.push('```');
  
  return output.join('\n');
}

/**
 * Format error for MCP tool output
 */
export function formatError(error: ApiError): string {
  return `❌ **Error [${error.code}]**: ${error.message}`;
}

// Standard API response wrapper
export interface ApiResponse<T> {
  data: T;
  meta?: {
    total?: number;
    page?: number;
    pageSize?: number;
  };
}

// Error response
export interface ApiError {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}

// Pagination params
export interface PaginationParams {
  page?: number;
  pageSize?: number;
}

// Sort params
export interface SortParams {
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

// Filter params for tasks
export interface TaskFilterParams extends PaginationParams, SortParams {
  status?: string | string[];
  type?: string;
  priority?: string;
  assigneeId?: string;
  assigneeAgentId?: string;
  module?: string;
  tagId?: string;
  projectId?: string;
  epicId?: string;
  featureId?: string;
  search?: string;
  blocked?: boolean;
  focus?: string;
  skipCount?: boolean;
  cursor?: string;
  excludeStatuses?: string[];
}

// Common list response
export interface ListResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

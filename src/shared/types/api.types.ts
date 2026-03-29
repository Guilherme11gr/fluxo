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
  module?: string;
  tagId?: string; // New: filter by tag
  projectId?: string;
  epicId?: string;
  featureId?: string;
  search?: string;
  blocked?: boolean;
  skipCount?: boolean; // Performance: skip count query when not needed
}

// Common list response
export interface ListResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

/**
 * AI-related shared types
 * Used across components and API routes
 */

export type AIRole = 'system' | 'user' | 'assistant';

export interface AIMessage {
    role: AIRole;
    content: string;
}

export interface AICompletionUsage {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
}

/**
 * Standard AI response for API routes
 */
export interface AIResponse {
    content: string;
    usage?: AICompletionUsage;
}

/**
 * AI Chat request for API routes
 */
export interface AIChatRequest {
    messages: AIMessage[];
    systemPrompt?: string;
    temperature?: number;
    maxTokens?: number;
}

/**
 * Improve description request
 */
export interface ImproveDescriptionRequest {
    taskId: string;
}

/**
 * Improve description response
 */
export interface ImproveDescriptionResponse {
    description: string;
    taskId: string;
}

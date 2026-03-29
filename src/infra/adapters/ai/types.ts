/**
 * AI Adapter Types
 * Types specific to the AI adapter implementation
 */

export type AIRole = 'system' | 'user' | 'assistant';

export interface AIMessage {
    role: AIRole;
    content: string;
}

export interface ChatCompletionInput {
    messages: AIMessage[];
    model?: string;
    temperature?: number;
    maxTokens?: number;
}

export interface ChatCompletionResult {
    content: string;
    role: AIRole;
    finishReason: string | null;
    usage?: {
        promptTokens: number;
        completionTokens: number;
        totalTokens: number;
    };
}

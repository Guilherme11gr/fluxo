import OpenAI from 'openai';
import { AIAdapter } from './ai.adapter';

/**
 * Singleton OpenAI Client configured for DeepSeek
 * https://api-docs.deepseek.com/
 * 
 * Uses the OpenAI SDK but points to DeepSeek's API endpoint.
 * Configure DEEPSEEK_API_KEY in your environment variables.
 */
const globalForAI = globalThis as unknown as {
    openaiClient: OpenAI | undefined;
};

export const openaiClient = globalForAI.openaiClient ?? new OpenAI({
    apiKey: process.env.DEEPSEEK_API_KEY ?? '',
    baseURL: 'https://api.deepseek.com',
});

if (process.env.NODE_ENV !== 'production') {
    globalForAI.openaiClient = openaiClient;
}

// Adapter instance (singleton)
export const aiAdapter = new AIAdapter(openaiClient);

// Re-export for convenience
export { AIAdapter } from './ai.adapter';
export type {
    AIRole,
    AIMessage,
    ChatCompletionInput,
    ChatCompletionResult,
} from './types';

import type { AIMessage, ChatCompletionResult } from '@/infra/adapters/ai';
import type { AIAdapter } from '@/infra/adapters/ai';

export interface ChatCompletionInput {
    messages: AIMessage[];
    systemPrompt?: string;
    temperature?: number;
    maxTokens?: number;
}

export interface ChatCompletionDeps {
    aiAdapter: AIAdapter;
}

/**
 * Chat Completion Use Case
 * 
 * Base use-case for AI chat completions using DeepSeek.
 * Other AI features should build upon this.
 * 
 * @example
 * ```typescript
 * const result = await chatCompletion(
 *   {
 *     messages: [{ role: 'user', content: 'Hello!' }],
 *     systemPrompt: 'You are a helpful assistant.',
 *   },
 *   { aiAdapter }
 * );
 * ```
 */
export async function chatCompletion(
    input: ChatCompletionInput,
    deps: ChatCompletionDeps
): Promise<ChatCompletionResult> {
    const { aiAdapter } = deps;

    const messages: AIMessage[] = [];

    // Add system prompt if provided
    if (input.systemPrompt) {
        messages.push({
            role: 'system',
            content: input.systemPrompt,
        });
    }

    // Add user messages
    messages.push(...input.messages);

    return await aiAdapter.chatCompletion({
        messages,
        temperature: input.temperature,
        maxTokens: input.maxTokens,
    });
}

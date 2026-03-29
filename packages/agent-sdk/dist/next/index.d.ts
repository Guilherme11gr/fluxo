import { NextRequest } from 'next/server';

/**
 * defineTool - Define uma tool com Zod schema ou JSON Schema
 *
 * Abstrai a conversão de Zod para JSON Schema automaticamente.
 */
interface ZodSchemaLike<TOutput = any> {
    description?: string;
    parse: (input: unknown) => TOutput;
    safeParse: (input: unknown) => {
        success: true;
        data: TOutput;
    } | {
        success: false;
        error: {
            issues: Array<{
                path: PropertyKey[];
                message: string;
            }>;
        };
    };
    _def?: unknown;
    _output?: TOutput;
}
interface JSONSchema {
    type: 'object';
    properties?: Record<string, any>;
    required?: string[];
    [key: string]: any;
}
interface RuntimeTool<TInput = any, TOutput = any> {
    name: string;
    description: string;
    parameters: JSONSchema;
    /** Schema Zod original para validação em runtime */
    zodSchema?: ZodSchemaLike<TInput>;
    execute: (args: TInput) => Promise<TOutput> | TOutput;
    awaitConfirm?: boolean;
    confirmMessage?: (args: TInput) => string;
    /** Tools que esta tool depende (outputs necessários) */
    dependencies?: string[];
    /** Se true, pode rodar em paralelo com outras (default: true se sem dependências) */
    parallelizable?: boolean;
}

/**
 * AgentRuntime - Motor de execução de agents
 *
 * Gerencia streaming, tool calling loop, retry, e histórico.
 * Baseado no código de produção do Work Log Koike.
 */

interface ChatMessage {
    role: 'system' | 'user' | 'assistant' | 'tool';
    content: string | null;
    tool_calls?: ToolCall[];
    tool_call_id?: string;
}
interface ToolCall {
    id: string;
    type: 'function';
    function: {
        name: string;
        arguments: string;
    };
}
interface ProviderConfig {
    baseUrl: string;
    apiKey: string;
    model: string;
    /** Headers customizados */
    headers?: Record<string, string>;
}
interface ContextWindowConfig {
    /** Maximum tokens for context window (e.g., 4000, 8000, 128000) */
    maxTokens: number;
    /** Always preserve last N messages */
    preserveLastN?: number;
    /** Summarize old messages when truncating (requires extra LLM call) */
    summarizeOld?: boolean;
}
/**
 * Structured output configuration with Zod validation
 *
 * @example
 * ```ts
 * // Com Zod (recomendado - type inference)
 * responseSchema: {
 *   zod: z.object({
 *     name: z.string(),
 *     age: z.number()
 *   })
 * }
 *
 * // Com JSON Schema (para providers que suportam)
 * responseSchema: {
 *   type: 'json_schema',
 *   schema: { type: 'object', properties: { ... } }
 * }
 *
 * // JSON genérico
 * responseSchema: {
 *   type: 'json_object'
 * }
 * ```
 */
interface ResponseSchemaConfig<T = any> {
    /** Zod schema para validação e type inference */
    zod?: ZodSchemaLike<T>;
    /** JSON Schema para providers que suportam */
    schema?: JSONSchema;
    /** Tipo de resposta: 'json_object' (genérico) ou 'json_schema' (com schema) */
    type?: 'json_object' | 'json_schema';
}
/**
 * Prompt enhancement configuration
 */
interface PromptEnhancerConfig {
    /** Auto-inject date/time context (default: true) */
    injectDateTimeContext?: boolean;
    /** Timezone for date formatting (default: 'America/Sao_Paulo') */
    timezone?: string;
    /** Locale for date formatting (default: 'pt-BR') */
    locale?: string;
    /** Custom base prompt that gets prepended to user prompt */
    basePrompt?: string;
    /** Custom prompt enhancer function - receives user prompt, returns enhanced prompt */
    customEnhancer?: (userPrompt: string, context: DateTimeContext) => string;
}
/**
 * Date/time context injected into prompts
 */
interface DateTimeContext {
    /** Full date string (e.g., "sexta-feira, 28 de fevereiro de 2025") */
    fullDate: string;
    /** ISO date (e.g., "2025-02-28") */
    isoDate: string;
    /** Yesterday ISO date */
    yesterday: string;
    /** Tomorrow ISO date */
    tomorrow: string;
    /** Current month (e.g., "2025-02") */
    currentMonth: string;
    /** Current time (e.g., "14:30") */
    currentTime: string;
    /** Day of week (e.g., "sexta-feira") */
    dayOfWeek: string;
}

/**
 * HistoryStore - Interface para armazenamento de histórico
 *
 * Implementações: memory, Redis, PostgreSQL
 */

interface HistoryStore {
    get(sessionId: string): Promise<ChatMessage[]>;
    set(sessionId: string, messages: ChatMessage[]): Promise<void>;
    clear(sessionId: string): Promise<void>;
}
/**
 * Memory-based history store (default)
 *
 * Em produção, usar Redis ou database.
 */
declare function memoryStore(): HistoryStore;
/**
 * Redis-like client interface (works with @upstash/redis and ioredis)
 */
interface RedisLike {
    get(key: string): Promise<string | null | undefined>;
    set(key: string, value: string, options?: {
        ex?: number;
    }): Promise<unknown>;
    del(key: string): Promise<unknown>;
}
/**
 * Redis-based history store
 *
 * Works with @upstash/redis, ioredis, or any Redis client that implements RedisLike.
 *
 * @example
 * ```ts
 * import { Redis } from '@upstash/redis';
 * import { redisStore } from '@guilherme/agent-sdk';
 *
 * const redis = new Redis({
 *   url: process.env.UPSTASH_REDIS_REST_URL!,
 *   token: process.env.UPSTASH_REDIS_REST_TOKEN!,
 * });
 *
 * export const POST = createAgentRoute({
 *   historyStore: redisStore(redis),
 *   // ...
 * });
 * ```
 */
declare function redisStore(redis: RedisLike, options?: {
    /** Key prefix (default: 'agent:history:') */
    prefix?: string;
    /** TTL in seconds (default: 7 days) */
    ttl?: number;
}): HistoryStore;

/**
 * createAgentRoute - Cria um route handler Next.js pronto para usar
 *
 * Abstrai toda a lógica de SSE, histórico, confirmações e tool calling.
 */

type MaybePromise<T> = T | Promise<T>;
interface AgentRouteContext {
    req: NextRequest;
    body: Record<string, any>;
}
type RouteResolver<T> = (context: AgentRouteContext) => MaybePromise<T>;
type ResolvableRouteValue<T> = T | RouteResolver<T>;
interface AgentRouteConfig<T = any> {
    /** Provider config */
    provider: ResolvableRouteValue<ProviderConfig>;
    /** System prompt */
    systemPrompt: ResolvableRouteValue<string>;
    /** Tools disponíveis */
    tools: ResolvableRouteValue<RuntimeTool[]>;
    /** History store (default: memory) */
    historyStore?: ResolvableRouteValue<HistoryStore>;
    /** Tamanho do histórico (default: 20) */
    historySize?: number;
    /** Temperatura (default: 0.5) */
    temperature?: number;
    /** Máximo de iterações (default: 10) */
    maxIterations?: number;
    /** Timeout por tool execution em ms (default: 30000) */
    toolExecutionTimeout?: number;
    /** Máximo de retries por iteração quando tool falha com erro retryable (default: 2) */
    maxRetriesPerIteration?: number;
    /** Context window management (token-based truncation) */
    contextWindow?: ContextWindowConfig;
    /** Reasoning configuration */
    reasoning?: {
        enabled: boolean;
        format: 'react' | 'cot' | 'auto';
        includeInHistory?: boolean;
    };
    /** Structured output configuration with Zod validation */
    responseSchema?: ResponseSchemaConfig<T>;
    /** Prompt enhancement configuration (auto-injects date/time context by default) */
    promptEnhancer?: PromptEnhancerConfig;
}
/**
 * Cria um POST handler para Next.js App Router
 *
 * @example
 * ```ts
 * // app/api/chat/route.ts
 * import { createAgentRoute, defineTool } from '@koiketec/agent-sdk';
 * import { openaiProvider } from '@koiketec/agent-sdk/providers';
 * import { z } from 'zod';
 *
 * const tools = [
 *   defineTool({
 *     name: 'create_product',
 *     description: 'Cria um produto',
 *     parameters: z.object({
 *       name: z.string().describe('Nome do produto'),
 *       price: z.number().describe('Preço'),
 *     }),
 *     execute: async (args) => {
 *       return await db.product.create({ data: args });
 *     },
 *   }),
 * ];
 *
 * export const POST = createAgentRoute({
 *   provider: openaiProvider({
 *     baseUrl: 'https://api.z.ai/api/paas/v4',
 *     apiKey: process.env.AI_API_KEY!,
 *     model: 'glm-4.7-flash',
 *   }),
 *   systemPrompt: 'Você é um assistente...',
 *   tools,
 * });
 * ```
 */
declare function createAgentRoute(config: AgentRouteConfig): (req: NextRequest) => Promise<Response>;
/**
 * Provider helper para OpenAI-compatible APIs (Z.ai, Groq, Together, etc.)
 */
declare function openaiProvider(config: ProviderConfig): ProviderConfig;

export { type AgentRouteConfig, type AgentRouteContext, type HistoryStore, createAgentRoute, memoryStore, openaiProvider, redisStore };

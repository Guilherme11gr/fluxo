import { Client } from '@modelcontextprotocol/sdk/client/index.js';

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
type InferSchemaOutput<TSchema extends ZodSchemaLike<any>> = TSchema extends {
    _output?: infer TOutput;
} ? TOutput : TSchema extends {
    parse: (input: unknown) => infer TOutput;
} ? TOutput : never;
interface ToolDefinitionBase<TInput, TOutput> {
    name: string;
    description: string;
    execute: (args: TInput) => Promise<TOutput> | TOutput;
    /** Se true, exige confirmação do usuário antes de executar */
    awaitConfirm?: boolean;
    /** Mensagem de confirmação customizada (args → string) */
    confirmMessage?: (args: TInput) => string;
    /** Tools que esta tool depende (outputs necessários) */
    dependencies?: string[];
    /** Se true, pode rodar em paralelo com outras (default: true se sem dependências) */
    parallelizable?: boolean;
}
interface JsonSchemaToolDefinition<TInput = any, TOutput = any> extends ToolDefinitionBase<TInput, TOutput> {
    parameters: JSONSchema;
}
interface ZodToolDefinition<TSchema extends ZodSchemaLike<any>, TOutput = any> extends ToolDefinitionBase<InferSchemaOutput<TSchema>, TOutput> {
    parameters: TSchema;
}
type ToolDefinition<TInput = any, TOutput = any> = JsonSchemaToolDefinition<TInput, TOutput> | ZodToolDefinition<ZodSchemaLike<TInput>, TOutput>;
interface JSONSchema {
    type: 'object';
    properties?: Record<string, any>;
    required?: string[];
    [key: string]: any;
}
/**
 * Converte Zod schema para JSON Schema (OpenAI-compatible)
 *
 * Simplificado - suporta tipos básicos. Para casos complexos, passe JSON Schema direto.
 */
declare function zodToJsonSchema(zodType: ZodSchemaLike<any>): JSONSchema;
/**
 * Define uma tool com tipagem automática via Zod
 *
 * @example
 * ```ts
 * const myTool = defineTool({
 *   name: 'create_product',
 *   description: 'Cria um produto',
 *   parameters: z.object({
 *     name: z.string().describe('Nome do produto'),
 *     price: z.number().describe('Preço em reais'),
 *   }),
 *   execute: async (args) => {
 *     // args é tipado: { name: string; price: number }
 *     return await db.product.create({ data: args });
 *   },
 * });
 * ```
 */
declare function defineTool<TSchema extends ZodSchemaLike<any>, TOutput>(definition: ZodToolDefinition<TSchema, TOutput>): RuntimeTool<InferSchemaOutput<TSchema>, TOutput>;
declare function defineTool<TInput, TOutput>(definition: JsonSchemaToolDefinition<TInput, TOutput>): RuntimeTool<TInput, TOutput>;
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
 * Converte RuntimeTool[] para o formato OpenAI-compatible
 */
declare function toolsToOpenAIFormat(tools: RuntimeTool[]): any[];

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
interface AgentConfig<T = any> {
    provider: ProviderConfig;
    systemPrompt: string;
    tools: RuntimeTool[];
    /** Tamanho máximo do histórico (padrão: 20) - ignorado se contextWindow definido */
    historySize?: number;
    /** Temperatura (padrão: 0.5) */
    temperature?: number;
    /** Máximo de iterações de tool calling (padrão: 6) */
    maxIterations?: number;
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
    /** Prompt enhancement configuration */
    promptEnhancer?: PromptEnhancerConfig;
}
interface RuntimeCallbacks {
    onToken?: (token: string) => void;
    onStatus?: (status: string) => void;
    onToolCall?: (toolCall: ToolCall) => void;
    onConfirm?: (message: string, confirmId: string) => Promise<boolean>;
    onError?: (error: Error) => void;
}
/**
 * Runtime de agent com streaming e tool calling
 *
 * @example
 * ```ts
 * const runtime = new AgentRuntime({
 *   provider: {
 *     baseUrl: 'https://api.z.ai/api/paas/v4',
 *     apiKey: process.env.AI_API_KEY,
 *     model: 'glm-4.7-flash',
 *   },
 *   systemPrompt: 'Você é um assistente...',
 *   tools: [myTool],
 * });
 *
 * const result = await runtime.run(
 *   [{ role: 'user', content: 'Cria um produto' }],
 *   { onToken: (t) => console.log(t) }
 * );
 * ```
 */
declare class AgentRuntime {
    private config;
    private enhancedSystemPrompt;
    constructor(config: AgentConfig);
    /**
     * Builds the enhanced system prompt with date/time context
     */
    private buildEnhancedSystemPrompt;
    /**
     * Gets current date/time context
     */
    private getDateTimeContext;
    /**
     * Converts date to ISO format (YYYY-MM-DD) in specified timezone
     */
    private toISODate;
    /**
     * Formats date/time context for injection into prompt
     */
    private formatDateTimeContext;
    /**
     * Executa uma conversa com streaming e tool calling
     *
     * @returns content: texto final, toolCalls: todas as tools chamadas, history: histórico completo incluindo tool results
     */
    run(messages: ChatMessage[], callbacks?: RuntimeCallbacks): Promise<{
        content: string;
        toolCalls: ToolCall[];
        history: ChatMessage[];
        data?: any;
    }>;
    /**
     * Faz chamada streaming ao LLM
     */
    private callLLMStream;
    /**
     * Executa uma tool call
     */
    private executeToolCall;
    /**
     * Analisa dependências entre tools e retorna grupos paralelos vs sequenciais
     */
    private analyzeToolDependencies;
    /**
     * Texto de status amigável por tool
     */
    private getToolStatusText;
    /**
     * Fetch com retry automático (socket errors e rate limit)
     */
    private fetchWithRetry;
    /**
     * Summarize old messages using LLM
     */
    private summarizeOldMessages;
    /**
     * Parse and validate structured output from LLM response
     */
    private parseStructuredOutput;
    /**
     * Generate reasoning/thought before executing tools
     */
    private generateThought;
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
 * PostgreSQL pool interface (works with pg)
 */
interface PostgresPool {
    query<T = any>(sql: string, params?: any[]): Promise<{
        rows: T[];
    }>;
}
/**
 * PostgreSQL-based history store
 *
 * Requires a `agent_sessions` table:
 * ```sql
 * CREATE TABLE agent_sessions (
 *   id TEXT PRIMARY KEY,
 *   messages JSONB NOT NULL DEFAULT '[]',
 *   created_at TIMESTAMPTZ DEFAULT NOW(),
 *   updated_at TIMESTAMPTZ DEFAULT NOW()
 * );
 * ```
 *
 * @example
 * ```ts
 * import { Pool } from 'pg';
 * import { postgresStore } from '@guilherme/agent-sdk';
 *
 * const pool = new Pool({ connectionString: process.env.DATABASE_URL });
 *
 * export const POST = createAgentRoute({
 *   historyStore: postgresStore(pool),
 *   // ...
 * });
 * ```
 */
declare function postgresStore(pool: PostgresPool): HistoryStore;
/**
 * SQLite database interface (works with better-sqlite3, bun:sqlite)
 */
interface SQLiteDatabase {
    prepare(sql: string): {
        get<T = any>(params: any[]): T | undefined;
        run(params: any[]): {
            changes: number;
        };
    };
}
/**
 * SQLite-based history store
 *
 * Requires a `agent_sessions` table:
 * ```sql
 * CREATE TABLE IF NOT EXISTS agent_sessions (
 *   id TEXT PRIMARY KEY,
 *   messages TEXT NOT NULL DEFAULT '[]',
 *   updated_at TEXT DEFAULT CURRENT_TIMESTAMP
 * );
 * ```
 *
 * @example
 * ```ts
 * import Database from 'better-sqlite3';
 * import { sqliteStore } from '@guilherme/agent-sdk';
 *
 * const db = new Database('sessions.db');
 * db.exec(`CREATE TABLE IF NOT EXISTS agent_sessions ...`);
 *
 * export const POST = createAgentRoute({
 *   historyStore: sqliteStore(db),
 *   // ...
 * });
 * ```
 */
declare function sqliteStore(db: SQLiteDatabase): HistoryStore;
/**
 * File-based history store (for development/simple deployments)
 *
 * Stores each session as a JSON file in a directory.
 *
 * @example
 * ```ts
 * import { fileStore } from '@guilherme/agent-sdk';
 *
 * export const POST = createAgentRoute({
 *   historyStore: fileStore('./data/sessions'),
 *   // ...
 * });
 * ```
 */
declare function fileStore(dir: string, options?: {
    /** File extension (default: '.json') */
    extension?: string;
}): HistoryStore;

/**
 * MCP Integration - Conecta a MCP servers e usa suas tools
 *
 * @example
 * ```ts
 * import { createMcpTools } from '@guilherme/agent-sdk/mcp';
 *
 * const fsTools = await createMcpTools({
 *   command: 'npx',
 *   args: ['-y', '@modelcontextprotocol/server-filesystem', './data'],
 * });
 * ```
 */

interface McpServerConfig {
    /** Comando para iniciar o MCP server (ex: 'npx', 'node') */
    command: string;
    /** Argumentos para o comando */
    args: string[];
    /** Prefixo para os nomes das tools (ex: 'fs_' → fs_read_file) */
    prefix?: string;
    /** Environment variables para o processo */
    env?: Record<string, string>;
}
interface McpToolsResult {
    /** Tools no formato da SDK */
    tools: RuntimeTool[];
    /** Client MCP conectado */
    client: Client;
    /** Fecha a conexão com o MCP server */
    close: () => Promise<void>;
}
/**
 * Conecta a um MCP server e retorna tools no formato da SDK
 *
 * @example
 * ```ts
 * // Filesystem server
 * const { tools, close } = await createMcpTools({
 *   command: 'npx',
 *   args: ['-y', '@modelcontextprotocol/server-filesystem', './data'],
 *   prefix: 'fs_',
 * });
 *
 * // GitHub server
 * const { tools: githubTools } = await createMcpTools({
 *   command: 'npx',
 *   args: ['-y', '@modelcontextprotocol/server-github'],
 *   env: { GITHUB_TOKEN: process.env.GITHUB_TOKEN },
 * });
 *
 * // Usa as tools
 * const agent = createAgentRoute({
 *   tools: [...tools, ...githubTools],
 *   // ...
 * });
 *
 * // Quando terminar
 * await close();
 * ```
 */
declare function createMcpTools(config: McpServerConfig): Promise<McpToolsResult>;
/**
 * Conecta a múltiplos MCP servers de uma vez
 *
 * @example
 * ```ts
 * const { tools, closeAll } = await createMcpToolsFromServers([
 *   {
 *     command: 'npx',
 *     args: ['-y', '@modelcontextprotocol/server-filesystem', './data'],
 *     prefix: 'fs_',
 *   },
 *   {
 *     command: 'npx',
 *     args: ['-y', '@modelcontextprotocol/server-postgres'],
 *     env: { DATABASE_URL: process.env.DATABASE_URL },
 *     prefix: 'db_',
 *   },
 * ]);
 * ```
 */
declare function createMcpToolsFromServers(servers: McpServerConfig[]): Promise<{
    tools: RuntimeTool[];
    closeAll: () => Promise<void>;
}>;

/**
 * Token management utilities
 *
 * Provides token estimation and history truncation for context window management.
 */

/**
 * Estimate tokens in text (4 chars ≈ 1 token)
 * For precision, use tiktoken (but it's heavy)
 */
declare function estimateTokens(text: string): number;
/**
 * Estimate total tokens in messages array
 */
declare function estimateMessagesTokens(messages: ChatMessage[]): number;
/**
 * Options for history truncation
 */
interface TruncateOptions {
    /** Always preserve system messages */
    preserveSystem?: boolean;
    /** Always preserve last N messages */
    preserveLastN?: number;
}
/**
 * Truncate history while preserving important messages
 *
 * Uses a sliding window approach that keeps recent messages and
 * fills remaining budget with older messages from most recent to oldest.
 */
declare function truncateHistory(messages: ChatMessage[], maxTokens: number, options?: TruncateOptions): ChatMessage[];
/**
 * Summarize old history messages (requires LLM call)
 *
 * This is a placeholder that returns a simple summary.
 * For better results, integrate with the actual LLM.
 */
declare function summarizeHistory(messages: ChatMessage[], llmCall: (prompt: string) => Promise<string>): Promise<string>;
/**
 * Create a summary message to prepend to truncated history
 */
declare function createSummaryMessage(summary: string): ChatMessage;

/**
 * @guilherme/agent-sdk/errors
 *
 * Custom error types for the SDK.
 */
/**
 * Base error class for all SDK errors
 */
declare class AgentSDKError extends Error {
    readonly type: string;
    readonly cause?: Error | undefined;
    constructor(type: string, message: string, cause?: Error | undefined);
}
/**
 * API returned an error response
 */
declare class APIError extends AgentSDKError {
    readonly statusCode: number;
    readonly responseBody?: string | undefined;
    constructor(statusCode: number, message: string, responseBody?: string | undefined);
    get isRateLimited(): boolean;
    get isBadRequest(): boolean;
    get isServerError(): boolean;
}
/**
 * Tool execution failed
 */
declare class ToolExecutionError extends AgentSDKError {
    readonly toolName: string;
    readonly args?: any | undefined;
    constructor(toolName: string, message: string, args?: any | undefined, cause?: Error);
}
/**
 * Validation failed (Zod or schema)
 */
declare class ValidationError extends AgentSDKError {
    readonly issues: Array<{
        path: string;
        message: string;
    }>;
    constructor(message: string, issues: Array<{
        path: string;
        message: string;
    }>);
}
/**
 * Stream was aborted or interrupted
 */
declare class StreamAbortError extends AgentSDKError {
    constructor(message?: string);
}
/**
 * Max iterations reached without final response
 */
declare class MaxIterationsError extends AgentSDKError {
    readonly iterations: number;
    readonly partialResult?: {
        content: string;
        toolCalls: any[];
    } | undefined;
    constructor(iterations: number, partialResult?: {
        content: string;
        toolCalls: any[];
    } | undefined);
}

/**
 * @guilherme/agent-sdk/generateText
 *
 * Simple text generation without streaming.
 */

interface GenerateTextOptions {
    provider: ProviderConfig;
    prompt: string;
    systemPrompt?: string;
    temperature?: number;
    maxTokens?: number;
    /** Abort signal for cancellation */
    signal?: AbortSignal;
}
interface GenerateTextResult {
    content: string;
    usage?: {
        promptTokens: number;
        completionTokens: number;
        totalTokens: number;
    };
    finishReason: 'stop' | 'length' | 'content_filter' | 'unknown';
}
/**
 * Generate text without streaming
 *
 * @example
 * ```ts
 * const result = await generateText({
 *   provider: { baseUrl: '...', apiKey: '...', model: 'gpt-4' },
 *   prompt: 'Write a haiku about coding',
 * });
 * console.log(result.content);
 * ```
 */
declare function generateText(options: GenerateTextOptions): Promise<GenerateTextResult>;

/**
 * @guilherme/agent-sdk/streamText
 *
 * Streaming text generation.
 */

interface StreamTextOptions {
    provider: ProviderConfig;
    prompt: string;
    systemPrompt?: string;
    temperature?: number;
    maxTokens?: number;
    /** Abort signal for cancellation */
    signal?: AbortSignal;
    /** Throttle callback invocations (ms) */
    throttle?: number;
}
interface StreamTextResult {
    /** The full text content (updates during streaming) */
    content: string;
    /** Async iterator for streaming */
    stream: AsyncIterable<string>;
    /** Promise that resolves when streaming is done */
    done: Promise<void>;
    /** Abort the stream */
    abort: () => void;
}
/**
 * Stream text generation
 *
 * @example
 * ```ts
 * const result = streamText({
 *   provider: { baseUrl: '...', apiKey: '...', model: 'gpt-4' },
 *   prompt: 'Tell me a story',
 * });
 *
 * for await (const chunk of result.stream) {
 *   console.log(chunk);
 * }
 *
 * console.log('Full content:', result.content);
 * ```
 */
declare function streamText(options: StreamTextOptions): StreamTextResult;

export { APIError, type AgentConfig, AgentRuntime, AgentSDKError, type ChatMessage, type ContextWindowConfig, type DateTimeContext, type GenerateTextOptions, type GenerateTextResult, type HistoryStore, type JSONSchema, type JsonSchemaToolDefinition, MaxIterationsError, type McpServerConfig, type McpToolsResult, type PostgresPool, type PromptEnhancerConfig, type ProviderConfig, type RedisLike, type ResponseSchemaConfig, type RuntimeCallbacks, type RuntimeTool, type SQLiteDatabase, StreamAbortError, type StreamTextOptions, type StreamTextResult, type ToolCall, type ToolDefinition, ToolExecutionError, type TruncateOptions, ValidationError, type ZodSchemaLike, type ZodToolDefinition, createMcpTools, createMcpToolsFromServers, createSummaryMessage, defineTool, estimateMessagesTokens, estimateTokens, fileStore, generateText, memoryStore, postgresStore, redisStore, sqliteStore, streamText, summarizeHistory, toolsToOpenAIFormat, truncateHistory, zodToJsonSchema };

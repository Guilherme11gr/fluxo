import * as react_jsx_runtime from 'react/jsx-runtime';
import React$1 from 'react';

interface AgentChatProps {
    endpoint: string;
    title?: string;
    subtitle?: string;
    theme?: 'dark' | 'light';
    examples?: string[];
    toolLabels?: Record<string, string>;
    onToolExecuted?: () => void;
    sessionId?: string;
    /** Custom icon rendered in the FAB button and header avatar. Falls back to default sparkles. */
    icon?: React$1.ReactNode;
    labels?: {
        placeholder?: string;
        processing?: string;
        newMessage?: string;
        clearHistory?: string;
        retry?: string;
        confirm?: string;
        cancel?: string;
    };
}
declare function AgentChat({ endpoint, title, subtitle, theme, examples, toolLabels, onToolExecuted, sessionId: propSessionId, labels, icon, }: AgentChatProps): react_jsx_runtime.JSX.Element;

interface BuilderAgentConfig {
    name: string;
    systemPrompt: string;
    provider: {
        type: 'openai' | 'anthropic' | 'zai' | 'groq' | 'custom';
        baseUrl: string;
        apiKey: string;
        model: string;
    };
    tools: BuilderToolConfig[];
    mcpServers: BuilderMcpServerConfig[];
    settings: {
        temperature: number;
        maxIterations: number;
        historySize: number;
    };
}
interface BuilderToolConfig {
    id: string;
    name: string;
    description: string;
    parameters: any;
    code: string;
    awaitConfirm: boolean;
    confirmMessage: string;
}
interface BuilderMcpServerConfig {
    id: string;
    name: string;
    command: string;
    args: string[];
    env: Record<string, string>;
    enabled: boolean;
}
type AgentConfig = BuilderAgentConfig;
type ToolConfig = BuilderToolConfig;
type McpServerConfig = BuilderMcpServerConfig;
interface AgentBuilderProps {
    initialConfig?: Partial<AgentConfig>;
    onExport?: (config: AgentConfig) => void;
    onSave?: (config: AgentConfig) => void;
    onTest?: (config: AgentConfig) => void;
    showPreview?: boolean;
}
declare function AgentBuilder({ initialConfig, onExport, onSave, onTest, }: AgentBuilderProps): react_jsx_runtime.JSX.Element;

/**
 * @guilherme/agent-sdk/react/useChat
 *
 * Hook for managing chat conversations with streaming support.
 */
interface ChatMessage {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    /** Tool calls made in this message */
    toolCalls?: Array<{
        id: string;
        name: string;
        args: any;
        result?: any;
    }>;
    /** Whether this message is still being streamed */
    isStreaming?: boolean;
    /** Status steps shown during processing */
    statusSteps?: string[];
    /** Error if message failed */
    error?: Error;
}
interface UseChatOptions {
    /** API endpoint (default: '/api/chat') */
    api?: string;
    /** Session ID for history persistence */
    sessionId?: string;
    /** Initial messages */
    initialMessages?: ChatMessage[];
    /** Callback when message is sent */
    onMessageSent?: (message: string) => void;
    /** Callback when response is received */
    onResponse?: (message: ChatMessage) => void;
    /** Callback on error */
    onError?: (error: Error) => void;
    /** Callback when tool is executed */
    onToolCall?: (toolCall: {
        name: string;
        args: any;
        result: any;
    }) => void;
    /** Custom headers */
    headers?: Record<string, string>;
    /** Custom body fields */
    body?: Record<string, any>;
}
interface UseChatReturn {
    /** Array of chat messages */
    messages: ChatMessage[];
    /** Current input value */
    input: string;
    /** Set input value */
    setInput: (value: string) => void;
    /** Whether a request is in progress */
    isLoading: boolean;
    /** Current error */
    error: Error | null;
    /** Send a message */
    sendMessage: (content?: string) => Promise<void>;
    /** Regenerate last assistant message */
    regenerate: () => Promise<void>;
    /** Stop current streaming */
    stop: () => void;
    /** Set messages directly */
    setMessages: (messages: ChatMessage[] | ((prev: ChatMessage[]) => ChatMessage[])) => void;
    /** Clear all messages */
    clearMessages: () => void;
    /** Handle input change (for form integration) */
    handleInputChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
    /** Handle form submit (for form integration) */
    handleSubmit: (e: React.FormEvent) => void;
}
/**
 * Hook for managing chat conversations with streaming support
 *
 * @example
 * ```tsx
 * function Chat() {
 *   const {
 *     messages,
 *     input,
 *     handleInputChange,
 *     handleSubmit,
 *     isLoading,
 *   } = useChat({ api: '/api/chat' });
 *
 *   return (
 *     <div>
 *       {messages.map(m => (
 *         <div key={m.id}>{m.role}: {m.content}</div>
 *       ))}
 *       <form onSubmit={handleSubmit}>
 *         <input value={input} onChange={handleInputChange} />
 *         <button type="submit" disabled={isLoading}>Send</button>
 *       </form>
 *     </div>
 *   );
 * }
 * ```
 */
declare function useChat(options?: UseChatOptions): UseChatReturn;

/**
 * @guilherme/agent-sdk/react/useCompletion
 *
 * Hook for text completion with streaming support.
 */
interface UseCompletionOptions {
    /** API endpoint (default: '/api/completion') */
    api?: string;
    /** Initial completion value */
    initialCompletion?: string;
    /** Initial input value */
    initialInput?: string;
    /** Custom headers */
    headers?: Record<string, string>;
    /** Custom body fields */
    body?: Record<string, any>;
    /** Callback when completion finishes */
    onFinish?: (prompt: string, completion: string) => void;
    /** Callback on error */
    onError?: (error: Error) => void;
}
interface UseCompletionReturn {
    /** Current completion text */
    completion: string;
    /** Set completion directly */
    setCompletion: (value: string) => void;
    /** Current input value */
    input: string;
    /** Set input directly */
    setInput: (value: string) => void;
    /** Whether a request is in progress */
    isLoading: boolean;
    /** Current error */
    error: Error | null;
    /** Trigger completion manually */
    complete: (prompt: string) => Promise<string>;
    /** Stop current streaming */
    stop: () => void;
    /** Handle input change (for form integration) */
    handleInputChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
    /** Handle form submit (for form integration) */
    handleSubmit: (e: React.FormEvent) => void;
}
/**
 * Hook for text completion with streaming support
 *
 * @example
 * ```tsx
 * function Completion() {
 *   const {
 *     completion,
 *     input,
 *     handleInputChange,
 *     handleSubmit,
 *     isLoading,
 *   } = useCompletion({ api: '/api/completion' });
 *
 *   return (
 *     <div>
 *       <form onSubmit={handleSubmit}>
 *         <input value={input} onChange={handleInputChange} />
 *         <button type="submit" disabled={isLoading}>Complete</button>
 *       </form>
 *       <div>{completion}</div>
 *     </div>
 *   );
 * }
 * ```
 */
declare function useCompletion(options?: UseCompletionOptions): UseCompletionReturn;

/**
 * @guilherme/agent-sdk/react/useAgentChat
 *
 * Extended hook for AgentChat with confirmation dialogs,
 * localStorage persistence, and error classification.
 */

interface AgentChatMessage extends ChatMessage {
    /** Whether this message has an error */
    isError?: boolean;
    /** Type of error for specialized handling */
    errorType?: 'api' | 'tool' | 'unknown';
    /** Pending confirmation dialog */
    pendingConfirm?: {
        message: string;
        confirmId: string;
    };
}
interface UseAgentChatOptions {
    /** API endpoint */
    api?: string;
    /** Session ID for persistence */
    sessionId?: string;
    /** Storage key prefix for localStorage */
    storageKey?: string;
    /** Enable localStorage persistence */
    persist?: boolean;
    /** Callback when tool is executed */
    onToolExecuted?: () => void;
    /** Custom headers */
    headers?: Record<string, string>;
    /** Custom body fields */
    body?: Record<string, any>;
}
interface UseAgentChatReturn {
    /** Array of chat messages */
    messages: AgentChatMessage[];
    /** Current input value */
    input: string;
    /** Set input value */
    setInput: (value: string) => void;
    /** Whether a request is in progress */
    isLoading: boolean;
    /** Current error */
    error: Error | null;
    /** Send a message */
    sendMessage: (content?: string) => Promise<void>;
    /** Stop current streaming */
    stop: () => void;
    /** Set messages directly */
    setMessages: (messages: AgentChatMessage[] | ((prev: AgentChatMessage[]) => AgentChatMessage[])) => void;
    /** Clear all messages */
    clearMessages: () => void;
    /** Handle input change */
    handleInputChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
    /** Handle form submit */
    handleSubmit: (e: React.FormEvent) => void;
    /** Handle confirmation response */
    handleConfirm: (confirmId: string, confirmed: boolean) => Promise<void>;
    /** Session ID */
    sessionId: string;
}
/**
 * Hook for AgentChat with extended features
 */
declare function useAgentChat(options?: UseAgentChatOptions): UseAgentChatReturn;

export { AgentBuilder, type AgentBuilderProps, AgentChat, type AgentChatMessage, type AgentChatProps, type AgentConfig, type BuilderAgentConfig, type BuilderMcpServerConfig, type BuilderToolConfig, type ChatMessage, type McpServerConfig, type ToolConfig, type UseAgentChatOptions, type UseAgentChatReturn, type UseChatOptions, type UseChatReturn, type UseCompletionOptions, type UseCompletionReturn, useAgentChat, useChat, useCompletion };

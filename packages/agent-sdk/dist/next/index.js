// src/core/defineTool.ts
import { z } from "zod";
function zodToJsonSchema(zodType) {
  const schema = { type: "object", properties: {}, required: [] };
  if (zodType instanceof z.ZodObject) {
    const shape = zodType.shape;
    for (const [key, value] of Object.entries(shape)) {
      const propSchema = zodFieldToJsonSchema(value);
      schema.properties[key] = propSchema.schema;
      if (!propSchema.optional) {
        schema.required.push(key);
      }
    }
  }
  if (schema.required.length === 0) {
    delete schema.required;
  }
  return schema;
}
function zodFieldToJsonSchema(zodType) {
  if (zodType instanceof z.ZodOptional) {
    const inner = zodFieldToJsonSchema(zodType.unwrap());
    return { schema: inner.schema, optional: true };
  }
  if (zodType instanceof z.ZodNullable) {
    const inner = zodFieldToJsonSchema(zodType.unwrap());
    return { schema: { ...inner.schema, nullable: true }, optional: inner.optional };
  }
  if (zodType instanceof z.ZodDefault) {
    const inner = zodFieldToJsonSchema(zodType.removeDefault());
    return { schema: inner.schema, optional: true };
  }
  if (zodType instanceof z.ZodString) {
    return {
      schema: {
        type: "string",
        description: zodType.description || void 0
      },
      optional: false
    };
  }
  if (zodType instanceof z.ZodNumber) {
    return {
      schema: {
        type: "number",
        description: zodType.description || void 0
      },
      optional: false
    };
  }
  if (zodType instanceof z.ZodBoolean) {
    return {
      schema: {
        type: "boolean",
        description: zodType.description || void 0
      },
      optional: false
    };
  }
  if (zodType instanceof z.ZodArray) {
    const elementType = zodFieldToJsonSchema(zodType.element);
    return {
      schema: {
        type: "array",
        items: elementType.schema,
        description: zodType.description || void 0
      },
      optional: false
    };
  }
  if (zodType instanceof z.ZodEnum) {
    return {
      schema: {
        type: "string",
        enum: zodType.options,
        description: zodType.description || void 0
      },
      optional: false
    };
  }
  if (zodType instanceof z.ZodLiteral) {
    return {
      schema: { const: zodType.value },
      optional: false
    };
  }
  if (zodType instanceof z.ZodUnion) {
    const anyOf = zodType.options.map((opt) => zodFieldToJsonSchema(opt).schema);
    return {
      schema: { anyOf, description: zodType.description || void 0 },
      optional: false
    };
  }
  if (zodType instanceof z.ZodRecord) {
    const valueType = zodFieldToJsonSchema(zodType.valueSchema);
    return {
      schema: {
        type: "object",
        additionalProperties: valueType.schema,
        description: zodType.description || void 0
      },
      optional: false
    };
  }
  if (zodType instanceof z.ZodObject) {
    const nestedSchema = { type: "object", properties: {}, required: [] };
    const shape = zodType.shape;
    for (const [key, value] of Object.entries(shape)) {
      const propSchema = zodFieldToJsonSchema(value);
      nestedSchema.properties[key] = propSchema.schema;
      if (!propSchema.optional) {
        nestedSchema.required.push(key);
      }
    }
    if (nestedSchema.required.length === 0) {
      delete nestedSchema.required;
    }
    return {
      schema: { ...nestedSchema, description: zodType.description || void 0 },
      optional: false
    };
  }
  return {
    schema: {
      type: "object",
      description: zodType.description || void 0
    },
    optional: false
  };
}
function toolsToOpenAIFormat(tools) {
  return tools.map((tool) => ({
    type: "function",
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters
    }
  }));
}

// src/core/tokens.ts
function estimateTokens(text) {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}
function estimateMessagesTokens(messages) {
  return messages.reduce((total, msg) => {
    const content = typeof msg.content === "string" ? msg.content : "";
    const toolCalls = msg.tool_calls ? JSON.stringify(msg.tool_calls) : "";
    const toolCallId = msg.tool_call_id || "";
    return total + estimateTokens(content + toolCalls + toolCallId) + 4;
  }, 0);
}
function truncateHistory(messages, maxTokens, options = {}) {
  const { preserveLastN = 4 } = options;
  if (messages.length <= preserveLastN) {
    return messages;
  }
  const lastMessages = messages.slice(-preserveLastN);
  const olderMessages = messages.slice(0, -preserveLastN);
  let tokens = estimateMessagesTokens(lastMessages);
  const kept = [...lastMessages];
  for (let i = olderMessages.length - 1; i >= 0; i--) {
    const msgTokens = estimateMessagesTokens([olderMessages[i]]);
    if (tokens + msgTokens > maxTokens) break;
    kept.unshift(olderMessages[i]);
    tokens += msgTokens;
  }
  console.log(`[AgentSDK] Context window: ${tokens}/${maxTokens} tokens, ${kept.length}/${messages.length} messages`);
  return kept;
}
function createSummaryMessage(summary) {
  return {
    role: "user",
    content: `[Previous conversation summary: ${summary}]`
  };
}

// src/core/AgentRuntime.ts
var AgentRuntime = class {
  constructor(config) {
    this.config = {
      ...config,
      historySize: config.historySize ?? 20,
      temperature: config.temperature ?? 0.5,
      maxIterations: config.maxIterations ?? 6
    };
    this.enhancedSystemPrompt = this.buildEnhancedSystemPrompt();
  }
  /**
   * Builds the enhanced system prompt with date/time context
   */
  buildEnhancedSystemPrompt() {
    const { promptEnhancer, systemPrompt } = this.config;
    if (promptEnhancer?.injectDateTimeContext === false && !promptEnhancer.basePrompt && !promptEnhancer.customEnhancer) {
      return systemPrompt;
    }
    const parts = [];
    const context = this.getDateTimeContext();
    if (promptEnhancer?.customEnhancer) {
      return promptEnhancer.customEnhancer(systemPrompt, context);
    }
    if (promptEnhancer?.injectDateTimeContext !== false) {
      parts.push(this.formatDateTimeContext(context));
    }
    if (promptEnhancer?.basePrompt) {
      parts.push(promptEnhancer.basePrompt);
    }
    parts.push(systemPrompt);
    return parts.join("\n\n---\n\n");
  }
  /**
   * Gets current date/time context
   */
  getDateTimeContext() {
    const { promptEnhancer } = this.config;
    const timezone = promptEnhancer?.timezone || "America/Sao_Paulo";
    const locale = promptEnhancer?.locale || "pt-BR";
    const now = /* @__PURE__ */ new Date();
    return {
      fullDate: now.toLocaleDateString(locale, {
        dateStyle: "full",
        timeZone: timezone
      }),
      isoDate: this.toISODate(now, timezone),
      yesterday: this.toISODate(new Date(Date.now() - 864e5), timezone),
      tomorrow: this.toISODate(new Date(Date.now() + 864e5), timezone),
      currentMonth: this.toISODate(now, timezone).slice(0, 7),
      currentTime: now.toLocaleTimeString(locale, {
        hour: "2-digit",
        minute: "2-digit",
        timeZone: timezone
      }),
      dayOfWeek: now.toLocaleDateString(locale, {
        weekday: "long",
        timeZone: timezone
      })
    };
  }
  /**
   * Converts date to ISO format (YYYY-MM-DD) in specified timezone
   */
  toISODate(date, timezone) {
    const parts = date.toLocaleDateString("pt-BR", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).split("/");
    return `${parts[2]}-${parts[1]}-${parts[0]}`;
  }
  /**
   * Formats date/time context for injection into prompt
   */
  formatDateTimeContext(ctx) {
    return `Contexto temporal:
- Data atual: ${ctx.fullDate}
- Hora atual: ${ctx.currentTime}
- Data ISO: ${ctx.isoDate}

Como interpretar datas:
- "hoje" \u2192 ${ctx.isoDate}
- "ontem" \u2192 ${ctx.yesterday}
- "amanh\xE3" \u2192 ${ctx.tomorrow}
- "esse m\xEAs" \u2192 ${ctx.currentMonth}

Como interpretar hor\xE1rios:
- "9h" \u2192 09:00
- "14h" \u2192 14:00
- "2 da tarde" \u2192 14:00
- "3 e meia" \u2192 15:30
- Sempre use formato HH:MM (24h) e YYYY-MM-DD para datas`;
  }
  /**
   * Executa uma conversa com streaming e tool calling
   *
   * @returns content: texto final, toolCalls: todas as tools chamadas, history: histórico completo incluindo tool results
   */
  async run(messages, callbacks = {}) {
    const allToolCalls = [];
    let iterHistory = [...messages];
    if (this.config.contextWindow) {
      const { maxTokens, preserveLastN = 4, summarizeOld } = this.config.contextWindow;
      iterHistory = truncateHistory(iterHistory, maxTokens, { preserveLastN });
      if (summarizeOld && estimateMessagesTokens(iterHistory) > maxTokens * 0.8) {
        const oldMessages = iterHistory.slice(0, -preserveLastN);
        if (oldMessages.length > 0) {
          console.log("[AgentSDK] Summarizing", oldMessages.length, "old messages");
          const summary = await this.summarizeOldMessages(oldMessages);
          iterHistory = [
            createSummaryMessage(summary),
            ...iterHistory.slice(-preserveLastN)
          ];
        }
      }
    } else {
      if (iterHistory.length > this.config.historySize) {
        iterHistory = iterHistory.slice(-this.config.historySize);
      }
    }
    const systemMessage = {
      role: "system",
      content: this.enhancedSystemPrompt
    };
    let maxIterations = this.config.maxIterations;
    console.log("[AgentSDK] Runtime starting, maxIterations:", maxIterations);
    while (maxIterations-- > 0) {
      console.log("[AgentSDK] Iteration remaining:", maxIterations + 1);
      console.log("[AgentSDK] Calling LLM stream...");
      const result = await this.callLLMStream(
        [systemMessage, ...iterHistory],
        callbacks
      );
      console.log("[AgentSDK] LLM response:", {
        contentLength: result.content?.length,
        toolCallsCount: result.toolCalls?.length,
        toolNames: result.toolCalls?.map((t) => t.function.name)
      });
      if (result.toolCalls.length === 0) {
        console.log("[AgentSDK] No tool calls, returning final response");
        iterHistory.push({ role: "assistant", content: result.content, tool_calls: allToolCalls.length > 0 ? allToolCalls : void 0 });
        const data = this.parseStructuredOutput(result.content);
        return { content: result.content, toolCalls: allToolCalls, history: iterHistory, data };
      }
      iterHistory.push({
        role: "assistant",
        content: result.content,
        tool_calls: result.toolCalls
      });
      allToolCalls.push(...result.toolCalls);
      if (this.config.reasoning?.enabled && result.toolCalls.length > 0) {
        console.log("[AgentSDK] Generating reasoning before tool execution...");
        const thought = await this.generateThought(result, iterHistory);
        if (this.config.reasoning.includeInHistory) {
          const lastIdx = iterHistory.length - 1;
          iterHistory[lastIdx] = {
            ...iterHistory[lastIdx],
            content: `${iterHistory[lastIdx].content}

[REASONING]
${thought}
[/REASONING]`
          };
        }
        console.log("[AgentSDK] Reasoning:", thought.substring(0, 100) + "...");
      }
      const { parallel, sequential } = this.analyzeToolDependencies(result.toolCalls);
      if (parallel.length > 0) {
        console.log("[AgentSDK] Executing", parallel.length, "tools in parallel");
        const results = await Promise.all(
          parallel.map(async (tc) => {
            callbacks.onToolCall?.(tc);
            return this.executeToolCall(tc, callbacks);
          })
        );
        for (let i = 0; i < parallel.length; i++) {
          console.log("[AgentSDK] Parallel tool result:", parallel[i].function.name);
          iterHistory.push({
            role: "tool",
            tool_call_id: parallel[i].id,
            content: JSON.stringify(results[i])
          });
        }
      }
      for (const toolCall of sequential) {
        console.log("[AgentSDK] Executing sequential tool:", toolCall.function.name);
        callbacks.onToolCall?.(toolCall);
        const toolResult = await this.executeToolCall(toolCall, callbacks);
        console.log("[AgentSDK] Tool result:", typeof toolResult === "string" ? toolResult?.substring(0, 100) : toolResult);
        iterHistory.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: JSON.stringify(toolResult)
        });
      }
    }
    console.warn("[AgentSDK] Max iterations reached, returning partial result");
    const partialContent = iterHistory.filter((m) => m.role === "assistant" && m.content).map((m) => m.content).join("\n");
    return {
      content: partialContent || "Desculpe, n\xE3o consegui completar a tarefa. Pode reformular sua solicita\xE7\xE3o?",
      toolCalls: allToolCalls,
      history: iterHistory,
      data: void 0
    };
  }
  /**
   * Faz chamada streaming ao LLM
   */
  async callLLMStream(messages, callbacks) {
    const { provider, tools, temperature, responseSchema } = this.config;
    const url = `${provider.baseUrl}/chat/completions`;
    console.log("[AgentSDK] Calling LLM:", url);
    console.log("[AgentSDK] Model:", provider.model);
    console.log("[AgentSDK] Messages count:", messages.length);
    console.log("[AgentSDK] Tools count:", tools.length);
    const body = {
      model: provider.model,
      messages,
      tools: toolsToOpenAIFormat(tools),
      tool_choice: "auto",
      temperature,
      stream: true
    };
    if (responseSchema) {
      let jsonSchema = responseSchema.schema;
      if (responseSchema.zod && !jsonSchema) {
        jsonSchema = zodToJsonSchema(responseSchema.zod);
      }
      const responseType = responseSchema.type || (jsonSchema ? "json_schema" : "json_object");
      if (responseType === "json_object") {
        body.response_format = { type: "json_object" };
      } else if (responseType === "json_schema" && jsonSchema) {
        body.response_format = {
          type: "json_schema",
          json_schema: {
            name: "response",
            schema: jsonSchema
          }
        };
      }
      console.log("[AgentSDK] Using structured output:", responseType);
    }
    const response = await this.fetchWithRetry(
      url,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${provider.apiKey}`,
          Connection: "close",
          ...provider.headers
        },
        body: JSON.stringify(body)
      },
      3,
      () => callbacks.onStatus?.("Aguardando limite da API...")
    );
    console.log("[AgentSDK] LLM response status:", response.status);
    if (!response.ok) {
      const error = await response.text();
      console.error("[AgentSDK] LLM error:", error);
      throw new Error(`LLM API Error: ${response.status} \u2014 ${error}`);
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let fullContent = "";
    const toolCallAcc = {};
    outer: while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const raw = line.slice(6).trim();
        if (raw === "[DONE]") break outer;
        try {
          const parsed = JSON.parse(raw);
          const delta = parsed.choices?.[0]?.delta;
          if (!delta) continue;
          if (delta.content) {
            fullContent += delta.content;
            callbacks.onToken?.(delta.content);
          }
          if (delta.tool_calls) {
            for (const tc of delta.tool_calls) {
              const idx = tc.index ?? 0;
              if (!toolCallAcc[idx]) {
                toolCallAcc[idx] = {
                  id: "",
                  type: "function",
                  function: { name: "", arguments: "" }
                };
              }
              if (tc.id) toolCallAcc[idx].id = tc.id;
              if (tc.function?.name) {
                toolCallAcc[idx].function.name += tc.function.name;
              }
              if (tc.function?.arguments) {
                toolCallAcc[idx].function.arguments += tc.function.arguments;
              }
            }
          }
        } catch {
        }
      }
    }
    return { content: fullContent, toolCalls: Object.values(toolCallAcc) };
  }
  /**
   * Executa uma tool call
   */
  async executeToolCall(toolCall, callbacks) {
    const { name, arguments: rawArgs } = toolCall.function;
    let args = typeof rawArgs === "string" ? JSON.parse(rawArgs) : rawArgs;
    const tool = this.config.tools.find((t) => t.name === name);
    if (!tool) {
      return { success: false, error: `Tool n\xE3o encontrada: ${name}` };
    }
    if (tool.zodSchema) {
      const parsed = tool.zodSchema.safeParse(args);
      if (!parsed.success) {
        const errorMessages = parsed.error.issues.map((i) => i.message).join(", ");
        return {
          success: false,
          error: `Argumentos inv\xE1lidos: ${errorMessages}`
        };
      }
      args = parsed.data;
    }
    const statusText = this.getToolStatusText(toolCall);
    callbacks.onStatus?.(statusText);
    try {
      if (tool.awaitConfirm && callbacks.onConfirm) {
        const confirmMsg = tool.confirmMessage?.(args) ?? `Executar ${name}?`;
        const confirmId = `confirm-${Date.now()}`;
        const confirmed = await callbacks.onConfirm(confirmMsg, confirmId);
        if (!confirmed) {
          return {
            success: false,
            cancelled: true,
            message: "Usu\xE1rio cancelou a a\xE7\xE3o."
          };
        }
      }
      const result = await tool.execute(args);
      return { success: true, result };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }
  /**
   * Analisa dependências entre tools e retorna grupos paralelos vs sequenciais
   */
  analyzeToolDependencies(toolCalls) {
    const parallel = [];
    const sequential = [];
    for (const tc of toolCalls) {
      const tool = this.config.tools.find((t) => t.name === tc.function.name);
      const hasDependencies = tool?.dependencies && tool.dependencies.length > 0;
      const canParallelize = tool?.parallelizable !== false;
      if (!hasDependencies && canParallelize) {
        parallel.push(tc);
      } else {
        sequential.push(tc);
      }
    }
    return { parallel, sequential };
  }
  /**
   * Texto de status amigável por tool
   */
  getToolStatusText(toolCall) {
    const name = toolCall.function.name;
    const statusMap = {
      create: "Criando...",
      update: "Atualizando...",
      add: "Adicionando...",
      set: "Definindo...",
      read: "Consultando...",
      list: "Listando...",
      delete: "Removendo...",
      mark: "Marcando...",
      get: "Buscando...",
      send: "Enviando..."
    };
    for (const [prefix, status] of Object.entries(statusMap)) {
      if (name.startsWith(prefix)) return status;
    }
    return "Processando...";
  }
  /**
   * Fetch com retry automático (socket errors e rate limit)
   */
  async fetchWithRetry(url, init, maxRetries = 3, onWaiting) {
    let lastError = new Error("Unknown error");
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 45e3);
      try {
        const res = await fetch(url, { ...init, signal: controller.signal });
        clearTimeout(timeoutId);
        if (res.status === 429 && attempt < maxRetries) {
          onWaiting?.();
          const retryAfter = res.headers.get("Retry-After");
          const waitMs = retryAfter ? parseInt(retryAfter) * 1e3 : 8e3 * attempt;
          console.warn(
            `[AgentSDK] Rate limit (429), aguardando ${waitMs}ms (tentativa ${attempt}/${maxRetries})...`
          );
          await new Promise((r) => setTimeout(r, waitMs));
          continue;
        }
        return res;
      } catch (err) {
        clearTimeout(timeoutId);
        lastError = err;
        const isRetryable = err?.cause?.code === "UND_ERR_SOCKET" || err?.cause?.code === "ECONNRESET" || err?.cause?.code === "ECONNREFUSED" || err?.name === "AbortError";
        if (!isRetryable || attempt === maxRetries) break;
        await new Promise(
          (r) => setTimeout(r, 500 * 2 ** (attempt - 1))
        );
        console.warn(
          `[AgentSDK] Tentativa ${attempt} falhou (${err?.cause?.code ?? err?.name}), tentando novamente...`
        );
      }
    }
    throw lastError;
  }
  /**
   * Summarize old messages using LLM
   */
  async summarizeOldMessages(messages) {
    const prompt = `Summarize this conversation in 2-3 sentences, keeping key information:
${messages.map((m) => `${m.role}: ${m.content}`).join("\n")}`;
    try {
      const { provider } = this.config;
      const url = `${provider.baseUrl}/chat/completions`;
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${provider.apiKey}`,
          ...provider.headers
        },
        body: JSON.stringify({
          model: provider.model,
          messages: [{ role: "user", content: prompt }],
          temperature: 0.3,
          max_tokens: 200
        })
      });
      if (!response.ok) {
        console.warn("[AgentSDK] Summary generation failed, using fallback");
        return "Previous conversation context was summarized.";
      }
      const data = await response.json();
      return data.choices?.[0]?.message?.content || "Previous conversation context was summarized.";
    } catch (error) {
      console.warn("[AgentSDK] Summary generation error:", error);
      return "Previous conversation context was summarized.";
    }
  }
  /**
   * Parse and validate structured output from LLM response
   */
  parseStructuredOutput(content) {
    const { responseSchema } = this.config;
    if (!responseSchema) {
      return void 0;
    }
    try {
      const parsed = JSON.parse(content);
      if (responseSchema.zod) {
        const result = responseSchema.zod.safeParse(parsed);
        if (!result.success) {
          const errors = result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
          console.warn("[AgentSDK] Zod validation failed:", errors);
          return {
            _raw: parsed,
            _validationErrors: result.error.issues
          };
        }
        console.log("[AgentSDK] Structured output validated with Zod");
        return result.data;
      }
      console.log("[AgentSDK] Parsed structured output:", typeof parsed);
      return parsed;
    } catch (error) {
      console.warn("[AgentSDK] Failed to parse structured output:", error);
      return void 0;
    }
  }
  /**
   * Generate reasoning/thought before executing tools
   */
  async generateThought(result, _history) {
    const format = this.config.reasoning?.format || "react";
    const toolNames = result.toolCalls.map((tc) => tc.function.name).join(", ");
    let thoughtPrompt;
    if (format === "react") {
      thoughtPrompt = `Before executing these tools: ${toolNames}

Think through:
1. What is my goal?
2. What information do I have?
3. What do I need to find out?
4. What is my execution plan?

Respond in 2-3 sentences.`;
    } else if (format === "cot") {
      thoughtPrompt = `I'm about to use these tools: ${toolNames}

Let me think step by step about the best approach.`;
    } else {
      thoughtPrompt = `Planning to use tools: ${toolNames}

Briefly analyze the situation and plan your approach.`;
    }
    try {
      const { provider } = this.config;
      const url = `${provider.baseUrl}/chat/completions`;
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${provider.apiKey}`,
          ...provider.headers
        },
        body: JSON.stringify({
          model: provider.model,
          messages: [
            { role: "system", content: "You are a thoughtful AI assistant. Be concise." },
            { role: "user", content: thoughtPrompt }
          ],
          temperature: 0.3,
          max_tokens: 150
        })
      });
      if (!response.ok) {
        console.warn("[AgentSDK] Thought generation failed");
        return `Planning to use: ${toolNames}`;
      }
      const data = await response.json();
      return data.choices?.[0]?.message?.content || `Planning to use: ${toolNames}`;
    } catch (error) {
      console.warn("[AgentSDK] Thought generation error:", error);
      return `Planning to use: ${toolNames}`;
    }
  }
};

// src/core/history.ts
function memoryStore() {
  const store = /* @__PURE__ */ new Map();
  return {
    async get(sessionId) {
      return store.get(sessionId) ?? [];
    },
    async set(sessionId, messages) {
      store.set(sessionId, messages);
    },
    async clear(sessionId) {
      store.delete(sessionId);
    }
  };
}
function redisStore(redis, options = {}) {
  const { prefix = "agent:history:", ttl = 86400 * 7 } = options;
  return {
    async get(sessionId) {
      const data = await redis.get(`${prefix}${sessionId}`);
      if (!data) return [];
      try {
        return JSON.parse(data);
      } catch {
        return [];
      }
    },
    async set(sessionId, messages) {
      await redis.set(`${prefix}${sessionId}`, JSON.stringify(messages), {
        ex: ttl
      });
    },
    async clear(sessionId) {
      await redis.del(`${prefix}${sessionId}`);
    }
  };
}

// src/core/mcp.ts
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

// src/next/createAgentRoute.ts
function createAgentRoute(config) {
  const defaultHistoryStore = memoryStore();
  const confirmPending = /* @__PURE__ */ new Map();
  return async function POST(req) {
    const encoder = new TextEncoder();
    try {
      const body = await req.json();
      const routeContext = { req, body };
      const { message, sessionId, retryLast, confirmId, confirmed } = body;
      console.log("[AgentSDK] Request received:", {
        sessionId,
        message: message?.substring(0, 50),
        retryLast,
        confirmId,
        confirmed
      });
      if (!sessionId) {
        console.log("[AgentSDK] Error: sessionId missing");
        return new Response(
          JSON.stringify({ error: "sessionId \xE9 obrigat\xF3rio" }),
          { status: 400, headers: { "Content-Type": "application/json" } }
        );
      }
      if (confirmId !== void 0) {
        console.log("[AgentSDK] Resolving confirmation:", confirmId, confirmed);
        const key = `${sessionId}:${confirmId}`;
        const pending = confirmPending.get(key);
        if (pending) {
          confirmPending.delete(key);
          pending.resolve(confirmed === true);
        }
        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      }
      if (!retryLast && !message) {
        console.log("[AgentSDK] Error: message missing");
        return new Response(
          JSON.stringify({ error: "message \xE9 obrigat\xF3rio" }),
          { status: 400, headers: { "Content-Type": "application/json" } }
        );
      }
      const historyStore = await resolveAgentRouteValue(
        config.historyStore,
        routeContext,
        defaultHistoryStore
      );
      let history = await historyStore.get(sessionId);
      console.log("[AgentSDK] History loaded:", history.length, "messages");
      if (retryLast) {
        while (history.length > 0 && history[history.length - 1].role !== "user") {
          history = history.slice(0, -1);
        }
        if (!history.some((m) => m.role === "user")) {
          return new Response(
            JSON.stringify({ error: "Nenhuma mensagem para reenviar" }),
            { status: 400, headers: { "Content-Type": "application/json" } }
          );
        }
      } else {
        history.push({ role: "user", content: message });
      }
      const provider = await resolveAgentRouteValue(config.provider, routeContext);
      const systemPrompt = await resolveAgentRouteValue(config.systemPrompt, routeContext);
      const tools = await resolveAgentRouteValue(config.tools, routeContext);
      console.log("[AgentSDK] Provider config:", {
        baseUrl: provider.baseUrl,
        model: provider.model,
        hasApiKey: !!provider.apiKey
      });
      const runtime = new AgentRuntime({
        provider,
        systemPrompt,
        tools,
        historySize: config.historySize,
        temperature: config.temperature,
        maxIterations: config.maxIterations,
        contextWindow: config.contextWindow,
        reasoning: config.reasoning,
        responseSchema: config.responseSchema,
        promptEnhancer: config.promptEnhancer
      });
      const stream = new ReadableStream({
        async start(controller) {
          const send = (payload) => {
            console.log("[AgentSDK] SSE send:", payload.type, payload);
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}

`));
          };
          const callbacks = {
            onToken: (token) => send({ type: "token", content: token }),
            onStatus: (status) => send({ type: "status", text: status }),
            onToolCall: (toolCall) => send({ type: "tool_call", toolCall }),
            onConfirm: async (message2, confirmId2) => {
              send({ type: "confirm", message: message2, confirmId: confirmId2 });
              return awaitConfirm(sessionId, confirmId2);
            },
            onError: (error) => send({ type: "error", error: error.message })
          };
          try {
            console.log("[AgentSDK] Starting runtime.run()...");
            const result = await runtime.run(history, callbacks);
            console.log("[AgentSDK] Runtime finished:", {
              contentLength: result.content?.length,
              toolCallsCount: result.toolCalls?.length
            });
            await historyStore.set(sessionId, result.history);
            send({ type: "done", toolCalls: result.toolCalls });
            controller.close();
          } catch (err) {
            console.error("[AgentSDK] Stream error:", err);
            send({ type: "error", error: String(err) });
            controller.close();
          }
        }
      });
      return new Response(stream, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive"
        }
      });
    } catch (error) {
      console.error("[AgentSDK] Route error:", error);
      return new Response(
        JSON.stringify({ error: String(error) }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }
  };
  function awaitConfirm(sessionId, confirmId, timeoutMs = 6e4) {
    return new Promise((resolve) => {
      const key = `${sessionId}:${confirmId}`;
      confirmPending.set(key, { resolve });
      setTimeout(() => {
        if (confirmPending.has(key)) {
          confirmPending.delete(key);
          resolve(false);
        }
      }, timeoutMs);
    });
  }
}
async function resolveAgentRouteValue(value, context, fallback) {
  if (typeof value === "function") {
    return await value(context);
  }
  if (value !== void 0) {
    return value;
  }
  if (fallback !== void 0) {
    return fallback;
  }
  throw new Error("Agent route config value is required");
}
function openaiProvider(config) {
  return config;
}
export {
  createAgentRoute,
  memoryStore,
  openaiProvider,
  redisStore
};
//# sourceMappingURL=index.js.map
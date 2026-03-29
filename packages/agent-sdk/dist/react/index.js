"use client";

// src/react/AgentChat.tsx
import { useState as useState4, useRef as useRef4, useEffect as useEffect2, useCallback as useCallback4 } from "react";

// src/react/hooks/useChat.ts
import { useState, useCallback, useRef } from "react";
function generateId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}
function useChat(options = {}) {
  const {
    api = "/api/chat",
    sessionId = generateId(),
    initialMessages = [],
    onMessageSent,
    onResponse,
    onError,
    headers,
    body
  } = options;
  const [messages, setMessages] = useState(initialMessages);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const abortControllerRef = useRef(null);
  const sendMessage = useCallback(async (content) => {
    const messageContent = content ?? input;
    if (!messageContent.trim() || isLoading) return;
    const userMessage = {
      id: generateId(),
      role: "user",
      content: messageContent
    };
    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);
    setError(null);
    const assistantId = generateId();
    setMessages((prev) => [...prev, {
      id: assistantId,
      role: "assistant",
      content: "",
      isStreaming: true
    }]);
    abortControllerRef.current = new AbortController();
    try {
      const response = await fetch(api, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...headers
        },
        body: JSON.stringify({
          message: messageContent,
          sessionId,
          ...body
        }),
        signal: abortControllerRef.current.signal
      });
      if (!response.ok) {
        throw new Error(`API Error: ${response.status}`);
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let toolCalls = [];
      let statusSteps = [];
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const data = JSON.parse(line.slice(6));
          switch (data.type) {
            case "token":
              setMessages((prev) => prev.map(
                (m) => m.id === assistantId ? { ...m, content: m.content + data.content } : m
              ));
              break;
            case "status":
              statusSteps.push(data.text);
              setMessages((prev) => prev.map(
                (m) => m.id === assistantId ? { ...m, statusSteps: [...statusSteps] } : m
              ));
              break;
            case "tool_call":
              toolCalls.push(data.toolCall);
              break;
            case "done":
              const finalToolCalls = toolCalls.length > 0 ? toolCalls : data.toolCalls ?? [];
              setMessages((prev) => prev.map(
                (m) => m.id === assistantId ? { ...m, isStreaming: false, toolCalls: finalToolCalls } : m
              ));
              setMessages((prev) => {
                const assistantMsg = prev.find((m) => m.id === assistantId);
                if (assistantMsg) onResponse?.(assistantMsg);
                return prev;
              });
              break;
            case "error":
              throw new Error(data.error);
          }
        }
      }
      onMessageSent?.(messageContent);
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        return;
      }
      const error2 = err instanceof Error ? err : new Error(String(err));
      setError(error2);
      onError?.(error2);
      setMessages((prev) => prev.map(
        (m) => m.id === assistantId ? { ...m, isStreaming: false, error: error2 } : m
      ));
    } finally {
      setIsLoading(false);
      abortControllerRef.current = null;
    }
  }, [api, sessionId, input, isLoading, headers, body, onMessageSent, onResponse, onError]);
  const regenerate = useCallback(async () => {
    const lastUserIdx = messages.findLastIndex((m) => m.role === "user");
    if (lastUserIdx === -1) return;
    const lastUserMessage = messages[lastUserIdx];
    setMessages((prev) => prev.slice(0, lastUserIdx));
    await sendMessage(lastUserMessage.content);
  }, [messages, sendMessage]);
  const stop = useCallback(() => {
    abortControllerRef.current?.abort();
  }, []);
  const clearMessages = useCallback(() => {
    setMessages([]);
  }, []);
  const handleInputChange = useCallback((e) => {
    setInput(e.target.value);
  }, []);
  const handleSubmit = useCallback((e) => {
    e.preventDefault();
    sendMessage();
  }, [sendMessage]);
  return {
    messages,
    input,
    setInput,
    isLoading,
    error,
    sendMessage,
    regenerate,
    stop,
    setMessages,
    clearMessages,
    handleInputChange,
    handleSubmit
  };
}

// src/react/hooks/useCompletion.ts
import { useState as useState2, useCallback as useCallback2, useRef as useRef2 } from "react";
function useCompletion(options = {}) {
  const {
    api = "/api/completion",
    initialCompletion = "",
    initialInput = "",
    headers,
    body,
    onFinish,
    onError
  } = options;
  const [completion, setCompletion] = useState2(initialCompletion);
  const [input, setInput] = useState2(initialInput);
  const [isLoading, setIsLoading] = useState2(false);
  const [error, setError] = useState2(null);
  const abortControllerRef = useRef2(null);
  const complete = useCallback2(async (prompt) => {
    if (!prompt.trim() || isLoading) return completion;
    setIsLoading(true);
    setError(null);
    setCompletion("");
    abortControllerRef.current = new AbortController();
    try {
      const response = await fetch(api, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...headers
        },
        body: JSON.stringify({
          prompt,
          ...body
        }),
        signal: abortControllerRef.current.signal
      });
      if (!response.ok) {
        throw new Error(`API Error: ${response.status}`);
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let fullCompletion = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const data = JSON.parse(line.slice(6));
          if (data.type === "token") {
            fullCompletion += data.content;
            setCompletion(fullCompletion);
          } else if (data.type === "done") {
            onFinish?.(prompt, fullCompletion);
          } else if (data.type === "error") {
            throw new Error(data.error);
          }
        }
      }
      return fullCompletion;
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        return completion;
      }
      const error2 = err instanceof Error ? err : new Error(String(err));
      setError(error2);
      onError?.(error2);
      return "";
    } finally {
      setIsLoading(false);
      abortControllerRef.current = null;
    }
  }, [api, isLoading, headers, body, completion, onFinish, onError]);
  const stop = useCallback2(() => {
    abortControllerRef.current?.abort();
  }, []);
  const handleInputChange = useCallback2((e) => {
    setInput(e.target.value);
  }, []);
  const handleSubmit = useCallback2((e) => {
    e.preventDefault();
    complete(input);
  }, [complete, input]);
  return {
    completion,
    setCompletion,
    input,
    setInput,
    isLoading,
    error,
    complete,
    stop,
    handleInputChange,
    handleSubmit
  };
}

// src/react/hooks/useAgentChat.ts
import { useState as useState3, useCallback as useCallback3, useEffect, useRef as useRef3 } from "react";
function generateId2() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}
function useAgentChat(options = {}) {
  const {
    api = "/api/chat",
    sessionId: propSessionId,
    storageKey = "agent_chat",
    persist = true,
    onToolExecuted,
    headers,
    body
  } = options;
  const [sessionId] = useState3(() => {
    if (propSessionId) return propSessionId;
    if (typeof window === "undefined") return `session-${Date.now()}`;
    const params = new URLSearchParams(window.location.search);
    const existing = params.get("sessionId");
    if (existing) return existing;
    return `session-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  });
  const storageKeyRef = `${storageKey}_${sessionId}`;
  const initialMessages = useState3(() => {
    if (!persist || typeof window === "undefined") return [];
    try {
      const stored = localStorage.getItem(storageKeyRef);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  })[0];
  const [messages, setMessages] = useState3(initialMessages);
  const [input, setInput] = useState3("");
  const [isLoading, setIsLoading] = useState3(false);
  const [error, setError] = useState3(null);
  const pendingConfirmsRef = useRef3(/* @__PURE__ */ new Map());
  const abortControllerRef = useRef3(null);
  useEffect(() => {
    if (!persist || typeof window === "undefined") return;
    try {
      localStorage.setItem(storageKeyRef, JSON.stringify(messages));
    } catch {
    }
  }, [messages, storageKeyRef, persist]);
  const sendMessage = useCallback3(async (content) => {
    const messageContent = content ?? input;
    if (!messageContent.trim() || isLoading) return;
    setInput("");
    setIsLoading(true);
    setError(null);
    const userMessageId = generateId2();
    const assistantId = generateId2();
    setMessages((prev) => [
      ...prev,
      {
        id: userMessageId,
        role: "user",
        content: messageContent
      },
      {
        id: assistantId,
        role: "assistant",
        content: "",
        isStreaming: true
      }
    ]);
    abortControllerRef.current = new AbortController();
    try {
      const response = await fetch(api, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...headers
        },
        body: JSON.stringify({
          message: messageContent,
          sessionId,
          ...body
        }),
        signal: abortControllerRef.current.signal
      });
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText);
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let toolCalls = [];
      let statusSteps = [];
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const data = JSON.parse(line.slice(6));
            switch (data.type) {
              case "token":
                setMessages((prev) => prev.map(
                  (m) => m.id === assistantId ? { ...m, content: m.content + data.content } : m
                ));
                break;
              case "status":
                statusSteps.push(data.text);
                setMessages((prev) => prev.map(
                  (m) => m.id === assistantId ? { ...m, statusSteps: [...statusSteps] } : m
                ));
                break;
              case "tool_call":
                toolCalls.push(data.toolCall);
                break;
              case "confirm":
                setMessages((prev) => prev.map(
                  (m) => m.id === assistantId ? { ...m, pendingConfirm: { message: data.message, confirmId: data.confirmId } } : m
                ));
                const confirmed = await new Promise((resolve) => {
                  pendingConfirmsRef.current.set(data.confirmId, { resolve });
                });
                await fetch(api, {
                  method: "POST",
                  headers: { "Content-Type": "application/json", ...headers },
                  body: JSON.stringify({ sessionId, confirmId: data.confirmId, confirmed })
                });
                setMessages((prev) => prev.map(
                  (m) => m.id === assistantId ? { ...m, pendingConfirm: void 0 } : m
                ));
                if (!confirmed) {
                  setMessages((prev) => prev.map(
                    (m) => m.id === assistantId ? { ...m, isStreaming: false, content: "A\xE7\xE3o cancelada." } : m
                  ));
                  return;
                }
                break;
              case "done":
                const finalToolCalls = toolCalls.length > 0 ? toolCalls : data.toolCalls ?? [];
                setMessages((prev) => prev.map(
                  (m) => m.id === assistantId ? { ...m, isStreaming: false, toolCalls: finalToolCalls } : m
                ));
                if (finalToolCalls.length > 0) {
                  onToolExecuted?.();
                }
                break;
              case "error":
                const raw = data.error || "";
                const isRateLimit = raw.includes("429") || raw.includes("1302") || raw.toLowerCase().includes("rate limit");
                const errorType = isRateLimit ? "api" : "unknown";
                const friendlyMsg = isRateLimit ? "Atingi o limite de requisi\xE7\xF5es. Aguarde alguns segundos." : "Algo deu errado.";
                setMessages((prev) => prev.map(
                  (m) => m.id === assistantId ? { ...m, content: friendlyMsg, isStreaming: false, isError: true, errorType } : m
                ));
                break;
            }
          } catch {
          }
        }
      }
      setMessages((prev) => prev.map(
        (m) => m.id === assistantId && m.isStreaming ? { ...m, isStreaming: false } : m
      ));
    } catch (error2) {
      if (error2 instanceof Error && error2.name === "AbortError") {
        setMessages((prev) => prev.map(
          (m) => m.id === assistantId ? { ...m, isStreaming: false } : m
        ));
        return;
      }
      console.error("Error sending message:", error2);
      const typedError = error2 instanceof Error ? error2 : new Error(String(error2));
      setError(typedError);
      setMessages((prev) => prev.map(
        (m) => m.id === assistantId ? {
          ...m,
          content: "N\xE3o consegui conectar ao servidor.",
          isStreaming: false,
          isError: true,
          errorType: "unknown"
        } : m
      ));
    } finally {
      setIsLoading(false);
      abortControllerRef.current = null;
    }
  }, [api, sessionId, input, isLoading, headers, body, onToolExecuted]);
  const handleConfirm = useCallback3(async (confirmId, confirmed) => {
    const pending = pendingConfirmsRef.current.get(confirmId);
    if (pending) {
      pending.resolve(confirmed);
      pendingConfirmsRef.current.delete(confirmId);
    }
  }, []);
  const clearMessages = useCallback3(() => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    setMessages([]);
    setInput("");
    setIsLoading(false);
    setError(null);
    if (persist && typeof window !== "undefined") {
      try {
        localStorage.removeItem(storageKeyRef);
      } catch {
      }
    }
  }, [storageKeyRef, persist]);
  return {
    messages,
    input,
    setInput,
    isLoading,
    error,
    sendMessage,
    stop: () => abortControllerRef.current?.abort(),
    setMessages,
    clearMessages,
    handleInputChange: (e) => {
      setInput(e.target.value);
    },
    handleSubmit: (e) => {
      e.preventDefault();
      sendMessage();
    },
    handleConfirm,
    sessionId
  };
}

// src/react/AgentChat.tsx
import { Fragment, jsx, jsxs } from "react/jsx-runtime";
function AgentChat({
  endpoint,
  title = "Assistente",
  subtitle = "AI powered",
  theme = "dark",
  examples,
  toolLabels = {},
  onToolExecuted,
  sessionId: propSessionId,
  labels = {}
}) {
  const [sessionResetVersion, setSessionResetVersion] = useState4(0);
  const [isOpen, setIsOpen] = useState4(false);
  const [isMinimized, setIsMinimized] = useState4(false);
  const effectiveSessionId = propSessionId ? `${propSessionId}::${sessionResetVersion}` : void 0;
  useEffect2(() => {
    setSessionResetVersion(0);
  }, [propSessionId]);
  return /* @__PURE__ */ jsx(
    AgentChatSession,
    {
      endpoint,
      title,
      subtitle,
      theme,
      examples,
      toolLabels,
      onToolExecuted,
      sessionId: effectiveSessionId,
      labels,
      isOpen,
      isMinimized,
      setIsOpen,
      setIsMinimized,
      onResetSession: () => setSessionResetVersion((current) => current + 1)
    },
    effectiveSessionId ?? `agent-chat-session-${sessionResetVersion}`
  );
}
function AgentChatSession({
  endpoint,
  title = "Assistente",
  subtitle = "AI powered",
  theme = "dark",
  examples,
  toolLabels = {},
  onToolExecuted,
  sessionId: propSessionId,
  labels = {},
  isOpen,
  isMinimized,
  setIsOpen,
  setIsMinimized,
  onResetSession
}) {
  const chat = useAgentChat({
    api: endpoint,
    sessionId: propSessionId,
    onToolExecuted,
    storageKey: "agent-chat",
    persist: true
  });
  const messagesEndRef = useRef4(null);
  const messagesContainerRef = useRef4(null);
  const inputRef = useRef4(null);
  const shouldAutoScroll = useRef4(true);
  const [showScrollBtn, setShowScrollBtn] = useState4(false);
  const scrollToBottom = useCallback4((behavior = "smooth") => {
    messagesEndRef.current?.scrollIntoView({ behavior, block: "end" });
  }, []);
  useEffect2(() => {
    if (isOpen && !isMinimized) {
      requestAnimationFrame(() => scrollToBottom("instant"));
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen, isMinimized, scrollToBottom]);
  useEffect2(() => {
    if (shouldAutoScroll.current) {
      scrollToBottom("smooth");
    }
  }, [chat.messages, scrollToBottom]);
  const handleContainerScroll = (e) => {
    const el = e.currentTarget;
    const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    const atBottom = distFromBottom < 80;
    shouldAutoScroll.current = atBottom;
    setShowScrollBtn(!atBottom);
  };
  const handleSend = () => {
    if (!chat.input.trim() || chat.isLoading) return;
    chat.sendMessage();
  };
  const handleKeyPress = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };
  if (!isOpen) {
    return /* @__PURE__ */ jsxs(Fragment, { children: [
      /* @__PURE__ */ jsxs(
        "button",
        {
          onClick: () => setIsOpen(true),
          className: "agent-chat-fab",
          title: "Abrir assistente",
          "aria-label": "Abrir assistente",
          children: [
            /* @__PURE__ */ jsx(MessageIcon, {}),
            /* @__PURE__ */ jsx("span", { className: "fab-label", children: "Chat" }),
            /* @__PURE__ */ jsx("div", { className: "fab-ripple" })
          ]
        }
      ),
      chat.isLoading && /* @__PURE__ */ jsx("div", { className: "agent-chat-pulse", children: /* @__PURE__ */ jsx("div", { className: "pulse-dot" }) }),
      /* @__PURE__ */ jsx("style", { children: fabStyles })
    ] });
  }
  return /* @__PURE__ */ jsxs("div", { className: `agent-chat-container ${theme} ${isMinimized ? "minimized" : ""}`, children: [
    /* @__PURE__ */ jsxs("header", { className: "agent-chat-header", children: [
      /* @__PURE__ */ jsxs("div", { className: "header-left", children: [
        /* @__PURE__ */ jsxs("div", { className: "avatar", children: [
          /* @__PURE__ */ jsx(SparklesIcon, {}),
          /* @__PURE__ */ jsx("div", { className: "avatar-glow" })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "header-text", children: [
          /* @__PURE__ */ jsx("h3", { children: title }),
          /* @__PURE__ */ jsx("p", { children: subtitle })
        ] })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "header-actions", children: [
        /* @__PURE__ */ jsx(
          "button",
          {
            onClick: () => {
              chat.clearMessages();
              onResetSession?.();
            },
            className: "icon-btn",
            title: labels.clearHistory || "Limpar hist\xF3rico",
            "aria-label": labels.clearHistory || "Limpar hist\xF3rico",
            children: /* @__PURE__ */ jsx(TrashIcon, {})
          }
        ),
        /* @__PURE__ */ jsx(
          "button",
          {
            onClick: () => setIsMinimized(!isMinimized),
            className: "icon-btn",
            title: isMinimized ? "Expandir" : "Minimizar",
            "aria-label": isMinimized ? "Expandir" : "Minimizar",
            children: isMinimized ? /* @__PURE__ */ jsx(ExpandIcon, {}) : /* @__PURE__ */ jsx(MinimizeIcon, {})
          }
        ),
        /* @__PURE__ */ jsx(
          "button",
          {
            onClick: () => setIsOpen(false),
            className: "icon-btn close",
            title: "Fechar",
            "aria-label": "Fechar",
            children: /* @__PURE__ */ jsx(CloseIcon, {})
          }
        )
      ] })
    ] }),
    !isMinimized && /* @__PURE__ */ jsxs(
      "div",
      {
        ref: messagesContainerRef,
        className: "agent-chat-messages",
        onScroll: handleContainerScroll,
        children: [
          chat.messages.length === 0 && examples && /* @__PURE__ */ jsxs("div", { className: "examples-panel", children: [
            /* @__PURE__ */ jsxs("div", { className: "examples-header", children: [
              /* @__PURE__ */ jsx(LightbulbIcon, {}),
              /* @__PURE__ */ jsx("span", { children: "Experimente perguntar" })
            ] }),
            /* @__PURE__ */ jsx("ul", { children: examples.map((ex, i) => /* @__PURE__ */ jsx(
              "li",
              {
                onClick: () => {
                  chat.setInput(ex);
                  inputRef.current?.focus();
                },
                children: ex
              },
              i
            )) })
          ] }),
          chat.messages.map((msg, idx) => /* @__PURE__ */ jsx(
            MessageBubble,
            {
              message: msg,
              toolLabels,
              labels,
              onConfirm: chat.handleConfirm
            },
            msg.id || idx
          )),
          chat.isLoading && chat.messages[chat.messages.length - 1]?.isStreaming && !chat.messages[chat.messages.length - 1]?.content && !chat.messages[chat.messages.length - 1]?.statusSteps?.length && /* @__PURE__ */ jsx("div", { className: "message-wrapper assistant", children: /* @__PURE__ */ jsxs("div", { className: "message-bubble loading", children: [
            /* @__PURE__ */ jsxs("div", { className: "typing-indicator", children: [
              /* @__PURE__ */ jsx("span", {}),
              /* @__PURE__ */ jsx("span", {}),
              /* @__PURE__ */ jsx("span", {})
            ] }),
            /* @__PURE__ */ jsx("span", { className: "loading-text", children: labels.processing || "Pensando..." })
          ] }) }),
          /* @__PURE__ */ jsx("div", { ref: messagesEndRef }),
          showScrollBtn && /* @__PURE__ */ jsxs(
            "button",
            {
              onClick: () => {
                shouldAutoScroll.current = true;
                setShowScrollBtn(false);
                scrollToBottom("smooth");
              },
              className: "scroll-to-bottom",
              "aria-label": labels.newMessage || "Nova mensagem",
              children: [
                /* @__PURE__ */ jsx(ArrowDownIcon, {}),
                /* @__PURE__ */ jsx("span", { children: labels.newMessage || "Nova mensagem" })
              ]
            }
          )
        ]
      }
    ),
    !isMinimized && /* @__PURE__ */ jsxs("footer", { className: "agent-chat-input", children: [
      /* @__PURE__ */ jsxs("div", { className: "input-wrapper", children: [
        /* @__PURE__ */ jsx(
          "input",
          {
            ref: inputRef,
            type: "text",
            value: chat.input,
            onChange: chat.handleInputChange,
            onKeyDown: handleKeyPress,
            placeholder: chat.isLoading ? labels.processing || "Aguardando resposta..." : labels.placeholder || "Digite sua mensagem...",
            disabled: chat.isLoading
          }
        ),
        /* @__PURE__ */ jsx(
          "button",
          {
            onClick: handleSend,
            disabled: !chat.input.trim() || chat.isLoading,
            className: "send-btn",
            "aria-label": "Enviar mensagem",
            children: /* @__PURE__ */ jsx(SendIcon, {})
          }
        )
      ] }),
      /* @__PURE__ */ jsx("div", { className: "input-glow" })
    ] }),
    /* @__PURE__ */ jsx("style", { children: chatStyles })
  ] });
}
function MessageBubble({
  message,
  toolLabels,
  labels,
  onConfirm
}) {
  if (message.isStreaming && !message.content && !message.statusSteps?.length && !message.pendingConfirm) {
    return null;
  }
  const isUser = message.role === "user";
  const isError = message.isError;
  const renderToolCallSummary = (toolCalls) => /* @__PURE__ */ jsx("div", { className: "tool-calls", children: toolCalls.map((call, idx) => {
    const label = toolLabels[call.function?.name] || call.function?.name || call.name || "tool";
    let detail = "";
    try {
      const args = typeof call.function?.arguments === "string" ? JSON.parse(call.function.arguments) : call.function?.arguments || call.args;
      if (args.date) {
        const [, m, d] = args.date.split("-");
        detail = ` \xB7 ${d}/${m}`;
      } else if (args.month) {
        const [y, mo] = args.month.split("-");
        detail = ` \xB7 ${mo}/${y}`;
      } else if (args.phone) {
        detail = ` \xB7 ***${args.phone.slice(-4)}`;
      }
    } catch {
    }
    return /* @__PURE__ */ jsxs("span", { className: "tool-badge", children: [
      /* @__PURE__ */ jsx(CheckIcon, { size: 12 }),
      label,
      detail
    ] }, idx);
  }) });
  const renderContent = (content, streaming) => {
    const displayContent = streaming && content ? content + "\u258C" : content;
    const parts = displayContent.split(/(\*\*[^*]+\*\*)/g);
    return /* @__PURE__ */ jsx("span", { className: "message-content", children: parts.map((part, i) => {
      if (part.startsWith("**") && part.endsWith("**")) {
        return /* @__PURE__ */ jsx("strong", { children: part.slice(2, -2) }, i);
      }
      return part;
    }) });
  };
  return /* @__PURE__ */ jsx("div", { className: `message-wrapper ${isUser ? "user" : "assistant"} ${isError ? "error" : ""}`, children: /* @__PURE__ */ jsxs("div", { className: `message-bubble ${isUser ? "user" : "assistant"} ${isError ? "error" : ""}`, children: [
    message.isStreaming && !message.pendingConfirm && message.statusSteps && message.statusSteps.length > 0 && /* @__PURE__ */ jsx("div", { className: "status-steps", children: message.statusSteps.map((step, i) => {
      const isActive = i === message.statusSteps.length - 1;
      return /* @__PURE__ */ jsxs("div", { className: `status-step ${isActive ? "active" : "completed"}`, children: [
        isActive ? /* @__PURE__ */ jsx("div", { className: "spinner" }) : /* @__PURE__ */ jsx(CheckIcon, { size: 12 }),
        /* @__PURE__ */ jsx("span", { children: step })
      ] }, i);
    }) }),
    message.pendingConfirm && /* @__PURE__ */ jsxs("div", { className: "confirm-dialog", children: [
      /* @__PURE__ */ jsxs("div", { className: "confirm-message", children: [
        /* @__PURE__ */ jsx(AlertIcon, { size: 18 }),
        /* @__PURE__ */ jsx("p", { children: message.pendingConfirm.message })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "confirm-actions", children: [
        /* @__PURE__ */ jsx(
          "button",
          {
            onClick: () => onConfirm(message.pendingConfirm.confirmId, true),
            className: "confirm-btn danger",
            children: labels.confirm || "Confirmar"
          }
        ),
        /* @__PURE__ */ jsx(
          "button",
          {
            onClick: () => onConfirm(message.pendingConfirm.confirmId, false),
            className: "confirm-btn secondary",
            children: labels.cancel || "Cancelar"
          }
        )
      ] })
    ] }),
    !message.isStreaming && message.toolCalls && message.toolCalls.length > 0 && renderToolCallSummary(message.toolCalls),
    (message.content || !message.isStreaming && !message.pendingConfirm) && /* @__PURE__ */ jsxs("div", { className: `message-body ${isUser ? "user" : ""} ${isError ? "error" : ""}`, children: [
      isError && /* @__PURE__ */ jsxs("div", { className: "error-header", children: [
        /* @__PURE__ */ jsx(AlertIcon, { size: 14 }),
        /* @__PURE__ */ jsx("span", { children: "Erro" })
      ] }),
      isError || isUser ? /* @__PURE__ */ jsx("p", { children: message.content }) : renderContent(message.content, message.isStreaming || false)
    ] }),
    isError && message.errorType === "api" && /* @__PURE__ */ jsxs("button", { className: "retry-btn", children: [
      /* @__PURE__ */ jsx(RotateCcwIcon, { size: 12 }),
      labels.retry || "Tentar novamente"
    ] })
  ] }) });
}
var fabStyles = `
.agent-chat-fab {
  position: fixed;
  bottom: 24px;
  right: 24px;
  width: 56px;
  height: 56px;
  border-radius: 16px;
  border: none;
  background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 50%, #a855f7 100%);
  color: white;
  cursor: pointer;
  z-index: 9999;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow:
    0 4px 20px rgba(99, 102, 241, 0.4),
    0 8px 40px rgba(139, 92, 246, 0.3),
    inset 0 1px 0 rgba(255,255,255,0.2);
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  overflow: hidden;
}

.agent-chat-fab:hover {
  transform: translateY(-2px) scale(1.02);
  box-shadow:
    0 6px 24px rgba(99, 102, 241, 0.5),
    0 12px 48px rgba(139, 92, 246, 0.4),
    inset 0 1px 0 rgba(255,255,255,0.3);
}

.agent-chat-fab:active {
  transform: translateY(0) scale(0.98);
}

.agent-chat-fab .fab-label {
  position: absolute;
  right: 70px;
  background: rgba(0,0,0,0.8);
  color: white;
  padding: 6px 12px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 500;
  opacity: 0;
  transform: translateX(10px);
  transition: all 0.2s ease;
  pointer-events: none;
  white-space: nowrap;
}

.agent-chat-fab:hover .fab-label {
  opacity: 1;
  transform: translateX(0);
}

.agent-chat-fab .fab-ripple {
  position: absolute;
  inset: 0;
  background: radial-gradient(circle, rgba(255,255,255,0.3) 0%, transparent 70%);
  opacity: 0;
  transition: opacity 0.3s;
}

.agent-chat-fab:hover .fab-ripple {
  opacity: 1;
}

.agent-chat-pulse {
  position: fixed;
  bottom: 80px;
  right: 32px;
  z-index: 9998;
}

.agent-chat-pulse .pulse-dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: #a855f7;
  animation: pulse-ring 1.5s ease-out infinite;
}

@keyframes pulse-ring {
  0% {
    box-shadow: 0 0 0 0 rgba(168, 85, 247, 0.7);
  }
  100% {
    box-shadow: 0 0 0 20px rgba(168, 85, 247, 0);
  }
}
`;
var chatStyles = `
.agent-chat-container {
  --bg-primary: #0a0a0f;
  --bg-secondary: #12121a;
  --bg-tertiary: #1a1a24;
  --bg-elevated: #22222e;
  --text-primary: #f4f4f5;
  --text-secondary: #a1a1aa;
  --text-muted: #71717a;
  --accent-primary: #8b5cf6;
  --accent-secondary: #6366f1;
  --accent-tertiary: #a855f7;
  --border-color: rgba(255,255,255,0.08);
  --border-subtle: rgba(255,255,255,0.04);
  --success: #10b981;
  --success-bg: rgba(16, 185, 129, 0.15);
  --error: #ef4444;
  --error-bg: rgba(239, 68, 68, 0.15);
  --warning: #f59e0b;
  --info: #3b82f6;

  font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  position: fixed;
  bottom: 24px;
  right: 24px;
  width: 420px;
  min-width: 320px;
  max-width: 90vw;
  height: 580px;
  min-height: 400px;
  max-height: 85vh;
  resize: both;
  background: var(--bg-primary);
  border-radius: 20px;
  border: 1px solid var(--border-color);
  box-shadow:
    0 0 0 1px var(--border-subtle),
    0 20px 50px -10px rgba(0, 0, 0, 0.5),
    0 0 100px -20px rgba(139, 92, 246, 0.2);
  z-index: 9998;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  animation: slide-up 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.agent-chat-container.light {
  --bg-primary: #ffffff;
  --bg-secondary: #f8f8fa;
  --bg-tertiary: #f0f0f2;
  --bg-elevated: #ffffff;
  --text-primary: #18181b;
  --text-secondary: #52525b;
  --text-muted: #a1a1aa;
  --border-color: rgba(0,0,0,0.08);
  --border-subtle: rgba(0,0,0,0.04);
  box-shadow:
    0 0 0 1px var(--border-subtle),
    0 20px 50px -10px rgba(0, 0, 0, 0.15),
    0 0 100px -20px rgba(139, 92, 246, 0.1);
}

.agent-chat-container.minimized {
  height: auto;
  resize: none;
  min-height: unset;
}

/* Resize Grip */
.agent-chat-container::after {
  content: '';
  position: absolute;
  bottom: 3px;
  right: 3px;
  width: 10px;
  height: 10px;
  border-right: 2px solid var(--text-muted);
  border-bottom: 2px solid var(--text-muted);
  opacity: 0.2;
  border-radius: 0 0 6px 0;
  pointer-events: none;
  transition: opacity 0.2s;
}

.agent-chat-container:hover::after {
  opacity: 0.45;
}

.agent-chat-container.minimized::after {
  display: none;
}

@keyframes slide-up {
  from {
    opacity: 0;
    transform: translateY(20px) scale(0.95);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

/* Header */
.agent-chat-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border-color);
}

.header-left {
  display: flex;
  align-items: center;
  gap: 14px;
}

.avatar {
  position: relative;
  width: 40px;
  height: 40px;
  border-radius: 12px;
  background: linear-gradient(135deg, var(--accent-secondary) 0%, var(--accent-primary) 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
}

.avatar-glow {
  position: absolute;
  inset: -4px;
  border-radius: 16px;
  background: linear-gradient(135deg, var(--accent-secondary), var(--accent-primary));
  opacity: 0.3;
  filter: blur(8px);
  animation: avatar-pulse 3s ease-in-out infinite;
}

@keyframes avatar-pulse {
  0%, 100% { opacity: 0.2; transform: scale(1); }
  50% { opacity: 0.4; transform: scale(1.1); }
}

.header-text h3 {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
  letter-spacing: -0.01em;
}

.header-text p {
  margin: 0;
  font-size: 12px;
  color: var(--text-muted);
  font-weight: 400;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 4px;
}

.icon-btn {
  width: 32px;
  height: 32px;
  border: none;
  background: transparent;
  color: var(--text-muted);
  border-radius: 8px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s ease;
}

.icon-btn:hover {
  background: var(--bg-tertiary);
  color: var(--text-primary);
}

.icon-btn.close:hover {
  background: var(--error-bg);
  color: var(--error);
}

/* Messages */
.agent-chat-messages {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  background: var(--bg-primary);
  scrollbar-width: thin;
  scrollbar-color: var(--bg-elevated) transparent;
}

.agent-chat-messages::-webkit-scrollbar {
  width: 6px;
}

.agent-chat-messages::-webkit-scrollbar-track {
  background: transparent;
}

.agent-chat-messages::-webkit-scrollbar-thumb {
  background: var(--bg-elevated);
  border-radius: 3px;
}

/* Examples Panel */
.examples-panel {
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: 14px;
  padding: 16px;
  animation: fade-in 0.3s ease;
}

@keyframes fade-in {
  from { opacity: 0; transform: translateY(-10px); }
  to { opacity: 1; transform: translateY(0); }
}

.examples-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
  color: var(--accent-primary);
  font-size: 13px;
  font-weight: 500;
}

.examples-panel ul {
  margin: 0;
  padding: 0;
  list-style: none;
}

.examples-panel li {
  padding: 10px 14px;
  margin: 4px 0;
  color: var(--text-secondary);
  font-size: 13px;
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.2s ease;
  border: 1px solid transparent;
}

.examples-panel li:hover {
  background: var(--bg-tertiary);
  border-color: var(--border-color);
  color: var(--text-primary);
}

/* Message Bubbles */
.message-wrapper {
  display: flex;
  animation: message-in 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

@keyframes message-in {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.message-wrapper.user {
  justify-content: flex-end;
}

.message-wrapper.assistant {
  justify-content: flex-start;
}

.message-bubble {
  border-radius: 18px;
  position: relative;
}

.message-bubble.user {
  max-width: 75%;
  background: linear-gradient(135deg, var(--accent-secondary) 0%, var(--accent-primary) 100%);
  border-bottom-right-radius: 6px;
  color: white;
}

.message-bubble.assistant {
  width: 100%;
  background: transparent;
  border: none;
  border-radius: 0;
}

.message-bubble.error {
  background: var(--error-bg);
  border: 1px solid rgba(239, 68, 68, 0.3);
  border-radius: 12px;
}

.message-bubble.loading {
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  padding: 14px 18px;
  display: flex;
  align-items: center;
  gap: 12px;
}

/* Typing Indicator */
.typing-indicator {
  display: flex;
  gap: 4px;
}

.typing-indicator span {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--accent-primary);
  animation: typing-bounce 1.4s ease-in-out infinite;
}

.typing-indicator span:nth-child(2) { animation-delay: 0.2s; }
.typing-indicator span:nth-child(3) { animation-delay: 0.4s; }

@keyframes typing-bounce {
  0%, 60%, 100% { transform: translateY(0); opacity: 0.4; }
  30% { transform: translateY(-6px); opacity: 1; }
}

.loading-text {
  font-size: 13px;
  color: var(--text-muted);
}

/* Status Steps */
.status-steps {
  padding: 14px 16px 8px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.status-step {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 12px;
  color: var(--text-muted);
}

.status-step.active {
  color: var(--text-secondary);
}

.status-step.completed {
  color: var(--success);
}

.spinner {
  width: 14px;
  height: 14px;
  border: 2px solid var(--border-color);
  border-top-color: var(--accent-primary);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* Confirm Dialog */
.confirm-dialog {
  padding: 16px;
}

.confirm-message {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  margin-bottom: 14px;
  color: var(--text-primary);
}

.confirm-message p {
  margin: 0;
  font-size: 14px;
  line-height: 1.5;
}

.confirm-message svg {
  color: var(--warning);
  flex-shrink: 0;
  margin-top: 2px;
}

.confirm-actions {
  display: flex;
  gap: 10px;
}

.confirm-btn {
  flex: 1;
  padding: 10px 16px;
  border: none;
  border-radius: 10px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
}

.confirm-btn.danger {
  background: var(--error);
  color: white;
}

.confirm-btn.danger:hover {
  filter: brightness(1.1);
}

.confirm-btn.secondary {
  background: var(--bg-tertiary);
  color: var(--text-primary);
  border: 1px solid var(--border-color);
}

.confirm-btn.secondary:hover {
  background: var(--bg-elevated);
}

/* Tool Calls */
.tool-calls {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding: 12px 14px 0;
}

.tool-badge {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  background: var(--success-bg);
  color: var(--success);
  font-size: 11px;
  font-weight: 500;
  padding: 5px 10px;
  border-radius: 20px;
}

/* Message Body */
.message-body {
  padding: 12px 16px;
}

.message-body.user {
  color: white;
}

.message-body.error {
  color: var(--error);
}

.message-body p {
  margin: 0;
  font-size: 14px;
  line-height: 1.6;
  white-space: pre-wrap;
}

.message-content {
  font-size: 14px;
  line-height: 1.6;
  white-space: pre-wrap;
  color: var(--text-primary);
}

.error-header {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 6px;
  color: var(--error);
  font-size: 12px;
  font-weight: 500;
}

.retry-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 8px 16px 12px;
  padding: 0;
  background: none;
  border: none;
  color: var(--warning);
  font-size: 12px;
  cursor: pointer;
}

.retry-btn:hover {
  text-decoration: underline;
}

/* Scroll to Bottom */
.scroll-to-bottom {
  position: sticky;
  bottom: 10px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  background: var(--bg-elevated);
  border: 1px solid var(--border-color);
  border-radius: 20px;
  color: var(--text-primary);
  font-size: 12px;
  cursor: pointer;
  box-shadow: 0 4px 12px rgba(0,0,0,0.2);
  transition: all 0.2s ease;
  animation: fade-in 0.2s ease;
}

.scroll-to-bottom:hover {
  background: var(--bg-tertiary);
  transform: translateX(-50%) translateY(-2px);
}

/* Input */
.agent-chat-input {
  padding: 16px 20px;
  background: var(--bg-secondary);
  border-top: 1px solid var(--border-color);
  position: relative;
}

.input-wrapper {
  display: flex;
  gap: 10px;
  position: relative;
  z-index: 1;
}

.input-wrapper input {
  flex: 1;
  padding: 14px 18px;
  background: var(--bg-tertiary);
  border: 1px solid var(--border-color);
  border-radius: 14px;
  color: var(--text-primary);
  font-size: 14px;
  outline: none;
  transition: all 0.2s ease;
}

.input-wrapper input::placeholder {
  color: var(--text-muted);
}

.input-wrapper input:focus {
  border-color: var(--accent-primary);
  box-shadow: 0 0 0 3px rgba(139, 92, 246, 0.15);
}

.input-wrapper input:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.send-btn {
  width: 48px;
  height: 48px;
  border-radius: 14px;
  border: none;
  background: linear-gradient(135deg, var(--accent-secondary) 0%, var(--accent-primary) 100%);
  color: white;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s ease;
  flex-shrink: 0;
}

.send-btn:hover:not(:disabled) {
  transform: scale(1.05);
  box-shadow: 0 4px 16px rgba(139, 92, 246, 0.4);
}

.send-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
  transform: none;
}

.input-glow {
  position: absolute;
  bottom: 0;
  left: 50%;
  transform: translateX(-50%);
  width: 60%;
  height: 1px;
  background: linear-gradient(90deg, transparent, var(--accent-primary), transparent);
  opacity: 0.5;
}
`;
function MessageIcon() {
  return /* @__PURE__ */ jsx("svg", { width: "24", height: "24", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", children: /* @__PURE__ */ jsx("path", { d: "M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" }) });
}
function SparklesIcon() {
  return /* @__PURE__ */ jsxs("svg", { width: "20", height: "20", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", children: [
    /* @__PURE__ */ jsx("path", { d: "M12 3v1m0 16v1m-9-9h1m16 0h1m-2.636-6.364l-.707.707M6.343 17.657l-.707.707m12.728 0l-.707-.707M6.343 6.343l-.707-.707" }),
    /* @__PURE__ */ jsx("circle", { cx: "12", cy: "12", r: "4" })
  ] });
}
function CloseIcon() {
  return /* @__PURE__ */ jsx("svg", { width: "18", height: "18", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", children: /* @__PURE__ */ jsx("path", { d: "M18 6L6 18M6 6l12 12" }) });
}
function MinimizeIcon() {
  return /* @__PURE__ */ jsx("svg", { width: "18", height: "18", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", children: /* @__PURE__ */ jsx("path", { d: "M5 12h14" }) });
}
function ExpandIcon() {
  return /* @__PURE__ */ jsx("svg", { width: "18", height: "18", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", children: /* @__PURE__ */ jsx("path", { d: "M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" }) });
}
function TrashIcon() {
  return /* @__PURE__ */ jsx("svg", { width: "16", height: "16", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", children: /* @__PURE__ */ jsx("path", { d: "M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" }) });
}
function SendIcon() {
  return /* @__PURE__ */ jsx("svg", { width: "20", height: "20", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", children: /* @__PURE__ */ jsx("path", { d: "M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" }) });
}
function CheckIcon({ size = 12 }) {
  return /* @__PURE__ */ jsx("svg", { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2.5", strokeLinecap: "round", strokeLinejoin: "round", children: /* @__PURE__ */ jsx("path", { d: "M20 6L9 17l-5-5" }) });
}
function AlertIcon({ size = 13 }) {
  return /* @__PURE__ */ jsx("svg", { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", children: /* @__PURE__ */ jsx("path", { d: "M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0zM12 9v4m0 4h.01" }) });
}
function ArrowDownIcon() {
  return /* @__PURE__ */ jsx("svg", { width: "12", height: "12", viewBox: "0 0 12 12", fill: "currentColor", children: /* @__PURE__ */ jsx("path", { d: "M6 9L1 4h10L6 9z" }) });
}
function RotateCcwIcon({ size = 11 }) {
  return /* @__PURE__ */ jsxs("svg", { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", children: [
    /* @__PURE__ */ jsx("path", { d: "M1 4v6h6M23 20v-6h-6" }),
    /* @__PURE__ */ jsx("path", { d: "M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15" })
  ] });
}
function LightbulbIcon() {
  return /* @__PURE__ */ jsx("svg", { width: "16", height: "16", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", children: /* @__PURE__ */ jsx("path", { d: "M9 18h6M10 22h4M15.09 14c.18-.98.65-1.74 1.41-2.5A4.65 4.65 0 0 0 18 8 6 6 0 0 0 6 8c0 1 .23 2.23 1.5 3.5A4.61 4.61 0 0 1 8.91 14" }) });
}

// src/react/AgentBuilder.tsx
import { useState as useState5, useCallback as useCallback5 } from "react";
import { jsx as jsx2, jsxs as jsxs2 } from "react/jsx-runtime";
var PROVIDER_PRESETS = {
  openai: { type: "openai", baseUrl: "https://api.openai.com/v1", model: "gpt-4o-mini" },
  anthropic: { type: "anthropic", baseUrl: "https://api.anthropic.com/v1", model: "claude-3-5-sonnet-latest" },
  zai: { type: "zai", baseUrl: "https://api.z.ai/api/paas/v4", model: "glm-4-flash" },
  groq: { type: "groq", baseUrl: "https://api.groq.com/openai/v1", model: "llama-3.1-70b-versatile" },
  custom: { type: "custom", baseUrl: "", model: "" }
};
function AgentBuilder({
  initialConfig,
  onExport,
  onSave,
  onTest
}) {
  const [activeTab, setActiveTab] = useState5("prompt");
  const [config, setConfig] = useState5({
    name: initialConfig?.name || "Meu Agent",
    systemPrompt: initialConfig?.systemPrompt || "",
    provider: initialConfig?.provider || {
      type: "openai",
      baseUrl: "https://api.openai.com/v1",
      apiKey: "",
      model: "gpt-4o-mini"
    },
    tools: initialConfig?.tools || [],
    mcpServers: initialConfig?.mcpServers || [],
    settings: initialConfig?.settings || { temperature: 0.7, maxIterations: 6, historySize: 20 }
  });
  const [editingTool, setEditingTool] = useState5(null);
  const [editingMcp, setEditingMcp] = useState5(null);
  const [testResult, setTestResult] = useState5({ status: "idle", message: "" });
  const updateConfig = useCallback5((updates) => {
    setConfig((prev) => ({ ...prev, ...updates }));
  }, []);
  const handleProviderTypeChange = (type) => {
    const preset = PROVIDER_PRESETS[type];
    updateConfig({ provider: { ...config.provider, ...preset, type } });
  };
  const addTool = () => {
    const newTool = {
      id: crypto.randomUUID(),
      name: "",
      description: "",
      parameters: { type: "object", properties: {}, required: [] },
      code: `async (args) => {
  // Sua l\xF3gica aqui
  return { success: true };
}`,
      awaitConfirm: false,
      confirmMessage: ""
    };
    setEditingTool(newTool);
  };
  const saveTool = (tool) => {
    if (!tool.name) return;
    setConfig((prev) => {
      const exists = prev.tools.find((t) => t.id === tool.id);
      if (exists) {
        return { ...prev, tools: prev.tools.map((t) => t.id === tool.id ? tool : t) };
      }
      return { ...prev, tools: [...prev.tools, tool] };
    });
    setEditingTool(null);
  };
  const deleteTool = (id) => {
    setConfig((prev) => ({ ...prev, tools: prev.tools.filter((t) => t.id !== id) }));
  };
  const addMcpServer = () => {
    const newServer = {
      id: crypto.randomUUID(),
      name: "Novo MCP Server",
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-filesystem", "./data"],
      env: {},
      enabled: true
    };
    setEditingMcp(newServer);
  };
  const saveMcpServer = (server) => {
    if (!server.name) return;
    setConfig((prev) => {
      const exists = prev.mcpServers.find((s) => s.id === server.id);
      if (exists) {
        return { ...prev, mcpServers: prev.mcpServers.map((s) => s.id === server.id ? server : s) };
      }
      return { ...prev, mcpServers: [...prev.mcpServers, server] };
    });
    setEditingMcp(null);
  };
  const deleteMcpServer = (id) => {
    setConfig((prev) => ({ ...prev, mcpServers: prev.mcpServers.filter((s) => s.id !== id) }));
  };
  const generateExportCode = () => {
    const toolsCode = config.tools.map((tool) => `  defineTool({
    name: '${tool.name}',
    description: '${tool.description}',
    parameters: ${JSON.stringify(tool.parameters, null, 4)},
    execute: ${tool.code},
    awaitConfirm: ${tool.awaitConfirm},${tool.awaitConfirm ? `
    confirmMessage: () => '${tool.confirmMessage}',` : ""}
  }),`).join("\n\n");
    const mcpCode = config.mcpServers.filter((s) => s.enabled).map((server) => `  // MCP: ${server.name}
  createMcpTools({
    command: '${server.command}',
    args: ${JSON.stringify(server.args)},
    env: ${JSON.stringify(server.env)},
    prefix: '${server.name.toLowerCase().replace(/\s+/g, "_")}_',
  }),`).join("\n\n");
    return `// Gerado por Agent Builder
import { createAgentRoute, defineTool } from '@guilherme/agent-sdk';
import { createMcpTools } from '@guilherme/agent-sdk/mcp';
import { z } from 'zod';

const tools = [
${toolsCode || "  // Adicione suas tools aqui"}
];

const mcpTools = await Promise.all([
${mcpCode || "  // Adicione MCP servers aqui"}
]);

export const POST = createAgentRoute({
  provider: {
    baseUrl: '${config.provider.baseUrl}',
    apiKey: process.env.AI_API_KEY!,
    model: '${config.provider.model}',
  },
  systemPrompt: \`${config.systemPrompt}\`,
  tools: [...tools, ...mcpTools.flat()],
  temperature: ${config.settings.temperature},
  maxIterations: ${config.settings.maxIterations},
  historySize: ${config.settings.historySize},
});
`;
  };
  const handleExport = () => {
    const code = generateExportCode();
    navigator.clipboard.writeText(code);
    onExport?.(config);
    setTestResult({ status: "success", message: "C\xF3digo copiado!" });
    setTimeout(() => setTestResult({ status: "idle", message: "" }), 2e3);
  };
  const handleTest = async () => {
    if (!onTest) return;
    setTestResult({ status: "loading", message: "Testando..." });
    try {
      await onTest(config);
      setTestResult({ status: "success", message: "Agent funcionando!" });
    } catch (error) {
      setTestResult({ status: "error", message: error instanceof Error ? error.message : "Erro ao testar" });
    }
  };
  return /* @__PURE__ */ jsxs2("div", { className: "agent-builder-container", children: [
    /* @__PURE__ */ jsxs2("header", { className: "builder-header", children: [
      /* @__PURE__ */ jsxs2("div", { className: "header-title", children: [
        /* @__PURE__ */ jsx2("div", { className: "agent-icon", children: /* @__PURE__ */ jsx2(BotIcon, {}) }),
        /* @__PURE__ */ jsx2(
          "input",
          {
            type: "text",
            value: config.name,
            onChange: (e) => updateConfig({ name: e.target.value }),
            className: "title-input",
            placeholder: "Nome do Agent"
          }
        )
      ] }),
      /* @__PURE__ */ jsxs2("div", { className: "header-actions", children: [
        testResult.status !== "idle" && /* @__PURE__ */ jsxs2("span", { className: `status-badge ${testResult.status}`, children: [
          testResult.status === "loading" && /* @__PURE__ */ jsx2(SpinnerIcon, {}),
          testResult.message
        ] }),
        onTest && /* @__PURE__ */ jsxs2("button", { onClick: handleTest, className: "btn secondary", children: [
          /* @__PURE__ */ jsx2(PlayIcon, {}),
          " Testar"
        ] }),
        /* @__PURE__ */ jsxs2("button", { onClick: handleExport, className: "btn secondary", children: [
          /* @__PURE__ */ jsx2(CopyIcon, {}),
          " Exportar"
        ] }),
        /* @__PURE__ */ jsxs2("button", { onClick: () => onSave?.(config), className: "btn primary", children: [
          /* @__PURE__ */ jsx2(SaveIcon, {}),
          " Salvar"
        ] })
      ] })
    ] }),
    /* @__PURE__ */ jsx2("nav", { className: "builder-tabs", children: ["prompt", "tools", "mcp", "settings"].map((tab) => /* @__PURE__ */ jsxs2(
      "button",
      {
        className: `tab ${activeTab === tab ? "active" : ""}`,
        onClick: () => setActiveTab(tab),
        children: [
          tab === "prompt" && /* @__PURE__ */ jsx2(FileTextIcon, {}),
          tab === "tools" && /* @__PURE__ */ jsx2(WrenchIcon, {}),
          tab === "mcp" && /* @__PURE__ */ jsx2(ServerIcon, {}),
          tab === "settings" && /* @__PURE__ */ jsx2(SettingsIcon, {}),
          /* @__PURE__ */ jsx2("span", { children: tab.charAt(0).toUpperCase() + tab.slice(1) }),
          tab === "tools" && config.tools.length > 0 && /* @__PURE__ */ jsx2("span", { className: "badge", children: config.tools.length }),
          tab === "mcp" && config.mcpServers.filter((s) => s.enabled).length > 0 && /* @__PURE__ */ jsx2("span", { className: "badge", children: config.mcpServers.filter((s) => s.enabled).length })
        ]
      },
      tab
    )) }),
    /* @__PURE__ */ jsxs2("main", { className: "builder-content", children: [
      activeTab === "prompt" && /* @__PURE__ */ jsxs2("div", { className: "tab-panel prompt-panel", children: [
        /* @__PURE__ */ jsxs2("div", { className: "form-section", children: [
          /* @__PURE__ */ jsx2("label", { children: "System Prompt" }),
          /* @__PURE__ */ jsx2(
            "textarea",
            {
              value: config.systemPrompt,
              onChange: (e) => updateConfig({ systemPrompt: e.target.value }),
              placeholder: "Voc\xEA \xE9 um assistente que ajuda com...",
              rows: 10
            }
          )
        ] }),
        /* @__PURE__ */ jsx2("div", { className: "form-row", children: /* @__PURE__ */ jsxs2("div", { className: "form-section", children: [
          /* @__PURE__ */ jsx2("label", { children: "Provider" }),
          /* @__PURE__ */ jsxs2("div", { className: "select-wrapper", children: [
            /* @__PURE__ */ jsxs2(
              "select",
              {
                value: config.provider.type,
                onChange: (e) => handleProviderTypeChange(e.target.value),
                children: [
                  /* @__PURE__ */ jsx2("option", { value: "openai", children: "OpenAI (GPT-4)" }),
                  /* @__PURE__ */ jsx2("option", { value: "anthropic", children: "Anthropic (Claude)" }),
                  /* @__PURE__ */ jsx2("option", { value: "zai", children: "Z.ai (GLM-4)" }),
                  /* @__PURE__ */ jsx2("option", { value: "groq", children: "Groq (Llama)" }),
                  /* @__PURE__ */ jsx2("option", { value: "custom", children: "Custom" })
                ]
              }
            ),
            /* @__PURE__ */ jsx2(ChevronDownIcon, {})
          ] })
        ] }) }),
        /* @__PURE__ */ jsxs2("div", { className: "form-row two-cols", children: [
          /* @__PURE__ */ jsxs2("div", { className: "form-section", children: [
            /* @__PURE__ */ jsx2("label", { children: "Base URL" }),
            /* @__PURE__ */ jsx2(
              "input",
              {
                value: config.provider.baseUrl,
                onChange: (e) => updateConfig({ provider: { ...config.provider, baseUrl: e.target.value } }),
                placeholder: "https://api.openai.com/v1"
              }
            )
          ] }),
          /* @__PURE__ */ jsxs2("div", { className: "form-section", children: [
            /* @__PURE__ */ jsx2("label", { children: "Model" }),
            /* @__PURE__ */ jsx2(
              "input",
              {
                value: config.provider.model,
                onChange: (e) => updateConfig({ provider: { ...config.provider, model: e.target.value } }),
                placeholder: "gpt-4o-mini"
              }
            )
          ] })
        ] }),
        /* @__PURE__ */ jsxs2("div", { className: "form-section", children: [
          /* @__PURE__ */ jsx2("label", { children: "API Key" }),
          /* @__PURE__ */ jsxs2("div", { className: "input-with-icon", children: [
            /* @__PURE__ */ jsx2(
              "input",
              {
                type: "password",
                value: config.provider.apiKey,
                onChange: (e) => updateConfig({ provider: { ...config.provider, apiKey: e.target.value } }),
                placeholder: "sk-..."
              }
            ),
            /* @__PURE__ */ jsx2(KeyIcon, {})
          ] })
        ] })
      ] }),
      activeTab === "tools" && /* @__PURE__ */ jsxs2("div", { className: "tab-panel", children: [
        /* @__PURE__ */ jsxs2("div", { className: "panel-header", children: [
          /* @__PURE__ */ jsx2("h3", { children: "Custom Tools" }),
          /* @__PURE__ */ jsxs2("button", { onClick: addTool, className: "btn primary small", children: [
            /* @__PURE__ */ jsx2(PlusIcon, {}),
            " Adicionar Tool"
          ] })
        ] }),
        config.tools.length === 0 ? /* @__PURE__ */ jsxs2("div", { className: "empty-state", children: [
          /* @__PURE__ */ jsx2(WrenchIcon, { size: 48 }),
          /* @__PURE__ */ jsx2("p", { children: "Nenhuma tool cadastrada" }),
          /* @__PURE__ */ jsx2("span", { children: 'Clique em "+ Adicionar Tool" para criar sua primeira tool' })
        ] }) : /* @__PURE__ */ jsx2("div", { className: "items-list", children: config.tools.map((tool) => /* @__PURE__ */ jsxs2("div", { className: "item-card", children: [
          /* @__PURE__ */ jsxs2("div", { className: "item-info", children: [
            /* @__PURE__ */ jsx2("div", { className: "item-icon", children: /* @__PURE__ */ jsx2(CodeIcon, {}) }),
            /* @__PURE__ */ jsxs2("div", { className: "item-details", children: [
              /* @__PURE__ */ jsx2("span", { className: "item-name", children: tool.name }),
              /* @__PURE__ */ jsx2("span", { className: "item-desc", children: tool.description || "Sem descri\xE7\xE3o" })
            ] })
          ] }),
          /* @__PURE__ */ jsxs2("div", { className: "item-actions", children: [
            tool.awaitConfirm && /* @__PURE__ */ jsx2("span", { className: "tag warning", children: "Confirma\xE7\xE3o" }),
            /* @__PURE__ */ jsx2("button", { onClick: () => setEditingTool(tool), className: "btn icon", children: /* @__PURE__ */ jsx2(EditIcon, {}) }),
            /* @__PURE__ */ jsx2("button", { onClick: () => deleteTool(tool.id), className: "btn icon danger", children: /* @__PURE__ */ jsx2(TrashIcon2, {}) })
          ] })
        ] }, tool.id)) })
      ] }),
      activeTab === "mcp" && /* @__PURE__ */ jsxs2("div", { className: "tab-panel", children: [
        /* @__PURE__ */ jsxs2("div", { className: "panel-header", children: [
          /* @__PURE__ */ jsx2("h3", { children: "MCP Servers" }),
          /* @__PURE__ */ jsxs2("button", { onClick: addMcpServer, className: "btn primary small", children: [
            /* @__PURE__ */ jsx2(PlusIcon, {}),
            " Adicionar Server"
          ] })
        ] }),
        config.mcpServers.length === 0 ? /* @__PURE__ */ jsxs2("div", { className: "empty-state", children: [
          /* @__PURE__ */ jsx2(ServerIcon, { size: 48 }),
          /* @__PURE__ */ jsx2("p", { children: "Nenhum MCP server configurado" }),
          /* @__PURE__ */ jsx2("span", { children: "Adicione MCP servers para expandir as capacidades do agent" })
        ] }) : /* @__PURE__ */ jsx2("div", { className: "items-list", children: config.mcpServers.map((server) => /* @__PURE__ */ jsxs2("div", { className: `item-card ${!server.enabled ? "disabled" : ""}`, children: [
          /* @__PURE__ */ jsxs2("div", { className: "item-info", children: [
            /* @__PURE__ */ jsxs2("label", { className: "toggle", children: [
              /* @__PURE__ */ jsx2(
                "input",
                {
                  type: "checkbox",
                  checked: server.enabled,
                  onChange: () => saveMcpServer({ ...server, enabled: !server.enabled })
                }
              ),
              /* @__PURE__ */ jsx2("span", { className: "toggle-slider" })
            ] }),
            /* @__PURE__ */ jsxs2("div", { className: "item-details", children: [
              /* @__PURE__ */ jsx2("span", { className: "item-name", children: server.name }),
              /* @__PURE__ */ jsxs2("span", { className: "item-desc mono", children: [
                server.command,
                " ",
                server.args.join(" ")
              ] })
            ] })
          ] }),
          /* @__PURE__ */ jsxs2("div", { className: "item-actions", children: [
            /* @__PURE__ */ jsx2("button", { onClick: () => setEditingMcp(server), className: "btn icon", children: /* @__PURE__ */ jsx2(EditIcon, {}) }),
            /* @__PURE__ */ jsx2("button", { onClick: () => deleteMcpServer(server.id), className: "btn icon danger", children: /* @__PURE__ */ jsx2(TrashIcon2, {}) })
          ] })
        ] }, server.id)) }),
        /* @__PURE__ */ jsxs2("div", { className: "presets-section", children: [
          /* @__PURE__ */ jsx2("h4", { children: "MCP Servers Populares" }),
          /* @__PURE__ */ jsx2("div", { className: "presets-grid", children: [
            { name: "Filesystem", args: "@modelcontextprotocol/server-filesystem ./data" },
            { name: "Postgres", args: "@modelcontextprotocol/server-postgres" },
            { name: "GitHub", args: "@modelcontextprotocol/server-github" },
            { name: "Slack", args: "@modelcontextprotocol/server-slack" },
            { name: "SQLite", args: "@modelcontextprotocol/server-sqlite" }
          ].map((preset) => /* @__PURE__ */ jsxs2(
            "button",
            {
              onClick: () => {
                setEditingMcp({
                  id: crypto.randomUUID(),
                  name: preset.name,
                  command: "npx",
                  args: ["-y", preset.args.split(" ")[0], ...preset.args.split(" ").slice(1) || []],
                  env: {},
                  enabled: true
                });
              },
              className: "preset-btn",
              children: [
                /* @__PURE__ */ jsx2(PlusIcon, { size: 14 }),
                " ",
                preset.name
              ]
            },
            preset.name
          )) })
        ] })
      ] }),
      activeTab === "settings" && /* @__PURE__ */ jsxs2("div", { className: "tab-panel settings-panel", children: [
        /* @__PURE__ */ jsxs2("div", { className: "setting-card", children: [
          /* @__PURE__ */ jsxs2("div", { className: "setting-header", children: [
            /* @__PURE__ */ jsx2("label", { children: "Temperature" }),
            /* @__PURE__ */ jsx2("span", { className: "setting-value", children: config.settings.temperature })
          ] }),
          /* @__PURE__ */ jsx2(
            "input",
            {
              type: "range",
              min: "0",
              max: "2",
              step: "0.1",
              value: config.settings.temperature,
              onChange: (e) => updateConfig({ settings: { ...config.settings, temperature: parseFloat(e.target.value) } }),
              className: "slider"
            }
          ),
          /* @__PURE__ */ jsxs2("div", { className: "slider-labels", children: [
            /* @__PURE__ */ jsx2("span", { children: "Preciso" }),
            /* @__PURE__ */ jsx2("span", { children: "Criativo" })
          ] })
        ] }),
        /* @__PURE__ */ jsxs2("div", { className: "setting-card", children: [
          /* @__PURE__ */ jsxs2("div", { className: "setting-header", children: [
            /* @__PURE__ */ jsx2("label", { children: "Max Iterations" }),
            /* @__PURE__ */ jsx2("span", { className: "setting-desc", children: "Tool calling loop" })
          ] }),
          /* @__PURE__ */ jsx2(
            "input",
            {
              type: "number",
              min: "1",
              max: "20",
              value: config.settings.maxIterations,
              onChange: (e) => updateConfig({ settings: { ...config.settings, maxIterations: parseInt(e.target.value) } }),
              className: "number-input"
            }
          )
        ] }),
        /* @__PURE__ */ jsxs2("div", { className: "setting-card", children: [
          /* @__PURE__ */ jsxs2("div", { className: "setting-header", children: [
            /* @__PURE__ */ jsx2("label", { children: "History Size" }),
            /* @__PURE__ */ jsx2("span", { className: "setting-desc", children: "Mensagens mantidas no contexto" })
          ] }),
          /* @__PURE__ */ jsx2(
            "input",
            {
              type: "number",
              min: "5",
              max: "100",
              value: config.settings.historySize,
              onChange: (e) => updateConfig({ settings: { ...config.settings, historySize: parseInt(e.target.value) } }),
              className: "number-input"
            }
          )
        ] })
      ] })
    ] }),
    editingTool && /* @__PURE__ */ jsx2("div", { className: "modal-overlay", onClick: () => setEditingTool(null), children: /* @__PURE__ */ jsxs2("div", { className: "modal", onClick: (e) => e.stopPropagation(), children: [
      /* @__PURE__ */ jsxs2("div", { className: "modal-header", children: [
        /* @__PURE__ */ jsxs2("h3", { children: [
          config.tools.find((t) => t.id === editingTool.id) ? "Editar" : "Nova",
          " Tool"
        ] }),
        /* @__PURE__ */ jsx2("button", { onClick: () => setEditingTool(null), className: "btn icon", children: /* @__PURE__ */ jsx2(CloseIcon2, {}) })
      ] }),
      /* @__PURE__ */ jsxs2("div", { className: "modal-body", children: [
        /* @__PURE__ */ jsxs2("div", { className: "form-section", children: [
          /* @__PURE__ */ jsx2("label", { children: "Nome *" }),
          /* @__PURE__ */ jsx2(
            "input",
            {
              value: editingTool.name,
              onChange: (e) => setEditingTool({ ...editingTool, name: e.target.value }),
              placeholder: "create_booking",
              className: "mono"
            }
          )
        ] }),
        /* @__PURE__ */ jsxs2("div", { className: "form-section", children: [
          /* @__PURE__ */ jsx2("label", { children: "Descri\xE7\xE3o *" }),
          /* @__PURE__ */ jsx2(
            "input",
            {
              value: editingTool.description,
              onChange: (e) => setEditingTool({ ...editingTool, description: e.target.value }),
              placeholder: "Cria um novo agendamento"
            }
          )
        ] }),
        /* @__PURE__ */ jsxs2("div", { className: "form-section", children: [
          /* @__PURE__ */ jsx2("label", { children: "C\xF3digo (execute function)" }),
          /* @__PURE__ */ jsx2(
            "textarea",
            {
              value: editingTool.code,
              onChange: (e) => setEditingTool({ ...editingTool, code: e.target.value }),
              placeholder: "async (args) => { return { success: true }; }",
              className: "code-editor",
              rows: 8
            }
          )
        ] }),
        /* @__PURE__ */ jsxs2("label", { className: "checkbox-label", children: [
          /* @__PURE__ */ jsx2(
            "input",
            {
              type: "checkbox",
              checked: editingTool.awaitConfirm,
              onChange: (e) => setEditingTool({ ...editingTool, awaitConfirm: e.target.checked })
            }
          ),
          /* @__PURE__ */ jsx2("span", { className: "checkbox-custom" }),
          /* @__PURE__ */ jsx2("span", { children: "Exige confirma\xE7\xE3o do usu\xE1rio" })
        ] }),
        editingTool.awaitConfirm && /* @__PURE__ */ jsxs2("div", { className: "form-section", children: [
          /* @__PURE__ */ jsx2("label", { children: "Mensagem de Confirma\xE7\xE3o" }),
          /* @__PURE__ */ jsx2(
            "input",
            {
              value: editingTool.confirmMessage,
              onChange: (e) => setEditingTool({ ...editingTool, confirmMessage: e.target.value }),
              placeholder: "Tem certeza que deseja executar esta a\xE7\xE3o?"
            }
          )
        ] })
      ] }),
      /* @__PURE__ */ jsxs2("div", { className: "modal-footer", children: [
        /* @__PURE__ */ jsx2("button", { onClick: () => setEditingTool(null), className: "btn secondary", children: "Cancelar" }),
        /* @__PURE__ */ jsx2("button", { onClick: () => saveTool(editingTool), className: "btn primary", children: "Salvar" })
      ] })
    ] }) }),
    editingMcp && /* @__PURE__ */ jsx2("div", { className: "modal-overlay", onClick: () => setEditingMcp(null), children: /* @__PURE__ */ jsxs2("div", { className: "modal", onClick: (e) => e.stopPropagation(), children: [
      /* @__PURE__ */ jsxs2("div", { className: "modal-header", children: [
        /* @__PURE__ */ jsxs2("h3", { children: [
          config.mcpServers.find((s) => s.id === editingMcp.id) ? "Editar" : "Novo",
          " MCP Server"
        ] }),
        /* @__PURE__ */ jsx2("button", { onClick: () => setEditingMcp(null), className: "btn icon", children: /* @__PURE__ */ jsx2(CloseIcon2, {}) })
      ] }),
      /* @__PURE__ */ jsxs2("div", { className: "modal-body", children: [
        /* @__PURE__ */ jsxs2("div", { className: "form-section", children: [
          /* @__PURE__ */ jsx2("label", { children: "Nome *" }),
          /* @__PURE__ */ jsx2(
            "input",
            {
              value: editingMcp.name,
              onChange: (e) => setEditingMcp({ ...editingMcp, name: e.target.value }),
              placeholder: "Filesystem"
            }
          )
        ] }),
        /* @__PURE__ */ jsxs2("div", { className: "form-section", children: [
          /* @__PURE__ */ jsx2("label", { children: "Comando" }),
          /* @__PURE__ */ jsx2(
            "input",
            {
              value: editingMcp.command,
              onChange: (e) => setEditingMcp({ ...editingMcp, command: e.target.value }),
              placeholder: "npx",
              className: "mono"
            }
          )
        ] }),
        /* @__PURE__ */ jsxs2("div", { className: "form-section", children: [
          /* @__PURE__ */ jsx2("label", { children: "Argumentos (separados por espa\xE7o)" }),
          /* @__PURE__ */ jsx2(
            "input",
            {
              value: editingMcp.args.join(" "),
              onChange: (e) => setEditingMcp({ ...editingMcp, args: e.target.value.split(" ").filter(Boolean) }),
              placeholder: "-y @modelcontextprotocol/server-filesystem ./data",
              className: "mono"
            }
          )
        ] }),
        /* @__PURE__ */ jsxs2("div", { className: "form-section", children: [
          /* @__PURE__ */ jsx2("label", { children: "Environment Variables (KEY=value, uma por linha)" }),
          /* @__PURE__ */ jsx2(
            "textarea",
            {
              value: Object.entries(editingMcp.env).map(([k, v]) => `${k}=${v}`).join("\n"),
              onChange: (e) => {
                const env = {};
                e.target.value.split("\n").forEach((line) => {
                  const [key, ...vals] = line.split("=");
                  if (key?.trim()) env[key.trim()] = vals.join("=").trim();
                });
                setEditingMcp({ ...editingMcp, env });
              },
              placeholder: "GITHUB_TOKEN=xxx\nAPI_KEY=yyy",
              className: "mono",
              rows: 4
            }
          )
        ] })
      ] }),
      /* @__PURE__ */ jsxs2("div", { className: "modal-footer", children: [
        /* @__PURE__ */ jsx2("button", { onClick: () => setEditingMcp(null), className: "btn secondary", children: "Cancelar" }),
        /* @__PURE__ */ jsx2("button", { onClick: () => saveMcpServer(editingMcp), className: "btn primary", children: "Salvar" })
      ] })
    ] }) }),
    /* @__PURE__ */ jsx2("style", { children: builderStyles })
  ] });
}
var builderStyles = `
.agent-builder-container {
  --bg-primary: #0a0a0f;
  --bg-secondary: #12121a;
  --bg-tertiary: #1a1a24;
  --bg-elevated: #22222e;
  --bg-hover: #2a2a36;
  --text-primary: #f4f4f5;
  --text-secondary: #a1a1aa;
  --text-muted: #71717a;
  --accent-primary: #8b5cf6;
  --accent-secondary: #6366f1;
  --accent-tertiary: #a855f7;
  --accent-glow: rgba(139, 92, 246, 0.15);
  --border-color: rgba(255,255,255,0.08);
  --border-subtle: rgba(255,255,255,0.04);
  --success: #10b981;
  --success-bg: rgba(16, 185, 129, 0.15);
  --error: #ef4444;
  --error-bg: rgba(239, 68, 68, 0.15);
  --warning: #f59e0b;
  --warning-bg: rgba(245, 158, 11, 0.15);

  font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--bg-primary);
  color: var(--text-primary);
  border-radius: 16px;
  overflow: hidden;
}

/* Header */
.builder-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 24px;
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border-color);
}

.header-title {
  display: flex;
  align-items: center;
  gap: 14px;
}

.agent-icon {
  width: 40px;
  height: 40px;
  border-radius: 12px;
  background: linear-gradient(135deg, var(--accent-secondary) 0%, var(--accent-primary) 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
}

.title-input {
  background: transparent;
  border: none;
  font-size: 18px;
  font-weight: 600;
  color: var(--text-primary);
  outline: none;
  padding: 4px 8px;
  border-radius: 6px;
  transition: background 0.2s;
}

.title-input:hover {
  background: var(--bg-tertiary);
}

.title-input:focus {
  background: var(--bg-tertiary);
  box-shadow: 0 0 0 2px var(--accent-glow);
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}

.status-badge {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 500;
  animation: fade-in 0.2s ease;
}

.status-badge.success {
  background: var(--success-bg);
  color: var(--success);
}

.status-badge.error {
  background: var(--error-bg);
  color: var(--error);
}

.status-badge.loading {
  background: var(--accent-glow);
  color: var(--accent-primary);
}

@keyframes fade-in {
  from { opacity: 0; transform: translateY(-4px); }
  to { opacity: 1; transform: translateY(0); }
}

/* Buttons */
.btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 10px 18px;
  border-radius: 10px;
  border: none;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
}

.btn.primary {
  background: linear-gradient(135deg, var(--accent-secondary) 0%, var(--accent-primary) 100%);
  color: white;
}

.btn.primary:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 16px rgba(139, 92, 246, 0.3);
}

.btn.secondary {
  background: var(--bg-tertiary);
  color: var(--text-primary);
  border: 1px solid var(--border-color);
}

.btn.secondary:hover {
  background: var(--bg-hover);
  border-color: rgba(255,255,255,0.12);
}

.btn.small {
  padding: 8px 14px;
  font-size: 13px;
}

.btn.icon {
  padding: 8px;
  background: transparent;
  border: none;
  color: var(--text-muted);
}

.btn.icon:hover {
  background: var(--bg-tertiary);
  color: var(--text-primary);
}

.btn.icon.danger:hover {
  background: var(--error-bg);
  color: var(--error);
}

/* Tabs */
.builder-tabs {
  display: flex;
  gap: 4px;
  padding: 12px 20px;
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border-color);
}

.tab {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px;
  border-radius: 10px;
  border: none;
  background: transparent;
  color: var(--text-muted);
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
  position: relative;
}

.tab:hover {
  background: var(--bg-tertiary);
  color: var(--text-secondary);
}

.tab.active {
  background: var(--accent-glow);
  color: var(--accent-primary);
}

.tab .badge {
  padding: 2px 7px;
  border-radius: 10px;
  background: var(--accent-primary);
  color: white;
  font-size: 11px;
  font-weight: 600;
}

/* Content */
.builder-content {
  flex: 1;
  overflow-y: auto;
  padding: 24px;
}

.tab-panel {
  animation: panel-in 0.3s ease;
}

@keyframes panel-in {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.panel-header h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
}

/* Form Elements */
.form-section {
  margin-bottom: 20px;
}

.form-section label {
  display: block;
  margin-bottom: 8px;
  font-size: 13px;
  font-weight: 500;
  color: var(--text-secondary);
}

.form-section input,
.form-section textarea,
.form-section select {
  width: 100%;
  padding: 12px 16px;
  background: var(--bg-tertiary);
  border: 1px solid var(--border-color);
  border-radius: 10px;
  color: var(--text-primary);
  font-size: 14px;
  outline: none;
  transition: all 0.2s ease;
}

.form-section input:focus,
.form-section textarea:focus,
.form-section select:focus {
  border-color: var(--accent-primary);
  box-shadow: 0 0 0 3px var(--accent-glow);
}

.form-section textarea {
  resize: vertical;
  min-height: 120px;
  font-family: inherit;
  line-height: 1.6;
}

.form-section .mono,
.mono {
  font-family: 'JetBrains Mono', 'Fira Code', monospace;
  font-size: 13px;
}

.form-row {
  margin-bottom: 20px;
}

.form-row.two-cols {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}

.select-wrapper {
  position: relative;
}

.select-wrapper select {
  appearance: none;
  padding-right: 40px;
}

.select-wrapper svg {
  position: absolute;
  right: 14px;
  top: 50%;
  transform: translateY(-50%);
  color: var(--text-muted);
  pointer-events: none;
}

.input-with-icon {
  position: relative;
}

.input-with-icon input {
  padding-right: 44px;
}

.input-with-icon svg {
  position: absolute;
  right: 14px;
  top: 50%;
  transform: translateY(-50%);
  color: var(--text-muted);
}

/* Empty State */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 48px 24px;
  text-align: center;
  background: var(--bg-secondary);
  border: 1px dashed var(--border-color);
  border-radius: 14px;
  color: var(--text-muted);
}

.empty-state svg {
  margin-bottom: 16px;
  opacity: 0.5;
}

.empty-state p {
  margin: 0 0 4px;
  font-size: 15px;
  color: var(--text-secondary);
}

.empty-state span {
  font-size: 13px;
}

/* Items List */
.items-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.item-card {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 14px 16px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  transition: all 0.2s ease;
}

.item-card:hover {
  border-color: rgba(255,255,255,0.12);
  background: var(--bg-tertiary);
}

.item-card.disabled {
  opacity: 0.5;
}

.item-info {
  display: flex;
  align-items: center;
  gap: 14px;
}

.item-icon {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  background: var(--accent-glow);
  color: var(--accent-primary);
  display: flex;
  align-items: center;
  justify-content: center;
}

.item-details {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.item-name {
  font-weight: 500;
  font-size: 14px;
}

.item-desc {
  font-size: 12px;
  color: var(--text-muted);
}

.item-desc.mono {
  font-family: 'JetBrains Mono', monospace;
  font-size: 11px;
}

.item-actions {
  display: flex;
  align-items: center;
  gap: 6px;
}

.tag {
  padding: 4px 10px;
  border-radius: 6px;
  font-size: 11px;
  font-weight: 500;
}

.tag.warning {
  background: var(--warning-bg);
  color: var(--warning);
}

/* Toggle */
.toggle {
  position: relative;
  display: inline-block;
  width: 44px;
  height: 24px;
  cursor: pointer;
}

.toggle input {
  opacity: 0;
  width: 0;
  height: 0;
}

.toggle-slider {
  position: absolute;
  inset: 0;
  background: var(--bg-elevated);
  border-radius: 12px;
  transition: all 0.2s ease;
}

.toggle-slider::before {
  content: '';
  position: absolute;
  width: 18px;
  height: 18px;
  left: 3px;
  top: 3px;
  background: var(--text-muted);
  border-radius: 50%;
  transition: all 0.2s ease;
}

.toggle input:checked + .toggle-slider {
  background: var(--accent-primary);
}

.toggle input:checked + .toggle-slider::before {
  transform: translateX(20px);
  background: white;
}

/* Presets */
.presets-section {
  margin-top: 32px;
  padding: 20px;
  background: var(--bg-secondary);
  border-radius: 12px;
  border: 1px solid var(--border-color);
}

.presets-section h4 {
  margin: 0 0 16px;
  font-size: 14px;
  font-weight: 500;
}

.presets-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.preset-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  background: var(--bg-tertiary);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  color: var(--text-secondary);
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.preset-btn:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
  border-color: rgba(255,255,255,0.12);
}

/* Settings Panel */
.settings-panel {
  max-width: 500px;
}

.setting-card {
  padding: 20px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  margin-bottom: 16px;
}

.setting-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 12px;
}

.setting-header label {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-primary);
}

.setting-value {
  font-size: 14px;
  font-weight: 600;
  color: var(--accent-primary);
  font-family: 'JetBrains Mono', monospace;
}

.setting-desc {
  font-size: 12px;
  color: var(--text-muted);
}

.slider {
  width: 100%;
  height: 6px;
  appearance: none;
  background: var(--bg-elevated);
  border-radius: 3px;
  outline: none;
}

.slider::-webkit-slider-thumb {
  appearance: none;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: var(--accent-primary);
  cursor: pointer;
  box-shadow: 0 2px 8px rgba(139, 92, 246, 0.4);
  transition: transform 0.2s;
}

.slider::-webkit-slider-thumb:hover {
  transform: scale(1.1);
}

.slider-labels {
  display: flex;
  justify-content: space-between;
  margin-top: 8px;
  font-size: 12px;
  color: var(--text-muted);
}

.number-input {
  width: 100px;
  padding: 10px 14px;
  background: var(--bg-tertiary);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  color: var(--text-primary);
  font-size: 14px;
  font-family: 'JetBrains Mono', monospace;
  outline: none;
}

.number-input:focus {
  border-color: var(--accent-primary);
  box-shadow: 0 0 0 3px var(--accent-glow);
}

/* Checkbox */
.checkbox-label {
  display: flex;
  align-items: center;
  gap: 12px;
  cursor: pointer;
  font-size: 14px;
  color: var(--text-primary);
}

.checkbox-label input {
  display: none;
}

.checkbox-custom {
  width: 20px;
  height: 20px;
  border: 2px solid var(--border-color);
  border-radius: 6px;
  position: relative;
  transition: all 0.2s ease;
}

.checkbox-label input:checked + .checkbox-custom {
  background: var(--accent-primary);
  border-color: var(--accent-primary);
}

.checkbox-label input:checked + .checkbox-custom::after {
  content: '';
  position: absolute;
  left: 6px;
  top: 2px;
  width: 5px;
  height: 10px;
  border: solid white;
  border-width: 0 2px 2px 0;
  transform: rotate(45deg);
}

/* Modal */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.7);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  animation: fade-in 0.2s ease;
}

.modal {
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: 16px;
  width: 100%;
  max-width: 560px;
  max-height: 90vh;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  animation: modal-in 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

@keyframes modal-in {
  from { opacity: 0; transform: scale(0.95) translateY(10px); }
  to { opacity: 1; transform: scale(1) translateY(0); }
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px 24px;
  border-bottom: 1px solid var(--border-color);
}

.modal-header h3 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
}

.modal-body {
  padding: 24px;
  overflow-y: auto;
}

.modal-body .form-section {
  margin-bottom: 20px;
}

.modal-body .code-editor {
  font-family: 'JetBrains Mono', 'Fira Code', monospace;
  font-size: 13px;
  line-height: 1.6;
  background: var(--bg-primary);
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding: 16px 24px;
  border-top: 1px solid var(--border-color);
  background: var(--bg-secondary);
}

/* Scrollbar */
.agent-builder-container ::-webkit-scrollbar {
  width: 8px;
}

.agent-builder-container ::-webkit-scrollbar-track {
  background: transparent;
}

.agent-builder-container ::-webkit-scrollbar-thumb {
  background: var(--bg-elevated);
  border-radius: 4px;
}

.agent-builder-container ::-webkit-scrollbar-thumb:hover {
  background: var(--bg-hover);
}
`;
function BotIcon() {
  return /* @__PURE__ */ jsxs2("svg", { width: "20", height: "20", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", children: [
    /* @__PURE__ */ jsx2("rect", { x: "3", y: "11", width: "18", height: "10", rx: "2" }),
    /* @__PURE__ */ jsx2("circle", { cx: "12", cy: "5", r: "2" }),
    /* @__PURE__ */ jsx2("path", { d: "M12 7v4M8 16h0M16 16h0" })
  ] });
}
function SaveIcon() {
  return /* @__PURE__ */ jsxs2("svg", { width: "16", height: "16", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", children: [
    /* @__PURE__ */ jsx2("path", { d: "M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" }),
    /* @__PURE__ */ jsx2("polyline", { points: "17 21 17 13 7 13 7 21" }),
    /* @__PURE__ */ jsx2("polyline", { points: "7 3 7 8 15 8" })
  ] });
}
function CopyIcon() {
  return /* @__PURE__ */ jsxs2("svg", { width: "16", height: "16", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", children: [
    /* @__PURE__ */ jsx2("rect", { x: "9", y: "9", width: "13", height: "13", rx: "2", ry: "2" }),
    /* @__PURE__ */ jsx2("path", { d: "M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" })
  ] });
}
function PlayIcon() {
  return /* @__PURE__ */ jsx2("svg", { width: "16", height: "16", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", children: /* @__PURE__ */ jsx2("polygon", { points: "5 3 19 12 5 21 5 3" }) });
}
function SpinnerIcon() {
  return /* @__PURE__ */ jsxs2("svg", { width: "14", height: "14", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2.5", strokeLinecap: "round", className: "spinner-icon", children: [
    /* @__PURE__ */ jsx2("path", { d: "M21 12a9 9 0 1 1-6.219-8.56" }),
    /* @__PURE__ */ jsx2("style", { children: `.spinner-icon { animation: spin 1s linear infinite; } @keyframes spin { to { transform: rotate(360deg); } }` })
  ] });
}
function FileTextIcon() {
  return /* @__PURE__ */ jsxs2("svg", { width: "16", height: "16", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", children: [
    /* @__PURE__ */ jsx2("path", { d: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" }),
    /* @__PURE__ */ jsx2("polyline", { points: "14 2 14 8 20 8" }),
    /* @__PURE__ */ jsx2("line", { x1: "16", y1: "13", x2: "8", y2: "13" }),
    /* @__PURE__ */ jsx2("line", { x1: "16", y1: "17", x2: "8", y2: "17" })
  ] });
}
function WrenchIcon({ size = 16 }) {
  return /* @__PURE__ */ jsx2("svg", { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", children: /* @__PURE__ */ jsx2("path", { d: "M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" }) });
}
function ServerIcon({ size = 16 }) {
  return /* @__PURE__ */ jsxs2("svg", { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", children: [
    /* @__PURE__ */ jsx2("rect", { x: "2", y: "2", width: "20", height: "8", rx: "2", ry: "2" }),
    /* @__PURE__ */ jsx2("rect", { x: "2", y: "14", width: "20", height: "8", rx: "2", ry: "2" }),
    /* @__PURE__ */ jsx2("line", { x1: "6", y1: "6", x2: "6.01", y2: "6" }),
    /* @__PURE__ */ jsx2("line", { x1: "6", y1: "18", x2: "6.01", y2: "18" })
  ] });
}
function SettingsIcon() {
  return /* @__PURE__ */ jsxs2("svg", { width: "16", height: "16", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", children: [
    /* @__PURE__ */ jsx2("circle", { cx: "12", cy: "12", r: "3" }),
    /* @__PURE__ */ jsx2("path", { d: "M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" })
  ] });
}
function PlusIcon({ size = 16 }) {
  return /* @__PURE__ */ jsxs2("svg", { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", children: [
    /* @__PURE__ */ jsx2("line", { x1: "12", y1: "5", x2: "12", y2: "19" }),
    /* @__PURE__ */ jsx2("line", { x1: "5", y1: "12", x2: "19", y2: "12" })
  ] });
}
function EditIcon() {
  return /* @__PURE__ */ jsxs2("svg", { width: "16", height: "16", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", children: [
    /* @__PURE__ */ jsx2("path", { d: "M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" }),
    /* @__PURE__ */ jsx2("path", { d: "M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" })
  ] });
}
function TrashIcon2() {
  return /* @__PURE__ */ jsxs2("svg", { width: "16", height: "16", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", children: [
    /* @__PURE__ */ jsx2("polyline", { points: "3 6 5 6 21 6" }),
    /* @__PURE__ */ jsx2("path", { d: "M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" })
  ] });
}
function CodeIcon() {
  return /* @__PURE__ */ jsxs2("svg", { width: "16", height: "16", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", children: [
    /* @__PURE__ */ jsx2("polyline", { points: "16 18 22 12 16 6" }),
    /* @__PURE__ */ jsx2("polyline", { points: "8 6 2 12 8 18" })
  ] });
}
function KeyIcon() {
  return /* @__PURE__ */ jsx2("svg", { width: "16", height: "16", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", children: /* @__PURE__ */ jsx2("path", { d: "M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" }) });
}
function ChevronDownIcon() {
  return /* @__PURE__ */ jsx2("svg", { width: "16", height: "16", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", children: /* @__PURE__ */ jsx2("polyline", { points: "6 9 12 15 18 9" }) });
}
function CloseIcon2() {
  return /* @__PURE__ */ jsxs2("svg", { width: "18", height: "18", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", children: [
    /* @__PURE__ */ jsx2("line", { x1: "18", y1: "6", x2: "6", y2: "18" }),
    /* @__PURE__ */ jsx2("line", { x1: "6", y1: "6", x2: "18", y2: "18" })
  ] });
}
export {
  AgentBuilder,
  AgentChat,
  useAgentChat,
  useChat,
  useCompletion
};
//# sourceMappingURL=index.js.map
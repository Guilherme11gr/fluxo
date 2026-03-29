import { AI_MODEL_CHAT } from '@/config/ai.config';

export interface AgentChatProviderConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
  headers?: Record<string, string>;
}

export class AgentChatProviderConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AgentChatProviderConfigError';
  }
}

function parseHeaders(rawHeaders: string | undefined): Record<string, string> | undefined {
  if (!rawHeaders) {
    return undefined;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawHeaders) as unknown;
  } catch {
    throw new AgentChatProviderConfigError('FLUXO_CHAT_API_HEADERS deve ser um JSON válido');
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new AgentChatProviderConfigError('FLUXO_CHAT_API_HEADERS deve ser um objeto JSON simples');
  }

  const headers = Object.entries(parsed).reduce<Record<string, string>>((acc, [key, value]) => {
    if (typeof value === 'string') {
      acc[key] = value;
    }

    return acc;
  }, {});

  return Object.keys(headers).length > 0 ? headers : undefined;
}

export function getAgentChatProviderConfig(): AgentChatProviderConfig {
  const apiKey =
    process.env.FLUXO_CHAT_API_KEY?.trim() ||
    process.env.ZAI_API_KEY?.trim() ||
    process.env.DEEPSEEK_API_KEY?.trim() ||
    '';

  if (!apiKey) {
    throw new AgentChatProviderConfigError(
      'Configure FLUXO_CHAT_API_KEY, ZAI_API_KEY ou DEEPSEEK_API_KEY para habilitar o chat com agent.'
    );
  }

  return {
    baseUrl:
      process.env.FLUXO_CHAT_API_URL?.trim() ||
      process.env.ZAI_API_URL?.trim() ||
      process.env.DEEPSEEK_API_URL?.trim() ||
      'https://api.deepseek.com',
    apiKey,
    model:
      process.env.FLUXO_CHAT_MODEL?.trim() ||
      process.env.ZAI_MODEL?.trim() ||
      AI_MODEL_CHAT,
    headers: parseHeaders(process.env.FLUXO_CHAT_API_HEADERS),
  };
}

import { NextRequest, NextResponse } from 'next/server';

const GATEWAY_URL = process.env.OPENCLAW_GATEWAY_URL || 'http://127.0.0.1:18789';
const GATEWAY_TOKEN = process.env.GATEWAY_TOKEN || '';

// POST - Enviar mensagem para Luna (OpenClaw Gateway)
export async function POST(request: NextRequest) {
  try {
    const { message, conversationHistory } = await request.json();
    
    if (!message) {
      return NextResponse.json({ error: 'message required' }, { status: 400 });
    }

    // Contexto para Luna
    const systemContext = `Você é a Luna, assistente geral do Jira Killer.

Regras:
- Responda em português brasileiro
- Use 🌙 no início das respostas
- Seja concisa mas útil
- Use markdown para formatação
- Se falar de tasks, use IDs (ex: JKILL-260)

Projetos disponíveis: AGQ, JKILL, LOJINHA, CCIA`;

    const fullMessage = `${systemContext}\n\nUsuário: ${message}`;

    // Chamar OpenClaw Gateway RPC
    const response = await fetch(`${GATEWAY_URL}/rpc`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(GATEWAY_TOKEN && { 'Authorization': `Bearer ${GATEWAY_TOKEN}` })
      },
      body: JSON.stringify({
        sessionKey: 'main',
        message: fullMessage,
        options: {
          stream: false,
          includeHistory: false
        }
      })
    });

    if (!response.ok) {
      // Fallback se gateway não disponível
      return NextResponse.json({
        messageId: `luna-fallback-${Date.now()}`,
        status: 'completed',
        reply: `🌙 Gateway offline, mas tô aqui!

O OpenClaw Gateway não está respondendo. Verifica se está rodando:

\`\`\`bash
openclaw gateway status
\`\`\`

Por enquanto, meus superpoderes estão limitados. Mas posso ajudar com o básico!`,
        source: 'fallback'
      });
    }

    const data = await response.json();
    
    return NextResponse.json({
      messageId: `luna-${Date.now()}`,
      status: 'completed',
      reply: data.response || data.message || data.reply || '🌙 Processado!',
      source: 'gateway'
    });

  } catch (error) {
    console.error('[Luna Gateway] Erro:', error);
    return NextResponse.json({
      messageId: `luna-error-${Date.now()}`,
      status: 'completed',
      reply: `🌙 Tive um problema técnico.

Erro: ${error instanceof Error ? error.message : 'Desconhecido'}

Tenta de novo?`,
      source: 'error'
    });
  }
}

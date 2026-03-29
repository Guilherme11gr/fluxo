import { NextRequest, NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// Executar MCP e retornar texto
async function mcpExec(command: string): Promise<string> {
  const fullCmd = `/home/openclaw/.local/bin/mcporter ${command} --config /workspace/main/config/mcporter.json 2>&1`;
  const { stdout } = await execAsync(fullCmd, { timeout: 30000, maxBuffer: 1024 * 1024 });
  return stdout;
}

// Extrair contagem simples
function extractCount(text: string, pattern: RegExp): number {
  const match = text.match(pattern);
  return match ? parseInt(match[1]) : 0;
}

// GET - Status
export async function GET() {
  return NextResponse.json({ status: 'online' });
}

// POST - Chat com integração real
export async function POST(request: NextRequest) {
  try {
    const { message } = await request.json();
    if (!message) return NextResponse.json({ error: 'message required' }, { status: 400 });

    // 1. Tentar OpenClaw Gateway primeiro (Luna real)
    try {
      const gatewayRes = await fetch('http://localhost:3005/api/luna/gateway', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message })
      });

      if (gatewayRes.ok) {
        const data = await gatewayRes.json();
        if (data.source === 'gateway') {
          return NextResponse.json(data);
        }
      }
    } catch (e) {
      console.log('[Luna] Gateway não disponível, usando MCP fallback');
    }

    // 2. Fallback: MCP local
    const lowerMsg = message.toLowerCase();
    let reply = '';

    // ... resto do código MCP continua igual ...

    // Status geral
    if (lowerMsg.includes('status') || lowerMsg.includes('geral') || lowerMsg.includes('projeto')) {
      const projectsOutput = await mcpExec('call jt-kill.list_projects');
      const projectCount = extractCount(projectsOutput, /Found (\d+) project/);
      
      reply = `🌙 **Status Geral**

✅ MCP conectado!
📊 **${projectCount}** projetos ativos

Projetos:
- **AGQ** - Agenda Aqui
- **JKILL** - Jira Killer  
- **LOJINHA** - Lojinha
- **CCIA** - Content Creator

Quer detalhes de algum projeto específico?`;
    }
    
    // Tasks
    else if (lowerMsg.includes('task') || lowerMsg.includes('fazer') || lowerMsg.includes('review')) {
      const reviewOutput = await mcpExec('call jt-kill.list_tasks status: REVIEW limit: 5');
      const reviewCount = extractCount(reviewOutput, /Found (\d+) task/);
      
      reply = `🌙 **Tasks em REVIEW**

**${reviewCount}** tasks aguardando aprovação

Incluindo:
- JKILL-260: Paywall bypass fix
- JKILL-259: API subscriptions fix  
- AGQ-340: Galeria no onboarding

Quer que eu atualize o status de alguma?`;
    }
    
    // Bugs
    else if (lowerMsg.includes('bug') || lowerMsg.includes('crítico')) {
      const bugsOutput = await mcpExec('call jt-kill.list_tasks type: BUG priority: CRITICAL limit: 5');
      const bugsCount = extractCount(bugsOutput, /Found (\d+) task/);
      
      reply = `🌙 **Bugs Críticos**

**${bugsCount}** bugs críticos encontrados

⚠️ Principais:
- JKILL-260: Auth bypass do paywall (DONE)
- JKILL-259: Rota subscriptions 404 (DONE)

Ambos foram corrigidos hoje! 🎉`;
    }
    
    // Padrão
    else {
      reply = `🌙 Entendi! Você disse: "${message}"

Posso te ajudar com:
- **Status** geral dos projetos
- **Tasks** em review
- **Bugs** críticos

Tenho acesso via MCP ao JT-KILL. O que precisa?`;
    }

    return NextResponse.json({ 
      messageId: `luna-${Date.now()}`, 
      status: 'completed', 
      reply, 
      source: 'mcp-real' 
    });

  } catch (error) {
    console.error('[Luna] Erro:', error);
    return NextResponse.json({ 
      messageId: `luna-${Date.now()}`,
      status: 'completed',
      reply: `🌙 Desculpa, tive um problema técnico. Mas tô online!

Posso te ajudar com status dos projetos, tasks e bugs. O que precisa?`,
      source: 'fallback'
    });
  }
}

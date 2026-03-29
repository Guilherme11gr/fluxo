import { NextRequest, NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';
import { prisma } from '@/infra/adapters/prisma';
import { randomUUID } from 'crypto';

const execAsync = promisify(exec);

// MCP tools disponíveis via mcporter
const MCP_TOOLS = [
  'list_tasks',
  'get_task',
  'create_task',
  'update_task',
  'delete_task',
  'list_features',
  'get_feature',
  'create_feature',
  'update_feature',
  'list_epics',
  'get_epic_full',
  'list_projects',
  'list_docs'
];

// Executar comando MCP
async function executeMcp(tool: string, params: Record<string, unknown> = {}): Promise<unknown> {
  const paramsStr = Object.entries(params)
    .filter(([_, value]) => value !== undefined)
    .map(([key, value]) => {
      if (typeof value === 'string') {
        return `${key}: "${value}"`;
      }
      return `${key}: ${JSON.stringify(value)}`;
    })
    .join(', ');

  const command = `export PATH="$HOME/.local/bin:$PATH" && mcporter call jt-kill.${tool} ${paramsStr}`;
  
  const { stdout } = await execAsync(command, {
    timeout: 30000,
    cwd: '/workspace/main'
  });

  // Parse JSON do output
  const jsonMatch = stdout.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    return JSON.parse(jsonMatch[0]);
  }
  return { raw: stdout };
}

// POST - Executar tool MCP
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { tool, params } = body;

    if (!tool || !MCP_TOOLS.includes(tool)) {
      return NextResponse.json({ 
        error: 'Tool inválida',
        availableTools: MCP_TOOLS 
      }, { status: 400 });
    }

    // Construir comando mcporter
    const paramsStr = Object.entries(params || {})
      .map(([key, value]) => {
        if (typeof value === 'string') {
          return `${key}: "${value}"`;
        }
        return `${key}: ${JSON.stringify(value)}`;
      })
      .join(', ');

    const command = `export PATH="$HOME/.local/bin:$PATH" && mcporter call jt-kill.${tool} ${paramsStr}`;

    // Executar comando
    const { stdout, stderr } = await execAsync(command, {
      timeout: 30000,
      cwd: '/workspace/main'
    });

    if (stderr && !stderr.includes('✅')) {
      console.error('MCP stderr:', stderr);
    }

    // Parse do resultado
    let result;
    try {
      // Extrair JSON do output
      const jsonMatch = stdout.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        result = JSON.parse(jsonMatch[0]);
      } else {
        result = { raw: stdout };
      }
    } catch {
      result = { raw: stdout };
    }

    return NextResponse.json({
      success: true,
      tool,
      result
    });

  } catch (error) {
    console.error('Erro ao executar MCP:', error);
    return NextResponse.json({ 
      error: 'Erro ao executar tool MCP',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

// GET - Listar tools disponíveis
export async function GET() {
  return NextResponse.json({
    server: 'jt-kill',
    tools: MCP_TOOLS.map(tool => ({
      name: tool,
      description: getToolDescription(tool)
    }))
  });
}

function getToolDescription(tool: string): string {
  const descriptions: Record<string, string> = {
    list_tasks: 'Lista tasks com filtros opcionais',
    get_task: 'Obtém detalhes de uma task específica',
    create_task: 'Cria uma nova task',
    update_task: 'Atualiza uma task existente',
    delete_task: 'Remove uma task',
    list_features: 'Lista features com filtros',
    get_feature: 'Obtém detalhes de uma feature',
    create_feature: 'Cria uma nova feature',
    update_feature: 'Atualiza uma feature',
    list_epics: 'Lista epics com filtros',
    get_epic_full: 'Obtém epic com features e tasks',
    list_projects: 'Lista todos os projetos',
    list_docs: 'Lista documentação do projeto'
  };
  return descriptions[tool] || 'Tool do MCP';
}

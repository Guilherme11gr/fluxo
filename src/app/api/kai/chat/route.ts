import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/infra/adapters/prisma';

export async function POST(req: NextRequest) {
  try {
    const { message, userId = 'guilherme' } = await req.json();
    
    if (!message || message.trim() === '') {
      return NextResponse.json({ error: 'Mensagem vazia' }, { status: 400 });
    }

    // Salva mensagem no banco pra Kai processar via MCP
    const kaiMessage = await prisma.kaiMessage.create({
      data: {
        userId,
        content: message,
        direction: 'incoming',
        status: 'pending',
      },
    });

    return NextResponse.json({ 
      messageId: kaiMessage.id, 
      status: 'received',
      message: 'Mensagem recebida! Kai vai responder em breve.'
    });

  } catch (error) {
    console.error('Erro no chat:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const messageId = searchParams.get('messageId');
  
  if (!messageId) {
    // Lista mensagens recentes
    const messages = await prisma.kaiMessage.findMany({
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    
    return NextResponse.json({ messages });
  }

  // Busca mensagem específica
  const message = await prisma.kaiMessage.findUnique({
    where: { id: messageId },
  });

  if (!message) {
    return NextResponse.json({ error: 'Mensagem não encontrada' }, { status: 404 });
  }

  if (message.status === 'completed' && message.reply) {
    return NextResponse.json({ 
      status: 'completed', 
      reply: message.reply 
    });
  }

  return NextResponse.json({ status: 'pending' });
}

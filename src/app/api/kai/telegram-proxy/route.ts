// API Route para proxy do Telegram
// Recebe mensagem do Kai Zone e envia pro Telegram Bot

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/infra/adapters/prisma';

const TELEGRAM_BOT_TOKEN = '8394542328:AAGz7IetcW3Q2vjUyM2V4gvFcuTbeQG3gHc';
const TELEGRAM_API = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}`;

// Chat ID do Kai (você precisa iniciar conversa com o bot primeiro)
let CHAT_ID: string | null = null;

async function getChatId(): Promise<string | null> {
  if (CHAT_ID) return CHAT_ID;
  
  try {
    // Pega updates do bot pra encontrar o chat
    const res = await fetch(`${TELEGRAM_API}/getUpdates`);
    const data = await res.json();
    
    if (data.ok && data.result.length > 0) {
      // Pega o último chat
      const lastUpdate = data.result[data.result.length - 1];
      CHAT_ID = lastUpdate.message?.chat?.id?.toString() || 
                lastUpdate.callback_query?.message?.chat?.id?.toString();
    }
    
    return CHAT_ID;
  } catch (error) {
    console.error('Erro ao pegar chat ID:', error);
    return null;
  }
}

export async function POST(req: NextRequest) {
  try {
    const { message, messageId } = await req.json();
    
    if (!message) {
      return NextResponse.json({ error: 'Mensagem vazia' }, { status: 400 });
    }

    const chatId = await getChatId();
    
    if (!chatId) {
      return NextResponse.json({ 
        error: 'Chat não encontrado. Inicie uma conversa com @kai_jt_assistant_bot no Telegram primeiro.' 
      }, { status: 400 });
    }

    // Envia mensagem pro Telegram
    const telegramRes = await fetch(`${TELEGRAM_API}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: `📨 Nova mensagem do Kai Zone:\n\n${message}\n\nResponda aqui que eu envio pro Jira Killer.`,
        parse_mode: 'HTML'
      })
    });

    const telegramData = await telegramRes.json();

    if (!telegramData.ok) {
      console.error('Erro Telegram:', telegramData);
      return NextResponse.json({ error: 'Erro ao enviar pro Telegram' }, { status: 500 });
    }

    // Salva referência no banco
    await prisma.$executeRaw`
      UPDATE public.kai_messages 
      SET reply = ${`📤 Enviado pro Telegram. Aguardando resposta...`},
          status = 'completed'
      WHERE id = ${messageId}::uuid
    `;

    return NextResponse.json({ 
      success: true, 
      telegramMessageId: telegramData.result.message_id 
    });

  } catch (error) {
    console.error('Erro:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}

// Webhook pra receber respostas do Telegram
export async function PUT(req: NextRequest) {
  try {
    const update = await req.json();
    
    // Verifica se é mensagem de texto
    if (update.message?.text) {
      const chatId = update.message.chat.id;
      const text = update.message.text;
      
      // Atualiza CHAT_ID
      CHAT_ID = chatId.toString();
      
      // Aqui você salvaria a resposta no banco
      // Por enquanto só loga
      console.log('Resposta do Telegram:', text);
      
      // TODO: Salvar resposta no kai_messages
    }
    
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Erro webhook:', error);
    return NextResponse.json({ ok: true }); // Sempre retorna ok pro Telegram
  }
}

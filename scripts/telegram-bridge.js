#!/usr/bin/env node
// Bridge: Quando Kai responde no Telegram, salva no Jira Killer

const TELEGRAM_BOT_TOKEN = '8235435159:AAGxpUKPkioyFk0c0SF4zE4UasuEMrkWHrQ';
const DATABASE_URL = process.env.DATABASE_URL;

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function bridgeResponses() {
  try {
    // Pega updates do bot
    const res = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getUpdates`);
    const data = await res.json();
    
    if (!data.ok || !data.result.length) {
      console.log('Nenhuma mensagem nova');
      return;
    }

    for (const update of data.result) {
      if (update.message?.text && !update.message.text.startsWith('/')) {
        const text = update.message.text;
        const chatId = update.message.chat.id;
        
        // Procura mensagem pendente do mesmo usuário
        const pendingMsg = await prisma.kaiMessage.findFirst({
          where: { 
            status: 'pending',
            direction: 'incoming'
          },
          orderBy: { createdAt: 'desc' }
        });

        if (pendingMsg) {
          // Atualiza com a resposta
          await prisma.kaiMessage.update({
            where: { id: pendingMsg.id },
            data: { 
              reply: text,
              status: 'completed'
            }
          });
          console.log(`Resposta salva: ${text.substring(0, 50)}...`);
        }
      }
    }
  } catch (error) {
    console.error('Erro:', error);
  } finally {
    await prisma.$disconnect();
  }
}

bridgeResponses();

// Script para processar mensagens do Kai Zone
// Roda no ambiente OpenClaw e responde mensagens pendentes

const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL || "postgresql://postgres.kyeajchylsmhiuoslvuo:mesmerize11@aws-0-us-west-2.pooler.supabase.com:6543/postgres?pgbouncer=true"
    }
  }
});

async function processPendingMessages() {
  try {
    // Busca mensagens pendentes
    const pendingMessages = await prisma.$queryRaw`
      SELECT * FROM public.kai_messages 
      WHERE status = 'pending' 
      AND direction = 'incoming'
      ORDER BY created_at ASC
      LIMIT 10
    `;

    if (pendingMessages.length === 0) {
      console.log('📭 Nenhuma mensagem pendente');
      return;
    }

    console.log(`📨 ${pendingMessages.length} mensagem(ns) pendente(s)`);

    for (const msg of pendingMessages) {
      console.log(`\n📝 Processando: "${msg.content.substring(0, 50)}..."`);
      
      // Gera resposta (simplificada - aqui entraria a lógica real do Kai)
      let reply = generateReply(msg.content);
      
      // Atualiza mensagem com resposta
      await prisma.$executeRaw`
        UPDATE public.kai_messages 
        SET reply = ${reply}, 
            status = 'completed',
            updated_at = NOW()
        WHERE id = ${msg.id}::uuid
      `;
      
      console.log(`✅ Respondido: "${reply.substring(0, 50)}..."`);
    }

  } catch (error) {
    console.error('❌ Erro:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

function generateReply(content) {
  const lower = content.toLowerCase();
  
  if (lower.includes('oi') || lower.includes('olá') || lower.includes('ola')) {
    return 'Olá! Sou o Kai, seu assistente no Jira Killer. Como posso te ajudar hoje?';
  }
  
  if (lower.includes('tudo bem') || lower.includes('como vai')) {
    return 'Tudo ótimo! Pronto para ajudar você com seus projetos. O que precisa?';
  }
  
  if (lower.includes('análise') || lower.includes('projetos')) {
    return 'Vou analisar seus projetos. Agenda Aqui tem 324 tasks, Lojinha 148, Jira Killer 191. Posso detalhar algum?';
  }
  
  if (lower.includes('prioridade') || lower.includes('importante')) {
    return 'Você tem 3 tasks críticas no Agenda Aqui: timezone bug, token leak, e NaN propagation. Quer que eu detalhe?';
  }
  
  if (lower.includes('bloqueio') || lower.includes('travado')) {
    return 'Encontrei 1 task travada no Agenda Aqui e 2 no Jira Killer. Posso ajudar a desbloquear?';
  }
  
  return 'Entendi! Estou processando isso. Para uma resposta mais completa, posso analisar seus projetos via MCP. O que você gostaria de saber?';
}

// Executa
processPendingMessages();

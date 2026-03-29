#!/usr/bin/env node
/**
 * Busca e executa comandos pendentes
 */

const { PrismaClient } = require('@prisma/client');
const { execSync } = require('child_process');

const prisma = new PrismaClient();

async function main() {
  // Busca comandos pendentes
  const pendingCommands = await prisma.kaiCommand.findMany({
    where: { status: 'PENDING' },
    orderBy: { createdAt: 'asc' },
    take: 1
  });

  if (pendingCommands.length === 0) {
    console.log('Nenhum comando pendente');
    return;
  }

  for (const command of pendingCommands) {
    console.log(`Executando comando: ${command.id}`);
    try {
      execSync(`node scripts/execute-command.js ${command.id}`, {
        cwd: '/root/.openclaw/workspace/jt-kill',
        stdio: 'inherit'
      });
    } catch (e) {
      console.error(`Erro executando comando ${command.id}:`, e.message);
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

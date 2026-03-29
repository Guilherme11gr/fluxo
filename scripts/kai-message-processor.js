// MCP Tool para processar mensagens do Kai Zone
// Este arquivo é executado pelo Kai para verificar e responder mensagens

const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js');

async function processKaiMessages() {
  const transport = new StdioClientTransport({
    command: 'npx',
    args: ['-y', '@guilherme11gr/jt-kill-mcp'],
    env: {
      AGENT_API_KEY: 'agk_5f8d2e1b9c3a4b7d8e9f0a1b2c3d4e5f',
      AGENT_USER_ID: 'b7d65a91-7cb6-4583-b46d-4f64713ffae2',
      AGENT_API_URL: 'https://jt-kill.vercel.app/api/agent',
      AGENT_NAME: 'Kai'
    }
  });

  const client = new Client({ name: 'kai-processor', version: '1.0.0' });
  
  try {
    await client.connect(transport);
    
    // Busca mensagens pendentes
    const pending = await client.callTool({
      name: 'list_tasks',
      arguments: { 
        status: 'TODO',
        search: '[KAI]',
        limit: 10
      }
    });
    
    console.log('Mensagens pendentes:', pending);
    
    await client.close();
  } catch (error) {
    console.error('Erro:', error.message);
  }
}

processKaiMessages();

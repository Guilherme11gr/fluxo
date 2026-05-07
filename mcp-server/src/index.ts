#!/usr/bin/env node
/**
 * JT-Kill MCP Server
 * 
 * Model Context Protocol server for the JT-Kill Agent API.
 * Provides 35 tools for complete task management automation.
 * 
 * Usage:
 *   AGENT_API_KEY=agk_xxx node dist/index.js
 * 
 * Or add to Claude Desktop config:
 *   {
 *     "mcpServers": {
 *       "jt-kill": {
 *         "command": "node",
 *         "args": ["/path/to/mcp-server/dist/index.js"],
 *         "env": {
 *           "AGENT_API_KEY": "agk_xxx",
 *           "AGENT_NAME": "Claude Desktop"
 *         }
 *       }
 *     }
 *   }
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

import { ALL_TOOLS } from './tools.js';
import { TOOL_HANDLERS } from './handlers.js';
import { apiRequest } from './api-client.js';

// ============================================================
// VALIDATION
// ============================================================

function validateEnv(): void {
  const required = ['AGENT_API_KEY'];
  const missing = required.filter((key) => !process.env[key]);
  
  if (missing.length > 0) {
    console.error(`❌ Missing required environment variables: ${missing.join(', ')}`);
    console.error(`
Set them in your environment or Claude Desktop config:
  AGENT_API_KEY=agk_xxxxx (required)
  AGENT_NAME=Claude-MCP (optional, sent as X-Agent-Name)
  AGENT_API_URL=https://... (optional, default: https://jt-kill.vercel.app/api/agent)
`);
    process.exit(1);
  }
}

// ============================================================
// SERVER SETUP
// ============================================================

async function main(): Promise<void> {
  validateEnv();

  const server = new Server(
    {
      name: 'jt-kill-mcp',
      version: '1.0.0',
    },
    {
      capabilities: {
        tools: {},
        resources: {},
      },
    }
  );

  // --------------------------------------------------------
  // LIST TOOLS
  // --------------------------------------------------------
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return { tools: ALL_TOOLS };
  });

  // --------------------------------------------------------
  // CALL TOOL
  // --------------------------------------------------------
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    
    const handler = TOOL_HANDLERS[name];
    if (!handler) {
      return {
        content: [{ type: 'text', text: `❌ Unknown tool: ${name}` }],
        isError: true,
      };
    }

    try {
      const result = await handler(args || {});
      return {
        content: [{ type: 'text', text: result }],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return {
        content: [{ type: 'text', text: `❌ Error: ${message}` }],
        isError: true,
      };
    }
  });

  // --------------------------------------------------------
  // LIST RESOURCES (API docs as context)
  // --------------------------------------------------------
  server.setRequestHandler(ListResourcesRequestSchema, async () => {
    return {
      resources: [
        {
          uri: 'jtkill://api/schema',
          mimeType: 'application/json',
          name: 'API Schema',
          description: 'Self-describing API documentation with all available endpoints',
        },
      ],
    };
  });

  // --------------------------------------------------------
  // READ RESOURCE
  // --------------------------------------------------------
  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    const { uri } = request.params;

    if (uri === 'jtkill://api/schema') {
      try {
        // Fetch self-describing API docs
        const response = await apiRequest('GET', '');
        return {
          contents: [
            {
              uri,
              mimeType: 'application/json',
              text: JSON.stringify(response.data, null, 2),
            },
          ],
        };
      } catch {
        return {
          contents: [
            {
              uri,
              mimeType: 'text/plain',
              text: 'Failed to fetch API schema',
            },
          ],
        };
      }
    }

    throw new Error(`Unknown resource: ${uri}`);
  });

  // --------------------------------------------------------
  // START SERVER
  // --------------------------------------------------------
  const transport = new StdioServerTransport();
  await server.connect(transport);
  
  console.error('🚀 JT-Kill MCP Server started');
  console.error(`📡 API: ${process.env.AGENT_API_URL || 'https://jt-kill.vercel.app/api/agent'}`);
  console.error(`🔑 Key: ${process.env.AGENT_API_KEY?.substring(0, 12)}...`);
  console.error(`🛠️  Tools: ${ALL_TOOLS.length} available`);
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});

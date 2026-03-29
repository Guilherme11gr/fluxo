import { describe, expect, it } from 'vitest';
import { buildAgentChatSystemPrompt, buildAgentChatTools } from './tools';

const context = {
  tenantId: 'tenant-1',
  userId: 'user-1',
  role: 'OWNER' as const,
  orgName: 'Fluxo',
  orgSlug: 'fluxo',
  userDisplayName: 'Koike',
  origin: 'https://fluxo.test',
  cookieHeader: null,
};

describe('agent-chat/tools', () => {
  it('includes instructions for discovery and safe tool usage', () => {
    const prompt = buildAgentChatSystemPrompt(context);

    expect(prompt).toContain('Quando o usuário não souber IDs');
    expect(prompt).toContain('list_users');
    expect(prompt).toContain('list_task_tags');
  });

  it('ships the discovery and tagging tools needed for conversational usage', () => {
    const toolNames = buildAgentChatTools(context).map((tool) => tool.name);

    expect(toolNames).toContain('list_users');
    expect(toolNames).toContain('list_task_tags');
    expect(toolNames).toContain('get_task_tags');
    expect(toolNames).toContain('set_task_tags');
  });
});

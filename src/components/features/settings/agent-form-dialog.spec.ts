import { describe, expect, it } from 'vitest';
import { buildAgentFormPayload, formatOperatingRules } from './agent-form-dialog.helpers';

describe('agent form helpers', () => {
  it('builds role prompt, operating rules and output schema config', () => {
    const payload = buildAgentFormPayload({
      name: ' builder-agent ',
      type: 'RUNNER',
      tool: 'opencode',
      projectId: 'all',
      model: '',
      agentType: 'build',
      role: 'builder',
      rolePrompt: 'Você implementa mudanças pequenas. ',
      operatingRules: 'Não altere main.\nSempre retorne JSON final.\n',
      outputSchemaVersion: 'v1',
      variant: '',
      pickStatus: 'TODO',
      claimStatus: 'DOING',
      doneStatus: 'DONE',
      timeout: '300',
    });

    expect(payload).toEqual({
      name: 'builder-agent',
      type: 'RUNNER',
      tool: 'opencode',
      projectId: null,
      config: {
        agent_type: 'build',
        role: 'builder',
        role_prompt: 'Você implementa mudanças pequenas.',
        operating_rules: ['Não altere main.', 'Sempre retorne JSON final.'],
        output_schema_version: 'v1',
        pick_status: 'TODO',
        claim_status: 'DOING',
        done_status: 'DONE',
        timeout: 300,
      },
    });
  });

  it('formats stored operating rules for textarea editing', () => {
    expect(formatOperatingRules(['Primeira regra', 'Segunda regra'])).toBe(
      'Primeira regra\nSegunda regra'
    );
    expect(formatOperatingRules('Regra unica')).toBe('Regra unica');
    expect(formatOperatingRules(undefined)).toBe('');
  });
});

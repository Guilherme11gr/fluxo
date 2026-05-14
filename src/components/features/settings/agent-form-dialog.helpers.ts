export interface AgentFormPayloadInput {
  name: string;
  type: string;
  tool: string;
  projectId: string;
  model: string;
  agentType: string;
  role: string;
  rolePrompt: string;
  operatingRules: string;
  outputSchemaVersion: string;
  variant: string;
  pickStatus: string;
  claimStatus: string;
  doneStatus: string;
  timeout: string;
}

export function formatOperatingRules(value: unknown): string {
  if (Array.isArray(value)) {
    return value.join('\n');
  }

  return typeof value === 'string' ? value : '';
}

export function buildAgentFormPayload(input: AgentFormPayloadInput) {
  const cfg: Record<string, unknown> = {};

  if (input.model) cfg.model = input.model;
  cfg.agent_type = input.agentType;
  cfg.role = input.role;

  if (input.rolePrompt.trim()) {
    cfg.role_prompt = input.rolePrompt.trim();
  }

  cfg.operating_rules = input.operatingRules
    .split('\n')
    .map((rule) => rule.trim())
    .filter(Boolean);

  cfg.output_schema_version = input.outputSchemaVersion;

  if (input.variant) cfg.variant = input.variant;

  cfg.pick_status = input.pickStatus;
  cfg.claim_status = input.claimStatus;
  cfg.done_status = input.doneStatus;

  const timeoutNum = parseInt(input.timeout, 10);
  if (!Number.isNaN(timeoutNum) && timeoutNum > 0) {
    cfg.timeout = timeoutNum;
  }

  return {
    name: input.name.trim(),
    type: input.type,
    tool: input.tool || undefined,
    projectId: !input.projectId || input.projectId === 'all' ? null : input.projectId,
    config: Object.keys(cfg).length > 0 ? cfg : undefined,
  };
}

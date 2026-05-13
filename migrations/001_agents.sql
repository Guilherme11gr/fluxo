-- FluXo Agent Registry
-- Migration 001: agents table

CREATE TABLE IF NOT EXISTS agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  type VARCHAR(20) NOT NULL DEFAULT 'RUNNER',
  status VARCHAR(20) NOT NULL DEFAULT 'OFFLINE',
  tool VARCHAR(50),
  workdir TEXT,
  config JSONB NOT NULL DEFAULT '{}',
  last_heartbeat TIMESTAMPTZ,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS agents_org_id_name_key ON agents(org_id, name);
CREATE INDEX IF NOT EXISTS idx_agents_org_status ON agents(org_id, status);

-- Task: add assignee_agent_id column (nullable, for agent-assigned tasks)
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS assignee_agent_id UUID REFERENCES agents(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_assignee_agent ON tasks(assignee_agent_id);

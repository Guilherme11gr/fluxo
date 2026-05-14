-- Migration: runner_instances_leases_events
-- Adds distributed runner tracking, project execution leases and execution event streaming.

CREATE TABLE IF NOT EXISTS public.runner_instances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  hostname TEXT,
  pid INTEGER,
  version VARCHAR(50),
  status VARCHAR(20) NOT NULL DEFAULT 'ONLINE',
  capabilities JSONB NOT NULL DEFAULT '{}'::jsonb,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  started_at TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  last_heartbeat_at TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ(6) NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_runner_instances_org
ON public.runner_instances(org_id);

CREATE INDEX IF NOT EXISTS idx_runner_instances_org_status
ON public.runner_instances(org_id, status);

CREATE INDEX IF NOT EXISTS idx_runner_instances_last_heartbeat
ON public.runner_instances(last_heartbeat_at);

ALTER TABLE public.agent_executions
ADD COLUMN IF NOT EXISTS runner_instance_id UUID,
ADD COLUMN IF NOT EXISTS workspace_mode VARCHAR(50),
ADD COLUMN IF NOT EXISTS workspace_ref TEXT,
ADD COLUMN IF NOT EXISTS workspace_path TEXT,
ADD COLUMN IF NOT EXISTS last_heartbeat_at TIMESTAMPTZ(6);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'agent_executions_runner_instance_id_fkey'
  ) THEN
    ALTER TABLE public.agent_executions
    ADD CONSTRAINT agent_executions_runner_instance_id_fkey
    FOREIGN KEY (runner_instance_id)
    REFERENCES public.runner_instances(id)
    ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_agent_executions_runner_instance
ON public.agent_executions(runner_instance_id);

CREATE INDEX IF NOT EXISTS idx_agent_executions_last_heartbeat
ON public.agent_executions(last_heartbeat_at);

CREATE TABLE IF NOT EXISTS public.execution_leases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  execution_id UUID UNIQUE REFERENCES public.agent_executions(id) ON DELETE CASCADE,
  runner_instance_id UUID NOT NULL REFERENCES public.runner_instances(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ(6) NOT NULL,
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ(6) NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'uq_execution_leases_org_project'
  ) THEN
    ALTER TABLE public.execution_leases
    ADD CONSTRAINT uq_execution_leases_org_project UNIQUE (org_id, project_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_execution_leases_expires_at
ON public.execution_leases(expires_at);

CREATE INDEX IF NOT EXISTS idx_execution_leases_runner_instance
ON public.execution_leases(runner_instance_id);

CREATE TABLE IF NOT EXISTS public.agent_execution_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  execution_id UUID NOT NULL REFERENCES public.agent_executions(id) ON DELETE CASCADE,
  seq INTEGER NOT NULL,
  kind VARCHAR(50) NOT NULL,
  content TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'uq_agent_execution_events_execution_seq'
  ) THEN
    ALTER TABLE public.agent_execution_events
    ADD CONSTRAINT uq_agent_execution_events_execution_seq UNIQUE (execution_id, seq);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_agent_execution_events_execution_created
ON public.agent_execution_events(execution_id, created_at ASC);

CREATE INDEX IF NOT EXISTS idx_agent_execution_events_execution_seq
ON public.agent_execution_events(execution_id, seq ASC);

-- Migration: drop_kai_commands_add_agent_executions
-- Drops old KaiCommand tables/enums and creates AgentExecution table
--
-- IMPORTANT: Run this against the FluXo (jt-kill) Supabase database
-- Requires: agents table must already exist (created via db push)

-- 1. Drop old KaiCommand infrastructure
DROP TABLE IF EXISTS public.kai_commands CASCADE;
DROP TYPE IF EXISTS public.kai_command_type CASCADE;
DROP TYPE IF EXISTS public.kai_command_status CASCADE;

-- 2. Create AgentExecStatus enum
CREATE TYPE public.agent_exec_status AS ENUM (
  'CLAIMED',
  'RUNNING',
  'SUCCESS',
  'FAILED',
  'TIMEOUT',
  'CANCELLED'
);

-- 3. Create agent_executions table
CREATE TABLE public.agent_executions (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL,
  agent_id UUID NOT NULL,
  task_id UUID NOT NULL,
  project_id UUID NOT NULL,
  status public.agent_exec_status NOT NULL DEFAULT 'CLAIMED',
  tool VARCHAR(50),
  model VARCHAR(100),
  output TEXT,
  result_summary TEXT,
  error_message TEXT,
  exit_code INTEGER,
  duration INTEGER,
  metadata JSONB NOT NULL DEFAULT '{}',
  started_at TIMESTAMPTZ(6) NOT NULL,
  finished_at TIMESTAMPTZ(6),
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ(6) NOT NULL DEFAULT now(),

  CONSTRAINT agent_executions_agent_fkey FOREIGN KEY (agent_id) REFERENCES public.agents(id) ON DELETE CASCADE,
  CONSTRAINT agent_executions_task_fkey FOREIGN KEY (task_id) REFERENCES public.tasks(id) ON DELETE CASCADE,
  CONSTRAINT agent_executions_project_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE,
  CONSTRAINT agent_executions_org_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE
);

-- 4. Indexes
CREATE INDEX idx_agent_executions_org ON public.agent_executions(org_id);
CREATE INDEX idx_agent_executions_agent ON public.agent_executions(agent_id);
CREATE INDEX idx_agent_executions_task ON public.agent_executions(task_id);
CREATE INDEX idx_agent_executions_project ON public.agent_executions(project_id);
CREATE INDEX idx_agent_executions_status ON public.agent_executions(status);
CREATE INDEX idx_agent_executions_org_created ON public.agent_executions(org_id, created_at DESC);

-- 5. Remove kaiCommands relations from existing tables
-- (These columns would have been added by Prisma db push previously)
-- ALTER TABLE public.projects DROP COLUMN IF EXISTS "kaiCommands";
-- ALTER TABLE public.tasks DROP COLUMN IF EXISTS "kaiCommands";
-- Note: Prisma handles relation columns via foreign keys. The FK columns
-- (kai_command_id) were never created since KaiCommand was never used.
-- Prisma db push will handle column removal automatically on next deploy.
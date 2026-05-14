-- Migration: add_assignee_agent_id_to_tasks
-- Adds task assignment to agents for multi-agent workflow handoff.

ALTER TABLE public.tasks
ADD COLUMN IF NOT EXISTS assignee_agent_id UUID;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'tasks_assignee_agent_id_fkey'
  ) THEN
    ALTER TABLE public.tasks
    ADD CONSTRAINT tasks_assignee_agent_id_fkey
    FOREIGN KEY (assignee_agent_id)
    REFERENCES public.agents(id)
    ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_tasks_assignee_agent_status
ON public.tasks(assignee_agent_id, status);

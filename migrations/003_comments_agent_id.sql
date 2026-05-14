-- Migration: add_agent_id_to_comments
-- Adds agentId column to comments table for agent identity on comments

-- Add agent_id column (nullable FK to agents)
ALTER TABLE public.comments ADD COLUMN IF NOT EXISTS agent_id UUID;

-- Add foreign key constraint
ALTER TABLE public.comments 
  ADD CONSTRAINT comments_agent_id_fkey 
  FOREIGN KEY (agent_id) REFERENCES public.agents(id) ON DELETE SET NULL;

-- Add index for agent_id lookups
CREATE INDEX IF NOT EXISTS idx_comments_agent ON public.comments(agent_id);
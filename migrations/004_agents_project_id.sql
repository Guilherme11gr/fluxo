-- Migration: add_project_id_to_agents
-- Adds projectId column to agents table for project-scoped agents

-- Add project_id column (nullable)
ALTER TABLE public.agents ADD COLUMN IF NOT EXISTS project_id UUID;

-- Add index for project_id lookups
CREATE INDEX IF NOT EXISTS idx_agents_project ON public.agents(project_id);
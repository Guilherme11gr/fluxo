CREATE TABLE IF NOT EXISTS public.project_runtime_bindings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  runner_profile VARCHAR(100) NOT NULL,
  host_os VARCHAR(20) NOT NULL,
  repo_path TEXT NOT NULL,
  default_base_branch VARCHAR(100) NOT NULL DEFAULT 'main',
  allowed_branch_prefix VARCHAR(100),
  execution_mode VARCHAR(50) NOT NULL DEFAULT 'shared_project',
  git_provider VARCHAR(50),
  pr_policy VARCHAR(20) NOT NULL DEFAULT 'disabled',
  git_policy VARCHAR(30) NOT NULL DEFAULT 'no_write',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ(6) NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'uq_project_runtime_bindings_org_project_profile_os'
  ) THEN
    ALTER TABLE public.project_runtime_bindings
    ADD CONSTRAINT uq_project_runtime_bindings_org_project_profile_os
    UNIQUE (org_id, project_id, runner_profile, host_os);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_project_runtime_bindings_org_project
ON public.project_runtime_bindings(org_id, project_id);

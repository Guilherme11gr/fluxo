ALTER TABLE public.project_runtime_bindings
  ADD COLUMN provision_command text,
  ADD COLUMN provision_cache_key text;

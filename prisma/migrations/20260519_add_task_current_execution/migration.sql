ALTER TABLE public.tasks
ADD COLUMN current_execution_id uuid;

CREATE UNIQUE INDEX uq_tasks_current_execution
ON public.tasks(current_execution_id);

ALTER TABLE public.tasks
ADD CONSTRAINT tasks_current_execution_id_fkey
FOREIGN KEY (current_execution_id)
REFERENCES public.agent_executions(id)
ON DELETE SET NULL
ON UPDATE NO ACTION;

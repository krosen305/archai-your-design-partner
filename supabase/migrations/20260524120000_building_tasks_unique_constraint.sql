-- Fix: replace partial unique index on building_tasks with a full unique constraint.
--
-- The partial index (WHERE task_key IS NOT NULL) cannot be used as an ON CONFLICT
-- target when the conflict specification omits the WHERE predicate — which is what
-- the Supabase JS client generates for .upsert({ onConflict: "project_id,task_key" }).
--
-- PostgreSQL NULL semantics preserve the existing intent: UNIQUE on (project_id, task_key)
-- still allows multiple rows with task_key = NULL per project, since NULL != NULL.

DROP INDEX IF EXISTS public.building_tasks_project_task_key_idx;

ALTER TABLE public.building_tasks
  ADD CONSTRAINT building_tasks_project_task_key_unique
  UNIQUE (project_id, task_key);

-- ROLLBACK:
-- ALTER TABLE public.building_tasks DROP CONSTRAINT IF EXISTS building_tasks_project_task_key_unique;
-- CREATE UNIQUE INDEX IF NOT EXISTS building_tasks_project_task_key_idx
--   ON public.building_tasks(project_id, task_key)
--   WHERE task_key IS NOT NULL;

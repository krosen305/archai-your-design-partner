-- =============================================================================
-- floor_plan_commands: append-only audit trail for plantegnings-edits (§13.3).
-- Commands er audit/replay, IKKE restore-kilde i v1 (§23.3.2). Snapshot vinder.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.floor_plan_commands (
  id                       uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  floor_plan_iteration_id  uuid        NOT NULL REFERENCES public.floor_plan_iterations(id) ON DELETE CASCADE,
  project_id               uuid        NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  command_index            integer     NOT NULL,
  command_json             jsonb       NOT NULL,
  command_hash             text        NOT NULL,
  source                   text        NOT NULL
                           CHECK (source IN ('drag','keyboard','ai','system')),
  created_at               timestamptz NOT NULL DEFAULT now(),
  created_by               uuid,
  UNIQUE (floor_plan_iteration_id, command_index)
);

CREATE INDEX IF NOT EXISTS floor_plan_commands_iteration_idx
  ON public.floor_plan_commands(floor_plan_iteration_id, command_index);

ALTER TABLE public.floor_plan_commands ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.floor_plan_commands FROM anon;
GRANT SELECT, INSERT ON public.floor_plan_commands TO authenticated;
GRANT ALL ON public.floor_plan_commands TO service_role;

CREATE POLICY "Ejere ser egne commands"
  ON public.floor_plan_commands FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.projects p
                 WHERE p.id = floor_plan_commands.project_id
                   AND p.user_id = (SELECT auth.uid())));

CREATE POLICY "Ejere opretter commands"
  ON public.floor_plan_commands FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.projects p
                      WHERE p.id = floor_plan_commands.project_id
                        AND p.user_id = (SELECT auth.uid())));

-- ROLLBACK:
-- DROP TABLE IF EXISTS public.floor_plan_commands CASCADE;

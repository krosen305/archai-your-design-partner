-- =============================================================================
-- floor_plan_exports: SVG/PDF-eksporter af plantegninger (§13.5).
-- Samme render model som editoren; input_hash binder eksport til verification.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.floor_plan_exports (
  id                       uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id               uuid        NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  floor_plan_iteration_id  uuid        NOT NULL REFERENCES public.floor_plan_iterations(id) ON DELETE CASCADE,
  drawing_type             text        NOT NULL DEFAULT 'floor_plan',
  readiness_status         text        NOT NULL,
  svg_path                 text,
  pdf_path                 text,
  input_hash               text        NOT NULL,
  generated_at             timestamptz NOT NULL DEFAULT now(),
  approved_at              timestamptz,
  approved_by              uuid
);

CREATE INDEX IF NOT EXISTS floor_plan_exports_iteration_idx
  ON public.floor_plan_exports(floor_plan_iteration_id, generated_at DESC);

ALTER TABLE public.floor_plan_exports ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.floor_plan_exports FROM anon;
GRANT SELECT, INSERT, UPDATE ON public.floor_plan_exports TO authenticated;
GRANT ALL ON public.floor_plan_exports TO service_role;

CREATE POLICY "Ejere ser egne plantegnings-eksporter"
  ON public.floor_plan_exports FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.projects p
                 WHERE p.id = floor_plan_exports.project_id
                   AND p.user_id = (SELECT auth.uid())));

CREATE POLICY "Ejere opretter plantegnings-eksporter"
  ON public.floor_plan_exports FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.projects p
                      WHERE p.id = floor_plan_exports.project_id
                        AND p.user_id = (SELECT auth.uid())));

CREATE POLICY "Ejere opdaterer egne plantegnings-eksporter"
  ON public.floor_plan_exports FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.projects p
                 WHERE p.id = floor_plan_exports.project_id
                   AND p.user_id = (SELECT auth.uid())))
  WITH CHECK (EXISTS (SELECT 1 FROM public.projects p
                      WHERE p.id = floor_plan_exports.project_id
                        AND p.user_id = (SELECT auth.uid())));

-- ROLLBACK:
-- DROP TABLE IF EXISTS public.floor_plan_exports CASCADE;

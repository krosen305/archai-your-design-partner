-- =============================================================================
-- floor_plan_verifications: formal verification snapshots (§13.4).
-- input_hash gør snapshottet reproducerbart (§21, §23.3.3).
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.floor_plan_verifications (
  id                        uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id                uuid        NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  floor_plan_iteration_id   uuid        NOT NULL REFERENCES public.floor_plan_iterations(id) ON DELETE CASCADE,
  input_hash                text        NOT NULL,
  status                    text        NOT NULL
                            CHECK (status IN (
                              'CONCEPT_DRAFT','TECHNICAL_REVIEW','AUTHORITY_REVIEW',
                              'DOCUMENTATION_REQUIRED','BLOCKED')),
  findings_json             jsonb       NOT NULL DEFAULT '[]'::jsonb,
  missing_data_points_json  jsonb       NOT NULL DEFAULT '[]'::jsonb,
  verified_at               timestamptz NOT NULL DEFAULT now(),
  verified_by               uuid,
  rule_engine_snapshot_id   uuid
);

CREATE INDEX IF NOT EXISTS floor_plan_verifications_iteration_idx
  ON public.floor_plan_verifications(floor_plan_iteration_id, verified_at DESC);

CREATE INDEX IF NOT EXISTS floor_plan_verifications_input_hash_idx
  ON public.floor_plan_verifications(floor_plan_iteration_id, input_hash);

ALTER TABLE public.floor_plan_verifications ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.floor_plan_verifications FROM anon;
GRANT SELECT, INSERT ON public.floor_plan_verifications TO authenticated;
GRANT ALL ON public.floor_plan_verifications TO service_role;

CREATE POLICY "Ejere ser egne verifikationer"
  ON public.floor_plan_verifications FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.projects p
                 WHERE p.id = floor_plan_verifications.project_id
                   AND p.user_id = (SELECT auth.uid())));

CREATE POLICY "Ejere opretter verifikationer"
  ON public.floor_plan_verifications FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.projects p
                      WHERE p.id = floor_plan_verifications.project_id
                        AND p.user_id = (SELECT auth.uid())));

-- ROLLBACK:
-- DROP TABLE IF EXISTS public.floor_plan_verifications CASCADE;

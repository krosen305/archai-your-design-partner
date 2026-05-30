-- =============================================================================
-- floor_plan_iterations: canonical store for interaktive plantegningsversioner
--
-- Spec: docs/superpowers/specs/2026-05-30-interaktiv-plantegning-...md (§13.2, §24.2).
-- Snapshot (floor_plan_json) er source of truth (§23.3.2). Kritiske aggregates
-- ligger i typed columns, så UI/verification/API ikke skal parse JSONB (Rule 6).
-- N:1 til design_iterations; præcis én aktiv plantegning pr. projekt (§23.3.5).
--
-- Generated Supabase types skal regenereres efter deploy (jf. drawing_exports).
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.floor_plan_iterations (
  id                      uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id              uuid        NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  design_iteration_id     uuid        REFERENCES public.design_iterations(id) ON DELETE SET NULL,
  version                 integer     NOT NULL DEFAULT 1,
  is_active               boolean     NOT NULL DEFAULT true,
  schema_version          text        NOT NULL DEFAULT 'floor-plan.v1',
  floor_plan_json         jsonb       NOT NULL,
  model_hash              text        NOT NULL,
  verification_status     text        NOT NULL DEFAULT 'CONCEPT_DRAFT'
                          CHECK (verification_status IN (
                            'CONCEPT_DRAFT','TECHNICAL_REVIEW','AUTHORITY_REVIEW',
                            'DOCUMENTATION_REQUIRED','BLOCKED')),
  gross_area_m2           double precision,
  net_area_m2             double precision,
  footprint_area_m2       double precision,
  levels_count            integer     NOT NULL DEFAULT 0,
  rooms_count             integer     NOT NULL DEFAULT 0,
  wall_length_total_m     double precision,
  exterior_wall_length_m  double precision,
  openings_count          integer     NOT NULL DEFAULT 0,
  material_basis_readiness text       NOT NULL DEFAULT 'NOT_READY'
                          CHECK (material_basis_readiness IN (
                            'NOT_READY','GEOMETRY_ONLY','ASSEMBLIES_ASSIGNED',
                            'READY_FOR_ESTIMATE','READY_FOR_QUANTITY_TAKEOFF')),
  created_at              timestamptz NOT NULL DEFAULT now(),
  created_by              uuid
);

-- §23.3.5: præcis én aktiv plantegning pr. projekt.
CREATE UNIQUE INDEX IF NOT EXISTS floor_plan_iterations_one_active_per_project
  ON public.floor_plan_iterations(project_id) WHERE is_active;

CREATE INDEX IF NOT EXISTS floor_plan_iterations_project_version_idx
  ON public.floor_plan_iterations(project_id, version DESC);

ALTER TABLE public.floor_plan_iterations ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.floor_plan_iterations FROM anon;
GRANT SELECT, INSERT, UPDATE ON public.floor_plan_iterations TO authenticated;
GRANT ALL ON public.floor_plan_iterations TO service_role;

CREATE POLICY "Ejere ser egne plantegninger"
  ON public.floor_plan_iterations FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.projects p
                 WHERE p.id = floor_plan_iterations.project_id
                   AND p.user_id = (SELECT auth.uid())));

CREATE POLICY "Ejere opretter plantegninger"
  ON public.floor_plan_iterations FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.projects p
                      WHERE p.id = floor_plan_iterations.project_id
                        AND p.user_id = (SELECT auth.uid())));

CREATE POLICY "Ejere opdaterer egne plantegninger"
  ON public.floor_plan_iterations FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.projects p
                 WHERE p.id = floor_plan_iterations.project_id
                   AND p.user_id = (SELECT auth.uid())))
  WITH CHECK (EXISTS (SELECT 1 FROM public.projects p
                      WHERE p.id = floor_plan_iterations.project_id
                        AND p.user_id = (SELECT auth.uid())));

-- ROLLBACK:
-- DROP TABLE IF EXISTS public.floor_plan_iterations CASCADE;

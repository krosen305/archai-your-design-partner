-- Bulk-apply alle unapplied migrations (ARCH-179 → floor_plan_exports)
-- Indeholder: design_iterations placement columns, analysis_tracing, hus_dna,
-- jordstykke_polygon, analysis_event_summaries, address_source_results,
-- site_constraints jordforurening/geus_dhm/plandata_ext/arealdata_ext/bbr_dd/broadband/energimaerke/noise_neighbor,
-- design_iterations backfill+canonicalize, building_tasks unique, br18 tables+columns,
-- drawing_exports, floor_plan_iterations/commands/verifications/exports
-- + GRANTs/RLS for BR18 og broadband_coverage.

-- ============ 20260515120000_design_iterations_placement_columns.sql ============
ALTER TABLE public.design_iterations
  ADD COLUMN IF NOT EXISTS placement_footprint_area_m2          FLOAT,
  ADD COLUMN IF NOT EXISTS placement_centroid_lat               FLOAT,
  ADD COLUMN IF NOT EXISTS placement_centroid_lng               FLOAT,
  ADD COLUMN IF NOT EXISTS placement_rotation_deg               FLOAT,
  ADD COLUMN IF NOT EXISTS placement_min_distance_to_boundary_m FLOAT,
  ADD COLUMN IF NOT EXISTS placement_outside_parcel_area_m2     FLOAT DEFAULT 0 NOT NULL,
  ADD COLUMN IF NOT EXISTS placement_floors                     SMALLINT,
  ADD COLUMN IF NOT EXISTS placement_height_m                   FLOAT,
  ADD COLUMN IF NOT EXISTS placement_source                     TEXT DEFAULT 'user'
    CHECK (placement_source IN ('user', 'generated')),
  ADD COLUMN IF NOT EXISTS placement_footprint_geojson          JSONB;

-- ============ 20260515220010_analysis_tracing.sql ============
CREATE TABLE IF NOT EXISTS public.analysis_runs (
  id uuid primary key default gen_random_uuid(),
  run_kind text not null check (run_kind in ('precheck','full_analysis','byggeanalyse','ai_design','project_sync')),
  project_id uuid references public.projects(id) on delete set null,
  address_id text,
  user_id uuid references auth.users(id) on delete set null,
  source text not null default 'server',
  status text not null default 'running' check (status in ('running','done','failed','partial')),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  duration_ms integer,
  error_message text,
  metadata jsonb not null default '{}'
);

CREATE TABLE IF NOT EXISTS public.analysis_events (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.analysis_runs(id) on delete cascade,
  event_type text not null check (event_type in ('api_call','cache_read','cache_write','db_read','db_write','pipeline_step')),
  phase text,
  service text not null,
  operation text not null,
  status text not null default 'ok' check (status in ('ok','error','skipped')),
  cache_hit boolean,
  attempt integer,
  http_status integer,
  duration_ms integer,
  error_message text,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);

CREATE INDEX IF NOT EXISTS analysis_runs_project_started_idx ON public.analysis_runs(project_id, started_at desc) WHERE project_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS analysis_runs_address_started_idx ON public.analysis_runs(address_id, started_at desc) WHERE address_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS analysis_events_run_created_idx ON public.analysis_events(run_id, created_at);
CREATE INDEX IF NOT EXISTS analysis_events_service_operation_idx ON public.analysis_events(service, operation, created_at desc);

ALTER TABLE public.analysis_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.analysis_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.analysis_runs FROM anon, authenticated;
REVOKE ALL ON public.analysis_events FROM anon, authenticated;
GRANT ALL ON public.analysis_runs TO service_role;
GRANT ALL ON public.analysis_events TO service_role;

DROP POLICY IF EXISTS "service_role_only_analysis_runs" ON public.analysis_runs;
CREATE POLICY "service_role_only_analysis_runs" ON public.analysis_runs FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "service_role_only_analysis_events" ON public.analysis_events;
CREATE POLICY "service_role_only_analysis_events" ON public.analysis_events FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE OR REPLACE VIEW public.analysis_run_summaries AS
SELECT r.id, r.run_kind, r.project_id, r.address_id, r.user_id, r.source, r.status,
  r.started_at, r.completed_at, r.duration_ms, r.error_message,
  count(e.id) as event_count,
  count(e.id) filter (where e.event_type = 'api_call') as api_call_count,
  count(e.id) filter (where e.event_type = 'cache_read') as cache_read_count,
  count(e.id) filter (where e.cache_hit = true) as cache_hit_count,
  count(e.id) filter (where e.event_type = 'db_write') as db_write_count,
  count(e.id) filter (where e.status = 'error') as error_count,
  coalesce((SELECT jsonb_object_agg(sc.service, sc.call_count) FROM (
    SELECT service, count(*) as call_count FROM public.analysis_events
    WHERE run_id = r.id AND event_type = 'api_call' GROUP BY service
  ) sc), '{}'::jsonb) as api_calls_by_service
FROM public.analysis_runs r LEFT JOIN public.analysis_events e ON e.run_id = r.id
GROUP BY r.id;

CREATE OR REPLACE VIEW public.analysis_event_errors AS
SELECT r.run_kind, r.project_id, r.address_id, e.run_id, e.created_at, e.phase,
  e.service, e.operation, e.event_type, e.http_status, e.duration_ms, e.error_message, e.metadata
FROM public.analysis_events e JOIN public.analysis_runs r ON r.id = e.run_id
WHERE e.status = 'error';

REVOKE ALL ON public.analysis_run_summaries FROM anon, authenticated;
REVOKE ALL ON public.analysis_event_errors FROM anon, authenticated;
GRANT SELECT ON public.analysis_run_summaries TO service_role;
GRANT SELECT ON public.analysis_event_errors TO service_role;

-- ============ 20260516210000_add_hus_dna.sql ============
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS hus_dna JSONB;

-- ============ 20260517000000_add_jordstykke_polygon.sql ============
ALTER TABLE public.address_analysis
  ADD COLUMN IF NOT EXISTS jordstykke_polygon      JSONB,
  ADD COLUMN IF NOT EXISTS jordstykke_polygon_at   TIMESTAMPTZ;

-- ============ 20260518000000_analysis_event_summaries.sql ============
ALTER TABLE public.analysis_events
  ADD COLUMN IF NOT EXISTS input_summary  text,
  ADD COLUMN IF NOT EXISTS output_summary text,
  ADD COLUMN IF NOT EXISTS decision_summary text;

-- ============ 20260519120000_address_source_results.sql ============
CREATE TABLE IF NOT EXISTS public.address_source_results (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  address_id        TEXT NOT NULL,
  source_kind       TEXT NOT NULL,
  status            TEXT NOT NULL CHECK (status IN ('ok','error','skipped','mock')),
  confidence        TEXT NOT NULL CHECK (confidence IN ('confirmed','estimated','missing','unknown')),
  is_mock           BOOLEAN NOT NULL DEFAULT false,
  fetched_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  source_url        TEXT,
  raw_feature_count INT,
  payload           JSONB,
  expires_at        TIMESTAMPTZ NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT address_source_results_address_source_unique UNIQUE (address_id, source_kind)
);

GRANT SELECT ON public.address_source_results TO authenticated;
GRANT ALL ON public.address_source_results TO service_role;

DROP TRIGGER IF EXISTS address_source_results_set_updated_at ON public.address_source_results;
CREATE TRIGGER address_source_results_set_updated_at
  BEFORE UPDATE ON public.address_source_results
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX IF NOT EXISTS address_source_results_lookup_idx
  ON public.address_source_results(address_id, source_kind, expires_at);
CREATE INDEX IF NOT EXISTS address_source_results_expires_idx
  ON public.address_source_results(expires_at);

ALTER TABLE public.address_source_results ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "authenticated_read_address_source_results" ON public.address_source_results;
CREATE POLICY "authenticated_read_address_source_results"
  ON public.address_source_results FOR SELECT TO authenticated USING (true);

-- ============ 20260520000000_site_constraints_jordforurening.sql ============
ALTER TABLE public.site_constraints
  ADD COLUMN IF NOT EXISTS jordforurening_v1           BOOLEAN,
  ADD COLUMN IF NOT EXISTS jordforurening_v2           BOOLEAN,
  ADD COLUMN IF NOT EXISTS jordforurening_olietank     BOOLEAN,
  ADD COLUMN IF NOT EXISTS omraadeklassificering       TEXT,
  ADD COLUMN IF NOT EXISTS jordforurening_nuancering   TEXT,
  ADD COLUMN IF NOT EXISTS jordforurening_lokalitet_id TEXT;

-- ============ 20260522211344_backfill_active_design_iterations.sql ============
INSERT INTO public.design_iterations (
  project_id, version, is_active, label, area_m2, floors, description, inspirations,
  budget_estimate, byggeoenske, hus_dna, created_at
)
SELECT p.id, 1, true, 'Legacy import',
  CASE WHEN (p.brief_data ->> 'oensketAreal') ~ '^[0-9]+(\.[0-9]+)?$'
    THEN (p.brief_data ->> 'oensketAreal')::FLOAT ELSE NULL END,
  CASE WHEN (p.brief_data ->> 'antalEtager') ~ '^[0-9]+$'
    THEN (p.brief_data ->> 'antalEtager')::SMALLINT ELSE NULL END,
  COALESCE(p.brief_data ->> 'designDroem', p.description),
  COALESCE(
    CASE WHEN jsonb_typeof(p.brief_data -> 'inspirationsbilledePaths') = 'array'
      THEN p.brief_data -> 'inspirationsbilledePaths'
      WHEN jsonb_typeof(p.brief_data -> 'inspirationsbilleder') = 'array'
      THEN p.brief_data -> 'inspirationsbilleder' ELSE NULL END,
    p.inspirations, '[]'::jsonb),
  p.budget_estimate,
  CASE WHEN p.brief_data IS NOT NULL AND NOT (p.brief_data ? 'stil' AND p.brief_data ? 'bruttoareal')
    THEN p.brief_data ELSE NULL END,
  p.hus_dna, p.created_at
FROM public.projects p
WHERE NOT EXISTS (SELECT 1 FROM public.design_iterations di WHERE di.project_id = p.id AND di.is_active = true)
  AND (p.brief_data IS NOT NULL OR p.hus_dna IS NOT NULL OR p.budget_estimate IS NOT NULL
    OR p.description IS NOT NULL OR (p.inspirations IS NOT NULL AND p.inspirations != '[]'::jsonb));

-- ============ 20260522213851_canonicalize_design_iterations.sql ============
INSERT INTO public.design_iterations (
  project_id, version, is_active, label, area_m2, floors, description, inspirations,
  budget_estimate, byggeoenske, hus_dna
)
SELECT p.id, 1, TRUE, 'Legacy import',
  CASE WHEN (p.brief_data ->> 'oensketAreal') ~ '^[0-9]+(\.[0-9]+)?$' THEN (p.brief_data ->> 'oensketAreal')::FLOAT
    WHEN regexp_replace(COALESCE(p.area, ''), '[^0-9\.]', '', 'g') ~ '^[0-9]+(\.[0-9]+)?$'
    THEN regexp_replace(p.area, '[^0-9\.]', '', 'g')::FLOAT ELSE NULL END,
  CASE WHEN (p.brief_data ->> 'antalEtager') ~ '^[0-9]+$' THEN (p.brief_data ->> 'antalEtager')::SMALLINT
    WHEN COALESCE(p.floors, '') ~ '^[0-9]+$' THEN p.floors::SMALLINT ELSE NULL END,
  COALESCE(p.brief_data ->> 'designDroem', p.description),
  COALESCE(
    CASE WHEN jsonb_typeof(p.brief_data -> 'inspirationsbilledePaths') = 'array'
      THEN p.brief_data -> 'inspirationsbilledePaths'
      WHEN jsonb_typeof(p.brief_data -> 'inspirationsbilleder') = 'array'
      THEN p.brief_data -> 'inspirationsbilleder' ELSE NULL END,
    p.inspirations, '[]'::jsonb),
  p.budget_estimate,
  CASE WHEN p.brief_data IS NOT NULL AND NOT (p.brief_data ? 'stil' AND p.brief_data ? 'bruttoareal')
    THEN p.brief_data ELSE NULL END,
  CASE WHEN p.hus_dna IS NOT NULL THEN p.hus_dna
    WHEN p.brief_data IS NOT NULL AND p.brief_data ? 'stil' AND p.brief_data ? 'bruttoareal'
    THEN p.brief_data ELSE NULL END
FROM public.projects AS p
WHERE NOT EXISTS (SELECT 1 FROM public.design_iterations AS di WHERE di.project_id = p.id AND di.is_active = TRUE)
  AND (p.brief_data IS NOT NULL OR p.hus_dna IS NOT NULL OR p.area IS NOT NULL
    OR p.floors IS NOT NULL OR p.description IS NOT NULL
    OR (p.inspirations IS NOT NULL AND p.inspirations != '[]'::jsonb));

UPDATE public.projects AS p
SET area = NULL, floors = NULL, budget = NULL, timeline = NULL,
    description = NULL, inspirations = '[]'::jsonb, brief_data = NULL, hus_dna = NULL
WHERE EXISTS (SELECT 1 FROM public.design_iterations AS di WHERE di.project_id = p.id AND di.is_active = TRUE);

-- ============ 20260524090000_site_constraints_geus_dhm.sql ============
ALTER TABLE public.site_constraints
  ADD COLUMN IF NOT EXISTS grundvand_depth_winter_m NUMERIC,
  ADD COLUMN IF NOT EXISTS grundvand_depth_summer_m NUMERIC,
  ADD COLUMN IF NOT EXISTS grundvand_model_uncertainty_m NUMERIC,
  ADD COLUMN IF NOT EXISTS geoteknik_jordart TEXT,
  ADD COLUMN IF NOT EXISTS terrain_slope_pct NUMERIC,
  ADD COLUMN IF NOT EXISTS terrain_low_point_m NUMERIC,
  ADD COLUMN IF NOT EXISTS bluespot_risk BOOLEAN;

-- ============ 20260524120000_building_tasks_unique_constraint.sql ============
DROP INDEX IF EXISTS public.building_tasks_project_task_key_idx;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
    WHERE conname = 'building_tasks_project_task_key_unique'
      AND conrelid = 'public.building_tasks'::regclass) THEN
    ALTER TABLE public.building_tasks
      ADD CONSTRAINT building_tasks_project_task_key_unique UNIQUE (project_id, task_key);
  END IF;
END $$;

-- ============ 20260524121000_site_constraints_plandata_ext.sql ============
ALTER TABLE public.site_constraints
  ADD COLUMN IF NOT EXISTS zone_type text,
  ADD COLUMN IF NOT EXISTS future_zone_type text,
  ADD COLUMN IF NOT EXISTS landzone_permit_required boolean,
  ADD COLUMN IF NOT EXISTS lokalplan_byggefelt_present boolean,
  ADD COLUMN IF NOT EXISTS within_building_field boolean,
  ADD COLUMN IF NOT EXISTS building_field_source_id text,
  ADD COLUMN IF NOT EXISTS wastewater_plan_status text,
  ADD COLUMN IF NOT EXISTS sewer_area_type text;

-- ============ 20260524143000_site_constraints_arealdata_ext.sql ============
ALTER TABLE public.site_constraints
  ADD COLUMN IF NOT EXISTS paragraph3_nature boolean,
  ADD COLUMN IF NOT EXISTS natura2000 boolean,
  ADD COLUMN IF NOT EXISTS protected_dige boolean,
  ADD COLUMN IF NOT EXISTS fortidsminde boolean,
  ADD COLUMN IF NOT EXISTS fortidsminde_buffer boolean,
  ADD COLUMN IF NOT EXISTS bnbo boolean,
  ADD COLUMN IF NOT EXISTS osd boolean,
  ADD COLUMN IF NOT EXISTS raw_material_area boolean;

-- ============ 20260524160000_arch246_bbr_due_diligence.sql ============
ALTER TABLE public.site_constraints
  ADD COLUMN IF NOT EXISTS bbr_vandforsyning_kode   TEXT,
  ADD COLUMN IF NOT EXISTS bbr_afloebsforhold_kode  TEXT,
  ADD COLUMN IF NOT EXISTS bbr_ombygningsaar        INTEGER,
  ADD COLUMN IF NOT EXISTS bbr_sanerings_risiko     TEXT
    CHECK (bbr_sanerings_risiko IN ('lav', 'moderat', 'hoej'));

-- ============ 20260524170000_arch247_broadband_coverage.sql ============
CREATE TABLE IF NOT EXISTS public.broadband_coverage (
  adgangsadresse_id         TEXT PRIMARY KEY,
  fast_traadloes_download_mbit  NUMERIC,
  fast_traadloes_upload_mbit    NUMERIC,
  fiber_download_mbit           NUMERIC,
  fiber_upload_mbit             NUMERIC,
  kabel_tv_download_mbit        NUMERIC,
  kabel_tv_upload_mbit          NUMERIC,
  xdsl_download_mbit            NUMERIC,
  xdsl_upload_mbit              NUMERIC,
  mobil_download_mbit           NUMERIC,
  source_url            TEXT,
  imported_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.broadband_coverage TO authenticated;
GRANT ALL ON public.broadband_coverage TO service_role;

CREATE INDEX IF NOT EXISTS broadband_coverage_address_idx
  ON public.broadband_coverage(adgangsadresse_id);

ALTER TABLE public.broadband_coverage ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "authenticated_read_broadband_coverage" ON public.broadband_coverage;
CREATE POLICY "authenticated_read_broadband_coverage"
  ON public.broadband_coverage FOR SELECT TO authenticated USING (true);

-- ============ 20260524175000_arch247_site_constraints_broadband.sql ============
ALTER TABLE public.site_constraints
  ADD COLUMN IF NOT EXISTS broadband_fiber_mbit          NUMERIC,
  ADD COLUMN IF NOT EXISTS broadband_kabel_mbit          NUMERIC,
  ADD COLUMN IF NOT EXISTS broadband_xdsl_mbit           NUMERIC,
  ADD COLUMN IF NOT EXISTS broadband_fast_traadloes_mbit NUMERIC,
  ADD COLUMN IF NOT EXISTS broadband_mobil_mbit          NUMERIC,
  ADD COLUMN IF NOT EXISTS broadband_max_fast_mbit       NUMERIC,
  ADD COLUMN IF NOT EXISTS broadband_match_type          TEXT
    CHECK (broadband_match_type IN ('uuid', 'no_hit', 'db_error'));

-- ============ 20260524180000_arch248_energimaerke.sql ============
ALTER TABLE public.site_constraints
  ADD COLUMN IF NOT EXISTS energimaerke_klasse      TEXT,
  ADD COLUMN IF NOT EXISTS energimaerke_gyldig_til  TEXT,
  ADD COLUMN IF NOT EXISTS energimaerke_er_udloebet BOOLEAN,
  ADD COLUMN IF NOT EXISTS energimaerke_rapport_url TEXT,
  ADD COLUMN IF NOT EXISTS energimaerke_rapport_id  TEXT,
  ADD COLUMN IF NOT EXISTS energimaerke_rapportdato TEXT;

-- ============ 20260525100000_br18_tables.sql ============
CREATE TABLE IF NOT EXISTS public.project_br18_applicability (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  requirement_id text not null,
  br18_version text not null default '2024',
  status text not null check (status in (
    'relevant','not_relevant','unknown_missing_data',
    'requires_specialist_review','requires_authority_decision')),
  reasons text[] not null default '{}',
  missing_inputs text[] not null default '{}',
  evaluated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(project_id, requirement_id, br18_version)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_br18_applicability TO authenticated;
GRANT ALL ON public.project_br18_applicability TO service_role;

ALTER TABLE public.project_br18_applicability ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Ejere ser egne br18 applicability" ON public.project_br18_applicability;
CREATE POLICY "Ejere ser egne br18 applicability"
  ON public.project_br18_applicability FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_br18_applicability.project_id AND p.user_id = (SELECT auth.uid())));
DROP POLICY IF EXISTS "Ejere skriver egne br18 applicability" ON public.project_br18_applicability;
CREATE POLICY "Ejere skriver egne br18 applicability"
  ON public.project_br18_applicability FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_br18_applicability.project_id AND p.user_id = (SELECT auth.uid())))
  WITH CHECK (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_br18_applicability.project_id AND p.user_id = (SELECT auth.uid())));

CREATE TABLE IF NOT EXISTS public.project_br18_evidence (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  requirement_id text not null,
  evidence_type text not null check (evidence_type in (
    'register_data','drawing','calculation','declaration',
    'product_documentation','photo','manual_upload','advisor_note','authority_response')),
  status text not null check (status in ('missing','draft','uploaded','validated','rejected')) default 'missing',
  source text not null check (source in ('datafordeler','plandata','user_upload','advisor','ai_extract','manual')),
  file_id uuid null,
  structured_payload jsonb null,
  validation_notes text[] not null default '{}',
  reviewed_by_role text null,
  reviewed_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_br18_evidence TO authenticated;
GRANT ALL ON public.project_br18_evidence TO service_role;

ALTER TABLE public.project_br18_evidence ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Ejere ser egne br18 evidence" ON public.project_br18_evidence;
CREATE POLICY "Ejere ser egne br18 evidence"
  ON public.project_br18_evidence FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_br18_evidence.project_id AND p.user_id = (SELECT auth.uid())));
DROP POLICY IF EXISTS "Ejere skriver egne br18 evidence" ON public.project_br18_evidence;
CREATE POLICY "Ejere skriver egne br18 evidence"
  ON public.project_br18_evidence FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_br18_evidence.project_id AND p.user_id = (SELECT auth.uid())))
  WITH CHECK (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_br18_evidence.project_id AND p.user_id = (SELECT auth.uid())));

CREATE INDEX IF NOT EXISTS idx_br18_applicability_project_id ON public.project_br18_applicability(project_id);
CREATE INDEX IF NOT EXISTS idx_br18_evidence_project_id ON public.project_br18_evidence(project_id);

-- ============ 20260525100001_br18_columns.sql ============
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS br18_version text NOT NULL DEFAULT '2024',
  ADD COLUMN IF NOT EXISTS authority_readiness_status text
    CHECK (authority_readiness_status IN (
      'preliminary','ready_for_advisor_review',
      'ready_for_authority_review','missing_critical_documentation')) DEFAULT 'preliminary';

ALTER TABLE public.site_constraints
  ADD COLUMN IF NOT EXISTS lca_required boolean,
  ADD COLUMN IF NOT EXISTS energy_frame_required boolean,
  ADD COLUMN IF NOT EXISTS fire_review_required boolean,
  ADD COLUMN IF NOT EXISTS static_review_required boolean;

-- ============ 20260526100000_site_constraints_noise_neighbor.sql ============
ALTER TABLE public.site_constraints
  ADD COLUMN IF NOT EXISTS noise_road_lden_db float,
  ADD COLUMN IF NOT EXISTS noise_road_lnight_db float,
  ADD COLUMN IF NOT EXISTS noise_rail_lden_db float,
  ADD COLUMN IF NOT EXISTS noise_rail_lnight_db float,
  ADD COLUMN IF NOT EXISTS noise_air_lden_db float,
  ADD COLUMN IF NOT EXISTS noise_air_lnight_db float,
  ADD COLUMN IF NOT EXISTS noise_industry_lden_db float,
  ADD COLUMN IF NOT EXISTS noise_coverage_status text,
  ADD COLUMN IF NOT EXISTS noise_model_year smallint,
  ADD COLUMN IF NOT EXISTS noise_acoustic_review_required boolean,
  ADD COLUMN IF NOT EXISTS neighbor_building_count_40m integer,
  ADD COLUMN IF NOT EXISTS neighbor_nearest_building_distance_m float,
  ADD COLUMN IF NOT EXISTS road_nearest_centerline_distance_m float,
  ADD COLUMN IF NOT EXISTS access_road_nearby boolean,
  ADD COLUMN IF NOT EXISTS neighbor_context_confidence text,
  ADD COLUMN IF NOT EXISTS planning_noise_area boolean,
  ADD COLUMN IF NOT EXISTS planning_production_noise_consequence_area boolean,
  ADD COLUMN IF NOT EXISTS planning_odor_area boolean,
  ADD COLUMN IF NOT EXISTS planning_technical_facility_consequence_area boolean,
  ADD COLUMN IF NOT EXISTS planning_large_livestock_area boolean,
  ADD COLUMN IF NOT EXISTS planning_surroundings_review_required boolean;

-- ============ 20260528100000_drawing_exports.sql ============
CREATE TABLE IF NOT EXISTS public.drawing_exports (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  svg_path        text,
  pdf_path        text,
  readiness_status text NOT NULL,
  input_hash      text NOT NULL,
  drawing_type    text NOT NULL DEFAULT 'beliggenhedsplan',
  status          text NOT NULL DEFAULT 'draft'
                  CHECK (status IN ('draft','review','approved','rejected')),
  generated_at    timestamptz NOT NULL DEFAULT now(),
  approved_at     timestamptz
);

GRANT SELECT, INSERT, UPDATE ON public.drawing_exports TO authenticated;
GRANT ALL ON public.drawing_exports TO service_role;

CREATE INDEX IF NOT EXISTS drawing_exports_project_id_idx ON public.drawing_exports(project_id);
CREATE INDEX IF NOT EXISTS drawing_exports_generated_at_idx ON public.drawing_exports(project_id, generated_at DESC);

ALTER TABLE public.drawing_exports ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.drawing_exports FROM anon;

DROP POLICY IF EXISTS "Ejere ser egne eksporter" ON public.drawing_exports;
CREATE POLICY "Ejere ser egne eksporter" ON public.drawing_exports FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = drawing_exports.project_id AND p.user_id = (SELECT auth.uid())));
DROP POLICY IF EXISTS "Ejere opretter eksporter" ON public.drawing_exports;
CREATE POLICY "Ejere opretter eksporter" ON public.drawing_exports FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = drawing_exports.project_id AND p.user_id = (SELECT auth.uid())));
DROP POLICY IF EXISTS "Ejere opdaterer egne eksporter" ON public.drawing_exports;
CREATE POLICY "Ejere opdaterer egne eksporter" ON public.drawing_exports FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = drawing_exports.project_id AND p.user_id = (SELECT auth.uid())))
  WITH CHECK (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = drawing_exports.project_id AND p.user_id = (SELECT auth.uid())));

-- ============ 20260530120000_floor_plan_iterations.sql ============
CREATE TABLE IF NOT EXISTS public.floor_plan_iterations (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id              uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  design_iteration_id     uuid REFERENCES public.design_iterations(id) ON DELETE SET NULL,
  version                 integer NOT NULL DEFAULT 1,
  is_active               boolean NOT NULL DEFAULT true,
  schema_version          text NOT NULL DEFAULT 'floor-plan.v1',
  floor_plan_json         jsonb NOT NULL,
  model_hash              text NOT NULL,
  verification_status     text NOT NULL DEFAULT 'CONCEPT_DRAFT'
                          CHECK (verification_status IN (
                            'CONCEPT_DRAFT','TECHNICAL_REVIEW','AUTHORITY_REVIEW',
                            'DOCUMENTATION_REQUIRED','BLOCKED')),
  gross_area_m2           double precision,
  net_area_m2             double precision,
  footprint_area_m2       double precision,
  levels_count            integer NOT NULL DEFAULT 0,
  rooms_count             integer NOT NULL DEFAULT 0,
  wall_length_total_m     double precision,
  exterior_wall_length_m  double precision,
  openings_count          integer NOT NULL DEFAULT 0,
  material_basis_readiness text NOT NULL DEFAULT 'NOT_READY'
                          CHECK (material_basis_readiness IN (
                            'NOT_READY','GEOMETRY_ONLY','ASSEMBLIES_ASSIGNED',
                            'READY_FOR_ESTIMATE','READY_FOR_QUANTITY_TAKEOFF')),
  created_at              timestamptz NOT NULL DEFAULT now(),
  created_by              uuid
);

GRANT SELECT, INSERT, UPDATE ON public.floor_plan_iterations TO authenticated;
GRANT ALL ON public.floor_plan_iterations TO service_role;
REVOKE ALL ON public.floor_plan_iterations FROM anon;

CREATE UNIQUE INDEX IF NOT EXISTS floor_plan_iterations_one_active_per_project
  ON public.floor_plan_iterations(project_id) WHERE is_active;
CREATE INDEX IF NOT EXISTS floor_plan_iterations_project_version_idx
  ON public.floor_plan_iterations(project_id, version DESC);

ALTER TABLE public.floor_plan_iterations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Ejere ser egne plantegninger" ON public.floor_plan_iterations;
CREATE POLICY "Ejere ser egne plantegninger" ON public.floor_plan_iterations FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = floor_plan_iterations.project_id AND p.user_id = (SELECT auth.uid())));
DROP POLICY IF EXISTS "Ejere opretter plantegninger" ON public.floor_plan_iterations;
CREATE POLICY "Ejere opretter plantegninger" ON public.floor_plan_iterations FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = floor_plan_iterations.project_id AND p.user_id = (SELECT auth.uid())));
DROP POLICY IF EXISTS "Ejere opdaterer egne plantegninger" ON public.floor_plan_iterations;
CREATE POLICY "Ejere opdaterer egne plantegninger" ON public.floor_plan_iterations FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = floor_plan_iterations.project_id AND p.user_id = (SELECT auth.uid())))
  WITH CHECK (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = floor_plan_iterations.project_id AND p.user_id = (SELECT auth.uid())));

-- ============ 20260530120001_floor_plan_commands.sql ============
CREATE TABLE IF NOT EXISTS public.floor_plan_commands (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  floor_plan_iteration_id  uuid NOT NULL REFERENCES public.floor_plan_iterations(id) ON DELETE CASCADE,
  project_id               uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  command_index            integer NOT NULL,
  command_json             jsonb NOT NULL,
  command_hash             text NOT NULL,
  source                   text NOT NULL CHECK (source IN ('drag','keyboard','ai','system')),
  created_at               timestamptz NOT NULL DEFAULT now(),
  created_by               uuid,
  UNIQUE (floor_plan_iteration_id, command_index)
);

GRANT SELECT, INSERT ON public.floor_plan_commands TO authenticated;
GRANT ALL ON public.floor_plan_commands TO service_role;
REVOKE ALL ON public.floor_plan_commands FROM anon;

CREATE INDEX IF NOT EXISTS floor_plan_commands_iteration_idx
  ON public.floor_plan_commands(floor_plan_iteration_id, command_index);

ALTER TABLE public.floor_plan_commands ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Ejere ser egne commands" ON public.floor_plan_commands;
CREATE POLICY "Ejere ser egne commands" ON public.floor_plan_commands FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = floor_plan_commands.project_id AND p.user_id = (SELECT auth.uid())));
DROP POLICY IF EXISTS "Ejere opretter commands" ON public.floor_plan_commands;
CREATE POLICY "Ejere opretter commands" ON public.floor_plan_commands FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = floor_plan_commands.project_id AND p.user_id = (SELECT auth.uid())));

-- ============ 20260530120002_floor_plan_verifications.sql ============
CREATE TABLE IF NOT EXISTS public.floor_plan_verifications (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id                uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  floor_plan_iteration_id   uuid NOT NULL REFERENCES public.floor_plan_iterations(id) ON DELETE CASCADE,
  input_hash                text NOT NULL,
  status                    text NOT NULL CHECK (status IN (
                              'CONCEPT_DRAFT','TECHNICAL_REVIEW','AUTHORITY_REVIEW',
                              'DOCUMENTATION_REQUIRED','BLOCKED')),
  findings_json             jsonb NOT NULL DEFAULT '[]'::jsonb,
  missing_data_points_json  jsonb NOT NULL DEFAULT '[]'::jsonb,
  verified_at               timestamptz NOT NULL DEFAULT now(),
  verified_by               uuid,
  rule_engine_snapshot_id   uuid
);

GRANT SELECT, INSERT ON public.floor_plan_verifications TO authenticated;
GRANT ALL ON public.floor_plan_verifications TO service_role;
REVOKE ALL ON public.floor_plan_verifications FROM anon;

CREATE INDEX IF NOT EXISTS floor_plan_verifications_iteration_idx
  ON public.floor_plan_verifications(floor_plan_iteration_id, verified_at DESC);
CREATE INDEX IF NOT EXISTS floor_plan_verifications_input_hash_idx
  ON public.floor_plan_verifications(floor_plan_iteration_id, input_hash);

ALTER TABLE public.floor_plan_verifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Ejere ser egne verifikationer" ON public.floor_plan_verifications;
CREATE POLICY "Ejere ser egne verifikationer" ON public.floor_plan_verifications FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = floor_plan_verifications.project_id AND p.user_id = (SELECT auth.uid())));
DROP POLICY IF EXISTS "Ejere opretter verifikationer" ON public.floor_plan_verifications;
CREATE POLICY "Ejere opretter verifikationer" ON public.floor_plan_verifications FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = floor_plan_verifications.project_id AND p.user_id = (SELECT auth.uid())));

-- ============ 20260530120003_floor_plan_exports.sql ============
CREATE TABLE IF NOT EXISTS public.floor_plan_exports (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id               uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  floor_plan_iteration_id  uuid NOT NULL REFERENCES public.floor_plan_iterations(id) ON DELETE CASCADE,
  drawing_type             text NOT NULL DEFAULT 'floor_plan',
  readiness_status         text NOT NULL,
  svg_path                 text,
  pdf_path                 text,
  input_hash               text NOT NULL,
  generated_at             timestamptz NOT NULL DEFAULT now(),
  approved_at              timestamptz,
  approved_by              uuid
);

GRANT SELECT, INSERT, UPDATE ON public.floor_plan_exports TO authenticated;
GRANT ALL ON public.floor_plan_exports TO service_role;
REVOKE ALL ON public.floor_plan_exports FROM anon;

CREATE INDEX IF NOT EXISTS floor_plan_exports_iteration_idx
  ON public.floor_plan_exports(floor_plan_iteration_id, generated_at DESC);

ALTER TABLE public.floor_plan_exports ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Ejere ser egne plantegnings-eksporter" ON public.floor_plan_exports;
CREATE POLICY "Ejere ser egne plantegnings-eksporter" ON public.floor_plan_exports FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = floor_plan_exports.project_id AND p.user_id = (SELECT auth.uid())));
DROP POLICY IF EXISTS "Ejere opretter plantegnings-eksporter" ON public.floor_plan_exports;
CREATE POLICY "Ejere opretter plantegnings-eksporter" ON public.floor_plan_exports FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = floor_plan_exports.project_id AND p.user_id = (SELECT auth.uid())));
DROP POLICY IF EXISTS "Ejere opdaterer egne plantegnings-eksporter" ON public.floor_plan_exports;
CREATE POLICY "Ejere opdaterer egne plantegnings-eksporter" ON public.floor_plan_exports FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = floor_plan_exports.project_id AND p.user_id = (SELECT auth.uid())))
  WITH CHECK (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = floor_plan_exports.project_id AND p.user_id = (SELECT auth.uid())));

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS adresse_dar_id    TEXT,
  ADD COLUMN IF NOT EXISTS bfe_nr            TEXT,
  ADD COLUMN IF NOT EXISTS budget_estimate   BIGINT,
  ADD COLUMN IF NOT EXISTS hard_stop         BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS hard_stop_reason  TEXT,
  ADD COLUMN IF NOT EXISTS heritage_save_value SMALLINT CHECK (heritage_save_value BETWEEN 1 AND 9),
  ADD COLUMN IF NOT EXISTS is_fredet         BOOLEAN,
  ADD COLUMN IF NOT EXISTS grundareal_m2     FLOAT,
  ADD COLUMN IF NOT EXISTS bebygget_areal_m2 FLOAT;

UPDATE public.projects
SET adresse_dar_id = address_adresseid
WHERE adresse_dar_id IS NULL AND address_adresseid IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.site_constraints (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  address_id                  TEXT NOT NULL UNIQUE REFERENCES public.address_analysis(address_id) ON DELETE CASCADE,
  max_bebyggelsesprocent      FLOAT,
  max_height_m                FLOAT,
  max_etager                  SMALLINT,
  min_distance_to_boundary_m  FLOAT,
  save_value                  SMALLINT CHECK (save_value BETWEEN 1 AND 9),
  is_fredet                   BOOLEAN,
  strandbeskyttelse           BOOLEAN NOT NULL DEFAULT false,
  fredskov                    BOOLEAN NOT NULL DEFAULT false,
  klitfredning                BOOLEAN NOT NULL DEFAULT false,
  soil_contamination_status   TEXT CHECK (soil_contamination_status IN ('clean','registered','contaminated','unknown')),
  source_lokalplan_id         TEXT,
  source_kommuneplan_id       TEXT,
  confidence                  TEXT NOT NULL DEFAULT 'estimated' CHECK (confidence IN ('confirmed','estimated','missing')),
  extracted_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS site_constraints_set_updated_at ON public.site_constraints;
CREATE TRIGGER site_constraints_set_updated_at BEFORE UPDATE ON public.site_constraints FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.site_constraints ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "authenticated_read_site_constraints" ON public.site_constraints;
CREATE POLICY "authenticated_read_site_constraints" ON public.site_constraints FOR SELECT TO authenticated USING (true);

CREATE TABLE IF NOT EXISTS public.design_iterations (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id          UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  version             SMALLINT NOT NULL DEFAULT 1,
  is_active           BOOLEAN NOT NULL DEFAULT true,
  label               TEXT,
  area_m2             FLOAT,
  floors              SMALLINT,
  description         TEXT,
  inspirations        JSONB NOT NULL DEFAULT '[]'::jsonb,
  budget_estimate     BIGINT,
  byggeoenske         JSONB,
  hus_dna             JSONB,
  compliance_snapshot JSONB,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS design_iterations_one_active_per_project_idx
  ON public.design_iterations(project_id) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS design_iterations_project_id_idx ON public.design_iterations(project_id);

DROP TRIGGER IF EXISTS design_iterations_set_updated_at ON public.design_iterations;
CREATE TRIGGER design_iterations_set_updated_at BEFORE UPDATE ON public.design_iterations FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.design_iterations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "users_own_design_iterations" ON public.design_iterations;
CREATE POLICY "users_own_design_iterations" ON public.design_iterations FOR ALL TO authenticated
  USING (project_id IN (SELECT id FROM public.projects WHERE user_id = auth.uid()))
  WITH CHECK (project_id IN (SELECT id FROM public.projects WHERE user_id = auth.uid()));

CREATE TABLE IF NOT EXISTS public.building_tasks (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id              UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  task_key                TEXT,
  title                   TEXT NOT NULL,
  description             TEXT,
  phase                   TEXT NOT NULL CHECK (phase IN ('sandkassen','matriklen','maskinrummet','myndighed')),
  status                  TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','in_progress','done','blocked','not_applicable')),
  priority                SMALLINT NOT NULL DEFAULT 0,
  is_auto_generated       BOOLEAN NOT NULL DEFAULT true,
  blocked_by_constraint   TEXT,
  due_date                DATE,
  completed_at            TIMESTAMPTZ,
  metadata                JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS building_tasks_project_task_key_idx
  ON public.building_tasks(project_id, task_key) WHERE task_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS building_tasks_project_phase_idx ON public.building_tasks(project_id, phase);
CREATE INDEX IF NOT EXISTS building_tasks_project_status_idx ON public.building_tasks(project_id, status)
  WHERE status IN ('pending','in_progress','blocked');

DROP TRIGGER IF EXISTS building_tasks_set_updated_at ON public.building_tasks;
CREATE TRIGGER building_tasks_set_updated_at BEFORE UPDATE ON public.building_tasks FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.building_tasks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "users_own_building_tasks" ON public.building_tasks;
CREATE POLICY "users_own_building_tasks" ON public.building_tasks FOR ALL TO authenticated
  USING (project_id IN (SELECT id FROM public.projects WHERE user_id = auth.uid()))
  WITH CHECK (project_id IN (SELECT id FROM public.projects WHERE user_id = auth.uid()));

CREATE INDEX IF NOT EXISTS projects_address_adresseid_idx ON public.projects(address_adresseid) WHERE address_adresseid IS NOT NULL;
CREATE INDEX IF NOT EXISTS projects_hard_stop_idx ON public.projects(hard_stop, user_id) WHERE hard_stop = true;
CREATE INDEX IF NOT EXISTS projects_user_updated_idx ON public.projects(user_id, updated_at DESC);
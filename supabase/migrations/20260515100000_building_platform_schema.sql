-- =============================================================================
-- Building Platform Schema v1
-- ARCH-157 / ARCH-158 — Transition from "AI Experiment" to "Building Platform"
--
-- What this migration does (in safe execution order):
--   1. Extend `projects` with typed identifier columns (adresse_dar_id, bfe_nr,
--      budget_estimate, hard_stop, hard_stop_reason)
--   2. Create `site_constraints` — typed Hard Stop data, keyed by address_id
--   3. Backfill `site_constraints` from existing address_analysis rows (best-effort)
--   4. Backfill `site_constraints` from existing projects rows (fills gaps)
--   5. Create `design_iterations` — versioned user designs
--   6. Migrate existing design data (area, floors, description, inspirations,
--      brief_data) from projects into design_iterations (version 1, is_active)
--   7. Create `building_tasks` — user-facing Building Timeline
--   8. Consolidate projekter → projects (projekter has zero TypeScript reads/writes)
--   9. Indexes for Validation Engine query performance
--
-- Rollback notes are inline on each step.
-- A full database backup should exist before running in production.
-- =============================================================================


-- =============================================================================
-- STEP 1: Extend `projects` with typed columns
-- All columns are nullable with no DEFAULT change — existing INSERTs are safe.
-- =============================================================================

ALTER TABLE public.projects
  -- Standard Danish property identifiers
  ADD COLUMN IF NOT EXISTS adresse_dar_id    TEXT,        -- DAR UUID (same value as address_adresseid, explicit alias)
  ADD COLUMN IF NOT EXISTS bfe_nr            TEXT,        -- BFE number from EBR (ejendomsbeliggenhed)

  -- Budget as typed integer alongside the legacy text field.
  -- The text `budget` column is kept until all client writes are migrated.
  ADD COLUMN IF NOT EXISTS budget_estimate   BIGINT,      -- DKK, total project budget

  -- Hard Stop flags written by the compliance pipeline (ARCH-157)
  ADD COLUMN IF NOT EXISTS hard_stop         BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS hard_stop_reason  TEXT;        -- human-readable reason for the hard stop

-- Backfill adresse_dar_id from address_adresseid (same data, explicit column)
UPDATE public.projects
SET adresse_dar_id = address_adresseid
WHERE adresse_dar_id IS NULL AND address_adresseid IS NOT NULL;

-- Backfill budget_estimate from the legacy text budget field.
-- Strips all non-digit characters (handles "3.500.000 kr", "3,500,000").
-- Rejects values with fewer than 4 digits to avoid parsing "2,5 mio" as "25".
UPDATE public.projects
SET budget_estimate = NULLIF(regexp_replace(budget, '[^0-9]', '', 'g'), '')::BIGINT
WHERE budget IS NOT NULL
  AND budget != ''
  AND length(regexp_replace(budget, '[^0-9]', '', 'g')) >= 4;

-- ROLLBACK STEP 1:
-- ALTER TABLE public.projects
--   DROP COLUMN IF EXISTS adresse_dar_id,
--   DROP COLUMN IF EXISTS bfe_nr,
--   DROP COLUMN IF EXISTS budget_estimate,
--   DROP COLUMN IF EXISTS hard_stop,
--   DROP COLUMN IF EXISTS hard_stop_reason;


-- =============================================================================
-- STEP 2: Create `site_constraints`
--
-- Physical and regulatory constraints for a Danish plot.
-- Keyed by address_id (same key as address_analysis) — shared across users,
-- just like the address_analysis cache. Multiple projects on the same address
-- read from the same site_constraints row.
--
-- The Validation Engine reads this table exclusively to evaluate Hard Stops.
-- It NEVER reads compliance_data JSONB for constraint values.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.site_constraints (
  id                          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Links to the shared address analysis cache
  address_id                  TEXT        NOT NULL UNIQUE
                              REFERENCES  public.address_analysis(address_id)
                              ON DELETE CASCADE,

  -- ── Lokalplan / Kommuneplan constraints ──────────────────────────────────
  -- Hierarchy: lokalplan value overrides kommuneplan which overrides BR18 default.
  -- NULL = constraint not found in source data; Validation Engine falls back
  -- to the standard BR18 limit for the relevant zone.

  max_bebyggelsesprocent      FLOAT,      -- % of grundareal that may be built on
  max_height_m                FLOAT,      -- max ridge height in metres (BR18 §180/§182)
  max_etager                  SMALLINT,   -- max number of storeys
  min_distance_to_boundary_m  FLOAT,      -- min setback from plot boundary in metres

  -- ── Heritage and legal protection ────────────────────────────────────────
  save_value                  SMALLINT    CHECK (save_value BETWEEN 1 AND 9),
    -- FBB SAVE scale (1 = highest heritage, 9 = no value).
    -- Triggers:
    --   save_value <= 3  → dispensation_required (Slots- og Kulturstyrelsen)
    --   save_value = 4   → warning (Kommunens tekniske forvaltning, §14-forbud)

  is_fredet                   BOOLEAN,    -- BBR byg070 Fredningsgrad ≠ null/0

  -- ── Absolute build-stop flags ────────────────────────────────────────────
  -- These three come from MAT_Jordstykke (live data, not SDFI mock).
  strandbeskyttelse           BOOLEAN     NOT NULL DEFAULT false,
  fredskov                    BOOLEAN     NOT NULL DEFAULT false,
  klitfredning                BOOLEAN     NOT NULL DEFAULT false,

  -- ── Environmental constraints ─────────────────────────────────────────────
  soil_contamination_status   TEXT        CHECK (
                                soil_contamination_status IN (
                                  'clean', 'registered', 'contaminated', 'unknown'
                                )
                              ),
    -- DK-Jord classification:
    --   'contaminated' → site investigation required before building permit
    --   'registered'   → advisory; investigate before purchase

  -- ── Source tracking ──────────────────────────────────────────────────────
  source_lokalplan_id         TEXT,       -- which lokalplan these constraints come from
  source_kommuneplan_id       TEXT,       -- fallback kommuneplan id

  confidence                  TEXT        NOT NULL DEFAULT 'estimated'
                              CHECK (confidence IN ('confirmed', 'estimated', 'missing')),
    -- 'confirmed'  → value read directly from a typed register (BBR, MAT)
    -- 'estimated'  → value extracted from JSONB / PDF; may have parsing errors
    -- 'missing'    → data source returned null; BR18 default applies

  extracted_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER site_constraints_set_updated_at
  BEFORE UPDATE ON public.site_constraints
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Performance indexes for Validation Engine queries
CREATE INDEX IF NOT EXISTS site_constraints_save_value_idx
  ON public.site_constraints(save_value)
  WHERE save_value IS NOT NULL;

CREATE INDEX IF NOT EXISTS site_constraints_hard_stop_flags_idx
  ON public.site_constraints(is_fredet, strandbeskyttelse, fredskov, klitfredning)
  WHERE is_fredet = true OR strandbeskyttelse = true
     OR fredskov = true OR klitfredning = true;

ALTER TABLE public.site_constraints ENABLE ROW LEVEL SECURITY;

-- Authenticated users can read constraints (same open-read pattern as address_analysis)
CREATE POLICY "authenticated_read_site_constraints"
  ON public.site_constraints FOR SELECT
  TO authenticated
  USING (true);

-- Only service role may insert/update (called from createServerFn in the compliance pipeline)
-- No explicit INSERT policy needed — service role bypasses RLS by default.

COMMENT ON TABLE public.site_constraints IS
  'Physical and regulatory constraints for a Danish plot. '
  'Shared across users (keyed by address_id). '
  'The Validation Engine reads ONLY this table for Hard Stop checks — '
  'never reads compliance_data JSONB directly for constraint values.';

-- ROLLBACK STEP 2:
-- DROP TABLE IF EXISTS public.site_constraints CASCADE;


-- =============================================================================
-- STEP 3: Backfill site_constraints from address_analysis
--
-- Best-effort extraction from compliance_result JSONB.
-- NULL values are acceptable and expected — confidence = 'estimated'.
-- Known JSONB structure (from project-persistence.ts):
--
--   compliance_result.kommuneplanramme.bebygpct         → max_bebyggelsesprocent
--   compliance_result.kommuneplanramme.maxbygnhjd       → max_height_m
--   compliance_result.kommuneplanramme.maxetager        → max_etager
--   compliance_result.fbbData.fbb_bedste_bygning
--                            .bevaringsvaerdi           → save_value
--   compliance_result.bbr.fredet                        → is_fredet
--   compliance_result.bbr.mat_strandbeskyttelse         → strandbeskyttelse
--   compliance_result.bbr.mat_fredskov                  → fredskov
--   compliance_result.bbr.mat_klitfredning              → klitfredning
--   compliance_result.dkjord.status                     → soil_contamination_status
--   compliance_result.lokalplaner[0].id                 → source_lokalplan_id
-- =============================================================================

INSERT INTO public.site_constraints (
  address_id,
  max_bebyggelsesprocent,
  max_height_m,
  max_etager,
  save_value,
  is_fredet,
  strandbeskyttelse,
  fredskov,
  klitfredning,
  soil_contamination_status,
  source_lokalplan_id,
  confidence
)
SELECT
  aa.address_id,

  -- Bebyggelsesprocent: kommuneplan bebygpct
  CASE
    WHEN (aa.compliance_result -> 'kommuneplanramme' ->> 'bebygpct') ~ '^[0-9]+(\.[0-9]+)?$'
    THEN (aa.compliance_result -> 'kommuneplanramme' ->> 'bebygpct')::FLOAT
    ELSE NULL
  END,

  -- Max height: kommuneplan maxbygnhjd
  CASE
    WHEN (aa.compliance_result -> 'kommuneplanramme' ->> 'maxbygnhjd') ~ '^[0-9]+(\.[0-9]+)?$'
    THEN (aa.compliance_result -> 'kommuneplanramme' ->> 'maxbygnhjd')::FLOAT
    ELSE NULL
  END,

  -- Max etager: kommuneplan maxetager
  CASE
    WHEN (aa.compliance_result -> 'kommuneplanramme' ->> 'maxetager') ~ '^[0-9]+$'
    THEN (aa.compliance_result -> 'kommuneplanramme' ->> 'maxetager')::SMALLINT
    ELSE NULL
  END,

  -- SAVE value from FBB data
  CASE
    WHEN (aa.compliance_result -> 'fbbData' -> 'fbb_bedste_bygning' ->> 'bevaringsvaerdi') ~ '^[1-9]$'
    THEN (aa.compliance_result -> 'fbbData' -> 'fbb_bedste_bygning' ->> 'bevaringsvaerdi')::SMALLINT
    ELSE NULL
  END,

  -- is_fredet from BBR byg070 (stored as boolean in JSON → 'true'/'false')
  CASE
    WHEN (aa.compliance_result -> 'bbr' ->> 'fredet') IN ('true', '1')  THEN true
    WHEN (aa.compliance_result -> 'bbr' ->> 'fredet') IN ('false', '0', 'null') THEN false
    ELSE NULL
  END,

  -- strandbeskyttelse, fredskov, klitfredning (boolean fields on BbrKompliantData)
  COALESCE(
    CASE WHEN (aa.compliance_result -> 'bbr' ->> 'mat_strandbeskyttelse') = 'true' THEN true
         WHEN (aa.compliance_result -> 'bbr' ->> 'mat_strandbeskyttelse') = 'false' THEN false
         ELSE NULL END,
    false
  ),
  COALESCE(
    CASE WHEN (aa.compliance_result -> 'bbr' ->> 'mat_fredskov') = 'true' THEN true
         WHEN (aa.compliance_result -> 'bbr' ->> 'mat_fredskov') = 'false' THEN false
         ELSE NULL END,
    false
  ),
  COALESCE(
    CASE WHEN (aa.compliance_result -> 'bbr' ->> 'mat_klitfredning') = 'true' THEN true
         WHEN (aa.compliance_result -> 'bbr' ->> 'mat_klitfredning') = 'false' THEN false
         ELSE NULL END,
    false
  ),

  -- Soil contamination from DK-Jord — map known DK-Jord status values
  CASE
    WHEN (aa.compliance_result -> 'dkjord' ->> 'status') IS NULL THEN NULL
    WHEN (aa.compliance_result -> 'dkjord' ->> 'status') ILIKE '%ren%'     THEN 'clean'
    WHEN (aa.compliance_result -> 'dkjord' ->> 'status') ILIKE '%foruren%' THEN 'contaminated'
    WHEN (aa.compliance_result -> 'dkjord' ->> 'status') ILIKE '%kortlag%' THEN 'registered'
    ELSE 'unknown'
  END,

  -- First lokalplan ID as source reference
  (aa.compliance_result -> 'lokalplaner' -> 0 ->> 'id'),

  'estimated'

FROM public.address_analysis aa
WHERE aa.compliance_result IS NOT NULL
ON CONFLICT (address_id) DO NOTHING;


-- =============================================================================
-- STEP 4: Backfill site_constraints from projects.compliance_data
--
-- Catches any addresses where address_analysis has no row but projects do.
-- Uses UPSERT so it never overwrites data from Step 3.
-- =============================================================================

INSERT INTO public.site_constraints (
  address_id,
  max_bebyggelsesprocent,
  max_height_m,
  max_etager,
  save_value,
  is_fredet,
  strandbeskyttelse,
  fredskov,
  klitfredning,
  soil_contamination_status,
  source_lokalplan_id,
  confidence
)
SELECT DISTINCT ON (p.address_adresseid)
  p.address_adresseid,

  CASE
    WHEN (p.compliance_data -> 'kommuneplanramme' ->> 'bebygpct') ~ '^[0-9]+(\.[0-9]+)?$'
    THEN (p.compliance_data -> 'kommuneplanramme' ->> 'bebygpct')::FLOAT
    ELSE NULL
  END,
  CASE
    WHEN (p.compliance_data -> 'kommuneplanramme' ->> 'maxbygnhjd') ~ '^[0-9]+(\.[0-9]+)?$'
    THEN (p.compliance_data -> 'kommuneplanramme' ->> 'maxbygnhjd')::FLOAT
    ELSE NULL
  END,
  CASE
    WHEN (p.compliance_data -> 'kommuneplanramme' ->> 'maxetager') ~ '^[0-9]+$'
    THEN (p.compliance_data -> 'kommuneplanramme' ->> 'maxetager')::SMALLINT
    ELSE NULL
  END,
  CASE
    WHEN (p.compliance_data -> 'fbbData' -> 'fbb_bedste_bygning' ->> 'bevaringsvaerdi') ~ '^[1-9]$'
    THEN (p.compliance_data -> 'fbbData' -> 'fbb_bedste_bygning' ->> 'bevaringsvaerdi')::SMALLINT
    ELSE NULL
  END,
  CASE
    WHEN (p.compliance_data -> 'bbr' ->> 'fredet') IN ('true', '1')  THEN true
    WHEN (p.compliance_data -> 'bbr' ->> 'fredet') IN ('false', '0', 'null') THEN false
    ELSE NULL
  END,
  COALESCE(
    CASE WHEN (p.compliance_data -> 'bbr' ->> 'mat_strandbeskyttelse') = 'true' THEN true
         WHEN (p.compliance_data -> 'bbr' ->> 'mat_strandbeskyttelse') = 'false' THEN false
         ELSE NULL END,
    false
  ),
  COALESCE(
    CASE WHEN (p.compliance_data -> 'bbr' ->> 'mat_fredskov') = 'true' THEN true
         WHEN (p.compliance_data -> 'bbr' ->> 'mat_fredskov') = 'false' THEN false
         ELSE NULL END,
    false
  ),
  COALESCE(
    CASE WHEN (p.compliance_data -> 'bbr' ->> 'mat_klitfredning') = 'true' THEN true
         WHEN (p.compliance_data -> 'bbr' ->> 'mat_klitfredning') = 'false' THEN false
         ELSE NULL END,
    false
  ),
  CASE
    WHEN (p.compliance_data -> 'dkjord' ->> 'status') IS NULL THEN NULL
    WHEN (p.compliance_data -> 'dkjord' ->> 'status') ILIKE '%ren%'     THEN 'clean'
    WHEN (p.compliance_data -> 'dkjord' ->> 'status') ILIKE '%foruren%' THEN 'contaminated'
    WHEN (p.compliance_data -> 'dkjord' ->> 'status') ILIKE '%kortlag%' THEN 'registered'
    ELSE 'unknown'
  END,
  (p.compliance_data -> 'lokalplaner' -> 0 ->> 'id'),
  'estimated'

FROM public.projects p
-- Only process projects that have an address_analysis row (required by FK)
WHERE p.address_adresseid IS NOT NULL
  AND p.compliance_data IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.address_analysis aa
    WHERE aa.address_id = p.address_adresseid
  )
ORDER BY p.address_adresseid, p.updated_at DESC

ON CONFLICT (address_id) DO UPDATE SET
  -- Fill in NULLs from address_analysis with data from projects, but never overwrite
  max_bebyggelsesprocent   = COALESCE(site_constraints.max_bebyggelsesprocent,   EXCLUDED.max_bebyggelsesprocent),
  max_height_m             = COALESCE(site_constraints.max_height_m,             EXCLUDED.max_height_m),
  max_etager               = COALESCE(site_constraints.max_etager,               EXCLUDED.max_etager),
  save_value               = COALESCE(site_constraints.save_value,               EXCLUDED.save_value),
  is_fredet                = COALESCE(site_constraints.is_fredet,                EXCLUDED.is_fredet),
  soil_contamination_status = COALESCE(site_constraints.soil_contamination_status, EXCLUDED.soil_contamination_status),
  source_lokalplan_id      = COALESCE(site_constraints.source_lokalplan_id,      EXCLUDED.source_lokalplan_id),
  updated_at               = now();


-- =============================================================================
-- STEP 5: Create `design_iterations`
--
-- Versioned user designs, decoupled from the compliance data and site facts.
-- The Validation Engine reads this table for the DESIGN side of the comparison.
-- One row is active per project at any time (enforced by partial unique index).
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.design_iterations (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id          UUID        NOT NULL
                      REFERENCES  public.projects(id) ON DELETE CASCADE,

  -- Version control
  version             SMALLINT    NOT NULL DEFAULT 1,
  is_active           BOOLEAN     NOT NULL DEFAULT true,
  label               TEXT,                     -- user-given name, e.g. "Drømmehuset v2"

  -- Design parameters (migrated from projects.area / floors / description / inspirations)
  area_m2             FLOAT,                    -- desired gross floor area in m²
  floors              SMALLINT,                 -- desired number of storeys
  description         TEXT,                     -- free-text design brief

  -- Inspiration images (migrated from projects.inspirations JSONB)
  inspirations        JSONB       NOT NULL DEFAULT '[]'::jsonb,

  -- Typed budget (migrated from projects.budget TEXT)
  budget_estimate     BIGINT,                   -- DKK, total project budget

  -- Full Byggeoenske object (from projects.brief_data where it is a Byggeoenske)
  byggeoenske         JSONB,

  -- AI-generated HusDna concept (from projects.brief_data where it is a HusDna)
  hus_dna             JSONB,

  -- Cached RuleEngineResult snapshot at the time this version was saved.
  -- Allows showing the compliance state of any past version without re-running.
  compliance_snapshot JSONB,

  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Only one active design per project at a time.
-- To activate a new version: UPDATE SET is_active = false WHERE project_id = X AND is_active = true,
-- then INSERT new row with is_active = true.
CREATE UNIQUE INDEX IF NOT EXISTS design_iterations_one_active_per_project_idx
  ON public.design_iterations(project_id)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS design_iterations_project_id_idx
  ON public.design_iterations(project_id);

CREATE TRIGGER design_iterations_set_updated_at
  BEFORE UPDATE ON public.design_iterations
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE public.design_iterations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_own_design_iterations"
  ON public.design_iterations FOR ALL
  TO authenticated
  USING (
    project_id IN (
      SELECT id FROM public.projects WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    project_id IN (
      SELECT id FROM public.projects WHERE user_id = auth.uid()
    )
  );

COMMENT ON TABLE public.design_iterations IS
  'Versioned user designs. One active iteration per project (enforced by partial unique index). '
  'The Validation Engine compares design_iterations against site_constraints to compute compliance. '
  'Query pattern: SELECT * FROM design_iterations WHERE project_id = $1 AND is_active = true.';

COMMENT ON COLUMN public.design_iterations.compliance_snapshot IS
  'Cached RuleEngineResult at save time. Allows replaying the compliance state of any past version. '
  'Do NOT use this as the live compliance check — always run the rule engine against current site_constraints.';

-- ROLLBACK STEP 5:
-- DROP TABLE IF EXISTS public.design_iterations CASCADE;


-- =============================================================================
-- STEP 6: Migrate design data from projects → design_iterations
--
-- Creates one initial active iteration (version 1) for every project that
-- has at least one design field populated. Projects with no design data are
-- skipped — they'll get their first iteration when the user starts designing.
-- =============================================================================

INSERT INTO public.design_iterations (
  project_id,
  version,
  is_active,
  label,
  area_m2,
  floors,
  description,
  inspirations,
  budget_estimate,
  byggeoenske,
  hus_dna,
  created_at
)
SELECT
  p.id,
  1,
  true,
  'Version 1',

  -- area: text → float (handles "120 m2", "120", "120.5")
  CASE
    WHEN regexp_replace(p.area, '[^0-9\.]', '', 'g') ~ '^[0-9]+(\.[0-9]+)?$'
    THEN regexp_replace(p.area, '[^0-9\.]', '', 'g')::FLOAT
    ELSE NULL
  END,

  -- floors: text → smallint
  CASE
    WHEN p.floors ~ '^[0-9]+$' THEN p.floors::SMALLINT
    ELSE NULL
  END,

  p.description,
  COALESCE(p.inspirations, '[]'::jsonb),

  -- Re-use the already-backfilled budget_estimate column from Step 1
  p.budget_estimate,

  -- Byggeoenske: brief_data is a Byggeoenske when it has 'husstands_type' or 'boligType'
  -- (HusDna has 'stil' and 'bruttoareal' but not 'husstands_type')
  CASE
    WHEN p.brief_data ? 'husstands_type' OR p.brief_data ? 'boligType'
    THEN p.brief_data
    ELSE NULL
  END,

  -- HusDna: brief_data is a HusDna when it has 'stil' and 'bruttoareal'
  CASE
    WHEN p.brief_data ? 'stil' AND p.brief_data ? 'bruttoareal'
    THEN p.brief_data
    ELSE NULL
  END,

  p.created_at

FROM public.projects p
WHERE
  -- Only migrate projects that have actual design content
  p.area IS NOT NULL
  OR p.floors IS NOT NULL
  OR p.description IS NOT NULL
  OR (p.inspirations IS NOT NULL AND p.inspirations != '[]'::jsonb)
  OR p.budget IS NOT NULL
  OR p.brief_data IS NOT NULL;

-- Note: We do NOT drop area, floors, description, budget, inspirations, brief_data
-- from projects yet. The client reads these columns via project-persistence.ts
-- (a protected file). Deprecation of those columns is a separate migration after
-- all client reads are migrated to design_iterations.


-- =============================================================================
-- STEP 7: Create `building_tasks`
--
-- User-facing building journey tasks — "The Building Timeline".
-- Decoupled from agent_tasks (technical AI infrastructure logging).
-- Maps one-to-many to a project; grouped by phase (the four Cockpit phases).
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.building_tasks (
  id                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id              UUID        NOT NULL
                          REFERENCES  public.projects(id) ON DELETE CASCADE,

  -- Task identity (machine-readable key for deduplication and i18n)
  task_key                TEXT,       -- 'jordbundsprove' | 'nabohoring' | 'nedrivningsansoegning' etc.

  title                   TEXT        NOT NULL,   -- "Bestil jordbundsprøve"
  description             TEXT,

  -- Journey phase (mirrors the four Cockpit phases)
  phase                   TEXT        NOT NULL
                          CHECK (phase IN ('sandkassen', 'matriklen', 'maskinrummet', 'myndighed')),

  -- Lifecycle
  status                  TEXT        NOT NULL DEFAULT 'pending'
                          CHECK (status IN ('pending', 'in_progress', 'done', 'blocked', 'not_applicable')),

  -- Display ordering within phase (lower number = shown first)
  priority                SMALLINT    NOT NULL DEFAULT 0,

  -- Origin: system-generated tasks vs user-created tasks
  is_auto_generated       BOOLEAN     NOT NULL DEFAULT true,

  -- When status = 'blocked': which site_constraint field is blocking this task.
  -- Example: 'save_value_4' means the task is blocked because SAVE = 4.
  -- The UI can link this to the relevant site_constraints column for user guidance.
  blocked_by_constraint   TEXT,

  due_date                DATE,
  completed_at            TIMESTAMPTZ,

  -- Flexible metadata: cost estimates, external links, contact info
  -- Example: { "estimated_cost_dkk": 25000, "vendor_url": "...", "kommune_link": "..." }
  metadata                JSONB       NOT NULL DEFAULT '{}'::jsonb,

  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Deduplication: only one instance of each task_key per project
CREATE UNIQUE INDEX IF NOT EXISTS building_tasks_project_task_key_idx
  ON public.building_tasks(project_id, task_key)
  WHERE task_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS building_tasks_project_phase_idx
  ON public.building_tasks(project_id, phase);

CREATE INDEX IF NOT EXISTS building_tasks_project_status_idx
  ON public.building_tasks(project_id, status)
  WHERE status IN ('pending', 'in_progress', 'blocked');

CREATE TRIGGER building_tasks_set_updated_at
  BEFORE UPDATE ON public.building_tasks
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE public.building_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_own_building_tasks"
  ON public.building_tasks FOR ALL
  TO authenticated
  USING (
    project_id IN (
      SELECT id FROM public.projects WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    project_id IN (
      SELECT id FROM public.projects WHERE user_id = auth.uid()
    )
  );

COMMENT ON TABLE public.building_tasks IS
  'User-facing building journey tasks (The Building Timeline). '
  'Decoupled from agent_tasks (technical AI infrastructure) and agent_sessions. '
  'Grouped by phase: sandkassen | matriklen | maskinrummet | myndighed. '
  'The compliance pipeline auto-generates tasks; users can also create manual tasks.';

COMMENT ON COLUMN public.building_tasks.task_key IS
  'Machine-readable identifier for deduplication. Standard keys: '
  'jordbundsprove | kortlaeg_forsyninger | miljoeundersoegelse | nabohoering | '
  'nedrivningsansoegning | byggesagsansoegning | statik | lca_beregning | '
  'arkitektkonkurrence | finansiering';

-- ROLLBACK STEP 7:
-- DROP TABLE IF EXISTS public.building_tasks CASCADE;


-- =============================================================================
-- STEP 8: Consolidate projekter → projects, then drop projekter
--
-- The projekter table (created in 20260502200000_projekter.sql, ARCH-81) has
-- ZERO TypeScript reads or writes. It is dead code. Confirmed by audit of:
--   - src/integrations/supabase/project-persistence.ts
--   - src/lib/project-sync.ts
--   - src/lib/analysis-orchestrator.ts
--
-- Safety: we copy any non-null adresse_dar_id and project_data_status from
-- projekter rows that can be matched to a projects row before dropping.
-- =============================================================================

-- Copy adresse_dar_id and merge project_data_status where projekter has data
-- that projects doesn't already have.
UPDATE public.projects p
SET
  adresse_dar_id     = COALESCE(p.adresse_dar_id, pr.adresse_dar_id),
  project_data_status = CASE
    WHEN p.project_data_status IS NULL THEN pr.project_data_status
    WHEN pr.project_data_status IS NULL THEN p.project_data_status
    -- JSONB merge: projects values take precedence (right-hand side wins in ||)
    ELSE pr.project_data_status || p.project_data_status
  END
FROM public.projekter pr
WHERE pr.user_id = p.user_id
  AND pr.adresse_dar_id IS NOT NULL
  AND pr.adresse_dar_id = p.address_adresseid;

-- projekter is safe to drop: zero client code references, data preserved above
DROP TABLE IF EXISTS public.projekter;

-- ROLLBACK STEP 8:
-- Cannot restore a dropped table from this migration alone.
-- Restore from database backup if needed.


-- =============================================================================
-- STEP 9: Performance indexes for the Validation Engine
--
-- The core compliance query joins three tables:
--   projects → design_iterations (active design for this project)
--           → site_constraints   (physical constraints for this address)
--
-- Query pattern (pseudocode):
--   SELECT di.*, sc.*
--   FROM design_iterations di
--   JOIN projects p         ON p.id = di.project_id AND di.is_active = true
--   JOIN site_constraints sc ON sc.address_id = p.address_adresseid
--   WHERE di.project_id = $project_id;
-- =============================================================================

-- Index to speed up the projects → site_constraints join via address_adresseid
CREATE INDEX IF NOT EXISTS projects_address_adresseid_idx
  ON public.projects(address_adresseid)
  WHERE address_adresseid IS NOT NULL;

-- Index for Hard Stop dashboard queries
CREATE INDEX IF NOT EXISTS projects_hard_stop_idx
  ON public.projects(hard_stop, user_id)
  WHERE hard_stop = true;

-- Index for project listing queries (existing pattern in project-persistence.ts)
CREATE INDEX IF NOT EXISTS projects_user_updated_idx
  ON public.projects(user_id, updated_at DESC);

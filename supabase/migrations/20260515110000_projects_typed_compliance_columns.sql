-- =============================================================================
-- Typed compliance columns on `projects`
-- Extracted from compliance_data JSONB so the Validation Engine can query
-- without reading into JSON blobs.
--
-- These are project-level denormalizations of address-level facts:
--   heritage_save_value ← fbbData.fbb_bedste_bygning.bevaringsvaerdi
--   is_fredet           ← save.fredet OR bbrData.fredet
--   grundareal_m2       ← bbrData.grundareal (from MAT_Jordstykke)
--   bebygget_areal_m2   ← bbrData.bebygget_areal (from BBR_Bygning)
--
-- The compliance pipeline (project-persistence.ts saveProject) writes these
-- columns in parallel with the JSONB compliance_data field.
-- The legacy JSONB field is kept for backward compatibility until all readers
-- are migrated to the typed columns.
-- =============================================================================

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS heritage_save_value  SMALLINT
    CHECK (heritage_save_value BETWEEN 1 AND 9),
    -- FBB SAVE scale 1–9 (1 = highest heritage value, 9 = none).
    -- NULL = not SAVE-registered (bevaringsvaerdi == -1 in FBB WFS).
    -- Hard Stop rules: <= 3 → dispensation_required; == 4 → warning (§14).

  ADD COLUMN IF NOT EXISTS is_fredet            BOOLEAN,
    -- true = building is listed (fredet) per DAI WFS FREDEDE_BYGNINGER.
    -- NULL = data not yet fetched. false = confirmed not listed.

  ADD COLUMN IF NOT EXISTS grundareal_m2        FLOAT,
    -- Plot area in m² from MAT_Jordstykke (via BbrKompliantData.grundareal).
    -- Used as denominator in bebyggelsesprocent calculation.

  ADD COLUMN IF NOT EXISTS bebygget_areal_m2    FLOAT;
    -- Existing built footprint in m² from BBR (BbrKompliantData.bebygget_areal).
    -- Numerator for current bebyggelsesprocent.

-- Backfill from existing compliance_data JSONB where parseable
UPDATE public.projects
SET
  heritage_save_value = CASE
    WHEN (compliance_data -> 'fbbData' -> 'fbb_bedste_bygning' ->> 'bevaringsvaerdi') ~ '^[1-9]$'
    THEN (compliance_data -> 'fbbData' -> 'fbb_bedste_bygning' ->> 'bevaringsvaerdi')::SMALLINT
    ELSE NULL
  END,
  is_fredet = CASE
    WHEN (compliance_data -> 'bbr' ->> 'fredet') IN ('true', '1')        THEN true
    WHEN (compliance_data -> 'save' ->> 'fredet') = 'true'               THEN true
    WHEN (compliance_data -> 'bbr' ->> 'fredet')  IN ('false', '0', 'null') THEN false
    ELSE NULL
  END,
  grundareal_m2 = CASE
    WHEN (compliance_data -> 'bbr' ->> 'grundareal') ~ '^[0-9]+(\.[0-9]+)?$'
    THEN (compliance_data -> 'bbr' ->> 'grundareal')::FLOAT
    ELSE NULL
  END,
  bebygget_areal_m2 = CASE
    WHEN (compliance_data -> 'bbr' ->> 'bebygget_areal') ~ '^[0-9]+(\.[0-9]+)?$'
    THEN (compliance_data -> 'bbr' ->> 'bebygget_areal')::FLOAT
    ELSE NULL
  END
WHERE compliance_data IS NOT NULL;

-- ROLLBACK:
-- ALTER TABLE public.projects
--   DROP COLUMN IF EXISTS heritage_save_value,
--   DROP COLUMN IF EXISTS is_fredet,
--   DROP COLUMN IF EXISTS grundareal_m2,
--   DROP COLUMN IF EXISTS bebygget_areal_m2;

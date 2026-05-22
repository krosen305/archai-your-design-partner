-- Canonicalize design storage:
-- 1. Backfill an active design_iteration for any legacy projects that still store design in projects.
-- 2. Clear legacy design columns on projects once an active design_iteration exists.

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
  hus_dna
)
SELECT
  p.id,
  1,
  TRUE,
  'Legacy import',
  CASE
    WHEN (p.brief_data ->> 'oensketAreal') ~ '^[0-9]+(\.[0-9]+)?$'
    THEN (p.brief_data ->> 'oensketAreal')::FLOAT
    WHEN regexp_replace(COALESCE(p.area, ''), '[^0-9\.]', '', 'g') ~ '^[0-9]+(\.[0-9]+)?$'
    THEN regexp_replace(p.area, '[^0-9\.]', '', 'g')::FLOAT
    ELSE NULL
  END,
  CASE
    WHEN (p.brief_data ->> 'antalEtager') ~ '^[0-9]+$'
    THEN (p.brief_data ->> 'antalEtager')::SMALLINT
    WHEN COALESCE(p.floors, '') ~ '^[0-9]+$'
    THEN p.floors::SMALLINT
    ELSE NULL
  END,
  COALESCE(p.brief_data ->> 'designDroem', p.description),
  COALESCE(
    CASE
      WHEN jsonb_typeof(p.brief_data -> 'inspirationsbilledePaths') = 'array'
      THEN p.brief_data -> 'inspirationsbilledePaths'
      WHEN jsonb_typeof(p.brief_data -> 'inspirationsbilleder') = 'array'
      THEN p.brief_data -> 'inspirationsbilleder'
      ELSE NULL
    END,
    p.inspirations,
    '[]'::jsonb
  ),
  p.budget_estimate,
  CASE
    WHEN p.brief_data IS NOT NULL
      AND NOT (p.brief_data ? 'stil' AND p.brief_data ? 'bruttoareal')
    THEN p.brief_data
    ELSE NULL
  END,
  CASE
    WHEN p.hus_dna IS NOT NULL THEN p.hus_dna
    WHEN p.brief_data IS NOT NULL
      AND p.brief_data ? 'stil'
      AND p.brief_data ? 'bruttoareal'
    THEN p.brief_data
    ELSE NULL
  END
FROM public.projects AS p
WHERE NOT EXISTS (
    SELECT 1
    FROM public.design_iterations AS di
    WHERE di.project_id = p.id
      AND di.is_active = TRUE
  )
  AND (
    p.brief_data IS NOT NULL
    OR p.hus_dna IS NOT NULL
    OR p.area IS NOT NULL
    OR p.floors IS NOT NULL
    OR p.description IS NOT NULL
    OR (p.inspirations IS NOT NULL AND p.inspirations != '[]'::jsonb)
  );

UPDATE public.projects AS p
SET
  area = NULL,
  floors = NULL,
  budget = NULL,
  timeline = NULL,
  description = NULL,
  inspirations = '[]'::jsonb,
  brief_data = NULL,
  hus_dna = NULL
WHERE EXISTS (
  SELECT 1
  FROM public.design_iterations AS di
  WHERE di.project_id = p.id
    AND di.is_active = TRUE
);

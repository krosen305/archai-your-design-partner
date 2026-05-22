-- Backfill one active design_iteration per project from legacy projects fields.
-- Safe to run repeatedly: inserts only when the project has no active iteration.

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
  'Legacy import',
  CASE
    WHEN (p.brief_data ->> 'oensketAreal') ~ '^[0-9]+(\.[0-9]+)?$'
    THEN (p.brief_data ->> 'oensketAreal')::FLOAT
    ELSE NULL
  END,
  CASE
    WHEN (p.brief_data ->> 'antalEtager') ~ '^[0-9]+$'
    THEN (p.brief_data ->> 'antalEtager')::SMALLINT
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
  p.hus_dna,
  p.created_at
FROM public.projects p
WHERE NOT EXISTS (
    SELECT 1
    FROM public.design_iterations di
    WHERE di.project_id = p.id
      AND di.is_active = true
  )
  AND (
    p.brief_data IS NOT NULL
    OR p.hus_dna IS NOT NULL
    OR p.budget_estimate IS NOT NULL
    OR p.description IS NOT NULL
    OR (p.inspirations IS NOT NULL AND p.inspirations != '[]'::jsonb)
  );

-- ARCH-242 + ARCH-243: typed GEUS/HIP and DHM columns on site_constraints
-- Nullable columns preserve tri-state semantics: null means unknown/not-yet-fetched.

ALTER TABLE public.site_constraints
  ADD COLUMN IF NOT EXISTS grundvand_depth_winter_m NUMERIC,
  ADD COLUMN IF NOT EXISTS grundvand_depth_summer_m NUMERIC,
  ADD COLUMN IF NOT EXISTS grundvand_model_uncertainty_m NUMERIC,
  ADD COLUMN IF NOT EXISTS geoteknik_jordart TEXT,
  ADD COLUMN IF NOT EXISTS terrain_slope_pct NUMERIC,
  ADD COLUMN IF NOT EXISTS terrain_low_point_m NUMERIC,
  ADD COLUMN IF NOT EXISTS bluespot_risk BOOLEAN;

COMMENT ON COLUMN public.site_constraints.grundvand_depth_winter_m IS
  'ARCH-242 GEUS/HIP: estimated winter groundwater depth below terrain in meters. null = unknown/API error.';
COMMENT ON COLUMN public.site_constraints.grundvand_depth_summer_m IS
  'ARCH-242 GEUS/HIP: estimated summer groundwater depth below terrain in meters. null = unknown/API error.';
COMMENT ON COLUMN public.site_constraints.grundvand_model_uncertainty_m IS
  'ARCH-242 GEUS/HIP: model uncertainty in meters for groundwater depth estimate. null = source does not provide value.';
COMMENT ON COLUMN public.site_constraints.geoteknik_jordart IS
  'ARCH-242 GEUS/HIP: normalized soil type / lithology label used for geotechnical context.';
COMMENT ON COLUMN public.site_constraints.terrain_slope_pct IS
  'ARCH-243 DHM: derived terrain slope percentage across sampled parcel bbox.';
COMMENT ON COLUMN public.site_constraints.terrain_low_point_m IS
  'ARCH-243 DHM: lowest sampled terrain elevation in meters for parcel bbox.';
COMMENT ON COLUMN public.site_constraints.bluespot_risk IS
  'ARCH-243 DHM: tri-state bluespot screening signal. null = unknown/not computed.';

-- ROLLBACK:
-- ALTER TABLE public.site_constraints
--   DROP COLUMN IF EXISTS grundvand_depth_winter_m,
--   DROP COLUMN IF EXISTS grundvand_depth_summer_m,
--   DROP COLUMN IF EXISTS grundvand_model_uncertainty_m,
--   DROP COLUMN IF EXISTS geoteknik_jordart,
--   DROP COLUMN IF EXISTS terrain_slope_pct,
--   DROP COLUMN IF EXISTS terrain_low_point_m,
--   DROP COLUMN IF EXISTS bluespot_risk;

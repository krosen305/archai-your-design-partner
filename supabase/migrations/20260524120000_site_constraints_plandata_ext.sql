-- ARCH-244: typed Plandata extension columns on site_constraints

ALTER TABLE public.site_constraints
  ADD COLUMN IF NOT EXISTS zone_type text,
  ADD COLUMN IF NOT EXISTS future_zone_type text,
  ADD COLUMN IF NOT EXISTS landzone_permit_required boolean,
  ADD COLUMN IF NOT EXISTS lokalplan_byggefelt_present boolean,
  ADD COLUMN IF NOT EXISTS within_building_field boolean,
  ADD COLUMN IF NOT EXISTS building_field_source_id text,
  ADD COLUMN IF NOT EXISTS wastewater_plan_status text,
  ADD COLUMN IF NOT EXISTS sewer_area_type text;

COMMENT ON COLUMN public.site_constraints.zone_type IS
  'ARCH-244: current zone type from Plandata zonekort (byzone, landzone, sommerhusomraade, unknown).';
COMMENT ON COLUMN public.site_constraints.future_zone_type IS
  'ARCH-244: future zone type from lokalplan delområde or kommuneplanramme when available.';
COMMENT ON COLUMN public.site_constraints.landzone_permit_required IS
  'ARCH-244: true when parcel plan context indicates landzone and a landzone permit is likely required.';
COMMENT ON COLUMN public.site_constraints.lokalplan_byggefelt_present IS
  'ARCH-244: true when the governing lokalplan has at least one registered byggefelt in Plandata.';
COMMENT ON COLUMN public.site_constraints.within_building_field IS
  'ARCH-244: true when parcel intersects a registered byggefelt; false when byggefelt exists but parcel context is outside; null when unknown or not defined.';
COMMENT ON COLUMN public.site_constraints.building_field_source_id IS
  'ARCH-244: source id for selected Plandata byggefelt feature.';
COMMENT ON COLUMN public.site_constraints.wastewater_plan_status IS
  'ARCH-244: status/name from selected Plandata kloakopland/spildevandsplan context.';
COMMENT ON COLUMN public.site_constraints.sewer_area_type IS
  'ARCH-244: sewer or wastewater area type derived from selected Plandata kloakopland fields.';

-- supabase/migrations/20260526100000_site_constraints_noise_neighbor.sql
-- Additive: noise screening og naboforhold typed columns på site_constraints.
-- Tri-state boolean: true=bekræftet hit, false=bekræftet intet hit, null=ukendt/kilde utilgængelig.

ALTER TABLE public.site_constraints
  -- Noise: MST støjkortlægning
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
  -- Nabogeometri: GeoDanmark + MAT
  ADD COLUMN IF NOT EXISTS neighbor_building_count_40m integer,
  ADD COLUMN IF NOT EXISTS neighbor_nearest_building_distance_m float,
  ADD COLUMN IF NOT EXISTS road_nearest_centerline_distance_m float,
  ADD COLUMN IF NOT EXISTS access_road_nearby boolean,
  ADD COLUMN IF NOT EXISTS neighbor_context_confidence text,
  -- Plandata: støj/lugt/konsekvensområder fra kommuneplanretningslinjer
  ADD COLUMN IF NOT EXISTS planning_noise_area boolean,
  ADD COLUMN IF NOT EXISTS planning_production_noise_consequence_area boolean,
  ADD COLUMN IF NOT EXISTS planning_odor_area boolean,
  ADD COLUMN IF NOT EXISTS planning_technical_facility_consequence_area boolean,
  ADD COLUMN IF NOT EXISTS planning_large_livestock_area boolean,
  ADD COLUMN IF NOT EXISTS planning_surroundings_review_required boolean;

COMMENT ON COLUMN public.site_constraints.noise_road_lden_db IS
  'MST støjkortlægning: vejstøj Lden (dB). Vejledende grænseværdi: 58 dB for boliger.';
COMMENT ON COLUMN public.site_constraints.noise_road_lnight_db IS
  'MST støjkortlægning: vejstøj Lnight (dB).';
COMMENT ON COLUMN public.site_constraints.noise_rail_lden_db IS
  'MST støjkortlægning: togstøj Lden (dB). Vejledende grænseværdi: 64 dB for boliger.';
COMMENT ON COLUMN public.site_constraints.noise_rail_lnight_db IS
  'MST støjkortlægning: togstøj Lnight (dB).';
COMMENT ON COLUMN public.site_constraints.noise_air_lden_db IS
  'MST støjkortlægning: flystøj Lden (dB). Vejledende grænseværdi: 55 dB for boliger.';
COMMENT ON COLUMN public.site_constraints.noise_air_lnight_db IS
  'MST støjkortlægning: flystøj Lnight (dB).';
COMMENT ON COLUMN public.site_constraints.noise_industry_lden_db IS
  'MST støjkortlægning: virksomhedsstøj Lden (dB). Ingen absolut grænseværdi — kræver altid akustikervurdering.';
COMMENT ON COLUMN public.site_constraints.noise_coverage_status IS
  'Dækningsstatus for MST støjkort: covered, outside_mapped_area, source_unavailable, unknown. null=ikke evalueret.';
COMMENT ON COLUMN public.site_constraints.noise_model_year IS
  'Årstal for den støjkortlægning der er brugt, fx 2017 eller 2022.';
COMMENT ON COLUMN public.site_constraints.noise_acoustic_review_required IS
  'true = akustisk vurdering anbefales før køb/design. null = ikke evalueret.';
COMMENT ON COLUMN public.site_constraints.neighbor_building_count_40m IS
  'GeoDanmark: antal nabobygninger inden for 40 m af parcelgrænse.';
COMMENT ON COLUMN public.site_constraints.neighbor_nearest_building_distance_m IS
  'GeoDanmark: afstand til nærmeste nabobygning fra parcelgrænse (m, EPSG:25832).';
COMMENT ON COLUMN public.site_constraints.road_nearest_centerline_distance_m IS
  'GeoDanmark: afstand til nærmeste vejmidte fra parcelcentroid (m, EPSG:25832).';
COMMENT ON COLUMN public.site_constraints.access_road_nearby IS
  'GeoDanmark: true hvis en vejmidte er fundet inden for 100 m. null = ikke evalueret.';
COMMENT ON COLUMN public.site_constraints.neighbor_context_confidence IS
  'Dækningsstatus for GeoDanmark nabogeometri: covered, source_unavailable, unknown.';
COMMENT ON COLUMN public.site_constraints.planning_noise_area IS
  'Plandata: true = parcel overlapper kommuneplanretningslinje-udpegning af støjbelastet areal (tema 1109).';
COMMENT ON COLUMN public.site_constraints.planning_production_noise_consequence_area IS
  'Plandata: true = parcel overlapper konsekvensområde for produktionsvirksomhedsstøj (tema 115201).';
COMMENT ON COLUMN public.site_constraints.planning_odor_area IS
  'Plandata: true = parcel overlapper lugtbelastet areal eller lugtkonsekvensområde (tema 115202, 110129).';
COMMENT ON COLUMN public.site_constraints.planning_technical_facility_consequence_area IS
  'Plandata: true = parcel overlapper konsekvensområde for tekniske anlæg (tema 110130).';
COMMENT ON COLUMN public.site_constraints.planning_large_livestock_area IS
  'Plandata: true = parcel overlapper omraade med store husdyrbrug (tema 114200).';
COMMENT ON COLUMN public.site_constraints.planning_surroundings_review_required IS
  'true = et eller flere plandata-hits kræver myndighedsafklaring foer køb/design.';

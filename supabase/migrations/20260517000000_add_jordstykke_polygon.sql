-- supabase/migrations/20260517000000_add_jordstykke_polygon.sql
-- Cache jordstykke WFS polygon i address_analysis.
-- Delte data på tværs af brugere — ét jordstykke per adresse, ændres sjældent.

ALTER TABLE public.address_analysis
  ADD COLUMN IF NOT EXISTS jordstykke_polygon      JSONB,
  ADD COLUMN IF NOT EXISTS jordstykke_polygon_at   TIMESTAMPTZ;

COMMENT ON COLUMN public.address_analysis.jordstykke_polygon IS
  'GeoJSON FeatureCollection fra Matriklen2 WFS — jordstykke-polygon for adressens matrikel.';

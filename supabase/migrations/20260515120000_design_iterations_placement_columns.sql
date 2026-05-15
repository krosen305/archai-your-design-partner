-- =============================================================================
-- design_iterations: typed placement columns (ARCH-179)
--
-- Adds georeferenced building placement data to design_iterations.
-- Typed columns for all scalar values; footprint_geojson is JSONB (acceptable
-- exception — raw geometry is inspection_payload-like untyped archival data).
--
-- Source of truth at runtime: DesignPlacement in project-store.ts.
-- Written by project-sync.ts after map editor translateend/modifyend (debounced).
-- Read by the Validation Engine via the design_iterations → site_constraints join.
-- =============================================================================

ALTER TABLE public.design_iterations
  ADD COLUMN IF NOT EXISTS placement_footprint_area_m2          FLOAT,
    -- Computed from footprintGeojson via @turf/area. Overrides estimated
    -- newBuilding.footprintM2 in assembleRuleEngineInput.

  ADD COLUMN IF NOT EXISTS placement_centroid_lat               FLOAT,
  ADD COLUMN IF NOT EXISTS placement_centroid_lng               FLOAT,
    -- WGS84 centroid of the footprint polygon.

  ADD COLUMN IF NOT EXISTS placement_rotation_deg               FLOAT,
    -- Building rotation in degrees, 0 = north.

  ADD COLUMN IF NOT EXISTS placement_min_distance_to_boundary_m FLOAT,
    -- Shortest distance from footprint to parcel boundary in metres.
    -- Replaces the always-null distanceToBoundaryM when map editor is active.
    -- NULL = not yet computed (korteditor not activated).

  ADD COLUMN IF NOT EXISTS placement_outside_parcel_area_m2     FLOAT
    DEFAULT 0 NOT NULL,
    -- Area of footprint that overlaps the parcel boundary (m²).
    -- > 0 triggers a hard stop: building must be entirely within the plot.

  ADD COLUMN IF NOT EXISTS placement_floors                     SMALLINT,
    -- Overrides design_iterations.floors when set by the map editor.
    -- NULL = use design_iterations.floors (wizard value).

  ADD COLUMN IF NOT EXISTS placement_height_m                   FLOAT,
    -- Ridge height in metres as drawn in the map editor.
    -- NULL = use heuristic (floors × 3.0 m).

  ADD COLUMN IF NOT EXISTS placement_source                     TEXT
    DEFAULT 'user'
    CHECK (placement_source IN ('user', 'generated')),
    -- 'user'      = placed interactively by the homeowner
    -- 'generated' = auto-placed by AI or compliance engine

  ADD COLUMN IF NOT EXISTS placement_footprint_geojson          JSONB;
    -- Raw GeoJSON Polygon (WGS84) of the building footprint as drawn.
    -- Intentionally JSONB: geometry is raw archival data, not a queryable field.
    -- Convert to EPSG:25832 server-side for precise skelafstand calculations.

-- ROLLBACK:
-- ALTER TABLE public.design_iterations
--   DROP COLUMN IF EXISTS placement_footprint_area_m2,
--   DROP COLUMN IF EXISTS placement_centroid_lat,
--   DROP COLUMN IF EXISTS placement_centroid_lng,
--   DROP COLUMN IF EXISTS placement_rotation_deg,
--   DROP COLUMN IF EXISTS placement_min_distance_to_boundary_m,
--   DROP COLUMN IF EXISTS placement_outside_parcel_area_m2,
--   DROP COLUMN IF EXISTS placement_floors,
--   DROP COLUMN IF EXISTS placement_height_m,
--   DROP COLUMN IF EXISTS placement_source,
--   DROP COLUMN IF EXISTS placement_footprint_geojson;

// src/domain/floor-plan/floor-plan.schemas.ts
//
// Canonical Zod schemas for the floor-plan domain model (spec §9). Types are
// inferred from these schemas in floor-plan.types.ts to avoid type/schema drift
// (Rule 1 - contract-first boundaries). All coordinates are LOCAL_METER.

import { z } from "zod";

// --- Shared 2D geometry (LOCAL_METER) -------------------------------------

export const Point2DSchema = z.object({ x: z.number(), y: z.number() });

export const Line2DSchema = z.object({ start: Point2DSchema, end: Point2DSchema });

export const Polygon2DSchema = z.object({
  vertices: z.array(Point2DSchema).min(3),
});

// --- Source metadata (aligned with drawing LayerSourceMeta, spec §23.3.4) ---

export const ElementSourceMetaSchema = z.object({
  source: z.enum(["survey", "registry", "cad_upload", "manual", "generated", "estimated"]),
  confidence: z.enum(["high", "medium", "low", "unknown"]),
  fetchedAt: z.string().nullable(),
  requiresReview: z.boolean(),
});

// --- Transform (spec §9.1) -------------------------------------------------

export const FloorPlanTransformSchema = z.object({
  localCrs: z.literal("LOCAL_METER"),
  siteCrs: z.literal("EPSG:25832"),
  origin25832: z.tuple([z.number(), z.number()]),
  rotationDeg: z.number(),
});

// --- Wall (spec §9.4) ------------------------------------------------------

export const WallSchema = z.object({
  id: z.string().min(1),
  levelId: z.string().min(1),
  centerline: Line2DSchema,
  thicknessM: z.number().positive(),
  heightM: z.number().positive().nullable(),
  wallKind: z.enum(["exterior", "interior", "party", "foundation", "shaft"]),
  structuralRole: z.enum(["unknown", "non_bearing", "bearing", "requires_engineer_review"]),
  fireRole: z.enum(["none", "fire_separation", "unknown"]),
  assemblyId: z.string().nullable(),
  locked: z.boolean(),
  source: ElementSourceMetaSchema,
});

// --- RoomZone (spec §9.5) --------------------------------------------------

export const RoomZoneSchema = z.object({
  id: z.string().min(1),
  levelId: z.string().min(1),
  name: z.string(),
  roomType: z.enum([
    "entrance",
    "hall",
    "living",
    "kitchen",
    "bedroom",
    "bathroom",
    "utility",
    "office",
    "storage",
    "technical",
    "stair",
    "garage",
    "other",
  ]),
  polygon: Polygon2DSchema,
  netAreaM2: z.number().nonnegative(),
  minAreaM2: z.number().positive().nullable(),
  targetAreaM2: z.number().positive().nullable(),
  floorFinishAssemblyId: z.string().nullable(),
  ceilingFinishAssemblyId: z.string().nullable(),
  wallFinishAssemblyByWallId: z.record(z.string(), z.string().nullable()),
  ventilationNeed: z.enum(["unknown", "natural", "mechanical", "wet_room"]),
  wetRoomZone: z.boolean(),
  daylightRelevant: z.boolean(),
  ceilingHeightM: z.number().positive().nullable().default(null),
  floorOffsetM: z.number().nullable().default(null),
  source: ElementSourceMetaSchema,
});

// --- Opening (spec §9.6) ---------------------------------------------------

export const OpeningSchema = z.object({
  id: z.string().min(1),
  levelId: z.string().min(1),
  wallId: z.string().min(1),
  openingKind: z.enum(["door", "window", "sliding_door", "opening", "garage_door"]),
  offsetAlongWallM: z.number().nonnegative(),
  widthM: z.number().positive(),
  heightM: z.number().positive(),
  sillHeightM: z.number().nonnegative().nullable(),
  swing: z.enum(["left", "right", "sliding", "none", "unknown"]),
  operable: z.boolean().default(false),
  productTypeId: z.string().nullable(),
  locked: z.boolean(),
  source: ElementSourceMetaSchema,
});

// --- Fixture (spec §9.7) ---------------------------------------------------

export const FixtureSchema = z.object({
  id: z.string().min(1),
  levelId: z.string().min(1),
  roomId: z.string().nullable(),
  fixtureKind: z.enum([
    "toilet",
    "sink",
    "shower",
    "bathtub",
    "kitchen_unit",
    "technical_cabinet",
    "wardrobe",
    "appliance",
    "ventilation_unit",
    "heat_pump_indoor",
    "other",
  ]),
  position: Point2DSchema,
  rotationDeg: z.number(),
  footprint: Polygon2DSchema,
  productTypeId: z.string().nullable(),
  requiresDisciplineReview: z.array(z.enum(["architect", "engineer", "vvs", "electrician"])),
  source: ElementSourceMetaSchema,
});

// --- Zone (WS4 — uopvarmede/overdækkede arealer) ---------------------------

/**
 * Canonical list of zone kinds for unheated/covered areas outside the primary
 * building envelope. Exported so adapters can import this single source of truth.
 */
export const ZONE_KINDS = [
  "terrace",
  "carport",
  "covered_entrance",
  "balcony",
  "pool",
  "parking",
] as const;

export type ZoneKind = (typeof ZONE_KINDS)[number];

export const ZoneSchema = z.object({
  id: z.string().min(1),
  levelId: z.string().min(1),
  zoneKind: z.enum(ZONE_KINDS),
  polygon: Polygon2DSchema,
  name: z.string(),
  areaM2: z.number().nonnegative(),
  /** false = uopvarmet (tæller ikke som BBR bebygget areal på samme måde) */
  heated: z.boolean(),
  source: ElementSourceMetaSchema,
});

// --- Furniture (spec §9.7 extension — WS2 symbol library) -----------------

/**
 * Canonical list of supported furniture kinds. Exported so adapters (e.g.
 * symbol-registry) can import this single source of truth without the domain
 * core importing from adapter layers.
 */
export const FURNITURE_KINDS = [
  "single_bed",
  "double_bed",
  "sofa",
  "armchair",
  "dining_table",
  "chair",
  "wardrobe_shelf",
] as const;

export type FurnitureKind = (typeof FURNITURE_KINDS)[number];

export const FurnitureSchema = z.object({
  id: z.string().min(1),
  levelId: z.string().min(1),
  roomId: z.string().nullable(),
  furnitureKind: z.enum(FURNITURE_KINDS),
  position: Point2DSchema,
  rotationDeg: z.number(),
  widthM: z.number().positive(),
  depthM: z.number().positive(),
  source: ElementSourceMetaSchema,
});

// --- Stair (spec §9.3 references stairs) -----------------------------------

export const StairSchema = z.object({
  id: z.string().min(1),
  levelId: z.string().min(1),
  footprint: Polygon2DSchema,
  fromLevelId: z.string().nullable(),
  toLevelId: z.string().nullable(),
  source: ElementSourceMetaSchema,
});

// --- Annotation ------------------------------------------------------------

export const PlanAnnotationSchema = z.object({
  id: z.string().min(1),
  levelId: z.string().min(1),
  kind: z.enum(["dimension", "label", "note"]),
  text: z.string(),
  position: Point2DSchema,
});

// --- FloorLevel (spec §9.3) ------------------------------------------------

export const FloorLevelSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  levelIndex: z.number().int(),
  elevationM: z.number(),
  floorToFloorHeightM: z.number().positive().nullable(),
  walls: z.array(WallSchema),
  rooms: z.array(RoomZoneSchema),
  openings: z.array(OpeningSchema),
  fixtures: z.array(FixtureSchema),
  furniture: z.array(FurnitureSchema).default([]),
  zones: z.array(ZoneSchema).default([]),
  stairs: z.array(StairSchema),
  annotations: z.array(PlanAnnotationSchema),
});

// --- Assembly catalog (spec §9.8) ------------------------------------------

export const AssemblyLayerSchema = z.object({
  materialId: z.string(),
  name: z.string(),
  thicknessM: z.number().positive().nullable(),
  quantityUnit: z.enum(["m2", "m3", "m", "pcs"]),
  side: z.enum(["core", "side_a", "side_b", "both_sides"]),
  wasteFactorPct: z.number().nonnegative(),
});

export const WallAssemblySchema = z.object({
  id: z.string(),
  name: z.string(),
  category: z.enum(["exterior_wall", "interior_wall", "wet_room_wall", "shaft_wall"]),
  thicknessM: z.number().positive(),
  defaultHeightM: z.number().positive().nullable(),
  layers: z.array(AssemblyLayerSchema),
  quantityRulesVersion: z.string(),
});

export const FinishAssemblySchema = z.object({
  id: z.string(),
  name: z.string(),
  layers: z.array(AssemblyLayerSchema),
  quantityRulesVersion: z.string(),
});

export const OpeningProductTypeSchema = z.object({
  id: z.string(),
  name: z.string(),
  openingKind: z.enum(["door", "window", "sliding_door", "opening", "garage_door"]),
  defaultWidthM: z.number().positive().nullable(),
  defaultHeightM: z.number().positive().nullable(),
});

export const AssemblyCatalogSchema = z.object({
  wallAssemblies: z.array(WallAssemblySchema),
  floorFinishAssemblies: z.array(FinishAssemblySchema),
  ceilingFinishAssemblies: z.array(FinishAssemblySchema),
  openingProductTypes: z.array(OpeningProductTypeSchema),
});

// --- Room program ----------------------------------------------------------

export const RoomProgramSchema = z.object({
  requiredRoomTypes: z.array(z.string()),
  bedroomCount: z.number().int().nonnegative().nullable(),
  bathroomCount: z.number().int().nonnegative().nullable(),
});

// --- Constraints / metadata / provenance -----------------------------------

export const FloorPlanConstraintSchema = z.object({
  id: z.string(),
  kind: z.string(),
  description: z.string(),
});

export const FloorPlanMetadataSchema = z.object({
  title: z.string(),
  createdAt: z.string(),
});

export const FloorPlanProvenanceSchema = z.object({
  generator: z.string(),
  schemaVersion: z.string(),
});

// --- FloorPlanDocument (spec §9.2) -----------------------------------------

export const FloorPlanDocumentSchema = z.object({
  schemaVersion: z.literal("floor-plan.v1"),
  projectId: z.string().min(1),
  designIterationId: z.string().nullable(),
  transform: FloorPlanTransformSchema,
  levels: z.array(FloorLevelSchema).min(1),
  assemblies: AssemblyCatalogSchema,
  roomProgram: RoomProgramSchema,
  constraints: z.array(FloorPlanConstraintSchema),
  metadata: FloorPlanMetadataSchema,
  provenance: FloorPlanProvenanceSchema,
});

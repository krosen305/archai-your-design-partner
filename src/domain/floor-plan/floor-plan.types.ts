// src/domain/floor-plan/floor-plan.types.ts
//
// Domain types for the floor-plan model, inferred from the canonical Zod
// schemas (floor-plan.schemas.ts) so types and runtime validation cannot drift.

import type { z } from "zod";
import type {
  AssemblyCatalogSchema,
  AssemblyLayerSchema,
  ElementSourceMetaSchema,
  FinishAssemblySchema,
  FixtureSchema,
  FloorLevelSchema,
  FloorPlanConstraintSchema,
  FloorPlanDocumentSchema,
  FloorPlanMetadataSchema,
  FloorPlanProvenanceSchema,
  FloorPlanTransformSchema,
  OpeningProductTypeSchema,
  OpeningSchema,
  PlanAnnotationSchema,
  RoomProgramSchema,
  RoomZoneSchema,
  StairSchema,
  WallAssemblySchema,
  WallSchema,
} from "./floor-plan.schemas";

export type ElementSourceMeta = z.infer<typeof ElementSourceMetaSchema>;
export type FloorPlanTransform = z.infer<typeof FloorPlanTransformSchema>;
export type Wall = z.infer<typeof WallSchema>;
export type RoomZone = z.infer<typeof RoomZoneSchema>;
export type Opening = z.infer<typeof OpeningSchema>;
export type Fixture = z.infer<typeof FixtureSchema>;
export type Stair = z.infer<typeof StairSchema>;
export type PlanAnnotation = z.infer<typeof PlanAnnotationSchema>;
export type FloorLevel = z.infer<typeof FloorLevelSchema>;
export type AssemblyLayer = z.infer<typeof AssemblyLayerSchema>;
export type WallAssembly = z.infer<typeof WallAssemblySchema>;
export type FinishAssembly = z.infer<typeof FinishAssemblySchema>;
export type OpeningProductType = z.infer<typeof OpeningProductTypeSchema>;
export type AssemblyCatalog = z.infer<typeof AssemblyCatalogSchema>;
export type RoomProgram = z.infer<typeof RoomProgramSchema>;
export type FloorPlanConstraint = z.infer<typeof FloorPlanConstraintSchema>;
export type FloorPlanMetadata = z.infer<typeof FloorPlanMetadataSchema>;
export type FloorPlanProvenance = z.infer<typeof FloorPlanProvenanceSchema>;
export type FloorPlanDocument = z.infer<typeof FloorPlanDocumentSchema>;

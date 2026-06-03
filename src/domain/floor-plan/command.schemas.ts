// src/domain/floor-plan/command.schemas.ts
//
// Typed edit operations and their result contract (spec §7.2). Both UI drags
// and AI text commands converge on this schema before the deterministic apply
// pipeline (spec §7.2.1). Coordinates are LOCAL_METER.

import { z } from "zod";
import { FixtureSchema, Line2DSchema, Point2DSchema, FURNITURE_KINDS } from "./floor-plan.schemas";

export const FloorPlanCommandSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("move_wall"),
    wallId: z.string().min(1),
    deltaM: z.number(),
    axis: z.enum(["x", "y"]),
  }),
  z.object({
    type: z.literal("move_opening"),
    openingId: z.string().min(1),
    wallId: z.string().min(1),
    offsetM: z.number().nonnegative(),
  }),
  z.object({
    type: z.literal("resize_opening"),
    openingId: z.string().min(1),
    widthM: z.number().positive(),
  }),
  z.object({
    type: z.literal("delete_wall"),
    wallId: z.string().min(1),
  }),
  z.object({
    type: z.literal("move_fixture"),
    fixtureId: z.string().min(1),
    roomId: z.string().min(1),
    x: z.number(),
    y: z.number(),
  }),
  z.object({
    type: z.literal("split_room"),
    roomId: z.string().min(1),
    wallLine: Line2DSchema,
  }),
  z.object({
    type: z.literal("merge_rooms"),
    roomIds: z.array(z.string().min(1)).min(2),
  }),
  // WS5 — add/delete commands
  z.object({
    type: z.literal("add_wall"),
    levelId: z.string().min(1),
    start: Point2DSchema,
    end: Point2DSchema,
    thicknessM: z.number().positive(),
    wallKind: z.enum(["exterior", "interior", "party", "foundation", "shaft"]),
  }),
  z.object({
    type: z.literal("add_opening"),
    levelId: z.string().min(1),
    wallId: z.string().min(1),
    openingKind: z.enum(["door", "window", "sliding_door", "opening", "garage_door"]),
    offsetAlongWallM: z.number().nonnegative(),
    widthM: z.number().positive(),
    heightM: z.number().positive(),
    swing: z.enum(["left", "right", "sliding", "none", "unknown"]),
  }),
  z.object({
    type: z.literal("add_fixture"),
    levelId: z.string().min(1),
    roomId: z.string().nullable(),
    fixtureKind: FixtureSchema.shape.fixtureKind,
    position: Point2DSchema,
    rotationDeg: z.number(),
  }),
  z.object({
    type: z.literal("add_furniture"),
    levelId: z.string().min(1),
    roomId: z.string().nullable(),
    furnitureKind: z.enum(FURNITURE_KINDS),
    position: Point2DSchema,
    rotationDeg: z.number(),
    widthM: z.number().positive(),
    depthM: z.number().positive(),
  }),
]);

/** Stable reason codes for rejected commands (extend as engines grow). */
export const CommandRejectionCodeSchema = z.enum([
  "OPENING_OUTSIDE_PARENT_WALL",
  "OPENING_OVERLAPS_ANOTHER",
  "OPENING_CROSSES_WALL_ENDPOINT",
  "WALL_NOT_FOUND",
  "OPENING_NOT_FOUND",
  "FIXTURE_NOT_FOUND",
  "ROOM_NOT_FOUND",
  "ELEMENT_LOCKED",
  "BEARING_WALL_REQUIRES_REVIEW",
  "WOULD_CORRUPT_TOPOLOGY",
  "ROOM_NOT_CLOSED",
  "LEVEL_NOT_FOUND",
  "WALL_TOO_SHORT",
  "DUPLICATE_ELEMENT_ID",
]);

const LiveFindingSchema = z.object({
  severity: z.enum(["info", "warning", "review_required", "blocking"]),
  category: z.enum([
    "topology",
    "geometry",
    "room_program",
    "site_compliance",
    "br18",
    "fire",
    "accessibility",
    "daylight",
    "wet_room",
    "technical_installation",
    "material_basis",
    "documentation",
  ]),
  message: z.string(),
});

export const CommandResultSchema = z.discriminatedUnion("accepted", [
  z.object({
    accepted: z.literal(true),
    changedElementIds: z.array(z.string()),
    liveFindings: z.array(LiveFindingSchema),
  }),
  z.object({
    accepted: z.literal(false),
    reasonCode: CommandRejectionCodeSchema,
    message: z.string(),
    suggestedCommands: z.array(FloorPlanCommandSchema),
  }),
]);

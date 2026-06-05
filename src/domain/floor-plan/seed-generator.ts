// src/domain/floor-plan/seed-generator.ts
//
// Deterministic seed floor-plan generator (spec UC-01, Risk 3 mitigation: the
// generator constructs geometry deterministically; AI only supplies intent).
// Pure, 0 AI tokens. Rooms are DERIVED from the wall graph via the topology
// engine, so a generated plan is always topology-consistent and verifies.

import { layoutWalls } from "./layout-engine";
import { detectRooms } from "./topology-engine";
import type {
  ElementSourceMeta,
  FloorPlanDocument,
  Opening,
  RoomZone,
  Wall,
} from "./floor-plan.types";

export type BuildingBrief = {
  projectId: string;
  targetAreaM2: number;
  rooms: Array<{ name: string; roomType: RoomZone["roomType"] }>;
  footprint?: { widthM: number; depthM: number };
  origin25832?: [number, number];
  rotationDeg?: number;
  /** Stamped onto metadata; keep stable for deterministic output. */
  createdAt?: string;
};

const GENERATED: ElementSourceMeta = {
  source: "generated",
  confidence: "medium",
  fetchedAt: null,
  requiresReview: false,
};

const DEFAULT_ASPECT = 1.5;

export function generateSeedFloorPlan(brief: BuildingBrief): FloorPlanDocument {
  const roomCount = Math.max(1, brief.rooms.length);
  const { widthM: W, depthM: D } = footprintFor(brief);
  const levelId = "level_0";

  // Exterior shell + weighted interior partitions from the layout engine.
  // layoutWalls returns walls in order: south [0], east [1], north [2], west [3], partitions...
  const walls: Wall[] = layoutWalls({ widthM: W, depthM: D, rooms: brief.rooms });

  // Derive rooms from the wall graph and label them from the brief.
  // The grid may produce more faces than brief.rooms (e.g. 2×3 grid for 5 rooms);
  // truncate to the requested count so room count always matches the brief.
  const allFaces = detectRooms(walls.map((w) => w.centerline));
  const faces = allFaces.slice(0, roomCount);
  const rooms: RoomZone[] = faces.map((face, j) => {
    const spec = brief.rooms[j] ?? { name: `Rum ${j + 1}`, roomType: "other" as const };
    return {
      id: `room_${j}_${spec.roomType}`,
      levelId,
      name: spec.name,
      roomType: spec.roomType,
      polygon: {
        vertices: face.boundary.vertices.map((p) => ({ x: round3(p.x), y: round3(p.y) })),
      },
      netAreaM2: round3(face.areaM2),
      minAreaM2: null,
      targetAreaM2: null,
      floorFinishAssemblyId: null,
      ceilingFinishAssemblyId: null,
      wallFinishAssemblyByWallId: {},
      ventilationNeed: spec.roomType === "bathroom" ? "wet_room" : "natural",
      wetRoomZone: spec.roomType === "bathroom",
      daylightRelevant: spec.roomType !== "technical" && spec.roomType !== "storage",
      ceilingHeightM: null,
      floorOffsetM: null,
      source: GENERATED,
    };
  });

  // layoutWalls returns exterior walls in CCW order: south=0, east=1, north=2, west=3.
  const southWallId = walls[0]!.id;
  const northWallId = walls[2]!.id;

  // One entrance door on the south wall, one window per room on the north wall.
  // stripW is used only for facade-level opening placement (independent of interior layout).
  const stripW = W / roomCount;
  const openings: Opening[] = [
    door("op_entrance", levelId, southWallId, clamp(stripW / 2, 0.6, W - 0.6), 0.9),
  ];
  rooms.forEach((_, j) => {
    const centerX = (j + 0.5) * stripW;
    openings.push(
      window_(`op_window_${j}`, levelId, northWallId, clamp(W - centerX, 0.7, W - 0.7), 1.2),
    );
  });

  const bedroomCount = brief.rooms.filter((r) => r.roomType === "bedroom").length;
  const bathroomCount = brief.rooms.filter((r) => r.roomType === "bathroom").length;

  return {
    schemaVersion: "floor-plan.v1",
    projectId: brief.projectId,
    designIterationId: null,
    transform: {
      localCrs: "LOCAL_METER",
      siteCrs: "EPSG:25832",
      origin25832: brief.origin25832 ?? [0, 0],
      rotationDeg: brief.rotationDeg ?? 0,
    },
    levels: [
      {
        id: levelId,
        name: "Stueplan",
        levelIndex: 0,
        elevationM: 0,
        floorToFloorHeightM: null,
        walls,
        rooms,
        openings,
        fixtures: [],
        furniture: [],
        zones: [],
        stairs: [],
        annotations: [],
      },
    ],
    assemblies: {
      wallAssemblies: [],
      floorFinishAssemblies: [],
      ceilingFinishAssemblies: [],
      openingProductTypes: [],
    },
    roomProgram: {
      requiredRoomTypes: brief.rooms.map((r) => r.roomType),
      bedroomCount,
      bathroomCount,
    },
    constraints: [],
    metadata: {
      title: "Genereret forslag",
      createdAt: brief.createdAt ?? "2026-01-01T00:00:00.000Z",
    },
    provenance: { generator: "seed-generator.v1", schemaVersion: "floor-plan.v1" },
  };
}

// --- helpers ---------------------------------------------------------------

function footprintFor(brief: BuildingBrief): { widthM: number; depthM: number } {
  if (brief.footprint) return brief.footprint;
  const width = round3(Math.sqrt(brief.targetAreaM2 * DEFAULT_ASPECT));
  const depth = round3(brief.targetAreaM2 / width);
  return { widthM: width, depthM: depth };
}

function door(
  id: string,
  levelId: string,
  wallId: string,
  offsetM: number,
  widthM: number,
): Opening {
  return opening(id, levelId, wallId, "door", offsetM, widthM, 2.1, null);
}

function window_(
  id: string,
  levelId: string,
  wallId: string,
  offsetM: number,
  widthM: number,
): Opening {
  return opening(id, levelId, wallId, "window", offsetM, widthM, 1.4, 0.9);
}

function opening(
  id: string,
  levelId: string,
  wallId: string,
  openingKind: Opening["openingKind"],
  offsetM: number,
  widthM: number,
  heightM: number,
  sillHeightM: number | null,
): Opening {
  return {
    id,
    levelId,
    wallId,
    openingKind,
    offsetAlongWallM: round3(offsetM),
    widthM,
    heightM,
    sillHeightM,
    swing: openingKind === "door" ? "left" : "none",
    operable: false,
    productTypeId: null,
    locked: false,
    source: GENERATED,
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

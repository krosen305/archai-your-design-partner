import { describe, expect, test } from "bun:test";
import { generateSeedFloorPlan, type BuildingBrief } from "./seed-generator";
import { FloorPlanDocumentSchema } from "./floor-plan.schemas";
import { polygonAreaM2 } from "../geometry/polygon-ops";
import { runVerification } from "./verification-engine";

const brief: BuildingBrief = {
  projectId: "proj_1",
  targetAreaM2: 120,
  rooms: [
    { name: "Entré", roomType: "entrance" },
    { name: "Stue", roomType: "living" },
    { name: "Køkken", roomType: "kitchen" },
    { name: "Soveværelse", roomType: "bedroom" },
    { name: "Bad", roomType: "bathroom" },
  ],
};

describe("generateSeedFloorPlan", () => {
  test("produces a schema-valid document with one level", () => {
    const doc = generateSeedFloorPlan(brief);
    expect(FloorPlanDocumentSchema.safeParse(doc).success).toBe(true);
    expect(doc.levels).toHaveLength(1);
    expect(doc.projectId).toBe("proj_1");
  });

  test("creates one room per requested room", () => {
    const doc = generateSeedFloorPlan(brief);
    expect(doc.levels[0]!.rooms).toHaveLength(brief.rooms.length);
  });

  test("footprint area is within tolerance of the target (FR-GEN-002)", () => {
    const doc = generateSeedFloorPlan(brief);
    const exterior = doc.levels[0]!.walls.flatMap((w) => [w.centerline.start, w.centerline.end]);
    const xs = exterior.map((p) => p.x);
    const ys = exterior.map((p) => p.y);
    const area = (Math.max(...xs) - Math.min(...xs)) * (Math.max(...ys) - Math.min(...ys));
    expect(area).toBeGreaterThan(120 * 0.8);
    expect(area).toBeLessThan(120 * 1.2);
  });

  test("respects an explicit footprint constraint (FR-GEN-003)", () => {
    const doc = generateSeedFloorPlan({ ...brief, footprint: { widthM: 10, depthM: 8 } });
    const exterior = doc.levels[0]!.walls.flatMap((w) => [w.centerline.start, w.centerline.end]);
    const xs = exterior.map((p) => p.x);
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(10, 6);
  });

  test("marks every element as generated (FR-GEN-006)", () => {
    const doc = generateSeedFloorPlan(brief);
    const level = doc.levels[0]!;
    for (const el of [...level.walls, ...level.rooms, ...level.openings]) {
      expect(el.source.source).toBe("generated");
    }
  });

  test("the generated plan verifies without blocking findings", () => {
    const report = runVerification(generateSeedFloorPlan(brief));
    expect(report.status).not.toBe("BLOCKED");
    expect(report.findings.some((f) => f.severity === "blocking")).toBe(false);
  });

  test("room polygons are non-degenerate", () => {
    const doc = generateSeedFloorPlan(brief);
    for (const room of doc.levels[0]!.rooms) {
      expect(polygonAreaM2(room.polygon)).toBeGreaterThan(0);
    }
  });

  test("is deterministic — identical briefs yield identical documents", () => {
    expect(JSON.stringify(generateSeedFloorPlan(brief))).toBe(
      JSON.stringify(generateSeedFloorPlan(brief)),
    );
  });
});

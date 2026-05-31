import { describe, expect, test } from "bun:test";
import {
  generateFloorPlan,
  type GenerateFloorPlanDeps,
  type GenerateFloorPlanInput,
} from "./generate-floor-plan.service";
import type { FloorPlanPrincipal } from "./principal";
import type { FloorPlanDocument } from "@/domain/floor-plan/floor-plan.types";

const owner: FloorPlanPrincipal = { subjectId: "u", subjectKind: "user", projectRole: "owner" };

const input: GenerateFloorPlanInput = {
  projectId: "proj_1",
  designIterationId: null,
  targetAreaM2: 120,
  rooms: [
    { name: "Stue", roomType: "living" },
    { name: "Køkken", roomType: "kitchen" },
    { name: "Soveværelse", roomType: "bedroom" },
    { name: "Bad", roomType: "bathroom" },
  ],
};

function makeDeps(blocked = false) {
  const saved: FloorPlanDocument[] = [];
  const deps: GenerateFloorPlanDeps = {
    hardStop: { check: async () => ({ blocked, reason: blocked ? "SAVE 1-3" : null }) },
    write: {
      saveIteration: async (p) => {
        saved.push(p.document);
        return "iter_new";
      },
      appendCommand: async () => {},
    },
  };
  return { deps, saved };
}

describe("generateFloorPlan", () => {
  test("generates, persists and returns the new plan when not blocked", async () => {
    const { deps, saved } = makeDeps(false);
    const result = await generateFloorPlan(input, owner, deps);
    expect(result.generated).toBe(true);
    if (!result.generated) return;
    expect(result.floorPlanIterationId).toBe("iter_new");
    expect(result.document.levels[0]!.rooms).toHaveLength(4);
    expect(saved).toHaveLength(1);
  });

  test("returns blockers without generating when a Hard Stop is active (§24.3)", async () => {
    const { deps, saved } = makeDeps(true);
    const result = await generateFloorPlan(input, owner, deps);
    expect(result.generated).toBe(false);
    if (result.generated) return;
    expect(result.blockers.length).toBeGreaterThan(0);
    expect(saved).toHaveLength(0);
  });

  test("rejects a viewer principal", async () => {
    const { deps } = makeDeps(false);
    const viewer: FloorPlanPrincipal = { ...owner, projectRole: "viewer" };
    await expect(generateFloorPlan(input, viewer, deps)).rejects.toThrow();
  });
});

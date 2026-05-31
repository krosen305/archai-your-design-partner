import "@/testing/react-test-setup";
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, mock, test } from "bun:test";
import { applyCommand } from "@/domain/floor-plan/apply-command";
import { generateSeedFloorPlan } from "@/domain/floor-plan/seed-generator";
import { runVerification } from "@/domain/floor-plan/verification-engine";
import type { FloorPlanCommand } from "@/domain/floor-plan/commands";
import type { FloorPlanDocument, RoomZone } from "@/domain/floor-plan/floor-plan.types";

const PROJECT_ID = "11111111-1111-4111-8111-111111111111";

let activeDocument: FloorPlanDocument | null = null;
let activeIterationId = "22222222-2222-4222-8222-222222222222";
let iterationCounter = 2;
let malformedActiveResponse = false;

mock.module("@/lib/auth", () => ({
  getSession: async () => ({ access_token: "test-token" }),
}));

mock.module("@/lib/floor-plan/floor-plan.functions", () => ({
  loadActiveFloorPlanFn: async () => {
    // Simulate an unexpected truthy-but-document-less response (e.g. an error
    // payload that did not throw) to exercise the loadActive guard.
    if (malformedActiveResponse) return { iterationId: activeIterationId } as never;
    return activeDocument ? { iterationId: activeIterationId, document: activeDocument } : null;
  },
  generateFloorPlanFn: async ({
    data,
  }: {
    data: {
      projectId: string;
      targetAreaM2: number;
      rooms: Array<{ name: string; roomType: RoomZone["roomType"] }>;
    };
  }) => {
    activeDocument = generateSeedFloorPlan({
      projectId: data.projectId,
      targetAreaM2: data.targetAreaM2,
      rooms: data.rooms,
    });
    activeIterationId = nextIterationId();
    return { generated: true, floorPlanIterationId: activeIterationId, document: activeDocument };
  },
  applyFloorPlanCommandFn: async ({ data }: { data: { command: FloorPlanCommand } }) => {
    if (!activeDocument) throw new Error("no active document");
    const outcome = applyCommand(activeDocument, data.command);
    if (!outcome.accepted) return outcome;
    activeDocument = outcome.document;
    activeIterationId = nextIterationId();
    return {
      accepted: true,
      floorPlanIterationId: activeIterationId,
      changedElementIds: outcome.changedElementIds,
      liveFindings: outcome.liveFindings,
    };
  },
  verifyFloorPlanFn: async () => {
    if (!activeDocument) throw new Error("no active document");
    return {
      ...runVerification(activeDocument),
      inputHash: "hash",
      verifiedAt: "2026-05-30T00:00:00.000Z",
      verificationId: "verification_1",
    };
  },
  exportFloorPlanFn: async () => ({
    exportId: "export_1",
    svgPath: "floor-plan.svg",
    svgContent: "<svg />",
    pdfPath: null,
    pdfUrl: null,
    readinessStatus: "TECHNICAL_REVIEW",
  }),
}));

describe("useFloorPlanEditor", () => {
  beforeEach(() => {
    activeDocument = null;
    activeIterationId = "22222222-2222-4222-8222-222222222222";
    iterationCounter = 2;
    malformedActiveResponse = false;
  });

  test("crasher ikke når load-handleren returnerer et uventet svar uden document", async () => {
    malformedActiveResponse = true;
    const { useFloorPlanEditor } = await import("./useFloorPlanEditor");

    const { result } = renderHook(() => useFloorPlanEditor({ projectId: PROJECT_ID }));

    await waitFor(() => {
      expect(result.current.busyState).toBe("idle");
    });
    // Degraderer til tom tilstand i stedet for at crashe editoren.
    expect(result.current.document).toBeNull();
    expect(result.current.activeLevelId).toBeNull();
  });

  test("loader aktiv plantegning fra server-handleren", async () => {
    activeDocument = makeDocument(PROJECT_ID);
    const { useFloorPlanEditor } = await import("./useFloorPlanEditor");

    const { result } = renderHook(() => useFloorPlanEditor({ projectId: PROJECT_ID }));

    await waitFor(() => {
      expect(result.current.document?.projectId).toBe(PROJECT_ID);
    });
    expect(result.current.floorPlanIterationId).toBe(activeIterationId);
    expect(result.current.activeLevelId).toBe("level_0");
  });

  test("genererer en plantegning når der ikke findes en aktiv version", async () => {
    const { useFloorPlanEditor } = await import("./useFloorPlanEditor");
    const { result } = renderHook(() => useFloorPlanEditor({ projectId: PROJECT_ID }));

    await waitFor(() => {
      expect(result.current.busyState).toBe("idle");
    });

    await act(async () => {
      const generated = await result.current.generate({
        targetAreaM2: 96,
        rooms: [{ name: "Stue", roomType: "living" }],
      });
      expect(generated).toBe(true);
    });

    expect(result.current.document?.levels[0]?.rooms).toHaveLength(1);
    expect(result.current.floorPlanIterationId).toBe(activeIterationId);
  });

  test("previewer lokalt og persisterer accepterede commands server-side", async () => {
    activeDocument = makeDocument(PROJECT_ID);
    const { useFloorPlanEditor } = await import("./useFloorPlanEditor");
    const { result } = renderHook(() => useFloorPlanEditor({ projectId: PROJECT_ID }));

    await waitFor(() => {
      expect(result.current.document).not.toBeNull();
    });

    const base = result.current.document!;
    const command: FloorPlanCommand = {
      type: "move_wall",
      wallId: "w_int_1",
      axis: "x",
      deltaM: 0.4,
    };

    act(() => {
      expect(result.current.previewCommand(command, base)).toBe(true);
    });
    expect(wallStartX(result.current.document!, "w_int_1")).toBeCloseTo(
      wallStartX(base, "w_int_1") + 0.4,
      6,
    );

    await act(async () => {
      const committed = await result.current.commitCommand(command, base, "drag");
      expect(committed).toBe(true);
    });

    expect(result.current.canUndo).toBe(true);
    expect(result.current.document).toEqual(activeDocument);
    expect(result.current.floorPlanIterationId).toBe(activeIterationId);
  });
});

function makeDocument(projectId: string): FloorPlanDocument {
  return generateSeedFloorPlan({
    projectId,
    targetAreaM2: 120,
    rooms: [
      { name: "Stue", roomType: "living" },
      { name: "Køkken", roomType: "kitchen" },
      { name: "Bad", roomType: "bathroom" },
    ],
  });
}

function wallStartX(document: FloorPlanDocument, wallId: string): number {
  const wall = document.levels[0]!.walls.find((candidate) => candidate.id === wallId);
  if (!wall) throw new Error(`Missing wall ${wallId}`);
  return wall.centerline.start.x;
}

function nextIterationId(): string {
  iterationCounter += 1;
  return `22222222-2222-4222-8222-${String(iterationCounter).padStart(12, "0")}`;
}

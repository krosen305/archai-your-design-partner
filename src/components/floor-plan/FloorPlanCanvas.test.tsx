import "@/testing/react-test-setup";
import { describe, expect, it } from "bun:test";
import { render } from "@testing-library/react";
import { FloorPlanCanvas } from "./FloorPlanCanvas";
import { generateSeedFloorPlan } from "@/domain/floor-plan/seed-generator";

function doc() {
  return generateSeedFloorPlan({
    projectId: "p1",
    targetAreaM2: 80,
    rooms: [{ name: "Stue", roomType: "living" }],
  });
}

describe("FloorPlanCanvas poché", () => {
  it("renderer wallPoche-polygoner, ikke line-elementer, for vægge", () => {
    const d = doc();
    const { container } = render(
      <FloorPlanCanvas
        document={d}
        levelId={d.levels[0]!.id}
        selectedElement={null}
        activeTool="select"
        snapEnabled
        statusMessage={null}
        onSelectElement={() => {}}
        onPreviewCommand={() => true}
        onResetPreview={() => {}}
        onCommitCommand={async () => true}
      />,
    );
    expect(container.querySelectorAll("[data-wall-poche]").length).toBeGreaterThan(0);
    expect(container.querySelectorAll("line[data-wall-id]").length).toBe(0);
  });
});

describe("FloorPlanCanvas åbninger", () => {
  it("renderer åbninger som symbol-path-grupper, ikke cirkel+bogstav", () => {
    const d = doc(); // helper already defined in this test file (generateSeedFloorPlan)
    const { container } = render(
      <FloorPlanCanvas
        document={d}
        levelId={d.levels[0]!.id}
        selectedElement={null}
        activeTool="select"
        snapEnabled
        statusMessage={null}
        onSelectElement={() => {}}
        onPreviewCommand={() => true}
        onResetPreview={() => {}}
        onCommitCommand={async () => true}
      />,
    );
    expect(container.querySelectorAll("g[data-opening-id]").length).toBeGreaterThan(0);
    const texts = [...container.querySelectorAll("text")].map((t) => t.textContent);
    expect(texts).not.toContain("D");
    expect(texts).not.toContain("V");
  });
});

describe("FloorPlanCanvas målsætning", () => {
  it("renderer mål-labels (dimension chains)", () => {
    const d = doc();
    const { container } = render(
      <FloorPlanCanvas
        document={d}
        levelId={d.levels[0]!.id}
        selectedElement={null}
        activeTool="select"
        snapEnabled
        statusMessage={null}
        onSelectElement={() => {}}
        onPreviewCommand={() => true}
        onResetPreview={() => {}}
        onCommitCommand={async () => true}
      />,
    );
    expect(container.querySelectorAll("[data-dimension]").length).toBeGreaterThan(0);
  });
});

describe("FloorPlanCanvas tastatur-slet", () => {
  it("committer delete_wall når Delete trykkes med en valgt væg", async () => {
    const d = doc();
    const wallId = d.levels[0]!.walls[0]!.id;
    let committed: unknown = null;
    render(
      <FloorPlanCanvas
        document={d}
        levelId={d.levels[0]!.id}
        selectedElement={{ kind: "wall", id: wallId }}
        activeTool="select"
        snapEnabled
        statusMessage={null}
        onSelectElement={() => {}}
        onPreviewCommand={() => true}
        onResetPreview={() => {}}
        onCommitCommand={async (cmd) => {
          committed = cmd;
          return true;
        }}
      />,
    );
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Delete" }));
    await Promise.resolve();
    expect(committed).toEqual({ type: "delete_wall", wallId });
  });
});

describe("FloorPlanCanvas møbler", () => {
  it("renderer møbel-symboler som path-grupper når furniture findes", () => {
    const base = doc();
    const lvl = base.levels[0]!;
    const withFurniture = {
      ...base,
      levels: [
        {
          ...lvl,
          furniture: [
            {
              id: "f1",
              levelId: lvl.id,
              roomId: null,
              furnitureKind: "sofa" as const,
              position: { x: 2, y: 2 },
              rotationDeg: 0,
              widthM: 2,
              depthM: 0.9,
              source: {
                source: "manual" as const,
                confidence: "medium" as const,
                fetchedAt: null,
                requiresReview: false,
              },
            },
          ],
        },
      ],
    };
    const { container } = render(
      <FloorPlanCanvas
        document={withFurniture}
        levelId={lvl.id}
        selectedElement={null}
        activeTool="select"
        snapEnabled
        statusMessage={null}
        onSelectElement={() => {}}
        onPreviewCommand={() => true}
        onResetPreview={() => {}}
        onCommitCommand={async () => true}
      />,
    );
    expect(container.querySelectorAll("g[data-furniture-id]").length).toBeGreaterThan(0);
  });
});

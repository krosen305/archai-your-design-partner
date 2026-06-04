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

import "@/testing/react-test-setup";
import { describe, expect, it, mock } from "bun:test";
import { render, fireEvent } from "@testing-library/react";
import { FloorPlanInspector } from "./FloorPlanInspector";
import { generateSeedFloorPlan } from "@/domain/floor-plan/seed-generator";

function doc() {
  return generateSeedFloorPlan({
    projectId: "p1",
    targetAreaM2: 40,
    rooms: [{ name: "Stue", roomType: "living" }],
  });
}

describe("FloorPlanInspector — rum valgt", () => {
  it("viser navn-input og rumtype-select når et rum er valgt", () => {
    const d = doc();
    const roomId = d.levels[0]!.rooms[0]!.id;
    const { container } = render(
      <FloorPlanInspector
        document={d}
        levelId={d.levels[0]!.id}
        selectedElement={{ kind: "room", id: roomId }}
        onCommitCommand={async () => true}
      />,
    );
    // Name input — aria-label="Navn"
    const nameInput = container.querySelector<HTMLInputElement>('input[aria-label="Navn"]');
    expect(nameInput).not.toBeNull();
    // Room type select — aria-label="Type"
    const typeSelect = container.querySelector<HTMLSelectElement>('select[aria-label="Type"]');
    expect(typeSelect).not.toBeNull();
  });

  it("kalder onCommitCommand med update_room ved navneændring", () => {
    const d = doc();
    const roomId = d.levels[0]!.rooms[0]!.id;
    const onCommit = mock(async () => true);
    const { container } = render(
      <FloorPlanInspector
        document={d}
        levelId={d.levels[0]!.id}
        selectedElement={{ kind: "room", id: roomId }}
        onCommitCommand={onCommit}
      />,
    );
    const nameInput = container.querySelector<HTMLInputElement>('input[aria-label="Navn"]')!;
    fireEvent.change(nameInput, { target: { value: "Køkken" } });
    fireEvent.blur(nameInput);
    expect(onCommit.mock.calls.length).toBeGreaterThan(0);
    const [cmd] = onCommit.mock.calls[0] as [unknown, ...unknown[]];
    expect((cmd as { type: string }).type).toBe("update_room");
  });
});

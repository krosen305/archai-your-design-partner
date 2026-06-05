import "@/testing/react-test-setup";
import { describe, expect, it, mock } from "bun:test";
import { render, fireEvent } from "@testing-library/react";
import { FloorPlanInspector } from "./FloorPlanInspector";
import { generateSeedFloorPlan } from "@/domain/floor-plan/seed-generator";
import { wallDragAxis } from "@/lib/floor-plan/editor-hit-testing";
import { wallCoordinate, deltaForTargetLength } from "@/lib/floor-plan/dimension-edit";

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

describe("FloorPlanInspector — væg valgt", () => {
  it("viser Vægposition-input når en væg er valgt", () => {
    const d = doc();
    const wall = d.levels[0]!.walls[0]!;
    const { container } = render(
      <FloorPlanInspector
        document={d}
        levelId={d.levels[0]!.id}
        selectedElement={{ kind: "wall", id: wall.id }}
        onCommitCommand={async () => true}
      />,
    );
    const posInput = container.querySelector<HTMLInputElement>('input[aria-label="Vægposition"]');
    expect(posInput).not.toBeNull();
  });

  it("kalder onCommitCommand med move_wall ved blur på Vægposition", () => {
    const d = doc();
    const wall = d.levels[0]!.walls[0]!;
    const axis = wallDragAxis(wall);
    const current = wallCoordinate(wall, axis);
    const target = current + 0.5;
    const expectedDelta = deltaForTargetLength(current, target);

    const onCommit = mock(async () => true);
    const { container } = render(
      <FloorPlanInspector
        document={d}
        levelId={d.levels[0]!.id}
        selectedElement={{ kind: "wall", id: wall.id }}
        onCommitCommand={onCommit}
      />,
    );

    const posInput = container.querySelector<HTMLInputElement>('input[aria-label="Vægposition"]')!;
    fireEvent.change(posInput, { target: { value: String(target) } });
    fireEvent.blur(posInput);

    expect(onCommit.mock.calls.length).toBeGreaterThan(0);
    const [cmd] = onCommit.mock.calls[0] as [unknown, ...unknown[]];
    const moveCmd = cmd as { type: string; wallId: string; axis: string; deltaM: number };
    expect(moveCmd.type).toBe("move_wall");
    expect(moveCmd.wallId).toBe(wall.id);
    expect(moveCmd.axis).toBe(axis);
    expect(moveCmd.deltaM).toBeCloseTo(expectedDelta, 6);
  });
});

import "@/testing/react-test-setup";
import { describe, expect, it } from "bun:test";
import { render } from "@testing-library/react";
import { FloorPlanToolbar } from "./FloorPlanToolbar";

describe("FloorPlanToolbar", () => {
  it("har aktive knapper for tegn-væg og dør/vindue", () => {
    const { getByLabelText } = render(
      <FloorPlanToolbar
        activeTool="select" snapEnabled canUndo canRedo
        onToolChange={() => {}} onToggleSnap={() => {}} onUndo={() => {}} onRedo={() => {}}
      />,
    );
    expect((getByLabelText("Tegn væg") as HTMLButtonElement).disabled).toBe(false);
    expect((getByLabelText("Tilføj dør/vindue") as HTMLButtonElement).disabled).toBe(false);
  });
});

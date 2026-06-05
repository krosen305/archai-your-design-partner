import "@/testing/react-test-setup";
import { afterEach, describe, expect, it } from "bun:test";
import { cleanup, render } from "@testing-library/react";
import { FloorPlanToolbar } from "./FloorPlanToolbar";

afterEach(cleanup);

describe("FloorPlanToolbar", () => {
  it("har aktive knapper for tegn-væg og dør/vindue", () => {
    const { getByLabelText } = render(
      <FloorPlanToolbar
        activeTool="select"
        snapEnabled
        canUndo
        canRedo
        onToolChange={() => {}}
        onToggleSnap={() => {}}
        onUndo={() => {}}
        onRedo={() => {}}
      />,
    );
    expect((getByLabelText("Tegn væg") as HTMLButtonElement).disabled).toBe(false);
    expect((getByLabelText("Tilføj dør/vindue") as HTMLButtonElement).disabled).toBe(false);
  });

  it("har en aktiv Tilføj note-knap", () => {
    const { getByLabelText } = render(
      <FloorPlanToolbar
        activeTool="select"
        snapEnabled
        canUndo
        canRedo
        onToolChange={() => {}}
        onToggleSnap={() => {}}
        onUndo={() => {}}
        onRedo={() => {}}
      />,
    );
    expect((getByLabelText("Tilføj note") as HTMLButtonElement).disabled).toBe(false);
  });
});

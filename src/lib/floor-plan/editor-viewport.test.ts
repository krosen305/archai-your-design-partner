import { describe, expect, test } from "bun:test";
import { clampZoom, createEditorViewport } from "./editor-viewport";

describe("createEditorViewport", () => {
  const viewBox = { minX: -1, minY: -2, width: 12, height: 8 };

  test("maps LOCAL_METER to screen pixels with y flipped", () => {
    const viewport = createEditorViewport(viewBox, { width: 600, height: 400 }, { paddingPx: 0 });

    const topLeft = viewport.localToScreen({ x: -1, y: 6 });
    const bottomRight = viewport.localToScreen({ x: 11, y: -2 });

    expect(topLeft.x).toBeCloseTo(0, 6);
    expect(topLeft.y).toBeCloseTo(0, 6);
    expect(bottomRight.x).toBeCloseTo(600, 6);
    expect(bottomRight.y).toBeCloseTo(400, 6);
  });

  test("round-trips local points through screen space", () => {
    const viewport = createEditorViewport(
      viewBox,
      { width: 780, height: 420 },
      {
        zoom: 1.4,
        panPx: { x: 23, y: -17 },
      },
    );

    const screen = viewport.localToScreen({ x: 3.25, y: 1.75 });
    const local = viewport.screenToLocal(screen);

    expect(local.x).toBeCloseTo(3.25, 6);
    expect(local.y).toBeCloseTo(1.75, 6);
  });

  test("converts distances with the same scale", () => {
    const viewport = createEditorViewport(viewBox, { width: 600, height: 400 }, { paddingPx: 0 });
    const px = viewport.localDistanceToScreen(2);

    expect(px).toBeCloseTo(100, 6);
    expect(viewport.screenDistanceToLocal(px)).toBeCloseTo(2, 6);
  });
});

describe("clampZoom", () => {
  test("keeps zoom inside the editor range", () => {
    expect(clampZoom(0.1)).toBe(0.25);
    expect(clampZoom(2)).toBe(2);
    expect(clampZoom(6)).toBe(4);
  });
});

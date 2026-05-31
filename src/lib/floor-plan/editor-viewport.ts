import type { Point2D } from "@/domain/geometry/geometry-2d.types";
import type { RenderViewBox } from "./floor-plan-render-model";

export type ViewportSizePx = {
  width: number;
  height: number;
};

export type ViewportPanPx = {
  x: number;
  y: number;
};

export type EditorViewportOptions = {
  zoom?: number;
  panPx?: ViewportPanPx;
  paddingPx?: number;
};

export type EditorViewport = {
  viewBox: RenderViewBox;
  sizePx: ViewportSizePx;
  scalePxPerM: number;
  offsetPx: ViewportPanPx;
  zoom: number;
  localToScreen(point: Point2D): Point2D;
  screenToLocal(point: Point2D): Point2D;
  localDistanceToScreen(distanceM: number): number;
  screenDistanceToLocal(distancePx: number): number;
};

const MIN_DIMENSION_PX = 1;
const MIN_VIEWBOX_M = 0.001;

export function createEditorViewport(
  viewBox: RenderViewBox,
  sizePx: ViewportSizePx,
  options: EditorViewportOptions = {},
): EditorViewport {
  const widthPx = Math.max(sizePx.width, MIN_DIMENSION_PX);
  const heightPx = Math.max(sizePx.height, MIN_DIMENSION_PX);
  const paddingPx = Math.max(options.paddingPx ?? 32, 0);
  const zoom = Math.max(options.zoom ?? 1, 0.05);
  const panPx = options.panPx ?? { x: 0, y: 0 };

  const contentWidthPx = Math.max(widthPx - paddingPx * 2, MIN_DIMENSION_PX);
  const contentHeightPx = Math.max(heightPx - paddingPx * 2, MIN_DIMENSION_PX);
  const baseScale = Math.min(
    contentWidthPx / Math.max(viewBox.width, MIN_VIEWBOX_M),
    contentHeightPx / Math.max(viewBox.height, MIN_VIEWBOX_M),
  );
  const scalePxPerM = baseScale * zoom;
  const drawnWidthPx = viewBox.width * scalePxPerM;
  const drawnHeightPx = viewBox.height * scalePxPerM;
  const offsetPx = {
    x: (widthPx - drawnWidthPx) / 2 + panPx.x,
    y: (heightPx - drawnHeightPx) / 2 + panPx.y,
  };
  const maxY = viewBox.minY + viewBox.height;

  return {
    viewBox,
    sizePx: { width: widthPx, height: heightPx },
    scalePxPerM,
    offsetPx,
    zoom,
    localToScreen(point) {
      return {
        x: offsetPx.x + (point.x - viewBox.minX) * scalePxPerM,
        y: offsetPx.y + (maxY - point.y) * scalePxPerM,
      };
    },
    screenToLocal(point) {
      return {
        x: viewBox.minX + (point.x - offsetPx.x) / scalePxPerM,
        y: maxY - (point.y - offsetPx.y) / scalePxPerM,
      };
    },
    localDistanceToScreen(distanceM) {
      return distanceM * scalePxPerM;
    },
    screenDistanceToLocal(distancePx) {
      return distancePx / scalePxPerM;
    },
  };
}

export function clampZoom(zoom: number): number {
  return Math.min(Math.max(zoom, 0.25), 4);
}

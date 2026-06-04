import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Maximize2, Minus, Plus } from "lucide-react";
import type { FloorPlanCommand } from "@/domain/floor-plan/commands";
import type { FloorPlanDocument, FloorLevel } from "@/domain/floor-plan/floor-plan.types";
import type { Point2D } from "@/domain/geometry/geometry-2d.types";
import { buildRenderModel } from "@/lib/floor-plan/floor-plan-render-model";
import { clampZoom, createEditorViewport } from "@/lib/floor-plan/editor-viewport";
import { getSymbol } from "@/lib/floor-plan/symbols/symbol-registry";
import {
  findRoomAtPoint,
  offsetAlongWall,
  pickFloorPlanElement,
  wallDragAxis,
} from "@/lib/floor-plan/editor-hit-testing";
import { snapDelta, snapOpeningOffset, snapPoint } from "@/lib/floor-plan/snap-engine";
import {
  orthoSnapEndpoint,
  buildAddWallCommand,
} from "@/lib/floor-plan/draw-wall-interaction";
import {
  buildAddOpeningCommand,
  type OpeningPlacementKind,
} from "@/lib/floor-plan/add-opening-interaction";
import type { FloorPlanSelection } from "@/hooks/useFloorPlanEditor";
import type { FloorPlanTool } from "./FloorPlanToolbar";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type FloorPlanCanvasProps = {
  document: FloorPlanDocument;
  levelId: string;
  selectedElement: FloorPlanSelection | null;
  activeTool: FloorPlanTool;
  snapEnabled: boolean;
  statusMessage: string | null;
  onSelectElement: (selection: FloorPlanSelection | null) => void;
  onPreviewCommand: (command: FloorPlanCommand, baseDocument: FloorPlanDocument) => boolean;
  onResetPreview: (baseDocument: FloorPlanDocument) => void;
  onCommitCommand: (command: FloorPlanCommand, baseDocument: FloorPlanDocument) => Promise<boolean>;
};

type DragState =
  | {
      kind: "edit";
      pointerId: number;
      selection: Exclude<FloorPlanSelection, { kind: "room" }>;
      startLocal: Point2D;
      baseDocument: FloorPlanDocument;
      latestCommand: FloorPlanCommand | null;
    }
  | {
      kind: "pan";
      pointerId: number;
      startScreen: Point2D;
      startPan: Point2D;
    };

const FALLBACK_SIZE = { width: 900, height: 620 };

export function FloorPlanCanvas({
  document,
  levelId,
  selectedElement,
  activeTool,
  snapEnabled,
  statusMessage,
  onSelectElement,
  onPreviewCommand,
  onResetPreview,
  onCommitCommand,
}: FloorPlanCanvasProps) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const [sizePx, setSizePx] = useState(FALLBACK_SIZE);
  const [zoom, setZoom] = useState(1);
  const [panPx, setPanPx] = useState<Point2D>({ x: 0, y: 0 });

  // draw_wall tool state
  const [drawStart, setDrawStart] = useState<Point2D | null>(null);
  const [drawCursor, setDrawCursor] = useState<Point2D | null>(null);

  // add_opening tool state
  const [openingKind, setOpeningKind] = useState<OpeningPlacementKind>("door");

  const level =
    document.levels.find((candidate) => candidate.id === levelId) ?? document.levels[0]!;
  const model = useMemo(() => buildRenderModel(document, level.id), [document, level.id]);
  const viewport = useMemo(
    () => createEditorViewport(model.viewBox, sizePx, { zoom, panPx, paddingPx: 42 }),
    [model.viewBox, panPx, sizePx, zoom],
  );

  useEffect(() => {
    const node = svgRef.current;
    if (!node) return;

    const updateSize = () => {
      const rect = node.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        setSizePx({ width: rect.width, height: rect.height });
      }
    };

    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  // Cancel draw_wall on Escape
  const cancelDrawWall = useCallback(() => {
    setDrawStart(null);
    setDrawCursor(null);
  }, []);

  useEffect(() => {
    if (activeTool !== "draw_wall") {
      cancelDrawWall();
      return;
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") cancelDrawWall();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activeTool, cancelDrawWall]);

  function localFromEvent(event: React.PointerEvent<SVGSVGElement>): Point2D {
    const rect = event.currentTarget.getBoundingClientRect();
    return viewport.screenToLocal({ x: event.clientX - rect.left, y: event.clientY - rect.top });
  }

  function screenFromEvent(event: React.PointerEvent<SVGSVGElement>): Point2D {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  function handlePointerDown(event: React.PointerEvent<SVGSVGElement>) {
    const local = localFromEvent(event);
    const screen = screenFromEvent(event);

    if (activeTool === "draw_wall") {
      const snapped = snapPoint(local, level).point;
      if (!drawStart) {
        setDrawStart(snapped);
        setDrawCursor(snapped);
      } else {
        const end = orthoSnapEndpoint(drawStart, snapped);
        void onCommitCommand(buildAddWallCommand(level.id, drawStart, end), document);
        setDrawStart(null);
        setDrawCursor(null);
      }
      return;
    }

    if (activeTool === "add_opening") {
      const local = localFromEvent(event);
      const picked = pickFloorPlanElement(level, local);
      if (picked?.kind === "wall") {
        const wall = level.walls.find((w) => w.id === picked.id);
        if (wall) {
          const offset = offsetAlongWall(wall, local);
          void onCommitCommand(buildAddOpeningCommand(level.id, wall.id, offset, openingKind), document);
        }
      }
      return;
    }

    if (activeTool === "pan" || event.button === 1) {
      dragRef.current = {
        kind: "pan",
        pointerId: event.pointerId,
        startScreen: screen,
        startPan: panPx,
      };
      event.currentTarget.setPointerCapture(event.pointerId);
      return;
    }

    const picked = pickFloorPlanElement(level, local);
    if (!picked) {
      onSelectElement(null);
      dragRef.current = null;
      return;
    }

    const selection = { kind: picked.kind, id: picked.id } as FloorPlanSelection;
    onSelectElement(selection);

    if (selection.kind === "room") return;

    dragRef.current = {
      kind: "edit",
      pointerId: event.pointerId,
      selection,
      startLocal: local,
      baseDocument: document,
      latestCommand: null,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handlePointerMove(event: React.PointerEvent<SVGSVGElement>) {
    if (activeTool === "draw_wall" && drawStart) {
      const local = localFromEvent(event);
      setDrawCursor(orthoSnapEndpoint(drawStart, local));
      return;
    }

    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;

    if (drag.kind === "pan") {
      const screen = screenFromEvent(event);
      setPanPx({
        x: drag.startPan.x + screen.x - drag.startScreen.x,
        y: drag.startPan.y + screen.y - drag.startScreen.y,
      });
      return;
    }

    const local = localFromEvent(event);
    const command = commandForDrag(
      drag.selection,
      drag.startLocal,
      local,
      level.id,
      drag.baseDocument,
      snapEnabled,
    );
    drag.latestCommand = command;
    if (command) onPreviewCommand(command, drag.baseDocument);
  }

  async function handlePointerUp(event: React.PointerEvent<SVGSVGElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    if (drag.kind === "pan") return;

    if (!drag.latestCommand) {
      onResetPreview(drag.baseDocument);
      return;
    }

    await onCommitCommand(drag.latestCommand, drag.baseDocument);
  }

  function handlePointerCancel(event: React.PointerEvent<SVGSVGElement>) {
    const drag = dragRef.current;
    dragRef.current = null;
    if (drag?.kind === "edit") onResetPreview(drag.baseDocument);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  return (
    <section className="relative min-h-[620px] flex-1 overflow-hidden bg-stone-100">
      <svg
        ref={svgRef}
        role="img"
        aria-label="Interaktiv plantegning"
        className={cn(
          "h-full min-h-[620px] w-full touch-none select-none bg-stone-100",
          activeTool === "pan" ? "cursor-grab" : activeTool === "draw_wall" ? "cursor-crosshair" : "cursor-crosshair",
        )}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
      >
        <defs>
          <pattern id="floor-plan-grid" width="24" height="24" patternUnits="userSpaceOnUse">
            <path d="M 24 0 L 0 0 0 24" fill="none" stroke="#d6d3d1" strokeWidth="0.75" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#floor-plan-grid)" />
        {model.rooms.map((room) => (
          <polygon
            key={room.id}
            data-room-id={room.id}
            points={room.points
              .map((point) => pointString(viewport.localToScreen(point)))
              .join(" ")}
            className={cn(
              "fill-white stroke-stone-200 transition-colors",
              selectedElement?.kind === "room" &&
                selectedElement.id === room.id &&
                "fill-sky-50 stroke-sky-300",
            )}
            strokeWidth={1}
          />
        ))}
        {model.rooms.flatMap((room) =>
          room.floorHatchPaths.map((d, idx) => {
            const pts = parseHatchPath(d);
            if (!pts) return null;
            const a = viewport.localToScreen(pts[0]);
            const b = viewport.localToScreen(pts[1]);
            return (
              <line
                key={`${room.id}-hatch-${idx}`}
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                stroke="#d0cdc8"
                strokeWidth={0.5}
                style={{ pointerEvents: "none" }}
              />
            );
          }),
        )}
        {model.rooms.map((room) => {
          const label = viewport.localToScreen(room.labelPoint);
          return (
            <g key={`${room.id}-label`} className="pointer-events-none">
              <text
                x={label.x}
                y={label.y - 5}
                textAnchor="middle"
                className="fill-stone-700 text-[12px] font-medium"
              >
                {room.name}
              </text>
              <text
                x={label.x}
                y={label.y + 11}
                textAnchor="middle"
                className="fill-stone-500 text-[10px]"
              >
                {formatArea(room.areaM2)}
              </text>
            </g>
          );
        })}
        {model.wallPoche
          .filter((poly) => poly.length >= 3)
          .map((poly, i) => (
            <polygon
              key={`poche-${i}`}
              data-wall-poche={i}
              points={poly.map((p) => pointString(viewport.localToScreen(p))).join(" ")}
              className="fill-stone-900"
            />
          ))}
        {selectedElement?.kind === "wall" &&
          (() => {
            const wall = model.walls.find((w) => w.id === selectedElement.id);
            if (!wall) return null;
            const start = viewport.localToScreen(wall.start);
            const end = viewport.localToScreen(wall.end);
            return (
              <line
                key={`selected-wall-highlight-${wall.id}`}
                x1={start.x}
                y1={start.y}
                x2={end.x}
                y2={end.y}
                className="stroke-sky-600"
                strokeWidth={Math.max(viewport.localDistanceToScreen(wall.thicknessM), 7)}
                strokeLinecap="square"
              />
            );
          })()}
        {model.openings.map((op) => {
          const c = viewport.localToScreen(op.center);
          const s = viewport.localDistanceToScreen(1);
          let paths: string[] = [];
          try {
            if (op.kind === "door") paths = getSymbol("door_left", op.widthM).paths;
            else if (op.kind === "sliding_door") paths = getSymbol("sliding_door", op.widthM).paths;
            else if (op.kind === "window") paths = getSymbol("window", op.widthM).paths;
            else if (op.kind === "garage_door") paths = getSymbol("garage_door", op.widthM).paths;
          } catch {
            paths = [];
          }
          const selected = selectedElement?.kind === "opening" && selectedElement.id === op.id;
          return (
            <g
              key={op.id}
              data-opening-id={op.id}
              transform={`translate(${c.x},${c.y}) rotate(${-op.angleDeg}) scale(${s},${-s})`}
            >
              {paths.length > 0 ? (
                paths.map((dStr, i) => (
                  <path
                    key={i}
                    d={dStr}
                    fill="none"
                    strokeWidth={1.5 / s}
                    className={selected ? "stroke-sky-600" : "stroke-emerald-600"}
                  />
                ))
              ) : (
                <circle
                  r={0.15}
                  className={
                    selected
                      ? "stroke-sky-600 fill-white"
                      : "stroke-emerald-600 fill-white"
                  }
                  strokeWidth={1.5 / s}
                />
              )}
            </g>
          );
        })}
        {model.fixtures.map((fixture) => {
          const center = viewport.localToScreen(fixture.labelPoint);
          const size = Math.max(viewport.localDistanceToScreen(0.44), 12);
          const selected = selectedElement?.kind === "fixture" && selectedElement.id === fixture.id;
          return (
            <g key={fixture.id} data-fixture-id={fixture.id}>
              <rect
                x={center.x - size / 2}
                y={center.y - size / 2}
                width={size}
                height={size}
                rx={3}
                className={cn(
                  "fill-stone-50 stroke-stone-500",
                  selected && "fill-sky-50 stroke-sky-600",
                )}
                strokeWidth={selected ? 2.5 : 1.5}
              />
              <text
                x={center.x}
                y={center.y + 3}
                textAnchor="middle"
                className="pointer-events-none fill-stone-600 text-[8px] font-semibold uppercase"
              >
                FX
              </text>
            </g>
          );
        })}
        {activeTool === "draw_wall" && drawStart && drawCursor && (() => {
          const startScreen = viewport.localToScreen(drawStart);
          const endScreen = viewport.localToScreen(drawCursor);
          const midScreen = {
            x: (startScreen.x + endScreen.x) / 2,
            y: (startScreen.y + endScreen.y) / 2,
          };
          const distanceM = Math.hypot(drawCursor.x - drawStart.x, drawCursor.y - drawStart.y);
          return (
            <g className="pointer-events-none" data-draw-wall-preview>
              <line
                x1={startScreen.x}
                y1={startScreen.y}
                x2={endScreen.x}
                y2={endScreen.y}
                strokeDasharray="6 3"
                strokeWidth={2}
                className="stroke-sky-500"
              />
              <text
                x={midScreen.x}
                y={midScreen.y - 6}
                textAnchor="middle"
                className="fill-sky-700 text-[11px] font-medium"
              >
                {distanceM.toFixed(2)} m
              </text>
            </g>
          );
        })()}
      </svg>

      <div className="absolute left-4 top-4 rounded-md border border-stone-200 bg-white/95 px-3 py-2 text-xs text-stone-600 shadow-sm">
        <span className="font-medium text-stone-900">{model.levelName}</span>
        <span className="ml-2 font-mono">{Math.round(zoom * 100)}%</span>
      </div>

      {statusMessage && (
        <div className="absolute inset-x-4 bottom-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 shadow-sm">
          {statusMessage}
        </div>
      )}

      <div className="absolute right-4 top-4 flex gap-1 rounded-md border border-stone-200 bg-white/95 p-1 shadow-sm">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Zoom ud"
          onClick={() => setZoom((value) => clampZoom(value - 0.15))}
        >
          <Minus />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Nulstil visning"
          onClick={() => {
            setZoom(1);
            setPanPx({ x: 0, y: 0 });
          }}
        >
          <Maximize2 />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Zoom ind"
          onClick={() => setZoom((value) => clampZoom(value + 0.15))}
        >
          <Plus />
        </Button>
      </div>

      {activeTool === "add_opening" && (
        <div
          className="absolute left-4 bottom-14 flex gap-1 rounded-md border border-stone-200 bg-white/95 p-1 shadow-sm"
          data-opening-kind-selector
        >
          <button
            type="button"
            aria-pressed={openingKind === "door"}
            onClick={() => setOpeningKind("door")}
            className={cn(
              "rounded px-3 py-1 text-xs font-medium transition-colors",
              openingKind === "door"
                ? "bg-stone-800 text-white"
                : "text-stone-600 hover:bg-stone-100",
            )}
          >
            Dør
          </button>
          <button
            type="button"
            aria-pressed={openingKind === "window"}
            onClick={() => setOpeningKind("window")}
            className={cn(
              "rounded px-3 py-1 text-xs font-medium transition-colors",
              openingKind === "window"
                ? "bg-stone-800 text-white"
                : "text-stone-600 hover:bg-stone-100",
            )}
          >
            Vindue
          </button>
        </div>
      )}
    </section>
  );
}

function commandForDrag(
  selection: Exclude<FloorPlanSelection, { kind: "room" }>,
  startLocal: Point2D,
  currentLocal: Point2D,
  levelId: string,
  baseDocument: FloorPlanDocument,
  snapEnabled: boolean,
): FloorPlanCommand | null {
  const level = baseDocument.levels.find((candidate) => candidate.id === levelId);
  if (!level) return null;

  if (selection.kind === "wall") {
    const wall = level.walls.find((candidate) => candidate.id === selection.id);
    if (!wall) return null;
    const axis = wallDragAxis(wall);
    const rawDelta = axis === "x" ? currentLocal.x - startLocal.x : currentLocal.y - startLocal.y;
    const deltaM = snapEnabled ? snapDelta(rawDelta) : rawDelta;
    if (Math.abs(deltaM) < 0.005) return null;
    return { type: "move_wall", wallId: wall.id, axis, deltaM };
  }

  if (selection.kind === "opening") {
    const opening = level.openings.find((candidate) => candidate.id === selection.id);
    if (!opening) return null;
    const wall = level.walls.find((candidate) => candidate.id === opening.wallId);
    if (!wall) return null;
    const rawOffset = offsetAlongWall(wall, currentLocal);
    const offsetM = snapEnabled ? snapOpeningOffset(rawOffset, wall, opening.widthM) : rawOffset;
    if (Math.abs(offsetM - opening.offsetAlongWallM) < 0.005) return null;
    return { type: "move_opening", openingId: opening.id, wallId: wall.id, offsetM };
  }

  const fixture = level.fixtures.find((candidate) => candidate.id === selection.id);
  if (!fixture) return null;
  const point = snapEnabled ? snapPoint(currentLocal, level).point : currentLocal;
  const roomId = findRoomAtPoint(level, point) ?? fixture.roomId;
  if (!roomId) return null;
  if (Math.hypot(point.x - fixture.position.x, point.y - fixture.position.y) < 0.005) return null;
  return { type: "move_fixture", fixtureId: fixture.id, roomId, x: point.x, y: point.y };
}

function pointString(point: Point2D): string {
  return `${roundPx(point.x)},${roundPx(point.y)}`;
}

/**
 * Parse a hatch path `d` string of the form "M x,y L x,y" (LOCAL_METER)
 * into two Point2D endpoints. Returns null for malformed strings.
 */
function parseHatchPath(d: string): [Point2D, Point2D] | null {
  const match = /M\s*([\d.-]+)\s*,\s*([\d.-]+)\s*L\s*([\d.-]+)\s*,\s*([\d.-]+)/.exec(d);
  if (!match) return null;
  return [
    { x: parseFloat(match[1]!), y: parseFloat(match[2]!) },
    { x: parseFloat(match[3]!), y: parseFloat(match[4]!) },
  ];
}

function roundPx(value: number): number {
  return Math.round(value * 100) / 100;
}

function formatArea(areaM2: number): string {
  return `${areaM2.toFixed(1)} m²`;
}

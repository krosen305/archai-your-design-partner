import { useEffect, useMemo, useState } from "react";
import { ArrowRight, MoveHorizontal, MoveVertical, Save, Trash2 } from "lucide-react";
import type { FloorPlanCommand } from "@/domain/floor-plan/commands";
import type {
  FloorPlanDocument,
  FloorLevel,
  Opening,
  RoomZone,
  Wall,
} from "@/domain/floor-plan/floor-plan.types";
import { lineLengthM } from "@/domain/geometry/polygon-ops";
import type { FloorPlanSelection } from "@/hooks/useFloorPlanEditor";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  findRoomAtPoint,
  wallBordersRoom,
  wallDragAxis,
} from "@/lib/floor-plan/editor-hit-testing";
import { deltaForTargetLength, wallCoordinate } from "@/lib/floor-plan/dimension-edit";

const ROOM_TYPES: Array<{ value: RoomZone["roomType"]; label: string }> = [
  { value: "entrance", label: "Entré" },
  { value: "hall", label: "Gang" },
  { value: "living", label: "Stue" },
  { value: "kitchen", label: "Køkken" },
  { value: "bedroom", label: "Værelse" },
  { value: "bathroom", label: "Bad" },
  { value: "utility", label: "Bryggers" },
  { value: "office", label: "Kontor" },
  { value: "storage", label: "Opbevaring" },
  { value: "technical", label: "Teknik" },
  { value: "stair", label: "Trappe" },
  { value: "garage", label: "Garage" },
  { value: "other", label: "Andet" },
];

type FloorPlanInspectorProps = {
  document: FloorPlanDocument;
  levelId: string;
  selectedElement: FloorPlanSelection | null;
  onCommitCommand: (
    command: FloorPlanCommand,
    baseDocument: FloorPlanDocument,
    source: "keyboard",
  ) => Promise<boolean>;
};

export function FloorPlanInspector({
  document,
  levelId,
  selectedElement,
  onCommitCommand,
}: FloorPlanInspectorProps) {
  const level =
    document.levels.find((candidate) => candidate.id === levelId) ?? document.levels[0]!;
  const selected = useMemo(
    () => resolveSelection(level, selectedElement),
    [level, selectedElement],
  );

  return (
    <aside className="w-full border-b border-border/40 bg-surface p-4 lg:w-[340px] lg:border-b-0 lg:border-l">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Inspector</h2>
          <p className="text-xs text-muted-foreground">
            {selected?.label ?? "Intet element valgt"}
          </p>
        </div>
        {selected?.kind && (
          <span className="rounded bg-surface-elevated px-2 py-1 font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
            {selected.kind === "wall"
              ? "Væg"
              : selected.kind === "opening"
                ? "Åbning"
                : selected.kind === "fixture"
                  ? "Inventar"
                  : "Rum"}
          </span>
        )}
      </div>

      {!selected && (
        <div className="rounded-md border border-dashed border-border/40 p-4 text-sm text-muted-foreground">
          Vælg en væg, åbning, fixture eller et rum i tegningen.
        </div>
      )}

      {selected?.kind === "wall" && (
        <WallInspector wall={selected.wall} document={document} onCommitCommand={onCommitCommand} />
      )}
      {selected?.kind === "opening" && (
        <OpeningInspector
          opening={selected.opening}
          hostWall={selected.hostWall}
          level={level}
          document={document}
          onCommitCommand={onCommitCommand}
        />
      )}
      {selected?.kind === "fixture" && (
        <FixtureInspector
          fixture={selected.fixture}
          level={level}
          document={document}
          onCommitCommand={onCommitCommand}
        />
      )}
      {selected?.kind === "room" && (
        <RoomInspector
          room={selected.room}
          level={level}
          document={document}
          onCommitCommand={onCommitCommand}
        />
      )}
    </aside>
  );
}

function WallInspector({
  wall,
  document,
  onCommitCommand,
}: {
  wall: Wall;
  document: FloorPlanDocument;
  onCommitCommand: FloorPlanInspectorProps["onCommitCommand"];
}) {
  const axis = wallDragAxis(wall);
  const currentCoord = wallCoordinate(wall, axis);
  const [delta, setDelta] = useState("0.1");
  const [position, setPosition] = useState(currentCoord.toFixed(3));

  useEffect(() => {
    setDelta("0.1");
    setPosition(wallCoordinate(wall, wallDragAxis(wall)).toFixed(3));
    // wall.id / centerline.start are the only stable identifiers we need to
    // react to; including the full `wall` object would trigger on every render
    // that produces a new reference even when the data is identical.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wall.id, wall.centerline.start.x, wall.centerline.start.y]);

  const lengthM = lineLengthM(wall.centerline);
  const Icon = axis === "x" ? MoveHorizontal : MoveVertical;
  const parsedDelta = Number.parseFloat(delta);
  const canApply = Number.isFinite(parsedDelta) && Math.abs(parsedDelta) > 0;

  function commitPositionValue(rawValue: string) {
    const target = Number.parseFloat(rawValue);
    if (!Number.isFinite(target)) return;
    const dm = deltaForTargetLength(currentCoord, target);
    if (Math.abs(dm) < 1e-9) return;
    void onCommitCommand(
      { type: "move_wall", wallId: wall.id, axis, deltaM: dm },
      document,
      "keyboard",
    );
  }

  return (
    <div className="space-y-4 text-sm">
      <InfoRow label="Længde" value={`${lengthM.toFixed(2)} m`} />
      <InfoRow label="Tykkelse" value={`${wall.thicknessM.toFixed(2)} m`} />
      <InfoRow label="Rolle" value={wall.structuralRole} />
      <InfoRow label="Flytteakse" value={axis.toUpperCase()} />

      <div className="rounded-md border border-border/40 bg-surface p-3">
        <label className="mb-2 block font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          Position (m)
        </label>
        <div className="flex gap-2">
          <input
            type="number"
            step="0.01"
            value={position}
            aria-label="Vægposition"
            onChange={(event) => setPosition(event.target.value)}
            onBlur={(event) => commitPositionValue(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") commitPositionValue(event.currentTarget.value);
            }}
            className="min-w-0 flex-1 rounded-md border border-border bg-input text-foreground px-3 py-2 text-sm outline-none focus:border-accent/60"
          />
        </div>
      </div>

      <div className="rounded-md border border-border/40 bg-surface p-3">
        <label className="mb-2 block font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          Præcis flytning (m)
        </label>
        <div className="flex gap-2">
          <input
            type="number"
            step="0.1"
            value={delta}
            onChange={(event) => setDelta(event.target.value)}
            className="min-w-0 flex-1 rounded-md border border-border bg-input text-foreground px-3 py-2 text-sm outline-none focus:border-accent/60"
          />
          <Button
            type="button"
            size="icon"
            variant="outline"
            disabled={!canApply}
            aria-label="Flyt væg"
            onClick={() =>
              void onCommitCommand(
                { type: "move_wall", wallId: wall.id, axis, deltaM: parsedDelta },
                document,
                "keyboard",
              )
            }
          >
            <Icon />
          </Button>
        </div>
      </div>
    </div>
  );
}

function OpeningInspector({
  opening,
  hostWall,
  level,
  document,
  onCommitCommand,
}: {
  opening: Opening;
  hostWall: Wall | null;
  level: FloorLevel;
  document: FloorPlanDocument;
  onCommitCommand: FloorPlanInspectorProps["onCommitCommand"];
}) {
  const [offset, setOffset] = useState(opening.offsetAlongWallM.toFixed(2));

  useEffect(
    () => setOffset(opening.offsetAlongWallM.toFixed(2)),
    [opening.id, opening.offsetAlongWallM],
  );

  const parsedOffset = Number.parseFloat(offset);
  const canApply = !!hostWall && Number.isFinite(parsedOffset);

  return (
    <div className="space-y-4 text-sm">
      <InfoRow label="Type" value={opening.openingKind} />
      <InfoRow label="Bredde" value={`${opening.widthM.toFixed(2)} m`} />
      <InfoRow label="Højde" value={`${opening.heightM.toFixed(2)} m`} />
      <InfoRow
        label="Værtsvæg"
        value={hostWall ? `Væg ${level.walls.indexOf(hostWall) + 1}` : "Ukendt"}
      />

      <div className="rounded-md border border-border/40 bg-surface p-3">
        <label className="mb-2 block font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          Afstand langs væg (m)
        </label>
        <div className="flex gap-2">
          <input
            type="number"
            min={0}
            step="0.05"
            value={offset}
            onChange={(event) => setOffset(event.target.value)}
            className="min-w-0 flex-1 rounded-md border border-border bg-input text-foreground px-3 py-2 text-sm outline-none focus:border-accent/60"
          />
          <Button
            type="button"
            size="icon"
            variant="outline"
            disabled={!canApply}
            aria-label="Gem åbning"
            onClick={() =>
              hostWall &&
              void onCommitCommand(
                {
                  type: "move_opening",
                  openingId: opening.id,
                  wallId: hostWall.id,
                  offsetM: parsedOffset,
                },
                document,
                "keyboard",
              )
            }
          >
            <ArrowRight />
          </Button>
        </div>
      </div>
    </div>
  );
}

function FixtureInspector({
  fixture,
  level,
  document,
  onCommitCommand,
}: {
  fixture: FloorLevel["fixtures"][number];
  level: FloorLevel;
  document: FloorPlanDocument;
  onCommitCommand: FloorPlanInspectorProps["onCommitCommand"];
}) {
  const [x, setX] = useState(fixture.position.x.toFixed(2));
  const [y, setY] = useState(fixture.position.y.toFixed(2));
  const [roomId, setRoomId] = useState(fixture.roomId ?? level.rooms[0]?.id ?? "");

  useEffect(() => {
    setX(fixture.position.x.toFixed(2));
    setY(fixture.position.y.toFixed(2));
    setRoomId(fixture.roomId ?? level.rooms[0]?.id ?? "");
  }, [fixture.id, fixture.position.x, fixture.position.y, fixture.roomId, level.rooms]);

  const parsed = { x: Number.parseFloat(x), y: Number.parseFloat(y) };
  const inferredRoomId =
    Number.isFinite(parsed.x) && Number.isFinite(parsed.y)
      ? (findRoomAtPoint(level, parsed) ?? roomId)
      : roomId;
  const canApply = !!inferredRoomId && Number.isFinite(parsed.x) && Number.isFinite(parsed.y);

  return (
    <div className="space-y-4 text-sm">
      <InfoRow label="Type" value={fixture.fixtureKind} />
      <InfoRow label="Rum" value={fixture.roomId ?? "Ikke placeret"} />

      <div className="space-y-3 rounded-md border border-border/40 bg-surface p-3">
        <label className="block font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          Rum
        </label>
        <select
          value={roomId}
          onChange={(event) => setRoomId(event.target.value)}
          className="w-full rounded-md border border-border bg-input text-foreground px-3 py-2 text-sm outline-none focus:border-accent/60"
        >
          {level.rooms.map((room) => (
            <option key={room.id} value={room.id}>
              {room.name}
            </option>
          ))}
        </select>
        <div className="grid grid-cols-2 gap-2">
          <label className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            X
            <input
              type="number"
              step="0.05"
              value={x}
              onChange={(event) => setX(event.target.value)}
              className="mt-1 w-full rounded-md border border-border bg-input text-foreground px-3 py-2 text-sm outline-none focus:border-accent/60"
            />
          </label>
          <label className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            Y
            <input
              type="number"
              step="0.05"
              value={y}
              onChange={(event) => setY(event.target.value)}
              className="mt-1 w-full rounded-md border border-border bg-input text-foreground px-3 py-2 text-sm outline-none focus:border-accent/60"
            />
          </label>
        </div>
        <Button
          type="button"
          variant="outline"
          disabled={!canApply}
          className="w-full"
          onClick={() =>
            void onCommitCommand(
              {
                type: "move_fixture",
                fixtureId: fixture.id,
                roomId: inferredRoomId,
                x: parsed.x,
                y: parsed.y,
              },
              document,
              "keyboard",
            )
          }
        >
          <Save />
          Gem placering
        </Button>
      </div>
    </div>
  );
}

function RoomInspector({
  room,
  level,
  document,
  onCommitCommand,
}: {
  room: RoomZone;
  level: FloorLevel;
  document: FloorPlanDocument;
  onCommitCommand: FloorPlanInspectorProps["onCommitCommand"];
}) {
  const [name, setName] = useState(room.name);
  const [roomType, setRoomType] = useState(room.roomType);
  const [targetArea, setTargetArea] = useState(
    room.targetAreaM2 != null ? String(room.targetAreaM2) : "",
  );

  useEffect(() => {
    setName(room.name);
    setRoomType(room.roomType);
    setTargetArea(room.targetAreaM2 != null ? String(room.targetAreaM2) : "");
  }, [room.id, room.name, room.roomType, room.targetAreaM2]);

  // Find a non-bearing interior wall that actually borders THIS room — used for
  // "Slet rum". Without the wallBordersRoom check this returned an arbitrary
  // interior wall elsewhere on the level, silently deleting the wrong partition.
  const deletableWall = useMemo<Wall | null>(() => {
    for (const wall of level.walls) {
      if (wall.wallKind !== "interior") continue;
      if (wall.locked) continue;
      if (wall.structuralRole === "bearing") continue;
      if (!wallBordersRoom(wall, room.polygon)) continue;
      return wall;
    }
    return null;
  }, [level.walls, room.polygon]);

  function commitName(newName: string) {
    void onCommitCommand(
      { type: "update_room", roomId: room.id, name: newName },
      document,
      "keyboard",
    );
  }

  function commitRoomType(newType: RoomZone["roomType"]) {
    void onCommitCommand(
      { type: "update_room", roomId: room.id, roomType: newType },
      document,
      "keyboard",
    );
  }

  function commitTargetArea(raw: string) {
    const parsed = Number.parseFloat(raw);
    const value = Number.isFinite(parsed) && parsed > 0 ? parsed : null;
    void onCommitCommand(
      { type: "update_room", roomId: room.id, targetAreaM2: value },
      document,
      "keyboard",
    );
  }

  return (
    <div className="space-y-4 text-sm">
      <InfoRow label="Areal" value={`${room.netAreaM2.toFixed(1)} m²`} />
      <InfoRow
        label="Ventilation"
        value={room.ventilationNeed === "unknown" ? "Ukendt" : room.ventilationNeed}
      />

      <div className="space-y-3 rounded-md border border-border/40 bg-surface p-3">
        <label className="block font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          Navn
          <input
            type="text"
            aria-label="Navn"
            value={name}
            onChange={(event) => setName(event.target.value)}
            onBlur={() => commitName(name)}
            className="mt-1 w-full rounded-md border border-border bg-input text-foreground px-3 py-2 text-sm outline-none focus:border-accent/60"
          />
        </label>

        <label className="block font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          Type
          <select
            aria-label="Type"
            value={roomType}
            onChange={(event) => {
              const next = event.target.value as RoomZone["roomType"];
              setRoomType(next);
              commitRoomType(next);
            }}
            className="mt-1 w-full rounded-md border border-border bg-input text-foreground px-3 py-2 text-sm outline-none focus:border-accent/60"
          >
            {ROOM_TYPES.map((type) => (
              <option key={type.value} value={type.value}>
                {type.label}
              </option>
            ))}
          </select>
        </label>

        <label className="block font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          Målsat areal m²
          <input
            type="number"
            min={0.1}
            step={0.5}
            value={targetArea}
            onChange={(event) => setTargetArea(event.target.value)}
            onBlur={() => commitTargetArea(targetArea)}
            placeholder="Ikke sat"
            className="mt-1 w-full rounded-md border border-border bg-input text-foreground px-3 py-2 text-sm outline-none focus:border-accent/60"
          />
        </label>
      </div>

      <div className="space-y-2">
        {deletableWall ? (
          <Button
            type="button"
            variant="outline"
            className={cn("w-full border-red-200 text-red-700 hover:bg-red-50")}
            onClick={() =>
              void onCommitCommand(
                { type: "delete_wall", wallId: deletableWall.id },
                document,
                "keyboard",
              )
            }
          >
            <Trash2 />
            Slet rum
          </Button>
        ) : (
          <p className="text-xs text-stone-400">
            Ingen slettebar skillevæg fundet — rummet kan ikke slettes direkte.
          </p>
        )}
      </div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-border/30 py-2">
      <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <span className="break-words text-right text-sm font-medium text-foreground">{value}</span>
    </div>
  );
}

function resolveSelection(level: FloorLevel, selection: FloorPlanSelection | null) {
  if (!selection) return null;

  if (selection.kind === "wall") {
    const wall = level.walls.find((candidate) => candidate.id === selection.id);
    if (!wall) return null;
    const index = level.walls.indexOf(wall) + 1;
    const roleLabel = wall.wallKind === "exterior" ? "Ydervæg" : "Skillevæg";
    return { kind: "wall" as const, label: `${roleLabel} ${index}`, wall };
  }

  if (selection.kind === "opening") {
    const opening = level.openings.find((candidate) => candidate.id === selection.id);
    const hostWall = opening
      ? (level.walls.find((wall) => wall.id === opening.wallId) ?? null)
      : null;
    if (!opening) return null;
    const kindLabel =
      opening.openingKind === "door"
        ? "Dør"
        : opening.openingKind === "window"
          ? "Vindue"
          : "Åbning";
    const index = level.openings.indexOf(opening) + 1;
    return { kind: "opening" as const, label: `${kindLabel} ${index}`, opening, hostWall };
  }

  if (selection.kind === "fixture") {
    const fixture = level.fixtures.find((candidate) => candidate.id === selection.id);
    if (!fixture) return null;
    const index = level.fixtures.indexOf(fixture) + 1;
    return {
      kind: "fixture" as const,
      label: `Inventar ${index} (${fixture.fixtureKind})`,
      fixture,
    };
  }

  const room = level.rooms.find((candidate) => candidate.id === selection.id);
  return room ? { kind: "room" as const, label: room.name, room } : null;
}

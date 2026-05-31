import { describe, expect, test } from "bun:test";
import type { Line2D } from "../geometry/geometry-2d.types";
import { detectRooms, reconcileRoomIdentity } from "./topology-engine";

/** Build wall centerlines from coordinate pairs. */
function walls(...segments: Array<[[number, number], [number, number]]>): Line2D[] {
  return segments.map(([a, b]) => ({
    start: { x: a[0], y: a[1] },
    end: { x: b[0], y: b[1] },
  }));
}

describe("detectRooms", () => {
  test("detects a single closed square room", () => {
    const rooms = detectRooms(
      walls(
        [
          [0, 0],
          [4, 0],
        ],
        [
          [4, 0],
          [4, 4],
        ],
        [
          [4, 4],
          [0, 4],
        ],
        [
          [0, 4],
          [0, 0],
        ],
      ),
    );
    expect(rooms).toHaveLength(1);
    expect(rooms[0]!.areaM2).toBeCloseTo(16, 6);
  });

  test("splits a rectangle into two rooms via a T-junction divider", () => {
    const rooms = detectRooms(
      walls(
        [
          [0, 0],
          [6, 0],
        ], // bottom (crosses divider foot at x=3)
        [
          [6, 0],
          [6, 4],
        ], // right
        [
          [6, 4],
          [0, 4],
        ], // top (crosses divider head at x=3)
        [
          [0, 4],
          [0, 0],
        ], // left
        [
          [3, 0],
          [3, 4],
        ], // divider
      ),
    );
    expect(rooms).toHaveLength(2);
    for (const room of rooms) {
      expect(room.areaM2).toBeCloseTo(12, 6);
    }
  });

  test("returns no rooms for an open (unclosed) wall chain", () => {
    const rooms = detectRooms(
      walls(
        [
          [0, 0],
          [4, 0],
        ],
        [
          [4, 0],
          [4, 4],
        ],
        [
          [4, 4],
          [0, 4],
        ],
      ),
    );
    expect(rooms).toHaveLength(0);
  });
});

describe("reconcileRoomIdentity", () => {
  const square = detectRooms(
    walls(
      [
        [0, 0],
        [4, 0],
      ],
      [
        [4, 0],
        [4, 4],
      ],
      [
        [4, 4],
        [0, 4],
      ],
      [
        [0, 4],
        [0, 0],
      ],
    ),
  );

  test("preserves a previous room id whose centroid stays inside", () => {
    const reconciled = reconcileRoomIdentity(
      [{ id: "room_keep", centroid: { x: 2, y: 2 } }],
      square,
    );
    expect(reconciled).toHaveLength(1);
    expect(reconciled[0]!.id).toBe("room_keep");
  });

  test("assigns a deterministic new id when no previous room matches", () => {
    const a = reconcileRoomIdentity([], square);
    const b = reconcileRoomIdentity([], square);
    expect(a[0]!.id).toBe(b[0]!.id);
    expect(a[0]!.id.length).toBeGreaterThan(0);
  });
});

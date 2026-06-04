import { describe, expect, it } from "bun:test";
import { layoutWalls } from "./layout-engine";
import { detectRooms } from "./topology-engine";

describe("layout-engine", () => {
  it("producerer et lukket hylster + skillevægge der giver mindst antallet af rum", () => {
    const walls = layoutWalls({
      widthM: 10, depthM: 8,
      rooms: [
        { name: "Stue", roomType: "living" },
        { name: "Køkken", roomType: "kitchen" },
        { name: "Bad", roomType: "bathroom" },
        { name: "Værelse", roomType: "bedroom" },
      ],
    });
    const faces = detectRooms(walls.map((w) => w.centerline));
    expect(faces.length).toBeGreaterThanOrEqual(4);
  });

  it("giver ikke alle rum samme bredde (ikke strimler)", () => {
    const walls = layoutWalls({
      widthM: 10, depthM: 8,
      rooms: [
        { name: "Bad", roomType: "bathroom" },
        { name: "Stue", roomType: "living" },
      ],
    });
    const faces = detectRooms(walls.map((w) => w.centerline));
    const areas = faces.map((f) => f.areaM2).sort((a, b) => a - b);
    expect(areas[0]! / areas[areas.length - 1]!).toBeLessThan(0.8);
  });
});

import { describe, expect, it } from "bun:test";
import { fetchGeoDanmarkRoadGeometry } from "./road-geometry";

const LIVE = process.env.RUN_LIVE_GEODANMARK_ROAD_SMOKE === "true";
const describeLive = LIVE ? describe : describe.skip;

describeLive("fetchGeoDanmarkRoadGeometry live smoke", () => {
  it("returns typed road centerline and road edge geometry from GeoDanmark WFS", async () => {
    const result = await fetchGeoDanmarkRoadGeometry({
      vejnavn: "Live smoke road",
      bbox25832: [724000, 6172000, 724200, 6172200],
    });

    expect(result).not.toBeNull();
    expect(result?.source.source).toBe("registry");
    expect(result?.centerline25832?.crs).toBe("EPSG:25832");
    expect(result?.centerline25832?.coordinates.length).toBeGreaterThanOrEqual(2);
    expect(result?.vejkant25832.length).toBeGreaterThanOrEqual(1);
  });
});

import { describe, it, expect } from "bun:test";
import { GeoDanmarkNaboService } from "./client";

const PARCEL_BBOX: [number, number, number, number] = [724000, 6172000, 724100, 6172100];
const ADDRESS_BBOX: [number, number, number, number] = [723900, 6171900, 724200, 6172200];

describe("GeoDanmarkNaboService.getNabobygninger", () => {
  it("returnerer mock-resultat med kilde=geodanmark (IS_MOCK=true)", async () => {
    const result = await GeoDanmarkNaboService.getNabobygninger(
      PARCEL_BBOX,
      ADDRESS_BBOX,
      "mat-js-abc123",
    );

    expect(result.status).toBe("mock");
    expect(result.data).not.toBeNull();
    expect(result.data!.kilde).toBe("geodanmark");
    expect(result.isMock).toBe(true);
    expect(result.kilde).toBe("geodanmark");
  });

  it("accepterer null parcel bbox og bruger address bbox som fallback", async () => {
    const result = await GeoDanmarkNaboService.getNabobygninger(null, ADDRESS_BBOX, null);

    expect(result.status).toBe("mock");
    expect(result.data!.kilde).toBe("geodanmark");
  });

  it("returnerer tri-state felter som null (aldrig false) i mock", async () => {
    const result = await GeoDanmarkNaboService.getNabobygninger(PARCEL_BBOX, ADDRESS_BBOX, null);

    expect(result.data!.accessRoadNearby).toBeNull();
    expect(result.data!.roadDistanceM).toBeNull();
    expect(result.data!.nearestDistanceM).toBeNull();
  });
});

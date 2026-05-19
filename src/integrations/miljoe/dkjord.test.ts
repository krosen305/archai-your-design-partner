import { describe, expect, it } from "bun:test";
import { DkJordService } from "./dkjord";

describe("DkJordService.getTilstand", () => {
  it("returns a SourceResult shape with status and data", async () => {
    const result = await DkJordService.getTilstand({ lat: 55.7, lng: 12.5 });
    expect(result.status).toBeDefined();
    expect(["ok", "mock", "error", "skipped"]).toContain(result.status);
    expect(result.kilde).toBeDefined();
    expect(result.fetchedAt).toBeDefined();
    expect(result.isMock).toBeDefined();
  });

  it("mock result has status=mock, isMock=true, and data != null", async () => {
    const result = await DkJordService.getTilstand({ lat: 55.7, lng: 12.5 });
    // IS_MOCK=true in current code
    expect(result.status).toBe("mock");
    expect(result.isMock).toBe(true);
    expect(result.data).not.toBeNull();
  });

  it("mock data payload preserves tri-state — v1Kortlagt and v2Kortlagt are boolean | null", async () => {
    const result = await DkJordService.getTilstand({ lat: 55.7, lng: 12.5 });
    const data = result.data;
    expect(data).not.toBeNull();
    // Must be boolean or null — never undefined
    expect(data!.v1Kortlagt === true || data!.v1Kortlagt === false || data!.v1Kortlagt === null).toBe(true);
    expect(data!.v2Kortlagt === true || data!.v2Kortlagt === false || data!.v2Kortlagt === null).toBe(true);
    expect(data!.olietank.eksisterer === true || data!.olietank.eksisterer === false || data!.olietank.eksisterer === null).toBe(true);
  });

  it("result.data has kilde field for backward compatibility", async () => {
    const result = await DkJordService.getTilstand({ lat: 55.7, lng: 12.5 });
    expect(result.data?.kilde).toBeDefined();
    expect(["dkjord", "mock"]).toContain(result.data?.kilde);
  });
});

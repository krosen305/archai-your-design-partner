import { describe, expect, it } from "bun:test";

const LIVE_GEUS = process.env.RUN_LIVE_GEUS_SMOKE === "true";
const LIVE_DHM = process.env.RUN_LIVE_DHM_SMOKE === "true";

describe.if(LIVE_GEUS)("Live smoke - GEUS", () => {
  it("returns a non-mock live result when FEATURE_GEUS_MOCK=false", async () => {
    const { GeusService } = await import("@/integrations/geus/client");
    const result = await GeusService.getRiskData(55.794, 12.492);

    expect(result.status).toBe("ok");
    expect(result.isMock).toBe(false);
    expect(result.data).not.toBeNull();
    expect(result.data?.radonRisk).toBeDefined();
    expect(result.data?.groundwaterDepthSummerM).not.toBeUndefined();
  }, 30_000);
});

describe.if(LIVE_DHM)("Live smoke - DHM", () => {
  it("returns a typed SourceResult payload when FEATURE_DHM_MOCK=false", async () => {
    const { DhmService, bboxFromPoint } = await import("@/integrations/sdfi/dhm-client");
    const bbox = bboxFromPoint(55.794, 12.492, 800);
    const result = await DhmService.getTerrainData(bbox, 55.794, 12.492);

    expect(result.status).toBe("ok");
    expect(result.isMock).toBe(false);
    expect(result.data).not.toBeNull();
    expect(result.data?.lowPointM).toBeTypeOf("number");
    expect(result.data?.slopePercent).toBeTypeOf("number");
  }, 30_000);
});

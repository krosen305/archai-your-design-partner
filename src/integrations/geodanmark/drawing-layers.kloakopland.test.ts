// src/integrations/geodanmark/drawing-layers.kloakopland.test.ts
import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test";
import { PlandataService } from "@/integrations/plandata/client";

const makeSpy = () => spyOn(PlandataService, "fetchKloakoplandForPoint");
let fetchKloakoplandForPoint: ReturnType<typeof makeSpy>;

beforeEach(() => {
  fetchKloakoplandForPoint = makeSpy();
});

afterEach(() => {
  fetchKloakoplandForPoint.mockRestore();
});

describe("GeoDanmarkDrawingLayersAdapter.fetchKloakopland", () => {
  it("returnerer null naar Plandata returnerer null", async () => {
    fetchKloakoplandForPoint.mockResolvedValue(null);
    const { GeoDanmarkDrawingLayersAdapter } = await import("./drawing-layers");
    const adapter = new GeoDanmarkDrawingLayersAdapter();
    const bbox: [number, number, number, number] = [720000, 6170000, 720020, 6170020];
    const result = await adapter.fetchKloakopland("0101", bbox);
    expect(result).toBeNull();
  });

  it("returnerer faelles naar Plandata siger faelles", async () => {
    fetchKloakoplandForPoint.mockResolvedValue("faelles");
    const { GeoDanmarkDrawingLayersAdapter } = await import("./drawing-layers");
    const adapter = new GeoDanmarkDrawingLayersAdapter();
    const bbox: [number, number, number, number] = [720000, 6170000, 720020, 6170020];
    const result = await adapter.fetchKloakopland("0101", bbox);
    expect(result).toBe("faelles");
  });

  it("returnerer separat naar Plandata siger separat", async () => {
    fetchKloakoplandForPoint.mockResolvedValue("separat");
    const { GeoDanmarkDrawingLayersAdapter } = await import("./drawing-layers");
    const adapter = new GeoDanmarkDrawingLayersAdapter();
    const bbox: [number, number, number, number] = [720000, 6170000, 720020, 6170020];
    const result = await adapter.fetchKloakopland("0101", bbox);
    expect(result).toBe("separat");
  });

  it("kalder fetchKloakoplandForPoint med WGS84-koordinater beregnet fra bbox-centroid", async () => {
    fetchKloakoplandForPoint.mockResolvedValue(null);
    const { GeoDanmarkDrawingLayersAdapter } = await import("./drawing-layers");
    const adapter = new GeoDanmarkDrawingLayersAdapter();
    const bbox: [number, number, number, number] = [720000, 6170000, 720020, 6170020];
    await adapter.fetchKloakopland("0101", bbox);
    expect(fetchKloakoplandForPoint).toHaveBeenCalledTimes(1);
    const [lat, lng] = fetchKloakoplandForPoint.mock.calls[0] as [number, number];
    // Centroid af bbox er (720010, 6170010) i UTM32. Konverteret til WGS84 bør lat være ~55-57
    expect(lat).toBeGreaterThan(54);
    expect(lat).toBeLessThan(58);
    expect(lng).toBeGreaterThan(8);
    expect(lng).toBeLessThan(16);
  });
});

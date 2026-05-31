import { afterAll, beforeEach, describe, expect, it, mock } from "bun:test";

const getAddressDetails = mock(async (_addressId: string) => ({
  adresse: "Hasselvej 48, 2830 Virum",
}));

mock.module("@/integrations/dar/client", () => ({
  DarService: {
    getAddressDetails,
  },
}));

// bun's mock.module is global and persists across files. Without restoring it,
// this DarService stub leaked into later-loaded files (dar/dar.test.ts and
// datafordeler/regression.test.ts) under CI's file ordering and made them fail
// (postnr/grundareal undefined). Restore after this file's tests — matching the
// mock.restore() cleanup the other integration tests already use.
afterAll(() => {
  mock.restore();
});

describe("GeoDanmarkDrawingLayersAdapter.fetchRoadName", () => {
  beforeEach(() => {
    getAddressDetails.mockReset();
    getAddressDetails.mockResolvedValue({ adresse: "Hasselvej 48, 2830 Virum" });
  });

  it("returnerer vejnavn fra DAR-adressebetegnelse", async () => {
    const { GeoDanmarkDrawingLayersAdapter } = await import("./drawing-layers");
    const adapter = new GeoDanmarkDrawingLayersAdapter();
    const result = await adapter.fetchRoadName("test-adresse-id");

    expect(result.name).toBe("Hasselvej");
    expect(getAddressDetails).toHaveBeenCalledWith("test-adresse-id", {
      skipKoordinaterOgPostnummer: true,
    });
  });

  it("haandterer vejnavne med husbogstav", async () => {
    getAddressDetails.mockResolvedValueOnce({ adresse: "Bredgade 12A, 1260 København K" });

    const { GeoDanmarkDrawingLayersAdapter } = await import("./drawing-layers");
    const adapter = new GeoDanmarkDrawingLayersAdapter();
    const result = await adapter.fetchRoadName("test-adresse-id");

    expect(result.name).toBe("Bredgade");
  });

  it("returnerer null ved DAR-fejl", async () => {
    getAddressDetails.mockRejectedValueOnce(new Error("DAR unavailable"));

    const { GeoDanmarkDrawingLayersAdapter } = await import("./drawing-layers");
    const adapter = new GeoDanmarkDrawingLayersAdapter();
    const result = await adapter.fetchRoadName("bad-id");

    expect(result.name).toBeNull();
  });
});

describe("roadNameFromDarAddressLabel", () => {
  it("returnerer null for tom adressebetegnelse", async () => {
    const { roadNameFromDarAddressLabel } = await import("./drawing-layers");
    expect(roadNameFromDarAddressLabel("")).toBeNull();
  });
});

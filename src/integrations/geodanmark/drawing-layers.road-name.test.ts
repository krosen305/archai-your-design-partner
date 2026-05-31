import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test";
import { DarService } from "@/integrations/dar/client";

// Spy on the real DarService per-test instead of a file-scope mock.module.
// bun's mock.module is global, persists across files and is NOT undone by
// mock.restore(); a module mock here previously leaked the DarService stub into
// dar/dar.test.ts and datafordeler/regression.test.ts under CI's file ordering
// and broke them. A per-test spy is only active during THIS file's tests and is
// restored after each, so it can never leak into another file.

const makeSpy = () => spyOn(DarService, "getAddressDetails");
let getAddressDetails: ReturnType<typeof makeSpy>;

beforeEach(() => {
  getAddressDetails = makeSpy();
  getAddressDetails.mockResolvedValue({ adresse: "Hasselvej 48, 2830 Virum" } as never);
});

afterEach(() => {
  getAddressDetails.mockRestore();
});

describe("GeoDanmarkDrawingLayersAdapter.fetchRoadName", () => {
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
    getAddressDetails.mockResolvedValueOnce({ adresse: "Bredgade 12A, 1260 København K" } as never);

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

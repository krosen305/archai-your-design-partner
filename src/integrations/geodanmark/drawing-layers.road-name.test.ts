import { describe, it, expect, mock, beforeEach } from "bun:test";

const fetchMock = mock(async (_url: string) => ({
  ok: true,
  json: async () => ({
    id: "test-id",
    adgangsadresse: {
      vejstykke: { adresseringsnavn: "Hasselvej" },
    },
  }),
}));

// Monkey-patch global fetch for test isolation
(globalThis as Record<string, unknown>)["fetch"] = fetchMock;

describe("GeoDanmarkDrawingLayersAdapter.fetchRoadName", () => {
  beforeEach(() => {
    fetchMock.mockReset();
  });

  it("returnerer vejnavn fra DAWA-svar", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        id: "test-id",
        adgangsadresse: {
          vejstykke: { adresseringsnavn: "Hasselvej" },
        },
      }),
    } as Response);

    const { GeoDanmarkDrawingLayersAdapter } = await import("./drawing-layers");
    const adapter = new GeoDanmarkDrawingLayersAdapter();
    const result = await adapter.fetchRoadName("test-adresse-id");

    expect(result.name).toBe("Hasselvej");
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("test-adresse-id"),
    );
  });

  it("returnerer null ved fetch-fejl", async () => {
    fetchMock.mockRejectedValueOnce(new Error("network error"));

    const { GeoDanmarkDrawingLayersAdapter } = await import("./drawing-layers");
    const adapter = new GeoDanmarkDrawingLayersAdapter();
    const result = await adapter.fetchRoadName("bad-id");

    expect(result.name).toBeNull();
  });

  it("returnerer null ved 404", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 404,
    } as Response);

    const { GeoDanmarkDrawingLayersAdapter } = await import("./drawing-layers");
    const adapter = new GeoDanmarkDrawingLayersAdapter();
    const result = await adapter.fetchRoadName("unknown-id");

    expect(result.name).toBeNull();
  });
});

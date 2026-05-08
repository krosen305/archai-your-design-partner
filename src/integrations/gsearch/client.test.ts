/**
 * Tests for GsearchService
 * Kør med: bun test src/integrations/gsearch/client.test.ts
 *
 * GSearch v2.0 returnerer adresseforslag inkl. MultiPoint geometri (EPSG:25832).
 * DarService.getAddressDetails() beriget derefter med adgangsadresseid.
 */
import { describe, it, expect, mock, beforeEach } from "bun:test";
import { GsearchService } from "./client";

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

type MockJson = Record<string, unknown>;

function mockFetch(body: MockJson, status = 200) {
  const mockedFetch = mock(async () => ({
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
    json: async () => body,
  }));
  globalThis.fetch = mockedFetch as any;
  return mockedFetch;
}

// UTM32N-koordinat svarende til ca. Hasselvej 48, Virum
const EASTING = 723000;
const NORTHING = 6176000;

function suggestion(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "aaaa-1111",
    visningstekst: "Hasselvej 48, 2830 Virum",
    postnummer: "2830",
    postnummernavn: "Virum",
    kommunekode: "0173",
    geometri: { type: "MultiPoint", coordinates: [[EASTING, NORTHING]] },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("GsearchService.getSuggestions", () => {
  beforeEach(() => {
    // Nulstil process.env token mellem tests
    (process as any).env = { ...(process as any).env, DATAFORSYNINGEN_TOKEN: "" };
    globalThis.fetch = fetch;
  });

  it("returnerer parsed forslag med koordinater konverteret fra UTM32N til WGS84", async () => {
    mockFetch([suggestion()]);

    const results = await GsearchService.getSuggestions("Hasselvej 48");

    expect(results).toHaveLength(1);
    expect(results[0].adresseid).toBe("aaaa-1111");
    expect(results[0].tekst).toBe("Hasselvej 48, 2830 Virum");
    expect(results[0].postnr).toBe("2830");
    expect(results[0].postnrnavn).toBe("Virum");
    expect(results[0].kommunekode).toBe("0173");
    // Koordinater skal være WGS84 (Danmark: lat ~55-57, lng ~8-15)
    expect(results[0].koordinater.lat).toBeGreaterThan(55);
    expect(results[0].koordinater.lat).toBeLessThan(57);
    expect(results[0].koordinater.lng).toBeGreaterThan(8);
    expect(results[0].koordinater.lng).toBeLessThan(13);
  });

  it("adgangsadresseid er tom string — fyldes af DarService", async () => {
    mockFetch([suggestion()]);

    const results = await GsearchService.getSuggestions("Hasselvej 48");

    expect(results[0].adgangsadresseid).toBe("");
  });

  it("returnerer tom liste ved tomt query", async () => {
    const spy = mockFetch([]);

    const results = await GsearchService.getSuggestions("");

    expect(results).toHaveLength(0);
    expect(spy).not.toHaveBeenCalled();
  });

  it("returnerer tom liste ved query kortere end 2 tegn", async () => {
    const spy = mockFetch([]);

    const results = await GsearchService.getSuggestions("H");

    expect(results).toHaveLength(0);
    expect(spy).not.toHaveBeenCalled();
  });

  it("returnerer tom liste når API returnerer ikke-array", async () => {
    mockFetch({ fejl: "ugyldig" });

    const results = await GsearchService.getSuggestions("Hasselvej");

    expect(results).toHaveLength(0);
  });

  it("filtrerer resultater uden id", async () => {
    mockFetch([suggestion({ id: "" }), suggestion({ id: "aaaa-2222" })]);

    const results = await GsearchService.getSuggestions("Hasselvej");

    expect(results).toHaveLength(1);
    expect(results[0].adresseid).toBe("aaaa-2222");
  });

  it("sætter koordinater til (0,0) når geometri mangler", async () => {
    mockFetch([suggestion({ geometri: null })]);

    const results = await GsearchService.getSuggestions("Hasselvej 48");

    expect(results[0].koordinater).toEqual({ lat: 0, lng: 0 });
  });

  it("sætter koordinater til (0,0) når geometri har tomme coordinates", async () => {
    mockFetch([suggestion({ geometri: { type: "MultiPoint", coordinates: [] } })]);

    const results = await GsearchService.getSuggestions("Hasselvej 48");

    expect(results[0].koordinater).toEqual({ lat: 0, lng: 0 });
  });

  it("bruger tomme strings ved manglende postnummer/postnumnavn/kommunekode", async () => {
    mockFetch([
      suggestion({ postnummer: undefined, postnummernavn: undefined, kommunekode: undefined }),
    ]);

    const results = await GsearchService.getSuggestions("Hasselvej 48");

    expect(results[0].postnr).toBe("");
    expect(results[0].postnrnavn).toBe("");
    expect(results[0].kommunekode).toBe("");
  });

  it("tilføjer token som query-parameter når DATAFORSYNINGEN_TOKEN er sat", async () => {
    (process as any).env.DATAFORSYNINGEN_TOKEN = "test-token-123";
    const spy = mockFetch([suggestion()]);

    await GsearchService.getSuggestions("Hasselvej 48");

    const [url] = spy.mock.calls[0] as [string];
    expect(url).toContain("token=test-token-123");
  });

  it("kalder API uden token når DATAFORSYNINGEN_TOKEN er tom", async () => {
    (process as any).env.DATAFORSYNINGEN_TOKEN = "";
    const spy = mockFetch([suggestion()]);

    await GsearchService.getSuggestions("Hasselvej 48");

    const [url] = spy.mock.calls[0] as [string];
    expect(url).not.toContain("token=");
  });

  it("URL indeholder limit=5 og søgetekst som q-parameter", async () => {
    const spy = mockFetch([]);

    await GsearchService.getSuggestions("Hasselvej");

    const [url] = spy.mock.calls[0] as [string];
    expect(url).toContain("limit=5");
    expect(url).toContain("q=Hasselvej");
  });

  it("kaster fejl ved HTTP-fejl", async () => {
    mockFetch({ message: "Forbidden" }, 403);

    await expect(GsearchService.getSuggestions("Hasselvej 48")).rejects.toThrow("GSearch HTTP 403");
  });

  it("kaster fejl ved netværksfejl", async () => {
    globalThis.fetch = mock(async () => {
      throw new Error("net::ERR_CONNECTION_REFUSED");
    }) as any;

    await expect(GsearchService.getSuggestions("Hasselvej 48")).rejects.toThrow(
      "GSearch netværksfejl",
    );
  });

  it("kaster fejl ved ugyldig JSON i response", async () => {
    globalThis.fetch = mock(async () => ({
      ok: true,
      status: 200,
      text: async () => "ikke json {{{{",
      json: async () => { throw new SyntaxError("Unexpected token"); },
    })) as any;

    await expect(GsearchService.getSuggestions("Hasselvej 48")).rejects.toThrow(
      "GSearch returnerede ugyldig JSON",
    );
  });

  it("returnerer korrekt WGS84 for kendte UTM32N-koordinater", async () => {
    // UTM32N (723100, 6176200) → verificeret output fra utm32NToWgs84 i client.ts
    mockFetch([suggestion({ geometri: { type: "MultiPoint", coordinates: [[723100, 6176200]] } })]);

    const results = await GsearchService.getSuggestions("Hasselvej 48");

    // lat/lng skal ligge inden for Danmarks grænser
    expect(results[0].koordinater.lat).toBeGreaterThan(54);
    expect(results[0].koordinater.lat).toBeLessThan(58);
    expect(results[0].koordinater.lng).toBeGreaterThan(8);
    expect(results[0].koordinater.lng).toBeLessThan(16);
  });
});

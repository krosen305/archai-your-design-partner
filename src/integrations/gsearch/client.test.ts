import { beforeEach, describe, expect, it, mock } from "bun:test";
import { GsearchService } from "./client";
import { installSequentialJsonFetch, resetMockedFetch } from "@/testing/fetch-mocks";

type MockJson = Record<string, unknown> | unknown[];

function mockFetch(body: MockJson, status = 200) {
  return installSequentialJsonFetch([body], { status });
}

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

describe("GsearchService.getSuggestions", () => {
  beforeEach(() => {
    delete process.env.DATAFORSYNINGEN_TOKEN;
    delete process.env.DATAFORSYNINGEN_GSEARCH_ENDPOINT;
    delete process.env.DATAFORSYNINGEN_GSEARCH_LIMIT;
    mock.restore();
    resetMockedFetch();
  });

  it("returns parsed suggestions with converted coordinates", async () => {
    mockFetch([suggestion()]);

    const results = await GsearchService.getSuggestions("Hasselvej 48");

    expect(results).toHaveLength(1);
    expect(results[0].adresseid).toBe("aaaa-1111");
    expect(results[0].koordinater).not.toBeNull();
    expect(results[0].koordinater!.lat).toBeGreaterThan(55);
    expect(results[0].koordinater!.lat).toBeLessThan(57);
    expect(results[0].koordinater!.lng).toBeGreaterThan(8);
    expect(results[0].koordinater!.lng).toBeLessThan(13);
  });

  it("returns null coordinates when geometry is missing", async () => {
    mockFetch([suggestion({ geometri: null })]);
    const results = await GsearchService.getSuggestions("Hasselvej 48");
    expect(results[0].koordinater).toBeNull();
  });

  it("returns null coordinates when coordinates array is empty", async () => {
    mockFetch([suggestion({ geometri: { type: "MultiPoint", coordinates: [] } })]);
    const results = await GsearchService.getSuggestions("Hasselvej 48");
    expect(results[0].koordinater).toBeNull();
  });

  it("returns empty list for malformed response payload", async () => {
    mockFetch({ invalid: true });
    const results = await GsearchService.getSuggestions("Hasselvej");
    expect(results).toEqual([]);
  });

  it("adds token query param when DATAFORSYNINGEN_TOKEN is set", async () => {
    const spy = mockFetch([suggestion()]);

    await GsearchService.getSuggestions("Hasselvej 48", "test-token-123");

    const [url] = spy.mock.calls[0] as [string];
    expect(url).toContain("token=test-token-123");
  });
});

import { beforeEach, describe, expect, it, mock } from "bun:test";
import { NaturbeskyttelseService } from "./naturbeskyttelse";

// Hjælpefunktioner til at bygge mock-responses
function geoServerJson(totalFeatures: number): Response {
  return {
    ok: true,
    status: 200,
    json: async () => ({ totalFeatures, features: [] }),
  } as unknown as Response;
}

function matWfsGml(numberMatched: number): Response {
  const body = `<?xml version="1.0"?><wfs:FeatureCollection numberMatched="${numberMatched}" numberReturned="0"/>`;
  return {
    ok: true,
    status: 200,
    text: async () => body,
  } as unknown as Response;
}

function errorResponse(status = 500): Response {
  return { ok: false, status } as unknown as Response;
}

// Rækkefølgen af fetch-kald matcher LAYERS-arrayet i naturbeskyttelse.ts:
// [0] soe_bes_linjer    → GeoServer JSON
// [1] aa_bes_linjer     → GeoServer JSON
// [2] skovbyggelinjer   → GeoServer JSON
// [3] kirkebyggelinjer  → GeoServer JSON
// [4] StrandbeskyttelseFlade_Gaeldende → MAT WFS GML
// [5] KlitfredningFlade_Gaeldende      → MAT WFS GML

describe("NaturbeskyttelseService.getTilstand", () => {
  beforeEach(() => {
    process.env["DATAFORDELER_API_KEY"] = "test-key";
    globalThis.fetch = fetch;
  });

  it("returnerer status=ok med confirmed confidence når alle 6 lag lykkes", async () => {
    let call = 0;
    globalThis.fetch = mock(async () => {
      const responses = [
        geoServerJson(0), // soe
        geoServerJson(0), // aa
        geoServerJson(1), // skov — hit
        geoServerJson(0), // kirke
        matWfsGml(1),     // strand — hit
        matWfsGml(0),     // klit
      ];
      return responses[call++]!;
    }) as unknown as typeof fetch;

    const result = await NaturbeskyttelseService.getTilstand({ lat: 55.7, lng: 12.5 });

    expect(result.status).toBe("ok");
    expect(result.confidence).toBe("confirmed");
    expect(result.data?.skovbyggelinje).toBe(true);
    expect(result.data?.strandbeskyttelse).toBe(true);
    expect(result.data?.soebeskyttelse).toBe(false);
    expect(result.data?.kirkebyggelinje).toBe(false);
    expect(result.data?.klitfredning).toBe(false);
  });

  it("returnerer kirkebyggelinje=true når GeoServer returnerer features", async () => {
    let call = 0;
    globalThis.fetch = mock(async () => {
      const isMatLayer = call >= 4;
      const n = call === 3 ? 1 : 0; // kirkebyggelinjer er lag [3]
      call++;
      return isMatLayer ? matWfsGml(n) : geoServerJson(n);
    }) as unknown as typeof fetch;

    const result = await NaturbeskyttelseService.getTilstand({ lat: 55.7, lng: 12.5 });

    expect(result.status).toBe("ok");
    expect(result.data?.kirkebyggelinje).toBe(true);
  });

  it("returnerer status=error med all_layers_failed når alle lag fejler", async () => {
    globalThis.fetch = mock(async () => errorResponse(503)) as unknown as typeof fetch;

    const result = await NaturbeskyttelseService.getTilstand({ lat: 55.7, lng: 12.5 });

    expect(result.status).toBe("error");
    expect(result.confidence).toBe("unknown");
    expect(result.data).toBeNull();
  });

  it("returnerer ok med confidence=unknown når nogen lag fejler men andre lykkes", async () => {
    let call = 0;
    globalThis.fetch = mock(async () => {
      if (call++ === 0) return errorResponse(500);
      const isMatLayer = call > 4;
      return isMatLayer ? matWfsGml(0) : geoServerJson(0);
    }) as unknown as typeof fetch;

    const result = await NaturbeskyttelseService.getTilstand({ lat: 55.7, lng: 12.5 });

    expect(result.status).toBe("ok");
    expect(result.confidence).toBe("unknown");
    expect(result.data?.soebeskyttelse).toBe(false);
  });

  it("parser MAT WFS GML numberMatched korrekt for strandbeskyttelse og klitfredning", async () => {
    let call = 0;
    globalThis.fetch = mock(async () => {
      const isMatLayer = call >= 4;
      const n = isMatLayer ? 2 : 0;
      call++;
      return isMatLayer ? matWfsGml(n) : geoServerJson(n);
    }) as unknown as typeof fetch;

    const result = await NaturbeskyttelseService.getTilstand({ lat: 56.0, lng: 8.5 });

    expect(result.status).toBe("ok");
    expect(result.data?.strandbeskyttelse).toBe(true);
    expect(result.data?.klitfredning).toBe(true);
  });
});

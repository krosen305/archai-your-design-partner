/**
 * Tests for BbrService (GraphQL-version)
 * Kør med: bun test
 */
import { describe, it, expect, mock, beforeEach } from "bun:test";
import { BbrService, deriveBbrSummary } from "./client";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const MOCK_CONFIG = {
  apiKey: "test-api-key",
  endpoint: "https://graphql.datafordeler.dk/BBR/v1",
};

type MockResponse = {
  ok?: boolean;
  status?: number;
  statusText?: string;
  json: any;
};

function mockFetch(responses: MockResponse[]) {
  let callCount = 0;
  const mockedFetch = mock(async (_url: any, _init?: any) => {
    const r = responses[callCount++] ?? { json: { data: {} } };
    return {
      ok: r.ok ?? true,
      status: r.status ?? 200,
      statusText: r.statusText ?? "OK",
      headers: { get: (_name: string) => null },
      json: async () => r.json,
      text: async () => JSON.stringify(r.json),
    } as unknown as Response;
  });
  globalThis.fetch = mockedFetch as any;
  return mockedFetch;
}

const MOCK_BYGNING = {
  byg026Opfoerelsesaar: 1992,
  byg021BygningensAnvendelse: "120",
  byg032YdervaeggensMateriale: "1",
  byg033Tagdaekningsmateriale: "1",
  byg038SamletBygningsareal: 185,
  byg041BebyggetAreal: 120,
  byg054AntalEtager: 1,
  byg056Varmeinstallation: "1",
  byg057Opvarmningsmiddel: "8",
  byg070Fredning: null,
};

// Grundareal sendes nu udefra (fra MAT) – ikke fra BBR_Grund.
// Testene bruger grundareal=1000 direkte som parameter hvor relevant.
const GRUNDAREAL = 1000;

const okResponse = (bygning: any[]) => ({
  json: { data: { BBR_Bygning: { nodes: bygning } } },
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("BbrService.getKompliantData (GraphQL)", () => {
  beforeEach(() => {
    globalThis.fetch = fetch;
  });

  it("sender POST med apiKey som query-param og uden Authorization-header", async () => {
    const fetchSpy = mockFetch([okResponse([MOCK_BYGNING])]);

    await BbrService.getKompliantData("0a3f50a0-4660-32b8-e044-0003ba298018", null, MOCK_CONFIG);

    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://graphql.datafordeler.dk/BBR/v1?apiKey=test-api-key");
    expect(init.method).toBe("POST");

    const headers = init.headers as Record<string, string>;
    expect(headers["Content-Type"]).toBe("application/json");
    // Datafordeler afviser med DAF-AUTH-0002 hvis vi sender BÅDE
    // query-param og Authorization-header.
    expect(headers["Authorization"]).toBeUndefined();

    const body = JSON.parse(init.body as string);
    expect(body.variables.id).toBe("0a3f50a0-4660-32b8-e044-0003ba298018");
    expect(body.variables.virkningstid).toBeString();
    expect(body.variables.registreringstid).toBe(body.variables.virkningstid);
    expect(body.query).toContain("BBR_Bygning");
    expect(body.query).toContain("registreringstid");
  });

  it("beregner bebyggelsesprocent: 120m² / 1000m² = 12.0%", async () => {
    mockFetch([okResponse([MOCK_BYGNING])]);

    const result = await BbrService.getKompliantData("test-id", GRUNDAREAL, MOCK_CONFIG);

    expect(result.bebygget_areal).toBe(120);
    expect(result.grundareal).toBe(1000);
    expect(result.bebyggelsesprocent).toBe(12.0);
    expect(result.beregning_mulig).toBe(true);
    expect(result.fejl).toBeNull();
  });

  it("beregner bebyggelsesprocent: 220m² / 1000m² = 22.0%", async () => {
    mockFetch([okResponse([{ ...MOCK_BYGNING, byg041BebyggetAreal: 220 }])]);

    const result = await BbrService.getKompliantData("test-id", GRUNDAREAL, MOCK_CONFIG);
    expect(result.bebyggelsesprocent).toBe(22.0);
  });

  it("oversætter anvendelseskode 120 til tekst", async () => {
    mockFetch([okResponse([MOCK_BYGNING])]);

    const result = await BbrService.getKompliantData("test-id", null, MOCK_CONFIG);
    expect(result.anvendelse_tekst).toBe("Fritliggende enfamilieshus");
  });

  it("vælger boligbygning frem for garage (anvendelseskode 910)", async () => {
    const garage = { ...MOCK_BYGNING, byg021BygningensAnvendelse: "910" };
    mockFetch([okResponse([garage, MOCK_BYGNING])]);

    const result = await BbrService.getKompliantData("test-id", null, MOCK_CONFIG);
    expect(result.anvendelse_tekst).toBe("Fritliggende enfamilieshus");
  });

  it("returnerer beregning_mulig: false ved tomt bygningsarray", async () => {
    mockFetch([okResponse([])]);

    const result = await BbrService.getKompliantData("test-id", null, MOCK_CONFIG);
    expect(result.beregning_mulig).toBe(false);
    expect(result.fejl).toBe("Ingen bygning fundet på adressen");
    expect(result.bebyggelsesprocent).toBeNull();
  });

  it("returnerer beregning_mulig: false når grundareal er null", async () => {
    mockFetch([okResponse([MOCK_BYGNING])]);

    // grundareal=null simulerer at MAT-opslaget fejlede eller data mangler
    const result = await BbrService.getKompliantData("test-id", null, MOCK_CONFIG);
    expect(result.bebygget_areal).toBe(120);
    expect(result.grundareal).toBeNull();
    expect(result.beregning_mulig).toBe(false);
    expect(result.fejl).toContain("Grundareal ikke tilgængeligt");
  });

  it("propagerer GraphQL errors-array som fejl", async () => {
    mockFetch([
      {
        json: {
          errors: [{ message: 'Field "bygning" not found' }],
        },
      },
    ]);

    const result = await BbrService.getKompliantData("test-id", null, MOCK_CONFIG);
    expect(result.beregning_mulig).toBe(false);
    expect(result.fejl).toContain('Field "bygning" not found');
  });

  it("returnerer fejl ved 401 fra Datafordeler", async () => {
    mockFetch([
      {
        ok: false,
        status: 401,
        statusText: "Unauthorized",
        json: { error: "invalid api key" },
      },
    ]);

    const result = await BbrService.getKompliantData("test-id", null, MOCK_CONFIG);
    expect(result.beregning_mulig).toBe(false);
    expect(result.fejl).toContain("401");
  });

  it("returnerer fejl ved tomt adgangsadresseid", async () => {
    const result = await BbrService.getKompliantData("", null, MOCK_CONFIG);
    expect(result.beregning_mulig).toBe(false);
    expect(result.fejl).toContain("adgangsadresseid er påkrævet");
  });

  it("kaster fejl hvis API-nøgle mangler", async () => {
    // getConfig() kaster *før* try/catch i getKompliantData, så det
    // propagerer som rejected promise.
    await expect(
      BbrService.getKompliantData("test-id", null, { apiKey: "", endpoint: "x" }),
    ).rejects.toThrow("DATAFORDELER_API_KEY");
  });

  it("dekoder varmeinstallation kode 1 → Fjernvarme/blokvarme", async () => {
    mockFetch([okResponse([MOCK_BYGNING])]);
    const result = await BbrService.getKompliantData("test-id", null, MOCK_CONFIG);
    expect(result.varmeinstallation).toBe("Fjernvarme/blokvarme");
  });

  it("dekoder opvarmningsmiddel kode 8 → Fjernvarme", async () => {
    mockFetch([okResponse([MOCK_BYGNING])]);
    const result = await BbrService.getKompliantData("test-id", null, MOCK_CONFIG);
    expect(result.opvarmningsmiddel).toBe("Fjernvarme");
  });

  it("dekoder ydervaegs_materiale kode 1 → Mursten/tegl", async () => {
    mockFetch([okResponse([MOCK_BYGNING])]);
    const result = await BbrService.getKompliantData("test-id", null, MOCK_CONFIG);
    expect(result.ydervaegs_materiale).toBe("Mursten/tegl");
  });

  it("dekoder tagdaekning kode 1 → Tagsten (tegl/beton)", async () => {
    mockFetch([okResponse([MOCK_BYGNING])]);
    const result = await BbrService.getKompliantData("test-id", null, MOCK_CONFIG);
    expect(result.tagdaekning).toBe("Tagsten (tegl/beton)");
  });

  it("fredet = null når byg070Fredning er null", async () => {
    mockFetch([okResponse([MOCK_BYGNING])]);
    const result = await BbrService.getKompliantData("test-id", null, MOCK_CONFIG);
    expect(result.fredet).toBeNull();
  });

  it("fredet = true ved ikke-null byg070Fredning", async () => {
    mockFetch([okResponse([{ ...MOCK_BYGNING, byg070Fredning: "F" }])]);
    const result = await BbrService.getKompliantData("test-id", null, MOCK_CONFIG);
    expect(result.fredet).toBe(true);
  });

  it("mat-beskyttelsesfelter er null som standard (sættes af orchestrator)", async () => {
    mockFetch([okResponse([MOCK_BYGNING])]);
    const result = await BbrService.getKompliantData("test-id", null, MOCK_CONFIG);
    expect(result.mat_strandbeskyttelse).toBeNull();
    expect(result.mat_fredskov).toBeNull();
    expect(result.mat_klitfredning).toBeNull();
  });
  it("genbruger BBR UUIDer som FBB-opslags-IDer", async () => {
    mockFetch([
      okResponse([
        { ...MOCK_BYGNING, id_lokalId: "uuid-1" },
        { ...MOCK_BYGNING, id_lokalId: "uuid-2", byg021BygningensAnvendelse: "910" },
      ]),
    ]);

    const result = await BbrService.getKompliantData("test-id", null, MOCK_CONFIG);
    expect(result.alle_bygning_lokal_ids).toEqual(["uuid-1", "uuid-2"]);
    expect(result.alle_bbr_public_ids).toEqual(["uuid-1", "uuid-2"]);
  });
});

// ---------------------------------------------------------------------------
// deriveBbrSummary — ARCH-227
// ---------------------------------------------------------------------------

describe("deriveBbrSummary (ARCH-227)", () => {
  it("bebygget_areal summerer ikke-sekundære bygninger", () => {
    const bygninger = [
      { ...MOCK_BYGNING, byg021BygningensAnvendelse: "120", byg041BebyggetAreal: 120 },
      { ...MOCK_BYGNING, byg021BygningensAnvendelse: "120", byg041BebyggetAreal: 40 },
    ];
    const { bebygget_areal } = deriveBbrSummary(bygninger);
    expect(bebygget_areal).toBe(160);
  });

  it("garage (910) er ekskluderet fra bebygget_areal", () => {
    const bygninger = [
      { ...MOCK_BYGNING, byg021BygningensAnvendelse: "120", byg041BebyggetAreal: 120 },
      { ...MOCK_BYGNING, byg021BygningensAnvendelse: "910", byg041BebyggetAreal: 30 },
    ];
    const { bebygget_areal } = deriveBbrSummary(bygninger);
    expect(bebygget_areal).toBe(120);
  });

  it("primærBygning er første ikke-sekundære uanset rækkefølge i array", () => {
    const garage = { ...MOCK_BYGNING, byg021BygningensAnvendelse: "910", byg026Opfoerelsesaar: 2000 };
    const bolig = { ...MOCK_BYGNING, byg021BygningensAnvendelse: "120", byg026Opfoerelsesaar: 1992 };
    const { primærBygning } = deriveBbrSummary([garage, bolig]);
    expect(primærBygning.byg021BygningensAnvendelse).toBe("120");
  });

  it("fredet = true hvis én bygning har byg070Fredning='F'", () => {
    const bygninger = [
      { ...MOCK_BYGNING, byg070Fredning: null },
      { ...MOCK_BYGNING, byg070Fredning: "F" },
    ];
    expect(deriveBbrSummary(bygninger).fredet).toBe(true);
  });

  it("fredet = false hvis alle bygninger har byg070Fredning='0'", () => {
    const bygninger = [
      { ...MOCK_BYGNING, byg070Fredning: "0" },
      { ...MOCK_BYGNING, byg070Fredning: "0" },
    ];
    expect(deriveBbrSummary(bygninger).fredet).toBe(false);
  });

  it("fredet = null hvis ingen bygninger har byg070Fredning sat (kun null)", () => {
    expect(deriveBbrSummary([{ ...MOCK_BYGNING, byg070Fredning: null }]).fredet).toBeNull();
  });

  it("historisk dublet påvirker ikke bebygget_areal (node-order-uafhængig)", () => {
    const b1 = { ...MOCK_BYGNING, byg021BygningensAnvendelse: "120", byg041BebyggetAreal: 120, id_lokalId: "uuid-1" };
    const b2 = { ...MOCK_BYGNING, byg021BygningensAnvendelse: "120", byg041BebyggetAreal: 120, id_lokalId: "uuid-1" }; // dublet
    const { bebygget_areal } = deriveBbrSummary([b1, b2]);
    // Duplikater deduplikeres — kun én tæller
    expect(bebygget_areal).toBe(120);
  });
});

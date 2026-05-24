/**
 * Tests for BbrService (GraphQL-version)
 * Kør med: bun test
 */
import { describe, it, expect, mock, beforeEach } from "bun:test";
import { BbrService, deriveBbrSummary, selectCanonicalBuilding } from "./client";
import { installSequentialJsonFetch, resetMockedFetch } from "@/testing/fetch-mocks";

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
  return installSequentialJsonFetch(
    responses.map((r) => r.json),
    { status: responses[0]?.status ?? 200 },
  );
}

const MOCK_BYGNING: import("./client").BbrBygning = {
  id_lokalId: null,
  byg007Bygningsnummer: null,
  byg021BygningensAnvendelse: "120",
  byg024AntalLejlighederMedKoekken: null,
  byg025AntalLejlighederUdenKoekken: null,
  byg026Opfoerelsesaar: 1992,
  byg027OmTilbygningsaar: null,
  byg029DatoForMidlertidigOpfoertBygning: null,
  byg032YdervaeggensMateriale: "1",
  byg033Tagdaekningsmateriale: "1",
  byg038SamletBygningsareal: 185,
  byg039BygningensSamledeBoligAreal: null,
  byg040BygningensSamledeErhvervsAreal: null,
  byg041BebyggetAreal: 120,
  byg054AntalEtager: 1,
  byg055AfvigendeEtager: null,
  byg056Varmeinstallation: "1",
  byg057Opvarmningsmiddel: "8",
  byg070Fredning: null,
  byg071BevaringsvaerdighedReference: null,
  byg094Revisionsdato: null,
  status: null,
  registreringFra: null,
  registreringTil: null,
  virkningFra: null,
  virkningTil: null,
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
    mock.restore();
    resetMockedFetch();
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

  it("beregner bebyggelsesprocent: byg038=185m² / 1000m² = 18.5% (samlet etageareal, ikke footprint)", async () => {
    mockFetch([okResponse([MOCK_BYGNING])]);

    const result = await BbrService.getKompliantData("test-id", GRUNDAREAL, MOCK_CONFIG);

    expect(result.bebygget_areal).toBe(120);   // footprint uændret
    expect(result.grundareal).toBe(1000);
    expect(result.bebyggelsesprocent).toBe(18.5); // byg038=185 / 1000 × 100
    expect(result.beregning_mulig).toBe(true);
    expect(result.fejl).toBeNull();
  });

  it("beregner bebyggelsesprocent: byg038=300m² / 1000m² = 30.0%", async () => {
    mockFetch([okResponse([{ ...MOCK_BYGNING, byg038SamletBygningsareal: 300 }])]);

    const result = await BbrService.getKompliantData("test-id", GRUNDAREAL, MOCK_CONFIG);
    expect(result.bebyggelsesprocent).toBe(30.0);
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

  it("returnerer fejl ved malformed BBR payload", async () => {
    mockFetch([{ json: { data: { BBR_Bygning: { nodes: [{ id_lokalId: "abc" }] } } } }]);
    const result = await BbrService.getKompliantData("test-id", null, MOCK_CONFIG);
    expect(result.beregning_mulig).toBe(false);
    expect(result.fejl).toContain("Ugyldigt BBR GraphQL-response payload");
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
  it("returnerer BBR UUIDer som FBB-opslags-IDer", async () => {
    mockFetch([
      okResponse([
        { ...MOCK_BYGNING, id_lokalId: "uuid-1" },
        { ...MOCK_BYGNING, id_lokalId: "uuid-2", byg021BygningensAnvendelse: "910" },
      ]),
    ]);

    const result = await BbrService.getKompliantData("test-id", null, MOCK_CONFIG);
    expect(result.alle_bygning_lokal_ids).toEqual(["uuid-1", "uuid-2"]);
  });

  it("Byledet 3: canonical er 2022-bygning, bebygget_areal=140, samlet_areal=271, aggregated=250", async () => {
    const gammel = {
      ...MOCK_BYGNING,
      id_lokalId: "762da78b-4c8d-4b8f-9f95-cd0b35bb83ed",
      byg021BygningensAnvendelse: "120",
      byg026Opfoerelsesaar: 1930,
      byg038SamletBygningsareal: 110,
      byg039BygningensSamledeBoligAreal: null,
      byg041BebyggetAreal: 110,
      byg054AntalEtager: 1,
    };
    const nyt = {
      ...MOCK_BYGNING,
      id_lokalId: "d175cf92-85eb-4b5b-aacf-d74ad658c1f7",
      byg021BygningensAnvendelse: "120",
      byg026Opfoerelsesaar: 2022,
      byg038SamletBygningsareal: 271,
      byg039BygningensSamledeBoligAreal: 271,
      byg041BebyggetAreal: 140,
      byg054AntalEtager: 2,
    };
    mockFetch([okResponse([gammel, nyt])]);

    const result = await BbrService.getKompliantData(
      "0a3f507b-d32a-32b8-e044-0003ba298018",
      1086,
      MOCK_CONFIG,
    );

    expect(result.canonical_building_lokal_id).toBe("d175cf92-85eb-4b5b-aacf-d74ad658c1f7");
    expect(result.bebygget_areal).toBe(140);
    expect(result.samlet_areal).toBe(271); // byg039BygningensSamledeBoligAreal
    expect(result.antal_etager).toBe(2);
    expect(result.aggregated_bebygget_areal_all_primary).toBe(250); // 110 + 140
    expect(result.grundareal).toBe(1086); // unchanged
  });
});

// ---------------------------------------------------------------------------
// deriveBbrSummary — ARCH-227
// ---------------------------------------------------------------------------

describe("deriveBbrSummary (ARCH-227)", () => {
  it("bebygget_areal er canonical buildings footprint, ikke summen af alle", () => {
    const bygninger = [
      {
        ...MOCK_BYGNING,
        id_lokalId: "uuid-a",
        byg021BygningensAnvendelse: "120",
        byg041BebyggetAreal: 120,
        byg026Opfoerelsesaar: 1992,
      },
      {
        ...MOCK_BYGNING,
        id_lokalId: "uuid-b",
        byg021BygningensAnvendelse: "120",
        byg041BebyggetAreal: 40,
        byg026Opfoerelsesaar: 1990,
      },
    ];
    const { bebygget_areal, aggregated_bebygget_areal_all_primary } = deriveBbrSummary(bygninger);
    expect(bebygget_areal).toBe(120); // canonical (newer, higher footprint)
    expect(aggregated_bebygget_areal_all_primary).toBe(160); // 120 + 40
  });

  it("garage (910) er ekskluderet fra bebygget_areal", () => {
    const bygninger = [
      { ...MOCK_BYGNING, byg021BygningensAnvendelse: "120", byg041BebyggetAreal: 120 },
      { ...MOCK_BYGNING, byg021BygningensAnvendelse: "910", byg041BebyggetAreal: 30 },
    ];
    const { bebygget_areal } = deriveBbrSummary(bygninger);
    expect(bebygget_areal).toBe(120);
  });

  it("canonicalBuilding er ikke-sekundær uanset rækkefølge i array", () => {
    const garage = {
      ...MOCK_BYGNING,
      id_lokalId: "uuid-g",
      byg021BygningensAnvendelse: "910",
      byg026Opfoerelsesaar: 2000,
    };
    const bolig = {
      ...MOCK_BYGNING,
      id_lokalId: "uuid-b",
      byg021BygningensAnvendelse: "120",
      byg026Opfoerelsesaar: 1992,
    };
    const { canonicalBuilding } = deriveBbrSummary([garage, bolig]);
    expect(canonicalBuilding!.byg021BygningensAnvendelse).toBe("120");
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
    const b1 = {
      ...MOCK_BYGNING,
      byg021BygningensAnvendelse: "120",
      byg041BebyggetAreal: 120,
      id_lokalId: "uuid-1",
    };
    const b2 = {
      ...MOCK_BYGNING,
      byg021BygningensAnvendelse: "120",
      byg041BebyggetAreal: 120,
      id_lokalId: "uuid-1",
    }; // dublet
    const { bebygget_areal } = deriveBbrSummary([b1, b2]);
    // Duplikater deduplikeres — kun én tæller
    expect(bebygget_areal).toBe(120);
  });
});

// ---------------------------------------------------------------------------
// selectCanonicalBuilding — ARCH-task (Byledet 3 fix)
// ---------------------------------------------------------------------------

const BYLEDET_GAMMEL: import("./client").BbrBygning = {
  ...MOCK_BYGNING,
  id_lokalId: "762da78b-4c8d-4b8f-9f95-cd0b35bb83ed",
  byg021BygningensAnvendelse: "120",
  byg026Opfoerelsesaar: 1930,
  byg038SamletBygningsareal: 110,
  byg041BebyggetAreal: 110,
  byg054AntalEtager: 1,
};

const BYLEDET_NYT: import("./client").BbrBygning = {
  ...MOCK_BYGNING,
  id_lokalId: "d175cf92-85eb-4b5b-aacf-d74ad658c1f7",
  byg021BygningensAnvendelse: "120",
  byg026Opfoerelsesaar: 2022,
  byg038SamletBygningsareal: 271,
  byg039BygningensSamledeBoligAreal: 271,
  byg041BebyggetAreal: 140,
  byg054AntalEtager: 2,
};

describe("selectCanonicalBuilding", () => {
  it("returnerer null ved tomt array", () => {
    expect(selectCanonicalBuilding([]).canonical).toBeNull();
  });

  it("returnerer den eneste kandidat direkte", () => {
    const { canonical, reason } = selectCanonicalBuilding([MOCK_BYGNING]);
    expect(canonical).toBe(MOCK_BYGNING);
    expect(reason).toBe("only_candidate");
  });

  it("Byledet 3: vælger 2022-bygning frem for 1930-bygning via opfoerelsesaar tie-break", () => {
    const { canonical } = selectCanonicalBuilding([BYLEDET_GAMMEL, BYLEDET_NYT]);
    expect(canonical!.id_lokalId).toBe("d175cf92-85eb-4b5b-aacf-d74ad658c1f7");
  });

  it("Byledet 3: rækkefølge i input-array betyder ikke noget", () => {
    const { canonical } = selectCanonicalBuilding([BYLEDET_NYT, BYLEDET_GAMMEL]);
    expect(canonical!.id_lokalId).toBe("d175cf92-85eb-4b5b-aacf-d74ad658c1f7");
  });

  it("boligkode (120) slår ikke-klassificeret bygning (999)", () => {
    const ukendt = {
      ...MOCK_BYGNING,
      id_lokalId: "uuid-unknown",
      byg021BygningensAnvendelse: "999",
    };
    const bolig = { ...MOCK_BYGNING, id_lokalId: "uuid-bolig", byg021BygningensAnvendelse: "120" };
    const { canonical } = selectCanonicalBuilding([ukendt, bolig]);
    expect(canonical!.id_lokalId).toBe("uuid-bolig");
  });

  it("ekskluderer bygning med virkningTil i fortiden", () => {
    const udloebet = {
      ...MOCK_BYGNING,
      id_lokalId: "uuid-old",
      virkningTil: "2020-01-01T00:00:00.000Z",
    };
    const aktiv = { ...MOCK_BYGNING, id_lokalId: "uuid-active", virkningTil: null };
    const { canonical } = selectCanonicalBuilding([udloebet, aktiv]);
    expect(canonical!.id_lokalId).toBe("uuid-active");
  });

  it("ekskluderer bygning med registreringTil i fortiden", () => {
    const udloebet = {
      ...MOCK_BYGNING,
      id_lokalId: "uuid-old",
      registreringTil: "2019-06-01T00:00:00.000Z",
    };
    const aktiv = { ...MOCK_BYGNING, id_lokalId: "uuid-active", registreringTil: null };
    const { canonical } = selectCanonicalBuilding([udloebet, aktiv]);
    expect(canonical!.id_lokalId).toBe("uuid-active");
  });

  it("ekskluderer midlertidigt opfoert bygning med udloebet dato", () => {
    const midlertidig = {
      ...MOCK_BYGNING,
      id_lokalId: "uuid-temp",
      byg029DatoForMidlertidigOpfoertBygning: "2021-01-01",
    };
    const permanent = {
      ...MOCK_BYGNING,
      id_lokalId: "uuid-perm",
      byg029DatoForMidlertidigOpfoertBygning: null,
    };
    const { canonical } = selectCanonicalBuilding([midlertidig, permanent]);
    expect(canonical!.id_lokalId).toBe("uuid-perm");
  });

  it("bygning med byg094Revisionsdato rangerer over bygning uden", () => {
    const udenRev = {
      ...MOCK_BYGNING,
      id_lokalId: "uuid-a",
      byg026Opfoerelsesaar: 2010,
      byg094Revisionsdato: null,
    };
    const medRev = {
      ...MOCK_BYGNING,
      id_lokalId: "uuid-b",
      byg026Opfoerelsesaar: 2000,
      byg094Revisionsdato: "2024-01-01",
    };
    const { canonical } = selectCanonicalBuilding([udenRev, medRev]);
    expect(canonical!.id_lokalId).toBe("uuid-b");
  });

  it("garage (910) frasorteres — boligbygning vinder", () => {
    const garage = {
      ...MOCK_BYGNING,
      id_lokalId: "uuid-garage",
      byg021BygningensAnvendelse: "910",
    };
    const bolig = { ...MOCK_BYGNING, id_lokalId: "uuid-bolig", byg021BygningensAnvendelse: "120" };
    const { canonical } = selectCanonicalBuilding([garage, bolig]);
    expect(canonical!.id_lokalId).toBe("uuid-bolig");
  });

  it("secondary-only: vælger bedste sekundære bygning når ingen primære findes", () => {
    const garage = {
      ...MOCK_BYGNING,
      id_lokalId: "uuid-garage",
      byg021BygningensAnvendelse: "910",
      byg041BebyggetAreal: 40,
      byg039BygningensSamledeBoligAreal: null,
    };
    const udhus = {
      ...MOCK_BYGNING,
      id_lokalId: "uuid-udhus",
      byg021BygningensAnvendelse: "930",
      byg041BebyggetAreal: 55,
      byg039BygningensSamledeBoligAreal: null,
      byg094Revisionsdato: "2025-01-01",
    };
    const { canonical } = selectCanonicalBuilding([garage, udhus]);
    expect(canonical!.id_lokalId).toBe("uuid-udhus");
  });

  it("manglende arealer: fallback til score uden area-felter", () => {
    const a = {
      ...MOCK_BYGNING,
      id_lokalId: "uuid-a",
      byg021BygningensAnvendelse: "120",
      byg038SamletBygningsareal: null,
      byg039BygningensSamledeBoligAreal: null,
      byg041BebyggetAreal: null,
      byg026Opfoerelsesaar: 2000,
      byg094Revisionsdato: null,
    };
    const b = {
      ...a,
      id_lokalId: "uuid-b",
      byg026Opfoerelsesaar: 2020,
    };
    const { canonical } = selectCanonicalBuilding([a, b]);
    expect(canonical!.id_lokalId).toBe("uuid-b");
  });
});

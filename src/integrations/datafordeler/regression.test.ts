/**
 * Datafordeler Regression Suite — ARCH-230
 *
 * Fixture-baserede regressionstest der forhindrer genindførelse af:
 *   - ARCH-221: manglende registreringstid i GraphQL-queries
 *   - ARCH-223: GrundarealResolver routing
 *   - ARCH-225: EBR dual-mode BFE
 *   - ARCH-227: BBR aggregering (sekundære bygninger, dubletter)
 *   - ARCH-228: Plandata deterministiske selektorer
 *   - ARCH-166: FBB via ois_id, ikke BBR Public/Dataforsyningen
 *
 * Kør: bun test src/integrations/datafordeler/regression.test.ts
 * Live smoke: RUN_LIVE_DATAFORDELER_SMOKE=true bun test src/integrations/datafordeler/regression.test.ts
 */
import { describe, it, expect, mock, beforeEach } from "bun:test";
import { DarService } from "@/integrations/dar/client";
import { deriveBbrSummary } from "@/integrations/bbr/client";
import { FbbService } from "@/integrations/fbb/client";
import { EbrService } from "@/integrations/ebr/client";
import { GrundarealResolver } from "@/integrations/mat/grundareal-resolver";
import {
  selectKommuneplanrammeForCompliance,
  selectPrimaryLokalplanForPdf,
} from "@/integrations/plandata/client";
import type { Kommuneplanramme, Lokalplan } from "@/integrations/plandata/client";

// ---------------------------------------------------------------------------
// Konfig til services der tager eksplicit config
// ---------------------------------------------------------------------------

const DAR_CONFIG = { apiKey: "test", endpoint: "https://graphql.datafordeler.dk/DAR/v1" };
const EBR_CONFIG = { apiKey: "test", endpoint: "https://graphql.datafordeler.dk/EBR/v1" };
const GR_CONFIG = {
  apiKey: "test",
  ebrEndpoint: "https://graphql.datafordeler.dk/EBR/v1",
  matEndpoint: "https://graphql.datafordeler.dk/MAT/v2",
};

// ---------------------------------------------------------------------------
// Mock-helper — returnerer spy så request bodies kan inspiceres
// ---------------------------------------------------------------------------

function mockFetch(responses: any[]) {
  let i = 0;
  const spy = mock(async (_url: unknown, _init?: unknown) => {
    const json = responses[i++] ?? { data: {} };
    return {
      ok: true,
      status: 200,
      headers: { get: () => "application/json" },
      text: async () => JSON.stringify(json),
      json: async () => json,
    } as unknown as Response;
  });
  globalThis.fetch = spy as any;
  return spy;
}

beforeEach(() => {
  globalThis.fetch = fetch;
});

// ---------------------------------------------------------------------------
// 1. Hasselvej 48, 2830 Virum
//    - DAR: registreringstid skal være i query (forhindrer historisk node-fejl)
//    - FBB: ois_id CQL bruges, ikke BBR Public/api.dataforsyningen.dk
//    - FBB: SAVE 3 vinder over bevaringsvaerdi=-1
// ---------------------------------------------------------------------------

const HASSELVEJ_ADRESSE_ID = "0a3f50a6-34da-32b8-e044-0003ba298018";
const HASSELVEJ_HUSNUMMER_ID = "0a3f507d-4cf9-32b8-e044-0003ba298018";

function hasselvejDarResponses() {
  return [
    // 1: DAR_Adresse
    {
      data: {
        DAR_Adresse: {
          nodes: [{
            id_lokalId: HASSELVEJ_ADRESSE_ID,
            adressebetegnelse: "Hasselvej 48, 2830 Virum",
            husnummer: HASSELVEJ_HUSNUMMER_ID,
            etagebetegnelse: null,
            doerbetegnelse: null,
            status: "Gældende",
          }],
        },
      },
    },
    // 2: DAR_Husnummer — gældende node med jordstykke sat
    {
      data: {
        DAR_Husnummer: {
          nodes: [{
            id_lokalId: HASSELVEJ_HUSNUMMER_ID,
            adgangsadressebetegnelse: "Hasselvej 48",
            husnummertekst: "48",
            adgangspunkt: "adgp-virum",
            postnummer: "pnr-2830",
            kommuneinddeling: "kom-lyngby",
            navngivenVej: "vej-hasselvej",
            jordstykke: "2468837",
            status: "Gældende",
          }],
        },
      },
    },
    // 3a: DAR_Postnummer (parallel)
    { data: { DAR_Postnummer: { nodes: [{ postnr: "2830", navn: "Virum" }] } } },
    // 3b: DAR_Adressepunkt (parallel)
    { data: { DAR_Adressepunkt: { nodes: [{ position: { wkt: "POINT(723000.00 6176000.00)" } }] } } },
    // 3c: MAT_Jordstykke (parallel)
    { data: { MAT_Jordstykke: { nodes: [{ matrikelnummer: "5fo", ejerlavLokalId: "12352", registreretAreal: 441 }] } } },
    // 4: MAT_Ejerlav
    { data: { MAT_Ejerlav: { nodes: [{ ejerlavskode: 12352, ejerlavsnavn: "Virum By, Virum" }] } } },
  ];
}

describe("Regression: Hasselvej 48, 2830 Virum", () => {
  it("DAR: registreringstid er inkluderet i DAR_Husnummer-query (ARCH-221)", async () => {
    const spy = mockFetch(hasselvejDarResponses());
    await DarService.getAddressDetails(HASSELVEJ_ADRESSE_ID, DAR_CONFIG);

    // Find DAR_Husnummer-kaldet robust uanset call-order
    const husnummerCall = spy.mock.calls.find(([, init]) =>
      (JSON.parse(String((init as RequestInit).body ?? "{}"))?.query ?? "").includes("DAR_Husnummer"),
    ) as [string, RequestInit] | undefined;
    expect(husnummerCall).toBeDefined();
    const body = JSON.parse(husnummerCall![1].body as string);
    expect(body.variables.virkningstid).toBeDefined();
    expect(body.variables.registreringstid).toBeDefined();
    expect(body.variables.registreringstid).toBe(body.variables.virkningstid);
    expect(body.query).toContain("registreringstid");
  });

  it("DAR: grundareal=441, matrikelnummer='5fo', ejerlavskode=12352", async () => {
    mockFetch(hasselvejDarResponses());
    const result = await DarService.getAddressDetails(HASSELVEJ_ADRESSE_ID, DAR_CONFIG);
    expect(result.grundareal).toBe(441);
    expect(result.matrikelnummer).toBe("5fo");
    expect(result.ejerlavskode).toBe(12352);
  });

  it("FBB: ois_id CQL bruges — URL indeholder ikke api.dataforsyningen.dk/bbr (ARCH-166)", async () => {
    let capturedUrl = "";
    globalThis.fetch = mock(async (url: string) => {
      capturedUrl = url;
      return {
        ok: true,
        status: 200,
        headers: { get: () => "application/json" },
        text: async () => JSON.stringify({ features: [] }),
      } as any;
    }) as any;

    await FbbService.getSaveData(["ad5eb0d3-e365-4eb7-ab41-23ff21c67598"]);
    expect(capturedUrl).toContain("kulturarv.dk");
    expect(capturedUrl).toContain("ois_id");
    expect(capturedUrl).not.toContain("api.dataforsyningen.dk");
    expect(capturedUrl).not.toContain("dawa.aws.dk");
  });

  it("FBB: SAVE 3 vinder over bevaringsvaerdi=-1 (vælgBedsteBygning ekskluderer -1)", async () => {
    globalThis.fetch = mock(async () => ({
      ok: true,
      status: 200,
      headers: { get: () => "application/json" },
      text: async () =>
        JSON.stringify({
          features: [
            { properties: { bygningsid: 4600919, bygningsnummer: 1, bevaringsvaerdi: -1, fredet: false } },
            { properties: { bygningsid: 4602381, bygningsnummer: 2, bevaringsvaerdi: 3, fredet: false } },
          ],
        }),
    }) as any) as any;

    const result = await FbbService.getSaveData([
      "ad5eb0d3-e365-4eb7-ab41-23ff21c67598",
      "cb2f89dc-7278-4802-a53e-188cb7120f56",
    ]);
    expect(result.fbb_bedste_bygning?.bevaringsvaerdi).toBe(3);
    expect(result.fbb_bedste_bygning?.bygningsid).toBe(4602381);
    expect(result.fbb_er_fredet).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 2. Vindegade 142 — ejerlejlighed, EBR dual-mode BFE
//    - EBR husnummer-rute: BFE 100206145 (SFE)
//    - EBR adresse-rute: BFE 100263362 (ejerlejlighed)
//    - GrundarealResolver: grundareal=1703 via husnummer→SFE-rute
// ---------------------------------------------------------------------------

describe("Regression: Vindegade 142 — ejerlejlighed EBR dual-mode", () => {
  it("EbrService.getBfeNr: husnummer-rute finder BFE 100206145 (ARCH-225)", async () => {
    globalThis.fetch = mock(async () => ({
      ok: true,
      status: 200,
      headers: { get: () => "application/json" },
      text: async () =>
        JSON.stringify({
          data: { EBR_Ejendomsbeliggenhed: { nodes: [{ bestemtFastEjendomBFENr: "100206145" }] } },
        }),
    }) as any) as any;

    const result = await EbrService.getBfeNr("vinde-husnummer-id", EBR_CONFIG);
    expect(result.bfeNr).toBe("100206145");
    expect(result.fejl).toBeNull();
  });

  it("EbrService.getBfeNrByAdresse: adresse-rute finder BFE 100263362 for ejerlejlighed (ARCH-225)", async () => {
    globalThis.fetch = mock(async () => ({
      ok: true,
      status: 200,
      headers: { get: () => "application/json" },
      text: async () =>
        JSON.stringify({
          data: { EBR_Ejendomsbeliggenhed: { nodes: [{ bestemtFastEjendomBFENr: "100263362" }] } },
        }),
    }) as any) as any;

    const result = await EbrService.getBfeNrByAdresse("vinde-adresse-id", EBR_CONFIG);
    expect(result.bfeNr).toBe("100263362");
    expect(result.fejl).toBeNull();
  });

  it("GrundarealResolver: grundareal=1703 via husnummer→SFE-rute (ARCH-223)", async () => {
    mockFetch([
      // 1: EBR husnummer → BFE 100206145
      { data: { EBR_Ejendomsbeliggenhed: { nodes: [{ bestemtFastEjendomBFENr: "100206145" }] } } },
      // 2: MAT_SamletFastEjendom → SFE
      { data: { MAT_SamletFastEjendom: { nodes: [{ id_lokalId: "sfe-vindegade" }] } } },
      // 3: MAT_Jordstykke → grundareal
      {
        data: {
          MAT_Jordstykke: {
            nodes: [{
              id_lokalId: "js-vinde",
              matrikelnummer: "5fo",
              ejerlavLokalId: "e-vinde",
              registreretAreal: 1703,
              strandbeskyttelse_omfang: null,
              fredskov_omfang: null,
              klitfredning_omfang: null,
            }],
          },
        },
      },
    ]);

    const result = await GrundarealResolver.resolve(
      { adgangsadresseid: "vinde-husnummer-id", adresseid: "vinde-adresse-id" },
      GR_CONFIG,
    );
    expect(result.grundareal).toBe(1703);
    expect(result.source).toBe("ebr_husnummer_sfe");
    expect(result.bfeNr).toBe("100206145");
    expect(result.fejl).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 3. Østerlunden 10 — ejerlejlighed uden husnummer-BFE
//    - Husnummer-rute returnerer tom → fallback til adresse-rute
//    - EBR adresse-rute → BFE 289814 → MAT_Ejerlejlighed → grundareal=3580
// ---------------------------------------------------------------------------

describe("Regression: Østerlunden 10 — adresse-only EBR fallback", () => {
  it("GrundarealResolver: husnummer tom → adresse-rute bruges, source='ebr_adresse_ejerlejlighed' (ARCH-223)", async () => {
    mockFetch([
      // 1: EBR husnummer → ingen BFE
      { data: { EBR_Ejendomsbeliggenhed: { nodes: [] } } },
      // 2: EBR adresse → BFE 289814
      { data: { EBR_Ejendomsbeliggenhed: { nodes: [{ bestemtFastEjendomBFENr: "289814" }] } } },
      // 3: MAT_Ejerlejlighed → SFE
      { data: { MAT_Ejerlejlighed: { nodes: [{ samletFastEjendomLokalId: "sfe-8226704" }] } } },
      // 4: MAT_Jordstykke → grundareal
      {
        data: {
          MAT_Jordstykke: {
            nodes: [{
              id_lokalId: "js-ost",
              matrikelnummer: "10st",
              ejerlavLokalId: "e-ost",
              registreretAreal: 3580,
              strandbeskyttelse_omfang: null,
              fredskov_omfang: null,
              klitfredning_omfang: null,
            }],
          },
        },
      },
    ]);

    const result = await GrundarealResolver.resolve(
      { adgangsadresseid: "ost-husnummer-id", adresseid: "ost-adresse-id" },
      GR_CONFIG,
    );
    expect(result.grundareal).toBe(3580);
    expect(result.source).toBe("ebr_adresse_ejerlejlighed");
    expect(result.bfeNr).toBe("289814");
    expect(result.samletFastEjendomLokalId).toBe("sfe-8226704");
    expect(result.fejl).toBeNull();
  });

  it("GrundarealResolver: returnerer fejl når ingen rute finder BFE", async () => {
    mockFetch([
      { data: { EBR_Ejendomsbeliggenhed: { nodes: [] } } }, // husnummer: ingen
      { data: { EBR_Ejendomsbeliggenhed: { nodes: [] } } }, // adresse: ingen
    ]);

    const result = await GrundarealResolver.resolve(
      { adgangsadresseid: "ingen-id", adresseid: "ingen-id" },
      GR_CONFIG,
    );
    expect(result.grundareal).toBeNull();
    expect(result.fejl).toBeTruthy();
  });
});

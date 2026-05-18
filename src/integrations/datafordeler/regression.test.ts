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

    // Kald index 1 er DAR_Husnummer — her var den historiske node-fejl
    const [, init] = spy.mock.calls[1] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
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

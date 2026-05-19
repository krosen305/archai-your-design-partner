# ARCH-230: Datafordeler Regression Suite — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tilføj `src/integrations/datafordeler/regression.test.ts` — en fixture-baseret regressionstest-suite der permanent sikrer mod genindførelse af ARCH-221–229 bugs (DAR bitemporal, FBB ois_id, EBR dual-mode, BBR aggregering, Plandata selektorer).

**Architecture:** Én ny testfil med 11 `describe`-blokke (10 adresser + forbidden endpoints). Inline mock-fixtures, samme `globalThis.fetch = mock(...)` pattern som eksisterende tests. Valgfri live smoke bag `RUN_LIVE_DATAFORDELER_SMOKE=true`. Ingen JSON-fixture-filer — fixtures er inline i testfilen.

**Tech Stack:** Bun test, TypeScript, inline fetch-mocking. Imports: `DarService`, `BbrService`, `deriveBbrSummary`, `FbbService`, `EbrService`, `GrundarealResolver`, `selectKommuneplanrammeForCompliance`, `selectPrimaryLokalplanForPdf`.

---

## Filer

| Handling | Sti                                                |
| -------- | -------------------------------------------------- |
| Create   | `src/integrations/datafordeler/regression.test.ts` |

Ingen andre filer ændres.

---

## Task 1: Scaffold + Hasselvej 48 (DAR bitemporal + FBB SAVE)

**Files:**

- Create: `src/integrations/datafordeler/regression.test.ts`

- [ ] **Step 1.1: Opret filen med scaffold og Hasselvej 48 describe-blok**

Opret `src/integrations/datafordeler/regression.test.ts` med dette indhold:

```typescript
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
          nodes: [
            {
              id_lokalId: HASSELVEJ_ADRESSE_ID,
              adressebetegnelse: "Hasselvej 48, 2830 Virum",
              husnummer: HASSELVEJ_HUSNUMMER_ID,
              etagebetegnelse: null,
              doerbetegnelse: null,
              status: "Gældende",
            },
          ],
        },
      },
    },
    // 2: DAR_Husnummer — gældende node med jordstykke sat
    {
      data: {
        DAR_Husnummer: {
          nodes: [
            {
              id_lokalId: HASSELVEJ_HUSNUMMER_ID,
              adgangsadressebetegnelse: "Hasselvej 48",
              husnummertekst: "48",
              adgangspunkt: "adgp-virum",
              postnummer: "pnr-2830",
              kommuneinddeling: "kom-lyngby",
              navngivenVej: "vej-hasselvej",
              jordstykke: "2468837",
              status: "Gældende",
            },
          ],
        },
      },
    },
    // 3a: DAR_Postnummer (parallel)
    { data: { DAR_Postnummer: { nodes: [{ postnr: "2830", navn: "Virum" }] } } },
    // 3b: DAR_Adressepunkt (parallel)
    {
      data: { DAR_Adressepunkt: { nodes: [{ position: { wkt: "POINT(723000.00 6176000.00)" } }] } },
    },
    // 3c: MAT_Jordstykke (parallel)
    {
      data: {
        MAT_Jordstykke: {
          nodes: [{ matrikelnummer: "5fo", ejerlavLokalId: "12352", registreretAreal: 441 }],
        },
      },
    },
    // 4: MAT_Ejerlav
    {
      data: { MAT_Ejerlav: { nodes: [{ ejerlavskode: 12352, ejerlavsnavn: "Virum By, Virum" }] } },
    },
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
    globalThis.fetch = mock(
      async () =>
        ({
          ok: true,
          status: 200,
          headers: { get: () => "application/json" },
          text: async () =>
            JSON.stringify({
              features: [
                {
                  properties: {
                    bygningsid: 4600919,
                    bygningsnummer: 1,
                    bevaringsvaerdi: -1,
                    fredet: false,
                  },
                },
                {
                  properties: {
                    bygningsid: 4602381,
                    bygningsnummer: 2,
                    bevaringsvaerdi: 3,
                    fredet: false,
                  },
                },
              ],
            }),
        }) as any,
    ) as any;

    const result = await FbbService.getSaveData([
      "ad5eb0d3-e365-4eb7-ab41-23ff21c67598",
      "cb2f89dc-7278-4802-a53e-188cb7120f56",
    ]);
    expect(result.fbb_bedste_bygning?.bevaringsvaerdi).toBe(3);
    expect(result.fbb_bedste_bygning?.bygningsid).toBe(4602381);
    expect(result.fbb_er_fredet).toBe(false);
  });
});
```

- [ ] **Step 1.2: Kør tests — forvent PASS**

```bash
bun test src/integrations/datafordeler/regression.test.ts
```

Forventet output:

```
✓ Regression: Hasselvej 48, 2830 Virum > DAR: registreringstid er inkluderet...
✓ Regression: Hasselvej 48, 2830 Virum > DAR: grundareal=441...
✓ Regression: Hasselvej 48, 2830 Virum > FBB: ois_id CQL bruges...
✓ Regression: Hasselvej 48, 2830 Virum > FBB: SAVE 3 vinder...
4 pass
```

- [ ] **Step 1.3: Commit**

```bash
git add src/integrations/datafordeler/regression.test.ts
git commit -m "test(ARCH-230): regression-suite scaffold + Hasselvej 48 DAR/FBB"
```

---

## Task 2: GrundarealResolver-ruter (Vindegade 142 + Østerlunden 10)

**Files:**

- Modify: `src/integrations/datafordeler/regression.test.ts`

- [ ] **Step 2.1: Tilføj Vindegade 142 og Østerlunden 10 describe-blokke**

Tilføj efter Hasselvej 48-blokken:

```typescript
// ---------------------------------------------------------------------------
// 2. Vindegade 142 — ejerlejlighed, EBR dual-mode BFE
//    - EBR husnummer-rute: BFE 100206145 (SFE)
//    - EBR adresse-rute: BFE 100263362 (ejerlejlighed)
//    - GrundarealResolver: grundareal=1703 via husnummer→SFE-rute
// ---------------------------------------------------------------------------

describe("Regression: Vindegade 142 — ejerlejlighed EBR dual-mode", () => {
  it("EbrService.getBfeNr: husnummer-rute finder BFE 100206145 (ARCH-225)", async () => {
    globalThis.fetch = mock(
      async () =>
        ({
          ok: true,
          status: 200,
          text: async () =>
            JSON.stringify({
              data: {
                EBR_Ejendomsbeliggenhed: { nodes: [{ bestemtFastEjendomBFENr: "100206145" }] },
              },
            }),
        }) as any,
    ) as any;

    const result = await EbrService.getBfeNr("vinde-husnummer-id", EBR_CONFIG);
    expect(result.bfeNr).toBe("100206145");
    expect(result.fejl).toBeNull();
  });

  it("EbrService.getBfeNrByAdresse: adresse-rute finder BFE 100263362 for ejerlejlighed (ARCH-225)", async () => {
    globalThis.fetch = mock(
      async () =>
        ({
          ok: true,
          status: 200,
          text: async () =>
            JSON.stringify({
              data: {
                EBR_Ejendomsbeliggenhed: { nodes: [{ bestemtFastEjendomBFENr: "100263362" }] },
              },
            }),
        }) as any,
    ) as any;

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
            nodes: [
              {
                id_lokalId: "js-vinde",
                matrikelnummer: "5fo",
                ejerlavLokalId: "e-vinde",
                registreretAreal: 1703,
                strandbeskyttelse_omfang: null,
                fredskov_omfang: null,
                klitfredning_omfang: null,
              },
            ],
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
            nodes: [
              {
                id_lokalId: "js-ost",
                matrikelnummer: "10st",
                ejerlavLokalId: "e-ost",
                registreretAreal: 3580,
                strandbeskyttelse_omfang: null,
                fredskov_omfang: null,
                klitfredning_omfang: null,
              },
            ],
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
```

- [ ] **Step 2.2: Kør tests — forvent PASS**

```bash
bun test src/integrations/datafordeler/regression.test.ts
```

Forventet: alle eksisterende tests + 5 nye grønne.

- [ ] **Step 2.3: Commit**

```bash
git add src/integrations/datafordeler/regression.test.ts
git commit -m "test(ARCH-230): GrundarealResolver regression — Vindegade 142 + Østerlunden 10"
```

---

## Task 3: Toldbodgade 31 + BBR aggregering

**Files:**

- Modify: `src/integrations/datafordeler/regression.test.ts`

- [ ] **Step 3.1: Tilføj Toldbodgade 31 + BBR describe-blokke**

Tilføj efter Østerlunden 10-blokken:

```typescript
// ---------------------------------------------------------------------------
// 4. Toldbodgade 31 — FBB SAVE via ois_id
//    - CQL_FILTER bruger ois_id IN (...), ikke bygningsid
//    - SAVE 3 aggregeres korrekt fra to bygninger (én med -1, én med 3)
// ---------------------------------------------------------------------------

describe("Regression: Toldbodgade 31 — FBB SAVE via ois_id", () => {
  it("FBB: CQL_FILTER indeholder 'ois_id' og UUID'er, ikke BBR-integer-ID'er (ARCH-166)", async () => {
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

    await FbbService.getSaveData(["toldbod-uuid-1", "toldbod-uuid-2"]);
    expect(capturedUrl).toContain("ois_id");
    expect(capturedUrl).toContain("toldbod-uuid-1");
    expect(capturedUrl).not.toContain("bygningsid+IN");
    expect(capturedUrl).not.toContain("api.dataforsyningen.dk");
  });

  it("FBB: SAVE 3 aggregeres, bevaringsvaerdi=-1 ekskluderes fra fbb_bedste_bygning", async () => {
    globalThis.fetch = mock(
      async () =>
        ({
          ok: true,
          status: 200,
          headers: { get: () => "application/json" },
          text: async () =>
            JSON.stringify({
              features: [
                {
                  properties: {
                    bygningsid: 111,
                    bygningsnummer: 1,
                    bevaringsvaerdi: -1,
                    fredet: false,
                  },
                },
                {
                  properties: {
                    bygningsid: 222,
                    bygningsnummer: 2,
                    bevaringsvaerdi: 3,
                    fredet: false,
                  },
                },
              ],
            }),
        }) as any,
    ) as any;

    const result = await FbbService.getSaveData(["toldbod-uuid-1", "toldbod-uuid-2"]);
    expect(result.fbb_bedste_bygning?.bevaringsvaerdi).toBe(3);
    expect(result.fbb_bedste_bygning?.bygningsid).toBe(222);
    expect(result.fbb_er_fredet).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 6. Rækkehus med sekundære bygninger
//    - bebygget_areal summerer kun ikke-sekundære (kode 120)
//    - garage (kode 910) ekskluderes (ARCH-227)
// ---------------------------------------------------------------------------

const MOCK_BBR_BASE = {
  byg026Opfoerelsesaar: 1985,
  byg032YdervaeggensMateriale: "1",
  byg033Tagdaekningsmateriale: "1",
  byg038SamletBygningsareal: 150,
  byg054AntalEtager: 1,
  byg056Varmeinstallation: "1",
  byg057Opvarmningsmiddel: "1",
  byg070Fredning: null,
};

describe("Regression: Rækkehus med sekundære bygninger (ARCH-227)", () => {
  const RAEKKEHUS_BYGNINGER = [
    {
      ...MOCK_BBR_BASE,
      id_lokalId: "byg-bolig",
      byg021BygningensAnvendelse: "120",
      byg041BebyggetAreal: 130,
    },
    {
      ...MOCK_BBR_BASE,
      id_lokalId: "byg-garage",
      byg021BygningensAnvendelse: "910",
      byg041BebyggetAreal: 25,
    },
  ];

  it("bebygget_areal = 130 (garage kode 910 ekskluderet)", () => {
    const { bebygget_areal } = deriveBbrSummary(RAEKKEHUS_BYGNINGER);
    expect(bebygget_areal).toBe(130);
  });

  it("primærBygning er boligen (kode 120), ikke garagen (kode 910)", () => {
    const { primærBygning } = deriveBbrSummary(RAEKKEHUS_BYGNINGER);
    expect(primærBygning?.byg021BygningensAnvendelse).toBe("120");
  });

  it("sekundær i anden position ændrer ikke bebygget_areal", () => {
    const reversed = [...RAEKKEHUS_BYGNINGER].reverse();
    expect(deriveBbrSummary(reversed).bebygget_areal).toBe(130);
  });
});

// ---------------------------------------------------------------------------
// 9. Adresse med 3 BBR-bygninger inkl. dublet id_lokalId
//    - deriveBbrSummary deduplicerer på id_lokalId (ARCH-227)
//    - bebygget_areal = 280, ikke 480
// ---------------------------------------------------------------------------

describe("Regression: 3 BBR-bygninger med dublet id_lokalId (ARCH-227)", () => {
  const BYGNINGER_MED_DUBLET = [
    {
      ...MOCK_BBR_BASE,
      id_lokalId: "byg-a",
      byg021BygningensAnvendelse: "120",
      byg041BebyggetAreal: 200,
    },
    {
      ...MOCK_BBR_BASE,
      id_lokalId: "byg-b",
      byg021BygningensAnvendelse: "120",
      byg041BebyggetAreal: 80,
    },
    {
      ...MOCK_BBR_BASE,
      id_lokalId: "byg-a",
      byg021BygningensAnvendelse: "120",
      byg041BebyggetAreal: 200,
    }, // dublet
  ];

  it("bebygget_areal = 280, ikke 480 — dublet tæller ikke dobbelt", () => {
    const { bebygget_areal } = deriveBbrSummary(BYGNINGER_MED_DUBLET);
    expect(bebygget_areal).toBe(280);
  });

  it("er node-order-uafhængig", () => {
    const reversed = [...BYGNINGER_MED_DUBLET].reverse();
    expect(deriveBbrSummary(BYGNINGER_MED_DUBLET).bebygget_areal).toBe(
      deriveBbrSummary(reversed).bebygget_areal,
    );
  });
});
```

- [ ] **Step 3.2: Kør tests — forvent PASS**

```bash
bun test src/integrations/datafordeler/regression.test.ts
```

Forventet: alle eksisterende tests + 7 nye grønne.

- [ ] **Step 3.3: Commit**

```bash
git add src/integrations/datafordeler/regression.test.ts
git commit -m "test(ARCH-230): Toldbodgade 31 FBB + BBR rækkehus + dublet regression"
```

---

## Task 4: Resterende adresser + Plandata selektorer

**Files:**

- Modify: `src/integrations/datafordeler/regression.test.ts`

- [ ] **Step 4.1: Tilføj de resterende 5 describe-blokke**

Tilføj efter BBR-dublet-blokken:

```typescript
// ---------------------------------------------------------------------------
// 5. Enfamiliehus — DAR jordstykke direkte, ingen FBB-hit
// ---------------------------------------------------------------------------

describe("Regression: Enfamiliehus — DAR jordstykke direkte", () => {
  it("DAR: grundareal læses fra MAT_Jordstykke.registreretAreal direkte", async () => {
    mockFetch([
      {
        data: {
          DAR_Adresse: {
            nodes: [
              {
                id_lokalId: "bredgade-adr-id",
                adressebetegnelse: "Bredgade 6, 1260 København K",
                husnummer: "bredgade-hnr-id",
                etagebetegnelse: null,
                doerbetegnelse: null,
                status: "Gældende",
              },
            ],
          },
        },
      },
      {
        data: {
          DAR_Husnummer: {
            nodes: [
              {
                id_lokalId: "bredgade-hnr-id",
                adgangsadressebetegnelse: "Bredgade 6",
                husnummertekst: "6",
                adgangspunkt: "adgp-2",
                postnummer: "pnr-2",
                kommuneinddeling: "kom-2",
                navngivenVej: "vej-2",
                jordstykke: "js-bredgade",
                status: "Gældende",
              },
            ],
          },
        },
      },
      { data: { DAR_Postnummer: { nodes: [{ postnr: "1260", navn: "København K" }] } } },
      {
        data: {
          DAR_Adressepunkt: { nodes: [{ position: { wkt: "POINT(725000.00 6175000.00)" } }] },
        },
      },
      {
        data: {
          MAT_Jordstykke: {
            nodes: [{ matrikelnummer: "12a", ejerlavLokalId: "e-kbh", registreretAreal: 580 }],
          },
        },
      },
      {
        data: {
          MAT_Ejerlav: { nodes: [{ ejerlavskode: 1150, ejerlavsnavn: "Kbh. Frimands Kvt." }] },
        },
      },
    ]);

    const result = await DarService.getAddressDetails("bredgade-adr-id", DAR_CONFIG);
    expect(result.grundareal).toBe(580);
    expect(result.matrikelnummer).toBe("12a");
  });
});

// ---------------------------------------------------------------------------
// 7. Ejerlejlighed — EBR adresse-BFE rute (Vesterbrogade 80 fixture)
// ---------------------------------------------------------------------------

describe("Regression: Ejerlejlighed — EBR adresse-BFE og GrundarealResolver (ARCH-225)", () => {
  it("EbrService.getBfeNrByAdresse: finder BFE via adresseLokalId", async () => {
    globalThis.fetch = mock(async (_url: unknown, init?: unknown) => {
      const body = JSON.parse(String((init as RequestInit)?.body ?? "{}"));
      expect(body.query).toContain("adresseLokalId");
      expect(body.variables.registreringstid).toBeDefined();
      return {
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            data: { EBR_Ejendomsbeliggenhed: { nodes: [{ bestemtFastEjendomBFENr: "77777" }] } },
          }),
      } as any;
    }) as any;

    const result = await EbrService.getBfeNrByAdresse("vest-adresse-id", EBR_CONFIG);
    expect(result.bfeNr).toBe("77777");
    expect(result.fejl).toBeNull();
  });

  it("GrundarealResolver: source='ebr_adresse_ejerlejlighed' for adresse-BFE rute", async () => {
    mockFetch([
      { data: { EBR_Ejendomsbeliggenhed: { nodes: [] } } }, // husnummer: ingen
      { data: { EBR_Ejendomsbeliggenhed: { nodes: [{ bestemtFastEjendomBFENr: "77777" }] } } },
      { data: { MAT_Ejerlejlighed: { nodes: [{ samletFastEjendomLokalId: "sfe-vest" }] } } },
      {
        data: {
          MAT_Jordstykke: {
            nodes: [
              {
                id_lokalId: "js-vest",
                matrikelnummer: "5a",
                ejerlavLokalId: "e-vest",
                registreretAreal: 800,
                strandbeskyttelse_omfang: null,
                fredskov_omfang: null,
                klitfredning_omfang: null,
              },
            ],
          },
        },
      },
    ]);

    const result = await GrundarealResolver.resolve(
      { adgangsadresseid: "vest-hnr-id", adresseid: "vest-adresse-id" },
      GR_CONFIG,
    );
    expect(result.source).toBe("ebr_adresse_ejerlejlighed");
    expect(result.grundareal).toBe(800);
  });
});

// ---------------------------------------------------------------------------
// 8. Adresse uden FBB-hit
// ---------------------------------------------------------------------------

describe("Regression: Adresse uden FBB-hit (Strandvejen 100 fixture)", () => {
  it("FBB: tom features-liste → fbb_bedste_bygning=null", async () => {
    globalThis.fetch = mock(
      async () =>
        ({
          ok: true,
          status: 200,
          headers: { get: () => "application/json" },
          text: async () => JSON.stringify({ features: [] }),
        }) as any,
    ) as any;

    const result = await FbbService.getSaveData(["uuid-strand-1"]);
    expect(result.fbb_bedste_bygning).toBeNull();
    expect(result.fbb_bygninger).toHaveLength(0);
  });

  it("FBB: alle bevaringsvaerdi=-1 → fbb_bedste_bygning=null (ingen reel SAVE)", async () => {
    globalThis.fetch = mock(
      async () =>
        ({
          ok: true,
          status: 200,
          headers: { get: () => "application/json" },
          text: async () =>
            JSON.stringify({
              features: [
                {
                  properties: {
                    bygningsid: 999,
                    bygningsnummer: 1,
                    bevaringsvaerdi: -1,
                    fredet: false,
                  },
                },
              ],
            }),
        }) as any,
    ) as any;

    const result = await FbbService.getSaveData(["uuid-minus-1"]);
    expect(result.fbb_bedste_bygning).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 10. Plandata — deterministiske selektorer (Nørregade 15 fixture)
// ---------------------------------------------------------------------------

const planRamme = (bebygpct: number | null, maxetager: number | null = null): Kommuneplanramme => ({
  planid: `ramme-${bebygpct}`,
  plannavn: "Test",
  plannr: null,
  kommunenavn: null,
  komnr: null,
  bebygpct,
  maxetager,
  maxbygnhjd: null,
  anvgen: null,
  anvendelseGenerel: null,
  fremtidigzonestatus: null,
  sforhold: null,
  planstatus: "V",
  datoIkraft: null,
  plandokumentLink: null,
});

const planLokalplan = (
  status: string | null,
  datoVedtaget: string | null,
  planid: string,
): Lokalplan => ({
  planid,
  plannavn: "Test",
  plannr: null,
  kommunenavn: null,
  komnr: null,
  datoVedtaget,
  datoIkraft: null,
  plandokumentLink: `https://pdf/${planid}`,
  plantype: null,
  status,
  anvgen: null,
  anvendelseGenerel: null,
});

describe("Regression: 2 Plandata-features — deterministiske selektorer (ARCH-228)", () => {
  it("selectKommuneplanrammeForCompliance: laveste bebygpct vælges (30 < 40)", () => {
    const result = selectKommuneplanrammeForCompliance([planRamme(40), planRamme(30)]);
    expect(result?.bebygpct).toBe(30);
  });

  it("selectKommuneplanrammeForCompliance: er uafhængig af rækkefølge", () => {
    expect(selectKommuneplanrammeForCompliance([planRamme(30), planRamme(40)])?.bebygpct).toBe(
      selectKommuneplanrammeForCompliance([planRamme(40), planRamme(30)])?.bebygpct,
    );
  });

  it("selectKommuneplanrammeForCompliance: null bebygpct taber for eksplicit værdi", () => {
    const result = selectKommuneplanrammeForCompliance([planRamme(null), planRamme(35)]);
    expect(result?.bebygpct).toBe(35);
  });

  it("selectPrimaryLokalplanForPdf: vedtaget (V) vælges over forslag (F) uanset rækkefølge", () => {
    const liste = [
      planLokalplan("F", "20230101", "forslag"),
      planLokalplan("V", "20200101", "vedtaget"),
    ];
    expect(selectPrimaryLokalplanForPdf(liste)?.planid).toBe("vedtaget");
    expect(selectPrimaryLokalplanForPdf([...liste].reverse())?.planid).toBe("vedtaget");
  });

  it("selectPrimaryLokalplanForPdf: nyeste vedtagne vælges ved to vedtagne", () => {
    const liste = [planLokalplan("V", "20180101", "gammel"), planLokalplan("V", "20220101", "ny")];
    expect(selectPrimaryLokalplanForPdf(liste)?.planid).toBe("ny");
  });
});
```

- [ ] **Step 4.2: Kør tests — forvent PASS**

```bash
bun test src/integrations/datafordeler/regression.test.ts
```

Forventet: alle tests grønne, ingen nye fejl.

- [ ] **Step 4.3: Commit**

```bash
git add src/integrations/datafordeler/regression.test.ts
git commit -m "test(ARCH-230): resterende adresser + Plandata selektorer regression"
```

---

## Task 5: Forbidden endpoints + live smoke

**Files:**

- Modify: `src/integrations/datafordeler/regression.test.ts`

- [ ] **Step 5.1: Tilføj forbidden endpoints og live smoke blokke**

Tilføj sidst i filen:

```typescript
// ---------------------------------------------------------------------------
// Forbidden endpoints — DAWA og BBR Public må ikke kaldes
// ---------------------------------------------------------------------------

describe("Forbidden endpoints", () => {
  it("FBB: URL indeholder ikke api.dataforsyningen.dk/bbr (ARCH-166)", async () => {
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

    await FbbService.getSaveData(["check-uuid"]);
    expect(capturedUrl).not.toContain("api.dataforsyningen.dk/bbr");
  });

  it("FBB: URL indeholder ikke dawa.aws.dk", async () => {
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

    await FbbService.getSaveData(["check-uuid"]);
    expect(capturedUrl).not.toContain("dawa.aws.dk");
  });

  it("DAR: alle URL'er indeholder ikke dawa.aws.dk", async () => {
    const capturedUrls: string[] = [];
    mockFetch(hasselvejDarResponses()); // brug eksisterende fixture

    // Wrap spy for at capture URLs
    const origFetch = globalThis.fetch;
    globalThis.fetch = mock(async (url: unknown, init?: unknown) => {
      capturedUrls.push(String(url));
      return (origFetch as any)(url, init);
    }) as any;

    // Kald den eksisterende mock — origFetch er allerede mocked
    // Simpel variant: brug separat mock der logger URL
    capturedUrls.length = 0;
    const spy = mock(async (url: string) => {
      capturedUrls.push(url);
      const responses = hasselvejDarResponses();
      let i = 0;
      return {
        ok: true,
        status: 200,
        headers: { get: () => "application/json" },
        text: async () => JSON.stringify(responses[i++ % responses.length]),
        json: async () => responses[i % responses.length],
      } as any;
    });
    globalThis.fetch = spy as any;

    await DarService.getAddressDetails(HASSELVEJ_ADRESSE_ID, DAR_CONFIG);
    for (const url of capturedUrls) {
      expect(url).not.toContain("dawa.aws.dk");
    }
  });
});

// ---------------------------------------------------------------------------
// Live smoke — kræver RUN_LIVE_DATAFORDELER_SMOKE=true og DATAFORDELER_API_KEY
//
// Kør: RUN_LIVE_DATAFORDELER_SMOKE=true bun test src/integrations/datafordeler/regression.test.ts
// ---------------------------------------------------------------------------

const LIVE = process.env.RUN_LIVE_DATAFORDELER_SMOKE === "true";

describe.if(LIVE)("Live smoke — Datafordeler live (ARCH-230)", () => {
  it("Hasselvej 48: grundareal=441, matrikelnummer='5fo', ejerlavskode=12352", async () => {
    const result = await DarService.getAddressDetails(HASSELVEJ_ADRESSE_ID);
    expect(result.grundareal).toBe(441);
    expect(result.matrikelnummer).toBe("5fo");
    expect(result.ejerlavskode).toBe(12352);
  }, 30_000);

  it("Hasselvej 48: FBB SAVE=3 via ois_id (bevaringsvaerdi=-1 ekskluderes)", async () => {
    const fbb = await FbbService.getSaveData([
      "ad5eb0d3-e365-4eb7-ab41-23ff21c67598",
      "cb2f89dc-7278-4802-a53e-188cb7120f56",
    ]);
    expect(fbb.fbb_bedste_bygning?.bevaringsvaerdi).toBe(3);
  }, 30_000);

  it("Østerlunden 10: grundareal=3580 via ebr_adresse_ejerlejlighed-rute", async () => {
    // adgangsadresseid (husnummer ID) og adresseid for Østerlunden 10 skal verificeres
    // mod live DAR-opslag hvis de ændrer sig.
    // Kendte værdier fra ARCH-230 audit:
    const result = await GrundarealResolver.resolve({
      adgangsadresseid: "0a3f507d-3f01-32b8-e044-0003ba298018",
      adresseid: "0a3f50a6-3ecf-32b8-e044-0003ba298018",
    });
    expect(result.grundareal).toBe(3580);
    expect(result.source).toBe("ebr_adresse_ejerlejlighed");
  }, 30_000);
});
```

**OBS:** Live smoke for Østerlunden 10 bruger estimerede UUIDs fra audit. Kør `bun dev` og tjek adresse-ID via GSearch + DAR hvis live-testen fejler på null grundareal — det kan skyldes forkerte IDs.

- [ ] **Step 5.2: Kør tests (fixture-suite) — forvent PASS**

```bash
bun test src/integrations/datafordeler/regression.test.ts
```

Forventet: alle fixture-tests pass, live-blok skippet (ingen `RUN_LIVE_DATAFORDELER_SMOKE`).

- [ ] **Step 5.3: Commit**

```bash
git add src/integrations/datafordeler/regression.test.ts
git commit -m "test(ARCH-230): forbidden endpoints + live smoke scaffold"
```

---

## Task F: Final verifikation + Linear

**Files:** ingen ændringer

- [ ] **Step F.1: Kør fuld test-suite**

```bash
bun test
```

Forventet: alle eksisterende tests + ~30 nye i `regression.test.ts` grønne. Ingen regressioner.

- [ ] **Step F.2: Typecheck og lint**

```bash
bunx tsc --noEmit
bunx eslint src/integrations/datafordeler/regression.test.ts
```

Forventet: ingen fejl.

- [ ] **Step F.3: Tæl tests i regression-suiten**

```bash
bun test src/integrations/datafordeler/regression.test.ts 2>&1 | tail -5
```

Forventet: ≥ 28 `pass`, 0 `fail`.

- [ ] **Step F.4: Marker ARCH-230 Done i Linear**

Opdater Linear issue ARCH-230 til status **Done**.

---

## Self-review: Spec Coverage

| Spec-krav                                           | Task       |
| --------------------------------------------------- | ---------- |
| DAR bitemporal: `registreringstid` i query          | Task 1     |
| DAR: gældende grundareal returneres                 | Task 1     |
| FBB: ois_id CQL bruges                              | Task 1 + 3 |
| FBB: SAVE aggregering (-1 ekskluderet)              | Task 1 + 3 |
| Hasselvej 48 regression-case                        | Task 1     |
| Vindegade 142: EBR dual-mode BFE                    | Task 2     |
| Vindegade 142: grundareal=1703 via SFE              | Task 2     |
| Østerlunden 10: husnummer-fallback til adresse-rute | Task 2     |
| Østerlunden 10: grundareal=3580                     | Task 2     |
| Toldbodgade 31: FBB CQL_FILTER + SAVE 3             | Task 3     |
| BBR: sekundære bygninger (kode 910) ekskl.          | Task 3     |
| BBR: dublet deduplicering                           | Task 3     |
| Enfamiliehus: DAR jordstykke direkte                | Task 4     |
| Ejerlejlighed adresse-BFE                           | Task 4     |
| Adresse uden FBB-hit                                | Task 4     |
| Plandata selektorer                                 | Task 4     |
| Forbidden endpoints                                 | Task 5     |
| Live smoke                                          | Task 5     |
| `bun test` kører uden netværk                       | Alle tasks |
| Smoke-kommando dokumenteret i testfil               | Task 5     |

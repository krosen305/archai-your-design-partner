# ARCH-230: Datafordeler Regression Suite — Design

**Dato:** 2026-05-18
**Issue:** [ARCH-230](https://linear.app/archai-design-partner/issue/ARCH-230)
**Status:** Approved

---

## Mål

Tilføj en permanent fixture-baseret regressionstest-suite der sikrer, at Datafordeler-fixes (ARCH-221–229) ikke genindføres ved fremtidige refactors. Suiten skal altid køre i `bun test` uden netværk og indeholde en valgfri live smoke-test bag env-flag.

---

## Fil-struktur

```
src/integrations/datafordeler/regression.test.ts   ← ny fil (denne spec)
```

Ingen nye JSON-fixture-filer. Samme inline mock-pattern som eksisterende tests (`globalThis.fetch = mock(...)`).

---

## Test-organisation

```
describe("Regression: Hasselvej 48, 2830 Virum")
  it("DAR: gældende node vælges, ikke historisk (registreringTil=null wins)")
  it("DAR: sender registreringstid i alle queries")
  it("FBB: ois_id-CQL bruges, ikke api.dataforsyningen.dk/bbr")
  it("FBB: SAVE 3 vinder over bevaringsvaerdi=-1")

describe("Regression: Vindegade 142 — ejerlejlighed")
  it("EBR: husnummer-rute finder BFE 100206145")
  it("EBR: adresse-rute finder BFE 100263362 (ejerlejlighed)")
  it("GrundarealResolver: grundareal=1703 via SFE-rute")

describe("Regression: Østerlunden 10 — adresse-only EBR")
  it("GrundarealResolver: husnummer-rute returnerer tom → adresse-rute bruges")
  it("GrundarealResolver: grundareal=3580, source='ebr_adresse_ejerlejlighed'")

describe("Regression: Toldbodgade 31 — SAVE via ois_id")
  it("FBB: ois_id-query bygger korrekt CQL_FILTER")
  it("FBB: SAVE 3 aggregeres korrekt; heritage_save_value=3")

describe("Regression: Enfamiliehus — DAR jordstykke direkte")
  it("DAR: grundareal aflæses fra MAT_Jordstykke direkte")
  it("FBB: ingen hit → fbb_bedste_bygning=null")

describe("Regression: Rækkehus med sekundære bygninger")
  it("BBR: bebygget_areal summerer kun ikke-sekundære (kode≠910/920/930/940)")
  it("BBR: garage (kode 910) ekskluderes fra bebygget_areal")

describe("Regression: Ejerlejlighed adresse-BFE")
  it("GrundarealResolver: MAT_Ejerlejlighed-rute finder samletFastEjendomLokalId")
  it("GrundarealResolver: source='ebr_adresse_ejerlejlighed'")

describe("Regression: Adresse uden FBB-hit")
  it("FBB: tom features-liste → fbb_bedste_bygning=null, kilde='ingen-ids'")

describe("Regression: Adresse med 3 BBR-bygninger inkl. dublet")
  it("BBR: deriveBbrSummary deduplicerer på id_lokalId")
  it("BBR: bebygget_areal er node-order-uafhængig")

describe("Regression: Adresse med 2 Plandata-features")
  it("Plandata: selectKommuneplanrammeForCompliance vælger laveste bebygpct")
  it("Plandata: selectPrimaryLokalplanForPdf vælger vedtaget over forslag")

describe("Forbidden endpoints")
  it("FBB-client indeholder ikke api.dataforsyningen.dk/bbr i query-strings")
  it("BBR-client indeholder ikke dawa.aws.dk i query-strings")
  it("DAR-client indeholder ikke dawa.aws.dk i query-strings")

describe.if(LIVE)("Live smoke — kræver RUN_LIVE_DATAFORDELER_SMOKE=true")
  it("Hasselvej 48: grundareal=441, matrikelnummer='5fo', SAVE=3")
  it("Vindegade 142: grundareal=1703 via SFE")
  it("Østerlunden 10: grundareal=3580 via ejerlejlighed")
  it("Toldbodgade 31: heritage_save_value=3")
```

---

## De 10 testadresser

| # | Adresse | Primær regression |
|---|---------|-------------------|
| 1 | Hasselvej 48, 2830 Virum | DAR bitemporal: 2 nodes → vælg gældende; FBB SAVE 3 via ois_id |
| 2 | Vindegade 142 (lejlighed) | EBR dual-mode: husnummer-BFE ≠ adresse-BFE |
| 3 | Østerlunden 10 (lejlighed) | Husnummer-rute tom → adresse-BFE 289814, grundareal 3580 |
| 4 | Toldbodgade 31 | FBB ois_id → SAVE 3, `-1` overrider ikke |
| 5 | Bredgade 6, Kbh (fixture) | Enfamiliehus, DAR jordstykke direkte, ingen FBB |
| 6 | Mosevej 12 (fixture) | Rækkehus: bolig + garage kode 910, bebygget_areal kun bolig |
| 7 | Vesterbrogade 80 (fixture, lejlighed) | Adresse-BFE via EBR, MAT_Ejerlejlighed-rute |
| 8 | Strandvejen 100 (fixture) | FBB returnerer 0 features → ingen SAVE |
| 9 | Søndergade 5 (fixture) | 3 BBR-bygninger med dublet id_lokalId → dedupliceret |
| 10 | Nørregade 15 (fixture) | 2 Plandata-features → selectKommuneplanrammeForCompliance vælger laveste bebygpct |

Adresser 5–10 bruger konstruerede fixtures (ingen ægte UUIDs/persondata).

---

## Nøgle-fixtures per regression-case

### Case 1: DAR bitemporal (Hasselvej 48)

Med bitemporal args sender klienten `registreringstid` til Datafordeler, som server-side filtrerer historiske versioner fra og returnerer kun 1 gældende node. Regressionen er: hvis `registreringstid` fjernes fra query-variablerne, returnerer serveren historiske nodes, og `nodes[0]` kan have `jordstykke: null`.

```typescript
// Mock returnerer 1 gældende node (som Datafordeler gør med korrekte bitemporal args)
const DAR_HUSNUMMER_GAELDENDE = {
  data: {
    DAR_Husnummer: {
      nodes: [
        { id_lokalId: "husnr-gaeldende", jordstykke: "2468837", status: "Gældende" },
      ],
    },
  },
};
```

Test: Kald `DarService.getAddressDetails(...)`, capture mock-request body, assert:
- `body.variables.registreringstid` er sat og lig `body.variables.virkningstid`
- `body.query` indeholder `"registreringstid"`
- `result.adgangsadresseid` er ikke null

Regression-testen fejler hvis `registreringstid` fjernes fra query-definitionen.

### Case 4: FBB ois_id (Toldbodgade 31)

```typescript
const FBB_SAVE_FIXTURE = {
  features: [
    { properties: { bygningsid: 4600919, ois_id: "ad5eb0d3-...", bevaringsvaerdi: -1, fredet: false } },
    { properties: { bygningsid: 4602381, ois_id: "cb2f89dc-...", bevaringsvaerdi: 3, fredet: false } },
  ],
};
```

Test: `FbbService.getSaveData(["ad5eb0d3-...", "cb2f89dc-..."])` → `fbb_bedste_bygning.bevaringsvaerdi === 3`.

### Case 6: BBR sekundære bygninger

```typescript
const BBR_RAEKKEHUS = [
  { id_lokalId: "byg-1", byg021BygningensAnvendelse: "120", byg041BebyggetAreal: 130 }, // bolig
  { id_lokalId: "byg-2", byg021BygningensAnvendelse: "910", byg041BebyggetAreal: 25 },  // garage
];
```

Test: `deriveBbrSummary(BBR_RAEKKEHUS).bebygget_areal === 130`.

### Case 9: BBR dublet

```typescript
const BBR_MED_DUBLET = [
  { id_lokalId: "byg-uuid-1", byg021BygningensAnvendelse: "120", byg041BebyggetAreal: 200 },
  { id_lokalId: "byg-uuid-2", byg021BygningensAnvendelse: "120", byg041BebyggetAreal: 80 },
  { id_lokalId: "byg-uuid-1", byg021BygningensAnvendelse: "120", byg041BebyggetAreal: 200 }, // dublet
];
```

Test: `deriveBbrSummary(BBR_MED_DUBLET).bebygget_areal === 280` (ikke 480).

---

## Forbidden endpoints

Testes ved at mocke fetch, kalde servicen, og assertere at den URL der sendes IKKE indeholder forbudte endpoints:

```typescript
it("FBB-client bruger ikke api.dataforsyningen.dk/bbr", async () => {
  let capturedUrl = "";
  globalThis.fetch = mock(async (url: string) => {
    capturedUrl = url;
    return { ok: true, status: 200, headers: { get: () => "application/json" },
      text: async () => JSON.stringify({ features: [] }) } as any;
  });
  await FbbService.getSaveData(["some-uuid"]);
  expect(capturedUrl).not.toContain("api.dataforsyningen.dk/bbr");
  expect(capturedUrl).not.toContain("dawa.aws.dk");
});

---

## Live smoke-test mønster

```typescript
const LIVE = process.env.RUN_LIVE_DATAFORDELER_SMOKE === "true";

describe.if(LIVE)("Live smoke", () => {
  it("Hasselvej 48: grundareal=441, SAVE=3", async () => {
    const dar = await DarService.getAddressDetails("0a3f50a6-34da-32b8-e044-0003ba298018");
    expect(dar.grundareal).toBe(441);
    expect(dar.matrikelnummer).toBe("5fo");
    const fbb = await FbbService.getSaveData(dar.alle_bygning_lokal_ids ?? []);
    expect(fbb.fbb_bedste_bygning?.bevaringsvaerdi).toBe(3);
  }, 30_000); // 30s timeout for live
});
```

Smoke-tests springes over i normal CI. Kør lokalt med:
```bash
RUN_LIVE_DATAFORDELER_SMOKE=true bun test src/integrations/datafordeler/regression.test.ts
```

---

## Services der importeres

| Service | Import |
|---------|--------|
| `DarService` | `@/integrations/dar/client` |
| `BbrService` + `deriveBbrSummary` | `@/integrations/bbr/client` |
| `FbbService` | `@/integrations/fbb/client` |
| `EbrService` | `@/integrations/ebr/client` |
| `GrundarealResolver` | `@/integrations/mat/grundareal-resolver` |
| `selectKommuneplanrammeForCompliance`, `selectPrimaryLokalplanForPdf` | `@/integrations/plandata/client` |

---

## Acceptkriterier

- `bun test` kører alle fixture-tests uden netværk og uden API-nøgle.
- Hasselvej 48-testen fejler hvis DAR-mapperen igen tager `nodes[0]` uden bitemporal filter.
- FBB-testen fejler hvis `ois_id` erstattes med BBR Public/Dataforsyningen.
- Live smoke-kommando er dokumenteret i testfilen.
- `bunx tsc --noEmit` og `bunx eslint .` er rene.

---

## Ikke i scope

- End-to-end test af `analyseAddress` eller `preCheckAdresse` (for mange services at mocke).
- JSON-fixture-filer (inlines fixtures i testfilen er tilstrækkeligt og matcher kodebase-stil).
- Tests for UI-komponenter eller Supabase-persistens.

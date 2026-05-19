# ARCH-222–229 Compliance Data Quality — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix 8 data quality issues in the compliance pipeline: BBR aggregation, Plandata determinism, DAWA removal, Datafordeler-only grundareal fallback (GrundarealResolver), EBR dual-mode, SAVE/FBB pipeline, og MatrikelMap geometry.

**Architecture:** Alle ændringer er Datafordeler-only (ingen DAWA/DAWA-fallbacks). Nye hjælpefunktioner er rene funktioner der kan testes uden netværk. Arkitekturbeslutninger er godkendt i ARCH-222–226.

**Tech Stack:** Bun, TypeScript, Datafordeler GraphQL (BBR/MAT/EBR/DAR), Plandata WFS, React/TanStack Start, Zustand, Supabase

---

## Godkendte arkitekturbeslutninger

- **ARCH-222 option B:** DAR → EBR/BFE/SFE → MAT_Ejerlejlighed → BBR — alle ruter er Datafordeler-only. CLAUDE.md opdateres.
- **ARCH-226 GSearch:** Tilladt som søge-UX-undtagelse (ikke compliance-kilde). Dokumenteres i CLAUDE.md.
- **ARCH-226 Basemap WMTS:** Tilladt som kort-tiles-undtagelse (ikke compliance-data). Dokumenteres i CLAUDE.md.
- **ARCH-226 Neighbor:** `dawa.aws.dk` deaktiveres — returnerer tom liste.
- **ARCH-227 bebygget_areal:** Sum af alle aktuelle ikke-sekundære bygningers `byg041BebyggetAreal`.

---

## Filer der ændres (overblik)

**Nye filer:**

- `src/integrations/mat/grundareal-resolver.ts` — GrundarealResolver (ARCH-223)
- `src/integrations/mat/grundareal-resolver.test.ts`

**Ændrede filer:**

- `src/integrations/bbr/client.ts` — BBR aggregering (ARCH-227)
- `src/integrations/bbr/bbr.test.ts`
- `src/integrations/plandata/client.ts` — selektorer (ARCH-228)
- `src/integrations/plandata/client.test.ts`
- `src/integrations/ebr/client.ts` — adresseLokalId route (ARCH-225)
- `src/integrations/ebr/ebr.test.ts`
- `src/integrations/bbr/neighbor-client.ts` — DAWA deaktiveres (ARCH-226)
- `src/lib/compliance-layer1.ts` — wire GrundarealResolver fallback
- `src/lib/analysis-orchestrator.ts` 🔒 — lokalplan-selektor
- `src/lib/pre-check-adresse.ts` 🔒 — GrundarealResolver fallback
- `src/integrations/supabase/project-persistence.ts` 🔒 — bfe_nr i restore
- `src/routes/projekt.$id.cockpit.tsx` — fix fbbData i runByggeanalyse (ARCH-224)
- `src/components/cockpit/EjendomPanel.tsx` — fix SAVE gate (ARCH-224)
- `src/lib/map-proxy.ts` — targeted parcel-geometri (ARCH-229)
- `src/components/cockpit/MatrikelMap.tsx` — brug jordstykke ID (ARCH-229)
- `CLAUDE.md` 🔒 — arkitekturbeslutninger dokumenteres

---

## Task 1: BBR aggregering (ARCH-227)

**Files:**

- Modify: `src/integrations/bbr/client.ts`
- Modify: `src/integrations/bbr/bbr.test.ts`

- [ ] **Step 1.1: Tilføj test for aggregeret `bebygget_areal` og `fredet`**

Tilføj til slutningen af `src/integrations/bbr/bbr.test.ts`:

```typescript
// ---------------------------------------------------------------------------
// deriveBbrSummary — ARCH-227
// ---------------------------------------------------------------------------
import { deriveBbrSummary } from "./client";

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
    const garage = {
      ...MOCK_BYGNING,
      byg021BygningensAnvendelse: "910",
      byg026Opfoerelsesaar: 2000,
    };
    const bolig = {
      ...MOCK_BYGNING,
      byg021BygningensAnvendelse: "120",
      byg026Opfoerelsesaar: 1992,
    };
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
```

- [ ] **Step 1.2: Kør tests — forvent FAIL**

```bash
bun test src/integrations/bbr/bbr.test.ts
```

Forventet: `deriveBbrSummary is not a function` eller lignende.

- [ ] **Step 1.3: Implementér `deriveBbrSummary` i `src/integrations/bbr/client.ts`**

Find og erstat `export class BbrService` med dette — tilføj `deriveBbrSummary` OVEN OVER klassen:

```typescript
// ---------------------------------------------------------------------------
// Aggregeringskonstanter og -helper — ARCH-227
// ---------------------------------------------------------------------------

const SECONDARY_CODES = new Set(["910", "920", "930", "940"]);

/**
 * Aggregerer BBR-bygningsliste til compliance-summary.
 * Eksporteret for testbarhed uden netværk.
 *
 * - bebygget_areal: sum af ikke-sekundære bygningers footprint (byg041)
 * - fredet: true hvis NOGEN bygning har byg070Fredning != null/"0"/""
 * - primærBygning: første ikke-sekundære bygning (til UI-felter som byggeår, materiale)
 */
export function deriveBbrSummary(bygninger: any[]): {
  primærBygning: any | null;
  bebygget_areal: number | null;
  fredet: boolean | null;
} {
  if (!bygninger.length) {
    return { primærBygning: null, bebygget_areal: null, fredet: null };
  }

  const primærBygning =
    bygninger.find((b) => !SECONDARY_CODES.has(b.byg021BygningensAnvendelse ?? "")) ?? bygninger[0];

  // Deduplicer på id_lokalId før aggregering
  const seen = new Set<string>();
  const unikke = bygninger.filter((b) => {
    const id = b.id_lokalId as string | null;
    if (!id || seen.has(id)) return false;
    seen.add(id);
    return true;
  });

  // Sum footprint for alle ikke-sekundære bygninger (ARCH-227)
  const relevante = unikke.filter((b) => !SECONDARY_CODES.has(b.byg021BygningensAnvendelse ?? ""));
  const footprints = relevante
    .map((b) => b.byg041BebyggetAreal as number | undefined)
    .filter((a): a is number => a != null);
  const bebygget_areal = footprints.length > 0 ? footprints.reduce((s, a) => s + a, 0) : null;

  // fredet = true hvis NOGEN bygning har fredning sat (ARCH-227)
  const fredningsValues = unikke.map(
    (b) => (b.byg070Fredning as string | null | undefined) ?? null,
  );
  const hasAnyExplicitValue = fredningsValues.some((v) => v !== null);
  const fredet = hasAnyExplicitValue
    ? fredningsValues.some((v) => v !== null && v !== "0" && v !== "")
    : null;

  return { primærBygning, bebygget_areal, fredet };
}
```

- [ ] **Step 1.4: Brug `deriveBbrSummary` i `getKompliantData`**

I `BbrService.getKompliantData`, find den sektion der starter med `// 1. Find primær bygning` og erstat frem til (men ikke inkl. `const alle_bygning_lokal_ids`) med:

```typescript
// 1–2. Aggregér bygningsliste (ARCH-227)
const { primærBygning, bebygget_areal, fredet } = deriveBbrSummary(bygninger);

if (!primærBygning) {
  return this.getEmptyData("Ingen bygning fundet på adressen");
}

// 3. Bebyggelsesprocent (kræver grundareal)
let bebyggelsesprocent: number | null = null;
if (bebygget_areal && grundareal && grundareal > 0) {
  bebyggelsesprocent = Math.round((bebygget_areal / grundareal) * 1000) / 10;
}
```

Fjern de to separate linjer:

```typescript
const bebygget_areal: number | null = primærBygning.byg041BebyggetAreal ?? null;
// ...
const fredning_raw: string | null = primærBygning.byg070Fredning ?? null;
```

og linjen:

```typescript
        fredet: fredning_raw !== null ? fredning_raw !== "0" && fredning_raw !== "" : null,
```

Erstat med:

```typescript
        fredet,
```

- [ ] **Step 1.5: Kør tests — forvent PASS**

```bash
bun test src/integrations/bbr/bbr.test.ts
```

Forventet: alle tests grønne.

- [ ] **Step 1.6: Typecheck og commit**

```bash
bunx tsc --noEmit
git add src/integrations/bbr/client.ts src/integrations/bbr/bbr.test.ts
git commit -m "fix(ARCH-227): BBR bebygget_areal aggregeres fra alle ikke-sekundære bygninger, fredet aggregeres fra alle"
```

---

## Task 2: Plandata determinism (ARCH-228)

**Files:**

- Modify: `src/integrations/plandata/client.ts`
- Modify: `src/integrations/plandata/client.test.ts`
- Modify: `src/lib/analysis-orchestrator.ts` 🔒

- [ ] **Step 2.1: Tilføj tests for selektorer**

Tilføj til `src/integrations/plandata/client.test.ts`:

```typescript
import { selectKommuneplanrammeForCompliance, selectPrimaryLokalplanForPdf } from "./client";
import type { Kommuneplanramme, Lokalplan } from "./client";

describe("selectKommuneplanrammeForCompliance (ARCH-228)", () => {
  const ramme = (bebygpct: number | null, maxetager: number | null = null): Kommuneplanramme => ({
    planid: String(bebygpct),
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

  it("returnerer null for tom liste", () => {
    expect(selectKommuneplanrammeForCompliance([])).toBeNull();
  });

  it("returnerer eneste ramme direkte", () => {
    const r = ramme(30);
    expect(selectKommuneplanrammeForCompliance([r])).toBe(r);
  });

  it("vælger laveste bebygpct uanset rækkefølge", () => {
    const a = ramme(30);
    const b = ramme(25);
    expect(selectKommuneplanrammeForCompliance([a, b])!.bebygpct).toBe(25);
    expect(selectKommuneplanrammeForCompliance([b, a])!.bebygpct).toBe(25);
  });

  it("bruger maxetager som tiebreaker ved ens bebygpct", () => {
    const a = ramme(30, 2);
    const b = ramme(30, 3);
    expect(selectKommuneplanrammeForCompliance([a, b])!.maxetager).toBe(2);
  });

  it("null bebygpct taber for ikke-null", () => {
    const a = ramme(null);
    const b = ramme(30);
    expect(selectKommuneplanrammeForCompliance([a, b])!.bebygpct).toBe(30);
  });
});

describe("selectPrimaryLokalplanForPdf (ARCH-228)", () => {
  const lp = (
    status: string | null,
    datoVedtaget: string | null = null,
    planid = "1",
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

  it("returnerer null for tom liste", () => {
    expect(selectPrimaryLokalplanForPdf([])).toBeNull();
  });

  it("vedtaget vælges over forslag", () => {
    const vedtaget = lp("V", "20200101", "vedtaget");
    const forslag = lp("F", "20221201", "forslag");
    expect(selectPrimaryLokalplanForPdf([forslag, vedtaget])!.planid).toBe("vedtaget");
  });

  it("nyeste vedtagne vælges ved to vedtagne", () => {
    const gammel = lp("V", "20180101", "gammel");
    const ny = lp("V", "20220101", "ny");
    expect(selectPrimaryLokalplanForPdf([gammel, ny])!.planid).toBe("ny");
  });

  it("forslag bevares i originallisten — selectPrimary muterer ikke listen", () => {
    const liste = [lp("F", "20221201", "forslag"), lp("V", "20200101", "vedtaget")];
    selectPrimaryLokalplanForPdf(liste);
    expect(liste).toHaveLength(2);
  });
});
```

- [ ] **Step 2.2: Kør tests — forvent FAIL**

```bash
bun test src/integrations/plandata/client.test.ts
```

- [ ] **Step 2.3: Implementér selektorer i `src/integrations/plandata/client.ts`**

Tilføj EFTER de eksisterende typer (efter `PlandataResult`), INDEN `WFS_BASE`:

```typescript
// ---------------------------------------------------------------------------
// Compliance-selektorer — ARCH-228
// ---------------------------------------------------------------------------

/**
 * Vælger den mest restriktive kommuneplanramme til compliance-beregning.
 * Sorterer på laveste bebygpct → laveste maxetager → laveste maxbygnhjd.
 * Null-værdier taber for eksplicitte værdier.
 */
export function selectKommuneplanrammeForCompliance(
  rammer: Kommuneplanramme[],
): Kommuneplanramme | null {
  if (!rammer.length) return null;
  if (rammer.length === 1) return rammer[0];
  return [...rammer].sort((a, b) => {
    const pctA = a.bebygpct ?? Infinity;
    const pctB = b.bebygpct ?? Infinity;
    if (pctA !== pctB) return pctA - pctB;
    const etA = a.maxetager ?? Infinity;
    const etB = b.maxetager ?? Infinity;
    if (etA !== etB) return etA - etB;
    return (a.maxbygnhjd ?? Infinity) - (b.maxbygnhjd ?? Infinity);
  })[0];
}

/**
 * Vælger primær lokalplan til PDF-analyse.
 * Vedtagne (status="V") prioriteres over forslag.
 * Inden for samme status vælges nyeste datoVedtaget.
 */
export function selectPrimaryLokalplanForPdf(lokalplaner: Lokalplan[]): Lokalplan | null {
  if (!lokalplaner.length) return null;
  return [...lokalplaner].sort((a, b) => {
    const aScore = a.status === "V" ? 0 : 1;
    const bScore = b.status === "V" ? 0 : 1;
    if (aScore !== bScore) return aScore - bScore;
    return (b.datoVedtaget ?? "0").localeCompare(a.datoVedtaget ?? "0");
  })[0];
}
```

- [ ] **Step 2.4: Ret `getKommuneplanrammeForKoordinat` til at hente op til 10 og bruge selector**

Find `getKommuneplanrammeForKoordinat` og erstat hele metoden:

```typescript
  static async getKommuneplanrammeForKoordinat(
    lngWgs84: number,
    latWgs84: number,
  ): Promise<{ ramme: Kommuneplanramme | null; fejl: string | null }> {
    if (!lngWgs84 || !latWgs84) {
      return { ramme: null, fejl: "Koordinater mangler" };
    }

    try {
      const res = await fetchWithRetry(
        buildWfsUrl(KOMMUNEPLANRAMME_TYPE, lngWgs84, latWgs84, 10),
        { headers: { Accept: "application/json" } },
        WFS_RETRY,
      );

      if (!res.ok) {
        throw new Error(`Plandata WFS HTTP ${res.status}`);
      }

      const json = (await res.json()) as any;
      const features: any[] = json?.features ?? [];

      if (!features.length) {
        return { ramme: null, fejl: "Ingen kommuneplanramme fundet" };
      }

      const rammer = features.map(mapKommuneplanramme);
      return { ramme: selectKommuneplanrammeForCompliance(rammer), fejl: null };
    } catch (e) {
      console.error("[Plandata] Kommuneplanramme-kald fejlede:", e);
      return { ramme: null, fejl: (e as Error).message };
    }
  }
```

- [ ] **Step 2.5: Ret orchestrator til at bruge `selectPrimaryLokalplanForPdf`**

I `src/lib/analysis-orchestrator.ts`, find linjen:

```typescript
const primaryPdfUrl = complianceBase.lokalplaner[0]?.plandokumentLink ?? null;
```

Erstat med:

```typescript
const { selectPrimaryLokalplanForPdf } = await import("@/integrations/plandata/client");
const primaryLokalplan = selectPrimaryLokalplanForPdf(complianceBase.lokalplaner);
const primaryPdfUrl = primaryLokalplan?.plandokumentLink ?? null;
```

Find linjen:

```typescript
sitePatch.source_lokalplan_id = patch.lokalplaner[0]?.planid ?? null;
```

og erstat med:

```typescript
const { selectPrimaryLokalplanForPdf: selectLp } = await import("@/integrations/plandata/client");
sitePatch.source_lokalplan_id = selectLp(patch.lokalplaner)?.planid ?? null;
```

- [ ] **Step 2.6: Kør tests og typecheck — forvent PASS**

```bash
bun test src/integrations/plandata/client.test.ts
bunx tsc --noEmit
```

- [ ] **Step 2.7: Commit**

```bash
git add src/integrations/plandata/client.ts src/integrations/plandata/client.test.ts src/lib/analysis-orchestrator.ts
git commit -m "fix(ARCH-228): plandata-selektorer — deterministisk kommuneplanramme og lokalplan-PDF"
```

---

## Task 3: DAWA-rensning og dokumentation (ARCH-226)

**Files:**

- Modify: `src/integrations/bbr/neighbor-client.ts`
- Modify: `CLAUDE.md` 🔒

- [ ] **Step 3.1: Deaktivér DAWA-kald i `neighbor-client.ts`**

Åbn `src/integrations/bbr/neighbor-client.ts`. Find den eksporterede funktion der kalder `dawa.aws.dk` og erstat hele function body med:

```typescript
// ARCH-226: dawa.aws.dk er forbudt (DAWA er udfaset). Naboopslag er deaktiveret
// indtil en godkendt Datafordeler-kilde til naboer inden for radius er tilgængelig.
// Se https://linear.app/archai-design-partner/issue/ARCH-226
return [];
```

Bevar funktionssignatur og eksport intakt så opkaldere ikke fejler.

- [ ] **Step 3.2: Tilføj arkitekturbeslutninger til CLAUDE.md**

Find sektionen `**FORBUDT: DAWA / api.dataforsyningen.dk**` og erstat:

```markdown
**FORBUDT: DAWA / api.dataforsyningen.dk**
DAWA (Danmarks Adressers Web API) er udfaset og lukker. Brug aldrig `api.dataforsyningen.dk` — hverken som primær kilde eller fallback til compliance-/registerdata. Al adresse- og matrikeldata hentes udelukkende fra Datafordeler (DAR, MAT, BBR).

**Godkendte undtagelser (ARCH-226):**

- `GSearch v2` (`api.dataforsyningen.dk/rest/gsearch/v2.0`): Tilladt som søge-UX til adresse-autocomplete. Bruges IKKE som compliance-kilde — alt compliance-data hentes fra Datafordeler.
- `Skærmkort WMTS` (`api.dataforsyningen.dk/...wmts`): Tilladt som baggrundskort-tiles. Geometri er ikke compliance-data.

**Fallback-regel for grundareal (ARCH-222 option B):** Hvis `ejerlavskode`/`matrikelnummer` mangler eller MAT returnerer null, SKAL `GrundarealResolver` bruges som fallback (DAR → EBR/BFE/SFE → MAT_Ejerlejlighed → BBR). Ingen fallback til DAWA. Se `src/integrations/mat/grundareal-resolver.ts`.

**Naboopslag:** `neighbor-client.ts` returnerer tom liste — ingen godkendt Datafordeler-kilde til radius-naboer eksisterer endnu.
```

- [ ] **Step 3.3: Kør lint og commit**

```bash
bunx eslint src/integrations/bbr/neighbor-client.ts
bunx tsc --noEmit
git add src/integrations/bbr/neighbor-client.ts CLAUDE.md
git commit -m "fix(ARCH-226): deaktivér DAWA neighbor-kald, dokumentér GSearch+WMTS undtagelser i CLAUDE.md"
```

---

## Task 4: GrundarealResolver (ARCH-222+223)

**Files:**

- Create: `src/integrations/mat/grundareal-resolver.ts`
- Create: `src/integrations/mat/grundareal-resolver.test.ts`
- Modify: `src/lib/compliance-layer1.ts`
- Modify: `src/lib/pre-check-adresse.ts` 🔒
- Modify: `src/integrations/bbr/client.ts` — tilføj `jordstykke_lokal_id` til type

- [ ] **Step 4.1: Tilføj `jordstykke_lokal_id` til `BbrKompliantData`**

I `src/integrations/bbr/client.ts`, find type `BbrKompliantData` og tilføj efter `alle_bbr_public_ids`:

```typescript
jordstykke_lokal_id: string | null; // primær MAT_Jordstykke id_lokalId (ARCH-223)
```

Tilføj `jordstykke_lokal_id: null` til `getEmptyData` returnobjektet.

- [ ] **Step 4.2: Skriv tests for GrundarealResolver**

Opret `src/integrations/mat/grundareal-resolver.test.ts`:

```typescript
import { describe, it, expect, mock, beforeEach } from "bun:test";
import { GrundarealResolver } from "./grundareal-resolver";

const MOCK_CONFIG = {
  apiKey: "test",
  ebrEndpoint: "https://ebr.test",
  matEndpoint: "https://mat.test",
};

function mockFetchSequence(jsonResponses: any[]) {
  let i = 0;
  globalThis.fetch = mock(async () => {
    const json = jsonResponses[i++] ?? { data: {} };
    return {
      ok: true,
      status: 200,
      headers: { get: () => null },
      text: async () => JSON.stringify(json),
    } as unknown as Response;
  }) as any;
}

beforeEach(() => {
  globalThis.fetch = fetch;
});

describe("GrundarealResolver (ARCH-223)", () => {
  it("route 2: EBR husnummer → SFE → jordstykker giver korrekt grundareal", async () => {
    // Svar: 1) EBR husnummer → BFE, 2) MAT SFE → id_lokalId, 3) MAT Jordstykke
    mockFetchSequence([
      { data: { EBR_Ejendomsbeliggenhed: { nodes: [{ bestemtFastEjendomBFENr: "2073922" }] } } },
      { data: { MAT_SamletFastEjendom: { nodes: [{ id_lokalId: "sfe-123" }] } } },
      {
        data: {
          MAT_Jordstykke: {
            nodes: [
              {
                id_lokalId: "js-1",
                matrikelnummer: "48a",
                ejerlavLokalId: "ejl-1",
                registreretAreal: 441,
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
      {
        adgangsadresseid: "0a3f507d-4cf9-32b8-e044-0003ba298018",
        adresseid: "0a3f50a6-34da-32b8-e044-0003ba298018",
      },
      MOCK_CONFIG,
    );

    expect(result.grundareal).toBe(441);
    expect(result.source).toBe("ebr_husnummer_sfe");
    expect(result.bfeNr).toBe("2073922");
    expect(result.fejl).toBeNull();
  });

  it("route 2: summerer grundareal fra flere jordstykker under samme SFE", async () => {
    mockFetchSequence([
      { data: { EBR_Ejendomsbeliggenhed: { nodes: [{ bestemtFastEjendomBFENr: "9999" }] } } },
      { data: { MAT_SamletFastEjendom: { nodes: [{ id_lokalId: "sfe-multi" }] } } },
      {
        data: {
          MAT_Jordstykke: {
            nodes: [
              {
                id_lokalId: "js-1",
                matrikelnummer: "1a",
                ejerlavLokalId: "e1",
                registreretAreal: 300,
                strandbeskyttelse_omfang: null,
                fredskov_omfang: null,
                klitfredning_omfang: null,
              },
              {
                id_lokalId: "js-2",
                matrikelnummer: "1b",
                ejerlavLokalId: "e1",
                registreretAreal: 141,
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
      { adgangsadresseid: "addr-1", adresseid: "adr-1" },
      MOCK_CONFIG,
    );
    expect(result.grundareal).toBe(441);
  });

  it("route 3: EBR adresse → MAT_Ejerlejlighed → SFE → jordstykker", async () => {
    mockFetchSequence([
      // Route 2 husnummer: ingen BFE
      { data: { EBR_Ejendomsbeliggenhed: { nodes: [] } } },
      // Route 3 adresse: BFE 289814
      { data: { EBR_Ejendomsbeliggenhed: { nodes: [{ bestemtFastEjendomBFENr: "289814" }] } } },
      // MAT_Ejerlejlighed → samletFastEjendomLokalId
      { data: { MAT_Ejerlejlighed: { nodes: [{ samletFastEjendomLokalId: "sfe-parent" }] } } },
      // MAT_Jordstykke
      {
        data: {
          MAT_Jordstykke: {
            nodes: [
              {
                id_lokalId: "js-ej",
                matrikelnummer: "10st",
                ejerlavLokalId: "e2",
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
      { adgangsadresseid: "addr-ost", adresseid: "adr-ost" },
      MOCK_CONFIG,
    );

    expect(result.grundareal).toBe(3580);
    expect(result.source).toBe("ebr_adresse_ejerlejlighed");
    expect(result.samletFastEjendomLokalId).toBe("sfe-parent");
  });

  it("returnerer fejl når ingen ruter finder data", async () => {
    mockFetchSequence([
      { data: { EBR_Ejendomsbeliggenhed: { nodes: [] } } },
      { data: { EBR_Ejendomsbeliggenhed: { nodes: [] } } },
    ]);

    const result = await GrundarealResolver.resolve(
      { adgangsadresseid: "ingen", adresseid: "ingen" },
      MOCK_CONFIG,
    );

    expect(result.grundareal).toBeNull();
    expect(result.fejl).toBeTruthy();
  });

  it("strandbeskyttelse = true når omfang er ikke-null/ikke-Ingen", async () => {
    mockFetchSequence([
      { data: { EBR_Ejendomsbeliggenhed: { nodes: [{ bestemtFastEjendomBFENr: "1111" }] } } },
      { data: { MAT_SamletFastEjendom: { nodes: [{ id_lokalId: "sfe-s" }] } } },
      {
        data: {
          MAT_Jordstykke: {
            nodes: [
              {
                id_lokalId: "js-s",
                matrikelnummer: "1a",
                ejerlavLokalId: "e1",
                registreretAreal: 500,
                strandbeskyttelse_omfang: "Hele arealet",
                fredskov_omfang: null,
                klitfredning_omfang: null,
              },
            ],
          },
        },
      },
    ]);

    const result = await GrundarealResolver.resolve(
      { adgangsadresseid: "a1", adresseid: "a2" },
      MOCK_CONFIG,
    );

    expect(result.jordstykker[0].strandbeskyttelse).toBe(true);
  });
});
```

- [ ] **Step 4.3: Kør tests — forvent FAIL**

```bash
bun test src/integrations/mat/grundareal-resolver.test.ts
```

- [ ] **Step 4.4: Implementér `GrundarealResolver`**

Opret `src/integrations/mat/grundareal-resolver.ts`:

```typescript
// SERVER-SIDE ONLY — credentials must never be exposed to the browser.
//
// GrundarealResolver — Datafordeler-only fallback-ruter for grundareal.
// Implementerer ARCH-222 option B: EBR/SFE → MAT_Ejerlejlighed → BBR.
// Bruges fra compliance-layer1 når ejerlavskode/matrikelnummer mangler eller
// MatService.getGrundareal returnerer null.
//
// Rute-rækkefølge:
//   1. ebr_husnummer_sfe: EBR.husnummerLokalId → BFE → MAT_SFE → jordstykker
//   2. ebr_adresse_ejerlejlighed: EBR.adresseLokalId → BFE → MAT_Ejerlejlighed → SFE → jordstykker

import { getEnvRequired, getEnvOptional } from "@/lib/env";
import { fetchWithRetry } from "@/integrations/http/fetch-with-retry";
import { currentBitemporalArgs } from "@/integrations/datafordeler/bitemporal";
import type { AnalysisTraceContext } from "@/lib/analysis-tracing";

// ---------------------------------------------------------------------------
// Output-typer
// ---------------------------------------------------------------------------

export type GrundarealSource = "ebr_husnummer_sfe" | "ebr_adresse_ejerlejlighed";

export type GrundarealJordstykke = {
  id_lokalId: string;
  matrikelnummer: string | null;
  ejerlavLokalId: string | null;
  registreretAreal: number;
  strandbeskyttelse: boolean | null;
  fredskov: boolean | null;
  klitfredning: boolean | null;
};

export type GrundarealResolution = {
  grundareal: number | null;
  source: GrundarealSource | null;
  bfeNr: string | null;
  samletFastEjendomLokalId: string | null;
  jordstykker: GrundarealJordstykke[];
  fejl: string | null;
};

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

type ResolverConfig = {
  apiKey?: string;
  ebrEndpoint?: string;
  matEndpoint?: string;
};

function getConfig(explicit?: ResolverConfig) {
  return {
    apiKey: explicit?.apiKey ?? getEnvRequired("DATAFORDELER_API_KEY"),
    ebrEndpoint:
      explicit?.ebrEndpoint ??
      getEnvOptional("DATAFORDELER_EBR_ENDPOINT") ??
      "https://graphql.datafordeler.dk/EBR/v1",
    matEndpoint:
      explicit?.matEndpoint ??
      getEnvOptional("DATAFORDELER_MAT_ENDPOINT") ??
      "https://graphql.datafordeler.dk/MAT/v2",
  };
}

// ---------------------------------------------------------------------------
// GraphQL-kald
// ---------------------------------------------------------------------------

async function gqlFetch(
  endpoint: string,
  apiKey: string,
  query: string,
  variables: Record<string, unknown>,
  trace?: AnalysisTraceContext | null,
): Promise<any> {
  const url = new URL(endpoint);
  url.searchParams.set("apiKey", apiKey);
  const res = await fetchWithRetry(
    url.toString(),
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, variables }),
    },
    { timeoutMs: 12_000 },
    {
      trace,
      service: "GrundarealResolver",
      operation: query.split("(")[0].replace(/\s+/g, ""),
      phase: "layer1",
    },
  );
  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
  const parsed = JSON.parse(text);
  if (parsed.errors?.length) throw new Error(parsed.errors[0].message);
  return parsed.data;
}

// ---------------------------------------------------------------------------
// GraphQL-queries
// ---------------------------------------------------------------------------

const EBR_BY_HUSNUMMER = `
query GrundarealEbrHusnummer($husnummerLokalId: String!, $virkningstid: DafDateTime!, $registreringstid: DafDateTime!) {
  EBR_Ejendomsbeliggenhed(
    where: { husnummerLokalId: { eq: $husnummerLokalId } }
    virkningstid: $virkningstid
    registreringstid: $registreringstid
    first: 1
  ) {
    nodes { bestemtFastEjendomBFENr }
  }
}`;

const EBR_BY_ADRESSE = `
query GrundarealEbrAdresse($adresseLokalId: String!, $virkningstid: DafDateTime!, $registreringstid: DafDateTime!) {
  EBR_Ejendomsbeliggenhed(
    where: { adresseLokalId: { eq: $adresseLokalId } }
    virkningstid: $virkningstid
    registreringstid: $registreringstid
    first: 1
  ) {
    nodes { bestemtFastEjendomBFENr }
  }
}`;

const MAT_SFE_BY_BFE = `
query GrundarealSfe($bfe: String!, $virkningstid: DafDateTime!, $registreringstid: DafDateTime!) {
  MAT_SamletFastEjendom(
    where: { BFEnummer: { eq: $bfe } }
    virkningstid: $virkningstid
    registreringstid: $registreringstid
    first: 1
  ) {
    nodes { id_lokalId BFEnummer }
  }
}`;

const MAT_EJERLEJLIGHED_BY_BFE = `
query GrundarealEjerlejlighed($bfe: String!, $virkningstid: DafDateTime!, $registreringstid: DafDateTime!) {
  MAT_Ejerlejlighed(
    where: { BFEnummer: { eq: $bfe } }
    virkningstid: $virkningstid
    registreringstid: $registreringstid
    first: 1
  ) {
    nodes { BFEnummer samletFastEjendomLokalId }
  }
}`;

const MAT_JORDSTYKKER_BY_SFE = `
query GrundarealJordstykker($sfeLokalId: String!, $virkningstid: DafDateTime!, $registreringstid: DafDateTime!) {
  MAT_Jordstykke(
    where: { samletFastEjendomLokalId: { eq: $sfeLokalId } }
    virkningstid: $virkningstid
    registreringstid: $registreringstid
    first: 20
  ) {
    nodes {
      id_lokalId
      matrikelnummer
      ejerlavLokalId
      registreretAreal
      strandbeskyttelse_omfang
      fredskov_omfang
      klitfredning_omfang
    }
  }
}`;

// ---------------------------------------------------------------------------
// Hjælpere
// ---------------------------------------------------------------------------

function mapJordstykker(nodes: any[]): GrundarealJordstykke[] {
  const seen = new Set<string>();
  return nodes
    .filter((n) => {
      if (!n.id_lokalId || seen.has(n.id_lokalId)) return false;
      seen.add(n.id_lokalId);
      return true;
    })
    .map((n) => ({
      id_lokalId: n.id_lokalId,
      matrikelnummer: n.matrikelnummer ?? null,
      ejerlavLokalId: n.ejerlavLokalId ?? null,
      registreretAreal: n.registreretAreal ?? 0,
      strandbeskyttelse: parseOmfang(n.strandbeskyttelse_omfang),
      fredskov: parseOmfang(n.fredskov_omfang),
      klitfredning: parseOmfang(n.klitfredning_omfang),
    }));
}

function parseOmfang(omfang: string | null | undefined): boolean | null {
  if (omfang == null) return null;
  const s = omfang.trim();
  return s !== "" && s !== "Ingen" ? true : false;
}

function sumAreal(jordstykker: GrundarealJordstykke[]): number | null {
  if (!jordstykker.length) return null;
  return jordstykker.reduce((s, j) => s + j.registreretAreal, 0);
}

// ---------------------------------------------------------------------------
// GrundarealResolver
// ---------------------------------------------------------------------------

export class GrundarealResolver {
  /**
   * Resolver-rækkefølge (ARCH-222 option B):
   *   1. EBR husnummer → MAT SFE → jordstykker
   *   2. EBR adresse → MAT Ejerlejlighed → SFE → jordstykker
   */
  static async resolve(
    input: { adgangsadresseid: string; adresseid: string },
    config?: ResolverConfig,
    trace?: AnalysisTraceContext | null,
  ): Promise<GrundarealResolution> {
    const { apiKey, ebrEndpoint, matEndpoint } = getConfig(config);
    const bitemporalArgs = currentBitemporalArgs();

    // Rute 1: EBR husnummer → MAT SFE
    try {
      const ebrData = await gqlFetch(
        ebrEndpoint,
        apiKey,
        EBR_BY_HUSNUMMER,
        {
          husnummerLokalId: input.adgangsadresseid,
          ...bitemporalArgs,
        },
        trace,
      );
      const bfeNr: string | null =
        ebrData?.EBR_Ejendomsbeliggenhed?.nodes?.[0]?.bestemtFastEjendomBFENr ?? null;

      if (bfeNr) {
        const sfeData = await gqlFetch(
          matEndpoint,
          apiKey,
          MAT_SFE_BY_BFE,
          { bfe: bfeNr, ...bitemporalArgs },
          trace,
        );
        const sfeLokalId: string | null =
          sfeData?.MAT_SamletFastEjendom?.nodes?.[0]?.id_lokalId ?? null;

        if (sfeLokalId) {
          const jsData = await gqlFetch(
            matEndpoint,
            apiKey,
            MAT_JORDSTYKKER_BY_SFE,
            { sfeLokalId, ...bitemporalArgs },
            trace,
          );
          const jordstykker = mapJordstykker(jsData?.MAT_Jordstykke?.nodes ?? []);
          const grundareal = sumAreal(jordstykker);
          if (grundareal !== null) {
            return {
              grundareal,
              source: "ebr_husnummer_sfe",
              bfeNr,
              samletFastEjendomLokalId: sfeLokalId,
              jordstykker,
              fejl: null,
            };
          }
        }
      }
    } catch (e) {
      console.warn("[GrundarealResolver] Rute 1 (EBR husnummer) fejlede:", (e as Error).message);
    }

    // Rute 2: EBR adresse → MAT Ejerlejlighed → SFE
    try {
      const ebrData = await gqlFetch(
        ebrEndpoint,
        apiKey,
        EBR_BY_ADRESSE,
        {
          adresseLokalId: input.adresseid,
          ...bitemporalArgs,
        },
        trace,
      );
      const bfeNr: string | null =
        ebrData?.EBR_Ejendomsbeliggenhed?.nodes?.[0]?.bestemtFastEjendomBFENr ?? null;

      if (bfeNr) {
        const ejData = await gqlFetch(
          matEndpoint,
          apiKey,
          MAT_EJERLEJLIGHED_BY_BFE,
          { bfe: bfeNr, ...bitemporalArgs },
          trace,
        );
        const sfeLokalId: string | null =
          ejData?.MAT_Ejerlejlighed?.nodes?.[0]?.samletFastEjendomLokalId ?? null;

        if (sfeLokalId) {
          const jsData = await gqlFetch(
            matEndpoint,
            apiKey,
            MAT_JORDSTYKKER_BY_SFE,
            { sfeLokalId, ...bitemporalArgs },
            trace,
          );
          const jordstykker = mapJordstykker(jsData?.MAT_Jordstykke?.nodes ?? []);
          const grundareal = sumAreal(jordstykker);
          if (grundareal !== null) {
            return {
              grundareal,
              source: "ebr_adresse_ejerlejlighed",
              bfeNr,
              samletFastEjendomLokalId: sfeLokalId,
              jordstykker,
              fejl: null,
            };
          }
        }
      }
    } catch (e) {
      console.warn("[GrundarealResolver] Rute 2 (EBR adresse) fejlede:", (e as Error).message);
    }

    return {
      grundareal: null,
      source: null,
      bfeNr: null,
      samletFastEjendomLokalId: null,
      jordstykker: [],
      fejl: "GrundarealResolver: ingen af ruterne fandt grundareal",
    };
  }
}
```

- [ ] **Step 4.5: Kør resolver-tests — forvent PASS**

```bash
bun test src/integrations/mat/grundareal-resolver.test.ts
```

- [ ] **Step 4.6: Wire GrundarealResolver i `compliance-layer1.ts` som fallback**

I `src/lib/compliance-layer1.ts`, find `fetchBbrWithMat` og erstat `else if (!ejerlavskode || !matrikelnummer)` blokken med:

```typescript
    } else {
      // Mangler ejerlavskode/matrikelnummer — forsøg GrundarealResolver (ARCH-222 option B)
      try {
        const { GrundarealResolver } = await import("@/integrations/mat/grundareal-resolver");
        const resolved = await GrundarealResolver.resolve(
          { adgangsadresseid: input.adgangsadresseid, adresseid: (input as any).adresseid ?? "" },
          undefined,
          input.trace,
        );
        if (resolved.grundareal !== null) {
          grundareal = resolved.grundareal;
          mat_strandbeskyttelse = resolved.jordstykker.some((j) => j.strandbeskyttelse);
          mat_fredskov = resolved.jordstykker.some((j) => j.fredskov);
          mat_klitfredning = resolved.jordstykker.some((j) => j.klitfredning);
          // Gem primær jordstykke-ID til MatrikelMap (ARCH-229)
          (input as any)._jordstykkeLokalId = resolved.jordstykker[0]?.id_lokalId ?? null;
        } else {
          console.warn("[Layer1] GrundarealResolver fejlede:", resolved.fejl);
        }
      } catch (e) {
        console.warn("[Layer1] GrundarealResolver exception:", (e as Error).message);
      }
    }
```

Og efter `const bbr = await BbrService.getKompliantData(...)`, tilføj:

```typescript
// Sæt jordstykke_lokal_id fra MAT (primær jordstykke ID til geometriplot)
const jordstykkeLokalId: string | null = (input as any)._jordstykkeLokalId ?? null;
return {
  ...bbr,
  mat_strandbeskyttelse,
  mat_fredskov,
  mat_klitfredning,
  jordstykke_lokal_id: jordstykkeLokalId,
};
```

OBS: `Layer1Input` skal udvides med `adresseid?: string` — tilføj dette felt til typen.

- [ ] **Step 4.7: Wire GrundarealResolver i `pre-check-adresse.ts`**

Find `fetchBbrWithMat` kald i `pre-check-adresse.ts` og sørg for at `adresseid` sendes med som del af input. Eksisterende `preCheckSchema` har allerede `adresseid` — tilføj det til kaldet:

```typescript
      fetchBbrWithMat({
        adgangsadresseid: data.adgangsadresseid,
        adresseid: data.adresseid,
        ejerlavskode: data.ejerlavskode,
        matrikelnummer: data.matrikelnummer,
        grundareal: data.grundareal ?? null,
        trace,
      }),
```

- [ ] **Step 4.8: Kør alle tests og typecheck**

```bash
bun test
bunx tsc --noEmit
```

- [ ] **Step 4.9: Commit**

```bash
git add src/integrations/mat/grundareal-resolver.ts src/integrations/mat/grundareal-resolver.test.ts src/integrations/bbr/client.ts src/lib/compliance-layer1.ts src/lib/pre-check-adresse.ts
git commit -m "feat(ARCH-223): GrundarealResolver — Datafordeler-only EBR/SFE/Ejerlejlighed fallback for grundareal"
```

---

## Task 5: EBR dual-mode og BFE-persistens (ARCH-225)

**Files:**

- Modify: `src/integrations/ebr/client.ts`
- Modify: `src/integrations/ebr/ebr.test.ts`
- Modify: `src/integrations/supabase/project-persistence.ts` 🔒

- [ ] **Step 5.1: Skriv test for EBR adresseLokalId**

Tilføj til `src/integrations/ebr/ebr.test.ts`:

```typescript
import { EbrService } from "./client";
// ... eksisterende beforeEach/mockFetch helpers antages tilgængelige

describe("EbrService.getBfeNrByAdresse (ARCH-225)", () => {
  it("finder BFE via adresseLokalId (ejerlejlighed)", async () => {
    mockFetch([
      {
        json: {
          data: { EBR_Ejendomsbeliggenhed: { nodes: [{ bestemtFastEjendomBFENr: "289814" }] } },
        },
      },
    ]);
    const result = await EbrService.getBfeNrByAdresse("some-adresse-id", MOCK_CONFIG);
    expect(result.bfeNr).toBe("289814");
    expect(result.fejl).toBeNull();
  });

  it("returnerer null + fejl når ingen EBR-node", async () => {
    mockFetch([{ json: { data: { EBR_Ejendomsbeliggenhed: { nodes: [] } } } }]);
    const result = await EbrService.getBfeNrByAdresse("ingen-id", MOCK_CONFIG);
    expect(result.bfeNr).toBeNull();
    expect(result.fejl).toBeTruthy();
  });
});
```

- [ ] **Step 5.2: Kør test — forvent FAIL**

```bash
bun test src/integrations/ebr/ebr.test.ts
```

- [ ] **Step 5.3: Tilføj `getBfeNrByAdresse` til EBR client**

I `src/integrations/ebr/client.ts`, tilføj ny query EFTER `BELIGGENHED_QUERY`:

```typescript
const BELIGGENHED_ADRESSE_QUERY = `
query GetEjendomsbeliggenhedByAdresse($adresseLokalId: String!, $virkningstid: DafDateTime!, $registreringstid: DafDateTime!) {
  EBR_Ejendomsbeliggenhed(
    where: { adresseLokalId: { eq: $adresseLokalId } }
    virkningstid: $virkningstid
    registreringstid: $registreringstid
    first: 1
  ) {
    nodes {
      bestemtFastEjendomBFENr
      adresseLokalId
      id_lokalId
    }
  }
}`;
```

Og tilføj ny statisk metode til `EbrService`:

```typescript
  /**
   * Slår BFE-nummer op via DAR_Adresse.id_lokalId (= adresselokalId).
   * Bruges til ejerlejligheder hvor adresseLokalId giver ejerlejlighedens BFE.
   *
   * @param adresseLokalId  DAR_Adresse.id_lokalId (= adresseid i vores system)
   */
  static async getBfeNrByAdresse(
    adresseLokalId: string,
    config?: EbrClientConfig,
    trace?: AnalysisTraceContext | null,
  ): Promise<EbrResult> {
    const id = adresseLokalId.trim();
    if (!id) return { bfeNr: null, fejl: "adresseLokalId er påkrævet" };

    try {
      const { apiKey, endpoint } = getConfig(config);
      const url = new URL(endpoint);
      url.searchParams.set("apiKey", apiKey);
      const data = await gqlFetch(url, BELIGGENHED_ADRESSE_QUERY, { adresseLokalId: id, ...currentBitemporalArgs() }, trace);
      const nodes: any[] = data?.EBR_Ejendomsbeliggenhed?.nodes ?? [];

      if (!nodes.length) {
        return { bfeNr: null, fejl: `EBR_Ejendomsbeliggenhed ikke fundet for adresseLokalId ${id}` };
      }

      return { bfeNr: nodes[0].bestemtFastEjendomBFENr ?? null, fejl: null };
    } catch (e) {
      console.error("[EBR] getBfeNrByAdresse fejl:", e);
      return { bfeNr: null, fejl: (e as Error).message };
    }
  }
```

- [ ] **Step 5.4: Tilføj `bfe_nr` til `restoreProject` select**

I `src/integrations/supabase/project-persistence.ts`, find `restoreProject` funktionen og find den streng der indeholder feltlisten i `.select(...)`. Tilføj `bfe_nr` til listen:

Find:

```typescript
      "id, address_full, ... hus_dna",
```

Tilføj `, bfe_nr` til slutningen af strengen (inden afsluttende `"`).

- [ ] **Step 5.5: Kør tests og typecheck**

```bash
bun test src/integrations/ebr/ebr.test.ts
bunx tsc --noEmit
```

- [ ] **Step 5.6: Commit**

```bash
git add src/integrations/ebr/client.ts src/integrations/ebr/ebr.test.ts src/integrations/supabase/project-persistence.ts
git commit -m "feat(ARCH-225): EBR getBfeNrByAdresse for ejerlejligheder, bfe_nr i restoreProject"
```

---

## Task 6: SAVE/FBB pipeline fix (ARCH-224)

**Files:**

- Modify: `src/routes/projekt.$id.cockpit.tsx`
- Modify: `src/components/cockpit/EjendomPanel.tsx`

- [ ] **Step 6.1: Fix `runByggeanalyse` til at sende faktisk fbbData**

I `src/routes/projekt.$id.cockpit.tsx`, find `runByggeanalyse`-handleren og linjen:

```typescript
        fbbData: null,
```

Erstat med:

```typescript
        fbbData: analysisInput.fbbData ?? null,
```

OBS: Tjek at `analysisInput` (= `data` uden `token`) faktisk har `fbbData`-feltet. `ByggeanalyseInput` har allerede `fbbData?: FbbResultat | null` som valgfrit felt. Ingen typeændring nødvendig.

- [ ] **Step 6.2: Fix EjendomPanel SAVE-gate**

I `src/components/cockpit/EjendomPanel.tsx`, find:

```tsx
              hasFbbRegistration={Boolean(bbr?.fbb_reference)}
```

Erstat med:

```tsx
              hasFbbRegistration={heritageSaveValue != null}
```

Dette sørger for at SAVE vises baseret på om vi faktisk har en SAVE-værdi, ikke om BBR tilfældigvis har `fbb_reference` sat.

Find det sted der viser FBB-registreringsstatus (den med `value={bbr?.fbb_reference ? "Registreret" : "—"}`):

```tsx
              value={bbr?.fbb_reference ? "Registreret" : "—"}
              status={bbr == null ? "mangler" : bbr.fbb_reference ? "live" : "mangler"}
```

Erstat med:

```tsx
              value={heritageSaveValue != null ? `SAVE ${heritageSaveValue}/9` : "Ikke SAVE-registreret"}
              status={heritageSaveValue != null ? "live" : bbr == null ? "mangler" : "ok"}
```

- [ ] **Step 6.3: Verificér typecheck**

```bash
bunx tsc --noEmit
```

- [ ] **Step 6.4: Test manuelt i dev**

```bash
bun dev
```

Åbn en adresse med kendt SAVE-værdi (fx Hasselvej 48, forventet SAVE 3). Verificér at Cockpit viser `SAVE 3/9` i Ejendomspanelet.

- [ ] **Step 6.5: Commit**

```bash
git add src/routes/projekt.\$id.cockpit.tsx src/components/cockpit/EjendomPanel.tsx
git commit -m "fix(ARCH-224): runByggeanalyse sender faktisk fbbData til regelkerne, EjendomPanel viser SAVE fra heritage_save_value"
```

---

## Task 7: MatrikelMap geometri (ARCH-229)

**Files:**

- Modify: `src/lib/map-proxy.ts`
- Modify: `src/components/cockpit/MatrikelMap.tsx`

- [ ] **Step 7.1: Tilføj `fetchParcelGeometryByJordstykkeId` til `map-proxy.ts`**

I `src/lib/map-proxy.ts`, tilføj ny eksporteret funktion (se eksisterende `fetchParcelGeometryProxy` for mønster):

```typescript
/**
 * Henter parcel-geometri for et specifikt jordstykke via id_lokalId.
 * Returnerer `source: "wfs"` når geometri er fundet, `source: "fallback"` aldrig
 * — bbox-fallback skal kalde den eksisterende `fetchParcelGeometryProxy`.
 */
export async function fetchParcelGeometryByJordstykkeId(
  jordstykkeLokalId: string,
): Promise<{ featureCollection: any | null; source: "wfs" | "notfound" }> {
  if (!jordstykkeLokalId) return { featureCollection: null, source: "notfound" };

  try {
    const filter = encodeURIComponent(`id_lokalId='${jordstykkeLokalId}'`);
    const url =
      `${MAT_WFS_URL}?service=WFS&version=1.1.0&request=GetFeature` +
      `&typenames=mat:Jordstykke_Gaeldende&outputFormat=application/json` +
      `&CQL_FILTER=${filter}`;

    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (!res.ok) return { featureCollection: null, source: "notfound" };

    const fc = await res.json();
    if (!fc?.features?.length) return { featureCollection: null, source: "notfound" };

    return { featureCollection: fc, source: "wfs" };
  } catch (e) {
    console.warn("[MapProxy] fetchParcelGeometryByJordstykkeId fejlede:", e);
    return { featureCollection: null, source: "notfound" };
  }
}
```

OBS: `MAT_WFS_URL` antages allerede at være defineret i filen — tjek og brug eksisterende konstant.

- [ ] **Step 7.2: Opdater `MatrikelMap.tsx` til at bruge jordstykke-ID**

I `src/components/cockpit/MatrikelMap.tsx`, find prop-interface og tilføj:

```typescript
  jordstykkeLokalId?: string | null;
```

Find `fetchParcelGeometry({ point: geo, bufferMeters: 180 })` kaldet og erstat logikken med:

```typescript
// ARCH-229: Brug specifik jordstykke-geometri når ID er tilgængeligt
if (jordstykkeLokalId) {
  const result = await fetchParcelGeometryByJordstykkeId(jordstykkeLokalId);
  if (result.featureCollection) {
    setParcelGeojson(result.featureCollection);
    setStatus("ready");
    return;
  }
}
// Fallback til bbox-søgning — markeret som fallback internt
const fallback = await fetchParcelGeometry({ point: geo, bufferMeters: 180 });
setParcelGeojson(fallback.featureCollection);
setStatus(fallback.featureCollection ? "ready" : "missing");
```

Import `fetchParcelGeometryByJordstykkeId` øverst i filen.

- [ ] **Step 7.3: Sæt `jordstykkeLokalId` prop i cockpit**

I `src/routes/projekt.$id.cockpit.tsx`, find `<MatrikelMap` komponenten og tilføj:

```tsx
jordstykkeLokalId={bbrData?.jordstykke_lokal_id ?? null}
```

- [ ] **Step 7.4: Typecheck**

```bash
bunx tsc --noEmit
```

- [ ] **Step 7.5: Manuel test**

```bash
bun dev
```

Åbn cockpit for en adresse. Verificér i browser devtools (Network) at matrikelkortet henter geometri med en `id_lokalId` CQL_FILTER, ikke kun bbox. Verificér at kun én matrikel vises, ikke naboer.

- [ ] **Step 7.6: Commit**

```bash
git add src/lib/map-proxy.ts src/components/cockpit/MatrikelMap.tsx src/routes/projekt.\$id.cockpit.tsx
git commit -m "fix(ARCH-229): MatrikelMap henter specifik jordstykke-geometri via id_lokalId, ikke bbox"
```

---

## Final: Byg og fuld testpas

- [ ] **Step F.1: Fuld test-suite**

```bash
bun test
```

Forventet: ingen failing tests.

- [ ] **Step F.2: Typecheck og lint**

```bash
bunx tsc --noEmit
bunx eslint .
```

- [ ] **Step F.3: Produktionsbuild**

```bash
bun build
```

Forventet: ingen typefikering- eller build-fejl.

- [ ] **Step F.4: Opdater Linear issues**

Marker ARCH-222, 223, 224, 225, 226, 227, 228, 229 som **Done** i Linear.

---

## Self-review: Spec Coverage

| Issue                             | Dækket af  | Status |
| --------------------------------- | ---------- | ------ |
| ARCH-222 (beslutning + CLAUDE.md) | Task 3 + 4 | ✅     |
| ARCH-223 (GrundarealResolver)     | Task 4     | ✅     |
| ARCH-224 (SAVE/FBB pipeline)      | Task 6     | ✅     |
| ARCH-225 (EBR dual-mode + BFE)    | Task 5     | ✅     |
| ARCH-226 (DAWA removal)           | Task 3     | ✅     |
| ARCH-227 (BBR aggregering)        | Task 1     | ✅     |
| ARCH-228 (Plandata determinism)   | Task 2     | ✅     |
| ARCH-229 (MatrikelMap geometri)   | Task 7     | ✅     |

**Beskyttede filer der røres:** `analysis-orchestrator.ts`, `pre-check-adresse.ts`, `project-persistence.ts`, `CLAUDE.md`
→ PR skal markeres: `🔒 Rører beskyttet fil — kræver review`

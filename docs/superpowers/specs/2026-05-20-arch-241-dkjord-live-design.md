# ARCH-241: DK-Jord Live — Design Spec

**Dato:** 2026-05-20  
**Issue:** [ARCH-241](https://linear.app/archai-design-partner/issue/ARCH-241)  
**Status:** Approved — klar til implementeringsplan

---

## Formål

Gøre jordforurening live. `DkJordService` har en komplet live-implementering, men `IS_MOCK=true` blokerer den. Endpointet er aldrig testet — ikke et kendt netværksproblem. Scope: flip IS_MOCK, tilføj polygon-support, typed DB-kolonner, rule engine-regler og Building Tasks.

---

## Arkitekturoversigt

```
Orchestrator (Layer 4)
  └── DkJordService.getTilstand(koordinat, parcelPolygon?)
        ├── polygon tilgængeligt → INTERSECTS(geometry, POLYGON(...))   [WGS84 WKT]
        └── polygon mangler     → INTERSECTS(geometry, POINT(lng lat))  [fallback]

DkJordResultat → project-persistence.buildSiteConstraintsPatch()
  ├── soil_contamination_status  (eksisterende aggregeret felt)
  ├── jordforurening_v1          (ny typed kolonne)
  ├── jordforurening_v2          (ny typed kolonne)
  ├── jordforurening_olietank    (ny typed kolonne)
  ├── omraadeklassificering      (ny typed kolonne)
  ├── jordforurening_nuancering  (ny typed kolonne)
  └── jordforurening_lokalitet_id (ny typed kolonne)

site_constraints → input-assembler → RuleEngineInput.geotechnical
  └── checkJordforureningRules() → RuleViolation[] (severity: "warning")

DkJordResultat → project-persistence.deriveAutoTasks()
  └── Building Tasks: jordforurening_v2_undersoegelse | v1_screening | jordflytning_attest
```

---

## 1. DkJordService (`src/integrations/miljoe/dkjord.ts`)

### IS_MOCK flip

`IS_MOCK = false` — endpointet er offentligt og kræver ingen auth.

### Signatur

```typescript
static async getTilstand(
  koordinat: Koordinat,
  parcelPolygon?: GeoJSON.Feature | GeoJSON.FeatureCollection | null,
): Promise<SourceResult<DkJordResultat>>
```

### Polygon-support

Ny ren hjælpefunktion i samme fil:

```typescript
function wfsPolygonFilter(geojson: GeoJSON.Feature | GeoJSON.FeatureCollection): string | null;
```

- Udtræk første LinearRing fra første Polygon-feature i FeatureCollection
- Byg WKT: `POLYGON((lng1 lat1, lng2 lat2, ..., lng1 lat1))`
- GeoJSON er altid WGS84 — ingen koordinatkonvertering nødvendig
- Returner `null` ved uventede geometrityper (graceful fallback til point)

CQL_FILTER: `INTERSECTS(geometry, <WKT>)` med `SRSNAME=EPSG:4326`.

### DkJordResultat — nye felter

```typescript
export type DkJordResultat = {
  v1Kortlagt: boolean | null;
  v2Kortlagt: boolean | null;
  olietank: {
    eksisterer: boolean | null;
    driftsstatus: string | null;
  };
  omraadeklassificering: string | null;
  nuancering: string | null; // ny: fra WFS feature properties
  lokalitetsId: string | null; // ny: DK-Jord lokalitets-id
  kilde: "dkjord" | "mock";
};
```

`nuancering` og `lokalitetsId` læses fra feature properties på V2/V1-features. Hvis WFS ikke udstiller dem, returner `null` (ingen fejl).

### Timeout og fejlhåndtering

Eksisterende 8s timeout og `makeErrorResult()` bibeholdes. API-fejl → `null` data, aldrig `false`.

---

## 2. Database migration

**Fil:** `supabase/migrations/20260520000000_site_constraints_jordforurening.sql`

```sql
ALTER TABLE public.site_constraints
  ADD COLUMN IF NOT EXISTS jordforurening_v1           BOOLEAN,
  ADD COLUMN IF NOT EXISTS jordforurening_v2           BOOLEAN,
  ADD COLUMN IF NOT EXISTS jordforurening_olietank     BOOLEAN,
  ADD COLUMN IF NOT EXISTS omraadeklassificering       TEXT,
  ADD COLUMN IF NOT EXISTS jordforurening_nuancering   TEXT,
  ADD COLUMN IF NOT EXISTS jordforurening_lokalitet_id TEXT;
```

- Alle kolonner nullable — ingen backfill (eksisterende rækker har `soil_contamination_status`)
- `soil_contamination_status` beholdes som aggregeret felt
- `src/integrations/supabase/types.ts` opdateres med de nye kolonner

---

## 3. project-persistence.ts

`buildSiteConstraintsPatch()` udvides i `dkjord`-blokken:

```typescript
if (patch.dkjord !== undefined) {
  hasConstraintField = true;
  sitePatch.soil_contamination_status = deriveSoilContaminationStatus(patch.dkjord);
  sitePatch.jordforurening_v1 = patch.dkjord?.v1Kortlagt ?? null;
  sitePatch.jordforurening_v2 = patch.dkjord?.v2Kortlagt ?? null;
  sitePatch.jordforurening_olietank = patch.dkjord?.olietank.eksisterer ?? null;
  sitePatch.omraadeklassificering = patch.dkjord?.omraadeklassificering ?? null;
  sitePatch.jordforurening_nuancering = patch.dkjord?.nuancering ?? null;
  sitePatch.jordforurening_lokalitet_id = patch.dkjord?.lokalitetsId ?? null;
}
```

`deriveSoilContaminationStatus()` er uændret.

`deriveAutoTasks()` opdateres til at bruge typed felter direkte (ikke string-matching):

- `jordforurening_v2 === true` → task `jordforurening_v2_undersoegelse` (matriklen, priority 1)
- `jordforurening_v1 === true` → task `jordforurening_v1_screening` (matriklen, priority 2)
- `omraadeklassificering !== null` → task `jordflytning_attest` (maskinrummet, priority 3)

---

## 4. Rule engine

### RuleEngineInput (`src/lib/rule-engine/types.ts`)

`geotechnical`-blokken udvides:

```typescript
geotechnical: {
  radonRisk: "low" | "medium" | "high" | "unknown";
  groundwaterDepthM: number | null;
  slopePercent: number | null;
  jordforureningV1: boolean | null; // null = ukendt/API-fejl
  jordforureningV2: boolean | null; // null = ukendt/API-fejl
  omraadeklassificering: string | null;
}
```

### Ny regelfil (`src/lib/rule-engine/rules/jordforurening-rules.ts`)

```typescript
export function checkJordforureningRules(input: RuleEngineInput): RuleViolation[] {
  const violations: RuleViolation[] = [];
  const { jordforureningV2, jordforureningV1, omraadeklassificering } = input.geotechnical;

  if (jordforureningV2 === true) {
    violations.push({
      rule: "jordforurening_v2",
      severity: "warning",
      reason:
        "Grunden er V2-kortlagt (dokumenteret forurening). Oprensning kan koste 500.000 kr+. " +
        "Kræver miljøteknisk undersøgelse inden byggestart (Jordforureningslovens §72).",
      authority: "Miljøstyrelsen",
    });
  }

  if (jordforureningV1 === true) {
    violations.push({
      rule: "jordforurening_v1",
      severity: "warning",
      reason:
        "Grunden er V1-kortlagt (mulig forurening). Miljøundersøgelse anbefales inden køb og inden nedrivning.",
      authority: "Miljøstyrelsen",
    });
  }

  if (omraadeklassificering !== null) {
    violations.push({
      rule: "jordforurening_omraadeklassificering",
      severity: "warning",
      reason: `Grunden er i et områdeklassificeret område (${omraadeklassificering}). Jordflytning kræver jordsundhedsattest.`,
      authority: "Kommunen",
    });
  }

  return violations;
}
```

`null`-tri-state: ingen violation oprettes når feltet er `null` (ukendt/API-fejl). Dette er bevidst — vi forsøger ikke at udlede compliance fra manglende data.

### input-assembler.ts

Læser `jordforurening_v1`, `jordforurening_v2`, `omraadeklassificering` fra `site_constraints` og mapper til `RuleEngineInput.geotechnical` — samme mønster som eksisterende felter.

### engine.ts (`src/lib/rule-engine/engine.ts`)

`checkJordforureningRules(input)` importeres og tilføjes til violations-aggregeringen efter `checkStopRules`.

### ComplianceTriggers (`src/integrations/supabase/project-persistence.ts`)

Den interne `ComplianceTriggers`-type udvides med de nye typed felter (bruges af `deriveAutoTasks()`):

```typescript
type ComplianceTriggers = {
  // ...eksisterende felter...
  soilContamination: "clean" | "registered" | "contaminated" | "unknown" | null;
  jordforureningV1: boolean | null;
  jordforureningV2: boolean | null;
  omraadeklassificering: string | null;
};
```

`buildComplianceTriggers()` (eller tilsvarende) læser de nye typed kolonner fra `site_constraints` og sender dem videre til `deriveAutoTasks()`.

---

## 5. Orchestrator (`src/lib/analysis-orchestrator.ts`)

`DkJordService.getTilstand()` kaldes med parcelpolygon:

```typescript
const polygon = await getCachedParcelPolygon(addressId);
DkJordService.getTilstand(koordinater, polygon ?? null);
```

`getCachedParcelPolygon()` er allerede implementeret i `src/integrations/cache/client.ts` (returnerer `GeoJSON.FeatureCollection | null`). Ingen ny cache-logik nødvendig.

---

## 6. Tests

### `dkjord.test.ts` — 3 fixture-scenarier (mock via `fetch`)

| Scenarie  | V1 features | V2 features | Forventet resultat                       |
| --------- | ----------- | ----------- | ---------------------------------------- |
| `no_hit`  | 0           | 0           | `v1=false, v2=false, status=clean`       |
| `v1_only` | 1           | 0           | `v1=true, v2=false, status=registered`   |
| `v2_hit`  | 0           | 1           | `v1=false, v2=true, status=contaminated` |

Dækker også: tri-state (`null` ved fetch-fejl), polygon-WKT-hjælperfunktion.

### `jordforurening-rules.test.ts` — ny

- V2 true → 1 warning violation
- V1 true → 1 warning violation
- Begge null → 0 violations
- Områdeklassificering !== null → 1 warning
- Kombination V2 + omraade → 2 violations

---

## Acceptance criteria

- [ ] `IS_MOCK` fjernet/false for live path
- [ ] Polygon-INTERSECTS med WGS84-koordinater, fallback til point
- [ ] 6 nye typed kolonner i `site_constraints`
- [ ] `project-persistence.ts` skriver alle 6 kolonner
- [ ] V2/V1/omraadeklassificering i rule engine som `severity: "warning"`
- [ ] 3 Building Task-nøgler: `jordforurening_v2_undersoegelse`, `jordforurening_v1_screening`, `jordflytning_attest`
- [ ] Tests: 3 WFS-fixtures + rule engine unit tests
- [ ] `bunx tsc --noEmit` ✓, `bun test` ✓, `bunx eslint .` ✓, `bun run build` ✓

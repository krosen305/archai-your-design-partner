# Components Audit Refactoring — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor 5 cockpit components to eliminate Rule 2/7 violations — move domain logic, workflow orchestration and persistence calls out of UI into typed pure functions, application services and focused hooks.

**Architecture:** Gruppe C order — pure lib extraction first, then hook extraction, then service+hook for AiDesignHero. Each group is independently testable and committable. No new Supabase calls, no new server functions, no new JSONB fields.

**Tech Stack:** TypeScript, React (hooks), Zustand (`useProject`), TanStack Start (`useServerFn`), Bun (test runner), Zod (existing schemas)

---

## File Map

| File                                                | Status     | Responsibility                                          |
| --------------------------------------------------- | ---------- | ------------------------------------------------------- |
| `src/lib/budget-calculator.ts`                      | **Create** | Pure budget domain types + calculations                 |
| `src/lib/budget-calculator.test.ts`                 | **Create** | Unit tests for all four calculations                    |
| `src/hooks/useBudgetSync.ts`                        | **Create** | Debounced setBudgetEstimate + syncPatch                 |
| `src/components/cockpit/BudgetKalkulator.tsx`       | **Modify** | Import from lib; use useBudgetSync                      |
| `src/lib/lokalplan-classifier.ts`                   | **Create** | classifyLokalplaner pure function                       |
| `src/lib/lokalplan-classifier.test.ts`              | **Create** | Unit tests for classification logic                     |
| `src/components/cockpit/AnalyseTab.tsx`             | **Modify** | Use classifyLokalplaner instead of inline filter        |
| `src/hooks/useParcelData.ts`                        | **Create** | Server fn calls + parcel/preview state                  |
| `src/hooks/usePlacementSync.ts`                     | **Create** | rotationDeg state + updateRotation/resetPlacement       |
| `src/components/cockpit/MatrikelMap.tsx`            | **Modify** | Use both new hooks; remove route imports                |
| `src/lib/byggeoenske-constraint-view-model.ts`      | **Create** | buildStepConstraintViewModel pure function              |
| `src/lib/byggeoenske-constraint-view-model.test.ts` | **Create** | Unit tests for all stepKey branches                     |
| `src/hooks/useDispensationFlow.ts`                  | **Create** | dispensationFor state + acknowledge logic               |
| `src/components/cockpit/index.tsx`                  | **Modify** | StepExtras uses view-model; DispensationModal uses hook |
| `src/lib/billedanalyse-tags.ts`                     | **Create** | Pure tag manipulation functions                         |
| `src/lib/billedanalyse-tags.test.ts`                | **Create** | Unit tests for tag functions                            |
| `src/lib/services/ai-design-workflow.service.ts`    | **Create** | Application service: upload/analyse/generate            |
| `src/hooks/useAiDesignWorkflow.ts`                  | **Create** | Thin React hook: session + state + syncPatch            |
| `src/components/cockpit/AiDesignHero.tsx`           | **Modify** | Renderers-only; delegates to hook                       |

---

## Task 1 — `src/lib/budget-calculator.ts` (pure lib + tests)

**Files:**

- Create: `src/lib/budget-calculator.ts`
- Create: `src/lib/budget-calculator.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/lib/budget-calculator.test.ts`:

```ts
import { describe, it, expect } from "bun:test";
import {
  beregnNedrivning,
  beregnForsyning,
  beregnGeoteknik,
  beregnNybyg,
  beregnBudget,
} from "./budget-calculator";

describe("beregnNedrivning", () => {
  it("returns zeroes when bebyggetArealM2 is null", () => {
    const r = beregnNedrivning(null, "2000");
    expect(r.min).toBe(0);
    expect(r.max).toBe(0);
  });

  it("applies asbest rate for byggeaar < 1978", () => {
    const r = beregnNedrivning(100, "1970");
    expect(r.min).toBe(100 * 1_000);
    expect(r.max).toBe(100 * 1_400);
    expect(r.note).toContain("asbest");
  });

  it("applies standard rate for byggeaar >= 1978", () => {
    const r = beregnNedrivning(100, "1980");
    expect(r.min).toBe(100 * 800);
    expect(r.max).toBe(100 * 1_200);
    expect(r.note).toBeUndefined();
  });
});

describe("beregnForsyning", () => {
  it("adds gas surcharge when naturgas is true", () => {
    const withGas = beregnForsyning(true);
    const withoutGas = beregnForsyning(false);
    expect(withGas.min).toBeGreaterThan(withoutGas.min);
    expect(withGas.min).toBe(55_000 + 10_000);
    expect(withGas.max).toBe(110_000 + 15_000);
  });

  it("returns base range without gas", () => {
    const r = beregnForsyning(false);
    expect(r.min).toBe(55_000);
    expect(r.max).toBe(110_000);
  });
});

describe("beregnGeoteknik", () => {
  it("returns 0–50k for kategori 1", () => {
    const r = beregnGeoteknik(1);
    expect(r.min).toBe(0);
    expect(r.max).toBe(50_000);
  });

  it("returns 50k–200k for kategori 2", () => {
    const r = beregnGeoteknik(2);
    expect(r.min).toBe(50_000);
    expect(r.max).toBe(200_000);
  });

  it("returns 200k–500k for kategori 3", () => {
    const r = beregnGeoteknik(3);
    expect(r.min).toBe(200_000);
    expect(r.max).toBe(500_000);
  });
});

describe("beregnNybyg", () => {
  it("returns zeroes when arealM2 is null", () => {
    const r = beregnNybyg(null, null, false);
    expect(r.min).toBe(0);
    expect(r.max).toBe(0);
  });

  it("applies lavenergi surcharge for passiv class", () => {
    const base = beregnNybyg(100, "BR18", false);
    const lavenergi = beregnNybyg(100, "passiv", false);
    expect(lavenergi.min).toBeGreaterThan(base.min);
  });

  it("applies kælder surcharge", () => {
    const base = beregnNybyg(100, "BR18", false);
    const kaelder = beregnNybyg(100, "BR18", true);
    expect(kaelder.min).toBeGreaterThan(base.min);
  });
});

describe("beregnBudget", () => {
  it("totalTypisk is average of totalMin and totalMax", () => {
    const r = beregnBudget({
      bebyggetArealM2: 100,
      byggeaar: "1990",
      oensketArealM2: 150,
      energiklasse: "BR18",
      harKaelder: false,
      geoteknikKategori: 1,
      naturgas: false,
    });
    expect(r.totalTypisk).toBe(Math.round((r.totalMin + r.totalMax) / 2));
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL (module not found)**

```bash
bun test src/lib/budget-calculator.test.ts
```

Expected: error — `Cannot find module './budget-calculator'`

- [ ] **Step 3: Create `src/lib/budget-calculator.ts`**

```ts
export type GeoteknikKategori = 1 | 2 | 3;

export type BudgetInput = {
  bebyggetArealM2: number | null;
  byggeaar: string | null;
  oensketArealM2: number | null;
  energiklasse: string | null;
  harKaelder: boolean;
  geoteknikKategori: GeoteknikKategori;
  naturgas: boolean;
};

export type BudgetKategori = {
  label: string;
  min: number;
  max: number;
  note?: string;
};

export type BudgetResultat = {
  nedrivning: BudgetKategori;
  forsyning: BudgetKategori;
  geoteknik: BudgetKategori;
  nybyg: BudgetKategori;
  totalMin: number;
  totalMax: number;
  totalTypisk: number;
};

export function beregnNedrivning(
  bebyggetArealM2: number | null,
  byggeaar: string | null,
): BudgetKategori {
  if (!bebyggetArealM2) {
    return { label: "Nedrivning", min: 0, max: 0, note: "Intet registreret bebygget areal" };
  }
  const asbestRisiko = parseInt(byggeaar ?? "0") < 1978;
  const minSats = asbestRisiko ? 1_000 : 800;
  const maxSats = asbestRisiko ? 1_400 : 1_200;
  return {
    label: "Nedrivning",
    min: Math.round(bebyggetArealM2 * minSats),
    max: Math.round(bebyggetArealM2 * maxSats),
    note: asbestRisiko ? "Tillæg for asbestrisiko (byggeår < 1978)" : undefined,
  };
}

export function beregnForsyning(naturgas: boolean): BudgetKategori {
  const gasMin = naturgas ? 10_000 : 0;
  const gasMax = naturgas ? 15_000 : 0;
  return {
    label: "Forsyningsafkobling",
    min: 55_000 + gasMin,
    max: 110_000 + gasMax,
  };
}

export function beregnGeoteknik(kategori: GeoteknikKategori): BudgetKategori {
  const ranges: Record<GeoteknikKategori, [number, number]> = {
    1: [0, 50_000],
    2: [50_000, 200_000],
    3: [200_000, 500_000],
  };
  const [min, max] = ranges[kategori];
  const labels: Record<GeoteknikKategori, string> = {
    1: "Kategori 1 — god grund",
    2: "Kategori 2 — variabel",
    3: "Kategori 3 — dårlig / pæl",
  };
  return { label: "Geoteknik", min, max, note: labels[kategori] };
}

export function beregnNybyg(
  arealM2: number | null,
  energiklasse: string | null,
  harKaelder: boolean,
): BudgetKategori {
  if (!arealM2) {
    return { label: "Nybyg", min: 0, max: 0, note: "Intet ønsket areal angivet" };
  }
  const LAVENERGI_KLASSER = ["lavenergi", "passiv", "plusenergi"];
  const lavenergitillæg =
    energiklasse && LAVENERGI_KLASSER.includes(energiklasse.toLowerCase()) ? 2_000 : 0;
  const kaeldertillæg = harKaelder ? 5_000 : 0;
  const baseSatsMin = 22_000 + lavenergitillæg + kaeldertillæg;
  const baseSatsMax = baseSatsMin + 4_000;
  return {
    label: "Nybyg",
    min: Math.round(arealM2 * baseSatsMin),
    max: Math.round(arealM2 * baseSatsMax),
  };
}

export function beregnBudget(input: BudgetInput): BudgetResultat {
  const nedrivning = beregnNedrivning(input.bebyggetArealM2, input.byggeaar);
  const forsyning = beregnForsyning(input.naturgas);
  const geoteknik = beregnGeoteknik(input.geoteknikKategori);
  const nybyg = beregnNybyg(input.oensketArealM2, input.energiklasse, input.harKaelder);
  const totalMin = nedrivning.min + forsyning.min + geoteknik.min + nybyg.min;
  const totalMax = nedrivning.max + forsyning.max + geoteknik.max + nybyg.max;
  return {
    nedrivning,
    forsyning,
    geoteknik,
    nybyg,
    totalMin,
    totalMax,
    totalTypisk: Math.round((totalMin + totalMax) / 2),
  };
}
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
bun test src/lib/budget-calculator.test.ts
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/budget-calculator.ts src/lib/budget-calculator.test.ts
git commit -m "feat(lib): extract budget-calculator pure domain module with tests"
```

---

## Task 2 — `useBudgetSync` + `BudgetKalkulator.tsx` update

**Files:**

- Create: `src/hooks/useBudgetSync.ts`
- Modify: `src/components/cockpit/BudgetKalkulator.tsx`

- [ ] **Step 1: Create `src/hooks/useBudgetSync.ts`**

```ts
import { useEffect, useRef } from "react";
import { useProject } from "@/lib/project-store";
import { syncPatch } from "@/lib/project-sync";

export function useBudgetSync(totalTypisk: number): void {
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      useProject.getState().setBudgetEstimate(totalTypisk);
      void syncPatch({ budget_estimate: totalTypisk });
    }, 800);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [totalTypisk]);
}
```

- [ ] **Step 2: Update `src/components/cockpit/BudgetKalkulator.tsx`**

Replace the import block at the top. Remove the types and pure functions. Add imports from the new modules:

```ts
import { useState, useMemo } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { useProject } from "@/lib/project-store";
import { Card } from "@/components/wizard-ui";
import { beregnBudget, type GeoteknikKategori, type BudgetInput } from "@/lib/budget-calculator";
import { useBudgetSync } from "@/hooks/useBudgetSync";
```

Remove the entire block of exported types and functions from the component file (lines 11–124 in the original). Keep `KATEGORI_LABELS` and `fmtDKK`/`fmtShort` as they are presentation-layer only.

Replace the `useEffect` block (the debounced sync, roughly lines 192–201) with a single hook call:

```ts
useBudgetSync(resultat.totalTypisk);
```

Remove the `useRef` import from the top (no longer needed for debounce).

The final component signature and `useMemo` for `resultat` stay exactly the same — only the imports, type declarations and inline effect change.

- [ ] **Step 3: Run TypeScript check**

```bash
bunx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Run tests**

```bash
bun test
```

Expected: all existing tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useBudgetSync.ts src/components/cockpit/BudgetKalkulator.tsx
git commit -m "refactor(cockpit): extract useBudgetSync hook; BudgetKalkulator imports from budget-calculator"
```

---

## Task 3 — `lokalplan-classifier.ts` + `AnalyseTab.tsx` update

**Files:**

- Create: `src/lib/lokalplan-classifier.ts`
- Create: `src/lib/lokalplan-classifier.test.ts`
- Modify: `src/components/cockpit/AnalyseTab.tsx`

- [ ] **Step 1: Write failing tests**

Create `src/lib/lokalplan-classifier.test.ts`:

```ts
import { describe, it, expect } from "bun:test";
import { classifyLokalplaner } from "./lokalplan-classifier";
import type { RuleEngineLokalplan } from "@/domain/contracts/rule-engine.types";

function lp(planid: string, status: string | null): RuleEngineLokalplan {
  return {
    planid,
    plannavn: "Test",
    plannr: null,
    kommunenavn: null,
    komnr: null,
    anvgen: null,
    anvendelseGenerel: null,
    fremtidigzonestatus: null,
    sforhold: null,
    planstatus: null,
    datoIkraft: null,
    datoVedtaget: null,
    plandokumentLink: null,
    plantype: null,
    status,
  };
}

describe("classifyLokalplaner", () => {
  it("classifies null status as vedtaget", () => {
    const { vedtagne, forslag } = classifyLokalplaner([lp("1", null)]);
    expect(vedtagne).toHaveLength(1);
    expect(forslag).toHaveLength(0);
  });

  it("classifies 'Vedtaget' as vedtaget", () => {
    const { vedtagne, forslag } = classifyLokalplaner([lp("1", "Vedtaget")]);
    expect(vedtagne).toHaveLength(1);
    expect(forslag).toHaveLength(0);
  });

  it("classifies 'vedtaget' (lowercase) as vedtaget", () => {
    const { vedtagne } = classifyLokalplaner([lp("1", "vedtaget")]);
    expect(vedtagne).toHaveLength(1);
  });

  it("classifies 'Forslag' as forslag", () => {
    const { vedtagne, forslag } = classifyLokalplaner([lp("1", "Forslag")]);
    expect(vedtagne).toHaveLength(0);
    expect(forslag).toHaveLength(1);
  });

  it("classifies 'Lokalplanforslag' as forslag", () => {
    const { forslag } = classifyLokalplaner([lp("1", "Lokalplanforslag")]);
    expect(forslag).toHaveLength(1);
  });

  it("classifies 'forslag' (lowercase) as forslag", () => {
    const { forslag } = classifyLokalplaner([lp("1", "forslag")]);
    expect(forslag).toHaveLength(1);
  });

  it("handles mixed arrays correctly", () => {
    const plans = [lp("1", null), lp("2", "Vedtaget"), lp("3", "Forslag"), lp("4", "forslag")];
    const { vedtagne, forslag } = classifyLokalplaner(plans);
    expect(vedtagne).toHaveLength(2);
    expect(forslag).toHaveLength(2);
  });

  it("returns empty arrays for empty input", () => {
    const { vedtagne, forslag } = classifyLokalplaner([]);
    expect(vedtagne).toHaveLength(0);
    expect(forslag).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
bun test src/lib/lokalplan-classifier.test.ts
```

Expected: error — `Cannot find module './lokalplan-classifier'`

- [ ] **Step 3: Create `src/lib/lokalplan-classifier.ts`**

```ts
import type { RuleEngineLokalplan } from "@/domain/contracts/rule-engine.types";

export function classifyLokalplaner(lokalplaner: RuleEngineLokalplan[]): {
  vedtagne: RuleEngineLokalplan[];
  forslag: RuleEngineLokalplan[];
} {
  const forslag = lokalplaner.filter((p) => p.status?.toLowerCase().includes("forslag") ?? false);
  const vedtagne = lokalplaner.filter(
    (p) => !(p.status?.toLowerCase().includes("forslag") ?? false),
  );
  return { vedtagne, forslag };
}
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
bun test src/lib/lokalplan-classifier.test.ts
```

Expected: all 8 tests pass.

- [ ] **Step 5: Update `src/components/cockpit/AnalyseTab.tsx`**

Add import at the top of the file (after existing imports):

```ts
import { classifyLokalplaner } from "@/lib/lokalplan-classifier";
```

Inside the `AnalyseTab` function, replace the two inline filter declarations (around line 191–197 in the original):

```ts
// Remove this:
const vedtagne = lokalplaner.filter(
  (p) =>
    !p.status ||
    p.status.toLowerCase().includes("vedtaget") ||
    !p.status.toLowerCase().includes("forslag"),
);
const forslag = lokalplaner.filter((p) => p.status?.toLowerCase().includes("forslag"));

// Replace with:
const { vedtagne, forslag } = classifyLokalplaner(lokalplaner);
```

No other changes to `AnalyseTab.tsx`.

- [ ] **Step 6: Run TypeScript check and tests**

```bash
bunx tsc --noEmit && bun test
```

Expected: no errors, all tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/lib/lokalplan-classifier.ts src/lib/lokalplan-classifier.test.ts src/components/cockpit/AnalyseTab.tsx
git commit -m "refactor(cockpit): extract lokalplan-classifier; AnalyseTab uses pure classifier"
```

---

## Task 4 — `useParcelData.ts`

**Files:**

- Create: `src/hooks/useParcelData.ts`

- [ ] **Step 1: Create `src/hooks/useParcelData.ts`**

```ts
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  fetchMatriklenPreview,
  fetchParcelGeometry,
  fetchParcelGeometryById,
} from "@/routes/api.map-tiles";
import type * as GeoJSON from "geojson";

export type ParcelStatus = "idle" | "loading" | "ready" | "missing";

export type ParcelPreviewImage = {
  dataUrl: string;
  extent3857: [number, number, number, number];
};

export function useParcelData(params: {
  geo: { lat: number; lng: number } | null;
  jordstykkeLokalId: string | null;
  adresseid: string | null;
}): {
  parcelStatus: ParcelStatus;
  parcelGeojson: GeoJSON.FeatureCollection | null;
  previewImage: ParcelPreviewImage | null;
} {
  const { geo, jordstykkeLokalId, adresseid } = params;

  const [parcelStatus, setParcelStatus] = useState<ParcelStatus>("idle");
  const [parcelGeojson, setParcelGeojson] = useState<GeoJSON.FeatureCollection | null>(null);
  const [previewImage, setPreviewImage] = useState<ParcelPreviewImage | null>(null);

  const loadParcelGeometry = useServerFn(fetchParcelGeometry);
  const loadParcelGeometryById = useServerFn(fetchParcelGeometryById);
  const loadParcelPreview = useServerFn(fetchMatriklenPreview);

  const loadParcelPreviewRef = useRef(loadParcelPreview);
  useEffect(() => {
    loadParcelPreviewRef.current = loadParcelPreview;
  }, [loadParcelPreview]);

  useEffect(() => {
    let cancelled = false;

    async function loadGeometry() {
      if (!geo) {
        setParcelGeojson(null);
        setPreviewImage(null);
        setParcelStatus("idle");
        return;
      }

      setParcelStatus("loading");

      try {
        if (jordstykkeLokalId) {
          const result = await loadParcelGeometryById({ data: { jordstykkeLokalId } });
          if (cancelled) return;
          if (result.featureCollection) {
            setParcelGeojson(result.featureCollection);
            setParcelStatus("ready");
          } else {
            const fallback = await loadParcelGeometry({
              data: { point: geo, adresseid, bufferMeters: 180 },
            });
            if (cancelled) return;
            setParcelGeojson(fallback.featureCollection);
            setParcelStatus(fallback.featureCollection?.features.length ? "ready" : "missing");
          }
        } else {
          const geometry = await loadParcelGeometry({
            data: { point: geo, adresseid, bufferMeters: 180 },
          });
          if (cancelled) return;
          setParcelGeojson(geometry.featureCollection);
          setParcelStatus(geometry.featureCollection?.features.length ? "ready" : "missing");
        }

        const preview = await loadParcelPreviewRef.current({
          data: { point: geo, bufferMeters: 220 },
        });
        if (cancelled) return;

        if (!preview) {
          setPreviewImage(null);
          return;
        }

        const { transformExtent } = await import("ol/proj");
        const extent3857 = transformExtent(preview.bbox25832, "EPSG:25832", "EPSG:3857") as [
          number,
          number,
          number,
          number,
        ];
        setPreviewImage({ dataUrl: preview.dataUrl, extent3857 });
      } catch {
        if (cancelled) return;
        setParcelStatus("missing");
        setParcelGeojson(null);
        setPreviewImage(null);
      }
    }

    void loadGeometry();
    return () => {
      cancelled = true;
    };
  }, [
    geo?.lat,
    geo?.lng,
    jordstykkeLokalId,
    adresseid,
    loadParcelGeometry,
    loadParcelGeometryById,
  ]);

  return { parcelStatus, parcelGeojson, previewImage };
}
```

- [ ] **Step 2: Run TypeScript check**

```bash
bunx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useParcelData.ts
git commit -m "feat(hooks): add useParcelData — encapsulates parcel geometry + preview server calls"
```

---

## Task 5 — `usePlacementSync.ts` + `MatrikelMap.tsx` update

**Files:**

- Create: `src/hooks/usePlacementSync.ts`
- Modify: `src/components/cockpit/MatrikelMap.tsx`

- [ ] **Step 1: Create `src/hooks/usePlacementSync.ts`**

```ts
import { useEffect, useState } from "react";
import { useProject } from "@/lib/project-store";
import { syncPatch } from "@/lib/project-sync";
import type { Address } from "@/types/project-state";

export function usePlacementSync(address: Address | null): {
  rotationDeg: number;
  updateRotation: (deg: number) => void;
  resetPlacement: (
    geo: { lat: number; lng: number } | null,
    initialCenter: [number, number] | null,
  ) => void;
} {
  const { setAddress } = useProject();
  const [rotationDeg, setRotationDeg] = useState(address?.rotationDeg ?? 0);

  useEffect(() => {
    setRotationDeg(address?.rotationDeg ?? 0);
  }, [address?.rotationDeg]);

  const updateRotation = (deg: number) => {
    setRotationDeg(deg);
    if (!address) return;
    const next = { ...address, rotationDeg: deg };
    setAddress(next);
    void syncPatch({ address: next });
  };

  const resetPlacement = (
    geo: { lat: number; lng: number } | null,
    initialCenter: [number, number] | null,
  ) => {
    if (!address) return;
    const next = {
      ...address,
      centroid: geo ?? (initialCenter ? { lat: initialCenter[1], lng: initialCenter[0] } : null),
      rotationDeg: 0,
    };
    setRotationDeg(0);
    setAddress(next);
    void syncPatch({ address: next });
  };

  return { rotationDeg, updateRotation, resetPlacement };
}
```

- [ ] **Step 2: Update `src/components/cockpit/MatrikelMap.tsx` — imports**

Replace the import block. Remove:

```ts
import {
  fetchMatriklenPreview,
  fetchParcelGeometry,
  fetchParcelGeometryById,
  fetchSkærmkortTile,
} from "@/routes/api.map-tiles";
```

Add:

```ts
import { useParcelData } from "@/hooks/useParcelData";
import { usePlacementSync } from "@/hooks/usePlacementSync";
```

Keep `fetchSkærmkortTile` import since it is still used for the tile loader inside the OL map init effect (the tile proxy is visual infrastructure, not parcel data):

```ts
import { fetchSkærmkortTile } from "@/routes/api.map-tiles";
```

Keep `useServerFn` from `@tanstack/react-start` — it is still needed for `fetchSkærmkortTile` (the tile proxy). Only remove the three parcel-specific `useServerFn` call lines.

- [ ] **Step 3: Update `MatrikelMap.tsx` — remove hook calls and state, add new hooks**

Remove these lines from the component body:

```ts
// Remove all three:
const loadParcelGeometry = useServerFn(fetchParcelGeometry);
const loadParcelGeometryById = useServerFn(fetchParcelGeometryById);
const loadParcelPreview = useServerFn(fetchMatriklenPreview);
const loadTile = useServerFn(fetchSkærmkortTile);
```

Re-add just the tile loader (still needed):

```ts
const loadTile = useServerFn(fetchSkærmkortTile);
```

Remove the three state declarations that are now in `useParcelData`:

```ts
// Remove:
const [parcelStatus, setParcelStatus] = useState<"idle" | "loading" | "ready" | "missing">("idle");
const [parcelGeojson, setParcelGeojson] = useState<ParcelFeatureCollection>(null);
const [previewImage, setPreviewImage] = useState<...>(null);
```

Remove the `rotationDeg` state and its sync effect (now in `usePlacementSync`):

```ts
// Remove:
const [rotationDeg, setRotationDeg] = useState(address?.rotationDeg ?? 0);
// and:
useEffect(() => {
  setRotationDeg(address?.rotationDeg ?? 0);
}, [address?.rotationDeg]);
```

Remove the entire `loadGeometry` `useEffect` (the one with `jordstykkeLokalId`, `loadParcelGeometry`, etc.).

Remove the `updateRotation` and `resetPlacement` function declarations.

Add the new hooks after the existing `useProject` destructure:

```ts
const geo = address?.centroid ?? address?.koordinater ?? null;
// ... existing derived values ...

const { parcelStatus, parcelGeojson, previewImage } = useParcelData({
  geo,
  jordstykkeLokalId: jordstykkeLokalId ?? null,
  adresseid: address?.adresseid ?? null,
});

const {
  rotationDeg,
  updateRotation,
  resetPlacement: resetPlacementSync,
} = usePlacementSync(address);
```

Update the `resetPlacement` call inside the button handler to pass the current values:

```ts
// In the reset button onClick:
onClick={() => resetPlacementSync(geo, initialCenterRef.current)}
```

The `ParcelFeatureCollection` type alias at the top of the file can be removed since it's no longer used directly in the component.

- [ ] **Step 4: Run TypeScript check**

```bash
bunx tsc --noEmit
```

Expected: no errors. Fix any type errors before continuing.

- [ ] **Step 5: Run tests**

```bash
bun test
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/hooks/usePlacementSync.ts src/components/cockpit/MatrikelMap.tsx
git commit -m "refactor(cockpit): MatrikelMap uses useParcelData + usePlacementSync; no route imports"
```

---

## Task 6 — `byggeoenske-constraint-view-model.ts` (pure lib + tests)

**Files:**

- Create: `src/lib/byggeoenske-constraint-view-model.ts`
- Create: `src/lib/byggeoenske-constraint-view-model.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/lib/byggeoenske-constraint-view-model.test.ts`:

```ts
import { describe, it, expect } from "bun:test";
import { buildStepConstraintViewModel } from "./byggeoenske-constraint-view-model";
import type {
  BoligoenskeValidering,
  ComplianceFlag,
  AdressePreCheckResultat,
} from "@/types/project-state";

function makeValidering(overrides: Partial<BoligoenskeValidering> = {}): BoligoenskeValidering {
  return {
    etagerStatus: "ok",
    arealStatus: "ok",
    beregnetBebyggelsespct: null,
    etagerDispensationAcknowledged: false,
    arealDispensationAcknowledged: false,
    ...overrides,
  };
}

function makePreCheck(
  maxEtager: number | null = 2,
  restBygningsareal: number | null = 80,
): AdressePreCheckResultat {
  return {
    blockers: [],
    advarsler: [],
    kontekst: {
      grundareal: 500,
      bebyggetAreal: 120,
      bebyggelsesprocent: 24,
      antalEtager: 1,
      maxBebyggelsesprocent: 30,
      maxEtager,
      maxBygningshoejde: 8.5,
      restBygningsareal,
      ejendomsvaerdi: null,
      grundvaerdi: null,
    },
    bbr: null,
    lokalplaner: [],
    kommuneplanramme: null,
    vurderingData: null,
    complianceMetrics: null,
  };
}

function makeFlag(id: string, overrides: Partial<ComplianceFlag> = {}): ComplianceFlag {
  return {
    id,
    label: id,
    status: "advarsel",
    detalje: null,
    aktuelVærdi: null,
    tilladt: null,
    kilde: "beregnet",
    ...overrides,
  };
}

describe("buildStepConstraintViewModel — antalEtager", () => {
  it("returns contextChip when maxEtager is known", () => {
    const vm = buildStepConstraintViewModel(
      "antalEtager",
      2,
      makeValidering(),
      makePreCheck(2),
      [],
    );
    expect(vm.contextChip).toContain("2 etager");
  });

  it("returns null contextChip when maxEtager is null", () => {
    const vm = buildStepConstraintViewModel(
      "antalEtager",
      2,
      makeValidering(),
      makePreCheck(null),
      [],
    );
    expect(vm.contextChip).toBeNull();
  });

  it("returns dispensation.needed=true when etagerStatus=dispensation and not acked", () => {
    const vm = buildStepConstraintViewModel(
      "antalEtager",
      3,
      makeValidering({ etagerStatus: "dispensation", etagerDispensationAcknowledged: false }),
      makePreCheck(2),
      [],
    );
    expect(vm.dispensation?.needed).toBe(true);
    expect(vm.dispensation?.acked).toBe(false);
  });

  it("returns dispensation.acked=true when acknowledged", () => {
    const vm = buildStepConstraintViewModel(
      "antalEtager",
      3,
      makeValidering({ etagerStatus: "dispensation", etagerDispensationAcknowledged: true }),
      makePreCheck(2),
      [],
    );
    expect(vm.dispensation?.acked).toBe(true);
    expect(vm.dispensation?.needed).toBe(false);
  });

  it("returns null dispensation when etagerStatus=ok", () => {
    const vm = buildStepConstraintViewModel(
      "antalEtager",
      2,
      makeValidering({ etagerStatus: "ok" }),
      makePreCheck(2),
      [],
    );
    expect(vm.dispensation).toBeNull();
  });
});

describe("buildStepConstraintViewModel — oensketAreal", () => {
  it("returns contextChip with restBygningsareal", () => {
    const vm = buildStepConstraintViewModel(
      "oensketAreal",
      100,
      makeValidering(),
      makePreCheck(2, 80),
      [],
    );
    expect(vm.contextChip).toContain("80 m²");
  });

  it("returns dispensation with beregnetPct when arealStatus=dispensation", () => {
    const vm = buildStepConstraintViewModel(
      "oensketAreal",
      120,
      makeValidering({ arealStatus: "dispensation", beregnetBebyggelsespct: 42 }),
      makePreCheck(2, 80),
      [],
    );
    expect(vm.dispensation?.needed).toBe(true);
    expect(vm.dispensation?.beregnetPct).toBe(42);
  });
});

describe("buildStepConstraintViewModel — varmekilde", () => {
  it("returns fjernvarme=tilgaengelig when tilslutningspligt flag present", () => {
    const vm = buildStepConstraintViewModel("varmekilde", "fjernvarme", null, null, [
      makeFlag("fjernvarme-tilslutningspligt"),
    ]);
    expect(vm.fjernvarme).toBe("tilgaengelig");
  });

  it("returns fjernvarme=mismatch when mismatch flag present", () => {
    const vm = buildStepConstraintViewModel("varmekilde", "varmepumpe", null, null, [
      makeFlag("fjernvarme-mismatch-ingen-daekning"),
    ]);
    expect(vm.fjernvarme).toBe("mismatch");
  });

  it("returns fjernvarme=unknown when no relevant flags", () => {
    const vm = buildStepConstraintViewModel("varmekilde", "varmepumpe", null, null, []);
    expect(vm.fjernvarme).toBe("unknown");
  });
});

describe("buildStepConstraintViewModel — tagform/facademateriale", () => {
  it("returns lokalplanHint when a flag with appliesTo matches", () => {
    const flag = makeFlag("lokalplan-tagform", {
      detalje: "Kun sadeltag tilladt",
      appliesTo: ["tagform"],
    });
    const vm = buildStepConstraintViewModel("tagform", "fladt", null, null, [flag]);
    expect(vm.lokalplanHint).toBe("Kun sadeltag tilladt");
  });

  it("returns null lokalplanHint when no matching flag", () => {
    const vm = buildStepConstraintViewModel("tagform", "fladt", null, null, []);
    expect(vm.lokalplanHint).toBeNull();
  });
});

describe("buildStepConstraintViewModel — unhandled stepKey", () => {
  it("returns all-null viewmodel for unknown step", () => {
    const vm = buildStepConstraintViewModel("budget", "3-5", null, null, []);
    expect(vm.contextChip).toBeNull();
    expect(vm.dispensation).toBeNull();
    expect(vm.fjernvarme).toBeNull();
    expect(vm.lokalplanHint).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
bun test src/lib/byggeoenske-constraint-view-model.test.ts
```

Expected: error — `Cannot find module './byggeoenske-constraint-view-model'`

- [ ] **Step 3: Create `src/lib/byggeoenske-constraint-view-model.ts`**

```ts
import type {
  Byggeoenske,
  ComplianceFlag,
  BoligoenskeValidering,
  AdressePreCheckResultat,
} from "@/types/project-state";
import { findFlagForStep } from "@/lib/compliance-flags-utils";

export type StepConstraintViewModel = {
  contextChip: string | null;
  dispensation: {
    needed: boolean;
    acked: boolean;
    kontekst: string;
    graense: string;
    beregnetPct: number | null;
  } | null;
  fjernvarme: "tilgaengelig" | "mismatch" | "unknown" | null;
  lokalplanHint: string | null;
};

const NONE: StepConstraintViewModel = {
  contextChip: null,
  dispensation: null,
  fjernvarme: null,
  lokalplanHint: null,
};

export function buildStepConstraintViewModel(
  stepKey: keyof Byggeoenske,
  value: unknown,
  validering: BoligoenskeValidering | null,
  preCheck: AdressePreCheckResultat | null,
  complianceFlags: ComplianceFlag[],
): StepConstraintViewModel {
  const k = preCheck?.kontekst;

  if (stepKey === "antalEtager") {
    const status = validering?.etagerStatus;
    const ack = validering?.etagerDispensationAcknowledged ?? false;
    return {
      contextChip:
        k?.maxEtager != null ? `Kommuneplanen tillader: maks ${k.maxEtager} etager` : null,
      dispensation:
        status === "dispensation"
          ? {
              needed: !ack,
              acked: ack,
              kontekst: `${String(value)} etager er ikke tilladt her`,
              graense: `${k?.maxEtager ?? "—"} etager`,
              beregnetPct: null,
            }
          : null,
      fjernvarme: null,
      lokalplanHint: null,
    };
  }

  if (stepKey === "oensketAreal") {
    const status = validering?.arealStatus;
    const ack = validering?.arealDispensationAcknowledged ?? false;
    const beregnetPct = validering?.beregnetBebyggelsespct ?? null;
    return {
      contextChip:
        k?.restBygningsareal != null ? `Dit byggepotentiale: ${k.restBygningsareal} m²` : null,
      dispensation:
        status === "dispensation"
          ? {
              needed: !ack,
              acked: ack,
              kontekst: `${String(value)} m² overstiger dit byggepotentiale`,
              graense: `${k?.maxBebyggelsesprocent ?? "—"}% bebyggelse`,
              beregnetPct,
            }
          : null,
      fjernvarme: null,
      lokalplanHint: null,
    };
  }

  if (stepKey === "varmekilde") {
    const hasTilslutning = complianceFlags.some((f) => f.id === "fjernvarme-tilslutningspligt");
    const hasMismatch = complianceFlags.some((f) => f.id === "fjernvarme-mismatch-ingen-daekning");
    return {
      ...NONE,
      fjernvarme: hasTilslutning ? "tilgaengelig" : hasMismatch ? "mismatch" : "unknown",
    };
  }

  if (stepKey === "tagform" || stepKey === "facademateriale") {
    const hint = findFlagForStep(complianceFlags, stepKey);
    return { ...NONE, lokalplanHint: hint ? (hint.detalje ?? hint.label) : null };
  }

  return { ...NONE };
}
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
bun test src/lib/byggeoenske-constraint-view-model.test.ts
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/byggeoenske-constraint-view-model.ts src/lib/byggeoenske-constraint-view-model.test.ts
git commit -m "feat(lib): add byggeoenske-constraint-view-model pure function with tests"
```

---

## Task 7 — `useDispensationFlow.ts` + `cockpit/index.tsx` update

**Files:**

- Create: `src/hooks/useDispensationFlow.ts`
- Modify: `src/components/cockpit/index.tsx`

- [ ] **Step 1: Create `src/hooks/useDispensationFlow.ts`**

```ts
import { useState } from "react";
import { useProject } from "@/lib/project-store";

export function useDispensationFlow(): {
  dispensationFor: "etager" | "areal" | null;
  open: (type: "etager" | "areal") => void;
  acknowledge: (type: "etager" | "areal") => void;
  close: () => void;
} {
  const [dispensationFor, setDispensationFor] = useState<"etager" | "areal" | null>(null);
  const { boligoenskeValidering, setBoligoenskeValidering } = useProject();

  const open = (type: "etager" | "areal") => setDispensationFor(type);
  const close = () => setDispensationFor(null);

  const acknowledge = (type: "etager" | "areal") => {
    if (!boligoenskeValidering) {
      close();
      return;
    }
    setBoligoenskeValidering({
      ...boligoenskeValidering,
      etagerDispensationAcknowledged:
        type === "etager" ? true : boligoenskeValidering.etagerDispensationAcknowledged,
      arealDispensationAcknowledged:
        type === "areal" ? true : boligoenskeValidering.arealDispensationAcknowledged,
    });
    close();
  };

  return { dispensationFor, open, acknowledge, close };
}
```

- [ ] **Step 2: Update `cockpit/index.tsx` — add imports**

Add these imports at the top of `src/components/cockpit/index.tsx`:

```ts
import { buildStepConstraintViewModel } from "@/lib/byggeoenske-constraint-view-model";
import { useDispensationFlow } from "@/hooks/useDispensationFlow";
```

- [ ] **Step 3: Update `ByggeoenskeAccordion` to use `useDispensationFlow`**

In `ByggeoenskeAccordion`, replace:

```ts
const [dispensationFor, setDispensationFor] = useState<"etager" | "areal" | null>(null);
```

with:

```ts
const {
  dispensationFor,
  open: openDispensation,
  acknowledge,
  close: closeDispensation,
} = useDispensationFlow();
```

Remove the `useState` import from the top if it is no longer used elsewhere in the file (check first).

Update `DispensationModal` props:

```ts
<DispensationModal
  type={dispensationFor}
  onAcknowledge={acknowledge}
  onClose={closeDispensation}
/>
```

Update `FieldEditor` calls:

```ts
onOpenDispensation={(t) => openDispensation(t)}
```

- [ ] **Step 4: Update `DispensationModal` to accept `onAcknowledge` prop**

Change `DispensationModal`'s props signature from:

```ts
function DispensationModal({
  type,
  onClose,
}: {
  type: "etager" | "areal" | null;
  onClose: () => void;
});
```

to:

```ts
function DispensationModal({
  type,
  onAcknowledge,
  onClose,
}: {
  type: "etager" | "areal" | null;
  onAcknowledge: (type: "etager" | "areal") => void;
  onClose: () => void;
});
```

Remove these lines from the component body (they are now in the hook):

```ts
const { boligoenskeValidering, setBoligoenskeValidering, adressePreCheck, byggeoenske } =
  useProject();
```

Keep only what the modal needs for display:

```ts
const { adressePreCheck, byggeoenske } = useProject();
```

Replace `handleAcknowledge`:

```ts
// Remove:
const handleAcknowledge = () => {
  if (!boligoenskeValidering || !type) return onClose();
  setBoligoenskeValidering({ ... });
  onClose();
};

// Replace with:
const handleAcknowledge = () => {
  if (!type) return onClose();
  onAcknowledge(type);
};
```

Update the button to call the new handler:

```ts
onClick = { handleAcknowledge };
```

- [ ] **Step 5: Update `StepExtras` to use `buildStepConstraintViewModel`**

Replace the entire body of `StepExtras` with a view-model driven renderer:

```ts
function StepExtras({
  stepKey,
  value,
  onOpenDispensation,
  onClearField,
}: {
  stepKey: keyof Byggeoenske;
  value: unknown;
  onOpenDispensation: (t: "etager" | "areal") => void;
  onClearField: () => void;
}) {
  const { adressePreCheck, complianceFlags, boligoenskeValidering } = useProject();

  const vm = buildStepConstraintViewModel(
    stepKey,
    value,
    boligoenskeValidering,
    adressePreCheck,
    complianceFlags,
  );

  return (
    <div className="mt-1.5 space-y-1.5">
      {vm.contextChip && (
        <div className="inline-flex items-center gap-1.5 rounded-md border border-border/60 bg-[#111] px-2 py-1 font-mono text-[10px] text-muted-foreground">
          <Info size={10} /> {vm.contextChip}
        </div>
      )}

      {vm.dispensation?.needed && (
        <div className="rounded-md border border-danger/40 bg-danger/5 p-2.5 text-xs">
          <div className="flex items-start gap-1.5 text-danger">
            <AlertTriangle size={12} className="mt-0.5 shrink-0" />
            <div>
              <div className="font-medium">{vm.dispensation.kontekst}</div>
              <div className="text-[11px] text-muted-foreground mt-0.5">
                Grænse: {vm.dispensation.graense}
                {vm.dispensation.beregnetPct != null &&
                  ` · Beregnet: ${vm.dispensation.beregnetPct.toFixed(0)}%`}
              </div>
            </div>
          </div>
          <div className="mt-2 flex gap-1.5">
            <button
              onClick={onClearField}
              className="rounded border border-border/60 px-2 py-1 font-mono text-[10px] hover:bg-[#1a1a1a]"
            >
              Vælg andet
            </button>
            <button
              onClick={() =>
                onOpenDispensation(stepKey === "antalEtager" ? "etager" : "areal")
              }
              className="rounded bg-amber-500/20 border border-amber-500/40 text-amber-300 px-2 py-1 font-mono text-[10px] hover:bg-amber-500/30"
            >
              Fortsæt med dispensation
            </button>
          </div>
        </div>
      )}

      {vm.dispensation?.acked && (
        <div className="inline-flex items-center gap-1.5 rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-1 font-mono text-[10px] text-amber-300">
          <AlertTriangle size={10} /> Dispensation nødvendig — accepteret
        </div>
      )}

      {vm.fjernvarme && (
        <div
          className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 font-mono text-[10px] ${
            vm.fjernvarme === "tilgaengelig"
              ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
              : vm.fjernvarme === "mismatch"
                ? "border-amber-500/40 bg-amber-500/10 text-amber-300"
                : "border-border/60 bg-[#111] text-muted-foreground"
          }`}
        >
          <Flame size={10} />
          {vm.fjernvarme === "tilgaengelig"
            ? "Fjernvarme tilgængeligt (mulig tilslutningspligt)"
            : vm.fjernvarme === "mismatch"
              ? "Fjernvarme: Ikke bekræftet på adressen"
              : "Fjernvarme: Status ukendt"}
        </div>
      )}

      {vm.lokalplanHint && (
        <div className="inline-flex items-center gap-1.5 rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-1 font-mono text-[10px] text-amber-300">
          📋 Lokalplanen specificerer: {vm.lokalplanHint}
        </div>
      )}
    </div>
  );
}
```

If `StepExtras` previously returned `null` for no extras, the new version returns an empty `<div>` — acceptable. Alternatively, add a guard:

```ts
if (!vm.contextChip && !vm.dispensation && !vm.fjernvarme && !vm.lokalplanHint) return null;
```

Add this guard before the `return (` line.

- [ ] **Step 6: Run TypeScript check and tests**

```bash
bunx tsc --noEmit && bun test
```

Expected: no errors, all tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/hooks/useDispensationFlow.ts src/components/cockpit/index.tsx
git commit -m "refactor(cockpit): StepExtras uses view-model builder; DispensationModal uses useDispensationFlow"
```

---

## Task 8 — `billedanalyse-tags.ts` (pure lib + tests)

**Files:**

- Create: `src/lib/billedanalyse-tags.ts`
- Create: `src/lib/billedanalyse-tags.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/lib/billedanalyse-tags.test.ts`:

```ts
import { describe, it, expect } from "bun:test";
import {
  uniqueTags,
  addTag,
  removeTag,
  resolveKonflikt,
  removeExtraTag,
  isRemoteImageUrl,
} from "./billedanalyse-tags";
import type { BilledeAnalyseResultat } from "@/lib/billede-analyse-vocabulary";

function makeResultat(overrides: Partial<BilledeAnalyseResultat> = {}): BilledeAnalyseResultat {
  return {
    kategorier: {
      facade: [],
      tagform: [],
      vinduer: [],
      materialer: [],
      saerligeTraek: [],
      farver: [],
      stil: [],
    },
    konflikter: [],
    ekstraTags: [],
    confidence: 0.9,
    kilde: "haiku",
    ...overrides,
  };
}

describe("uniqueTags", () => {
  it("removes exact duplicates", () => {
    expect(uniqueTags(["tegl", "tegl", "beton"])).toEqual(["tegl", "beton"]);
  });

  it("deduplicates case-insensitively", () => {
    expect(uniqueTags(["Tegl", "tegl"])).toEqual(["Tegl"]);
  });

  it("filters empty strings", () => {
    expect(uniqueTags(["tegl", "", "  "])).toEqual(["tegl"]);
  });

  it("returns empty array for empty input", () => {
    expect(uniqueTags([])).toEqual([]);
  });
});

describe("addTag", () => {
  it("adds tag to the specified category", () => {
    const r = makeResultat();
    const next = addTag("facade", "tegl", r);
    expect(next.kategorier.facade).toContain("tegl");
  });

  it("ignores empty string tags", () => {
    const r = makeResultat();
    const next = addTag("facade", "  ", r);
    expect(next.kategorier.facade).toHaveLength(0);
  });

  it("deduplicates on add", () => {
    const r = makeResultat({ kategorier: { ...makeResultat().kategorier, facade: ["tegl"] } });
    const next = addTag("facade", "tegl", r);
    expect(next.kategorier.facade).toHaveLength(1);
  });

  it("does not mutate the original", () => {
    const r = makeResultat();
    addTag("facade", "tegl", r);
    expect(r.kategorier.facade).toHaveLength(0);
  });
});

describe("removeTag", () => {
  it("removes the specified tag", () => {
    const r = makeResultat({
      kategorier: { ...makeResultat().kategorier, facade: ["tegl", "beton"] },
    });
    const next = removeTag("facade", "tegl", r);
    expect(next.kategorier.facade).toEqual(["beton"]);
  });

  it("does not mutate the original", () => {
    const r = makeResultat({ kategorier: { ...makeResultat().kategorier, facade: ["tegl"] } });
    removeTag("facade", "tegl", r);
    expect(r.kategorier.facade).toHaveLength(1);
  });
});

describe("resolveKonflikt", () => {
  it("merges chosen tags into category and removes the conflict", () => {
    const r = makeResultat({
      konflikter: [{ kategori: "facade", muligheder: [["tegl"], ["beton"]], billedAntal: [2, 1] }],
    });
    const next = resolveKonflikt("facade", ["tegl"], r);
    expect(next.kategorier.facade).toContain("tegl");
    expect(next.konflikter).toHaveLength(0);
  });

  it("only removes the conflict for the resolved category", () => {
    const r = makeResultat({
      konflikter: [
        { kategori: "facade", muligheder: [["tegl"], ["beton"]], billedAntal: [2, 1] },
        { kategori: "tagform", muligheder: [["fladt tag"], ["sadeltag"]], billedAntal: [1, 2] },
      ],
    });
    const next = resolveKonflikt("facade", ["tegl"], r);
    expect(next.konflikter).toHaveLength(1);
    expect(next.konflikter[0].kategori).toBe("tagform");
  });
});

describe("removeExtraTag", () => {
  it("removes the tag from ekstraTags", () => {
    const r = makeResultat({ ekstraTags: ["a", "b", "c"] });
    const next = removeExtraTag("b", r);
    expect(next.ekstraTags).toEqual(["a", "c"]);
  });
});

describe("isRemoteImageUrl", () => {
  it("returns true for https URL", () => {
    expect(isRemoteImageUrl("https://example.com/img.jpg")).toBe(true);
  });

  it("returns true for http URL", () => {
    expect(isRemoteImageUrl("http://example.com/img.jpg")).toBe(true);
  });

  it("returns false for data URL", () => {
    expect(isRemoteImageUrl("data:image/jpeg;base64,abc")).toBe(false);
  });

  it("returns false for empty string", () => {
    expect(isRemoteImageUrl("")).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
bun test src/lib/billedanalyse-tags.test.ts
```

Expected: error — `Cannot find module './billedanalyse-tags'`

- [ ] **Step 3: Create `src/lib/billedanalyse-tags.ts`**

```ts
import type {
  BilledeAnalyseKategorier,
  BilledeAnalyseResultat,
} from "@/lib/billede-analyse-vocabulary";

export function isRemoteImageUrl(url: string): boolean {
  return /^https?:\/\//i.test(url);
}

export function uniqueTags(tags: string[]): string[] {
  const seen = new Set<string>();
  const next: string[] = [];
  for (const raw of tags) {
    const tag = raw.trim();
    const key = tag.toLocaleLowerCase("da-DK");
    if (!tag || seen.has(key)) continue;
    seen.add(key);
    next.push(tag);
  }
  return next;
}

export function removeTag(
  kategori: keyof BilledeAnalyseKategorier,
  tag: string,
  current: BilledeAnalyseResultat,
): BilledeAnalyseResultat {
  return {
    ...current,
    kategorier: {
      ...current.kategorier,
      [kategori]: current.kategorier[kategori].filter((t) => t !== tag),
    },
  };
}

export function addTag(
  kategori: keyof BilledeAnalyseKategorier,
  tag: string,
  current: BilledeAnalyseResultat,
): BilledeAnalyseResultat {
  const nextTag = tag.trim();
  if (!nextTag) return current;
  return {
    ...current,
    kategorier: {
      ...current.kategorier,
      [kategori]: uniqueTags([...current.kategorier[kategori], nextTag]),
    },
  };
}

export function resolveKonflikt(
  kategori: keyof BilledeAnalyseKategorier,
  valgteTags: string[],
  current: BilledeAnalyseResultat,
): BilledeAnalyseResultat {
  return {
    ...current,
    kategorier: {
      ...current.kategorier,
      [kategori]: uniqueTags([...current.kategorier[kategori], ...valgteTags]),
    },
    konflikter: current.konflikter.filter((k) => k.kategori !== kategori),
  };
}

export function removeExtraTag(
  tag: string,
  current: BilledeAnalyseResultat,
): BilledeAnalyseResultat {
  return {
    ...current,
    ekstraTags: current.ekstraTags.filter((t) => t !== tag),
  };
}
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
bun test src/lib/billedanalyse-tags.test.ts
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/billedanalyse-tags.ts src/lib/billedanalyse-tags.test.ts
git commit -m "feat(lib): add billedanalyse-tags pure helpers with tests"
```

---

## Task 9 — `ai-design-workflow.service.ts`

**Files:**

- Create: `src/lib/services/` (directory)
- Create: `src/lib/services/ai-design-workflow.service.ts`

- [ ] **Step 1: Create `src/lib/services/ai-design-workflow.service.ts`**

```ts
import { uploadBillede, analyserBillederFn } from "@/lib/billede-analyse.functions";
import { generateDesignProposals } from "@/lib/ai-design.functions";
import type { BilledeAnalyseResultat } from "@/lib/billede-analyse-vocabulary";

export async function uploadInspirationImages(params: {
  files: Array<{ base64: string; mimeType: "image/jpeg" | "image/png" }>;
  projectId: string;
  accessToken: string;
}): Promise<{ signedUrls: string[]; paths: string[] }> {
  const signedUrls: string[] = [];
  const paths: string[] = [];

  for (const file of params.files) {
    const result = await uploadBillede({
      data: {
        base64: file.base64,
        mimeType: file.mimeType,
        projektId: params.projectId,
        accessToken: params.accessToken,
      },
    });
    signedUrls.push(result.signedUrl);
    paths.push(result.path);
  }

  return { signedUrls, paths };
}

export async function analyseInspirationImages(params: {
  signedUrls: string[];
}): Promise<BilledeAnalyseResultat> {
  return analyserBillederFn({ data: { billedUrls: params.signedUrls } });
}

export async function generateDesignProposalsService(params: {
  prompt: string;
  inspirationsUrls: string[];
  stil: string | undefined;
  facademateriale: string | undefined;
  projectId: string | undefined;
  addressId: string | undefined;
}): Promise<{ images: string[] }> {
  const result = await generateDesignProposals({ data: params });
  return { images: result.images };
}
```

- [ ] **Step 2: Run TypeScript check**

```bash
bunx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/services/ai-design-workflow.service.ts
git commit -m "feat(services): add ai-design-workflow application service"
```

---

## Task 10 — `useAiDesignWorkflow.ts`

**Files:**

- Create: `src/hooks/useAiDesignWorkflow.ts`

- [ ] **Step 1: Create `src/hooks/useAiDesignWorkflow.ts`**

```ts
import { useEffect, useRef, useState } from "react";
import { getSession } from "@/lib/auth";
import { useProject } from "@/lib/project-store";
import { syncPatch } from "@/lib/project-sync";
import { logger } from "@/lib/logger";
import {
  isRemoteImageUrl,
  addTag,
  removeTag,
  resolveKonflikt,
  removeExtraTag,
} from "@/lib/billedanalyse-tags";
import {
  uploadInspirationImages,
  analyseInspirationImages,
  generateDesignProposalsService,
} from "@/lib/services/ai-design-workflow.service";
import type {
  BilledeAnalyseKategorier,
  BilledeAnalyseResultat,
} from "@/lib/billede-analyse-vocabulary";
import type { Byggeoenske } from "@/types/project-state";

export type AnalyseState =
  | "idle"
  | "uploading"
  | "ready"
  | "analysing"
  | "conflict"
  | "validated"
  | "saved"
  | "error";

export type AiDesignWorkflowState = {
  droem: string;
  uploadedImages: string[];
  analyseState: AnalyseState;
  analyse: BilledeAnalyseResultat | null;
  forslag: string[];
  valgt: string | null;
  uploadError: string | null;
  error: string | null;
  loading: boolean;
  hasHardStop: boolean;
  analyseableImageCount: number;
};

export type AiDesignWorkflowActions = {
  setDroem: (v: string) => void;
  handleFiles: (files: FileList | null) => Promise<void>;
  removeUpload: (index: number) => void;
  handleAnalyser: () => Promise<void>;
  handleGem: () => void;
  handleGenerate: () => Promise<void>;
  handleSelect: (url: string) => void;
  resolveKonfliktAction: (kategori: keyof BilledeAnalyseKategorier, tags: string[]) => void;
  addTagAction: (kategori: keyof BilledeAnalyseKategorier, tag: string) => void;
  removeTagAction: (kategori: keyof BilledeAnalyseKategorier, tag: string) => void;
  removeExtraTagAction: (tag: string) => void;
};

function getUploadMimeType(file: File): "image/jpeg" | "image/png" | null {
  if (file.type === "image/jpeg" || file.type === "image/png") return file.type;
  return null;
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function useAiDesignWorkflow(): AiDesignWorkflowState & AiDesignWorkflowActions {
  const {
    byggeoenske,
    setByggeoenske,
    complianceFlags,
    billedanalyse,
    setBilledanalyse,
    address,
    currentProjectId,
  } = useProject();

  const hasHardStop = complianceFlags.some((f) => f.status === "blocker");
  const analyseableImageCount = (byggeoenske.inspirationsbilleder ?? []).filter(
    isRemoteImageUrl,
  ).length;

  const [droem, setDroem] = useState(byggeoenske.designDroem ?? "");
  const [forslag, setForslag] = useState<string[]>(byggeoenske.genererededDesignforslag ?? []);
  const [valgt, setValgt] = useState<string | null>(byggeoenske.valgteDesignforslag ?? null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadedImages, setUploadedImages] = useState<string[]>(
    byggeoenske.inspirationsbilleder ?? [],
  );
  const [analyseState, setAnalyseState] = useState<AnalyseState>(
    billedanalyse ? "saved" : analyseableImageCount > 0 ? "ready" : "idle",
  );
  const [analyse, setAnalyse] = useState<BilledeAnalyseResultat | null>(billedanalyse);
  const [uploadError, setUploadError] = useState<string | null>(null);

  useEffect(() => {
    if (!billedanalyse) return;
    setAnalyse(billedanalyse);
    setAnalyseState("saved");
  }, [billedanalyse]);

  const commitByggeoenskePatch = (patch: Partial<Byggeoenske>) => {
    const next = { ...useProject.getState().byggeoenske, ...patch };
    setByggeoenske(patch);
    void syncPatch({ byggeoenske: next });
  };

  const handleFiles = async (files: FileList | null) => {
    if (!files?.length) return;

    const availableSlots = Math.max(0, 4 - uploadedImages.length);
    if (availableSlots === 0) return;

    const projectId = useProject.getState().currentProjectId;
    if (!projectId) {
      setUploadError("Projektet er ikke klar til upload endnu. Prøv igen om et øjeblik.");
      setAnalyseState("error");
      return;
    }

    const selectedFiles = Array.from(files).slice(0, availableSlots);
    const unsupportedFile = selectedFiles.find((f) => !getUploadMimeType(f));
    if (unsupportedFile) {
      setUploadError("Upload kun JPG- eller PNG-billeder.");
      setAnalyseState("error");
      return;
    }

    const session = await getSession();
    const accessToken = session?.access_token;
    if (!accessToken) {
      setUploadError("Du skal være logget ind for at uploade inspirationsbilleder.");
      setAnalyseState("error");
      return;
    }

    setAnalyse(null);
    setError(null);
    setUploadError(null);
    setAnalyseState("uploading");

    const startCount = uploadedImages.length;

    try {
      const filePayloads: Array<{
        base64: string;
        mimeType: "image/jpeg" | "image/png";
        preview: string;
      }> = [];

      for (const file of selectedFiles) {
        const mimeType = getUploadMimeType(file);
        if (!mimeType) continue;
        const dataUrl = await fileToDataUrl(file);
        setUploadedImages((prev) => [...prev, dataUrl]);
        filePayloads.push({ base64: dataUrl.split(",")[1] ?? "", mimeType, preview: dataUrl });
      }

      if (filePayloads.length === 0) {
        setAnalyseState(analyseableImageCount > 0 ? "ready" : "idle");
        return;
      }

      const { signedUrls, paths } = await uploadInspirationImages({
        files: filePayloads.map(({ base64, mimeType }) => ({ base64, mimeType })),
        projectId,
        accessToken,
      });

      const current = useProject.getState().byggeoenske;
      commitByggeoenskePatch({
        inspirationsbilleder: [...(current.inspirationsbilleder ?? []), ...signedUrls],
        inspirationsbilledePaths: [...(current.inspirationsbilledePaths ?? []), ...paths],
      });
      setAnalyseState("ready");
    } catch (e) {
      logger.warn("[useAiDesignWorkflow] upload failed:", e);
      setUploadedImages((prev) => prev.slice(0, startCount));
      setUploadError("Upload fejlede. Prøv igen.");
      setAnalyseState("error");
    }
  };

  const removeUpload = (index: number) => {
    const nextImages = uploadedImages.filter((_, idx) => idx !== index);
    const current = useProject.getState().byggeoenske;
    const nextUrls = (current.inspirationsbilleder ?? []).filter((_, idx) => idx !== index);
    const nextPaths = (current.inspirationsbilledePaths ?? []).filter((_, idx) => idx !== index);

    setUploadedImages(nextImages);
    setAnalyse(null);
    setUploadError(null);
    commitByggeoenskePatch({
      inspirationsbilleder: nextUrls,
      inspirationsbilledePaths: nextPaths,
    });
    setAnalyseState(nextUrls.filter(isRemoteImageUrl).length > 0 ? "ready" : "idle");
  };

  const handleAnalyser = async () => {
    const signedUrls = (useProject.getState().byggeoenske.inspirationsbilleder ?? [])
      .filter(isRemoteImageUrl)
      .slice(0, 4);
    if (signedUrls.length === 0) return;

    setAnalyseState("analysing");
    setUploadError(null);

    try {
      const result = await analyseInspirationImages({ signedUrls });
      setAnalyse(result);
      setAnalyseState(result.konflikter.length > 0 ? "conflict" : "validated");
    } catch (e) {
      logger.warn("[useAiDesignWorkflow] billedanalyse failed:", e);
      setUploadError("Analyse fejlede. Prøv igen.");
      setAnalyseState("error");
    }
  };

  const handleGem = () => {
    if (!analyse || analyse.konflikter.length > 0) return;
    setBilledanalyse(analyse);
    void syncPatch({ billedanalyse: analyse });
    setAnalyseState("saved");
  };

  const handleGenerate = async () => {
    if (!droem.trim() && uploadedImages.length === 0) {
      setError("Beskriv dit drømmehus eller upload mindst ét inspirationsbillede.");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const remoteImages = (useProject.getState().byggeoenske.inspirationsbilleder ?? []).filter(
        isRemoteImageUrl,
      );
      const result = await generateDesignProposalsService({
        prompt: droem.trim() || "Moderne dansk enfamiliehus",
        inspirationsUrls: (remoteImages.length > 0 ? remoteImages : uploadedImages).slice(0, 4),
        stil: byggeoenske.arkitektoniskStil,
        facademateriale: byggeoenske.facademateriale,
        projectId: currentProjectId ?? undefined,
        addressId: address?.adresseid ?? undefined,
      });
      setForslag(result.images);
      commitByggeoenskePatch({
        designDroem: droem,
        genererededDesignforslag: result.images,
      });
    } catch (e) {
      logger.warn("[useAiDesignWorkflow] generation failed:", e);
      setError("Kunne ikke generere forslag. Prøv igen.");
    } finally {
      setLoading(false);
    }
  };

  const handleSelect = (url: string) => {
    setValgt(url);
    commitByggeoenskePatch({ valgteDesignforslag: url });
  };

  const resolveKonfliktAction = (kategori: keyof BilledeAnalyseKategorier, tags: string[]) => {
    if (!analyse) return;
    const updated = resolveKonflikt(kategori, tags, analyse);
    setAnalyse(updated);
    setAnalyseState(updated.konflikter.length > 0 ? "conflict" : "validated");
  };

  const addTagAction = (kategori: keyof BilledeAnalyseKategorier, tag: string) => {
    if (!analyse) return;
    setAnalyse(addTag(kategori, tag, analyse));
  };

  const removeTagAction = (kategori: keyof BilledeAnalyseKategorier, tag: string) => {
    if (!analyse) return;
    setAnalyse(removeTag(kategori, tag, analyse));
  };

  const removeExtraTagAction = (tag: string) => {
    if (!analyse) return;
    setAnalyse(removeExtraTag(tag, analyse));
  };

  return {
    droem,
    uploadedImages,
    analyseState,
    analyse,
    forslag,
    valgt,
    uploadError,
    error,
    loading,
    hasHardStop,
    analyseableImageCount,
    setDroem,
    handleFiles,
    removeUpload,
    handleAnalyser,
    handleGem,
    handleGenerate,
    handleSelect,
    resolveKonfliktAction,
    addTagAction,
    removeTagAction,
    removeExtraTagAction,
  };
}
```

- [ ] **Step 2: Run TypeScript check**

```bash
bunx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useAiDesignWorkflow.ts
git commit -m "feat(hooks): add useAiDesignWorkflow — thin React hook over ai-design-workflow service"
```

---

## Task 11 — `AiDesignHero.tsx` refactor

**Files:**

- Modify: `src/components/cockpit/AiDesignHero.tsx`

- [ ] **Step 1: Rewrite `src/components/cockpit/AiDesignHero.tsx`**

Replace the entire file content:

```tsx
import { useRef } from "react";
import { motion } from "framer-motion";
import { Sparkles, Upload, X, Check, Loader2, ShieldAlert } from "lucide-react";
import { Card } from "@/components/wizard-ui";
import { Textarea } from "@/components/ui/textarea";
import { useAiDesignWorkflow } from "@/hooks/useAiDesignWorkflow";
import { cn } from "@/lib/utils";
import type {
  BilledeAnalyseKategorier,
  BilledeAnalyseResultat,
} from "@/lib/billede-analyse-vocabulary";

const ANALYSE_KATEGORIER = [
  "facade",
  "tagform",
  "vinduer",
  "materialer",
  "saerligeTraek",
  "farver",
  "stil",
] as const satisfies readonly (keyof BilledeAnalyseKategorier)[];

const KATEGORI_LABELS: Record<keyof BilledeAnalyseKategorier, string> = {
  facade: "Facade",
  tagform: "Tagform",
  vinduer: "Vinduer",
  materialer: "Materialer",
  saerligeTraek: "Særlige træk",
  farver: "Farver",
  stil: "Stil",
};

export function AiDesignHero() {
  const {
    droem,
    uploadedImages,
    analyseState,
    analyse,
    forslag,
    valgt,
    uploadError,
    error,
    loading,
    hasHardStop,
    analyseableImageCount,
    setDroem,
    handleFiles,
    removeUpload,
    handleAnalyser,
    handleGem,
    handleGenerate,
    handleSelect,
    resolveKonfliktAction,
    addTagAction,
    removeTagAction,
    removeExtraTagAction,
  } = useAiDesignWorkflow();

  const fileRef = useRef<HTMLInputElement>(null);

  return (
    <Card className="p-0 overflow-hidden mb-6 border-accent/30 bg-gradient-to-br from-[#0c0c0c] to-[#141414]">
      <div className="px-5 py-4 border-b border-border/40 flex items-center gap-2">
        <Sparkles size={14} className="text-accent" />
        <div className="font-mono text-[11px] tracking-[0.2em] text-accent">DRØM DIT HJEM</div>
      </div>

      <div className="grid gap-4 p-5 md:grid-cols-[1fr_auto] items-start">
        <div className="space-y-3 min-w-0">
          <Textarea
            value={droem}
            onChange={(e) => setDroem(e.target.value)}
            placeholder="Beskriv dit drømmehus - fx 'lyst skandinavisk minimalistisk hus med store glaspartier mod haven, sortmalet træfacade og fladt tag...'"
            className="min-h-[88px] bg-[#0a0a0a] border-border/60 text-sm"
          />

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={uploadedImages.length >= 4 || analyseState === "uploading"}
              className="inline-flex items-center gap-1.5 rounded-md border border-border/60 bg-[#111] px-3 py-1.5 font-mono text-[11px] text-foreground hover:border-accent/50 transition-colors disabled:opacity-50"
            >
              {analyseState === "uploading" ? (
                <>
                  <Loader2 size={12} className="animate-spin" /> Uploader...
                </>
              ) : (
                <>
                  <Upload size={12} /> Inspiration ({uploadedImages.length}/4)
                </>
              )}
            </button>
            <button
              type="button"
              onClick={handleAnalyser}
              disabled={analyseState !== "ready" || analyseableImageCount === 0}
              className="inline-flex items-center gap-1.5 rounded-md border border-border/60 bg-[#111] px-3 py-1.5 font-mono text-[11px] text-foreground hover:border-accent/50 transition-colors disabled:opacity-50"
            >
              {analyseState === "analysing" ? (
                <>
                  <Loader2 size={12} className="animate-spin" /> Analyserer...
                </>
              ) : (
                <>
                  <Sparkles size={12} /> Analyser billeder
                </>
              )}
            </button>
            <input
              ref={fileRef}
              type="file"
              multiple
              accept="image/png,image/jpeg"
              className="hidden"
              onChange={(e) => void handleFiles(e.target.files)}
            />
            {uploadedImages.map((src, i) => (
              <div
                key={src + i}
                className="relative group h-9 w-9 rounded overflow-hidden border border-border/60"
              >
                <img src={src} alt="" className="h-full w-full object-cover" />
                <button
                  type="button"
                  onClick={() => removeUpload(i)}
                  className="absolute inset-0 bg-black/70 opacity-0 group-hover:opacity-100 flex items-center justify-center text-foreground"
                  aria-label="Fjern billede"
                >
                  <X size={11} />
                </button>
              </div>
            ))}
          </div>

          {uploadError && <div className="text-xs text-danger">{uploadError}</div>}
          {error && <div className="text-xs text-danger">{error}</div>}
        </div>

        {hasHardStop ? (
          <div className="inline-flex h-[88px] min-w-[160px] items-center justify-center gap-2 rounded-md border border-danger/40 bg-danger/5 px-4 font-mono text-xs text-danger text-center leading-snug">
            <ShieldAlert size={14} className="shrink-0" />
            <span>
              Design blokeret
              <br />
              af compliance-stop
            </span>
          </div>
        ) : (
          <button
            type="button"
            onClick={handleGenerate}
            disabled={loading}
            className="inline-flex h-[88px] min-w-[160px] items-center justify-center gap-2 rounded-md bg-accent px-5 font-mono text-sm text-accent-foreground hover:brightness-110 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {loading ? (
              <>
                <Loader2 size={14} className="animate-spin" /> Genererer...
              </>
            ) : (
              <>
                <Sparkles size={14} /> Generér 3 forslag
              </>
            )}
          </button>
        )}
      </div>

      {analyse &&
        (analyseState === "conflict" ||
          analyseState === "validated" ||
          analyseState === "saved") && (
          <AnalysePanel
            analyse={analyse}
            analyseState={analyseState}
            onResolveKonflikt={resolveKonfliktAction}
            onAddTag={addTagAction}
            onRemoveTag={removeTagAction}
            onRemoveExtraTag={removeExtraTagAction}
            onGem={handleGem}
          />
        )}

      {forslag.length > 0 && (
        <div className="px-5 pb-5">
          <div className="grid gap-3 md:grid-cols-3">
            {forslag.map((url, i) => {
              const erValgt = valgt === url;
              return (
                <motion.button
                  key={url + i}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.08 }}
                  onClick={() => handleSelect(url)}
                  className={cn(
                    "relative overflow-hidden rounded-md border-2 transition-all aspect-[4/3] bg-[#111]",
                    erValgt
                      ? "border-accent ring-2 ring-accent/40"
                      : "border-border/60 hover:border-accent/60",
                  )}
                >
                  <img src={url} alt={`Forslag ${i + 1}`} className="h-full w-full object-cover" />
                  <div className="absolute top-2 left-2 rounded bg-black/70 px-2 py-0.5 font-mono text-[10px] text-foreground">
                    FORSLAG {i + 1}
                  </div>
                  {erValgt && (
                    <div className="absolute top-2 right-2 rounded-full bg-accent p-1 text-accent-foreground">
                      <Check size={10} strokeWidth={3} />
                    </div>
                  )}
                </motion.button>
              );
            })}
          </div>
        </div>
      )}
    </Card>
  );
}

function AnalysePanel({
  analyse,
  analyseState,
  onResolveKonflikt,
  onAddTag,
  onRemoveTag,
  onRemoveExtraTag,
  onGem,
}: {
  analyse: BilledeAnalyseResultat;
  analyseState: string;
  onResolveKonflikt: (kategori: keyof BilledeAnalyseKategorier, tags: string[]) => void;
  onAddTag: (kategori: keyof BilledeAnalyseKategorier, tag: string) => void;
  onRemoveTag: (kategori: keyof BilledeAnalyseKategorier, tag: string) => void;
  onRemoveExtraTag: (tag: string) => void;
  onGem: () => void;
}) {
  const isSaved = analyseState === "saved";

  return (
    <div className="px-5 pb-5 space-y-4">
      {analyse.konflikter.map((konflikt) => (
        <div
          key={konflikt.kategori}
          className="rounded-md border border-warning/40 bg-warning/5 p-4"
        >
          <div className="font-mono text-[10px] text-warning uppercase tracking-wider mb-2">
            Dine billeder trækker i to retninger for{" "}
            <span className="text-foreground">{KATEGORI_LABELS[konflikt.kategori]}</span>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {konflikt.muligheder.map((tags, i) => (
              <button
                key={`${konflikt.kategori}-${i}`}
                type="button"
                onClick={() => onResolveKonflikt(konflikt.kategori, tags)}
                disabled={isSaved}
                className="rounded-md border border-border/60 bg-[#111] p-3 text-left hover:border-accent/50 transition-colors disabled:opacity-60"
              >
                <div className="font-mono text-[11px] text-foreground mb-1">
                  Retning {String.fromCharCode(65 + i)}
                </div>
                <div className="text-xs text-muted-foreground">{tags.join(" · ")}</div>
                <div className="font-mono text-[10px] text-muted-foreground/60 mt-1">
                  {konflikt.billedAntal[i] ?? 0} billede
                  {(konflikt.billedAntal[i] ?? 0) !== 1 ? "r" : ""}
                </div>
              </button>
            ))}
          </div>
        </div>
      ))}

      {ANALYSE_KATEGORIER.filter((k) => analyse.kategorier[k].length > 0).map((kategori) => (
        <div key={kategori}>
          <div className="font-mono text-[10px] text-muted-foreground uppercase tracking-wider mb-1.5">
            {KATEGORI_LABELS[kategori]}
          </div>
          <div className="flex flex-wrap gap-1.5 items-center">
            {analyse.kategorier[kategori].map((tag) => (
              <span
                key={`${kategori}-${tag}`}
                className="inline-flex items-center gap-1 rounded-full border border-accent/40 bg-accent/10 px-2.5 py-0.5 font-mono text-[11px] text-accent"
              >
                {tag}
                {!isSaved && (
                  <button
                    type="button"
                    onClick={() => onRemoveTag(kategori, tag)}
                    className="opacity-60 hover:opacity-100 ml-0.5"
                    aria-label={`Fjern ${tag}`}
                  >
                    <X size={9} />
                  </button>
                )}
              </span>
            ))}
            {!isSaved && (
              <input
                type="text"
                placeholder="+ tilføj"
                className="w-24 bg-transparent font-mono text-[11px] text-muted-foreground border-b border-border/40 focus:outline-none focus:border-accent/60 pb-0.5"
                onKeyDown={(e) => {
                  if (e.key !== "Enter") return;
                  e.preventDefault();
                  const value = e.currentTarget.value.trim();
                  if (!value) return;
                  onAddTag(kategori, value);
                  e.currentTarget.value = "";
                }}
              />
            )}
          </div>
        </div>
      ))}

      {analyse.ekstraTags.length > 0 && (
        <div>
          <div className="font-mono text-[10px] text-muted-foreground uppercase tracking-wider mb-1.5">
            Yderligere detaljer
          </div>
          <div className="flex flex-wrap gap-1.5">
            {analyse.ekstraTags.map((tag) => (
              <span
                key={`extra-${tag}`}
                className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-[#111] px-2.5 py-0.5 font-mono text-[11px] text-muted-foreground"
              >
                {tag}
                {!isSaved && (
                  <button
                    type="button"
                    onClick={() => onRemoveExtraTag(tag)}
                    className="opacity-60 hover:opacity-100 ml-0.5"
                    aria-label={`Fjern ${tag}`}
                  >
                    <X size={9} />
                  </button>
                )}
              </span>
            ))}
          </div>
        </div>
      )}

      {!isSaved ? (
        <button
          type="button"
          onClick={onGem}
          disabled={analyse.konflikter.length > 0}
          className="inline-flex items-center gap-1.5 rounded-md bg-accent px-4 py-2 font-mono text-[11px] text-accent-foreground hover:brightness-110 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Check size={12} /> Gem analyse
        </button>
      ) : (
        <div className="font-mono text-[11px] text-accent flex items-center gap-1.5">
          <Check size={12} /> Analyse gemt
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Run TypeScript check**

```bash
bunx tsc --noEmit
```

Expected: no errors. Fix any type errors before continuing.

- [ ] **Step 3: Run tests**

```bash
bun test
```

Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/components/cockpit/AiDesignHero.tsx
git commit -m "refactor(cockpit): AiDesignHero delegates to useAiDesignWorkflow — renderers only"
```

---

## Task 12 — Final verification

- [ ] **Step 1: Full TypeScript check**

```bash
bunx tsc --noEmit
```

Expected: zero errors.

- [ ] **Step 2: Full test suite**

```bash
bun test
```

Expected: all tests pass (count should be ≥ previous baseline + new tests).

- [ ] **Step 3: Lint**

```bash
bunx eslint .
```

Expected: no new errors or warnings. Fix any that appear.

- [ ] **Step 4: Build**

```bash
bun run build
```

Expected: build completes without errors.

- [ ] **Step 5: Verify boundary checklist**

Run these greps — all should return zero matches:

```bash
# MatrikelMap must not import from routes (except fetchSkærmkortTile which is tile infrastructure)
grep -n "fetchParcelGeometry\|fetchParcelGeometryById\|fetchMatriklenPreview" src/components/cockpit/MatrikelMap.tsx

# AiDesignHero must not call getSession or syncPatch directly
grep -n "getSession\|syncPatch\|useProject.getState\|uploadBillede\|analyserBillederFn\|generateDesignProposals" src/components/cockpit/AiDesignHero.tsx

# StepExtras must not contain hardcoded flag IDs
grep -n "fjernvarme-tilslutningspligt\|fjernvarme-mismatch\|etagerStatus\|arealStatus" src/components/cockpit/index.tsx

# BudgetKalkulator must not contain pure calculation functions
grep -n "beregnNedrivning\|beregnForsyning\|beregnGeoteknik\|beregnNybyg\|beregnBudget" src/components/cockpit/BudgetKalkulator.tsx
```

All four commands must return empty output.

- [ ] **Step 6: Final commit**

```bash
git add -A
git commit -m "chore(verify): components audit boundary checklist confirmed green"
```

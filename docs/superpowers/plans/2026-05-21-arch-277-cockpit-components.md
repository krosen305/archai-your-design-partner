# ARCH-277: cockpit-components Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract the `patch` / reactive compliance / `boligoenskeValidering` logic from `ByggeoenskeAccordion` into a `useCockpitByggeoensker` hook, and move upload logic into a `useCockpitUpload` hook, so `src/components/cockpit/index.tsx` becomes a UI composition layer rather than a domain logic module.

**Architecture:** `useCockpitByggeoensker` encapsulates: immediate store update, synchronous `computePartialUpdate` call, `boligoenskeValidering` calculation, debounced `syncPatch`. `useCockpitUpload` encapsulates: Supabase storage upload, store update, error handling. `ByggeoenskeAccordion` calls hooks and renders; it no longer reaches `useProject.getState()` directly. Event handler `any` casts are replaced with proper React types.

**Tech Stack:** TypeScript, React, Bun test, Zustand.

---

## File Map

| Action | File |
|--------|------|
| Create | `src/lib/use-cockpit-byggeoensker.ts` |
| Create | `src/lib/use-cockpit-upload.ts` |
| Modify | `src/components/cockpit/index.tsx` |

---

### Task 1: Create `useCockpitByggeoensker` hook

**Files:**
- Create: `src/lib/use-cockpit-byggeoensker.ts`

- [ ] **Step 1: Read the full `patch` function in `index.tsx`**

Open `src/components/cockpit/index.tsx` and read lines 155–230 (the `ByggeoenskeAccordion` component and its `patch` function). Make note of:
- All `useProject.getState()` calls
- All `computePartialUpdate` inputs
- The `boligoenskeValidering` calculation logic

- [ ] **Step 2: Create the hook**

```typescript
// src/lib/use-cockpit-byggeoensker.ts
// Encapsulates reactive compliance compute and boligoenskeValidering for cockpit.

import { useRef } from "react";
import type { Byggeoenske } from "@/types/project-state";
import { useProject } from "./project-store";
import { computePartialUpdate } from "./reactive-compliance";
import { syncPatch } from "./project-sync";
import type { GeusRiskData } from "@/integrations/geus/client";
import type { TinglysningResult } from "@/integrations/tinglysning/client";
import type { TerrainData } from "@/integrations/sdfi/dhm-client";
import type { FbbResultat } from "@/integrations/fbb/client";
import type { NaturbeskyttelsesResultat } from "@/integrations/sdfi/naturbeskyttelse";
import type { DkJordResultat } from "@/integrations/miljoe/dkjord";

export type ReactiveContext = {
  geusRisk: GeusRiskData | null;
  servitutter: TinglysningResult | null;
  terrain: TerrainData | null;
  fbbData: FbbResultat | null;
  naturbeskyttelse: NaturbeskyttelsesResultat | null;
  dkjord: DkJordResultat | null;
};

export function useCockpitByggeoensker(reactiveContext: ReactiveContext) {
  const { setByggeoenske } = useProject();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function patch(partial: Partial<Byggeoenske>) {
    setByggeoenske(partial);

    const state = useProject.getState();

    if (state.bbrData) {
      const { complianceMetrics: cm, complianceFlags } = computePartialUpdate({
        bbr: state.bbrData,
        ramme: state.kommuneplanramme,
        lokalplanExtract: state.lokalplanExtract,
        lokalplaner: state.lokalplaner,
        naturbeskyttelse: reactiveContext.naturbeskyttelse,
        geusRisk: reactiveContext.geusRisk,
        servitutter: reactiveContext.servitutter,
        terrain: reactiveContext.terrain,
        fbbData: reactiveContext.fbbData,
        dkjord: reactiveContext.dkjord,
        byggeoenske: { ...state.byggeoenske, ...partial },
        municipality: state.address?.kommune ?? "",
        kommunekode: state.address?.kommunekode ?? "",
      });
      state.setComplianceMetrics(cm);
      state.setComplianceFlags(complianceFlags);
    }

    const k = state.adressePreCheck?.kontekst;
    const merged = { ...state.byggeoenske, ...partial };
    const valgtEtager = typeof merged.antalEtager === "number" ? merged.antalEtager : null;
    const valgtAreal = typeof merged.oensketAreal === "number" ? merged.oensketAreal : null;
    const eksAreal = state.bbrData?.bebygget_areal ?? 0;
    const grundareal = k?.grundareal ?? state.complianceMetrics?.grundareal ?? null;
    const samletAreal =
      merged.byggetype === "tilbyg" ? eksAreal + (valgtAreal ?? 0) : (valgtAreal ?? eksAreal);
    const beregnetPct = grundareal && grundareal > 0 ? (samletAreal / grundareal) * 100 : null;
    const maxPct = k?.maxBebyggelsesprocent ?? state.complianceMetrics?.maxBebyggelsesprocent ?? null;
    const maxEtager = k?.maxEtager ?? state.complianceMetrics?.maxEtager ?? null;

    const etagerStatus: "ok" | "dispensation" | "ingen_data" =
      valgtEtager == null || maxEtager == null
        ? "ingen_data"
        : valgtEtager > maxEtager
          ? "dispensation"
          : "ok";
    const arealStatus: "ok" | "dispensation" | "ingen_data" =
      valgtAreal == null || maxPct == null || beregnetPct == null
        ? "ingen_data"
        : beregnetPct > maxPct
          ? "dispensation"
          : "ok";

    const prev = state.boligoenskeValidering;
    state.setBoligoenskeValidering({
      etagerStatus,
      arealStatus,
      beregnetBebyggelsespct: beregnetPct,
      etagerDispensationAcknowledged:
        etagerStatus === "dispensation" ? (prev?.etagerDispensationAcknowledged ?? false) : false,
      arealDispensationAcknowledged:
        arealStatus === "dispensation" ? (prev?.arealDispensationAcknowledged ?? false) : false,
    });

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      void syncPatch({ byggeoenske: { ...state.byggeoenske, ...partial } });
    }, 500);
  }

  return { patch };
}
```

- [ ] **Step 2: Verify type check**

```bash
bunx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/use-cockpit-byggeoensker.ts
git commit -m "feat(arch-277): extract useCockpitByggeoensker hook"
```

---

### Task 2: Create `useCockpitUpload` hook

**Files:**
- Create: `src/lib/use-cockpit-upload.ts`

- [ ] **Step 1: Read the upload logic in `index.tsx`**

In `src/components/cockpit/index.tsx`, find the upload-related logic (look for `uploadInspirationsbillede`, file input handlers, base64 conversion). Note the state variables managed: `isUploading`, error messages, current inspirationsbilleder.

- [ ] **Step 2: Create the hook**

```typescript
// src/lib/use-cockpit-upload.ts
// Encapsulates inspirationsbilleder upload flow for the cockpit.

import { useState } from "react";
import { useProject } from "./project-store";
import { uploadInspirationsbillede } from "./projekt-service";
import { syncPatch } from "./project-sync";

export function useCockpitUpload() {
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const { byggeoenske, setByggeoenske } = useProject();

  async function handleUpload(file: File) {
    if (!file.type.startsWith("image/")) {
      setUploadError("Kun billedfiler er tilladt");
      return;
    }
    setIsUploading(true);
    setUploadError(null);

    try {
      const url = await uploadInspirationsbillede(file);
      const updated = [...(byggeoenske.inspirationsbilleder ?? []), url];
      setByggeoenske({ inspirationsbilleder: updated });
      void syncPatch({ byggeoenske: { inspirationsbilleder: updated } });
    } catch {
      setUploadError("Upload fejlede — prøv igen");
    } finally {
      setIsUploading(false);
    }
  }

  function handleRemoveImage(url: string) {
    const updated = (byggeoenske.inspirationsbilleder ?? []).filter((u) => u !== url);
    setByggeoenske({ inspirationsbilleder: updated });
    void syncPatch({ byggeoenske: { inspirationsbilleder: updated } });
  }

  return {
    isUploading,
    uploadError,
    handleUpload,
    handleRemoveImage,
    inspirationsbilleder: byggeoenske.inspirationsbilleder ?? [],
  };
}
```

Note: If the actual upload implementation in `index.tsx` differs in structure (different state, different helper calls), adapt the hook body to match what `index.tsx` actually does rather than following the template above verbatim.

- [ ] **Step 3: Verify type check**

```bash
bunx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add src/lib/use-cockpit-upload.ts
git commit -m "feat(arch-277): extract useCockpitUpload hook"
```

---

### Task 3: Refactor `ByggeoenskeAccordion` to use extracted hooks

**Files:**
- Modify: `src/components/cockpit/index.tsx`

- [ ] **Step 1: Import and wire up `useCockpitByggeoensker`**

In `ByggeoenskeAccordion`, add:
```typescript
import { useCockpitByggeoensker } from "@/lib/use-cockpit-byggeoensker";
```

Replace the inline `debounceRef`, the `patch` function body (all 50+ lines including `computePartialUpdate` call and `boligoenskeValidering` calculation), and the debounce timeout code with:

```typescript
const { patch } = useCockpitByggeoensker(reactiveContext);
```

Remove the now-unused `debounceRef` declaration and the `import { computePartialUpdate }` if no longer used elsewhere in the file.

- [ ] **Step 2: Wire up `useCockpitUpload` for the upload section**

Find the file input / upload section of the cockpit (look for `<input type="file">`). Replace the inline upload state and handlers with:

```typescript
import { useCockpitUpload } from "@/lib/use-cockpit-upload";
// ...
const { isUploading, uploadError, handleUpload, handleRemoveImage, inspirationsbilleder } =
  useCockpitUpload();
```

Replace the file input `onChange` handler cast:
```typescript
// Before:
onChange={(e: any) => { ... }}

// After:
onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
  const file = e.target.files?.[0];
  if (file) void handleUpload(file);
}}
```

- [ ] **Step 3: Fix remaining `any` event handler casts**

Search for `(e: any)` in `index.tsx` and replace with proper React event types:
- Input change: `React.ChangeEvent<HTMLInputElement>`
- Button click: `React.MouseEvent<HTMLButtonElement>`
- Select change: `React.ChangeEvent<HTMLSelectElement>`

- [ ] **Step 4: Run type check and tests**

```bash
bunx tsc --noEmit && bun test
```

Expected: No errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/cockpit/index.tsx
git commit -m "refactor(arch-277): ByggeoenskeAccordion uses useCockpitByggeoensker + useCockpitUpload hooks"
```

---

### Task 4: Final verification

- [ ] **Step 1: Run full test suite**

```bash
bun test
```

Expected: All tests pass.

- [ ] **Step 2: Type check**

```bash
bunx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 3: Verify no `useProject.getState()` in cockpit component render**

```bash
grep "useProject.getState" src/components/cockpit/index.tsx
```

Expected: No matches (all `getState()` calls moved into hooks).

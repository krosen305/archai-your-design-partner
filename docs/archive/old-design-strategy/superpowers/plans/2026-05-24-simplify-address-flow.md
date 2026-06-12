# Simplify Address Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Strip the address screen to pure input+navigation, delete three dead modules, and let the cockpit's existing LoadingView (4 progress bars) handle all analysis.

**Architecture:** The cockpit already runs `fetchCompliance` and shows `LoadingView` when `bbrData` is null — this is the waiting screen the user wants. We remove the parallel analysis path that ran on the address screen (`preCheckAdresse` + `fetchAddressDetails`), which eliminates a redundant DAR call and a hang on the first screen. After address selection the user clicks "Videre" and the cockpit handles everything.

**Tech Stack:** TypeScript, React, TanStack Router, Bun test, Zod, Supabase

---

## What is being deleted

| File                                                           | Reason                                                                         |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `src/lib/use-address-precheck.ts`                              | Only consumer of both dead server fns — deleted entirely                       |
| `src/lib/pre-check-adresse.ts`                                 | ⚠️ PROTECTED FILE. Only called from `use-address-precheck`. Becomes dead code. |
| `fetchAddressDetails` export in `src/lib/adresse.functions.ts` | Only called from `use-address-precheck`                                        |

## What is being simplified

| File                                      | Change                                                                          |
| ----------------------------------------- | ------------------------------------------------------------------------------- |
| `src/routes/projekt.adresse.tsx`          | Remove all compliance display + hook. Keep autocomplete + chip + Videre button. |
| `src/components/cockpit/EjendomPanel.tsx` | Remove `adressePreCheck` fallback reads (dead after store change)               |
| `src/components/cockpit/index.tsx`        | Remove `adressePreCheck?.kontekst` reads (dead after store change)              |
| `src/lib/use-cockpit-byggeoensker.ts`     | Remove `adressePreCheck?.kontekst` read                                         |
| `src/lib/project-store.ts`                | ⚠️ PROTECTED FILE. Remove `adressePreCheck` state field and setter.             |

## What is NOT touched

- `src/lib/cockpit.functions.ts` — `fetchCompliance` is the new single analysis path
- `src/hooks/useCockpitAnalysis.ts` — already handles loading/done/error
- `src/components/cockpit/AnalyseTab.tsx` — `LoadingView` already exists
- `src/lib/analysis/address-enrichment.ts` — `enrichAddressDetails` called once inside `fetchCompliance`
- `src/integrations/dar/client.ts` — DAR called once from enrichment

---

## Task 1: Simplify `projekt.adresse.tsx`

**Files:**

- Modify: `src/routes/projekt.adresse.tsx`

The new screen has three responsibilities:

1. GSearch autocomplete → sets `selected` state
2. Show selected address chips (adresse, postnr)
3. "Videre →" button: persists address to store + syncPatch + navigates to cockpit

**Background:** The current file imports `useAddressSelectionPrecheck` and uses `isCheckingCompliance`, `adressePreCheck`, compliance flags, `overrideContinue`, `showBlockerDialog`, and `BlockerDialog`. All of that is removed. The compliance gate moves to the cockpit.

- [ ] **Step 1: Read the current file in full**

```bash
cat -n src/routes/projekt.adresse.tsx
```

- [ ] **Step 2: Write the new simplified component**

Replace the entire file content with:

```tsx
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useRef, useEffect } from "react";
import { MapPin } from "lucide-react";
import { useProject } from "@/lib/project-store";
import { PageTransition } from "@/components/wizard-ui";
import { searchAddresses } from "@/lib/adresse.functions";
import { syncPatch } from "@/lib/project-sync";
import { kommunenavnFraKode } from "@/lib/kommuner";
import type { GsearchSuggestion } from "@/integrations/gsearch/client";
import type { Address } from "@/types/project-state";

export const Route = createFileRoute("/projekt/adresse")({
  component: AddressStep,
});

function AddressStep() {
  const navigate = useNavigate();
  const { setAddress, setBbrData, setComplianceDone } = useProject();
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<GsearchSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Address | null>(null);
  const [open, setOpen] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (query.length < 2) {
      setSuggestions([]);
      setOpen(false);
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const results = await searchAddresses({ data: { q: query } });
        setSuggestions(results);
        setOpen(results.length > 0);
      } catch {
        setError("Søgning fejlede – prøv igen.");
        setOpen(false);
      } finally {
        setLoading(false);
      }
    }, 220);
  }, [query]);

  function handleSelect(s: GsearchSuggestion) {
    const addr: Address = {
      adresseid: s.adresseid,
      adresse: s.tekst,
      postnr: s.postnr,
      postnrnavn: s.postnrnavn,
      kommune: kommunenavnFraKode(s.kommunekode),
      kommunekode: s.kommunekode,
      matrikel: null,
      adgangsadresseid: s.adgangsadresseid,
      koordinater: s.koordinater,
      bbrId: null,
      ejerlavskode: null,
      matrikelnummer: null,
      grundareal: null,
    };
    setSelected(addr);
    setQuery(s.tekst);
    setOpen(false);
    setSuggestions([]);
  }

  function handleContinue() {
    if (!selected) return;
    setBbrData(null);
    setComplianceDone(false);
    setAddress(selected);
    syncPatch({ address: selected, complianceDone: false, currentStep: "boligoenske" });
    navigate({ to: `/projekt/${selected.adresseid}/cockpit` as never });
  }

  return (
    <PageTransition>
      <div className="mx-auto max-w-[560px] px-6 py-16 space-y-8">
        <div>
          <p className="font-mono text-[10px] tracking-[0.2em] text-accent mb-2">01 / GRUNDLAGET</p>
          <h1 className="text-2xl text-foreground">Hvilken adresse drejer det sig om?</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Indtast adressen for den ejendom du vil analysere.
          </p>
        </div>

        <div className="relative">
          <div className="flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2 focus-within:border-accent/60 transition-colors">
            <MapPin size={14} className="text-muted-foreground shrink-0" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                if (selected && e.target.value !== selected.adresse) setSelected(null);
              }}
              placeholder="Søg adresse..."
              className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
              data-testid="address-search-input"
              autoComplete="off"
            />
            {loading && (
              <span className="font-mono text-[10px] text-muted-foreground animate-pulse">
                søger...
              </span>
            )}
          </div>

          {open && suggestions.length > 0 && (
            <ul className="absolute z-50 mt-1 w-full rounded-md border border-border bg-[#0e0e0e] shadow-lg">
              {suggestions.map((s) => (
                <li key={s.adresseid}>
                  <button
                    type="button"
                    onClick={() => handleSelect(s)}
                    className="w-full px-4 py-2.5 text-left text-sm text-foreground hover:bg-[#1a1a1a] transition-colors"
                    data-testid="address-suggestion"
                  >
                    {s.tekst}
                  </button>
                </li>
              ))}
            </ul>
          )}

          {error && <p className="mt-1 text-xs text-danger">{error}</p>}
        </div>

        {selected && (
          <div className="flex flex-wrap gap-2" data-testid="address-chips">
            <DataChip label="Adresse" value={selected.adresse.split(",")[0]} />
            <DataChip label="Postnr" value={selected.postnr} />
            <DataChip label="Kommune" value={selected.kommune || selected.kommunekode} />
          </div>
        )}

        <button
          type="button"
          disabled={!selected}
          onClick={handleContinue}
          data-testid="continue-btn"
          className="w-full inline-flex items-center justify-center rounded-md bg-accent px-6 py-3 font-mono text-sm text-accent-foreground transition-all hover:brightness-110 disabled:opacity-30 disabled:cursor-not-allowed"
        >
          Fortsæt →
        </button>
      </div>
    </PageTransition>
  );
}

function DataChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="inline-flex flex-col rounded border border-border/60 bg-[#111] px-3 py-1.5">
      <span className="font-mono text-[9px] tracking-[0.15em] text-muted-foreground">{label}</span>
      <span className="text-xs text-foreground">{value}</span>
    </div>
  );
}
```

- [ ] **Step 3: Run TypeScript to check**

```bash
bunx tsc --noEmit 2>&1 | head -30
```

Expected: zero errors (or only pre-existing errors unrelated to this file).

- [ ] **Step 4: Commit**

```bash
git add src/routes/projekt.adresse.tsx
git commit -m "refactor(adresse): simplify to pure address input — remove inline compliance analysis"
```

---

## Task 2: Delete `use-address-precheck.ts`

**Files:**

- Delete: `src/lib/use-address-precheck.ts`

- [ ] **Step 1: Verify no other importer exists**

```bash
grep -r "use-address-precheck\|useAddressSelectionPrecheck" src/ --include="*.ts" --include="*.tsx"
```

Expected: zero results (Task 1 removed the only import).

- [ ] **Step 2: Delete the file**

```bash
rm src/lib/use-address-precheck.ts
```

- [ ] **Step 3: TypeScript check**

```bash
bunx tsc --noEmit 2>&1 | head -20
```

Expected: zero errors.

- [ ] **Step 4: Commit**

```bash
git add -u src/lib/use-address-precheck.ts
git commit -m "refactor: delete use-address-precheck hook — dead code after address flow simplification"
```

---

## Task 3: Remove `fetchAddressDetails` from `adresse.functions.ts`

**Files:**

- Modify: `src/lib/adresse.functions.ts`

- [ ] **Step 1: Verify no importer remains**

```bash
grep -r "fetchAddressDetails" src/ --include="*.ts" --include="*.tsx"
```

Expected: only the definition in `adresse.functions.ts` itself. No consumers.

- [ ] **Step 2: Remove the export**

The file currently contains two exports. Remove `fetchAddressDetails` entirely, keeping only `searchAddresses`.

New content of `src/lib/adresse.functions.ts`:

```typescript
// src/lib/adresse.functions.ts
// Server functions for address search.
// SERVER-SIDE ONLY — GSearch credentials must not reach the browser.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export const searchAddresses = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => z.object({ q: z.string().min(2).max(200).trim() }).parse(data))
  .handler(async ({ data }) => {
    const { GsearchService } = await import("@/integrations/gsearch/client");
    return GsearchService.getSuggestions(data.q);
  });
```

- [ ] **Step 3: TypeScript check**

```bash
bunx tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 4: Commit**

```bash
git add src/lib/adresse.functions.ts
git commit -m "refactor: remove fetchAddressDetails server fn — dead code, DAR enrichment handled in analysis pipeline"
```

---

## Task 4: Delete `pre-check-adresse.ts` ⚠️ PROTECTED FILE

**Files:**

- Delete: `src/lib/pre-check-adresse.ts`

> **Note:** This is a protected file per `CLAUDE.md`. The deletion must be called out explicitly in the PR: `Rører beskyttet fil - kræver review`

- [ ] **Step 1: Verify no importer remains**

```bash
grep -r "pre-check-adresse\|preCheckAdresse" src/ --include="*.ts" --include="*.tsx"
```

Expected: only the definition in `pre-check-adresse.ts` itself. No consumers.

- [ ] **Step 2: Check if any type is imported from this file**

```bash
grep -r "AdressePreCheckInput\|AdressePreCheckResultat" src/ --include="*.ts" --include="*.tsx" | grep -v "project-state\|pre-check-adresse"
```

`AdressePreCheckResultat` is defined in `src/types/project-state.ts` (not in `pre-check-adresse.ts`), so the type is safe.

- [ ] **Step 3: Delete the file**

```bash
rm src/lib/pre-check-adresse.ts
```

- [ ] **Step 4: TypeScript check**

```bash
bunx tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 5: Commit**

```bash
git add -u src/lib/pre-check-adresse.ts
git commit -m "refactor: delete pre-check-adresse.ts — dead code after address flow simplification

Rører beskyttet fil - kræver review"
```

---

## Task 5: Remove `adressePreCheck` from store and cockpit consumers ⚠️ PROTECTED FILE

**Files:**

- Modify: `src/lib/project-store.ts` ⚠️ PROTECTED
- Modify: `src/components/cockpit/EjendomPanel.tsx`
- Modify: `src/components/cockpit/index.tsx`
- Modify: `src/lib/use-cockpit-byggeoensker.ts`
- Modify: `src/types/project-state.ts` (optionally — type stays if used elsewhere)

> **Note:** `project-store.ts` is a protected file. Call out in PR: `Rører beskyttet fil - kræver review`

**Background:** `adressePreCheck` is set only by `setAdressePreCheck` in the deleted `use-address-precheck.ts`. It is now permanently `null`. All reads of `adressePreCheck?.kontekst` fall through to `complianceMetrics` and `bbrData` which are set by `fetchCompliance`. The fallback reads are dead code.

### 5a — Remove from project-store

- [ ] **Step 1: Read `src/lib/project-store.ts` to find all three locations**

```bash
grep -n "adressePreCheck\|setAdressePreCheck" src/lib/project-store.ts
```

Expected output: three lines — state field definition, setter definition, reset line.

- [ ] **Step 2: Remove state field, setter, and reset**

Three edits in `project-store.ts`:

1. Remove the state field:

```typescript
// DELETE this line:
adressePreCheck: AdressePreCheckResultat | null;
```

2. Remove the action type:

```typescript
// DELETE this line:
setAdressePreCheck: (v: AdressePreCheckResultat | null) => void;
```

3. Remove from initial state object:

```typescript
// DELETE this line:
adressePreCheck: null,
```

4. Remove from the `set` implementation:

```typescript
// DELETE this line:
setAdressePreCheck: (adressePreCheck) => set({ adressePreCheck }),
```

5. Remove from the reset block (where `adressePreCheck: null` appears in the reset):

```typescript
// DELETE this line in reset:
adressePreCheck: null,
```

- [ ] **Step 3: Remove `AdressePreCheckResultat` import from store if it is only used for this field**

```bash
grep -n "AdressePreCheckResultat" src/lib/project-store.ts
```

If the only usage is the deleted field, remove the import line.

### 5b — Remove from `EjendomPanel.tsx`

- [ ] **Step 4: Read the top of EjendomPanel**

```bash
grep -n "adressePreCheck\|setAdressePreCheck" src/components/cockpit/EjendomPanel.tsx
```

- [ ] **Step 5: Remove `adressePreCheck` from the `useProject()` destructure**

Find and remove:

```typescript
adressePreCheck,
```

from the `useProject()` call in `EjendomPanel`.

- [ ] **Step 6: Remove the `adressePreCheck?.kontekst` fallback lines**

Find:

```typescript
const k = adressePreCheck?.kontekst;
const bbr = bbrData ?? adressePreCheck?.bbr ?? null;
```

Replace with:

```typescript
const bbr = bbrData;
```

Any subsequent uses of `k?.grundareal`, `k?.restBygningsareal` etc. need to be removed or replaced with their primary source. Check each occurrence: if there is already a primary source before `k?.field`, simply remove `?? k?.field`. If `k?.field` was the only source, replace with `null`.

- [ ] **Step 7: TypeScript check**

```bash
bunx tsc --noEmit 2>&1 | grep "EjendomPanel" | head -10
```

### 5c — Remove from `cockpit/index.tsx`

- [ ] **Step 8: Find usages**

```bash
grep -n "adressePreCheck" src/components/cockpit/index.tsx
```

- [ ] **Step 9: Remove from `useProject()` destructure and remove the `const k = adressePreCheck?.kontekst` block**

The `k` variable is used to build `kontekstTekst` for a warning message comparing against `maxBebyggelsesprocent`, `maxEtager`, `maxBygningshoejde`. After removal of `k`:

- If the warning block depends entirely on `k`, remove the block.
- If the warning block has an alternative source (e.g. `complianceMetrics`), rewire it.

Read the surrounding code (roughly lines 316–350) before deciding:

```bash
sed -n '310,360p' src/components/cockpit/index.tsx
```

- [ ] **Step 10: TypeScript check**

```bash
bunx tsc --noEmit 2>&1 | grep "cockpit/index" | head -10
```

### 5d — Remove from `use-cockpit-byggeoensker.ts`

- [ ] **Step 11: Find usages**

```bash
grep -n "adressePreCheck" src/lib/use-cockpit-byggeoensker.ts
```

- [ ] **Step 12: Remove `adressePreCheck?.kontekst` read**

Read lines around line 79:

```bash
sed -n '74,90p' src/lib/use-cockpit-byggeoensker.ts
```

Remove the `const k = state.adressePreCheck?.kontekst;` line and all subsequent reads of `k?.field`. Replace any `k?.field ?? fallback` with just `fallback`, or with the appropriate store field.

- [ ] **Step 13: TypeScript check — full**

```bash
bunx tsc --noEmit 2>&1 | head -30
```

Expected: zero errors.

- [ ] **Step 14: Commit**

```bash
git add src/lib/project-store.ts src/components/cockpit/EjendomPanel.tsx src/components/cockpit/index.tsx src/lib/use-cockpit-byggeoensker.ts
git commit -m "refactor: remove adressePreCheck from store and cockpit — dead state after precheck deletion

Rører beskyttet fil - kræver review"
```

---

## Task 6: Final verification

- [ ] **Step 1: Full TypeScript**

```bash
bunx tsc --noEmit 2>&1
```

Expected: zero errors.

- [ ] **Step 2: Tests**

```bash
bun test src 2>&1 | tail -10
```

Expected: all pass.

- [ ] **Step 3: Lint**

```bash
bunx eslint src/routes/projekt.adresse.tsx src/lib/adresse.functions.ts src/components/cockpit/EjendomPanel.tsx src/components/cockpit/index.tsx src/lib/use-cockpit-byggeoensker.ts 2>&1 | head -20
```

- [ ] **Step 4: Verify dead code is gone**

```bash
grep -r "preCheckAdresse\|useAddressSelectionPrecheck\|fetchAddressDetails\|adressePreCheck\|use-address-precheck" src/ --include="*.ts" --include="*.tsx"
```

Expected: zero results.

- [ ] **Step 5: Manual smoke test**

1. `bun dev`
2. Go to `/projekt/adresse`
3. Type an address → suggestions appear → select one → chips show → "Fortsæt →" enabled
4. Click "Fortsæt →" → navigate to cockpit
5. Cockpit shows `LoadingView` (4 progress bars) while `fetchCompliance` runs
6. Cockpit shows results when done
7. Terminal: confirm only ONE DAR log entry per address (no duplicate)

---

## Deleted code summary

| What                                              | Lines removed (approx)   |
| ------------------------------------------------- | ------------------------ |
| `use-address-precheck.ts`                         | ~104 lines               |
| `pre-check-adresse.ts`                            | ~200 lines               |
| `fetchAddressDetails` from `adresse.functions.ts` | ~8 lines                 |
| Compliance UI from `projekt.adresse.tsx`          | ~180 lines               |
| `adressePreCheck` state + consumers               | ~30 lines across 4 files |
| **Total**                                         | **~520 lines deleted**   |

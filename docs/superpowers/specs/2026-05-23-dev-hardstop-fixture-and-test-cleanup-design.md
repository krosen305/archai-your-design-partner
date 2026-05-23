# DEV Hard-Stop Fixture + Test Cleanup — Design Spec

**Date:** 2026-05-23

---

## Goal

1. Add a DEV-only hard-stop mock fixture button in `projekt.adresse.tsx` so `tests/hard-stop-gate.spec.ts` can become a real acceptance test.
2. Remove tests that violate the three-tier test strategy: TypeScript-only unit tests, empty test files, and Playwright specs with no real user-journey assertions.

---

## Part 1: DEV Hard-Stop Fixture

### Pattern

Follows the existing `⚡ DEV: Brug mock-adresse (Hasselvej 48, Virum)` button exactly.

**File:** `src/routes/projekt.adresse.tsx`

A second DEV button is added immediately below the existing one:

```tsx
{import.meta.env.DEV && (
  <button
    type="button"
    onClick={() => {
      setAddress(MOCK_ADRESSE);
      setHardStop(true, "Strandbeskyttelseslinje — matriklen ligger inden for 300 m fra kystlinjen.");
      navigate({ to: `/projekt/${MOCK_ADRESSE.adresseid}/cockpit` as never });
    }}
  >
    ⚡ DEV: Hard-stop mock (Strandbeskyttelse)
  </button>
)}
```

- Uses the same `MOCK_ADRESSE` (Hasselvej 48, Virum) as the existing fixture
- Sets `hard_stop=true` with a realistic Danish reason string via `setHardStop()`
- Navigates to the same cockpit URL as the existing mock

**Guards:** `import.meta.env.DEV` — tree-shaken out of production builds.

**Store action required:** `setHardStop` must be imported from `useProject` in `projekt.adresse.tsx`. Check if it's already destructured; add if missing.

---

### Playwright helper

**File:** `tests/helpers/session.ts`

Add:

```ts
export async function enterCockpitWithHardStop(page: Page) {
  await clearBrowserState(page);
  await page.goto("/projekt/adresse");
  await page.getByRole("button", { name: /DEV: Hard-stop mock/i }).click();
  await page.waitForURL(/\/projekt\/.+\/cockpit/, { timeout: 15_000 });
}
```

---

### Completed acceptance test

**File:** `tests/hard-stop-gate.spec.ts`

Replace skipped placeholder with:

```ts
import { test, expect } from "@playwright/test";
import { enterCockpitWithHardStop } from "./helpers/session";

test("hard-stop project shows HARD STOP banner before AI design", async ({ page }) => {
  await enterCockpitWithHardStop(page);

  await expect(page.getByText(/HARD STOP/i)).toBeVisible({ timeout: 10_000 });

  const aiDesignBtn = page.getByRole("button", { name: /Generer design/i });
  if (await aiDesignBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
    await expect(aiDesignBtn).toBeDisabled();
  }
});
```

---

## Part 2: Test Cleanup

### Unit tests to delete

| File | Reason |
|------|--------|
| `src/integrations/cache/client.test.ts` | Empty — only a comment; live tests already moved to `tests/live/` |
| `src/lib/pipeline-service-state.test.ts` | Tests that TypeScript string type is a string. TypeScript already proves this. |
| `src/lib/orchestrator-service-states.test.ts` | Literal type assignment test. No runtime logic exercised. |

### Playwright specs to delete

| File | Reason |
|------|--------|
| `tests/wizard-flow.spec.ts` | Two tests: login gate visible + DEV bypass button exists. No real user journey. |
| `tests/address-flow.spec.ts` | Navigation URL check + DEV button presence. Routing is framework-proven. |

### Playwright spec to fix: `tests/cockpit-data.spec.ts`

Remove tests 5 and 6 (debug route tests):

- **Test 5** (`debug route /debug/analyse loader`): Tests a dev-only route with 8 trivial visibility assertions. Not a user journey.
- **Test 6** (`debug route søgning på ukendt adresse`): Uses `.or()` no-op assertion — `expect(noResults.or(errorMsg))` passes whether the correct or incorrect outcome is shown. Also tests a dev route.

Keep tests 1–4:
1. Mock address navigates to cockpit and shows compliance sections
2. Cockpit ejendom-tab: Datakilder-sektion viser datarækker
3. Cockpit DataRow badge viser PipelineServiceState tekst
4. Cockpit viser grundareal stat-card

---

## Post-cleanup Playwright state

| Spec | Tests | Purpose |
|------|-------|---------|
| `production-smoke.spec.ts` | 1 | App builds and serves start page |
| `cockpit-data.spec.ts` | 4 | Compliance data display in cockpit |
| `hard-stop-gate.spec.ts` | 1 | Hard stop blocks AI design |

Total: 3 specs, 6 tests — exactly within the 3-6 cap from the strategy.

---

## CI impact

No CI changes needed. The new DEV button uses `import.meta.env.DEV` (same as existing mock), so it is invisible in CI production builds. Playwright E2E in CI runs against `bun run dev` locally and `bun run build && bun run preview` in CI — the hard-stop test will work locally. CI coverage for this spec requires either Option B (VITE build flag, out of scope) or accepting local-only E2E for this test.

---

## Files touched

| File | Change |
|------|--------|
| `src/routes/projekt.adresse.tsx` | Add DEV hard-stop button; import `setHardStop` if missing |
| `tests/helpers/session.ts` | Add `enterCockpitWithHardStop` helper |
| `tests/hard-stop-gate.spec.ts` | Replace placeholder with real test |
| `tests/cockpit-data.spec.ts` | Remove tests 5 and 6 |
| `src/integrations/cache/client.test.ts` | Delete |
| `src/lib/pipeline-service-state.test.ts` | Delete |
| `src/lib/orchestrator-service-states.test.ts` | Delete |
| `tests/wizard-flow.spec.ts` | Delete |
| `tests/address-flow.spec.ts` | Delete |

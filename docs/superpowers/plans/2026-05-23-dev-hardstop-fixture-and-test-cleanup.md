# DEV Hard-Stop Fixture + Test Cleanup — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a DEV hard-stop mock fixture button so the Playwright acceptance test for the hard-stop gate can be completed, then delete five obsolete test files and fix two bugs in `cockpit-data.spec.ts`.

**Architecture:** The DEV button follows the exact pattern of the existing `⚡ DEV: Brug mock-adresse` button in `src/routes/projekt.adresse.tsx` — sets store state and navigates. Tests are written first (TDD) then the button is implemented. Obsolete tests are deleted in bulk with a single commit.

**Tech Stack:** Bun + Playwright (`@playwright/test`), React/TanStack Router, Zustand (`useProject`), `import.meta.env.DEV` tree-shaking.

---

## File map

| File | Change |
|------|--------|
| `tests/helpers/session.ts` | Add `enterCockpitWithHardStop` helper |
| `tests/hard-stop-gate.spec.ts` | Replace placeholder with real acceptance test |
| `src/routes/projekt.adresse.tsx` | Add `setHardStop` to useProject destructuring + new DEV button |
| `tests/cockpit-data.spec.ts` | Remove tests 5–6 (debug routes), fix test 4 (`grundarealCard` undefined) |
| `src/integrations/cache/client.test.ts` | Delete (comment-only file) |
| `src/lib/pipeline-service-state.test.ts` | Delete (TypeScript-only assertions) |
| `src/lib/orchestrator-service-states.test.ts` | Delete (type-level test, no runtime value) |
| `tests/wizard-flow.spec.ts` | Delete (trivial DEV button + login gate render checks) |
| `tests/address-flow.spec.ts` | Delete (trivial navigation + DEV button presence checks) |

---

## Task 1: Write failing Playwright test + session helper

**Files:**
- Modify: `tests/helpers/session.ts`
- Modify: `tests/hard-stop-gate.spec.ts`

- [ ] **Step 1: Add `enterCockpitWithHardStop` to session.ts**

Replace the entire file with:

```typescript
import type { Page } from "@playwright/test";

export async function clearBrowserState(page: Page) {
  await page.addInitScript(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });
}

export async function enterCockpitWithMockAddress(page: Page) {
  await clearBrowserState(page);
  await page.goto("/projekt/adresse");
  await page.getByRole("button", { name: /DEV: Brug mock-adresse/i }).click();
  await page.waitForURL(/\/projekt\/.+\/cockpit/, { timeout: 15_000 });
}

export async function enterCockpitWithHardStop(page: Page) {
  await clearBrowserState(page);
  await page.goto("/projekt/adresse");
  await page.getByRole("button", { name: /DEV: Hard-stop mock/i }).click();
  await page.waitForURL(/\/projekt\/.+\/cockpit/, { timeout: 15_000 });
}
```

- [ ] **Step 2: Replace hard-stop-gate.spec.ts with real test**

Replace the entire file with:

```typescript
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

- [ ] **Step 3: Run the test — verify it fails because the button doesn't exist yet**

```bash
bunx playwright test tests/hard-stop-gate.spec.ts --reporter=list
```

Expected: FAIL — `page.getByRole('button', { name: /DEV: Hard-stop mock/i })` not found.

If it unexpectedly passes: stop and investigate — something is wrong.

---

## Task 2: Implement DEV hard-stop button in projekt.adresse.tsx

**Files:**
- Modify: `src/routes/projekt.adresse.tsx`

- [ ] **Step 1: Add `setHardStop` to the useProject destructuring**

Find this line in `projekt.adresse.tsx` (around line 31):

```typescript
const { address, setAddress, adressePreCheck } = useProject();
```

Replace with:

```typescript
const { address, setAddress, adressePreCheck, setHardStop } = useProject();
```

- [ ] **Step 2: Add the DEV hard-stop button**

Find the existing DEV button block (around line 373):

```typescript
{import.meta.env.DEV && (
  <div className="mt-6 flex justify-center">
    <button
      type="button"
      onClick={() => {
        setAddress(MOCK_ADRESSE);
        navigate({ to: `/projekt/${MOCK_ADRESSE.adresseid}/cockpit` as never });
      }}
      className="inline-flex items-center gap-1.5 rounded-md border border-dashed border-accent/40 bg-accent/5 px-3 py-1.5 font-mono text-[10px] tracking-[0.1em] text-accent hover:bg-accent/10 transition-colors"
    >
      ⚡ DEV: Brug mock-adresse (Hasselvej 48, Virum)
    </button>
  </div>
)}
```

Replace with (two buttons, same wrapper):

```typescript
{import.meta.env.DEV && (
  <div className="mt-6 flex flex-col items-center gap-2">
    <button
      type="button"
      onClick={() => {
        setAddress(MOCK_ADRESSE);
        navigate({ to: `/projekt/${MOCK_ADRESSE.adresseid}/cockpit` as never });
      }}
      className="inline-flex items-center gap-1.5 rounded-md border border-dashed border-accent/40 bg-accent/5 px-3 py-1.5 font-mono text-[10px] tracking-[0.1em] text-accent hover:bg-accent/10 transition-colors"
    >
      ⚡ DEV: Brug mock-adresse (Hasselvej 48, Virum)
    </button>
    <button
      type="button"
      onClick={() => {
        setAddress(MOCK_ADRESSE);
        setHardStop(true, "Strandbeskyttelseslinje — matriklen ligger inden for 300 m fra kystlinjen.");
        navigate({ to: `/projekt/${MOCK_ADRESSE.adresseid}/cockpit` as never });
      }}
      className="inline-flex items-center gap-1.5 rounded-md border border-dashed border-danger/40 bg-danger/5 px-3 py-1.5 font-mono text-[10px] tracking-[0.1em] text-danger hover:bg-danger/10 transition-colors"
    >
      ⚡ DEV: Hard-stop mock (Strandbeskyttelse)
    </button>
  </div>
)}
```

- [ ] **Step 3: Check TypeScript compiles**

```bash
bunx tsc --noEmit
```

Expected: 0 errors. If `setHardStop` is not found on the useProject type, check `src/lib/project-store.ts` for the correct action name (search for `hard_stop`).

- [ ] **Step 4: Run the Playwright test — verify it now passes**

```bash
bunx playwright test tests/hard-stop-gate.spec.ts --reporter=list
```

Expected: PASS — HARD STOP banner is visible after clicking the DEV button.

If it fails: run with `--debug` to see what's rendered: `bunx playwright test tests/hard-stop-gate.spec.ts --debug`

- [ ] **Step 5: Commit**

```bash
git add src/routes/projekt.adresse.tsx tests/helpers/session.ts tests/hard-stop-gate.spec.ts
git commit -m "feat(dev): add hard-stop mock fixture and complete Playwright acceptance test

Adds DEV-only button that sets hard_stop=true with a Strandbeskyttelse reason
and navigates to cockpit. Completes the hard-stop-gate.spec.ts acceptance test."
```

---

## Task 3: Delete obsolete test files

**Files:**
- Delete: `src/integrations/cache/client.test.ts`
- Delete: `src/lib/pipeline-service-state.test.ts`
- Delete: `src/lib/orchestrator-service-states.test.ts`
- Delete: `tests/wizard-flow.spec.ts`
- Delete: `tests/address-flow.spec.ts`

Why each is removed:
- `cache/client.test.ts` — only comments; live tests already live in `tests/live/`
- `pipeline-service-state.test.ts` — checks `typeof label === "string"`. TypeScript enforces this at compile time.
- `orchestrator-service-states.test.ts` — assigns a typed `ComplianceResult` literal and asserts one field equals its own value. No runtime logic tested.
- `wizard-flow.spec.ts` — checks login gate is visible + DEV bypass button exists. Neither is a user journey.
- `address-flow.spec.ts` — checks navigation URL and DEV button presence. Routing is framework-proven.

- [ ] **Step 1: Delete the five files**

```bash
git rm src/integrations/cache/client.test.ts \
       src/lib/pipeline-service-state.test.ts \
       src/lib/orchestrator-service-states.test.ts \
       tests/wizard-flow.spec.ts \
       tests/address-flow.spec.ts
```

- [ ] **Step 2: Run unit tests — verify suite is still green**

```bash
bun test src
```

Expected: same pass count minus the deleted files (678 → roughly 675 pass, 0 fail). Any new failure means a deleted file was depended on — investigate before proceeding.

- [ ] **Step 3: Commit**

```bash
git commit -m "test: remove obsolete TypeScript-only and trivial render tests

Removes 3 unit tests with zero runtime value (type-only assertions,
empty comment file) and 2 Playwright specs that only check DEV button
presence and TanStack Router navigation URLs."
```

---

## Task 4: Fix cockpit-data.spec.ts

**Files:**
- Modify: `tests/cockpit-data.spec.ts`

Two problems to fix:
1. Tests 5 and 6 test the `/debug/analyse` dev route — not a user journey, one has a no-op `.or()` assertion.
2. Test 4 references `grundarealCard` which is never defined — this is a latent bug that would crash on run.

- [ ] **Step 1: Replace cockpit-data.spec.ts with the fixed version**

Replace the entire file with:

```typescript
import { expect, test } from "@playwright/test";
import { enterCockpitWithMockAddress } from "./helpers/session";

test("mock-adresse: navigerer til cockpit og viser compliance-sektioner", async ({ page }) => {
  await enterCockpitWithMockAddress(page);

  await expect(page.getByText("GRUNDAREAL", { exact: false })).toBeVisible();
});

test("cockpit ejendom-tab: Datakilder-sektion viser datarækker med data-testid", async ({
  page,
}) => {
  await enterCockpitWithMockAddress(page);

  const ejendomTab = page.getByRole("tab", { name: /EJENDOM/i });
  await expect(ejendomTab).toBeVisible({ timeout: 5000 });
  await ejendomTab.click();

  const datakildBtn = page.getByRole("button", { name: /Datakildeoversigt/i });
  await expect(datakildBtn).toBeVisible({ timeout: 5000 });
  await datakildBtn.click();

  const firstRow = page.locator('[data-testid^="datarow-"]').first();
  await expect(firstRow).toBeVisible({ timeout: 5000 });
});

test("cockpit DataRow badge viser PipelineServiceState tekst", async ({ page }) => {
  await enterCockpitWithMockAddress(page);

  const ejendomTab = page.getByRole("tab", { name: /EJENDOM/i });
  await expect(ejendomTab).toBeVisible({ timeout: 5000 });
  await ejendomTab.click();

  const datakildBtn = page.getByRole("button", { name: /Datakildeoversigt/i });
  await expect(datakildBtn).toBeVisible({ timeout: 5000 });
  await datakildBtn.click();

  const validBadgePattern = /LIVE|INGEN HIT|FEJL|SPRUNGET OVER|MOCK|CACHE|IKKE KØRT/i;
  const badge = page.locator('[data-testid$="-badge"]').first();
  await expect(badge).toBeVisible({ timeout: 8000 });
  await expect(badge).toHaveText(validBadgePattern);
});

test("cockpit viser grundareal stat-card med data-testid", async ({ page }) => {
  await enterCockpitWithMockAddress(page);

  const grundarealCard = page.locator('[data-testid="stat-grundareal"]');
  await expect(grundarealCard).toBeVisible({ timeout: 5000 });
  await expect(page.locator('[data-testid="stat-grundareal-value"]')).toBeVisible();
});
```

- [ ] **Step 2: Run unit tests to confirm nothing broken**

```bash
bun test src
```

Expected: 0 fail.

- [ ] **Step 3: Commit**

```bash
git add tests/cockpit-data.spec.ts
git commit -m "test(e2e): remove debug route tests from cockpit-data, fix undefined grundarealCard

Debug route tests (/debug/analyse) are not user journeys.
Test 6 had a no-op .or() assertion. Test 4 referenced grundarealCard
which was never defined — would crash on run."
```

---

## Verification

After all tasks:

```bash
# Unit tests
bun test src

# TypeScript
bunx tsc --noEmit

# Lint
bunx eslint .

# Playwright (needs dev server running: bun run dev in another terminal)
bunx playwright test --reporter=list
```

Expected Playwright result: 6 tests across 3 files (smoke + 4 cockpit-data + hard-stop-gate), 0 fail.

Final Playwright spec count: `production-smoke.spec.ts` (1), `cockpit-data.spec.ts` (4), `hard-stop-gate.spec.ts` (1) = **6 tests, 3 files**.

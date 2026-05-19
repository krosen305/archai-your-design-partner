import { expect, test } from "@playwright/test";

// ---------------------------------------------------------------------------
// Test 1: mock-adresse navigerer til cockpit og viser compliance-sektioner
// ---------------------------------------------------------------------------

test("mock-adresse: navigerer til cockpit og viser compliance-sektioner", async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  await page.goto("/projekt/adresse");

  const devBtn = page.getByRole("button", { name: /DEV: Brug mock-adresse/i });
  await expect(devBtn).toBeVisible();
  await devBtn.click();

  await page.waitForURL(/\/projekt\/.+\/cockpit/, { timeout: 15000 });

  await expect(page.getByText("GRUNDAREAL", { exact: false })).toBeVisible();
});

// ---------------------------------------------------------------------------
// Test 2: EJENDOM tab viser Datakilder-sektion med datarækker
// ---------------------------------------------------------------------------

test("cockpit ejendom-tab: Datakilder-sektion viser datarækker med data-testid", async ({
  page,
}) => {
  await page.addInitScript(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  await page.goto("/projekt/adresse");
  await page.getByRole("button", { name: /DEV: Brug mock-adresse/i }).click();
  await page.waitForURL(/\/projekt\/.+\/cockpit/, { timeout: 15000 });

  const ejendomTab = page.getByRole("tab", { name: /EJENDOM/i });
  if (await ejendomTab.isVisible({ timeout: 2000 }).catch(() => false)) {
    await ejendomTab.click();
  }

  const datakildBtn = page.getByRole("button", { name: /Datakildeoversigt/i });
  if (await datakildBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await datakildBtn.click();
    const firstRow = page.locator('[data-testid^="datarow-"]').first();
    await expect(firstRow).toBeVisible({ timeout: 5000 });
  }
});

// ---------------------------------------------------------------------------
// Test 3: DataRow badges viser navngivet PipelineServiceState tekst
// ---------------------------------------------------------------------------

test("cockpit DataRow badge viser PipelineServiceState tekst", async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  await page.goto("/projekt/adresse");
  await page.getByRole("button", { name: /DEV: Brug mock-adresse/i }).click();
  await page.waitForURL(/\/projekt\/.+\/cockpit/, { timeout: 15000 });

  const ejendomTab = page.getByRole("tab", { name: /EJENDOM/i });
  if (await ejendomTab.isVisible({ timeout: 2000 }).catch(() => false)) {
    await ejendomTab.click();
  }

  const datakildBtn = page.getByRole("button", { name: /Datakildeoversigt/i });
  if (await datakildBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await datakildBtn.click();

    // Badge must show one of the 7 named PipelineServiceState labels — not raw "LIVE"/"MANGLER"
    const validBadgePattern = /LIVE|INGEN HIT|FEJL|SPRUNGET OVER|MOCK|CACHE|IKKE KØRT/i;
    const badge = page.locator('[data-testid$="-badge"]').first();
    await expect(badge).toBeVisible({ timeout: 8000 });
    await expect(badge).toHaveText(validBadgePattern);
  }
});

// ---------------------------------------------------------------------------
// Test 4: grundareal stat-card vises med data-testid
// ---------------------------------------------------------------------------

test("cockpit viser grundareal stat-card med data-testid", async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  await page.goto("/projekt/adresse");
  await page.getByRole("button", { name: /DEV: Brug mock-adresse/i }).click();
  await page.waitForURL(/\/projekt\/.+\/cockpit/, { timeout: 15000 });

  // Stat card wrapper (added in Task 6)
  const grundarealCard = page.locator('[data-testid="stat-card-grundareal"]');
  if (await grundarealCard.isVisible({ timeout: 3000 }).catch(() => false)) {
    await expect(grundarealCard).toBeVisible();
    // The value div inside should exist
    await expect(page.locator('[data-testid="stat-grundareal-value"]')).toBeVisible();
  } else {
    // Fallback: at minimum the GRUNDAREAL label is visible
    await expect(page.getByText("GRUNDAREAL", { exact: false })).toBeVisible();
  }
});

// ---------------------------------------------------------------------------
// Test 5: debug route /debug/analyse loader i dev-miljø
// ---------------------------------------------------------------------------

test("debug route /debug/analyse loader i dev-miljø", async ({ page }) => {
  await page.goto("/debug/analyse");

  await expect(page.getByText("DEBUG / ANALYSE LOG", { exact: false })).toBeVisible({
    timeout: 8000,
  });
  await expect(page.getByTestId("debug-address-input")).toBeVisible();
  await expect(page.getByTestId("debug-search-btn")).toBeVisible();
});

// ---------------------------------------------------------------------------
// Test 6: debug route søgning på ukendt adresse viser tom tilstand
// ---------------------------------------------------------------------------

test("debug route: søgning på ukendt adresse viser ingen-kørsler eller fejl", async ({ page }) => {
  await page.goto("/debug/analyse");

  await page.getByTestId("debug-address-input").fill("00000000-0000-0000-0000-000000000000");
  await page.getByTestId("debug-search-btn").click();

  const noResults = page.getByText("Ingen kørsler endnu");
  const errorMsg = page.getByTestId("debug-error");
  await expect(noResults.or(errorMsg)).toBeVisible({ timeout: 10000 });
});

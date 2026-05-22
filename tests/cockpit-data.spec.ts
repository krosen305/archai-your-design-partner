import { expect, test } from "@playwright/test";
import { enterCockpitWithMockAddress } from "./helpers/session";

// ---------------------------------------------------------------------------
// Test 1: mock-adresse navigerer til cockpit og viser compliance-sektioner
// ---------------------------------------------------------------------------

test("mock-adresse: navigerer til cockpit og viser compliance-sektioner", async ({ page }) => {
  await enterCockpitWithMockAddress(page);

  await expect(page.getByText("GRUNDAREAL", { exact: false })).toBeVisible();
});

// ---------------------------------------------------------------------------
// Test 2: EJENDOM tab viser Datakilder-sektion med datarækker
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Test 3: DataRow badges viser navngivet PipelineServiceState tekst
// ---------------------------------------------------------------------------

test("cockpit DataRow badge viser PipelineServiceState tekst", async ({ page }) => {
  await enterCockpitWithMockAddress(page);

  const ejendomTab = page.getByRole("tab", { name: /EJENDOM/i });
  await expect(ejendomTab).toBeVisible({ timeout: 5000 });
  await ejendomTab.click();

  const datakildBtn = page.getByRole("button", { name: /Datakildeoversigt/i });
  await expect(datakildBtn).toBeVisible({ timeout: 5000 });
  await datakildBtn.click();

  // Badge must show one of the 7 named PipelineServiceState labels — not raw "LIVE"/"MANGLER"
  const validBadgePattern = /LIVE|INGEN HIT|FEJL|SPRUNGET OVER|MOCK|CACHE|IKKE KØRT/i;
  const badge = page.locator('[data-testid$="-badge"]').first();
  await expect(badge).toBeVisible({ timeout: 8000 });
  await expect(badge).toHaveText(validBadgePattern);
});

// ---------------------------------------------------------------------------
// Test 4: grundareal stat-card vises med data-testid
// ---------------------------------------------------------------------------

test("cockpit viser grundareal stat-card med data-testid", async ({ page }) => {
  await enterCockpitWithMockAddress(page);

  const grundarealCard = page.locator('[data-testid="stat-card-grundareal"]');
  await expect(grundarealCard).toBeVisible({ timeout: 5000 });
  await expect(page.locator('[data-testid="stat-grundareal-value"]')).toBeVisible();
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

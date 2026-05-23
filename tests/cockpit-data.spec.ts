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

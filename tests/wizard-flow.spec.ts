import { expect, test } from "@playwright/test";

const TEST_ADRESSEID = "0a3f507d-4cf9-32b8-e044-0003ba298018";

test("cockpit route viser login-gate uden session", async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  await page.goto(`/projekt/${TEST_ADRESSEID}/cockpit`);
  await expect(page.getByText(/login/i)).toBeVisible();
  await expect(page.getByRole("button", { name: /Log ind eller opret konto/i })).toBeVisible();
});

test("cockpit login-gate har dev bypass-knap i udvikling", async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  await page.goto(`/projekt/${TEST_ADRESSEID}/cockpit`);
  await expect(page.getByRole("button", { name: /DEV: Spring login over/i })).toBeVisible();
});

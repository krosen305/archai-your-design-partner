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

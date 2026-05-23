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
  // Wait for button to be visible and enabled before clicking
  const mockBtn = page.getByRole("button", { name: /DEV: Brug mock-adresse/i });
  await mockBtn.waitFor({ state: "visible", timeout: 5_000 });
  await mockBtn.click({ force: true });
  // Wait for navigation, then skip login gate if present
  await page.waitForURL(/\/projekt\/.+/, { timeout: 15_000 });
  const loginBypass = page.getByRole("button", { name: /DEV: Spring login over/i });
  if (await loginBypass.isVisible({ timeout: 3_000 }).catch(() => false)) {
    await loginBypass.click();
  }
  await page.waitForURL(/\/projekt\/.+\/cockpit/, { timeout: 10_000 });
}

export async function enterCockpitWithHardStop(page: Page) {
  await clearBrowserState(page);
  await page.goto("/projekt/adresse");
  // Wait for button to be visible and enabled before clicking
  const hardStopBtn = page.getByRole("button", { name: /DEV: Hard-stop mock/i });
  await hardStopBtn.waitFor({ state: "visible", timeout: 5_000 });
  await hardStopBtn.click({ force: true });
  // Wait for navigation, then skip login gate if present
  await page.waitForURL(/\/projekt\/.+/, { timeout: 15_000 });
  const loginBypass = page.getByRole("button", { name: /DEV: Spring login over/i });
  if (await loginBypass.isVisible({ timeout: 3_000 }).catch(() => false)) {
    await loginBypass.click();
  }
  await page.waitForURL(/\/projekt\/.+\/cockpit/, { timeout: 10_000 });
}

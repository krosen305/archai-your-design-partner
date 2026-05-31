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

/**
 * Reach the interactive floor-plan editor with a real dev session + project
 * (same trusted path as the cockpit specs), generate a plan, and wait for the
 * canvas. Returns the resolved project id.
 */
export async function openFloorPlanEditorWithPlan(page: Page): Promise<string> {
  await enterCockpitWithMockAddress(page);

  const match = page.url().match(/\/projekt\/([^/]+)\/cockpit/);
  const projectId = match?.[1];
  if (!projectId) throw new Error(`Kunne ikke udlede projekt-id fra ${page.url()}`);

  await page.goto(`/projekt/${projectId}/plantegning?projectId=${projectId}`);

  // No active plan yet → generation form. Generate the deterministic seed plan.
  const generateBtn = page.getByRole("button", { name: /Generer plantegning/i });
  await generateBtn.waitFor({ state: "visible", timeout: 10_000 });
  await generateBtn.click();

  // Canvas appears only once a document exists.
  await page
    .locator('svg[aria-label="Interaktiv plantegning"]')
    .waitFor({ state: "visible", timeout: 20_000 });

  return projectId;
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

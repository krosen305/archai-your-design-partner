import { expect, test } from "@playwright/test";
import { hasPlaywrightTestUser, openFloorPlanEditorWithPlan } from "./helpers/session";

const CANVAS = 'svg[aria-label="Interaktiv plantegning"]';
const REQUIRES_TEST_USER =
  "Kraever PLAYWRIGHT_TEST_EMAIL og PLAYWRIGHT_TEST_PASSWORD i environment.";

test.setTimeout(120_000);

test("genererer plan og renderer den interaktive canvas", async ({ page }) => {
  test.skip(!hasPlaywrightTestUser(), REQUIRES_TEST_USER);

  await openFloorPlanEditorWithPlan(page);

  const canvas = page.locator(CANVAS);
  await expect(canvas).toBeVisible();
  await expect(page.locator("line[data-wall-id]")).not.toHaveCount(0);
  await expect(page.getByText(/m. netto/i)).toBeVisible();
});

test("traek af intern vaeg committer en ny version", async ({ page }) => {
  test.skip(!hasPlaywrightTestUser(), REQUIRES_TEST_USER);

  await openFloorPlanEditorWithPlan(page);

  const version = page.getByTestId("floor-plan-version");
  const before = (await version.textContent())?.trim() ?? "";
  expect(before).not.toBe("ingen version");

  const wall = page.locator('line[data-wall-id="w_int_1"]');
  await expect(wall).toHaveCount(1);
  const box = await wall.boundingBox();
  if (!box) throw new Error("Kunne ikke finde intern vaeg paa canvas");
  const midX = box.x + box.width / 2;
  const midY = box.y + box.height / 2;

  await page.mouse.move(midX, midY);
  await page.mouse.down();
  await page.mouse.move(midX + 70, midY, { steps: 8 });
  await page.mouse.up();

  await expect(version).not.toHaveText(before, { timeout: 15_000 });
});

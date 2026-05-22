import { test, expect } from "@playwright/test";

test("production build renders project start", async ({ page }) => {
  await page.goto("/projekt/start");
  await expect(page.getByRole("link", { name: /Start med en adresse/i })).toBeVisible();
});

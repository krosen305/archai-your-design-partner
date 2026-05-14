import { expect, test } from "@playwright/test";

test("guest flow: start -> adresse", async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  await page.goto("/projekt/start");
  await page.getByRole("link", { name: /Start med en adresse/i }).click();
  await expect(page).toHaveURL("/projekt/adresse");
  await expect(page.getByTestId("address-input")).toBeVisible();
});

test("adresse side viser dev shortcut i udvikling", async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  await page.goto("/projekt/adresse");
  await expect(page.getByRole("button", { name: /DEV: Brug mock-adresse/i })).toBeVisible();
});

import { test } from "@playwright/test";

// Blocker: der findes endnu ikke en deterministisk DEV-fixture der sætter hard_stop=true.
// Den nuværende mock-adresse (Hasselvej 48, Virum) returnerer ikke hard_stop=true.
//
// For at gøre denne test reel:
// 1. Tilføj en "DEV: Brug hard-stop mock" knap i projekt.adresse.tsx (kun i dev-mode)
// 2. Knappen skal navigere til et seeded projekt med hard_stop=true og en hard_stop_reason
// 3. Erstat denne placeholder med:
//
//    test("hard-stop project shows HARD STOP banner before AI design", async ({ page }) => {
//      await page.goto("/projekt/adresse");
//      await page.getByRole("button", { name: /DEV: Brug hard.stop mock/i }).click();
//      await page.waitForURL(/\/projekt\/.+\/cockpit/, { timeout: 15_000 });
//
//      await expect(page.getByText(/HARD STOP/i)).toBeVisible({ timeout: 10_000 });
//
//      const aiDesignBtn = page.getByRole("button", { name: /Generer design/i });
//      if (await aiDesignBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
//        await expect(aiDesignBtn).toBeDisabled();
//      }
//    });
//
// Se docs/testing-strategy.md for kontekst.

test.skip("hard-stop project shows HARD STOP banner before AI design", async () => {
  // Afventer DEV hard-stop fixture — se kommentar ovenfor
});

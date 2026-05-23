import { test, expect } from "@playwright/test";
import { enterCockpitWithHardStop } from "./helpers/session";

test("hard-stop project shows HARD STOP banner before AI design", async ({ page }) => {
  await enterCockpitWithHardStop(page);

  await expect(page.getByText(/HARD STOP/i)).toBeVisible({ timeout: 10_000 });

  const aiDesignBtn = page.getByRole("button", { name: /Generer design/i });
  if (await aiDesignBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
    await expect(aiDesignBtn).toBeDisabled();
  }
});

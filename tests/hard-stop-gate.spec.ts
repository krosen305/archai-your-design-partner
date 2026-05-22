import { test, expect } from "@playwright/test";
import { enterCockpitWithMockAddress } from "./helpers/session";

// TODO: Kræver en deterministisk seeded hard-stop fixture route.
// Denne test er en placeholder til hard-stop acceptance spec.
// For at gøre testen reel: tilføj en mock-adresse route der altid returnerer hard_stop=true.
test.skip("hard-stop project shows HARD STOP banner before AI design", async ({ page }) => {
  await enterCockpitWithMockAddress(page);
  // Når en hard-stop fixture route er tilgængelig:
  // await expect(page.getByText(/HARD STOP/i)).toBeVisible();
  // await expect(page.getByRole("button", { name: /Generer design/i })).toBeDisabled();
});

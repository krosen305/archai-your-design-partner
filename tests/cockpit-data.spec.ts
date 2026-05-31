import { expect, test } from "@playwright/test";
import { enterCockpitWithAddress, hasPlaywrightTestUser } from "./helpers/session";

const REQUIRES_TEST_USER =
  "Kraever PLAYWRIGHT_TEST_EMAIL og PLAYWRIGHT_TEST_PASSWORD i environment.";

test.setTimeout(120_000);

test("adresseflow: logget ind bruger navigerer til cockpit", async ({ page }) => {
  test.skip(!hasPlaywrightTestUser(), REQUIRES_TEST_USER);

  await enterCockpitWithAddress(page);

  await expect(page.getByText(/Hasselvej 48/i).first()).toBeVisible();
  await expect(page.getByText(/Analyserer adresse|GRUNDAREAL/i).first()).toBeVisible({
    timeout: 15_000,
  });
});

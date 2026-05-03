/**
 * tests/address-flow.spec.ts
 *
 * Mockes alle /_serverFn/* POST-kald og differentierer på request-body:
 *   data.q          → searchAddresses  (GSearch)
 *   data.adresseid  → fetchAddressDetails (DAR)
 *   ellers          → fetchCompliance  (BBR / analyse-pipeline)
 */
import { test, expect, type Page } from "@playwright/test";

const TEST_ADRESSE = "Hasselvej 48";
const TEST_ADRESSEID = "0a3f50a3-22a9-32b8-e044-0003ba298018";
const TEST_ADGANGSADRESSEID = "0a3f50ab-c8d1-32b8-e044-0003ba298018";

const MOCK_GSEARCH_RESULT = [
  {
    adresseid: TEST_ADRESSEID,
    adgangsadresseid: "",
    tekst: "Hasselvej 48, 2740 Skovlunde",
    postnr: "2740",
    postnrnavn: "Skovlunde",
    kommunekode: "0151",
    koordinater: { lat: 55.714, lng: 12.423 },
  },
];

const MOCK_DAR_DETAILS = {
  adresse: "Hasselvej 48, 2740 Skovlunde",
  postnr: "2740",
  postnrnavn: "Skovlunde",
  kommunekode: "0151",
  kommunenavn: "Ballerup",
  matrikel: "5a Skovlunde By",
  adgangsadresseid: TEST_ADGANGSADRESSEID,
  koordinater: { lat: 55.714, lng: 12.423 },
  bbrId: null,
  ejerlavskode: 20551,
  matrikelnummer: "5a",
};

// fetchCompliance returnerer ComplianceResult — ikke flad BBR-data
const MOCK_BBR_RESULT = {
  bbr: {
    byggeaar: "1962",
    bebygget_areal: 140,
    samlet_areal: 175,
    antal_etager: 1,
    anvendelseskode: "120",
    anvendelse_tekst: "Fritliggende enfamilieshus",
    ydervæg_kode: "1",
    tagdækning_kode: "3",
    varme_kode: "1",
    grundareal: 850,
    bebyggelsesprocent: 16.5,
    beregning_mulig: true,
    fejl: null,
  },
  lokalplaner: [],
  kommuneplanramme: null,
  analysedAt: "2026-05-02T12:00:00.000Z",
  lokalplanExtract: null,
  naturbeskyttelse: null,
  dkjord: null,
};

async function mockServerFns(page: Page) {
  await page.route("**/_serverFn/**", async (route) => {
    if (route.request().method() !== "POST") {
      await route.continue();
      return;
    }

    let body: { data?: Record<string, unknown> } = {};
    try {
      body = JSON.parse(route.request().postData() ?? "{}");
    } catch {
      /* ignore */
    }

    const data = body?.data ?? {};

    if ("q" in data) {
      // searchAddresses (GSearch)
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(MOCK_GSEARCH_RESULT),
      });
    } else if ("adresseid" in data) {
      // fetchAddressDetails (DAR)
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(MOCK_DAR_DETAILS),
      });
    } else {
      // fetchCompliance (BBR / analyse-pipeline)
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(MOCK_BBR_RESULT),
      });
    }
  });
}

async function typeInAddressInput(page: Page, tekst: string) {
  const input = page.getByTestId("address-input");
  await input.click();
  await input.selectText();
  await page.keyboard.press("Delete");
  await input.pressSequentially(tekst, { delay: 40 });
}

async function vælgFørsteForslag(page: Page) {
  await expect(page.getByTestId("address-suggestion").first()).toBeVisible({ timeout: 8_000 });
  await page.getByTestId("address-suggestion").first().click();
}

// ---------------------------------------------------------------------------

test("address flow: GSearch forslag vises + chips opdateres", async ({ page }) => {
  await mockServerFns(page);
  await page.goto("/projekt/adresse");

  await typeInAddressInput(page, TEST_ADRESSE);
  await vælgFørsteForslag(page);

  // Chips skal dukke op
  await expect(page.getByTestId("chip-matrikel")).toBeVisible({ timeout: 8_000 });
  await expect(page.getByTestId("chip-kommune")).toBeVisible();
  await expect(page.getByTestId("chip-bbr")).toBeVisible();

  // DAR-details ankommer server-side — BBR-chip skal ende med "Klar"
  await expect(page.getByTestId("chip-bbr")).toContainText(/Klar/, { timeout: 8_000 });
  await expect(page.getByTestId("chip-matrikel")).toContainText(/5a/);
  await expect(page.getByTestId("chip-kommune")).toContainText(/Ballerup/);

  const knap = page.getByRole("button", { name: /Fortsæt/ });
  await expect(knap).toBeEnabled();
});

test("address flow: navigation til byggeanalyse virker", async ({ page }) => {
  await mockServerFns(page);
  await page.goto("/projekt/adresse");

  await typeInAddressInput(page, TEST_ADRESSE);
  await vælgFørsteForslag(page);

  await expect(page.getByRole("button", { name: /^Fortsæt →$/ })).toBeEnabled({
    timeout: 8_000,
  });

  await page.getByRole("button", { name: /^Fortsæt →$/ }).click();
  // Adresse → boligoenske — tjek at vi forlader adresse-siden
  await expect(page).toHaveURL(/\/projekt\/(boligoenske|byggeanalyse)/);
});

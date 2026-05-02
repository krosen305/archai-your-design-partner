/**
 * tests/wizard-flow.spec.ts
 *
 * Full wizard flow: Adresse → Hus-DNA → Compliance → Match
 *
 * Alle /_serverFn/* POST-kald mockes på body-indhold:
 *   data.q          → searchAddresses  (GSearch)
 *   data.adresseid  → fetchAddressDetails (DAR)
 *   data.fritekst   → generateHusDna
 *   data.addressId  → fetchCompliance (BBR / analyse-pipeline)
 */
import { test, expect, type Page } from "@playwright/test";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const TEST_ADRESSE = "Hasselvej 48";
const TEST_ADRESSEID = "0a3f50a3-22a9-32b8-e044-0003ba298018";
const TEST_ADGANGSADRESSEID = "0a3f50ab-c8d1-32b8-e044-0003ba298018";

const MOCK_GSEARCH = [
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

const MOCK_DAR = {
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

const MOCK_HUS_DNA = {
  stil: "Nordisk Minimalisme",
  bruttoareal: "180 m²",
  etager: "1.5",
  tagform: "Ensidig taghældning",
  energiklasse: "A2020",
  saerligeKrav: ["Carport", "Åben køkken-alrum"],
  confidence: 87,
  kilde: "mock",
};

const MOCK_BBR = {
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
};

const MOCK_COMPLIANCE = {
  bbr: MOCK_BBR,
  lokalplaner: [],
  kommuneplanramme: null,
  analysedAt: "2026-05-02T12:00:00.000Z",
  lokalplanExtract: null,
  naturbeskyttelse: null,
  dkjord: {
    v1Kortlagt: false,
    v2Kortlagt: false,
    olietank: { eksisterer: true, driftsstatus: "ikke i drift" },
    omraadeklassificering: "Lettere forurenet",
  },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function mockAllServerFns(page: Page) {
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

    let responseBody: unknown;

    if ("q" in data) {
      responseBody = MOCK_GSEARCH;
    } else if ("adresseid" in data) {
      responseBody = MOCK_DAR;
    } else if ("fritekst" in data || "billedUrls" in data) {
      responseBody = MOCK_HUS_DNA;
    } else {
      responseBody = MOCK_COMPLIANCE;
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(responseBody),
    });
  });
}

async function typeInAddressInput(page: Page, tekst: string) {
  const input = page.getByTestId("address-input");
  await input.click();
  await input.selectText();
  await page.keyboard.press("Delete");
  await input.pressSequentially(tekst, { delay: 40 });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test("fuld wizard: adresse → hus-dna → compliance → match", async ({ page }) => {
  await mockAllServerFns(page);

  // Trin 1: Vælg adresse
  await page.goto("/projekt/adresse");
  await typeInAddressInput(page, TEST_ADRESSE);
  await expect(page.getByTestId("address-suggestion").first()).toBeVisible({ timeout: 8_000 });
  await page.getByTestId("address-suggestion").first().click();
  await expect(page.getByTestId("chip-bbr")).toContainText(/Klar/, { timeout: 8_000 });
  await page.getByRole("button", { name: /Fortsæt/ }).click();
  await expect(page).toHaveURL("/projekt/hus-dna");

  // Trin 2: Generér Hus-DNA
  await page.getByTestId("hus-dna-beskrivelse").fill("Nordisk minimalistisk hus med flade tage");
  await page.getByTestId("generer-hus-dna").click();
  await expect(page.getByTestId("hus-dna-result")).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText("Nordisk Minimalisme")).toBeVisible();
  await page.getByTestId("analyser-adresse").click();
  await expect(page).toHaveURL("/projekt/compliance");

  // Trin 3: Compliance pipeline
  await expect(page.getByTestId("compliance-continue")).toBeVisible({ timeout: 10_000 });
  await page.getByTestId("compliance-continue").click();
  await expect(page).toHaveURL("/projekt/match");

  // Trin 4: Match-rapport
  await expect(page.getByTestId("compliance-matrix")).toBeVisible();
  await expect(page.getByTestId("compliance-row-bebyggelsesprocent")).toBeVisible();
});

test("compliance: DK-Jord advarsler vises i match", async ({ page }) => {
  await mockAllServerFns(page);

  // Naviger direkte til adresse og kør flow
  await page.goto("/projekt/adresse");
  await typeInAddressInput(page, TEST_ADRESSE);
  await expect(page.getByTestId("address-suggestion").first()).toBeVisible({ timeout: 8_000 });
  await page.getByTestId("address-suggestion").first().click();
  await page.getByRole("button", { name: /Fortsæt/ }).click();
  await expect(page).toHaveURL("/projekt/hus-dna");

  // Spring Hus-DNA over ved at navigere direkte til compliance
  await page.goto("/projekt/compliance");
  await expect(page.getByTestId("compliance-continue")).toBeVisible({ timeout: 10_000 });
  await page.getByTestId("compliance-continue").click();
  await expect(page).toHaveURL("/projekt/match");

  // DK-Jord flags skal vises
  await expect(page.getByTestId("compliance-row-dkjord-olietank")).toBeVisible();
  await expect(page.getByTestId("compliance-row-dkjord-omraade")).toBeVisible();
});

test("hus-dna: generering og resultat vises", async ({ page }) => {
  await mockAllServerFns(page);

  // Sæt adresse-state via address-flow
  await page.goto("/projekt/adresse");
  await typeInAddressInput(page, TEST_ADRESSE);
  await expect(page.getByTestId("address-suggestion").first()).toBeVisible({ timeout: 8_000 });
  await page.getByTestId("address-suggestion").first().click();
  await page.getByRole("button", { name: /Fortsæt/ }).click();
  await expect(page).toHaveURL("/projekt/hus-dna");

  // Generer og verificér resultat
  await page.getByTestId("hus-dna-beskrivelse").fill("Åben planløsning med stor have");
  await page.getByTestId("generer-hus-dna").click();

  await expect(page.getByTestId("hus-dna-result")).toBeVisible({ timeout: 10_000 });
  await expect(page.getByTestId("analyser-adresse")).toBeVisible();
  await expect(page.getByTestId("analyser-adresse")).toBeEnabled();
});

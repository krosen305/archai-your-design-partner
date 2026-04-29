/**
 * tests/address-flow.spec.ts
 */
import { test, expect, type Page } from '@playwright/test';

const TEST_ADRESSE = 'Hasselvej 48';

async function mockBbr(page: Page) {
  await page.route('**/_server**', async (route) => {
    if (route.request().method() === 'POST') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          byggeaar: '1962',
          bebygget_areal: 140,
          samlet_areal: 175,
          antal_etager: 1,
          anvendelseskode: '120',
          anvendelse_tekst: 'Fritliggende enfamilieshus',
          ydervæg_kode: '1',
          tagdækning_kode: '3',
          varme_kode: '1',
          grundareal: 850,
          bebyggelsesprocent: 16.5,
          beregning_mulig: true,
          fejl: null,
        }),
      });
    } else {
      await route.continue();
    }
  });
}

/**
 * Korrekt måde at interagere med React inputs i Playwright:
 * fill() trigger ikke altid onChange – brug click() + pressSequentially()
 */
async function typeInAddressInput(page: Page, tekst: string) {
  const input = page.getByTestId('address-input');
  await input.click();
  // Ryd eksisterende indhold
  await input.selectText();
  await page.keyboard.press('Delete');
  // Skriv tegn for tegn med lille forsinkelse så React events trigger korrekt
  await input.pressSequentially(tekst, { delay: 40 });
}

async function vælgFørsteForslag(page: Page) {
  await expect(
    page.getByTestId('address-suggestion').first()
  ).toBeVisible({ timeout: 8_000 });
  await page.getByTestId('address-suggestion').first().click();
}

// ---------------------------------------------------------------------------

test('address flow: DAWA select + chips vises', async ({ page }) => {
  await mockBbr(page);
  await page.goto('/projekt/adresse');

  await typeInAddressInput(page, TEST_ADRESSE);
  await vælgFørsteForslag(page);

  // Chips der eksisterer i den nye route
  await expect(page.getByTestId('chip-matrikel')).toBeVisible({ timeout: 8_000 });
  await expect(page.getByTestId('chip-kommune')).toBeVisible();
  await expect(page.getByTestId('chip-bbr')).toBeVisible();

  await expect(page.getByTestId('chip-matrikel')).toContainText(/Matrikel:\s*\S+/);
  await expect(page.getByTestId('chip-kommune')).toContainText(/Kommune:\s*\S+/);
  await expect(page.getByTestId('chip-bbr')).toContainText(/Klar/);

  const knap = page.getByRole('button', { name: /Analysér adresse/ });
  await expect(knap).toBeEnabled();
});

test('address flow: navigation til compliance virker', async ({ page }) => {
  await mockBbr(page);
  await page.goto('/projekt/adresse');

  await typeInAddressInput(page, TEST_ADRESSE);
  await vælgFørsteForslag(page);

  await expect(
    page.getByRole('button', { name: /Analysér adresse/ })
  ).toBeEnabled({ timeout: 8_000 });

  await page.getByRole('button', { name: /Analysér adresse/ }).click();
  await expect(page).toHaveURL('/projekt/compliance');

  await expect(page.getByText('BYGNING FUNDET')).toBeVisible({
    timeout: 10_000,
  });
  await expect(page.getByText('16.5%')).toBeVisible();
  await expect(page.getByText(/Opført 1962/)).toBeVisible();
});
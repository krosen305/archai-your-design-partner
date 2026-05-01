# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: address-flow.spec.ts >> address flow: navigation til compliance virker
- Location: tests\address-flow.spec.ts:79:1

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByText('BYGNING FUNDET')
Expected: visible
Timeout: 10000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 10000ms
  - waiting for getByText('BYGNING FUNDET')

```

# Page snapshot

```yaml
- generic [ref=e2]:
    - banner [ref=e3]:
        - generic [ref=e4]:
            - link "ARCHAI" [ref=e5] [cursor=pointer]:
                - /url: /
            - generic [ref=e6]:
                - button "Trin 1" [ref=e7] [cursor=pointer]
                - button "Trin 2" [ref=e8] [cursor=pointer]
                - button "Trin 3" [ref=e9]
                - button "Trin 4" [disabled] [ref=e10]
                - button "Trin 5" [disabled] [ref=e11]
    - link "Tilbage" [ref=e15] [cursor=pointer]:
        - /url: /projekt/adresse
        - img [ref=e16]
        - text: Tilbage
```

# Test source

```ts
  1  | /**
  2  |  * tests/address-flow.spec.ts
  3  |  */
  4  | import { test, expect, type Page } from '@playwright/test';
  5  |
  6  | const TEST_ADRESSE = 'Hasselvej 48';
  7  |
  8  | async function mockBbr(page: Page) {
  9  |   await page.route('**/_server**', async (route) => {
  10 |     if (route.request().method() === 'POST') {
  11 |       await route.fulfill({
  12 |         status: 200,
  13 |         contentType: 'application/json',
  14 |         body: JSON.stringify({
  15 |           byggeaar: '1962',
  16 |           bebygget_areal: 140,
  17 |           samlet_areal: 175,
  18 |           antal_etager: 1,
  19 |           anvendelseskode: '120',
  20 |           anvendelse_tekst: 'Fritliggende enfamilieshus',
  21 |           ydervæg_kode: '1',
  22 |           tagdækning_kode: '3',
  23 |           varme_kode: '1',
  24 |           grundareal: 850,
  25 |           bebyggelsesprocent: 16.5,
  26 |           beregning_mulig: true,
  27 |           fejl: null,
  28 |         }),
  29 |       });
  30 |     } else {
  31 |       await route.continue();
  32 |     }
  33 |   });
  34 | }
  35 |
  36 | /**
  37 |  * Korrekt måde at interagere med React inputs i Playwright:
  38 |  * fill() trigger ikke altid onChange – brug click() + pressSequentially()
  39 |  */
  40 | async function typeInAddressInput(page: Page, tekst: string) {
  41 |   const input = page.getByTestId('address-input');
  42 |   await input.click();
  43 |   // Ryd eksisterende indhold
  44 |   await input.selectText();
  45 |   await page.keyboard.press('Delete');
  46 |   // Skriv tegn for tegn med lille forsinkelse så React events trigger korrekt
  47 |   await input.pressSequentially(tekst, { delay: 40 });
  48 | }
  49 |
  50 | async function vælgFørsteForslag(page: Page) {
  51 |   await expect(
  52 |     page.getByTestId('address-suggestion').first()
  53 |   ).toBeVisible({ timeout: 8_000 });
  54 |   await page.getByTestId('address-suggestion').first().click();
  55 | }
  56 |
  57 | // ---------------------------------------------------------------------------
  58 |
  59 | test('address flow: DAWA select + chips vises', async ({ page }) => {
  60 |   await mockBbr(page);
  61 |   await page.goto('/projekt/adresse');
  62 |
  63 |   await typeInAddressInput(page, TEST_ADRESSE);
  64 |   await vælgFørsteForslag(page);
  65 |
  66 |   // Chips der eksisterer i den nye route
  67 |   await expect(page.getByTestId('chip-matrikel')).toBeVisible({ timeout: 8_000 });
  68 |   await expect(page.getByTestId('chip-kommune')).toBeVisible();
  69 |   await expect(page.getByTestId('chip-bbr')).toBeVisible();
  70 |
  71 |   await expect(page.getByTestId('chip-matrikel')).toContainText(/Matrikel:\s*\S+/);
  72 |   await expect(page.getByTestId('chip-kommune')).toContainText(/Kommune:\s*\S+/);
  73 |   await expect(page.getByTestId('chip-bbr')).toContainText(/Klar/);
  74 |
  75 |   const knap = page.getByRole('button', { name: /Analysér adresse/ });
  76 |   await expect(knap).toBeEnabled();
  77 | });
  78 |
  79 | test('address flow: navigation til compliance virker', async ({ page }) => {
  80 |   await mockBbr(page);
  81 |   await page.goto('/projekt/adresse');
  82 |
  83 |   await typeInAddressInput(page, TEST_ADRESSE);
  84 |   await vælgFørsteForslag(page);
  85 |
  86 |   await expect(
  87 |     page.getByRole('button', { name: /Analysér adresse/ })
  88 |   ).toBeEnabled({ timeout: 8_000 });
  89 |
  90 |   await page.getByRole('button', { name: /Analysér adresse/ }).click();
  91 |   await expect(page).toHaveURL('/projekt/compliance');
  92 |
> 93 |   await expect(page.getByText('BYGNING FUNDET')).toBeVisible({
     |                                                  ^ Error: expect(locator).toBeVisible() failed
  94 |     timeout: 10_000,
  95 |   });
  96 |   await expect(page.getByText('16.5%')).toBeVisible();
  97 |   await expect(page.getByText(/Opført 1962/)).toBeVisible();
  98 | });
```

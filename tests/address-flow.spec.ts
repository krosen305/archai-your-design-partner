import { test, expect } from '@playwright/test';

test('address flow: DAWA select + BBR data appears', async ({ page }) => {
  const pageErrors: Error[] = [];
  page.on('pageerror', (e) => pageErrors.push(e));
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      // Surface browser console errors in Playwright output.
      // eslint-disable-next-line no-console
      console.error('[browser]', msg.text());
    }
  });

  await page.goto('/projekt/adresse');
  // Wait for TanStack Start hydration to complete (the stream barrier deletes window.$_TSR).
  await page.waitForFunction(() => !(window as any).$_TSR);

  const input = page.getByTestId('address-input');
  await input.click();
  await input.fill('');
  await page.keyboard.type('Hasselvej 48', { delay: 20 });

  // Wait for the suggestions dropdown to appear and contain the requested city.
  const list = page.getByTestId('address-suggestions');
  await expect(list).toBeVisible();

  const suggestion = page
    .getByTestId('address-suggestion')
    .filter({ hasText: /2830\s+Virum/i })
    .first();

  await expect(suggestion).toBeVisible();
  await suggestion.click();

  // After selecting, we show data chips. Verify matrikel + byggeår are on screen.
  await expect(page.getByTestId('chip-matrikel')).toBeVisible();
  await expect(page.getByTestId('chip-byggeaar')).toBeVisible();

  // Ensure values are rendered (not empty). We don't assert exact values yet.
  await expect(page.getByTestId('chip-matrikel')).toContainText(/Matrikel:\s*\S+/);
  await expect(page.getByTestId('chip-byggeaar')).toContainText(/Byggeår:\s*\S+/);

  expect(pageErrors).toEqual([]);
});


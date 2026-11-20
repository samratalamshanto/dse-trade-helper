import type { Route } from '@playwright/test';
import { test, expect } from './fixtures';

const json = (route: Route, body: unknown) =>
  route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });

const COMPANIES = {
  rows: [
    {
      code: 'GP', name: 'GrameenPhone Ltd', sector: 'Telecom', category: 'A',
      price: 226.9, changePct: 0.5, signal: 'hold', score: 7, quality: 'good',
      fraud: 'none', flags: [], pe: 10, dividendYield: 4, epsCagr: 2, change1y: 5,
      dailyValue: 1e9, weekHigh52: 282, weekLow52: 221.9, stale: false,
    },
    {
      code: 'AFCAGRO', name: 'AFC Agro Biotech Ltd', sector: 'Agriculture', category: 'B',
      price: 15.5, changePct: 0.1, signal: 'hold', score: 4, quality: 'fair',
      fraud: 'none', flags: [], pe: 8, dividendYield: 2, epsCagr: 1, change1y: 2,
      dailyValue: 1e7, weekHigh52: null, weekLow52: null, stale: false,
    },
    {
      code: 'AAMRATECH', name: 'aamra technologies ltd', sector: 'IT', category: 'A',
      price: 42.3, changePct: -0.2, signal: 'hold', score: 5, quality: 'fair',
      fraud: 'none', flags: [], pe: 12, dividendYield: 1, epsCagr: 3, change1y: 1,
      dailyValue: 5e7, weekHigh52: null, weekLow52: null, stale: false,
    },
  ],
  session: null,
};

const THEMES = ['dark', 'light'] as const;

for (const theme of THEMES) {
  test.describe(`alerts form [${theme}]`, () => {
    test.beforeEach(async ({ page }) => {
      await page.emulateMedia({ colorScheme: theme });
      await page.addInitScript((t) => localStorage.setItem('theme', t), theme);
      await page.route('**/api/companies', (r) => json(r, COMPANIES));
      await page.route('**/api/dividends', (r) => json(r, { upcoming: [], session: null }));
    });

    test('suggestions: GP is first; listbox wider than input; no horizontal scroll', async ({ page }) => {
      await page.goto('/alerts');
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);

      const codeInput = page.getByLabel('Company code');
      await codeInput.fill('G');
      const listbox = page.getByRole('listbox', { name: 'Company suggestions' });
      await expect(listbox).toBeVisible();

      // GP must be the first option
      const firstOption = listbox.getByRole('option').first();
      await expect(firstOption).toContainText('GP');

      // Listbox must be wider than the 120px code input
      const inputBox = await codeInput.boundingBox();
      const listBox = await listbox.boundingBox();
      expect(listBox!.width).toBeGreaterThan(inputBox!.width);

      // No horizontal overflow inside the listbox
      const overflow = await listbox.evaluate((el) => el.scrollWidth - el.clientWidth);
      expect(overflow).toBeLessThanOrEqual(0);
    });

    test('price info line and chips appear after choosing GP + price_below', async ({ page }) => {
      await page.goto('/alerts');

      // Select rule type first (may need retry due to hydration)
      await expect(async () => {
        await page.getByLabel('Rule type').selectOption('price_below');
        await expect(page.getByLabel('Target price (৳)')).toBeVisible({ timeout: 1_000 });
      }).toPass();

      const codeInput = page.getByLabel('Company code');
      await codeInput.fill('G');
      const listbox = page.getByRole('listbox', { name: 'Company suggestions' });
      await expect(listbox).toBeVisible();
      await listbox.getByRole('option', { name: /^GP/ }).click();

      // Price info line should show current price
      await expect(page.getByText(/GP now ৳226\.90/)).toBeVisible();

      // -5% chip: 226.9 * 0.95 = 215.555 → rounded to 215.56
      const chip = page.getByRole('button', { name: /-5%.*215\.56/ });
      await expect(chip).toBeVisible();
      await chip.click();

      // Target input should now have 215.56
      await expect(page.getByLabel('Target price (৳)')).toHaveValue('215.56');
    });
  });
}

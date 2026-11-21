import { test, expect } from './fixtures';

test('compare: add 3 codes, unknown code shows a message', async ({ page }) => {
  await page.goto('/compare');
  await expect(page.getByText('Pick at least two companies.')).toBeVisible();
  const input = page.getByLabel('Add a company');
  for (const c of ['GP', 'BRACBANK', 'SQURPHARMA']) {
    await input.fill(c);
    await page.getByRole('button', { name: 'Add', exact: true }).click();
    await expect(page.getByRole('button', { name: `Remove ${c} from comparison` })).toBeVisible();
  }
  await expect(page).toHaveURL(/codes=GP,BRACBANK,SQURPHARMA/);
  await expect(page.locator('table.compare thead th a')).toHaveCount(3);
  await expect(page.getByRole('rowheader', { name: 'P/E', exact: true })).toBeVisible();
  await input.fill('NOSUCH');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'No DSE company with the code "NOSUCH"' })).toBeVisible();
});

test('alerts: create and delete a rule', async ({ page }) => {
  await page.goto('/alerts');
  // A choice made before hydration is reset by React; retry until the form reacts to it.
  await expect(async () => {
    await page.getByLabel('Rule type').selectOption('price_above');
    await expect(page.getByLabel('Target price (৳)')).toBeVisible({ timeout: 1_000 });
  }).toPass();
  await page.getByLabel('Company code').fill('GP');
  await page.getByLabel('Target price (৳)').fill('123.45');
  await page.getByRole('button', { name: 'Add rule' }).click();
  const del = page.getByRole('button', { name: 'Delete rule GP price ≥ ৳123.45' });
  await expect(del).toHaveCount(1);
  await page.reload();
  await expect(del).toHaveCount(1);
  await del.click();
  await expect(del).toHaveCount(0);
});

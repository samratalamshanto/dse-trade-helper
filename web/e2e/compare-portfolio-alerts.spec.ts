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

test.describe('portfolio CSV', () => {
  test('paste 2 rows imports holdings', async ({ page }) => {
    await page.goto('/portfolio');
    await expect(page.getByText('Your portfolio is empty.')).toBeVisible();
    await page.getByLabel('Paste CSV text to import').fill('code,shares,avg cost\nGP,100,50\nBRACBANK,200,40');
    await expect(page.getByText('2 rows will be imported.')).toBeVisible();
    await page.getByRole('button', { name: 'Append 2 holdings' }).click();
    await expect(page.getByText('Your portfolio is empty.')).toHaveCount(0);
    const table = page.locator('table').filter({ hasText: 'Avg buy' });
    await expect(table.getByText('GP', { exact: true })).toBeVisible();
    await expect(table.getByText('BRACBANK', { exact: true })).toBeVisible();
    await page.reload();
    await expect(table.getByText('GP', { exact: true })).toBeVisible();
  });

  test('more than 2000 rows is rejected with a message', async ({ page }) => {
    await page.goto('/portfolio');
    const csv = ['code,shares,avg cost', ...Array.from({ length: 2001 }, () => 'GP,1,10')].join('\n');
    await page.getByLabel('Paste CSV text to import').fill(csv);
    await expect(page.getByText(/Too many rows \(2001\)\. Import at most 2,000 rows/)).toBeVisible();
    await expect(page.getByRole('button', { name: /^(Append|Replace) 0 holdings/ })).toBeDisabled();
  });
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

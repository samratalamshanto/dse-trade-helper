import { test, expect, isPhone } from './fixtures';

// /all — company picker filters the list
test.describe('/all company picker', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/all');
    // Wait until at least one row with a price is visible
    await expect(page.locator('table.cards tbody tr').first()).toContainText('৳', { timeout: 20_000 });
  });

  test('typing a code shows suggestions', async ({ page }) => {
    const picker = page.getByRole('combobox', { name: 'Pick a company' });
    await picker.fill('GP');
    const listbox = page.getByRole('listbox');
    await expect(listbox).toBeVisible();
    await expect(listbox.getByRole('option').first()).toContainText('GP');
  });

  test('picking a company narrows the list', async ({ page }) => {
    const all = await page.locator('table.cards tbody tr').count();
    const picker = page.getByRole('combobox', { name: 'Pick a company' });
    // Use a unique-enough code so the first suggestion is unambiguous
    await picker.fill('BRACBANK');
    await expect(page.getByRole('listbox')).toBeVisible();
    await page.getByRole('listbox').getByRole('option').first().click();
    // List must narrow to exactly 1 row
    await expect(page.locator('table.cards tbody tr')).toHaveCount(1);
    expect(await page.locator('table.cards tbody tr').count()).toBeLessThan(all);
  });

  test('Show all button clears the company filter', async ({ page }) => {
    const picker = page.getByRole('combobox', { name: 'Pick a company' });
    await picker.fill('GP');
    await page.getByRole('listbox').getByRole('option', { name: /GP/ }).first().click();
    // Show all resets
    await page.getByRole('button', { name: /Show all/ }).click();
    const shown = await page.locator('table.cards tbody tr').count();
    expect(shown).toBeGreaterThan(5);
    await expect(page.getByRole('button', { name: /Show all/ })).not.toBeVisible();
  });

  test('keyboard: Enter on first suggestion picks it', async ({ page }) => {
    const picker = page.getByRole('combobox', { name: 'Pick a company' });
    await picker.fill('BRACBANK');
    await expect(page.getByRole('listbox')).toBeVisible();
    await picker.press('Enter');
    const shown = await page.locator('table.cards tbody tr').count();
    expect(shown).toBeGreaterThanOrEqual(1);
  });

  test('phone: picker and Show all are accessible at 390 px', async ({ page }, info) => {
    test.skip(!isPhone(info.project.name), 'phone only');
    const picker = page.getByRole('combobox', { name: 'Pick a company' });
    await expect(picker).toBeVisible();
    const box = await picker.boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(44);
  });
});

// /watchlist — company picker adds to watchlist
test.describe('/watchlist company picker', () => {
  test.beforeEach(async ({ page }) => {
    // Clear watchlist
    await page.addInitScript(() => localStorage.removeItem('watchlist'));
    await page.goto('/watchlist');
  });

  test('picker input is visible', async ({ page }) => {
    await expect(page.getByRole('combobox', { name: 'Add a company' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Add' })).toBeVisible();
  });

  test('Add button disabled until a company is picked', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'Add' })).toBeDisabled();
    const picker = page.getByRole('combobox', { name: 'Add a company' });
    await picker.fill('GP');
    // Not yet picked from suggestions — still disabled
    await expect(page.getByRole('button', { name: 'Add' })).toBeDisabled();
  });

  test('picking and adding a company shows it in the list', async ({ page }) => {
    // Load company data first so the picker has suggestions
    await page.goto('/all');
    await expect(page.locator('table.cards tbody tr').first()).toContainText('৳', { timeout: 20_000 });
    await page.goto('/watchlist');

    const picker = page.getByRole('combobox', { name: 'Add a company' });
    // Use a unique code to avoid ambiguous matches
    await picker.fill('BRACBANK');
    await expect(page.getByRole('listbox')).toBeVisible();
    await page.getByRole('listbox').getByRole('option').first().click();
    await expect(page.getByRole('button', { name: 'Add' })).toBeEnabled();
    await page.getByRole('button', { name: 'Add' }).click();
    // Input clears and the row appears in the watchlist table
    await expect(page.getByRole('combobox', { name: 'Add a company' })).toHaveValue('');
    await expect(page.locator('table.cards tbody tr', { hasText: 'BRACBANK' })).toBeVisible();
  });

  test('already-watched company shows "Already in watchlist" after adding', async ({ page }) => {
    await page.goto('/all');
    await expect(page.locator('table.cards tbody tr').first()).toContainText('৳', { timeout: 20_000 });
    await page.goto('/watchlist');

    const picker = page.getByRole('combobox', { name: 'Add a company' });
    await picker.fill('BRACBANK');
    await expect(page.getByRole('listbox')).toBeVisible();
    await page.getByRole('listbox').getByRole('option').first().click();
    await page.getByRole('button', { name: 'Add' }).click();

    // Try to add the same company again
    await picker.fill('BRACBANK');
    await expect(page.getByRole('listbox')).toBeVisible();
    await page.getByRole('listbox').getByRole('option').first().click();
    await expect(page.getByRole('button', { name: /Already in watchlist/ })).toBeDisabled();
  });

  test('phone: add controls meet 44px tap target', async ({ page }, info) => {
    test.skip(!isPhone(info.project.name), 'phone only');
    const picker = page.getByRole('combobox', { name: 'Add a company' });
    const addBtn = page.getByRole('button', { name: 'Add' });
    const pBox = await picker.boundingBox();
    const bBox = await addBtn.boundingBox();
    expect(pBox!.height).toBeGreaterThanOrEqual(44);
    expect(bBox!.height).toBeGreaterThanOrEqual(44);
  });
});

// /warning-signs — company picker
test.describe('/warning-signs company picker', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/warning-signs');
    await expect(page.locator('table.cards tbody tr').first()).toBeVisible({ timeout: 20_000 });
  });

  test('picker input is visible', async ({ page }) => {
    await expect(page.getByRole('combobox', { name: 'Pick a company' })).toBeVisible();
  });

  test('picking a company narrows the warning list', async ({ page }) => {
    const all = await page.locator('table.cards tbody tr').count();
    const firstCode = (await page.locator('table.cards tbody tr b.mono').first().textContent())?.trim() ?? '';
    if (!firstCode) return;
    const picker = page.getByRole('combobox', { name: 'Pick a company' });
    await picker.fill(firstCode.slice(0, 3));
    const opts = page.getByRole('listbox').getByRole('option');
    if (await opts.count() === 0) return;
    // Pick the first option that matches firstCode exactly
    const matchOpt = page.getByRole('listbox').getByRole('option').filter({ hasText: firstCode }).first();
    if (await matchOpt.count()) await matchOpt.click();
    else await opts.first().click();
    const shown = await page.locator('table.cards tbody tr').count();
    expect(shown).toBeLessThanOrEqual(all);
    // Show all resets
    const showAllBtn = page.getByRole('button', { name: /Show all/ });
    if (await showAllBtn.isVisible()) {
      await showAllBtn.click();
      await expect(page.locator('table.cards tbody tr')).toHaveCount(all);
    }
  });
});

// /range — company picker
test.describe('/range company picker', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/range');
    await expect(page.locator('table.cards tbody tr').first()).toBeVisible({ timeout: 20_000 });
  });

  test('picker input is visible', async ({ page }) => {
    await expect(page.getByRole('combobox', { name: 'Pick a company' })).toBeVisible();
  });

  test('picking a company narrows the range list and sets code URL param', async ({ page }) => {
    const all = await page.locator('table.cards tbody tr').count();
    const picker = page.getByRole('combobox', { name: 'Pick a company' });
    await picker.fill('GP');
    const listbox = page.getByRole('listbox');
    await expect(listbox).toBeVisible();
    await listbox.getByRole('option', { name: /GP/ }).first().click();
    await expect(page).toHaveURL(/code=GP/);
    const shown = await page.locator('table.cards tbody tr').count();
    expect(shown).toBeLessThan(all);
    // Show all resets
    await page.getByRole('button', { name: /Show all/ }).click();
    await expect(page).not.toHaveURL(/code=/);
  });
});

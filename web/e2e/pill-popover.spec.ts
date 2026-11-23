import { test, expect, isPhone } from './fixtures';

// List pills open a short "why" box: tap/click, Escape, outside tap, and the link to the company page.
test('Companies: the signal pill explains itself and does not open the row', async ({ page }) => {
  await page.goto('/all');
  const pill = page.locator('tbody').getByRole('button', { name: /Caution|High risk|No strong signal/ }).first();
  await expect(pill).toHaveAttribute('aria-expanded', 'false');
  await pill.click();
  await expect(pill).toHaveAttribute('aria-expanded', 'true');
  const box = page.locator(`[id="${await pill.getAttribute('aria-controls')}"]`);
  await expect(box.getByText('Checks it misses')).toBeVisible();
  await expect(box.locator('li').first()).toBeVisible();
  await expect(box.getByRole('link', { name: 'See details →' })).toHaveAttribute('href', /^\/c\/[^#]+$/);
  await expect(page).toHaveURL(/\/all/);
  await page.keyboard.press('Escape');
  await expect(pill).toHaveAttribute('aria-expanded', 'false');
  await expect(pill).toBeFocused();
  await pill.click();
  await page.locator('h1').click();
  await expect(pill).toHaveAttribute('aria-expanded', 'false');
});

test('Companies: the warning pill lists its patterns and opens the safety tab', async ({ page }) => {
  await page.goto('/all');
  const pill = page.locator('tbody').getByRole('button', { name: /1 flag pattern|Several flags/ }).first();
  await pill.click();
  const box = page.locator(`[id="${await pill.getAttribute('aria-controls')}"]`);
  await expect(box.getByText('Patterns found')).toBeVisible();
  await box.getByRole('link', { name: 'See details →' }).click();
  await expect(page).toHaveURL(/\/c\/[^#]+#safety$/);
  await expect(page.getByRole('tab', { name: 'Safety checks' })).toHaveAttribute('aria-selected', 'true');
});

test('Watchlist: a second tap closes the box, and Bangla shows translated text', async ({ page }) => {
  await page.addInitScript(() => { localStorage.setItem('watchlist', '["GP"]'); localStorage.setItem('lang', 'bn'); });
  await page.goto('/watchlist');
  const pill = page.locator('tbody td[data-label="Signal"] button.pill');
  await pill.click();
  await expect(pill).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByRole('link', { name: 'বিস্তারিত দেখুন →' })).toBeVisible();
  await expect(page).toHaveURL(/\/watchlist/);
  await pill.click();
  await expect(pill).toHaveAttribute('aria-expanded', 'false');
  await page.locator('tbody td[data-label="Warning-sign check"] button.pill').press('Enter');
  await expect(page.getByRole('link', { name: 'বিস্তারিত দেখুন →' })).toHaveAttribute('href', '/c/GP#safety');
});

test('Desktop: hover opens the box, leaving closes it, and a click keeps it open', async ({ page }, info) => {
  test.skip(isPhone(info.project.name), 'phones have no hover');
  await page.goto('/all');
  const pill = page.locator('tbody td[data-label="Signal"] button.pill').first();
  await pill.hover();
  await expect(pill).toHaveAttribute('aria-expanded', 'true');
  await page.locator('h1').hover();
  await expect(pill).toHaveAttribute('aria-expanded', 'false');
  await pill.hover();
  await pill.click();
  await page.locator('h1').hover();
  await expect(pill).toHaveAttribute('aria-expanded', 'true');
  await pill.click();
  await expect(pill).toHaveAttribute('aria-expanded', 'false');
});

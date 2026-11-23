import { test, expect } from './fixtures';

test('learn and plan render', async ({ page }) => {
  await page.goto('/learn');
  await expect(page.getByRole('heading', { level: 1, name: 'How it works' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'The four signals' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'The warning-sign check' })).toBeVisible();
  await page.goto('/plan');
  await expect(page.getByRole('heading', { level: 1, name: 'Start investing' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'First steps' })).toBeVisible();
});

test('Bangla toggle switches lang to bn and back', async ({ page }) => {
  await page.goto('/learn');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await page.getByRole('button', { name: /Switch to Bangla/ }).click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'bn');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('lang', 'bn');
  await page.getByRole('button', { name: /Switch to English/ }).click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
});

test('theme toggle persists across reload', async ({ page }) => {
  await page.goto('/learn');
  const html = page.locator('html');
  await page.getByRole('button', { name: 'Toggle dark or light theme' }).click();
  const first = await expect.poll(async () => html.getAttribute('data-theme')).toMatch(/^(dark|light)$/).then(() => html.getAttribute('data-theme'));
  await page.reload();
  await expect(html).toHaveAttribute('data-theme', first!);
  await page.getByRole('button', { name: 'Toggle dark or light theme' }).click();
  await expect(html).not.toHaveAttribute('data-theme', first!);
});

test('security headers and path-traversal API', async ({ request }) => {
  const res = await request.get('/');
  const h = res.headers();
  expect(res.status()).toBe(200);
  expect(h['content-security-policy']).toContain("default-src 'self'");
  expect(h['content-security-policy']).toContain("frame-ancestors 'none'");
  expect(h['x-frame-options']).toBe('DENY');
  expect(h['x-content-type-options']).toBe('nosniff');
  expect(h['x-powered-by']).toBeUndefined();
  const bad = await request.get('/api/company/..%2F..%2Fetc');
  expect([400, 404]).toContain(bad.status());
});

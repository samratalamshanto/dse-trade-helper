import { test, expect, isPhone } from './fixtures';

// Each test runs in a fresh browser context with empty localStorage.

test('guide shows on first visit and can be dismissed', async ({ page }) => {
  await page.goto('/');
  const dialog = page.getByRole('dialog', { name: 'Welcome to Trade Helper' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText('Learning aid, not investment advice.')).toBeVisible();
  await dialog.getByRole('button', { name: 'Got it' }).click();
  await expect(dialog).not.toBeVisible();
});

test('guide does not reappear after dismiss and reload', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('dialog', { name: 'Welcome to Trade Helper' }).getByRole('button', { name: 'Got it' }).click();
  await page.reload();
  await expect(page.getByRole('dialog', { name: 'Welcome to Trade Helper' })).not.toBeVisible();
});

test('Escape key dismisses the guide', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('dialog', { name: 'Welcome to Trade Helper' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Welcome to Trade Helper' })).not.toBeVisible();
});

test('guide reopens from the Guide sidebar entry via /help', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('dialog', { name: 'Welcome to Trade Helper' }).getByRole('button', { name: 'Got it' }).click();
  await expect(page.getByRole('dialog', { name: 'Welcome to Trade Helper' })).not.toBeVisible();

  await page.route(/\/demo\.mp4(\?.*)?$/, (r) => r.fulfill({ status: 200, contentType: 'video/mp4', body: Buffer.alloc(0) }));
  await page.route(/\/demo\.vtt(\?.*)?$/, (r) => r.fulfill({ status: 200, contentType: 'text/vtt', body: 'WEBVTT\n' }));
  await page.goto('/help');
  await expect(page.getByRole('heading', { level: 1, name: 'Help & guides' })).toBeVisible();
  await page.getByRole('button', { name: 'Show the welcome guide again' }).click();
  await expect(page.getByRole('dialog', { name: 'Welcome to Trade Helper' })).toBeVisible();
});

test('Guide link appears in the sidebar', async ({ page }, info) => {
  await page.goto('/');
  await page.getByRole('dialog', { name: 'Welcome to Trade Helper' }).getByRole('button', { name: 'Got it' }).click();
  if (isPhone(info.project.name)) {
    await page.getByRole('button', { name: /Menu/i }).click();
  }
  const link = page.getByRole('link', { name: 'Guide' });
  await expect(link).toHaveAttribute('href', '/help');
});

test('/help: welcome guide section, and no link on the page leads to a missing file', async ({ page, request }) => {
  await page.goto('/');
  await page.getByRole('dialog', { name: 'Welcome to Trade Helper' }).getByRole('button', { name: 'Got it' }).click();
  await page.goto('/help');
  await expect(page.getByRole('heading', { level: 1, name: 'Help & guides' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Welcome guide' })).toBeVisible();
  // The video and PDF sections show only when their files are in web/public, so every link and source must load.
  const urls = await page.locator('main a[href^="/"], main video[src], main track[src]').evaluateAll((els) => els.map((e) => e.getAttribute('href') ?? e.getAttribute('src') ?? ''));
  for (const u of urls) expect((await request.get(u)).status(), u).toBeLessThan(400);
});

test('the welcome guide never covers the privacy and terms pages', async ({ page }) => {
  for (const p of ['/privacy', '/terms']) {
    await page.goto(p);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByRole('dialog', { name: 'Welcome to Trade Helper' })).toHaveCount(0);
  }
});

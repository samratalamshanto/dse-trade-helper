import { test, expect, isPhone } from './fixtures';

// Bangla mode on the main pages: the legal footer and key texts are Bangla, and phones get no page-wide sideways scroll.
const FOOTER_BN = 'সংকেত স্বয়ংক্রিয় নিয়মের ফলাফল, পরামর্শ নয়।';
const FOOTER_EN = 'Signals are automatic rule results, not advice.';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('lang', 'bn'));
});

async function expectBanglaPage(page: import('@playwright/test').Page, projectName: string) {
  const footer = page.locator('footer');
  await expect(footer).toContainText(FOOTER_BN);
  await expect(footer).not.toContainText(FOOTER_EN);
  await expect(footer.getByRole('link', { name: 'গোপনীয়তা' })).toBeVisible();
  await expect(footer.getByRole('link', { name: 'শর্তাবলি' })).toBeVisible();
  if (isPhone(projectName)) {
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  }
}

test('dashboard in Bangla: trust card and footer', async ({ page }, info) => {
  await page.goto('/');
  await expect(page.getByText('এই সংখ্যাগুলো কি বিশ্বাসযোগ্য?')).toBeVisible();
  await expect(page.getByText('Can I trust these numbers?')).toHaveCount(0);
  await expectBanglaPage(page, info.project.name);
});

test('company page in Bangla: answer cards, key facts, Plan a buy', async ({ page }, info) => {
  await page.goto('/c/GP');
  const cards = page.locator('.questions');
  await expect(cards).toContainText('মান-পরীক্ষার মধ্যে');
  await expect(cards).not.toContainText('quality checks');
  await expect(page.getByText('P/E (সংকেত এটি ব্যবহার করে)')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'কেনার পরিকল্পনা' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'এই সংকেত কেন' })).toBeVisible();
  await expectBanglaPage(page, info.project.name);
});

test('alerts page in Bangla: intro and empty rules list', async ({ page }, info) => {
  await page.goto('/alerts');
  await expect(page.getByText('এখনো কোনো নিয়ম নেই। নিচে একটি যোগ করুন।')).toBeVisible();
  await expect(page.getByText('সব সেটিং শুধু এই ব্রাউজারে রাখা হয়।')).toBeVisible();
  await expect(page.getByRole('button', { name: 'নিয়ম যোগ করুন' })).toBeVisible();
  await expectBanglaPage(page, info.project.name);
});

test('portfolio page in Bangla: trades and settings panels', async ({ page }, info) => {
  await page.goto('/portfolio');
  await expect(page.getByRole('heading', { name: 'সব লেনদেন' })).toBeVisible();
  await page.locator('summary', { hasText: 'সেটিংস' }).click();
  await expect(page.getByRole('heading', { name: 'আমার সীমা' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'আমার তথ্য রপ্তানি করুন' })).toBeVisible();
  await expect(page.getByText('আমার Google Sheet-এর সাথে সিঙ্ক')).toBeVisible();
  await expectBanglaPage(page, info.project.name);
});

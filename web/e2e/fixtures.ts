import { test as base, expect } from '@playwright/test';

// Every test fails on any console error or uncaught page error. Nothing is allow-listed.
export const test = base.extend<{ guard: void; allowedConsole: RegExp[]; guideSeen: boolean }>({
  allowedConsole: [[], { option: true }],
  // The first-visit guide covers the page; tests start as returning visitors unless they test the guide itself.
  guideSeen: [true, { option: true }],
  guard: [async ({ page, allowedConsole, guideSeen }, use) => {
    if (guideSeen) await page.addInitScript(() => localStorage.setItem('guideShown', '1'));
    const problems: string[] = [];
    page.on('console', (m) => { if (m.type() === 'error' && !allowedConsole.some((r) => r.test(m.text()))) problems.push(`console.error: ${m.text()} @ ${m.location().url}`); });
    page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
    // PrefsSync reads the watchlist and rules from the Sheet whenever a key is saved; tests get an empty answer unless they override it.
    await page.route('**/api/prefs', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
    // The dev server hands the real trades key to localhost (lib/dev-key.ts); tests get none unless a test overrides this route.
    await page.route('http://127.0.0.1:3011/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: '{"key":""}' }));
    await use();
    expect(problems, 'browser console errors / page errors').toEqual([]);
  }, { auto: true }],
});
export { expect };

export const isPhone = (name: string) => name === 'phone';

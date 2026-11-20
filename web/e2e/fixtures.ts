import { test as base, expect } from '@playwright/test';

// Every test fails on any console error or uncaught page error. Nothing is allow-listed.
export const test = base.extend<{ guard: void; allowedConsole: RegExp[] }>({
  allowedConsole: [[], { option: true }],
  guard: [async ({ page, allowedConsole }, use) => {
    const problems: string[] = [];
    page.on('console', (m) => { if (m.type() === 'error' && !allowedConsole.some((r) => r.test(m.text()))) problems.push(`console.error: ${m.text()} @ ${m.location().url}`); });
    page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
    // The dev server hands the real trades key to localhost (lib/dev-key.ts); tests get none unless a test overrides this route.
    await page.route('http://127.0.0.1:3011/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: '{"key":""}' }));
    await use();
    expect(problems, 'browser console errors / page errors').toEqual([]);
  }, { auto: true }],
});
export { expect };

export const isPhone = (name: string) => name === 'phone';

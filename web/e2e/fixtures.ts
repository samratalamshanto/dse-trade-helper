import { test as base, expect } from '@playwright/test';

// Every test fails on any console error or uncaught page error. Nothing is allow-listed.
export const test = base.extend<{ guard: void; allowedConsole: RegExp[] }>({
  allowedConsole: [[], { option: true }],
  guard: [async ({ page, allowedConsole }, use) => {
    const problems: string[] = [];
    page.on('console', (m) => { if (m.type() === 'error' && !allowedConsole.some((r) => r.test(m.text()))) problems.push(`console.error: ${m.text()} @ ${m.location().url}`); });
    page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
    await use();
    expect(problems, 'browser console errors / page errors').toEqual([]);
  }, { auto: true }],
});
export { expect };

export const isPhone = (name: string) => name === 'phone';

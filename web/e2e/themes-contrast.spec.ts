import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { test, expect } from './fixtures';

const ROUTES = ['/', '/all', '/c/GP', '/dividends', '/sectors', '/compare?codes=BRACBANK,CITYBANK,EBL', '/watchlist', '/portfolio', '/trades', '/plans', '/alerts', '/warning-signs', '/learn', '/plan'];
const THEMES = ['dark', 'light'] as const;
const slug = (r: string) => (r === '/' ? 'home' : r.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, ''));

async function openThemed(page: Page, route: string, theme: (typeof THEMES)[number]) {
  await page.emulateMedia({ colorScheme: theme });
  await page.addInitScript((t) => localStorage.setItem('theme', t), theme);
  await page.goto(route);
  await expect(page.locator('main')).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
  await expect(page.locator('main h1, main h2').first()).toBeVisible();
  // Live pages may keep polling; the checks above already prove the content is ready.
  await page.waitForLoadState('networkidle').catch((e: unknown) => console.warn('networkidle not reached, continuing', e));
}

// Visible buttons without a name or without a visible boundary. Runs in the page.
function findButtonOffenders() {
  const rgba = (c: string) => { const m = c.match(/[\d.]+/g)?.map(Number) ?? [0, 0, 0, 0]; return { r: m[0], g: m[1], b: m[2], a: m[3] ?? 1 }; };
  const eq = (a: string, b: string) => { const x = rgba(a), y = rgba(b); return Math.abs(x.r - y.r) + Math.abs(x.g - y.g) + Math.abs(x.b - y.b) < 6 && Math.abs(x.a - y.a) < 0.05; };
  const bgOf = (el: Element | null): string => { for (let e = el; e; e = e.parentElement) { const c = getComputedStyle(e).backgroundColor; if (rgba(c).a > 0.05) return c; } return 'rgb(255,255,255)'; };
  const sel = (e: Element) => e.tagName.toLowerCase() + (e.id ? '#' + e.id : '') + (typeof e.className === 'string' && e.className.trim() ? '.' + e.className.trim().split(/\s+/).join('.') : '');
  const out: string[] = [];
  // Sort headers (arrow) and tabs (selected underline) are flat by design: owner decision 2026-11-24.
  document.querySelectorAll('button:not(.sort-btn):not(.tabs .tab-link), [role=button], a.btn').forEach((el) => {
    const r = el.getBoundingClientRect(); const cs = getComputedStyle(el);
    if (r.width === 0 || r.height === 0 || cs.visibility === 'hidden' || cs.display === 'none') return;
    const text = (el.textContent ?? '').trim(); const label = el.getAttribute('aria-label') ?? el.getAttribute('aria-labelledby') ?? '';
    if (!text && !label.trim()) out.push(`${sel(el)}: no text or aria-label`);
    const own = cs.backgroundColor; const parent = bgOf(el.parentElement);
    const bw = parseFloat(cs.borderTopWidth) > 0 || parseFloat(cs.borderBottomWidth) > 0 || parseFloat(cs.borderLeftWidth) > 0 || parseFloat(cs.borderRightWidth) > 0;
    const borderVisible = bw && cs.borderTopStyle !== 'none' && rgba(cs.borderTopColor).a > 0.05 && !eq(cs.borderTopColor, parent);
    const fillVisible = rgba(own).a > 0.05 && !eq(own, parent);
    // An underline is the standard affordance for a link-style action inside text (WCAG 1.4.1).
    const underlined = cs.textDecorationLine.includes('underline');
    if (!fillVisible && !borderVisible && !underlined) out.push(`${sel(el)} "${text.slice(0, 30)}": no visible boundary (bg ${own}, parent ${parent}, border ${cs.borderTopWidth} ${cs.borderTopColor})`);
  });
  return out;
}

for (const route of ROUTES) {
  for (const theme of THEMES) {
    test(`${route} [${theme}]`, async ({ page }, info) => {
      await openThemed(page, route, theme);

      const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).withRules(['color-contrast']).analyze();
      const lines = axe.violations.flatMap((v) => v.nodes.map((n) => {
        const d = (n.any[0]?.data ?? {}) as Record<string, unknown>;
        return `${v.id} [${v.impact}] ${n.target.join(' ')} contrast=${d.contrastRatio} (need ${d.expectedContrastRatio}) fg=${d.fgColor} bg=${d.bgColor}`;
      }));

      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      const offenders = await page.evaluate(findButtonOffenders);

      const shot = await page.screenshot({ fullPage: true, path: info.outputPath(`${slug(route)}-${theme}.png`) });
      await info.attach(`${slug(route)}-${theme}`, { body: shot, contentType: 'image/png' });
      await info.attach('summary', { body: `size=${info.project.name} axe=${lines.length} offenders=${offenders.length} overflow=${overflow}\n${lines.join('\n')}\n${offenders.join('\n')}`, contentType: 'text/plain' });

      expect.soft(lines, 'axe violations').toEqual([]);
      expect.soft(overflow, 'horizontal overflow px').toBeLessThanOrEqual(0);
      expect.soft(offenders, 'button affordance offenders').toEqual([]);
    });
  }
}

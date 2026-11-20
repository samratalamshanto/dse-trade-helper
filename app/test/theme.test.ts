import assert from 'node:assert/strict';
import { test } from 'node:test';
import { contrast, dark, isThemePreference, light, mix, type Palette, resolveScheme, SERIES } from '../src/theme.ts';

const TEXT = ['text', 'muted', 'up', 'down', 'warn', 'link'] as const;
const SURFACES = ['bg', 'card', 'cardHi'] as const;
// Pills and selected chips draw their own colour at '22' / '33' alpha behind the text; they sit on bg or card, never cardHi.
const TINTS = [0x22 / 255, 0x33 / 255];

for (const [name, p] of [['dark', dark], ['light', light]] as [string, Palette][]) {
  test(`${name}: every text colour is at least 4.5:1 on every surface and on its own tint`, () => {
    for (const fg of TEXT) {
      for (const bg of SURFACES) {
        const r = contrast(p[fg], p[bg]);
        assert.ok(r >= 4.5, `${fg} on ${bg} is ${r.toFixed(2)}`);
        for (const a of bg === 'cardHi' ? [] : TINTS) {
          const t = contrast(p[fg], mix(p[fg], p[bg], a));
          assert.ok(t >= 4.5, `${fg} on its ${a.toFixed(2)} tint over ${bg} is ${t.toFixed(2)}`);
        }
      }
    }
  });

  test(`${name}: filled button text is at least 4.5:1 on the link fill`, () => {
    const r = contrast(p.onLink, p.link);
    assert.ok(r >= 4.5, `onLink on link is ${r.toFixed(2)}`);
  });

  test(`${name}: control outlines are at least 3:1 on every surface`, () => {
    for (const bg of SURFACES) {
      const r = contrast(p.outline, p[bg]);
      assert.ok(r >= 3, `outline on ${bg} is ${r.toFixed(2)}`);
    }
  });
}

test('contrast matches the WCAG reference values', () => {
  assert.equal(contrast('#000000', '#ffffff').toFixed(2), '21.00');
  assert.equal(contrast('#777777', '#ffffff').toFixed(2), '4.48');
  assert.equal(mix('#ffffff', '#000000', 0.5), '#808080');
});

test('theme preference resolves against the system scheme and rejects bad stored values', () => {
  assert.equal(resolveScheme('system', 'light'), 'light');
  assert.equal(resolveScheme('system', 'dark'), 'dark');
  assert.equal(resolveScheme('system', null), 'dark');
  assert.equal(resolveScheme('light', 'dark'), 'light');
  assert.equal(resolveScheme('dark', 'light'), 'dark');
  assert.ok(isThemePreference('system'));
  assert.ok(!isThemePreference('blue'));
  assert.ok(!isThemePreference(null));
});

test('every chart series colour stands out from the card in both themes (3:1 for graphics)', () => {
  for (const [scheme, colours] of Object.entries(SERIES)) {
    const card = scheme === 'dark' ? dark.card : light.card;
    for (const c of colours) assert.ok(contrast(c, card) >= 3, `${scheme} ${c} is ${contrast(c, card).toFixed(2)}:1 on the card`);
  }
});

test('the % printed on a pie slice is readable on every slice colour (4.5:1)', () => {
  for (const [scheme, colours] of Object.entries(SERIES)) {
    const ink = scheme === 'dark' ? dark.onLink : light.onLink;
    for (const c of colours) assert.ok(contrast(ink, c) >= 4.5, `${scheme} label on ${c} is ${contrast(ink, c).toFixed(2)}:1`);
  }
});

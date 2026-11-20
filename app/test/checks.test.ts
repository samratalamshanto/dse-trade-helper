import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ACTION_TEXT } from '../../web/lib/positions.ts';
import { changedCodes, checkColor, CHECK_TONE, limitsFromForm, LIMITS_ERROR, parseStoredChecks } from '../src/checks.ts';
import { dark as colors, light } from '../src/theme.ts';

test('every check tone has a colour and unknown tones fall back to muted', () => {
  for (const { tone } of Object.values(ACTION_TEXT)) assert.ok(CHECK_TONE[tone]);
  assert.equal(checkColor('bad', colors), colors.down);
  assert.equal(checkColor('info', colors), colors.link);
  assert.equal(checkColor('nonsense', colors), colors.muted);
  assert.equal(checkColor('bad', light), light.down);
});

test('stored checks parse safely and reject broken or wrong-shaped data', () => {
  assert.deepEqual(parseStoredChecks('{"date":"2026-11-19","labels":{"GP":"Hold"}}'), { date: '2026-11-19', labels: { GP: 'Hold' } });
  assert.equal(parseStoredChecks(null), null);
  assert.equal(parseStoredChecks('{not json'), null);
  assert.equal(parseStoredChecks('{"date":1,"labels":{}}'), null);
  assert.equal(parseStoredChecks('{"date":"2026-11-19"}'), null);
});

test('changedCodes flags only holdings whose saved label differs', () => {
  const stored = { date: '2026-11-19', labels: { GP: 'Hold', BATBC: 'Could buy more' } };
  assert.deepEqual(changedCodes(stored, { GP: 'Review — consider selling', BATBC: 'Could buy more', NEW: 'Hold' }), ['GP']);
  assert.deepEqual(changedCodes(null, { GP: 'Hold' }), []);
});

test('limitsFromForm accepts 1-95 and returns the server message otherwise', () => {
  const ok = limitsFromForm({ stopPct: '10', targetPct: '20' }, [{ code: 'gp', stopPct: '5', targetPct: '30.5' }]);
  assert.deepEqual(ok, { ok: true, value: { default: { stopPct: 10, targetPct: 20 }, perCode: { GP: { stopPct: 5, targetPct: 30.5 } } } });
  const bad = { ok: false, error: LIMITS_ERROR };
  assert.equal(LIMITS_ERROR, 'Stop-loss and target must be percentages between 1 and 95.');
  assert.deepEqual(limitsFromForm({ stopPct: '96', targetPct: '20' }, []), bad);
  assert.deepEqual(limitsFromForm({ stopPct: '', targetPct: '20' }, []), bad);
  assert.deepEqual(limitsFromForm({ stopPct: '10', targetPct: '20' }, [{ code: 'GP', stopPct: 'abc', targetPct: '20' }]), bad);
});

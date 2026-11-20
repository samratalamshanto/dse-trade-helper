import assert from 'node:assert/strict';
import { test } from 'node:test';
import { answerColor, changeColor, daysLeftText, fmtDate, fmtNum, fmtPct, fmtTakaSigned, matchesQuery } from '../src/format.ts';
import { dark as colors, light } from '../src/theme.ts';

test('missing or broken numbers show a dash, never NaN or null', () => {
  for (const x of [null, undefined, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.equal(fmtNum(x), '—');
    assert.equal(fmtPct(x), '—');
  }
});

test('numbers get grouping and a fixed number of decimals', () => {
  assert.equal(fmtNum(5505.63875), '5,505.64');
  assert.equal(fmtNum(226.7), '226.70');
});

test('percent shows a plus sign only for gains', () => {
  assert.equal(fmtPct(0.08731), '+0.09%');
  assert.equal(fmtPct(-0.04409), '-0.04%');
  assert.equal(fmtPct(0), '0.00%');
});

test('change color is green up, red down, muted flat or missing', () => {
  assert.equal(changeColor(1, colors), colors.up);
  assert.equal(changeColor(-1, colors), colors.down);
  assert.equal(changeColor(0, colors), colors.muted);
  assert.equal(changeColor(null, colors), colors.muted);
  assert.equal(changeColor(1, light), light.up);
});

test('dates show as day and short month; bad input shows a dash', () => {
  assert.equal(fmtDate('2026-11-22'), '22 Nov');
  assert.equal(fmtDate('2026-01-05T10:00:00Z'), '5 Jan');
  for (const x of [null, undefined, '', 'soon', '2026-13-01']) assert.equal(fmtDate(x), '—');
});

test('days left counts trading days and names the last day', () => {
  assert.equal(daysLeftText(1, true), 'Last day to buy is today');
  assert.equal(daysLeftText(1, false), '1 trading day left');
  assert.equal(daysLeftText(4, false), '4 trading days left');
});

test('a dividend "no" is neutral, other "no" answers are red', () => {
  assert.equal(answerColor({ tab: 'dividends', answer: 'no' }, colors), colors.muted);
  assert.equal(answerColor({ tab: 'valuation', answer: 'no' }, colors), colors.down);
  assert.equal(answerColor({ tab: 'safety', answer: 'yes' }, colors), colors.up);
});

test('search matches code or name, ignoring case and spaces', () => {
  const gp = { code: 'GP', name: 'Grameenphone Ltd.' };
  assert.ok(matchesQuery(gp, ' gp '));
  assert.ok(matchesQuery(gp, 'grameen'));
  assert.ok(matchesQuery(gp, ''));
  assert.ok(!matchesQuery(gp, 'BATBC'));
});

test('signed money puts the sign before the taka symbol', () => {
  assert.equal(fmtTakaSigned(0.6), '+৳0.60');
  assert.equal(fmtTakaSigned(-0.2), '-৳0.20');
  assert.equal(fmtTakaSigned(0), '৳0.00');
  assert.equal(fmtTakaSigned(null), '—');
});

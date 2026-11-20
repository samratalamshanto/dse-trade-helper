import assert from 'node:assert/strict';
import { test } from 'node:test';
import { pieSlices, seriesChange, sliceSeries } from '../src/chart.ts';

const days = (from: string, n: number) => Array.from({ length: n }, (_, i) => ({ date: new Date(Date.parse(from + 'T00:00:00Z') + i * 86_400_000).toISOString().slice(0, 10), price: 100 + i }));

test('sliceSeries keeps the points inside the range, counted back from the last date', () => {
  const s = days('2025-11-01', 400);
  const week = sliceSeries(s, '1W');
  assert.equal(week.length, 8);
  assert.equal(week[week.length - 1], s[s.length - 1]);
  assert.equal(sliceSeries(s, '1Y').length, 366);
});

test('sliceSeries of an empty series is empty, and a short series is kept whole', () => {
  assert.deepEqual(sliceSeries([], '1M'), []);
  assert.equal(sliceSeries(days('2026-11-10', 5), '1Y').length, 5);
});

test('seriesChange gives the taka and percent change from first to last point', () => {
  const c = seriesChange([{ price: 217.39 }, { price: 219.39 }]);
  assert.equal(c?.abs.toFixed(2), '2.00');
  assert.equal(c?.pct?.toFixed(2), '0.92');
  assert.equal(seriesChange([{ price: 1 }]), null);
  assert.equal(seriesChange([{ price: 0 }, { price: 5 }])?.pct, null);
});

test('pie slices go clockwise from 12 o\u2019clock, skip empty parts, and a lone part is the full circle', () => {
  const s = pieSlices([50, 0, 25, null, 25], 50, 50, 40);
  assert.deepEqual(s.map((x) => [x.index, Math.round(x.pct)]), [[0, 50], [2, 25], [4, 25]]);
  assert.match(s[0].path, /^M 50 50 L 50\.00 10\.00 A 40 40 0 0 1 50\.00 90\.00 Z$/);
  assert.ok(s[1].labelX < 50 && s[1].labelY > 50, 'second slice (6 to 9 o\u2019clock) is bottom-left');
  assert.deepEqual(pieSlices([0, null, -3], 50, 50, 40), []);
  assert.match(pieSlices([100], 50, 50, 40)[0].path, /A 40 40 0 1 1 50 90 A 40 40 0 1 1 50 10 Z/);
});

import test from 'node:test';
import assert from 'node:assert';
import { parseWatchlist, toggleCode, WATCHLIST_MAX } from '../lib/watchlist.ts';

test('reads a saved list, upper-cases codes and drops duplicates', () => {
  assert.deepStrictEqual(parseWatchlist('["squrpharma","GP","GP","KAY&QUE"]'), ['SQURPHARMA', 'GP', 'KAY&QUE']);
});

test('damaged or wrong saved data gives an empty list instead of an error', () => {
  for (const raw of ['not json', '{"a":1}', '42', null, '', '[1,{},null]']) assert.deepStrictEqual(parseWatchlist(raw), [], String(raw));
});

test('bad codes are dropped and the list is capped', () => {
  assert.deepStrictEqual(parseWatchlist('["GP","<script>","a/b",""]'), ['GP']);
  const many = JSON.stringify(Array.from({ length: WATCHLIST_MAX + 10 }, (_, i) => 'C' + i));
  assert.strictEqual(parseWatchlist(many).length, WATCHLIST_MAX);
});

test('toggle adds a missing code and removes a saved one', () => {
  assert.deepStrictEqual(toggleCode(['GP'], 'squrpharma'), ['GP', 'SQURPHARMA']);
  assert.deepStrictEqual(toggleCode(['GP', 'SQURPHARMA'], 'GP'), ['SQURPHARMA']);
  assert.deepStrictEqual(toggleCode(['GP'], 'bad code!'), ['GP']);
});

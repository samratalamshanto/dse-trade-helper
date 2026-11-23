import test from 'node:test';
import assert from 'node:assert';
import { searchCompanies } from '../lib/company-search.ts';

const COMPANIES = [
  { code: 'GP', name: 'Grameenphone Ltd.' },
  { code: 'SQURPHARMA', name: 'Square Pharmaceuticals PLC' },
  { code: 'BRACBANK', name: 'BRAC Bank PLC' },
  { code: 'ROBI', name: 'Robi Axiata Limited' },
  { code: 'BATBC', name: 'British American Tobacco Bangladesh Company Limited' },
];

test('empty query returns empty array', () => {
  assert.deepStrictEqual(searchCompanies('', COMPANIES), []);
  assert.deepStrictEqual(searchCompanies('   ', COMPANIES), []);
});

test('code match (case-insensitive) returns company', () => {
  const hits = searchCompanies('gp', COMPANIES);
  assert.strictEqual(hits.length, 1);
  assert.strictEqual(hits[0].code, 'GP');
});

test('name match (partial, case-insensitive) returns company', () => {
  const hits = searchCompanies('square', COMPANIES);
  assert.strictEqual(hits.length, 1);
  assert.strictEqual(hits[0].code, 'SQURPHARMA');
});

test('no match returns empty array', () => {
  assert.deepStrictEqual(searchCompanies('zzz', COMPANIES), []);
});

test('results are capped at the limit', () => {
  const many = Array.from({ length: 20 }, (_, i) => ({ code: `C${i}`, name: `Company ${i}` }));
  const hits = searchCompanies('company', many, 5);
  assert.strictEqual(hits.length, 5);
});

test('code prefix match', () => {
  const hits = searchCompanies('brac', COMPANIES);
  assert.ok(hits.some((h) => h.code === 'BRACBANK'));
});

test('name word match', () => {
  const hits = searchCompanies('axiata', COMPANIES);
  assert.strictEqual(hits.length, 1);
  assert.strictEqual(hits[0].code, 'ROBI');
});

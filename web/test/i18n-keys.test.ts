import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { BN } from '../components/i18n-bn.ts';
import { bnDate, bnDigits, translateLine } from '../components/i18n-match.ts';

// Files whose visible text goes through t() or <Tr>; each literal there must have a Bangla entry.
const FILES = [
  'app/layout.tsx', 'app/page.tsx', 'app/alerts/page.tsx', 'app/portfolio/page.tsx', 'app/scorecard/page.tsx', 'app/dividends/page.tsx', 'app/watchlist/page.tsx',
  'components/company/CompanyView.tsx', 'components/company/Overview.tsx', 'components/company/Valuation.tsx', 'components/company/SafetyOwners.tsx',
  'components/planner/BuyPlanner.tsx', 'components/planner/DashboardCards.tsx',
  'components/portfolio/LimitsPanel.tsx', 'components/portfolio/MyData.tsx', 'components/portfolio/SyncPanel.tsx', 'components/portfolio/Summary.tsx',
  'components/HoldingsToday.tsx', 'components/CompanyCard.tsx', 'components/LastBuy.tsx', 'components/Topbar.tsx',
];

// "${x}" parts and "{name}" parts count as one placeholder, and so do several in a row.
const shape = (s: string): string => s.replace(/\$\{[^}]*\}/g, '{}').replace(/\{\w+\}/g, '{}').replace(/(\{\})+/g, '{}');
const keys = new Set(Object.keys(BN).map(shape));

function literals(src: string): string[] {
  const out: string[] = [];
  const str = String.raw`'((?:\\.|[^'\\])*)'|"((?:\\.|[^"\\])*)"|` + '`((?:\\\\.|[^`\\\\])*)`';
  for (const m of src.matchAll(new RegExp(String.raw`(?<![\w.])tr?\(\s*(?:${str})\s*[),]`, 'g'))) out.push(m[1] ?? m[2] ?? m[3]);
  for (const m of src.matchAll(new RegExp(String.raw`(?<![\w.])tr?\(\s*[\w.!=<>&|\s()?]+\?\s*(?:${str})\s*:\s*(?:${str})\s*\)`, 'g'))) out.push(m[1] ?? m[2] ?? m[3], m[4] ?? m[5] ?? m[6]);
  for (const m of src.matchAll(/<Tr text=(?:"([^"]*)"|\{'((?:\\.|[^'\\])*)'\}|\{"([^"]*)"\})/g)) out.push(m[1] ?? m[2] ?? m[3]);
  return out.map((s) => s.replace(/\\'/g, "'"));
}

test('every literal passed to t() or <Tr> in the Bangla-complete files has a BN entry', () => {
  const missing: string[] = [];
  for (const f of FILES) {
    for (const s of literals(readFileSync(new URL('../' + f, import.meta.url), 'utf8'))) if (!keys.has(shape(s))) missing.push(`${f}: ${s}`);
  }
  assert.deepEqual(missing, []);
});

test('the scan finds plain, ternary, template and <Tr> literals', () => {
  assert.deepEqual(literals(`t('A b') t(x ? 'C' : 'D') t(\`E \${n} f\`) <Tr text="G" /> <Tr text={'H\\'s'} />`), ['A b', 'E ${n} f', 'C', 'D', 'G', "H's"]);
});

test('built lines translate with Bangla digits and dates, and unknown English stays as it is', () => {
  assert.equal(translateLine('Passes 6 of 8 quality checks. Earnings shrink 3.5% a year over 4 years (since 2021).'),
    '৮টি মান-পরীক্ষার মধ্যে ৬টিতে উত্তীর্ণ। আয় কমছে ২০২১ থেকে ৪ বছরে বছরে ৩.৫% হারে।');
  assert.equal(translateLine('Last: 105% cash (interim), record date 12 Aug 2026. Past timing suggests around February 2027; not a forecast.'),
    `শেষ: ১০৫% নগদ (অন্তর্বর্তী), রেকর্ড তারিখ ${bnDate('12 Aug 2026')}। আগের সময় দেখে মনে হয় ${bnDate('February 2027')} নাগাদ; এটি পূর্বাভাস নয়।`);
  assert.match(bnDate('12 Aug 2026')!, /^[০-৯]+ \S+ [০-৯]{4}$/);
  assert.equal(translateLine('৳3.63/share'), '৳৩.৬৩/শেয়ার');
  assert.equal(translateLine('GP: any new warning sign'), 'GP: যেকোনো নতুন সতর্ক সংকেত');
  assert.equal(translateLine('Some brand new sentence.'), 'Some brand new sentence.');
  assert.equal(bnDigits('2:42'), '২:৪২');
});

test('no BN key is only placeholders, so template matching always ends', () => {
  assert.deepEqual(Object.keys(BN).filter((k) => /\{\w+\}/.test(k) && !k.replace(/\{\w+\}/g, '')), []);
});

test('the glossary sentence the app tests read stays in English and has its Bangla', () => {
  assert.ok(Object.hasOwn(BN, 'Passes all 8 rule checks and has no warning sign.'));
});

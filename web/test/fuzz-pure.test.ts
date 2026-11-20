import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as fc from 'fast-check';
import { strToU8, zipSync } from 'fflate';

import {
  validateTrade, parseAmount, dateFromFileName, parseOrderSummary,
  fromRows, toRow, holdingsFrom, splitNew,
  type Trade, type TradeInput,
} from '../lib/trades.ts';
import { readFirstSheet, XlsxError } from '../lib/xlsx.ts';
import { parseCsv, parseLots } from '../lib/portfolio.ts';
import { codeParam } from '../lib/http.ts';
import { tradingDaysBetween, CODE_RE } from '../lib/dhaka.ts';
import { parseWatchlist } from '../lib/watchlist.ts';

const RUNS = 2000;

// A note already in cleanNote form so round-trips are exact.
const cleanedNoteFc = fc.string().map((s) =>
  s.replace(/[\r\n\t]+/g, ' ').trim().replace(/^[=+\-@]+/, '').slice(0, 200),
);

// A valid Trade for round-trip and holdingsFrom tests.
const tradeFc: fc.Arbitrary<Trade> = fc.record({
  id: fc.string({ minLength: 1 }).filter((s) => s.trim() !== ''),
  date: fc.integer({ min: 0, max: 3650 }).map((n) =>
    new Date(Date.UTC(2016, 0, 1) + n * 86400000).toISOString().slice(0, 10),
  ),
  code: fc.stringMatching(/^[A-Z0-9][A-Z0-9&()-]{0,10}$/) as fc.Arbitrary<string>,
  side: fc.constantFrom('BUY', 'SELL') as fc.Arbitrary<'BUY' | 'SELL'>,
  quantity: fc.integer({ min: 1, max: 10_000_000 }),
  price: fc.integer({ min: 1, max: 999_999 }),
  commission: fc.option(fc.integer({ min: 0, max: 10_000 }), { nil: null }),
  note: cleanedNoteFc,
  source: fc.string(),
  createdAt: fc.string(),
});

// ── validateTrade ────────────────────────────────────────────────────────────

test('fuzz: validateTrade never throws on arbitrary input', () => {
  fc.assert(
    fc.property(fc.anything(), fc.string(), (input, today) => {
      assert.doesNotThrow(() => validateTrade(input, today));
    }),
    { numRuns: RUNS },
  );
});

test('fuzz: validateTrade ok result satisfies all field invariants', () => {
  fc.assert(
    fc.property(fc.anything(), fc.string(), (input, today) => {
      const result = validateTrade(input, today);
      if (!result.ok) return;
      const v = result.value;
      assert.ok(Number.isSafeInteger(v.quantity) && v.quantity >= 1 && v.quantity <= 10_000_000);
      assert.ok(v.price > 0 && Number.isFinite(v.price));
      assert.ok(CODE_RE.test(v.code), `code "${v.code}" does not match CODE_RE`);
      assert.ok(v.note.length <= 200);
      assert.ok(!/^[=+\-@]/.test(v.note), `note starts with formula char: "${v.note[0]}"`);
      assert.match(v.date, /^\d{4}-\d{2}-\d{2}$/);
      // Date must be a real calendar date.
      assert.equal(
        new Date(v.date + 'T00:00:00Z').toISOString().slice(0, 10),
        v.date,
        `non-real date: ${v.date}`,
      );
      // Date must not exceed the today string used for validation.
      assert.ok(v.date <= today, `date ${v.date} is after today ${today}`);
    }),
    { numRuns: RUNS },
  );
});

// ── parseAmount ──────────────────────────────────────────────────────────────

test('fuzz: parseAmount never throws and returns null or finite >= 0', () => {
  fc.assert(
    fc.property(fc.anything(), (raw) => {
      const result = parseAmount(raw);
      if (result !== null && result !== undefined) {
        assert.ok(typeof result === 'number' && Number.isFinite(result) && result >= 0);
      }
    }),
    { numRuns: RUNS },
  );
});

test('fuzz: parseAmount rejects scientific notation, hex, and alphanumeric suffixes', () => {
  for (const bad of ['1e3', '1E3', '0x10', '0X10', '100abc', '1.5e2', '0x1f', '1e+10', '1e-5']) {
    assert.equal(parseAmount(bad), null, `expected null for "${bad}"`);
  }
});

// ── dateFromFileName ─────────────────────────────────────────────────────────

test('fuzz: dateFromFileName never throws and returns null or valid YYYY-MM-DD', () => {
  fc.assert(
    fc.property(fc.string(), (name) => {
      const result = dateFromFileName(name);
      if (result == null) return;
      assert.match(result, /^\d{4}-\d{2}-\d{2}$/);
      assert.equal(
        new Date(result + 'T00:00:00Z').toISOString().slice(0, 10),
        result,
        `non-real date returned: ${result}`,
      );
    }),
    { numRuns: RUNS },
  );
});

// ── parseOrderSummary ────────────────────────────────────────────────────────

test('fuzz: parseOrderSummary on arbitrary string[][] never throws', () => {
  fc.assert(
    fc.property(
      fc.array(fc.array(fc.string(), { maxLength: 30 }), { maxLength: 50 }),
      fc.string(),
      (rows, date) => {
        assert.doesNotThrow(() => parseOrderSummary(rows, date));
      },
    ),
    { numRuns: RUNS },
  );
});

test('fuzz: parseOrderSummary trades all pass validateTrade', () => {
  fc.assert(
    fc.property(
      fc.array(fc.array(fc.string(), { maxLength: 30 }), { maxLength: 50 }),
      fc.string(),
      (rows, date) => {
        const { trades } = parseOrderSummary(rows, date);
        for (const t of trades) {
          const v = validateTrade(t, '9999-12-31');
          assert.ok(v.ok, `trade from parseOrderSummary fails validateTrade: ${JSON.stringify(v)}`);
        }
      },
    ),
    { numRuns: RUNS },
  );
});

// ── fromRows / toRow round-trip ──────────────────────────────────────────────

test('fuzz: fromRows(toRow(t)) reconstructs the trade exactly', () => {
  fc.assert(
    fc.property(tradeFc, (t) => {
      const { trades, badRows } = fromRows([toRow(t)]);
      assert.equal(badRows.length, 0, `round-trip produced badRows for id="${t.id}"`);
      assert.equal(trades.length, 1, 'round-trip lost the trade');
      const rt = trades[0];
      assert.equal(rt.date, t.date);
      assert.equal(rt.code, t.code);
      assert.equal(rt.side, t.side);
      assert.equal(rt.quantity, t.quantity);
      assert.equal(rt.price, t.price);
      assert.equal(rt.commission, t.commission);
      assert.equal(rt.id, t.id);
    }),
    { numRuns: RUNS },
  );
});

// ── holdingsFrom invariants ──────────────────────────────────────────────────

test('fuzz: holdingsFrom — shares >= 0, no NaN, avgCost >= 0, shares <= totalBuys', () => {
  fc.assert(
    fc.property(fc.array(tradeFc, { maxLength: 20 }), (trades) => {
      const { holdings } = holdingsFrom(trades);
      for (const h of holdings) {
        assert.ok(h.shares >= 0, `shares < 0 for ${h.code}: ${h.shares}`);
        assert.ok(!Number.isNaN(h.shares), `NaN shares for ${h.code}`);
        assert.ok(!Number.isNaN(h.avgCost), `NaN avgCost for ${h.code}`);
        assert.ok(!Number.isNaN(h.invested), `NaN invested for ${h.code}`);
        assert.ok(!Number.isNaN(h.realised), `NaN realised for ${h.code}`);
        assert.ok(h.avgCost >= 0, `avgCost < 0 for ${h.code}: ${h.avgCost}`);
        const totalBuys = trades
          .filter((t) => t.code === h.code && t.side === 'BUY')
          .reduce((s, t) => s + t.quantity, 0);
        assert.ok(h.shares <= totalBuys, `shares ${h.shares} > totalBuys ${totalBuys} for ${h.code}`);
      }
    }),
    { numRuns: RUNS },
  );
});

// ── splitNew ─────────────────────────────────────────────────────────────────

test('fuzz: splitNew — added + skipped = incoming, skipped <= existing.length', () => {
  fc.assert(
    fc.property(
      fc.array(tradeFc, { maxLength: 20 }),
      fc.array(tradeFc, { maxLength: 20 }),
      (incoming: TradeInput[], existing: TradeInput[]) => {
        const { added, skipped } = splitNew(incoming, existing);
        assert.equal(
          added.length + skipped.length,
          incoming.length,
          `${added.length} + ${skipped.length} ≠ ${incoming.length}`,
        );
        assert.ok(
          skipped.length <= existing.length,
          `skipped ${skipped.length} > existing ${existing.length}`,
        );
      },
    ),
    { numRuns: RUNS },
  );
});

// ── readFirstSheet — random bytes ────────────────────────────────────────────

test('fuzz: readFirstSheet on random bytes returns string[][] or throws XlsxError only', () => {
  fc.assert(
    fc.property(
      fc.uint8Array({ minLength: 0, maxLength: 50_000 }),
      (bytes) => {
        try {
          const result = readFirstSheet(bytes);
          assert.ok(Array.isArray(result));
          for (const row of result) {
            assert.ok(Array.isArray(row));
            for (const cell of row) assert.equal(typeof cell, 'string');
          }
        } catch (e) {
          assert.ok(e instanceof XlsxError, `expected XlsxError, got ${(e as Error)?.constructor?.name}: ${e}`);
        }
      },
    ),
    { numRuns: 500 },
  );
});

// ── readFirstSheet — random zipped XML ───────────────────────────────────────

function makeXlsx(sheetXml: string, sharedStrings?: string): Uint8Array {
  const files: Record<string, Uint8Array> = {
    'xl/worksheets/sheet1.xml': strToU8(sheetXml),
  };
  if (sharedStrings !== undefined) {
    files['xl/sharedStrings.xml'] = strToU8(sharedStrings);
  }
  return zipSync(files);
}

test('fuzz: readFirstSheet on random zipped XML returns string[][] or throws XlsxError only', () => {
  // Covers: unclosed tags, entities, self-closing rows, huge shared-string indexes.
  const xmlFc = fc.oneof(
    fc.string({ maxLength: 2000 }),
    fc.string({ maxLength: 100 }).map((s) => `<worksheet><sheetData>${s}</sheetData></worksheet>`),
    fc.constant('<worksheet><sheetData><row r="1"/><row r="2"><c r="A2"><v>5</v></c></row></sheetData></worksheet>'),
    fc.constant('<worksheet><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>A&#99999999;B</t></is></c></row></sheetData></worksheet>'),
    fc.integer({ min: 0, max: 2_000_000 }).map((n) =>
      `<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>${n}</v></c></row></sheetData></worksheet>`,
    ),
  );
  fc.assert(
    fc.property(xmlFc, fc.option(fc.string({ maxLength: 1000 }), { nil: undefined }), (sheetXml, shared) => {
      const xlsx = makeXlsx(sheetXml, shared);
      try {
        const result = readFirstSheet(xlsx);
        assert.ok(Array.isArray(result));
        for (const row of result) {
          assert.ok(Array.isArray(row));
          for (const cell of row) assert.equal(typeof cell, 'string');
        }
      } catch (e) {
        assert.ok(e instanceof XlsxError, `expected XlsxError, got ${(e as Error)?.constructor?.name}: ${e}`);
      }
    }),
    { numRuns: 500 },
  );
});

// ── parseCsv ─────────────────────────────────────────────────────────────────

test('fuzz: parseCsv on arbitrary text never throws and all returned lots are valid', () => {
  fc.assert(
    fc.property(fc.string(), (text) => {
      const result = parseCsv(text);
      for (const lot of result!.lots) {
        assert.ok(CODE_RE.test(lot.code), `invalid lot.code: ${lot.code}`);
        assert.ok(Number.isInteger(lot.shares) && lot.shares > 0, `invalid lot.shares: ${lot.shares}`);
        assert.ok(Number.isFinite(lot.buyPrice) && lot.buyPrice > 0, `invalid lot.buyPrice: ${lot.buyPrice}`);
      }
    }),
    { numRuns: RUNS },
  );
});

// ── parseLots ─────────────────────────────────────────────────────────────────

test('fuzz: parseLots on arbitrary input never throws and all lots are valid', () => {
  const rawFc = fc.oneof(
    fc.string(),
    fc.constant(null),
    fc.constant(undefined),
  ) as fc.Arbitrary<string | null | undefined>;
  fc.assert(
    fc.property(rawFc, (raw) => {
      let lots: ReturnType<typeof parseLots>;
      assert.doesNotThrow(() => { lots = parseLots(raw); });
      for (const lot of lots!) {
        assert.ok(CODE_RE.test(lot.code), `invalid lot.code: ${lot.code}`);
        assert.ok(Number.isInteger(lot.shares) && lot.shares > 0, `invalid lot.shares: ${lot.shares}`);
        assert.ok(Number.isFinite(lot.buyPrice) && lot.buyPrice > 0, `invalid lot.buyPrice: ${lot.buyPrice}`);
      }
    }),
    { numRuns: RUNS },
  );
});

// ── codeParam ────────────────────────────────────────────────────────────────

test('fuzz: codeParam never throws and returns null or a CODE_RE-matching string', () => {
  fc.assert(
    fc.property(fc.string(), (raw) => {
      const result = codeParam(raw);
      if (result !== null && result !== undefined) {
        assert.ok(CODE_RE.test(result), `codeParam returned invalid code: "${result}"`);
      }
    }),
    { numRuns: RUNS },
  );
});

// ── tradingDaysBetween ───────────────────────────────────────────────────────

test('fuzz: tradingDaysBetween >= 0 and <= calendar days', () => {
  const isoDateFc = fc.integer({ min: 0, max: 365 * 10 }).map((n) =>
    new Date(Date.UTC(2016, 0, 1) + n * 86400000).toISOString().slice(0, 10),
  );
  fc.assert(
    fc.property(
      fc.tuple(isoDateFc, isoDateFc).map(([a, b]) => (a <= b ? [a, b] : [b, a]) as [string, string]),
      ([from, to]) => {
        const result = tradingDaysBetween(from, to);
        assert.ok(result >= 0, `negative result ${result} for ${from}→${to}`);
        const calDays =
          (Date.parse(to + 'T00:00:00Z') - Date.parse(from + 'T00:00:00Z')) / 86400000 + 1;
        assert.ok(result <= calDays, `result ${result} > calDays ${calDays} for ${from}→${to}`);
      },
    ),
    { numRuns: RUNS },
  );
});

test('fuzz: tradingDaysBetween excludes Fridays and Saturdays', () => {
  const isoDateFc = fc.integer({ min: 0, max: 365 * 10 }).map((n) =>
    new Date(Date.UTC(2016, 0, 1) + n * 86400000),
  );
  fc.assert(
    fc.property(isoDateFc, (d) => {
      const iso = d.toISOString().slice(0, 10);
      const day = d.getUTCDay(); // 5=Friday, 6=Saturday
      if (day === 5 || day === 6) {
        const count = tradingDaysBetween(iso, iso);
        assert.equal(count, 0, `${iso} (day ${day}) was counted: ${count}`);
      }
    }),
    { numRuns: RUNS },
  );
});

// ── parseWatchlist ───────────────────────────────────────────────────────────

test('fuzz: parseWatchlist never throws, all codes match CODE_RE, no duplicates', () => {
  const rawFc = fc.oneof(
    fc.string(),
    fc.constant(null),
    fc.constant(undefined),
  ) as fc.Arbitrary<string | null | undefined>;
  fc.assert(
    fc.property(rawFc, (raw) => {
      const result = parseWatchlist(raw);
      assert.ok(Array.isArray(result!));
      for (const code of result!) {
        assert.ok(typeof code === 'string' && CODE_RE.test(code), `invalid code: "${code}"`);
      }
      assert.equal(new Set(result!).size, result!.length, 'watchlist has duplicates');
    }),
    { numRuns: RUNS },
  );
});

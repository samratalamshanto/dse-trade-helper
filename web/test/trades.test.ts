import assert from 'node:assert/strict';
import { test } from 'node:test';
import { strToU8, zipSync } from 'fflate';
import { commissionFor, dateFromFileName, dedupeKey, fromRows, holdingsFrom, parseOrderSummary, splitNew, toRow, TRADE_COLUMNS, validateTrade, type Trade } from '../lib/trades.ts';
import { readFirstSheet, XlsxError } from '../lib/xlsx.ts';

const HEADER = ['BO Code', 'Trade Code', 'Cat', '#Buy', '#Sell', '#Orders', 'BSentQty', 'SSentQty', 'TSentQty', 'AvgPrice', 'BAvgPrice', 'SAvgPrice', 'BExecQty', 'SExecQty', 'BRemQty', 'SRemQty', 'TExecQty', 'NExecQty', 'BExecVal', 'SExecVal', 'TExecVal', 'NExecVal'];
const letters = (i: number) => String.fromCharCode(65 + i);

function brokerXlsx(rows: (string | number | null)[][]): Uint8Array {
  const strings: string[] = [];
  const sheetRows = rows.map((r, ri) => `<row r="${ri + 1}">${r.map((v, ci) => {
    const ref = `${letters(ci)}${ri + 1}`;
    if (v == null) return `<c r="${ref}"/>`;
    if (typeof v === 'number') return `<c r="${ref}"><v>${v}</v></c>`;
    strings.push(v.replace(/&/g, '&amp;'));
    return `<c r="${ref}" t="s"><v>${strings.length - 1}</v></c>`;
  }).join('')}</row>`).join('');
  return zipSync({
    'xl/sharedStrings.xml': strToU8(`<sst>${strings.map((s) => `<si><t>${s}</t></si>`).join('')}</sst>`),
    'xl/worksheets/sheet1.xml': strToU8(`<worksheet><sheetData>${sheetRows}</sheetData></worksheet>`),
  });
}

const sample = () => brokerXlsx([
  HEADER,
  ['00000', 'WALTONHIL', 'A', 1, 0, 1, 1, 0, 1, 330, 330, 0, 1, 0, null, null, 1, 1, 330, 0, 330, 330],
  ['00000', 'GP', 'A', 1, 1, 2, 3, 1, 4, 226.9, 226.9, 228.5, 3, 1, null, null, 4, 2, 680.7, 228.5, 909.2, 452.2],
  ['00000', 'BXPHARMA', 'A', 1, 0, 1, 5, 0, 5, 0, 120, 0, 0, 0, 5, null, 0, 0, 0, 0, 0, 0],
  [null, 'Total', null, 3, 1, 4, 9, 1, 10, 0, 0, 0, 4, 1, null, null, 5, 3, 1010.7, 228.5, 1239.2, 782.2],
]);

test('reads the first worksheet of an xlsx with shared strings, numbers and empty cells', () => {
  const rows = readFirstSheet(sample());
  assert.equal(rows[0][1], 'Trade Code');
  assert.deepEqual(rows[1].slice(1, 4), ['WALTONHIL', 'A', '1']);
  assert.equal(rows[1][14], '');
  assert.equal(rows.length, 5);
});

test('a non-xlsx or oversized upload gives a clear error, not a crash', () => {
  assert.throws(() => readFirstSheet(strToU8('date,code\n2026-11-19,GP')), XlsxError);
  assert.throws(() => readFirstSheet(new Uint8Array(2_000_001)), /too large/);
  assert.throws(() => readFirstSheet(zipSync({ 'readme.txt': strToU8('x') })), /no first worksheet/);
});

test('order summary becomes BUY and SELL trades; unfilled orders, the Total row and the BO code are ignored', () => {
  const { trades, errors } = parseOrderSummary(readFirstSheet(sample()), '2026-11-19');
  assert.deepEqual(errors, []);
  assert.deepEqual(trades.map((t) => [t.code, t.side, t.quantity, t.price]), [['WALTONHIL', 'BUY', 1, 330], ['GP', 'BUY', 3, 226.9], ['GP', 'SELL', 1, 228.5]]);
  assert.ok(trades.every((t) => t.date === '2026-11-19' && !t.note.includes('00000')));
});

test('a sheet without the broker columns is refused with a reason', () => {
  const { trades, errors } = parseOrderSummary([['Name', 'Amount'], ['GP', '10']], '2026-11-19');
  assert.equal(trades.length, 0);
  assert.match(errors[0], /order summary/);
});

test('the trade date is read from the broker file name', () => {
  assert.equal(dateFromFileName('order_summary_19-Nov-2026 03_45_24 PM.xlsx'), '2026-11-19');
  assert.equal(dateFromFileName('order_summary_5-Jan-2027.xlsx'), '2027-01-05');
  assert.equal(dateFromFileName('order_summary_31-Feb-2026.xlsx'), null);
  assert.equal(dateFromFileName('trades.xlsx'), null);
});

test('trade checks reject bad input with a plain reason', () => {
  const ok = { date: '2026-11-19', code: 'gp', side: 'buy', quantity: '2', price: '226.70', commission: '', note: '=HYPERLINK("x")' };
  const v = validateTrade(ok, '2026-11-20');
  assert.ok(v.ok);
  if (v.ok) assert.deepEqual(v.value, { date: '2026-11-19', code: 'GP', side: 'BUY', quantity: 2, price: 226.7, commission: null, note: 'HYPERLINK("x")', account: 'real' });
  const bad: [Record<string, unknown>, RegExp][] = [
    [{ ...ok, date: '2026-02-30' }, /real date/],
    [{ ...ok, date: '2026-11-21' }, /future/],
    [{ ...ok, code: '<script>' }, /code/],
    [{ ...ok, side: 'HOLD' }, /BUY or SELL/],
    [{ ...ok, quantity: '1.5' }, /whole number/],
    [{ ...ok, quantity: '100abc' }, /whole number/],
    [{ ...ok, quantity: '0' }, /whole number/],
    [{ ...ok, price: '-5' }, /positive/],
    [{ ...ok, price: '1e3' }, /positive/],
    [{ ...ok, commission: 'free' }, /Commission/],
    [{ ...ok, account: 'demo' }, /real or paper/],
  ];
  for (const [input, msg] of bad) {
    const r = validateTrade(input, '2026-11-20');
    assert.ok(!r.ok && msg.test(r.error), `${JSON.stringify(input)} → ${JSON.stringify(r)}`);
  }
  assert.ok(!validateTrade(null).ok);
});

const trade = (over: Partial<Trade>): Trade => ({ id: 'x', date: '2026-11-19', code: 'GP', side: 'BUY', quantity: 1, price: 100, commission: null, note: '', source: 'manual', createdAt: '2026-11-19T10:00:00Z', account: 'real', ...over });

test('holdings use average cost; a sell books realised profit and keeps the average of the rest', () => {
  const { holdings, warnings } = holdingsFrom([
    trade({ id: '1', quantity: 10, price: 100, commission: 5 }),
    trade({ id: '2', date: '2026-11-20', quantity: 10, price: 120, commission: 5 }),
    trade({ id: '3', date: '2026-11-21', side: 'SELL', quantity: 5, price: 130, commission: 2 }),
  ]);
  assert.deepEqual(warnings, []);
  const gp = holdings[0];
  assert.equal(gp.shares, 15);
  assert.equal(gp.avgCost, 110.5);
  assert.equal(gp.realised, 5 * 130 - 2 - 5 * 110.5);
  assert.equal(gp.trades, 3);
});

test('selling more than was bought is capped and warned about', () => {
  const { holdings, warnings } = holdingsFrom([trade({ quantity: 2 }), trade({ id: '2', side: 'SELL', quantity: 5, createdAt: '2026-11-19T11:00:00Z' })]);
  assert.equal(holdings[0].shares, 0);
  assert.match(warnings[0], /only 2 were bought/);
});

test('rows round-trip through the sheet format; bad rows are reported by sheet row number', () => {
  const t = trade({ id: 'abc', commission: 2.5, note: 'first buy' });
  const { trades, badRows } = fromRows([toRow(t), [], ['', '2026-11-19', 'GP', 'BUY', '1', '100'], ['id2', 'soon', 'GP', 'BUY', '1', '100']]);
  assert.deepEqual(trades.map(({ row, ...rest }) => [row, rest]), [[2, t]]);
  assert.deepEqual(badRows, [4, 5]);
});

test('the same trade imported twice has the same dedupe key', () => {
  assert.equal(dedupeKey({ date: '2026-11-19', code: 'GP', side: 'BUY', quantity: 1, price: 226.9 }), dedupeKey(trade({ price: 226.90000001, quantity: 1, date: '2026-11-19' })));
  assert.notEqual(dedupeKey(trade({})), dedupeKey(trade({ side: 'SELL' })));
});

test('an imported file cannot add trades dated in the future', () => {
  const { trades, errors } = parseOrderSummary(readFirstSheet(sample()), '2026-11-21', '2026-11-20');
  assert.equal(trades.length, 0);
  assert.match(errors[0], /future/);
});

test('on the same day a sell typed before its buy is still matched to the buy', () => {
  const { holdings, warnings } = holdingsFrom([
    trade({ id: 's', side: 'SELL', quantity: 1, price: 110, createdAt: '2026-11-19T09:00:00Z' }),
    trade({ id: 'b', side: 'BUY', quantity: 2, price: 100, createdAt: '2026-11-19T10:00:00Z' }),
  ]);
  assert.deepEqual(warnings, []);
  assert.equal(holdings[0].shares, 1);
  assert.equal(holdings[0].realised, 10);
});

test('import skips only as many identical rows as the sheet already has', () => {
  const t = { date: '2026-11-19', code: 'GP', side: 'BUY' as const, quantity: 1, price: 226.9, commission: null, note: '' };
  assert.deepEqual([splitNew([t, t], []).added.length, splitNew([t, t], [t]).added.length, splitNew([t, t], [t, t]).added.length], [2, 1, 0]);
});

test('a bad character code and an empty self-closing row do not break the reader', () => {
  const xml = '<worksheet><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>A&#99999999;B&amp;C</t></is></c></row><row r="2"/><row r="3"><c r="A3"><v>7</v></c></row></sheetData></worksheet>';
  const rows = readFirstSheet(zipSync({ 'xl/worksheets/sheet1.xml': strToU8(xml) }));
  assert.deepEqual(rows, [['A&#99999999;B&C'], [], ['7']]);
});

test('negative amounts are never accepted, so a negative commission cannot inflate profit', () => {
  const base = { date: '2026-11-19', code: 'GP', side: 'BUY', quantity: 1, price: 100 };
  const r = validateTrade({ ...base, commission: -10 }, '2026-11-20');
  assert.ok(!r.ok && /Commission/.test(r.error));
  assert.ok(!validateTrade({ ...base, price: -5 }, '2026-11-20').ok);
});

test('account: missing or empty is real, paper is kept, and the column is written last', () => {
  const base = { date: '2026-11-19', code: 'GP', side: 'BUY', quantity: 1, price: 100 };
  const acc = (x: unknown) => { const v = validateTrade({ ...base, account: x }, '2026-11-20'); return v.ok ? v.value.account : v.error; };
  assert.deepEqual([acc(undefined), acc(''), acc('real'), acc('paper')], ['real', 'real', 'real', 'paper']);
  assert.deepEqual(toRow(trade({ account: 'paper' })).slice(-1), ['paper']);
  assert.equal(TRADE_COLUMNS.at(-1), 'account');
});

test('old 10-column rows and rows with an empty account cell read as real trades', () => {
  const old = ['id1', '2026-11-19', 'WALTONHIL', 'BUY', '1', '330', '', '', 'broker-xlsx', '2026-11-19T10:00:00Z'];
  const { trades, badRows } = fromRows([old, [...old.slice(0, 9), 'x', '']]);
  assert.deepEqual(badRows, []);
  assert.deepEqual(trades.map((t) => [t.code, t.account]), [['WALTONHIL', 'real'], ['WALTONHIL', 'real']]);
});

test('fromRows returns one account at a time (real by default); an unknown account cell is a bad row', () => {
  const rows = [toRow(trade({ id: 'r', code: 'GP' })), toRow(trade({ id: 'p', code: 'BXPHARMA', account: 'paper' })), [...toRow(trade({ id: 'z' })).slice(0, 10), 'demo']];
  assert.deepEqual(fromRows(rows).trades.map((t) => t.id), ['r']);
  assert.deepEqual(fromRows(rows, 'paper').trades.map((t) => t.id), ['p']);
  assert.deepEqual(fromRows(rows, 'all').trades.map((t) => t.id), ['r', 'p']);
  assert.deepEqual(fromRows(rows, 'paper').badRows, [4]);
});

test('holdings are kept per account: practice buys never change real holdings', () => {
  const rows = [toRow(trade({ id: 'r', quantity: 1, price: 226.9 })), toRow(trade({ id: 'p', quantity: 50, price: 200, account: 'paper' }))];
  const real = holdingsFrom(fromRows(rows).trades).holdings;
  const paper = holdingsFrom(fromRows(rows, 'paper').trades).holdings;
  assert.deepEqual(real.map((h) => [h.code, h.shares, h.avgCost]), [['GP', 1, 226.9]]);
  assert.deepEqual(paper.map((h) => [h.code, h.shares, h.avgCost]), [['GP', 50, 200]]);
});

test('broker imports are always real trades', () => {
  const { trades } = parseOrderSummary(readFirstSheet(sample()), '2026-11-19');
  assert.ok(trades.length > 0 && trades.every((t) => t.account === 'real'));
});

test('commissionFor: rate of the trade value, rounded to paisa; empty until the numbers are valid', () => {
  assert.equal(commissionFor('100', '226.70', '0.4'), '90.68');
  assert.equal(commissionFor('1', '227', '0.4'), '0.91');
  assert.equal(commissionFor('10', '50', '0'), '0.00');
  assert.equal(commissionFor('', '50', '0.4'), '');
  assert.equal(commissionFor('10', 'abc', '0.4'), '');
  assert.equal(commissionFor('10', '50', '-1'), '');
  assert.equal(commissionFor('10', '50', '6'), '');
  assert.equal(commissionFor('10', '50', ''), '');
});

test('parseOrderSummary adds the broker rate as commission; no rate keeps it empty', () => {
  const rows = [['Trade Code', 'BExecQty', 'BAvgPrice', 'SExecQty', 'SAvgPrice'], ['GP', '100', '226.70', '10', '230']];
  const withFee = parseOrderSummary(rows, '2026-11-19', '2026-11-19', '0.4').trades;
  assert.deepEqual(withFee.map((t) => [t.side, t.commission]), [['BUY', 90.68], ['SELL', 9.2]]);
  assert.deepEqual(parseOrderSummary(rows, '2026-11-19', '2026-11-19').trades.map((t) => t.commission), [null, null]);
});

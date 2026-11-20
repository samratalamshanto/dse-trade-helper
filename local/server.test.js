const test = require('node:test');
const assert = require('node:assert');
const { parseHistory } = require('./server.js');

const ESCAPED_PAGE = String.raw`x{\"t\":\"11 Nov\",\"date\":\"2026-11-11\",\"price\":218.6,\"open\":219.8}y`
  + String.raw`{\"t\":\"10 Nov\",\"date\":\"2026-11-10\",\"price\":219.3}`
  + String.raw`\"marketCap\":186509292504,\"pe\":7.777,\"eps\":27.04,\"dividendYield\":5.74,\"bookValue\":157.88,`;

test('parses daily prices sorted by date and the quote block', () => {
  const r = parseHistory(ESCAPED_PAGE);
  assert.deepStrictEqual(r.points, [['2026-11-10', 219.3], ['2026-11-11', 218.6]]);
  assert.deepStrictEqual([r.pe, r.eps, r.nav, r.dividendYield], [7.777, 27.04, 157.88, 5.74]);
});

test('returns empty data when the page format changes', () => {
  const r = parseHistory('<html>new layout</html>');
  assert.deepStrictEqual(r.points, []);
  assert.strictEqual(r.pe, null);
});

test('keeps null fields as null', () => {
  const r = parseHistory('"marketCap":null,"pe":null,"eps":-1.5,"dividendYield":null,"bookValue":12');
  assert.deepStrictEqual([r.marketCap, r.pe, r.eps, r.nav], [null, null, -1.5, 12]);
});

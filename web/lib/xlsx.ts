import { strFromU8, unzipSync } from 'fflate';

export const XLSX_MAX_BYTES = 2_000_000;
const PART_MAX_BYTES = 5_000_000;
const MAX_ROWS = 20_000;
const MAX_COLUMN = 50;
// Only the first sheet is unpacked, so a file with many large sheets cannot exhaust memory.
const FIRST_SHEET = 'xl/worksheets/sheet1.xml';

export class XlsxError extends Error {}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const MAX_CODE_POINT = 0x10ffff;
function entity(m: string, e: string): string {
  if (e[0] !== '#') return ENTITIES[e] ?? m;
  const code = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : Number(e.slice(1));
  return Number.isInteger(code) && code >= 0 && code <= MAX_CODE_POINT ? String.fromCodePoint(code) : m;
}
const unescapeXml = (s: string) => s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, entity);

// indexOf scanning, never a lazy regex to the end: an unclosed tag stops the scan instead of rescanning the rest (quadratic).
function* elements(xml: string, tag: string): Generator<{ attrs: string; body: string }> {
  const open = `<${tag}`, close = `</${tag}>`;
  for (let at = xml.indexOf(open); at >= 0; at = xml.indexOf(open, at)) {
    const end = xml.indexOf('>', at);
    if (end < 0) return;
    const attrs = xml.slice(at + open.length, end);
    // <rowBreaks …> must not count as <row …>.
    if (attrs && !/^[\s/]/.test(attrs)) { at = end; continue; }
    if (attrs.endsWith('/')) { yield { attrs, body: '' }; at = end; continue; }
    const stop = xml.indexOf(close, end);
    if (stop < 0) return;
    yield { attrs, body: xml.slice(end + 1, stop) };
    at = stop + close.length;
  }
}

const textOf = (xml: string) => [...elements(xml, 't')].map((t) => unescapeXml(t.body)).join('');

const columnIndex = (ref: string) => [...(ref.match(/^[A-Z]+/)?.[0] ?? '')].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;

// shortcut: hand-rolled SpreadsheetML reading (first worksheet only, no formulas evaluated) — enough for broker exports; use a full parser if files get richer.
export function readFirstSheet(data: Uint8Array): string[][] {
  if (data.byteLength > XLSX_MAX_BYTES) throw new XlsxError('The file is too large. Export one day or one month at a time.');
  let files: Record<string, Uint8Array>;
  let oversize = false;
  try {
    // fflate inflates into a buffer of the declared size and never grows it (inflateSync with out), so this caps the real bytes too.
    files = unzipSync(data, { filter: (f) => {
      const wanted = f.name === 'xl/sharedStrings.xml' || f.name === FIRST_SHEET;
      if (wanted && f.originalSize > PART_MAX_BYTES) oversize = true;
      return wanted && !oversize;
    } });
  } catch (e) {
    throw new XlsxError('This is not a valid Excel (.xlsx) file.', { cause: e });
  }
  if (oversize) throw new XlsxError('This Excel file is too large inside. Export one day or one month at a time.');
  if (!files[FIRST_SHEET]) throw new XlsxError('The Excel file has no first worksheet.');
  const shared = files['xl/sharedStrings.xml'] ? [...elements(strFromU8(files['xl/sharedStrings.xml']), 'si')].map((si) => textOf(si.body)) : [];
  const rows: string[][] = [];
  for (const row of elements(strFromU8(files[FIRST_SHEET]), 'row')) {
    if (rows.length >= MAX_ROWS) throw new XlsxError(`The sheet has more than ${MAX_ROWS} rows. Export one day or one month at a time.`);
    const cells: string[] = [];
    for (const c of elements(row.body, 'c')) {
      const ref = /\br="([A-Z]+\d+)"/.exec(c.attrs)?.[1];
      const type = /\bt="(\w+)"/.exec(c.attrs)?.[1];
      const raw = [...elements(c.body, 'v')][0]?.body;
      let value = '';
      if (type === 'inlineStr') value = textOf(c.body);
      else if (raw == null) value = '';
      else if (type === 's') value = shared[Number(raw)] ?? '';
      else value = unescapeXml(raw);
      const col = ref ? columnIndex(ref) : cells.length;
      if (col > MAX_COLUMN) throw new XlsxError('The sheet has more columns than a broker order summary.');
      cells[col] = value.trim();
    }
    rows.push(Array.from(cells, (v) => v ?? ''));
  }
  return rows;
}

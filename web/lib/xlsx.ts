import { strFromU8, unzipSync } from 'fflate';

export const XLSX_MAX_BYTES = 2_000_000;
const PART_MAX_BYTES = 20_000_000;
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

const textOf = (xml: string) => [...xml.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((m) => unescapeXml(m[1])).join('');

const columnIndex = (ref: string) => [...(ref.match(/^[A-Z]+/)?.[0] ?? '')].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;

// shortcut: regex over SpreadsheetML (first worksheet only, no formulas evaluated) — enough for broker exports; use a full parser if files get richer.
export function readFirstSheet(data: Uint8Array): string[][] {
  if (data.byteLength > XLSX_MAX_BYTES) throw new XlsxError('The file is too large. Export one day or one month at a time.');
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(data, { filter: (f) => f.originalSize <= PART_MAX_BYTES && (f.name === 'xl/sharedStrings.xml' || f.name === FIRST_SHEET) });
  } catch (e) {
    throw new XlsxError('This is not a valid Excel (.xlsx) file.', { cause: e });
  }
  const sheetName = FIRST_SHEET;
  if (!files[sheetName]) throw new XlsxError('The Excel file has no first worksheet.');
  const shared = files['xl/sharedStrings.xml'] ? [...strFromU8(files['xl/sharedStrings.xml']).matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)].map((m) => textOf(m[1])) : [];
  const rows: string[][] = [];
  for (const row of strFromU8(files[sheetName]).matchAll(/<row\b[^>]*?(?:\/>|>([\s\S]*?)<\/row>)/g)) {
    const cells: string[] = [];
    for (const c of (row[1] ?? '').matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const ref = /\br="([A-Z]+\d+)"/.exec(c[1])?.[1];
      const type = /\bt="(\w+)"/.exec(c[1])?.[1];
      const body = c[2] ?? '';
      const raw = /<v>([\s\S]*?)<\/v>/.exec(body)?.[1];
      let value = '';
      if (type === 'inlineStr') value = textOf(body);
      else if (raw == null) value = '';
      else if (type === 's') value = shared[Number(raw)] ?? '';
      else value = unescapeXml(raw);
      cells[ref ? columnIndex(ref) : cells.length] = value.trim();
    }
    rows.push(Array.from(cells, (v) => v ?? ''));
  }
  return rows;
}

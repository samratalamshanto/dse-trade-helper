import { timingSafeEqual } from 'node:crypto';
import { SheetsError, withSheet } from './sheets.ts';
import { TradeInputError } from './trades-service.ts';
import { respond } from './http.ts';
import { XLSX_MAX_BYTES, XlsxError } from './xlsx.ts';
import { commissionFor, MAX_COMMISSION_PCT } from './trades.ts';

export const KEY_HEADER = 'x-trades-key';
const json = (status: number, body: unknown) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

// Trades are private: every call needs the shared key; with no key configured the API stays closed.
function authorised(request: Request): Response | null {
  const expected = process.env.TRADES_API_KEY ?? '';
  if (expected.length < 32) return json(503, { error: 'Trades are not set up on this server (TRADES_API_KEY is missing or shorter than 32 characters).' });
  const given = Buffer.from(request.headers.get(KEY_HEADER) ?? '');
  const want = Buffer.from(expected);
  if (given.length !== want.length || !timingSafeEqual(given, want)) return json(401, { error: 'Enter the trades key to see or change your trades.' });
  return null;
}

// For public endpoints that add private details only when the caller proves the trades key.
export const hasTradesKey = (request: Request): boolean => authorised(request) === null;

// Signed in with Google: the user's own Sheet. Otherwise the shared key opens the owner's Sheet.
// ownerOnly: Telegram routes still send to the one owner chat, so they keep the key and ignore sign-in.
export async function tradesRoute(request: Request, label: string, work: () => Promise<unknown>, { ownerOnly = false } = {}): Promise<Response> {
  try {
    // Loaded on use, so code that never reads a session (tests, the alert job) does not load Auth.js.
    const target = ownerOnly ? null : await (await import('./session-sheet.ts')).signedInSheet(request);
    // The session is a cookie, so only this site's own pages may use it (sibling subdomains too are refused).
    const site = request.headers.get('sec-fetch-site');
    if (target && site && site !== 'same-origin' && site !== 'none') return json(403, { error: 'Open this site to use your trades.' });
    if (target) return json(200, await withSheet(target, work));
    const denied = authorised(request);
    if (denied) return denied;
    return json(200, await work());
  } catch (e) {
    return failed(label, e);
  }
}

function failed(label: string, e: unknown): Response {
  if (e instanceof TradeInputError || e instanceof XlsxError) return json(400, { error: e.message });
  console.error(`trades ${label} failed`, e);
  if (e instanceof SheetsError) return json(e.status, { error: e.message });
  return json(500, { error: 'Something went wrong while saving trades. Try again.' });
}

export { TRADE_ID_RE } from './trades.ts';

// A trade or a settings save is a few hundred bytes; anything far larger is refused before parsing.
export const JSON_MAX_BYTES = 20_000;

// Browser mode sends all of its trades and plans in one body (lib/browser-data.ts caps the counts).
export const BROWSER_JSON_MAX_BYTES = 3_000_000;

export async function readJson(request: Request, maxBytes = JSON_MAX_BYTES): Promise<unknown> {
  if (Number(request.headers.get('content-length') ?? 0) > maxBytes) throw new TradeInputError('The request is too large.');
  const text = await request.text();
  if (Buffer.byteLength(text) > maxBytes) throw new TradeInputError('The request is too large.');
  try { return JSON.parse(text); } catch (e) { throw new TradeInputError('Send the trade as JSON.', { cause: e }); }
}

export interface ImportForm { data: Uint8Array; fileName: string; date: string | null; save: boolean; commissionPct: string }

// multipart form: file (broker .xlsx order summary), date (optional YYYY-MM-DD), save ("1" to write, otherwise preview only),
// commissionPct (optional broker rate; the file has no commission column, so each trade gets this rate)
export async function readImportForm(request: Request): Promise<ImportForm> {
  if (Number(request.headers.get('content-length') ?? 0) > XLSX_MAX_BYTES * 2) throw new TradeInputError('The file is too large.');
  const form = await request.formData().catch((e: unknown) => { throw new TradeInputError('Upload the file as a form.', { cause: e }); });
  const file = form.get('file');
  if (!(file instanceof File)) throw new TradeInputError('Choose the broker order summary (.xlsx) file.');
  // Chunked uploads carry no content-length, so the real size is checked again here.
  if (file.size > XLSX_MAX_BYTES) throw new TradeInputError('The file is too large. Export one day or one month at a time.');
  // Phones may upload the file under a storage id, so they send the real file name separately.
  const named = form.get('fileName');
  const fileName = typeof named === 'string' && named.trim() ? named.trim().slice(0, 200) : file.name;
  if (!/\.xlsx$/i.test(fileName)) throw new TradeInputError('Only Excel .xlsx files can be imported for now.');
  const date = typeof form.get('date') === 'string' && form.get('date') ? String(form.get('date')) : null;
  if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new TradeInputError('Date must look like 2026-11-19.');
  const pct = form.get('commissionPct');
  const commissionPct = typeof pct === 'string' ? pct.trim() : '';
  if (commissionPct && commissionFor('1', '1', commissionPct) === '') throw new TradeInputError(`Broker rate must be a percentage from 0 to ${MAX_COMMISSION_PCT}.`);
  return { data: new Uint8Array(await file.arrayBuffer()), fileName, date, save: form.get('save') === '1', commissionPct };
}

// Keyless browser-mode endpoints: the caller's own data in, numbers out, nothing stored. Pages on other sites may not call them.
export async function browserRoute(request: Request, label: string, work: () => Promise<unknown>): Promise<Response> {
  if (request.headers.get('sec-fetch-site') === 'cross-site') return json(403, { error: 'Open this site to use your portfolio.' });
  return respond(label, async () => {
    try { return await work(); } catch (e) { throw e instanceof XlsxError ? new TradeInputError(e.message, { cause: e }) : e; }
  });
}

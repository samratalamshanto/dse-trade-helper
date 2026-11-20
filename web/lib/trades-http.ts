import { timingSafeEqual } from 'node:crypto';
import { SheetsError } from './sheets.ts';
import { TradeInputError } from './trades-service.ts';
import { XlsxError } from './xlsx.ts';

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

export async function tradesRoute(request: Request, label: string, work: () => Promise<unknown>): Promise<Response> {
  const denied = authorised(request);
  if (denied) return denied;
  try {
    return json(200, await work());
  } catch (e) {
    if (e instanceof TradeInputError || e instanceof XlsxError) return json(400, { error: e.message });
    if (e instanceof SheetsError) {
      console.error(`trades ${label} failed`, e);
      return json(e.status, { error: e.message });
    }
    console.error(`trades ${label} failed`, e);
    return json(500, { error: 'Something went wrong while saving trades. Try again.' });
  }
}

export const TRADE_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

// A trade or a settings save is a few hundred bytes; anything far larger is refused before parsing.
export const JSON_MAX_BYTES = 20_000;

export async function readJson(request: Request): Promise<unknown> {
  const text = await request.text();
  if (Buffer.byteLength(text) > JSON_MAX_BYTES) throw new TradeInputError('The request is too large.');
  try { return JSON.parse(text); } catch (e) { throw new TradeInputError('Send the trade as JSON.', { cause: e }); }
}

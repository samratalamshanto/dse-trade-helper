import { createSign } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { TRADE_COLUMNS } from './trades.ts';

export const TAB = 'trades';
const lastCol = (columns: readonly string[]) => String.fromCharCode(64 + columns.length);
const SHEETS_TIMEOUT_MS = 10_000;
const RETRY_DELAY_MS = 400;

// One retry after a network failure, only for requests that are safe to repeat (sign-in and reads).
async function fetchRetry(url: string, init: () => RequestInit, repeatable: boolean): Promise<Response> {
  try {
    return await fetch(url, init());
  } catch (e) {
    if (!repeatable) throw e;
    console.warn('sheets: network error, retrying once', e);
    await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
    return fetch(url, init());
  }
}
const TOKEN_EARLY_MS = 60_000;
const API = 'https://sheets.googleapis.com/v4/spreadsheets/';


export class SheetsError extends Error {
  readonly status: number;
  constructor(message: string, status = 502, options?: ErrorOptions) { super(message, options); this.status = status; }
}

interface ServiceAccount { client_email: string; private_key: string }

function config(): { sheetId: string; account: ServiceAccount } {
  const sheetId = process.env.GOOGLE_SHEET_ID?.trim();
  const json = process.env.GOOGLE_SERVICE_ACCOUNT_JSON ?? (process.env.GOOGLE_SERVICE_ACCOUNT_FILE ? readFileSync(process.env.GOOGLE_SERVICE_ACCOUNT_FILE, 'utf8') : '');
  if (!sheetId || !json) throw new SheetsError('Trades are not set up: GOOGLE_SHEET_ID and the service account key are missing.', 503);
  let account: ServiceAccount;
  // The parse error is not kept as a cause: its message can quote part of the private key into the logs.
  try { account = JSON.parse(json) as ServiceAccount; } catch { throw new SheetsError('The Google service account key is not valid JSON.', 503); }
  if (!account.client_email || !account.private_key) throw new SheetsError('The Google service account key has no client_email or private_key.', 503);
  return { sheetId, account };
}

let token: { value: string; until: number } | null = null;

async function accessToken(account: ServiceAccount): Promise<string> {
  if (token && Date.now() < token.until) return token.value;
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const unsigned = `${b64({ alg: 'RS256', typ: 'JWT' })}.${b64({ iss: account.client_email, scope: 'https://www.googleapis.com/auth/spreadsheets', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 })}`;
  const assertion = `${unsigned}.${createSign('RSA-SHA256').update(unsigned).sign(account.private_key).toString('base64url')}`;
  const res = await fetchRetry('https://oauth2.googleapis.com/token', () => ({
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
    signal: AbortSignal.timeout(SHEETS_TIMEOUT_MS),
  }), true).catch((e: unknown) => { throw new SheetsError('Google sign-in could not be reached.', 502, { cause: e }); });
  const body = (await res.json().catch(() => ({}))) as { access_token?: string; expires_in?: number; error?: string };
  if (!res.ok || !body.access_token) throw new SheetsError(`Google sign-in failed (${res.status} ${body.error ?? ''}).`.replace(' )', ')'));
  token = { value: body.access_token, until: Date.now() + (body.expires_in ?? 3600) * 1000 - TOKEN_EARLY_MS };
  return token.value;
}

async function call<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const { sheetId, account } = config();
  const method = init.method ?? 'GET';
  const authorization = `Bearer ${await accessToken(account)}`;
  const res = await fetchRetry(API + encodeURIComponent(sheetId) + path, () => ({
    method,
    headers: { authorization, 'content-type': 'application/json' },
    body: init.body == null ? undefined : JSON.stringify(init.body),
    signal: AbortSignal.timeout(SHEETS_TIMEOUT_MS),
  }), method === 'GET').catch((e: unknown) => { throw new SheetsError('Google Sheets could not be reached.', 502, { cause: e }); });
  const body = (await res.json().catch(() => ({}))) as T & { error?: { message?: string; status?: string } };
  if (!res.ok) {
    if (res.status === 401) token = null;
    if (res.status === 403) throw new SheetsError('The trades sheet is not shared with the app (give the service account Editor access).');
    if (res.status === 404) throw new SheetsError('The trades sheet was not found. Check GOOGLE_SHEET_ID.');
    throw new SheetsError(`Google Sheets error ${res.status}: ${body.error?.status ?? 'unknown'}.`);
  }
  return body;
}

const SETTINGS_TAB = 'settings';
const SETTINGS_COLUMNS = ['code', 'stop_pct', 'target_pct'];
const tabSetups = new Map<string, Promise<number>>();

// Creates a tab and its header row on first use; parallel first calls share one setup.
function ensureTab(title = TAB, columns: readonly string[] = TRADE_COLUMNS): Promise<number> {
  let setup = tabSetups.get(title);
  if (!setup) {
    setup = setUpTab(title, columns).catch((e: unknown) => { tabSetups.delete(title); throw e; });
    tabSetups.set(title, setup);
  }
  return setup;
}

async function setUpTab(title: string, columns: readonly string[]): Promise<number> {
  const meta = await call<{ sheets: { properties: { sheetId: number; title: string } }[] }>('?fields=sheets.properties(sheetId,title)');
  let found = meta.sheets.find((s) => s.properties.title === title)?.properties.sheetId;
  if (found == null) {
    const added = await call<{ replies: { addSheet: { properties: { sheetId: number } } }[] }>(':batchUpdate', { method: 'POST', body: { requests: [{ addSheet: { properties: { title } } }] } });
    found = added.replies[0].addSheet.properties.sheetId;
  }
  const range = `${title}!A1:${lastCol(columns)}1`;
  const head = await call<{ values?: string[][] }>(`/values/${range}`);
  if ((head.values?.[0] ?? []).join() !== columns.join()) {
    await call(`/values/${range}?valueInputOption=RAW`, { method: 'PUT', body: { values: [columns] } });
  }
  return found;
}

const SETTINGS: TabSpec = { title: SETTINGS_TAB, columns: SETTINGS_COLUMNS };

// Small whole-tab tables (limits, preferences): read every row below the header.
export async function readSettingsRows(tab: TabSpec = SETTINGS): Promise<string[][]> {
  await ensureTab(tab.title, tab.columns);
  return (await call<{ values?: string[][] }>(`/values/${tab.title}!A2:${lastCol(tab.columns)}`)).values ?? [];
}

// Write the new rows first, then clear only the rows left below them, so a failure never leaves the tab empty.
export async function writeSettingsRows(rows: string[][], tab: TabSpec = SETTINGS): Promise<void> {
  await ensureTab(tab.title, tab.columns);
  const col = lastCol(tab.columns);
  if (rows.length) await call(`/values/${tab.title}!A2:${col}${rows.length + 1}?valueInputOption=RAW`, { method: 'PUT', body: { values: rows } });
  await call(`/values/${tab.title}!A${rows.length + 2}:${col}:clear`, { method: 'POST', body: {} });
}

// Another device or a hand edit in the sheet can move rows; refuse to touch a row whose id changed.
export interface TabSpec { title: string; columns: readonly string[] }
const TRADES: TabSpec = { title: TAB, columns: TRADE_COLUMNS };

async function confirmRow(tab: TabSpec, sheetRow: number, id: string): Promise<void> {
  const res = await call<{ values?: string[][] }>(`/values/${tab.title}!A${sheetRow}`);
  if (res.values?.[0]?.[0] !== id) throw new SheetsError('The sheet changed while you were editing. Reload and try again.', 409);
}

export async function readRows(tab: TabSpec = TRADES): Promise<string[][]> {
  await ensureTab(tab.title, tab.columns);
  const res = await call<{ values?: string[][] }>(`/values/${tab.title}!A2:${lastCol(tab.columns)}`);
  return res.values ?? [];
}

export async function appendRows(rows: string[][], tab: TabSpec = TRADES): Promise<void> {
  if (!rows.length) return;
  await ensureTab(tab.title, tab.columns);
  await call(`/values/${tab.title}!A:${lastCol(tab.columns)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, { method: 'POST', body: { values: rows } });
}

export async function writeRow(sheetRow: number, row: string[], tab: TabSpec = TRADES): Promise<void> {
  await ensureTab(tab.title, tab.columns);
  await confirmRow(tab, sheetRow, row[0]);
  const col = lastCol(tab.columns);
  await call(`/values/${tab.title}!A${sheetRow}:${col}${sheetRow}?valueInputOption=RAW`, { method: 'PUT', body: { values: [row] } });
}

export async function deleteRow(sheetRow: number, id: string, tab: TabSpec = TRADES): Promise<void> {
  const sheetId = await ensureTab(tab.title, tab.columns);
  await confirmRow(tab, sheetRow, id);
  await call(':batchUpdate', { method: 'POST', body: { requests: [{ deleteDimension: { range: { sheetId, dimension: 'ROWS', startIndex: sheetRow - 1, endIndex: sheetRow } } }] } });
}

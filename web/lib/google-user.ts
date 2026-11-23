import { SheetsError, type SheetTarget } from './sheets.ts';

// A signed-in Google user's own Sheet. Scope drive.file: the app sees only files it made, never the rest of the Drive.
const DRIVE_FILES = 'https://www.googleapis.com/drive/v3/files';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const TIMEOUT_MS = 10_000;
const TOKEN_EARLY_MS = 60_000;
export const SHEET_NAME = 'DSE Trade Helper';
// Private to this app (Drive appProperties), so a later sign-in on any device finds the same Sheet.
const MARK = { dseTradeHelper: '1' };
export const SIGN_IN_AGAIN = 'Sign in with Google again to reach your Sheet.';

async function google<T>(url: string, accessToken: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(url, {
    method: init.method ?? 'GET',
    headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' },
    body: init.body == null ? undefined : JSON.stringify(init.body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  }).catch((e: unknown) => { throw new SheetsError('Google Drive could not be reached.', 502, { cause: e }); });
  const body = (await res.json().catch(() => ({}))) as T & { error?: { status?: string } };
  if (res.status === 401) throw new SheetsError(SIGN_IN_AGAIN, 401);
  if (!res.ok) throw new SheetsError(`Google Drive error ${res.status}: ${body.error?.status ?? 'unknown'}.`);
  return body;
}

// Reuse before create: the oldest marked Sheet not in the trash, else a new one.
// shortcut: two first sign-ins at the same moment can each make a Sheet; the next sign-in picks the oldest. Add a lock if users report two Sheets.
export async function findOrCreateSheet(accessToken: string): Promise<string> {
  const q = `appProperties has { key='dseTradeHelper' and value='1' } and trashed = false`;
  const found = await google<{ files?: { id: string }[] }>(`${DRIVE_FILES}?q=${encodeURIComponent(q)}&orderBy=createdTime&pageSize=1&fields=files(id)`, accessToken);
  if (found.files?.[0]?.id) return found.files[0].id;
  const made = await google<{ id: string }>(`${DRIVE_FILES}?fields=id`, accessToken, {
    method: 'POST', body: { name: SHEET_NAME, mimeType: 'application/vnd.google-apps.spreadsheet', appProperties: MARK },
  });
  return made.id;
}

// The only Sheet detail the browser gets: a link to the user's own Sheet. Sheet ids are letters, digits, - and _.
export function sheetUrl(sheetId: unknown): string | undefined {
  return typeof sheetId === 'string' && /^[\w-]{10,200}$/.test(sheetId) ? `https://docs.google.com/spreadsheets/d/${sheetId}/edit` : undefined;
}

export interface SignedIn { sub: string; sheetId: string; refreshToken?: string; accessToken?: string; expiresAt?: number }

// Access tokens live an hour; one per user is kept in memory. The refresh token stays in the encrypted session cookie.
const tokens = new Map<string, { value: string; until: number }>();

async function refresh(user: SignedIn): Promise<string> {
  if (!user.refreshToken) throw new SheetsError(SIGN_IN_AGAIN, 401);
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: process.env.AUTH_GOOGLE_ID ?? '', client_secret: process.env.AUTH_GOOGLE_SECRET ?? '', grant_type: 'refresh_token', refresh_token: user.refreshToken }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  }).catch((e: unknown) => { throw new SheetsError('Google sign-in could not be reached.', 502, { cause: e }); });
  const body = (await res.json().catch(() => ({}))) as { access_token?: string; expires_in?: number; error?: string };
  // invalid_grant: the user removed the app's access, or the grant expired.
  if (body.error === 'invalid_grant') throw new SheetsError(SIGN_IN_AGAIN, 401);
  if (!res.ok || !body.access_token) throw new SheetsError(`Google sign-in failed (${res.status} ${body.error ?? ''}).`.replace(' )', ')'));
  tokens.set(user.sub, { value: body.access_token, until: Date.now() + (body.expires_in ?? 3600) * 1000 - TOKEN_EARLY_MS });
  return body.access_token;
}

export function userTarget(user: SignedIn): SheetTarget {
  return {
    sheetId: user.sheetId,
    accessToken: async () => {
      const cached = tokens.get(user.sub);
      if (cached && Date.now() < cached.until) return cached.value;
      // The token from sign-in is good until it expires; after that, refresh.
      if (user.accessToken && user.expiresAt && Date.now() < user.expiresAt * 1000 - TOKEN_EARLY_MS) return user.accessToken;
      return refresh(user);
    },
    dropToken: () => { tokens.delete(user.sub); user.accessToken = undefined; },
  };
}

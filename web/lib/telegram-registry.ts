import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { appendRows, onSiteSheet, readRows, serialPerSheet, writeRow, type TabSpec } from './sheets.ts';
import { open, seal } from './token-box.ts';
import { emptyState, type NotifyState } from './notify.ts';

// One row per user who tapped "Connect Telegram", in the owner's Sheet; the 15-minute job reads it.
export const REGISTRY: TabSpec = {
  title: 'telegram_users',
  columns: ['google_id', 'sheet_id', 'refresh_token', 'chat_id', 'link_code_hash', 'link_expires', 'alert_state', 'updated_at'],
};
export const LINK_TTL_MS = 10 * 60_000;
// A new link at most every 30 s per user, so one account cannot burn the owner's Sheets quota.
export const LINK_COOLDOWN_MS = 30_000;

export class LinkTooSoon extends Error {}
// 16 random bytes as base64url: 22 characters, inside Telegram's /start limit (A-Z a-z 0-9 _ -, up to 64).
export const LINK_CODE_RE = /^[A-Za-z0-9_-]{22}$/;

export interface Member { row: number; googleId: string; sheetId: string; sealedToken: string; chatId: string; codeHash: string; codeExpires: string; state: NotifyState }
export interface Joining { sub: string; sheetId: string; refreshToken?: string }

const serial = serialPerSheet();
const hash = (code: string) => createHash('sha256').update(code).digest('hex');
const sameHash = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

function parseState(raw: string | undefined): NotifyState {
  try { return { ...emptyState(), ...(raw ? JSON.parse(raw) : {}) }; } catch { return emptyState(); }
}

async function members(): Promise<Member[]> {
  const rows = await readRows(REGISTRY);
  return rows.map((r, i) => ({
    row: i + 2, googleId: r[0] ?? '', sheetId: r[1] ?? '', sealedToken: r[2] ?? '', chatId: r[3] ?? '',
    codeHash: r[4] ?? '', codeExpires: r[5] ?? '', state: parseState(r[6]),
  })).filter((m) => m.googleId);
}

const toRow = (m: Omit<Member, 'row'>): string[] =>
  [m.googleId, m.sheetId, m.sealedToken, m.chatId, m.codeHash, m.codeExpires, JSON.stringify(m.state), new Date().toISOString()];

// Every registry call runs on the owner's Sheet, one write at a time.
const onRegistry = <T>(work: () => Promise<T>): Promise<T> => onSiteSheet(() => serial(work));

export const connectedMembers = (): Promise<Member[]> => onSiteSheet(async () => (await members()).filter((m) => m.chatId && m.sealedToken));

export const refreshTokenOf = (m: Member): string => open(m.sealedToken, m.googleId);

// A new code replaces the user's older one. The row keeps the chat id and alert state it already has.
export const startLink = (user: Joining, now = Date.now()) => onRegistry(async () => {
  if (!user.refreshToken) throw new Error('No Google refresh token in the session; sign in again');
  const code = randomBytes(16).toString('base64url');
  const found = (await members()).find((m) => m.googleId === user.sub);
  if (found?.codeExpires && Date.parse(found.codeExpires) - LINK_TTL_MS > now - LINK_COOLDOWN_MS) throw new LinkTooSoon('A link was made a moment ago.');
  const next = {
    googleId: user.sub, sheetId: user.sheetId, sealedToken: seal(user.refreshToken, user.sub), chatId: found?.chatId ?? '',
    codeHash: hash(code), codeExpires: new Date(now + LINK_TTL_MS).toISOString(), state: found?.state ?? emptyState(),
  };
  if (found) await writeRow(found.row, toRow(next), REGISTRY);
  else await appendRows([toRow(next)], REGISTRY);
  return { code, expiresAt: next.codeExpires };
});

// /start <code> from the bot: single use, unexpired. Returns false for any other code.
export const claimLink = (code: string, chatId: string, now = Date.now()) => onRegistry(async () => {
  if (!LINK_CODE_RE.test(code)) return false;
  const h = hash(code);
  const found = (await members()).find((m) => m.codeHash && sameHash(m.codeHash, h));
  if (!found || !(Date.parse(found.codeExpires) > now)) return false;
  await writeRow(found.row, toRow({ ...found, chatId, codeHash: '', codeExpires: '' }), REGISTRY);
  return true;
});

export const linkStatus = (sub: string) => onSiteSheet(async () => {
  const m = (await members()).find((x) => x.googleId === sub && !!x.chatId && !!x.sealedToken);
  return { connected: !!m, paused: !!m?.state.signInAsked };
});

// Disconnect blanks the row (token, chat, state) but keeps its place, so other rows never shift under a concurrent write.
export const removeMember = (sub: string) => onRegistry(async () => {
  const found = (await members()).find((m) => m.googleId === sub);
  if (found) await writeRow(found.row, toRow({ googleId: sub, sheetId: '', sealedToken: '', chatId: '', codeHash: '', codeExpires: '', state: emptyState() }), REGISTRY);
  return { disconnected: true };
});

// A new Google sign-in re-saves the token for a connected user, so alerts paused by an ended sign-in resume by themselves.
export const renewMemberToken = (user: Joining) => onRegistry(async () => {
  if (!user.refreshToken) return;
  const found = (await members()).find((m) => m.googleId === user.sub && !!m.chatId);
  if (!found) return;
  await writeRow(found.row, toRow({ ...found, sheetId: user.sheetId, sealedToken: seal(user.refreshToken, user.sub), state: { ...found.state, signInAsked: undefined, lastError: null } }), REGISTRY);
});

// The job saves each user's "already sent" list after its run. A row that moved or went meanwhile is skipped.
export const saveMemberState = (m: Member, state: NotifyState) => onRegistry(async () => {
  const now = (await members()).find((x) => x.googleId === m.googleId);
  if (now) await writeRow(now.row, toRow({ ...now, state }), REGISTRY);
});

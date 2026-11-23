import { timingSafeEqual } from 'node:crypto';
import { claimLink, linkStatus, LinkTooSoon, removeMember, startLink } from './telegram-registry.ts';
import { sendMessage } from './telegram.ts';
import { RouteRefusal, telegramUserRoute } from './telegram-http.ts';

// A one-time link to the bot: the user taps Start in Telegram, the webhook saves their chat.
export const linkPost = (request: Request) => telegramUserRoute(request, 'link', async (user) => {
  if (!user.refreshToken) throw new RouteRefusal(401, 'Sign in with Google again, then tap Connect Telegram.');
  const { code, expiresAt } = await startLink(user).catch((e: unknown) => { throw e instanceof LinkTooSoon ? new RouteRefusal(429, 'Wait a few seconds, then tap Connect Telegram again.') : e; });
  return { url: `https://t.me/${process.env.TELEGRAM_BOT_USERNAME}?start=${code}`, expiresAt };
});
export const linkDelete = (request: Request) => telegramUserRoute(request, 'disconnect', (user) => removeMember(user.sub));
export const statusGet = (request: Request) => telegramUserRoute(request, 'status', (user) => linkStatus(user.sub));

const MAX_BYTES = 10_000;
const ok = () => new Response(null, { status: 200 });
const CONNECTED = 'Connected ✅ Your DSE Trade Helper alerts come here on trading days. Learning aid, not investment advice.';
const UNKNOWN = 'This link has expired or was already used. Open Portfolio on the site and tap Connect Telegram again.';

// At most one /start per chat every 5 s and 60 per minute per server, so bot spam cannot use up the owner's Sheets quota.
const CHAT_GAP_MS = 5_000, MINUTE_CAP = 60;
const lastByChat = new Map<number, number>();
let minute = { start: 0, count: 0 };
function allowStart(chatId: number, now = Date.now()): boolean {
  if (now - minute.start > 60_000) minute = { start: now, count: 0 };
  if (minute.count >= MINUTE_CAP || now - (lastByChat.get(chatId) ?? 0) < CHAT_GAP_MS) return false;
  if (lastByChat.size > 1_000) lastByChat.clear();
  lastByChat.set(chatId, now);
  minute.count++;
  return true;
}

function secretMatches(given: string | null): boolean {
  const want = process.env.TELEGRAM_WEBHOOK_SECRET ?? '';
  if (!want || !given) return false;
  const a = Buffer.from(given), b = Buffer.from(want);
  return a.length === b.length && timingSafeEqual(a, b);
}

interface Update { message?: { chat?: { id?: number; type?: string }; text?: string } }

// Telegram's setWebhook secret_token arrives in this header; anything without it is not from Telegram.
export async function webhookPost(request: Request): Promise<Response> {
  if (!secretMatches(request.headers.get('x-telegram-bot-api-secret-token'))) return new Response(null, { status: 401 });
  const text = await request.text();
  if (Buffer.byteLength(text) > MAX_BYTES) return ok();
  let update: Update;
  try { update = JSON.parse(text) as Update; } catch { return ok(); }
  const chat = update.message?.chat;
  const start = /^\/start(?:@\w+)?\s+(\S+)$/.exec(update.message?.text?.trim() ?? '');
  // Private chats only, so a group can never receive one person's alerts. Other messages are ignored.
  if (!start || chat?.type !== 'private' || typeof chat.id !== 'number' || !allowStart(chat.id)) return ok();
  try {
    const linked = await claimLink(start[1], String(chat.id));
    await sendMessage(linked ? CONNECTED : UNKNOWN, fetch, String(chat.id));
  } catch (e) {
    console.error('telegram webhook: link failed', e);
  }
  // Always 200: Telegram retries a failed update, and a retry cannot fix a bad code.
  return ok();
}

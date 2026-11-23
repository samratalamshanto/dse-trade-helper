// core.telegram.org/bots/api (2026-11-20): disable_web_page_preview is gone; link_preview_options.is_disabled replaces it.
import net from 'node:net';

// Measured 2026-11-20: the TLS handshake to api.telegram.org takes 4-11 s on this network and a send up to 20 s.
const TIMEOUT_MS = 30_000;
// Process-wide: Node's default 250 ms per connection attempt fails here before the TCP connect (about 440 ms) finishes.
net.setDefaultAutoSelectFamilyAttemptTimeout(3_000);
export const OFF_TEXT = 'Telegram alerts are off: set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID in web/.env.local, then restart the server.';

export const telegramEnabled = (): boolean => !!process.env.TELEGRAM_BOT_TOKEN && !!process.env.TELEGRAM_CHAT_ID;

// HTML parse mode: every <, > and & outside a tag must be an entity.
export const escapeHtml = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export interface SendResult { ok: boolean; error?: string }

// Fixed, user-facing reasons; Telegram's own wording goes to the server log only.
function refusalText(status: number): string {
  if (status === 401 || status === 404) return 'Telegram rejected the bot token. Check TELEGRAM_BOT_TOKEN in web/.env.local.';
  if (status === 400 || status === 403) return 'Telegram could not deliver to that chat. Send your bot a message first and check TELEGRAM_CHAT_ID.';
  if (status === 429) return 'Telegram asked us to slow down. Try again in a minute.';
  return 'Telegram did not accept the message. Try again later.';
}

// chatId: the owner's chat by default; a connected user's chat for per-user alerts (lib/notify-members.ts).
export async function sendMessage(text: string, fetchImpl: typeof fetch = fetch, chatId: string = process.env.TELEGRAM_CHAT_ID ?? ''): Promise<SendResult> {
  const token = process.env.TELEGRAM_BOT_TOKEN ?? '';
  if (!token || !chatId) return { ok: false, error: OFF_TEXT };
  const post = () => fetchImpl(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML', link_preview_options: { is_disabled: true } }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  // The token is part of the URL, so a raw fetch error may carry it; only a redacted copy is logged or returned.
  const clean = (e: unknown) => new Error(String((e as Error)?.message ?? e).replaceAll(token, '<token>').replaceAll(encodeURIComponent(token), '<token>'));
  let res: Response;
  try {
    res = await post().catch((e: unknown) => ((e as Error)?.name === 'TimeoutError' ? Promise.reject(e) : post())); // retry once only if it never connected: a timed-out POST may already be delivered
  } catch (e) {
    const err = clean(e);
    console.error('telegram: sendMessage could not reach Telegram', err);
    return { ok: false, error: 'Could not reach Telegram. Check the internet connection and try again.' };
  }
  const body = (await res.json().catch(() => null)) as { ok?: boolean; description?: string } | null;
  if (body?.ok) return { ok: true };
  const err = clean(`Telegram refused the message (HTTP ${res.status}): ${body?.description ?? 'no reason given'}`);
  console.error('telegram: sendMessage failed', err);
  return { ok: false, error: refusalText(res.status) };
}

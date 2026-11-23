// Run by .github/workflows/notify.yml every 15 minutes: the owner's alerts, then every connected user's.
import { dhakaClock, inMarketWindow, runNotifier } from '../lib/notify.ts';
import { runMembers } from '../lib/notify-members.ts';
import { telegramEnabled } from '../lib/telegram.ts';
import { tokenBoxReady } from '../lib/token-box.ts';

const membersReady = !!process.env.TELEGRAM_BOT_TOKEN && tokenBoxReady() && !!process.env.GOOGLE_SHEET_ID && !!process.env.AUTH_GOOGLE_ID;
if (!membersReady) console.warn('notify-once: user alerts skipped: TELEGRAM_BOT_TOKEN, TOKEN_ENC_KEY, GOOGLE_SHEET_ID or AUTH_GOOGLE_ID is missing');
if (!telegramEnabled() && !membersReady) { console.error('notify-once: set TELEGRAM_BOT_TOKEN with TELEGRAM_CHAT_ID (owner) or TOKEN_ENC_KEY + AUTH_GOOGLE_* (users)'); process.exit(1); }
const clock = dhakaClock(Date.now());
if (!inMarketWindow(clock)) { console.log(`notify-once: outside market hours (${clock.date}, minute ${clock.minutes}); nothing to check`); process.exit(0); }
let failed = false;
if (telegramEnabled()) {
  const owner = await runNotifier().catch((e: unknown) => { failed = true; console.error('notify-once: owner alerts failed', e); return null; });
  if (owner) console.log(`notify-once: owner sent ${owner.sent}, pending ${owner.pending}`);
}
if (membersReady) {
  const users = await runMembers().catch((e: unknown) => { failed = true; console.error('notify-once: user alerts failed', e); return null; });
  if (users) console.log(`notify-once: ${users.users} users, sent ${users.sent}, failed ${users.failed}`);
}
if (failed) process.exitCode = 1;

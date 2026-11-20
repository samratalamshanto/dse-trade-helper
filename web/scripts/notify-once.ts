// Run by .github/workflows/notify.yml every 15 minutes: one alert check, same rules as the laptop server's 5-minute timer.
import { dhakaClock, inMarketWindow, runNotifier } from '../lib/notify.ts';
import { telegramEnabled } from '../lib/telegram.ts';

if (!telegramEnabled()) { console.error('notify-once: TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID secret is missing'); process.exit(1); }
const clock = dhakaClock(Date.now());
if (!inMarketWindow(clock)) { console.log(`notify-once: outside market hours (${clock.date}, minute ${clock.minutes}); nothing to check`); process.exit(0); }
const result = await runNotifier();
console.log(`notify-once: sent ${result.sent}, pending ${result.pending}`);

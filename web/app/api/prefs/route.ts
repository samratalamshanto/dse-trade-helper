import { PREFS_BODY_MAX_BYTES } from '@/lib/prefs';
import { readPrefs, savePrefs } from '@/lib/trades-service';
import { readJson, tradesRoute } from '@/lib/trades-http';

export const dynamic = 'force-dynamic';

// Watchlist, broker rate and alert rules in the owner's Sheet; the trades key is required, like trades and plans.
export function GET(request: Request) {
  return tradesRoute(request, 'read preferences', () => readPrefs());
}

export function PUT(request: Request) {
  return tradesRoute(request, 'save preferences', async () => savePrefs(await readJson(request, PREFS_BODY_MAX_BYTES)));
}

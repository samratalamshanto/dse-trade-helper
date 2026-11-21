import { accountFromBody, bodyObject, settingsFromBody, tradesFromBody } from '@/lib/browser-data';
import { BROWSER_JSON_MAX_BYTES, browserRoute, readJson } from '@/lib/trades-http';
import { valueTrades } from '@/lib/trades-service';

export const dynamic = 'force-dynamic';
export const maxDuration = 10;

// Browser mode: {trades, settings, account} → the same list GET /api/trades returns for the Sheet.
export function POST(request: Request) {
  return browserRoute(request, 'portfolio value', async () => {
    const body = bodyObject(await readJson(request, BROWSER_JSON_MAX_BYTES));
    const account = accountFromBody(body.account);
    return valueTrades(tradesFromBody(body.trades, account), settingsFromBody(body.settings), account);
  });
}

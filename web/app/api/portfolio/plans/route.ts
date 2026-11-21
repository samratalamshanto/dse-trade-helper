import { bodyObject, plansFromBody, tradesFromBody } from '@/lib/browser-data';
import { plansWithStatus } from '@/lib/planner-service';
import { BROWSER_JSON_MAX_BYTES, browserRoute, readJson } from '@/lib/trades-http';

export const dynamic = 'force-dynamic';
export const maxDuration = 10;

// Browser mode: {plans, trades} → the same list GET /api/plans returns; "bought" counts real-account buys only.
export function POST(request: Request) {
  return browserRoute(request, 'portfolio plans', async () => {
    const body = bodyObject(await readJson(request, BROWSER_JSON_MAX_BYTES));
    return plansWithStatus(plansFromBody(body.plans), tradesFromBody(body.trades, 'real'));
  });
}

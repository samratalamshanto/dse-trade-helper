import { respond } from '@/lib/http';
import { MarketOpenError, takeSnapshot } from '@/lib/scorecard-store';
import { hasTradesKey } from '@/lib/trades-http';

export const dynamic = 'force-dynamic';

// Manual trigger for testing; the daily snapshot runs on its own from instrumentation.ts.
export async function POST(request: Request) {
  if (!hasTradesKey(request)) return Response.json({ error: 'Send the trades key to take a snapshot.' }, { status: 401, headers: { 'Cache-Control': 'no-store' } });
  return respond('scorecard snapshot', async () => {
    try { return await takeSnapshot(); } catch (e) {
      if (e instanceof MarketOpenError) return { error: e.message, taken: false };
      throw e;
    }
  });
}

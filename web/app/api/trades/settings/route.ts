import { saveLimits } from '@/lib/trades-service';
import { readJson, tradesRoute } from '@/lib/trades-http';

export const dynamic = 'force-dynamic';

export function PUT(request: Request) {
  return tradesRoute(request, 'save settings', async () => saveLimits(await readJson(request)));
}

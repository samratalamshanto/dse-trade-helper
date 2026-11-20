import { addTrade, listTrades } from '@/lib/trades-service';
import { readJson, tradesRoute } from '@/lib/trades-http';

export const dynamic = 'force-dynamic';

export function GET(request: Request) {
  return tradesRoute(request, 'list', listTrades);
}

export function POST(request: Request) {
  return tradesRoute(request, 'add', async () => addTrade(await readJson(request)));
}

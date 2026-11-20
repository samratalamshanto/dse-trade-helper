import { addTrade, listTrades, TradeInputError } from '@/lib/trades-service';
import { readJson, tradesRoute } from '@/lib/trades-http';

export const dynamic = 'force-dynamic';

export function GET(request: Request) {
  const account = new URL(request.url).searchParams.get('account') ?? 'real';
  return tradesRoute(request, 'list', async () => {
    if (account !== 'real' && account !== 'paper') throw new TradeInputError('Account must be real or paper.');
    return listTrades(account);
  });
}

export function POST(request: Request) {
  return tradesRoute(request, 'add', async () => addTrade(await readJson(request)));
}

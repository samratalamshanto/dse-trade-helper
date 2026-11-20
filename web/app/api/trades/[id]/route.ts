import { deleteTrade, TradeInputError, updateTrade } from '@/lib/trades-service';
import { readJson, TRADE_ID_RE, tradesRoute } from '@/lib/trades-http';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

async function tradeId(ctx: Ctx): Promise<string> {
  const { id } = await ctx.params;
  if (!TRADE_ID_RE.test(id)) throw new TradeInputError('Invalid trade id.');
  return id;
}

export function PUT(request: Request, ctx: Ctx) {
  return tradesRoute(request, 'update', async () => updateTrade(await tradeId(ctx), await readJson(request)));
}

export function DELETE(request: Request, ctx: Ctx) {
  return tradesRoute(request, 'delete', async () => { await deleteTrade(await tradeId(ctx)); return { deleted: true }; });
}

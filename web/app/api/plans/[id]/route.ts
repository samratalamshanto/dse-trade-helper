import { deletePlan, updatePlan } from '@/lib/planner-service';
import { readJson, TRADE_ID_RE, tradesRoute } from '@/lib/trades-http';
import { TradeInputError } from '@/lib/trades-service';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

async function planId(ctx: Ctx): Promise<string> {
  const { id } = await ctx.params;
  if (!TRADE_ID_RE.test(id)) throw new TradeInputError('Invalid plan id.');
  return id;
}

export function PUT(request: Request, ctx: Ctx) {
  return tradesRoute(request, 'update plan', async () => updatePlan(await planId(ctx), await readJson(request)));
}

export function DELETE(request: Request, ctx: Ctx) {
  return tradesRoute(request, 'delete plan', async () => { await deletePlan(await planId(ctx)); return { deleted: true }; });
}

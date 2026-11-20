import { addPlan, listPlans } from '@/lib/planner-service';
import { readJson, tradesRoute } from '@/lib/trades-http';

export const dynamic = 'force-dynamic';

export function GET(request: Request) {
  return tradesRoute(request, 'plans', listPlans);
}

export function POST(request: Request) {
  return tradesRoute(request, 'add plan', async () => addPlan(await readJson(request)));
}

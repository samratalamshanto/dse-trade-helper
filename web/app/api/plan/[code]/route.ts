import { badRequest, codeParam, respond } from '@/lib/http';
import { buyPlanFor } from '@/lib/planner-service';
import { hasTradesKey } from '@/lib/trades-http';

export const dynamic = 'force-dynamic';

// ?qty=10 or ?budget=20000; with the trades key it also uses the caller's holding.
export async function GET(request: Request, { params }: { params: Promise<{ code: string }> }) {
  const code = codeParam((await params).code);
  if (!code) return badRequest();
  return respond(`plan ${code}`, () => buyPlanFor(code, new URL(request.url).searchParams, hasTradesKey(request)));
}

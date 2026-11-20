import { notifyStatus } from '@/lib/notify';
import { tradesRoute } from '@/lib/trades-http';

export const dynamic = 'force-dynamic';

export function GET(request: Request) {
  return tradesRoute(request, 'notify status', async () => notifyStatus());
}

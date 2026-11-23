import { sendMessage } from '@/lib/telegram';
import { tradesRoute } from '@/lib/trades-http';

export const dynamic = 'force-dynamic';

export function POST(request: Request) {
  return tradesRoute(request, 'notify test', async () => {
    const r = await sendMessage('Trade Helper is connected ✅');
    return { sent: r.ok, ...(r.error ? { error: r.error } : {}) };
  }, { ownerOnly: true });
}

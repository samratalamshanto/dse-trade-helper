import { importOrderSummary } from '@/lib/trades-service';
import { readImportForm, tradesRoute } from '@/lib/trades-http';

export const dynamic = 'force-dynamic';

export function POST(request: Request) {
  return tradesRoute(request, 'import', async () => {
    const f = await readImportForm(request);
    return importOrderSummary(f.data, f.fileName, f.date, f.save, f.commissionPct);
  });
}

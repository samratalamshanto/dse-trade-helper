import { browserRoute, readImportForm } from '@/lib/trades-http';
import { parseBrokerFile } from '@/lib/trades-service';

export const dynamic = 'force-dynamic';
export const maxDuration = 10;

// Browser mode: reads the broker file and returns its trades; nothing is saved here (the browser skips ones it already has).
export function POST(request: Request) {
  return browserRoute(request, 'portfolio import', async () => {
    const f = await readImportForm(request);
    return parseBrokerFile(f.data, f.fileName, f.date, f.commissionPct);
  });
}

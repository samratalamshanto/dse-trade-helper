import { respond } from '@/lib/http';
import { scorecardReport } from '@/lib/scorecard-store';

export const dynamic = 'force-dynamic';

export function GET() {
  return respond('scorecard', async () => scorecardReport());
}

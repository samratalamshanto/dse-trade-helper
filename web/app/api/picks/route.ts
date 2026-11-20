import { respond } from '@/lib/http';
import { picksFor } from '@/lib/planner-service';

export const dynamic = 'force-dynamic';

export function GET(request: Request) {
  return respond('picks', () => picksFor(new URL(request.url).searchParams));
}

import { snapshot } from '@/lib/dse';
import { respond } from '@/lib/http';

export const dynamic = 'force-dynamic';

export function GET() {
  return respond('snapshot', snapshot);
}

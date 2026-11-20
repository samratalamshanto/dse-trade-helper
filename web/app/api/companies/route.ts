import { listCompanies } from '@/lib/service';
import { respond } from '@/lib/http';

export const dynamic = 'force-dynamic';

export function GET() {
  return respond('companies', listCompanies);
}

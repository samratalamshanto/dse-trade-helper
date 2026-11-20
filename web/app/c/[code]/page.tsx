import { notFound } from 'next/navigation';
import { CompanyView } from '@/components/company/CompanyView';
import { livePrices } from '@/lib/dse';
import { codeParam } from '@/lib/http';
import { allCompanies } from '@/lib/store';

// Unknown or malformed codes get a real HTTP 404; when DSE cannot be reached the page still renders and shows its own error.
export default async function CompanyPage({ params }: { params: Promise<{ code: string }> }) {
  const code = codeParam((await params).code.trim());
  if (!code) notFound();
  if (!allCompanies()[code]) {
    const live = await livePrices().catch((err: unknown) => {
      console.warn(`company page ${code}: live list unavailable, skipping the 404 check`, err);
      return null;
    });
    if (live && !(code in live)) notFound();
  }
  return <CompanyView key={code} code={code} />;
}

import { companyDetail } from '@/lib/service';
import { badRequest, codeParam, respond } from '@/lib/http';

export const dynamic = 'force-dynamic';

export async function GET(request: Request, { params }: { params: Promise<{ code: string }> }) {
  const code = codeParam((await params).code);
  if (!code) return badRequest();
  const fresh = new URL(request.url).searchParams.get('fresh') === '1';
  return respond(`company ${code}`, () => companyDetail(code, fresh));
}

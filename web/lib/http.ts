import { NotFoundError } from './store.ts';
import { UpstreamError } from './dse.ts';

import { CODE_RE } from './dhaka.ts';

export function codeParam(raw: string): string | null {
  let code: string;
  try { code = decodeURIComponent(raw).toUpperCase(); } catch { return null; }
  return CODE_RE.test(code) ? code : null;
}

const json = (status: number, body: unknown) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

// One error policy for every API route: 404 for an unknown company, 502 when DSE fails, 500 for a fault in this app.
export async function respond(label: string, work: () => Promise<unknown>): Promise<Response> {
  try {
    return json(200, await work());
  } catch (e) {
    if (e instanceof NotFoundError) return json(404, { error: 'No company with that trade code on DSE.' });
    if (e instanceof UpstreamError) {
      console.error(`api ${label} failed: DSE is not available`, e);
      return json(502, { error: 'Live DSE data is not available now. Try again later.' });
    }
    console.error(`api ${label} failed`, e);
    return json(500, { error: 'Something went wrong on this site. Try again later.' });
  }
}

export const badRequest = () => json(400, { error: 'Invalid trade code' });

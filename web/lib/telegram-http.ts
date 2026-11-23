import { signedInUser } from './session-sheet.ts';
import type { SignedIn } from './google-user.ts';
import { tokenBoxReady } from './token-box.ts';

export class RouteRefusal extends Error {
  readonly status: number;
  constructor(status: number, message: string) { super(message); this.status = status; }
}

const json = (status: number, body: unknown) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

export const telegramForUsersReady = (): boolean =>
  !!process.env.TELEGRAM_BOT_TOKEN && !!process.env.TELEGRAM_BOT_USERNAME && tokenBoxReady() && !!process.env.GOOGLE_SHEET_ID;

// Connect, status and disconnect: the signed-in Google user only, same-site pages only.
export async function telegramUserRoute(request: Request, label: string, work: (user: SignedIn) => Promise<unknown>): Promise<Response> {
  const site = request.headers.get('sec-fetch-site');
  if (site && site !== 'same-origin' && site !== 'none') return json(403, { error: 'Open this site to connect Telegram.' });
  try {
    const user = await signedInUser(request);
    if (!user) return json(401, { error: 'Sign in with Google first to connect Telegram.' });
    if (!telegramForUsersReady()) return json(503, { error: 'Telegram alerts are not set up on this site yet.' });
    return json(200, await work(user));
  } catch (e) {
    if (e instanceof RouteRefusal) return json(e.status, { error: e.message });
    console.error(`telegram ${label} failed`, e);
    return json(502, { error: 'Could not reach the Telegram list. Try again in a minute.' });
  }
}

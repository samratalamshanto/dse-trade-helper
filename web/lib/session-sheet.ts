import { getToken } from 'next-auth/jwt';
import { userTarget, type SignedIn } from './google-user.ts';
import type { SheetTarget } from './sheets.ts';

// The signed-in user, read only from the encrypted session cookie; never from a request field.
export async function signedInUser(request: Request): Promise<SignedIn | null> {
  if (!process.env.AUTH_SECRET || !process.env.AUTH_GOOGLE_ID) return null;
  // Auth.js names the cookie __Secure-… on https; behind a proxy request.url may not say https, so both names are tried.
  const read = (secureCookie: boolean) => getToken({ req: request, secret: process.env.AUTH_SECRET, secureCookie });
  const t = (await read(true)) ?? (await read(false));
  if (!t?.sub || !t.sheetId) return null;
  return { sub: t.sub, sheetId: t.sheetId, refreshToken: t.refreshToken, accessToken: t.accessToken, expiresAt: t.expiresAt };
}

export async function signedInSheet(request: Request): Promise<SheetTarget | null> {
  const user = await signedInUser(request);
  return user ? userTarget(user) : null;
}

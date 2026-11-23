import NextAuth from 'next-auth';
import Google from 'next-auth/providers/google';
import { findOrCreateSheet, sheetUrl } from './lib/google-user.ts';

// Google sign-in. No database: the encrypted session cookie (JWT) holds the Google id, the user's Sheet id and the refresh token.
// The session the browser can read: name, email, picture and the link to the user's own Sheet; tokens never leave the server.
export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [Google({
    authorization: { params: { scope: 'openid email profile https://www.googleapis.com/auth/drive.file', access_type: 'offline', prompt: 'consent' } },
  })],
  // 7 days, as long as Google keeps a Testing-mode refresh token; a stolen cookie stops working sooner.
  session: { strategy: 'jwt', maxAge: 7 * 24 * 60 * 60 },
  callbacks: {
    async jwt({ token, account }) {
      if (account?.provider !== 'google') return token;
      if (!account.access_token) throw new Error('Google sign-in returned no access token');
      return {
        ...token,
        sub: account.providerAccountId,
        sheetId: await findOrCreateSheet(account.access_token),
        accessToken: account.access_token,
        expiresAt: account.expires_at,
        // Google sends a refresh token only with consent; keep the old one when none comes.
        refreshToken: account.refresh_token ?? token.refreshToken,
      };
    },
    session({ session, token }) {
      return { ...session, sheetUrl: sheetUrl(token.sheetId) };
    },
  },
});

declare module 'next-auth' {
  interface Session { sheetUrl?: string }
}

declare module 'next-auth/jwt' {
  interface JWT { sheetId?: string; accessToken?: string; expiresAt?: number; refreshToken?: string }
}

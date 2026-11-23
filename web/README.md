# DSE Trade Helper

A learning aid for the Dhaka Stock Exchange (DSE): market dashboard, company checks, watchlist, buy plans, portfolio and Telegram alerts. It is not investment advice.

Live: <https://dse-trade-helper.vercel.app/>

## Contents
- Run it on your computer
- Where your data is kept
- Set up Google sign-in
- Environment variables
- Tests
- Deploy on Vercel
- Code map

## Run it on your computer

```bash
cd web
npm install
# write .env.local first, see "Environment variables"
npm run dev                         # http://localhost:3000
```

`../start-dse.sh` starts the dev server in the background and opens the browser. `../stop-dse.sh` stops it.

## Where your data is kept

The app has three modes. The page picks one by itself.

| Mode | Who | Data is in | How it starts |
|---|---|---|---|
| Browser | Anyone, not signed in | This browser only (`localStorage`) | Default |
| Google sign-in | Anyone with a Google account | A Sheet named **DSE Trade Helper** in the user's own Google Drive | Portfolio → "Sync with my Google Sheet" → **Continue with Google** |
| Owner key | The site owner | The owner's Sheet, through a service account | Same panel → "Site owner: sync password" |

How Google sign-in works:
1. The user signs in. Google asks for name, email and access to the files this app makes (`drive.file`). The app cannot see any other file in the Drive.
2. The app looks for a Sheet it made earlier (marked with a private Drive property `dseTradeHelper=1`). It uses that Sheet, or it makes a new one.
3. The Sheet id and the Google refresh token are kept in the encrypted sign-in cookie. No database is used.

```
GET /api/trades   (cookie: authjs.session-token=…)
→ 200 {"account":"real","trades":[…],"holdings":[…]}     reads the signed-in user's own Sheet
→ 401 {"error":"Sign in with Google again to reach your Sheet."}   when Google refuses the refresh token
```

Telegram alerts (the 15-minute job) still go to the owner's chat only. They do not read signed-in users' Sheets yet. See `../release-plan/topics/2026-11-22-google-sign-in/plan.md` for the next steps.

## Set up Google sign-in

Do this once in [Google Cloud Console](https://console.cloud.google.com/).

1. Make a project (or use the one that owns the service account).
2. **APIs & Services → Library:** turn on **Google Sheets API** and **Google Drive API**.
3. **APIs & Services → OAuth consent screen:**
   - User type: **External**.
   - App name `DSE Trade Helper`, your support email, the privacy policy URL.
   - Scopes: `openid`, `email`, `profile`, `https://www.googleapis.com/auth/drive.file`.
   - While the app is in **Testing**, add each Google account that may sign in under **Test users**.
4. **APIs & Services → Credentials → Create credentials → OAuth client ID:**
   - Type: **Web application**.
   - Authorized redirect URIs, one line each:
     ```
     http://localhost:3000/api/auth/callback/google
     https://dse-trade-helper.vercel.app/api/auth/callback/google
     ```
   - Google accepts only exact matches. Vercel preview links change on each deploy, so sign-in works only on the domains listed here.
5. Copy the **Client ID** and **Client secret** into `AUTH_GOOGLE_ID` and `AUTH_GOOGLE_SECRET` (below).
6. Make `AUTH_SECRET`: `openssl rand -base64 33`. It encrypts the sign-in cookie. Keep it secret; changing it signs everybody out.

## Environment variables

Put them in `web/.env.local` for local runs, and in Vercel → Project → Settings → Environment Variables for the live site.

| Name | Needed for | Example |
|---|---|---|
| `AUTH_SECRET` | Google sign-in | output of `openssl rand -base64 33` |
| `AUTH_GOOGLE_ID` | Google sign-in | `1234-abc.apps.googleusercontent.com` |
| `AUTH_GOOGLE_SECRET` | Google sign-in | `GOCSPX-…` |
| `GOOGLE_SHEET_ID` | Owner key mode, alert job | id from the owner's Sheet URL |
| `GOOGLE_SERVICE_ACCOUNT_FILE` or `GOOGLE_SERVICE_ACCOUNT_JSON` | Owner key mode, alert job | path to the key file, or its JSON |
| `TRADES_API_KEY` | Owner key mode | 32+ random characters |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` | Telegram alerts | see `docs/telegram-setup.md` |

- Without the three `AUTH_*` values, the Google button does not work, and browser mode and owner key mode work as before.
- `npm start` (production mode) off Vercel also needs `AUTH_URL=http://localhost:3000` or `AUTH_TRUST_HOST=true`. Vercel does not need it.

## Tests

```bash
npm test          # unit tests (node --test), includes test/google-sign-in.test.ts
npm run test:fuzz # property and HTTP fuzz tests
npm run e2e       # Playwright, needs the dev server
npm run lint
npm run build
```

`test/google-sign-in.test.ts` checks that two users never share a Sheet or a token, that a Sheet id in the request is ignored, that a cross-site request with the cookie is refused, and that a revoked Google grant asks the user to sign in again.

## Deploy on Vercel

1. Push to `main` on GitHub. Vercel builds and deploys `web/`.
2. Set the environment variables above for **Production**.
3. Add the production domain's redirect URI in the Google OAuth client (step 4 above).

The daily data scan and the 15-minute alert job run in GitHub Actions (`../.github/workflows/`), not on Vercel.

## Code map

| Path | What it does |
|---|---|
| `auth.ts` | Auth.js setup: Google provider, `drive.file` scope, finds or makes the user's Sheet at sign-in |
| `app/api/auth/[...nextauth]/route.ts` | Sign-in, callback and sign-out endpoints |
| `lib/session-sheet.ts` | Reads the signed-in user's Sheet from the encrypted cookie |
| `lib/google-user.ts` | Drive search and create, per-user access token refresh |
| `lib/sheets.ts` | Google Sheets calls; `withSheet()` picks the user's Sheet or the owner's |
| `lib/trades-http.ts` | `tradesRoute()`: signed-in user first, else the owner key |
| `components/portfolio-store.ts` | Browser or Sheet mode in the page |
| `components/portfolio/SyncPanel.tsx` | Continue with Google, sign out, owner password |

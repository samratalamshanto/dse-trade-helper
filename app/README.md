# DSE Trade Helper — mobile app (Expo)

The app reads all market data from the web app's API (`../web`); it never scrapes DSE itself.

## Run

1. Start the web app: `cd ../web && npm run dev` (port 3000).
2. Create `app/.env` (git-ignored):
   ```
   EXPO_PUBLIC_API_URL=http://<your-PC-LAN-IP>:3000
   EXPO_PUBLIC_TRADES_KEY=<same value as TRADES_API_KEY in web/.env.local>
   ```
3. `npm install`, then `npx expo start` and open it in Expo Go on a phone on the same Wi-Fi.

## Checks

- `npm test` (node --test), `npx tsc --noEmit`, `npm run lint`
- Android UI flows: `sh e2e/maestro/run.sh` (Maestro, emulator or USB phone) — see `e2e/maestro/README.md`.

## Security: keep app builds private

Every `EXPO_PUBLIC_*` value is copied into the app bundle. Anyone who gets the APK can read
`EXPO_PUBLIC_TRADES_KEY` and use it to read or change the trades in your Google Sheet.

- Never publish or share a build that contains the key (no Play Store, no shared APK).
- If a build leaks, generate a new `TRADES_API_KEY` in `web/.env.local` (and in Vercel) and update `app/.env`.
- Before any shared build, replace the env key with an on-device key entry stored in `expo-secure-store`.
- The Google service-account key is never in the app; only the web server holds it.

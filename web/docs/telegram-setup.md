# Telegram alerts — setup

DSE Trade Helper can send alerts to your phone through a Telegram bot that you own. You do not need a custom app. The alerts are a learning aid, not investment advice.

## What you get

- A buy plan reaches its target price, or a plan ends tomorrow.
- A holding's position check changes to "Review — consider selling" or "Take profit".
- Today or tomorrow is the last day to buy a held company for its dividend.
- A morning summary at 09:45 Dhaka time on trading days (Sunday to Thursday): holdings value, today's profit or loss, buy plans, and the top 3 picks to research.

The server checks every 5 minutes from 09:30 to 15:00 Dhaka time on trading days. It sends each alert one time only. It sends nothing between 22:00 and 08:00.

## Step 1 — Make the bot

1. Open Telegram on your phone and search for **@BotFather** (it has a blue check mark).
2. Tap **Start**, then send `/newbot`.
3. Type a name for the bot, for example `My DSE Helper`.
4. Type a username that ends in `bot`, for example `my_dse_helper_bot`.
5. BotFather replies with a **token**. It looks like `123456789:AAH...` (numbers, a colon, then letters).
6. Copy the token. Keep it secret: anyone with the token can send messages as your bot.

## Step 2 — Send your bot one message

1. In BotFather's reply, tap the link to your bot (`t.me/<your bot username>`).
2. Tap **Start**, then send any message, for example `hi`.

The bot can only write to you after you write to it first.

## Step 3 — Find your chat id

1. Open this address in a browser on your computer. Put your own token in place of `<TOKEN>`. Keep the word `bot` in front of it:

   `https://api.telegram.org/bot<TOKEN>/getUpdates`

2. The page shows text. Find `"chat":{"id":` — the number after it is your **chat id**, for example `"chat":{"id":123456789,...`.
3. If the page shows `"result":[]`, send the bot another message in Step 2 and reload the page.

Do not share a screenshot of this page: the address holds your token.

## Step 4 — Put both values on the server

1. Open the file `web/.env.local` (make it if it does not exist). This file is never committed to git.
2. Add two lines with your own values:

   ```
   TELEGRAM_BOT_TOKEN=<your token>
   TELEGRAM_CHAT_ID=<your chat id>
   ```

3. Save the file.
4. Restart the server (stop `npm run dev` or `npm start`, then start it again). The server reads the file only at start.

If either value is missing, alerts stay off and nothing is sent.

## Step 5 — Send a test

1. Open the Trades page and make sure your trades key is entered.
2. Press **Send test to Telegram**.
3. Your phone shows: `DSE Trade Helper is connected ✅`.

If the page shows "Telegram refused the message … chat not found", check the chat id in Step 3. If it shows "Unauthorized", check the token.

## Check the status

`GET /api/notify/status` with the `x-trades-key` header returns `{enabled, lastRun, lastSent, pending}`. `pending` counts alerts that are not sent yet (quiet hours or a failed send); they go out on the next check.

## Turn alerts off

Delete the two lines from `web/.env.local` and restart the server. To stop the bot for good, send `/deletebot` to @BotFather.

## Alerts when the laptop is off (GitHub Action)

`.github/workflows/notify.yml` runs the same check every 15 minutes, 09:30–15:00 Dhaka time, Sunday to Thursday. GitHub may start a run a few minutes late.

1. On GitHub open the repository → **Settings → Secrets and variables → Actions → New repository secret**.
2. Add four secrets:
   - `TELEGRAM_BOT_TOKEN` — the bot token (use a new one after `/revoke` if the old one was ever shared).
   - `TELEGRAM_CHAT_ID` — your chat id.
   - `GOOGLE_SHEET_ID` — the id from the sheet address.
   - `GOOGLE_SERVICE_ACCOUNT_JSON` — the whole content of the Google key JSON file.
3. Open **Actions → Telegram alerts → Run workflow** once. Outside market hours the log says "outside market hours"; that is a pass.
4. Stop the laptop's own checks so you do not get each alert twice: add `TELEGRAM_SCHEDULE=github` to `web/.env.local` and restart the server (`stop-dse.sh`, then `start-dse.sh`). The **Send test to Telegram** button keeps working.

If GitHub drops the saved "already sent" list (after 7 days with no runs, or a manual cache delete), the next run can repeat one alert per holding that is already at Review or Take profit. It happens once.

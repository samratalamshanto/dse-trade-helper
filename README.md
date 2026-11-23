# DSE Trade Helper

A free learning aid for the Dhaka Stock Exchange (DSE). It helps you research a company before you trade, plan your buys, and keep track of your own portfolio. It is **not investment advice**.

**Live site:** <https://dse-trade-helper.vercel.app/>

## What you can do

| Page | What it does |
|---|---|
| Dashboard | Market today, your holdings, top picks to research |
| Companies | Every DSE company with its signal, fraud check, P/E and 1-year return |
| Company page (`/c/GP`) | Signal and reasons, fraud check, charts, yearly results, dividends |
| Compare | Up to 4 companies side by side |
| Fraud alerts | Companies that show warning patterns |
| Signal scorecard | How past signals turned out, graded after each trading day |
| Watchlist | Companies you saved |
| Portfolio | Your trades, holdings, limits, What-if calculator, Telegram alerts, Google Sheet sync |
| Buy plans | Plan a buy with a target price and an end date |
| Alerts | Price and move alerts in this browser |
| How it works / Start investing | Every rule and term in plain words |

Your data stays in your browser, or, if you sign in with Google, in one "DSE Trade Helper" Sheet in your own Google Drive. Connect Telegram to get alerts on your phone. See the [privacy policy](https://dse-trade-helper.vercel.app/privacy) and [terms](https://dse-trade-helper.vercel.app/terms).

## Repository

| Folder | What it is | Start here |
|---|---|---|
| [`web/`](web/) | The web app (Next.js on Vercel): pages, API, Google sign-in, Telegram alerts | [`web/README.md`](web/README.md) |
| [`app/`](app/) | Android app (Expo) that reads the web app's API | [`app/README.md`](app/README.md) |
| [`local/`](local/) | The first, local-only version (plain Node, no install) | [`local/README.md`](local/README.md) |
| [`docs/`](docs/) | Notes on outside services (broker API) | — |
| [`release-plan/`](release-plan/) | Plans and deploy checklists per feature | — |
| `.github/workflows/` | Daily DSE data refresh, and Telegram alerts every 15 minutes on trading days | — |

## Run the web app on your computer

```bash
cd web
npm install
# write web/.env.local first: see web/README.md, "Environment variables"
npm run dev        # http://localhost:3000
npm test           # unit tests
```

`./start-dse.sh` starts the web app in the background and opens the browser; `./stop-dse.sh` stops it.

## Data

Market data comes from the DSE public website (dse.com.bd). A GitHub Action refreshes it once a day and commits it to `web/data/`. Signals come from fixed rules on that data; a red flag shows a pattern, not proof of fraud.

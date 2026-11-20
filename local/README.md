# DSE Trade Helper

A local website that helps you research any company on the Dhaka Stock Exchange (DSE) before you trade.

    node server.js        # then open http://localhost:8080
    node --test           # rule and parser tests

Needs Node 18+. No install.

## Pages

| Page | What it shows |
|---|---|
| `/#/` Shortlist | Only companies that pass every quality check and have no fraud flag |
| `/#/all` All companies | Every DSE equity with signal, fraud check, score, P/E, 1-year return |
| `/#/fraud` Fraud alerts | Non-Z companies with warning patterns |
| `/#/c/<CODE>` Company | Signal, suggestion, reasons, fraud check, history notes, charts, yearly results, owners |
| `/#/learn` How it works | Every rule and every term in plain words |
| `/plan` My plan | The original four-company plan |

## Data

- Live prices: `https://www.dse.com.bd/api/live/snapshot` (cached 30 s).
- Company data: the JSON embedded in `https://www.dse.com.bd/company/<CODE>`.
- The first start reads about 360 company pages, one every 2 seconds (about 12 minutes).
  Results are saved in `data/companies.json` and refreshed once a day.

Neither source is a documented DSE API. If DSE changes its pages, the scan logs a warning for each company it cannot read.

## Rules

All rules live in `lib/analysis.js`. Change a threshold there, then run `node --test`.

Signals are learning aids from fixed rules, not investment advice.

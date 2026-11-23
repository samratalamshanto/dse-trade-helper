# Maestro UI flows (Android, Expo Go)

The flows drive "Trade Helper" in Expo Go (`host.exp.exponent`) through deep links
`exp://192.168.10.206:8081/--/<route>`. Each flow stops Expo Go, opens its deep link and waits for a known text.

Requires: Maestro (`~/.maestro/bin/maestro`), an Android emulator with Expo Go, the Expo dev server on :8081,
the web API on :3000. `trades-import` needs `/sdcard/Download/order_summary_19-Nov-2026.xlsx` on the device.

## Run

```sh
sh e2e/maestro/run.sh                 # all flows
sh e2e/maestro/run.sh home trades     # some flows
```

One flow by hand:

```sh
~/.maestro/bin/maestro --device emulator-5554 test e2e/maestro/home.yaml \
  --format junit --output <proof>/junit-home.xml --test-output-dir /tmp/maestro-dse/home
```

`run.sh` writes `junit-<flow>.xml` and the `takeScreenshot` PNGs to `$PROOF`
(default `/home/bs01672/Projects/claude-proof/2026/11/dse-tests/android`). Set `DEVICE` for another emulator.

## Flows

| Flow | Checks |
|---|---|
| home | Market card, DSEX index, Top gainers/Top losers chips, signal card opens filtered Companies, all 5 tabs |
| companies | filter chips, sort chips, search "GP", open Grameenphone |
| company | /c/GP price, 52-week range, four questions, range chips 1W..1Y, key facts, financial trends, owners, star toggle |
| watchlist | star GP, see it in Watchlist and on Home, remove it (ends empty) |
| learn, dividends, notfound | static screens; /nosuch shows "This page does not exist" and Go to Home |
| trades | REAL Google Sheet: add GP BUY 1 @ 1.00 "E2E TEST — delete", edit to 2.00, delete. Check the sheet after. |
| trades-import | picks the broker Excel in the system picker; preview shows 2 skipped, nothing new. Does not save. |

Notes:
- `_hide-devtools.yaml` drags the Expo Go floating "Tools" button off the header; it covers the watchlist star.
- After `trades`, `run.sh` runs `cleanup-trades.sh`: it deletes any trade whose note starts with "E2E TEST"
  through the API (key `TRADES_API_KEY` from `web/.env.local`, never printed) and prints what is left in the sheet.
- The trade form fields have no accessibility labels, so the flow taps them by placeholder ("GP", "100", "226.70")
  and closes the keyboard with Enter (`hideKeyboard` can send Back and close the modal).
- The server's Google calls time out after 10 s; a transient "Google ... could not be reached." fails the run.

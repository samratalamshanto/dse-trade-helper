# UCB Stock "UGrow" (utrade) API — observed 2026-11-20

The broker publishes no documentation for this API. It was mapped from the web app at
`https://utrade.ucbstock.com.bd/app/dashboard`, which is built by Xpert Fintech Ltd (XFL), with
the owner logged in. The sources are the browser network log, the app's JavaScript bundle and
read-only GET calls. No order, edit or delete call was made. The API can change without notice.

## Contents
- Base and headers
- Login and token
- Endpoints we can use (tested, status 200)
- Endpoints that need more rights (403)
- Write endpoints (do not call)
- Public endpoints
- Live push (SignalR)
- Risks and safe design

## Base and headers

| Item | Value |
|---|---|
| Base URL | `https://prod-oms-api-2.xfltrade.com:20121` (the bundle's default is `prod-oms-api-1`; the live app uses `-2`) |
| Auth header | `Authorization: Bearer <accessToken>` |
| Broker header | `X-BrokerId: <broker id>` (from `GET /api/brokers` → `data[0].id`) |
| Content type | `application/json` |
| Paging | query `Paging.page`, `Paging.size`, `Paging.sortDirection` (`asc`/`desc`), `Paging.SortColumn` |
| Filters | query `Filter.<name>=<value>` |

Every response uses the same envelope:

```json
{ "success": true, "format": "…", "compressed": false, "data": [ … ], "total": 2, "filter": { "paging": { … }, "filter": { … } } }
```

## Login and token

| Step | Call | Body / result |
|---|---|---|
| 1. Log in | `POST /api/Login` | Body: user id, password and `deviceId` (JSON). Result: `accessToken`, `refreshToken`, `userId`, `displayName`. |
| 2. Refresh | `POST /api/Login/refresh-token` | Body: `{ accessToken, refreshToken, deviceId }` → new tokens. |
| 3. Log out | `POST /api/v1/user/logout` | — |
| Status | `GET /api/v1/user/login-status` | Blocked by the browser (CORS) from the page; not tested from a server. |

- The access token is a JWT. It holds the claims `name`, `role`, `nameidentifier`, `IssuedAt`,
  `LoginAt`, `DeviceId`, `AppType` and `exp`. It lives only minutes, so a client must refresh it.
- The exact login body key names were not visible in the minified bundle. To confirm them, open
  DevTools → Network on the next login and read the `Login` request **keys only**.
- The account can have MFA (`/api/users/mfa/verify/*`). A login can then need a one-time code.

## Endpoints we can use (tested, status 200)

`{SE}` = `DSE` or `CSE`.

| What | Call | Main fields |
|---|---|---|
| My BO account, cash, value | `GET /api/bo-accounts?Paging.Page=1&Paging.Size=10` | `boAccountId, accountCode, name, cashBalance, ledgerBalance, maturedBalance, costValue, marketValue, accruedInterest, marginType, readOnlyMode, status` |
| **My holdings** | `GET /api/portfolios?Filter.boAccountIds=<boAccountId>` | `tradingCode, quantity, salable, maturedShare, averageBuyRate, totalPurchasePrice, ltp, change, changePercentage, profit, profitPercentage, sellValue, boardType` |
| My orders | `GET /api/orders?Paging.page=1&Paging.size=50` | `id, tradingCode, type, price, quantity, remainingQuantity, totalExecutedQuantity, orderStatus, status, commission, commissionAmount, executedAmount, board, stockExchange` |
| My executions (fills) | `GET /api/order-execution-reports?Paging.page=1&Paging.size=50` | `orderId, executionId, tradingCode, type, price, quantity, totalExecutedQuantity, orderStatus, transactionDateTimeUtc` |
| Today's order totals | `GET /api/orders/summary` | `buyOrderCount, buyExecutedValue, sellExecutedValue, netExecutedValue, totalExecutedQty, …` |
| Margin notices | `GET /api/margin-notifications` | list (empty for this account) |
| Watchlists | `GET /api/watchlists` | `id, name` |
| Live prices, whole market | `GET /api/share-prices/{SE}?Paging.page=1&Paging.size=500` | `tradingCode, ltp, open, high, low, close, ycp, change, changePercentage, volume, value, trade, high52W, low52W, bestBid…, bestOffer, buyPressure, sellPressure, category, sector` |
| Company list | `GET /api/orderbook-directories/{SE}/orderbook-info` | `tradingCode, companyName, sector, category, isin, instrument, boardType` |
| Trading codes | `GET /api/orderbook-directories/{SE}/trading-codes` | `string[]` |
| Trade ticks (time and sales) | `GET /api/order-executions/{SE}?Paging.page=1&Paging.size=50` | `tradingCode, executionPrice, executedQuantity, direction, value, timeLocal` |
| News | `GET /api/newses/{SE}?Paging.page=1&Paging.size=20` | `title, newsText, dateLocal, timeLocal, orderbook` |
| Market health | `GET /api/health/trade-market` | `DSE/CSE → MarketData, TradeData, TradingApi` |
| App version | `GET /api/app-version` | `appVersion, androidAppVersion, …` |
| My permissions | `GET /api/user-access-permissions` | `action, entityType, policy` |
| Dashboard layout | `GET /api/dashboards` | UI layout only |

Seen in the bundle, not tested yet (read-only):

| What | Call |
|---|---|
| Market depth | `GET /api/market-depths/{SE}/{market}/{tradingCode}` |
| Price history | `GET /api/share-price-histories/{SE}` |
| Company fundamentals | `GET /api/company-fundamental/{SE}/{tradingCode}` |
| Scoreboard | `GET /api/share-prices/{SE}/score-board/summary`, `GET /api/share-prices/{SE}/sector-category-value` |
| Aggregated ticks | `GET /api/order-executions/{SE}/aggregated` |
| Sectors, categories, instruments | `GET /api/orderbook-directories/{SE}/sectors` · `/categories` · `/instruments` |
| Order status | `GET /api/orders/{id}/status` |
| Upcoming IPO / T-bond | `GET /api/ipo`, `GET /api/treasury-bond` |

## Endpoints that need more rights (403 for this account)

`/api/bo-account-balances/histories`, `/api/portfolios/histories`,
`/api/order-execution-reports/trading-summary`, `/api/ipo`.

## Write endpoints (do not call)

These change real money or real orders: `POST /api/orders` (place an order), `/api/orders/all`
(cancel all), `/api/orders/release`, `/api/orders/suspend`, `/api/deposit`, `/api/withdrawal`,
`/api/purchase-power-request`, `/api/ipo-application`, `/api/treasury-bond-application`.
The bundle also holds broker-admin calls (`/api/users`, `/api/brokers` POST, `/api/trading-limits`,
`/api/logs`, `/api/tech-support/*`). A customer account cannot use them.

## Public endpoints

**None.** Without a token, every call tried returned `401`: `share-prices`, `orderbook-info`,
`trading-codes`, `brokers`, `dashboards`, `portfolios`, `orders` and `ipo`
(`curl` from this machine, 2026-11-20). The free public source for market data stays
`www.dse.com.bd`, which this app already uses.

## Live push (SignalR)

The app opens `{base}/api-hub` (SignalR, `POST /api-hub/negotiate?negotiateVersion=1`). The
access token goes in through `accessTokenFactory`. The client calls `Heartbeat`. The hub pushes
live prices and order updates. Not mapped further.

## Risks and safe design

- **The token can trade.** The same Bearer token that reads holdings can also `POST /api/orders`.
  A leaked token or password means someone can trade and move money on the account.
- **Unofficial.** There is no API contract, so a call can change or break on any app release.
  Automated access can also break the broker's terms of use. Ask UCB Stock before building on it.
- **Do not store the password.** If we build a sync, the owner logs in once, and the server keeps
  only the refresh token in `web/.env.local` or an encrypted file. Every call is a GET from
  an allow-list. The code has no route to any write endpoint. A failed refresh means
  "log in again", never a stored-password retry.
- Never log a token, a password, `boId`, `icNo`, `phone`, `email` or `address`.

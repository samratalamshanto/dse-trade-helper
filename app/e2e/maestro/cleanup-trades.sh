#!/bin/sh
# Delete every trade whose note starts with "E2E TEST" from the real sheet, then list what is left.
# Run after trades.yaml (run.sh does it). Never prints the API key.
set -eu
API=${API:-http://localhost:3000}
K=$(awk -F= '/^TRADES_API_KEY=/{print $2}' "$(dirname "$0")/../../../web/.env.local")
ids=$(curl -sf -H "x-trades-key: $K" "$API/api/trades" | python3 -c '
import json, sys
for t in json.load(sys.stdin)["trades"]:
    if (t.get("note") or "").startswith("E2E TEST"): print(t["id"])')
for id in $ids; do
  echo "deleting leftover E2E trade $id"
  curl -sf -X DELETE -H "x-trades-key: $K" "$API/api/trades/$id" >/dev/null
done
curl -sf -H "x-trades-key: $K" "$API/api/trades" | python3 -c '
import json, sys
ts = json.load(sys.stdin)["trades"]
print(len(ts), "trades in sheet:", "; ".join("%s %s %s @ %s" % (t["code"], t["side"], t["quantity"], t["price"]) for t in ts))'

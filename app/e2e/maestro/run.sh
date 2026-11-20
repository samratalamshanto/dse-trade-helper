#!/bin/sh
# Run Maestro flows on the emulator; JUnit and screenshots go to the proof folder.
# Usage: sh run.sh [flow ...]   (default: all flows in this folder)
set -u
DIR=$(cd "$(dirname "$0")" && pwd)
PROOF=${PROOF:-/home/bs01672/Projects/claude-proof/2026/11/dse-tests/android}
DEVICE=${DEVICE:-emulator-5554}
OUT=${OUT:-/tmp/maestro-dse}
mkdir -p "$PROOF"
[ $# -eq 0 ] && set -- home companies company watchlist learn dividends trades trades-import notfound
rc=0
for f in "$@"; do
  rm -rf "$OUT/$f"
  ~/.maestro/bin/maestro --device "$DEVICE" test "$DIR/$f.yaml" --format junit --output "$PROOF/junit-$f.xml" --test-output-dir "$OUT/$f" || rc=1
  find "$OUT/$f" -path "*takeScreenshot/*.png" -exec cp {} "$PROOF/" \;
  [ "$f" = trades ] && { sh "$DIR/cleanup-trades.sh" || rc=1; }
done
exit $rc

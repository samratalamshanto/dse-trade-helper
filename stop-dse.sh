#!/usr/bin/env bash
# Stops the DSE Trade Helper web server (the process listening on port 3000).
PID=$(ss -ltnp | grep ':3000 ' | grep -oP 'pid=\K[0-9]+' | head -1)
if [ -z "$PID" ]; then echo "DSE Trade Helper is not running."; exit 0; fi
kill "$PID" && echo "DSE Trade Helper stopped (pid $PID)."

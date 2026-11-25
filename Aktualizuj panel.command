#!/bin/bash
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
node "$(dirname "$0")/scripts/aktualizuj.mjs" "$@"
wynik=$?
read -r -p "Enter zamyka okno..." _
exit "$wynik"

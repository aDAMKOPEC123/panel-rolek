#!/bin/bash
# Panel rolek: uruchomienie na Macu (dwuklik w Finderze).
cd "$(dirname "$0")" || exit 1
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
if ! command -v npm >/dev/null 2>&1; then
  echo "Brak Node.js. Zainstaluj: brew install node (instrukcja w JAK_ZAINSTALOWAC.txt)."
  read -r -p "Enter zamyka okno..." _; exit 1
fi
echo "Uruchamiam panel rolek... Nie zamykaj tego okna, dopoki pracujesz w panelu."
npm run panel
read -r -p "Panel zatrzymany. Enter zamyka okno..." _

# panel/
Panel graficzny do montażu rolek. Start: `npm run panel` (http://localhost:4321).
- `server.mjs`: lokalny serwer Node bez zależności. Słucha tylko na localhost, nie przyjmuje ścieżek spoza folderu projektu, uruchamia tylko skrypty z listy (`scripts/*.mjs`) i `claude -p`.
- `public/`: front (index.html, app.js, style.css), bez budowania.
- `public/img/napisy-*.jpg`: podglądy stylów napisów. Odśwież: `node panel/podglady-stylow.mjs`.
- `.cache/`: miniatury i paski klatek (można usunąć, odtworzą się same).
- Wymyśl nową rolkę (Start): `promptPomyslu()` w app.js, API `/api/pomysly`, `/api/pomysl/<id>` (+ `/rozmowa`, `/utworz`), wgrywanie `POST /api/projekt/<n>/material/<M1>?nazwa=`; szkice w `01_PROJEKTY/_pomysly/`.
- Wynik retencji (krok Render i chip na osi czasu): `wynikRetencji()` w app.js, martwe miejsca na osi na czerwono, „Napraw” zapisuje rolka.json.
- Opcje Tak/Nie: efekty montażu zapisują się w `rolka.json` -> `efekty` (krok Styl, wycinanie ciszy też w kroku Nagrania); pomoce panelu („⚙ Opcje”) w localStorage przeglądarki.
- Asystent „Dokończ z Claude”: `POST /api/claude` z polem `sesja` wznawia rozmowę (`claude -p --resume`), strumień zadania na końcu zwraca `wynik` i `sesja`.

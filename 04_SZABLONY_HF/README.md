# 04_SZABLONY_HF: szablony HyperFrames

Biblioteka komponentów wielokrotnego użytku. To jest też projekt HyperFrames (`index.html` pokazuje każdy szablon po kolei z wartościami domyślnymi), więc można go lintować i renderować:

```bash
cd 04_SZABLONY_HF && npx hyperframes lint --include-unmounted
npx hyperframes render --quality draft -o renders/biblioteka_test.mp4
npm run podglad-szablonow      # z katalogu głównego: pełny podgląd przez generator (przejścia, napisy, debug safe zone)
```

## Co tu jest

| Folder | Co |
|---|---|
| `compositions/` | GOTOWE szablony scen. Z nich korzysta `npm run zloz`. |
| `assets/demo/` | placeholdery (przed/po, tło + wycięta sylwetka, avatar, watermark). Generuje `npm run demo-media`. |
| `okladka/` | szablon okładki dla `npm run okladka`. |
| `_katalog/` | oryginały bloków z katalogu HyperFrames (`npx hyperframes add ...`), na których oparte są szablony. Do podglądu, nie do montażu. |
| `_podglad/` | projekt testowy: wszystkie szablony przez generator, z nakładką safe zone. |

## Szablony

| Szablon | Do czego | Zmienne (`dane`) | Media (`media`) | Źródło |
|---|---|---|---|---|
| `hook-tytul` | duży tekst w 0-2 s | `tekst` (`*akcent*`, `|` nowa linia), `podtekst`, `wariant` slowa/maska/skala, `tlo` pigulka/plansza/brak, `pozycja` gora/srodek | | własny |
| `napisy` | napisy słowo po słowie | `styl` este/perla/waga/marker/vlog (vlog = montaż naturalny: biały bezszeryf bez tła, słowo po słowie), `wyroznij`, `slow_w_grupie`, `emoji` (ustawia zloz z `napisy` i `efekty.emoji`) | | mechanika z caption-pill-karaoke, caption-weight-shift, caption-highlight |
| `tekst-za-postacia` | napis między tłem a wyciętą postacią | `tekst`, `kolor` bialy/akcent/ciemny, `wysokosc` (px) | `tlo` (proxy), `wyciete` (webm) + `media_od` | własny, wg captions.md HF |
| `przed-po` | porównanie, suwak albo split | `tryb` wipe/split, `etykieta_przed`, `etykieta_po`, `dopisek` (ZAWSZE "efekt indywidualny") | `przed`, `po` | mechanika before-after-wipe |
| `lista-krokow` | "3 błędy przy..." | `tytul`, `kroki` (oddziel `|`), `tlo` plansza/nagranie | | własny |
| `lower-third` | imię i rola | `nazwa`, `rola` | | lt-soft-pill z katalogu |
| `tekst-animowany` | napis z animacją: pojawianie, maszyna, przekreślenie i nowy tekst, marker, kółko, licznik, wyskok | `tekst`, `nowy`, `efekt`, `pozycja` gora/srodek/dol, `tlo` pigulka/brak, `rozmiar` | | własny |
| `tekst-natywny` | tekst jak wpisany w aplikacji Instagrama (montaż naturalny): każda linia w zaokrąglonej ramce, bez kolorów marki, tylko pojawia się i znika | `tekst` (`|` nowa linia), `tlo` biale/czarne/brak, `pozycja` gora/srodek/dol, `rozmiar` | | własny; `zloz` wstawia go zamiast hook-tytul i cta-koncowe przy `montaz: "naturalny"` |
| `vlog-godzina` | godzina i rozdział dnia w vlogu (licznik minut, pod znakiem wodnym) | `godzina` (HH:MM), `opis` | | własny; wstawia `npm run vlog` |
| `ig-obserwuj` | karta "Obserwuj" | `nazwa`, `handle`, `opis` | `avatar` (domyślnie 02_BRAND/logo/logo.png) | instagram-follow z katalogu |
| `cena-oferta` | cena / promocja, cena i rabat odliczają od zera | `zabieg`, `cena`, `cena_stara`, `rabat` (np. -15%), `etykieta`, `dopisek` (`|` nowa linia), `tlo` plansza/karta, `tlo_karty` biala/zlota, `licznik` | | własny |
| `cena-za-postacia` | karta z ceną wysuwa się zza postaci, przechodzi na wierzch, kursor myszki klika i karta otwiera się z ceną (zloz dokłada whoosh, klik myszki, ding) | `zabieg`, `pytanie`, `cena`, `dopisek`, `kadr_x`/`kadr_y`/`kadr_skala` (jak `kadr` ujęcia), `gora`, `wysun` | `tlo` (proxy), `wyciete` (webm) + `media_od` | własny |
| `cta-koncowe` | zakończenie, pigułka ze strzałką → | `tekst`, `przycisk`, `styl_przycisku` miedz/obrys, `podpis`, `ikona` zapisz/kalendarz/serce/brak, `handle`, `tlo` plansza/nagranie, `poswiata` (przy nagraniu, `false` = bez jasnej poświaty w dolnej strefie UI), `miejsce` (duża linia z pinezką), `info` (adres, godziny, `|` nowa linia), `dopisek` (mały, na dole), `pokaz_logo` | `logo` (przy `pokaz_logo` domyślnie 02_BRAND/logo/logo.png) | własny |
| `efekt-ae` | efekty jak z After Effects: ramka i strzałka rysowane do detalu (Trim Paths), złote iskry, połysk światła na napisie, napis z rozmyciem ruchu, głębia ostrości (rozmyte tło), napis 3D, akwarela pod napisem | `efekt`, `tekst`, `x`, `y` (punkt w px; w panelu klik w kadr), `promien`, `pozycja`, `kolor` zloto/bialy/granat, `rozmiar` | | własny, przepisy z hyperframes-animation (svg-path-draw, particle-burst, gradient-text-sweep, motion-blur-streak, depth-of-field-blur, 3d-text-depth-layers) |
| `animacja-lottie` | animacja Lottie (eksport z AE przez Bodymovin, LottieFiles) | `plik` (03_BIBLIOTEKA/lottie/*.json albo plik w rolce), `x`, `y`, `szerokosc`, `petla`, `kolory` marka/oryginalne, `krycie` | | własny; zloz wkleja JSON do sceny, HyperFrames przewija klatki przez `window.__hfLottie` |
| `moj-*` | własne animacje z panelu („✦ Animacja z opisu”): Claude pisze je według opisu, `<title>` = nazwa w panelu | zależnie od animacji | | Claude |
| `ozdobniki` | cienkie złote łuki w rogach (+ akwarelowe plamy), bez tekstu | `rogi` ukos/wszystkie/gora, `akwarela`, `krycie` | | własny |
| `kino` | kinowe otwarcie (czarne pasy 2.39:1 rozsuwają się w pełny kadr) + delikatne ziarno taśmy na całą rolkę, bez tekstu; scena od 0 na całą długość | `pasy_czas` (s, 0 = bez), `ziarno` (krycie, 0 = bez) | | własny |
| `watermark` | znak w rogu (dodawany automatycznie) | `tryb` tekst/obraz, `handle`, `krycie` | `znak` | własny |
| `przejscie-swiatlo` | ciepły light leak na cięciu | | | organic-light-leak-overlay z katalogu |
| `przejscie-flash` | miękki błysk na cięciu | | | editorial-flash-overlay z katalogu |
| `safe-zone-debug` | nakładka stref UI Instagrama | | | własny |

Przejścia `przenikanie`, `zoom`, `przyciemnienie` to ruch GSAP na ujęciach (wg `motion.md` HyperFrames), robi je `zloz`.

## rolka.json (opis montażu jednej rolki)

```jsonc
{
  "tytul": "Laminacja brwi ile trzyma",
  "debug_safe_zone": false,          // true = nakładka stref IG (render --final odmówi)
  "watermark": true,
  "ujecia": [                        // A-roll po kolei. Ścieżki względem folderu rolki.
    { "src": "proxy/IMG_0001.mp4", "od": 0, "do": 2.3, "przejscie_po": "ciecie" },
    { "src": "proxy/IMG_0004.mp4", "od": 2.0, "do": 4.4, "dzwiek": true, "przejscie_po": "zoom" },
    { "src": "raw/po.jpg", "czas": 2 },                       // zdjęcie (lekki zoom Ken Burns)
    { "kolor": "#E9D9CF", "czas": 2.5, "etykieta": "" }       // plansza
  ],
  // przejscie_po: ciecie | przenikanie (zakładka 0.3 s) | zoom | przyciemnienie | swiatlo | flash | swipe | swipe_gora (whip pan z rozmyciem) | whip (rzut kamerą w stronę ruchu z klipu, przejscie_kierunek: auto|lewo|prawo|gora|dol) | fala (zakładka 0.45 s, falowanie jak przez wodę) | ostrosc (zakładka 0.4 s, przeostrzenie) | przez_postac (zakładka 0.6 s, tło za osobą znika do nowego ujęcia; wymaga wyciete/<klip>.webm, bez niego ostrosc)
  "voiceover": { "src": "proxy/IMG_0004.mp4", "start": 0.3, "glosnosc": 1 },  // mowa pod całością (też z klipu wideo)
  "muzyka": null,                    // albo { "src": "audio/muzyka.mp3", "glosnosc": 0.18 } (tylko z licencją)
  "napisy": {
    "wlacz": true,
    "plik": "napisy/transcript.json",
    "zrodlo": "proxy/IMG_0004.mp4",  // z czego jest transkrypcja: voiceover albo klip w ujęciach
    "styl": null,                     // null = 02_BRAND/caption-skin.json
    "wyroznij": ["laminacja", "brwi"],
    "przesuniecie": 0
  },
  "sceny": [                          // nakładki i plansze z szablonów, czasy bezwzględne
    { "szablon": "hook-tytul", "start": 0, "czas": 2.3, "dane": { "tekst": "Laminacja *brwi*" } },
    { "szablon": "przed-po", "start": 6.3, "czas": 2.4, "dane": { "tryb": "wipe" }, "media": { "przed": "raw/przed.jpg", "po": "raw/po.jpg" } }
  ]
}
```

Mapowanie napisów: jeśli `zrodlo` to voiceover, czasy słów = start voiceovera + czas w pliku. Jeśli `zrodlo` to klip użyty w ujęciach (bez voiceovera), słowa trafiają tylko tam, gdzie ten klip jest na osi (wycięte fragmenty znikają razem z napisami).

## Jak pisać nowy szablon
1. Najpierw szukaj w katalogu: `npx hyperframes catalog --query "<po angielsku>" --json`, potem `npx hyperframes add <nazwa>` i przerób (wrzuć oryginał do `_katalog/`).
2. Plik `compositions/<nazwa>.html` w `<template>`, root `#root`, JEDEN `.clip` na całą scenę (zloz podmienia jego `data-duration`), ruch tylko w GSAP (`fromTo`), timeline pod `window.__timelines["<nazwa>"]`.
3. Wszystkie id z prefiksem `<nazwa>-` (zloz robi z tego kolejne instancje `<nazwa>-2`).
4. Dane przez `data-composition-variables` + `window.__hyperframes.getVariables()`, z sensowną wartością domyślną.
5. Media przez `data-slot-media="<klucz>"` z placeholderem z `assets/demo/`.
6. Kolory, fonty i marginesy tylko przez `var(--akcent)`, `var(--font-naglowki)`, `var(--safe-top)` itd.
7. Dopisz go do `index.html` biblioteki, `npx hyperframes lint`, render testowy, i do tabeli wyżej.

NIE wrzucaj tu materiałów konkretnej rolki.

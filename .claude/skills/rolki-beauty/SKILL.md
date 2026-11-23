---
name: rolki-beauty
description: Montaż rolek na Instagram i TikTok dla gabinetu beauty (kosmetologia: brwi, rzęsy, twarz; podologia: pedicure, stopy, paznokcie) w HyperFrames, od nagrań z telefonu do pliku do publikacji. Używaj zawsze, gdy ktoś mówi "zmontuj rolkę", "zrób rolkę z tych nagrań", "napisy do rolki", "przed i po", "dodaj napisy", "wyrenderuj rolkę", "okładka do rolki", "opis i hashtagi do rolki", "mam nagrania z gabinetu", "zrób reelsa", "tiktok z tego", nawet bez słowa "skill". Prowadzi cały proces na skryptach z folderu scripts/ i szablonach z 04_SZABLONY_HF, a wiedzę o samym HyperFrames bierze ze skilli hyperframes, hyperframes-cli, hyperframes-registry i media-use.
---

# Rolki beauty: montaż od nagrania do publikacji

Ten skill prowadzi proces. Nie dubluje wiedzy o HyperFrames: przy pisaniu lub poprawianiu kompozycji czytaj `/hyperframes` (kontrakt, captions.md, overlays.md, types/vertical.md), przy komendach `/hyperframes-cli`, przy szukaniu bloków `/hyperframes-registry`, przy mediach (wycinanie tła, muzyka, kolor, rozmycie twarzy) `/media-use`. Pomysły i scenariusze rolek: skill `beauty-reels` (jeśli jest dostępny).

Prowadząca = osoba, która nagrywa i mówi w rolkach: imię z `config.json -> gabinet.osoba` (ustawiasz w kreatorze panelu). W tekstach Claude używa tego imienia, odmienionego.

Wszystko w projekcie jest po polsku. Struktura, komendy i zasady: `CLAUDE.md` w katalogu głównym. Mapa pól `rolka.json` i szablonów: `04_SZABLONY_HF/README.md`.

## Proces (7 kroków)

### 1. Krótki wywiad (jedna wiadomość, maks. 4 pytania)
Zapytaj tylko o to, czego nie da się wywnioskować z nagrań i briefu:
- kategoria: brwi / rzesy / twarz / podologia / pedicure / gabinet / edukacja
- cel: zasięg / edukacja / sprzedaż zabiegu
- długość: 7-15 s, 15-30 s, 30-60 s
- czy jest voiceover (mówi do kamery, lektor, czy sama muzyka i napisy)
Jeśli w kadrze jest twarz klientki, dopytaj o zgodę na wizerunek. Potem: `npm run nowa-rolka -- <kategoria> "<temat>" [--z-inbox]` i wpisz odpowiedzi do `brief.md`.

### 2. Przegląd nagrań i propozycja montażu
- `npm run inbox` (albo `ls raw/`) pokazuje długość, rozdzielczość, fps, obrót.
- Obejrzyj klatki: `ffmpeg -ss <t> -i <plik> -frames:v 1 -vf scale=360:-1 klatka.jpg` co ok. 1 s (albo arkusz: `-vf fps=1,scale=180:-1,tile=6x4`) i czytaj obrazy.
- Wybierz najlepsze ujęcia: ostre, dobrze oświetlone, z ruchem w kadrze, efekt widoczny. Odrzuć poruszone i ciemne.
- Zaproponuj montaż jako tabelę: `# | plik | od-do (timecode) | co widać | tekst / co mówi | przejście`. Hook w 0-2 s, cięcia co 1-3 s, CTA na końcu. Formaty i ich struktura czasowa: `references/formaty-rolek.md`. Hooki: `references/hooki-beauty.md`.
- Poczekaj na akceptację listy ujęć (chyba że ktoś poprosił "bez pytania").

### 3. Normalizacja, cisza, transkrypcja, akceptacja napisów
- `npm run normalizuj -- <projekt> --cisza` (raw -> proxy: 1080x1920, 30 fps CFR, -14 LUFS, auto-editor wycina ciszę z łagodnym progiem i marginesem 0.25 s). Na b-rollu bez mowy cisza jest pomijana sama.
- `npm run transkrybuj -- <projekt> proxy/<klip z mową>.mp4` -> `napisy/transcript.json` + `.srt` + `tekst.txt`. Silnik: HyperFrames transcribe (Parakeet, obsługuje polski), fallback faster-whisper. Nigdy modele `.en`.
- Pokaż tekst i poproś o akceptację. Zasada korekty: prowadząca mówi naturalnym, mówionym polskim. NIE poprawiaj stylu, składni, powtórzeń ani "no", "wiesz". Poprawiaj tylko błędy rozpoznania: nazwy zabiegów i preparatów (laminacja, henna pudrowa, lifting rzęs, onychomykoza, hiperkeratoza, keratolityk, frezarka, klamra ortonyksyjna), liczby, imiona, odmianę słów źle usłyszaną ("przydaj się" -> "przyda się"). Zmieniaj pole `text` w `transcript.json`, czasów nie ruszaj.

### 4. Kompozycja
- Ułóż `kompozycja/rolka.json`: `ujecia` (A-roll po kolei, z `przejscie_po`), `voiceover` (gdy mowa ma lecieć pod b-rollem, podaj klip z mową jako voiceover), `napisy`, `sceny` (szablony z `04_SZABLONY_HF/compositions`). Pełny opis pól: `04_SZABLONY_HF/README.md`.
- Szablony: hook-tytul, napisy (perla / waga / marker), tekst-za-postacia, przed-po, lista-krokow, lower-third, ig-obserwuj, cena-oferta, cta-koncowe, watermark, przejścia (przenikanie, zoom, przyciemnienie, swiatlo, flash), safe-zone-debug.
- Tekst za postacią: najpierw `npm run wytnij-tlo -- <projekt> proxy/<klip>.mp4`.
- Brakuje czegoś w szablonach? Najpierw `npx hyperframes catalog --query "<po angielsku>" --json` (skill `/hyperframes-registry`), dopiero potem nowy szablon w `04_SZABLONY_HF/compositions` w tym samym stylu (jeden `.clip`, zmienne, `data-slot-media`, safe zone przez `var(--safe-*)`).
- `npm run zloz -- <projekt>` składa `index.html`.

### 5. Draft, samokontrola, pokazanie
- `npm run render -- <projekt>` (lint + render draft do `render/vXX`).
- Obejrzyj wynik sam: `cd kompozycja && npx hyperframes snapshot --at 0.5,1,2,3,...` (co 1 s) albo klatki z pliku draftu i czytaj obrazy. Sprawdź: hook czytelny w 1. sekundzie, tekst nie wchodzi w strefy UI Instagrama (tymczasowo `"debug_safe_zone": true`), napisy nie zasłaniają twarzy ani efektu, polskie znaki, akcent na słowach kluczowych, brak pustych klatek, CTA na końcu, dopisek przy przed/po.
- Oczywiste błędy (nachodzenie, literówki, złe czasy) popraw od razu w `rolka.json` i złóż ponownie. Dopiero potem pokaż: ścieżka do draftu + `npm run podglad -- <projekt>` (Studio w przeglądarce).

### 6. Opis, hooki, hashtagi, okładka
- Do `brief.md`: opis pod rolkę (mówiony, krótki, bez obietnic), 3 warianty hooka tekstowego, 5-10 hashtagów: 2-4 lokalne (miasto z `config.json`, np. #laminacjabrwiKraków) + branżowe. Podologia z trudnymi zbliżeniami: ostrzeżenie na początku opisu.
- `npm run okladka -- <projekt>` (tytuł z pola "tytuł na okładkę", `*słowo*` = akcent, `|` = nowa linia).
- Jeśli jest podłączony Higgsfield (narzędzie `virality_predictor`), odpal go na wersji `--standard` i pokaż wynik jako wskazówkę, nie wyrocznię. Nie zmieniaj montażu tylko pod wynik.

### 7. Final i kontrola
- `npm run render -- <projekt> --final` (jakość high, blokuje się bez zgody na wizerunek przy twarzy klientki i z włączonym debugiem).
- `npm run sprawdz -- <projekt>`: rozdzielczość, fps, długość, LUFS, rozmiar, napisy, CTA, okładka, zgoda, opis i hashtagi. Sam uzupełnia status w `brief.md`. Krytyczne błędy popraw i powtórz.
- Po publikacji: `npm run archiwizuj -- <projekt>` (pyta o link i wyniki).

## ZASADY BRANŻOWE (obowiązują zawsze)

- **Zero obietnic medycznych i gwarancji efektu.** Nie piszemy "gwarantuję", "na zawsze", "trwale usuwa", "wyleczy". Przed/po zawsze z dopiskiem o indywidualnych efektach (szablon `przed-po` wymusza go sam, nie wyłączaj).
- **Podologia: estetycznie.** Nie otwieramy rolki zbliżeniem grzybicy, ran, wrastających paznokci. Najpierw hook (twarz, tekst, efekt po), trudne ujęcie dopiero po 2-3 s i krótko. Jeśli treść może być nieprzyjemna: ostrzeżenie w pierwszej linii opisu i `treść może być nieprzyjemna: tak` w briefie. W rolce nie stawiamy diagnoz ("to grzybica"), mówimy "takie zmiany warto skonsultować" i odsyłamy na konsultację (a w razie potrzeby do lekarza).
- **Wizerunek klientki tylko za jej zgodą.** Pole `zgoda na wizerunek: tak/nie` w `brief.md`. Bez "tak" nie ma finalu z twarzą klientki: zaproponuj kadr bez twarzy, inne ujęcie albo rozmycie (`npx hyperframes media-treatment`, skill `/media-use`). Skrypt `render --final` to blokuje.
- **Muzyka tylko z licencją.** Z `03_BIBLIOTEKA/muzyka` (z plikiem LICENCJA) albo dodawana później w aplikacji Instagrama/TikToka. Wtedy render bez muzyki i notatka w `brief.md` ("muzyka: dodam w IG"). Nie pobieramy trendującego audio z IG/YouTube do renderu.
- **Styl: influencerski, naturalny, NIE reklama zabiegu.** Mówione zdania, pierwsza osoba, ciepło i konkret. Bez "wyjątkowa okazja", "nie przegap", "zapraszamy serdecznie", bez sztucznych zwrotów typu AI, bez długich myślników (—). Ton i zakazane słowa: `02_BRAND/brand.md`.
- **Safe zone.** Tekst tylko w pasie od 220 px od góry do 420 px od dołu, 140 px od prawej (przyciski). Szablony to pilnują przez `var(--safe-*)`, nowy tekst też musi.

## Narzędzia opcjonalne (MCP), jeśli są podłączone
- **Higgsfield**: `upscale_video` (słabe nagranie przed normalizacją), `reframe` (poziome nagranie do pionu zamiast ślepego cropa), `virality_predictor` (krok 6, jako wskazówka), `tiktok_music_trending` (pomysł na audio do dodania w aplikacji, nie do renderu).
- **ReelScribe**: transkrypcja rolek konkurencji do researchu hooków (`references/research.md`).
- **HyperFrames MCP (HeyGen)**: render w chmurze i narzędzia HyperFrames bez lokalnego Chrome; lokalne CLI w zupełności wystarcza.
Sprawdź, co jest dostępne, zanim zaproponujesz. Nic z tego nie jest wymagane.

## Referencje
- `references/hooki-beauty.md`: 30+ hooków dla kosmetologii i 30+ dla podologii.
- `references/formaty-rolek.md`: 10 formatów z gotową strukturą czasową i mapowaniem na szablony.
- `references/research.md`: jak dodawać hooki z rolek konkurencji do `03_BIBLIOTEKA/research`.

# Workflow: od nagrania telefonem do publikacji

> Prowadząca = osoba, która nagrywa i mówi w rolkach: imię z `config.json -> gabinet.osoba` (ustawiasz w kreatorze panelu). W tekstach Claude używa tego imienia, odmienionego.

## Schemat

```
 TELEFON (4K/30, pion)
     │  AirDrop / kabel
     ▼
 00_INBOX ──── npm run inbox ─────────────── podgląd plików
     │
     │  npm run nowa-rolka -- brwi "temat" --z-inbox
     ▼
 01_PROJEKTY/<RRRR-MM-DD_kategoria_temat>/
     raw/ ─── npm run normalizuj -- <p> --cisza ──► proxy/ (1080x1920, 30 fps, -14 LUFS, bez ciszy)
                                                   │
           npm run transkrybuj -- <p> proxy/X.mp4 ◄┤
                    │                              │  (opcjonalnie)
                    ▼                              └─ npm run wytnij-tlo -- <p> proxy/Y.mp4 ──► wyciete/
               napisy/transcript.json
               (akceptacja i korekta nazw zabiegów)
                    │
                    ▼
     kompozycja/rolka.json  (ujęcia + sceny z 04_SZABLONY_HF + napisy + audio)
                    │  npm run zloz -- <p>          npm run podglad -- <p>  (Studio w przeglądarce)
                    ▼
     npm run render -- <p>              ──► render/<p>_v01_draft.mp4   (praca)
     npm run render -- <p> --standard   ──► render/<p>_v02_standard.mp4 (akceptacja, virality predictor)
     npm run render -- <p> --final      ──► final/<p>.mp4  (high, blokada bez zgody na wizerunek)
     npm run okladka -- <p>             ──► final/okladka.jpg
     npm run sprawdz -- <p>             ──► raport + status w brief.md
                    │
                    ▼
     PUBLIKACJA w aplikacji IG/TikTok (+ muzyka w aplikacji, jeśli "dodam w IG")
                    │
                    ▼
     npm run archiwizuj -- <p>          ──► 05_ARCHIWUM/<p>/wyniki.md + 05_ARCHIWUM/wyniki.csv
```

## Najprościej: panel

```bash
npm run panel
```
Otwiera się przeglądarka (http://localhost:4321) z kreatorem:

| Krok | Co robisz | Co robi pod spodem |
|---|---|---|
| 1. Start | Nowa rolka albo otwierasz poprzednią; zakładka Archiwum z wynikami | `nowa-rolka`, `archiwizuj` |
| 2. Brief | kategoria, temat, cel, długość, twarz klientki, zgoda, muzyka | zapis do `brief.md` |
| 3. Nagrania | przenosisz pliki z inboxu, „Przygotuj nagrania”, układasz ujęcia (przeciąganie, przycinanie, przejścia, klip z mową) | `inbox --do`, `normalizuj --cisza`, `rolka.json` |
| 4. Styl | format rolki (ustawia sceny), styl napisów, wejście hooka, watermark, safe zone | `rolka.json` |
| 5. Napisy | „Zrób napisy”, klik w słowo = odsłuch i poprawka, słowa kluczowe | `transkrybuj`, `transcript.json` |
| 6. Sceny | oś czasu, dodawanie scen z szablonów, formularze, podpowiedzi hooków, „Wytnij postać” | `rolka.json`, `wytnij-tlo` |
| 7. Render | Studio, wersja robocza, do akceptacji, final (blokada bez zgody), okładka | `zloz`, `podglad`, `render`, `okladka` |
| 8. Publikacja | opis, hooki, hashtagi, „Sprawdź”, checklista, kopiowanie opisu | `sprawdz --json`, `brief.md` |

Na każdym ekranie jest przycisk „✦ Poproś Claude”: wpisujesz zadanie (albo klikasz gotowe), panel dokleja kontekst rolki. „Kopiuj prompt” wkleja się do Claude Code, „Wyślij do Claude” uruchamia go od razu (Claude Code musi być zalogowany w terminalu: wpisz `claude` i `/login`).

Zmiany zapisują się od razu do plików, więc możesz przeskakiwać między panelem, terminalem i Claude.

## Bez panelu

Powiedz Claude Code "zmontuj rolkę z nagrań w inboxie". Skill `rolki-beauty` przeprowadzi wszystkie kroki i zapyta tylko o to, co ważne.

## Krok po kroku

1. **Nagraj** (zasady niżej) i wrzuć wszystko do `00_INBOX`.
2. **Załóż rolkę**: `npm run nowa-rolka -- <kategoria> "temat" --z-inbox`. Kategorie: brwi, rzesy, twarz, podologia, pedicure, gabinet, edukacja.
3. **Brief**: uzupełnij `brief.md` (cel, długość, voiceover, twarz klientki, zgoda na wizerunek, muzyka).
4. **Normalizacja**: `npm run normalizuj -- <projekt> --cisza`. Klipy poziome zostaną przycięte do środka (lepiej: reframe w Higgsfield albo nagrywaj w pionie).
5. **Transkrypcja**: `npm run transkrybuj -- <projekt> proxy/<klip z mową>.mp4`. Przeczytaj `napisy/tekst.txt`, popraw tylko błędy rozpoznania w `transcript.json`.
6. **Wycięcie postaci** (tylko do "tekstu za postacią"): `npm run wytnij-tlo -- <projekt> proxy/<klip>.mp4`.
7. **Montaż**: `kompozycja/rolka.json` (opis pól: `04_SZABLONY_HF/README.md`), potem `npm run zloz -- <projekt>` i `npm run podglad -- <projekt>`.
8. **Draft**: `npm run render -- <projekt>`. Obejrzyj na telefonie (wyślij sobie plik). Poprawki w `rolka.json`, `zloz`, kolejny draft.
9. **Akceptacja**: `npm run render -- <projekt> --standard`.
10. **Opis, hashtagi, okładka**: w `brief.md`, potem `npm run okladka -- <projekt>`.
11. **Final**: `npm run render -- <projekt> --final`, `npm run sprawdz -- <projekt>`.
12. **Publikacja** z `final/` + okładka z `final/okladka.jpg`. Checklista: `docs/CHECKLISTA_PUBLIKACJI.md`.
13. **Archiwum**: `npm run archiwizuj -- <projekt>`, a po 7 i 30 dniach dopisz wyniki (`--wyniki`).

## Jak nagrywać w gabinecie

### Ustawienia telefonu
- **Pion**, zawsze. Poziome nagranie traci 2/3 kadru po przycięciu.
- **4K, 30 fps** (iPhone: Ustawienia > Aparat > Nagrywanie wideo). 60 fps tylko do zwolnionego tempa.
- **HDR wyłącz** (iPhone: "Wideo HDR" off). Skrypt umie przerobić HDR, ale kolory skóry wychodzą lepiej w SDR.
- Blokada ekspozycji i ostrości (przytrzymaj palec na ekranie: AE/AF LOCK), żeby obraz nie "pływał".
- Przetrzyj obiektyw. Serio, za każdym razem.
- Tryb samolotowy albo "nie przeszkadzać" przy mówieniu do kamery.

### Światło
- Lampa pierścieniowa albo softbox na wprost lub lekko z boku, na wysokości twarzy. Do zbliżeń brwi i rzęs: lampa zabiegowa + pierścień.
- Nie mieszaj barw: albo całe światło ciepłe, albo neutralne (ok. 4000-5000 K). Wyłącz górne świetlówki, jeśli dają zielony odcień.
- Okno: z boku albo z przodu, nigdy za plecami osoby.

### Stabilizacja i dźwięk
- Statyw albo uchwyt na ramieniu lampy do ujęć z góry (stopy, dłonie). Z ręki tylko krótkie, spokojne ujęcia.
- Mówienie do kamery: mikrofon krawatowy (bezprzewodowy do telefonu). Wyłącz klimatyzację i muzykę w tle na czas nagrania.
- Mów normalnie, pauzy zostaw. auto-editor wytnie ciszę, a oddechy zostaną.

### Kadr i tło
- Czyste tło: zero kubków, kabli, opakowań, kartonów. Ręcznik i jednorazówki ułożone.
- Rękawiczki czyste, jednego koloru. Paznokcie prowadzącej zadbane (będą w każdym zbliżeniu).
- Zostaw zapas nad głową i pod brodą. Twarz i efekt w środku kadru (góra i dół zjedzie UI Instagrama).
- Twarz klientki: tylko ze zgodą. Bez zgody kadruj na brwi/oko/stopę, bez pełnej twarzy.

### Ujęcia b-roll do zrobienia przy KAŻDYM zabiegu (po 3-5 s każde)
1. Przed: zbliżenie obszaru zabiegowego (brwi/rzęsy/skóra/stopa), światło jak do "po".
2. Przygotowanie: narzędzia, rozkładanie, rękawiczki (dłonie prowadzącej).
3. Detal procesu: szczoteczka, nakładanie preparatu, frezarka, płatki (najlepiej 2-3 różne).
4. Kontrola: prowadząca sprawdza, poprawia, mierzy.
5. Po: to samo ujęcie co "przed", ten sam kadr i światło (do szablonu przed-po!).
6. Reakcja: lusterko, uśmiech (ze zgodą) albo sama dłoń z lusterkiem.
7. Gabinet: wejście, sterylizacja, porządek po zabiegu.
Zdjęcia przed/po: ten sam kadr, odległość i światło. Bez filtrów.

### Ujęcie pod wycięcie postaci (tekst za postacią)
- Jednolite, jasne tło (ściana, tło fotograficzne), 1-2 m za osobą, bez wzorów.
- Osoba wyraźnie oddzielona od tła (kontrast ubrania z tłem), równe światło bez ostrych cieni na ścianie.
- Kamera na statywie, kadr nieruchomy, głowa w górnej 1/3 kadru (napis wejdzie za głowę).
- 5-8 s spokojnego ruchu (mówienie, uśmiech, lekki obrót). Bez szybkich gestów, bez trzymanych przedmiotów przy twarzy.

# Plan: scenariusz, który zatrzymuje kciuk (hook i dynamika)

Cel: każda rolka ma przed nagraniem sprawdzony i dopracowany hook oraz tempo. Po publikacji system uczy się, które
oceny naprawdę przewidują wynik na tym koncie. Nikt nie da gwarancji „100% najlepszej rolki”, bo ostatecznie decydują
widzowie. Da się jednak wyłapać wszystko, co jest sprawdzalne przed nagraniem, i z każdą rolką trafniej przewidywać wynik.

Miary sukcesu (z Insights, już zbierane w kroku Publikacja):
- **% pominięć w 3 s** (główna miara hooka), cel: niższy niż mediana konta,
- **średni czas oglądania / długość** (dynamika), cel: wyższy niż mediana,
- **wysłania na zasięg** (moment do wysłania).

Stan dziś: Claude pisze scenariusz w rozmowie (`promptPomyslu` w `panel/public/app.js`), ale nikt go nie ocenia
przed nagraniem. Wynik retencji (`wynikRetencji`) bada dopiero montaż. Biblioteka hooków z researchu jest pusta,
`05_ARCHIWUM/wnioski.md` nie istnieje, algorytm ma 0 rolek z wynikami.

Pomiar zapisanego scenariusza „5 problemów skóry” (`_pomysly/2026-11-16_142420`) pokazuje, co system ma łapać:
- hook 3 s i 13 słów mowy, czyli 4,3 słowa/s (naturalnie 2,5-3), treść brzmi jak reklama („pokażę ci, czym zmieniamy”),
- środek rolki 1,3-2,3 słowa/s: energia siada tam, gdzie ludzie odpadają,
- w 5 z 8 fragmentów tekstu na ekranie nie da się przeczytać w czasie fragmentu, a do tego lecą napisy z mową.

---

## Etap 0. Rozszerzenie formatu scenariusza [ZROBIONE 2026-11-19] (`pomysl.json`, `scenariusz.json`)
Bez tych pól nie da się mierzyć dynamiki. Stare pliki dalej działają (brak pola = test pominięty z uwagą).

- `hooki[]`: dochodzi `dzwiek` (co słychać w 1. sekundzie), `wariant_b` (druga wersja zdania do nagrania), `zablokowany` (prowadząca nie chce zmian).
- `scenariusz[]` (każdy fragment): dochodzą
  - `rola`: hook | kontekst | wartosc | rehook | nagroda | cta,
  - `bodziec`: co się zmienia na ekranie albo w dźwięku (nowe ujęcie, zbliżenie, licznik, zwrot, dźwięk),
  - `pytanie_widza`: jakie pytanie ma w głowie widz w tym momencie (otwarta pętla),
  - `energia`: 1-5,
  - `zablokowany`.
- `ocena`: ostatnia ocena (etap 1-2), `historia`: poprzednie wersje z ocenami (do cofania).
- Prompt scenarzystki dostaje te pola w schemacie i zasadę: każdy fragment ma bodziec, a każda pętla otwarta w hooku jest zamknięta w roli „nagroda”.

## Etap 1. Twarda ocena scenariusza (liczona od razu, bez AI) [ZROBIONE 2026-11-19]
Nowy moduł `scripts/ocena-scenariusza.mjs` (wspólny dla panelu i CLI): `npm run ocen-scenariusz -- <pomysł albo projekt>`.
Serwer liczy ją przy każdym zapisie pomysłu, a panel pokazuje na żywo. Wynik 0-100 w czterech grupach:

**Hook (45 pkt)**
| test | próg | waga |
|---|---|---|
| tekst na ekranie | 3-7 słów, maks. 2 linie, 1 akcent `*słowo*` | 8 |
| zdanie mówione | maks. 10 słów, mieści się w 2 s przy 2,8 słowa/s | 8 |
| pierwsze słowo niesie treść | nie zaczyna się od: cześć, hej, dzisiaj, w tym filmiku, pokażę ci, zapraszam, chciałam | 7 |
| obraz w 1. sekundzie | opis wizualu zawiera ruch, efekt albo zbliżenie (nie „ja do kamery w gabinecie” jako jedyny obraz) | 7 |
| pierwsze cięcie | koniec fragmentu hooka najpóźniej w 2 s | 6 |
| ton „nie reklama” | brak słów: oferujemy, zapraszamy, profesjonalny, kompleksowy, najlepszy, innowacyjny, gwarancja | 5 |
| klisze AI | brak: „nie uwierzysz”, „sekret, którego”, „to zmieni wszystko”, „game changer”, „hack” | 4 |

**Dynamika (35 pkt)**
| test | próg | waga |
|---|---|---|
| zmiana obrazu | każdy fragment maks. 2,5 s albo ma `bodziec` w środku | 10 |
| tempo mowy | 2,3-3,2 słowa/s w każdym fragmencie z mową | 8 |
| równe tempo | żaden fragment poniżej 70% średniego tempa (dołek energii) | 5 |
| ponowny hook | fragment `rehook` albo zwrot w 40-60% długości | 6 |
| nagroda na końcu | efekt / odpowiedź dopiero w ostatnich 30% | 6 |

**Czytelność (10 pkt)**
| test | próg | waga |
|---|---|---|
| czas czytania | tekst na ekranie: 0,6 s + 0,3 s/słowo mieści się w fragmencie | 6 |
| jeden tekst naraz | gdy fragment ma mowę (napisy), tekst na ekranie maks. 4 słowa | 4 |

**Struktura (10 pkt)**
| test | próg | waga |
|---|---|---|
| długość | zgodna z celem: zasięg 12-25 s, edukacja 20-40 s, sprzedaż 15-30 s | 4 |
| jedno CTA | dokładnie jedno wezwanie, w ostatnich 20% | 3 |
| moment do wysłania | jest punkt w `utrzymanie` / fragment z wysyłaniem | 3 |

Każdy niezaliczony test ma opis po ludzku i, gdzie się da, przycisk „Napraw” (np. „Skróć hook”, „Podziel fragment”).
Test akceptacyjny: scenariusz „5 problemów skóry” dostaje poniżej 60 i dokładnie te uwagi co w pomiarze wyżej.

## Etap 2. Recenzent AI (ocena tego, czego nie da się policzyć) [ZROBIONE 2026-11-19]
Osobne wywołanie `claude -p` (nowa sesja, inna niż autorka scenariusza, żeby nie oceniała swojego tekstu),
odpowiedź w JSON. Recenzent widzi tylko scenariusz, profil, `wnioski.md` i bank przykładów hooków, a nie rozmowę.

- **Kryteria hooka (1-10 każde, z opisem, co znaczy 3, 6, 9):** zatrzymanie kciuka, luka ciekawości, konkret
  (liczba, przedmiot, sytuacja), „to o mnie” (widz rozpoznaje siebie), spójność obraz-tekst-głos, autentyczność
  (brzmi jak prowadząca, nie jak reklama ani AI).
- **Trzy wirtualne widzki:** np. 24 lata, zna trendy; 45 lat, konkretna, nie znosi reklam; sceptyczka zabiegów.
  Każda podaje sekundę, w której by przewinęła, i powód. Wynik: przewidywane „zostają po 3 s” i „dotrwają do końca”.
- **Najpierw zarzuty:** recenzent zaczyna od 3 najmocniejszych zarzutów, dopiero potem daje punkty (mniej pobłażliwości).
- **Kotwice:** w prompcie 6 ocenionych przykładów (2 słabe, 2 średnie, 2 mocne hooki z `hooki-beauty.md` i z wyników konta), żeby skala się nie rozjeżdżała.
- Wynik łączny = 60% twarda ocena + 40% recenzent (po zebraniu wyników z IG wagi z etapu 7).

## Etap 3. Turniej hooków [ZROBIONE 2026-11-19]
Zamiast 3 hooków od razu:
1. Generacja 12 kandydatów: 6 typów (błąd, mit, liczba, POV, pytanie, kontrowersja/efekt) po 2, każdy z tekstem, zdaniem, wizualem i dźwiękiem.
2. Odsiew twardymi testami hooka z etapu 1 (zostaje ok. 8).
3. Ranking: recenzent dwa razy układa 8 hooków od najlepszego, za drugim razem w odwróconej kolejności wejścia
   (żeby kolejność na liście nie miała wpływu), punkty Bordy z obu.
4. Do scenariusza trafiają 3 najlepsze różnych typów. Drugi w rankingu dostaje teleprompter jako wariant B do nagrania (etap 6).
Panel pokazuje ranking z jednym zdaniem „dlaczego” przy każdym hooku. Prowadząca może wybrać inny niż zwycięzca.

## Etap 4. Pętla „✦ Dopracuj do maksimum” [ZROBIONE 2026-11-19]
Przycisk na ekranie pomysłu (i w rozmowie OPCJE: „Dopracuj do maksimum”). Jedna runda:
1. ocena (etap 1 + 2),
2. lista maks. 3 najważniejszych poprawek (najpierw hook, potem dynamika),
3. autorka poprawia tylko te miejsca, nie rusza fragmentów `zablokowany`,
4. ponowna ocena.

Stop, gdy: wynik 90+ i brak uwag krytycznych, albo przyrost poniżej 3 pkt, albo 3 rundy.
Zabezpieczenia: twardy filtr zakazanych obietnic medycznych i słów z `02_BRAND/brand.md` po każdej rundzie,
każda wersja w `historia` (przycisk „Cofnij do wersji”), w panelu podgląd zmian (stary i nowy tekst obok siebie).
Czas: ok. 2-4 min i 4-8 wywołań Claude na pętlę (na koncie Claude Code użytkownika).

Ryzyko i obrona: optymalizacja pod tabelkę prowadzi do gładkich, „AI-owych” hooków. Dlatego autentyczność to
kryterium recenzenta, lista klisz jest w twardych testach, a ostatni wybór zawsze należy do prowadzącej.

## Etap 5. Krzywa napięcia w panelu [ZROBIONE 2026-11-19, bez nałożenia na Insights: etap 7]
Na ekranie pomysłu wykres sekunda po sekundzie: energia (1-5), tempo mowy, bodźce (kropki), rola fragmentu (kolor),
otwarte pętle (od pytania do odpowiedzi). Dołek energii i fragment bez bodźca są podświetlone i klikalne
(przenoszą do uwagi z etapu 1). Ten sam wykres po montażu, nałożony na wykres utrzymania z Insights (etap 7).

## Etap 6. Po nagraniu: kontrola prawdziwego hooka [ZROBIONE 2026-11-19, bez wariantu B z nagrania]
Przy „✦ Claude: sprawdź i ułóż wg scenariusza” i w wyniku retencji:
- **opóźnienie pierwszego słowa:** maks. 0,15 s od startu (z transkrypcji); jeśli dłużej, automatyczne przycięcie,
- **ruch w pierwszej klatce:** z `analiza_przejsc.py` (przepływ optyczny), bo statyczna pierwsza klatka to słabszy hook,
- **energia głosu w hooku:** głośność i tempo pierwszego zdania względem reszty nagrania (hook nie może być najcichszy),
- **ostrość i jasność klatki 0** (z `proxy/.obraz.json`),
- **zgodność ze scenariuszem:** `dopasuj-kwestie` już szuka kwestii; dochodzi ostrzeżenie, gdy hook nagrany inaczej niż w tekście,
- **wariant B:** gdy nagrany, `warianty-hooka` od razu robi plik testowy (B z nagrania, nie tylko inny napis).

## Etap 7. Testy hooków na IG i uczenie się
- `warianty-hooka` + „rolki testowe” na Instagramie: wariant A normalnie, B jako rolka testowa (do nieobserwujących).
- Do `final/skladniki.json` dochodzą: ocena twarda i jej grupy, ocena recenzenta, przewidywane „zostają po 3 s”,
  typ hooka, słowa w hooku, czas do 1. cięcia, średnie tempo mowy, czy był rehook.
- `algorytm.mjs` liczy, jak dobrze ocena przewiduje % pominięć i utrzymanie (korelacja rang). Od 5 rolek
  wagi testów i udział recenzenta przestawiają się w stronę tych, które naprawdę przewidują wynik, ze ściąganiem
  do wag eksperckich przy małej liczbie danych (jak obecne wagi cech).
- „✦ Claude: wyciągnij wnioski” dopisuje do `wnioski.md` także trafienia i pudła oceny („recenzent przecenia hooki-pytania”).

## Etap 8. Bank hooków z researchu [ZROBIONE 2026-11-19, bez plików wideo: zasada z research/README.md]
- Panel, Start > „📚 Hooki z researchu”: prowadząca wkleja link albo plik rolki, którą zatrzymała. `wzor.mjs` już
  analizuje tempo; dochodzi transkrypcja pierwszych 3 s, klatka 0 i opis wizualu przez Claude, typ hooka, liczba wyświetleń.
- Zapis do `03_BIBLIOTEKA/research/hooki.md` (tabela już jest, pusta).
- Bank służy jako przykłady dla generatora (etap 3) i kotwice dla recenzenta (etap 2). Tylko struktura i mechanizm, nigdy kopiowanie cudzych tekstów.
- Bez pobierania cudzych filmów automatem: tylko to, co prowadząca sama zapisze lub wklei.

---

## Kolejność, czas, testy
| kolejność | etap | daje | zależy od |
|---|---|---|---|
| 1 | 0 + 1 | ocena na żywo, przyciski „Napraw” | nic |
| 2 | 2 | ocena hooka „jak człowiek” | 0 |
| 3 | 3 | najlepszy z 12 hooków zamiast 1 z 3 | 1, 2 |
| 4 | 4 | automatyczne dopracowanie | 1, 2, 3 |
| 5 | 5 | widać dynamikę | 0 |
| 6 | 6 | hook sprawdzony na nagraniu | 1 |
| 7 | 8 | lepsze przykłady dla AI | 2, 3 |
| 8 | 7 | ocena uczy się na wynikach | 1, 2 i opublikowane rolki z wynikami |

Test po każdym etapie: dwa zapisane pomysły (`2026-11-16_142420` ma wyjść słabo w hooku i czytelności,
`2026-11-17_175528` mocno w hooku), jedna rolka z nagraniami (etap 6), panel w przeglądarce, opis w `CLAUDE.md`.
Bez zmian w montażu i szablonach: plan dotyczy scenariusza, oceny i kontroli hooka.

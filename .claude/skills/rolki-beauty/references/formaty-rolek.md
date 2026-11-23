# Formaty rolek z gotową strukturą czasową

Czasy dla wersji 15-30 s (w nawiasie skrót 7-15 s). Cięcia co 1-3 s. Każdy format kończy się CTA. Szablony z `04_SZABLONY_HF/compositions`.

## 1. Przed / po
| czas | co | szablon |
|---|---|---|
| 0-1.5 s | efekt PO na start + hook ("40 minut i takie brwi") | hook-tytul na ujęciu po |
| 1.5-8 s | proces: 3-4 ujęcia po 1-2 s | ujęcia + napisy |
| 8-12 s | porównanie | przed-po (wipe), dopisek obowiązkowy |
| 12-15 s | reakcja klientki / lusterko (tylko ze zgodą) | ujęcie |
| 15-18 s | CTA | cta-koncowe |
Skrót 7-15 s: efekt 1 s, proces 3 s, przed-po 3 s, CTA 2 s.

## 2. POV
| 0-2 s | "POV: pierwszy raz na laminacji" na ujęciu z perspektywy klientki | hook-tytul (wariant slowa) |
| 2-12 s | kolejne etapy z perspektywy fotela, krótkie podpisy | ujęcia + lower-third z etapem |
| 12-15 s | efekt | ujęcie, przejście swiatlo |
| 15-17 s | CTA | cta-koncowe |

## 3. Mit vs fakt
| 0-2 s | "Laminacja niszczy brwi? Sprawdźmy" | hook-tytul (wariant maska) |
| 2-6 s | MIT (plansza albo prowadząca mówi) | hook-tytul tlo plansza, podtekst "mit" |
| 6-16 s | FAKT, wyjaśnienie do kamery | ujęcia mowy + napisy (styl marker) |
| 16-19 s | podsumowanie jednym zdaniem | napisy |
| 19-21 s | CTA "zapisz, przyda się" | cta-koncowe |

## 4. 3 błędy przy...
| 0-1.5 s | "3 błędy przy pielęgnacji stóp" | hook-tytul |
| 1.5-14 s | błąd 1, 2, 3 (każdy ok. 4 s: plansza + ujęcie) | lista-krokow (tlo nagranie) albo naprzemiennie z ujęciami |
| 14-17 s | co robić zamiast | ujęcie + napisy |
| 17-19 s | CTA | cta-koncowe |

## 5. Dzień w gabinecie
| 0-1.5 s | "Dzień w moim gabinecie" + kawa / otwieranie drzwi | hook-tytul |
| 1.5-20 s | 10-14 ujęć po 1-1.5 s: przygotowanie, sterylizacja, klientki (bez twarzy), efekty | ujęcia, przejścia przenikanie/zoom |
| 20-23 s | koniec dnia, zgaszenie światła | ujęcie |
| 23-25 s | CTA | ig-obserwuj + cta-koncowe |
Muzyka: z biblioteki albo w aplikacji IG.

## 6. ASMR zabiegu
| 0-2 s | najbardziej satysfakcjonujący moment (szczoteczka, płatki, frezarka) | ujęcie, krótki tekst "dźwięk ON" |
| 2-20 s | 6-8 dłuższych ujęć (2-3 s), dźwięk z ujęć (`dzwiek: true`), bez voiceovera | ujęcia, przejścia przenikanie |
| 20-24 s | efekt | ujęcie / przed-po |
| 24-26 s | CTA | cta-koncowe (tlo nagranie) |
Napisy wyłączone albo jedno słowo opisu na ujęcie. Podologia: bez trudnych zbliżeń na starcie.

## 7. Q&A (pytanie z komentarza)
| 0-2 s | pytanie z komentarza jako tekst ("Ile trzyma lifting?") | hook-tytul (tlo pigulka) |
| 2-18 s | odpowiedź do kamery, cięcia co 2-3 s, b-roll co drugie zdanie | ujęcia + voiceover + napisy (perla) |
| 18-20 s | "pytaj w komentarzu, odpowiem w kolejnej rolce" | cta-koncowe |

## 8. Trend audio
| 0-1 s | tekst pod trend + pierwszy beat | hook-tytul (wariant skala) |
| 1-12 s | cięcia na beat (beaty: `npx hyperframes beats`), efekty i zbliżenia | ujęcia, przejście flash na drop |
| 12-15 s | CTA | cta-koncowe |
Render BEZ muzyki, audio dodajesz w aplikacji IG. Cięcia rozpisz pod BPM trendu i zanotuj w brief.md, jaki to dźwięk.

## 9. Tekst za postacią
| 0-2 s | duże słowo ZA prowadzącą ("GLOW", "BRWI") | tekst-za-postacia |
| 2-15 s | właściwa treść (edukacja, proces) | ujęcia + napisy |
| 15-17 s | CTA | cta-koncowe |
Nagraj prowadzącą na jednolitym, jasnym tle, kamera na statywie. Potem `npm run wytnij-tlo`.

## 10. Cena / oferta (sprzedaż zabiegu, ale po ludzku)
| 0-2 s | efekt + pytanie ("Ile kosztuje laminacja u mnie?") | hook-tytul |
| 2-10 s | co dostajesz: etapy zabiegu | ujęcia + napisy |
| 10-13 s | cena | cena-oferta |
| 13-16 s | CTA "zapisy: link w bio" | cta-koncowe |
Bez "promocja tylko dziś" i bez presji.

## 11. Vlog / daily
| czas | co | szablon |
|---|---|---|
| 0-2 s | hook dnia ("Mój dzień w gabinecie", "Dzień przed sylwestrem: 9 klientek") nad zajawką końca dnia | hook-tytul |
| 2-35 s | 15-30 klipów po 1-2,5 s w kolejności dnia, cięcia w rytmie (np. 100 BPM), godzina i rozdział przy każdej porze dnia, 1-3 krótkie wstawki do kamery, kilka naturalnych dźwięków głośno ("dźwięk ON") | vlog-godzina, ujęcia |
| ostatnie 2,5 s | CTA ("Obserwuj, jutro kolejny dzień") | cta-koncowe |
Montaż automatyczny: `npm run vlog -- <projekt> --tempo 100 --dlugosc 40` (panel: krok Nagrania > Montaż vlogowy). Klientki bez twarzy albo ze zgodą. Muzykę dobierz w IG o podobnym tempie albo z licencją. Lektor opcjonalnie: tekst pisze Claude, Ty nagrywasz z teleprompterem.

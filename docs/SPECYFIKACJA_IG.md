# Specyfikacja: Instagram Reels i TikTok

Wartości oznaczone **(zmienne)** Instagram i TikTok zmieniają co kilka miesięcy. Sprawdź je w pomocy Meta/TikTok co kwartał i popraw `config.json` -> `safe_zone`.

## Format pliku (nasze ustawienia)
| Parametr | Wartość | Uwagi |
|---|---|---|
| Rozdzielczość | 1080 x 1920 (9:16) | |
| Klatki | 30 fps, stałe (CFR) | |
| Kodek | H.264, yuv420p, AAC 48 kHz | |
| Głośność | ok. -14 LUFS, true peak <= -1 dBTP | IG i TikTok i tak normalizują, ale -14 brzmi dobrze z każdą muzyką |
| Rozmiar | do ok. 250 MB w praktyce | limit IG jest większy **(zmienne)** |

## Długość
| Platforma | Limit | Co nam działa |
|---|---|---|
| Instagram Reels | do 3 min (od 2025) **(zmienne)** | 7-15 s (zasięg), 15-30 s (edukacja), 30-60 s (proces, Q&A) |
| TikTok | do 10 min **(zmienne)** | 15-45 s |
Powyżej 90 s IG może inaczej traktować rolkę w rekomendacjach **(zmienne)**.

## Safe zone (kanwa 1080x1920)
| Strefa | Nasza wartość (`config.json`) | HyperFrames (types/vertical.md) | Uwagi |
|---|---|---|---|
| Góra (pasek, "Rolki", kamera) | 220 px | 168 px | bierzemy ostrożniej, IG ma tu napis "Rolki" i ikony |
| Dół (nick, opis, muzyka) | 420 px | wszystko poniżej 1330 px tylko dekoracja (czyli 590 px) | HF jest ostrzejszy: ważne słowa trzymamy powyżej 1330 px, a pas 1330-1500 px tylko na drobne elementy (lower-third, karta obserwuj) |
| Prawo (serce, komentarz, udostępnij) | 140 px | "bez tekstu pod prawą szyną" | |
| Lewo | 60 px | 90% action-safe = 54 px | |
| Dół napisów | 620 px od dołu | 600-700 px od dołu | |

Podgląd stref: `"debug_safe_zone": true` w `rolka.json` (czerwone = UI IG, niebieska linia = granice HyperFrames, zielona = dół napisów). Render final z włączonym debugiem jest zablokowany.

TikTok ma niżej opis i wyżej przyciski po prawej **(zmienne)**: przy wersji typowo pod TikTok dodaj ok. 60 px do dołu i 20 px do prawej.

## Okładka
- 1080 x 1920 JPG, generuje `npm run okladka`.
- W siatce profilu IG widać środkowy kadr **3:4 (1080 x 1440, od y=240)** **(zmienne: wcześniej 1:1, potem 4:5)**. Tytuł trzymamy w środku tego kadru.
- Tytuł krótki: 2-6 słów, duży, kontrastowy, spójny między rolkami (siatka profilu wygląda jak całość).

## Tekst
- Hook na ekranie: 3-8 słów, max 2 linie, widoczny od 1. klatki.
- Napisy: max 2 linie, 2-4 słowa w grupie, min. 46 px. Słowa kluczowe w kolorze marki.
- Nic do czytania poniżej 28 px.
- Opis: pierwsze ok. 125 znaków widać przed "więcej" **(zmienne)**.
- Hashtagi: 5-10, mieszanka lokalnych i branżowych. IG zaleca 3-5 **(zmienne)**.

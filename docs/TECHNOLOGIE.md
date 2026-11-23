# Technologie: co robi każde narzędzie

Stan na 2026-11-12. HyperFrames CLI 0.9.39 (przypięte w `config.json` -> `hyperframes.wersja`).

| Narzędzie | Co robi | Krok | Komenda w systemie |
|---|---|---|---|
| **HyperFrames** (HeyGen, open source) | HTML/CSS/GSAP renderowane do MP4 przez headless Chrome + FFmpeg. Każda klatka to przewinięta oś czasu, więc render jest powtarzalny. | montaż, render | `zloz`, `render`, `podglad` |
| `hyperframes lint` / `check` | lint: błędy struktury kompozycji. check: lint + layout + kontrast. | przed każdym renderem | `render` robi to sam |
| `hyperframes preview` (Studio) | podgląd w przeglądarce z osią czasu, edycja zmiennych | podgląd | `npm run podglad` |
| `hyperframes render --quality draft/standard/high` | presety jakości (standard = looks, CRF 16; high = delivery) | draft, akceptacja, final | `render`, `render --standard`, `render --final` |
| `hyperframes snapshot` | klatki PNG w wybranych sekundach (do samokontroli Claude) | kontrola | skill rolki-beauty, `okladka` |
| `hyperframes transcribe` | słowa z czasami. Silnik `auto`: **Parakeet** (zainstalowany, obsługuje polski), inaczej whisper.cpp. Zawsze `--language pl`, nigdy modele `.en` (tłumaczą na angielski). | napisy | `npm run transkrybuj` |
| **faster-whisper** (pip) | fallback transkrypcji, gdy HyperFrames nie zadziała | napisy | automatycznie w `transkrybuj` |
| `hyperframes remove-background` | lokalny model AI wycina postać z tła do przezroczystego .webm (pierwszy raz pobiera ok. 170 MB, na CPU ok. 2 klatki/s) | tekst za postacią | `npm run wytnij-tlo` |
| `hyperframes catalog` / `add` | katalog ok. 450 gotowych bloków (przejścia, lower third, social, napisy) instalowanych jako edytowalny kod | nowe szablony | ręcznie, `04_SZABLONY_HF/_katalog` |
| `hyperframes tts` | lektor AI (Kokoro). **Brak głosu polskiego** (są: en, es, fr, hi, it, pt-br, ja, zh). **Nie używamy TTS do treści po polsku.** | nie używamy | |
| `hyperframes media-treatment` | kolor, rozmycie, ziarno na nagraniach (np. rozmycie twarzy bez zgody) | poprawki | ręcznie, skill media-use |
| `hyperframes doctor` | diagnoza środowiska | instalacja | `npm run srodowisko` |
| **auto-editor** (pip) | wycina ciszę i przerwy z nagrań mówionych. Próg -32 dB, margines 0.25 s (oddechy zostają) | przed transkrypcją | `normalizuj --cisza` |
| **FFmpeg / FFprobe** | normalizacja (pion, 30 fps CFR, -14 LUFS, HDR->SDR), pomiary, klatki | wszędzie | `normalizuj`, `sprawdz`, `okladka` |
| **Node.js 22+** | skrypty i HyperFrames CLI | wszędzie | |
| **Python 3.8+** | auto-editor, faster-whisper | | |

Bloki z katalogu użyte w szablonach: `instagram-follow` -> `ig-obserwuj`, `lt-soft-pill` -> `lower-third`, `organic-light-leak-overlay` -> `przejscie-swiatlo`, `editorial-flash-overlay` -> `przejscie-flash`, mechanika `caption-pill-karaoke` / `caption-weight-shift` / `caption-highlight` -> `napisy`, `before-after-wipe` -> `przed-po`.

Uwaga o "shader transitions" z katalogu (light-leak, flash-through-white, cross-warp-morph itd.): w tej wersji to demo, które przechwytuje statyczny DOM do tekstury, a nie przejścia między klipami wideo. Dlatego przejścia na nagraniach robimy nakładkami z katalogu i ruchem GSAP.

## Skille Claude Code

| Skill | Do czego |
|---|---|
| `hyperframes` | kontrakt kompozycji, napisy (captions.md), nakładki (overlays.md), pion (types/vertical.md) |
| `hyperframes-cli` | wszystkie komendy CLI |
| `hyperframes-registry` | katalog bloków (`catalog`, `add`) |
| `media-use` | media: tło, muzyka, kolor, rozmycie, transkrypcja, TTS |
| `rolki-beauty` (nasz) | cały proces rolki, zasady branżowe, hooki, formaty |
| `beauty-reels` (jeśli masz) | pomysły i scenariusze rolek |

Skille z dawnej listy (`hyperframes-media`, `embedded-captions`) w aktualnym pakiecie nie istnieją: ich zawartość jest teraz w `media-use` (media, TTS, transkrypcja, wycinanie) oraz w `hyperframes` (`references/captions.md`) + katalogu (`npx hyperframes catalog --tag caption-style`).

## MCP (opcjonalne, sprawdzone w tej sesji)

| MCP | Status | Gdzie w workflow |
|---|---|---|
| **Higgsfield** | podłączony | `reframe` (poziome nagranie do pionu zamiast cropa, przed `normalizuj`), `upscale_video` (słaba jakość, przed `normalizuj`), `virality_predictor` (na wersji `--standard`, jako wskazówka), `tiktok_music_trending` (pomysł na audio dodawane w aplikacji) |
| **ReelScribe** | podłączony | research hooków konkurencji -> `03_BIBLIOTEKA/research` |
| **HyperFrames MCP (HeyGen, hostowany)** | nie podłączony | niepotrzebny: lokalne CLI robi wszystko. Przydałby się do renderu w chmurze bez lokalnego Chrome. |
| Canva | podłączony | opcjonalnie okładki i grafiki do stories, poza tym systemem |

## Aktualizacja

```bash
npx skills add heygen-com/hyperframes          # odświeża skille HyperFrames w projekcie
npx hyperframes skills update                  # to samo z poziomu CLI
npx hyperframes@latest upgrade --project 04_SZABLONY_HF --check   # co się zmieni w nowej wersji
pip install -U auto-editor faster-whisper
npx hyperframes models install parakeet        # model transkrypcji (raz)
```
Po aktualizacji CLI: zmień `hyperframes.wersja` w `config.json`, przerenderuj bibliotekę (`cd 04_SZABLONY_HF && npx hyperframes render --quality draft -o renders/test.mp4`) i rolkę demo, porównaj.

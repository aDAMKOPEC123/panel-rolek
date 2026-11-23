# Plan: montaż rolek na poziomie premium

Siedem rozszerzeń panelu i skryptów. Wszystko darmowe, lokalne (karta RTX 3050) albo na tokenach Claude.
Każdy punkt kończy się przyciskiem w panelu i opisem w `CLAUDE.md`.

## 1. Claude-reżyser („✦ Claude: obejrzyj i oceń”, krok Sceny)
- Claude składa rolkę, robi klatki co ~0,5 s (`npx hyperframes snapshot`) i czyta transkrypcję, `wnioski.md`, wynik retencji.
- Sam stawia znaczniki w `rolka.json -> znaczniki` z polem `autor: "claude"`, `waga` (krytyczne/ważne/kosmetyka) i propozycją poprawki.
- Ty w panelu: ✓ akceptujesz (zostaje do poprawy) albo ✕ odrzucasz. „✦ Claude: popraw znaczniki” robi resztę (już działa).

## 2. Płynne slow motion i rampy prędkości (`scripts/zwolnij.mjs`)
- RIFE ncnn (Vulkan) dorysowuje klatki pośrednie: gładkie 2-8x wolniej z nagrania 30 kl/s.
- Rampa: normalnie, płynne zwolnienie na efekcie, powrót. Krzywa prędkości z easingiem.
- Wynik `proxy/<klip>_slow.mp4`, podmiana w ujęciu. Panel: Narzędzia ujęcia > „🐢 Slow motion / rampa” (zakres od-do z odtwarzacza).

## 3. Rytm muzyki (`scripts/bity.mjs`)
- Wykrycie uderzeń i BPM z muzyki rolki (ffmpeg: obwiednia energii, onsety, autokorelacja).
- `kompozycja/bity.json`; na osi w panelu tor „rytm”, sceny i znaczniki przyciągają się do bitów.
- Przycisk „Dopasuj do rytmu”: starty scen i cięcia ujęć przesuwane do najbliższego bitu (z limitem przesunięcia).

## 4. Spójny kolor (`scripts/kolor.mjs`)
- Pomiar balansu bieli i odcienia skóry każdego klipu w proxy (średnie kanały w jasnych, neutralnych pikselach + strefa skóry).
- Korekta do ujęcia wzorcowego (colorbalance/colorchannelmixer, delikatnie, bez nasycenia i wygładzania).
- `proxy/<klip>_kolor.mp4` + podmiana. Panel: krok Nagrania > „🎨 Wyrównaj kolor ujęć”.

## 5. Dźwięk premium
- Biblioteka foley generowana lokalnie (`03_BIBLIOTEKA/sfx/foley_*_wlasny.wav`): pęseta, szczoteczka, spray, stuknięcie, szelest.
- Ambient gabinetu (cichy szum pomieszczenia) pod całą rolką, gdy włączone `efekty.ambient`.
- J/L cięcia: `ujecie.dzwiek_wczesniej` (dźwięk następnego ujęcia wchodzi 0,2-0,5 s przed obrazem).
- Panel: krok Styl (Tak/Nie) + przy ujęciu „🔊 dźwięk wcześniej”.

## 6. Rozmyte tło i przesuw ostrości (bez nowego modelu)
- Maska postaci z istniejącego `wytnij-tlo` (lokalny model HyperFrames).
- Szablon `glebia-tla`: tło z nagrania rozmyte, postać ostra; opcjonalny przesuw ostrości (tło ostre -> rozmyte w zadanym czasie).

## 7. „Zrób jak ta rolka”
- Wklejasz plik/link rolki-wzoru. Analiza: cięcia (scdet), długości ujęć, tempo, moment hooka/efektu, gęstość napisów, głośność.
- `kompozycja/wzor.json` + raport w panelu. Claude układa twoje nagrania według tego szkieletu (struktura i rytm, nie cudze materiały).

## Kolejność i test
1 → 2 → 3 → 4 → 5 → 6 → 7, po każdym: lint, złożenie testowej rolki, klatki. Na końcu test w panelu.

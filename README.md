# Panel rolek

Aplikacja do robienia rolek na Instagram i TikTok dla gabinetu beauty: od nagrań z telefonu do gotowego filmu. Claude obejrzy nagrania, zapyta, co chcesz, zmontuje rolkę (HyperFrames), doda napisy i sprawdzi obraz. Do tego plan rolek na tydzień, kalendarz, gotowe pomysły ze scenariuszem, wgrywanie z telefonu przez kod QR i wyniki z Instagrama.

**Aplikacja wymaga kodu licencyjnego od autora.** Bez kodu panel i skrypty nie działają.

## Instalacja (Windows)

1. Zainstaluj programy (w PowerShell):
   ```powershell
   winget install OpenJS.NodeJS.LTS
   winget install Gyan.FFmpeg
   winget install Python.Python.3.12
   npm install -g @anthropic-ai/claude-code
   ```
   Potem w nowym oknie PowerShell zaloguj Claude Code: wpisz `claude` i postępuj według instrukcji.
2. Biblioteki Pythona do analizy obrazu:
   ```powershell
   python -m pip install opencv-python numpy
   python -m pip install --no-deps mediapipe absl-py
   python -m pip install onnxruntime tokenizers ultralytics faster-whisper
   ```
3. Rozpakuj paczkę `panel-rolek_<data>.zip` od autora (albo pobierz repozytorium, jeśli masz do niego dostęp), np. na Pulpit. W paczce jest też `JAK_ZAINSTALOWAC.txt`.
4. Uruchom **`Uruchom panel.bat`**. Otworzy się przeglądarka z panelem.
5. **Wpisz kod licencyjny** (`ROLKI-XXXX-XXXX-XXXX`). Wystarczy raz na komputerze.
6. Przejdź kreator: imię, gabinet, konta, wygląd marki (także ze strony www). Na końcu kreator sprawdzi programy i pokaże komendy do brakujących.

## Instalacja (Mac)

1. Zainstaluj [Homebrew](https://brew.sh) (i wykonaj polecenia „Next steps”, które wypisze), potem w Terminalu:
   ```bash
   brew install node ffmpeg python
   npm install -g @anthropic-ai/claude-code
   python3 -m pip install --user --break-system-packages opencv-python numpy
   python3 -m pip install --user --break-system-packages --no-deps mediapipe absl-py
   python3 -m pip install --user --break-system-packages onnxruntime tokenizers ultralytics faster-whisper
   ```
   Zaloguj Claude Code: `claude`. (`--break-system-packages` jest potrzebne, bo Python z Homebrew nie pozwala instalować bibliotek bez tego; `--user` kładzie je w katalogu użytkownika.)
2. Rozpakuj paczkę i uruchom **`Uruchom panel.command`**: za pierwszym razem prawy przycisk > Otwórz (plik z internetu), później dwuklik.
3. Kod licencyjny i kreator jak na Windows (punkty 5-6).

Na Macu upscaling AI (Real-ESRGAN) i slow motion RIFE potrzebują wersji tych programów dla macOS w `narzedzia/`; bez nich slow motion używa FFmpeg (minterpolate), a ulepszanie trybu szybkiego.

Skille HyperFrames dla Claude (montaż): `npx hyperframes skills update`.
Modele AI do efektów dodatkowych (mapa twarzy, zdjęcie 3D, wycinanie obiektów, upscaling) trafiają do folderu `narzedzia/`; opis w `CLAUDE.md` (sekcja „Jak to działa”).

## Aktualizacja istniejącej instalacji

1. Zamknij okno, z którego uruchamiasz panel.
2. Pobierz `panel-rolek.zip` i rozpakuj paczkę do **osobnego folderu**. [Pobierz najnowszą wersję](https://github.com/aDAMKOPEC123/panel-rolek/releases/latest/download/panel-rolek.zip)
3. Otwórz w nowym folderze **Aktualizuj panel.bat** (Windows) lub **Aktualizuj panel.command** (Mac). Wklej ścieżkę do folderu dotychczasowej instalacji.
4. Uruchom panel z dotychczasowego folderu.

Aktualizator zachowuje projekty, nagrania, kalendarz, bibliotekę, ustawienia marki i aktywację licencji. Zastąpione pliki aplikacji trafiają do kopii `.kopia-aktualizacji-*` w folderze instalacji.

Na Macu możesz też uruchomić aktualizator z Terminala poleceniem `node scripts/aktualizuj.mjs "/ścieżka/do/starej/instalacji"` z folderu rozpakowanej paczki.

Jeśli masz instalację sklonowaną przez Git, zaktualizuj ją w terminalu na gałęzi `main`.

```sh
git fetch origin main
git merge --ff-only --no-overwrite-ignore origin/main
```

## Co jest w repozytorium, a czego nie ma

W repozytorium jest sam kod aplikacji, szablony scen i dokumentacja. Nie ma tu i nigdy nie powinno być:
- nagrań i rolek (`01_PROJEKTY/`, `00_INBOX/`, `05_ARCHIWUM/`): twarze klientek, RODO,
- ustawień gabinetu (`config.json`, `02_BRAND/`): nowa instalacja dostaje neutralne pliki z `szablon_startowy/`,
- tokenów (Instagram) i aktywacji licencji (`.licencja.json`),
- muzyki z licencją (zwykle nie wolno jej rozpowszechniać) i modeli AI (`narzedzia/`).

Wszystko to jest w `.gitignore`.

## Dla autora: paczka do wysłania

`npm run paczka` tworzy na Pulpicie `panel-rolek_<data>.zip` z ostatniego commita, instrukcją i spisem plików do aktualizacji. Skrypt sprawdza zawartość przed zapisaniem ZIP-a. Możesz podać ścieżkę przez `npm run paczka -- --out .wydania/panel-rolek.zip`. Aby działał stały link do pobrania, dołącz plik `panel-rolek.zip` do wydania w sekcji Releases. Kody licencyjne przekazuj odbiorcom osobno.

## Licencja

Kody licencyjne wydaje autor. W repozytorium są tylko ich skróty (`licencja/kody.json`, scrypt z solą), z których nie da się odczytać ani wygenerować kodu. Kod wpisany w panelu zapisuje się lokalnie w `.licencja.json`. Zmiana albo unieważnienie kodów: autor aktualizuje `licencja/kody.json` w repozytorium.

Oprogramowanie prywatne. Kopiowanie, udostępnianie i używanie bez kodu od autora jest niedozwolone.

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
   python -m pip install onnxruntime ultralytics faster-whisper
   ```
3. Pobierz repozytorium (przycisk **Code > Download ZIP** albo `git clone`) i rozpakuj, np. na Pulpit.
4. Uruchom **`Uruchom panel.bat`**. Otworzy się przeglądarka z panelem.
5. **Wpisz kod licencyjny** (`ROLKI-XXXX-XXXX-XXXX`). Wystarczy raz na komputerze.
6. Przejdź kreator: imię, gabinet, konta, wygląd marki (także ze strony www). Na końcu kreator sprawdzi programy i pokaże komendy do brakujących.

Skille HyperFrames dla Claude (montaż): `npx hyperframes skills update`.
Modele AI do efektów dodatkowych (mapa twarzy, zdjęcie 3D, wycinanie obiektów, upscaling) trafiają do folderu `narzedzia/`; opis w `CLAUDE.md` (sekcja „Jak to działa”).

## Co jest w repozytorium, a czego nie ma

W repozytorium jest sam kod aplikacji, szablony scen i dokumentacja. Nie ma tu i nigdy nie powinno być:
- nagrań i rolek (`01_PROJEKTY/`, `00_INBOX/`, `05_ARCHIWUM/`): twarze klientek, RODO,
- ustawień gabinetu (`config.json`, `02_BRAND/`): nowa instalacja dostaje neutralne pliki z `szablon_startowy/`,
- tokenów (Instagram) i aktywacji licencji (`.licencja.json`),
- muzyki z licencją (zwykle nie wolno jej rozpowszechniać) i modeli AI (`narzedzia/`).

Wszystko to jest w `.gitignore`.

## Licencja

Kody licencyjne wydaje autor. W repozytorium są tylko ich skróty (`licencja/kody.json`, scrypt z solą), z których nie da się odczytać ani wygenerować kodu. Kod wpisany w panelu zapisuje się lokalnie w `.licencja.json`. Zmiana albo unieważnienie kodów: autor aktualizuje `licencja/kody.json` w repozytorium.

Oprogramowanie prywatne. Kopiowanie, udostępnianie i używanie bez kodu od autora jest niedozwolone.

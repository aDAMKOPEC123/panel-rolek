// Paczka ZIP do wysłania (bez konta na GitHubie): czysta kopia aplikacji z ostatniego commita + instrukcja instalacji.
//   npm run paczka
// Zawartość = dokładnie to, co jest w repozytorium (git archive HEAD), więc nigdy nie trafiają tu nagrania, config.json,
// marka, tokeny, aktywacja ani kody (są w .gitignore). Wynik: Pulpit/panel-rolek_<data>.zip
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawnSync } from "node:child_process";
import { ROOT, blad, ok, info, uwaga, dzis } from "./lib.mjs";

const git = (...a) => spawnSync("git", a, { cwd: ROOT, encoding: "utf8" });
if (git("rev-parse", "--is-inside-work-tree").status !== 0) blad("Ten folder nie jest repozytorium Git.", "Paczkę robi się z repozytorium (git init + commit).");
const sha = git("rev-parse", "--short", "HEAD").stdout.trim();
const dataCommita = git("log", "-1", "--format=%cd", "--date=format:%Y-%m-%d %H:%M").stdout.trim();
const zmiany = git("status", "--porcelain", "--untracked-files=no").stdout.trim();
if (zmiany) uwaga(`Masz niezapisane zmiany w ${zmiany.split("\n").length} plikach aplikacji: paczka ma ostatni commit (${sha}, ${dataCommita}), bez nich.`);

// pliki dokładane do paczki (poza repozytorium)
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "paczka-"));
const instr = path.join(tmp, "JAK_ZAINSTALOWAC.txt");
fs.writeFileSync(instr, "﻿" + `PANEL ROLEK: instalacja
=======================

Do uruchomienia potrzebujesz KODU LICENCYJNEGO (ROLKI-XXXX-XXXX-XXXX), który dostałaś razem z tą paczką.
Masz Maca? Przewiń niżej do części „MAC”.

WINDOWS
-------

1. Rozpakuj ten plik ZIP, np. na Pulpit (kliknij prawym > Wyodrębnij wszystkie).

2. Zainstaluj programy. Otwórz PowerShell (menu Start > wpisz "PowerShell") i wklej po kolei:
     winget install OpenJS.NodeJS.LTS
     winget install Gyan.FFmpeg
     winget install Python.Python.3.12
   Zamknij PowerShell i otwórz go jeszcze raz, potem wklej:
     npm install -g @anthropic-ai/claude-code
     python -m pip install opencv-python numpy
   Na koniec wpisz:  claude
   i zaloguj się na swoje konto Claude (to „mózg” aplikacji: montaż, pomysły, scenariusze).

3. W rozpakowanym folderze kliknij dwa razy: Uruchom panel.bat
   Otworzy się przeglądarka z panelem. Nie zamykaj czarnego okna, dopóki pracujesz.

4. Wpisz kod licencyjny i kliknij „Aktywuj”. Wystarczy raz na tym komputerze.

5. Przejdź kreator: imię, gabinet, konta, wygląd marki. Na końcu panel sprawdzi programy
   i pokaże komendę do każdego brakującego (skopiuj, wklej w PowerShell, Enter).

Dodatki (opcjonalnie, do wybranych efektów): w PowerShell
     python -m pip install --no-deps mediapipe absl-py
     python -m pip install onnxruntime ultralytics faster-whisper
     npx hyperframes skills update

MAC
---

1. Rozpakuj ten plik ZIP (dwuklik w Finderze), najlepiej w folderze Dokumenty albo na Biurku.

2. Zainstaluj programy. Otwórz Terminal (Cmd + spacja, wpisz "Terminal", Enter).
   Najpierw Homebrew (instalator programów), wklej i naciśnij Enter, potem podaj hasło do Maca:
     /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
   Na końcu Homebrew wypisze 2-3 polecenia „Next steps” (echo ... >> ~/.zprofile): wklej je też.
   Zamknij Terminal, otwórz go jeszcze raz i wklej po kolei:
     brew install node ffmpeg python
     npm install -g @anthropic-ai/claude-code
     python3 -m pip install --user --break-system-packages opencv-python numpy
   Na koniec wpisz:  claude
   i zaloguj się na swoje konto Claude.

3. W rozpakowanym folderze kliknij PRAWYM przyciskiem: Uruchom panel.command > Otwórz > Otwórz.
   (Pierwszy raz macOS pyta, czy na pewno, bo plik jest z internetu. Później wystarczy dwuklik.)
   Gdyby macOS i tak nie pozwolił: Ustawienia systemowe > Prywatność i ochrona > na dole „Otwórz mimo to”.
   Otworzy się przeglądarka z panelem. Nie zamykaj okna Terminala, dopóki pracujesz.

4. Wpisz kod licencyjny i kliknij „Aktywuj”. Potem kreator, jak wyżej w części Windows (punkt 5).

Dodatki (opcjonalnie): w Terminalu
     python3 -m pip install --user --break-system-packages --no-deps mediapipe absl-py
     python3 -m pip install --user --break-system-packages onnxruntime ultralytics faster-whisper
     npx hyperframes skills update
   Upscaling AI (Final w 4K, „Ulepsz jakość”) i płynne slow motion RIFE potrzebują programów
   w wersji dla Maca w folderze narzedzia/. Bez nich slow motion działa prostszą metodą,
   a „Ulepsz jakość” ma tryb szybki bez AI.

WSZYSTKIE KOMPUTERY
-------------------

Nowa wersja aplikacji: rozpakuj nową paczkę W MIEJSCE starej (zastąp pliki).
Twoje nagrania, rolki, ustawienia i aktywacja zostają, bo nie ma ich w paczce.

Kodu licencyjnego nie udostępniaj innym osobom.
`.replace(/\n/g, "\r\n"));
const wersja = path.join(tmp, "WERSJA.txt");
fs.writeFileSync(wersja, "﻿" + `Panel rolek, wersja ${sha} z ${dataCommita} (paczka z ${dzis()})\r\n`);

const out = path.join(os.homedir(), "Desktop", `panel-rolek_${dzis()}.zip`);
fs.rmSync(out, { force: true });
const r = git("archive", "--format=zip", "--prefix=panel-rolek/", `--add-file=${instr}`, `--add-file=${wersja}`, "-o", out, "HEAD");
fs.rmSync(tmp, { recursive: true, force: true });
if (r.status !== 0 || !fs.existsSync(out)) blad("Nie udało się zrobić paczki.", (r.stderr || "").slice(-300));

// kontrola: lista plików w ZIP-ie bez rzeczy prywatnych
// paczka = dokładnie commit HEAD + 2 dodane pliki, więc lista z git ls-tree jest pełną listą zawartości ZIP-a
const wCommicie = git("ls-tree", "-r", "--name-only", "HEAD").stdout.split(/\r?\n/).filter(Boolean);
if (!wCommicie.length) blad("Nie udało się odczytać listy plików z commita.");
const lista = [...wCommicie, "JAK_ZAINSTALOWAC.txt", "WERSJA.txt"].map((n) => `panel-rolek/${n}`);
const PRYWATNE = /^panel-rolek\/(config\.json|\.licencja\.json|narzedzia\/|02_BRAND\/(autopilot|kolory|caption-skin|instagram)|01_PROJEKTY\/(?!_SZABLON_ROLKI|README)|05_ARCHIWUM\/(?!README)|00_INBOX\/(?!README)|03_BIBLIOTEKA\/(muzyka|sfx|research)\/(?!README|kotwice)|.*KODY_LICENCJI)/;
const zle = lista.filter((n) => PRYWATNE.test(n));
if (zle.length) { fs.rmSync(out, { force: true }); blad(`Paczka zawierała prywatne pliki (${zle.slice(0, 5).join(", ")}). Usunięta.`, "Sprawdź .gitignore i commit."); }
ok(`Paczka gotowa: ${out}`);
info(`  ${lista.filter((n) => !n.endsWith("/")).length} plików, ${(fs.statSync(out).size / 1048576).toFixed(1)} MB, wersja ${sha} (${dataCommita}), w środku JAK_ZAINSTALOWAC.txt`);
info("  Wyślij ją linkiem (Google Drive, WeTransfer) razem z jednym kodem z KODY_LICENCJI_panel-rolek.txt.");

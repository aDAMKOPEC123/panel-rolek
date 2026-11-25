// Paczka ZIP do wysłania (bez konta na GitHubie): czysta kopia aplikacji z ostatniego commita + instrukcja instalacji.
//   npm run paczka
// Zawartość = dokładnie to, co jest w repozytorium (git archive HEAD), więc nigdy nie trafiają tu nagrania, config.json,
// marka, tokeny, aktywacja ani kody (są w .gitignore). Wynik: Pulpit/panel-rolek_<data>.zip
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawnSync } from "node:child_process";
import { ROOT, blad, ok, info, uwaga, dzis } from "./lib.mjs";
import { plikAplikacji, skrotPlikuGit } from "./aktualizuj.mjs";

const git = (...a) => spawnSync("git", a, { cwd: ROOT, encoding: "utf8" });
if (git("rev-parse", "--is-inside-work-tree").status !== 0) blad("Ten folder nie jest repozytorium Git.", "Paczkę robi się z repozytorium (git init + commit).");
const sha = git("rev-parse", "--short", "HEAD").stdout.trim();
const algorytm = git("rev-parse", "--show-object-format").stdout.trim();
const dataCommita = git("log", "-1", "--format=%cd", "--date=format:%Y-%m-%d %H:%M").stdout.trim();
const zmiany = git("status", "--porcelain", "--untracked-files=no").stdout.trim();
if (zmiany) uwaga(`Masz niezapisane zmiany w ${zmiany.split("\n").length} plikach aplikacji: paczka ma ostatni commit (${sha}, ${dataCommita}), bez nich.`);

const drzewo = git("ls-tree", "-rz", "--full-tree", "HEAD");
const wpisy = drzewo.stdout.split("\0").filter(Boolean).map((wpis) => {
  const tab = wpis.indexOf("\t");
  const [tryb, typ, skrot] = wpis.slice(0, tab).split(" ");
  return { tryb, typ, skrot, sciezka: wpis.slice(tab + 1) };
});
if (drzewo.status !== 0 || !wpisy.length) blad("Nie udało się odczytać listy plików z commita.");
const skopiuj = new Set(wpisy.filter(({ sciezka }) => plikAplikacji(sciezka)).map(({ sciezka }) => sciezka));
if (!["package.json", "panel/server.mjs", "scripts/aktualizuj.mjs"].every((n) => skopiuj.has(n))) blad("W ostatnim commicie brakuje plików aktualizatora.");
const pryw = /^(?:config\.json$|\.licencja\.json$|narzedzia\/|(?:00_INBOX|05_ARCHIWUM)\/(?!README\.md$)|01_PROJEKTY\/(?!(?:README\.md$|_SZABLON_ROLKI\/))|02_BRAND\/(?!(?:README\.md|brand\.md|(?:logo|watermark|fonty)\/README\.md)$)|03_BIBLIOTEKA\/(?:muzyka|sfx|research)\/(?!(?:README\.md|kotwice-hookow\.json)$)|\.wydania\/|\.kopia-aktualizacji-|.*KODY_LICENCJI)/u;
const niedozwolone = wpisy.filter(({ sciezka, tryb, typ }) => pryw.test(sciezka) || typ !== "blob" || !/^100(?:644|755)$/.test(tryb));
if (niedozwolone.length) blad(`Commit zawiera pliki, których nie można dołączyć do paczki: ${niedozwolone.slice(0, 5).map((p) => p.sciezka).join(", ")}.`);
const idx = process.argv.indexOf("--out");
const nazwaWyniku = idx >= 0 ? process.argv[idx + 1] : path.join(os.homedir(), "Desktop", `panel-rolek_${dzis()}.zip`);
if (!nazwaWyniku || !/\.zip$/iu.test(nazwaWyniku)) blad("Podaj docelowy plik .zip po --out.");

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
     python -m pip install onnxruntime tokenizers ultralytics faster-whisper
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
     python3 -m pip install --user --break-system-packages onnxruntime tokenizers ultralytics faster-whisper
     npx hyperframes skills update
   Upscaling AI (Final w 4K, „Ulepsz jakość”) i płynne slow motion RIFE potrzebują programów
   w wersji dla Maca w folderze narzedzia/. Bez nich slow motion działa prostszą metodą,
   a „Ulepsz jakość” ma tryb szybki bez AI.

WSZYSTKIE KOMPUTERY
-------------------

Aktualizacja istniejącej instalacji
1. Zamknij panel i okno, z którego został uruchomiony.
2. Rozpakuj nowy ZIP w osobnym folderze.
3. W nowym folderze otwórz „Aktualizuj panel.bat” (Windows) albo „Aktualizuj panel.command” (Mac).
4. Wklej ścieżkę do folderu dotychczasowej instalacji i naciśnij Enter.
5. Po aktualizacji uruchom panel z dotychczasowego folderu.

Aktualizator kopiuje pliki aplikacji i zachowuje kopię zastąpionych plików.
Projekty, nagrania, kalendarz, marka, ustawienia, biblioteka i aktywacja zostają na miejscu.

Kodu licencyjnego nie udostępniaj innym osobom.
`.replace(/\n/g, "\r\n"));
const wersja = path.join(tmp, "WERSJA.txt");
fs.writeFileSync(wersja, "﻿" + `Panel rolek, wersja ${sha} z ${dataCommita} (paczka z ${dzis()})\r\n`);
const manifest = path.join(tmp, "AKTUALIZACJA.json");
const dodatkowe = [instr, wersja];
const pliki = [
  ...wpisy.filter((p) => skopiuj.has(p.sciezka)).map(({ sciezka, skrot, tryb }) => ({ sciezka, skrot, wykonywalny: tryb === "100755" })),
  ...dodatkowe.map((p) => ({ sciezka: path.basename(p), skrot: skrotPlikuGit(fs.readFileSync(p), algorytm), wykonywalny: false })),
];
fs.writeFileSync(manifest, JSON.stringify({ format: 1, wersja: sha, algorytm, pliki }, null, 2) + "\n");

const out = path.resolve(nazwaWyniku), czesc = `${out}.${process.pid}.czesc`;
fs.mkdirSync(path.dirname(out), { recursive: true });
try {
  const r = git("-c", "core.autocrlf=false", "-c", "core.eol=lf", "archive", "--format=zip", "--prefix=panel-rolek/", ...[...dodatkowe, manifest].map((p) => `--add-file=${p}`), "-o", czesc, "HEAD");
  if (r.status !== 0 || !fs.existsSync(czesc)) throw new Error((r.stderr || "").slice(-300));
  fs.renameSync(czesc, out);
} catch (e) {
  process.exitCode = 1;
  console.error(`Nie udało się zrobić paczki. ${e.message}`);
} finally {
  fs.rmSync(czesc, { force: true });
  for (const p of [...dodatkowe, manifest]) fs.rmSync(p, { force: true });
  fs.rmdirSync(tmp);
}
if (process.exitCode) process.exit(process.exitCode);
ok(`Paczka gotowa: ${out}`);
info(`  ${wpisy.length + dodatkowe.length + 1} plików, ${(fs.statSync(out).size / 1048576).toFixed(1)} MB, wersja ${sha} (${dataCommita}), w środku instrukcja i aktualizator.`);
info("  Wyślij ją linkiem (Google Drive, WeTransfer) razem z jednym kodem z KODY_LICENCJI_panel-rolek.txt.");

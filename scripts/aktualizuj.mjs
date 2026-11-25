// Uruchamiany z rozpakowanej paczki. Działa również przed aktywacją licencji.
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createInterface } from "node:readline/promises";

const główne = new Set([
  "Aktualizuj panel.bat", "Aktualizuj panel.command", "Uruchom panel.bat", "Uruchom panel.command",
  "package.json", "skills-lock.json", ".gitattributes", ".gitignore", "README.md", "CLAUDE.md", "WERSJA.txt", "JAK_ZAINSTALOWAC.txt",
  "licencja/kody.json",
]);

export function plikAplikacji(nazwa) {
  if (typeof nazwa !== "string" || nazwa.split("/").some((c) => !c || c === "." || c === ".." || /[\\:\u0000-\u001f]|[. ]$/.test(c) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(c))) return false;
  if (główne.has(nazwa)) return true;
  if (nazwa.split("/").some((c) => c.startsWith(".")) && !nazwa.startsWith(".claude/skills/rolki-beauty/")) return false;
  return /^(?:scripts\/[^/]+\.(?:mjs|py|md)|panel\/(?:[^/]+\.mjs|README\.md|public\/.+\.(?:js|css|html|jpg|png|woff2)|telefon\/telefon\.html)|docs\/.+\.md|szablon_startowy\/.+\.(?:json|md)|\.claude\/skills\/rolki-beauty\/.+\.md|04_SZABLONY_HF\/(?:[^/]+\.(?:html|json|md)|(?:_katalog|compositions|okladka)\/.+\.html|assets\/demo\/.+\.(?:mp4|webm|png|jpg)))$/u.test(nazwa);
}

export function skrotPlikuGit(bufor, algorytm = "sha1") {
  return createHash(algorytm).update(`blob ${bufor.length}\0`).update(bufor).digest("hex");
}

function zgodnySkrot(plik, skrot, algorytm) {
  const bufor = fs.readFileSync(plik);
  if (skrotPlikuGit(bufor, algorytm) === skrot) return true;
  // Git zapisuje skrypty .bat z CRLF w ZIP-ie, a ich obiekty w repozytorium z LF.
  return plik.endsWith(".bat") && skrotPlikuGit(Buffer.from(bufor.toString("latin1").replace(/\r\n/g, "\n"), "latin1"), algorytm) === skrot;
}

function stanPliku(katalog, nazwa) {
  const elementy = nazwa.split("/");
  let p = katalog;
  for (const [i, element] of elementy.entries()) {
    p = path.join(p, element);
    const st = fs.lstatSync(p, { throwIfNoEntry: false });
    if (!st) return { plik: path.join(katalog, nazwa), istnieje: false };
    if (i === elementy.length - 1 ? !st.isFile() : !st.isDirectory()) throw new Error(`Nie można bezpiecznie zapisać ścieżki „${nazwa}”.`);
  }
  return { plik: p, istnieje: true };
}

function zastapPlik(zrodlo, cel, wykonywalny) {
  fs.mkdirSync(path.dirname(cel), { recursive: true });
  const czesc = `${cel}.${process.pid}.czesc`;
  fs.copyFileSync(zrodlo, czesc, fs.constants.COPYFILE_EXCL);
  try {
    if (wykonywalny && process.platform !== "win32") fs.chmodSync(czesc, 0o755);
    fs.renameSync(czesc, cel);
  } finally { fs.rmSync(czesc, { force: true }); }
}

export function aktualizuj(zPaczką, instalacja) {
  const paczka = fs.realpathSync(zPaczką), cel = fs.realpathSync(instalacja);
  if (paczka === cel) throw new Error("Wybierz folder dotychczasowej instalacji. Paczkę rozpakuj osobno.");
  const serwer = stanPliku(cel, "panel/server.mjs"), ustawienia = stanPliku(cel, "package.json");
  if (!serwer.istnieje || !ustawienia.istnieje || JSON.parse(fs.readFileSync(ustawienia.plik, "utf8")).name !== "rolki-beauty") {
    throw new Error("Wybierz folder, w którym jest zainstalowany Panel rolek.");
  }
  const manifest = stanPliku(paczka, "AKTUALIZACJA.json");
  if (!manifest.istnieje) throw new Error("Pobierz paczkę panel-rolek.zip z sekcji Releases na GitHubie.");
  const { format, wersja, algorytm, pliki } = JSON.parse(fs.readFileSync(manifest.plik, "utf8"));
  if (format !== 1 || !/^[a-f0-9]{7,64}$/u.test(wersja) || !["sha1", "sha256"].includes(algorytm) || !Array.isArray(pliki)) throw new Error("Paczka ma nieprawidłowy spis plików.");
  const nazwy = new Set(), zmiany = [];
  for (const u of pliki) {
    const n = u?.sciezka;
    if (!plikAplikacji(n) || nazwy.has(n.toLowerCase())) throw new Error(`Niedozwolona lub powtórzona ścieżka w paczce: ${n}.`);
    nazwy.add(n.toLowerCase());
    const zrodlo = stanPliku(paczka, n), stan = stanPliku(cel, n);
    if (!zrodlo.istnieje || !zgodnySkrot(zrodlo.plik, u.skrot, algorytm)) throw new Error(`Paczka jest niekompletna lub uszkodzona: ${n}.`);
    const wykonywalny = u.wykonywalny === true;
    const prawaPoprawne = !stan.istnieje || !wykonywalny || process.platform === "win32" || !!(fs.statSync(stan.plik).mode & 0o100);
    if (!stan.istnieje || !prawaPoprawne || !zgodnySkrot(stan.plik, u.skrot, algorytm)) zmiany.push({ ...stan, zrodlo: zrodlo.plik, sciezka: n, wykonywalny });
  }
  if (!["panel/server.mjs", "scripts/aktualizuj.mjs", "package.json"].every((n) => nazwy.has(n))) throw new Error("Paczka nie zawiera kompletu aplikacji.");
  if (!zmiany.length) return { wersja, liczba: 0 };

  const kopia = fs.mkdtempSync(path.join(cel, ".kopia-aktualizacji-"));
  for (const k of zmiany.filter((z) => z.istnieje)) {
    const doKopii = path.join(kopia, k.sciezka);
    fs.mkdirSync(path.dirname(doKopii), { recursive: true });
    fs.copyFileSync(k.plik, doKopii);
  }
  const zapisane = [];
  try {
    for (const z of zmiany) {
      zastapPlik(z.zrodlo, z.plik, z.wykonywalny);
      zapisane.push(z);
    }
  } catch (e) {
    const bledy = [];
    for (const z of zapisane.reverse()) {
      try {
        if (z.istnieje) zastapPlik(path.join(kopia, z.sciezka), z.plik);
        else fs.rmSync(z.plik, { force: true });
      } catch { bledy.push(z.sciezka); }
    }
    throw new Error(bledy.length ? `Zapis przerwany. Przywróć z kopii ${kopia} następujące pliki: ${bledy.join(", ")}.` : `Zapis przerwany. Przywrócono poprzednią aplikację. ${e.message}`);
  }
  return { wersja, liczba: zmiany.length, kopia };
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  try {
    let folder = process.argv[2];
    if (!folder) {
      const pytanie = createInterface({ input: process.stdin, output: process.stdout });
      try {
        console.log("Zamknij okno uruchomionego Panelu rolek. Wskaż folder dotychczasowej instalacji.");
        folder = (await pytanie.question("Ścieżka do folderu: ")).trim().replace(/^(["'])(.*)\1$/, "$2");
      } finally { pytanie.close(); }
    }
    if (!folder) throw new Error("Nie wybrano folderu instalacji.");
    const { wersja, liczba, kopia } = aktualizuj(fileURLToPath(new URL("../", import.meta.url)), folder);
    console.log(liczba ? `Zaktualizowano ${liczba} plików aplikacji do wersji ${wersja}.` : `Panel ma już wersję ${wersja}.`);
    if (kopia) console.log(`Kopia zastąpionych plików: ${kopia}`);
    console.log("Uruchom panel z folderu dotychczasowej instalacji.");
  } catch (e) { console.error(`Aktualizacja przerwana. ${e.message}`); process.exitCode = 1; }
}

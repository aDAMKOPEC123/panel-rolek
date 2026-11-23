// Tworzy nowy projekt rolki z 01_PROJEKTY/_SZABLON_ROLKI.
//   npm run nowa-rolka -- <kategoria> "<temat>" [--data RRRR-MM-DD] [--z-inbox] [--styl <id>]
// Kategorie: brwi, rzesy, twarz, podologia, pedicure, gabinet, edukacja
// --z-inbox przenosi wszystkie pliki z 00_INBOX do raw/ nowej rolki.
import fs from "node:fs";
import path from "node:path";
import { ROOT, PROJEKTY, SZABLON_ROLKI, KATEGORIE, blad, ok, info, uwaga, slug, dzis, ustawWBrief } from "./lib.mjs";
import { stylDlaNowych, wczytajStyl } from "./style-marki.mjs";

const args = process.argv.slice(2);
const flaga = (n) => { const i = args.indexOf(n); return i >= 0 ? args.splice(i, 2)[1] : null; };
const data = flaga("--data") || dzis();
const stylArg = flaga("--styl");
if (stylArg && !wczytajStyl(stylArg)) blad(`Nie ma stylistyki "${stylArg}".`, "Lista: npm run styl -- --lista");
const zInbox = args.includes("--z-inbox");
const pos = args.filter((a) => !a.startsWith("--"));
const [kat, ...tematCz] = pos;
const temat = tematCz.join(" ");

if (!kat) blad("Podaj kategorię i temat.", `npm run nowa-rolka -- brwi "laminacja brwi"   (kategorie: ${KATEGORIE.join(", ")})`);
const kategoria = slug(kat).replace(/-/g, "");
if (!KATEGORIE.includes(kategoria)) blad(`Nieznana kategoria "${kat}".`, `Wybierz jedną z: ${KATEGORIE.join(", ")}`);
if (!temat) blad("Podaj temat rolki w cudzysłowie.", `npm run nowa-rolka -- ${kategoria} "krótki temat"`);
if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) blad(`Zła data "${data}".`, "Format: RRRR-MM-DD, np. 2026-11-12");
if (!fs.existsSync(SZABLON_ROLKI)) blad("Brak folderu 01_PROJEKTY/_SZABLON_ROLKI.", "Przywróć szablon rolki z kopii.");

const nazwa = `${data}_${kategoria}_${slug(temat)}`;
const cel = path.join(PROJEKTY, nazwa);
if (fs.existsSync(cel)) blad(`Projekt ${nazwa} już istnieje.`, "Zmień temat albo datę (--data).");

fs.cpSync(SZABLON_ROLKI, cel, { recursive: true, filter: (src) => !/[\\/](render|final|proxy)[\\/].+\.(mp4|mov|jpg)$/i.test(src) });
ustawWBrief(cel, "tytuł roboczy", temat);
ustawWBrief(cel, "data utworzenia", data);
ustawWBrief(cel, "kategoria", kategoria);
ustawWBrief(cel, "status", "nowa");
const rj = path.join(cel, "kompozycja", "rolka.json");
if (fs.existsSync(rj)) {
  const r = JSON.parse(fs.readFileSync(rj, "utf8"));
  r.tytul = temat;
  r.kategoria = kategoria;
  // stylistyka: --styl <id> albo wybrana dla nowych rolek (panel Start, 02_BRAND/style/_ustawienia.json)
  const st = stylArg || stylDlaNowych();
  if (st && st !== "marka") r.styl = st; else delete r.styl;
  fs.writeFileSync(rj, JSON.stringify(r, null, 2) + "\n");
}

if (zInbox) {
  const inbox = path.join(ROOT, "00_INBOX");
  const pliki = fs.readdirSync(inbox).filter((n) => n.toLowerCase() !== "readme.md" && fs.statSync(path.join(inbox, n)).isFile());
  for (const p of pliki) fs.renameSync(path.join(inbox, p), path.join(cel, "raw", p));
  if (pliki.length) ok(`Przeniesiono z 00_INBOX do raw/: ${pliki.length} plik(ów)`);
  else uwaga("00_INBOX jest pusty, nic nie przeniesiono.");
}

ok(`Nowa rolka: 01_PROJEKTY/${nazwa}`);
info(`
Dalej:
  1. Wrzuć nagrania do 01_PROJEKTY/${nazwa}/raw/  (albo: npm run inbox -- --do ${nazwa})
  2. Uzupełnij brief.md (cel, długość, zgoda na wizerunek!)
  3. npm run normalizuj -- ${nazwa} --cisza
  4. npm run transkrybuj -- ${nazwa} proxy/<klip z mową>.mp4
  5. Ułóż kompozycja/rolka.json, potem: npm run zloz -- ${nazwa} && npm run podglad -- ${nazwa}`);

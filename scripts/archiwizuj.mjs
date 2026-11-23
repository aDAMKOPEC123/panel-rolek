// Archiwizacja opublikowanej rolki: przenosi projekt do 05_ARCHIWUM i zapisuje wyniki.
//   npm run archiwizuj -- <projekt>                     -> pyta o link i wyniki
//   npm run archiwizuj -- <projekt> --link URL --zasieg 1200 --zapisy 40 --udostepnienia 12 [--odchudz]
//   npm run archiwizuj -- --wyniki <projekt w archiwum>  -> dopisuje/aktualizuje wyniki po czasie (np. po 7 dniach)
// --odchudz usuwa proxy/, render/ i kompozycja/assets (zostają raw/, final/, napisy, kompozycja).
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline/promises";
import { PROJEKTY, ARCHIWUM, blad, ok, info, uwaga, znajdzProjekt, czytajBrief, ustawWBrief, dzis } from "./lib.mjs";

const args = process.argv.slice(2);
const flaga = (n) => { const i = args.indexOf(n); return i >= 0 ? args.splice(i, 2)[1] : null; };
const POLA = [
  ["link", "Link do rolki"], ["data_publikacji", "Data publikacji (RRRR-MM-DD)"], ["zasieg", "Zasięg (konta)"],
  ["wyswietlenia", "Wyświetlenia"], ["polubienia", "Polubienia"], ["komentarze", "Komentarze"],
  ["zapisy", "Zapisania"], ["udostepnienia", "Udostępnienia"], ["obserwujacy", "Nowi obserwujący z rolki"],
  ["rezerwacje", "Rezerwacje/wiadomości po rolce"], ["notatka", "Notatka (co zadziałało)"],
];
const tylkoWyniki = flaga("--wyniki");
const dane = {};
for (const [k] of POLA) { const v = flaga("--" + k); if (v != null) dane[k] = v; }
const odchudz = args.includes("--odchudz");

let proj;
if (tylkoWyniki) {
  proj = fs.existsSync(path.join(ARCHIWUM, tylkoWyniki)) ? path.join(ARCHIWUM, tylkoWyniki)
    : (() => { const m = fs.readdirSync(ARCHIWUM).filter((n) => n.includes(tylkoWyniki)); if (m.length !== 1) blad(`Nie znalazłam jednoznacznie "${tylkoWyniki}" w 05_ARCHIWUM.`, "Podaj pełną nazwę folderu."); return path.join(ARCHIWUM, m[0]); })();
} else {
  proj = znajdzProjekt(args.find((a) => !a.startsWith("--")));
  if (!fs.existsSync(path.join(proj, "final"))) blad("Projekt nie ma folderu final/.", "Archiwizujemy tylko opublikowane rolki.");
  const { pola } = czytajBrief(proj);
  if (!/gotowa|opublikowana/i.test(pola["status"] || "")) uwaga(`Status w brief.md: "${pola["status"] || "brak"}". Archiwizuję mimo to.`);
}

const interaktywnie = process.stdin.isTTY && Object.keys(dane).length === 0;
if (interaktywnie) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  info("Wyniki rolki (Enter = pomiń, uzupełnisz później przez --wyniki):");
  for (const [k, opis] of POLA) {
    const def = k === "data_publikacji" ? dzis() : "";
    const v = (await rl.question(`  ${opis}${def ? ` [${def}]` : ""}: `)).trim();
    if (v || def) dane[k] = v || def;
  }
  rl.close();
}
if (!dane.data_publikacji && !tylkoWyniki) dane.data_publikacji = dzis();

// Przeniesienie
let cel = proj;
if (!tylkoWyniki) {
  cel = path.join(ARCHIWUM, path.basename(proj));
  if (fs.existsSync(cel)) blad(`W archiwum już jest ${path.basename(proj)}.`, "Zmień nazwę jednego z folderów.");
  fs.renameSync(proj, cel);
  ok(`Przeniesiono do 05_ARCHIWUM/${path.basename(cel)}`);
  if (odchudz) {
    for (const d of ["proxy", "render", path.join("kompozycja", "assets")]) fs.rmSync(path.join(cel, d), { recursive: true, force: true });
    ok("Usunięto proxy/, render/ i kompozycja/assets (odchudzanie).");
  }
  ustawWBrief(cel, "status", "opublikowana, w archiwum");
}

// final/wyniki.json (czyta go panel i samouczący się przepis: npm run algorytm)
{
  const wj = path.join(cel, "final", "wyniki.json");
  let w = {};
  try { w = JSON.parse(fs.readFileSync(wj, "utf8")); } catch {}
  const mapa = { zasieg: "zasieg", wyswietlenia: "wyswietlenia", polubienia: "polubienia", zapisy: "zapisy", udostepnienia: "wyslania", obserwujacy: "obserwujacy", data_publikacji: "data_publikacji" };
  for (const [z, na] of Object.entries(mapa)) if (dane[z]) w[na] = dane[z];
  const pub = w.data_publikacji || dane.data_publikacji;
  if (pub) { w.dzien = Math.floor((Date.now() - new Date(pub + "T12:00:00")) / 864e5); if (!/\d{4}-\d{2}-\d{2}/.test(czytajBrief(cel).pola["data publikacji"] || "")) ustawWBrief(cel, "data publikacji", pub); }
  w.data = dzis();
  if (Object.keys(dane).some((k) => mapa[k])) { fs.mkdirSync(path.dirname(wj), { recursive: true }); fs.writeFileSync(wj, JSON.stringify(w, null, 2) + "\n", "utf8"); }
}

// wyniki.md w projekcie
const wPlik = path.join(cel, "wyniki.md");
const stare = fs.existsSync(wPlik) ? fs.readFileSync(wPlik, "utf8") : "";
const wiersz = `| ${dzis()} | ${POLA.map(([k]) => dane[k] ?? "").join(" | ")} |`;
const naglowek = `# Wyniki rolki ${path.basename(cel)}\n\nKażdy wiersz to pomiar w danym dniu (najlepiej: 1 dzień, 7 dni, 30 dni po publikacji).\n\n| pomiar | ${POLA.map(([, o]) => o).join(" | ")} |\n|${"---|".repeat(POLA.length + 1)}\n`;
fs.writeFileSync(wPlik, (stare || naglowek) + wiersz + "\n", "utf8");

// zbiorczy CSV w archiwum
const csv = path.join(ARCHIWUM, "wyniki.csv");
if (!fs.existsSync(csv)) fs.writeFileSync(csv, "﻿projekt;pomiar;" + POLA.map(([k]) => k).join(";") + "\n", "utf8");
fs.appendFileSync(csv, `${path.basename(cel)};${dzis()};${POLA.map(([k]) => String(dane[k] ?? "").replace(/;/g, ",")).join(";")}\n`, "utf8");
ok(`Zapisano wyniki: ${path.relative(ARCHIWUM, wPlik)} i 05_ARCHIWUM/wyniki.csv`);
if (!dane.zasieg) info(`Uzupełnij wyniki po 7 dniach: npm run archiwizuj -- --wyniki ${path.basename(cel)} --zasieg ... --zapisy ...`);

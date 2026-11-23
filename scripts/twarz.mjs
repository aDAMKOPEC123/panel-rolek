// Mapa twarzy klipu albo zdjęcia: brwi, oczy, rzęsy, nos, usta w każdej klatce (MediaPipe, lokalnie, darmowe).
//   npm run twarz -- <projekt> proxy/<klip>.mp4 [--force]
//   npm run twarz -- <projekt> --wszystkie [--force]       (wszystkie ujęcia z rolka.json)
// Wynik: kompozycja/twarz/<ścieżka>.json. Używa go zloz, gdy ujęcie ma kotwice twarzy:
//   "sledzenie": [{ "twarz": "brew_lewa_luk", "element": "strzalka", "tekst": "łuk" }],
//   "sledzenie": [{ "element": "proporcje", "strona": "obie|lewa|prawa", "etykiety": true }],
//   "sledzenie": [{ "element": "obrys", "twarz": "brew_lewa" | "brwi" | "rzesy_prawa" }],
//   "zoom_na": { "twarz": "brwi", "skala": 1.5, "start": 0.5 },   "kadr": { "twarz": "oczy", "skala": 1.4 }
// (zloz sam liczy mapę, gdy jej brakuje). Kotwice: scripts/twarz-dane.mjs.
import fs from "node:fs";
import path from "node:path";
import { blad, ok, info, uwaga, znajdzProjekt, wczytajRolke } from "./lib.mjs";
import { mapaTwarzy } from "./twarz-dane.mjs";

const args = process.argv.slice(2);
const force = args.includes("--force");
const [pArg, plikArg] = args.filter((a) => !a.startsWith("--"));
const proj = znajdzProjekt(pArg);
let pliki = [];
if (args.includes("--wszystkie")) {
  const rolka = wczytajRolke(proj);
  pliki = [...new Set((rolka?.ujecia || []).map((u) => u.src).filter((s) => s && /\.(mp4|mov|webm|jpe?g|png|webp)$/i.test(s)))];
  if (!pliki.length) blad("W rolka.json nie ma ujęć z plikami.");
} else {
  if (!plikArg) blad("Podaj klip albo --wszystkie.", "npm run twarz -- <projekt> proxy/M1_mowa_hook.mp4");
  pliki = [plikArg];
}
let zTwarza = 0;
for (const src of pliki) {
  if (!fs.existsSync(path.join(proj, src))) { uwaga(`${src}: nie ma pliku, pomijam.`); continue; }
  const t0 = Date.now();
  const d = mapaTwarzy(proj, src, { force });
  if (d.blad) { uwaga(`${src}: analiza się nie udała: ${d.blad}`); if (/mediapipe|No module/i.test(d.blad)) info("Zainstaluj: pip install --no-deps mediapipe absl-py"); continue; }
  const proc = Math.round(d.pokrycie * 100);
  if (!proc) { info(`${src}: brak twarzy w kadrze.`); continue; }
  zTwarza++;
  ok(`${src}: twarz w ${proc}% klatek, wielkość ${Math.round(d.wielkosc_twarzy * 100)}% wysokości kadru (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
  if (d.wielkosc_twarzy < 0.15) uwaga("  Twarz jest mała w kadrze: kotwice brwi będą mniej dokładne (lepiej zbliżenie).");
  if (proc < 60) uwaga("  Twarz często znika z kadru (odwrócona, zasłonięta, za blisko): ozdoby pokażą się tylko tam, gdzie jest.");
}
info(`Mapa twarzy: ${zTwarza} z ${pliki.length} plików z twarzą.`);

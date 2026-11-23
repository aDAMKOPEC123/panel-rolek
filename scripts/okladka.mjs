// Okładka rolki: czysta klatka z nagrania + tytuł w stylu marki -> final/okladka.jpg (1080x1920).
//   npm run okladka -- <projekt> [--tytul "Tekst"] [--klatka proxy/IMG_0002.mp4] [--czas 1.5] [--z-renderu]
// Domyślnie: klatka z pierwszego ujęcia wideo (bez napisów), tytuł z pola "tytuł na okładkę" w brief.md,
// a jak puste, z hooka w rolka.json. Tytuł siedzi w środkowym kadrze 3:4, który widać w siatce profilu.
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { ROOT, SZABLONY_HF, hf, uruchom, blad, ok, info, uwaga, wczytajConfig, znajdzProjekt, wczytajRolke, czytajBrief, ffprobe, ROZSZ_OBRAZ } from "./lib.mjs";

import { zastosujStyl } from "./style-marki.mjs";
let cfg = wczytajConfig();
const args = process.argv.slice(2);
const flaga = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args.splice(i, 2)[1] : d; };
let tytul = flaga("--tytul", null);
let klatka = flaga("--klatka", null);
let czas = flaga("--czas", null);
const zRenderu = args.includes("--z-renderu");
const proj = znajdzProjekt(args.find((a) => !a.startsWith("--")));
const nazwa = path.basename(proj);
const rolka = fs.existsSync(path.join(proj, "kompozycja", "rolka.json")) ? wczytajRolke(proj) : {};
cfg = zastosujStyl(cfg, rolka.styl);
const { pola } = czytajBrief(proj);

if (!tytul) {
  tytul = pola["tytuł na okładkę"] && !/^todo|^$/i.test(pola["tytuł na okładkę"]) ? pola["tytuł na okładkę"] : null;
  const hook = (rolka.sceny || []).find((s) => s.szablon === "hook-tytul");
  if (!tytul && hook) tytul = hook.dane?.tekst;
  if (!tytul) tytul = rolka.tytul || nazwa;
}
let src;
if (zRenderu) {
  src = path.join(proj, "final", `${nazwa}.mp4`);
  if (!fs.existsSync(src)) {
    const r = fs.readdirSync(path.join(proj, "render")).filter((n) => n.endsWith(".mp4")).sort().pop();
    if (!r) blad("Nie ma jeszcze renderu.", "npm run render -- " + nazwa);
    src = path.join(proj, "render", r);
  }
  czas = czas ?? 1.0;
} else if (klatka) {
  src = path.join(proj, klatka);
} else {
  const u = (rolka.ujecia || []).find((x) => x.src && !ROZSZ_OBRAZ.test(x.src)) || (rolka.ujecia || []).find((x) => x.src);
  if (!u) blad("Nie wiem, skąd wziąć klatkę.", "Podaj --klatka proxy/<klip>.mp4 albo --z-renderu.");
  src = path.join(proj, u.src);
  czas = czas ?? (Number(u.od || 0) + 0.5);
}
if (!fs.existsSync(src)) blad(`Nie ma pliku ${src}`, "Sprawdź ścieżkę.");

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "okladka-"));
fs.mkdirSync(path.join(tmp, "assets"));
const kadr = path.join(tmp, "assets", "kadr.jpg");
if (ROZSZ_OBRAZ.test(src)) {
  uruchom("ffmpeg", ["-y", "-v", "error", "-i", src, "-vf", "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920", kadr]);
} else {
  const d = ffprobe(src).duration;
  const t = Math.min(Number(czas) || 0, Math.max(0, d - 0.1));
  const r = uruchom("ffmpeg", ["-y", "-v", "error", "-ss", String(t), "-i", src, "-frames:v", "1", "-vf", "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920", "-q:v", "2", kadr]);
  if (r.code !== 0) blad("Nie udało się wyciągnąć klatki.", r.stderr.slice(-300));
}
const k = cfg.kolory || {};
const f = cfg.fonty || {};
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;");
const tyt = esc(tytul).replace(/\*([^*]+)\*/g, "<em>$1</em>").replace(/\|/g, "<br/>");
const len = String(tytul).replace(/[*|]/g, "").length;
const size = len <= 18 ? 118 : len <= 32 ? 96 : len <= 50 ? 80 : 66;
let tpl = fs.readFileSync(path.join(SZABLONY_HF, "okladka", "index.html"), "utf8");
tpl = tpl.replaceAll("{{TYTUL}}", tyt).replaceAll("{{ROZMIAR}}", String(size))
  .replaceAll("{{AKCENT}}", k.akcent || "#B07A6E").replaceAll("{{TEKST}}", k.tekst || "#2B2321")
  .replaceAll("{{TLO}}", k.tlo_jasne || "#F7F1EC").replaceAll("{{FONT_N}}", f.naglowki || "Playfair Display").replaceAll("{{FONT_T}}", f.tekst || "Montserrat")
  .replaceAll("{{KATEGORIA}}", esc(pola["kategoria"] || ""));
fs.writeFileSync(path.join(tmp, "index.html"), tpl);
for (const n of ["hyperframes.json", "package.json"]) fs.copyFileSync(path.join(SZABLONY_HF, n), path.join(tmp, n));

const snaps = path.join(tmp, "snaps");
const r = hf(["snapshot", "--at", "0.5", "--no-end", "-o", snaps], { cwd: tmp });
const png = fs.existsSync(snaps) ? fs.readdirSync(snaps).find((n) => n.endsWith(".png")) : null;
if (!png) blad("HyperFrames nie zrobił zrzutu okładki.\n" + (r.stdout + r.stderr).slice(-500), "Sprawdź npx hyperframes doctor.");
fs.mkdirSync(path.join(proj, "final"), { recursive: true });
const out = path.join(proj, "final", "okladka.jpg");
uruchom("ffmpeg", ["-y", "-v", "error", "-i", path.join(snaps, png), "-vf", "scale=1080:1920", "-q:v", "2", out]);
try { fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 3, retryDelay: 300 }); } catch {} // Windows potrafi chwilę trzymać plik
ok(`final/okladka.jpg  ("${String(tytul).replace(/\|/g, " ").replace(/\*/g, "")}")`);
info("W Instagramie: Edytuj okładkę -> Dodaj z galerii. Sprawdź podgląd w siatce 3:4.");

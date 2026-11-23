// Wycinanie dowolnego obiektu w ujęciu (SAM 2, scripts/obiekt.py): klik w brew, paznokieć, pęsetę, urządzenie, dłoń.
//   npm run obiekt -- <projekt> proxy/<klip>.mp4 --x 540 --y 900 --t 1.2 [--od 0] [--do 5] [--id o1]
// Wynik: wyciete/<klip>__<id>.webm (obiekt z przezroczystym tłem) + kompozycja/obiekty/<id>.json (środek, pole, ramka
// w każdej klatce). Ok. 0,5 s na klatkę na CPU (5 s ujęcia = ok. 1,5 min). Klik w ŚRODEK obiektu, nie na krawędzi:
// przy cienkich rzeczach (pęseta, końcówka urządzenia) punkt na granicy dwóch części daje raz jedną, raz drugą.
// Użycie w rolka.json (ujęcie): "obiekty": [{ "id": "o1", "efekt": "reflektor|poswiata|tekst_za", "tekst": "...",
//   "tekst_y": 600, "start": s od początku ujęcia, "czas": s }], a ozdoby: "sledzenie": [{ "obiekt": "o1", "element": "kolko" }].
import fs from "node:fs";
import path from "node:path";
import { ROOT, blad, ok, info, uwaga, znajdzProjekt, uruchom, ffprobe } from "./lib.mjs";

const args = process.argv.slice(2);
const flaga = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args.splice(i, 2)[1] : d; };
const X = Number(flaga("--x")), Y = Number(flaga("--y")), T = Number(flaga("--t", 0));
const OD = flaga("--od", null), DO = flaga("--do", null);
const id = String(flaga("--id", "o" + Date.now().toString(36))).replace(/[^\w-]/g, "");
const [pArg, plikArg] = args.filter((a) => !a.startsWith("--"));
const proj = znajdzProjekt(pArg);
if (!plikArg || !isFinite(X) || !isFinite(Y)) blad("Podaj klip i punkt.", "npm run obiekt -- <projekt> proxy/M3.mp4 --x 540 --y 900 --t 1.2");
const src = path.join(proj, plikArg);
if (!fs.existsSync(src)) blad(`Nie ma pliku ${plikArg}.`, "Ścieżka względem folderu rolki.");
const m = ffprobe(src);
const od = Math.max(0, Number(OD ?? 0)), doo = Math.min(m.duration, Number(DO ?? m.duration));
const base = path.basename(plikArg).replace(/\.[^.]+$/, "");
const webm = path.join(proj, "wyciete", `${base}__${id}.webm`), js = path.join(proj, "kompozycja", "obiekty", `${id}.json`);
fs.mkdirSync(path.dirname(webm), { recursive: true });
fs.mkdirSync(path.dirname(js), { recursive: true });
info(`Obiekt ${id}: śledzę ${(doo - od).toFixed(1)} s (ok. ${Math.ceil((doo - od) * 30 * 0.5 / 60)} min) ...`);
const py = process.platform === "win32" ? "python" : "python3";
const r = uruchom(py, [path.join(ROOT, "scripts", "obiekt.py"), src, webm, js, "--x", String(X), "--y", String(Y), "--t", String(T), "--od", String(od), "--do", String(doo)], { cicho: true, timeout: 60 * 60 * 1000 });
if (r.code !== 0) blad("Wycinanie obiektu się nie udało.", (r.stderr || r.stdout).trim().split("\n").slice(-3).join(" "));
const d = JSON.parse(fs.readFileSync(js, "utf8"));
d.src = plikArg; d.plik = path.relative(proj, webm).split(path.sep).join("/");
fs.writeFileSync(js, JSON.stringify(d));
const proc = Math.round(d.pokrycie * 100);
ok(`${d.plik}: obiekt w ${proc}% klatek (${d.klatki.length} klatek)`);
if (proc < 70) uwaga("Obiekt często ginie (zasłonięty, wyjechał z kadru). Efekt pokaże się tylko tam, gdzie jest. Spróbuj kliknąć w środek obiektu albo w innej chwili.");
const pola = d.klatki.filter((k) => k.ok).map((k) => k.pole);
if (pola.length && Math.max(...pola) > 0.35) uwaga("Maska zajmuje ponad 1/3 kadru: może złapała tło albo całą postać. Kliknij dokładniej w sam obiekt.");

// Śledzenie punktu w klipie (np. brew, pęseta, paznokieć), żeby kółko / strzałka / podpis jechały za obiektem.
//   npm run sledz -- <projekt> proxy/<klip>.mp4 --x 540 --y 900 --od 1.2 [--do 4] [--id s1]
// x, y w pikselach kadru 1080x1920 w chwili --od (czas klipu). Wynik: kompozycja/sledzenie/<id>.json
//   { src, od, do, punkty: [{ t (czas klipu), x, y, pewnosc }] }
// Metoda: dopasowanie wzorca (SAD) na zmniejszonych klatkach 360x640 co 1/15 s, okno szukania wokół
// poprzedniej pozycji, wzorzec powoli się aktualizuje (obiekt może zmieniać wygląd), na końcu wygładzenie.
// Gdy pewność spada (obiekt zasłonięty, wyjechał z kadru), punkt zostaje w miejscu i jest to zapisane.
import fs from "node:fs";
import path from "node:path";
import { blad, ok, info, uwaga, znajdzProjekt, uruchom, ffprobe } from "./lib.mjs";

const args = process.argv.slice(2);
const flaga = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args.splice(i, 2)[1] : d; };
const X = Number(flaga("--x")), Y = Number(flaga("--y")), OD = Number(flaga("--od", 0));
let DO = flaga("--do", null);
const id = String(flaga("--id", "s" + Date.now().toString(36))).replace(/[^\w-]/g, "");
const [pArg, plikArg] = args.filter((a) => !a.startsWith("--"));
const proj = znajdzProjekt(pArg);
if (!plikArg || !isFinite(X) || !isFinite(Y)) blad("Podaj klip i punkt.", "np. npm run sledz -- <projekt> proxy/M3.mp4 --x 540 --y 900 --od 1.2");
const src = path.join(proj, plikArg);
if (!fs.existsSync(src)) blad(`Nie ma pliku ${plikArg}.`, "Ścieżka względem folderu rolki.");
const m = ffprobe(src);
DO = Math.min(m.duration, DO == null ? m.duration : Number(DO));
if (DO - OD < 0.2) blad("Za krótki odcinek do śledzenia.", "Ustaw --do dalej niż --od.");

const W = 360, H = 640, FPS = 15, SK = 1080 / W;
const r = uruchom("ffmpeg", ["-hide_banner", "-v", "error", "-ss", String(OD), "-i", src, "-t", String(DO - OD), "-vf", `fps=${FPS},scale=${W}:${H},format=gray`, "-f", "rawvideo", "-"], { cicho: true, kodowanie: "buffer" });
const buf = Buffer.isBuffer(r.stdout) ? r.stdout : Buffer.from(r.stdout || "", "latin1");
const N = Math.floor(buf.length / (W * H));
if (!N) blad("Nie udało się odczytać klatek.", (r.stderr || "").slice(-300));
const klatka = (i) => buf.subarray(i * W * H, (i + 1) * W * H);

const R = 12; // wzorzec 25x25 px (na 360x640 = 75x75 w pełnym kadrze)
const SZ = 18; // promień szukania na klatkę
let px = Math.round(X / SK), py = Math.round(Y / SK);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
px = clamp(px, R, W - R - 1); py = clamp(py, R, H - R - 1);
const wytnij = (f, cx, cy) => { const t = new Float32Array((2 * R + 1) ** 2); let k = 0; for (let y = -R; y <= R; y++) for (let x = -R; x <= R; x++) t[k++] = f[(cy + y) * W + cx + x]; return t; };
let wzor = wytnij(klatka(0), px, py);
const pierwotny = Float32Array.from(wzor);
const punkty = [{ t: OD, x: px * SK, y: py * SK, pewnosc: 1 }];
let zgubione = 0;
for (let i = 1; i < N; i++) {
  const f = klatka(i);
  let best = { s: Infinity, x: px, y: py };
  for (let dy = -SZ; dy <= SZ; dy++) for (let dx = -SZ; dx <= SZ; dx++) {
    const cx = px + dx, cy = py + dy;
    if (cx < R || cy < R || cx >= W - R || cy >= H - R) continue;
    let s = 0, k = 0;
    for (let y = -R; y <= R && s < best.s; y++) { const o = (cy + y) * W + cx; for (let x = -R; x <= R; x++) s += Math.abs(f[o + x] - wzor[k++]); }
    if (s < best.s) best = { s, x: cx, y: cy };
  }
  const pew = Math.max(0, 1 - best.s / (wzor.length * 40));
  if (pew > 0.25) {
    px = best.x; py = best.y; zgubione = 0;
    // powolna aktualizacja wzorca + kotwica do pierwotnego (żeby nie „odpłynął” na tło)
    const nowy = wytnij(f, px, py);
    for (let k = 0; k < wzor.length; k++) wzor[k] = wzor[k] * 0.8 + nowy[k] * 0.12 + pierwotny[k] * 0.08;
  } else zgubione++;
  punkty.push({ t: Math.round((OD + i / FPS) * 1000) / 1000, x: px * SK, y: py * SK, pewnosc: Math.round(pew * 100) / 100 });
}
// wygładzenie (średnia z 5 punktów), żeby ozdoba nie drżała
const gl = punkty.map((p, i) => { const s = punkty.slice(Math.max(0, i - 2), i + 3); return { ...p, x: Math.round(s.reduce((a, q) => a + q.x, 0) / s.length), y: Math.round(s.reduce((a, q) => a + q.y, 0) / s.length) }; });
const dir = path.join(proj, "kompozycja", "sledzenie");
fs.mkdirSync(dir, { recursive: true });
const plik = path.join(dir, `${id}.json`);
fs.writeFileSync(plik, JSON.stringify({ src: plikArg, od: OD, do: DO, punkty: gl }, null, 1) + "\n", "utf8");
const slabe = gl.filter((p) => p.pewnosc < 0.25).length;
ok(`kompozycja/sledzenie/${id}.json: ${gl.length} punktów (${(DO - OD).toFixed(1)} s)${slabe ? `, ${slabe} niepewnych` : ""}`);
if (slabe > gl.length * 0.3) uwaga("Obiekt często ginął (zasłonięty albo za szybki ruch). Wybierz wyraźniejszy punkt z kontrastem albo krótszy odcinek.");
info(`Ruch: od (${gl[0].x}, ${gl[0].y}) do (${gl.at(-1).x}, ${gl.at(-1).y})`);

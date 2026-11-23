// Rytm muzyki rolki: tempo (BPM) i uderzenia (bity) -> kompozycja/bity.json (czasy w rolce).
//   npm run bity -- <projekt>                 -> z rolka.json -> muzyka.src (start = muzyka.start)
//   npm run bity -- <projekt> --plik audio/x.mp3
//   npm run bity -- <projekt> --bpm 100 [--od 0.2]   -> siatka bez pliku (muzyka dodawana w aplikacji Instagrama)
// Wykrywanie: obwiednia nowości (wzrosty energii w 3 pasmach, co 10 ms) -> autokorelacja 70-170 BPM
// -> faza siatki dopasowana do mocnych uderzeń. Co 4. bit = „raz” (mocny), używany do cięć.
import fs from "node:fs";
import path from "node:path";
import { blad, ok, info, uwaga, znajdzProjekt, uruchom, ffprobe, wczytajRolke } from "./lib.mjs";

const args = process.argv.slice(2);
const flaga = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args.splice(i, 2)[1] : d; };
const plikArg = flaga("--plik", null), bpmArg = Number(flaga("--bpm", 0)), odArg = Number(flaga("--od", 0)) || 0;
const proj = znajdzProjekt(args.find((a) => !a.startsWith("--")));
const rolka = wczytajRolke(proj);
const SR = 8000, HOP = 80; // 10 ms
const r3 = (x) => Math.round(x * 1000) / 1000;

let bpm, faza, start = 0, dlugoscMuzyki, zrodlo;
let pewnosc = null;
if (bpmArg > 0) {
  bpm = Math.min(200, Math.max(50, bpmArg)); faza = odArg; zrodlo = "ręcznie";
  dlugoscMuzyki = 120;
} else {
  const src = plikArg || rolka.muzyka?.src;
  if (!src) blad("Rolka nie ma muzyki (rolka.json -> muzyka.src).", "Dodaj muzykę z biblioteki albo podaj tempo: npm run bity -- <projekt> --bpm 100");
  const p = path.isAbsolute(src) ? src : path.join(proj, src);
  if (!fs.existsSync(p)) blad(`Nie ma pliku ${src}.`);
  start = plikArg ? 0 : Number(rolka.muzyka?.start || 0);
  zrodlo = src;
  // 3 pasma: bas (kick), środek (werbel), góra (hi-hat) -> osobne obwiednie, suma nowości
  const pasma = [["lowpass=f=150"], ["highpass=f=200,lowpass=f=2000"], ["highpass=f=3000"]];
  let nowosc = null;
  for (const [f] of pasma) {
    const r = uruchom("ffmpeg", ["-v", "error", "-i", p, "-t", "180", "-af", `${f},aresample=${SR}`, "-ac", "1", "-f", "s16le", "-"], { cicho: true, kodowanie: "buffer" });
    if (r.code !== 0) blad("Nie udało się odczytać muzyki.", r.stderr.slice(-300));
    const s = new Int16Array(r.stdout.buffer, r.stdout.byteOffset, Math.floor(r.stdout.length / 2));
    const n = Math.floor(s.length / HOP);
    const e = new Float64Array(n);
    for (let i = 0; i < n; i++) { let a = 0; for (let k = 0; k < HOP; k++) { const v = s[i * HOP + k] / 32768; a += v * v; } e[i] = Math.log(1e-9 + a / HOP); }
    if (!nowosc) nowosc = new Float64Array(n);
    for (let i = 1; i < n && i < nowosc.length; i++) nowosc[i] += Math.max(0, e[i] - e[i - 1]);
  }
  // usunięcie lokalnej średniej (zostają wyraźne uderzenia)
  const N = nowosc.length, sr = new Float64Array(N), W = 25;
  let suma = 0;
  for (let i = 0; i < N; i++) { suma += nowosc[i]; if (i >= 2 * W) suma -= nowosc[i - 2 * W]; sr[i] = Math.max(0, nowosc[i] - suma / Math.min(i + 1, 2 * W)); }
  dlugoscMuzyki = N / 100;
  // autokorelacja w zakresie 70-170 BPM, z lekką preferencją 90-130 (typowe tempo rolek)
  let best = 0, bestLag = 60;
  for (let lag = Math.round(6000 / 170); lag <= Math.round(6000 / 70); lag++) {
    let a = 0; for (let i = lag; i < N; i++) a += sr[i] * sr[i - lag];
    const b = 6000 / lag, waga = Math.exp(-0.5 * ((Math.log2(b / 110)) / 0.6) ** 2);
    if (a * waga > best) { best = a * waga; bestLag = lag; }
  }
  // dokładniejszy okres: parabola wokół maksimum
  const ac = (lag) => { let a = 0; for (let i = lag; i < N; i++) a += sr[i] * sr[i - lag]; return a; };
  const y0 = ac(bestLag - 1), y1 = ac(bestLag), y2 = ac(bestLag + 1);
  const okres = (bestLag + (y0 - y2) / (2 * (y0 - 2 * y1 + y2) || 1)) / 100; // s
  bpm = 60 / okres;
  // faza: przesunięcie siatki z największą sumą uderzeń
  let bf = 0, bs = -1;
  for (let f = 0; f < okres; f += 0.01) { let s2 = 0; for (let t = f; t < dlugoscMuzyki; t += okres) s2 += sr[Math.round(t * 100)] || 0; if (s2 > bs) { bs = s2; bf = f; } }
  faza = bf;
}
const okres = 60 / bpm;
const bity = [];
for (let t = faza, k = 0; t < dlugoscMuzyki; t += okres, k++) bity.push(r3(start + t));
const D = 600;
const wynik = { bpm: Math.round(bpm * 10) / 10, okres: r3(okres), zrodlo, start, pewnosc, bity: bity.filter((t) => t >= 0 && t < D), mocne: bity.filter((_, i) => i % 4 === 0).filter((t) => t >= 0 && t < D) };
const out = path.join(proj, "kompozycja", "bity.json");
fs.writeFileSync(out, JSON.stringify(wynik) + "\n");
ok(`Tempo ${wynik.bpm} BPM (bit co ${wynik.okres} s), ${wynik.bity.length} bitów -> kompozycja/bity.json`);
info("Na osi w kroku Sceny: tor „rytm”, sceny i znaczniki przyciągają się do bitów, przycisk „Dopasuj do rytmu”.");

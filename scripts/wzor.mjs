// „Zrób jak ta rolka”: rozkład rolki-wzoru na strukturę (cięcia, długości ujęć, tempo, dźwięk, klatki kluczowe).
//   npm run wzor -- <projekt> wzor/<plik>.mp4
// Wynik: kompozycja/wzor.json + kompozycja/wzor/klatka_NN.jpg (pierwsza klatka każdego ujęcia wzoru).
// Kopiujemy układ i rytm (kiedy hook, ile trwa ujęcie, gdzie efekt, kiedy CTA), nigdy cudze materiały.
import fs from "node:fs";
import path from "node:path";
import { blad, ok, info, znajdzProjekt, uruchom, ffprobe } from "./lib.mjs";

const args = process.argv.slice(2);
const [pArg, plikArg] = args.filter((a) => !a.startsWith("--"));
const proj = znajdzProjekt(pArg);
if (!plikArg) blad("Podaj plik wzoru.", "np. npm run wzor -- <projekt> wzor/inspiracja.mp4");
const src = path.isAbsolute(plikArg) ? plikArg : path.join(proj, plikArg);
if (!fs.existsSync(src)) blad(`Nie ma pliku ${plikArg}.`);
const m = ffprobe(src);
if (!m.hasVideo) blad("Wzór musi być wideo.");
const r3 = (x) => Math.round(x * 1000) / 1000;
info(`Analizuję wzór ${path.basename(src)} (${m.duration.toFixed(1)} s)...`);

// 1. Cięcia: detekcja zmiany sceny (scdet), próg dopasowany, min. 0,25 s odstępu
const sc = uruchom("ffmpeg", ["-hide_banner", "-i", src, "-vf", "scale=270:-2,scdet=threshold=8:sc_pass=1,metadata=print:file=-", "-an", "-f", "null", "-"], { cicho: true });
const ciecia = [];
for (const mm of (sc.stdout + sc.stderr).matchAll(/pts_time:([\d.]+)[\s\S]*?lavfi\.scd\.score=([\d.]+)/g)) {
  const t = Number(mm[1]);
  if (t > 0.2 && t < m.duration - 0.2 && (!ciecia.length || t - ciecia.at(-1) > 0.25)) ciecia.push(r3(t));
}
const granice = [0, ...ciecia, r3(m.duration)];
const ujecia = granice.slice(0, -1).map((a, i) => ({ od: a, do: granice[i + 1], dlugosc: r3(granice[i + 1] - a) }));
const dl = ujecia.map((u) => u.dlugosc);
const sr = dl.reduce((a, b) => a + b, 0) / dl.length;
const med = [...dl].sort((a, b) => a - b)[Math.floor(dl.length / 2)];

// 2. Głośność co 0,5 s (mowa / muzyka / cisza) - EBU R128 momentary
let glosnosc = [];
if (m.hasAudio) {
  const e = uruchom("ffmpeg", ["-hide_banner", "-i", src, "-af", "ebur128=metadata=1,ametadata=print:key=lavfi.r128.M:file=-", "-f", "null", "-"], { cicho: true });
  const pkt = [...(e.stdout + e.stderr).matchAll(/pts_time:([\d.]+)\s*\n?lavfi\.r128\.M=(-?[\d.]+|-inf)/g)].map((x) => [Number(x[1]), x[2] === "-inf" ? -70 : Number(x[2])]);
  for (let t = 0; t < m.duration; t += 0.5) {
    const w = pkt.filter(([pt]) => pt >= t && pt < t + 0.5).map(([, v]) => v);
    glosnosc.push(r3(w.length ? w.reduce((a, b) => a + b, 0) / w.length : -70));
  }
}

// 3. Klatki kluczowe (środek każdego ujęcia, maks. 24) do obejrzenia przez Claude
const dir = path.join(proj, "kompozycja", "wzor");
fs.rmSync(dir, { recursive: true, force: true });
fs.mkdirSync(dir, { recursive: true });
const co = Math.max(1, Math.ceil(ujecia.length / 24));
const klatki = [];
ujecia.forEach((u, i) => {
  if (i % co) return;
  const t = r3((u.od + u.do) / 2), plik = `klatka_${String(i + 1).padStart(2, "0")}.jpg`;
  uruchom("ffmpeg", ["-v", "error", "-y", "-ss", String(t), "-i", src, "-frames:v", "1", "-vf", "scale=360:-2", "-q:v", "3", path.join(dir, plik)], { cicho: true });
  klatki.push({ ujecie: i + 1, t, plik: `kompozycja/wzor/${plik}` });
});

const wynik = {
  plik: path.relative(proj, src).split(path.sep).join("/"), dlugosc: r3(m.duration), ujec: ujecia.length,
  srednia_dlugosc_ujecia: r3(sr), mediana_dlugosci: r3(med), ciec_na_10s: r3((ciecia.length / m.duration) * 10),
  pierwsze_ciecie: ciecia[0] ?? null, ujecia, glosnosc_co_0_5s: glosnosc, klatki,
};
fs.writeFileSync(path.join(proj, "kompozycja", "wzor.json"), JSON.stringify(wynik, null, 1) + "\n");
ok(`Wzór: ${wynik.dlugosc} s, ${wynik.ujec} ujęć (średnio ${wynik.srednia_dlugosc_ujecia} s, ${wynik.ciec_na_10s} cięć na 10 s, pierwsze cięcie ${wynik.pierwsze_ciecie ?? "brak"} s) -> kompozycja/wzor.json`);

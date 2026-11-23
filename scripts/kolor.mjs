// Spójny kolor ujęć: balans bieli i jasność każdego klipu wideo z rolki dopasowane do ujęcia wzorcowego.
//   npm run kolor -- <projekt> [--wzor proxy/<klip>.mp4] [--sila 70] [--podmien] [--tylko-pomiar]
// Pomiar: 6 klatek z używanego fragmentu (od-do), średnie kanały R,G,B pikseli o średniej jasności
// (bez prześwietleń i cieni), jasność. Wzór: wskazany albo klip najbliższy medianie (najbardziej „typowy”).
// Korekta delikatna: wzmocnienia kanałów 0,88-1,12 (balans bieli), jasność ±0,05. Bez nasycenia i wygładzania.
// Wynik: proxy/<klip>_kolor.mp4 (dźwięk bez zmian) + kompozycja/kolor.json (pomiary i korekty).
import fs from "node:fs";
import path from "node:path";
import { blad, ok, info, uwaga, znajdzProjekt, uruchom, ffprobe, wczytajRolke, ROZSZ_WIDEO } from "./lib.mjs";

const args = process.argv.slice(2);
const flaga = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args.splice(i, 2)[1] : d; };
const wzorArg = flaga("--wzor", null), SILA = Math.min(1, Math.max(0, (Number(flaga("--sila", 70)) || 70) / 100));
const podmien = args.includes("--podmien"), tylkoPomiar = args.includes("--tylko-pomiar");
const proj = znajdzProjekt(args.find((a) => !a.startsWith("--")));
const rolka = wczytajRolke(proj);
const r3 = (x) => Math.round(x * 1000) / 1000;

// klipy wideo z ujęć (bez plansz, zdjęć i wersji już wyrównanych drugi raz)
const uzycia = new Map();
for (const u of rolka.ujecia || []) {
  if (!u.src || !ROZSZ_WIDEO.test(u.src)) continue;
  const baza = u.src.replace(/_kolor\.mp4$/, ".mp4");
  const p = path.join(proj, fs.existsSync(path.join(proj, baza)) ? baza : u.src);
  if (!fs.existsSync(p)) continue;
  const k = path.relative(proj, p).split(path.sep).join("/");
  const e = uzycia.get(k) || { plik: k, zakresy: [] };
  e.zakresy.push([Number(u.od || 0), u.do != null ? Number(u.do) : null]);
  uzycia.set(k, e);
}
if (uzycia.size < 2) blad("Do wyrównania potrzebne są co najmniej 2 różne klipy wideo w ujęciach.", "Dodaj ujęcia w kroku Nagrania.");

function pomiar(rel, zakresy) {
  const p = path.join(proj, rel), m = ffprobe(p);
  const czasy = [];
  for (const [od, d] of zakresy) { const k = d ?? m.duration; for (let i = 1; i <= Math.ceil(6 / zakresy.length); i++) czasy.push(od + ((k - od) * i) / (Math.ceil(6 / zakresy.length) + 1)); }
  let R = 0, G = 0, B = 0, Y = 0, n = 0;
  for (const t of czasy) {
    const r = uruchom("ffmpeg", ["-v", "error", "-ss", String(Math.max(0, t)), "-i", p, "-frames:v", "1", "-vf", "scale=72:128", "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], { cicho: true, kodowanie: "buffer" });
    const b = r.stdout;
    for (let i = 0; i + 2 < b.length; i += 3) {
      const rr = b[i] / 255, gg = b[i + 1] / 255, bb = b[i + 2] / 255, y = 0.2126 * rr + 0.7152 * gg + 0.0722 * bb;
      if (y < 0.18 || y > 0.92) continue; // bez cieni i prześwietleń
      R += rr; G += gg; B += bb; Y += y; n++;
    }
  }
  if (!n) return null;
  return { plik: rel, r: R / n, g: G / n, b: B / n, y: Y / n, rg: R / G, bg: B / G };
}
info(`Mierzę kolor ${uzycia.size} klipów...`);
const pom = [...uzycia.values()].map((e) => pomiar(e.plik, e.zakresy)).filter(Boolean);
const med = (a) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
const mRG = med(pom.map((x) => x.rg)), mBG = med(pom.map((x) => x.bg)), mY = med(pom.map((x) => x.y));
const wzor = wzorArg ? pom.find((x) => x.plik === wzorArg) : pom.reduce((a, x) => (Math.hypot(x.rg - mRG, x.bg - mBG, (x.y - mY) * 0.5) < Math.hypot(a.rg - mRG, a.bg - mBG, (a.y - mY) * 0.5) ? x : a));
if (!wzor) blad(`Nie ma klipu ${wzorArg} w ujęciach.`);
const klamra = (v, a, b) => Math.min(b, Math.max(a, v));
const korekty = pom.map((x) => {
  // wzmocnienia względem zielonego (balans bieli), częściowo (SILA), z ograniczeniem
  const gr = klamra(1 + ((wzor.rg / x.rg) - 1) * SILA, 0.88, 1.12), gb = klamra(1 + ((wzor.bg / x.bg) - 1) * SILA, 0.88, 1.12);
  // kompensacja jasności po zmianie kanałów + dopasowanie jasności do wzoru
  const yPo = 0.2126 * x.r * gr + 0.7152 * x.g + 0.0722 * x.b * gb;
  const jas = klamra((wzor.y - yPo) * SILA, -0.05, 0.05);
  const roznica = Math.abs(gr - 1) + Math.abs(gb - 1) + Math.abs(jas) * 2;
  return { ...Object.fromEntries(Object.entries(x).map(([k, v]) => [k, typeof v === "number" ? r3(v) : v])), wzor: x.plik === wzor.plik, czerwony: r3(gr), niebieski: r3(gb), jasnosc: r3(jas), potrzebna: x.plik !== wzor.plik && roznica > 0.02 };
});
fs.writeFileSync(path.join(proj, "kompozycja", "kolor.json"), JSON.stringify({ wzor: wzor.plik, sila: SILA, klipy: korekty }, null, 2) + "\n");
for (const k of korekty) info(`${k.wzor ? "★ wzór " : "  "}${k.plik}: R x${k.czerwony}, B x${k.niebieski}, jasność ${k.jasnosc >= 0 ? "+" : ""}${k.jasnosc}${k.potrzebna ? "" : k.wzor ? "" : " (bez zmian, już pasuje)"}`);
if (tylkoPomiar) process.exit(0);

const zmiany = {};
for (const k of korekty.filter((x) => x.potrzebna)) {
  const src = path.join(proj, k.plik), outRel = k.plik.replace(/\.mp4$/i, "_kolor.mp4"), out = path.join(proj, outRel);
  const m = ffprobe(src);
  const vf = `colorchannelmixer=rr=${k.czerwony}:bb=${k.niebieski},eq=brightness=${k.jasnosc}`;
  const r = uruchom("ffmpeg", ["-hide_banner", "-y", "-loglevel", "error", "-i", src, "-vf", vf, "-c:v", "libx264", "-preset", "medium", "-crf", "17", "-pix_fmt", "yuv420p", "-g", "30", "-movflags", "+faststart", ...(m.hasAudio ? ["-c:a", "copy"] : ["-an"]), out.replace(/.mp4$/, ".czesc.mp4")], { cicho: true });
  if (r.code !== 0) { uwaga(`${k.plik}: korekta się nie udała (${r.stderr.slice(-160)})`); continue; }
  fs.rmSync(out, { force: true }); fs.renameSync(out.replace(/.mp4$/, ".czesc.mp4"), out);
  zmiany[k.plik] = outRel;
  ok(`${outRel}`);
}
if (!Object.keys(zmiany).length) ok("Wszystkie klipy już mają spójny kolor.");
if (podmien && Object.keys(zmiany).length) {
  const rj = path.join(proj, "kompozycja", "rolka.json");
  const r = JSON.parse(fs.readFileSync(rj, "utf8"));
  let n = 0;
  for (const u of r.ujecia || []) {
    const baza = u.src?.replace(/_kolor\.mp4$/, ".mp4");
    if (zmiany[baza]) { u.src = zmiany[baza]; n++; }
    for (const p of u.przebitki || []) if (zmiany[p.src]) { p.src = zmiany[p.src]; n++; }
  }
  fs.writeFileSync(rj, JSON.stringify(r, null, 2) + "\n", "utf8");
  ok(`Podmieniono w rolka.json: ${n}`);
}

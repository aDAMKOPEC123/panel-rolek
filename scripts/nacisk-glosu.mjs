// Nacisk w głosie: które słowa prowadząca naprawdę zaakcentowała (głośniej, wyżej, przeciągnięte), a które ściszyła.
// Używa scripts/zloz.mjs dla napisów (rolka.json -> napisy.nacisk, domyślnie tak). Każde słowo musi mieć
// zr (plik źródłowy względem rolki), t0, t1 (czas w tym pliku). Wynik: w.n = 2 (mocny akcent), 1 (lekki), -1 (cicho), 0.
// Pomiar: audio mono 16 kHz z ffmpeg, na słowo: głośność RMS (dB), wysokość głosu f0 (autokorelacja, 75-400 Hz,
// mediana z ramek 32 ms w środkowych 70% słowa), czas na literę. Normalizacja odporna (mediana i MAD) po wszystkich
// słowach rolki, więc liczy się nacisk względem stylu mówienia prowadzącej, nie bezwzględna głośność.
import path from "node:path";
import { uruchom } from "./lib.mjs";

const SR = 16000;
function audio(plik) {
  const r = uruchom("ffmpeg", ["-hide_banner", "-v", "error", "-i", plik, "-vn", "-ac", "1", "-ar", String(SR), "-f", "f32le", "-"], { cicho: true, kodowanie: "buffer" });
  const b = Buffer.isBuffer(r.stdout) ? r.stdout : Buffer.alloc(0);
  if (r.code !== 0 || b.length < 4) return null;
  return new Float32Array(b.buffer, b.byteOffset, Math.floor(b.length / 4));
}
function rmsDb(x, a, b) {
  let s = 0;
  for (let i = a; i < b; i++) s += x[i] * x[i];
  return 10 * Math.log10(s / Math.max(1, b - a) + 1e-10);
}
// f0 z autokorelacji znormalizowanej; null, gdy ramka bezdźwięczna (szum, „s”, „sz”)
function f0(x, a) {
  const N = 512, lo = Math.floor(SR / 400), hi = Math.floor(SR / 75);
  if (a + N + hi > x.length) return null;
  let e0 = 0;
  for (let i = 0; i < N; i++) e0 += x[a + i] * x[a + i];
  if (e0 < 1e-4) return null;
  let best = 0, lag = 0;
  for (let l = lo; l <= hi; l++) {
    let c = 0, e1 = 0;
    for (let i = 0; i < N; i++) { c += x[a + i] * x[a + i + l]; e1 += x[a + i + l] * x[a + i + l]; }
    const r = c / Math.sqrt(e0 * e1 + 1e-12);
    if (r > best) { best = r; lag = l; }
  }
  return best > 0.55 ? SR / lag : null;
}
const med = (v) => { const s = v.filter((x) => x != null && isFinite(x)).sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : null; };
function z(v) {
  const m = med(v), mad = med(v.map((x) => (x == null ? null : Math.abs(x - m))));
  const sk = (mad || 0) * 1.4826 || 1;
  return v.map((x) => (x == null || m == null ? 0 : (x - m) / sk));
}

export function naciskGlosu(proj, slowa) {
  const cache = new Map();
  const cechy = slowa.map((w) => {
    if (!w.zr || !(w.t1 > w.t0)) return null;
    if (!cache.has(w.zr)) cache.set(w.zr, audio(path.isAbsolute(w.zr) ? w.zr : path.join(proj, w.zr)));
    const x = cache.get(w.zr);
    if (!x) return null;
    const d = w.t1 - w.t0, a = Math.floor((w.t0 + d * 0.15) * SR), b = Math.min(x.length, Math.floor((w.t1 - d * 0.15) * SR));
    if (b - a < SR * 0.04) return null;
    const f = [];
    for (let i = a; i + 512 < b; i += 256) { const q = f0(x, i); if (q) f.push(q); }
    const litery = (w.text.match(/\p{L}/gu) || []).length || 1;
    // półtony względem 100 Hz: skala logarytmiczna jak słuch
    return { db: rmsDb(x, a, b), st: f.length >= 2 ? 12 * Math.log2(med(f) / 100) : null, dl: d / litery, litery };
  });
  const zL = z(cechy.map((c) => c?.db ?? null)), zP = z(cechy.map((c) => c?.st ?? null)), zD = z(cechy.map((c) => c?.dl ?? null));
  let mocne = 0, lekkie = 0, ciche = 0;
  const wyniki = slowa.map((w, i) => {
    const c = cechy[i];
    if (!c) return 0;
    const s = 0.55 * zL[i] + 0.3 * zP[i] + 0.15 * Math.min(2, zD[i]);
    w.nacisk = Math.round(s * 100) / 100;
    return s;
  });
  // progi rankingiem: mocne = najwyżej ok. 8% słów (i wynik >= 0,6), lekkie = kolejne ok. 15% (wynik >= 0,35).
  // Względne, bo jedna osoba mówi równo, a inna bardzo ekspresyjnie; progi chronią przed akcentem „na siłę”.
  // Krótkie słówka („i”, „to”, „w”) nigdy nie są akcentem.
  const kolejne = wyniki.map((s, i) => [s, i]).filter(([, i]) => cechy[i] && cechy[i].litery >= 3).sort((a, b) => b[0] - a[0]);
  const ileM = Math.max(1, Math.ceil(slowa.length * 0.08)), ileL = Math.ceil(slowa.length * 0.15);
  const mocneIdx = new Set(kolejne.filter(([s]) => s >= 0.6).slice(0, ileM).map(([, i]) => i));
  const lekkieIdx = new Set(kolejne.filter(([s, i]) => s >= 0.35 && !mocneIdx.has(i)).slice(0, ileL).map(([, i]) => i));
  slowa.forEach((w, i) => {
    w.n = mocneIdx.has(i) ? 2 : lekkieIdx.has(i) ? 1 : cechy[i] && wyniki[i] <= -1.3 && zL[i] <= -1.2 ? -1 : 0;
    if (w.n === 2) mocne++; else if (w.n === 1) lekkie++; else if (w.n === -1) ciche++;
  });
  return { mocne, lekkie, ciche, zmierzone: cechy.filter(Boolean).length };
}

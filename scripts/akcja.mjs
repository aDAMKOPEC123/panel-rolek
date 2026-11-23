// Cięcia na akcji i automatyczne tempo (scripts/analiza_akcji.py: przepływ optyczny i rytm ruchu).
//   npm run akcja -- <projekt> [--zapisz] [--cofnij]
// 1) Cięcia na akcji: na styku dwóch ujęć wideo bez mowy szuka (przesunięcie maks. 0,8 s w głąb ujęć, 0,4 s na
//    zewnątrz) takiej pary punktów, żeby ruch rąk/narzędzia na końcu ujęcia A i na początku B szedł w tę samą stronę
//    z podobną siłą. Ręka „kontynuuje” ruch w nowym ujęciu (match cut on action). Każde ujęcie zostaje >= 1 s.
// 2) Tempo: w ujęciach bez mowy i bez dźwięku wykrywa powtarzalny ruch (czesanie, piłowanie, wcieranie; rytm >= 0,55
//    przez >= 2,5 s) i przyspiesza go 2,5x (3x od 5 s) z rampą 1,6x na wejściu i wyjściu. Pierwsze 0,5 s i ostatnie
//    1,5 s ujęcia (efekt) zostają w normalnym tempie.
// Pomija ujęcia z mową, z dźwiękiem, ze śledzeniem, obiektami, zoomem, przebitkami, segmentami, foley, stopklatką
// i ręcznym tempem. Wynik: kompozycja/akcja.json. --zapisz zmienia rolka.json (kopia: rolka.przed-akcja.json),
// kawałki ujęć mają pole "akcja" { grupa, rola }, więc kolejne uruchomienie najpierw je skleja. --cofnij przywraca kopię.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ROOT, blad, ok, info, uwaga, znajdzProjekt, uruchom, ffprobe, wczytajRolke } from "./lib.mjs";

const args = process.argv.slice(2);
const proj = znajdzProjekt(args.find((a) => !a.startsWith("--")));
const RJ = path.join(proj, "kompozycja", "rolka.json"), KOPIA = path.join(proj, "kompozycja", "rolka.przed-akcja.json");
const pl = (x, n = 1) => String(Math.round(x * 10 ** n) / 10 ** n).replace(".", ",");
const r2 = (x) => Math.round(x * 100) / 100;

if (args.includes("--cofnij")) {
  if (!fs.existsSync(KOPIA)) blad("Nie ma kopii do przywrócenia.", "kompozycja/rolka.przed-akcja.json nie istnieje.");
  fs.copyFileSync(KOPIA, RJ);
  ok("Przywrócono rolka.json sprzed cięć na akcji i tempa.");
  process.exit(0);
}

const rolka = wczytajRolke(proj);
// sklej kawałki z poprzedniego uruchomienia (ta sama grupa akcji)
const ujecia = [];
for (const u of rolka.ujecia || []) {
  const p = ujecia.at(-1);
  if (u.akcja && p?.akcja?.grupa === u.akcja.grupa) { p.do = u.do; p.przejscie_po = u.przejscie_po; continue; }
  const k = { ...u };
  if (k.akcja) { delete k.tempo; k.akcja = { grupa: k.akcja.grupa }; }
  ujecia.push(k);
}
const np = rolka.napisy || {};
const mowa = new Set([np.zrodlo, ...Object.keys(np.zrodla || {}), rolka.voiceover?.zrodlo].filter(Boolean));
const WID = /\.(mp4|mov|webm|m4v)$/i;
const dl = {};
const dlugosc = (src) => (dl[src] ??= ffprobe(path.join(proj, src)).duration);
const spokojne = (u) => u.src && WID.test(u.src) && !mowa.has(u.src) && !u.kwestia && !u.dzwiek;
const bezDodatkow = (u) => !u.sledzenie?.length && !u.obiekty?.length && !u.zoom_na && !u.przebitki?.length && !u.segmenty?.length && !u.foley?.length && !u.stopklatka && !(Number(u.tempo) > 0 && Number(u.tempo) !== 1);

// --- analiza ruchu ---
const zad = ujecia.map((u, i) => (u.src && WID.test(u.src) ? { id: String(i), plik: path.join(proj, u.src), od: Math.max(0, Number(u.od || 0) - 0.5), do: Math.min(dlugosc(u.src), Number(u.do ?? dlugosc(u.src)) + 0.5) } : null)).filter(Boolean);
if (!zad.length) blad("W rolce nie ma ujęć wideo.");
const tmp = path.join(os.tmpdir(), `akcja_${process.pid}.json`);
fs.writeFileSync(tmp, JSON.stringify(zad));
info(`Analizuję ruch w ${zad.length} ujęciach ...`);
const py = process.platform === "win32" ? "python" : "python3";
const r = uruchom(py, [path.join(ROOT, "scripts", "analiza_akcji.py"), tmp], { cicho: true, timeout: 20 * 60 * 1000 });
fs.rmSync(tmp, { force: true });
if (r.code !== 0) blad("Analiza ruchu się nie udała.", (r.stderr || "").slice(-400));
const A = JSON.parse(r.stdout.trim().split("\n").pop());
const wektor = (i, t, ile = 3, wstecz = true) => {
  const a = A[String(i)];
  if (!a?.wektory) return null;
  const k = Math.round((t - a.t0) * a.fps);
  const zakres = wstecz ? [k - ile + 1, k] : [k, k + ile - 1];
  const w = a.wektory.slice(Math.max(0, zakres[0]), Math.max(0, zakres[1] + 1));
  if (!w.length) return null;
  const s = w.reduce((p, q) => [p[0] + q[0], p[1] + q[1], p[2] + q[2]], [0, 0, 0]).map((x) => x / w.length);
  return s;
};

// --- 1) cięcia na akcji ---
const ciecia = [];
for (let i = 0; i + 1 < ujecia.length; i++) {
  const a = ujecia[i], b = ujecia[i + 1];
  if (!spokojne(a) || !spokojne(b) || !bezDodatkow(a) || !bezDodatkow(b)) continue;
  if (a.przejscie_po && a.przejscie_po !== "ciecie") continue;
  const aOd = Number(a.od || 0), aDo = Number(a.do ?? dlugosc(a.src)), bOd = Number(b.od || 0), bDo = Number(b.do ?? dlugosc(b.src));
  let best = null;
  for (let ta = Math.max(aOd + 1, aDo - 0.8); ta <= Math.min(dlugosc(a.src), aDo + 0.4) + 1e-6; ta += 1 / 15) {
    const va = wektor(i, ta, 3, true);
    if (!va || va[2] < 150) continue;
    for (let tb = Math.max(0, bOd - 0.4); tb <= Math.min(bDo - 1, bOd + 0.8) + 1e-6; tb += 1 / 15) {
      const vb = wektor(i + 1, tb, 3, false);
      if (!vb || vb[2] < 150) continue;
      const na = Math.hypot(va[0], va[1]), nb = Math.hypot(vb[0], vb[1]);
      if (na < 60 || nb < 60) continue;
      const cos = (va[0] * vb[0] + va[1] * vb[1]) / (na * nb);
      if (cos < 0.6) continue;
      const wynik = cos * Math.min(na, nb) / Math.max(na, nb) - 0.15 * (Math.abs(ta - aDo) + Math.abs(tb - bOd));
      if (!best || wynik > best.wynik) best = { wynik, ta, tb, cos, kier: Math.abs(va[0]) > Math.abs(va[1]) ? (va[0] > 0 ? "w prawo" : "w lewo") : (va[1] > 0 ? "w dół" : "w górę") };
    }
  }
  // cięcie już leży na akcji (np. po poprzednim zapisie): nic do proponowania
  if (best && best.wynik >= 0.45 && (Math.abs(best.ta - aDo) >= 0.05 || Math.abs(best.tb - bOd) >= 0.05)) ciecia.push({ z: i, na: i + 1, a_do: r2(best.ta), b_od: r2(best.tb), przes_a: r2(best.ta - aDo), przes_b: r2(best.tb - bOd), zgodnosc: r2(best.cos), kierunek: best.kier });
}

// --- 2) tempo powtarzalnych ruchów ---
const tempo = [];
ujecia.forEach((u, i) => {
  if (!spokojne(u) || !bezDodatkow(u)) return;
  const od = Number(u.od || 0), doo = Number(u.do ?? dlugosc(u.src));
  if (doo - od < 3.5) return;
  const rytm = (A[String(i)]?.rytm || []).filter(([t]) => t >= od + 0.5 && t <= doo - 1.5);
  const runy = [];
  for (const [t, s] of rytm) {
    if (s < 0.55) continue;
    const l = runy.at(-1);
    if (l && t - l[1] <= 1.0) l[1] = t; else runy.push([t, t]);
  }
  // okna mają 2 s (środek +-1 s); fragmenty bliżej niż 0,6 s scalone, żeby tempo nie skakało tam i z powrotem
  const zakresy = [];
  for (const [t1, t2] of runy) {
    const a = Math.max(od + 0.5, t1 - 1), b = Math.min(doo - 1.5, t2 + 1), l = zakresy.at(-1);
    if (l && a - l[1] < 0.6) l[1] = Math.max(l[1], b); else zakresy.push([a, b]);
  }
  for (const [a, b] of zakresy) {
    if (b - a < 2.5) continue;
    const s = b - a >= 5 ? 3 : 2.5;
    const oszcz = (b - a - 0.8) * (1 - 1 / s) + 0.8 * (1 - 1 / 1.6);
    tempo.push({ ujecie: i, od: r2(a), do: r2(b), tempo: s, oszczedza_s: r2(oszcz) });
  }
});

const raport = { data: new Date().toISOString(), ciecia, tempo };
fs.writeFileSync(path.join(proj, "kompozycja", "akcja.json"), JSON.stringify(raport, null, 2));
for (const c of ciecia) console.log(`✂ Ujęcie ${c.z + 1} → ${c.na + 1}: cięcie na ruchu ${c.kierunek} (zgodność ${pl(c.zgodnosc, 2)}), koniec ${c.przes_a >= 0 ? "+" : ""}${pl(c.przes_a)} s, start ${c.przes_b >= 0 ? "+" : ""}${pl(c.przes_b)} s`);
for (const t of tempo) console.log(`⏩ Ujęcie ${t.ujecie + 1}: ${pl(t.od)}-${pl(t.do)} s powtarzalny ruch → ${pl(t.tempo)}x (rolka krótsza o ${pl(t.oszczedza_s)} s)`);
if (!ciecia.length && !tempo.length) info("Nie znalazłam cięć na akcji ani powtarzalnych ruchów do przyspieszenia (ujęcia z mową i dźwiękiem są pomijane).");

if (args.includes("--zapisz") && (ciecia.length || tempo.length)) {
  fs.copyFileSync(RJ, KOPIA);
  for (const c of ciecia) { ujecia[c.z].do = c.a_do; ujecia[c.na].od = c.b_od; ujecia[c.na].akcja_ciecie = { przesuniecie: c.przes_b }; ujecia[c.z].akcja_ciecie_koniec = { przesuniecie: c.przes_a }; }
  const nowe = [];
  ujecia.forEach((u, i) => {
    const t = tempo.filter((x) => x.ujecie === i);
    if (!t.length) { nowe.push(u); return; }
    const grupa = u.akcja?.grupa || `a${i}_${Date.now().toString(36)}`;
    const kawalki = [];
    let cur = Number(u.od || 0);
    const doo = Number(u.do ?? dlugosc(u.src));
    for (const x of t) {
      const R = Math.min(0.4, (x.do - x.od) / 4);
      kawalki.push([cur, x.od, 1, "normalnie"], [x.od, x.od + R, 1.6, "rampa"], [x.od + R, x.do - R, x.tempo, "szybko"], [x.do - R, x.do, 1.6, "rampa"]);
      cur = x.do;
    }
    kawalki.push([cur, doo, 1, "efekt"]);
    const ost = kawalki.filter(([a, b]) => b - a >= 0.12);
    ost.forEach(([a, b, s, rola], k) => {
      const { akcja, przejscie_po, ...reszta } = u;
      nowe.push({ ...reszta, od: r2(a), do: r2(b), ...(s !== 1 ? { tempo: s } : {}), dzwiek: false, przejscie_po: k === ost.length - 1 ? przejscie_po : "ciecie", ...(k < ost.length - 1 ? { przejscie_recznie: true } : {}), akcja: { grupa, rola } });
    });
  });
  rolka.ujecia = nowe;
  fs.writeFileSync(RJ, JSON.stringify(rolka, null, 2));
  ok(`Zapisano w rolka.json (kopia: kompozycja/rolka.przed-akcja.json, cofnięcie: npm run akcja -- <projekt> --cofnij).`);
} else if (ciecia.length || tempo.length) info("To propozycja. Zapis do rolki: npm run akcja -- <projekt> --zapisz");

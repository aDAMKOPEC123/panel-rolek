// Wirtualny operator kamery (efekty.operator): kadr w ujęciu wideo prowadzony jak przez operatora.
//   mowa do kamery: trzyma twarz (oczy na ok. 38% wysokości kadru) z mapy twarzy (scripts/twarz.py),
//   praca / zabieg: idzie za miejscem ruchu (różnice klatek 108x192 z ffmpeg, środek ciężkości ruchu),
//   akcenty głosu (napisy.nacisk: n=2 mocny, n=1 lekki): krótki najazd, który dobija sprężyną i wraca.
// Ruch to symulacja sprężyny (deterministyczna, krok 1/60 s): pozycja krytycznie tłumiona (spokojny dojazd bez
// bujania), skala lekko niedotłumiona (najazd z miękkim dobiciem). Martwa strefa: drobne ruchy głowy i dłoni nie
// ruszają kadru. Kadr nigdy nie odsłania brzegu nagrania (przesunięcie ograniczone do powiększenia).
// Wynik: klatki kluczowe co 0,1 s w czasie rolki: [{ t, x, y, s }] dla transformacji #uN-m z transform-origin 0 0.
import path from "node:path";
import { uruchom } from "./lib.mjs";

const W = 1080, H = 1920;

// środek ruchu w każdej klatce (15 fps) albo null przy spokoju
function srodkiRuchu(plik, od, dl) {
  const w = 108, h = 192, fps = 15;
  const r = uruchom("ffmpeg", ["-hide_banner", "-v", "error", "-ss", String(od), "-i", plik, "-t", String(dl), "-vf", `fps=${fps},scale=${w}:${h},format=gray`, "-f", "rawvideo", "-"], { cicho: true, kodowanie: "buffer" });
  const b = Buffer.isBuffer(r.stdout) ? r.stdout : Buffer.alloc(0);
  const n = Math.floor(b.length / (w * h));
  const out = [];
  for (let i = 0; i < n; i++) {
    if (!i) { out.push({ t: od, p: null }); continue; }
    const a = b.subarray((i - 1) * w * h, i * w * h), c = b.subarray(i * w * h, (i + 1) * w * h);
    let sw = 0, sx = 0, sy = 0;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const d = Math.abs(c[y * w + x] - a[y * w + x]);
      if (d > 18) { sw += d; sx += d * x; sy += d * y; }
    }
    const udzial = sw / (255 * w * h);
    out.push({ t: od + i / fps, p: udzial > 0.002 ? [(sx / sw) * (W / w), (sy / sw) * (H / h)] : null });
  }
  return out;
}

// cel w chwili t (czas klipu): twarz (oczy) albo ruch; null = brak, kamera trzyma ostatni cel
function celTwarzy(twarz, t) {
  let best = null;
  for (const k of twarz?.klatki || []) if (k.ok && k.kot?.oczy && (!best || Math.abs(k.t - t) < Math.abs(best.t - t))) best = k;
  return best && Math.abs(best.t - t) < 0.4 ? best.kot.oczy : null;
}

/**
 * u: ujęcie z zloz ({ i, start, dur, od, tempo, zrodlo }), twarz: dane mapy twarzy albo null, mowa: czy to mowa do kamery,
 * akcenty: [{ t (czas rolki), n }], proj: folder rolki. Zwraca { klatki, cel: "twarz"|"ruch", akcenty }.
 */
export function sciezkaKamery({ proj, u, twarz, mowa, akcenty = [] }) {
  const dlK = u.dur * u.tempo;
  const tK = (tr) => u.od + (tr - u.start) * u.tempo;            // czas rolki -> czas klipu
  const zTwarzy = mowa && twarz && (twarz.klatki || []).some((k) => k.ok);
  const ruch = zTwarzy ? null : srodkiRuchu(path.join(proj, u.zrodlo), u.od, dlK);
  const kotwica = zTwarzy ? [W / 2, H * 0.38] : [W / 2, H * 0.5];
  const s0 = zTwarzy ? 1.12 : 1.1;
  const celRuchu = (t) => { let b = null; for (const k of ruch || []) if (k.p && Math.abs(k.t - t) <= 1 / 15 + 1e-6) b = k.p; return b; };

  // sprężyny: pozycja (omega 0,5 Hz, krytycznie), skala (1,6 Hz, zeta 0,5)
  const krok = 1 / 60, wP = 2 * Math.PI * 0.5, wS = 2 * Math.PI * 1.6, zS = 0.5;
  let cel0 = (zTwarzy ? celTwarzy(twarz, u.od) : celRuchu(u.od + 1 / 15)) || [W / 2, H / 2];
  let px = cel0[0], py = cel0[1], vx = 0, vy = 0, goal = [...cel0];
  let s = s0, vs = 0;
  const MARTWA = 60;                                           // px: mniejsze zmiany celu nie ruszają kadru
  const klatki = [];
  let nastepna = 0;
  for (let tr = u.start; tr <= u.start + u.dur + 1e-6; tr += krok) {
    const tk = tK(tr);
    const c = zTwarzy ? celTwarzy(twarz, tk) : celRuchu(tk);
    if (c && Math.hypot(c[0] - goal[0], c[1] - goal[1]) > MARTWA) goal = [goal[0] + (c[0] - goal[0]) * 0.85, goal[1] + (c[1] - goal[1]) * 0.85];
    // skala: baza + powolny najazd przez ujęcie + akcenty (impuls 0,6 s)
    const post = (tr - u.start) / Math.max(0.1, u.dur);
    let sCel = s0 + 0.035 * post;
    let akc = 0;
    for (const a of akcenty) if (tr >= a.t - 0.05 && tr < a.t + 0.55) akc += a.n === 2 ? 0.075 : 0.035;
    sCel += Math.min(0.1, akc);                                // akcenty tuż po sobie nie sumują się w wielki najazd
    vx += (wP * wP * (goal[0] - px) - 2 * wP * vx) * krok; px += vx * krok;
    vy += (wP * wP * (goal[1] - py) - 2 * wP * vy) * krok; py += vy * krok;
    vs += (wS * wS * (sCel - s) - 2 * zS * wS * vs) * krok; s += vs * krok;
    if (tr >= u.start + nastepna - 1e-6) {
      const sk = Math.max(1.02, s);
      // ekran = sk * punkt + T, punkt (px, py) ma trafić w kotwicę; T w granicach, żeby nie odsłonić brzegu
      const x = Math.min(0, Math.max(W - sk * W, kotwica[0] - sk * px));
      const y = Math.min(0, Math.max(H - sk * H, kotwica[1] - sk * py));
      klatki.push({ t: Math.round(tr * 1000) / 1000, x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10, s: Math.round(sk * 1000) / 1000 });
      nastepna += 0.1;
    }
  }
  return { klatki, cel: zTwarzy ? "twarz" : "ruch", akcenty: akcenty.length };
}

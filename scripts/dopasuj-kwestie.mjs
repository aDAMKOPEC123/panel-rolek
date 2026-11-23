// Dopasowanie kwestii z teleprompera (scenariusz.json) do nagrań z mową.
//   npm run dopasuj-kwestie -- <projekt> [--bez-transkrypcji]
// 1. Nagrania materiałów z teleprompterem (raw/M1_*.mp4) -> proxy/ (jeśli brak), transkrypcja każdego osobno
//    do napisy/slowa/<plik>.json (cache: pomija, gdy json jest nowszy od proxy).
// 2. Każdą kwestię szuka we wszystkich podejściach (fuzzy po słowach), ocenia: zgodność z tekstem, „yyy”, pauzy.
// 3. Wybiera najlepsze podejście i tnie na granicach słów z małym zapasem. Ręczny wybór z panelu zostaje.
// Wynik: napisy/kwestie.json + rolka.json -> napisy.zrodla (napisy z kilku plików naraz).
import fs from "node:fs";
import path from "node:path";
import { ROOT, blad, ok, info, uwaga, znajdzProjekt, ffprobe, uruchom, ROZSZ_WIDEO } from "./lib.mjs";

const args = process.argv.slice(2);
const bezTranskrypcji = args.includes("--bez-transkrypcji");
const proj = znajdzProjekt(args.find((a) => !a.startsWith("--")));
const r3 = (x) => Math.round(x * 1000) / 1000;
const czytaj = (p, d) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return d; } };

const SC = czytaj(path.join(proj, "scenariusz.json"), null);
if (!SC?.materialy?.length) blad("Ta rolka nie ma scenariusz.json z materiałami.", "Kwestie dopasowuje się w rolkach z „Wymyśl nową rolkę”. W innych rolkach zrób napisy w kroku Napisy.");
const kw = (m) => (Array.isArray(m.teleprompter) ? m.teleprompter : []).map((k) => (typeof k === "string" ? { kiedy: "", tekst: k } : k)).filter((k) => k?.tekst?.trim());
const zMowa = SC.materialy.filter((m) => kw(m).length);
if (!zMowa.length) blad("Żaden materiał w scenariuszu nie ma teleprompera.", "Poproś Claude w rozmowie o kwestie do powiedzenia.");

// --- pliki z mową: raw/M1_* -> proxy/M1_*.mp4 ---
const lista = (d) => (fs.existsSync(path.join(proj, d)) ? fs.readdirSync(path.join(proj, d)) : []);
const raw = lista("raw").filter((n) => ROZSZ_WIDEO.test(n));
const pref = (m) => m.id.toLowerCase() + "_";
const doProxy = raw.filter((n) => zMowa.some((m) => n.toLowerCase().startsWith(pref(m))) && !fs.existsSync(path.join(proj, "proxy", path.parse(n).name + ".mp4")));
if (doProxy.length) {
  const rolka0 = czytaj(path.join(proj, "kompozycja", "rolka.json"), {});
  const cisza = rolka0.efekty?.wytnij_cisze !== false;
  info(`Przygotowuję nagrania z mową (${doProxy.length})${cisza ? " z wycinaniem ciszy" : ""}...`);
  fs.mkdirSync(path.join(proj, "proxy"), { recursive: true });
  const r = uruchom(process.execPath, [path.join(ROOT, "scripts", "normalizuj.mjs"), proj, ...doProxy, ...(cisza ? ["--cisza"] : [])], { pokaz: true });
  if (r.code !== 0) blad("Nie udało się przygotować nagrań z mową.", "Sprawdź log powyżej.");
}
const proxy = lista("proxy").filter((n) => /\.mp4$/i.test(n));
const pliki = []; // { src: "proxy/M1_x.mp4", json: "napisy/slowa/M1_x.json", material }
for (const m of zMowa) for (const n of proxy.filter((x) => x.toLowerCase().startsWith(pref(m)))) pliki.push({ src: `proxy/${n}`, json: `napisy/slowa/${path.parse(n).name}.json`, material: m.id });
if (!pliki.length) blad(`Nie ma jeszcze nagrań z mową (${zMowa.map((m) => m.id).join(", ")}).`, "Wgraj je w kroku Nagrania przy materiale, potem kliknij „Dopasuj kwestie”.");

// --- transkrypcja każdego pliku osobno ---
for (const p of pliki) {
  const src = path.join(proj, p.src), dst = path.join(proj, p.json);
  if (fs.existsSync(dst) && fs.statSync(dst).mtimeMs > fs.statSync(src).mtimeMs) { info(`= ${p.json} (już jest)`); continue; }
  if (bezTranskrypcji) { uwaga(`Pomijam transkrypcję ${p.src} (--bez-transkrypcji).`); continue; }
  info(`\nTranskrypcja ${p.src} ...`);
  const r = uruchom(process.execPath, [path.join(ROOT, "scripts", "transkrybuj.mjs"), proj, p.src, "--do", p.json], { pokaz: true, timeout: 60 * 60 * 1000 });
  if (r.code !== 0) uwaga(`Transkrypcja ${p.src} nie wyszła, pomijam ten plik.`);
}
const slowaPliku = {};
for (const p of pliki) { const s = czytaj(path.join(proj, p.json), null); if (Array.isArray(s) && s.length) slowaPliku[p.src] = s; }

// --- dopasowanie ---
// Liczebniki -> cyfry (teleprompter pisze „sześć tygodni”, transkrypcja daje „6 tygodni”).
const LICZBY = Object.fromEntries(Object.entries({
  1: "jeden jedna jedno jednego jednej", 2: "dwa dwie dwoch dwu dwoma", 3: "trzy trzech trzema", 4: "cztery czterech czterema",
  5: "piec pieciu piecioma", 6: "szesc szesciu szescioma", 7: "siedem siedmiu", 8: "osiem osmiu", 9: "dziewiec dziewieciu",
  10: "dziesiec dziesieciu", 12: "dwanascie dwunastu", 15: "pietnascie pietnastu", 20: "dwadziescia dwudziestu", 30: "trzydziesci trzydziestu",
  40: "czterdziesci", 50: "piecdziesiat", 60: "szescdziesiat", 100: "sto stu",
}).flatMap(([cyfra, slowa]) => slowa.split(" ").map((s) => [s, cyfra])));
const norm = (t) => { const n = String(t).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/ł/g, "l").replace(/[^a-z0-9]/g, ""); return LICZBY[n] || n; };
const WYPELNIACZE = new Set(["yyy", "yy", "y", "eee", "ee", "e", "eem", "em", "mmm", "mm", "hmm", "hm", "yhm", "eh", "ehm", "aaa"]);
function lev(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}
const podobne = (a, b) => {
  if (!a || !b) return false;
  if (a === b) return true;
  const k = Math.min(a.length, b.length);
  if (k >= 4 && (a.startsWith(b.slice(0, k - 1)) || b.startsWith(a.slice(0, k - 1)))) return true; // odmiana: brwi/brwiach
  return Math.max(a.length, b.length) >= 4 && lev(a, b) / Math.max(a.length, b.length) <= 0.25;
};
// LCS po słowach z dopasowaniem rozmytym; zwraca długość i indeksy dopasowanych słów okna
function lcs(K, Wn) {
  const n = K.length, m = Wn.length;
  const d = Array.from({ length: n + 1 }, () => new Int16Array(m + 1));
  for (let i = 1; i <= n; i++) for (let j = 1; j <= m; j++) d[i][j] = podobne(K[i - 1], Wn[j - 1]) ? d[i - 1][j - 1] + 1 : Math.max(d[i - 1][j], d[i][j - 1]);
  const traf = [], brak = [];
  let i = n, j = m;
  while (i > 0 && j > 0) { if (podobne(K[i - 1], Wn[j - 1]) && d[i][j] === d[i - 1][j - 1] + 1) { traf.push(j - 1); i--; j--; } else if (d[i - 1][j] >= d[i][j - 1]) { brak.push(i - 1); i--; } else j--; }
  while (i > 0) { brak.push(i - 1); i--; }
  return { dl: d[n][m], traf: traf.reverse(), brak: brak.reverse() };
}
function kandydaci(tekst, src) {
  const W = slowaPliku[src];
  const Kslowa = tekst.split(/\s+/).filter(Boolean);
  const K = Kslowa.map(norm).filter(Boolean);
  if (!K.length) return [];
  const Wn = W.map((w) => norm(w.text));
  const startowe = new Set(K.slice(0, 3));
  const out = [];
  for (let i = 0; i < W.length; i++) {
    if (![...startowe].some((s) => podobne(s, Wn[i]))) continue;
    let best = null;
    const maxDl = Math.ceil(K.length * 1.6) + 4;
    for (let j = i + Math.max(0, Math.floor(K.length * 0.5) - 1); j < Math.min(W.length, i + maxDl); j++) {
      const okno = Wn.slice(i, j + 1).map((t) => (WYPELNIACZE.has(t) ? "" : t));
      const { dl, traf, brak } = lcs(K, okno);
      if (!dl) continue;
      const bezW = okno.filter(Boolean).length;
      const R = dl / K.length, P = dl / Math.max(1, bezW);
      const F = (2 * P * R) / (P + R);
      if (!best || F > best.F + 1e-9) best = { F, R, a: i + traf[0], b: i + traf[traf.length - 1], brak };
    }
    if (best && best.R >= 0.5) out.push(best);
  }
  // jedno okno na podejście: z nakładających się zostaje najlepsze
  out.sort((x, y) => y.F - x.F);
  const wybrane = [];
  for (const c of out) if (!wybrane.some((w) => !(c.b < w.a || c.a > w.b))) wybrane.push(c);
  return wybrane.map((c) => {
    const slowa = W.slice(c.a, c.b + 1);
    const wyp = slowa.filter((w) => WYPELNIACZE.has(norm(w.text))).length;
    let pauzy = 0, najdluzsza = 0;
    for (let k = 1; k < slowa.length; k++) { const p = slowa[k].start - slowa[k - 1].end; if (p > 0.7) pauzy++; najdluzsza = Math.max(najdluzsza, p); }
    // powtórzone słowa (zająknięcie: „to to”)
    let powt = 0; for (let k = 1; k < slowa.length; k++) if (norm(slowa[k].text) && norm(slowa[k].text) === norm(slowa[k - 1].text)) powt++;
    const ocena = Math.max(0, Math.round(c.F * 100 - 6 * wyp - 4 * pauzy - 4 * powt));
    const prev = W[c.a - 1], next = W[c.b + 1];
    const od = Math.max(0, prev ? Math.max(prev.end + 0.02, W[c.a].start - 0.12) : W[c.a].start - 0.12);
    let doo = W[c.b].end + 0.18;
    if (next) doo = Math.max(W[c.b].end + 0.03, Math.min(doo, next.start - 0.02));
    // Mikro-cięcia: z wybranego podejścia wylatują „yyy”, powtórzone słowa i pauzy > 0,35 s (zloz maskuje skok zmianą kadru).
    const zostaw = slowa.map((w, k) => !WYPELNIACZE.has(norm(w.text)) && !(k + 1 < slowa.length && norm(w.text) && norm(w.text) === norm(slowa[k + 1].text)));
    const segmenty = [];
    let cur = null;
    slowa.forEach((w, k) => {
      if (!zostaw[k]) { cur = null; return; }
      const przerwa = cur && w.start - cur.ost.end > 0.35;
      if (!cur || przerwa) { cur = { a: w, ost: w }; segmenty.push(cur); } else cur.ost = w;
    });
    const nastepne = (w) => slowa[slowa.indexOf(w) + 1];
    const seg = segmenty.map((g, k) => [r3(k === 0 ? od : Math.max(g.a.start - 0.06, 0)), r3(k === segmenty.length - 1 ? doo : Math.min(g.ost.end + 0.08, (nastepne(g.ost)?.start ?? Infinity) - 0.01))])
      .reduce((acc, s) => { const p = acc[acc.length - 1]; if (p && s[0] - p[1] < 0.12) p[1] = s[1]; else acc.push(s); return acc; }, []);
    const uwagi = [];
    if (c.brak.length) uwagi.push(`brakuje: ${c.brak.map((x) => Kslowa[x]).filter(Boolean).slice(0, 6).join(", ")}`);
    if (wyp) uwagi.push(`${wyp}× „yyy”`);
    if (powt) uwagi.push(`${powt}× powtórzone słowo`);
    if (pauzy) uwagi.push(`pauza ${najdluzsza.toFixed(1)} s w środku`);
    return { plik: src, od: r3(od), do: r3(doo), ...(seg.length > 1 ? { segmenty: seg, wyciete: r3(doo - od - seg.reduce((a, s) => a + s[1] - s[0], 0)) } : {}), ocena, zgodnosc: Math.round(c.F * 100), powiedziane: slowa.map((w) => w.text).join(" "), uwagi };
  });
}

const stare = czytaj(path.join(proj, "napisy", "kwestie.json"), { kwestie: [] });
const wynik = [];
for (const m of zMowa) {
  const zrodla = pliki.filter((p) => p.material === m.id && slowaPliku[p.src]).map((p) => p.src);
  // najpierw pliki tego materiału; jeśli kwestii tam nie ma, szukamy też w innych nagraniach z mową
  kw(m).forEach((k, nr) => {
    let pod = zrodla.flatMap((s) => kandydaci(k.tekst, s));
    if (!pod.length) pod = Object.keys(slowaPliku).filter((s) => !zrodla.includes(s)).flatMap((s) => kandydaci(k.tekst, s));
    // remis: późniejsze podejście (zwykle lepsze) wygrywa
    pod.sort((a, b) => b.ocena - a.ocena || (b.plik > a.plik ? 1 : b.plik < a.plik ? -1 : b.od - a.od));
    pod = pod.slice(0, 5);
    const st = stare.kwestie?.find((x) => x.material === m.id && x.nr === nr && x.tekst === k.tekst);
    let wybrane = pod[0] || null, recznie = false;
    if (st?.recznie && st.wybrane && slowaPliku[st.wybrane.plik]) { wybrane = st.wybrane; recznie = true; if (!pod.some((p) => p.plik === wybrane.plik && Math.abs(p.od - wybrane.od) < 0.05)) pod.unshift(wybrane); }
    wynik.push({ material: m.id, nr, kiedy: k.kiedy || "", tekst: k.tekst, wybrane, podejscia: pod, recznie });
  });
}
fs.mkdirSync(path.join(proj, "napisy"), { recursive: true });
fs.writeFileSync(path.join(proj, "napisy", "kwestie.json"), JSON.stringify({ utworzono: new Date().toISOString(), pliki: Object.fromEntries(pliki.filter((p) => slowaPliku[p.src]).map((p) => [p.src, p.json])), kwestie: wynik }, null, 1) + "\n", "utf8");

// napisy z kilku plików naraz: rolka.json -> napisy.zrodla
const rj = path.join(proj, "kompozycja", "rolka.json");
const rolka = czytaj(rj, null);
if (rolka) {
  rolka.napisy = { ...(rolka.napisy || {}), wlacz: rolka.napisy?.wlacz !== false, zrodla: Object.fromEntries(pliki.filter((p) => slowaPliku[p.src]).map((p) => [p.src, p.json])) };
  fs.writeFileSync(rj, JSON.stringify(rolka, null, 2) + "\n", "utf8");
}

const znal = wynik.filter((k) => k.wybrane);
ok(`Kwestie: znalezione ${znal.length}/${wynik.length} -> napisy/kwestie.json`);
for (const k of wynik) {
  const w = k.wybrane;
  info(w ? `  ${k.material}.${k.nr + 1} ${w.ocena >= 85 ? "✓" : "~"} ${path.basename(w.plik)} ${w.od.toFixed(2)}-${w.do.toFixed(2)} s, ocena ${w.ocena}${w.uwagi.length ? ` (${w.uwagi.join("; ")})` : ""}${k.recznie ? " [wybrane ręcznie]" : ""}`
    : `  ${k.material}.${k.nr + 1} ✗ nie znaleziono: „${k.tekst.slice(0, 60)}”`);
}
if (znal.length < wynik.length) uwaga("Nie wszystkie kwestie są w nagraniach. Nagraj brakujące albo zmień tekst w rozmowie z Claude.");

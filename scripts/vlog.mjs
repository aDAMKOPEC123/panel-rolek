// Automatyczny montaż vloga / daily z wielu klipów z telefonu.
//   npm run vlog -- <projekt> [--tempo 100] [--dlugosc 40] [--force]
// 1. Każde nagranie z raw/: godzina nagrania (metadane telefonu, inaczej data pliku), proxy (bez wycinania ciszy).
// 2. Analiza co 0,25 s: ostrość (blurdetect), jasność, ruch (różnica klatek), głośność (EBU R128).
//    Odrzuca: za ciemne, nieostre, poruszone, za krótkie. Wykrywa wstawki z mową i „dźwięk ON” (wyraźny naturalny dźwięk).
// 3. Z każdego klipu wybiera najlepszy kawałek o długości 2 albo 4 uderzeń rytmu (tempo w BPM -> cięcia w rytmie).
//    Mowa dostaje dłuższy kawałek (do 6 s) z dźwiękiem. Gdy materiału jest za dużo, zostają najlepsze, po kolei w czasie.
// 4. Rozdziały dnia (rano, przed południem, popołudnie, wieczór albo przerwa > 45 min) z planszą vlog-godzina,
//    hook na start, zajawka końca dnia, CTA. Raport: kompozycja/vlog.json (co wybrane, co odrzucone i dlaczego).
// Nadpisuje ujęcia i sceny w rolka.json: zwykłą rolkę z ręcznym montażem chroni (bez --force odmawia), kopia: rolka.przed-vlog.json.
import fs from "node:fs";
import path from "node:path";
import { ROOT, blad, ok, info, uwaga, szary, znajdzProjekt, ffprobe, uruchom, czytajBrief, ROZSZ_WIDEO, ROZSZ_OBRAZ } from "./lib.mjs";

const args = process.argv.slice(2);
const flaga = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args.splice(i, 2)[1] : d; };
const TEMPO = Math.min(160, Math.max(60, Number(flaga("--tempo", 100)) || 100));
const CEL = Math.min(90, Math.max(12, Number(flaga("--dlugosc", 40)) || 40));
const force = args.includes("--force");
const proj = znajdzProjekt(args.find((a) => !a.startsWith("--")));
const BEAT = 60 / TEMPO;
const r3 = (x) => Math.round(x * 1000) / 1000;
const naBeat = (x, min = 2) => Math.max(min, Math.round(x / BEAT)) * BEAT;
const sr = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);

const rj = path.join(proj, "kompozycja", "rolka.json");
const rolka = JSON.parse(fs.readFileSync(rj, "utf8"));
// Ujęcia „prawdziwe” = pliki, które istnieją (szablon nowej rolki ma zastępczy proxy/KLIP_Z_MOWA.mp4).
if ((rolka.ujecia || []).filter((u) => u.src && fs.existsSync(path.join(proj, u.src))).length && !rolka.vlog && !force) blad("Ta rolka ma już ręcznie ułożone ujęcia.", "Montaż vloga je zastąpi. Uruchom z --force (kopia zostanie w kompozycja/rolka.przed-vlog.json).");

// --- 1. nagrania i godziny ---
const RAW = path.join(proj, "raw");
const raw = fs.readdirSync(RAW).filter((n) => ROZSZ_WIDEO.test(n) || ROZSZ_OBRAZ.test(n));
if (!raw.length) blad("W raw/ nie ma nagrań.", "Wrzuć klipy z całego dnia (Nagrania > wgraj albo 00_INBOX).");
function godzinaNagrania(plik) {
  const r = uruchom("ffprobe", ["-v", "error", "-show_entries", "format_tags:stream_tags", "-of", "json", plik], { cicho: true });
  let tagi = {};
  try { const j = JSON.parse(r.stdout); tagi = { ...(j.streams || []).reduce((a, s) => ({ ...a, ...(s.tags || {}) }), {}), ...(j.format?.tags || {}) }; } catch {}
  // iPhone: com.apple.quicktime.creationdate ma czas lokalny z przesunięciem (najlepsze); creation_time jest w UTC.
  const apple = tagi["com.apple.quicktime.creationdate"];
  if (apple) { const m = apple.match(/(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})/); if (m) return { data: m[1], min: Number(m[2]) * 60 + Number(m[3]) + Number(m[4]) / 60, zrodlo: "telefon" }; }
  const ct = tagi.creation_time;
  if (ct && !/^1970|^1904/.test(ct)) { const d = new Date(ct); return { data: d.toISOString().slice(0, 10), min: d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60, zrodlo: "telefon" }; }
  const d = fs.statSync(plik).mtime;
  return { data: d.toISOString().slice(0, 10), min: d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60, zrodlo: "plik" };
}
const klipy = raw.map((n) => ({ n, base: path.parse(n).name, obraz: ROZSZ_OBRAZ.test(n), ...godzinaNagrania(path.join(RAW, n)) }));
const bezProxy = klipy.filter((k) => !k.obraz && !fs.existsSync(path.join(proj, "proxy", k.base + ".mp4"))).map((k) => k.n);
if (bezProxy.length) {
  info(`Przygotowuję ${bezProxy.length} nagrań (pion, 30 fps, czysty dźwięk)...`);
  fs.mkdirSync(path.join(proj, "proxy"), { recursive: true });
  const r = uruchom(process.execPath, [path.join(ROOT, "scripts", "normalizuj.mjs"), proj, ...bezProxy], { pokaz: true });
  if (r.code !== 0) blad("Nie udało się przygotować nagrań.", "Sprawdź log powyżej.");
}

// --- 2. analiza ---
function seria(plik, vf, klucze) {
  const r = uruchom("ffmpeg", ["-hide_banner", "-nostats", "-i", plik, "-an", "-vf", vf + ",metadata=print:file=-", "-f", "null", "-"], { cicho: true, timeout: 10 * 60 * 1000 });
  const out = [];
  let cur = null;
  for (const l of r.stdout.split(/\r?\n/)) {
    const t = l.match(/pts_time:([\d.]+)/);
    if (t) { cur = { t: Number(t[1]) }; out.push(cur); continue; }
    for (const [k, nazwa] of klucze) if (cur && l.startsWith(k + "=")) cur[nazwa] = Number(l.slice(k.length + 1));
  }
  return out;
}
function glosnosc(plik) {
  const r = uruchom("ffmpeg", ["-hide_banner", "-nostats", "-i", plik, "-vn", "-af", "ebur128=metadata=1,ametadata=print:key=lavfi.r128.M:file=-", "-f", "null", "-"], { cicho: true, timeout: 10 * 60 * 1000 });
  const out = []; let t = null;
  for (const l of r.stdout.split(/\r?\n/)) { const a = l.match(/pts_time:([\d.]+)/); if (a) t = Number(a[1]); const b = l.match(/lavfi\.r128\.M=(-?[\d.]+)/); if (b && t != null) out.push({ t, M: Number(b[1]) }); }
  return out;
}
const KROK = 0.25;
// Pomiar z normalizacji (przed jej łagodnym rozjaśnieniem uwaga „za ciemne” zostaje w proxy/.obraz.json).
const obrazNorm = (() => { try { return JSON.parse(fs.readFileSync(path.join(proj, "proxy", ".obraz.json"), "utf8")); } catch { return {}; } })();
for (const k of klipy) {
  if (k.obraz) { k.src = `raw/${k.n}`; k.dl = 2; k.ocena = 0.5; continue; }
  k.src = `proxy/${k.base}.mp4`;
  const p = path.join(proj, k.src);
  const m = ffprobe(p);
  k.dl = m.duration;
  const obraz = seria(p, `fps=${1 / KROK},scale=270:480,blurdetect=block_width=32:block_height=32,signalstats`, [["lavfi.blur", "blur"], ["lavfi.signalstats.YAVG", "y"]]);
  const ruch = seria(p, `fps=${1 / KROK},scale=180:320,tblend=all_mode=difference,signalstats`, [["lavfi.signalstats.YAVG", "d"]]);
  const glos = m.hasAudio ? glosnosc(p) : [];
  k.probki = obraz.map((o, i) => {
    const d = ruch[i]?.d ?? 0;
    const g = glos.filter((x) => x.t >= o.t && x.t < o.t + KROK).map((x) => x.M);
    return { t: o.t, blur: o.blur ?? 5, y: o.y ?? 120, ruch: d, M: g.length ? Math.max(...g) : -120 };
  });
  info(szary(`  ${k.n}: ${k.dl.toFixed(1)} s, ${String(Math.floor(k.min / 60)).padStart(2, "0")}:${String(Math.floor(k.min % 60)).padStart(2, "0")} (${k.zrodlo})`));
}
// Progi względne: nieostrość i ruch oceniamy na tle całego dnia (telefony różnią się skalą).
const wszystkie = klipy.flatMap((k) => k.probki || []);
const medBlur = wszystkie.length ? [...wszystkie].sort((a, b) => a.blur - b.blur)[wszystkie.length >> 1].blur : 5;
const medRuch = wszystkie.length ? [...wszystkie].sort((a, b) => a.ruch - b.ruch)[wszystkie.length >> 1].ruch : 3;
const ocenaProbki = (p) => {
  let s = 1;
  s -= Math.max(0, (p.blur - medBlur) / Math.max(1, medBlur)) * 0.8; // nieostrość
  if (p.y < 60) s -= (60 - p.y) / 60; // ciemno
  if (p.y > 225) s -= 0.4; // przepalone
  const r = p.ruch / Math.max(1, medRuch);
  s += r > 0.3 && r < 2.5 ? 0.25 : 0; // trochę ruchu = życie w kadrze
  if (r > 4) s -= Math.min(0.8, (r - 4) * 0.15); // szarpanie / machanie telefonem
  return s;
};
const decyzje = [];
for (const k of klipy) {
  if (k.obraz) { k.wybor = { od: 0, do: naBeat(2 * BEAT, 2), ocena: 0.5 }; continue; }
  const P = k.probki;
  if (k.dl < 0.8 || P.length < 3) { decyzje.push({ plik: k.n, decyzja: "odrzucony", powod: "za krótki" }); k.odrzucony = true; continue; }
  // mowa: większość próbek głośna (> -30 LUFS momentary) przez co najmniej 2 s
  const glosne = P.map((p) => p.M > -30);
  let najdl = { a: 0, b: 0 }, a = null;
  glosne.forEach((g, i) => { if (g && a == null) a = i; if ((!g || i === glosne.length - 1) && a != null) { const b = g ? i : i - 1; if (b - a > najdl.b - najdl.a) najdl = { a, b }; a = null; } });
  const mowaS = (najdl.b - najdl.a + 1) * KROK;
  k.mowa = mowaS >= 2 && glosne.filter(Boolean).length / glosne.length > 0.45;
  const L = k.mowa ? Math.min(6, naBeat(mowaS, 2)) : naBeat(BEAT * (k.dl >= 4 ? 4 : 2), 2);
  const n = Math.max(1, Math.round(L / KROK));
  let best = null;
  for (let i = Math.min(1, P.length - 1); i + n <= P.length; i++) {
    const okno = P.slice(i, i + n);
    let s = sr(okno.map(ocenaProbki));
    if (k.mowa) s += okno.filter((p) => p.M > -30).length / n * 0.6;
    if (!best || s > best.s) best = { i, s };
  }
  if (!best) best = { i: 0, s: sr(P.map(ocenaProbki)) };
  const okno = P.slice(best.i, best.i + n);
  const yAvg = sr(okno.map((p) => p.y)), blurAvg = sr(okno.map((p) => p.blur)), ruchAvg = sr(okno.map((p) => p.ruch));
  const powody = [];
  const pomiar = obrazNorm[k.src];
  if (yAvg < 45 || pomiar?.uwagi?.includes("za ciemne")) powody.push("za ciemny");
  if (blurAvg > medBlur * 1.8 && blurAvg > 6) powody.push("nieostry");
  if (ruchAvg > medRuch * 6 && ruchAvg > 12) powody.push("poruszony");
  if (powody.length && !k.mowa) { decyzje.push({ plik: k.n, decyzja: "odrzucony", powod: powody.join(", ") }); k.odrzucony = true; continue; }
  const od = r3(Math.max(0, P[best.i].t));
  k.wybor = { od, do: r3(Math.min(k.dl, od + L)), ocena: Math.round(best.s * 100) / 100, uwagi: powody };
  // dźwięk ON: krótki, wyraźny dźwięk w kawałku bez mowy (o 12 LU głośniej niż mediana klipu)
  const Ms = P.map((p) => p.M).filter((x) => x > -90).sort((x, y) => x - y);
  const medM = Ms.length ? Ms[Ms.length >> 1] : -90;
  k.dzwiekOn = !k.mowa && okno.some((p) => p.M > Math.max(-28, medM + 12));
}
const dobre = klipy.filter((k) => !k.odrzucony && k.wybor).sort((a, b) => a.data.localeCompare(b.data) || a.min - b.min);
if (!dobre.length) blad("Żaden klip nie nadaje się do montażu.", "Sprawdź raport w kompozycja/vlog.json i nagraj jaśniej i stabilniej.");

// --- 3. budżet długości: zostają najlepsze, kolejność w czasie ---
const HOOK = 0, KONIEC = 2.5; // CTA na końcu na osobnej planszy
const dlU = (k) => k.wybor.do - k.wybor.od;
let suma = dobre.reduce((a, k) => a + dlU(k), 0);
const wybrane = new Set(dobre);
if (suma > CEL - KONIEC) {
  // mowa jest najcenniejsza, potem najwyższa ocena; pierwszy i ostatni klip dnia zostają (start i zamknięcie dnia)
  const kolejka = [...dobre].filter((k) => k !== dobre[0] && k !== dobre[dobre.length - 1]).sort((a, b) => (a.mowa - b.mowa) || (a.wybor.ocena - b.wybor.ocena));
  for (const k of kolejka) { if (suma <= CEL - KONIEC) break; wybrane.delete(k); suma -= dlU(k); decyzje.push({ plik: k.n, decyzja: "pominięty", powod: `brak miejsca w ${CEL} s (słabszy od innych)` }); }
}
const final = dobre.filter((k) => wybrane.has(k));

// --- 4. rozdziały dnia ---
const pora = (min) => (min < 11 * 60 ? "rano" : min < 14 * 60 ? "przed południem" : min < 18 * 60 ? "popołudnie" : "wieczór");
const hhmm = (min) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(Math.floor(min % 60)).padStart(2, "0")}`;
let rozdzial = -1;
final.forEach((k, i) => { const prev = final[i - 1]; const nowy = !prev || pora(k.min) !== pora(prev.min) || k.min - prev.min > 90 || k.data !== prev.data; if (nowy) rozdzial++; k.rozdzial = rozdzial; k.nowyRozdzial = nowy; });

// --- 5. rolka.json ---
const ujecia = final.map((k, i) => {
  const nast = final[i + 1];
  const u = { src: k.src, ...(k.obraz ? { czas: r3(dlU(k)) } : { od: k.wybor.od, do: k.wybor.do }), przejscie_po: nast && nast.nowyRozdzial ? "zoom" : "ciecie", vlog: { godzina: hhmm(k.min), rozdzial: k.rozdzial } };
  if (!k.obraz) { u.dzwiek = true; u.glosnosc = k.mowa ? 1 : k.dzwiekOn ? 0.8 : 0.22; }
  if (k.mowa) u.vlog.mowa = true;
  if (k.dzwiekOn) u.vlog.dzwiek_on = true;
  return u;
});
// czasy startów ujęć (jak w zloz: cięcia bez zakładek)
let t = 0;
const starty = ujecia.map((u) => { const s = t; t += u.czas ?? (u.do - u.od); return s; });
const D = t;
const { pola } = czytajBrief(proj);
let hookTxt = "";
try { const sc = JSON.parse(fs.readFileSync(path.join(proj, "scenariusz.json"), "utf8")); hookTxt = ((sc.hooki || []).find((h) => h.wybrany) || sc.hooki?.[0])?.tekst || ""; } catch {}
if (!hookTxt) hookTxt = (fs.readFileSync(path.join(proj, "brief.md"), "utf8").split(/^## Hook \(3 warianty\)/m)[1] || "").match(/^\s*1\.\s*(.+)$/m)?.[1]?.replace(/\s*\(wybrany\)$/, "").trim() || "";
if (!hookTxt || /^todo$/i.test(hookTxt)) hookTxt = "Mój dzień w *gabinecie*";
// Opisy rozdziałów poprawione ręcznie (w kroku Sceny) zostają przy ponownym montażu: klucz = godzina rozdziału.
const stareRozdzialy = Object.fromEntries((rolka.sceny || []).filter((s) => s.szablon === "vlog-godzina" && s.dane?.godzina).map((s) => [s.dane.godzina, s.dane.opis]));
const sceny = [{ szablon: "hook-tytul", start: 0, czas: Math.min(2, Math.max(1.4, 4 * BEAT)), dane: { tekst: hookTxt, wariant: "slowa" } }];
final.forEach((k, i) => {
  if (!k.nowyRozdzial) return;
  const start = i === 0 ? r3(sceny[0].czas + 0.35) : r3(starty[i]);
  const ost = sceny[sceny.length - 1];
  if (start > D - 1.5 || start < ost.start + ost.czas + 0.3) return; // plansze nie nachodzą na siebie ani na hook
  sceny.push({ szablon: "vlog-godzina", start, czas: r3(Math.min(1.8, Math.max(1.2, 3 * BEAT))), rozdzial: k.rozdzial, dane: { godzina: hhmm(k.min), opis: stareRozdzialy[hhmm(k.min)] ?? pora(k.min) } });
});
const ctaStare = rolka.vlog ? (rolka.sceny || []).find((s) => s.szablon === "cta-koncowe")?.dane?.tekst : null;
sceny.push({ szablon: "cta-koncowe", start: r3(D), czas: KONIEC, dane: { tekst: ctaStare || "Obserwuj, jutro *kolejny dzień*" } });
fs.writeFileSync(path.join(proj, "kompozycja", "rolka.przed-vlog.json"), JSON.stringify(rolka, null, 2) + "\n", "utf8");
const nowa = {
  ...rolka,
  format: 11,
  ujecia,
  sceny,
  voiceover: rolka.vlog?.lektor ? rolka.voiceover : null,
  // Napisy: tylko gdy są (transkrypcja wstawek albo lektora). Sam obraz dnia idzie bez napisów.
  napisy: { ...(rolka.napisy || {}), wlacz: fs.existsSync(path.join(proj, "napisy", "transcript.json")) || !!Object.keys(rolka.napisy?.zrodla || {}).length },
  efekty: { ...(rolka.efekty || {}), zajawka: true, bodziec: false, dzwieki: true, zapetlenie: true, punch_in: final.some((k) => k.mowa), wycisz_muzyke: true },
  vlog: { tempo: TEMPO, dlugosc_cel: CEL, utworzono: new Date().toISOString(), lektor: rolka.vlog?.lektor || false },
};
fs.writeFileSync(rj, JSON.stringify(nowa, null, 2) + "\n", "utf8");
for (const k of final) decyzje.push({ plik: k.n, decyzja: "wybrany", godzina: hhmm(k.min), od: k.wybor.od, do: k.wybor.do, ocena: k.wybor.ocena, mowa: !!k.mowa, dzwiek_on: !!k.dzwiekOn, uwagi: k.wybor.uwagi || [] });
const raport = { utworzono: new Date().toISOString(), tempo: TEMPO, beat: r3(BEAT), dlugosc: r3(D + KONIEC), cel: CEL, klipow: klipy.length, wybranych: final.length, rozdzialow: rozdzial + 1, godzinyZPliku: klipy.filter((k) => k.zrodlo === "plik").length, decyzje };
fs.writeFileSync(path.join(proj, "kompozycja", "vlog.json"), JSON.stringify(raport, null, 1) + "\n", "utf8");
ok(`Vlog: ${final.length}/${klipy.length} klipów, ${rozdzial + 1} rozdz., ${(D + KONIEC).toFixed(1)} s (tempo ${TEMPO} BPM, cięcia co ${(2 * BEAT).toFixed(2)}/${(4 * BEAT).toFixed(2)} s)`);
for (const d of decyzje.filter((x) => x.decyzja !== "wybrany")) info(szary(`  ${d.decyzja}: ${d.plik} (${d.powod})`));
if (raport.godzinyZPliku) uwaga(`${raport.godzinyZPliku} klipów nie ma godziny nagrania w metadanych (wzięłam datę pliku). Sprawdź kolejność na osi czasu.`);
if (final.some((k) => k.mowa) && !fs.existsSync(path.join(proj, "napisy", "transcript.json"))) info(`Wstawki z mową: ${final.filter((k) => k.mowa).map((k) => k.n).join(", ")}. Napisy: krok Napisy (wybierz klip) albo lektor.`);
uwaga("Sprawdź, czy w ujęciach nie widać twarzy klientek bez zgody (final to zablokuje tylko, jeśli w brief.md jest „twarz klientki w kadrze: tak”).");
info(`Dalej: npm run zloz -- ${path.basename(proj)}  (w Instagramie dobierz piosenkę ok. ${TEMPO} BPM albo dodaj muzykę z licencją)`);

// Składa kompozycję HyperFrames rolki z kompozycja/rolka.json i szablonów z 04_SZABLONY_HF.
//   npm run zloz -- <projekt> [--force]
// Wynik: kompozycja/index.html + kompozycja/compositions/*.html + kompozycja/assets/*
// Ręczne poprawki rób w rolka.json (albo w szablonie). zloz nadpisuje index.html i compositions/,
// ale odmówi, jeśli index.html zmieniono ręcznie (np. w Studio) po ostatnim złożeniu (chyba że --force).
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import {
  ROOT, SZABLONY_HF, BRAND, blad, ok, info, uwaga, wczytajConfig, czyTodo, znajdzProjekt, wczytajRolke,
  podlinkuj, ffprobe, uruchom, ROZSZ_WIDEO, ROZSZ_OBRAZ,
} from "./lib.mjs";
import { naciskGlosu } from "./nacisk-glosu.mjs";
import { sciezkaKamery } from "./operator-kamery.mjs";
import { zastosujStyl } from "./style-marki.mjs";
import { czyNaturalny, naturalnyMontaz } from "./montaz-naturalny.mjs";
import { mapaTwarzy, punktyKotwicy, pozycjaKotwicy, klatkiTwarzy, wielkoscTwarzy } from "./twarz-dane.mjs";

const args = process.argv.slice(2);
const force = args.includes("--force");
const proj = znajdzProjekt(args.find((a) => !a.startsWith("--")));
const KOMP = path.join(proj, "kompozycja");
const rolkaPlik = wczytajRolke(proj);
// Montaż naturalny (rolka.json -> montaz: "naturalny"): wygląd vlogerki zamiast reklamy. Przeróbka tylko w pamięci,
// rolka.json zostaje bez zmian (scripts/montaz-naturalny.mjs).
const NAT = czyNaturalny(rolkaPlik) ? naturalnyMontaz(rolkaPlik) : null;
const rolka = NAT ? NAT.rolka : rolkaPlik;
// Stylistyka rolki (rolka.json -> styl, 02_BRAND/style/<id>): kolory, fonty, logo, znak wodny, marka, ruch, napisy.
const cfg = zastosujStyl(wczytajConfig(), rolka.styl);
const LOGO = cfg.styl.logo, ZNAK = cfg.styl.watermark;
// Głośność całej rolki (np. 0.9 = 10% ciszej): mnoży głos, muzykę i efekty, proporcje miksu zostają.
const GLOSNOSC = Number(rolka.glosnosc ?? 1);
const vol = (v) => r3(Number(v) * GLOSNOSC);
// Efekty montażu: każdy Tak/Nie w panelu (krok Styl). Brak pola = Nie.
const ef = rolka.efekty || {};
const FPS = Number(cfg.rolka?.fps || 30);
const W = 1080, H = 1920;
const r3 = (x) => Math.round(x * 1000) / 1000;
// Styl ruchu marki: jedna rodzina krzywych dla wszystkich szablonów i ozdób (rozpoznawalny ruch jak font).
// rolka.json -> "ruch" albo config.json -> ruch.styl. Szablony czytają zmienne --ruch-* (rola krzywej, nie nazwa).
//   we = wejście (pojawianie), wy = wyjście, ak = akcent (pop, uderzenie), pl = płynny ruch (przesunięcia, najazdy)
const STYLE_RUCHU = {
  klasyczny: { nazwa: "Klasyczny", we: "power2.out", wy: "power2.in", ak: "back.out(2)", pl: "power2.inOut" },
  miekki: { nazwa: "Miękki luksus", we: "expo.out", wy: "power3.in", ak: "back.out(1.3)", pl: "sine.inOut" },
  elegancki: { nazwa: "Elegancki, bez odbicia", we: "power4.out", wy: "power2.in", ak: "power3.out", pl: "power2.inOut" },
  sprezysty: { nazwa: "Sprężysty", we: "back.out(1.6)", wy: "back.in(1.3)", ak: "elastic.out(1, 0.5)", pl: "power3.inOut" },
  dynamiczny: { nazwa: "Dynamiczny", we: "expo.out", wy: "expo.in", ak: "back.out(2.4)", pl: "expo.inOut" },
};
const RUCH = STYLE_RUCHU[rolka.ruch] || STYLE_RUCHU[cfg.ruch?.styl] || STYLE_RUCHU.miekki;
const naKlatke = (x) => Math.round(x * FPS) / FPS;

// --- ochrona ręcznych zmian ---
const STAN = path.join(KOMP, ".zloz.json");
const INDEX = path.join(KOMP, "index.html");
const hash = (p) => (fs.existsSync(p) ? crypto.createHash("sha1").update(fs.readFileSync(p)).digest("hex") : null);
if (fs.existsSync(INDEX) && fs.existsSync(STAN) && !force) {
  const st = JSON.parse(fs.readFileSync(STAN, "utf8"));
  if (st.indexHash && st.indexHash !== hash(INDEX)) {
    blad("kompozycja/index.html zmieniono ręcznie (np. w Studio) po ostatnim złożeniu.",
      "Przenieś zmiany do rolka.json albo uruchom ponownie z --force (nadpisze ręczne zmiany).");
  }
}

// --- pliki projektu HyperFrames (raz) ---
fs.mkdirSync(path.join(KOMP, "compositions"), { recursive: true });
for (const f of ["hyperframes.json", "package.json"]) {
  const dst = path.join(KOMP, f);
  if (!fs.existsSync(dst)) fs.copyFileSync(path.join(SZABLONY_HF, f), dst);
}
const meta = path.join(KOMP, "meta.json");
if (!fs.existsSync(meta)) fs.writeFileSync(meta, JSON.stringify({ id: path.basename(proj), name: path.basename(proj) }, null, 2));
// compositions/ należy do zloz: czyścimy stare instancje scen
for (const f of fs.readdirSync(path.join(KOMP, "compositions"))) {
  if (f.endsWith(".html")) fs.rmSync(path.join(KOMP, "compositions", f));
}

// --- media: link z projektu do kompozycja/assets/<ścieżka względna> ---
function asset(rel) {
  if (!rel) return null;
  if (/^assets\//.test(rel) && fs.existsSync(path.join(KOMP, rel))) return rel;
  const src = path.isAbsolute(rel) ? rel : path.join(proj, rel);
  if (!fs.existsSync(src)) blad(`Brak pliku: ${rel}`, "Sprawdź ścieżkę w rolka.json (ścieżki są względem folderu rolki, np. proxy/IMG_0001.mp4).");
  const relOut = path.isAbsolute(rel) ? path.join("ext", path.basename(rel)) : rel;
  const dst = path.join(KOMP, "assets", relOut);
  podlinkuj(src, dst);
  return "assets/" + relOut.split(path.sep).join("/");
}
// placeholdery szablonów zawsze dostępne
const demoDir = path.join(SZABLONY_HF, "assets", "demo");
if (fs.existsSync(demoDir)) for (const f of fs.readdirSync(demoDir)) podlinkuj(path.join(demoDir, f), path.join(KOMP, "assets", "demo", f));

// --- brand ---
const k = cfg.kolory || {};
const f = cfg.fonty || {};
const sz = cfg.safe_zone || {};
let fontFace = "";
for (const [klucz, rola] of [["plik_naglowki", "naglowki"], ["plik_tekst", "tekst"]]) {
  if (f[klucz]) {
    const src = path.join(BRAND, "fonty", f[klucz]);
    if (!fs.existsSync(src)) blad(`Brak fontu 02_BRAND/fonty/${f[klucz]}`, "Wrzuć plik albo ustaw null w config.json -> fonty.");
    podlinkuj(src, path.join(KOMP, "assets", "fonts", f[klucz]));
    fontFace += `@font-face{font-family:"${f[rola]}";src:url("assets/fonts/${f[klucz]}");font-display:block}\n`;
  }
}
const handle = czyTodo(cfg.gabinet?.instagram) ? "@twoj_gabinet" : (cfg.gabinet.instagram.startsWith("@") ? cfg.gabinet.instagram : "@" + cfg.gabinet.instagram);
if (czyTodo(cfg.gabinet?.instagram)) uwaga("config.json: gabinet.instagram = TODO, wstawiam @twoj_gabinet.");
const nazwaGab = czyTodo(cfg.gabinet?.nazwa) ? "Twój Gabinet" : cfg.gabinet.nazwa;
const skin = (() => { try { return JSON.parse(fs.readFileSync(path.join(BRAND, "caption-skin.json"), "utf8")).domyslny; } catch { return null; } })();

// --- ujęcia (ścieżka A-roll) ---
const PRZEJSCIA = ["ciecie", "przenikanie", "zoom", "przyciemnienie", "swiatlo", "flash", "swipe", "swipe_gora", "whip", "fala", "ostrosc", "przez_postac"];
// Przejścia z zakładką: następne ujęcie wchodzi wcześniej o tyle sekund (oba widać naraz).
const ZAKLADKA = { przenikanie: 0.3, fala: 0.45, ostrosc: 0.4, przez_postac: 0.6 };
// Przejście przez postać potrzebuje wycięcia tego ujęcia (npm run wytnij-tlo): wyciete/<klip>.webm.
// Wersje _kolor/_hd/_stab mają ten sam czas co oryginał, więc pasuje też wycięcie oryginału.
function wyciecieDla(src) {
  if (!src || !ROZSZ_WIDEO.test(src)) return null;
  const n = path.parse(src).name;
  for (const k of [n, n.replace(/(_kolor|_hd|_stab)+$/, "")]) {
    const rel = `wyciete/${k}.webm`;
    if (fs.existsSync(path.join(proj, rel))) return rel;
  }
  return null;
}
// Mikro-cięcia: ujęcie z "segmenty": [[od, do], ...] (np. kwestia bez "yyy" i pauz z dopasuj-kwestie) rozkłada się
// na kilka ujęć z tego samego pliku. Skok maskuje zmiana kadru (100% / 108%), jak montaż z dwóch kamer.
const ujecia = [];
(rolka.ujecia || []).forEach((u, g) => {
  const seg = Array.isArray(u.segmenty) ? u.segmenty.filter((x) => Array.isArray(x) && Number(x[1]) > Number(x[0])) : [];
  if (seg.length < 2 || !u.src) { ujecia.push({ ...u, grupa: g }); return; }
  seg.forEach(([a, b], k) => ujecia.push({ ...u, od: Number(a), do: Number(b), segmenty: undefined, przejscie_po: k === seg.length - 1 ? u.przejscie_po : "ciecie", skala: u.skala ?? (k % 2 ? 1.08 : 1), przebitki: k === 0 ? u.przebitki : undefined, sledzenie: k === 0 ? u.sledzenie : undefined, obiekty: k === 0 ? u.obiekty : undefined, zoom_na: k === 0 ? u.zoom_na : undefined, stopklatka: k === seg.length - 1 ? u.stopklatka : undefined, grupa: g }));
});
// Stopklatka: "stopklatka": { "czas": 0.8 } -> po ujęciu wideo jego ostatnia klatka stoi (z lekkim najazdem),
// np. tuż przed odsłonięciem efektu. Klatkę wyciągamy do kompozycja/stopklatki/.
for (let i = ujecia.length - 1; i >= 0; i--) {
  const u = ujecia[i];
  if (!u.stopklatka || !u.src || !ROZSZ_WIDEO.test(u.src)) continue;
  const pelne = path.isAbsolute(u.src) ? u.src : path.join(proj, u.src);
  const tKl = Math.max(0, Number(u.do ?? ffprobe(pelne).duration) - 0.05);
  const rel = `kompozycja/stopklatki/${path.parse(u.src).name}_${tKl.toFixed(2)}.jpg`;
  const dst = path.join(proj, rel);
  if (!fs.existsSync(dst)) {
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    const r = uruchom("ffmpeg", ["-v", "error", "-y", "-ss", String(tKl), "-i", pelne, "-frames:v", "1", "-q:v", "2", dst], { cicho: true });
    if (r.code !== 0) { uwaga(`Stopklatka ${u.src}: nie udało się wyciągnąć klatki.`); continue; }
  }
  ujecia.splice(i + 1, 0, { src: rel, czas: Math.min(3, Math.max(0.3, Number(u.stopklatka.czas) || 0.8)), przejscie_po: u.przejscie_po, grupa: u.grupa, kadr: u.kadr, stopklatkaZ: true });
  u.przejscie_po = "ciecie";
}
if (!ujecia.length && !(rolka.sceny || []).length) blad("rolka.json nie ma ani ujęć, ani scen.", "Dodaj ujęcia z proxy/ albo sceny z szablonów.");
let t = 0;
const uj = [];
ujecia.forEach((u, i) => {
  // Tempo (przyspieszenie zabiegu): 2 = dwa razy szybciej. Przyspieszone ujęcie jest zawsze bez dźwięku.
  const tempoU = Math.min(8, Math.max(0.25, Number(u.tempo) || 1));
  const prev = uj[i - 1];
  const zakladka = prev && ZAKLADKA[prev.przejscie] ? Math.min(ZAKLADKA[prev.przejscie], prev.dur * 0.5) : 0;
  let czas, src = null, typ;
  if (u.src) {
    src = asset(u.src);
    const pelne = path.isAbsolute(u.src) ? u.src : path.join(proj, u.src);
    if (ROZSZ_OBRAZ.test(u.src)) { typ = "obraz"; czas = Number(u.czas || 2); }
    else if (ROZSZ_WIDEO.test(u.src)) {
      typ = "wideo";
      const info0 = ffprobe(pelne);
      const od = Number(u.od || 0);
      const doo = u.do != null ? Math.min(Number(u.do), info0.duration) : info0.duration;
      if (doo <= od) blad(`Ujęcie ${i + 1}: "do" (${doo}) musi być większe niż "od" (${od}).`, "Popraw czasy w rolka.json.");
      czas = (doo - od) / tempoU;
      if (info0.width !== W || info0.height !== H) uwaga(`Ujęcie ${i + 1} (${u.src}) ma ${info0.width}x${info0.height}. Użyj klipu z proxy/ (npm run normalizuj).`);
    } else blad(`Ujęcie ${i + 1}: nieznany typ pliku ${u.src}`, "Obsługiwane: wideo (mp4, mov, webm) i zdjęcia (jpg, png).");
  } else { typ = "kolor"; czas = Number(u.czas || 2); }
  let przejscie = PRZEJSCIA.includes(u.przejscie_po) ? u.przejscie_po : "ciecie";
  const wyciecie = przejscie === "przez_postac" ? wyciecieDla(u.src) : null;
  if (przejscie === "przez_postac" && !wyciecie) {
    uwaga(`Ujęcie ${i + 1}: przejście „przez postać” wymaga wycięcia (npm run wytnij-tlo -- <projekt> ${u.src || "<klip>"}). Daję „ostrość”.`);
    przejscie = "ostrosc";
  }
  if (u.przejscie_po && !PRZEJSCIA.includes(u.przejscie_po)) uwaga(`Ujęcie ${i + 1}: nieznane przejście "${u.przejscie_po}". Dostępne: ${PRZEJSCIA.join(", ")}. Daję cięcie.`);
  const start = naKlatke(Math.max(0, t - zakladka));
  const dur = naKlatke(czas);
  if (tempoU !== 1 && u.dzwiek) uwaga(`Ujęcie ${i + 1}: przyspieszone (tempo ${tempoU}), więc bez dźwięku.`);
  uj.push({ i: i + 1, typ, src, start, dur, end: r3(start + dur), od: Number(u.od || 0), tempo: tempoU, skala: Number(u.skala) || 1, grupa: u.grupa, przebitki: u.przebitki, sledzenie: u.sledzenie, obiekty: u.obiekty, zoom_na: u.zoom_na, kadr: u.kadr, przejscie, wyciecie: wyciecie ? asset(wyciecie) : null, kierunek: u.przejscie_kierunek, dzwiek: !!u.dzwiek && tempoU === 1, wczesniej: Math.max(0, Math.min(1, Number(u.dzwiek_wczesniej) || 0)), foley: Array.isArray(u.foley) ? u.foley : [], glosnosc: u.glosnosc ?? 1, kolor: u.kolor, etykieta: u.etykieta || "", zrodlo: u.src });
  t = start + dur;
});
const koniecUjec = uj.length ? uj[uj.length - 1].end : 0;

// --- mapa twarzy (scripts/twarz.py, cache kompozycja/twarz/) ---
// Kotwice zamiast pikseli: "kadr": { "twarz": "oczy" }, "zoom_na": { "twarz": "brwi" }, "sledzenie": [{ "twarz": "brew_lewa_luk" }]
// oraz ozdoby "proporcje" i "obrys". Mapa liczy się sama przy pierwszym złożeniu (kilka-kilkanaście sekund na klip).
const twarze = new Map();
function twarzUj(u) {
  if (!u.zrodlo) return null;
  if (!twarze.has(u.zrodlo)) {
    info(`Mapa twarzy: ${u.zrodlo} ...`);
    const d = mapaTwarzy(proj, u.zrodlo);
    if (d.blad) uwaga(`Ujęcie ${u.i}: mapa twarzy się nie udała (${d.blad}).`);
    else if (!d.pokrycie) uwaga(`Ujęcie ${u.i}: nie widzę twarzy w ${u.zrodlo}, ozdoby twarzy pomijam.`);
    twarze.set(u.zrodlo, d.blad || !d.pokrycie ? null : d);
  }
  return twarze.get(u.zrodlo);
}
const oknoKlipu = (u) => [u.od, u.od + (u.typ === "wideo" ? u.dur * u.tempo : u.dur)];
for (const u of uj) {
  if (u.kadr?.twarz) {
    const d = twarzUj(u), p = d && pozycjaKotwicy(d, u.kadr.twarz, ...oknoKlipu(u));
    if (p) u.kadr = { ...u.kadr, x: p.x, y: p.y }; else { uwaga(`Ujęcie ${u.i}: kadr na „${u.kadr.twarz}” pominięty (brak twarzy).`); u.kadr = null; }
  }
  if (u.zoom_na?.twarz) {
    const d = twarzUj(u), tk = u.od + Math.max(0, Number(u.zoom_na.start ?? 0.3)) * u.tempo;
    const p = d && pozycjaKotwicy(d, u.zoom_na.twarz, u.typ === "wideo" ? tk : 0);
    if (p) {
      // zoom wewnątrz stałego kadru: punkt nagrania -> punkt na ekranie
      const k = u.kadr, s = k ? Math.min(2.5, Math.max(1, Number(k.skala) || 1.3)) : 1;
      u.zoom_na = { ...u.zoom_na, x: k ? W / 2 + s * (p.x - k.x) : p.x, y: k ? H / 2 + s * (p.y - k.y) : p.y };
    } else { uwaga(`Ujęcie ${u.i}: zoom na „${u.zoom_na.twarz}” pominięty (brak twarzy).`); u.zoom_na = null; }
  }
}

// --- audio ---
const audio = [];
for (const [klucz, dom] of [["voiceover", 1], ["muzyka", 0.18]]) {
  const a = rolka[klucz];
  if (!a || !a.src) continue;
  const pelne = path.isAbsolute(a.src) ? a.src : path.join(proj, a.src);
  if (!fs.existsSync(pelne)) blad(`Brak pliku ${klucz}: ${a.src}`, "Sprawdź ścieżkę w rolka.json.");
  let src;
  if (ROZSZ_WIDEO.test(a.src)) {
    // Voiceover z klipu wideo (gadająca głowa): wyciągamy dźwięk, żeby mowa leciała też pod b-rollem.
    const rel = path.join("assets", "audio", path.parse(a.src).name + ".wav");
    const dst = path.join(KOMP, rel);
    if (!fs.existsSync(dst) || fs.statSync(dst).mtimeMs < fs.statSync(pelne).mtimeMs) {
      fs.mkdirSync(path.dirname(dst), { recursive: true });
      const r = uruchom("ffmpeg", ["-y", "-v", "error", "-i", pelne, "-vn", "-ac", "2", "-ar", "48000", "-c:a", "pcm_s16le", dst], { cicho: true });
      if (r.code !== 0) blad(`Nie udało się wyciągnąć dźwięku z ${a.src}.`, r.stderr.slice(-300));
    }
    src = rel.split(path.sep).join("/");
  } else src = asset(a.src);
  // Długość ze ścieżki audio (kontener wideo bywa dłuższy o kilka klatek).
  const d = ffprobe(path.join(KOMP, src)).duration;
  // "od": start w pliku (np. przycięta cisza przed pierwszym słowem lektora, scripts/kontrola-hooka.mjs --napraw)
  const odA = Math.max(0, Math.min(d - 0.5, Number(a.od) || 0));
  audio.push({ id: klucz === "voiceover" ? "vo" : "muzyka", src, zrodlo: a.src, start: Number(a.start || 0), od: odA, dur: r3(d - odA), vol: Number(a.glosnosc ?? dom), fadeOut: klucz === "muzyka" ? 0.8 : 0 });
}

// --- długość całości ---
const sceny = rolka.sceny || [];
let D = koniecUjec;
for (const s of sceny) D = Math.max(D, Number(s.start || 0) + Number(s.czas || 0));
for (const a of audio) if (a.id === "vo") D = Math.max(D, a.start + a.dur);
D = naKlatke(D);
for (const a of audio) if (a.id === "muzyka") a.dur = r3(Math.min(a.dur, D - a.start));

// --- instancje scen ---
const uzyte = {};
const hosty = [];
function instancja(szablon, czas, opts = {}) {
  const plik = path.join(SZABLONY_HF, "compositions", `${szablon}.html`);
  if (!fs.existsSync(plik)) {
    const dost = fs.readdirSync(path.join(SZABLONY_HF, "compositions")).filter((n) => n.endsWith(".html")).map((n) => n.replace(".html", ""));
    blad(`Nie ma szablonu "${szablon}".`, `Dostępne: ${dost.join(", ")}`);
  }
  uzyte[szablon] = (uzyte[szablon] || 0) + 1;
  const inst = uzyte[szablon] === 1 ? szablon : `${szablon}-${uzyte[szablon]}`;
  let html = fs.readFileSync(plik, "utf8");
  if (inst !== szablon) {
    html = html.split(`"${szablon}`).join(`"${inst}`).split(`#${szablon}-`).join(`#${inst}-`);
  }
  html = html.replace(/data-duration="[\d.]+"/g, `data-duration="${czas}"`).replace(/data-composition-duration="[\d.]+"/g, `data-composition-duration="${czas}"`);
  // media w slotach
  for (const [klucz, rel] of Object.entries(opts.media || {})) {
    const a = asset(rel);
    const re = new RegExp(`(<(?:img|video)[^>]*data-slot-media="${klucz}"[^>]*?)src="[^"]*"`, "g");
    if (!re.test(html)) uwaga(`Szablon ${szablon} nie ma slotu media "${klucz}".`);
    html = html.replace(re, `$1src="${a}"`);
  }
  if (opts.mediaOd) html = html.replace(/(<video[^>]*data-slot-media="[^"]*")/g, `$1 data-media-start="${opts.mediaOd}"`);
  if (opts.lottie) {
    const json = JSON.stringify(opts.lottie).replace(/<\//g, "<\\/");
    html = html.replace(/\/\*LOTTIE_START\*\/[\s\S]*?\/\*LOTTIE_END\*\//, () => `/*LOTTIE_START*/${json}/*LOTTIE_END*/`);
  }
  if (opts.slowa) html = html.replace(/\/\*SLOWA_START\*\/[\s\S]*?\/\*SLOWA_END\*\//, `/*SLOWA_START*/${JSON.stringify(opts.slowa)}/*SLOWA_END*/`);
  fs.writeFileSync(path.join(KOMP, "compositions", `${inst}.html`), html, "utf8");
  return inst;
}
function host(inst, start, czas, z, dane, kind = "graphics") {
  const vv = dane && Object.keys(dane).length ? ` data-variable-values='${JSON.stringify(dane).replace(/'/g, "&#39;")}'` : "";
  hosty.push(`      <div id="${inst}" data-composition-id="${inst}" data-composition-src="compositions/${inst}.html" data-start="${r3(start)}" data-duration="${r3(czas)}" data-track-index="${hosty.length + 10}" data-track-kind="${kind}" data-width="${W}" data-height="${H}" style="z-index:${z}"${vv}></div>`);
}

// Przed/po: "po" wyrównane do "przed" (scripts/przed_po.py: twarz z MediaPipe albo punkty ORB, obrót + skala +
// przesunięcie, oba zdjęcia przycięte do wspólnej części) i łagodnie dopasowane światłem (granice jak kolor.mjs).
// Scena: "wyrownaj": false wyłącza, "wyrownaj_swiatlo": false zostawia kolory. Cache: kompozycja/przed-po/.
// Zmienia media sceny na wyrównane pliki i zwraca wynik (z "krzywa" łuku brwi dla trybu "luk").
function wyrownajPrzedPo(s, media, i) {
  if (s.wyrownaj === false || !media.przed || !media.po) return null;
  if (![media.przed, media.po].every((m) => ROZSZ_OBRAZ.test(m))) return null;
  const pelna = (m) => (path.isAbsolute(m) ? m : path.join(proj, m));
  const [a, b] = [pelna(media.przed), pelna(media.po)];
  if (!fs.existsSync(a) || !fs.existsSync(b)) return null;
  const swiatlo = s.wyrownaj_swiatlo !== false;
  const klucz = crypto.createHash("md5").update(JSON.stringify([a, b, fs.statSync(a).mtimeMs, fs.statSync(b).mtimeMs, fs.statSync(a).size, fs.statSync(b).size, swiatlo, "v1"])).digest("hex").slice(0, 10);
  const dir = path.join(KOMP, "przed-po");
  const wa = path.join(dir, `${klucz}_przed.jpg`), wb = path.join(dir, `${klucz}_po.jpg`), wj = path.join(dir, `${klucz}.json`);
  let w = null;
  if (fs.existsSync(wj) && fs.existsSync(wa) && fs.existsSync(wb)) { try { w = JSON.parse(fs.readFileSync(wj, "utf8")); } catch {} }
  if (!w) {
    fs.mkdirSync(dir, { recursive: true });
    info(`Przed/po (scena ${i + 1}): wyrównuję zdjęcia ...`);
    const py = process.platform === "win32" ? "python" : "python3";
    const r = uruchom(py, [path.join(ROOT, "scripts", "przed_po.py"), a, b, wa, wb, wj, ...(swiatlo ? [] : ["--bez-koloru"])], { cicho: true, timeout: 5 * 60 * 1000 });
    if (r.code !== 0) { uwaga(`Przed/po: wyrównanie się nie udało (${(r.stderr || "").trim().split("\n").pop()}). Zostają oryginały.`); return null; }
    try { w = JSON.parse(fs.readFileSync(wj, "utf8")); } catch { return null; }
  }
  if (!w.wyrownane) uwaga(`Przed/po (scena ${i + 1}): nie da się wiarygodnie wyrównać zdjęć${w.odrzucone ? ` (${w.odrzucone})` : ""}. Zrób je w tym samym kadrze i odległości.`);
  else info(`  przed/po: wyrównane (${w.metoda === "twarz" ? "po twarzy" : "po punktach obrazu"}: skala ${w.skala}, obrót ${w.obrot}°${w.przyciecie ? ", przycięte do wspólnej części" : ""})`);
  // światło zmienione nawet przy braku wyrównania, więc i wtedy bierzemy pliki z wyniku
  media.przed = wa; media.po = wb;
  return w;
}
// Zdjęcie 2,5D (scena zdjecie-3d): mapa głębi z scripts/glebia.py (Depth Anything V2 Small, ONNX na CPU, kilka s).
// media.zdjecie = zdjęcie albo wideo (wtedy klatka z sekundy s.klatka). Cache kompozycja/glebia/<md5>/.
// Ustawia sloty: zdjecie (kadr 9:16), przod (postać z głębi), mapa_najazd, mapa_przesuw.
function glebiaZdjecia(s, media, i) {
  const zr = media.zdjecie;
  if (!zr) return uwaga(`Scena ${i + 1} (zdjecie-3d): wybierz zdjęcie.`);
  const a = path.isAbsolute(zr) ? zr : path.join(proj, zr);
  if (!fs.existsSync(a)) return;
  const t = Number(s.klatka) || 0;
  const klucz = crypto.createHash("md5").update(JSON.stringify([a, fs.statSync(a).mtimeMs, fs.statSync(a).size, t, "v1"])).digest("hex").slice(0, 10);
  const rel = `kompozycja/glebia/${klucz}`, dir = path.join(proj, rel);
  const pliki = { zdjecie: "kadr.jpg", przod: "przod.png", mapa_najazd: "mapa_najazd.png", mapa_przesuw: "mapa_przesuw.png" };
  if (!Object.values(pliki).every((p) => fs.existsSync(path.join(dir, p)))) {
    info(`Zdjęcie 3D (scena ${i + 1}): liczę głębię ...`);
    const py = process.platform === "win32" ? "python" : "python3";
    const r = uruchom(py, [path.join(ROOT, "scripts", "glebia.py"), a, dir, "--t", String(t)], { cicho: true, timeout: 5 * 60 * 1000 });
    if (r.code !== 0) return uwaga(`Zdjęcie 3D: głębia się nie udała (${(r.stderr || "").trim().split("\n").pop()}). Zostaje zwykły najazd.`);
  }
  for (const [slot, p] of Object.entries(pliki)) media[slot] = `${rel}/${p}`;
  return true;
}
const DOMYSLNE = {
  "cta-koncowe": () => ({ handle, przycisk: cfg.cta?.dodatkowe && !czyTodo(cfg.cta.dodatkowe) ? `Zapisy: ${cfg.cta.dodatkowe}` : undefined }),
  "ig-obserwuj": () => ({ handle, nazwa: nazwaGab }),
  "lower-third": () => ({ nazwa: czyTodo(cfg.gabinet?.osoba) ? nazwaGab : cfg.gabinet.osoba }),
};
sceny.forEach((s, i) => {
  const start = naKlatke(Number(s.start || 0));
  const czas = naKlatke(Number(s.czas || 3));
  if (!s.szablon) blad(`Scena ${i + 1} nie ma pola "szablon".`, "Np. \"szablon\": \"hook-tytul\".");
  const media = { ...(s.media || {}) };
  if (s.szablon === "ig-obserwuj" && !media.avatar && LOGO) media.avatar = LOGO;
  if (s.szablon === "cta-koncowe" && s.dane?.pokaz_logo && !media.logo && LOGO) media.logo = LOGO;
  // Lottie: plik z folderu rolki albo z 03_BIBLIOTEKA/lottie/ (ścieżka względem katalogu głównego), wklejany do sceny
  let lottie = null;
  if (s.szablon === "animacja-lottie" && s.dane?.plik) {
    const kand = [path.join(proj, s.dane.plik), path.join(ROOT, s.dane.plik), path.join(ROOT, "03_BIBLIOTEKA", "lottie", path.basename(s.dane.plik))];
    const plik = kand.find((p) => fs.existsSync(p));
    if (!plik) blad(`Nie ma pliku Lottie: ${s.dane.plik}`, "Wgraj go w panelu (scena „Animacja Lottie”) albo wrzuć do 03_BIBLIOTEKA/lottie/.");
    try { lottie = JSON.parse(fs.readFileSync(plik, "utf8").replace(/^﻿/, "")); } catch (e) { blad(`${s.dane.plik} to nie jest poprawny JSON Lottie: ${e.message}`, "Pobierz z LottieFiles wersję „Lottie JSON”."); }
    if (!lottie.layers || !lottie.fr) blad(`${s.dane.plik} nie wygląda na animację Lottie (brak layers/fr).`);
  }
  const pp = s.szablon === "przed-po" ? wyrownajPrzedPo(s, media, i) : null;
  const glebiaOk = s.szablon === "zdjecie-3d" ? glebiaZdjecia(s, media, i) : false;
  const inst = instancja(s.szablon, czas, { media, mediaOd: s.media_od, lottie });
  const dane = { ...(DOMYSLNE[s.szablon]?.() || {}), ...(s.dane || {}) };
  if (glebiaOk) dane.glebia = true;
  if (s.szablon === "przed-po" && dane.tryb === "luk") {
    if (pp?.krzywa?.length >= 3) dane.krzywa = JSON.stringify(pp.krzywa);
    else uwaga(`Scena ${i + 1} (przed-po): kurtyna „po łuku brwi” potrzebuje twarzy na zdjęciu „przed”. Daję zwykły suwak.`);
  }
  for (const kk of Object.keys(dane)) if (dane[kk] === undefined) delete dane[kk];
  if (s.szablon === "cta-koncowe" && dane.pokaz_logo && !media.logo) {
    uwaga(`cta-koncowe: pokaz_logo, ale stylistyka „${cfg.styl.nazwa}” nie ma logo, zostaje ikona.`);
    dane.pokaz_logo = false;
  }
  // Sceny nad ujęciami (z 1..n), pętlą, zajawką i przebitkami (n+1..n+3), także przy >16 ujęciach (segmenty), pod napisami (50).
  host(inst, start, czas, Math.max(20, uj.length + 4) + i, dane);
});

// --- napisy ---
const np = rolka.napisy || {};
let liczbaSlow = 0;
// "od"/"do": napisy tylko w tym oknie rolki (np. po hooku, który jest pierwszym zdaniem mowy, i przed kartą CTA, która powtarza to samo).
const NAP_OD = Number(np.od) > 0 ? Number(np.od) : 0;
const NAP_DO = Number(np.do) > 0 ? Number(np.do) : Infinity;
const wOknie = (w) => w.start >= NAP_OD - 0.05 && w.start < NAP_DO;
let slowaRolki = []; // słowa w czasie rolki (dla zbliżeń na akcentach)
let slowaPelne = []; // wszystkie słowa w czasie rolki, także poza oknem napisów (kontrola hooka: scripts/kontrola-hooka.mjs)
// Napisy z kilku plików (dopasuj-kwestie): napisy.zrodla = { "proxy/M1_x.mp4": "napisy/slowa/M1_x.json" }.
// Każde ujęcie z takiego pliku dostaje słowa ze swojego fragmentu (od-do).
const zrodlaNapisow = np.zrodla && typeof np.zrodla === "object" ? Object.entries(np.zrodla).filter(([, j]) => fs.existsSync(path.join(proj, j))) : [];
if (np.wlacz !== false && zrodlaNapisow.length) {
  const slowaZ = Object.fromEntries(zrodlaNapisow.map(([src, j]) => {
    let s = JSON.parse(fs.readFileSync(path.join(proj, j), "utf8"));
    if (!Array.isArray(s)) s = s.words || [];
    return [src, s.map((w) => ({ text: String(w.text ?? w.word ?? "").trim(), start: Number(w.start), end: Number(w.end) })).filter((w) => w.text && isFinite(w.start))];
  }));
  const przes = Number(np.przesuniecie || 0);
  const slowa = [];
  for (const u of uj) {
    const s = slowaZ[u.zrodlo];
    if (!s || u.typ !== "wideo") continue;
    for (const w of s) if (w.start >= u.od - 0.02 && w.start < u.od + u.dur - 0.05) slowa.push({ text: w.text, start: r3(u.start + (w.start - u.od) + przes), end: r3(Math.min(u.end, u.start + (w.end - u.od)) + przes), zr: u.zrodlo, t0: w.start, t1: w.end });
  }
  slowa.sort((a, b) => a.start - b.start);
  slowaPelne = slowa.slice();
  if (NAP_OD > 0 || NAP_DO < Infinity) slowa.splice(0, slowa.length, ...slowa.filter(wOknie).map((w) => ({ ...w, end: Math.min(w.end, NAP_DO) })));
  liczbaSlow = slowa.length;
  slowaRolki = slowa;
  if (!slowa.length) uwaga("Napisy z kilku plików: żadne ujęcie nie używa nagrań z napisy.zrodla (proxy/M1_*.mp4).");
  napisyZNaciskiem(slowa);
} else if (np.wlacz !== false && np.plik) {
  const p = path.join(proj, np.plik);
  if (!fs.existsSync(p)) blad(`Brak pliku napisów ${np.plik}.`, "Uruchom: npm run transkrybuj -- <projekt> <plik>, albo wyłącz napisy (\"wlacz\": false).");
  let slowa = JSON.parse(fs.readFileSync(p, "utf8"));
  if (!Array.isArray(slowa)) slowa = slowa.words || slowa.segments?.flatMap((s) => s.words || []) || [];
  slowa = slowa.map((w) => ({ text: String(w.text ?? w.word ?? "").trim(), start: Number(w.start), end: Number(w.end) })).filter((w) => w.text && isFinite(w.start));
  // Mapowanie czasu: napisy z pliku "zrodlo" (klip z mową) przez ujęcia, które go używają.
  const zr = np.zrodlo;
  const vo = audio.find((a) => a.id === "vo");
  let mapuj;
  if (vo && (!zr || vo.zrodlo === zr)) {
    mapuj = (x) => (x < vo.od - 0.02 ? null : vo.start + x - vo.od);
  } else if (zr && uj.some((u) => u.zrodlo === zr)) {
    const segs = uj.filter((u) => u.zrodlo === zr);
    mapuj = (x) => { for (const u of segs) if (x >= u.od - 0.02 && x < u.od + u.dur) return u.start + (x - u.od); return null; };
  } else if (vo) mapuj = (x) => (x < vo.od - 0.02 ? null : vo.start + x - vo.od);
  else mapuj = (x) => x;
  const przes = Number(np.przesuniecie || 0);
  const zrAudio = vo && (!zr || vo.zrodlo === zr || !uj.some((u) => u.zrodlo === zr)) ? vo.zrodlo : zr || null;
  slowa = slowa.map((w) => { const s0 = mapuj(w.start); return s0 == null ? null : { text: w.text, start: r3(s0 + przes), end: r3(s0 + przes + (w.end - w.start)), zr: zrAudio, t0: w.start, t1: w.end }; }).filter(Boolean);
  slowaPelne = slowa.filter((w) => w.start < D);
  slowa = slowa.filter((w) => w.start < D && wOknie(w)).map((w) => ({ ...w, end: Math.min(w.end, NAP_DO) }));
  liczbaSlow = slowa.length;
  slowaRolki = slowa;
  napisyZNaciskiem(slowa);
}

// Napisy reagują na głos: słowa powiedziane z naciskiem (głośniej, wyżej, przeciągnięte) dostają uderzenie
// i kolor akcentu, ściszone są mniejsze (scripts/nacisk-glosu.mjs). Wyłącza "napisy": { "nacisk": false }.
function napisyZNaciskiem(slowa) {
  let st = null;
  if (np.nacisk !== false && slowa.length) {
    try { st = naciskGlosu(proj, slowa); } catch (e) { uwaga(`Nacisk w głosie: pomiar się nie udał (${e.message}).`); }
    if (st?.zmierzone) info(`  nacisk w głosie: ${st.mocne} mocnych akcentów, ${st.lekkie} lekkich, ${st.ciche} ściszonych (z ${st.zmierzone} słów)`);
  }
  const inst = instancja("napisy", D, { slowa: slowa.map((w) => ({ text: w.text, start: w.start, end: w.end, ...(w.n ? { n: w.n } : {}) })) });
  host(inst, 0, D, 50, {
    styl: np.styl || cfg.styl.napisy || skin || cfg.napisy?.styl_domyslny || "perla",
    wyroznij: (np.wyroznij || []).join(","),
    slow_w_grupie: np.slow_w_grupie || cfg.napisy?.slow_w_grupie || 4,
    emoji: !!ef.emoji,
    nacisk: np.nacisk !== false && !!st?.zmierzone,
  }, "captions");
}
// --- watermark ---
if (rolka.watermark !== false) {
  const png = ZNAK;
  const ma = !!png;
  const inst = instancja("watermark", D, { media: ma ? { znak: png } : {} });
  // Bez handle w config.json znak pokazuje nazwę gabinetu (lepsze niż @twoj_gabinet).
  host(inst, 0, D, 60, { tryb: ma ? "obraz" : "tekst", handle: czyTodo(cfg.gabinet?.instagram) && !czyTodo(cfg.gabinet?.nazwa) ? nazwaGab : handle });
}

// --- przejścia: nakładki z katalogu i ruch GSAP na wrapperach ---
// Ruch (x, y, scale) idzie na #uN-w, filtry (rozmycie, fala, maska) na wewnętrzny #uN-fx, bo rozmycie ruchu
// HyperFrames kładzie własny filtr na poruszanym elemencie.
const tweens = [];
const svgFiltry = [];
// Kierunek ruchu w końcówce klipu (przesunięcie obrazu klatka do klatki na miniaturach 48x84).
// Whip leci w tę stronę, w którą rusza się ręka / kamera, więc cięcie wygląda jak jeden ruch.
const RUCH_PLIK = path.join(KOMP, ".ruch.json");
const ruchCache = (() => { try { return JSON.parse(fs.readFileSync(RUCH_PLIK, "utf8")); } catch { return {}; } })();
function kierunekRuchu(u) {
  if (u.typ !== "wideo" || !u.zrodlo) return "lewo";
  const pelne = path.isAbsolute(u.zrodlo) ? u.zrodlo : path.join(proj, u.zrodlo);
  const tDo = u.od + u.dur * u.tempo, tOd = Math.max(u.od, tDo - 0.5);
  const klucz = `${u.zrodlo}|${tOd.toFixed(2)}|${tDo.toFixed(2)}`;
  if (ruchCache[klucz]) return ruchCache[klucz];
  const MW = 48, MH = 84, M = 5;
  const r = uruchom("ffmpeg", ["-v", "error", "-ss", String(tOd), "-t", String(Math.max(0.15, tDo - tOd)), "-i", pelne, "-vf", `fps=15,scale=${MW}:${MH},format=gray`, "-f", "rawvideo", "-"], { cicho: true, kodowanie: "buffer" });
  const n = Math.floor(r.stdout.length / (MW * MH));
  let sx = 0, sy = 0;
  for (let k = 1; k < n; k++) {
    const a = r.stdout.subarray((k - 1) * MW * MH, k * MW * MH), b = r.stdout.subarray(k * MW * MH, (k + 1) * MW * MH);
    let best = Infinity, bx = 0, by = 0;
    for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
      let sad = 0;
      for (let y = M; y < MH - M; y++) for (let x = M; x < MW - M; x++) sad += Math.abs(b[y * MW + x] - a[(y - dy) * MW + (x - dx)]);
      if (sad < best) { best = sad; bx = dx; by = dy; }
    }
    sx += bx; sy += by;
  }
  const kier = Math.max(Math.abs(sx), Math.abs(sy)) < 2 ? "lewo" : Math.abs(sx) >= Math.abs(sy) ? (sx < 0 ? "lewo" : "prawo") : (sy < 0 ? "gora" : "dol");
  ruchCache[klucz] = kier;
  return kier;
}
uj.forEach((u, i) => {
  const next = uj[i + 1];
  if (!next) return;
  const cut = next.start;
  if (u.przejscie === "swiatlo") { const c = 1.6; const inst = instancja("przejscie-swiatlo", c); host(inst, Math.max(0, cut - 0.3 * c), c, 70); }
  if (u.przejscie === "flash") { const c = 1.0; const inst = instancja("przejscie-flash", c); host(inst, Math.max(0, cut - 0.58 * c), c, 70); }
  if (u.przejscie === "przenikanie") tweens.push(`tl.fromTo("#u${next.i}-w", { opacity: 0 }, { opacity: 1, duration: 0.3, ease: "none" }, ${r3(cut)});`);
  if (u.przejscie === "zoom") {
    tweens.push(`tl.fromTo("#u${u.i}-w", { scale: 1 }, { scale: 1.14, duration: 0.25, ease: "power2.in", immediateRender: false }, ${r3(cut - 0.25)});`);
    tweens.push(`tl.fromTo("#u${next.i}-w", { scale: 1.14 }, { scale: 1, duration: 0.35, ease: "power3.out" }, ${r3(cut)});`);
  }
  // Swipe (whip pan): stary kadr ucieka w bok z rozmyciem ruchu, nowy wjeżdża z drugiej strony. Skala 1.2 zakrywa krawędzie.
  if (u.przejscie === "swipe" || u.przejscie === "swipe_gora") {
    const os = u.przejscie === "swipe" ? "x" : "y", o = u.przejscie === "swipe" ? 110 : 190;
    tweens.push(`tl.fromTo("#u${u.i}-w", { ${os}: 0, scale: 1 }, { ${os}: -${o}, scale: 1.2, duration: 0.14, ease: "power2.in", immediateRender: false }, ${r3(cut - 0.14)});`);
    tweens.push(`tl.fromTo("#u${u.i}-fx", { filter: "blur(0px)" }, { filter: "blur(16px)", duration: 0.14, ease: "power2.in", immediateRender: false }, ${r3(cut - 0.14)});`);
    tweens.push(`tl.fromTo("#u${next.i}-w", { ${os}: ${o}, scale: 1.2 }, { ${os}: 0, scale: 1, duration: 0.24, ease: "power3.out" }, ${r3(cut)});`);
    tweens.push(`tl.fromTo("#u${next.i}-fx", { filter: "blur(16px)" }, { filter: "blur(0px)", duration: 0.24, ease: "power3.out" }, ${r3(cut)});`);
  }
  // Whip: szybki rzut kamerą w stronę ruchu z klipu. Kadr powiększony do 1.7, żeby przesunięcie nie odsłoniło krawędzi,
  // smuga tylko wzdłuż ruchu (SVG feGaussianBlur "x 0") plus prawdziwe rozmycie migawki HyperFrames.
  if (u.przejscie === "whip") {
    const kier = ["lewo", "prawo", "gora", "dol"].includes(u.kierunek) ? u.kierunek : kierunekRuchu(u);
    u.kierunekUzyty = kier;
    const poz = kier === "lewo" || kier === "prawo", os = poz ? "x" : "y", zn = kier === "lewo" || kier === "gora" ? -1 : 1, o = poz ? 200 : 360;
    const id = `fxw${u.i}`, sd = (v) => (poz ? `${v} 0` : `0 ${v}`);
    for (const k of ["a", "b"]) svgFiltry.push(`<filter id="${id}${k}" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB"><feGaussianBlur id="${id}${k}-g" stdDeviation="${sd(0)}" edgeMode="duplicate"/></filter>`);
    const t0 = r3(cut - 0.1);
    tweens.push(`tl.set("#u${u.i}-fx", { filter: "url(#${id}a)" }, ${t0});`);
    tweens.push(`tl.fromTo("#${id}a-g", { attr: { stdDeviation: "${sd(0)}" } }, { attr: { stdDeviation: "${sd(60)}" }, duration: 0.1, ease: "power3.in", immediateRender: false }, ${t0});`);
    tweens.push(`tl.fromTo("#u${u.i}-w", { ${os}: 0, scale: 1 }, { ${os}: ${zn * o}, scale: 1.7, duration: 0.1, ease: "power3.in", immediateRender: false }, ${t0});`);
    tweens.push(`tl.set("#u${next.i}-fx", { filter: "url(#${id}b)" }, ${r3(cut)});`);
    tweens.push(`tl.fromTo("#${id}b-g", { attr: { stdDeviation: "${sd(60)}" } }, { attr: { stdDeviation: "${sd(0)}" }, duration: 0.2, ease: "expo.out", immediateRender: false }, ${r3(cut)});`);
    tweens.push(`tl.fromTo("#u${next.i}-w", { ${os}: ${-zn * o}, scale: 1.7 }, { ${os}: 0, scale: 1, duration: 0.22, ease: "expo.out" }, ${r3(cut)});`);
    tweens.push(`tl.set("#u${next.i}-fx", { filter: "none" }, ${r3(cut + 0.24)});`);
  }
  // Fala: stary kadr faluje jak przez wodę (feTurbulence + feDisplacementMap) i rozpuszcza się w nowym, który się uspokaja.
  if (u.przejscie === "fala") {
    const Z = r3(u.end - cut), id = `fxf${u.i}`;
    for (const k of ["a", "b"]) svgFiltry.push(`<filter id="${id}${k}" x="-10%" y="-10%" width="120%" height="120%" color-interpolation-filters="sRGB"><feTurbulence type="fractalNoise" baseFrequency="0.007 0.016" numOctaves="2" seed="${u.i * 7 + (k === "a" ? 1 : 2)}" result="t"/><feDisplacementMap id="${id}${k}-d" in="SourceGraphic" in2="t" scale="0" xChannelSelector="R" yChannelSelector="G"/></filter>`);
    tweens.push(`tl.set("#u${u.i}-fx", { filter: "url(#${id}a)" }, ${r3(cut - 0.15)});`);
    tweens.push(`tl.fromTo("#${id}a-d", { attr: { scale: 0 } }, { attr: { scale: 150 }, duration: ${r3(Z + 0.15)}, ease: "power2.in", immediateRender: false }, ${r3(cut - 0.15)});`);
    tweens.push(`tl.fromTo("#u${u.i}-w", { scale: 1 }, { scale: 1.08, duration: ${r3(Z + 0.15)}, ease: "power1.in", immediateRender: false }, ${r3(cut - 0.15)});`);
    tweens.push(`tl.fromTo("#u${next.i}-w", { opacity: 0, scale: 1.08 }, { opacity: 1, scale: 1, duration: ${r3(Z + 0.25)}, ease: "power2.out" }, ${r3(cut)});`);
    tweens.push(`tl.set("#u${next.i}-fx", { filter: "url(#${id}b)" }, ${r3(cut)});`);
    tweens.push(`tl.fromTo("#${id}b-d", { attr: { scale: 150 } }, { attr: { scale: 0 }, duration: ${r3(Z + 0.3)}, ease: "power2.out", immediateRender: false }, ${r3(cut)});`);
    tweens.push(`tl.set("#u${next.i}-fx", { filter: "none" }, ${r3(cut + Z + 0.32)});`);
  }
  // Ostrość: przeostrzenie jak w obiektywie. Stary kadr miękko traci ostrość, nowy z niej wychodzi.
  if (u.przejscie === "ostrosc") {
    const Z = r3(u.end - cut);
    tweens.push(`tl.fromTo("#u${u.i}-fx", { filter: "blur(0px) brightness(1)" }, { filter: "blur(22px) brightness(1.06)", duration: ${r3(Z + 0.1)}, ease: "power1.in", immediateRender: false }, ${r3(cut - 0.1)});`);
    tweens.push(`tl.fromTo("#u${u.i}-w", { scale: 1 }, { scale: 1.05, duration: ${r3(Z + 0.1)}, ease: "none", immediateRender: false }, ${r3(cut - 0.1)});`);
    tweens.push(`tl.fromTo("#u${next.i}-w", { opacity: 0, scale: 1.05 }, { opacity: 1, scale: 1, duration: ${r3(Z + 0.3)}, ease: "power2.out" }, ${r3(cut)});`);
    tweens.push(`tl.fromTo("#u${next.i}-fx", { filter: "blur(22px) brightness(1.06)" }, { filter: "blur(0px) brightness(1)", duration: ${r3(Z + 0.35)}, ease: "power2.out" }, ${r3(cut)});`);
  }
  // Przez postać: tło za osobą zamyka się do środka i odsłania nowe ujęcie, osoba (wycięcie) zostaje na chwilę na nowym tle
  // i rozpływa się. Stare ujęcie idzie nad inne ujęcia (pod napisy i sceny) na czas przejścia, wycięcie jest w jego wrapperze (te same zoomy i kadr).
  if (u.przejscie === "przez_postac" && u.wyciecie) {
    const Z = r3(u.end - cut), zam = r3(Z * 0.7);
    tweens.push(`tl.set("#u${u.i}-w", { zIndex: ${uj.length + 1} }, ${r3(cut)});`);
    tweens.push(`tl.fromTo("#u${u.i}-fx", { clipPath: "circle(120% at 50% 45%)" }, { clipPath: "circle(0% at 50% 45%)", duration: ${zam}, ease: "power1.inOut", immediateRender: false }, ${r3(cut)});`);
    tweens.push(`tl.fromTo("#u${u.i}-pp", { opacity: 1, filter: "blur(0px)" }, { opacity: 0, filter: "blur(10px)", duration: ${r3(Z - zam + 0.04)}, ease: "power1.in", immediateRender: false }, ${r3(cut + zam - 0.04)});`);
  }
  if (u.przejscie === "przyciemnienie") tweens.push(`tl.fromTo("#u${u.i}-w", { opacity: 1 }, { opacity: 0.6, duration: ${r3(3 / FPS)}, ease: "none" }, ${r3(cut - 3 / FPS)});`);
});
try { fs.writeFileSync(RUCH_PLIK, JSON.stringify(ruchCache, null, 1)); } catch {}
uj.filter((u) => u.typ === "obraz").forEach((u) => tweens.push(`tl.fromTo("#u${u.i}-w", { scale: 1.0 }, { scale: 1.06, duration: ${u.dur}, ease: "none" }, ${u.start});`));

const zmianyPrzebitek = [];
// Skala kadru ujęcia (mikro-cięcia: co drugi segment bliżej).
uj.filter((u) => u.skala !== 1).forEach((u) => tweens.push(`tl.set("#u${u.i}-w", { scale: ${u.skala} }, ${u.start});`));
// Przebitki nad głosem (L-cut): głos z ujęcia leci dalej, a obraz na chwilę przechodzi na zbliżenie zabiegu.
// "przebitki": [{ "src": "proxy/M3_x.mp4", "od": 0, "start": 0.8, "czas": 1.5, "tempo": 1 }], start względem początku ujęcia.
// "przejscie": "przenikanie" -> przebitka wchodzi miękko (0,25 s) na poprzednią przebitkę.
const przebitkiHtml = [];
let nPrz = 0;
const PB_FADE = 0.25;
const listaPb = [];
for (const g of [...new Set(uj.filter((u) => u.przebitki?.length).map((u) => u.grupa))]) {
  const grupaUj = uj.filter((u) => u.grupa === g);
  const g0 = grupaUj[0], gEnd = grupaUj[grupaUj.length - 1].end;
  for (const pb of g0.przebitki) {
    if (!pb?.src) continue;
    const st = naKlatke(g0.start + Number(pb.start || 0));
    const cz = naKlatke(Math.min(Number(pb.czas || 1.5), gEnd - st));
    if (cz <= 0.1) { uwaga(`Przebitka ${pb.src} wychodzi poza ujęcie, pomijam.`); continue; }
    listaPb.push({ pb, st, cz });
  }
}
listaPb.sort((a, b) => a.st - b.st);
// Przebitki jedna za drugą: domykamy dziury do 3 klatek (inaczej między nimi mignie ujęcie spod spodu),
// a przy przenikaniu poprzednia trwa jeszcze chwilę pod nową.
listaPb.forEach((p, k) => {
  const prev = listaPb[k - 1];
  if (!prev) return;
  const luka = p.st - (prev.st + prev.cz);
  if (luka > -0.001 && luka <= 3 / FPS + 0.001) prev.cz = r3(p.st - prev.st);
  if (p.pb.przejscie === "przenikanie" && Math.abs(p.st - (prev.st + prev.cz)) < 0.01) prev.cz = naKlatke(prev.cz + PB_FADE);
});
for (const { pb, st, cz } of listaPb) {
  {
    const src = asset(pb.src);
    nPrz++;
    if (pb.przejscie === "przenikanie") tweens.push(`tl.fromTo("#pb${nPrz}-w", { opacity: 0 }, { opacity: 1, duration: ${PB_FADE}, ease: "power1.inOut" }, ${st});`);
    const tp = Math.min(8, Math.max(0.25, Number(pb.tempo) || 1));
    const el = ROZSZ_WIDEO.test(pb.src)
      ? `<video id="pb${nPrz}" class="clip uj-media" src="${src}" data-start="${st}" data-duration="${cz}" data-media-start="${r3(Number(pb.od || 0))}"${tp !== 1 ? ` data-playback-rate="${tp}"` : ""} data-track-index="${100 + nPrz}" muted playsinline></video>`
      : `<img id="pb${nPrz}" class="clip uj-media" src="${src}" data-start="${st}" data-duration="${cz}" data-track-index="${100 + nPrz}" alt="" />`;
    przebitkiHtml.push(`<div id="pb${nPrz}-w" class="uj" style="z-index:${uj.length + 3}">
        ${el}
      </div>`);
    zmianyPrzebitek.push(st, r3(st + cz));
  }
}

// Zoom na punkt: "zoom_na": { "x": 540, "y": 800, "skala": 1.35, "start": 0.3, "czas": 0.5 } (piksele kadru 1080x1920,
// start względem początku ujęcia). Kadr płynnie wjeżdża na wskazany detal (brew, paznokieć) i zostaje.
uj.filter((u) => u.zoom_na && isFinite(Number(u.zoom_na.x)) && isFinite(Number(u.zoom_na.y))).forEach((u) => {
  const z = u.zoom_na, sk = Math.min(2.5, Math.max(1.05, Number(z.skala) || 1.35));
  const st = r3(u.start + Math.min(Math.max(0, Number(z.start ?? 0.3)), Math.max(0, u.dur - 0.3)));
  tweens.push(`tl.set("#u${u.i}-w", { transformOrigin: "${Math.round(z.x)}px ${Math.round(z.y)}px" }, ${u.start});`);
  tweens.push(`tl.fromTo("#u${u.i}-w", { scale: 1 }, { scale: ${sk}, duration: ${r3(Math.min(1.5, Math.max(0.2, Number(z.czas) || 0.5)))}, ease: "power2.inOut", immediateRender: false }, ${st});`);
  zmianyPrzebitek.push(st);
});
// Śledzenie: "sledzenie": [{ "plik": "kompozycja/sledzenie/s1.json" | "twarz": "brew_lewa_luk", "element": "kolko|punkt|strzalka|etykieta", "tekst": "...",
//   "start": s od początku ujęcia, "czas": s }] (plik z npm run sledz albo kotwica z mapy twarzy). Ozdoba jedzie za obiektem.
// Ozdoby twarzy: { "element": "proporcje", "strona": "obie|lewa|prawa", "etykiety": true } = klasyczne mapowanie brwi
// (linie od skrzydełka nosa przez kącik oka / tęczówkę do początku, łuku i końca brwi, rysowane po kolei),
// { "element": "obrys", "twarz": "brwi|brew_lewa|rzesy|rzesy_prawa" } = obrys brwi albo linii rzęs.
// Ozdoby siedzą w warstwie ujęcia (#uN-m), więc jadą razem z kadrem, zoomem, zbliżeniami i przejściami.
const ozdobyUj = {};
const obiektyCache = new Map(); // obiekty SAM 2 (kompozycja/obiekty/<id>.json), też dla śledzenia za obiektem
let nSl = 0, nTw = 0;
const ELEMENTY = {
  kolko: () => `<div class="sl-kolko"></div>`,
  punkt: () => `<div class="sl-punkt"></div>`,
  strzalka: (t) => `<div class="sl-strzalka">${t ? `<span>${t}</span>` : ""}<svg viewBox="0 0 60 90" width="60" height="90"><path d="M30 4 V70 M10 52 L30 78 L50 52" fill="none" stroke="currentColor" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/></svg></div>`,
  etykieta: (t) => `<div class="sl-punkt maly"></div><div class="sl-etykieta"><span>${t || "tu"}</span></div>`,
};
const bezHtml = (t) => String(t || "").replace(/[<>&"]/g, "");
// Ruch po klatkach jednym tweenem z keyframes (zamiast setek osobnych): mapa(klatka) -> właściwości.
function poKlatkach(sel, kl, tR, mapa) {
  tweens.push(`tl.set("${sel}", ${JSON.stringify(mapa(kl[0]))}, ${tR(kl[0].t)});`);
  const kfs = kl.slice(1).map((k, j) => ({ ...mapa(k), duration: r3(Math.max(0.01, tR(k.t) - tR(kl[j].t))), ease: "none" }));
  if (kfs.length) tweens.push(`tl.to("${sel}", { keyframes: ${JSON.stringify(kfs)} }, ${tR(kl[0].t)});`);
}
// Twarz zniknęła z kadru (ręka, odwrócenie) na dłużej niż 0,4 s: ozdoba gaśnie i wraca, gdy twarz wraca,
// zamiast wisieć w miejscu albo płynąć przez dziurę.
function ukryjPrzerwy(sel, kl, tR) {
  for (let j = 1; j < kl.length; j++) {
    if (kl[j].t - kl[j - 1].t <= 0.4) continue;
    const a = tR(kl[j - 1].t), b = tR(kl[j].t);
    tweens.push(`tl.to("${sel}", { autoAlpha: 0, duration: 0.12, ease: "power1.in" }, ${r3(a + 0.04)});`);
    tweens.push(`tl.to("${sel}", { autoAlpha: 1, duration: 0.2, ease: "power1.out" }, ${b});`);
  }
}
// Oś twarzy w klatce: góra (od brody do czoła) i „w prawo na ekranie”, wektory jednostkowe.
function osTwarzy(k) {
  const gx = k.kot.czolo[0] - k.kot.broda[0], gy = k.kot.czolo[1] - k.kot.broda[1], d = Math.hypot(gx, gy) || 1;
  return { gora: [gx / d, gy / d], prawo: [-gy / d, gx / d] };
}
const dalej = (a, b, f) => [Math.round(a[0] + (b[0] - a[0]) * f), Math.round(a[1] + (b[1] - a[1]) * f)];
function warstwaTwarzy(u, st, kon, wys, wnetrze) {
  const id = `tw${++nTw}`, sk = Math.min(1.5, Math.max(0.6, (wys || 900) / 900));
  (ozdobyUj[u.i] ||= []).push(`<div id="${id}" class="clip tw" data-start="${st}" data-duration="${r3(Math.max(0.3, kon - st))}" data-track-index="${160 + nTw}" style="--tw-s:${r3(sk)}"><div id="${id}-in" class="tw-in">${wnetrze(id, sk)}</div></div>`);
  tweens.push(`tl.to("#${id}-in", { opacity: 0, duration: 0.3, ease: "power1.in" }, ${r3(Math.max(st + 0.6, kon - 0.32))});`);
  zmianyPrzebitek.push(st);
  return id;
}
const ETYK = { poczatek: "początek", luk: "łuk", koniec: "koniec" };
function proporcje(u, s, d, od, doo, tR) {
  const kl = klatkiTwarzy(d, od, doo);
  if (!kl.length) return uwaga(`Ujęcie ${u.i}: proporcje brwi pominięte (brak twarzy w tym fragmencie).`);
  const strony = s.strona === "lewa" ? ["lewa"] : s.strona === "prawa" ? ["prawa"] : ["lewa", "prawa"];
  const st = tR(kl[0].t), kon = Math.min(u.end, tR(kl.at(-1).t) + 0.05), wys = wielkoscTwarzy(d, od, doo);
  const etykiety = s.etykiety !== false;
  const id = warstwaTwarzy(u, st, kon, wys, (id, sk) => {
    let svg = `<svg class="tw-svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">`;
    for (const sr of strony) {
      for (const p of Object.keys(ETYK)) svg += `<line id="${id}-${sr}-${p}" class="tw-linia" pathLength="1" style="stroke-width:${r3(4 * sk)}"/>`;
      svg += `<circle id="${id}-${sr}-nos" class="tw-nos" r="0"/>`;
      for (const p of Object.keys(ETYK)) svg += `<circle id="${id}-${sr}-${p}-c" class="tw-kropka" r="0" style="stroke-width:${r3(3 * sk)}"/>`;
    }
    svg += `</svg>`;
    // „koniec” obok punktu (na zewnątrz twarzy), żeby nie wchodził na „łuk”
    const et = etykiety ? Object.entries(ETYK).map(([p, n]) => `<div id="${id}-${p}-e" class="tw-etyk"><span>${n}</span></div>`).join("") : "";
    return svg + et;
  });
  const sk = Math.min(1.5, Math.max(0.6, (wys || 900) / 900));
  ukryjPrzerwy(`#${id}-in`, kl, tR);
  strony.forEach((sr) => {
    const nos = (k) => k.kot[`nos_${sr}`];
    Object.keys(ETYK).forEach((p, j) => {
      const cel = (k) => k.kot[`brew_${sr}_${p}`];
      poKlatkach(`#${id}-${sr}-${p}`, kl, tR, (k) => { const a = nos(k), b = dalej(nos(k), cel(k), 1.12); return { attr: { x1: a[0], y1: a[1], x2: b[0], y2: b[1] } }; });
      poKlatkach(`#${id}-${sr}-${p}-c`, kl, tR, (k) => ({ attr: { cx: cel(k)[0], cy: cel(k)[1] } }));
      const t0 = r3(st + 0.15 + j * 0.3);
      tweens.push(`tl.fromTo("#${id}-${sr}-${p}", { strokeDashoffset: 1 }, { strokeDashoffset: 0, duration: 0.5, ease: "${RUCH.pl}" }, ${t0});`);
      tweens.push(`tl.fromTo("#${id}-${sr}-${p}-c", { attr: { r: 0 } }, { attr: { r: ${r3(9 * sk)} }, duration: 0.3, ease: "${RUCH.ak}" }, ${r3(t0 + 0.42)});`);
    });
    poKlatkach(`#${id}-${sr}-nos`, kl, tR, (k) => ({ attr: { cx: nos(k)[0], cy: nos(k)[1] } }));
    tweens.push(`tl.fromTo("#${id}-${sr}-nos", { attr: { r: 0 } }, { attr: { r: ${r3(6 * sk)} }, duration: 0.25, ease: "${RUCH.ak}" }, ${st});`);
  });
  if (etykiety) Object.keys(ETYK).forEach((p, j) => {
    const sr = strony[0];
    // nad punktem względem osi twarzy; „koniec” obok, na zewnątrz twarzy (nie wchodzi na „łuk”, działa też u leżącej klientki)
    const off = 46 * sk;
    poKlatkach(`#${id}-${p}-e`, kl, tR, (k) => {
      const c = k.kot[`brew_${sr}_${p}`], { gora, prawo } = osTwarzy(k), zew = sr === "lewa" ? -1 : 1;
      const [dx, dy] = p === "koniec" ? [zew * prawo[0] * off * 1.7 + gora[0] * off * 0.3, zew * prawo[1] * off * 1.7 + gora[1] * off * 0.3] : [gora[0] * off, gora[1] * off];
      return { x: Math.round(c[0] + dx), y: Math.round(c[1] + dy) };
    });
    tweens.push(`tl.fromTo("#${id}-${p}-e span", { opacity: 0, scale: 0.6 }, { opacity: 1, scale: 1, duration: 0.3, ease: "${RUCH.ak}" }, ${r3(st + 0.15 + j * 0.3 + 0.45)});`);
  });
}
function obrys(u, s, d, od, doo, tR) {
  const t = s.twarz || "brwi";
  const nazwy = t === "brwi" ? ["brew_lewa", "brew_prawa"] : t === "rzesy" ? ["rzesy_lewa", "rzesy_prawa"] : [t];
  const kl = klatkiTwarzy(d, od, doo).filter((k) => nazwy.every((n) => k.kon?.[n]));
  if (!kl.length || !nazwy.every((n) => /^(brew|rzesy)_(lewa|prawa)$/.test(n))) return uwaga(`Ujęcie ${u.i}: obrys „${t}” pominięty (nieznany kontur albo brak twarzy).`);
  const st = tR(kl[0].t), kon = Math.min(u.end, tR(kl.at(-1).t) + 0.05);
  // obrys brwi lekko poszerzony od środka, żeby linia nie leżała na włoskach
  // gładka krzywa Catmulla-Roma przez punkty siatki (5 na krawędź brwi to za mało, wychodził kanciasty wielokąt)
  const gladko = (p, zamk, n = 5) => {
    const out = [], L = p.length, at = (i) => (zamk ? p[(i + L) % L] : p[Math.max(0, Math.min(L - 1, i))]);
    for (let i = 0; i < (zamk ? L : L - 1); i++) for (let j = 0; j < n; j++) {
      const t = j / n, a = at(i - 1), b = at(i), c = at(i + 1), d = at(i + 2), t2 = t * t, t3 = t2 * t;
      out.push([0, 1].map((q) => 0.5 * (2 * b[q] + (-a[q] + c[q]) * t + (2 * a[q] - 5 * b[q] + 4 * c[q] - d[q]) * t2 + (-a[q] + 3 * b[q] - 3 * c[q] + d[q]) * t3)));
    }
    if (!zamk) out.push(p[L - 1]);
    return out;
  };
  const punkty = (k, n) => {
    let p = k.kon[n];
    if (n.startsWith("brew")) {
      const cx = p.reduce((a, q) => a + q[0], 0) / p.length, cy = p.reduce((a, q) => a + q[1], 0) / p.length;
      p = p.map(([x, y]) => [cx + (x - cx) * 1.12, cy + (y - cy) * 1.35]);
    }
    return gladko(p, n.startsWith("brew")).map(([x, y]) => `${Math.round(x)},${Math.round(y)}`).join(" ");
  };
  const id = warstwaTwarzy(u, st, kon, wielkoscTwarzy(d, od, doo), (id, sk) => `<svg class="tw-svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">${nazwy.map((n) =>
    n.startsWith("brew") ? `<polygon id="${id}-${n}" class="tw-obrys" pathLength="1" style="stroke-width:${r3(4 * sk)}"/>` : `<polyline id="${id}-${n}" class="tw-obrys tw-rzesy" pathLength="1" style="stroke-width:${r3(7 * sk)}"/>`).join("")}</svg>`);
  ukryjPrzerwy(`#${id}-in`, kl, tR);
  nazwy.forEach((n, j) => {
    poKlatkach(`#${id}-${n}`, kl, tR, (k) => ({ attr: { points: punkty(k, n) } }));
    tweens.push(`tl.fromTo("#${id}-${n}", { strokeDashoffset: 1, fillOpacity: 0 }, { strokeDashoffset: 0, duration: 0.7, ease: "${RUCH.pl}" }, ${r3(st + 0.1 + j * 0.15)});`);
    tweens.push(`tl.to("#${id}-${n}", { fillOpacity: 1, duration: 0.4, ease: "power1.out" }, ${r3(st + 0.7 + j * 0.15)});`);
  });
}
for (const u of uj.filter((x) => x.sledzenie?.length && (x.typ === "wideo" || x.typ === "obraz"))) {
  const tp = u.typ === "wideo" ? u.tempo : 1;
  const [ok0, ok1] = oknoKlipu(u);
  const tR = (t) => r3(u.start + Math.max(0, t - u.od) / tp);
  for (const s of u.sledzenie) {
    const od = Math.min(ok1 - 0.2, ok0 + Math.max(0, Number(s.start) || 0) * tp);
    const doo = Math.min(ok1, Number(s.czas) > 0 ? od + Number(s.czas) * tp : ok1);
    const twarzowa = s.twarz || s.element === "proporcje" || s.element === "obrys";
    const d = twarzowa ? twarzUj(u) : null;
    if (twarzowa && !d) continue;
    if (s.element === "proporcje") { proporcje(u, s, d, od, doo, tR); continue; }
    if (s.element === "obrys") { obrys(u, s, d, od, doo, tR); continue; }
    let pk;
    if (s.obiekt) {
      const o = obiektDane(s.obiekt);
      pk = (o?.klatki || []).filter((k) => k.ok && k.t >= od - 0.05 && k.t <= doo + 0.05).map((k) => ({ t: k.t, x: k.x, y: k.y }));
      if (!o || o.src !== u.zrodlo || pk.length < 2) { uwaga(`Ujęcie ${u.i}: obiekt „${s.obiekt}” nie pasuje do tego ujęcia albo jest niewidoczny, pomijam ozdobę.`); continue; }
    } else if (s.twarz) {
      pk = punktyKotwicy(d, s.twarz, od, doo);
      if (pk.length < 2) { uwaga(`Ujęcie ${u.i}: kotwica „${s.twarz}” niewidoczna w tym fragmencie, pomijam.`); continue; }
    } else {
      if (u.typ !== "wideo") continue;
      const pj = s?.plik ? path.join(proj, s.plik) : null;
      if (!pj || !fs.existsSync(pj)) { uwaga(`Śledzenie: brak pliku ${s?.plik}. Uruchom npm run sledz.`); continue; }
      const dane = JSON.parse(fs.readFileSync(pj, "utf8"));
      pk = (dane.punkty || []).filter((p) => p.t >= od - 0.05 && p.t <= doo + 0.05);
      if (pk.length < 2) { uwaga(`Śledzenie ${s.plik}: punkty nie pokrywają tego ujęcia (śledzone ${dane.od}-${dane.do} s klipu).`); continue; }
    }
    nSl++;
    const st = tR(pk[0].t), kon = Math.min(u.end, tR(pk[pk.length - 1].t) + 0.05);
    let el = (ELEMENTY[s.element] || ELEMENTY.kolko)(bezHtml(s.tekst));
    // ozdoba na twarzy w skali twarzy (kółko 170 px na małej twarzy w planie ogólnym zasłaniało pół głowy)
    if (s.twarz) { const sk = Math.min(1.3, Math.max(0.45, (wielkoscTwarzy(twarzUj(u), od, doo) || 900) / 900)); el = `<div class="sl-sk" style="transform:scale(${r3(sk)})">${el}</div>`; }
    (ozdobyUj[u.i] ||= []).push(`<div id="sl${nSl}" class="clip sl" data-start="${st}" data-duration="${r3(Math.max(0.2, kon - st))}" data-track-index="${140 + nSl}"><div id="sl${nSl}-in" class="sl-in">${el}</div></div>`);
    poKlatkach(`#sl${nSl}`, pk, tR, (p) => ({ x: p.x, y: p.y }));
    if (s.twarz || s.obiekt) ukryjPrzerwy(`#sl${nSl}-in`, pk, tR);
    tweens.push(`tl.fromTo("#sl${nSl}-in", { scale: 0.4, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.3, ease: "${RUCH.ak}" }, ${st});`);
    tweens.push(`tl.to("#sl${nSl}-in", { opacity: 0, duration: 0.2, ease: "power1.in" }, ${r3(Math.max(st + 0.35, kon - 0.22))});`);
    zmianyPrzebitek.push(st);
  }
}
// Obiekty (SAM 2, npm run obiekt): "obiekty": [{ "id": "o1", "efekt": "reflektor|poswiata|tekst_za", "tekst", "tekst_y",
// "start", "czas" }]. Wycięcie obiektu (wyciete/<klip>__<id>.webm) leży nad nagraniem w warstwie ujęcia, zsynchronizowane:
//   reflektor = wszystko poza obiektem przygasa (cień między nagraniem a wycięciem),
//   poswiata  = świecący obrys obiektu w kolorze akcentu,
//   tekst_za  = napis między nagraniem a wycięciem, więc obiekt (dłoń, narzędzie) przechodzi przed nim.
const obiektyUj = {};
let nOb = 0;
function obiektDane(id) {
  if (!obiektyCache.has(id)) {
    const p = path.join(proj, "kompozycja", "obiekty", `${String(id).replace(/[^\w-]/g, "")}.json`);
    let d = null;
    try { d = JSON.parse(fs.readFileSync(p, "utf8")); } catch {}
    obiektyCache.set(id, d);
  }
  return obiektyCache.get(id);
}
const AKCENT = cfg.kolory?.akcent || "#B07A6E";
for (const u of uj.filter((x) => x.obiekty?.length && x.typ === "wideo")) {
  const tR = (t) => r3(u.start + Math.max(0, t - u.od) / u.tempo);
  const [ok0, ok1] = oknoKlipu(u);
  for (const o of u.obiekty) {
    const d = obiektDane(o.id);
    if (!d || !d.plik || !fs.existsSync(path.join(proj, d.plik))) { uwaga(`Ujęcie ${u.i}: brak obiektu „${o.id}” (npm run obiekt).`); continue; }
    if (d.src !== u.zrodlo) { uwaga(`Ujęcie ${u.i}: obiekt „${o.id}” jest wycięty z ${d.src}, a ujęcie to ${u.zrodlo}. Pomijam.`); continue; }
    const a = Math.max(ok0 + Math.max(0, Number(o.start) || 0) * u.tempo, d.od);
    const b = Math.min(ok1, d.do, Number(o.czas) > 0 ? a + Number(o.czas) * u.tempo : Infinity);
    if (b - a < 0.3) { uwaga(`Ujęcie ${u.i}: obiekt „${o.id}” nie pokrywa tego fragmentu (wycięty ${d.od}-${d.do} s klipu).`); continue; }
    nOb++;
    const st = tR(a), kon = Math.min(u.end, tR(b)), dl = r3(kon - st), id = `ob${nOb}`, efekt = o.efekt || "reflektor";
    const html = obiektyUj[u.i] ||= [];
    const okno = `data-start="${st}" data-duration="${dl}"`;
    if (efekt === "reflektor") {
      html.push(`<div id="${id}-c" class="clip ob-c" ${okno} data-track-index="${200 + nOb}"></div>`);
      tweens.push(`tl.fromTo("#${id}-c", { opacity: 0 }, { opacity: ${Math.min(0.85, Math.max(0.3, Number(o.sila) || 0.62))}, duration: 0.45, ease: "${RUCH.we}" }, ${st});`);
      tweens.push(`tl.to("#${id}-c", { opacity: 0, duration: 0.3, ease: "${RUCH.wy}" }, ${r3(Math.max(st + 0.5, kon - 0.32))});`);
    }
    if (efekt === "tekst_za" && o.tekst) {
      const t = bezHtml(o.tekst).replace(/\*(.+?)\*/g, "<em>$1</em>").replace(/\|/g, "<br>");
      html.push(`<div id="${id}-t" class="clip ob-t" ${okno} data-track-index="${200 + nOb}" style="top:${Math.max(220, Math.min(1400, Number(o.tekst_y) || 600))}px">${t}</div>`);
      tweens.push(`tl.fromTo("#${id}-t", { opacity: 0, y: 50 }, { opacity: 1, y: 0, duration: 0.6, ease: "${RUCH.we}" }, ${r3(st + 0.1)});`);
      tweens.push(`tl.to("#${id}-t", { opacity: 0, duration: 0.3, ease: "${RUCH.wy}" }, ${r3(Math.max(st + 0.8, kon - 0.32))});`);
    }
    html.push(`<div id="${id}-w" class="ob-w"><video id="${id}" class="clip ob-v" src="${asset(d.plik)}" ${okno} data-media-start="${r3(a - d.od)}"${u.tempo !== 1 ? ` data-playback-rate="${u.tempo}"` : ""} data-track-index="${220 + nOb}" muted playsinline></video></div>`);
    if (efekt === "poswiata") {
      const c = AKCENT, sila = Math.min(2, Math.max(0.5, Number(o.sila) || 1));
      tweens.push(`tl.fromTo("#${id}-w", { filter: "drop-shadow(0px 0px 0px ${c}) drop-shadow(0px 0px 0px ${c})" }, { filter: "drop-shadow(0px 0px ${r3(10 * sila)}px ${c}) drop-shadow(0px 0px ${r3(28 * sila)}px ${c})", duration: 0.5, ease: "${RUCH.we}" }, ${st});`);
      tweens.push(`tl.to("#${id}-w", { filter: "drop-shadow(0px 0px 0px ${c}) drop-shadow(0px 0px 0px ${c})", duration: 0.35, ease: "${RUCH.wy}" }, ${r3(Math.max(st + 0.55, kon - 0.37))});`);
    }
    zmianyPrzebitek.push(st);
  }
}
const opisSledzenia = nSl || nTw || nOb ? [nSl ? `śledzenie punktu: ${nSl}` : "", nTw ? `ozdoby twarzy: ${nTw}` : "", nOb ? `obiekty (SAM 2): ${nOb}` : ""].filter(Boolean).join(", ") : null;

// --- efekty montażu (rolka.efekty) ---
const efektyHtml = [];
const efektyOpis = [];
if (opisSledzenia) efektyOpis.push(opisSledzenia);
// Momenty, w których na ekranie coś się zmienia (cięcia, plansze, zbliżenia). Z nich liczymy "martwe" miejsca.
const zmiany = [0, ...uj.map((u) => u.start), ...sceny.map((s) => Number(s.start || 0)), ...zmianyPrzebitek];
const mowaZrodlo = np.zrodlo || audio.find((a) => a.id === "vo")?.zrodlo;
const czyMowa = (src) => src === mowaZrodlo || zrodlaNapisow.some(([z]) => z === src);
// Zajawka efektu: pierwsze 0,8 s to końcowy efekt (pod hookiem), potem cięcie na początek zabiegu.
const ZAJ = 0.8;
let zajawka = null;
if (ef.zajawka && D > 4) {
  const pp = sceny.find((s) => s.szablon === "przed-po" && s.media?.po);
  let zsrc = null, zod = null, zkadr = rolka.zajawka?.kadr;
  if (rolka.zajawka?.src) { zsrc = rolka.zajawka.src; zod = rolka.zajawka.od; }
  else if (pp) zsrc = pp.media.po;
  else {
    const kand = [...uj].reverse().find((u) => u.typ === "wideo" && !czyMowa(u.zrodlo)) || [...uj].reverse().find((u) => u.typ !== "kolor");
    if (kand) { zsrc = kand.zrodlo; zod = kand.typ === "wideo" ? Math.max(kand.od, kand.od + kand.dur - ZAJ) : 0; zkadr = kand.kadr; }
  }
  if (zsrc) {
    const src = asset(zsrc);
    let el;
    if (ROZSZ_WIDEO.test(zsrc)) {
      if (zod == null) { const d0 = ffprobe(path.isAbsolute(zsrc) ? zsrc : path.join(proj, zsrc)).duration; zod = Math.max(0, d0 - ZAJ - 0.1); }
      el = `<video id="zajawka" class="clip uj-media" src="${src}" data-start="0" data-duration="${ZAJ}" data-media-start="${r3(zod)}" data-track-index="9" muted playsinline></video>`;
    } else el = `<img id="zajawka" class="clip uj-media" src="${src}" data-start="0" data-duration="${ZAJ}" data-track-index="9" alt="" />`;
    efektyHtml.push(`<div id="zajawka-w" class="uj" style="z-index:${uj.length + 2}">\n        ${wKadrze(zkadr, el)}\n        <div id="zajawka-flash" style="position:absolute;inset:0;background:#fff;opacity:0"></div>\n      </div>`);
    tweens.push(`tl.fromTo("#zajawka", { scale: 1.12 }, { scale: 1, duration: ${ZAJ}, ease: "power1.out" }, 0);`);
    tweens.push(`tl.fromTo("#zajawka-flash", { opacity: 0.85 }, { opacity: 0, duration: 0.3, ease: "power2.out", immediateRender: false }, ${r3(ZAJ - 0.08)});`);
    zajawka = { src: zsrc, od: zod };
    zmiany.push(ZAJ);
    efektyOpis.push(`zajawka efektu (${path.basename(zsrc)})`);
  } else uwaga("Zajawka efektu: nie znalazłem ujęcia z efektem (dodaj przed/po albo ujęcie wideo).");
}
// Wirtualny operator kamery (efekty.operator, scripts/operator-kamery.mjs): kadr trzyma twarz przy mowie albo idzie
// za ruchem przy pracy, najeżdża na akcentach głosu; sprężyna zamiast skoków. Ujęcia z operatorem nie dostają punch_in.
const operatorUj = new Set();
if (ef.operator) {
  let nT = 0, nR = 0;
  for (const u of uj.filter((x) => x.typ === "wideo" && x.dur >= 0.8)) {
    const mowa = czyMowa(u.zrodlo);
    const akcenty = mowa ? slowaRolki.filter((w) => w.n > 0 && w.start >= u.start + 0.15 && w.start < u.end - 0.4).map((w) => ({ t: w.start, n: w.n })) : [];
    const d = mowa ? twarzUj(u) : null;
    const k = sciezkaKamery({ proj, u, twarz: d, mowa, akcenty }).klatki;
    if (k.length < 2) continue;
    operatorUj.add(u.i);
    if (mowa && d) nT++; else nR++;
    tweens.push(`tl.set("#u${u.i}-m", { transformOrigin: "0px 0px", x: ${k[0].x}, y: ${k[0].y}, scale: ${k[0].s} }, ${u.start});`);
    const kfs = k.slice(1).map((q, j) => ({ x: q.x, y: q.y, scale: q.s, duration: r3(Math.max(0.01, q.t - k[j].t)), ease: "none" }));
    tweens.push(`tl.to("#u${u.i}-m", { keyframes: ${JSON.stringify(kfs)} }, ${u.start});`);
  }
  efektyOpis.push(`operator kamery: ${nT} za twarzą, ${nR} za ruchem`);
}
// Zbliżenia: co drugie ujęcie z mową bliżej (jak druga kamera) + krótki "wjazd" na słowach kluczowych i liczbach.
if (ef.punch_in) {
  const mowaZr = np.zrodlo || audio.find((a) => a.id === "vo")?.zrodlo;
  const klucze = (np.wyroznij || []).map((s) => s.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "")).filter(Boolean);
  const czyKlucz = (t) => {
    const c = t.toLowerCase().replace(/[^\p{L}\p{N}%]/gu, "");
    return /\d/.test(c) || klucze.some((k) => c.startsWith(k.slice(0, Math.max(3, k.length - 2))));
  };
  let ile = 0;
  uj.filter((u) => u.typ === "wideo" && !operatorUj.has(u.i) && (u.zrodlo === mowaZr || czyMowa(u.zrodlo))).forEach((u, n) => {
    if (n % 2) zmiany.push(u.start);
    const baza = n % 2 ? 1.1 : 1;
    if (baza !== 1) tweens.push(`tl.set("#u${u.i}-m", { scale: ${baza} }, ${u.start});`);
    let ostatni = -9;
    for (const w of slowaRolki) {
      if (!(czyKlucz(w.text) || w.n === 2) || w.start < u.start + 0.2 || w.start > u.end - 0.7 || w.start - ostatni < 1.2) continue;
      tweens.push(`tl.fromTo("#u${u.i}-m", { scale: ${baza} }, { scale: ${r3(baza * 1.07)}, duration: 0.14, ease: "power2.out" }, ${r3(w.start - 0.04)});`);
      tweens.push(`tl.to("#u${u.i}-m", { scale: ${baza}, duration: 0.55, ease: "power2.inOut" }, ${r3(w.start + 0.1)});`);
      ostatni = w.start; ile++; zmiany.push(w.start);
    }
    if (baza !== 1) ile++;
  });
  efektyOpis.push(`zbliżenia: ${ile}`);
}
// Nowy bodziec co 3 s: jeśli w ujęciu wideo przez ponad 3 s nic się nie zmienia, kadr przeskakuje bliżej / dalej
// (jak druga kamera). Liczone po wszystkich innych zmianach, więc wypełnia tylko martwe miejsca.
const bodzce = [];
if (ef.bodziec) {
  const MAX = 3, CO = 2.4;
  const zm = [...new Set(zmiany.map(r3))].sort((a, b) => a - b);
  for (const u of uj.filter((x) => x.typ === "wideo")) {
    const wSrodku = zm.filter((x) => x > u.start + 0.05 && x < u.end - 0.05);
    let cur = Math.max(u.start, zajawka ? ZAJ : 0), blisko = false;
    for (const nastepny of [...wSrodku, u.end]) {
      while (nastepny - cur > MAX && cur + CO < u.end - 0.8) {
        cur = naKlatke(cur + CO);
        blisko = !blisko;
        tweens.push(`tl.set("#u${u.i}-w", { scale: ${blisko ? 1.09 : 1} }, ${cur});`);
        bodzce.push(cur);
      }
      cur = Math.max(cur, nastepny);
    }
    if (blisko && u.przejscie !== "zoom") tweens.push(`tl.set("#u${u.i}-w", { scale: 1 }, ${u.end});`);
  }
  zmiany.push(...bodzce);
  efektyOpis.push(`bodźce co 3 s: ${bodzce.length}`);
}
// Dźwięki przejść: whoosh przy przejściach (poza cięciem), pop przy wejściu planszy. Pliki generujemy sami (bez licencji).
if (ef.dzwieki) {
  const SFX = path.join(ROOT, "03_BIBLIOTEKA", "sfx");
  const gen = {
    "whoosh_wlasny.wav": ["-f", "lavfi", "-i", "anoisesrc=d=0.6:c=pink:a=0.8:r=48000", "-af", "bandpass=f=1400:width_type=h:w=2400,afade=t=in:st=0:d=0.38:curve=exp,afade=t=out:st=0.38:d=0.22,volume=0.8"],
    "pop_wlasny.wav": ["-f", "lavfi", "-i", "aevalsrc='0.7*sin(2*PI*(420+1400*exp(-28*t))*t)*exp(-20*t)':s=48000:d=0.2"],
    "uderzenie_wlasny.wav": ["-f", "lavfi", "-i", "aevalsrc='(0.9*sin(2*PI*(48+110*exp(-10*t))*t)+0.25*(random(0)-0.5)*exp(-30*t))*exp(-4*t)':s=48000:d=0.9"],
    "narastanie_wlasny.wav": ["-f", "lavfi", "-i", "aevalsrc='(0.3*sin(2*PI*(180*t+260*t*t))+0.3*(random(0)-0.5))*pow(t/1.3,2.2)':s=48000:d=1.3", "-af", "highpass=f=200,afade=t=out:st=1.24:d=0.06"],
    "klik_wlasny.wav": ["-f", "lavfi", "-i", "aevalsrc='0.5*sin(2*PI*2200*t)*exp(-80*t)+0.2*(random(0)-0.5)*exp(-200*t)':s=48000:d=0.08"],
    // swipe: krótki, szybki świst (szum z przesuwanym w górę pasmem), szczyt w 0,15 s = moment cięcia
    "swipe_wlasny.wav": ["-f", "lavfi", "-i", "aevalsrc='(random(0)-0.5)*sin(PI*t/0.35)*sin(PI*t/0.35)':s=48000:d=0.35", "-af", "highpass=f=700,lowpass=f=7000,volume=2.2"],
    // swish: lekki "szurk" pod markerem / kreską / kółkiem
    "swish_wlasny.wav": ["-f", "lavfi", "-i", "aevalsrc='(random(0)-0.5)*pow(sin(PI*t/0.3),3)':s=48000:d=0.3", "-af", "highpass=f=2500,volume=1.6"],
    // tik: jedno "tyknięcie" licznika
    "tik_wlasny.wav": ["-f", "lavfi", "-i", "aevalsrc='0.6*sin(2*PI*3200*t)*exp(-140*t)':s=48000:d=0.03"],
    // ding: dzwoneczek na końcu odliczania
    "ding_wlasny.wav": ["-f", "lavfi", "-i", "aevalsrc='(0.45*sin(2*PI*1760*t)+0.25*sin(2*PI*2640*t)+0.12*sin(2*PI*3520*t))*exp(-5*t)':s=48000:d=0.8"],
    // myszka: klik przycisku myszy (wciśnięcie i puszczenie 70 ms później)
    "myszka_wlasny.wav": ["-f", "lavfi", "-i", "aevalsrc='(random(0)-0.5)*(exp(-700*t)+0.6*gte(t,0.07)*exp(-900*(t-0.07)))+0.3*sin(2*PI*1900*t)*exp(-260*t)':s=48000:d=0.15", "-af", "highpass=f=1200,volume=2.5"],
  };
  for (const [plik, a] of Object.entries(gen)) {
    const dst = path.join(SFX, plik);
    if (fs.existsSync(dst)) continue;
    fs.mkdirSync(SFX, { recursive: true });
    const r = uruchom("ffmpeg", ["-y", "-v", "error", ...a, "-ac", "2", "-c:a", "pcm_s16le", dst], { cicho: true });
    if (r.code !== 0) blad(`Nie udało się wygenerować ${plik}.`, r.stderr.slice(-300));
  }
  const momenty = [];
  uj.forEach((u, i) => {
    const n = uj[i + 1];
    if (!n || u.przejscie === "ciecie") return;
    if (u.przejscie.startsWith("swipe") || u.przejscie === "whip") momenty.push({ t: n.start - 0.15, plik: "swipe_wlasny.wav", dur: 0.35, vol: u.przejscie === "whip" ? 0.6 : 0.5, tor: 5 });
    else if (["fala", "ostrosc", "przez_postac"].includes(u.przejscie)) {
      // whoosh na długość przejścia: narasta do 60% i gaśnie, szczyt w środku zakładki
      const d = Math.round((u.end - n.start + 0.35) * 20) / 20, plik = `whoosh_${Math.round(d * 1000)}_${u.przejscie === "fala" ? "nisko" : "jasno"}_wlasny.wav`;
      if (!fs.existsSync(path.join(SFX, plik))) {
        const pas = u.przejscie === "fala" ? "lowpass=f=900,highpass=f=60,volume=2.2" : "bandpass=f=2200:width_type=h:w=3000,volume=0.9";
        const r = uruchom("ffmpeg", ["-y", "-v", "error", "-f", "lavfi", "-i", `anoisesrc=d=${d}:c=${u.przejscie === "fala" ? "brown" : "pink"}:a=0.8:r=48000`, "-af", `${pas},afade=t=in:st=0:d=${r3(d * 0.6)}:curve=exp,afade=t=out:st=${r3(d * 0.6)}:d=${r3(d * 0.4)}`, "-ac", "2", "-c:a", "pcm_s16le", path.join(SFX, plik)], { cicho: true });
        if (r.code !== 0) { uwaga(`Nie udało się wygenerować ${plik}.`); return; }
      }
      momenty.push({ t: n.start - 0.2, plik, dur: d, vol: u.przejscie === "ostrosc" ? 0.2 : 0.32, tor: 5 });
    }
    else momenty.push({ t: n.start - 0.3, plik: "whoosh_wlasny.wav", dur: 0.6, vol: 0.35, tor: 5 });
  });
  for (const s of sceny) {
    if (["watermark", "safe-zone-debug"].includes(s.szablon)) continue;
    const s0 = Number(s.start || 0), sd = Number(s.czas || 3), dn = s.dane || {};
    // Cena zza postaci: wysunięcie karty, klik myszki, dzwonek przy cenie (czasy jak w cena-za-postacia.html).
    if (s.szablon === "cena-za-postacia") {
      momenty.push({ t: s0 + 0.05, plik: "whoosh_wlasny.wav", dur: 0.6, vol: 0.35, tor: 4 });
      momenty.push({ t: s0 + 1.2, plik: "myszka_wlasny.wav", dur: 0.15, vol: 0.6, tor: 7 });
      momenty.push({ t: s0 + 1.45, plik: "ding_wlasny.wav", dur: 0.8, vol: 0.3, tor: 8 });
      continue;
    }
    momenty.push({ t: s0 + 0.05, plik: "pop_wlasny.wav", dur: 0.2, vol: 0.3, tor: 6 });
    // Dźwięki pod animacją tekstu, zsynchronizowane z czasami w szablonie.
    if (s.szablon === "tekst-animowany") {
      const e = dn.efekt || "przekreslenie";
      if (e === "marker" || e === "kolko") momenty.push({ t: s0 + 0.35, plik: "swish_wlasny.wav", dur: 0.3, vol: 0.35, tor: 8 });
      if (e === "przekreslenie") momenty.push({ t: s0 + Math.min(0.9, sd * 0.3), plik: "swish_wlasny.wav", dur: 0.3, vol: 0.35, tor: 8 });
      const m = e === "licznik" && String(dn.tekst || "").match(/(\d+(?:[.,]\d+)?)/);
      if (m) {
        // Licznik: tyknięcia przy każdym kroku liczby (ease power2.out: gęsto na starcie, rzadziej pod koniec) i dzwonek na końcu.
        const T = Math.min(1.2, sd * 0.45), N = 14;
        for (let k = 0; k < N; k++) momenty.push({ t: s0 + 0.2 + T * (1 - Math.sqrt(1 - k / N)), plik: "tik_wlasny.wav", dur: 0.03, vol: 0.22 + 0.2 * (k / N), tor: 7 });
        momenty.push({ t: s0 + 0.2 + T, plik: "ding_wlasny.wav", dur: 0.8, vol: 0.32, tor: 8 });
        momenty.push({ t: s0 + 0.2 + T, plik: "uderzenie_wlasny.wav", dur: 0.9, vol: 0.3, tor: 3 });
      }
    }
    // Cena: tyknięcia przy odliczaniu od zera (czasy jak w cena-oferta.html) i dzwonek na końcu.
    // Wejście klik: klik myszki w 0,95 s, reszta przesunięta o 0,85 s.
    const O = s.szablon === "cena-oferta" && dn.wejscie === "klik" ? 0.85 : 0;
    if (O) momenty.push({ t: s0 + 0.95, plik: "myszka_wlasny.wav", dur: 0.15, vol: 0.6, tor: 9 });
    if (s.szablon === "cena-oferta" && dn.licznik !== false && /\d/.test(String(dn.cena ?? "180 zł"))) {
      const T = Math.min(1.0, Math.max(0.5, sd * 0.3)), N = 12;
      for (let k = 0; k < N; k++) momenty.push({ t: s0 + O + 0.75 + T * (1 - Math.cbrt(1 - k / N)), plik: "tik_wlasny.wav", dur: 0.03, vol: 0.18 + 0.16 * (k / N), tor: 7 });
      momenty.push({ t: s0 + O + 0.75 + T, plik: "ding_wlasny.wav", dur: 0.8, vol: 0.26, tor: 8 });
      if (dn.cena_stara) momenty.push({ t: s0 + O + 0.7, plik: "swish_wlasny.wav", dur: 0.3, vol: 0.3, tor: 9 });
    }
    // Hook „uderzenie”: szurnięcie pod rysowanym kółkiem (czas jak w hook-tytul.html).
    if (s.szablon === "hook-tytul" && dn.wariant === "uderzenie" && /\*/.test(String(dn.tekst || ""))) momenty.push({ t: s0 + 0.6, plik: "swish_wlasny.wav", dur: 0.3, vol: 0.35, tor: 8 });
    // Lista: pop przy każdej wjeżdżającej karcie (czasy jak w lista-krokow.html).
    if (s.szablon === "lista-krokow") {
      const kroki = String(dn.kroki || "").split("|").filter((x) => x.trim());
      const T0 = Math.min(1.3, sd * 0.2), per = (sd - T0) / Math.max(1, kroki.length);
      kroki.forEach((_, k) => momenty.push({ t: s0 + T0 + k * per + 0.05, plik: "pop_wlasny.wav", dur: 0.2, vol: 0.28, tor: 6 }));
    }
  }
  // Uderzenie na starcie (zatrzymuje kciuk), whoosh po zajawce, narastanie przed odsłonięciem efektu, klik przy bodźcach.
  momenty.push({ t: 0, plik: "uderzenie_wlasny.wav", dur: 0.9, vol: 0.45, tor: 2 });
  if (zajawka) momenty.push({ t: ZAJ - 0.3, plik: "whoosh_wlasny.wav", dur: 0.6, vol: 0.4, tor: 5 });
  for (const s of sceny.filter((x) => x.szablon === "przed-po")) momenty.push({ t: Number(s.start || 0) - 1.3, plik: "narastanie_wlasny.wav", dur: 1.3, vol: 0.3, tor: 2 });
  for (const b of bodzce) momenty.push({ t: b, plik: "klik_wlasny.wav", dur: 0.08, vol: 0.18, tor: 6 });
  const koniecToru = {};
  let n = 0;
  momenty.sort((a, b) => a.t - b.t).forEach((m) => {
    const t0 = r3(Math.max(0, m.t));
    if (t0 + m.dur > D || t0 < (koniecToru[m.tor] ?? -1)) return;
    koniecToru[m.tor] = t0 + m.dur + 0.02;
    const src = asset(path.join(SFX, m.plik));
    n++;
    efektyHtml.push(`<audio id="sfx${n}" class="clip" src="${src}" data-start="${t0}" data-duration="${m.dur}" data-track-index="${m.tor}" data-volume="${vol(m.vol)}"></audio>`);
  });
  efektyOpis.push(`dźwięki: ${n}`);
}
// Foley (dźwięki zabiegu przy ujęciach: ujecie.foley [{typ, start, glosnosc}], start względem początku ujęcia)
// i ambient gabinetu pod całą rolką (efekty.ambient). Generowane lokalnie, bez licencji.
const FOLEY = {
  peseta: { d: 0.25, a: ["-f", "lavfi", "-i", "aevalsrc='(0.5*sin(2*PI*5200*t)+0.3*sin(2*PI*7900*t))*exp(-90*t)+0.35*gte(t,0.09)*(0.5*sin(2*PI*5600*(t-0.09))+0.3*sin(2*PI*8300*(t-0.09)))*exp(-110*(t-0.09))':s=48000:d=0.25", "-af", "highpass=f=2500"] },
  szczoteczka: { d: 0.45, a: ["-f", "lavfi", "-i", "anoisesrc=d=0.45:c=white:a=0.5:r=48000", "-af", "bandpass=f=6000:width_type=h:w=5000,volume='0.25+0.75*abs(sin(2*PI*9*t))':eval=frame,afade=t=in:d=0.05,afade=t=out:st=0.35:d=0.1"] },
  spray: { d: 0.6, a: ["-f", "lavfi", "-i", "anoisesrc=d=0.6:c=white:a=0.6:r=48000", "-af", "highpass=f=4000,afade=t=in:d=0.03,afade=t=out:st=0.4:d=0.2,volume=0.8"] },
  stukniecie: { d: 0.3, a: ["-f", "lavfi", "-i", "aevalsrc='(0.6*sin(2*PI*1350*t)+0.3*sin(2*PI*3100*t)+0.2*sin(2*PI*4700*t))*exp(-26*t)+0.3*(random(0)-0.5)*exp(-300*t)':s=48000:d=0.3"] },
  szelest: { d: 0.5, a: ["-f", "lavfi", "-i", "anoisesrc=d=0.5:c=pink:a=0.6:r=48000", "-af", "highpass=f=1500,lowpass=f=9000,volume='0.3+0.7*abs(sin(2*PI*5*t))':eval=frame,afade=t=in:d=0.05,afade=t=out:st=0.38:d=0.12"] },
  puder: { d: 0.4, a: ["-f", "lavfi", "-i", "anoisesrc=d=0.4:c=pink:a=0.5:r=48000", "-af", "lowpass=f=3000,afade=t=in:d=0.1,afade=t=out:st=0.2:d=0.2"] },
};
const SFXD = path.join(ROOT, "03_BIBLIOTEKA", "sfx");
function sfxPlik(nazwa, a) {
  const dst = path.join(SFXD, nazwa);
  if (!fs.existsSync(dst)) {
    fs.mkdirSync(SFXD, { recursive: true });
    const r = uruchom("ffmpeg", ["-y", "-v", "error", ...a, "-ac", "2", "-c:a", "pcm_s16le", dst], { cicho: true });
    if (r.code !== 0) blad(`Nie udało się wygenerować ${nazwa}.`, r.stderr.slice(-300));
  }
  return asset(dst);
}
let nFoley = 0;
for (const u of uj) for (const f of u.foley) {
  const def = FOLEY[f.typ];
  if (!def) { uwaga(`Ujęcie ${u.i}: nieznany dźwięk foley „${f.typ}” (są: ${Object.keys(FOLEY).join(", ")}).`); continue; }
  const t0 = r3(u.start + Math.max(0, Number(f.start) || 0));
  if (t0 >= u.end || t0 + def.d > D) continue;
  nFoley++;
  efektyHtml.push(`<audio id="foley${nFoley}" class="clip" src="${sfxPlik(`foley_${f.typ}_wlasny.wav`, def.a)}" data-start="${t0}" data-duration="${def.d}" data-track-index="${60 + (nFoley % 4)}" data-volume="${vol(Number(f.glosnosc ?? 0.5))}"></audio>`);
}
if (nFoley) efektyOpis.push(`dźwięki zabiegu: ${nFoley}`);
if (ef.ambient) {
  // cichy szum pomieszczenia (różowy szum, bez basu i sykliwych góry) + bardzo cichy „pokój” 120 Hz
  const src = sfxPlik("ambient_gabinet_wlasny.wav", ["-f", "lavfi", "-i", "anoisesrc=d=120:c=pink:a=0.5:r=48000:seed=7", "-f", "lavfi", "-i", "sine=f=120:d=120:r=48000", "-filter_complex", "[0]highpass=f=180,lowpass=f=3500,volume=0.5[n];[1]volume=0.015[h];[n][h]amix=inputs=2:normalize=0"]);
  efektyHtml.push(`<audio id="ambient" class="clip" src="${src}" data-start="0" data-duration="${r3(Math.min(D, 120))}" data-track-index="65" data-volume="${vol(Number(ef.ambient_glosnosc ?? 0.06))}"></audio>`);
  efektyOpis.push("ambient gabinetu");
}
// Muzyka cichnie pod głosem i wraca w pauzach (automatyka głośności mnoży data-volume).
const muz = audio.find((a) => a.id === "muzyka");
if (ef.wycisz_muzyke && muz && slowaRolki.length) {
  const POD = 0.5, NAROST = 0.15;
  const bloki = [];
  for (const w of slowaRolki) {
    const ost = bloki[bloki.length - 1];
    if (ost && w.start - ost.b < 0.8) ost.b = Math.max(ost.b, w.end); else bloki.push({ a: w.start, b: w.end });
  }
  const pts = [{ t: 0, v: 1 }];
  for (const { a, b } of bloki) {
    const ta = r3(Math.max(0, a - muz.start - NAROST)), tb = r3(b - muz.start + 0.1);
    if (tb <= 0 || ta >= muz.dur) continue;
    pts.push({ t: ta, v: 1 }, { t: r3(ta + NAROST), v: POD }, { t: tb, v: POD }, { t: r3(tb + 0.25), v: 1 });
  }
  const czyste = [];
  for (const p of pts) if (p.t >= 0 && p.t <= muz.dur && (!czyste.length || p.t > czyste[czyste.length - 1].t) && czyste.length < 500) czyste.push(p);
  if (czyste.length > 1) {
    muz.vol = r3(Math.min(1, muz.vol * 1.8));
    muz.automation = JSON.stringify({ version: 1, lanes: [{ target: "volume", points: czyste }] });
    efektyOpis.push(`muzyka cichnie pod głosem (${bloki.length} fragmentów)`);
  }
} else if (ef.wycisz_muzyke && !muz) efektyOpis.push("ściszanie muzyki (pominięte: brak muzyki w rolce)");
// Pasek postępu u góry.
if (ef.pasek_postepu) {
  efektyHtml.push(`<div id="pasek-postepu" class="clip" data-start="0" data-duration="${D}" data-track-index="7" style="position:absolute;left:0;top:0;width:${W}px;height:10px;background:var(--akcent);transform-origin:0 50%;z-index:90"></div>`);
  tweens.push(`tl.fromTo("#pasek-postepu", { scaleX: 0 }, { scaleX: 1, duration: ${D}, ease: "none" }, 0);`);
  efektyOpis.push("pasek postępu");
}
// Zapętlenie: ostatnie 0.4 s przenika w pierwszą klatkę rolki.
if (ef.zapetlenie && uj.length && D > 2) {
  const u0 = uj[0], dl = 0.4, st = r3(D - dl);
  let el;
  if (u0.typ === "wideo") el = `<video id="petla" class="clip uj-media" src="${u0.src}" data-start="${st}" data-duration="${dl}" data-media-start="${r3(u0.od)}" data-track-index="8" muted playsinline></video>`;
  else if (u0.typ === "obraz") el = `<img id="petla" class="clip uj-media" src="${u0.src}" data-start="${st}" data-duration="${dl}" data-track-index="8" alt="" />`;
  else el = `<div id="petla" class="clip uj-kolor" data-start="${st}" data-duration="${dl}" data-track-index="8" style="background:${u0.kolor || "var(--nude)"}"></div>`;
  efektyHtml.push(`<div id="petla-w" class="uj" style="z-index:${uj.length + 1}">\n        ${wKadrze(u0.kadr, el)}\n      </div>`);
  tweens.push(`tl.fromTo("#petla-w", { opacity: 0 }, { opacity: 1, duration: ${dl}, ease: "none" }, ${st});`);
  efektyOpis.push("zapętlenie");
}
if (ef.emoji) efektyOpis.push(np.wlacz !== false && np.plik ? "emoji w napisach" : "emoji (wyłączone, bo nie ma napisów)");

// --- debug safe zone ---
if (rolka.debug_safe_zone) {
  const inst = instancja("safe-zone-debug", D);
  host(inst, 0, D, 100, {});
  uwaga("debug_safe_zone = true: nakładka safe zone jest WŁĄCZONA (render final odmówi).");
}

// --- index.html ---
// Stały kadr: "kadr": { "x": 540, "y": 1200, "skala": 1.4 } -> ten punkt nagrania (piksele 1080x1920) ląduje w środku
// kadru, reszta obrazu zostaje ucięta (np. logo urządzenia w tle). Osobna warstwa, więc zoomy i przejścia działają dalej.
function wKadrze(k, el) {
  if (!k || !isFinite(Number(k.x)) || !isFinite(Number(k.y))) return el;
  const s = Math.min(2.5, Math.max(1, Number(k.skala) || 1.3));
  const x = Math.min(W - W / 2 / s, Math.max(W / 2 / s, Number(k.x)));
  const y = Math.min(H - H / 2 / s, Math.max(H / 2 / s, Number(k.y)));
  return `<div class="uj-kadr"><div class="uj-kadr-in" style="transform:translate(${r3(W / 2 - s * x)}px, ${r3(H / 2 - s * y)}px) scale(${s})">${el}</div></div>`;
}
const ujHtml = uj.map((u, n) => {
  const z = n + 1;
  let el;
  if (u.typ === "wideo") {
    const w = u.dzwiek && n > 0 ? Math.min(u.wczesniej, u.od, uj[n - 1].dur - 0.1) : 0;
    if (w > 0.02) efektyHtml.push(`<audio id="uja${u.i}" class="clip" src="${u.src}" data-start="${r3(u.start - w)}" data-duration="${r3(u.dur + w)}" data-media-start="${r3(u.od - w)}" data-track-index="${30 + u.i}" data-volume="${vol(u.glosnosc)}"></audio>`);
    const dzw = u.dzwiek && !(w > 0.02) ? `data-has-audio="true" data-volume="${vol(u.glosnosc)}"` : "muted";
    el = `<video id="u${u.i}" class="clip uj-media" src="${u.src}" data-start="${u.start}" data-duration="${u.dur}" data-media-start="${r3(u.od)}"${u.tempo !== 1 ? ` data-playback-rate="${u.tempo}"` : ""} data-track-index="1" ${dzw} playsinline></video>`;
  } else if (u.typ === "obraz") {
    el = `<img id="u${u.i}" class="clip uj-media" src="${u.src}" data-start="${u.start}" data-duration="${u.dur}" data-track-index="1" alt="" />`;
  } else {
    el = `<div id="u${u.i}" class="clip uj-kolor" data-start="${u.start}" data-duration="${u.dur}" data-track-index="1" style="background:${u.kolor || "var(--nude)"}">${u.etykieta ? `<span>${u.etykieta}</span>` : ""}</div>`;
  }
  let pp = "";
  if (u.przejscie === "przez_postac" && u.wyciecie && uj[n + 1]) {
    const s0 = uj[n + 1].start, Z = r3(u.end - s0);
    const v = `<video id="u${u.i}-ppv" class="clip uj-media" src="${u.wyciecie}" data-start="${r3(s0)}" data-duration="${Z}" data-media-start="${r3(u.od + (s0 - u.start) * u.tempo)}"${u.tempo !== 1 ? ` data-playback-rate="${u.tempo}"` : ""} data-track-index="${80 + u.i}" muted playsinline></video>`;
    pp = `\n        <div id="u${u.i}-pp" class="uj-fx">${wKadrze(u.kadr, v)}</div>`;
  }
  return `      <div id="u${u.i}-w" class="uj" style="z-index:${z}">\n        <div id="u${u.i}-fx" class="uj-fx">${wKadrze(u.kadr, `<div id="u${u.i}-m" class="uj-m">${el}${(obiektyUj[u.i] || []).join("")}${(ozdobyUj[u.i] || []).join("")}</div>`)}</div>${pp}\n      </div>`;
}).join("\n");
const audioHtml = audio.map((a) => `      <audio id="${a.id}" class="clip" src="${a.src}" data-start="${r3(a.start)}" data-duration="${a.dur}"${a.od ? ` data-media-start="${r3(a.od)}"` : ""} data-track-index="${a.id === "vo" ? 3 : 4}" data-volume="${vol(a.vol)}"${a.fadeOut ? ` data-fade-out="${a.fadeOut}"` : ""}${a.automation ? ` data-automation='${a.automation}'` : ""}></audio>`).join("\n");

const html = `<!doctype html>
<!-- WYGENEROWANE przez scripts/zloz.mjs z rolka.json (${new Date().toISOString().slice(0, 16)}). Zmiany rób w rolka.json i uruchom: npm run zloz -->
<html lang="pl" data-resolution="portrait">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=${W}, height=${H}" />
    <script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
    <style>
      ${fontFace}:root {
        --akcent: ${k.akcent || "#B07A6E"};
        --akcent-2: ${k.akcent_2 || "#8C6B5D"};
        --tekst: ${k.tekst || "#2B2321"};
        --tlo-jasne: ${k.tlo_jasne || "#F7F1EC"};
        --nude: ${k.nude || "#E9D9CF"};
        --bialy: ${k.bialy || "#FFFFFF"};
        --granat: ${k.granat || k.tekst || "#2B2321"};
        --tekst-2: ${k.tekst_2 || k.akcent_2 || "#8C6B5D"};
        --zloto-jasne: ${k.zloto_jasne || k.akcent || "#B07A6E"};
        --cta: ${k.cta || k.akcent || "#B07A6E"};
        --mocny: ${k.mocny || k.tekst || "#2B2321"};
        --akwarela: ${k.akwarela || k.nude || "#E9D9CF"};
        --font-naglowki: "${f.naglowki || "Playfair Display"}";
        --font-tekst: "${f.tekst || "Montserrat"}";
        --ruch-wejscie: "${RUCH.we}";
        --ruch-wyjscie: "${RUCH.wy}";
        --ruch-akcent: "${RUCH.ak}";
        --ruch-plynny: "${RUCH.pl}";
        --safe-top: ${sz.gora ?? 220}px;
        --safe-bottom: ${sz.dol ?? 420}px;
        --safe-right: ${sz.prawo ?? 140}px;
        --safe-left: ${sz.lewo ?? 60}px;
        --napisy-od-dolu: ${np.od_dolu ?? sz.napisy_od_dolu ?? 620}px;
      }
      * { margin: 0; padding: 0; box-sizing: border-box; }
      html, body { width: ${W}px; height: ${H}px; overflow: hidden; background: #000; }
      #tlo { position: absolute; inset: 0; background: var(--tekst); }
      .uj { position: absolute; inset: 0; transform-origin: 50% 45%; }
      .uj-media { position: absolute; left: 0; top: 0; width: ${W}px; height: ${H}px; object-fit: cover; transform-origin: 50% 40%; }
      .uj-fx { position: absolute; inset: 0; }
      .uj-m { position: absolute; left: 0; top: 0; width: ${W}px; height: ${H}px; transform-origin: 50% 40%; }
      .ob-w { position: absolute; left: 0; top: 0; width: ${W}px; height: ${H}px; }
      .ob-v { position: absolute; left: 0; top: 0; width: ${W}px; height: ${H}px; object-fit: cover; }
      .ob-c { position: absolute; left: 0; top: 0; width: ${W}px; height: ${H}px; background: rgba(24, 16, 14, 1); opacity: 0; }
      .ob-t { position: absolute; left: var(--safe-left); right: var(--safe-right); text-align: center; font-family: var(--font-naglowki), serif; font-weight: 700; font-size: 104px; line-height: 1.02; color: var(--bialy); text-shadow: 0 6px 30px rgba(0, 0, 0, 0.35); }
      .ob-t em { font-style: italic; color: var(--zloto-jasne); }
      .tw { position: absolute; left: 0; top: 0; width: ${W}px; height: ${H}px; pointer-events: none; }
      .tw-in { position: absolute; inset: 0; }
      .tw-svg { position: absolute; left: 0; top: 0; overflow: visible; filter: drop-shadow(0 2px 5px rgba(0, 0, 0, 0.45)); }
      .tw-linia { stroke: var(--bialy); fill: none; stroke-linecap: round; stroke-dasharray: 1; stroke-dashoffset: 1; }
      .tw-kropka { fill: var(--akcent); stroke: var(--bialy); }
      .tw-nos { fill: var(--bialy); }
      .tw-obrys { stroke: var(--bialy); fill: color-mix(in srgb, var(--akcent) 22%, transparent); fill-opacity: 0; stroke-linejoin: round; stroke-linecap: round; stroke-dasharray: 1; stroke-dashoffset: 1; }
      .tw-obrys.tw-rzesy { fill: none; stroke: var(--akcent); }
      .tw-etyk { position: absolute; left: 0; top: 0; width: 0; height: 0; }
      .tw-etyk span { position: absolute; left: 0; top: 0; translate: -50% -50%; font-family: var(--font-tekst), sans-serif; font-weight: 700; font-size: calc(30px * var(--tw-s)); line-height: 1; white-space: nowrap; background: var(--akcent); color: #fff; padding: 0.22em 0.6em; border-radius: 999px; box-shadow: 0 4px 14px rgba(0, 0, 0, 0.3); }
      .uj-kadr { position: absolute; inset: 0; overflow: hidden; }
      .uj-kadr-in { position: absolute; left: 0; top: 0; width: ${W}px; height: ${H}px; transform-origin: 0 0; }
      .uj-kolor { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; }
      .sl { position: absolute; left: 0; top: 0; width: 0; height: 0; }
      .sl-in { position: absolute; left: 0; top: 0; width: 0; height: 0; }
      .sl-sk { position: absolute; left: 0; top: 0; width: 0; height: 0; transform-origin: 0 0; }
      .sl-kolko { position: absolute; left: -85px; top: -85px; width: 170px; height: 170px; border-radius: 50%; border: 8px solid var(--bialy); box-shadow: 0 0 0 3px var(--akcent), 0 8px 30px rgba(0, 0, 0, 0.35); }
      .sl-punkt { position: absolute; left: -20px; top: -20px; width: 40px; height: 40px; border-radius: 50%; background: var(--akcent); border: 6px solid var(--bialy); box-shadow: 0 6px 20px rgba(0, 0, 0, 0.35); }
      .sl-punkt.maly { left: -13px; top: -13px; width: 26px; height: 26px; border-width: 5px; }
      .sl-strzalka { position: absolute; left: 0; bottom: 30px; transform: translateX(-50%); display: flex; flex-direction: column; align-items: center; gap: 6px; color: var(--bialy); filter: drop-shadow(0 6px 16px rgba(0, 0, 0, 0.45)); }
      .sl-strzalka span, .sl-etykieta span { font-family: var(--font-tekst), sans-serif; font-weight: 700; font-size: 40px; white-space: nowrap; background: var(--akcent); color: #fff; padding: 8px 22px; border-radius: 999px; }
      .sl-etykieta { position: absolute; left: 0; bottom: 34px; transform: translateX(-50%); padding-bottom: 60px; background: linear-gradient(var(--bialy), var(--bialy)) no-repeat 50% 100% / 5px 60px; }
      .uj-kolor span { font-family: var(--font-tekst), sans-serif; font-size: 40px; font-weight: 600; color: rgba(43, 35, 33, 0.45); letter-spacing: 0.08em; text-transform: uppercase; }
    </style>
  </head>
  <body>
    <div id="root" data-composition-id="main" data-start="0" data-duration="${D}" data-width="${W}" data-height="${H}" data-fps="${FPS}"${!ef.rozmycie_ruchu ? "" : ` data-motion-blur="on" data-motion-blur-shutter="180" data-motion-blur-phase="0"`}>
      <div id="tlo" class="clip" data-start="0" data-duration="${D}" data-track-index="0"></div>
${svgFiltry.length ? `      <svg width="0" height="0" style="position:absolute" aria-hidden="true" data-motion-blur="off"><defs>${svgFiltry.join("")}</defs></svg>\n` : ""}${ujHtml}
${audioHtml}
${[...przebitkiHtml, ...efektyHtml].map((h) => "      " + h).join("\n")}
${hosty.join("\n")}
    </div>
    <script>
      window.__timelines = window.__timelines || {};
      gsap.config({ force3D: false }); // 2D: rozmycie ruchu HyperFrames pomija elementy z transformacją 3D
      const tl = gsap.timeline({ paused: true });
      ${tweens.join("\n      ")}
      tl.set({}, {}, ${D});
      window.__timelines["main"] = tl;
    </script>
  </body>
</html>
`;
fs.writeFileSync(INDEX, html, "utf8");
// Dla kontroli hooka: co widać w 1. klatce, słowa w czasie rolki, scena z tekstem hooka.
const hookSc = sceny.filter((x) => x.szablon === "hook-tytul").sort((a, b) => Number(a.start || 0) - Number(b.start || 0))[0];
const u0k = uj[0];
fs.writeFileSync(STAN, JSON.stringify({ indexHash: hash(INDEX), data: new Date().toISOString(), dlugosc: D,
  pierwszyKadr: zajawka ? { src: zajawka.src, od: zajawka.od ?? 0, zajawka: true, czas: ZAJ } : u0k ? { src: u0k.zrodlo || null, od: u0k.od, typ: u0k.typ, tempo: u0k.tempo, kadr: u0k.kadr || null } : null,
  pierwszeUjecie: u0k ? { src: u0k.zrodlo || null, od: u0k.od, start: u0k.start, dur: u0k.dur, tempo: u0k.tempo, typ: u0k.typ } : null,
  hookScena: hookSc ? { start: Number(hookSc.start || 0), czas: Number(hookSc.czas || 0), tekst: hookSc.dane?.tekst || "" } : null,
  slowa: slowaPelne.map((w) => [w.text, w.start, w.end]) }, null, 1));

ok(`Złożono ${path.relative(ROOT, INDEX)}`);
if (NAT) info(`  montaż naturalny (jak vlog): ${NAT.zmiany.length ? NAT.zmiany.join(" · ") : "nic do zmiany"}`);
info(`  długość: ${String(Math.round(D * 10) / 10).replace(".", ",")} s · ujęcia: ${uj.length} · sceny: ${sceny.length} · słowa w napisach: ${liczbaSlow} · audio: ${audio.map((a) => a.id).join(", ") || "brak (dźwięk z ujęć albo brak)"}`);
if (efektyOpis.length) info(`  efekty: ${efektyOpis.join(" · ")}`);
if (!audio.some((a) => a.id === "muzyka")) info("  muzyka: brak w renderze (dodaj z biblioteki z licencją albo w aplikacji Instagrama).");

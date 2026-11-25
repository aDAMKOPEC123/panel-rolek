// Panel graficzny do montażu rolek. Lokalny serwer Node bez zależności.
//   npm run panel   ->  http://localhost:4321
// Panel tylko wywołuje skrypty z scripts/ i edytuje brief.md, rolka.json, napisy/transcript.json.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import os from "node:os";
import { spawn, spawnSync } from "node:child_process";
import {
  ROOT, PROJEKTY, ARCHIWUM, SZABLONY_HF, KATEGORIE, wczytajConfig, czytajBrief, ustawWBrief, ffprobe,
  ROZSZ_WIDEO, ROZSZ_AUDIO, ROZSZ_OBRAZ, IS_WIN,
} from "../scripts/lib.mjs";
import { policz as policzAlgorytm, skladnikiRolki, przepisDlaClaude } from "../scripts/algorytm.mjs";
import { czytajBank, zapiszBank } from "../scripts/bank-hookow.mjs";
import { wlaczTelefon, wylaczTelefon, stanTelefonu } from "./telefon.mjs";
import { czytajProfil as czytajProfilGab, maProfil as maProfilGab, zapiszProfil as zapiszProfilGab, profilZeStrony } from "../scripts/gabinet.mjs";
import { stanLicencji, maLicencje, aktywuj as aktywujLicencje, dezaktywuj as dezaktywujLicencje } from "../scripts/licencja.mjs";
import { zapiszProfil, oznaczKreator, stanKreatora, sprawdzProgramy } from "./kreator.mjs";
import { PLAN_DIR, plikPlanu, poniedzialek, okazje as okazjePlanu } from "../scripts/plan-tygodnia.mjs";
import { PROPOZYCJE } from "../scripts/szybkie-pomysly.mjs";
import { miesiac as miesiacKal, przenies as przeniesKal, dodajWlasny as dodajWlasnyKal, usunWpis as usunWpisKal, ustawWpis as ustawWpisKal, ics as icsKal, wszystkiePlany, zapiszTerminy, wpisZJakoscia, pobierzWpisPlanu, sprawdzWpisDoRecenzji, podpisWersjiWpisu, zapiszPoprawkeWpisu } from "../scripts/kalendarz.mjs";
import { TYPY_PUBLIKACJI, CELE_PUBLIKACJI, czyRolka } from "../scripts/publikacje.mjs";
import { zapiszJakoPomysl } from "../scripts/pomysly-ai.mjs";
import { czytajPytania, dodajPytanie, usunPytanie, czytajGrafik, zapiszGrafik } from "../scripts/kontekst-rolek.mjs";
import { stanIG, polacz as polaczIG, rozlacz as rozlaczIG, synchronizuj as synchronizujIG, przypisz as przypiszIG, rolkiIG } from "../scripts/instagram.mjs";
import { listaStylow, wczytajStyl, zapiszStyl, nowyStyl, usunStyl, ustawDlaNowych, zapiszPlikStylu, stylZeStrony, zastosujStyl } from "../scripts/style-marki.mjs";
import { STYLE_MONTAZU, stylMontazu } from "../scripts/style-montazu.mjs";
import { TYPY_ZDARZEN, STATUSY_MATERIALOW, POCHODZENIE, WYTYCZNE_REZYSERII, normalizujRezyserie, porzadkujRezyserie } from "../scripts/rezyseria-montazu.mjs";
import { zapiszDokumentRezyserii } from "../scripts/rezyseruj.mjs";
import { podpisMontazuAutopilota, stanAudytuAutopilota } from "../scripts/audyt-autopilota.mjs";
import { CHARAKTERY_MONTAZU, EFEKTY, NARZEDZIA_MONTAZU, dostepneNarzedzia, ograniczeniaEfektow } from "../scripts/opcje-montazu.mjs";
import { kontekstAI, promptKontekstuAI, czytajPreferencjeAI, zapiszPreferencjeAI } from "../scripts/kontekst-ai.mjs";
import { wczytajDopasowaniaUjec } from "../scripts/dopasuj-ujecia.mjs";
import { pokazJakoscPublikacji } from "../scripts/jakosc-publikacji.mjs";

globalThis.__ROLKI_RZUCAJ = true;
const PORT = Number(process.env.PANEL_PORT || 4321);
const HOST = "127.0.0.1";
const PUB = path.join(ROOT, "panel", "public");
const CACHE = path.join(ROOT, "panel", ".cache");
fs.mkdirSync(CACHE, { recursive: true });

// ---------- bezpieczeństwo ścieżek ----------
function bezpieczna(rel) {
  if (typeof rel !== "string" || !rel) throw blad400("Brak ścieżki.");
  const p = path.resolve(ROOT, rel);
  if (p !== ROOT && !p.startsWith(ROOT + path.sep)) throw blad400("Ścieżka spoza folderu projektu.");
  return p;
}
function projektDir(nazwa) {
  if (!nazwa || /[\\/]|\.\./.test(nazwa)) throw blad400("Zła nazwa projektu.");
  const p = path.join(PROJEKTY, nazwa);
  if (!fs.existsSync(p)) throw Object.assign(new Error(`Nie ma projektu ${nazwa}.`), { status: 404 });
  return p;
}
function blad400(msg) { return Object.assign(new Error(msg), { status: 400 }); }
const rel = (p) => path.relative(ROOT, p).split(path.sep).join("/");

// ---------- odpowiedzi ----------
function json(res, data, status = 200) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(JSON.stringify(data));
}
async function body(req) {
  let s = "";
  for await (const c of req) { s += c; if (s.length > 20e6) throw blad400("Za duże dane."); }
  return s ? JSON.parse(s) : {};
}
const MIME = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".json": "application/json", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp",
  ".svg": "image/svg+xml", ".mp4": "video/mp4", ".mov": "video/quicktime", ".m4v": "video/mp4", ".webm": "video/webm",
  ".wav": "audio/wav", ".mp3": "audio/mpeg", ".m4a": "audio/mp4", ".aac": "audio/aac",
};
function plik(req, res, p) {
  if (!fs.existsSync(p) || !fs.statSync(p).isFile()) { res.writeHead(404); return res.end("Nie ma pliku"); }
  const st = fs.statSync(p);
  const type = MIME[path.extname(p).toLowerCase()] || "application/octet-stream";
  const range = req.headers.range;
  if (range) {
    const [a, b] = range.replace(/bytes=/, "").split("-");
    const start = Number(a), end = b ? Number(b) : st.size - 1;
    res.writeHead(206, { "Content-Range": `bytes ${start}-${end}/${st.size}`, "Accept-Ranges": "bytes", "Content-Length": end - start + 1, "Content-Type": type });
    return fs.createReadStream(p, { start, end }).pipe(res);
  }
  res.writeHead(200, { "Content-Length": st.size, "Content-Type": type, "Accept-Ranges": "bytes", "Cache-Control": "no-cache" });
  fs.createReadStream(p).pipe(res);
}

// ---------- media: meta, miniatury, paski klatek ----------
const metaCache = new Map();
function meta(p) {
  const st = fs.statSync(p);
  const k = p + st.mtimeMs;
  if (metaCache.has(k)) return metaCache.get(k);
  let m = { typ: "inny", rozmiar: st.size, data: st.mtime.toISOString() };
  if (ROZSZ_WIDEO.test(p) || ROZSZ_AUDIO.test(p)) {
    try {
      const f = ffprobe(p);
      const v = f.raw.streams.find((s) => s.codec_type === "video");
      m = { ...m, typ: f.hasVideo ? "wideo" : "audio", czas: +f.duration.toFixed(2), szer: f.width, wys: f.height, fps: +f.fps.toFixed(2), obrot: f.rotation, dzwiek: f.hasAudio,
        hdr: /arib-std-b67|smpte2084/.test(v?.color_transfer || ""),
        poziome: f.hasVideo && (f.rotation === 90 || f.rotation === 270 ? f.height > f.width : f.width > f.height) };
    } catch { m.typ = "uszkodzony"; }
  } else if (ROZSZ_OBRAZ.test(p)) m.typ = "zdjecie";
  metaCache.set(k, m);
  return m;
}
function cachePlik(p, tag, ext) {
  const st = fs.statSync(p);
  return path.join(CACHE, crypto.createHash("sha1").update(p + st.mtimeMs + tag).digest("hex") + ext);
}
function miniatura(p, t, w = 240) {
  const out = cachePlik(p, `thumb${t}_${w}`, ".jpg");
  if (fs.existsSync(out)) return out;
  const args = ROZSZ_OBRAZ.test(p)
    ? ["-y", "-v", "error", "-i", p, "-vf", `scale=${w}:-2`, "-frames:v", "1", out]
    : ["-y", "-v", "error", "-ss", String(t), "-i", p, "-vf", `scale=${w}:-2`, "-frames:v", "1", "-q:v", "4", out];
  let r = spawnSync("ffmpeg", args);
  if (!fs.existsSync(out) && !ROZSZ_OBRAZ.test(p)) r = spawnSync("ffmpeg", ["-y", "-v", "error", "-i", p, "-vf", `scale=${w}:-2`, "-frames:v", "1", out]);
  return fs.existsSync(out) ? out : null;
}
function pasek(p) {
  // klatka co 1 s, w jednym rzędzie (maks. 60)
  const out = cachePlik(p, "strip", ".jpg");
  if (fs.existsSync(out)) return out;
  const m = meta(p);
  const n = Math.max(1, Math.min(60, Math.ceil(m.czas || 1)));
  spawnSync("ffmpeg", ["-y", "-v", "error", "-i", p, "-vf", `fps=1,scale=96:-2,tile=${n}x1`, "-frames:v", "1", "-q:v", "5", out]);
  return fs.existsSync(out) ? out : null;
}

// ---------- projekty ----------
function listaPlikow(dir, filtr) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((n) => !/^readme\.md$/i.test(n) && !n.startsWith(".") && fs.statSync(path.join(dir, n)).isFile() && (!filtr || filtr.test(n))).sort();
}
function okladkaLubMiniatura(proj) {
  const ok = path.join(proj, "final", "okladka.jpg");
  if (fs.existsSync(ok)) return rel(ok);
  for (const d of ["proxy", "raw"]) {
    const f = listaPlikow(path.join(proj, d), /\.(mp4|mov|jpg|png)$/i)[0];
    if (f) return rel(path.join(proj, d, f));
  }
  return null;
}
function projekty() {
  return fs.readdirSync(PROJEKTY).filter((n) => !n.startsWith("_") && fs.statSync(path.join(PROJEKTY, n)).isDirectory()).sort().reverse().map((n) => {
    const p = path.join(PROJEKTY, n);
    let pola = {};
    try { pola = czytajBrief(p).pola; } catch {}
    return { nazwa: n, data: n.slice(0, 10), kategoria: pola["kategoria"] || n.split("_")[1] || "", tytul: pola["tytuł roboczy"] || n, status: pola["status"] || "", miniatura: okladkaLubMiniatura(p) };
  });
}
function sekcje(txt) {
  const out = {};
  const parts = txt.split(/^## /m);
  for (const part of parts.slice(1)) {
    const nl = part.indexOf("\n");
    out[part.slice(0, nl).trim()] = part.slice(nl + 1).replace(/<!--[\s\S]*?-->/g, "").trim();
  }
  return out;
}
function ustawSekcje(proj, tytul, tresc) {
  const p = path.join(proj, "brief.md");
  let txt = fs.readFileSync(p, "utf8");
  const re = new RegExp(`(^## ${tytul.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[^\\n]*\\n)([\\s\\S]*?)(?=^## |(?![\\s\\S]))`, "m");
  if (re.test(txt)) txt = txt.replace(re, `$1${tresc.trim()}\n\n`);
  else txt += `\n## ${tytul}\n${tresc.trim()}\n`;
  fs.writeFileSync(p, txt, "utf8");
}
function projektInfo(nazwa) {
  const p = projektDir(nazwa);
  const { pola, txt } = czytajBrief(p);
  const rj = path.join(p, "kompozycja", "rolka.json");
  let rolka = null;
  try { rolka = JSON.parse(fs.readFileSync(rj, "utf8")); } catch {}
  const pliki = {};
  for (const d of ["raw", "proxy", "wyciete", "audio", "napisy", "render", "final", "wzor"]) {
    pliki[d] = listaPlikow(path.join(p, d)).map((n) => ({ nazwa: n, sciezka: rel(path.join(p, d, n)), ...((ROZSZ_WIDEO.test(n) || ROZSZ_AUDIO.test(n) || ROZSZ_OBRAZ.test(n)) ? meta(path.join(p, d, n)) : {}) }));
  }
  const zrodlo = fs.existsSync(path.join(p, "napisy", "zrodlo.txt")) ? fs.readFileSync(path.join(p, "napisy", "zrodlo.txt"), "utf8").trim() : null;
  const rolkaZmiana = fs.existsSync(rj) ? fs.statSync(rj).mtime.toISOString() : null;
  const wdir = path.join(p, "final", "warianty");
  pliki.warianty = listaPlikow(wdir).filter((n) => /\.mp4$/i.test(n)).map((n) => ({ nazwa: n, sciezka: rel(path.join(wdir, n)), ...meta(path.join(wdir, n)) }));
  let scenariusz = null;
  scenariusz = pokazDokumentScenariusza(czytajJson(path.join(p, "scenariusz.json"), null));
  const obraz = czytajJson(path.join(p, "proxy", ".obraz.json"), {});
  const kontrolaHooka = czytajJson(path.join(p, "kompozycja", "hook.json"), null);
  const wyniki = czytajJson(path.join(p, "final", "wyniki.json"), null);
  const vlog = czytajJson(path.join(p, "kompozycja", "vlog.json"), null);
  const rozpoznanie = czytajJson(path.join(p, "kompozycja", "rozpoznanie.json"), null);
  const kontrolaObrazu = czytajJson(path.join(p, "kompozycja", "kontrola-obrazu.json"), null);
  let skladniki = null;
  try { skladniki = czytajJson(path.join(p, "final", "skladniki.json"), null) || skladnikiRolki(p); } catch {}
  const audytAutopilota = stanAudytuAutopilota(p);
  const dopasowaniaUjec = wczytajDopasowaniaUjec(p, scenariusz);
  return { nazwa, sciezka: rel(p), pola, sekcje: sekcje(txt), rolka, rolkaZmiana, pliki, zrodloNapisow: zrodlo, scenariusz, obraz, kontrolaHooka, wyniki, skladniki, vlog, rozpoznanie, kontrolaObrazu, audytAutopilota, dopasowaniaUjec };
}

// ---------- szablony, formaty, hooki, checklista ----------
function szablony() {
  const dir = path.join(SZABLONY_HF, "compositions");
  return fs.readdirSync(dir).filter((n) => n.endsWith(".html")).map((n) => {
    const html = fs.readFileSync(path.join(dir, n), "utf8");
    const id = n.replace(".html", "");
    let zmienne = [];
    const m = html.match(/data-composition-variables='([\s\S]*?)'/);
    if (m) { try { zmienne = JSON.parse(m[1]); } catch {} }
    const sloty = [...html.matchAll(/<(img|video)[^>]*data-slot-media="([^"]+)"/g)].map((x) => ({ klucz: x[2], typ: x[1] === "img" ? "obraz" : "wideo" }));
    const opis = (html.match(/<!--\s*\n?\s*[\w-]+:\s*([^\n]*)/) || [])[1] || "";
    const czas = Number((html.match(/data-composition-duration="([\d.]+)"/) || [])[1] || 3);
    const tytul = ((html.match(/<title>([^<]*)<\/title>/) || [])[1] || "").trim();
    return { id, opis: opis.trim(), zmienne, sloty, czas, tytul, wlasny: id.startsWith("moj-") };
  });
}
function formaty() {
  const p = path.join(ROOT, ".claude", "skills", "rolki-beauty", "references", "formaty-rolek.md");
  const txt = fs.readFileSync(p, "utf8");
  return txt.split(/^## /m).slice(1).map((s) => {
    const tytul = s.slice(0, s.indexOf("\n")).trim();
    const wiersze = [...s.matchAll(/^\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*([^|]*?)\s*\|\s*$/gm)].map((m) => ({ czas: m[1], co: m[2].replace(/`/g, ""), szablon: m[3].replace(/`/g, "") })).filter((w) => !/^-+$/.test(w.czas) && w.czas !== "czas");
    const uwagi = s.split("\n").filter((l) => l.trim() && !l.startsWith("|") && !l.startsWith("#")).slice(1).join(" ");
    return { tytul, nr: Number(tytul.split(".")[0]), wiersze, uwagi };
  });
}
function hooki() {
  const p = path.join(ROOT, ".claude", "skills", "rolki-beauty", "references", "hooki-beauty.md");
  const txt = fs.readFileSync(p, "utf8");
  const out = {};
  let grupa = null, typ = null;
  for (const l of txt.split("\n")) {
    if (l.startsWith("## ")) { grupa = /podolog/i.test(l) ? "podologia" : /kosmetolog/i.test(l) ? "kosmetologia" : /gabinet/i.test(l) ? "gabinet" : null; typ = null; continue; }
    if (l.startsWith("### ")) { typ = l.slice(4).trim(); continue; }
    const m = l.match(/^(?:\d+\.|-)\s+(.*)$/);
    if (m && grupa) (out[grupa] ||= []).push({ typ: typ || "", tekst: m[1].trim() });
  }
  return out;
}
function checklista() {
  const txt = fs.readFileSync(path.join(ROOT, "docs", "CHECKLISTA_PUBLIKACJI.md"), "utf8");
  const out = [];
  let grupa = "";
  for (const l of txt.split("\n")) {
    if (l.startsWith("## ")) grupa = l.slice(3).trim();
    const m = l.match(/^- \[ \] (.*)$/);
    if (m) out.push({ grupa, tekst: m[1].replace(/`/g, "") });
  }
  return out;
}
function archiwum() {
  const p = path.join(ARCHIWUM, "wyniki.csv");
  if (!fs.existsSync(p)) return { kolumny: [], wiersze: [] };
  const linie = fs.readFileSync(p, "utf8").replace(/^﻿/, "").trim().split(/\r?\n/);
  const kolumny = linie[0].split(";");
  return { kolumny, wiersze: linie.slice(1).map((l) => l.split(";")) };
}
function biblioteka() {
  const dir = path.join(ROOT, "03_BIBLIOTEKA", "muzyka");
  return listaPlikow(dir, ROZSZ_AUDIO).map((n) => ({ nazwa: n, sciezka: path.join(dir, n), licencja: fs.existsSync(path.join(dir, n + ".LICENCJA.txt")) }));
}

// ---------- zadania w tle (SSE) ----------
const SKRYPTY = new Set(["plan-tygodnia", "szybkie-pomysly", "nowa-rolka", "inbox", "normalizuj", "transkrybuj", "wytnij-tlo", "zloz", "render", "okladka", "sprawdz", "archiwizuj", "podglad", "dopasuj-kwestie", "warianty-hooka", "vlog", "stabilizuj", "sledz", "ulepsz", "zwolnij", "bity", "kolor", "wzor", "przejscia-ai", "recenzent", "turniej-hookow", "dopracuj", "kontrola-hooka", "research-hook", "twarz", "obiekt", "rozpoznaj", "akcja", "kontrola-obrazu"]);
const zadania = new Map();
const czysc = (s) => s.replace(/\x1b\[[0-9;]*[A-Za-z]/g, "");
function noweZadanie(opis, cmd, args, opts = {}) {
  const id = crypto.randomUUID().slice(0, 8);
  const z = { id, opis, projekt: opts.projekt || null, start: Date.now(), linie: [], postep: null, koniec: false, kod: null, sluchacze: new Set(), wynik: "" };
  zadania.set(id, z);
  const emit = (ev) => { for (const s of z.sluchacze) s.write(`data: ${JSON.stringify(ev)}\n\n`); };
  const linia = (raw, parser) => {
    const t = czysc(raw).trimEnd();
    if (!t) return;
    const proc = t.match(/(\d{1,3})%/);
    if (proc) { z.postep = Math.min(100, Number(proc[1])); emit({ postep: z.postep }); if (/█|░|▏|Rendering|Capturing/i.test(t) && z.linie.length && /(\d{1,3})%/.test(z.linie[z.linie.length - 1])) { z.linie[z.linie.length - 1] = t; emit({ zamien: t }); return; } }
    if (parser?.(t, z) === null) return;
    z.linie.push(t);
    if (z.linie.length > 2000) z.linie.shift();
    emit({ linia: t });
  };
  const koniec = (kod) => {
    z.koniec = true; z.kod = kod; z.czasKonca = Date.now();
    emit({ koniec: true, kod, wynik: z.wynik, sesja: z.sesja, audyt: z.audyt });
    for (const s of z.sluchacze) s.end();
  };
  const etap = (exe, parametry, { parser, stdin, shell }, po) => {
    const ch = spawn(exe, parametry, { cwd: ROOT, env: { ...process.env, FORCE_COLOR: "0", NO_COLOR: "1" }, windowsHide: true, shell: !!shell });
    z.proc = ch;
    if (stdin != null) {
      ch.stdin.on("error", () => {});
      ch.stdin.end(stdin);
    }
    const bufory = [ch.stdout, ch.stderr].map((strumien) => {
      let bufor = "";
      strumien.setEncoding("utf8");
      strumien.on("data", (d) => {
        const czesci = (bufor + d).split(/\r?\n|\r/);
        bufor = czesci.pop();
        czesci.forEach((l) => linia(l, parser));
      });
      return () => { if (bufor) linia(bufor, parser); };
    });
    ch.on("error", (e) => { linia("✗ BŁĄD: " + e.message); });
    ch.on("close", (kod) => { bufory.forEach((spusc) => spusc()); po(kod); });
  };
  etap(cmd, args, opts, (kod) => {
    if (z.bladClaude && kod === 0) kod = 1;
    try {
      const kontynuacja = kod === 0 && !z.przerwano && opts.kontynuuj?.(z);
      if (!kontynuacja) return koniec(kod);
      linia("Autopilot sprawdza montaż i porównuje poprawki…");
      etap(process.execPath, [path.join(ROOT, "scripts", "audyt-autopilota.mjs"), kontynuacja], {}, (wynik) => {
        z.audyt = stanAudytuAutopilota(kontynuacja);
        koniec(wynik);
      });
    } catch (e) { linia("✗ BŁĄD: " + e.message); koniec(1); }
  });
  return z;
}
function uruchomSkrypt(skrypt, args, projekt) {
  if (!SKRYPTY.has(skrypt)) throw blad400("Nieznany skrypt.");
  if (!Array.isArray(args) || args.some((a) => typeof a !== "string")) throw blad400("Złe argumenty.");
  return noweZadanie(`${skrypt} ${args.join(" ")}`, process.execPath, [path.join(ROOT, "scripts", `${skrypt}.mjs`), ...args], { projekt });
}
const zadanieJson = (z) => ({ id: z.id, opis: z.opis, projekt: z.projekt, start: z.start, koniec: z.koniec, kod: z.kod, postep: z.postep, linie: z.linie.slice(-400) });

function odczytajPodglad(linia, zadanie) {
  if (!linia.startsWith("POPRAWKA ")) return;
  zadanie.wynik = linia.slice("POPRAWKA ".length);
  return null;
}
const konflikt = (tekst) => Object.assign(new Error(tekst), { status: 409 });

function notatkaPreferencji(tresc) {
  if (typeof tresc !== "string" || !tresc.trim() || tresc.length > 240) throw blad400("Podaj zasadę w maksymalnie 240 znakach.");
  return { klucz: crypto.randomUUID(), tresc: tresc.trim() };
}

function preferencjaPoprawki(b) {
  if (!b.zapamietaj) return null;
  if (!["marka", "projekt"].includes(b.zapamietaj)) throw blad400("Wybierz zakres zapisu preferencji.");
  return notatkaPreferencji(b.zasada);
}

// ---------- Claude ----------
let claudeBin = null;
function claudeDostepny() {
  if (claudeBin !== null) return claudeBin;
  const r = spawnSync(IS_WIN ? "where" : "which", ["claude"], { encoding: "utf8" });
  const kandydaci = (r.stdout || "").split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  claudeBin = kandydaci.find((k) => /\.exe$/i.test(k)) || kandydaci.find((k) => /\.cmd$/i.test(k)) || kandydaci[0] || "";
  return claudeBin;
}
// sesja: id rozmowy z poprzedniej odpowiedzi (asystent z pytaniami) -> --resume, Claude pamięta rozmowę.
function claudeZadanie(prompt, projekt, sesja, autopilot = null) {
  const bin = claudeDostepny();
  if (!bin) throw blad400("Komenda claude nie jest zainstalowana. Użyj „Kopiuj prompt”.");
  const args = ["-p", "--output-format", "stream-json", "--verbose", "--permission-mode", "acceptEdits",
    "--allowedTools", "Read", "Edit", "Write", "Glob", "Grep", "Skill",
    "Bash(npm run:*)", "Bash(npx hyperframes:*)", "Bash(ffmpeg:*)", "Bash(ffprobe:*)", "Bash(node scripts/:*)", "Bash(ls:*)", "Bash(cat:*)"];
  if (sesja) args.unshift("--resume", sesja);
  return noweZadanie("Claude", bin, args, {
    projekt, stdin: prompt, shell: /\.cmd$/i.test(bin),
    kontynuuj(z) {
      if (!autopilot || !z.wynik) return null;
      const ostatnia = z.wynik.trim().split(/\r?\n/).at(-1);
      if (/^MONTA[ŻZ] DO KONTROLI\s*\.?$/i.test(ostatnia)) return autopilot.proj;
      // Starsze sesje proszą o final po wygenerowaniu wersji roboczej.
      const koniecMontazu = /^(GOTOWE\s*\.?|OPCJE\s*:.*\b(robimy final|finalizuj|zrób final)\b.*)$/i.test(ostatnia);
      if (koniecMontazu && autopilot.podpis !== podpisMontazuAutopilota(autopilot.proj)) return autopilot.proj;
      return null;
    },
    parser: (t, z) => {
      let j;
      try { j = JSON.parse(t); } catch { return t; }
      if (j.session_id) z.sesja = j.session_id;
      const pokaz = [];
      if (j.type === "assistant") {
        for (const c of j.message?.content || []) {
          if (c.type === "text" && c.text.trim()) pokaz.push(c.text.trim());
          if (c.type === "tool_use") pokaz.push(`› ${c.name}${c.input?.command ? ": " + String(c.input.command).slice(0, 120) : c.input?.file_path ? ": " + path.basename(c.input.file_path) : ""}`);
        }
      } else if (j.type === "result") {
        z.wynik = j.result || "";
        z.bladClaude = j.is_error === true;
        pokaz.push(j.is_error ? "✗ Claude zakończył z błędem." : "✓ Claude skończył.");
      }
      for (const l of pokaz.join("\n").split("\n")) { z.linie.push(l); for (const s of z.sluchacze) s.write(`data: ${JSON.stringify({ linia: l })}\n\n`); }
      return null;
    },
  });
}

// ---------- pomysły na rolki (rozmowa z Claude -> profil, scenariusz, lista materiałów) ----------
// Szkic: 01_PROJEKTY/_pomysly/<id>/pomysl.json (pisze Claude) + rozmowa.json (pisze panel).
// Po "Utwórz rolkę" pomysl.json trafia do projektu jako scenariusz.json, a szkic znika.
const POMYSLY = path.join(PROJEKTY, "_pomysly");
const pustyPomysl = (id, tryb) => ({
  id, tryb, utworzono: new Date().toISOString(), etap: "profil", projekt: null,
  profil: { pomysl: "", temat: "", kategoria: "", zabieg: "", cel: "", odbiorca: "", emocja: "", format: "", kto_mowi: "", twarz_klientki: "", dlugosc: "", cta: "" },
  hooki: [], utrzymanie: [], scenariusz: [], materialy: [], efekty: {}, uwagi: "",
});
function pomyslDir(id) {
  if (!/^[\w-]{6,40}$/.test(String(id || ""))) throw blad400("Zły identyfikator pomysłu.");
  const d = path.join(POMYSLY, id);
  if (!fs.existsSync(d)) throw Object.assign(new Error("Nie ma takiego pomysłu."), { status: 404 });
  return d;
}
const czytajJson = (p, dom) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return dom; } };
const piszJson = (p, d) => fs.writeFileSync(p, JSON.stringify(d, null, 2) + "\n", "utf8");
function pokazDokumentScenariusza(P) {
  return Array.isArray(P?.scenariusz) ? { ...P, scenariusz: porzadkujRezyserie(P.scenariusz) } : P;
}
function pomysly() {
  if (!fs.existsSync(POMYSLY)) return [];
  return fs.readdirSync(POMYSLY).filter((n) => fs.existsSync(path.join(POMYSLY, n, "pomysl.json"))).sort().reverse().map((n) => {
    const p = czytajJson(path.join(POMYSLY, n, "pomysl.json"), {});
    return { id: n, etap: p.etap || "profil", tytul: p.profil?.temat || p.profil?.pomysl || "Nowy pomysł", kategoria: p.profil?.kategoria || "", hook: (p.hooki || []).find((h) => h.wybrany)?.tekst || p.hooki?.[0]?.tekst || "", data: (p.utworzono || "").slice(0, 10) };
  });
}
function pomyslInfo(id) {
  const d = pomyslDir(id);
  return { id, sciezka: rel(path.join(d, "pomysl.json")), pomysl: pokazDokumentScenariusza(czytajJson(path.join(d, "pomysl.json"), null)), rozmowa: czytajJson(path.join(d, "rozmowa.json"), { sesja: null, wiadomosci: [] }), recenzja: czytajJson(path.join(d, "recenzja.json"), null), turniej: czytajJson(path.join(d, "turniej.json"), null), historia: czytajJson(path.join(d, "historia.json"), null) };
}
// Zapis wgranego pliku strumieniem (duże wideo z telefonu).
async function zapiszStrumien(req, cel) {
  fs.mkdirSync(path.dirname(cel), { recursive: true });
  const tmp = cel + ".czesc";
  try {
    await new Promise((ok, zle) => {
      const w = fs.createWriteStream(tmp);
      req.pipe(w);
      w.on("finish", ok); w.on("error", zle); req.on("error", zle);
      // zerwane połączenie (np. telefon stracił Wi-Fi): bez tego obietnica wisi, a plik zostaje niedokończony
      req.on("close", () => { if (!req.complete) { w.destroy(); zle(blad400("Wysyłanie przerwane.")); } });
    });
  } catch (e) { fs.rmSync(tmp, { force: true }); throw e; }
  fs.renameSync(tmp, cel);
}
const bezpiecznaNazwa = (n) => String(n || "plik").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/ł/g, "l").replace(/Ł/g, "L").replace(/[^\w.-]+/g, "_").slice(-80);
function tabelaScenariusza(sc) {
  const t = (x) => String(x ?? "").replace(/\|/g, "/").replace(/\n/g, " ");
  const czas = (s) => { const v = Number(s) || 0; return `0:${String(Math.floor(v)).padStart(2, "0")}`; };
  return "| # | timecode | materiał | co widać | tekst na ekranie / co mówi |\n|---|---|---|---|---|\n" +
    sc.map((w, i) => `| ${i + 1} | ${czas(w.od)}-${czas(w.do)} | ${t(w.material)} | ${t(w.co_widac)} | ${t([w.na_ekranie && `EKRAN: ${w.na_ekranie}`, w.mowisz && `MÓWISZ: ${w.mowisz}`].filter(Boolean).join(" · "))} |`).join("\n");
}
function utworzZPomyslu(id) {
  const d = pomyslDir(id);
  const P = pokazDokumentScenariusza(czytajJson(path.join(d, "pomysl.json"), null));
  if (!P) throw blad400("Pomysł nie ma jeszcze pliku pomysl.json.");
  const pr = P.profil || {};
  const kat = String(pr.kategoria || "").toLowerCase().replace(/ę/g, "e").replace(/[^a-z]/g, "");
  if (!KATEGORIE.includes(kat)) throw blad400(`Profil nie ma poprawnej kategorii (jest: "${pr.kategoria || "brak"}"). Dostępne: ${KATEGORIE.join(", ")}.`);
  const temat = String(pr.temat || pr.pomysl || "").trim().slice(0, 70);
  if (!temat) throw blad400("Profil nie ma tematu rolki.");
  const r = spawnSync(process.execPath, [path.join(ROOT, "scripts", "nowa-rolka.mjs"), kat, temat], { cwd: ROOT, encoding: "utf8" });
  const nazwa = ((r.stdout || "") + (r.stderr || "")).match(/Nowa rolka: 01_PROJEKTY\/(\S+)/)?.[1];
  if (!nazwa) throw blad400("Nie udało się utworzyć rolki: " + czysc((r.stdout || "") + (r.stderr || "")).slice(-300));
  const proj = path.join(PROJEKTY, nazwa);
  const cel = /sprzeda/i.test(pr.cel) ? "sprzedaż zabiegu" : /eduk/i.test(pr.cel) ? "edukacja" : /zasi/i.test(pr.cel) ? "zasięg" : (pr.cel || "TODO");
  ustawWBrief(proj, "cel", cel);
  if (pr.dlugosc) ustawWBrief(proj, "długość", String(pr.dlugosc).replace(/[^\d-]/g, "") || "15-30");
  if (pr.kto_mowi) ustawWBrief(proj, "voiceover", /lektor/i.test(pr.kto_mowi) ? "tak, lektor" : /nie|bez/i.test(pr.kto_mowi) ? "nie" : "tak, mówi do kamery");
  if (P.algorytm?.tryb) ustawWBrief(proj, "algorytm", ["zwykly", "moj", "mieszany"].includes(P.algorytm.tryb) ? P.algorytm.tryb : "mieszany");
  ustawWBrief(proj, "rolka na próbę", P.algorytm?.proba ? "tak" : "nie");
  if (pr.twarz_klientki) ustawWBrief(proj, "twarz klientki w kadrze", /^tak/i.test(pr.twarz_klientki) ? "tak" : "nie");
  const hooki = [...(P.hooki || [])].sort((a, b) => (b.wybrany ? 1 : 0) - (a.wybrany ? 1 : 0));
  if (hooki.length) ustawSekcje(proj, "Hook (3 warianty)", hooki.slice(0, 3).map((h, i) => `${i + 1}. ${h.tekst}${h.wybrany ? " (wybrany)" : ""}`).join("\n"));
  if (P.scenariusz?.length) ustawSekcje(proj, "Scenariusz / lista ujęć", tabelaScenariusza(P.scenariusz));
  if (pr.cta) ustawSekcje(proj, "CTA", pr.cta);
  const tele = (P.materialy || []).flatMap((m) => {
    const kw = (Array.isArray(m.teleprompter) ? m.teleprompter : []).map((k) => (typeof k === "string" ? { tekst: k } : k)).filter((k) => k?.tekst);
    return kw.length ? [`**${m.id} · ${m.nazwa_pliku || m.opis || ""}**`, ...kw.map((k, i) => `${i + 1}. ${k.kiedy ? `(${k.kiedy}) ` : ""}${k.tekst}`), ""] : [];
  });
  if (tele.length) ustawSekcje(proj, "Teleprompter (co mówisz w nagraniach)", tele.join("\n"));
  const nazwy = (P.materialy || []).map((m) => `- ${m.id}: ${m.nazwa_pliku || m.id} · ${m.opis || ""}`);
  if (nazwy.length) ustawSekcje(proj, "Materiały i nazwy plików", nazwy.join("\n"));
  const notatki = [`- pomysł: ${pr.pomysl || temat}`, pr.odbiorca && `- dla kogo: ${pr.odbiorca}`, pr.emocja && `- emocja / ton: ${pr.emocja}`, pr.format && `- format: ${pr.format}`,
    ...(P.utrzymanie || []).map((u) => `- utrzymanie: ${u}`), P.uwagi && `- uwagi: ${P.uwagi}`, "- materiały do dostarczenia: scenariusz.json (panel, krok Nagrania)"].filter(Boolean);
  ustawSekcje(proj, "Notatki", notatki.join("\n"));
  // efekty z planu utrzymania do rolka.json
  const rj = path.join(proj, "kompozycja", "rolka.json");
  const rr = fs.existsSync(rj) ? czytajJson(rj, null) : null;
  if (rr) {
    if (P.efekty && Object.keys(P.efekty).length) rr.efekty = { ...(rr.efekty || {}), ...P.efekty };
    if (P.montaz === "naturalny") rr.montaz = "naturalny";
    // zastępczy hook z szablonu rolki wylatuje, wchodzi wybrany hook; CTA z profilu
    let sc = (rr.sceny || []).filter((s) => !(s.szablon === "hook-tytul" && /todo/i.test(s.dane?.tekst || "")));
    if (hooki[0]) sc = [{ szablon: "hook-tytul", start: 0, czas: 2, dane: { tekst: hooki[0].tekst, wariant: "slowa" } }, ...sc.filter((s) => s.szablon !== "hook-tytul")];
    if (pr.cta) sc.filter((s) => s.szablon === "cta-koncowe").forEach((s) => ((s.dane ||= {}).tekst = pr.cta));
    rr.sceny = sc;
    piszJson(rj, rr);
  }
  P.etap = "utworzona"; P.projekt = nazwa;
  // dzień z planu tygodnia, z którego był ten pomysł, wskazuje teraz na rolkę
  if (fs.existsSync(PLAN_DIR)) for (const n of fs.readdirSync(PLAN_DIR).filter((x) => /\.json$/.test(x))) {
    const pl = czytajJson(path.join(PLAN_DIR, n), null);
    const dz = pl?.dni?.find((x) => x.pomysl === id);
    if (dz) { dz.projekt = nazwa; dz.stan = "scenariusz"; piszJson(path.join(PLAN_DIR, n), pl); }
  }
  piszJson(path.join(proj, "scenariusz.json"), P);
  if (fs.existsSync(path.join(d, "rozmowa.json"))) fs.copyFileSync(path.join(d, "rozmowa.json"), path.join(proj, "rozmowa-pomysl.json"));
  fs.rmSync(d, { recursive: true, force: true });
  return { projekt: nazwa };
}

// ---------- router ----------
const trasy = [];
const trasa = (metoda, wzor, fn) => trasy.push({ metoda, wzor, fn });

trasa("GET", /^\/api\/start$/, () => {
  const licencja = stanLicencji();
  if (!licencja.aktywna) return { licencja };
  const cfg = wczytajConfig();
  const styleMontazu = STYLE_MONTAZU.map(({ id, nazwa, opis, kadr, wskazowka }) => ({ id, nazwa, opis, kadr, wskazowka }));
  const rezyseria = { typy: TYPY_ZDARZEN, statusy: STATUSY_MATERIALOW, pochodzenie: POCHODZENIE, prompt: WYTYCZNE_REZYSERII };
  const opcjeMontazu = { efekty: EFEKTY, narzedzia: NARZEDZIA_MONTAZU };
  return { licencja, config: { kolory: cfg.kolory, fonty: cfg.fonty, gabinet: cfg.gabinet, napisy: cfg.napisy, cta: cfg.cta, rolka: cfg.rolka, ruch: cfg.ruch }, kategorie: KATEGORIE, claude: !!claudeDostepny(), kreator: stanKreatora(), styleMontazu, rezyseria, opcjeMontazu, publikacje: { formaty: TYPY_PUBLIKACJI, cele: CELE_PUBLIKACJI } };
});
// Profil gabinetu (scripts/gabinet.mjs): wywiad w kreatorze i odczyt strony www przez Claude
trasa("GET", /^\/api\/gabinet$/, () => ({ profil: czytajProfilGab(), jest: maProfilGab() }));
trasa("PUT", /^\/api\/gabinet$/, async (m, req) => zapiszProfilGab(await body(req)));
trasa("POST", /^\/api\/gabinet\/ze-strony$/, async (m, req) => { try { return await profilZeStrony((await body(req)).url); } catch (e) { throw blad400(e.message); } });
// Licencja (scripts/licencja.mjs): bez aktywnego kodu działają tylko te trasy i /api/start
trasa("GET", /^\/api\/licencja$/, () => stanLicencji());
trasa("POST", /^\/api\/licencja$/, async (m, req) => { try { return aktywujLicencje((await body(req)).kod); } catch (e) { throw blad400(e.message); } });
trasa("DELETE", /^\/api\/licencja$/, () => dezaktywujLicencje());
// Stylistyka rolek (scripts/style-marki.mjs): zestawy kolorów, fontów, logo i marki. Rolka wybiera polem rolka.json -> styl.
trasa("GET", /^\/api\/style$/, () => listaStylow());
trasa("POST", /^\/api\/style$/, async (m, req) => { const s = nowyStyl(await body(req)); return listaStylow().find((x) => x.id === s.id); });
trasa("PUT", /^\/api\/styl\/([\w-]+)$/, async (m, req) => { if (!wczytajStyl(m[1])) throw blad400("Nie ma takiej stylistyki."); zapiszStyl(m[1], await body(req)); return listaStylow().find((x) => x.id === m[1]); });
trasa("DELETE", /^\/api\/styl\/([\w-]+)$/, (m) => { try { usunStyl(m[1]); } catch (e) { throw blad400(e.message); } return { ok: true }; });
trasa("POST", /^\/api\/styl\/([\w-]+)\/dla-nowych$/, (m) => { try { ustawDlaNowych(m[1]); } catch (e) { throw blad400(e.message); } return listaStylow(); });
// Logo albo znak wodny: POST /api/styl/<id>/plik?rodzaj=logo|watermark&nazwa=logo.png (body = plik)
trasa("POST", /^\/api\/styl\/([\w-]+)\/plik$/, async (m, req, url) => {
  const czesci = []; let n = 0;
  for await (const c of req) { n += c.length; if (n > 8e6) throw blad400("Plik za duży (maks. 8 MB)."); czesci.push(c); }
  try { zapiszPlikStylu(m[1], url.searchParams.get("rodzaj"), path.extname(url.searchParams.get("nazwa") || ".png"), Buffer.concat(czesci)); } catch (e) { throw blad400(e.message); }
  return listaStylow().find((x) => x.id === m[1]);
});
// Stylistyka ze strony www: {url} -> propozycja do podglądu (nic nie zapisuje), potem /zapisz tworzy zestaw z logo.
const logaZeStron = new Map();
const TYP_LOGO = { ".png": "image/png", ".svg": "image/svg+xml", ".webp": "image/webp", ".jpg": "image/jpeg" };
trasa("POST", /^\/api\/style\/strona$/, async (m, req) => {
  const d = await body(req);
  let W;
  try { W = await stylZeStrony(d.url); } catch (e) { throw blad400(`Nie udało się odczytać strony: ${e.message}`); }
  const klucz = crypto.randomBytes(6).toString("hex");
  if (W.logo) { logaZeStron.set(klucz, W.logo); setTimeout(() => logaZeStron.delete(klucz), 30 * 60e3).unref(); }
  return { ...W.dane, paleta: W.paleta, fonty_strony: W.fonty_strony, logo_klucz: W.logo ? klucz : null, logo_skad: W.logo?.skad || null,
    logo_podglad: W.logo ? `data:${TYP_LOGO[W.logo.ext]};base64,${W.logo.buf.toString("base64")}` : null };
});
trasa("POST", /^\/api\/style\/strona\/zapisz$/, async (m, req) => {
  const d = await body(req);
  const s = nowyStyl(d);
  const L = d.logo_klucz && logaZeStron.get(d.logo_klucz);
  if (L) zapiszPlikStylu(s.id, "logo", L.ext, L.buf);
  return listaStylow().find((x) => x.id === s.id);
});
trasa("GET", /^\/api\/projekty$/, () => projekty());
trasa("GET", /^\/api\/projekt\/([^/]+)$/, (m) => projektInfo(decodeURIComponent(m[1])));
trasa("PUT", /^\/api\/projekt\/([^/]+)\/brief$/, async (m, req) => {
  const p = projektDir(decodeURIComponent(m[1]));
  const b = await body(req);
  for (const [k, v] of Object.entries(b.pola || {})) ustawWBrief(p, k, String(v).replace(/\n/g, " "));
  for (const [k, v] of Object.entries(b.sekcje || {})) ustawSekcje(p, k, String(v));
  return { ok: true };
});
trasa("PUT", /^\/api\/projekt\/([^/]+)\/rolka$/, async (m, req) => {
  const p = projektDir(decodeURIComponent(m[1]));
  const b = await body(req);
  if (!b || typeof b !== "object" || !Array.isArray(b.ujecia)) throw blad400("rolka.json musi mieć tablicę ujecia.");
  fs.mkdirSync(path.join(p, "kompozycja"), { recursive: true });
  const plik = path.join(p, "kompozycja", "rolka.json");
  fs.writeFileSync(plik, JSON.stringify(b, null, 2) + "\n", "utf8");
  return { ok: true, zmiana: fs.statSync(plik).mtime.toISOString() };
});
trasa("POST", /^\/api\/projekt\/([^/]+)\/szukaj-ujec$/, async (m, req) => {
  const nazwa = decodeURIComponent(m[1]);
  projektDir(nazwa);
  const b = await body(req);
  const tekst = typeof b?.tekst === "string" ? b.tekst.trim() : "";
  if (tekst.length < 2 || tekst.length > 250 || tekst.includes("\0")) throw blad400("Wpisz opis od 2 do 250 znaków.");
  if ([...zadania.values()].some((z) => z.szukajUjec && !z.koniec)) {
    throw Object.assign(new Error("Wyszukiwanie już trwa. Spróbuj po jego zakończeniu."), { status: 409 });
  }
  const z = noweZadanie("Wyszukiwanie fragmentów", process.execPath, [
    path.join(ROOT, "scripts", "szukaj-ujec.mjs"), nazwa, `--tekst=${tekst}`,
  ], {
    projekt: nazwa,
    parser(linia, zadanie) {
      if (!linia.startsWith("WYNIKI ")) return;
      zadanie.wynik = linia.slice("WYNIKI ".length);
      return null;
    },
  });
  z.szukajUjec = true;
  return zadanieJson(z);
});
// ?plik=slowa/M1_x.json: słowa jednego nagrania (napisy z kilku plików), inaczej napisy/transcript.json
const plikNapisow = (p, url) => { const q = url?.searchParams.get("plik"); if (q && !/^slowa\/[\w.-]+\.json$/.test(q)) throw blad400("Zły plik napisów."); return path.join(p, "napisy", q || "transcript.json"); };
trasa("GET", /^\/api\/projekt\/([^/]+)\/kwestie$/, (m) => czytajJson(path.join(projektDir(decodeURIComponent(m[1])), "napisy", "kwestie.json"), null));
trasa("PUT", /^\/api\/projekt\/([^/]+)\/kwestie$/, async (m, req) => {
  const p = projektDir(decodeURIComponent(m[1]));
  const b = await body(req);
  if (!b || !Array.isArray(b.kwestie)) throw blad400("Złe kwestie.");
  piszJson(path.join(p, "napisy", "kwestie.json"), b);
  return { ok: true };
});
trasa("GET", /^\/api\/projekt\/([^/]+)\/napisy$/, (m, req, url) => {
  const p = projektDir(decodeURIComponent(m[1]));
  const f = plikNapisow(p, url);
  return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, "utf8")) : [];
});
trasa("PUT", /^\/api\/projekt\/([^/]+)\/napisy$/, async (m, req, url) => {
  const p = projektDir(decodeURIComponent(m[1]));
  const f = plikNapisow(p, url);
  const stare = JSON.parse(fs.readFileSync(f, "utf8"));
  const nowe = await body(req);
  if (!Array.isArray(nowe) || nowe.length !== stare.length) throw blad400("Zmieniać można tylko tekst słów, nie ich liczbę.");
  // Czasów nie ruszamy: bierzemy tylko pole text.
  stare.forEach((w, i) => { w.text = String(nowe[i].text || "").trim() || w.text; });
  fs.writeFileSync(f, JSON.stringify(stare, null, 1) + "\n", "utf8");
  return { ok: true };
});
// pomysły
trasa("GET", /^\/api\/pomysly$/, () => pomysly());
trasa("POST", /^\/api\/pomysly$/, async (m, req) => {
  const b = await body(req);
  const d0 = new Date();
  const id = `${d0.toISOString().slice(0, 10)}_${d0.toTimeString().slice(0, 8).replace(/:/g, "")}`;
  const d = path.join(POMYSLY, id);
  if (fs.existsSync(d)) throw blad400("Spróbuj jeszcze raz za sekundę.");
  fs.mkdirSync(d, { recursive: true });
  piszJson(path.join(d, "pomysl.json"), pustyPomysl(id, b.tryb === "propozycja" ? "propozycja" : "pomysl"));
  piszJson(path.join(d, "rozmowa.json"), { sesja: null, wiadomosci: [] });
  return pomyslInfo(id);
});
trasa("GET", /^\/api\/pomysl\/([\w-]+)$/, (m) => pomyslInfo(m[1]));
function plikRezyserii(rodzaj, id) {
  const d = rodzaj === "pomysl" ? pomyslDir(id) : projektDir(id);
  return path.join(d, rodzaj === "pomysl" ? "pomysl.json" : "scenariusz.json");
}
function briefZProjektu(projekt, dokument, rolka, pola) {
  dokument ??= czytajJson(path.join(projekt, "scenariusz.json"), null);
  rolka ??= czytajJson(path.join(projekt, "kompozycja", "rolka.json"), null);
  const audyt = stanAudytuAutopilota(projekt);
  const uwagi = audyt?.aktualny ? [...(audyt.recenzja?.uwagi || []), ...(audyt.obraz?.problemy || [])] : [];
  return kontekstAI({ projekt, dokument, rolka, pola, uwagi, dopasowanie: wczytajDopasowaniaUjec(projekt, dokument) });
}

trasa("GET", /^\/api\/brief-ai$/, (m, req, url) => {
  const nazwa = url.searchParams.get("projekt"), id = url.searchParams.get("pomysl");
  const projekt = nazwa ? projektDir(nazwa) : null;
  const katalog = id && !projekt ? pomyslDir(id) : null;
  const brief = projekt ? briefZProjektu(projekt) : kontekstAI({ katalog, dokument: katalog ? czytajJson(path.join(katalog, "pomysl.json"), null) : null });
  return { brief, tekst: promptKontekstuAI(brief), pamiec: { marka: czytajPreferencjeAI(), projekt: projekt ? czytajPreferencjeAI(projekt) : [] } };
});
trasa("POST", /^\/api\/preferencje-ai$/, async (m, req) => {
  const b = await body(req);
  if (!["marka", "projekt"].includes(b?.zakres)) throw blad400("Wybierz zakres preferencji.");
  const katalog = b.zakres === "projekt" ? projektDir(b.projekt) : null;
  if (b.usun && !czytajPreferencjeAI(katalog).some((p) => p.klucz === b.usun)) throw blad400("Nie ma takiej preferencji.");
  const pozycja = b.usun ? { klucz: b.usun, tresc: "" } : notatkaPreferencji(b.tresc);
  return { preferencje: zapiszPreferencjeAI(katalog, [pozycja]) };
});
trasa("POST", /^\/api\/projekt\/([^/]+)\/dopasuj-ujecia$/, (m) => {
  const nazwa = decodeURIComponent(m[1]), projekt = projektDir(nazwa), plik = path.join(projekt, "scenariusz.json");
  if (!czytajJson(plik, null)?.scenariusz?.length) throw blad400("Najpierw zapisz scenariusz.");
  if ([...zadania.values()].some((z) => z.rezyseria === plik && !z.koniec)) throw konflikt("Reżyseria lub dopasowanie już trwa.");
  const z = noweZadanie("Dopasowanie ujęć do scen", process.execPath, [path.join(ROOT, "scripts", "dopasuj-ujecia.mjs"), projekt, "--odswiez"], { projekt: nazwa });
  z.rezyseria = plik;
  return zadanieJson(z);
});
trasa("PUT", /^\/api\/(pomysl|projekt)\/([^/]+)\/rezyseria\/(\d+)$/, async (m, req) => {
  const plik = plikRezyserii(m[1], decodeURIComponent(m[2]));
  const b = await body(req);
  const P = czytajJson(plik, null);
  const i = Number(m[3]), scena = P?.scenariusz?.[i];
  if (!scena) throw blad400("Nie ma takiej sceny.");
  if (b?.wersja !== JSON.stringify(porzadkujRezyserie([scena])[0])) {
    throw Object.assign(new Error("Scena się zmieniła. Odśwież ją przed zapisem."), { status: 409 });
  }
  let rezyseria;
  try { rezyseria = normalizujRezyserie(b.rezyseria, scena); }
  catch (e) { throw blad400(e.message); }
  P.scenariusz[i] = { ...scena, rezyseria };
  zapiszDokumentRezyserii(plik, P);
  return { scena: P.scenariusz[i] };
});
trasa("POST", /^\/api\/(pomysl|projekt)\/([^/]+)\/rezyseria$/, async (m, req) => {
  const id = decodeURIComponent(m[2]);
  const plik = plikRezyserii(m[1], id);
  const { zakres } = (await body(req)) || {};
  if (!["braki", "wszystko"].includes(zakres) && !(Number.isSafeInteger(zakres) && zakres >= 0)) throw blad400("Wybierz scenę lub zakres regeneracji.");
  if (!Array.isArray(czytajJson(plik, null)?.scenariusz)) throw blad400("Najpierw zapisz scenariusz.");
  if ([...zadania.values()].some((z) => z.rezyseria === plik && !z.koniec)) {
    throw Object.assign(new Error("Reżyseria tego scenariusza już się generuje."), { status: 409 });
  }
  const z = noweZadanie("Reżyseria montażu", process.execPath, [path.join(ROOT, "scripts", "rezyseruj.mjs"), plik, String(zakres)], { projekt: m[1] === "projekt" ? id : null });
  z.rezyseria = plik;
  return zadanieJson(z);
});
trasa("PUT", /^\/api\/pomysl\/([\w-]+)$/, async (m, req) => {
  const d = pomyslDir(m[1]);
  const b = await body(req);
  if (!b || typeof b !== "object" || !b.profil) throw blad400("Zły pomysł.");
  piszJson(path.join(d, "pomysl.json"), b);
  return { ok: true };
});
trasa("PUT", /^\/api\/pomysl\/([\w-]+)\/rozmowa$/, async (m, req) => {
  const d = pomyslDir(m[1]);
  const b = await body(req);
  piszJson(path.join(d, "rozmowa.json"), { sesja: b.sesja || null, wiadomosci: Array.isArray(b.wiadomosci) ? b.wiadomosci.slice(-200) : [] });
  return { ok: true };
});
// Bank hooków z researchu (03_BIBLIOTEKA/research/hooki.json): odczyt i usuwanie; dodawanie = zadanie research-hook (Claude).
trasa("GET", /^\/api\/research\/hooki$/, () => czytajBank());
trasa("DELETE", /^\/api\/research\/hook\/([\w-]+)$/, (m) => { const B = czytajBank(); B.hooki = B.hooki.filter((h) => h.id !== m[1]); zapiszBank(B); return B; });
// Cofnięcie do wersji z historia.json (pętla „Dopracuj do maksimum”). Obecna wersja też trafia do historii.
trasa("POST", /^\/api\/pomysl\/([\w-]+)\/cofnij$/, async (m, req) => {
  const d = pomyslDir(m[1]);
  const b = await body(req);
  const H = czytajJson(path.join(d, "historia.json"), { wersje: [] });
  const v = H.wersje[Number(b.i)];
  if (!v?.wersja) throw blad400("Nie ma takiej wersji.");
  const P = czytajJson(path.join(d, "pomysl.json"), null);
  if (!P) throw blad400("Pomysł nie ma pliku pomysl.json.");
  const POLA = ["hooki", "utrzymanie", "scenariusz", "materialy"];
  H.wersje.push({ data: new Date().toISOString(), zrodlo: "przed cofnięciem", wynik: null, zmiany: [`stan sprzed cofnięcia do wersji z ${String(v.data).slice(0, 16).replace("T", " ")}`], wersja: Object.fromEntries(POLA.map((k) => [k, P[k]])) });
  piszJson(path.join(d, "historia.json"), H);
  for (const k of POLA) if (v.wersja[k] !== undefined) P[k] = v.wersja[k];
  piszJson(path.join(d, "pomysl.json"), P);
  return pomyslInfo(m[1]);
});
trasa("DELETE", /^\/api\/pomysl\/([\w-]+)$/, (m) => { fs.rmSync(pomyslDir(m[1]), { recursive: true, force: true }); return { ok: true }; });
trasa("POST", /^\/api\/pomysl\/([\w-]+)\/utworz$/, (m) => utworzZPomyslu(m[1]));
// Dowolne nagranie do raw/ projektu (autopilot: „wrzuć nagrania”): POST /api/projekt/<nazwa>/raw?nazwa=IMG_1.mov
// Nazwa zostaje (bezpieczne znaki), przy kolizji _2, _3. Tylko wideo, zdjęcia i dźwięk.
trasa("POST", /^\/api\/projekt\/([^/]+)\/raw$/, (m, req, url) => wgrajRaw(decodeURIComponent(m[1]), url.searchParams.get("nazwa"), req));
// Telefon przez kod QR (panel/telefon.mjs): osobny serwer w sieci Wi-Fi, tylko wgrywanie, włączany z panelu.
const apiTelefonu = {
  marka: () => { const c = wczytajConfig(); return { nazwa: c.gabinet?.nazwa || "Panel rolek", osoba: c.gabinet?.osoba || "", akcent: c.kolory?.akcent || "#b07a6e" }; },
  // ostatnio zmieniane rolki na górze (brief, rolka.json, scenariusz albo nowe nagrania)
  rolki: () => projekty().map((p) => {
    const d = path.join(PROJEKTY, p.nazwa);
    const zm = Math.max(...["brief.md", "scenariusz.json", "kompozycja/rolka.json", "raw"].map((f) => { try { return fs.statSync(path.join(d, f)).mtimeMs; } catch { return 0; } }));
    const sc = czytajJson(path.join(d, "scenariusz.json"), null);
    return { nazwa: p.nazwa, tytul: /^todo$/i.test(p.tytul) ? p.nazwa : p.tytul, data: /^\d{4}-\d{2}-\d{2}$/.test(p.data) ? p.data : "", kategoria: /^todo$/i.test(p.kategoria) ? "" : p.kategoria, status: p.status, materialy: sc?.materialy?.length || 0, zm };
  }).sort((a, b) => b.zm - a.zm).slice(0, 12),
  materialy: (projekt) => {
    const p = projektDir(projekt);
    const sc = czytajJson(path.join(p, "scenariusz.json"), null);
    const pola = (() => { try { return czytajBrief(p).pola; } catch { return {}; } })();
    return {
      nazwa: projekt, tytul: pola["tytuł roboczy"] || projekt,
      nagrania: listaPlikow(path.join(p, "raw")).length,
      materialy: (sc?.materialy || []).map((m) => ({
        id: m.id, nazwa_pliku: m.nazwa_pliku, typ: m.typ, opis: m.opis, jak: m.jak, czas: m.czas, obowiazkowy: m.obowiazkowy !== false,
        teleprompter: (Array.isArray(m.teleprompter) ? m.teleprompter : []).map((k) => (typeof k === "string" ? { tekst: k } : k)).filter((k) => k?.tekst),
        // pliki wpisane do scenariusza + nagrania z prefiksem materiału w raw/ (np. po „Przypisz” z rozpoznania)
        wgrane: new Set([...(m.pliki || []).filter((f) => fs.existsSync(path.join(p, f))), ...listaPlikow(path.join(p, "raw")).filter((n) => n.toLowerCase().startsWith(String(m.id).toLowerCase() + "_")).map((n) => `raw/${n}`)]).size,
      })),
    };
  },
  wgrajMaterial, wgrajRaw,
  wgrajInbox: async (nazwaOrg, req) => {
    const org = bezpiecznaNazwa(nazwaOrg || "nagranie.mp4");
    if (!/\.(mp4|mov|m4v|webm|jpe?g|png|webp|heic|m4a|mp3|wav)$/i.test(org)) throw blad400("To nie jest nagranie ani zdjęcie.");
    const dir = path.join(ROOT, "00_INBOX"), ext = path.extname(org), baza = org.slice(0, -ext.length);
    let nazwa = org;
    for (let n = 2; fs.existsSync(path.join(dir, nazwa)); n++) nazwa = `${baza}_${n}${ext}`;
    await zapiszStrumien(req, path.join(dir, nazwa));
    return { ok: true, plik: `00_INBOX/${nazwa}` };
  },
};
// Kreator pierwszego uruchomienia (panel/kreator.mjs, panel/public/kreator.js)
trasa("GET", /^\/api\/kreator$/, () => { const c = wczytajConfig(); return { ...stanKreatora(), gabinet: c.gabinet, cta: c.cta }; });
trasa("PUT", /^\/api\/profil$/, async (m, req) => zapiszProfil(await body(req)));
trasa("POST", /^\/api\/kreator\/gotowe$/, async (m, req) => oznaczKreator((await body(req)).zrobiony !== false));
trasa("GET", /^\/api\/programy$/, () => sprawdzProgramy(claudeDostepny()));
// logo odczytane ze strony (POST /api/style/strona) -> do istniejącego zestawu, np. głównej marki
trasa("POST", /^\/api\/styl\/([\w-]+)\/logo-ze-strony$/, async (m, req) => {
  const L = logaZeStron.get((await body(req)).logo_klucz);
  if (!L) throw blad400("Logo wygasło, odczytaj stronę jeszcze raz.");
  try { zapiszPlikStylu(m[1], "logo", L.ext, L.buf); } catch (e) { throw blad400(e.message); }
  return listaStylow().find((x) => x.id === m[1]);
});
// „3 gotowe pomysły” (scripts/szybkie-pomysly.mjs, generator pomysly-ai.mjs): propozycje do wyboru, „Wybieram” = zwykły pomysł
trasa("GET", /^\/api\/propozycje$/, () => czytajJson(PROPOZYCJE, { propozycje: [] }));
trasa("POST", /^\/api\/propozycje\/wybierz\/(\d+)$/, (m) => {
  const Z = czytajJson(PROPOZYCJE, null);
  const P = Z?.propozycje?.[Number(m[1])];
  if (!P) throw blad400("Nie ma takiej propozycji. Wymyśl nowe.");
  if (P.wybrana) return pomyslInfo(P.wybrana);
  const id = zapiszJakoPomysl(P, { tryb: "szybki", zrodlo: "3 gotowe pomysły" });
  P.wybrana = id;
  piszJson(PROPOZYCJE, Z);
  return pomyslInfo(id);
});
// Bank pytań klientek (kontekst-rolek.mjs) i grafik zabiegów na najbliższe dni
trasa("GET", /^\/api\/pytania$/, () => czytajPytania());
trasa("POST", /^\/api\/pytania$/, async (m, req) => { try { return dodajPytanie(await body(req)); } catch (e) { throw blad400(e.message); } });
trasa("DELETE", /^\/api\/pytania\/(\w+)$/, (m) => usunPytanie(m[1]));
trasa("GET", /^\/api\/grafik$/, () => czytajGrafik());
trasa("PUT", /^\/api\/grafik$/, async (m, req) => zapiszGrafik((await body(req)).wpisy));
// Wyniki z Instagrama (scripts/instagram.mjs). Token nigdy nie wraca do przeglądarki.
trasa("GET", /^\/api\/instagram$/, () => {
  const s = stanIG();
  if (!s.polaczony) return s;
  const R = rolkiIG().rolki || [];
  return { ...s, rolki_lista: R.map((r) => ({ id: r.id, permalink: r.permalink, timestamp: r.timestamp, caption: String(r.caption || "").slice(0, 120), thumbnail_url: r.thumbnail_url, projekt: r.projekt || null, dopasowano: r.dopasowano || null, statystyki: r.statystyki || null, blad: r.blad || null })) };
});
trasa("POST", /^\/api\/instagram\/polacz$/, async (m, req) => { try { const s = await polaczIG((await body(req)).token); synchronizujIG().catch(() => {}); return s; } catch (e) { throw blad400(e.message); } });
trasa("POST", /^\/api\/instagram\/rozlacz$/, () => rozlaczIG());
trasa("POST", /^\/api\/instagram\/sync$/, async () => { try { return await synchronizujIG(); } catch (e) { throw blad400(e.message); } });
trasa("POST", /^\/api\/instagram\/przypisz$/, async (m, req) => { const b = await body(req); try { przypiszIG(b.media_id, b.projekt); return { ok: true }; } catch (e) { throw blad400(e.message); } });
// Kalendarz miesiąca (scripts/kalendarz.mjs): plany, opublikowane z wynikami, rolki z IG, okazje, grafik; przenoszenie, własne wpisy, .ics
trasa("GET", /^\/api\/kalendarz$/, (m, req, url) => miesiacKal(url.searchParams.get("m")));
trasa("POST", /^\/api\/kalendarz\/przenies$/, async (m, req) => { const b = await body(req); try { return przeniesKal(b.id, b.data); } catch (e) { throw blad400(e.message); } });
trasa("POST", /^\/api\/kalendarz\/dodaj$/, async (m, req) => { try { return dodajWlasnyKal(await body(req)); } catch (e) { throw blad400(e.message); } });
trasa("POST", /^\/api\/kalendarz\/terminy$/, async (m, req) => { try { return zapiszTerminy(await body(req)); } catch (e) { throw blad400(e.message); } });
trasa("PUT", /^\/api\/kalendarz\/wpis\/(\w+)$/, async (m, req) => { try { return ustawWpisKal(m[1], await body(req)); } catch (e) { throw blad400(e.message); } });
trasa("DELETE", /^\/api\/kalendarz\/wpis\/(\w+)$/, (m) => { try { return usunWpisKal(m[1]); } catch (e) { throw blad400(e.message); } });
trasa("POST", /^\/api\/kalendarz\/wpis\/(\w+)\/recenzja$/, (m) => {
  const id = m[1];
  try { sprawdzWpisDoRecenzji(id); } catch (e) { throw blad400(e.message); }
  const aktywne = [...zadania.values()].find((z) => z.recenzjaPublikacji === id && !z.koniec);
  if (aktywne) return zadanieJson(aktywne);
  const z = noweZadanie("Recenzja planu publikacji", process.execPath, [path.join(ROOT, "scripts", "recenzja-publikacji.mjs"), id]);
  z.recenzjaPublikacji = id;
  return zadanieJson(z);
});
trasa("POST", /^\/api\/kalendarz\/wpis\/(\w+)\/poprawka$/, async (m, req) => {
  const id = m[1], { zrodlo, numer } = (await body(req)) || {};
  let wpis;
  try { wpis = pobierzWpisPlanu(id); } catch (e) { throw blad400(e.message); }
  const raport = pokazJakoscPublikacji(wpis);
  const uwagi = zrodlo === "ai" ? raport?.recenzja?.ai?.uwagi : zrodlo === "lokalne" ? raport?.lokalne : null;
  const uwaga = Number.isSafeInteger(numer) && uwagi?.[numer];
  if (!uwaga?.element || !wpis.plan_tresci?.[uwaga.element - 1]) throw blad400("Wybierz aktualną uwagę do elementu rozpiski.");
  if ([...zadania.values()].some((z) => z.poprawka?.id === id && !z.koniec)) throw konflikt("Claude już przygotowuje zmianę tego wpisu.");
  const z = noweZadanie("Poprawka publikacji", process.execPath, [path.join(ROOT, "scripts", "recenzja-publikacji.mjs"), "--poprawka"], {
    stdin: JSON.stringify({ wpis, uwaga }), parser: odczytajPodglad,
  });
  z.poprawka = { rodzaj: "publikacja", id, podpis: podpisWersjiWpisu(wpis), element: uwaga.element };
  return zadanieJson(z);
});
trasa("PUT", /^\/api\/kalendarz\/wpis\/(\w+)\/poprawka$/, async (m, req) => {
  const b = await body(req), z = zadania.get(b?.zadanie), id = m[1];
  if (z?.kod !== 0 || z.poprawka?.rodzaj !== "publikacja" || z.poprawka.id !== id || !z.wynik) throw blad400("Otwórz aktualną propozycję poprawki.");
  const { podpis, element } = z.poprawka;
  const preferencja = preferencjaPoprawki(b);
  const wynik = zapiszPoprawkeWpisu(id, { podpis, element, po: JSON.parse(z.wynik).po, preferencja: b.zapamietaj === "projekt" ? preferencja : null });
  if (b.zapamietaj === "marka") zapiszPreferencjeAI(null, [preferencja]);
  z.poprawka = null;
  return wynik;
});
trasa("GET", /^\/api\/kalendarz\.ics$/, () => ({ __plik: { typ: "text/calendar; charset=utf-8", nazwa: "rolki.ics", tresc: icsKal().tresc } }));
// Plan rolek na tydzień (scripts/plan-tygodnia.mjs): GET ?od=RRRR-MM-DD (poniedziałek, domyślnie ten tydzień), układanie przez /api/uruchom
const isoDnia = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
trasa("GET", /^\/api\/plan$/, (m, req, url) => {
  const q = url.searchParams.get("od");
  const od = isoDnia(poniedzialek(q && /^\d{4}-\d{2}-\d{2}$/.test(q) ? new Date(q + "T12:00") : new Date()));
  wszystkiePlany(); // dopisuje brakujące id wpisów (przenoszenie w kalendarzu)
  const plan = czytajJson(plikPlanu(od), null);
  // stan z rzeczywistości: pomysł mógł zniknąć albo zostać rolką, rolka mogła dostać final
  if (plan) for (const d of plan.dni) {
    if (d.pomysl && !d.projekt) {
      const P = czytajJson(path.join(PROJEKTY, "_pomysly", d.pomysl, "pomysl.json"), null);
      if (!P) d.pomysl = null;
    }
    if (d.projekt) {
      const p = path.join(PROJEKTY, d.projekt);
      if (!fs.existsSync(p)) d.projekt = null;
      else if (d.stan !== "opublikowana" && listaPlikow(path.join(p, "final"), /\.mp4$/i).length) d.stan = "gotowa";
    }
  }
  if (plan) plan.dni = plan.dni.map(wpisZJakoscia);
  const tygodnie = fs.existsSync(PLAN_DIR) ? fs.readdirSync(PLAN_DIR).filter((n) => /^\d{4}-\d{2}-\d{2}\.json$/.test(n)).map((n) => n.slice(0, 10)).sort() : [];
  return { od, dzis: isoDnia(new Date()), plan, tygodnie, okazje: plan ? null : okazjePlanu(new Date(od + "T12:00"), 13), gabinet: maProfilGab() };
});
trasa("PUT", /^\/api\/plan\/(\d{4}-\d{2}-\d{2})\/dzien\/(\d{4}-\d{2}-\d{2})$/, async (m, req) => {
  const plan = czytajJson(plikPlanu(m[1]), null);
  const d = plan?.dni.find((x) => x.data === m[2] && czyRolka(x));
  if (!d) throw blad400("Nie ma takiego dnia w planie.");
  const b = await body(req);
  if (b.stan && !["plan", "scenariusz", "nagrane", "gotowa", "opublikowana", "pominieta"].includes(b.stan)) throw blad400("Zły stan.");
  for (const k of ["stan", "pomysl", "projekt"]) if (b[k] !== undefined) d[k] = b[k];
  piszJson(plikPlanu(m[1]), plan);
  return plan;
});
trasa("DELETE", /^\/api\/plan\/(\d{4}-\d{2}-\d{2})$/, (m) => { fs.rmSync(plikPlanu(m[1]), { force: true }); return { ok: true }; });
trasa("GET", /^\/api\/telefon$/, () => stanTelefonu());
trasa("POST", /^\/api\/telefon\/wlacz$/, () => wlaczTelefon(apiTelefonu));
trasa("POST", /^\/api\/telefon\/wylacz$/, () => wylaczTelefon());
// Materiał ze scenariusza wgrany do raw/ projektu: POST /api/projekt/<nazwa>/material/<M1>?nazwa=plik.mp4 (body = plik)
trasa("POST", /^\/api\/projekt\/([^/]+)\/material\/([\w-]+)$/, (m, req, url) => wgrajMaterial(decodeURIComponent(m[1]), m[2], url.searchParams.get("nazwa"), req));
// Wspólne z serwerem telefonu (panel/telefon.mjs): materiał ze scenariusza i dowolne nagranie do raw/.
async function wgrajRaw(projekt, nazwaOrg, req) {
  const p = projektDir(projekt);
  const org = bezpiecznaNazwa(nazwaOrg || "nagranie.mp4");
  if (!/\.(mp4|mov|m4v|webm|jpe?g|png|webp|heic|m4a|mp3|wav)$/i.test(org)) throw blad400("To nie jest nagranie ani zdjęcie.");
  const ext = path.extname(org), baza = org.slice(0, -ext.length);
  let nazwa = org;
  for (let n = 2; fs.existsSync(path.join(p, "raw", nazwa)); n++) nazwa = `${baza}_${n}${ext}`;
  await zapiszStrumien(req, path.join(p, "raw", nazwa));
  return { ok: true, plik: `raw/${nazwa}` };
}
async function wgrajMaterial(projekt, mid, nazwaOrg, req) {
  const p = projektDir(projekt);
  const sc = path.join(p, "scenariusz.json");
  const S0 = czytajJson(sc, null);
  const mat = S0?.materialy?.find((x) => x.id === mid);
  if (!mat) throw blad400("Nie ma takiego materiału w scenariuszu.");
  // Plik dostaje nazwę z planu (np. M1_mowa_hook.mp4), kolejne podejścia: M1_mowa_hook_2.mp4 ...
  const ext = (path.extname(String(nazwaOrg || "")).toLowerCase().match(/^\.[a-z0-9]{2,5}$/) || [".mp4"])[0];
  let baza = bezpiecznaNazwa(mat.nazwa_pliku || `${mat.id}_${mat.typ || "material"}`).replace(/\.[a-z0-9]{2,5}$/i, "");
  if (!baza.toLowerCase().startsWith(mat.id.toLowerCase())) baza = `${mat.id}_${baza}`;
  let nazwa = baza + ext;
  for (let n = 2; fs.existsSync(path.join(p, "raw", nazwa)); n++) nazwa = `${baza}_${n}${ext}`;
  await zapiszStrumien(req, path.join(p, "raw", nazwa));
  const S1 = czytajJson(sc, S0);
  const mm = S1.materialy.find((x) => x.id === mid);
  mm.pliki = [...new Set([...(mm.pliki || []), `raw/${nazwa}`])];
  piszJson(sc, S1);
  return { ok: true, plik: `raw/${nazwa}` };
}
// Samouczący się przepis (scripts/algorytm.mjs): przeliczany przy każdym zapytaniu, zapis do 05_ARCHIWUM/algorytm.json
trasa("GET", /^\/api\/algorytm$/, () => policzAlgorytm());
trasa("GET", /^\/api\/algorytm\/przepis$/, (m, req, url) => ({ tekst: przepisDlaClaude(policzAlgorytm({ zapisz: false }), url.searchParams.get("tryb") || "mieszany", url.searchParams.get("proba") === "1") }));
// Publikacja: data i godzina, tryb algorytmu, rolka na próbę + snapshot składników (final/skladniki.json)
trasa("POST", /^\/api\/projekt\/([^/]+)\/publikacja$/, async (m, req) => {
  const p = projektDir(decodeURIComponent(m[1]));
  const b = await body(req);
  if (!/^\d{4}-\d{2}-\d{2}( \d{1,2}:\d{2})?$/.test(String(b.data || ""))) throw blad400("Podaj datę publikacji: RRRR-MM-DD GG:MM.");
  ustawWBrief(p, "data publikacji", b.data);
  ustawWBrief(p, "status", "opublikowana");
  if (b.tryb) ustawWBrief(p, "algorytm", ["zwykly", "moj", "mieszany"].includes(b.tryb) ? b.tryb : "mieszany");
  ustawWBrief(p, "rolka na próbę", b.proba ? "tak" : "nie");
  const sk = skladnikiRolki(p);
  fs.mkdirSync(path.join(p, "final"), { recursive: true });
  piszJson(path.join(p, "final", "skladniki.json"), { ...sk, zapisano: new Date().toISOString() });
  return { ok: true, skladniki: sk };
});
// Wyniki z Instagrama (final/wyniki.json) i zrzut wykresu utrzymania (final/wykres.png|jpg)
trasa("PUT", /^\/api\/projekt\/([^/]+)\/wyniki$/, async (m, req) => {
  const p = projektDir(decodeURIComponent(m[1]));
  const b = await body(req);
  if (!b || typeof b !== "object" || Array.isArray(b)) throw blad400("Złe wyniki.");
  fs.mkdirSync(path.join(p, "final"), { recursive: true });
  piszJson(path.join(p, "final", "wyniki.json"), b);
  return { ok: true };
});
trasa("POST", /^\/api\/projekt\/([^/]+)\/wykres$/, async (m, req, url) => {
  const p = projektDir(decodeURIComponent(m[1]));
  const ext = /\.png$/i.test(url.searchParams.get("nazwa") || "") ? ".png" : ".jpg";
  for (const e of [".png", ".jpg"]) fs.rmSync(path.join(p, "final", "wykres" + e), { force: true });
  await zapiszStrumien(req, path.join(p, "final", "wykres" + ext));
  return { ok: true };
});
trasa("PUT", /^\/api\/projekt\/([^/]+)\/scenariusz$/, async (m, req) => {
  const p = projektDir(decodeURIComponent(m[1]));
  const b = await body(req);
  if (!b || !Array.isArray(b.materialy)) throw blad400("Zły scenariusz.");
  piszJson(path.join(p, "scenariusz.json"), b);
  return { ok: true };
});
trasa("GET", /^\/api\/inbox$/, () => {
  const dir = path.join(ROOT, "00_INBOX");
  return listaPlikow(dir).map((n) => ({ nazwa: n, sciezka: rel(path.join(dir, n)), ...meta(path.join(dir, n)) }));
});
trasa("GET", /^\/api\/szablony$/, () => szablony());
// „Zrób jak ta rolka”: wgranie rolki-wzoru do <projekt>/wzor/
trasa("POST", /^\/api\/projekt\/([^/]+)\/wzor$/, async (m, req, url) => {
  const p = projektDir(decodeURIComponent(m[1]));
  const nazwa = bezpiecznaNazwa(url.searchParams.get("nazwa") || "wzor.mp4");
  if (!ROZSZ_WIDEO.test(nazwa)) throw blad400("Wgraj plik wideo (mp4, mov...).");
  await zapiszStrumien(req, path.join(p, "wzor", nazwa));
  return { ok: true, plik: `wzor/${nazwa}` };
});
// Szybkie złożenie kompozycji dla podglądu na żywo (bez renderu): rolka.json -> index.html
trasa("POST", /^\/api\/projekt\/([^/]+)\/zloz$/, (m) => {
  const nazwa = decodeURIComponent(m[1]);
  projektDir(nazwa);
  const r = spawnSync(process.execPath, [path.join(ROOT, "scripts", "zloz.mjs"), nazwa], { cwd: ROOT, encoding: "utf8", env: { ...process.env, NO_COLOR: "1" }, windowsHide: true, timeout: 120000 });
  const log = czysc((r.stdout || "") + (r.stderr || "")).trim();
  if (r.status !== 0) throw blad400(log.split("\n").filter((l) => /BŁĄD|Co zrobić/.test(l)).join(" ") || log.slice(-400) || "Składanie się nie udało.");
  return { ok: true, log };
});
trasa("POST", /^\/api\/projekt\/([^/]+)\/podglad-stylu$/, async (m, req) => {
  const nazwa = decodeURIComponent(m[1]);
  const projekt = projektDir(nazwa);
  const preset = stylMontazu((await body(req))?.styl);
  if (!preset) throw blad400("Nieznany styl montażu.");
  const aktywne = [...zadania.values()].find((z) => !z.koniec && z.projekt === nazwa && z.podgladStylu === preset.id);
  const z = aktywne || noweZadanie(`Podgląd stylu · ${preset.nazwa}`, process.execPath,
    [path.join(ROOT, "scripts", "zloz.mjs"), projekt, `--podglad-stylu=${preset.id}`], { projekt: nazwa });
  z.podgladStylu = preset.id;
  return { ...zadanieJson(z), src: `/komp/${encodeURIComponent(nazwa)}/.podglady-stylow/${preset.id}/index.html` };
});
// Biblioteka Lottie (03_BIBLIOTEKA/lottie): lista i wgrywanie .json albo .lottie (dotLottie = zip -> JSON z wklejonymi obrazkami)
const LOTTIE_DIR = path.join(ROOT, "03_BIBLIOTEKA", "lottie");
trasa("GET", /^\/api\/lottie$/, () => (fs.existsSync(LOTTIE_DIR) ? fs.readdirSync(LOTTIE_DIR).filter((n) => /\.json$/i.test(n)).sort() : []).map((n) => ({ nazwa: n, sciezka: `03_BIBLIOTEKA/lottie/${n}` })));
trasa("POST", /^\/api\/lottie$/, async (m, req, url) => {
  const org = bezpiecznaNazwa(url.searchParams.get("nazwa") || "animacja.json");
  if (!/\.(json|lottie)$/i.test(org)) throw blad400("Wgraj plik Lottie: .json albo .lottie (LottieFiles: Download > Lottie JSON).");
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "lottie-"));
  try {
    const tmp = path.join(tmpDir, org);
    await zapiszStrumien(req, tmp);
    let dane;
    if (/\.lottie$/i.test(org)) {
      const roz = path.join(tmpDir, "x");
      fs.mkdirSync(roz);
      const r = spawnSync("tar", ["-xf", tmp, "-C", roz]);
      if (r.status !== 0) throw blad400("Nie udało się rozpakować pliku .lottie. Pobierz wersję „Lottie JSON”.");
      const animDir = path.join(roz, "animations");
      const j = fs.existsSync(animDir) ? fs.readdirSync(animDir).find((n) => n.endsWith(".json")) : null;
      if (!j) throw blad400("W pliku .lottie nie ma animacji.");
      dane = JSON.parse(fs.readFileSync(path.join(animDir, j), "utf8"));
      // obrazki z folderu images/ wklejamy jako data URI (zloz wkleja cały JSON do sceny)
      for (const a of dane.assets || []) {
        if (!a.p || a.e === 1 || /^data:/.test(a.p)) continue;
        const f = [path.join(roz, "images", a.p), path.join(roz, a.u || "", a.p)].find((x) => fs.existsSync(x));
        if (f) { const ext = path.extname(f).slice(1).toLowerCase().replace("jpg", "jpeg"); a.p = `data:image/${ext};base64,${fs.readFileSync(f).toString("base64")}`; a.u = ""; a.e = 1; }
      }
    } else {
      try { dane = JSON.parse(fs.readFileSync(tmp, "utf8").replace(/^﻿/, "")); } catch { throw blad400("Ten plik nie jest animacją Lottie (zły JSON). Na LottieFiles wybierz Download > Lottie JSON."); }
    }
    if (!dane || !Array.isArray(dane.layers) || !dane.fr) throw blad400("To nie jest animacja Lottie (brak layers/fr).");
    fs.mkdirSync(LOTTIE_DIR, { recursive: true });
    let nazwa = org.replace(/\.(json|lottie)$/i, "") + ".json";
    for (let n = 2; fs.existsSync(path.join(LOTTIE_DIR, nazwa)); n++) nazwa = org.replace(/\.(json|lottie)$/i, "") + `_${n}.json`;
    fs.writeFileSync(path.join(LOTTIE_DIR, nazwa), JSON.stringify(dane));
    return { ok: true, nazwa, sciezka: `03_BIBLIOTEKA/lottie/${nazwa}`, czas: Math.round(((dane.op - dane.ip) / dane.fr) * 10) / 10 };
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
trasa("GET", /^\/api\/formaty$/, () => formaty());
trasa("GET", /^\/api\/hooki$/, () => hooki());
trasa("GET", /^\/api\/checklista$/, () => checklista());
trasa("GET", /^\/api\/archiwum$/, () => archiwum());
trasa("GET", /^\/api\/muzyka$/, () => biblioteka());
trasa("GET", /^\/api\/meta$/, (m, req, url) => meta(bezpieczna(url.searchParams.get("p"))));
trasa("POST", /^\/api\/uruchom$/, async (m, req) => {
  const b = await body(req);
  return zadanieJson(uruchomSkrypt(b.skrypt, b.args || [], b.projekt));
});

function podpisMontazu(p) {
  const hash = crypto.createHash("sha256");
  for (const plik of ["brief.md", "scenariusz.json", "kompozycja/rolka.json"]) {
    hash.update(plik);
    const sciezka = path.join(p, plik);
    if (fs.existsSync(sciezka)) hash.update(fs.readFileSync(sciezka));
  }
  return hash.digest("hex");
}

trasa("POST", /^\/api\/(projekt|pomysl)\/([^/]+)\/dobierz-montaz$/, async (m, req) => {
  const nazwa = decodeURIComponent(m[2]), projekt = m[1] === "projekt";
  const p = projekt ? projektDir(nazwa) : pomyslDir(nazwa);
  const { wskazowka = "" } = (await body(req)) || {};
  if (typeof wskazowka !== "string" || wskazowka.length > 450) throw blad400("Wskazówka może mieć maksymalnie 450 znaków.");
  if (!claudeDostepny()) throw blad400("Dobieranie montażu wymaga Claude Code.");
  const klucz = m[1] + ":" + nazwa;
  if ([...zadania.values()].some((z) => z.dobor?.klucz === klucz && !z.koniec)) {
    throw Object.assign(new Error("Dobieranie montażu dla tej rolki już trwa."), { status: 409 });
  }
  const wersja = projekt ? podpisMontazu(p) : null;
  const P = projekt ? projektInfo(nazwa) : { pola: {}, pliki: { raw: [], proxy: [] }, scenariusz: pomyslInfo(nazwa).pomysl };
  if (!projekt && !P.scenariusz?.scenariusz?.length) throw blad400("Najpierw przygotuj scenariusz.");
  const r = P.rolka || {};
  const obecnyStyl = CHARAKTERY_MONTAZU.some((s) => s.id === r.montaz) ? r.montaz : "reklamowy";
  const ograniczenia = Object.fromEntries(CHARAKTERY_MONTAZU.map(({ id }) => [id, ograniczeniaEfektow(r, id)]));
  const konfiguracja = Object.fromEntries(EFEKTY.map(([id, domyslnie]) => [id, r.efekty?.[id] ?? domyslnie]));
  const narzedzia = dostepneNarzedzia(P);
  const opisPliku = (f) => ({ nazwa: f.nazwa, czas: f.czas, typ: f.typ });
  const kontekst = {
    wskazowka: wskazowka.trim(),
    brief: projekt ? briefZProjektu(p, P.scenariusz, r, P.pola) : kontekstAI({ katalog: p, dokument: P.scenariusz }),
    temat: P.pola["tytuł roboczy"], cel: P.pola.cel,
    wizerunek: P.pola["zgoda na wizerunek"],
    profil: P.scenariusz?.profil,
    scenariusz: P.scenariusz?.scenariusz?.map((s) => {
      if (!s) return null;
      const { od, do: koniec, mowisz, co_widac, rezyseria } = s;
      return { od, koniec, mowisz, co_widac, zdarzenia: rezyseria?.zdarzenia.map(({ od, typ, opis, stan }) => ({ od, typ, opis, stan })) };
    }),
    pliki: { raw: P.pliki.raw.slice(0, 40).map(opisPliku), proxy: P.pliki.proxy.slice(0, 40).map(opisPliku) },
    rozpoznanie: P.rozpoznanie?.pliki?.slice?.(0, 24),
    montaz: { format: r.format, ruch: r.ruch, napisy: r.napisy?.styl, muzyka: !!r.muzyka?.src, ujecia: r.ujecia?.length || 0 },
    obecnyStyl, konfiguracja, ograniczenia, narzedzia,
    style: CHARAKTERY_MONTAZU.map(({ id, nazwa, opis, wskazowka }) => ({ id, nazwa, opis, wskazowka })),
    efekty: EFEKTY.map(([id, , , nazwa, opis]) => ({ id, nazwa, opis })),
    formaty: formaty().map(({ nr, tytul }) => ({ nr, tytul })),
    szablony: szablony().map(({ id, tytul }) => ({ id, tytul })),
  };
  const z = noweZadanie("Dobór montażu", process.execPath, [path.join(ROOT, "scripts", "dobierz-montaz.mjs")], {
    projekt: projekt ? nazwa : null, stdin: JSON.stringify(kontekst),
    parser(linia, zadanie) {
      if (!linia.startsWith("ZALECENIA ")) return;
      const propozycja = JSON.parse(Buffer.from(linia.slice("ZALECENIA ".length), "base64").toString("utf8"));
      zadanie.dobor.propozycja = propozycja;
      zadanie.wynik = JSON.stringify({ propozycja, obecnyStyl, konfiguracja, ograniczenia });
      return null;
    },
  });
  z.dobor = { wersja, klucz, propozycja: null };
  return zadanieJson(z);
});

trasa("PUT", /^\/api\/projekt\/([^/]+)\/dobierz-montaz$/, async (m, req) => {
  const nazwa = decodeURIComponent(m[1]), p = projektDir(nazwa);
  const { zadanie, styl, efekty, zapamietaj = "" } = (await body(req)) || {};
  const z = zadania.get(zadanie);
  const propozycja = z?.dobor?.propozycja;
  if (z?.projekt !== nazwa || z.kod !== 0 || !propozycja) throw blad400("Otwórz aktualny dobór dla tej rolki.");
  if (z.dobor.wersja !== podpisMontazu(p)) {
    throw Object.assign(new Error("Rolka się zmieniła. Dobierz montaż ponownie."), { status: 409 });
  }
  if (typeof styl !== "boolean" || !Array.isArray(efekty) || new Set(efekty).size !== efekty.length
      || efekty.some((id) => !propozycja.efekty.some((e) => e.id === id))) throw blad400("Wybierz ustawienia z rekomendacji.");
  if (!["", "marka", "projekt"].includes(zapamietaj)) throw blad400("Wybierz zakres preferencji.");
  const plik = path.join(p, "kompozycja", "rolka.json");
  const r = czytajJson(plik, null);
  if (!r || !Array.isArray(r.ujecia)) throw blad400("Projekt nie ma gotowego pliku montażu.");
  if (styl && propozycja.montaz.id !== "obecny") r.montaz = propozycja.montaz.id;
  const ograniczenia = ograniczeniaEfektow(r, r.montaz);
  const wybrane = propozycja.efekty.filter((e) => efekty.includes(e.id));
  if (wybrane.some(({ id, uzyj }) => Object.hasOwn(ograniczenia, id) && ograniczenia[id] !== uzyj)) {
    throw blad400("Co najmniej jeden wybrany efekt koliduje z tym stylem montażu.");
  }
  r.efekty = { ...r.efekty, ...Object.fromEntries(wybrane.map(({ id, uzyj }) => [id, uzyj])) };
  zapiszDokumentRezyserii(plik, r);
  if (zapamietaj) {
    const zapisy = wybrane.map(({ id, uzyj }) => ({ klucz: `efekt:${id}`, tresc: `Efekt ${EFEKTY.find(([e]) => e === id)?.[3] || id} (${id}) domyślnie ${uzyj ? "włączony" : "wyłączony"}.` }));
    if (styl) zapisy.push({ klucz: "styl-montazu", tresc: `Preferowany styl montażu: ${r.montaz || "reklamowy"}.` });
    if (zapisy.length) zapiszPreferencjeAI(zapamietaj === "projekt" ? p : null, zapisy);
  }
  return { ok: true };
});

trasa("POST", /^\/api\/claude$/, async (m, req) => {
  const b = await body(req);
  if (!b.prompt || String(b.prompt).length > 20000) throw blad400("Pusty albo za długi prompt.");
  if (b.sesja != null && !/^[0-9a-f-]{36}$/i.test(String(b.sesja))) throw blad400("Zła sesja rozmowy.");
  const projekt = b.projekt || b.autopilot === true ? projektDir(b.projekt) : null;
  const katalog = b.pomysl && !projekt ? pomyslDir(b.pomysl) : null;
  if (b.autopilot === true) sprawdzZadanieAutopilota(b.projekt);
  const autopilot = b.autopilot === true && { proj: projekt, podpis: podpisMontazuAutopilota(projekt) };
  const brief = projekt ? briefZProjektu(projekt) : kontekstAI({ katalog, dokument: katalog ? czytajJson(path.join(katalog, "pomysl.json"), null) : null });
  const z = claudeZadanie(`${b.prompt}\n\n${promptKontekstuAI(brief)}`, b.projekt, b.sesja || null, autopilot);
  z.autopilot = !!autopilot;
  return zadanieJson(z);
});
function sprawdzZadanieAutopilota(nazwa) {
  if ([...zadania.values()].some((z) => z.projekt === nazwa && z.autopilot && !z.koniec)) {
    throw Object.assign(new Error("Autopilot nadal pracuje nad tą rolką."), { status: 409 });
  }
}
trasa("POST", /^\/api\/projekt\/([^/]+)\/audyt-autopilota$/, (m) => {
  const nazwa = decodeURIComponent(m[1]), p = projektDir(nazwa);
  sprawdzZadanieAutopilota(nazwa);
  const z = noweZadanie("Recenzja montażu", process.execPath, [path.join(ROOT, "scripts", "audyt-autopilota.mjs"), p], { projekt: nazwa });
  z.autopilot = true;
  return zadanieJson(z);
});
trasa("POST", /^\/api\/projekt\/([^/]+)\/poprawka-sceny$/, async (m, req) => {
  const nazwa = decodeURIComponent(m[1]), projekt = projektDir(nazwa), plik = path.join(projekt, "scenariusz.json");
  const { zrodlo, numer, scena } = (await body(req)) || {};
  const a = stanAudytuAutopilota(projekt), P = czytajJson(plik, null);
  if (!a?.aktualny) throw konflikt("Sprawdź aktualny montaż przed przygotowaniem poprawki.");
  const uwagi = zrodlo === "ai" ? a.recenzja?.uwagi : zrodlo === "obraz" ? a.obraz?.problemy : null;
  const u = Number.isSafeInteger(numer) && uwagi?.[numer];
  const w = Number.isSafeInteger(scena) && P?.scenariusz?.[scena];
  if (!u || !w || w.zablokowany || !(w.do > w.od)) throw blad400("Wybierz aktualną uwagę i odblokowaną scenę.");
  if ([...zadania.values()].some((z) => z.rezyseria === plik && !z.koniec)) throw konflikt("Reżyseria tej rolki jest już w trakcie przygotowania.");
  const uwaga = { od: u.od, do: u.do, problem: u.co || u.opis, poprawka: u.zalecenie || u.propozycja };
  const z = noweZadanie("Podgląd poprawki sceny", process.execPath, [path.join(ROOT, "scripts", "rezyseruj.mjs"), plik, String(scena), "--podglad-poprawki"], {
    projekt: nazwa, stdin: JSON.stringify(uwaga), parser: odczytajPodglad,
  });
  z.rezyseria = plik;
  z.poprawka = { rodzaj: "scena", scena, podpis: a.podpis, wersjaSceny: JSON.stringify(porzadkujRezyserie([w])[0]) };
  return zadanieJson(z);
});
trasa("PUT", /^\/api\/projekt\/([^/]+)\/poprawka-sceny$/, async (m, req) => {
  const nazwa = decodeURIComponent(m[1]), projekt = projektDir(nazwa), plik = path.join(projekt, "scenariusz.json");
  const b = await body(req), z = zadania.get(b?.zadanie);
  if (z?.kod !== 0 || z.projekt !== nazwa || z.poprawka?.rodzaj !== "scena" || !z.wynik) throw blad400("Otwórz aktualny podgląd sceny.");
  const a = stanAudytuAutopilota(projekt), P = czytajJson(plik, null), { scena, podpis, wersjaSceny } = z.poprawka;
  const w = P?.scenariusz?.[scena], propozycja = JSON.parse(z.wynik);
  if (!a?.aktualny || a.podpis !== podpis || !w || w.zablokowany || wersjaSceny !== propozycja.wersja || wersjaSceny !== JSON.stringify(porzadkujRezyserie([w])[0])) {
    throw konflikt("Scena lub montaż się zmieniły. Przygotuj poprawkę ponownie.");
  }
  const preferencja = preferencjaPoprawki(b);
  P.scenariusz[scena] = { ...w, rezyseria: normalizujRezyserie(propozycja.rezyseria, w) };
  zapiszDokumentRezyserii(plik, P);
  if (preferencja) zapiszPreferencjeAI(b.zapamietaj === "projekt" ? projekt : null, [preferencja]);
  z.poprawka = null;
  return { scena: P.scenariusz[scena] };
});
trasa("GET", /^\/api\/zadania$/, () => [...zadania.values()].slice(-30).map(zadanieJson));
trasa("GET", /^\/api\/zadanie\/([\w-]+)$/, (m) => { const z = zadania.get(m[1]); if (!z) throw blad400("Nie ma zadania."); return zadanieJson(z); });
trasa("POST", /^\/api\/zadanie\/([\w-]+)\/stop$/, (m) => {
  const z = zadania.get(m[1]);
  if (z && !z.koniec) {
    z.przerwano = true;
    if (IS_WIN) spawnSync("taskkill", ["/pid", String(z.proc.pid), "/T", "/F"]);
    else z.proc.kill();
  }
  return { ok: true };
});
trasa("POST", /^\/api\/otworz$/, async (m, req) => {
  const b = await body(req);
  const p = bezpieczna(b.sciezka);
  if (IS_WIN) spawn("explorer.exe", [p], { detached: true, stdio: "ignore" }).unref();
  else spawn(process.platform === "darwin" ? "open" : "xdg-open", [p], { detached: true, stdio: "ignore" }).unref();
  return { ok: true };
});

async function obsluz(req, res) {
  const url = new URL(req.url, `http://${HOST}:${PORT}`);
  const host = (req.headers.host || "").split(":")[0];
  if (!["localhost", "127.0.0.1"].includes(host)) { res.writeHead(403); return res.end("Tylko localhost"); }
  // bez aktywnej licencji: tylko strona panelu (ekran aktywacji), /api/start i /api/licencja
  if (!/^\/api\/(start|licencja)$/.test(url.pathname) && (url.pathname.startsWith("/api/") || /^\/(komp|media|thumb|strip|lib)\//.test(url.pathname + "/")) && !maLicencje()) {
    return json(res, { blad: "Panel nie jest aktywowany. Wpisz kod licencyjny.", licencja: false }, 403);
  }
  try {
    // SSE
    const sse = url.pathname.match(/^\/api\/zadanie\/([\w-]+)\/strumien$/);
    if (sse) {
      const z = zadania.get(sse[1]);
      if (!z) { res.writeHead(404); return res.end(); }
      res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" });
      res.write(`data: ${JSON.stringify({ start: true, linie: z.linie, postep: z.postep })}\n\n`);
      if (z.koniec) { res.write(`data: ${JSON.stringify({ koniec: true, kod: z.kod, wynik: z.wynik, sesja: z.sesja, audyt: z.audyt })}\n\n`); return res.end(); }
      z.sluchacze.add(res);
      req.on("close", () => z.sluchacze.delete(res));
      return;
    }
    // Podgląd na żywo: kompozycja rolki pod adresem panelu (odtwarzacz <hyperframes-player> w kroku Sceny)
    const komp = url.pathname.match(/^\/komp\/([^/]+)\/(.*)$/);
    if (komp) {
      const baza = path.join(projektDir(decodeURIComponent(komp[1])), "kompozycja");
      const p = path.resolve(baza, decodeURIComponent(komp[2] || "index.html"));
      if (!p.startsWith(baza)) { res.writeHead(403); return res.end(); }
      if (/[\\/]index\.html$/.test(p) && fs.existsSync(p)) {
        // fonty marki z Google Fonts (render dostaje je od kompilatora HyperFrames, przeglądarka nie)
      const rolka = czytajJson(path.join(baza, "rolka.json"), {});
      const idPodgladu = komp[2].match(/^\.podglady-stylow\/([\w-]+)\//)?.[1];
      const f = stylMontazu(idPodgladu || rolka.montaz)?.fonty || zastosujStyl(wczytajConfig(), rolka.styl).fonty || {};
      const rodz = [...new Set([f.naglowki, f.tekst])].filter(Boolean).map((n) => `family=${encodeURIComponent(n).replace(/%20/g, "+")}:ital,wght@0,400;0,500;0,600;0,700;1,400;1,600`).join("&");
        const html = fs.readFileSync(p, "utf8").replace("<head>", `<head>\n    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?${rodz}&display=block" />`);
        res.writeHead(200, { "Content-Type": MIME[".html"], "Cache-Control": "no-cache" });
        return res.end(html);
      }
      return plik(req, res, p);
    }
    // moduł oceny scenariusza wspólny z CLI (scripts/), tylko ten jeden plik
    if (url.pathname === "/lib/osoba.mjs") return plik(req, res, path.join(ROOT, "scripts", "osoba.mjs"));
    if (url.pathname === "/lib/ocena-scenariusza.mjs") return plik(req, res, path.join(ROOT, "scripts", "ocena-scenariusza.mjs"));
    if (url.pathname === "/media") return plik(req, res, bezpieczna(url.searchParams.get("p")));
    if (url.pathname === "/thumb") {
      const p = bezpieczna(url.searchParams.get("p"));
      const t = Math.max(0, Number(url.searchParams.get("t") || 1));
      const w = Math.min(720, Number(url.searchParams.get("w") || 240));
      const m = ROZSZ_OBRAZ.test(p) ? null : meta(p);
      const out = miniatura(p, m ? Math.min(t, Math.max(0, (m.czas || 1) - 0.1)) : 0, w);
      if (!out) { res.writeHead(404); return res.end(); }
      return plik(req, res, out);
    }
    if (url.pathname === "/strip") {
      const out = pasek(bezpieczna(url.searchParams.get("p")));
      if (!out) { res.writeHead(404); return res.end(); }
      return plik(req, res, out);
    }
    if (url.pathname.startsWith("/api/")) {
      for (const t of trasy) {
        const m = req.method === t.metoda && url.pathname.match(t.wzor);
        if (m) {
          const w = await t.fn(m, req, url);
          // odpowiedź jako plik (np. kalendarz .ics): { __plik: { typ, nazwa, tresc } }
          if (w && w.__plik) {
            res.writeHead(200, { "Content-Type": w.__plik.typ, "Content-Disposition": `attachment; filename="${w.__plik.nazwa}"`, "Cache-Control": "no-store" });
            return res.end(w.__plik.tresc);
          }
          return json(res, w);
        }
      }
      return json(res, { blad: "Nie ma takiej ścieżki API." }, 404);
    }
    // statyczne
    const f = url.pathname === "/" ? "index.html" : url.pathname.slice(1);
    const p = path.resolve(PUB, f);
    if (!p.startsWith(PUB)) { res.writeHead(403); return res.end(); }
    return plik(req, res, p);
  } catch (e) {
    return json(res, { blad: e.message }, e.status || 500);
  }
}

const serwer = http.createServer(obsluz);
// Wyniki z Instagrama same: 30 s po starcie panelu i potem co 6 h (tylko gdy konto jest połączone)
const syncIGcicho = () => { if (maLicencje() && stanIG().polaczony) synchronizujIG().then((w) => console.log(`Instagram: ${w.rolki} rolek, ${w.dopasowane} dopasowanych`)).catch((e) => console.error("Instagram:", e.message)); };
setTimeout(syncIGcicho, 30e3).unref();
setInterval(syncIGcicho, 6 * 3600e3).unref();
serwer.listen(PORT, HOST, () => {
  const adres = `http://localhost:${PORT}`;
  console.log(`Panel rolek działa: ${adres}  (zamknięcie: Ctrl+C)`);
  if (!process.argv.includes("--bez-przegladarki")) {
    if (IS_WIN) spawn("cmd", ["/c", "start", "", adres], { detached: true, stdio: "ignore" }).unref();
    else spawn(process.platform === "darwin" ? "open" : "xdg-open", [adres], { detached: true, stdio: "ignore" }).unref();
  }
});
serwer.on("error", (e) => {
  if (e.code === "EADDRINUSE") console.error(`Port ${PORT} jest zajęty. Panel już działa? Otwórz http://localhost:${PORT} albo zamknij poprzedni.`);
  else console.error(e.message);
  process.exit(1);
});

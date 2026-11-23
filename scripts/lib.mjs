// Wspólne funkcje skryptów. Wszystkie komunikaty po polsku.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { odmienImie } from "./osoba.mjs";
import { wymagajLicencji } from "./licencja.mjs";

process.noDeprecation = true; // ostrzeżenie Node o shell:true przy npx na Windows

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
// Licencja: każdy skrypt z scripts/ uruchomiony bezpośrednio (konsola, npm run, zadanie z panelu) wymaga aktywnego kodu.
if (/[\\/]scripts[\\/][^\\/]+\.m?js$/i.test(process.argv[1] || "")) wymagajLicencji();
export const PROJEKTY = path.join(ROOT, "01_PROJEKTY");
export const SZABLON_ROLKI = path.join(PROJEKTY, "_SZABLON_ROLKI");
export const SZABLONY_HF = path.join(ROOT, "04_SZABLONY_HF");
export const ARCHIWUM = path.join(ROOT, "05_ARCHIWUM");
export const BRAND = path.join(ROOT, "02_BRAND");
export const IS_WIN = process.platform === "win32";

export const KATEGORIE = ["brwi", "rzesy", "twarz", "podologia", "pedicure", "gabinet", "edukacja"];

const kolor = (c) => (s) => (process.stdout.isTTY ? `\x1b[${c}m${s}\x1b[0m` : s);
export const zielony = kolor(32);
export const czerwony = kolor(31);
export const zolty = kolor(33);
export const szary = kolor(90);
export const pogrubiony = kolor(1);

export function info(msg) { console.log(msg); }
export function ok(msg) { console.log(zielony("✓ ") + msg); }
export function uwaga(msg) { console.log(zolty("! ") + msg); }

/** Kończy skrypt czytelnym błędem po polsku, z podpowiedzią co zrobić. */
export function blad(msg, podpowiedz) {
  // Panel (serwer) nie może się zamknąć przez błąd jednej operacji: tam rzucamy wyjątek.
  if (globalThis.__ROLKI_RZUCAJ) throw Object.assign(new Error(msg + (podpowiedz ? ` Co zrobić: ${podpowiedz}` : "")), { status: 400 });
  console.error(czerwony("✗ BŁĄD: ") + msg);
  if (podpowiedz) console.error(szary("  Co zrobić: ") + podpowiedz);
  process.exit(1);
}

/** Nowa instalacja (z GitHuba): brakujące config.json i pliki marki kopiowane z szablon_startowy/ (istniejących nie rusza). */
let startoweSprawdzone = false;
export function zapewnijPlikiStartowe() {
  if (startoweSprawdzone) return;
  startoweSprawdzone = true;
  const SZ = path.join(ROOT, "szablon_startowy");
  if (!fs.existsSync(SZ)) return;
  const kopiuj = (zrodlo, cel) => { if (!fs.existsSync(cel) && fs.existsSync(zrodlo)) { fs.mkdirSync(path.dirname(cel), { recursive: true }); fs.copyFileSync(zrodlo, cel); } };
  kopiuj(path.join(SZ, "config.json"), path.join(ROOT, "config.json"));
  for (const n of fs.existsSync(path.join(SZ, "02_BRAND")) ? fs.readdirSync(path.join(SZ, "02_BRAND")) : []) kopiuj(path.join(SZ, "02_BRAND", n), path.join(ROOT, "02_BRAND", n));
  for (const d of ["00_INBOX", "01_PROJEKTY/_pomysly", "01_PROJEKTY/_plan", "05_ARCHIWUM", "02_BRAND/style", "02_BRAND/logo", "02_BRAND/watermark", "02_BRAND/fonty"]) fs.mkdirSync(path.join(ROOT, d), { recursive: true });
}

export function wczytajConfig() {
  zapewnijPlikiStartowe();
  const p = path.join(ROOT, "config.json");
  if (!fs.existsSync(p)) blad("Brak pliku config.json w katalogu głównym.", "Przywróć config.json z kopii albo z repozytorium.");
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch (e) {
    blad(`config.json ma błąd składni: ${e.message}`, "Sprawdź przecinki i cudzysłowy, np. na jsonlint.com.");
  }
}

/** Imię osoby z config.json (gabinet.osoba) w przypadkach: mian, dop, cel, bier, narz (scripts/osoba.mjs). */
export function osobaZConfigu(cfg = wczytajConfig()) { return odmienImie(cfg.gabinet?.osoba); }

/** Zapis config.json z panelu: ten sam układ co plik (końce linii, końcowy enter), bo bywa edytowany ręcznie. */
export function zapiszConfig(cfg) {
  const p = path.join(ROOT, "config.json");
  const stary = fs.existsSync(p) ? fs.readFileSync(p, "utf8") : "";
  let t = JSON.stringify(cfg, null, 2);
  if (!stary || /\n$/.test(stary)) t += "\n";
  fs.writeFileSync(p, stary.includes("\r\n") ? t.replace(/\n/g, "\r\n") : t);
}

export function czyTodo(v) { return v == null || v === "" || String(v).trim().toUpperCase() === "TODO"; }

/** Uruchamia komendę i zwraca {code, stdout, stderr}. Na Windows przez powłokę dla npx. */
export function uruchom(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, {
    cwd: opts.cwd || ROOT,
    encoding: opts.kodowanie === "buffer" ? "buffer" : "utf8", // "buffer": surowe dane (np. klatki z ffmpeg)
    shell: IS_WIN && /^(npx|npm|auto-editor)$/.test(cmd),
    stdio: opts.cicho ? ["ignore", "pipe", "pipe"] : opts.pokaz ? "inherit" : ["ignore", "pipe", "pipe"],
    maxBuffer: 1024 * 1024 * 200,
    env: { ...process.env, ...(opts.env || {}) },
    timeout: opts.timeout,
  });
  if (r.error && r.error.code === "ENOENT") return { code: 127, stdout: "", stderr: `nie znaleziono programu: ${cmd}` };
  if (opts.kodowanie === "buffer") return { code: r.status ?? 1, stdout: r.stdout || Buffer.alloc(0), stderr: r.stderr ? r.stderr.toString("utf8") : "" };
  return { code: r.status ?? 1, stdout: r.stdout || "", stderr: r.stderr || "" };
}

/** Argumenty z cudzysłowami dla shell:true na Windows. */
export function q(s) {
  s = String(s);
  return IS_WIN && /[\s&()^%!"]/.test(s) ? `"${s.replace(/"/g, '\\"')}"` : s;
}

export function hf(args, opts = {}) {
  const cfg = wczytajConfig();
  const ver = cfg.hyperframes?.wersja ? `hyperframes@${cfg.hyperframes.wersja}` : "hyperframes";
  return uruchom("npx", ["--yes", ver, ...args.map(q)], opts);
}

export function wymagaj(prog, instalacja) {
  const r = uruchom(prog, prog === "auto-editor" ? ["--version"] : ["-version"], { cicho: true });
  if (r.code !== 0) blad(`Brak programu "${prog}".`, instalacja);
}

/** ffprobe -> {width, height, fps, duration, hasAudio, rotation, codec} */
export function ffprobe(plik) {
  const r = uruchom("ffprobe", ["-v", "error", "-print_format", "json", "-show_streams", "-show_format", plik], { cicho: true });
  if (r.code !== 0) blad(`ffprobe nie umie odczytać pliku: ${plik}`, "Sprawdź, czy plik nie jest uszkodzony i czy to wideo/audio.");
  const j = JSON.parse(r.stdout);
  const v = j.streams.find((s) => s.codec_type === "video");
  const a = j.streams.find((s) => s.codec_type === "audio");
  let rotation = 0;
  if (v) {
    const sd = (v.side_data_list || []).find((d) => d.rotation != null);
    rotation = sd ? Number(sd.rotation) : Number(v.tags?.rotate || 0);
  }
  const [n, d] = (v?.avg_frame_rate || v?.r_frame_rate || "0/1").split("/").map(Number);
  return {
    width: v?.width || 0,
    height: v?.height || 0,
    fps: d ? n / d : 0,
    duration: Number(j.format?.duration || v?.duration || 0),
    hasAudio: !!a,
    hasVideo: !!v,
    rotation: ((rotation % 360) + 360) % 360,
    codec: v?.codec_name || "",
    pixFmt: v?.pix_fmt || "",
    size: Number(j.format?.size || 0),
    raw: j,
  };
}

/** Mierzy zintegrowaną głośność (LUFS) i true peak przez ebur128. */
export function glosnosc(plik) {
  const r = uruchom("ffmpeg", ["-hide_banner", "-nostats", "-i", plik, "-af", "ebur128=peak=true", "-f", "null", "-"], { cicho: true });
  const s = r.stderr;
  const i = s.lastIndexOf("Summary:");
  const sum = i >= 0 ? s.slice(i) : s;
  const lufs = Number((sum.match(/I:\s+(-?[\d.]+) LUFS/) || [])[1]);
  const tp = Number((sum.match(/Peak:\s+(-?[\d.]+) dBFS/) || [])[1]);
  return { lufs: isFinite(lufs) ? lufs : null, truePeak: isFinite(tp) ? tp : null };
}

/** Znajduje projekt rolki: pełna ścieżka, nazwa, fragment nazwy albo bieżący katalog. */
export function znajdzProjekt(arg) {
  const zFolderu = (dir) => {
    let d = path.resolve(dir);
    while (d.startsWith(PROJEKTY) && d !== PROJEKTY) {
      if (path.dirname(d) === PROJEKTY) return d;
      d = path.dirname(d);
    }
    return null;
  };
  if (!arg) {
    const z = zFolderu(process.cwd());
    if (z) return z;
    blad("Nie podano projektu rolki.", "Dodaj nazwę projektu, np.: npm run render -- 2026-11-12_brwi_laminacja");
  }
  if (fs.existsSync(arg) && fs.statSync(arg).isDirectory()) {
    const z = zFolderu(arg) || path.resolve(arg);
    return z;
  }
  const bezpos = path.join(PROJEKTY, arg);
  if (fs.existsSync(bezpos)) return bezpos;
  const pasujace = fs.readdirSync(PROJEKTY).filter((n) => !n.startsWith("_") && n.toLowerCase().includes(arg.toLowerCase()));
  if (pasujace.length === 1) return path.join(PROJEKTY, pasujace[0]);
  if (pasujace.length > 1) blad(`Nazwa "${arg}" pasuje do kilku projektów: ${pasujace.join(", ")}`, "Podaj dłuższy fragment nazwy.");
  blad(`Nie znalazłam projektu "${arg}" w 01_PROJEKTY.`, "Sprawdź nazwę (ls 01_PROJEKTY) albo utwórz rolkę: npm run nowa-rolka -- <kategoria> \"temat\"");
}

/** Czyta pola "klucz: wartość" z brief.md (sekcja metadanych na górze). */
export function czytajBrief(proj) {
  const p = path.join(proj, "brief.md");
  if (!fs.existsSync(p)) blad("Brak brief.md w projekcie.", "Skopiuj brief.md z 01_PROJEKTY/_SZABLON_ROLKI.");
  const txt = fs.readFileSync(p, "utf8");
  const pola = {};
  for (const m of txt.matchAll(/^\s*[-*]?\s*\*{0,2}([a-ząćęłńóśźż _/]+?)\*{0,2}\s*:\s*(.*)$/gim)) {
    const k = m[1].trim().toLowerCase();
    if (!(k in pola)) pola[k] = m[2].trim();
  }
  return { txt, pola, sciezka: p };
}

/** Ustawia pole "klucz: wartość" w brief.md (zamienia pierwsze wystąpienie). */
export function ustawWBrief(proj, klucz, wartosc) {
  const p = path.join(proj, "brief.md");
  let txt = fs.readFileSync(p, "utf8");
  const re = new RegExp(`^(\\s*[-*]?\\s*\\*{0,2}${klucz.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\*{0,2}\\s*:)(.*)$`, "im");
  if (re.test(txt)) txt = txt.replace(re, `$1 ${wartosc}`);
  else txt += `\n- ${klucz}: ${wartosc}\n`;
  fs.writeFileSync(p, txt, "utf8");
}

export function zgodaNaWizerunek(proj) {
  const { pola } = czytajBrief(proj);
  const v = (pola["zgoda na wizerunek"] || "").toLowerCase();
  if (/^tak\b/.test(v)) return "tak";
  if (/^nie dotyczy|^brak twarzy|^n\/d/.test(v)) return "nie dotyczy";
  return "nie";
}

export function wczytajRolke(proj) {
  const p = path.join(proj, "kompozycja", "rolka.json");
  if (!fs.existsSync(p)) blad("Brak kompozycja/rolka.json.", "Utwórz go (skill rolki-beauty robi to sam) albo skopiuj z _SZABLON_ROLKI/kompozycja/rolka.json.");
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch (e) {
    blad(`rolka.json ma błąd składni: ${e.message}`, "Sprawdź przecinki i cudzysłowy.");
  }
}

export function nastepnaWersja(dir) {
  fs.mkdirSync(dir, { recursive: true });
  const nums = fs.readdirSync(dir).map((n) => Number((n.match(/_v(\d+)/) || [])[1] || 0));
  return String(Math.max(0, ...nums) + 1).padStart(2, "0");
}

/** Hardlink (szybko, bez zajmowania miejsca), a jak się nie da, kopia. */
/** Zapis wyniku bez uszkodzonych plików: zapisz(cel) pisze do <plik>.czesc.<ext>, po sukcesie zamiana na właściwą nazwę.
 *  Przerwane zadanie (zamknięty panel, wyłączony komputer) zostawia tylko .czesc, nie popsuty wynik. */
export function zapiszBezpiecznie(out, zapisz) {
  const czesc = out.replace(/(\.[^.\\/]+)$/, ".czesc$1");
  fs.rmSync(czesc, { force: true });
  zapisz(czesc);
  if (!fs.existsSync(czesc)) blad(`Nie powstał plik ${path.basename(out)}.`);
  fs.rmSync(out, { force: true });
  fs.renameSync(czesc, out);
  return out;
}

export function podlinkuj(src, dst) {
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  if (fs.existsSync(dst)) {
    const a = fs.statSync(src), b = fs.statSync(dst);
    if (a.size === b.size && a.mtimeMs <= b.mtimeMs) return;
    fs.rmSync(dst);
  }
  try { fs.linkSync(src, dst); } catch { fs.copyFileSync(src, dst); }
}

export function slug(s) {
  return String(s)
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/ł/g, "l")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

export function dzis() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export const ROZSZ_WIDEO = /\.(mp4|mov|m4v|mkv|webm|avi|3gp|hevc)$/i;
export const ROZSZ_AUDIO = /\.(wav|mp3|m4a|aac|flac|ogg|opus)$/i;
export const ROZSZ_OBRAZ = /\.(jpe?g|png|webp|heic)$/i;

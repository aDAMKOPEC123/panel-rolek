// Transkrypcja po polsku z timingiem słów.
//   npm run transkrybuj -- <projekt> <plik w projekcie, np. proxy/IMG_0004.mp4> [--model medium|large-v3] [--silnik whisper|heygen] [--do napisy/slowa/X.json]
// Wynik: napisy/transcript.json (słowa {text,start,end}), napisy/transcript.srt, napisy/tekst.txt (do czytania i korekty).
// ZAWSZE model wielojęzyczny + --language pl. Modele ".en" tłumaczą polski na angielski, są zablokowane.
// Fallback: faster-whisper (pip install faster-whisper), gdy HyperFrames/whisper.cpp nie zadziała.
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { ROOT, hf, uruchom, blad, ok, info, uwaga, szary, wczytajConfig, znajdzProjekt, ffprobe } from "./lib.mjs";

const cfg = wczytajConfig();
const args = process.argv.slice(2);
const flaga = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args.splice(i, 2)[1] : d; };
const model = flaga("--model", cfg.transkrypcja?.model || "medium");
const silnik = flaga("--silnik", "whisper");
// --do napisy/slowa/X.json: same słowa do osobnego pliku (dopasuj-kwestie), bez ruszania transcript.json, srt i zrodlo.txt.
const doPliku = flaga("--do", null);
const jezyk = cfg.transkrypcja?.jezyk || "pl";
const [pArg, plikArg] = args.filter((a) => !a.startsWith("--"));
const proj = znajdzProjekt(pArg);

if (/\.en$/.test(model)) blad(`Model "${model}" jest tylko angielski i przetłumaczy polską mowę.`, "Użyj: --model medium albo --model large-v3");
if (!plikArg) blad("Podaj plik z mową.", "np.: npm run transkrybuj -- <projekt> proxy/IMG_0004.mp4");
const plik = path.isAbsolute(plikArg) ? plikArg : path.join(proj, plikArg);
if (!fs.existsSync(plik)) blad(`Nie ma pliku ${plikArg}.`, "Ścieżka względem folderu rolki, np. proxy/IMG_0004.mp4");
const m = ffprobe(plik);
if (!m.hasAudio) blad(`${plikArg} nie ma ścieżki audio.`, "Wybierz klip, w którym ktoś mówi.");

const NAPISY = path.join(proj, "napisy");
fs.mkdirSync(NAPISY, { recursive: true });
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "hf-trans-"));
let slowa = null;

info(`Transkrypcja ${plikArg} (${m.duration.toFixed(1)} s), model ${model}, język ${jezyk}. Pierwszy raz pobiera model, to potrwa.`);
const argv = ["transcribe", plik, "--model", model, "--language", jezyk, "--json", "-d", tmp];
if (silnik === "heygen") argv.push("--engine", "heygen");
const r = hf(argv, { cicho: true, timeout: 60 * 60 * 1000 });
const out = path.join(tmp, "assets", "transcript.json");
const alt = path.join(tmp, "transcript.json");
const zrodloJson = fs.existsSync(out) ? out : fs.existsSync(alt) ? alt : null;
if (r.code === 0 && zrodloJson) {
  slowa = JSON.parse(fs.readFileSync(zrodloJson, "utf8"));
  if (!Array.isArray(slowa)) slowa = slowa.words || [];
  ok("HyperFrames transcribe zadziałał (silnik auto: Parakeet, jeśli zainstalowany, inaczej whisper).");
} else {
  uwaga("HyperFrames transcribe nie zadziałał: " + ((r.stderr || r.stdout).trim().split("\n").slice(-3).join(" | ")));
  info("Próbuję fallback: faster-whisper ...");
  const py = path.join(ROOT, "scripts", "faster_whisper_pl.py");
  const json = path.join(tmp, "fw.json");
  const r2 = uruchom("python", ["-I", py, plik, json, model === "large" ? "large-v3" : model, jezyk], { cicho: true, timeout: 60 * 60 * 1000 });
  if (r2.code !== 0 || !fs.existsSync(json)) {
    blad("Transkrypcja nie wyszła ani w HyperFrames, ani w faster-whisper.\n" + (r2.stderr || "").slice(-600),
      "Zainstaluj fallback: pip install faster-whisper   albo whisper.cpp (npx hyperframes doctor pokaże komendę).");
  }
  slowa = JSON.parse(fs.readFileSync(json, "utf8"));
  ok("faster-whisper zadziałał.");
}

// Czyszczenie: tokeny bez liter, halucynacje whispera w końcowej ciszy ("Dziękuję.", powtórki).
slowa = slowa
  .map((w, i) => ({ id: `w${i}`, text: String(w.text ?? w.word ?? "").trim(), start: +(+w.start).toFixed(3), end: +(+w.end).toFixed(3) }))
  .filter((w) => w.text && /[\p{L}\p{N}]/u.test(w.text) && isFinite(w.start));
const sd = uruchom("ffmpeg", ["-hide_banner", "-nostats", "-i", plik, "-af", "silencedetect=noise=-35dB:d=0.6", "-f", "null", "-"], { cicho: true }).stderr;
const ciszaStart = [...sd.matchAll(/silence_start: ([\d.]+)/g)].map((x) => +x[1]);
const ciszaEnd = [...sd.matchAll(/silence_end: ([\d.]+)/g)].map((x) => +x[1]);
const ostatniaCisza = ciszaStart.length > ciszaEnd.length ? ciszaStart[ciszaStart.length - 1] : null;
if (ostatniaCisza != null) {
  const przed = slowa.length;
  slowa = slowa.filter((w) => w.start < ostatniaCisza + 0.05);
  if (przed !== slowa.length) uwaga(`Usunięto ${przed - slowa.length} słów z końcowej ciszy (typowa halucynacja whispera).`);
}
const nieznane = slowa.filter((w) => /[♪�]/.test(w.text)).length;
if (slowa.length && nieznane / slowa.length > 0.2) uwaga("Ponad 20% śmieciowych tokenów. Spróbuj --model large-v3 albo nagraj mowę bez muzyki.");
if (!slowa.length) blad("Transkrypcja jest pusta.", "Czy w klipie słychać mowę? Spróbuj --model large-v3.");
slowa.forEach((w, i) => (w.id = `w${i}`));

if (doPliku) {
  const cel = path.join(proj, doPliku);
  fs.mkdirSync(path.dirname(cel), { recursive: true });
  fs.writeFileSync(cel, JSON.stringify(slowa, null, 1) + "\n", "utf8");
  try { fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 3, retryDelay: 300 }); } catch {}
  ok(`${doPliku} (${slowa.length} słów)`);
  process.exit(0);
}
const J = path.join(NAPISY, "transcript.json");
fs.writeFileSync(J, JSON.stringify(slowa, null, 1) + "\n", "utf8");
fs.writeFileSync(path.join(NAPISY, "zrodlo.txt"), path.relative(proj, plik).split(path.sep).join("/") + "\n");

// SRT (eksport HyperFrames, z fallbackiem na własny)
const srt = path.join(NAPISY, "transcript.srt");
const r3 = hf(["transcribe", J, "--to", "srt", "-o", srt, "-d", tmp], { cicho: true });
if (r3.code !== 0 || !fs.existsSync(srt)) {
  const ts = (s) => { const ms = Math.round(s * 1000); const h = Math.floor(ms / 3600000), mi = Math.floor(ms / 60000) % 60, se = Math.floor(ms / 1000) % 60; return `${String(h).padStart(2, "0")}:${String(mi).padStart(2, "0")}:${String(se).padStart(2, "0")},${String(ms % 1000).padStart(3, "0")}`; };
  const grupy = []; let g = [];
  slowa.forEach((w, i) => { g.push(w); const n = slowa[i + 1]; if (!n || g.length >= 6 || /[.!?,]$/.test(w.text) || n.start - w.end > 0.3) { grupy.push(g); g = []; } });
  fs.writeFileSync(srt, grupy.map((g, i) => `${i + 1}\n${ts(g[0].start)} --> ${ts(g[g.length - 1].end)}\n${g.map((w) => w.text).join(" ")}\n`).join("\n"), "utf8");
}
// Tekst do czytania: zdania z czasem startu
let linie = [], zd = [];
slowa.forEach((w) => { zd.push(w); if (/[.!?…]$/.test(w.text)) { linie.push(zd); zd = []; } });
if (zd.length) linie.push(zd);
fs.writeFileSync(path.join(NAPISY, "tekst.txt"), linie.map((l) => `[${l[0].start.toFixed(1)} s] ${l.map((w) => w.text).join(" ")}`).join("\n") + "\n", "utf8");
try { fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 3, retryDelay: 300 }); } catch {} // Windows potrafi chwilę trzymać plik

ok(`napisy/transcript.json (${slowa.length} słów), napisy/transcript.srt, napisy/tekst.txt`);
info(szary("\nPrzeczytaj napisy/tekst.txt. Poprawiaj TYLKO błędy rozpoznania (nazwy zabiegów, preparatów), nie styl mówienia.\nKorekta: popraw słowo w transcript.json (pole text), czasów nie ruszaj."));
info("\n" + linie.map((l) => l.map((w) => w.text).join(" ")).join("\n"));

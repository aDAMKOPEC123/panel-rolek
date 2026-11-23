// Płynne slow motion i rampy prędkości (RIFE: AI dorysowuje klatki pośrednie, karta graficzna, darmowe).
//   npm run zwolnij -- <projekt> proxy/<klip>.mp4 --od 2.0 --do 3.5 [--sila 4] [--rampa 0.3] [--podmien]
// Fragment od-do (sekundy pliku) zwalnia „sila” razy (2-8), z płynnym zejściem i powrotem prędkości
// (rampa = sekundy pliku na zwolnienie i na przyspieszenie, 0 = skok). Reszta klipu bez zmian.
// Wynik: proxy/<klip>_slow.mp4 (1080x1920, 30 kl/s) + proxy/<klip>_slow.json (mapa czasu pliku -> czas wyniku).
// Dźwięk: części w normalnym tempie zostają, w zwolnionej jest cisza.
// --podmien: ujęcia z tym plikiem w rolka.json przechodzą na wersję _slow (od/do i segmenty przeliczone).
// Bez programu narzedzia/rife/ (albo --bez-ai): ffmpeg minterpolate (wolniej, gorzej przy szybkim ruchu).
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { blad, ok, info, uwaga, znajdzProjekt, uruchom, ffprobe, ROOT } from "./lib.mjs";

const args = process.argv.slice(2);
const flaga = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args.splice(i, 2)[1] : d; };
const OD = Number(flaga("--od", NaN)), DO = Number(flaga("--do", NaN));
const SILA = Number(flaga("--sila", 4)) || 4;
const K = [2, 3, 4, 6, 8].reduce((a, b) => (Math.abs(b - SILA) < Math.abs(a - SILA) ? b : a), 4);
const RAMPA = Math.max(0, Math.min(1.5, Number(flaga("--rampa", 0.3)) || 0));
const podmien = args.includes("--podmien"), bezAI = args.includes("--bez-ai");
const [pArg, plikArg] = args.filter((a) => !a.startsWith("--"));
const proj = znajdzProjekt(pArg);
if (!plikArg) blad("Podaj klip.", "np. npm run zwolnij -- <projekt> proxy/M3_efekt.mp4 --od 2 --do 3.5");
const src = path.join(proj, plikArg);
if (!fs.existsSync(src)) blad(`Nie ma pliku ${plikArg}.`, "Ścieżka względem folderu rolki, np. proxy/IMG_0002.mp4");
const m = ffprobe(src);
if (!(OD >= 0) || !(DO > OD)) blad("Podaj zakres --od i --do (sekundy pliku, do > od).");
if (DO > m.duration + 0.01) blad(`Klip ma ${m.duration.toFixed(2)} s, a --do = ${DO}.`);
const FPS = 30, a = Math.max(0, OD - RAMPA), b = Math.min(m.duration, DO + RAMPA);
const base = path.parse(plikArg).name.replace(/_slow$/, "");
const outRel = path.join(path.dirname(plikArg), `${base}_slow.mp4`).split(path.sep).join("/");
const out = path.join(proj, outRel);
const RIFE_DIR = path.join(ROOT, "narzedzia", "rife"), RIFE = path.join(RIFE_DIR, process.platform === "win32" ? "rife-ncnn-vulkan.exe" : "rife-ncnn-vulkan");
const ai = !bezAI && fs.existsSync(RIFE);
if (!ai && !bezAI) uwaga("Brak narzedzia/rife/ (RIFE), używam ffmpeg minterpolate.");
const ff = (argv, opis, cwd) => { const r = uruchom("ffmpeg", ["-hide_banner", "-y", "-loglevel", "error", ...argv], { cicho: true, cwd }); if (r.code !== 0) blad(`${opis} się nie udało.`, r.stderr.slice(-500)); };

// Prędkość w czasie pliku: 1 poza [a,b], 1/K w [OD,DO], płynne przejście (smoothstep) w rampach.
const gladko = (x) => x * x * (3 - 2 * x);
function predkosc(t) {
  if (t <= a || t >= b) return 1;
  const v = 1 / K;
  if (t < OD) return 1 + (v - 1) * gladko((t - a) / Math.max(1e-6, OD - a));
  if (t > DO) return v + (1 - v) * gladko((t - DO) / Math.max(1e-6, b - DO));
  return v;
}
// Mapa czasu: wynik T(t) = ∫ 1/v(t) dt (krok 1 ms)
const KROK = 0.001, mapa = [[0, 0]];
for (let t = KROK, T = 0; t <= m.duration + 1e-9; t += KROK) { T += KROK / predkosc(t - KROK / 2); mapa.push([+t.toFixed(3), +T.toFixed(4)]); }
const czasWyniku = (t) => { const i = Math.min(mapa.length - 1, Math.max(0, Math.round(t / KROK))); return mapa[i][1]; };
const czasPliku = (T) => { let lo = 0, hi = mapa.length - 1; while (lo < hi) { const s = (lo + hi) >> 1; if (mapa[s][1] < T) lo = s + 1; else hi = s; } return mapa[lo][0]; };
const DUR = czasWyniku(m.duration);
info(`Slow motion ${plikArg}: ${OD}-${DO} s wolniej ${K}x, rampy ${RAMPA} s. Klip ${m.duration.toFixed(1)} s -> ${DUR.toFixed(1)} s (${ai ? "RIFE na karcie graficznej" : "ffmpeg"}).`);

function gpu() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "rife-gpu-"));
  ff(["-f", "lavfi", "-i", "color=c=gray:s=32x32", "-frames:v", "2", path.join(tmp, "%08d.png")], "Test karty");
  fs.mkdirSync(path.join(tmp, "o"));
  const r = uruchom(RIFE, ["-i", tmp, "-o", path.join(tmp, "o"), "-n", "3", "-m", "rife-v4.6"], { cicho: true, cwd: RIFE_DIR });
  fs.rmSync(tmp, { recursive: true, force: true });
  const karty = [...new Set([...(r.stderr + r.stdout).matchAll(/^\[(\d+) ([^\]]+)\]/gm)].map((x) => `${x[1]}|${x[2]}`))].map((s) => s.split("|"));
  const d = karty.find(([, n]) => /nvidia|geforce|rtx|gtx|radeon rx|arc/i.test(n));
  if (d) info(`Karta graficzna: ${d[1]}`);
  return d ? d[0] : null;
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "zwolnij-"));
try {
  // 1. Klatki źródła 30 kl/s (1080x1920 jak proxy)
  const kl = path.join(tmp, "kl"); fs.mkdirSync(kl);
  ff(["-i", src, "-vf", "fps=30,scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1", "-q:v", "1", path.join(kl, "%06d.jpg")], "Wyciąganie klatek");
  const N = fs.readdirSync(kl).filter((f) => f.endsWith(".jpg")).length;
  const plikKl = (i) => path.join(kl, String(Math.min(N, Math.max(1, i + 1))).padStart(6, "0") + ".jpg");
  // 2. Gęste klatki fragmentu [a,b]: K razy więcej (RIFE albo minterpolate)
  const i0 = Math.max(0, Math.floor(a * FPS) - 1), i1 = Math.min(N - 1, Math.ceil(b * FPS) + 1);
  const gest = path.join(tmp, "gest"); fs.mkdirSync(gest);
  let nG = 0;
  if (ai) {
    const wej = path.join(tmp, "wej"); fs.mkdirSync(wej);
    for (let i = i0; i <= i1; i++) fs.copyFileSync(plikKl(i), path.join(wej, String(i - i0 + 1).padStart(8, "0") + ".jpg"));
    const n = i1 - i0 + 1, cel = (n - 1) * K + 1;
    const g = gpu();
    info(`RIFE: ${n} klatek -> ${cel}...`);
    const r = uruchom(RIFE, ["-i", wej, "-o", gest, "-n", String(cel), "-m", "rife-v4.6", "-f", "%08d.jpg", ...(g != null ? ["-g", g] : [])], { cicho: true, cwd: RIFE_DIR, timeout: 60 * 60 * 1000 });
    if (r.code !== 0) blad("RIFE się nie udał.", (r.stderr || "").split(/\r?\n/).slice(-5).join(" ") + " Spróbuj --bez-ai.");
    nG = fs.readdirSync(gest).length;
  } else {
    ff(["-framerate", "30", "-start_number", String(i0 + 1), "-i", path.join(kl, "%06d.jpg"), "-frames:v", String(i1 - i0 + 1), "-vf", `minterpolate=fps=${30 * K}:mi_mode=mci:mc_mode=aobmc:vsbmc=1`, "-q:v", "2", path.join(gest, "%08d.jpg")], "Interpolacja ffmpeg");
    nG = fs.readdirSync(gest).length;
  }
  const gesteNazwy = fs.readdirSync(gest).sort();
  const plikG = (j) => path.join(gest, gesteNazwy[Math.min(nG - 1, Math.max(0, j))]);
  // 3. Sekwencja wyniku: klatka k wyniku -> czas pliku -> klatka (gęsta w [a,b], zwykła poza).
  //    Klatka i pliku leży w czasie i/FPS; gęsta j w czasie (i0 + j*(i1-i0)/(nG-1))/FPS.
  const ileWyn = Math.round(DUR * FPS);
  const sek = path.join(tmp, "sek"); fs.mkdirSync(sek);
  const krokG = (i1 - i0) / Math.max(1, nG - 1);
  for (let k = 0; k < ileWyn; k++) {
    const t = czasPliku(k / FPS);
    const p = t > a && t < b ? plikG(Math.round((t * FPS - i0) / krokG)) : plikKl(Math.round(t * FPS));
    const cel = path.join(sek, String(k + 1).padStart(6, "0") + ".jpg");
    try { fs.linkSync(p, cel); } catch { fs.copyFileSync(p, cel); }
  }
  // 4. Dźwięk: normalne tempo przed i po, cisza w zwolnieniu
  let audio = ["-map", "0:v"];
  if (m.hasAudio) {
    const czesci = [], fc = [];
    if (a > 0.02) { fc.push(`[1:a]atrim=0:${a},asetpts=PTS-STARTPTS,aresample=48000,aformat=channel_layouts=stereo[p]`); czesci.push("[p]"); }
    fc.push(`anullsrc=r=48000:cl=stereo,atrim=0:${(czasWyniku(b) - czasWyniku(a)).toFixed(3)}[c]`); czesci.push("[c]");
    if (b < m.duration - 0.02) { fc.push(`[1:a]atrim=${b},asetpts=PTS-STARTPTS,aresample=48000,aformat=channel_layouts=stereo[k]`); czesci.push("[k]"); }
    fc.push(`${czesci.join("")}concat=n=${czesci.length}:v=0:a=1[a]`);
    audio = ["-i", src, "-filter_complex", fc.join(";"), "-map", "0:v", "-map", "[a]", "-c:a", "aac", "-b:a", "192k"];
  }
  info("Kodowanie...");
  ff(["-framerate", "30", "-i", path.join(sek, "%06d.jpg"), ...audio, "-vf", "format=yuv420p", "-c:v", "libx264", "-preset", "medium", "-crf", "17", "-g", "30", "-movflags", "+faststart", "-t", DUR.toFixed(3), out.replace(/.mp4$/, ".czesc.mp4")], "Kodowanie");
  fs.rmSync(out, { force: true });
  fs.renameSync(out.replace(/.mp4$/, ".czesc.mp4"), out);
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
const co10ms = mapa.filter((_, i) => i % 10 === 0);
fs.writeFileSync(out.replace(/\.mp4$/, ".json"), JSON.stringify({ zrodlo: plikArg, od: OD, do: DO, sila: K, rampa: RAMPA, ai, mapa: co10ms }) + "\n");
ok(`${outRel} (${ffprobe(out).duration.toFixed(1)} s, fragment ${OD}-${DO} s wolniej ${K}x)`);

if (podmien) {
  const rj = path.join(proj, "kompozycja", "rolka.json");
  if (!fs.existsSync(rj)) uwaga("Brak rolka.json, nic nie podmieniam.");
  else {
    const r = JSON.parse(fs.readFileSync(rj, "utf8"));
    const T = (t) => +czasWyniku(Number(t) || 0).toFixed(3);
    let n = 0;
    for (const u of r.ujecia || []) {
      if (u.src !== plikArg) continue;
      u.src = outRel; n++;
      const od0 = Number(u.od || 0);
      // dźwięki zabiegu (start względem początku ujęcia) jadą razem z obrazem
      if (Array.isArray(u.foley)) u.foley = u.foley.map((f) => ({ ...f, start: +(T(od0 + Number(f.start || 0)) - T(od0)).toFixed(3) }));
      if (u.od != null) u.od = T(u.od);
      if (u.do != null) u.do = T(u.do); else u.do = +DUR.toFixed(3);
      if (Array.isArray(u.segmenty)) u.segmenty = u.segmenty.map(([x, y]) => [T(x), T(y)]);
      if (u.zoom_na?.start != null) u.zoom_na.start = T(u.zoom_na.start);
    }
    fs.writeFileSync(rj, JSON.stringify(r, null, 2) + "\n", "utf8");
    ok(`Podmieniono w rolka.json: ${n} (od/do przeliczone na nowy czas)`);
  }
}

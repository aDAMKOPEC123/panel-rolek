// Ulepszanie obrazu: upscaling (AI albo szybki) + wygładzanie krawędzi. Wszystko darmowe i lokalne.
//
//   npm run ulepsz -- <projekt> proxy/<klip>.mp4 [--szybki] [--sila 50] [--wygladz 50] [--podmien]
//       -> proxy/<klip>_hd.mp4 (1080x1920). Dla słabych/rozmazanych klipów (np. z WhatsAppa, mocny kadr/zoom).
//   npm run ulepsz -- <projekt> raw/<zdjecie>.jpg [...]          -> raw/<zdjecie>_hd.png (zdjęcie: model x4plus)
//   npm run ulepsz -- <projekt> --final [--szybki] [...]         -> final/<nazwa>_4K.mp4 (2160x3840)
//   npm run ulepsz -- <projekt> wyciete/<plik>.webm --krawedzie [--wygladz 50]
//       -> wygładza obwódkę wyciętej postaci (kopia oryginału: wyciete/<plik>_surowe.webm)
//
// AI = Real-ESRGAN ncnn (Vulkan, karta graficzna), program w narzedzia/realesrgan/.
//   Wideo: model realesr-animevideov3 x2 (ok. 0,2-0,7 s na klatkę na RTX 3050), zdjęcia: realesrgan-x4plus.
//   Wynik AI jest MIESZANY z klasycznym skalowaniem (--sila, domyślnie 50%): AI ostrzy kontury,
//   oryginał trzyma teksturę skóry. Zasada marki: nigdy nie wygładzamy skóry, więc nie dajemy 100% AI.
// --szybki = bez AI: Lanczos + wyostrzanie CAS (sekundy zamiast minut).
// --wygladz 0-100 = antyaliasing tylko na krawędziach (maska z edgedetect) + lekki szum czasowy. 0 = wyłącz.
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import { blad, ok, info, uwaga, znajdzProjekt, uruchom, ffprobe, wczytajConfig, zapiszBezpiecznie, ROOT, ROZSZ_OBRAZ, ROZSZ_WIDEO } from "./lib.mjs";

const args = process.argv.slice(2);
const flaga = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args.splice(i, 2)[1] : d; };
const cfg = wczytajConfig().ulepszanie || {};
const procent = (v, d) => Math.min(100, Math.max(0, Number(v ?? d)));
const sila = procent(flaga("--sila", cfg.sila_ai), 50) / 100;
const wygladz = procent(flaga("--wygladz", cfg.wygladzanie), 50) / 100;
const szybki = args.includes("--szybki");
const podmien = args.includes("--podmien");
const trybFinal = args.includes("--final");
const krawedzie = args.includes("--krawedzie");
const [pArg, plikArg] = args.filter((a) => !a.startsWith("--"));
const proj = znajdzProjekt(pArg);

const ESR_DIR = path.join(ROOT, "narzedzia", "realesrgan");
const ESR = path.join(ESR_DIR, process.platform === "win32" ? "realesrgan-ncnn-vulkan.exe" : "realesrgan-ncnn-vulkan");
const PARTIA = 60; // klatek na raz: ogranicza miejsce na dysku przy długich klipach

const rel = (p) => path.relative(proj, p).split(path.sep).join("/");
// Porzucone foldery robocze upscalingu starsze niż 3 dni (przerwane i nigdy niewznowione) zajmują setki MB.
try {
  for (const d of fs.readdirSync(os.tmpdir())) {
    if (!/^ulepsz-/.test(d)) continue;
    const p = path.join(os.tmpdir(), d);
    if (Date.now() - fs.statSync(p).mtimeMs > 3 * 864e5) fs.rmSync(p, { recursive: true, force: true });
  }
} catch {}
const ff = (argv, opis) => {
  const r = uruchom("ffmpeg", ["-hide_banner", "-y", "-loglevel", "error", ...argv], { cicho: true });
  if (r.code !== 0) blad(`${opis} się nie udało.`, r.stderr.slice(-500));
};

// ---------- filtry ----------
// Antyaliasing krawędzi: rozmycie wchodzi TYLKO tam, gdzie maska krawędzi (płaska skóra zostaje nietknięta).
function filtrKrawedzi(w, wideo = true) {
  if (w <= 0) return "";
  const sigma = (0.45 + w * 0.9).toFixed(2);
  const szum = (w * 3).toFixed(1);
  // hqdn3d tylko w czasie (0 przestrzennie): uspokaja migotanie krawędzi, nie rusza tekstury skóry
  return `${wideo ? `,hqdn3d=0:0:${szum}:${szum}` : ""},split=3[k_o][k_e][k_s];[k_e]edgedetect=low=0.05:high=0.16,gblur=sigma=1.4[k_m];[k_s]gblur=sigma=${sigma}[k_b];[k_o][k_b][k_m]maskedmerge=planes=1`;
}
const klasyczne = (W, H) => `scale=${W}:${H}:flags=lanczos+accurate_rnd+full_chroma_int`;

// ---------- Real-ESRGAN ----------
function wymagajAI() {
  if (!fs.existsSync(ESR)) blad("Brak programu Real-ESRGAN w narzedzia/realesrgan/.",
    "Pobierz realesrgan-ncnn-vulkan-20220424-windows.zip z github.com/xinntao/Real-ESRGAN/releases (v0.2.5.0) i rozpakuj do narzedzia/realesrgan/. Albo użyj --szybki.");
}
let gpuCache;
function gpu() {
  if (gpuCache !== undefined) return gpuCache;
  if (cfg.gpu != null) return (gpuCache = String(cfg.gpu));
  // Wybierz kartę dedykowaną (NVIDIA / Radeon RX / Arc), nie zintegrowaną.
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "esr-gpu-"));
  ff(["-f", "lavfi", "-i", "color=c=gray:s=16x16", "-frames:v", "1", path.join(tmp, "a.png")], "Test karty");
  const r = uruchom(ESR, ["-i", path.join(tmp, "a.png"), "-o", path.join(tmp, "b.png"), "-n", "realesr-animevideov3-x2", "-s", "2"], { cicho: true, cwd: ESR_DIR });
  fs.rmSync(tmp, { recursive: true, force: true });
  const karty = [...new Set([...(r.stderr + r.stdout).matchAll(/^\[(\d+) ([^\]]+)\]/gm)].map((m) => `${m[1]}|${m[2]}`))].map((s) => s.split("|"));
  const dedykowana = karty.find(([, n]) => /nvidia|geforce|rtx|gtx|radeon rx|arc/i.test(n));
  gpuCache = dedykowana ? dedykowana[0] : null;
  if (karty.length) info(`Karta graficzna: ${(dedykowana || karty[0])[1]}`);
  return gpuCache;
}
function esr(wej, wyj, model, skala) {
  const g = gpu();
  const r = uruchom(ESR, ["-i", wej, "-o", wyj, "-n", model, "-s", String(skala), "-f", "png", ...(g != null ? ["-g", g] : [])], { cicho: true, cwd: ESR_DIR });
  if (r.code !== 0) blad("Real-ESRGAN się nie udał.", (r.stderr || "").split(/\r?\n/).filter((l) => !/^[\d,.]+%$/.test(l.trim())).slice(-6).join(" ") + " Spróbuj --szybki albo zaktualizuj sterownik karty.");
}

// ---------- wideo ----------
// W x H = wymiar wyniku. AI: model x2 na oryginalnej rozdzielczości, potem skalowanie do W x H (nadpróbkowanie).
function ulepszWideo(src, out, W, H, kodowanie) {
  const m = ffprobe(src);
  if (!m.hasVideo) blad(`${rel(src)} nie ma obrazu.`);
  const fps = m.fps > 0 && m.fps < 121 ? m.fps : 30;
  const audio = m.hasAudio ? ["-map", "1:a:0", "-c:a", "aac", "-b:a", "192k"] : [];
  const enc = ["-c:v", "libx264", "-preset", "slow", "-pix_fmt", "yuv420p", ...kodowanie, "-movflags", "+faststart"];
  const aa = filtrKrawedzi(wygladz);

  if (szybki) {
    info(`Szybkie ulepszanie ${rel(src)} -> ${W}x${H} (Lanczos + CAS${aa ? " + wygładzanie krawędzi" : ""})...`);
    zapiszBezpiecznie(out, (cel) => ff(["-i", src, "-i", src, "-filter_complex", `[0:v]${klasyczne(W, H)},cas=0.45${aa},format=yuv420p[v]`, "-map", "[v]", ...audio, "-r", String(fps), ...enc, cel], "Skalowanie"));
    return;
  }
  wymagajAI();
  const klatki = Math.max(1, Math.round(m.duration * fps));
  const sPerKl = m.width * m.height > 1.2e6 ? 0.75 : 0.25;
  // Folder roboczy zależy od pliku i ustawień: po przerwaniu (zamknięty panel, wyłączony komputer)
  // ponowne uruchomienie tego samego zadania bierze gotowe partie i liczy tylko resztę.
  const st = fs.statSync(src);
  const klucz = crypto.createHash("sha1").update([path.resolve(src), st.size, Math.round(st.mtimeMs), W, H, sila, wygladz, PARTIA].join("|")).digest("hex").slice(0, 12);
  const tmp = path.join(os.tmpdir(), `ulepsz-${klucz}`);
  const kl = path.join(tmp, "kl");
  zajmijFolder(tmp, rel(src));
  if (!fs.existsSync(path.join(kl, ".gotowe"))) {
    // świeży start: czyścimy wszystko oprócz własnej blokady
    for (const f of fs.readdirSync(tmp)) if (f !== "blokada.json") usun(path.join(tmp, f));
    fs.mkdirSync(kl, { recursive: true });
    // Klatki źródła (bez obrotu: ffmpeg sam stosuje rotację z metadanych)
    ff(["-i", src, "-fps_mode", "cfr", "-r", String(fps), "-q:v", "1", path.join(kl, "%06d.jpg")], "Wyciąganie klatek");
    fs.writeFileSync(path.join(kl, ".gotowe"), "");
  }
  const pliki = fs.readdirSync(kl).filter((f) => f.endsWith(".jpg")).sort();
  const partii = Math.ceil(pliki.length / PARTIA);
  const segOk = (p) => fs.existsSync(path.join(tmp, `seg${String(p).padStart(4, "0")}.ok`));
  const gotowe = Array.from({ length: partii }, (_, p) => p).filter(segOk).length;
  const zostalo = pliki.length - Math.min(pliki.length, gotowe * PARTIA);
  if (gotowe) info(`Wznawiam przerwany upscaling: ${gotowe} z ${partii} partii już gotowe, liczę resztę.`);
  info(`Upscaling AI ${rel(src)}: ${pliki.length} klatek (zostało ${zostalo}), ok. ${Math.max(1, Math.round((zostalo * sPerKl) / 60))} min na karcie graficznej. udział AI ${Math.round(sila * 100)}/100, wygładzanie ${Math.round(wygladz * 100)}/100.`);
  const segmenty = [];
  for (let p = 0; p < partii; p++) {
    const seg = path.join(tmp, `seg${String(p).padStart(4, "0")}.mp4`);
    segmenty.push(seg);
    if (segOk(p)) continue;
    const wej = path.join(tmp, "wej"), wyj = path.join(tmp, "wyj");
    usun(wej); usun(wyj);
    fs.mkdirSync(wej); fs.mkdirSync(wyj);
    // kopie (nie przenoszenie): klatki zostają w kl/, więc partię da się policzyć jeszcze raz po przerwaniu
    pliki.slice(p * PARTIA, (p + 1) * PARTIA).forEach((f, k) => { const cel = path.join(wej, `${String(k + 1).padStart(6, "0")}.jpg`); try { fs.linkSync(path.join(kl, f), cel); } catch { fs.copyFileSync(path.join(kl, f), cel); } });
    esr(wej, wyj, "realesr-animevideov3-x2", 2);
    const nWej = fs.readdirSync(wej).length, nWyj = fs.readdirSync(wyj).filter((f) => f.endsWith(".png")).length;
    if (nWyj < nWej) blad(`Real-ESRGAN oddał ${nWyj} z ${nWej} klatek w partii ${p + 1}.`, "Uruchom jeszcze raz (wznowi od tej partii). Jeśli się powtarza: zaktualizuj sterownik karty albo użyj „Szybko”.");
    // [0] = AI (png), [1] = oryginał (jpg) -> oba do W x H, mieszanie, antyaliasing krawędzi
    const segTmp = seg.replace(/\.mp4$/, ".czesc.mp4");
    ff(["-framerate", String(fps), "-i", path.join(wyj, "%06d.png"), "-framerate", String(fps), "-i", path.join(wej, "%06d.jpg"),
      "-filter_complex", `[0:v]scale=${W}:${H}:flags=area,format=gbrp[ai];[1:v]${klasyczne(W, H)},format=gbrp[kl];[ai][kl]blend=all_mode=normal:all_opacity=${sila.toFixed(2)},format=yuv420p${aa}[v]`,
      "-map", "[v]", "-c:v", "libx264", "-preset", "medium", "-crf", "10", "-pix_fmt", "yuv420p", "-r", String(fps), segTmp], "Składanie partii klatek");
    fs.renameSync(segTmp, seg);
    fs.writeFileSync(seg.replace(/\.mp4$/, ".ok"), "");
    info(`Postęp: ${Math.round((Math.min((p + 1) * PARTIA, pliki.length) / pliki.length) * 100)}%`);
  }
  fs.writeFileSync(path.join(tmp, "lista.txt"), segmenty.map((s) => `file '${s.replace(/\\/g, "/")}'`).join("\n"));
  info("Końcowe kodowanie...");
  zapiszBezpiecznie(out, (cel) => ff(["-f", "concat", "-safe", "0", "-i", path.join(tmp, "lista.txt"), "-i", src, "-map", "0:v", ...audio, "-r", String(fps), "-t", String(m.duration), ...enc, cel], "Końcowe kodowanie"));
  usun(tmp); // tylko po sukcesie; po przerwaniu zostaje do wznowienia
}

// Usuwanie z ponowieniami: Windows potrafi chwilę trzymać plik (antywirus, kończący się proces).
function usun(p) { fs.rmSync(p, { recursive: true, force: true, maxRetries: 8, retryDelay: 400 }); }

// Czy proces o tym PID działa. ESRCH = nie ma go; EPERM (Windows, inny użytkownik/poziom) = istnieje.
function zyje(pid) { try { process.kill(pid, 0); return true; } catch (e) { return e.code === "EPERM"; } }

// Jedno zadanie na folder roboczy. Gdy poprzednie zadanie zginęło razem z panelem, jego Real-ESRGAN
// mógł zostać i dalej pisać do tego folderu: zamykamy takie sieroty, zanim zaczniemy.
function zajmijFolder(tmp, nazwa) {
  fs.mkdirSync(tmp, { recursive: true });
  const blok = path.join(tmp, "blokada.json");
  let pid = null;
  try { pid = JSON.parse(fs.readFileSync(blok, "utf8")).pid; } catch {}
  if (pid && pid !== process.pid && zyje(pid)) blad(`Upscaling ${nazwa} już trwa w innym zadaniu.`, "Poczekaj, aż skończy (pasek zadania w panelu), albo zatrzymaj tamto zadanie.");
  fs.writeFileSync(blok, JSON.stringify({ pid: process.pid, start: new Date().toISOString() }));
  process.on("exit", () => { try { if (JSON.parse(fs.readFileSync(blok, "utf8")).pid === process.pid) fs.rmSync(blok, { force: true }); } catch {} });
  if (process.platform === "win32") {
    const zaw = tmp.replace(/'/g, "''");
    uruchom("powershell", ["-NoProfile", "-Command", `Get-CimInstance Win32_Process -Filter "Name='realesrgan-ncnn-vulkan.exe'" | Where-Object { $_.CommandLine -like '*${zaw}*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }`], { cicho: true });
  }
}

// ---------- zdjęcie ----------
function ulepszZdjecie(src, out) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ulepsz-img-"));
  try {
    const wej = path.join(tmp, "a.png"), wyj = path.join(tmp, "b.png");
    ff(["-i", src, "-frames:v", "1", wej], "Odczyt zdjęcia");
    const m = ffprobe(wej);
    // Cel: dłuższy bok min. 1920 (pełny kadr rolki), maks. 4x
    const k = Math.min(4, Math.max(1, 1920 / Math.max(m.width, m.height)));
    const W = Math.round((m.width * k) / 2) * 2, H = Math.round((m.height * k) / 2) * 2;
    const aa = filtrKrawedzi(wygladz, false);
    if (szybki) {
      info(`Szybkie ulepszanie zdjęcia -> ${W}x${H}...`);
      zapiszBezpiecznie(out, (cel) => ff(["-i", wej, "-filter_complex", `[0:v]${klasyczne(W, H)},cas=0.45,format=yuv444p${aa}[v]`, "-map", "[v]", "-frames:v", "1", cel], "Skalowanie zdjęcia"));
      return;
    }
    wymagajAI();
    info(`Upscaling AI zdjęcia (${m.width}x${m.height} -> ${W}x${H}, model x4plus, ok. 10-30 s)...`);
    esr(wej, wyj, "realesrgan-x4plus", 4);
    ff(["-i", wyj, "-i", wej, "-filter_complex", `[0:v]scale=${W}:${H}:flags=area,format=gbrp[ai];[1:v]${klasyczne(W, H)},format=gbrp[kl];[ai][kl]blend=all_mode=normal:all_opacity=${sila.toFixed(2)},format=yuv444p${aa}[v]`,
      "-map", "[v]", "-frames:v", "1", out], "Składanie zdjęcia");
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

// ---------- krawędzie wyciętej postaci ----------
// Alfa: lekkie zwężenie (usuwa jasną/ciemną obwódkę z tła) + rozmycie przejścia.
function wygladzWyciecie(src) {
  const w = wygladz;
  const sigma = (0.6 + w * 1.6).toFixed(2);
  const obraz = ROZSZ_OBRAZ.test(src);
  const ext = path.extname(src);
  const surowe = src.replace(new RegExp(`${ext}$`), `_surowe${ext}`);
  const zrodlo = fs.existsSync(surowe) ? surowe : src; // ponowne wygładzanie zawsze z oryginału
  if (zrodlo === src) fs.copyFileSync(src, surowe);
  if (w <= 0) { fs.copyFileSync(surowe, src); ok(`${rel(src)}: przywrócone surowe krawędzie`); return; }
  const tmp = src.replace(new RegExp(`${ext}$`), `_tmp${ext}`);
  const fc = `[0:v]format=${obraz ? "rgba" : "yuva420p"},split[c][a];[a]alphaextract,erosion${w > 0.6 ? ",erosion" : ""},gblur=sigma=${sigma}[m];[c][m]alphamerge[v]`;
  info(`Wygładzam krawędzie wycięcia ${rel(src)} (miękkość ${Math.round(w * 100)}/100)...`);
  if (obraz) ff(["-i", zrodlo, "-filter_complex", fc, "-map", "[v]", "-frames:v", "1", tmp], "Wygładzanie krawędzi");
  else ff(["-c:v", "libvpx-vp9", "-i", zrodlo, "-filter_complex", fc, "-map", "[v]", "-an", "-c:v", "libvpx-vp9", "-pix_fmt", "yuva420p",
    "-crf", "22", "-b:v", "0", "-row-mt", "1", "-deadline", "good", "-cpu-used", "3", "-auto-alt-ref", "0", "-metadata:s:v:0", "alpha_mode=1", tmp], "Wygładzanie krawędzi");
  fs.renameSync(tmp, src);
  ok(`${rel(src)} (oryginał: ${rel(surowe)})`);
}

// ---------- start ----------
if (trybFinal) {
  const nazwa = path.basename(proj);
  const src = path.join(proj, "final", `${nazwa}.mp4`);
  if (!fs.existsSync(src)) blad("Nie ma jeszcze finalu.", "Najpierw kliknij „Final” w kroku Render (npm run render -- <projekt> --final).");
  const out = path.join(proj, "final", `${nazwa}_4K.mp4`);
  ulepszWideo(src, out, 2160, 3840, ["-crf", "16", "-maxrate", "40M", "-bufsize", "80M", "-level", "5.1"]);
  ok(`${rel(out)} (2160x3840, ${ffprobe(out).duration.toFixed(1)} s)`);
  info("Wgraj na Instagram/TikTok wersję _4K: po ich kompresji zostaje więcej detalu.");
} else {
  if (!plikArg) blad("Podaj plik albo --final.", "np. npm run ulepsz -- <projekt> proxy/M2_zblizenie.mp4  albo  npm run ulepsz -- <projekt> --final");
  const src = path.isAbsolute(plikArg) ? plikArg : path.join(proj, plikArg);
  if (!fs.existsSync(src)) blad(`Nie ma pliku ${plikArg}.`, "Ścieżka względem folderu rolki, np. proxy/IMG_0002.mp4");
  if (krawedzie) {
    if (!/[\\/]wyciete[\\/]/.test(src)) uwaga("--krawedzie jest dla plików z wyciete/ (przezroczyste tło).");
    wygladzWyciecie(src);
  } else if (ROZSZ_OBRAZ.test(src) || ROZSZ_WIDEO.test(src)) {
    const base = path.parse(src).name.replace(/_hd$/, "");
    let out;
    if (ROZSZ_OBRAZ.test(src)) {
      out = path.join(path.dirname(src), `${base}_hd.png`);
      ulepszZdjecie(src, out);
      ok(`${rel(out)}`);
    } else {
      out = path.join(path.dirname(src), `${base}_hd.mp4`);
      ulepszWideo(src, out, 1080, 1920, ["-crf", "17", "-g", "30"]);
      ok(`${rel(out)} (1080x1920, ${ffprobe(out).duration.toFixed(1)} s)`);
    }
    if (podmien) {
      const rj = path.join(proj, "kompozycja", "rolka.json");
      if (!fs.existsSync(rj)) uwaga("Brak kompozycja/rolka.json, nic nie podmieniam.");
      else {
        const r = JSON.parse(fs.readFileSync(rj, "utf8"));
        const stary = rel(src), nowy = rel(out);
        let n = 0;
        for (const u of r.ujecia || []) {
          if (u.src === stary) { u.src = nowy; n++; }
          for (const p of u.przebitki || []) if (p.src === stary) { p.src = nowy; n++; }
        }
        fs.writeFileSync(rj, JSON.stringify(r, null, 2) + "\n", "utf8");
        ok(`Podmieniono w rolka.json: ${n}`);
      }
    }
  } else blad(`Nie znam typu pliku ${plikArg}.`, "Obsługuję wideo (mp4, mov...) i zdjęcia (jpg, png...).");
}

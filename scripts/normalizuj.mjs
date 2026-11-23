// Normalizacja nagrań z telefonu: raw/ -> proxy/ (wideo) i raw/ -> audio/ (pliki audio).
//   npm run normalizuj -- <projekt> [plik ...] [--cisza] [--prog -32dB] [--margines 0.25s] [--bez-glosnosci]
// Wideo: pion 1080x1920 (scale + crop do środka), 30 fps CFR, H.264 yuv420p, keyframe co 1 s,
//        korekta obrotu z telefonu (autorotate), HDR (iPhone HLG/Dolby) -> SDR,
//        głośność -14 LUFS (loudnorm dwuprzebiegowy), AAC 48 kHz.
// --cisza: najpierw auto-editor wycina ciszę i "yyy". Próg łagodny, margines 0.25 s, żeby nie ciąć oddechów.
// Czysty głos (rolka.json -> efekty.czysty_glos, domyślnie tak; --surowy-dzwiek wyłącza): w klipach z mową
//   filtr dudnienia 80 Hz, odszumianie, łagodzenie syknięć, delikatna kompresja, potem loudnorm.
// Obraz (efekty.korekta_obrazu, domyślnie tak; --bez-korekty wyłącza): pomiar jasności, przepaleń i odcienia
//   każdego klipu (proxy/.obraz.json, ostrzeżenia w panelu) + łagodne rozjaśnienie zbyt ciemnych ujęć.
//   Nigdy nie podbijamy nasycenia ani nie wygładzamy skóry.
// Grading marki (config.json -> obraz.grading, --bez-gradingu wyłącza): stały look po skalowaniu, patrz GRADINGI.
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  uruchom, blad, ok, info, uwaga, szary, wczytajConfig, znajdzProjekt, ffprobe, wymagaj, IS_WIN, q,
  ROZSZ_WIDEO, ROZSZ_AUDIO, ROZSZ_OBRAZ,
} from "./lib.mjs";

const cfg = wczytajConfig();
const args = process.argv.slice(2);
const flaga = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args.splice(i, 2)[1] : d; };
const PROG = flaga("--prog", cfg.audio?.auto_editor_prog || "-32dB");
const MARGINES = flaga("--margines", cfg.audio?.auto_editor_margines || "0.25s");
const cisza = args.includes("--cisza");
const bezGlosnosci = args.includes("--bez-glosnosci");
const pos = args.filter((a) => !a.startsWith("--"));
const proj = znajdzProjekt(pos[0]);
const LUFS = Number(cfg.audio?.lufs_cel ?? -14);
const rolkaEf = (() => { try { return JSON.parse(fs.readFileSync(path.join(proj, "kompozycja", "rolka.json"), "utf8")).efekty || {}; } catch { return {}; } })();
const czystyGlos = !args.includes("--surowy-dzwiek") && rolkaEf.czysty_glos !== false;
const korektaObrazu = !args.includes("--bez-korekty") && rolkaEf.korekta_obrazu !== false;
// Grading marki (config.json -> obraz.grading, rolka.json -> efekty.grading: false wyłącza, nazwa podmienia).
// "jasny-premium": podbite światła, podniesiona czerń (bez crushu), niski kontrast, lekko ciepło, odrobinę mniej koloru.
const GRADINGI = {
  "jasny-premium": "curves=all='0/0.045 0.25/0.29 0.6/0.65 1/0.98',eq=contrast=0.95:saturation=0.93,colorbalance=rm=0.015:bm=-0.015:rh=0.01:bh=-0.012",
};
const nazwaGradingu = args.includes("--bez-gradingu") || rolkaEf.grading === false ? null : (typeof rolkaEf.grading === "string" ? rolkaEf.grading : cfg.obraz?.grading || null);
const GRADING = nazwaGradingu ? GRADINGI[nazwaGradingu] || null : null;
if (nazwaGradingu && !GRADING) uwaga(`Nieznany grading "${nazwaGradingu}". Dostępne: ${Object.keys(GRADINGI).join(", ")}.`);
// Łańcuch głosu: dudnienie i trzaski mikrofonu < 80 Hz, szum tła gabinetu, syknięcia s/sz/cz, wyrównanie dynamiki.
const GLOS = "highpass=f=80,afftdn=nr=10:nf=-40:tn=1,deesser=i=0.3,acompressor=threshold=-22dB:ratio=2.5:attack=8:release=160:makeup=1.5";
const OBRAZ_JSON = path.join(proj, "proxy", ".obraz.json");
const obrazy = (() => { try { return JSON.parse(fs.readFileSync(OBRAZ_JSON, "utf8")); } catch { return {}; } })();
// Pomiar obrazu (co 0,5 s, miniatura): jasność, przepalenia, cienie, odcień (U/V wokół 128).
function pomiarObrazu(plik) {
  const r = uruchom("ffmpeg", ["-hide_banner", "-nostats", "-i", plik, "-an", "-vf", "fps=2,scale=180:320,signalstats,metadata=print:file=-", "-f", "null", "-"], { cicho: true });
  const wart = (k) => [...r.stdout.matchAll(new RegExp(`signalstats\\.${k}=([\\d.]+)`, "g"))].map((x) => Number(x[1]));
  const sr = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
  const yavg = sr(wart("YAVG")), yhigh = wart("YHIGH"), ylow = wart("YLOW"), u = sr(wart("UAVG")), v = sr(wart("VAVG"));
  if (yavg == null) return null;
  const przep = yhigh.filter((x) => x >= 245).length / Math.max(1, yhigh.length);
  const cien = ylow.filter((x) => x <= 18).length / Math.max(1, ylow.length);
  const uwagi = [];
  if (yavg < 70) uwagi.push("za ciemne");
  else if (yavg < 90) uwagi.push("trochę ciemne");
  if (yavg > 190) uwagi.push("za jasne");
  if (przep > 0.4) uwagi.push("przepalone jasne miejsca");
  if (cien > 0.5 && yavg < 100) uwagi.push("zapchane cienie");
  if (u - 128 > 7) uwagi.push("niebieski odcień (zimne światło)");
  if (128 - u > 22 && v - 128 > 12) uwagi.push("żółto-pomarańczowy odcień (ciepła żarówka)");
  if (v - 128 < -3) uwagi.push("zielonkawy odcień (świetlówka)");
  return { jasnosc: Math.round(yavg), przepalenia: Math.round(przep * 100), u: Math.round(u - 128), v: Math.round(v - 128), uwagi };
}
const FPS = Number(cfg.rolka?.fps || 30);

wymagaj("ffmpeg", IS_WIN ? "winget install Gyan.FFmpeg" : "brew install ffmpeg");
if (cisza) wymagaj("auto-editor", "pip install auto-editor");

const RAW = path.join(proj, "raw");
let pliki = pos.slice(1).map((p) => path.basename(p));
if (!pliki.length) pliki = fs.readdirSync(RAW).filter((n) => ROZSZ_WIDEO.test(n) || ROZSZ_AUDIO.test(n));
if (!pliki.length) blad("W raw/ nie ma nagrań do normalizacji.", "Wrzuć pliki z telefonu do raw/ albo użyj: npm run inbox -- --do <projekt>");

function ff(argv, opis) {
  const r = uruchom("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...argv], { cicho: true });
  if (r.code !== 0) blad(`ffmpeg: ${opis}\n${r.stderr.slice(-1200)}`, "Sprawdź plik (czy się odtwarza) i spróbuj ponownie.");
}

function pomiarLoudnorm(plik, pre = "") {
  const r = uruchom("ffmpeg", ["-hide_banner", "-nostats", "-i", plik, "-vn", "-af", `${pre}loudnorm=I=${LUFS}:TP=-1.5:LRA=11:print_format=json`, "-f", "null", "-"], { cicho: true });
  const m = r.stderr.match(/\{[\s\S]*?"input_i"[\s\S]*?\}/);
  if (!m) return null;
  const j = JSON.parse(m[0]);
  // Cisza albo sam szum tła (b-roll bez mowy): nie podbijamy go do -14 LUFS, bo wyszedłby głośny szum.
  if (!isFinite(Number(j.input_i)) || Number(j.input_i) < -42) return null;
  return j;
}

for (const n of pliki) {
  const src = path.join(RAW, n);
  if (!fs.existsSync(src)) { uwaga(`Brak pliku raw/${n}, pomijam.`); continue; }
  const base = path.parse(n).name;
  let wejscie = src;
  const tmp = [];

  if (cisza) {
    // Pełny zakres kolorów (yuvj420p, np. nagrania z aplikacji): auto-editor oddaje z nich czarny obraz.
    // Najpierw przekodowanie do zwykłego yuv420p (zakres TV), dopiero to idzie do wycinania ciszy.
    let doAe = src;
    const pix = (ffprobe(src).raw?.streams || []).find((s) => s.codec_type === "video")?.pix_fmt || "";
    if (/^yuvj/.test(pix)) {
      doAe = path.join(os.tmpdir(), `tv_${Date.now()}_${base}.mp4`);
      ff(["-i", src, "-vf", "scale=in_range=full:out_range=tv,format=yuv420p", "-c:v", "libx264", "-preset", "fast", "-crf", "12", "-c:a", "copy", doAe], `${n} (zakres kolorów)`);
      tmp.push(doAe);
    }
    const ae = path.join(os.tmpdir(), `ae_${Date.now()}_${base}${ROZSZ_AUDIO.test(n) ? ".wav" : ".mp4"}`);
    // --edit audio:threshold=... : wszystko poniżej progu = cisza. Margines dokleja oddech po obu stronach.
    const r = uruchom("auto-editor", [q(doAe),"--edit", `audio:threshold=${PROG}`, "--margin", MARGINES, "-o", q(ae), "--no-open", "--progress", "none"], { cicho: true });
    if (r.code !== 0 || !fs.existsSync(ae)) {
      const powod = (r.stderr || r.stdout).trim().split("\n").pop();
      if (/empty/i.test(powod)) info(szary(`  ${n}: cały klip jest poniżej progu ciszy (b-roll bez mowy?), zostawiam go w całości.`));
      else uwaga(`auto-editor nie przyciął ${n} (${powod}). Normalizuję bez wycinania ciszy.`);
    } else {
      const przed = ffprobe(src).duration, po = ffprobe(ae).duration;
      info(szary(`  auto-editor: ${n} ${przed.toFixed(1)} s -> ${po.toFixed(1)} s (wycięto ${(przed - po).toFixed(1)} s ciszy)`));
      wejscie = ae;
      tmp.push(ae);
    }
  }

  const m = ffprobe(wejscie);
  // auto-editor gubi obrót z telefonu (display matrix). Przywracamy go z oryginału.
  const rotSrc = wejscie !== src ? ffprobe(src).rotation : 0;
  const rotArgs = rotSrc && rotSrc !== m.rotation ? ["-display_rotation", String(rotSrc)] : [];
  if (rotArgs.length) m.rotation = rotSrc;
  const ln0 = !bezGlosnosci && m.hasAudio ? pomiarLoudnorm(wejscie) : null;
  // Czysty głos tylko tam, gdzie jest mowa (głośność > -42 LUFS); pomiar loudnorm po łańcuchu, żeby trafić w -14.
  const glos = ln0 && czystyGlos ? GLOS + "," : "";
  const ln = glos ? pomiarLoudnorm(wejscie, glos) || ln0 : ln0;
  const af = ln
    ? `${glos}loudnorm=I=${LUFS}:TP=-1.5:LRA=11:measured_I=${ln.input_i}:measured_TP=${ln.input_tp}:measured_LRA=${ln.input_lra}:measured_thresh=${ln.input_thresh}:offset=${ln.target_offset}:linear=true,aresample=48000`
    : "aresample=48000";

  if (!m.hasVideo) {
    const out = path.join(proj, "audio", `${base}.wav`);
    ff(["-i", wejscie, "-af", af, "-ac", "1", "-c:a", "pcm_s16le", out], n);
    ok(`audio/${base}.wav  (${m.duration.toFixed(1)} s${ln ? `, ${LUFS} LUFS` : ""})`);
  } else {
    const transfer = (m.raw.streams.find((s) => s.codec_type === "video") || {}).color_transfer || "";
    const hdr = /arib-std-b67|smpte2084/.test(transfer);
    const tonemap = hdr ? "zscale=t=linear:npl=100,format=gbrpf32le,zscale=p=bt709,tonemap=hable:desat=0,zscale=t=bt709:m=bt709:r=tv," : "";
    // autorotate jest domyślnie włączone, więc obrót z telefonu jest już uwzględniony w scale/crop.
    // Pomiar obrazu na oryginale (po HDR->SDR liczymy na wyniku), łagodna korekta tylko ekspozycji.
    const pom = !hdr ? pomiarObrazu(wejscie) : null;
    let korekta = "";
    if (korektaObrazu && pom && pom.jasnosc < 90) {
      const gamma = Math.min(1.35, Math.max(1.05, Math.pow(100 / Math.max(30, pom.jasnosc), 0.55)));
      korekta = `eq=gamma=${gamma.toFixed(2)},`;
    }
    // Mała rozdzielczość (np. nagranie wysłane komunikatorem): po powiększeniu łagodne wyostrzenie samej luminancji
    // i mocniejsze kodowanie, żeby nie dokładać strat. Bez odszumiania i wygładzania skóry.
    const krotszy = Math.min(m.width || 0, m.height || 0);
    const niska = krotszy > 0 && krotszy < 720;
    const ostrz = niska ? "unsharp=5:5:0.55:5:5:0," : "";
    const vf = `${tonemap}${korekta}scale=1080:1920:force_original_aspect_ratio=increase:flags=lanczos+accurate_rnd+full_chroma_int,crop=1080:1920,setsar=1,${ostrz}${GRADING ? GRADING + "," : ""}fps=${FPS},format=yuv420p`;
    const out = path.join(proj, "proxy", `${base}.mp4`);
    const audioArgs = m.hasAudio ? ["-af", af, "-c:a", "aac", "-b:a", "192k", "-ar", "48000"] : ["-an"];
    if (niska) uwaga(`  ${n}: tylko ${m.width}x${m.height} px. Powiększam z wyostrzeniem, ale najlepiej wgraj oryginał z telefonu (jako plik/dokument, nie przez komunikator).`);
    ff([...rotArgs, "-i", wejscie, "-vf", vf, "-fps_mode", "cfr", "-r", String(FPS), "-c:v", "libx264", "-preset", "medium", "-crf", niska ? "15" : "18",
      "-g", String(FPS), "-keyint_min", String(FPS), "-movflags", "+faststart", ...audioArgs, out], n);
    const wyn = ffprobe(out);
    const pomPo = pomiarObrazu(out);
    if (pomPo) {
      obrazy[`proxy/${base}.mp4`] = { ...pomPo, korekta: korekta ? korekta.replace(/,$/, "") : null, glos: !!glos };
      fs.writeFileSync(OBRAZ_JSON, JSON.stringify(obrazy, null, 1) + "\n", "utf8");
      if (pomPo.uwagi.length) uwaga(`  ${base}: ${pomPo.uwagi.join(", ")}${korekta ? " (rozjaśniłam łagodnie)" : ""}. Jeśli to ważne ujęcie, nagraj przy świetle z okna albo lampie.`);
    }
    const pion = m.height >= m.width || m.rotation === 90 || m.rotation === 270;
    ok(`proxy/${base}.mp4  ${m.width}x${m.height}@${m.fps.toFixed(1)} -> 1080x1920@${FPS}, ${wyn.duration.toFixed(1)} s${hdr ? ", HDR->SDR" : ""}${ln ? `, ${LUFS} LUFS` : m.hasAudio ? "" : ", bez dźwięku"}${glos ? ", czysty głos" : ""}${korekta ? ", rozjaśnione" : ""}${GRADING ? `, grading ${nazwaGradingu}` : ""}`);
    if (!pion) uwaga(`  ${n} był nagrany POZIOMO: przycięłam środek kadru do pionu. Sprawdź, czy nic ważnego nie uciekło (albo reframe w Higgsfield).`);
  }
  for (const t of tmp) fs.rmSync(t, { force: true });
}
info("\nGotowe. Następny krok: npm run transkrybuj -- <projekt> proxy/<klip z mową>.mp4");

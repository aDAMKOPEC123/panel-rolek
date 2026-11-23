// Generuje materiały zastępcze (placeholdery) bez prawdziwych nagrań.
//   npm run demo-media                 -> 04_SZABLONY_HF/assets/demo (przed/po, tło, wycięta sylwetka, avatar, watermark)
//   npm run demo-media -- <projekt>    -> do tego dodatkowo raw/ projektu: 3 klipy b-roll + "gadająca głowa" z mową (Windows SAPI, głos polski)
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { SZABLONY_HF, uruchom, blad, ok, info, uwaga, znajdzProjekt, wymagaj, IS_WIN } from "./lib.mjs";

wymagaj("ffmpeg", IS_WIN ? "winget install Gyan.FFmpeg" : "brew install ffmpeg");

const FONT = IS_WIN ? "C\\:/Windows/Fonts/arial.ttf" : "/System/Library/Fonts/Supplemental/Arial.ttf";
const ff = (args, opis) => {
  const r = uruchom("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...args], { cicho: true });
  if (r.code !== 0) blad(`ffmpeg nie wygenerował: ${opis}\n${r.stderr.slice(-800)}`, "Sprawdź wersję ffmpeg (ffmpeg -version).");
  ok(opis);
};
const tekst = (t, y, size = 54, color = "white") =>
  `drawtext=fontfile='${FONT}':text='${t.replace(/'/g, "\u2019").replace(/:/g, "\\:")}':fontsize=${size}:fontcolor=${color}:x=(w-text_w)/2:y=${y}:shadowcolor=black@0.4:shadowx=2:shadowy=2`;

// Sylwetka (głowa, szyja, ramiona) w kanwie 540x960, lekkie kołysanie S = 14*sin(2*PI*T/3).
const S = "(14*sin(2*PI*T/3))";
const maska = `max(max(lte(pow((X-270-${S})/105,2)+pow((Y-360)/132,2),1),lte(pow((X-270-${S})/250,2)+pow((Y-960)/340,2),1)),lte(abs(X-270-${S}),46)*between(Y,450,660))`;

function demoSzablony() {
  const out = path.join(SZABLONY_HF, "assets", "demo");
  fs.mkdirSync(out, { recursive: true });
  // przed: matowa, nierówna "skóra"; po: gładsza, cieplejsza. Tylko placeholder.
  ff(["-f", "lavfi", "-i", "color=c=#C9A391:s=1080x1920:d=1", "-vf",
    `noise=alls=38:allf=u,boxblur=3,eq=saturation=0.75:brightness=-0.04,${tekst("PRZED (placeholder)", 1380, 60)}`,
    "-frames:v", "1", path.join(out, "przed.jpg")], "assets/demo/przed.jpg");
  ff(["-f", "lavfi", "-i", "gradients=s=1080x1920:c0=#F2D6CB:c1=#D9A99A:x0=0:y0=0:x1=1080:y1=1920:d=1", "-vf",
    `noise=alls=6:allf=u,boxblur=2,${tekst("PO (placeholder)", 1380, 60, "#5a3f37")}`,
    "-frames:v", "1", path.join(out, "po.jpg")], "assets/demo/po.jpg");
  // wycięta sylwetka z kanałem alfa (jak wynik remove-background)
  ff(["-f", "lavfi", "-i", "color=c=black:s=540x960:r=30:d=3", "-vf",
    `format=rgba,geq=r='196+20*(1-Y/960)':g='150+18*(1-Y/960)':b='132+14*(1-Y/960)':a='255*${maska}',scale=1080:1920`,
    "-c:v", "libvpx-vp9", "-pix_fmt", "yuva420p", "-b:v", "1M", "-auto-alt-ref", "0", path.join(out, "wyciete.webm")], "assets/demo/wyciete.webm");
  // tło z tą samą sylwetką (nagranie, z którego "wycięto" postać)
  ff(["-f", "lavfi", "-i", "gradients=s=1080x1920:c0=#E9D9CF:c1=#8C6B5D:x0=0:y0=0:x1=0:y1=1920:r=30:d=3:speed=0.02",
    "-c:v", "libvpx-vp9", "-i", path.join(out, "wyciete.webm"),
    "-filter_complex", `[0][1]overlay=0:0,${tekst("TŁO + POSTAĆ (placeholder)", 300, 48)},format=yuv420p`,
    "-t", "3", "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-g", "30", "-an", path.join(out, "tlo.mp4")], "assets/demo/tlo.mp4");
  ff(["-f", "lavfi", "-i", "color=c=#B07A6E:s=400x400:d=1", "-vf",
    `${tekst("W", 110, 200).replace("x=(w-text_w)/2", "x=(w-text_w)/2")}`, "-frames:v", "1", path.join(out, "avatar.jpg")], "assets/demo/avatar.jpg");
  ff(["-f", "lavfi", "-i", "color=c=black@0:s=300x300:d=1,format=rgba", "-vf",
    `drawtext=fontfile='${FONT}':text='W':fontsize=220:fontcolor=white:x=(w-text_w)/2:y=(h-text_h)/2`, "-frames:v", "1", path.join(out, "watermark.png")], "assets/demo/watermark.png");
}

function mowaSapi(tekstMowy, plikWav) {
  if (!IS_WIN) { uwaga("Mowa testowa działa tylko na Windows (SAPI). Pomijam."); return false; }
  const ps1 = path.join(os.tmpdir(), "rolki-mowa.ps1");
  fs.writeFileSync(ps1, "\ufeff" + [
    "Add-Type -AssemblyName System.Speech",
    "$s = New-Object System.Speech.Synthesis.SpeechSynthesizer",
    "$pl = $s.GetInstalledVoices() | Where-Object { $_.VoiceInfo.Culture.Name -eq 'pl-PL' } | Select-Object -First 1",
    "if (-not $pl) { Write-Error 'Brak polskiego glosu SAPI'; exit 2 }",
    "$s.SelectVoice($pl.VoiceInfo.Name)",
    "$s.Rate = 1",
    `$s.SetOutputToWaveFile('${plikWav.replace(/'/g, "''")}')`,
    `$s.Speak('${tekstMowy.replace(/'/g, "''")}')`,
    "$s.Dispose()",
  ].join("\r\n"), "utf8");
  const r = uruchom("powershell", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", ps1], { cicho: true });
  if (r.code !== 0) { uwaga("Nie udało się wygenerować mowy (brak polskiego głosu w Windows?). " + r.stderr.slice(0, 200)); return false; }
  ok("mowa testowa (SAPI, głos polski): " + path.basename(plikWav));
  return true;
}

function demoProjekt(proj) {
  const raw = path.join(proj, "raw");
  fs.mkdirSync(raw, { recursive: true });
  // Celowo "telefonowe" i niejednolite parametry, żeby przetestować normalizuj:
  // 1) poziomy 1280x720 25 fps, 2) pion 1080x1920 60 fps, 3) pion 720x1280 30 fps.
  const klipy = [
    { n: "IMG_0001.mp4", s: "1280x720", r: 25, c0: "#E9D9CF", c1: "#B07A6E", t: "UJĘCIE 1: zbliżenie brwi" },
    { n: "IMG_0002.mp4", s: "1080x1920", r: 60, c0: "#F7F1EC", c1: "#8C6B5D", t: "UJĘCIE 2: nakładanie preparatu" },
    { n: "IMG_0003.mp4", s: "720x1280", r: 30, c0: "#D9B8A8", c1: "#5E4740", t: "UJĘCIE 3: efekt w lusterku" },
  ];
  for (const k of klipy) {
    const [w, h] = k.s.split("x").map(Number);
    ff(["-f", "lavfi", "-i", `gradients=s=${k.s}:c0=${k.c0}:c1=${k.c1}:r=${k.r}:d=4:speed=0.03`,
      "-f", "lavfi", "-i", "anoisesrc=d=4:c=pink:a=0.02",
      "-vf", `${tekst(k.t, Math.round(h * 0.45), Math.round(w / 22))},format=yuv420p`,
      "-c:v", "libx264", "-preset", "veryfast", "-crf", "22", "-c:a", "aac", "-shortest", path.join(raw, k.n)], `raw/${k.n} (${k.s}, ${k.r} fps)`);
  }
  // Gadająca głowa: tło + mowa z pauzą w środku (auto-editor ma ją przyciąć).
  const wav = path.join(raw, "_mowa.wav");
  const zdanie = "Laminacja brwi nie jest trwała. Efekt trzyma się około sześciu tygodni. ... ... Wszystko zależy od Twoich włosków i od pielęgnacji w domu. Zapisz rolkę, przyda się przed wizytą.";
  if (mowaSapi(zdanie, wav)) {
    ff(["-f", "lavfi", "-i", "gradients=s=1080x1920:c0=#F2E4DC:c1=#A9806F:r=30:d=30:speed=0.01",
      "-i", wav, "-af", "adelay=700|700,apad=pad_dur=0.8", "-vf", `${tekst("GADAJĄCA GŁOWA (placeholder)", 820, 52, "#5a3f37")},format=yuv420p`,
      "-shortest", "-c:v", "libx264", "-preset", "veryfast", "-crf", "22", "-c:a", "aac", "-b:a", "160k",
      path.join(raw, "IMG_0004_mowa.mp4")], "raw/IMG_0004_mowa.mp4 (mowa testowa)");
    fs.rmSync(wav, { force: true });
  }
  // Zdjęcia przed/po
  fs.copyFileSync(path.join(SZABLONY_HF, "assets", "demo", "przed.jpg"), path.join(raw, "przed.jpg"));
  fs.copyFileSync(path.join(SZABLONY_HF, "assets", "demo", "po.jpg"), path.join(raw, "po.jpg"));
  ok("raw/przed.jpg, raw/po.jpg");
}

demoSzablony();
const arg = process.argv[2];
if (arg) demoProjekt(znajdzProjekt(arg));
info("\nGotowe. To są placeholdery: podmień je na prawdziwe nagrania z telefonu.");

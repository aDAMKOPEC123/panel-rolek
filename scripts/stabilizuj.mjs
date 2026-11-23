// Stabilizacja drżącego klipu (np. zbliżenie makro z ręki): ffmpeg vidstab, dwa przebiegi.
//   npm run stabilizuj -- <projekt> proxy/<klip>.mp4 [--sila 10] [--podmien]
// Wynik: proxy/<klip>_stab.mp4 (lekki zoom, żeby nie było czarnych brzegów). --podmien: ujęcia w rolka.json
// z tym plikiem przechodzą na wersję stabilną (od/do bez zmian). Bez vidstab w ffmpeg: filtr deshake (słabszy).
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { blad, ok, info, znajdzProjekt, uruchom, ffprobe } from "./lib.mjs";

const args = process.argv.slice(2);
const flaga = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args.splice(i, 2)[1] : d; };
const sila = Math.min(30, Math.max(3, Number(flaga("--sila", 10)) || 10));
const podmien = args.includes("--podmien");
const [pArg, plikArg] = args.filter((a) => !a.startsWith("--"));
const proj = znajdzProjekt(pArg);
if (!plikArg) blad("Podaj klip.", "np. npm run stabilizuj -- <projekt> proxy/M3_zblizenie.mp4");
const src = path.join(proj, plikArg);
if (!fs.existsSync(src)) blad(`Nie ma pliku ${plikArg}.`, "Ścieżka względem folderu rolki, np. proxy/IMG_0002.mp4");
const base = path.parse(plikArg).name.replace(/_stab$/, "");
const outRel = path.join(path.dirname(plikArg), `${base}_stab.mp4`).split(path.sep).join("/");
const out = path.join(proj, outRel);
const outCz = out.replace(/.mp4$/, ".czesc.mp4"); // przerwane zadanie nie zostawi uszkodzonego _stab.mp4
fs.rmSync(outCz, { force: true });
const m = ffprobe(src);
const filtry = uruchom("ffmpeg", ["-hide_banner", "-filters"], { cicho: true }).stdout;
const audio = m.hasAudio ? ["-c:a", "copy"] : ["-an"];
const wspolne = ["-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p", "-r", "30", "-g", "30", "-movflags", "+faststart", ...audio];
info(`Stabilizuję ${plikArg} (${m.duration.toFixed(1)} s, siła ${sila})...`);
if (/vidstabdetect/.test(filtry)) {
  // trf w katalogu tymczasowym bez dwukropków w ścieżce (filtergraph ffmpeg na Windows nie lubi „C:”)
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "stab-"));
  const trf = "transforms.trf";
  let r = uruchom("ffmpeg", ["-hide_banner", "-y", "-i", src, "-vf", `vidstabdetect=shakiness=8:accuracy=15:result=${trf}`, "-f", "null", "-"], { cicho: true, cwd: tmpDir });
  if (r.code !== 0) blad("vidstab (przebieg 1) się nie udał.", r.stderr.slice(-400));
  r = uruchom("ffmpeg", ["-hide_banner", "-y", "-i", src, "-vf", `vidstabtransform=input=${trf}:smoothing=${sila}:optzoom=1:zoomspeed=0.2:interpol=bicubic,unsharp=5:5:0.6:3:3:0.3,scale=1080:1920,setsar=1`, ...wspolne, outCz], { cicho: true, cwd: tmpDir });
  fs.rmSync(tmpDir, { recursive: true, force: true });
  if (r.code !== 0) blad("vidstab (przebieg 2) się nie udał.", r.stderr.slice(-400));
} else {
  const r = uruchom("ffmpeg", ["-hide_banner", "-y", "-i", src, "-vf", "deshake=rx=32:ry=32,crop=iw*0.94:ih*0.94,scale=1080:1920,setsar=1", ...wspolne, outCz], { cicho: true });
  if (r.code !== 0) blad("deshake się nie udał.", r.stderr.slice(-400));
}
fs.rmSync(out, { force: true });
fs.renameSync(outCz, out);
ok(`${outRel} (${ffprobe(out).duration.toFixed(1)} s)`);
if (podmien) {
  const rj = path.join(proj, "kompozycja", "rolka.json");
  const r = JSON.parse(fs.readFileSync(rj, "utf8"));
  let n = 0;
  for (const u of r.ujecia || []) if (u.src === plikArg) { u.src = outRel; n++; }
  for (const u of r.ujecia || []) for (const p of u.przebitki || []) if (p.src === plikArg) { p.src = outRel; n++; }
  fs.writeFileSync(rj, JSON.stringify(r, null, 2) + "\n", "utf8");
  ok(`Podmieniono w rolka.json: ${n}`);
}

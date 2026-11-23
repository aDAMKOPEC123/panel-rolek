// Przegląd 00_INBOX i przenoszenie plików do rolki.
//   npm run inbox                                  -> lista plików z długością, rozdzielczością, datą
//   npm run inbox -- --do <projekt> [plik ...]     -> przenosi wskazane (albo wszystkie) do raw/ projektu
import fs from "node:fs";
import path from "node:path";
import { ROOT, ffprobe, ok, info, uwaga, blad, znajdzProjekt, ROZSZ_WIDEO, ROZSZ_AUDIO, ROZSZ_OBRAZ } from "./lib.mjs";

const INBOX = path.join(ROOT, "00_INBOX");
const args = process.argv.slice(2);
const i = args.indexOf("--do");
const pliki = fs.readdirSync(INBOX).filter((n) => n.toLowerCase() !== "readme.md" && fs.statSync(path.join(INBOX, n)).isFile());

if (i >= 0) {
  const proj = znajdzProjekt(args[i + 1]);
  const wybrane = args.filter((a, j) => j !== i && j !== i + 1);
  const lista = wybrane.length ? wybrane : pliki;
  for (const p of lista) {
    const src = path.join(INBOX, path.basename(p));
    if (!fs.existsSync(src)) { uwaga(`Nie ma w 00_INBOX: ${p}`); continue; }
    fs.renameSync(src, path.join(proj, "raw", path.basename(p)));
    ok(`${path.basename(p)} -> ${path.basename(proj)}/raw/`);
  }
  process.exit(0);
}

if (!pliki.length) { info("00_INBOX jest pusty."); process.exit(0); }
info("Plik".padEnd(34) + "Typ".padEnd(8) + "Czas".padEnd(9) + "Rozdz.".padEnd(12) + "FPS".padEnd(7) + "Data pliku");
for (const n of pliki.sort()) {
  const p = path.join(INBOX, n);
  const st = fs.statSync(p);
  let typ = "inny", czas = "", roz = "", fps = "";
  if (ROZSZ_WIDEO.test(n) || ROZSZ_AUDIO.test(n)) {
    const m = ffprobe(p);
    typ = m.hasVideo ? "wideo" : "audio";
    czas = m.duration.toFixed(1) + " s";
    if (m.hasVideo) { roz = `${m.width}x${m.height}${m.rotation ? " ↻" + m.rotation : ""}`; fps = m.fps.toFixed(1); }
  } else if (ROZSZ_OBRAZ.test(n)) typ = "zdjęcie";
  info(n.slice(0, 33).padEnd(34) + typ.padEnd(8) + czas.padEnd(9) + roz.padEnd(12) + fps.padEnd(7) + st.mtime.toISOString().slice(0, 16).replace("T", " "));
}
info("\nPrzenieś do rolki: npm run inbox -- --do <projekt> [pliki]");

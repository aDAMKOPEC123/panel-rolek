// Wycina postać/dłoń z tła (HyperFrames remove-background, lokalny model AI).
//   npm run wytnij-tlo -- <projekt> <plik, np. proxy/IMG_0005.mp4> [--jakosc fast|balanced|best] [--tlo]
// Wynik: wyciete/<nazwa>.webm (przezroczyste wideo) albo .png dla zdjęcia.
// --tlo zapisuje też tło z dziurą po postaci (wyciete/<nazwa>_tlo.webm).
// Pierwsze uruchomienie pobiera model (~170 MB). Na CPU ok. 2 klatki/s w 1080p: 10 s klipu = kilka minut.
import fs from "node:fs";
import path from "node:path";
import { hf, blad, ok, info, znajdzProjekt, ffprobe, uruchom, ROOT, ROZSZ_OBRAZ } from "./lib.mjs";

const args = process.argv.slice(2);
const flaga = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args.splice(i, 2)[1] : d; };
const jakosc = flaga("--jakosc", "balanced");
const zTlem = args.includes("--tlo");
const [pArg, plikArg] = args.filter((a) => !a.startsWith("--"));
const proj = znajdzProjekt(pArg);
if (!plikArg) blad("Podaj klip do wycięcia.", "np.: npm run wytnij-tlo -- <projekt> proxy/IMG_0005.mp4");
const plik = path.isAbsolute(plikArg) ? plikArg : path.join(proj, plikArg);
if (!fs.existsSync(plik)) blad(`Nie ma pliku ${plikArg}.`, "Najpierw npm run normalizuj, potem wycinaj z proxy/.");
const obraz = ROZSZ_OBRAZ.test(plik);
if (!obraz) {
  const m = ffprobe(plik);
  if (m.width !== 1080 || m.height !== 1920) blad(`${plikArg} ma ${m.width}x${m.height}.`, "Wycinaj z klipu w proxy/ (1080x1920), żeby wycięcie pasowało 1:1 do tła.");
  info(`Klip ${m.duration.toFixed(1)} s. Na CPU to potrwa ok. ${Math.ceil((m.duration * 30) / 2 / 60)} min.`);
}
const base = path.parse(plik).name;
const out = path.join(proj, "wyciete", `${base}.${obraz ? "png" : "webm"}`);
fs.mkdirSync(path.dirname(out), { recursive: true });
const argv = ["remove-background", plik, "-o", out];
if (!obraz) argv.push("--quality", jakosc);
if (zTlem && !obraz) argv.push("-b", path.join(proj, "wyciete", `${base}_tlo.webm`));
const r = hf(argv, { pokaz: true, timeout: 3 * 60 * 60 * 1000 });
if (r.code !== 0 || !fs.existsSync(out)) blad("remove-background się nie udał.", "Sprawdź npx hyperframes doctor. Pierwszy raz potrzebny internet (pobranie modelu).");
ok(`wyciete/${path.basename(out)}`);
// Wygładzenie obwódki (bez twardych schodków i resztek tła). --bez-wygladzania wyłącza.
if (!args.includes("--bez-wygladzania")) {
  const w = uruchom(process.execPath, [path.join(ROOT, "scripts", "ulepsz.mjs"), pArg, `wyciete/${path.basename(out)}`, "--krawedzie"], { pokaz: true });
  if (w.code !== 0) info("Wygładzanie krawędzi się nie udało, zostaje surowe wycięcie.");
}
info(`W rolka.json użyj szablonu "tekst-za-postacia" z media: { "tlo": "${plikArg.split(path.sep).join("/")}", "wyciete": "wyciete/${path.basename(out)}" }`);

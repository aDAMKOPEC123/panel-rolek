// Kontrola wersji finalnej przed publikacją.
//   npm run sprawdz -- <projekt> [plik.mp4]
// Sprawdza: rozdzielczość, fps, długość, głośność (LUFS, true peak), rozmiar, kodek, napisy, CTA,
// okładkę, zgodę na wizerunek, opis i hashtagi w brief.md, wyłączony debug safe zone.
// Wynik zapisuje w brief.md (status). Kod wyjścia 1, jeśli coś krytycznego nie przeszło.
import fs from "node:fs";
import path from "node:path";
import {
  ffprobe, uruchom, glosnosc, blad, info, zielony, czerwony, zolty, pogrubiony, wczytajConfig, znajdzProjekt, wczytajRolke,
  czytajBrief, zgodaNaWizerunek, ustawWBrief,
} from "./lib.mjs";

const cfg = wczytajConfig();
const args = process.argv.slice(2);
const pos = args.filter((a) => !a.startsWith("--"));
const proj = znajdzProjekt(pos[0]);
const nazwa = path.basename(proj);
const plik = pos[1] ? path.resolve(pos[1]) : path.join(proj, "final", `${nazwa}.mp4`);
if (!fs.existsSync(plik)) blad(`Nie ma pliku ${path.relative(proj, plik)}.`, `Najpierw: npm run render -- ${nazwa} --final`);

const wyniki = [];
const dodaj = (stan, co, szczegol) => wyniki.push({ stan, co, szczegol });
const m = ffprobe(plik);
const { pola, txt } = czytajBrief(proj);
const rolka = fs.existsSync(path.join(proj, "kompozycja", "rolka.json")) ? wczytajRolke(proj) : {};

// Format
dodaj(m.width === 1080 && m.height === 1920 ? "ok" : "blad", "Rozdzielczość 1080x1920", `${m.width}x${m.height}`);
dodaj(Math.abs(m.fps - (cfg.rolka?.fps || 30)) < 0.05 ? "ok" : "blad", "Klatki 30 fps", m.fps.toFixed(2));
const v = m.raw.streams.find((s) => s.codec_type === "video");
dodaj(m.codec === "h264" && v.pix_fmt === "yuv420p" ? "ok" : "uwaga", "Kodek H.264 yuv420p", `${m.codec} ${v.pix_fmt}`);
const zakresy = { "7-15": [7, 15], "15-30": [15, 30], "30-60": [30, 60] };
const dl = (pola["długość"] || cfg.rolka?.dlugosc_domyslna || "").match(/(\d+)\s*-\s*(\d+)/);
const [dmin, dmax] = dl ? [Number(dl[1]), Number(dl[2])] : [3, 90];
const d = m.duration;
dodaj(d >= 3 && d <= 180 ? (d >= dmin - 1 && d <= dmax + 2 ? "ok" : "uwaga") : "blad", `Długość (plan ${dmin}-${dmax} s)`, `${d.toFixed(1)} s`);
const mb = m.size / 1048576;
dodaj(mb < 250 ? "ok" : mb < 4000 ? "uwaga" : "blad", "Rozmiar pliku", `${mb.toFixed(1)} MB`);
// Bitrate obrazu: poniżej ~5 Mb/s Instagram oddaje miękki obraz po swojej kompresji. Cel finalu: 8-12 Mb/s.
const mbps = (() => { const r = uruchom("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=bit_rate", "-of", "csv=p=0", plik], { cicho: true }); const b = Number(r.stdout.trim()); return b ? b / 1e6 : (m.size * 8) / Math.max(1, m.duration) / 1e6; })();
dodaj(mbps >= 8 ? "ok" : mbps >= 5 ? "uwaga" : "blad", "Jakość obrazu (bitrate, cel 8-12 Mb/s)", `${mbps.toFixed(1)} Mb/s${mbps < 8 ? " (zrób final jeszcze raz: npm run render -- <projekt> --final)" : ""}`);

// Dźwięk
if (!m.hasAudio) {
  dodaj(rolka.muzyka ? "blad" : "uwaga", "Ścieżka dźwiękowa", "brak (dodaj muzykę w aplikacji IG, zapisz to w brief.md)");
} else {
  const g = glosnosc(plik);
  const cel = cfg.audio?.lufs_cel ?? -14;
  dodaj(g.lufs == null ? "uwaga" : Math.abs(g.lufs - cel) <= 2 ? "ok" : Math.abs(g.lufs - cel) <= 4 ? "uwaga" : "blad", `Głośność ok. ${cel} LUFS`, g.lufs == null ? "nie zmierzono" : `${g.lufs.toFixed(1)} LUFS`);
  if (g.truePeak != null) dodaj(g.truePeak <= -0.5 ? "ok" : "uwaga", "True peak <= -1 dBTP", `${g.truePeak.toFixed(1)} dBTP`);
}

// Treść
const napisyOn = rolka.napisy && rolka.napisy.wlacz !== false && rolka.napisy.plik;
const bezNapisowOk = /^(nie|brak)/i.test(pola["napisy"] || "");
dodaj(napisyOn || bezNapisowOk ? "ok" : "blad", "Napisy w rolce", napisyOn ? `styl ${rolka.napisy.styl || "domyślny"}` : bezNapisowOk ? "świadomie bez napisów (brief)" : "brak napisów w rolka.json");
const cta = (rolka.sceny || []).some((s) => /cta|ig-obserwuj/.test(s.szablon));
dodaj(cta ? "ok" : "blad", "CTA na końcu", cta ? "jest scena CTA" : "brak sceny cta-koncowe / ig-obserwuj");
const hook = (rolka.sceny || []).some((s) => s.szablon === "hook-tytul" && Number(s.start || 0) <= 1);
dodaj(hook ? "ok" : "uwaga", "Hook w 1. sekundzie", hook ? "jest" : "brak hook-tytul na starcie (OK, jeśli hookiem jest obraz)");
const pp = (rolka.sceny || []).filter((s) => s.szablon === "przed-po");
if (pp.length) dodaj("ok", "Przed/po z dopiskiem", "szablon wymusza \"efekt indywidualny\"");
dodaj(rolka.debug_safe_zone ? "blad" : "ok", "Nakładka debug wyłączona", rolka.debug_safe_zone ? "debug_safe_zone = true" : "tak");

// Zgoda i publikacja
const zgoda = zgodaNaWizerunek(proj);
const twarz = (pola["twarz klientki w kadrze"] || "").toLowerCase();
if (/^tak/.test(twarz)) dodaj(zgoda === "tak" ? "ok" : "blad", "Zgoda na wizerunek", `twarz w kadrze, zgoda: ${zgoda}`);
else dodaj(twarz ? "ok" : "uwaga", "Zgoda na wizerunek", twarz ? "twarzy klientki brak" : "pole \"twarz klientki w kadrze\" puste");
dodaj(fs.existsSync(path.join(proj, "final", "okladka.jpg")) ? "ok" : "uwaga", "Okładka final/okladka.jpg", fs.existsSync(path.join(proj, "final", "okladka.jpg")) ? "jest" : `brak (npm run okladka -- ${nazwa})`);
const opis = (txt.split(/^##\s*Opis pod rolkę/im)[1] || "").split(/^##\s/m)[0].replace(/<!--[\s\S]*?-->/g, "").trim();
dodaj(opis.length > 20 && !/^TODO/i.test(opis) ? "ok" : "uwaga", "Opis pod rolkę w brief.md", opis.length > 20 ? `${opis.length} znaków` : "pusty");
const tagi = (txt.match(/#[\p{L}\p{N}_]+/gu) || []).length;
dodaj(tagi >= 5 ? "ok" : "uwaga", "Hashtagi (5-10)", `${tagi}`);
if (/podolog|pedicure/.test(pola["kategoria"] || "")) {
  dodaj(/ostrzeż|uwaga|nieprzyjem/i.test(opis) || /^nie/i.test(pola["treść może być nieprzyjemna"] || "nie") ? "ok" : "uwaga", "Podologia: ostrzeżenie w opisie", "jeśli są zbliżenia zmian na stopach");
}

// Wynik
const nb0 = wyniki.filter((w) => w.stan === "blad").length;
if (args.includes("--json")) {
  ustawWBrief(proj, "status", nb0 ? `sprawdzona: ${nb0} błędów do poprawy` : "gotowa do publikacji");
  console.log(JSON.stringify({ plik: path.relative(proj, plik), wyniki, bledy: nb0, uwagi: wyniki.filter((w) => w.stan === "uwaga").length }));
  process.exit(nb0 ? 1 : 0);
}
const ikona = { ok: zielony("✓"), uwaga: zolty("!"), blad: czerwony("✗") };
info(pogrubiony(`\nKontrola: ${path.relative(proj, plik)}\n`));
for (const w of wyniki) info(`${ikona[w.stan]} ${w.co.padEnd(32)} ${w.szczegol}`);
const nb = wyniki.filter((w) => w.stan === "blad").length;
const nu = wyniki.filter((w) => w.stan === "uwaga").length;
info("");
if (nb) {
  info(czerwony(`${nb} krytycznych, ${nu} uwag. NIE publikuj, popraw najpierw krytyczne.`));
  ustawWBrief(proj, "status", `sprawdzona: ${nb} błędów do poprawy`);
  process.exit(1);
}
info(zielony(`Gotowe do publikacji${nu ? ` (${nu} uwag do przejrzenia)` : ""}.`));
ustawWBrief(proj, "status", "gotowa do publikacji");

// Render rolki: (zloz jeśli trzeba) -> lint -> render.
//   npm run render -- <projekt>                 -> wersja robocza draft do render/<nazwa>_vXX_draft.mp4
//   npm run render -- <projekt> --standard      -> wersja do akceptacji (standard)
//   npm run render -- <projekt> --final         -> jakość high do final/<nazwa>.mp4 (z kontrolą zgody i safe zone)
//   dodatkowo: --bez-check (pomija hyperframes check przy final)
//   --wariant B (z --final): zapis do final/warianty/<nazwa>_hook_B.mp4, status w brief.md bez zmian (warianty-hooka)
import fs from "node:fs";
import path from "node:path";
import {
  ROOT, hf, uruchom, blad, ok, info, uwaga, szary, wczytajConfig, znajdzProjekt, wczytajRolke, czytajBrief,
  zgodaNaWizerunek, nastepnaWersja, ffprobe, ustawWBrief, katalogProbyMontazu,
} from "./lib.mjs";
import { stanAudytuAutopilota } from "./audyt-autopilota.mjs";

const cfg = wczytajConfig();
const args = process.argv.slice(2);
const proj = znajdzProjekt(args.find((a) => !a.startsWith("--")));
const nazwa = path.basename(proj);
const proba = katalogProbyMontazu(proj, args);
const komp = proba || path.join(proj, "kompozycja");
const final = args.includes("--final");
if (proba && final) blad("W próbie audytu można renderować tylko wersję roboczą.");
if (final && args.includes("--sprawdzony-autopilot")) {
  const audyt = stanAudytuAutopilota(proj);
  if (!audyt?.aktualny) blad("Montaż zmienił się po audycie. Sprawdź aktualną wersję przed finalem.");
  if (!audyt.obraz.zakres.twarze || !audyt.obraz.zakres.hyperframes) blad("Kontrola techniczna autopilota jest niepełna.");
  if (audyt.obraz.problemy.some((p) => p.waga === "krytyczne")) blad("Autopilot wykrył błędy krytyczne. Popraw je przed finalem.");
}
const wariant = (() => { const i = args.indexOf("--wariant"); return i >= 0 ? String(args[i + 1] || "").replace(/[^\w-]/g, "") : null; })();
const jakosc = final ? cfg.hyperframes?.jakosc_final || "high" : args.includes("--standard") ? cfg.hyperframes?.jakosc_akceptacja || "standard" : cfg.hyperframes?.jakosc_robocza || "draft";

// 1. Kompozycja aktualna względem rolka.json?
const rj = path.join(komp, "rolka.json");
const idx = path.join(komp, "index.html");
if (!fs.existsSync(idx) || (fs.existsSync(rj) && fs.statSync(rj).mtimeMs > fs.statSync(idx).mtimeMs)) {
  info("rolka.json jest nowszy niż kompozycja, składam ...");
  const r = uruchom("node", [path.join(ROOT, "scripts", "zloz.mjs"), proj, ...(proba ? [`--audyt=${path.basename(proba)}`] : [])], { pokaz: true });
  if (r.code !== 0) process.exit(1);
}
const rolka = proba ? JSON.parse(fs.readFileSync(rj, "utf8")) : wczytajRolke(proj);

// 2. Reguły dla wersji finalnej
if (final) {
  if (rolka.debug_safe_zone) blad("W rolka.json jest włączona nakładka debug_safe_zone.", "Ustaw \"debug_safe_zone\": false i uruchom ponownie.");
  const { pola } = czytajBrief(proj);
  const twarz = (pola["twarz klientki w kadrze"] || "").toLowerCase();
  const zgoda = zgodaNaWizerunek(proj);
  if (/^tak/.test(twarz) && zgoda !== "tak") {
    blad("W kadrze jest twarz klientki, a w brief.md nie ma \"zgoda na wizerunek: tak\".",
      "Bez pisemnej zgody nie robimy finalu z twarzą. Opcje: kadr bez twarzy (inne ujęcie / crop), rozmycie twarzy (npx hyperframes media-treatment, skill media-use), albo uzupełnij zgodę w brief.md.");
  }
  if (!twarz) uwaga("brief.md: nie wypełniono pola \"twarz klientki w kadrze\". Zakładam, że jej nie ma. Uzupełnij!");
  if (!rolka.muzyka) uwaga("Render bez muzyki. Pamiętaj dodać dźwięk w aplikacji Instagrama (notatka w brief.md).");
}

// 3. Lint (błędy blokują render)
info(`Lint kompozycji ...`);
const lint = hf(["lint", "--json"], { cwd: komp });
let lj = null;
try { lj = JSON.parse(lint.stdout.slice(lint.stdout.indexOf("{"))); } catch {}
const bledy = lj ? (lj.findings || lj.issues || []).filter((x) => x.severity === "error") : [];
if (lint.code !== 0 || bledy.length) {
  hf(["lint"], { cwd: komp, pokaz: true });
  blad("Lint znalazł błędy w kompozycji.", "Popraw je (zwykle szablon albo rolka.json) i uruchom ponownie.");
}
ok("Lint bez błędów.");
if (final && !args.includes("--bez-check")) {
  info("Pełny check (layout, kontrast) ...");
  const ch = hf(["check", "--json", "--no-craft"], { cwd: komp, timeout: 15 * 60 * 1000 });
  try {
    const cj = JSON.parse(ch.stdout.slice(ch.stdout.indexOf("{")));
    const errs = (cj.issues || cj.findings || []).filter((x) => x.severity === "error");
    if (errs.length) uwaga(`check: ${errs.length} błąd(ów) layoutu/kontrastu. Szczegóły: cd ${path.relative(ROOT, komp)} && npx hyperframes check`);
    else ok("check bez błędów.");
  } catch { uwaga("Nie udało się odczytać wyniku check, kontynuuję."); }
}

// 4. Render
let out;
if (proba) {
  out = path.join(proba, "podglad.mp4");
} else if (final) {
  fs.mkdirSync(path.join(proj, "final"), { recursive: true });
  out = wariant ? path.join(proj, "final", "warianty", `${nazwa}_hook_${wariant}.mp4`) : path.join(proj, "final", `${nazwa}.mp4`);
  fs.mkdirSync(path.dirname(out), { recursive: true });
} else {
  const v = nastepnaWersja(path.join(proj, "render"));
  out = path.join(proj, "render", `${nazwa}_v${v}_${jakosc}.mp4`);
}
info(`Render ${jakosc} -> ${path.relative(proj, out)} ...`);
const t0 = Date.now();
// Final: stały bitrate ok. 10 Mb/s. Instagram i tak kompresuje, a plik poniżej ~5 Mb/s wychodzi po wgraniu miękki.
const bitrate = final ? (cfg.hyperframes?.bitrate_final || "10M") : null;
const r = hf(["render", "--quality", jakosc, "-o", out, "--fps", String(cfg.rolka?.fps || 30), ...(bitrate ? ["--video-bitrate", bitrate] : [])], { cwd: komp, pokaz: true, timeout: 60 * 60 * 1000 });
if (r.code !== 0 || !fs.existsSync(out)) blad("Render się nie udał.", "Uruchom: cd kompozycja && npx hyperframes render --debug, i sprawdź log.");
const m = ffprobe(out);
const D = JSON.parse(fs.readFileSync(path.join(komp, ".zloz.json"), "utf8")).dlugosc;
ok(`${path.relative(ROOT, out)}  ${m.width}x${m.height} ${m.fps.toFixed(0)} fps, ${m.duration.toFixed(2)} s, ${(m.size / 1048576).toFixed(1)} MB, ${((Date.now() - t0) / 1000).toFixed(0)} s renderu`);
if (Math.abs(m.duration - D) > 0.1) uwaga(`Długość pliku (${m.duration.toFixed(2)} s) różni się od kompozycji (${D} s).`);
if (final && wariant) {
  ok(`Wariant hooka ${wariant} gotowy.`);
} else if (final) {
  ustawWBrief(proj, "status", "final wyrenderowany, do sprawdzenia");
  info(szary("Dalej: npm run okladka -- " + nazwa + "  i  npm run sprawdz -- " + nazwa));
} else if (!proba) {
  ustawWBrief(proj, "status", `wersja robocza v${path.basename(out).match(/_v(\d+)/)[1]} (${jakosc})`);
}

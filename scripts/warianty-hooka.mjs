// Warianty hooka do testu na Instagramie (rolki testowe): ten sam montaż, inny tekst hooka na starcie.
//   npm run warianty-hooka -- <projekt> [--robocze]
// Hooki: scenariusz.json -> hooki[].tekst, a bez scenariusza brief.md -> „Hook (3 warianty)”.
// A = hook z obecnego montażu (to Twój final). B, C... = pozostałe -> final/warianty/<nazwa>_hook_B.mp4.
// rolka.json i kompozycja wracają na koniec do stanu sprzed wariantów (także po błędzie).
import fs from "node:fs";
import path from "node:path";
import { ROOT, blad, ok, info, uwaga, znajdzProjekt, czytajBrief, uruchom } from "./lib.mjs";

const args = process.argv.slice(2);
const robocze = args.includes("--robocze");
const proj = znajdzProjekt(args.find((a) => !a.startsWith("--")));
const rj = path.join(proj, "kompozycja", "rolka.json");
const oryginal = fs.readFileSync(rj, "utf8");
const rolka = JSON.parse(oryginal);
const hookScena = (r) => (r.sceny || []).find((s) => (s.szablon === "hook-tytul" || s.szablon === "tekst-za-postacia") && Number(s.start || 0) < 0.5);
const obecny = hookScena(rolka);
if (!obecny) blad("Rolka nie ma hooka na starcie (scena hook-tytul od 0 s).", "Dodaj hook w kroku Sceny, potem zrób warianty.");

let hooki = [];
try { hooki = (JSON.parse(fs.readFileSync(path.join(proj, "scenariusz.json"), "utf8")).hooki || []).map((h) => String(h.tekst || "").trim()); } catch {}
if (!hooki.length) {
  const txt = fs.readFileSync(path.join(proj, "brief.md"), "utf8");
  const sek = (txt.split(/^## Hook \(3 warianty\)/m)[1] || "").split(/^## /m)[0];
  hooki = [...sek.matchAll(/^\s*\d+\.\s*(.+)$/gm)].map((m) => m[1].replace(/\s*\(wybrany\)\s*$/i, "").trim()).filter((h) => h && !/^todo$/i.test(h));
}
const czysty = (t) => String(t).replace(/\*/g, "").trim().toLowerCase();
const inne = [...new Set(hooki.filter((h) => czysty(h) !== czysty(obecny.dane?.tekst || "")))].slice(0, 3);
if (!inne.length) blad("Nie ma innych hooków do testu.", "Dopisz 2-3 warianty w brief.md (sekcja „Hook (3 warianty)”) albo poproś Claude w rozmowie o rolce.");

const { pola } = czytajBrief(proj);
info(`Hook A (montaż/final): „${obecny.dane?.tekst}”`);
const litery = "BCD";
const zrobione = [];
try {
  inne.forEach((tekst, i) => {
    const L = litery[i];
    info(`\n=== Wariant ${L}: „${tekst}” ===`);
    const r = JSON.parse(oryginal);
    const s = hookScena(r);
    s.dane = { ...(s.dane || {}), tekst };
    fs.writeFileSync(rj, JSON.stringify(r, null, 2) + "\n", "utf8");
    const z = uruchom(process.execPath, [path.join(ROOT, "scripts", "zloz.mjs"), proj, "--force"], { pokaz: true });
    if (z.code !== 0) throw new Error("zloz");
    const argv = robocze ? [proj, "--standard"] : [proj, "--final", "--bez-check", "--wariant", L];
    const re = uruchom(process.execPath, [path.join(ROOT, "scripts", "render.mjs"), ...argv], { pokaz: true, timeout: 60 * 60 * 1000 });
    if (re.code !== 0) throw new Error("render");
    zrobione.push({ wariant: L, tekst });
  });
} catch (e) {
  uwaga(`Przerwane przy wariancie (${e.message}). Przywracam montaż.`);
} finally {
  fs.writeFileSync(rj, oryginal, "utf8");
  uruchom(process.execPath, [path.join(ROOT, "scripts", "zloz.mjs"), proj, "--force"], { cicho: true });
}
if (zrobione.length) {
  const plik = path.join(proj, "final", "warianty", "warianty.json");
  fs.mkdirSync(path.dirname(plik), { recursive: true });
  fs.writeFileSync(plik, JSON.stringify({ data: new Date().toISOString(), A: obecny.dane?.tekst, warianty: zrobione }, null, 2) + "\n", "utf8");
  ok(`Warianty: ${zrobione.map((w) => w.wariant).join(", ")} -> final/warianty/`);
  info(`Jak testować: wrzuć final jako zwykłą rolkę (A), a warianty jako „rolki testowe” (Trial Reels) albo w odstępie kilku dni.
Po 24-48 h porównaj w Insights „% pominięć” (ile osób odpada w 3 s): niższy = lepszy hook. Wpisz wynik w panelu (Publikacja > Wyniki, pole „Wariant hooka”).`);
  if (/^tak/i.test(pola["twarz klientki w kadrze"] || "")) info("Warianty przeszły tę samą kontrolę zgody na wizerunek co final.");
}

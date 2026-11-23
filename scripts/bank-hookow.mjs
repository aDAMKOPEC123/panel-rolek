// Bank hooków z researchu (plan: docs/PLAN_scenariusz_hook.md, etap 8).
// Źródło prawdy: 03_BIBLIOTEKA/research/hooki.json; tabela 03_BIBLIOTEKA/research/hooki.md generowana z niego
// (format z .claude/skills/rolki-beauty/references/research.md). Tylko tekst i linki, nigdy cudze nagrania.
// Używają go: turniej hooków (przykłady mechanizmów), recenzentka (co działało u innych), scenarzystka (hooki.md).
import fs from "node:fs";
import path from "node:path";
import { ROOT } from "./lib.mjs";

export const KAT = path.join(ROOT, "03_BIBLIOTEKA", "research");
const JSONP = path.join(KAT, "hooki.json"), MD = path.join(KAT, "hooki.md");
export const TYPY_RESEARCH = ["błąd", "mit", "liczba", "POV", "pytanie", "ciekawość", "reakcja", "kontrowersja"];

export function czytajBank() {
  try { return JSON.parse(fs.readFileSync(JSONP, "utf8")); } catch { return { hooki: [] }; }
}
// Cytat cudzego hooka: krótko (maks. 15 słów), zgodnie z zasadą researchu.
export const krotko = (s, n = 15) => { const w = String(s || "").trim().split(/\s+/).filter(Boolean); return w.length > n ? w.slice(0, n).join(" ") + " …" : w.join(" "); };
const kom = (s) => String(s ?? "").replace(/\|/g, "/").replace(/\r?\n/g, " ").trim();

export function zapiszBank(B) {
  fs.mkdirSync(KAT, { recursive: true });
  fs.writeFileSync(JSONP, JSON.stringify(B, null, 2));
  const md = `# Hooki z researchu

Generowane z \`hooki.json\` (panel: Start > „📚 Bank hooków”, albo \`npm run research-hook\`). Nie edytuj ręcznie, zmiany rób w panelu.
Tylko tekst i linki, cytat maks. 15 słów. Bierzemy mechanizm, nie kopiujemy tekstów.

| data | konto | link | kategoria | hook (max 15 słów) | typ hooka | format | długość | wyświetlenia | nasza wersja |
|---|---|---|---|---|---|---|---|---|---|
${B.hooki.map((h) => `| ${kom(h.data)} | ${kom(h.konto)} | ${kom(h.link)} | ${kom(h.kategoria)} | ${kom(h.hook)} | ${kom(h.typ)} | ${kom(h.format)} | ${kom(h.dlugosc)} | ${kom(h.wyswietlenia)} | ${kom(h.nasza_wersja?.tekst)} / „${kom(h.nasza_wersja?.mowisz)}” |`).join("\n")}

## Mechanizmy (dlaczego działały)
${B.hooki.map((h) => `- **${kom(h.hook)}** (${kom(h.typ)}${h.wyswietlenia ? `, ${kom(h.wyswietlenia)} wyśw.` : ""}): ${kom(h.mechanizm)}`).join("\n")}
`;
  fs.writeFileSync(MD, md);
}

// Liczba z „1,2 tys.”, „12 345”, „1.5M”.
export function liczba(s) {
  const t = String(s || "").toLowerCase().replace(/\s/g, "").replace(",", ".");
  const m = t.match(/([\d.]+)(tys|k|mln|m)?/);
  if (!m) return 0;
  const n = parseFloat(m[1]);
  return Math.round(n * (m[2] === "tys" || m[2] === "k" ? 1e3 : m[2] === "mln" || m[2] === "m" ? 1e6 : 1));
}

// Najmocniejsze wpisy do promptów (po wyświetleniach, potem ocenie), krótko: typ, cytat, obraz, mechanizm.
export function bankDoPromptu(n = 8, kategoria = null) {
  const B = czytajBank().hooki.slice();
  if (!B.length) return "";
  B.sort((a, b) => (kategoria ? (b.kategoria === kategoria) - (a.kategoria === kategoria) : 0) || liczba(b.wyswietlenia) - liczba(a.wyswietlenia) || (b.ocena || 0) - (a.ocena || 0));
  return B.slice(0, n).map((h) => `- [${h.typ}${h.wyswietlenia ? `, ${h.wyswietlenia} wyśw.` : ""}${h.kategoria ? `, ${h.kategoria}` : ""}] „${h.hook}”${h.wizual ? ` / obraz: ${h.wizual}` : ""}. Mechanizm: ${h.mechanizm}`).join("\n");
}

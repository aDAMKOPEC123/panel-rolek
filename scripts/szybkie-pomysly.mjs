// „3 gotowe pomysły”: bez rozmowy, od razu pełne scenariusze z twardą oceną (generator: pomysly-ai.mjs).
//   npm run pomysly -- [--ile 3] [--wskazowka "..."] [--kategoria brwi]
// Zapis: 01_PROJEKTY/_plan/propozycje.json (panel pokazuje karty; „Wybieram” robi z karty zwykły pomysł do poprawek i rolki).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PROJEKTY, KATEGORIE, blad, ok, info } from "./lib.mjs";
import { generujPomysly } from "./pomysly-ai.mjs";

export const PROPOZYCJE = path.join(PROJEKTY, "_plan", "propozycje.json");

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const a = process.argv.slice(2);
  const opt = (n) => { const i = a.indexOf(`--${n}`); return i >= 0 ? a[i + 1] : null; };
  const ile = Math.max(1, Math.min(5, Number(opt("ile") || 3)));
  const kategoria = KATEGORIE.includes(opt("kategoria")) ? opt("kategoria") : "";
  const wskazowka = (opt("wskazowka") || "").slice(0, 400);
  info(`Wymyślam ${ile} gotowe rolki z pełnym scenariuszem i oceną (ok. 2-4 min)…`);
  try {
    const wynik = await generujPomysly({ ile, wskazowka, kategoria });
    const { koszt, czas_s } = wynik;
    const pomysly = wynik.pomysly.filter(Boolean);
    if (!pomysly.length) throw new Error("Żaden pomysł nie przeszedł kontroli (obietnice efektu). Spróbuj jeszcze raz.");
    fs.mkdirSync(path.dirname(PROPOZYCJE), { recursive: true });
    fs.writeFileSync(PROPOZYCJE, JSON.stringify({ utworzono: new Date().toISOString(), wskazowka, kategoria, koszt_usd: +koszt.toFixed(3), czas_s, propozycje: pomysly }, null, 2) + "\n");
    ok(`Gotowe: ${pomysly.length} pomysły (${czas_s} s, ${koszt.toFixed(2)} USD)`);
    for (const P of pomysly) info(`  ${P.ocena}/100 · ${P.profil.temat} [${P.profil.kategoria}, ${P.profil.format}] hook: ${(P.hooki.find((h) => h.wybrany) || P.hooki[0]).tekst}`);
  } catch (e) { blad(`Nie udało się: ${e.message}`, "Sprawdź, czy Claude Code jest zalogowany (claude w terminalu)."); }
}

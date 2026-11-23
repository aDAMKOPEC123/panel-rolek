// Ocena scenariusza z linii komend (plan: docs/PLAN_scenariusz_hook.md, etap 1).
//   npm run ocen-scenariusz -- <id pomysłu z 01_PROJEKTY/_pomysly | projekt> [--json] [--polecenie]
// Pomysł: _pomysly/<id>/pomysl.json, projekt: <projekt>/scenariusz.json.
import fs from "node:fs";
import path from "node:path";
import { ROOT, blad, znajdzProjekt } from "./lib.mjs";
import { ocenScenariusz, poleceniePoprawek } from "./ocena-scenariusza.mjs";

const args = process.argv.slice(2);
const cel = args.find((a) => !a.startsWith("--"));
if (!cel) blad("Podaj id pomysłu albo projekt.", "npm run ocen-scenariusz -- 2026-11-16_142420");
const pom = path.join(ROOT, "01_PROJEKTY", "_pomysly", cel, "pomysl.json");
const plik = fs.existsSync(pom) ? pom : path.join(znajdzProjekt(cel), "scenariusz.json");
if (!fs.existsSync(plik)) blad(`Nie ma scenariusza: ${path.relative(ROOT, plik)}`);
const pl = (x) => String(x).replace(".", ",");
const o = ocenScenariusz(JSON.parse(fs.readFileSync(plik, "utf8")));

if (args.includes("--json")) { console.log(JSON.stringify(o, null, 2)); process.exit(0); }
console.log(`\nOcena scenariusza: ${o.wynik}/100${o.czesciowa ? ` (częściowa: sprawdzone ${o.sprawdzone} z 100 pkt)` : ""}  ·  ${path.relative(ROOT, plik)}`);
for (const g of Object.values(o.grupy)) console.log(`  ${g.nazwa.padEnd(11)} ${pl(g.pkt).padStart(4)} / ${g.mozliwe}${g.mozliwe < g.max ? ` (z ${g.max})` : ""}`);
console.log("");
for (const t of o.testy) console.log(`  ${t.pominiety ? "·" : t.ok ? "✓" : "✗"} ${t.tekst}${t.ok || t.pominiety ? "" : `  [${pl(t.pkt)}/${t.waga}]\n      ${t.zle}`}${t.pominiety ? `  (pominięty: ${t.zle})` : ""}`);
for (const u of o.uwagi) console.log(`  ! ${u}`);
if (args.includes("--polecenie")) console.log(`\n${poleceniePoprawek(o)}`);

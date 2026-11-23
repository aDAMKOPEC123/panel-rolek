// Dodawanie hooka z researchu do banku (plan: docs/PLAN_scenariusz_hook.md, etap 8).
//   npm run research-hook -- --dane '{"hook":"...","mowa":"...","wizual":"...","konto":"@x","link":"https://...","wyswietlenia":"120 tys.","kategoria":"brwi"}'
//   npm run research-hook -- --usun <id>
//   npm run research-hook -- --lista
// Prowadząca wpisuje to, co zatrzymało ją w cudzej rolce (tekst, mowę, obraz w 1. sekundzie). Claude (osobna sesja, bez
// narzędzi) nazywa typ i format, mówi, DLACZEGO to działa (mechanizm), ocenia 1-10 i pisze naszą wersję dla gabinetu:
// ten sam mechanizm, nasz temat, mówione, bez obietnic. Cytat cudzego hooka zapisujemy maks. 15 słów.
// Tylko tekst i linki: nie pobieramy i nie zapisujemy cudzych nagrań (03_BIBLIOTEKA/research/README.md).
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { ROOT, blad, ok, info, osobaZConfigu } from "./lib.mjs";
import { claudeJson, ZASADY_TRESCI, OBIETNICE } from "./claude-json.mjs";
import { czytajBank, zapiszBank, krotko, TYPY_RESEARCH } from "./bank-hookow.mjs";
// imię z ustawień (config.json -> gabinet.osoba) w przypadkach: OS.mian, OS.dop, OS.cel, OS.bier; czytane przy każdym użyciu
const OS = new Proxy({}, { get: (_, k) => osobaZConfigu()[k] });

const args = process.argv.slice(2);
const arg = (n) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : null; };
const B = czytajBank();

if (args.includes("--lista")) {
  if (!B.hooki.length) info("Bank jest pusty.");
  for (const h of B.hooki) console.log(`  [${h.id}] ${h.typ} · „${h.hook}” (${h.konto || "?"}, ${h.wyswietlenia || "?"} wyśw.) → ${h.nasza_wersja?.tekst}`);
  process.exit(0);
}
if (arg("usun")) {
  const id = arg("usun"), przed = B.hooki.length;
  B.hooki = B.hooki.filter((h) => h.id !== id);
  if (B.hooki.length === przed) blad(`Nie ma wpisu ${id}.`);
  zapiszBank(B);
  ok(`Usunięto ${id}.`);
  process.exit(0);
}

let d;
try { d = JSON.parse(arg("dane") || "null"); } catch { blad("Zły JSON w --dane."); }
if (!d?.hook?.trim() && !d?.mowa?.trim()) blad("Wpisz tekst hooka z ekranu albo pierwsze zdanie.", "Np. --dane '{\"hook\":\"...\"}'");
if (d.link && !/^https?:\/\//i.test(d.link)) blad("Link musi zaczynać się od http(s)://");
const czytaj = (p) => { try { return fs.readFileSync(p, "utf8"); } catch { return ""; } };
const formaty = czytaj(path.join(ROOT, ".claude", "skills", "rolki-beauty", "references", "formaty-rolek.md")).match(/^#+\s*\d+\..*$/gm)?.map((s) => s.replace(/^#+\s*/, "")).join("; ") || "";

const prompt = `Analizujesz hook cudzej rolki IG/TikTok, która zatrzymała kosmetolożkę ${OS.bier} (gabinet beauty: kosmetologia i podologia). Twoje zadanie: nazwać mechanizm, który zadziałał, i przenieść go na rolkę dla jej gabinetu.

HOOK Z RESEARCHU
- tekst na ekranie: ${d.hook || "(brak)"}
- pierwsze zdanie: ${d.mowa || "(brak)"}
- co widać w 1. sekundzie: ${d.wizual || "(nie opisano)"}
- konto: ${d.konto || "?"} · wyświetlenia: ${d.wyswietlenia || "?"} · kategoria: ${d.kategoria || "?"}
${d.notatka ? `- notatka ${OS.dop}: ${d.notatka}` : ""}

ZWRÓĆ
- "typ": jeden z: ${TYPY_RESEARCH.join(", ")},
- "format": najbliższy z formatów gabinetu (${formaty || "dowolny opis"}),
- "mechanizm": jedno-dwa zdania, DLACZEGO to zatrzymuje kciuk (np. przerwany wzór, luka ciekawości, rozpoznanie siebie, kontrast, liczba), konkretnie dla tego hooka,
- "ocena": 1-10, jak mocny jest ten hook (7 = dobry, 9-10 = wyjątkowy),
- "kategoria": brwi | rzesy | twarz | podologia | gabinet | inne,
- "nasza_wersja": hook dla gabinetu ${OS.dop} z TYM SAMYM mechanizmem, ale własną treścią (nie kopiuj słów, nie zmieniaj tylko jednego wyrazu): "tekst" (na ekranie, 3-7 słów, jedno *słowo* w gwiazdkach), "mowisz" (pierwsze zdanie, maks. 10 słów, bez „cześć/dzisiaj/pokażę ci”), "wizual" (co widać w 1. sekundzie).
${ZASADY_TRESCI}`;
const schemat = {
  type: "object",
  properties: {
    typ: { type: "string", enum: TYPY_RESEARCH }, format: { type: "string" }, mechanizm: { type: "string" }, ocena: { type: "integer", minimum: 1, maximum: 10 },
    kategoria: { type: "string", enum: ["brwi", "rzesy", "twarz", "podologia", "gabinet", "inne"] },
    nasza_wersja: { type: "object", properties: { tekst: { type: "string" }, mowisz: { type: "string" }, wizual: { type: "string" } }, required: ["tekst", "mowisz", "wizual"] },
  },
  required: ["typ", "format", "mechanizm", "ocena", "kategoria", "nasza_wersja"],
};
info("Claude analizuje hook (ok. 15-30 s) ...");
let o;
try { o = await claudeJson(prompt, schemat); } catch (e) { blad("Analiza się nie udała.", e.message); }
const a = o.dane;
const wpis = {
  id: crypto.randomBytes(3).toString("hex"),
  data: new Date().toISOString().slice(0, 10),
  konto: String(d.konto || "").trim(), link: String(d.link || "").trim(),
  kategoria: d.kategoria || a.kategoria,
  hook: krotko(d.hook || d.mowa), mowa: krotko(d.mowa), wizual: String(d.wizual || "").slice(0, 200),
  typ: a.typ, format: a.format, dlugosc: String(d.dlugosc || ""), wyswietlenia: String(d.wyswietlenia || ""),
  mechanizm: a.mechanizm, ocena: a.ocena, nasza_wersja: a.nasza_wersja,
  ...(OBIETNICE.test(`${a.nasza_wersja.tekst} ${a.nasza_wersja.mowisz}`) ? { uwaga: "Nasza wersja obiecuje efekt: przeredaguj przed użyciem." } : {}),
  koszt_usd: Math.round(o.koszt * 1000) / 1000,
};
B.hooki.unshift(wpis);
zapiszBank(B);
ok(`Dodano do banku [${wpis.id}]: ${wpis.typ}, ocena ${wpis.ocena}/10 (${o.czas_s} s, ${String(wpis.koszt_usd).replace(".", ",")} USD)`);
console.log(`  Mechanizm: ${wpis.mechanizm}`);
console.log(`  Nasza wersja: „${wpis.nasza_wersja.tekst}” / „${wpis.nasza_wersja.mowisz}” / ${wpis.nasza_wersja.wizual}`);
if (wpis.uwaga) console.log(`  ! ${wpis.uwaga}`);
info(`Bank: ${B.hooki.length} hooków · ${path.relative(ROOT, path.join(ROOT, "03_BIBLIOTEKA", "research", "hooki.md"))}`);

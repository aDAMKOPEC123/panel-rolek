// Recenzentka AI scenariusza (plan: docs/PLAN_scenariusz_hook.md, etap 2).
//   npm run recenzja -- <id pomysłu z 01_PROJEKTY/_pomysly | projekt>
// Osobna sesja `claude -p` (nie autorka scenariusza): bez narzędzi, uruchamiana poza folderem projektu (nie czyta
// rozmowy ani CLAUDE.md), odpowiedź wymuszona schematem JSON (--json-schema). Widzi tylko profil, hooki, scenariusz,
// twardą ocenę, kotwice (03_BIBLIOTEKA/research/kotwice-hookow.json) i wnioski z wyników (05_ARCHIWUM/wnioski.md).
// Wynik: _pomysly/<id>/recenzja.json albo <projekt>/recenzja.json.
import fs from "node:fs";
import path from "node:path";
import { ROOT, blad, ok, info, uwaga, znajdzProjekt, osobaZConfigu } from "./lib.mjs";
import { claudeJson, ZASADY_TRESCI, OBIETNICE } from "./claude-json.mjs";
import { bankDoPromptu } from "./bank-hookow.mjs";
import { kontekstAI, promptKontekstuAI } from "./kontekst-ai.mjs";
import { ocenScenariusz, podpisScenariusza, wynikRecenzji, wynikLaczny, KRYTERIA_HOOKA, slowa } from "./ocena-scenariusza.mjs";
// imię z ustawień (config.json -> gabinet.osoba) w przypadkach: OS.mian, OS.dop, OS.cel, OS.bier; czytane przy każdym użyciu
const OS = new Proxy({}, { get: (_, k) => osobaZConfigu()[k] });

const args = process.argv.slice(2);
const cel = args.find((a) => !a.startsWith("--"));
if (!cel) blad("Podaj id pomysłu albo projekt.", "npm run recenzja -- 2026-11-16_142420");
const pom = path.join(ROOT, "01_PROJEKTY", "_pomysly", cel, "pomysl.json");
const plik = fs.existsSync(pom) ? pom : path.join(znajdzProjekt(cel), "scenariusz.json");
if (!fs.existsSync(plik)) blad(`Nie ma scenariusza: ${path.relative(ROOT, plik)}`);
const P = JSON.parse(fs.readFileSync(plik, "utf8"));
if (!(P.hooki || []).length) blad("Scenariusz nie ma jeszcze hooków.", "Recenzja ma sens, gdy są hooki (najlepiej też scenariusz).");
const twarda = ocenScenariusz(P);
const czytaj = (p, d = "") => { try { return fs.readFileSync(p, "utf8"); } catch { return d; } };
const kotwice = JSON.parse(czytaj(path.join(ROOT, "03_BIBLIOTEKA", "research", "kotwice-hookow.json"), '{"kotwice":[]}')).kotwice || [];
const wnioski = czytaj(path.join(ROOT, "05_ARCHIWUM", "wnioski.md")).slice(0, 4000);
const research = bankDoPromptu(5, (P.profil || {}).kategoria);

// ---------- prompt ----------
const pr = P.profil || {};
const hook = P.hooki.find((h) => h.wybrany) || P.hooki[0];
const sc = (P.scenariusz || []).slice().sort((a, b) => Number(a.od) - Number(b.od));
const tabela = sc.map((w) => {
  const d = Number(w.do) - Number(w.od), n = slowa(w.mowisz).length;
  return `- ${w.od}-${w.do} s${w.rola ? ` [${w.rola}]` : ""}: OBRAZ: ${w.co_widac || "?"}${w.mowisz ? ` | MOWA (${n} słów, ${d > 0 ? (n / d).toFixed(1) : "?"} słowa/s): „${w.mowisz}”` : ""}${w.na_ekranie ? ` | NA EKRANIE: ${w.na_ekranie}` : ""}${w.bodziec ? ` | BODZIEC: ${w.bodziec}` : ""}`;
}).join("\n");
const KRYT_OPIS = {
  zatrzymanie: "3 = statyczny kadr, powitanie albo logo; 6 = ciekawy temat, ale znany szablon; 9 = obraz i zdanie, które w 1 s łamią rytm przewijania",
  ciekawosc: "3 = z hooka wiadomo już wszystko; 6 = jest pytanie, ale odpowiedź przewidywalna; 9 = konkretna luka, którą widz chce zamknąć",
  konkret: "3 = ogólniki (skóra, piękno, pielęgnacja); 6 = nazwany zabieg albo problem; 9 = liczba, przedmiot, konkretna sytuacja",
  to_o_mnie: "3 = o gabinecie; 6 = o problemie ogólnie; 9 = widz rozpoznaje siebie albo znajomą",
  spojnosc: "3 = obraz nie pasuje do słów; 6 = pasuje, ale tekst powtarza mowę; 9 = obraz, tekst i głos wzmacniają jedną myśl bez dublowania",
  autentycznosc: "3 = ulotka albo tekst jak z AI; 6 = poprawnie, ale bezosobowo; 9 = brzmi jak " + OS.mian + " mówiąca do koleżanki",
};
const prompt = `Jesteś surową recenzentką rolek Instagram/TikTok (beauty: kosmetologia i podologia, gabinet ${OS.dop}). NIE jesteś autorką tego scenariusza i nie masz jej bronić. Twoje zadanie: przewidzieć, czy ta rolka zatrzyma kciuk i utrzyma widza, i wskazać najważniejsze poprawki. Liczy się hook (pierwsze 1-2 s) i dynamika.
${promptKontekstuAI(kontekstAI({ katalog: path.dirname(plik), projekt: plik === pom ? undefined : path.dirname(plik), dokument: P }))}

PROFIL ROLKI
- pomysł: ${pr.pomysl || "?"}
- zabieg: ${pr.zabieg || "?"} · kategoria: ${pr.kategoria || "?"} · cel: ${pr.cel || "?"} · format: ${pr.format || "?"}
- odbiorca: ${pr.odbiorca || "?"} · emocja: ${pr.emocja || "?"} · kto mówi: ${pr.kto_mowi || "?"}

HOOKI (wybrany oznaczony ★)
${P.hooki.map((h, i) => `${i}. ${h.wybrany ? "★ " : ""}[${h.typ || "?"}] NA EKRANIE: „${h.tekst}” | MÓWI: „${h.mowisz || ""}” | OBRAZ: ${h.wizual || "?"}${h.dzwiek ? ` | DŹWIĘK: ${h.dzwiek}` : ""}`).join("\n")}

SCENARIUSZ${sc.length ? ` (${Math.max(...sc.map((w) => Number(w.do) || 0))} s)` : ""}
${tabela || "(jeszcze nie ma, oceń tylko hooki, a dynamikę daj null)"}

PLAN UTRZYMANIA UWAGI: ${(P.utrzymanie || []).join(" / ") || "brak"}

TWARDA OCENA (liczona automatycznie, nie powtarzaj tych uwag, skup się na tym, czego nie da się policzyć): ${twarda.wynik}/100. Niezaliczone: ${twarda.testy.filter((t) => !t.ok && !t.pominiety).map((t) => t.tekst).join("; ") || "nic"}.

SKALA (trzymaj się jej, nie bądź pobłażliwa: 7 to już dobry hook, 9-10 to wyjątkowy):
${KRYTERIA_HOOKA.map(([k, n]) => `- ${k} (${n}): ${KRYT_OPIS[k]}`).join("\n")}

KOTWICE (ocenione przykłady):
${kotwice.map((k) => `- [${k.poziom}] „${k.tekst}” / „${k.mowisz}” / obraz: ${k.wizual} → ${Object.entries(k.oceny).map(([a, b]) => `${a} ${b}`).join(", ")}. ${k.dlaczego}`).join("\n")}
${wnioski ? `\nWNIOSKI Z WYNIKÓW ${OS.dop.toUpperCase()} (ważniejsze niż ogólne zasady):\n${wnioski}\n` : ""}${research ? `\nCO DZIAŁAŁO W CUDZYCH ROLKACH (research ${OS.dop}, mechanizmy; porównaj, czy ten hook ma podobną siłę):\n${research}\n` : ""}
JAK OCENIASZ
1. Najpierw "zarzuty": 3 najmocniejsze zarzuty do rolki, od najważniejszego (konkretnie, z sekundą albo cytatem).
2. "hook": oceny 1-10 wybranego hooka (★) w 6 kryteriach, każde z jednym zdaniem "dlaczego".
3. "hooki_ranking": wszystkie hooki (po indeksie) z oceną 1-10 i jednym zdaniem.
4. "widzki": trzy osoby oglądają rolkę po kolei:
   - Ola, 24 lata: zna trendy, przewija bardzo szybko, nie znosi nudy i „reklam”,
   - Bożena, 46 lat: konkretna, chce wiedzieć „ile to trwa, czy boli, czy dla mnie”,
   - Kasia, 33 lata: sceptyczna wobec zabiegów, boi się efektu sztuczności i naciągania${pr.odbiorca ? ` (dopasuj ją do odbiorcy z profilu: ${pr.odbiorca})` : ""}.
   Dla każdej: w której sekundzie przewija (liczba) albo null, jeśli ogląda do końca, i dlaczego (jedno zdanie, w jej głowie).
5. "przewidywanie": % widzów zostających po 3 s i % oglądających do końca (realistycznie dla małego konta beauty: zwykle 30-60% po 3 s i 10-35% do końca).
6. "dynamika": ocena 1-10 tempa całej rolki (null bez scenariusza) i najsłabszy moment (od, do, dlaczego).
7. "poprawki": maks. 3, najpierw hook, potem dynamika. Każda: co zmienić, dlaczego i gotowy przykład tekstu albo obrazu.

ZASADY PROPOZYCJI: ${ZASADY_TRESCI}`;

const kryt = Object.fromEntries(KRYTERIA_HOOKA.map(([k]) => [k, { type: "object", properties: { ocena: { type: "integer", minimum: 1, maximum: 10 }, dlaczego: { type: "string" } }, required: ["ocena", "dlaczego"] }]));
const schemat = {
  type: "object",
  properties: {
    zarzuty: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 3 },
    hook: { type: "object", properties: { kryteria: { type: "object", properties: kryt, required: Object.keys(kryt) } }, required: ["kryteria"] },
    hooki_ranking: { type: "array", items: { type: "object", properties: { indeks: { type: "integer" }, ocena: { type: "integer", minimum: 1, maximum: 10 }, zdanie: { type: "string" } }, required: ["indeks", "ocena", "zdanie"] } },
    widzki: { type: "array", minItems: 3, maxItems: 3, items: { type: "object", properties: { kto: { type: "string" }, przewija_w_sekundzie: { type: ["number", "null"] }, dlaczego: { type: "string" } }, required: ["kto", "przewija_w_sekundzie", "dlaczego"] } },
    przewidywanie: { type: "object", properties: { zostaje_po_3s: { type: "integer", minimum: 0, maximum: 100 }, do_konca: { type: "integer", minimum: 0, maximum: 100 } }, required: ["zostaje_po_3s", "do_konca"] },
    dynamika: { type: "object", properties: { ocena: { type: ["integer", "null"], minimum: 1, maximum: 10 }, najslabszy: { type: ["object", "null"], properties: { od: { type: "number" }, do: { type: "number" }, dlaczego: { type: "string" } } } }, required: ["ocena"] },
    poprawki: { type: "array", maxItems: 3, items: { type: "object", properties: { co: { type: "string" }, dlaczego: { type: "string" }, przyklad: { type: "string" } }, required: ["co", "dlaczego", "przyklad"] } },
  },
  required: ["zarzuty", "hook", "hooki_ranking", "widzki", "przewidywanie", "dynamika", "poprawki"],
};

// ---------- wywołanie ----------
info(`Recenzentka czyta scenariusz (${path.relative(ROOT, plik)}), to trwa ok. 30-90 s ...`);
const t0 = Date.now();
let odp;
try { odp = await claudeJson(prompt, schemat); } catch (e) { blad("Recenzja się nie udała.", e.message); }
const rec = odp.dane;
const wyj = { total_cost_usd: odp.koszt };

// Filtr bezpieczeństwa: obietnice medyczne w propozycjach (recenzentka ma zakaz, ale sprawdzamy).
for (const p of rec.poprawki || []) if (OBIETNICE.test(`${p.co} ${p.przyklad}`)) p.uwaga = "Propozycja zawiera obietnicę efektu: przeredaguj przed użyciem.";

const wr = wynikRecenzji(rec);
const wynik = {
  data: new Date().toISOString(),
  podpis: podpisScenariusza(P),
  twarda: twarda.wynik,
  recenzja: wr,
  laczna: wynikLaczny(twarda.wynik, wr?.wynik),
  koszt_usd: wyj.total_cost_usd,
  czas_s: Math.round((Date.now() - t0) / 1000),
  ...rec,
};
const out = path.join(path.dirname(plik), "recenzja.json");
fs.writeFileSync(out, JSON.stringify(wynik, null, 2));

// ---------- raport ----------
ok(`Recenzja: hook ${wr.hook}/100${wr.dynamika != null ? `, dynamika ${wr.dynamika}/100` : ""} → recenzentka ${wr.wynik}, twarda ${twarda.wynik}, ŁĄCZNIE ${wynik.laczna}/100  (${wynik.czas_s} s)`);
console.log("\nZarzuty:");
rec.zarzuty.forEach((z, i) => console.log(`  ${i + 1}. ${z}`));
console.log("\nHook (★):");
for (const [k, n] of KRYTERIA_HOOKA) console.log(`  ${n.padEnd(22)} ${rec.hook.kryteria[k].ocena}/10  ${rec.hook.kryteria[k].dlaczego}`);
console.log("\nWidzki:");
for (const w of rec.widzki) console.log(`  ${w.kto}: ${w.przewija_w_sekundzie == null ? "ogląda do końca" : `przewija w ${w.przewija_w_sekundzie} s`}. ${w.dlaczego}`);
console.log(`\nPrzewidywanie: ${rec.przewidywanie.zostaje_po_3s}% zostaje po 3 s, ${rec.przewidywanie.do_konca}% do końca`);
console.log("\nRanking hooków:");
for (const h of rec.hooki_ranking.slice().sort((a, b) => b.ocena - a.ocena)) console.log(`  ${h.ocena}/10  „${P.hooki[h.indeks]?.tekst}”  ${h.zdanie}`);
console.log("\nPoprawki:");
rec.poprawki.forEach((p, i) => console.log(`  ${i + 1}. ${p.co}\n     dlaczego: ${p.dlaczego}\n     np.: ${p.przyklad}${p.uwaga ? `\n     ! ${p.uwaga}` : ""}`));
if ((rec.poprawki || []).some((p) => p.uwaga)) uwaga("Część propozycji obiecuje efekt: przeredaguj je przed użyciem.");
info(`Zapisano ${path.relative(ROOT, out)}`);

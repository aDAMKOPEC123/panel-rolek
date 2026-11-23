// Turniej hooków (plan: docs/PLAN_scenariusz_hook.md, etap 3).
//   npm run turniej -- <id pomysłu z 01_PROJEKTY/_pomysly | projekt>
// 1. Generator (osobna sesja Claude) pisze 12 nowych hooków: 6 typów po 2 (tekst, zdanie, obraz, dźwięk).
// 2. Startują też obecne hooki scenariusza (żeby porównanie było uczciwe).
// 3. Odsiew twardymi testami hooka z oceny scenariusza (zostaje maks. 8 najlepszych).
// 4. Dwie niezależne sędziny (równolegle) układają ranking 8 hooków: druga dostaje je w odwróconej kolejności,
//    hooki są anonimowe (litery), sędziny nie wiedzą, które są nowe. Punkty Bordy z obu rankingów.
// 5. Zwycięzcy: 3 najlepsze różnych typów, drugi dostaje rolę wariantu B do nagrania.
// Wynik: turniej.json obok pomysłu/scenariusza. Scenariusza NIE zmienia: wstawienie robi panel (scenarzystka).
import fs from "node:fs";
import path from "node:path";
import { ROOT, blad, ok, info, uwaga, znajdzProjekt, osobaZConfigu } from "./lib.mjs";
import { claudeJson, ZASADY_TRESCI, OBIETNICE } from "./claude-json.mjs";
import { ocenScenariusz, podpisScenariusza, KRYTERIA_HOOKA } from "./ocena-scenariusza.mjs";
import { bankDoPromptu } from "./bank-hookow.mjs";
// imię z ustawień (config.json -> gabinet.osoba) w przypadkach: OS.mian, OS.dop, OS.cel, OS.bier; czytane przy każdym użyciu
const OS = new Proxy({}, { get: (_, k) => osobaZConfigu()[k] });

const args = process.argv.slice(2);
const cel = args.find((a) => !a.startsWith("--"));
if (!cel) blad("Podaj id pomysłu albo projekt.", "npm run turniej -- 2026-11-16_142420");
const pom = path.join(ROOT, "01_PROJEKTY", "_pomysly", cel, "pomysl.json");
const plik = fs.existsSync(pom) ? pom : path.join(znajdzProjekt(cel), "scenariusz.json");
if (!fs.existsSync(plik)) blad(`Nie ma scenariusza: ${path.relative(ROOT, plik)}`);
const P = JSON.parse(fs.readFileSync(plik, "utf8"));
const pr = P.profil || {};
if (!pr.pomysl && !pr.temat) blad("Profil rolki jest pusty.", "Turniej ma sens, gdy wiadomo, o czym jest rolka.");
const czytaj = (p, d = "") => { try { return fs.readFileSync(p, "utf8"); } catch { return d; } };
const kotwice = JSON.parse(czytaj(path.join(ROOT, "03_BIBLIOTEKA", "research", "kotwice-hookow.json"), '{"kotwice":[]}')).kotwice || [];
const wnioski = czytaj(path.join(ROOT, "05_ARCHIWUM", "wnioski.md")).slice(0, 3000);
const research = bankDoPromptu(8, (P.profil || {}).kategoria);
const bank = czytaj(path.join(ROOT, ".claude", "skills", "rolki-beauty", "references", "hooki-beauty.md")).slice(0, 6000);
const t0 = Date.now();
let koszt = 0;

const profilTxt = `- pomysł: ${pr.pomysl || "?"}
- temat: ${pr.temat || "?"} · zabieg: ${pr.zabieg || "?"} · kategoria: ${pr.kategoria || "?"} · cel: ${pr.cel || "?"}
- odbiorca: ${pr.odbiorca || "?"} · emocja: ${pr.emocja || "?"} · kto mówi: ${pr.kto_mowi || "?"} · format: ${pr.format || "?"}
${(P.scenariusz || []).length ? `- o czym dalej jest rolka: ${(P.scenariusz || []).map((w) => w.mowisz || w.co_widac).filter(Boolean).join(" / ").slice(0, 900)}` : ""}`;

// ---------- 1. generator ----------
const TYPY = ["błąd", "mit", "liczba", "POV", "pytanie", "kontrowersja"];
const schematGen = {
  type: "object",
  properties: { hooki: { type: "array", minItems: 12, maxItems: 12, items: { type: "object", properties: {
    typ: { type: "string", enum: TYPY }, tekst: { type: "string" }, mowisz: { type: "string" }, wizual: { type: "string" }, dzwiek: { type: "string" },
  }, required: ["typ", "tekst", "mowisz", "wizual", "dzwiek"] } } },
  required: ["hooki"],
};
const promptGen = `Jesteś scenarzystką rolek IG/TikTok gabinetu beauty ${OS.dop}. Napisz 12 RÓŻNYCH hooków (pierwsze 1-2 s rolki) do tej rolki: po 2 z każdego typu: ${TYPY.join(", ")}.

ROLKA
${profilTxt}

KAŻDY HOOK
- "tekst": tekst na ekranie, 3-7 słów, dokładnie jedno *słowo* w gwiazdkach (akcent), nie powtarza zdania mówionego słowo w słowo,
- "mowisz": pierwsze zdanie ${OS.dop}, maks. 10 słów, zaczyna się od treści (nigdy: cześć, hej, dzisiaj, pokażę ci, zapraszam, chciałam),
- "wizual": co widać w 1. sekundzie: ruch, efekt, zbliżenie albo reakcja (jeden mocny obraz, nie trzy efekty naraz),
- "dzwiek": co słychać w 1. sekundzie (konkretny dźwięk zabiegu albo głos),
- mówi o WIDZU i jego sytuacji, nie o gabinecie; konkret (liczba, przedmiot, sytuacja) zamiast ogólników,
- bez klisz: „nie uwierzysz”, „sekret, którego…”, „to zmieni wszystko”, „musisz to zobaczyć”, „czekaj do końca”,
- bez słów reklamowych: oferujemy, zapraszamy, profesjonalny, kompleksowy, najlepszy, gwarancja.
Dwa hooki tego samego typu mają iść w różne strony (inna emocja albo inny obraz).
${ZASADY_TRESCI}

PRZYKŁADY OCENIONYCH HOOKÓW (żeby wiedzieć, co jest mocne):
${kotwice.map((k) => `- [${k.poziom}] „${k.tekst}” / „${k.mowisz}” / ${k.wizual}. ${k.dlaczego}`).join("\n")}
${wnioski ? `\nWNIOSKI Z WYNIKÓW ${OS.dop.toUpperCase()} (najważniejsze):\n${wnioski}\n` : ""}
${research ? `HOOKI Z RESEARCHU, KTÓRE ZATRZYMAŁY ${OS.bier.toUpperCase()} W CUDZYCH ROLKACH (bierz MECHANIZM, nigdy słowa):
${research}

` : ""}BANK HOOKÓW GABINETU (inspiracja do struktury, nie kopiuj 1:1):
${bank}`;

info("Generator pisze 12 hooków (ok. 1 min) ...");
let nowe;
try { const o = await claudeJson(promptGen, schematGen); nowe = o.dane.hooki; koszt += o.koszt; } catch (e) { blad("Generator się nie udał.", e.message); }

// ---------- 2-3. kandydaci i odsiew ----------
const kandydaci = [
  ...(P.hooki || []).map((h, i) => ({ ...h, zrodlo: "obecny", obecny_indeks: i })),
  ...nowe.map((h) => ({ ...h, zrodlo: "nowy" })),
].map((h, i) => {
  const o = ocenScenariusz({ hooki: [{ ...h, wybrany: true }], profil: {} });
  const t = o.testy.filter((x) => x.grupa === "hook" && !x.pominiety);
  const maks = t.reduce((s, x) => s + x.waga, 0);
  const obietnica = OBIETNICE.test(`${h.tekst} ${h.mowisz}`);
  return { id: i, ...h, twarda: maks ? Math.round((t.reduce((s, x) => s + x.pkt, 0) / maks) * 100) : 0, zle: [...t.filter((x) => !x.ok).map((x) => x.tekst), ...(obietnica ? ["Obietnica efektu"] : [])], obietnica };
});
const dopuszczeni = kandydaci.filter((k) => !k.obietnica).sort((a, b) => b.twarda - a.twarda).slice(0, 8);
const odsiani = kandydaci.filter((k) => !dopuszczeni.includes(k));
info(`Kandydaci: ${kandydaci.length} (${(P.hooki || []).length} obecne + ${nowe.length} nowe), do finału: ${dopuszczeni.length}, odsiani: ${odsiani.length}`);

// ---------- 4. dwie sędziny, Borda ----------
const LIT = "ABCDEFGH";
const schematSedzia = {
  type: "object",
  properties: { ranking: { type: "array", minItems: dopuszczeni.length, maxItems: dopuszczeni.length, items: { type: "object", properties: {
    litera: { type: "string", enum: LIT.slice(0, dopuszczeni.length).split("") }, ocena: { type: "integer", minimum: 1, maximum: 10 }, zdanie: { type: "string" },
  }, required: ["litera", "ocena", "zdanie"] } } },
  required: ["ranking"],
};
function promptSedzi(kolejnosc) {
  return `Jesteś surową recenzentką rolek Instagram/TikTok (beauty). Masz ${kolejnosc.length} hooków do tej samej rolki. Ułóż je od NAJLEPSZEGO do najsłabszego według tego, ile osób zatrzyma kciuk i zostanie po 3 s. Każdy dostaje ocenę 1-10 i jedno zdanie, dlaczego jest na tym miejscu. Każda litera dokładnie raz.

ROLKA
${profilTxt}

KRYTERIA (wagi): ${KRYTERIA_HOOKA.map(([, n, w]) => `${n} ${w}%`).join(", ")}. Hook ma mówić o widzu, nie o gabinecie; jeden mocny obraz; brzmieć jak ${OS.mian}, nie jak reklama ani AI. Odbiorcy: od 24-latki, która przewija w sekundę, po sceptyczną 40+.

SKALA (kotwice): ${kotwice.map((k) => `„${k.tekst}” = ${Math.round(Object.values(k.oceny).reduce((s, x) => s + x, 0) / 6)}/10`).join(", ")}.
${wnioski ? `\nWNIOSKI Z WYNIKÓW ${OS.dop.toUpperCase()}:\n${wnioski}\n` : ""}
HOOKI
${kolejnosc.map((k, i) => `${LIT[i]}. NA EKRANIE: „${k.tekst}” | MÓWI: „${k.mowisz}” | OBRAZ: ${k.wizual}${k.dzwiek ? ` | DŹWIĘK: ${k.dzwiek}` : ""}`).join("\n")}`;
}
const kolejnosci = [dopuszczeni.slice().sort(() => 0).map((x) => x), dopuszczeni.slice().reverse()];
// pierwsza sędzina: kolejność losowa (stała dla powtarzalności: wg id), druga: odwrócona
kolejnosci[0] = dopuszczeni.slice().sort((a, b) => ((a.id * 7) % 11) - ((b.id * 7) % 11));
kolejnosci[1] = kolejnosci[0].slice().reverse();
info("Dwie sędziny oceniają finał równolegle (ok. 1 min) ...");
let sedziny;
try {
  sedziny = await Promise.all(kolejnosci.map((k) => claudeJson(promptSedzi(k), schematSedzia)));
} catch (e) { blad("Ocena finału się nie udała.", e.message); }
sedziny.forEach((s) => (koszt += s.koszt));
const n = dopuszczeni.length;
for (const k of dopuszczeni) { k.borda = 0; k.oceny = []; k.zdania = []; k.miejsca = []; }
sedziny.forEach((s, si) => {
  const widziane = new Set();
  s.dane.ranking.forEach((r, poz) => {
    const k = kolejnosci[si][LIT.indexOf(r.litera)];
    if (!k || widziane.has(k.id)) return;
    widziane.add(k.id);
    k.borda += n - 1 - poz; k.oceny.push(r.ocena); k.zdania.push(r.zdanie); k.miejsca.push(poz + 1);
  });
});
const ranking = dopuszczeni.slice().sort((a, b) => b.borda - a.borda || (b.oceny.reduce((s, x) => s + x, 0) - a.oceny.reduce((s, x) => s + x, 0)) || b.twarda - a.twarda);
ranking.forEach((k, i) => { k.miejsce = i + 1; k.ocena = k.oceny.length ? Math.round((k.oceny.reduce((s, x) => s + x, 0) / k.oceny.length) * 10) / 10 : null; k.zgodnosc = k.miejsca.length === 2 ? Math.abs(k.miejsca[0] - k.miejsca[1]) : null; });

// ---------- 5. zwycięzcy: 3 najlepsze różnych typów ----------
const zwyciezcy = [];
for (const k of ranking) { if (zwyciezcy.length < 3 && !zwyciezcy.some((z) => z.typ === k.typ)) zwyciezcy.push(k); }
for (const k of ranking) { if (zwyciezcy.length < 3 && !zwyciezcy.includes(k)) zwyciezcy.push(k); }
const wynik = {
  data: new Date().toISOString(), podpis: podpisScenariusza(P), koszt_usd: Math.round(koszt * 100) / 100, czas_s: Math.round((Date.now() - t0) / 1000),
  ranking: ranking.map(({ id, typ, tekst, mowisz, wizual, dzwiek, zrodlo, twarda, ocena, borda, miejsca, zgodnosc, zdania, miejsce }) => ({ id, miejsce, typ, tekst, mowisz, wizual, dzwiek, zrodlo, twarda, ocena, borda, miejsca, zgodnosc, zdania })),
  zwyciezcy: zwyciezcy.map((k) => k.id),
  wariant_b: zwyciezcy[1]?.id ?? null,
  odsiani: odsiani.map(({ id, typ, tekst, mowisz, zrodlo, twarda, zle }) => ({ id, typ, tekst, mowisz, zrodlo, twarda, zle })),
};
const out = path.join(path.dirname(plik), "turniej.json");
fs.writeFileSync(out, JSON.stringify(wynik, null, 2));

ok(`Turniej: ${kandydaci.length} kandydatów, finał ${n}, ${wynik.czas_s} s, ok. ${String(wynik.koszt_usd).replace(".", ",")} USD`);
console.log("\nRanking (miejsca u sędzin, średnia ocena):");
for (const k of ranking) console.log(`  ${String(k.miejsce).padStart(2)}. ${zwyciezcy.includes(k) ? "🏆" : "  "} [${k.typ}${k.zrodlo === "obecny" ? ", obecny" : ""}] „${k.tekst}” / „${k.mowisz}”  ${k.ocena}/10, miejsca ${k.miejsca.join(" i ")}${k.zgodnosc >= 3 ? "  (sędziny się różnią)" : ""}\n        ${k.zdania[0] || ""}`);
if (odsiani.length) console.log(`\nOdsiani twardymi testami: ${odsiani.map((k) => `„${k.tekst}” (${k.zle.join(", ") || "słabszy wynik"})`).join("; ")}`);
const obecnyNajlepszy = ranking.find((k) => k.zrodlo === "obecny");
if (obecnyNajlepszy) info(`Najlepszy z obecnych hooków: miejsce ${obecnyNajlepszy.miejsce}.`); else uwaga("Żaden z obecnych hooków nie przeszedł do finału.");
info(`Zapisano ${path.relative(ROOT, out)}. Scenariusz bez zmian: zwycięzców wstawiasz w panelu.`);

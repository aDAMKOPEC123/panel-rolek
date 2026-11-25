// Generator gotowych pomysłów na rolki (pełny pomysl.json: profil, 3 hooki, utrzymanie, scenariusz, materiały z teleprompterem).
// Jedno wywołanie Claude (claudeJson ze schematem) na kilka pomysłów naraz, potem twarda ocena (ocena-scenariusza.mjs)
// i jedna runda poprawek dla pomysłów poniżej PROG_POPRAWKI. Używają: szybkie-pomysly.mjs („3 gotowe pomysły”)
// i plan-tygodnia.mjs --scenariusze (scenariusze dla dni planu w tle).
import fs from "node:fs";
import path from "node:path";
import { PROJEKTY, KATEGORIE, osobaZConfigu } from "./lib.mjs";
import { claudeJson, ZASADY_TRESCI, OBIETNICE } from "./claude-json.mjs";
import { ocenScenariusz, poleceniePoprawek, ROLE } from "./ocena-scenariusza.mjs";
import { kontekstGabinetu, zasadyScenariusza, oznaczPytania } from "./kontekst-rolek.mjs";
import { SCHEMAT_REZYSERII, WYTYCZNE_REZYSERII, porzadkujRezyserie } from "./rezyseria-montazu.mjs";

export const POMYSLY_DIR = path.join(PROJEKTY, "_pomysly");
export const PROG_POPRAWKI = 85;
const S = (opis) => ({ type: "string", description: opis });
const B = { type: "boolean" };
const POMYSL = {
  type: "object", additionalProperties: false,
  required: ["profil", "hooki", "utrzymanie", "scenariusz", "materialy", "efekty", "montaz", "uwagi", "ocena_widza", "dlaczego", "pytanie_klientki"],
  properties: {
    profil: {
      type: "object", additionalProperties: false,
      required: ["pomysl", "temat", "kategoria", "zabieg", "cel", "odbiorca", "emocja", "format", "kto_mowi", "twarz_klientki", "dlugosc", "cta"],
      properties: {
        pomysl: S("1 zdanie"), temat: S("krótka nazwa rolki, maks. 6 słów, bez znaków specjalnych"), kategoria: { type: "string", enum: KATEGORIE },
        zabieg: S(""), cel: { type: "string", enum: ["zasięg", "edukacja", "sprzedaż zabiegu"] }, odbiorca: S(""), emocja: S(""), format: S("nazwa formatu z listy"),
        kto_mowi: S("osoba do kamery | lektor | bez mowy, sam tekst"), twarz_klientki: { type: "string", enum: ["tak", "nie"] }, dlugosc: S("np. 20-25 s"), cta: S(""),
      },
    },
    hooki: {
      type: "array", minItems: 3, maxItems: 3,
      items: {
        type: "object", additionalProperties: false, required: ["tekst", "mowisz", "wizual", "dzwiek", "wariant_b", "typ", "wybrany"],
        properties: { tekst: S("3-7 słów, jedno *słowo* = akcent"), mowisz: S("maks. 10 słów"), wizual: S("co widać w 1. sekundzie: ruch, efekt, zbliżenie"), dzwiek: S(""), wariant_b: S("druga wersja zdania do testu"), typ: { type: "string", enum: ["ciekawość", "mit", "efekt", "pytanie", "POV", "liczba", "kontrowersja"] }, wybrany: B },
      },
    },
    utrzymanie: { type: "array", minItems: 4, maxItems: 6, items: S("zabieg utrzymania + sekunda") },
    scenariusz: {
      type: "array", minItems: 5, maxItems: 16,
      items: {
        type: "object", additionalProperties: false, required: ["od", "do", "co_widac", "mowisz", "na_ekranie", "material", "rola", "bodziec", "pytanie_widza", "energia", "przebitka", "rezyseria"],
        properties: { od: { type: "number" }, do: { type: "number" }, co_widac: S(""), mowisz: S("słowo w słowo, puste gdy bez mowy"), na_ekranie: S("maks. 4 słowa przy mowie"), material: S("M1"), rola: { type: "string", enum: ROLE }, bodziec: S("co się zmienia w obrazie albo dźwięku"), pytanie_widza: S(""), energia: { type: "integer", minimum: 1, maximum: 5 }, przebitka: S("id materiału nad głosem albo pusty"), rezyseria: SCHEMAT_REZYSERII },
      },
    },
    materialy: {
      type: "array", minItems: 2, maxItems: 8,
      items: {
        type: "object", additionalProperties: false, required: ["id", "nazwa_pliku", "typ", "opis", "jak", "czas", "obowiazkowy", "teleprompter"],
        properties: {
          id: S("M1"), nazwa_pliku: S("np. M1_mowa_hook: małe litery, bez polskich znaków"), typ: { type: "string", enum: ["wideo", "zblizenie", "zdjecie", "mowa", "ekran"] },
          opis: S(""), jak: S("kadr, odległość, światło, ruch, ile powtórek"), czas: S("ile sekund nagrać"), obowiazkowy: B,
          teleprompter: { type: "array", items: { type: "object", additionalProperties: false, required: ["kiedy", "tekst"], properties: { kiedy: S(""), tekst: S("") } } },
        },
      },
    },
    efekty: { type: "object", additionalProperties: false, required: ["zajawka", "bodziec", "punch_in", "dzwieki", "pasek_postepu", "zapetlenie", "emoji"], properties: { zajawka: B, bodziec: B, punch_in: B, dzwieki: B, pasek_postepu: B, zapetlenie: B, emoji: B } },
    montaz: { type: "string", enum: ["reklamowy", "naturalny"], description: "naturalny = jak vlog (POV, dzień w gabinecie, Q&A); reklamowy = przed/po, cena, oferta" },
    uwagi: S("np. zgoda na wizerunek"),
    ocena_widza: { type: "integer", minimum: 1, maximum: 10, description: "uczciwa ocena jak widzka przewijająca rolki" },
    dlaczego: S("1 zdanie: dlaczego zatrzyma kciuk"),
    pytanie_klientki: S("pytanie klientki z listy, na które odpowiada rolka, albo pusty"),
  },
};

function poprawny(P) {
  // porządek: dokładnie jeden wybrany hook, scenariusz po kolei, role tylko z listy
  const h = P.hooki || [];
  const w = h.findIndex((x) => x.wybrany);
  h.forEach((x, i) => (x.wybrany = i === (w >= 0 ? w : 0)));
  P.scenariusz = (P.scenariusz || []).filter((s) => Number(s.do) > Number(s.od)).sort((a, b) => a.od - b.od);
  for (const s of P.scenariusz) if (!s.przebitka) delete s.przebitka;
  P.scenariusz = porzadkujRezyserie(P.scenariusz, { ai: true, uzupelnij: true });
  return P;
}
const obietnica = (P) => OBIETNICE.test(JSON.stringify([
  P.hooki,
  P.scenariusz.map(({ rezyseria, ...scena }) => [scena, rezyseria?.zdarzenia.map((z) => z.tekst)]),
  P.profil?.cta,
]));

/**
 * opcje: { ile, wskazowka, kategoria, dni: [dni planu do rozpisania], od: Date }
 * Zwraca { pomysly: [P z polem ocena], koszt, czas_s }.
 */
export async function generujPomysly({ ile = 3, wskazowka = "", kategoria = "", dni = null, od = new Date() } = {}) {
  const OS = osobaZConfigu();
  const zadanie = dni
    ? `Rozpisz na pełne scenariusze ${dni.length} rolek z planu tygodnia, każdą dokładnie według jej opisu (możesz wzmocnić hook, jeśli znajdziesz lepszy, ale nie zmieniaj tematu):\n${dni.map((d, i) => `${i + 1}. ${d.data}: ${d.tytul} [${d.kategoria}, ${d.format}, wygląd ${d.wyglad}]. Hook: ${d.hook_tekst} / „${d.hook_mowa}”. Dlaczego teraz: ${d.dlaczego_teraz}. Ujęcia: ${d.co_nagrac.map((u) => u.co).join("; ")}. CTA: ${d.cta}.`).join("\n")}\nZwróć pomysły w tej samej kolejności.`
    : `Wymyśl ${ile} RÓŻNE gotowe rolki (inny format, inny typ hooka, najlepiej inna kategoria usług), od razu z pełnym scenariuszem.${kategoria ? ` Kategoria: ${kategoria}.` : ""}${wskazowka ? ` Wskazówka od ${OS.dop}: „${wskazowka}”.` : ""}
SAMOKONTROLA (po cichu): najpierw wymyśl 8 kandydatów, oceń każdego surowo jak widzka w autobusie (zatrzymanie kciuka, luka ciekawości, konkret, „to o mnie”, spójność obrazu, tekstu i głosu, autentyczność). Odrzuć poniżej 7, bez mocnego obrazu w 1. sekundzie i takie, których ${OS.mian} nie nagra telefonem w zwykły dzień pracy. Zwróć ${ile} najlepszych, od najmocniejszego. Jeśli są pytania klientek, co najmniej jeden pomysł odpowiada na jedno z nich; jeśli jest grafik zabiegów, budujesz pod te wizyty.`;
  const prompt = (dodatek = "") => `${zadanie}\n\n${kontekstGabinetu({ od, dni: 10 })}\n${zasadyScenariusza()}\nW "kto_mowi" pisz „${OS.mian} do kamery” albo „lektor” albo „bez mowy, sam tekst”. Teleprompter: krótkie zdania mówione, naturalne, bez długich myślników.\n${ZASADY_TRESCI}\n${WYTYCZNE_REZYSERII}${dodatek}`;
  const SCHEMAT = { type: "object", additionalProperties: false, required: ["pomysly"], properties: { pomysly: { type: "array", minItems: dni ? dni.length : ile, maxItems: dni ? dni.length : ile, items: POMYSL } } };
  let { dane, koszt, czas_s } = await claudeJson(prompt(), SCHEMAT, { timeout: 8 * 60 * 1000 });
  let pomysly = dane.pomysly.map(poprawny);
  // jedna runda poprawek: twarde testy poniżej progu albo obietnica efektu
  const doPoprawy = pomysly.map((P, i) => ({ P, i, o: ocenScenariusz(P) })).filter(({ P, o }) => o.wynik < PROG_POPRAWKI || obietnica(P));
  if (doPoprawy.length) {
    const lista = doPoprawy.map(({ P, i, o }) => `POMYSŁ ${i + 1} („${P.profil.temat}”, ${o.wynik}/100):\n${obietnica(P) ? "- USUŃ obietnicę efektu/gwarancję.\n" : ""}${poleceniePoprawek(o) || "- dopnij szczegóły"}\nObecny JSON: ${JSON.stringify(P)}`).join("\n\n");
    const SCH2 = { type: "object", additionalProperties: false, required: ["pomysly"], properties: { pomysly: { type: "array", minItems: doPoprawy.length, maxItems: doPoprawy.length, items: POMYSL } } };
    try {
      const r = await claudeJson(`Popraw te ${doPoprawy.length} pomysły rolek według listy (zostaw temat i to, co działa; zmień tylko wskazane rzeczy). Zwróć je w tej samej kolejności, pełne JSON.\n\n${lista}\n\n${zasadyScenariusza()}\n${ZASADY_TRESCI}\n${WYTYCZNE_REZYSERII}`, SCH2, { timeout: 8 * 60 * 1000 });
      koszt += r.koszt; czas_s += r.czas_s;
      r.dane.pomysly.map(poprawny).forEach((N, k) => {
        const { i, o } = doPoprawy[k];
        const on = ocenScenariusz(N);
        if ((on.wynik > o.wynik && !obietnica(N)) || (obietnica(pomysly[i]) && !obietnica(N))) pomysly[i] = N;
      });
    } catch {}
  }
  // pomysł z obietnicą efektu po poprawce = null w tym samym miejscu (kolejność = dni planu, nic się nie przesuwa)
  pomysly = pomysly.map((P) => (obietnica(P) ? null : { ...P, ocena: ocenScenariusz(P).wynik }));
  oznaczPytania(pomysly.filter(Boolean).map((P) => P.pytanie_klientki).filter(Boolean), "pomysł rolki");
  return { pomysly, koszt, czas_s };
}

/** Zapisuje pomysł jako zwykły pomysł panelu (01_PROJEKTY/_pomysly/<id>/), etap "scenariusz", z pierwszą wiadomością w rozmowie. */
export function zapiszJakoPomysl(P, { tryb = "szybki", zrodlo = "" } = {}) {
  const d0 = new Date();
  const baza = `${d0.toISOString().slice(0, 10)}_${d0.toTimeString().slice(0, 8).replace(/:/g, "")}`;
  let id = baza;
  for (let n = 2; fs.existsSync(path.join(POMYSLY_DIR, id)); n++) id = `${baza}_${n}`;
  const dir = path.join(POMYSLY_DIR, id);
  fs.mkdirSync(dir, { recursive: true });
  const { ocena, ocena_widza, dlaczego, pytanie_klientki, montaz, ...reszta } = P;
  const pomysl = { id, tryb, utworzono: d0.toISOString(), etap: "scenariusz", projekt: null, ...reszta, montaz, zrodlo };
  fs.writeFileSync(path.join(dir, "pomysl.json"), JSON.stringify(pomysl, null, 2) + "\n");
  const hook = (P.hooki || []).find((h) => h.wybrany) || P.hooki?.[0];
  const tekst = `Gotowy scenariusz${zrodlo ? ` (${zrodlo})` : ""}: **${P.profil.temat}**. ${dlaczego || ""}\nHook: „${(hook?.tekst || "").replace(/\*/g, "")}” / „${hook?.mowisz || ""}”. Ocena panelu: ${ocena ?? ocenScenariusz(P).wynik}/100.${pytanie_klientki ? `\nOdpowiada na pytanie klientki: „${pytanie_klientki}”.` : ""}\nScenariusz i lista, co nagrać, są po prawej. Napisz, co zmienić, albo zatwierdź.`;
  fs.writeFileSync(path.join(dir, "rozmowa.json"), JSON.stringify({ sesja: null, wiadomosci: [{ kto: "claude", tekst, opcje: ["Zatwierdzam, tworzymy rolkę", "Mocniejszy hook", "Krócej i szybciej", "Inny format"] }] }, null, 2) + "\n");
  return id;
}

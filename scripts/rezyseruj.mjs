import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { claudeJson, ZASADY_TRESCI } from "./claude-json.mjs";
import { zapiszJSONAtomowo } from "./lib.mjs";
import { kontekstAI, promptKontekstuAI } from "./kontekst-ai.mjs";
import { dopasujUjecia, miniaturyDlaRezyserii, zakonczMiniatury } from "./dopasuj-ujecia.mjs";
import {
  SCHEMAT_REZYSERII, WYTYCZNE_REZYSERII, dlugoscSceny, normalizujRezyserie, polaczPropozycje, porzadkujRezyserie,
} from "./rezyseria-montazu.mjs";

export const zapiszDokumentRezyserii = zapiszJSONAtomowo;

const dokument = (plik) => JSON.parse(fs.readFileSync(plik, "utf8"));

export async function generujRezyserie(plik, wybor, generuj = claudeJson, { poprawka, podglad = false } = {}) {
  const P = dokument(plik);
  const katalog = path.dirname(plik), projekt = path.basename(plik) === "scenariusz.json" ? katalog : null;
  const sceny = P.scenariusz || [];
  const cele = sceny.map((scena, indeks) => ({ scena, indeks }))
    .filter(({ scena, indeks }) => dlugoscSceny(scena) > 0 && (
      wybor === "wszystko" || (wybor === "braki" && !porzadkujRezyserie([scena])[0].rezyseria?.zdarzenia.length) || wybor === indeks
    ));
  if (!cele.length) throw new Error(wybor === "braki" ? "Sceny mają już plan montażu." : "Brak sceny z prawidłowym czasem.");
  if (poprawka && (cele.length !== 1 || cele[0].scena.zablokowany)) throw new Error("Wybierz jedną odblokowaną scenę.");
  const kontekst = sceny.flatMap((scena, indeks) => scena ? [{ indeks, mowisz: scena.mowisz, co_widac: scena.co_widac, rola: scena.rola }] : []);
  const zadanie = cele.map(({ scena, indeks }) => {
    const { rezyseria, ...tresc } = scena;
    const zachowane = rezyseria?.zdarzenia?.filter((z) => z.stan === "zatwierdzony") || [];
    return { indeks, dlugosc: dlugoscSceny(scena), ...tresc, zachowane, poprzednie_propozycje: poprawka ? rezyseria : undefined };
  });
  const schemat = {
    type: "object", additionalProperties: false, required: ["sceny"],
    properties: {
      sceny: {
        type: "array", minItems: cele.length, maxItems: cele.length,
        items: {
          type: "object", additionalProperties: false, required: ["indeks", "rezyseria"],
          properties: { indeks: { type: "integer", enum: cele.map((c) => c.indeks) }, rezyseria: SCHEMAT_REZYSERII },
        },
      },
    },
  };
  let dopasowanie, rolka, miniatury;
  if (projekt) {
    try { dopasowanie = dopasujUjecia(projekt, P); } catch {}
    try { rolka = dokument(path.join(projekt, "kompozycja", "rolka.json")); } catch {}
    if (dopasowanie?.sceny.some((s) => s.ujecia.length)) {
      try { miniatury = miniaturyDlaRezyserii(projekt, dopasowanie, cele.map((c) => c.indeks)); } catch {}
    }
  }
  const brief = kontekstAI({ projekt, katalog, dokument: P, rolka, dopasowanie, uwagi: poprawka ? [poprawka] : [] });
  const prompt = `Jesteś reżyserką i montażystką krótkiego wideo. Rozpisz wyłącznie plan montażu wybranych scen. Tekst mówiony, kolejność i długość scen są przyjęte jako wejście. Zachowanych zdarzeń nie powtarzaj w nowych propozycjach.
${WYTYCZNE_REZYSERII}
${ZASADY_TRESCI}
${promptKontekstuAI(brief)}
${poprawka ? `Przygotuj zmianę wyłącznie dla wskazanej uwagi. Zachowaj sens pozostałych propozycji z tej sceny i cały zaakceptowany montaż. Uwaga pochodzi z recenzji wyrenderowanej osi czasu, użytkownik wybrał odpowiadającą scenę. Oto treść uwagi: ${JSON.stringify(poprawka)}.` : ""}
${miniatury?.pliki.length ? `Użyj Read dla podanych miniatur. Przebitki proponuj w podanych zakresach, a jeśli widok nie pasuje, napisz co dograć. Powiązania: ${JSON.stringify(miniatury.pliki)}.` : ""}
Cały przebieg: ${JSON.stringify(kontekst)}.
Sceny do opracowania: ${JSON.stringify(zadanie)}.`;
  let dane;
  try {
    ({ dane } = await generuj(prompt, schemat, { timeout: 6 * 60 * 1000, obrazy: miniatury?.pliki.length ? miniatury.katalog : undefined }));
  } finally { if (miniatury) zakonczMiniatury(miniatury.katalog); }
  const odpowiedzi = dane?.sceny;
  if (!Array.isArray(odpowiedzi) || odpowiedzi.length !== cele.length) throw new Error("AI nie zwróciło planu wszystkich wybranych scen.");
  const plany = new Map(odpowiedzi.map((z) => [z.indeks, z.rezyseria]));
  const aktualny = dokument(plik);
  for (const { indeks, scena } of cele) {
    if (JSON.stringify(aktualny.scenariusz?.[indeks]) !== JSON.stringify(scena)) {
      throw new Error("Scena zmieniła się podczas generowania. Uruchom generowanie ponownie, aby zachować aktualne poprawki.");
    }
    const nowy = normalizujRezyserie(plany.get(indeks), scena, { ai: true, odzysk: true });
    if (!nowy.zdarzenia.length) throw new Error(`AI nie podało poprawnych zdarzeń dla sceny ${indeks + 1}. Spróbuj ponownie.`);
    const wersja = porzadkujRezyserie([scena])[0];
    const rezyseria = polaczPropozycje(wersja.rezyseria, nowy, scena);
    if (podglad) return { indeks, wersja: JSON.stringify(wersja), przed: wersja.rezyseria, rezyseria };
    aktualny.scenariusz[indeks].rezyseria = rezyseria;
  }
  zapiszDokumentRezyserii(plik, aktualny);
  return cele.length;
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  const { wymagajLicencji } = await import("./licencja.mjs");
  wymagajLicencji();
  const [, , plik, zakres, tryb] = process.argv;
  try {
    if (!plik || !/^(braki|wszystko|\d+)$/.test(zakres || "") || !/^(pomysl|scenariusz)\.json$/.test(path.basename(plik))) {
      throw new Error("Podaj plik scenariusza i numer sceny albo zakres braki/wszystko.");
    }
    console.log("AI rozpisuje reżyserię wybranych scen…");
    const opcje = tryb === "--podglad-poprawki" ? { podglad: true, poprawka: JSON.parse(fs.readFileSync(0, "utf8")) } : {};
    const wynik = await generujRezyserie(plik, /^\d+$/.test(zakres) ? Number(zakres) : zakres, undefined, opcje);
    if (opcje.podglad) console.log("POPRAWKA " + JSON.stringify(wynik));
    else console.log(`Zapisano reżyserię dla ${wynik} scen.`);
  } catch (e) {
    console.error(`✗ BŁĄD: ${e.message}`);
    process.exitCode = 1;
  }
}

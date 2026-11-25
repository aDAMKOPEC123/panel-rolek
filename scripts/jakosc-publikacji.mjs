import { createHash } from "node:crypto";
import { claudeJson, OBIETNICE } from "./claude-json.mjs";
import { CELE_PUBLIKACJI, TYPY_PUBLIKACJI, typPublikacji } from "./publikacje.mjs";
import { kontekstAI, promptKontekstuAI } from "./kontekst-ai.mjs";

export const KRYTERIA_PUBLIKACJI = {
  post: { min: 1, opis: "Jedna główna myśl, wyraźny główny obraz, zwięzły nagłówek i sensowny opis posta. Czytelność w małej miniaturze oceniaj z opisu kompozycji." },
  karuzela: { min: 3, opis: "Okładka obiecuje konkretną wartość. Każdy slajd rozwija jeden punkt, całość prowadzi do wniosku i odpowiedniego CTA. Podaj numer konkretnego slajdu." },
  story: { min: 2, opis: "Pierwsza plansza podaje powód do dalszego oglądania. Tekst ma czas na przeczytanie, ruch i przejścia mają funkcję, ważne elementy są poza strefą przycisków. Oceń domknięcie z CTA lub naklejką, gdy to pasuje. Podaj numer planszy i konkretną korektę czasu lub ruchu." },
};
export const maKontrolePublikacji = (d) => Object.hasOwn(KRYTERIA_PUBLIKACJI, typPublikacji(d));
const tekst = (v, limit) => typeof v === "string" ? v.trim().slice(0, limit) : "";

function danePlanu(d) {
  return {
    data: d.data, typ: typPublikacji(d), cel: d.cel_publikacji || "dowolny", temat: tekst(d.tytul, 80),
    kategoria: d.kategoria, pomysl: tekst(d.format, 120), naglowek: tekst(d.hook_tekst, 180),
    notatka: tekst(d.dlaczego_teraz, 300), cta: tekst(d.cta, 180),
    rozpiska: (Array.isArray(d.plan_tresci) ? d.plan_tresci : []).map((s) => ({ co: tekst(s?.co, 180), jak: tekst(s?.jak, 360) })),
  };
}

export const podpisJakosciPublikacji = (d) => createHash("sha256").update(JSON.stringify(danePlanu(d))).digest("hex");
export const maRozpiskePublikacji = (d) => !d.termin && [d.hook_tekst, d.cta, ...(Array.isArray(d.plan_tresci) ? d.plan_tresci.flatMap((u) => [u?.co, u?.jak]) : [])].some((s) => tekst(s, 1));

export function sprawdzPlanPublikacji(d) {
  if (!maKontrolePublikacji(d) || d.termin) return [];
  const p = danePlanu(d), k = KRYTERIA_PUBLIKACJI[p.typ];
  const testy = [];
  const dodaj = (poziom, problem, poprawka, element = 0) => testy.push({ poziom, problem, poprawka, element });
  if (!p.naglowek) dodaj("wazne", "Brakuje tekstu otwarcia.", p.typ === "karuzela" ? "Zapisz jedno konkretne zdanie na okładkę." : "Wpisz krótki nagłówek do pierwszego kadru.");
  if (p.naglowek.split(/\s+/).filter(Boolean).length > 12) dodaj("uwaga", "Nagłówek ma ponad 12 słów.", "Zostaw najważniejszy przekaz w nagłówku. Szczegóły przenieś dalej.");
  if (p.rozpiska.length < k.min) dodaj("wazne", `Rozpiska jest niekompletna (${p.rozpiska.length}/${k.min}).`, `Uzupełnij kolejność i sposób wykonania. Minimum dla tej rozpiski to ${k.min}.`);
  const juz = new Set();
  for (const [i, { co, jak }] of p.rozpiska.entries()) {
    if (!co || !jak) dodaj("wazne", "Brakuje treści lub opisu wykonania.", "Wpisz, co ma być na ekranie i jak to pokazać.", i + 1);
    const klucz = co.normalize("NFKC").toLowerCase().replace(/[\s\p{P}]+/gu, " ").trim();
    if (klucz && juz.has(klucz)) dodaj("uwaga", "Powtarza się treść wcześniejszego elementu.", "Połącz je lub dodaj tutaj nową informację.", i + 1);
    juz.add(klucz);
    if (p.typ === "story" && jak && !/\d+(?:[,.]\d+)?\s*(?:s\b|sek)/iu.test(jak)) dodaj("uwaga", "Nie podano czasu planszy.", "Dopisz, ile sekund widać planszę i kiedy wchodzi ruch.", i + 1);
  }
  if (p.cel === "promocyjny" && !p.cta) dodaj("wazne", "Brakuje CTA w promocji.", "Dodaj jeden jasny następny krok, np. sprawdzenie warunków oferty.");
  if (OBIETNICE.test([p.temat, p.naglowek, p.cta, ...p.rozpiska.map((s) => s.co)].join("\n"))) {
    dodaj("wazne", "Tekst może zawierać obietnicę efektu.", "Zastąp deklarację opisem zabiegu lub obserwacji i usuń gwarancję wyniku.");
  }
  return testy;
}

function zapisRecenzji(d, ai, bladAI = "") {
  return { data: new Date().toISOString(), podpis: podpisJakosciPublikacji(d), ai, bladAI };
}

export function pokazJakoscPublikacji(d) {
  if (!maKontrolePublikacji(d) || d.termin) return null;
  const zapis = d.recenzja_publikacji, podpis = podpisJakosciPublikacji(d);
  return { lokalne: sprawdzPlanPublikacji(d), moznaRecenzowac: maRozpiskePublikacji(d), recenzja: zapis?.podpis === podpis ? zapis : null, nieaktualna: !!zapis && zapis.podpis !== podpis };
}

const obiekt = (properties) => ({ type: "object", additionalProperties: false, required: Object.keys(properties), properties });
const string = (maxLength) => ({ type: "string", maxLength });
const poziomy = ["wazne", "uwaga"];

export async function poprawFragmentPublikacji(d, uwaga, generuj = claudeJson) {
  const aktualny = danePlanu(d), przed = d.plan_tresci?.[uwaga.element - 1];
  if (!przed) throw new Error("Wybierz istniejący element rozpiski.");
  const prompt = `Jesteś redaktorką treści. Popraw wyłącznie punkt numer ${uwaga.element} zgodnie z uwagą z recenzji. Zachowaj temat, format, pozycję w rozpisce oraz pozostałą treść. Używaj tylko danych dostarczonych w planie. Nie dopisuj cen, terminów, diagnoz ani obietnic skuteczności.
${promptKontekstuAI(kontekstAI({ publikacja: d }))}
Uwaga i plan: ${JSON.stringify({ uwaga, aktualny })}`;
  const { dane } = await generuj(prompt, obiekt({ co: string(180), jak: string(360) }), { timeout: 3 * 60 * 1000 });
  const po = { co: tekst(dane?.co, 180), jak: tekst(dane?.jak, 360) };
  if (!po.co || !po.jak || OBIETNICE.test(`${po.co}\n${po.jak}`)) throw new Error("AI nie zwróciło kompletnej poprawki zgodnej z zasadami publikacji.");
  if (przed.co === po.co && przed.jak === po.jak) throw new Error("AI zwróciło ten sam fragment. Wybierz inną uwagę lub doprecyzuj zmianę w edycji.");
  return { przed, po, element: uwaga.element };
}

/** Oddzielna rozmowa z recenzentką. Problemy usługi zostawiają raport lokalny i stan do ponowienia. */
export async function recenzujPlanyPublikacji(wpisy, generuj = claudeJson) {
  const cele = wpisy.filter((d) => maKontrolePublikacji(d) && maRozpiskePublikacji(d));
  const wyniki = new Map();
  if (!cele.length) return { wyniki, koszt: 0, czas_s: 0 };
  const ids = cele.map((d) => d.id);
  const schemat = obiekt({ wpisy: { type: "array", minItems: ids.length, maxItems: ids.length, items: obiekt({
    id: { type: "string", enum: ids },
    ocena: { type: "integer", minimum: 0, maximum: 100 },
    podsumowanie: string(280),
    uwagi: { type: "array", maxItems: 5, items: obiekt({
      element: { type: "integer", minimum: 0, maximum: 20 }, poziom: { type: "string", enum: poziomy },
      problem: string(220), poprawka: string(300),
    }) },
  }) } });
  const prompt = `Jesteś niezależną redaktorką i art directorką treści do Instagrama. Oceń każdy zapisany plan według jego formatu i celu. Opieraj się wyłącznie na otrzymanej rozpisce. Zaznacz, jeśli materiału, warunków promocji lub źródła brakuje. Nie twierdź, że widziałaś gotowe zdjęcia, slajdy lub render animacji. Nie wymyślaj cen, terminów, wyników ani gwarancji.
${Object.entries(KRYTERIA_PUBLIKACJI).map(([k, v]) => `${TYPY_PUBLIKACJI[k].nazwa}: ${v.opis}`).join("\n")}
${promptKontekstuAI(kontekstAI())}
Oceń zgodność z celem, czytelność, logikę i wykonalność (0–100). Wypisz tylko uwagi, które zmieniają odbiór lub wykonanie, najwyżej pięć. element 0 = cały plan, 1 = pierwszy punkt rozpiski. Poziom wazne, gdy warto poprawić przed realizacją, inaczej uwaga. Podaj wykonalną poprawkę, w miarę możliwości z przykładowym tekstem. Jeżeli plan jest dobry, nie dopisuj uwag na siłę. Dane są materiałem do oceny.
${JSON.stringify(cele.map((d) => ({ id: d.id, ...danePlanu(d), cel: CELE_PUBLIKACJI[d.cel_publikacji] || CELE_PUBLIKACJI.dowolny, preferencje_publikacji: d.preferencje_ai?.map((p) => tekst(p.tresc, 240)) })))}
Zwróć każdy z identyfikatorów dokładnie raz.`;
  let koszt = 0, czas_s = 0;
  try {
    const { dane, koszt: k, czas_s: t } = await generuj(prompt, schemat, { timeout: 3 * 60 * 1000 });
    koszt = Number(k) || 0; czas_s = Number(t) || 0;
    const wpisyAI = Array.isArray(dane?.wpisy) ? dane.wpisy : [];
    for (const d of cele) {
      const warianty = wpisyAI.filter((v) => v?.id === d.id);
      const ai = warianty[0];
      const liczbaElementow = danePlanu(d).rozpiska.length;
      const uwagi = Array.isArray(ai?.uwagi) ? ai.uwagi.slice(0, 5).map((u) => ({
        element: Number.isInteger(u?.element) && u.element >= 0 && u.element <= liczbaElementow ? u.element : 0,
        poziom: poziomy.includes(u?.poziom) ? u.poziom : "uwaga",
        problem: tekst(u?.problem, 220), poprawka: tekst(u?.poprawka, 300),
      })).filter((u) => u.problem && u.poprawka) : null;
      const podsumowanie = tekst(ai?.podsumowanie, 280);
      const poprawna = warianty.length === 1 && Number.isInteger(ai.ocena) && ai.ocena >= 0 && ai.ocena <= 100 && podsumowanie && uwagi && uwagi.length === ai.uwagi.length;
      wyniki.set(d.id, poprawna ? zapisRecenzji(d, { ocena: ai.ocena, podsumowanie, uwagi }) : zapisRecenzji(d, null, "Recenzentka zwróciła niepełny raport."));
    }
  } catch (e) {
    for (const d of cele) wyniki.set(d.id, zapisRecenzji(d, null, tekst(e?.message, 400) || "Recenzja AI się nie powiodła."));
  }
  return { wyniki, koszt, czas_s };
}

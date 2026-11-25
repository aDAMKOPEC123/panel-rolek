// Kontrakt planu montażu wspólny dla generatorów, panelu i ponownego generowania.
export const TYPY_ZDARZEN = {
  wideo: "Ujęcie", zdjecie: "Zdjęcie", komentarz: "Komentarz", interfejs: "Interfejs",
  grafika: "Grafika", dane: "Licznik lub wykres", typografia: "Tekst",
  kamera: "Kamera", przejscie: "Przejście", dzwiek: "Dźwięk", inne: "Inny zabieg",
};
export const STATUSY_MATERIALOW = {
  do_pozyskania: "Do pozyskania", dostepny: "Dostępny",
  wygenerowany: "Wygenerowany", zatwierdzony: "Zatwierdzony",
};
export const POCHODZENIE = { ilustracyjne: "Ilustracyjne", rzeczywiste: "Rzeczywiste", generowane: "Generowane" };
const MAX_ZDARZEN = 20;
const MAX_MATERIALOW = 20;
const ID = /^[\w-]{1,40}$/;
const s = (limit, opis = "") => ({ type: "string", maxLength: limit, ...(opis ? { description: opis } : {}) });
const en = (etykiety) => ({ type: "string", enum: Object.keys(etykiety) });
const obiekt = (properties) => ({ type: "object", additionalProperties: false, required: Object.keys(properties), properties });
const szczegoly = {
  opis: s(280, "Co ma się wydarzyć i po co"),
  tekst: s(180, "Dosłowny tekst na ekranie lub pusty"),
  pozycja: s(90, "Pozycja na ekranie z uwzględnieniem twarzy, napisów i stref UI"),
  wejscie: s(100), wyjscie: s(100), animacja: s(140), dzwiek: s(100),
  synchronizacja: s(140, "Słowo, fragment lektora lub akcja jako sygnał"),
  notatki: s(180),
};
export const SCHEMAT_REZYSERII = obiekt({
  koncepcja: s(440), wskazowki: s(440),
  zdarzenia: {
    type: "array", minItems: 1, maxItems: MAX_ZDARZEN,
    items: obiekt({
      id: s(40), od: { type: "number", minimum: 0 }, do: { type: "number", exclusiveMinimum: 0 },
      typ: en(TYPY_ZDARZEN), ...szczegoly, material: s(40, "Id materiału z tej sceny lub pusty"),
    }),
  },
  materialy: {
    type: "array", maxItems: MAX_MATERIALOW,
    items: obiekt({
      id: s(40), typ: en(TYPY_ZDARZEN), opis: s(280, "Co dokładnie znaleźć, nagrać lub wygenerować"),
      zrodlo: s(300, "Dane źródło, identyfikator M1 itp. lub pusty; bez zgadywania linków"),
      pochodzenie: en(POCHODZENIE),
    }),
  },
});

export const WYTYCZNE_REZYSERII = `REŻYSERIA MONTAŻU
- Dla KAŻDEJ sceny dodaj "rezyseria": koncepcja, wskazowki, zdarzenia i materialy. Czasy zdarzeń są WZGLĘDEM początku danej sceny i mieszczą się w czasie (scena.do - scena.od). Czasy mogą się nakładać na osobnych torach. Krótka scena często potrzebuje tylko jednego celowego zdarzenia. Dla dłuższych rozważ nowy bodziec co 1–3 s i zmianę kompozycji po 3–6 s. Pauza dla zrozumienia lub obejrzenia efektu jest dobrym wyborem. Uzasadnij bodziec treścią i emocją. Dopasuj moment pojawienia do słowa, akcji albo dźwięku. Zostaw przestrzeń dla twarzy i napisów. Daj czas na przeczytanie tekstu.
- Zmieniaj język wizualny między scenami. Dyskusja może dostać kolejno wlatujące karty komentarzy lub powiadomienia. Rozpisz okienka osobno: np. na słowie „pytania” pierwsze z lewej, po krótkim odstępie drugie z prawej, na odpowiedzi zanik i zmiana kadru. Produkt może dostać zdjęcie w ramce, kolaż lub strzałkę na detal. Dla historii rozważ oś czasu, dla mechanizmu schemat lub split screen, dla liczby ze źródła licznik lub wykres. Sięgaj też po stopklatkę, typografię na słowie, wyszukiwarkę, mapę, wizualizację 3D, match cut, whip pan, glitch i speed ramp, jeśli treść je uzasadnia. Możesz wymyślić nowy zabieg ("inne" albo najbliższy typ). Nie powielaj tego samego wejścia ani nie dokładaj kilku konkurujących napisów. Styl Facebooka, Reddita lub wyszukiwarki opisuj jako rozpoznawalną inspirację układem, z oryginalną oprawą.
- Komentarz stworzony na potrzeby sceny jest ilustracyjny. Bez nazwisk, zdjęć profilowych, liczby reakcji i oznak autentyczności, jeśli użytkownik nie podał materiału. W obrazie przewidź stały podpis "Komentarze ilustracyjne". Ilustracje nie dowodzą skali, trendu ani skuteczności zabiegu. Dane/liczby/cytaty tylko z konkretnych dostarczonych źródeł. Przy braku danych zaproponuj grafikę pojęciową albo materiał do znalezienia. Przy pytaniach zdrowotnych używaj neutralnego języka i bez diagnoz. Odróżniaj rzeczywiste, ilustracyjne i generowane materiały; nie twórz fikcyjnych dowodów.
- Ścieżka nagraniowa istnieje obok listy materiałów dla montażysty. W planie podaj dokładnie, czego szukać lub co zrobić, i odwołuj się do dostarczonych plików lub M1 itp., jeżeli są znane. Nie zakładaj dostępności. Nie zatwierdzaj niczego za użytkownika. Zatwierdzone zdarzenia i potwierdzone materiały zachowaj, a plan ruszaj tylko dla zmienionych scen lub gdy użytkownik prosi o montaż.
- Typy: ${Object.keys(TYPY_ZDARZEN).join(", ")}. Zdarzenie: {"id":"z1","od":0,"do":1.5,"typ":"wideo","opis":"","tekst":"","pozycja":"","wejscie":"","wyjscie":"","animacja":"","dzwiek":"","synchronizacja":"","material":"","notatki":""}. Materiał: {"id":"m1","typ":"wideo","opis":"","zrodlo":"","pochodzenie":"ilustracyjne"}. Zdarzenie.material wskazuje id materiału z tej samej reżyserii albo jest puste. Pisz krótko i konkretnie. Jeden efekt z uzasadnieniem ma pierwszeństwo przed długą listą ozdobników.`;

const tekst = (v, ile) => typeof v === "string" ? v.trim().slice(0, ile) : "";
const zaokraglij = (v) => Math.round(v * 1000) / 1000;
export const dlugoscSceny = (scena) => zaokraglij(Number(scena?.do) - Number(scena?.od));

function poprawneId(v, uzyte, co) {
  if (typeof v !== "string" || !ID.test(v) || uzyte.has(v)) throw new Error(`Nieprawidłowy lub powtórzony identyfikator: ${co}.`);
  uzyte.add(v);
  return v;
}

// "ai" chroni statusy użytkownika. "odzysk" dotyczy pliku pisanego przez model:
// pomija niedokończone pozycje, żeby scenariusz z rozmowy nadal można było otworzyć.
export function normalizujRezyserie(plan, scena, { ai = false, odzysk = false } = {}) {
  const D = dlugoscSceny(scena);
  if (!Number.isFinite(D) || D <= 0) throw new Error("Scena musi mieć prawidłowy czas.");
  if (!plan || !Array.isArray(plan.zdarzenia) || !Array.isArray(plan.materialy)) throw new Error("Plan wymaga list zdarzeń i materiałów.");
  if (plan.zdarzenia.length > MAX_ZDARZEN || plan.materialy.length > MAX_MATERIALOW) throw new Error("Maksymalnie 20 zdarzeń i 20 materiałów w scenie.");
  const zbierz = (lista, fn) => lista.flatMap((v) => {
    try { return [fn(v)]; } catch (e) { if (odzysk) return []; throw e; }
  });
  const idMaterialow = new Set();
  const materialy = zbierz(plan.materialy, (m) => {
    const opis = tekst(m?.opis, 280);
    if (!opis || !Object.hasOwn(TYPY_ZDARZEN, m.typ)) throw new Error("Każdy materiał potrzebuje typu i opisu.");
    const pochodzenie = Object.hasOwn(POCHODZENIE, m.pochodzenie) ? m.pochodzenie : "ilustracyjne";
    const zrodlo = tekst(m.zrodlo, 300);
    const status = !ai && Object.hasOwn(STATUSY_MATERIALOW, m.status) ? m.status : "do_pozyskania";
    if (status === "zatwierdzony" && pochodzenie === "rzeczywiste" && !zrodlo) throw new Error("Wpisz źródło rzeczywistego materiału przed zatwierdzeniem.");
    return { id: poprawneId(m.id, idMaterialow, "materiał"), typ: m.typ, opis, zrodlo, pochodzenie, status };
  });
  const idZdarzen = new Set();
  const zdarzenia = zbierz(plan.zdarzenia, (z) => {
    if (!z || !Object.hasOwn(TYPY_ZDARZEN, z.typ)) throw new Error("Wybierz rodzaj zdarzenia.");
    if (!Number.isFinite(z.od) || !Number.isFinite(z.do)) throw new Error("Podaj czas rozpoczęcia i zakończenia.");
    const od = zaokraglij(z.od), koniec = zaokraglij(z.do);
    if (od < 0 || koniec <= od || koniec > D) throw new Error(`Zdarzenie „${tekst(z.opis, 60)}” musi mieścić się w zakresie od 0 do ${D} s.`);
    if (!tekst(z.opis, 280)) throw new Error("Każde zdarzenie potrzebuje opisu.");
    const material = tekst(z.material, 40);
    if (material && !idMaterialow.has(material) && !odzysk) throw new Error("Zdarzenie wskazuje materiał spoza tej sceny.");
    const pola = Object.fromEntries(Object.entries(szczegoly).map(([k, v]) => [k, tekst(z[k], v.maxLength)]));
    return {
      id: poprawneId(z.id, idZdarzen, "zdarzenie"), od, do: koniec, typ: z.typ, ...pola,
      material: idMaterialow.has(material) ? material : "",
      stan: !ai && z.stan === "zatwierdzony" ? "zatwierdzony" : "propozycja",
    };
  }).sort((a, b) => a.od - b.od || a.do - b.do);
  return { koncepcja: tekst(plan.koncepcja, 440), wskazowki: tekst(plan.wskazowki, 440), zdarzenia, materialy };
}

export function bazowaRezyseria(scena) {
  return normalizujRezyserie({
    koncepcja: "Plan startowy z obrazu sceny. Rozwiń go w reżyserii montażu.",
    zdarzenia: [{
      id: "z1", od: 0, do: dlugoscSceny(scena), typ: "wideo",
      opis: scena.co_widac || "Pokaż kadr odpowiadający temu, co pada w scenie.",
      tekst: scena.na_ekranie || "", pozycja: "Pełny kadr", wejscie: "Cięcie",
      synchronizacja: scena.mowisz || "", material: scena.material ? "m1" : "",
    }],
    materialy: scena.material ? [{ id: "m1", typ: "wideo", opis: scena.co_widac || "Nagranie do tej sceny", zrodlo: scena.material, pochodzenie: "rzeczywiste" }] : [],
  }, scena);
}

export function porzadkujRezyserie(scenariusz, { ai = false, uzupelnij = false } = {}) {
  return scenariusz.map((scena) => {
    if (!scena || !(dlugoscSceny(scena) > 0)) return scena;
    if (scena.rezyseria) {
      try {
        const rezyseria = normalizujRezyserie(scena.rezyseria, scena, { ai, odzysk: true });
        if (rezyseria.zdarzenia.length || !uzupelnij) return { ...scena, rezyseria };
      } catch {}
    }
    if (uzupelnij) return { ...scena, rezyseria: bazowaRezyseria(scena) };
    const { rezyseria, ...tresc } = scena;
    return tresc;
  });
}

export function polaczPropozycje(stary, nowy, scena) {
  const poprzedni = stary ? normalizujRezyserie(stary, scena, { odzysk: true }) : { zdarzenia: [], materialy: [] };
  const zachowane = poprzedni.zdarzenia.filter((z) => z.stan === "zatwierdzony");
  const materialy = poprzedni.materialy.filter((m) => m.status !== "do_pozyskania" || zachowane.some((z) => z.material === m.id));
  // Nowa generacja lokalnie numeruje od m1/z1. Jej identyfikatory nie mogą wskazać innego zapisanego materiału.
  const id = (prefix, lista) => { let n = 1; while (lista.some((x) => x.id === prefix + n)) n++; return prefix + n; };
  const mapa = new Map();
  for (const m of nowy.materialy) {
    const tenSam = materialy.find((x) => x.typ === m.typ && x.opis === m.opis && x.zrodlo === m.zrodlo && x.pochodzenie === m.pochodzenie);
    if (!tenSam && materialy.length >= MAX_MATERIALOW) continue;
    const dodany = tenSam || { ...m, id: id("m", materialy) };
    if (!tenSam) materialy.push(dodany);
    mapa.set(m.id, dodany.id);
  }
  const zdarzenia = [...zachowane];
  for (const z of nowy.zdarzenia) {
    const powtorka = zachowane.some((x) => x.typ === z.typ && Math.abs(x.od - z.od) < 0.15 && x.opis === z.opis);
    if (powtorka || zdarzenia.length >= MAX_ZDARZEN) continue;
    zdarzenia.push({ ...z, id: id("z", zdarzenia), material: mapa.get(z.material) || "" });
  }
  return normalizujRezyserie({ ...nowy, zdarzenia, materialy }, scena);
}

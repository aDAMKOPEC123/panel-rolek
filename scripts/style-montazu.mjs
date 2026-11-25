// Presety składają się na kopii rolka.json, tak samo jak dotychczasowy montaż naturalny.
export const STYLE_MONTAZU = [
  {
    id: "editorial",
    nazwa: "Editorial beauty",
    opis: "Szeryfowy tytuł, miękkie światło, spokojne wejścia i dyskretna muzyka.",
    kadr: "makro gotowego efektu zabiegu na brwiach, rzęsach lub skórze",
    wskazowka: "Zacznij efektem z bliska, gdy jest w materiale. Daj ujęciom 1,5–3 s i zostaw przestrzeń przy tytule. Ozdoby i dźwięk tła oszczędnie.",
    fonty: { naglowki: "Playfair Display", tekst: "Montserrat" },
    ruch: "elegancki",
    wariant: "maska",
    napisy: { styl: "este", slow_w_grupie: 4 },
    muzyka: 0.55,
    grading: { preset: "skin-soft", intensity: 0.28 },
  },
  {
    id: "ekspertka",
    nazwa: "Ekspertka w gabinecie",
    opis: "Konkretny początek, napisy całymi frazami i głos na pierwszym planie.",
    kadr: "zbliżenie narzędzia, preparatu lub miejsca zabiegu pokazywanego przez prowadzącą",
    wskazowka: "Zacznij od najlepszego zdania prowadzącej. Przebitki mają pokazywać omawiany krok. Gdy znasz punkt na obrazie, możesz użyć sceny efekt-ae ze strzałką do detalu.",
    fonty: { naglowki: "Inter", tekst: "Inter" },
    ruch: "klasyczny",
    wariant: "slowa",
    napisy: { styl: "waga", slow_w_grupie: 6, frazy: true },
    muzyka: 0.5,
  },
  {
    id: "makro-asmr",
    nazwa: "Makro ASMR",
    opis: "Dłonie i faktury w dużym zbliżeniu, krótki podpis i naturalne dźwięki zabiegu.",
    kadr: "bardzo bliskie ujęcie dłoni i szczoteczki, pęsety lub aplikatora w ruchu",
    wskazowka: "Zacznij detalem z wyraźnym naturalnym dźwiękiem. Wybieraj ujęcia 2–4 s, w tempie nagrania, z dźwiękiem. Opisy mają być krótkie.",
    fonty: { naglowki: "Montserrat", tekst: "Montserrat" },
    ruch: "miekki",
    wariant: "maska",
    napisy: { styl: "vlog", slow_w_grupie: 3, frazy: true },
    muzyka: 0.18,
    grading: { adjust: { contrast: 0.07, saturation: -0.03 } },
    dzwiekUjec: true,
  },
];

export const stylMontazu = (id) => STYLE_MONTAZU.find((p) => p.id === id);

// Te przejścia zachowują czasy ujęć po zamianie na cięcie. Przejścia z zakładką
// wchodzą wcześniej na osi czasu, więc zostają w kompozycji wraz z ich synchronizacją.
const PRZEJSCIA_BEZ_ZAKLADKI = new Set(["zoom", "przyciemnienie", "swiatlo", "flash", "swipe", "swipe_gora", "whip"]);

export function zastosujStylMontazu(rolka, preset) {
  const efekty = {
    ...rolka.efekty,
    dzwieki: false,
    emoji: false,
    bodziec: false,
    punch_in: false,
    pasek_postepu: false,
  };
  if (preset.id === "editorial" && (rolka.zajawka?.src || rolka.sceny?.some((s) => s.szablon === "przed-po" && s.media?.po))) {
    efekty.zajawka = true;
  }
  if (preset.id === "ekspertka") {
    efekty.zajawka = false;
    efekty.wycisz_muzyke = true;
  }
  if (preset.dzwiekUjec) {
    efekty.zajawka = false;
    efekty.ambient = false;
    efekty.operator = false;
  }
  return {
    ...rolka,
    ruch: preset.ruch,
    efekty,
    napisy: { ...rolka.napisy, ...preset.napisy, nacisk: false },
    ujecia: (rolka.ujecia || []).map((u) => (
      !u.przejscie_recznie && PRZEJSCIA_BEZ_ZAKLADKI.has(u.przejscie_po) ? { ...u, przejscie_po: "ciecie" } : u
    )),
    sceny: (rolka.sceny || []).map((s) => {
      if (s.szablon === "hook-tytul") {
        return { ...s, dane: { ...s.dane, oprawa: preset.id, wariant: preset.wariant, tlo: "pigulka", pozycja: "gora" } };
      }
      if (preset.id === "ekspertka" && s.szablon === "efekt-ae" && s.dane?.efekt === "strzalka") {
        return { ...s, dane: { ...s.dane, kolor: "granat", cienka: true } };
      }
      return s;
    }),
  };
}

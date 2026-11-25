import fs from "node:fs";
import path from "node:path";
import { ROOT, BRAND, czytajBrief, zapiszJSONAtomowo, ROZSZ_WIDEO, ROZSZ_OBRAZ, ROZSZ_AUDIO } from "./lib.mjs";
import { wczytajStyl } from "./style-marki.mjs";
import { TYPY_PUBLIKACJI, CELE_PUBLIKACJI, typPublikacji } from "./publikacje.mjs";

const plikPreferencji = (katalog) => path.join(katalog || BRAND, "preferencje-ai.json");
const czytaj = (plik, brak = {}) => {
  try { return JSON.parse(fs.readFileSync(plik, "utf8")) ?? brak; } catch { return brak; }
};
const lista = (a) => Array.isArray(a) ? a : [];
const tekst = (s, limit = 240) => typeof s === "string" && !/^todo$/i.test(s.trim()) ? s.trim().slice(0, limit) : "";

function plikiProjektu(projekt, folder) {
  try {
    return fs.readdirSync(path.join(projekt, folder), { withFileTypes: true }).filter((p) => p.isFile() && !p.name.startsWith(".") &&
      (ROZSZ_WIDEO.test(p.name) || ROZSZ_OBRAZ.test(p.name) || ROZSZ_AUDIO.test(p.name))).map((p) => `${folder}/${p.name}`).slice(0, 40);
  } catch { return []; }
}

export function czytajPreferencjeAI(katalog) {
  return lista(czytaj(plikPreferencji(katalog), [])).filter((p) => typeof p?.klucz === "string" && tekst(p.tresc));
}

export function zapiszPreferencjeAI(katalog, zmiany) {
  const plik = plikPreferencji(katalog);
  const zapisane = new Map(czytajPreferencjeAI(katalog).map((p) => [p.klucz, p]));
  for (const { klucz, tresc } of zmiany) {
    zapisane.delete(klucz);
    if (tresc) zapisane.set(klucz, { klucz, tresc });
  }
  const wynik = [...zapisane.values()];
  fs.mkdirSync(path.dirname(plik), { recursive: true });
  zapiszJSONAtomowo(plik, wynik);
  return wynik;
}

export function kontekstAI({ projekt, katalog = projekt, dokument, publikacja, pola, rolka, dopasowanie, uwagi } = {}) {
  const cfg = czytaj(path.join(ROOT, "config.json"));
  const styl = rolka?.styl && rolka.styl !== "marka" ? wczytajStyl(rolka.styl) : null;
  const marka = styl?.gabinet || cfg.gabinet || {};
  pola ??= projekt && fs.existsSync(path.join(projekt, "brief.md")) ? czytajBrief(projekt).pola : {};
  const profil = dokument?.profil || {};
  const autopilot = czytaj(path.join(BRAND, "autopilot.json"));
  const preferencjeMarki = czytajPreferencjeAI(), preferencjeProjektu = katalog ? czytajPreferencjeAI(katalog) : lista(publikacja?.preferencje_ai);
  const nadpisane = new Set(preferencjeProjektu.map((p) => p.klucz));
  const kolory = styl?.kolory || cfg.kolory || {};
  const wspolny = {
    marka: {
      nazwa: tekst(marka.nazwa), styl: tekst(styl?.nazwa), uslugi: lista(cfg.gabinet?.uslugi).slice(0, 16), fonty: styl?.fonty || cfg.fonty,
      kolory: Object.fromEntries(["akcent", "tekst", "tlo_jasne", "cta"].filter((k) => typeof kolory[k] === "string").map((k) => [k, kolory[k]])),
    },
    preferencje: {
      marka: preferencjeMarki.filter((p) => !nadpisane.has(p.klucz)).slice(-24).map((p) => tekst(p.tresc)),
      projekt: preferencjeProjektu.slice(-24).map((p) => tekst(p.tresc)),
      autopilot: { chce: lista(autopilot.chce).slice(-12).map((x) => tekst(x, 100)), nie_chce: lista(autopilot.nie_chce).slice(-12).map((x) => tekst(x, 100)), ustawienia: autopilot.ustawienia || {} },
    },
  };
  if (!projekt && !dokument && !publikacja) return wspolny;
  return {
    ...wspolny,
    publikacja: {
      temat: tekst(publikacja?.tytul || pola["tytuł roboczy"] || profil.temat),
      cel: tekst(CELE_PUBLIKACJI[publikacja?.cel_publikacji] || pola.cel || profil.cel),
      format: publikacja ? TYPY_PUBLIKACJI[typPublikacji(publikacja)]?.nazwa : tekst(profil.format) || "Rolka",
      data: tekst(publikacja?.data || pola["data publikacji"], 50),
      odbiorca: tekst(profil.odbiorca), cta: tekst(publikacja?.cta || profil.cta),
      zgoda_na_wizerunek: tekst(pola["zgoda na wizerunek"], 150),
    },
    montaz: rolka ? { styl: rolka.montaz, napisy: rolka.napisy?.styl || styl?.napisy, ruch: rolka.ruch || styl?.ruch } : undefined,
    zatwierdzone: lista(dokument?.scenariusz).flatMap((s, i) => lista(s?.rezyseria?.zdarzenia).filter((z) => z?.stan === "zatwierdzony")
      .map((z) => ({ scena: i + 1, od: z.od, typ: z.typ, opis: tekst(z.opis, 150) }))).slice(0, 20),
    materialy: lista(dokument?.materialy).filter((m) => m).slice(0, 24).map((m) => ({ id: tekst(m.id, 40), typ: tekst(m.typ, 50), opis: tekst(m.opis, 160), nazwa_pliku: tekst(m.nazwa_pliku, 120), pliki: lista(m.pliki).slice(0, 5) })),
    dostepne_pliki: projekt ? { raw: plikiProjektu(projekt, "raw"), proxy: plikiProjektu(projekt, "proxy") } : undefined,
    dopasowania: dopasowanie?.sceny?.map(({ i, nagrac, ujecia }) => ({ scena: i + 1, nagrac: ujecia.length ? undefined : nagrac,
      ujecia: ujecia.slice(0, 2).map(({ src, od, do: koniec, zrodlo }) => ({ src, od, do: koniec, zrodlo })) })).slice(0, 24),
    uwagi: lista(uwagi).slice(0, 8),
  };
}

export function promptKontekstuAI(brief) {
  return `AKTUALNY BRIEF Z PANELU. Dane opisują stan projektu. Preferencje z projektu mają pierwszeństwo nad preferencjami marki i dawnymi ustawieniami autopilota. Zachowaj zatwierdzone fragmenty. Dopasowania z indeksu to kandydaci do sprawdzenia, nie potwierdzenie treści klatki. Stosuj ustalenia pasujące do formatu i bieżącego zadania.\n${JSON.stringify(brief)}`;
}

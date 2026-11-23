// Wspólny kontekst gabinetu dla Claude przy wymyślaniu rolek (plan tygodnia, 3 gotowe pomysły):
// pora roku, okazje, usługi, grafik zabiegów, pytania klientek, ostatnie rolki, formaty, przepis z wyników, wnioski, bank hooków.
// Tu też bank pytań klientek (03_BIBLIOTEKA/research/pytania.json) i grafik zabiegów (01_PROJEKTY/_plan/grafik.json).
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { ROOT, PROJEKTY, wczytajConfig, osobaZConfigu } from "./lib.mjs";
import { bankDoPromptu } from "./bank-hookow.mjs";
import { policz, przepisDlaClaude } from "./algorytm.mjs";
import { PROGI } from "./ocena-scenariusza.mjs";

export const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
export const data = (s) => { const [r, m, d] = s.split("-").map(Number); return new Date(r, m - 1, d, 12); };
export const plus = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
export const NAZWY_DNI = ["poniedziałek", "wtorek", "środa", "czwartek", "piątek", "sobota", "niedziela"];
const czytaj = (p) => { try { return fs.readFileSync(p, "utf8"); } catch { return ""; } };
const czytajJ = (p, d) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return d; } };
const piszJ = (p, v) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, JSON.stringify(v, null, 2) + "\n"); };

// --- kalendarz okazji w Polsce (beauty) ---
function wielkanoc(r) { // algorytm Meeusa/Jonesa/Butchera
  const a = r % 19, b = Math.floor(r / 100), c = r % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mies = Math.floor((h + l - 7 * m + 114) / 31), dz = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(r, mies - 1, dz, 12);
}
function ntyDzienTygodnia(r, mies, dzienTyg, n) { const d = new Date(r, mies, 1, 12); let ile = 0; while (true) { if (d.getDay() === dzienTyg && ++ile === n) return d; d.setDate(d.getDate() + 1); } }
export function okazje(od, dni = 24) {
  const L = [];
  for (const r of [od.getFullYear(), od.getFullYear() + 1]) {
    const W = wielkanoc(r);
    const st = [
      [1, 1, "Nowy Rok: postanowienia, „nowa ja”"], [1, 21, "Dzień Babci"], [1, 22, "Dzień Dziadka"], [2, 14, "Walentynki"], [3, 8, "Dzień Kobiet"],
      [3, 21, "pierwszy dzień wiosny"], [5, 26, "Dzień Matki (prezenty, vouchery)"], [6, 1, "Dzień Dziecka"], [6, 23, "Dzień Ojca"], [9, 30, "Dzień Chłopaka"],
      [10, 14, "Dzień Nauczyciela"], [10, 31, "Halloween"], [11, 1, "Wszystkich Świętych (długi weekend)"], [11, 29, "Andrzejki (wieczór 29.11)"],
      [12, 6, "Mikołajki (vouchery, prezenty)"], [12, 24, "Wigilia"], [12, 31, "Sylwester (makijaż, rzęsy, brwi, paznokcie na imprezę)"],
    ].map(([m, d, t]) => [new Date(r, m - 1, d, 12), t]);
    st.push([plus(W, -52), "Tłusty Czwartek"], [plus(W, -7), "Niedziela Palmowa (tydzień przed Wielkanocą)"], [W, "Wielkanoc"]);
    const bf = ntyDzienTygodnia(r, 10, 5, 4); // 4. piątek listopada
    st.push([bf, "Black Friday"], [plus(bf, 3), "Cyber Monday"]);
    st.push([ntyDzienTygodnia(r, 5, 5, 4), "koniec roku szkolnego i początek wakacji (sandały, stopy)"]);
    for (const [d, t] of st) { const roznica = Math.round((d - od) / 864e5); if (roznica >= 0 && roznica <= dni) L.push({ data: iso(d), dni_od_startu: roznica, okazja: t }); }
  }
  return L.sort((a, b) => a.data.localeCompare(b.data));
}
export const PORY = ["zima (sucha skóra, pękające pięty, święta i karnawał)", "zima (sucha skóra, pękające pięty, karnawał, walentynki)", "przedwiośnie (odnowa skóry przed latem, ostatni dzwonek na kwasy i laser)",
  "wiosna (przygotowanie stóp do sandałów, sezon komunii i wesel)", "wiosna (wesela, komunie, Dzień Matki)", "początek lata (sandały, SPF, wesela, wakacje)",
  "lato (stopy w klapkach, słońce i przebarwienia, zabiegi bez złuszczania)", "lato (urlopy, skóra po słońcu, powroty z wakacji)", "wrzesień (powrót do rutyny, skóra po lecie, start sezonu na kwasy)",
  "jesień (sezon na kwasy, laser, mezoterapię; mniej słońca)", "listopad (pielęgnacja przed zimą, Black Friday, przygotowanie do świąt)", "grudzień (święta, sylwester, vouchery na prezent)"];

// --- bank pytań klientek ---
export const PYTANIA = path.join(ROOT, "03_BIBLIOTEKA", "research", "pytania.json");
export const czytajPytania = () => czytajJ(PYTANIA, { pytania: [] });
export function dodajPytanie({ tekst, zrodlo = "", kategoria = "" }) {
  const t = String(tekst || "").trim().replace(/\s+/g, " ").slice(0, 300);
  if (t.length < 4) throw new Error("Wpisz pytanie.");
  const B = czytajPytania();
  if (B.pytania.some((p) => p.tekst.toLowerCase() === t.toLowerCase())) throw new Error("To pytanie już jest w banku.");
  B.pytania.unshift({ id: crypto.randomBytes(4).toString("hex"), tekst: t, zrodlo: String(zrodlo).slice(0, 30), kategoria: String(kategoria).slice(0, 30), dodano: new Date().toISOString(), uzyte: null });
  piszJ(PYTANIA, B);
  return B;
}
export function usunPytanie(id) { const B = czytajPytania(); B.pytania = B.pytania.filter((p) => p.id !== id); piszJ(PYTANIA, B); return B; }
export function oznaczPytania(teksty, gdzie) {
  if (!teksty?.length) return;
  const B = czytajPytania();
  for (const p of B.pytania) if (!p.uzyte && teksty.some((t) => t && (t.includes(p.tekst.slice(0, 40)) || p.tekst.includes(String(t).slice(0, 40))))) p.uzyte = gdzie;
  piszJ(PYTANIA, B);
}

// --- grafik zabiegów (co faktycznie jest w gabinecie w najbliższe dni) ---
export const GRAFIK = path.join(PROJEKTY, "_plan", "grafik.json");
export const czytajGrafik = () => czytajJ(GRAFIK, {});
export function zapiszGrafik(wpisy) {
  const G = czytajGrafik();
  for (const [d, t] of Object.entries(wpisy || {})) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) continue;
    const tx = String(t || "").trim().slice(0, 300);
    if (tx) G[d] = tx; else delete G[d];
  }
  // starsze niż 60 dni wylatują
  const granica = iso(plus(new Date(), -60));
  for (const d of Object.keys(G)) if (d < granica) delete G[d];
  piszJ(GRAFIK, G);
  return G;
}

// --- reszta kontekstu ---
export function ostatnieRolki(n = 12) {
  try { return fs.readdirSync(PROJEKTY).filter((x) => !x.startsWith("_") && /^\d{4}-\d{2}-\d{2}_/.test(x)).sort().reverse().slice(0, n).map((x) => x.replace(/^\d{4}-\d{2}-\d{2}_/, "").replace(/[_-]/g, " ")); } catch { return []; }
}
export function formaty() { return (czytaj(path.join(ROOT, ".claude", "skills", "rolki-beauty", "references", "formaty-rolek.md")).match(/^## \d+\. .+$/gm) || []).map((l) => l.replace(/^## \d+\.\s*/, "")); }

/** Tekst kontekstu do promptu. od = data startu (dla pory roku, okazji i grafiku), dni = ile dni grafiku i okazji. */
export function kontekstGabinetu({ od = new Date(), dni = 10, bezPrzepisu = false } = {}) {
  const cfg = wczytajConfig();
  const OS = osobaZConfigu(cfg);
  const g = cfg.gabinet || {};
  const NAZWY_USLUG = { rzesy: "rzęsy", podologia: "podologia (stopy)", pedicure: "pedicure", brwi: "brwi", twarz: "twarz (kosmetologia)" };
  const usl = (g.uslugi || []).length ? g.uslugi.map((u) => NAZWY_USLUG[u] || u).join(", ") : "kosmetologia (brwi, rzęsy, twarz) i podologia (pedicure, stopy, paznokcie)";
  const ok = okazje(od, 24);
  const G = czytajGrafik();
  const grafik = Array.from({ length: dni }, (_, i) => iso(plus(od, i))).filter((d) => G[d]).map((d) => `- ${d} (${NAZWY_DNI[(data(d).getDay() + 6) % 7]}): ${G[d]}`);
  const pyt = czytajPytania().pytania.filter((p) => !p.uzyte).slice(0, 15);
  const wnioski = czytaj(path.join(ROOT, "05_ARCHIWUM", "wnioski.md")).slice(0, 2500);
  let przepis = ""; if (!bezPrzepisu) try { przepis = przepisDlaClaude(policz({ zapisz: false }), "mieszany", false); } catch {}
  const bank = bankDoPromptu(6);
  return `GABINET: ${g.nazwa && !/todo/i.test(g.nazwa) ? g.nazwa : "gabinet beauty"}${g.miasto && !/todo/i.test(g.miasto) ? `, ${g.miasto}` : ""}. Mówi do kamery ${OS.mian}. Usługi: ${usl}.
PORA ROKU: ${PORY[od.getMonth()]}.
OKAZJE W NAJBLIŻSZYCH TYGODNIACH (rolka o okazji wychodzi 2-10 dni PRZED nią, nie po): ${ok.length ? ok.map((o) => `${o.data} ${o.okazja}`).join("; ") : "brak, graj porą roku i potrzebami klientek"}.
${grafik.length ? `GRAFIK ZABIEGÓW (to faktycznie dzieje się w gabinecie, więc to da się nagrać; buduj rolki pod te wizyty):\n${grafik.join("\n")}\n` : ""}${pyt.length ? `PYTANIA KLIENTEK (z komentarzy, DM i gabinetu; najlepsze źródło tematów: odpowiedź na prawdziwe pytanie = „to o mnie”):\n${pyt.map((p) => `- „${p.tekst}”${p.zrodlo ? ` (${p.zrodlo})` : ""}`).join("\n")}\n` : ""}OSTATNIE ROLKI (nie powtarzaj tematów): ${ostatnieRolki().join("; ") || "brak"}.
FORMATY (pole "format", nazwa bez numeru): ${formaty().join("; ")}.
${przepis ? `PRZEPIS Z WYNIKÓW KONTA:\n${przepis}\n` : ""}${wnioski ? `WNIOSKI Z WYNIKÓW (ważniejsze niż ogólne zasady):\n${wnioski}\n` : ""}${bank ? `HOOKI Z RESEARCHU (bierz MECHANIZM, nigdy słowa):\n${bank}\n` : ""}`;
}

/** Zasady scenariusza z progami twardej oceny (scripts/ocena-scenariusza.mjs), żeby od razu przechodził. */
export function zasadyScenariusza() {
  return `ZASADY SCENARIUSZA (panel liczy twardą ocenę 0-100, pisz tak, żeby przeszła 85+):
- Hook: tekst na ekranie 3-7 słów z jednym *akcentem*; zdanie mówione maks. 10 słów, bez „cześć”, „dzisiaj”, „pokażę ci”, „zapraszam”; w "wizual" hooka ruch, efekt albo zbliżenie; pierwszy wiersz scenariusza (rola "hook") kończy się najpóźniej w 2 s.
- Dynamika: każdy fragment maks. 2,5 s albo z wpisanym "bodziec" (co się zmienia w obrazie lub dźwięku); mowa 2,3-3,2 słowa na sekundę fragmentu (licz słowa!) i bez fragmentów dużo wolniejszych od reszty.
- Struktura: między 35% a 65% długości fragment "rola": "rehook" (zwrot, licznik, nowa obietnica); w ostatnich 30% fragment "rola": "nagroda" (efekt albo odpowiedź na hook); jedno CTA w ostatnich 20%.
- Tekst na ekranie mieści się w czasie czytania (0,6 s + 0,3 s na słowo); gdy fragment ma mowę, na ekranie maks. 4 słowa.
- Jeden „moment do wysłania” (zdanie albo obraz, przy którym widz pomyśli „muszę to komuś wysłać”), wpisany w "utrzymanie".
- Długość zwykle 15-30 s. Materiały M1, M2… łatwe do nagrania telefonem; każdy fragment scenariusza wskazuje "material"; materiały z mową mają "teleprompter" słowo w słowo; "nazwa_pliku" np. "M1_mowa_hook".
- Bez obietnic medycznych i gwarancji; przed/po zawsze z „efekt indywidualny”; podologia estetycznie, bez diagnoz; twarz klientki tylko za zgodą (daj też ujęcia bez twarzy).`;
}

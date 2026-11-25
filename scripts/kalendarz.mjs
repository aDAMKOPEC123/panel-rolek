// Kalendarz rolek (panel: „🗓️ Kalendarz” w nagłówku, panel/public/kalendarz.js): miesiąc z planami tygodni (01_PROJEKTY/_plan/*.json),
// opublikowanymi rolkami z wynikami (brief „data publikacji” + final/wyniki.json), rolkami z Instagrama bez pary (05_ARCHIWUM/instagram.json),
// okazjami i grafikiem zabiegów. Operacje: przeniesienie rolki na inny dzień (także między tygodniami), własny wpis, usunięcie,
// eksport do kalendarza w telefonie (.ics: nagranie + publikacja z przypomnieniem), najlepsza pora publikacji z własnych wyników.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { PROJEKTY, ARCHIWUM, KATEGORIE, czytajBrief, wczytajConfig, zapiszJSONAtomowo } from "./lib.mjs";
import { iso, data, plus, okazje, czytajGrafik } from "./kontekst-rolek.mjs";
import { TYPY_PUBLIKACJI, CELE_PUBLIKACJI, DNI_PUBLIKACJI, typPublikacji, czyRolka, wyborPublikacji, rozkladPublikacji } from "./publikacje.mjs";
import { maKontrolePublikacji, maRozpiskePublikacji, pokazJakoscPublikacji, podpisJakosciPublikacji, recenzujPlanyPublikacji } from "./jakosc-publikacji.mjs";

const PLAN_DIR = path.join(PROJEKTY, "_plan");
const czytajJ = (p, d) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return d; } };
const piszJ = (p, v) => {
  // plan tygodnia bez rolek i bez motywu (powstał tylko przez przeniesienie albo własny wpis) = bez pliku, tydzień dalej „do ułożenia”
  if (v?.dni && !v.dni.length && !v.motyw && path.dirname(p) === PLAN_DIR) { fs.rmSync(p, { force: true }); return; }
  fs.mkdirSync(path.dirname(p), { recursive: true }); zapiszJSONAtomowo(p, v);
};
const poniedzialek = (d) => { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; };
const DNI_TYG = ["niedziela", "poniedziałek", "wtorek", "środa", "czwartek", "piątek", "sobota"];
const poprawnaData = (s) => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && iso(data(s)) === s;
const poprawnaGodzina = (s) => typeof s === "string" && /^(?:[01]?\d|2[0-3]):[0-5]\d$/.test(s);

/** Wszystkie plany tygodni; brakujące id wpisów dopisywane i zapisywane (potrzebne do przenoszenia). */
export function wszystkiePlany() {
  if (!fs.existsSync(PLAN_DIR)) return [];
  const out = [];
  for (const n of fs.readdirSync(PLAN_DIR).filter((x) => /^\d{4}-\d{2}-\d{2}\.json$/.test(x)).sort()) {
    const p = path.join(PLAN_DIR, n), plan = czytajJ(p, null);
    if (!plan?.dni) continue;
    let zmiana = false;
    for (const d of plan.dni) if (!d.id) { d.id = crypto.randomBytes(4).toString("hex"); zmiana = true; }
    if (zmiana) piszJ(p, plan);
    out.push({ plik: p, od: n.slice(0, 10), plan });
  }
  return out;
}
function znajdzWpis(id) {
  for (const P of wszystkiePlany()) { const i = P.plan.dni.findIndex((d) => d.id === id); if (i >= 0) return { ...P, i }; }
  return null;
}

export function pobierzWpisPlanu(id) {
  const W = znajdzWpis(id);
  if (!W) throw new Error("Nie ma takiej publikacji w planie.");
  return W.plan.dni[W.i];
}

export function sprawdzWpisDoRecenzji(id) {
  const d = pobierzWpisPlanu(id);
  if (!maKontrolePublikacji(d) || !maRozpiskePublikacji(d)) throw new Error("Uzupełnij rozpiskę posta, karuzeli lub Story przed recenzją.");
  return d;
}

export async function recenzujWpisPublikacji(id, generuj) {
  const d = sprawdzWpisDoRecenzji(id);
  const { wyniki, koszt } = await recenzujPlanyPublikacji([d], generuj);
  const raport = wyniki.get(id), W = znajdzWpis(id);
  const aktualny = W?.plan.dni[W.i];
  if (!aktualny || aktualny.termin || podpisJakosciPublikacji(aktualny) !== raport.podpis) {
    throw new Error("Publikacja zmieniła się w trakcie recenzji. Sprawdź zapisaną wersję ponownie.");
  }
  // Nie zastępuj aktualnej oceny, jeżeli ponowna próba zakończyła się błędem usługi.
  if (!raport.bladAI || aktualny.recenzja_publikacji?.podpis !== raport.podpis || !aktualny.recenzja_publikacji.ai) {
    aktualny.recenzja_publikacji = raport;
  }
  if (koszt) W.plan.koszt_usd = +(((W.plan.koszt_usd || 0) + koszt).toFixed(3));
  piszJ(W.plik, W.plan);
  return raport;
}

export function wpisZJakoscia(d) {
  const { recenzja_publikacji, ...wpis } = d;
  const jakosc = pokazJakoscPublikacji(d);
  return jakosc ? { ...wpis, jakosc_publikacji: jakosc } : wpis;
}

export function podpisWersjiWpisu(d) {
  return crypto.createHash("sha256").update(JSON.stringify([podpisJakosciPublikacji(d), d.hook_tekst, d.cta, d.plan_tresci])).digest("hex");
}

export function zapiszPoprawkeWpisu(id, { podpis, element, po, preferencja }) {
  const W = znajdzWpis(id), d = W?.plan.dni[W.i];
  if (!d || d.termin || podpisWersjiWpisu(d) !== podpis || !d.plan_tresci?.[element - 1]) {
    throw Object.assign(new Error("Plan się zmienił. Przygotuj poprawkę ponownie."), { status: 409 });
  }
  d.plan_tresci[element - 1] = { ...d.plan_tresci[element - 1], co: po.co, jak: po.jak };
  d.wlasny = true;
  if (preferencja) d.preferencje_ai = [...(d.preferencje_ai || []), preferencja].slice(-24);
  piszJ(W.plik, W.plan);
  return { ...wpisZJakoscia(d), tydzien: W.od };
}
function planTygodnia(od) {
  const p = path.join(PLAN_DIR, `${od}.json`);
  return { plik: p, plan: czytajJ(p, null) || { od, do: iso(plus(data(od), 6)), wygenerowano: new Date().toISOString(), motyw: "", uwagi: "", ustawienia: {}, okazje: okazje(data(od), 24).filter((o) => o.dni_od_startu <= 13), dni: [] } };
}

/** Rolki opublikowane (brief: data publikacji) z wynikami. */
export function opublikowane() {
  const out = [];
  for (const [gdzie, dir] of [["projekty", PROJEKTY], ["archiwum", ARCHIWUM]]) {
    if (!fs.existsSync(dir)) continue;
    for (const n of fs.readdirSync(dir)) {
      const p = path.join(dir, n);
      if (n.startsWith("_") || !fs.statSync(p).isDirectory() || !fs.existsSync(path.join(p, "brief.md"))) continue;
      let pola = {}; try { pola = czytajBrief(p).pola; } catch {}
      const w = czytajJ(path.join(p, "final", "wyniki.json"), null);
      const dp = String(pola["data publikacji"] || w?.data_publikacji || "").trim();
      if (!/^\d{4}-\d{2}-\d{2}/.test(dp)) continue;
      out.push({ projekt: n, gdzie, data: dp.slice(0, 10), godzina: (dp.match(/\d{1,2}:\d{2}/) || [""])[0], tytul: /^todo$/i.test(pola["tytuł roboczy"] || "") ? n : pola["tytuł roboczy"] || n, kategoria: pola["kategoria"] || "",
        wyniki: w ? { wyswietlenia: w.wyswietlenia ?? null, zasieg: w.zasieg ?? null, pominiecia: w.pominiecia ?? null, zapisy: w.zapisy ?? null, wyslania: w.wyslania ?? null, dzien: w.dzien ?? null, permalink: w.permalink || null } : null });
    }
  }
  return out;
}

/** Najlepsza pora publikacji z własnych wyników: dzień tygodnia i pora dnia z najwyższą medianą wyświetleń względem konta. */
export function najlepszaPora(lista = opublikowane()) {
  const z = lista.filter((r) => r.wyniki?.wyswietlenia != null && (r.wyniki.dzien == null || r.wyniki.dzien >= 3));
  if (z.length < 6) return { dosc: false, liczba: z.length, potrzeba: 6, opis: `Za mało rolek z wynikami (${z.length}/6), żeby policzyć Twoją najlepszą porę. Na razie: wieczór 18:00-20:00 w dni robocze.` };
  const med = (a) => { const s = [...a].sort((x, y) => x - y); return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2; };
  const baza = med(z.map((r) => r.wyniki.wyswietlenia)) || 1;
  const pora = (g) => { const h = Number((g || "18:00").split(":")[0]); return h < 12 ? "rano (do 12)" : h < 17 ? "po południu (12-17)" : h < 21 ? "wieczorem (17-21)" : "późnym wieczorem (po 21)"; };
  const grupy = (klucz) => {
    const m = new Map();
    for (const r of z) { const k = klucz(r); if (!m.has(k)) m.set(k, []); m.get(k).push(r.wyniki.wyswietlenia / baza); }
    return [...m.entries()].filter(([, v]) => v.length >= 2).map(([k, v]) => ({ k, wynik: med(v), n: v.length })).sort((a, b) => b.wynik - a.wynik);
  };
  const dni = grupy((r) => DNI_TYG[data(r.data).getDay()]), pory = grupy((r) => pora(r.godzina));
  const d = dni[0], p = pory[0];
  return { dosc: true, liczba: z.length, dzien: d?.k || null, pora: p?.k || null, dni, pory,
    opis: d || p ? `Najlepiej u Ciebie: ${[d && `${d.k} (${Math.round(d.wynik * 100)}% mediany, ${d.n} rolek)`, p && `${p.k} (${Math.round(p.wynik * 100)}%)`].filter(Boolean).join(", ")}.` : "Wyniki są zbyt równe, żeby wskazać porę." };
}

/** Dane miesiąca do widoku: siatka od poniedziałku przed 1. dniem do niedzieli po ostatnim. */
export function miesiac(odMies) {
  const pierwszy = data(/^\d{4}-\d{2}/.test(odMies || "") ? odMies.slice(0, 7) + "-01" : iso(new Date()).slice(0, 7) + "-01");
  const ostatni = new Date(pierwszy.getFullYear(), pierwszy.getMonth() + 1, 0, 12);
  const start = poniedzialek(pierwszy), koniec = plus(poniedzialek(ostatni), 6);
  const od = iso(start), doD = iso(koniec);
  const dni = {};
  for (let d = start; d <= koniec; d = plus(d, 1)) dni[iso(d)] = { plan: [], opublikowane: [], ig: [], okazje: [], grafik: "" };
  const plany = wszystkiePlany();
  for (const P of plany) for (const d of P.plan.dni) if (dni[d.data]) dni[d.data].plan.push({ ...wpisZJakoscia(d), tydzien: P.od, motyw: P.plan.motyw || "" });
  // nagrania z planu w dniu nagrania (gdy inny niż publikacja)
  for (const P of plany) for (const d of P.plan.dni) if (czyRolka(d) && d.nagraj_dnia && d.nagraj_dnia !== d.data && dni[d.nagraj_dnia] && !["opublikowana", "pominieta", "gotowa"].includes(d.stan)) (dni[d.nagraj_dnia].nagrania ||= []).push({ id: d.id, tytul: d.tytul, tydzien: P.od, data: d.data });
  const pub = opublikowane();
  const zPlanu = new Set(plany.flatMap((P) => P.plan.dni.map((d) => d.projekt).filter(Boolean)));
  for (const r of pub) if (dni[r.data] && !(zPlanu.has(r.projekt) && dni[r.data].plan.some((x) => x.projekt === r.projekt))) dni[r.data].opublikowane.push(r);
  const ig = czytajJ(path.join(ARCHIWUM, "instagram.json"), { rolki: [] });
  for (const r of ig.rolki || []) { const d = iso(new Date(r.timestamp)); if (dni[d] && !r.projekt) dni[d].ig.push({ id: r.id, permalink: r.permalink, caption: String(r.caption || "").slice(0, 80), wyswietlenia: r.statystyki?.views ?? null }); }
  for (const o of okazje(start, Math.round((koniec - start) / 864e5))) if (dni[o.data]) dni[o.data].okazje.push(o.okazja);
  const G = czytajGrafik();
  for (const d of Object.keys(dni)) if (G[d]) dni[d].grafik = G[d];
  // statystyki miesiąca (tylko dni z tego miesiąca)
  const wMies = Object.entries(dni).filter(([d]) => d.slice(0, 7) === iso(pierwszy).slice(0, 7));
  const wpisy = wMies.flatMap(([, x]) => x.plan);
  const stat = { zaplanowane: wpisy.length, scenariusze: wpisy.filter((d) => czyRolka(d) && (d.pomysl || d.projekt)).length, nagrane: wpisy.filter((d) => czyRolka(d) && ["nagrane", "gotowa", "opublikowana"].includes(d.stan)).length,
    opublikowane: wpisy.filter((d) => d.stan === "opublikowana").length + wMies.reduce((s, [, x]) => s + x.opublikowane.length, 0), pominiete: wpisy.filter((d) => d.stan === "pominieta").length,
    wyswietlenia: wMies.reduce((s, [, x]) => s + x.opublikowane.reduce((a, r) => a + (r.wyniki?.wyswietlenia || 0), 0), 0) };
  stat.formaty = Object.fromEntries(Object.keys(TYPY_PUBLIKACJI).map((typ) => [typ, wpisy.filter((d) => typPublikacji(d) === typ).length]));
  // tygodnie bez planu (do „Zaplanuj miesiąc”)
  const tygodnie = [];
  const poTygodniu = new Map(plany.map((p) => [p.od, p.plan.dni]));
  for (let d = start; d <= koniec; d = plus(d, 7)) {
    const wpisy = poTygodniu.get(iso(d)) || [];
    tygodnie.push({ od: iso(d), plan: wpisy.some((w) => !w.wlasny && !w.termin), maWpisy: !!wpisy.length });
  }
  return { miesiac: iso(pierwszy).slice(0, 7), od, do: doD, dzis: iso(new Date()), dni, statystyki: stat, tygodnie, pora: najlepszaPora(pub) };
}

/** Przeniesienie wpisu planu na inny dzień (także do innego tygodnia). Dzień nagrania przesuwa się o tyle samo. */
export function przenies(id, naData) {
  if (!poprawnaData(naData)) throw new Error("Zła data.");
  const W = znajdzWpis(id);
  if (!W) throw new Error("Nie ma takiej publikacji w planie.");
  const d = W.plan.dni[W.i];
  const roznica = Math.round((data(naData) - data(d.data)) / 864e5);
  if (!roznica) return d;
  if (czyRolka(d) && !d.termin) d.nagraj_dnia = d.nagraj_dnia ? iso(plus(data(d.nagraj_dnia), roznica)) : iso(plus(data(naData), -1));
  if (d.nagraj_dnia > naData) d.nagraj_dnia = naData;
  d.data = naData;
  const cel = iso(poniedzialek(data(naData)));
  if (cel === W.od) { W.plan.dni.sort((a, b) => a.data.localeCompare(b.data)); piszJ(W.plik, W.plan); return d; }
  W.plan.dni.splice(W.i, 1);
  piszJ(W.plik, W.plan);
  const T = planTygodnia(cel);
  T.plan.dni.push(d); T.plan.dni.sort((a, b) => a.data.localeCompare(b.data));
  piszJ(T.plik, T.plan);
  return d;
}

function nowyWpis({ data: dzien, tytul, kategoria = "", notatka = "", godzina = "18:00", wyglad = "naturalny", typ_publikacji, cel_publikacji }) {
  const publikacja = wyborPublikacji(typ_publikacji, cel_publikacji);
  const t = typeof tytul === "string" ? tytul.trim().slice(0, 80) : "";
  if (t.length < 3) throw new Error("Wpisz temat publikacji.");
  if (!poprawnaGodzina(godzina)) throw new Error("Podaj prawidłową godzinę publikacji.");
  return {
    ...publikacja,
    id: crypto.randomBytes(4).toString("hex"), data: dzien, tytul: t, kategoria: KATEGORIE.includes(kategoria) ? kategoria : "gabinet", format: "", hook_tekst: "", hook_mowa: "",
    dlaczego_teraz: String(notatka || "").trim().slice(0, 300), co_nagrac: [], nagraj_dnia: czyRolka(publikacja) ? iso(plus(data(dzien), -1)) : "", kiedy_nagrac: "", cta: "",
    wyglad: wyglad === "reklamowy" ? "reklamowy" : "naturalny", godzina: godzina.padStart(5, "0"), pytanie_klientki: "", stan: "plan",
  };
}

export function dodajWlasny(dane) {
  if (!poprawnaData(dane?.data)) throw new Error("Zła data.");
  const wpis = { ...nowyWpis(dane), wlasny: true };
  const T = planTygodnia(iso(poniedzialek(data(dane.data))));
  T.plan.dni.push(wpis); T.plan.dni.sort((a, b) => a.data.localeCompare(b.data));
  piszJ(T.plik, T.plan);
  return wpis;
}

/** Aktualizuje terminy bez tematu. Wpisy z przygotowaną treścią pozostają w kalendarzu. */
export function zapiszTerminy({ tygodnie, publikacje, uwagi = "" } = {}) {
  const ustawienia = rozkladPublikacji(publikacje);
  if (!Array.isArray(tygodnie) || !tygodnie.length || tygodnie.length > 6 || tygodnie.some((d) => !poprawnaData(d) || data(d).getDay() !== 1)) {
    throw new Error("Wybierz prawidłowy tydzień publikacji.");
  }
  if (typeof uwagi !== "string" || uwagi.length > 1000) throw new Error("Notatka do planu może mieć do 1000 znaków.");
  for (const od of new Set(tygodnie)) {
    const { plik, plan } = planTygodnia(od);
    const terminy = plan.dni.filter((d) => d.termin && d.stan === "plan" && !d.pomysl && !d.projekt);
    const zostaja = plan.dni.filter((d) => !terminy.includes(d));
    for (const u of ustawienia) {
      const dzien = iso(plus(data(od), DNI_PUBLIKACJI.indexOf(u.dzien)));
      if (zostaja.some((d) => d.data === dzien && d.stan !== "pominieta" && typPublikacji(d) === u.typ_publikacji)) continue;
      const poprzedni = terminy.find((d) => d.data === dzien && typPublikacji(d) === u.typ_publikacji);
      const wpis = poprzedni || { ...nowyWpis({ ...u, data: dzien, tytul: TYPY_PUBLIKACJI[u.typ_publikacji].nazwa }), termin: true, nagraj_dnia: "" };
      zostaja.push({ ...wpis, cel_publikacji: u.cel_publikacji });
    }
    plan.dni = zostaja.sort((a, b) => a.data.localeCompare(b.data));
    plan.ustawienia = { ...plan.ustawienia, dni: ustawienia.map((u) => u.dzien), publikacje: ustawienia, uwagi };
    piszJ(plik, plan);
  }
  return { ok: true };
}
/** Zmiana stanu / pomysłu / rolki wpisu po id. */
export function ustawWpis(id, zmiany = {}) {
  const W = znajdzWpis(id);
  if (!W) throw new Error("Nie ma takiej publikacji w planie.");
  const d = W.plan.dni[W.i];
  if (zmiany.stan && !["plan", "scenariusz", "nagrane", "gotowa", "opublikowana", "pominieta"].includes(zmiany.stan)) throw new Error("Zły stan.");
  const typ = typPublikacji(d), wybor = wyborPublikacji(zmiany.typ_publikacji ?? typ, zmiany.cel_publikacji ?? d.cel_publikacji);
  if (typ !== wybor.typ_publikacji && (d.pomysl || d.projekt || !["plan", "pominieta"].includes(d.stan || "plan"))) {
    throw new Error("Format jest powiązany z przygotowanym materiałem.");
  }
  if (!czyRolka(wybor) && (zmiany.pomysl || zmiany.projekt || ["scenariusz", "nagrane"].includes(zmiany.stan))) {
    throw new Error("Scenariusze rolek i nagrania są dostępne dla formatu Rolka.");
  }
  if (zmiany.godzina !== undefined && !poprawnaGodzina(zmiany.godzina)) throw new Error("Podaj prawidłową godzinę publikacji.");
  if (zmiany.tytul !== undefined && (typeof zmiany.tytul !== "string" || zmiany.tytul.trim().length < 3)) throw new Error("Wpisz temat publikacji.");
  if (zmiany.notatka !== undefined && typeof zmiany.notatka !== "string") throw new Error("Nieprawidłowa notatka.");
  const edycjaTresci = ["hook_tekst", "cta", "plan_tresci"].some((k) => zmiany[k] !== undefined);
  if (edycjaTresci && (!maKontrolePublikacji(wybor) || (d.termin && zmiany.tytul === undefined))) throw new Error("Najpierw wpisz temat i wybierz format publikacji.");
  for (const k of ["hook_tekst", "cta"]) {
    const v = zmiany[k];
    if (v !== undefined && (typeof v !== "string" || v.length > 180)) throw new Error("Nagłówek i CTA mogą mieć po 180 znaków.");
  }
  const rozpiska = zmiany.plan_tresci;
  if (rozpiska !== undefined && (!Array.isArray(rozpiska) || rozpiska.length > 20 || rozpiska.some((u) => typeof u?.co !== "string" || u.co.length > 180 || typeof u.jak !== "string" || u.jak.length > 360))) {
    throw new Error("W rozpisce możesz zapisać do 20 elementów, z treścią do 180 i opisem wykonania do 360 znaków.");
  }
  if (typ !== wybor.typ_publikacji) {
    Object.assign(d, { format: "", hook_tekst: "", hook_mowa: "", cta: "", co_nagrac: [], plan_tresci: [], kiedy_nagrac: "", nagraj_dnia: czyRolka(wybor) && !d.termin ? iso(plus(data(d.data), -1)) : "" });
    if (d.termin) d.tytul = TYPY_PUBLIKACJI[wybor.typ_publikacji].nazwa;
  }
  if (zmiany.typ_publikacji !== undefined || zmiany.cel_publikacji !== undefined) Object.assign(d, wybor);
  for (const k of ["stan", "pomysl", "projekt", "godzina"]) if (zmiany[k] !== undefined) d[k] = zmiany[k];
  if (zmiany.tytul !== undefined) d.tytul = zmiany.tytul.trim().slice(0, 80);
  if (zmiany.notatka !== undefined) d.dlaczego_teraz = zmiany.notatka.trim().slice(0, 300);
  for (const k of ["hook_tekst", "cta"]) if (zmiany[k] !== undefined) d[k] = zmiany[k].trim();
  if (rozpiska !== undefined) d.plan_tresci = rozpiska.map(({ co, jak }) => ({ co: co.trim(), jak: jak.trim() }));
  if (!d.termin && (edycjaTresci || zmiany.tytul !== undefined || zmiany.notatka !== undefined || typ !== wybor.typ_publikacji)) d.wlasny = true;
  if (d.termin && (zmiany.tytul !== undefined || zmiany.notatka !== undefined)) {
    delete d.termin;
    d.wlasny = true;
    if (czyRolka(d)) d.nagraj_dnia = iso(plus(data(d.data), -1));
  }
  piszJ(W.plik, W.plan);
  return { ...wpisZJakoscia(d), tydzien: W.od };
}
export function usunWpis(id) {
  const W = znajdzWpis(id);
  if (!W) throw new Error("Nie ma takiej publikacji w planie.");
  W.plan.dni.splice(W.i, 1);
  piszJ(W.plik, W.plan);
  return { ok: true };
}

/** Kalendarz .ics (telefon, Google, Outlook): nagranie 9:00 z listą ujęć i publikacja o godzinie z planu, oba z przypomnieniem. */
export function ics({ od, doD } = {}) {
  const cfg = wczytajConfig();
  const nazwa = cfg.gabinet?.nazwa && !/todo/i.test(cfg.gabinet.nazwa) ? cfg.gabinet.nazwa : "Rolki";
  const odD = od || iso(plus(new Date(), -7)), doData = doD || iso(plus(new Date(), 60));
  const tekst = (s) => String(s || "").replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
  const zawin = (l) => { const out = []; let s = l; while (Buffer.byteLength(s) > 74) { let n = 74; while (Buffer.byteLength(s.slice(0, n)) > 74) n--; out.push(s.slice(0, n)); s = " " + s.slice(n); } out.push(s); return out.join("\r\n"); };
  const czas = (d, g) => `${d.replace(/-/g, "")}T${(g || "09:00").replace(":", "").padStart(4, "0")}00`;
  const plusMin = (d, g, min) => { const [h, m] = (g || "09:00").split(":").map(Number); const t = new Date(data(d)); t.setHours(h, m + min, 0); return `${iso(t).replace(/-/g, "")}T${String(t.getHours()).padStart(2, "0")}${String(t.getMinutes()).padStart(2, "0")}00`; };
  const teraz = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
  const ev = [];
  for (const P of wszystkiePlany()) for (const d of P.plan.dni) {
    if (["opublikowana", "pominieta"].includes(d.stan) || d.data < odD || d.data > doData) continue;
    const format = TYPY_PUBLIKACJI[typPublikacji(d)]?.nazwa || "Publikacja";
    const tytul = d.termin ? format : `${format} · ${d.tytul}`;
    const cel = d.cel_publikacji !== "dowolny" ? CELE_PUBLIKACJI[d.cel_publikacji] : "";
    const opis = [cel, d.hook_tekst?.replace(/\*/g, ""), d.hook_mowa && `Pierwsze zdanie: „${d.hook_mowa}”`, d.dlaczego_teraz, ...(czyRolka(d) ? d.co_nagrac || [] : d.plan_tresci || []).map((u) => `• ${u.co} (${u.jak})`), d.cta && `CTA: ${d.cta}`].filter(Boolean).join("\n");
    if (czyRolka(d) && d.nagraj_dnia && !["nagrane", "gotowa"].includes(d.stan)) ev.push(["BEGIN:VEVENT", `UID:nagranie-${d.id}@rolki`, `DTSTAMP:${teraz}`, `DTSTART:${czas(d.nagraj_dnia, "09:00")}`, `DTEND:${plusMin(d.nagraj_dnia, "09:00", 30)}`, `SUMMARY:${tekst(`🎥 Nagraj: ${d.tytul}`)}`, `DESCRIPTION:${tekst(`${d.kiedy_nagrac ? d.kiedy_nagrac + "\n" : ""}${opis}`)}`, "BEGIN:VALARM", "ACTION:DISPLAY", `DESCRIPTION:${tekst(`Nagraj: ${d.tytul}`)}`, "TRIGGER:-PT15M", "END:VALARM", "END:VEVENT"]);
    ev.push(["BEGIN:VEVENT", `UID:publikacja-${d.id}@rolki`, `DTSTAMP:${teraz}`, `DTSTART:${czas(d.data, d.godzina || "18:00")}`, `DTEND:${plusMin(d.data, d.godzina || "18:00", 15)}`, `SUMMARY:${tekst(`📤 ${tytul}`)}`, `DESCRIPTION:${tekst(opis)}`, "BEGIN:VALARM", "ACTION:DISPLAY", `DESCRIPTION:${tekst(`Publikacja: ${tytul}`)}`, "TRIGGER:-PT30M", "END:VALARM", "END:VEVENT"]);
  }
  const linie = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Rolki panel//PL", "CALSCALE:GREGORIAN", "METHOD:PUBLISH", `X-WR-CALNAME:${tekst(`${nazwa}: publikacje`)}`, ...ev.flat(), "END:VCALENDAR"];
  return { tresc: linie.map(zawin).join("\r\n") + "\r\n", liczba: ev.length };
}

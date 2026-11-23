// Samouczący się przepis na rolki (na Twoich wynikach z Instagrama).
//   npm run algorytm            -> przelicza i zapisuje 05_ARCHIWUM/algorytm.json, wypisuje podsumowanie
//   import { policz, skladnikiRolki } from "./algorytm.mjs"   (panel)
//
// Jak to działa (metody dobrane pod małą liczbę rolek):
// 1. Składniki: każda rolka ma cechy (format, typ hooka, długość, tempo cięć, kto mówi, zajawka, przebitki,
//    CTA, pora publikacji, rolka na próbę...). Snapshot przy publikacji: final/skladniki.json.
// 2. Wynik względny: każdy wskaźnik dzielimy przez TWOJĄ medianę (nie przez cudze liczby), bo zasięg rolek
//    jednego konta waha się kilkukrotnie nawet przy tej samej godzinie. log2(stosunek), przycięty do ±2,
//    średnia ważona: utrzymanie (średni czas / długość) 30%, % zostających po 3 s 20%, wysłania/zasięg 20%,
//    zasięg 15%, zapisy/zasięg 10%, polubienia/zasięg 5%. 0 = typowa rolka, +1 = 2x lepsza niż zwykle.
// 3. Wagi cech: średnia wyników rolek z daną cechą, ściągnięta do zera przy małej liczbie rolek
//    (empiryczny Bayes / shrinkage: suma / (n + K)). Jedna wiralowa rolka nie przestawia przepisu.
// 4. Rolka na próbę: losowanie Thompsona. Dla każdej cechy losujemy z rozkładu wokół wagi (szerszego, gdy mało
//    danych); nieprzetestowane opcje mają szansę wygrać. Tak przepis nie zamyka się na tym, co zadziałało raz.
// 5. Tryb rolki: zwykły (ogólne zasady), mój (tylko Twoje dane), mieszany (udział Twoich danych rośnie z liczbą rolek).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ROOT, PROJEKTY, ARCHIWUM, czytajBrief, osobaZConfigu } from "./lib.mjs";
// imię z ustawień (config.json -> gabinet.osoba) w przypadkach: OS.mian, OS.dop, OS.cel, OS.bier; czytane przy każdym użyciu
const OS = new Proxy({}, { get: (_, k) => osobaZConfigu()[k] });

const czytaj = (p, d) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return d; } };
const r2 = (x) => Math.round(x * 100) / 100;
const mediana = (a) => { const s = a.filter((x) => isFinite(x)).sort((x, y) => x - y); if (!s.length) return null; const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
// „1,2 tys.” -> 1200, „12 345” -> 12345, „55%” -> 55
export function liczba(v) {
  if (v == null || v === "") return null;
  let t = String(v).toLowerCase().replace(/\s/g, "").replace("%", "");
  const mn = /tys|k$/.test(t) ? 1000 : /mln|m$/.test(t) ? 1e6 : 1;
  t = t.replace(/tys\.?|mln\.?|k$|m$/g, "").replace(",", ".");
  const n = Number(t);
  return isFinite(n) ? n * mn : null;
}

export const KATALOG = {
  format: ["Przed / po", "POV", "Mit vs fakt", "3 błędy przy...", "Dzień w gabinecie", "ASMR zabiegu", "Q&A", "Trend audio", "Tekst za postacią", "Cena / oferta", "Vlog / daily"],
  hook: ["ciekawość", "mit", "efekt", "pytanie", "POV", "liczba", "kontrowersja"],
  dlugosc: ["do 15 s", "15-25 s", "25-40 s", "ponad 40 s"],
  tempo: ["szybkie (do 1,5 s)", "średnie (1,5-3 s)", "wolne (ponad 3 s)"],
  kto_mowi: ["do kamery", "lektor", "bez mowy"],
  cta: ["zapisz", "wyślij", "obserwuj", "umów się", "komentarz", "brak"],
};
const NAZWY_WYMIAROW = { kategoria: "Kategoria", format: "Format", hook: "Typ hooka", dlugosc: "Długość", tempo: "Tempo cięć", kto_mowi: "Kto mówi", zajawka: "Zajawka efektu", przebitki: "Przebitki nad głosem", mikro_ciecia: "Mikro-cięcia", cta: "CTA", pora: "Pora publikacji", dzien: "Dzień tygodnia", proba: "Rolka na próbę" };
export const nazwaWymiaru = (k) => NAZWY_WYMIAROW[k] || k;

function formaty() {
  try {
    const t = fs.readFileSync(path.join(ROOT, ".claude", "skills", "rolki-beauty", "references", "formaty-rolek.md"), "utf8");
    return Object.fromEntries([...t.matchAll(/^## (\d+)\. (.+)$/gm)].map((m) => [Number(m[1]), m[2].replace(/\s*\(.*\)\s*$/, "").trim()]));
  } catch { return {}; }
}
const tn = (v) => (v ? "tak" : "nie");

// Cechy rolki z plików projektu (rolka.json, scenariusz.json, brief.md).
export function skladnikiRolki(proj) {
  const r = czytaj(path.join(proj, "kompozycja", "rolka.json"), {});
  const sc = czytaj(path.join(proj, "scenariusz.json"), null);
  let pola = {}, sekcje = "";
  try { pola = czytajBrief(proj).pola; sekcje = fs.readFileSync(path.join(proj, "brief.md"), "utf8"); } catch {}
  const zloz = czytaj(path.join(proj, "kompozycja", ".zloz.json"), {});
  const uj = (r.ujecia || []).filter((u) => u.src);
  const czasUj = (u) => { const seg = Array.isArray(u.segmenty) && u.segmenty.length > 1 ? u.segmenty.reduce((a, s) => a + (s[1] - s[0]), 0) : Number(u.do ?? 0) - Number(u.od || 0); return seg / (Number(u.tempo) || 1); };
  const dl = Number(zloz.dlugosc) || null;
  const sredniUj = uj.length ? uj.map(czasUj).filter((x) => x > 0).reduce((a, b) => a + b, 0) / uj.length : null;
  const f = formaty();
  const hookW = (sc?.hooki || []).find((h) => h.wybrany) || sc?.hooki?.[0];
  const ktoTxt = sc?.profil?.kto_mowi || pola["voiceover"] || "";
  const ctaTxt = (r.sceny || []).filter((s) => s.szablon === "cta-koncowe").map((s) => s.dane?.tekst || "").join(" ") + " " + (sc?.profil?.cta || "");
  const pub = String(pola["data publikacji"] || "");
  const godz = Number((pub.match(/(\d{1,2}):\d{2}/) || [])[1]);
  const dataP = pub.match(/\d{4}-\d{2}-\d{2}/)?.[0];
  const alg = sc?.algorytm || {};
  const cechy = {
    kategoria: pola["kategoria"] || r.kategoria || null,
    format: f[r.format] || sc?.profil?.format || null,
    hook: hookW?.typ ? String(hookW.typ).split(/[|,]/)[0].trim() : null,
    dlugosc: dl == null ? null : dl <= 15 ? "do 15 s" : dl <= 25 ? "15-25 s" : dl <= 40 ? "25-40 s" : "ponad 40 s",
    tempo: sredniUj == null ? null : sredniUj <= 1.5 ? "szybkie (do 1,5 s)" : sredniUj <= 3 ? "średnie (1,5-3 s)" : "wolne (ponad 3 s)",
    kto_mowi: !ktoTxt ? null : /lektor/i.test(ktoTxt) ? "lektor" : /^nie|bez mowy|sam tekst/i.test(ktoTxt) ? "bez mowy" : "do kamery",
    zajawka: tn(r.efekty?.zajawka),
    przebitki: tn(uj.some((u) => u.przebitki?.length)),
    mikro_ciecia: tn(uj.some((u) => Array.isArray(u.segmenty) && u.segmenty.length > 1)),
    cta: /wyślij|wyslij|wysłać|koleżan/i.test(ctaTxt) ? "wyślij" : /zapisz si|umów|umow|rezerw|link w bio/i.test(ctaTxt) ? "umów się" : /zapisz/i.test(ctaTxt) ? "zapisz" : /obserwuj/i.test(ctaTxt) || (r.sceny || []).some((s) => s.szablon === "ig-obserwuj") ? "obserwuj" : /komentarz|napisz/i.test(ctaTxt) ? "komentarz" : "brak",
    pora: isFinite(godz) ? (godz < 12 ? "rano (do 12)" : godz < 17 ? "popołudnie (12-17)" : "wieczór (od 17)") : null,
    dzien: dataP ? ["niedziela", "poniedziałek", "wtorek", "środa", "czwartek", "piątek", "sobota"][new Date(dataP + "T12:00:00").getDay()] : null,
    proba: tn(alg.proba || /^tak/i.test(pola["rolka na próbę"] || "")),
  };
  for (const k of Object.keys(cechy)) if (cechy[k] == null || /^todo(\s|\(|$)/i.test(String(cechy[k]).trim()) || !String(cechy[k]).trim()) delete cechy[k];
  return { cechy, dlugosc: dl, tryb: String(pola["algorytm"] || "").trim() || alg.tryb || "mieszany", testuje: alg.testuje || [], dataPublikacji: dataP || null, tytul: pola["tytuł roboczy"] || path.basename(proj) };
}

const WAGI = { utrzymanie: 0.30, zostaja3s: 0.20, wyslania: 0.20, zasieg: 0.15, zapisy: 0.10, polubienia: 0.05 };
export const NAZWY_WSK = { utrzymanie: "Średni czas oglądania (% długości)", zostaja3s: "Zostają po 3 s (100 - % pominięć)", wyslania: "Wysłania na 1000 osób", zasieg: "Zasięg", zapisy: "Zapisy na 1000 osób", polubienia: "Polubienia na 1000 osób" };

function wskazniki(w, dl) {
  const zas = liczba(w.zasieg) ?? liczba(w.wyswietlenia);
  const per = (x) => (x != null && zas ? (x / zas) * 1000 : null);
  const sc = liczba(w.sredni_czas), pom = liczba(w.pominiecia);
  return {
    utrzymanie: sc != null && dl ? Math.min(150, (sc / dl) * 100) : null,
    zostaja3s: pom != null ? Math.max(1, 100 - pom) : null,
    wyslania: per(liczba(w.wyslania) ?? liczba(w.udostepnienia)),
    zasieg: zas,
    zapisy: per(liczba(w.zapisy)),
    polubienia: per(liczba(w.polubienia)),
  };
}

function wszystkieRolki(katalogi) {
  const out = [];
  for (const [gdzie, dir] of katalogi || [["projekty", PROJEKTY], ["archiwum", ARCHIWUM]]) {
    if (!fs.existsSync(dir)) continue;
    for (const n of fs.readdirSync(dir)) {
      const p = path.join(dir, n);
      if (n.startsWith("_") || !fs.statSync(p).isDirectory() || !fs.existsSync(path.join(p, "brief.md"))) continue;
      const snap = czytaj(path.join(p, "final", "skladniki.json"), null);
      const sk = snap || skladnikiRolki(p);
      const wyniki = czytaj(path.join(p, "final", "wyniki.json"), null);
      let status = "";
      try { status = czytajBrief(p).pola["status"] || ""; } catch {}
      out.push({ nazwa: n, gdzie, ...sk, dataPublikacji: sk.dataPublikacji || wyniki?.data_publikacji || null, wyniki, status });
    }
  }
  return out;
}

// Prosty generator normalny (Box-Muller) do losowania Thompsona.
const gauss = () => { let u = 0, v = 0; while (!u) u = Math.random(); while (!v) v = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };

export function policz({ zapisz = true, katalogi = null } = {}) {
  const rolki = wszystkieRolki(katalogi);
  const dzis = new Date();
  const dni = (d) => (d ? Math.floor((dzis - new Date(d + "T12:00:00")) / 864e5) : null);
  const zWynikami = rolki.filter((r) => r.wyniki && Object.values(wskazniki(r.wyniki, r.dlugosc)).some((x) => x != null));
  for (const r of zWynikami) r.wsk = wskazniki(r.wyniki, r.dlugosc);
  const med = Object.fromEntries(Object.keys(WAGI).map((k) => [k, mediana(zWynikami.map((r) => r.wsk[k]))]));
  for (const r of zWynikami) {
    let s = 0, w = 0;
    r.porownanie = {};
    for (const [k, wg] of Object.entries(WAGI)) {
      const v = r.wsk[k], m = med[k];
      if (v == null || !m) continue;
      const l = Math.max(-2, Math.min(2, Math.log2(Math.max(v, 0.01) / m)));
      r.porownanie[k] = { wartosc: r2(v), mediana: r2(m), procent: Math.round((Math.pow(2, l) - 1) * 100) };
      s += wg * l; w += wg;
    }
    r.wynik = w ? r2(s / w) : null;
    r.procent = r.wynik == null ? null : Math.round((Math.pow(2, r.wynik) - 1) * 100);
  }
  const ocenione = zWynikami.filter((r) => r.wynik != null && zWynikami.length >= 2);
  const N = ocenione.length;
  const sd = N >= 3 ? Math.max(0.25, Math.sqrt(ocenione.reduce((a, r) => a + r.wynik ** 2, 0) / N)) : 0.6;
  const K = 2; // „wirtualne” rolki o wyniku 0: ściąganie małych prób do typowej rolki
  const cechy = {};
  for (const r of ocenione) for (const [k, v] of Object.entries(r.cechy || {})) {
    const c = ((cechy[k] ||= {})[v] ||= { n: 0, suma: 0, rolki: [] });
    c.n++; c.suma += r.wynik; c.rolki.push(r.nazwa);
  }
  // Waga = o ile rolki z tą cechą wypadają lepiej niż średnia wszystkich rolek (nie niż zero), ściągnięta do 0 przy małym n.
  // Cecha, którą mają wszystkie rolki (np. jedna kategoria), nic nie mówi: waga 0 i nie trafia do przepisu.
  const srWszystkich = N ? ocenione.reduce((a, r) => a + r.wynik, 0) / N : 0;
  for (const [k, vals] of Object.entries(cechy)) for (const [v, c] of Object.entries(vals)) {
    c.srednia = r2(c.suma / c.n);
    c.waga = c.n >= N ? 0 : r2((c.suma - c.n * srWszystkich) / (c.n + K));
    c.wspolna = c.n >= N;
    c.procent = Math.round((Math.pow(2, c.waga) - 1) * 100);
    c.pewnosc = c.n >= 6 ? "wysoka" : c.n >= 3 ? "średnia" : "niska";
    delete c.suma;
  }
  const lista = Object.entries(cechy).flatMap(([k, vals]) => Object.entries(vals).map(([v, c]) => ({ wymiar: k, nazwa: nazwaWymiaru(k), wartosc: v, ...c })));
  const mocne = lista.filter((c) => c.n >= 2 && c.waga >= 0.07).sort((a, b) => b.waga - a.waga).slice(0, 8);
  const slabe = lista.filter((c) => c.n >= 2 && c.waga <= -0.07).sort((a, b) => a.waga - b.waga).slice(0, 8);
  // Thompson: co warto przetestować w rolce na próbę (nieprzetestowane opcje mają szeroki rozkład wokół 0).
  const proba = [];
  for (const [k, opcje] of Object.entries(KATALOG)) {
    const los = opcje.map((v) => { const c = cechy[k]?.[v]; const n = c?.n || 0; return { v, n, los: (c?.waga || 0) + gauss() * sd / Math.sqrt(n + K) }; }).sort((a, b) => b.los - a.los)[0];
    if (los.n <= 1) proba.push({ wymiar: k, nazwa: nazwaWymiaru(k), wartosc: los.v, dotad: los.n });
  }
  proba.sort(() => Math.random() - 0.5);
  const alfa = r2(N / (N + 6)); // udział Twoich danych w trybie mieszanym
  const opublikowane = rolki.filter((r) => r.dataPublikacji);
  // Czeka na wyniki: minęło 7+ dni od publikacji, a wyników z 7. dnia (pole dzien >= 7) jeszcze nie ma.
  const czekajace = opublikowane.filter((r) => dni(r.dataPublikacji) >= 7 && !(Number(r.wyniki?.dzien) >= 7))
    .map((r) => ({ nazwa: r.nazwa, gdzie: r.gdzie, tytul: r.tytul, dataPublikacji: r.dataPublikacji, dni: dni(r.dataPublikacji), maWyniki: !!r.wyniki }));
  const doProb = rolki.filter((r) => r.dataPublikacji).sort((a, b) => (a.dataPublikacji < b.dataPublikacji ? 1 : -1));
  const odOstatniejProby = doProb.findIndex((r) => r.cechy?.proba === "tak");
  const czasNaProbe = N >= 3 && (odOstatniejProby === -1 ? doProb.length >= 3 : odOstatniejProby >= 3);
  const wynik = {
    przeliczono: new Date().toISOString(), rolek: rolki.length, opublikowanych: opublikowane.length, zWynikami: N, alfa,
    mediany: Object.fromEntries(Object.entries(med).map(([k, v]) => [k, v == null ? null : r2(v)])),
    pewnoscOgolna: N >= 12 ? "wysoka" : N >= 6 ? "średnia" : N >= 3 ? "niska" : "za mało danych (od 3 rolek z wynikami)",
    rolki: zWynikami.map((r) => ({ nazwa: r.nazwa, tytul: r.tytul, dataPublikacji: r.dataPublikacji, wynik: r.wynik, procent: r.procent, porownanie: r.porownanie, cechy: r.cechy, tryb: r.tryb })).sort((a, b) => (b.wynik ?? -9) - (a.wynik ?? -9)),
    cechy, mocne, slabe, proba: proba.slice(0, 3), czasNaProbe, czekajace,
  };
  if (zapisz) { fs.mkdirSync(ARCHIWUM, { recursive: true }); fs.writeFileSync(path.join(ARCHIWUM, "algorytm.json"), JSON.stringify(wynik, null, 1) + "\n", "utf8"); }
  return wynik;
}

// Tekst przepisu dla Claude (scenarzysta) zależnie od trybu rolki.
export function przepisDlaClaude(A, tryb = "mieszany", proba = false) {
  if (tryb === "zwykly" || !A || A.zWynikami < 3) {
    return `TRYB ALGORYTMU: ${tryb === "zwykly" ? "zwykły (świadomie ogólne, sprawdzone zasady)" : `mieszany, ale masz dopiero ${A?.zWynikami || 0} rolek z wynikami, więc działasz na ogólnych zasadach`}.${proba ? `\nROLKA NA PRÓBĘ: przetestuj coś, czego ${OS.mian} jeszcze nie robiła: ${(A?.proba || []).map((p) => `${p.nazwa}: ${p.wartosc}`).join("; ") || "inny format i inny typ hooka niż zwykle"}. Wpisz do pomysl.json -> "algorytm": {"proba": true, "testuje": [...]}.` : ""}`;
  }
  const f = (c) => `${c.nazwa}: ${c.wartosc} (${c.procent > 0 ? "+" : ""}${c.procent}% vs typowa rolka, ${c.n} rolek, pewność ${c.pewnosc})`;
  const udzial = tryb === "moj" ? 100 : Math.round(A.alfa * 100);
  return `TRYB ALGORYTMU: ${tryb === "moj" ? "mój (przepis z wyników " + OS.dop + ")" : `mieszany (ok. ${udzial}% przepisu z jej wyników, reszta ogólne zasady)`}. Dane: ${A.zWynikami} rolek z wynikami, pewność ${A.pewnoscOgolna}.
DZIAŁA U NIEJ: ${A.mocne.map(f).join("; ") || "jeszcze nic wyraźnego"}
SŁABO U NIEJ: ${A.slabe.map(f).join("; ") || "jeszcze nic wyraźnego"}
Najlepsze rolki: ${A.rolki.slice(0, 3).map((r) => `„${r.tytul}” (${r.procent > 0 ? "+" : ""}${r.procent}%)`).join(", ")}.
Jak używać: ${tryb === "moj" ? "trzymaj się tego, co działa, unikaj tego, co słabe" : "traktuj to jako mocną wskazówkę przy pewności średniej/wysokiej, a jako delikatną przy niskiej"}. Treść i pomysł ${OS.dop} są ważniejsze niż przepis. W czacie powiedz w jednym zdaniu, z czego przepisu korzystasz.${proba ? `\nROLKA NA PRÓBĘ: tym razem celowo testujesz: ${A.proba.map((p) => `${p.nazwa}: ${p.wartosc}`).join("; ")}. Reszta wg przepisu. Wpisz do pomysl.json -> "algorytm": {"tryb": "${tryb}", "proba": true, "testuje": [...]}.` : `\nWpisz do pomysl.json -> "algorytm": {"tryb": "${tryb}", "proba": false}.`}`;
}

// CLI
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const A = policz();
  console.log(`Rolek: ${A.rolek}, opublikowanych: ${A.opublikowanych}, z wynikami: ${A.zWynikami} (pewność: ${A.pewnoscOgolna}, udział Twoich danych w trybie mieszanym: ${Math.round(A.alfa * 100)}%)`);
  for (const r of A.rolki) console.log(`  ${r.procent == null ? "  ?" : (r.procent > 0 ? "+" : "") + r.procent + "%"}  ${r.tytul}`);
  if (A.mocne.length) console.log("Działa:", A.mocne.map((c) => `${c.nazwa}=${c.wartosc} ${c.procent > 0 ? "+" : ""}${c.procent}% (n=${c.n})`).join("; "));
  if (A.slabe.length) console.log("Słabo:", A.slabe.map((c) => `${c.nazwa}=${c.wartosc} ${c.procent}% (n=${c.n})`).join("; "));
  if (A.proba.length) console.log("Do przetestowania:", A.proba.map((p) => `${p.nazwa}: ${p.wartosc}`).join("; "));
  if (A.czekajace.length) console.log("Czekają na wyniki (7+ dni):", A.czekajace.map((r) => r.nazwa).join(", "));
  console.log("Zapisano 05_ARCHIWUM/algorytm.json");
}

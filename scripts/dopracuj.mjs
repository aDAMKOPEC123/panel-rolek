// Pętla „✦ Dopracuj do maksimum” (plan: docs/PLAN_scenariusz_hook.md, etap 4).
//   npm run dopracuj -- <id pomysłu z 01_PROJEKTY/_pomysly | projekt> [--rundy 3] [--cel 90]
// Runda: ocena (twarda + recenzentka) -> maks. 3 poprawki (najpierw hook, potem dynamika) -> autorka (osobna sesja
// Claude) poprawia tylko te miejsca -> ponowna ocena. Wersja zostaje tylko, gdy wynik łączny wzrósł; inaczej wraca
// poprzednia. Stop: wynik >= cel i hook bez niezaliczonych testów, przyrost < 3 pkt albo limit rund.
// Zabezpieczenia: fragmenty "zablokowany": true i hooki "zablokowany" wracają do oryginału, propozycja z obietnicą
// efektu jest odrzucana, każda poprzednia wersja trafia do historia.json (cofanie w panelu), a gdy w trakcie ktoś
// zmienił plik (rozmowa w panelu), pętla przerywa bez nadpisywania.
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { ROOT, blad, ok, info, uwaga, znajdzProjekt, osobaZConfigu } from "./lib.mjs";
import { claudeJson, ZASADY_TRESCI, OBIETNICE } from "./claude-json.mjs";
import { ocenScenariusz, podpisScenariusza, wynikLaczny, PROGI } from "./ocena-scenariusza.mjs";
// imię z ustawień (config.json -> gabinet.osoba) w przypadkach: OS.mian, OS.dop, OS.cel, OS.bier; czytane przy każdym użyciu
const OS = new Proxy({}, { get: (_, k) => osobaZConfigu()[k] });

const args = process.argv.slice(2);
const cel = args.find((a) => !a.startsWith("--") && !/^\d+$/.test(a));
const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 ? Number(args[i + 1]) : d; };
const RUNDY = Math.max(1, Math.min(5, opt("rundy", 3))), CEL = opt("cel", 90);
if (!cel) blad("Podaj id pomysłu albo projekt.", "npm run dopracuj -- 2026-11-16_142420");
const pom = path.join(ROOT, "01_PROJEKTY", "_pomysly", cel, "pomysl.json");
const plik = fs.existsSync(pom) ? pom : path.join(znajdzProjekt(cel), "scenariusz.json");
if (!fs.existsSync(plik)) blad(`Nie ma scenariusza: ${path.relative(ROOT, plik)}`);
const KAT = path.dirname(plik);
const REC = path.join(KAT, "recenzja.json"), HIST = path.join(KAT, "historia.json");
const czytajJ = (p, d = null) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return d; } };
const pisz = (p, o) => fs.writeFileSync(p, JSON.stringify(o, null, 2));
const POLA = ["hooki", "utrzymanie", "scenariusz", "materialy"];
const wersja = (P) => Object.fromEntries(POLA.map((k) => [k, P[k]]));

let P = czytajJ(plik);
if (!(P?.hooki || []).length || !(P?.scenariusz || []).length) blad("Pętla potrzebuje hooków i scenariusza.", "Najpierw dokończ scenariusz w rozmowie.");
const t0 = Date.now();
let koszt = 0;

function recenzja() {
  const r = spawnSync(process.execPath, [path.join(ROOT, "scripts", "recenzent.mjs"), plik.endsWith("pomysl.json") ? cel : cel], { encoding: "utf8", cwd: ROOT, timeout: 8 * 60 * 1000 });
  if (r.status !== 0) throw new Error((r.stdout + r.stderr).slice(-500));
  const rec = czytajJ(REC);
  koszt += rec?.koszt_usd || 0;
  return rec;
}
function ocena(P, rec) {
  const tw = ocenScenariusz(P);
  const aktualna = rec && rec.podpis === podpisScenariusza(P);
  return { twarda: tw, rec: aktualna ? rec : null, laczna: wynikLaczny(tw.wynik, aktualna ? rec.recenzja?.wynik : null) };
}
const hookOk = (o) => o.twarda.testy.filter((t) => t.grupa === "hook" && !t.pominiety).every((t) => t.ok);

// ---------- start: ocena wyjściowa ----------
let rec = czytajJ(REC);
if (!rec || rec.podpis !== podpisScenariusza(P)) { info("Ocena wyjściowa: recenzentka czyta scenariusz ..."); rec = recenzja(); }
let teraz = ocena(P, rec);
info(`Start: twarda ${teraz.twarda.wynik}, recenzentka ${teraz.rec?.recenzja?.wynik ?? "?"}, łącznie ${teraz.laczna}/100 (cel ${CEL}).`);
const historia = czytajJ(HIST, { wersje: [] });
const raport = [];

for (let runda = 1; runda <= RUNDY; runda++) {
  if (teraz.laczna >= CEL && hookOk(teraz)) { ok(`Cel osiągnięty (${teraz.laczna}/100), koniec.`); break; }
  // ---------- maks. 3 poprawki: hook z twardej, recenzentka, reszta twardej ----------
  const kol = ["hook", "dynamika", "czytelnosc", "struktura"];
  const twarde = teraz.twarda.testy.filter((t) => !t.ok && !t.pominiety && t.naprawa).sort((a, b) => kol.indexOf(a.grupa) - kol.indexOf(b.grupa) || (b.waga - b.pkt) - (a.waga - a.pkt));
  const poprawki = [
    ...twarde.filter((t) => t.grupa === "hook").map((t) => `[twarda: ${t.tekst}] ${t.naprawa}`),
    ...(teraz.rec?.poprawki || []).filter((p) => !p.uwaga).map((p) => `[recenzentka] ${p.co} Dlaczego: ${p.dlaczego} Przykład (dopasuj, nie kopiuj na siłę): ${p.przyklad}`),
    ...twarde.filter((t) => t.grupa !== "hook").map((t) => `[twarda: ${t.tekst}] ${t.naprawa}`),
  ].slice(0, 3);
  if (!poprawki.length) { ok("Nie ma już czego poprawiać."); break; }
  info(`Runda ${runda}/${RUNDY}: ${poprawki.length} poprawki`);
  poprawki.forEach((p, i) => console.log(`  ${i + 1}. ${p.slice(0, 160)}`));

  // ---------- autorka ----------
  const prompt = `Jesteś scenarzystką rolek IG/TikTok gabinetu beauty ${OS.dop}. Poprawiasz istniejący scenariusz. Wprowadź DOKŁADNIE te poprawki i nic więcej:
${poprawki.map((p, i) => `${i + 1}. ${p}`).join("\n")}

ZASADY
- Zmieniaj tylko miejsca potrzebne do tych poprawek. Resztę przepisz bez zmian (te same teksty, czasy, materiały).
- Elementy z "zablokowany": true zostawiasz słowo w słowo.
- Gdy zmieniasz to, co ${OS.mian} mówi, popraw "teleprompter" w materiale, który to nagrywa (kwestie słowo w słowo jak "mowisz"). Nowy materiał tylko, gdy bez niego się nie da (id M kolejne, "nazwa_pliku" jak inne).
- Progi oceny: tekst hooka 3-7 słów z jednym *akcentem*, zdanie hooka maks. 10 słów, pierwszy wiersz (hook) do ${PROGI.hookCiecie} s, fragment maks. ${PROGI.zmianaObrazu} s albo z "bodziec", mowa ${PROGI.tempoMowy.join("-")} słowa na sekundę fragmentu (licz!), przy mowie na ekranie maks. ${PROGI.tekstPrzyMowie} słowa, "rola": "rehook" w 35-65% długości, "rola": "nagroda" w ostatnich 30%, jedno CTA na końcu.
- ${ZASADY_TRESCI}
- W "zmiany" wypisz krótko, co zmieniłaś (jedno zdanie na zmianę).

PROFIL (nie zmieniaj): ${JSON.stringify(P.profil)}

OBECNA WERSJA:
${JSON.stringify(wersja(P), null, 1)}`;
  const obj = { type: "object", additionalProperties: true };
  const schemat = { type: "object", properties: { hooki: { type: "array", items: obj, minItems: 1 }, utrzymanie: { type: "array", items: { type: "string" } }, scenariusz: { type: "array", items: obj, minItems: 1 }, materialy: { type: "array", items: obj }, zmiany: { type: "array", items: { type: "string" } } }, required: ["hooki", "utrzymanie", "scenariusz", "materialy", "zmiany"] };
  let nowa;
  try { const o = await claudeJson(prompt, schemat, { timeout: 8 * 60 * 1000 }); nowa = o.dane; koszt += o.koszt; } catch (e) { uwaga(`Autorka nie odpowiedziała: ${e.message}`); break; }

  // ---------- zabezpieczenia ----------
  (P.scenariusz || []).forEach((w) => {
    if (!w.zablokowany) return;
    const k = nowa.scenariusz.findIndex((x) => Number(x.od) === Number(w.od) || x.co_widac === w.co_widac);
    if (k >= 0) nowa.scenariusz[k] = w; else nowa.scenariusz.push(w);
  });
  (P.hooki || []).forEach((h, i) => { if (h.zablokowany) nowa.hooki[i] = h; });
  nowa.scenariusz.sort((a, b) => Number(a.od) - Number(b.od));
  if (!nowa.hooki.some((h) => h.wybrany)) nowa.hooki[0].wybrany = true;
  const tekst = JSON.stringify({ h: nowa.hooki, s: nowa.scenariusz.map((w) => [w.mowisz, w.na_ekranie]), m: nowa.materialy.map((m) => m.teleprompter) });
  if (OBIETNICE.test(tekst)) { uwaga("Nowa wersja zawiera obietnicę efektu, odrzucam rundę."); raport.push({ runda, odrzucona: "obietnica efektu" }); continue; }

  // ---------- zapis kandydata i ocena ----------
  const naDysku = czytajJ(plik);
  if (JSON.stringify(wersja(naDysku)) !== JSON.stringify(wersja(P))) { uwaga("Scenariusz zmienił się w trakcie (rozmowa w panelu). Przerywam bez nadpisywania."); break; }
  const stary = P, staraRec = czytajJ(REC);
  const kandydat = { ...P, ...Object.fromEntries(POLA.map((k) => [k, nowa[k]])) };
  pisz(plik, kandydat);
  let recN;
  try { recN = recenzja(); } catch (e) { pisz(plik, stary); if (staraRec) pisz(REC, staraRec); uwaga(`Recenzja nowej wersji się nie udała, wracam: ${e.message}`); break; }
  const po = ocena(kandydat, recN);
  const przyrost = po.laczna - teraz.laczna;
  info(`Runda ${runda}: łącznie ${teraz.laczna} -> ${po.laczna} (twarda ${teraz.twarda.wynik} -> ${po.twarda.wynik}, recenzentka ${teraz.rec?.recenzja?.wynik ?? "?"} -> ${po.rec?.recenzja?.wynik ?? "?"})`);
  nowa.zmiany.forEach((z) => console.log(`   • ${z}`));
  if (przyrost <= 0) {
    pisz(plik, stary); if (staraRec) pisz(REC, staraRec);
    uwaga("Nowa wersja nie jest lepsza, zostaje poprzednia.");
    raport.push({ runda, odrzucona: "bez poprawy", przed: teraz.laczna, po: po.laczna, zmiany: nowa.zmiany });
    break;
  }
  historia.wersje.push({ data: new Date().toISOString(), zrodlo: `dopracuj, runda ${runda}`, wynik: teraz.laczna, twarda: teraz.twarda.wynik, nastepna: po.laczna, zmiany: nowa.zmiany, poprawki, wersja: wersja(stary) });
  pisz(HIST, historia);
  raport.push({ runda, przed: teraz.laczna, po: po.laczna, zmiany: nowa.zmiany });
  P = kandydat; teraz = po;
  if (przyrost < 3) { ok(`Przyrost tylko ${przyrost} pkt, dalej nie warto.`); break; }
}

ok(`Koniec: łącznie ${teraz.laczna}/100 (twarda ${teraz.twarda.wynik}, recenzentka ${teraz.rec?.recenzja?.wynik ?? "?"}) · ${Math.round((Date.now() - t0) / 1000)} s · ok. ${String(Math.round(koszt * 100) / 100).replace(".", ",")} USD`);
const zostalo = teraz.twarda.testy.filter((t) => !t.ok && !t.pominiety);
if (zostalo.length) info(`Zostało w twardej ocenie: ${zostalo.map((t) => t.tekst).join("; ")}`);
if (raport.some((r) => !r.odrzucona)) info(`Poprzednie wersje: ${path.relative(ROOT, HIST)} (w panelu „Cofnij”).`);

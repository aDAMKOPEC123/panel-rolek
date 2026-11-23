// Automatyczny dobór przejść: analizuje końcówkę każdego ujęcia i początek następnego (scripts/analiza_przejsc.py)
// i wybiera przejście jak montażysta:
//   postać przechodzi / wychodzi z kadru  -> przez_postac (nowe ujęcie wysuwa się zza wycięcia osoby)
//   machnięcie ręką                        -> whip w stronę ręki
//   ruch kamery (panorama)                 -> whip w stronę ruchu
//   najazd kamerą                          -> zoom
//   ręka / obiekt zasłania obiektyw        -> cięcie w zakryciu (samo wygląda jak efekt)
//   duży skok jasności                     -> flash
//   ta sama wypowiedź (mowa -> mowa)       -> cięcie
//   spokojnie, inna scena                  -> ostrosc; spokojnie, ta sama scena -> cięcie
// Potem limity, żeby rolka nie wyglądała na automat: maks. ~40% przejść innych niż cięcie, bez dwóch tych samych
// efektów pod rząd, „przez postać” maks. 2 razy.
//   npm run przejscia -- <projekt>            -> tylko raport (kompozycja/przejscia.json)
//   npm run przejscia -- <projekt> --zapisz   -> wpisuje przejścia do rolka.json (ręcznie wybrane zostają)
//   --wszystkie                               -> nadpisuje też ręcznie wybrane
// Postać i dłonie rozpoznaje YOLO pose (narzedzia/yolo/yolo11n-pose.pt), bez modelu działa sama analiza ruchu.
import fs from "node:fs";
import path from "node:path";
import { ROOT, blad, ok, info, uwaga, znajdzProjekt, wczytajRolke, uruchom, ROZSZ_WIDEO } from "./lib.mjs";

const args = process.argv.slice(2);
const proj = znajdzProjekt(args.find((a) => !a.startsWith("--")));
const zapisz = args.includes("--zapisz");
const wszystkie = args.includes("--wszystkie");
const KOMP = path.join(proj, "kompozycja");
const RJ = path.join(KOMP, "rolka.json");
const rolka = wczytajRolke(proj);
const uj = rolka.ujecia || [];
if (uj.length < 2) blad("Rolka ma mniej niż 2 ujęcia, nie ma czego łączyć.");

const KIER = { lewo: "w lewo", prawo: "w prawo", gora: "w górę", dol: "w dół" };
const pelna = (src) => (path.isAbsolute(src) ? src : path.join(proj, src));
const wideo = (u) => u?.src && ROZSZ_WIDEO.test(u.src) && fs.existsSync(pelna(u.src));
const mowa = (u) => !!(u?.kwestia || u?.dzwiek || (rolka.voiceover?.src && u?.src === rolka.voiceover.src) || /mowa|lektor/i.test(u?.src || ""));
const odU = (u) => Number(u.segmenty?.[0]?.[0] ?? u.od ?? 0);
const doU = (u) => Number(u.segmenty?.at?.(-1)?.[1] ?? u.do ?? NaN);
const wyciecie = (src) => {
  if (!src) return null;
  const n = path.parse(src).name;
  return [n, n.replace(/(_kolor|_hd|_stab)+$/, "")].map((k) => `wyciete/${k}.webm`).find((r) => fs.existsSync(path.join(proj, r))) || null;
};

// --- zadania dla analizatora ---
const zad = [];
for (let i = 0; i < uj.length - 1; i++) {
  const a = uj[i], b = uj[i + 1];
  if (!wideo(a)) continue;
  const doA = isFinite(doU(a)) ? doU(a) : 9999;
  zad.push({
    id: i,
    a: { plik: pelna(a.src), od: Math.max(odU(a), doA - 0.6), do: doA },
    b: wideo(b) ? { plik: pelna(b.src), od: odU(b), do: odU(b) + 0.5 } : {},
  });
}
const wej = path.join(KOMP, ".przejscia_wej.json");
fs.mkdirSync(KOMP, { recursive: true });
fs.writeFileSync(wej, JSON.stringify(zad));
info(`Analiza ${zad.length} cięć (ruch kamery, ręce, postać, jasność) ...`);
const py = process.platform === "win32" ? "python" : "python3";
const r = uruchom(py, [path.join(ROOT, "scripts", "analiza_przejsc.py"), wej], { cicho: true, timeout: 20 * 60 * 1000 });
fs.rmSync(wej, { force: true });
if (r.code !== 0) blad("Analiza się nie udała.", r.stderr.slice(-600) || "Sprawdź: python -c \"import cv2, numpy\"");
const an = JSON.parse(r.stdout.slice(r.stdout.indexOf("{")));
if (!an.yolo) uwaga("Bez modelu YOLO pose: postać i dłonie zgaduję z ruchu (mniej pewnie). Model: narzedzia/yolo/yolo11n-pose.pt.");
const cechy = Object.fromEntries(an.ciecia.map((c) => [c.id, c]));

// --- reguły ---
function wybierz(i) {
  const a = uj[i], b = uj[i + 1], c = cechy[i];
  if (!wideo(a) || !wideo(b)) return { przejscie: "przenikanie", pewnosc: 0.6, powod: "plansza albo zdjęcie: miękkie przenikanie" };
  if (!c || c.blad) return { przejscie: "ciecie", pewnosc: 0.3, powod: `brak analizy${c?.blad ? `: ${c.blad}` : ""}` };
  const A = c.a || {}, B = c.b || {}, rA = A.ruch || {}, pA = A.postac, pB = B.postac;
  if (mowa(a) && mowa(b) && a.src === b.src) return { przejscie: "ciecie", pewnosc: 0.9, powod: "ta sama wypowiedź: zwykłe cięcie, efekt rozpraszałby od słów" };
  if (A.jasnosc_koniec < 0.55 * A.jasnosc_start && A.ostrosc_koniec < 0.35 * Math.max(1, A.ostrosc_start))
    return { przejscie: "ciecie", pewnosc: 0.85, powod: "coś zasłania obiektyw na końcu: cięcie w zakryciu wygląda jak efekt" };
  // postać przechodzi przez kadr albo z niego wychodzi
  // (sprawdzone na nagraniach z gabinetu: w zbliżeniach detektor „gubi” leżącą klientkę co kilka klatek, więc
  //  wyjście liczy się tylko przy stabilnej obecności na początku i zniknięciu przy krawędzi kadru)
  const wyszla = pA && pA.udzial_poczatek >= 0.6 && pA.koniec_brak && pA.ostatnio_przy_krawedzi && pA.pole_srednie < 0.6;
  const przechodzi = pA && pA.udzial_klatek >= 0.6 && pA.obecna_start && Math.abs(pA.v_szer || 0) > 0.6 && pA.pole_srednie < 0.6;
  if (wyszla || przechodzi)
    return { przejscie: "przez_postac", pewnosc: 0.8, powod: wyszla ? `postać wychodzi z kadru ${KIER[pA.ostatnio_przy_krawedzi]}` : "postać przechodzi przez kadr", wyciecie: wyciecie(a.src) };
  // machnięcie ręką: szybki ruch nadgarstka w bok na dużej drodze (praca dłoni przy zabiegu to krótkie, wolne ruchy)
  if (pA && (pA.dlon_vpx || 0) > 1100 && (pA.dlon_zakres || 0) > 400) return { przejscie: "whip", kierunek: pA.dlon_kier, pewnosc: 0.8, powod: `machnięcie ręką ${KIER[pA.dlon_kier]}` };
  if (!an.yolo && rA.lokalny_udzial > 0.02 && rA.lokalny_udzial < 0.35 && rA.lokalny_v > 700 && rA.lokalny_poziomo > 0.6)
    return { przejscie: "whip", kierunek: rA.lokalny_kier, pewnosc: 0.55, powod: `szybki ruch ręki/przedmiotu ${KIER[rA.lokalny_kier]} (z ruchu, bez YOLO)` };
  if (!an.yolo && rA.lokalny_udzial >= 0.35 && rA.lokalny_v > 400 && rA.lokalny_poziomo > 0.7)
    return { przejscie: "przez_postac", pewnosc: 0.45, powod: "duży obiekt przesuwa się w poprzek kadru (może postać, bez YOLO)", wyciecie: wyciecie(a.src) };
  // ruch kamery
  // progi z nagrań z ręki: spokojne trzymanie 0-40 px/s, świadomy ruch kamerą 100-200 px/s (skala 1080)
  if (rA.kamera_v > 100 && rA.kamera_spojnosc > 0.85) {
    // obraz jedzie w lewo = kamera w prawo; whip kontynuuje ruch obrazu
    return { przejscie: "whip", kierunek: rA.kamera_kier, pewnosc: 0.75, powod: `ruch kamery (obraz jedzie ${KIER[rA.kamera_kier]})` };
  }
  if (rA.zoom > 0.1) return { przejscie: "zoom", pewnosc: 0.7, powod: "najazd kamerą na końcu ujęcia" };
  if (isFinite(B.jasnosc_start) && Math.abs(B.jasnosc_start - A.jasnosc_koniec) > 60) return { przejscie: "flash", pewnosc: 0.6, powod: "duży skok jasności między ujęciami" };
  if (c.podobienstwo != null && c.podobienstwo < 0.3) return { przejscie: "ostrosc", pewnosc: 0.5, powod: `inna scena (podobieństwo ${c.podobienstwo}), spokojny ruch: przeostrzenie` };
  return { przejscie: "ciecie", pewnosc: 0.6, powod: c.podobienstwo != null ? `${c.podobienstwo >= 0.6 ? "ta sama scena" : "podobna scena"} (podobieństwo ${c.podobienstwo}): czyste cięcie` : "spokojny ruch: czyste cięcie" };
}

const decyzje = [];
for (let i = 0; i < uj.length - 1; i++) decyzje.push({ i, ...wybierz(i) });

// --- limity: rolka nie może wyglądać na automat ---
const efekt = (d) => !["ciecie"].includes(d.przejscie);
const zdegraduj = (d, why) => { d.przejscie = "ciecie"; d.kierunek = undefined; d.powod += ` (zamienione na cięcie: ${why})`; d.zdegradowane = true; };
for (let k = 1; k < decyzje.length; k++) {
  const p = decyzje[k - 1], d = decyzje[k];
  if (efekt(d) && d.przejscie === p.przejscie && d.przejscie !== "przenikanie") zdegraduj(d.pewnosc >= p.pewnosc ? p : d, "dwa takie same efekty pod rząd");
}
decyzje.filter((d) => d.przejscie === "przez_postac").sort((x, y) => y.pewnosc - x.pewnosc).slice(2).forEach((d) => zdegraduj(d, "maks. 2 razy na rolkę"));
const maks = Math.max(1, Math.round(decyzje.length * 0.4));
decyzje.filter(efekt).sort((x, y) => y.pewnosc - x.pewnosc).slice(maks).forEach((d) => zdegraduj(d, "za dużo efektów w jednej rolce"));

// --- raport i zapis ---
const reczne = (i) => !wszystkie && uj[i].przejscie_recznie;
const ikony = { ciecie: "✂︎", przenikanie: "◐", zoom: "⤢", flash: "✦", whip: "➶", fala: "≈", ostrosc: "◎", przez_postac: "👤" };
for (const d of decyzje) {
  const n = (s) => path.basename(uj[s].src || "plansza");
  const tag = reczne(d.i) ? ` [ręcznie: ${uj[d.i].przejscie_po}, zostaje]` : "";
  const brak = d.przejscie === "przez_postac" && !d.wyciecie ? "  (brak wycięcia: npm run wytnij-tlo, inaczej złoży się jako ostrość)" : "";
  console.log(`  ${d.i + 1}→${d.i + 2}  ${ikony[d.przejscie] || ""} ${d.przejscie}${d.kierunek ? ` ${d.kierunek}` : ""}  ${Math.round(d.pewnosc * 100)}%  ${d.powod}${tag}${brak}   [${n(d.i)} → ${n(d.i + 1)}]`);
}
fs.writeFileSync(path.join(KOMP, "przejscia.json"), JSON.stringify({ data: new Date().toISOString(), yolo: an.yolo, decyzje, cechy: an.ciecia }, null, 2));
ok(`Raport: ${path.relative(ROOT, path.join(KOMP, "przejscia.json"))}`);

if (zapisz) {
  const surowa = JSON.parse(fs.readFileSync(RJ, "utf8"));
  let n = 0;
  for (const d of decyzje) {
    const u = surowa.ujecia[d.i];
    u.przejscie_ai = { przejscie: d.przejscie, kierunek: d.kierunek, pewnosc: d.pewnosc, powod: d.powod };
    if (reczne(d.i)) continue;
    u.przejscie_po = d.przejscie;
    if (d.kierunek && d.przejscie === "whip") u.przejscie_kierunek = d.kierunek; else delete u.przejscie_kierunek;
    if (wszystkie) delete u.przejscie_recznie;
    n++;
  }
  fs.writeFileSync(RJ, JSON.stringify(surowa, null, 2));
  ok(`Wpisano ${n} przejść do rolka.json. Dalej: npm run zloz -- ${path.basename(proj)}`);
} else info("To tylko raport. Żeby wpisać przejścia do rolki: dodaj --zapisz.");

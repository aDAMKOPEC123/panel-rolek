// Rozpoznawanie ujęć bez nazywania plików: prowadząca wrzuca wszystko z telefonu do raw/, a system mówi, co jest czym.
//   npm run rozpoznaj -- <projekt>                       rozpoznanie (Claude, ok. 40 s i 0,15 USD na 9 plików)
//   npm run rozpoznaj -- <projekt> --przypisz [--mapa '{"raw/IMG_1.mov":"M2"}'] [--tylko raw/a.mov,raw/b.jpg]
//   npm run rozpoznaj -- <projekt> --cofnij
// Każdy plik z raw/: pasek 3 klatek + ostrość, jasność, przepalenia, ruch (scripts/rozpoznaj_klatki.py) i głośność
// dźwięku (mowa). Claude ogląda paski (tylko narzędzie Read w katalogu z obrazkami, scripts/claude-json.mjs) i dla
// każdego pliku podaje: typ ujęcia, czynność (np. czesanie brwi, nakładanie farby, frezowanie), opis, czy widać
// twarz klientki, jakość z powodem, materiał ze scenariusza (M1, M2…) z pewnością, klatkę z najlepszym momentem
// efektu, przed/po. Wynik: kompozycja/rozpoznanie.json.
// --przypisz: na podstawie ZAPISANEGO rozpoznania (bez ponownego wywołania Claude) pliki dostają nazwę materiału
// (raw/M3_wideo_mezoterapia.mov), tak jak przy wgrywaniu w panelu. --mapa nadpisuje materiał (wybór prowadzącej w panelu),
// --tylko ogranicza do zaznaczonych; bez --tylko tylko pewność >= 0,7. Test na wymieszanych plikach „mezoterapii”:
// 6/9 trafnie, jedna pomyłka z pewnością 85% (dwa podobne ujęcia zabiegu), dlatego w panelu decyduje prowadząca.
// Pomija pliki z prefiksem M<n>_ i te, których proxy jest użyte w montażu.
// --cofnij: przywraca nazwy sprzed --przypisz (lista zmian w rozpoznanie.json).
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ROOT, blad, ok, info, uwaga, znajdzProjekt, uruchom, glosnosc, osobaZConfigu } from "./lib.mjs";
import { claudeJson } from "./claude-json.mjs";
// imię z ustawień (config.json -> gabinet.osoba) w przypadkach: OS.mian, OS.dop, OS.cel, OS.bier; czytane przy każdym użyciu
const OS = new Proxy({}, { get: (_, k) => osobaZConfigu()[k] });

const args = process.argv.slice(2);
const proj = znajdzProjekt(args.find((a) => !a.startsWith("--")));
const PLIK = path.join(proj, "kompozycja", "rozpoznanie.json");
const czytajJ = (p, d = null) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return d; } };
const pl = (x) => String(x).replace(".", ",");

if (args.includes("--cofnij")) {
  const r = czytajJ(PLIK);
  const z = r?.zmiany || [];
  if (!z.length) blad("Nie ma czego cofać.", "Brak zmian nazw w kompozycja/rozpoznanie.json.");
  let n = 0;
  for (const { z: stara, na } of [...z].reverse()) {
    const a = path.join(proj, na), b = path.join(proj, stara);
    if (fs.existsSync(a) && !fs.existsSync(b)) { fs.renameSync(a, b); n++; }
    for (const w of r.pliki || []) if (w.plik === na) { w.plik = stara; delete w.przypisany; }
  }
  r.zmiany = [];
  fs.writeFileSync(PLIK, JSON.stringify(r, null, 2));
  ok(`Przywrócono ${n} nazw.`);
  process.exit(0);
}

const MEDIA = /\.(mp4|mov|m4v|webm|jpe?g|png|webp)$/i, WIDEO = /\.(mp4|mov|m4v|webm)$/i;
const raw = path.join(proj, "raw");
const sc0 = czytajJ(path.join(proj, "scenariusz.json"));
if (args.includes("--przypisz")) {
  const zapis = czytajJ(PLIK);
  if (!zapis?.pliki?.length) blad("Najpierw rozpoznaj nagrania.", "npm run rozpoznaj -- <projekt>");
  const opt = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };
  let mapa = {};
  try { mapa = JSON.parse(opt("--mapa") || "{}"); } catch { blad("--mapa to nie JSON."); }
  const tylko = opt("--tylko") ? new Set(opt("--tylko").split(",").map((x) => x.trim())) : null;
  const rolka = fs.existsSync(path.join(proj, "kompozycja", "rolka.json")) ? fs.readFileSync(path.join(proj, "kompozycja", "rolka.json"), "utf8") : "";
  const slug = (x) => String(x).normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/ł/g, "l").replace(/Ł/g, "L").replace(/[^\w-]+/g, "_").replace(/^_+|_+$/g, "");
  zapis.zmiany ||= [];
  let n = 0;
  for (const w of zapis.pliki) {
    if (mapa[w.plik] !== undefined) { w.material = mapa[w.plik]; w.pewnosc = 1; w.recznie = true; }
    const nazwa = path.basename(w.plik), base = nazwa.replace(/\.[^.]+$/, ""), ext = path.extname(nazwa).toLowerCase();
    if (tylko ? !tylko.has(w.plik) : (w.pewnosc ?? 0) < 0.7) continue;
    if (!w.material || /^M\d+_/i.test(nazwa) || !fs.existsSync(path.join(proj, w.plik))) continue;
    if (rolka.includes(`proxy/${base}.`) || rolka.includes(`raw/${nazwa}`)) { w.pominiety = "użyty w montażu"; uwaga(`${nazwa}: użyty w montażu, zostaje bez zmiany nazwy.`); continue; }
    const m = (sc0?.materialy || []).find((x) => x.id === w.material);
    let cel = slug(m?.nazwa_pliku || `${w.material}_${w.typ}`);
    if (!cel.startsWith(w.material)) cel = `${w.material}_${cel}`;
    let nowa = `${cel}${ext}`, k = 2;
    while (fs.existsSync(path.join(raw, nowa))) nowa = `${cel}_${k++}${ext}`;
    fs.renameSync(path.join(raw, nazwa), path.join(raw, nowa));
    zapis.zmiany.push({ z: `raw/${nazwa}`, na: `raw/${nowa}` });
    ok(`${nazwa} → ${nowa}`);
    w.plik = `raw/${nowa}`; w.przypisany = true; n++;
  }
  fs.writeFileSync(PLIK, JSON.stringify(zapis, null, 2));
  ok(`Przypisano ${n} plików (cofnięcie: npm run rozpoznaj -- <projekt> --cofnij).`);
  process.exit(0);
}
const pliki = fs.existsSync(raw) ? fs.readdirSync(raw).filter((n) => MEDIA.test(n)).sort() : [];
if (!pliki.length) blad("W raw/ nie ma nagrań ani zdjęć.", "Wrzuć pliki z telefonu do folderu raw/ rolki (albo wgraj je w panelu).");
if (pliki.length > 40) uwaga(`W raw/ jest ${pliki.length} plików, biorę pierwsze 40.`);
const lista = pliki.slice(0, 40);
const materialy = (sc0?.materialy || []).map((m) => ({ id: m.id, typ: m.typ, opis: m.opis, nazwa_pliku: m.nazwa_pliku, obowiazkowy: m.obowiazkowy !== false }));

// --- klatki i miary ---
const kat = fs.mkdtempSync(path.join(os.tmpdir(), "rozpoznaj_"));
info(`Rozpoznaję ${lista.length} plików ...`);
const py = process.platform === "win32" ? "python" : "python3";
const r = uruchom(py, [path.join(ROOT, "scripts", "rozpoznaj_klatki.py"), kat, ...lista.map((n) => path.join(raw, n))], { cicho: true, timeout: 10 * 60 * 1000 });
if (r.code !== 0) blad("Nie udało się wyciągnąć klatek.", (r.stderr || "").slice(-400));
const miary = JSON.parse(r.stdout.trim().split("\n").pop());
for (const m of miary) if (WIDEO.test(m.plik) && !m.blad) m.lufs = glosnosc(m.plik).lufs;

const opisPliku = (m) => {
  const n = path.basename(m.plik);
  if (m.blad) return `${m.obraz}: ${n} (${m.blad})`;
  const w = WIDEO.test(m.plik);
  return `${m.obraz}: ${n}, ${w ? `wideo ${pl(m.dlugosc)} s, klatki z ${m.klatki.map(pl).join(" / ")} s, dźwięk ${m.lufs != null ? `${Math.round(m.lufs)} LUFS${m.lufs > -32 ? " (głośny, możliwa mowa)" : " (cichy)"}` : "brak"}` : "zdjęcie"}, ${m.pion ? "pion" : "POZIOM"}, ostrość ${m.ostrosc}/100, jasność ${m.jasnosc}/255, przepalenia ${m.przepalenia}%${m.ruch != null ? `, ruch ${m.ruch}` : ""}`;
};
const prompt = `Rozpoznajesz nagrania z telefonu do rolki gabinetu beauty ${OS.dop} (kosmetologia: brwi, rzęsy, twarz; podologia: stopy, paznokcie).
W bieżącym katalogu są obrazki NN.jpg: każdy to pasek 3 klatek jednego nagrania (początek, środek, koniec; sekunda w rogu) albo jedno zdjęcie. Przeczytaj KAŻDY obrazek narzędziem Read i dopiero potem odpowiedz.

PLIKI (obrazek: nazwa, dane techniczne)
${miary.map(opisPliku).join("\n")}

${materialy.length ? `MATERIAŁY ZE SCENARIUSZA (do czego mają pasować nagrania)
${materialy.map((m) => `${m.id} (${m.typ}${m.obowiazkowy ? "" : ", dodatkowy"}): ${m.opis}`).join("\n")}
Każdy plik przypisz do najlepiej pasującego materiału (pole material = id, np. "M3") albo zostaw "" gdy nic nie pasuje. Kilka plików może pasować do jednego materiału (kilka podejść). W "brakujace" wpisz id materiałów obowiązkowych bez żadnego pliku.` : "Ta rolka nie ma scenariusza: pole material zostaw puste, brakujace = []."}

DLA KAŻDEGO PLIKU
- typ: mowa (osoba mówi do kamery), szeroki (plan ogólny gabinetu / zabiegu), zblizenie (twarz, dłonie, stopa), detal (makro: brew, rzęsa, paznokieć, produkt), zdjecie, ekran (nagranie ekranu), inne
- czynnosc: co się dzieje, krótko po polsku (np. „czesanie brwi szczoteczką”, „nakładanie maski”, „frezowanie paznokcia”, „mówi do kamery”)
- opis: jedno zdanie, co widać
- twarz_klientki: czy widać twarz klientki (nie ${OS.dop}) tak, że da się ją rozpoznać
- jakosc: dobra | srednia | slaba, uwaga_jakosci: konkret (nieostre, ciemne, przepalone, drży, poziomo) albo ""
- pewnosc: 0-1, jak pewne jest przypisanie do materiału (0 gdy material = "")
- efekt_klatka: indeks klatki (0, 1, 2) z najlepszym momentem efektu do zajawki albo okładki, -1 gdy brak efektu
- przed_po: przed | po | brak (zdjęcie albo ujęcie stanu przed/po zabiegu)
Opisuj to, co widać. Bez ocen urody i bez diagnoz.`;

const obj = (p, req) => ({ type: "object", properties: p, required: req || Object.keys(p) });
const schemat = obj({
  pliki: { type: "array", items: obj({
    obraz: { type: "string" }, typ: { type: "string", enum: ["mowa", "szeroki", "zblizenie", "detal", "zdjecie", "ekran", "inne"] },
    czynnosc: { type: "string" }, opis: { type: "string" }, twarz_klientki: { type: "boolean" },
    jakosc: { type: "string", enum: ["dobra", "srednia", "slaba"] }, uwaga_jakosci: { type: "string" },
    material: { type: "string" }, pewnosc: { type: "number" }, efekt_klatka: { type: "integer" },
    przed_po: { type: "string", enum: ["przed", "po", "brak"] },
  }) },
  brakujace: { type: "array", items: { type: "string" } },
  podsumowanie: { type: "string" },
});
let odp;
try { odp = await claudeJson(prompt, schemat, { obrazy: kat, timeout: 10 * 60 * 1000 }); }
catch (e) { blad("Rozpoznanie się nie udało.", e.message); }
finally { fs.rmSync(kat, { recursive: true, force: true }); }

const wyniki = miary.map((m) => {
  const o = odp.dane.pliki.find((x) => x.obraz === m.obraz) || {};
  const rel = path.relative(proj, m.plik).split(path.sep).join("/");
  return { plik: rel, ...o, obraz: undefined, dlugosc: m.dlugosc, klatki: m.klatki, ostrosc: m.ostrosc, jasnosc: m.jasnosc, przepalenia: m.przepalenia, ruch: m.ruch, lufs: m.lufs,
    efekt_t: o.efekt_klatka >= 0 && m.klatki ? m.klatki[o.efekt_klatka] ?? null : null };
});
const poprz = czytajJ(PLIK, {});
const zapis = { data: new Date().toISOString(), pliki: wyniki, brakujace: odp.dane.brakujace, podsumowanie: odp.dane.podsumowanie, koszt_usd: odp.koszt, czas_s: odp.czas_s, zmiany: poprz.zmiany || [] };
if (!materialy.length) for (const w of wyniki) { w.material = ""; w.pewnosc = 0; }

fs.writeFileSync(PLIK, JSON.stringify(zapis, null, 2));

// --- raport ---
for (const w of wyniki) {
  const q = w.jakosc === "slaba" ? " ⚠ słaba" : w.jakosc === "srednia" ? " · średnia" : "";
  console.log(`${w.material ? `${w.material.padEnd(4)}` : "  ? "} ${path.basename(w.plik)}: ${w.typ}, ${w.czynnosc}${w.material ? ` (pewność ${Math.round((w.pewnosc || 0) * 100)}%)` : ""}${q}${w.uwaga_jakosci ? ` (${w.uwaga_jakosci})` : ""}${w.twarz_klientki ? " · twarz klientki" : ""}${w.przed_po !== "brak" && w.przed_po ? ` · ${w.przed_po}` : ""}`);
}
if (zapis.brakujace?.length) uwaga(`Brakuje materiałów: ${zapis.brakujace.join(", ")}`);
if (wyniki.some((w) => w.twarz_klientki)) uwaga("Widać twarz klientki: potrzebna zgoda na wizerunek (brief.md: zgoda na wizerunek: tak).");
info(zapis.podsumowanie);
ok(`kompozycja/rozpoznanie.json · ${odp.czas_s} s · ok. ${pl(Math.round(odp.koszt * 100) / 100)} USD`);

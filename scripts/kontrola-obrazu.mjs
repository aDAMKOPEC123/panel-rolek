// Kontrola obrazu po renderze: bot ogląda rolkę co 0,25 s i wyłapuje to, co psuje odbiór, zanim trafi na Instagram.
//   npm run kontrola-obrazu -- <projekt> [--znaczniki]
// Jak: dwa szybkie rendery w 4 fps (draft): pełny i czysty (index.qa.html bez napisów, scen i ozdób; znak wodny
// zostaje). Różnica = dokładna mapa nakładek. scripts/kontrola_obrazu.py liczy na klatkę: nakładka na twarzy
// (rdzeń: oczy, brwi, nos, usta), nakładka w strefach UI Instagrama, czarna / ciemna / przepalona klatka, skok
// jasności bez cięcia. Do tego hyperframes check (kontrast WCAG tekstu, tekst poza kadrem, błędy w przeglądarce).
// Wynik: kompozycja/kontrola-obrazu.json + miniatury kompozycja/kontrola/*.jpg (problem zaznaczony na czerwono).
// --znaczniki: każdy problem jako znacznik w rolka.json (autor "kontrola") do „✦ Claude: popraw znaczniki”.
// Ok. 1-2 min, darmowe (lokalnie).
import fs from "node:fs";
import path from "node:path";
import { ROOT, blad, ok, info, uwaga, znajdzProjekt, uruchom, hf, wczytajConfig, katalogProbyMontazu, znacznikiKontroli } from "./lib.mjs";

const args = process.argv.slice(2);
const proj = znajdzProjekt(args.find((a) => !a.startsWith("--")));
const proba = katalogProbyMontazu(proj, args);
const komp = proba || path.join(proj, "kompozycja"), RJ = path.join(komp, "rolka.json"), IDX = path.join(komp, "index.html");
const kat = path.join(komp, "kontrola");
const pl = (x) => String(Math.round(x * 10) / 10).replace(".", ",");
const cfg = wczytajConfig();

if (!fs.existsSync(IDX) || (fs.existsSync(RJ) && fs.statSync(RJ).mtimeMs > fs.statSync(IDX).mtimeMs)) {
  info("Składam rolkę (rolka.json jest nowsza niż kompozycja) ...");
  const z = uruchom(process.execPath, [path.join(ROOT, "scripts", "zloz.mjs"), proj, ...(proba ? [`--audyt=${path.basename(proba)}`] : [])], { cicho: true, timeout: 20 * 60 * 1000 });
  if (z.code !== 0) blad("Złożenie rolki się nie udało.", (z.stdout + z.stderr).slice(-400));
}
fs.rmSync(kat, { recursive: true, force: true });
fs.mkdirSync(kat, { recursive: true });

// --- czysta wersja: bez hostów scen i napisów (oprócz znaku wodnego) i bez ozdób z warstw ujęć ---
const html = fs.readFileSync(IDX, "utf8");
const QA = path.join(komp, "index.qa.html");
const czysty = html.split("\n").filter((l) => !(/data-composition-src=/.test(l) && !/id="watermark/.test(l))).join("\n")
  .replace("</head>", "<style>.sl,.tw,.ob-c,.ob-t,.ob-w,#pasek-postepu{display:none!important}</style>\n</head>");
fs.writeFileSync(QA, czysty);
// momenty, w których zmiana jasności jest normalna: starty i końce wszystkich klipów (cięcia, sceny, przejścia)
const ciecia = new Set();
for (const m of html.matchAll(/data-start="([\d.]+)"(?:[^>]*?data-duration="([\d.]+)")?/g)) { ciecia.add(Number(m[1])); if (m[2]) ciecia.add(Number(m[1]) + Number(m[2])); }

const pelnyMp4 = path.join(kat, "pelny.mp4"), czystyMp4 = path.join(kat, "czysty.mp4");
try {
  for (const [wej, wyj, opis] of [["index.html", pelnyMp4, "pełny"], ["index.qa.html", czystyMp4, "bez nakładek"]]) {
    info(`Render próbny (${opis}, 4 klatki/s) ...`);
    const r = hf(["render", "-c", wej, "--fps", "4", "--quality", "draft", "-o", wyj], { cwd: komp, cicho: true, timeout: 30 * 60 * 1000 });
    if (r.code !== 0 || !fs.existsSync(wyj)) blad(`Render próbny (${opis}) się nie udał.`, (r.stderr || r.stdout || "").slice(-500));
  }
} finally { fs.rmSync(QA, { force: true }); }

// --- klatki ---
const ust = path.join(kat, "ustawienia.json");
const sz = cfg.safe_zone || {};
fs.writeFileSync(ust, JSON.stringify({ fps: 4, ciecia: [...ciecia].sort((a, b) => a - b), safe: { gora: sz.gora ?? 220, dol: sz.dol ?? 420, prawo: sz.prawo ?? 140 } }));
info("Oglądam klatki (twarze, strefy Instagrama, jasność) ...");
const py = process.platform === "win32" ? "python" : "python3";
const r = uruchom(py, [path.join(ROOT, "scripts", "kontrola_obrazu.py"), pelnyMp4, czystyMp4, ust, kat], { cicho: true, timeout: 20 * 60 * 1000 });
if (r.code !== 0) blad("Analiza klatek się nie udała.", (r.stderr || "").slice(-500));
const wynik = JSON.parse(r.stdout.trim().split("\n").pop());
for (const f of [czystyMp4, ust, ...(proba ? [] : [pelnyMp4])]) fs.rmSync(f, { force: true });

// --- hyperframes check: kontrast tekstu, tekst poza kadrem, błędy w przeglądarce ---
info("Kontrast i układ tekstu (hyperframes check) ...");
const c = hf(["check", "--json", "--no-craft", "--samples", "12"], { cwd: komp, cicho: true, timeout: 15 * 60 * 1000 });
let check = null;
try { check = JSON.parse(c.stdout.slice(c.stdout.indexOf("{"))); } catch {}
const dzialy = ["lint", "runtime", "layout", "contrast", "audio"];
const sprawdzonoUklad = !check?.browserSkipped && Array.isArray(check?.layout?.samples) && check.layout.samples.length > 0
  && dzialy.every((d) => Array.isArray(check[d]?.findings));
if (!sprawdzonoUklad) uwaga("HyperFrames nie ukończył sprawdzania układu i kontrastu.");
const NAZWY = { lint: "blad", contrast: "kontrast", layout: "uklad", runtime: "blad", audio: "dzwiek" };
for (const [k, typ] of Object.entries(NAZWY)) {
  for (const f of check?.[k]?.findings || []) {
    if (f.severity && !/error|warn/i.test(f.severity)) continue;
    // styl napisów „Perła”: słowa jeszcze niewypowiedziane są celowo przygaszone (#b9a69c), to nie błąd
    if (typ === "kontrast" && /napisy/.test(f.sourceFile || "") && /185,\s*166,\s*156/.test(f.fg || "")) continue;
    const t = Number(f.time ?? f.at ?? f.t ?? f.sampleTime ?? f.times?.[0] ?? 0) || 0;
    const scena = f.sourceFile ? path.basename(f.sourceFile, ".html") : "";
    let opis;
    if (typ === "kontrast" && f.ratio) opis = `Słaby kontrast tekstu „${String(f.text || "").slice(0, 40)}”${scena ? ` (${scena})` : ""}: ${pl(f.ratio)}:1, potrzeba min. ${f.requiredRatio || 3}:1${f.suggestedColor ? `, np. kolor ${f.suggestedColor}` : ""}`;
    else opis = `${{ kontrast: "Słaby kontrast tekstu", uklad: "Tekst poza miejscem", blad: "Błąd w kompozycji", dzwiek: "Dźwięk" }[typ]}${scena ? ` (${scena})` : ""}: ${String(f.message || f.summary || f.code || "").replace(/\s+/g, " ").slice(0, 200)}`;
    const problem = { typ, od: t, do: t + 0.5, opis, ile: 1, kod: f.code || null, ...(f.bbox ? { ramka: f.bbox } : {}) };
    if (!wynik.problemy.some((p) => p.typ === typ && p.od === t && p.opis === opis)) wynik.problemy.push(problem);
  }
}

// --- zapis, znaczniki ---
const WAGA = { usta: "wazne", twarz: "krytyczne", czarna: "krytyczne", blad: "krytyczne", strefa_ig: "wazne", kontrast: "wazne", uklad: "wazne", przepalenie: "wazne", ciemno: "kosmetyka", skok: "kosmetyka" };
const PROPOZYCJA = {
  twarz: "Przesuń napis albo scenę wyżej lub niżej, żeby nie zasłaniała oczu i ust (napisy: napisy.od_dolu, sceny: pozycja / y).",
  usta: "Przesuń napisy niżej albo wyżej (napisy.od_dolu), żeby nie zasłaniały ust mówiącej osoby; przy zbliżeniu twarzy można też odsunąć kadr.",
  strefa_ig: "Przesuń element do środka kadru: 220 px od góry, 420 px od dołu i 140 px od prawej to strefy przycisków i opisu Instagrama.",
  czarna: "Sprawdź przejście albo koniec ujęcia: na ekranie jest czarna klatka.",
  ciemno: "Rozjaśnij ujęcie (npm run kolor) albo wybierz jaśniejsze podejście.",
  przepalenie: "Wybierz inne podejście albo przytnij fragment z przepaleniem (okno, lampa).",
  skok: "Sprawdź, czy błysk jest zamierzony (flash, światło); jeśli nie, przesuń cięcie albo wyrównaj kolor ujęć.",
  kontrast: "Daj tekstowi tło (pigułka) albo cień, albo zmień kolor na jaśniejszy / ciemniejszy.",
  uklad: "Skróć tekst albo zmniejsz czcionkę, żeby mieścił się w kadrze.",
  blad: "Popraw błąd w scenie (szczegóły w opisie).",
};
for (const p of wynik.problemy) { p.waga = WAGA[p.typ] || "wazne"; p.propozycja = PROPOZYCJA[p.typ] || ""; }
wynik.problemy.sort((a, b) => a.od - b.od);
const ocena = Math.max(0, 100 - wynik.problemy.reduce((s, p) => s + ({ krytyczne: 20, wazne: 8, kosmetyka: 3 }[p.waga] || 5), 0));
const zakres = { twarze: wynik.twarze === true, hyperframes: sprawdzonoUklad };
const zapis = { data: new Date().toISOString(), klatek: wynik.klatek, ocena, zakres, problemy: wynik.problemy };
fs.writeFileSync(path.join(komp, "kontrola-obrazu.json"), JSON.stringify(zapis, null, 2));

if (args.includes("--znaczniki")) {
  const rolka = JSON.parse(fs.readFileSync(RJ, "utf8"));
  const stare = rolka.znaczniki || [];
  rolka.znaczniki = znacznikiKontroli(stare, wynik.problemy);
  if (wynik.problemy.length || rolka.znaczniki.length !== stare.length) fs.writeFileSync(RJ, JSON.stringify(rolka, null, 2));
}
for (const p of wynik.problemy) console.log(`${{ krytyczne: "✗", wazne: "!", kosmetyka: "·" }[p.waga]} ${pl(p.od)}-${pl(p.do)} s: ${p.opis}`);
if (!wynik.problemy.length && zakres.twarze && zakres.hyperframes) ok(`Obraz bez zastrzeżeń (${wynik.klatek} klatek).`);
ok(`Kontrola obrazu: ${ocena}/100 · ${wynik.problemy.length} problemów · kompozycja/kontrola-obrazu.json`);

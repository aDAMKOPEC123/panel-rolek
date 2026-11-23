// Kontrola nagranego hooka (plan: docs/PLAN_scenariusz_hook.md, etap 6).
//   npm run kontrola-hooka -- <projekt> [--napraw]
// Na złożonej rolce (kompozycja/.zloz.json z `zloz`) sprawdza:
//   1. opóźnienie pierwszego słowa (maks. 0,15 s; --napraw przycina ciszę na początku pierwszego ujęcia z mową),
//   2. czy powiedziany hook zgadza się z hookiem ze scenariusza (scenariusz.json),
//   3. ruch w pierwszej klatce (przepływ optyczny z scripts/analiza_przejsc.py),
//   4. jasność i ostrość klatki 0,
//   5. energię głosu w hooku względem reszty nagrania (głośność źródła),
//   6. tempo mowy w hooku.
// Wynik: kompozycja/hook.json (panel: krok Render i wynik retencji).
import fs from "node:fs";
import path from "node:path";
import { ROOT, blad, ok, info, uwaga, znajdzProjekt, uruchom, ROZSZ_WIDEO, ROZSZ_OBRAZ } from "./lib.mjs";

const args = process.argv.slice(2);
const proj = znajdzProjekt(args.find((a) => !a.startsWith("--")));
const napraw = args.includes("--napraw");
const KOMP = path.join(proj, "kompozycja");
const czytajJ = (p, d = null) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return d; } };
const RJ = path.join(KOMP, "rolka.json");
if (!fs.existsSync(path.join(KOMP, ".zloz.json")) || fs.statSync(RJ).mtimeMs > fs.statSync(path.join(KOMP, ".zloz.json")).mtimeMs) {
  info("Składam rolkę (kontrola potrzebuje aktualnej kompozycji) ...");
  const r = uruchom("node", [path.join(ROOT, "scripts", "zloz.mjs"), proj], { cicho: true });
  if (r.code !== 0) blad("Nie udało się złożyć rolki.", (r.stdout + r.stderr).slice(-400));
}
let Z = czytajJ(path.join(KOMP, ".zloz.json"));
if (Z && !Z.slowa) {
  info("Składam rolkę ponownie (stara kompozycja bez danych o słowach) ...");
  const r = uruchom("node", [path.join(ROOT, "scripts", "zloz.mjs"), proj], { cicho: true });
  if (r.code !== 0) blad("Nie udało się złożyć rolki.", (r.stdout + r.stderr).slice(-400));
  Z = czytajJ(path.join(KOMP, ".zloz.json"));
}
if (!Z?.slowa) blad("Brak danych o słowach w .zloz.json.", "Złóż rolkę ponownie: npm run zloz -- " + path.basename(proj));
const rolka = czytajJ(RJ);
const sc = czytajJ(path.join(proj, "scenariusz.json"));
const pelna = (s) => (path.isAbsolute(s) ? s : path.join(proj, s));
const r1 = (x) => Math.round(x * 100) / 100, pl = (x) => String(Math.round(x * 100) / 100).replace(".", ",");
const testy = [];
const dodaj = (t) => testy.push(t);

const slowa = Z.slowa.map(([text, start, end]) => ({ text, start, end }));
const pierwsze = slowa[0];

// ---------- 1. opóźnienie pierwszego słowa ----------
let naprawa = null;
if (!pierwsze) dodaj({ id: "pierwsze_slowo", nazwa: "Pierwsze słowo od razu", poziom: "pominiety", tekst: "W rolce nie ma słów (rolka bez mowy albo bez transkrypcji)." });
else {
  const t = pierwsze.start;
  const poziom = t <= 0.18 ? "ok" : t <= 0.4 ? "uwaga" : "blad";
  const u0 = rolka.ujecia?.[0], P0 = Z.pierwszeUjecie;
  // Naprawa = przycięcie początku CAŁEJ rolki o tyle samo (pierwsze ujęcie, lektor, starty scen), żeby mowa i obraz
  // dalej szły razem. Da się, gdy pierwsze ujęcie jest wideo dłuższe niż przycięcie + 0,5 s.
  const o = r1(t - 0.08);
  if (poziom !== "ok" && P0 && P0.typ === "wideo" && u0 && P0.dur > o + 0.5) naprawa = { typ: "przytnij", o, zrodlo: r1(o * (P0.tempo || 1)) };
  dodaj({ id: "pierwsze_slowo", nazwa: "Pierwsze słowo w 0,15 s", poziom, wartosc: t,
    tekst: poziom === "ok" ? `Pierwsze słowo („${pierwsze.text}”) w ${pl(t)} s.` : `Pierwsze słowo („${pierwsze.text}”) dopiero w ${pl(t)} s: ${pl(t)} s ciszy na start to sygnał do przewinięcia.`,
    naprawa: naprawa ? `Przytnij ${pl(naprawa.o)} s z początku rolki (pierwsze ujęcie${rolka.voiceover?.src ? ", lektor" : ""} i sceny razem, synchronizacja zostaje)` : poziom !== "ok" ? "Pierwsze ujęcie jest za krótkie na automatyczne przycięcie: zacznij rolkę od innego ujęcia albo przytnij ciszę w nagraniu." : null });
}

// ---------- 2. hook ze scenariusza vs powiedziany ----------
const norm = (s) => String(s || "").toLowerCase().replace(/[*„”"!?.,:;()–-]/g, " ").split(/\s+/).filter(Boolean).map((w) => w.slice(0, 5));
const hookSc = (sc?.hooki || []).find((h) => h.wybrany) || sc?.hooki?.[0];
if (hookSc?.mowisz && slowa.length) {
  const cel = norm(hookSc.mowisz);
  const powiedziane = norm(slowa.slice(0, cel.length + 4).map((w) => w.text).join(" "));
  const trafione = cel.filter((w) => powiedziane.includes(w)).length / cel.length;
  const poziom = trafione >= 0.7 ? "ok" : trafione >= 0.4 ? "uwaga" : "blad";
  dodaj({ id: "hook_jak_w_scenariuszu", nazwa: "Hook powiedziany jak w scenariuszu", poziom, wartosc: r1(trafione),
    tekst: poziom === "ok" ? `Hook powiedziany zgodnie ze scenariuszem (${Math.round(trafione * 100)}% słów).` : `Powiedziane: „${slowa.slice(0, cel.length + 2).map((w) => w.text).join(" ")}”, a w scenariuszu: „${hookSc.mowisz}” (zgodność ${Math.round(trafione * 100)}%).`,
    naprawa: poziom === "ok" ? null : "Sprawdź, czy pierwsze ujęcie to właściwe podejście z hookiem (krok Nagrania > kwestie), albo nagraj hook jeszcze raz z teleprompterem." });
  if (Z.hookScena?.tekst && hookSc.tekst) {
    const a = norm(hookSc.tekst), b = norm(Z.hookScena.tekst.replace(/\|/g, " "));
    const zg = a.filter((w) => b.includes(w)).length / Math.max(1, a.length);
    if (zg < 0.6) dodaj({ id: "tekst_hooka", nazwa: "Tekst hooka na ekranie jak w scenariuszu", poziom: "uwaga", wartosc: r1(zg), tekst: `Na ekranie: „${Z.hookScena.tekst.replace(/\|/g, " ")}”, w scenariuszu: „${String(hookSc.tekst).replace(/\*/g, "")}”. Jeśli zmiana była świadoma, zignoruj.` });
  }
} else dodaj({ id: "hook_jak_w_scenariuszu", nazwa: "Hook powiedziany jak w scenariuszu", poziom: "pominiety", tekst: sc ? "Scenariusz nie ma zdania hooka." : "Rolka bez scenariusza.json." });

// ---------- 3-4. pierwsza klatka: ruch, jasność, ostrość ----------
const K = Z.pierwszyKadr;
if (K?.src && fs.existsSync(pelna(K.src))) {
  const opis = K.zajawka ? "zajawka (pierwsze 0,8 s)" : "pierwsze ujęcie";
  if (ROZSZ_OBRAZ.test(K.src)) {
    dodaj({ id: "ruch_klatka0", nazwa: "Ruch w pierwszej klatce", poziom: "uwaga", tekst: `Na start jest zdjęcie (${opis}: ${path.basename(K.src)}). Rolka ruszy tylko delikatnym najazdem: wideo z ruchem zatrzymuje kciuk lepiej.` });
  } else {
    const wej = path.join(KOMP, ".hook_wej.json");
    fs.writeFileSync(wej, JSON.stringify([{ id: 0, a: { plik: pelna(K.src), od: Number(K.od || 0), do: Number(K.od || 0) + 0.6 }, b: {} }]));
    const r = uruchom(process.platform === "win32" ? "python" : "python3", [path.join(ROOT, "scripts", "analiza_przejsc.py"), wej], { cicho: true, timeout: 5 * 60 * 1000 });
    fs.rmSync(wej, { force: true });
    let A = null;
    try { A = JSON.parse(r.stdout.slice(r.stdout.indexOf("{"))).ciecia[0].a; } catch {}
    if (!A?.ruch) dodaj({ id: "ruch_klatka0", nazwa: "Ruch w pierwszej klatce", poziom: "pominiety", tekst: "Nie udało się przeanalizować pierwszego ujęcia." });
    else {
      const m = A.ruch, ruchu = Math.max(m.kamera_v, m.lokalny_udzial >= 0.02 ? m.lokalny_v : 0);
      const poziom = ruchu >= 60 ? "ok" : ruchu >= 25 ? "uwaga" : "blad";
      dodaj({ id: "ruch_klatka0", nazwa: "Ruch w pierwszej klatce", poziom, wartosc: Math.round(ruchu),
        tekst: poziom === "ok" ? `W pierwszych 0,6 s jest ruch (${opis}).` : `${opis[0].toUpperCase() + opis.slice(1)} prawie stoi w miejscu (ruch ${Math.round(ruchu)} px/s): kadr bez ruchu w 1. sekundzie słabiej zatrzymuje kciuk.`,
        naprawa: poziom === "ok" ? null : "Zacznij od momentu z ruchem (ręka, narzędzie, zbliżenie) albo dodaj najazd (zoom_na) na start." });
      const jas = A.jasnosc_start, ostr = A.ostrosc_start;
      const pozJ = jas < 55 ? "blad" : jas < 80 ? "uwaga" : jas > 225 ? "uwaga" : "ok";
      dodaj({ id: "jasnosc_klatka0", nazwa: "Jasna pierwsza klatka", poziom: pozJ, wartosc: jas,
        tekst: pozJ === "ok" ? `Pierwsza klatka dobrze naświetlona (${Math.round(jas)}/255).` : jas > 225 ? `Pierwsza klatka prawie biała (${Math.round(jas)}/255).` : `Pierwsza klatka ciemna (${Math.round(jas)}/255): w feedzie wygląda na „nic”.`,
        naprawa: pozJ === "ok" ? null : "Zacznij od jaśniejszego momentu albo włącz korektę obrazu (normalizuj)." });
      const pozO = ostr < 25 ? "blad" : ostr < 50 ? "uwaga" : "ok";
      dodaj({ id: "ostrosc_klatka0", nazwa: "Ostra pierwsza klatka", poziom: pozO, wartosc: ostr,
        tekst: pozO === "ok" ? `Pierwsza klatka ostra (${Math.round(ostr)}).` : `Pierwsza klatka nieostra albo rozmyta ruchem (${Math.round(ostr)}).`,
        naprawa: pozO === "ok" ? null : "Przesuń start pierwszego ujęcia o kilka klatek, na ostry kadr." });
    }
  }
}

// ---------- 5-6. głos w hooku: głośność względem reszty, tempo ----------
const zrodloMowy = (() => {
  const vo = rolka.voiceover?.src;
  if (vo) return { plik: pelna(vo), czas: (t) => t - Number(rolka.voiceover.start || 0) + Number(rolka.voiceover.od || 0) };
  const P0 = Z.pierwszeUjecie;
  if (P0?.typ === "wideo" && pierwsze && pierwsze.start < P0.start + P0.dur) return { plik: pelna(P0.src), czas: (t) => P0.od + (t - P0.start) * (P0.tempo || 1) };
  return null;
})();
function srednia(plik, od, dl) {
  const r = uruchom("ffmpeg", ["-hide_banner", "-nostats", ...(od != null ? ["-ss", String(Math.max(0, od))] : []), ...(dl ? ["-t", String(dl)] : []), "-i", plik, "-vn", "-af", "volumedetect", "-f", "null", "-"], { cicho: true });
  const m = (r.stderr || "").match(/mean_volume:\s*(-?[\d.]+) dB/);
  return m ? Number(m[1]) : null;
}
if (zrodloMowy && pierwsze && fs.existsSync(zrodloMowy.plik)) {
  const hookSlowa = slowa.filter((w) => w.start < pierwsze.start + 2.2);
  const odH = zrodloMowy.czas(pierwsze.start), doH = zrodloMowy.czas(hookSlowa.at(-1).end);
  const dbHook = srednia(zrodloMowy.plik, odH, Math.max(0.5, doH - odH));
  const dbCale = srednia(zrodloMowy.plik, null, null);
  if (dbHook != null && dbCale != null) {
    const roz = dbHook - dbCale;
    const poziom = roz >= -1.5 ? "ok" : roz >= -4 ? "uwaga" : "blad";
    dodaj({ id: "glos_hook", nazwa: "Hook nie jest cichszy niż reszta", poziom, wartosc: Math.round(roz * 10) / 10,
      tekst: poziom === "ok" ? `Głos w hooku ma energię (${roz >= 0 ? "+" : ""}${pl(roz)} dB względem całego nagrania).` : `Hook jest cichszy niż reszta nagrania o ${pl(-roz)} dB: pierwsze zdanie brzmi niepewnie.`,
      naprawa: poziom === "ok" ? null : "Nagraj hook jeszcze raz głośniej i z uśmiechem (pierwsze zdanie ma być najmocniejsze), albo wybierz inne podejście." });
  }
  const dl = Math.max(0.3, hookSlowa.at(-1).end - pierwsze.start), tempo = hookSlowa.length / dl;
  const poziom = tempo >= 2.2 && tempo <= 3.6 ? "ok" : "uwaga";
  dodaj({ id: "tempo_hook", nazwa: "Tempo mowy w hooku", poziom, wartosc: Math.round(tempo * 10) / 10,
    tekst: poziom === "ok" ? `Hook mówiony w dobrym tempie (${pl(tempo)} słowa/s).` : tempo > 3.6 ? `Hook mówiony bardzo szybko (${pl(tempo)} słowa/s): trudno go złapać za pierwszym razem.` : `Hook mówiony wolno (${pl(tempo)} słowa/s): pierwsze sekundy się dłużą.` });
}

// ---------- wynik ----------
const WAGI = { pierwsze_slowo: 25, hook_jak_w_scenariuszu: 15, ruch_klatka0: 20, jasnosc_klatka0: 10, ostrosc_klatka0: 10, glos_hook: 15, tempo_hook: 5, tekst_hooka: 0 };
const PKT = { ok: 1, uwaga: 0.5, blad: 0 };
const liczone = testy.filter((t) => t.poziom !== "pominiety" && WAGI[t.id]);
const wynik = liczone.length ? Math.round((liczone.reduce((s, t) => s + WAGI[t.id] * PKT[t.poziom], 0) / liczone.reduce((s, t) => s + WAGI[t.id], 0)) * 100) : null;
const out = { data: new Date().toISOString(), wynik, naprawa, testy };

if (napraw) {
  if (!naprawa) uwaga("Nie ma czego przyciąć automatycznie.");
  else {
    const R = czytajJ(RJ), u = R.ujecia[0];
    fs.writeFileSync(path.join(KOMP, "rolka.przed-kontrola-hooka.json"), JSON.stringify(R, null, 2));
    if (Array.isArray(u.segmenty) && u.segmenty.length) u.segmenty[0][0] = r1(Number(u.segmenty[0][0]) + naprawa.zrodlo);
    else u.od = r1(Number(u.od || 0) + naprawa.zrodlo);
    if (R.voiceover?.src) R.voiceover.od = r1(Number(R.voiceover.od || 0) + naprawa.o);
    // sceny: późniejsze starty wcześniej o tyle samo; sceny ciągnące się do końca rolki (kino, ozdobniki) krótsze
    for (const sc of R.sceny || []) {
      const st = Number(sc.start || 0), cz = Number(sc.czas || 0), doKonca = st + cz >= Number(Z.dlugosc || 0) - 0.1;
      if (st > 0) sc.start = r1(Math.max(0, st - naprawa.o));
      if (doKonca && cz > naprawa.o + 1) sc.czas = r1(Number(sc.start || 0) === st ? cz - naprawa.o : cz);
    }
    for (const z of R.znaczniki || []) if (Number(z.t) > 0) z.t = r1(Math.max(0, Number(z.t) - naprawa.o));
    fs.writeFileSync(RJ, JSON.stringify(R, null, 2));
    ok(`Przycięto ${pl(naprawa.o)} s z początku rolki (pierwsze ujęcie${R.voiceover?.src ? ", lektor" : ""}, sceny i znaczniki). Kopia: kompozycja/rolka.przed-kontrola-hooka.json. Składam ponownie i sprawdzam ...`);
    const r = uruchom("node", [path.join(ROOT, "scripts", "zloz.mjs"), proj], { cicho: true });
    if (r.code !== 0) blad("Składanie po przycięciu się nie udało.", (r.stdout + r.stderr).slice(-300));
    const r2 = uruchom("node", [path.join(ROOT, "scripts", "kontrola-hooka.mjs"), proj], { pokaz: true });
    process.exit(r2.code);
  }
}
fs.writeFileSync(path.join(KOMP, "hook.json"), JSON.stringify(out, null, 2));
const IK = { ok: "✓", uwaga: "!", blad: "✗", pominiety: "·" };
ok(`Kontrola nagranego hooka: ${wynik ?? "?"}/100  ·  ${path.basename(proj)}`);
for (const t of testy) console.log(`  ${IK[t.poziom]} ${t.nazwa}: ${t.tekst}${t.naprawa && t.poziom !== "ok" ? `\n      → ${t.naprawa}` : ""}`);
if (naprawa) info(`Automatyczna naprawa: npm run kontrola-hooka -- ${path.basename(proj)} --napraw`);

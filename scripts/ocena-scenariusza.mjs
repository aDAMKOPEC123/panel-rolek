// Twarda ocena scenariusza rolki (bez AI), plan: docs/PLAN_scenariusz_hook.md, etap 1.
// Czysty moduł bez importów Node: używa go serwer panelu, przeglądarka (/lib/ocena-scenariusza.mjs) i CLI:
//   npm run ocen-scenariusz -- <id pomysłu | projekt>
// Wejście: pomysl.json / scenariusz.json ({ profil, hooki, utrzymanie, scenariusz }).
// Wynik 0-100 w grupach: hook 45, dynamika 35, czytelność 10, struktura 10. Test bez danych jest pomijany,
// a wynik przeliczany na dostępne punkty (pole "czesciowa").

export const PROGI = {
  hookSlowaEkran: [3, 7], hookSlowaMowa: 10, hookCiecie: 2, tempoMowy: [2.3, 3.2], tempoMiekko: [1.8, 3.6],
  zmianaObrazu: 2.5, rownoTempo: 0.7, czytanieStart: 0.6, czytanieSlowo: 0.3, tekstPrzyMowie: 4,
};
const DLUGOSC = { zasieg: [12, 25], edukacja: [20, 40], sprzedaz: [15, 30] };

const OTWARCIA = ["cześć", "hej", "siema", "dzień dobry", "dzisiaj", "dziś", "w tym filmiku", "w tym filmie", "w dzisiejszym", "pokażę ci", "pokażę wam", "zapraszam", "chciałam", "chciałabym", "chcę wam", "chcę ci", "witajcie", "witam", "kochani", "dziewczyny,"];
const REKLAMA = ["oferujemy", "zapraszamy", "profesjonaln", "kompleksow", "najlepsz", "innowacyjn", "gwarancj", "gwarantuj", "nowoczesn", "wyjątkow", "luksusow", "renomowan", "skorzystaj z oferty", "w atrakcyjnej cenie"];
const KLISZE = ["nie uwierzysz", "sekret, którego", "sekret którego", "to zmieni wszystko", "zmieni twoje życie", "game changer", "game-changer", "hack", "musisz to zobaczyć", "nikt ci nie powie", "nikt o tym nie mówi", "czekaj do końca", "obejrzyj do końca"];
// słowa w opisie obrazu, które znaczą ruch / efekt / detal w pierwszej sekundzie
const WIZUAL_MOCNY = /zbliżen|makro|ruch|efekt|zajawk|wjeżdża|wjeżdżaj|unosi|odsłan|speed|zwolnien|slow|gest|odwraca|kontrast|reakcj|lustr|błysk|zapala|świeci|dotyka|nakłada|sunie|jedzie|przesuwa|rozjeżdża|przed i po|przed\/po|szarpn|rzuca|wyciąga|spada|pryska|para|dym|kropl/i;
const CIECIE = /cięcie|potem|następnie|→|->|przeskok|zmiana kadru|nowe ujęcie|zbliżenie na|przebitk|\d+[,.]\d+ s\b/i;
const REHOOK = /zwrot|\bale\b|uwaga|najważniejsz|a teraz|i tu|czekaj|nie koniec|najlepsze|druga rzecz|trzecia|\d\s*\/\s*\d|niespodzian|tego nie|zaskocz/i;
const NAGRODA = /efekt|\bpo\b|wynik|odpowied|reakcj|przed i po|przed\/po|finał|gotowe|końcowy|rezultat|zobacz/i;
const CTA = /zapisz|obserwuj|link w bio|umów|booksy|wyślij|napisz|skomentuj|zostaw|zadzwoń|rezerw|zapisy/i;

const bezAkcentow = (s) => String(s || "").replace(/\*/g, "");
export const slowa = (s) => bezAkcentow(s).replace(/[„”"«»()\[\]]/g, " ").split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w));
const r1 = (x) => Math.round(x * 10) / 10;
const pl = (x) => String(r1(x)).replace(".", ","); // liczba do tekstu po polsku
const zawiera = (tekst, lista) => { const t = String(tekst || "").toLowerCase(); return lista.filter((w) => t.includes(w)); };
const poczatek = (tekst, lista) => { const t = bezAkcentow(tekst).toLowerCase().trim().replace(/^[„"]+/, ""); return lista.find((w) => t.startsWith(w)); };
const celRolki = (c) => (/sprzed/i.test(c || "") ? "sprzedaz" : /eduk/i.test(c || "") ? "edukacja" : /zasi/i.test(c || "") ? "zasieg" : null);

export function ocenScenariusz(P) {
  P = P || {};
  const hooki = Array.isArray(P.hooki) ? P.hooki : [];
  const hook = hooki.find((h) => h.wybrany) || hooki[0] || null;
  const sc = (Array.isArray(P.scenariusz) ? P.scenariusz : []).map((w, i) => ({ ...w, i, od: Number(w.od) || 0, do: Number(w.do) || 0 }))
    .filter((w) => w.do > w.od).sort((a, b) => a.od - b.od);
  const D = sc.length ? Math.max(...sc.map((w) => w.do)) : 0;
  const testy = [];
  const dodaj = (t) => testy.push({ pkt: Math.round(t.waga * Math.max(0, Math.min(1, t.wynik)) * 10) / 10, ok: t.wynik >= 0.999, ...t });
  const brak = (grupa, id, waga, tekst, powod) => testy.push({ grupa, id, waga, tekst, pominiety: true, zle: powod, pkt: 0, ok: false });
  const nazwaW = (w) => `${pl(w.od)}-${pl(w.do)} s`;

  // ---------- HOOK (45) ----------
  if (!hook) {
    for (const [id, w, t] of [["hook_tekst", 8, "Tekst hooka 3-7 słów"], ["hook_mowa", 8, "Zdanie mówione do 10 słów"], ["hook_otwarcie", 7, "Pierwsze słowo niesie treść"], ["hook_obraz", 7, "Mocny obraz w 1. sekundzie"], ["hook_ciecie", 6, "Pierwsze cięcie do 2 s"], ["hook_reklama", 5, "Hook nie brzmi jak reklama"], ["hook_klisze", 4, "Bez klisz AI"]]) brak("hook", id, w, t, "Brak hooka w scenariuszu.");
  } else {
    const n = slowa(hook.tekst).length, akc = (String(hook.tekst || "").match(/\*[^*]+\*/g) || []).length;
    const [a, b] = PROGI.hookSlowaEkran;
    dodaj({ grupa: "hook", id: "hook_tekst", waga: 8, tekst: "Tekst hooka 3-7 słów, jeden akcent",
      wynik: n >= a && n <= b ? (akc <= 1 ? 1 : 0.7) : n > b ? Math.max(0, 1 - (n - b) * 0.25) : 0.5,
      zle: n > b ? `Tekst hooka ma ${n} słów (maks. ${b}): nikt tego nie przeczyta w 1,5 s` : n < a ? `Tekst hooka ma tylko ${n} ${n === 1 ? "słowo" : "słowa"}` : `${akc} akcenty w hooku: wyróżnij jedno słowo`,
      naprawa: `Skróć tekst hooka na ekranie do ${a}-${b} słów z jednym słowem w *gwiazdkach*. Zachowaj typ hooka i sens.` });
    const m = slowa(hook.mowisz).length, segH = sc[0];
    const czasH = segH ? segH.do - segH.od : null;
    dodaj({ grupa: "hook", id: "hook_mowa", waga: 8, tekst: "Zdanie mówione w hooku do 10 słów",
      // kara za liczbę słów i za tempo, którego nie da się naturalnie wypowiedzieć (powyżej 3,2 słowa/s)
      wynik: !m ? 1 : Math.min(m <= PROGI.hookSlowaMowa ? 1 : Math.max(0, 1 - (m - PROGI.hookSlowaMowa) * 0.15), czasH ? Math.max(0, 1 - Math.max(0, m / czasH - PROGI.tempoMowy[1]) * 0.6) : 1),
      zle: `Pierwsze zdanie ma ${m} słów${czasH ? ` w ${pl(czasH)} s (${pl(m / czasH)} słowa/s, naturalnie 2,5-3)` : ""}: za długo na hook`,
      naprawa: `Skróć pierwsze zdanie mówione (hook) do maks. ${PROGI.hookSlowaMowa} słów: jedna myśl, najmocniejsze słowo na początku. Popraw też teleprompter materiału z hookiem.` });
    const otw = poczatek(hook.mowisz, OTWARCIA) || poczatek(hook.tekst, OTWARCIA);
    dodaj({ grupa: "hook", id: "hook_otwarcie", waga: 7, tekst: "Pierwsze słowo niesie treść (bez „cześć”, „dzisiaj”, „pokażę ci”)",
      wynik: otw ? 0 : 1, zle: `Hook zaczyna się od „${otw}”: to sygnał do przewinięcia`,
      naprawa: `Hook zaczyna się od „${otw}”. Zacznij od treści: problemu, liczby, zaskoczenia albo obrazu. Bez powitań i zapowiedzi.` });
    const wiz = String(hook.wizual || "") + " " + String(segH?.co_widac || "");
    dodaj({ grupa: "hook", id: "hook_obraz", waga: 7, tekst: "Mocny obraz w 1. sekundzie (ruch, efekt, zbliżenie)",
      wynik: !hook.wizual && !segH ? 0.5 : WIZUAL_MOCNY.test(wiz) ? 1 : 0.2,
      zle: hook.wizual ? `Obraz hooka („${String(hook.wizual).slice(0, 60)}…”) nie ma ruchu, efektu ani zbliżenia` : "Hook nie ma opisanego obrazu",
      naprawa: "Daj w 1. sekundzie hooka mocny obraz: ruch, efekt po, makro detalu albo zajawkę efektu. Opisz go w polu wizual." });
    if (segH) {
      const ciecieWSrodku = CIECIE.test(String(segH.co_widac || "") + " " + String(segH.bodziec || ""));
      dodaj({ grupa: "hook", id: "hook_ciecie", waga: 6, tekst: `Pierwsze cięcie najpóźniej w ${PROGI.hookCiecie} s`,
        wynik: segH.do <= PROGI.hookCiecie ? 1 : ciecieWSrodku && segH.do <= 3.5 ? 0.6 : Math.max(0, 1 - (segH.do - PROGI.hookCiecie) * 0.4),
        zle: `Pierwszy fragment trwa ${pl(segH.do - segH.od)} s${ciecieWSrodku ? " (cięcie jest tylko w opisie)" : ""}: hook ma się skończyć cięciem do ${PROGI.hookCiecie} s`, gdzie: [segH.i],
        naprawa: `Podziel pierwszy fragment scenariusza tak, żeby hook kończył się cięciem najpóźniej w ${PROGI.hookCiecie} s (osobny wiersz od 0 do maks. ${PROGI.hookCiecie} s).` });
    } else brak("hook", "hook_ciecie", 6, `Pierwsze cięcie do ${PROGI.hookCiecie} s`, "Brak scenariusza.");
    const rek = zawiera(`${hook.tekst} ${hook.mowisz}`, REKLAMA);
    dodaj({ grupa: "hook", id: "hook_reklama", waga: 5, tekst: "Hook nie brzmi jak reklama", wynik: rek.length ? 0 : 1,
      zle: `Słowa reklamowe w hooku: ${rek.join(", ")}`, naprawa: `Usuń z hooka słowa reklamowe (${rek.join(", ")}). Mów jak do koleżanki, nie jak ulotka.` });
    const kl = zawiera(`${hook.tekst} ${hook.mowisz}`, KLISZE);
    dodaj({ grupa: "hook", id: "hook_klisze", waga: 4, tekst: "Bez klisz („nie uwierzysz”, „sekret, którego…”)", wynik: kl.length ? 0 : 1,
      zle: `Klisza w hooku: ${kl.join(", ")}`, naprawa: `Zamień kliszę (${kl.join(", ")}) na konkret z tego zabiegu: liczbę, sytuację albo obraz.` });
  }

  // ---------- DYNAMIKA (35) ----------
  if (!sc.length) {
    for (const [id, w, t] of [["zmiana_obrazu", 10, "Zmiana obrazu co 2,5 s"], ["tempo_mowy", 8, "Tempo mowy 2,3-3,2 słowa/s"], ["rowne_tempo", 5, "Bez dołków energii"], ["rehook", 6, "Ponowny hook w połowie"], ["nagroda", 6, "Nagroda na końcu"]]) brak("dynamika", id, w, t, "Brak scenariusza.");
  } else {
    const dlugie = sc.filter((w) => w.do - w.od > PROGI.zmianaObrazu && !String(w.bodziec || "").trim() && !CIECIE.test(String(w.co_widac || "")));
    dodaj({ grupa: "dynamika", id: "zmiana_obrazu", waga: 10, tekst: `Zmiana obrazu co ${String(PROGI.zmianaObrazu).replace(".", ",")} s`,
      wynik: 1 - dlugie.length / sc.length, gdzie: dlugie.map((w) => w.i),
      zle: `Bez zmiany obrazu dłużej niż ${String(PROGI.zmianaObrazu).replace(".", ",")} s: ${dlugie.map(nazwaW).join(", ")}`,
      naprawa: `We fragmentach ${dlugie.map(nazwaW).join(", ")} dodaj zmianę obrazu (zbliżenie, przebitka, inny kadr) i wpisz ją w pole "bodziec".` });
    const zMowa = sc.filter((w) => slowa(w.mowisz).length).map((w) => ({ w, t: slowa(w.mowisz).length / (w.do - w.od) }));
    if (zMowa.length) {
      const [lo, hi] = PROGI.tempoMowy, [mlo, mhi] = PROGI.tempoMiekko;
      const oc = zMowa.map(({ t }) => (t >= lo && t <= hi ? 1 : t >= mlo && t <= mhi ? 0.5 : 0));
      const zle = zMowa.filter((_, k) => oc[k] < 1);
      dodaj({ grupa: "dynamika", id: "tempo_mowy", waga: 8, tekst: "Tempo mowy 2,3-3,2 słowa/s", wynik: oc.reduce((s, x) => s + x, 0) / oc.length, gdzie: zle.map(({ w }) => w.i),
        zle: `Tempo poza 2,3-3,2 słowa/s: ${zle.map(({ w, t }) => `${nazwaW(w)}: ${pl(t)}`).join(", ")}`,
        naprawa: `Dopasuj długość zdań do czasu fragmentów (2,3-3,2 słowa/s): ${zle.map(({ w, t }) => `${nazwaW(w)} ma ${pl(t)} słowa/s, ${t > hi ? "skróć tekst albo wydłuż fragment" : "dopisz konkret albo skróć fragment"}`).join("; ")}.` });
      const srednie = zMowa.reduce((s, x) => s + slowa(x.w.mowisz).length, 0) / zMowa.reduce((s, x) => s + (x.w.do - x.w.od), 0);
      const dolki = zMowa.filter(({ t }) => t < PROGI.rownoTempo * srednie);
      dodaj({ grupa: "dynamika", id: "rowne_tempo", waga: 5, tekst: "Bez dołków energii (żaden fragment poniżej 70% średniego tempa)", wynik: dolki.length ? Math.max(0, 1 - dolki.length * 0.35) : 1, gdzie: dolki.map(({ w }) => w.i),
        zle: `Dołek energii: ${dolki.map(({ w, t }) => `${nazwaW(w)} (${pl(t)} przy średniej ${pl(srednie)})`).join(", ")}`,
        naprawa: `Fragmenty ${dolki.map(({ w }) => nazwaW(w)).join(", ")} są wyraźnie wolniejsze niż reszta. Skróć je albo dodaj w nich konkret i zmianę obrazu, żeby energia nie siadała.` });
    } else {
      brak("dynamika", "tempo_mowy", 8, "Tempo mowy 2,3-3,2 słowa/s", "Rolka bez mowy.");
      brak("dynamika", "rowne_tempo", 5, "Bez dołków energii", "Rolka bez mowy.");
    }
    const okno = sc.filter((w) => w.od < D * 0.65 && w.do > D * 0.35);
    const rh = okno.find((w) => w.rola === "rehook") || okno.find((w) => REHOOK.test(`${w.mowisz || ""} ${w.na_ekranie || ""} ${w.bodziec || ""}`));
    dodaj({ grupa: "dynamika", id: "rehook", waga: 6, tekst: "Ponowny hook w połowie (35-65% rolki)", wynik: rh ? 1 : 0,
      zle: `Między ${pl(D * 0.35)} a ${pl(D * 0.65)} s nic nie podbija ciekawości: tu odpada najwięcej osób`,
      naprawa: `Dodaj ponowny hook między ${pl(D * 0.35)} a ${pl(D * 0.65)} s: zwrot, „ale najważniejsze…”, licznik 2/3 albo nową obietnicę. Oznacz ten fragment "rola": "rehook".` });
    const koniec = sc.filter((w) => w.do > D * 0.7);
    const ng = koniec.find((w) => w.rola === "nagroda") || koniec.find((w) => NAGRODA.test(`${w.co_widac || ""} ${w.mowisz || ""} ${w.na_ekranie || ""}`));
    dodaj({ grupa: "dynamika", id: "nagroda", waga: 6, tekst: "Nagroda (efekt, odpowiedź) w ostatnich 30%", wynik: ng ? 1 : 0,
      zle: "W końcówce nie ma nagrody: widz nie dostaje tego, co obiecał hook",
      naprawa: `Zamknij pętlę z hooka w ostatnich 30% rolki (po ${pl(D * 0.7)} s): pokaż efekt albo daj odpowiedź. Oznacz fragment "rola": "nagroda".` });
  }

  // ---------- CZYTELNOŚĆ (10) ----------
  const zTekstem = sc.filter((w) => slowa(w.na_ekranie).length);
  if (zTekstem.length) {
    const zaKrotko = zTekstem.filter((w) => PROGI.czytanieStart + PROGI.czytanieSlowo * slowa(w.na_ekranie).length > w.do - w.od + 0.05);
    dodaj({ grupa: "czytelnosc", id: "czas_czytania", waga: 6, tekst: "Tekst na ekranie da się przeczytać w czasie fragmentu", wynik: 1 - zaKrotko.length / zTekstem.length, gdzie: zaKrotko.map((w) => w.i),
      zle: `Za mało czasu na przeczytanie: ${zaKrotko.map((w) => `${nazwaW(w)} (${slowa(w.na_ekranie).length} słów, trzeba ${pl(PROGI.czytanieStart + PROGI.czytanieSlowo * slowa(w.na_ekranie).length)} s)`).join(", ")}`,
      naprawa: `Skróć tekst na ekranie we fragmentach ${zaKrotko.map(nazwaW).join(", ")}: maks. ${Math.floor((2.5 - PROGI.czytanieStart) / PROGI.czytanieSlowo)} słów na 2,5 s. Resztę niech powie głos.` });
    const dwa = zTekstem.filter((w) => slowa(w.mowisz).length && slowa(w.na_ekranie).length > PROGI.tekstPrzyMowie);
    dodaj({ grupa: "czytelnosc", id: "jeden_tekst", waga: 4, tekst: "Jeden tekst naraz (przy mowie maks. 4 słowa na ekranie)", wynik: 1 - dwa.length / zTekstem.length, gdzie: dwa.map((w) => w.i),
      zle: `Napisy z mową i długi tekst naraz: ${dwa.map(nazwaW).join(", ")}`,
      naprawa: `We fragmentach z mową (${dwa.map(nazwaW).join(", ")}) skróć tekst na ekranie do maks. ${PROGI.tekstPrzyMowie} słów (hasło), bo pod spodem lecą napisy.` });
  } else if (sc.length) {
    brak("czytelnosc", "czas_czytania", 6, "Tekst da się przeczytać", "Brak tekstów na ekranie.");
    brak("czytelnosc", "jeden_tekst", 4, "Jeden tekst naraz", "Brak tekstów na ekranie.");
  } else {
    brak("czytelnosc", "czas_czytania", 6, "Tekst da się przeczytać", "Brak scenariusza.");
    brak("czytelnosc", "jeden_tekst", 4, "Jeden tekst naraz", "Brak scenariusza.");
  }

  // ---------- STRUKTURA (10) ----------
  const cel = celRolki(P.profil?.cel);
  if (sc.length && cel) {
    const [a, b] = DLUGOSC[cel];
    dodaj({ grupa: "struktura", id: "dlugosc", waga: 4, tekst: `Długość pasuje do celu (${a}-${b} s)`, wynik: D >= a && D <= b ? 1 : Math.max(0, 1 - Math.min(Math.abs(D - a), Math.abs(D - b)) / 8),
      zle: `Rolka ma ${pl(D)} s, a przy celu „${P.profil.cel}” najlepiej ${a}-${b} s`, naprawa: `Dopasuj długość scenariusza do ${a}-${b} s (cel: ${P.profil.cel}). Tnij najpierw kontekst, nigdy hook i nagrodę.` });
  } else brak("struktura", "dlugosc", 4, "Długość pasuje do celu", sc.length ? "Profil nie ma celu." : "Brak scenariusza.");
  if (sc.length) {
    const wczesne = sc.filter((w) => w.do <= D * 0.8 && CTA.test(`${w.mowisz || ""} ${w.na_ekranie || ""}`));
    const naKoncu = sc.filter((w) => w.do > D * 0.8 && CTA.test(`${w.mowisz || ""} ${w.na_ekranie || ""}`));
    dodaj({ grupa: "struktura", id: "jedno_cta", waga: 3, tekst: "Jedno wezwanie (CTA) w ostatnich 20%", wynik: naKoncu.length && !wczesne.length ? 1 : naKoncu.length ? 0.5 : 0, gdzie: wczesne.map((w) => w.i),
      zle: !naKoncu.length ? "Brak wezwania na końcu" : `Wezwanie też wcześniej: ${wczesne.map(nazwaW).join(", ")}`,
      naprawa: !naKoncu.length ? "Dodaj na końcu jedno krótkie wezwanie (zapisz, wyślij, umów się)." : `Usuń wezwania z fragmentów ${wczesne.map(nazwaW).join(", ")}: jedno CTA, dopiero na końcu.` });
    const wys = /wysła|wyślij|udostępn|oznacz/i.test(`${(P.utrzymanie || []).join(" ")} ${sc.map((w) => `${w.mowisz || ""} ${w.na_ekranie || ""}`).join(" ")}`);
    dodaj({ grupa: "struktura", id: "moment_wyslania", waga: 3, tekst: "Moment do wysłania znajomej", wynik: wys ? 1 : 0,
      zle: "Nie ma momentu, przy którym widz pomyśli „muszę to wysłać X”",
      naprawa: "Dodaj jeden moment do wysłania (rozpoznawalny błąd, sytuacja „to Ty”) i wpisz go do planu utrzymania." });
  } else {
    brak("struktura", "jedno_cta", 3, "Jedno CTA na końcu", "Brak scenariusza.");
    brak("struktura", "moment_wyslania", 3, "Moment do wysłania", "Brak scenariusza.");
  }

  // ---------- reklama i klisze w całym tekście (bez punktów, tylko uwaga) ----------
  const caly = sc.map((w) => `${w.mowisz || ""} ${w.na_ekranie || ""}`).join(" ");
  const uwagi = [];
  const rekC = zawiera(caly, REKLAMA), klC = zawiera(caly, KLISZE);
  if (rekC.length) uwagi.push(`Słowa reklamowe w scenariuszu: ${rekC.join(", ")}`);
  if (klC.length) uwagi.push(`Klisze w scenariuszu: ${klC.join(", ")}`);

  const GRUPY = { hook: ["Hook", 45], dynamika: ["Dynamika", 35], czytelnosc: ["Czytelność", 10], struktura: ["Struktura", 10] };
  const grupy = Object.fromEntries(Object.entries(GRUPY).map(([k, [nazwa, max]]) => {
    const t = testy.filter((x) => x.grupa === k && !x.pominiety);
    const mozliwe = t.reduce((s, x) => s + x.waga, 0);
    return [k, { nazwa, max, pkt: r1(t.reduce((s, x) => s + x.pkt, 0)), mozliwe }];
  }));
  const mozliwe = Object.values(grupy).reduce((s, g) => s + g.mozliwe, 0);
  const zdobyte = Object.values(grupy).reduce((s, g) => s + g.pkt, 0);
  return {
    wynik: mozliwe ? Math.round((zdobyte / mozliwe) * 100) : 0,
    czesciowa: mozliwe < 100,
    sprawdzone: mozliwe,
    grupy,
    testy,
    uwagi,
    dlugosc: r1(D),
  };
}

// Jedno polecenie dla Claude z wszystkimi poprawkami (najpierw hook, potem dynamika), dla przycisku „Napraw wszystko”.
export function poleceniePoprawek(ocena) {
  const kol = ["hook", "dynamika", "czytelnosc", "struktura"];
  const zle = ocena.testy.filter((t) => !t.ok && !t.pominiety && t.naprawa).sort((a, b) => kol.indexOf(a.grupa) - kol.indexOf(b.grupa) || b.waga - b.pkt - (a.waga - a.pkt));
  if (!zle.length) return "";
  return `Panel ocenił scenariusz na ${ocena.wynik}/100. Popraw w tej kolejności (zmieniaj tylko to, nie ruszaj fragmentów z "zablokowany": true):\n${zle.map((t, k) => `${k + 1}. ${t.naprawa}`).join("\n")}\nPo poprawkach scenariusz ma spełniać progi oceny. Popraw też teleprompter w materiałach, jeśli zmienia się to, co osoba mówi w nagraniu.`;
}

// Podpis treści scenariusza (hooki, scenariusz, cel): recenzja AI z innym podpisem jest nieaktualna.
export function podpisScenariusza(P) {
  const s = JSON.stringify({ h: (P?.hooki || []).map((h) => [h.tekst, h.mowisz, h.wizual, !!h.wybrany]), s: (P?.scenariusz || []).map((w) => [w.od, w.do, w.co_widac, w.mowisz, w.na_ekranie, w.bodziec]), c: P?.profil?.cel || "" });
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

// Kryteria recenzentki AI i ich wagi w ocenie hooka (etap 2 planu).
export const KRYTERIA_HOOKA = [
  ["zatrzymanie", "Zatrzymanie kciuka", 25], ["ciekawosc", "Luka ciekawości", 20], ["konkret", "Konkret", 15],
  ["to_o_mnie", "„To o mnie”", 15], ["spojnosc", "Obraz + tekst + głos", 10], ["autentycznosc", "Autentyczność", 15],
];
// Wynik recenzentki 0-100 (70% hook, 30% dynamika) i łączny: 60% twarda ocena + 40% recenzentka.
export function wynikRecenzji(r) {
  if (!r?.hook?.kryteria) return null;
  const suma = KRYTERIA_HOOKA.reduce((s, [k, , w]) => s + w * (Number(r.hook.kryteria[k]?.ocena) || 0), 0) / KRYTERIA_HOOKA.reduce((s, [, , w]) => s + w, 0);
  const hook = Math.round(suma * 10);
  const dyn = r.dynamika?.ocena != null ? Math.round(Number(r.dynamika.ocena) * 10) : null;
  return { hook, dynamika: dyn, wynik: dyn == null ? hook : Math.round(0.7 * hook + 0.3 * dyn) };
}
export const wynikLaczny = (twarda, recenzja) => (recenzja == null ? twarda : Math.round(0.6 * twarda + 0.4 * recenzja));

// Krzywa napięcia (etap 5): dane do wykresu sekunda po sekundzie dla każdego fragmentu scenariusza.
// Energia z pola "energia" (1-5), a bez niego szacowana: 3 bazowo, +1 rola hook/rehook/nagroda, +1 bodziec albo
// cięcie w opisie, -1 dołek tempa (poniżej 70% średniego). Uwagi = niezaliczone testy, które wskazują ten fragment.
export const ROLE = ["hook", "kontekst", "wartosc", "rehook", "nagroda", "cta"];
export function krzywaNapiecia(P, ocena = ocenScenariusz(P)) {
  const sc = (Array.isArray(P?.scenariusz) ? P.scenariusz : []).map((w, i) => ({ w, i, od: Number(w.od) || 0, do: Number(w.do) || 0 })).filter((x) => x.do > x.od).sort((a, b) => a.od - b.od);
  if (!sc.length) return null;
  const D = Math.max(...sc.map((x) => x.do));
  const tempa = sc.map((x) => (slowa(x.w.mowisz).length ? slowa(x.w.mowisz).length / (x.do - x.od) : null));
  const zMowa = sc.filter((_, k) => tempa[k] != null);
  const sr = zMowa.length ? zMowa.reduce((s, x) => s + slowa(x.w.mowisz).length, 0) / zMowa.reduce((s, x) => s + (x.do - x.od), 0) : null;
  const pierwszaNagroda = sc.find((x) => x.w.rola === "nagroda" && x.od >= D * 0.7) || sc.find((x) => x.od >= D * 0.7 && NAGRODA.test(`${x.w.co_widac || ""} ${x.w.mowisz || ""} ${x.w.na_ekranie || ""}`));
  const fragmenty = sc.map((x, k) => {
    const rola = ROLE.includes(x.w.rola) ? x.w.rola : k === 0 ? "hook" : x.do > D * 0.8 && CTA.test(`${x.w.mowisz || ""} ${x.w.na_ekranie || ""}`) ? "cta" : x === pierwszaNagroda ? "nagroda" : null;
    const bodziec = !!String(x.w.bodziec || "").trim() || CIECIE.test(String(x.w.co_widac || ""));
    const dolek = tempa[k] != null && sr != null && tempa[k] < PROGI.rownoTempo * sr;
    const podana = Number(x.w.energia);
    const energia = podana >= 1 && podana <= 5 ? podana : Math.max(1, Math.min(5, 3 + (["hook", "rehook", "nagroda"].includes(rola) ? 1 : 0) + (bodziec ? 1 : 0) - (dolek ? 1 : 0)));
    return {
      i: x.i, od: x.od, do: x.do, rola, rolaPodana: !!x.w.rola, energia, energiaSzacowana: !(podana >= 1 && podana <= 5),
      tempo: tempa[k] == null ? null : r1(tempa[k]), bodziec, dolek, pytanie: x.w.pytanie_widza || "",
      uwagi: ocena.testy.filter((t) => !t.ok && !t.pominiety && (t.gdzie || []).includes(x.i)).map((t) => t.tekst),
      opis: x.w.mowisz || x.w.co_widac || "",
    };
  });
  const petla = pierwszaNagroda ? { od: fragmenty[0].od, do: pierwszaNagroda.od } : null;
  return { D, srednieTempo: sr == null ? null : r1(sr), fragmenty, petla, tempoCel: PROGI.tempoMowy };
}

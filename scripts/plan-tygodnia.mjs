// Plan publikacji na tydzień: Claude układa wpis we wskazanym formacie na każdy wybrany dzień, pod usługi gabinetu,
// grafik zabiegów, pytania klientek, wnioski i przepis z wyników, bank hooków i ostatnie rolki (kontekst: kontekst-rolek.mjs).
// Każdy dzień: tytuł, kategoria, format, hook (tekst + zdanie), dlaczego teraz, co nagrać (lista), kiedy nagrać, CTA, wygląd.
//   npm run plan -- [--od RRRR-MM-DD] [--nastepny] [--dni pn,sr,pt] [--uwagi "tekst"] [--scenariusze] [--dopracuj]
//   npm run plan -- --publikacje pn:rolka:edukacyjny,wt:post:promocyjny,sr:karuzela,cz:story
//   npm run plan -- --od RRRR-MM-DD --zamien RRRR-MM-DD [--uwagi "..."]   (nowy pomysł na jeden dzień, reszta zostaje)
// --scenariusze: od razu pełne scenariusze dla każdego dnia (pomysly-ai.mjs), zapisane jako pomysły panelu (dzień -> pomysl).
// Każdy nowy scenariusz, zanim trafi do planu i kalendarza, ocenia recenzentka AI (osobna sesja, recenzent.mjs przez
// dopracuj.mjs --prog-rec 75): poniżej 75 pkt jej poprawki wchodzą od razu (maks. 2 rundy). Do tego czasu dzień zostaje
// „plan” bez scenariusza. Ok. 0,16 USD na rolkę bez poprawek, do ok. 1 USD z poprawkami. --bez-recenzji pomija.
// --dopracuj: zamiast tego mocniej, do łącznie 85 pkt (dopracuj.mjs --cel 85; ok. 1,5 USD i kilka minut na rolkę).
// Zapis: 01_PROJEKTY/_plan/<poniedziałek>.json. Panel: start, karta „🗓️ Plan na tydzień”.
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";
import { ROOT, PROJEKTY, KATEGORIE, blad, ok, info, uwaga, osobaZConfigu } from "./lib.mjs";
import { claudeJson, ZASADY_TRESCI, OBIETNICE } from "./claude-json.mjs";
import { iso, data, plus, NAZWY_DNI, okazje, kontekstGabinetu, oznaczPytania } from "./kontekst-rolek.mjs";
import { generujPomysly, zapiszJakoPomysl } from "./pomysly-ai.mjs";
import { ocenScenariusz } from "./ocena-scenariusza.mjs";
import { CELE_PUBLIKACJI, TYPY_PUBLIKACJI, DNI_PUBLIKACJI, rozkladPublikacji, typPublikacji, czyRolka } from "./publikacje.mjs";
import { KRYTERIA_PUBLIKACJI, recenzujPlanyPublikacji } from "./jakosc-publikacji.mjs";

export { okazje };
export const PLAN_DIR = path.join(PROJEKTY, "_plan");
export const DNI = DNI_PUBLIKACJI;
export function poniedzialek(d = new Date()) { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; }
export const plikPlanu = (od) => path.join(PLAN_DIR, `${od}.json`);

const SCHEMAT_DNIA = {
  type: "object", additionalProperties: false,
  required: ["data", "tytul", "kategoria", "format", "hook_tekst", "hook_mowa", "dlaczego_teraz", "co_nagrac", "nagraj_dnia", "kiedy_nagrac", "cta", "wyglad", "godzina", "pytanie_klientki"],
  properties: {
    data: { type: "string", description: "RRRR-MM-DD dnia publikacji" },
    tytul: { type: "string", description: "krótki temat publikacji, 3-8 słów" },
    kategoria: { type: "string", enum: KATEGORIE },
    format: { type: "string" },
    hook_tekst: { type: "string", description: "tekst na ekranie w 1. sekundzie, 3-7 słów, jedno *słowo* w gwiazdkach = akcent" },
    hook_mowa: { type: "string", description: "pierwsze zdanie mówione, maks. 10 słów, bez „cześć”, „dzisiaj”, „pokażę wam”" },
    dlaczego_teraz: { type: "string", description: "jedno zdanie: dlaczego ta rolka w tym tygodniu (okazja, pora roku, wizyta z grafiku, pytanie klientki, wynik)" },
    co_nagrac: { type: "array", minItems: 1, maxItems: 6, items: { type: "object", additionalProperties: false, required: ["co", "jak"], properties: { co: { type: "string" }, jak: { type: "string", description: "wykonanie ujęcia, grafiki, slajdu lub animowanej planszy" } } } },
    nagraj_dnia: { type: "string", description: "RRRR-MM-DD dla rolki, pusty dla innych formatów" },
    kiedy_nagrac: { type: "string", description: "przy jakiej okazji w gabinecie nagrać, np. „przy laminacji we wtorek o 10”" },
    cta: { type: "string", description: "jedno miękkie wezwanie, mówione" },
    wyglad: { type: "string", enum: ["reklamowy", "naturalny"], description: "naturalny = jak vlog (POV, dzień w gabinecie, Q&A); reklamowy = przed/po, cena, oferta" },
    godzina: { type: "string", description: "HH:MM publikacji, zwykle 18:00-20:00, w weekend rano możliwe" },
    pytanie_klientki: { type: "string", description: "pytanie klientki z listy, na które odpowiada rolka, albo pusty" },
  },
};
const SCHEMAT = {
  type: "object", additionalProperties: false, required: ["motyw", "dni", "uwagi"],
  properties: { motyw: { type: "string", description: "motyw tygodnia, 3-8 słów" }, dni: { type: "array", items: SCHEMAT_DNIA }, uwagi: { type: "string", description: "1-2 zdania dla prowadzącej, np. o czym pamiętać w tym tygodniu" } },
};
function poprawnaRozpiska(wpis, typ) {
  return typeof wpis?.tytul === "string" && wpis.tytul.trim().length >= 3
    && Array.isArray(wpis.co_nagrac) && wpis.co_nagrac.length >= (typ === "rolka" ? 2 : KRYTERIA_PUBLIKACJI[typ].min)
    && wpis.co_nagrac.every((u) => typeof u?.co === "string" && u.co.trim() && typeof u.jak === "string" && u.jak.trim());
}

function prompt({ od, cele, uwagi, zamien, istniejace, sasiednie = [] }) {
  const OS = osobaZConfigu();
  return `Ułóż ${zamien ? "jedną nową propozycję publikacji" : "tygodniowy plan publikacji"} dla gabinetu beauty.
TYDZIEŃ: od ${od} (poniedziałek).
WYMAGANE PUBLIKACJE. Każda data występuje dokładnie raz. Użyj dat i formatu z listy:
${cele.map((d) => `- ${d.data} (${NAZWY_DNI[(data(d.data).getDay() + 6) % 7]}): ${TYPY_PUBLIKACJI[d.typ_publikacji].nazwa}, ${CELE_PUBLIKACJI[d.cel_publikacji]}`).join("\n")}
${istniejace.length ? `Pozostałe publikacje tego tygodnia (unikaj powtarzania tematów):\n${istniejace.map((d) => `- ${d.data}: ${d.tytul} (${d.format || typPublikacji(d)})`).join("\n")}` : ""}
${uwagi ? `UWAGI ${OS.dop.toUpperCase()} NA TEN TYDZIEŃ (najważniejsze): ${uwagi}\n` : ""}
${kontekstGabinetu({ od: data(od), dni: 10 })}${sasiednie.length ? `ZAPLANOWANE W SĄSIEDNICH TYGODNIACH (nie powtarzaj tematów ani tych samych formatów pod rząd):\n${sasiednie.join("\n")}\n` : ""}
ZASADY:
- Dobieraj różne tematy. Gdy cel jest dowolny, łącz edukację i wizerunek z oszczędną promocją. Jeśli pasuje pytanie klientki, wpisz je w "pytanie_klientki".
- Rolka: "co_nagrac" to 2–6 konkretnych ujęć, "hook_mowa" to pierwsze zdanie. "nagraj_dnia" to dzień wizyty z grafiku albo dzień przed publikacją. Pierwsza sekunda ma mocny obraz. Twarz klientki tylko za zgodą.
- Post statyczny: "hook_tekst" to nagłówek grafiki. W "co_nagrac" rozpisz główny obraz, krótkie copy na grafice i cel opisu posta. Bez osi czasu.
- Karuzela: "hook_tekst" to okładka. W "co_nagrac" daj 3–6 kolejnych slajdów z nagłówkiem, obrazem i ostatnim slajdem z CTA.
- Animowane Story: "co_nagrac" to 2–4 krótkie pionowe plansze z tekstem, czasem i pomysłem na ruch lub przejście. Zostaw miejsce na interfejs i naklejkę, jeżeli jej używasz.
- Dla posta statycznego, karuzeli i Story pola "hook_mowa", "nagraj_dnia" i "kiedy_nagrac" zostaw puste. "format" doprecyzowuje pomysł (np. „Mit i fakt”), "cta" może być tekstowe. Podologia estetycznie i bez diagnoz.
- ${ZASADY_TRESCI}`;
}

export async function ulozPlan({ od, dni = ["pn", "sr", "pt"], publikacje, uwagi = "", zamien = null, wpis = null }, generuj = claudeJson, recenzuj = generuj) {
  fs.mkdirSync(PLAN_DIR, { recursive: true });
  const plik = plikPlanu(od);
  const naDysku = () => fs.existsSync(plik) ? fs.readFileSync(plik, "utf8") : null;
  const przed = naDysku(), stary = przed ? JSON.parse(przed) : null;
  const pon = data(od);
  const chroniony = (d) => d.wlasny || d.pomysl || d.projekt || ["nagrane", "gotowa", "opublikowana", "pominieta"].includes(d.stan);
  const stareDni = stary?.dni || [];
  const kandydaci = zamien ? stareDni.filter((d) => d.data === zamien && (!wpis || d.id === wpis) && !chroniony(d)) : [];
  if (zamien && kandydaci.length !== 1) throw new Error("Wybierz jeden wpis, którego temat chcesz zmienić.");
  const zastepowany = kandydaci[0];
  const uklad = zamien ? [] : rozkladPublikacji(publikacje ?? dni.map((dzien) => ({ dzien, typ_publikacji: "rolka" })));
  const zachowane = zamien ? stareDni.filter((d) => d !== zastepowany) : stareDni.filter(chroniony);
  const cele = zamien ? [{ data: zamien, typ_publikacji: typPublikacji(zastepowany), cel_publikacji: zastepowany.cel_publikacji || "dowolny" }]
    : uklad.map((d) => ({ ...d, data: iso(plus(pon, DNI.indexOf(d.dzien))) }))
      .filter((d) => !zachowane.some((z) => z.data === d.data && typPublikacji(z) === d.typ_publikacji && z.stan !== "pominieta"));
  const sasiednie = fs.readdirSync(PLAN_DIR).filter((n) => /^\d{4}-\d{2}-\d{2}\.json$/.test(n) && n.slice(0, 10) !== od && Math.abs(data(n.slice(0, 10)) - pon) <= 21 * 864e5)
    .flatMap((n) => { try { return JSON.parse(fs.readFileSync(path.join(PLAN_DIR, n), "utf8")).dni.map((d) => `- ${d.data}: ${d.tytul} (${d.format || "?"}, ${d.kategoria})`); } catch { return []; } });
  let dane = { dni: [], motyw: stary?.motyw || "", uwagi: stary?.uwagi || "" }, koszt = 0, czas_s = 0;
  let wynikDni;
  for (let proba = 0; cele.length && proba < 2; proba++) {
    const tekst = prompt({ od, cele, uwagi, zamien, istniejace: zachowane, sasiednie });
    const r = await generuj(tekst + (proba ? "\nSprawdź wszystkie wymagane daty. Usuń obietnice efektu." : ""), SCHEMAT, { timeout: 5 * 60 * 1000 });
    dane = r.dane; koszt += r.koszt || 0; czas_s += r.czas_s || 0;
    const wpisy = Array.isArray(dane?.dni) ? dane.dni : [];
    const poDacie = new Map(wpisy.map((d) => [d?.data, d]));
    if (wpisy.length === cele.length && cele.every((d) => poprawnaRozpiska(poDacie.get(d.data), d.typ_publikacji)) && !OBIETNICE.test(JSON.stringify(wpisy))) {
      wynikDni = poDacie;
      break;
    }
  }
  if (cele.length && !wynikDni) throw new Error("Claude nie zwrócił planu dla wszystkich wybranych dat. Plan nie został zmieniony.");
  const noweDni = cele.map(({ data: dzien, typ_publikacji, cel_publikacji }) => {
    const d = wynikDni.get(dzien), rolka = typ_publikacji === "rolka";
    const { co_nagrac, ...reszta } = d;
    const godzina = /^(?:[01]?\d|2[0-3]):[0-5]\d$/.test(d.godzina) ? d.godzina.padStart(5, "0") : "18:00";
    const poprzedni = zastepowany || stareDni.find((x) => x.termin && x.data === dzien && typPublikacji(x) === typ_publikacji);
    return { ...reszta, data: dzien, typ_publikacji, cel_publikacji, godzina: poprzedni?.godzina || godzina,
      ...(rolka ? { co_nagrac } : { co_nagrac: [], plan_tresci: co_nagrac, hook_mowa: "", kiedy_nagrac: "" }),
      nagraj_dnia: rolka ? (/^\d{4}-\d{2}-\d{2}$/.test(d.nagraj_dnia) && d.nagraj_dnia <= dzien ? d.nagraj_dnia : iso(plus(data(dzien), -1))) : "",
      stan: "plan", id: poprzedni?.id || crypto.randomBytes(4).toString("hex"),
    };
  });
  const recenzje = await recenzujPlanyPublikacji(noweDni, recenzuj);
  koszt += recenzje.koszt; czas_s += recenzje.czas_s;
  for (const d of noweDni) if (recenzje.wyniki.has(d.id)) d.recenzja_publikacji = recenzje.wyniki.get(d.id);
  const plan = zamien
    ? { ...stary, koszt_usd: +(((stary.koszt_usd || 0) + koszt).toFixed(3)) }
    : { od, do: iso(plus(pon, 6)), wygenerowano: new Date().toISOString(), motyw: dane.motyw, uwagi: dane.uwagi, ustawienia: { dni: uklad.map((d) => d.dzien), publikacje: uklad, uwagi }, okazje: okazje(pon, 24).filter((o) => o.dni_od_startu <= 13), koszt_usd: +koszt.toFixed(3) };
  plan.dni = [...zachowane, ...noweDni].sort((a, b) => a.data.localeCompare(b.data));
  if (naDysku() !== przed) throw new Error("Plan zmienił się w trakcie układania. Otwórz aktualny tydzień i spróbuj ponownie.");
  fs.writeFileSync(plik, JSON.stringify(plan, null, 2) + "\n");
  oznaczPytania(noweDni.map((d) => d.pytanie_klientki).filter(Boolean), `plan ${od}`);
  return { plan, koszt, czas_s, nowe: noweDni.filter(czyRolka).map((d) => d.data) };
}

export const PROG_RECENZJI = 75;

/** Recenzja (i poprawki) jednego pomysłu w osobnym procesie; zwraca wynik z ostatniej linii dopracuj.mjs albo { blad }. */
function recenzujPomysl(id, tryb) {
  const args = tryb === "dopracuj" ? ["--cel", "85"] : ["--prog-rec", String(PROG_RECENZJI), "--rundy", "2"];
  return new Promise((res) => {
    const p = spawn(process.execPath, [path.join(ROOT, "scripts", "dopracuj.mjs"), id, ...args], { cwd: ROOT });
    let out = "";
    const zbierz = (b) => { out += b; };
    p.stdout.on("data", zbierz); p.stderr.on("data", zbierz);
    const stop = setTimeout(() => p.kill(), 25 * 60 * 1000);
    p.on("close", (kod) => {
      clearTimeout(stop);
      const m = out.match(/WYNIK_DOPRACUJ (\{.*\})/);
      res(m ? JSON.parse(m[1]) : { blad: (out.trim().split(/\r?\n/).slice(-2).join(" ") || `kod ${kod}`).slice(0, 300) });
    });
  });
}

/** Pełne scenariusze dla dni planu (tylko tych bez pomysłu i rolki), zapisane jako pomysły panelu.
 *  recenzja: "prog" (domyślnie: recenzentka AI w osobnej sesji, jej poprawki poniżej 75 pkt) | "dopracuj" (do łącznie 85)
 *  | null (bez). Dzień dostaje scenariusz dopiero po recenzji, więc kalendarz nie pokazuje wersji sprzed poprawek. */
export async function scenariuszeDlaPlanu(od, tylko = null, recenzja = "prog") {
  const plan = JSON.parse(fs.readFileSync(plikPlanu(od), "utf8"));
  const dni = plan.dni.filter((d) => czyRolka(d) && !d.termin && !d.pomysl && !d.projekt && !["pominieta", "opublikowana", "gotowa", "nagrane"].includes(d.stan) && (!tylko || tylko.includes(d.data)));
  if (!dni.length) return { ids: [], koszt: 0, czas_s: 0 };
  const { pomysly, koszt, czas_s } = await generujPomysly({ dni, od: data(od) });
  const t0 = Date.now();
  const gotowe = pomysly.map((P, i) => (P && dni[i] ? { d: dni[i], P, id: zapiszJakoPomysl(P, { tryb: "plan", zrodlo: `plan tygodnia, ${dni[i].data}` }) } : null)).filter(Boolean);
  let kosztRec = 0;
  if (recenzja && gotowe.length) {
    info(`Recenzentka AI ocenia ${gotowe.length} ${gotowe.length === 1 ? "scenariusz" : "scenariusze"} (osobna sesja${recenzja === "dopracuj" ? ", dopracowanie do 85" : `, poprawki poniżej ${PROG_RECENZJI}`}; ok. 1-5 min)…`);
    const kolejka = [...gotowe]; // maks. 3 naraz (każda recenzja to osobne sesje Claude)
    await Promise.all(Array.from({ length: Math.min(3, kolejka.length) }, async () => {
      for (let g; (g = kolejka.shift()); ) {
        g.rec = await recenzujPomysl(g.id, recenzja);
        kosztRec += g.rec.koszt || 0;
        const tytul = g.P.profil?.temat || g.d.tytul;
        if (g.rec.blad) uwaga(`  ${g.d.data} ${tytul}: recenzja się nie udała (${g.rec.blad}); scenariusz zostaje bez niej.`);
        else info(`  ${g.d.data} ${tytul}: recenzentka ${g.rec.recenzentka ?? "?"}/100${g.rec.rundy ? `, poprawiony (${g.rec.rundy} ${g.rec.rundy === 1 ? "runda" : "rundy"})` : ""}, łącznie ${g.rec.laczna}`);
      }
    }));
  }
  const ids = [];
  const swiezy = JSON.parse(fs.readFileSync(plikPlanu(od), "utf8")); // plan mógł się zmienić w trakcie (panel)
  for (const g of gotowe) {
    const dz = swiezy.dni.find((x) => g.d.id ? x.id === g.d.id : x.data === g.d.data && czyRolka(x));
    if (dz && czyRolka(dz) && !dz.pomysl && !dz.projekt && !["pominieta", "opublikowana", "gotowa", "nagrane"].includes(dz.stan)) {
      let Pteraz = g.P;
      try { Pteraz = JSON.parse(fs.readFileSync(path.join(PROJEKTY, "_pomysly", g.id, "pomysl.json"), "utf8")); } catch {}
      dz.pomysl = g.id; dz.stan = "scenariusz";
      dz.ocena = g.rec?.twarda ?? ocenScenariusz(Pteraz).wynik;
      if (g.rec && !g.rec.blad) { dz.recenzja = g.rec.recenzentka; dz.ocena_laczna = g.rec.laczna; if (g.rec.rundy) dz.poprawiony = true; }
    }
    ids.push(g.id);
  }
  swiezy.koszt_usd = +(((swiezy.koszt_usd || 0) + koszt + kosztRec).toFixed(3));
  fs.writeFileSync(plikPlanu(od), JSON.stringify(swiezy, null, 2) + "\n");
  const opis = (P, i) => { const g = gotowe.find((x) => x.d === dni[i]); return !P ? "odrzucony" : g?.rec && !g.rec.blad ? `${g.rec.laczna} (recenzentka ${g.rec.recenzentka})` : P.ocena; };
  return { ids, koszt: koszt + kosztRec, czas_s: Math.round(czas_s + (Date.now() - t0) / 1000), oceny: pomysly.map(opis) };
}

// --- CLI ---
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const a = process.argv.slice(2);
  const opt = (n) => { const i = a.indexOf(`--${n}`); return i >= 0 ? a[i + 1] : null; };
  let od = opt("od");
  if (od && !/^\d{4}-\d{2}-\d{2}$/.test(od)) blad("Zła data --od (RRRR-MM-DD).");
  od = iso(poniedzialek(od ? data(od) : a.includes("--nastepny") ? plus(new Date(), 7) : new Date()));
  const dni = (opt("dni") || "pn,sr,pt").split(",").map((s) => s.trim().toLowerCase()).filter((s) => DNI.includes(s));
  let publikacje;
  if (a.includes("--publikacje")) {
    try {
      publikacje = rozkladPublikacji((opt("publikacje") || "").split(",").map((u) => {
        const [dzien, typ_publikacji, cel_publikacji, nadmiar] = u.trim().split(":");
        if (nadmiar !== undefined) throw new Error("Zły zapis formatu dnia.");
        return { dzien, typ_publikacji, cel_publikacji };
      }));
    } catch (e) { blad(e.message); }
  }
  const zamien = opt("zamien");
  const trybRec = a.includes("--bez-recenzji") ? null : a.includes("--dopracuj") ? "dopracuj" : "prog";
  // Kilka tygodni naraz (kalendarz: „✦ Zaplanuj miesiąc”): --tygodnie RRRR-MM-DD,RRRR-MM-DD (poniedziałki); pomija miniona i zaplanowane.
  if (opt("tygodnie")) {
    const dzisPon = iso(poniedzialek(new Date()));
    const lista = opt("tygodnie").split(",").map((s) => s.trim()).filter((s) => /^\d{4}-\d{2}-\d{2}$/.test(s)).map((s) => iso(poniedzialek(data(s))))
      .filter((s, i, t) => t.indexOf(s) === i && s >= dzisPon && !(fs.existsSync(plikPlanu(s)) && (JSON.parse(fs.readFileSync(plikPlanu(s), "utf8")).dni || []).some((d) => !d.wlasny && !d.termin)));
    if (!lista.length) { ok("Wszystkie te tygodnie mają już plan (albo minęły)."); process.exit(0); }
    let suma = 0, zakonczone = 0, bledy = 0;
    for (const [k, t] of lista.entries()) {
      try {
        info(`\n[${k + 1}/${lista.length}] Publikacje na tydzień od ${t}…`);
        const { plan, koszt, nowe } = await ulozPlan({ od: t, dni, publikacje, uwagi: opt("uwagi") || "" });
        suma += koszt;
        zakonczone++;
        info(`  Motyw: ${plan.motyw}`);
        for (const d of plan.dni) info(`  ${d.data} · ${d.tytul} [${d.kategoria}, ${d.wyglad}]`);
        if (a.includes("--scenariusze") && nowe.length) { const s = await scenariuszeDlaPlanu(t, nowe, trybRec); suma += s.koszt; info(`  Scenariusze: ${(s.oceny || []).join(", ")}`); }
      } catch (e) { bledy++; uwaga(`Tydzień ${t}: ${e.message}`); }
    }
    if (bledy) blad(`Zapisano ${zakonczone}/${lista.length} planów. Nie wszystkie zadania AI się powiodły. Szczegóły są w logu.`);
    ok(`Zaplanowane tygodnie: ${zakonczone} (razem ${suma.toFixed(2)} USD).`);
    process.exit(0);
  }
  if (a.includes("--tylko-scenariusze")) {
    try {
      info(`Piszę pełne scenariusze dla dni planu ${od} bez scenariusza (ok. 2-4 min)…`);
      const s = await scenariuszeDlaPlanu(od, null, trybRec);
      if (!s.ids.length) ok("Wszystkie dni mają już scenariusz albo rolkę.");
      else ok(`Scenariusze gotowe: ${s.ids.length} (${s.czas_s} s, ${s.koszt.toFixed(2)} USD), oceny: ${(s.oceny || []).join(", ")}`);
    } catch (e) { blad(`Nie udało się: ${e.message}`, "Sprawdź, czy Claude Code jest zalogowany (claude w terminalu)."); }
    process.exit(0);
  }
  try {
    info(zamien ? `Nowy pomysł na ${zamien} (tydzień od ${od})…` : `Układam plan publikacji na tydzień od ${od}…`);
    const { plan, koszt, czas_s, nowe } = await ulozPlan({ od, dni, publikacje, uwagi: opt("uwagi") || "", zamien, wpis: opt("wpis") });
    ok(`Plan zapisany: 01_PROJEKTY/_plan/${od}.json (${czas_s} s, ${koszt.toFixed(2)} USD)`);
    info(`Motyw: ${plan.motyw}`);
    for (const d of plan.dni) info(`  ${d.data} · ${TYPY_PUBLIKACJI[typPublikacji(d)]?.nazwa || "Publikacja"} · ${d.tytul}${d.nagraj_dnia ? ` · nagraj ${d.nagraj_dnia}` : ""}`);
    if (plan.uwagi && !zamien) uwaga(plan.uwagi);
    if (a.includes("--scenariusze") && nowe.length) {
      info(`\nPiszę pełne scenariusze dla ${nowe.length} ${nowe.length === 1 ? "rolki" : "rolek"} (ok. 2-4 min)…`);
      const s = await scenariuszeDlaPlanu(od, nowe, trybRec);
      ok(`Scenariusze gotowe (${s.czas_s} s, ${s.koszt.toFixed(2)} USD), oceny: ${(s.oceny || []).join(", ")}`);
    }
  } catch (e) { blad(`Nie udało się: ${e.message}`, "Sprawdź, czy Claude Code jest zalogowany (claude w terminalu)."); }
}

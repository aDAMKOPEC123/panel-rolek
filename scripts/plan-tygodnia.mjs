// Plan rolek na tydzień: Claude układa 1 rolkę na każdy wybrany dzień publikacji, pod sezon i okazje, usługi gabinetu,
// grafik zabiegów, pytania klientek, wnioski i przepis z wyników, bank hooków i ostatnie rolki (kontekst: kontekst-rolek.mjs).
// Każdy dzień: tytuł, kategoria, format, hook (tekst + zdanie), dlaczego teraz, co nagrać (lista), kiedy nagrać, CTA, wygląd.
//   npm run plan -- [--od RRRR-MM-DD] [--nastepny] [--dni pn,sr,pt] [--uwagi "tekst"] [--scenariusze] [--dopracuj]
//   npm run plan -- --od RRRR-MM-DD --zamien RRRR-MM-DD [--uwagi "..."]   (nowy pomysł na jeden dzień, reszta zostaje)
// --scenariusze: od razu pełne scenariusze dla każdego dnia (pomysly-ai.mjs), zapisane jako pomysły panelu (dzień -> pomysl).
// --dopracuj: potem każdy scenariusz przez recenzentkę i poprawki (dopracuj.mjs --cel 85; ok. 1,5 USD i kilka minut na rolkę).
// Zapis: 01_PROJEKTY/_plan/<poniedziałek>.json. Panel: start, karta „🗓️ Plan na tydzień”.
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";
import { ROOT, PROJEKTY, KATEGORIE, blad, ok, info, uwaga, osobaZConfigu } from "./lib.mjs";
import { claudeJson, ZASADY_TRESCI, OBIETNICE } from "./claude-json.mjs";
import { iso, data, plus, NAZWY_DNI, okazje, kontekstGabinetu, oznaczPytania } from "./kontekst-rolek.mjs";
import { generujPomysly, zapiszJakoPomysl } from "./pomysly-ai.mjs";

export { okazje };
export const PLAN_DIR = path.join(PROJEKTY, "_plan");
export const DNI = ["pn", "wt", "sr", "cz", "pt", "so", "nd"];
export function poniedzialek(d = new Date()) { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; }
export const plikPlanu = (od) => path.join(PLAN_DIR, `${od}.json`);

const SCHEMAT_DNIA = {
  type: "object", additionalProperties: false,
  required: ["data", "tytul", "kategoria", "format", "hook_tekst", "hook_mowa", "dlaczego_teraz", "co_nagrac", "nagraj_dnia", "kiedy_nagrac", "cta", "wyglad", "godzina", "pytanie_klientki"],
  properties: {
    data: { type: "string", description: "RRRR-MM-DD dnia publikacji" },
    tytul: { type: "string", description: "krótki temat rolki, 3-8 słów" },
    kategoria: { type: "string", enum: KATEGORIE },
    format: { type: "string" },
    hook_tekst: { type: "string", description: "tekst na ekranie w 1. sekundzie, 3-7 słów, jedno *słowo* w gwiazdkach = akcent" },
    hook_mowa: { type: "string", description: "pierwsze zdanie mówione, maks. 10 słów, bez „cześć”, „dzisiaj”, „pokażę wam”" },
    dlaczego_teraz: { type: "string", description: "jedno zdanie: dlaczego ta rolka w tym tygodniu (okazja, pora roku, wizyta z grafiku, pytanie klientki, wynik)" },
    co_nagrac: { type: "array", minItems: 2, maxItems: 6, items: { type: "object", additionalProperties: false, required: ["co", "jak"], properties: { co: { type: "string" }, jak: { type: "string", description: "kadr, światło, ile sekund" } } } },
    nagraj_dnia: { type: "string", description: "RRRR-MM-DD, kiedy nagrać (najlepiej dzień wizyty z grafiku; dzień albo dwa przed publikacją)" },
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

function prompt({ od, daty, uwagi, zamien, istniejace, sasiednie = [] }) {
  const OS = osobaZConfigu();
  return `Ułóż ${zamien ? "JEDEN nowy pomysł na rolkę (zamiana)" : "plan rolek na tydzień"} dla gabinetu beauty.
TYDZIEŃ: od ${od} (poniedziałek).
${zamien ? `DZIEŃ DO ZAMIANY: ${zamien}. Pozostałe rolki tego tygodnia (nie powtarzaj tematu ani formatu):\n${istniejace.map((d) => `- ${d.data}: ${d.tytul} (${d.format})`).join("\n")}` : `DNI PUBLIKACJI (dokładnie jedna rolka na każdy, w tej kolejności): ${daty.map((d) => `${d} (${NAZWY_DNI[(data(d).getDay() + 6) % 7]})`).join(", ")}.`}
${uwagi ? `UWAGI ${OS.dop.toUpperCase()} NA TEN TYDZIEŃ (najważniejsze): ${uwagi}\n` : ""}
${kontekstGabinetu({ od: data(od), dni: 10 })}${sasiednie.length ? `ZAPLANOWANE W SĄSIEDNICH TYGODNIACH (nie powtarzaj tematów ani tych samych formatów pod rząd):\n${sasiednie.join("\n")}\n` : ""}
ZASADY:
- Różnorodność w tygodniu: różne kategorie usług i różne formaty; maks. jedna rolka sprzedażowa (cena, oferta, przed/po z ceną) na tydzień; co najmniej jedna naturalna (wyglad "naturalny": POV, dzień w gabinecie, Q&A, mit vs fakt mówione do kamery).
- Jeśli są pytania klientek, co najmniej jedna rolka w tygodniu odpowiada na jedno z nich (wpisz je w "pytanie_klientki").
- Każda rolka ma być do nagrania telefonem w zwykły dzień pracy, przy zabiegach, które i tak się odbywają (grafik!). "co_nagrac": konkretne ujęcia (co i jak), 2-6 pozycji; twarz klientki tylko za zgodą, więc dawaj też ujęcia bez twarzy.
- "nagraj_dnia": dzień wizyty z grafiku albo dzień przed publikacją; nie w niedzielę, jeśli gabinet nieczynny.
- Hook: konkret, luka ciekawości albo „to o mnie”, obraz z ruchem albo efektem w 1. sekundzie. Podologia estetycznie, bez szokującego startu i bez diagnoz.
- ${ZASADY_TRESCI}`;
}

export async function ulozPlan({ od, dni = ["pn", "sr", "pt"], uwagi = "", zamien = null }) {
  fs.mkdirSync(PLAN_DIR, { recursive: true });
  const stary = fs.existsSync(plikPlanu(od)) ? JSON.parse(fs.readFileSync(plikPlanu(od), "utf8")) : null;
  if (zamien && !stary) throw new Error("Nie ma planu na ten tydzień.");
  const pon = data(od);
  const wybrane = DNI.map((k, i) => [k, iso(plus(pon, i))]).filter(([k]) => dni.includes(k)).map(([, d]) => d);
  if (!zamien && !wybrane.length) throw new Error("Wybierz choć jeden dzień publikacji.");
  const istniejace = stary ? stary.dni.filter((d) => d.data !== zamien) : [];
  // przy układaniu od nowa zostają wpisy już zaczęte (pomysł, rolka) i własne pomysły prowadzącej
  const zachowane = !zamien && stary ? stary.dni.filter((d) => d.wlasny || d.pomysl || d.projekt) : [];
  const sasiednie = fs.readdirSync(PLAN_DIR).filter((n) => /^\d{4}-\d{2}-\d{2}\.json$/.test(n) && n.slice(0, 10) !== od && Math.abs(data(n.slice(0, 10)) - pon) <= 21 * 864e5)
    .flatMap((n) => { try { return JSON.parse(fs.readFileSync(path.join(PLAN_DIR, n), "utf8")).dni.map((d) => `- ${d.data}: ${d.tytul} (${d.format || "?"}, ${d.kategoria})`); } catch { return []; } });
  let wynik, proba = 0;
  while (true) {
    const { dane, koszt, czas_s } = await claudeJson(prompt({ od, daty: zamien ? [zamien] : wybrane, uwagi, zamien, istniejace: [...istniejace, ...zachowane.filter((d) => !istniejace.includes(d))], sasiednie }) + (proba ? "\nPOPRZEDNIA WERSJA MIAŁA OBIETNICĘ EFEKTU. Bez obietnic i gwarancji." : ""), SCHEMAT, { timeout: 5 * 60 * 1000 });
    wynik = { dane, koszt: (wynik?.koszt || 0) + koszt, czas_s: (wynik?.czas_s || 0) + czas_s };
    if (!OBIETNICE.test(JSON.stringify(dane.dni)) || ++proba > 1) break;
  }
  const { dane } = wynik;
  // daty pilnuje skrypt: Claude zwraca dni po kolei, przypisujemy je do wybranych dat
  const cele = zamien ? [zamien] : wybrane;
  const noweDni = dane.dni.slice(0, cele.length).map((d, i) => ({ ...d, data: cele[i], nagraj_dnia: /^\d{4}-\d{2}-\d{2}$/.test(d.nagraj_dnia) && d.nagraj_dnia <= cele[i] ? d.nagraj_dnia : iso(plus(data(cele[i]), -1)), stan: "plan", id: crypto.randomBytes(4).toString("hex") }));
  oznaczPytania(noweDni.map((d) => d.pytanie_klientki).filter(Boolean), `plan ${od}`);
  const plan = zamien
    ? { ...stary, dni: [...istniejace, ...noweDni].sort((a, b) => a.data.localeCompare(b.data)), koszt_usd: +(((stary.koszt_usd || 0) + wynik.koszt).toFixed(3)) }
    : { od, do: iso(plus(pon, 6)), wygenerowano: new Date().toISOString(), motyw: dane.motyw, uwagi: dane.uwagi, ustawienia: { dni, uwagi }, okazje: okazje(pon, 24).filter((o) => o.dni_od_startu <= 13), dni: [...zachowane, ...noweDni].sort((a, b) => a.data.localeCompare(b.data)), koszt_usd: +wynik.koszt.toFixed(3) };
  fs.writeFileSync(plikPlanu(od), JSON.stringify(plan, null, 2) + "\n");
  return { plan, koszt: wynik.koszt, czas_s: wynik.czas_s, nowe: noweDni.map((d) => d.data) };
}

/** Pełne scenariusze dla dni planu (tylko tych bez pomysłu i rolki), zapisane jako pomysły panelu. */
export async function scenariuszeDlaPlanu(od, tylko = null) {
  const plan = JSON.parse(fs.readFileSync(plikPlanu(od), "utf8"));
  const dni = plan.dni.filter((d) => !d.pomysl && !d.projekt && d.stan !== "pominieta" && (!tylko || tylko.includes(d.data)));
  if (!dni.length) return { ids: [], koszt: 0, czas_s: 0 };
  const { pomysly, koszt, czas_s } = await generujPomysly({ dni, od: data(od) });
  const ids = [];
  const swiezy = JSON.parse(fs.readFileSync(plikPlanu(od), "utf8")); // plan mógł się zmienić w trakcie (panel)
  pomysly.forEach((P, i) => {
    const d = dni[i]; if (!P || !d) return;
    const id = zapiszJakoPomysl(P, { tryb: "plan", zrodlo: `plan tygodnia, ${d.data}` });
    const dz = swiezy.dni.find((x) => x.data === d.data);
    if (dz && !dz.pomysl && !dz.projekt) { dz.pomysl = id; dz.stan = "scenariusz"; dz.ocena = P.ocena; }
    ids.push(id);
  });
  swiezy.koszt_usd = +(((swiezy.koszt_usd || 0) + koszt).toFixed(3));
  fs.writeFileSync(plikPlanu(od), JSON.stringify(swiezy, null, 2) + "\n");
  return { ids, koszt, czas_s, oceny: pomysly.map((P) => (P ? P.ocena : "odrzucony")) };
}

// --- CLI ---
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const a = process.argv.slice(2);
  const opt = (n) => { const i = a.indexOf(`--${n}`); return i >= 0 ? a[i + 1] : null; };
  let od = opt("od");
  if (od && !/^\d{4}-\d{2}-\d{2}$/.test(od)) blad("Zła data --od (RRRR-MM-DD).");
  od = iso(poniedzialek(od ? data(od) : a.includes("--nastepny") ? plus(new Date(), 7) : new Date()));
  const dni = (opt("dni") || "pn,sr,pt").split(",").map((s) => s.trim().toLowerCase()).filter((s) => DNI.includes(s));
  const zamien = opt("zamien");
  const dopracujWszystkie = (ids) => { for (const id of ids) { info(`\nDopracowuję z recenzentką: ${id}…`); spawnSync(process.execPath, [path.join(ROOT, "scripts", "dopracuj.mjs"), id, "--cel", "85"], { cwd: ROOT, stdio: "inherit" }); } };
  // Kilka tygodni naraz (kalendarz: „✦ Zaplanuj miesiąc”): --tygodnie RRRR-MM-DD,RRRR-MM-DD (poniedziałki); pomija miniona i zaplanowane.
  if (opt("tygodnie")) {
    const dzisPon = iso(poniedzialek(new Date()));
    const lista = opt("tygodnie").split(",").map((s) => s.trim()).filter((s) => /^\d{4}-\d{2}-\d{2}$/.test(s)).map((s) => iso(poniedzialek(data(s))))
      .filter((s, i, t) => t.indexOf(s) === i && s >= dzisPon && !(fs.existsSync(plikPlanu(s)) && (JSON.parse(fs.readFileSync(plikPlanu(s), "utf8")).dni || []).some((d) => !d.wlasny)));
    if (!lista.length) { ok("Wszystkie te tygodnie mają już plan (albo minęły)."); process.exit(0); }
    let suma = 0;
    for (const [k, t] of lista.entries()) {
      try {
        info(`\n[${k + 1}/${lista.length}] Tydzień od ${t}: ${dni.length} rolki (${dni.join(", ")})…`);
        const { plan, koszt, nowe } = await ulozPlan({ od: t, dni, uwagi: opt("uwagi") || "" });
        suma += koszt;
        info(`  Motyw: ${plan.motyw}`);
        for (const d of plan.dni) info(`  ${d.data} · ${d.tytul} [${d.kategoria}, ${d.wyglad}]`);
        if (a.includes("--scenariusze")) { const s = await scenariuszeDlaPlanu(t, nowe); suma += s.koszt; info(`  Scenariusze: ${(s.oceny || []).join(", ")}`); }
      } catch (e) { uwaga(`Tydzień ${t}: ${e.message}`); }
    }
    ok(`Zaplanowane tygodnie: ${lista.length} (razem ${suma.toFixed(2)} USD).`);
    process.exit(0);
  }
  if (a.includes("--tylko-scenariusze")) {
    try {
      info(`Piszę pełne scenariusze dla dni planu ${od} bez scenariusza (ok. 2-4 min)…`);
      const s = await scenariuszeDlaPlanu(od);
      if (!s.ids.length) ok("Wszystkie dni mają już scenariusz albo rolkę.");
      else ok(`Scenariusze gotowe: ${s.ids.length} (${s.czas_s} s, ${s.koszt.toFixed(2)} USD), oceny: ${(s.oceny || []).join(", ")}`);
      if (a.includes("--dopracuj")) dopracujWszystkie(s.ids);
    } catch (e) { blad(`Nie udało się: ${e.message}`, "Sprawdź, czy Claude Code jest zalogowany (claude w terminalu)."); }
    process.exit(0);
  }
  try {
    info(zamien ? `Nowy pomysł na ${zamien} (tydzień od ${od})…` : `Układam plan na tydzień od ${od}: ${dni.length} rolki (${dni.join(", ")})…`);
    const { plan, koszt, czas_s, nowe } = await ulozPlan({ od, dni, uwagi: opt("uwagi") || "", zamien });
    ok(`Plan zapisany: 01_PROJEKTY/_plan/${od}.json (${czas_s} s, ${koszt.toFixed(2)} USD)`);
    info(`Motyw: ${plan.motyw}`);
    for (const d of plan.dni) info(`  ${d.data} · ${d.tytul} [${d.kategoria}, ${d.format}, ${d.wyglad}] nagraj: ${d.nagraj_dnia}`);
    if (plan.uwagi && !zamien) uwaga(plan.uwagi);
    if (a.includes("--scenariusze")) {
      info(`\nPiszę pełne scenariusze dla ${nowe.length} ${nowe.length === 1 ? "rolki" : "rolek"} (ok. 2-4 min)…`);
      const s = await scenariuszeDlaPlanu(od, nowe);
      ok(`Scenariusze gotowe (${s.czas_s} s, ${s.koszt.toFixed(2)} USD), oceny: ${(s.oceny || []).join(", ")}`);
      if (a.includes("--dopracuj")) dopracujWszystkie(s.ids);
    }
  } catch (e) { blad(`Nie udało się: ${e.message}`, "Sprawdź, czy Claude Code jest zalogowany (claude w terminalu)."); }
}

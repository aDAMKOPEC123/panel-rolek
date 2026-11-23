// Profil gabinetu: co to za gabinet, zabiegi i ceny, klientki, wyróżnik, ton, czego unikać, promocje.
// Źródło: wywiad w kreatorze panelu (krok „🏥 O gabinecie”) i/lub strona www (profilZeStrony: do 8 podstron + Claude).
// Zapis: 02_BRAND/gabinet.json (+ czytelny 02_BRAND/gabinet.md dla scenarzystki i autopilota). Poza gitem (02_BRAND/*).
// Używają: kontekstGabinetu() (plan tygodnia, kalendarz, gotowe pomysły), promptPomyslu i promptAutopilota (gabinet.md).
//   npm run gabinet -- --strona https://twojgabinet.pl     (podgląd tego, co Claude odczyta; bez zapisu)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { BRAND, KATEGORIE, wczytajConfig, zapiszConfig, info, ok, blad } from "./lib.mjs";
import { claudeJson, ZASADY_TRESCI } from "./claude-json.mjs";

export const PROFIL = path.join(BRAND, "gabinet.json");
export const PROFIL_MD = path.join(BRAND, "gabinet.md");
const KAT_ZABIEGU = [...KATEGORIE, "manicure", "inne"];
const t = (v, n = 600) => (typeof v === "string" ? v.trim().replace(/\s+\n/g, "\n").slice(0, n) : "");

export function czytajProfil() { try { return JSON.parse(fs.readFileSync(PROFIL, "utf8")); } catch { return null; } }
export const maProfil = () => { const p = czytajProfil(); return !!(p && (p.opis || p.zabiegi?.length)); };

/** Zapis z panelu: tylko znane pola, rozsądne długości; usługi w config.json z kategorii zabiegów. */
export function zapiszProfil(d = {}) {
  const P = {
    opis: t(d.opis, 800), specjalizacja: t(d.specjalizacja, 400), klientki: t(d.klientki, 400), wyroznik: t(d.wyroznik, 400),
    ton: t(d.ton, 300), unikaj: t(d.unikaj, 400), promocje: t(d.promocje, 400), styl_wizualny: t(d.styl_wizualny, 300),
    adres: t(d.adres, 200), strona: t(d.strona, 300),
    zabiegi: (Array.isArray(d.zabiegi) ? d.zabiegi : []).map((z) => ({
      nazwa: t(z.nazwa, 80), kategoria: KAT_ZABIEGU.includes(z.kategoria) ? z.kategoria : "inne", cena: t(z.cena, 40), czas: t(z.czas, 30),
      opis: t(z.opis, 200), promuj: z.promuj !== false,
    })).filter((z) => z.nazwa).slice(0, 60),
    zrodlo: t(d.zrodlo, 30) || "wywiad", aktualizacja: new Date().toISOString(),
  };
  fs.mkdirSync(BRAND, { recursive: true });
  fs.writeFileSync(PROFIL, JSON.stringify(P, null, 2) + "\n");
  fs.writeFileSync(PROFIL_MD, profilMd(P));
  // usługi gabinetu (kategorie rolek) z zabiegów, gdy w config.json ich nie było
  try {
    const cfg = wczytajConfig();
    const kat = [...new Set(P.zabiegi.map((z) => z.kategoria).filter((k) => KATEGORIE.includes(k)))];
    let zmiana = false;
    if (kat.length) { const stare = cfg.gabinet?.uslugi || []; const nowe = [...new Set([...stare, ...kat])]; if (nowe.length !== stare.length) { cfg.gabinet.uslugi = nowe; zmiana = true; } }
    if (P.strona && cfg.gabinet && cfg.gabinet.strona !== P.strona) { cfg.gabinet.strona = P.strona; zmiana = true; }
    if (zmiana) zapiszConfig(cfg);
  } catch {}
  return P;
}

function profilMd(P) {
  const z = P.zabiegi.map((x) => `- ${x.nazwa}${x.cena ? ` · ${x.cena}` : ""}${x.czas ? ` · ${x.czas}` : ""} (${x.kategoria})${x.promuj ? "" : " [nie promować]"}${x.opis ? `: ${x.opis}` : ""}`).join("\n");
  return `# Profil gabinetu\n\n> Uzupełniany w panelu (⚙ Ustawienia gabinetu > „🏥 O gabinecie”). Scenarzystka, autopilot i plan tygodnia biorą stąd fakty: nie wymyślaj zabiegów ani cen spoza tej listy.\n\n` +
    [["Czym zajmuje się gabinet", P.opis], ["Specjalizacja (z czego chce być znany)", P.specjalizacja], ["Klientki", P.klientki], ["Co wyróżnia gabinet", P.wyroznik], ["Ton (jak mówi do klientek)", P.ton], ["Czego NIE pokazywać w rolkach", P.unikaj], ["Promocje i nowości", P.promocje], ["Styl wizualny", P.styl_wizualny], ["Adres", P.adres], ["Strona", P.strona]]
      .filter(([, v]) => v).map(([k, v]) => `## ${k}\n${v}\n`).join("\n") + (z ? `\n## Zabiegi i ceny\n${z}\n` : "");
}

/** Tekst profilu do promptów Claude. */
export function profilDoPromptu(maks = 30) {
  const P = czytajProfil();
  if (!P) return "";
  const z = (P.zabiegi || []).filter((x) => x.promuj !== false).slice(0, maks).map((x) => `${x.nazwa}${x.cena ? ` (${x.cena})` : ""}`).join("; ");
  const bez = (P.zabiegi || []).filter((x) => x.promuj === false).map((x) => x.nazwa).join(", ");
  return `PROFIL GABINETU (fakty od prowadzącej; nie wymyślaj zabiegów ani cen spoza listy, cen nie podawaj, gdy ich tu nie ma):
${[P.opis && `- Czym się zajmuje: ${P.opis}`, P.specjalizacja && `- Specjalizacja: ${P.specjalizacja}`, P.klientki && `- Klientki: ${P.klientki}`, P.wyroznik && `- Wyróżnik: ${P.wyroznik}`, P.ton && `- Ton: ${P.ton}`, P.unikaj && `- NIE pokazywać / nie robić: ${P.unikaj}`, P.promocje && `- Promocje i nowości: ${P.promocje}`, z && `- Zabiegi do promowania: ${z}`, bez && `- Zabiegi, których NIE promować: ${bez}`].filter(Boolean).join("\n")}
`;
}

// --- odczyt strony www ---
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36";
async function pobierz(url) {
  const r = await fetch(url, { headers: { "User-Agent": UA, Accept: "text/html" }, redirect: "follow", signal: AbortSignal.timeout(15000) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  if (!/html/i.test(r.headers.get("content-type") || "html")) throw new Error("nie HTML");
  const buf = Buffer.from(await r.arrayBuffer());
  return { url: r.url, html: buf.slice(0, 3e6).toString("utf8") };
}
const ENCJE = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", oacute: "ó", Oacute: "Ó", ndash: "-", mdash: "-", hellip: "…", bdquo: "„", rdquo: "”", zl: "zł" };
function tekstStrony(html) {
  return html.replace(/<(script|style|noscript|svg|iframe|template)\b[\s\S]*?<\/\1>/gi, " ")
    .replace(/<\/(p|div|li|h[1-6]|tr|section|article|header|footer|ul|ol|table)>|<br\s*\/?>/gi, "\n").replace(/<\/t[dh]>/gi, " | ")
    .replace(/<[^>]+>/g, " ").replace(/&(#\d+|#x[0-9a-f]+|\w+);/gi, (m, e) => (e[0] === "#" ? String.fromCodePoint(e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : ENCJE[e] ?? m))
    .split("\n").map((l) => l.replace(/\s+/g, " ").trim()).filter((l) => l.length > 1).join("\n");
}
const WAZNE = /cennik|ceny|cena|price|oferta|offer|zabieg|uslug|usług|service|o-nas|o-mnie|about|nasz|zespol|zespół|podolog|kosmetolog|brwi|rzes|rzęs|twarz|stop|pedicure|manicure|laser|mezo|depilac|makijaz|makijaż|paznok|promoc/i;
const POMIN = /\.(pdf|jpe?g|png|webp|gif|mp4|zip)(\?|$)|mailto:|tel:|facebook|instagram|booksy\.com\/(?!pl-pl\/\d)|google|youtube|wp-login|\/feed|\/tag\/|\/category\/|polityka|regulamin|cookies|privacy|rodo/i;
function linki(html, baza) {
  const host = new URL(baza).host.replace(/^www\./, "");
  const out = new Map();
  for (const [, href, txt] of html.matchAll(/<a\b[^>]*href\s*=\s*["']([^"'#]+)["'][^>]*>([\s\S]{0,200}?)<\/a>/gi)) {
    let u; try { u = new URL(href.replace(/&amp;/g, "&"), baza); } catch { continue; }
    if (u.host.replace(/^www\./, "") !== host || POMIN.test(u.href)) continue;
    u.hash = "";
    const tekst = txt.replace(/<[^>]+>/g, " ");
    const w = (WAZNE.test(u.pathname) ? 2 : 0) + (WAZNE.test(tekst) ? 2 : 0) + (/cennik|ceny|cena|price/i.test(u.pathname + tekst) ? 3 : 0);
    if (w && (!out.has(u.href) || out.get(u.href) < w)) out.set(u.href, w);
  }
  return [...out.entries()].sort((a, b) => b[1] - a[1]).map(([u]) => u);
}

const SCHEMAT = {
  type: "object", additionalProperties: false,
  required: ["nazwa", "opis", "specjalizacja", "zabiegi", "klientki", "wyroznik", "ton", "styl_wizualny", "adres", "promocje", "uwagi"],
  properties: {
    nazwa: { type: "string" }, opis: { type: "string", description: "2-3 zdania: czym zajmuje się gabinet, po ludzku" },
    specjalizacja: { type: "string", description: "w czym gabinet jest najmocniejszy, 1 zdanie" },
    zabiegi: { type: "array", maxItems: 60, items: { type: "object", additionalProperties: false, required: ["nazwa", "kategoria", "cena", "czas", "opis"],
      properties: { nazwa: { type: "string" }, kategoria: { type: "string", enum: KAT_ZABIEGU }, cena: { type: "string", description: "dokładnie jak na stronie, np. „150 zł”, „od 120 zł”; pusty, gdy brak" }, czas: { type: "string", description: "np. 60 min; pusty, gdy brak" }, opis: { type: "string", description: "maks. 1 zdanie" } } } },
    klientki: { type: "string", description: "do kogo mówi strona (wiek, potrzeby); pusty, gdy nie wynika" },
    wyroznik: { type: "string", description: "co gabinet podkreśla jako przewagę (sprzęt, doświadczenie, podejście)" },
    ton: { type: "string", description: "jak strona mówi do klientek (np. ciepło na ty, ekspercko)" },
    styl_wizualny: { type: "string", description: "kolory i klimat strony w kilku słowach" },
    adres: { type: "string", description: "miasto i ulica, jeśli są" }, promocje: { type: "string", description: "aktualne promocje, vouchery, nowości; pusty, gdy brak" },
    uwagi: { type: "string", description: "czego nie udało się ustalić, 1 zdanie" },
  },
};

/** Odczyt strony gabinetu (do 8 podstron: cennik, oferta, zabiegi, o nas) i profil od Claude. Nic nie zapisuje. */
export async function profilZeStrony(adres) {
  let url = String(adres || "").trim();
  if (!/^https?:\/\//i.test(url)) url = "https://" + url;
  try { url = new URL(url).href; } catch { throw new Error("To nie wygląda na adres strony."); }
  const glowna = await pobierz(url).catch((e) => { throw new Error(`Nie udało się otworzyć strony (${e.message}).`); });
  const strony = [{ url: glowna.url, tekst: tekstStrony(glowna.html) }];
  for (const u of linki(glowna.html, glowna.url).slice(0, 8)) {
    try { const s = await pobierz(u); strony.push({ url: s.url, tekst: tekstStrony(s.html) }); } catch {}
  }
  // linie powtarzające się na wielu podstronach (menu, stopka) tylko raz
  const widziane = new Set();
  let suma = 0;
  const czesci = [];
  for (const s of strony) {
    const linie = s.tekst.split("\n").filter((l) => { const k = l.toLowerCase(); if (widziane.has(k)) return false; widziane.add(k); return true; });
    const tx = linie.join("\n").slice(0, 9000);
    if (tx.length < 40 || suma > 42000) continue;
    suma += tx.length;
    czesci.push(`=== ${s.url} ===\n${tx}`);
  }
  if (!czesci.length) throw new Error("Na stronie nie ma tekstu do odczytania (może jest zbudowana w samym JavaScript albo blokuje roboty). Odpowiedz na pytania sama.");
  const { dane, koszt, czas_s } = await claudeJson(`Oto tekst ze strony gabinetu beauty (strona główna i podstrony). Zrób z niego profil gabinetu do planowania rolek na Instagram.
Zasady: tylko fakty ze strony, nic nie wymyślaj; zabiegi i ceny dokładnie jak na stronie (jeśli jest cennik, przepisz wszystkie pozycje, maks. 60, łącząc warianty tego samego zabiegu w jedną pozycję z zakresem cen); kategorie: brwi, rzesy, twarz, podologia, pedicure, manicure, gabinet (ogólne), edukacja, inne. Po polsku, krótko.
${ZASADY_TRESCI}

${czesci.join("\n\n")}`, SCHEMAT, { timeout: 4 * 60 * 1000 });
  return { ...dane, strona: glowna.url, zrodlo: "strona", podstrony: strony.map((s) => s.url), koszt, czas_s };
}

// --- CLI ---
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const a = process.argv.slice(2);
  const i = a.indexOf("--strona");
  if (i < 0) { console.log(profilDoPromptu() || "Brak profilu gabinetu (02_BRAND/gabinet.json)."); process.exit(0); }
  info(`Czytam ${a[i + 1]} …`);
  try {
    const P = await profilZeStrony(a[i + 1]);
    ok(`${P.nazwa}: ${P.zabiegi.length} zabiegów z ${P.podstrony.length} stron (${P.czas_s} s, ${P.koszt.toFixed(2)} USD)`);
    console.log(JSON.stringify({ ...P, zabiegi: P.zabiegi.slice(0, 12) }, null, 2));
  } catch (e) { blad(e.message); }
}

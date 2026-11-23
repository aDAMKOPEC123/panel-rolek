// Wyniki rolek prosto z Instagrama (Instagram API with Instagram Login albo Facebook Login), bez przepisywania liczb.
//   npm run instagram -- --polacz <token>     (zapis 02_BRAND/instagram.json, tylko na tym komputerze)
//   npm run instagram -- --sync               (pobierz rolki i statystyki, dopasuj do rolek w panelu, zapisz final/wyniki.json)
//   npm run instagram -- --stan | --rozlacz
// Metryki rolek (Meta: Instagram Media Insights): views, reach, saved, shares, likes, comments, total_interactions,
// ig_reels_avg_watch_time (ms), reels_skip_rate (% pominięć w 3 s, wg Meta szacunkowy i rozwijany). Dane do 48 h opóźnienia.
// Krzywej utrzymania API nie daje: wykres spadków zostaje ręczny (zrzut w kroku Publikacja).
// Dopasowanie rolki z IG do rolki w panelu: zapisany media_id > link (permalink) > data publikacji (±36 h) + podobieństwo opisu.
// Token z Instagram Login (zaczyna się od „IG”) panel sam odświeża co 7 dni (ważny 60 dni). Token Facebooka trzeba odnowić ręcznie.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ROOT, PROJEKTY, ARCHIWUM, BRAND, czytajBrief, ustawWBrief, blad, ok, info, uwaga } from "./lib.mjs";

const API = "v27.0";
export const PLIK_IG = path.join(BRAND, "instagram.json");
export const CACHE_IG = path.join(ARCHIWUM, "instagram.json");
const czytajJ = (p, d) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return d; } };
const piszJ = (p, v) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, JSON.stringify(v, null, 2) + "\n"); };
const host = (token) => (/^IG/.test(token) ? "graph.instagram.com" : "graph.facebook.com");

async function get(url, token) {
  const u = new URL(url);
  u.searchParams.set("access_token", token);
  const r = await fetch(u, { signal: AbortSignal.timeout(20000) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.error) {
    const e = j.error || {};
    const msg = e.code === 190 ? "Token wygasł albo jest nieważny. Wygeneruj nowy w Meta for Developers i połącz jeszcze raz."
      : e.code === 10 || e.code === 200 ? `Brak uprawnień (${e.message}). Token potrzebuje instagram_business_basic i instagram_business_manage_insights (albo instagram_basic + instagram_manage_insights przy Facebook Login).`
      : e.code === 4 || e.code === 32 || e.code === 613 ? "Instagram ogranicza liczbę zapytań. Spróbuj za godzinę." : e.message || `HTTP ${r.status}`;
    throw Object.assign(new Error(msg), { kod: e.code, sub: e.error_subcode, surowy: e.message });
  }
  return j;
}

export function stanIG() {
  const c = czytajJ(PLIK_IG, null);
  const cache = czytajJ(CACHE_IG, null);
  if (!c?.token) return { polaczony: false };
  const wiek = c.token_od ? (Date.now() - Date.parse(c.token_od)) / 864e5 : null;
  return {
    polaczony: true, username: c.username, typ: c.host === "graph.instagram.com" ? "Instagram Login" : "Facebook Login",
    token_dni: wiek == null ? null : Math.round(wiek), wygasa_za: wiek == null ? null : Math.max(0, Math.round(60 - wiek)),
    ostatnia_sync: cache?.pobrano || null, blad: c.blad || null, rolki: cache?.rolki?.length || 0,
    dopasowane: (cache?.rolki || []).filter((r) => r.projekt).length,
  };
}

/** Sprawdza token, znajduje konto IG i zapisuje 02_BRAND/instagram.json. */
export async function polacz(tokenSurowy) {
  const token = String(tokenSurowy || "").trim().replace(/^Bearer\s+/i, "");
  if (token.length < 30 || /\s/.test(token)) throw new Error("To nie wygląda na token (długi ciąg znaków bez spacji).");
  const h = host(token);
  let ig_id, username;
  if (h === "graph.instagram.com") {
    const me = await get(`https://${h}/${API}/me?fields=user_id,username,account_type`, token);
    ig_id = me.user_id || me.id; username = me.username;
    if (me.account_type && !/BUSINESS|MEDIA_CREATOR|CREATOR/i.test(me.account_type)) throw new Error(`Konto @${username} jest prywatne/osobiste. Statystyki daje tylko konto firmowe albo twórcy (zmień w aplikacji Instagram: Ustawienia > Typ konta).`);
  } else {
    const strony = await get(`https://${h}/${API}/me/accounts?fields=name,instagram_business_account{id,username}`, token);
    const s = (strony.data || []).find((x) => x.instagram_business_account);
    if (!s) throw new Error("Ten token Facebooka nie widzi żadnej strony z podpiętym kontem Instagram (firmowym).");
    ig_id = s.instagram_business_account.id; username = s.instagram_business_account.username;
  }
  piszJ(PLIK_IG, { token, host: h, ig_id, username, token_od: new Date().toISOString(), polaczono: new Date().toISOString() });
  return stanIG();
}
export function rozlacz() { fs.rmSync(PLIK_IG, { force: true }); return { polaczony: false }; }

async function odswiezToken(c) {
  if (c.host !== "graph.instagram.com") return c;
  const wiek = (Date.now() - Date.parse(c.token_od || 0)) / 864e5;
  if (wiek < 7) return c;
  const r = await get(`https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token`, c.token);
  if (r.access_token) { c.token = r.access_token; c.token_od = new Date().toISOString(); piszJ(PLIK_IG, c); }
  return c;
}

const METRYKI = ["views", "reach", "saved", "shares", "likes", "comments", "total_interactions", "ig_reels_avg_watch_time", "reels_skip_rate"];
async function statystyki(c, id) {
  let lista = [...METRYKI];
  for (let proba = 0; proba < 4; proba++) {
    try {
      const j = await get(`https://${c.host}/${API}/${id}/insights?metric=${lista.join(",")}`, c.token);
      const o = {};
      for (const m of j.data || []) o[m.name] = m.total_value?.value ?? m.values?.[0]?.value ?? null;
      return o;
    } catch (e) {
      // metryka nieobsługiwana dla tego konta/rolki: wyrzucamy ją i pytamy jeszcze raz
      const zla = lista.find((m) => (e.surowy || "").includes(m)) || (proba === 0 ? "reels_skip_rate" : proba === 1 ? "total_interactions" : proba === 2 ? "ig_reels_avg_watch_time" : null);
      if (!zla || e.kod === 190 || e.kod === 4) throw e;
      lista = lista.filter((m) => m !== zla);
    }
  }
  return {};
}

// --- dopasowanie do rolek w panelu ---
function sekcja(txt, nazwa) { const m = txt.match(new RegExp(`^## ${nazwa}\\s*\\n([\\s\\S]*?)(?=^## |$(?![\\s\\S]))`, "m")); return m ? m[1].replace(/^TODO\s*$/im, "").trim() : ""; }
const slowa = (s) => new Set(String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/#\S+/g, " ").match(/[a-z0-9ł]{4,}/g) || []);
function podobienstwo(a, b) { const A = slowa(a), Bs = slowa(b); if (!A.size || !Bs.size) return 0; let w = 0; for (const x of A) if (Bs.has(x)) w++; return w / Math.min(A.size, Bs.size); }
function rolkiPanelu() {
  const out = [];
  for (const dir of [PROJEKTY, ARCHIWUM]) {
    if (!fs.existsSync(dir)) continue;
    for (const n of fs.readdirSync(dir)) {
      const p = path.join(dir, n);
      if (n.startsWith("_") || !fs.statSync(p).isDirectory() || !fs.existsSync(path.join(p, "brief.md"))) continue;
      let pola = {}, txt = "";
      try { ({ pola, txt } = czytajBrief(p)); } catch {}
      const igz = czytajJ(path.join(p, "final", "instagram.json"), null);
      const w = czytajJ(path.join(p, "final", "wyniki.json"), null);
      const dp = String(pola["data publikacji"] || w?.data_publikacji || "").trim();
      const maFinal = fs.existsSync(path.join(p, "final")) && fs.readdirSync(path.join(p, "final")).some((f) => /\.mp4$/i.test(f));
      out.push({ nazwa: n, sciezka: p, media_id: igz?.media_id || null, link: (pola["link"] || w?.permalink || "").trim(), data: /^\d{4}-\d{2}-\d{2}/.test(dp) ? dp : null, opis: sekcja(txt, "Opis pod rolkę") + " " + (pola["tytuł roboczy"] || ""), maFinal, tytul: pola["tytuł roboczy"] || n });
    }
  }
  return out;
}
const czysc = (u) => String(u || "").replace(/[?#].*$/, "").replace(/\/$/, "").replace(/^https?:\/\/(www\.)?/, "");
export function dopasuj(reels, rolki = rolkiPanelu()) {
  const wynik = new Map(); // media_id -> { projekt, jak }
  const zajete = new Set();
  // 1. zapisany media_id albo link
  for (const r of reels) {
    const p = rolki.find((x) => x.media_id === r.id) || rolki.find((x) => x.link && czysc(x.link) === czysc(r.permalink));
    if (p && !zajete.has(p.nazwa)) { wynik.set(r.id, { projekt: p, jak: p.media_id === r.id ? "zapisane" : "link" }); zajete.add(p.nazwa); }
  }
  // 2. data publikacji ±36 h + opis, potem sam opis (rolki z finalem)
  const pary = [];
  for (const r of reels) {
    if (wynik.has(r.id)) continue;
    const t = Date.parse(r.timestamp);
    for (const p of rolki) {
      if (zajete.has(p.nazwa) || p.media_id) continue;
      const pod = podobienstwo(r.caption, p.opis);
      if (p.data) {
        const roznica = Math.abs(t - Date.parse(p.data.replace(" ", "T") + (p.data.length > 10 ? ":00" : "T12:00:00"))) / 36e5;
        if (roznica <= 36) pary.push({ r, p, wynik: 2 - roznica / 36 + pod, jak: "data" });
      } else if (p.maFinal && pod >= 0.5) pary.push({ r, p, wynik: pod, jak: "opis" });
    }
  }
  pary.sort((a, b) => b.wynik - a.wynik);
  for (const x of pary) if (!wynik.has(x.r.id) && !zajete.has(x.p.nazwa)) { wynik.set(x.r.id, { projekt: x.p, jak: x.jak }); zajete.add(x.p.nazwa); }
  return wynik;
}
const msNaS = (v) => (v == null ? null : v > 120 ? Math.round(v / 100) / 10 : Math.round(v * 10) / 10);
const proc = (v) => (v == null ? null : v <= 1 ? Math.round(v * 1000) / 10 : Math.round(v * 10) / 10);
function zapiszWyniki(p, r, jak) {
  fs.mkdirSync(path.join(p.sciezka, "final"), { recursive: true });
  piszJ(path.join(p.sciezka, "final", "instagram.json"), { media_id: r.id, permalink: r.permalink, timestamp: r.timestamp, dopasowano: jak, zapisano: new Date().toISOString() });
  const plik = path.join(p.sciezka, "final", "wyniki.json");
  const stare = czytajJ(plik, {});
  const s = r.statystyki || {};
  const t = new Date(r.timestamp);
  const nowe = {
    wyswietlenia: s.views ?? stare.wyswietlenia, zasieg: s.reach ?? stare.zasieg, sredni_czas: msNaS(s.ig_reels_avg_watch_time) ?? stare.sredni_czas,
    pominiecia: proc(s.reels_skip_rate) ?? stare.pominiecia, zapisy: s.saved ?? stare.zapisy, wyslania: s.shares ?? stare.wyslania,
    polubienia: s.likes ?? stare.polubienia, komentarze: s.comments ?? stare.komentarze, interakcje: s.total_interactions ?? stare.interakcje,
  };
  const dzien = Math.floor((Date.now() - t) / 864e5);
  const dataPub = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")} ${String(t.getHours()).padStart(2, "0")}:${String(t.getMinutes()).padStart(2, "0")}`;
  piszJ(plik, { ...stare, ...Object.fromEntries(Object.entries(nowe).filter(([, v]) => v != null)), data_publikacji: stare.data_publikacji || dataPub, dzien, permalink: r.permalink, zrodlo: "instagram", pobrano: new Date().toISOString() });
  // brief: data publikacji i status, jeśli ich nie było (algorytm liczy po nich)
  try {
    const { pola } = czytajBrief(p.sciezka);
    if (!/^\d{4}-\d{2}-\d{2}/.test(pola["data publikacji"] || "")) ustawWBrief(p.sciezka, "data publikacji", dataPub);
    if (!/opublik/i.test(pola["status"] || "")) ustawWBrief(p.sciezka, "status", "opublikowana");
  } catch {}
}

/** Pobiera rolki i statystyki, dopasowuje, zapisuje wyniki. Zwraca podsumowanie. */
export async function synchronizuj({ dni = 120 } = {}) {
  let c = czytajJ(PLIK_IG, null);
  if (!c?.token) throw new Error("Instagram nie jest połączony.");
  try {
    c = await odswiezToken(c);
    const cache = czytajJ(CACHE_IG, { rolki: [] });
    const poprzednie = new Map((cache.rolki || []).map((r) => [r.id, r]));
    const granica = Date.now() - dni * 864e5;
    let url = `https://${c.host}/${API}/${c.ig_id}/media?fields=id,caption,media_type,media_product_type,permalink,timestamp,thumbnail_url&limit=50`;
    const reels = [];
    for (let strona = 0; url && strona < 6; strona++) {
      const j = await get(url, c.token);
      for (const m of j.data || []) if (m.media_product_type === "REELS" || (m.media_type === "VIDEO" && !m.media_product_type)) reels.push(m);
      const ostatni = j.data?.at(-1);
      url = ostatni && Date.parse(ostatni.timestamp) > granica ? j.paging?.next : null;
      if (url) url = url.replace(/([?&])access_token=[^&]*&?/, "$1"); // token dokleja get()
    }
    const swieze = reels.filter((r) => Date.parse(r.timestamp) > granica);
    for (const r of swieze) {
      const stare = poprzednie.get(r.id);
      const wiekDni = (Date.now() - Date.parse(r.timestamp)) / 864e5;
      // statystyki zmieniają się głównie przez pierwsze 30 dni; starsze odświeżamy raz na tydzień
      if (stare?.statystyki && wiekDni > 30 && Date.now() - Date.parse(stare.pobrano || 0) < 7 * 864e5) { r.statystyki = stare.statystyki; r.pobrano = stare.pobrano; continue; }
      try { r.statystyki = await statystyki(c, r.id); r.pobrano = new Date().toISOString(); } catch (e) { if (e.kod === 190 || e.kod === 4) throw e; r.blad = e.message; }
    }
    const mapa = dopasuj(swieze);
    for (const r of swieze) {
      const d = mapa.get(r.id);
      if (d) { r.projekt = d.projekt.nazwa; r.dopasowano = d.jak; if (r.statystyki) zapiszWyniki(d.projekt, r, d.jak); }
      r.caption = String(r.caption || "").slice(0, 300);
    }
    piszJ(CACHE_IG, { pobrano: new Date().toISOString(), konto: c.username, rolki: swieze });
    delete c.blad; piszJ(PLIK_IG, c);
    return { rolki: swieze.length, dopasowane: swieze.filter((r) => r.projekt).length, niedopasowane: swieze.filter((r) => !r.projekt).map((r) => ({ id: r.id, permalink: r.permalink, timestamp: r.timestamp, caption: r.caption.slice(0, 120), thumbnail_url: r.thumbnail_url })) };
  } catch (e) {
    c.blad = e.message; piszJ(PLIK_IG, c);
    throw e;
  }
}

/** Ręczne przypisanie rolki z IG do rolki w panelu (gdy automat nie trafił). */
export function przypisz(media_id, projekt) {
  const cache = czytajJ(CACHE_IG, { rolki: [] });
  const r = cache.rolki.find((x) => x.id === media_id);
  if (!r) throw new Error("Nie ma takiej rolki z Instagrama. Pobierz wyniki jeszcze raz.");
  const p = rolkiPanelu().find((x) => x.nazwa === projekt);
  if (!p) throw new Error("Nie ma takiej rolki w panelu.");
  for (const x of cache.rolki) if (x.projekt === projekt && x.id !== media_id) delete x.projekt;
  r.projekt = projekt; r.dopasowano = "recznie";
  if (r.statystyki) zapiszWyniki(p, r, "recznie");
  else piszJ(path.join(p.sciezka, "final", "instagram.json"), { media_id: r.id, permalink: r.permalink, timestamp: r.timestamp, dopasowano: "recznie", zapisano: new Date().toISOString() });
  piszJ(CACHE_IG, cache);
  return cache;
}
export function rolkiIG() { return czytajJ(CACHE_IG, { rolki: [] }); }

// --- CLI ---
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const a = process.argv.slice(2);
  const opt = (n) => { const i = a.indexOf(`--${n}`); return i >= 0 ? a[i + 1] : null; };
  try {
    if (opt("polacz")) { const s = await polacz(opt("polacz")); ok(`Połączono @${s.username} (${s.typ}).`); }
    else if (a.includes("--rozlacz")) { rozlacz(); ok("Rozłączono Instagram (token usunięty z tego komputera)."); }
    else if (a.includes("--sync")) {
      info("Pobieram rolki i statystyki z Instagrama…");
      const w = await synchronizuj();
      ok(`Rolek z ostatnich 120 dni: ${w.rolki}, dopasowane do panelu: ${w.dopasowane}.`);
      for (const n of w.niedopasowane) uwaga(`Bez rolki w panelu: ${n.timestamp.slice(0, 10)} ${n.permalink} „${n.caption.slice(0, 60)}”`);
    } else info(JSON.stringify(stanIG(), null, 2));
  } catch (e) { blad(e.message); }
}

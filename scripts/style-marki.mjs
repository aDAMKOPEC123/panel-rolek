// Stylistyka rolki: kolory, fonty, logo, znak wodny, nazwa i handle marki, styl ruchu i napisów.
// Zestawy: 02_BRAND/style/<id>/styl.json (+ logo.*, watermark.png). Zestaw "marka" = config.json + 02_BRAND/logo|watermark.
// Rolka wybiera zestaw polem rolka.json -> "styl" (brak = "marka"). zloz, okladka i podgląd panelu biorą z niego wszystko.
// Nowe rolki dostają zestaw z 02_BRAND/style/_ustawienia.json -> dla_nowych.
//   npm run styl -- --lista
//   npm run styl -- --strona https://twojgabinet.pl [--nazwa "Gabinet X"]   (zestaw ze strony www: kolory, fonty, logo)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { BRAND, wczytajConfig, zapiszConfig, slug, blad, ok, info, uwaga } from "./lib.mjs";

export const STYLE_DIR = path.join(BRAND, "style");
const USTAWIENIA = path.join(STYLE_DIR, "_ustawienia.json");
export const DOMYSLNY = "marka";
export const ROLE_KOLOROW = [
  ["akcent", "Akcent", "słowa kluczowe, liczby, kreski, pasek postępu"],
  ["akcent_2", "Akcent 2", "ramki, etykiety przed/po"],
  ["tekst", "Tekst", "nagłówki i napisy"],
  ["tlo_jasne", "Tło jasne", "tło plansz, boks napisów"],
  ["nude", "Tło akcentowe", "gradienty plansz"],
  ["cta", "Przycisk CTA", "pigułka z wezwaniem (biały tekst)"],
  ["tekst_2", "Tekst 2", "podpisy, handle"],
  ["granat", "Kolor logo", "drobne akcenty, logo"],
  ["zloto_jasne", "Akcent jasny", "poświata, drugie linie ozdobników"],
  ["mocny", "Mocny", "promocje, -15%"],
  ["akwarela", "Plamy tła", "miękkie plamy w tle plansz"],
  ["bialy", "Biały", "karty, tekst na CTA"],
];
const HEX = /^#[0-9a-f]{6}$/i;

const czytaj = (p, d) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return d; } };
const pisz = (p, v) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, JSON.stringify(v, null, 2) + "\n"); };
const poprawneId = (id) => typeof id === "string" && /^[a-z0-9][a-z0-9-]{0,40}$/.test(id);
const relB = (p) => (p ? path.relative(path.dirname(BRAND), p).split(path.sep).join("/") : null);
function pierwszyPlik(dir, nazwy) {
  for (const n of nazwy) for (const ext of [".png", ".svg", ".webp", ".jpg", ".jpeg"]) { const p = path.join(dir, n + ext); if (fs.existsSync(p)) return p; }
  return null;
}

/** Zestaw "marka" z config.json (kolory, fonty, gabinet, ruch, napisy) i plików z 02_BRAND. */
function stylMarki(cfg = wczytajConfig()) {
  const k = Object.fromEntries(Object.entries(cfg.kolory || {}).filter(([n]) => !n.startsWith("_")));
  let skin = null; try { skin = JSON.parse(fs.readFileSync(path.join(BRAND, "caption-skin.json"), "utf8")).domyslny; } catch {}
  return {
    id: DOMYSLNY, nazwa: cfg.gabinet?.nazwa || "Marka", opis: "Główna marka z config.json", zrodlo: "config",
    kolory: k, fonty: { naglowki: cfg.fonty?.naglowki, tekst: cfg.fonty?.tekst },
    gabinet: { nazwa: cfg.gabinet?.nazwa, instagram: cfg.gabinet?.instagram },
    ruch: cfg.ruch?.styl || "miekki", napisy: skin || cfg.napisy?.styl_domyslny || "perla",
    logo: pierwszyPlik(path.join(BRAND, "logo"), ["logo"]), watermark: pierwszyPlik(path.join(BRAND, "watermark"), ["watermark"]),
  };
}

export function wczytajStyl(id) {
  if (!id || id === DOMYSLNY) return stylMarki();
  if (!poprawneId(id)) return null;
  const d = path.join(STYLE_DIR, id);
  const s = czytaj(path.join(d, "styl.json"), null);
  if (!s) return null;
  return { ...s, id, logo: pierwszyPlik(d, ["logo"]), watermark: pierwszyPlik(d, ["watermark"]) };
}

export function listaStylow() {
  const out = [stylMarki()];
  if (fs.existsSync(STYLE_DIR)) for (const n of fs.readdirSync(STYLE_DIR).sort()) {
    if (n.startsWith("_") || !fs.statSync(path.join(STYLE_DIR, n)).isDirectory()) continue;
    const s = wczytajStyl(n); if (s) out.push(s);
  }
  const dlaNowych = stylDlaNowych();
  return out.map((s) => ({ ...s, logo: relB(s.logo), watermark: relB(s.watermark), dla_nowych: s.id === dlaNowych }));
}

export function stylDlaNowych() {
  const id = czytaj(USTAWIENIA, {}).dla_nowych;
  return id && wczytajStyl(id) ? id : DOMYSLNY;
}
export function ustawDlaNowych(id) {
  if (!wczytajStyl(id)) throw new Error(`Nie ma stylistyki ${id}.`);
  pisz(USTAWIENIA, { ...czytaj(USTAWIENIA, {}), dla_nowych: id });
}

/** Czyści dane z panelu: tylko znane pola, kolory #rrggbb, krótkie teksty. */
function oczysc(d) {
  const t = (v, n = 60) => (typeof v === "string" ? v.trim().slice(0, n) : undefined);
  const kolory = {};
  for (const [k] of ROLE_KOLOROW) if (HEX.test(d.kolory?.[k] || "")) kolory[k] = d.kolory[k].toUpperCase();
  return {
    nazwa: t(d.nazwa) || "Nowa stylistyka", opis: t(d.opis, 200) || "", zrodlo: t(d.zrodlo, 20) || "recznie", url: t(d.url, 300) || undefined,
    kolory, fonty: { naglowki: t(d.fonty?.naglowki) || "Playfair Display", tekst: t(d.fonty?.tekst) || "Montserrat" },
    gabinet: { nazwa: t(d.gabinet?.nazwa) || "", instagram: t(d.gabinet?.instagram) || "" },
    ruch: t(d.ruch, 20) || "miekki", napisy: t(d.napisy, 20) || "perla", uwagi: Array.isArray(d.uwagi) ? d.uwagi.slice(0, 10).map((x) => t(x, 300)) : undefined,
  };
}

/** Zapis zestawu. "marka" pisze do config.json (kolory, fonty, gabinet, ruch.styl) i caption-skin.json. */
export function zapiszStyl(id, dane) {
  const s = oczysc(dane);
  if (id === DOMYSLNY) {
    const p = path.join(path.dirname(BRAND), "config.json");
    const cfg = JSON.parse(fs.readFileSync(p, "utf8"));
    cfg.kolory = { ...cfg.kolory, ...s.kolory };
    cfg.fonty = { ...cfg.fonty, naglowki: s.fonty.naglowki, tekst: s.fonty.tekst };
    if (s.gabinet.nazwa) cfg.gabinet.nazwa = s.gabinet.nazwa;
    if (s.gabinet.instagram) cfg.gabinet.instagram = s.gabinet.instagram;
    cfg.ruch = { ...cfg.ruch, styl: s.ruch };
    zapiszConfig(cfg);
    const skinP = path.join(BRAND, "caption-skin.json");
    const skin = czytaj(skinP, null);
    if (skin && skin.domyslny !== s.napisy) { skin.domyslny = s.napisy; pisz(skinP, skin); }
    return wczytajStyl(DOMYSLNY);
  }
  if (!poprawneId(id)) throw new Error("Zła nazwa stylistyki.");
  pisz(path.join(STYLE_DIR, id, "styl.json"), s);
  return wczytajStyl(id);
}
export function nowyStyl(dane) {
  const baza = slug(dane.nazwa || "styl") || "styl";
  let id = baza === DOMYSLNY ? "marka-2" : baza;
  for (let n = 2; fs.existsSync(path.join(STYLE_DIR, id)); n++) id = `${baza}-${n}`;
  return zapiszStyl(id, dane);
}
export function usunStyl(id) {
  if (id === DOMYSLNY || !poprawneId(id)) throw new Error("Tej stylistyki nie można usunąć.");
  fs.rmSync(path.join(STYLE_DIR, id), { recursive: true, force: true });
  if (czytaj(USTAWIENIA, {}).dla_nowych === id) pisz(USTAWIENIA, { ...czytaj(USTAWIENIA, {}), dla_nowych: DOMYSLNY });
}
/** Folder na pliki zestawu (logo, watermark). */
export function folderStylu(id) {
  if (id === DOMYSLNY) return { logo: path.join(BRAND, "logo"), watermark: path.join(BRAND, "watermark") };
  if (!poprawneId(id) || !fs.existsSync(path.join(STYLE_DIR, id))) throw new Error("Nie ma takiej stylistyki.");
  return { logo: path.join(STYLE_DIR, id), watermark: path.join(STYLE_DIR, id) };
}
export function zapiszPlikStylu(id, rodzaj, ext, bufor) {
  if (!["logo", "watermark"].includes(rodzaj)) throw new Error("Rodzaj: logo albo watermark.");
  ext = String(ext).toLowerCase();
  if (![".png", ".svg", ".webp", ".jpg", ".jpeg"].includes(ext)) throw new Error("Logo: PNG, SVG, WEBP albo JPG.");
  const dir = folderStylu(id)[rodzaj];
  fs.mkdirSync(dir, { recursive: true });
  for (const e of [".png", ".svg", ".webp", ".jpg", ".jpeg"]) fs.rmSync(path.join(dir, rodzaj + e), { force: true });
  fs.writeFileSync(path.join(dir, rodzaj + ext), bufor);
  return wczytajStyl(id);
}

/** Konfiguracja z nałożoną stylistyką rolki + ścieżki logo i znaku wodnego. */
export function zastosujStyl(cfg, id) {
  const s = wczytajStyl(id) || (uwaga(`Nie ma stylistyki „${id}”, biorę główną markę.`), stylMarki(cfg));
  const out = structuredClone(cfg);
  out.kolory = { ...cfg.kolory, ...s.kolory };
  out.fonty = { ...cfg.fonty, ...(s.fonty?.naglowki ? { naglowki: s.fonty.naglowki } : {}), ...(s.fonty?.tekst ? { tekst: s.fonty.tekst } : {}) };
  if (s.id !== DOMYSLNY) { out.fonty.plik_naglowki = null; out.fonty.plik_tekst = null; }
  out.gabinet = { ...cfg.gabinet, ...(s.gabinet?.nazwa ? { nazwa: s.gabinet.nazwa } : {}), ...(s.gabinet?.instagram ? { instagram: s.gabinet.instagram } : {}) };
  out.ruch = { ...cfg.ruch, styl: s.ruch || cfg.ruch?.styl };
  out.styl = { id: s.id, nazwa: s.nazwa, napisy: s.napisy, logo: s.logo, watermark: s.watermark };
  return out;
}

// =====================================================================
// Stylistyka ze strony www: HTML + arkusze CSS -> kolory (z rolami), fonty, logo, nazwa, Instagram.
// =====================================================================
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36";
async function pobierz(url, { tekst = true, max = 4e6 } = {}) {
  const r = await fetch(url, { headers: { "User-Agent": UA, Accept: tekst ? "text/html,text/css,*/*" : "image/*,*/*" }, redirect: "follow", signal: AbortSignal.timeout(15000) });
  if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
  const buf = Buffer.from(await r.arrayBuffer());
  if (buf.length > max) throw new Error(`${url}: za duży plik`);
  return { url: r.url, typ: r.headers.get("content-type") || "", buf, tekst: tekst ? buf.toString("utf8") : null };
}
const absolutny = (u, baza) => { try { return new URL(u.replace(/&amp;/g, "&"), baza).href; } catch { return null; } };
const atr = (tag, n) => (tag.match(new RegExp(`\\s${n}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, "i")) || []).slice(2).find((x) => x != null) ?? null;

// --- kolory ---
function doRgb(s) {
  s = s.trim().toLowerCase();
  let m = s.match(/^#([0-9a-f]{3,8})$/);
  if (m) {
    let h = m[1];
    if (h.length === 3 || h.length === 4) h = h.split("").map((c) => c + c).join("");
    if (h.length === 8 && parseInt(h.slice(6, 8), 16) < 200) return null;
    return h.length >= 6 ? [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) : null;
  }
  m = s.match(/^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([\d.]+%?))?\s*\)$/);
  if (m) { const a = m[4] == null ? 1 : m[4].endsWith("%") ? parseFloat(m[4]) / 100 : parseFloat(m[4]); return a < 0.8 ? null : [m[1], m[2], m[3]].map((x) => Math.min(255, Math.round(+x))); }
  m = s.match(/^hsla?\(\s*([\d.]+)(?:deg)?[\s,]+([\d.]+)%[\s,]+([\d.]+)%(?:[\s,/]+([\d.]+%?))?\s*\)$/);
  if (m) {
    const a = m[4] == null ? 1 : m[4].endsWith("%") ? parseFloat(m[4]) / 100 : parseFloat(m[4]); if (a < 0.8) return null;
    const h = +m[1] / 360, sa = +m[2] / 100, l = +m[3] / 100;
    const q = l < 0.5 ? l * (1 + sa) : l + sa - l * sa, p = 2 * l - q;
    const f = (t) => { t = (t + 1) % 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; };
    return [f(h + 1 / 3), f(h), f(h - 1 / 3)].map((x) => Math.round(x * 255));
  }
  return null;
}
const hex = (c) => "#" + c.map((x) => Math.max(0, Math.min(255, Math.round(x))).toString(16).padStart(2, "0")).join("").toUpperCase();
function hsl([r, g, b]) {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  let h = 0;
  if (d) h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return { h: (h * 60 + 360) % 360, s, l };
}
const miks = (a, b, t) => a.map((x, i) => x + (b[i] - x) * t);
const lum = (c) => { const v = c.map((x) => { x /= 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; }); return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2]; };
export const kontrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const BIALY = [255, 255, 255], CZARNY = [0, 0, 0];
const rozneOd = (a, b) => { const A = hsl(a), B = hsl(b); const dh = Math.min(Math.abs(A.h - B.h), 360 - Math.abs(A.h - B.h)); return dh > 18 || Math.abs(A.l - B.l) > 0.12; };

/** Zbiera kolory z CSS z wagą i rolą (tlo / tekst / inne). */
function zbierzKolory(css, theme) {
  const mapa = new Map();
  const dodaj = (s, rola, w) => {
    const c = doRgb(s); if (!c) return;
    const k = hex(c);
    const e = mapa.get(k) || { hex: k, rgb: c, n: 0, tlo: 0, tekst: 0, marka: 0 };
    e.n += w; if (rola === "tlo") e.tlo += w; if (rola === "tekst") e.tekst += w; if (rola === "marka") e.marka += w;
    mapa.set(k, e);
  };
  const KOL = /#[0-9a-f]{3,8}\b|rgba?\([^)]*\)|hsla?\([^)]*\)/gi;
  for (const [, sel, blok] of css.matchAll(/([^{}]*)\{([^{}]*)\}/g)) {
    for (const d of blok.split(";")) {
      const i = d.indexOf(":"); if (i < 0) continue;
      const prop = d.slice(0, i).trim().toLowerCase(), val = d.slice(i + 1);
      const kolory = val.match(KOL); if (!kolory) continue;
      let rola = "inne", w = 1;
      if (prop.startsWith("--")) { rola = /primary|accent|brand|main|akcent|glown|theme|secondary|cta|button|btn/.test(prop) ? "marka" : "inne"; w = rola === "marka" ? 4 : 1.5; }
      else if (/^background/.test(prop)) { rola = "tlo"; if (/button|btn|cta|\.button/i.test(sel)) { rola = "marka"; w = 3; } }
      else if (prop === "color") { rola = "tekst"; if (/\ba\b|a:|link|button|btn/i.test(sel)) { rola = "marka"; w = 2; } }
      else if (/^(border|fill|stroke|outline|box-shadow|text-decoration)/.test(prop)) w = 0.6;
      for (const k of kolory) dodaj(k, rola, w);
    }
  }
  if (theme) dodaj(theme, "marka", 25);
  return [...mapa.values()];
}

/** Role kolorów z zebranych kolorów strony. */
export function roleKolorow(zebrane) {
  const sort = (arr, f) => [...arr].sort((a, b) => f(b) - f(a));
  const C = zebrane.map((e) => ({ ...e, ...hsl(e.rgb) }));
  const chrom = sort(C.filter((e) => e.s >= 0.18 && e.l > 0.18 && e.l < 0.85), (e) => e.n + e.marka * 2);
  const uwagi = [];
  const akcentE = chrom[0];
  const akcent = akcentE?.rgb || [176, 122, 110];
  if (!akcentE) uwagi.push("Strona nie ma wyraźnego koloru marki (same szarości), akcent ustawiony domyślnie. Popraw go ręcznie.");
  const akcent2 = chrom.slice(1).find((e) => rozneOd(e.rgb, akcent))?.rgb || miks(akcent, CZARNY, 0.18);
  const ciemne = sort(C.filter((e) => e.l < 0.32), (e) => e.tekst * 2 + e.n);
  let tekst = ciemne[0]?.rgb || [34, 30, 32];
  const jasne = sort(C.filter((e) => e.l > 0.86 && e.hex !== "#FFFFFF"), (e) => e.tlo * 2 + e.n);
  let tlo = jasne[0]?.rgb || miks(akcent, BIALY, 0.93);
  if (hsl(tlo).l < 0.9) tlo = miks(tlo, BIALY, 0.5);
  if (kontrast(tekst, tlo) < 7) tekst = miks(tekst, CZARNY, 0.5);
  if (kontrast(tekst, tlo) < 4.5) { tekst = [28, 26, 30]; uwagi.push("Tekst ze strony był za jasny na tle, dałam ciemniejszy."); }
  const nude = jasne.slice(1).find((e) => rozneOd(e.rgb, tlo) && e.l < 0.95)?.rgb || miks(akcent, BIALY, 0.8);
  const srednie = sort(C.filter((e) => e.l >= 0.32 && e.l <= 0.62 && e.s < 0.25), (e) => e.tekst * 2 + e.n);
  let tekst2 = srednie[0]?.rgb || miks(tekst, BIALY, 0.4);
  if (kontrast(tekst2, tlo) < 3.5) tekst2 = miks(tekst, BIALY, 0.35);
  const granat = sort(C.filter((e) => e.l < 0.4 && e.s > 0.2), (e) => e.n)[0]?.rgb || tekst;
  let cta = [akcent2, akcent].find((c) => kontrast(c, BIALY) >= 3) || akcent;
  for (let i = 0; i < 6 && kontrast(cta, BIALY) < 3; i++) cta = miks(cta, CZARNY, 0.15);
  if (kontrast(akcent, BIALY) < 2) uwagi.push("Akcent jest bardzo jasny: na białym boksie słowa kluczowe będą słabo widoczne. Sprawdź podgląd.");
  return {
    kolory: {
      akcent: hex(akcent), akcent_2: hex(akcent2), tekst: hex(tekst), tlo_jasne: hex(tlo), nude: hex(nude), bialy: "#FFFFFF",
      granat: hex(granat), tekst_2: hex(tekst2), zloto_jasne: hex(miks(akcent, BIALY, 0.35)), cta: hex(cta),
      mocny: hex(miks(tekst, CZARNY, 0.45)), akwarela: hex(miks(akcent2, BIALY, 0.6)),
    },
    paleta: sort(C, (e) => e.n + e.marka * 2).slice(0, 14).map((e) => e.hex),
    uwagi,
  };
}

// --- fonty ---
const GENERYCZNE = /^(inherit|initial|unset|sans-serif|serif|monospace|cursive|fantasy|system-ui|-apple-system|blinkmacsystemfont|segoe ui|roboto|helvetica neue|helvetica|arial|ui-sans-serif|ui-serif|apple color emoji|segoe ui emoji|segoe ui symbol|noto color emoji|var\(.*|dashicons|fontawesome|font awesome.*|icomoon|eicons|star|swiper-icons|wpz-.*)$/i;
function zbierzFonty(css, html) {
  const licz = { naglowki: new Map(), tekst: new Map(), wszystkie: new Map() };
  const plus = (m, n, w) => m.set(n, (m.get(n) || 0) + w);
  for (const [, sel, blok] of css.matchAll(/([^{}]*)\{([^{}]*)\}/g)) {
    const m = blok.match(/font-family\s*:\s*([^;]+)/i); if (!m) continue;
    const n = m[1].split(",").map((x) => x.trim().replace(/^["']|["']$/g, "").replace(/\s*!important$/, "")).find((x) => x && !GENERYCZNE.test(x));
    if (!n || /^var\(/.test(n)) continue;
    plus(licz.wszystkie, n, 1);
    if (/(^|[\s,>])h[1-3]\b|title|heading|headline|naglow/i.test(sel)) plus(licz.naglowki, n, 3);
    if (/(^|[\s,])(body|html|p)\b(?![-\w])/i.test(sel)) plus(licz.tekst, n, 3);
  }
  const google = [];
  for (const [, href] of html.matchAll(/fonts\.googleapis\.com\/css2?\?([^"'\s>]+)/gi)) {
    for (const [, f] of href.replace(/&amp;/g, "&").matchAll(/family=([^&:]+)/g)) google.push(decodeURIComponent(f.replace(/\+/g, " ")).split("|")[0].trim());
  }
  const naj = (m) => [...m.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  return { naglowki: naj(licz.naglowki) || naj(licz.wszystkie) || google[0], tekst: naj(licz.tekst) || naj(licz.wszystkie) || google[1] || google[0], google };
}
const SZERYFOWE = /serif|garamond|playfair|lora|baskerville|bodoni|didot|cormorant|libre|merriweather|times|georgia|prata|marcellus|cinzel|dm serif|abril|gilda|italiana/i;
/** Czy font jest w Google Fonts z polskimi znakami (latin-ext)? Render HyperFrames pobiera fonty po nazwie z Google Fonts. */
async function fontGoogle(nazwa) {
  if (!nazwa) return false;
  try {
    const r = await fetch(`https://fonts.googleapis.com/css2?family=${encodeURIComponent(nazwa).replace(/%20/g, "+")}&display=swap`, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(8000) });
    return r.ok && /latin-ext/.test(await r.text());
  } catch { return false; }
}

// --- logo ---
const srcImg = (tag) => atr(tag, "src") || atr(tag, "data-src") || atr(tag, "data-lazy-src") || (atr(tag, "srcset") || "").split(/\s+/)[0];
function kandydaciLogo(html, baza) {
  const out = [];
  const naglowek = (html.match(/<header[\s\S]*?<\/header>/i) || [""])[0];
  const dom = new URL(baza);
  // 1. link do strony głównej (zwykle logo w nagłówku) albo element z klasą logo/brand: obrazek albo wbudowany SVG
  for (const [, otw, wnetrze] of html.matchAll(/(<a\b[^>]*>)([\s\S]{0,6000}?)<\/a>/gi)) {
    const href = atr(otw, "href") || "";
    const u = absolutny(href, baza);
    const U = u && new URL(u);
    const glowna = U && U.host === dom.host && !U.hash && (/^\/(index\.\w+|pl\/?|en\/?)?$/.test(U.pathname) || U.pathname === dom.pathname);
    const klasa = /logo|brand/i.test(`${atr(otw, "class") || ""} ${atr(otw, "id") || ""} ${atr(otw, "aria-label") || ""}`);
    if (!glowna && !klasa) continue;
    const w = (glowna ? 12 : 0) + (klasa ? 8 : 0) + (naglowek.includes(otw) ? 4 : 0);
    const img = wnetrze.match(/<img\b[^>]*>/i)?.[0];
    if (img && srcImg(img) && !/^data:/.test(srcImg(img))) out.push({ url: absolutny(srcImg(img), baza), w, skad: "logo w nagłówku strony" });
    const svg = wnetrze.match(/<svg\b[\s\S]*?<\/svg>/i)?.[0];
    if (svg && svg.length > 300) out.push({ svg, w: w - 1, skad: "logo w nagłówku strony (SVG)" });
  }
  // 2. obrazki z „logo” w nazwie, klasie albo alt (bez logotypów partnerów i klientów)
  for (const [tag] of html.matchAll(/<img\b[^>]*>/gi)) {
    const src = srcImg(tag);
    if (!src || /^data:/.test(src)) continue;
    const opis = `${src} ${atr(tag, "alt") || ""} ${atr(tag, "class") || ""} ${atr(tag, "id") || ""}`;
    let w = /logo/i.test(opis) ? 10 : 0;
    if (naglowek.includes(tag)) w += 4;
    if (/logos\/|partner|client|klient|award|nagrod|sponsor|press|media|hero|banner|\d{3,4}x\d{3,4}/i.test(src)) w -= 8;
    if (w >= 4) out.push({ url: absolutny(src, baza), w, skad: "obrazek na stronie" });
  }
  for (const [tag] of html.matchAll(/<link\b[^>]*>/gi)) {
    const rel = (atr(tag, "rel") || "").toLowerCase(), href = atr(tag, "href");
    if (!href) continue;
    if (rel.includes("apple-touch-icon")) out.push({ url: absolutny(href, baza), w: 3, skad: "ikona strony" });
    else if (rel.includes("icon") && /(192|256|512)/.test(atr(tag, "sizes") || href)) out.push({ url: absolutny(href, baza), w: 2.5, skad: "ikona strony" });
  }
  for (const [tag] of html.matchAll(/<meta\b[^>]*>/gi)) {
    if (/og:logo/i.test(atr(tag, "property") || "")) out.push({ url: absolutny(atr(tag, "content") || "", baza), w: 8, skad: "og:logo" });
  }
  return out.filter((k) => k.url || k.svg).sort((a, b) => b.w - a.w);
}
const EXT_TYPU = { "image/png": ".png", "image/svg+xml": ".svg", "image/webp": ".webp", "image/jpeg": ".jpg" };

/** Zestaw stylistyki ze strony www. Zwraca dane do zapisu (nic nie zapisuje) + logo jako bufor. */
export async function stylZeStrony(adres) {
  let url = String(adres || "").trim();
  if (!/^https?:\/\//i.test(url)) url = "https://" + url;
  try { url = new URL(url).href; } catch { throw new Error("To nie wygląda na adres strony."); }
  const strona = await pobierz(url);
  if (!/html/i.test(strona.typ) && !/<html/i.test(strona.tekst)) throw new Error("Pod tym adresem nie ma strony HTML.");
  const html = strona.tekst, baza = strona.url;
  let css = [...html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => m[1]).join("\n");
  css += "\n" + [...html.matchAll(/\sstyle\s*=\s*"([^"]*)"/gi)].map((m) => `x{${m[1].replace(/&quot;/g, '"')}}`).join("\n");
  const arkusze = [...html.matchAll(/<link\b[^>]*>/gi)].map((m) => m[0]).filter((t) => /stylesheet/i.test(atr(t, "rel") || "") && atr(t, "href"))
    .map((t) => absolutny(atr(t, "href"), baza)).filter((u) => u && !/fonts\.googleapis|font-?awesome|dashicons|bootstrap(\.min)?\.css|jquery-ui/i.test(u)).slice(0, 10);
  const pominiete = [];
  await Promise.all(arkusze.map(async (u) => { try { css += "\n" + (await pobierz(u, { max: 3e6 })).tekst; } catch { pominiete.push(u); } }));
  css = css.replace(/\/\*[\s\S]*?\*\//g, "").replace(/@media[^{]*\{/g, "").replace(/@(font-face|keyframes|-webkit-keyframes)[^{]*\{[^{}]*(\{[^{}]*\}[^{}]*)*\}/g, "");

  const theme = (html.match(/<meta[^>]+name=["']theme-color["'][^>]*>/i) || [""])[0];
  const R = roleKolorow(zbierzKolory(css, theme ? atr(theme, "content") : null));
  const F = zbierzFonty(css, html);
  const uwagi = [...R.uwagi];
  const fonty = {};
  for (const [rola, zap] of [["naglowki", "Playfair Display"], ["tekst", "Montserrat"]]) {
    const n = F[rola];
    if (n && (await fontGoogle(n))) fonty[rola] = n;
    else {
      const z = rola === "naglowki" ? (SZERYFOWE.test(n || "") || !n ? zap : "Poppins") : (SZERYFOWE.test(n || "") ? "Lora" : zap);
      fonty[rola] = z;
      if (n) uwagi.push(`Font „${n}” (${rola === "naglowki" ? "nagłówki" : "tekst"}) nie jest w Google Fonts z polskimi znakami, dałam „${z}”. Masz plik fontu z licencją? Wrzuć go do 02_BRAND/fonty.`);
    }
  }
  const tytul = (html.match(/<title[^>]*>([^<]*)<\/title>/i) || [])[1] || "";
  const og = (html.match(/<meta[^>]+property=["']og:site_name["'][^>]*>/i) || [""])[0];
  const nazwa = (og && atr(og, "content")) || tytul.split(/\s[|–—-]\s/)[0].trim() || new URL(baza).hostname.replace(/^www\./, "");
  const ig = (html.match(/instagram\.com\/([A-Za-z0-9_.]{2,30})/i) || [])[1];
  const instagram = ig && !/^(p|reel|explore|accounts|stories)$/i.test(ig) ? "@" + ig.replace(/\.$/, "") : "";

  let logo = null;
  for (const k of kandydaciLogo(html, baza).slice(0, 5)) {
    if (k.svg) {
      // wbudowany SVG: currentColor = kolor tekstu marki, wymiary z viewBox
      let s = k.svg.replace(/currentColor/g, R.kolory.tekst);
      if (!/xmlns=/.test(s)) s = s.replace("<svg", '<svg xmlns="http://www.w3.org/2000/svg"');
      if (/<use\b[^>]*href=["']#/.test(s)) continue;
      logo = { ext: ".svg", buf: Buffer.from(s), url: baza, skad: k.skad };
      break;
    }
    try {
      const p = await pobierz(k.url, { tekst: false, max: 5e6 });
      const typ = p.typ.split(";")[0].trim();
      const ext = EXT_TYPU[typ] || (/\.svg(\?|$)/i.test(k.url) ? ".svg" : null);
      if (!ext || p.buf.length < 200) continue;
      logo = { ext, buf: p.buf, url: k.url, skad: k.skad };
      break;
    } catch {}
  }
  if (!logo) uwagi.push("Nie znalazłam logo na stronie. Wgraj je ręcznie (PNG z przezroczystym tłem albo SVG).");
  else if (logo.ext === ".jpg") uwagi.push("Logo ze strony jest w JPG (z tłem). Lepiej wgrać PNG z przezroczystym tłem.");
  if (pominiete.length) uwagi.push(`Nie udało się pobrać ${pominiete.length} arkuszy CSS, kolory mogą być niepełne.`);

  return {
    dane: { nazwa: nazwa.slice(0, 60), opis: `Ze strony ${new URL(baza).hostname}`, zrodlo: "strona", url: baza, kolory: R.kolory, fonty,
      gabinet: { nazwa: nazwa.slice(0, 60), instagram }, ruch: "miekki", napisy: "perla", uwagi },
    paleta: R.paleta, fonty_strony: { naglowki: F.naglowki || null, tekst: F.tekst || null }, logo,
  };
}

// --- CLI ---
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const a = process.argv.slice(2);
  const opt = (n) => { const i = a.indexOf(n); return i >= 0 ? a[i + 1] : undefined; };
  if (a.includes("--strona")) {
    try {
      const W = await stylZeStrony(opt("--strona"));
      if (opt("--nazwa")) W.dane.nazwa = opt("--nazwa");
      const s = nowyStyl(W.dane);
      if (W.logo) zapiszPlikStylu(s.id, "logo", W.logo.ext, W.logo.buf);
      ok(`Stylistyka „${s.nazwa}” zapisana: 02_BRAND/style/${s.id}/`);
      info(`Kolory: ${Object.entries(s.kolory).map(([k, v]) => `${k} ${v}`).join(", ")}`);
      info(`Fonty: ${s.fonty.naglowki} / ${s.fonty.tekst}${W.logo ? `, logo: ${W.logo.skad}` : ""}`);
      for (const u of s.uwagi || []) uwaga(u);
      info(`Rolka: rolka.json -> "styl": "${s.id}"`);
    } catch (e) { blad(`Nie udało się odczytać strony: ${e.message}`, "Sprawdź adres (np. https://twojgabinet.pl) i połączenie z internetem."); }
  } else {
    for (const s of listaStylow()) info(`${s.dla_nowych ? "★" : " "} ${s.id.padEnd(22)} ${s.nazwa}  ${s.kolory.akcent || ""}  ${s.fonty.naglowki}/${s.fonty.tekst}${s.logo ? "  logo" : ""}`);
  }
}

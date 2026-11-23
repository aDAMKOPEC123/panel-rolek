// Mapa twarzy: wspólne funkcje dla scripts/twarz.mjs (CLI) i scripts/zloz.mjs (kotwice w montażu).
// Dane liczy scripts/twarz.py (MediaPipe Face Landmarker), cache: kompozycja/twarz/<ścieżka klipu>.json.
// Kotwice (piksele 1080x1920, „lewa/prawa” = na ekranie, względem osi twarzy):
//   brew_<s>_poczatek | brew_<s>_luk | brew_<s>_koniec | brew_<s>_srodek, oko_<s>, oko_<s>_wew, oko_<s>_zew, oko_<s>_dol,
//   rzesy_<s> (środek górnej powieki), teczowka_<s>, nos_<s> (skrzydełko nosa), brwi, oczy, nos, usta, usta_lewa,
//   usta_prawa, czolo, broda, twarz   (s = lewa | prawa). Kontury: brew_<s> (obrys brwi), rzesy_<s> (linia powieki).
import fs from "node:fs";
import path from "node:path";
import { ROOT, uruchom } from "./lib.mjs";

export const KOTWICE_TWARZY = {
  brwi: "obie brwi (środek)", brew_lewa_luk: "łuk lewej brwi", brew_prawa_luk: "łuk prawej brwi",
  brew_lewa_poczatek: "początek lewej brwi", brew_prawa_poczatek: "początek prawej brwi",
  brew_lewa_koniec: "ogon lewej brwi", brew_prawa_koniec: "ogon prawej brwi", brew_lewa_srodek: "lewa brew", brew_prawa_srodek: "prawa brew",
  oczy: "oczy", oko_lewa: "lewe oko", oko_prawa: "prawe oko", rzesy_lewa: "rzęsy lewego oka", rzesy_prawa: "rzęsy prawego oka",
  oko_lewa_dol: "pod lewym okiem", oko_prawa_dol: "pod prawym okiem", nos: "nos", usta: "usta", czolo: "czoło", broda: "broda", twarz: "cała twarz",
};
export const plikTwarzy = (proj, src) => path.join(proj, "kompozycja", "twarz", String(src).replace(/[\\/:]+/g, "__") + ".json");

// Analiza (z cache). Zwraca dane albo { blad }.
export function mapaTwarzy(proj, src, { force = false, od, do: doo } = {}) {
  const zr = path.join(proj, src), pj = plikTwarzy(proj, src);
  if (!fs.existsSync(zr)) return { blad: `nie ma pliku ${src}` };
  const swiezy = fs.existsSync(pj) && fs.statSync(pj).mtimeMs >= fs.statSync(zr).mtimeMs;
  if (!force && swiezy) { try { return JSON.parse(fs.readFileSync(pj, "utf8")); } catch {} }
  fs.mkdirSync(path.dirname(pj), { recursive: true });
  const py = process.platform === "win32" ? "python" : "python3";
  const a = [path.join(ROOT, "scripts", "twarz.py"), zr, pj];
  if (od != null) a.push("--od", String(od));
  if (doo != null) a.push("--do", String(doo));
  const r = uruchom(py, a, { cicho: true, timeout: 15 * 60 * 1000 });
  if (r.code !== 0) return { blad: (r.stderr || r.stdout || "").trim().split("\n").slice(-3).join(" ") || `kod ${r.code}` };
  try { return JSON.parse(fs.readFileSync(pj, "utf8")); } catch (e) { return { blad: e.message }; }
}

// Klatki z twarzą w oknie czasu klipu [od, do] (zdjęcie: jedna klatka rozciągnięta na całe okno).
export function klatkiTwarzy(d, od, doo) {
  const ok = (d?.klatki || []).filter((k) => k.ok);
  if (!ok.length) return [];
  if (d.zdjecie) return [{ ...ok[0], t: od }, { ...ok[0], t: doo }];
  return ok.filter((k) => k.t >= od - 0.05 && k.t <= doo + 0.05);
}
const wartosc = (k, nazwa) => k.kot?.[nazwa] || k.kon?.[nazwa] || null;
export const maKotwice = (d, nazwa) => (d?.klatki || []).some((k) => k.ok && wartosc(k, nazwa));
// Punkty kotwicy w oknie: [{ t, x, y }] (format plików śledzenia).
export function punktyKotwicy(d, nazwa, od, doo) {
  return klatkiTwarzy(d, od, doo).filter((k) => k.kot?.[nazwa]).map((k) => ({ t: k.t, x: k.kot[nazwa][0], y: k.kot[nazwa][1] }));
}
// Pozycja kotwicy w chwili t (najbliższa klatka) albo mediana w oknie [od, do].
export function pozycjaKotwicy(d, nazwa, od, doo = od) {
  const kl = klatkiTwarzy(d, od - 0.3, doo + 0.3).filter((k) => k.kot?.[nazwa]);
  if (!kl.length) return null;
  if (doo === od) { const k = kl.reduce((a, b) => (Math.abs(b.t - od) < Math.abs(a.t - od) ? b : a)); return { x: k.kot[nazwa][0], y: k.kot[nazwa][1] }; }
  const med = (v) => { const s = [...v].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };
  return { x: med(kl.map((k) => k.kot[nazwa][0])), y: med(kl.map((k) => k.kot[nazwa][1])) };
}
// Wysokość twarzy w oknie (px), do dobierania skali ozdób.
export function wielkoscTwarzy(d, od, doo) {
  const kl = klatkiTwarzy(d, od, doo);
  if (!kl.length) return 0;
  const h = kl.map((k) => k.box[3] - k.box[1]).sort((a, b) => a - b);
  return h[Math.floor(h.length / 2)];
}

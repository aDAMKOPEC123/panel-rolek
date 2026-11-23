// Licencja panelu: aplikacja działa dopiero po wpisaniu kodu od autora.
// W repozytorium są tylko skróty kodów (scrypt z solą, licencja/kody.json), nigdy same kody. Kod wpisany w panelu
// (ekran aktywacji) zapisuje się lokalnie w .licencja.json (poza gitem). Bez ważnego kodu: panel blokuje całe API,
// a skrypty z scripts/ uruchamiane z konsoli kończą się błędem (lib.mjs -> wymagajLicencji).
// Uczciwie: to zabezpieczenie aplikacji uruchamianej lokalnie. Osoba z dostępem do kodu źródłowego może je usunąć,
// dlatego repozytorium jest prywatne; same kody da się przekazać, ale nie da się ich odczytać ani wygenerować z repo.
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const KODY = path.join(ROOT, "licencja", "kody.json");
const AKTYWACJA = path.join(ROOT, ".licencja.json");
const N = 2 ** 15, R = 8, P = 1, DL = 32; // scrypt: ok. 50 ms na sprawdzenie (spowalnia zgadywanie)

export const normalizuj = (kod) => String(kod || "").toUpperCase().replace(/[^A-Z0-9]/g, "").replace(/^ROLKI/, "");
const skrot = (kod, sol) => crypto.scryptSync(normalizuj(kod), Buffer.from(sol, "base64"), DL, { N, r: R, p: P, maxmem: 64 * 1024 * 1024 }).toString("base64");

function listaSkrotow() {
  try { const j = JSON.parse(fs.readFileSync(KODY, "utf8")); return { sol: j.sol, skroty: new Set(j.skroty || []), uniewaznione: new Set(j.uniewaznione || []) }; }
  catch { return null; }
}
/** Czy kod jest prawidłowy (i nie unieważniony)? Porównanie po skrócie, bez trzymania kodów w repozytorium. */
export function sprawdzKod(kod) {
  const L = listaSkrotow();
  if (!L || normalizuj(kod).length !== 12) return false;
  const s = skrot(kod, L.sol);
  if (L.uniewaznione.has(s)) return false;
  // porównanie w stałym czasie z każdym skrótem
  let ok = false;
  const bs = Buffer.from(s);
  for (const x of L.skroty) { const bx = Buffer.from(x); if (bx.length === bs.length && crypto.timingSafeEqual(bx, bs)) ok = true; }
  return ok;
}
const komputer = () => crypto.createHash("sha256").update([os.hostname(), os.platform(), os.userInfo().username].join("|")).digest("hex").slice(0, 16);

let pamiec = null; // { ok, czas } — sprawdzenie raz na 60 s (scrypt jest celowo wolny)
/** Stan licencji na tym komputerze. */
export function stanLicencji() {
  if (pamiec && Date.now() - pamiec.czas < 60e3) return pamiec.stan;
  let stan = { aktywna: false };
  try {
    const a = JSON.parse(fs.readFileSync(AKTYWACJA, "utf8"));
    if (a.kod && sprawdzKod(a.kod)) stan = { aktywna: true, kod: `ROLKI-••••-••••-${normalizuj(a.kod).slice(8)}`, aktywowano: a.aktywowano, komputer: a.komputer === komputer() ? "ten" : "inny" };
    else stan = { aktywna: false, powod: "Zapisany kod jest nieprawidłowy albo został unieważniony." };
  } catch {}
  pamiec = { czas: Date.now(), stan };
  return stan;
}
export const maLicencje = () => stanLicencji().aktywna;

const proby = [];
/** Aktywacja kodem z panelu. Maks. 5 prób na minutę. */
export function aktywuj(kod) {
  const teraz = Date.now();
  while (proby.length && teraz - proby[0] > 60e3) proby.shift();
  if (proby.length >= 5) throw new Error("Za dużo prób. Odczekaj minutę i spróbuj ponownie.");
  proby.push(teraz);
  if (!sprawdzKod(kod)) throw new Error("Ten kod jest nieprawidłowy. Sprawdź, czy przepisałaś go dokładnie (np. ROLKI-ABCD-EFGH-JKLM).");
  const n = normalizuj(kod);
  fs.writeFileSync(AKTYWACJA, JSON.stringify({ kod: `ROLKI-${n.slice(0, 4)}-${n.slice(4, 8)}-${n.slice(8)}`, aktywowano: new Date().toISOString(), komputer: komputer() }, null, 2) + "\n");
  pamiec = null;
  return stanLicencji();
}
export function dezaktywuj() { fs.rmSync(AKTYWACJA, { force: true }); pamiec = null; return stanLicencji(); }

/** Dla skryptów uruchamianych z konsoli: bez licencji kończy z komunikatem. */
export function wymagajLicencji() {
  if (maLicencje()) return;
  console.error("\n✗ Panel rolek nie jest aktywowany.\n  Uruchom panel (Uruchom panel.bat) i wpisz kod licencyjny od autora.\n");
  process.exit(3);
}

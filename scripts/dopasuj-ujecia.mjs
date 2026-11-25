import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { ROOT, IS_WIN, ROZSZ_WIDEO, uruchom, zapiszJSONAtomowo } from "./lib.mjs";

const plikMapy = (p) => path.join(p, "kompozycja", "dopasowania-ujec.json");
const bezRozszerzenia = (n) => path.parse(n).name.toLowerCase();
const lista = (v) => Array.isArray(v) ? v : [];

function daneWejsciowe(projekt, P) {
  const proxy = path.join(projekt, "proxy");
  const klipy = (fs.existsSync(proxy) ? fs.readdirSync(proxy, { withFileTypes: true }) : [])
    .filter((n) => n.isFile() && !n.name.startsWith(".") && ROZSZ_WIDEO.test(n.name)).map((n) => n.name).sort();
  const materialy = new Map(lista(P?.materialy).filter((m) => m?.id).map((m) => [m.id, m]));
  const sceny = lista(P?.scenariusz).flatMap((s, i) => {
    if (!s) return [];
    const m = materialy.get(s.material);
    const nagrac = String(s.co_widac || m?.opis || "").trim().slice(0, 250);
    if (nagrac.length < 2) return [];
    const nazwy = [m?.nazwa_pliku, ...lista(m?.pliki), m?.id].filter((n) => typeof n === "string" && n).map(bezRozszerzenia);
    const przypisane = klipy.filter((k) => nazwy.some((n) => bezRozszerzenia(k) === n || bezRozszerzenia(k).startsWith(`${n}_`)));
    return [{ i, nagrac, przypisane }];
  });
  const wersje = klipy.map((n) => {
    const s = fs.statSync(path.join(proxy, n), { throwIfNoEntry: false });
    return [n, s?.size, s?.mtimeMs];
  });
  const podpis = crypto.createHash("sha256").update(JSON.stringify([sceny, wersje])).digest("hex");
  return { sceny, podpis, klipy };
}

export function wczytajDopasowaniaUjec(projekt, P) {
  try {
    const mapa = JSON.parse(fs.readFileSync(plikMapy(projekt), "utf8"));
    if (Array.isArray(mapa.sceny) && mapa.podpis === daneWejsciowe(projekt, P).podpis) return mapa;
  } catch {}
  return null;
}

function wyszukajLokalnie(projekt, opisy) {
  const proces = spawnSync(IS_WIN ? "python" : "python3", ["-X", "utf8", path.join(ROOT, "scripts", "szukaj-ujec.py"), projekt, "--sceny"],
    { input: JSON.stringify(opisy), encoding: "utf8", timeout: 180_000, maxBuffer: 8 * 1024 * 1024, windowsHide: true });
  const wynik = proces.stdout?.split(/\r?\n/).find((l) => l.startsWith("WYNIKI "));
  if (proces.status !== 0 || !wynik) {
    throw new Error(proces.stderr?.split(/\r?\n/).find((l) => l.startsWith("✗ BŁĄD: "))?.slice("✗ BŁĄD: ".length) || "Indeks obrazu jest niedostępny. Sprawdź wyszukiwarkę ujęć.");
  }
  return JSON.parse(wynik.slice("WYNIKI ".length)).wyniki;
}

function pierwszyFragment(projekt, plik) {
  const p = uruchom("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path.join(projekt, "proxy", plik)], { cicho: true, timeout: 8000 });
  const czas = Math.min(2.4, Number(p.stdout.trim()));
  return p.code === 0 && czas > 0 ? { src: `proxy/${plik}`, od: 0, do: czas, klatka: czas / 2, zrodlo: "przypisanie" } : null;
}

export function dopasujUjecia(projekt, P, { odswiez = false, szukaj = wyszukajLokalnie } = {}) {
  const zapis = odswiez ? null : wczytajDopasowaniaUjec(projekt, P);
  if (zapis && !zapis.uwaga) return zapis;
  const { sceny, podpis, klipy } = daneWejsciowe(projekt, P);
  const przypisania = new Map();
  let kandydaci = [], uwaga = "";
  if (sceny.length && klipy.length) {
    try { kandydaci = szukaj(projekt, sceny.map((s) => s.nagrac)); } catch (e) { uwaga = e.message; }
  }
  const mapa = { podpis, uwaga, sceny: sceny.map(({ i, nagrac, przypisane }, indeks) => {
    const trafienia = Array.isArray(kandydaci?.[indeks]) ? kandydaci[indeks] : [];
    const pewne = trafienia.filter((u) => przypisane.includes(u.src?.slice(6)));
    if (przypisane.length && !pewne.length) {
      const nazwa = przypisane[0];
      if (!przypisania.has(nazwa)) przypisania.set(nazwa, pierwszyFragment(projekt, nazwa));
      if (przypisania.get(nazwa)) pewne.push(przypisania.get(nazwa));
    }
    const ujecia = [...pewne, ...trafienia.filter((u) => !pewne.includes(u))].filter((u) =>
      typeof u.src === "string" && klipy.includes(u.src.slice(6)) && u.src.startsWith("proxy/") &&
      [u.od, u.do, u.klatka].every(Number.isFinite) && u.od >= 0 && u.do > u.od && u.klatka >= u.od && u.klatka <= u.do)
      .slice(0, 3).map((u) => ({ ...u, zrodlo: przypisane.includes(u.src.slice(6)) ? "przypisanie" : "indeks" }));
    return { i, nagrac, ujecia };
  }) };
  fs.mkdirSync(path.dirname(plikMapy(projekt)), { recursive: true });
  zapiszJSONAtomowo(plikMapy(projekt), mapa);
  return mapa;
}

export function miniaturyDlaRezyserii(projekt, dopasowania, sceny) {
  const katalog = fs.mkdtempSync(path.join(os.tmpdir(), "rezyseria-ai-"));
  const pliki = [], plikiSrc = new Map();
  try {
    for (const { i, ujecia } of dopasowania?.sceny || []) {
      if (!sceny.includes(i)) continue;
      for (const u of ujecia.slice(0, 2)) {
        if (pliki.length >= 18) break;
        const klucz = `${u.src}:${u.klatka}`;
        let plik = plikiSrc.get(klucz);
        if (!plik) {
          if (!/^proxy\/[^/\\]+$/.test(u.src) || !fs.existsSync(path.join(projekt, u.src))) continue;
          plik = `scena-${i + 1}-${plikiSrc.size + 1}.jpg`;
          const r = uruchom("ffmpeg", ["-v", "error", "-ss", String(u.klatka), "-i", path.join(projekt, u.src), "-vf", "scale=320:320:force_original_aspect_ratio=decrease", "-frames:v", "1", path.join(katalog, plik)], { cicho: true, timeout: 8000 });
          if (r.code !== 0 || !fs.existsSync(path.join(katalog, plik))) continue;
          plikiSrc.set(klucz, plik);
        }
        pliki.push({ scena: i + 1, plik, src: u.src, od: u.od, do: u.do });
      }
    }
    return { katalog, pliki };
  } catch (e) {
    zakonczMiniatury(katalog);
    throw e;
  }
}

export function zakonczMiniatury(katalog) {
  for (const p of fs.readdirSync(katalog)) fs.unlinkSync(path.join(katalog, p));
  fs.rmdirSync(katalog);
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  try {
    const projekt = process.argv[2];
    const P = JSON.parse(fs.readFileSync(path.join(projekt, "scenariusz.json"), "utf8"));
    const mapa = dopasujUjecia(projekt, P, { odswiez: process.argv.includes("--odswiez") });
    if (mapa.uwaga) console.log(`! ${mapa.uwaga}`);
    console.log(`✓ Sceny z kandydatami do montażu: ${mapa.sceny.filter((s) => s.ujecia.length).length}/${mapa.sceny.length}.`);
  } catch (e) { console.error(`✗ BŁĄD: ${e.message}`); process.exitCode = 1; }
}

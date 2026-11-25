import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { ROOT, znajdzProjekt, uruchom, wczytajConfig, ffprobe, glosnosc, katalogProbyMontazu, nastepnaWersja, ustawWBrief, znacznikiKontroli } from "./lib.mjs";
import { claudeJson } from "./claude-json.mjs";
import { zapiszDokumentRezyserii } from "./rezyseruj.mjs";
import { kontekstAI, promptKontekstuAI } from "./kontekst-ai.mjs";
import { wczytajDopasowaniaUjec } from "./dopasuj-ujecia.mjs";

const czytaj = (p) => JSON.parse(fs.readFileSync(p, "utf8"));
const plikRolki = (p) => path.join(p, "kompozycja", "rolka.json");
const nazwaRaportu = "audyt-autopilota.json";
const limitRund = 2;
const ruch = ["bodziec", "punch_in", "emoji", "rozmycie_ruchu", "dzwieki"];
const typy = ["napisy_od_dolu", "glosnosc", "glosnosc_muzyki", ...ruch];
const obiekt = (properties) => ({ type: "object", additionalProperties: false, required: Object.keys(properties), properties });
const tekst = (maxLength) => ({ type: "string", maxLength });
const schema = obiekt({
  ocena: { type: "integer", minimum: 0, maximum: 100 },
  podsumowanie: tekst(400),
  uwagi: { type: "array", maxItems: 5, items: obiekt({
    od: { type: "number" }, do: { type: "number" }, co: tekst(240), zalecenie: tekst(240),
  }) },
  poprawki: { type: "array", maxItems: 4, items: obiekt({ typ: { type: "string", enum: typy }, wartosc: { type: "number" } }) },
});

export function podpisMontazuAutopilota(proj) {
  const hash = crypto.createHash("sha256");
  const r = czytaj(plikRolki(proj));
  const { znaczniki, ...montaz } = r;
  hash.update(JSON.stringify(montaz));
  const zaleznosci = ["scenariusz.json", r.napisy?.plik, ...Object.values(r.napisy?.zrodla || {}),
    r.voiceover?.src, r.muzyka?.src, r.zajawka?.src, ...(r.ujecia || []).flatMap((u) => [u.src, ...(u.przebitki || []).map((b) => b.src)]),
    ...(r.sceny || []).flatMap((s) => Object.values(s.media || {}))];
  for (const f of new Set(zaleznosci.filter((s) => typeof s === "string" && s))) {
    hash.update(f);
    const m = fs.statSync(path.resolve(proj, f), { throwIfNoEntry: false });
    if (m?.isFile()) hash.update(`${m.size}:${m.mtimeMs}`);
  }
  return hash.digest("hex");
}

export function stanAudytuAutopilota(proj) {
  try {
    const raport = czytaj(path.join(proj, "kompozycja", nazwaRaportu));
    const jestPlik = /^render\/[^\\/]+\.mp4$/i.test(raport.plik || "") && fs.existsSync(path.join(proj, raport.plik));
    return { ...raport, aktualny: jestPlik && raport.podpis === podpisMontazuAutopilota(proj) };
  } catch { return null; }
}

function uruchomSkrypt(id, args) {
  const r = uruchom(process.execPath, [path.join(ROOT, "scripts", id + ".mjs"), ...args], { cicho: true, timeout: 45 * 60 * 1000 });
  if (r.code !== 0) {
    const caly = r.stdout + "\n" + r.stderr;
    const blad = caly.match(/✗ BŁĄD:[^\n]*(?:\n[^\n]*Co zrobić:[^\n]*)?/);
    throw new Error(`${id}: ${blad?.[0] || caly.trim().slice(-450) || "proces nie ukończył pracy"}`);
  }
  return r.stdout;
}

function proponowaneZmiany(rolka, audyt, cfg) {
  const r = structuredClone(rolka), poprawki = [...(audyt.recenzja?.poprawki || [])];
  const napisy = r.napisy?.wlacz !== false && (r.napisy?.plik || Object.keys(r.napisy?.zrodla || {}).length);
  const dol = Number(cfg.safe_zone?.dol ?? 420);
  const pozycja = Number(r.napisy?.od_dolu ?? cfg.safe_zone?.napisy_od_dolu ?? 620);
  if (napisy && pozycja < dol && audyt.obraz.problemy.some((p) => p.typ === "strefa_ig" && p.opis.includes("na dole"))) {
    poprawki.unshift({ typ: "napisy_od_dolu", wartosc: dol + 60 });
  }
  const zmiany = [];
  const zapisane = new Set();
  for (const { typ, wartosc } of poprawki) {
    if (!Number.isFinite(wartosc) || zapisane.has(typ)) continue;
    if (typ === "napisy_od_dolu" && napisy && wartosc >= dol && wartosc <= 960 && pozycja !== wartosc) {
      r.napisy.od_dolu = wartosc;
      zmiany.push(`Napisy · ${wartosc} px od dołu`);
    } else if (typ === "glosnosc" && audyt.dzwiek.lufs != null && wartosc >= 0.55 && wartosc <= 1.5 && wartosc !== Number(r.glosnosc ?? 1)) {
      r.glosnosc = wartosc;
      zmiany.push(`Głośność rolki ×${wartosc}`);
    } else if (typ === "glosnosc_muzyki" && r.muzyka?.src && wartosc >= 0 && wartosc < Number(r.muzyka.glosnosc ?? 0.18)) {
      r.muzyka.glosnosc = wartosc;
      zmiany.push(`Muzyka · poziom ${wartosc}`);
    } else if (ruch.includes(typ) && wartosc === 0 && r.efekty?.[typ] === true) {
      r.efekty[typ] = false;
      zmiany.push(`Wyłączony efekt · ${typ}`);
    } else continue;
    zapisane.add(typ);
  }
  return { r, zmiany };
}

const problemow = (obraz, waga) => obraz.problemy.filter((p) => p.waga === waga).length;
const kompletny = (obraz) => obraz.zakres.twarze && obraz.zakres.hyperframes;

function czyLepszy(stary, nowy) {
  if (kompletny(stary.obraz) && !kompletny(nowy.obraz)) return false;
  for (const waga of ["krytyczne", "wazne"]) {
    if (problemow(nowy.obraz, waga) > problemow(stary.obraz, waga)) return false;
  }
  if (nowy.obraz.ocena < stary.obraz.ocena || (stary.dzwiek.maAudio && !nowy.dzwiek.maAudio)) return false;
  // Nie zamieniaj szkodliwego miksu na jeszcze głośniejszy.
  if (nowy.dzwiek.truePeak > -0.5 && (stary.dzwiek.truePeak == null || nowy.dzwiek.truePeak > stary.dzwiek.truePeak + 0.1)) return false;
  if (stary.recenzja && nowy.recenzja && nowy.recenzja.ocena < stary.recenzja.ocena - 7
    && problemow(nowy.obraz, "krytyczne") === problemow(stary.obraz, "krytyczne")) return false;
  if (nowy.obraz.ocena > stary.obraz.ocena) return true;
  if (stary.recenzja && nowy.recenzja && nowy.recenzja.ocena >= stary.recenzja.ocena + 5) return true;
  return nowy.dzwiek.lufs != null && stary.dzwiek.lufs != null
    && Math.abs(nowy.dzwiek.lufs - nowy.dzwiek.cel) + 1 < Math.abs(stary.dzwiek.lufs - stary.dzwiek.cel);
}

async function recenzuj(proba, proj, r, obraz, dzwiek, D, generuj) {
  const kat = path.join(proba, "kontrola");
  const klatki = path.join(kat, "przeglad.jpg");
  const coIle = Math.max(0.25, D / 8);
  const f = uruchom("ffmpeg", ["-y", "-v", "error", "-i", path.join(kat, "pelny.mp4"),
    "-vf", `fps=${1 / coIle}:start_time=0,scale=180:320,tile=4x2:padding=4`, "-frames:v", "1", klatki], { cicho: true });
  if (f.code !== 0 || !fs.existsSync(klatki)) throw new Error("Nie udało się przygotować klatek dla recenzentki.");
  const wzor = path.join(proj, "scenariusz.json");
  const dokument = fs.existsSync(wzor) ? czytaj(wzor) : null;
  const sceny = (dokument?.scenariusz || []).slice(0, 24).map((s) => s && [s.od, s.do, s.mowisz, s.co_widac]);
  const brief = kontekstAI({ projekt: proj, dokument, rolka: r, dopasowanie: wczytajDopasowaniaUjec(proj, dokument) });
  const zlozenie = czytaj(path.join(proba, ".zloz.json"));
  const prompt = `Jesteś niezależną montażystką recenzującą wersję roboczą rolki. Użyj Read i obejrzyj przeglad.jpg (klatki od lewej do prawej, wierszami, w odstępie ok. ${coIle.toFixed(2)} s). W tym katalogu są także miniatury wykrytych problemów. Masz pomiar dźwięku i tekst z czasami, nie możesz usłyszeć miksu.
Oceń rzeczywisty obraz i zgodność z wypowiedzią: hook i pierwszy kadr, rytm i oddech, przebitki i sens użycia efektów, czytelność, domknięcie. Podaj tylko istotne uwagi z czasem od/do i konkretną zmianą. Uwzględnij cel i dostępny materiał. Nie wymyślaj ujęć, które rzekomo widziałaś. Pomijaj drobiazgi, jeśli nie poprawią odbioru. Zachowaj lektora, ręczny montaż i zatwierdzone zabiegi. Wynik 100 oznacza brak istotnych uwag w sprawdzonym zakresie.
Autopoprawki tylko: napisy_od_dolu w px (${wczytajConfig().safe_zone?.dol ?? 420}–960), glosnosc (0.55–1.5), glosnosc_muzyki (tylko obniżenie) oraz wyłączenie zbędnego efektu ${ruch.join(", ")} (wartosc 0). To propozycje dopóki analiza wersji po zmianie nie wykaże korzyści. Każdą inną zmianę opisz w uwagach, bez fikcyjnych obietnic. Zwróć JSON.
${promptKontekstuAI(brief)}
Długość ${D}. Dane: ${JSON.stringify({ sceny, obraz: obraz.problemy.slice(0, 20), dzwiek, hook: zlozenie.hookScena, slowa: zlozenie.slowa?.slice(0, 160),
    montaz: r.montaz, format: r.format, ujecia: (r.ujecia || []).map((u) => [u.src, u.od, u.do, u.przejscie_po]), efekty: r.efekty, napisy: r.napisy, muzyka: r.muzyka?.glosnosc })}`;
  const { dane } = await generuj(prompt, schema, { obrazy: kat, timeout: 3 * 60 * 1000 });
  if (!Number.isInteger(dane?.ocena) || dane.ocena < 0 || dane.ocena > 100 || !Array.isArray(dane.uwagi) || !Array.isArray(dane.poprawki)) {
    throw new Error("Recenzentka zwróciła niepełny raport.");
  }
  const uwagi = dane.uwagi.filter((u) => Number.isFinite(u?.od) && Number.isFinite(u.do) && u.od >= 0 && u.do >= u.od && u.od <= D && u.co?.trim() && u.zalecenie?.trim())
    .map((u) => ({ ...u, do: Math.min(D, u.do) })).slice(0, 5);
  return { ocena: dane.ocena, podsumowanie: String(dane.podsumowanie || "").slice(0, 400), uwagi, poprawki: dane.poprawki.filter((p) => typy.includes(p?.typ)).slice(0, 4) };
}

export async function audytAutopilota(proj, generuj = claudeJson) {
  const komp = path.join(proj, "kompozycja");
  const rj = plikRolki(proj);
  const raport = path.join(komp, nazwaRaportu);
  const oryginal = czytaj(rj);
  const podpis = podpisMontazuAutopilota(proj);
  const cfg = wczytajConfig();
  const proby = [], rundy = [];
  let bladAi = "";
  const audyt = async (r) => {
    const flaga = `--audyt=${crypto.randomBytes(8).toString("hex")}`;
    const proba = katalogProbyMontazu(proj, [flaga]);
    fs.mkdirSync(proba, { recursive: true });
    proby.push(proba);
    zapiszDokumentRezyserii(path.join(proba, "rolka.json"), r);
    console.log(`Kontrola próbki ${proby.length}: obraz, układ i dźwięk…`);
    uruchomSkrypt("kontrola-obrazu", [proj, flaga]);
    const obraz = czytaj(path.join(proba, "kontrola-obrazu.json"));
    const plik = path.join(proba, "kontrola", "pelny.mp4");
    const { duration: D, hasAudio: maAudio } = ffprobe(plik);
    const dzwiek = { cel: cfg.audio?.lufs_cel ?? -14, maAudio, ...(maAudio ? glosnosc(plik) : { lufs: null, truePeak: null }) };
    let recenzja = null;
    if (!bladAi) {
      console.log("Niezależna recenzja montażu…");
      try { recenzja = await recenzuj(proba, proj, r, obraz, dzwiek, D, generuj); }
      catch (err) { bladAi = err.message.slice(0, 400); console.log("! Recenzja AI: " + bladAi); }
    }
    return { r, proba, obraz, dzwiek, recenzja };
  };
  try {
    if (!oryginal.ujecia?.length) throw new Error("Brak ułożonych ujęć. Najpierw przygotuj montaż.");
    let najlepszy = await audyt(oryginal);
    const wynikPoczatkowy = najlepszy.obraz.ocena;
    for (let i = 0; i < limitRund; i++) {
      const { r, zmiany } = proponowaneZmiany(najlepszy.r, najlepszy, cfg);
      if (!zmiany.length) break;
      let kandydat;
      try { kandydat = await audyt(r); }
      catch (e) { rundy.push({ zmiany, przyjeta: false, powod: e.message.slice(0, 500) }); break; }
      const przyjeta = czyLepszy(najlepszy, kandydat);
      rundy.push({ zmiany, przyjeta, obraz: kandydat.obraz.ocena, recenzja: kandydat.recenzja?.ocena ?? null });
      if (!przyjeta) break;
      najlepszy = kandydat;
    }
    console.log("Renderuję podgląd wybranej wersji…");
    uruchomSkrypt("render", [proj, `--audyt=${path.basename(najlepszy.proba)}`]);
    const render = path.join(najlepszy.proba, "podglad.mp4");
    const metryka = ffprobe(render);
    const D = czytaj(path.join(najlepszy.proba, ".zloz.json")).dlugosc;
    if (metryka.width !== 1080 || metryka.height !== 1920 || Math.abs(metryka.duration - D) > 0.15
        || Math.abs(metryka.fps - (cfg.rolka?.fps || 30)) > 0.05 || metryka.hasAudio !== najlepszy.dzwiek.maAudio) {
      throw new Error("Parametry wersji roboczej różnią się od sprawdzonej kompozycji (format, długość lub dźwięk).");
    }
    if (podpis !== podpisMontazuAutopilota(proj)) throw new Error("Montaż zmienił się podczas kontroli. Sprawdź aktualną wersję ponownie.");
    const katRenderu = path.join(proj, "render");
    fs.mkdirSync(katRenderu, { recursive: true });
    const v = nastepnaWersja(katRenderu), jakosc = cfg.hyperframes?.jakosc_robocza || "draft";
    const plik = `${path.basename(proj)}_v${v}_${jakosc}.mp4`;
    // Zapis dopiero po udanym renderze. Znaczniki z aktywnego projektu zostają.
    fs.renameSync(render, path.join(katRenderu, plik));
    const stareZnaczniki = czytaj(rj).znaczniki || [];
    const znaczniki = znacznikiKontroli(stareZnaczniki, najlepszy.obraz.problemy);
    if (najlepszy.r !== oryginal || JSON.stringify(znaczniki) !== JSON.stringify(stareZnaczniki)) {
      zapiszDokumentRezyserii(rj, { ...najlepszy.r, znaczniki });
    }
    ustawWBrief(proj, "status", `wersja robocza v${v} (${jakosc})`);
    const obraz = najlepszy.obraz;
    const miniatury = path.join(komp, "kontrola");
    fs.mkdirSync(miniatury, { recursive: true });
    for (const p of obraz.problemy) {
      if (p.obraz) fs.copyFileSync(path.join(najlepszy.proba, "kontrola", p.obraz), path.join(miniatury, p.obraz));
    }
    obraz.data = new Date().toISOString();
    zapiszDokumentRezyserii(path.join(komp, "kontrola-obrazu.json"), obraz);
    const recenzja = najlepszy.recenzja && { ocena: najlepszy.recenzja.ocena, podsumowanie: najlepszy.recenzja.podsumowanie, uwagi: najlepszy.recenzja.uwagi };
    const wynik = { data: obraz.data, podpis: podpisMontazuAutopilota(proj), plik: `render/${plik}`,
      poczatkowy: wynikPoczatkowy, obraz, recenzja, bladAi, rundy, dzwiek: { ...najlepszy.dzwiek, ...(metryka.hasAudio ? glosnosc(path.join(katRenderu, plik)) : {}) } };
    zapiszDokumentRezyserii(raport, wynik);
    return wynik;
  } catch (err) {
    zapiszDokumentRezyserii(raport, { data: new Date().toISOString(), podpis: null, blad: err.message, rundy });
    throw err;
  } finally {
    for (const p of proby) {
      try { fs.rmSync(p, { recursive: true, force: true, maxRetries: 5, retryDelay: 150 }); }
      catch (err) { console.log("! Nie udało się usunąć plików roboczych próby: " + err.code); }
    }
  }
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  try {
    const raport = await audytAutopilota(znajdzProjekt(process.argv[2]));
    console.log(`Kontrola obrazu: ${raport.obraz.ocena}/100, przyjęte rundy: ${raport.rundy.filter((r) => r.przyjeta).length}.`);
  } catch (err) {
    console.error("✗ BŁĄD: " + err.message);
    process.exitCode = 1;
  }
}

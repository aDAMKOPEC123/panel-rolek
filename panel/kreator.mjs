// Kreator pierwszego uruchomienia (panel/public/kreator.js): profil gabinetu w config.json i sprawdzenie programów.
// Nic nie instaluje: przy braku programu panel pokazuje komendę do skopiowania (instalacja to decyzja użytkownika).
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { ROOT, IS_WIN, wczytajConfig, zapiszConfig } from "../scripts/lib.mjs";

const CONFIG = path.join(ROOT, "config.json");
const czytaj = () => JSON.parse(fs.readFileSync(CONFIG, "utf8"));
const pisz = (c) => zapiszConfig(c);
const tekst = (v, n = 80) => (typeof v === "string" ? v.trim().slice(0, n) : "");

/** Profil z kreatora -> config.json (gabinet, cta). Puste pole = "TODO", jak w szablonie configu. */
export function zapiszProfil(d) {
  const c = czytaj();
  const g = (c.gabinet ||= {});
  const pole = (k, n) => { if (d[k] !== undefined) g[k] = tekst(d[k], n) || "TODO"; };
  pole("osoba", 40); pole("nazwa", 80); pole("miasto", 60); pole("tiktok", 60); pole("link_w_bio", 200); pole("obserwujacy_tekst", 120);
  if (d.instagram !== undefined) { const h = tekst(d.instagram, 60).replace(/^https?:\/\/(www\.)?instagram\.com\//i, "").replace(/\/.*$/, ""); g.instagram = h ? (h.startsWith("@") ? h : "@" + h) : "TODO"; }
  if (Array.isArray(d.uslugi)) g.uslugi = d.uslugi.map((x) => tekst(x, 30)).filter(Boolean).slice(0, 12);
  if (d.cta !== undefined && tekst(d.cta)) c.cta = { ...(c.cta || {}), domyslne: tekst(d.cta, 80) };
  pisz(c);
  return c.gabinet;
}
export function oznaczKreator(zrobiony = true) {
  const c = czytaj();
  c.kreator = zrobiony ? { zrobiony: new Date().toISOString() } : {};
  pisz(c);
  return c.kreator;
}
/** Czy pokazać kreator sam: nie był zrobiony (brak znacznika). */
export function stanKreatora() {
  const c = wczytajConfig();
  const g = c.gabinet || {};
  const todo = (v) => !v || /^todo$/i.test(String(v).trim());
  return {
    zrobiony: c.kreator?.zrobiony || null,
    braki: ["osoba", "nazwa", "miasto", "instagram", "tiktok", "link_w_bio"].filter((k) => todo(g[k])),
  };
}

// ---------- programy ----------
function sprawdz(cmd, args, { czas = 20000, shell = false } = {}) {
  return new Promise((ok) => {
    let out = "", done = false;
    let p;
    try { p = spawn(cmd, args, { cwd: ROOT, shell, windowsHide: true }); } catch { return ok({ kod: -1, out: "" }); }
    const t = setTimeout(() => { if (!done) { done = true; try { p.kill(); } catch {} ok({ kod: -2, out }); } }, czas);
    p.stdout?.on("data", (d) => (out += d));
    p.stderr?.on("data", (d) => (out += d));
    p.on("error", () => { if (!done) { done = true; clearTimeout(t); ok({ kod: -1, out }); } });
    p.on("close", (kod) => { if (!done) { done = true; clearTimeout(t); ok({ kod, out }); } });
  });
}
const pierwsza = (s) => String(s || "").trim().split(/\r?\n/)[0].slice(0, 80);
const inst = (win, mac, lin) => (IS_WIN ? win : process.platform === "darwin" ? mac : lin);

/** Lista: {id, nazwa, po_co, ok, wersja, wymagany, jak}. Wymagane blokują montaż, opcjonalne tylko niektóre funkcje. */
export async function sprawdzProgramy(claudeBin) {
  const cfg = wczytajConfig();
  const hfWersja = cfg.hyperframes?.wersja || "latest";
  const py = IS_WIN ? "python" : "python3";
  const pyMod = (m) => sprawdz(py, ["-c", `import ${m}; print(getattr(${m.split(",")[0].trim()}, "__version__", "ok"))`]);
  const [ffmpeg, ffprobe, python, cv, mp, onnx, ultra, fw, claude, hf] = await Promise.all([
    sprawdz("ffmpeg", ["-version"]), sprawdz("ffprobe", ["-version"]), sprawdz(py, ["--version"]),
    pyMod("cv2, numpy"), pyMod("mediapipe"), pyMod("onnxruntime"), pyMod("ultralytics"), pyMod("faster_whisper"),
    claudeBin ? sprawdz(claudeBin, ["--version"], { shell: /\.cmd$/i.test(claudeBin) }) : Promise.resolve({ kod: -1, out: "" }),
    sprawdz(IS_WIN ? "npx.cmd" : "npx", ["--yes", `hyperframes@${hfWersja}`, "--version"], { czas: 90000, shell: IS_WIN }),
  ]);
  const node = Number(process.versions.node.split(".")[0]);
  const pyV = (python.out.match(/(\d+)\.(\d+)/) || []).slice(1).map(Number);
  const pip = (pakiet) => `${py} -m pip install ${pakiet}`;
  const L = [
    { id: "node", nazwa: "Node.js", po_co: "panel i skrypty", ok: node >= 22, wersja: process.version, wymagany: true, jak: inst("winget install OpenJS.NodeJS.LTS", "brew install node", "nvm install 22") },
    { id: "ffmpeg", nazwa: "FFmpeg", po_co: "obróbka nagrań, dźwięk, okładka", ok: ffmpeg.kod === 0 && ffprobe.kod === 0, wersja: pierwsza(ffmpeg.out).replace(/ Copyright.*/, ""), wymagany: true, jak: inst("winget install Gyan.FFmpeg", "brew install ffmpeg", "sudo apt install ffmpeg") },
    { id: "hyperframes", nazwa: "HyperFrames", po_co: "składanie i render rolki", ok: hf.kod === 0, wersja: pierwsza(hf.out), wymagany: true, jak: `npx --yes hyperframes@${hfWersja} doctor`, uwaga: hf.kod === -2 ? "Pierwsze pobranie trwa dłużej. Kliknij „Sprawdź jeszcze raz” za chwilę." : null },
    { id: "claude", nazwa: "Claude Code", po_co: "Autopilot, pomysły, poprawki zdaniem", ok: claude.kod === 0, wersja: pierwsza(claude.out), wymagany: true, jak: "npm install -g @anthropic-ai/claude-code", uwaga: "Po instalacji otwórz terminal, wpisz claude i zaloguj się. Potem odśwież panel." },
    { id: "python", nazwa: "Python 3.8+", po_co: "analiza obrazu (twarz, ruch, kontrola)", ok: python.kod === 0 && (pyV[0] > 3 || (pyV[0] === 3 && pyV[1] >= 8)), wersja: pierwsza(python.out), wymagany: true, jak: inst("winget install Python.Python.3.12", "brew install python", "sudo apt install python3 python3-pip") },
    { id: "opencv", nazwa: "OpenCV i NumPy", po_co: "cięcia na akcji, przejścia, kontrola obrazu", ok: cv.kod === 0, wersja: pierwsza(cv.out), wymagany: true, jak: pip("opencv-python numpy") },
    { id: "mediapipe", nazwa: "MediaPipe", po_co: "mapa twarzy, proporcje brwi, przed/po", ok: mp.kod === 0, wersja: pierwsza(mp.out), wymagany: false, jak: pip("--no-deps mediapipe absl-py") },
    { id: "onnxruntime", nazwa: "ONNX Runtime", po_co: "zdjęcie 3D (głębia)", ok: onnx.kod === 0, wersja: pierwsza(onnx.out), wymagany: false, jak: pip("onnxruntime") },
    { id: "ultralytics", nazwa: "Ultralytics", po_co: "wycinanie obiektów, przejścia przez postać", ok: ultra.kod === 0, wersja: pierwsza(ultra.out), wymagany: false, jak: pip("ultralytics") },
    { id: "whisper", nazwa: "faster-whisper", po_co: "zapasowa transkrypcja mowy", ok: fw.kod === 0, wersja: pierwsza(fw.out), wymagany: false, jak: pip("faster-whisper") },
  ];
  for (const x of L) if (!x.ok) x.wersja = "";
  return { programy: L, gotowe: L.filter((x) => x.wymagany).every((x) => x.ok) };
}

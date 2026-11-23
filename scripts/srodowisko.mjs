// Sprawdza narzędzia i wypisuje komendy instalacji dla brakujących.
//   npm run srodowisko
import fs from "node:fs";
import path from "node:path";
import { uruchom, ok, uwaga, info, pogrubiony, IS_WIN, ROOT } from "./lib.mjs";

const mac = process.platform === "darwin";
const inst = (win, macCmd, lin) => (IS_WIN ? win : mac ? macCmd : lin);
const testy = [
  ["node", ["-v"], (o) => Number(o.replace("v", "").split(".")[0]) >= 22, "Node.js >= 22 (HyperFrames wymaga 22+)", inst("winget install OpenJS.NodeJS.LTS", "brew install node", "nvm install 22")],
  ["npx", ["-v"], () => true, "npx", "instaluje się z Node.js"],
  ["ffmpeg", ["-version"], () => true, "FFmpeg", inst("winget install Gyan.FFmpeg", "brew install ffmpeg", "sudo apt install ffmpeg")],
  ["ffprobe", ["-version"], () => true, "FFprobe", "instaluje się z FFmpeg"],
  ["git", ["--version"], () => true, "git", inst("winget install Git.Git", "xcode-select --install", "sudo apt install git")],
  ["python", ["--version"], (o) => { const [a, b] = o.replace(/[^\d.]/g, "").split(".").map(Number); return a > 3 || (a === 3 && b >= 8); }, "Python >= 3.8", inst("winget install Python.Python.3.12", "brew install python", "sudo apt install python3")],
  ["auto-editor", ["--version"], () => true, "auto-editor (wycinanie ciszy)", "pip install auto-editor"],
];
info(pogrubiony("Narzędzia:"));
for (const [cmd, a, okFn, opis, jak] of testy) {
  const r = uruchom(cmd, a, { cicho: true });
  const out = (r.stdout + r.stderr).trim().split("\n")[0];
  if (r.code === 0 && okFn(out)) ok(`${opis.padEnd(34)} ${out.slice(0, 50)}`);
  else uwaga(`${opis.padEnd(34)} BRAK albo za stara wersja -> ${jak}`);
}
const fw = uruchom("python", ["-c", "import faster_whisper; print(faster_whisper.__version__)"], { cicho: true });
if (fw.code === 0) ok(`${"faster-whisper (fallback transkrypcji)".padEnd(34)} ${fw.stdout.trim()}`);
else uwaga(`${"faster-whisper (fallback, opcjonalnie)".padEnd(34)} pip install faster-whisper`);
const esr = path.join(ROOT, "narzedzia", "realesrgan", IS_WIN ? "realesrgan-ncnn-vulkan.exe" : "realesrgan-ncnn-vulkan");
if (fs.existsSync(esr)) ok(`${"Real-ESRGAN (upscaling AI)".padEnd(34)} narzedzia/realesrgan`);
else uwaga(`${"Real-ESRGAN (upscaling AI, opcjon.)".padEnd(34)} github.com/xinntao/Real-ESRGAN/releases v0.2.5.0 -> rozpakuj do narzedzia/realesrgan/`);
info(pogrubiony("\nHyperFrames doctor:"));
uruchom("npx", ["--yes", "hyperframes", "doctor"], { pokaz: true });
info("\nwhisper-cpp (transkrypcja) instaluje się sam przy pierwszym `npm run transkrybuj`. Gdyby nie wyszło, doctor wyżej podaje komendę.");

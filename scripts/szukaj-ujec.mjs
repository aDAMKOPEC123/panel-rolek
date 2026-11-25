import path from "node:path";
import { spawnSync } from "node:child_process";
import { ROOT, PROJEKTY, IS_WIN } from "./lib.mjs";

const [, , nazwa, zapytanie] = process.argv;
const tekst = zapytanie?.replace(/^--tekst=/, "").trim() || "";
if (!nazwa || /[\\/]|\.\./.test(nazwa) || tekst.length < 2 || tekst.length > 250 || tekst.includes("\0")) {
  console.error("✗ BŁĄD: Podaj nazwę projektu i opis kadru (2–250 znaków).");
  process.exitCode = 1;
} else {
  const projekt = path.join(PROJEKTY, nazwa);
  const r = spawnSync(IS_WIN ? "python" : "python3", [
    "-X", "utf8", "-u", path.join(ROOT, "scripts", "szukaj-ujec.py"), projekt, `--tekst=${tekst}`,
  ], { stdio: "inherit", windowsHide: true });
  if (r.error) console.error("✗ BŁĄD: " + r.error.message);
  process.exitCode = r.status ?? 1;
}

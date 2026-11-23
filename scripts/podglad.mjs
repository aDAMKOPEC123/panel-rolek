// Podgląd rolki w HyperFrames Studio (przeglądarka).
//   npm run podglad -- <projekt>          -> start w tle, wypisuje adres
//   npm run podglad -- <projekt> --stop   -> zatrzymuje podgląd
import path from "node:path";
import fs from "node:fs";
import { hf, blad, ok, info, znajdzProjekt } from "./lib.mjs";

const args = process.argv.slice(2);
const proj = znajdzProjekt(args.find((a) => !a.startsWith("--")));
const komp = path.join(proj, "kompozycja");
if (!fs.existsSync(path.join(komp, "index.html"))) blad("Kompozycja nie jest złożona.", `npm run zloz -- ${path.basename(proj)}`);
if (args.includes("--stop")) {
  hf(["preview", "--stop"], { cwd: komp, pokaz: true });
  process.exit(0);
}
const r = hf(["preview", "--background", "--no-open"], { cwd: komp });
const txt = r.stdout + r.stderr;
const url = (txt.match(/https?:\/\/(?:localhost|127\.0\.0\.1):\d+[^\s]*/) || [])[0];
if (r.code !== 0 && !url) blad("Podgląd nie wystartował.\n" + txt.slice(-600), "Sprawdź npx hyperframes doctor.");
ok(`Podgląd działa${url ? ": " + url : ""}`);
info("Zatrzymanie: npm run podglad -- " + path.basename(proj) + " --stop");

// Generuje podglądy 4 stylów napisów dla panelu (panel/public/img/napisy-*.jpg).
// Raz po instalacji albo po zmianie szablonu napisów:  node panel/podglady-stylow.mjs
import fs from "node:fs";
import path from "node:path";
import { ROOT, uruchom, hf, ok, blad } from "../scripts/lib.mjs";

const pod = path.join(ROOT, "04_SZABLONY_HF", "_podglad");
const rj = path.join(pod, "kompozycja", "rolka.json");
const oryg = fs.readFileSync(rj, "utf8");
const out = path.join(ROOT, "panel", "public", "img");
fs.mkdirSync(out, { recursive: true });
try {
  for (const styl of ["este", "perla", "waga", "marker", "vlog"]) {
    const r = JSON.parse(oryg);
    r.napisy.styl = styl;
    r.debug_safe_zone = false;
    fs.writeFileSync(rj, JSON.stringify(r, null, 2));
    const z = uruchom("node", [path.join(ROOT, "scripts", "zloz.mjs"), pod, "--force"], { cicho: true });
    if (z.code) blad("zloz nie zadziałał: " + z.stderr);
    const snaps = path.join(pod, "_snap_" + styl);
    hf(["snapshot", "--at", "0.95", "--no-end", "-o", snaps], { cwd: path.join(pod, "kompozycja") });
    const png = fs.readdirSync(snaps).find((n) => n.endsWith(".png"));
    uruchom("ffmpeg", ["-y", "-v", "error", "-i", path.join(snaps, png), "-vf", "crop=1080:420:0:1010,scale=540:-2", "-q:v", "3", path.join(out, `napisy-${styl}.jpg`)]);
    fs.rmSync(snaps, { recursive: true, force: true });
    ok(`img/napisy-${styl}.jpg`);
  }
} finally {
  fs.writeFileSync(rj, oryg);
  uruchom("node", [path.join(ROOT, "scripts", "zloz.mjs"), pod, "--force"], { cicho: true });
}

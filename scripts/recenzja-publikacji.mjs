import fs from "node:fs";
import { recenzujWpisPublikacji } from "./kalendarz.mjs";
import { wymagajLicencji } from "./licencja.mjs";
import { poprawFragmentPublikacji } from "./jakosc-publikacji.mjs";

wymagajLicencji();
try {
  if (process.argv[2] === "--poprawka") {
    const { wpis, uwaga } = JSON.parse(fs.readFileSync(0, "utf8"));
    const poprawka = await poprawFragmentPublikacji(wpis, uwaga);
    console.log("POPRAWKA " + JSON.stringify(poprawka));
  } else {
    const raport = await recenzujWpisPublikacji(process.argv[2]);
    if (raport.bladAI) console.log(`! Kontrola lokalna gotowa. Recenzja AI: ${raport.bladAI}`);
    else console.log(`✓ Recenzja planu: ${raport.ai.ocena}/100`);
  }
} catch (e) {
  console.error("✗ BŁĄD: " + e.message);
  process.exitCode = 1;
}

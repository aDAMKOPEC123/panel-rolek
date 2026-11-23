// Imię osoby z ustawień (config.json -> gabinet.osoba) w przypadkach, których używają polecenia dla Claude i panel:
//   mian (kto: Anna), dop (kogo: Anny), cel (komu: Annie), bier (kogo/co: Annę), narz (z kim: Anną), wol (powitanie: Anno, Aniu, Marku).
// Czysty moduł bez importów: panel ładuje go z /lib/osoba.mjs, skrypty przez lib.mjs -> osobaZConfigu().
// Heurystyka dla polskich imion; imiona spoza reguł (obce, nieodmienne) zostają w mianowniku.

const PUSTE = { mian: "autorka rolki", dop: "autorki rolki", cel: "autorce rolki", bier: "autorkę rolki", narz: "autorką rolki", wol: "", imie: "", zenskie: true };
// miękkie zakończenia tematu przed -a: Ania, Kasia, Zosia -> Ani, Kasi, Zosi
const MIEKKIE = /(si|zi|ci|ni|dzi)a$/i;
// dopełniacz i celownik dla twardych spółgłosek tematu: Anna -> Annie, Marta -> Marcie, Magda -> Magdzie
const CELOWNIK = [["st", "ście"], ["zd", "ździe"], ["sł", "śle"], ["ch", "sze"], ["k", "ce"], ["g", "dze"], ["t", "cie"], ["d", "dzie"], ["r", "rze"], ["ł", "le"]];
const STWARDNIALE = /(sz|cz|rz|ż|c|dz)$/i;

function zenskie(imie) {
  const m = imie.toLowerCase();
  if (/ia$/.test(m)) {
    if (MIEKKIE.test(m)) { const t = imie.slice(0, -1); return { dop: t, cel: t, bier: t + "ę", narz: t + "ą", wol: t + "u" }; } // Ania, Kasia -> Aniu, Kasiu
    const t = imie.slice(0, -1); return { dop: t + "i", cel: t + "i", bier: t + "ę", narz: t + "ą", wol: t + "o" }; // Wiktoria, Julia, Natalia -> Wiktorio
  }
  if (/ja$/.test(m)) {
    const t = imie.slice(0, -1); // Maja -> Maj, Lucja -> Lucj
    const dop = /[aeiouyąęó]ja$/.test(m) ? imie.slice(0, -2) + "i" : t + "i"; // Mai, Kai / Lucji, Patrycji
    return { dop, cel: dop, bier: t + "ę", narz: t + "ą", wol: t + "o" }; // Majo, Lucjo
  }
  const t = imie.slice(0, -1);
  const tl = t.toLowerCase();
  if (/l$/.test(tl) || /j$/.test(tl)) return { dop: t + "i", cel: t + "i", bier: t + "ę", narz: t + "ą", wol: t + (m.length <= 4 ? "u" : "o") }; // Ola, Jola -> Olu, Jolu; Kamila -> Kamilo
  if (/[kg]$/.test(tl)) { const c = CELOWNIK.find(([z]) => tl.endsWith(z)); return { dop: t + "i", cel: t.slice(0, -c[0].length) + c[1], bier: t + "ę", narz: t + "ą", wol: t + "o" }; } // Agnieszka, Olga -> Agnieszko
  if (STWARDNIALE.test(tl)) return { dop: t + "y", cel: t + "y", bier: t + "ę", narz: t + "ą", wol: t + "o" }; // Natasza -> Nataszo
  const c = CELOWNIK.find(([z]) => tl.endsWith(z));
  const cel = c ? t.slice(0, -c[0].length) + c[1] : t + "ie"; // Anna -> Annie, Ewa -> Ewie, Iza -> Izie
  return { dop: t + "y", cel, bier: t + "ę", narz: t + "ą", wol: t + "o" }; // Anno, Ewo, Magdo
}
function meskie(imie) {
  const m = imie.toLowerCase();
  let t = imie;
  if (/ek$/.test(m) && m.length > 3) t = imie.slice(0, -2) + imie.slice(-1); // Marek -> Mark, Jacek -> Jack
  else if (/eł$/.test(m)) t = imie.slice(0, -2) + "ł"; // Paweł -> Pawł
  const tl = t.toLowerCase();
  if (/[aeiouyąęó]$/.test(tl)) return null; // nieodmienne / obce
  const narz = /[kg]$/.test(tl) ? t + "iem" : t + "em";
  // wołacz: po k, g, ch i spółgłoskach miękkich/stwardniałych -u (Marku, Tomaszu, Kamilu), po twardych -e z wymianą (Adamie, Piotrze, Pawle)
  let wol;
  if (/(k|g|ch|sz|cz|rz|ż|c|dz|j|l|ń|ś|ź|ć|dź)$/.test(tl)) wol = t + "u";
  else { const w = [["st", "ście"], ["ł", "le"], ["r", "rze"], ["t", "cie"], ["d", "dzie"], ["s", "sie"], ["z", "zie"]].find(([z]) => tl.endsWith(z)); wol = w ? t.slice(0, -w[0].length) + w[1] : t + "ie"; }
  return { dop: t + "a", cel: t + "owi", bier: t + "a", narz, wol };
}

/** Odmiana imienia. Puste albo "TODO" = neutralne „autorka rolki”. */
export function odmienImie(surowe) {
  const imie = String(surowe ?? "").trim();
  if (!imie || /^todo$/i.test(imie)) return { ...PUSTE };
  // samo imię (np. „Anna Kowalska” -> „Anna”): w poleceniach brzmi naturalnie i nie trzeba odmieniać nazwiska
  const pierwsze = imie.split(/\s+/)[0];
  const ka = /a$/i.test(pierwsze) && pierwsze.length > 1;
  const f = ka ? zenskie(pierwsze) : meskie(pierwsze);
  if (!f) return { mian: pierwsze, dop: pierwsze, cel: pierwsze, bier: pierwsze, narz: pierwsze, wol: pierwsze, imie: pierwsze, zenskie: ka };
  return { mian: pierwsze, ...f, imie: pierwsze, zenskie: ka };
}

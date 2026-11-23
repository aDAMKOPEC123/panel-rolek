// Montaż naturalny (jak u vlogerki, nie reklama): rolka.json -> "montaz": "naturalny".
// Nie zmienia rolka.json. zloz przerabia rolkę w pamięci przy składaniu, więc powrót do "reklamowy" niczego nie psuje.
// Czysty moduł (bez importów Node): panel ładuje ten sam plik z /lib/montaz-naturalny.mjs i pokazuje listę zmian.

// Przejścia, które wyglądają naturalnie w rolkach twórczyń. Reszta (błysk, światło, fala, zoom...) = cięcie.
export const PRZEJSCIA_NATURALNE = ["ciecie", "przenikanie", "whip"];
// Sceny typowo reklamowe: wypadają. Hook i CTA zamieniają się w tekst jak z aplikacji Instagrama.
export const SCENY_REKLAMOWE = ["ig-obserwuj", "cena-oferta", "cena-za-postacia", "lower-third", "ozdobniki", "kino"];
// Efekty montażu, których nie ma w naturalnej rolce (whooshe, emoji, pasek postępu, skoki kadru).
export const EFEKTY_WYLACZONE = ["dzwieki", "emoji", "pasek_postepu", "punch_in", "bodziec", "rozmycie_ruchu"];
export const STYL_NAPISOW = "vlog";

const czysty = (t) => String(t || "").replace(/\*([^*]+)\*/g, "$1").replace(/\s+/g, " ").trim();

/** Opis dla panelu (krok Styl). */
export const OPIS_NATURALNEGO = [
  ["🗣️", "Hook i CTA jako zwykły tekst z Instagrama (biała ramka), bez plansz i pigułek"],
  ["✂️", "Same cięcia, przenikanie i whip, bez błysków, świateł i fal"],
  ["💬", "Napisy jak u twórczyń: białe, proste, słowo po słowie, bez kolorów marki"],
  ["🔇", "Bez whooshy, popów, emoji, paska postępu i skoków kadru"],
  ["🚫", "Bez znaku wodnego i kart: Obserwuj, cena, podpis z imieniem, ozdobniki, kino"],
];

export const czyNaturalny = (rolka) => rolka?.montaz === "naturalny";

/** Przerabia rolkę (kopię) na montaż naturalny. Zwraca { rolka, zmiany: [tekst] }. */
export function naturalnyMontaz(rolka) {
  const r = JSON.parse(JSON.stringify(rolka || {}));
  const zmiany = [];
  // przejścia
  let p = 0;
  for (const u of r.ujecia || []) {
    if (u.przejscie_po && !PRZEJSCIA_NATURALNE.includes(u.przejscie_po)) { u.przejscie_po = "ciecie"; p++; }
  }
  if (p) zmiany.push(`przejścia: ${p} zamienione na cięcie`);
  // efekty
  const ef = { ...(r.efekty || {}) };
  const wyl = EFEKTY_WYLACZONE.filter((k) => ef[k]);
  for (const k of EFEKTY_WYLACZONE) ef[k] = false;
  r.efekty = ef;
  if (wyl.length) zmiany.push(`efekty wyłączone: ${wyl.join(", ")}`);
  // znak wodny
  if (r.watermark !== false) { r.watermark = false; zmiany.push("bez znaku wodnego"); }
  // napisy
  r.napisy = { ...(r.napisy || {}), styl: STYL_NAPISOW };
  // sceny
  const sceny = [];
  const wypadly = [];
  for (const s of r.sceny || []) {
    if (SCENY_REKLAMOWE.includes(s.szablon)) { wypadly.push(s.szablon); continue; }
    if (s.szablon === "hook-tytul") {
      const tekst = [czysty(s.dane?.tekst), czysty(s.dane?.podtekst)].filter(Boolean).join("|");
      if (tekst) sceny.push({ szablon: "tekst-natywny", start: s.start, czas: Math.max(Number(s.czas) || 2, 2.2), dane: { tekst, tlo: "biale", pozycja: "gora" } });
      continue;
    }
    if (s.szablon === "cta-koncowe") {
      const tekst = czysty(s.dane?.tekst);
      if (tekst) sceny.push({ szablon: "tekst-natywny", start: s.start, czas: s.czas, dane: { tekst, tlo: "biale", pozycja: "srodek", rozmiar: 54 } });
      continue;
    }
    sceny.push(s);
  }
  if ((r.sceny || []).some((s) => s.szablon === "hook-tytul")) zmiany.push("hook jako tekst z Instagrama");
  if ((r.sceny || []).some((s) => s.szablon === "cta-koncowe")) zmiany.push("CTA jako tekst z Instagrama");
  if (wypadly.length) zmiany.push(`bez scen: ${[...new Set(wypadly)].join(", ")}`);
  r.sceny = sceny;
  return { rolka: r, zmiany };
}

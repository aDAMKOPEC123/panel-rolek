"use strict";

function podsumowanieAudytuAutopilota(audyt) {
  if (!audyt) return "Kontrola montażu nie zdążyła się zakończyć.";
  if (audyt.blad) return "Kontrola montażu przerwana. " + audyt.blad;
  if (!audyt.aktualny) return "Montaż zmienił się po kontroli. Sprawdź aktualną wersję.";
  const liczba = audyt.obraz.problemy.length;
  const przyjete = audyt.rundy.filter((r) => r.przyjeta).length;
  const obraz = `Kontrola obrazu ${audyt.poczatkowy !== audyt.obraz.ocena ? `${audyt.poczatkowy} → ` : ""}${audyt.obraz.ocena}/100. ${liczba ? `Pozostałe uwagi techniczne — ${liczba}.` : "Sprawdzone klatki bez uwag."}`;
  const recenzja = audyt.recenzja ? `Recenzja montażu ${audyt.recenzja.ocena}/100.` : "Brak niezależnej recenzji AI.";
  const zakres = audyt.obraz.zakres.twarze && audyt.obraz.zakres.hyperframes ? "" : " Część testów technicznych nie zakończyła się.";
  return `${obraz} ${recenzja}${zakres}${przyjete ? ` Przyjęte rundy poprawek — ${przyjete}.` : ""}`;
}

function blokadaFinaluAutopilota(a) {
  if (!a?.aktualny) return "Najpierw sprawdź aktualny montaż.";
  if (!a.obraz.zakres.twarze || !a.obraz.zakres.hyperframes) return "Kontrola techniczna jest niepełna.";
  if (a.obraz.problemy.some((p) => p.waga === "krytyczne")) return "Kontrola wykryła błędy krytyczne.";
  return null;
}

function kartaAudytuAutopilota(P) {
  const a = P.audytAutopilota;
  if (!a && !stanAutopilota(P.nazwa)) return "";
  const moznaPoprawic = a?.aktualny && S.start?.claude && P.scenariusz?.scenariusz?.some((s) => s && !s.zablokowany && s.do > s.od);
  const uwaga = (od, do_, tekst, naprawa, zrodlo, i) =>
    `<li><b>${esc(r1(od))}–${esc(r1(do_))} s · ${esc(tekst)}</b>${naprawa ? `<small>${esc(naprawa)}</small>` : ""}
    ${moznaPoprawic ? `<button class="link ai-link-popraw" type="button" data-zadanie data-audyt-popraw="${i}" data-zrodlo="${zrodlo}">Popraw tę scenę</button>` : ""}</li>`;
  const kontrola = a?.obraz?.problemy.map((u, i) => uwaga(u.od, u.do, u.opis, u.propozycja, "obraz", i)) || [];
  const recenzja = a?.recenzja?.uwagi.map((u, i) => uwaga(u.od, u.do, u.co, u.zalecenie, "ai", i)) || [];
  return `<section class="karta audyt-montazu" aria-label="Recenzja montażu">
    <div class="naglowek"><h3>Recenzja montażu</h3><button class="btn maly jasny" type="button" data-audyt-ponow data-zadanie>${a ? "Sprawdź ponownie" : "Sprawdź montaż"}</button></div>
    <p>${esc(a ? podsumowanieAudytuAutopilota(a) : "Wynik kontroli pojawi się po pierwszej wersji roboczej.")}</p>
    ${a?.plik && a.aktualny ? `<a href="${esc(media(`${P.sciezka}/${a.plik}`))}" class="link" target="_blank" rel="noopener">Obejrzyj sprawdzoną wersję</a>` : ""}
    ${a?.bladAi ? `<p class="podpowiedz">${esc(a.bladAi)}</p>` : ""}
    ${a?.dzwiek?.lufs != null ? `<p class="podpowiedz">Miks · ${r1(a.dzwiek.lufs)} LUFS · cel ${r1(a.dzwiek.cel)} LUFS${a.dzwiek.truePeak == null ? "" : ` · szczyt ${r1(a.dzwiek.truePeak)} dBTP`}</p>` : ""}
    ${a?.recenzja?.podsumowanie ? `<p>${esc(a.recenzja.podsumowanie)}</p>` : ""}
    ${(kontrola.length || recenzja.length) ? `<details><summary>Uwagi z czasami · ${kontrola.length + recenzja.length}</summary><ul>${[...kontrola, ...recenzja].join("")}</ul></details>` : ""}
    ${a?.rundy?.length ? `<details><summary>Próby poprawek · ${a.rundy.length}</summary><ul>${a.rundy.map((r) => `<li><b>${r.przyjeta ? "Przyjęta" : "Odrzucona"}</b> · ${esc(r.zmiany.join(", "))}${r.powod ? `<small>${esc(r.powod)}</small>` : ""}</li>`).join("")}</ul></details>` : ""}
  </section>`;
}

async function kontrolujAutopilota(P = S.projekt) {
  if (!P || S.zadanie || A.pracuje) return;
  const z = await api(`/api/projekt/${encodeURIComponent(P.nazwa)}/audyt-autopilota`, { method: "POST" });
  const wynik = await sledz(z, "Recenzja montażu");
  if (S.projekt?.nazwa === P.nazwa) await odswiezProjekt();
  return wynik;
}

function podepnijAudytAutopilota(el) {
  const b = $("[data-audyt-ponow]", el);
  if (b) b.onclick = () => kontrolujAutopilota().catch(blad);
  el.querySelectorAll("[data-audyt-popraw]").forEach((b) => {
    b.onclick = () => wybierzSceneDoPoprawy(S.projekt, b.dataset.zrodlo, Number(b.dataset.audytPopraw));
  });
}

function wybierzSceneDoPoprawy(P, zrodlo, numer) {
  if (!P || S.zadanie) return;
  const a = P.audytAutopilota;
  const u = (zrodlo === "ai" ? a?.recenzja?.uwagi : a?.obraz?.problemy)?.[numer];
  if (!a?.aktualny || !u) return;
  const sceny = P.scenariusz.scenariusz.flatMap((w, i) => w && !w.zablokowany && w.do > w.od ? [{ w, i }] : []);
  let najlepsza = sceny[0], max = -Infinity;
  for (const s of sceny) {
    const wspolne = Math.min(s.w.do, u.do) - Math.max(s.w.od, u.od);
    if (wspolne > max) { najlepsza = s; max = wspolne; }
  }
  if (!najlepsza) return;
  const m = modal(`<h2>Wybierz scenę do poprawy</h2><p>${esc(u.co || u.opis)}</p><p class="podpowiedz">${esc(u.zalecenie || u.propozycja || "")}</p>
    <label class="pole"><span>Scena z rozpiski</span><select id="aiScenaPoprawki">${sceny.map(({ w, i }) => `<option value="${i}" ${i === najlepsza.i ? "selected" : ""}>${i + 1} · ${r1(w.od)}–${r1(w.do)} s · ${esc((w.mowisz || w.co_widac || "").slice(0, 75))}</option>`).join("")}</select></label>
    <div class="rzad"><button class="btn" id="aiPrzygotujScene">Przygotuj podgląd</button><button class="link" id="aiAnulujScene">Anuluj</button></div>`);
  $("#aiAnulujScene", m).onclick = zamknijModal;
  const b = $("#aiPrzygotujScene", m);
  b.onclick = () => {
    const scena = Number($("#aiScenaPoprawki", m).value);
    const opis = (plan) => plan ? `<p>${esc(plan.koncepcja)}</p><p>${esc(plan.wskazowki)}</p><ul>${plan.zdarzenia.map((z) =>
      `<li>${esc(`${sekRez(z.od)}–${sekRez(z.do)} s · ${typRez(z.typ)}`)} · ${esc(z.opis)}${z.tekst ? `<br><b>${esc(z.tekst)}</b>` : ""}</li>`).join("")}</ul>` : '<p class="podpowiedz">Scena nie ma zapisanej reżyserii.</p>';
    return pokazPoprawkeAI({ url: `/api/projekt/${encodeURIComponent(P.nazwa)}/poprawka-sceny`, wybor: { scena, zrodlo, numer },
      tytul: `Scena ${scena + 1} · poprawka reżyserii`, cel: u.co || u.opis, sugestia: u.zalecenie || u.propozycja, przycisk: b,
      widok: ({ przed, rezyseria }) => ({ przed: opis(przed), po: opis(rezyseria) }),
      po: () => { if (S.projekt?.nazwa === P.nazwa) return odswiezProjekt(); },
    });
  };
}

async function finalizujZPanelem(P, zAutopilota = false) {
  if (!P || S.zadanie || A.pracuje) return false;
  const blokada = blokadaFinalu();
  if (blokada) { toast(blokada, 4500); return false; }
  for (const [skrypt, flagi, opis] of [
    ["render", ["--final", ...(zAutopilota ? ["--sprawdzony-autopilot"] : [])], "Wersja końcowa"],
    ["okladka", [], "Okładka"],
    ["sprawdz", [], "Sprawdzam plik pod Instagram"],
  ]) {
    const wynik = await uruchom(skrypt, [P.nazwa, ...flagi], { opis });
    if (wynik?.kod !== 0) {
      if (S.projekt?.nazwa === P.nazwa) await odswiezProjekt();
      return false;
    }
  }
  if (S.projekt?.nazwa === P.nazwa) await odswiezProjekt();
  toast("Gotowe. Możesz pobrać film.", 3000);
  return true;
}

async function akcjaAutopilota(opcja) {
  const P = S.projekt;
  if (!P || S.zadanie || A.pracuje) return;
  if (opcja === "Sprawdź ponownie") {
    const wynik = await kontrolujAutopilota(P);
    if (wynik?.kod === 0 && S.projekt?.nazwa === P.nazwa) pokazWynikAudytuAsystenta(S.projekt.audytAutopilota);
    return;
  }
  if (opcja === "Obejrzyj sprawdzoną wersję") {
    const biezacy = await api(`/api/projekt/${encodeURIComponent(P.nazwa)}`);
    if (S.projekt?.nazwa !== P.nazwa) return;
    if (!biezacy.audytAutopilota?.aktualny) return pokazWynikAudytuAsystenta(biezacy.audytAutopilota);
    const src = media(`${biezacy.sciezka}/${biezacy.audytAutopilota.plik}`);
    const m = modal(`<h2>Sprawdzona wersja robocza</h2><video class="audyt-podglad" src="${esc(src)}" controls playsinline></video>
      <button class="btn jasny" data-audyt-zamknij>Zamknij</button>`);
    $("[data-audyt-zamknij]", m).onclick = zamknijModal;
    return;
  }
  if (opcja !== "Robimy final") return wyslijDoAsystenta(opcja, opcja);
  // Przed finalizacją pytamy serwer o stan, również po edycji w drugim oknie.
  const biezacy = await api(`/api/projekt/${encodeURIComponent(P.nazwa)}`);
  if (S.projekt?.nazwa !== P.nazwa) return;
  S.projekt = biezacy;
  const blok = blokadaFinaluAutopilota(biezacy.audytAutopilota);
  if (blok) {
    toast(blok, 4500);
    if (A.projekt === P.nazwa) pokazWynikAudytuAsystenta(biezacy.audytAutopilota);
    return;
  }
  const skladanie = await uruchom("zloz", [P.nazwa], { opis: "Składam sprawdzony montaż" });
  if (skladanie?.kod !== 0 || S.projekt?.nazwa !== P.nazwa) return;
  if (await finalizujZPanelem(biezacy, true)) {
    const tekst = "Wersja końcowa, okładka i kontrola pliku są gotowe.";
    const sesja = A.projekt === P.nazwa ? A.sesja : stanAutopilota(P.nazwa)?.sesja;
    const dane = { sesja, ostatnia: tekst, opcje: [], gotowe: true, data: new Date().toISOString() };
    zapiszAutopilota(dane, P.nazwa);
    if (A.projekt === P.nazwa) { A.gotowe = true; dymek("od-claude", formatuj(tekst)); rysujOpcjeAsystenta([], true); }
    if (S.projekt?.nazwa === P.nazwa) pokaz();
  }
}

function pokazWynikAudytuAsystenta(raport, opisMontazu = "") {
  const tekst = [opisMontazu, podsumowanieAudytuAutopilota(raport)].filter(Boolean).join("\n\n");
  dymek(raport?.blad ? "od-claude blad" : "od-claude", formatuj(tekst));
  const opcje = raport?.aktualny ? ["Obejrzyj sprawdzoną wersję", "Popraw coś", "Zmień hook"] : ["Sprawdź ponownie", "Popraw coś"];
  if (!blokadaFinaluAutopilota(raport)) opcje.splice(1, 0, "Robimy final");
  A.gotowe = false;
  zapiszAutopilota({ sesja: A.sesja, ostatnia: tekst, opcje, gotowe: false, data: new Date().toISOString() }, A.projekt);
  rysujOpcjeAsystenta(opcje, false);
}

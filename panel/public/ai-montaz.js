"use strict";

const stanDoboruAI = { klucz: "", trwa: false };
const katalogAI = () => S.start?.opcjeMontazu?.narzedzia || [];
const opisNarzedziaAI = (id) => katalogAI().find(([k]) => k === id);
const nazwaStyluAI = (id) => S.start?.styleMontazu?.find((s) => s.id === id)?.nazwa
  || ({ obecny: "Zachowaj obecny styl", naturalny: "Naturalny", reklamowy: "Reklamowy / ustawienia własne" })[id] || id;

function kontekstOpcjiAI() {
  if (!S.start) return "";
  return `KATALOG MONTAŻU TEJ APLIKACJI
Sprawdź brief, nagrania, scenariusz i ustawienia. Dobierz kilka funkcji do treści. Kiedy proszą o rekomendację, podaj „Użyj” i „Pomiń” z krótkim powodem, a przy brakującym materiale powiedz, czego potrzeba. Zachowaj zatwierdzoną reżyserię i ręczne decyzje. W efektach sceny podaj moment i powiązanie z głosem. Komentarze bez zatwierdzonego rzeczywistego źródła podpisz w kadrze „Komentarze ilustracyjne”.
Style: naturalny, reklamowy, ${S.start.styleMontazu.map(({ id, nazwa }) => `${id} (${nazwa})`).join(", ")}. Presety mogą narzucać część efektów, styl napisów i ruch. Formaty: ${S.formaty.map((f) => f.tytul).join(", ")}.
Efekty Tak/Nie (rolka.json -> efekty): ${efektyMontazu().map(([k, , , n]) => `${k} (${n})`).join(", ")}.
Szablony do scen: ${S.szablony.filter((s) => !UKRYTE_SZABLONY.includes(s.id)).map((s) => s.id).join(", ")}.
${katalogAI().map(([id, n, o]) => `- ${n} (${id}): ${o}`).join("\n")}
Dla wyszukiwania obrazem użyj node scripts/szukaj-ujec.mjs "<nazwa projektu>" "--tekst=<opis kadru>" po przygotowaniu klipów proxy. Przy uzupełnianiu brakującej reżyserii w istniejącym scenariuszu użyj node scripts/rezyseruj.mjs "<plik scenariusz.json>" braki. Gdy efekt ma odpowiedni gotowy szablon, użyj go. Własną animację przygotuj i zweryfikuj zgodnie z instrukcjami HyperFrames.`;
}

function celDoboruAI() {
  if (S.projekt) return { klucz: "projekt:" + S.projekt.nazwa, url: `/api/projekt/${encodeURIComponent(S.projekt.nazwa)}/dobierz-montaz`, projekt: S.projekt.nazwa };
  if (PM.id && PM.dane?.scenariusz?.length) return { klucz: "pomysl:" + PM.id, url: `/api/pomysl/${encodeURIComponent(PM.id)}/dobierz-montaz` };
  return null;
}

function odswiezPanelAI() {
  const cel = celDoboruAI();
  const b = $("#claudeDobierz");
  const zablokowany = !cel || !S.start?.claude;
  b.dataset.zablokowany = zablokowany ? "1" : "";
  b.disabled = zablokowany || stanDoboruAI.trwa || !!S.zadanie;
  $("#claudeDobierzHint").textContent = !cel ? "Otwórz rolkę lub scenariusz, aby dobrać montaż."
    : !S.start?.claude ? "Dobieranie montażu wymaga Claude Code."
    : "Otrzymasz styl, decyzje o efektach i kroki dopasowane do rolki. Własną wskazówkę możesz wpisać niżej.";
  if (stanDoboruAI.klucz !== cel?.klucz) $("#claudeDobor").replaceChildren();
}

function przejdzDoOpcjiAI(id, zapytanie = "") {
  const opcja = opisNarzedziaAI(id);
  if (!opcja) return;
  const [, , , , krok, wybor] = opcja;
  const p = S.projekt?.nazwa;
  const wPomysle = !p && id === "rezyseria" && !!PM.id;
  if (!p && !wPomysle) return toast("Najpierw otwórz rolkę");
  zamknijModal();
  $("#claude").classList.add("ukryte");
  const cel = wPomysle ? "#scenariuszPomyslu" : wybor;
  if (p && (S.krok !== krok || trybProsty())) {
    if (trybProsty()) {
      S.krok = krok;
      ustawTryb(false);
    }
    idz(krok);
  }
  const wskaz = () => {
    if (p && (S.projekt?.nazwa !== p || S.krok !== krok)) return true;
    const el = $(cel);
    if (!el) return false;
    const pole = zapytanie && id === "szukanie" ? $('input[name="tekst"]', el) : null;
    if (pole) pole.value = zapytanie;
    const widoczny = el.hidden ? el.parentElement : el;
    widoczny.scrollIntoView({ block: "center" });
    pole?.focus({ preventScroll: true });
    return true;
  };
  if (wskaz()) return;
  const kontener = $("#tresc");
  const obserwuj = new MutationObserver(() => { if (wskaz()) obserwuj.disconnect(); });
  if (kontener) obserwuj.observe(kontener, { childList: true, subtree: true });
  setTimeout(() => { obserwuj.disconnect(); if (p === S.projekt?.nazwa && !$(cel)) toast("Ta funkcja pojawi się, gdy będzie miała potrzebne materiały."); }, 2500);
}

function pokazKatalogAI() {
  const projekt = !!S.projekt, pomysl = !!PM.id;
  const grupy = [["Scenariusz i nagrania", [2]], ["Styl, napisy, obraz i dźwięk", [1, 3, 4, 5]], ["Kontrola i przygotowanie do publikacji", [6, 7]]];
  const m = modal(`<h2>Wszystkie opcje montażu</h2>
    <div class="rzad ai-katalog-start">
      <button class="btn maly jasny" data-ai-start="pomysl">Wymyśl rolkę</button>
      <button class="btn maly jasny" data-ai-start="autopilot">Autopilot</button>
      <button class="btn maly jasny" data-ai-start="plan">Kalendarz rolek</button>
    </div>
    <div class="ai-katalog">${grupy.map(([n, kroki]) => `<details ${kroki[0] === 2 ? "open" : ""}><summary>${n}</summary>
      <ul>${katalogAI().filter(([, , , , krok]) => kroki.includes(krok)).map(([id, nazwa, opis]) => `<li>
        <button class="link" type="button" data-ai-skok="${esc(id)}" ${projekt || (pomysl && id === "rezyseria") ? "" : "disabled"}>${esc(nazwa)}</button>
        <small>${esc(opis)}</small></li>`).join("")}</ul></details>`).join("")}
    <details><summary>Efekty · ${efektyMontazu().length}</summary>
      <ul>${efektyMontazu().map(([, , , n, o]) => `<li><b>${esc(n)}</b><small>${esc(o)}</small></li>`).join("")}</ul>
      ${projekt ? '<button class="btn maly jasny" data-ai-skok="styl">Otwórz przełączniki efektów</button>' : ""}</details>
    <details><summary>Presety, formaty i szablony scen</summary>
      <ul>${(S.start?.styleMontazu || []).map((x) => `<li><b>${esc(x.nazwa)}</b><small>${esc(x.opis)}</small></li>`).join("")}
      <li><b>Formaty</b><small>${S.formaty.map((f) => esc(f.tytul)).join(" · ")}</small></li>
      <li><b>Szablony</b><small>${S.szablony.filter((s) => !UKRYTE_SZABLONY.includes(s.id)).map((s) => esc(nazwaSzablonu(s.id))).join(" · ")}</small></li></ul>
      ${projekt ? '<button class="btn maly jasny" data-ai-skok="styl">Otwórz styl</button> <button class="btn maly jasny" data-ai-skok="sceny">Otwórz sceny</button>' : ""}</details></div>
    <button class="btn maly jasny" id="aiKatalogZamknij">Zamknij</button>`);
  m.querySelectorAll("[data-ai-skok]").forEach((b) => { b.onclick = () => przejdzDoOpcjiAI(b.dataset.aiSkok); });
  m.querySelectorAll("[data-ai-start]").forEach((b) => {
    b.onclick = () => {
      zamknijModal(); $("#claude").classList.add("ukryte");
      if (b.dataset.aiStart === "pomysl") nowyPomysl();
      if (b.dataset.aiStart === "autopilot") startAutopilota();
      if (b.dataset.aiStart === "plan") otworzKalendarz();
    };
  });
  $("#aiKatalogZamknij", m).onclick = zamknijModal;
}

function pokazDoborAI(cel, zadanie, dane) {
  const box = $("#claudeDobor");
  const { propozycja: plan, obecnyStyl, konfiguracja, ograniczenia } = dane;
  const czyZmianaStylu = plan.montaz.id !== "obecny" && plan.montaz.id !== obecnyStyl;
  const grupy = { uzyj: "Użyj", pomin: "Pomiń", po_przygotowaniu: "Po przygotowaniu" };
  box.innerHTML = `<section class="ai-rekomendacje" aria-label="Rekomendacje montażu">
    <h4>Propozycja dla tej rolki</h4><p>${esc(plan.koncepcja)}</p>
    <div class="ai-profil">
      <b>${esc(nazwaStyluAI(plan.montaz.id))}</b><p class="podpowiedz">${esc(plan.montaz.powod)}</p>
      ${cel.projekt ? `<label class="ai-zaznacz"><input type="checkbox" data-ai-styl ${czyZmianaStylu ? "checked" : ""}> Zapisz ten styl</label>` : ""}
    </div>
    <details><summary>Decyzje o efektach · ${plan.efekty.length}</summary><ul class="ai-rekom-lista">${plan.efekty.map((e) => `<li data-ai-efekt="${esc(e.id)}">
      <div><span class="chip ${e.uzyj ? "ok" : ""}">${e.uzyj ? "Użyj" : "Pomiń"}</span> <b>${esc(nazwaEfektu(e.id))}</b></div>
      <small>${esc(e.powod)}</small>
      ${cel.projekt ? '<label class="ai-zaznacz"><input type="checkbox" data-ai-wybor> Zapisz zmianę</label><small data-ai-stan></small>' : ""}
    </li>`).join("")}</ul></details>
    ${plan.narzedzia.length ? `<details open><summary>Narzędzia i przebieg</summary><ul class="ai-rekom-lista">${plan.narzedzia.map((n) => `<li>
      <div><span class="chip ${n.decyzja === "uzyj" ? "ok" : ""}">${grupy[n.decyzja]}</span> <b>${esc(opisNarzedziaAI(n.id)?.[1] || n.id)}</b></div>
      <small>${esc(n.opis)}</small>
      ${n.decyzja === "po_przygotowaniu" && n.brak ? `<small>Brakuje ${esc(n.brak)}.</small>` : ""}
      ${n.zapytanie ? `<small>Fraza do wyszukania: „${esc(n.zapytanie)}”</small>` : ""}
      <div class="rzad">
        ${cel.projekt && n.decyzja !== "pomin" ? `<label class="ai-zaznacz"><input type="checkbox" data-ai-krok="${esc(n.id)}" ${n.decyzja === "uzyj" ? "checked" : ""}> Przekaż do wykonania</label>` : ""}
        ${cel.projekt || n.id === "rezyseria" ? `<button class="link" data-ai-otworz="${esc(n.id)}">Otwórz w panelu</button>` : ""}
      </div></li>`).join("")}</ul></details>` : ""}
    <div class="rzad ai-akcje-rekom">
      ${cel.projekt ? '<button type="button" class="btn maly" data-ai-zastosuj>Zapisz wybrane ustawienia</button>' : ""}
      ${cel.projekt ? '<button type="button" class="btn maly jasny" data-ai-zapamietaj="marka">Zapamiętaj dla marki</button><button type="button" class="btn maly jasny" data-ai-zapamietaj="projekt">Tylko w tym projekcie</button>' : ""}
      ${cel.projekt && plan.narzedzia.some((n) => n.decyzja !== "pomin") ? '<button type="button" class="btn maly jasny" data-ai-wykonaj>Wykonaj wybrane kroki z Claude</button>' : ""}
    </div><p class="podpowiedz" data-ai-wynik>${cel.projekt ? "" : "W projekcie możesz zapisać ustawienia i zlecić wykonanie wybranych kroków."}</p>
  </section>`;
  const status = $("[data-ai-wynik]", box);
  box.querySelectorAll("[data-ai-otworz]").forEach((b) => {
    b.onclick = () => przejdzDoOpcjiAI(b.dataset.aiOtworz, plan.narzedzia.find((n) => n.id === b.dataset.aiOtworz)?.zapytanie);
  });
  if (!cel.projekt) return;
  const styl = $("[data-ai-styl]", box);
  const zapisz = $("[data-ai-zastosuj]", box);
  const wybory = plan.efekty.map((e) => {
    const el = $(`[data-ai-efekt="${CSS.escape(e.id)}"]`, box);
    const kontrolka = $("[data-ai-wybor]", el);
    const pole = { ...e, kontrolka, stan: $("[data-ai-stan]", el), wybrane: true };
    kontrolka.onchange = () => { pole.wybrane = kontrolka.checked; };
    return pole;
  });
  const odswiez = () => {
    const wybranyStyl = styl?.checked && plan.montaz.id !== "obecny" ? plan.montaz.id : obecnyStyl;
    const blokady = ograniczenia[wybranyStyl] || {};
    for (const e of wybory) {
      const maBlokade = Object.hasOwn(blokady, e.id);
      const zmiana = konfiguracja[e.id] !== e.uzyj;
      e.kontrolka.disabled = maBlokade || !zmiana;
      e.kontrolka.checked = !e.kontrolka.disabled && e.wybrane;
      e.stan.textContent = maBlokade ? `W tym stylu: ${blokady[e.id] ? "włączony" : "wyłączony"}.` : zmiana ? "" : "Już tak ustawione.";
      e.kontrolka.parentElement.hidden = e.kontrolka.disabled;
    }
  };
  if (styl) styl.onchange = odswiez;
  odswiez();
  let zapisano = false, zapisTrwa = false;
  const zapiszUstawienia = async (zapamietaj = "") => {
    if (zapisano) return false;
    const efekty = wybory.filter((e) => e.kontrolka.checked && !e.kontrolka.disabled).map((e) => e.id);
    if (!styl?.checked && !efekty.length) return false;
    await api(cel.url, { method: "PUT", body: { zadanie, styl: !!styl?.checked, efekty, zapamietaj } });
    zapisano = true;
    if (styl) styl.disabled = true;
    wybory.forEach((e) => { e.kontrolka.disabled = true; });
    status.textContent = zapamietaj ? `Ustawienia zastosowane i zapamiętane ${zapamietaj === "marka" ? "dla marki" : "w tym projekcie"}.` : "Zapisano wybrane ustawienia.";
    if (celDoboruAI()?.klucz === cel.klucz) await odswiezProjekt();
    return true;
  };
  const wykonaj = $("[data-ai-wykonaj]", box);
  const zapamietaj = [...box.querySelectorAll("[data-ai-zapamietaj]")];
  const obsluz = (fn) => async () => {
    if (zapisTrwa || S.zadanie || A.pracuje || celDoboruAI()?.klucz !== cel.klucz) return;
    zapisTrwa = true;
    zapisz.disabled = true;
    zapamietaj.forEach((b) => { b.disabled = true; });
    if (wykonaj) wykonaj.disabled = true;
    try {
      await fn();
    } catch (e) { status.textContent = e.message; }
    finally {
      zapisTrwa = false;
      zapisz.disabled = zapisano;
      zapamietaj.forEach((b) => { b.disabled = zapisano; });
      if (wykonaj) wykonaj.disabled = false;
    }
  };
  zapisz.onclick = obsluz(async () => {
    if (!await zapiszUstawienia() && !zapisano) status.textContent = "Wybierz ustawienie do zapisania.";
  });
  zapamietaj.forEach((b) => { b.onclick = obsluz(async () => {
    if (!await zapiszUstawienia(b.dataset.aiZapamietaj) && !zapisano) status.textContent = "Wybierz styl lub efekty do zapamiętania.";
  }); });
  if (wykonaj) wykonaj.onclick = obsluz(async () => {
    const zaznaczone = new Set([...box.querySelectorAll("[data-ai-krok]:checked")].map((e) => e.dataset.aiKrok));
    const wybrane = plan.narzedzia.filter((k) => zaznaczone.has(k.id));
    if (!wybrane.length) return status.textContent = "Zaznacz co najmniej jeden krok do wykonania.";
    await zapiszUstawienia();
    if (celDoboruAI()?.klucz !== cel.klucz) return;
    const P = S.projekt;
    const tytul = "Montaż z pakietem AI";
    if (A.klucz === P.nazwa + "|" + tytul) A.klucz = null;
    otworzAsystenta({
      tytul, powitanie: "Sprawdzę materiały i wykonam zaznaczone kroki. Jeśli brakuje materiału, podam, czego potrzeba.",
      prompt: `Użyj skilla rolki-beauty i zasad z CLAUDE.md. Projekt: ${P.nazwa} (${P.sciezka}).
      Przeczytaj bieżący brief, montaż i scenariusz. Wykonaj tylko kroki zaznaczone przez użytkownika. Opis propozycji traktuj jako wskazówkę montażową. Kroki niezaznaczone pomiń. Zachowaj ręczne decyzje, ustawienia stylu i efektów z rolka.json oraz zatwierdzone elementy reżyserii. Gdy brakuje materiału lub zgody, powiedz, czego potrzebujesz. Nigdy nie publikuj. Nie renderuj finalu.
      Wybrane kroki: ${JSON.stringify(wybrane)}.
      ${kontekstOpcjiAI()}
      Zakończ krótkim podsumowaniem i osobną linią GOTOWE albo jednym pytaniem z osobną linią OPCJE: a | b.`,
    });
  });
}

document.getElementById("claudeKatalog").onclick = pokazKatalogAI;
document.getElementById("claudeDobierz").onclick = async () => {
  const cel = celDoboruAI();
  if (!cel || stanDoboruAI.trwa || S.zadanie) return;
  stanDoboruAI.klucz = cel.klucz;
  stanDoboruAI.trwa = true;
  odswiezPanelAI();
  $("#claudeDobor").innerHTML = '<p class="podpowiedz" role="status">Dobieram montaż do materiałów i scenariusza…</p>';
  try {
    const wskazowka = $("#claudeTekst").value.trim();
    const z = await api(cel.url, { method: "POST", body: { wskazowka } });
    const { kod, wynik, tekst } = await sledz(z, "Dobór montażu");
    if (kod !== 0 || !wynik) throw new Error(tekst.split("\n").find((l) => l.startsWith("✗ BŁĄD:"))?.slice("✗ BŁĄD: ".length) || "Dobór montażu został przerwany.");
    if (celDoboruAI()?.klucz === cel.klucz) pokazDoborAI(cel, z.id, JSON.parse(wynik));
  } catch (e) {
    if (celDoboruAI()?.klucz === cel.klucz) $("#claudeDobor").innerHTML = `<p class="rez-uwaga" role="alert">${esc(e.message)}</p>`;
  } finally {
    stanDoboruAI.trwa = false;
    odswiezPanelAI();
  }
};

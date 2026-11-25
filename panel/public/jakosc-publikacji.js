"use strict";

const elementPublikacji = (d) => ({ post: "Element", karuzela: "Slajd", story: "Plansza" })[typWpisu(d)];

function uwagiJakosciPublikacji(d, uwagi, zrodlo) {
  return uwagi.length ? `<ul class="pl-uwagi-jakosci">${uwagi.map((u, i) => `<li>
    <small>${u.poziom === "wazne" ? "Do poprawy" : "Do sprawdzenia"}${u.element ? ` · ${elementPublikacji(d)} ${u.element}` : ""}</small>
    <b>${esc(u.problem)}</b><span>${esc(u.poprawka)}</span>
    ${S.start?.claude && u.element && d.plan_tresci?.[u.element - 1] ? `<button class="link ai-link-popraw" type="button" data-zadanie data-pd-popraw="${i}" data-zrodlo="${zrodlo}">Popraw ${typWpisu(d) === "story" ? "planszę" : elementPublikacji(d).toLowerCase()} ${u.element}</button>` : ""}</li>`).join("")}</ul>` : "";
}

function raportPlanuPublikacji(d) {
  const j = d.jakosc_publikacji;
  const zapis = j.recenzja, ai = zapis?.ai;
  return `<h4>Plan publikacji</h4>
    ${j.lokalne.length ? uwagiJakosciPublikacji(d, j.lokalne, "lokalne") : '<p class="podpowiedz">Podstawowa kontrola rozpiski bez uwag.</p>'}
    ${ai ? `<p><b>Recenzja AI · ${ai.ocena}/100</b><br>${esc(ai.podsumowanie)}</p>${uwagiJakosciPublikacji(d, ai.uwagi, "ai")}` : ""}
    ${j.nieaktualna ? '<p class="podpowiedz">Plan został zmieniony. Uruchom recenzję zapisanej wersji.</p>' : ""}
    ${zapis?.bladAI ? `<p class="podpowiedz">Recenzja AI niedostępna. ${esc(zapis.bladAI)}</p>` : ""}
    ${j.moznaRecenzowac ? `<button type="button" class="btn maly jasny" id="pdRecenzujPlan" data-zadanie${S.zadanie ? " disabled" : ""}>${ai ? "Sprawdź plan ponownie" : "Sprawdź plan z AI"}</button>` : '<p class="podpowiedz">Uzupełnij treść w edycji publikacji, aby uruchomić recenzję AI.</p>'}
    <p class="podpowiedz" id="pdStatusRecenzji" role="status"></p>`;
}

function kartaJakosciPublikacji(d) {
  if (!d.jakosc_publikacji) return "";
  const story = typWpisu(d) === "story", mnogie = typWpisu(d) !== "post";
  const wybor = story ? "Wybierz gotowe wideo Story" : mnogie ? "Wybierz obrazy wszystkich slajdów" : "Wybierz gotową grafikę posta";
  return `<section class="pl-jakosc" aria-labelledby="pdJakoscTytul">
    <h3 id="pdJakoscTytul">Kontrola jakości</h3><div id="pdRaportPlanu">${raportPlanuPublikacji(d)}</div>
    <div class="pl-jakosc-pliki"><h4>Gotowe pliki</h4><label class="pole"><span>${wybor}</span>
      <input id="pdPliki" type="file" ${mnogie ? "multiple" : ""} accept="${story ? "video/*,.mp4,.mov,.webm" : "image/*,.png,.jpg,.jpeg,.webp,.avif"}"></label>
    <p class="podpowiedz">${story ? "Sprawdzimy wymiary, długość i próbki klatek." : "Sprawdzimy wymiary i obraz" + (mnogie ? " oraz zgodność slajdów." : ".")} Pliki pozostają na tym urządzeniu.</p>
    <div id="pdRaportPlikow" role="status"></div></div>
  </section>`;
}

function poleRozpiskiPublikacji(u = {}) {
  return `<li><label class="pole"><span>Treść</span><input data-pd-co maxlength="180" value="${esc(u.co || "")}"></label>
    <label class="pole"><span>Wykonanie</span><textarea data-pd-jak rows="2" maxlength="360">${esc(u.jak || "")}</textarea></label>
    <button class="link" data-pd-usun type="button">Usuń ten punkt</button></li>`;
}

function edycjaRozpiskiPublikacji(d) {
  const element = elementPublikacji(d);
  if (!element) return "";
  return `<div id="pdEdycjaRozpiski">
    <label class="pole"><span>${typWpisu(d) === "karuzela" ? "Tekst okładki" : "Nagłówek"}</span><input id="pdNaglowek" maxlength="180" value="${esc(d.hook_tekst || "")}"></label>
    <label class="pole"><span>Wezwanie do działania (CTA)</span><input id="pdCta" maxlength="180" value="${esc(d.cta || "")}"></label>
    <ol id="pdRozpiska" class="pl-rozpiska-edycja">${(d.plan_tresci || []).map(poleRozpiskiPublikacji).join("")}</ol>
    <button type="button" class="btn maly jasny" id="pdDodajPunkt">${typWpisu(d) === "story" ? "Dodaj planszę" : `Dodaj ${element.toLowerCase()}`}</button>
  </div>`;
}

function podepnijEdycjeRozpiski(m, d) {
  const r = $("#pdRozpiska", m);
  if (!r) return;
  $("#pdFormat", m).onchange = (e) => { $("#pdEdycjaRozpiski", m).hidden = e.target.value !== typWpisu(d); };
  $("#pdDodajPunkt", m).onclick = () => {
    if (r.children.length >= 20) return toast("Rozpiska może mieć do 20 punktów.");
    r.insertAdjacentHTML("beforeend", poleRozpiskiPublikacji());
    r.lastElementChild.querySelector("input").focus();
  };
  r.onclick = (e) => { if (e.target.closest("[data-pd-usun]")) e.target.closest("li").remove(); };
}

function odczytajEdycjeRozpiski(m, d, zmiany) {
  const r = $("#pdRozpiska", m);
  if (!r || zmiany.typ_publikacji !== typWpisu(d)) return;
  const naglowek = $("#pdNaglowek", m).value.trim(), cta = $("#pdCta", m).value.trim();
  const rozpiska = [...r.children].map((el) => ({ co: $("[data-pd-co]", el).value.trim(), jak: $("[data-pd-jak]", el).value.trim() }));
  if (naglowek !== (d.hook_tekst || "").trim()) zmiany.hook_tekst = naglowek;
  if (cta !== (d.cta || "").trim()) zmiany.cta = cta;
  if (rozpiska.length !== (d.plan_tresci || []).length || rozpiska.some(({ co, jak }, i) => co !== (d.plan_tresci[i]?.co || "").trim() || jak !== (d.plan_tresci[i]?.jak || "").trim())) zmiany.plan_tresci = rozpiska;
}

function podepnijJakoscPublikacji(m, d, od, url) {
  const raport = $("#pdRaportPlanu", m), pliki = $("#pdPliki", m);
  if (!raport) return;
  let aktualny = d;
  raport.onclick = async (e) => {
    const popraw = e.target.closest("[data-pd-popraw]");
    if (popraw && !S.zadanie) {
      const zrodlo = popraw.dataset.zrodlo, numer = Number(popraw.dataset.pdPopraw);
      const j = aktualny.jakosc_publikacji;
      const u = (zrodlo === "lokalne" ? j.lokalne : j.recenzja?.ai?.uwagi)?.[numer];
      if (!u) return;
      const opis = (w) => `<p><b>${esc(w.co)}</b></p><p>${esc(w.jak)}</p>`;
      const wroc = () => szczegolyRolki(d.id, od);
      return pokazPoprawkeAI({ url: `${url}/poprawka`, wybor: { zrodlo, numer }, tytul: `${elementPublikacji(d)} ${u.element} · poprawka`,
        cel: u.problem, sugestia: u.poprawka, przycisk: popraw, widok: ({ przed, po }) => ({ przed: opis(przed), po: opis(po) }),
        zakresProjektu: "Tylko w tej publikacji", powrot: wroc, po: async () => { await wczytajTydzien(od); poZmianiePlanu(); await wroc(); },
      });
    }
    const b = e.target.closest("#pdRecenzujPlan");
    if (!b || S.zadanie) return;
    b.disabled = true;
    const status = $("#pdStatusRecenzji", raport);
    status.textContent = "Trwa recenzja zapisanej rozpiski…";
    try {
      const z = await api(`${url}/recenzja`, { method: "POST" });
      const wynik = await sledz(z, "Recenzja planu publikacji");
      const swiezy = await api(`/api/plan?od=${encodeURIComponent(od)}`);
      if (PL.od === od) PL.dane = swiezy;
      poZmianiePlanu();
      if (!raport.isConnected) return;
      const wpis = swiezy.plan?.dni.find((u) => u.id === d.id);
      if (wpis?.jakosc_publikacji) {
        aktualny = wpis;
        raport.innerHTML = raportPlanuPublikacji(wpis);
        odswiezPrzyciski();
      }
      if (!wpis?.jakosc_publikacji || wynik.kod !== 0) $("#pdStatusRecenzji", raport).textContent = "Odśwież szczegóły publikacji i sprawdź aktualną wersję.";
      else if (wynik.tekst.startsWith("! ") && wpis.jakosc_publikacji.recenzja?.ai) $("#pdStatusRecenzji", raport).textContent = "Ponowna recenzja AI niedostępna. Wyświetlamy poprzednią ocenę.";
    } catch (error) {
      status.textContent = error.message;
    } finally { b.disabled = !!S.zadanie; }
  };
  pliki.onchange = async () => {
    const lista = Array.from(pliki.files);
    if (!lista.length) return;
    const wynik = $("#pdRaportPlikow", m);
    pliki.disabled = true;
    wynik.textContent = "Sprawdzam wybrane pliki…";
    try {
      const raportPlikow = await sprawdzPlikiPublikacji(d, lista);
      wynik.innerHTML = `<ul class="pl-uwagi-jakosci">${raportPlikow.map(({ nazwa, dane, uwagi }) => `<li>
        <b>${esc(nazwa)}</b>${dane ? `<small>${esc(dane)}</small>` : ""}
        ${(uwagi.length ? uwagi : ["Kontrola techniczna bez uwag."]).map((u) => `<span>${esc(u)}</span>`).join("")}</li>`).join("")}</ul>`;
    } catch (error) { wynik.textContent = error.message; }
    finally { pliki.value = ""; pliki.disabled = false; }
  };
}

function zdarzenieMedium(el, zdarzenie, uruchom) {
  return new Promise((resolve, reject) => {
    const zamknij = (blad) => {
      clearTimeout(timer);
      el.removeEventListener(zdarzenie, gotowe);
      el.removeEventListener("error", nieczytelny);
      if (blad) reject(blad); else resolve();
    };
    const gotowe = () => zamknij();
    const nieczytelny = () => zamknij(new Error("Przeglądarka nie może odczytać pliku. Sprawdź kodowanie lub zapisz go ponownie."));
    const timer = setTimeout(() => zamknij(new Error("Odczyt pliku nie zakończył się w czasie.")), 8000);
    el.addEventListener(zdarzenie, gotowe);
    el.addEventListener("error", nieczytelny);
    try { uruchom(); } catch { nieczytelny(); }
  });
}

async function probkiPublikacji(plik, wideo, ctx) {
  const el = document.createElement(wideo ? "video" : "img"), url = URL.createObjectURL(plik);
  const klatka = () => {
    ctx.clearRect(0, 0, 48, 48);
    ctx.drawImage(el, 0, 0, 48, 48);
    return ctx.getImageData(0, 0, 48, 48).data;
  };
  if (wideo) { el.preload = "auto"; el.muted = true; }
  try {
    await zdarzenieMedium(el, wideo ? "loadeddata" : "load", () => { el.src = url; });
    if (!wideo) return { w: el.naturalWidth, h: el.naturalHeight, probki: [klatka()] };
    const czas = el.duration;
    if (!(czas > 0) || !Number.isFinite(czas)) throw new Error("Brakuje prawidłowej długości wideo.");
    if (!el.videoWidth || !el.videoHeight) throw new Error("Nie znaleziono obrazu w wideo.");
    const probki = [klatka()];
    for (const ulamek of [0.18, 0.36, 0.54, 0.72, 0.9]) {
      const t = czas * ulamek;
      if (t === el.currentTime) continue;
      await zdarzenieMedium(el, "seeked", () => { el.currentTime = t; });
      probki.push(klatka());
    }
    return { w: el.videoWidth, h: el.videoHeight, czas, probki };
  } finally {
    el.removeAttribute("src");
    if (wideo) el.load();
    URL.revokeObjectURL(url);
  }
}

function prawieCzarnaProbka(piksele) {
  let ciemne = 0;
  for (let i = 0; i < piksele.length; i += 4) {
    if (piksele[i + 3] > 240 && Math.max(piksele[i], piksele[i + 1], piksele[i + 2]) < 22) ciemne++;
  }
  return ciemne * 4 / piksele.length > 0.98;
}

function zmianaProbki(a, b) {
  let zmienione = 0;
  for (let i = 0; i < a.length; i += 4) {
    if (Math.max(Math.abs(a[i] - b[i]), Math.abs(a[i + 1] - b[i + 1]), Math.abs(a[i + 2] - b[i + 2])) > 18) zmienione++;
  }
  return zmienione * 4 / a.length > 0.025;
}

async function sprawdzPlikiPublikacji(d, pliki) {
  if (pliki.length > 20) throw new Error("Wybierz maksymalnie 20 plików do jednego sprawdzenia.");
  const story = typWpisu(d) === "story", karuzela = typWpisu(d) === "karuzela";
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 48;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const raport = [], obrazy = [];
  for (const plik of pliki) {
    const pozycja = { nazwa: plik.name, dane: "", uwagi: [] };
    raport.push(pozycja);
    try {
      const { w, h, czas, probki } = await probkiPublikacji(plik, story, ctx);
      pozycja.dane = `${w} × ${h} px${story ? ` · ${czas.toLocaleString("pl-PL", { maximumFractionDigits: 2 })} s · ${probki.length} próbek klatek` : ""}`;
      if (w < 1080) pozycja.uwagi.push("Szerokość poniżej docelowych 1080 px.");
      const ciemne = probki.filter(prawieCzarnaProbka).length;
      if (story) {
        if (Math.abs(w / h - 9 / 16) > 0.01) pozycja.uwagi.push("Kadr różni się od pionowego 9:16.");
        if (czas < 1) pozycja.uwagi.push("Klip trwa mniej niż sekundę. Sprawdź, czy tekst jest czytelny.");
        if (ciemne) pozycja.uwagi.push(`Prawie czarny obraz w ${ciemne} z ${probki.length} próbek.`);
        if (probki.length > 1 && !probki.slice(1).some((p) => zmianaProbki(probki[0], p))) pozycja.uwagi.push("Brak wyraźnej zmiany obrazu w próbkach. Sprawdź przebieg animacji.");
      } else if (ciemne) pozycja.uwagi.push("Grafika jest prawie czarna. Sprawdź eksport.");
      obrazy.push({ w, h });
    } catch (error) { pozycja.uwagi.push(error.message); }
  }
  if (karuzela) {
    const uwagi = [], planowana = d.plan_tresci?.length;
    if (pliki.length < 2) uwagi.push("W karuzeli powinny znaleźć się co najmniej dwa obrazy.");
    if (planowana && pliki.length !== planowana) uwagi.push(`Wybrano ${pliki.length} plików, a w rozpisce jest ${planowana} slajdów.`);
    const pierwszy = obrazy[0];
    if (obrazy.some(({ w, h }) => Math.abs(w / h - pierwszy.w / pierwszy.h) > 0.01)) uwagi.push("Slajdy mają różne proporcje. Zastosuj wspólne kadrowanie.");
    else if (obrazy.some(({ w, h }) => w !== pierwszy.w || h !== pierwszy.h)) uwagi.push("Slajdy mają różne rozdzielczości. Wyeksportuj je w jednakowym rozmiarze.");
    if (uwagi.length) raport.unshift({ nazwa: "Karuzela jako całość", uwagi });
  }
  return raport;
}

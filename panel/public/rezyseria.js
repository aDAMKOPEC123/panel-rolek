"use strict";

const polaZdarzenia = [
  ["opis", "Obraz i cel", 280], ["tekst", "Tekst na ekranie", 180],
  ["pozycja", "Pozycja w kadrze", 90], ["wejscie", "Wejście", 100],
  ["wyjscie", "Wyjście", 100], ["animacja", "Animacja, ruch lub przejście", 140],
  ["dzwiek", "Dźwięk", 100], ["synchronizacja", "Sygnał z lektora lub obrazu", 140],
  ["notatki", "Wskazówki", 180],
];
const sekRez = (n) => Number(n).toLocaleString("pl-PL", { maximumFractionDigits: 3 });
const nowaRezyseria = () => ({ koncepcja: "", wskazowki: "", zdarzenia: [], materialy: [] });
const czasScenyRez = (w) => Math.round((Number(w.do) - Number(w.od)) * 1000) / 1000;
const liczbaZdarzenRez = (n) => n ? `${n} ${n === 1 ? "zdarzenie" : [2, 3, 4].includes(n % 10) && (n % 100 < 12 || n % 100 > 14) ? "zdarzenia" : "zdarzeń"}` : "Do rozpisania";
const typRez = (id) => S.start.rezyseria.typy[id] || id;
const statusRez = (id) => S.start.rezyseria.statusy[id] || id;
const pochodzenieRez = (id) => S.start.rezyseria.pochodzenie[id] || id;

function etykietaRez(z, plan) {
  const m = plan.materialy.find((a) => a.id === z.material);
  const zrodlo = m?.typ === z.typ && m.pochodzenie === "rzeczywiste" && m.status === "zatwierdzony" && m.zrodlo;
  if (z.typ === "komentarz" && !zrodlo) return "Komentarze ilustracyjne";
  if (z.typ === "dane" && /\d/.test(z.tekst) && !zrodlo) return "Dane do weryfikacji";
  return "";
}

function pasekRezyserii(sceny) {
  const plany = sceny.some((w) => w?.rezyseria?.zdarzenia.length || w?.rezyseria?.materialy.length || w?.rezyseria?.koncepcja || w?.rezyseria?.wskazowki);
  const braki = sceny.some((w) => w && czasScenyRez(w) > 0 && !w.rezyseria?.zdarzenia.length);
  if (!plany && !braki) return "";
  return `<div class="rzad rez-toolbar" data-rez-pasek>
    ${braki ? '<button type="button" class="btn maly" data-zadanie data-rez-gen="braki">Uzupełnij reżyserię AI</button>' : '<button type="button" class="btn maly jasny" data-zadanie data-rez-gen="wszystko">Odśwież propozycje AI</button>'}
    ${plany ? '<button type="button" class="btn maly jasny" data-rez-pobierz>Pobierz plan montażu</button>' : ""}
  </div>`;
}

function rezyseriaSceny(w, i, projekt) {
  const D = czasScenyRez(w);
  if (!Number.isFinite(D) || D <= 0) return "";
  const n = w.rezyseria?.zdarzenia.length || 0;
  return `<details class="rezyseria-sceny" data-rez-scena="${i}">
    <summary>Reżyseria montażu <small data-rez-liczba>${liczbaZdarzenRez(n)}</small></summary>
    <div class="rezyseria-body">${trescRezyserii(w, i, projekt)}</div>
  </details>`;
}

function osRezyserii(zdarzenia, D) {
  if (!zdarzenia.length) return "";
  const tory = Object.keys(S.start.rezyseria.typy).flatMap((typ) => {
    const pasma = [];
    for (const z of zdarzenia.filter((x) => x.typ === typ)) {
      let tor = pasma.find((p) => p.at(-1).do <= z.od);
      if (!tor) { tor = []; pasma.push(tor); }
      tor.push(z);
    }
    return pasma.map((z, i) => ({ typ, nazwa: i ? "" : typRez(typ), z }));
  });
  return `<div class="rez-os" aria-label="Oś czasu od początku sceny">
    <div class="rez-tor"><span>Czas sceny</span><div class="rez-linijka">${[0, 0.25, 0.5, 0.75, 1].map((p) => `<small>${sekRez(Number((D * p).toFixed(2)))} s</small>`).join("")}</div></div>
    ${tory.map((t) => `<div class="rez-tor"><span>${t.nazwa}</span><div class="rez-szyna">
      ${t.z.map((z) => `<button type="button" class="rez-blok" data-zadanie data-rez-zdarzenie="${esc(z.id)}" data-typ="${esc(z.typ)}" style="left:${100 * z.od / D}%;width:${100 * (z.do - z.od) / D}%" title="${esc(z.opis)}" aria-label="${esc(`${typRez(z.typ)} od ${sekRez(z.od)} s: ${z.opis}`)}">${esc(z.tekst || z.opis)}</button>`).join("")}
    </div></div>`).join("")}
  </div>`;
}

function kartaDopasowaniaSceny(projekt, i) {
  const d = projekt?.dopasowaniaUjec?.sceny.find((s) => s.i === i);
  if (!d) return "";
  return `<div class="rez-dopasowania"><h4>Ujęcia do tej sceny</h4>
    ${d.ujecia.length ? `<div class="rez-klipy">${d.ujecia.map((u, j) => {
      const plik = `${projekt.sciezka}/${u.src}`;
      return `<article><img alt="" src="${esc(thumb(plik, u.klatka, 240))}" loading="lazy">
        <b title="${esc(u.src)}">${esc(u.src.split("/").pop())}</b><small>${u.zrodlo === "przypisanie" ? "Przypisany materiał" : "Kandydat z indeksu"} · ${sekRez(u.od)}–${sekRez(u.do)} s</small>
        <div class="rzad"><a class="link" href="${esc(media(plik))}#t=${u.od},${u.do}" target="_blank" rel="noopener">Obejrzyj</a>
        <button class="link" data-zadanie data-rez-klip="${j}" type="button">Dodaj przebitkę</button></div></article>`;
    }).join("")}</div>` : ""}
    ${d.ujecia.some((u) => u.zrodlo === "przypisanie") ? "" : `<p class="podpowiedz">${d.ujecia.length ? "Jeśli fragmenty nie pasują, dograj" : "Do dogrania"} · ${esc(d.nagrac)}</p>`}
  </div>`;
}

function trescRezyserii(w, i, projekt) {
  const plan = w.rezyseria || nowaRezyseria();
  return `<div class="rez-koncepcja">
    ${plan.koncepcja ? `<p><b>Koncepcja</b> ${esc(plan.koncepcja)}</p>` : ""}
    ${plan.wskazowki ? `<p><b>Wskazówki</b> ${esc(plan.wskazowki)}</p>` : ""}
  </div>
  <div class="rzad rez-toolbar">
    <button class="btn maly" data-zadanie data-rez-gen="${i}">${w.rezyseria ? "Odśwież propozycje AI" : "Zaplanuj montaż sceny"}</button>
    <button class="btn maly jasny" data-zadanie data-rez-koncepcja>Edytuj koncepcję</button>
    <button class="btn maly jasny" data-zadanie data-rez-zdarzenie="">Dodaj zdarzenie</button>
    <button class="btn maly jasny" data-zadanie data-rez-material="">Dodaj materiał</button>
  </div>
  ${kartaDopasowaniaSceny(projekt, i)}
  ${osRezyserii(plan.zdarzenia, czasScenyRez(w))}
  ${plan.zdarzenia.length ? `<ul class="rez-lista" aria-label="Zdarzenia w kolejności">
    ${plan.zdarzenia.map((z) => {
      const ozn = etykietaRez(z, plan);
      return `<li><button type="button" class="rez-pozycja" data-zadanie data-rez-zdarzenie="${esc(z.id)}"><span class="rez-czas">${sekRez(z.od)}–${sekRez(z.do)} s</span>
        <span><b>${esc(typRez(z.typ))}</b> · ${esc(z.opis)}${ozn ? `<small class="rez-uwaga">${esc(ozn)}</small>` : ""}</span>
        ${z.stan === "zatwierdzony" ? '<span class="chip ok">Zatwierdzone</span>' : ""}</button></li>`;
    }).join("")}
  </ul>` : ""}
  ${plan.materialy.length ? `<h4>Materiały do montażu</h4><ul class="rez-lista" aria-label="Materiały do montażu">${plan.materialy.map((m) =>
    `<li><button type="button" class="rez-pozycja rez-material" data-zadanie data-rez-material="${esc(m.id)}"><span class="chip">${esc(statusRez(m.status))}</span>
    <span><b>${esc(typRez(m.typ))}</b> · ${esc(m.opis)}<small>${esc(pochodzenieRez(m.pochodzenie))}${m.zrodlo ? ` · ${esc(m.zrodlo)}` : ""}</small></span></button></li>`).join("")}</ul>` : ""}`;
}

const wyboryRez = (lista, val) => Object.entries(lista).map(([id, n]) =>
  `<option value="${esc(id)}"${id === val ? " selected" : ""}>${esc(n)}</option>`).join("");
const poleRez = (id, label, val, limit, required = false) =>
  `<label class="pole"><span>${label}</span><textarea name="${id}" rows="2" maxlength="${limit}"${required ? " required" : ""}>${esc(val)}</textarea></label>`;

function formularzRez(tytul, html, zapisz, usun) {
  const m = modal(`<h2>${tytul}</h2><form class="rez-form">
    ${html}<p class="rez-uwaga" role="status"></p>
    <div class="rzad"><button type="submit" class="btn">Zapisz</button>
    <button type="button" class="btn jasny" data-rez-anuluj>Anuluj</button>
    ${usun ? '<button type="button" class="btn jasny" data-rez-usun>Usuń z planu</button>' : ""}</div>
  </form>`);
  const form = $("form", m);
  const przyciski = [...form.querySelectorAll("button")];
  const wykonaj = async (fn) => {
    przyciski.forEach((b) => (b.disabled = true));
    try { await fn(); if (form.isConnected) zamknijModal(); }
    catch (e) { $("[role=status]", form).textContent = e.message; }
    finally { przyciski.forEach((b) => (b.disabled = false)); }
  };
  $("[data-rez-anuluj]", form).onclick = zamknijModal;
  if (usun) $("[data-rez-usun]", form).onclick = () => wykonaj(usun);
  form.onsubmit = (e) => { e.preventDefault(); return wykonaj(() => zapisz(Object.fromEntries(new FormData(form)))); };
  return form;
}

function edytujZdarzenieRez(plan, id, D, zapisz) {
  const z = plan.zdarzenia.find((x) => x.id === id) || { od: 0, do: Math.min(2, D), typ: "wideo", stan: "propozycja" };
  const forma = formularzRez(id ? "Zdarzenie montażowe" : "Dodaj zdarzenie", `
    <div class="kolumny">
      <label class="pole"><span>Rodzaj</span><select name="typ">${wyboryRez(S.start.rezyseria.typy, z.typ)}</select></label>
      <label class="pole"><span>Decyzja</span><select name="stan">${wyboryRez({ propozycja: "Propozycja", zatwierdzony: "Zatwierdzone" }, z.stan)}</select></label>
      <label class="pole"><span>Od początku sceny (s)</span><input type="number" name="od" min="0" max="${D}" step="0.001" value="${z.od}" required></label>
      <label class="pole"><span>Do czasu (s)</span><input type="number" name="do" min="0.001" max="${D}" step="0.001" value="${z.do}" required></label>
    </div>
    ${poleRez("opis", "Obraz i cel", z.opis, 280, true)}
    <div class="kolumny">${polaZdarzenia.slice(1).map(([k, n, l]) => poleRez(k, n, z[k], l)).join("")}</div>
    <label class="pole"><span>Materiał powiązany</span><select name="material"><option value="">Bez materiału</option>${wyboryRez(Object.fromEntries(plan.materialy.map((m) => [m.id, m.opis])), z.material)}</select></label>
    <p class="podpowiedz rez-uwaga" data-rez-zrodlo></p>`, (d) => {
    const nowy = { ...d, id: id || crypto.randomUUID(), od: Number(d.od), do: Number(d.do) };
    const zdarzenia = id ? plan.zdarzenia.map((x) => x.id === id ? nowy : x) : [...plan.zdarzenia, nowy];
    return zapisz({ ...plan, zdarzenia });
  }, id ? () => zapisz({ ...plan, zdarzenia: plan.zdarzenia.filter((x) => x.id !== id) }) : null);
  const adnotacja = () => {
    const { typ, material, tekst } = forma.elements;
    const etykieta = etykietaRez({ typ: typ.value, material: material.value, tekst: tekst.value }, plan);
    $("[data-rez-zrodlo]", forma).textContent = etykieta === "Komentarze ilustracyjne"
      ? "W kadrze umieść podpis „Komentarze ilustracyjne”."
      : etykieta;
  };
  forma.addEventListener("input", adnotacja);
  adnotacja();
}

function edytujMaterialRez(plan, id, zapisz) {
  const m = plan.materialy.find((x) => x.id === id) || { typ: "zdjecie", pochodzenie: "rzeczywiste", status: "do_pozyskania" };
  formularzRez(id ? "Materiał do montażu" : "Dodaj materiał", `
    <div class="kolumny">
      <label class="pole"><span>Rodzaj</span><select name="typ">${wyboryRez(S.start.rezyseria.typy, m.typ)}</select></label>
      <label class="pole"><span>Status</span><select name="status">${wyboryRez(S.start.rezyseria.statusy, m.status)}</select></label>
    </div>
    <label class="pole"><span>Pochodzenie</span><select name="pochodzenie">${wyboryRez(S.start.rezyseria.pochodzenie, m.pochodzenie)}</select></label>
    ${poleRez("opis", "Co dokładnie przygotować", m.opis, 280, true)}
    ${poleRez("zrodlo", "Źródło (link, ścieżka pliku lub numer nagrania)", m.zrodlo, 300)}
    `, (d) => {
    const nowy = { ...d, id: id || crypto.randomUUID() };
    const materialy = id ? plan.materialy.map((x) => x.id === id ? nowy : x) : [...plan.materialy, nowy];
    return zapisz({ ...plan, materialy });
  }, id ? () => zapisz({ ...plan,
    materialy: plan.materialy.filter((x) => x.id !== id),
    zdarzenia: plan.zdarzenia.map((z) => z.material === id ? { ...z, material: "" } : z),
  }) : null);
}

function pobierzRezyserie(P) {
  const linia = (t) => String(t || "").replace(/\s+/g, " ").trim();
  const tresc = [`# Reżyseria montażu · ${linia(P.profil?.temat || "Scenariusz")}`, ""];
  P.scenariusz.forEach((w, i) => {
    if (!w) return;
    tresc.push(`## Scena ${i + 1} · ${sekRez(w.od)}–${sekRez(w.do)} s`, "",
      `- Obraz — ${linia(w.co_widac)}`, `- Lektor — ${linia(w.mowisz)}`, "");
    const plan = w.rezyseria;
    if (!plan?.zdarzenia.length) tresc.push("Zdarzenia montażowe do rozpisania.", "");
    if (!plan) return;
    if (plan.koncepcja) tresc.push(linia(plan.koncepcja), "");
    if (plan.wskazowki) tresc.push(`Wskazówki — ${linia(plan.wskazowki)}`, "");
    for (const z of plan.zdarzenia) {
      const ozn = etykietaRez(z, plan);
      tresc.push(`### +${sekRez(z.od)}–${sekRez(z.do)} s · ${typRez(z.typ)}`, "",
        `- Stan — ${z.stan === "zatwierdzony" ? "Zatwierdzone" : "Propozycja"}`);
      if (ozn) tresc.push(`- Oznaczenie — ${ozn}`);
      for (const [k, label] of polaZdarzenia) if (z[k]) tresc.push(`- ${label} — ${linia(z[k])}`);
      if (z.material) tresc.push(`- Materiał — ${z.material}`);
      tresc.push("");
    }
    if (plan.materialy.length) tresc.push("**Materiały**", "",
      ...plan.materialy.map((m) => `- ${m.id} · ${typRez(m.typ)} · ${statusRez(m.status)} · ${pochodzenieRez(m.pochodzenie)} — ${linia(m.opis)}${m.zrodlo ? ` · ${linia(m.zrodlo)}` : ""}`), "");
  });
  const url = URL.createObjectURL(new Blob([tresc.join("\n")], { type: "text/markdown;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url; a.download = "rezyseria-montazu.md"; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function podepnijRezyserie(box, { url, dokument, odswiez, projekt }) {
  if (!box) return;
  box.addEventListener("click", async (e) => {
    const b = e.target.closest("button");
    if (!b || b.disabled) return;
    const P = dokument();
    if (!P) return;
    if (b.hasAttribute("data-rez-pobierz")) return pobierzRezyserie(P);
    if (b.hasAttribute("data-rez-gen") || b.hasAttribute("data-rez-dopasuj")) {
      b.disabled = true;
      const dopasuj = b.hasAttribute("data-rez-dopasuj"), v = b.dataset.rezGen;
      const zakres = /^\d+$/.test(v) ? Number(v) : v;
      const otwarte = new Set([...box.querySelectorAll("[data-rez-scena][open]")].map((d) => d.dataset.rezScena));
      try {
        const z = await api(`${url}/${dopasuj ? "dopasuj-ujecia" : "rezyseria"}`, { method: "POST", body: dopasuj ? undefined : { zakres } });
        const { kod } = await sledz(z, dopasuj ? "Dopasowanie ujęć do scen" : "Reżyseria montażu");
        if (kod === 0) await odswiez(otwarte);
      } catch (err) { blad(err); }
      finally { odswiezPrzyciski(); }
      return;
    }
    const el = b.closest("[data-rez-scena]");
    if (!el) return;
    const i = Number(el.dataset.rezScena);
    const w = P.scenariusz[i], plan = w.rezyseria || nowaRezyseria();
    if (b.hasAttribute("data-rez-klip")) {
      const klip = projekt?.dopasowaniaUjec?.sceny.find((s) => s.i === i)?.ujecia[Number(b.dataset.rezKlip)];
      if (klip) oknoPrzebitki(projekt, klip);
      return;
    }
    const zapisz = async (rezyseria) => {
      const { scena } = await api(`${url}/rezyseria/${i}`, { method: "PUT", body: { wersja: JSON.stringify(w), rezyseria } });
      const teraz = dokument();
      if (!teraz) return;
      teraz.scenariusz[i] = scena;
      const obecne = $(`[data-rez-scena="${i}"]`, box);
      if (obecne) {
        $("[data-rez-liczba]", obecne).textContent = liczbaZdarzenRez(scena.rezyseria.zdarzenia.length);
        $(".rezyseria-body", obecne).innerHTML = trescRezyserii(scena, i, projekt);
      }
      const pasek = $("[data-rez-pasek]", box);
      if (pasek) pasek.outerHTML = pasekRezyserii(teraz.scenariusz);
      toast("Zapisano reżyserię sceny");
    };
    if (b.hasAttribute("data-rez-zdarzenie")) return edytujZdarzenieRez(plan, b.dataset.rezZdarzenie, czasScenyRez(w), zapisz);
    if (b.hasAttribute("data-rez-material")) return edytujMaterialRez(plan, b.dataset.rezMaterial, zapisz);
    if (b.hasAttribute("data-rez-koncepcja")) {
      formularzRez("Koncepcja i wskazówki", poleRez("koncepcja", "Koncepcja montażowa", plan.koncepcja, 440)
        + poleRez("wskazowki", "Wskazówki dla montażysty", plan.wskazowki, 440), (d) => zapisz({ ...plan, ...d }));
    }
  });
}

function otworzRezyserie(otwarte, box) {
  if (!box) return;
  box.querySelectorAll("[data-rez-scena]").forEach((d) => { d.open = otwarte.has(d.dataset.rezScena); });
}

function kartaRezyseriiProjektu() {
  const projekt = S.projekt, sc = projekt.scenariusz?.scenariusz;
  if (!sc?.length) return "";
  return `<section class="karta" id="rezyseriaProjektu"><div class="naglowek"><h3>Reżyseria scenariusza</h3>
    <button class="btn maly jasny" data-zadanie data-rez-dopasuj>${projekt.dopasowaniaUjec ? "Odśwież dopasowanie ujęć" : "Dopasuj ujęcia do scen"}</button></div>
    ${projekt.dopasowaniaUjec?.uwaga ? `<p class="podpowiedz">${esc(projekt.dopasowaniaUjec.uwaga)}</p>` : ""}
    ${pasekRezyserii(sc)}${sc.map((w, i) => w ? `<div class="rez-scena-proj"><b>Scena ${i + 1} · ${sekRez(w.od)}–${sekRez(w.do)} s</b>
    <p class="podpowiedz">${esc(w.mowisz || w.co_widac)}</p>${rezyseriaSceny(w, i, projekt)}</div>` : "").join("")}</section>`;
}

function podepnijRezyserieProjektu(root) {
  const host = $("#rezyseriaProjektu", root);
  if (!host) return;
  const P = S.projekt, url = `/api/projekt/${encodeURIComponent(P.nazwa)}`;
  podepnijRezyserie(host, {
    url, projekt: P, dokument: () => S.projekt === P ? P.scenariusz : null,
    odswiez: async (otwarte) => {
      const p = await api(url);
      if (S.projekt !== P || !host.isConnected) return;
      P.scenariusz = p.scenariusz;
      P.dopasowaniaUjec = p.dopasowaniaUjec;
      host.outerHTML = kartaRezyseriiProjektu();
      otworzRezyserie(otwarte, $("#rezyseriaProjektu", root));
      podepnijRezyserieProjektu(root);
      odswiezPrzyciski();
    },
  });
}

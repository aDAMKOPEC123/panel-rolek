// Stylistyka rolek: zestawy kolorów, fontów, logo, znaku wodnego i marki (scripts/style-marki.mjs, API /api/style).
// Start: karta „🎨 Stylistyka rolek” (wybór dla nowych rolek, edytor, „Ze strony www”). Krok Styl: stylistyka tej rolki.
"use strict";

const ST = { lista: [], v: Date.now() };
const ROLE_KOL = [
  ["akcent", "Akcent", "słowa kluczowe, liczby, kreski"], ["tekst", "Tekst", "nagłówki i napisy"], ["tlo_jasne", "Tło plansz", "tło plansz, boks napisów"],
  ["cta", "Przycisk CTA", "pigułka z wezwaniem"], ["akcent_2", "Akcent 2", "ramki, etykiety przed/po"], ["nude", "Tło akcentowe", "gradienty plansz"],
  ["tekst_2", "Tekst 2", "podpisy, handle"], ["granat", "Kolor logo", "drobne akcenty"], ["zloto_jasne", "Akcent jasny", "poświata"],
  ["mocny", "Mocny", "promocje, -15%"], ["akwarela", "Plamy tła", "plamy w tle plansz"], ["bialy", "Biały", "karty, tekst na CTA"],
];
const FONTY_PL = ["Playfair Display", "Cormorant Garamond", "Lora", "Libre Baskerville", "DM Serif Display", "Prata", "Marcellus", "Cinzel", "Bodoni Moda", "EB Garamond", "Montserrat", "Poppins", "Lato", "Raleway", "Open Sans", "Inter", "Nunito", "Work Sans", "DM Sans", "Jost", "Manrope", "Quicksand", "Josefin Sans", "Mulish", "Great Vibes", "Dancing Script"];
const NAPISY_STYLE = [["este", "Este"], ["perla", "Perła"], ["waga", "Waga"], ["marker", "Marker"], ["vlog", "Vlog (naturalny)"]];

async function wczytajStyle() { ST.lista = await api("/api/style").catch(() => []); return ST.lista; }
const stylPoId = (id) => ST.lista.find((s) => s.id === (id || "marka")) || ST.lista[0];
const zaladowaneFonty = new Set();
function zaladujFont(n) {
  if (!n || zaladowaneFonty.has(n)) return;
  zaladowaneFonty.add(n);
  const l = document.createElement("link");
  l.rel = "stylesheet";
  l.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(n).replace(/%20/g, "+")}:ital,wght@0,400;0,600;0,700;1,600&display=swap`;
  document.head.appendChild(l);
}
const logoUrl = (s) => s.logo_podglad || (s.logo ? `${media(s.logo)}&v=${ST.v}` : null);
const handleStylu = (s) => { const h = s.gabinet?.instagram; return h && !/todo/i.test(h) ? (h.startsWith("@") ? h : "@" + h) : (s.gabinet?.nazwa || s.nazwa || ""); };

/** Mini rolka 9:16 w kolorach i fontach zestawu: znak wodny, hook, napis, CTA. */
function podgladStylu(s, duzy = false) {
  const k = s.kolory || {}, f = s.fonty || {};
  zaladujFont(f.naglowki); zaladujFont(f.tekst);
  const lg = logoUrl(s), wm = s._wm || (s.watermark ? `${media(s.watermark)}&v=${ST.v}` : null);
  const zm = `--p-akcent:${k.akcent || "#b07a6e"};--p-tekst:${k.tekst || "#2b2321"};--p-tlo:${k.tlo_jasne || "#f7f1ec"};--p-nude:${k.nude || "#e9d9cf"};--p-cta:${k.cta || k.akcent || "#b07a6e"};--p-akw:${k.akwarela || k.nude || "#e9d9cf"};--p-t2:${k.tekst_2 || "#8a7a73"};--p-bialy:${k.bialy || "#fff"};--p-fn:'${esc(f.naglowki || "Playfair Display")}';--p-ft:'${esc(f.tekst || "Montserrat")}'`;
  return `<div class="sp${duzy ? " duzy" : ""}" style="${zm}">
    <div class="sp-plama"></div>
    <div class="sp-znak">${wm ? `<img src="${wm}" alt="">` : esc(handleStylu(s))}</div>
    <div class="sp-hook">Brwi, które <em>trzymają</em> 6&nbsp;tygodni</div>
    <div class="sp-napis">to jest <b>najważniejsze</b> po zabiegu</div>
    ${lg ? `<img class="sp-logo" src="${lg}" alt="">` : ""}
    <div class="sp-cta">Zapisz się na wizytę →</div>
  </div>`;
}
function kafelStylu(s, wybrany, { edycja = true } = {}) {
  const k = s.kolory || {};
  return `<div class="styl-kafel${wybrany ? " wybrany" : ""}" data-styl="${esc(s.id)}" role="button" tabindex="0">
    ${podgladStylu(s)}
    <div class="styl-info"><b>${esc(s.nazwa)}</b><small>${esc(s.fonty?.naglowki || "")} · ${esc(s.fonty?.tekst || "")}</small>
      <div class="styl-kropki">${["akcent", "tekst", "tlo_jasne", "cta", "akcent_2", "nude"].map((r) => `<i style="background:${k[r] || "#ccc"}" title="${r}"></i>`).join("")}</div>
      ${s.zrodlo === "strona" && s.url ? `<small class="podpowiedz" style="margin:0">🌐 ${esc(new URL(s.url).hostname)}</small>` : ""}
    </div>
    ${edycja ? `<div class="styl-akcje"><button class="btn maly jasny" data-styl-edytuj="${esc(s.id)}" title="Edytuj">✎</button>${s.id !== "marka" ? `<button class="btn maly jasny" data-styl-usun="${esc(s.id)}" title="Usuń">✕</button>` : ""}</div>` : ""}
  </div>`;
}

// ---------- Start: karta ----------
async function kartaStylistyki() {
  const box = $("#stylKarta"); if (!box) return;
  await wczytajStyle();
  const dla = ST.lista.find((s) => s.dla_nowych) || ST.lista[0];
  box.innerHTML = `<div class="karta"><div class="naglowek"><div><h3>🎨 Stylistyka rolek <small class="podpowiedz">nowe rolki: <b>${esc(dla?.nazwa || "")}</b></small></h3>
      <p class="podpowiedz">Kolory, fonty, logo, znak wodny i nazwa marki. Kliknij zestaw, żeby nowe rolki (też z autopilota i pomysłów) dostały go od startu. Każdą rolkę zmienisz potem w kroku Styl.</p></div>
      <div class="rzad" style="gap:8px"><button class="btn maly" id="stylStrona">🌐 Ze strony www</button><button class="btn maly jasny" id="stylNowy">+ Własna stylistyka</button></div></div>
    <div class="style-kafle">${ST.lista.map((s) => kafelStylu(s, s.dla_nowych)).join("")}</div></div>`;
  podepnijKafleStylu(box, async (id) => {
    try { ST.lista = await api(`/api/styl/${id}/dla-nowych`, { method: "POST" }); toast(`Nowe rolki: ${stylPoId(id).nazwa}`); kartaStylistyki(); } catch (e) { blad(e); }
  }, kartaStylistyki);
  $("#stylNowy", box).onclick = () => edytorStylu(nowyZestaw(), { nowy: true, po: kartaStylistyki });
  $("#stylStrona", box).onclick = () => stylZeStrony(kartaStylistyki);
}
function nowyZestaw() {
  const b = stylPoId("marka") || { kolory: {}, fonty: {} };
  return { nazwa: "Nowa stylistyka", kolory: { ...b.kolory }, fonty: { ...b.fonty }, gabinet: { nazwa: "", instagram: "" }, ruch: b.ruch || "miekki", napisy: b.napisy || "perla" };
}
function podepnijKafleStylu(root, wybierz, odswiez) {
  root.querySelectorAll("[data-styl]").forEach((d) => {
    d.onclick = (e) => { if (e.target.closest("[data-styl-edytuj],[data-styl-usun]")) return; wybierz(d.dataset.styl); };
    d.onkeydown = (e) => { if (e.key === "Enter") wybierz(d.dataset.styl); };
  });
  root.querySelectorAll("[data-styl-edytuj]").forEach((b) => (b.onclick = () => edytorStylu(structuredClone(stylPoId(b.dataset.stylEdytuj)), { po: odswiez })));
  root.querySelectorAll("[data-styl-usun]").forEach((b) => (b.onclick = () => {
    const s = stylPoId(b.dataset.stylUsun);
    const m = modal(`<h2>Usunąć „${esc(s.nazwa)}”?</h2><p>Zestaw z logo zniknie z 02_BRAND/style. Rolki, które go używają, wrócą do głównej marki przy następnym złożeniu.</p><div class="rzad"><button class="btn uwaga" id="tak">Usuń</button><button class="btn jasny" id="nie">Anuluj</button></div>`);
    $("#nie", m).onclick = zamknijModal;
    $("#tak", m).onclick = async () => { try { await api(`/api/styl/${s.id}`, { method: "DELETE" }); zamknijModal(); toast("Usunięto"); odswiez(); } catch (e) { blad(e); } };
  }));
}

// ---------- edytor ----------
function edytorStylu(s, { nowy = false, zeStrony = false, po } = {}) {
  s.kolory ||= {}; s.fonty ||= {}; s.gabinet ||= {};
  const pliki = {};
  let ostatniKolor = "akcent";
  const poleKoloru = ([k, n, o]) => `<label class="styl-kolor" title="${esc(o)}"><input type="color" data-kol="${k}" value="${s.kolory[k] || "#cccccc"}"><span><b>${n}</b><small>${o}</small></span></label>`;
  const m = modal(`<h2>${zeStrony ? "🌐 Stylistyka ze strony" : nowy ? "+ Nowa stylistyka" : `✎ ${esc(s.nazwa)}`}</h2>
    ${s.id === "marka" ? `<p class="podpowiedz">To główna marka: zmiany zapisują się w config.json, logo w 02_BRAND/logo, znak wodny w 02_BRAND/watermark.</p>` : ""}
    ${s.uwagi?.length ? `<ul class="styl-uwagi">${s.uwagi.map((u) => `<li>${esc(u)}</li>`).join("")}</ul>` : ""}
    <div class="styl-edytor">
      <div class="styl-pola">
        <label class="pole"><span>Nazwa zestawu</span><input id="seNazwa" value="${esc(s.nazwa || "")}"></label>
        <div class="rzad" style="gap:10px"><label class="pole" style="flex:1"><span>Nazwa marki (plansze)</span><input id="seMarka" value="${esc(s.gabinet.nazwa || "")}"></label>
          <label class="pole" style="flex:1"><span>Instagram (znak wodny)</span><input id="seIg" value="${esc(s.gabinet.instagram || "")}" placeholder="@konto"></label></div>
        <h4>Kolory</h4>
        ${s.paleta?.length ? `<p class="podpowiedz" style="margin:0 0 6px">Kolory ze strony: kliknij pole koloru, potem kropkę, żeby ją tam wstawić.</p><div class="styl-paleta">${s.paleta.map((c) => `<button data-paleta="${c}" style="background:${c}" title="${c}"></button>`).join("")}</div>` : ""}
        <div class="styl-kolory">${ROLE_KOL.slice(0, 4).map(poleKoloru).join("")}</div>
        <details><summary class="podpowiedz">Pozostałe kolory (${ROLE_KOL.length - 4})</summary><div class="styl-kolory">${ROLE_KOL.slice(4).map(poleKoloru).join("")}</div></details>
        <h4>Fonty</h4>
        <datalist id="fontyPl">${FONTY_PL.map((n) => `<option value="${n}">`).join("")}</datalist>
        <div class="rzad" style="gap:10px"><label class="pole" style="flex:1"><span>Nagłówki</span><input id="seFn" list="fontyPl" value="${esc(s.fonty.naglowki || "")}"></label>
          <label class="pole" style="flex:1"><span>Tekst i napisy</span><input id="seFt" list="fontyPl" value="${esc(s.fonty.tekst || "")}"></label></div>
        ${s.fonty_strony && (s.fonty_strony.naglowki || s.fonty_strony.tekst) ? `<p class="podpowiedz" style="margin-top:-6px">Na stronie: ${esc(s.fonty_strony.naglowki || "?")} / ${esc(s.fonty_strony.tekst || "?")}</p>` : ""}
        <p class="podpowiedz" style="margin-top:-6px">Nazwa z Google Fonts (z polskimi znakami). Render pobiera font sam.</p>
        <div class="rzad" style="gap:10px"><label class="pole" style="flex:1"><span>Styl ruchu</span><select id="seRuch">${STYLE_RUCHU.map(([k, n]) => `<option value="${k}" ${s.ruch === k ? "selected" : ""}>${n}</option>`).join("")}</select></label>
          <label class="pole" style="flex:1"><span>Styl napisów</span><select id="seNapisy">${NAPISY_STYLE.map(([k, n]) => `<option value="${k}" ${s.napisy === k ? "selected" : ""}>${n}</option>`).join("")}</select></label></div>
        <h4>Logo i znak wodny</h4>
        <div class="rzad" style="gap:10px;align-items:flex-start">
          <label class="styl-plik"><input type="file" id="seLogo" accept=".png,.svg,.webp,.jpg,.jpeg" hidden><b>Logo</b><small id="seLogoInfo">${s.logo || s.logo_podglad ? `${esc(s.logo_skad || "jest")} · zmień` : "PNG bez tła albo SVG"}</small></label>
          <label class="styl-plik"><input type="file" id="seWm" accept=".png,.svg,.webp" hidden><b>Znak wodny</b><small id="seWmInfo">${s.watermark ? "jest · zmień" : "brak = handle z Instagrama"}</small></label>
        </div>
        <p class="podpowiedz">Logo idzie na planszę „Obserwuj” i do CTA (opcja „pokaż logo”). Znak wodny: mały, jednokolorowy PNG.</p>
      </div>
      <div class="styl-podglad" id="sePodglad">${podgladStylu(s, true)}</div>
    </div>
    <div class="rzad" style="margin-top:14px"><button class="btn duzy" id="seZapisz">${nowy ? "Zapisz stylistykę" : "Zapisz zmiany"}</button><button class="btn jasny" id="seNie">Anuluj</button></div>`);
  const czytaj = () => {
    s.nazwa = $("#seNazwa", m).value.trim() || "Stylistyka";
    s.gabinet = { nazwa: $("#seMarka", m).value.trim(), instagram: $("#seIg", m).value.trim() };
    m.querySelectorAll("[data-kol]").forEach((i) => (s.kolory[i.dataset.kol] = i.value.toUpperCase()));
    s.fonty = { naglowki: $("#seFn", m).value.trim() || "Playfair Display", tekst: $("#seFt", m).value.trim() || "Montserrat" };
    s.ruch = $("#seRuch", m).value; s.napisy = $("#seNapisy", m).value;
  };
  const odswiez = () => { czytaj(); $("#sePodglad", m).innerHTML = podgladStylu(s, true); };
  m.querySelectorAll("input:not([type=file]),select").forEach((i) => (i.oninput = i.onchange = debounce(odswiez, 150)));
  m.querySelectorAll("[data-kol]").forEach((i) => i.addEventListener("focus", () => (ostatniKolor = i.dataset.kol)));
  m.querySelectorAll("[data-kol]").forEach((i) => i.addEventListener("click", () => (ostatniKolor = i.dataset.kol)));
  m.querySelectorAll("[data-paleta]").forEach((b) => (b.onclick = () => {
    const i = m.querySelector(`[data-kol="${ostatniKolor}"]`); if (!i) return;
    i.value = b.dataset.paleta; odswiez(); toast(`${ROLE_KOL.find((r) => r[0] === ostatniKolor)?.[1]}: ${b.dataset.paleta}`, 1200);
  }));
  const wybierzPlik = (id, rodzaj, info) => ($(id, m).onchange = (e) => {
    const f = e.target.files[0]; if (!f) return;
    pliki[rodzaj] = f;
    const url = URL.createObjectURL(f);
    if (rodzaj === "logo") { s.logo_podglad = url; delete s.logo_klucz; } else { s.watermark = null; s._wm = url; }
    $(info, m).textContent = f.name;
    odswiez();
    if (rodzaj === "watermark") { const z = $("#sePodglad .sp-znak", m); if (z) z.innerHTML = `<img src="${url}" alt="">`; }
  });
  wybierzPlik("#seLogo", "logo", "#seLogoInfo");
  wybierzPlik("#seWm", "watermark", "#seWmInfo");
  $("#seNie", m).onclick = zamknijModal;
  $("#seZapisz", m).onclick = async (e) => {
    czytaj();
    e.target.disabled = true;
    try {
      const dane = { nazwa: s.nazwa, opis: s.opis, zrodlo: s.zrodlo, url: s.url, kolory: s.kolory, fonty: s.fonty, gabinet: s.gabinet, ruch: s.ruch, napisy: s.napisy, uwagi: s.uwagi };
      let w;
      if (zeStrony) w = await api("/api/style/strona/zapisz", { method: "POST", body: { ...dane, logo_klucz: pliki.logo ? null : s.logo_klucz } });
      else if (nowy) w = await api("/api/style", { method: "POST", body: dane });
      else w = await api(`/api/styl/${s.id}`, { method: "PUT", body: dane });
      for (const [rodzaj, f] of Object.entries(pliki)) {
        const r = await fetch(`/api/styl/${w.id}/plik?rodzaj=${rodzaj}&nazwa=${encodeURIComponent(f.name)}`, { method: "POST", body: f });
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).blad || "Nie udało się wgrać pliku");
      }
      ST.v = Date.now();
      await wczytajStyle();
      zamknijModal();
      toast(`Zapisano „${w.nazwa}” ✓`);
      if (s.id === "marka") S.start = await api("/api/start").catch(() => S.start);
      po?.(w.id);
    } catch (err) { e.target.disabled = false; blad(err); }
  };
}

// ---------- ze strony www ----------
function stylZeStrony(po) {
  const m = modal(`<h2>🌐 Stylistyka ze strony www</h2>
    <p class="podpowiedz">Wpisz adres strony gabinetu albo marki. Panel odczyta kolory, fonty, logo i nazwę, pokaże podgląd, a Ty poprawisz, co trzeba, zanim zapiszesz.</p>
    <label class="pole"><span>Adres strony</span><input id="ssUrl" placeholder="np. twojgabinet.pl" autofocus></label>
    <div id="ssStan"></div>
    <div class="rzad"><button class="btn duzy" id="ssCzytaj">Odczytaj stronę</button><button class="btn jasny" id="ssNie">Anuluj</button></div>`);
  $("#ssNie", m).onclick = zamknijModal;
  const czytaj = async () => {
    const url = $("#ssUrl", m).value.trim();
    if (!url) return toast("Wpisz adres strony");
    $("#ssCzytaj", m).disabled = true;
    $("#ssStan", m).innerHTML = `<p class="podpowiedz">⏳ Czytam stronę, arkusze stylów i logo (kilka sekund)...</p>`;
    try {
      const W = await api("/api/style/strona", { method: "POST", body: { url } });
      edytorStylu(W, { nowy: true, zeStrony: true, po });
    } catch (e) {
      $("#ssCzytaj", m).disabled = false;
      $("#ssStan", m).innerHTML = `<p style="color:var(--blad)">✗ ${esc(e.message)}</p><p class="podpowiedz">Niektóre strony (np. Instagram, Booksy profilu, strony za logowaniem) nie dają się odczytać. Spróbuj adresu strony głównej albo zrób stylistykę ręcznie.</p>`;
    }
  };
  $("#ssCzytaj", m).onclick = czytaj;
  $("#ssUrl", m).onkeydown = (e) => { if (e.key === "Enter") czytaj(); };
}

// ---------- krok Styl: stylistyka tej rolki ----------
async function kartaStyluRolki(box) {
  if (!box) return;
  if (!ST.lista.length) await wczytajStyle();
  const r = rolka();
  const akt = stylPoId(r.styl)?.id || "marka";
  const brak = r.styl && !ST.lista.some((s) => s.id === r.styl);
  box.innerHTML = `<div class="karta"><div class="naglowek"><div><h3>🎨 Stylistyka rolki</h3><p class="podpowiedz">Kolory, fonty, logo, znak wodny i nazwa marki w tej rolce. Wybór ustawia też styl ruchu i napisów z zestawu (niżej możesz je zmienić). Działa przy następnym złożeniu i renderze.</p>
      ${brak ? `<p style="color:var(--blad)">⚠ Rolka wskazuje stylistykę „${esc(r.styl)}”, której już nie ma. Składa się w głównej marce.</p>` : ""}</div>
      <div class="rzad" style="gap:8px"><button class="btn maly" id="srStrona">🌐 Ze strony www</button><button class="btn maly jasny" id="srNowy">+ Nowa</button></div></div>
    <div class="style-kafle">${ST.lista.map((s) => kafelStylu(s, s.id === akt)).join("")}</div></div>`;
  const wybierz = (id) => {
    const s = stylPoId(id);
    if (id === "marka") delete r.styl; else r.styl = id;
    if (s.ruch) r.ruch = s.ruch;
    if (s.napisy) r.napisy = { ...(r.napisy || {}), styl: s.napisy };
    zapiszRolke();
    toast(`Stylistyka: ${s.nazwa}`);
    pokaz();
  };
  const odswiez = async (id) => { await wczytajStyle(); if (id && id !== akt && ST.lista.some((s) => s.id === id)) return wybierz(id); kartaStyluRolki(box); };
  podepnijKafleStylu(box, wybierz, odswiez);
  $("#srNowy", box).onclick = () => edytorStylu(nowyZestaw(), { nowy: true, po: odswiez });
  $("#srStrona", box).onclick = () => stylZeStrony(odswiez);
}

// ---------- krok Styl: charakter montażu (reklamowy / naturalny jak vlog), scripts/montaz-naturalny.mjs ----------
const OPIS_NATURALNEGO = [
  ["🗣️", "Hook i CTA jako zwykły tekst z Instagrama (biała ramka), bez plansz i pigułek"],
  ["✂️", "Same cięcia, przenikanie i whip, bez błysków, świateł i fal"],
  ["💬", "Napisy jak u twórczyń: białe, proste, słowo po słowie, bez kolorów marki"],
  ["🔇", "Bez whooshy, popów, emoji, paska postępu i skoków kadru"],
  ["🚫", "Bez znaku wodnego i kart: Obserwuj, cena, podpis z imieniem, ozdobniki, kino"],
];
function kartaCharakteru(box) {
  if (!box) return;
  const r = rolka();
  const nat = r.montaz === "naturalny";
  const preset = wybranyStylMontazu();
  box.innerHTML = `<div class="karta"><h3>🎬 Charakter montażu</h3>
    <p class="podpowiedz" style="margin-bottom:10px">Reklamowy pokazuje markę (plansze, logo, dźwięki, przejścia). Naturalny wygląda jak rolka vlogerki z telefonu: mniej „agencji”, więcej Ciebie. Ujęcia, mowa, przed/po i zajawka zostają, a ustawienia rolki się nie gubią: wrócisz jednym kliknięciem.</p>
    <div class="charakter">
      <button class="charakter-opcja ${nat || preset ? "" : "wybrany"}" data-montaz="reklamowy"><b>📣 Reklamowy</b><small>Plansze z hookiem i CTA w kolorach marki, logo, znak wodny, dźwięki, efekty przejść. Wszystko, co ustawisz niżej.</small></button>
      <button class="charakter-opcja ${nat ? "wybrany" : ""}" data-montaz="naturalny"><b>🤳 Naturalny, jak vlog</b><small>${OPIS_NATURALNEGO.map(([i, t]) => `${i} ${t}`).join("<br>")}</small></button>
    </div>
    ${nat ? `<p class="podpowiedz" style="margin-top:10px">Działa przy składaniu: efekty i style niżej zostają zapisane, ale w tym trybie zloz je pomija. Tekst z Instagrama możesz też dodać ręcznie jako scenę „Tekst z Instagrama” w kroku Sceny. Mów do kamery jak do koleżanki, a CTA powiedz słowami („napisz mi, to podeślę termin”).</p>` : ""}</div>
    <div class="panel-presetow"></div>`;
  box.querySelectorAll("[data-montaz]").forEach((b) => (b.onclick = () => {
    if (b.dataset.montaz === "naturalny") r.montaz = "naturalny"; else delete r.montaz;
    zapiszRolke();
    toast(b.dataset.montaz === "naturalny" ? "Montaż naturalny, jak vlog" : "Montaż reklamowy");
    kartaCharakteru(box);
  }));
  kartaPresetowMontazu($(".panel-presetow", box));
}
function wybranyStylMontazu() {
  return S.start?.styleMontazu?.find((p) => p.id === S.projekt?.rolka?.montaz);
}

function kartaPresetowMontazu(box) {
  if (!box || !S.start.styleMontazu?.length) return;
  const P = S.projekt;
  const r = rolka();
  const maMaterial = P.pliki.proxy.some((p) => p.typ === "wideo") || r.ujecia.some((u) => u.src && metaPliku(u.src));
  box.innerHTML = `<section class="karta"><h3>Presety montażu</h3>
    <div class="presety-montazu">${S.start.styleMontazu.map((p) => {
      const aktywny = p.id === r.montaz;
      return `<article class="preset-montazu ${aktywny ? "wybrany" : ""}" data-preset="${p.id}">
        <h4>${esc(p.nazwa)}</h4><p>${esc(p.opis)}</p>
        <div class="rzad">
          <button type="button" class="btn maly jasny" data-preset-podglad data-zadanie ${maMaterial ? "" : 'disabled data-zablokowany="1"'}>Podgląd</button>
          <button type="button" class="btn maly" data-preset-zastosuj data-zadanie ${aktywny ? 'disabled data-zablokowany="1"' : ""}>${aktywny ? "Aktywny" : "Zastosuj"}</button>
        </div>
      </article>`;
    }).join("")}</div>
    ${maMaterial ? "" : `<p class="podpowiedz">Przygotuj nagrania, aby obejrzeć podgląd.</p>`}
    <div class="preset-podglad" hidden></div>
  </section>`;
  const podglad = $(".preset-podglad", box);
  for (const karta of box.querySelectorAll("[data-preset]")) {
    const p = S.start.styleMontazu.find((s) => s.id === karta.dataset.preset);
    $("[data-preset-podglad]", karta).onclick = () => podgladStyluMontazu(P, podglad, p);
    $("[data-preset-zastosuj]", karta).onclick = async () => {
      box.querySelectorAll("[data-zadanie]").forEach((b) => { b.disabled = true; });
      try {
        const zapis = await api(`/api/projekt/${encodeURIComponent(P.nazwa)}/rolka`, { method: "PUT", body: { ...r, montaz: p.id } });
        r.montaz = p.id;
        P.rolkaZmiana = zapis.zmiana;
        if (S.projekt === P) {
          pokaz();
          toast(`Styl montażu: ${p.nazwa}`);
        }
      } catch (e) {
        blad(e);
      } finally {
        odswiezPrzyciski();
      }
    };
  }
  odswiezPrzyciski();
}

async function podgladStyluMontazu(projekt, box, preset) {
  if (S.zadanie || box.dataset.ladowanie) return;
  box.dataset.ladowanie = "1";
  box.hidden = false;
  box.innerHTML = `<p class="podpowiedz" role="status">Składam podgląd · ${esc(preset.nazwa)}…</p>`;
  try {
    const z = await api(`/api/projekt/${encodeURIComponent(projekt.nazwa)}/podglad-stylu`, { method: "POST", body: { styl: preset.id } });
    const { kod, tekst } = await sledz(z, `Podgląd · ${preset.nazwa}`);
    if (kod !== 0) throw new Error(tekst.split("\n").find((l) => l.includes("BŁĄD:")) || "Podgląd przerwany.");
    if (!box.isConnected || S.projekt !== projekt) return;
    box.innerHTML = `<hyperframes-player runtime-src="/vendor/hyperframe.runtime.iife.js"></hyperframes-player>
      <div><h4>${esc(preset.nazwa)}</h4><p class="podpowiedz">Pierwsze 7 sekund z dźwiękiem.</p>
        <div class="rzad"><button type="button" class="btn maly" data-graj disabled>Odtwórz</button><button type="button" class="btn maly jasny" data-zamknij>Zamknij</button></div></div>`;
    const player = $("hyperframes-player", box);
    const graj = $("[data-graj]", box);
    const granica = () => Math.min(7, player.duration || 7);
    player.addEventListener("ready", () => { graj.disabled = false; }, { once: true });
    player.addEventListener("timeupdate", () => {
      if (player.currentTime >= granica() - 0.03) { player.pause(); graj.textContent = "Odtwórz od początku"; }
    });
    graj.onclick = () => {
      if (player.paused) {
        if (player.currentTime >= granica() - 0.05) player.seek(0);
        player.play();
        graj.textContent = "Pauza";
      } else {
        player.pause();
        graj.textContent = "Wznów";
      }
    };
    $("[data-zamknij]", box).onclick = () => { player.pause(); box.hidden = true; box.replaceChildren(); };
    player.setAttribute("src", `${z.src}?v=${Date.now()}`);
  } catch (e) {
    box.innerHTML = `<p class="podpowiedz" role="status">${esc(e.message)}</p>`;
  } finally {
    delete box.dataset.ladowanie;
  }
}

function uwagaMontazu() {
  const preset = wybranyStylMontazu();
  if (preset) return `\nSTYL MONTAŻU: ${preset.nazwa} (rolka.json -> "montaz": "${preset.id}"). ${preset.wskazowka} Zostaw wybrany identyfikator podczas zapisu.\n`;
  return S.projekt?.rolka?.montaz === "naturalny"
    ? `\nMONTAŻ NATURALNY (rolka.json -> montaz: "naturalny"): rolka ma wyglądać jak u vlogerki, nie jak reklama. Nie dodawaj plansz reklamowych (ig-obserwuj, cena-oferta, cena-za-postacia, lower-third, ozdobniki, kino) ani sfx; tekst na ekranie jako scena tekst-natywny (krótko, małymi literami jak w aplikacji, bez *akcentów*); CTA miękko, słowami ${OS().dop}; przejścia: cięcie. zloz sam przerabia hook-tytul i cta-koncowe na tekst-natywny i wyłącza efekty reklamowe (scripts/montaz-naturalny.mjs), więc nie usuwaj ich z rolka.json.\n`
    : "";
}

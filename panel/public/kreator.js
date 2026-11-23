// Kreator pierwszego uruchomienia: pełnoekranowa nakładka w 5 krokach (panel/kreator.mjs, API /api/kreator, /api/profil, /api/programy).
// Pokazuje się sam, dopóki config.json nie ma znacznika kreator.zrobiony; później: „⚙ Ustawienia gabinetu”.
"use strict";

const KR = { krok: 0, dane: {}, programy: null, strona: null, otwarty: false };
const KROKI_KREATORA = ["👋 Ty i gabinet", "📱 Gdzie publikujesz", "🎨 Wygląd marki", "🔧 Programy", "🎉 Gotowe"];
const bezTodo = (v) => (v && !/^todo$/i.test(String(v).trim()) ? String(v) : "");

async function otworzKreator(krok = 0) {
  let d;
  try { d = await api("/api/kreator"); } catch (e) { return blad(e); }
  const g = d.gabinet || {};
  KR.dane = { osoba: bezTodo(g.osoba), nazwa: bezTodo(g.nazwa), miasto: bezTodo(g.miasto), instagram: bezTodo(g.instagram), tiktok: bezTodo(g.tiktok), link_w_bio: bezTodo(g.link_w_bio), uslugi: g.uslugi || [], cta: bezTodo(d.cta?.domyslne) };
  KR.krok = krok; KR.strona = null; KR.otwarty = true;
  let el = $("#kreator");
  if (!el) { el = document.createElement("div"); el.id = "kreator"; document.body.appendChild(el); }
  el.classList.remove("ukryte");
  document.body.classList.add("kreator-on");
  rysujKreator();
}
function zamknijKreator() {
  KR.otwarty = false;
  $("#kreator")?.classList.add("ukryte");
  document.body.classList.remove("kreator-on");
}
function rysujKreator() {
  const el = $("#kreator");
  const k = KR.krok;
  el.innerHTML = `<div class="kr-okno">
    <div class="kr-gora"><div class="kr-kropki">${KROKI_KREATORA.map((t, i) => `<span class="${i < k ? "zrobiony" : i === k ? "teraz" : ""}" title="${esc(t)}"></span>`).join("")}</div>
      ${k < 4 ? `<button class="link" id="krPomin">Pomiń, ustawię później</button>` : ""}</div>
    <div class="kr-tresc" id="krTresc"></div>
    <div class="kr-dol">${k > 0 && k < 4 ? `<button class="btn jasny" id="krWstecz">← Wstecz</button>` : "<span></span>"}<span class="podpowiedz">Krok ${k + 1} z ${KROKI_KREATORA.length}</span>${k < 4 ? `<button class="btn duzy" id="krDalej">Dalej →</button>` : "<span></span>"}</div>
  </div>`;
  [krokProfil, krokPublikacja, krokWyglad, krokProgramy, krokGotowe][k]($("#krTresc"));
  const pomin = $("#krPomin");
  if (pomin) pomin.onclick = async () => { await api("/api/kreator/gotowe", { method: "POST", body: { zrobiony: true } }).catch(() => {}); zamknijKreator(); toast("Kreator wróci pod „⚙ Ustawienia gabinetu”", 3500); };
  const w = $("#krWstecz"); if (w) w.onclick = () => { zbierz(); KR.krok--; rysujKreator(); };
  const dalej = $("#krDalej"); if (dalej) dalej.onclick = async () => {
    zbierz();
    if (k === 0 && !KR.dane.nazwa) return toast("Wpisz nazwę gabinetu");
    if (k <= 1) { try { const g = await api("/api/profil", { method: "PUT", body: KR.dane }); if (S.start?.config) S.start.config.gabinet = g; } catch (e) { return blad(e); } }
    KR.krok++; rysujKreator();
  };
  el.querySelector("input")?.focus();
}
// pola z bieżącego kroku -> KR.dane
function zbierz() {
  document.querySelectorAll("#krTresc [data-pole]").forEach((i) => (KR.dane[i.dataset.pole] = i.value.trim()));
  const us = document.querySelectorAll("#krTresc [data-usluga]");
  if (us.length) KR.dane.uslugi = [...us].filter((b) => b.classList.contains("wybrany")).map((b) => b.dataset.usluga);
}
const poleKr = (k, etykieta, ph = "", typ = "text") => `<label class="pole"><span>${etykieta}</span><input type="${typ}" data-pole="${k}" value="${esc(KR.dane[k] || "")}" placeholder="${esc(ph)}"></label>`;

function krokProfil(el) {
  el.innerHTML = `<h1>Cześć! Ustawmy panel pod Ciebie</h1><p class="kr-lead">To ok. 2 minuty. Wszystko zmienisz później w „⚙ Ustawienia gabinetu”.</p>
    <div class="kr-dwie">${poleKr("osoba", "Jak masz na imię?", "np. Ania")}${poleKr("nazwa", "Nazwa gabinetu", "np. Studio Urody Lila")}</div>
    ${poleKr("miasto", "Miasto", "np. Kraków (do lokalnych hashtagów)")}
    <p class="kr-etykieta">Czym się zajmujesz? <small class="podpowiedz">Claude dobierze pomysły i słownictwo</small></p>
    <div class="kafle">${(S.start?.kategorie || []).map((c) => `<button class="kafel ${KR.dane.uslugi.includes(c) ? "wybrany" : ""}" data-usluga="${c}"><span class="ikona">${IKONY[c] || "✨"}</span>${NAZWY_KAT[c] || c}</button>`).join("")}</div>`;
  el.querySelectorAll("[data-usluga]").forEach((b) => (b.onclick = () => b.classList.toggle("wybrany")));
}
function krokPublikacja(el) {
  el.innerHTML = `<h1>Gdzie publikujesz?</h1><p class="kr-lead">Konto pojawi się w znaku wodnym, na planszy „Obserwuj” i w opisach. Puste pola możesz zostawić.</p>
    <div class="kr-dwie">${poleKr("instagram", "Instagram", "@twoj_gabinet")}${poleKr("tiktok", "TikTok", "@twoj_gabinet")}</div>
    ${poleKr("link_w_bio", "Link w bio (zapisy)", "np. booksy.com/... albo strona", "url")}
    ${poleKr("cta", "Twoje wezwanie na końcu rolki", "np. Zapisz się na wizytę")}
    <div class="karta kr-opcja"><b>📸 Wyniki rolek same z Instagrama</b> <small class="podpowiedz">opcjonalnie, można później</small>
      <p class="podpowiedz" style="margin:4px 0 8px">Panel sam pobierze wyświetlenia, % pominięć, zapisy i wysłania każdej rolki, a przepis na rolki zacznie się uczyć na Twoich wynikach.</p>
      <button class="btn jasny" id="krIG">Połącz Instagram</button></div>`;
  $("#krIG").onclick = () => { zbierz(); oknoInstagrama(); };
}
function krokWyglad(el) {
  const marka = stylPoId("marka");
  el.innerHTML = `<h1>Jak wygląda Twoja marka?</h1><p class="kr-lead">Kolory, fonty i logo trafią do napisów, plansz i okładek. Masz stronę? Odczytam ją sama.</p>
    <div class="kr-wyglad">
      <div class="kr-podglad" id="krPodglad">${marka ? podgladStylu(marka, true) : ""}</div>
      <div>
        <div class="karta kr-opcja"><b>🌐 Mam stronę www</b>
          <div class="rzad" style="margin-top:8px;flex-wrap:nowrap"><input id="krUrl" placeholder="np. twojgabinet.pl" style="flex:1"><button class="btn" id="krCzytaj">Odczytaj</button></div>
          <div id="krStrona"></div></div>
        <div class="karta kr-opcja"><b>🖼️ Logo</b> <small class="podpowiedz">${marka?.logo ? "✓ jest" : "PNG bez tła albo SVG"}</small>
          <div class="rzad" style="margin-top:8px"><label class="btn jasny">Wgraj logo<input type="file" id="krLogo" accept=".png,.svg,.webp,.jpg,.jpeg" hidden></label></div></div>
        <div class="karta kr-opcja"><b>🎨 Ustawię kolory i fonty sama</b><div class="rzad" style="margin-top:8px"><button class="btn jasny" id="krEdytuj">Otwórz edytor wyglądu</button></div></div>
        <p class="podpowiedz">Nie masz pomysłu? Kliknij „Dalej”, zostanie obecny wygląd. Później możesz też mieć kilka stylistyk (np. na promocje).</p>
      </div></div>`;
  const odswiezPodglad = async () => { await wczytajStyle(); ST.v = Date.now(); if (KR.krok === 2) krokWyglad($("#krTresc")); };
  $("#krEdytuj").onclick = () => edytorStylu(structuredClone(stylPoId("marka")), { po: odswiezPodglad });
  $("#krLogo").onchange = async (e) => {
    const f = e.target.files[0]; if (!f) return;
    const r = await fetch(`/api/styl/marka/plik?rodzaj=logo&nazwa=${encodeURIComponent(f.name)}`, { method: "POST", body: f });
    if (!r.ok) return blad(new Error((await r.json().catch(() => ({}))).blad || "Nie udało się wgrać logo"));
    toast("Logo zapisane ✓"); odswiezPodglad();
  };
  const czytaj = async () => {
    const url = $("#krUrl").value.trim(); if (!url) return toast("Wpisz adres strony");
    $("#krCzytaj").disabled = true;
    $("#krStrona").innerHTML = `<p class="podpowiedz">⏳ Czytam stronę…</p>`;
    try {
      const W = await api("/api/style/strona", { method: "POST", body: { url } });
      KR.strona = W;
      $("#krPodglad").innerHTML = podgladStylu({ ...W, watermark: null }, true);
      $("#krStrona").innerHTML = `<p class="podpowiedz" style="margin-top:8px">Podgląd obok: kolory ${Object.values(W.kolory).slice(0, 4).map((c) => `<i class="kr-kolor" style="background:${c}"></i>`).join("")}, fonty ${esc(W.fonty.naglowki)} / ${esc(W.fonty.tekst)}${W.logo_skad ? `, logo (${esc(W.logo_skad)})` : ", bez logo"}.</p>
        ${W.uwagi?.length ? `<ul class="styl-uwagi">${W.uwagi.map((u) => `<li>${esc(u)}</li>`).join("")}</ul>` : ""}
        <div class="rzad"><button class="btn" id="krUzyj">✓ Użyj tego wyglądu</button><button class="btn jasny" id="krPopraw">Popraw w edytorze</button></div>`;
      const uzyj = async (dane) => {
        // profil z kroku 1-2 ma pierwszeństwo przed nazwą i kontem odczytanymi ze strony
        await api("/api/styl/marka", { method: "PUT", body: { ...stylPoId("marka"), kolory: dane.kolory, fonty: dane.fonty, ruch: dane.ruch || stylPoId("marka").ruch, napisy: stylPoId("marka").napisy, gabinet: { nazwa: KR.dane.nazwa || dane.gabinet?.nazwa, instagram: KR.dane.instagram || dane.gabinet?.instagram } } });
        if (W.logo_klucz && !stylPoId("marka").logo) await api("/api/styl/marka/logo-ze-strony", { method: "POST", body: { logo_klucz: W.logo_klucz } }).catch(() => {});
        if (!KR.dane.instagram && dane.gabinet?.instagram) { KR.dane.instagram = dane.gabinet.instagram; await api("/api/profil", { method: "PUT", body: { instagram: dane.gabinet.instagram } }).catch(() => {}); }
        toast("Wygląd marki zapisany ✓"); KR.strona = null; odswiezPodglad();
      };
      $("#krUzyj").onclick = () => uzyj(W).catch(blad);
      $("#krPopraw").onclick = () => edytorStylu({ ...structuredClone(W), id: "marka", gabinet: { nazwa: KR.dane.nazwa || W.gabinet?.nazwa, instagram: KR.dane.instagram || W.gabinet?.instagram } }, { po: async () => {
        if (W.logo_klucz && !stylPoId("marka")?.logo) await api("/api/styl/marka/logo-ze-strony", { method: "POST", body: { logo_klucz: W.logo_klucz } }).catch(() => {});
        KR.strona = null; odswiezPodglad();
      } });
    } catch (e) { $("#krStrona").innerHTML = `<p style="color:var(--blad);margin-top:8px">✗ ${esc(e.message)}</p>`; }
    $("#krCzytaj").disabled = false;
  };
  $("#krCzytaj").onclick = czytaj;
  $("#krUrl").onkeydown = (e) => { if (e.key === "Enter") czytaj(); };
}
async function krokProgramy(el) {
  const rysuj = () => {
    const P = KR.programy;
    if (!P) { el.innerHTML = `<h1>Sprawdzam programy…</h1><p class="kr-lead">⏳ Kilka sekund (przy pierwszym razie HyperFrames może się pobierać do minuty).</p>`; return; }
    const wiersz = (x) => `<div class="kr-prog ${x.ok ? "ok" : x.wymagany ? "brak" : "opcja"}"><span>${x.ok ? "✅" : x.wymagany ? "❌" : "➖"}</span><div><b>${esc(x.nazwa)}</b> <small class="podpowiedz">${esc(x.po_co)}</small>${x.ok ? `<br><small class="podpowiedz">${esc(x.wersja)}</small>` : `<div class="kr-komenda"><code>${esc(x.jak)}</code><button class="btn maly jasny" data-kopiuj="${esc(x.jak)}">Kopiuj</button></div>${x.uwaga ? `<small class="podpowiedz">${esc(x.uwaga)}</small>` : ""}`}</div></div>`;
    const wym = P.programy.filter((x) => x.wymagany), opc = P.programy.filter((x) => !x.wymagany);
    el.innerHTML = `<h1>${P.gotowe ? "Wszystko gotowe ✓" : "Brakuje kilku programów"}</h1>
      <p class="kr-lead">${P.gotowe ? "Komputer ma wszystko, czego panel potrzebuje do montażu." : "Bez nich montaż nie ruszy. Skopiuj komendę, wklej ją w PowerShell (menu Start → PowerShell) i naciśnij Enter. Potem kliknij „Sprawdź jeszcze raz”."}</p>
      <div class="kr-programy">${wym.map(wiersz).join("")}</div>
      <details ${opc.some((x) => !x.ok) ? "" : ""}><summary class="podpowiedz">Dodatki do wybranych efektów (${opc.filter((x) => x.ok).length}/${opc.length})</summary><div class="kr-programy">${opc.map(wiersz).join("")}</div></details>
      <div class="rzad" style="margin-top:12px"><button class="btn jasny" id="krZnowu">↻ Sprawdź jeszcze raz</button></div>`;
    el.querySelectorAll("[data-kopiuj]").forEach((b) => (b.onclick = () => navigator.clipboard?.writeText(b.dataset.kopiuj).then(() => toast("Skopiowano komendę")).catch(() => {})));
    $("#krZnowu").onclick = () => { KR.programy = null; krokProgramy(el); };
  };
  rysuj();
  if (!KR.programy) {
    try { KR.programy = await api("/api/programy"); } catch (e) { el.innerHTML = `<p style="color:var(--blad)">✗ ${esc(e.message)}</p>`; return; }
    if (KR.otwarty && KR.krok === 3) rysuj();
  }
}
async function krokGotowe(el) {
  await api("/api/kreator/gotowe", { method: "POST", body: { zrobiony: true } }).catch(() => {});
  try { S.start = await api("/api/start"); } catch {}
  const wolacz = window.odmienImie ? window.odmienImie(KR.dane.osoba).wol : KR.dane.osoba;
  const brakClaude = KR.programy && !KR.programy.programy.find((x) => x.id === "claude")?.ok;
  el.innerHTML = `<div class="kr-final"><div class="kr-konfetti">🎉</div><h1>Gotowe${wolacz ? `, ${esc(wolacz)}` : ""}!</h1>
    <p class="kr-lead">Panel zna Twój gabinet i wygląd marki. Teraz najprostsza droga: wrzuć nagrania z telefonu, a Claude zmontuje rolkę i zapyta o kilka rzeczy.</p>
    ${brakClaude ? `<p class="ramka ostrzezenie">Autopilot potrzebuje Claude Code. Zainstaluj go (krok „Programy”) i zaloguj się w terminalu poleceniem <code>claude</code>.</p>` : ""}
    <div class="rzad" style="justify-content:center;gap:12px"><button class="btn duzy" id="krStart">🪄 Zrób pierwszą rolkę</button><button class="btn duzy jasny" id="krTel">📱 Nagram telefonem</button><button class="btn duzy jasny" id="krKoniec">Rozejrzę się</button></div></div>`;
  const koniec = () => { zamknijKreator(); S.projekt = null; idz(0); };
  $("#krStart").onclick = () => { koniec(); startAutopilota(); };
  $("#krTel").onclick = () => { koniec(); oknoTelefonu(); };
  $("#krKoniec").onclick = koniec;
}

// sam przy pierwszym uruchomieniu (czeka, aż panel wczyta /api/start)
(function () {
  let n = 0;
  const t = setInterval(() => {
    if (!S.start && ++n < 100) return;
    clearInterval(t);
    if (S.start && !S.start.kreator?.zrobiony && !location.hash.includes("p=")) { wczytajStyle().finally(() => otworzKreator(0)); }
  }, 150);
})();

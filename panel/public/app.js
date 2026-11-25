// Panel rolek: kreator 8 kroków. Bez frameworków. Wszystkie zmiany zapisują się od razu do plików.
"use strict";

const S = { start: null, projekt: null, krok: 0, szablony: [], formaty: [], hooki: {}, muzyka: [], wybranaScena: null, napisy: null, zmianyNapisow: {}, inboxWybrane: new Set(), zadanie: null, archSort: null };
const KROKI = ["Start", "Brief", "Nagrania", "Styl", "Napisy", "Sceny", "Render", "Publikacja"];
const IKONY = { brwi: "〰️", rzesy: "👁️", twarz: "🌸", podologia: "🦶", pedicure: "💅", gabinet: "🏠", edukacja: "🎓" };
const NAZWY_KAT = { brwi: "Brwi", rzesy: "Rzęsy", twarz: "Twarz", podologia: "Podologia", pedicure: "Pedicure", gabinet: "Gabinet", edukacja: "Edukacja" };
const PRZEJSCIA = [["ciecie", "✂︎", "cięcie"], ["przenikanie", "◐", "przenikanie"], ["zoom", "⤢", "zoom"], ["przyciemnienie", "◑", "przyciemnienie"], ["swiatlo", "☀︎", "światło"], ["flash", "✦", "błysk"], ["swipe", "⇠", "swipe"], ["swipe_gora", "⇡", "swipe w górę"], ["whip", "➶", "whip (kierunek z ruchu)"], ["fala", "≈", "fala"], ["ostrosc", "◎", "ostrość"], ["przez_postac", "👤", "przez postać"]];
const NAZWY_SZABLONOW = { "hook-tytul": "Hook", "przed-po": "Przed / po", "lista-krokow": "Lista kroków", "cena-oferta": "Cena", "lower-third": "Podpis (lower third)", "ig-obserwuj": "Obserwuj", "tekst-za-postacia": "Tekst za postacią", "cta-koncowe": "CTA", "vlog-godzina": "Godzina (vlog)", "tekst-animowany": "Tekst animowany", "efekt-ae": "✨ Efekt jak z AE", "animacja-lottie": "🎞️ Lottie", "glebia-tla": "📷 Rozmyte tło", "zdjecie-3d": "🌌 Zdjęcie 3D", "tekst-natywny": "🤳 Tekst z Instagrama" };
const P_WZOR = () => (S.projekt?.pliki?.wzor || []).filter((f) => f.typ === "wideo").sort((a, b) => Date.parse(b.data) - Date.parse(a.data))[0];
const nazwaSzablonu = (id) => NAZWY_SZABLONOW[id] || (S.szablony.find((x) => x.id === id)?.tytul ? `${id.startsWith("moj-") ? "✦ " : ""}${S.szablony.find((x) => x.id === id).tytul}` : id);
const UKRYTE_SZABLONY = ["napisy", "watermark", "safe-zone-debug", "przejscie-flash", "przejscie-swiatlo"];

// ---------- narzędzia ----------
const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const r1 = (x) => Math.round(x * 10) / 10;
async function api(url, opcje = {}) {
  const res = await fetch(url, { ...opcje, headers: { "Content-Type": "application/json" }, body: opcje.body ? JSON.stringify(opcje.body) : undefined });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.blad || `Błąd ${res.status}`);
  return j;
}
function toast(msg, ms = 2200) { const t = $("#toast"); t.textContent = msg; t.classList.remove("ukryte"); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.add("ukryte"), ms); }
function blad(e) { console.error(e); toast("✗ " + (e.message || e), 5000); }
const media = (rel) => `/media?p=${encodeURIComponent(rel)}`;
const thumb = (rel, t = 1, w = 240) => `/thumb?p=${encodeURIComponent(rel)}&t=${t}&w=${w}`;
const wProjekcie = (rel) => `${S.projekt.sciezka}/${rel}`;
// Imię z ustawień (config.json -> gabinet.osoba) w przypadkach: OS().mian / dop / cel / bier / narz / wol (powitania: Wiktorio, Aniu; puste = bez imienia).
// Odmiana: scripts/osoba.mjs ładowany w index.html jako /lib/osoba.mjs (window.odmienImie).
const OS = () => (window.odmienImie || ((x) => { x = x && !/^todo$/i.test(x) ? x.split(/\s+/)[0] : ""; return { mian: x || "autorka rolki", dop: x || "autorki rolki", cel: x || "autorce rolki", bier: x || "autorkę rolki", narz: x || "autorką rolki", wol: x }; }))(S.start?.config?.gabinet?.osoba);
const debounce = (fn, ms = 500) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
function modal(html) { $("#modalOkno").innerHTML = html; $("#modal").classList.remove("ukryte"); return $("#modalOkno"); }
function zamknijModal() { $("#modal").classList.add("ukryte"); }
$("#modal").addEventListener("click", (e) => { if (e.target.id === "modal") zamknijModal(); });

// ---------- zapis plików ----------
const zapiszRolke = debounce(async () => {
  try { await api(`/api/projekt/${encodeURIComponent(S.projekt.nazwa)}/rolka`, { method: "PUT", body: S.projekt.rolka }); toast("Zapisano rolka.json", 1200); odswiezPomoce(); } catch (e) { blad(e); }
}, 400);
async function zapiszBrief(pola = {}, sekcje = {}) {
  try {
    await api(`/api/projekt/${encodeURIComponent(S.projekt.nazwa)}/brief`, { method: "PUT", body: { pola, sekcje } });
    Object.assign(S.projekt.pola, pola);
    Object.assign(S.projekt.sekcje, sekcje);
    toast("Zapisano brief.md", 1200);
  } catch (e) { blad(e); }
}
const zapiszBriefPozniej = debounce((p, s) => zapiszBrief(p, s), 600);
function rolka() {
  const r = S.projekt.rolka || (S.projekt.rolka = {});
  r.ujecia ||= []; r.sceny ||= []; r.napisy ||= { wlacz: true, plik: "napisy/transcript.json", wyroznij: [] };
  return r;
}
async function odswiezProjekt() {
  if (!S.projekt) return;
  S.projekt = await api(`/api/projekt/${encodeURIComponent(S.projekt.nazwa)}`);
  pokaz();
}

// ---------- zadania w tle ----------
function uruchom(skrypt, args, { opis, po } = {}) {
  return api("/api/uruchom", { method: "POST", body: { skrypt, args, projekt: S.projekt?.nazwa } }).then((z) => sledz(z, opis || skrypt, po)).catch(blad);
}
function sledz(z, opis, po, logEl) {
  S.zadanie = z;
  const box = $("#zadanie");
  box.classList.remove("ukryte");
  $("#zadanieOpis").textContent = opis;
  $("#zadanieBlad").classList.add("ukryte");
  const linie = $("#zadanieLinie");
  linie.textContent = "";
  const pasek = $("#zadaniePasek");
  pasek.className = "nieokreslony"; pasek.style.width = "";
  $("#zadanieStop").classList.remove("ukryte");
  document.body.classList.add("trwa");
  odswiezPrzyciski();
  const es = new EventSource(`/api/zadanie/${z.id}/strumien`);
  const dopisz = (l) => {
    linie.textContent += l + "\n"; linie.scrollTop = linie.scrollHeight;
    if (typeof logEl === "function") logEl(l);
    else if (logEl) { logEl.textContent += l + "\n"; logEl.scrollTop = logEl.scrollHeight; }
  };
  return new Promise((resolve) => {
    es.onmessage = (ev) => {
      const d = JSON.parse(ev.data);
      if (d.linie) d.linie.forEach(dopisz);
      if (d.linia) dopisz(d.linia);
      if (d.zamien) { const t = linie.textContent.split("\n"); t.splice(-2, 1, d.zamien); linie.textContent = t.join("\n"); }
      if (d.postep != null) { pasek.className = ""; pasek.style.width = d.postep + "%"; }
      if (d.koniec) {
        es.close();
        S.zadanie = null;
        document.body.classList.remove("trwa");
        $("#zadanieStop").classList.add("ukryte");
        pasek.className = ""; pasek.style.width = "100%";
        const txt = linie.textContent;
        if (d.kod !== 0) {
          const m = txt.match(/✗ BŁĄD:[\s\S]*/);
          const bl = $("#zadanieBlad");
          bl.innerHTML = m ? esc(m[0]).replace(/Co zrobić:/, "<b>Co zrobić:</b>")
            : /authenticate|oauth|log ?in|not logged/i.test(txt) ? "Claude w terminalu nie jest zalogowany.<b>Co zrobić:</b>Otwórz terminal, wpisz <code>claude</code> i zaloguj się (komenda /login). Do tego czasu użyj „Kopiuj prompt” i wklej go w Claude Code."
            : "Coś poszło nie tak. Kliknij „Log”, żeby zobaczyć szczegóły.";
          bl.classList.remove("ukryte");
          $("#zadanieOpis").textContent = "✗ " + opis;
        } else {
          $("#zadanieOpis").textContent = "✓ " + opis;
          setTimeout(() => { if (!S.zadanie) box.classList.add("ukryte"); }, 6000);
        }
        odswiezPrzyciski();
        const wynik = { kod: d.kod, tekst: txt, wynik: d.wynik, sesja: d.sesja, audyt: d.audyt };
        resolve(wynik);
        if (po) po(wynik);
      }
    };
    es.onerror = () => {};
  });
}
$("#zadanieLog").onclick = () => $("#zadanieLinie").classList.toggle("ukryte");
$("#zadanieZamknij").onclick = () => $("#zadanie").classList.add("ukryte");
$("#zadanieStop").onclick = () => S.zadanie && api(`/api/zadanie/${S.zadanie.id}/stop`, { method: "POST" });
function odswiezPrzyciski() { document.querySelectorAll("[data-zadanie]").forEach((b) => (b.disabled = !!S.zadanie || b.dataset.zablokowany === "1")); }

// ---------- nawigacja ----------
function pokazKroki() {
  const nav = $("#kroki");
  const stany = S.projekt && opcja("checklista") ? KROKI.map((_, i) => { const b = braki(i); return b.length ? (b.every((x) => x.ok) ? "gotowy" : "brak") : ""; }) : [];
  nav.innerHTML = KROKI.map((k, i) => `<button class="krok ${i === S.krok ? "aktywny" : ""} ${i < S.krok ? "zrobiony" : ""}" data-k="${i}" ${i > 0 && !S.projekt ? "disabled" : ""} ${stany[i] ? `title="${stany[i] === "gotowy" ? "Gotowe" : "Coś jeszcze do zrobienia"}"` : ""}><b>${i + 1}</b>${k}${stany[i] ? `<i class="kropka ${stany[i]}"></i>` : ""}</button>`).join("");
  nav.querySelectorAll(".krok").forEach((b) => (b.onclick = () => idz(Number(b.dataset.k))));
  $("#projektNazwa").textContent = S.projekt ? S.projekt.nazwa : "";
}
function idz(k) {
  if (k === 0) PM.id = null;
  S.krok = k;
  history.replaceState(null, "", S.projekt && k > 0 ? `#p=${encodeURIComponent(S.projekt.nazwa)}&k=${k}` : "#");
  pokaz();
  window.scrollTo(0, 0);
}
$("#logo").onclick = () => idz(0);
function pokaz() {
  if (typeof oznaczTryb === "function") oznaczTryb();
  if (!S.projekt && S.krok === 0 && PM.id) return pokazPomysl();
  // tryb prosty (prosty.js): start i jeden ekran rolki zamiast 8 kroków
  if (typeof trybProsty === "function" && trybProsty()) return pokazProsty();
  pokazKroki();
  const ekrany = [ekranStart, ekranBrief, ekranNagrania, ekranStyl, ekranNapisy, ekranSceny, ekranRender, ekranPublikacja];
  const ekran = $("#ekran");
  ekran.innerHTML = `<div id="pomoc"></div><div id="tresc"></div><div id="osDol"></div>`;
  const el = $("#tresc");
  try { const w = ekrany[S.krok](el); if (w && w.then) w.then(() => pomoce()).catch(blad); else pomoce(); } catch (e) { blad(e); }
  odswiezPrzyciski();
  odswiezClaude();
}
function stopka(el, wstecz = true, dalej = true) {
  const d = document.createElement("div");
  d.className = "rzad"; d.style.justifyContent = "space-between"; d.style.marginTop = "10px";
  d.innerHTML = `${wstecz ? `<button class="btn jasny" id="wstecz">← ${KROKI[S.krok - 1]}</button>` : "<span></span>"}${dalej && S.krok < 7 ? `<button class="btn duzy" id="dalej">Dalej: ${KROKI[S.krok + 1]} →</button>` : ""}`;
  el.appendChild(d);
  if (wstecz) $("#wstecz", d).onclick = () => idz(S.krok - 1);
  if (dalej && S.krok < 7) $("#dalej", d).onclick = () => idz(S.krok + 1);
}
async function otworz(nazwa, krok = 1) {
  try { S.projekt = await api(`/api/projekt/${encodeURIComponent(nazwa)}`); S.napisy = null; S.kwestie = undefined; S.napisyZ = null; S.napisyPlik = null; S.wybranaScena = null; idz(krok); } catch (e) { blad(e); }
}

// =====================================================================
// 1. START
// =====================================================================
async function ekranStart(el) {
  el.innerHTML = `
    <button class="start-kafel glowny ap-kafel" id="autopilotBtn"><h2>🪄 Autopilot: wrzuć nagrania, resztę zrobi Claude</h2><p>Przeciągasz filmiki z telefonu, a Claude je obejrzy, zapyta, co chcesz, a czego nie, zmontuje rolkę ze wszystkimi efektami, sprawdzi obraz i poprawi błędy. Ty tylko klikasz odpowiedzi.</p></button>
    <div class="start-kafle trzy">
      <button class="start-kafel glowny" id="pomyslBtn"><h2>✦ Wymyśl nową rolkę</h2><p>Rozmowa z Claude: pomysł, pytania, scenariusz z mocnym hookiem i lista, co nagrać. Albo Claude sam zaproponuje rolkę.</p></button>
      <button class="start-kafel" id="nowaBtn"><h2>Mam już nagrania</h2><p>Kategoria, temat, nagrania z inboxu i od razu montaż.</p></button>
      <button class="start-kafel" id="poprzednieBtn"><h2>Poprzednie rolki</h2><p>Wróć do rolki w trakcie albo zobacz gotowe.</p></button>
    </div>
    <div id="planKarta"></div>
    <div id="pytaniaKarta"></div>
    <div id="stylKarta"></div>
    <div id="pomyslyLista"></div>
    <div id="algorytmKarta"></div>
    <div id="bankHookow"></div>
    <div class="zakladki"><div class="przelacznik"><button class="wybrany" data-z="rolki">Rolki w trakcie</button><button data-z="archiwum">Archiwum i wyniki</button></div></div>
    <div id="lista"></div>`;
  $("#nowaBtn").onclick = nowaRolka;
  $("#autopilotBtn").onclick = startAutopilota;
  $("#pomyslBtn").onclick = nowyPomysl;
  kartaStylistyki();
  kartaPlanu();
  kartaPytan();
  listaPomyslow();
  kartaAlgorytmu();
  kartaBanku();
  $("#poprzednieBtn").onclick = () => $("#lista").scrollIntoView({ behavior: "smooth" });
  el.querySelectorAll("[data-z]").forEach((b) => (b.onclick = () => { el.querySelectorAll("[data-z]").forEach((x) => x.classList.toggle("wybrany", x === b)); b.dataset.z === "rolki" ? listaRolek() : listaArchiwum(); }));
  listaRolek();
}
// Bank hooków z researchu (scripts/bank-hookow.mjs, research-hook.mjs): tylko tekst i linki, nigdy cudze nagrania.
async function kartaBanku() {
  const box = $("#bankHookow"); if (!box) return;
  const B = await api("/api/research/hooki").catch(() => ({ hooki: [] }));
  const n = B.hooki.length;
  box.innerHTML = `<div class="karta"><div class="naglowek"><div><h3>📚 Bank hooków <small class="podpowiedz">${n ? `${n} z researchu` : "pusty"}</small></h3><p class="podpowiedz">Hooki, które zatrzymały Cię w cudzych rolkach. Claude nazywa mechanizm i pisze wersję dla gabinetu, a generator hooków, recenzentka i scenarzystka biorą z nich mechanizm (nigdy słowa).</p></div><button class="btn maly" id="bankDodaj">+ Dodaj hook</button></div>
    ${n ? `<ul class="pm-ocena-lista">${B.hooki.slice(0, 6).map((h) => `<li><div><span class="chip">${esc(h.typ)}</span> <span class="chip">${esc(h.kategoria || "")}</span>${h.wyswietlenia ? ` <small class="podpowiedz">${esc(h.wyswietlenia)} wyśw.</small>` : ""} <small class="podpowiedz">${h.ocena}/10</small><br><b>„${esc(h.hook)}”</b>${h.konto ? ` <small class="podpowiedz">${esc(h.konto)}</small>` : ""}${h.link ? ` <a href="${esc(h.link)}" target="_blank" rel="noopener">link</a>` : ""}<br><small>💡 ${esc(h.mechanizm)}</small><br><small>➜ Nasza wersja: <b>${esc(h.nasza_wersja?.tekst || "").replace(/\*(.+?)\*/g, "<em>$1</em>")}</b> / „${esc(h.nasza_wersja?.mowisz || "")}”</small>${h.uwaga ? `<br><small style="color:var(--blad)">⚠ ${esc(h.uwaga)}</small>` : ""}</div><button class="btn maly jasny" data-bank-usun="${esc(h.id)}" title="Usuń z banku">✕</button></li>`).join("")}</ul>${n > 6 ? `<p class="podpowiedz">i ${n - 6} więcej w 03_BIBLIOTEKA/research/hooki.md</p>` : ""}` : ""}</div>`;
  $("#bankDodaj", box).onclick = () => {
    const m = modal(`<h2>📚 Dodaj hook z researchu</h2><p class="podpowiedz">Wpisz, co zatrzymało Cię w cudzej rolce. Tylko tekst i link, bez pobierania filmu. Cytat zapisze się krótko (maks. 15 słów).</p>
      <label class="pole"><span>Tekst na ekranie w 1. sekundzie</span><input id="bkHook" placeholder="np. Przestań tak nakładać krem"></label>
      <label class="pole"><span>Pierwsze zdanie (co mówi)</span><input id="bkMowa"></label>
      <label class="pole"><span>Co widać w 1. sekundzie</span><input id="bkWizual" placeholder="np. zbliżenie palca, nagle stop-klatka"></label>
      <div class="rzad" style="gap:10px"><label class="pole" style="flex:1"><span>Konto</span><input id="bkKonto" placeholder="@konto"></label><label class="pole" style="flex:1"><span>Wyświetlenia</span><input id="bkWysw" placeholder="np. 120 tys."></label></div>
      <label class="pole"><span>Link (opcjonalnie)</span><input id="bkLink" placeholder="https://www.instagram.com/reel/..."></label>
      <label class="pole"><span>Kategoria</span><select id="bkKat"><option value="">zgadnij</option>${["brwi", "rzesy", "twarz", "podologia", "gabinet", "inne"].map((k) => `<option>${k}</option>`).join("")}</select></label>
      <div class="rzad"><button class="btn" id="bkTak">Dodaj i przeanalizuj</button><button class="btn jasny" id="bkNie">Anuluj</button></div>`);
    $("#bkNie", m).onclick = zamknijModal;
    $("#bkTak", m).onclick = () => {
      const d = { hook: $("#bkHook", m).value.trim(), mowa: $("#bkMowa", m).value.trim(), wizual: $("#bkWizual", m).value.trim(), konto: $("#bkKonto", m).value.trim(), wyswietlenia: $("#bkWysw", m).value.trim(), link: $("#bkLink", m).value.trim(), kategoria: $("#bkKat", m).value };
      if (!d.hook && !d.mowa) return toast("Wpisz tekst z ekranu albo pierwsze zdanie");
      if (d.link && !/^https?:\/\//i.test(d.link)) return toast("Link musi zaczynać się od https://");
      zamknijModal();
      uruchom("research-hook", ["--dane", JSON.stringify(d)], { opis: "Analiza hooka z researchu", po: kartaBanku });
    };
  };
  box.querySelectorAll("[data-bank-usun]").forEach((b) => (b.onclick = async () => { try { await api(`/api/research/hook/${b.dataset.bankUsun}`, { method: "DELETE" }); kartaBanku(); } catch (e) { blad(e); } }));
}
async function listaRolek() {
  const l = $("#lista");
  const lista = await api("/api/projekty").catch(blad);
  if (!lista?.length) { l.innerHTML = `<div class="karta">Nie ma jeszcze żadnej rolki. Kliknij „Nowa rolka”.</div>`; return; }
  l.innerHTML = `<div class="rolki">${lista.map((p) => `
    <div class="rolka">
      <div class="mini" style="background-image:url('${p.miniatura ? thumb(p.miniatura, 1, 360) : ""}')"></div>
      <div class="tresc">
        <div class="rzad" style="gap:6px"><span class="chip">${esc(NAZWY_KAT[p.kategoria] || p.kategoria)}</span><span class="chip status ${/gotowa/.test(p.status) ? "ok" : /błęd/.test(p.status) ? "blad" : ""}">${esc(p.status || "nowa")}</span></div>
        <h4>${esc(p.tytul)}</h4>
        <small class="podpowiedz" style="margin:0">${esc(p.data)}</small>
        <div class="rzad" style="margin-top:auto;gap:8px"><button class="btn maly" data-otworz="${esc(p.nazwa)}">Otwórz</button><button class="btn maly jasny" data-arch="${esc(p.nazwa)}" data-zadanie>Archiwizuj</button></div>
      </div>
    </div>`).join("")}</div>`;
  l.querySelectorAll("[data-otworz]").forEach((b) => (b.onclick = () => otworz(b.dataset.otworz)));
  l.querySelectorAll("[data-arch]").forEach((b) => (b.onclick = () => archiwizuj(b.dataset.arch)));
  odswiezPrzyciski();
}
function archiwizuj(nazwa) {
  const pola = [["link", "Link do rolki", "url"], ["zasieg", "Zasięg (konta)"], ["wyswietlenia", "Wyświetlenia"], ["polubienia", "Polubienia"], ["komentarze", "Komentarze"], ["zapisy", "Zapisania"], ["udostepnienia", "Udostępnienia"], ["obserwujacy", "Nowi obserwujący"], ["rezerwacje", "Rezerwacje / wiadomości"], ["notatka", "Co zadziałało?"]];
  const m = modal(`<h2>Archiwizuj rolkę</h2><p class="podpowiedz">Rolka trafi do 05_ARCHIWUM. Wyniki możesz dopisać też później.</p>
    ${pola.map(([k, n, t]) => `<label class="pole"><span>${n}</span><input type="${t || "text"}" data-k="${k}"></label>`).join("")}
    <label class="rzad" style="margin-bottom:14px"><input type="checkbox" id="odchudz"> Usuń pliki robocze (proxy, render), zostają oryginały i final</label>
    <div class="rzad"><button class="btn" id="archOk">Archiwizuj</button><button class="btn jasny" id="archNie">Anuluj</button></div>`);
  $("#archNie", m).onclick = zamknijModal;
  $("#archOk", m).onclick = () => {
    const args = [nazwa];
    m.querySelectorAll("[data-k]").forEach((i) => { if (i.value.trim()) args.push("--" + i.dataset.k, i.value.trim()); });
    if ($("#odchudz", m).checked) args.push("--odchudz");
    if (args.length === 1) args.push("--notatka", "-");
    zamknijModal();
    uruchom("archiwizuj", args, { opis: "Archiwizacja", po: () => { S.projekt = null; idz(0); } });
  };
}
async function listaArchiwum() {
  const l = $("#lista");
  const a = await api("/api/archiwum").catch(blad);
  if (!a?.wiersze?.length) { l.innerHTML = `<div class="karta">Archiwum jest puste. Po publikacji kliknij „Archiwizuj” przy rolce.</div>`; return; }
  const kol = a.kolumny;
  let w = a.wiersze.slice();
  if (S.archSort) { const [i, kier] = S.archSort; w.sort((x, y) => { const p = parseFloat(x[i]), q = parseFloat(y[i]); const c = !isNaN(p) && !isNaN(q) ? p - q : String(x[i]).localeCompare(String(y[i])); return kier * c; }); }
  l.innerHTML = `<div class="karta" style="overflow:auto"><table><thead><tr>${kol.map((k, i) => `<th data-i="${i}">${esc(k)}${S.archSort?.[0] === i ? (S.archSort[1] > 0 ? " ▲" : " ▼") : ""}</th>`).join("")}</tr></thead><tbody>${w.map((r) => `<tr>${r.map((c, i) => `<td>${i === 2 && c.startsWith("http") ? `<a href="${esc(c)}" target="_blank">link</a>` : esc(c)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
  l.querySelectorAll("th").forEach((th) => (th.onclick = () => { const i = Number(th.dataset.i); S.archSort = [i, S.archSort?.[0] === i ? -S.archSort[1] : -1]; listaArchiwum(); }));
}
function nowaRolka() {
  let kat = null;
  const m = modal(`<h2>Nowa rolka</h2>
    <div class="kafle" id="kat">${S.start.kategorie.map((k) => `<button class="kafel" data-k="${k}"><span class="ikona">${IKONY[k] || "✨"}</span>${NAZWY_KAT[k] || k}</button>`).join("")}</div>
    <label class="pole" style="margin-top:16px"><span>Temat (krótko)</span><input type="text" id="temat" placeholder="np. laminacja brwi ile trzyma"></label>
    <label class="rzad" style="margin-bottom:16px"><input type="checkbox" id="zInbox" checked> Zabierz nagrania z 00_INBOX</label>
    ${ST.lista.length > 1 ? `<label class="pole"><span>🎨 Stylistyka (kolory, fonty, logo)</span><select id="nrStyl">${ST.lista.map((s) => `<option value="${esc(s.id)}" ${s.dla_nowych ? "selected" : ""}>${esc(s.nazwa)}</option>`).join("")}</select></label>` : ""}
    <div class="rzad"><button class="btn duzy" id="utworz" data-zadanie>Utwórz rolkę</button><button class="btn jasny" id="anuluj">Anuluj</button></div>`);
  m.querySelectorAll(".kafel").forEach((b) => (b.onclick = () => { kat = b.dataset.k; m.querySelectorAll(".kafel").forEach((x) => x.classList.toggle("wybrany", x === b)); }));
  $("#anuluj", m).onclick = zamknijModal;
  $("#utworz", m).onclick = () => {
    const temat = $("#temat", m).value.trim();
    if (!kat) return toast("Wybierz kategorię");
    if (!temat) return toast("Wpisz temat");
    const args = [kat, temat];
    if ($("#zInbox", m).checked) args.push("--z-inbox");
    if ($("#nrStyl", m)) args.push("--styl", $("#nrStyl", m).value);
    zamknijModal();
    uruchom("nowa-rolka", args, { opis: "Nowa rolka", po: ({ kod, tekst }) => { const n = (tekst.match(/Nowa rolka: 01_PROJEKTY\/(\S+)/) || [])[1]; if (!kod && n) otworz(n, 1); } });
  };
}

// =====================================================================
// 2. BRIEF
// =====================================================================
function ekranBrief(el) {
  const p = S.projekt.pola;
  const wart = (k) => (p[k] || "").replace(/\s*\(.*\)\s*$/, "").replace(/^TODO$/i, "");
  const przel = (k, opcje) => `<div class="przelacznik" data-pole="${k}">${opcje.map(([v, n]) => `<button data-v="${esc(v)}" class="${wart(k).toLowerCase().startsWith(v.toLowerCase()) ? "wybrany" : ""}">${n}</button>`).join("")}</div>`;
  el.innerHTML = `
    <div class="naglowek"><div><h1>Brief</h1><p>Krótko, o czym jest rolka. Wszystko zapisuje się samo do brief.md.</p></div></div>
    <div class="karta"><h3>Kategoria</h3><div class="kafle">${S.start.kategorie.map((k) => `<button class="kafel ${wart("kategoria") === k ? "wybrany" : ""}" data-kat="${k}"><span class="ikona">${IKONY[k]}</span>${NAZWY_KAT[k]}</button>`).join("")}</div></div>
    <div class="kolumny">
      <div class="karta">
        <label class="pole"><span>Temat</span><input type="text" id="temat" value="${esc(wart("tytuł roboczy"))}"></label>
        <label class="pole"><span>Cel</span>${przel("cel", [["zasięg", "Zasięg"], ["edukacja", "Edukacja"], ["sprzedaż", "Sprzedaż zabiegu"]])}</label>
        <label class="pole"><span>Długość</span>${przel("długość", [["7-15", "7-15 s"], ["15-30", "15-30 s"], ["30-60", "30-60 s"]])}</label>
        <label class="pole"><span>Voiceover</span>${przel("voiceover", [["tak", "Tak, mówię"], ["nie", "Nie, muzyka i napisy"]])}</label>
      </div>
      <div class="karta">
        <label class="pole"><span>Czy w kadrze jest twarz klientki?</span>${przel("twarz klientki w kadrze", [["nie", "Nie"], ["tak", "Tak"]])}</label>
        <label class="pole"><span>Zgoda na wizerunek</span>${przel("zgoda na wizerunek", [["tak", "Tak, mam zgodę"], ["nie dotyczy", "Nie dotyczy"], ["nie", "Nie"]])}</label>
        <div id="zgodaInfo"></div>
        <label class="pole"><span>Muzyka</span><select id="muzyka"></select></label>
        <div id="muzykaInfo"></div>
      </div>
    </div>`;
  stopka(el, true);
  el.querySelectorAll("[data-kat]").forEach((b) => (b.onclick = () => { el.querySelectorAll("[data-kat]").forEach((x) => x.classList.toggle("wybrany", x === b)); zapiszBrief({ kategoria: b.dataset.kat }); }));
  $("#temat").oninput = (e) => zapiszBriefPozniej({ "tytuł roboczy": e.target.value });
  el.querySelectorAll("[data-pole]").forEach((g) => g.querySelectorAll("button").forEach((b) => (b.onclick = async (ev) => {
    ev.preventDefault();
    g.querySelectorAll("button").forEach((x) => x.classList.toggle("wybrany", x === b));
    await zapiszBrief({ [g.dataset.pole]: b.dataset.v });
    pokazZgode();
  })));
  pokazZgode();
  const sel = $("#muzyka");
  const teraz = p["muzyka"] || "";
  sel.innerHTML = `<option value="dodam w IG">Dodam w aplikacji IG (render bez muzyki)</option><option value="brak">Bez muzyki</option>${S.muzyka.map((m) => `<option value="${esc(m.sciezka)}" ${teraz.includes(m.nazwa) ? "selected" : ""}>${esc(m.nazwa)}${m.licencja ? "" : " (BRAK LICENCJI)"}</option>`).join("")}`;
  if (/brak|bez/i.test(teraz)) sel.value = "brak";
  sel.onchange = () => {
    const v = sel.value;
    const m = S.muzyka.find((x) => x.sciezka === v);
    const r = rolka();
    r.muzyka = m ? { src: m.sciezka, glosnosc: 0.18 } : null;
    zapiszRolke();
    zapiszBrief({ muzyka: m ? `03_BIBLIOTEKA/muzyka/${m.nazwa}` : v });
    pokazMuzyke();
  };
  pokazMuzyke();
}
function pokazZgode() {
  const p = S.projekt.pola;
  const twarz = /^tak/i.test(p["twarz klientki w kadrze"] || "");
  const zgoda = /^tak/i.test(p["zgoda na wizerunek"] || "");
  $("#zgodaInfo").innerHTML = twarz && !zgoda ? `<div class="ramka ostrzezenie"><b>Twarz klientki bez zgody.</b> Final z twarzą zostanie zablokowany. Wybierz ujęcia bez twarzy, rozmyj twarz albo zdobądź zgodę (najlepiej pisemną, z datą).</div>` : twarz ? `<div class="ramka ok">Jest zgoda, można pokazać twarz.</div>` : "";
}
function pokazMuzyke() {
  const v = $("#muzyka").value;
  const m = S.muzyka.find((x) => x.sciezka === v);
  $("#muzykaInfo").innerHTML = m && !m.licencja ? `<div class="ramka ostrzezenie">Ten plik nie ma obok siebie <b>${esc(m.nazwa)}.LICENCJA.txt</b>. Bez licencji nie używamy go w renderze.</div>`
    : !S.muzyka.length ? `<p class="podpowiedz">Biblioteka 03_BIBLIOTEKA/muzyka jest pusta. Muzykę dodasz w aplikacji IG.</p>` : "";
}

// =====================================================================
// 3. NAGRANIA
// =====================================================================
function odznaki(m) {
  const o = [];
  if (m.czas) o.push(`<span class="odznaka">${r1(m.czas)} s</span>`);
  if (m.poziome) o.push(`<span class="odznaka zla">poziome</span>`);
  if (m.fps && Math.round(m.fps) !== 30) o.push(`<span class="odznaka">${Math.round(m.fps)} fps</span>`);
  if (m.hdr) o.push(`<span class="odznaka zla">HDR</span>`);
  if (m.typ === "zdjecie") o.push(`<span class="odznaka">zdjęcie</span>`);
  if (m.typ === "audio") o.push(`<span class="odznaka">audio</span>`);
  return `<div class="odznaki">${o.join("")}</div>`;
}
function kafelKlipu(f, wybrany, zaznaczalny = true) {
  return `<div class="klip ${wybrany ? "wybrany" : ""}" data-sciezka="${esc(f.sciezka)}">
    <div class="mini" style="background-image:url('${f.typ === "audio" ? "" : thumb(f.sciezka, 1)}')"></div>${odznaki(f)}
    ${zaznaczalny ? `<div class="zaznacz">${wybrany ? "✓" : ""}</div>` : ""}
    <div class="opis"><b title="${esc(f.nazwa)}">${esc(f.nazwa)}</b>${f.szer ? `${f.szer}x${f.wys}` : ""}</div></div>`;
}
// Rozpoznawanie ujęć (scripts/rozpoznaj.mjs): Claude ogląda klatki plików z raw/ i proponuje materiał ze scenariusza.
// Prowadząca poprawia propozycje i zatwierdza tylko zaznaczone (przypisanie = nazwa M<n>_..., z cofaniem).
function kartaRozpoznania(raw) {
  const R = S.projekt.rozpoznanie, mat = S.projekt.scenariusz?.materialy || [];
  const media = raw.filter((f) => f.typ !== "audio");
  if (!media.length && !R) return "";
  const przycisk = `<button class="btn" id="rozpoznaj" data-zadanie title="Claude ogląda 3 klatki z każdego pliku w raw/ i rozpoznaje typ ujęcia, czynność, jakość, twarz klientki${mat.length ? " i materiał ze scenariusza" : ""}. Ok. 40 s i 0,15 USD na 10 plików.">${R ? "↻ Rozpoznaj ponownie" : "✦ Rozpoznaj nagrania"}</button>`;
  if (!R) return `<div class="karta"><div class="naglowek"><div><h3>🔎 Co jest na nagraniach?</h3><p class="podpowiedz">Wrzuć wszystko z telefonu bez zmieniania nazw. Claude rozpozna, co jest na każdym pliku${mat.length ? ", dopasuje je do materiałów ze scenariusza" : ""} i wskaże słabe ujęcia.</p></div>${przycisk}</div></div>`;
  const naz = (pl) => pl.split("/").pop();
  const jak = { dobra: ["ok", "dobra"], srednia: ["", "średnia"], slaba: ["obow", "słaba"] };
  return `<div class="karta"><div class="naglowek"><div><h3>🔎 Co jest na nagraniach? <small class="podpowiedz">${new Date(R.data).toLocaleString("pl-PL")}</small></h3>${R.podsumowanie ? `<details><summary class="podpowiedz">Podsumowanie od Claude</summary><div class="podpowiedz rozp-podsum">${formatuj(R.podsumowanie)}</div></details>` : ""}</div><div class="rzad">${przycisk}${(R.zmiany || []).length ? `<button class="btn jasny" id="rozpCofnij" data-zadanie title="Przywraca nazwy plików sprzed przypisania">↶ Cofnij nazwy (${R.zmiany.length})</button>` : ""}</div></div>
    ${(R.brakujace || []).length ? `<div class="ramka uwaga" style="margin-bottom:8px">Brakuje nagrań do: ${R.brakujace.map((m) => `<b>${esc(m)}</b>${mat.find((x) => x.id === m) ? ` (${esc(mat.find((x) => x.id === m).opis)})` : ""}`).join(", ")}</div>` : ""}
    <div class="rozp-lista">${R.pliki.map((w, i) => { const ma = /^M\d+_/i.test(naz(w.plik)); const [kl, tj] = jak[w.jakosc] || ["", w.jakosc || ""]; return `<div class="rozp-wiersz">
      <img src="${thumb(wProjekcie(w.plik), w.efekt_t ?? (w.dlugosc ? w.dlugosc / 2 : 0), 120)}" alt="" loading="lazy">
      <div><b>${esc(naz(w.plik))}</b> <small class="podpowiedz">${esc(w.typ || "")}${w.dlugosc ? ` · ${String(w.dlugosc).replace(".", ",")} s` : ""}</small><br><small>${esc(w.czynnosc || "")}</small>
        <div class="chipy" style="margin-top:4px"><span class="chip ${kl}">${tj}${w.uwaga_jakosci ? `: ${esc(w.uwaga_jakosci)}` : ""}</span>${w.twarz_klientki ? '<span class="chip obow" title="Potrzebna zgoda na wizerunek">twarz klientki</span>' : ""}${w.przed_po && w.przed_po !== "brak" ? `<span class="chip">${w.przed_po}</span>` : ""}</div></div>
      ${mat.length ? `<div class="rozp-mat">${ma ? `<span class="chip ok">✓ ${esc(naz(w.plik).split("_")[0])}</span>` : `<select data-rozp-mat="${i}"><option value="">nie pasuje</option>${mat.map((m) => `<option value="${esc(m.id)}" ${w.material === m.id ? "selected" : ""}>${esc(m.id)}: ${esc(String(m.opis || "").slice(0, 38))}</option>`).join("")}</select><small class="podpowiedz">${w.material ? `pewność ${Math.round((w.pewnosc || 0) * 100)}%` : ""}</small><label class="rzad"><input type="checkbox" data-rozp-tak="${i}" ${w.material && (w.pewnosc || 0) >= 0.7 ? "checked" : ""}> przypisz</label>`}</div>` : ""}
    </div>`; }).join("")}</div>
    ${mat.length && R.pliki.some((w) => !/^M\d+_/i.test(naz(w.plik))) ? `<div class="rzad" style="justify-content:flex-end;margin-top:10px"><small class="podpowiedz">Przypisanie zmienia nazwę pliku na nazwę materiału (np. M3_wideo_zabieg.mov). Sprawdź propozycje: przy podobnych ujęciach AI może pomylić materiały.</small><button class="btn" id="rozpPrzypisz" data-zadanie>Przypisz zaznaczone</button></div>` : ""}</div>`;
}
function podepnijRozpoznanie(el) {
  const P = S.projekt, R = P.rozpoznanie;
  const b = $("#rozpoznaj", el); if (b) b.onclick = () => uruchom("rozpoznaj", [P.nazwa], { opis: "Rozpoznawanie nagrań (Claude)", po: () => odswiezProjekt() });
  const c = $("#rozpCofnij", el); if (c) c.onclick = () => uruchom("rozpoznaj", [P.nazwa, "--cofnij"], { opis: "Cofanie nazw", po: () => odswiezProjekt() });
  el.querySelectorAll("[data-rozp-mat]").forEach((s) => (s.onchange = () => { const t = el.querySelector(`[data-rozp-tak="${s.dataset.rozpMat}"]`); if (t) t.checked = !!s.value; }));
  const p = $("#rozpPrzypisz", el);
  if (p) p.onclick = () => {
    const mapa = {}, tylko = [];
    el.querySelectorAll("[data-rozp-tak]").forEach((t) => {
      const i = Number(t.dataset.rozpTak), w = R.pliki[i], s = el.querySelector(`[data-rozp-mat="${i}"]`);
      if (s && s.value !== (w.material || "")) mapa[w.plik] = s.value;
      if (t.checked && s?.value) tylko.push(w.plik);
    });
    if (!tylko.length) return toast("Zaznacz pliki z wybranym materiałem");
    uruchom("rozpoznaj", [P.nazwa, "--przypisz", "--mapa", JSON.stringify(mapa), "--tylko", tylko.join(",")], { opis: "Przypisywanie nagrań do materiałów", po: () => odswiezProjekt() });
  };
}
async function ekranNagrania(el) {
  const P = S.projekt;
  const inbox = await api("/api/inbox").catch(() => []);
  if (S.kwestie === undefined && P.scenariusz) S.kwestie = await api(`/api/projekt/${encodeURIComponent(P.nazwa)}/kwestie`).catch(() => null);
  const raw = P.pliki.raw.filter((f) => ["wideo", "zdjecie", "audio"].includes(f.typ));
  const proxy = P.pliki.proxy.filter((f) => f.typ === "wideo");
  el.innerHTML = `
    <div class="naglowek"><div><h1>Nagrania</h1><p>Wybierz nagrania, przygotuj je, a potem ułóż ujęcia po kolei.</p></div></div>
    ${kartaAutopilota()}
    ${kartaVloga(raw)}
    ${kartaMaterialowProjektu()}
    ${kartaRezyseriiProjektu()}
    ${kartaRozpoznania(raw)}
    ${kartaKwestii()}
    ${inbox.length ? `<div class="karta"><div class="naglowek"><div><h3>W 00_INBOX (${inbox.length})</h3><p>Zaznacz, co ma trafić do tej rolki.</p></div><button class="btn" id="przenies" data-zadanie>Przenieś zaznaczone do rolki</button></div><div class="siatka" id="inbox">${inbox.map((f) => kafelKlipu(f, S.inboxWybrane.has(f.nazwa))).join("")}</div></div>` : ""}
    <div class="karta"><div class="naglowek"><div><h3>Nagrania tej rolki (raw/)</h3><p>${raw.length ? "Przygotowanie robi pion 1080x1920, 30 fps i równą głośność." : "Pusto. Wrzuć pliki do 00_INBOX albo do folderu raw/."}</p></div>
      <div class="rzad"><div class="tn-wiersz" id="ciszaTN"><span>✂️ Wytnij ciszę i „yyy”</span>${takNie("wytnij_cisze", efekt("wytnij_cisze"))}</div><button class="btn jasny" id="folderRaw">Otwórz folder</button><button class="btn" id="przygotuj" data-zadanie ${raw.length ? "" : 'data-zablokowany="1"'}>Przygotuj nagrania</button><button class="btn jasny" id="kolorUjec" data-zadanie title="Balans bieli i jasność wszystkich klipów z ujęć dopasowane do najbardziej typowego (delikatnie, bez nasycania i wygładzania skóry)">🎨 Wyrównaj kolor ujęć</button></div></div>
      <div class="siatka">${raw.map((f) => kafelKlipu(f, false, false)).join("")}</div></div>
    ${proxy.length ? kartaSzukaniaUjec() : ""}
    <div class="karta"><div class="naglowek"><div><h3>Ujęcia (kolejność w rolce)</h3><p>Przeciągnij, żeby zmienić kolejność. Kliknij miniaturę, żeby przyciąć.</p></div>
      <div class="rzad"><button class="btn" id="przejsciaAI" data-zadanie title="Analizuje końcówkę każdego ujęcia: ruch kamery, machnięcie ręką, postać w ruchu, najazd, zasłonięcie obiektywu, i dobiera przejście. Ręcznie wybrane przejścia zostają.">✦ AI: dobierz przejścia</button><button class="btn" id="akcjaAI" data-zadanie title="Cięcia na akcji: ruch ręki przelewa się przez cięcie do następnego ujęcia. Tempo: powtarzalne ruchy (czesanie, piłowanie) przyspieszone 2,5-3x z płynnym wejściem, efekt w normalnym tempie. Tylko ujęcia bez mowy i dźwięku. Najpierw pokazuje propozycje.">✦ AI: cięcia na akcji i tempo</button>${(S.projekt.rolka?.ujecia || []).some((u) => u.akcja || u.akcja_ciecie) ? `<button class="btn jasny" id="akcjaCofnij" data-zadanie title="Przywraca ujęcia sprzed cięć na akcji i tempa">↶ Cofnij akcję</button>` : ""}<button class="btn jasny" id="dodajPlansze">+ Plansza kolorowa</button></div></div>
      ${proxy.length ? `<p class="podpowiedz" style="margin-bottom:8px">Dodaj gotowe klipy (proxy/):</p><div class="siatka" id="proxy" style="margin-bottom:18px">${proxy.map((f) => kafelKlipu(f, false, false).replace('class="klip', 'title="Kliknij, żeby dodać jako ujęcie" class="klip')).join("")}</div>` : `<div class="ramka info">Najpierw kliknij „Przygotuj nagrania”. Gotowe klipy pojawią się tutaj.</div>`}
      <div class="ujecia" id="ujecia"></div>
      <div id="podgladUjecia"></div>
    </div>`;
  stopka(el);
  podepnijMaterialy(el);
  podepnijRezyserieProjektu(el);
  const apW = $("#apWroc", el); if (apW) apW.onclick = () => uruchomAutopilota(true);
  podepnijRozpoznanie(el);
  podepnijKwestie(el);
  podepnijVlog(el);
  podepnijSzukanieUjec(el);
  if (inbox.length) {
    $("#inbox").querySelectorAll(".klip").forEach((k) => (k.onclick = () => { const n = k.dataset.sciezka.split("/").pop(); S.inboxWybrane.has(n) ? S.inboxWybrane.delete(n) : S.inboxWybrane.add(n); k.classList.toggle("wybrany"); $(".zaznacz", k).textContent = S.inboxWybrane.has(n) ? "✓" : ""; }));
    $("#przenies").onclick = () => { if (!S.inboxWybrane.size) return toast("Zaznacz pliki"); uruchom("inbox", ["--do", P.nazwa, ...S.inboxWybrane], { opis: "Przenoszenie z inboxu", po: () => { S.inboxWybrane.clear(); odswiezProjekt(); } }); };
  }
  $("#folderRaw").onclick = () => api("/api/otworz", { method: "POST", body: { sciezka: wProjekcie("raw") } });
  $("#kolorUjec").onclick = () => uruchom("kolor", [P.nazwa, "--podmien"], { opis: "Wyrównanie koloru ujęć", po: async ({ kod }) => { if (!kod) { await odswiezProjekt(); toast("Kolor ujęć wyrównany"); } } });
  $("#przygotuj").onclick = () => uruchom("normalizuj", efekt("wytnij_cisze") ? [P.nazwa, "--cisza"] : [P.nazwa], { opis: efekt("wytnij_cisze") ? "Przygotowanie nagrań (z wycinaniem ciszy)" : "Przygotowanie nagrań (bez wycinania ciszy)", po: odswiezProjekt });
  podepnijTakNie($("#ciszaTN"), (k, v) => { ustawEfekt(k, v); toast(v ? "Cisza i „yyy” będą wycinane" : "Nagrania zostaną bez cięcia ciszy"); });
  $("#przejsciaAI").onclick = () => uruchom("przejscia-ai", [P.nazwa, "--zapisz"], { opis: "AI dobiera przejścia (analiza ruchu)", po: odswiezProjekt });
  // Cięcia na akcji i tempo (scripts/akcja.mjs): najpierw propozycje, zapis dopiero po zatwierdzeniu
  $("#akcjaAI").onclick = async () => { await zapiszRolke(); uruchom("akcja", [P.nazwa], { opis: "Cięcia na akcji i tempo (analiza ruchu)", po: ({ kod, tekst }) => {
    if (kod) return;
    const prop = tekst.split(/\r?\n/).filter((l) => /^[✂⏩]/.test(l.trim()));
    if (!prop.length) return modal(`<h2>Cięcia na akcji i tempo</h2><p>Nie znalazłam cięć na akcji ani powtarzalnych ruchów do przyspieszenia. Ujęcia z mową, z dźwiękiem i z narzędziami (śledzenie, obiekty, zoom) są pomijane.</p><div class="rzad"><button class="btn" onclick="zamknijModal()">OK</button></div>`);
    const m = modal(`<h2>Cięcia na akcji i tempo</h2><p class="podpowiedz">Propozycje z analizy ruchu. „Zastosuj” zmieni ujęcia (kopia zostaje, można cofnąć).</p><ul class="pm-lista">${prop.map((l) => `<li>${esc(l.trim())}</li>`).join("")}</ul><div class="rzad"><button class="btn" id="tak">Zastosuj</button><button class="btn jasny" id="nie">Nie teraz</button></div>`);
    $("#nie", m).onclick = zamknijModal;
    $("#tak", m).onclick = () => { zamknijModal(); uruchom("akcja", [P.nazwa, "--zapisz"], { opis: "Zapis cięć na akcji i tempa", po: odswiezProjekt }); };
  } }); };
  const ac = $("#akcjaCofnij"); if (ac) ac.onclick = () => uruchom("akcja", [P.nazwa, "--cofnij"], { opis: "Cofanie cięć na akcji i tempa", po: odswiezProjekt });
  $("#dodajPlansze").onclick = () => { rolka().ujecia.push({ kolor: "#E9D9CF", czas: 2 }); zapiszRolke(); listaUjec(); };
  $("#proxy")?.querySelectorAll(".klip").forEach((k) => (k.onclick = () => {
    const relP = k.dataset.sciezka.slice(P.sciezka.length + 1);
    const m = proxy.find((f) => f.sciezka === k.dataset.sciezka);
    rolka().ujecia.push({ src: relP, od: 0, do: Math.min(m.czas, 3), przejscie_po: "ciecie" });
    zapiszRolke(); listaUjec(); toast("Dodano ujęcie");
  }));
  listaUjec();
}
function metaPliku(relP) {
  for (const d of Object.values(S.projekt.pliki)) { const f = d.find((x) => x.sciezka === wProjekcie(relP)); if (f) return f; }
  return null;
}
function czasyUjec() {
  // Tylko do wyświetlania osi (logika jak w zloz: przenikanie = zakładka 0.3 s).
  let t = 0; const out = [];
  (rolka().ujecia || []).forEach((u, i) => {
    const prev = rolka().ujecia[i - 1];
    const zak = prev && prev.przejscie_po === "przenikanie" ? 0.3 : 0;
    let czas = u.src ? (/\.(jpe?g|png|webp)$/i.test(u.src) ? Number(u.czas || 2) : Number(u.do ?? metaPliku(u.src)?.czas ?? 3) - Number(u.od || 0)) : Number(u.czas || 2);
    if (u.src && Array.isArray(u.segmenty) && u.segmenty.length > 1) czas = u.segmenty.reduce((a, x) => a + (Number(x[1]) - Number(x[0])), 0);
    if (Number(u.tempo) > 0 && Number(u.tempo) !== 1) czas /= Number(u.tempo);
    const start = Math.max(0, t - zak);
    out.push({ start, czas, koniec: start + czas });
    t = start + czas;
  });
  return out;
}
function listaUjec() {
  const box = $("#ujecia");
  if (!box) return;
  const r = rolka();
  const czasy = czasyUjec();
  const mowa = r.voiceover?.src;
  box.innerHTML = r.ujecia.length ? r.ujecia.map((u, i) => {
    const m = u.src ? metaPliku(u.src) : null;
    return `<div class="ujecie" draggable="true" data-i="${i}">
      <div class="uchwyt" title="Przeciągnij">⋮⋮</div>
      <div class="mini" data-podglad="${i}" style="${u.src ? `background-image:url('${thumb(wProjekcie(u.src), (Number(u.od) || 0) + 0.3, 160)}')` : `background:${esc(u.kolor)}`};cursor:pointer"></div>
      <div class="srodek">
        <b>${i + 1}. ${u.src ? esc(u.src.split("/").pop()) : "Plansza " + esc(u.kolor)} ${u.src && u.src === mowa ? '<span class="chip">mowa</span>' : ""}</b>
        <span class="podpowiedz">${u.src && !/\.(jpe?g|png)$/i.test(u.src) ? `${r1(u.od || 0)}-${r1(u.do ?? m?.czas ?? 0)} s z klipu · ` : ""}w rolce ${r1(czasy[i].start)}-${r1(czasy[i].koniec)} s</span>
        <div class="przejscia">${i < r.ujecia.length - 1 ? PRZEJSCIA.map(([v, ik, n]) => `<button data-p="${v}" data-i="${i}" class="${(u.przejscie_po || "ciecie") === v ? "wybrany" : ""}" title="Przejście: ${n}">${ik} ${n}</button>`).join("") : '<span class="podpowiedz">ostatnie ujęcie</span>'}</div>
        ${i < r.ujecia.length - 1 && u.przejscie_ai ? `<span class="podpowiedz">${u.przejscie_recznie ? "✋ wybrane ręcznie · " : ""}✦ AI: ${esc(u.przejscie_ai.przejscie)}${u.przejscie_ai.kierunek ? " " + esc(u.przejscie_ai.kierunek) : ""}, ${esc(u.przejscie_ai.powod)}</span>` : ""}
      </div>
      <div class="rzad" style="flex-direction:column;align-items:flex-end;gap:6px">
        ${u.src && m?.dzwiek ? `<label class="podpowiedz" style="margin:0"><input type="checkbox" data-mowa="${i}" ${u.src === mowa ? "checked" : ""}> klip z mową</label>` : ""}
        <button class="btn maly jasny" data-usun="${i}">Usuń</button>
      </div></div>`;
  }).join("") : `<p class="podpowiedz">Brak ujęć. Kliknij klip wyżej, żeby go dodać.</p>`;
  box.querySelectorAll("[data-p]").forEach((b) => (b.onclick = () => { const u = r.ujecia[b.dataset.i]; u.przejscie_po = b.dataset.p; u.przejscie_recznie = true; delete u.przejscie_kierunek; zapiszRolke(); listaUjec(); }));
  box.querySelectorAll("[data-usun]").forEach((b) => (b.onclick = () => { r.ujecia.splice(Number(b.dataset.usun), 1); zapiszRolke(); listaUjec(); $("#podgladUjecia").innerHTML = ""; }));
  box.querySelectorAll("[data-podglad]").forEach((b) => (b.onclick = () => podgladUjecia(Number(b.dataset.podglad))));
  box.querySelectorAll("[data-mowa]").forEach((c) => (c.onchange = () => {
    const u = r.ujecia[c.dataset.mowa];
    if (c.checked) {
      r.voiceover = { src: u.src, start: 0, glosnosc: 1 };
      r.napisy = { ...(r.napisy || {}), zrodlo: u.src, plik: "napisy/transcript.json" };
      toast("Mowa z tego klipu leci pod całą rolką, napisy też");
    } else if (r.voiceover?.src === u.src) r.voiceover = null;
    zapiszRolke(); listaUjec();
  }));
  // przeciąganie
  let skad = null;
  box.querySelectorAll(".ujecie").forEach((w) => {
    w.ondragstart = () => { skad = Number(w.dataset.i); w.classList.add("przeciagane"); };
    w.ondragend = () => w.classList.remove("przeciagane");
    w.ondragover = (e) => { e.preventDefault(); w.classList.add("nad"); };
    w.ondragleave = () => w.classList.remove("nad");
    w.ondrop = (e) => { e.preventDefault(); const dokad = Number(w.dataset.i); if (skad == null || skad === dokad) return; const [x] = r.ujecia.splice(skad, 1); r.ujecia.splice(dokad, 0, x); zapiszRolke(); listaUjec(); };
  });
}
function podgladUjecia(i) {
  const u = rolka().ujecia[i];
  const box = $("#podgladUjecia");
  if (!u.src) {
    box.innerHTML = `<div class="karta" style="margin-top:14px"><h3>Plansza ${i + 1}</h3><div class="rzad"><label class="pole"><span>Kolor</span><input type="color" id="kolor" value="${esc(u.kolor || "#E9D9CF")}"></label><label class="pole"><span>Czas (s)</span><input type="number" id="czas" step="0.1" min="0.5" value="${u.czas || 2}"></label></div></div>`;
    $("#kolor").oninput = (e) => { u.kolor = e.target.value; zapiszRolke(); listaUjec(); };
    $("#czas").oninput = (e) => { u.czas = Number(e.target.value); zapiszRolke(); listaUjec(); };
    pokazPrzebitkiUjecia(box, u, i);
    return;
  }
  const m = metaPliku(u.src);
  const D = m?.czas || 10;
  const sciezka = wProjekcie(u.src);
  box.innerHTML = `<div class="karta" style="margin-top:14px"><h3>Przycinanie: ${esc(u.src.split("/").pop())}</h3>
    <div class="podglad-ujecia"><video id="vid" src="${media(sciezka)}" controls preload="metadata" playsinline></video>
    <div><div class="pasek-klatek" id="pasekK" style="background-image:url('/strip?p=${encodeURIComponent(sciezka)}')"><div class="zakres" id="zakres"></div></div>
      <div class="trim"><label>Od: <b id="odW">${r1(u.od || 0)}</b> s<input type="range" id="od" min="0" max="${D}" step="0.1" value="${u.od || 0}"></label>
      <label>Do: <b id="doW">${r1(u.do ?? D)}</b> s<input type="range" id="do" min="0" max="${D}" step="0.1" value="${u.do ?? D}"></label></div>
      <div class="rzad" style="margin-top:10px"><button class="btn maly jasny" id="odTeraz">Ustaw „od” z odtwarzacza</button><button class="btn maly jasny" id="doTeraz">Ustaw „do” z odtwarzacza</button><button class="btn maly" id="odtworz">▶ Odtwórz wycinek</button></div>
      <p class="podpowiedz">Ujęcia po 1-3 s. Pasek pokazuje klatkę co 1 s.</p></div></div></div>`;
  const vid = $("#vid");
  const rysuj = () => { const od = Number(u.od || 0), d = Number(u.do ?? D); $("#zakres").style.left = (od / D) * 100 + "%"; $("#zakres").style.width = ((d - od) / D) * 100 + "%"; $("#odW").textContent = r1(od); $("#doW").textContent = r1(d); };
  const ustaw = (k, v) => { v = Math.max(0, Math.min(D, r1(v))); if (k === "od" && v >= (u.do ?? D)) v = (u.do ?? D) - 0.3; if (k === "do" && v <= (u.od || 0)) v = (u.od || 0) + 0.3; u[k] = r1(v); $("#" + k).value = u[k]; rysuj(); zapiszRolke(); listaUjec(); };
  $("#od").oninput = (e) => { ustaw("od", Number(e.target.value)); vid.currentTime = u.od; };
  $("#do").oninput = (e) => { ustaw("do", Number(e.target.value)); vid.currentTime = u.do; };
  $("#odTeraz").onclick = () => ustaw("od", vid.currentTime);
  $("#doTeraz").onclick = () => ustaw("do", vid.currentTime);
  $("#odtworz").onclick = () => { vid.currentTime = u.od || 0; vid.play(); const stop = () => { if (vid.currentTime >= (u.do ?? D)) { vid.pause(); vid.removeEventListener("timeupdate", stop); } }; vid.addEventListener("timeupdate", stop); };
  rysuj();
  narzedziaUjecia(i, u, vid, box);
  pokazPrzebitkiUjecia(box, u, i);
  box.scrollIntoView({ behavior: "smooth", block: "nearest" });
}
// Kotwice mapy twarzy do wyboru w panelu (pełna lista: scripts/twarz-dane.mjs, KOTWICE_TWARZY).
const KOTWICE_TW = { brwi: "obie brwi", brew_lewa_luk: "łuk lewej brwi", brew_prawa_luk: "łuk prawej brwi", brew_lewa_poczatek: "początek lewej brwi", brew_prawa_poczatek: "początek prawej brwi", brew_lewa_koniec: "ogon lewej brwi", brew_prawa_koniec: "ogon prawej brwi", oczy: "oczy", rzesy_lewa: "rzęsy lewego oka", rzesy_prawa: "rzęsy prawego oka", oko_lewa_dol: "pod lewym okiem", oko_prawa_dol: "pod prawym okiem", nos: "nos", usta: "usta", czolo: "czoło", broda: "broda", twarz: "cała twarz" };
// Narzędzia ujęcia: stabilizacja, stopklatka, śledzenie punktu, zoom na punkt (punkt = klik w kadr podglądu).
function narzedziaUjecia(i, u, vid, box) {
  const P = S.projekt;
  const sl = u.sledzenie || [];
  const nazwyEl = { kolko: "⭕ kółko", punkt: "🔴 punkt", strzalka: "⬇️ strzałka z podpisem", etykieta: "🏷️ podpis z kreską" };
  const opisSl = (x) => x.element === "proporcje" ? `📐 proporcje brwi${x.strona && x.strona !== "obie" ? ` (${x.strona})` : ""}` : x.element === "obrys" ? `〰️ obrys: ${{ brwi: "brwi", rzesy: "rzęsy", brew_lewa: "lewa brew", brew_prawa: "prawa brew" }[x.twarz] || x.twarz}`
    : `${nazwyEl[x.element] || x.element}${x.twarz ? ` → ${KOTWICE_TW[x.twarz] || x.twarz}` : x.obiekt ? " → za obiektem" : ""}`;
  const div = document.createElement("div");
  div.className = "karta narzedzia-uj";
  div.innerHTML = `<h3>✨ Narzędzia ujęcia</h3>
    <div class="narz-siatka">
      <div><b>🎯 Stabilizacja</b><p class="podpowiedz">Drżące zbliżenie z ręki: wygładza ruch (lekki zoom, żeby nie było czarnych brzegów).</p>
        ${/_stab\.mp4$/.test(u.src) ? '<span class="chip ok">✓ ujęcie jest stabilizowane</span>' : `<button class="btn maly" id="nStab" data-zadanie>Stabilizuj</button>`}</div>
      <div><b>🔎 Ulepsz jakość</b><p class="podpowiedz">Rozmazane albo słabe ujęcie (np. z WhatsAppa, mocny zoom): upscaling i gładkie krawędzie. AI na karcie graficznej trwa kilka minut, „Szybko” kilka sekund. Skóra nie jest wygładzana.</p>
        ${/_hd\.(mp4|png)$/.test(u.src) ? '<span class="chip ok">✓ ujęcie jest ulepszone</span>' : `<div class="rzad">AI <input type="range" id="nUlSila" min="20" max="80" step="5" value="50" style="width:80px" title="Ile obrazu z AI (reszta z oryginału)"> krawędzie <input type="range" id="nUlWyg" min="0" max="100" step="10" value="50" style="width:80px" title="Wygładzanie krawędzi"></div>
        <div class="rzad" style="margin-top:6px"><button class="btn maly" id="nUlAI" data-zadanie>Ulepsz (AI)</button><button class="btn maly jasny" id="nUlSzybko" data-zadanie>Szybko</button></div>`}</div>
      ${/\.(jpe?g|png|webp)$/i.test(u.src || "") ? "" : `<div><b>🐢 Slow motion / rampa</b><p class="podpowiedz">Płynne zwolnienie momentu efektu (AI dorysowuje klatki). Ustaw odtwarzacz na początek i koniec efektu i kliknij przyciski.</p>
        ${/_slow\.mp4$/.test(u.src) ? '<span class="chip ok">✓ ujęcie ma slow motion</span>' : `<div class="rzad"><button class="btn maly jasny" id="nSlOd">początek = teraz</button><input type="number" id="nSlOdW" step="0.1" min="0" value="${r1(Number(u.od || 0) + 0.5)}" style="width:70px"> – <input type="number" id="nSlDoW" step="0.1" min="0" value="${r1(Number(u.od || 0) + 1.5)}" style="width:70px"><button class="btn maly jasny" id="nSlDo">koniec = teraz</button></div>
        <div class="rzad" style="margin-top:6px"><select id="nSlK"><option value="2">2x wolniej</option><option value="4" selected>4x wolniej</option><option value="8">8x wolniej</option></select><select id="nSlR"><option value="0">bez rampy</option><option value="0.3" selected>rampa płynna</option><option value="0.6">rampa długa</option></select><button class="btn maly" id="nSlow" data-zadanie>Zwolnij</button></div>`}</div>`}
      ${u.src && !/\.(jpe?g|png|webp)$/i.test(u.src) ? `<div><b>🔉 Dźwięk zabiegu</b><p class="podpowiedz">Ustaw odtwarzacz w chwili, gdy pęseta dotyka brwi, pada spray itd., wybierz dźwięk i dodaj. Subtelny detal, który robi „drogie” brzmienie.</p>
        <div class="rzad"><select id="nFoley"><option value="peseta">pęseta</option><option value="szczoteczka">szczoteczka</option><option value="spray">spray</option><option value="stukniecie">stuknięcie słoiczka</option><option value="szelest">szelest</option><option value="puder">puder / pędzel</option></select><button class="btn maly" id="nFoleyDodaj">dodaj w tej chwili</button></div>
        ${(u.foley || []).length ? `<div class="chipy" style="margin-top:6px">${u.foley.map((f, k) => `<span class="chip">${esc(f.typ)} ${r1(f.start)} s <button class="x" data-usun-foley="${k}" title="Usuń">✕</button></span>`).join("")}</div>` : ""}
        ${u.dzwiek && i > 0 ? `<label class="rzad" style="margin-top:6px" title="J-cut: dźwięk tego ujęcia zaczyna się, zanim zobaczysz obraz. Płynniejsze przejście."><input type="checkbox" id="nJcut" ${u.dzwiek_wczesniej ? "checked" : ""}> dźwięk wchodzi 0,3 s przed obrazem</label>` : ""}</div>` : ""}
      <div><b>⏸ Stopklatka na końcu</b><p class="podpowiedz">Ostatnia klatka zatrzymuje się na chwilę, np. tuż przed efektem („czekaj…”).</p>
        <label class="rzad"><input type="checkbox" id="nStop" ${u.stopklatka ? "checked" : ""}> przez <input type="number" id="nStopCzas" min="0.3" max="3" step="0.1" value="${u.stopklatka?.czas || 0.8}" style="width:70px"> s</label></div>
      <div><b>📍 Śledzenie punktu</b><p class="podpowiedz">Zatrzymaj wideo, kliknij „Wskaż punkt” i kliknij w kadrze w detal (brew, pęseta). Ozdoba pojedzie za nim.</p>
        <div class="rzad"><select id="nElement">${Object.entries(nazwyEl).map(([k, n]) => `<option value="${k}">${n}</option>`).join("")}</select><input type="text" id="nTekst" placeholder="podpis (opcjonalnie)" style="max-width:180px"><button class="btn maly" id="nSledz">Wskaż punkt</button></div>
        ${sl.length ? `<div class="chipy" style="margin-top:6px">${sl.map((x, k) => `<span class="chip">${esc(opisSl(x))}${x.start ? ` od ${String(r1(x.start)).replace(".", ",")} s` : ""}${x.czas ? `, ${String(r1(x.czas)).replace(".", ",")} s` : ""}${x.tekst ? ` „${esc(x.tekst)}”` : ""} <button class="x" data-usun-sl="${k}" title="Usuń">✕</button></span>`).join("")}</div>` : ""}</div>
      <div><b>🔍 Zoom na punkt</b><p class="podpowiedz">Kadr płynnie wjeżdża na wskazany detal w chwili z odtwarzacza.</p>
        <div class="rzad">siła <input type="range" id="nZoomSila" min="1.1" max="2.2" step="0.05" value="${u.zoom_na?.skala || 1.35}" style="width:110px"><button class="btn maly" id="nZoom">Wskaż punkt</button>${u.zoom_na ? `<span class="chip ok">✓ ${u.zoom_na.twarz ? `na ${esc(KOTWICE_TW[u.zoom_na.twarz] || u.zoom_na.twarz)} · ` : ""}${Math.round(u.zoom_na.skala * 100)}% od ${r1(u.zoom_na.start)} s <button class="x" id="nZoomUsun" title="Usuń">✕</button></span>` : ""}</div></div>
      ${u.src ? `<div class="narz-twarz"><b>🙂 Twarz: brwi, oczy, rzęsy</b><p class="podpowiedz">System sam znajduje twarz w każdej klatce (bez klikania), więc ozdoby trafiają w brew i jadą razem z głową. Działa też, gdy klientka leży bokiem. Pierwsze złożenie z twarzą trwa kilkanaście sekund dłużej. Ozdoby zobaczysz w podglądzie kroku Sceny i w renderze.</p>
        <div class="rzad"><button class="btn maly jasny" id="nTwSprawdz" data-zadanie>Sprawdź twarz w ujęciu</button><label class="rzad" title="Puste = do końca ujęcia">przez <input type="number" id="nTwCzas" min="0.5" max="30" step="0.5" placeholder="do końca" style="width:84px"> s</label><small class="podpowiedz">Start ozdób = chwila z odtwarzacza.</small></div>
        <div class="rzad" style="margin-top:6px"><button class="btn maly" id="nTwProp">📐 Proporcje brwi</button><select id="nTwStrona"><option value="obie">obie brwi</option><option value="lewa">lewa (na ekranie)</option><option value="prawa">prawa (na ekranie)</option></select><label class="rzad"><input type="checkbox" id="nTwEtyk" checked> podpisy</label></div>
        <div class="rzad" style="margin-top:6px"><button class="btn maly" id="nTwObrys">〰️ Obrysuj</button><select id="nTwObrysCo"><option value="brwi">obie brwi</option><option value="brew_lewa">lewą brew</option><option value="brew_prawa">prawą brew</option><option value="rzesy">linię rzęs</option></select></div>
        <div class="rzad" style="margin-top:6px"><select id="nTwKotwica">${Object.entries(KOTWICE_TW).map(([k, n]) => `<option value="${k}">${n}</option>`).join("")}</select><button class="btn maly jasny" id="nTwOzdoba" title="Ozdoba z listy w „Śledzenie punktu” (kółko, strzałka…) i jej podpis">+ ozdoba</button><button class="btn maly jasny" id="nTwZoom" title="Zoom z siłą z „Zoom na punkt”">🔍 zoom</button><button class="btn maly jasny" id="nTwKadr" title="Stały kadr: ten punkt w środku, reszta ucięta">🖼️ kadr</button></div>
        ${u.kadr?.twarz ? `<div class="chipy" style="margin-top:6px"><span class="chip ok">🖼️ kadr na ${esc(KOTWICE_TW[u.kadr.twarz] || u.kadr.twarz)} ${Math.round((u.kadr.skala || 1.3) * 100)}% <button class="x" id="nTwKadrUsun" title="Usuń">✕</button></span></div>` : ""}</div>` : ""}
      ${u.src && !/\.(jpe?g|png|webp)$/i.test(u.src) ? `<div class="narz-twarz"><b>✂️ Obiekt: wytnij i podkreśl (SAM 2)</b><p class="podpowiedz">Kliknij w kadrze w ŚRODEK obiektu (brew, paznokieć, pęseta, urządzenie, dłoń), a system wytnie go w każdej klatce ujęcia. Działa w tle, ok. 1,5 min na 5 s nagrania. Wynik zobaczysz w kroku Sceny i w renderze.</p>
        <div class="rzad"><select id="nObEfekt"><option value="reflektor">🔦 Reflektor: reszta przygasa</option><option value="poswiata">✨ Poświata wokół obiektu</option><option value="tekst_za">🅰️ Tekst za obiektem</option><option value="ozdoba">📍 Ozdoba jedzie za obiektem</option></select><input type="text" id="nObTekst" placeholder="tekst (dla „Tekst za”, *słowo* = akcent)" style="max-width:220px"><button class="btn maly" id="nOb" data-zadanie>Wskaż obiekt</button></div>
        ${(u.obiekty || []).length ? `<div class="chipy" style="margin-top:6px">${u.obiekty.map((o, k) => `<span class="chip">${{ reflektor: "🔦 reflektor", poswiata: "✨ poświata", tekst_za: "🅰️ tekst za" }[o.efekt] || o.efekt}${o.tekst ? ` „${esc(o.tekst)}”` : ""} <button class="x" data-usun-ob="${k}" title="Usuń">✕</button></span>`).join("")}</div>` : ""}</div>` : ""}
    </div>
    <div id="nTryb" class="ramka info ukryte">Kliknij w kadrze odtwarzacza w punkt, który ma być śledzony. <a href="#" id="nAnuluj">Anuluj</a></div>`;
  box.appendChild(div);
  const odswiezUj = () => { zapiszRolke(); listaUjec(); podgladUjecia(i); };
  const st = $("#nStab", div);
  if (st) st.onclick = () => uruchom("stabilizuj", [P.nazwa, u.src, "--podmien"], { opis: "Stabilizacja obrazu", po: async ({ kod }) => { if (!kod) { await odswiezProjekt(); toast("Ujęcie stabilizowane"); } } });
  const ulepsz = (szybko) => uruchom("ulepsz", [P.nazwa, u.src, "--podmien", "--sila", $("#nUlSila", div).value, "--wygladz", $("#nUlWyg", div).value, ...(szybko ? ["--szybki"] : [])],
    { opis: szybko ? "Szybkie ulepszanie obrazu" : "Upscaling AI (karta graficzna)", po: async ({ kod }) => { if (!kod) { await odswiezProjekt(); toast("Ujęcie ulepszone"); } } });
  const fd = $("#nFoleyDodaj", div);
  if (fd) fd.onclick = () => {
    const tempo = Number(u.tempo) > 0 ? Number(u.tempo) : 1;
    const st = r1(Math.max(0, (vid.currentTime - Number(u.od || 0)) / tempo));
    (u.foley ||= []).push({ typ: $("#nFoley", div).value, start: st });
    u.foley.sort((a, b) => a.start - b.start);
    zapiszRolke(); toast(`Dźwięk dodany w ${st} s ujęcia`); div.remove(); narzedziaUjecia(i, u, vid, box);
  };
  div.querySelectorAll("[data-usun-foley]").forEach((b) => (b.onclick = () => { u.foley.splice(Number(b.dataset.usunFoley), 1); if (!u.foley.length) delete u.foley; zapiszRolke(); div.remove(); narzedziaUjecia(i, u, vid, box); }));
  const jc = $("#nJcut", div); if (jc) jc.onchange = () => { if (jc.checked) u.dzwiek_wczesniej = 0.3; else delete u.dzwiek_wczesniej; zapiszRolke(); };
  const slOd = $("#nSlOd", div); if (slOd) slOd.onclick = () => ($("#nSlOdW", div).value = r1(vid.currentTime));
  const slDo = $("#nSlDo", div); if (slDo) slDo.onclick = () => ($("#nSlDoW", div).value = r1(vid.currentTime));
  const slB = $("#nSlow", div);
  if (slB) slB.onclick = () => {
    const od = Number($("#nSlOdW", div).value), d = Number($("#nSlDoW", div).value);
    if (!(d > od)) return toast("Koniec musi być po początku");
    uruchom("zwolnij", [P.nazwa, u.src, "--od", String(od), "--do", String(d), "--sila", $("#nSlK", div).value, "--rampa", $("#nSlR", div).value, "--podmien"],
      { opis: "Slow motion (RIFE)", po: async ({ kod }) => { if (!kod) { await odswiezProjekt(); toast("Slow motion gotowe"); } } });
  };
  const ulAI = $("#nUlAI", div); if (ulAI) ulAI.onclick = () => ulepsz(false);
  const ulSz = $("#nUlSzybko", div); if (ulSz) ulSz.onclick = () => ulepsz(true);
  const ustawStop = () => { u.stopklatka = $("#nStop", div).checked ? { czas: Number($("#nStopCzas", div).value) || 0.8 } : undefined; if (!u.stopklatka) delete u.stopklatka; zapiszRolke(); listaUjec(); };
  $("#nStop", div).onchange = ustawStop; $("#nStopCzas", div).oninput = debounce(ustawStop, 400);
  div.querySelectorAll("[data-usun-sl]").forEach((b) => (b.onclick = () => { u.sledzenie.splice(Number(b.dataset.usunSl), 1); if (!u.sledzenie.length) delete u.sledzenie; odswiezUj(); }));
  const zu = $("#nZoomUsun", div); if (zu) zu.onclick = () => { delete u.zoom_na; odswiezUj(); };
  $("#nZoomSila", div).oninput = debounce((e) => { if (u.zoom_na) { u.zoom_na.skala = Number(e.target.value); zapiszRolke(); } }, 300);
  // Twarz: kotwice z mapy twarzy (scripts/twarz.py), zloz liczy mapę sam przy złożeniu.
  const startTw = () => r1(Math.max(0, (Math.min(Math.max(vid.currentTime, Number(u.od || 0)), Number(u.do ?? vid.duration) - 0.3) - Number(u.od || 0)) / (Number(u.tempo) > 0 ? Number(u.tempo) : 1)));
  const dodajTw = (x, opis) => { const cz = Number($("#nTwCzas", div)?.value); if (cz > 0) x.czas = cz; u.sledzenie = [...(u.sledzenie || []), x]; odswiezUj(); toast(`${opis}: zobaczysz w kroku Sceny i w renderze`); };
  const twS = $("#nTwSprawdz", div);
  if (twS) {
    twS.onclick = () => uruchom("twarz", [P.nazwa, u.src], { opis: "Mapa twarzy", po: ({ kod, tekst }) => { if (!kod) toast(/brak twarzy/.test(tekst) ? "Nie widzę twarzy w tym ujęciu" : (tekst.match(/twarz w \d+% klatek[^\n(]*/) || ["Twarz znaleziona"])[0], 4000); } });
    $("#nTwProp", div).onclick = () => dodajTw({ element: "proporcje", strona: $("#nTwStrona", div).value, etykiety: $("#nTwEtyk", div).checked, start: startTw() }, "Proporcje brwi");
    $("#nTwObrys", div).onclick = () => dodajTw({ element: "obrys", twarz: $("#nTwObrysCo", div).value, start: startTw() }, "Obrys");
    $("#nTwOzdoba", div).onclick = () => dodajTw({ twarz: $("#nTwKotwica", div).value, element: $("#nElement", div).value, tekst: $("#nTekst", div).value.trim(), start: startTw() }, "Ozdoba na twarzy");
    $("#nTwZoom", div).onclick = () => { u.zoom_na = { twarz: $("#nTwKotwica", div).value, skala: Number($("#nZoomSila", div).value) || 1.35, start: startTw(), czas: 0.5 }; odswiezUj(); toast("Zoom na twarz ustawiony"); };
    $("#nTwKadr", div).onclick = () => { u.kadr = { twarz: $("#nTwKotwica", div).value, skala: Math.max(1.2, Number($("#nZoomSila", div).value) || 1.4) }; odswiezUj(); toast("Stały kadr na twarz ustawiony (siła z suwaka zoomu)"); };
    const ku = $("#nTwKadrUsun", div); if (ku) ku.onclick = () => { delete u.kadr; odswiezUj(); };
  }
  // Klik w kadr -> piksele 1080x1920 (wideo w podglądzie ma object-fit: contain)
  let tryb = null;
  const wskaz = (t) => { tryb = t; vid.pause(); vid.classList.add("celownik"); $("#nTryb", div).classList.remove("ukryte"); toast("Kliknij w kadr", 1500); };
  const koniec = () => { tryb = null; vid.classList.remove("celownik"); $("#nTryb", div).classList.add("ukryte"); };
  $("#nAnuluj", div).onclick = (e) => { e.preventDefault(); koniec(); };
  $("#nSledz", div).onclick = () => wskaz("sledz");
  $("#nZoom", div).onclick = () => wskaz("zoom");
  const obB = $("#nOb", div); if (obB) obB.onclick = () => { if ($("#nObEfekt", div).value === "tekst_za" && !$("#nObTekst", div).value.trim()) return toast("Wpisz tekst, który ma być za obiektem"); wskaz("obiekt"); };
  div.querySelectorAll("[data-usun-ob]").forEach((b) => (b.onclick = () => { u.obiekty.splice(Number(b.dataset.usunOb), 1); if (!u.obiekty.length) delete u.obiekty; odswiezUj(); }));
  vid.addEventListener("click", (e) => {
    if (!tryb) return;
    e.preventDefault();
    const r = vid.getBoundingClientRect(), sk = Math.min(r.width / 1080, r.height / 1920);
    const ox = (r.width - 1080 * sk) / 2, oy = (r.height - 1920 * sk) / 2;
    const x = Math.round((e.clientX - r.left - ox) / sk), y = Math.round((e.clientY - r.top - oy) / sk);
    if (x < 0 || y < 0 || x > 1080 || y > 1920) return toast("Kliknij w obraz");
    const t = Math.min(Math.max(vid.currentTime, Number(u.od || 0)), Number(u.do ?? vid.duration) - 0.3);
    const co = tryb; koniec();
    if (co === "zoom") { u.zoom_na = { x, y, skala: Number($("#nZoomSila", div).value) || 1.35, start: r1(Math.max(0, t - Number(u.od || 0))), czas: 0.5 }; odswiezUj(); toast("Zoom na punkt ustawiony"); return; }
    if (co === "obiekt") {
      const efekt = $("#nObEfekt", div).value, tekst = $("#nObTekst", div).value.trim(), oid = `o${Date.now().toString(36)}`;
      uruchom("obiekt", [P.nazwa, u.src, "--x", String(x), "--y", String(y), "--t", String(r1(t)), "--od", String(Number(u.od || 0)), "--do", String(u.do ?? vid.duration), "--id", oid], { opis: "Wycinanie obiektu (SAM 2)", po: ({ kod }) => {
        if (kod) return;
        if (efekt === "ozdoba") u.sledzenie = [...(u.sledzenie || []), { obiekt: oid, element: $("#nElement", div).value, tekst: $("#nTekst", div).value.trim() }];
        else u.obiekty = [...(u.obiekty || []), { id: oid, efekt, ...(efekt === "tekst_za" ? { tekst, tekst_y: Math.round(Math.max(260, Math.min(1300, y - 260))) } : {}) }];
        odswiezUj(); toast("Obiekt wycięty. Efekt zobaczysz w kroku Sceny i w renderze.", 4000);
      } });
      return;
    }
    const id = `${u.src.split("/").pop().replace(/\.[^.]+$/, "")}_${Date.now().toString(36)}`;
    const element = $("#nElement", div).value, tekst = $("#nTekst", div).value.trim();
    uruchom("sledz", [P.nazwa, u.src, "--x", String(x), "--y", String(y), "--od", String(r1(t)), "--do", String(u.do ?? vid.duration), "--id", id], { opis: "Śledzenie punktu", po: ({ kod }) => {
      if (kod) return;
      u.sledzenie = [...(u.sledzenie || []), { plik: `kompozycja/sledzenie/${id}.json`, element, tekst }];
      odswiezUj(); toast("Ozdoba jedzie za punktem. Zobaczysz ją w podglądzie Studio i renderze.");
    } });
  }, true);
}

// =====================================================================
// 4. STYL
// =====================================================================
const PRESETY = {
  1: (T) => [["hook-tytul", 0, 1.8, { tekst: "40 minut i *takie* efekty", wariant: "slowa" }], ["przed-po", Math.max(2, T * 0.55), 3, { tryb: "wipe" }]],
  2: () => [["hook-tytul", 0, 2, { tekst: "POV: pierwszy raz na *zabiegu*", wariant: "slowa" }], ["lower-third", 2.4, 2.2, {}]],
  3: () => [["hook-tytul", 0, 2, { tekst: "Mit czy *fakt*?", wariant: "maska" }], ["hook-tytul", 2, 2, { tekst: "MIT", podtekst: "sprawdźmy", tlo: "plansza", pozycja: "srodek", wariant: "skala" }]],
  4: (T) => [["hook-tytul", 0, 1.5, { tekst: "3 błędy przy *...*", wariant: "slowa" }], ["lista-krokow", 1.5, Math.max(4, T - 1.5), { tlo: "nagranie" }]],
  5: (T) => [["hook-tytul", 0, 1.5, { tekst: "Dzień w moim *gabinecie*", wariant: "maska" }], ["ig-obserwuj", Math.max(2, T - 2.4), 2.2, {}]],
  6: () => [["hook-tytul", 0, 1.6, { tekst: "Dźwięk *ON*", wariant: "skala", tlo: "brak" }]],
  7: () => [["hook-tytul", 0, 2, { tekst: "Ile trzyma *lifting*?", wariant: "slowa", podtekst: "pytanie z komentarza" }]],
  8: () => [["hook-tytul", 0, 1.2, { tekst: "Czekaj na *efekt*", wariant: "skala" }]],
  9: () => [["tekst-za-postacia", 0, 2, { tekst: "GLOW" }]],
  10: (T) => [["hook-tytul", 0, 2, { tekst: "Ile kosztuje *laminacja* u mnie?", wariant: "slowa" }], ["cena-oferta", Math.max(2, T * 0.6), 3, {}]],
  11: () => [["hook-tytul", 0, 1.8, { tekst: "Mój dzień w *gabinecie*", wariant: "slowa" }], ["vlog-godzina", 2.1, 1.8, { godzina: "08:00", opis: "rano" }]],
};
// Przepis na rolkę: format ustawia też efekty montażu dobrane pod retencję (tempo, zajawka, dźwięk).
const PRZEPISY = {
  1: { zajawka: true, bodziec: true, punch_in: false, dzwieki: true, zapetlenie: true, pasek_postepu: false, emoji: false },
  2: { zajawka: false, bodziec: true, punch_in: true, dzwieki: true, zapetlenie: false, pasek_postepu: false, emoji: true },
  3: { zajawka: false, bodziec: true, punch_in: true, dzwieki: true, zapetlenie: false, pasek_postepu: true, emoji: true },
  4: { zajawka: false, bodziec: true, punch_in: true, dzwieki: true, zapetlenie: false, pasek_postepu: true, emoji: true },
  5: { zajawka: true, bodziec: true, punch_in: false, dzwieki: true, zapetlenie: true, pasek_postepu: false, emoji: false },
  6: { zajawka: false, bodziec: false, punch_in: false, dzwieki: false, zapetlenie: true, pasek_postepu: false, emoji: false },
  7: { zajawka: false, bodziec: true, punch_in: true, dzwieki: true, zapetlenie: false, pasek_postepu: true, emoji: true },
  8: { zajawka: false, bodziec: false, punch_in: false, dzwieki: false, zapetlenie: true, pasek_postepu: false, emoji: false },
  9: { zajawka: false, bodziec: true, punch_in: true, dzwieki: true, zapetlenie: true, pasek_postepu: false, emoji: false },
  10: { zajawka: true, bodziec: true, punch_in: true, dzwieki: true, zapetlenie: false, pasek_postepu: false, emoji: true },
  11: { zajawka: true, bodziec: false, punch_in: false, dzwieki: true, zapetlenie: true, pasek_postepu: false, emoji: false, wycisz_muzyke: true, wytnij_cisze: false },
};
const ikonaEfektu = (k) => efektyMontazu().find((x) => x[0] === k)?.[2] || "";
const nazwaEfektu = (k) => efektyMontazu().find((x) => x[0] === k)?.[3] || k;
function wlaczonePrzepisu(nr) { return Object.entries(PRZEPISY[nr] || {}).filter(([, v]) => v).map(([k]) => k); }
// Style ruchu marki (zloz: STYLE_RUCHU, zmienne --ruch-*). Krzywa CSS tylko do kropki-podglądu w panelu.
const STYLE_RUCHU = [
  ["miekki", "Miękki luksus", "Płynne, długie wyhamowanie, delikatne odbicie akcentów. Domyślny.", "cubic-bezier(0.16,1,0.3,1)", 1.3],
  ["elegancki", "Elegancki", "Spokojny, bez żadnego odbicia. Jak magazyn modowy.", "cubic-bezier(0.25,1,0.5,1)", 1.4],
  ["sprezysty", "Sprężysty", "Wesoły, akcenty odbijają jak sprężynka.", "cubic-bezier(0.34,1.7,0.64,1)", 1.1],
  ["dynamiczny", "Dynamiczny", "Szybki start i ostre hamowanie, mocne akcenty. Do energicznych rolek.", "cubic-bezier(0.9,0,0.1,1)", 0.8],
  ["klasyczny", "Klasyczny", "Neutralny ruch jak dotąd.", "cubic-bezier(0.33,1,0.68,1)", 1.2],
];
function ekranStyl(el) {
  const r = rolka();
  const stylN = r.napisy?.styl || S.start.config.napisy?.styl_domyslny || "perla";
  const hook = r.sceny.find((s) => s.szablon === "hook-tytul");
  const stylR = r.ruch || S.start.config.ruch?.styl || "miekki";
  const wariant = hook?.dane?.wariant || "slowa";
  const OPISY = { este: ["Este", "Granatowy szeryf na białym boksie, słowo kluczowe złotą kursywą. Spokojne wejście, styl premium."], perla: ["Perła", "Kremowa pigułka, słowa zapalają się po kolei. Najczytelniejszy na jasnym tle."], waga: ["Waga", "Elegancki, bez pigułki. Aktywne słowo robi się grube."], marker: ["Marker", "Pudrowy marker pod słowem. Najbardziej dynamiczny."], vlog: ["Vlog", "Biały prosty tekst bez tła, słowo po słowie. Jak u twórczyń, bez kolorów marki."] };
  el.innerHTML = `
    <div class="naglowek"><div><h1>Styl</h1><p>Stylistyka marki, format rolki, wygląd napisów i hooka.</p></div></div>
    <div id="stylRolki"></div>
    <div id="charakterMontazu"></div>
    <div class="karta"><h3>Przepis na rolkę</h3><p class="podpowiedz" style="margin-bottom:12px">Wybór formatu ustawia sceny (hook, plansze, CTA) i efekty montażu dobrane tak, żeby ludzie oglądali do końca. Potem wszystko możesz zmienić.</p>
      <div class="formaty">${S.formaty.map((f) => `<div class="format ${r.format === f.nr ? "wybrany" : ""}" data-f="${f.nr}"><h4>${esc(f.tytul)}</h4><ol>${f.wiersze.slice(0, 5).map((w) => `<li><b>${esc(w.czas)}</b> ${esc(w.co)}</li>`).join("")}</ol>${wlaczonePrzepisu(f.nr).length ? `<div class="przepis-efekty">${wlaczonePrzepisu(f.nr).map((k) => `<span title="${esc(nazwaEfektu(k))}">${ikonaEfektu(k)}</span>`).join("")}</div>` : ""}</div>`).join("")}</div></div>
    <div class="karta"><h3>Styl napisów</h3><div class="style-napisow">${Object.entries(OPISY).map(([k, [n, o]]) => `<button class="styl-napisow ${stylN === k ? "wybrany" : ""}" data-s="${k}"><img src="img/napisy-${k}.jpg" alt="${n}"><div><b>${n}</b><br>${o}</div></button>`).join("")}</div></div>
    <div class="karta"><h3>Styl ruchu marki</h3><p class="podpowiedz" style="margin-bottom:10px">Jedna rodzina ruchu dla wszystkich napisów, plansz i ozdób w rolce, żeby Twoje rolki były rozpoznawalne po tym, jak się ruszają. Domyślny ustawiasz w config.json (ruch.styl). Kropka pokazuje charakter ruchu.</p>
      <div class="style-ruchu">${STYLE_RUCHU.map(([k, n, o, cb, cz]) => `<button class="styl-ruchu ${stylR === k ? "wybrany" : ""}" data-ruch="${k}"><span class="ruch-tor"><i style="animation-timing-function:${cb};animation-duration:${cz}s"></i></span><b>${n}</b><small>${o}</small></button>`).join("")}</div></div>
    <div class="kolumny">
      <div class="karta"><h3>Wejście hooka</h3><div class="przelacznik" id="wariant">${[["slowa", "Słowo po słowie"], ["maska", "Wjazd z maski"], ["skala", "Skala i kreska"]].map(([v, n]) => `<button data-v="${v}" class="${wariant === v ? "wybrany" : ""}">${n}</button>`).join("")}</div><p class="podpowiedz">Zmienia wszystkie hooki w tej rolce.</p></div>
      <div class="karta"><h3>Znak wodny i safe zone</h3>
        <label class="rzad" style="margin-bottom:10px"><input type="checkbox" id="wm" ${r.watermark !== false ? "checked" : ""}> Znak wodny (handle w rogu)</label>
        <label class="rzad"><input type="checkbox" id="sz" ${r.debug_safe_zone ? "checked" : ""}> Pokaż strefy UI Instagrama w podglądzie (wyłącz przed finalem)</label></div>
    </div>
    <div class="karta"><div class="naglowek"><div><h3>Efekty montażu</h3><p>Każdy efekt włączasz albo wyłączasz jednym kliknięciem. Zmiana działa przy następnym renderze.</p></div></div>
      <div class="efekty" id="efekty">${efektyMontazu().map(([k, , ik, n, o]) => `<div class="efekt ${efekt(k) ? "wlaczony" : ""}" data-ef="${k}"><span class="efekt-ikona">${ik}</span><div class="efekt-opis"><b>${n}</b><p>${o}</p>${k === "emoji" && r.napisy?.wlacz === false ? '<p class="uwaga-mala">Napisy są wyłączone, więc emoji się nie pokażą.</p>' : ""}</div>${takNie(k, efekt(k))}</div>`).join("")}</div></div>`;
  stopka(el);
  kartaStyluRolki($("#stylRolki"));
  kartaCharakteru($("#charakterMontazu"));
  podepnijTakNie($("#efekty"), (k, v) => { ustawEfekt(k, v); $(`[data-ef="${k}"]`).classList.toggle("wlaczony", v); rysujOs(); });
  el.querySelectorAll("[data-f]").forEach((d) => (d.onclick = () => zastosujFormat(Number(d.dataset.f))));
  el.querySelectorAll("[data-s]").forEach((b) => (b.onclick = () => { r.napisy = { ...(r.napisy || {}), styl: b.dataset.s }; zapiszRolke(); el.querySelectorAll("[data-s]").forEach((x) => x.classList.toggle("wybrany", x === b)); }));
  $("#wariant").querySelectorAll("button").forEach((b) => (b.onclick = () => { r.sceny.filter((s) => s.szablon === "hook-tytul").forEach((s) => ((s.dane ||= {}).wariant = b.dataset.v)); S.wariantHooka = b.dataset.v; zapiszRolke(); $("#wariant").querySelectorAll("button").forEach((x) => x.classList.toggle("wybrany", x === b)); }));
  el.querySelectorAll("[data-ruch]").forEach((b) => (b.onclick = () => { r.ruch = b.dataset.ruch; zapiszRolke(); el.querySelectorAll("[data-ruch]").forEach((x) => x.classList.toggle("wybrany", x === b)); }));
  $("#wm").onchange = (e) => { r.watermark = e.target.checked; zapiszRolke(); };
  $("#sz").onchange = (e) => { r.debug_safe_zone = e.target.checked; zapiszRolke(); };
}
function zastosujFormat(nr) {
  const r = rolka();
  const T = Math.max(6, czasyUjec().at(-1)?.koniec || 12);
  const robi = () => {
    const sceny = (PRESETY[nr] || (() => []))(T).map(([szablon, start, czas, dane]) => ({ szablon, start: r1(start), czas: r1(czas), dane }));
    sceny.push({ szablon: "cta-koncowe", start: r1(T), czas: 2.5, dane: { tekst: S.start.config.cta?.zapisz_rolke && !/todo/i.test(S.start.config.cta.zapisz_rolke) ? S.start.config.cta.zapisz_rolke : "Zapisz rolkę, *przyda się*" } });
    r.sceny = sceny;
    r.format = nr;
    if (nr === 6) r.napisy = { ...(r.napisy || {}), wlacz: false };
    if (nr === 3) r.napisy = { ...(r.napisy || {}), styl: "marker" };
    efektyPrzepisu();
    zapiszRolke(); zamknijModal(); pokaz(); toast("Sceny i efekty ustawione pod format");
  };
  const efektyPrzepisu = () => { if (PRZEPISY[nr]) r.efekty = { ...(r.efekty || {}), ...PRZEPISY[nr] }; };
  if (r.sceny.length) {
    const lista = wlaczonePrzepisu(nr).map((k) => `${ikonaEfektu(k)} ${esc(nazwaEfektu(k))}`).join(", ");
    const m = modal(`<h2>Zastąpić sceny?</h2><p>Ta rolka ma już ${r.sceny.length} scen. Format ustawi nowe (hook, plansze, CTA) w miejsce obecnych.</p>${lista ? `<p class="podpowiedz">Efekty z przepisu: ${lista}.</p>` : ""}<div class="rzad"><button class="btn" id="tak">Tak, ustaw format</button><button class="btn jasny" id="nie">Zostaw sceny, ustaw tylko efekty</button></div>`);
    $("#tak", m).onclick = robi; $("#nie", m).onclick = () => { r.format = nr; efektyPrzepisu(); zapiszRolke(); zamknijModal(); pokaz(); toast("Efekty ustawione pod format"); };
  } else robi();
}

// =====================================================================
// 5. NAPISY
// =====================================================================
async function ekranNapisy(el) {
  const P = S.projekt, r = rolka();
  // Napisy z kilku nagrań (dopasuj-kwestie): edytujesz słowa jednego nagrania naraz.
  const zr = Object.entries(r.napisy?.zrodla || {});
  const multi = zr.length > 0;
  const plikQ = () => (multi ? `?plik=${encodeURIComponent(zr.find(([src]) => src === S.napisyPlik)[1].replace(/^napisy\//, ""))}` : "");
  if (multi) {
    if (!zr.some(([src]) => src === S.napisyPlik)) S.napisyPlik = zr[0][0];
    if (!S.napisyEd || S.napisyEd.plik !== S.napisyPlik) S.napisyEd = { plik: S.napisyPlik, slowa: await api(`/api/projekt/${encodeURIComponent(P.nazwa)}/napisy${plikQ()}`).catch(() => []) };
  } else if (!S.napisy) S.napisy = await api(`/api/projekt/${encodeURIComponent(P.nazwa)}/napisy`).catch(() => []);
  const NAP = multi ? S.napisyEd.slowa : S.napisy;
  const klipyZMowa = P.pliki.proxy.filter((f) => f.dzwiek).map((f) => f.sciezka.slice(P.sciezka.length + 1));
  const domyslny = r.voiceover?.src || r.napisy?.zrodlo || klipyZMowa[0] || "";
  const keys = (r.napisy?.wyroznij || []).map((k) => k.toLowerCase());
  el.innerHTML = `
    <div class="naglowek"><div><h1>Napisy</h1><p>Transkrypcja po polsku. Poprawiasz tylko błędy rozpoznania.</p></div></div>
    ${multi ? `<div class="karta"><div class="rzad"><label class="pole" style="flex:1;margin:0"><span>Nagranie z mową (napisy z dopasowanych kwestii, ${zr.length} ${zr.length === 1 ? "nagranie" : "nagrania"})</span><select id="napPlik">${zr.map(([src]) => `<option ${src === S.napisyPlik ? "selected" : ""} value="${esc(src)}">${esc(src.split("/").pop())}</option>`).join("")}</select></label><label class="rzad"><input type="checkbox" id="wlacz" ${r.napisy?.wlacz !== false ? "checked" : ""}> Napisy w rolce</label></div><p class="podpowiedz">W rolce pokażą się napisy tylko z fragmentów, które weszły do montażu. Nowe nagrania: „Dopasuj kwestie” w kroku Nagrania.</p><button id="zrob" class="ukryte"></button></div>` : `<div class="karta"><div class="rzad">
      <label class="pole" style="flex:1;margin:0"><span>Klip z mową</span><select id="zrodlo">${klipyZMowa.map((k) => `<option ${k === domyslny ? "selected" : ""}>${esc(k)}</option>`).join("") || "<option value=''>Brak klipów z dźwiękiem w proxy/</option>"}</select></label>
      <button class="btn duzy" id="zrob" data-zadanie ${klipyZMowa.length ? "" : 'data-zablokowany="1"'}>${NAP.length ? "Zrób napisy od nowa" : "Zrób napisy"}</button>
      <label class="rzad"><input type="checkbox" id="wlacz" ${r.napisy?.wlacz !== false ? "checked" : ""}> Napisy w rolce</label></div></div>`}
    ${NAP.length ? `
    <div class="ramka info"><b>Zasada:</b> ${OS().mian} mówi naturalnym, mówionym polskim. Nie poprawiamy stylu ani „no”, „wiesz”. Poprawiamy tylko źle rozpoznane słowa: nazwy zabiegów i preparatów, liczby, odmianę (np. „przydaj się” → „przyda się”).</div>
    <div class="karta edycja-slowa ukryte" id="edycja"><div class="rzad"><span>Słowo <b id="edCzas"></b>:</span><input type="text" id="edTekst" style="max-width:280px"><button class="btn" id="edOk">Popraw</button><button class="btn jasny" id="edGraj">▶ Posłuchaj</button><button class="btn jasny" id="edNie">Zamknij</button></div></div>
    <div class="karta"><div class="naglowek"><h3>Tekst (kliknij słowo)</h3><button class="btn" id="zapiszNapisy" disabled>Zapisz poprawki</button></div><div class="tekst-napisow" id="tekst"></div><audio id="audio" src="${media(wProjekcie(multi ? S.napisyPlik : P.zrodloNapisow || domyslny))}" preload="auto"></audio></div>
    <div class="karta"><label class="pole"><span>Słowa kluczowe do wyróżnienia kolorem (po przecinku)</span><input type="text" id="klucze" value="${esc((r.napisy?.wyroznij || []).join(", "))}" placeholder="np. laminacja, brwi, henna"></label><p class="podpowiedz">Nazwy zabiegów i preparatów. Liczby wyróżniają się same.</p>
      <div class="rzad" style="margin-top:10px;justify-content:space-between"><div><b>🎙️ Napisy reagują na głos</b><p class="podpowiedz" style="margin:2px 0 0">Słowa, które mówisz z naciskiem (głośniej, wyżej, przeciągasz), same dostają kolor i uderzenie, ściszone są mniejsze. Mierzone z nagrania przy składaniu rolki. Mocne akcenty trafiają też do zbliżeń kadru.</p></div>${takNie("nacisk", r.napisy?.nacisk !== false)}</div></div>`
    : `<div class="karta"><p>Jeszcze nie ma napisów. Wybierz klip, w którym mówisz, i kliknij „Zrób napisy”. Pierwszy raz trwa dłużej.</p></div>`}`;
  stopka(el);
  $("#zrob").onclick = () => { const z = $("#zrodlo").value; if (!z) return; uruchom("transkrybuj", [P.nazwa, z], { opis: "Transkrypcja", po: async ({ kod }) => { if (!kod) { const rr = rolka(); rr.napisy = { ...(rr.napisy || {}), wlacz: true, plik: "napisy/transcript.json", zrodlo: z }; zapiszRolke(); S.napisy = null; S.zmianyNapisow = {}; await odswiezProjekt(); } } }); };
  if (multi) $("#napPlik").onchange = (e) => { S.napisyPlik = e.target.value; S.zmianyNapisow = {}; pokaz(); };
  $("#wlacz").onchange = (e) => { r.napisy = { ...(r.napisy || {}), wlacz: e.target.checked }; zapiszRolke(); };
  if (!NAP.length) return;
  podepnijTakNie($("#klucze")?.closest(".karta"), (k, v) => { if (k !== "nacisk") return; r.napisy ||= {}; if (v) delete r.napisy.nacisk; else r.napisy.nacisk = false; zapiszRolke(); });
  $("#klucze").oninput = debounce((e) => { r.napisy.wyroznij = e.target.value.split(",").map((s) => s.trim()).filter(Boolean); zapiszRolke(); rysujTekst(); }, 500);
  const audio = $("#audio");
  let aktywne = null;
  function rysujTekst() {
    const keys = (r.napisy?.wyroznij || []).map((k) => k.toLowerCase());
    const czyKlucz = (t) => { const c = t.toLowerCase().replace(/[^\p{L}\p{N}]/gu, ""); return /\d/.test(c) || keys.some((k) => k && c.startsWith(k.slice(0, Math.max(3, k.length - 2)))); };
    const akap = []; let a = [];
    NAP.forEach((w, i) => { a.push(i); if (/[.!?…]$/.test(w.text)) { akap.push(a); a = []; } });
    if (a.length) akap.push(a);
    $("#tekst").innerHTML = akap.map((ak) => `<p>${ak.map((i) => `<span class="slowo ${S.zmianyNapisow[i] != null ? "zmienione" : ""} ${czyKlucz(S.zmianyNapisow[i] ?? NAP[i].text) ? "klucz" : ""}" data-i="${i}">${esc(S.zmianyNapisow[i] ?? NAP[i].text)}</span>`).join(" ")}</p>`).join("");
    $("#tekst").querySelectorAll(".slowo").forEach((s) => (s.onclick = () => wybierz(Number(s.dataset.i))));
    $("#zapiszNapisy").disabled = !Object.keys(S.zmianyNapisow).length;
  }
  function graj(i) {
    const w = NAP[i];
    audio.currentTime = Math.max(0, w.start - 0.15); audio.play();
    document.querySelectorAll(".slowo.gra").forEach((x) => x.classList.remove("gra"));
    $(`.slowo[data-i="${i}"]`)?.classList.add("gra");
    const stop = () => { if (audio.currentTime >= w.end + 0.1) { audio.pause(); audio.removeEventListener("timeupdate", stop); } };
    audio.addEventListener("timeupdate", stop);
  }
  function wybierz(i) {
    aktywne = i;
    $("#edycja").classList.remove("ukryte");
    $("#edCzas").textContent = `(${NAP[i].start.toFixed(1)} s)`;
    $("#edTekst").value = S.zmianyNapisow[i] ?? NAP[i].text;
    $("#edTekst").focus(); $("#edTekst").select();
    graj(i);
  }
  const popraw = () => { if (aktywne == null) return; const v = $("#edTekst").value.trim(); if (!v) return toast("Słowo nie może być puste"); if (v.includes(" ")) return toast("Jedno słowo (bez spacji), czasy zostają"); if (v === NAP[aktywne].text) delete S.zmianyNapisow[aktywne]; else S.zmianyNapisow[aktywne] = v; rysujTekst(); $("#edycja").classList.add("ukryte"); };
  $("#edOk").onclick = popraw;
  $("#edTekst").onkeydown = (e) => { if (e.key === "Enter") popraw(); if (e.key === "Escape") $("#edycja").classList.add("ukryte"); };
  $("#edGraj").onclick = () => aktywne != null && graj(aktywne);
  $("#edNie").onclick = () => $("#edycja").classList.add("ukryte");
  $("#zapiszNapisy").onclick = async () => {
    const nowe = NAP.map((w, i) => ({ text: S.zmianyNapisow[i] ?? w.text }));
    try { await api(`/api/projekt/${encodeURIComponent(P.nazwa)}/napisy${plikQ()}`, { method: "PUT", body: nowe }); S.napisyZ = null; NAP.forEach((w, i) => { if (S.zmianyNapisow[i] != null) w.text = S.zmianyNapisow[i]; }); S.zmianyNapisow = {}; rysujTekst(); toast("Napisy poprawione"); } catch (e) { blad(e); }
  };
  rysujTekst();
}

// =====================================================================
// 6. SCENY
// =====================================================================
function grupaHookow() { const k = S.projekt.pola["kategoria"] || ""; return /podolog|pedicure/.test(k) ? "podologia" : /gabinet|edukacja/.test(k) ? "gabinet" : "kosmetologia"; }
function ekranSceny(el) {
  const r = rolka();
  const czasy = czasyUjec();
  const koniecUjec = czasy.at(-1)?.koniec || 0;
  const dodawalne = S.szablony.filter((s) => !UKRYTE_SZABLONY.includes(s.id));
  el.innerHTML = `
    <div class="naglowek"><div><h1>Sceny</h1><p>Podgląd na żywo i oś czasu: przeciągaj sceny, skracaj je za krawędź, stawiaj znaczniki z uwagami dla Claude.</p></div>
      <label class="rzad"><input type="checkbox" id="sz" ${r.debug_safe_zone ? "checked" : ""}> Pokaż safe zone w podglądzie</label></div>
    <div class="karta">
      <div id="edytor"></div>
      <p class="podpowiedz" style="margin-top:10px">Dodaj scenę (wchodzi w miejscu głowicy):</p>
      <div class="dodaj-sceny">${dodawalne.map((s) => `<button class="btn maly jasny" data-dodaj="${s.id}">+ ${esc(nazwaSzablonu(s.id))}</button>`).join("")}</div>
    </div>
    <div class="karta"><h3>🎯 Zrób jak ta rolka</h3>
      <p class="podpowiedz">Wgraj rolkę, której montaż Ci się podoba (pobraną z telefonu albo zapisaną z Instagrama). Panel rozłoży ją na ujęcia i rytm cięć, a Claude ułoży Twoje nagrania według tego samego szkieletu: kiedy hook, ile trwa ujęcie, gdzie efekt, kiedy CTA. Kopiujemy układ, nigdy cudzy materiał.</p>
      <div class="rzad"><label class="btn jasny">⬆ Wgraj rolkę-wzór<input type="file" id="wzorPlik" accept="video/*" hidden></label>
        ${P_WZOR() ? `<span class="chip ok">✓ wzór: ${esc(P_WZOR().nazwa)}</span><button class="btn" id="wzorClaude">✦ Claude: ułóż moją rolkę jak wzór</button>` : ""}</div>
    </div>
    <div class="karta"><h3>✦ Animacja z opisu</h3>
      <p class="podpowiedz">Opisz animację jak montażyście After Effects. Claude napisze nową scenę w kolorach marki, sprawdzi ją, obejrzy klatki i wstawi do rolki. Zostaje jako Twój szablon („✦” na liście wyżej) do kolejnych rolek. Używa Twoich tokenów Claude.</p>
      <textarea id="anOpis" rows="3" placeholder="np. złota linia rysuje kontur brwi, potem napis „efekt po 1 zabiegu” wjeżdża z rozmyciem ruchu i kilka iskier błyska przy końcówce"></textarea>
      <div class="rzad" style="margin-top:8px"><span>start</span><input type="number" id="anStart" min="0" step="0.1" value="${r1(ED.t > 0 ? ED.t : Math.min(koniecUjec, 1))}" style="width:80px" title="domyślnie: miejsce głowicy na osi"><span>s, czas</span><input type="number" id="anCzas" min="1" max="10" step="0.5" value="3" style="width:70px"><span>s</span><button class="btn" id="anZrob">✦ Stwórz animację</button></div>
    </div>
    <div class="sceny-uklad"><div id="formSceny"></div><div id="boczny"></div></div>`;
  stopka(el);
  $("#sz").onchange = (e) => { r.debug_safe_zone = e.target.checked; zapiszIZloz(); };
  el.querySelectorAll("[data-dodaj]").forEach((b) => (b.onclick = () => {
    const sz = S.szablony.find((x) => x.id === b.dataset.dodaj);
    const start = b.dataset.dodaj === "hook-tytul" ? 0 : ED.t > 0 ? r1(ED.t) : b.dataset.dodaj === "cta-koncowe" ? r1(koniecUjec) : r1(Math.min(koniecUjec, Math.max(0, koniecUjec / 2)));
    const dane = {};
    if (sz.id === "hook-tytul" && S.wariantHooka) dane.wariant = S.wariantHooka;
    r.sceny.push({ szablon: sz.id, start, czas: Math.min(sz.czas, 4), dane });
    S.wybranaScena = r.sceny.length - 1;
    zapiszRolke(); pokaz();
  }));
  $("#wzorPlik").onchange = async (e) => {
    const f = e.target.files[0]; if (!f) return;
    try {
      toast("Wgrywam wzór…", 4000);
      const res = await fetch(`/api/projekt/${encodeURIComponent(S.projekt.nazwa)}/wzor?nazwa=${encodeURIComponent(f.name)}`, { method: "POST", body: f });
      const j = await res.json(); if (!res.ok) throw new Error(j.blad || "Nie udało się wgrać.");
      uruchom("wzor", [S.projekt.nazwa, j.plik], { opis: "Analiza rolki-wzoru", po: async ({ kod }) => { if (!kod) { await odswiezProjekt(); toast("Wzór rozłożony: zobacz tor „wzór” na osi"); } } });
    } catch (err) { blad(err); }
  };
  const wc = $("#wzorClaude"); if (wc) wc.onclick = () => claudeWzor();
  $("#anZrob").onclick = () => {
    const opis = $("#anOpis").value.trim();
    if (opis.length < 8) return toast("Opisz animację trochę dokładniej");
    otworzAsystenta({ tytul: "Animacja z opisu", powitanie: "Piszę animację według opisu, potem ją sprawdzę (lint i klatki) i wstawię do rolki. Poprawki możesz napisać mi tu, w rozmowie.", prompt: promptAnimacji({ opis, start: Number($("#anStart").value) || 0, czas: Number($("#anCzas").value) || 3 }) });
  };
  if (S.wybranaScena != null && r.sceny[S.wybranaScena]) formularzSceny(S.wybranaScena);
  else $("#formSceny").innerHTML = `<div class="karta"><p class="podpowiedz" style="margin:0">Kliknij scenę na osi albo dodaj nową.</p></div>`;
  edytorSceny($("#edytor"));
}
// Prompt „Animacja z opisu”: Claude pisze własny szablon 04_SZABLONY_HF/compositions/moj-*.html (albo poprawia istniejący).
function promptAnimacji({ opis, start, czas, popraw }) {
  const P = S.projekt;
  return `Użyj skilli: hyperframes, hyperframes-animation (rules, blueprints, techniques.md), gsap-core, gsap-timeline i rolki-beauty. Zasady z CLAUDE.md (marka, safe zone, bez obietnic medycznych, bez długich myślników).
Projekt rolki: ${P.nazwa} (folder ${P.sciezka}). Montaż: ${P.sciezka}/kompozycja/rolka.json.
${popraw ? `ZADANIE: popraw istniejącą animację 04_SZABLONY_HF/compositions/${popraw}.html według prośby: „${opis}”. Nie zmieniaj jej id.` : `ZADANIE: zrób nową animację (scenę) według opisu: „${opis}”. Start w rolce: ${start} s, czas: ${czas} s.`}

Jak to zrobić (ważne, bo panel i zloz tego wymagają):
1. ${popraw ? "Przeczytaj plik animacji." : `Wymyśl krótkie id po polsku bez znaków diakrytycznych z prefiksem „moj-” (np. moj-zlota-brew) i utwórz 04_SZABLONY_HF/compositions/<id>.html.`} Wzoruj się na 04_SZABLONY_HF/compositions/efekt-ae.html (struktura, styl kodu) i tekst-animowany.html: <html data-composition-id="<id>" data-composition-duration="${czas || 3}" data-composition-variables='[...]'>, <title> = krótka polska nazwa (2-4 słowa), <template> z #root, jeden .clip z id "<id>-clip", wszystkie id w środku z prefiksem "<id>-", w JS zmienna ID = "<id>", jedna pauzowana oś GSAP zarejestrowana w window.__timelines[ID], tl.set({}, {}, D) na końcu, zmienne przez window.__hyperframes.getVariables().
2. Zmienne (data-composition-variables): wszystko, co ${OS().mian} może chcieć zmienić bez Ciebie: teksty (tekst z *akcentem* i | jak w innych szablonach), a jeśli animacja dotyczy miejsca w kadrze, to x i y (px w kadrze 1080x1920; panel ma wtedy wskazywanie punktu kliknięciem). Etykiety po polsku.
3. Wygląd: tylko zmienne CSS marki (--akcent, --akcent-2, --zloto-jasne, --tekst, --granat, --bialy, --font-naglowki, --font-tekst), przezroczyste tło (to nakładka na nagranie), tekst w safe zone (--safe-top 220 px, --safe-bottom 420 px, --safe-right 140 px, --safe-left 60 px). Styl premium beauty: delikatnie, złoto i biel. Krzywe ruchu marki: skopiuj z 04_SZABLONY_HF/compositions/hook-tytul.html linię „var RUCH = ...” (czyta --ruch-wejscie, --ruch-wyjscie, --ruch-akcent, --ruch-plynny) i używaj ease: RUCH.we (pojawianie), RUCH.wy (znikanie), RUCH.ak (pop, akcent), RUCH.pl (przesunięcia, najazdy); ease "none" tylko dla postępu i liniowych torów. Wejście, chwila spokoju (min. 1 s czytania), wyjście na końcu. Techniki jak w AE z hyperframes-animation: rysowanie ścieżek SVG (trim paths), rozmycie ruchu, głębia ostrości, cząsteczki z funkcji hash, połysk na tekście, 3D. Nigdy Math.random, Date.now, fetch ani pętle requestAnimationFrame: wszystko z osi GSAP (render przewija klatki).
4. ${popraw ? "Upewnij się, że scena z tym szablonem jest w rolka.json." : `Dodaj scenę do ${P.sciezka}/kompozycja/rolka.json: {"szablon":"<id>","start":${start},"czas":${czas},"dane":{...wartości dopasowane do tej rolki}} (nie ruszaj innych scen).`}
5. Sprawdź: npx hyperframes lint 04_SZABLONY_HF --include-unmounted (0 błędów; bez „cd” i „&&”, każda komenda osobno). Potem npm run zloz -- ${P.nazwa} i npx hyperframes snapshot ${P.sciezka}/kompozycja --at <3-4 chwile w czasie sceny> --no-end. Obejrzyj klatki (Read) i popraw, jeśli coś wychodzi poza kadr, nachodzi na napisy, jest nieczytelne albo brzydkie. Nie renderuj filmu.
6. Napisz po polsku 2-3 zdania: co zrobiłeś, jak się nazywa animacja i co można w niej zmienić w panelu (krok Sceny). Jeśli opis był niejasny, zadaj JEDNO pytanie z ostatnią linią OPCJE: a | b | c zamiast zgadywać. Na końcu, gdy wszystko gotowe, ostatnia linia: GOTOWE`;
}
function formularzSceny(i) {
  const r = rolka(), s = r.sceny[i];
  const sz = S.szablony.find((x) => x.id === s.szablon);
  if (!sz) { $("#formSceny").innerHTML = `<div class="karta">Nie ma szablonu ${esc(s.szablon)}.</div>`; return; }
  s.dane ||= {}; s.media ||= {};
  const P = S.projekt;
  const pliki = [...P.pliki.raw, ...P.pliki.proxy, ...P.pliki.wyciete];
  const opcjeMediow = (typ, klucz) => pliki.filter((f) => (typ === "obraz" ? f.typ === "zdjecie" : klucz === "wyciete" ? /\.webm$/i.test(f.nazwa) : f.typ === "wideo" && !/\.webm$/i.test(f.nazwa))).map((f) => f.sciezka.slice(P.sciezka.length + 1));
  const autoPola = { handle: "z config.json", nazwa: s.szablon === "lower-third" ? "z config.json (osoba)" : "z config.json" };
  const pole = (z) => {
    const v = s.dane[z.id] ?? "";
    if (s.szablon === "animacja-lottie" && z.id === "plik") return `<select data-z="plik"><option value="">wybierz animację...</option>${(S.lottie || []).map((l) => `<option value="${esc(l.sciezka)}" ${v === l.sciezka ? "selected" : ""}>${esc(l.nazwa)}</option>`).join("")}</select>
      <div class="rzad" style="margin-top:6px"><label class="btn maly jasny">⬆ Wgraj .json / .lottie<input type="file" id="lottieWgraj" accept=".json,.lottie" hidden></label><a class="podpowiedz" href="https://lottiefiles.com/free-animations" target="_blank">darmowe animacje: LottieFiles</a></div>`;
    const auto = ["cta-koncowe", "ig-obserwuj", "lower-third"].includes(s.szablon) && autoPola[z.id] && v === "" ? `placeholder="${autoPola[z.id]}"` : `placeholder="${esc(z.default ?? "")}"`;
    if (z.type === "enum") return `<select data-z="${z.id}">${z.options.map((o) => `<option value="${esc(o.value)}" ${(v || z.default) === o.value ? "selected" : ""}>${esc(o.label)}</option>`).join("")}</select>`;
    if (z.type === "number") return `<input type="number" data-z="${z.id}" value="${esc(v)}" step="${z.step || 1}" ${z.min != null ? `min="${z.min}"` : ""} ${z.max != null ? `max="${z.max}"` : ""} ${auto}>`;
    if (z.type === "color") return `<input type="color" data-z="${z.id}" value="${esc(v || z.default)}">`;
    if (z.type === "boolean") return `<input type="checkbox" data-z="${z.id}" ${v === true || (v === "" && z.default) ? "checked" : ""}>`;
    const dlugi = /tekst|kroki|dopisek|tytul/.test(z.id);
    return dlugi ? `<textarea data-z="${z.id}" rows="2" ${auto}>${esc(v)}</textarea>` : `<input type="text" data-z="${z.id}" value="${esc(v)}" ${auto}>`;
  };
  const podp = { tekst: "*słowo* = kolor akcentu, | = nowa linia", kroki: "kolejne punkty oddzielone |", dopisek: "Zawsze zawiera „efekt indywidualny”. Puste pole = sam ten dopisek." };
  // Wskazywanie punktu x/y kliknięciem w klatkę z chwili startu sceny (sceny z polami x i y)
  const maPunkt = sz.zmienne.some((z) => z.id === "x") && sz.zmienne.some((z) => z.id === "y");
  let klatkaPunktu = "";
  if (maPunkt) {
    const cz = czasyUjec(), st = Number(s.start || 0);
    const k = Math.max(0, cz.findIndex((c) => st >= c.start && st < c.koniec));
    const u = r.ujecia[k];
    if (u?.src) klatkaPunktu = thumb(wProjekcie(u.src), /\.(jpe?g|png|webp)$/i.test(u.src) ? 0 : r1(Number(u.od || 0) + (st - (cz[k]?.start || 0)) + 0.4), 360);
  }
  $("#formSceny").innerHTML = `<div class="karta">
    <div class="naglowek"><h3>${esc(nazwaSzablonu(s.szablon))}</h3><button class="btn maly jasny" id="usunSc">Usuń scenę</button></div>
    <div class="rzad"><label class="pole" style="flex:1"><span>Start (s)</span><input type="number" step="0.1" min="0" id="scStart" value="${s.start}"></label><label class="pole" style="flex:1"><span>Czas (s)</span><input type="number" step="0.1" min="0.5" id="scCzas" value="${s.czas}"></label></div>
    ${maPunkt ? `<div class="pole"><span>Punkt na kadrze: kliknij w detal (brew, rzęsy, efekt)</span><div class="punkt-kadr" id="punktKadr" style="position:relative;width:180px;aspect-ratio:9/16;border-radius:10px;overflow:hidden;cursor:crosshair;background:#ddd ${klatkaPunktu ? `url('${klatkaPunktu}') center/cover` : ""}"><div id="punktZnak" style="position:absolute;width:18px;height:18px;margin:-9px 0 0 -9px;border-radius:50%;border:3px solid #fff;box-shadow:0 0 0 2px var(--akcent),0 2px 6px rgba(0,0,0,.4);left:${(Number(s.dane.x ?? sz.zmienne.find((z) => z.id === "x").default) / 1080) * 100}%;top:${(Number(s.dane.y ?? sz.zmienne.find((z) => z.id === "y").default) / 1920) * 100}%"></div></div><small class="podpowiedz">Klatka z chwili startu sceny. Pola X i Y niżej ustawią się same.</small></div>` : ""}
    ${sz.zmienne.filter((z) => !/ustawia zloz/i.test(z.label || "")).map((z) => `<label class="pole"><span>${esc(z.label || z.id)}</span>${pole(z)}${podp[z.id] ? `<small class="podpowiedz">${podp[z.id]}</small>` : ""}</label>`).join("")}
    ${sz.sloty.filter((sl) => !(s.szablon === "zdjecie-3d" && /^(przod|mapa_)/.test(sl.klucz))).map((sl) => `<label class="pole"><span>Plik: ${esc(sl.klucz)} (${sl.typ})</span><select data-m="${sl.klucz}"><option value="">placeholder z szablonu</option>${opcjeMediow(sl.typ, sl.klucz).map((o) => `<option ${s.media[sl.klucz] === o ? "selected" : ""}>${esc(o)}</option>`).join("")}</select></label>`).join("")}
    ${["tekst-za-postacia", "glebia-tla"].includes(s.szablon) ? `<div class="ramka info">Tło i wycięcie muszą być z tego samego klipu. Wybierz „tlo” z proxy/ i kliknij „Wytnij postać” (kilka minut, pierwszy raz dłużej).</div><button class="btn" id="wytnij" data-zadanie>Wytnij postać z wybranego tła</button>
      ${s.media.wyciete ? `<div class="rzad" style="margin-top:10px"><span>Miękkość krawędzi</span><input type="range" id="wygKraw" min="0" max="100" step="10" value="50" style="width:120px"><button class="btn maly jasny" id="wygladzKraw" data-zadanie>Wygładź krawędzie wycięcia</button></div><small class="podpowiedz">Usuwa twarde schodki i resztki tła na obwódce postaci. Nowe wycięcia są wygładzane same; zawsze liczone od oryginału, więc można poprawiać do skutku.</small>` : ""}` : ""}
    ${s.szablon.startsWith("moj-") ? `<div class="ramka info" style="margin-top:10px"><b>✦ Twoja animacja.</b> Napisz, co zmienić (np. „wolniej”, „linia grubsza”, „dodaj iskry na końcu”), Claude poprawi ją we wszystkich rolkach.<textarea id="anPopraw" rows="2" style="margin-top:6px"></textarea><button class="btn maly" id="anPoprawBtn" style="margin-top:6px">✦ Popraw z Claude</button></div>` : ""}
    ${s.szablon === "zdjecie-3d" ? `<div class="ramka info">Zdjęcie ożywa w 3D: system liczy głębię (co jest blisko, co daleko) i przy ruchu kamery bliższe rzeczy przesuwają się bardziej niż tło. Tekst może schować się za postacią, a ostrość przeskoczyć z tła na postać. Pierwsze złożenie z nowym zdjęciem trwa kilka sekund dłużej. Najlepiej działa zdjęcie z wyraźną postacią albo przedmiotem na pierwszym planie.</div>` : ""}
    ${s.szablon === "przed-po" ? `<div class="pole"><label class="rzad"><input type="checkbox" id="ppWyr" ${s.wyrownaj !== false ? "checked" : ""}> Wyrównaj zdjęcia (to samo miejsce, skala i obrót)</label><label class="rzad"><input type="checkbox" id="ppSw" ${s.wyrownaj_swiatlo !== false ? "checked" : ""} ${s.wyrownaj === false ? "disabled" : ""}> Wyrównaj światło i balans bieli (łagodnie, bez nasycenia)</label><small class="podpowiedz">System dopasowuje „po” do „przed” po twarzy (kąciki oczu, nos, broda: to, czego zabieg nie zmienia) albo po szczegółach obrazu przy stopach i paznokciach, a oba zdjęcia przycina do wspólnej części. Tryb „Po łuku brwi” prowadzi kurtynę kształtem brwi (wymaga twarzy na zdjęciu „przed”).</small></div>
    <div class="ramka info">Dopisek „efekt indywidualny” jest zawsze widoczny. To zasada branżowa, nie da się go wyłączyć.</div>` : ""}
  </div>`;
  const ppW = $("#ppWyr"); if (ppW) { ppW.onchange = () => { if (ppW.checked) delete s.wyrownaj; else s.wyrownaj = false; $("#ppSw").disabled = !ppW.checked; zapiszRolke(); }; $("#ppSw").onchange = (e) => { if (e.target.checked) delete s.wyrownaj_swiatlo; else s.wyrownaj_swiatlo = false; zapiszRolke(); }; }
  $("#usunSc").onclick = () => { r.sceny.splice(i, 1); S.wybranaScena = null; zapiszRolke(); pokaz(); };
  const odswiezOs = debounce(() => { const y = window.scrollY; pokaz(); window.scrollTo(0, y); }, 900);
  $("#scStart").oninput = (e) => { s.start = r1(Number(e.target.value) || 0); zapiszRolke(); odswiezOs(); };
  $("#scCzas").oninput = (e) => { s.czas = r1(Math.max(0.5, Number(e.target.value) || 1)); zapiszRolke(); odswiezOs(); };
  $("#formSceny").querySelectorAll("[data-z]").forEach((inp) => {
    const z = sz.zmienne.find((x) => x.id === inp.dataset.z);
    const ustaw = () => {
      let v = inp.type === "checkbox" ? inp.checked : inp.value;
      if (z.type === "number") v = inp.value === "" ? "" : Number(inp.value);
      if (v === "" || v == null) delete s.dane[z.id]; else s.dane[z.id] = v;
      zapiszRolke();
    };
    inp.oninput = ustaw; inp.onchange = ustaw;
  });
  $("#formSceny").querySelectorAll("[data-m]").forEach((sel) => (sel.onchange = () => { if (sel.value) s.media[sel.dataset.m] = sel.value; else delete s.media[sel.dataset.m]; zapiszRolke(); }));
  const wyt = $("#wytnij");
  if (wyt) wyt.onclick = () => {
    const tlo = s.media.tlo;
    if (!tlo || !/^proxy\//.test(tlo)) return toast("Najpierw wybierz „tlo” z folderu proxy/");
    uruchom("wytnij-tlo", [P.nazwa, tlo], { opis: "Wycinanie postaci", po: async ({ kod }) => { if (!kod) { s.media.wyciete = `wyciete/${tlo.split("/").pop().replace(/\.\w+$/, "")}.webm`; zapiszRolke(); await odswiezProjekt(); } } });
  };
  const apb = $("#anPoprawBtn");
  if (apb) apb.onclick = () => {
    const opis = $("#anPopraw").value.trim();
    if (!opis) return toast("Napisz, co zmienić");
    otworzAsystenta({ tytul: "Popraw animację " + s.szablon, powitanie: "Poprawiam animację i sprawdzam klatki.", prompt: promptAnimacji({ opis, popraw: s.szablon }) });
  };
  const pk = $("#punktKadr");
  if (pk) pk.onclick = (e) => {
    const b = pk.getBoundingClientRect();
    const x = Math.round(((e.clientX - b.left) / b.width) * 1080 / 5) * 5, y = Math.round(((e.clientY - b.top) / b.height) * 1920 / 5) * 5;
    s.dane.x = x; s.dane.y = y; zapiszRolke();
    $("#punktZnak").style.left = (x / 1080) * 100 + "%"; $("#punktZnak").style.top = (y / 1920) * 100 + "%";
    const ix = $("#formSceny").querySelector('[data-z="x"]'), iy = $("#formSceny").querySelector('[data-z="y"]');
    if (ix) ix.value = x; if (iy) iy.value = y;
  };
  const lw = $("#lottieWgraj");
  if (lw) lw.onchange = async () => {
    const f = lw.files[0]; if (!f) return;
    try {
      const res = await fetch(`/api/lottie?nazwa=${encodeURIComponent(f.name)}`, { method: "POST", body: f });
      const j = await res.json();
      if (!res.ok) throw new Error(j.blad || j.error || "Nie udało się wgrać pliku.");
      S.lottie = await api("/api/lottie");
      s.dane.plik = j.sciezka;
      if (j.czas && j.czas < 12) s.czas = Math.max(s.czas, j.czas);
      zapiszRolke(); formularzSceny(i); toast(`Wgrano ${j.nazwa} (${j.czas} s)`);
    } catch (err) { blad(err); }
  };
  const wk = $("#wygladzKraw");
  if (wk) wk.onclick = () => uruchom("ulepsz", [P.nazwa, s.media.wyciete, "--krawedzie", "--wygladz", $("#wygKraw").value], { opis: "Wygładzanie krawędzi wycięcia", po: async ({ kod }) => { if (!kod) { await odswiezProjekt(); toast("Krawędzie wygładzone"); } } });
  // panel boczny: podpowiedzi hooków
  if (s.szablon === "hook-tytul") {
    const lista = S.hooki[grupaHookow()] || [];
    $("#boczny").innerHTML = `<div class="karta"><h3>Podpowiedzi hooków</h3><p class="podpowiedz">${esc(NAZWY_KAT[S.projekt.pola["kategoria"]] || "")}: kliknij, żeby wstawić. Podmień [zabieg] na konkret.</p><div class="hooki">${lista.map((h) => `<button data-h="${esc(h.tekst)}" title="${esc(h.typ)}">${esc(h.tekst)}</button>`).join("")}</div></div>`;
    $("#boczny").querySelectorAll("[data-h]").forEach((b) => (b.onclick = () => { s.dane.tekst = b.dataset.h; zapiszRolke(); formularzSceny(i); }));
  } else $("#boczny").innerHTML = `<div class="karta"><p class="podpowiedz" style="margin:0">Kolory, fonty i marginesy bierzemy z marki (config.json). Tekst zawsze zostaje w bezpiecznej strefie Instagrama.</p></div>`;
}

// =====================================================================
// 7. RENDER
// =====================================================================
function blokadaFinalu() {
  const p = S.projekt.pola, r = rolka();
  if (/^tak/i.test(p["twarz klientki w kadrze"] || "") && !/^tak/i.test(p["zgoda na wizerunek"] || "")) return "W kadrze jest twarz klientki, a nie ma zgody na wizerunek (krok Brief).";
  if (r.debug_safe_zone) return "Włączony jest podgląd safe zone. Wyłącz go w kroku Styl albo Sceny.";
  if (!r.ujecia?.length && !r.sceny?.length) return "Rolka nie ma ujęć ani scen.";
  return null;
}
// Warianty hooka: ten sam montaż, inny hook na starcie -> test na Instagramie (rolki testowe), porównanie % pominięć.
function kartaWariantow(blok) {
  const P = S.projekt;
  const hooki = (P.scenariusz?.hooki || []).length || (String(P.sekcje["Hook (3 warianty)"] || "").match(/^\s*\d+\.\s*\S/gm) || []).length;
  const w = P.pliki.warianty || [];
  return `<div class="karta"><div class="naglowek"><div><h3>🧪 Warianty hooka do testu</h3><p>Ten sam montaż, inny hook w 1. sekundzie. Final (A) wrzucasz normalnie, warianty jako rolki testowe. Po 24-48 h wygrywa ten z najniższym „% pominięć”. Wynik wpisz w Publikacja > Wyniki.</p></div>
    <button class="btn" id="warianty" data-zadanie ${blok || hooki < 2 ? 'data-zablokowany="1"' : ""} title="${hooki < 2 ? "Potrzebne co najmniej 2 hooki (brief albo scenariusz)" : blok ? esc(blok) : "Render high każdego wariantu"}">Zrób warianty (${Math.max(0, hooki - 1)})</button></div>
    ${w.length ? `<div class="warianty">${w.map((f) => `<button class="btn maly jasny" data-wariant="${esc(f.sciezka)}">▶ ${esc(f.nazwa)}</button>`).join("")}</div>` : ""}</div>`;
}
// Kontrola obrazu po renderze (scripts/kontrola-obrazu.mjs -> kompozycja/kontrola-obrazu.json + kontrola/*.jpg).
function kartaKontroliObrazu() {
  const K = S.projekt?.kontrolaObrazu;
  const przyc = `<button class="btn maly" id="koSprawdz" data-zadanie title="Dwa szybkie rendery (z nakładkami i bez) i porównanie co 0,25 s: napis na twarzy, napis pod przyciskami Instagrama, kontrast tekstu, czarne, ciemne i przepalone klatki, błyski. Problemy trafiają jako znaczniki do „✦ Claude: popraw znaczniki”. Ok. 1-2 min, za darmo.">${K ? "↻ Sprawdź ponownie" : "🔍 Sprawdź obraz"}</button>`;
  if (!K) return `<div class="karta"><div class="naglowek"><div><h3>🔍 Kontrola obrazu</h3><p class="podpowiedz">Bot ogląda rolkę klatka po klatce: czy napis nie zasłania twarzy, czy nic nie wchodzi pod przyciski Instagrama, czy tekst jest czytelny, czy nie ma czarnych, przepalonych klatek i błysków.</p></div>${przyc}</div></div>`;
  const nieakt = S.projekt.rolkaZmiana && Date.parse(S.projekt.rolkaZmiana) > Date.parse(K.data) + 5000;
  const IK = { krytyczne: "✗", wazne: "!", kosmetyka: "·" }, pl = (x) => String(x).replace(".", ",");
  return `<div class="karta"><div class="naglowek"><h3>🔍 Kontrola obrazu <b>${K.ocena}</b><small class="podpowiedz">/100 · ${new Date(K.data).toLocaleString("pl-PL")}${nieakt ? ' · <span style="color:var(--uwaga)">rolka zmieniła się od kontroli</span>' : ""}</small></h3>${przyc}</div>
    ${K.problemy.length ? `<ul class="pm-ocena-lista ko-lista">${K.problemy.map((p) => `<li>${p.obraz ? `<img src="/media?p=${encodeURIComponent(wProjekcie("kompozycja/kontrola/" + p.obraz))}" alt="" loading="lazy">` : ""}<div><b>${IK[p.waga] || "!"} ${pl(p.od)}-${pl(p.do)} s: ${esc(p.opis)}</b>${p.propozycja ? `<br><small>→ ${esc(p.propozycja)}</small>` : ""}</div></li>`).join("")}</ul>
      <div class="rzad" style="justify-content:space-between;margin-top:8px"><small class="podpowiedz">Każdy problem jest znacznikiem na osi czasu (autor: kontrola). Claude poprawi je w kroku Sceny.</small><button class="btn maly" id="koDoScen">Popraw z Claude (krok Sceny) →</button></div>` : `<p class="podpowiedz">✓ Obraz bez zastrzeżeń (${K.klatek} klatek sprawdzonych).</p>`}</div>`;
}
function podepnijKontroleObrazu(el) {
  const s = $("#koSprawdz", el); if (s) s.onclick = () => uruchom("kontrola-obrazu", [S.projekt.nazwa, "--znaczniki"], { opis: "Kontrola obrazu (rendery próbne i analiza klatek)", po: odswiezProjekt });
  const d = $("#koDoScen", el); if (d) d.onclick = () => idz(5);
}
// Kontrola nagranego hooka (scripts/kontrola-hooka.mjs -> kompozycja/hook.json).
function kartaKontroliHooka() {
  const K = S.projekt?.kontrolaHooka;
  const IK = { ok: "✓", uwaga: "!", blad: "✗", pominiety: "·" };
  const przyc = `<button class="btn maly" id="khSprawdz" data-zadanie title="Pierwsze słowo, hook jak w scenariuszu, ruch i ostrość pierwszej klatki, energia głosu. Ok. 20-60 s.">${K ? "↻ Sprawdź ponownie" : "🪝 Sprawdź nagrany hook"}</button>`;
  if (!K) return `<div class="karta"><div class="naglowek"><div><h3>🪝 Kontrola nagranego hooka</h3><p class="podpowiedz">Sprawdza prawdziwe nagranie: czy pierwsze słowo pada od razu, czy hook brzmi jak w scenariuszu, czy pierwsza klatka ma ruch i jest ostra, czy głos ma energię.</p></div>${przyc}</div></div>`;
  const nieakt = S.projekt.rolkaZmiana && Date.parse(S.projekt.rolkaZmiana) > Date.parse(K.data);
  return `<div class="karta"><div class="naglowek"><h3>🪝 Kontrola nagranego hooka <b>${K.wynik ?? "?"}</b><small class="podpowiedz">/100 · ${new Date(K.data).toLocaleString("pl-PL")}${nieakt ? ' · <span style="color:var(--uwaga)">rolka zmieniła się od tej kontroli</span>' : ""}</small></h3><div class="rzad">${przyc}${K.naprawa ? `<button class="btn maly" id="khNapraw" data-zadanie title="${esc(K.testy.find((t) => t.id === "pierwsze_slowo")?.naprawa || "")}">✂ Przytnij ciszę na starcie (${String(K.naprawa.o).replace(".", ",")} s)</button>` : ""}</div></div>
    <ul class="pm-ocena-lista">${K.testy.map((t) => `<li><div><b>${IK[t.poziom]} ${esc(t.nazwa)}</b><br><small>${esc(t.tekst)}</small>${t.naprawa && t.poziom !== "ok" ? `<br><small>→ ${esc(t.naprawa)}</small>` : ""}</div></li>`).join("")}</ul></div>`;
}
function podepnijKontroleHooka(el) {
  const s = $("#khSprawdz", el); if (s) s.onclick = () => uruchom("kontrola-hooka", [S.projekt.nazwa], { opis: "Kontrola nagranego hooka", po: odswiezProjekt });
  const n = $("#khNapraw", el); if (n) n.onclick = () => uruchom("kontrola-hooka", [S.projekt.nazwa, "--napraw"], { opis: "Przycinanie ciszy na starcie rolki", po: odswiezProjekt });
}
function ekranRender(el) {
  const P = S.projekt;
  const wersje = [...P.pliki.final.filter((f) => f.typ === "wideo"), ...P.pliki.render.filter((f) => f.typ === "wideo")].sort((a, b) => Date.parse(b.data) - Date.parse(a.data));
  const blok = blokadaFinalu();
  const uj = rolka().ujecia.filter((u) => u.src && !/\.(jpe?g|png)$/i.test(u.src));
  const okl = P.pliki.final.find((f) => f.nazwa === "okladka.jpg");
  const maFinal = P.pliki.final.some((f) => f.nazwa === `${P.nazwa}.mp4`);
  const ma4K = P.pliki.final.some((f) => f.nazwa === `${P.nazwa}_4K.mp4`);
  el.innerHTML = `
    <div class="naglowek"><div><h1>Podgląd i render</h1><p>Wersja robocza do sprawdzenia, potem do akceptacji, na końcu final.</p></div></div>
    ${kartaRetencji()}
    ${kartaKontroliHooka()}
    ${kartaKontroliObrazu()}
    <div class="kolumny">
      <div class="karta">
        <div class="rzad" style="margin-bottom:14px">
          <button class="btn jasny" id="studio" data-zadanie>Podgląd w Studio</button>
          <button class="btn" id="draft" data-zadanie>Wersja robocza</button>
          <button class="btn" id="standard" data-zadanie>Do akceptacji</button>
          <button class="btn ciemny" id="final" data-zadanie ${blok ? 'data-zablokowany="1"' : ""}>Final</button>
        </div>
        ${maFinal ? `<div class="ramka info" style="margin-bottom:14px"><b>🔎 Final w 4K</b> (2160x3840): upscaling AI + gładkie krawędzie napisów i konturów. Na Instagram wgraj wersję _4K, po ich kompresji zostaje więcej detalu. ${ma4K ? '<span class="chip ok">✓ jest wersja 4K</span>' : ""}
          <div class="rzad" style="margin-top:8px"><button class="btn maly" id="final4k" data-zadanie>${ma4K ? "Zrób 4K jeszcze raz" : "Zrób wersję 4K (AI, ok. 10 min)"}</button><button class="btn maly jasny" id="final4kSzybko" data-zadanie>4K szybko (bez AI)</button></div></div>` : ""}
        ${blok ? `<div class="ramka ostrzezenie"><b>Final zablokowany.</b> ${esc(blok)}</div>` : `<p class="podpowiedz">Każdy render najpierw sprawdza kompozycję (lint). Wersja robocza to ok. pół minuty.</p>`}
        <div id="studioLink"></div>
        <div class="wersje">${wersje.map((f, i) => `<button data-v="${esc(f.sciezka)}" class="${i === 0 ? "wybrany" : ""}">${/final\//.test(f.sciezka) ? "★ FINAL" : "▶"} ${esc(f.nazwa)} <span class="podpowiedz">· ${f.czas ? r1(f.czas) + " s" : ""} · ${new Date(f.data).toLocaleString("pl-PL", { dateStyle: "short", timeStyle: "short" })}</span></button>`).join("") || '<p class="podpowiedz">Nie ma jeszcze żadnej wersji.</p>'}</div>
      </div>
      <div class="karta" style="display:flex;justify-content:center">${wersje.length ? telefon(`<video class="odtwarzacz" id="player" src="${media(wersje[0].sciezka)}&v=${Date.parse(wersje[0].data)}" controls playsinline></video>`) : `<div class="odtwarzacz" style="display:grid;place-items:center;color:#fff">brak renderu</div>`}</div>
    </div>
    ${kartaAudytuAutopilota(P)}
    ${kartaWariantow(blok)}
    <div class="karta"><h3>Okładka</h3>
      <div class="rzad" style="align-items:flex-start;gap:24px">
        <div class="okladka-podglad" id="oklPodglad" style="background-image:url('${okl ? media(okl.sciezka) + "&v=" + Date.parse(okl.data) : ""}')"></div>
        <div style="flex:1;min-width:260px">
          <label class="pole"><span>Tytuł na okładkę</span><input type="text" id="oklTytul" value="${esc((P.pola["tytuł na okładkę"] || "").replace(/^TODO$/i, ""))}" placeholder="np. Laminacja *brwi*|ile to trzyma?"><small class="podpowiedz">*słowo* = kolor akcentu, | = nowa linia</small></label>
          <label class="pole"><span>Klatka z ujęcia</span><select id="oklKlip">${uj.map((u) => `<option value="${esc(u.src)}">${esc(u.src.split("/").pop())}</option>`).join("")}</select></label>
          <label class="pole"><span>Moment: <b id="oklT">1.0</b> s</span><input type="range" id="oklCzas" min="0" max="10" step="0.1" value="1" style="width:100%;accent-color:var(--akcent)"></label>
          <img id="oklKlatka" style="width:120px;border-radius:8px;display:block;margin-bottom:12px">
          <button class="btn" id="oklZrob" data-zadanie ${uj.length ? "" : 'data-zablokowany="1"'}>Zrób okładkę</button>
        </div>
      </div></div>`;
  stopka(el);
  podepnijRetencje(el);
  zapewnijSlowa(() => odswiezKarteRetencji(el));
  const wb = $("#warianty");
  if (wb) wb.onclick = () => { if (blok) return; uruchom("warianty-hooka", [P.nazwa], { opis: "Warianty hooka (render każdego)", po: poRenderze }); };
  el.querySelectorAll("[data-wariant]").forEach((b) => (b.onclick = () => { const pl2 = $("#player"); if (pl2) { pl2.src = media(b.dataset.wariant) + "&t=" + Date.now(); pl2.play(); } }));
  const pl = $("#player");
  el.querySelectorAll("[data-v]").forEach((b) => (b.onclick = () => { el.querySelectorAll("[data-v]").forEach((x) => x.classList.toggle("wybrany", x === b)); if (pl) { pl.src = media(b.dataset.v) + "&t=" + Date.now(); pl.play(); } }));
  const poRenderze = () => odswiezProjekt();
  $("#draft").onclick = () => uruchom("render", [P.nazwa], { opis: "Wersja robocza", po: poRenderze });
  podepnijKontroleHooka(el);
  podepnijKontroleObrazu(el);
  podepnijAudytAutopilota(el);
  $("#standard").onclick = () => uruchom("render", [P.nazwa, "--standard"], { opis: "Wersja do akceptacji", po: poRenderze });
  $("#final").onclick = () => { if (blok) return; uruchom("render", [P.nazwa, "--final"], { opis: "Final (jakość high)", po: poRenderze }); };
  const f4 = $("#final4k"); if (f4) f4.onclick = () => uruchom("ulepsz", [P.nazwa, "--final"], { opis: "Final w 4K (upscaling AI)", po: poRenderze });
  const f4s = $("#final4kSzybko"); if (f4s) f4s.onclick = () => uruchom("ulepsz", [P.nazwa, "--final", "--szybki"], { opis: "Final w 4K (szybko)", po: poRenderze });
  $("#studio").onclick = () => uruchom("zloz", [P.nazwa], { opis: "Składanie kompozycji", po: ({ kod }) => { if (kod) return; uruchom("podglad", [P.nazwa], { opis: "Studio", po: ({ tekst }) => { const u = (tekst.match(/https?:\/\/localhost:\d+\S*/) || [])[0]; if (u) { $("#studioLink").innerHTML = `<div class="ramka ok">Studio działa: <a href="${esc(u)}" target="_blank">${esc(u)}</a></div>`; window.open(u, "_blank"); } } }); } });
  // okładka
  const klip = $("#oklKlip"), czas = $("#oklCzas");
  const odswiezKlatke = () => { if (!klip.value) return; const m = metaPliku(klip.value); czas.max = m?.czas || 10; $("#oklT").textContent = Number(czas.value).toFixed(1); $("#oklKlatka").src = thumb(wProjekcie(klip.value), czas.value, 240); };
  klip.onchange = odswiezKlatke; czas.oninput = debounce(odswiezKlatke, 150);
  odswiezKlatke();
  $("#oklTytul").oninput = (e) => zapiszBriefPozniej({ "tytuł na okładkę": e.target.value });
  $("#oklZrob").onclick = () => {
    const args = [P.nazwa, "--klatka", klip.value, "--czas", String(czas.value)];
    const t = $("#oklTytul").value.trim();
    if (t) args.push("--tytul", t);
    uruchom("okladka", args, { opis: "Okładka", po: poRenderze });
  };
}

// =====================================================================
// 8. PUBLIKACJA
// =====================================================================
function ekranPublikacja(el) {
  const P = S.projekt;
  const sek = P.sekcje;
  const czysc = (s) => (s || "").replace(/^TODO\s*$/im, "").trim();
  const final = P.pliki.final.find((f) => f.typ === "wideo");
  const zapamietane = JSON.parse(localStorage.getItem("check_" + P.nazwa) || "{}");
  el.innerHTML = `
    <div class="naglowek"><div><h1>Publikacja</h1><p>Opis, hashtagi, kontrola i lista do odhaczenia.</p></div></div>
    <div class="kolumny">
      <div class="karta">
        <label class="pole"><span>Opis pod rolkę</span><textarea id="opis" rows="6" placeholder="Mówiony, krótki, bez obietnic.">${esc(czysc(sek["Opis pod rolkę"]))}</textarea></label>
        <label class="pole"><span>3 hooki tekstowe (do testów)</span><textarea id="hooki" rows="4">${esc(czysc(sek["Hook (3 warianty)"]))}</textarea></label>
        <label class="pole"><span>Hashtagi (5-10: lokalne + branżowe)</span><textarea id="tagi" rows="2">${esc(czysc(sek["Hashtagi"]))}</textarea></label>
        <div class="rzad"><button class="btn" id="kopiuj">Kopiuj opis z hashtagami</button><button class="btn jasny" id="folder">Otwórz folder final</button></div>
      </div>
      <div class="karta" style="display:flex;flex-direction:column;align-items:center">${final && P.rolkaZmiana && Date.parse(P.rolkaZmiana) > Date.parse(final.data) ? `<div class="ramka ostrzezenie" style="width:100%">Montaż zmienił się po ostatnim finale. Zrób final jeszcze raz w kroku „Render”.</div>` : ""}${final ? telefon(`<video class="odtwarzacz" src="${media(final.sciezka)}&v=${Date.parse(final.data)}" controls playsinline></video>`) : `<div class="ramka info">Nie ma jeszcze finalu. Zrób go w kroku „Render”.</div>`}</div>
    </div>
    <div class="kolumny">
      <div class="karta"><div class="naglowek"><h3>Kontrola pliku</h3><button class="btn" id="sprawdz" data-zadanie ${final ? "" : 'data-zablokowany="1"'}>Sprawdź</button></div><ul class="wynik-lista" id="wyniki"><li class="podpowiedz" style="display:block">Kliknij „Sprawdź”, żeby skontrolować final.</li></ul></div>
      <div class="karta checklista" id="checklista"></div>
    </div>
    ${kartaPublikacji()}
    <div class="ramka info rzad" style="justify-content:space-between;margin-bottom:14px"><span>📸 Wyniki mogą się pobierać same z Instagrama (wyświetlenia, % pominięć, czas oglądania, zapisy, wysłania).</span><button class="btn maly" id="pubIG">Wyniki z Instagrama</button></div>
    ${kartaWynikow()}`;
  setTimeout(() => { const b = $("#pubIG"); if (b) b.onclick = oknoInstagrama; });
  stopka(el, true, false);
  podepnijPublikacje(el);
  podepnijWyniki(el);
  $("#opis").oninput = (e) => zapiszBriefPozniej({}, { "Opis pod rolkę": e.target.value });
  $("#hooki").oninput = (e) => zapiszBriefPozniej({}, { "Hook (3 warianty)": e.target.value });
  $("#tagi").oninput = (e) => zapiszBriefPozniej({}, { Hashtagi: e.target.value });
  $("#kopiuj").onclick = async () => { const t = `${$("#opis").value.trim()}\n\n${$("#tagi").value.trim()}`; try { await navigator.clipboard.writeText(t); toast("Skopiowano opis"); } catch { blad(new Error("Nie udało się skopiować")); } };
  $("#folder").onclick = () => api("/api/otworz", { method: "POST", body: { sciezka: wProjekcie("final") } });
  $("#sprawdz").onclick = () => uruchom("sprawdz", [P.nazwa, "--json"], { opis: "Kontrola finalu", po: ({ tekst }) => {
    const linia = tekst.split("\n").reverse().find((l) => l.startsWith("{"));
    if (!linia) return;
    const j = JSON.parse(linia);
    $("#wyniki").innerHTML = j.wyniki.map((w) => `<li><span class="k ${w.stan}"></span><span>${esc(w.co)}</span><b>${esc(w.szczegol)}</b></li>`).join("") + `<li style="display:block;border:0;padding-top:12px">${j.bledy ? `<div class="ramka ostrzezenie">${j.bledy} krytycznych do poprawy. Nie publikuj jeszcze.</div>` : `<div class="ramka ok">Gotowe do publikacji${j.uwagi ? ` (${j.uwagi} uwag do przejrzenia)` : ""}.</div>`}</li>`;
    S.projekt.pola.status = j.bledy ? "sprawdzona" : "gotowa do publikacji";
  } });
  api("/api/checklista").then((lista) => {
    let g = "";
    $("#checklista").innerHTML = `<h3>Checklista przed wrzuceniem</h3>` + lista.map((c, i) => `${c.grupa !== g ? `<h4>${esc((g = c.grupa))}</h4>` : ""}<label><input type="checkbox" data-c="${i}" ${zapamietane[i] ? "checked" : ""}> ${esc(c.tekst)}</label>`).join("");
    $("#checklista").querySelectorAll("[data-c]").forEach((c) => (c.onchange = () => { zapamietane[c.dataset.c] = c.checked; localStorage.setItem("check_" + P.nazwa, JSON.stringify(zapamietane)); }));
  });
}

// =====================================================================
// Samouczący się przepis (scripts/algorytm.mjs, /api/algorytm)
// Wynik rolki = porównanie z Twoją medianą; wagi składników ściągane do zera przy małej liczbie rolek;
// rolka na próbę = losowanie Thompsona (testuje to, czego jeszcze nie znamy).
// =====================================================================
const TRYBY = [["mieszany", "Mieszany", "Ogólne zasady + Twój przepis. Udział Twoich wyników rośnie z liczbą rolek."], ["moj", "Mój", "Tylko to, co działa u Ciebie (najlepiej od ok. 8 rolek z wynikami)."], ["zwykly", "Zwykły", "Ogólne, sprawdzone zasady, bez Twoich wyników."]];
const znak = (p) => (p > 0 ? "+" : "") + p + "%";
const NAZWY_CECH = { kategoria: "Kategoria", format: "Format", hook: "Typ hooka", dlugosc: "Długość", tempo: "Tempo cięć", kto_mowi: "Kto mówi", zajawka: "Zajawka", przebitki: "Przebitki", mikro_ciecia: "Mikro-cięcia", cta: "CTA", pora: "Pora", dzien: "Dzień", proba: "Na próbę" };
const NAZWY_WSK_KROTKO = { utrzymanie: "utrzymanie", zostaja3s: "zostają po 3 s", wyslania: "wysłania", zasieg: "zasięg", zapisy: "zapisy", polubienia: "polubienia" };
async function odswiezAlgorytm() { try { S.algorytm = await api("/api/algorytm"); } catch { S.algorytm = null; } return S.algorytm; }
async function kartaAlgorytmu() {
  const box = $("#algorytmKarta"); if (!box) return;
  const A = await odswiezAlgorytm(); if (!A || !$("#algorytmKarta")) return;
  const cecha = (c) => `<li><b>${esc(c.nazwa)}: ${esc(c.wartosc)}</b> <span class="${c.procent >= 0 ? "plus" : "minus"}">${znak(c.procent)}</span> <small>${c.n} rolek · pewność ${esc(c.pewnosc)}</small></li>`;
  box.innerHTML = `<div class="karta alg-karta"><div class="naglowek"><div><h3>🧠 Twój przepis na rolki <small class="podpowiedz">uczy się na wynikach</small></h3>
      <p>${A.zWynikami ? `${A.zWynikami} ${A.zWynikami === 1 ? "rolka" : "rolek"} z wynikami · pewność: ${esc(A.pewnoscOgolna)} · w trybie mieszanym ${Math.round(A.alfa * 100)}% przepisu to Twoje dane` : "Jeszcze nie ma rolek z wynikami. Po publikacji kliknij „Opublikowałam” w kroku Publikacja, a po 7 dniach wpisz wyniki. Od 3 rolek przepis zaczyna się uczyć."}</p></div>
      ${A.zWynikami ? `<button class="btn jasny" id="algSzczegoly">Szczegóły</button>` : ""}</div>
    ${A.czekajace.length ? `<div class="ramka ostrzezenie"><b>⏰ ${A.czekajace.length === 1 ? "1 rolka czeka" : `${A.czekajace.length} rolki czekają`} na wyniki z 7. dnia:</b> ${A.czekajace.map((r) => `<a href="#" data-alg-otworz="${esc(r.nazwa)}" data-gdzie="${esc(r.gdzie)}">${esc(r.tytul)}</a> (${r.dni} dni)`).join(", ")}</div>` : ""}
    ${A.zWynikami >= 2 ? `<div class="alg-kolumny"><div><h4>✅ Działa u Ciebie</h4><ul class="alg-lista">${A.mocne.map(cecha).join("") || "<li><small>jeszcze nic wyraźnego</small></li>"}</ul></div>
      <div><h4>⚠️ Słabiej u Ciebie</h4><ul class="alg-lista">${A.slabe.map(cecha).join("") || "<li><small>jeszcze nic wyraźnego</small></li>"}</ul></div>
      <div><h4>🧪 Warto przetestować${A.czasNaProbe ? ' <span class="chip obow">czas na rolkę na próbę</span>' : ""}</h4><ul class="alg-lista">${A.proba.map((p) => `<li><b>${esc(p.nazwa)}: ${esc(p.wartosc)}</b> <small>${p.dotad ? "1 rolka" : "jeszcze nie było"}</small></li>`).join("")}</ul></div></div>` : ""}
  </div>`;
  box.querySelectorAll("[data-alg-otworz]").forEach((a) => (a.onclick = (e) => { e.preventDefault(); if (a.dataset.gdzie === "archiwum") return toast("Ta rolka jest w archiwum: wpisz wyniki przez „Archiwum i wyniki” albo npm run archiwizuj -- --wyniki", 5000); otworz(a.dataset.algOtworz, 7); }));
  const sz = $("#algSzczegoly", box); if (sz) sz.onclick = () => pokazSzczegolyAlgorytmu(A);
}
function pokazSzczegolyAlgorytmu(A) {
  const wymiary = Object.entries(A.cechy);
  const m = modal(`<h2>🧠 Jak liczę Twój przepis</h2>
    <p class="podpowiedz">Każdą rolkę porównuję z <b>Twoją medianą</b> (nie z cudzymi liczbami): utrzymanie 30%, zostający po 3 s 20%, wysłania 20%, zasięg 15%, zapisy 10%, polubienia 5%. Polubienia ważą najmniej, bo Instagram stawia wyżej czas oglądania i wysłania. Składnik, który był tylko w 1-2 rolkach, ma wagę ściąganą do zera, żeby jedna wiralowa rolka nie przestawiła przepisu.</p>
    <h3>Rolki</h3><table class="alg-tabela"><tr><th>Rolka</th><th>Wynik</th>${Object.keys(A.mediany).map((k) => `<th title="Twoja mediana: ${A.mediany[k] ?? "-"}">${esc(NAZWY_WSK_KROTKO[k] || k)}</th>`).join("")}</tr>
    ${A.rolki.map((r) => `<tr><td>${esc(r.tytul)}${r.cechy?.proba === "tak" ? " 🧪" : ""}</td><td class="${(r.procent ?? 0) >= 0 ? "plus" : "minus"}"><b>${r.procent == null ? "-" : znak(r.procent)}</b></td>${Object.keys(A.mediany).map((k) => `<td>${r.porownanie?.[k] ? znak(r.porownanie[k].procent) : "-"}</td>`).join("")}</tr>`).join("")}</table>
    <h3>Składniki</h3>${wymiary.map(([k, vals]) => `<h4>${esc(Object.values(vals)[0]?.nazwa || k)}</h4><div class="chipy">${Object.entries(vals).sort((a, b) => b[1].waga - a[1].waga).map(([v, c]) => `<span class="chip ${c.waga >= 0.07 && c.n >= 2 ? "ok" : c.waga <= -0.07 && c.n >= 2 ? "obow" : ""}" title="średnio ${c.srednia}, ${c.n} rolek, pewność ${c.pewnosc}">${esc(v)}: ${znak(c.procent)} (${c.n})</span>`).join("")}</div>`).join("")}
    <div class="rzad" style="justify-content:flex-end;margin-top:14px"><button class="btn" id="algOk">Zamknij</button></div>`);
  $("#algOk", m).onclick = zamknijModal;
}
// Krok Publikacja: „Opublikowałam” (data, godzina, tryb, rolka na próbę) -> snapshot składników.
function kartaPublikacji() {
  const P = S.projekt, pub = String(P.pola["data publikacji"] || "").replace(/^todo$/i, "");
  const sk = P.skladniki || {};
  const tryb = String(P.pola["algorytm"] || "").trim() || P.scenariusz?.algorytm?.tryb || "mieszany";
  const proba = /^tak/i.test(P.pola["rolka na próbę"] || "") || !!P.scenariusz?.algorytm?.proba;
  const dni = pub ? Math.floor((Date.now() - new Date(pub.slice(0, 10) + "T12:00:00")) / 864e5) : null;
  const teraz = new Date(Date.now() - new Date().getTimezoneOffset() * 6e4).toISOString().slice(0, 16);
  return `<div class="karta"><div class="naglowek"><div><h3>🚀 Publikacja i przepis</h3><p>${pub ? `Opublikowana ${esc(pub)} (${dni} ${dni === 1 ? "dzień" : "dni"} temu). ${dni >= 7 ? "Czas wpisać wyniki z 7. dnia poniżej." : `Wyniki wpisz po 7 dniach (za ${7 - dni} ${7 - dni === 1 ? "dzień" : "dni"}).`}` : "Po wrzuceniu rolki zapisz datę i godzinę. Panel zapamięta składniki rolki i po 7 dniach przypomni o wynikach."}</p></div></div>
    <div class="rzad" style="align-items:flex-end;gap:14px">
      <label class="pole" style="margin:0"><span>Data i godzina publikacji</span><input type="datetime-local" id="pubData" value="${esc(pub ? pub.replace(" ", "T") : teraz)}"></label>
      <label class="pole" style="margin:0"><span>Tryb przepisu</span><select id="pubTryb">${TRYBY.map(([k, n, o]) => `<option value="${k}" ${k === tryb ? "selected" : ""} title="${esc(o)}">${n}</option>`).join("")}</select></label>
      <label class="rzad"><input type="checkbox" id="pubProba" ${proba ? "checked" : ""}> 🧪 Rolka na próbę</label>
      <button class="btn" id="pubOk">${pub ? "Zapisz zmiany" : "✓ Opublikowałam"}</button></div>
    ${Object.keys(sk.cechy || {}).length ? `<p class="podpowiedz" style="margin-top:10px">Składniki tej rolki: ${Object.entries(sk.cechy).map(([k, v]) => `<span class="chip">${esc(NAZWY_CECH[k] || k)}: ${esc(v)}</span>`).join(" ")}</p>` : ""}</div>`;
}
function podepnijPublikacje(root) {
  const b = $("#pubOk", root); if (!b) return;
  b.onclick = async () => {
    const d = $("#pubData", root).value; if (!d) return toast("Podaj datę i godzinę");
    try {
      await api(`/api/projekt/${encodeURIComponent(S.projekt.nazwa)}/publikacja`, { method: "POST", body: { data: d.replace("T", " "), tryb: $("#pubTryb", root).value, proba: $("#pubProba", root).checked } });
      toast("Zapisane. Przypomnę o wynikach po 7 dniach.", 3500); odswiezAlgorytm(); await odswiezProjekt();
    } catch (e) { blad(e); }
  };
}

// ---------- Wyniki z Instagrama: % pominięć, spadki z wykresu utrzymania -> co wtedy było na ekranie ----------
const POLA_WYNIKOW = [["zasieg", "Zasięg (konta)"], ["wyswietlenia", "Wyświetlenia"], ["polubienia", "Polubienia"], ["pominiecia", "% pominięć w 3 s (Insights: „wskaźnik pominięć”)"], ["sredni_czas", "Średni czas oglądania (s)"], ["wyslania", "Udostępnienia / wysłania"], ["zapisy", "Zapisania"], ["obserwujacy", "Nowi obserwujący"], ["wariant", "Wariant hooka (jeśli testowany)"]];
function coNaEkranie(t) {
  const r = rolka(), czasy = czasyUjec();
  const i = czasy.findIndex((c) => t >= c.start && t < c.koniec);
  const u = r.ujecia[i];
  const sc = r.sceny.filter((s) => t >= Number(s.start || 0) && t < Number(s.start || 0) + Number(s.czas || 0));
  const slowa = slowaWRolce().filter((w) => w.start >= t - 1.5 && w.start <= t + 0.5).map((w) => w.text).join(" ");
  const tropy = [];
  if (t <= 3) tropy.push("odpadają na hooku: mocniejszy obraz albo tekst w 1. sekundzie");
  if (u && czasy[i].czas > 3.5) tropy.push(`długie ujęcie (${r1(czasy[i].czas)} s): przytnij albo dodaj przebitkę`);
  if (sc.some((s) => s.szablon === "cena-oferta")) tropy.push("plansza z ceną: przenieś niżej albo pokaż po efekcie");
  if (sc.some((s) => /cta|obserwuj/.test(s.szablon))) tropy.push("CTA: normalne, że tu odpadają; krótsze CTA albo pętla");
  if (sc.some((s) => s.szablon === "lower-third")) tropy.push("podpis z imieniem: nie daje wartości, skróć");
  if (!tropy.length && slowa) tropy.push("sprawdź, czy w tym zdaniu nie ma lania wody");
  return { ujecie: u ? `${i + 1}. ${u.kwestia ? `kwestia ${u.kwestia}` : (u.src || "plansza").split("/").pop()}` : "-", sceny: sc.map((s) => nazwaSzablonu(s.szablon)).join(", "), slowa, tropy };
}
function mapaSpadkowHtml(txt) {
  const spadki = String(txt || "").split(/[;\s]+|,(?=\s)|,$/).filter((x) => x && x.trim()).map((x) => Number(String(x).replace(",", "."))).filter((x) => isFinite(x) && x >= 0);
  return spadki.length ? `<div class="mapa-spadkow"><h4>Co było na ekranie, gdy ludzie odpadali</h4>${spadki.map((t) => { const c = coNaEkranie(t); return `<div class="spadek"><b>${r1(t)} s</b><div><small>ujęcie: ${esc(c.ujecie)}${c.sceny ? ` · plansza: ${esc(c.sceny)}` : ""}</small>${c.slowa ? `<small>mowa: „${esc(c.slowa)}”</small>` : ""}<p>💡 ${esc(c.tropy.join(" · "))}</p></div></div>`; }).join("")}</div>` : "";
}
function wzglednyHtml(r, A) {
  if (!r || r.procent == null) return A && A.zWynikami < 2 ? `<p class="podpowiedz">Porównanie z Twoją medianą pojawi się od 2 rolek z wynikami (zasięg, średni czas, % pominięć).</p>` : "";
  return `<div class="ramka ${r.procent >= 0 ? "ok" : "ostrzezenie"}"><b>Ta rolka: ${znak(r.procent)} względem Twojej typowej rolki</b> (z ${A.zWynikami} rolek)<div class="chipy" style="margin-top:6px">${Object.entries(r.porownanie || {}).map(([k, v]) => `<span class="chip ${v.procent >= 0 ? "ok" : "obow"}" title="Ta rolka: ${v.wartosc}, Twoja mediana: ${v.mediana}">${esc(NAZWY_WSK_KROTKO[k] || k)}: ${znak(v.procent)}</span>`).join("")}</div><small>Przepis na rolki już to uwzględnił. Kliknij „✦ Claude: wyciągnij wnioski”, żeby dopisać, dlaczego tak wyszło.</small></div>`;
}
function kartaWynikow() {
  const w = S.projekt.wyniki || {};
  return `<div class="karta wyniki-karta"><div class="naglowek"><div><h3>📈 Wyniki z Instagrama</h3><p>Po 2-3 dniach przepisz z Insights rolki. Spadki to sekundy, w których wykres utrzymania wyraźnie leci w dół. Panel pokaże, co wtedy było na ekranie, a Claude dopisze wnioski, z których korzysta przy następnych scenariuszach.</p></div></div>
    <div class="wyniki-pola">${POLA_WYNIKOW.map(([k, n]) => `<label class="pole"><span>${esc(n)}</span><input type="text" data-w="${k}" value="${esc(w[k] || "")}"></label>`).join("")}
      <label class="pole" style="grid-column:1/-1"><span>Sekundy spadków z wykresu utrzymania (np. 2, 7.5, 14)</span><input type="text" data-w="spadki" value="${esc(w.spadki || "")}"></label></div>
    <div class="rzad" style="margin-bottom:10px"><label class="btn jasny maly">📷 Wgraj zrzut wykresu<input type="file" accept="image/*" hidden id="wykresPlik"></label>${S.projekt.pliki.final.some((f) => /^wykres\./.test(f.nazwa)) ? '<span class="chip ok">✓ zrzut wykresu jest (Claude go obejrzy)</span>' : ""}
      <button class="btn" id="wnioski" ${S.start?.claude ? "" : "disabled"}>✦ Claude: wyciągnij wnioski</button></div>
    <div id="wynikWzgledny">${wzglednyHtml(S.algorytm?.rolki?.find((x) => x.nazwa === S.projekt.nazwa), S.algorytm)}</div>
    <div id="mapaSpadkow">${mapaSpadkowHtml(w.spadki)}</div>
  </div>`;
}
function podepnijWyniki(root) {
  const P = S.projekt;
  const zapisz = debounce(async () => { try { await api(`/api/projekt/${encodeURIComponent(P.nazwa)}/wyniki`, { method: "PUT", body: P.wyniki }); toast("Zapisano wyniki", 1000); } catch (e) { blad(e); } }, 600);
  const pub = String(P.pola["data publikacji"] || "").match(/\d{4}-\d{2}-\d{2}/)?.[0];
  const dzien = pub ? Math.floor((Date.now() - new Date(pub + "T12:00:00")) / 864e5) : null;
  const poZapisie = debounce(async () => { const A = await odswiezAlgorytm(); const r = A?.rolki.find((x) => x.nazwa === P.nazwa); const box = $("#wynikWzgledny", root); if (box) box.innerHTML = wzglednyHtml(r, A); }, 1500);
  root.querySelectorAll("[data-w]").forEach((i) => (i.oninput = () => { P.wyniki = { ...(P.wyniki || {}), [i.dataset.w]: i.value.trim(), data: new Date().toISOString().slice(0, 10), ...(dzien != null ? { dzien, data_publikacji: pub } : {}) }; zapisz(); poZapisie(); if (i.dataset.w === "spadki") odswiezMape(); }));
  const odswiezMape = debounce(() => { const m = $("#mapaSpadkow", root); if (m) m.innerHTML = mapaSpadkowHtml(P.wyniki?.spadki); }, 400);
  const f = $("#wykresPlik", root);
  if (f) f.onchange = () => {
    const plik = f.files[0]; if (!plik) return;
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `/api/projekt/${encodeURIComponent(P.nazwa)}/wykres?nazwa=${encodeURIComponent(plik.name)}`);
    xhr.onload = () => { if (xhr.status < 300) { toast("Zrzut wykresu zapisany"); odswiezProjekt(); } else blad(new Error("Nie udało się wgrać zrzutu")); };
    xhr.send(plik);
  };
  const b = $("#wnioski", root);
  if (b) b.onclick = () => otworzAsystenta({
    tytul: "Wnioski z wyników",
    powitanie: "Porównam wyniki z montażem sekunda po sekundzie i zapiszę wnioski, z których skorzystam przy następnych rolkach.",
    prompt: `Użyj skilla rolki-beauty i zasad z CLAUDE.md.
Projekt: ${P.nazwa} (folder ${P.sciezka}). Wyniki z Instagrama: ${P.sciezka}/final/wyniki.json (pominiecia = % odpadających w 3 s, sredni_czas, wyslania, zapisy, spadki = sekundy spadków z wykresu utrzymania). Jeśli jest ${P.sciezka}/final/wykres.png albo wykres.jpg, obejrzyj go (Read) i sam odczytaj spadki i kształt wykresu.
Montaż: ${P.sciezka}/kompozycja/rolka.json (+ compositions/, napisy/kwestie.json, scenariusz.json, brief.md). Długość i czasy ujęć policz jak zloz (od-do, segmenty, tempo, przenikanie 0,3 s).
Zadanie:
1. Dla każdego spadku ustal, co było na ekranie i co mówiła ${OS().mian}. Oceń hook (pominięcia: poniżej ok. 50% dobrze, powyżej 70% hook nie zatrzymuje), średni czas oglądania względem długości, wysłania i zapisy.
2. Napisz w czacie krótko (5-8 zdań, po ludzku): co zadziałało, gdzie i dlaczego ludzie odpadali, 3 konkretne rzeczy do zmiany w następnej rolce.
3. Dopisz sekcję „## Wnioski z wyników” do ${P.sciezka}/brief.md.
4. Dopisz 2-4 krótkie, ogólne reguły do 05_ARCHIWUM/wnioski.md (utwórz plik z nagłówkiem „# Wnioski z wyników rolek”, jeśli go nie ma) w formacie „- [RRRR-MM-DD, kategoria, format] reguła (dowód: liczba)”. Bez powtarzania reguł, które już tam są: zamiast tego dopisz „potwierdzone” do istniejącej. Z tego pliku korzystasz przy nowych scenariuszach.
Jedno pytanie naraz, jeśli czegoś brakuje (ostatnia linia OPCJE: …). Na końcu linia: GOTOWE`,
  });
}

// =====================================================================
// Poproś Claude
// =====================================================================
const CHIPY = [
  ["Zaproponuj montaż z tych nagrań", "Obejrzyj nagrania w raw/ i proxy/ tej rolki. Zaproponuj listę najlepszych ujęć z czasem, hook, przejścia, reżyserię scen i CTA. Wypisz, których narzędzi użyć, a które pominąć, i uzasadnij wybór."],
  ["Napisz 3 hooki", "Napisz 3 warianty hooka tekstowego do tej rolki i wpisz je do brief.md w sekcji „Hook (3 warianty)”. Pierwszy wstaw do sceny hook-tytul w rolka.json."],
  ["Napisz opis i hashtagi", "Napisz opis pod rolkę (mówiony, krótki, bez obietnic) i 5-10 hashtagów (lokalne z config.json + branżowe). Wpisz je do brief.md."],
  ["Popraw napisy (nazwy zabiegów)", "Przeczytaj napisy/transcript.json i popraw tylko błędy rozpoznania (nazwy zabiegów, preparatów, liczby, źle usłyszane słowa). Nie zmieniaj stylu mówienia ani czasów. Wypisz, co poprawiłeś."],
  ["Obejrzyj draft i popraw błędy", "Obejrzyj ostatnią wersję z render/ (klatki co 1 s), znajdź błędy (nachodzący tekst, safe zone, literówki, puste klatki, złe czasy), popraw je w rolka.json i zrób nową wersję roboczą (npm run render)."],
];
function promptPelny() {
  const t = $("#claudeTekst").value.trim();
  const P = S.projekt;
  const kontekst = P
    ? `Projekt rolki: ${P.nazwa} (folder ${P.sciezka}).\nBieżący krok w panelu: ${KROKI[S.krok]}.\nPliki: ${P.sciezka}/brief.md, ${P.sciezka}/scenariusz.json, ${P.sciezka}/kompozycja/rolka.json, ${P.sciezka}/napisy/transcript.json.`
    : PM.id ? `Otwarty szkic rolki: ${PM.sciezka}. Tu są profil, scenariusz i reżyseria. Projekt montażu powstaje po utworzeniu rolki.`
      : "Ekran startowy panelu bez otwartej rolki.";
  return `Użyj skilla rolki-beauty (.claude/skills/rolki-beauty/SKILL.md) i zasad z CLAUDE.md.\n${kontekst}\nGdy zadanie prosi o propozycję, odpowiedz w rozmowie. Gdy prosi o wykonanie, zapisz żądane zmiany i podsumuj. Nie renderuj finalu bez wyraźnej prośby.\n\n${kontekstOpcjiAI()}\n\nZadanie: ${t || "(wpisz zadanie)"}`;
}
function odswiezClaude() { $("#claudePelny").textContent = promptPelny(); odswiezPanelAI(); }
$("#claudeBtn").onclick = () => { $("#claude").classList.remove("ukryte"); odswiezClaude(); ($("#claudeDobierz").disabled ? $("#claudeKatalog") : $("#claudeDobierz")).focus(); };
$("#claudeZamknij").onclick = () => $("#claude").classList.add("ukryte");
$("#claudeTekst").oninput = odswiezClaude;
$("#claudeChipy").innerHTML = CHIPY.map(([n], i) => `<button data-i="${i}">${esc(n)}</button>`).join("");
$("#claudeChipy").querySelectorAll("button").forEach((b) => (b.onclick = () => { $("#claudeTekst").value = CHIPY[b.dataset.i][1]; odswiezClaude(); }));
$("#claudeKopiuj").onclick = async () => {
  try {
    const prompt = promptPelny(), { tekst } = await api(urlBriefuAI());
    await navigator.clipboard.writeText(`${prompt}\n\n${tekst}`);
    toast("Prompt skopiowany. Wklej go w Claude Code.");
  } catch (e) { blad(e); }
};
$("#claudeWyslij").onclick = async () => {
  if (!$("#claudeTekst").value.trim()) return toast("Wpisz, co Claude ma zrobić");
  const log = $("#claudeLog");
  log.textContent = "";
  try {
    const z = await api("/api/claude", { method: "POST", body: { prompt: promptPelny(), projekt: S.projekt?.nazwa, pomysl: S.projekt ? null : PM.id } });
    $("#claudeWyslij").disabled = true;
    await sledz(z, "Claude pracuje", null, log);
    $("#claudeWyslij").disabled = false;
    S.napisy = null;
    if (S.projekt) await odswiezProjekt();
  } catch (e) { blad(e); $("#claudeWyslij").disabled = false; }
};

// =====================================================================
// Opcje Tak/Nie: efekty montażu (w rolka.json) i pomoce w panelu (w przeglądarce)
// =====================================================================
const efektyMontazu = () => S.start?.opcjeMontazu?.efekty || [];
const OPCJE_PANELU = [
  // [klucz, ikona, nazwa, opis]
  ["podpowiedzi", "💡", "Podpowiedzi", "Na górze każdego kroku: co tu robisz i po co."],
  ["checklista", "✅", "Czego jeszcze brakuje", "Lista rzeczy do zrobienia na każdym kroku i kropki przy krokach: zielona gotowe, pomarańczowa do zrobienia."],
  ["os", "🎞️", "Oś czasu całej rolki", "Na dole kroków montażu widać całą rolkę naraz: ujęcia, sceny, napisy, dźwięk i efekty. Kliknij element, żeby go edytować."],
  ["ramka", "📱", "Podgląd w ramce Instagrama", "Odtwarzacz wygląda jak telefon z przyciskami IG. Od razu widać, czy nic nie zasłania napisów."],
  ["autoRecenzja", "🎯", "Recenzja od pierwszego pomysłu", "Gdy Claude napisze pierwszy scenariusz, niezależna recenzentka od razu go ocenia, a słaby (poniżej 85/100) dopracowuje w pętli, zanim go zobaczysz. Ok. 1-6 min, 0,2-1,5 USD z konta Claude Code."],
];
function efekt(k) { const e = S.projekt?.rolka?.efekty || {}; const d = efektyMontazu().find((x) => x[0] === k); return e[k] ?? (d ? d[1] : false); }
function ustawEfekt(k, v) { const r = rolka(); r.efekty = { ...(r.efekty || {}), [k]: !!v }; zapiszRolke(); }
function opcjePanelu() { try { return JSON.parse(localStorage.getItem("opcjePanelu") || "{}"); } catch { return {}; } }
function opcja(k) { return opcjePanelu()[k] !== false; }
function ustawOpcje(k, v) { const o = opcjePanelu(); o[k] = !!v; try { localStorage.setItem("opcjePanelu", JSON.stringify(o)); } catch {} pokaz(); }
function takNie(k, v) { return `<div class="przelacznik tak-nie" data-tn="${k}"><button data-w="1" class="${v ? "wybrany" : ""}">Tak</button><button data-w="0" class="${v ? "" : "wybrany"}">Nie</button></div>`; }
function podepnijTakNie(root, fn) {
  if (!root) return;
  root.querySelectorAll("[data-tn]").forEach((g) => g.querySelectorAll("button").forEach((b) => (b.onclick = (e) => {
    e.preventDefault();
    g.querySelectorAll("button").forEach((x) => x.classList.toggle("wybrany", x === b));
    fn(g.dataset.tn, b.dataset.w === "1");
  })));
}
$("#opcjeBtn").onclick = () => {
  const m = modal(`<h2>Opcje panelu</h2><p class="podpowiedz" style="margin-bottom:14px">Pomoce w panelu. Każdą włączasz albo wyłączasz: Tak albo Nie. Wybór zapamiętuje ta przeglądarka.</p>
    <div class="efekty" id="opcjeLista">${OPCJE_PANELU.map(([k, ik, n, o]) => `<div class="efekt ${opcja(k) ? "wlaczony" : ""}" data-ef="${k}"><span class="efekt-ikona">${ik}</span><div class="efekt-opis"><b>${n}</b><p>${o}</p></div>${takNie(k, opcja(k))}</div>`).join("")}</div>
    ${S.projekt ? `<p class="podpowiedz">Efekty montażu (zbliżenia, emoji, dźwięki, pasek postępu) włączasz w kroku <a href="#" id="doStylu">Styl</a>.</p>` : ""}
    <div class="rzad" style="justify-content:space-between;margin-top:12px"><button class="btn jasny" id="opcjeGabinet">⚙ Ustawienia gabinetu (kreator)</button><button class="btn jasny" id="opcjeIG">📸 Instagram</button><button class="btn" id="opcjeOk">Gotowe</button></div>`);
  $("#opcjeGabinet", m).onclick = () => { zamknijModal(); otworzKreator(0); };
  $("#opcjeIG", m).onclick = () => { zamknijModal(); oknoInstagrama(); };
  podepnijTakNie($("#opcjeLista", m), (k, v) => { m.querySelector(`[data-ef="${k}"]`).classList.toggle("wlaczony", v); ustawOpcje(k, v); });
  $("#opcjeOk", m).onclick = zamknijModal;
  const ds = $("#doStylu", m); if (ds) ds.onclick = (e) => { e.preventDefault(); zamknijModal(); idz(3); };
};

// ---------- podpowiedzi i lista braków ----------
const PODPOWIEDZI = [
  null,
  ["Ustal, o czym jest rolka i kto jest w kadrze.", "Z tego panel dobiera podpowiedzi hooków, a final zablokuje się, jeśli brakuje zgody na wizerunek."],
  ["Przenieś nagrania z inboxu, kliknij „Przygotuj nagrania”, potem klikaj gotowe klipy, żeby ułożyć ujęcia. Klik w miniaturę = przycinanie.", "Krótkie ujęcia (1-3 s) trzymają uwagę. Klip, w którym mówisz, zaznacz jako „klip z mową”: głos poleci pod całą rolką."],
  ["Wybierz format (gotowy układ scen), styl napisów i efekty montażu.", "Format od razu wstawia hook i CTA. Efekty włączasz Tak/Nie i zawsze możesz je wyłączyć."],
  ["Kliknij „Zrób napisy”, potem popraw tylko źle rozpoznane słowa.", "Większość ludzi ogląda bez dźwięku. Słowa kluczowe świecą kolorem marki."],
  ["Plansze na ujęciach: hook, przed/po, cena, CTA. Kliknij pasek na osi, żeby edytować.", "Hook w pierwszych 2 s decyduje, czy ktoś zostanie na rolce."],
  ["Najpierw „Wersja robocza” (szybka) do obejrzenia, na końcu „Final”.", "Final sprawdza zgodę i safe zone, więc nic nie wyjdzie z błędem."],
  ["Opis, hashtagi, kontrola pliku i lista do odhaczenia.", "Kontrola sprawdza format, głośność i długość pod Instagram."],
];
function dlugoscRolki() {
  const r = rolka(), czasy = czasyUjec();
  let T = czasy.at(-1)?.koniec || 0;
  for (const s of r.sceny) T = Math.max(T, Number(s.start || 0) + Number(s.czas || 0));
  if (r.voiceover?.src) T = Math.max(T, Number(r.voiceover.start || 0) + (metaPliku(r.voiceover.src)?.czas || 0));
  return T;
}
function braki(k) {
  const P = S.projekt;
  if (!P || !k) return [];
  const r = rolka(), p = P.pola;
  const w = (x) => String(p[x] || "").trim();
  const jest = (x) => w(x) && !/^todo/i.test(w(x));
  const czysc = (s) => (s || "").replace(/^TODO\s*$/im, "").trim();
  const czasy = czasyUjec();
  const L = [];
  const dodaj = (ok, tekst) => L.push({ ok: !!ok, tekst });
  if (k === 1) {
    dodaj(jest("kategoria"), "Wybrana kategoria");
    dodaj(jest("tytuł roboczy"), "Wpisany temat");
    dodaj(jest("cel"), "Wybrany cel rolki");
    const twarz = /^tak/i.test(w("twarz klientki w kadrze"));
    if (!jest("twarz klientki w kadrze")) dodaj(false, "Zaznaczone, czy w kadrze jest twarz klientki");
    else dodaj(!twarz || /^tak/i.test(w("zgoda na wizerunek")), twarz ? "Zgoda na wizerunek klientki" : "Twarz klientki: brak w kadrze");
  } else if (k === 2) {
    const ob = (P.scenariusz?.materialy || []).filter((x) => x.obowiazkowy !== false);
    if (ob.length) { const brak = ob.filter((x) => !plikiMaterialu(x).length); dodaj(!brak.length, brak.length ? `Brakuje materiałów ze scenariusza: ${brak.map((x) => x.id).join(", ")}` : "Wszystkie materiały ze scenariusza"); }
    const wk = wierszeKwestii();
    if (wk.length) { const nie = wk.filter((x) => !x.d?.wybrane); dodaj(!nie.length, nie.length ? `Kwestie bez nagrania: ${nie.map((x) => `${x.m.id}.${x.nr + 1}`).join(", ")}` : "Wszystkie kwestie znalezione w nagraniach"); }
    dodaj(P.pliki.raw.length, "Nagrania są w rolce");
    const zle = Object.entries(P.obraz || {}).filter(([, o]) => o.uwagi?.length);
    if (Object.keys(P.obraz || {}).length) dodaj(!zle.length, zle.length ? `Obraz do poprawy: ${zle.map(([f, o]) => `${f.split("/").pop()} (${o.uwagi[0]})`).join(", ")}` : "Obraz nagrań OK (jasność, przepalenia, odcień)");
    dodaj(P.pliki.proxy.some((f) => f.typ === "wideo"), "Nagrania przygotowane");
    dodaj(r.ujecia.length, "Ułożone ujęcia");
    const dlugie = czasy.filter((c) => c.czas > 5).length;
    dodaj(!dlugie, dlugie ? `${dlugie} ujęć dłuższych niż 5 s (lepiej 1-3 s)` : "Ujęcia krótkie i dynamiczne");
    const T = dlugoscRolki();
    dodaj(T >= 7 && T <= 60, `Długość rolki: ${r1(T)} s (najlepiej 7-60 s)`);
  } else if (k === 3) {
    dodaj(r.format, "Wybrany format rolki");
    dodaj(r.napisy?.styl, "Wybrany styl napisów");
  } else if (k === 4) {
    if (r.napisy?.wlacz === false) dodaj(true, "Napisy wyłączone (świadomie)");
    else {
      dodaj(P.pliki.napisy.some((f) => f.nazwa === "transcript.json"), "Zrobiona transkrypcja");
      dodaj((r.napisy?.wyroznij || []).length, "Słowa kluczowe do wyróżnienia");
    }
  } else if (k === 5) {
    const hook = r.sceny.find((s) => s.szablon === "hook-tytul" || s.szablon === "tekst-za-postacia");
    dodaj(hook && Number(hook.start) < 0.5, "Hook na samym początku");
    dodaj(!hook || Number(hook.czas) <= 3, "Hook krótki (do 3 s)");
    dodaj(r.sceny.some((s) => s.szablon === "cta-koncowe" || s.szablon === "ig-obserwuj"), "CTA na końcu (zapisz, obserwuj, umów się)");
    dodaj(!r.debug_safe_zone, "Podgląd safe zone wyłączony");
  } else if (k === 6) {
    const wr = wynikRetencji().wynik;
    dodaj(wr >= 70, `Wynik retencji: ${wr}/100 (cel: 70+)`);
    dodaj(P.pliki.render.some((f) => f.typ === "wideo"), "Zrobiona wersja robocza");
    const b = blokadaFinalu();
    dodaj(!b, b || "Nic nie blokuje finalu");
    dodaj(P.pliki.final.some((f) => f.typ === "wideo"), "Zrobiony final");
    dodaj(P.pliki.final.some((f) => f.nazwa === "okladka.jpg"), "Zrobiona okładka");
  } else if (k === 7) {
    dodaj(czysc(P.sekcje["Opis pod rolkę"]), "Opis pod rolkę");
    dodaj(czysc(P.sekcje["Hashtagi"]), "Hashtagi");
    dodaj(/gotowa|opublikowana/i.test(w("status")), "Kontrola pliku zaliczona");
  }
  return L;
}
function pomoce() {
  const box = $("#pomoc");
  if (!box || !S.projekt || !S.krok) { if (box) box.innerHTML = ""; rysujOs(); return; }
  const pod = opcja("podpowiedzi") ? PODPOWIEDZI[S.krok] : null;
  const lista = opcja("checklista") ? braki(S.krok) : [];
  const zostalo = lista.filter((x) => !x.ok).length;
  box.innerHTML = pod || lista.length ? `<div class="pomoc ${pod && lista.length ? "dwie" : ""}">
    ${pod ? `<div class="pomoc-karta podp"><span class="pomoc-ikona">💡</span><div><b>Co tu robisz:</b> ${esc(pod[0])}<br><span class="po-co"><b>Po co:</b> ${esc(pod[1])}</span></div><button class="pomoc-x" id="ukryjPodp" title="Wyłącz podpowiedzi (wrócisz przez ⚙ Opcje)">✕</button></div>` : ""}
    ${lista.length ? `<div class="pomoc-karta lista"><b>${zostalo ? `Do zrobienia: ${zostalo}` : "Ten krok jest gotowy ✓"}</b><ul>${lista.map((x) => `<li class="${x.ok ? "ok" : "nie"}">${x.ok ? "✓" : "○"} ${esc(x.tekst)}</li>`).join("")}</ul>${zostalo ? `<button class="btn maly dokoncz" data-asystent>✦ Dokończ z Claude</button><small class="podpowiedz" style="display:block">Claude zada kilka pytań i sam uzupełni braki.</small>` : ""}</div>` : ""}
  </div>` : "";
  const x = $("#ukryjPodp"); if (x) x.onclick = () => ustawOpcje("podpowiedzi", false);
  box.querySelectorAll("[data-asystent]").forEach((b) => (b.onclick = () => otworzAsystenta()));
  rysujOs();
}
const odswiezPomoce = debounce(() => { if (!S.projekt) return; pokazKroki(); const y = window.scrollY; pomoce(); window.scrollTo(0, y); }, 300);

// ---------- Wynik retencji: czy rolka trzyma do końca ----------
// Martwe miejsca: odcinki dłuższe niż 3 s, w których na ekranie nic się nie zmienia (cięcie, plansza, zbliżenie).
function martweMiejsca() {
  const r = rolka(), czasy = czasyUjec(), T = dlugoscRolki();
  if (T < 4) return [];
  const zm = [0, T, ...czasy.map((c) => c.start), ...r.sceny.map((s) => Number(s.start || 0)), ...r.sceny.map((s) => Number(s.start || 0) + Number(s.czas || 0))];
  if (efekt("zajawka")) zm.push(0.8);
  if (efekt("punch_in")) {
    const mowa = r.napisy?.zrodlo || r.voiceover?.src;
    const klucze = (r.napisy?.wyroznij || []).map((s) => s.toLowerCase().slice(0, 4));
    let ost = -9;
    for (const w of slowaWRolce()) { const t = w.text.toLowerCase(); if ((/\d/.test(t) || klucze.some((k) => k && t.startsWith(k))) && w.start - ost >= 1.2) { zm.push(w.start); ost = w.start; } }
    r.ujecia.forEach((u, i) => { if (u.src && u.src === mowa && i % 2) zm.push(czasy[i].start); });
  }
  const s = [...new Set(zm.map(r1))].sort((a, b) => a - b);
  const out = [];
  for (let i = 1; i < s.length; i++) if (s[i] - s[i - 1] > 3) out.push({ a: s[i - 1], b: s[i] });
  return out;
}
function wynikRetencji() {
  const r = rolka(), czasy = czasyUjec(), T = dlugoscRolki();
  const hook = r.sceny.find((s) => s.szablon === "hook-tytul" || s.szablon === "tekst-za-postacia");
  const wideo = czasy.filter((_, i) => r.ujecia[i]?.src);
  const sr = wideo.length ? wideo.reduce((a, c) => a + c.czas, 0) / wideo.length : 0;
  const martwe = martweMiejsca();
  const bezNapisow = r.napisy?.wlacz === false;
  const maMuzyke = !!r.muzyka?.src;
  const koniecUjec = czasy.at(-1)?.koniec || T;
  const domHook = () => (S.projekt.pola["tytuł roboczy"] || "").replace(/^todo$/i, "") || "Zobacz *to*";
  // Dane do testów jakości: mowa (z napisów), wezwania, czas czytania scen
  const slowa = slowaWRolce();
  const ogon = slowa.length ? Math.max(0, T - slowa.at(-1).end) : null;
  const ctaSceny = r.sceny.filter((s) => ["cta-koncowe", "ig-obserwuj"].includes(s.szablon)).sort((a, b) => a.start - b.start);
  const wezwania = r.sceny.filter((s) => ["cta-koncowe", "ig-obserwuj"].includes(s.szablon) || (s.szablon === "cena-oferta" && Number(s.start) >= T * 0.55)).sort((a, b) => a.start - b.start);
  const kolizjaHooka = !!hook && !bezNapisow && slowa.some((w) => w.start >= Number(r.napisy?.od || 0) - 0.05 && w.start < Number(hook.start) + Number(hook.czas) - 0.3);
  const ileSlow = (s) => String(Object.values(s.dane || {}).filter((v) => typeof v === "string").join(" ")).split(/[\s|]+/).filter((x) => x.replace(/[*]/g, "").length > 1).length;
  const krotkieSceny = r.sceny.filter((s) => !["kino", "ozdobniki", "watermark", "safe-zone-debug", "przejscie-flash", "przejscie-swiatlo", "napisy", "glebia-tla", "animacja-lottie"].includes(s.szablon) && s.szablon !== "hook-tytul")
    .map((s) => ({ s, min: Math.max(1.5, Math.min(3.5, 0.6 + 0.3 * ileSlow(s))) })).filter((x) => Number(x.s.czas) < x.min - 0.05);
  const przedPo = r.sceny.find((s) => s.szablon === "przed-po");
  const T_ = [
    { w: 15, ok: hook && Number(hook.start) < 0.5, tekst: "Hook od pierwszej klatki", zle: hook ? `Hook zaczyna się w ${r1(hook.start)} s, a ma od 0 s` : "Brak hooka (tekstu na start)", fix: () => { if (hook) hook.start = 0; else r.sceny.unshift({ szablon: "hook-tytul", start: 0, czas: 2, dane: { tekst: domHook(), wariant: S.wariantHooka || "slowa" } }); }, fixTxt: hook ? "Przesuń na 0 s" : "Dodaj hook" },
    { w: 5, ok: !hook || Number(hook.czas) <= 2.5, tekst: "Hook krótki (do 2,5 s)", zle: `Hook trwa ${r1(hook?.czas)} s`, fix: () => { hook.czas = 2; }, fixTxt: "Skróć do 2 s" },
    { w: 10, ok: efekt("zajawka") || r.format === 6, tekst: "Zajawka efektu na start", zle: "Widz nie wie, na co czeka", fix: () => ustawEfektCicho("zajawka"), fixTxt: "Włącz" },
    { w: 8, ok: !wideo.length || wideo[0].czas <= 2.5, tekst: "Pierwsze ujęcie krótkie (do 2,5 s)", zle: `Pierwsze ujęcie trwa ${r1(wideo[0]?.czas)} s`, idz: 2, fixTxt: "Przytnij" },
    { w: 8, ok: !wideo.length || sr <= 3, tekst: "Szybkie tempo (średnio do 3 s na ujęcie)", zle: `Średnio ${r1(sr)} s na ujęcie`, idz: 2, fixTxt: "Do ujęć" },
    { w: 15, ok: !martwe.length || efekt("bodziec"), tekst: "Bez martwych miejsc", zle: `${martwe.length} ${martwe.length === 1 ? "miejsce" : "miejsca"} bez zmiany dłużej niż 3 s (${martwe.map((m) => `${r1(m.a)}-${r1(m.b)} s`).join(", ")})`, fix: () => ustawEfektCicho("bodziec"), fixTxt: "Włącz bodziec co 3 s" },
    { w: 12, ok: bezNapisow ? r.format === 6 : S.projekt.pliki.napisy.some((f) => f.nazwa === "transcript.json"), tekst: "Napisy (większość ogląda bez dźwięku)", zle: bezNapisow ? "Napisy wyłączone" : "Brak transkrypcji", idz: 4, fixTxt: "Zrób napisy" },
    { w: 4, ok: bezNapisow || (r.napisy?.wyroznij || []).length, tekst: "Słowa kluczowe w kolorze", zle: "Nic nie jest wyróżnione", idz: 4, fixTxt: "Wybierz słowa" },
    { w: 8, ok: T >= 7 && T <= 35, tekst: "Długość 7-35 s", zle: `Rolka ma ${r1(T)} s`, idz: 2, fixTxt: "Do ujęć" },
    { w: 7, ok: ctaSceny.some((s) => Number(s.start) >= T * 0.55), tekst: "CTA na końcu", zle: ctaSceny.length ? `Wezwanie jest w ${r1(ctaSceny[0].start)} s, za wcześnie (ma być w ostatniej części rolki)` : "Brak wezwania (zapisz, obserwuj)", fix: ctaSceny.length ? undefined : () => r.sceny.push({ szablon: "cta-koncowe", start: r1(koniecUjec), czas: 2.5, dane: { tekst: "Zapisz rolkę, *przyda się*" } }), idz: 5, fixTxt: ctaSceny.length ? "Do scen" : "Dodaj CTA" },
    // Testy jakości (to, co wychwytuje Claude-reżyser): poprawka przez znacznik dla „✦ Claude: popraw znaczniki”
    { w: 15, ok: ogon == null || ogon <= 2.5, tekst: "Koniec razem z mową (bez długiej ciszy)", zle: `Po ostatnim słowie (${r1(T - (ogon || 0))} s) jest jeszcze ${r1(ogon)} s samych plansz bez głosu: tu widz odpada, a pętla wraca za późno`, fix: () => znacznikDoPoprawki(T - ogon, `Po ostatnim słowie jest ${r1(ogon)} s bez głosu. Zakończ rolkę razem z mową.`, "CTA wstaw na ostatnie zdanie (gdy " + OS().mian + " mówi wezwanie), skróć albo usuń plansze po mowie, rolka ma się kończyć najwyżej 1-2 s po ostatnim słowie."), fixTxt: "Znacznik dla Claude" },
    { w: 10, ok: wezwania.length <= 1, tekst: "Jedno wezwanie do działania", zle: `${wezwania.length} wezwania naraz (${wezwania.map((s) => `${nazwaSzablonu(s.szablon)} ${r1(s.start)} s`).join(", ")}): żadne nie działa`, fix: () => znacznikDoPoprawki(Number(wezwania[0].start), `Za dużo wezwań naraz: ${wezwania.map((s) => nazwaSzablonu(s.szablon)).join(", ")}.`, "Zostaw jedno wezwanie zgodne z tym, co mówi " + OS().mian + ". Resztę usuń (cenę i link mogą iść do opisu pod rolką)."), fixTxt: "Znacznik dla Claude" },
    { w: 6, ok: !kolizjaHooka, tekst: "Na starcie jeden tekst naraz", zle: "Pod hookiem od razu lecą napisy z mową: dwa teksty walczą o uwagę w pierwszych sekundach", fix: () => znacznikDoPoprawki(0.3, "Na starcie hook i napisy z mową są na ekranie naraz.", "Skróć hook do chwili, gdy zaczyna się mowa, albo pokaż napisy dopiero po hooku (ewentualnie hook = pierwsze zdanie mowy)."), fixTxt: "Znacznik dla Claude" },
    { w: 8, ok: !krotkieSceny.length, tekst: "Teksty na ekranie dość długo, żeby je przeczytać", zle: `Za krótko: ${krotkieSceny.map((x) => `${nazwaSzablonu(x.s.szablon)} ${r1(x.s.czas)} s (min. ${r1(x.min)} s)`).join(", ")}`, fix: () => { for (const x of krotkieSceny) x.s.czas = r1(x.min); }, fixTxt: "Wydłuż" },
    { w: 5, ok: !przedPo || Number(przedPo.czas) >= 3, tekst: "Przed/po wystarczająco długo (min. 3 s)", zle: `Przed/po trwa ${r1(przedPo?.czas)} s: efekt mignie i nikt go nie zobaczy`, fix: () => { przedPo.czas = 3.2; }, fixTxt: "Wydłuż do 3,2 s" },
    { w: 5, ok: efekt("dzwieki") || r.format === 6 || r.format === 8, tekst: "Udźwiękowienie", zle: "Cięcia i plansze bez dźwięku", fix: () => ustawEfektCicho("dzwieki"), fixTxt: "Włącz" },
    { w: 3, ok: efekt("zapetlenie") || efekt("pasek_postepu"), tekst: "Pętla albo pasek postępu", zle: "Koniec nie zachęca do drugiego obejrzenia", fix: () => ustawEfektCicho("zapetlenie"), fixTxt: "Włącz pętlę" },
  ];
  // Twój przepis: składniki tej rolki, które u Ciebie wypadają słabo (waga rośnie z liczbą rolek z wynikami).
  const A = S.algorytm, sk = S.projekt.skladniki?.cechy || {};
  const trybR = String(S.projekt.pola["algorytm"] || "").trim() || S.projekt.scenariusz?.algorytm?.tryb || "mieszany";
  const probaR = /^tak/i.test(S.projekt.pola["rolka na próbę"] || "") || !!S.projekt.scenariusz?.algorytm?.proba;
  if (A && A.zWynikami >= 3 && trybR !== "zwykly") {
    const slabeTu = A.slabe.filter((c) => sk[c.wymiar] === c.wartosc);
    const w = Math.max(3, Math.round(15 * (trybR === "moj" ? 1 : A.alfa)));
    T_.push({ w, ok: probaR || !slabeTu.length, tekst: probaR ? "Twój przepis (rolka na próbę: testujesz coś nowego)" : "Zgodna z Twoim przepisem", zle: `Słabo u Ciebie: ${slabeTu.map((c) => `${c.nazwa} ${c.wartosc} (${znak(c.procent)})`).join(", ")}`, idz: 3, fixTxt: "Zmień w Styl" });
  }
  // Kontrola nagranego hooka liczy się tylko, gdy była zrobiona (kompozycja/hook.json); błąd pierwszego słowa ma "Napraw".
  const KH = S.projekt.kontrolaHooka;
  if (KH?.wynik != null) { const ps = KH.testy.find((t) => t.id === "pierwsze_slowo"); T_.push({ w: 10, ok: KH.wynik >= 80 && ps?.poziom !== "blad", tekst: "Nagrany hook sprawdzony (80+)", zle: `Kontrola nagranego hooka: ${KH.wynik}/100${ps && ps.poziom !== "ok" ? `, ${ps.tekst}` : ""}`, ...(KH.naprawa ? { fix: () => uruchom("kontrola-hooka", [S.projekt.nazwa, "--napraw"], { opis: "Przycinanie ciszy na starcie rolki", po: odswiezProjekt }), fixTxt: "Przytnij ciszę", bezZapisu: true } : { idz: 6, fixTxt: "Do kontroli" }) }); }
  // Kontrola obrazu po renderze liczy się, gdy była zrobiona: zero krytycznych (twarz, czarna klatka) i maks. 1 ważny.
  const KO = S.projekt.kontrolaObrazu;
  if (KO) { const kr = KO.problemy.filter((p) => p.waga === "krytyczne"), wa = KO.problemy.filter((p) => p.waga === "wazne"); T_.push({ w: 10, ok: !kr.length && wa.length <= 1, tekst: "Obraz sprawdzony: twarz, strefy Instagrama, kontrast", zle: `Kontrola obrazu: ${[...kr, ...wa].slice(0, 2).map((p) => p.opis).join("; ")}`, idz: 5, fixTxt: "Popraw z Claude" }); }
  if (maMuzyke) T_.push({ w: 3, ok: efekt("wycisz_muzyke") || bezNapisow, tekst: "Muzyka nie zagłusza głosu", zle: "Muzyka gra tak samo głośno pod mową", fix: () => ustawEfektCicho("wycisz_muzyke"), fixTxt: "Włącz" });
  const suma = T_.reduce((a, t) => a + t.w, 0);
  const wynik = Math.round((T_.filter((t) => t.ok).reduce((a, t) => a + t.w, 0) / suma) * 100);
  return { wynik, testy: T_, martwe };
}
function ustawEfektCicho(k) { const r = rolka(); r.efekty = { ...(r.efekty || {}), [k]: true }; }
// Znacznik od panelu (z wyniku retencji): od razu do poprawki przez „✦ Claude: popraw znaczniki”, bez duplikatów.
function znacznikDoPoprawki(t, tekst, propozycja) {
  const r = rolka(); r.znaczniki ||= [];
  if (r.znaczniki.some((z) => z.stan !== "zrobione" && z.tekst === tekst)) return;
  r.znaczniki.push({ id: "p" + Date.now().toString(36) + r.znaczniki.length, t: r1(Math.max(0, t)), tekst, propozycja, autor: "panel", stan: "do zrobienia" });
  r.znaczniki.sort((a, b) => a.t - b.t);
}
function ocenaSlowna(w) { return w >= 85 ? ["Petarda 🔥", "super"] : w >= 70 ? ["Dobrze, da się dopieścić", "dobrze"] : w >= 50 ? ["Da się lepiej", "srednio"] : ["Ucieknie po 2 sekundach", "slabo"]; }
function kartaRetencji() {
  const { wynik, testy } = wynikRetencji();
  const [slowo, kl] = ocenaSlowna(wynik);
  const zle = testy.filter((t) => !t.ok);
  const auto = zle.filter((t) => t.fix && !t.bezZapisu);
  return `<div class="karta retencja ${kl}">
    <div class="retencja-gora">
      <div class="retencja-kolo" style="--p:${wynik}"><b>${wynik}</b><small>/100</small></div>
      <div style="flex:1"><h3>Wynik retencji: ${slowo}</h3><p class="podpowiedz">Czy rolka trzyma do końca: hook, tempo, martwe miejsca, napisy, dźwięk i CTA. ${zle.length ? `Do poprawy: ${zle.length}.` : "Wszystko gra."}</p></div>
      ${auto.length > 1 ? `<button class="btn" id="naprawWszystko">✦ Napraw wszystko (${auto.length})</button>` : ""}
    </div>
    <ul class="retencja-lista">${testy.map((t, i) => `<li class="${t.ok ? "ok" : "nie"}"><span>${t.ok ? "✓" : "○"}</span><div><b>${esc(t.tekst)}</b>${t.ok ? "" : `<br><small>${esc(t.zle)}</small>`}</div>${t.ok ? "" : `<button class="btn maly ${t.fix ? "" : "jasny"}" data-napraw="${i}">${esc(t.fixTxt)}</button>`}</li>`).join("")}</ul>
  </div>`;
}
function podepnijRetencje(root) {
  const { testy } = wynikRetencji();
  const po = (ile) => { zapiszRolke(); zamknijModal(); pokaz(); toast(ile > 1 ? `Poprawiono ${ile} rzeczy. Zmiany wejdą przy następnym renderze.` : "Poprawione. Zmiana wejdzie przy następnym renderze."); };
  root.querySelectorAll("[data-napraw]").forEach((b) => (b.onclick = () => {
    const t = testy[Number(b.dataset.napraw)];
    if (t.fix && t.bezZapisu) { zamknijModal(); t.fix(); return; } // skrypt sam zmienia rolka.json: bez zapisu z pamięci panelu
    if (t.fix) { t.fix(); po(1); if (t.fixTxt === "Znacznik dla Claude") toast("Dodano znacznik. W kroku Sceny kliknij „✦ Claude: popraw znaczniki”.", 4000); } else { zamknijModal(); idz(t.idz); }
  }));
  const w = $("#naprawWszystko", root);
  if (w) w.onclick = () => { const f = testy.filter((t) => !t.ok && t.fix && !t.bezZapisu); f.forEach((t) => t.fix()); po(f.length); };
}
// Słowa z napisów do testów mowy (koniec mowy, hook vs napisy). Wczytuje raz, potem woła po().
function zapewnijSlowa(po) {
  const r = rolka(), P = S.projekt;
  const zrN = Object.entries(r.napisy?.zrodla || {});
  if (r.napisy?.wlacz === false) return;
  if (zrN.length && S.napisyZ == null) {
    Promise.all(zrN.map(([src, j]) => api(`/api/projekt/${encodeURIComponent(P.nazwa)}/napisy?plik=${encodeURIComponent(j.replace(/^napisy\//, ""))}`).then((sl) => [src, sl]).catch(() => [src, []])))
      .then((pary) => { if (S.napisyZ == null) S.napisyZ = Object.fromEntries(pary); po(); });
  } else if (!zrN.length && S.napisy == null && P.pliki.napisy.some((f) => f.nazwa === "transcript.json")) {
    api(`/api/projekt/${encodeURIComponent(P.nazwa)}/napisy`).then((n) => { if (S.napisy == null) S.napisy = n; po(); }).catch(() => {});
  }
}
function odswiezKarteRetencji(root) {
  const k = $(".karta.retencja", root);
  if (!k) return;
  const tmp = document.createElement("div"); tmp.innerHTML = kartaRetencji();
  k.replaceWith(tmp.firstElementChild);
  podepnijRetencje(root);
}
function pokazRetencje() { zapewnijSlowa(() => { if (!$("#modal").classList.contains("ukryte")) odswiezKarteRetencji($("#modalOkno")); }); const m = modal(`${kartaRetencji()}<div class="rzad" style="justify-content:flex-end;margin-top:12px"><button class="btn jasny" id="retOk">Zamknij</button></div>`); podepnijRetencje(m); $("#retOk", m).onclick = zamknijModal; }

// ---------- oś czasu całej rolki ----------
function slowaWRolce() {
  const r = rolka(), np = r.napisy || {};
  if (np.wlacz !== false && np.zrodla && Object.keys(np.zrodla).length) {
    if (!S.napisyZ) return [];
    const czasy = czasyUjec(), out = [];
    r.ujecia.forEach((u, i) => { const sl = S.napisyZ[u.src]; if (!sl) return; const od = Number(u.od || 0), c = czasy[i]; for (const w of sl) if (w.start >= od - 0.02 && w.start < od + c.czas - 0.05) out.push({ text: w.text, start: c.start + (w.start - od), end: Math.min(c.koniec, c.start + (w.end - od)) }); });
    return out.sort((a, b) => a.start - b.start);
  }
  if (np.wlacz === false || !Array.isArray(S.napisy) || !S.napisy.length) return [];
  const vo = r.voiceover, zr = np.zrodlo, czasy = czasyUjec();
  let f;
  if (vo?.src && (!zr || vo.src === zr)) f = (x) => Number(vo.start || 0) + x;
  else if (zr && r.ujecia.some((u) => u.src === zr)) f = (x) => { for (let i = 0; i < r.ujecia.length; i++) { const u = r.ujecia[i]; if (u.src !== zr) continue; const od = Number(u.od || 0); if (x >= od - 0.02 && x < od + czasy[i].czas) return czasy[i].start + (x - od); } return null; };
  else if (vo?.src) f = (x) => Number(vo.start || 0) + x;
  else f = (x) => x;
  return S.napisy.map((w) => { const s = f(w.start); return s == null ? null : { text: w.text, start: s, end: s + (w.end - w.start) }; }).filter(Boolean);
}
function grupySlow(slowa) {
  const g = []; let cur = [];
  slowa.forEach((w, i) => { const n = slowa[i + 1]; cur.push(w); if (!n || /[.!?…,:;]$/.test(w.text) || n.start - w.end >= 0.15 || cur.length >= 4) { g.push(cur); cur = []; } });
  return g.map((c) => ({ start: c[0].start, end: c.at(-1).end, text: c.map((w) => w.text).join(" ") }));
}
function rysujOs() {
  const box = $("#osDol");
  if (!box) return;
  if (!S.projekt || !opcja("os") || ![2, 3, 4, 6].includes(S.krok)) { box.innerHTML = ""; return; }
  const r = rolka(), P = S.projekt;
  const zrN = Object.entries(r.napisy?.zrodla || {});
  if (zrN.length && S.napisyZ == null && !rysujOs.ladujeZ) {
    rysujOs.ladujeZ = true;
    Promise.all(zrN.map(([src, j]) => api(`/api/projekt/${encodeURIComponent(P.nazwa)}/napisy?plik=${encodeURIComponent(j.replace(/^napisy\//, ""))}`).then((sl) => [src, sl]).catch(() => [src, []])))
      .then((pary) => { S.napisyZ = Object.fromEntries(pary); }).finally(() => { rysujOs.ladujeZ = false; rysujOs(); });
  }
  if (!zrN.length && S.napisy == null && r.napisy?.wlacz !== false && P.pliki.napisy.some((f) => f.nazwa === "transcript.json") && !rysujOs.laduje) {
    rysujOs.laduje = true;
    api(`/api/projekt/${encodeURIComponent(P.nazwa)}/napisy`).then((n) => { S.napisy = n; }).catch(() => { S.napisy = []; }).finally(() => { rysujOs.laduje = false; rysujOs(); });
  }
  const czasy = czasyUjec();
  const T = Math.max(dlugoscRolki(), 3);
  const pct = (x) => Math.max(0, Math.min(100, (x / T) * 100));
  const blok = (a, b, cls, txt, attr = "", tytul = txt) => `<div class="blok ${cls}" style="left:${pct(a)}%;width:${Math.max(0.6, pct(b) - pct(a))}%" title="${esc(tytul)}" ${attr}>${esc(txt)}</div>`;
  const grupy = grupySlow(slowaWRolce());
  const mowa = r.napisy?.zrodlo || r.voiceover?.src;
  const zn = [];
  if (efekt("dzwieki")) {
    czasy.forEach((c, i) => { if (i < czasy.length - 1 && (r.ujecia[i].przejscie_po || "ciecie") !== "ciecie") zn.push([czasy[i + 1].start, "🔊", "whoosh przy przejściu"]); });
    r.sceny.forEach((s) => zn.push([Number(s.start || 0), "•", "pop przy wejściu planszy"]));
  }
  if (efekt("punch_in")) r.ujecia.forEach((u, i) => { if (u.src && u.src === mowa) zn.push([czasy[i].start + czasy[i].czas / 2, "🔍", "zbliżenia na akcentach"]); });
  if (efekt("zapetlenie")) zn.push([T - 0.2, "🔁", "zapętlenie do pierwszego ujęcia"]);
  if (efekt("zajawka")) zn.push([0.4, "👀", "zajawka efektu (0-0,8 s)"]);
  if (efekt("wycisz_muzyke") && r.muzyka?.src) zn.push([T * 0.5, "🎚️", "muzyka cichnie pod głosem"]);
  const martwe = martweMiejsca();
  if (efekt("bodziec")) martwe.forEach((m) => { for (let t = m.a + 2.4; t < m.b - 0.6; t += 2.4) zn.push([t, "⚡", "bodziec: kadr przeskakuje"]); });
  const maEfekty = zn.length || efekt("pasek_postepu");
  const { wynik } = wynikRetencji();
  const vo = r.voiceover?.src ? { a: Number(r.voiceover.start || 0), b: Number(r.voiceover.start || 0) + (metaPliku(r.voiceover.src)?.czas || 0) } : null;
  const co = T > 40 ? 5 : T > 15 ? 2 : 1;
  const tory = [], ulozenie = [];
  r.sceny.map((s, i) => i).sort((x, y) => r.sceny[x].start - r.sceny[y].start).forEach((i) => {
    const a = Number(r.sceny[i].start || 0), b = a + Number(r.sceny[i].czas || 0);
    let t = tory.findIndex((k) => k <= a + 0.01);
    if (t < 0) { t = tory.length; tory.push(0); }
    tory[t] = b; ulozenie[i] = t;
  });
  box.innerHTML = `<div class="karta os-karta">
    <div class="naglowek" style="margin-bottom:8px"><div><h3>Cała rolka na osi czasu</h3><p>${r1(T)} s · kliknij element, żeby go edytować</p></div><button class="retencja-chip ${ocenaSlowna(wynik)[1]}" id="osRetencja" title="Wynik retencji: kliknij, żeby zobaczyć, co poprawić">🔥 ${wynik}/100</button></div>
    <div class="os os-cala">
      <div class="os-skala">${Array.from({ length: Math.floor(T) + 1 }, (_, s) => (s % co === 0 ? `<span style="left:${pct(s)}%">${s} s</span>` : "")).join("")}</div>
      <div class="tor"><span class="tor-etykieta">🎬 ujęcia</span>${czasy.map((c, i) => blok(c.start, c.koniec, "uj klik", `${i + 1}${r.ujecia[i].src && r.ujecia[i].src === mowa ? " 🎙" : ""}`, `data-os-uj="${i}"`, r.ujecia[i].src || "plansza")).join("") || '<span class="os-pusto">brak ujęć</span>'}</div>
      ${(tory.length ? tory : [0]).map((_, t) => `<div class="tor">${t === 0 ? '<span class="tor-etykieta">🪧 sceny</span>' : ""}${r.sceny.map((s, i) => (ulozenie[i] === t ? blok(Number(s.start || 0), Number(s.start || 0) + Number(s.czas || 0), "sc", nazwaSzablonu(s.szablon), `data-os-sc="${i}"`) : "")).join("")}${!r.sceny.length ? '<span class="os-pusto">brak scen</span>' : ""}</div>`).join("")}
      <div class="tor"><span class="tor-etykieta">💬 napisy</span>${r.napisy?.wlacz === false ? '<span class="os-pusto">wyłączone</span>' : grupy.map((g) => blok(g.start, g.end, "np", g.text, 'data-os-np="1"')).join("") || '<span class="os-pusto">jeszcze nie ma</span>'}</div>
      <div class="tor"><span class="tor-etykieta">🎵 dźwięk</span>${vo ? blok(vo.a, vo.b, "au", "głos") : ""}${r.muzyka?.src ? blok(0, T, "mu", "muzyka") : ""}${!vo && !r.muzyka?.src ? '<span class="os-pusto">dźwięk z ujęć</span>' : ""}</div>
      ${martwe.length && !efekt("bodziec") ? `<div class="tor"><span class="tor-etykieta">⚠ uwaga</span>${martwe.map((m) => blok(m.a, m.b, "martwe", "nic się nie dzieje", 'data-os-martwe="1"', `${r1(m.a)}-${r1(m.b)} s: ponad 3 s bez zmiany. Kliknij, żeby zobaczyć, jak poprawić.`)).join("")}</div>` : ""}
      ${maEfekty ? `<div class="tor"><span class="tor-etykieta">✨ efekty</span>${efekt("pasek_postepu") ? blok(0, T, "pp", "pasek postępu", 'data-os-ef="1"') : ""}${zn.map(([t, ik, opis]) => `<span class="znacznik" style="left:${pct(t)}%" title="${esc(opis)}" data-os-ef="1">${ik}</span>`).join("")}</div>` : ""}
    </div>
    <div class="os-legenda"><span><i class="l uj"></i>ujęcie</span><span><i class="l sc"></i>scena</span><span><i class="l np"></i>napis</span><span><i class="l au"></i>głos</span>${maEfekty ? "<span>✨ włączone efekty (krok Styl)</span>" : ""}</div>
  </div>`;
  box.querySelectorAll("[data-os-uj]").forEach((b) => (b.onclick = () => { const i = Number(b.dataset.osUj); if (S.krok === 2) return podgladUjecia(i); idz(2); setTimeout(() => podgladUjecia(i), 700); }));
  box.querySelectorAll("[data-os-sc]").forEach((b) => (b.onclick = () => { S.wybranaScena = Number(b.dataset.osSc); idz(5); }));
  box.querySelectorAll("[data-os-np]").forEach((b) => (b.onclick = () => idz(4)));
  box.querySelectorAll("[data-os-ef]").forEach((b) => (b.onclick = () => idz(3)));
  box.querySelectorAll("[data-os-martwe]").forEach((b) => (b.onclick = pokazRetencje));
  $("#osRetencja", box).onclick = pokazRetencje;
}

// ---------- ramka Instagrama wokół odtwarzacza ----------
function telefon(html) {
  if (!opcja("ramka")) return html;
  const ig = S.start?.config?.gabinet?.instagram;
  const handle = ig && !/todo/i.test(ig) ? ig.replace(/^@?/, "") : "twoj_gabinet";
  const opis = String(S.projekt?.pola?.["tytuł roboczy"] || "").replace(/^TODO$/i, "") || "Opis rolki";
  return `<div class="telefon">${html}<div class="ig-nakladka" aria-hidden="true">
    <div class="ig-gora"><b>Rolki</b><span>📷</span></div>
    <div class="ig-prawa"><span>♡<small>1,2 tys.</small></span><span>💬<small>48</small></span><span>➤<small>12</small></span><span>⋯</span></div>
    <div class="ig-dol"><b><i></i>${esc(handle)} <em>Obserwuj</em></b><p>${esc(opis)}</p><small>♫ Dźwięk oryginalny</small></div>
  </div></div>`;
}

// =====================================================================
// Asystent „Dokończ z Claude”: Claude pyta po kolei i sam uzupełnia braki
// (claude -p, kolejne odpowiedzi wznawiają tę samą sesję: --resume)
// =====================================================================
const A = { projekt: null, sesja: null, pracuje: false, gotowe: false };
function wszystkieBraki() {
  const out = [];
  for (let k = 1; k < KROKI.length; k++) for (const b of braki(k)) if (!b.ok) out.push(`- [${KROKI[k]}] ${b.tekst}`);
  return out;
}
function promptAsystenta() {
  const P = S.projekt;
  const lista = wszystkieBraki();
  return `Użyj skilla rolki-beauty (.claude/skills/rolki-beauty/SKILL.md) i zasad z CLAUDE.md.
Projekt rolki: ${P.nazwa} (folder ${P.sciezka}). Pliki: ${P.sciezka}/brief.md, ${P.sciezka}/kompozycja/rolka.json, ${P.sciezka}/napisy/transcript.json (w transkrypcji zmieniaj tylko pole text).
${uwagaMontazu()}${OS().mian} jest w panelu na kroku „${KROKI[S.krok]}” i nie uzupełniła wszystkiego. Jesteś asystentem montażu: przeprowadź ją krótką rozmową i sam uzupełnij braki w plikach rolki.

Czego brakuje według panelu:
${lista.length ? lista.join("\n") : "- panel nie widzi braków; sprawdź rolkę i zaproponuj, co jeszcze poprawić"}
${kontekstOpcjiAI()}

Zasady rozmowy:
1. Najpierw przeczytaj pliki rolki i zobacz, co jest w raw/ i proxy/. Nie pytaj o to, co da się ustalić z plików albo rozsądnie zaproponować. Wtedy po prostu to zrób i powiedz w jednym zdaniu.
2. Zadawaj JEDNO pytanie naraz, krótko, po polsku, na „Ty”, w stylu mówionym. Bez długich myślników.
3. Każde pytanie zakończ osobną, ostatnią linią w formacie:
OPCJE: odpowiedź 1 | odpowiedź 2 | odpowiedź 3
(2-4 krótkie propozycje, pierwsza to Twoja rekomendacja).
4. Po każdej odpowiedzi od razu zapisz w plikach to, co już wiesz.
5. Najwyżej 6 pytań. Gdy skończysz, napisz krótko, co ustawiłeś i co zostało do kliknięcia w panelu (np. render, final), a w ostatniej linii samo słowo: GOTOWE
Nigdy nie zakładaj zgody na wizerunek klientki: o nią zawsze zapytaj. Zero obietnic medycznych. Nie renderuj finalu.`;
}
// =====================================================================
// 🪄 Autopilot: prowadząca tylko wrzuca nagrania, Claude robi resztę (rozpoznanie, wywiad „co chcesz, czego nie”,
// montaż ze wszystkimi funkcjami, render, kontrola obrazu i poprawki, final po akceptacji).
// Pamięć decyzji między rolkami: 02_BRAND/autopilot.json. Rozmowa = asystent (claude -p, --resume),
// sesja zapamiętana w localStorage („autopilot_<projekt>”), więc po odświeżeniu panelu można wrócić.
// =====================================================================
function promptAutopilota(P) {
  const n = P.nazwa;
  return `Użyj skilla rolki-beauty (.claude/skills/rolki-beauty/SKILL.md) i zasad z CLAUDE.md (sekcja „Jak to działa” opisuje funkcje i pola rolka.json).

Jesteś AUTOPILOTEM montażu. ${OS().mian} wrzuciła nagrania do rolki ${n} (folder ${P.sciezka}, pliki w raw/). Rozpoznaj nagrania, zrób krótki wywiad i zmontuj rolkę zgodnie z decyzjami. Panel po otrzymaniu montażu sam uruchamia sprawdzanie i render.

PROFIL GABINETU: 02_BRAND/gabinet.md (jeśli istnieje): zabiegi i ceny, klientki, wyróżnik, ton, czego NIE pokazywać. Trzymaj się go w pomysłach, hookach i CTA; nie wymyślaj zabiegów ani cen spoza niego.

PAMIĘĆ: 02_BRAND/autopilot.json (chce, nie_chce, ustawienia, historia). Przeczytaj ją na starcie. Nie pytaj o to, co już tam jest, tylko potwierdź w pół zdania (np. „jak ostatnio: bez emoji, napisy Perła”). Po wywiadzie dopisz nowe decyzje: chce / nie_chce jako krótkie hasła funkcji, ustawienia (styl_napisow, ruch, dlugosc, cta, muzyka). Na końcu dodaj wpis do historia: {data, projekt, decyzje}.

PLAN TYGODNIA: jeśli brief.md ma w sekcji „Notatki” rolkę z planu tygodnia (hook, ujęcia, CTA, wygląd), to jest pomysł tej rolki: zaproponuj go jako pierwszy kąt w pytaniu a), a hook z planu jako pierwszą propozycję w b). Wygląd „naturalny” = rolka.json -> "montaz": "naturalny".

ETAP 1. ROZPOZNANIE (od razu, bez pytania):
- npm run rozpoznaj -- ${n}, potem przeczytaj ${P.sciezka}/kompozycja/rozpoznanie.json.
- npm run normalizuj -- ${n} zgodnie z preferencjami. Użyj --cisza, jeśli wycinanie ciszy jest wybrane.
- Jeśli istnieje scenariusz z opisami scen, uruchom node scripts/dopasuj-ujecia.mjs "${P.sciezka}". Wczytaj kompozycja/dopasowania-ujec.json z projektu. Do scen dobierz najlepsze fragmenty z podanych zakresów po obejrzeniu kadru. Jeśli nie ma trafienia, sprawdź rozpoznanie lub wskaż, co dograć.
- Jeśli scenariusz ma kwestie do nagrania, użyj npm run dopasuj-kwestie -- ${n} i zachowaj ręczne wybory. Przy filmie bez przygotowanych kwestii transkrybuj rozpoznane klipy z mową poleceniem npm run transkrybuj -- ${n} proxy/<klip>.mp4.
- Długie komendy (normalizuj, transkrybuj, render, obiekt, akcja, kontrola-obrazu) uruchamiaj z parametrem timeout 600000.
- Potem napisz w 2-3 zdaniach, co widzisz na nagraniach (konkretnie: czynności, efekt, jakość, twarz klientki), i zadaj pierwsze pytanie.

ETAP 2. WYWIAD: jedno pytanie naraz, maks. 7 pytań, tylko o to, czego nie wiesz z nagrań i z pamięci:
a) Pomysł: 2-3 kąty rolki dopasowane do TEGO, co nagrała (np. przemiana, edukacja „3 błędy”, POV, mit/fakt).
b) Hook: 3 propozycje tekstu na ekran (3-7 słów, jedno *słowo* = akcent) pod najmocniejsze ujęcie, plus „Napiszę swój”.
c) Zgoda na wizerunek: ZAWSZE pytaj, gdy rozpoznanie widzi twarz klientki. Zapisz w brief.md „zgoda na wizerunek: tak/nie”. Bez zgody: kadruj bez twarzy (kadr, przycięcie) albo pomiń te ujęcia.
d) Funkcje: zaproponuj jeden spójny pakiet. Wypisz 4-7 decyzji „Użyj” i 2-3 „Pomiń” z krótkim uzasadnieniem dla tych nagrań i z uwzględnieniem katalogu poniżej. Dołącz plan na konkretne sceny, jedną propozycję stylu i powód. Wybieraj tylko techniki, które wzmocnią treść. OPCJE: Użyj pakietu | Bez <najbardziej dyskusyjnej> | Wybiorę sama. Przy „Wybiorę sama” dopytaj krótko po kolei (tak/nie).
e) Dźwięk: mowa z nagrania, lektor czy sama muzyka dodana w aplikacji Instagrama (muzyka tylko z licencją albo w aplikacji).
f) Długość i CTA: zaproponuj (zwykle 15-30 s, jedno CTA).
Styl napisów i styl ruchu: weź z pamięci albo dołóż do pytania d.
Charakter montażu: weź z pamięci (ustawienia.montaz) albo dołóż do pytania d: reklamowy (plansze w kolorach marki, logo, dźwięki, efekty przejść) czy naturalny jak u vlogerki (rolka.json -> "montaz": "naturalny": tekst jak z Instagrama, cięcia, białe proste napisy, bez sfx i znaku wodnego; zloz przerabia to sam, scripts/montaz-naturalny.mjs).${uwagaMontazu()}
${kontekstOpcjiAI()}

ETAP 3. MONTAŻ (sam, bez pytań):
- brief.md: temat, hook, CTA, zgoda na wizerunek, notatki.
- ${P.sciezka}/kompozycja/rolka.json: ujęcia z proxy/ (najlepsze fragmenty wg rozpoznania i jakości; mowę tnij między słowami według transkrypcji; w 1. sekundzie mocny obraz, efekt na końcu, zajawka efektu na start gdy pasuje), scena hook-tytul z wybranym hookiem, CTA, napisy (plik transkrypcji i zrodlo), efekty i pola funkcji TYLKO tych, które ${OS().mian} chce, ruch, styl napisów. Szablony scen: 04_SZABLONY_HF/README.md.
- Funkcje ze skryptami: npm run akcja -- ${n} --zapisz; npm run przejscia -- ${n} --zapisz; obiekt (reflektor, poświata, tekst za): najpierw obejrzyj klatkę (ffmpeg -ss <t> -i ${P.sciezka}/proxy/<klip>.mp4 -frames:v 1 -vf scale=540:960 <plik.jpg> i przeczytaj obraz), wybierz środek obiektu w pikselach 1080x1920, potem npm run obiekt -- ${n} proxy/<klip>.mp4 --x X --y Y --t T --od OD --do DO --id o1 i dopisz ujęciu "obiekty". Mapa twarzy liczy się sama przy złożeniu (pola sledzenie, kadr, zoom_na z "twarz").
- Po zapisaniu rolka.json opisz krótko wybrane ujęcia i efekty. W ostatniej linii napisz dokładnie MONTAŻ DO KONTROLI. Panel zrobi kontrolę i podgląd. Nie uruchamiaj renderowania, kontroli ani finalu z rozmowy.

ETAP 4. POPRAWKI: wykorzystaj raport kompozycja/audyt-autopilota.json, gdy istnieje. Wykonaj proszone zmiany i zakończ MONTAŻ DO KONTROLI. Wersja końcowa powstaje z przycisku w panelu po akceptacji podglądu.

ZASADY: Każda Twoja odpowiedź kończy się pytaniem z osobną ostatnią linią
OPCJE: odpowiedź 1 | odpowiedź 2 | odpowiedź 3
(2-4 krótkie, pierwsza = Twoja rekomendacja) albo linią MONTAŻ DO KONTROLI po zmianie montażu. Po polsku, na „Ty”, krótko, mówionym stylem, bez długich myślników. Nie pytaj o rzeczy techniczne (fps, pliki, ścieżki). Zero obietnic medycznych i gwarancji, przed/po zawsze z „efekt indywidualny”, podologia bez szokującego startu. Niczego nie publikujesz. Gdy komenda się nie uda, powiedz, co się nie udało i co można zrobić.`;
}
const kluczAutopilota = (p) => `autopilot_${p}`;
function zapiszAutopilota(dane, p) { try { localStorage.setItem(kluczAutopilota(p), JSON.stringify(dane)); } catch {} }
function stanAutopilota(p) { try { return JSON.parse(localStorage.getItem(kluczAutopilota(p)) || "null"); } catch { return null; } }
function uruchomAutopilota(wznow) {
  const st = wznow ? stanAutopilota(S.projekt.nazwa) : null;
  otworzAsystenta({ tytul: "Autopilot 🪄", autopilot: true, wznow: st,
    powitanie: "Cześć! Najpierw obejrzę nagrania i przygotuję je (rozpoznanie, dźwięk, napisy). To potrwa kilka minut, a potem zadam Ci kilka pytań: co chcesz, a czego nie.",
    prompt: promptAutopilota(S.projekt) });
}
// pre (opcjonalnie, np. z planu tygodnia): { kat, temat, notatki (do brief.md, sekcja Notatki), po(nazwa) }
async function startAutopilota(pre = {}) {
  if (!pre || pre instanceof Event) pre = {};
  if (!S.start?.claude) return modal(`<h2>Claude nie jest dostępny</h2><p>Autopilot potrzebuje zalogowanego Claude Code: otwórz terminal, wpisz <code>claude</code> i zaloguj się, potem odśwież panel.</p><div class="rzad"><button class="btn" onclick="zamknijModal()">OK</button></div>`);
  const inbox = await api("/api/inbox").catch(() => []);
  let kat = pre.kat || null, pliki = [];
  const m = modal(`<h2>🪄 Autopilot</h2><p class="podpowiedz">Wrzuć nagrania i zdjęcia z telefonu, bez zmieniania nazw. Claude obejrzy je, zapyta Cię, co chcesz, a czego nie, i zmontuje całą rolkę.</p>
    <label class="ap-zrzut" id="apZrzut"><input type="file" id="apPliki" multiple accept="video/*,image/*" hidden><b>Przeciągnij tu nagrania</b><br><small>albo kliknij, żeby wybrać z dysku</small><div id="apLista" class="chipy" style="margin-top:8px;justify-content:center"></div></label>
    ${inbox.length ? `<label class="rzad" style="margin:10px 0"><input type="checkbox" id="apInbox" ${inbox.length ? "checked" : ""}> Weź też nagrania z 00_INBOX (${inbox.length})</label>` : ""}
    <p class="podpowiedz" style="margin:12px 0 6px">Czego dotyczy rolka?</p>
    <div class="kafle" id="apKat">${S.start.kategorie.map((k) => `<button class="kafel ${k === kat ? "wybrany" : ""}" data-k="${k}"><span class="ikona">${IKONY[k] || "✨"}</span>${NAZWY_KAT[k] || k}</button>`).join("")}</div>
    <label class="pole" style="margin-top:12px"><span>O czym (opcjonalnie, Claude i tak zapyta)</span><input type="text" id="apTemat" value="${esc(pre.temat || "")}" placeholder="np. laminacja brwi u klientki z rzadkimi brwiami"></label>
    <div class="rzad"><button class="btn duzy" id="apStart">🪄 Zaczynamy</button><button class="btn jasny" id="apNie">Anuluj</button></div>`);
  const pokazListe = () => { $("#apLista", m).innerHTML = pliki.map((f) => `<span class="chip">${esc(f.name)}</span>`).join(""); };
  const dodaj = (fl) => { pliki = [...pliki, ...[...fl].filter((f) => /^(video|image)\//.test(f.type) || /\.(mov|mp4|heic|jpe?g|png|webp)$/i.test(f.name))]; pokazListe(); };
  $("#apPliki", m).onchange = (e) => dodaj(e.target.files);
  const z = $("#apZrzut", m);
  z.ondragover = (e) => { e.preventDefault(); z.classList.add("nad"); };
  z.ondragleave = () => z.classList.remove("nad");
  z.ondrop = (e) => { e.preventDefault(); z.classList.remove("nad"); dodaj(e.dataTransfer.files); };
  m.querySelectorAll("#apKat .kafel").forEach((b) => (b.onclick = () => { kat = b.dataset.k; m.querySelectorAll("#apKat .kafel").forEach((x) => x.classList.toggle("wybrany", x === b)); }));
  $("#apNie", m).onclick = zamknijModal;
  $("#apStart", m).onclick = () => {
    const zInbox = !!$("#apInbox", m)?.checked;
    if (!pliki.length && !zInbox) return toast("Wrzuć nagrania albo weź je z 00_INBOX");
    if (!kat) return toast("Kliknij, czego dotyczy rolka");
    const temat = $("#apTemat", m).value.trim() || `autopilot ${new Date().toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" }).replace(":", "-")}`;
    zamknijModal();
    uruchom("nowa-rolka", [kat, temat, ...(zInbox ? ["--z-inbox"] : [])], { opis: "Autopilot: nowa rolka", po: async ({ kod, tekst }) => {
      const nazwa = (tekst.match(/Nowa rolka: 01_PROJEKTY\/(\S+)/) || [])[1];
      if (kod || !nazwa) return;
      if (pre.notatki) await api(`/api/projekt/${encodeURIComponent(nazwa)}/brief`, { method: "PUT", body: { pola: {}, sekcje: { "Notatki": pre.notatki } } }).catch(() => {});
      if (pre.po) { try { await pre.po(nazwa); } catch {} }
      for (let i = 0; i < pliki.length; i++) {
        toast(`Wgrywam ${i + 1}/${pliki.length}: ${pliki[i].name}`, 60000);
        try { const r = await fetch(`/api/projekt/${encodeURIComponent(nazwa)}/raw?nazwa=${encodeURIComponent(pliki[i].name)}`, { method: "POST", body: pliki[i] }); if (!r.ok) throw new Error((await r.json().catch(() => ({}))).blad || r.status); }
        catch (e) { blad(new Error(`Nie wgrałam ${pliki[i].name}: ${e.message || e}`)); }
      }
      await otworz(nazwa, 2);
      if (S.projekt?.nazwa !== nazwa || !S.projekt.pliki.raw.some((f) => f.typ === "wideo" || f.typ === "zdjecie")) {
        return toast("Brakuje czytelnych nagrań lub zdjęć. Sprawdź pliki w projekcie.", 4500);
      }
      toast("Nagrania w rolce, startuje autopilot", 2500);
      uruchomAutopilota(false);
    } });
  };
}
function kartaAutopilota() {
  const st = S.projekt && stanAutopilota(S.projekt.nazwa);
  if (!st) return "";
  const tekst = st.gotowe ? "Wersja końcowa gotowa." : st.idZadania ? "Trwa montaż lub kontrola."
    : S.projekt.audytAutopilota?.aktualny ? "Sprawdzona wersja robocza czeka na obejrzenie." : "Wróć do rozmowy, aby kontynuować.";
  return `<div class="karta ap-karta"><div class="naglowek"><div><h3>🪄 Autopilot</h3><p class="podpowiedz">${tekst}</p></div><button class="btn" id="apWroc">Wróć do rozmowy</button></div></div>`;
}
function dymek(kto, html) {
  const d = document.createElement("div");
  d.className = "dymek " + kto;
  d.innerHTML = html;
  $("#asystentRozmowa").appendChild(d);
  $("#asystentRozmowa").scrollTop = $("#asystentRozmowa").scrollHeight;
}
function formatuj(t) { return esc(t).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").replace(/\*([^*\n]+?)\*/g, "<em>$1</em>").replace(/\n/g, "<br>"); }
function otworzAsystenta(wlasne) {
  if (!S.projekt) return toast("Najpierw otwórz rolkę");
  const nowyKlucz = S.projekt.nazwa + (wlasne?.prompt ? "|" + wlasne.tytul : "");
  if (A.pracuje && A.klucz !== nowyKlucz) return toast("Poczekaj na wynik bieżącej rozmowy.");
  A.wlasne = wlasne && wlasne.prompt ? wlasne : null;
  $("#asystent h3").textContent = (A.wlasne?.autopilot ? "" : "✦ ") + (A.wlasne?.tytul || "Dokończ z Claude");
  const opis = $("#asystentOpis");
  if (opis) opis.textContent = A.wlasne?.autopilot ? "Claude ogląda nagrania, pyta, co chcesz, a czego nie, i sam montuje całą rolkę. Ty tylko klikasz odpowiedzi." : "Claude sprawdzi, czego brakuje w rolce, zada Ci kilka pytań i sam uzupełni brief, ujęcia i sceny.";
  $("#claude").classList.add("ukryte");
  $("#asystent").classList.remove("ukryte");
  if (!S.start?.claude) {
    $("#asystentRozmowa").innerHTML = "";
    dymek("od-claude", "Komenda <code>claude</code> nie jest zainstalowana albo nie jest zalogowana w terminalu. Otwórz terminal, wpisz <code>claude</code> i zaloguj się, potem odśwież panel.");
    return;
  }
  const klucz = nowyKlucz;
  if (A.klucz === klucz) return;
  // autopilot po odświeżeniu panelu: ta sama sesja Claude, ostatnie pytanie i przyciski
  if (A.wlasne?.wznow?.sesja || A.wlasne?.wznow?.idZadania) {
    const w = A.wlasne.wznow;
    A.projekt = S.projekt.nazwa; A.sesja = w.sesja; A.gotowe = !!w.gotowe; A.klucz = klucz;
    $("#asystentRozmowa").innerHTML = "";
    dymek("od-claude", formatuj(w.ostatnia || "Wracamy do rozmowy."));
    if (w.idZadania) return odbierzAsystenta(() => api(`/api/zadanie/${encodeURIComponent(w.idZadania)}`));
    rysujOpcjeAsystenta(w.opcje || [], !!w.gotowe);
    return;
  }
  nowaRozmowa();
}
function nowaRozmowa() {
  A.projekt = S.projekt.nazwa; A.sesja = null; A.gotowe = false;
  A.klucz = S.projekt.nazwa + (A.wlasne ? "|" + A.wlasne.tytul : "");
  $("#asystentRozmowa").innerHTML = "";
  $("#asystentOpcje").innerHTML = "";
  if (A.wlasne) { dymek("od-claude", formatuj(A.wlasne.powitanie)); return wyslijDoAsystenta(A.wlasne.prompt, null); }
  const lista = wszystkieBraki();
  dymek("od-claude", lista.length ? `W tej rolce brakuje jeszcze <b>${lista.length}</b> rzeczy. Zaraz je przejrzę i zapytam Cię tylko o to, czego nie da się ustalić z nagrań.` : "Panel nie widzi braków, ale sprawdzę rolkę i podpowiem, co jeszcze poprawić.");
  wyslijDoAsystenta(promptAsystenta(), null);
}
async function wyslijDoAsystenta(prompt, pokazJako) {
  if (A.pracuje || S.zadanie || S.projekt?.nazwa !== A.projekt) return;
  if (pokazJako) dymek("od-ciebie", formatuj(pokazJako));
  const autopilot = !!A.wlasne?.autopilot;
  if (autopilot && !prompt.includes("MONTAŻ DO KONTROLI")) {
    prompt += "\n\nJeśli zmienisz montaż, zakończ odpowiedź osobną linią MONTAŻ DO KONTROLI. Panel uruchomi audyt i render. Wywiad kończ linią OPCJE.";
  }
  return odbierzAsystenta(() => api("/api/claude", { method: "POST", body: { prompt, projekt: A.projekt, sesja: A.sesja, autopilot } }));
}
async function odbierzAsystenta(pobierzZadanie) {
  const projekt = A.projekt;
  const autopilot = !!A.wlasne?.autopilot;
  const poprzedni = autopilot ? stanAutopilota(projekt) : null;
  $("#asystentOpcje").innerHTML = "";
  A.pracuje = true;
  $("#asystentPracuje").classList.remove("ukryte");
  $("#asystentStatus").textContent = A.sesja ? "Claude zapisuje i myśli dalej…" : "Claude sprawdza rolkę…";
  $("#asystentWyslij").disabled = true;
  // podgląd, co Claude właśnie robi (linie narzędzi zaczynają się od ›)
  const naLinie = (l) => {
    if (l.startsWith("›")) $("#asystentStatus").textContent = "Claude: " + l.slice(2, 70);
    else if (/próbki|porównuje poprawki|recenzja montażu|Renderuję podgląd/.test(l)) $("#asystentStatus").textContent = l;
  };
  const przywroc = () => {
    if (!autopilot) return;
    const dane = { ...poprzedni, sesja: A.sesja, idZadania: null };
    if (dane.sesja) zapiszAutopilota(dane, projekt);
    else { try { localStorage.removeItem(kluczAutopilota(projekt)); } catch {} }
    rysujOpcjeAsystenta(dane.opcje || [], !!dane.gotowe);
  };
  try {
    const z = await pobierzZadanie();
    if (autopilot) zapiszAutopilota({ ...poprzedni, idZadania: z.id, gotowe: false }, projekt);
    const { kod, wynik = "", sesja, audyt } = await sledz(z, autopilot ? "Autopilot" : "Asystent Claude", null, naLinie);
    if (sesja) A.sesja = sesja;
    const marker = /^MONTA[ŻZ] DO KONTROLI\s*\.?$/i.test(wynik.trim().split(/\r?\n/).at(-1) || "");
    if (autopilot && (audyt || marker)) {
      const opis = wynik.trim().split(/\r?\n/).filter((l) => !/^MONTA[ŻZ] DO KONTROLI|^OPCJE:|^GOTOWE/i.test(l)).join("\n");
      pokazWynikAudytuAsystenta(kod === 0 || audyt?.blad ? audyt : null, opis);
    } else {
      pokazOdpowiedz(kod, wynik);
      if (kod !== 0) przywroc();
    }
  } catch (e) {
    dymek("od-claude blad", formatuj("Nie udało się: " + (e.message || e)));
    przywroc();
  } finally {
    A.pracuje = false;
    $("#asystentPracuje").classList.add("ukryte");
    $("#asystentWyslij").disabled = false;
    if (S.projekt?.nazwa === projekt) {
      S.napisy = null;
      try { S.szablony = await api("/api/szablony"); } catch {}
      try { if (S.projekt?.nazwa === projekt) await odswiezProjekt(); } catch {}
    }
  }
}
function pokazOdpowiedz(kod, wynik) {
  if (/failed to authenticate|oauth|not logged in|please run \/login/i.test(wynik)) return dymek("od-claude blad", "Claude w terminalu nie jest zalogowany (sesja wygasła).<br><b>Co zrobić:</b> otwórz terminal, wpisz <code>claude</code>, potem <code>/login</code>. Po zalogowaniu kliknij „Od nowa”.");
  if (kod !== 0) return dymek("od-claude blad", wynik ? formatuj(wynik) : "Claude zakończył z błędem. Szczegóły znajdziesz w logu.");
  const linie = wynik.trim().split("\n");
  let opcje = [];
  const i = linie.findLastIndex((l) => /^\s*OPCJE\s*:/i.test(l));
  if (i >= 0) { opcje = linie[i].replace(/^\s*OPCJE\s*:/i, "").split("|").map((s) => s.trim()).filter(Boolean).slice(0, 4); linie.splice(i, 1); }
  const znacznikGotowe = /^\s*GOTOWE\s*\.?\s*$/i.test(linie.at(-1) || "");
  if (znacznikGotowe) linie.pop();
  const gotowe = znacznikGotowe && !A.wlasne?.autopilot;
  const tekst = linie.join("\n").trim() || "(brak odpowiedzi)";
  dymek("od-claude", formatuj(tekst));
  A.gotowe = gotowe;
  if (A.wlasne?.autopilot) zapiszAutopilota({ sesja: A.sesja, ostatnia: tekst, opcje, gotowe, data: new Date().toISOString() }, A.projekt);
  rysujOpcjeAsystenta(opcje, gotowe);
}
function rysujOpcjeAsystenta(opcje, gotowe) {
  const box = $("#asystentOpcje");
  if (gotowe) {
    box.innerHTML = `<button class="btn" id="asystentKoniec">✓ Super, zamykam</button>`;
    $("#asystentKoniec").onclick = () => $("#asystent").classList.add("ukryte");
    toast("Claude uzupełnił rolkę");
  } else {
    box.innerHTML = opcje.map((o, n) => `<button data-o="${esc(o)}" class="${n === 0 ? "polecana" : ""}">${n === 0 ? "★ " : ""}${esc(o)}</button>`).join("");
    box.querySelectorAll("[data-o]").forEach((b) => (b.onclick = () => A.wlasne?.autopilot
      ? akcjaAutopilota(b.dataset.o).catch(blad) : wyslijDoAsystenta(b.dataset.o, b.dataset.o)));
  }
}
document.querySelectorAll("#claude [data-asystent]").forEach((b) => (b.onclick = () => otworzAsystenta()));
$("#asystentZamknij").onclick =() => $("#asystent").classList.add("ukryte");
$("#asystentNowa").onclick = () => { if (!A.pracuje && S.projekt) nowaRozmowa(); };
$("#asystentWyslij").onclick = () => { const t = $("#asystentTekst").value.trim(); if (!t) return toast("Wpisz odpowiedź albo kliknij propozycję"); $("#asystentTekst").value = ""; wyslijDoAsystenta(t, t); };
$("#asystentTekst").onkeydown = (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); $("#asystentWyslij").click(); } };

// =====================================================================
// Wymyśl nową rolkę z Claude: rozmowa -> profil rolki -> hooki, plan utrzymania,
// scenariusz i lista materiałów -> poprawki -> „Utwórz rolkę”.
// Claude zapisuje 01_PROJEKTY/_pomysly/<id>/pomysl.json, panel pokazuje go na żywo.
// =====================================================================
const PM = { id: null, sciezka: null, dane: null, recenzja: null, turniej: null, historia: null, rozmowa: { sesja: null, wiadomosci: [] }, pracuje: false, opcje: [], odpytywanie: null };
const POLA_PROFILU = [["pomysl", "Pomysł"], ["temat", "Temat (nazwa rolki)"], ["kategoria", "Kategoria"], ["zabieg", "Zabieg / produkt"], ["cel", "Cel"], ["odbiorca", "Dla kogo"], ["emocja", "Emocja / ton"], ["format", "Format"], ["kto_mowi", "Kto mówi"], ["twarz_klientki", "Twarz klientki"], ["dlugosc", "Długość"], ["cta", "CTA"]];
const TYPY_MAT = { wideo: ["🎥", "Wideo"], zblizenie: ["🔍", "Zbliżenie"], zdjecie: ["📷", "Zdjęcie"], mowa: ["🎙️", "Mówisz do kamery"], ekran: ["📱", "Nagranie ekranu"] };
const ETAPY_PM = [["profil", "Profil rolki"], ["scenariusz", "Scenariusz"], ["gotowy", "Zatwierdzony"]];

function promptPomyslu(tryb, tekst) {
  const kat = S.start.kategorie.join(", ");
  return `Użyj skilla rolki-beauty (.claude/skills/rolki-beauty/SKILL.md) i zasad z CLAUDE.md. Przeczytaj też: .claude/skills/rolki-beauty/references/formaty-rolek.md, .claude/skills/rolki-beauty/references/hooki-beauty.md, 03_BIBLIOTEKA/research/hooki.md (hooki, które zatrzymały ${OS().bier} w cudzych rolkach: bierz ich mechanizm, nigdy słowa) oraz 02_BRAND/brand.md i 02_BRAND/gabinet.md (profil gabinetu: czym się zajmuje, zabiegi i ceny, klientki, wyróżnik, ton, czego NIE pokazywać; nie wymyślaj zabiegów ani cen spoza tego profilu, a gdy go brak, nie podawaj cen).

Jesteś scenarzystką rolek IG/TikTok dla gabinetu beauty ${OS().dop} (kosmetologia: brwi, rzęsy, twarz; podologia: pedicure, stopy, paznokcie). Pracujecie RAZEM w panelu: ${OS().mian} widzi po prawej „profil rolki”, który budujesz w pliku, a po lewej rozmowę z Tobą.

PLIK DO PROWADZENIA: ${PM.sciezka}
Po KAŻDEJ swojej odpowiedzi przeczytaj ten plik (${OS().mian} mogła coś zmienić w panelu, np. wybrać hook) i zapisz go na nowo (Write, cały JSON, UTF-8) ze wszystkim, co już wiesz. Schemat:
{
  "id", "tryb", "utworzono", "projekt": null   (nie zmieniaj),
  "etap": "profil" | "scenariusz" | "gotowy",
  "profil": { "pomysl": "1 zdanie", "temat": "krótka nazwa rolki, max 6 słów, bez znaków specjalnych", "kategoria": "jedno z: ${kat}", "zabieg": "", "cel": "zasięg | edukacja | sprzedaż zabiegu", "odbiorca": "", "emocja": "", "format": "nazwa formatu z formaty-rolek.md", "kto_mowi": "${OS().mian} do kamery | lektor | bez mowy, sam tekst", "twarz_klientki": "tak | nie", "dlugosc": "np. 20-25 s", "cta": "" },
  "hooki": [ { "tekst": "tekst na ekranie, 3-7 słów, jedno *słowo* = akcent", "mowisz": "pierwsze zdanie mówione, maks. 10 słów", "wizual": "co widać w 1. sekundzie (ruch, efekt, zbliżenie)", "dzwiek": "co słychać w 1. sekundzie", "wariant_b": "druga wersja zdania mówionego do nagrania na test", "typ": "ciekawość | mit | efekt | pytanie | POV | liczba | kontrowersja", "wybrany": true/false } ]   (zawsze 3, różne typy, jeden "wybrany"),
  "utrzymanie": [ "konkretny zabieg utrzymania + sekunda, np. '0-1 s: zajawka efektu pod hookiem'", ... ]   (4-6 punktów),
  "scenariusz": [ { "od": 0, "do": 1.5, "co_widac": "", "mowisz": "", "na_ekranie": "", "material": "M1", "rola": "hook | kontekst | wartosc | rehook | nagroda | cta", "bodziec": "co się zmienia w obrazie albo dźwięku w tym fragmencie", "pytanie_widza": "jakie pytanie ma teraz w głowie widz", "energia": 1-5 } ]   (pole "zablokowany": true ustawia ${OS().mian}: takiego fragmentu nie zmieniasz),
  "materialy": [ { "id": "M1", "nazwa_pliku": "M1_mowa_hook", "typ": "wideo | zblizenie | zdjecie | mowa | ekran", "opis": "co dokładnie", "jak": "jak nagrać: kadr, odległość, światło, ruch, ile powtórek", "czas": "ile sekund nagrać", "obowiazkowy": true/false, "teleprompter": [ { "kiedy": "np. Start (hook), 0-3 s", "tekst": "dokładnie to, co ${OS().mian} mówi w tym ujęciu" } ] } ],
  "efekty": { "zajawka", "bodziec", "punch_in", "dzwieki", "pasek_postepu", "zapetlenie", "emoji": true/false },
  "uwagi": "ważne rzeczy, np. zgoda na wizerunek"
}

JAK PROWADZISZ ROZMOWĘ
1. ${tryb === "gotowy"
    ? `Plik ma już GOTOWY scenariusz (ułożony przez panel: ${PM.dane?.zrodlo || "gotowe pomysły"}, z oceną). NIE zbieraj profilu od nowa i nie zadawaj pytań z punktu 2. Od razu wykonaj prośbę ${OS().dop}: „${tekst}” według punktu 5 (poprawki) albo 6 (zatwierdzenie).`
    : tryb === "propozycja"
    ? `${OS().mian} prosi, żebyś ZAPROPONOWAŁA rolkę.${tekst ? ` Jej wskazówki: „${tekst}”.` : ""} Najpierw zajrzyj do 05_ARCHIWUM/wyniki.csv (co działało) i listy folderów w 01_PROJEKTY (żeby się nie powtarzać). Potem SAMOKONTROLA (po cichu, nie w czacie): wymyśl 8 różnych pomysłów i każdy oceń surowo jak widzka, która przewija rolki w autobusie, w skali 1-10 na kryteriach hooka: ${KRYTERIA_HOOKA_TXT}. Odrzuć wszystko poniżej 7, pomysły bez mocnego obrazu w 1. sekundzie, bez konkretu i takie, których ${OS().mian} nie nagra telefonem w gabinecie. Pokaż tylko 3 najlepsze RÓŻNE (inny format i inny typ hooka), każdy w 2-3 linijkach: tytuł + hook + „🎯 ocena/10: dlaczego zatrzyma kciuk i co jest jego słabszą stroną”. Gdy mniej niż 3 pomysły mają 7+, pokaż mniej i powiedz to wprost. OPCJE = krótkie tytuły pokazanych pomysłów + „Coś innego”. Do pliku wpisz na razie tylko etap "profil".`
    : `Pomysł ${OS().dop}: „${tekst}”. Wpisz go od razu do profilu (pomysl, i co się da wywnioskować). Zanim zadasz pierwsze pytanie, oceń go uczciwie jak widzka w skali 1-10 (${KRYTERIA_HOOKA_TXT}). Gdy wychodzi poniżej 7, powiedz w 1-2 zdaniach, co jest słabe (np. brak efektu do pokazania, temat bez „to o mnie”, nic się nie dzieje w 1. sekundzie), i zaproponuj mocniejszy kąt tego samego tematu: pierwsza OPCJA = mocniejszy kąt, druga = „Zostańmy przy moim”. Gdy 7+, napisz ocenę w pół zdania i pytaj dalej.`}
2. Potem zbieraj profil pytaniami: JEDNO pytanie naraz, krótko, po polsku, na „Ty”, ciepło i konkretnie. Nie pytaj o to, co możesz rozsądnie wywnioskować (wpisz i powiedz w pół zdania). Najwyżej 5 pytań. Zawsze ustal: cel, kto mówi, czy w kadrze będzie twarz klientki (jeśli tak: zapytaj o zgodę na wizerunek), co ma poczuć widz.
3. Każde pytanie kończ OSOBNĄ ostatnią linią:
OPCJE: odpowiedź 1 | odpowiedź 2 | odpowiedź 3
(2-4 krótkie propozycje, pierwsza = Twoja rekomendacja).
4. Gdy profil jest gotowy: ustaw etap "scenariusz" i zapisz w pliku 3 hooki, plan utrzymania, scenariusz sekunda po sekundzie i listę materiałów. Zanim odpowiesz w czacie, sprawdź się sama: uruchom \`npm run ocen-scenariusz -- ${PM.id}\` i popraw plik, aż wynik ma co najmniej 85 i hook nie ma niezaliczonych testów (najwyżej 3 próby). Po Twojej odpowiedzi panel sam da scenariusz niezależnej recenzentce, która może go jeszcze dopracować, więc nie obiecuj ${OS().cel}, że to wersja ostateczna. W czacie NIE przepisuj całego scenariusza (${OS().mian} widzi go po prawej), napisz 3-5 zdań: jaki hook polecasz i dlaczego, jak trzymasz uwagę, ile materiałów potrzebujesz i które są najważniejsze. Zakończ pytaniem, co poprawić, z linią:
OPCJE: Zatwierdzam, tworzymy rolkę | Mocniejszy hook | Krócej i szybciej | Inny format
5. Poprawki: zmieniasz tylko to, o co prosi, zapisujesz plik i mówisz w 1-2 zdaniach, co zmieniłaś. Znowu OPCJE jak w punkcie 4. Gdy ${OS().mian} napisze, że nie ma jakiegoś materiału, zamień go na coś, co łatwo nagrać, i popraw scenariusz.
6. Gdy ${OS().mian} zatwierdza: ustaw etap "gotowy", zapisz plik, napisz krótko „co teraz” (dostarczyć materiały w panelu) i w ostatniej linii samo słowo: GOTOWE

${S.start.rezyseria.prompt}

ZASADY ROLKI (najważniejsze)
- MOCNY HOOK: w pierwszej sekundzie jednocześnie mocny obraz (efekt, ruch, zbliżenie) i krótki tekst na ekranie. Bez „cześć, dzisiaj powiem”. Hook ma otwierać pętlę ciekawości, którą zamykasz dopiero na końcu.
- UTRZYMANIE do końca: zmiana obrazu co 1-3 s, zapowiedź nagrody („na końcu pokażę…”, licznik 1/3), zwrot akcji albo drugi hook w połowie, efekt końcowy dopiero pod koniec (a jego zajawka 0,8 s na start), krótkie CTA na końcu (zapisz, obserwuj, umów się). Długość zwykle 15-30 s.
- MOMENT DO WYSŁANIA: wysłanie rolki znajomej w wiadomości to jeden z najmocniejszych sygnałów dla Instagrama. Zaplanuj jedno konkretne zdanie albo obraz, przy którym widz pomyśli „muszę to wysłać X” (np. rozpoznawalny błąd, „ta jedna rzecz”), i dopasuj do niego CTA („wyślij tej, która…”), gdy cel to zasięg. Wpisz go jako punkt w "utrzymanie".
- OCENA SCENARIUSZA: panel liczy na żywo ocenę 0-100 (scripts/ocena-scenariusza.mjs) i pokazuje ją ${OS().cel}. Pisz od razu tak, żeby przeszła: tekst hooka 3-7 słów z jednym akcentem; zdanie hooka maks. 10 słów i bez otwarć typu „cześć”, „dzisiaj”, „pokażę ci”, „zapraszam”; w wizualu hooka ruch, efekt albo zbliżenie; pierwszy wiersz scenariusza (hook) kończy się najpóźniej w 2 s; każdy fragment maks. 2,5 s albo z wpisanym "bodziec"; mowa 2,3-3,2 słowa na sekundę fragmentu (licz słowa!) i bez fragmentów dużo wolniejszych od reszty; między 35% a 65% długości fragment "rola": "rehook" (zwrot, licznik, nowa obietnica); w ostatnich 30% fragment "rola": "nagroda" (efekt albo odpowiedź na hook); tekst na ekranie mieści się w czasie czytania (0,6 s + 0,3 s na słowo), a gdy fragment ma mowę, na ekranie maks. 4 słowa (pod spodem lecą napisy); jedno CTA w ostatnich 20%; jeden moment do wysłania; bez słów reklamowych (oferujemy, profesjonalny, kompleksowy, najlepszy, gwarancja) i klisz („nie uwierzysz”, „sekret, którego…”). Gdy ${OS().mian} klika „Napraw”, dostajesz dokładną listę niezaliczonych testów: popraw tylko to.
- PRZEBITKI: w scenariuszu, gdy mówisz o zabiegu czy efekcie, pokaż go: wiersz z mową może mieć "przebitka": "M3" (obraz z M3 nad głosem). Plan materiałów musi to uwzględnić.
- TEMPO: przygotowanie i powtarzalne ruchy pokaż przyspieszone (2-3x), efekt w normalnym tempie. Opisz to w "co_widac".
- WNIOSKI Z WYNIKÓW: jeśli istnieje 05_ARCHIWUM/wnioski.md, przeczytaj go na starcie i stosuj (co u ${OS().dop} działa, gdzie widzowie odpadali). W czacie wspomnij w pół zdania, z którego wniosku korzystasz.
- VLOG / DAILY (format 11): gdy ${OS().mian} chce pokazać dzień, plan dnia zamiast klasycznego scenariusza. Materiały = ujęcia do złapania w ciągu dnia z godziną w "czas" (np. "ok. 8:00, 3-5 s"), 15-30 krótkich, różnorodnych (szeroko, zbliżenie, detal, ruch, ona sama), każde z "jak" (np. „telefon oparty o lustro”), 1-3 wstawki do kamery (z teleprompterem) i 2-3 naturalne dźwięki do złapania (kawa, drzwi, szczoteczka). Hook dnia ma obiecywać coś konkretnego („9 klientek przed sylwestrem”, „co robię między zabiegami”), a koniec dnia ma domknięcie (zgaszone światło, efekt dnia). Scenariusz to rozdziały dnia (rano, gabinet, wieczór). Montaż robi panel automatycznie (cięcia w rytmie, godzina na ekranie), więc w "efekty" ustaw zajawka i dzwieki. Klientki bez twarzy albo ze zgodą.
- TELEPROMPTER: każdy materiał, w którym ${OS().mian} coś mówi (do kamery albo w trakcie zabiegu), ma pole "teleprompter": kwestie w kolejności nagrywania, słowo w słowo tak, jak ma je powiedzieć (to samo co "mowisz" w scenariuszu), krótkie zdania mówione, naturalne, bez długich myślników. Jedna kwestia = jedno podejście do kamery. Materiały bez mowy mają "teleprompter": [].
- NAZWY PLIKÓW: każdy materiał ma "nazwa_pliku" = id + typ + krótki opis, małe litery, bez polskich znaków i spacji, np. "M1_mowa_hook", "M2_zdjecie_przed", "M4_zblizenie_czesanie". ${OS().mian} zapisuje nagrania pod tą nazwą (panel i tak nazwie tak plik przy wgrywaniu), więc potem od razu wiesz, co jest czym.
- MATERIAŁY: konkretne i łatwe do nagrania telefonem: pion 9:16, światło z okna albo lampa pierścieniowa, stabilnie, każde ujęcie nagraj 2-3 razy dłużej niż potrzeba. Rozróżniaj szeroki plan, zbliżenie (makro detalu) i zdjęcia (przed/po zawsze w tym samym świetle, kadrze i odległości). Numeruj M1, M2… Każdy fragment scenariusza wskazuje swój materiał.
- Styl influencerski, mówiony, nie reklama. Bez długich myślników. Zero obietnic medycznych i gwarancji. Przed/po zawsze z „efekt indywidualny”. Podologia: estetycznie, bez szokującego startu i bez diagnoz.
- Nie twórz folderów projektu i nie uruchamiaj skryptów (jedyny wyjątek: npm run ocen-scenariusz): rolkę utworzy panel po zatwierdzeniu. Edytuj tylko plik pomysłu.`;
}
const KRYTERIA_HOOKA_TXT = "zatrzymanie kciuka, luka ciekawości, konkret, „to o mnie”, spójność obrazu, tekstu i głosu, autentyczność (nie reklama)";
const przypomnienie = () => `\n\n(Przypomnienie dla Ciebie: przeczytaj ${PM.sciezka}, uwzględnij zmiany z panelu, zapisz plik. Każdy materiał ma mieć "nazwa_pliku" (np. "M1_mowa_hook") i "teleprompter": [{"kiedy","tekst"}] ze słowo w słowo tym, co ${OS().mian} mówi w tym nagraniu (pusta lista, gdy bez mowy); uzupełnij, jeśli brakuje. Jeśli obok pliku jest recenzja.json, weź pod uwagę zarzuty recenzentki. Po zmianie scenariusza sprawdź się: npm run ocen-scenariusz -- ${PM.id} (cel 85+). Jedno pytanie naraz, ostatnia linia OPCJE: … albo GOTOWE.)`;

async function nowyPomysl() {
  if (!S.start?.claude) return modal(`<h2>Claude nie jest dostępny</h2><p>Żeby wymyślać rolki z Claude, zainstaluj i zaloguj Claude Code: otwórz terminal, wpisz <code>claude</code> i zaloguj się, potem odśwież panel.</p><div class="rzad"><button class="btn" onclick="zamknijModal()">OK</button></div>`);
  let tryb = "pomysl";
  const m = modal(`<h2>✦ Wymyśl nową rolkę</h2><p class="podpowiedz">Opowiedz pomysł, a Claude dopyta o szczegóły, napisze scenariusz z mocnym hookiem i powie, co dokładnie nagrać.</p>
    <button class="btn" id="pmGotowe" style="width:100%;margin:6px 0 4px">⚡ Bez rozmowy: 3 gotowe pomysły z oceną od razu</button>
    <div class="przelacznik" id="pmTryb" style="margin:10px 0 14px"><button data-t="pomysl" class="wybrany">💡 Mam pomysł</button><button data-t="propozycja">🎲 Zaproponuj mi rolkę</button></div>
    <div class="rzad" style="gap:14px;margin-bottom:10px"><label class="pole" style="margin:0"><span>Przepis</span><select id="pmTrybAlg">${TRYBY.map(([k, n, o]) => `<option value="${k}" title="${esc(o)}">${n}${k === "mieszany" ? " (polecany)" : ""}</option>`).join("")}</select></label>
      <label class="rzad"><input type="checkbox" id="pmProba" ${S.algorytm?.czasNaProbe ? "checked" : ""}> 🧪 Rolka na próbę${S.algorytm?.czasNaProbe ? " <small class=\"podpowiedz\">(czas na nią: dawno nie było)</small>" : ""}</label></div>
    <p class="podpowiedz" id="pmTrybOpis" style="margin-top:-4px">${esc(TRYBY[0][2])}${S.algorytm?.zWynikami ? ` Masz ${S.algorytm.zWynikami} rolek z wynikami.` : " Na razie nie masz rolek z wynikami, więc to głównie ogólne zasady."}</p>
    <label class="pole"><span id="pmEtykieta">Twój pomysł (może być jednym zdaniem)</span><textarea id="pmTekst" rows="4" placeholder="np. chcę pokazać laminację brwi u klientki, która myślała, że ma za rzadkie brwi"></textarea></label>
    <div class="rzad"><button class="btn duzy" id="pmStart">Zaczynamy</button><button class="btn jasny" id="pmNie">Anuluj</button></div>`);
  m.querySelectorAll("[data-t]").forEach((b) => (b.onclick = () => {
    tryb = b.dataset.t; m.querySelectorAll("[data-t]").forEach((x) => x.classList.toggle("wybrany", x === b));
    $("#pmEtykieta", m).textContent = tryb === "propozycja" ? "Wskazówki (opcjonalnie): kategoria, nastrój, co się ostatnio dzieje w gabinecie" : "Twój pomysł (może być jednym zdaniem)";
    $("#pmTekst", m).placeholder = tryb === "propozycja" ? "np. coś o podologii, luźno i z humorem, mam teraz dużo klientek przed sylwestrem" : "np. chcę pokazać laminację brwi u klientki, która myślała, że ma za rzadkie brwi";
  }));
  $("#pmNie", m).onclick = zamknijModal;
  $("#pmGotowe", m).onclick = () => { zamknijModal(); oknoPropozycji(); };
  $("#pmTrybAlg", m).onchange = (e) => { $("#pmTrybOpis", m).textContent = TRYBY.find(([k]) => k === e.target.value)[2]; };
  $("#pmTekst", m).focus();
  $("#pmStart", m).onclick = async () => {
    const tekst = $("#pmTekst", m).value.trim();
    if (tryb === "pomysl" && !tekst) return toast("Napisz choć jedno zdanie o pomyśle");
    try {
      const trybAlg = $("#pmTrybAlg", m).value, proba = $("#pmProba", m).checked;
      const przepis = (await api(`/api/algorytm/przepis?tryb=${trybAlg}&proba=${proba ? 1 : 0}`).catch(() => ({ tekst: "" }))).tekst;
      const p = await api("/api/pomysly", { method: "POST", body: { tryb } });
      zamknijModal();
      wczytajPomysl(p);
      pokazPomysl();
      const widoczne = tryb === "propozycja" ? `🎲 Zaproponuj mi rolkę${tekst ? `: ${tekst}` : ""}` : tekst;
      wyslijPomysl(promptPomyslu(tryb, tekst) + (przepis ? `

PRZEPIS Z WYNIKÓW ${OS().dop.toUpperCase()} (samouczący się algorytm panelu):
${przepis}` : ""), widoczne + (proba ? " · 🧪 rolka na próbę" : "") + (trybAlg !== "mieszany" ? ` · przepis: ${TRYBY.find(([k]) => k === trybAlg)[1]}` : ""));
    } catch (e) { blad(e); }
  };
}
function wczytajPomysl(p) { PM.id = p.id; PM.sciezka = p.sciezka; PM.dane = p.pomysl; PM.recenzja = p.recenzja || null; PM.turniej = p.turniej || null; PM.historia = p.historia || null; PM.rozmowa = p.rozmowa || { sesja: null, wiadomosci: [] }; PM.opcje = []; const ost = PM.rozmowa.wiadomosci.at(-1); if (ost?.kto === "claude") PM.opcje = ost.opcje || []; }
async function otworzPomysl(id) { try { wczytajPomysl(await api(`/api/pomysl/${id}`)); pokazPomysl(); } catch (e) { blad(e); history.replaceState(null, "", "#"); PM.id = null; pokaz(); } }
function pokazPomysl() { S.projekt = null; S.krok = 0; history.replaceState(null, "", `#pomysl=${PM.id}`); pokazKroki(); const ek = $("#ekran"); ek.innerHTML = `<div id="tresc"></div>`; ekranPomysl($("#tresc")); window.scrollTo(0, 0); }
const zapiszRozmowe = () => api(`/api/pomysl/${PM.id}/rozmowa`, { method: "PUT", body: PM.rozmowa }).catch(() => {});
const zapiszPomysl = debounce(async () => { if (PM.pracuje) return toast("Claude właśnie pisze, spróbuj za chwilę"); try { await api(`/api/pomysl/${PM.id}`, { method: "PUT", body: PM.dane }); toast("Zapisano", 1000); } catch (e) { blad(e); } }, 300);

function ekranPomysl(el) {
  el.innerHTML = `
    <div class="naglowek"><div><h1>✦ Nowa rolka z Claude</h1><p>Rozmawiacie po lewej, a profil rolki, scenariusz i lista materiałów rosną po prawej. Wszystko możesz poprawiać.</p></div>
      <div class="rzad"><button class="btn jasny" id="pmWroc">← Start</button><button class="btn jasny" id="pmUsun" title="Usuń ten pomysł">Usuń</button></div></div>
    <div class="pm-uklad">
      <div class="karta pm-czat">
        <div id="pmRozmowa" class="asystent-rozmowa"></div>
        <div id="pmPracuje" class="asystent-pracuje ukryte"><span class="kropki"><i></i><i></i><i></i></span> <span id="pmStatus">Claude myśli…</span></div>
        <div id="pmOpcje" class="chipy asystent-opcje"></div>
        <div class="asystent-pisz"><textarea id="pmPisz" rows="2" placeholder="Napisz odpowiedź albo poprawkę…"></textarea><button id="pmWyslij" class="btn">Wyślij</button></div>
      </div>
      <div id="pmProfil" class="pm-profil"></div>
    </div>`;
  $("#pmWroc").onclick = () => { PM.id = null; idz(0); };
  $("#pmUsun").onclick = () => {
    const m = modal(`<h2>Usunąć ten pomysł?</h2><p>Rozmowa i scenariusz zostaną skasowane na stałe (nie da się ich przywrócić).</p><div class="rzad"><button class="btn" id="tak">Usuń na stałe</button><button class="btn jasny" id="nie">Zostaw</button></div>`);
    $("#nie", m).onclick = zamknijModal;
    $("#tak", m).onclick = async () => { try { await api(`/api/pomysl/${PM.id}`, { method: "DELETE" }); zamknijModal(); PM.id = null; idz(0); toast("Pomysł usunięty"); } catch (e) { blad(e); } };
  };
  $("#pmWyslij").onclick = () => { const t = $("#pmPisz").value.trim(); if (!t) return toast("Napisz coś albo kliknij propozycję"); $("#pmPisz").value = ""; wyslijPomysl(t + przypomnienie(), t); };
  $("#pmPisz").onkeydown = (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); $("#pmWyslij").click(); } };
  for (const w of PM.rozmowa.wiadomosci) dymekPm(w.kto, w.tekst);
  rysujOpcjePm();
  ustawPracePm(PM.pracuje);
  rysujProfil();
}
function dymekPm(kto, tekst) {
  const box = $("#pmRozmowa"); if (!box) return;
  const d = document.createElement("div");
  d.className = "dymek " + (kto === "ty" ? "od-ciebie" : kto === "blad" ? "od-claude blad" : "od-claude");
  d.innerHTML = formatuj(tekst);
  box.appendChild(d); box.scrollTop = box.scrollHeight;
}
function rysujOpcjePm() {
  const box = $("#pmOpcje"); if (!box) return;
  const etap = PM.dane?.etap;
  if (etap === "gotowy" && !PM.pracuje) {
    box.innerHTML = `<button class="polecana" id="pmUtworzCzat">✓ Utwórz rolkę i przejdź do materiałów</button><button data-o="Chcę jeszcze coś poprawić">✎ Jeszcze poprawka</button>`;
    $("#pmUtworzCzat").onclick = utworzRolkeZPomyslu;
  } else box.innerHTML = PM.opcje.map((o, n) => `<button data-o="${esc(o)}" class="${n === 0 ? "polecana" : ""}">${n === 0 ? "★ " : ""}${esc(o)}</button>`).join("");
  box.querySelectorAll("[data-o]").forEach((b) => (b.onclick = () => wyslijPomysl(b.dataset.o + przypomnienie(), b.dataset.o)));
}
function ustawPracePm(t) {
  PM.pracuje = t;
  $("#pmPracuje")?.classList.toggle("ukryte", !t);
  if ($("#pmWyslij")) $("#pmWyslij").disabled = t;
  document.querySelectorAll("#pmProfil button").forEach((b) => (b.disabled = t));
}
async function odswiezPomyslZPliku() {
  if (!PM.id) return;
  try { const p = await api(`/api/pomysl/${PM.id}`); if (JSON.stringify(p.pomysl) !== JSON.stringify(PM.dane) || p.recenzja?.data !== PM.recenzja?.data || p.turniej?.data !== PM.turniej?.data || (p.historia?.wersje || []).length !== (PM.historia?.wersje || []).length) { PM.dane = p.pomysl; PM.recenzja = p.recenzja || null; PM.turniej = p.turniej || null; PM.historia = p.historia || null; rysujProfil(); } } catch {}
}
async function wyslijPomysl(prompt, widoczne) {
  if (PM.pracuje) return;
  // gotowy scenariusz (3 gotowe pomysły, plan tygodnia) bez rozmowy z Claude: pierwsza wiadomość dostaje pełny kontekst scenarzystki
  if (!PM.rozmowa.sesja && PM.dane?.etap && PM.dane.etap !== "profil" && !prompt.includes("JAK PROWADZISZ ROZMOWĘ")) prompt = promptPomyslu("gotowy", widoczne) + "\n\n" + prompt;
  if (!prompt.includes("REŻYSERIA MONTAŻU")) prompt += "\n\n" + S.start.rezyseria.prompt;
  const id = PM.id;
  PM.rozmowa.wiadomosci.push({ kto: "ty", tekst: widoczne });
  dymekPm("ty", widoczne);
  PM.opcje = []; rysujOpcjePm();
  ustawPracePm(true);
  $("#pmStatus").textContent = PM.rozmowa.sesja ? "Claude myśli i aktualizuje profil…" : "Claude czyta formaty, hooki i wyniki…";
  zapiszRozmowe();
  PM.odpytywanie = setInterval(odswiezPomyslZPliku, 2500);
  const naLinie = (l) => { if (l.startsWith("›") && $("#pmStatus")) $("#pmStatus").textContent = "Claude: " + l.slice(2, 70).replace(/Write: pomysl\.json/, "zapisuje profil rolki").replace(/Read: /, "czyta "); };
  let udaloSie = false;
  try {
    const z = await api("/api/claude", { method: "POST", body: { prompt, projekt: null, pomysl: id, sesja: PM.rozmowa.sesja } });
    const { kod, wynik, sesja } = await sledz(z, "Claude: nowa rolka", null, naLinie);
    if (PM.id !== id) return;
    udaloSie = kod === 0;
    if (sesja) PM.rozmowa.sesja = sesja;
    if (/failed to authenticate|oauth|not logged in|please run \/login/i.test(wynik || "")) { PM.rozmowa.wiadomosci.push({ kto: "blad", tekst: "Claude w terminalu nie jest zalogowany. Otwórz terminal, wpisz claude, potem /login i napisz tu jeszcze raz." }); }
    else if (kod !== 0 && !wynik) PM.rozmowa.wiadomosci.push({ kto: "blad", tekst: "Claude zakończył z błędem. Kliknij „Log” na dolnym pasku albo spróbuj jeszcze raz." });
    else {
      const linie = String(wynik || "").trim().split("\n");
      let opcje = [];
      const i = linie.findLastIndex((l) => /^\s*OPCJE\s*:/i.test(l));
      if (i >= 0) { opcje = linie[i].replace(/^\s*OPCJE\s*:/i, "").split("|").map((s) => s.trim()).filter(Boolean).slice(0, 4); linie.splice(i, 1); }
      if (/^\s*GOTOWE\s*\.?\s*$/i.test(linie.at(-1) || "")) linie.pop();
      PM.opcje = opcje;
      PM.rozmowa.wiadomosci.push({ kto: "claude", tekst: linie.join("\n").trim() || "(brak odpowiedzi)", opcje });
    }
  } catch (e) { PM.rozmowa.wiadomosci.push({ kto: "blad", tekst: "Nie udało się: " + (e.message || e) }); }
  clearInterval(PM.odpytywanie);
  if (PM.id !== id) return;
  const ost = PM.rozmowa.wiadomosci.at(-1);
  dymekPm(ost.kto, ost.tekst);
  await zapiszRozmowe();
  await odswiezPomyslZPliku();
  if (udaloSie && PM.id === id && PM.dane?.scenariusz?.some((w) => w && czasScenyRez(w) > 0 && !w.rezyseria?.zdarzenia.length)) {
    try {
      const z = await api(`/api/pomysl/${encodeURIComponent(id)}/rezyseria`, { method: "POST", body: { zakres: "braki" } });
      const { kod } = await sledz(z, "Uzupełniam reżyserię montażu");
      if (kod === 0 && PM.id === id) await odswiezPomyslZPliku();
    } catch (e) { blad(e); }
  }
  if (PM.id !== id) return;
  ustawPracePm(false);
  rysujOpcjePm();
  rysujProfil();
  await autoRecenzja();
}
// Recenzja od pierwszego pomysłu: gdy pojawia się pierwszy scenariusz (brak recenzja.json), panel sam odpala
// pętlę scripts/dopracuj.mjs (recenzentka + maks. 3 poprawki na rundę, zostaje tylko lepsza wersja), a potem
// pisze w rozmowie wynik. Poniżej PROG_SLABEJ uczciwie mówi, że rolka jest słaba, i proponuje inny kąt.
// Ponownie tylko, gdy zmienił się sam pomysł (temat/pomysł w profilu), nie przy drobnych poprawkach.
const CEL_AUTO = 85, PROG_SLABEJ = 70, autoZrobione = new Set();
const podpisPomyslu = (P) => JSON.stringify([P?.profil?.pomysl || "", P?.profil?.temat || ""]);
const ls = (k, v) => { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch { return null; } };
async function autoRecenzja() {
  const id = PM.id, P = PM.dane;
  if (!id || !opcja("autoRecenzja") || autoZrobione.has(id) || PM.pracuje || S.zadanie) return;
  if (!(P?.hooki || []).length || !(P?.scenariusz || []).length || P.etap === "gotowy") return;
  if (PM.recenzja) {
    const stary = ls("autoRec_" + id), aktualna = OCENA_SC && PM.recenzja.podpis === OCENA_SC.podpisScenariusza(P);
    if (aktualna || !stary || stary === podpisPomyslu(P)) return;
  }
  autoZrobione.add(id);
  ls("autoRec_" + id, podpisPomyslu(P));
  const przed = OCENA_SC ? OCENA_SC.ocenScenariusz(P).wynik : null, wersjiPrzed = (PM.historia?.wersje || []).length;
  ustawPracePm(true);
  $("#pmPracuje")?.classList.remove("ukryte");
  if ($("#pmStatus")) $("#pmStatus").textContent = "🎯 Recenzentka ocenia scenariusz jak widz, słabe miejsca od razu poprawiamy…";
  let kod = 1;
  try {
    const z = await api("/api/uruchom", { method: "POST", body: { skrypt: "dopracuj", args: [id, "--cel", String(CEL_AUTO)], projekt: null } });
    ({ kod } = await sledz(z, "🎯 Recenzja pierwszego scenariusza"));
  } catch {}
  if (PM.id !== id) return;
  try { wczytajPomysl(await api(`/api/pomysl/${id}`)); } catch {}
  ustawPracePm(false);
  const rec = PM.recenzja, tw = OCENA_SC ? OCENA_SC.ocenScenariusz(PM.dane) : null;
  let tekst, opcje;
  setTimeout(() => autoZrobione.delete(id), 0); // kolejna zmiana pomysłu może znów uruchomić recenzję
  if (!rec || !tw) {
    tekst = "🎯 Nie udało mi się dać scenariusza recenzentce (szczegóły w „Log” na dolnym pasku). Możesz spróbować ręcznie: „✦ Oceń jak widz” w karcie recenzentki.";
    opcje = PM.opcje;
  } else {
    const aktualna = rec.podpis === OCENA_SC.podpisScenariusza(PM.dane);
    const lacz = OCENA_SC.wynikLaczny(tw.wynik, aktualna ? rec.recenzja?.wynik : null);
    const zmiany = (PM.historia?.wersje || []).slice(wersjiPrzed).flatMap((v) => v.zmiany || []);
    const p = rec.przewidywanie || {};
    tekst = `🎯 Recenzentka sprawdziła scenariusz: **${lacz}/100** (twarda ocena ${tw.wynik}${przed != null && przed !== tw.wynik ? `, było ${przed}` : ""}, recenzentka ${rec.recenzja?.wynik ?? "?"}). Przewiduje, że po 3 s zostaje ok. ${p.zostaje_po_3s ?? "?"}% widzów, a do końca ogląda ${p.do_konca ?? "?"}%.`
      + (zmiany.length ? `\nPoprawiłam od razu:\n${zmiany.slice(0, 6).map((z) => `- ${z}`).join("\n")}` : "")
      + (lacz < PROG_SLABEJ ? `\n\nSzczerze: to wciąż słaba rolka. ${(rec.zarzuty || [])[0] ? `Główny zarzut: ${rec.zarzuty[0]} ` : ""}Wolę zaproponować mocniejszy kąt, niż kazać Ci nagrywać coś, co nie zatrzyma kciuka.` : "");
    opcje = lacz < PROG_SLABEJ ? ["Zaproponuj mocniejszy kąt tego tematu", "Zaproponuj zupełnie inny pomysł", "Zostańmy przy tym, poprawiam sama"] : ["Zatwierdzam, tworzymy rolkę", "Mocniejszy hook", "Krócej i szybciej"];
  }
  PM.opcje = opcje;
  PM.rozmowa.wiadomosci.push({ kto: "claude", tekst, opcje });
  dymekPm("claude", tekst);
  await zapiszRozmowe();
  rysujOpcjePm();
  rysujProfil();
}
function popraw(co) { const t = $("#pmPisz"); if (!t) return; t.value = co; t.focus(); t.setSelectionRange(t.value.length, t.value.length); }
// Twarda ocena scenariusza (scripts/ocena-scenariusza.mjs, ten sam moduł co CLI), liczona na żywo w przeglądarce.
let OCENA_SC = null;
import("/lib/ocena-scenariusza.mjs").then((m) => { OCENA_SC = m; if (PM.id && $("#pmProfil")) rysujProfil(); }).catch(() => {});
function kartaOceny(o) {
  if (!o) return "";
  const kolor = o.wynik >= 85 ? "var(--ok, #3c8d5a)" : o.wynik >= 65 ? "var(--akcent, #b07a6e)" : "var(--blad, #b4473b)";
  const zle = o.testy.filter((t) => !t.ok && !t.pominiety);
  const pom = o.testy.filter((t) => t.pominiety);
  return `<div class="karta pm-sekcja pm-ocena"><div class="naglowek"><h3>📊 Ocena scenariusza <b style="color:${kolor};font-size:1.3em">${o.wynik}</b><small class="podpowiedz">/100${o.czesciowa ? ` · częściowa (sprawdzone ${o.sprawdzone} z 100 pkt)` : ""}</small></h3>
      <div class="rzad">${(PM.dane?.scenariusz || []).length ? `<button class="btn maly" id="pmDopracuj" title="Pętla: ocena, maks. 3 poprawki, ponowna ocena. Do 3 rund, zostaje tylko lepsza wersja.">✦ Dopracuj do maksimum</button>` : ""}${zle.some((t) => t.naprawa) ? `<button class="btn maly" id="pmNaprawWszystko" title="Claude poprawi wszystkie niezaliczone testy naraz, najpierw hook">✦ Napraw wszystko</button>` : ""}</div></div>
    <div class="pm-ocena-grupy">${Object.values(o.grupy).map((g) => `<div title="${g.mozliwe < g.max ? `sprawdzone ${g.mozliwe} z ${g.max} pkt` : ""}"><small>${g.nazwa}</small><div class="pm-ocena-pasek"><i style="width:${g.mozliwe ? Math.round((g.pkt / g.mozliwe) * 100) : 0}%"></i></div><small>${String(r1(g.pkt)).replace(".", ",")} / ${g.mozliwe || g.max}</small></div>`).join("")}</div>
    ${zle.length ? `<ul class="pm-ocena-lista">${zle.map((t) => `<li><div><b>✗ ${esc(t.tekst)}</b> <small class="podpowiedz">${String(r1(t.pkt)).replace(".", ",")}/${t.waga}</small><br><small>${esc(t.zle)}</small></div>${t.naprawa ? `<button class="btn maly jasny" data-napraw="${esc(t.id)}">✦ Napraw</button>` : ""}</li>`).join("")}</ul>` : `<p class="podpowiedz">Wszystkie sprawdzone testy zaliczone.</p>`}
    ${o.uwagi.length ? `<div class="ramka info" style="margin-top:8px">${o.uwagi.map(esc).join("<br>")}</div>` : ""}
    ${pom.length ? `<p class="podpowiedz" style="margin-top:6px">Pominięte (brak danych): ${pom.map((t) => esc(t.tekst)).join(", ")}.</p>` : ""}</div>`;
}
// Krzywa napięcia (etap 5): energia fragmentów, role, bodźce, dołki, pętla z hooka + osobny wykres tempa mowy.
// Kolory ról: paleta referencyjna skilla dataviz, sloty 1-6 w stałej kolejności (walidacja: tryb jasny, PASS;
// kontrast < 3:1 dla 3 kolorów rekompensują etykiety w pasach i tabela scenariusza pod spodem).
const KOLOR_ROLI = { hook: "#2a78d6", kontekst: "#eb6834", wartosc: "#1baf7a", rehook: "#eda100", nagroda: "#e87ba4", cta: "#008300" };
const NAZWA_ROLI = { hook: "hook", kontekst: "kontekst", wartosc: "wartość", rehook: "ponowny hook", nagroda: "nagroda", cta: "CTA" };
function kartaKrzywej(ocena) {
  if (!OCENA_SC?.krzywaNapiecia || !(PM.dane?.scenariusz || []).length) return "";
  const k = OCENA_SC.krzywaNapiecia(PM.dane, ocena);
  if (!k) return "";
  PM.krzywa = k;
  const W = 440, L = 34, R = 8, x = (t) => L + (t / k.D) * (W - L - R), pl = (v) => String(v).replace(".", ",");
  const yE = (e) => 138 - (e - 1) * 20, yT0 = 228, yT = (t) => yT0 - Math.min(5, t) * 14;
  const krok = k.D > 40 ? 5 : 2, ticki = Array.from({ length: Math.floor(k.D / krok) + 1 }, (_, i) => i * krok);
  const F = k.fragmenty, dolki = F.filter((f) => f.dolek).length, zUwaga = F.filter((f) => f.uwagi.length).length;
  const linia = F.map((f, j) => `${j ? "L" : "M"}${x(f.od) + (j ? 0 : 0)},${yE(f.energia)} L${x(f.do)},${yE(f.energia)}`).join(" ");
  const svg = `<svg viewBox="0 0 ${W} 250" class="pm-krzywa-svg" role="img" aria-label="Krzywa napięcia rolki: energia i tempo mowy w czasie">
    ${[1, 3, 5].map((e) => `<line x1="${L}" x2="${W - R}" y1="${yE(e)}" y2="${yE(e)}" class="siatka"/><text x="${L - 6}" y="${yE(e) + 4}" class="os" text-anchor="end">${e}</text>`).join("")}
    ${F.filter((f) => f.dolek).map((f) => `<rect x="${x(f.od)}" y="${yE(5) - 4}" width="${x(f.do) - x(f.od)}" height="${yE(1) - yE(5) + 8}" class="dolek"/>`).join("")}
    ${F.map((f) => `<rect x="${x(f.od) + 1}" y="4" width="${Math.max(1, x(f.do) - x(f.od) - 2)}" height="14" rx="3" fill="${f.rola ? KOLOR_ROLI[f.rola] : "#d9d2cc"}"/>${x(f.do) - x(f.od) > (NAZWA_ROLI[f.rola] || "").length * 6.5 + 6 && f.rola ? `<text x="${(x(f.od) + x(f.do)) / 2}" y="14.5" class="rola-tekst" text-anchor="middle">${NAZWA_ROLI[f.rola]}</text>` : ""}`).join("")}
    ${k.petla ? `<path d="M${x(k.petla.od) + 4},28 L${x(k.petla.od) + 4},24 L${x(k.petla.do) + 4},24 L${x(k.petla.do) + 4},28" class="petla"/><text x="${(x(k.petla.od) + x(k.petla.do)) / 2}" y="34" class="os" text-anchor="middle">pętla z hooka → ${pl(k.petla.do)} s</text>` : `<text x="${W - R}" y="34" class="os blad-tekst" text-anchor="end">⚠ hook bez nagrody na końcu</text>`}
    <path d="${linia}" class="energia"/>
    ${F.map((f) => `<circle cx="${(x(f.od) + x(f.do)) / 2}" cy="${yE(f.energia)}" r="4" class="${f.energiaSzacowana ? "punkt szac" : "punkt"}"/>${f.bodziec ? `<text x="${x(f.od) + 3}" y="${yE(1) + 14}" class="bodziec">⚡</text>` : ""}${f.uwagi.length ? `<text x="${x(f.do) - 3}" y="${yE(5) - 8}" class="uwaga-ikona" text-anchor="end">⚠</text>` : ""}${f.dolek ? `<text x="${(x(f.od) + x(f.do)) / 2}" y="${yE(1) - 4}" class="os blad-tekst" text-anchor="middle">▼ dołek</text>` : ""}`).join("")}
    <rect x="${L}" y="${yT(k.tempoCel[1])}" width="${W - L - R}" height="${yT(k.tempoCel[0]) - yT(k.tempoCel[1])}" class="cel"/>
    <text x="${L - 6}" y="${(yT(k.tempoCel[0]) + yT(k.tempoCel[1])) / 2 + 4}" class="os" text-anchor="end">cel</text>
    <line x1="${L}" x2="${W - R}" y1="${yT0}" y2="${yT0}" class="os-linia"/>
    ${F.filter((f) => f.tempo != null).map((f) => { const poza = f.tempo < k.tempoCel[0] || f.tempo > k.tempoCel[1]; return `<rect x="${x(f.od) + 1}" y="${yT(f.tempo)}" width="${Math.max(1, x(f.do) - x(f.od) - 2)}" height="${yT0 - yT(f.tempo)}" rx="3" class="${poza ? "tempo poza" : "tempo"}"/>${poza ? `<text x="${(x(f.od) + x(f.do)) / 2}" y="${yT(f.tempo) - 3}" class="os blad-tekst" text-anchor="middle">${pl(f.tempo)}</text>` : ""}`; }).join("")}
    ${ticki.map((t) => `<text x="${x(t)}" y="244" class="os" text-anchor="middle">${t}s</text>`).join("")}
    ${F.map((f, j) => `<rect x="${x(f.od)}" y="0" width="${x(f.do) - x(f.od)}" height="234" class="traf" data-krzywa="${j}"/>`).join("")}
  </svg>`;
  return `<div class="karta pm-sekcja pm-krzywa"><div class="naglowek"><h3>📈 Krzywa napięcia <small class="podpowiedz">${dolki ? `${dolki} ${dolki === 1 ? "dołek" : "dołki"} energii · ` : ""}${zUwaga ? `${zUwaga} fragm. z uwagami · ` : ""}śr. tempo ${k.srednieTempo != null ? pl(k.srednieTempo) + " słowa/s" : "brak mowy"}</small></h3></div>
    <div class="pm-krzywa-legenda">${Object.keys(KOLOR_ROLI).map((r) => `<span><i style="background:${KOLOR_ROLI[r]}"></i>${NAZWA_ROLI[r]}</span>`).join("")}<span><i style="background:#d9d2cc"></i>bez roli</span><span>⚡ zmiana obrazu</span><span>⚠ uwagi z oceny</span><span><i class="kropka-szac"></i>energia szacowana</span></div>
    <small class="podpowiedz">Energia 1-5 (góra) · tempo mowy w słowach/s (dół), zielony pas = cel. Najedź na fragment, kliknij, żeby przejść do wiersza.</small>
    <div class="pm-krzywa-wrap">${svg}<div class="pm-krzywa-tip" hidden></div></div></div>`;
}
function podepnijKrzywa(box) {
  const wrap = $(".pm-krzywa-wrap", box); if (!wrap || !PM.krzywa) return;
  const tip = $(".pm-krzywa-tip", wrap), pl = (v) => String(v).replace(".", ",");
  wrap.querySelectorAll("[data-krzywa]").forEach((r) => {
    const f = PM.krzywa.fragmenty[Number(r.dataset.krzywa)];
    r.onmousemove = (e) => {
      const b = wrap.getBoundingClientRect();
      tip.innerHTML = `<b>${pl(f.od)}-${pl(f.do)} s · ${f.rola ? NAZWA_ROLI[f.rola] : "bez roli"}</b><br>energia ${f.energia}/5${f.energiaSzacowana ? " (szacowana)" : ""}${f.tempo != null ? ` · tempo ${pl(f.tempo)} słowa/s` : ""}${f.bodziec ? " · ⚡ zmiana obrazu" : ""}${f.dolek ? "<br>▼ dołek energii" : ""}${f.pytanie ? `<br>❓ ${esc(f.pytanie)}` : ""}${f.uwagi.length ? `<br>⚠ ${f.uwagi.map(esc).join("<br>⚠ ")}` : ""}<br><small>${esc(f.opis.slice(0, 120))}</small>`;
      tip.hidden = false;
      const lewo = Math.min(e.clientX - b.left + 12, b.width - 240);
      tip.style.left = Math.max(0, lewo) + "px"; tip.style.top = e.clientY - b.top + 14 + "px";
      wrap.querySelectorAll(".traf.aktywny").forEach((x) => x.classList.remove("aktywny")); r.classList.add("aktywny");
    };
    r.onmouseleave = () => { tip.hidden = true; r.classList.remove("aktywny"); };
    r.onclick = () => { const w = document.querySelector(`.pm-wiersz[data-wiersz="${f.i}"]`); if (w) { w.scrollIntoView({ behavior: "smooth", block: "center" }); w.classList.add("mignij"); setTimeout(() => w.classList.remove("mignij"), 1600); } };
  });
}
// Pętla „Dopracuj do maksimum” (scripts/dopracuj.mjs) i historia wersji (historia.json, cofanie przez serwer).
function roznice(stara, nowa) {
  const out = [], hs = (stara.hooki || []).find((h) => h.wybrany) || {}, hn = (nowa.hooki || []).find((h) => h.wybrany) || {};
  if (hs.tekst !== hn.tekst || hs.mowisz !== hn.mowisz) out.push(["Hook", `„${hs.tekst || ""}” / „${hs.mowisz || ""}”`, `„${hn.tekst || ""}” / „${hn.mowisz || ""}”`]);
  const s = stara.scenariusz || [], n = nowa.scenariusz || [];
  for (let i = 0; i < Math.max(s.length, n.length); i++) {
    const a = s[i], b = n[i], t = (w) => (w ? `${r1(w.od)}-${r1(w.do)} s: ${w.mowisz ? `„${w.mowisz}”` : w.co_widac || ""}${w.na_ekranie ? ` · 🪧 ${w.na_ekranie}` : ""}` : "(brak)");
    if (t(a) !== t(b)) out.push([`Wiersz ${i + 1}`, t(a), t(b)]);
  }
  return out;
}
function kartaHistorii() {
  const W = PM.historia?.wersje || [];
  if (!W.length) return "";
  return `<div class="karta pm-sekcja"><div class="naglowek"><h3>🕘 Poprzednie wersje <small class="podpowiedz">${W.length}</small></h3></div>
    <ol class="pm-turniej-lista">${W.map((v, i) => ({ v, i })).reverse().map(({ v, i }) => { const nast = W[i + 1]?.wersja || PM.dane; const r = roznice(v.wersja, nast); return `<li><div><b>${esc(v.zrodlo || "wersja")}${v.wynik != null ? ` · ${v.wynik}${v.nastepna != null ? ` → ${v.nastepna}` : ""}/100` : ""}</b><small>${new Date(v.data).toLocaleString("pl-PL")}</small>${(v.zmiany || []).length ? `<ul class="pm-lista">${v.zmiany.map((z) => `<li><small>${esc(z)}</small></li>`).join("")}</ul>` : ""}
      ${r.length ? `<details><summary class="podpowiedz">Różnice (${r.length})</summary><div class="pm-roznice">${r.map(([g, a, b]) => `<div><small><b>${esc(g)}</b></small><del>${esc(a)}</del><ins>${esc(b)}</ins></div>`).join("")}</div></details>` : ""}</div>
      <button class="btn maly jasny" data-cofnij="${i}" title="Przywróć hooki, scenariusz i materiały z tej wersji (obecna też trafi do historii)">↶ Cofnij do tej wersji</button></li>`; }).join("")}</ol></div>`;
}
// Turniej hooków (scripts/turniej-hookow.mjs): 12 nowych + obecne, odsiew, dwie sędziny, Borda.
function kartaTurnieju() {
  if (!PM.dane?.profil?.pomysl && !PM.dane?.profil?.temat) return "";
  const T = PM.turniej, pl = (x) => String(x).replace(".", ",");
  const przycisk = `<button class="btn maly" id="pmTurniej" title="Claude pisze 12 nowych hooków (6 typów), startują też obecne, twarde testy odsiewają słabe, dwie niezależne sędziny układają ranking. Ok. 1-2 min, ok. 0,3 USD.">${T ? "↻ Nowy turniej" : "🏆 Turniej hooków"}</button>`;
  if (!T) return `<div class="karta pm-sekcja"><div class="naglowek"><div><h3>🏆 Turniej hooków</h3><p class="podpowiedz">12 nowych hooków w 6 typach kontra obecne. Wygrywają 3 najlepsze różnych typów, drugi idzie na test jako wariant B.</p></div>${przycisk}</div></div>`;
  const zw = new Set(T.zwyciezcy);
  return `<div class="karta pm-sekcja pm-turniej"><div class="naglowek"><h3>🏆 Turniej hooków <small class="podpowiedz">${T.ranking.length} w finale, ${T.odsiani.length} odsianych · ${new Date(T.data).toLocaleString("pl-PL")}</small></h3><div class="rzad">${przycisk}<button class="btn maly" id="pmWstawZwyciezcow" title="Scenarzystka podmieni hooki na 3 zwycięzców (pierwszy wybrany, drugi jako wariant B) i dopasuje pierwszy wiersz scenariusza i teleprompter">✦ Wstaw 3 najlepsze</button></div></div>
    <ol class="pm-turniej-lista">${T.ranking.map((k) => `<li class="${zw.has(k.id) ? "zwyciezca" : ""}"><div><span class="chip">${esc(k.typ)}</span>${k.zrodlo === "obecny" ? ' <span class="chip">obecny</span>' : ""}${zw.has(k.id) ? ` <span class="chip ok">🏆${k.id === T.wariant_b ? " wariant B" : ""}</span>` : ""}
      <b>${esc(k.tekst).replace(/\*(.+?)\*/g, "<em>$1</em>")}</b><small>🎙️ „${esc(k.mowisz)}”</small><small>👁️ ${esc(k.wizual)}</small><small>🎯 ${pl(k.ocena)}/10 · miejsca u sędzin: ${k.miejsca.join(" i ")}${k.zgodnosc >= 3 ? " (różnią się)" : ""} · ${esc(k.zdania[0] || "")}</small></div>
      <button class="btn maly jasny" data-wybierz-hook="${k.id}" title="Ten hook jako wybrany">Wybierz</button></li>`).join("")}</ol>
    ${T.odsiani.length ? `<details style="margin-top:8px"><summary class="podpowiedz">Odsiani (${T.odsiani.length})</summary><ul class="pm-lista">${T.odsiani.map((k) => `<li><small>„${esc(k.tekst)}” (${esc(k.typ)}${k.zrodlo === "obecny" ? ", obecny" : ""}): ${esc(k.zle.join(", ") || "słabszy w twardych testach")}</small></li>`).join("")}</ul></details>` : ""}</div>`;
}
function wstawHooki(ids, opis) {
  const T = PM.turniej, h = ids.map((id) => T.ranking.find((k) => k.id === id)).filter(Boolean);
  const nowe = h.map((k, i) => ({ tekst: k.tekst, mowisz: k.mowisz, wizual: k.wizual, dzwiek: k.dzwiek, typ: k.typ, wybrany: i === 0, ...(i === 0 && h[1] ? { wariant_b: h[1].mowisz } : {}) }));
  wyslijPomysl(`Turniej hooków: ${opis}. Zastąp pole "hooki" dokładnie tymi hookami (bez zmian w tekstach):\n${JSON.stringify(nowe, null, 1)}\nPotem dopasuj pierwszy wiersz scenariusza (hook: co widać, mowa, tekst na ekranie, maks. 2 s) i teleprompter materiału z hookiem. Do teleprompteru dodaj drugą kwestię z "wariant_b" (kiedy: "Hook, wariant B do testu"). Reszty scenariusza nie zmieniaj, fragmentów z "zablokowany": true nie ruszaj.` + przypomnienie(), `🏆 ${opis}`);
}
// Recenzentka AI (scripts/recenzent.mjs): osobna sesja Claude ocenia hook i dynamikę jak widz.
function kartaRecenzji(rec, ocena) {
  if (!OCENA_SC || !ocena || !(PM.dane?.hooki || []).length) return "";
  const aktualna = rec && rec.podpis === OCENA_SC.podpisScenariusza(PM.dane);
  const przycisk = (t) => `<button class="btn maly" id="pmRecenzja" title="Osobna sesja Claude (nie autorka) ocenia hook i tempo, 3 wirtualne widzki mówią, kiedy by przewinęły. Ok. 1 min.">${t}</button>`;
  if (!rec) return `<div class="karta pm-sekcja"><div class="naglowek"><div><h3>🎯 Recenzentka AI</h3><p class="podpowiedz">Oceni hook jak widz: zatrzymanie kciuka, ciekawość, „to o mnie”, autentyczność. Trzy widzki powiedzą, w której sekundzie by przewinęły.</p></div>${przycisk("✦ Oceń jak widz")}</div></div>`;
  const w = rec.recenzja || {}, pl = (x) => String(x).replace(".", ",");
  const lacz = OCENA_SC.wynikLaczny(ocena.wynik, w.wynik);
  return `<div class="karta pm-sekcja pm-recenzja"><div class="naglowek"><h3>🎯 Recenzentka AI <b style="font-size:1.3em">${w.wynik}</b><small class="podpowiedz">/100 · łącznie z twardą oceną <b>${lacz}</b>${aktualna ? "" : " · <span style=\"color:var(--uwaga)\">nieaktualna, scenariusz się zmienił</span>"}</small></h3>${przycisk(aktualna ? "↻ Oceń ponownie" : "✦ Oceń ponownie")}</div>
    <p class="podpowiedz">Przewidywanie: <b>${rec.przewidywanie?.zostaje_po_3s}%</b> zostaje po 3 s, <b>${rec.przewidywanie?.do_konca}%</b> ogląda do końca · hook ${w.hook}/100${w.dynamika != null ? ` · dynamika ${w.dynamika}/100` : ""}</p>
    <div class="pm-ocena-grupy pm-kryteria">${OCENA_SC.KRYTERIA_HOOKA.map(([k, n]) => { const x = rec.hook?.kryteria?.[k] || {}; return `<div title="${esc(x.dlaczego || "")}"><small>${n}</small><div class="pm-ocena-pasek"><i style="width:${(x.ocena || 0) * 10}%"></i></div><small>${x.ocena ?? "?"}/10</small></div>`; }).join("")}</div>
    <div class="pm-widzki">${(rec.widzki || []).map((v) => `<div><b>${esc(v.kto)}</b> <span class="chip ${v.przewija_w_sekundzie == null ? "ok" : "obow"}">${v.przewija_w_sekundzie == null ? "do końca" : `przewija w ${pl(v.przewija_w_sekundzie)} s`}</span><small>„${esc(v.dlaczego)}”</small></div>`).join("")}</div>
    <h4 style="margin:12px 0 6px">Zarzuty</h4><ol class="pm-lista">${(rec.zarzuty || []).map((z) => `<li>${esc(z)}</li>`).join("")}</ol>
    ${(rec.poprawki || []).length ? `<h4 style="margin:12px 0 6px">Poprawki</h4><ul class="pm-ocena-lista">${rec.poprawki.map((p, i) => `<li><div><b>${esc(p.co)}</b><br><small>${esc(p.dlaczego)}</small><br><small>np.: ${esc(p.przyklad)}</small>${p.uwaga ? `<br><small style="color:var(--blad)">⚠ ${esc(p.uwaga)}</small>` : ""}</div><button class="btn maly jasny" data-zastosuj="${i}">✦ Zastosuj</button></li>`).join("")}</ul>` : ""}
    <p class="podpowiedz" style="margin-top:6px">${new Date(rec.data).toLocaleString("pl-PL")} · ${rec.czas_s} s</p></div>`;
}
function rysujProfil() {
  const box = $("#pmProfil"); if (!box) return;
  const ocena = OCENA_SC && ((PM.dane?.hooki || []).length || (PM.dane?.scenariusz || []).length) ? OCENA_SC.ocenScenariusz(PM.dane) : null;
  const uwagiWiersza = (i) => (ocena ? ocena.testy.filter((t) => !t.ok && !t.pominiety && (t.gdzie || []).includes(i)) : []);
  const P = PM.dane || {}, pr = P.profil || {};
  const etapNr = Math.max(0, ETAPY_PM.findIndex(([k]) => k === (P.etap || "profil")));
  const wypelnione = POLA_PROFILU.filter(([k]) => String(pr[k] || "").trim()).length;
  const sek = (tytul, tresc, poprawka, pusto) => `<div class="karta pm-sekcja"><div class="naglowek"><h3>${tytul}</h3>${poprawka ? `<button class="btn maly jasny" data-popraw="${esc(poprawka)}">✎ Popraw</button>` : ""}</div>${tresc || `<p class="podpowiedz">${pusto}</p>`}</div>`;
  const sc = P.scenariusz || [], mat = P.materialy || [];
  const dl = sc.length ? Math.max(...sc.map((w) => Number(w.do) || 0)) : 0;
  const gotowe = (P.hooki || []).length && sc.length && mat.length;
  box.innerHTML = `
    <div class="pm-etapy">${ETAPY_PM.map(([k, n], i) => `<span class="${i < etapNr ? "zrobiony" : i === etapNr ? "aktywny" : ""}"><b>${i + 1}</b>${n}</span>`).join("")}</div>
    ${kartaOceny(ocena)}
    ${kartaRecenzji(PM.recenzja, ocena)}
    ${kartaHistorii()}
    ${sek(`Profil rolki <small class="podpowiedz">${wypelnione}/${POLA_PROFILU.length}</small>`, `<dl class="pm-pola">${POLA_PROFILU.map(([k, n]) => `<div class="${String(pr[k] || "").trim() ? "jest" : ""}"><dt>${n}</dt><dd>${esc(pr[k] || "…")}</dd></div>`).join("")}</dl>${P.uwagi ? `<div class="ramka info" style="margin-top:10px">${esc(P.uwagi)}</div>` : ""}`, "Popraw profil: ", "")}
    ${sek("🪝 Hook (pierwsza sekunda)", (P.hooki || []).length ? `<div class="pm-hooki">${P.hooki.map((h, i) => `<button class="pm-hook ${h.wybrany ? "wybrany" : ""}" data-hook="${i}"><span class="chip">${esc(h.typ || "hook")}</span>${(() => { const x = PM.recenzja?.hooki_ranking?.find((r) => r.indeks === i); return x ? `<span class="chip ${x.ocena >= 7 ? "ok" : x.ocena <= 4 ? "obow" : ""}" title="${esc(x.zdanie)}">🎯 ${x.ocena}/10</span>` : ""; })()}<b>${esc(h.tekst).replace(/\*(.+?)\*/g, "<em>$1</em>")}</b>${h.mowisz ? `<small>🎙️ ${esc(h.mowisz)}</small>` : ""}${h.wizual ? `<small>👁️ ${esc(h.wizual)}</small>` : ""}${h.wybrany ? '<i class="pm-wybrany">✓ wybrany</i>' : '<i class="pm-wybierz">wybierz</i>'}</button>`).join("")}</div>` : "", "Daj mi inne hooki, mocniejsze: ", "Hooki pojawią się, gdy profil będzie gotowy.")}
    ${kartaTurnieju()}
    ${sek("🧲 Jak utrzymamy uwagę do końca", (P.utrzymanie || []).length ? `<ul class="pm-lista">${P.utrzymanie.map((u) => `<li>${esc(u)}</li>`).join("")}</ul>${Object.values(P.efekty || {}).some(Boolean) ? `<div class="przepis-efekty" title="Efekty montażu, które włączę w rolce">${Object.entries(P.efekty).filter(([, v]) => v).map(([k]) => `<span title="${esc(nazwaEfektu(k))}">${ikonaEfektu(k)} <small>${esc(nazwaEfektu(k))}</small></span>`).join("")}</div>` : ""}` : "", "Popraw utrzymanie uwagi: ", "Plan pojawi się razem ze scenariuszem.")}
    ${kartaKrzywej(ocena)}
    ${sek(`🎬 Scenariusz ${dl ? `<small class="podpowiedz">${r1(dl)} s</small>` : ""}`, sc.length ? `<div id="scenariuszPomyslu">${pasekRezyserii(sc)}<div class="pm-scenariusz">${sc.map((w, i) => { const uw = uwagiWiersza(i); return `<div class="pm-wiersz ${uw.length ? "pm-wiersz-uwaga" : ""}" data-wiersz="${i}"><span class="pm-czas">${r1(w.od)}-${r1(w.do)} s${w.rola ? `<br><span class="chip">${esc(w.rola)}</span>` : ""}</span><div><b>${esc(w.co_widac)}</b>${w.na_ekranie ? `<small>🪧 ${esc(w.na_ekranie)}</small>` : ""}${w.mowisz ? `<small>🎙️ „${esc(w.mowisz)}”</small>` : ""}${w.bodziec ? `<small>⚡ ${esc(w.bodziec)}</small>` : ""}${w.pytanie_widza ? `<small>❓ ${esc(w.pytanie_widza)}</small>` : ""}${uw.length ? `<small class="pm-uwaga-wiersza">⚠ ${uw.map((t) => esc(t.tekst)).join(" · ")}</small>` : ""}</div>${w.material ? `<span class="chip">${esc(w.material)}</span>` : ""}${rezyseriaSceny(w, i)}</div>`; }).join("")}</div></div>` : "", "Popraw scenariusz: ", "Scenariusz sekunda po sekundzie pojawi się po pytaniach.")}
    ${sek(`📦 Co mi dostarczasz <small class="podpowiedz">${mat.length ? `${mat.filter((x) => x.obowiazkowy !== false).length} obowiązkowe, ${mat.filter((x) => x.obowiazkowy === false).length} dodatkowe` : ""}</small>`, mat.length ? `<div class="pm-materialy">${mat.map((x) => kartaMaterialu(x)).join("")}</div>` : "", "Popraw listę materiałów: ", "Lista ujęć i zdjęć do nagrania pojawi się razem ze scenariuszem.")}
    ${gotowe ? `<div class="karta pm-utworz"><div><h3>${P.etap === "gotowy" ? "Zatwierdzone ✓" : "Podoba się?"}</h3><p class="podpowiedz">${P.etap === "gotowy" ? "Utwórz rolkę: scenariusz trafi do briefu, a lista materiałów do kroku Nagrania, gdzie wgrasz pliki." : "Możesz zatwierdzić od razu albo najpierw poprosić o poprawki w rozmowie."}</p></div><button class="btn duzy" id="pmUtworz">✓ Utwórz rolkę</button></div>` : ""}`;
  box.querySelectorAll("[data-popraw]").forEach((b) => (b.onclick = () => popraw(b.dataset.popraw)));
  box.querySelectorAll("[data-napraw]").forEach((b) => (b.onclick = () => { const t = ocena.testy.find((x) => x.id === b.dataset.napraw); if (t) wyslijPomysl(`Ocena scenariusza: niezaliczony test „${t.tekst}” (${t.zle}). Popraw tylko to: ${t.naprawa}` + przypomnienie(), `✦ Napraw: ${t.tekst}`); }));
  podepnijKrzywa(box);
  const dp = $("#pmDopracuj", box); if (dp) dp.onclick = () => { const m = modal(`<h2>✦ Dopracuj do maksimum</h2><p>Claude w pętli ocenia scenariusz (twarda ocena + recenzentka), wprowadza maks. 3 najważniejsze poprawki (najpierw hook) i ocenia znowu. Do 3 rund, kończy przy 90+ albo gdy poprawa jest mniejsza niż 3 pkt. Zostaje tylko wersja, która wyszła lepiej, a każda poprzednia trafia do historii (możesz cofnąć).</p><p class="podpowiedz">Trwa ok. 3-7 min, koszt ok. 0,5-1,5 USD z konta Claude Code. W tym czasie nie pisz w rozmowie (pętla przerwie się, żeby niczego nie nadpisać). Fragmenty i hooki z „zablokowany” zostają bez zmian.</p><div class="rzad"><button class="btn" id="tak">Zaczynamy</button><button class="btn jasny" id="nie">Anuluj</button></div>`); $("#nie", m).onclick = zamknijModal; $("#tak", m).onclick = () => { zamknijModal(); uruchom("dopracuj", [PM.id], { opis: "Dopracowanie scenariusza (pętla ocen i poprawek)", po: async () => { try { wczytajPomysl(await api(`/api/pomysl/${PM.id}`)); rysujProfil(); } catch {} } }); }; };
  box.querySelectorAll("[data-cofnij]").forEach((b) => (b.onclick = async () => { try { wczytajPomysl(await api(`/api/pomysl/${PM.id}/cofnij`, { method: "POST", body: { i: Number(b.dataset.cofnij) } })); rysujProfil(); toast("Przywrócono wersję"); } catch (e) { blad(e); } }));
  const tu = $("#pmTurniej", box); if (tu) tu.onclick = () => uruchom("turniej-hookow", [PM.id], { opis: "Turniej hooków (12 kandydatów, dwie sędziny)", po: async () => { try { const p = await api(`/api/pomysl/${PM.id}`); PM.turniej = p.turniej || null; rysujProfil(); } catch {} } });
  const wz = $("#pmWstawZwyciezcow", box); if (wz) wz.onclick = () => wstawHooki(PM.turniej.zwyciezcy, "wstaw 3 zwycięzców");
  box.querySelectorAll("[data-wybierz-hook]").forEach((b) => (b.onclick = () => { const id = Number(b.dataset.wybierzHook); const reszta = PM.turniej.zwyciezcy.filter((x) => x !== id); wstawHooki([id, ...reszta].slice(0, 3), `wybrany hook z miejsca ${PM.turniej.ranking.find((k) => k.id === id)?.miejsce}`); }));
  const rc = $("#pmRecenzja", box); if (rc) rc.onclick = () => uruchom("recenzent", [PM.id], { opis: "Recenzentka AI ocenia scenariusz", po: async () => { try { const p = await api(`/api/pomysl/${PM.id}`); PM.recenzja = p.recenzja || null; rysujProfil(); } catch {} } });
  box.querySelectorAll("[data-zastosuj]").forEach((b) => (b.onclick = () => { const p = PM.recenzja.poprawki[Number(b.dataset.zastosuj)]; wyslijPomysl(`Recenzentka zaproponowała poprawkę: ${p.co}\nDlaczego: ${p.dlaczego}\nPrzykład: ${p.przyklad}\nWprowadź ją po swojemu (styl ${OS().dop}, bez obietnic efektu), zmieniaj tylko to, nie ruszaj fragmentów z "zablokowany": true.` + przypomnienie(), `✦ Zastosuj: ${p.co}`); }));
  const nw = $("#pmNaprawWszystko", box); if (nw) nw.onclick = () => wyslijPomysl(OCENA_SC.poleceniePoprawek(ocena) + przypomnienie(), `✦ Napraw wszystko (ocena ${ocena.wynik}/100)`);
  box.querySelectorAll("[data-hook]").forEach((b) => (b.onclick = () => { PM.dane.hooki.forEach((h, i) => (h.wybrany = i === Number(b.dataset.hook))); zapiszPomysl(); rysujProfil(); }));
  box.querySelectorAll("[data-niemam]").forEach((b) => (b.onclick = () => { const x = mat.find((m) => m.id === b.dataset.niemam); wyslijPomysl(`Nie mam materiału ${x.id} (${x.opis}) i nie dam rady go nagrać. Zamień go na coś łatwego i popraw scenariusz.` + przypomnienie(), `Nie mam ${x.id}: ${x.opis}`); }));
  const u = $("#pmUtworz", box); if (u) u.onclick = utworzRolkeZPomyslu;
  podepnijKartyMat(box, mat);
  const idRezyserii = PM.id;
  const urlRezyserii = `/api/pomysl/${encodeURIComponent(idRezyserii)}`;
  podepnijRezyserie($("#scenariuszPomyslu", box), {
    url: urlRezyserii, dokument: () => PM.id === idRezyserii ? PM.dane : null,
    odswiez: async (otwarte) => {
      const p = await api(urlRezyserii);
      if (PM.id !== idRezyserii) return;
      PM.dane = p.pomysl;
      rysujProfil();
      otworzRezyserie(otwarte, $("#scenariuszPomyslu"));
    },
  });
  ustawPracePm(PM.pracuje);
}
// Kwestie do powiedzenia w materiale (teleprompter). Claude pisze [{kiedy, tekst}], tolerujemy też same napisy.
const kwestie = (x) => (Array.isArray(x.teleprompter) ? x.teleprompter : x.teleprompter ? [x.teleprompter] : []).map((k) => (typeof k === "string" ? { kiedy: "", tekst: k } : { kiedy: k.kiedy || "", tekst: k.tekst || "" })).filter((k) => k.tekst.trim());
const nazwaPlikuMat = (x) => { const n = String(x.nazwa_pliku || `${x.id}_${x.typ || "material"}`).normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/ł/g, "l").replace(/Ł/g, "L").replace(/\.[a-z0-9]{2,4}$/i, "").replace(/[^\w-]+/g, "_"); return n.startsWith(x.id) ? n : `${x.id}_${n}`; };
// Pliki materiału: zapisane przy wgrywaniu + to, co leży w raw/ z prefiksem M1_ (np. przeniesione z inboxu pod dobrą nazwą).
// Uwagi o obrazie z normalizacji (proxy/.obraz.json): raw/M2_x.mov -> proxy/M2_x.mp4
function uwagiObrazu(relP) { const n = relP.split("/").pop().replace(/\.[^.]+$/, ""); return S.projekt?.obraz?.[`proxy/${n}.mp4`]?.uwagi || []; }
function plikiMaterialu(x) {
  const zRaw = (S.projekt?.pliki?.raw || []).filter((f) => f.nazwa.toLowerCase().startsWith(x.id.toLowerCase() + "_")).map((f) => "raw/" + f.nazwa);
  return [...new Set([...(x.pliki || []), ...zRaw])];
}
function kartaMaterialu(x, wProjekcie = false) {
  const [ik, typ] = TYPY_MAT[x.typ] || ["🎞️", x.typ || "materiał"];
  const pliki = wProjekcie ? plikiMaterialu(x) : [];
  const kw = kwestie(x);
  return `<div class="pm-mat ${pliki.length ? "dostarczony" : ""}" data-mat="${esc(x.id)}">
    <div class="pm-mat-ikona">${ik}<b>${esc(x.id)}</b></div>
    <div class="pm-mat-opis"><div class="rzad" style="gap:6px"><b>${esc(x.opis)}</b>${x.obowiazkowy === false ? '<span class="chip">dodatkowy</span>' : '<span class="chip obow">obowiązkowy</span>'}</div>
      <small>${esc(typ)}${x.czas ? ` · ${esc(x.czas)}` : ""}</small>${x.jak ? `<p>📌 ${esc(x.jak)}</p>` : ""}
      <p class="pm-nazwa">📁 Nazwij plik: <button class="pm-kopiuj" data-kopiuj="${esc(nazwaPlikuMat(x))}" title="Kliknij, żeby skopiować nazwę">${esc(nazwaPlikuMat(x))}</button></p>
      ${kw.length ? `<div class="pm-kwestie"><div class="rzad" style="justify-content:space-between;gap:8px"><b>🎙️ Co mówisz (${kw.length === 1 ? "1 kwestia" : `${kw.length} kwestie`})</b><button class="btn maly" data-teleprompter="${esc(x.id)}">📜 Teleprompter</button></div><ol>${kw.map((k) => `<li>${k.kiedy ? `<small>${esc(k.kiedy)}</small>` : ""}„${esc(k.tekst)}”</li>`).join("")}</ol></div>` : ""}
      ${wProjekcie ? `<div class="pm-mat-pliki">${pliki.map((p) => { const u = uwagiObrazu(p); return `<span class="chip ${u.length ? "obow" : "ok"}" title="${esc(u.join(", ") || "obraz OK")}">${u.length ? "⚠" : "✓"} ${esc(p.split("/").pop())}${u.length ? `: ${esc(u.join(", "))}` : ""}</span>`; }).join("")}</div>` : ""}</div>
    <div class="pm-mat-akcje">${wProjekcie ? `<label class="btn maly ${pliki.length ? "jasny" : ""}">${pliki.length ? "+ Jeszcze plik" : "⬆ Wgraj"}<input type="file" accept="video/*,image/*" multiple hidden data-wgraj="${esc(x.id)}"></label>` : `<button class="btn maly jasny" data-niemam="${esc(x.id)}" title="Claude zamieni ten materiał na coś łatwiejszego">Nie mam tego</button>`}</div>
  </div>`;
}
function podepnijKartyMat(root, lista) {
  root.querySelectorAll("[data-kopiuj]").forEach((b) => (b.onclick = async () => { try { await navigator.clipboard.writeText(b.dataset.kopiuj); toast(`Skopiowano: ${b.dataset.kopiuj}`, 1500); } catch { toast(b.dataset.kopiuj, 3000); } }));
  root.querySelectorAll("[data-teleprompter]").forEach((b) => (b.onclick = () => { const x = lista.find((m) => m.id === b.dataset.teleprompter); if (x) teleprompter(x, lista); }));
}
// Teleprompter: pełny ekran, duże litery, przewijanie z regulacją tempa, lustro, kwestia po kwestii.
function teleprompter(startMat, lista) {
  const zMowa = lista.filter((m) => kwestie(m).length);
  const kolejka = zMowa.flatMap((m) => kwestie(m).map((k, i) => ({ mat: m, k, i, ile: kwestie(m).length })));
  let nr = Math.max(0, kolejka.findIndex((q) => q.mat.id === startMat.id));
  const ust = (() => { try { return { tempo: 40, rozmiar: 64, lustro: false, ...JSON.parse(localStorage.getItem("teleprompter") || "{}") }; } catch { return { tempo: 40, rozmiar: 64, lustro: false }; } })();
  const zapiszUst = () => { try { localStorage.setItem("teleprompter", JSON.stringify(ust)); } catch {} };
  let gra = false, ramka = null, ost = 0;
  const tp = document.createElement("div");
  tp.className = "tp";
  tp.innerHTML = `<div class="tp-gora"><div><b id="tpMat"></b><small id="tpKiedy"></small></div><div class="rzad"><span id="tpNr"></span><button class="tp-btn" id="tpX" title="Zamknij (Esc)">✕</button></div></div>
    <div class="tp-okno" id="tpOkno"><div class="tp-linia"></div><div class="tp-tekst" id="tpTekst"></div></div>
    <div class="tp-dol">
      <button class="tp-btn" id="tpPrev" title="Poprzednia kwestia (←)">⏮</button>
      <button class="tp-btn duzy" id="tpGraj" title="Start / pauza (spacja)">▶</button>
      <button class="tp-btn" id="tpNext" title="Następna kwestia (→)">⏭</button>
      <label>Tempo <input type="range" id="tpTempo" min="10" max="120" value="${ust.tempo}"></label>
      <label>Litery <input type="range" id="tpRozmiar" min="32" max="120" value="${ust.rozmiar}"></label>
      <label class="tp-check"><input type="checkbox" id="tpLustro" ${ust.lustro ? "checked" : ""}> Lustro</label>
      <small>spacja: start/pauza · ↑↓: przewiń · ←→: kwestia</small>
    </div>`;
  document.body.appendChild(tp);
  document.body.style.overflow = "hidden";
  const okno = $("#tpOkno", tp), tekst = $("#tpTekst", tp);
  const styl = () => { tekst.style.fontSize = ust.rozmiar + "px"; tekst.style.transform = ust.lustro ? "scaleX(-1)" : ""; };
  const pokazKw = () => {
    const q = kolejka[nr];
    $("#tpMat", tp).textContent = `${q.mat.id} · ${nazwaPlikuMat(q.mat)}`;
    $("#tpKiedy", tp).textContent = `${q.k.kiedy ? q.k.kiedy + " · " : ""}kwestia ${q.i + 1}/${q.ile}`;
    $("#tpNr", tp).textContent = `${nr + 1} / ${kolejka.length}`;
    tekst.innerHTML = `<p>${esc(q.k.tekst).replace(/\*(.+?)\*/g, "<em>$1</em>")}</p><p class="tp-koniec">■ koniec kwestii${nr < kolejka.length - 1 ? " · → następna" : ""}</p>`;
    okno.scrollTop = 0; pauza(); styl();
  };
  // Pozycja trzymana jako liczba z ułamkiem: przy wolnym tempie ruch na klatkę < 1 px i scrollTop by go zaokrąglił do zera.
  let poz = 0;
  const krok = (t) => { if (!gra) return; const dt = ost ? Math.min(0.1, (t - ost) / 1000) : 0; ost = t; poz += ust.tempo * dt; okno.scrollTop = poz; if (poz >= okno.scrollHeight - okno.clientHeight - 1) return pauza(); ramka = requestAnimationFrame(krok); };
  okno.addEventListener("scroll", () => { if (!gra) poz = okno.scrollTop; });
  function graj() { gra = true; ost = 0; poz = okno.scrollTop; $("#tpGraj", tp).textContent = "⏸"; ramka = requestAnimationFrame(krok); }
  function pauza() { gra = false; cancelAnimationFrame(ramka); $("#tpGraj", tp).textContent = "▶"; }
  const zamknij = () => { pauza(); tp.remove(); document.body.style.overflow = ""; document.removeEventListener("keydown", klawisze); };
  const idzKw = (d) => { nr = Math.min(kolejka.length - 1, Math.max(0, nr + d)); pokazKw(); };
  function klawisze(e) {
    if (e.key === "Escape") zamknij();
    else if (e.key === " ") { e.preventDefault(); gra ? pauza() : graj(); }
    else if (e.key === "ArrowRight") idzKw(1);
    else if (e.key === "ArrowLeft") idzKw(-1);
    else if (e.key === "ArrowDown") { e.preventDefault(); okno.scrollTop += 80; }
    else if (e.key === "ArrowUp") { e.preventDefault(); okno.scrollTop -= 80; }
  }
  document.addEventListener("keydown", klawisze);
  $("#tpX", tp).onclick = zamknij;
  $("#tpGraj", tp).onclick = () => (gra ? pauza() : graj());
  $("#tpPrev", tp).onclick = () => idzKw(-1);
  $("#tpNext", tp).onclick = () => idzKw(1);
  $("#tpTempo", tp).oninput = (e) => { ust.tempo = Number(e.target.value); zapiszUst(); };
  $("#tpRozmiar", tp).oninput = (e) => { ust.rozmiar = Number(e.target.value); styl(); zapiszUst(); };
  $("#tpLustro", tp).onchange = (e) => { ust.lustro = e.target.checked; styl(); zapiszUst(); };
  okno.onclick = () => (gra ? pauza() : graj());
  pokazKw();
}
async function utworzRolkeZPomyslu() {
  if (PM.pracuje) return;
  try {
    const { projekt } = await api(`/api/pomysl/${PM.id}/utworz`, { method: "POST" });
    PM.id = null;
    toast("Rolka utworzona. Teraz wgraj materiały z listy.", 4000);
    await otworz(projekt, 2);
  } catch (e) { blad(e); }
}
async function listaPomyslow() {
  const box = $("#pomyslyLista"); if (!box) return;
  const l = await api("/api/pomysly").catch(() => []);
  box.innerHTML = l.length ? `<h3 style="margin-top:8px">Pomysły w trakcie rozmowy</h3><div class="pm-kafle">${l.map((p) => `<button class="pm-kafel" data-pm="${esc(p.id)}"><span class="chip">${esc(ETAPY_PM.find(([k]) => k === p.etap)?.[1] || p.etap)}</span><b>${esc(p.tytul)}</b>${p.hook ? `<small>🪝 ${esc(p.hook.replace(/\*/g, ""))}</small>` : ""}<small class="podpowiedz">${esc(p.data)}</small></button>`).join("")}</div>` : "";
  box.querySelectorAll("[data-pm]").forEach((b) => (b.onclick = () => otworzPomysl(b.dataset.pm)));
}
// Wgrywanie materiałów ze scenariusza do raw/ projektu (z postępem).
function wgrajMaterial(mid, pliki) {
  const P = S.projekt;
  let i = 0;
  const nastepny = () => {
    if (i >= pliki.length) { toast("Wgrane ✓", 1500); return odswiezProjekt(); }
    const f = pliki[i++];
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `/api/projekt/${encodeURIComponent(P.nazwa)}/material/${encodeURIComponent(mid)}?nazwa=${encodeURIComponent(f.name)}`);
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) toast(`Wgrywam ${mid}: ${f.name} ${Math.round((e.loaded / e.total) * 100)}%`, 4000); };
    xhr.onload = () => { if (xhr.status >= 300) { let j = {}; try { j = JSON.parse(xhr.responseText); } catch {} blad(new Error(j.blad || "Nie udało się wgrać")); } nastepny(); };
    xhr.onerror = () => { blad(new Error("Nie udało się wgrać " + f.name)); nastepny(); };
    xhr.send(f);
  };
  nastepny();
}
function kartaMaterialowProjektu() {
  const sc = S.projekt.scenariusz;
  if (!sc?.materialy?.length) return "";
  const mat = sc.materialy;
  const ob = mat.filter((x) => x.obowiazkowy !== false);
  const jest = ob.filter((x) => plikiMaterialu(x).length).length;
  const hook = (sc.hooki || []).find((h) => h.wybrany) || sc.hooki?.[0];
  return `<div class="karta pm-materialy-proj"><div class="naglowek"><div><h3>📦 Materiały ze scenariusza <small class="podpowiedz">${jest}/${ob.length} obowiązkowych</small></h3><p>${hook ? `Hook: <b>${esc(hook.tekst.replace(/\*/g, ""))}</b>. ` : ""}Wgraj pliki przy każdym punkcie (albo przeciągnij je na kartę). Trafią do raw/ z numerem materiału w nazwie.</p></div>
    <button class="btn" data-asystent-materialy ${jest ? "" : 'disabled title="Najpierw wgraj materiały"'}>✦ Claude: sprawdź i ułóż wg scenariusza</button></div>
    <div class="pasek-postepu-mat"><div style="width:${ob.length ? Math.round((jest / ob.length) * 100) : 0}%"></div></div>
    <div class="pm-materialy">${mat.map((x) => kartaMaterialu(x, true)).join("")}</div></div>`;
}
function podepnijMaterialy(root) {
  podepnijKartyMat(root, S.projekt.scenariusz?.materialy || []);
  root.querySelectorAll("[data-wgraj]").forEach((inp) => (inp.onchange = () => { if (inp.files.length) wgrajMaterial(inp.dataset.wgraj, [...inp.files]); }));
  root.querySelectorAll(".pm-materialy-proj .pm-mat").forEach((k) => {
    k.ondragover = (e) => { e.preventDefault(); k.classList.add("nad"); };
    k.ondragleave = () => k.classList.remove("nad");
    k.ondrop = (e) => { e.preventDefault(); k.classList.remove("nad"); if (e.dataTransfer.files.length) wgrajMaterial(k.dataset.mat, [...e.dataTransfer.files]); };
  });
  const b = root.querySelector("[data-asystent-materialy]");
  if (b) b.onclick = () => otworzAsystenta({
    tytul: "Ułóż rolkę według scenariusza",
    powitanie: "Sprawdzę wgrane materiały względem scenariusza, przygotuję nagrania i ułożę ujęcia, hook i sceny. Zapytam tylko, gdy czegoś nie da się ustalić.",
    prompt: promptMaterialow(),
  });
}
// ---------- Montaż vlogowy (scripts/vlog.mjs): wiele klipów z dnia -> automatyczny montaż w rytmie ----------
function kartaVloga(raw) {
  const P = S.projekt, r = rolka(), V = P.vlog;
  const wideo = raw.filter((f) => f.typ === "wideo").length;
  if (!(r.format === 11 || r.vlog || V || wideo >= 6)) return "";
  const tempo = r.vlog?.tempo || 100, dl = r.vlog?.dlugosc_cel || 40;
  const dec = V?.decyzje || [];
  const kolor = { wybrany: "ok", odrzucony: "obow", "pominięty": "" };
  return `<div class="karta vlog-karta"><div class="naglowek"><div><h3>🎞️ Montaż vlogowy (vlog / daily)</h3>
      <p>Wrzuć wszystkie klipy z dnia. Panel ułoży je po godzinie nagrania, z każdego weźmie najlepszy kawałek (ostry, jasny, z ruchem), odrzuci nieudane, potnie w rytmie i doda godzinę przy każdej porze dnia. Potem poprawiasz ujęcia niżej na liście i na osi czasu.</p></div></div>
    <div class="rzad" style="align-items:flex-end;gap:14px">
      <label class="pole" style="margin:0"><span>Tempo cięć (BPM)</span><input type="number" id="vlTempo" min="60" max="160" step="5" value="${tempo}" style="width:110px"></label>
      <label class="pole" style="margin:0"><span>Długość (s)</span><input type="number" id="vlDl" min="12" max="90" step="5" value="${dl}" style="width:100px"></label>
      <button class="btn" id="vlUloz" data-zadanie ${wideo ? "" : 'data-zablokowany="1" title="Najpierw wrzuć klipy do raw/"'}>${V ? "Ułóż vlog od nowa" : "Ułóż vlog automatycznie"} (${wideo} klipów)</button>
      ${V ? `<button class="btn jasny" data-asystent-vlog>✦ Claude: opisy rozdziałów, twarze, lektor</button>` : ""}</div>
    <p class="podpowiedz" style="margin-top:8px">Tempo ${tempo} BPM = cięcie co ${(120 / tempo).toFixed(2).replace(".", ",")} s albo ${(240 / tempo).toFixed(2).replace(".", ",")} s. W Instagramie dobierz piosenkę o podobnym tempie (spokojne ok. 80-95, energiczne 110-125).</p>
    ${V ? `<div class="ramka info">Ostatni montaż: <b>${V.wybranych}/${V.klipow}</b> klipów, ${V.rozdzialow} ${V.rozdzialow === 1 ? "rozdział" : "rozdz."}, ${String(V.dlugosc).replace(".", ",")} s.${V.godzinyZPliku ? ` ${V.godzinyZPliku} klipów bez godziny w metadanych (sprawdź kolejność).` : ""} Sprawdź, czy nie widać twarzy klientek bez zgody.</div>
      <div class="chipy vlog-decyzje">${dec.map((d) => `<span class="chip ${kolor[d.decyzja] ?? ""}" title="${esc(d.decyzja)}${d.powod ? ": " + esc(d.powod) : ""}${d.ocena != null ? ` · ocena ${d.ocena}` : ""}">${d.decyzja === "wybrany" ? "✓" : d.decyzja === "odrzucony" ? "✗" : "–"} ${d.godzina ? esc(d.godzina) + " " : ""}${esc(d.plik)}${d.mowa ? " 🎙" : ""}${d.dzwiek_on ? " 🔊" : ""}${d.powod ? ` (${esc(d.powod)})` : ""}</span>`).join("")}</div>` : ""}
  </div>`;
}
function podepnijVlog(root) {
  const b = $("#vlUloz", root); if (!b) return;
  const P = S.projekt;
  const odpal = (force) => uruchom("vlog", [P.nazwa, "--tempo", String($("#vlTempo", root).value || 100), "--dlugosc", String($("#vlDl", root).value || 40), ...(force ? ["--force"] : [])], { opis: "Montaż vlogowy (analiza klipów)", po: ({ kod }) => { if (!kod) uruchom("zloz", [P.nazwa], { opis: "Składanie vloga", po: odswiezProjekt }); else odswiezProjekt(); } });
  b.onclick = () => {
    const reczne = rolka().ujecia.filter((u) => u.src && !u.vlog && metaPliku(u.src)).length; // zastępczy klip z szablonu się nie liczy
    if (reczne && !rolka().vlog) {
      const m = modal(`<h2>Zastąpić ułożone ujęcia?</h2><p>Ta rolka ma już ${reczne} ręcznie ułożonych ujęć. Montaż vloga ułoży wszystko od nowa (kopia zostanie w kompozycja/rolka.przed-vlog.json).</p><div class="rzad"><button class="btn" id="tak">Tak, ułóż vlog</button><button class="btn jasny" id="nie">Zostaw</button></div>`);
      $("#nie", m).onclick = zamknijModal; $("#tak", m).onclick = () => { zamknijModal(); odpal(true); };
    } else odpal(!!rolka().vlog);
  };
  const a = root.querySelector("[data-asystent-vlog]");
  if (a) a.onclick = () => otworzAsystenta({
    tytul: "Vlog: rozdziały, twarze, lektor",
    powitanie: "Obejrzę wybrane klipy, nazwę rozdziały dnia, sprawdzę twarze klientek i zapytam, czy chcesz lektora.",
    prompt: `Użyj skilla rolki-beauty i zasad z CLAUDE.md.
Projekt: ${P.nazwa} (folder ${P.sciezka}). To vlog / daily ułożony automatycznie przez npm run vlog. Raport: ${P.sciezka}/kompozycja/vlog.json, montaż: ${P.sciezka}/kompozycja/rolka.json (ujęcia mają "vlog": {godzina, rozdzial, mowa, dzwiek_on}; sceny vlog-godzina mają dane.godzina i dane.opis).
1. Z każdego wybranego ujęcia wyciągnij 1 klatkę (ffmpeg -ss <od+0.5> -frames:v 1, mała rozdzielczość) i obejrzyj (Read).
2. Nazwij rozdziały: w scenach vlog-godzina wpisz krótki, mówiony opis (2-4 słowa, np. „kawa i plan dnia”, „pierwsza klientka”, „sprzątam po pracy”) zamiast „rano” czy „wieczór”. Nie zmieniaj godzin.
3. TWARZE: jeśli na klatce widać twarz innej osoby niż ${OS().mian} (klientka), wypisz te ujęcia. Jeśli w brief.md nie ma „zgoda na wizerunek: tak”, zaproponuj usunięcie ujęcia albo inny kawałek klipu bez twarzy (zmień od/do) i zapytaj.
4. Hook: zaproponuj mocniejszy hook dnia, jeśli obecny jest ogólny („Mój dzień w gabinecie”): konkret z klatek, np. „9 klientek przed sylwestrem”. Zapytaj z OPCJE.
5. Lektor: zapytaj, czy ${OS().mian} chce lektora (OPCJE: Tak, napisz tekst | Nie, wystarczą godziny i dźwięki). Jeśli tak: napisz tekst na długość montażu (ok. 2,2 słowa na sekundę, po zdaniu na rozdział, mówiony), dopisz do brief.md sekcję „## Lektor (teleprompter)” i do ${P.sciezka}/scenariusz.json materiał {"id":"L1","nazwa_pliku":"L1_lektor","typ":"mowa","opis":"lektor do vloga, nagraj w ciszy, telefon blisko ust","obowiazkowy":true,"teleprompter":[{kiedy, tekst} po rozdziałach]} (utwórz scenariusz.json z "materialy", jeśli go nie ma). Powiedz, że po wgraniu nagrania L1 ustawisz je jako voiceover (rolka.json -> voiceover {src: proxy/L1_lektor.mp4}, vlog.lektor true) i zrobisz napisy.
6. Zapisz rolka.json, uruchom npm run zloz -- ${P.nazwa}. Jedno pytanie naraz, ostatnia linia OPCJE: … Na końcu: GOTOWE`,
  });
}

// ---------- Kwestie: które podejście i który fragment nagrania (napisy/kwestie.json z dopasuj-kwestie) ----------
function wierszeKwestii() {
  const sc = S.projekt?.scenariusz;
  const K = S.kwestie?.kwestie || [];
  return (sc?.materialy || []).flatMap((m) => kwestie(m).map((k, nr) => {
    const d = K.find((x) => x.material === m.id && x.nr === nr);
    return { m, nr, k, d: d && d.tekst === k.tekst ? d : null, zmieniony: !!d && d.tekst !== k.tekst };
  }));
}
function kartaKwestii() {
  const w = wierszeKwestii();
  if (!w.length) return "";
  const P = S.projekt;
  const maNagrania = w.some(({ m }) => [...P.pliki.raw, ...P.pliki.proxy].some((f) => f.nazwa.toLowerCase().startsWith(m.id.toLowerCase() + "_") && f.typ === "wideo"));
  const znal = w.filter((x) => x.d?.wybrane).length;
  const czas = (s) => Number(s).toFixed(1).replace(".", ",");
  return `<div class="karta kw-karta"><div class="naglowek"><div><h3>🎙️ Kwestie z teleprompera <small class="podpowiedz">${S.kwestie ? `${znal}/${w.length} znalezione` : "jeszcze niedopasowane"}</small></h3>
      <p>Panel robi transkrypcję każdego nagrania z mową, szuka w nim każdej kwestii i wybiera najlepsze podejście (najmniej „yyy”, pauz i pominiętych słów). Tnie między słowami. Możesz odsłuchać i wybrać inne podejście.</p></div>
      <div class="rzad">${znal ? `<button class="btn jasny" id="kwWstaw" title="Dodaje ujęcia z mową (z mikro-cięciami) albo podmienia te, które już są">Wstaw kwestie do ujęć</button>` : ""}<button class="btn" id="kwDopasuj" data-zadanie ${maNagrania ? "" : 'data-zablokowany="1" title="Najpierw wgraj nagrania z mową"'}>${S.kwestie ? "Dopasuj od nowa" : "Dopasuj kwestie"}</button></div></div>
    <div class="kw-uklad"><div class="kw-lista">${w.map(({ m, nr, k, d, zmieniony }, i) => {
      const wb = d?.wybrane;
      const st = !wb ? "brak" : wb.ocena >= 85 ? "ok" : "srednio";
      return `<div class="kw-wiersz ${st}">
        <div class="kw-status">${!wb ? "✗" : wb.ocena >= 85 ? "✓" : "~"}</div>
        <div class="kw-tresc"><small>${esc(m.id)} · kwestia ${nr + 1}${k.kiedy ? ` · ${esc(k.kiedy)}` : ""}</small>
          <b>„${esc(k.tekst)}”</b>
          ${wb ? `<div class="kw-wybrane">🎬 ${esc(wb.plik.split("/").pop())} · ${czas(wb.od)}-${czas(wb.do)} s · ocena <b>${wb.ocena}</b>${d.recznie ? " · wybrane ręcznie" : ""}${wb.segmenty ? ` · ✂️ wycięte ${czas(wb.wyciete || 0)} s („yyy”, pauzy, powtórki)` : ""}${(rolka().ujecia || []).some((u) => u.kwestia === `${m.id}.${nr + 1}`) ? " · ✓ w ujęciach" : ""}</div>
            ${wb.powiedziane && wb.zgodnosc < 100 ? `<div class="kw-powiedziane">Powiedziałaś: „${esc(wb.powiedziane)}”</div>` : ""}
            ${wb.uwagi?.length ? `<div class="chipy">${wb.uwagi.map((u) => `<span class="chip">${esc(u)}</span>`).join("")}</div>` : ""}`
          : `<div class="kw-powiedziane">${zmieniony ? "Tekst kwestii się zmienił. Kliknij „Dopasuj od nowa”." : S.kwestie ? "Nie ma tej kwestii w nagraniach. Nagraj ją albo zmień tekst w rozmowie z Claude." : "Wgraj nagranie i kliknij „Dopasuj kwestie”."}</div>`}
        </div>
        <div class="kw-akcje">${wb ? `<button class="btn maly" data-kw-graj="${i}">▶ Odsłuchaj</button>` : ""}
          ${d?.podejscia?.length > 1 ? `<select data-kw-wybor="${i}" title="Wybierz inne podejście">${d.podejscia.map((p, j) => `<option value="${j}" ${wb && p.plik === wb.plik && Math.abs(p.od - wb.od) < 0.05 ? "selected" : ""}>${esc(p.plik.split("/").pop())} ${czas(p.od)} s · ${p.ocena}</option>`).join("")}</select>` : ""}</div>
      </div>`;
    }).join("")}</div>
    <div class="kw-podglad ukryte" id="kwPodglad"><video id="kwPlayer" playsinline></video><small id="kwOpis"></small></div></div>
  </div>`;
}
function podepnijKwestie(root) {
  const b = $("#kwDopasuj", root);
  if (!b) return;
  const P = S.projekt;
  b.onclick = () => uruchom("dopasuj-kwestie", [P.nazwa], { opis: "Dopasowanie kwestii (transkrypcja każdego nagrania)", po: () => { S.kwestie = undefined; S.napisyZ = null; odswiezProjekt(); } });
  const w = wierszeKwestii();
  // Kwestie do montażu: ujęcie z "kwestia": "M1.1" podmieniamy w miejscu, nowe dopisujemy na końcu (b-roll układa Claude albo Ty).
  const wst = $("#kwWstaw", root);
  if (wst) wst.onclick = () => {
    const r = rolka();
    let nowe = 0, podm = 0;
    for (const { m, nr, d } of w) {
      const wb = d?.wybrane; if (!wb) continue;
      const tag = `${m.id}.${nr + 1}`;
      const uj = { src: wb.plik, od: wb.od, do: wb.do, dzwiek: true, przejscie_po: "ciecie", kwestia: tag, ...(wb.segmenty ? { segmenty: wb.segmenty } : {}) };
      const i = r.ujecia.findIndex((u) => u.kwestia === tag);
      if (i >= 0) { r.ujecia[i] = { ...r.ujecia[i], ...uj, przejscie_po: r.ujecia[i].przejscie_po || "ciecie" }; podm++; } else { r.ujecia.push(uj); nowe++; }
    }
    zapiszRolke(); toast(`Kwestie w ujęciach: ${nowe} nowe, ${podm} podmienione`); pokaz();
  };
  const pl = $("#kwPlayer", root);
  let stop = null;
  const graj = (p, opis) => {
    $("#kwPodglad", root).classList.remove("ukryte");
    $("#kwOpis", root).textContent = opis;
    if (stop) pl.removeEventListener("timeupdate", stop);
    const src = media(wProjekcie(p.plik));
    if (!pl.src.endsWith(src)) pl.src = src;
    const start = () => { pl.currentTime = p.od; pl.play(); };
    pl.readyState >= 1 ? start() : (pl.onloadedmetadata = start);
    stop = () => { if (pl.currentTime >= p.do) { pl.pause(); pl.removeEventListener("timeupdate", stop); } };
    pl.addEventListener("timeupdate", stop);
  };
  root.querySelectorAll("[data-kw-graj]").forEach((x) => (x.onclick = () => { const r = w[Number(x.dataset.kwGraj)]; graj(r.d.wybrane, `${r.m.id}.${r.nr + 1}: ${r.d.wybrane.plik.split("/").pop()}`); }));
  root.querySelectorAll("[data-kw-wybor]").forEach((s) => (s.onchange = async () => {
    const r = w[Number(s.dataset.kwWybor)];
    r.d.wybrane = r.d.podejscia[Number(s.value)]; r.d.recznie = true;
    try { await api(`/api/projekt/${encodeURIComponent(P.nazwa)}/kwestie`, { method: "PUT", body: S.kwestie }); toast("Wybrane podejście zapisane"); pokaz(); } catch (e) { blad(e); }
  }));
}
function promptMaterialow() {
  const P = S.projekt;
  return `Użyj skilla rolki-beauty (.claude/skills/rolki-beauty/SKILL.md) i zasad z CLAUDE.md.
Projekt rolki: ${P.nazwa} (folder ${P.sciezka}). Scenariusz i lista materiałów: ${P.sciezka}/scenariusz.json (pole materialy[].pliki = wgrane pliki w raw/; pliki w raw/ nazywają się jak materialy[].nazwa_pliku, np. M1_mowa_hook.mp4, kolejne podejścia _2, _3; materialy[].teleprompter = co ${OS().mian} miała powiedzieć, porównaj z transkrypcją i wybierz najlepsze podejście). Brief: ${P.sciezka}/brief.md, montaż: ${P.sciezka}/kompozycja/rolka.json.
${uwagaMontazu()}
${kontekstOpcjiAI()}
${OS().mian} wgrała materiały do rolki, którą razem zaplanowałyście. Twoje zadanie:
1. Sprawdź każdy wgrany plik (ffprobe: orientacja, długość; w razie potrzeby wyciągnij klatkę ffmpeg i obejrzyj ją): czy pasuje do opisu materiału, czy jest ostry i jasny. Krótko powiedz, co jest super, a co warto nagrać jeszcze raz.
2. Uruchom npm run normalizuj -- ${P.nazwa} --cisza (jeśli proxy/ jest puste albo nieaktualne). Mowę dopasowuje skrypt: jeśli ${P.sciezka}/napisy/kwestie.json nie istnieje albo jest starszy niż nagrania z mową, uruchom npm run dopasuj-kwestie -- ${P.nazwa}. NIE zgaduj cięć mowy i NIE uruchamiaj zwykłego transkrybuj na nagraniach z kwestiami.
   Dopasuj ujęcia do planu przez node scripts/dopasuj-ujecia.mjs "${P.sciezka}". Odczytaj kompozycja/dopasowania-ujec.json z projektu i sprawdź wskazane przedziały, zanim wybierzesz przebitki.
3. Ułóż rolka.json według scenariusza: każda kwestia = ujęcie z kwestie.json -> kwestie[].wybrane (src = wybrane.plik, od = wybrane.od, do = wybrane.do, "dzwiek": true), w kolejności ze scenariusza; nie zmieniaj tych czasów (${OS().mian} mogła wybrać podejście ręcznie). Kwestia bez "wybrane" = powiedz ${OS().cel}, której brakuje. Gdy "wybrane" ma "segmenty", przepisz je do ujęcia ("segmenty": [[od, do], ...]): zloz wytnie „yyy” i pauzy i zamaskuje skoki zmianą kadru. Każde ujęcie z kwestią oznacz "kwestia": "M1.1". Napisy idą same z rolka.json -> napisy.zrodla (ustawia je dopasuj-kwestie, nie ruszaj).
   Montaż na poziomie eksperckim:
   - PRZEBITKI NAD GŁOSEM (L-cut): gdy kwestia mówi o czymś, co widać na innym materiale (zabieg, preparat, efekt), dodaj do ujęcia z kwestią "przebitki": [{"src": "proxy/M3_x.mp4", "od": 0, "start": sekunda od początku ujęcia, "czas": 1.2-2}]. Głos leci dalej, obraz pokazuje to, o czym mowa. Zwykle 1 przebitka na kwestię dłuższą niż 3 s, nigdy w pierwszej 1 s kwestii (widz ma zobaczyć twarz).
   - TEMPO: nudne przygotowanie zabiegu przyspiesz ("tempo": 2-3, ujęcie jest wtedy bez dźwięku), efekt i odsłonięcie zostaw w tempie 1.
   - OBRAZ: przeczytaj ${P.sciezka}/proxy/.obraz.json. Ujęć z uwagami „za ciemne”, „przepalone”, odcień nie dawaj na start ani na efekt końcowy; jeśli są kluczowe, powiedz ${OS().cel}, co nagrać jeszcze raz i jak (światło z okna, lampa).
   - REŻYSERIA: odczytaj scenariusz[].rezyseria. Czasy w zdarzeniach są względem danej sceny. Kotwicz je do odpowiedniej kwestii po dopasowaniu i mikrocięciach, zgodnie z polem synchronizacja. Zrealizuj zatwierdzone elementy z dostępnym materiałem. Pozostałe są propozycjami do potwierdzenia. Gdy brakuje zdjęcia, nagrania lub źródła liczb, wskaż konkretną potrzebę. Komentarz jest rzeczywisty tylko wtedy, gdy ma powiązany zatwierdzony materiał typu komentarz z rzeczywistym źródłem. W pozostałych przypadkach umieść w kadrze podpis „Komentarze ilustracyjne”. Bez wygenerowanych reakcji sugerujących liczebność i bez fikcyjnej tożsamości.
   Pozostałe ujęcia (b-roll) w czasach ze scenariusza (z proxy/), hook-tytul z wybranym hookiem od 0 s, plansze z na_ekranie, przed-po jeśli są zdjęcia przed/po, CTA na końcu. Użyj decyzji z rolka.json przed propozycjami ze scenariusza. Podsumuj, które techniki pasują i które pomijasz. Potem npm run zloz -- ${P.nazwa}.
4. Jedno pytanie naraz, ostatnia linia: OPCJE: a | b | c. Najwyżej 4 pytania. Na koniec napisz, co zrobiłaś i co kliknąć dalej (wersja robocza w kroku Render), a w ostatniej linii: GOTOWE
Nigdy nie zakładaj zgody na wizerunek klientki. Zero obietnic medycznych. Nie renderuj finalu.`;
}

// ---------- start ----------
(async () => {
  try {
    // licencja: bez aktywnego kodu tylko ekran aktywacji (licencja.js), reszta API jest zablokowana na serwerze
    const start = await api("/api/start");
    if (!start.licencja?.aktywna) return pokazAktywacje(start.licencja);
    [S.start, S.szablony, S.formaty, S.hooki, S.muzyka, S.lottie] = [start, ...(await Promise.all([api("/api/szablony"), api("/api/formaty"), api("/api/hooki"), api("/api/muzyka"), api("/api/lottie").catch(() => [])]))];
    // odmiana imienia (moduł /lib/osoba.mjs) przed pierwszym ekranem, żeby powitanie miało wołacz
    if (!window.odmienImie) await new Promise((ok) => { window.addEventListener("osoba-gotowa", ok, { once: true }); setTimeout(ok, 2000); });
    const k = S.start.config.kolory || {};
    const root = document.documentElement.style;
    if (k.akcent) root.setProperty("--akcent", k.akcent);
    if (k.akcent_2) root.setProperty("--akcent-2", k.akcent_2);
    if (k.tekst) root.setProperty("--tekst", k.tekst);
    if (k.tlo_jasne) root.setProperty("--tlo", k.tlo_jasne);
    if (k.nude) root.setProperty("--nude", k.nude);
    if (!S.start.claude) { $("#claudeWyslij").disabled = true; $("#claudeInfo").textContent = "Komenda claude nie jest zainstalowana. Użyj „Kopiuj prompt” i wklej go w Claude Code."; }
    else $("#claudeInfo").textContent = "Claude może edytować pliki tej rolki i uruchamiać nasze skrypty (bez finalu, chyba że o niego poprosisz).";
    odswiezAlgorytm();
    const h = new URLSearchParams(location.hash.slice(1));
    if (h.get("p")) await otworz(h.get("p"), Number(h.get("k") || 1));
    else if (h.get("pomysl")) await otworzPomysl(h.get("pomysl")).catch(() => pokaz());
    else pokaz();
  } catch (e) { blad(e); }
})();
window.addEventListener("hashchange", () => {});

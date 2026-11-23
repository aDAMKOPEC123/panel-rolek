// Edytor osi czasu w kroku Sceny: podgląd na żywo (<hyperframes-player>), przesuwanie i przycinanie scen
// jak w programie do montażu, głowica, znaczniki z uwagami dla Claude.
// Korzysta z globali app.js: S, $, esc, r1, api, toast, blad, debounce, rolka, czasyUjec, thumb, wProjekcie,
// nazwaSzablonu, formularzSceny, otworzAsystenta.
const ED = { pxs: 0, t: 0, gra: false, budowa: 0, czekaZmiana: false, zoom: null, klawisze: false, przeciaganie: null };
const ED_MIN = 0.3; // najkrótsza scena (s)

function edytorSceny(host) {
  const r = rolka();
  r.znaczniki ||= [];
  host.innerHTML = `
    <div class="ed">
      <div class="ed-gora">
        <div class="ed-ekran">
          <hyperframes-player id="edPlayer" runtime-src="/vendor/hyperframe.runtime.iife.js"></hyperframes-player>
          <div class="ed-odswiez ukryte" id="edOdswiez">odświeżam podgląd…</div>
        </div>
        <div class="ed-panel">
          <div class="rzad ed-sterowanie">
            <button class="btn" id="edPlay" title="Spacja">▶</button>
            <span class="ed-czas" id="edCzas">0,0 s</span>
            <button class="btn maly jasny" id="edWyc" title="Dźwięk">🔊</button>
            <label class="rzad ed-zoom" title="Powiększenie osi">🔍 <input type="range" id="edZoom" min="20" max="260" step="5"></label>
          </div>
          <div class="rzad"><button class="btn maly" id="edDodajZn" title="Skrót: M">📍 Znacznik w tej chwili</button>
            <button class="btn maly jasny" id="edRezyser" title="Claude ogląda całą rolkę i sam stawia znaczniki">✦ Claude: obejrzyj i oceń</button>
            <button class="btn maly ciemny" id="edClaude">✦ Claude: popraw znaczniki</button></div>
          <div class="rzad"><button class="btn maly jasny" id="edBity" title="Wykrywa tempo muzyki rolki">🎵 Wykryj rytm</button>
            <button class="btn maly jasny" id="edDoRytmu" title="Cięcia ujęć i starty scen na najbliższy bit (do 0,35 s)">⇥ Dopasuj do rytmu</button>
            <span class="podpowiedz" id="edBpm"></span></div>
          <div id="edZnaczniki" class="ed-znaczniki"></div>
          <p class="podpowiedz ed-skroty">Przeciągnij scenę, żeby ją przesunąć, krawędź, żeby skrócić lub wydłużyć. Klik w linijkę przewija. Spacja: odtwarzanie, ←/→: wybrana scena o 0,1 s (Shift: 1 s), M: znacznik, Alt przy przeciąganiu: bez przyciągania.</p>
        </div>
      </div>
      <div class="ed-os" id="edOs"><div class="ed-wnetrze" id="edWnetrze"></div></div>
    </div>`;
  const pl = $("#edPlayer");
  const baza = `/komp/${encodeURIComponent(S.projekt.nazwa)}/index.html`;
  pl.setAttribute("src", baza + "?v=" + Date.now());
  pl.addEventListener("timeupdate", () => edCzas(pl.currentTime || 0));
  pl.addEventListener("ready", () => { if (ED.t > 0) pl.seek(Math.min(ED.t, (pl.duration || ED.t) - 0.05)); edCzas(ED.t); });
  const grajStop = () => {
    if (pl.paused) { pl.play(); ED.gra = true; } else { pl.pause(); ED.gra = false; }
    setTimeout(() => ($("#edPlay").textContent = pl.paused ? "▶" : "❚❚"), 50);
  };
  $("#edPlay").onclick = grajStop;
  $("#edWyc").onclick = () => { pl.muted = !pl.muted; $("#edWyc").textContent = pl.muted ? "🔇" : "🔊"; };
  ED.grajStop = grajStop;
  const zoom = $("#edZoom");
  zoom.oninput = () => { ED.zoom = Number(zoom.value); edRysujOs(); };
  $("#edDodajZn").onclick = () => dodajZnacznik();
  $("#edClaude").onclick = () => claudeZnaczniki();
  $("#edRezyser").onclick = () => claudeRezyser();
  $("#edBity").onclick = () => wykryjRytm();
  $("#edDoRytmu").onclick = () => dopasujDoRytmu();
  wczytajBity();
  wczytajWzor();
  edRysujOs();
  zoom.value = Math.round(ED.pxs);
  rysujZnaczniki();
  // Zmiany w formularzu sceny (teksty, efekty, kolory) też odświeżają podgląd
  const form = $("#formSceny");
  if (form && !form.dataset.ed) { form.dataset.ed = "1"; const f = () => przebuduj(1200); form.addEventListener("input", f); form.addEventListener("change", f); }
  if (!ED.klawisze) { ED.klawisze = true; document.addEventListener("keydown", klawiszeEdytora); }
  // oś dopasowana do szerokości (dopóki ktoś nie ustawi powiększenia suwakiem)
  let szer = 0;
  new ResizeObserver(() => { const os = $("#edOs"); if (!os || ED.zoom || ED.przeciaganie || Math.abs(os.clientWidth - szer) < 4) return; szer = os.clientWidth; edRysujOs(); zoom.value = Math.round(ED.pxs); }).observe($("#edOs"));
  przebuduj(0); // kompozycja mogła się zestarzeć względem rolka.json
}

// ---------- oś ----------
function torySceny(r) {
  const tory = [], ulozenie = [];
  r.sceny.map((s, i) => i).sort((x, y) => r.sceny[x].start - r.sceny[y].start).forEach((i) => {
    const a = Number(r.sceny[i].start), b = a + Number(r.sceny[i].czas);
    let t = tory.findIndex((k) => k <= a + 0.01);
    if (t < 0) { t = tory.length; tory.push(0); }
    tory[t] = b; ulozenie[i] = t;
  });
  return { tory, ulozenie };
}
function edDlugosc() {
  const r = rolka(), cz = czasyUjec();
  return Math.max(cz.at(-1)?.koniec || 0, ...r.sceny.map((s) => Number(s.start) + Number(s.czas)), ...(r.znaczniki || []).map((z) => z.t + 0.5), 5);
}
function edRysujOs() {
  const os = $("#edOs"), w = $("#edWnetrze");
  if (!os || !w) return;
  const r = rolka(), cz = czasyUjec(), T = edDlugosc() + 1;
  const pxs = (ED.pxs = ED.zoom || Math.max(20, (os.clientWidth - 30) / T));
  const { tory, ulozenie } = torySceny(r);
  const x = (t) => t * pxs;
  const krok = pxs > 120 ? 0.5 : pxs > 50 ? 1 : pxs > 25 ? 2 : 5;
  let linijka = "";
  for (let s = 0; s <= T; s += krok) linijka += `<span class="ed-kreska ${s % 1 ? "mala" : ""}" style="left:${x(s)}px">${s % 1 ? "" : s + " s"}</span>`;
  w.style.width = x(T) + 40 + "px";
  w.innerHTML = `
    <div class="ed-linijka" id="edLinijka">${linijka}</div>
    <div class="ed-tor"><span class="ed-etykieta">ujęcia</span>${cz.map((c, i) => {
      const u = r.ujecia[i];
      const bg = u.src ? `background-image:url('${thumb(wProjekcie(u.src), /\.(jpe?g|png|webp)$/i.test(u.src) ? 0 : r1(Number(u.od || 0) + c.czas / 2), 160)}')` : `background:${esc(u.kolor || "#E9D9CF")}`;
      return `<div class="ed-blok uj" style="left:${x(c.start)}px;width:${Math.max(4, x(c.czas) - 2)}px;${bg}" title="${esc(u.src || "plansza")} (${r1(c.czas)} s)"><span>${i + 1}</span></div>`;
    }).join("")}</div>
    ${(tory.length ? tory : [0]).map((_, t) => `<div class="ed-tor sc">${t === 0 ? '<span class="ed-etykieta">sceny</span>' : ""}${r.sceny.map((s, i) => (ulozenie[i] === t ? `<div class="ed-blok sc ${S.wybranaScena === i ? "wybrany" : ""}" data-sc="${i}" style="left:${x(s.start)}px;width:${Math.max(10, x(s.czas))}px"><i class="ed-uchwyt l"></i><span>${esc(nazwaSzablonu(s.szablon))}</span><i class="ed-uchwyt p"></i></div>` : "")).join("")}</div>`).join("")}
    ${ED.wzor?.ujecia?.length ? `<div class="ed-tor wzor"><span class="ed-etykieta">wzór (${ED.wzor.ujec} ujęć, śr. ${String(ED.wzor.srednia_dlugosc_ujecia).replace(".", ",")} s)</span>${ED.wzor.ujecia.map((u, k) => `<div class="ed-wz" style="left:${x(u.od)}px;width:${Math.max(3, x(u.dlugosc) - 2)}px" title="ujęcie wzoru ${k + 1}: ${u.od}-${u.do} s">${k + 1}</div>`).join("")}</div>` : ""}
    ${ED.bity?.bity?.length ? `<div class="ed-tor rytm"><span class="ed-etykieta">rytm ${Math.round(ED.bity.bpm)} BPM</span>${ED.bity.bity.filter((t) => t <= T).map((t) => `<i class="ed-bit ${ED.bity.mocne.includes(t) ? "mocny" : ""}" style="left:${x(t)}px"></i>`).join("")}</div>` : ""}
    <div class="ed-tor zn"><span class="ed-etykieta">znaczniki</span>${r.znaczniki.map((z, k) => `<div class="ed-pin ${z.stan === "zrobione" ? "ok" : ""} ${ED.wybranyZn === z.id ? "wybrany" : ""}" data-zn="${k}" style="left:${x(z.t)}px" title="${esc(r1(z.t) + " s: " + (z.tekst || "(bez opisu)"))}">📍</div>`).join("")}</div>
    <div class="ed-glowica" id="edGlowica" style="left:${x(ED.t)}px"><i></i></div>
    <div class="ed-tip ukryte" id="edTip"></div>`;
  // przewijanie klikiem / przeciąganiem po linijce i pustych torach
  w.onpointerdown = (e) => {
    if (e.target.closest(".ed-blok.sc, .ed-pin")) return;
    const odczyt = (ev) => Math.max(0, (ev.clientX - w.getBoundingClientRect().left) / ED.pxs);
    edSzukaj(odczyt(e));
    w.setPointerCapture(e.pointerId);
    w.onpointermove = (ev) => edSzukaj(odczyt(ev));
    w.onpointerup = () => { w.onpointermove = null; w.onpointerup = null; };
  };
  w.querySelectorAll(".ed-blok.sc").forEach((b) => (b.onpointerdown = (e) => chwyc(e, b, Number(b.dataset.sc))));
  w.querySelectorAll(".ed-pin").forEach((p) => (p.onpointerdown = (e) => chwycZnacznik(e, p, Number(p.dataset.zn))));
}
function edCzas(t) {
  ED.t = Math.max(0, t);
  const g = $("#edGlowica"), c = $("#edCzas"), os = $("#edOs");
  if (g) g.style.left = ED.t * ED.pxs + "px";
  if (c) c.textContent = ED.t.toFixed(1).replace(".", ",") + " s";
  const pl = $("#edPlayer");
  if (pl && $("#edPlay")) $("#edPlay").textContent = pl.paused ? "▶" : "❚❚";
  // przy odtwarzaniu oś jedzie za głowicą
  if (os && pl && !pl.paused) { const px = ED.t * ED.pxs; if (px < os.scrollLeft + 40 || px > os.scrollLeft + os.clientWidth - 60) os.scrollLeft = px - 80; }
}
function edSzukaj(t) {
  const pl = $("#edPlayer");
  const d = pl?.duration || edDlugosc();
  t = Math.min(Math.max(0, t), Math.max(0, d - 0.04));
  if (pl) { if (!pl.paused) pl.pause(); pl.seek(t); }
  edCzas(t);
}

// ---------- przeciąganie scen ----------
function punktyPrzyciagania(pomin) {
  const r = rolka(), p = [0, ED.t];
  czasyUjec().forEach((c) => p.push(c.start, c.koniec));
  r.sceny.forEach((s, i) => { if (i !== pomin) p.push(Number(s.start), Number(s.start) + Number(s.czas)); });
  (r.znaczniki || []).forEach((z) => p.push(z.t));
  (ED.bity?.bity || []).forEach((t) => p.push(t));
  (ED.wzor?.ujecia || []).forEach((u) => p.push(u.do));
  return p;
}
function przyciagnij(t, punkty, alt) {
  if (alt) return Math.round(t * 30) / 30; // klatka 30 fps
  const prog = 8 / ED.pxs;
  let best = null;
  for (const q of punkty) if (Math.abs(q - t) < prog && (best == null || Math.abs(q - t) < Math.abs(best - t))) best = q;
  return best != null ? best : Math.round(t * 10) / 10;
}
function chwyc(e, b, i) {
  e.preventDefault(); e.stopPropagation();
  const r = rolka(), s = r.sceny[i];
  const rect = b.getBoundingClientRect(), dx = e.clientX - rect.left;
  const tryb = dx < 9 ? "l" : dx > rect.width - 9 ? "p" : "m";
  const s0 = Number(s.start), c0 = Number(s.czas), x0 = e.clientX, punkty = punktyPrzyciagania(i);
  let ruszone = false;
  b.setPointerCapture(e.pointerId);
  b.classList.add("chwycony");
  const tip = $("#edTip");
  b.onpointermove = (ev) => {
    const d = (ev.clientX - x0) / ED.pxs;
    if (!ruszone && Math.abs(ev.clientX - x0) < 3) return;
    ruszone = true;
    if (tryb === "m") {
      let ns = przyciagnij(s0 + d, punkty, ev.altKey);
      const koniec = przyciagnij(s0 + d + c0, punkty, ev.altKey);
      if (Math.abs(koniec - (s0 + d + c0)) < Math.abs(ns - (s0 + d))) ns = koniec - c0; // przyciąganie końcem
      s.start = Math.max(0, r3(ns));
    } else if (tryb === "l") {
      const ns = Math.min(s0 + c0 - ED_MIN, Math.max(0, przyciagnij(s0 + d, punkty, ev.altKey)));
      s.czas = r3(s0 + c0 - ns); s.start = r3(ns);
    } else {
      const nk = Math.max(s0 + ED_MIN, przyciagnij(s0 + c0 + d, punkty, ev.altKey));
      s.czas = r3(nk - s0);
    }
    b.style.left = s.start * ED.pxs + "px"; b.style.width = Math.max(10, s.czas * ED.pxs) + "px";
    tip.classList.remove("ukryte");
    tip.style.left = s.start * ED.pxs + "px"; tip.style.top = b.offsetTop - 26 + "px";
    tip.textContent = `${fmt(s.start)} → ${fmt(s.start + s.czas)} (${fmt(s.czas)})`;
    edSzukaj(tryb === "p" ? s.start + s.czas - 0.05 : s.start + 0.05);
  };
  b.onpointerup = () => {
    b.onpointermove = null; b.onpointerup = null; tip.classList.add("ukryte"); b.classList.remove("chwycony");
    S.wybranaScena = i;
    if (ruszone) {
      edRysujOs();
      zapiszIZloz();
      toast(`${nazwaSzablonu(s.szablon)}: ${fmt(s.start)} – ${fmt(s.start + s.czas)}`, 1500);
    } else {
      $("#edWnetrze").querySelectorAll(".ed-blok.sc").forEach((x) => x.classList.toggle("wybrany", Number(x.dataset.sc) === i));
      edSzukaj(Number(s.start) + Math.min(0.6, Number(s.czas) / 2));
    }
    formularzSceny(i);
  };
}
const r3 = (x) => Math.round(x * 1000) / 1000;
const fmt = (x) => r1(x).toFixed(1).replace(".", ",") + " s";

// ---------- zapis + podgląd ----------
async function zapiszIZloz() {
  try { await api(`/api/projekt/${encodeURIComponent(S.projekt.nazwa)}/rolka`, { method: "PUT", body: S.projekt.rolka }); } catch (e) { return blad(e); }
  przebuduj(0);
}
let edTimer = null;
function przebuduj(ms = 700) {
  clearTimeout(edTimer);
  const o = $("#edOdswiez"); if (o) o.classList.remove("ukryte");
  edTimer = setTimeout(async () => {
    const nr = ++ED.budowa;
    try {
      await new Promise((ok) => setTimeout(ok, 450)); // zapiszRolke z formularza ma debounce 400 ms
      await api(`/api/projekt/${encodeURIComponent(S.projekt.nazwa)}/zloz`, { method: "POST" });
      if (nr !== ED.budowa) return; // w międzyczasie była nowsza zmiana
      const pl = $("#edPlayer");
      if (pl) { const t = ED.t; pl.setAttribute("src", `/komp/${encodeURIComponent(S.projekt.nazwa)}/index.html?v=${Date.now()}`); ED.t = t; }
    } catch (e) { blad(e); }
    if (nr === ED.budowa) { const o2 = $("#edOdswiez"); if (o2) o2.classList.add("ukryte"); }
  }, ms);
}

// ---------- klawiatura ----------
function klawiszeEdytora(e) {
  if (!$("#edOs")) return;
  if (e.target instanceof Element && e.target.closest("input, textarea, select, [contenteditable]")) return;
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const r = rolka();
  if (e.code === "Space") { e.preventDefault(); ED.grajStop?.(); }
  else if (e.key === "m" || e.key === "M") { e.preventDefault(); dodajZnacznik(); }
  else if ((e.key === "ArrowLeft" || e.key === "ArrowRight") && S.wybranaScena != null && r.sceny[S.wybranaScena]) {
    e.preventDefault();
    const s = r.sceny[S.wybranaScena], d = (e.key === "ArrowLeft" ? -1 : 1) * (e.shiftKey ? 1 : 0.1);
    s.start = Math.max(0, r3(Number(s.start) + d));
    edRysujOs(); edSzukaj(s.start + 0.05);
    clearTimeout(ED.nudge); ED.nudge = setTimeout(() => { zapiszIZloz(); formularzSceny(S.wybranaScena); }, 600);
  }
}

// ---------- znaczniki ----------
function dodajZnacznik() {
  const r = rolka();
  const z = { id: "z" + Date.now().toString(36), t: r3(ED.t), tekst: "", stan: "do zrobienia" };
  r.znaczniki.push(z);
  r.znaczniki.sort((a, b) => a.t - b.t);
  ED.wybranyZn = z.id;
  edRysujOs(); rysujZnaczniki();
  const ta = $(`#edZnaczniki [data-zt="${z.id}"]`); if (ta) ta.focus();
  zapiszRolke();
}
// Znacznik idzie do poprawki, gdy ma opis, nie jest zrobiony, a jeśli postawił go Claude, to został zaakceptowany.
const doPoprawki = (z) => z.stan !== "zrobione" && z.tekst?.trim() && (z.autor !== "claude" || z.zaakceptowany);
const WAGI = { krytyczne: "🔴 krytyczne", wazne: "🟠 ważne", kosmetyka: "⚪ kosmetyka" };
function rysujZnaczniki() {
  const box = $("#edZnaczniki"); if (!box) return;
  const r = rolka(), lista = r.znaczniki || [];
  odswiezLicznik();
  box.innerHTML = lista.length ? lista.map((z) => {
    const odClaude = z.autor === "claude", czeka = odClaude && !z.zaakceptowany && z.stan !== "zrobione";
    return `
    <div class="ed-zn ${z.stan === "zrobione" ? "ok" : ""} ${ED.wybranyZn === z.id ? "wybrany" : ""} ${odClaude ? "od-claude" : ""} ${czeka ? "czeka" : ""}" data-zid="${z.id}">
      <div class="rzad"><button class="chip" data-zskok="${z.id}" title="Przewiń do tej chwili">📍 ${fmt(z.t)}</button>
        ${odClaude ? `<span class="chip ed-autor">✦ Claude${z.waga ? " · " + (WAGI[z.waga] || esc(z.waga)) : ""}</span>` : ""}
        ${czeka ? `<button class="btn maly" data-zakc="${z.id}" title="Zgadzam się, do poprawki">✓ Popraw to</button>` : `<label class="podpowiedz"><input type="checkbox" data-zstan="${z.id}" ${z.stan === "zrobione" ? "checked" : ""}> zrobione</label>`}
        <button class="x" data-zusun="${z.id}" title="${czeka ? "Odrzuć uwagę" : "Usuń znacznik"}">✕</button></div>
      <textarea rows="2" data-zt="${z.id}" placeholder="Co tu jest nie tak i jak ma wyglądać? np. napis wchodzi za późno, ma być razem z ruchem pęsety, złoty zamiast białego">${esc(z.tekst || "")}</textarea>
      ${z.propozycja && z.stan !== "zrobione" ? `<small class="ed-prop">Propozycja: ${esc(z.propozycja)}</small>` : ""}
      ${z.odpowiedz ? `<small class="ed-odp">✦ ${esc(z.odpowiedz)}</small>` : ""}
    </div>`;
  }).join("") : `<p class="podpowiedz" style="margin:0">Zatrzymaj w miejscu, które Ci się nie podoba, kliknij „📍 Znacznik” (albo M) i opisz, jak ma być. Albo „✦ Claude: obejrzyj i oceń”: Claude sam obejrzy rolkę i postawi znaczniki. Potem „✦ Claude: popraw znaczniki” poprawi wszystkie naraz.</p>`;
  const znajdz = (id) => r.znaczniki.find((z) => z.id === id);
  box.querySelectorAll("[data-zakc]").forEach((x) => (x.onclick = () => { znajdz(x.dataset.zakc).zaakceptowany = true; zapiszRolke(); rysujZnaczniki(); }));
  box.querySelectorAll("[data-zskok]").forEach((x) => (x.onclick = () => { ED.wybranyZn = x.dataset.zskok; edSzukaj(znajdz(x.dataset.zskok).t); edRysujOs(); box.querySelectorAll(".ed-zn").forEach((el) => el.classList.toggle("wybrany", el.dataset.zid === ED.wybranyZn)); }));
  box.querySelectorAll("[data-zt]").forEach((x) => (x.oninput = () => { const z = znajdz(x.dataset.zt); z.tekst = x.value; if (z.stan === "zrobione") z.stan = "do zrobienia"; zapiszRolke(); odswiezLicznik(); }));
  box.querySelectorAll("[data-zstan]").forEach((x) => (x.onchange = () => { znajdz(x.dataset.zstan).stan = x.checked ? "zrobione" : "do zrobienia"; zapiszRolke(); edRysujOs(); rysujZnaczniki(); }));
  box.querySelectorAll("[data-zusun]").forEach((x) => (x.onclick = () => { r.znaczniki = r.znaczniki.filter((z) => z.id !== x.dataset.zusun); zapiszRolke(); edRysujOs(); rysujZnaczniki(); }));
}
function odswiezLicznik() {
  const lista = rolka().znaczniki || [];
  const n = lista.filter(doPoprawki).length, czeka = lista.filter((z) => z.autor === "claude" && !z.zaakceptowany && z.stan !== "zrobione").length;
  const b = $("#edClaude"); if (b) { b.textContent = `✦ Claude: popraw znaczniki (${n})`; b.disabled = !n; b.title = czeka ? `${czeka} uwag Claude czeka na Twoje ✓ albo ✕` : ""; }
}
function chwycZnacznik(e, p, k) {
  e.preventDefault(); e.stopPropagation();
  const r = rolka(), z = r.znaczniki[k], x0 = e.clientX, t0 = z.t;
  let ruszone = false;
  p.setPointerCapture(e.pointerId);
  p.onpointermove = (ev) => {
    if (!ruszone && Math.abs(ev.clientX - x0) < 3) return;
    ruszone = true;
    z.t = Math.max(0, r3(t0 + (ev.clientX - x0) / ED.pxs));
    p.style.left = z.t * ED.pxs + "px";
    edSzukaj(z.t);
  };
  p.onpointerup = () => {
    p.onpointermove = null; p.onpointerup = null;
    ED.wybranyZn = z.id;
    if (ruszone) { r.znaczniki.sort((a, b) => a.t - b.t); zapiszRolke(); } else edSzukaj(z.t);
    edRysujOs(); rysujZnaczniki();
    const ta = $(`#edZnaczniki [data-zt="${z.id}"]`); if (ta) { ta.scrollIntoView({ block: "nearest" }); if (!z.tekst) ta.focus(); }
  };
}

// ---------- Claude poprawia znaczniki ----------
function coWChwili(t) {
  const r = rolka(), cz = czasyUjec();
  const k = cz.findIndex((c) => t >= c.start && t < c.koniec);
  const u = r.ujecia[k];
  const uj = u ? `ujęcie ${k + 1} (${u.src || "plansza " + (u.kolor || "")}${u.src ? `, od ${r1(Number(u.od || 0) + (t - cz[k].start))} s pliku` : ""})` : "poza ujęciami";
  const sc = r.sceny.map((s, i) => ({ s, i })).filter(({ s }) => t >= s.start && t < Number(s.start) + Number(s.czas)).map(({ s, i }) => `scena #${i} ${s.szablon} (${r1(s.start)}-${r1(Number(s.start) + Number(s.czas))} s, dane ${JSON.stringify(s.dane || {})})`);
  return `${uj}; ${sc.length ? sc.join("; ") : "brak scen"}`;
}
function claudeZnaczniki() {
  const r = rolka(), P = S.projekt;
  const lista = (r.znaczniki || []).filter(doPoprawki);
  if (!lista.length) return toast("Dodaj znacznik i opisz, co poprawić (uwagi Claude zatwierdź przyciskiem ✓)");
  zapiszRolke();
  const opis = lista.map((z) => `- [${z.id}] ${r1(z.t)} s: „${z.tekst.trim()}”${z.propozycja ? `\n  (proponowana poprawka: ${z.propozycja})` : ""}\n  (co jest w tej chwili: ${coWChwili(z.t)})`).join("\n");
  otworzAsystenta({
    tytul: "Poprawki ze znaczników",
    powitanie: `Poprawiam ${lista.length} ${lista.length === 1 ? "miejsce" : lista.length < 5 ? "miejsca" : "miejsc"} ze znaczników i sprawdzam każde na klatkach.`,
    prompt: `Użyj skilla rolki-beauty, hyperframes i hyperframes-animation. Zasady z CLAUDE.md (marka, safe zone, bez obietnic medycznych, bez długich myślników).
Projekt: ${P.nazwa} (folder ${P.sciezka}). Montaż: ${P.sciezka}/kompozycja/rolka.json (ujęcia, sceny, napisy, efekty). Szablony scen: 04_SZABLONY_HF/compositions/ (opis pól: 04_SZABLONY_HF/README.md).
${OS().mian} oglądała rolkę w panelu i postawiła znaczniki z uwagami (pole „znaczniki” w rolka.json):
${opis}

Zadanie:
1. Dla każdego znacznika zrozum, czego chce, i popraw to w rolka.json: czasy scen (start, czas), ich dane (teksty, efekty, kolory, pozycje x/y), ujęcia (od, do, kolejność, przejscie_po, tempo, zoom_na, kadr), napisy, efekty. Szablony wspólne (bez prefiksu moj-) zmieniaj tylko, gdy w rolka.json naprawdę się nie da, a wtedy tak, żeby inne rolki działały jak wcześniej. Gdy trzeba nowej animacji, zrób szablon moj-<id> jak w 04_SZABLONY_HF/compositions/efekt-ae.html.
2. npm run zloz -- ${P.nazwa}, potem npx hyperframes snapshot ${P.sciezka}/kompozycja --at <czasy znaczników i chwile obok> --no-end. Obejrzyj klatki (Read) i sprawdź, że każda uwaga jest spełniona i nic innego się nie zepsuło. Nie renderuj filmu.
3. W rolka.json przy każdym poprawionym znaczniku ustaw "stan": "zrobione" i "odpowiedz": jedno krótkie zdanie po polsku, co zmieniłeś. Jeśli czegoś nie da się zrobić, zostaw "do zrobienia" i napisz w "odpowiedz" dlaczego. Nie usuwaj znaczników.
4. Napisz krótko w czacie, co zmieniłeś przy każdym znaczniku. Gdy uwaga jest niejasna, zadaj JEDNO pytanie z ostatnią linią OPCJE: a | b | c. Na końcu, gdy wszystko gotowe, ostatnia linia: GOTOWE`,
  });
}

// ---------- Claude-reżyser: ogląda całą rolkę i sam stawia znaczniki ----------
function claudeRezyser() {
  const r = rolka(), P = S.projekt;
  zapiszRolke();
  let retencja = "";
  try { const w = wynikRetencji(); retencja = `Wynik retencji z panelu: ${w.wynik}/100. Niezaliczone testy: ${w.testy.filter((t) => !t.ok).map((t) => t.zle || t.tekst).join("; ") || "brak"}.`; } catch {}
  const istniejace = (r.znaczniki || []).filter((z) => z.stan !== "zrobione").map((z) => `${r1(z.t)} s: ${z.tekst}`).join("; ");
  otworzAsystenta({
    tytul: "Claude ogląda rolkę",
    powitanie: "Oglądam całą rolkę klatka po klatce jak montażysta i reżyser. Postawię znaczniki tam, gdzie coś można zrobić lepiej. Zatwierdzisz je (✓) albo odrzucisz (✕) na osi.",
    prompt: `Użyj skilli rolki-beauty, hyperframes (references/review.md), hyperframes-animation i short-form-video. Zasady z CLAUDE.md. Wnioski z poprzednich rolek: 05_ARCHIWUM/wnioski.md (jeśli jest).
Projekt: ${P.nazwa} (folder ${P.sciezka}). Montaż: ${P.sciezka}/kompozycja/rolka.json, brief: ${P.sciezka}/brief.md, napisy: ${P.sciezka}/napisy/ (transcript.json albo slowa/*.json).
${retencja}
${istniejace ? `Znaczniki, które już są (nie powtarzaj ich): ${istniejace}` : ""}

Jesteś wymagającym reżyserem i montażystą rolek beauty na poziomie topowych kont. Zadanie:
1. npm run zloz -- ${P.nazwa}. Potem npx hyperframes check ${P.sciezka}/kompozycja --json (ostrzeżenia: line_unread, dead_stretch, text_below_floor, first_frame_empty) i npx hyperframes snapshot ${P.sciezka}/kompozycja --frames <ok. 2 na sekundę rolki> --no-end. Obejrzyj klatki (Read, najpierw contact sheet, potem pojedyncze klatki w ważnych miejscach) i przeczytaj, co jest mówione.
2. Oceń jak widz na telefonie: pierwsze 1-2 s (czy hook zatrzymuje kciuk, czy efekt/obietnica jest od razu), tempo (martwe miejsca, za długie ujęcia, brak zmiany co 2-3 s), czytelność napisów i scen (za krótko na ekranie, za małe, nachodzą na twarz/detal, poza safe zone), kolejność (czy efekt jest pokazany, czy jest przed/po z dopiskiem „efekt indywidualny”), zgodność tekstu z mową, przejścia, CTA (jedno, konkretne), dźwięk, zasady marki (zero obietnic medycznych).
3. Dla każdego problemu dopisz znacznik do "znaczniki" w rolka.json (nie usuwaj istniejących): {"id":"c<krótki unikalny>","t":<sekunda>,"tekst":"<co jest nie tak, po polsku, 1 zdanie>","propozycja":"<jak to poprawić, konkretnie: czasy, teksty, która scena/efekt>","waga":"krytyczne"|"wazne"|"kosmetyka","autor":"claude","stan":"do zrobienia"}. Najwyżej 8 znaczników, najważniejsze. Nie poprawiaj niczego sama: tylko znaczniki.
4. Napisz w czacie krótko: ogólna ocena (1-10) i 2-3 zdania, co najbardziej podniesie tę rolkę. Ostatnia linia: GOTOWE`,
  });
}

// ---------- rytm muzyki (scripts/bity.mjs -> kompozycja/bity.json) ----------
async function wczytajBity() {
  try {
    const r = await fetch(`/komp/${encodeURIComponent(S.projekt.nazwa)}/bity.json?v=${Date.now()}`);
    ED.bity = r.ok ? await r.json() : null;
  } catch { ED.bity = null; }
  const el = $("#edBpm"); if (el) el.textContent = ED.bity ? `${ED.bity.bpm} BPM, bit co ${String(ED.bity.okres).replace(".", ",")} s` : "";
  edRysujOs();
}
function wykryjRytm() {
  const r = rolka();
  let args = [S.projekt.nazwa];
  if (!r.muzyka?.src) {
    const bpm = prompt("Ta rolka nie ma muzyki w pliku (dodasz ją w Instagramie). Podaj tempo piosenki w BPM (np. 100), zrobię siatkę rytmu:", "100");
    if (!bpm) return;
    args.push("--bpm", String(Number(bpm) || 100));
  }
  uruchom("bity", args, { opis: "Wykrywanie rytmu", po: async ({ kod }) => { if (!kod) await wczytajBity(); } });
}
// Cięcia ujęć i starty scen na najbliższy bit (najwyżej 0,35 s przesunięcia). Hook na 0 s zostaje.
function dopasujDoRytmu() {
  if (!ED.bity?.bity?.length) return toast("Najpierw „🎵 Wykryj rytm”");
  const r = rolka(), bity = ED.bity.bity, MAX = 0.35;
  const najblizszy = (t) => bity.reduce((a, b) => (Math.abs(b - t) < Math.abs(a - t) ? b : a), bity[0]);
  let cieciaN = 0, scenyN = 0;
  for (let i = 0; i < r.ujecia.length - 1; i++) {
    const c = czasyUjec()[i], u = r.ujecia[i];
    const cel = najblizszy(c.koniec), d = cel - c.koniec;
    if (Math.abs(d) < 0.02 || Math.abs(d) > MAX || (Array.isArray(u.segmenty) && u.segmenty.length > 1)) continue;
    if (!u.src || /\.(jpe?g|png|webp)$/i.test(u.src)) { u.czas = r3(Math.max(0.5, Number(u.czas || 2) + d)); cieciaN++; continue; }
    const tempo = Number(u.tempo) > 0 ? Number(u.tempo) : 1;
    const dl = metaPliku(u.src)?.czas;
    const nowyDo = r3(Number(u.do ?? dl ?? 0) + d * tempo);
    if (dl && nowyDo > dl - 0.03) continue;
    if (nowyDo - Number(u.od || 0) < 0.5) continue;
    u.do = nowyDo; cieciaN++;
  }
  for (const s of r.sceny) {
    if (Number(s.start) < 0.05) continue;
    const cel = najblizszy(Number(s.start)), d = cel - Number(s.start);
    if (Math.abs(d) < 0.02 || Math.abs(d) > MAX) continue;
    s.start = r3(cel); scenyN++;
  }
  edRysujOs(); zapiszIZloz();
  toast(`W rytmie: ${cieciaN} cięć i ${scenyN} scen przesuniętych na bit`, 3000);
}

// ---------- „Zrób jak ta rolka” (scripts/wzor.mjs -> kompozycja/wzor.json) ----------
async function wczytajWzor() {
  try {
    const r = await fetch(`/komp/${encodeURIComponent(S.projekt.nazwa)}/wzor.json?v=${Date.now()}`);
    ED.wzor = r.ok ? await r.json() : null;
  } catch { ED.wzor = null; }
  edRysujOs();
}
function claudeWzor() {
  const P = S.projekt;
  zapiszRolke();
  otworzAsystenta({
    tytul: "Montaż jak wzór",
    powitanie: "Oglądam rolkę-wzór (klatki i rytm cięć) i układam Twoje nagrania według tego samego szkieletu. Tor „wzór” na osi pokaże, czy cięcia się pokrywają.",
    prompt: `Użyj skilli rolki-beauty, short-form-video, hyperframes i hyperframes-animation. Zasady z CLAUDE.md (marka, safe zone, zgoda na wizerunek, zero obietnic medycznych, przed/po z „efekt indywidualny”).
Projekt: ${P.nazwa} (folder ${P.sciezka}). Montaż: ${P.sciezka}/kompozycja/rolka.json. Nagrania: ${P.sciezka}/proxy/ i raw/ (ich obraz: ffmpeg/klatki albo npx hyperframes snapshot), kwestie: ${P.sciezka}/napisy/kwestie.json i scenariusz.json (jeśli są), brief: ${P.sciezka}/brief.md.
Rolka-wzór (cudza inspiracja, tylko do analizy): ${P.sciezka}/kompozycja/wzor.json (ujęcia od-do, długości, cięcia na 10 s, głośność co 0,5 s) i klatki ${P.sciezka}/kompozycja/wzor/klatka_*.jpg.

Zadanie:
1. Obejrzyj klatki wzoru (Read) razem z wzor.json i rozpisz jego szkielet: rola każdego ujęcia (hook, problem, proces, detal/zbliżenie, efekt, przed/po, cena/oferta, CTA), typ kadru (plan ogólny, zbliżenie, makro, twarz do kamery), tekst na ekranie (ile, gdzie, jak animowany), tempo cięć, gdzie jest punkt kulminacyjny. Zapisz to krótko w ${P.sciezka}/brief.md w sekcji „## Wzór montażu”.
2. Ułóż ${P.sciezka}/kompozycja/rolka.json według tego szkieletu z NASZYCH nagrań: podobna liczba ujęć i długości (±20%), hook w tym samym czasie, efekt i CTA w podobnych miejscach, sceny z naszych szablonów (hook-tytul, tekst-animowany, efekt-ae, glebia-tla, przed-po, cena-oferta, cta-koncowe…) w roli tekstów wzoru. Mowa z kwestie.json (wybrane od-do) ma pierwszeństwo przed rytmem: nie tnij w środku słowa. Nie używaj żadnego pliku z folderu wzor/ w montażu. Zachowaj zgodę na wizerunek i zasady marki.
3. npm run zloz -- ${P.nazwa}, potem npx hyperframes snapshot ${P.sciezka}/kompozycja --frames 12 --no-end. Obejrzyj i popraw, co odstaje. Nie renderuj filmu.
4. Napisz krótko: szkielet wzoru w 4-6 punktach i co z niego przeniosłaś. Jeśli brakuje nagrań do jakiejś roli (np. brak zbliżenia na efekt), napisz, co dograć (konkretne ujęcie), i zostaw w tym miejscu planszę. Na końcu linia: GOTOWE`,
  });
}

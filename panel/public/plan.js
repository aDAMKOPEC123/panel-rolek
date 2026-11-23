// Plan rolek na tydzień (scripts/plan-tygodnia.mjs, API /api/plan, /api/kalendarz/wpis): karta na starcie (oba tryby),
// przypomnienie „Dziś nagrywasz”, szczegóły rolki (po id wpisu) z listą ujęć i przejściem do scenariusza, Autopilota albo telefonu,
// przeniesienie na inny dzień i usunięcie. Pełny miesiąc: kalendarz.js.
"use strict";

const PL = { od: null, dane: null };
const DNI_KROTKO = ["Pn", "Wt", "Śr", "Cz", "Pt", "So", "Nd"];
const DNI_KLUCZE = ["pn", "wt", "sr", "cz", "pt", "so", "nd"];
const STANY_PLANU = { plan: ["🗒️", "w planie"], scenariusz: ["✍️", "scenariusz"], nagrane: ["🎬", "nagrane"], gotowa: ["✅", "gotowa"], opublikowana: ["📤", "opublikowana"], pominieta: ["⏭️", "pominięta"] };
const dataPl = (s, opcje = { day: "numeric", month: "short" }) => new Date(s + "T12:00").toLocaleDateString("pl-PL", opcje);
const dodajDni = (s, n) => { const d = new Date(s + "T12:00"); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const ponPl = (s) => dodajDni(s, -((new Date(s + "T12:00").getDay() + 6) % 7));
const akcentHtml = (t) => esc(t).replace(/\*([^*]+)\*/g, "<em>$1</em>");
// po każdej zmianie: karta tygodnia na starcie i (jeśli otwarty) kalendarz miesiąca
function poZmianiePlanu() { kartaPlanu(PL.od); if (typeof odswiezKalendarz === "function") odswiezKalendarz(); }

async function wczytajTydzien(od) { PL.dane = await api(`/api/plan${od ? `?od=${od}` : ""}`); PL.od = PL.dane.od; return PL.dane; }

async function kartaPlanu(od) {
  const box = $("#planKarta");
  try { await wczytajTydzien(od); } catch { if (box) box.innerHTML = ""; return; }
  if (!box) return;
  const { plan, dzis } = PL.dane;
  const tenTydzien = PL.od <= dzis && dzis <= dodajDni(PL.od, 6);
  const nawigacja = `<div class="pl-nawigacja"><button class="btn maly jasny" data-tydzien="-7" title="Poprzedni tydzień">←</button><b>${dataPl(PL.od)} – ${dataPl(dodajDni(PL.od, 6))}</b>${tenTydzien ? '<span class="chip">ten tydzień</span>' : ""}<button class="btn maly jasny" data-tydzien="7" title="Następny tydzień">→</button><button class="btn maly jasny" id="plKalendarz" title="Cały miesiąc, przeciąganie rolek, eksport do telefonu">🗓️ Kalendarz miesiąca</button></div>`;
  if (!plan || !plan.dni.length) {
    const ok = (PL.dane.okazje || []).slice(0, 3);
    box.innerHTML = `<div class="karta pl-karta"><div class="naglowek"><div><h3>🗓️ Plan rolek na tydzień</h3>${nawigacja}
      <p class="podpowiedz">Claude ułoży 2-5 rolek na wybrane dni: pod porę roku${ok.length ? ` i okazje (${ok.map((o) => esc(o.okazja.split(" (")[0])).join(", ")})` : ""}, Twoje usługi, grafik zabiegów i pytania klientek. Przy każdej: gotowy scenariusz, co nagrać i kiedy.</p></div>
      <button class="btn" id="plUloz">✦ Ułóż plan${tenTydzien ? " na ten tydzień" : ""}</button></div></div>`;
    podepnijPlan(box);
    return;
  }
  const okazjeDnia = (data) => (plan.okazje || []).filter((o) => o.data === data);
  const aktywne = (d) => !["opublikowana", "pominieta"].includes(d.stan);
  const doNagrania = plan.dni.filter((d) => d.nagraj_dnia === dzis && ["plan", "scenariusz"].includes(d.stan || "plan"));
  const doPublikacji = plan.dni.filter((d) => d.data === dzis && aktywne(d) && !doNagrania.includes(d));
  const wTyg = plan.dni.filter((d) => d.stan !== "pominieta");
  const postep = `${wTyg.filter((d) => d.pomysl || d.projekt).length}/${wTyg.length} scenariusze · ${wTyg.filter((d) => ["nagrane", "gotowa", "opublikowana"].includes(d.stan)).length}/${wTyg.length} nagrane · ${wTyg.filter((d) => d.stan === "opublikowana").length}/${wTyg.length} opublikowane`;
  box.innerHTML = `<div class="karta pl-karta">
    <div class="naglowek"><div><h3>🗓️ Plan na tydzień <small class="podpowiedz">${esc(plan.motyw || "")}</small></h3>${nawigacja}<p class="podpowiedz pl-postep">${postep}</p></div>
      <div class="rzad" style="gap:6px">${plan.dni.some((d) => !d.pomysl && !d.projekt && d.stan !== "pominieta") ? `<button class="btn maly" id="plScenariusze" data-zadanie title="Pełne scenariusze z oceną dla rolek bez scenariusza">✍️ Napisz scenariusze</button>` : ""}<button class="btn maly jasny" id="plUloz">↻ Ułóż od nowa</button></div></div>
    ${doNagrania.map((d) => `<button class="pl-dzis" data-wpis="${d.id}">📅 <b>Dziś nagrywasz:</b> ${esc(d.tytul)} <span>(publikacja ${DNI_KROTKO[(new Date(d.data + "T12:00").getDay() + 6) % 7]} ${dataPl(d.data)}) · co nagrać →</span></button>`).join("")}
    ${doPublikacji.map((d) => `<button class="pl-dzis publikacja" data-wpis="${d.id}">📤 <b>Dziś publikujesz:</b> ${esc(d.tytul)} <span>o ${esc(d.godzina || "18:00")}${d.stan === "gotowa" ? " · film gotowy" : " · " + STANY_PLANU[d.stan || "plan"][1]} →</span></button>`).join("")}
    <div class="pl-tydzien">${DNI_KROTKO.map((n, i) => {
      const data = dodajDni(PL.od, i);
      const nagrywanie = plan.dni.filter((x) => x.nagraj_dnia === data && x.data !== data && ["plan", "scenariusz"].includes(x.stan || "plan"));
      return `<div class="pl-dzien ${data === dzis ? "dzis" : ""} ${data < dzis ? "minal" : ""}">
        <div class="pl-data"><b>${n}</b> ${dataPl(data, { day: "numeric" })}</div>
        ${okazjeDnia(data).map((o) => `<span class="pl-okazja" title="${esc(o.okazja)}">${esc(o.okazja.split(" (")[0])}</span>`).join("")}
        ${plan.dni.filter((d) => d.data === data).map((d) => kafelekRolki(d)).join("")}
        ${nagrywanie.map((x) => `<button class="pl-nagraj" data-wpis="${x.id}" title="Nagraj dziś do rolki z ${dataPl(x.data)}">🎥 nagraj: ${esc(x.tytul.split(" ").slice(0, 3).join(" "))}…</button>`).join("")}
      </div>`;
    }).join("")}</div>
    ${plan.uwagi ? `<p class="podpowiedz" style="margin:10px 0 0">💡 ${esc(plan.uwagi)}</p>` : ""}</div>`;
  podepnijPlan(box);
}
function kafelekRolki(d, { przeciagany = false } = {}) {
  const st = STANY_PLANU[d.stan || "plan"];
  return `<button class="pl-rolka ${d.stan || "plan"}" data-wpis="${d.id}" ${przeciagany ? `draggable="true"` : ""} title="${esc(d.tytul)}"><span class="pl-ikona">${IKONY[d.kategoria] || "✨"}</span><b>${esc(d.tytul)}</b><small>${st[0]} ${st[1]} · ${d.wyglad === "naturalny" ? "🤳" : "📣"}${d.ocena ? ` · ${d.ocena} pkt` : ""}${d.wlasny ? " · Twój" : ""}</small></button>`;
}
function podepnijPlan(box) {
  box.querySelectorAll("[data-tydzien]").forEach((b) => (b.onclick = () => kartaPlanu(dodajDni(PL.od, Number(b.dataset.tydzien)))));
  box.querySelectorAll("[data-wpis]").forEach((b) => (b.onclick = () => szczegolyRolki(b.dataset.wpis, PL.od)));
  const u = $("#plUloz", box); if (u) u.onclick = oknoUkladania;
  const k = $("#plKalendarz", box); if (k) k.onclick = () => otworzKalendarz(PL.od.slice(0, 7));
  const sc = $("#plScenariusze", box);
  if (sc) sc.onclick = () => uruchom("plan-tygodnia", ["--od", PL.od, "--tylko-scenariusze"], { opis: "Scenariusze dla planu tygodnia", po: ({ kod }) => { if (!kod) toast("Scenariusze gotowe ✓", 2500); poZmianiePlanu(); } });
}

async function oknoUkladania(odTyg) {
  if (!S.start?.claude) return toast("Plan układa Claude: zainstaluj i zaloguj Claude Code (⚙ Ustawienia gabinetu > Programy)", 5000);
  if (typeof odTyg === "string" && odTyg !== PL.od) { try { await wczytajTydzien(odTyg); } catch (e) { return blad(e); } }
  const ust = PL.dane?.plan?.ustawienia || {};
  let dni = new Set(ust.dni || ["pn", "sr", "pt"]);
  const grafik = await api("/api/grafik").catch(() => ({}));
  const tydzien = DNI_KLUCZE.map((k, i) => [k, dodajDni(PL.od, i)]);
  const maGrafik = tydzien.some(([, d]) => grafik[d]);
  const zaczete = (PL.dane?.plan?.dni || []).filter((d) => d.wlasny || d.pomysl || d.projekt).length;
  const m = modal(`<h2>🗓️ Plan na tydzień ${dataPl(PL.od)} – ${dataPl(dodajDni(PL.od, 6))}</h2>
    ${PL.dane?.plan?.dni?.length ? `<p class="ramka ostrzezenie">Rolki tylko „w planie” zostaną zastąpione nowymi.${zaczete ? ` ${zaczete} już zaczęte albo Twoje zostają.` : ""}</p>` : ""}
    <p class="kr-etykieta">W które dni publikujesz? <small class="podpowiedz">jedna rolka na zaznaczony dzień</small></p>
    <div class="pl-wybor-dni">${DNI_KROTKO.map((n, i) => `<button class="${dni.has(DNI_KLUCZE[i]) ? "wybrany" : ""}" data-d="${DNI_KLUCZE[i]}">${n}</button>`).join("")}</div>
    <p class="podpowiedz" id="plIle"></p>
    <details class="pl-grafik" ${maGrafik ? "open" : ""}><summary><b>📋 Co masz w grafiku?</b> <small class="podpowiedz">wizyty, przy których da się nagrać: rolki trafią w to, co i tak robisz</small></summary>
      <div class="pl-grafik-dni">${tydzien.map(([, d], i) => `<label><span>${DNI_KROTKO[i]} ${dataPl(d, { day: "numeric" })}</span><input data-grafik="${d}" value="${esc(grafik[d] || "")}" placeholder="np. laminacja rzęs 10:00, 2x pedicure"></label>`).join("")}</div></details>
    <label class="pole"><span>Coś, o czym Claude ma wiedzieć? (opcjonalnie)</span><textarea id="plUwagi" rows="3" placeholder="np. w czwartek mam promocję na laminację; w piątek gabinet zamknięty; chcę więcej podologii">${esc(ust.uwagi || "")}</textarea></label>
    <label class="rzad"><input type="checkbox" id="plScen" checked> ✍️ Od razu napisz pełne scenariusze z oceną (+2-4 min, ok. 0,3-0,6 USD)</label>
    <label class="rzad" style="margin-top:6px"><input type="checkbox" id="plDopr"> 🎯 I dopracuj każdy z recenzentką do 85 pkt (ok. 1,5 USD i kilka minut na rolkę, w tle)</label>
    <p class="podpowiedz" style="margin-top:8px">Sam plan: ok. 30 s i 0,1 USD z konta Claude Code.</p>
    <div class="rzad"><button class="btn duzy" id="plStart" data-zadanie>✦ Ułóż plan</button><button class="btn jasny" id="plNie">Anuluj</button></div>`);
  const ile = () => { $("#plIle", m).textContent = dni.size ? `${dni.size} ${dni.size === 1 ? "rolka" : dni.size < 5 ? "rolki" : "rolek"} w tygodniu${dni.size > 5 ? " (dużo: rozważ 3-4, żeby nadążyć z nagraniami)" : ""}` : "Zaznacz choć jeden dzień"; };
  ile();
  m.querySelectorAll("[data-d]").forEach((b) => (b.onclick = () => { dni.has(b.dataset.d) ? dni.delete(b.dataset.d) : dni.add(b.dataset.d); b.classList.toggle("wybrany"); ile(); }));
  $("#plNie", m).onclick = zamknijModal;
  $("#plStart", m).onclick = async () => {
    if (!dni.size) return toast("Zaznacz choć jeden dzień");
    const lista = DNI_KLUCZE.filter((k) => dni.has(k));
    const uwagi = $("#plUwagi", m).value.trim();
    const wpisy = {}; m.querySelectorAll("[data-grafik]").forEach((i) => (wpisy[i.dataset.grafik] = i.value.trim()));
    const scen = $("#plScen", m).checked, dopr = $("#plDopr", m).checked;
    zamknijModal();
    await api("/api/grafik", { method: "PUT", body: { wpisy } }).catch(() => {});
    uruchom("plan-tygodnia", ["--od", PL.od, "--dni", lista.join(","), ...(uwagi ? ["--uwagi", uwagi] : []), ...(scen ? ["--scenariusze"] : []), ...(scen && dopr ? ["--dopracuj"] : [])],
      { opis: scen ? "Plan tygodnia ze scenariuszami" : "Plan rolek na tydzień", po: ({ kod }) => { if (!kod) toast(scen ? "Plan i scenariusze gotowe ✓" : "Plan gotowy ✓", 2500); poZmianiePlanu(); } });
  };
}

async function szczegolyRolki(id, od) {
  if (od && od !== PL.od) { try { await wczytajTydzien(od); } catch (e) { return blad(e); } }
  const d = PL.dane?.plan?.dni.find((x) => x.id === id); if (!d) return toast("Tej rolki już nie ma w planie");
  const st = STANY_PLANU[d.stan || "plan"];
  const dzienTyg = (s) => new Date(s + "T12:00").toLocaleDateString("pl-PL", { weekday: "long", day: "numeric", month: "long" });
  const klucz = `plan_ujecia_${d.id}`;
  let zaznaczone = {}; try { zaznaczone = JSON.parse(localStorage.getItem(klucz) || "{}"); } catch {}
  const uj = d.co_nagrac || [];
  const m = modal(`<div class="pl-szczegoly">
    <div class="rzad" style="gap:6px;margin-bottom:6px"><span class="chip">${IKONY[d.kategoria] || "✨"} ${esc(NAZWY_KAT[d.kategoria] || d.kategoria)}</span>${d.format ? `<span class="chip">${esc(d.format)}</span>` : ""}<span class="chip">${d.wyglad === "naturalny" ? "🤳 naturalny" : "📣 reklamowy"}</span><span class="chip status">${st[0]} ${st[1]}</span>${d.wlasny ? `<span class="chip">✏️ Twój pomysł</span>` : ""}</div>
    <h2>${esc(d.tytul)}</h2>
    <p class="podpowiedz">📤 Publikacja: <b>${dzienTyg(d.data)}, ${esc(d.godzina || "18:00")}</b>${d.nagraj_dnia ? ` · 🎥 Nagraj: <b>${dzienTyg(d.nagraj_dnia)}</b>` : ""}${d.kiedy_nagrac ? ` (${esc(d.kiedy_nagrac)})` : ""}</p>
    ${d.hook_tekst ? `<div class="pl-hook"><small>Hook na ekranie</small><b>${akcentHtml(d.hook_tekst)}</b>${d.hook_mowa ? `<small>Pierwsze zdanie</small><span>„${esc(d.hook_mowa)}”</span>` : ""}</div>` : ""}
    ${d.dlaczego_teraz ? `<p>💡 ${esc(d.dlaczego_teraz)}</p>` : ""}
    ${d.pytanie_klientki ? `<p class="podpowiedz">💬 Odpowiada na pytanie klientki: „${esc(d.pytanie_klientki)}”</p>` : ""}
    ${uj.length ? `<h3>Co nagrać</h3><ul class="pl-ujecia">${uj.map((u, i) => `<li><label><input type="checkbox" data-uj="${i}" ${zaznaczone[i] ? "checked" : ""}><span><b>${esc(u.co)}</b><small>${esc(u.jak)}</small></span></label></li>`).join("")}</ul>`
      : d.pomysl || d.projekt ? "" : `<p class="podpowiedz">Listę ujęć, hook i teleprompter dostaniesz po „✦ Rozpisz scenariusz”.</p>`}
    ${d.cta ? `<p class="podpowiedz">Na koniec: „${esc(d.cta)}”</p>` : ""}
    <div class="pl-akcje">
      ${d.projekt ? `<button class="btn duzy" id="pdRolka">🎬 Otwórz rolkę</button>`
        : d.pomysl ? `<button class="btn duzy" id="pdPomysl">✍️ Otwórz scenariusz${d.ocena ? ` (${d.ocena} pkt)` : ""}</button><button class="btn jasny" id="pdAuto">🪄 Mam nagrania: zmontuj</button>`
        : `<button class="btn duzy" id="pdScenariusz">✦ Rozpisz scenariusz z Claude</button><button class="btn jasny" id="pdAuto">🪄 Mam już nagrania: zmontuj</button>`}
      <button class="btn jasny" id="pdTel">📱 Nagram telefonem</button>
    </div>
    <div class="pl-przenies"><label>📅 Przenieś na <input type="date" id="pdData" value="${d.data}"></label> <label>o <input type="time" id="pdGodz" value="${esc(d.godzina || "18:00")}"></label><button class="btn maly jasny" id="pdPrzenies">Zapisz</button></div>
    <div class="pl-akcje-male">
      ${!d.projekt && !d.pomysl && !d.wlasny ? `<button class="link" id="pdInny">↻ Inny pomysł na ten dzień</button>` : ""}
      ${d.stan !== "opublikowana" ? `<button class="link" id="pdOpub">✓ Opublikowana</button>` : ""}
      ${d.stan !== "pominieta" ? `<button class="link" id="pdPomin">⏭️ Pomiń</button>` : `<button class="link" id="pdPrzywroc">↶ Przywróć</button>`}
      <button class="link" id="pdUsun">🗑 Usuń z planu</button>
      <button class="link" id="pdZamknij">Zamknij</button>
    </div></div>`);
  m.querySelectorAll("[data-uj]").forEach((c) => (c.onchange = () => { zaznaczone[c.dataset.uj] = c.checked; try { localStorage.setItem(klucz, JSON.stringify(zaznaczone)); } catch {} }));
  const on = (sel, fn) => { const b = $(sel, m); if (b) b.onclick = fn; };
  const ustaw = async (zmiany) => { try { await api(`/api/kalendarz/wpis/${d.id}`, { method: "PUT", body: zmiany }); } catch (e) { blad(e); } };
  on("#pdZamknij", zamknijModal);
  on("#pdRolka", () => { zamknijModal(); zamknijKalendarz?.(); otworz(d.projekt, trybProsty() ? 0 : 2); });
  on("#pdPomysl", () => { zamknijModal(); zamknijKalendarz?.(); otworzPomysl(d.pomysl); });
  on("#pdTel", () => { zamknijModal(); oknoTelefonu(); });
  on("#pdScenariusz", async () => { zamknijModal(); zamknijKalendarz?.(); await scenariuszZPlanu(d); });
  on("#pdAuto", () => { zamknijModal(); zamknijKalendarz?.(); startAutopilota({ kat: d.kategoria, temat: d.tytul, notatki: opisDniaDlaClaude(d), po: (nazwa) => ustaw({ projekt: nazwa, stan: "nagrane" }) }); });
  on("#pdInny", () => { zamknijModal(); uruchom("plan-tygodnia", ["--od", ponPl(d.data), "--zamien", d.data], { opis: "Inny pomysł na rolkę", po: poZmianiePlanu }); });
  on("#pdOpub", async () => { await ustaw({ stan: "opublikowana" }); zamknijModal(); poZmianiePlanu(); toast("Brawo! 📤"); });
  on("#pdPomin", async () => { await ustaw({ stan: "pominieta" }); zamknijModal(); poZmianiePlanu(); });
  on("#pdPrzywroc", async () => { await ustaw({ stan: "plan" }); zamknijModal(); poZmianiePlanu(); });
  on("#pdPrzenies", async () => {
    const nowa = $("#pdData", m).value, godz = $("#pdGodz", m).value;
    try {
      if (nowa && nowa !== d.data) await api("/api/kalendarz/przenies", { method: "POST", body: { id: d.id, data: nowa } });
      if (godz && godz !== d.godzina) await ustaw({ godzina: godz });
      zamknijModal(); toast(`Przeniesiono na ${dataPl(nowa)} ✓`); PL.od = ponPl(nowa); poZmianiePlanu();
    } catch (e) { blad(e); }
  });
  on("#pdUsun", async () => {
    if (!confirm(`Usunąć „${d.tytul}” z planu?${d.pomysl ? " Scenariusz zostaje na liście pomysłów." : ""}`)) return;
    try { await api(`/api/kalendarz/wpis/${d.id}`, { method: "DELETE" }); zamknijModal(); poZmianiePlanu(); } catch (e) { blad(e); }
  });
}
function opisDniaDlaClaude(d) {
  return `Rolka z planu tygodnia (${d.data}, publikacja ${d.godzina || "18:00"}): ${d.tytul}.${d.format ? ` Format: ${d.format}.` : ""} Wygląd: ${d.wyglad}.${d.hook_tekst ? ` Hook na ekranie: ${d.hook_tekst}.` : ""}${d.hook_mowa ? ` Pierwsze zdanie: „${d.hook_mowa}”.` : ""}${d.dlaczego_teraz ? ` Dlaczego teraz / notatka: ${d.dlaczego_teraz}.` : ""}${(d.co_nagrac || []).length ? ` Ujęcia: ${d.co_nagrac.map((u) => `${u.co} (${u.jak})`).join("; ")}.` : ""}${d.cta ? ` CTA: ${d.cta}.` : ""}`;
}
// Scenariusz z Claude (ekran pomysłu): ten sam przebieg co „✦ Wymyśl nową rolkę” z gotowym pomysłem z planu.
async function scenariuszZPlanu(d) {
  if (!S.start?.claude) return toast("Scenariusz pisze Claude: zainstaluj i zaloguj Claude Code", 5000);
  try {
    const przepis = (await api(`/api/algorytm/przepis?tryb=mieszany&proba=0`).catch(() => ({ tekst: "" }))).tekst;
    const p = await api("/api/pomysly", { method: "POST", body: { tryb: "pomysl" } });
    await api(`/api/kalendarz/wpis/${d.id}`, { method: "PUT", body: { pomysl: p.id, stan: "scenariusz" } });
    wczytajPomysl(p);
    pokazPomysl();
    const tekst = `${opisDniaDlaClaude(d)} Zrób z tego scenariusz (możesz poprawić hook, jeśli znajdziesz mocniejszy). Kategoria: ${d.kategoria}. ${d.wyglad === "naturalny" ? "Wygląd naturalny, jak vlog." : ""}`;
    wyslijPomysl(promptPomyslu("pomysl", tekst) + (przepis ? `\n\nPRZEPIS Z WYNIKÓW ${OS().dop.toUpperCase()} (samouczący się algorytm panelu):\n${przepis}` : ""), `🗓️ Z planu: ${d.tytul}`);
  } catch (e) { blad(e); }
}

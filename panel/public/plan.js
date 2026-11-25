// Plan rolek na tydzień (scripts/plan-tygodnia.mjs, API /api/plan, /api/kalendarz/wpis): karta na starcie (oba tryby),
// przypomnienie „Dziś nagrywasz”, szczegóły rolki (po id wpisu) z listą ujęć i przejściem do scenariusza, Autopilota albo telefonu,
// przeniesienie na inny dzień i usunięcie. Pełny miesiąc: kalendarz.js.
"use strict";

const PL = { od: null, dane: null };
const DNI_KROTKO = ["Pn", "Wt", "Śr", "Cz", "Pt", "So", "Nd"];
const DNI_KLUCZE = ["pn", "wt", "sr", "cz", "pt", "so", "nd"];
const STANY_PLANU = { plan: ["🗒️", "w planie"], scenariusz: ["✍️", "scenariusz"], nagrane: ["🎬", "nagrane"], gotowa: ["✅", "gotowa"], opublikowana: ["📤", "opublikowana"], pominieta: ["⏭️", "pominięta"] };
const stanPlanu = (d) => STANY_PLANU[d.stan] || STANY_PLANU.plan;
const typWpisu = (d) => d.typ_publikacji || "rolka";
const czyWpisRolki = (d) => typWpisu(d) === "rolka";
const formatWpisu = (d) => S.start.publikacje.formaty[typWpisu(d)] || S.start.publikacje.formaty.rolka;
const celWpisu = (d) => d.cel_publikacji && d.cel_publikacji !== "dowolny" ? S.start.publikacje.cele[d.cel_publikacji] || "" : "";
const opcjaPublikacjiHtml = (k, n, wybrany) => `<option value="${esc(k)}"${k === wybrany ? " selected" : ""}>${esc(n)}</option>`;
const wybierzFormatPublikacji = (wybrany, zPauza = false) =>
  (zPauza ? opcjaPublikacjiHtml("", "Bez publikacji", wybrany) : "") +
  Object.entries(S.start.publikacje.formaty).map(([k, f]) => opcjaPublikacjiHtml(k, f.nazwa, wybrany)).join("");
const wybierzCelPublikacji = (wybrany) => Object.entries(S.start.publikacje.cele).map(([k, n]) => opcjaPublikacjiHtml(k, n, wybrany)).join("");
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
  // Claude nie zna gabinetu: wywiad z kreatora (krok „gabinet”, scripts/gabinet.mjs)
  const bezProfilu = PL.dane.gabinet === false ? `<button class="pl-dzis pl-gabinet" id="plGabinet">🏥 <b>Claude nie zna jeszcze Twojego gabinetu.</b> <span>Opowiedz o zabiegach, cenach i klientkach albo podaj stronę www (3 min), a plan i pomysły trafią w Twoją ofertę →</span></button>` : "";
  const tenTydzien = PL.od <= dzis && dzis <= dodajDni(PL.od, 6);
  const nawigacja = `<div class="pl-nawigacja"><button class="btn maly jasny" data-tydzien="-7" title="Poprzedni tydzień">←</button><b>${dataPl(PL.od)} – ${dataPl(dodajDni(PL.od, 6))}</b>${tenTydzien ? '<span class="chip">ten tydzień</span>' : ""}<button class="btn maly jasny" data-tydzien="7" title="Następny tydzień">→</button><button class="btn maly jasny" id="plKalendarz" title="Cały miesiąc, przeciąganie rolek, eksport do telefonu">🗓️ Kalendarz miesiąca</button></div>`;
  if (!plan || !plan.dni.length) {
    const ok = (PL.dane.okazje || []).slice(0, 3);
    box.innerHTML = `<div class="karta pl-karta"><div class="naglowek"><div><h3>🗓️ Plan publikacji na tydzień</h3>${nawigacja}
      <p class="podpowiedz">Ustal dni na rolki, posty, karuzele i animowane Story.${ok.length ? ` Okazje w pobliżu: ${ok.map((o) => esc(o.okazja.split(" (")[0])).join(", ")}.` : ""}</p></div>
      <button class="btn" id="plUloz">Zaplanuj tydzień</button></div>${bezProfilu}</div>`;
    podepnijPlan(box);
    return;
  }
  const okazjeDnia = (data) => (plan.okazje || []).filter((o) => o.data === data);
  const aktywne = (d) => !["opublikowana", "pominieta"].includes(d.stan);
  const doNagrania = plan.dni.filter((d) => czyWpisRolki(d) && d.nagraj_dnia === dzis && ["plan", "scenariusz"].includes(d.stan || "plan"));
  const doPublikacji = plan.dni.filter((d) => d.data === dzis && aktywne(d) && !doNagrania.includes(d));
  const wTyg = plan.dni.filter((d) => d.stan !== "pominieta");
  const postep = `${wTyg.length} w planie · ${wTyg.filter((d) => d.stan === "opublikowana").length} opublikowane`;
  box.innerHTML = `<div class="karta pl-karta">
    <div class="naglowek"><div><h3>🗓️ Plan na tydzień <small class="podpowiedz">${esc(plan.motyw || "")}</small></h3>${nawigacja}<p class="podpowiedz pl-postep">${postep}</p></div>
      <div class="rzad" style="gap:6px">${plan.dni.some((d) => czyWpisRolki(d) && !d.termin && !d.pomysl && !d.projekt && (d.stan || "plan") === "plan") ? `<button class="btn maly" id="plScenariusze" data-zadanie title="Scenariusze dla zaplanowanych rolek">✍️ Napisz scenariusze rolek</button>` : ""}<button class="btn maly jasny" id="plUloz">Edytuj tydzień</button></div></div>
    ${bezProfilu}
    ${doNagrania.map((d) => `<button class="pl-dzis" data-wpis="${d.id}">📅 <b>Dziś nagrywasz:</b> ${esc(d.tytul)} <span>(publikacja ${DNI_KROTKO[(new Date(d.data + "T12:00").getDay() + 6) % 7]} ${dataPl(d.data)}) · co nagrać →</span></button>`).join("")}
    ${doPublikacji.map((d) => `<button class="pl-dzis publikacja" data-wpis="${d.id}">📤 <b>Dziś publikujesz:</b> ${esc(d.tytul)} <span>o ${esc(d.godzina || "18:00")} · ${stanPlanu(d)[1]} →</span></button>`).join("")}
    <div class="pl-tydzien">${DNI_KROTKO.map((n, i) => {
      const data = dodajDni(PL.od, i);
      const nagrywanie = plan.dni.filter((x) => czyWpisRolki(x) && x.nagraj_dnia === data && x.data !== data && ["plan", "scenariusz"].includes(x.stan || "plan"));
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
  const st = stanPlanu(d), format = formatWpisu(d), cel = celWpisu(d);
  const jakosc = d.jakosc_publikacji;
  const ocena = jakosc?.recenzja?.ai?.ocena;
  return `<button class="pl-rolka ${esc(d.stan || "plan")}" data-typ-publikacji="${esc(typWpisu(d))}" data-wpis="${esc(d.id)}" ${przeciagany ? 'draggable="true"' : ""} title="${esc(d.tytul)}"><span class="pl-typ-publikacji">${format.ikona} ${esc(format.nazwa)}</span>
    <b>${d.termin ? "Do zaplanowania" : esc(d.tytul)}</b><small>${cel ? esc(cel) + " · " : ""}${d.termin ? "" : st[1] + " · "}${esc(d.godzina || "18:00")}</small>${ocena != null ? `<small>Recenzja planu ${ocena}/100</small>` : jakosc?.nieaktualna ? "<small>Plan do ponownej recenzji</small>" : ""}</button>`;
}
function podepnijPlan(box) {
  box.querySelectorAll("[data-tydzien]").forEach((b) => (b.onclick = () => kartaPlanu(dodajDni(PL.od, Number(b.dataset.tydzien)))));
  box.querySelectorAll("[data-wpis]").forEach((b) => (b.onclick = () => szczegolyRolki(b.dataset.wpis, PL.od)));
  const u = $("#plUloz", box); if (u) u.onclick = oknoUkladania;
  const g = $("#plGabinet", box); if (g) g.onclick = () => otworzKreator(KROKI_KREATORA.findIndex(([id]) => id === "gabinet"));
  const k = $("#plKalendarz", box); if (k) k.onclick = () => otworzKalendarz(PL.od.slice(0, 7));
  const sc = $("#plScenariusze", box);
  if (sc) sc.onclick = () => uruchom("plan-tygodnia", ["--od", PL.od, "--tylko-scenariusze"], { opis: "Scenariusze dla planu tygodnia", po: ({ kod }) => { if (!kod) toast("Scenariusze gotowe ✓", 2500); poZmianiePlanu(); } });
}

function rozkladZTygodnia(plan, od) {
  if (!plan?.dni?.length) {
    return new Map((plan?.ustawienia?.publikacje || (plan?.ustawienia?.dni || ["pn", "sr", "pt"])
      .map((dzien) => ({ dzien, typ_publikacji: "rolka", cel_publikacji: "dowolny" }))).map((d) => [d.dzien, d]));
  }
  const wpisy = plan.dni.filter((d) => d.stan !== "pominieta");
  return new Map(DNI_KLUCZE.flatMap((k, i) => {
    const date = dodajDni(od, i), w = wpisy.find((d) => d.data === date && d.termin) || wpisy.find((d) => d.data === date);
    return w ? [[k, w]] : [];
  }));
}

async function oknoUkladania(odTyg, tygodnie = null) {
  const od = typeof odTyg === "string" ? odTyg : PL.od;
  const listaTygodni = tygodnie || [od];
  let dane;
  try { dane = await api(`/api/plan?od=${encodeURIComponent(od)}`); } catch (e) { return blad(e); }
  const plan = dane.plan, rozklad = rozkladZTygodnia(plan, od);
  const grafik = tygodnie ? {} : await api("/api/grafik").catch(() => ({}));
  const daty = DNI_KLUCZE.map((k, i) => [k, dodajDni(od, i)]);
  const m = modal(`<h2>${tygodnie ? `Plan na ${ileTygodni(tygodnie.length)}` : `Plan na tydzień ${dataPl(od)} – ${dataPl(dodajDni(od, 6))}`}</h2>
    ${tygodnie ? `<p class="podpowiedz">Ten sam rozkład dla tygodni od ${tygodnie.map((d) => dataPl(d)).join(", ")}.</p>` : ""}
    <div class="pl-rozklad">
      <div class="pl-rozklad-glowa" aria-hidden="true"><span>Dzień</span><span>Format</span><span>Cel</span></div>
      ${daty.map(([k, d], i) => {
        const wpis = rozklad.get(k);
        const n = dataPl(d, { weekday: "long" });
        return `<div class="pl-rozklad-wiersz" data-pl-dzien="${k}">
          <b><span class="pl-dzien-pelny">${esc(n)}</span><span class="pl-dzien-krotki">${DNI_KROTKO[i]}</span>${tygodnie ? "" : ` <small>${dataPl(d, { day: "numeric" })}</small>`}</b>
          <select data-pl-format aria-label="Format, ${esc(n)}">${wybierzFormatPublikacji(wpis ? typWpisu(wpis) : "", true)}</select>
          <select data-pl-cel aria-label="Cel, ${esc(n)}">${wybierzCelPublikacji(wpis?.cel_publikacji || "dowolny")}</select>
        </div>`;
      }).join("")}
    </div>
    ${tygodnie ? "" : `<details class="pl-grafik"><summary>Grafik gabinetu</summary>
      <div class="pl-grafik-dni">${daty.map(([, d], i) => `<label><span>${DNI_KROTKO[i]} ${dataPl(d, { day: "numeric" })}</span><input data-grafik="${d}" value="${esc(grafik[d] || "")}" placeholder="np. laminacja rzęs 10:00"></label>`).join("")}</div></details>`}
    <label class="pole"><span>Notatka do planu (opcjonalnie)</span><textarea id="plUwagi" maxlength="1000" rows="2" placeholder="np. w czwartek ogłaszamy promocję">${esc(plan?.ustawienia?.uwagi || "")}</textarea></label>
    <div id="plZezScen">
      <label class="rzad"><input type="checkbox" id="plScen" ${tygodnie ? "" : "checked"}> Claude od razu rozpisze scenariusze rolek</label>
      <label class="rzad"><input type="checkbox" id="plDopr"> Dopracuj scenariusze rolek z recenzentką AI</label>
    </div>
    <p class="podpowiedz">Zapis terminów aktualizuje wpisy bez tematu. Ułożenie planu z AI odświeża jego wcześniejsze propozycje i zachowuje Twoje tematy oraz rozpoczęte publikacje.</p>
    <p id="plBlad" role="status" class="podpowiedz"></p>
    <div class="rzad"><button class="btn" id="plTerminy" data-zadanie>Zapisz terminy</button>
      <button class="btn jasny" id="plStart" data-zadanie>✦ Ułóż plan z Claude</button>
      <button class="btn jasny" id="plNie">Anuluj</button></div>`);
  const wiersze = [...m.querySelectorAll("[data-pl-dzien]")];
  const czytaj = () => wiersze.map((w) => ({
    dzien: w.dataset.plDzien, typ_publikacji: $("[data-pl-format]", w).value, cel_publikacji: $("[data-pl-cel]", w).value,
  })).filter((u) => u.typ_publikacji);
  const odswiez = () => {
    for (const w of wiersze) $("[data-pl-cel]", w).disabled = !$("[data-pl-format]", w).value;
    const u = czytaj(), maRolka = u.some(czyWpisRolki);
    $("#plZezScen", m).hidden = !maRolka || !S.start.claude;
    $("#plDopr", m).disabled = !$("#plScen", m).checked;
    $("#plTerminy", m).dataset.zablokowany = u.length ? "" : "1";
    $("#plStart", m).dataset.zablokowany = u.length && S.start.claude ? "" : "1";
    $("#plStart", m).title = S.start.claude ? "" : "Wymaga Claude Code";
    odswiezPrzyciski();
  };
  wiersze.forEach((w) => { $("[data-pl-format]", w).onchange = odswiez; });
  $("#plScen", m).onchange = odswiez;
  const zapiszGrafik = () => {
    const wpisy = Object.fromEntries([...m.querySelectorAll("[data-grafik]")].map((i) => [i.dataset.grafik, i.value.trim()])
      .filter(([d, t]) => t !== (grafik[d] || "")));
    if (Object.keys(wpisy).length) return api("/api/grafik", { method: "PUT", body: { wpisy } });
  };
  let trwa = false;
  const zapisz = (zAI) => async () => {
    const publikacje = czytaj(), uwagi = $("#plUwagi", m).value.trim();
    if (trwa || !publikacje.length) return;
    trwa = true;
    $("#plTerminy", m).disabled = $("#plStart", m).disabled = true;
    try {
      await zapiszGrafik();
      if (!zAI) {
        await api("/api/kalendarz/terminy", { method: "POST", body: { tygodnie: listaTygodni, publikacje, uwagi } });
        zamknijModal();
        toast("Zapisano terminy");
        return poZmianiePlanu();
      }
      const uklad = publikacje.map((u) => [u.dzien, u.typ_publikacji, u.cel_publikacji].join(":")).join(",");
      const scen = publikacje.some(czyWpisRolki) && $("#plScen", m).checked;
      zamknijModal();
      uruchom("plan-tygodnia", [...(tygodnie ? ["--tygodnie", tygodnie.join(",")] : ["--od", od]), "--publikacje", uklad,
        ...(uwagi ? ["--uwagi", uwagi] : []), ...(scen ? ["--scenariusze"] : []), ...(scen && $("#plDopr", m).checked ? ["--dopracuj"] : [])],
      { opis: "Plan publikacji", po: ({ kod }) => { if (!kod) toast("Plan publikacji zapisany"); poZmianiePlanu(); } });
    } catch (e) { $("#plBlad", m).textContent = e.message; }
    finally { trwa = false; if (m.isConnected) odswiez(); }
  };
  $("#plTerminy", m).onclick = zapisz(false);
  $("#plStart", m).onclick = zapisz(true);
  $("#plNie", m).onclick = zamknijModal;
  odswiez();
}

async function szczegolyRolki(id, od) {
  if (!PL.dane || od !== PL.od) { try { await wczytajTydzien(od); } catch (e) { return blad(e); } }
  const d = PL.dane?.plan?.dni.find((x) => x.id === id);
  if (!d) return toast("Tej publikacji już nie ma w planie");
  const st = stanPlanu(d), rolka = czyWpisRolki(d), format = formatWpisu(d), cel = celWpisu(d);
  const moznaZmienicFormat = !d.pomysl && !d.projekt && ["plan", "pominieta"].includes(d.stan || "plan");
  const rodzajRozpiski = { post: "Projekt posta", karuzela: "Kolejność slajdów", story: "Przebieg animacji" }[typWpisu(d)];
  const dzienTyg = (s) => dataPl(s, { weekday: "long", day: "numeric", month: "long" });
  const klucz = `plan_ujecia_${d.id}`;
  let zaznaczone = {};
  try { zaznaczone = JSON.parse(localStorage.getItem(klucz) || "{}"); } catch {}
  const uj = d.co_nagrac || [], tresc = d.plan_tresci || [];
  const m = modal(`<div class="pl-szczegoly">
    <div class="rzad pl-meta-publikacji">
      <span class="chip">${format.ikona} ${esc(format.nazwa)}</span>${cel ? `<span class="chip">${esc(cel)}</span>` : ""}
      <span class="chip">${IKONY[d.kategoria] || "✨"} ${esc(NAZWY_KAT[d.kategoria] || d.kategoria)}</span>${d.format ? `<span class="chip">${esc(d.format)}</span>` : ""}
      <span class="chip status">${st[0]} ${st[1]}</span>
    </div>
    <h2>${d.termin ? "Zaplanowany termin" : esc(d.tytul)}</h2>
    <p class="podpowiedz">📤 Publikacja <b>${dzienTyg(d.data)}, ${esc(d.godzina || "18:00")}</b>${rolka && d.nagraj_dnia ? ` · 🎥 Nagraj <b>${dzienTyg(d.nagraj_dnia)}</b>` : ""}${rolka && d.kiedy_nagrac ? ` (${esc(d.kiedy_nagrac)})` : ""}</p>
    ${d.hook_tekst ? `<div class="pl-hook"><small>${rolka ? "Hook na ekranie" : typWpisu(d) === "karuzela" ? "Tekst okładki" : "Nagłówek"}</small><b>${akcentHtml(d.hook_tekst)}</b>${rolka && d.hook_mowa ? `<small>Pierwsze zdanie</small><span>„${esc(d.hook_mowa)}”</span>` : ""}</div>` : ""}
    ${d.dlaczego_teraz ? `<p>${esc(d.dlaczego_teraz)}</p>` : ""}
    ${d.pytanie_klientki ? `<p class="podpowiedz">Odpowiada na pytanie klientki „${esc(d.pytanie_klientki)}”</p>` : ""}
    ${rolka && uj.length ? `<h3>Co nagrać</h3><ul class="pl-ujecia">${uj.map((u, i) => `<li><label><input type="checkbox" data-uj="${i}" ${zaznaczone[i] ? "checked" : ""}><span><b>${esc(u.co)}</b><small>${esc(u.jak)}</small></span></label></li>`).join("")}</ul>` : ""}
    ${!rolka && tresc.length ? `<h3>${rodzajRozpiski}</h3><ol class="pl-rozpiska-tresci">${tresc.map((u) => `<li><b>${esc(u.co)}</b><small>${esc(u.jak)}</small></li>`).join("")}</ol>` : ""}
    ${d.cta ? `<p class="podpowiedz">CTA · „${esc(d.cta)}”</p>` : ""}
    ${rolka && !d.termin ? `<div class="pl-akcje">
      ${d.projekt ? '<button class="btn duzy" id="pdRolka">Otwórz rolkę</button>'
        : d.pomysl ? `<button class="btn duzy" id="pdPomysl">Otwórz scenariusz${d.ocena_laczna != null ? ` (${d.ocena_laczna} pkt, recenzentka ${d.recenzja}${d.poprawiony ? ", poprawiony" : ""})` : d.ocena ? ` (${d.ocena} pkt)` : ""}</button><button class="btn jasny" id="pdAuto">Mam nagrania — zmontuj</button>`
          : '<button class="btn duzy" id="pdScenariusz">Rozpisz scenariusz z Claude</button><button class="btn jasny" id="pdAuto">Mam nagrania — zmontuj</button>'}
      <button class="btn jasny" id="pdTel">Nagram telefonem</button>
    </div>` : ""}
    ${kartaJakosciPublikacji(d)}
    <details class="pl-edycja-publikacji" ${d.termin ? "open" : ""}><summary>Edytuj publikację</summary>
      <label class="pole"><span>Temat</span><input id="pdTytul" maxlength="80" value="${d.termin ? "" : esc(d.tytul)}" placeholder="np. Najczęstsze pytanie o zabieg"></label>
      <div class="kolumny">
        <label class="pole"><span>Format</span><select id="pdFormat" ${moznaZmienicFormat ? "" : "disabled"}>${wybierzFormatPublikacji(typWpisu(d))}</select></label>
        <label class="pole"><span>Cel</span><select id="pdCel">${wybierzCelPublikacji(d.cel_publikacji || "dowolny")}</select></label>
      </div>
      <label class="pole"><span>Notatka</span><textarea id="pdNotatka" rows="2" maxlength="300">${esc(d.dlaczego_teraz || "")}</textarea></label>
      ${edycjaRozpiskiPublikacji(d)}
      <button class="btn maly" id="pdZapiszDetale">Zapisz publikację</button>
    </details>
    <div class="pl-przenies"><label>Przenieś na <input type="date" id="pdData" value="${d.data}"></label> <label>o <input type="time" id="pdGodz" value="${esc(d.godzina || "18:00")}"></label><button class="btn maly jasny" id="pdPrzenies">Zapisz termin</button></div>
    <div class="pl-akcje-male">
      ${moznaZmienicFormat && !d.wlasny && d.stan !== "pominieta" && S.start.claude ? `<button class="link" id="pdInny">${d.termin ? "✦ Zaproponuj temat" : "↻ Inny pomysł na ten dzień"}</button>` : ""}
      ${!rolka && !d.termin && (d.stan || "plan") === "plan" ? '<button class="link" id="pdGotowy">✓ Materiał gotowy</button>' : ""}
      ${d.stan !== "opublikowana" && !d.termin ? '<button class="link" id="pdOpub">✓ Oznacz jako opublikowane</button>' : ""}
      ${d.stan !== "pominieta" ? '<button class="link" id="pdPomin">Pomiń</button>' : '<button class="link" id="pdPrzywroc">Przywróć</button>'}
      <button class="link" id="pdUsun">Usuń z planu</button><button class="link" id="pdZamknij">Zamknij</button>
    </div></div>`);
  m.querySelectorAll("[data-uj]").forEach((c) => (c.onchange = () => {
    zaznaczone[c.dataset.uj] = c.checked;
    try { localStorage.setItem(klucz, JSON.stringify(zaznaczone)); } catch {}
  }));
  const on = (sel, fn) => { const b = $(sel, m); if (b) b.onclick = fn; };
  const url = `/api/kalendarz/wpis/${encodeURIComponent(d.id)}`;
  podepnijJakoscPublikacji(m, d, od, url);
  podepnijEdycjeRozpiski(m, d);
  const ustaw = (zmiany) => api(url, { method: "PUT", body: zmiany });
  const zakoncz = () => { zamknijModal(); poZmianiePlanu(); };
  const zmienStan = (stan) => async () => { try { await ustaw({ stan }); zakoncz(); } catch (e) { blad(e); } };
  on("#pdZamknij", zamknijModal);
  on("#pdRolka", () => { zamknijModal(); zamknijKalendarz(); otworz(d.projekt, trybProsty() ? 0 : 2); });
  on("#pdPomysl", () => { zamknijModal(); zamknijKalendarz(); otworzPomysl(d.pomysl); });
  on("#pdTel", () => { zamknijModal(); oknoTelefonu(); });
  on("#pdScenariusz", () => { zamknijModal(); zamknijKalendarz(); scenariuszZPlanu(d); });
  on("#pdAuto", () => { zamknijModal(); zamknijKalendarz(); startAutopilota({ kat: d.kategoria, temat: d.tytul, notatki: opisDniaDlaClaude(d), po: (nazwa) => ustaw({ projekt: nazwa, stan: "nagrane" }) }); });
  on("#pdInny", () => { zamknijModal(); uruchom("plan-tygodnia", ["--od", PL.od, "--zamien", d.data, "--wpis", d.id], { opis: "Nowy pomysł na publikację", po: poZmianiePlanu }); });
  on("#pdGotowy", zmienStan("gotowa"));
  on("#pdOpub", zmienStan("opublikowana"));
  on("#pdPomin", zmienStan("pominieta"));
  on("#pdPrzywroc", zmienStan("plan"));
  on("#pdZapiszDetale", async () => {
    const tytul = $("#pdTytul", m).value.trim(), notatka = $("#pdNotatka", m).value.trim();
    const zmiany = { typ_publikacji: $("#pdFormat", m).value, cel_publikacji: $("#pdCel", m).value };
    if (tytul !== (d.termin ? "" : d.tytul)) zmiany.tytul = tytul;
    if (notatka !== (d.dlaczego_teraz || "")) zmiany.notatka = notatka;
    odczytajEdycjeRozpiski(m, d, zmiany);
    try { await ustaw(zmiany); zakoncz(); toast("Publikacja zapisana"); } catch (e) { blad(e); }
  });
  on("#pdPrzenies", async () => {
    const nowa = $("#pdData", m).value, godz = $("#pdGodz", m).value;
    if (!nowa || !godz) return toast("Wpisz datę i godzinę.");
    try {
      if (nowa !== d.data) await api("/api/kalendarz/przenies", { method: "POST", body: { id: d.id, data: nowa } });
      if (godz !== d.godzina) await ustaw({ godzina: godz });
      PL.od = ponPl(nowa);
      zakoncz(); toast("Zapisano termin");
    } catch (e) { blad(e); }
  });
  on("#pdUsun", async () => {
    if (!confirm(`Usunąć „${d.tytul}” z planu?${d.pomysl ? " Scenariusz zostaje na liście pomysłów." : ""}`)) return;
    try { await api(url, { method: "DELETE" }); zakoncz(); } catch (e) { blad(e); }
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

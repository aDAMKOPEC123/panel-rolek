// Kalendarz miesiąca (scripts/kalendarz.mjs, API /api/kalendarz*): pełnoekranowa nakładka w obu trybach (przycisk „🗓️ Kalendarz”).
// Rolki z planów (przeciąganie między dniami), dni nagrań, opublikowane z wynikami, rolki z IG bez pary, okazje, grafik (klik = edycja),
// własny wpis („+”), ułożenie tygodnia, „Zaplanuj miesiąc”, eksport .ics do telefonu, statystyki i najlepsza pora publikacji.
"use strict";

const KAL = { m: null, dane: null, otwarty: false };
const MIESIACE = ["styczeń", "luty", "marzec", "kwiecień", "maj", "czerwiec", "lipiec", "sierpień", "wrzesień", "październik", "listopad", "grudzień"];
// 1 tydzień, 2-4 tygodnie, 5+ tygodni (12-14 tygodni)
const ileTygodni = (n) => (n === 1 ? "tydzień" : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? `${n} tygodnie` : `${n} tygodni`);
const plusMies = (m, n) => { const [r, mm] = m.split("-").map(Number); const d = new Date(r, mm - 1 + n, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; };

async function otworzKalendarz(m) {
  KAL.m = m || KAL.m || new Date().toISOString().slice(0, 7);
  let el = $("#kalendarz");
  if (!el) { el = document.createElement("div"); el.id = "kalendarz"; document.body.appendChild(el); }
  el.classList.remove("ukryte");
  document.body.classList.add("kalendarz-on");
  KAL.otwarty = true;
  el.innerHTML = `<div class="kal-okno"><p class="podpowiedz" style="padding:30px">Ładuję kalendarz…</p></div>`;
  await odswiezKalendarz();
}
function zamknijKalendarz() {
  if (!KAL.otwarty) return;
  KAL.otwarty = false;
  $("#kalendarz")?.classList.add("ukryte");
  document.body.classList.remove("kalendarz-on");
}
async function odswiezKalendarz() {
  if (!KAL.otwarty) return;
  try { KAL.dane = await api(`/api/kalendarz?m=${KAL.m}`); } catch (e) { return blad(e); }
  rysujKalendarz();
}

function rysujKalendarz() {
  const K = KAL.dane, el = $("#kalendarz");
  const [r, mm] = K.miesiac.split("-").map(Number);
  const st = K.statystyki;
  const ponDzis = ponPl(K.dzis);
  const dni = Object.keys(K.dni).sort();
  const komorka = (d) => {
    const x = K.dni[d];
    const poza = d.slice(0, 7) !== K.miesiac, dzis = d === K.dzis, minal = d < K.dzis;
    const pn = (new Date(d + "T12:00").getDay() + 6) % 7 === 0;
    const tyg = pn ? K.tygodnie.find((t) => t.od === d) : null;
    return `<div class="kal-dzien ${poza ? "poza" : ""} ${dzis ? "dzis" : ""} ${minal ? "minal" : ""}" data-dzien="${d}">
      <div class="kal-gora"><b>${Number(d.slice(8))}</b>${!minal ? `<button class="kal-plus" data-dodaj="${d}" title="Dodaj swoją rolkę w tym dniu">+</button>` : ""}</div>
      ${x.okazje.map((o) => `<span class="pl-okazja" title="${esc(o)}">${esc(o.split(" (")[0])}</span>`).join("")}
      ${x.grafik ? `<button class="kal-grafik" data-grafik="${d}" title="Grafik: kliknij, żeby zmienić">📋 ${esc(x.grafik)}</button>` : !minal ? `<button class="kal-grafik pusty" data-grafik="${d}" title="Wpisz wizyty z tego dnia">📋 grafik</button>` : ""}
      ${(x.nagrania || []).map((n) => `<button class="pl-nagraj" data-wpis="${n.id}" data-tyg="${n.tydzien}" title="Nagranie do rolki z ${dataPl(n.data)}">🎥 ${esc(n.tytul.split(" ").slice(0, 3).join(" "))}…</button>`).join("")}
      ${x.plan.map((p) => kafelekRolki(p, { przeciagany: !["opublikowana"].includes(p.stan) }).replace("<button ", `<button data-tyg="${p.tydzien}" `)).join("")}
      ${x.opublikowane.map((o) => `<button class="kal-pub" data-projekt="${esc(o.projekt)}" title="${esc(o.tytul)}">✅ <b>${esc(o.tytul)}</b>${o.wyniki?.wyswietlenia != null ? `<small>👁 ${liczbaPl(o.wyniki.wyswietlenia)}${o.wyniki.pominiecia != null ? ` · ⏭ ${o.wyniki.pominiecia}%` : ""}</small>` : `<small>${o.godzina || ""} bez wyników</small>`}</button>`).join("")}
      ${x.ig.map((g) => `<a class="kal-ig" href="${esc(g.permalink)}" target="_blank" rel="noopener" title="Rolka z Instagrama bez rolki w panelu">📸 ${esc(g.caption.slice(0, 30) || "rolka")}${g.wyswietlenia != null ? ` · ${liczbaPl(g.wyswietlenia)}` : ""}</a>`).join("")}
      ${tyg && !tyg.plan && tyg.od >= ponDzis ? `<button class="kal-uloz" data-uloz="${tyg.od}">✦ ułóż tydzień</button>` : ""}
    </div>`;
  };
  const doZaplanowania = K.tygodnie.filter((t) => !t.plan && t.od >= ponDzis);
  el.innerHTML = `<div class="kal-okno">
    <div class="kal-naglowek">
      <div class="rzad" style="gap:8px"><button class="btn maly jasny" id="kalPoprz">←</button><h2>${MIESIACE[mm - 1]} ${r}</h2><button class="btn maly jasny" id="kalNast">→</button>${K.miesiac !== K.dzis.slice(0, 7) ? `<button class="btn maly jasny" id="kalDzis">dziś</button>` : ""}</div>
      <div class="rzad" style="gap:8px;flex-wrap:wrap">
        <button class="btn maly" id="kalMiesiac" data-zadanie ${doZaplanowania.length ? "" : "disabled title=\"Widoczne tygodnie mają już plan\""}>✦ Zaplanuj ${ileTygodni(doZaplanowania.length)}</button>
        <button class="btn maly jasny" id="kalIcs">📲 Do kalendarza w telefonie</button>
        <button class="btn maly jasny" id="kalZamknij">✕ Zamknij</button>
      </div>
    </div>
    <div class="kal-stat">
      <span title="Rolki w planie w tym miesiącu">🗒️ <b>${st.zaplanowane}</b> zaplanowane</span><span>✍️ <b>${st.scenariusze}</b> ze scenariuszem</span><span>🎬 <b>${st.nagrane}</b> nagrane</span><span>📤 <b>${st.opublikowane}</b> opublikowane</span>${st.wyswietlenia ? `<span>👁 <b>${liczbaPl(st.wyswietlenia)}</b> wyświetleń</span>` : ""}
      <span class="kal-pora" title="${esc(K.pora.dosc ? (K.pora.dni || []).map((x) => `${x.k}: ${Math.round(x.wynik * 100)}% (${x.n})`).join(", ") : "")}">⏰ ${esc(K.pora.opis)}</span>
    </div>
    <div class="kal-siatka">${DNI_KROTKO.map((n) => `<div class="kal-dn">${n}</div>`).join("")}${dni.map(komorka).join("")}</div>
    <p class="podpowiedz kal-legenda">Przeciągnij rolkę na inny dzień, żeby ją przenieść (dzień nagrania przesuwa się razem z nią). „+” dodaje Twój pomysł, 📋 to wizyty w gabinecie (Claude układa rolki pod nie). ✅ opublikowane z wynikami, 📸 rolki z Instagrama bez pary w panelu.</p>
  </div>`;
  const on = (sel, fn) => { const b = $(sel, el); if (b) b.onclick = fn; };
  on("#kalPoprz", () => { KAL.m = plusMies(KAL.m, -1); odswiezKalendarz(); });
  on("#kalNast", () => { KAL.m = plusMies(KAL.m, 1); odswiezKalendarz(); });
  on("#kalDzis", () => { KAL.m = K.dzis.slice(0, 7); odswiezKalendarz(); });
  on("#kalZamknij", zamknijKalendarz);
  on("#kalIcs", oknoIcs);
  on("#kalMiesiac", () => oknoMiesiaca(doZaplanowania.map((t) => t.od)));
  el.querySelectorAll("[data-wpis]").forEach((b) => (b.onclick = () => szczegolyRolki(b.dataset.wpis, b.dataset.tyg)));
  el.querySelectorAll("[data-projekt]").forEach((b) => (b.onclick = () => { zamknijKalendarz(); otworz(b.dataset.projekt, trybProsty() ? 0 : 7); }));
  el.querySelectorAll("[data-dodaj]").forEach((b) => (b.onclick = (e) => { e.stopPropagation(); oknoWlasnego(b.dataset.dodaj); }));
  el.querySelectorAll("[data-grafik]").forEach((b) => (b.onclick = () => oknoGrafiku(b.dataset.grafik, K.dni[b.dataset.grafik].grafik)));
  el.querySelectorAll("[data-uloz]").forEach((b) => (b.onclick = () => oknoUkladania(b.dataset.uloz)));
  // przeciąganie rolek między dniami
  el.querySelectorAll(".pl-rolka[draggable]").forEach((b) => {
    b.ondragstart = (e) => { e.dataTransfer.setData("text/plain", b.dataset.wpis); e.dataTransfer.effectAllowed = "move"; b.classList.add("ciagnieta"); };
    b.ondragend = () => b.classList.remove("ciagnieta");
  });
  el.querySelectorAll(".kal-dzien").forEach((c) => {
    c.ondragover = (e) => { if (c.classList.contains("minal")) return; e.preventDefault(); c.classList.add("nad"); };
    c.ondragleave = () => c.classList.remove("nad");
    c.ondrop = async (e) => {
      e.preventDefault(); c.classList.remove("nad");
      const id = e.dataTransfer.getData("text/plain"); if (!id) return;
      try { await api("/api/kalendarz/przenies", { method: "POST", body: { id, data: c.dataset.dzien } }); toast(`Przeniesiono na ${dataPl(c.dataset.dzien)} ✓`, 1800); odswiezKalendarz(); kartaPlanu(PL.od); }
      catch (err) { blad(err); }
    };
  });
}

function oknoWlasnego(dzien) {
  const m = modal(`<h2>✏️ Twój pomysł na ${dataPl(dzien, { weekday: "long", day: "numeric", month: "long" })}</h2>
    <label class="pole"><span>O czym rolka?</span><input id="wlTytul" placeholder="np. pokazuję nową lampę do henny" autofocus></label>
    <div class="kafle" id="wlKat">${S.start.kategorie.map((k) => `<button class="kafel" data-k="${k}"><span class="ikona">${IKONY[k] || "✨"}</span>${NAZWY_KAT[k] || k}</button>`).join("")}</div>
    <div class="rzad" style="gap:10px;margin-top:10px"><label class="pole" style="flex:1"><span>Godzina publikacji</span><input type="time" id="wlGodz" value="18:00"></label>
      <label class="pole" style="flex:1"><span>Wygląd</span><select id="wlWyglad"><option value="naturalny">🤳 naturalny, jak vlog</option><option value="reklamowy">📣 reklamowy</option></select></label></div>
    <label class="pole"><span>Notatka dla Claude (opcjonalnie)</span><textarea id="wlNotatka" rows="2" placeholder="np. klientka zgodziła się na nagranie twarzy"></textarea></label>
    <p class="podpowiedz">Potem w szczegółach rolki kliknij „✦ Rozpisz scenariusz”, a Claude dopisze hook, ujęcia i teleprompter.</p>
    <div class="rzad"><button class="btn" id="wlTak">Dodaj do kalendarza</button><button class="btn jasny" id="wlNie">Anuluj</button></div>`);
  let kat = "";
  m.querySelectorAll("#wlKat [data-k]").forEach((b) => (b.onclick = () => { kat = b.dataset.k; m.querySelectorAll("#wlKat [data-k]").forEach((x) => x.classList.toggle("wybrany", x === b)); }));
  $("#wlNie", m).onclick = zamknijModal;
  $("#wlTak", m).onclick = async () => {
    const tytul = $("#wlTytul", m).value.trim(); if (!tytul) return toast("Napisz, o czym rolka");
    try {
      await api("/api/kalendarz/dodaj", { method: "POST", body: { data: dzien, tytul, kategoria: kat, godzina: $("#wlGodz", m).value, wyglad: $("#wlWyglad", m).value, notatka: $("#wlNotatka", m).value.trim() } });
      zamknijModal(); toast("Dodano ✓"); odswiezKalendarz(); kartaPlanu(PL.od);
    } catch (e) { blad(e); }
  };
}
function oknoGrafiku(dzien, tekst) {
  const m = modal(`<h2>📋 Grafik: ${dataPl(dzien, { weekday: "long", day: "numeric", month: "long" })}</h2>
    <p class="podpowiedz">Jakie wizyty masz tego dnia? Claude ułoży rolki pod zabiegi, które i tak robisz, i ustawi nagranie na ten dzień.</p>
    <label class="pole"><span>Wizyty</span><input id="grTekst" value="${esc(tekst || "")}" placeholder="np. laminacja rzęs 10:00, 2x pedicure, oczyszczanie 15:00"></label>
    <div class="rzad"><button class="btn" id="grTak">Zapisz</button><button class="btn jasny" id="grNie">Anuluj</button></div>`);
  $("#grNie", m).onclick = zamknijModal;
  $("#grTak", m).onclick = async () => { try { await api("/api/grafik", { method: "PUT", body: { wpisy: { [dzien]: $("#grTekst", m).value.trim() } } }); zamknijModal(); odswiezKalendarz(); } catch (e) { blad(e); } };
  $("#grTekst", m).onkeydown = (e) => { if (e.key === "Enter") $("#grTak", m).click(); };
}
function oknoMiesiaca(tygodnie) {
  if (!S.start?.claude) return toast("Plan układa Claude: zainstaluj i zaloguj Claude Code", 5000);
  if (!tygodnie.length) return toast("Widoczne tygodnie mają już plan");
  let dni = new Set(["pn", "sr", "pt"]);
  const m = modal(`<h2>✦ Zaplanuj ${ileTygodni(tygodnie.length)}</h2>
    <p class="podpowiedz">Tygodnie bez planu: ${tygodnie.map((t) => `${dataPl(t)}–${dataPl(dodajDni(t, 6))}`).join(", ")}. Claude układa je po kolei i pilnuje, żeby tematy się nie powtarzały między tygodniami.</p>
    <p class="kr-etykieta">W które dni publikujesz?</p>
    <div class="pl-wybor-dni">${DNI_KROTKO.map((n, i) => `<button class="${dni.has(DNI_KLUCZE[i]) ? "wybrany" : ""}" data-d="${DNI_KLUCZE[i]}">${n}</button>`).join("")}</div>
    <label class="pole" style="margin-top:10px"><span>Coś, o czym Claude ma wiedzieć? (opcjonalnie)</span><textarea id="zmUwagi" rows="2" placeholder="np. 15-20 grudnia urlop; w grudniu promocja na vouchery"></textarea></label>
    <label class="rzad"><input type="checkbox" id="zmScen"> ✍️ Od razu pełne scenariusze (ok. +0,5 USD i +3 min na tydzień)</label>
    <p class="podpowiedz" id="zmKoszt"></p>
    <div class="rzad"><button class="btn duzy" id="zmTak" data-zadanie>✦ Zaplanuj</button><button class="btn jasny" id="zmNie">Anuluj</button></div>`);
  const koszt = () => { const s = $("#zmScen", m).checked; $("#zmKoszt", m).textContent = `Szacunek: ok. ${(tygodnie.length * (s ? 0.6 : 0.1)).toFixed(1).replace(".", ",")} USD i ${tygodnie.length * (s ? 4 : 1)} min (w tle, możesz pracować dalej).`; };
  koszt();
  $("#zmScen", m).onchange = koszt;
  m.querySelectorAll("[data-d]").forEach((b) => (b.onclick = () => { dni.has(b.dataset.d) ? dni.delete(b.dataset.d) : dni.add(b.dataset.d); b.classList.toggle("wybrany"); }));
  $("#zmNie", m).onclick = zamknijModal;
  $("#zmTak", m).onclick = () => {
    if (!dni.size) return toast("Zaznacz choć jeden dzień");
    const uw = $("#zmUwagi", m).value.trim(), scen = $("#zmScen", m).checked;
    zamknijModal();
    uruchom("plan-tygodnia", ["--tygodnie", tygodnie.join(","), "--dni", DNI_KLUCZE.filter((k) => dni.has(k)).join(","), ...(uw ? ["--uwagi", uw] : []), ...(scen ? ["--scenariusze"] : [])],
      { opis: `Plan na ${ileTygodni(tygodnie.length)}`, po: ({ kod }) => { if (!kod) toast("Kalendarz zaplanowany ✓", 2500); odswiezKalendarz(); kartaPlanu(PL.od); } });
  };
}
function oknoIcs() {
  const m = modal(`<h2>📲 Rolki w kalendarzu telefonu</h2>
    <p>Pobierz plik i otwórz go: każda zaplanowana rolka trafi do Twojego kalendarza jako <b>🎥 nagranie</b> (9:00, z listą ujęć, przypomnienie 15 min wcześniej) i <b>📤 publikacja</b> (o godzinie z planu, przypomnienie 30 min wcześniej).</p>
    <ul class="podpowiedz"><li><b>iPhone:</b> wyślij plik do siebie (AirDrop albo mail) i stuknij go, potem „Dodaj wszystko”.</li>
      <li><b>Kalendarz Google:</b> calendar.google.com > ⚙ Ustawienia > Importuj i eksportuj > wybierz plik.</li>
      <li><b>Outlook:</b> kliknij dwa razy plik na komputerze.</li></ul>
    <p class="podpowiedz">Po zmianach w planie pobierz plik jeszcze raz: te same rolki się zaktualizują, nie zdublują.</p>
    <div class="rzad"><a class="btn" href="/api/kalendarz.ics" download="rolki.ics">⬇️ Pobierz rolki.ics</a><button class="btn jasny" id="icsNie">Zamknij</button></div>`);
  $("#icsNie", m).onclick = zamknijModal;
}
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && KAL.otwarty && $("#modal").classList.contains("ukryte")) zamknijKalendarz(); });
(function () {
  const b = document.createElement("button");
  b.id = "kalendarzBtn"; b.className = "opcje-btn"; b.textContent = "🗓️ Kalendarz"; b.title = "Kalendarz rolek: plan, nagrania, publikacje, wyniki";
  $("#telefonBtn").before(b);
  b.onclick = () => otworzKalendarz();
})();

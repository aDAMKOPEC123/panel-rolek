// Wyniki z Instagrama same (scripts/instagram.mjs, API /api/instagram*): połączenie tokenem, stan, rolki z wynikami,
// ręczne przypisanie rolki z IG do rolki w panelu. Panel pobiera wyniki sam co 6 h, gdy jest włączony.
"use strict";

const liczbaPl = (v) => (v == null ? "–" : v >= 1e6 ? `${(v / 1e6).toFixed(1).replace(".", ",")} mln` : v >= 1e4 ? `${Math.round(v / 1e3)} tys.` : v >= 1e3 ? `${(v / 1e3).toFixed(1).replace(".", ",")} tys.` : String(v));
const msNaSek = (v) => (v == null ? null : v > 120 ? Math.round(v / 100) / 10 : v);
const procIG = (v) => (v == null ? null : v <= 1 ? Math.round(v * 1000) / 10 : Math.round(v * 10) / 10);

async function oknoInstagrama() {
  const m = modal(`<h2>📸 Wyniki z Instagrama</h2><p class="podpowiedz">Sprawdzam połączenie…</p>`);
  let s;
  try { s = await api("/api/instagram"); } catch (e) { m.innerHTML = `<h2>📸 Instagram</h2><p style="color:var(--blad)">✗ ${esc(e.message)}</p>`; return; }
  if (!s.polaczony) return rysujPolaczenie(m);
  rysujStanIG(m, s);
}

function rysujPolaczenie(m) {
  m.innerHTML = `<div class="ig-okno"><h2>📸 Wyniki z Instagrama same</h2>
    <p>Po połączeniu panel sam pobiera wyniki każdej rolki (wyświetlenia, zasięg, % pominięć w 3 s, średni czas oglądania, zapisy, wysłania) i dopasowuje je do rolek w panelu. Nic nie przepisujesz, a przepis na rolki uczy się na Twoich wynikach.</p>
    <details open class="ig-instrukcja"><summary><b>Jak zdobyć token (jednorazowo, ok. 10 min)</b></summary><ol>
      <li>Konto na Instagramie musi być <b>firmowe albo twórcy</b> (Instagram: Ustawienia > Typ konta i narzędzia).</li>
      <li>Wejdź na <b>developers.facebook.com</b>, zaloguj się i kliknij <b>Utwórz aplikację</b> (typ: Firma / Business). Nazwa dowolna, np. „Rolki gabinetu”.</li>
      <li>W aplikacji dodaj produkt <b>Instagram</b> i wybierz <b>„API setup with Instagram login”</b> (konfiguracja z logowaniem Instagrama).</li>
      <li>W kroku „Generate access tokens” kliknij <b>Add account</b>, zaloguj się na konto gabinetu i zgódź się na dostęp do statystyk.</li>
      <li>Kliknij <b>Generate token</b> przy koncie i skopiuj długi token (zaczyna się od „IG…”). Wklej go poniżej.</li></ol>
      <p class="podpowiedz">Aplikacja może zostać w trybie deweloperskim: czyta tylko Twoje konto. Panel prosi wyłącznie o odczyt (instagram_business_basic, instagram_business_manage_insights), niczego nie publikuje.</p></details>
    <label class="pole"><span>Token dostępu</span><input type="password" id="igToken" autocomplete="off" placeholder="IGAA…"></label>
    <p class="podpowiedz">🔒 Token zapisuje się tylko na tym komputerze (02_BRAND/instagram.json) i nigdy nie trafia do przeglądarki ani do Claude. Panel sam go odświeża co tydzień (ważny 60 dni). Działa też token z Facebook Login (od „EAA…”), ale ten trzeba odnawiać samemu.</p>
    <div class="rzad"><button class="btn duzy" id="igPolacz">Połącz</button><button class="btn jasny" id="igNie">Anuluj</button></div>
    <div id="igStan"></div></div>`;
  $("#igNie", m).onclick = zamknijModal;
  $("#igPolacz", m).onclick = async (e) => {
    const t = $("#igToken", m).value.trim();
    if (!t) return toast("Wklej token");
    e.target.disabled = true;
    $("#igStan", m).innerHTML = `<p class="podpowiedz">⏳ Sprawdzam token i konto…</p>`;
    try {
      const s = await api("/api/instagram/polacz", { method: "POST", body: { token: t } });
      $("#igToken", m).value = "";
      toast(`Połączono @${s.username} ✓ Pobieram wyniki…`, 3000);
      setTimeout(async () => rysujStanIG(m, await api("/api/instagram")), 300);
      synchronizujIGPanel(m);
    } catch (err) { e.target.disabled = false; $("#igStan", m).innerHTML = `<p style="color:var(--blad)">✗ ${esc(err.message)}</p>`; }
  };
}

async function synchronizujIGPanel(m) {
  const b = $("#igSync", m); if (b) { b.disabled = true; b.textContent = "⏳ Pobieram…"; }
  try { const w = await api("/api/instagram/sync", { method: "POST" }); toast(`Instagram: ${w.rolki} rolek, ${w.dopasowane} dopasowanych ✓`, 3000); }
  catch (e) { blad(e); }
  if ($("#modal").classList.contains("ukryte")) return;
  try { rysujStanIG(m, await api("/api/instagram")); } catch {}
  if (S.projekt) odswiezProjekt();
}

async function rysujStanIG(m, s) {
  const rolki = await api("/api/projekty").catch(() => []);
  const L = s.rolki_lista || [];
  const wiersz = (r) => {
    const st = r.statystyki || {};
    const pom = procIG(st.reels_skip_rate), sc = msNaSek(st.ig_reels_avg_watch_time);
    return `<div class="ig-rolka">
      ${r.thumbnail_url ? `<img src="${esc(r.thumbnail_url)}" alt="" referrerpolicy="no-referrer">` : `<div class="ig-mini"></div>`}
      <div class="ig-info"><a href="${esc(r.permalink)}" target="_blank" rel="noopener">${new Date(r.timestamp).toLocaleDateString("pl-PL", { day: "numeric", month: "short" })}</a> <small>${esc(r.caption || "(bez opisu)")}</small>
        <div class="ig-liczby"><span title="Wyświetlenia">👁 ${liczbaPl(st.views)}</span><span title="Zasięg">👥 ${liczbaPl(st.reach)}</span>${pom != null ? `<span title="% pominięć w 3 s (szacunek Meta)">⏭ ${pom}%</span>` : ""}${sc != null ? `<span title="Średni czas oglądania">⏱ ${String(sc).replace(".", ",")} s</span>` : ""}<span title="Zapisy">🔖 ${liczbaPl(st.saved)}</span><span title="Wysłania">✈️ ${liczbaPl(st.shares)}</span></div>
        ${r.blad ? `<small style="color:var(--blad)">${esc(r.blad)}</small>` : ""}</div>
      <div class="ig-dopasowanie">${r.projekt ? `<span class="chip ok" title="dopasowano: ${esc(r.dopasowano || "")}">✓ ${esc(r.projekt.replace(/^\d{4}-\d{2}-\d{2}_/, "").replace(/[_-]/g, " ").slice(0, 28))}</span>` : ""}
        <select data-media="${esc(r.id)}"><option value="">${r.projekt ? "zmień rolkę…" : "przypisz do rolki…"}</option>${rolki.map((p) => `<option value="${esc(p.nazwa)}">${esc((p.tytul || p.nazwa).slice(0, 40))}</option>`).join("")}</select></div></div>`;
  };
  m.innerHTML = `<div class="ig-okno"><h2>📸 Wyniki z Instagrama <small class="podpowiedz">@${esc(s.username || "")}</small></h2>
    <p class="podpowiedz">Panel pobiera wyniki sam: po włączeniu i co 6 godzin. Ostatnio: ${s.ostatnia_sync ? new Date(s.ostatnia_sync).toLocaleString("pl-PL", { dateStyle: "short", timeStyle: "short" }) : "jeszcze nie"} · rolek: ${s.rolki} · dopasowanych do panelu: ${s.dopasowane}${s.wygasa_za != null && s.typ === "Facebook Login" ? ` · ⚠ token wygasa za ok. ${s.wygasa_za} dni` : ""}. Dane z Instagrama mogą się spóźniać do 48 h; wynik rolki liczy się po 7 dniach.</p>
    ${s.blad ? `<p class="ramka ostrzezenie">⚠ Ostatnie pobranie: ${esc(s.blad)}</p>` : ""}
    <div class="ig-lista">${L.length ? L.map(wiersz).join("") : `<p class="podpowiedz">Brak rolek z ostatnich 120 dni (albo jeszcze nie pobrano).</p>`}</div>
    <p class="podpowiedz">Krzywej utrzymania (wykres spadków) Instagram nie udostępnia przez API: zrzut wykresu wciąż możesz wgrać w kroku Publikacja.</p>
    <div class="rzad" style="justify-content:space-between"><div class="rzad"><button class="btn" id="igSync">↻ Pobierz teraz</button><button class="btn jasny" id="igOk">Zamknij</button></div><button class="link" id="igRozlacz">Rozłącz Instagram</button></div></div>`;
  $("#igOk", m).onclick = zamknijModal;
  $("#igSync", m).onclick = () => synchronizujIGPanel(m);
  $("#igRozlacz", m).onclick = async () => { if (!confirm("Rozłączyć Instagram? Token zostanie usunięty z tego komputera, pobrane wyniki zostają.")) return; await api("/api/instagram/rozlacz", { method: "POST" }).catch(blad); rysujPolaczenie(m); };
  m.querySelectorAll("[data-media]").forEach((sel) => (sel.onchange = async () => {
    if (!sel.value) return;
    try { await api("/api/instagram/przypisz", { method: "POST", body: { media_id: sel.dataset.media, projekt: sel.value } }); toast("Przypisano ✓"); rysujStanIG(m, await api("/api/instagram")); }
    catch (e) { blad(e); }
  }));
}

// Krótkie podsumowanie wyników rolki (prosty ekran rolki)
function wynikiRolkiHtml(w) {
  if (!w || (w.wyswietlenia == null && w.zasieg == null)) return "";
  return `<div class="karta ig-wyniki"><h3>📊 Wyniki na Instagramie <small class="podpowiedz">${w.zrodlo === "instagram" ? `pobrane ${w.pobrano ? new Date(w.pobrano).toLocaleString("pl-PL", { dateStyle: "short", timeStyle: "short" }) : ""}` : "wpisane ręcznie"}${w.dzien != null ? ` · ${w.dzien}. dzień` : ""}</small></h3>
    <div class="ig-liczby duze"><span>👁 <b>${liczbaPl(w.wyswietlenia)}</b> wyświetleń</span><span>👥 <b>${liczbaPl(w.zasieg)}</b> zasięgu</span>${w.pominiecia != null ? `<span>⏭ <b>${w.pominiecia}%</b> pomija w 3 s</span>` : ""}${w.sredni_czas != null ? `<span>⏱ <b>${String(w.sredni_czas).replace(".", ",")} s</b> średnio</span>` : ""}<span>🔖 <b>${liczbaPl(w.zapisy)}</b> zapisów</span><span>✈️ <b>${liczbaPl(w.wyslania)}</b> wysłań</span></div>
    ${w.permalink ? `<a href="${esc(w.permalink)}" target="_blank" rel="noopener" class="podpowiedz">Otwórz na Instagramie ↗</a>` : ""}</div>`;
}

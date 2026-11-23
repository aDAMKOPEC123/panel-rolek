// „3 gotowe pomysły” (scripts/szybkie-pomysly.mjs) i bank pytań klientek (kontekst-rolek.mjs).
// Karty z pełnym scenariuszem i oceną; „Wybieram” robi z karty zwykły pomysł (ekran pomysłu: poprawki w rozmowie, „Utwórz rolkę”).
"use strict";

const kolorOceny = (w) => (w >= 85 ? "ok" : w >= 70 ? "srednio" : "slabo");
async function oknoPropozycji() {
  if (!S.start?.claude) return toast("Pomysły wymyśla Claude: zainstaluj i zaloguj Claude Code (⚙ Ustawienia gabinetu > Programy)", 5000);
  let Z = await api("/api/propozycje").catch(() => ({ propozycje: [] }));
  const swieze = Z.utworzono && Date.now() - Date.parse(Z.utworzono) < 3 * 864e5 && Z.propozycje?.length;
  const m = modal(`<div class="pr-propozycje"><h2>💡 Gotowe pomysły na rolkę</h2>
    <p class="podpowiedz">Claude od razu pisze pełne scenariusze pod porę roku, Twoje usługi, grafik zabiegów i pytania klientek, a panel każdy ocenia (cel 85+). Wybierasz jeden i ewentualnie poprawiasz jednym zdaniem.</p>
    <div id="ppKarty">${swieze ? kartyPropozycji(Z) : ""}</div>
    <details ${swieze ? "" : "open"} class="pp-nowe"><summary><b>✦ Wymyśl ${swieze ? "nowe" : "3 gotowe pomysły"}</b> <small class="podpowiedz">ok. 2-4 min, ok. 0,3-0,6 USD</small></summary>
      <div class="kafle pp-kat"><button class="kafel wybrany" data-kat=""><span class="ikona">🎲</span>Wszystko</button>${S.start.kategorie.map((k) => `<button class="kafel" data-kat="${k}"><span class="ikona">${IKONY[k] || "✨"}</span>${NAZWY_KAT[k] || k}</button>`).join("")}</div>
      <label class="pole" style="margin-top:10px"><span>Wskazówka (opcjonalnie)</span><input id="ppWsk" placeholder="np. coś lekkiego z humorem; mam dziś 3 pedicure; klientki pytają o kwasy"></label>
      <button class="btn duzy" id="ppStart" data-zadanie>✦ Wymyśl 3 gotowe pomysły</button></details>
    <div class="rzad" style="justify-content:space-between;margin-top:12px"><button class="link" id="ppRozmowa">Wolę porozmawiać i ułożyć rolkę z Claude krok po kroku</button><button class="btn jasny" id="ppZamknij">Zamknij</button></div></div>`);
  let kat = "";
  m.querySelectorAll("[data-kat]").forEach((b) => (b.onclick = () => { kat = b.dataset.kat; m.querySelectorAll("[data-kat]").forEach((x) => x.classList.toggle("wybrany", x === b)); }));
  $("#ppZamknij", m).onclick = zamknijModal;
  $("#ppRozmowa", m).onclick = () => { zamknijModal(); nowyPomysl(); };
  $("#ppStart", m).onclick = () => {
    const wsk = $("#ppWsk", m).value.trim();
    $("#ppKarty", m).innerHTML = `<div class="pp-czekaj"><span class="kropki"><i></i><i></i><i></i></span> Claude wymyśla 8 kandydatów, wybiera 3 najmocniejsze i pisze pełne scenariusze. Panel ocenia i poprawia słabsze miejsca…</div>`;
    m.querySelector(".pp-nowe").open = false;
    uruchom("szybkie-pomysly", ["--ile", "3", ...(kat ? ["--kategoria", kat] : []), ...(wsk ? ["--wskazowka", wsk] : [])], { opis: "3 gotowe pomysły", po: async ({ kod }) => {
      Z = await api("/api/propozycje").catch(() => ({ propozycje: [] }));
      const okno = $("#ppKarty");
      if (okno) { okno.innerHTML = kod ? `<p style="color:var(--blad)">✗ Nie udało się. Szczegóły w „Log” na dolnym pasku.</p>` : kartyPropozycji(Z); podepnijPropozycje(okno); }
      else if (!kod) toast("Gotowe pomysły czekają: kliknij „💡 Nie wiem, co nagrać”", 5000);
    } });
  };
  podepnijPropozycje($("#ppKarty", m));
}
function kartyPropozycji(Z) {
  return `<div class="pp-karty">${(Z.propozycje || []).map((P, i) => {
    const h = (P.hooki || []).find((x) => x.wybrany) || P.hooki?.[0] || {};
    const mowa = (P.materialy || []).filter((x) => (x.teleprompter || []).length).length;
    return `<div class="pp-karta ${P.wybrana ? "wybrana" : ""}">
      <div class="pp-gora"><span class="pp-ocena ${kolorOceny(P.ocena)}" title="Twarda ocena scenariusza (hook, dynamika, czytelność, struktura)">${P.ocena}</span>
        <div><b>${esc(P.profil?.temat || "")}</b><div class="chipy"><span class="chip">${IKONY[P.profil?.kategoria] || "✨"} ${esc(NAZWY_KAT[P.profil?.kategoria] || P.profil?.kategoria || "")}</span><span class="chip">${esc(P.profil?.format || "")}</span><span class="chip">${P.montaz === "naturalny" ? "🤳 naturalny" : "📣 reklamowy"}</span></div></div></div>
      <div class="pl-hook"><small>Hook</small><b>${akcentHtml(h.tekst || "")}</b><span>„${esc(h.mowisz || "")}”</span></div>
      <p class="pp-dlaczego">💡 ${esc(P.dlaczego || P.profil?.pomysl || "")}</p>
      ${P.pytanie_klientki ? `<p class="podpowiedz">💬 Odpowiada na: „${esc(P.pytanie_klientki)}”</p>` : ""}
      <p class="podpowiedz">⏱️ ${esc(P.profil?.dlugosc || "")} · 🎥 ${(P.materialy || []).length} nagrań${mowa ? ` (${mowa} z mową)` : ""} · ${P.profil?.twarz_klientki === "tak" ? "🙋 twarz klientki (potrzebna zgoda)" : "bez twarzy klientki"}</p>
      <details><summary class="podpowiedz">Co nagrać</summary><ul class="pp-mat">${(P.materialy || []).map((x) => `<li><b>${esc(x.id)}</b> ${esc(x.opis)}</li>`).join("")}</ul></details>
      <button class="btn ${P.wybrana ? "jasny" : ""}" data-wybierz="${i}">${P.wybrana ? "Otwórz" : "✓ Wybieram"}</button></div>`;
  }).join("")}</div>${Z.utworzono ? `<p class="podpowiedz" style="margin-top:6px">Wymyślone ${new Date(Z.utworzono).toLocaleString("pl-PL", { dateStyle: "short", timeStyle: "short" })}${Z.koszt_usd ? ` · ${Z.koszt_usd.toFixed(2)} USD` : ""}</p>` : ""}`;
}
function podepnijPropozycje(box) {
  if (!box) return;
  box.querySelectorAll("[data-wybierz]").forEach((b) => (b.onclick = async () => {
    try { const p = await api(`/api/propozycje/wybierz/${b.dataset.wybierz}`, { method: "POST" }); zamknijModal(); wczytajPomysl(p); pokazPomysl(); toast("Scenariusz gotowy: popraw, co chcesz, i kliknij „Zatwierdzam”", 4000); }
    catch (e) { blad(e); }
  }));
}

// ---------- bank pytań klientek ----------
async function kartaPytan() {
  const box = $("#pytaniaKarta"); if (!box) return;
  const B = await api("/api/pytania").catch(() => ({ pytania: [] }));
  const nowe = B.pytania.filter((p) => !p.uzyte), uzyte = B.pytania.filter((p) => p.uzyte);
  box.innerHTML = `<div class="karta"><div class="naglowek"><div><h3>💬 Pytania klientek <small class="podpowiedz">${nowe.length} czeka na rolkę</small></h3>
      <p class="podpowiedz">Wpisuj pytania z komentarzy, DM i gabinetu. To najlepsze tematy: rolka-odpowiedź działa, bo widzka myśli „to o mnie”. Plan tygodnia i gotowe pomysły biorą je same.</p></div></div>
    <div class="rzad pyt-dodaj"><input id="pytTekst" placeholder="np. Czy laminacja niszczy brwi?" style="flex:1"><select id="pytZrodlo"><option value="komentarz">z komentarza</option><option value="DM">z DM</option><option value="w gabinecie">w gabinecie</option></select><button class="btn" id="pytDodaj">Dodaj</button></div>
    ${nowe.length ? `<div class="chipy pyt-lista">${nowe.map((p) => `<span class="pyt">„${esc(p.tekst)}” <small>${esc(p.zrodlo)}</small><button data-pyt-usun="${p.id}" title="Usuń">✕</button></span>`).join("")}</div>` : ""}
    ${uzyte.length ? `<details><summary class="podpowiedz">Już wykorzystane (${uzyte.length})</summary><div class="chipy pyt-lista">${uzyte.map((p) => `<span class="pyt uzyte">„${esc(p.tekst)}” <small>${esc(p.uzyte)}</small><button data-pyt-usun="${p.id}" title="Usuń">✕</button></span>`).join("")}</div></details>` : ""}</div>`;
  const dodaj = async () => {
    const t = $("#pytTekst", box).value.trim(); if (!t) return toast("Wpisz pytanie");
    try { await api("/api/pytania", { method: "POST", body: { tekst: t, zrodlo: $("#pytZrodlo", box).value } }); kartaPytan(); } catch (e) { blad(e); }
  };
  $("#pytDodaj", box).onclick = dodaj;
  $("#pytTekst", box).onkeydown = (e) => { if (e.key === "Enter") dodaj(); };
  box.querySelectorAll("[data-pyt-usun]").forEach((b) => (b.onclick = async () => { await api(`/api/pytania/${b.dataset.pytUsun}`, { method: "DELETE" }).catch(blad); kartaPytan(); }));
}

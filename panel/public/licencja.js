// Ekran aktywacji (scripts/licencja.mjs, API /api/licencja): bez kodu panel pokazuje tylko to okno.
"use strict";

function pokazAktywacje(stan) {
  document.body.classList.add("bez-licencji");
  let el = $("#licencja");
  if (!el) { el = document.createElement("div"); el.id = "licencja"; document.body.appendChild(el); }
  el.innerHTML = `<div class="lic-okno">
    <div class="lic-ikona">🔐</div>
    <h1>Aktywuj panel rolek</h1>
    <p class="kr-lead">Wpisz kod licencyjny, który dostałaś od autora aplikacji. Wystarczy raz na tym komputerze.</p>
    ${stan?.powod ? `<p class="ramka ostrzezenie">${esc(stan.powod)}</p>` : ""}
    <input id="licKod" autocomplete="off" spellcheck="false" maxlength="24" placeholder="ROLKI-XXXX-XXXX-XXXX">
    <button class="btn duzy" id="licOk">Aktywuj</button>
    <p id="licBlad" class="lic-blad"></p>
    <p class="podpowiedz">Nie masz kodu? Napisz do autora aplikacji. Bez kodu panel i skrypty nie działają.</p></div>`;
  const pole = $("#licKod", el);
  // formatowanie w locie: ROLKI-XXXX-XXXX-XXXX
  pole.oninput = () => {
    const c = pole.value.toUpperCase().replace(/[^A-Z0-9]/g, "").replace(/^ROLKI/, "").slice(0, 12);
    pole.value = c ? `ROLKI-${[c.slice(0, 4), c.slice(4, 8), c.slice(8, 12)].filter(Boolean).join("-")}` : "";
  };
  const aktywuj = async () => {
    const kod = pole.value.trim();
    if (kod.replace(/[^A-Z0-9]/gi, "").length < 17) return ($("#licBlad", el).textContent = "Kod ma postać ROLKI-XXXX-XXXX-XXXX.");
    $("#licOk", el).disabled = true; $("#licBlad", el).textContent = "";
    try { await api("/api/licencja", { method: "POST", body: { kod } }); $("#licOk", el).textContent = "✓ Aktywowano"; setTimeout(() => location.reload(), 600); }
    catch (e) { $("#licBlad", el).textContent = e.message; $("#licOk", el).disabled = false; }
  };
  $("#licOk", el).onclick = aktywuj;
  pole.onkeydown = (e) => { if (e.key === "Enter") aktywuj(); };
  pole.focus();
}

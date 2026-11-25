// Tryb prosty: zamiast 8 kroków trzy rzeczy: wrzuć nagrania, Claude montuje i pyta, obejrzyj i pobierz.
// Domyślny dla każdego. Cały kreator zostaje pod „🧩 Tryb zaawansowany” (przełącznik w nagłówku, localStorage trybPanelu).
// Prosty tryb nie ma własnej logiki montażu: woła te same funkcje co kreator (autopilot, asystent, render, okładka, sprawdz).
"use strict";

const trybProsty = () => { try { return localStorage.getItem("trybPanelu") !== "zaawansowany"; } catch { return true; } };
function ustawTryb(prosty) {
  try { localStorage.setItem("trybPanelu", prosty ? "prosty" : "zaawansowany"); } catch {}
  if (!prosty && S.projekt && S.krok === 0) S.krok = 6; // z rolki w prostym trybie od razu do podglądu i renderu
  pokaz();
  window.scrollTo(0, 0);
}
function oznaczTryb() {
  const p = trybProsty();
  document.body.classList.toggle("prosty", p);
  const b = $("#trybBtn");
  if (b) { b.textContent = p ? "🧩 Tryb zaawansowany" : "✨ Tryb prosty"; b.title = p ? "Wszystkie narzędzia: 8 kroków, sceny, efekty, napisy" : "Trzy kroki: wrzuć, Claude montuje, pobierz"; }
}

function pokazProsty() {
  oznaczTryb();
  $("#projektNazwa").textContent = "";
  history.replaceState(null, "", S.projekt ? `#p=${encodeURIComponent(S.projekt.nazwa)}&k=0` : "#");
  const ekran = $("#ekran");
  ekran.innerHTML = `<div id="tresc" class="prosty-ekran"></div>`;
  const el = $("#tresc");
  try { const w = S.projekt ? ekranRolkiProsty(el) : ekranStartuProsty(el); if (w?.catch) w.catch(blad); } catch (e) { blad(e); }
  odswiezPrzyciski();
}

// ---------- start ----------
const KROKI_PROSTE = [["📥", "Wrzuć nagrania", "z telefonu albo z komputera"], ["🪄", "Claude montuje", "pyta o kilka rzeczy, Ty klikasz"], ["⬇️", "Obejrzyj i pobierz", "gotowe na Instagram"]];
async function ekranStartuProsty(el) {
  el.innerHTML = `
    <div class="pr-hero"><h1>${OS().wol ? `Cześć, ${esc(OS().wol)}!` : "Cześć!"} Zróbmy rolkę.</h1>
      <div class="pr-kroki">${KROKI_PROSTE.map(([i, t, o], n) => `<div class="pr-krok"><span class="pr-nr">${n + 1}</span><span class="pr-ikona">${i}</span><b>${t}</b><small>${o}</small></div>`).join('<span class="pr-strzalka">→</span>')}</div>
      <div class="pr-akcje">
        <button class="btn duzy pr-glowny" id="prWrzuc" data-zadanie>🪄 Wrzuć nagrania i zacznij</button>
        <button class="btn duzy jasny" id="prTelefon">📱 Nagraj telefonem</button>
        <button class="btn duzy jasny" id="prPomysl">💡 Nie wiem, co nagrać</button>
      </div></div>
    <div id="planKarta"></div>
    <h2 class="pr-tytul">Twoje rolki</h2>
    <div id="prRolki"><p class="podpowiedz">Ładuję…</p></div>
    <div id="pytaniaKarta"></div>
    <div id="stylKarta"></div>
    <p class="podpowiedz pr-wiecej"><button class="link" id="prUstawienia">⚙ Ustawienia gabinetu</button> (imię, konta, wygląd marki, sprawdzenie programów) · <button class="link" id="prIG">📸 Wyniki z Instagrama</button></p>`;
  $("#prIG").onclick = oknoInstagrama;
  $("#prUstawienia").onclick = () => otworzKreator(0);
  $("#prWrzuc").onclick = startAutopilota;
  $("#prTelefon").onclick = oknoTelefonu;
  $("#prPomysl").onclick = oknoPropozycji;
  kartaStylistyki();
  kartaPlanu();
  kartaPytan();
  const lista = await api("/api/projekty").catch(() => []);
  const box = $("#prRolki"); if (!box) return;
  if (!lista.length) { box.innerHTML = `<div class="karta pusto">Nie ma jeszcze rolek. Kliknij „Wrzuć nagrania i zacznij”.</div>`; return; }
  box.innerHTML = `<div class="pr-rolki">${lista.slice(0, 12).map((p) => {
    const [ikona, stan] = stanSlowami(p.status);
    return `<button class="pr-rolka" data-otworz="${esc(p.nazwa)}"><div class="mini" style="background-image:url('${p.miniatura ? thumb(p.miniatura, 1, 360) : ""}')"></div><div><b>${esc(/^todo$/i.test(p.tytul) ? p.nazwa : p.tytul)}</b><small>${ikona} ${stan}</small></div></button>`;
  }).join("")}</div>${lista.length > 12 ? `<p class="podpowiedz">Starsze rolki znajdziesz w trybie zaawansowanym.</p>` : ""}`;
  box.querySelectorAll("[data-otworz]").forEach((b) => (b.onclick = () => otworz(b.dataset.otworz, 0)));
}
function stanSlowami(status) {
  const s = String(status || "").toLowerCase();
  if (/gotow|final|opublik/.test(s)) return ["✅", "Gotowa"];
  if (/robocz|draft|akcept|standard/.test(s)) return ["👀", "Do obejrzenia"];
  if (/błęd|blad/.test(s)) return ["⚠️", "Coś poszło nie tak"];
  return ["🎬", "W trakcie"];
}

// ---------- rolka ----------
function ekranRolkiProsty(el) {
  const P = S.projekt;
  const finaly = P.pliki.final.filter((f) => f.typ === "wideo").sort((a, b) => Date.parse(b.data) - Date.parse(a.data));
  const final = finaly.find((f) => f.nazwa === `${P.nazwa}.mp4`) || finaly.find((f) => !/_4K\.mp4$/.test(f.nazwa)) || finaly[0];
  const final4k = finaly.find((f) => /_4K\.mp4$/.test(f.nazwa));
  const robocze = P.pliki.render.filter((f) => f.typ === "wideo").sort((a, b) => Date.parse(b.data) - Date.parse(a.data));
  const nieaktualny = final && P.rolkaZmiana && Date.parse(P.rolkaZmiana) > Date.parse(final.data);
  const film = (nieaktualny ? robocze[0] : final) || final || robocze[0];
  const statusFinalu = P.pola.status || "";
  const gotowyFinal = final && !nieaktualny && /^(gotowa do publikacji|opublikowana)/i.test(statusFinalu);
  const nagrania = P.pliki.raw.length;
  const ap = stanAutopilota(P.nazwa);
  const krok = gotowyFinal ? 3 : film || ap || nagrania ? 2 : 1;
  const r = rolka();
  const nat = r.montaz === "naturalny";
  const preset = wybranyStylMontazu();
  const maProxy = P.pliki.proxy.some((f) => f.typ === "wideo");
  const blok = blokadaFinalu() || (ap ? blokadaFinaluAutopilota(P.audytAutopilota) : null);
  const potrzebaZgody = /^tak/i.test(P.pola["twarz klientki w kadrze"] || "") && !/^tak/i.test(P.pola["zgoda na wizerunek"] || "");
  const opis = [P.sekcje["Opis pod rolkę"], P.sekcje["Hashtagi"]].map((s) => (s || "").replace(/^TODO\s*$/im, "").trim()).filter(Boolean).join("\n\n");
  el.innerHTML = `
    <div class="pr-gora"><button class="btn jasny" id="prWroc">← Moje rolki</button><h1>${esc(/^todo$/i.test(P.pola["tytuł roboczy"] || "") ? P.nazwa : P.pola["tytuł roboczy"] || P.nazwa)}</h1></div>
    <div class="pr-postep">${KROKI_PROSTE.map(([i, t], n) => `<div class="${n + 1 < krok ? "zrobiony" : n + 1 === krok ? "teraz" : ""}"><span>${n + 1 < krok ? "✓" : n + 1}</span>${t}</div>`).join("")}</div>
    <div class="pr-uklad">
      <div class="pr-film">${film ? telefon(`<video class="odtwarzacz" src="${media(film.sciezka)}&v=${Date.parse(film.data)}" controls playsinline></video>`) : `<div class="pr-brak">${nagrania ? "🎬<br>Tu pojawi się rolka, gdy Claude ją zmontuje." : "📥<br>Najpierw nagrania."}</div>`}
        ${film ? `<p class="podpowiedz" style="text-align:center">${film === final ? "Wersja końcowa" : "👀 Wersja robocza (podgląd, niższa jakość)"} · ${new Date(film.data).toLocaleString("pl-PL", { dateStyle: "short", timeStyle: "short" })}</p>` : ""}</div>
      <div class="pr-panel">
        ${!nagrania ? `<div class="karta"><h3>📥 Wrzuć nagrania</h3>
          <label class="ap-zrzut" id="prZrzut"><input type="file" id="prPliki" multiple accept="video/*,image/*" hidden><b>Przeciągnij tu nagrania</b><br><small>albo kliknij, żeby wybrać</small></label>
          <div class="rzad" style="margin-top:10px"><button class="btn jasny" id="prTel">📱 Albo prosto z telefonu</button></div></div>` : ""}
        ${nagrania && !ap && !film ? `<div class="karta pr-wyrozniona"><h3>🪄 Zmontujmy to</h3><p class="podpowiedz">${nagrania} ${nagrania === 1 ? "nagranie" : nagrania < 5 ? "nagrania" : "nagrań"} w rolce. Claude je obejrzy, zada kilka pytań i zmontuje rolkę.</p><button class="btn duzy" id="prMontuj">🪄 Zmontuj z Claude</button></div>` : ""}
        ${ap ? `<div class="karta"><h3>💬 Rozmowa z Claude</h3><p class="podpowiedz">${ap.idZadania ? "Trwa montaż lub kontrola." : gotowyFinal ? "Wersja końcowa gotowa." : P.audytAutopilota?.aktualny ? "Sprawdzona wersja robocza czeka na obejrzenie." : "Wróć do rozmowy, aby kontynuować."}</p><button class="btn ${ap.gotowe ? "jasny" : ""}" id="prRozmowa">💬 ${ap.gotowe ? "Otwórz rozmowę" : "Wróć do rozmowy"}</button></div>` : ""}
        ${potrzebaZgody ? `<div class="karta pr-uwaga"><h3>🙋 Zgoda klientki</h3><p>W kadrze jest twarz klientki. Czy zgodziła się na pokazanie jej w rolce?</p><div class="rzad"><button class="btn" id="prZgodaTak">Tak, mam zgodę</button><button class="btn jasny" id="prZgodaNie">Nie</button></div></div>` : ""}
        ${film ? `<div class="karta"><h3>✏️ Co poprawić?</h3>
          <div class="chipy pr-szybkie">${["Krótsza", "Mniej tekstu na ekranie", "Mocniejszy początek", "Spokojniejsza", "Inna muzyka"].map((t) => `<button class="chip-btn" data-popraw="${esc(t)}">${esc(t)}</button>`).join("")}</div>
          <textarea id="prPoprawka" rows="2" placeholder="Napisz po swojemu, np. „wytnij moment, gdzie się mylę”"></textarea>
          <div class="rzad" style="margin-top:8px"><button class="btn" id="prPopraw">Popraw</button></div>
          <div class="pr-charakter"><span>Wygląd:</span><button data-montaz="reklamowy" class="${nat || preset ? "" : "wybrany"}">📣 Reklamowy</button><button data-montaz="naturalny" class="${nat ? "wybrany" : ""}">🤳 Naturalny, jak vlog</button></div></div>` : ""}
        ${nagrania || film || maProxy || r.ujecia.length ? '<div class="panel-presetow"></div>' : ""}
        ${maProxy ? kartaSzukaniaUjec() : ""}
        ${kartaRezyseriiProjektu()}
        ${kartaAudytuAutopilota(P)}
        ${film && !gotowyFinal ? `<div class="karta pr-wyrozniona"><h3>✅ Podoba mi się</h3><p class="podpowiedz">${nieaktualny ? "Po ostatnich poprawkach trzeba zrobić wersję końcową jeszcze raz." : "Zrobię wersję końcową w pełnej jakości, okładkę i sprawdzę plik pod Instagram (kilka minut)."}</p>
          ${blok ? `<div class="ramka ostrzezenie">${esc(blok)}</div>` : `<button class="btn duzy" id="prFinal" data-zadanie>✅ Zrób wersję końcową</button>`}</div>` : ""}
        ${final ? wynikiRolkiHtml(P.wyniki) : ""}
        ${final ? `<div class="karta pr-wyrozniona"><h3>${gotowyFinal ? "⬇️ Gotowe na Instagram" : "Wersja końcowa do sprawdzenia"}</h3>
          ${gotowyFinal || !statusFinalu ? "" : `<p class="podpowiedz">${esc(statusFinalu)}</p>`}
          <div class="rzad"><a class="btn duzy" href="${media(final4k?.sciezka || final.sciezka)}" download="${esc(P.nazwa)}.mp4">⬇️ Pobierz film</a>${P.pliki.final.some((f) => f.nazwa === "okladka.jpg") ? `<a class="btn jasny" href="${media(`${P.sciezka}/final/okladka.jpg`)}" download="okladka.jpg">🖼️ Okładka</a>` : ""}</div>
          ${opis ? `<label class="pole" style="margin-top:12px"><span>Opis pod rolkę</span><textarea id="prOpis" rows="5" readonly>${esc(opis)}</textarea></label><button class="btn jasny" id="prKopiuj">📋 Kopiuj opis</button>`
            : `<p class="podpowiedz" style="margin-top:10px">Nie ma jeszcze opisu pod rolkę.</p><button class="btn jasny" id="prOpisZrob">✦ Napisz opis i hashtagi</button>`}</div>` : ""}
        <p class="podpowiedz pr-wiecej">Chcesz ustawić coś sama (sceny, napisy, efekty)? <button class="link" id="prZaawansowany">Otwórz tę rolkę w trybie zaawansowanym</button></p>
      </div>
    </div>`;
  $("#prWroc").onclick = () => { S.projekt = null; idz(0); };
  $("#prZaawansowany").onclick = () => ustawTryb(false);
  podepnijSzukanieUjec(el);
  podepnijRezyserieProjektu(el);
  podepnijAudytAutopilota(el);
  kartaPresetowMontazu($(".panel-presetow", el));
  const zrzut = $("#prZrzut");
  if (zrzut) {
    const wgraj = async (pliki) => {
      pliki = [...pliki].filter((f) => /^(video|image)\//.test(f.type) || /\.(mov|mp4|heic|jpe?g|png|webp)$/i.test(f.name));
      for (let i = 0; i < pliki.length; i++) {
        toast(`Wgrywam ${i + 1}/${pliki.length}: ${pliki[i].name}`, 60000);
        try { const r2 = await fetch(`/api/projekt/${encodeURIComponent(P.nazwa)}/raw?nazwa=${encodeURIComponent(pliki[i].name)}`, { method: "POST", body: pliki[i] }); if (!r2.ok) throw new Error((await r2.json().catch(() => ({}))).blad || r2.status); }
        catch (e) { blad(new Error(`Nie wgrałam ${pliki[i].name}: ${e.message || e}`)); }
      }
      toast("Wgrane ✓", 1500);
      odswiezProjekt();
    };
    $("#prPliki").onchange = (e) => wgraj(e.target.files);
    zrzut.ondragover = (e) => { e.preventDefault(); zrzut.classList.add("nad"); };
    zrzut.ondragleave = () => zrzut.classList.remove("nad");
    zrzut.ondrop = (e) => { e.preventDefault(); zrzut.classList.remove("nad"); wgraj(e.dataTransfer.files); };
    $("#prTel").onclick = oknoTelefonu;
  }
  const on = (id, fn) => { const b = $(id); if (b) b.onclick = fn; };
  on("#prMontuj", () => uruchomAutopilota(false));
  on("#prRozmowa", () => uruchomAutopilota(true));
  on("#prZgodaTak", async () => { await zapiszBrief({ "zgoda na wizerunek": "tak" }); pokaz(); });
  on("#prZgodaNie", async () => { await zapiszBrief({ "zgoda na wizerunek": "nie" }); poprawka("Klientka nie zgodziła się na wizerunek: wykadruj albo usuń ujęcia z jej twarzą, tak żeby nie było jej widać."); });
  on("#prPopraw", () => { const t = $("#prPoprawka").value.trim(); if (!t) return toast("Napisz, co poprawić, albo kliknij gotową podpowiedź"); poprawka(t); });
  el.querySelectorAll("[data-popraw]").forEach((b) => (b.onclick = () => poprawka(b.dataset.popraw)));
  el.querySelectorAll(".pr-charakter [data-montaz]").forEach((b) => (b.onclick = () => {
    if (!preset && (b.dataset.montaz === "naturalny") === nat) return;
    if (b.dataset.montaz === "naturalny") r.montaz = "naturalny"; else delete r.montaz;
    zapiszRolke();
    poprawka(b.dataset.montaz === "naturalny" ? "Przełączyłam rolkę na wygląd naturalny, jak vlog. Złóż ją i zrób wersję roboczą, nic więcej nie zmieniaj." : "Przełączyłam rolkę na wygląd reklamowy. Złóż ją i zrób wersję roboczą, nic więcej nie zmieniaj.", true);
  }));
  on("#prFinal", () => (ap ? akcjaAutopilota("Robimy final") : finalizujZPanelem(P)).catch(blad));
  on("#prKopiuj", async () => { try { await navigator.clipboard.writeText($("#prOpis").value); toast("Skopiowano opis"); } catch { blad(new Error("Nie udało się skopiować")); } });
  on("#prOpisZrob", () => poprawka("Napisz opis pod rolkę (mówiony, krótki, bez obietnic) i 5-10 hashtagów (lokalne z config.json + branżowe). Wpisz je do brief.md w sekcje „Opis pod rolkę” i „Hashtagi”. Nie renderuj.", true));
}

// Poprawka zdaniem: ta sama rozmowa co autopilot (jeśli był), inaczej osobna rozmowa „Poprawki”.
function poprawka(tekst, bezRenderu) {
  const P = S.projekt, n = P.nazwa;
  const ap = stanAutopilota(n);
  if (ap?.sesja) {
    uruchomAutopilota(true);
    return wyslijDoAsystenta(`${tekst}\nJeśli wprowadzisz zmiany w montażu, zakończ MONTAŻ DO KONTROLI. Panel przygotuje nowy podgląd. Jeśli zmieniasz tylko opis, nie uruchamiaj kontroli ani renderu.`, tekst);
  }
  const zadanie = bezRenderu
    ? tekst + "\nNa końcu krótko napisz, co zrobiłaś, a w ostatniej linii: GOTOWE"
    : `${OS().mian} ogląda rolkę i prosi o poprawkę: „${tekst}”.
Zrób ją w ${P.sciezka}/kompozycja/rolka.json (ujęcia, sceny, napisy, efekty; zasady z CLAUDE.md, bez obietnic medycznych), potem npm run zloz -- ${n} i npm run render -- ${n} (wersja robocza, timeout 600000). Jeśli prośba jest niejasna, zadaj jedno pytanie z linią OPCJE: a | b | c.
Na końcu jednym, dwoma zdaniami napisz po ludzku, co zmieniłaś, a w ostatniej linii: GOTOWE`;
  const tytul = "Poprawki ✏️";
  const otwarta = A.klucz === n + "|" + tytul && A.sesja;
  otworzAsystenta({ tytul, powitanie: "Już się za to biorę. Poprawię rolkę i zrobię nową wersję do obejrzenia (zwykle 1-3 minuty).",
    prompt: `Użyj skilla rolki-beauty i zasad z CLAUDE.md. Projekt rolki: ${n} (folder ${P.sciezka}). Pliki: brief.md, kompozycja/rolka.json, napisy/.
${OS().mian} pracuje w prostym trybie panelu: nie zna kroków ani pól, mów do niej zwykłym językiem.${uwagaMontazu()}
${zadanie}` });
  if (otwarta) wyslijDoAsystenta(zadanie, bezRenderu ? null : tekst);
}

// ---------- podpięcie ----------
(function () {
  const b = document.createElement("button");
  b.id = "trybBtn"; b.className = "opcje-btn tryb-btn";
  $("#telefonBtn").before(b);
  b.onclick = () => ustawTryb(!trybProsty());
  // logo w prostym trybie = lista rolek (bez otwartej rolki)
  const logo = $("#logo"), stare = logo.onclick;
  logo.onclick = () => { if (trybProsty()) { S.projekt = null; PM.id = null; } stare(); };
  oznaczTryb();
})();

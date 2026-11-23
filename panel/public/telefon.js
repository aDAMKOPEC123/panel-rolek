// Telefon przez kod QR (panel/telefon.mjs): okno z kodem, adres w sieci Wi-Fi, lista nagrań, które przyszły z telefonu.
// Gdy dostęp jest włączony, panel co 3 s sprawdza nowe nagrania: dymek + odświeżenie otwartej rolki.
"use strict";

const TEL = { stan: null, znane: new Set(), timer: null, qrLib: null, wybranyAdres: 0 };

function zaladujQr() {
  if (window.qrcode) return Promise.resolve(window.qrcode);
  if (TEL.qrLib) return TEL.qrLib;
  TEL.qrLib = new Promise((ok, zle) => {
    const s = document.createElement("script");
    s.src = "https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.min.js";
    s.onload = () => (window.qrcode ? ok(window.qrcode) : zle(new Error("brak biblioteki QR")));
    s.onerror = () => { TEL.qrLib = null; zle(new Error("brak internetu do biblioteki QR")); };
    document.head.appendChild(s);
  });
  return TEL.qrLib;
}
async function rysujQr(box, tekst) {
  try {
    const qrcode = await zaladujQr();
    const q = qrcode(0, "M");
    q.addData(tekst);
    q.make();
    box.innerHTML = q.createSvgTag({ cellSize: 6, margin: 2, scalable: true });
  } catch (e) {
    box.innerHTML = `<p class="podpowiedz">Nie mogę narysować kodu (${esc(e.message)}). Wpisz adres poniżej w przeglądarce telefonu.</p>`;
  }
}
function ileTemu(iso) { const s = Math.round((Date.now() - Date.parse(iso)) / 1000); return s < 60 ? "przed chwilą" : s < 3600 ? `${Math.round(s / 60)} min temu` : new Date(iso).toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" }); }
const nazwaCelu = (g) => g === "00_INBOX" ? "skrzynka (00_INBOX)" : (g || "").replace(/^\d{4}-\d{2}-\d{2}_/, "").replace(/[_-]/g, " ");

async function oknoTelefonu() {
  const m = modal(`<h2>📱 Nagrania prosto z telefonu</h2><p class="podpowiedz">Włączam dostęp w Twojej sieci Wi-Fi…</p>`);
  try { TEL.stan = await api("/api/telefon/wlacz", { method: "POST" }); } catch (e) { m.innerHTML = `<h2>📱 Telefon</h2><p style="color:var(--blad)">✗ ${esc(e.message)}</p><div class="rzad"><button class="btn jasny" onclick="zamknijModal()">Zamknij</button></div>`; return; }
  (TEL.stan.wgrane || []).forEach((w) => TEL.znane.add(w.czas + w.plik));
  sledzTelefon();
  rysujOkno(m);
}
function rysujOkno(m) {
  const T = TEL.stan;
  if (!T.wlaczony || !T.adresy.length) {
    m.innerHTML = `<h2>📱 Telefon</h2><p style="color:var(--blad)">✗ ${esc(T.blad || "Nie udało się włączyć dostępu.")}</p>
      <p class="podpowiedz">Komputer i telefon muszą być w tej samej sieci Wi-Fi (albo komputer na kablu w tym samym routerze).</p>
      <div class="rzad"><button class="btn" id="telZnowu">Spróbuj jeszcze raz</button><button class="btn jasny" onclick="zamknijModal()">Zamknij</button></div>`;
    $("#telZnowu", m).onclick = oknoTelefonu;
    return;
  }
  const a = T.adresy[Math.min(TEL.wybranyAdres, T.adresy.length - 1)];
  m.innerHTML = `<h2>📱 Nagrania prosto z telefonu</h2>
    <div class="tel-uklad">
      <div class="tel-qr" id="telQr"></div>
      <div>
        <ol class="tel-kroki">
          <li>Telefon w <b>tym samym Wi-Fi</b> co komputer.</li>
          <li>Otwórz aparat i <b>zeskanuj kod</b>.</li>
          <li>Wybierz rolkę: zobaczysz listę, co nagrać, z tekstem do powiedzenia. <b>🎥 Nagraj</b> albo <b>🖼️ Z galerii</b>.</li>
          <li>Pliki lecą w pełnej jakości prosto do rolki (M1, M2… dostają dobre nazwy).</li>
        </ol>
        <label class="pole"><span>Albo wpisz w przeglądarce telefonu</span><input readonly id="telUrl" value="${esc(a.url)}"></label>
        ${T.adresy.length > 1 ? `<p class="podpowiedz">Nie łączy? Spróbuj innej sieci komputera: ${T.adresy.map((x, i) => `<button class="btn maly ${i === TEL.wybranyAdres ? "" : "jasny"}" data-adr="${i}">${esc(x.karta)} ${esc(x.ip)}</button>`).join(" ")}</p>` : ""}
      </div>
    </div>
    <div id="telWgrane"></div>
    <details class="podpowiedz"><summary>Telefon nie może się połączyć?</summary>
      <ul><li>Przy pierwszym włączeniu Windows może zapytać, czy Node.js może działać w sieci. Zaznacz <b>sieci prywatne</b> i kliknij Zezwól. Jeśli okno zniknęło: Zapora systemu Windows → Zezwalaj aplikacji → Node.js (prywatne).</li>
      <li>Twoja sieć Wi-Fi w Windows powinna być ustawiona jako <b>prywatna</b>, nie publiczna.</li>
      <li>Wi-Fi dla gości w routerze często blokuje połączenia między urządzeniami.</li></ul></details>
    <p class="podpowiedz">🔒 Link działa tylko z tym kodem i tylko do wgrywania (bez podglądu Twoich plików). Nowy kod po każdym włączeniu, a dostęp sam się wyłączy po godzinie bez ruchu.</p>
    <div class="rzad"><button class="btn jasny" id="telWylacz">Wyłącz dostęp z telefonu</button><button class="btn" id="telOk">Zamknij okno (dostęp zostaje)</button></div>`;
  rysujQr($("#telQr", m), a.url);
  $("#telUrl", m).onclick = (e) => { e.target.select(); navigator.clipboard?.writeText(a.url).then(() => toast("Skopiowano adres")).catch(() => {}); };
  m.querySelectorAll("[data-adr]").forEach((b) => (b.onclick = () => { TEL.wybranyAdres = Number(b.dataset.adr); rysujOkno(m); }));
  $("#telOk", m).onclick = zamknijModal;
  $("#telWylacz", m).onclick = async () => { try { TEL.stan = await api("/api/telefon/wylacz", { method: "POST" }); } catch {} zamknijModal(); sledzTelefon(); toast("Dostęp z telefonu wyłączony"); };
  rysujWgrane();
}
function rysujWgrane() {
  const box = $("#telWgrane"); if (!box) return;
  const w = TEL.stan?.wgrane || [];
  box.innerHTML = `<div class="tel-lista"><b>Z telefonu ${w.length ? `(${w.length})` : ""}</b>${w.length ? `<ul>${w.slice(0, 8).map((x) => `<li>✓ <b>${esc(x.plik.split("/").pop())}</b> → ${esc(nazwaCelu(x.gdzie))} <small class="podpowiedz">${ileTemu(x.czas)}${x.rozmiar ? ` · ${(x.rozmiar / 1048576).toFixed(1)} MB` : ""}</small></li>`).join("")}</ul>` : `<p class="podpowiedz" style="margin:4px 0 0">Czekam na pierwsze nagranie…</p>`}</div>`;
}
async function sprawdzTelefon() {
  try { TEL.stan = await api("/api/telefon"); } catch { return; }
  const nowe = (TEL.stan.wgrane || []).filter((w) => !TEL.znane.has(w.czas + w.plik));
  nowe.forEach((w) => TEL.znane.add(w.czas + w.plik));
  if (nowe.length) {
    toast(`📱 Z telefonu: ${nowe.map((w) => w.plik.split("/").pop()).join(", ")}`, 4000);
    if (S.projekt && nowe.some((w) => w.gdzie === S.projekt.nazwa)) odswiezProjekt();
  }
  rysujWgrane();
  oznaczPrzycisk();
  if (!TEL.stan.wlaczony) sledzTelefon();
}
function sledzTelefon() {
  clearInterval(TEL.timer); TEL.timer = null;
  if (TEL.stan?.wlaczony) TEL.timer = setInterval(sprawdzTelefon, 3000);
  oznaczPrzycisk();
}
function oznaczPrzycisk() { const b = $("#telefonBtn"); if (b) b.classList.toggle("wlaczony", !!TEL.stan?.wlaczony); }

$("#telefonBtn").onclick = oknoTelefonu;
// po odświeżeniu strony: dostęp mógł zostać włączony wcześniej
api("/api/telefon").then((s) => { TEL.stan = s; (s.wgrane || []).forEach((w) => TEL.znane.add(w.czas + w.plik)); sledzTelefon(); }).catch(() => {});

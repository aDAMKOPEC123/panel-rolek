"use strict";

const urlBriefuAI = () => S.projekt ? `/api/brief-ai?projekt=${encodeURIComponent(S.projekt.nazwa)}`
  : PM.id ? `/api/brief-ai?pomysl=${encodeURIComponent(PM.id)}` : "/api/brief-ai";

async function pokazBriefAI() {
  const url = urlBriefuAI(), projekt = S.projekt?.nazwa;
  try {
    const { brief, pamiec } = await api(url);
    const p = brief.publikacja;
    const lista = (zakres, tytul) => `<section><h3>${tytul}</h3><ul class="ai-zapisane" data-ai-pamiec="${zakres}">
      ${pamiec[zakres].map((u) => `<li><span>${esc(u.tresc)}</span><button class="link" type="button" data-ai-usun="${esc(u.klucz)}" aria-label="Usuń preferencję">Usuń</button></li>`).join("") || '<li class="podpowiedz">Brak zapisanych preferencji.</li>'}</ul></section>`;
    const m = modal(`<div class="ai-brief"><h2>Brief dla Claude</h2>
      ${p?.temat ? `<p><b>${esc(p.temat)}</b> ${[p.format, p.cel, p.data].filter(Boolean).map(esc).join(" · ")}</p>` : ""}
      ${brief.marka.nazwa ? `<p class="podpowiedz">${esc([brief.marka.nazwa, brief.marka.styl].filter(Boolean).join(" · "))}</p>` : ""}
      ${lista("marka", "Preferencje marki")}${projekt ? lista("projekt", "Preferencje projektu") : ""}
      <label class="pole"><span>Nowa preferencja</span><textarea id="aiNowaZasada" rows="2" maxlength="240" placeholder="np. W edukacyjnych rolkach stosuj spokojne napisy"></textarea></label>
      <div class="rzad"><button class="btn maly" data-ai-zakres="marka">Zapamiętaj dla marki</button>
      ${projekt ? '<button class="btn maly jasny" data-ai-zakres="projekt">Tylko w tym projekcie</button>' : ""}</div>
      ${p ? `<details><summary>Dane projektu przekazywane do AI</summary><pre class="log">${esc(JSON.stringify({ publikacja: p, zatwierdzone: brief.zatwierdzone, materialy: brief.materialy, dostepne_pliki: brief.dostepne_pliki, dopasowania: brief.dopasowania, uwagi: brief.uwagi }, null, 2))}</pre></details>` : ""}
      <p class="podpowiedz" id="aiStanPreferencji" role="status"></p><button class="link" id="aiZamknijBrief">Zamknij</button></div>`);
    $("#aiZamknijBrief", m).onclick = zamknijModal;
    const zapisz = async (przycisk, body) => {
      przycisk.disabled = true;
      try {
        await api("/api/preferencje-ai", { method: "POST", body: { ...body, projekt } });
        if (!przycisk.isConnected || $("#modal").classList.contains("ukryte")) return;
        await pokazBriefAI();
        toast(body.usun ? "Usunięto preferencję" : "Zapisano preferencję");
      } catch (e) { const stan = $("#aiStanPreferencji", m); if (stan) stan.textContent = e.message; }
      finally { przycisk.disabled = false; }
    };
    m.querySelectorAll("[data-ai-usun]").forEach((b) => { b.onclick = () => zapisz(b, { zakres: b.closest("[data-ai-pamiec]").dataset.aiPamiec, usun: b.dataset.aiUsun }); });
    m.querySelectorAll("[data-ai-zakres]").forEach((b) => { b.onclick = () => zapisz(b, { zakres: b.dataset.aiZakres, tresc: $("#aiNowaZasada", m).value }); });
  } catch (e) { blad(e); }
}

async function pokazPoprawkeAI({ url, wybor, tytul, cel, sugestia, przycisk, widok, po, powrot, zakresProjektu = "Tylko w tym projekcie" }) {
  if (S.zadanie) return;
  if (przycisk) przycisk.disabled = true;
  try {
    const z = await api(url, { method: "POST", body: wybor });
    const { kod, wynik, tekst } = await sledz(z, tytul);
    if (kod !== 0 || !wynik) throw new Error(tekst.split("\n").find((l) => l.startsWith("✗ BŁĄD:"))?.replace(/^✗ BŁĄD: /, "") || "Nie udało się przygotować zmiany.");
    if (przycisk && (!przycisk.isConnected || przycisk.closest("#modal.ukryte"))) return;
    const html = widok(JSON.parse(wynik));
    const m = modal(`<div class="ai-brief"><h2>${esc(tytul)}</h2>
      ${cel ? `<p>${esc(cel)}</p>` : ""}
      <div class="ai-porownanie"><section><h3>Obecna wersja</h3>${html.przed}</section><section><h3>Propozycja Claude</h3>${html.po}</section></div>
      <details><summary>Zapamiętaj zasadę przy zapisie</summary>
        <label class="pole"><span>Zasada do zapamiętania</span><textarea rows="2" maxlength="240" id="aiZasadaPoprawki">${esc(sugestia?.slice(0, 240) || "")}</textarea></label>
        <label class="pole"><span>Zakres</span><select id="aiZakresPoprawki"><option value="">Bez zapamiętywania</option><option value="marka">Zapamiętaj dla marki</option><option value="projekt">${esc(zakresProjektu)}</option></select></label>
      </details><p id="aiStatusPoprawki" class="podpowiedz" role="status"></p>
      <div class="rzad"><button class="btn" id="aiZastosujPoprawke">Zastosuj poprawkę</button><button class="btn jasny" id="aiAnulujPoprawke">Odrzuć</button></div></div>`);
    $("#aiAnulujPoprawke", m).onclick = () => { zamknijModal(); powrot?.(); };
    const b = $("#aiZastosujPoprawke", m);
    b.onclick = async () => {
      b.disabled = true;
      const status = $("#aiStatusPoprawki", m);
      try {
        await api(url, { method: "PUT", body: { zadanie: z.id, zapamietaj: $("#aiZakresPoprawki", m).value, zasada: $("#aiZasadaPoprawki", m).value } });
        if (b.isConnected) zamknijModal();
        toast("Poprawka zapisana");
        await po?.();
      } catch (e) { status.textContent = e.message; b.disabled = false; }
    };
  } catch (e) { blad(e); }
  finally { if (przycisk) przycisk.disabled = !!S.zadanie; }
}

document.getElementById("claudeBrief").onclick = pokazBriefAI;

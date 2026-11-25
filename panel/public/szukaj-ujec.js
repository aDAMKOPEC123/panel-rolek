"use strict";

const wyszukiwaniaUjec = new WeakMap();
const czasWyszukany = (wartosc) => Number(wartosc).toLocaleString("pl-PL", { maximumFractionDigits: 2 });

function kartaSzukaniaUjec() {
  const preset = wybranyStylMontazu();
  return `<section class="karta szukaj-ujec" id="szukajUjec">
    <h3>Znajdź fragment w nagraniach</h3>
    <form class="szukaj-ujec-form" role="search">
      <label class="pole"><span>Co ma być w kadrze?</span>
        <input type="search" name="tekst" placeholder="np. dłoń nakłada preparat na brwi" minlength="2" maxlength="250" required>
      </label>
      <button type="submit" class="btn" data-zadanie>Szukaj</button>
    </form>
    ${preset ? `<button type="button" class="btn maly jasny szukaj-ujec-sugestia" data-zadanie data-sugestia title="${esc(preset.kadr)}">Podpowiedz przebitkę · ${esc(preset.nazwa)}</button>` : ""}
    <p class="podpowiedz szukaj-ujec-status" role="status">Pierwsze wyszukiwanie może pobrać ok. 410 MB modelu. Analiza klipów odbywa się na tym komputerze.</p>
    <div class="szukaj-ujec-wyniki"></div>
  </section>`;
}

function podepnijSzukanieUjec(el) {
  const box = $("#szukajUjec", el);
  if (!box) return;
  const P = S.projekt;
  const url = `/api/projekt/${encodeURIComponent(P.nazwa)}`;
  const stan = wyszukiwaniaUjec.get(P) || {};
  wyszukiwaniaUjec.set(P, stan);
  const form = $("form", box);
  const status = $(".szukaj-ujec-status", box);
  const wyniki = $(".szukaj-ujec-wyniki", box);
  const pole = form.elements.tekst;
  const szukaj = $("button", form);
  pole.value = stan.tekst || "";
  const sugestia = $("[data-sugestia]", box);
  if (sugestia) sugestia.onclick = () => {
    pole.value = wybranyStylMontazu().kadr;
    form.requestSubmit();
  };

  function rysuj() {
    if (!stan.raport) return;
    const { wyniki: trafienia, klipy, pominiete } = stan.raport;
    status.textContent = `Przeszukane klipy: ${klipy}${pominiete ? ` · pominięte: ${pominiete}` : ""}.`;
    wyniki.innerHTML = trafienia.map((f, i) => {
      const plik = `${P.sciezka}/${f.src}`;
      return `<article class="szukaj-ujec-wynik">
        <div class="szukaj-ujec-podglad"><img alt="" src="${esc(thumb(plik, f.klatka, 240))}" loading="lazy"></div>
        <div class="szukaj-ujec-opis">
          <b title="${esc(f.src)}">${esc(f.src.split("/").pop())}</b>
          <small>${czasWyszukany(f.od)}–${czasWyszukany(f.do)} s</small>
          <div class="rzad">
            <button type="button" class="btn maly jasny" data-odtworz="${i}">Odtwórz</button>
            <button type="button" class="btn maly" data-przebitka="${i}" data-zadanie>Dodaj jako przebitkę</button>
          </div>
        </div>
      </article>`;
    }).join("");
    for (const b of wyniki.querySelectorAll("[data-odtworz]")) b.onclick = () => {
      const f = trafienia[Number(b.dataset.odtworz)];
      const host = $(".szukaj-ujec-podglad", b.closest("article"));
      const poprzedni = $("video:not([hidden])", wyniki);
      if (poprzedni) {
        poprzedni.hidden = true;
        poprzedni.pause();
        $("img", poprzedni.parentElement).hidden = false;
      }
      let video = $("video", host);
      if (!video) {
        video = document.createElement("video");
        video.src = `${media(`${P.sciezka}/${f.src}`)}#t=${f.od},${f.do}`;
        video.controls = true;
        video.muted = true;
        video.playsInline = true;
        video.addEventListener("loadedmetadata", () => { video.currentTime = f.od; }, { once: true });
        video.addEventListener("timeupdate", () => { if (video.currentTime >= f.do) video.pause(); });
        host.append(video);
      } else if (video.readyState > 0) {
        video.currentTime = f.od;
      }
      $("img", host).hidden = true;
      video.hidden = false;
      video.play().catch(() => {});
    };
    for (const b of wyniki.querySelectorAll("[data-przebitka]")) {
      b.onclick = () => oknoPrzebitki(P, trafienia[Number(b.dataset.przebitka)]);
    }
    odswiezPrzyciski();
  }

  form.onsubmit = async (e) => {
    e.preventDefault();
    if (S.zadanie || szukaj.disabled) return;
    szukaj.disabled = true;
    stan.tekst = pole.value.trim();
    stan.raport = null;
    wyniki.replaceChildren();
    status.textContent = "Przygotowuję indeks i szukam w klipach…";
    try {
      const zadanie = await api(`${url}/szukaj-ujec`, { method: "POST", body: { tekst: stan.tekst } });
      const { kod, wynik, tekst } = await sledz(zadanie, "Wyszukiwanie fragmentów");
      if (kod !== 0) throw new Error(tekst.split("\n").find((line) => line.startsWith("✗ BŁĄD:"))?.slice("✗ BŁĄD: ".length) || "Wyszukiwanie przerwane.");
      stan.raport = JSON.parse(wynik);
      rysuj();
    } catch (error) {
      status.textContent = error.message;
    } finally {
      szukaj.disabled = !!S.zadanie;
    }
  };
  rysuj();
}

function oknoPrzebitki(projekt, fragment) {
  const r = rolka();
  const czasUjec = czasyUjec();
  const cele = czasUjec.map((c, i) => ({ ...c, i })).filter((c) => c.czas >= 0.2);
  if (!cele.length) return toast("Najpierw dodaj przynajmniej jedno ujęcie do montażu.", 4500);
  const dialog = modal(`<h2>Dodaj jako przebitkę</h2>
    <p>${esc(fragment.src.split("/").pop())} · ${czasWyszukany(fragment.od)}–${czasWyszukany(fragment.do)} s</p>
    <form>
      <label class="pole"><span>Ujęcie pod przebitką</span><select name="cel">${cele.map((c) => `<option value="${c.i}">${c.i + 1}. ${esc(r.ujecia[c.i].src?.split("/").pop() || "Plansza")} · ${czasWyszukany(c.start)}–${czasWyszukany(c.koniec)} s</option>`).join("")}</select></label>
      <div class="rzad">
        <label class="pole"><span>Start względem ujęcia (s)</span><input name="start" type="number" min="0" step="0.01" required></label>
        <label class="pole"><span>Długość (s)</span><input name="czas" type="number" min="0.2" step="0.01" required></label>
      </div>
      <p class="podpowiedz">Dźwięk ujęcia będzie dalej słyszalny.</p>
      <p class="podpowiedz" role="status"></p>
      <div class="rzad"><button class="btn" type="submit">Dodaj przebitkę</button><button class="btn jasny" type="button" data-zamknij>Anuluj</button></div>
    </form>`);
  const form = $("form", dialog);
  const { cel, start, czas } = form.elements;
  const zaokraglij = (x) => Math.floor((x + 0.000001) * 100) / 100;
  const maksCzas = () => zaokraglij(Math.min(fragment.do - fragment.od, czasUjec[Number(cel.value)].czas - start.valueAsNumber));
  const ustawZakres = () => {
    const dlugosc = czasUjec[Number(cel.value)].czas;
    start.max = zaokraglij(dlugosc - 0.2);
    start.value = zaokraglij(Math.min(0.5, Math.max(0, dlugosc - (fragment.do - fragment.od))));
    czas.max = maksCzas();
    czas.value = czas.max;
  };
  cel.onchange = ustawZakres;
  start.oninput = () => { czas.max = maksCzas(); if (czas.valueAsNumber > Number(czas.max)) czas.value = czas.max; };
  $("[data-zamknij]", dialog).onclick = zamknijModal;
  ustawZakres();

  form.onsubmit = async (e) => {
    e.preventDefault();
    if (S.projekt !== projekt) return zamknijModal();
    const u = r.ujecia[Number(cel.value)];
    const przebitka = { src: fragment.src, od: fragment.od, start: start.valueAsNumber, czas: czas.valueAsNumber };
    const status = $("[role=status]", form);
    const lista = u.przebitki || [];
    if (lista.some((pb) => {
      if (!pb?.src) return false;
      const poczatek = Number(pb.start) || 0;
      return przebitka.start < poczatek + (Number(pb.czas) || 1.5) - 0.001 &&
        poczatek < przebitka.start + przebitka.czas - 0.001;
    })) {
      status.textContent = "W tym zakresie jest już przebitka. Zmień start lub wybierz inne ujęcie.";
      return;
    }
    const b = $("button[type=submit]", form);
    b.disabled = true;
    try {
      const ujecia = r.ujecia.map((x) => x === u ? { ...x, przebitki: [...lista, przebitka] } : x);
      const zapis = await api(`/api/projekt/${encodeURIComponent(projekt.nazwa)}/rolka`, { method: "PUT", body: { ...r, ujecia } });
      u.przebitki = [...lista, przebitka];
      projekt.rolkaZmiana = zapis.zmiana;
      if (S.projekt === projekt) {
        zamknijModal();
        if ($("#ujecia")) {
          listaUjec();
          podgladUjecia(Number(cel.value));
        } else {
          pokaz();
        }
        toast("Dodano przebitkę");
      }
    } catch (error) {
      status.textContent = error.message;
    } finally {
      b.disabled = false;
    }
  };
}

function pokazPrzebitkiUjecia(box, u, i) {
  if (!u.przebitki?.length) return;
  const lista = document.createElement("div");
  lista.className = "karta szukaj-ujec-przebitki";
  lista.innerHTML = `<h4>Przebitki</h4><ul class="pm-lista">${u.przebitki.map((pb, j) => pb?.src ?
    `<li><span>${esc(pb.src.split("/").pop())} · od ${czasWyszukany(pb.start || 0)} s ujęcia</span> <button type="button" class="btn maly jasny" data-usun-przebitke="${j}">Usuń</button></li>` : "").join("")}</ul>`;
  box.append(lista);
  for (const b of lista.querySelectorAll("button")) b.onclick = () => {
    u.przebitki.splice(Number(b.dataset.usunPrzebitke), 1);
    zapiszRolke();
    podgladUjecia(i);
  };
}

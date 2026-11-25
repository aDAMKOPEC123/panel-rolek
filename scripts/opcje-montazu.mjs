import { STYLE_MONTAZU, zastosujStylMontazu } from "./style-montazu.mjs";
import { naturalnyMontaz } from "./montaz-naturalny.mjs";

export const EFEKTY = [
  // [klucz, domyślnie, ikona, nazwa, opis]
  ["wytnij_cisze", true, "✂️", "Wytnij ciszę i „yyy”", "Przy „Przygotuj nagrania” usuwa pauzy i zająknięcia. Szybsze tempo bez ręcznego cięcia."],
  ["czysty_glos", true, "🎙️", "Czysty głos", "Przy „Przygotuj nagrania”: usuwa dudnienie i szum gabinetu, łagodzi syknięcia, wyrównuje głośność mowy. Zmiana działa po ponownym przygotowaniu nagrań."],
  ["korekta_obrazu", true, "🌤️", "Kontrola i korekta obrazu", "Mierzy jasność, przepalenia i odcień każdego nagrania, ostrzega w panelu i łagodnie rozjaśnia zbyt ciemne ujęcia. Nigdy nie wygładza skóry ani nie podbija kolorów."],
  ["zajawka", false, "👀", "Zajawka efektu na start", "Pierwsze 0,8 s to efekt końcowy (zdjęcie „po” albo ostatnie ujęcie) pod hookiem, potem cięcie na początek. Widz zostaje, żeby zobaczyć, jak do tego doszło."],
  ["bodziec", false, "⚡", "Nowy bodziec co 3 s", "Gdy przez ponad 3 s nic się nie zmienia, kadr przeskakuje bliżej i z powrotem, jak druga kamera. Wypełnia tylko martwe miejsca."],
  ["operator", false, "🎥", "Wirtualny operator kamery", "Kadr prowadzony jak przez operatora: przy mowie trzyma Twoją twarz, przy zabiegu idzie za ruchem dłoni, a na słowach powiedzianych z naciskiem płynnie najeżdża i dobija. Zastępuje „Zbliżenia na akcentach” w tych ujęciach."],
  ["punch_in", false, "🔍", "Zbliżenia na akcentach", "Kadr lekko „wjeżdża” na słowach kluczowych i liczbach, a co drugie ujęcie z mową jest bliżej. Wygląda jak montaż z dwóch kamer."],
  ["emoji", false, "✨", "Emoji nad słowami", "Nad słowami typu brwi, rzęsy, skóra, cena, tygodnie wyskakuje pasujące emoji. Najwyżej jedno na napis."],
  ["dzwieki", false, "🔊", "Udźwiękowienie", "Uderzenie na starcie, „whoosh” przy przejściach i po zajawce, „pop” przy planszach, narastanie przed przed/po, cichy klik przy bodźcach. Dźwięki są nasze, bez problemu z licencją."],
  ["ambient", false, "🏠", "Ambient gabinetu", "Bardzo cichy szum pomieszczenia pod całą rolką. Cięcia nie „urywają” ciszy, rolka brzmi jak nagrana w jednym miejscu, drożej. Dźwięki zabiegu (pęseta, spray…) dodasz przy ujęciu w Narzędziach ujęcia."],
  ["wycisz_muzyke", false, "🎚️", "Muzyka cichnie pod głosem", "Gdy mówisz, muzyka schodzi w dół, a w pauzach wraca. Działa, gdy w rolce jest muzyka i napisy."],
  ["rozmycie_ruchu", false, "💨", "Rozmycie ruchu (jak z kamery)", "Napisy, ozdoby i plansze w szybkim ruchu dostają smugę jak z prawdziwej migawki, zamiast być idealnie ostre. Render trwa trochę dłużej."],
  ["pasek_postepu", false, "▬", "Pasek postępu", "Cienki pasek u góry pokazuje, ile zostało. Ludzie częściej oglądają do końca."],
  ["zapetlenie", false, "🔁", "Zapętlone zakończenie", "Ostatnie 0,4 s przechodzi w pierwsze ujęcie, więc rolka kręci się bez szwu."],
];

export const CHARAKTERY_MONTAZU = [
  { id: "reklamowy", nazwa: "Reklamowy / ustawienia własne", opis: "Pełna kontrola nad scenami, efektami, napisami i ruchem." },
  { id: "naturalny", nazwa: "Naturalny", opis: "Proste białe napisy i cięcia, lekkie wejścia. Styl wygasza część efektów i plansz." },
  ...STYLE_MONTAZU,
];

// Wymagania odnoszą się do danego projektu. Skróty panelu otwierają jego istniejące narzędzia.
export const NARZEDZIA_MONTAZU = [
  ["rezyseria", "Reżyseria scen", "Rozpiska sekundowa, komentarze, zdjęcia, interfejsy, ruch i dźwięk. Zachowaj zatwierdzone zdarzenia.", "scenariusz", 2, "#rezyseriaProjektu"],
  ["dopasowanie", "Dopasowanie kwestii", "Wybór podejść z mową po treści i transkrypcji. Zachowaj podejścia wskazane ręcznie.", "scenariusz+raw", 2, "#kwDopasuj"],
  ["przygotowanie", "Przygotowanie nagrań", "Pionowe proxy, korekta techniczna i opcjonalne skrócenie ciszy.", "raw", 2, "#przygotuj"],
  ["rozpoznanie", "Rozpoznawanie nagrań", "Analiza czynności i jakości, przypisanie plików do materiałów.", "raw", 2, "#rozpoznaj"],
  ["szukanie", "Szukaj przebitki po opisie", "Lokalne wyszukiwanie po obrazie. Zwróć konkretne zapytanie, który detal ma być w kadrze.", "proxy", 2, "#szukajUjec"],
  ["przejscia", "Przejścia z analizy ruchu", "Cięcia, przenikanie, zoom, błysk, światło, swipe, whip, fala, ostrość, przejście za postacią. Szanuj ręczne wybory.", "ujecia", 2, "#przejsciaAI"],
  ["akcja", "Cięcia na akcji i tempo", "Dopasowanie cięć po ruchu i przyspieszenie powtórzeń w ujęciach bez mowy i dźwięku.", "ujecia", 2, "#akcjaAI"],
  ["kolor", "Wyrównaj kolor ujęć", "Balans bieli i jasności między klipami.", "ujecia", 2, "#kolorUjec"],
  ["narzedzia-ujecia", "Narzędzia ujęcia", "Kliknij miniaturę: kadr i zoom, stabilizacja, odszumianie i ulepszanie, tło, mapa twarzy, śledzenie i maska obiektu, poświata, foley, slow motion.", "ujecia", 2, "#ujecia"],
  ["vlog", "Montaż vlogowy", "Rozdziały dnia według pory nagrań, krótkie ujęcia i ich naturalny dźwięk.", "vlog", 2, "#vlUloz"],
  ["styl", "Styl marki, presety i format", "Format rolki, ruch, wygląd napisów, hooka, znaku wodnego oraz 14 opcji efektów Tak/Nie.", "", 3, "#tresc"],
  ["napisy", "Napisy i wyróżnienia", "Transkrypcja, korekta nazw i wyróżnienia słów.", "raw", 4, "#tresc"],
  ["sceny", "Sceny i gotowe szablony", "Nakładki, animowany tekst, przed/po, 3D, Lottie, CTA oraz własne bloki na osi czasu.", "", 5, "#edytor"],
  ["animacja", "Animacja z opisu", "Własna animowana nakładka, np. komentarze ilustracyjne albo porównanie zdjęć. Wymaga opisu i momentu sceny.", "", 5, "#anOpis"],
  ["wzor", "Montaż według wzoru", "Rytm i układ scen na podstawie wgranej rolki referencyjnej.", "wzor", 5, "#wzorPlik"],
  ["dzwiek", "Muzyka, lektor i rytm", "Ścieżki audio, licencjonowana muzyka, cięcie do bitów i miks.", "", 1, "#muzyka"],
  ["kontrola", "Podgląd, retencja i kontrola obrazu", "Sprawdzenie hooka, stref interfejsu, kontrastu, pustych klatek i markerów.", "ujecia", 6, "#tresc"],
  ["warianty", "Warianty hooka", "Porównanie pierwszych sekund i wersje testowe filmu.", "", 6, "#tresc"],
  ["opis", "Opis, hashtagi i okładka", "Przygotowanie opisu, hasztagów, CTA i okładki, bez publikacji.", "", 7, "#tresc"],
];

export function ograniczeniaEfektow(rolka, id) {
  const preset = STYLE_MONTAZU.find((p) => p.id === id);
  if (!preset && id !== "naturalny") return {};
  const klucze = EFEKTY.map(([k]) => k);
  const przelicz = (stan) => {
    const r = { ...rolka, efekty: Object.fromEntries(klucze.map((k) => [k, stan])) };
    return (preset ? zastosujStylMontazu(r, preset) : naturalnyMontaz(r).rolka).efekty;
  };
  const wlaczone = przelicz(true), wylaczone = przelicz(false);
  return Object.fromEntries(klucze.filter((k) => wlaczone[k] === wylaczone[k]).map((k) => [k, wlaczone[k]]));
}

export function dostepneNarzedzia(P) {
  const pliki = P?.pliki || {};
  const stan = {
    scenariusz: !!P?.scenariusz?.scenariusz?.length,
    raw: pliki.raw?.some((f) => f.typ === "wideo" || f.typ === "audio"),
    proxy: pliki.proxy?.some((f) => f.typ === "wideo"),
    ujecia: !!P?.rolka?.ujecia?.some((u) => u.src),
    wzor: pliki.wzor?.some((f) => f.typ === "wideo"),
    vlog: !!P?.rolka?.vlog || P?.rolka?.format === 11 || pliki.raw?.filter((f) => f.typ === "wideo").length >= 6,
  };
  const braki = { scenariusz: "scenariusza", raw: "nagrań", proxy: "przygotowanych klipów", ujecia: "ułożonych ujęć", wzor: "wgranej rolki wzorcowej", vlog: "formatu vlogowego lub co najmniej 6 nagrań" };
  return NARZEDZIA_MONTAZU.map(([id, nazwa, opis, wymaga]) => ({
    id, nazwa, opis,
    brak: wymaga.split("+").filter((k) => k && !stan[k]).map((k) => braki[k]).join(" i "),
  }));
}

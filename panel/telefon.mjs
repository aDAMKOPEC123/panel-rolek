// Telefon przez kod QR: osobny, mały serwer w sieci domowej (Wi-Fi), tylko do wgrywania nagrań z telefonu.
// Panel (port 4321) dalej słucha tylko na localhost. Ten serwer:
//   - włącza się dopiero, gdy w panelu otworzysz „📱 Telefon”, i sam gaśnie po 60 min bez ruchu,
//   - wpuszcza tylko adresy z losowym kluczem (/t/<klucz>/...), nowy klucz przy każdym włączeniu,
//   - umie tylko: lista rolek w trakcie, materiały ze scenariusza (z teleprompterem), wgranie pliku do raw/ albo 00_INBOX.
// Bez podglądu plików z dysku, bez Claude, bez skryptów.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import { ROOT } from "../scripts/lib.mjs";

const PORT = Number(process.env.TELEFON_PORT || 4322);
const BEZ_RUCHU_MIN = 60;
const STRONA = path.join(ROOT, "panel", "telefon", "telefon.html");

const T = { serwer: null, klucz: null, adresy: [], start: null, ostatni: 0, wgrane: [], timer: null, blad: null };

/** Adresy IPv4 w sieci lokalnej, najpierw typowe domowe Wi-Fi (192.168.x), bez kart wirtualnych. */
export function adresyLan() {
  const out = [];
  for (const [nazwa, lista] of Object.entries(os.networkInterfaces())) {
    if (/vEthernet|VirtualBox|VMware|WSL|Hyper-V|Loopback|docker|tailscale|zerotier|bluetooth/i.test(nazwa)) continue;
    for (const a of lista || []) {
      if (a.family !== "IPv4" || a.internal || /^169\.254\./.test(a.address)) continue;
      const w = /^192\.168\./.test(a.address) ? 3 : /^10\./.test(a.address) ? 2 : /^172\.(1[6-9]|2\d|3[01])\./.test(a.address) ? 1 : 0;
      if (w) out.push({ ip: a.address, karta: nazwa, w: w + (/wi-?fi|wlan|bezprzew/i.test(nazwa) ? 1 : 0) });
    }
  }
  return out.sort((a, b) => b.w - a.w);
}

export function stanTelefonu() {
  return {
    wlaczony: !!T.serwer, port: PORT, blad: T.blad,
    adresy: T.adresy.map((a) => ({ ...a, url: `http://${a.ip}:${PORT}/t/${T.klucz}/` })),
    wylaczy_sie: T.serwer ? new Date(T.ostatni + BEZ_RUCHU_MIN * 60e3).toISOString() : null,
    wgrane: T.wgrane.slice(-20).reverse(),
  };
}

export function wylaczTelefon() {
  clearInterval(T.timer); T.timer = null;
  if (T.serwer) { T.serwer.close(); T.serwer.closeAllConnections?.(); }
  T.serwer = null; T.klucz = null;
  return stanTelefonu();
}

/**
 * Włącza serwer telefonu. api = funkcje panelu: rolki(), materialy(projekt), wgrajMaterial(p, mid, nazwa, req), wgrajRaw(p, nazwa, req), wgrajInbox(nazwa, req), marka().
 */
export function wlaczTelefon(api) {
  if (T.serwer) { T.ostatni = Date.now(); return Promise.resolve(stanTelefonu()); }
  T.klucz = crypto.randomBytes(9).toString("base64url");
  T.adresy = adresyLan();
  T.blad = T.adresy.length ? null : "Komputer nie jest w sieci Wi-Fi ani kablowej (brak adresu 192.168.x / 10.x).";
  T.ostatni = Date.now();
  T.start = Date.now();
  const json = (res, d, s = 200) => { res.writeHead(s, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }); res.end(JSON.stringify(d)); };
  const serwer = http.createServer(async (req, res) => {
    const url = new URL(req.url, "http://x");
    const m = url.pathname.match(/^\/t\/([\w-]+)(\/.*)?$/);
    // klucz porównywany w stałym czasie; bez klucza nic nie istnieje
    const ok = m && T.klucz && m[1].length === T.klucz.length && crypto.timingSafeEqual(Buffer.from(m[1]), Buffer.from(T.klucz));
    if (!ok) { res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }); return res.end("Ten link już nie działa. Zeskanuj nowy kod QR w panelu na komputerze."); }
    T.ostatni = Date.now();
    const p = m[2] || "/";
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "no-referrer");
    try {
      if (req.method === "GET" && p === "/") {
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
        return res.end(fs.readFileSync(STRONA, "utf8"));
      }
      if (req.method === "GET" && p === "/api/rolki") return json(res, { marka: api.marka(), rolki: api.rolki() });
      let r = p.match(/^\/api\/rolka\/([^/]+)$/);
      if (req.method === "GET" && r) return json(res, api.materialy(decodeURIComponent(r[1])));
      const nazwa = url.searchParams.get("nazwa");
      const zapisz = async (fn, gdzie) => {
        const w = await fn();
        T.wgrane.push({ czas: new Date().toISOString(), gdzie, plik: w.plik, rozmiar: Number(req.headers["content-length"]) || null });
        T.wgrane = T.wgrane.slice(-50);
        return json(res, w);
      };
      r = p.match(/^\/api\/rolka\/([^/]+)\/material\/([\w-]+)$/);
      if (req.method === "POST" && r) return await zapisz(() => api.wgrajMaterial(decodeURIComponent(r[1]), r[2], nazwa, req), decodeURIComponent(r[1]));
      r = p.match(/^\/api\/rolka\/([^/]+)\/raw$/);
      if (req.method === "POST" && r) return await zapisz(() => api.wgrajRaw(decodeURIComponent(r[1]), nazwa, req), decodeURIComponent(r[1]));
      if (req.method === "POST" && p === "/api/inbox") return await zapisz(() => api.wgrajInbox(nazwa, req), "00_INBOX");
      return json(res, { blad: "Nie ma takiej ścieżki." }, 404);
    } catch (e) {
      return json(res, { blad: e.message }, e.status || 500);
    }
  });
  serwer.requestTimeout = 0; // duże nagrania 4K z telefonu idą długo
  serwer.headersTimeout = 60e3;
  return new Promise((ok) => {
    serwer.once("error", (e) => {
      T.serwer = null; T.klucz = null;
      T.blad = e.code === "EADDRINUSE" ? `Port ${PORT} jest zajęty przez inny program.` : e.message;
      ok(stanTelefonu());
    });
    serwer.listen(PORT, "0.0.0.0", () => {
      T.serwer = serwer;
      T.timer = setInterval(() => { if (Date.now() - T.ostatni > BEZ_RUCHU_MIN * 60e3) wylaczTelefon(); }, 60e3);
      T.timer.unref();
      ok(stanTelefonu());
    });
  });
}

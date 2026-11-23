// Wywołanie `claude -p` z odpowiedzią wymuszoną schematem JSON (recenzentka, turniej hooków).
// Bez narzędzi, bez zapisu sesji, w katalogu tymczasowym (nie wczytuje CLAUDE.md projektu ani rozmowy),
// prompt przez stdin. Zwraca { dane, koszt, czas_s }.
import os from "node:os";
import { spawn, spawnSync } from "node:child_process";

let bin = null;
// Krótki prompt systemowy zamiast domyślnego Claude Code: bez listy narzędzi, skilli, wtyczek i MCP z instalacji
// (domyślny ma kilkadziesiąt tysięcy tokenów i to on, a nie ocena, robił większość kosztu).
const SYSTEM = "Jesteś ekspertką od krótkich rolek Instagram/TikTok dla gabinetu beauty. Odpowiadasz wyłącznie w wymaganym formacie JSON, po polsku.";
export function claudeBin() {
  if (bin !== null) return bin;
  const r = spawnSync(process.platform === "win32" ? "where" : "which", ["claude"], { encoding: "utf8" });
  const k = (r.stdout || "").split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  bin = k.find((x) => /\.exe$/i.test(x)) || k.find((x) => /\.cmd$/i.test(x)) || k[0] || "";
  return bin;
}

// Ustawienia kosztu: config.json -> claude_ocena { model, effort, budzet_usd } albo zmienne CLAUDE_OCENA_MODEL / _EFFORT.
// obrazy: katalog z obrazkami do obejrzenia; wtedy Claude dostaje tylko narzędzie Read i pracuje w tym katalogu
// (rozpoznawanie ujęć). Bez niego: zero narzędzi, katalog tymczasowy systemu.
export function claudeJson(prompt, schemat, { timeout = 6 * 60 * 1000, model, effort, budzet, obrazy } = {}) {
  const b = claudeBin();
  if (!b) return Promise.reject(new Error("Komenda claude nie jest zainstalowana. Zainstaluj i zaloguj Claude Code w terminalu."));
  const t0 = Date.now();
  return new Promise((res, rej) => {
    const opcje = [...(model ? ["--model", model] : []), ...(effort ? ["--effort", effort] : []), ...(budzet ? ["--max-budget-usd", String(budzet)] : [])];
    const narz = obrazy ? ["--tools", "Read", "--allowedTools", "Read"] : ["--tools", ""];
    const p = spawn(b, ["-p", "--output-format", "json", ...narz, "--no-session-persistence", "--strict-mcp-config", "--disable-slash-commands", "--system-prompt", SYSTEM, ...opcje, "--json-schema", JSON.stringify(schemat)], { cwd: obrazy || os.tmpdir(), shell: /\.cmd$/i.test(b), windowsHide: true });
    let out = "", err = "";
    const czas = setTimeout(() => { p.kill(); rej(new Error("Claude nie odpowiedział w czasie.")); }, timeout);
    p.stdout.on("data", (d) => (out += d));
    p.stderr.on("data", (d) => (err += d));
    p.on("error", (e) => { clearTimeout(czas); rej(e); });
    p.on("close", () => {
      clearTimeout(czas);
      let j;
      try { j = JSON.parse(out); } catch { return rej(new Error(`Claude nie zwrócił JSON: ${(err || out).slice(-400)}`)); }
      if (j.is_error || !j.structured_output) {
        const msg = String(j.result || err || "").slice(0, 400);
        return rej(new Error(/login|auth/i.test(msg) ? `${msg}\nZaloguj Claude Code w terminalu (claude).` : msg || "Brak odpowiedzi."));
      }
      res({ dane: j.structured_output, koszt: j.total_cost_usd || 0, czas_s: Math.round((Date.now() - t0) / 1000), tury: j.num_turns, model: Object.keys(j.modelUsage || {}).join(","), wyjscie: j.usage?.output_tokens });
    });
    p.stdin.end(prompt);
  });
}

// Wspólne dla generatora i sędziów: zakazy treści (brand + bezpieczeństwo).
export const ZASADY_TRESCI = "Po polsku, mówione, styl influencerski, nie reklama. ZERO obietnic medycznych i gwarancji efektu (żadnych „zmarszczki znikną”, „po 3 sesjach”, „trwały efekt”, „wyleczy”), przed/po zawsze „efekt indywidualny”. Podologia estetycznie, bez szokujących zbliżeń na start i bez diagnoz. Bez długich myślników.";
export const OBIETNICE = /gwarant|na zawsze|trwał[aey]? efekt|wylecz|znikn[ąi]|usuwa zmarszcz|100%|po \d+ (sesj|zabieg)/i;

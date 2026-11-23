# Zdjęcie 2,5D: mapa głębi (Depth Anything V2 Small, ONNX, lokalnie na CPU) do ruchu kamery w zdjęciu.
# Wywołuje scripts/zloz.mjs (scena zdjecie-3d). Użycie:
#   python glebia.py <zdjęcie albo wideo> <katalog wyjścia> [--t 1.5]
# Wynik w katalogu (kadr 1080x1920 jak object-fit: cover):
#   kadr.jpg          zdjęcie przycięte do 9:16 (to, co widać)
#   glebia.png        mapa głębi, bliżej = jaśniej (podgląd)
#   mapa_najazd.png   mapa przesunięcia dla feDisplacementMap przy najeździe: R/G = 0,5 + kierunek od środka * bliskość
#   mapa_przesuw.png  mapa przy przesuwie w bok: R = bliskość, G = 0,5 (bez ruchu w pionie)
#                     (obie 270x480, w szablonie rozciągane; głębia jest gładka, więc to wystarcza)
#   przod.png         postać / obiekt z przodu (RGBA, miękka krawędź): tekst za postacią i ostrość
#   glebia.json       próg przodu, udział przodu w kadrze
# Ruch jest ciągły (każdy piksel przesuwa się proporcjonalnie do bliskości), więc twarz się nie „kroi” na plasterki.
# Model: narzedzia/glebia/depth_anything_v2_small.onnx (Apache-2.0, onnx-community, pobrany 2026-11-20).
import json
import os
import sys

import cv2
import numpy as np

W, H = 1080, 1920
MODEL = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "narzedzia", "glebia", "depth_anything_v2_small.onnx")
ZDJECIE = (".jpg", ".jpeg", ".png", ".webp")


def arg(n, d):
    if n in sys.argv:
        i = sys.argv.index(n)
        v = sys.argv[i + 1]
        del sys.argv[i:i + 2]
        return float(v)
    return d


def wczytaj(p, t):
    if p.lower().endswith(ZDJECIE):
        img = cv2.imdecode(np.fromfile(p, dtype=np.uint8), cv2.IMREAD_COLOR)
    else:
        cap = cv2.VideoCapture(p)
        cap.set(cv2.CAP_PROP_POS_MSEC, t * 1000)
        ok, img = cap.read()
        cap.release()
        img = img if ok else None
    if img is None:
        raise SystemExit(f"Nie da się odczytać {p}")
    h, w = img.shape[:2]
    s = max(W / w, H / h)
    img = cv2.resize(img, (round(w * s), round(h * s)), interpolation=cv2.INTER_AREA if s < 1 else cv2.INTER_CUBIC)
    y0, x0 = (img.shape[0] - H) // 2, (img.shape[1] - W) // 2
    return img[y0:y0 + H, x0:x0 + W]


def glebia(img):
    import onnxruntime as ort
    sesja = ort.InferenceSession(MODEL, providers=["CPUExecutionProvider"])
    ww, hh = 518, 924  # 9:16, wielokrotności 14
    x = cv2.cvtColor(cv2.resize(img, (ww, hh), interpolation=cv2.INTER_AREA), cv2.COLOR_BGR2RGB).astype(np.float32) / 255
    x = (x - np.array([0.485, 0.456, 0.406], np.float32)) / np.array([0.229, 0.224, 0.225], np.float32)
    d = sesja.run(None, {"pixel_values": x.transpose(2, 0, 1)[None]})[0][0]
    d = cv2.resize(d, (W, H), interpolation=cv2.INTER_CUBIC)
    lo, hi = np.percentile(d, 1), np.percentile(d, 99)
    d = np.clip((d - lo) / max(1e-6, hi - lo), 0, 1).astype(np.float32)  # 1 = blisko
    try:
        d = cv2.ximgproc.guidedFilter(img, d, 8, 1e-3)  # krawędzie głębi do krawędzi obrazu
    except Exception:  # noqa: BLE001  (bez opencv-contrib)
        d = cv2.bilateralFilter(d, 9, 0.1, 6)
    return np.clip(d, 0, 1)


def main():
    t = arg("--t", 0.0)
    if len(sys.argv) < 3:
        raise SystemExit("Użycie: glebia.py <zdjęcie|wideo> <katalog> [--t 1.5]")
    wej, kat = sys.argv[1], sys.argv[2]
    os.makedirs(kat, exist_ok=True)
    img = wczytaj(wej, t)
    d = glebia(img)
    cv2.imwrite(os.path.join(kat, "kadr.jpg"), img, [cv2.IMWRITE_JPEG_QUALITY, 93])
    cv2.imwrite(os.path.join(kat, "glebia.png"), (d * 255).astype(np.uint8))
    # mapy przesunięcia (małe; gładkie, bo przesunięcie ma być płynne)
    m = cv2.GaussianBlur(cv2.resize(d, (270, 480), interpolation=cv2.INTER_AREA), (0, 0), 1.5)
    yy, xx = np.mgrid[0:480, 0:270].astype(np.float32)
    dx, dy = (xx - 135) / 135, (yy - 240) / 240           # -1..1 od środka
    blisko = m - float(np.median(m))                         # tło stoi, bliżej rusza się bardziej
    r = np.clip(0.5 + 0.5 * dx * np.clip(blisko + 0.25, 0, 1), 0, 1)
    g = np.clip(0.5 + 0.5 * dy * np.clip(blisko + 0.25, 0, 1), 0, 1)
    najazd = np.dstack([np.full_like(r, 0.5), g, r])          # BGR: B nieużywane, G = y, R = x
    cv2.imwrite(os.path.join(kat, "mapa_najazd.png"), (najazd * 255).round().astype(np.uint8))
    przesuw = np.dstack([np.full_like(m, 0.5), np.full_like(m, 0.5), np.clip(0.5 + (m - float(np.median(m))) * 0.9, 0, 1)])
    cv2.imwrite(os.path.join(kat, "mapa_przesuw.png"), (przesuw * 255).round().astype(np.uint8))
    # przód: próg Otsu na głębi (postać kontra tło), największy spójny obszar + to, co blisko niego
    d8 = (d * 255).astype(np.uint8)
    prog, maska = cv2.threshold(d8, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    maska = cv2.morphologyEx(maska, cv2.MORPH_OPEN, np.ones((7, 7), np.uint8))
    n, et, st, _ = cv2.connectedComponentsWithStats(maska)
    if n > 1:
        duze = [i for i in range(1, n) if st[i, cv2.CC_STAT_AREA] >= 0.15 * st[1:, cv2.CC_STAT_AREA].max()]
        maska = np.isin(et, duze).astype(np.uint8) * 255
    alfa = cv2.GaussianBlur(cv2.dilate(maska, np.ones((3, 3), np.uint8)), (0, 0), 2.0)
    cv2.imwrite(os.path.join(kat, "przod.png"), np.dstack([img, alfa]))
    info = {"prog_przodu": round(prog / 255, 3), "udzial_przodu": round(float((maska > 127).mean()), 3)}
    with open(os.path.join(kat, "glebia.json"), "w", encoding="utf-8") as f:
        json.dump(info, f)
    print(json.dumps(info))


if __name__ == "__main__":
    main()

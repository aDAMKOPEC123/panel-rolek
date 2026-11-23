# Klatki do rozpoznania ujęć (scripts/rozpoznaj.mjs): z każdego pliku pasek 3 klatek (15%, 50%, 85% długości)
# z podpisem sekundy oraz lokalne miary jakości. Zdjęcie = jedna klatka.
# Użycie: python rozpoznaj_klatki.py <katalog wyjścia> <plik1> <plik2> ...
# Wynik: <katalog>/<n>.jpg (pasek 3x 270x480) i JSON na stdout: [{plik, obraz, dlugosc, klatki: [t...],
#   ostrosc (wariancja laplasjanu, 0-100 po skali), jasnosc (0-255), przepalenia (%), ruch (śr. różnica klatek), pion}]
import json
import os
import sys

import cv2
import numpy as np

ZDJ = (".jpg", ".jpeg", ".png", ".webp", ".heic")
KW, KH = 270, 480


def kadr(img):
    h, w = img.shape[:2]
    s = max(KW / w, KH / h)
    img = cv2.resize(img, (max(KW, round(w * s)), max(KH, round(h * s))), interpolation=cv2.INTER_AREA)
    y0, x0 = (img.shape[0] - KH) // 2, (img.shape[1] - KW) // 2
    return img[y0:y0 + KH, x0:x0 + KW]


def miary(fr):
    g = cv2.cvtColor(fr, cv2.COLOR_BGR2GRAY)
    g = cv2.resize(g, (360, int(360 * g.shape[0] / g.shape[1]))) if g.shape[1] > 360 else g
    lap = float(cv2.Laplacian(g, cv2.CV_64F).var())
    return {"ostrosc": round(min(100, lap / 4), 1), "jasnosc": round(float(g.mean()), 1), "przepalenia": round(float((g > 250).mean() * 100), 2)}


def main():
    kat, pliki = sys.argv[1], sys.argv[2:]
    os.makedirs(kat, exist_ok=True)
    wynik = []
    for n, p in enumerate(pliki):
        r = {"plik": p, "obraz": f"{n:02d}.jpg"}
        klatki, czasy = [], []
        if p.lower().endswith(ZDJ):
            img = cv2.imdecode(np.fromfile(p, dtype=np.uint8), cv2.IMREAD_COLOR)
            if img is None:
                r["blad"] = "nie da się odczytać"
                wynik.append(r)
                continue
            klatki, czasy, r["dlugosc"] = [img], [0], 0
            r["pion"] = img.shape[0] >= img.shape[1]
        else:
            cap = cv2.VideoCapture(p)
            fps = cap.get(cv2.CAP_PROP_FPS) or 30
            dl = (cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0) / fps
            r["dlugosc"] = round(dl, 1)
            for u in (0.15, 0.5, 0.85):
                cap.set(cv2.CAP_PROP_POS_MSEC, dl * u * 1000)
                ok, f = cap.read()
                if ok:
                    klatki.append(f)
                    czasy.append(round(dl * u, 1))
            cap.release()
            if not klatki:
                r["blad"] = "nie da się odczytać"
                wynik.append(r)
                continue
            r["pion"] = klatki[0].shape[0] >= klatki[0].shape[1]
        m = [miary(f) for f in klatki]
        r.update({"klatki": czasy, "ostrosc": round(min(x["ostrosc"] for x in m), 1), "jasnosc": round(float(np.mean([x["jasnosc"] for x in m])), 1),
                  "przepalenia": round(max(x["przepalenia"] for x in m), 2)})
        if len(klatki) > 1:
            a = [cv2.resize(cv2.cvtColor(f, cv2.COLOR_BGR2GRAY), (90, 160)).astype(np.float32) for f in klatki]
            r["ruch"] = round(float(np.mean([np.abs(a[i] - a[i - 1]).mean() for i in range(1, len(a))])), 1)
        pasek = []
        for f, t in zip(klatki, czasy):
            k = kadr(f)
            cv2.rectangle(k, (0, 0), (92, 30), (0, 0, 0), -1)
            cv2.putText(k, f"{t:.1f} s" if len(klatki) > 1 else "foto", (6, 22), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 1, cv2.LINE_AA)
            pasek.append(k)
        cv2.imwrite(os.path.join(kat, r["obraz"]), np.hstack(pasek), [cv2.IMWRITE_JPEG_QUALITY, 82])
        wynik.append(r)
    print(json.dumps(wynik, ensure_ascii=False))


if __name__ == "__main__":
    main()

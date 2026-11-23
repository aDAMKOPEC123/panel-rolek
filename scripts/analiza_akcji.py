# Analiza ruchu pod cięcia na akcji i automatyczne tempo (wywołuje scripts/akcja.mjs).
# Wejście: plik JSON [{id, plik, od, do}], wyjście (stdout): {id: {fps, t0, wektory: [[vx, vy, sila]...], rytm: [[t, wynik]...]}}
#   wektory: co 1/15 s średni przepływ (OpenCV Farneback, 135x240) ważony siłą ruchu, w px/s w skali 1080 (vx, vy),
#            oraz siła = średnia wielkość ruchu poruszających się pikseli (px/s), tylko piksele ruchome (> 40 px/s).
#            Ruch kamery jest odejmowany (mediana przepływu całej klatki), więc to ruch rąk i narzędzi.
#   rytm:    okna 2 s co 0,5 s: wynik 0-1, jak bardzo ruch się powtarza (autokorelacja sygnału ruchu w poziomie
#            i pionie, okres 0,2-1,2 s), np. czesanie brwi, piłowanie, wcieranie. Wynik >= 0,45 = powtarzalny.
import json
import sys

import cv2
import numpy as np

W, H, FPS = 135, 240, 15
SK = 1080 / W


def analiza(plik, od, do):
    cap = cv2.VideoCapture(plik)
    src = cap.get(cv2.CAP_PROP_FPS) or 30
    krok = max(1, round(src / FPS))
    cap.set(cv2.CAP_PROP_POS_MSEC, od * 1000)
    poprz, wek, i = None, [], 0
    while True:
        ok, f = cap.read()
        if not ok or cap.get(cv2.CAP_PROP_POS_MSEC) / 1000 > do + 0.05:
            break
        if i % krok:
            i += 1
            continue
        i += 1
        g = cv2.cvtColor(cv2.resize(f, (W, H), interpolation=cv2.INTER_AREA), cv2.COLOR_BGR2GRAY)
        if poprz is None:
            poprz = g
            wek.append([0.0, 0.0, 0.0])
            continue
        fl = cv2.calcOpticalFlowFarneback(poprz, g, None, 0.5, 3, 13, 3, 5, 1.1, 0)
        poprz = g
        fl = fl - np.median(fl.reshape(-1, 2), axis=0)          # bez ruchu kamery
        fl *= SK * FPS                                            # px/s w skali 1080
        mag = np.linalg.norm(fl, axis=2)
        ruch = mag > 40
        if ruch.mean() < 0.004:
            wek.append([0.0, 0.0, 0.0])
            continue
        w = mag[ruch]
        vx = float((fl[..., 0][ruch] * w).sum() / w.sum())
        vy = float((fl[..., 1][ruch] * w).sum() / w.sum())
        wek.append([round(vx, 1), round(vy, 1), round(float(w.mean()), 1)])
    cap.release()
    a = np.array(wek, dtype=np.float32) if wek else np.zeros((0, 3), np.float32)
    rytm = []
    okno, co = int(2 * FPS), int(0.5 * FPS)
    for s in range(0, max(0, len(a) - okno + 1), co):
        best = 0.0
        if a[s:s + okno, 2].mean() > 60:                          # w oknie musi się coś dziać
            for k in (0, 1):
                x = a[s:s + okno, k] - a[s:s + okno, k].mean()
                if np.abs(x).max() < 30:
                    continue
                ac = np.correlate(x, x, "full")[okno - 1:]
                ac = ac / (ac[0] + 1e-6)
                lo, hi = int(0.2 * FPS), int(1.2 * FPS)
                best = max(best, float(ac[lo:hi + 1].max()))
        rytm.append([round(od + (s + okno / 2) / FPS, 2), round(max(0.0, best), 2)])
    return {"fps": FPS, "t0": od, "wektory": a.tolist(), "rytm": rytm}


def main():
    zad = json.load(open(sys.argv[1], encoding="utf-8"))
    out = {}
    for z in zad:
        try:
            out[z["id"]] = analiza(z["plik"], float(z["od"]), float(z["do"]))
        except Exception as e:  # noqa: BLE001
            out[z["id"]] = {"blad": str(e)}
    print(json.dumps(out))


if __name__ == "__main__":
    main()

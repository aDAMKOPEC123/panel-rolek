# Analiza końcówki ujęcia A i początku ujęcia B pod wybór przejścia (wywołuje scripts/przejscia-ai.mjs).
# Wejście: plik JSON [{id, a: {plik, od, do}, b: {plik, od, do}}], wyjście: JSON z cechami na stdout.
#   Ruch: przepływ optyczny Farneback (OpenCV) rozbity na ruch kamery (przesunięcie), najazd (zoom) i ruch lokalny.
#   Postać i dłonie: YOLO pose (Ultralytics), jeśli jest model narzedzia/yolo/yolo11n-pose.pt; bez niego tylko ruch.
#   Zasłonięcie obiektywu: spadek jasności i ostrości w ostatnich klatkach. Podobieństwo scen: histogram HSV.
# Jednostki: piksele w skali 1080x1920 na sekundę.
import json
import os
import sys

import cv2
import numpy as np

W, H, FPS = 270, 480, 15
SK = 1080 / W  # z miniatury do 1080
MODEL = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "narzedzia", "yolo", "yolo11n-pose.pt")
_yolo = None


def yolo():
    global _yolo
    if _yolo is None:
        if not os.path.exists(MODEL):
            _yolo = False
        else:
            try:
                from ultralytics import YOLO
                _yolo = YOLO(MODEL)
            except Exception as e:  # noqa: BLE001
                print(f"YOLO niedostępne: {e}", file=sys.stderr)
                _yolo = False
    return _yolo


def klatki(plik, od, do):
    cap = cv2.VideoCapture(plik)
    if not cap.isOpened():
        return [], []
    src_fps = cap.get(cv2.CAP_PROP_FPS) or 30
    krok = max(1, round(src_fps / FPS))
    cap.set(cv2.CAP_PROP_POS_MSEC, max(0, od) * 1000)
    out, czasy, n = [], [], 0
    while True:
        ok, f = cap.read()
        if not ok:
            break
        t = cap.get(cv2.CAP_PROP_POS_MSEC) / 1000
        if t > do + 0.02:
            break
        if t >= od - 0.02 and n % krok == 0:
            out.append(cv2.resize(f, (W, H), interpolation=cv2.INTER_AREA))
            czasy.append(t)
        n += 1
    cap.release()
    return out, czasy


def kier(dx, dy):
    if abs(dx) >= abs(dy):
        return "prawo" if dx > 0 else "lewo"
    return "dol" if dy > 0 else "gora"


def ruch(fr, czasy):
    """Ruch kamery, najazd i ruch lokalny z przepływu optycznego."""
    if len(fr) < 2:
        return None
    ys, xs = np.mgrid[0:H:8, 0:W:8]
    cx, cy = W / 2, H / 2
    rx, ry = (xs - cx).ravel(), (ys - cy).ravel()
    den = float((rx ** 2 + ry ** 2).sum())
    glob, zoom, lok = [], [], []
    szary = [cv2.cvtColor(f, cv2.COLOR_BGR2GRAY) for f in fr]
    for k in range(1, len(szary)):
        dt = max(1e-3, czasy[k] - czasy[k - 1])
        fl = cv2.calcOpticalFlowFarneback(szary[k - 1], szary[k], None, 0.5, 3, 15, 3, 5, 1.2, 0)[::8, ::8]
        fx, fy = fl[..., 0].ravel(), fl[..., 1].ravel()
        gx, gy = float(np.median(fx)), float(np.median(fy))
        ex, ey = fx - gx, fy - gy
        s = float((rx * ex + ry * ey).sum() / den)  # względna zmiana skali na klatkę
        lx, ly = ex - s * rx, ey - s * ry
        mag = np.hypot(lx, ly)
        prog = max(1.2, 3 * float(np.median(mag)))
        m = mag > prog
        udzial = float(m.mean())
        if m.any():
            vx, vy = float(lx[m].mean()), float(ly[m].mean())
            sx, sy = float((rx[m] + cx).mean()), float((ry[m] + cy).mean())
        else:
            vx = vy = 0.0
            sx, sy = cx, cy
        glob.append((gx * SK / dt, gy * SK / dt))
        zoom.append(s / dt)
        lok.append((udzial, vx * SK / dt, vy * SK / dt, sx * SK, sy * SK))
    g = np.array(glob)
    gs = g.mean(axis=0)
    l = np.array(lok)
    # ruch lokalny: klatki, gdzie coś wyraźnie się rusza (np. ręka), kierunek ważony udziałem
    wagi = l[:, 0]
    if wagi.sum() > 0:
        lvx, lvy = float((l[:, 1] * wagi).sum() / wagi.sum()), float((l[:, 2] * wagi).sum() / wagi.sum())
    else:
        lvx = lvy = 0.0
    return {
        "kamera_v": round(float(np.hypot(*gs)), 1),
        "kamera_kier": kier(*gs) if np.hypot(*gs) > 1 else None,
        "kamera_spojnosc": round(float(np.hypot(*gs) / (np.hypot(g[:, 0], g[:, 1]).mean() + 1e-6)), 2),
        "zoom": round(float(np.mean(zoom)), 3),  # >0 najazd, <0 odjazd (na sekundę)
        "lokalny_udzial": round(float(l[:, 0].max()), 3),
        "lokalny_v": round(float(np.hypot(lvx, lvy)), 1),
        "lokalny_kier": kier(lvx, lvy) if np.hypot(lvx, lvy) > 1 else None,
        "lokalny_poziomo": round(abs(lvx) / (abs(lvx) + abs(lvy) + 1e-6), 2),
    }


def jasnosc(fr):
    sz = [cv2.cvtColor(f, cv2.COLOR_BGR2GRAY) for f in fr]
    return [float(s.mean()) for s in sz], [float(cv2.Laplacian(s, cv2.CV_64F).var()) for s in sz]


def histogram(f):
    hsv = cv2.cvtColor(f, cv2.COLOR_BGR2HSV)
    h = cv2.calcHist([hsv], [0, 1], None, [30, 32], [0, 180, 0, 256])
    return cv2.normalize(h, h).flatten()


def postac(fr, czasy):
    """Największa osoba w kadrze: obecność, środek, krawędzie, nadgarstki (YOLO pose)."""
    m = yolo()
    if not m or not fr:
        return None
    wyn = m(fr, imgsz=320, verbose=False)
    # wszystkie osoby w każdej klatce
    klatki_os = []
    for r, t in zip(wyn, czasy):
        os_ = []
        b = r.boxes
        if b is not None and len(b):
            xyxy = b.xyxy.cpu().numpy()
            conf = b.conf.cpu().numpy()
            kp = r.keypoints
            for i in range(len(xyxy)):
                if conf[i] < 0.4:
                    continue
                x1, y1, x2, y2 = (xyxy[i] * SK).tolist()
                nad = []
                if kp is not None and kp.xy is not None and len(kp.xy) > i:
                    pts = kp.xy[i].cpu().numpy() * SK
                    kc = kp.conf[i].cpu().numpy() if kp.conf is not None else np.ones(len(pts))
                    for j in (9, 10):  # lewy i prawy nadgarstek (COCO)
                        nad.append(pts[j].tolist() if kc[j] > 0.3 else None)
                os_.append({"t": t, "x1": x1, "x2": x2, "y1": y1, "y2": y2, "cx": (x1 + x2) / 2, "w": x2 - x1,
                            "pole": (x2 - x1) * (y2 - y1) / (1080 * 1920), "nad": nad})
        klatki_os.append(os_)

    # proste śledzenie: ta sama osoba = największe pokrycie ramek z poprzednią klatką (IoU > 0.3)
    def iou(a, b):
        ix = max(0, min(a["x2"], b["x2"]) - max(a["x1"], b["x1"]))
        iy = max(0, min(a["y2"], b["y2"]) - max(a["y1"], b["y1"]))
        p = ix * iy
        return p / ((a["x2"] - a["x1"]) * (a["y2"] - a["y1"]) + (b["x2"] - b["x1"]) * (b["y2"] - b["y1"]) - p + 1e-6)

    tory = []  # każdy tor: lista długości liczby klatek (osoba albo None)
    for k, os_ in enumerate(klatki_os):
        wolne = list(os_)
        for tor in tory:
            ost = next((x for x in reversed(tor[:k]) if x), None)
            if not ost or not wolne:
                tor.append(None)
                continue
            best = max(wolne, key=lambda o: iou(ost, o))
            if iou(ost, best) > 0.3:
                tor.append(best)
                wolne.remove(best)
            else:
                tor.append(None)
        for o in wolne:
            tory.append([None] * k + [o])

    # główna osoba: ta, która wychodzi z kadru (była na starcie, znika przy krawędzi), inaczej najszybsza, inaczej największa
    def ocena(tor):
        jest_ = [x for x in tor if x]
        if not jest_:
            return (-1, 0, 0)
        ost = jest_[-1]
        wychodzi = tor[0] is not None and len(tor) >= 3 and not tor[-1] and not tor[-2] and (ost["x1"] < 40 or ost["x2"] > 1040)
        v = abs(jest_[-1]["cx"] - jest_[0]["cx"]) / max(1e-3, jest_[-1]["t"] - jest_[0]["t"]) / max(1, np.median([x["w"] for x in jest_])) if len(jest_) > 1 else 0
        return (1 if wychodzi else 0, round(v, 1) if v > 0.6 else 0, len(jest_) * float(np.mean([x["pole"] for x in jest_])))

    sl = max(tory, key=ocena) if tory else [None] * len(klatki_os)
    jest = [s for s in sl if s]
    wynik = {"obecna_start": bool(sl and sl[0]), "obecna_koniec": bool(sl and sl[-1]), "udzial_klatek": round(len(jest) / max(1, len(sl)), 2)}
    if len(jest) >= 2:
        a, z = jest[0], jest[-1]
        dt = max(1e-3, z["t"] - a["t"])
        szer = float(np.median([s["w"] for s in jest]))
        wynik["v_szer"] = round((z["cx"] - a["cx"]) / dt / max(1, szer), 2)  # szerokości sylwetki na sekundę
        wynik["pole_zmiana"] = round(z["pole"] - a["pole"], 3)
        wynik["przy_krawedzi"] = "lewo" if z["x1"] < 30 else "prawo" if z["x2"] > 1050 else None
        # machnięcie: droga i prędkość nadgarstka w pikselach (w zbliżeniach „sylwetka” to sama dłoń, więc nie normalizujemy)
        best = {"v": 0.0, "zakres": 0.0, "kier": None}
        for j in (0, 1):
            seria = [(s["t"], s["nad"][j]) for s in jest if len(s["nad"]) > j and s["nad"][j]]
            if len(seria) < 3:
                continue
            xs = [p[0] for _, p in seria]
            ys = [p[1] for _, p in seria]
            zakres = max(xs) - min(xs)
            if zakres < (max(ys) - min(ys)):
                continue  # ruch głównie w pionie: to nie machnięcie w bok
            # prędkość wygładzona na 2 krokach (pojedyncze skoki punktu to szum detektora)
            for k in range(2, len(seria)):
                v = (seria[k][1][0] - seria[k - 2][1][0]) / max(1e-3, seria[k][0] - seria[k - 2][0])
                if abs(v) > best["v"]:
                    best = {"v": abs(v), "zakres": zakres, "kier": "prawo" if v > 0 else "lewo"}
        wynik["dlon_vpx"] = round(best["v"])
        wynik["dlon_zakres"] = round(best["zakres"])
        wynik["dlon_kier"] = best["kier"]
    # stabilność: obecność w pierwszej połowie i brak w dwóch ostatnich klatkach (pojedyncze zniknięcia to migotanie detektora)
    pol = sl[: max(1, len(sl) // 2)]
    wynik["udzial_poczatek"] = round(sum(1 for s in pol if s) / len(pol), 2)
    wynik["koniec_brak"] = len(sl) >= 3 and not sl[-1] and not sl[-2]
    if jest:
        ost = jest[-1]
        wynik["ostatnio_przy_krawedzi"] = "lewo" if ost["x1"] < 40 else "prawo" if ost["x2"] > 1040 else None
        wynik["pole_srednie"] = round(float(np.mean([s["pole"] for s in jest])), 3)
    return wynik


def analizuj(o):
    a, b = o["a"], o["b"]
    fa, ta = klatki(a["plik"], a["od"], a["do"])
    fb, tb = klatki(b["plik"], b["od"], b["do"]) if b.get("plik") else ([], [])
    out = {"id": o["id"], "a": {}, "b": {}}
    if fa:
        ja, oa = jasnosc(fa)
        out["a"] = {"ruch": ruch(fa, ta), "postac": postac(fa, ta), "jasnosc_start": round(ja[0], 1), "jasnosc_koniec": round(ja[-1], 1),
                    "ostrosc_start": round(oa[0], 1), "ostrosc_koniec": round(oa[-1], 1)}
    if fb:
        jb, _ = jasnosc(fb)
        out["b"] = {"ruch": ruch(fb, tb), "postac": postac(fb, tb), "jasnosc_start": round(jb[0], 1)}
    if fa and fb:
        out["podobienstwo"] = round(float(cv2.compareHist(histogram(fa[-1]), histogram(fb[0]), cv2.HISTCMP_CORREL)), 2)
    return out


if __name__ == "__main__":
    with open(sys.argv[1], encoding="utf-8") as f:
        zad = json.load(f)
    wyniki = []
    for k, o in enumerate(zad):
        print(f"@postep {k + 1}/{len(zad)}", file=sys.stderr, flush=True)
        try:
            wyniki.append(analizuj(o))
        except Exception as e:  # noqa: BLE001
            wyniki.append({"id": o["id"], "blad": str(e)})
    print(json.dumps({"yolo": bool(yolo()), "ciecia": wyniki}, ensure_ascii=False))

# Kontrola obrazu po renderze (wywołuje scripts/kontrola-obrazu.mjs).
# Wejście: dwa rendery tej samej rolki w 4 fps: pełny (to, co widzi widz) i czysty (bez napisów, scen i ozdób)
# oraz JSON z ustawieniami. Różnica pełny-czysty = mapa nakładek (dokładne piksele napisów, plansz, ozdób).
# Użycie: python kontrola_obrazu.py <pelny.mp4> <czysty.mp4> <ustawienia.json> <katalog na miniatury>
# Testy na klatkę (co 0,25 s):
#   twarz      nakładka zakrywa >10% oczu z brwiami (krytyczne); usta: >10% nosa i ust (ważne). MediaPipe na czystej klatce
#   strefa_ig  nakładka w strefach UI Instagrama (góra 220 px, dół 420 px, prawy pas 140 px), bez paska postępu
#   przepalenie / ciemno / czarna  jasność klatki, którą widzi widz
#   skok       skok jasności > 40 między próbkami bez cięcia (migotanie, błysk)
# Klatki, gdzie nakładka zajmuje > 60% kadru (pełnoekranowa scena, plansza), pomijają testy twarzy i strefy.
# Wynik (stdout): {"klatek": n, "problemy": [{typ, od, do, opis, ile, obraz}]}
import json
import os
import sys

import cv2
import numpy as np

W, H = 1080, 1920
MODEL = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "narzedzia", "mediapipe", "face_landmarker.task")
# rdzeń twarzy: oczy, brwi, nos, usta (otoczka tych punktów)
OCZY = [70, 63, 105, 66, 107, 336, 296, 334, 293, 300, 33, 133, 263, 362, 159, 145, 386, 374]
USTA = [1, 4, 98, 327, 61, 291, 0, 17, 13, 14, 129, 358]


def klatki(p):
    cap = cv2.VideoCapture(p)
    out = []
    while True:
        ok, f = cap.read()
        if not ok:
            break
        out.append(cv2.resize(f, (W, H)) if f.shape[:2] != (H, W) else f)
    cap.release()
    return out


def main():
    pelny, czysty, ust, kat = sys.argv[1:5]
    u = json.load(open(ust, encoding="utf-8"))
    fps, ciecia = u.get("fps", 4), u.get("ciecia", [])
    sz = u.get("safe", {"gora": 220, "dol": 420, "prawo": 140})
    os.makedirs(kat, exist_ok=True)
    A, B = klatki(pelny), klatki(czysty)
    n = min(len(A), len(B))
    det = None
    if os.path.exists(MODEL):
        try:
            import mediapipe as mp
            from mediapipe.tasks.python import BaseOptions, vision
            det = vision.FaceLandmarker.create_from_options(vision.FaceLandmarkerOptions(base_options=BaseOptions(model_asset_path=MODEL), running_mode=vision.RunningMode.IMAGE, num_faces=2, min_face_detection_confidence=0.5))
        except Exception as e:  # noqa: BLE001
            print(f"MediaPipe niedostępne: {e}", file=sys.stderr)
    strefy = np.zeros((H, W), bool)
    strefy[14:sz["gora"], :] = True                       # góra (bez paska postępu 0-14 px)
    strefy[H - sz["dol"]:, :] = True                      # dół (opis, przyciski)
    strefy[:, W - sz["prawo"]:] = True                    # prawy pas (polubienia, komentarze)
    zdarzenia, poprz_jas = [], None
    for i in range(n):
        t = round(i / fps, 2)
        a, b = A[i], B[i]
        roz = cv2.absdiff(a, b).max(axis=2)
        M = cv2.morphologyEx((roz > 28).astype(np.uint8), cv2.MORPH_OPEN, np.ones((3, 3), np.uint8)).astype(bool)
        udzial = float(M.mean())
        g = cv2.cvtColor(a, cv2.COLOR_BGR2GRAY)
        jas = float(g.mean())
        def zd(typ, opis, ile, maska=None, ramka=None):
            zdarzenia.append({"t": t, "typ": typ, "opis": opis, "ile": round(ile, 3), "i": i, "maska": maska, "ramka": ramka})
        if udzial < 0.6:
            if det is not None and M.any():
                import mediapipe as mp
                r = det.detect(mp.Image(image_format=mp.ImageFormat.SRGB, data=np.ascontiguousarray(cv2.cvtColor(b, cv2.COLOR_BGR2RGB))))
                for lm in r.face_landmarks or []:
                    pts = np.array([[p.x * W, p.y * H] for p in lm], np.float32)
                    if pts[:, 1].max() - pts[:, 1].min() < H * 0.12:
                        continue                          # mała twarz w tle: nie liczymy
                    # oczy z brwiami to błąd krytyczny; nos i usta osobno (napis na brodzie bywa w rolkach normalny,
                    # ale zasłonięte usta mówiącej osoby przeszkadzają)
                    for typ, idx, nazwa in (("twarz", OCZY, "oczu z brwiami"), ("usta", USTA, "nosa i ust")):
                        rd = np.zeros((H, W), np.uint8)
                        cv2.fillConvexPoly(rd, cv2.convexHull(pts[idx].astype(np.int32)), 1)
                        rd = rd.astype(bool)
                        zakryte = float((M & rd).sum() / max(1, rd.sum()))
                        if zakryte > 0.10:
                            x0, y0 = pts[idx].min(axis=0).astype(int)
                            x1, y1 = pts[idx].max(axis=0).astype(int)
                            zd(typ, f"Nakładka zakrywa {round(zakryte * 100)}% {nazwa}", zakryte, M & rd, (x0, y0, x1, y1))
            w_strefie = M & strefy
            if w_strefie.sum() > 1500:
                ys, xs = np.nonzero(w_strefie)
                gdzie = "u góry" if ys.mean() < sz["gora"] + 40 else "na dole" if ys.mean() > H - sz["dol"] - 40 else "przy prawej krawędzi"
                zd("strefa_ig", f"Napis lub grafika {gdzie}, pod przyciskami albo opisem Instagrama", float(w_strefie.sum()) / (W * H), w_strefie)
        if jas < 8:
            zd("czarna", "Czarna klatka", jas)
        elif jas < 35:
            zd("ciemno", f"Za ciemno (jasność {round(jas)}/255)", jas)
        przep = float((g > 250).mean())
        if przep > 0.10:
            zd("przepalenie", f"Przepalone {round(przep * 100)}% kadru", przep)
        if poprz_jas is not None and abs(jas - poprz_jas) > 40 and not any(t - 1 / fps - 0.05 <= c <= t + 0.05 for c in ciecia):
            zd("skok", f"Skok jasności o {round(abs(jas - poprz_jas))} bez cięcia (błysk albo migotanie)", abs(jas - poprz_jas))
        poprz_jas = jas
    # scalanie w zakresy (ten sam typ, przerwa <= 0,5 s), miniatura pierwszej klatki z zaznaczeniem
    problemy = []
    for typ in sorted({z["typ"] for z in zdarzenia}):
        zz = [z for z in zdarzenia if z["typ"] == typ]
        grupy = [[zz[0]]]
        for z in zz[1:]:
            if z["t"] - grupy[-1][-1]["t"] <= 0.5:
                grupy[-1].append(z)
            else:
                grupy.append([z])
        for g in grupy:
            najg = max(g, key=lambda z: z["ile"])
            img = A[najg["i"]].copy()
            if najg["maska"] is not None:
                img[najg["maska"]] = (img[najg["maska"]] * 0.4 + np.array([40, 40, 230]) * 0.6).astype(np.uint8)
            if najg["ramka"]:
                x0, y0, x1, y1 = najg["ramka"]
                cv2.rectangle(img, (x0, y0), (x1, y1), (0, 220, 255), 6)
            if typ == "strefa_ig":
                for (x0, y0, x1, y1) in ((0, 14, W, sz["gora"]), (0, H - sz["dol"], W, H), (W - sz["prawo"], 0, W, H)):
                    cv2.rectangle(img, (x0, y0), (x1 - 1, y1 - 1), (0, 220, 255), 3)
            nazwa = f"{typ}_{len(problemy):02d}.jpg"
            cv2.imwrite(os.path.join(kat, nazwa), cv2.resize(img, (270, 480)), [cv2.IMWRITE_JPEG_QUALITY, 82])
            problemy.append({"typ": typ, "od": g[0]["t"], "do": round(g[-1]["t"] + 1 / fps, 2), "opis": najg["opis"], "ile": najg["ile"], "obraz": nazwa})
    problemy.sort(key=lambda p: p["od"])
    print(json.dumps({"klatek": n, "problemy": problemy}, ensure_ascii=True))  # ASCII: konsola Windows psuje polskie znaki


if __name__ == "__main__":
    main()

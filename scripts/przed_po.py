# Wyrównanie zdjęć przed/po: „po” przesunięte, obrócone i przeskalowane tak, żeby leżało idealnie na „przed”.
# Wywołuje scripts/zloz.mjs (scena przed-po). Użycie:
#   python przed_po.py <przed> <po> <wyjście_przed.jpg> <wyjście_po.jpg> <wyjście.json> [--bez-koloru]
# Gdy po przesunięciu „po” nie pokrywa całego kadru, OBA zdjęcia są przycinane do wspólnego prostokąta
# (bez dorysowywania brzegów), więc porównanie pokazuje dokładnie ten sam fragment.
# Metoda:
#   twarz   MediaPipe Face Landmarker na obu zdjęciach, podobieństwo (obrót + skala + przesunięcie, bez pochylania)
#           liczone RANSAC-iem z punktów, których zabieg nie zmienia: kąciki oczu, nos, czoło, broda, kości policzkowe,
#           linia żuchwy. Bez brwi, rzęs i ust, bo to one się zmieniają.
#   punkty  bez twarzy (stopa, paznokieć, dłoń): punkty charakterystyczne ORB + to samo podobieństwo z RANSAC.
#   brak    nie da się wiarygodnie wyrównać: zostaje oryginał (zloz pisze uwagę).
# Światło: łagodne wyrównanie ekspozycji i balansu bieli „po” do „przed” (te same granice co kolor.mjs:
# kanały 0,88-1,12, jasność ±5%), bez nasycenia, bez wygładzania. Liczone poza obszarem zabiegu (brwi, oczy, usta),
# żeby nie „poprawiać” samego efektu.
# Krzywa łuku brwi (gdy jest twarz): linia przez obie brwi w pikselach kadru 1080x1920 (jak object-fit: cover)
# do kurtyny „po łuku brwi” w szablonie przed-po.
import json
import os
import sys

import cv2
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from twarz import MODEL, BREW_GORA, BREW_DOL  # noqa: E402

W, H = 1080, 1920
# punkty siatki, których zabieg brwi / rzęs / ust nie zmienia
STALE = [33, 133, 263, 362, 1, 4, 6, 168, 197, 195, 5, 10, 151, 9, 152, 234, 454, 127, 356, 93, 323, 132, 361, 58, 288,
         172, 397, 136, 365, 149, 378, 176, 400, 64, 294, 98, 327, 129, 358, 116, 345, 50, 280, 36, 266, 205, 425]
ZABIEG = [BREW_GORA["A"] + BREW_DOL["A"][::-1], BREW_GORA["B"] + BREW_DOL["B"][::-1],
          [33, 246, 161, 160, 159, 158, 157, 173, 133, 155, 154, 153, 145, 144, 163, 7],
          [263, 466, 388, 387, 386, 385, 384, 398, 362, 382, 381, 380, 374, 373, 390, 249],
          [61, 185, 40, 39, 37, 0, 267, 269, 270, 409, 291, 375, 321, 405, 314, 17, 84, 181, 91, 146]]


def wczytaj(p):
    img = cv2.imdecode(np.fromfile(p, dtype=np.uint8), cv2.IMREAD_COLOR)
    if img is None:
        raise SystemExit(f"Nie da się odczytać {p}")
    return img


def siatka(img):
    import mediapipe as mp
    from mediapipe.tasks.python import BaseOptions, vision
    opcje = vision.FaceLandmarkerOptions(base_options=BaseOptions(model_asset_path=MODEL), running_mode=vision.RunningMode.IMAGE,
                                         num_faces=1, min_face_detection_confidence=0.4, min_face_presence_confidence=0.4)
    with vision.FaceLandmarker.create_from_options(opcje) as det:
        r = det.detect(mp.Image(image_format=mp.ImageFormat.SRGB, data=np.ascontiguousarray(cv2.cvtColor(img, cv2.COLOR_BGR2RGB))))
    if not r.face_landmarks:
        return None
    h, w = img.shape[:2]
    return np.array([[p.x * w, p.y * h] for p in r.face_landmarks[0]], dtype=np.float32)


def podobienstwo(src, dst, prog):
    M, inl = cv2.estimateAffinePartial2D(src, dst, method=cv2.RANSAC, ransacReprojThreshold=prog, maxIters=4000, confidence=0.995)
    if M is None:
        return None, None, 0
    ok = inl.ravel().astype(bool)
    bl = np.linalg.norm(cv2.transform(src[ok][None], M)[0] - dst[ok], axis=1)
    return M, float(np.median(bl)) if len(bl) else 1e9, int(ok.sum())


def przez_punkty(a, b):
    """ORB na szarych, wyrównanych histogramem miniaturach; zwraca M (po -> przed) w pikselach oryginałów."""
    def mini(img):
        s = 900 / max(img.shape[:2])
        g = cv2.cvtColor(cv2.resize(img, None, fx=s, fy=s, interpolation=cv2.INTER_AREA), cv2.COLOR_BGR2GRAY)
        return cv2.createCLAHE(2.0, (8, 8)).apply(g), s
    ga, sa = mini(a)
    gb, sb = mini(b)
    orb = cv2.ORB_create(4000)
    ka, da = orb.detectAndCompute(ga, None)
    kb, db = orb.detectAndCompute(gb, None)
    if da is None or db is None or len(ka) < 30 or len(kb) < 30:
        return None, None, 0
    pary = cv2.BFMatcher(cv2.NORM_HAMMING).knnMatch(db, da, k=2)
    dobre = [m for m, n in (p for p in pary if len(p) == 2) if m.distance < 0.75 * n.distance]
    if len(dobre) < 25:
        return None, None, len(dobre)
    src = np.float32([kb[m.queryIdx].pt for m in dobre]) / sb
    dst = np.float32([ka[m.trainIdx].pt for m in dobre]) / sa
    M, bl, n = podobienstwo(src, dst, prog=4.0 / sa)
    return M, bl, n


def maska_zabiegu(pts, ksztalt):
    m = np.zeros(ksztalt[:2], np.uint8)
    if pts is not None:
        for idx in ZABIEG:
            cv2.fillPoly(m, [pts[idx].astype(np.int32)], 255)
        r = int(max(ksztalt[:2]) * 0.02)
        m = cv2.dilate(m, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * r + 1, 2 * r + 1)))
    return m


def swiatlo(po, przed, maska_waznych):
    """Kanałowe wzmocnienia BGR (balans bieli) + jasność, w granicach kolor.mjs; liczone poza obszarem zabiegu."""
    wazne = (maska_waznych == 0)
    if wazne.sum() < 1000:
        wazne = np.ones(po.shape[:2], bool)
    sa = przed[wazne].reshape(-1, 3).astype(np.float64).mean(axis=0) + 1
    sb = po[wazne].reshape(-1, 3).astype(np.float64).mean(axis=0) + 1
    jasA, jasB = sa.mean(), sb.mean()
    jas = float(np.clip(jasA / jasB, 0.95, 1.05))              # ekspozycja ±5%
    bal = np.clip((sa / jasA) / (sb / jasB), 0.88, 1.12)         # balans bieli 0,88-1,12
    zysk = bal * jas
    out = np.clip(po.astype(np.float32) * zysk[None, None, :].astype(np.float32), 0, 255).astype(np.uint8)
    return out, {"jasnosc": round(jas, 3), "balans_bgr": [round(float(x), 3) for x in bal]}


def wspolny_prostokat(m):
    """Największy (w przybliżeniu) prostokąt w całości pokryty maską: zwężanie od obrysu, po 0,5% z najgorszej strony."""
    ys, xs = np.where(m > 0)
    if not len(xs):
        return None
    x0, x1, y0, y1 = xs.min(), xs.max() + 1, ys.min(), ys.max() + 1
    kx, ky = max(1, m.shape[1] // 200), max(1, m.shape[0] // 200)
    for _ in range(400):
        r = m[y0:y1, x0:x1] > 0
        if r.all():
            return int(x0), int(y0), int(x1), int(y1)
        braki = {"l": (~r[:, 0]).sum() / r.shape[0], "p": (~r[:, -1]).sum() / r.shape[0], "g": (~r[0]).sum() / r.shape[1], "d": (~r[-1]).sum() / r.shape[1]}
        k = max(braki, key=braki.get)
        if k == "l": x0 += kx
        elif k == "p": x1 -= kx
        elif k == "g": y0 += ky
        else: y1 -= ky
        if x1 - x0 < m.shape[1] * 0.4 or y1 - y0 < m.shape[0] * 0.4:
            return None
    return None


def krzywa_luku(pts, w, h):
    """Linia przez górę obu brwi (od lewej do prawej na ekranie), w pikselach kadru 1080x1920 (object-fit: cover)."""
    sk = max(W / w, H / h)
    ox, oy = (W - w * sk) / 2, (H - h * sk) / 2
    a = (pts[BREW_GORA["A"]] + pts[BREW_DOL["A"]]) / 2 * 0.35 + pts[BREW_GORA["A"]] * 0.65
    b = (pts[BREW_GORA["B"]] + pts[BREW_DOL["B"]]) / 2 * 0.35 + pts[BREW_GORA["B"]] * 0.65
    if a[:, 0].mean() > b[:, 0].mean():
        a, b = b, a
    # A: od zewnątrz do nosa, B: od zewnątrz do nosa -> lewa (zewn. -> nos) + prawa (nos -> zewn.)
    lewa = a if a[0, 0] < a[-1, 0] else a[::-1]
    prawa = b[::-1] if b[0, 0] > b[-1, 0] else b
    srodek = (lewa[-1] + prawa[0]) / 2 + np.array([0, -0.15 * np.linalg.norm(lewa[-1] - prawa[0])])
    linia = np.vstack([lewa, srodek, prawa]) * sk + np.array([ox, oy])
    return [[int(round(x)), int(round(y))] for x, y in linia]


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    kolor = "--bez-koloru" not in sys.argv
    if len(args) < 5:
        raise SystemExit("Użycie: przed_po.py <przed> <po> <wyjście_przed.jpg> <wyjście_po.jpg> <wyjście.json> [--bez-koloru]")
    p_przed, p_po, wyj_przed, wyj_img, wyj_json = args[:5]
    a, b = wczytaj(p_przed), wczytaj(p_po)
    ha, wa = a.shape[:2]
    pa = pb = None
    try:
        pa, pb = siatka(a), siatka(b)
    except Exception as e:  # noqa: BLE001
        print(f"MediaPipe niedostępne: {e}", file=sys.stderr)
    wynik = {"metoda": "brak", "rozmiar_przed": [wa, ha]}
    M = None
    diag = float(np.hypot(wa, ha))
    if pa is not None and pb is not None:
        M, bl, n = podobienstwo(pb[STALE], pa[STALE], prog=diag * 0.006)
        if M is not None:
            wynik.update({"metoda": "twarz", "blad_px": round(bl, 1), "punkty": n})
    if M is None:
        M, bl, n = przez_punkty(a, b)
        if M is not None:
            wynik.update({"metoda": "punkty", "blad_px": round(bl, 1), "punkty": n})
    ok = M is not None
    if ok:
        skala = float(np.hypot(M[0, 0], M[1, 0]))
        obrot = float(np.degrees(np.arctan2(M[1, 0], M[0, 0])))
        wynik.update({"skala": round(skala, 3), "obrot": round(obrot, 1), "przesuniecie": [round(float(M[0, 2]), 1), round(float(M[1, 2]), 1)]})
        # sanity: zbyt duże zmiany albo duży błąd = nie ufamy
        if not (0.5 < skala < 2.0) or abs(obrot) > 30 or wynik["blad_px"] > diag * 0.012:
            wynik["odrzucone"] = "zbyt duża różnica albo niepewne dopasowanie"
            ok = False
    if ok:
        po = cv2.warpAffine(b, M, (wa, ha), flags=cv2.INTER_LANCZOS4, borderMode=cv2.BORDER_REFLECT_101)
        # pokrycie: jaka część kadru „przed” ma prawdziwe piksele „po” (reszta to odbicie krawędzi)
        pok = cv2.warpAffine(np.full(b.shape[:2], 255, np.uint8), M, (wa, ha), flags=cv2.INTER_NEAREST)
        wynik["pokrycie"] = round(float((pok > 0).mean()), 3)
        pts_po = cv2.transform(pb[None], M)[0] if (wynik["metoda"] == "twarz" and pb is not None) else None
    else:
        wynik["metoda"] = wynik.get("metoda") if wynik.get("odrzucone") else "brak"
        po = cv2.resize(b, (wa, ha), interpolation=cv2.INTER_AREA) if b.shape[:2] != a.shape[:2] else b
        pts_po = None
    wynik["wyrownane"] = ok
    if kolor:
        maska = cv2.bitwise_or(maska_zabiegu(pa, a.shape), maska_zabiegu(pts_po, a.shape))
        if ok:
            maska = cv2.bitwise_or(maska, cv2.bitwise_not(pok))  # odbite krawędzie nie liczą się do światła
        po, wynik["swiatlo"] = swiatlo(po, a, maska)
    przed = a
    if ok and wynik["pokrycie"] < 0.998:
        r = wspolny_prostokat(pok)
        if r is None:
            wynik.update({"wyrownane": False, "odrzucone": "za mała wspólna część kadru"})
            po = cv2.resize(b, (wa, ha), interpolation=cv2.INTER_AREA)
        else:
            x0, y0, x1, y1 = r
            przed, po = a[y0:y1, x0:x1], po[y0:y1, x0:x1]
            wynik["przyciecie"] = [x0, y0, x1, y1]
            if pa is not None:
                pa = pa - np.array([x0, y0], np.float32)
    if pa is not None:
        wynik["krzywa"] = krzywa_luku(pa, przed.shape[1], przed.shape[0])
    cv2.imencode(".jpg", przed, [cv2.IMWRITE_JPEG_QUALITY, 95])[1].tofile(wyj_przed)
    cv2.imencode(".jpg", po, [cv2.IMWRITE_JPEG_QUALITY, 95])[1].tofile(wyj_img)
    with open(wyj_json, "w", encoding="utf-8") as f:
        json.dump(wynik, f, ensure_ascii=False)
    print(json.dumps(wynik, ensure_ascii=False))


if __name__ == "__main__":
    main()

# Mapa twarzy (MediaPipe Face Landmarker, 478 punktów, lokalnie): brwi, oczy, rzęsy, nos, usta w każdej klatce.
# Wywołuje scripts/twarz.mjs. Użycie: python twarz.py <wejście: wideo albo zdjęcie> <wyjście.json> [--fps 15] [--od 0] [--do 9]
# Współrzędne w pikselach kadru 1080x1920 (jak proxy; zdjęcie przeliczone jak object-fit: cover).
# Strony „lewa/prawa” = na ekranie (nie strona klientki), przypisane po położeniu, więc działa też w lustrzanym selfie.
# Proporcje brwi (klasyczne mapowanie): z bocznej krawędzi skrzydełka nosa promień przez
#   wewnętrzny kącik oka -> początek brwi, zewnętrzną krawędź tęczówki -> łuk, zewnętrzny kącik oka -> koniec.
# To geometria na obrazie do grafiki, nie ocena ani diagnoza.
import json
import math
import os
import sys

import cv2
import numpy as np

W, H = 1080, 1920
MODEL = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "narzedzia", "mediapipe", "face_landmarker.task")
ZDJECIE = (".jpg", ".jpeg", ".png", ".webp")

# Indeksy siatki MediaPipe. „A” = strona, która zwykle jest po lewej na ekranie (prawa strona klientki), „B” = druga.
BREW_GORA = {"A": [70, 63, 105, 66, 107], "B": [300, 293, 334, 296, 336]}  # od zewnątrz do nosa
BREW_DOL = {"A": [46, 53, 52, 65, 55], "B": [276, 283, 282, 295, 285]}
POWIEKA = {"A": [33, 246, 161, 160, 159, 158, 157, 173, 133], "B": [263, 466, 388, 387, 386, 385, 384, 398, 362]}
OKO_ZEW = {"A": 33, "B": 263}
OKO_WEW = {"A": 133, "B": 362}
OKO_DOL = {"A": 145, "B": 374}
NOS_SKRZ = {"A": 64, "B": 294}
TECZ = [list(range(468, 473)), list(range(473, 478))]  # środek + 4 krawędzie; stronę dobieramy po odległości


def arg(nazwa, dom):
    if nazwa in sys.argv:
        i = sys.argv.index(nazwa)
        v = sys.argv[i + 1]
        del sys.argv[i:i + 2]
        return float(v)
    return dom


def przeciecie(p0, kier, linia):
    """Pierwsze przecięcie promienia p0 + s*kier (s > 0) z łamaną linia (lista punktów). None, gdy brak."""
    best = None
    for a, b in zip(linia[:-1], linia[1:]):
        e = b - a
        m = np.array([[kier[0], -e[0]], [kier[1], -e[1]]])
        det = np.linalg.det(m)
        if abs(det) < 1e-9:
            continue
        s, u = np.linalg.solve(m, a - p0)
        if s > 0 and -1e-6 <= u <= 1 + 1e-6 and (best is None or s < best[0]):
            best = (s, p0 + s * kier)
    return None if best is None else best[1]


def strona(pts, k, tecz):
    """Kotwice i kontury jednej strony twarzy (k = "A" | "B")."""
    gora = pts[BREW_GORA[k]]
    dol = pts[BREW_DOL[k]]
    srodek = (gora + dol) / 2  # linia środka brwi, od zewnątrz do nosa
    # łamana przedłużona o 35% z obu końców: początek i ogon brwi bywają dalej niż punkty siatki
    przed = srodek[0] + (srodek[0] - srodek[1]) * 1.4
    za = srodek[-1] + (srodek[-1] - srodek[-2]) * 1.4
    linia = np.vstack([przed, srodek, za])
    skrz = pts[NOS_SKRZ[k]]
    wew, zew = pts[OKO_WEW[k]], pts[OKO_ZEW[k]]
    oko = (wew + zew) / 2
    # tęczówka tej strony: ta, której środek jest bliżej środka oka
    tc = min(tecz, key=lambda t: np.linalg.norm(pts[t[0]] - oko)) if tecz else None
    if tc:
        krawedzie = pts[tc[1:]]
        teczowka = pts[tc[0]]
        luk_przez = krawedzie[np.argmax(np.linalg.norm(krawedzie - wew, axis=1))]
    else:
        teczowka = oko
        luk_przez = oko + (zew - oko) * 0.35
    def cel(przez):
        p = przeciecie(skrz, przez - skrz, linia)
        return p if p is not None else przez + (przez - skrz) * 0.6
    poczatek, luk, koniec = cel(wew), cel(luk_przez), cel(zew)
    return {
        "brew_poczatek": poczatek, "brew_luk": luk, "brew_koniec": koniec, "brew_srodek": srodek.mean(axis=0),
        "oko": oko, "oko_wew": wew, "oko_zew": zew, "rzesy": pts[POWIEKA[k][4]], "oko_dol": pts[OKO_DOL[k]],
        "teczowka": teczowka, "nos": skrz,
    }, {"brew": np.vstack([gora, dol[::-1]]), "rzesy": pts[POWIEKA[k]]}


def analiza(pts):
    """pts: (478, 2) w pikselach kadru 1080x1920 -> (kotwice, kontury, prostokąt twarzy)."""
    tecz = TECZ if len(pts) >= 478 else []
    sa, ka = strona(pts, "A", tecz)
    sb, kb = strona(pts, "B", tecz)
    # nazwy po położeniu na ekranie
    # nazwy po położeniu na ekranie, ale względem osi twarzy (klientka leżąca bokiem też ma „lewą” i „prawą”):
    # góra twarzy = od brody do czoła, „prawo” = ta oś obrócona o 90° zgodnie z ruchem wskazówek
    gora = pts[10] - pts[152]
    w_prawo = np.array([-gora[1], gora[0]])
    lewa, prawa = (sa, ka), (sb, kb)
    if np.dot(sa["brew_srodek"] - sb["brew_srodek"], w_prawo) > 0:
        lewa, prawa = prawa, lewa
    kot, kon = {}, {}
    for s, (pk, kk) in (("lewa", lewa), ("prawa", prawa)):
        for n, v in pk.items():
            kot[n.replace("_", f"_{s}_", 1) if "_" in n else f"{n}_{s}"] = v
        for n, v in kk.items():
            kon[f"{n}_{s}"] = v
    kot.update({
        "brwi": (kot["brew_lewa_srodek"] + kot["brew_prawa_srodek"]) / 2,
        "oczy": (kot["oko_lewa"] + kot["oko_prawa"]) / 2,
        "nos": pts[1], "usta": (pts[13] + pts[14]) / 2, "usta_lewa": pts[61] if pts[61][0] < pts[291][0] else pts[291],
        "usta_prawa": pts[291] if pts[61][0] < pts[291][0] else pts[61], "czolo": pts[10], "broda": pts[152],
    })
    x0, y0 = pts.min(axis=0)
    x1, y1 = pts.max(axis=0)
    kot["twarz"] = np.array([(x0 + x1) / 2, (y0 + y1) / 2])
    return kot, kon, [x0, y0, x1, y1]


def main():
    fps = arg("--fps", 15.0)
    od = arg("--od", 0.0)
    do = arg("--do", None)
    if len(sys.argv) < 3:
        print("Użycie: twarz.py <wejście> <wyjście.json> [--fps 15] [--od 0] [--do 9]", file=sys.stderr)
        sys.exit(2)
    wej, wyj = sys.argv[1], sys.argv[2]
    if not os.path.exists(MODEL):
        print(f"Brak modelu {MODEL}", file=sys.stderr)
        sys.exit(3)
    import mediapipe as mp
    from mediapipe.tasks.python import BaseOptions, vision

    zdjecie = wej.lower().endswith(ZDJECIE)
    opcje = vision.FaceLandmarkerOptions(
        base_options=BaseOptions(model_asset_path=MODEL),
        running_mode=vision.RunningMode.IMAGE if zdjecie else vision.RunningMode.VIDEO,
        num_faces=1, min_face_detection_confidence=0.4, min_face_presence_confidence=0.4, min_tracking_confidence=0.4,
    )
    klatki = []  # (t, obraz BGR)
    if zdjecie:
        img = cv2.imdecode(np.fromfile(wej, dtype=np.uint8), cv2.IMREAD_COLOR)
        if img is None:
            print("Nie da się odczytać zdjęcia", file=sys.stderr)
            sys.exit(4)
        klatki.append((0.0, img))
        zfps = None
    else:
        cap = cv2.VideoCapture(wej)
        if not cap.isOpened():
            print("Nie da się otworzyć wideo", file=sys.stderr)
            sys.exit(4)
        zfps = cap.get(cv2.CAP_PROP_FPS) or 30
        n = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
        koniec = min(do if do is not None else 1e9, n / zfps if n else 1e9)
        krok = max(1, round(zfps / fps))
        cap.set(cv2.CAP_PROP_POS_FRAMES, int(od * zfps))
        i = int(od * zfps)
        while True:
            ok, f = cap.read()
            if not ok or i / zfps > koniec:
                break
            if (i - int(od * zfps)) % krok == 0:
                klatki.append((i / zfps, f))
            i += 1
        cap.release()
    if not klatki:
        print("Brak klatek", file=sys.stderr)
        sys.exit(4)

    h0, w0 = klatki[0][1].shape[:2]
    sk = max(W / w0, H / h0)  # object-fit: cover
    ox, oy = (W - w0 * sk) / 2, (H - h0 * sk) / 2
    wynik = []
    with vision.FaceLandmarker.create_from_options(opcje) as det:
        for t, f in klatki:
            rgb = cv2.cvtColor(f, cv2.COLOR_BGR2RGB)
            obraz = mp.Image(image_format=mp.ImageFormat.SRGB, data=np.ascontiguousarray(rgb))
            r = det.detect(obraz) if zdjecie else det.detect_for_video(obraz, int(round(t * 1000)))
            if not r.face_landmarks:
                wynik.append({"t": round(t, 3), "ok": False})
                continue
            lm = r.face_landmarks[0]
            pts = np.array([[p.x * w0 * sk + ox, p.y * h0 * sk + oy] for p in lm], dtype=np.float64)
            kot, kon, box = analiza(pts)
            wynik.append({"t": round(t, 3), "ok": True, "kot": kot, "kon": kon, "box": box})

    # krótkie dziury (do 4 klatek) wypełnione interpolacją, potem wygładzenie (średnia ważona 1-2-3-2-1),
    # żeby ozdoby nie drżały, a ruch głowy zostawał
    ok_idx = [i for i, k in enumerate(wynik) if k["ok"]]
    for a, b in zip(ok_idx[:-1], ok_idx[1:]):
        if 1 < b - a <= 5:
            for j in range(a + 1, b):
                u = (j - a) / (b - a)
                wynik[j] = {"t": wynik[j]["t"], "ok": True, "uzupelnione": True,
                            "kot": {n: wynik[a]["kot"][n] * (1 - u) + wynik[b]["kot"][n] * u for n in wynik[a]["kot"]},
                            "kon": {n: wynik[a]["kon"][n] * (1 - u) + wynik[b]["kon"][n] * u for n in wynik[a]["kon"]},
                            "box": [wynik[a]["box"][q] * (1 - u) + wynik[b]["box"][q] * u for q in range(4)]}
    wagi = [1, 2, 3, 2, 1]
    gl = []
    for i, k in enumerate(wynik):
        if not k["ok"]:
            gl.append(k)
            continue
        sasiedzi = [(wagi[d + 2], wynik[i + d]) for d in range(-2, 3) if 0 <= i + d < len(wynik) and wynik[i + d]["ok"]]
        s = sum(w for w, _ in sasiedzi)
        gl.append({**k,
                   "kot": {n: sum(w * q["kot"][n] for w, q in sasiedzi) / s for n in k["kot"]},
                   "kon": {n: sum(w * q["kon"][n] for w, q in sasiedzi) / s for n in k["kon"]}})

    def zaokr(v):
        return [int(round(float(v[0]))), int(round(float(v[1])))]
    klatki_out = []
    for k in gl:
        if not k["ok"]:
            klatki_out.append({"t": k["t"], "ok": False})
            continue
        d = {"t": k["t"], "ok": True,
             "kot": {n: zaokr(v) for n, v in k["kot"].items()},
             "kon": {n: [zaokr(p) for p in v] for n, v in k["kon"].items()},
             "box": [int(round(float(v))) for v in k["box"]]}
        if k.get("uzupelnione"):
            d["uzupelnione"] = True
        klatki_out.append(d)
    n_ok = sum(1 for k in klatki_out if k["ok"])
    # rozmiar twarzy w kadrze (wysokość prostokąta / 1920): mała twarz = kotwice mniej dokładne
    wys = [k["box"][3] - k["box"][1] for k in klatki_out if k["ok"]]
    out = {"zdjecie": zdjecie, "fps": None if zdjecie else fps, "od": od, "w": W, "h": H,
           "pokrycie": round(n_ok / len(klatki_out), 3), "wielkosc_twarzy": round(float(np.median(wys)) / H, 3) if wys else 0,
           "klatki": klatki_out}
    with open(wyj, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
    print(json.dumps({"klatek": len(klatki_out), "z_twarza": n_ok, "pokrycie": out["pokrycie"], "wielkosc_twarzy": out["wielkosc_twarzy"]}))


if __name__ == "__main__":
    main()

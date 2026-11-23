# Wycinanie dowolnego obiektu w wideo (SAM 2.1 tiny przez Ultralytics, lokalnie na CPU): klik w obiekt
# (brew, paznokieć, pęseta, urządzenie, dłoń) w chwili t, maska w każdej klatce od --od do --do.
# Wywołuje scripts/obiekt.mjs. Użycie:
#   python obiekt.py <wideo 1080x1920> <wyjście.webm> <wyjście.json> --x 540 --y 900 --t 1.2 [--od 0] [--do 5] [--imgsz 512]
# Śledzi od klatki kliknięcia do przodu i (na odwróconym fragmencie) do tyłu, więc klik może być w dowolnym miejscu.
# Wynik: wyjście.webm = obiekt z przezroczystym tłem (VP9 yuva420p, te same klatki co źródło od --od),
#        wyjście.json = { od, do, fps, klatki: [{t, ok, x, y, pole, box}] } (środek obiektu = śledzenie punktu).
# Model: narzedzia/sam2/sam2.1_t.pt (Ultralytics assets v8.3.0, Apache-2.0, pobrany 2026-11-20, 78 MB).
import json
import os
import shutil
import subprocess
import sys
import tempfile

import cv2
import numpy as np

W, H = 1080, 1920
MODEL = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "narzedzia", "sam2", "sam2.1_t.pt")


def arg(n, d):
    if n in sys.argv:
        i = sys.argv.index(n)
        v = sys.argv[i + 1]
        del sys.argv[i:i + 2]
        return float(v)
    return d


def ffmpeg(*a):
    r = subprocess.run(["ffmpeg", "-hide_banner", "-v", "error", "-y", *a], capture_output=True, text=True)
    if r.returncode:
        raise SystemExit(f"ffmpeg: {r.stderr[-400:]}")


def maski(klip, x, y, imgsz):
    """Maski SAM 2 dla każdej klatki klipu; prompt = punkt w pierwszej klatce."""
    from ultralytics.models.sam import SAM2VideoPredictor
    p = SAM2VideoPredictor(overrides=dict(conf=0.25, task="segment", mode="predict", imgsz=int(imgsz), model=MODEL, save=False, verbose=False))
    out = []
    for r in p(source=klip, points=[[x, y]], labels=[1], stream=True):
        m = r.masks.data[0].cpu().numpy() if r.masks is not None and len(r.masks.data) else None
        if m is not None and m.shape != (H, W):
            m = cv2.resize(m.astype(np.float32), (W, H), interpolation=cv2.INTER_LINEAR)
        out.append(None if m is None or m.mean() < 1e-5 else (m > 0.5).astype(np.uint8))
    return out


def main():
    x, y, t = arg("--x", None), arg("--y", None), arg("--t", 0.0)
    od, do, imgsz = arg("--od", 0.0), arg("--do", None), arg("--imgsz", 512)
    if len(sys.argv) < 4 or x is None or y is None:
        raise SystemExit("Użycie: obiekt.py <wideo> <wyj.webm> <wyj.json> --x --y --t [--od --do --imgsz]")
    wej, wyj, wyj_json = sys.argv[1:4]
    cap = cv2.VideoCapture(wej)
    fps = cap.get(cv2.CAP_PROP_FPS) or 30
    dl = (cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0) / fps
    cap.release()
    do = min(do if do is not None else dl, dl)
    t = min(max(t, od), do - 1 / fps)
    if do - od < 0.2:
        raise SystemExit("Za krótki fragment.")
    tmp = tempfile.mkdtemp(prefix="obiekt_")
    try:
        # do przodu od kliknięcia, do tyłu: odwrócony fragment [od, t]
        przod = os.path.join(tmp, "przod.mp4")
        ffmpeg("-ss", f"{t:.3f}", "-to", f"{do:.3f}", "-i", wej, "-an", "-c:v", "libx264", "-preset", "ultrafast", "-crf", "16", przod)
        m_przod = maski(przod, x, y, imgsz)
        m_tyl = []
        if t - od >= 1 / fps:
            tyl = os.path.join(tmp, "tyl.mp4")
            ffmpeg("-ss", f"{od:.3f}", "-to", f"{t + 0.5 / fps:.3f}", "-i", wej, "-an", "-vf", "reverse", "-c:v", "libx264", "-preset", "ultrafast", "-crf", "16", tyl)
            m_tyl = maski(tyl, x, y, imgsz)[1:][::-1]   # bez klatki kliknięcia (jest w przodzie), w kolejności czasu
        wszystkie = m_tyl + m_przod
        # klatki źródła od --od, RGBA z miękką krawędzią (1,5 px), puste klatki = całkiem przezroczyste
        cap = cv2.VideoCapture(wej)
        cap.set(cv2.CAP_PROP_POS_MSEC, od * 1000)
        kl_dir = os.path.join(tmp, "kl")
        os.makedirs(kl_dir)
        info = []
        for i, m in enumerate(wszystkie):
            ok, f = cap.read()
            if not ok:
                break
            f = cv2.resize(f, (W, H)) if f.shape[:2] != (H, W) else f
            tt = round(od + i / fps, 3)
            if m is None:
                a = np.zeros((H, W), np.uint8)
                info.append({"t": tt, "ok": False})
            else:
                n, et, st, cen = cv2.connectedComponentsWithStats(m)
                if n > 2:  # tylko spójne kawałki obok największego (bez odprysków maski)
                    big = 1 + int(np.argmax(st[1:, cv2.CC_STAT_AREA]))
                    keep = [k for k in range(1, n) if st[k, cv2.CC_STAT_AREA] >= 0.08 * st[big, cv2.CC_STAT_AREA]]
                    m = np.isin(et, keep).astype(np.uint8)
                a = cv2.GaussianBlur(m * 255, (0, 0), 1.5)
                ys, xs = np.nonzero(m)
                info.append({"t": tt, "ok": True, "x": int(xs.mean()), "y": int(ys.mean()), "pole": round(float(m.mean()), 5),
                             "box": [int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max())]})
            cv2.imwrite(os.path.join(kl_dir, f"{i:05d}.png"), np.dstack([f, a]))
        cap.release()
        ffmpeg("-framerate", f"{fps:.5f}", "-i", os.path.join(kl_dir, "%05d.png"), "-c:v", "libvpx-vp9", "-pix_fmt", "yuva420p",
               "-b:v", "0", "-crf", "30", "-row-mt", "1", "-deadline", "good", "-cpu-used", "4", "-auto-alt-ref", "0", wyj)
        ok_n = sum(1 for k in info if k["ok"])
        wynik = {"od": od, "do": round(od + len(info) / fps, 3), "fps": fps, "klik": {"x": x, "y": y, "t": t},
                 "pokrycie": round(ok_n / max(1, len(info)), 3), "klatki": info}
        with open(wyj_json, "w", encoding="utf-8") as fh:
            json.dump(wynik, fh, separators=(",", ":"))
        print(json.dumps({"klatek": len(info), "z_obiektem": ok_n, "pokrycie": wynik["pokrycie"],
                          "pole_sr": round(float(np.mean([k["pole"] for k in info if k["ok"]] or [0])), 4)}))
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


if __name__ == "__main__":
    main()

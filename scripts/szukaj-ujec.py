"""Lokalny indeks obrazu dla wyszukiwarki fragmentów proxy."""

import argparse
import hashlib
import json
import math
import os
import shutil
import subprocess
import sys
from pathlib import Path
from urllib.request import urlopen
from zipfile import BadZipFile


REVISION = "ba1f3b0843f24bc5417d38e19c37b287d719b2f4"
MODEL_URL = f"https://huggingface.co/onnx-community/siglip2-base-patch16-224-ONNX/resolve/{REVISION}"
MODEL_DIR = Path(__file__).resolve().parent.parent / "narzedzia" / "siglip2"
MODELS = {
    "vision_model_quantized.onnx": "5f2b401c1a4fc095702a5d45348e17ad46c4f87064085365b43c6e8eaa5c0070",
    "text_model_quantized.onnx": "3a0603d3a00c05a80a6ded4743c16aaac7b1e62cdcc7e362e7ce418659b96400",
    "tokenizer.json": None,
}
INDEX_VERSION = f"1:{REVISION}"
WIDTH = 224
FRAGMENT = 2.4
VIDEO_EXT = {".mp4", ".m4v", ".mov", ".webm", ".mkv", ".avi", ".3gp", ".hevc"}


def prepare_models():
    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    for name, checksum in MODELS.items():
        target = MODEL_DIR / name
        if target.is_file():
            continue
        print(f"Pobieram model wyszukiwania: {name}", flush=True)
        relative = f"onnx/{name}" if name.endswith(".onnx") else name
        part = target.with_name(f"{target.stem}.{os.getpid()}.czesc{target.suffix}")
        try:
            with urlopen(f"{MODEL_URL}/{relative}?download=true", timeout=90) as source, part.open("wb") as dest:
                shutil.copyfileobj(source, dest)
            if checksum:
                with part.open("rb") as file:
                    if hashlib.file_digest(file, "sha256").hexdigest() != checksum:
                        raise ValueError("Niezgodna suma kontrolna pobranego pliku.")
            else:
                json.loads(part.read_text(encoding="utf-8"))
            part.replace(target)
        except (OSError, ValueError) as error:
            raise RuntimeError(
                f"Nie udało się pobrać {name}. Sprawdź połączenie z huggingface.co i spróbuj ponownie. ({error})"
            ) from error
        finally:
            part.unlink(missing_ok=True)


def model(name):
    settings = ort.SessionOptions()
    settings.intra_op_num_threads = min(4, os.cpu_count() or 1)
    return ort.InferenceSession(str(MODEL_DIR / name), settings, providers=["CPUExecutionProvider"])


def unit(vector):
    vector = vector.astype(np.float32).reshape(-1)
    return vector / max(float(np.linalg.norm(vector)), 1e-8)


def samples(file, session):
    probe = subprocess.run(
        ["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries",
         "stream=duration:format=duration", "-of", "json", str(file)],
        capture_output=True, text=True, check=True, timeout=30,
    )
    data = json.loads(probe.stdout)
    if not data.get("streams"):
        return []
    reported = data["streams"][0].get("duration")
    duration = float(reported if reported not in (None, "N/A") else data["format"]["duration"])
    if not math.isfinite(duration) or duration < 0.2:
        return []
    # Dla klipów krótszych od sekundy zachowujemy co najmniej jedną próbkę.
    period = min(1, duration)
    pixels = WIDTH * WIDTH * 3
    args = [
        "ffmpeg", "-v", "error", "-nostdin", "-threads", "2", "-filter_threads", "1",
        "-i", str(file), "-map", "0:v:0", "-an", "-sn",
        "-vf", f"fps=1/{period:.8f}:start_time=0,scale={WIDTH}:{WIDTH}:flags=bicubic",
        "-pix_fmt", "rgb24", "-threads", "1", "-f", "rawvideo", "pipe:1",
    ]
    rows = []
    with subprocess.Popen(args, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL) as decoder:
        try:
            while len(frame := decoder.stdout.read(pixels)) == pixels:
                t = min((len(rows) + 0.5) * period, duration - 0.001)
                start = max(0, min(t - FRAGMENT / 2, duration - FRAGMENT))
                image = np.frombuffer(frame, np.uint8).reshape(WIDTH, WIDTH, 3)
                values = (image.transpose(2, 0, 1)[None].astype(np.float32) / 127.5) - 1
                embedding = unit(session.run(["pooler_output"], {"pixel_values": values})[0])
                rows.append(([round(start, 3), round(min(duration, start + FRAGMENT), 3), round(t, 3)], embedding))
        finally:
            if decoder.poll() is None:
                decoder.stdout.close()
        if decoder.wait() != 0:
            raise RuntimeError("FFmpeg nie zdekodował wideo.")
    return rows


def read_index(file):
    try:
        with np.load(file, allow_pickle=False) as archive:
            manifest = json.loads(str(archive["manifest"]))
            if manifest["version"] == INDEX_VERSION:
                return manifest["files"], archive["times"], archive["embeddings"]
    except (OSError, ValueError, KeyError, BadZipFile):
        pass
    return {}, np.empty((0, 3), np.float32), np.empty((0, 768), np.float32)


def video_index(project, *, offline=False):
    folder = project / "proxy"
    if not folder.is_dir():
        raise RuntimeError("Brak folderu proxy. Najpierw przygotuj nagrania w kroku Nagrania.")
    clips = sorted(
        p for p in folder.iterdir()
        if not p.name.startswith(".") and p.suffix.lower() in VIDEO_EXT and not p.is_symlink() and p.is_file()
    )
    if not clips:
        raise RuntimeError("Brak gotowych klipów. Najpierw przygotuj nagrania w kroku Nagrania.")
    if offline:
        if not all((MODEL_DIR / name).is_file() for name in MODELS):
            raise RuntimeError("Brakuje lokalnego modelu. Uruchom wyszukiwarkę ujęć, aby go przygotować.")
    else:
        prepare_models()
    index = project / "kompozycja" / ".szukaj-ujec.npz"
    old, old_times, old_embeddings = read_index(index)
    files, times, embeddings, skipped = {}, [], [], []
    vision = None
    for i, clip in enumerate(clips, start=1):
        try:
            stamp = clip.stat()
        except FileNotFoundError:
            skipped.append(clip.name)
            continue
        signature = [stamp.st_size, stamp.st_mtime_ns]
        cached = old.get(clip.name, {})
        if cached.get("signature") == signature:
            begin, end = cached["range"]
            clip_times, clip_vectors = old_times[begin:end], old_embeddings[begin:end]
        else:
            if vision is None:
                vision = model("vision_model_quantized.onnx")
            print(f"Indeksuję klip {i}/{len(clips)}: {clip.name}", flush=True)
            try:
                rows = samples(clip, vision)
                after = clip.stat()
            except (OSError, KeyError, ValueError, subprocess.SubprocessError, RuntimeError) as error:
                print(f"Pominięto {clip.name}: {error}", flush=True)
                skipped.append(clip.name)
                continue
            if not rows or signature != [after.st_size, after.st_mtime_ns]:
                skipped.append(clip.name)
                continue
            clip_times, clip_vectors = zip(*rows)
        begin = len(times)
        times.extend(clip_times)
        embeddings.extend(clip_vectors)
        files[clip.name] = {"signature": signature, "range": [begin, len(times)]}
    if not times:
        raise RuntimeError("Nie udało się odczytać klatek z gotowych klipów.")
    del vision
    vectors = np.asarray(embeddings, dtype=np.float32)
    if files != old:
        index.parent.mkdir(parents=True, exist_ok=True)
        temporary = index.with_name(f".szukaj-ujec.{os.getpid()}.czesc.npz")
        try:
            np.savez(temporary, manifest=json.dumps({"version": INDEX_VERSION, "files": files}),
                     times=np.asarray(times, dtype=np.float32), embeddings=vectors)
            temporary.replace(index)
        finally:
            temporary.unlink(missing_ok=True)

    sources = [name for name, meta in files.items() for _ in range(*meta["range"])]
    return vectors, times, sources, len(files), len(skipped)


def rank(scores, times, sources):
    results = []
    for item in np.argsort(-scores, kind="stable"):
        start, end, time = (round(float(t), 3) for t in times[item])
        src = f"proxy/{sources[item]}"
        if any(r["src"] == src and min(r["do"], end) - max(r["od"], start) > 0.35 for r in results):
            continue
        results.append({"src": src, "od": start, "do": end, "klatka": time})
        if len(results) == 3:
            break
    return results


def search(project, texts, *, offline=False):
    vectors, times, sources, clips, skipped = video_index(project, offline=offline)
    tokenizer = Tokenizer.from_file(str(MODEL_DIR / "tokenizer.json"))
    tokenizer.enable_padding(length=64, pad_id=tokenizer.token_to_id("<pad>"), pad_token="<pad>")
    tokenizer.enable_truncation(max_length=64)
    session = model("text_model_quantized.onnx")
    results = []
    for text in texts:
        tokens = tokenizer.encode(" ".join(text.lower().split()))
        inputs = {"input_ids": np.array([tokens.ids], dtype=np.int64)}
        query = unit(session.run(["pooler_output"], inputs)[0])
        results.append(rank(vectors @ query, times, sources))
    return results, clips, skipped


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("projekt", type=Path, nargs="?")
    parser.add_argument("--tekst")
    parser.add_argument("--sceny", action="store_true", help="opisy scen w tablicy JSON ze standardowego wejścia")
    parser.add_argument("--pobierz-model", action="store_true")
    args = parser.parse_args()
    if args.pobierz_model:
        prepare_models()
        return
    if not args.projekt or not (bool(args.tekst) ^ args.sceny):
        parser.error("Podaj projekt i opis szukanego fragmentu.")
    texts = json.load(sys.stdin) if args.sceny else [args.tekst]
    if not isinstance(texts, list) or not texts or any(not isinstance(t, str) or not 2 <= len(t) <= 250 for t in texts):
        parser.error("Podaj niepuste opisy scen (2–250 znaków).")
    global np, ort, Tokenizer
    try:
        import numpy as np
        import onnxruntime as ort
        from tokenizers import Tokenizer
    except ImportError as error:
        raise RuntimeError("Zainstaluj biblioteki Pythona: pip install numpy onnxruntime tokenizers.") from error
    results, clips, skipped = search(args.projekt, texts, offline=args.sceny)
    print("WYNIKI " + json.dumps({"wyniki": results if args.sceny else results[0], "klipy": clips, "pominiete": skipped}, ensure_ascii=False), flush=True)


if __name__ == "__main__":
    try:
        main()
    except (OSError, RuntimeError, ValueError) as error:
        print(f"✗ BŁĄD: {error}", file=sys.stderr, flush=True)
        sys.exit(1)

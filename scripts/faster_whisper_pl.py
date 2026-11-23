"""Fallback transkrypcji: faster-whisper z timingiem słów.
Użycie: python -I faster_whisper_pl.py <plik> <wyjscie.json> [model=medium] [jezyk=pl]
Instalacja: pip install faster-whisper
"""
import json
import sys

try:
    from faster_whisper import WhisperModel
except ImportError:
    sys.stderr.write("Brak faster-whisper. Zainstaluj: pip install faster-whisper\n")
    sys.exit(3)

plik, wyjscie = sys.argv[1], sys.argv[2]
model_name = sys.argv[3] if len(sys.argv) > 3 else "medium"
jezyk = sys.argv[4] if len(sys.argv) > 4 else "pl"
if model_name.endswith(".en"):
    sys.stderr.write("Modele .en nie obsługują polskiego.\n")
    sys.exit(4)

model = WhisperModel(model_name, device="auto", compute_type="int8")
segments, _ = model.transcribe(plik, language=jezyk, word_timestamps=True, vad_filter=True,
                               condition_on_previous_text=False)
slowa = []
for seg in segments:
    for w in seg.words or []:
        t = w.word.strip()
        if t:
            slowa.append({"text": t, "start": round(w.start, 3), "end": round(w.end, 3)})
with open(wyjscie, "w", encoding="utf-8") as f:
    json.dump(slowa, f, ensure_ascii=False)

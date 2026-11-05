"""Tạo file giọng đọc "Bàn NN vừa gọi món" bằng Piper (miễn phí, chạy trên máy).
Cài:  pip install piper-tts
Chạy: python scripts/gen-voice.py <đường dẫn vi_VN-vais1000-medium.onnx> [số bàn tối đa, mặc định 99]
Model: https://huggingface.co/rhasspy/piper-voices/tree/main/vi/vi_VN/vais1000/medium
Kết quả: public/sounds/ban-<số>.wav (B01 -> ban-1.wav) và khach-goi-mon.wav
"""
import sys, wave, pathlib
from piper import PiperVoice

D = ["không", "một", "hai", "ba", "bốn", "năm", "sáu", "bảy", "tám", "chín"]

def say(n: int) -> str:
    if n < 10:
        return "không " + D[n]  # bàn 01 -> "không một"
    if n < 20:
        return "mười" + ("" if n == 10 else " " + ("lăm" if n == 15 else D[n - 10]))
    t, u = divmod(n, 10)
    s = D[t] + " mươi"
    if u == 1: s += " mốt"
    elif u == 5: s += " lăm"
    elif u: s += " " + D[u]
    return s

voice = PiperVoice.load(sys.argv[1])
top = int(sys.argv[2]) if len(sys.argv) > 2 else 99
out = pathlib.Path(__file__).resolve().parent.parent / "public" / "sounds"
out.mkdir(parents=True, exist_ok=True)

def make(name: str, text: str):
    with wave.open(str(out / name), "wb") as w:
        voice.synthesize_wav(text, w)

make("khach-goi-mon.wav", "Có bàn vừa gọi món")
for i in range(1, top + 1):
    make(f"ban-{i}.wav", f"Bàn {say(i)} vừa gọi món")
print("Xong:", out)

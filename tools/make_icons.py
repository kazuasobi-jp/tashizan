"""PWA 用のアイコンを icons/ に作る（Pillow が必要。作り直すときだけ実行）。デザイン「ほし」：夜空に黄色い星。

使い方: python tools/make_icons.py
"""
import math
from pathlib import Path
from PIL import Image, ImageDraw

OUT = Path(__file__).resolve().parent.parent / "icons"
BG = (27, 35, 71)        # --bg
STAR = (255, 213, 74)    # --num
DOT = (126, 224, 255)    # --cb（小さな星）
S = 1024                 # 大きく描いてから縮小する


def star(d, cx, cy, r, color, points=5, inner=0.48):
    pts = []
    for i in range(points * 2):
        a = -math.pi / 2 + i * math.pi / points
        rr = r if i % 2 == 0 else r * inner
        pts.append((cx + rr * math.cos(a), cy + rr * math.sin(a)))
    d.polygon(pts, fill=color)


def make(scale, rounded):
    """scale: 図柄の大きさ（maskable は中央 80% に収める）"""
    im = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    if rounded:
        d.rounded_rectangle((0, 0, S - 1, S - 1), radius=int(S * 0.22), fill=BG)
    else:
        d.rectangle((0, 0, S, S), fill=BG)
    c = S / 2
    star(d, c, c + S * 0.03 * scale, S * 0.34 * scale, STAR)
    for dx, dy, r in [(-0.30, -0.28, 0.05), (0.31, -0.22, 0.035), (0.27, 0.30, 0.045)]:
        star(d, c + S * dx * scale, c + S * dy * scale, S * r * scale, DOT, points=4, inner=0.35)
    return im


def save(im, name, px):
    im.resize((px, px), Image.LANCZOS).save(OUT / name)
    print(OUT / name)


OUT.mkdir(parents=True, exist_ok=True)
std = make(1.0, rounded=True)
full = make(1.0, rounded=False)      # iOS は自分で角を丸める
mask = make(0.78, rounded=False)     # Android の maskable（安全域 80%）
save(std, "icon-192.png", 192)
save(std, "icon-512.png", 512)
save(mask, "icon-maskable-512.png", 512)
save(full, "apple-touch-icon.png", 180)
save(std, "favicon-32.png", 32)

#!/usr/bin/env python3
"""TUS CLASS Helper アイコン生成"""
from PIL import Image, ImageDraw, ImageFont
import os

OUT_DIR = os.path.dirname(os.path.abspath(__file__))
os.makedirs(OUT_DIR, exist_ok=True)

# TUS のテーマカラー
PRIMARY = (31, 122, 224, 255)
PRIMARY_DARK = (21, 95, 168, 255)
WHITE = (255, 255, 255, 255)
GOLD = (255, 214, 107, 255)

def draw_icon(size: int) -> Image.Image:
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    # 角丸背景
    radius = max(8, size // 6)
    d.rounded_rectangle([0, 0, size - 1, size - 1], radius=radius, fill=PRIMARY)
    # 装飾の罫線
    inner = max(2, size // 32)
    d.rounded_rectangle([inner, inner, size - 1 - inner, size - 1 - inner],
                        radius=max(2, radius - inner), outline=WHITE, width=max(1, size // 64))
    # 「T」文字
    try:
        font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
                                  int(size * 0.62))
    except Exception:
        font = ImageFont.load_default()
    text = "T"
    bbox = d.textbbox((0, 0), text, font=font)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    x = (size - tw) // 2 - bbox[0]
    y = (size - th) // 2 - bbox[1]
    d.text((x, y), text, fill=WHITE, font=font)
    # 右下に小さな金色の丸(時間割コマ)
    dot_r = max(3, size // 10)
    cx = size - dot_r - max(2, size // 20)
    cy = size - dot_r - max(2, size // 20)
    d.ellipse([cx - dot_r, cy - dot_r, cx + dot_r, cy + dot_r], fill=GOLD, outline=PRIMARY_DARK)
    return img

for s in (48, 96, 128):
    p = os.path.join(OUT_DIR, f"icon{s}.png")
    draw_icon(s).save(p, "PNG")
    print("wrote", p)

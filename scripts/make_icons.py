"""Draws the PWA icons (public/icons/*.png): a white two-storey villa with a teak band on dark navy."""
import os
from PIL import Image, ImageDraw

OUT = os.path.join(os.path.dirname(__file__), "..", "public", "icons")
os.makedirs(OUT, exist_ok=True)

def icon(size, pad):
    im = Image.new("RGB", (size, size), "#0d1117")
    d = ImageDraw.Draw(im)
    s = (size - 2 * pad) / 100.0
    P = lambda x, y: (pad + x * s, pad + y * s)
    R = lambda x1, y1, x2, y2, c: d.rectangle([P(x1, y1), P(x2, y2)], fill=c)
    R(4, 86, 96, 90, "#3a4a2a")            # lawn
    R(8, 52, 34, 86, "#e9e4dc")            # single storey left
    R(30, 26, 70, 86, "#f4f1ea")           # two-storey centre
    R(62, 34, 92, 86, "#f4f1ea")           # right block
    R(26, 22, 74, 27, "#ffffff")           # roof slab
    R(58, 30, 96, 35, "#ffffff")
    R(32, 27, 46, 54, "#c8783e")           # teak band
    R(50, 36, 60, 50, "#ffd27a")           # lit windows
    R(68, 40, 86, 50, "#ffd27a")
    R(14, 62, 26, 72, "#ffd27a")
    R(44, 62, 52, 86, "#9a5a32")           # door
    R(66, 58, 74, 86, "#5a5a5a")           # stone pier
    return im

for size, pad, name in [(192, 18, "icon-192.png"), (512, 48, "icon-512.png"), (512, 96, "icon-maskable-512.png"), (180, 16, "apple-touch-icon.png")]:
    icon(size, pad).save(os.path.join(OUT, name))
print("icons written to", os.path.abspath(OUT))

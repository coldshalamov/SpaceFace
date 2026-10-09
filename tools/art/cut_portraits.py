"""Cut one chosen variant of a 2-up portrait sheet into the two square portraits the game loads.

  python tools/art/cut_portraits.py --sheet <v?/out.png> --left assets/portraits/locals/barkeep_01.jpg --right assets/portraits/locals/barkeep_02.jpg [--top 60]

A sheet is 1536x1024 holding two 768x1024 frames side by side; each is cropped to a 768 square, starting `--top` px
down so the face (upper-middle of the frame) stays in the picture. Deterministic.
"""
import argparse, os
from PIL import Image

ap = argparse.ArgumentParser()
ap.add_argument('--sheet', required=True)
ap.add_argument('--left'); ap.add_argument('--right')
ap.add_argument('--top', type=int, default=60)
ap.add_argument('--size', type=int, default=768)
a = ap.parse_args()
im = Image.open(a.sheet).convert('RGB')
half = im.width // 2
for name, x0 in ((a.left, 0), (a.right, half)):
    if not name:
        continue
    side = min(half, im.height - a.top)
    box = (x0 + (half - side) // 2, a.top, x0 + (half - side) // 2 + side, a.top + side)
    out = im.crop(box).resize((a.size, a.size), Image.LANCZOS)
    os.makedirs(os.path.dirname(name) or '.', exist_ok=True)
    out.save(name, 'JPEG', quality=90, optimize=True)
    print(name, out.size)

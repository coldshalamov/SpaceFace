"""finish_title_backdrop — grade and export the rendered title picture.

    python assets/ui/deckplate/tools/finish_title_backdrop.py <render.png>

The gas giant recedes behind the hull (desaturated, darkened inside its disc), then the plate is
written as assets/ui/backdrops/backdrop-title.jpg at the render's size (2560x1440): the title draws
it with background-size: cover, so one plate serves 1280 to 2560 wide.
"""
import os
import sys

import numpy as np
from PIL import Image

ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "..", ".."))
OUT = os.path.join(ROOT, "assets", "ui", "backdrops", "backdrop-title.jpg")
# The planet's disc in the 2560x1440 render (render_title_backdrop.py frames it at u .84, v .80).
PLANET = (2154.0, 285.0, 179.0)


def main(path, name="backdrop-title.jpg"):
    a = np.asarray(Image.open(path).convert("RGB")).astype(np.float32) / 255.0
    h, w, _ = a.shape
    sx = w / 2560.0
    cx, cy, r = PLANET[0] * sx, PLANET[1] * sx, PLANET[2] * sx
    yy, xx = np.mgrid[0:h, 0:w]
    mask = np.clip((r + 8 - np.sqrt((yy - cy) ** 2 + (xx - cx) ** 2)) / 16.0, 0, 1)[..., None]
    lum = a.mean(axis=2, keepdims=True)
    graded = (lum + (a - lum) * 0.55) * 0.74
    out = a * (1 - mask) + graded * mask
    dest = os.path.join(os.path.dirname(OUT), name)
    Image.fromarray(np.clip(out * 255, 0, 255).astype(np.uint8)).save(
        dest, quality=86, optimize=True, progressive=True, subsampling=0)
    print(f"{dest}  {w}x{h}  {os.path.getsize(dest) // 1024} KB")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else "backdrop-title.jpg")

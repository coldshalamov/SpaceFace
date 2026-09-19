"""grade_plate — re-grade a rendered backdrop plate: warm subject, cold void.

The title plate (a Blender render of the title scene, assets/ui/backdrops/backdrop-title.jpg) read
as one warm-brown value end to end — the owner's "strange wood look". This grade keeps the warm key
light where it lands (the lit hull, the rock face, the worklights) and moves the haze, the sky and
the shadows to deep cold space, so the machine reads against the void instead of dissolving into it.

    python assets/ui/deckplate/tools/grade_plate.py              # all plates in PLATES

Sources are preserved beside this script (src/*.src.jpg), so a re-grade never compounds.
"""
from __future__ import annotations

import os

import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..', '..', '..'))

PLATES = {
    # source (kept beside this tool)          -> the plate the game loads
    'src/backdrop-title.src.jpg': 'assets/ui/backdrops/backdrop-title.jpg',
}

COLD = np.array([0.66, 0.78, 1.06])    # the void: slate blue, a touch of violet in the darks
LIFT = np.array([0.010, 0.012, 0.020])  # the blacks are space, never pure black


def smoothstep(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0.0, 1.0)
    return t * t * (3.0 - 2.0 * t)


def grade(rgb: np.ndarray) -> np.ndarray:
    lum = rgb @ np.array([0.2126, 0.7152, 0.0722])
    # Keep: bright AND warm pixels are the key light on the subject (and the practicals).
    warm = np.clip((rgb[..., 0] - rgb[..., 2]) * 3.0, 0.0, 1.0)
    keep = smoothstep(0.10, 0.34, lum) * (0.2 + 0.8 * warm)
    # The void: luminance re-tinted cold, slightly deepened so the haze band falls away.
    cold = (lum[..., None] ** 1.02) * COLD * 1.14 + LIFT
    # A little of the original warmth survives in the mids so the light still "comes from" the sun.
    mids = smoothstep(0.06, 0.24, lum)[..., None] * 0.22
    out = cold * (1.0 - keep[..., None]) + rgb * keep[..., None]
    out = out * (1.0 - mids) + rgb * mids
    return np.clip(out, 0.0, 1.0)


def main() -> None:
    for src_rel, dst_rel in PLATES.items():
        src = os.path.join(HERE, src_rel)
        dst = os.path.join(ROOT, dst_rel)
        img = Image.open(src).convert('RGB')
        rgb = np.asarray(img).astype(np.float64) / 255.0
        out = (grade(rgb) * 255.0 + 0.5).astype(np.uint8)
        Image.fromarray(out, 'RGB').save(dst, quality=88, optimize=True, progressive=True)
        mean = out.reshape(-1, 3).mean(0).round(1)
        print(f'{dst_rel}: {img.size[0]}x{img.size[1]}  mean rgb {mean}  {os.path.getsize(dst) // 1024} KB')


if __name__ == '__main__':
    main()

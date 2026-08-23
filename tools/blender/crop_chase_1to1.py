"""Crop chase stills to a square around non-backdrop pixels.

Usage:
  python tools/blender/crop_chase_1to1.py --dir <stills_dir>
"""
from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np
from PIL import Image

NAMES = (
    "play_chase.png",
    "play_chase_abeam.png",
    "play_chase_close.png",
    "clay_play_chase.png",
    "clay_play_chase_close.png",
)


def crop_square(path: Path, pad: int = 18, luma_delta: float = 0.045) -> Path | None:
    image = Image.open(path).convert("RGB")
    arr = np.asarray(image).astype(np.float32) / 255.0
    h, w, _ = arr.shape
    corners = np.concatenate(
        [
            arr[0:8, 0:8].reshape(-1, 3),
            arr[0:8, -8:].reshape(-1, 3),
            arr[-8:, 0:8].reshape(-1, 3),
            arr[-8:, -8:].reshape(-1, 3),
        ]
    )
    backdrop = corners.mean(axis=0)
    luma = arr.max(axis=2)
    delta = np.abs(arr - backdrop).max(axis=2)
    mask = (delta > luma_delta) | (np.abs(luma - backdrop.max()) > luma_delta)
    ys, xs = np.where(mask)
    if ys.size < 40:
        return None
    y0 = max(int(ys.min()) - pad, 0)
    y1 = min(int(ys.max()) + pad + 1, h)
    x0 = max(int(xs.min()) - pad, 0)
    x1 = min(int(xs.max()) + pad + 1, w)
    side = max(y1 - y0, x1 - x0, 64)
    cx = (x0 + x1) // 2
    cy = (y0 + y1) // 2
    x0 = max(cx - side // 2, 0)
    y0 = max(cy - side // 2, 0)
    x1 = min(x0 + side, w)
    y1 = min(y0 + side, h)
    x0 = max(x1 - side, 0)
    y0 = max(y1 - side, 0)
    crop = image.crop((x0, y0, x1, y1))
    out = path.with_name(path.stem + "_1to1.png")
    crop.save(out)
    return out


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--dir", required=True, type=Path)
    args = parser.parse_args()
    folder = args.dir.resolve()
    written = []
    for name in NAMES:
        path = folder / name
        if path.is_file():
            out = crop_square(path)
            if out:
                written.append(str(out))
    print("\n".join(written) if written else "no crops")


if __name__ == "__main__":
    main()

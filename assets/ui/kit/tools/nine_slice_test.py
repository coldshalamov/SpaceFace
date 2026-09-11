"""nine_slice_test — the stretch test (03_CONVENTIONS.md §7.3).

Reproduces exactly what CSS `border-image` does: nine regions, corners untouched, edges tiled
or stretched along one axis, middle stretched both ways. If a plate's corners smear or its
middle carries a pattern that breaks when scaled, it shows here.

Usage:  python nine_slice_test.py <png> --slice T,R,B,L [--out dir]
        python nine_slice_test.py <dir>  --manifest <manifest.json> [--out dir]
"""
from __future__ import annotations

import argparse
import json
import pathlib

from PIL import Image

GROUND = (0x0C, 0x0A, 0x08, 255)


def nine_slice(im: Image.Image, slc: tuple[int, int, int, int], w: int, h: int,
               repeat: bool = False) -> Image.Image:
    """slc = (top, right, bottom, left) in the image's own pixels."""
    t, r, b, left = slc
    W, H = im.size
    assert w >= left + r and h >= t + b, f"target {w}x{h} smaller than the slice frame"
    out = Image.new("RGBA", (w, h), (0, 0, 0, 0))

    def part(box):
        return im.crop(box)

    def place(src, box_w, box_h, x, y, tile_axis=None):
        if box_w <= 0 or box_h <= 0:
            return
        if repeat and tile_axis:
            tiled = Image.new("RGBA", (box_w, box_h), (0, 0, 0, 0))
            sw, sh = src.size
            for ty in range(0, box_h, sh if tile_axis in ("y", "xy") else box_h):
                for tx in range(0, box_w, sw if tile_axis in ("x", "xy") else box_w):
                    tiled.alpha_composite(src, (tx, ty))
            out.alpha_composite(tiled, (x, y))
        else:
            out.alpha_composite(src.resize((box_w, box_h), Image.LANCZOS), (x, y))

    mid_w, mid_h = w - left - r, h - t - b
    # corners — never scaled
    out.alpha_composite(part((0, 0, left, t)), (0, 0))
    out.alpha_composite(part((W - r, 0, W, t)), (w - r, 0))
    out.alpha_composite(part((0, H - b, left, H)), (0, h - b))
    out.alpha_composite(part((W - r, H - b, W, H)), (w - r, h - b))
    # edges
    place(part((left, 0, W - r, t)), mid_w, t, left, 0, "x")
    place(part((left, H - b, W - r, H)), mid_w, b, left, h - b, "x")
    place(part((0, t, left, H - b)), left, mid_h, 0, t, "y")
    place(part((W - r, t, W, H - b)), r, mid_h, w - r, t, "y")
    # middle
    place(part((left, t, W - r, H - b)), mid_w, mid_h, left, t, "xy")
    return out


def contact(im: Image.Image, slc, name: str, out_dir: pathlib.Path) -> pathlib.Path:
    W, H = im.size
    variants = [("1x1", W, H), ("2x wide", W * 2, H), ("3x tall", W, H * 3), ("2x3", W * 2, H * 3)]
    pad = 24
    total_w = sum(v[1] for v in variants) + pad * (len(variants) + 1)
    total_h = max(v[2] for v in variants) + pad * 2
    sheet = Image.new("RGBA", (total_w, total_h), GROUND)
    x = pad
    for _label, vw, vh in variants:
        sheet.alpha_composite(nine_slice(im, slc, vw, vh), (x, pad))
        x += vw + pad
    out_dir.mkdir(parents=True, exist_ok=True)
    p = out_dir / f"stretch-{name}.png"
    sheet.save(p)
    return p


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("target")
    ap.add_argument("--slice", help="T,R,B,L")
    ap.add_argument("--manifest")
    ap.add_argument("--out", default="stretch")
    a = ap.parse_args()
    out_dir = pathlib.Path(a.out)
    jobs = []
    if a.manifest:
        man = json.loads(pathlib.Path(a.manifest).read_text(encoding="utf-8"))
        base = pathlib.Path(a.target)
        for asset in man["assets"]:
            if asset.get("kind") == "9slice" and asset.get("slice"):
                s = asset["slice"]
                jobs.append((base / asset["file"], (s["top"], s["right"], s["bottom"], s["left"]),
                             asset["id"]))
    else:
        t, r, b, left = (int(v) for v in a.slice.split(","))
        p = pathlib.Path(a.target)
        jobs.append((p, (t, r, b, left), p.stem))
    for path, slc, name in jobs:
        im = Image.open(path).convert("RGBA")
        print(f"  {name}: {contact(im, slc, name, out_dir)}")
    print(f"\n{len(jobs)} plate(s) stretched -> {out_dir}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

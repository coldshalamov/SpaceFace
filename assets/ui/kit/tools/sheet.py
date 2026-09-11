"""sheet — labelled contact sheets on the ground colour (03_CONVENTIONS.md §2, §7.6).

Every raster set ships one `_contact-sheet.png` showing every asset at @1x on the ground,
labelled with its filename. This also serves the family check: laid out together, an asset
that does not belong is obvious.

Usage:
    python sheet.py <dir> [--out <dir>/_contact-sheet.png] [--cols N] [--ground hex]
    python sheet.py <dir> --rows-by-prefix     # one row per control, states across
"""
from __future__ import annotations

import argparse
import pathlib
import re

from PIL import Image, ImageDraw

import fontkit

GROUND = "#0C0A08"
BONE = "#EAE6DF"
DIM = "#7A736B"


def _hex(s: str) -> tuple[int, int, int, int]:
    s = s.lstrip("#")
    return (int(s[0:2], 16), int(s[2:4], 16), int(s[4:6], 16), 255)


def build(files: list[pathlib.Path], out: pathlib.Path, cols: int = 6,
          ground: str = GROUND, title: str | None = None,
          rows: list[tuple[str, list[pathlib.Path]]] | None = None) -> pathlib.Path:
    label = fontkit.role("legend", 15)
    head = fontkit.role("display", 26)
    pad, gap, label_h = 28, 20, 26

    if rows is None:
        rows = []
        for i in range(0, len(files), cols):
            rows.append(("", files[i:i + cols]))

    loaded = {p: Image.open(p).convert("RGBA") for _, group in rows for p in group}
    row_boxes = []
    for name, group in rows:
        cw = max((loaded[p].width for p in group), default=0)
        ch = max((loaded[p].height for p in group), default=0)
        row_boxes.append((name, group, cw, ch))

    head_h = 56 if title else 0
    width = pad * 2 + max(
        (len(g) * (cw + gap) - gap for _n, g, cw, _ch in row_boxes), default=400)
    width = max(width, 640)
    height = head_h + pad * 2 + sum(ch + label_h + gap + (22 if n else 0)
                                    for n, _g, _cw, ch in row_boxes)

    sheet = Image.new("RGBA", (width, height), _hex(ground))
    d = ImageDraw.Draw(sheet)
    y = pad
    if title:
        d.text((pad, y), title.upper(), font=head, fill=_hex(BONE))
        y += head_h

    for name, group, cw, ch in row_boxes:
        if name:
            d.text((pad, y), name.upper(), font=label, fill=_hex(DIM))
            y += 22
        x = pad
        for p in group:
            im = loaded[p]
            sheet.alpha_composite(im, (x + (cw - im.width) // 2, y + (ch - im.height) // 2))
            txt = re.sub(r"@2x$", "", p.stem)
            d.text((x, y + ch + 6), txt, font=label, fill=_hex(DIM))
            x += cw + gap
        y += ch + label_h + gap

    out.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(out)
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("dir")
    ap.add_argument("--out")
    ap.add_argument("--cols", type=int, default=6)
    ap.add_argument("--ground", default=GROUND)
    ap.add_argument("--title")
    ap.add_argument("--rows-by-prefix", action="store_true")
    a = ap.parse_args()

    src = pathlib.Path(a.dir)
    files = sorted(p for p in src.glob("*.png")
                   if not p.stem.startswith("_") and not p.stem.endswith("@2x"))
    out = pathlib.Path(a.out) if a.out else src / "_contact-sheet.png"

    rows = None
    if a.rows_by_prefix:
        groups: dict[str, list[pathlib.Path]] = {}
        for p in files:
            key = p.stem.split("-")[0] if "-" in p.stem else p.stem
            groups.setdefault(key, []).append(p)
        rows = sorted(groups.items())

    print(f"  {build(files, out, a.cols, a.ground, a.title or src.name, rows)}  ({len(files)} assets)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

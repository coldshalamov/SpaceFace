"""crops — 100 % crop sheets of every distinct element in the approved frames.

P01 and P02 both require these: the code that rebuilds a screen is built from the crops, not
from the whole frame, so the crops have to be at 100 % and labelled. Cropping regions are
declared here against the same layout numbers the compositors use.

    python crops.py
"""
from __future__ import annotations

import pathlib
import sys

from PIL import Image, ImageDraw

HERE = pathlib.Path(__file__).resolve().parent
if str(HERE) not in sys.path:
    sys.path.insert(0, str(HERE))

import fh_compose as C          # noqa: E402
import fontkit                  # noqa: E402

APPROVED = C.REPO / "design" / "frontend" / "direction" / "approved"

SHEETS = {
    "crops-title": ("frame-title-v2", [
        ("wordmark (Archivo Expanded 900, ~188 px cap, produced stencil)", 100, 90, 780, 210),
        ("legend rail + the focused word, lit", 96, 316, 620, 130),
        ("a resting menu word at 62% bone", 210, 500, 500, 76),
        ("a disabled word at 38% bone (no save, so CONTINUE is unlit)", 210, 416, 500, 76),
        ("status strip: a backlit legend on its own plate", 190, 940, 560, 74),
        ("save line + version + status light", 100, 1008, 700, 64),
    ]),
    "crops-crucible": ("frame-crucible-door", [
        ("title, stencil marking at 160 px", 96, 60, 700, 190),
        ("a mode tile, selected: smoked glass + backlit legend", 96, 206, 168, 152),
        ("a mode tile at rest", 240, 206, 168, 152),
        ("row legend, blurb and the aside", 60, 292, 620, 66),
        ("arena tiles: imaged, never a row of words", 60, 470, 470, 120),
        ("the seed readout and the New seed key", 96, 906, 380, 110),
        ("Launch: ONE machined key with live safety paint", 1448, 890, 400, 120),
        ("Records & challenges: a fine backlit legend with a chevron", 96, 992, 380, 60),
    ]),
    "crops-hud": ("frame-hud-resting", [
        ("comms tape with end caps", 1090, 52, 260, 50),
        ("sector-law badge: crest well, safety strip, two legend slots", 1580, 52, 300, 130),
        ("contacts: an engraved list on a smoked plate", 1566, 222, 320, 230),
        ("radar: smoked face, etched bezel, rings, class glyphs", 1540, 700, 340, 350),
        ("objective plate with a lit chevron", 36, 456, 400, 100),
        ("status: ten light wells in an engraved strip", 36, 384, 260, 70),
        ("ship block: segmented bars with tabular numerals", 36, 906, 320, 130),
        ("speed: a real gauge, hero numeral in a smoked window", 362, 856, 380, 220),
        ("action bar: sockets in an etched group bracket", 620, 920, 700, 130),
        ("band / comms / hail legend tabs, and the log line", 36, 52, 460, 100),
        ("world tag on the ship", 1078, 586, 250, 50),
    ]),
    "crops-hud-wanted": ("frame-hud-wanted", [
        ("the badge flips to WANTED on live safety paint", 1580, 52, 300, 130),
        ("the radar face cools; contacts turn hostile", 1540, 700, 340, 350),
        ("the backlights go cold white-blue", 36, 52, 460, 100),
        ("the bars go cold", 36, 906, 320, 130),
    ]),
}

PAD, GAP, LABEL_H = 26, 22, 30


def build(name, frame_id, regions):
    src = Image.open(APPROVED / "frames" / ("%s.png" % frame_id)).convert("RGBA")
    face = fontkit.role("legend", 14)
    crops = []
    for label, x, y, w, h in regions:
        box = (max(0, x), max(0, y), min(src.width, x + w), min(src.height, y + h))
        crops.append((label, src.crop(box)))

    width = PAD * 2 + max(c.width for _l, c in crops)
    height = PAD + sum(c.height + LABEL_H + GAP for _l, c in crops) + 40
    sheet = Image.new("RGBA", (width, height), (0x0C, 0x0A, 0x08, 255))
    d = ImageDraw.Draw(sheet)
    head = fontkit.role("display", 22)
    d.text((PAD, PAD - 6), name.replace("crops-", "").upper() + "  ·  100 % CROPS",
           font=head, fill=(0xEA, 0xE6, 0xDF, 255))
    y = PAD + 40
    for label, crop in crops:
        d.text((PAD, y), label.upper(), font=face, fill=(0x8A, 0x82, 0x78, 255))
        y += LABEL_H
        sheet.alpha_composite(crop, (PAD, y))
        y += crop.height + GAP
    out = APPROVED / "crops" / ("%s.png" % name)
    out.parent.mkdir(parents=True, exist_ok=True)
    sheet.convert("RGB").save(out)
    print("  %s  (%d crops, %dx%d)" % (out, len(crops), *sheet.size))
    return out


if __name__ == "__main__":
    for name, (frame_id, regions) in SHEETS.items():
        if (APPROVED / "frames" / ("%s.png" % frame_id)).exists():
            build(name, frame_id, regions)
        else:
            print("  SKIP %s (no %s)" % (name, frame_id))

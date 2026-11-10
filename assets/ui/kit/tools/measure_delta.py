"""measure_delta — how far the prototype sits from its approved frame, in pixels.

`_compare.html` shows the delta; this measures it. Cross-correlates the frame's interface
layer (alpha) against the prototype's capture (luminance) over named regions and reports the
vertical offset with the best overlap, so an alignment fix is a measured number rather than a
guess at a flex box's half-leading.

    python measure_delta.py [screen ...]
"""
from __future__ import annotations

import pathlib
import sys

import numpy as np
from PIL import Image

KIT = pathlib.Path(__file__).resolve().parents[1]
REPO = KIT.parents[2]
APPROVED = REPO / "design" / "frontend" / "direction" / "approved"
SHOTS = REPO / ".devshots" / "delegate-20260910" / "scratch" / "pq-194" / "build" / "screens"

REGIONS = {
    "title": ("layer-title-v2", "title", [
        ("wordmark", 80, 260, 130, 1280),
        ("NEW GAME", 330, 420, 232, 560),
        ("QUIT GAME", 750, 850, 232, 620),
        ("status strip", 940, 1010, 200, 700),
        ("save + version", 1005, 1070, 110, 700),
    ]),
    "crucible-door": ("layer-crucible-door", "crucible-door", [
        ("title", 50, 240, 100, 760),
        ("mode tiles", 346, 478, 96, 520),
        ("arena tiles", 806, 938, 96, 520),
        ("launch key", 890, 1000, 1440, 1860),
    ]),
    "hud": ("layer-hud-resting", "hud", [
        ("law badge", 50, 190, 1570, 1890),
        ("contacts", 220, 460, 1560, 1890),
        ("objective", 450, 570, 30, 440),
        ("ship block", 900, 1050, 30, 350),
        ("action bar", 920, 1050, 600, 1330),
    ]),
}


def best_dy(layer, proto, y0, y1, x0, x1, span=90):
    a = (layer[y0:y1, x0:x1] > 60).astype(float)
    if a.sum() < 50:
        return None, 0.0
    best, bdy = -1.0, 0
    for dy in range(-span // 2, span):
        b = (proto[y0 + dy:y1 + dy, x0:x1] > 140).astype(float)
        if b.shape != a.shape:
            continue
        denom = np.sqrt((a * a).sum() * (b * b).sum()) + 1e-6
        s = float((a * b).sum() / denom)
        if s > best:
            best, bdy = s, dy
    return bdy, best


def main(names):
    worst = 0
    for name in names:
        layer_id, shot_id, regions = REGIONS[name]
        lp = APPROVED / "layers" / ("%s.png" % layer_id)
        sp = SHOTS / ("%s.png" % shot_id)
        if not lp.exists() or not sp.exists():
            print("  SKIP %s (missing layer or capture)" % name)
            continue
        layer = np.asarray(Image.open(lp).convert("RGBA"))[..., 3].astype(float)
        proto = np.asarray(Image.open(sp).convert("RGB")).astype(float).mean(axis=2)
        print("%s:" % name)
        for label, y0, y1, x0, x1 in regions:
            dy, ov = best_dy(layer, proto, y0, y1, x0, x1)
            if dy is None:
                print("    %-16s no ink in the layer region" % label)
                continue
            flag = "" if abs(dy) <= 4 else "   <-- OFF BY %d px" % dy
            worst = max(worst, abs(dy))
            print("    %-16s dy %+3d px   overlap %.3f%s" % (label, dy, ov, flag))
    print("\nworst vertical delta: %d px" % worst)
    return 0 if worst <= 4 else 1


if __name__ == "__main__":
    raise SystemExit(main([a for a in sys.argv[1:] if a in REGIONS] or list(REGIONS)))

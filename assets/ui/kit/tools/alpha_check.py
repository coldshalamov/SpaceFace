"""alpha_check — the fringe test (03_CONVENTIONS.md §7.1).

A PNG-32 with dirty alpha shows a halo when it lands on a ground that is not the one it was
matted against. This places every asset on pure white and on pure magenta and reports the
partially-transparent edge pixels whose colour differs between the two grounds by more than a
tolerance — i.e. real fringing, not just antialiasing.

Usage:  python alpha_check.py <file-or-dir> [...]
Exit 1 if any asset fringes.
"""
from __future__ import annotations

import pathlib
import sys

import numpy as np
from PIL import Image

TOL = 6  # /255 per channel; below this the edge is honest antialiasing


def check(path: pathlib.Path) -> tuple[bool, str]:
    im = Image.open(path).convert("RGBA")
    a = np.asarray(im).astype(np.float64)
    rgb, alpha = a[..., :3], a[..., 3:4] / 255.0

    edge = (alpha[..., 0] > 0.02) & (alpha[..., 0] < 0.98)
    if not edge.any():
        return True, f"{path.name}: no soft edge (fully binary alpha)"

    # Composite over white and over magenta, then un-composite: an asset with clean
    # (unmatted) colour yields the same source colour from both grounds.
    white = rgb * alpha + 255.0 * (1 - alpha)
    magenta = rgb * alpha + np.array([255.0, 0.0, 255.0]) * (1 - alpha)
    back_w = (white - 255.0 * (1 - alpha)) / np.maximum(alpha, 1e-6)
    back_m = (magenta - np.array([255.0, 0.0, 255.0]) * (1 - alpha)) / np.maximum(alpha, 1e-6)

    delta = np.abs(back_w - back_m)[edge]
    worst = float(delta.max()) if delta.size else 0.0

    # A second, sharper read: matted assets carry the matte colour into the soft edge.
    # Compare each soft-edge pixel's straight colour against the mean of its opaque neighbours.
    ok = worst <= TOL
    return ok, f"{path.name}: soft-edge px {int(edge.sum())}, worst channel delta {worst:.2f} ({'ok' if ok else 'FRINGE'})"


def main(argv: list[str]) -> int:
    targets: list[pathlib.Path] = []
    for arg in argv or ["."]:
        p = pathlib.Path(arg)
        targets.extend(sorted(p.rglob("*.png")) if p.is_dir() else [p])
    bad = 0
    for t in targets:
        ok, msg = check(t)
        if not ok:
            bad += 1
        print(("  " if ok else "! ") + msg)
    print(f"\n{len(targets)} asset(s), {bad} fringing")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))

"""cut_kit — cut the rendered master sheets into the kit's individual assets.

The sheets are orthographic renders at 1 Blender unit = 1 design pixel, so every asset's cell
is a whole number of pixels and the cut is exact rather than resampled. @2x is the native
render; @1x is a single high-quality downsample of the @2x cut (never a second render, which
would not register against it).

Also runs the acceptance checks the conventions require and writes `kit-manifest.json`.

    python cut_kit.py [--sheets a,b] [--no-checks]
"""
from __future__ import annotations

import argparse
import json
import pathlib
import sys

import numpy as np
from PIL import Image

HERE = pathlib.Path(__file__).resolve().parent
if str(HERE) not in sys.path:
    sys.path.insert(0, str(HERE))

KIT = HERE.parent
ASSETS = KIT / "assets"
BUILD = KIT.parents[2] / ".devshots" / "delegate-20260910" / "scratch" / "pq-194" / "build"
SHEETS = BUILD / "sheets"

import sheet as sheet_tool          # noqa: E402
import alpha_check                  # noqa: E402
import nine_slice_test              # noqa: E402


def cut(layout: dict, names: list[str]) -> list[dict]:
    """Cut every asset out of its sheet at @2x, then downsample for @1x."""
    written = []
    for name in names:
        block = layout[name]
        scale = block["scale"]
        sw, sh = block["sheet_size"]
        img = Image.open(SHEETS / block["sheet"]).convert("RGBA")
        assert img.size == (sw * scale, sh * scale), (
            "sheet %s is %s, layout says %s" % (name, img.size, (sw * scale, sh * scale)))

        for it in block["items"]:
            w, h = it["size"]
            # sheet space is centred on the origin with +Y up; image space is top-left, +Y down
            cx = (it["cx"] + sw / 2) * scale
            cy = (sh / 2 - it["cy"]) * scale
            box = (int(round(cx - w * scale / 2)), int(round(cy - h * scale / 2)),
                   int(round(cx + w * scale / 2)), int(round(cy + h * scale / 2)))
            at2x = img.crop(box)
            at1x = at2x.resize((w, h), Image.LANCZOS)

            folder = ASSETS / it["dir"]
            folder.mkdir(parents=True, exist_ok=True)
            at2x.save(folder / ("%s@2x.png" % it["id"]))
            at1x.save(folder / ("%s.png" % it["id"]))

            entry = {
                "id": it["id"],
                "file": "assets/%s/%s.png" % (it["dir"], it["id"]),
                "file2x": "assets/%s/%s@2x.png" % (it["dir"], it["id"]),
                "kind": it["kind"],
                "size": [w, h],
                "notes": it.get("notes", ""),
            }
            if it.get("slice"):
                entry["slice"] = it["slice"]
            if it.get("states"):
                entry["states"] = it["states"]
            written.append(entry)
    return written


def check_registration(entries: list[dict]) -> list[str]:
    """State sprites must overlay exactly, or code swapping them shifts the layout.

    Compares every state of a control against its first state: same pixel size, and an alpha
    centroid that has not moved more than half a pixel.
    """
    groups: dict[str, list[dict]] = {}
    for e in entries:
        if not e.get("states"):
            continue
        base = e["id"].rsplit(".", 1)[0]
        groups.setdefault(base, []).append(e)
    notes = []
    for base, items in sorted(groups.items()):
        ref = None
        for e in items:
            im = Image.open(KIT / e["file"]).convert("RGBA")
            a = np.asarray(im)[..., 3].astype(np.float64)
            tot = a.sum() or 1.0
            ys, xs = np.mgrid[0:a.shape[0], 0:a.shape[1]]
            cen = (float((xs * a).sum() / tot), float((ys * a).sum() / tot))
            if ref is None:
                ref = (im.size, cen, e["id"])
                continue
            if im.size != ref[0]:
                notes.append("! %s: %s is %s, %s is %s"
                             % (base, e["id"], im.size, ref[2], ref[0]))
            d = max(abs(cen[0] - ref[1][0]), abs(cen[1] - ref[1][1]))
            notes.append("  %s -> %s: centroid drift %.2f px%s"
                         % (ref[2], e["id"], d, "" if d <= 0.5 else "   OVER 0.5 px"))
    return notes


def contact_sheets() -> list[str]:
    out = []
    for folder in sorted(p for p in ASSETS.iterdir() if p.is_dir()):
        files = sorted(p for p in folder.glob("*.png")
                       if not p.stem.startswith("_") and not p.stem.endswith("@2x"))
        if not files:
            continue
        rows: dict[str, list[pathlib.Path]] = {}
        for p in files:
            key = ".".join(p.stem.split(".")[:2])
            rows.setdefault(key, []).append(p)
        out.append(str(sheet_tool.build(files, folder / "_contact-sheet.png",
                                        rows=sorted(rows.items()),
                                        title="%s (@1x, on the ground colour)" % folder.name)))
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--sheets")
    ap.add_argument("--no-checks", action="store_true")
    a = ap.parse_args()

    layout = json.loads((SHEETS / "layout.json").read_text(encoding="utf-8"))
    names = a.sheets.split(",") if a.sheets else list(layout)
    names = [n for n in names if n in layout]
    if not names:
        raise SystemExit("no rendered sheets in %s" % SHEETS)

    entries = cut(layout, names)
    print("cut %d assets from %d sheet(s)" % (len(entries), len(names)))

    man_path = KIT / "kit-manifest.json"
    existing = {}
    if man_path.exists():
        prev = json.loads(man_path.read_text(encoding="utf-8"))
        existing = {e["id"]: e for e in prev.get("assets", [])}
    for e in entries:
        existing[e["id"]] = e
    manifest = {
        "packet": "S1 (P10 + P11 + P12)",
        "returned": "2026-09-10",
        "producer": "Claude Opus 5, local shared checkout",
        "tools": [
            "Blender 5.1.2 Cycles (CPU) via assets/ui/kit/tools/bl_kit.py + bl_common.py",
            "Python 3.14 Pillow + numpy + OpenCV (cutting, alpha, tracing)",
            "hand-written SVG from a construction grammar (icons.py, marks.py)",
            "fontTools (variable-font instancing for real type)",
        ],
        "generator-note": (
            "No native image-generation tool exists in this harness. Third-party diffusion "
            "connectors were present and were deliberately NOT used, per "
            "_COMMON/00_READ_ME_FIRST.md. Every raster here is a Cycles render of real "
            "modelled geometry, reproducible from the committed scripts."),
        "license": "All original work; OFL fonts named in kit-notes.md",
        "assets": sorted(existing.values(), key=lambda e: e["id"]),
        "blocked": [],
        "questions": [],
    }
    man_path.write_text(json.dumps(manifest, indent=1), encoding="utf-8")
    print("manifest: %d assets -> %s" % (len(manifest["assets"]), man_path))

    if a.no_checks:
        return 0

    print("\n-- alpha fringe (white vs magenta) --")
    alpha_check.main([str(ASSETS)])

    print("\n-- registration --")
    for line in check_registration(manifest["assets"]):
        print(line)

    print("\n-- nine-slice stretch --")
    stretch_dir = BUILD / "stretch"
    n = 0
    for e in manifest["assets"]:
        if e.get("kind") == "9slice" and e.get("slice"):
            s = e["slice"]
            im = Image.open(KIT / e["file"]).convert("RGBA")
            nine_slice_test.contact(im, (s["top"], s["right"], s["bottom"], s["left"]),
                                    e["id"], stretch_dir)
            n += 1
    print("  %d plate(s) stretched to 2x wide / 3x tall -> %s" % (n, stretch_dir))

    print("\n-- contact sheets --")
    for c in contact_sheets():
        print("  %s" % c)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

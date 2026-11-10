"""svg_parts — the moving and data-driven instrument geometry, as SVG.

P12 is explicit that every part code rotates, masks or animates is **SVG geometry, not raster**:
a needle baked into a bezel is one of the fakes it names. These are those parts, each with a
documented pivot so a needle turns about the right point, written into `kit-manifest.json`
beside the raster assets.

    python svg_parts.py
"""
from __future__ import annotations

import json
import math
import pathlib

KIT = pathlib.Path(__file__).resolve().parents[1]
OUT = KIT / "assets" / "svg"

PARTS: list[dict] = []


def part(ident, folder, filename, viewbox, inner, pivot=None, notes=""):
    PARTS.append(dict(id=ident, dir=folder, file=filename, viewBox=viewbox,
                      pivot=pivot, notes=notes, svg=(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="%s" fill="none">%s</svg>'
        % (viewbox, inner))))


# ---------------------------------------------------------------- gauge

# The needle is drawn about its own pivot at 0,0 so a transform is `rotate(deg)` and nothing
# else — an offset pivot is how a needle ends up orbiting the bezel instead of turning in it.
part("gauge.speed.needle", "gauges", "gauge-speed-needle.svg", "-12 -80 24 100",
     '<path fill="currentColor" d="M-3.2,0 L-1.1,-74 L1.1,-74 L3.2,0 Z"/>'
     '<circle cx="0" cy="0" r="6.2" fill="currentColor"/>'
     '<circle cx="0" cy="0" r="2.4" fill="#100E0C"/>',
     pivot=[0, 0], notes="rotate about 0,0; -110deg at zero, +110deg at full scale")

ticks = []
for i in range(41):
    a = math.radians(200 - i * 5.0)
    major = i % 5 == 0
    r_out, ln = 158.0, 26.0 if major else 14.0
    x1, y1 = math.cos(a) * r_out, -math.sin(a) * r_out
    x2, y2 = math.cos(a) * (r_out - ln), -math.sin(a) * (r_out - ln)
    ticks.append('<path stroke="currentColor" stroke-width="%.1f" d="M%.2f,%.2f L%.2f,%.2f"/>'
                 % (3.0 if major else 1.6, x1, y1, x2, y2))
part("gauge.speed.ticks", "gauges", "gauge-speed-ticks.svg", "-180 -180 360 200",
     "".join(ticks), pivot=[0, 0],
     notes="the tick ring as paths, for lit-tick overlays; matches gauge.speed.bezel exactly")

# ---------------------------------------------------------------- radar

rings = "".join('<circle cx="160" cy="160" r="%d"/>' % r for r in (40, 80, 120))
part("radar.rings", "radar", "radar-rings.svg", "0 0 320 320",
     '<g stroke="currentColor" stroke-opacity="0.22" fill="none">%s'
     '<path d="M160 36V284M36 160H284"/></g>' % rings,
     pivot=[160, 160], notes="range rings at 40/80/120 and the cardinal ticks")

part("radar.sweep", "radar", "radar-sweep.svg", "0 0 320 320",
     '<defs><linearGradient id="fh-sweep" x1="0" y1="0" x2="1" y2="0">'
     '<stop offset="0" stop-color="currentColor" stop-opacity="0.34"/>'
     '<stop offset="1" stop-color="currentColor" stop-opacity="0"/>'
     '</linearGradient></defs>'
     '<path fill="url(#fh-sweep)" d="M160,160 L160,34 A126,126 0 0,1 249,71 Z"/>',
     pivot=[160, 160],
     notes="rotate about 160,160; the gradient stops are recolourable via currentColor")

part("socket.cooldown-ring", "sockets", "socket-cooldown-ring.svg", "0 0 56 56",
     '<circle cx="28" cy="28" r="23" stroke="currentColor" stroke-width="3" fill="none"'
     ' stroke-linecap="butt" stroke-dasharray="144.5" stroke-dashoffset="0"'
     ' transform="rotate(-90 28 28)"/>',
     pivot=[28, 28],
     notes="animate stroke-dashoffset 0 (full) to 144.5 (empty); circumference is 144.51")

# ---------------------------------------------------------------- reticles and wedges

part("reticle.rest", "reticle", "reticle-rest.svg", "0 0 56 56",
     '<g stroke="currentColor" stroke-opacity="0.7" stroke-width="2" fill="none">'
     '<path d="M28 8v12M28 36v12M8 28h12M36 28h12"/>'
     '<circle cx="28" cy="28" r="3"/></g>', pivot=[28, 28])
part("reticle.lock", "reticle", "reticle-lock.svg", "0 0 56 56",
     '<g stroke="currentColor" stroke-width="2.4" fill="none">'
     '<path d="M10 18V10h8M46 18V10h-8M10 38v8h8M46 38v8h-8"/>'
     '<circle cx="28" cy="28" r="5"/></g>', pivot=[28, 28],
     notes="the corner brackets close on lock; the centre ring is the second channel")
part("reticle.lead-pip", "reticle", "reticle-lead-pip.svg", "0 0 24 24",
     '<circle cx="12" cy="12" r="5.5" stroke="currentColor" stroke-width="2.2" fill="none"/>'
     '<circle cx="12" cy="12" r="1.6" fill="currentColor"/>', pivot=[12, 12],
     notes="placed at the lead solution; never at the target")
part("reticle.pro-tick", "reticle", "reticle-pro-tick.svg", "0 0 24 24",
     '<path stroke="currentColor" stroke-width="2" d="M12 3v6M12 15v6"/>', pivot=[12, 12])

part("damage.wedge", "gauges", "damage-wedge.svg", "0 0 120 120",
     '<path fill="currentColor" fill-opacity="0.85" d="M60,60 L60,6 A54,54 0 0,1 98,22 Z"/>',
     pivot=[60, 60], notes="one 45-degree wedge; code rotates it per damage quadrant")

# ---------------------------------------------------------------- dials, chevrons, tags

part("dial.small.needle", "gauges", "dial-small-needle.svg", "-8 -40 16 52",
     '<path fill="currentColor" d="M-2.2,0 L-0.8,-34 L0.8,-34 L2.2,0 Z"/>'
     '<circle cx="0" cy="0" r="4" fill="currentColor"/>', pivot=[0, 0])
scale = []
for i in range(25):
    a = math.radians(210 - i * 10.0)
    major = i % 6 == 0
    r_out, ln = 34.0, 8.0 if major else 4.0
    scale.append('<path stroke="currentColor" stroke-width="%.1f" d="M%.2f,%.2f L%.2f,%.2f"/>'
                 % (2.0 if major else 1.2, math.cos(a) * r_out, -math.sin(a) * r_out,
                    math.cos(a) * (r_out - ln), -math.sin(a) * (r_out - ln)))
part("dial.small.scale", "gauges", "dial-small-scale.svg", "-44 -44 88 88",
     "".join(scale), pivot=[0, 0])

part("objective.chevron", "plates", "objective-chevron.svg", "0 0 24 24",
     '<path fill="currentColor" d="M9,3.8 L17.8,12 L9,20.2 L5.6,16.8 L11,12 L5.6,7.2 Z"/>',
     pivot=[12, 12], notes="the same chevron construction as the icon family")

part("tag.leader", "tapes", "tag-leader.svg", "0 0 64 40",
     '<path stroke="currentColor" stroke-width="1.6" stroke-opacity="0.6" fill="none"'
     ' d="M2,38 L18,22 H62"/><circle cx="2" cy="38" r="2.4" fill="currentColor"/>',
     notes="the leader line from a world tag down to the thing it names")

part("focus.ring", "controls", "focus-ring.svg", "0 0 48 48",
     '<rect x="1.5" y="1.5" width="45" height="45" rx="4" stroke="#100E0C"'
     ' stroke-width="3" fill="none"/>'
     '<rect x="1.5" y="1.5" width="45" height="45" rx="4" stroke="currentColor"'
     ' stroke-width="2" fill="none"/>',
     notes="2 px bone over a 1 px dark keyline, so it survives on the darkest and the lightest "
           "plate (15.49:1 and 12.83:1); nine-sliceable at 6")


def main():
    written = []
    for p in PARTS:
        d = OUT / p["dir"]
        d.mkdir(parents=True, exist_ok=True)
        (d / p["file"]).write_text(p["svg"], encoding="utf-8")
        written.append({
            "id": p["id"],
            "file": "assets/svg/%s/%s" % (p["dir"], p["file"]),
            "kind": "svg",
            "viewBox": p["viewBox"],
            "pivot": p["pivot"],
            "notes": p["notes"],
        })

    # the twelve radar class glyphs as Path2D strings, which P12 names as its own file
    paths = json.loads((KIT / "icons" / "glyph-paths.json").read_text(encoding="utf-8"))
    classes = ["you", "fighter", "freighter", "miner", "patrol", "pirate", "derelict", "wreck",
               "station", "gate", "beacon", "asteroid"]
    (KIT / "assets" / "radar" / "radar-glyph-paths.json").write_text(
        json.dumps({c: paths[c] for c in classes}, indent=1), encoding="utf-8")

    # a <symbol> sprite of the same twelve, for the SVG radar
    syms = "".join(
        '<symbol id="radar-%s" viewBox="0 0 24 24">'
        '<path fill="currentColor" fill-rule="evenodd" d="%s"/></symbol>'
        % (c, "".join(paths[c])) for c in classes)
    (KIT / "assets" / "radar" / "radar-glyphs.svg").write_text(
        '<svg xmlns="http://www.w3.org/2000/svg" style="display:none">%s</svg>' % syms,
        encoding="utf-8")

    # fold the parts into the manifest beside the rasters
    man_path = KIT / "kit-manifest.json"
    man = json.loads(man_path.read_text(encoding="utf-8"))
    by_id = {a["id"]: a for a in man["assets"]}
    for w in written:
        by_id[w["id"]] = w
    by_id["radar.glyph-paths"] = {
        "id": "radar.glyph-paths", "file": "assets/radar/radar-glyph-paths.json",
        "kind": "script", "size": [24, 24],
        "notes": "12 contact-class glyphs as Path2D strings for the canvas radar"}
    by_id["radar.glyphs"] = {
        "id": "radar.glyphs", "file": "assets/radar/radar-glyphs.svg",
        "kind": "svg", "size": [24, 24],
        "notes": "the same twelve as <symbol>s, readable at 10 px"}
    man["assets"] = sorted(by_id.values(), key=lambda a: a["id"])
    man_path.write_text(json.dumps(man, indent=1), encoding="utf-8")
    print("%d SVG parts + radar glyph paths/sprite -> %s  (manifest now %d assets)"
          % (len(written), OUT, len(man["assets"])))


if __name__ == "__main__":
    main()

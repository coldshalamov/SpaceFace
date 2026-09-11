"""build_tokens_css — emit tokens.css from tokens.json.

Generated rather than hand-written so the two cannot drift: the JSON is what the contrast
proof, the manifest and the compositor read, and a CSS file typed separately would quietly
disagree with all three after the first correction.

    python build_tokens_css.py
"""
from __future__ import annotations

import json
import pathlib

HERE = pathlib.Path(__file__).resolve().parent
TOK = HERE.parent / "tokens"


def main():
    t = json.loads((TOK / "tokens.json").read_text(encoding="utf-8"))
    L = []
    add = L.append

    add("/* Field Hardware tokens — GENERATED from tokens.json by tools/build_tokens_css.py.")
    add(" * Do not edit by hand: edit tokens.json and re-run, or the contrast proof, the")
    add(" * manifest and the frame compositor will disagree with the stylesheet.")
    add(" *")
    add(" * Type sizes are px at a 1920-wide frame. The 1280 and 2560 steps are real media")
    add(" * queries below, and the 12 px floor is an accessibility floor, not a style choice.")
    add(" */")
    add(":root {")

    add("  /* colour */")
    for k, v in t["colour"].items():
        add("  --fh-%s: %s;" % (k, v["value"]))

    add("")
    add("  /* alpha levels — the light is the state, not a colour swap */")
    for k, v in t["alpha"].items():
        add("  --fh-a-%s: %s;" % (k, v))

    add("")
    add("  /* ready-made composited surfaces, so code never re-derives an alpha by hand */")
    c, a = t["colour"], t["alpha"]
    add("  --fh-text: %s;" % c["bone"]["value"])
    add("  --fh-text-resting: color-mix(in srgb, var(--fh-bone) %d%%, transparent);"
        % round(a["bone-resting"] * 100))
    add("  --fh-text-tertiary: color-mix(in srgb, var(--fh-bone) %d%%, transparent);"
        % round(a["bone-tertiary"] * 100))
    add("  --fh-legend-lit: var(--fh-legend);")
    add("  --fh-legend-rest: color-mix(in srgb, var(--fh-legend) %d%%, transparent);"
        % round(a["legend-resting"] * 100))
    add("  --fh-edge: color-mix(in srgb, var(--fh-edge-light) %d%%, transparent);"
        % round(a["edge-light"] * 100))

    add("")
    add("  /* type */")
    add("  --fh-face-display: Archivo, system-ui, sans-serif;")
    add("  --fh-face-text: 'Instrument Sans', system-ui, sans-serif;")
    for k, v in t["type"]["scale"].items():
        add("  --fh-size-%s: %dpx;" % (k, v))
    add("  --fh-track-display: %s;" % t["type"]["display"]["tracking"])
    add("  --fh-track-legend: %s;" % t["type"]["legend"]["tracking"])
    add("  --fh-lh-display: %s;" % t["type"]["display"]["lineHeight"])
    add("  --fh-lh-body: %s;" % t["type"]["body"]["lineHeight"])
    add("  --fh-measure: %s;" % t["type"]["body"]["measure"])

    add("")
    add("  /* spacing */")
    for k, v in t["space"].items():
        add("  --fh-space-%s: %dpx;" % (k, v))

    add("")
    add("  /* plate metrics — modelled values, 1 unit = 1 design pixel */")
    for k, v in t["plate"].items():
        if k.startswith("$") or isinstance(v, str):
            continue
        add("  --fh-plate-%s: %s;" % (k, ("%gpx" % v) if k not in ("grainOpacity",) else v))

    add("")
    add("  /* motion, per register */")
    for reg, vals in t["motion"].items():
        for k, v in vals.items():
            if isinstance(v, str) and not v.startswith("cubic"):
                continue
            unit = "ms" if isinstance(v, (int, float)) and k not in (
                "driftDegPerSec", "parallaxMaxPx", "pulseCount", "overshootFrames") else ""
            if k == "parallaxMaxPx":
                unit = "px"
            add("  --fh-%s-%s: %s%s;" % (reg, k, v, unit))
    add("}")

    add("")
    add("/* ×0.75 at 1280 with the 12 px floor applied per step */")
    add("@media (max-width: 1599px) {")
    add("  :root {")
    for k, v in t["type"]["scale1280"].items():
        add("    --fh-size-%s: %dpx;" % (k, v))
    add("  }")
    add("}")
    add("")
    add("/* ×1.25 at 2560 */")
    add("@media (min-width: 2200px) {")
    add("  :root {")
    for k, v in t["type"]["scale2560"].items():
        add("    --fh-size-%s: %dpx;" % (k, v))
    add("  }")
    add("}")

    add("")
    add("/* Temperature states change the whole frame, never one badge (§7). */")
    for name, vals in t["temperature"].items():
        if name.startswith("$"):
            continue
        sel = ":root" if name == "flight" else '[data-fh-temp="%s"]' % name
        add("%s {" % sel)
        sig = vals["signal"]
        leg = vals["legend"]
        add("  --fh-temp-key: %s;" % vals["key"])
        add("  --fh-temp-fill: %s;" % vals["fill"])
        add("  --fh-signal-now: %s;" % ("var(--fh-%s)" % sig if not sig.startswith("#") else sig))
        add("  --fh-legend-now: %s;" % ("var(--fh-%s)" % leg if not leg.startswith("#") else leg))
        add("}")

    add("")
    add("/* Reduced motion is a floor, not a preference toggle: every transition becomes a cut. */")
    add("@media (prefers-reduced-motion: reduce) {")
    add("  :root {")
    for reg in ("poster", "bench", "edge"):
        for k, v in t["motion"][reg].items():
            if isinstance(v, (int, float)) and k not in ("pulseCount", "overshootFrames",
                                                         "parallaxMaxPx", "driftDegPerSec"):
                add("    --fh-%s-%s: 0ms;" % (reg, k))
    add("    --fh-poster-parallaxMaxPx: 0px;")
    add("    --fh-poster-driftDegPerSec: 0;")
    add("  }")
    add("}")

    out = TOK / "tokens.css"
    out.write_text("\n".join(L) + "\n", encoding="utf-8")
    print("%s  (%d lines)" % (out, len(L)))


if __name__ == "__main__":
    main()

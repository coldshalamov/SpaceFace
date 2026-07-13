#!/usr/bin/env python3
"""Replace the harsh SUPERSEDED banner on prior agy reports with an accurate PARTIALLY-VERIFIED one."""
import sys

NEW_BANNER = """> ⚠ **PARTIALLY VERIFIED 2026-07-12 — see `design/depth-program/research/SALVAGE_NOTES.md` for what is usable.**
> This report was produced by an Antigravity (Gemini 3.5 Flash) sprint without source citation. Specific failure modes: counts are mislabeled samples (e.g. "Comprehensive 40 Hulls" for a game with 200+); exact numeric stats (Hull/Shield/Mass) are unsourced and likely recalled from memory. HOWEVER: the architectural descriptions, faction lists (partial), and conceptual pattern analysis are largely accurate when spot-checked against the cloned repos. Treat conceptual/architectural claims as a useful hypothesis; treat specific stats/counts as unverified pending the extraction in `design/depth-program/research/verified/`. Do not discard outright; do not trust specifics without re-verification.

"""

files = [
    "design/vision/research/endless_sky_audit.md",
    "design/vision/research/naev_audit.md",
    "design/vision/research/freelancer_audit.md",
    "design/vision/research/starsector_audit.md",
    "design/vision/research/no_mans_sky_audit.md",
    "design/vision/research/market_synthesis.md",
    "design/vision/ASSET_DEPTH_AND_PIPELINE_PLAN.md",
]

for path in files:
    try:
        with open(path, encoding="utf-8") as fh:
            text = fh.read()
    except FileNotFoundError:
        print(f"skip (missing): {path}")
        continue
    lines = text.split("\n")
    i = 0
    # strip a leading banner block (consecutive lines starting with '> ') plus one blank line after
    if lines and lines[0].startswith("> "):
        while i < len(lines) and lines[i].startswith("> "):
            i += 1
        if i < len(lines) and lines[i].strip() == "":
            i += 1
    body = "\n".join(lines[i:])
    with open(path, "w", encoding="utf-8") as fh:
        fh.write(NEW_BANNER + body)
    print(f"rebannered: {path}")

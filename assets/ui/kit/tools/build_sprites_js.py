"""build_sprites_js — emit sprites.js from the produced SVG sprites.

`<use href="#icon-x">` needs the sprite in the document, and fetching a local SVG is blocked
under `file://` — which every prototype in this return has to open from. So the sprites are
also emitted as a classic script that injects them. The SVGs stay the deliverable.
"""
import json
import pathlib

KIT = pathlib.Path(__file__).resolve().parents[1]
out = KIT / "kit" / "sprites.js"
parts = {}
for key, rel in (("icons24", "icons/_sprite-24.svg"),
                 ("icons32", "icons/_sprite-32.svg"),
                 ("icons48", "icons/_sprite-48.svg"),
                 ("marks", "marks/_sprite.svg")):
    p = KIT / rel
    if p.exists():
        parts[key] = p.read_text(encoding="utf-8")

out.write_text(
    "/* GENERATED from the produced SVG sprites by tools/build_sprites_js.py.\n"
    " * A classic script because fetching a local SVG is blocked under file://, and every\n"
    " * prototype here must open without a server. `all` is what FH.kit.init({sprite}) wants.\n"
    " */\n"
    "window.FH_SPRITES = " + json.dumps(parts, indent=1) + ";\n"
    "window.FH_SPRITES.all = (window.FH_SPRITES.icons24 || '') + (window.FH_SPRITES.marks || '');\n",
    encoding="utf-8")
print("%s  (%s)" % (out, ", ".join("%s %d KB" % (k, len(v) // 1024) for k, v in parts.items())))

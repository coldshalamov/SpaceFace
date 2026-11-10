"""build_sound_js — emit sound-recipes.js from sound-recipes.json.

`fetch` of a local JSON file is blocked under `file://`, and every prototype in this return has
to open without a server. The JSON is the deliverable; this is its classic-script loader shim,
generated so the two cannot disagree.
"""
import json
import pathlib

KIT = pathlib.Path(__file__).resolve().parents[1]
src = KIT / "kit" / "sound-recipes.json"
data = json.loads(src.read_text(encoding="utf-8"))
out = KIT / "kit" / "sound-recipes.js"
out.write_text(
    "/* GENERATED from sound-recipes.json by tools/build_sound_js.py.\n"
    " * A classic script, because `fetch` of a local JSON file is blocked under file:// and the\n"
    " * prototypes must open without a server. The JSON stays the deliverable; this is its\n"
    " * loader shim, and the two are built together so they cannot disagree.\n"
    " */\n"
    "window.FH_SOUND_RECIPES = " + json.dumps(data, indent=1) + ";\n",
    encoding="utf-8")
print("%s  (%d recipes)" % (out, len(data["recipes"])))

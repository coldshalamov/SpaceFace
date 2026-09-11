"""frame_title — compose the three Title style frames.

Strings are verbatim from `01_GAME_DOSSIER.md` §4. Nothing here invents a menu item, a number
or a name.

POSTER register (§3): the world fills the frame and is lit; one element is at least 120 px;
the words hang from one edge; the hardware is ONE element — a backlit legend rail — not a
panel set.

    python frame_title.py [v1|v2|v3|all]
"""
from __future__ import annotations

import pathlib
import sys

from PIL import Image

HERE = pathlib.Path(__file__).resolve().parent
if str(HERE) not in sys.path:
    sys.path.insert(0, str(HERE))

import fh_compose as C          # noqa: E402
import fontkit                  # noqa: E402

APPROVED = C.REPO / "design" / "frontend" / "direction" / "approved"

# ---- the exact live strings (01_GAME_DOSSIER.md §4 "Title") -----------------------------

WORDMARK = "SPACEFACE"
STATUS = "CONTRACT 47-A REMAINS OPEN"
SAVE_LINE = "No save found - New Game opens Contract 47-A in Helios."
MENU = ["NEW GAME", "CONTINUE", "LOAD GAME", "SETTINGS", "CRUCIBLE", "SIGNAL ARCHIVE",
        "QUIT GAME"]
FOCUSED = 0                     # NEW GAME is the focused item
VERSION = "v0.9.4 · build 2026.09.10"
DISABLED = {"CONTINUE"}         # no save found, so CONTINUE is unlit hardware

PLATES = {"v1": "title-v1-hangar", "v2": "title-v2-field", "v3": "title-v3-baydoor"}

# ---- layout at 1920x1080. The prototype reproduces these numbers in CSS. ----------------

L = dict(
    rail_x=112, rail_y=322, rail_w=64, rail_h=604,
    menu_x=232, menu_y=350, menu_step=84, menu_size=40,
    lit_w=560, lit_h=60,
    word_x=118, word_y=104, word_w=1180,
    status_x=232, status_y=962, status_h=44, status_size=15, status_pad=28,
    save_x=232, save_y=1018, save_size=16,
    ver_x=118, ver_y=1044, ver_size=12,
)


def compose(variant: str) -> tuple[Image.Image, Image.Image]:
    """Returns (interface layer on transparent, composite over the world plate)."""
    layer = Image.new("RGBA", (C.W, C.H), (0, 0, 0, 0))

    # -- the one piece of hardware: a backlit legend rail down the left edge ---------------
    rail = C.nine("plate.poster.rail", L["rail_w"], L["rail_h"])
    C.place(layer, rail, (L["rail_x"], L["rail_y"]))

    # -- the focused item: a machined row with an amber edge light and a soft spill --------
    #
    # Not a filled amber bar with a word on it: that reads as a highlighter, and §4 is explicit
    # that the LIGHT is the state. `plate.row.selected` is the produced asset for exactly this.
    lit = C.nine("plate.row.selected", L["lit_w"], L["lit_h"])
    focus_y = L["menu_y"] + FOCUSED * L["menu_step"] - 10
    C.place(layer, lit, (L["rail_x"] + 10, focus_y))

    # -- the menu: stencil markings, the focused one live, the rest resting ----------------
    menu_face = fontkit.role("display-800", L["menu_size"])
    for i, item in enumerate(MENU):
        y = L["menu_y"] + i * L["menu_step"]
        mask = C.text_mask(item, menu_face, tracking=0.02)
        mask = C.weather(mask, roughness=0.22, ink=0.06, seed=1000 + i)
        if i == FOCUSED:
            colour, alpha, glow = C.HEX["bone"], 1.0, C.HEX["legend"]
        elif item in DISABLED:
            colour, alpha, glow = C.HEX["bone"], 0.38, None
        else:
            colour, alpha, glow = C.HEX["bone"], 0.62, None
        C.paint_mask(layer, mask, (L["menu_x"], y), colour, alpha,
                     glow=glow, glow_radius=26, glow_alpha=0.26)

    # -- the status line, on a small backlit legend strip sized to its own text ------------
    st_face = fontkit.role("legend", L["status_size"])
    st = C.text_mask(STATUS, st_face, tracking=0.09)
    strip = C.nine("plate.legend.strip", st.width + L["status_pad"] * 2, L["status_h"])
    C.place(layer, strip, (L["status_x"] - L["status_pad"], L["status_y"] - 13))
    C.paint_mask(layer, st, (L["status_x"], L["status_y"]), C.HEX["legend"], 1.0,
                 glow=C.HEX["legend"], glow_radius=13, glow_alpha=0.30)

    # -- the save line: fine print, sentence case, resting --------------------------------
    save_face = fontkit.role("body", L["save_size"])
    C.paint_mask(layer, C.text_mask(SAVE_LINE, save_face), (L["save_x"], L["save_y"]),
                 C.HEX["bone"], 0.62)

    # -- the version, with one status light ------------------------------------------------
    dot = C.asset("light.dot.good.on") if _has("light.dot.good.on") else None
    if dot:
        C.place(layer, dot, (L["ver_x"], L["ver_y"] + 4))
    ver_face = fontkit.role("legend", L["ver_size"])
    C.paint_mask(layer, C.text_mask(VERSION, ver_face, tracking=0.06),
                 (L["ver_x"] + (20 if dot else 0), L["ver_y"]), C.HEX["bone"], 0.38)

    # -- the wordmark: the PRODUCED logotype, painted onto the world ------------------------
    #
    # marks/logotype/spaceface-logotype.svg, not a wordmark re-set in a font here: the frame has
    # to be a target the build can actually hit, and the build will use the mark.
    scene_light = {"v1": "#FFC183", "v2": "#FFAE62", "v3": "#8FA8D8"}[variant]
    ink = C.tint_to_scene(C.HEX["bone"], scene_light, 0.26)
    logo = C.mark_png("logotype/spaceface-logotype.svg", L["word_w"], ink)
    # a hull stencil is worn at the edge, not mottled across its face
    mask = C.weather(logo.split()[3], roughness=0.26, ink=0.045)
    C.paint_mask(layer, mask, (L["word_x"], L["word_y"]), ink, 0.94)

    # -- composite over the lit world ------------------------------------------------------
    world = C.plate(PLATES[variant])
    world = C.stars(world, count=240 if variant != "v1" else 40,
                    band=(0.0, 0.42 if variant != "v1" else 0.16))
    frame = Image.alpha_composite(world, layer)
    frame = C.vignette(frame, amount=0.24)
    return layer, frame


def _has(ident: str) -> bool:
    try:
        C.asset(ident)
        return True
    except FileNotFoundError:
        return False


def main():
    which = sys.argv[1] if len(sys.argv) > 1 else "all"
    variants = list(PLATES) if which == "all" else [which]
    for v in variants:
        layer, frame = compose(v)
        C.save_layer(layer, APPROVED / "layers" / ("layer-title-%s.png" % v))
        C.save(frame, APPROVED / "frames" / ("frame-title-%s.png" % v))
        C.save(C.plate(PLATES[v]).convert("RGB"),
               APPROVED / "plates" / ("plate-title-%s.png" % v))


if __name__ == "__main__":
    main()

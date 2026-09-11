"""frame_screens — compose the Crucible door frame and the HUD resting / wanted pair.

Strings are verbatim from `01_GAME_DOSSIER.md` §4 via `screens/fixtures.js`, read here rather
than re-typed, so the frame and the prototype cannot disagree about what the screen says.

Crucible door: POSTER at Crucible temperature (white-hot).
HUD: EDGE — nothing but the reticle and the world tag in the middle third, no plate larger
than one sixth of the frame, and the wanted state changes the WHOLE frame's temperature.

    python frame_screens.py [crucible|hud|hud-wanted|all]
"""
from __future__ import annotations

import json
import pathlib
import re
import sys

from PIL import Image, ImageDraw

HERE = pathlib.Path(__file__).resolve().parent
if str(HERE) not in sys.path:
    sys.path.insert(0, str(HERE))

import fh_compose as C          # noqa: E402
import fontkit                  # noqa: E402

APPROVED = C.REPO / "design" / "frontend" / "direction" / "approved"


def fixtures() -> dict:
    """Read the prototypes' own fixture file, so both sides show the same strings."""
    src = (C.KIT / "screens" / "fixtures.js").read_text(encoding="utf-8")
    body = src[src.index("window.FIXTURES =") + len("window.FIXTURES ="):].rstrip().rstrip(";")
    body = re.sub(r"^\s*/\*.*?\*/\s*", "", body, flags=re.S)
    body = re.sub(r"([{,]\s*)([A-Za-z_][A-Za-z0-9_]*)\s*:", r'\1"\2":', body)
    body = re.sub(r",(\s*[}\]])", r"\1", body)
    body = body.replace("'", '"')
    return json.loads(body)


F = fixtures()


def legend(layer, text, xy, size=12, level=1.0, colour=None, tracking=0.06, glow=True):
    face = fontkit.role("legend", size)
    mask = C.text_mask(text, face, tracking=tracking)
    col = colour or C.HEX["legend"]
    C.paint_mask(layer, mask, xy, col, level,
                 glow=col if glow and level > 0.6 else None, glow_radius=11, glow_alpha=0.26)
    return mask


def body(layer, text, xy, size=14, alpha=0.62, colour=None):
    face = fontkit.role("body", size)
    mask = C.text_mask(text, face)
    C.paint_mask(layer, mask, xy, colour or C.HEX["bone"], alpha)
    return mask


def display(layer, text, xy, size=40, alpha=1.0, colour=None, tracking=0.02, weather=0.0):
    face = fontkit.role("display-800", size)
    mask = C.text_mask(text, face, tracking=tracking)
    if weather:
        mask = C.weather(mask, roughness=weather, ink=weather * 0.2)
    C.paint_mask(layer, mask, xy, colour or C.HEX["bone"], alpha)
    return mask


def tile(layer, x, y, art_mark, art_icon, label, selected, w=132, h=116, temp_white=False):
    """An imaged tile: a smoked-glass window with a backlit legend beneath (P01)."""
    plate = C.nine("window.viewport" if selected else "window.glass", w, h)
    C.place(layer, plate, (x, y))
    art = None
    if art_mark:
        art = C.mark_png("%s/%s.svg" % (
            "modes" if art_mark.startswith("mark-") and "foundry" not in art_mark
            and "crucible" not in art_mark and "sluice" not in art_mark
            and "drift" not in art_mark and "lattice" not in art_mark else "arenas",
            art_mark), 56, C.HEX["bone"] if selected else "#8D857A")
    if art is not None:
        C.place(layer, art, (x + w // 2 - art.width // 2, y + 16))
    elif art_icon is not None:
        C.place(layer, art_icon, (x + w // 2 - art_icon.width // 2, y + 20))
    face = fontkit.role("legend", 12)
    mask = C.text_mask(label, face, tracking=0.06)
    C.paint_mask(layer, mask, (x + w // 2 - mask.width // 2, y + h - 26),
                 "#FFFFFF" if (selected and temp_white) else
                 (C.HEX["bone"] if selected else C.HEX["bone"]),
                 1.0 if selected else 0.55)


def icon_png(name, size=48, colour="#EAE6DF"):
    return C.mark_png("../icons/%d/icon-%s.svg" % (size, name), size, colour)


def compose_crucible():
    Cx = F["crucible"]
    layer = Image.new("RGBA", (C.W, C.H), (0, 0, 0, 0))

    # the title: a stencil marking at 160 px (P01 asks for >= 140)
    display(layer, Cx["title"].upper(), (104, 74), size=160, tracking=0.02, weather=0.22,
            colour="#FFFFFF")
    body(layer, Cx["tagline"], (112, 246), size=20, alpha=0.72)

    # A smoked window behind the whole selector block. Text laid straight onto a forge-lit
    # arena fails its contrast floor, and darkening it with a CSS scrim would be exactly the
    # material-faking the programme rejects — window.glass.deep is the produced asset for it.
    C.place(layer, C.nine("window.glass.deep", 780, 616), (72, 276))

    y = 298
    for row in Cx["rows"]:
        legend(layer, row["legend"].upper(), (112, y), size=13, level=1.0, colour="#FFFFFF")
        body(layer, row["blurb"], (112 + 160, y - 2), size=14, alpha=0.60)
        y += 26
        # the aside line's space is reserved in every row, whether or not the row has one:
        # a variable pitch is what makes the prototype impossible to align to the frame
        if row.get("aside"):
            body(layer, row["aside"], (112, y), size=13, alpha=0.40)
        y += 22 + 8
        x = 104
        for it in row["items"]:
            sel = it["label"] == row["selected"]
            art_icon = icon_png(it["icon"], 48,
                                C.HEX["bone"] if sel else "#8D857A") if it.get("icon") else None
            tile(layer, x, y, it.get("mark"), art_icon, it["label"], sel, temp_white=True)
            x += 144
        y += 116 + 58

    # the seed: an engraved readout; "New seed" is a small key
    legend(layer, "SEED", (112, 936), size=12, level=0.85)
    well = C.nine("stepper.well", 190, 56)
    C.place(layer, well, (176, 916))
    display(layer, Cx["seed"], (206, 928), size=40, colour="#FFFFFF")
    key = C.nine("key.small.rest", 150, 46)
    C.place(layer, key, (388, 922))
    legend(layer, Cx["newSeed"].upper(), (412, 938), size=12, level=0.9, glow=False)

    # "Records & challenges" is a fine backlit legend with a chevron
    legend(layer, Cx["records"].upper(), (112, 1010), size=12, level=0.80)
    chev = icon_png("chevron-right", 24, C.HEX["signal"])
    C.place(layer, chev, (112 + 236, 1004))

    # ONE big machined key with a live hazard stripe
    launch = C.nine("key.hazard.rest", 360, 84)
    C.place(layer, launch, (1464, 904))
    lk = fontkit.role("display-800", 22)
    lm = C.text_mask(Cx["launch"].upper(), lk, tracking=0.04)
    C.paint_mask(layer, lm, (1464 + 190 - lm.width // 2, 904 + 42 - lm.height // 2),
                 "#FFFFFF", 1.0, glow="#FFFFFF", glow_radius=16, glow_alpha=0.22)
    legend(layer, Cx["back"].upper(), (1464 + 300, 1012), size=12, level=0.5, glow=False)

    world = C.plate("crucible-door")
    frame = Image.alpha_composite(world, layer)
    frame = C.vignette(frame, amount=0.30)
    return layer, frame


def compose_hud(wanted: bool):
    H = F["hud"]
    layer = Image.new("RGBA", (C.W, C.H), (0, 0, 0, 0))
    sig = C.HEX["wanted"] if wanted else C.HEX["signal"]
    leg = C.HEX["cold"] if wanted else C.HEX["legend"]

    # ---- top -------------------------------------------------------------------------
    face = fontkit.role("legend", 13)
    tip = C.text_mask(H["tip"].upper(), face, tracking=0.06)
    # the tip sits above the comms tape rather than beside it: at 1920 they are the same row
    C.paint_mask(layer, tip, (C.W // 2 - tip.width // 2, 26), C.HEX["bone"], 0.62)

    C.place(layer, C.asset("tape.cap.left"), (1104, 62))
    C.place(layer, C.asset("tape.mid").resize((190, 24)), (1120, 62))
    C.place(layer, C.asset("tape.cap.right"), (1310, 62))
    legend(layer, H["band"], (1136, 68), size=11, level=0.45, colour=leg, glow=False)

    # sector law badge
    badge = C.asset("badge.law.wanted" if wanted else "badge.law")
    C.place(layer, badge, (1876 - badge.width, 62))
    crest = C.mark_png("crests/crest-scn.svg", 46, C.HEX["bone"])
    C.place(layer, crest, (1876 - badge.width + 12, 86))
    legend(layer, (H["law"]["wantedLevel"] if wanted else H["law"]["level"]),
           (1876 - badge.width + 74, 74), size=12, level=1.0, colour=sig)
    legend(layer, H["law"]["place"], (1876 - badge.width + 74, 98), size=12, level=0.85,
           colour=leg, glow=False)
    legend(layer, H["law"]["jurisdiction"], (1876 - badge.width + 74, 120), size=11, level=0.45,
           colour=leg, glow=False)
    # ONE fine line, wrapped to the badge's own width — a paragraph here is a dashboard
    lw = fontkit.role("body", 12)
    words, line, lines = H["law"]["line"].split(), "", []
    for word in words:
        trial = (line + " " + word).strip()
        if C.text_mask(trial, lw).width > 300 and line:
            lines.append(line)
            line = word
        else:
            line = trial
    lines.append(line)
    for i, ln in enumerate(lines[:3]):
        lm = C.text_mask(ln, lw)
        C.paint_mask(layer, lm, (1876 - lm.width, 168 + i * 17), C.HEX["bone"], 0.38)

    # ---- right: contacts, radar ------------------------------------------------------
    cplate = C.nine("plate.edge.small", 300, 210)
    C.place(layer, cplate, (1576, 232))
    legend(layer, H["contacts"]["header"].upper(), (1598, 248), size=11, level=0.45,
           colour=leg, glow=False)
    ry = 274
    for i, r in enumerate(H["contacts"]["rows"]):
        if i == 0:
            C.place(layer, C.nine("plate.row.selected", 264, 30), (1594, ry - 5))
        ic = icon_png(r["cls"], 24, C.HEX["bone"] if i == 0 else "#8D857A")
        C.place(layer, ic, (1600, ry - 2))
        body(layer, r["name"], (1630, ry), size=13, alpha=1.0 if i == 0 else 0.62)
        dm = C.text_mask(r["dist"], fontkit.role("data", 13))
        C.paint_mask(layer, dm, (1846 - dm.width, ry), C.HEX["bone"], 0.62)
        ry += 32
    legend(layer, H["contacts"]["footer"], (1598, ry + 4), size=11, level=0.30, colour=leg,
           glow=False)

    rb = C.asset("radar.bezel")
    rf = C.asset("radar.wanted-face" if wanted else "radar.face")
    rx, ry2 = 1876 - rb.width, 1036 - rb.height
    C.place(layer, rf, (rx, ry2))
    C.place(layer, rb, (rx, ry2))
    d = ImageDraw.Draw(layer)
    cx, cy = rx + rb.width // 2, ry2 + rb.height // 2
    for rr in (40, 80, 120):
        d.ellipse([cx - rr, cy - rr, cx + rr, cy + rr],
                  outline=C.rgba(C.HEX["bone"], 0.16), width=1)
    d.line([cx, cy - 124, cx, cy + 124], fill=C.rgba(C.HEX["bone"], 0.14))
    d.line([cx - 124, cy, cx + 124, cy], fill=C.rgba(C.HEX["bone"], 0.14))
    for c in (H["radar"]["wantedContacts"] if wanted else H["radar"]["contacts"]):
        gi = icon_png(c["cls"], 24, C.HEX["wanted"] if c.get("hostile") else sig)
        gi = gi.resize((16, 16), Image.LANCZOS)
        C.place(layer, gi, (int(cx + c["x"] * 118) - 8, int(cy - c["y"] * 118) - 8))
    legend(layer, H["radar"]["north"], (cx - 5, ry2 + 10), size=11, level=1.0, colour=C.HEX["cold"])
    legend(layer, H["radar"]["range"], (cx - 34, ry2 + rb.height - 26), size=11, level=0.40,
           colour=leg, glow=False)
    legend(layer, H["radar"]["you"], (cx - 12, cy + 22), size=11, level=0.40, colour=leg,
           glow=False)
    legend(layer, H["corner"], (1876 - 200, 1052), size=11, level=0.30, colour=leg, glow=False)

    # ---- left: tabs, log, status, objective -------------------------------------------
    tx = 44
    for i, t in enumerate(H["bandTabs"]):
        k = C.nine("key.legend.lit" if i == 0 else "key.legend.rest", 116, 34)
        C.place(layer, k, (tx, 62))
        legend(layer, t, (tx + 18, 72), size=11, level=1.0 if i == 0 else 0.45, colour=leg,
               glow=i == 0)
        tx += 124
    body(layer, H["log"], (44, 116), size=12, alpha=0.38)

    legend(layer, "STATUS", (44, 392), size=11, level=0.45, colour=leg, glow=False)
    C.place(layer, C.nine("strip.status.bezel", 200, 20), (44, 410))
    for i in range(H["status"]["total"]):
        lvl = "on" if i < H["status"]["value"] else "off"
        dot = C.asset("light.dot.%s.%s" % ("wanted" if wanted else "legend", lvl))
        C.place(layer, dot, (52 + i * 19, 414))
    body(layer, "%d / %d" % (H["status"]["value"], H["status"]["total"]), (44, 434), size=13,
         alpha=0.62)

    C.place(layer, C.nine("plate.objective", 380, 84), (44, 440 + 28))
    C.place(layer, icon_png("target", 24, sig), (62, 486))
    body(layer, H["objective"]["line"], (94, 484), size=14, alpha=0.9)
    body(layer, H["objective"]["meta"], (94, 508), size=12, alpha=0.55)
    C.place(layer, icon_png("chevron-right", 24, sig), (392, 494))

    # ---- bottom: ship block, speed gauge, action bar ----------------------------------
    C.place(layer, C.nine("plate.edge.small", 300, 120), (44, 916))
    for i, (lg, val) in enumerate((("ENERGY", H["ship"]["energy"]),
                                   ("DRIVE", H["ship"]["drive"]))):
        yy = 944 + i * 42
        legend(layer, lg, (64, yy + 4), size=11, level=0.45, colour=leg, glow=False)
        C.place(layer, C.nine("bar.seg.bezel", 150, 28), (132, yy - 4))
        for s in range(10):
            on = s < round(val / 10)
            seg = C.asset("bar.seg.%s" % ("cold" if (on and wanted) else "on" if on else "off"))
            C.place(layer, seg, (138 + s * 14, yy))
        dm = C.text_mask(str(val), fontkit.role("data", 14))
        C.paint_mask(layer, dm, (318 - dm.width, yy + 2), C.HEX["bone"], 0.85)

    g = C.asset("gauge.speed.bezel")
    C.place(layer, g, (372, 1040 - g.height))
    gf = C.asset("gauge.speed.face")
    C.place(layer, gf, (372 + g.width // 2 - gf.width // 2, 1040 - g.height + 112))
    num = C.text_mask(str(H["speed"]["value"]), fontkit.role("hero-num", 64))
    C.paint_mask(layer, num,
                 (372 + g.width // 2 - num.width // 2, 1040 - g.height + 118),
                 C.HEX["bone"], 1.0, glow=sig, glow_radius=18, glow_alpha=0.20)
    body(layer, "%s %s" % (H["speed"]["weaponsLegend"], H["speed"]["weapons"]), (392, 1036),
         size=12, alpha=0.42)
    body(layer, "%s %s" % (H["speed"]["classLegend"], H["speed"]["cls"]), (392, 1054),
         size=12, alpha=0.42)

    ax = C.W // 2 - 330
    for grp in H["actions"]:
        w = len(grp["slots"]) * 64 + 30
        C.place(layer, C.nine("socket.bracket", w, 92), (ax, 950))
        for i, s in enumerate(grp["slots"]):
            C.place(layer, C.asset("socket.%s" % s["state"]), (ax + 16 + i * 64, 958))
            ic = icon_png(s["icon"], 32,
                          sig if s["state"] == "lit" else
                          "#6E665C" if s["state"] == "locked" else "#B4AA9C")
            C.place(layer, ic, (ax + 16 + i * 64 + 12, 970))
            legend(layer, s["key"], (ax + 16 + i * 64 + 6, 1020), size=10, level=0.35,
                   colour=leg, glow=False)
        legend(layer, grp["group"], (ax + 16, 936), size=11, level=0.45, colour=leg, glow=False)
        ax += w + 18

    # ---- middle third: only the reticle and the world tag ------------------------------
    rc = ImageDraw.Draw(layer)
    mx, my = C.W // 2, C.H // 2
    for a, b in ((-28, -8), (8, 28)):
        rc.line([mx, my + a, mx, my + b], fill=C.rgba(C.HEX["bone"], 0.55), width=2)
        rc.line([mx + a, my, mx + b, my], fill=C.rgba(C.HEX["bone"], 0.55), width=2)
    rc.ellipse([mx - 3, my - 3, mx + 3, my + 3], outline=C.rgba(C.HEX["bone"], 0.6))

    C.place(layer, C.nine("tag.world", 224, 28), (1088, 596))
    legend(layer, H["worldTag"].upper(), (1104, 604), size=11, level=1.0,
           colour=C.HEX["bone"], glow=False)

    world = C.plate("flight")
    world = C.stars(world, count=320, band=(0.0, 1.0), seed=77)
    if wanted:
        # the WHOLE frame cools, not one badge (§7)
        import numpy as np
        a = np.asarray(world).astype(np.float32)
        a[..., 0] *= 0.86
        a[..., 1] *= 0.94
        a[..., 2] *= 1.14
        world = Image.fromarray(np.clip(a, 0, 255).astype("uint8"), "RGBA")
    frame = Image.alpha_composite(world, layer)
    frame = C.vignette(frame, amount=0.22)
    return layer, frame


def main():
    which = sys.argv[1] if len(sys.argv) > 1 else "all"
    if which in ("crucible", "all"):
        layer, frame = compose_crucible()
        C.save_layer(layer, APPROVED / "layers" / "layer-crucible-door.png")
        C.save(frame, APPROVED / "frames" / "frame-crucible-door.png")
        C.save(C.plate("crucible-door").convert("RGB"),
               APPROVED / "plates" / "plate-crucible-door.png")
    if which in ("hud", "all"):
        layer, frame = compose_hud(False)
        C.save_layer(layer, APPROVED / "layers" / "layer-hud-resting.png")
        C.save(frame, APPROVED / "frames" / "frame-hud-resting.png")
        C.save(C.plate("flight").convert("RGB"), APPROVED / "plates" / "plate-flight.png")
    if which in ("hud-wanted", "all"):
        layer, frame = compose_hud(True)
        C.save_layer(layer, APPROVED / "layers" / "layer-hud-wanted.png")
        C.save(frame, APPROVED / "frames" / "frame-hud-wanted.png")


if __name__ == "__main__":
    main()

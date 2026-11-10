"""bl_kit — every raster asset in the Field Hardware kit, as a Cycles render of real geometry.

Method (the one 00_READ_ME_FIRST asks for): produce a small number of **master sheets** and
derive the many assets from them by script. Assets are laid out on one orthographic sheet under
a parallel-light rig, rendered once, and cut to exact pixel sizes — 1 Blender unit is 1 design
pixel, so a cut is exact rather than resampled.

    blender -b --factory-startup --python assets/ui/kit/tools/bl_kit.py -- [sheet ...] [samples=N]

Sheets: surfaces · windows · tiles · wear · keys · controls · lights · instruments · radar · misc
Output: assets/ui/kit/assets/<dir>/<id>.png and <id>@2x.png, plus assets/ui/kit/kit-manifest.json
"""
from __future__ import annotations

import json
import math
import os
import sys

import bpy

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)

import bl_common as B  # noqa: E402

REPO = os.path.abspath(os.path.join(HERE, "..", "..", "..", ".."))
OUT = os.path.join(REPO, "assets", "ui", "kit", "assets")
SCALE = 2          # native render is @2x; @1x is produced by high-quality downsample
SHEET_PAD = 24     # gap between assets on a sheet, in @1x design pixels


# ---------------------------------------------------------------- builders
#
# Each builder draws ONE asset centred on the origin at its @1x size. The sheet machinery
# translates the finished widget into its cell, so builders never know where they sit.

def _legend_plate(w, h, lit=None, thickness=5, edge=2.6, lift=1.0, slot=None, tone="plate"):
    p = B.plate(w, h, thickness=thickness, edge=edge, lift=lift, radius=3, name="legend")
    B.assign(p, B.gunmetal(tone=tone))
    sw, sh = slot or (w - edge * 2 - 30, h - edge * 2 - 18)
    B.recess(p, sw, sh, 3.2, bevel=0.6)
    if lit is not None:
        B.assign(B.pane(sw, sh, depth=3.1, on=p, name="back"),
                 B.emissive("lit", lit[0], strength=lit[1]))
    return p


def build_plate_primary(w, h):
    p = B.plate(w, h, thickness=7, edge=3.4, lift=1.3, radius=4, cut_corner=30, name="primary")
    B.assign(p, B.gunmetal(tone="plate"))
    return p


def build_plate_raised(w, h):
    p = B.plate(w, h, thickness=8, edge=3.4, lift=1.5, radius=4, name="raised")
    B.assign(p, B.gunmetal("gm-raised", tone="plate-raised"))
    return p


def build_plate_sunk(w, h):
    """A recessed well: the plate is the rim and the field is sunk, so the lit edge runs on the
    INSIDE of the rim and the shadow falls at the top — the inverse of a raised plate."""
    p = B.plate(w, h, thickness=7, edge=3.0, lift=1.2, radius=4, name="sunk")
    B.assign(p, B.gunmetal("gm-sunk", tone="plate"))
    B.recess(p, w - 30, h - 30, 4.0, bevel=1.2)
    B.assign(B.pane(w - 32, h - 32, depth=4.3, on=p, name="sunk-floor"),
             B.gunmetal("gm-sunk-floor", tone="plate-sunk", roughness=0.52))
    return p


def build_plate_paper(w, h):
    p = B.plate(w, h, thickness=6, edge=3.0, lift=1.1, radius=3, name="paper-rim")
    B.assign(p, B.gunmetal("gm-paper-rim", tone="plate-raised"))
    B.recess(p, w - 26, h - 26, 2.6, bevel=0.8)
    B.assign(B.pane(w - 28, h - 28, depth=2.5, on=p, name="paper"), B.paper())
    return p


def build_plate_edge_small(w, h):
    p = B.plate(w, h, thickness=5, edge=2.2, lift=0.8, radius=3, name="edge-small")
    B.assign(p, B.gunmetal("gm-edge", tone="plate", roughness=0.46))
    return p


def build_plate_poster_rail(w, h):
    """The vertical legend rail a POSTER menu hangs from: a thin machined plate with a sunk
    channel down its length, so a lit legend can sit behind the focused word."""
    p = B.plate(w, h, thickness=6, edge=2.8, lift=1.1, radius=3, name="rail")
    B.assign(p, B.gunmetal(tone="plate"))
    B.recess(p, w - 22, h - 26, 3.0, bevel=0.7)
    return p


def build_row_selected(w, h):
    """The selected row's light: an amber left-edge light with a soft spill across the plate."""
    p = B.plate(w, h, thickness=5, edge=2.2, lift=0.8, radius=2, name="row")
    B.assign(p, B.gunmetal("gm-row", tone="plate-raised"))
    B.recess(p, 7, h - 12, 2.8, x=-w / 2 + 11, bevel=0.5)
    B.assign(B.pane(6, h - 14, x=-w / 2 + 11, depth=2.7, on=p, name="row-light"),
             B.emissive("row-lit", B.HEX["signal"], strength=1.5))
    return p


def build_window(w, h, darken=0.45, rim_only=False):
    p = B.plate(w, h, thickness=7, edge=3.2, lift=1.2, radius=4, name="window")
    B.assign(p, B.gunmetal("gm-window", tone="plate"))
    B.recess(p, w - 40, h - 40, 4.6, bevel=1.0)
    if not rim_only:
        gl = B.pane(w - 40, h - 40, depth=1.6, on=p, name="glass")
        B.assign(gl, B.glass(darken=darken))
        B.reflect_strip(gl, B.top_world(p), span=max(w, h) * 1.4)
    return p


def build_tile_grain(w, h):
    """Seamless brushed-metal grain as a standalone overlay: a thin slab whose only content is
    the roughness variation, so code can multiply it over a custom-sized plate."""
    q = B.quad(w, h, "grain")
    m = B.gunmetal("gm-grain", tone="plate", roughness=0.44)
    B._brushed(m, B._pbsdf(m), strength=0.16, scale=140.0, stretch=30.0)
    B.assign(q, m)
    return q


def build_tile_hazard(w, h, wanted=False):
    base = B.plate(w, h, thickness=3, edge=0.0, lift=0.0, radius=0, bevel=0.0, name="hz")
    B.assign(base, B.gunmetal("gm-hz", tone="plate"))
    B.hazard_band(base, w, h, pitch=w / 4.0, wanted=wanted, thick=0.9)
    base.hide_render = True   # the stripe alone; code lays it on its own plate
    return base


def build_tile_edge_light(w, h):
    """The lit top-edge strip, for plates code builds at a custom height."""
    p = B.plate(w, h * 3, thickness=4, edge=h * 0.75, lift=h * 0.30, radius=0, name="edgelight")
    B.assign(p, B.gunmetal("gm-edgelight", tone="plate"))
    return p


def build_tile_hairline(w, h):
    p = B.plate(w, h * 4, thickness=3, edge=0.0, lift=0.0, radius=0, bevel=0.0, name="hair-host")
    B.assign(p, B.gunmetal("gm-hair-host", tone="plate"))
    B.recess(p, w, h, 1.4, bevel=0.35)
    p.hide_render = True
    etch = B.plate(w, h, thickness=1.2, edge=0.0, lift=0.0, radius=0, bevel=0.2, name="hairline")
    B.assign(etch, B.etch())
    return etch


def build_key(w, h, state="rest", kind="primary"):
    """A machined key. `pressed` sinks the plate into its own bounds rather than moving the
    sprite, so code can swap states without a layout shift (P11 acceptance 1)."""
    sunk = 2.0 if state == "pressed" else 0.0
    tone = "plate-raised" if kind == "primary" else "plate"
    thick = 8 - sunk
    lift = (1.9 if state == "hover" else 1.5) - sunk * 0.25
    p = B.plate(w, h, thickness=thick, edge=3.4, lift=lift, radius=4, name="key")
    rough = 0.34 if state == "hover" else 0.40
    B.assign(p, B.gunmetal("gm-key-%s" % state, tone=tone, roughness=rough))
    slot_w, slot_h = w - 46, h - 26
    B.recess(p, slot_w, slot_h, 3.8, bevel=0.7)
    # the slot carries the light that LEAKS around the stencil; the legend itself is set live
    # by code and carries the rest. A slot at full strength is a highlighter.
    level = {"rest": 0.30, "hover": 0.42, "pressed": 0.22, "disabled": 0.0, "focus": 0.34,
             "lit": 0.42}.get(state, 0.30)
    if kind == "primary" and level > 0:
        B.assign(B.pane(slot_w, slot_h, depth=3.7, on=p, name="key-back"),
                 B.emissive("key-lit-%s" % state, B.HEX["legend"], strength=level))
    elif kind == "legend" and level > 0 and state in ("lit", "hover", "focus"):
        B.assign(B.pane(slot_w, slot_h, depth=3.7, on=p, name="key-back"),
                 B.emissive("key-lit-%s" % state, B.HEX["legend"], strength=level * 0.8))
    if kind == "hazard":
        cap = B.plate(26, h, thickness=thick + 0.4, edge=1.6, lift=0.6, radius=2, name="cap")
        B.move(cap, -w / 2 + 13, 0)
        B.assign(cap, B.gunmetal("gm-cap", tone="plate"))
        B.hazard_band(cap, 26, h, x=-w / 2 + 13, pitch=13, thick=0.9)
    return p


def build_socket(w, h, state="rest"):
    """A machined recess that holds a verb icon: the action bar is sockets, not buttons."""
    p = B.plate(w, h, thickness=7, edge=3.0, lift=1.1, radius=4, name="socket")
    tone = "plate-sunk" if state == "empty" else "plate"
    B.assign(p, B.gunmetal("gm-socket-%s" % state, tone=tone))
    B.recess(p, w - 20, h - 20, 4.2, bevel=0.9)
    glow = {"lit": (B.HEX["legend"], 1.05), "cooling": (B.HEX["legend"], 0.34),
            "locked": (B.HEX["wanted"], 0.55)}.get(state)
    if glow:
        B.assign(B.pane(w - 22, h - 22, depth=4.4, on=p, name="socket-back"),
                 B.emissive("socket-%s" % state, glow[0], strength=glow[1]))
    return p


def build_toggle(w, h, state="off-rest"):
    """A two-position machined switch — a lever that physically sits at one end of its well."""
    p = B.plate(w, h, thickness=6, edge=2.2, lift=0.9, radius=3, name="toggle")
    dim = state.startswith("disabled")
    B.assign(p, B.gunmetal("gm-toggle-%s" % state, tone="plate"))
    B.recess(p, w - 14, h - 12, 3.2, bevel=0.6)
    on = "on" in state.split("-")[0] or state.startswith("on")
    lever = B.plate(w * 0.42, h - 15, thickness=7.4, edge=1.6, lift=0.8, radius=2, name="lever")
    B.move(lever, (w * 0.22) * (1 if on else -1), 0, 0.6)
    B.assign(lever, B.gunmetal("gm-lever-%s" % state,
                               tone="plate-raised" if not dim else "plate", roughness=0.36))
    if on and not dim:
        B.assign(B.pane(w * 0.26, 4, x=-w * 0.24, depth=3.1, on=p, name="tog-lit"),
                 B.emissive("tog-%s" % state, B.HEX["signal"], strength=1.1))
    return p


def build_light(w, h, colour="legend", level="on", bar=False):
    """A status light: the lit element itself with its halo baked, on transparent.

    P11 states `light.dot` is 12x12 and `light.bar` 24x6 with the halo inside that footprint,
    so this is the emitter alone — code places it in whatever plate or well it belongs to. The
    halo is a second, larger, much dimmer emitter rather than a post glare, because the asset
    has to carry its own light at the size it ships.
    """
    strength = {"on": 1.5, "dim": 0.42, "off": 0.0}[level]
    if strength <= 0:
        # an off light is still a physical element: a dark lens in its own bezel
        q = B.plate(w * 0.62, h * 0.62, thickness=1.6, edge=0.4, lift=0.2,
                    radius=1 if bar else 2, name="lens-off")
        B.assign(q, B.gunmetal("gm-lens-off", tone="plate-sunk", roughness=0.35))
        return q
    halo = B.quad(w, h, "halo")
    B.assign(halo, B.emissive_halo("halo-%s-%s" % (colour, level), B.HEX[colour],
                                   strength=strength * 0.42, falloff=2.4))
    core = B.quad(w * 0.52, h * (0.52 if not bar else 0.66), "core")
    core.location.z = 0.4
    B.assign(core, B.emissive("core-%s-%s" % (colour, level), B.HEX[colour], strength=strength))
    return core


def build_slider_track(w, h):
    p = B.plate(w, h + 16, thickness=5, edge=1.8, lift=0.7, radius=2, name="strack")
    B.assign(p, B.gunmetal("gm-strack", tone="plate"))
    B.recess(p, w - 10, h, 2.4, bevel=0.4)
    return p


def build_slider_fill(w, h):
    p = B.plate(w, h + 16, thickness=5, edge=1.8, lift=0.7, radius=2, name="sfill")
    B.assign(p, B.gunmetal("gm-sfill", tone="plate"))
    B.recess(p, w, h, 2.4, bevel=0.4)
    B.assign(B.pane(w, h, depth=2.3, on=p, name="fill"),
             B.emissive("fill-lit", B.HEX["signal"], strength=1.1))
    return p


def build_thumb(w, h, state="rest"):
    p = B.plate(w, h, thickness=7 - (1.6 if state == "pressed" else 0), edge=2.2,
                lift=1.5 if state == "hover" else 1.1, radius=3, name="thumb")
    B.assign(p, B.gunmetal("gm-thumb-%s" % state, tone="plate-raised",
                           roughness=0.34 if state == "hover" else 0.40))
    B.recess(p, w - 12, 2.4, 1.6, bevel=0.3)
    return p


def build_stepper_well(w, h):
    p = B.plate(w, h, thickness=6, edge=2.6, lift=1.0, radius=3, name="swell")
    B.assign(p, B.gunmetal("gm-swell", tone="plate"))
    B.recess(p, w - 22, h - 18, 3.4, bevel=0.7)
    B.assign(B.pane(w - 24, h - 20, depth=3.5, on=p, name="swell-floor"),
             B.gunmetal("gm-swell-floor", tone="plate-sunk", roughness=0.5))
    return p


def build_input_underline(w, h, state="rest"):
    p = B.plate(w, h, thickness=5, edge=2.0, lift=0.8, radius=2, name="input")
    B.assign(p, B.gunmetal("gm-input", tone="plate"))
    B.recess(p, w - 16, h - 14, 3.0, bevel=0.5)
    colour = {"focus": B.HEX["signal"], "error": B.HEX["wanted"]}.get(state)
    if colour:
        B.assign(B.pane(w - 18, 3.0, y=-h / 2 + 9, depth=3.0, on=p, name="underline"),
                 B.emissive("under-%s" % state, colour, strength=1.2))
    return p


def build_scroll(w, h, thumb=False, state="rest"):
    p = B.plate(w + 8, h, thickness=4, edge=1.4, lift=0.5, radius=2, name="scroll")
    B.assign(p, B.gunmetal("gm-scroll", tone="plate-raised" if thumb else "plate",
                           roughness=0.36 if state == "hover" else 0.44))
    if not thumb:
        B.recess(p, w, h - 6, 2.0, bevel=0.3)
    return p


def build_bar_bezel(w, h):
    p = B.plate(w, h, thickness=5, edge=2.0, lift=0.8, radius=2, name="barbezel")
    B.assign(p, B.gunmetal("gm-barbezel", tone="plate"))
    B.recess(p, w - 14, h - 12, 2.8, bevel=0.5)
    return p


def build_bar_seg(w, h, kind="on"):
    q = B.plate(w - 2, h, thickness=3, edge=0.8, lift=0.3, radius=1, name="seg")
    colour = {"on": B.HEX["signal"], "hot": B.HEX["hazard"], "cold": B.HEX["cold"]}.get(kind)
    if colour:
        B.assign(q, B.emissive("seg-%s" % kind, colour, strength=1.15))
    else:
        B.assign(q, B.gunmetal("gm-seg-off", tone="plate-sunk", roughness=0.55))
    return q


def build_gauge_bezel(w, h):
    """An arc bezel with etched ticks cut into the plate — the ticks are geometry, so they
    catch the key the way a machined scale does and never read as printed lines."""
    p = B.plate(w, h, thickness=7, edge=3.2, lift=1.2, radius=5, cut_corner=22, name="gbezel")
    B.assign(p, B.gunmetal("gm-gbezel", tone="plate"))
    r_out, r_in = w * 0.44, w * 0.30
    for i in range(41):
        a = math.radians(200 - i * 5.0)
        major = (i % 5 == 0)
        length = (r_out - r_in) * (1.0 if major else 0.55)
        cx = math.cos(a) * (r_out - length / 2)
        cy = math.sin(a) * (r_out - length / 2) - h * 0.10
        knife = B.box(length, 3.2 if major else 1.8, 2.2, cx, cy, B.top_world(p) - 0.6,
                      name="tick")
        knife.rotation_euler = (0, 0, a)
        b = p.modifiers.new("tick%d" % i, "BOOLEAN")
        b.operation, b.object, b.solver = "DIFFERENCE", knife, "EXACT"
        bpy.context.view_layer.objects.active = p
        bpy.ops.object.modifier_apply(modifier="tick%d" % i)
        bpy.data.objects.remove(knife, do_unlink=True)
    B.recess(p, w * 0.40, h * 0.30, 3.8, y=-h * 0.10, bevel=0.9)
    return p


def build_gauge_face(w, h):
    p = B.plate(w, h, thickness=5, edge=2.0, lift=0.8, radius=3, name="gface")
    B.assign(p, B.gunmetal("gm-gface", tone="plate"))
    B.recess(p, w - 16, h - 14, 3.0, bevel=0.6)
    gl = B.pane(w - 16, h - 14, depth=1.2, on=p, name="gglass")
    B.assign(gl, B.glass(darken=0.52))
    B.reflect_strip(gl, B.top_world(p), span=max(w, h) * 1.5)
    return p


def build_gauge_lit_arc(w, h):
    """The amber lit arc segment, registered to `gauge.speed.bezel`'s own tick ring so code can
    mask it to a value and have it land on the ticks."""
    import bmesh
    r_out, r_in = w * 0.445, w * 0.305
    cy = -h * 0.10
    mesh = bpy.data.meshes.new("litarc")
    bm = bmesh.new()
    steps = 72
    outer, inner = [], []
    for i in range(steps + 1):
        a = math.radians(200 - i * (200.0 / steps))
        outer.append(bm.verts.new((math.cos(a) * r_out, cy + math.sin(a) * r_out, 0)))
        inner.append(bm.verts.new((math.cos(a) * r_in, cy + math.sin(a) * r_in, 0)))
    for i in range(steps):
        bm.faces.new((outer[i], outer[i + 1], inner[i + 1], inner[i]))
    bm.to_mesh(mesh)
    bm.free()
    ob = bpy.data.objects.new("litarc", mesh)
    bpy.context.collection.objects.link(ob)
    B.assign(ob, B.emissive("litarc", B.HEX["signal"], strength=1.05))
    return ob


def build_radar_bezel(w, h, wanted=False):
    """A circular etched bezel with a cardinal notch — the radar is an instrument face."""
    bpy.ops.mesh.primitive_cylinder_add(radius=w / 2, depth=7, vertices=96,
                                        location=(0, 0, 3.5))
    p = bpy.context.object
    p.name = "radarbezel"
    p["thickness"], p["top"], p["edge"] = 7.0, 3.5, 3.0
    B.assign(p, B.gunmetal("gm-radar", tone="plate"))
    m = p.modifiers.new("bev", "BEVEL")
    m.width, m.segments, m.limit_method = 2.6, 3, "ANGLE"
    m.angle_limit = math.radians(30)
    B.auto_smooth(p, 26.0)
    B.recess_round(p, w * 0.84, 4.4, bevel=1.2)
    for i in range(48):
        a = math.radians(i * 7.5)
        major = (i % 12 == 0)
        r = w * 0.455
        length = 12 if major else 6
        knife = B.box(length, 3.0 if major else 1.6, 2.0,
                      math.cos(a) * (r - length / 2), math.sin(a) * (r - length / 2), 6.4,
                      name="rtick")
        knife.rotation_euler = (0, 0, a)
        b = p.modifiers.new("rt%d" % i, "BOOLEAN")
        b.operation, b.object, b.solver = "DIFFERENCE", knife, "EXACT"
        bpy.context.view_layer.objects.active = p
        bpy.ops.object.modifier_apply(modifier="rt%d" % i)
        bpy.data.objects.remove(knife, do_unlink=True)
    return p


def build_radar_face(w, h, wanted=False):
    bpy.ops.mesh.primitive_cylinder_add(radius=w * 0.41, depth=2.0, vertices=96,
                                        location=(0, 0, 1.0))
    q = bpy.context.object
    q.name = "radarface"
    B.assign(q, B.glass(darken=0.62, tint="#04060B" if not wanted else "#060A14"))
    return q


def build_radar_n(w, h):
    q = B.plate(14, 8, thickness=2.4, edge=0.6, lift=0.3, radius=1, name="nlit")
    B.assign(q, B.emissive("nlit", B.HEX["cold"], strength=1.4))
    return q


def build_badge_law(w, h, wanted=False):
    """The sector-law badge: a crest well, a safety-paint strip slot and two legend slots.
    No text is baked — every legend is set live (P12 acceptance 4)."""
    p = B.plate(w, h, thickness=7, edge=3.2, lift=1.2, radius=4, cut_corner=20, name="badge")
    B.assign(p, B.gunmetal("gm-badge", tone="plate"))
    B.recess(p, 48, 48, 3.6, x=-w / 2 + 34, bevel=0.9)          # crest well
    strip = B.plate(w - 96, 18, thickness=7.8, edge=1.4, lift=0.5, radius=1, name="lawstrip")
    B.move(strip, 22, h / 2 - 20, 0.4)
    B.assign(strip, B.gunmetal("gm-lawstrip", tone="plate"))
    B.hazard_band(strip, w - 96, 18, x=22, y=h / 2 - 20, pitch=16, wanted=wanted, thick=0.8)
    B.recess(p, w - 96, 16, 2.6, x=22, y=-6, bevel=0.5)           # legend slot 1
    B.recess(p, w - 96, 12, 2.4, x=22, y=-h / 2 + 20, bevel=0.5)  # legend slot 2
    return p


def build_tape(w, h, part="mid", lit=False):
    p = B.plate(w, h, thickness=4, edge=1.6, lift=0.6,
                radius=2 if part != "mid" else 0, name="tape")
    B.assign(p, B.gunmetal("gm-tape", tone="plate"))
    B.recess(p, w - (10 if part != "mid" else 0), h - 9, 2.2, bevel=0.4)
    if lit:
        B.assign(B.pane(w - (10 if part != "mid" else 0), h - 9, depth=2.1, on=p, name="tapelit"),
                 B.emissive("tape-lit", B.HEX["legend"], strength=0.9))
    return p


def build_strip_status(w, h):
    """Ten light wells in an engraved strip — the 0/10 readout is physical sockets, not dots."""
    p = B.plate(w, h, thickness=5, edge=1.8, lift=0.7, radius=2, name="statstrip")
    B.assign(p, B.gunmetal("gm-statstrip", tone="plate"))
    step = (w - 24) / 10.0
    for i in range(10):
        B.recess(p, step * 0.62, h - 10, 2.4, x=-w / 2 + 12 + step * (i + 0.5), bevel=0.35)
    return p


def build_socket_bracket(w, h):
    """The etched group bracket that gathers a row of sockets under one legend."""
    p = B.plate(w, h, thickness=5, edge=2.2, lift=0.8, radius=3, name="bracket")
    B.assign(p, B.gunmetal("gm-bracket", tone="plate"))
    B.recess(p, w - 24, h - 34, 2.6, y=4, bevel=0.6)
    B.recess(p, w - 60, 14, 2.2, y=-h / 2 + 14, bevel=0.4)
    return p


def build_objective_plate(w, h):
    p = B.plate(w, h, thickness=6, edge=2.8, lift=1.0, radius=3, cut_corner=18, name="obj")
    B.assign(p, B.gunmetal("gm-obj", tone="plate"))
    B.recess(p, 26, 26, 3.2, x=-w / 2 + 26, bevel=0.7)
    B.recess(p, w - 70, h - 26, 2.6, x=12, bevel=0.5)
    return p


def build_dial_bezel(w, h):
    bpy.ops.mesh.primitive_cylinder_add(radius=w / 2, depth=6, vertices=72, location=(0, 0, 3))
    p = bpy.context.object
    p.name = "dial"
    p["thickness"], p["top"], p["edge"] = 6.0, 3.0, 2.6
    B.assign(p, B.gunmetal("gm-dial", tone="plate"))
    m = p.modifiers.new("bev", "BEVEL")
    m.width, m.segments, m.limit_method = 2.2, 3, "ANGLE"
    m.angle_limit = math.radians(30)
    B.auto_smooth(p, 26.0)
    B.recess_round(p, w * 0.72, 3.4, bevel=1.0)
    return p


def build_dial_face(w, h):
    bpy.ops.mesh.primitive_cylinder_add(radius=w * 0.35, depth=2, vertices=72,
                                        location=(0, 0, 1))
    q = bpy.context.object
    q.name = "dialface"
    B.assign(q, B.glass(darken=0.5))
    return q


def build_tag_world(w, h):
    """The little lit tag that hangs off the ship on a leader line."""
    p = B.plate(w, h, thickness=4, edge=1.5, lift=0.6, radius=2, cut_corner=8, name="tag")
    B.assign(p, B.gunmetal("gm-tag", tone="plate"))
    B.recess(p, w - 12, h - 9, 2.0, bevel=0.35)
    B.assign(B.pane(w - 12, h - 9, depth=1.9, on=p, name="taglit"),
             B.emissive("tag-lit", B.HEX["legend"], strength=0.85))
    return p


def build_wear_corner(w, h, seed=1):
    """Corner grime and a paint chip, as a real chipped slab — used at plate corners only."""
    p = B.plate(w, h, thickness=2.4, edge=0.0, lift=0.0, radius=0, bevel=0.2, name="wear")
    m = B.paint("wear-%d" % seed, "#0A0806", roughness=0.92)
    B._chip_edges(m, 0.92 - seed * 0.06)
    B.assign(p, m)
    return p


def build_wear_glass_print(w, h):
    p = B.plate(w, h, thickness=1.6, edge=0.0, lift=0.0, radius=0, bevel=0.15, name="print")
    m = B.paint("print", "#B9C4CF", roughness=0.24)
    B._chip_edges(m, 0.96)
    B.assign(p, m)
    return p


# ---------------------------------------------------------------- the asset registry
#
# ids follow 03_CONVENTIONS.md §6 dot-namespaces and are what code will reference. Sizes are
# @1x; `slice` is the nine-slice inset in @1x pixels.


def A(ident, folder, size, build, slice_=None, kind=None, states=None, notes="", **kw):
    return dict(id=ident, dir=folder, size=size, build=build, slice=slice_,
                kind=kind or ("9slice" if slice_ else "sprite"), states=states, notes=notes,
                kw=kw)


def _s(n, **over):
    d = {"top": n, "right": n, "bottom": n, "left": n}
    d.update(over)
    return d


KEY_STATES = ["rest", "hover", "pressed", "disabled", "focus"]
LEGEND_STATES = ["rest", "lit", "hover", "disabled", "focus"]
SOCKET_STATES = ["rest", "lit", "hover", "pressed", "disabled", "focus"]
LIGHT_COLOURS = ["legend", "cold", "wanted", "good"]
LIGHT_LEVELS = ["on", "dim", "off"]

SHEETS = {
    # ---- P10 surfaces ------------------------------------------------------------------
    "surfaces": [
        A("plate.bench.primary", "plates", (480, 320), build_plate_primary, _s(24),
          notes="the main workbench plate; one signature cut corner, top right"),
        A("plate.bench.raised", "plates", (480, 320), build_plate_raised, _s(24),
          notes="one step lighter; the selected or active plate"),
        A("plate.bench.sunk", "plates", (480, 320), build_plate_sunk, _s(24),
          notes="recessed well; holds rows and readouts"),
        A("plate.bench.paper", "plates", (480, 320), build_plate_paper, _s(24),
          notes="the codex reading insert: cream paper in a machined rim"),
        A("plate.edge.small", "plates", (240, 120), build_plate_edge_small, _s(16),
          notes="HUD scale: thinner edge, lighter grain"),
        A("plate.poster.rail", "plates", (64, 480), build_plate_poster_rail, _s(16),
          notes="the vertical legend rail a POSTER menu hangs from"),
        A("plate.row.selected", "plates", (480, 40), build_row_selected,
          _s(8, left=16, right=16), notes="amber left-edge light with a soft spill"),
    ],
    "legends": [
        A("plate.legend.strip", "plates", (240, 40),
          lambda w, h: _legend_plate(w, h, None), _s(12, left=16, right=16)),
        A("plate.legend.strip-lit", "plates", (240, 40),
          lambda w, h: _legend_plate(w, h, (B.HEX["legend"], 1.15)), _s(12, left=16, right=16)),
        A("plate.legend.strip-white", "plates", (240, 40),
          lambda w, h: _legend_plate(w, h, ("#FFFFFF", 1.15)), _s(12, left=16, right=16),
          notes="Crucible / white-hot temperature"),
        A("plate.legend.strip-red", "plates", (240, 40),
          lambda w, h: _legend_plate(w, h, (B.HEX["wanted"], 1.15)), _s(12, left=16, right=16),
          notes="wanted signal"),
    ],
    "windows": [
        A("window.glass", "windows", (480, 320), lambda w, h: build_window(w, h, 0.45), _s(20)),
        A("window.glass.deep", "windows", (480, 320),
          lambda w, h: build_window(w, h, 0.60), _s(20), notes="for text over busy scenes"),
        A("window.viewport", "windows", (480, 320),
          lambda w, h: build_window(w, h, rim_only=True), _s(20), notes="rim only, 0% darkening"),
    ],
    "tiles": [
        A("tile.grain", "tiles", (256, 256), build_tile_grain, kind="tile"),
        A("tile.hazard.stripe", "tiles", (128, 32), build_tile_hazard, kind="tile"),
        A("tile.hazard.stripe-red", "tiles", (128, 32),
          lambda w, h: build_tile_hazard(w, h, wanted=True), kind="tile"),
        A("tile.edge.light", "tiles", (256, 8), build_tile_edge_light, kind="tile"),
        A("tile.etch.hairline", "tiles", (256, 4), build_tile_hairline, kind="tile"),
    ],
    "wear": [
        A("wear.corner.01", "wear", (96, 96), lambda w, h: build_wear_corner(w, h, 1)),
        A("wear.corner.02", "wear", (96, 96), lambda w, h: build_wear_corner(w, h, 2)),
        A("wear.corner.03", "wear", (96, 96), lambda w, h: build_wear_corner(w, h, 3)),
        A("wear.corner.04", "wear", (96, 96), lambda w, h: build_wear_corner(w, h, 4)),
        A("wear.edge.chip.01", "wear", (160, 24), lambda w, h: build_wear_corner(w, h, 5)),
        A("wear.edge.chip.02", "wear", (160, 24), lambda w, h: build_wear_corner(w, h, 6)),
        A("wear.edge.chip.03", "wear", (160, 24), lambda w, h: build_wear_corner(w, h, 7)),
        A("wear.glass.print", "wear", (200, 140), build_wear_glass_print),
        A("wear.grime.strip", "wear", (256, 24), lambda w, h: build_wear_corner(w, h, 8)),
    ],
    # ---- P11 controls ------------------------------------------------------------------
    "keys": [
        A("key.primary.%s" % st, "keys", (240, 56),
          (lambda s: lambda w, h: build_key(w, h, s, "primary"))(st), _s(18),
          states=KEY_STATES) for st in KEY_STATES
    ] + [
        A("key.secondary.%s" % st, "keys", (240, 56),
          (lambda s: lambda w, h: build_key(w, h, s, "secondary"))(st), _s(18),
          states=KEY_STATES) for st in KEY_STATES
    ] + [
        A("key.hazard.%s" % st, "keys", (240, 56),
          (lambda s: lambda w, h: build_key(w, h, s, "hazard"))(st), _s(18),
          states=KEY_STATES) for st in KEY_STATES
    ],
    "keys2": [
        A("key.legend.%s" % st, "keys", (160, 40),
          (lambda s: lambda w, h: build_key(w, h, s, "legend"))(st), _s(14),
          states=LEGEND_STATES) for st in LEGEND_STATES
    ] + [
        A("key.small.%s" % st, "keys", (120, 36),
          (lambda s: lambda w, h: build_key(w, h, s, "secondary"))(st), _s(12),
          states=KEY_STATES) for st in KEY_STATES
    ] + [
        A("key.socket.%s" % st, "keys", (56, 56),
          (lambda s: lambda w, h: build_socket(w, h, s))(st), states=SOCKET_STATES)
        for st in SOCKET_STATES
    ],
    "controls": [
        A("toggle.switch.%s" % st, "controls", (72, 32),
          (lambda s: lambda w, h: build_toggle(w, h, s))(st),
          states=["off-rest", "off-hover", "on-rest", "on-hover", "disabled-off",
                  "disabled-on"])
        for st in ["off-rest", "off-hover", "on-rest", "on-hover", "disabled-off", "disabled-on"]
    ] + [
        A("slider.track", "controls", (240, 12), build_slider_track, _s(4, left=8, right=8)),
        A("slider.fill", "controls", (64, 12), build_slider_fill, kind="tile"),
        A("stepper.well", "controls", (160, 44), build_stepper_well, _s(14)),
    ] + [
        A("slider.thumb.%s" % st, "controls", (24, 24),
          (lambda s: lambda w, h: build_thumb(w, h, s))(st),
          states=["rest", "hover", "pressed", "disabled"])
        for st in ["rest", "hover", "pressed", "disabled"]
    ] + [
        A("stepper.minus.%s" % st, "controls", (44, 44),
          (lambda s: lambda w, h: build_key(w, h, s, "secondary"))(st),
          states=["rest", "hover", "pressed", "disabled"])
        for st in ["rest", "hover", "pressed", "disabled"]
    ] + [
        A("stepper.plus.%s" % st, "controls", (44, 44),
          (lambda s: lambda w, h: build_key(w, h, s, "secondary"))(st),
          states=["rest", "hover", "pressed", "disabled"])
        for st in ["rest", "hover", "pressed", "disabled"]
    ] + [
        A("input.underline.%s" % st, "controls", (240, 40),
          (lambda s: lambda w, h: build_input_underline(w, h, s))(st), _s(12),
          states=["rest", "focus", "error", "disabled"])
        for st in ["rest", "focus", "error", "disabled"]
    ] + [
        A("scroll.track", "controls", (8, 64), lambda w, h: build_scroll(w, h), kind="tile"),
        A("scroll.thumb.rest", "controls", (8, 32),
          lambda w, h: build_scroll(w, h, thumb=True), _s(6, left=2, right=2)),
        A("scroll.thumb.hover", "controls", (8, 32),
          lambda w, h: build_scroll(w, h, thumb=True, state="hover"), _s(6, left=2, right=2)),
    ],
    "lights": [
        A("light.dot.%s.%s" % (c, lv), "lights", (12, 12),
          (lambda cc, ll: lambda w, h: build_light(w, h, cc, ll))(c, lv))
        for c in LIGHT_COLOURS for lv in LIGHT_LEVELS
    ] + [
        A("light.bar.%s.%s" % (c, lv), "lights", (24, 6),
          (lambda cc, ll: lambda w, h: build_light(w, h, cc, ll, bar=True))(c, lv))
        for c in LIGHT_COLOURS for lv in LIGHT_LEVELS
    ],
    # ---- P12 instruments ---------------------------------------------------------------
    "instruments": [
        A("gauge.speed.bezel", "gauges", (360, 200), build_gauge_bezel),
        A("gauge.speed.face", "gauges", (160, 72), build_gauge_face),
        A("gauge.speed.lit-arc", "gauges", (360, 200), build_gauge_lit_arc, kind="sprite",
          notes="the amber lit arc; masked by code to the value"),
        A("bar.seg.bezel", "gauges", (240, 28), build_bar_bezel, _s(8, left=10, right=10)),
        A("bar.seg.on", "gauges", (12, 16), lambda w, h: build_bar_seg(w, h, "on")),
        A("bar.seg.off", "gauges", (12, 16), lambda w, h: build_bar_seg(w, h, "off")),
        A("bar.seg.hot", "gauges", (12, 16), lambda w, h: build_bar_seg(w, h, "hot")),
        A("bar.seg.cold", "gauges", (12, 16), lambda w, h: build_bar_seg(w, h, "cold")),
        A("dial.small.bezel", "gauges", (88, 88), build_dial_bezel),
        A("dial.small.face", "gauges", (88, 88), build_dial_face),
    ],
    "radar": [
        A("radar.bezel", "radar", (320, 320), build_radar_bezel),
        A("radar.face", "radar", (320, 320), build_radar_face),
        A("radar.wanted-face", "radar", (320, 320),
          lambda w, h: build_radar_face(w, h, wanted=True)),
        A("radar.n-lit", "radar", (16, 10), build_radar_n),
    ],
    "fittings": [
        A("socket.rest", "sockets", (56, 56), lambda w, h: build_socket(w, h, "rest"),
          states=SOCKET_STATES),
        A("socket.lit", "sockets", (56, 56), lambda w, h: build_socket(w, h, "lit"),
          states=SOCKET_STATES),
        A("socket.cooling", "sockets", (56, 56), lambda w, h: build_socket(w, h, "cooling"),
          states=SOCKET_STATES),
        A("socket.locked", "sockets", (56, 56), lambda w, h: build_socket(w, h, "locked"),
          states=SOCKET_STATES),
        A("socket.empty", "sockets", (56, 56), lambda w, h: build_socket(w, h, "empty"),
          states=SOCKET_STATES),
        A("socket.bracket", "sockets", (240, 72), build_socket_bracket, _s(18)),
        A("plate.objective", "plates", (320, 72), build_objective_plate, _s(16)),
        A("badge.law", "badges", (280, 96), build_badge_law),
        A("badge.law.wanted", "badges", (280, 96),
          lambda w, h: build_badge_law(w, h, wanted=True)),
        A("tape.cap.left", "tapes", (16, 24), lambda w, h: build_tape(w, h, "left")),
        A("tape.cap.right", "tapes", (16, 24), lambda w, h: build_tape(w, h, "right")),
        A("tape.mid", "tapes", (64, 24), lambda w, h: build_tape(w, h, "mid"), kind="tile"),
        A("tape.mid-lit", "tapes", (64, 24),
          lambda w, h: build_tape(w, h, "mid", lit=True), kind="tile"),
        A("strip.status.bezel", "strips", (240, 20), build_strip_status, _s(6, left=10, right=10)),
        A("tag.world", "tapes", (120, 24), build_tag_world, _s(8, left=10, right=10)),
    ],
}


# ---------------------------------------------------------------- sheet render and cut


def layout(items, max_w=2048):
    """Pack the sheet into rows. Cells are placed on even @1x coordinates so that the cut at
    @2x lands on whole pixels and no asset is resampled on its way out of the sheet."""
    rows, row, rw, rh = [], [], 0, 0
    for it in items:
        w, h = it["size"]
        if row and rw + w + SHEET_PAD > max_w:
            rows.append((row, rw, rh))
            row, rw, rh = [], 0, 0
        row.append(it)
        rw += w + SHEET_PAD
        rh = max(rh, h)
    if row:
        rows.append((row, rw, rh))

    sheet_w = max(rw for _r, rw, _rh in rows) + SHEET_PAD
    sheet_h = sum(rh for _r, _rw, rh in rows) + SHEET_PAD * (len(rows) + 1)
    sheet_w += sheet_w % 2
    sheet_h += sheet_h % 2

    placed, y = [], sheet_h / 2 - SHEET_PAD
    for row, _rw, rh in rows:
        x = -sheet_w / 2 + SHEET_PAD
        for it in row:
            w, h = it["size"]
            cx = round(x + w / 2)
            cy = round(y - rh / 2)
            placed.append(dict(it, cx=cx, cy=cy))
            x += w + SHEET_PAD
        y -= rh + SHEET_PAD
    return placed, int(sheet_w), int(sheet_h)


def render_sheet(name, items, samples=220):
    placed, sw, sh = layout(items)
    B.reset()
    B.scene(sw, sh, scale=SCALE, samples=samples)
    B.rig_sheet()
    for it in placed:
        with B.group(it["cx"], it["cy"]):
            it["build"](*it["size"])
    tmp = os.path.join(REPO, ".devshots", "delegate-20260910", "scratch", "pq-194", "build",
                       "sheets", "sheet-%s.png" % name)
    B.render(tmp)
    return tmp, placed, sw, sh


def main():
    argv = B.argv_after_dashes()
    opts = dict(a.split("=", 1) for a in argv if "=" in a)
    names = [a for a in argv if "=" not in a] or list(SHEETS)
    samples = int(opts.get("samples", 220))
    # `render=0` rewrites layout.json from the registry without re-rendering. Asset METADATA
    # (slice insets, state lists) lives in the registry, so a metadata correction should not
    # cost a Cycles pass over pixels that have not changed.
    do_render = opts.get("render", "1") != "0"
    index = {}
    for name in names:
        items = SHEETS[name]
        if do_render:
            png, placed, sw, sh = render_sheet(name, items, samples)
        else:
            placed, sw, sh = layout(items)
            png = os.path.join(REPO, ".devshots", "delegate-20260910", "scratch", "pq-194",
                               "build", "sheets", "sheet-%s.png" % name)
        index[name] = dict(
            sheet=os.path.basename(png), sheet_size=[sw, sh], scale=SCALE,
            items=[{k: v for k, v in it.items() if k != "build"} for it in placed])
        print("[sheet] %s: %d assets on %dx%d" % (name, len(placed), sw, sh), file=sys.stderr)
    out = os.path.join(REPO, ".devshots", "delegate-20260910", "scratch", "pq-194", "build",
                       "sheets", "layout.json")
    os.makedirs(os.path.dirname(out), exist_ok=True)
    prev = {}
    if os.path.exists(out):
        with open(out, encoding="utf-8") as fh:
            prev = json.load(fh)
    prev.update(index)
    with open(out, "w", encoding="utf-8") as fh:
        json.dump(prev, fh, indent=1)
    print("[layout] %s" % out, file=sys.stderr)


if __name__ == "__main__":
    main()

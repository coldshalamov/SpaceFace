#!/usr/bin/env python3
"""Author the wreck & aftermath ecology pack described in design/fiction/THE_LONG_AFTERMATH.md.

SpaceFace has one 700 m hero wreck (the Cathedral) and then a cliff: a single anonymous 65 m
`place_dead_hulk` carrying every other wreck role in the game, a single anonymous 30 m
`place_debris_chunk`, and a procedural ~18 m `buildWreck()`. Nothing in the world says "that used to
be a freighter". This tool builds the missing rows: THREE identifiable vessel-class hero wrecks with
separated sections and a state ladder — ore freighter, patrol corvette, passenger liner — an
ordinary-aftermath component kit so a routine fight can leave believable remains, and a shared
fragment kit.

The fiction specifies SIX hull families (§5). Three are built here; the mining barge, survey ship and
smuggler/pirate carrier are authored as specification only, with identity and cause of death but no
geometry. Do not read "six" anywhere in this file as a count of what exists.

The audit proving none of this duplicates or touches a leased asset is
assets/incubator/wreck_aftermath_pack/evidence/EXISTING_COVERAGE.md. The Wreck Cathedral,
place_dead_hulk, place_debris_chunk and the live wreck manifests are NOT read, written or re-exported
by this file.

SOURCE ONLY. Writes GLBs under assets/incubator/wreck_aftermath_pack/source/ and evidence under
.../evidence/. No release artifact, no manifest row, no runtime wiring. Because it adds no system,
no spawn and no manifest row, it cannot move check:baseline.

FRACTURE IS AUTHORED, NEVER COMPUTED. No boolean modifiers, no cell-fracture addon (--factory-startup
would not load it anyway), no RNG. A break is three deterministic things:
  (a) an INCLUSION SET  — which sub-assemblies this piece carries,
  (b) a DRIFT           — an authored translate + tumble recorded in build-report.json,
  (c) BREAK DECORATION  — break_plane() ADDS torn geometry (rib fan, plate fringe, conduit stubs)
                          at the cut. It never subtracts. Subtraction is what is version-fragile.
The fracture spec is therefore a dict: reviewable, diffable, hashable.

GEOMETRY CONVENTION. 1 u = 1 m against the 28 m player hull. Authored +Z up, +X = bow. Damage lands
on -Y and +X faces because that is what the review camera sees (the everyday-kit pack lost habitat
windows, six ID plates and every grade lamp to +Y before this was written down).

Usage:
    blender --background --factory-startup --python tools/blender/build_wreck_aftermath_pack.py -- \
        --only ore_freighter --render
    blender --background --factory-startup --python tools/blender/build_wreck_aftermath_pack.py -- \
        --render --distances --sheets --silhouettes --gaps
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import shutil
import sys
from pathlib import Path

import bpy
from mathutils import Euler, Vector

ROOT = Path(__file__).resolve().parents[2]
OUT_SOURCE = ROOT / 'assets' / 'incubator' / 'wreck_aftermath_pack' / 'source'
OUT_AUTHOR = ROOT / 'assets' / 'incubator' / 'wreck_aftermath_pack' / 'authored_down'
OUT_EVIDENCE = ROOT / 'assets' / 'incubator' / 'wreck_aftermath_pack' / 'evidence'

# GFX-7: pieces are cut from real Forge donor hulls. wreck_kit holds the shared fracture /
# damage-state tooling (also the GFX-6 hull-damage seam); forge supplies the ships' build().
FORGE_DIR = ROOT / 'tools' / 'blender' / 'forge'
for _p in (str(FORGE_DIR), str(FORGE_DIR / 'ships')):
    if _p not in sys.path:
        sys.path.insert(0, _p)
import wreck_kit as W  # noqa: E402

# Player hull is 28 m (CAMERA_VISIBLE_BUBBLE.md). A navigable gap must present at least 40 m of
# clear span -- enough that a pilot commits rather than scrapes. Asserted, not eyeballed.
PLAYER_HULL_M = 28.0
MIN_GAP_CLEAR_RADIUS = 20.0

# Review exposure multiplier. Wrecks light themselves; at 1.0 the rig's key overpowers every fire.
WRECK_KEY_MUL = 0.5

# ---------------------------------------------------------------------------
# Material roles (THE_LONG_AFTERMATH §4). `wrk_` prefix collides with nothing: the leased assets use
# bare Material_Hull / Material_Armor / ..., the dormant foundry fragments use KitMat_*, and the two
# incubator packs use esk_* / npcwork_*.
#
# (r, g, b, roughness, metallic)
ROLES = {
    # --- hull paint: family identity, and the thing scorch reveals history through ---
    # VALUES ARE DELIBERATELY LOW. Round 1 authored these at ordinary mid-value working paint, the
    # same range as the everyday-space kit -- and the freighter rendered as a beige object with a few
    # salmon dots on it. The cause is screen area, not emissive strength: hull paint covers ~70% of
    # the frame, so whatever value it carries sets the exposure, and every fire loses to it. In this
    # pack alone the large surfaces run dark so the small emissives can be the brightest thing in
    # frame. Against black space that is also simply truer -- a hull is lit by its own fires.
    'wrk_paint_freight_ochre':  (0.32, 0.22, 0.09, 0.66, 0.20),
    'wrk_paint_liner_bone':     (0.50, 0.48, 0.44, 0.52, 0.10),
    'wrk_paint_navy_concord':   (0.13, 0.17, 0.29, 0.48, 0.30),
    'wrk_paint_barge_rust':     (0.30, 0.17, 0.10, 0.70, 0.22),
    'wrk_paint_survey_white':   (0.48, 0.50, 0.48, 0.46, 0.12),
    'wrk_paint_pirate_dark':    (0.14, 0.13, 0.16, 0.62, 0.28),
    # non-matching plate: the carrier is built of other ships (fiction 5)
    'wrk_paint_mismatch_a':     (0.24, 0.28, 0.26, 0.64, 0.25),
    'wrk_paint_mismatch_b':     (0.33, 0.23, 0.19, 0.66, 0.22),
    # --- structure: what is left when the skin is cut away (fiction 2, 3) ---
    'wrk_hull_bare':            (0.34, 0.35, 0.37, 0.48, 0.45),
    'wrk_frame_steel':          (0.30, 0.31, 0.33, 0.50, 0.55),  # the rib fan
    'wrk_bulkhead':             (0.26, 0.27, 0.29, 0.58, 0.40),
    'wrk_armor':                (0.22, 0.24, 0.26, 0.64, 0.42),
    'wrk_deck_grate':           (0.18, 0.19, 0.20, 0.74, 0.30),
    'wrk_tank_shell':           (0.52, 0.51, 0.48, 0.34, 0.32),
    'wrk_pipe':                 (0.53, 0.54, 0.58, 0.38, 0.52),
    'wrk_ore_raw':              (0.40, 0.32, 0.21, 0.90, 0.05),
    'wrk_solar_cell':           (0.08, 0.10, 0.22, 0.22, 0.30),
    # --- soft things, which is how a derelict reads (fiction §3) ---
    'wrk_insulation':           (0.84, 0.78, 0.52, 0.80, 0.02),  # batting: pale, matte, torn
    'wrk_cable':                (0.14, 0.13, 0.14, 0.70, 0.10),
    'wrk_glass_shattered':      (0.14, 0.18, 0.22, 0.14, 0.20),
    # --- damage surfaces: EDGE QUALITY is the salvaged/destroyed tell (fiction §2) ---
    # torn and cut edges stay BRIGHT: they are small-area and they are the whole "edge quality"
    # tell of fiction 2, so they must pop against the darkened paint around them
    'wrk_torn_edge':            (0.68, 0.68, 0.70, 0.28, 0.62),  # ragged: bright bare metal
    'wrk_cut_edge':             (0.60, 0.54, 0.45, 0.42, 0.50),  # torch: straight, faintly oxidised
    'wrk_scorch':               (0.09, 0.08, 0.07, 0.82, 0.18),
    'wrk_scorch_edge':          (0.30, 0.18, 0.10, 0.72, 0.22),  # heat tint ringing the burn
    # --- age (fiction §3 derelict) ---
    'wrk_dust_matte':           (0.21, 0.20, 0.19, 0.94, 0.06),
    'wrk_chalk_paint':          (0.40, 0.39, 0.36, 0.90, 0.04),
    # --- the color law (fiction §4). Emissive strengths below. ---
    'wrk_hot_white':            (1.00, 0.95, 0.74, 0.30, 0.00),
    'wrk_hot_orange':           (1.00, 0.52, 0.14, 0.34, 0.00),
    'wrk_hot_deep_red':         (0.92, 0.20, 0.06, 0.40, 0.00),
    'wrk_fire_internal':        (1.00, 0.32, 0.05, 0.36, 0.00),
    'wrk_arc_blue':             (0.72, 0.86, 1.00, 0.20, 0.00),
    'wrk_vent_coolant':         (0.74, 0.92, 0.96, 0.20, 0.00),
    'wrk_emerg_amber':          (1.00, 0.70, 0.16, 0.30, 0.00),
    'wrk_emerg_red':            (1.00, 0.22, 0.16, 0.30, 0.00),
}

# Above ~3.0 the tone mapper whites a color out and the code dies -- paid for twice now (npc pack
# round 1, everyday kit round 1). Separation comes from HUE and SCREEN AREA, not strength: arcing is
# the strongest and is authored geometrically tiny; cooling cracks are the weakest and are long.
EMISSIVE_STRENGTH = {
    'wrk_arc_blue':      2.9,   # thinnest geometry in the pack
    'wrk_hot_white':     2.6,   # break metal, thick sections only
    'wrk_fire_internal': 1.9,   # must be occluded by structure or it is a lamp; at 2.3 the
                                # larger hold fires tone-mapped to a pale balloon
    'wrk_hot_orange':    2.2,
    'wrk_emerg_amber':   2.2,
    'wrk_emerg_red':     2.0,
    'wrk_vent_coolant':  1.6,
    'wrk_hot_deep_red':  1.4,   # cooling cracks: long, dim, follows the frames
}

# ---------------------------------------------------------------------------
# The state ladder (fiction §3) as a material substitution table. State is GEOMETRY plus this map --
# never an emissive recolor on its own. `None` means "delete this object entirely": a derelict has no
# fire to recolor, it has no fire.
STATE_SUBS = {
    'fresh': {},  # authored baseline for the hot roles
    'cooling': {
        'wrk_hot_white': 'wrk_hot_orange',
        'wrk_hot_orange': 'wrk_hot_deep_red',
        'wrk_arc_blue': None,          # power has finished shorting out
        'wrk_fire_internal': 'wrk_hot_deep_red',
    },
    'derelict': {
        # absence is the definition (fiction §3): no heat, no light, no venting
        'wrk_hot_white': 'wrk_dust_matte',
        'wrk_hot_orange': 'wrk_dust_matte',
        'wrk_hot_deep_red': 'wrk_dust_matte',
        'wrk_fire_internal': None,
        'wrk_arc_blue': None,
        'wrk_vent_coolant': None,
        'wrk_emerg_amber': None,
        'wrk_emerg_red': None,
        'wrk_insulation': 'wrk_dust_matte',   # embrittled, colour gone
        'wrk_torn_edge': 'wrk_dust_matte',    # micro-pitted matte, decades of dust
        'wrk_paint_freight_ochre': 'wrk_chalk_paint',
        'wrk_paint_liner_bone': 'wrk_chalk_paint',
        'wrk_paint_navy_concord': 'wrk_chalk_paint',
        'wrk_paint_barge_rust': 'wrk_chalk_paint',
        'wrk_paint_survey_white': 'wrk_chalk_paint',
        'wrk_paint_pirate_dark': 'wrk_chalk_paint',
    },
    'stripped': {
        # partially salvaged: steps 1-3 of fiction §2 are done. Heat is long gone.
        'wrk_hot_white': 'wrk_cut_edge',
        'wrk_hot_orange': 'wrk_cut_edge',
        'wrk_hot_deep_red': 'wrk_cut_edge',
        'wrk_fire_internal': None,
        'wrk_arc_blue': None,
        'wrk_vent_coolant': None,
    },
    'stripped_heavy': {
        'wrk_hot_white': 'wrk_cut_edge',
        'wrk_hot_orange': 'wrk_cut_edge',
        'wrk_hot_deep_red': 'wrk_cut_edge',
        'wrk_fire_internal': None,
        'wrk_arc_blue': None,
        'wrk_vent_coolant': None,
        'wrk_emerg_amber': None,
        'wrk_emerg_red': None,
        'wrk_insulation': None,       # cut out with the plating
        'wrk_cable': None,            # copper is money
    },
}

# Which authored sub-assemblies salvagers have already removed, per state. Keys are the section tags
# used by the family part-builders; fiction §2 fixes the ORDER (drive bells, then reactor, then
# sensors, then cargo, then plating -- frames never).
STATE_REMOVES = {
    'fresh': (),
    'cooling': (),
    'derelict': (),
    'stripped': ('drive_bell', 'sensor', 'reactor'),
    'stripped_heavy': ('drive_bell', 'sensor', 'reactor', 'cargo', 'plating'),
}


def log(msg):
    print(f'[wreck-aftermath] {msg}', flush=True)


def reset_scene():
    if not bpy.app.background:
        raise SystemExit('wreck pack authoring requires Blender --background')
    for obj in tuple(bpy.data.objects):
        bpy.data.objects.remove(obj, do_unlink=True)
    for blocks in (bpy.data.meshes, bpy.data.curves, bpy.data.cameras, bpy.data.lights):
        for block in tuple(blocks):
            if block.users == 0:
                blocks.remove(block)


def material(role):
    if role in bpy.data.materials:
        return bpy.data.materials[role]
    r, g, b, rough, metal = ROLES[role]
    mat = bpy.data.materials.new(role)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = (r, g, b, 1.0)
    bsdf.inputs['Roughness'].default_value = rough
    if 'Metallic' in bsdf.inputs:
        bsdf.inputs['Metallic'].default_value = metal
    strength = EMISSIVE_STRENGTH.get(role)
    if strength is not None and 'Emission Color' in bsdf.inputs:
        bsdf.inputs['Emission Color'].default_value = (r, g, b, 1.0)
        bsdf.inputs['Emission Strength'].default_value = strength
    return mat


# ---------------------------------------------------------------------------
# Assembly model.
#
# A family authors its INTACT vessel once, as a dict of section-tag -> [objects]. Wreck pieces are
# then (inclusion set, drift, break decoration). This is what makes "original silhouette vs wreck"
# a byproduct of the build rather than a second authoring job -- and it structurally guarantees the
# wreck is the destroyed version of something that functioned, because it literally is.

class Assembly:
    """Objects authored in the INTACT vessel's frame, tagged by section."""

    def __init__(self, name):
        self.name = name
        self.sections = {}
        self._role_of = {}

    def add(self, section, obj, role):
        obj.data.materials.clear()
        obj.data.materials.append(material(role))
        self._role_of[obj.name] = role
        self.sections.setdefault(section, []).append(obj)
        return obj

    def objects(self, keep=None, drop=()):
        out = []
        for tag, objs in self.sections.items():
            if keep is not None and tag not in keep:
                continue
            if any(d in tag for d in drop):
                continue
            out.extend(objs)
        return out

    def role_of(self, obj):
        return self._role_of.get(obj.name)

    def discard(self, objs):
        """Remove objects from the scene AND from this assembly (used by state removal)."""
        dead = set(o.name for o in objs)
        for tag in list(self.sections):
            self.sections[tag] = [o for o in self.sections[tag] if o.name not in dead]
        for o in objs:
            bpy.data.objects.remove(o, do_unlink=True)


# ---------------------------------------------------------------------------
# Primitives. Dimensions in metres. Direct `.parent` assignment reinterprets the object's current
# transform as LOCAL to the parent, which is what lets parts authored in the intact frame snap into
# a drifted section frame. NOTE the trap paid for by the everyday kit: re-parenting a child of an
# already-rotated group up to root DISCARDS the group's rotation. Drift is therefore applied to
# objects directly, never by re-parenting them out of a rotated empty.

def box(name, size, loc, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=loc, rotation=rot)
    o = bpy.context.active_object
    o.name = name
    o.scale = Vector(size)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return o


def cyl(name, radius, depth, loc, rot=(0, 0, 0), verts=16):
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=radius, depth=depth,
                                        location=loc, rotation=rot)
    o = bpy.context.active_object
    o.name = name
    return o


def tube(name, radius, depth, loc, rot=(0, 0, 0), verts=16):
    """Open-ended cylinder -- a hull ring you can see through, not a plug."""
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=radius, depth=depth,
                                        location=loc, rotation=rot, end_fill_type='NOTHING')
    o = bpy.context.active_object
    o.name = name
    return o


def cone(name, r1, r2, depth, loc, rot=(0, 0, 0), verts=16):
    bpy.ops.mesh.primitive_cone_add(vertices=verts, radius1=r1, radius2=r2, depth=depth,
                                    location=loc, rotation=rot)
    o = bpy.context.active_object
    o.name = name
    return o


def sphere(name, radius, loc, seg=16, rings=8):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=seg, ring_count=rings, radius=radius, location=loc)
    o = bpy.context.active_object
    o.name = name
    return o


def beam(name, a, b, radius, verts=6):
    """A member that physically SPANS a->b. Place-and-rotate drifts under compound rotation; span
    math cannot (the lane-furniture lesson)."""
    a, b = Vector(a), Vector(b)
    d = b - a
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=radius, depth=d.length,
                                        location=(a + b) * 0.5)
    o = bpy.context.active_object
    o.name = name
    o.rotation_mode = 'QUATERNION'
    o.rotation_quaternion = d.to_track_quat('Z', 'Y')
    return o


def plate(name, a, b, width, thick=0.22, roll=0.0):
    """A flat panel spanning a->b, `width` across, optionally rolled about its own long axis. The
    torn-plate fringe is built from these."""
    a, b = Vector(a), Vector(b)
    d = b - a
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(a + b) * 0.5)
    o = bpy.context.active_object
    o.name = name
    o.scale = Vector((thick, width, d.length))
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    o.rotation_mode = 'QUATERNION'
    q = d.to_track_quat('Z', 'Y')
    if roll:
        q = q @ Euler((0, 0, roll)).to_quaternion()
    o.rotation_quaternion = q
    return o


def ring_frame(name, radius, thick, center, verts=24):
    """A transverse structural ring in the YZ plane: the strong element that survives what the
    plating between two of them does not (fiction §1.1)."""
    bpy.ops.mesh.primitive_torus_add(location=center, major_radius=radius, minor_radius=thick,
                                     major_segments=verts, minor_segments=6,
                                     rotation=(0, math.pi / 2, 0))
    o = bpy.context.active_object
    o.name = name
    return o


# ---------------------------------------------------------------------------
# THE FRACTURE GRAMMAR (fiction §1). Everything here ADDS geometry at an authored plane. Nothing
# subtracts, nothing is random, nothing depends on a modifier or an addon.

def _basis(normal):
    n = Vector(normal).normalized()
    up = Vector((0, 0, 1))
    if abs(n.dot(up)) > 0.94:
        up = Vector((0, 1, 0))
    u = n.cross(up).normalized()
    v = n.cross(u).normalized()
    return n, u, v


def rib_fan(asm, tag, center, normal, radius, count, role='wrk_frame_steel',
            stub=3.4, thick=0.30, phase=0.0, squash=1.0):
    """Frame stubs projecting past the break. Fiction §1.1: a hull snaps in the weak BAY between
    frames, so the frames themselves survive and stick out of the cut. This is the single most
    important read in the pack -- it is what makes a break look structural instead of chopped."""
    n, u, v = _basis(normal)
    made = []
    for i in range(count):
        # authored, not random: a deterministic irregular sequence so no two stubs match
        ang = phase + (i / count) * math.tau
        wobble = 0.82 + 0.30 * ((i * 7) % 5) / 4.0
        length = stub * wobble
        p = Vector(center) + (u * math.cos(ang) + v * math.sin(ang) * squash) * radius
        tip = p + n * length + (u * math.cos(ang) + v * math.sin(ang)) * (0.28 * wobble)
        made.append(asm.add(tag, beam(f'{tag}_rib_{i}', p, tip, thick * wobble, verts=4), role))
    return made


def tear_fringe(asm, tag, center, normal, radius, count, role='wrk_torn_edge',
                depth=2.6, width=2.2, phase=0.37, squash=1.0):
    """Curled plating around the perimeter of a break. Ragged, uneven, folded outward and back --
    the opposite of the straight repeated edge a salvage torch leaves (fiction §2)."""
    n, u, v = _basis(normal)
    made = []
    for i in range(count):
        ang = phase + (i / count) * math.tau
        k = (i * 11) % 7
        d = depth * (0.55 + 0.22 * k)
        w = width * (0.7 + 0.16 * ((i * 5) % 4))
        curl = 0.5 + 0.42 * ((i * 3) % 5)
        base = Vector(center) + (u * math.cos(ang) + v * math.sin(ang) * squash) * radius
        tip = base + n * d - (u * math.cos(ang) + v * math.sin(ang)) * (0.35 * d)
        made.append(asm.add(tag, plate(f'{tag}_tear_{i}', base, tip, w, 0.14, roll=curl), role))
    return made


def cut_panel(asm, tag, corner, u_axis, v_axis, u_len, v_len, role='wrk_cut_edge', thick=0.20):
    """A salvage torch cut: STRAIGHT, square, repeated. Fiction §2 -- edge quality is the whole tell
    that separates 'someone stripped this' from 'something hit this'. Authored as a rectangular lip
    of clean edge, because we add rather than subtract; the missing plate is expressed by omitting
    the plating section, and this frames the hole it left."""
    u_axis = Vector(u_axis).normalized()
    v_axis = Vector(v_axis).normalized()
    c = Vector(corner)
    made = []
    for i, (a, b, w) in enumerate((
            (c, c + u_axis * u_len, thick),
            (c + v_axis * v_len, c + u_axis * u_len + v_axis * v_len, thick),
            (c, c + v_axis * v_len, thick),
            (c + u_axis * u_len, c + u_axis * u_len + v_axis * v_len, thick))):
        made.append(asm.add(tag, plate(f'{tag}_cut_{i}', a, b, 0.5, w), role))
    return made


def conduit_stubs(asm, tag, center, normal, radius, count, phase=0.9,
                  cable='wrk_cable', live=None):
    """Severed power/fluid runs hanging out of a break. `live` names the emissive role for arcing --
    fiction §4 keeps arcing the strongest emissive in the pack and therefore the smallest."""
    n, u, v = _basis(normal)
    made = []
    for i in range(count):
        ang = phase + (i / count) * math.tau
        droop = 0.4 + 0.5 * ((i * 5) % 3)
        p = Vector(center) + (u * math.cos(ang) + v * math.sin(ang)) * radius
        mid = p + n * 1.7 - Vector((0, 0, droop))
        tip = mid + n * 1.5 - Vector((0, 0, droop * 2.1))
        made.append(asm.add(tag, beam(f'{tag}_cbl_{i}a', p, mid, 0.16, verts=4), cable))
        made.append(asm.add(tag, beam(f'{tag}_cbl_{i}b', mid, tip, 0.13, verts=4), cable))
        if live and i % 3 == 0:
            made.append(asm.add(tag, sphere(f'{tag}_arc_{i}', 0.30, tuple(tip), seg=8, rings=5), live))
    return made


def ring_arc(asm, tag, name, radius, thick, center, a0_deg, a1_deg, role='wrk_frame_steel',
             segs=14, verts=6):
    """A PARTIAL ring frame, built from segments so it can be authored broken. Returns the two open
    ends so a caller can tear them. The frame nearest a break should never be pristine."""
    pts = []
    for i in range(segs + 1):
        a = math.radians(a0_deg + (a1_deg - a0_deg) * i / segs)
        pts.append(Vector(center) + Vector((0.0, math.cos(a) * radius, math.sin(a) * radius)))
    for i in range(segs):
        asm.add(tag, beam(f'{name}_{i}', pts[i], pts[i + 1], thick, verts=verts), role)
    return pts[0], pts[-1]


def torn_member(asm, tag, at, direction, r, *, splay=4, length=9.0, hot=None,
                role='wrk_torn_edge', peel=3, peel_len=11.0, peel_w=6.0):
    """The end of a structural member that FAILED IN TENSION: it does not stop flat, it frays.

    The member splits into several splayed fibres of unequal length, the plating that skinned it
    peels back in long curls, and -- where the section is thick -- the metal at the parting is still
    hot. Scale matters more than detail here: at a 165 m hull, a 4 m fray is invisible, so these run
    9-16 m and are the loudest shape at the break."""
    at = Vector(at)
    n, u, v = _basis(direction)
    for i in range(splay):
        ang = 0.31 + (i / splay) * math.tau
        k = (i * 7) % 5
        ln = length * (0.55 + 0.24 * k)
        off = (u * math.cos(ang) + v * math.sin(ang)) * r * 0.72
        tip = at + n * ln + off * (1.0 + 0.9 * (k / 4.0))
        asm.add(tag, beam(f'{tag}_fray_{i}', at + off * 0.5, tip, r * (0.30 + 0.10 * (k % 3)),
                          verts=5), role)
        if hot and i % 2 == 0:
            hr = min(0.55, r * 0.16)
            asm.add(tag, cyl(f'{tag}_hotfray_{i}', hr, hr * 1.4, tuple(tip),
                             rot=(0, math.pi / 2, 0), verts=8), hot)
    for i in range(peel):
        ang = 0.9 + (i / peel) * math.tau
        base = at + (u * math.cos(ang) + v * math.sin(ang)) * r * 0.95
        tip = base + n * peel_len * (0.6 + 0.3 * ((i * 5) % 3)) \
            - (u * math.cos(ang) + v * math.sin(ang)) * peel_len * 0.42
        asm.add(tag, plate(f'{tag}_peel_{i}', base, tip, peel_w * (0.7 + 0.2 * (i % 3)), 0.18,
                           roll=0.5 + 0.5 * (i % 4)), role)
    if hot:
        # a thin ring of parting metal sitting just proud of the section, not a plug filling it
        asm.add(tag, tube(f'{tag}_hotcore', r * 0.92, min(1.1, r * 0.3), tuple(at + n * 0.35),
                          rot=(0, math.pi / 2, 0), verts=12), hot)


def truss_break(asm, tag, members, *, cables=6, live_arc=None, cable_at=None):
    """A break across an OPEN FRAME: tear every real member that crossed the plane, and nothing else.
    `members` is a list of (point, direction, radius, hot_role|None)."""
    for i, (at, d, r, hot) in enumerate(members):
        torn_member(asm, f'{tag}_m{i}', at, d, r, hot=hot, peel=4,
                    length=max(6.0, min(12.0, r * 3.0)),
                    peel_len=max(5.0, min(9.0, r * 2.0)),
                    peel_w=max(2.0, min(4.0, r * 0.9)))
    if cables and cable_at:
        conduit_stubs(asm, f'{tag}_cbl', cable_at[0], cable_at[1], cable_at[2], cables,
                      live=live_arc)


def break_plane(asm, tag, center, normal, radius, *, ribs=11, tears=9, cables=5,
                hot=None, live_arc=None, squash=1.0, stub=3.4, rib_role='wrk_frame_steel'):
    """The complete authored break: rib fan + torn plate fringe + severed conduit + optional hot
    metal on the thick sections. One call per cut."""
    made = []
    made += rib_fan(asm, tag, center, normal, radius * 0.94, ribs, role=rib_role,
                    stub=stub, squash=squash)
    made += tear_fringe(asm, tag, center, normal, radius, tears, squash=squash)
    if cables:
        made += conduit_stubs(asm, tag, center, normal, radius * 0.55, cables, live=live_arc)
    if hot:
        # heat survives in the THICK sections only -- thin plate cooled first (fiction §3 cooling).
        n, u, v = _basis(normal)
        for i in range(max(3, ribs // 2)):
            ang = 0.21 + (i / max(3, ribs // 2)) * math.tau
            p = Vector(center) + (u * math.cos(ang) + v * math.sin(ang) * squash) * (radius * 0.94)
            made.append(asm.add(tag, cyl(f'{tag}_hot_{i}', 0.34, 0.5, tuple(p + n * 0.2),
                                         rot=(0, math.pi / 2, 0), verts=8), hot))
    return made


def cooling_cracks(asm, tag, path, role='wrk_hot_deep_red', radius=0.13):
    """Dull red seams tracing real structural lines (fiction §4: never a decal scatter). `path` is a
    list of points; the crack follows it."""
    made = []
    for i in range(len(path) - 1):
        made.append(asm.add(tag, beam(f'{tag}_crack_{i}', path[i], path[i + 1], radius, verts=4), role))
    return made


def vent_jet(asm, tag, origin, direction, length, role='wrk_vent_coolant', r0=0.55):
    """Pressure still behind it: a hard straight jet, tapering. Direction shows where the breach is."""
    d = Vector(direction).normalized()
    o = Vector(origin)
    n, u, v = _basis(d)
    made = []
    # A PARTICLE SPRAY, authored. Two earlier attempts failed for opposite reasons: a stack of
    # cylinders rendered as a white POLE bolted to the bridge, and a stack of cones rendered as a
    # solid white ice-cream cone. Escaping gas has no silhouette -- it has to be built from many
    # small elements that thin out with distance, or the emissive just becomes a shape.
    count = 14
    for i in range(count):
        t = (i + 1) / count
        k = (i * 7) % 5
        spread = t * length * 0.16 * (0.4 + 0.3 * k)
        ang = 0.7 + i * 1.9
        at = o + d * (length * t) + (u * math.cos(ang) + v * math.sin(ang)) * spread
        r = r0 * (1.25 - t * 0.85) * (0.7 + 0.16 * k)
        if r <= 0.04:
            continue
        made.append(asm.add(tag, sphere(f'{tag}_vent_{i}', r, tuple(at), seg=7, rings=5), role))
    return made


def scorch_trail(asm, tag, center, u_axis, v_axis, size, role='wrk_scorch',
                 edge_role='wrk_scorch_edge', thick=0.09):
    """A burn on the SKIN, with a heat-tint ring around it. Fiction §4: scorch must be edge-lit by
    what it hides -- a half-burned faction mark says more than a clean one. Placed on -Y / +X faces
    only; a scorch on +Y is invisible to every review render this project makes."""
    c = Vector(center)
    u = Vector(u_axis).normalized()
    v = Vector(v_axis).normalized()
    made = [asm.add(tag, plate(f'{tag}_scorch', c - u * size * 0.5, c + u * size * 0.5,
                               size * 0.72, thick), role)]
    made.append(asm.add(tag, plate(f'{tag}_scorch_ring', c - u * size * 0.72, c + u * size * 0.72,
                                   size * 0.98, thick * 0.6), edge_role))
    return made


def drift_spec(offset, tumble_axis=(0, 0, 1), tumble_deg=0.0, note=None):
    """Fiction §1.4: everything that leaves, leaves ALONG A VECTOR -- away from its break plane,
    carrying the rotation the parting torque gave it.

    This is deliberately PURE DATA and does not move the exported geometry. A separated section is
    shipped centred on its own origin, because that is what an asset has to be; the drift is a
    STAGING transform relative to the parent wreck, recorded in build-report.json and applied by the
    composition render. That split is what makes the fiction reviewable: a per-asset render can
    never answer 'did it drift away from where it tore off', and a per-asset envelope inflated by a
    drift offset is just a wrong number. The composition sheet answers it; the report proves it."""
    ax = Vector(tumble_axis).normalized()
    off = Vector(offset)
    spec = {
        'offsetM': [round(v, 2) for v in off],
        'tumbleAxis': [round(v, 3) for v in ax],
        'tumbleDeg': round(tumble_deg, 1),
        'driftDistanceM': round(off.length, 2),
    }
    if note:
        spec['note'] = note
    return spec


def staged(root, ship_origin, spec):
    """Apply a drift spec to a built root, for composition renders only."""
    from mathutils import Quaternion
    off = Vector(spec['offsetM']) if spec else Vector((0, 0, 0))
    root.location = Vector(ship_origin) + off
    if spec and spec.get('tumbleDeg'):
        root.rotation_mode = 'QUATERNION'
        root.rotation_quaternion = Quaternion(Vector(spec['tumbleAxis']),
                                              math.radians(spec['tumbleDeg']))
    return root


# ---------------------------------------------------------------------------
# Sockets. Named empties following the convention already in the LEASED assets (place_dead_hulk has
# SOCKET_Hazard_Core / SOCKET_Salvage_Core; the cathedral has INTERACTION_HangarCavity), so a
# promotion lane reads them with the code it already has. Childless empties are exactly the thing
# that silently vanishes on export -- verify_sockets() re-parses the GLB and proves they survived.

def socket(name, loc, size=2.0):
    bpy.ops.object.empty_add(type='PLAIN_AXES', location=loc, radius=size)
    o = bpy.context.active_object
    o.name = name
    return o


def gap_clearance(objs, center):
    """Exact distance from `center` to the nearest point on any mesh SURFACE.

    Uses closest_point_on_mesh rather than bounding boxes: an AABB test is useless for the shape
    that matters most here, because the probe sits inside a ring frame's bounding box while being
    24 m clear of the ring itself. This is the measurement behind every 'navigable gap' claim --
    fiction §7 makes the gap a commitment, and a gap the player cannot fit through is worse than no
    gap at all, because they will try."""
    c = Vector(center)
    best = float('inf')
    nearest = None
    for o in objs:
        if o.type != 'MESH' or not o.data.polygons:
            continue
        try:
            hit, loc, _n, _i = o.closest_point_on_mesh(o.matrix_world.inverted() @ c)
        except (RuntimeError, ValueError):
            continue
        if not hit:
            continue
        d = ((o.matrix_world @ loc) - c).length
        if d < best:
            best, nearest = d, o.name
    return best, nearest


def apply_state(asm, state):
    """Walk the ladder: remove what salvagers took, then substitute what time did."""
    subs = STATE_SUBS.get(state, {})
    removes = STATE_REMOVES.get(state, ())
    if removes:
        doomed = []
        for tag, objs in asm.sections.items():
            if any(r in tag for r in removes):
                doomed.extend(objs)
        if doomed:
            asm.discard(doomed)
    if not subs:
        return
    doomed = []
    for tag, objs in list(asm.sections.items()):
        for o in objs:
            role = asm.role_of(o)
            if role not in subs:
                continue
            repl = subs[role]
            if repl is None:
                doomed.append(o)
            else:
                o.data.materials.clear()
                o.data.materials.append(material(repl))
                asm._role_of[o.name] = repl
    if doomed:
        asm.discard(doomed)


PAINT_ROLES = frozenset((
    'wrk_paint_freight_ochre', 'wrk_paint_liner_bone', 'wrk_paint_navy_concord',
    'wrk_paint_barge_rust', 'wrk_paint_survey_white', 'wrk_paint_pirate_dark',
    'wrk_paint_mismatch_a', 'wrk_paint_mismatch_b', 'wrk_hull_bare',
))


def scorch_from_break(asm, at, reach, core=0.42):
    """Burn the paint AS A GRADIENT falling off from the break, instead of pasting decals on.

    Two marks 15 m long on a 178 m hull is not "scorched paint revealing faction history" (fiction
    4) -- it is a texture nobody reads. Damage is a field, not a sticker. Driving it off the break
    location also makes directional damage (fiction 1.6) automatic for every family authored after
    this: the near end is burnt back to bare metal, the far end still wears its owner's colours,
    and no one has to hand-place a single mark."""
    at = Vector(at)
    for tag, objs in asm.sections.items():
        for o in objs:
            role = asm.role_of(o)
            if role not in PAINT_ROLES:
                continue
            d = (o.matrix_world.translation - at).length
            if d > reach:
                continue
            new = 'wrk_scorch' if d < reach * core else 'wrk_scorch_edge'
            o.data.materials.clear()
            o.data.materials.append(material(new))
            asm._role_of[o.name] = new


def finish(asm, name, sockets=(), recentre=True):
    """Parent everything to a named root empty, and RECENTRE the piece on its own origin.

    A wreck section is authored in the intact vessel's frame -- the freighter's drive block is built
    at x = -134 because that is where it was on the ship. An exported asset centred 134 m from its
    own origin is a bug in every consumer that touches it. So the geometry is shifted onto its
    origin and the shift is returned: that offset IS the piece's position in the vessel it came from,
    which is exactly the number the composition render needs to put the ship back together.

    Returns (root, shipFrameOriginM)."""
    offset = Vector((0, 0, 0))
    meshes = [o for o in asm.objects() if o.type == 'MESH']
    if recentre and meshes:
        pts = []
        for o in meshes:
            pts.extend(o.matrix_world @ Vector(c) for c in o.bound_box)
        lo = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
        hi = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
        offset = (lo + hi) * 0.5
        for o in list(asm.objects()) + list(sockets):
            o.location = o.location - offset
    bpy.ops.object.empty_add(type='PLAIN_AXES', location=(0, 0, 0), radius=3.0)
    root = bpy.context.active_object
    root.name = name
    for obj in asm.objects():
        obj.parent = root
    for sock in sockets:
        sock.parent = root
    bpy.context.view_layer.update()
    return root, [round(v, 2) for v in offset]



# ===========================================================================
# FAMILY BUILDERS — Forge-derived wrecks (GFX-7)
#
# Every piece is cut from a real Forge donor hull by wreck_kit: run the donor's own build(),
# keep a region, split it on jagged multi-plane cuts, cap the wounds with scorched plate, grow
# exposed frame ribs and torn flanges along the cut, then apply a damage state. The catalog
# contract (src/data/wreckAftermathDressing.js) is unchanged — same ids, file names, longestM,
# socket names and gap probes; only the geometry source changed.
#
# Donors (fiction §5 — the wreck must still say what it was):
#   ore_freighter <- ore_barge.py             the pack freighter was always drawn as a hopper
#                                             bulk hauler; the barge IS that ship
#   corvette      <- bastion.py               the player corvette: compact armoured hull, citadel,
#                                             two turrets. warden.py is a tier-4 sponson gunship —
#                                             a class above "patrol corvette" — so bastion is the
#                                             honest donor.
#   liner         <- massline_express_liner.py the only passenger hull in the fleet; the drum +
#                                             wedge bow are its identity.

DONOR_ORE = 'ore_barge'
DONOR_CORVETTE = 'bastion'
DONOR_LINER = 'massline_express_liner'


def _asm(ship):
    """finish() expects an Assembly with .objects(); a wreck-kit Ship plays the same role."""
    class _A:
        def objects(self, keep=None, drop=()):
            return list(ship.objects)
    return _A()


def _meta(family, kind, state, was, reads, drift=None, drift_note=None):
    return {'family': family, 'kind': kind, 'state': state, 'was': was, 'reads': reads,
            'drift': drift, 'driftNote': drift_note}


def _finish_forge(ship, pid, longest_m, socks_m, meta, probes=()):
    """Scale donor units to the catalog longestM, Forge-finish every mesh, wrap in the pack root.
    socks_m / probes take DONOR-frame positions; they are scaled with the piece."""
    k = W.scale_to_longest(ship, longest_m)
    W.finish_piece(ship)
    socks = [socket(n, tuple(Vector(p) * k), size=sz) for n, p, sz in socks_m]
    root, origin = finish(_asm(ship), pid, socks)
    meta = dict(meta)
    meta['sockets'] = [s.name for s in socks]
    meta['shipFrameOriginM'] = origin
    if probes:
        meta['gapProbes'] = [
            {'name': n, 'atM': [round(Vector(p)[i] * k - origin[i], 2) for i in range(3)]}
            for n, p in probes]
    return root, meta


def _blank_donor(ship_id=DONOR_ORE):
    """A Forge Ship with its palette/materials but no hull — the canvas for kit-authored
    fragments and components that carry the shared Forge finish vocabulary."""
    s = W.build_donor(ship_id)
    W.clear_objects(s)
    return s


def _intact(ship_id, name, was, reads):
    """The 'as built' reference for silhouette sheets: the Forge donor itself, finished."""
    s = W.build_donor(ship_id)
    W.finish_piece(s)
    root, origin = finish(_asm(s), name, ())
    return root, {'family': name.split('_')[1], 'kind': 'reference', 'state': 'intact',
                  'was': was, 'reads': reads, 'sockets': [], 'shipFrameOriginM': origin,
                  'drift': None}


# ---------------------------------------------------------------------------
# FAMILY 1 — BULK ORE FREIGHTER   (donor: Forge ore_barge)
#
# Identity that survives dismemberment (fiction §5): deep hoppers sunk in an open deck, hazard
# coamings, a pusher stern. The barge's own geometry carries all of it.

def build_wreck_ore_freighter_bow(state='cooling'):
    """PRIMARY. Forward hopper deck of a Forge ore barge — hoppers, gantry, forecastle — with a
    bay torn clean out between two lobes. Bare frame rings and chords span the gap; the gap is
    the pack's navigable wound."""
    s = W.build_donor(DONOR_ORE)
    W.keep_band(s, lo=-4.0, hi=None, axis=0, seed=11, jag=0.3,
                drop=('NavStarboard', 'NavPort', 'Mast', 'Beacon', 'LampBar', 'Flood'))
    # Band is wide enough that the frame rings can hug the cut faces and still leave the probe
    # point >= 20 m clear of every mesh (INTERACTION_RibcageGap is measured, not asserted).
    W.carve_band(s, 0.5, 10.5, axis=0, seed=17, jag=0.3)
    for i, rx in enumerate((1.4, 9.6)):
        W.mk_ring_arc(s, f'GapRing{i}', 4.6, 0.5, 0.42, 0.0, 360.0, center=(rx, 0, 0),
                      segments=28, finish='wk_frame')
    for i, (cy, cz) in enumerate(((4.1, 0.0), (-4.1, 0.0), (0.0, 4.0), (0.0, -4.0))):
        W._mk_beam(s, f'GapChord{i}', (0.6, cy, cz), (10.4, cy, cz), 0.2, finish='wk_frame')
    W.wound(s, 'woundFore', (0.5, 0, 0), (1, 0, 0), 4.3, seed=3, stub=0.3, squash=0.55)
    W.wound(s, 'woundAft', (10.5, 0, 0), (-1, 0, 0), 4.3, seed=8, stub=0.3, squash=0.55)
    W.scorch_gradient(s, (0.5, 0, 0), 4.5)
    W.scorch_gradient(s, (10.5, 0, 0), 4.5)
    W.apply_damage_state(s, state, cut_at=(0.5, 0, 0.8), seed=11)
    return _finish_forge(
        s, 'wreck_ore_freighter_bow', 179.0,
        [('SOCKET_Salvage_Bridge', (17.6, 0.0, 2.4), 2.0),
         ('SOCKET_Salvage_Hopper', (12.0, 0.0, 1.7), 2.0),
         ('SOCKET_Hazard_Break', (10.0, 0.0, 1.2), 2.0),
         ('SOCKET_BlackBox', (16.9, 1.6, 1.9), 2.0),
         ('INTERACTION_RibcageGap', (5.5, 0.0, 0.0), 20.0)],
        _meta('ore_freighter', 'primary', state,
              'Bulk ore freighter (Forge ore barge), forward hopper deck: bow, forecastle and '
              'the forward cargo bays.',
              'Deep hopper wells and hazard coamings say freighter; the bay torn out between the '
              'lobes is spanned only by bare frame rings — the hull snapped between frames and '
              'the missing bay is now a fly-through wound.'),
        probes=[('INTERACTION_RibcageGap', (5.5, 0.0, 0.0))])


def build_wreck_ore_freighter_stern(state='cooling'):
    """SECONDARY. The working end — drive block, four bells, radiator fins, command tower —
    parted at the forward break and drifted off with a slow tumble."""
    s = W.build_donor(DONOR_ORE)
    W.keep_band(s, lo=None, hi=-4.0, axis=0, seed=23, jag=0.3,
                drop=('BowLamp', 'FoscleFlood', 'Windlass', 'BowFender'))
    W.wound(s, 'woundFwd', (-4.0, 0, 0), (1, 0, 0), 4.3, seed=5, stub=0.55, squash=0.55)
    W.scorch_gradient(s, (-4.0, 0, 0), 5.0)
    W.apply_damage_state(s, state, cut_at=(-4.0, 0, 0.8), seed=23)
    d = drift_spec((-34.0, -19.0, 7.0), tumble_axis=(0.2, -0.3, 0.93), tumble_deg=24.0,
                   note='the drive end took the momentum; it backs away from the break')
    return _finish_forge(
        s, 'wreck_ore_freighter_stern', 145.0,
        [('SOCKET_Salvage_Drive', (-21.0, 1.95, 1.9), 2.0),
         ('SOCKET_Hazard_Reactor', (-19.5, 0.0, 0.0), 2.0),
         ('SOCKET_Salvage_Radiator', (-19.9, 2.9, 1.5), 2.0)],
        _meta('ore_freighter', 'secondary', state,
              'Bulk ore freighter (Forge ore barge), stern: drive block, command tower, radiators.',
              'The business end survived whole — which is why the read is "salvage target", not '
              'debris: intact drives, dead lights, the tower windows dark.',
              drift=d))


def build_wreck_ore_freighter_hopper(state='cooling'):
    """SECONDARY. One hopper bay with its ore load still aboard, torn out of the trunk between
    the two frame rings that held it."""
    s = W.build_donor(DONOR_ORE)
    W.keep_band(s, lo=9.8, hi=14.3, axis=0, seed=31, jag=0.4)
    W.wound(s, 'woundA', (9.8, 0, 0.3), (-1, 0, 0), 4.0, seed=9, stub=0.4, squash=0.5)
    W.wound(s, 'woundB', (14.3, 0, 0.3), (1, 0, 0), 4.0, seed=13, stub=0.4, squash=0.5)
    W.scorch_gradient(s, (9.8, 0, 0), 3.5)
    W.scorch_gradient(s, (14.3, 0, 0), 3.5)
    W.apply_damage_state(s, state, seed=31)
    return _finish_forge(
        s, 'wreck_ore_freighter_hopper', 49.0,
        [('SOCKET_Salvage_Ore', (12.0, 0.0, 1.4), 2.0)],
        _meta('ore_freighter', 'secondary', state,
              'One cargo hopper bay of the ore barge, ore still heaped in the well.',
              'A whole hold section — the ore heap says the cargo left with the break, which is '
              'exactly the story the bow\'s empty gap tells from the other side.'))


def build_deb_ore_freighter_ring_span(state='cooling'):
    """DEBRIS. A trunk frame ring, torn open at one arc — the part of the freighter that does not
    read as hull at all until you see the hopper coaming still bolted to it."""
    s = _blank_donor(DONOR_ORE)
    W.mk_ring_arc(s, 'RingArc', 4.7, 0.55, 0.45, -70.0, 205.0, segments=24, finish='wk_frame')
    # a coaming plate still rides the intact arc, and stubs fray where the ring snapped
    W._mk_plate(s, 'Coaming', (0.4, -3.4, 1.8), (0.4, -1.2, 4.2), 2.6, 0.16, roll=0.3,
                finish='wk_torn')
    W.frame_stubs(s, 'endA', (0.0, 3.6, -3.0), (0, -0.75, 0.66), 0.5, count=3, stub=0.7, seed=4)
    W.frame_stubs(s, 'endB', (0.0, 2.4, 4.1), (0, -0.5, -0.86), 0.5, count=3, stub=0.7, seed=9)
    W.apply_damage_state(s, state, seed=7)
    return _finish_forge(
        s, 'deb_ore_freighter_ring_span', 53.0, [],
        _meta('ore_freighter', 'debris', state,
              'One ring frame of the freighter trunk, snapped at the lower arc.',
              'Bare frame with a coaming plate still on it — the piece that explains what the '
              'ribcage gap in the bow section used to hold.'))


def build_deb_ore_freighter_hopper_lid(state='cooling'):
    """DEBRIS. A hopper coaming with its deck plate — the lid the open hopper lost."""
    s = W.build_donor(DONOR_ORE)
    W.keep_band(s, lo=10.0, hi=14.0, axis=0, also={2: (0.15, None)}, seed=37, jag=0.35)
    W.wound(s, 'lidA', (10.0, 0, 0.9), (-1, 0, 0), 3.6, seed=2, stub=0.3, ribs=6, tears=5)
    W.apply_damage_state(s, state, seed=37)
    return _finish_forge(
        s, 'deb_ore_freighter_hopper_lid', 32.0, [],
        _meta('ore_freighter', 'debris', state,
              'The deck plate and coaming around one hopper mouth, peeled off the trunk.',
              'Flat plate with the hopper rim in it — reads as the missing piece of the hopper '
                  'wreck next to it in the field.'))


def build_deb_ore_freighter_drive_bell(state='stripped'):
    """DEBRIS. The drive face of the barge — all four nozzle bells still in their block."""
    s = W.build_donor(DONOR_ORE)
    W.keep_band(s, lo=None, hi=-20.0, axis=0, seed=41, jag=0.35,
                drop=('NavStarboard', 'NavPort', 'Radiator'))
    W.wound(s, 'bellWound', (-20.0, 0, 0), (1, 0, 0), 3.6, seed=6, stub=0.5, squash=0.7)
    W.apply_damage_state(s, state, seed=41)
    return _finish_forge(
        s, 'deb_ore_freighter_drive_bell', 16.0, [],
        _meta('ore_freighter', 'debris', state,
              'The stern drive face of the ore barge: four bells in a square block.',
              'Four dark bells pointing one way — an engine room with the ship torn off it.'))


# ---------------------------------------------------------------------------
# FAMILY 2 — PATROL CORVETTE   (donor: Forge bastion — the player corvette)

def build_wreck_corvette_forward(state='cooling'):
    """PRIMARY. Bow and citadel of a Forge bastion corvette — both turrets, bridge tower, sensor
    mast — sheared aft of the bridge."""
    s = W.build_donor(DONOR_CORVETTE)
    W.keep_band(s, lo=-2.5, hi=None, axis=0, seed=43, jag=0.25,
                drop=('NavStarboard', 'NavPort'))
    W.wound(s, 'woundAft', (-2.5, 0, 0.4), (-1, 0, 0), 2.9, seed=4, stub=0.4, squash=0.7)
    W.scorch_gradient(s, (-2.5, 0, 0.4), 3.5)
    W.apply_damage_state(s, state, cut_at=(-2.5, 0, 1.0), seed=43)
    d = drift_spec((16.0, 22.0, -4.0), tumble_axis=(0.9, 0.1, 0.42), tumble_deg=31.0,
                   note='the bow spun away on the forward vector')
    return _finish_forge(
        s, 'wreck_corvette_forward', 89.0,
        [('SOCKET_Salvage_Barbette', (5.0, 0.0, 1.7), 2.0),
         ('SOCKET_Hazard_Break', (-2.4, 0.0, 0.6), 2.0),
         ('SOCKET_BlackBox', (-1.8, 0.6, 2.3), 2.0),
         ('SOCKET_Evidence_Registry', (8.6, -2.4, 0.7), 2.0)],
        _meta('corvette', 'primary', state,
              'Concord-pattern patrol corvette (Forge bastion), forward hull: citadel, bridge, '
              'two main turrets.',
              'Armoured casemate and gun houses say warship; the lit-window bridge is what turns '
              'it into a crew\'s ship that ended.',
              drift=d))


def build_wreck_corvette_engine(state='cooling'):
    """SECONDARY. The aft hull — drive block, three torch nozzles, armour belts — split off at
    the citadel break."""
    s = W.build_donor(DONOR_CORVETTE)
    W.keep_band(s, lo=None, hi=-2.5, axis=0, seed=47, jag=0.25,
                drop=('NavStarboard', 'NavPort'))
    W.wound(s, 'woundFwd', (-2.5, 0, 0.3), (1, 0, 0), 2.9, seed=7, stub=0.45, squash=0.7)
    W.scorch_gradient(s, (-2.5, 0, 0.3), 3.5)
    W.apply_damage_state(s, state, cut_at=(-2.5, 0, 0.8), seed=47)
    d = drift_spec((-26.0, -11.0, 5.0), tumble_axis=(-0.3, 0.5, 0.81), tumble_deg=18.0,
                   note='it fell off the break under the drive\'s dead momentum')
    return _finish_forge(
        s, 'wreck_corvette_engine', 73.0,
        [('SOCKET_Salvage_Drive', (-10.4, 0.7, 0.2), 2.0),
         ('SOCKET_Hazard_Reactor', (-9.6, 0.0, 0.4), 2.0)],
        _meta('corvette', 'secondary', state,
              'Patrol corvette (Forge bastion), aft hull: drive block, belts, casemates.',
              'Three dead torches in an armoured frame — the engine section that never fired '
              'again.', drift=d))


def build_wreck_corvette_turret(state='cooling'):
    """SECONDARY. One complete turret — race, house, twin barrels — blown off its barbette."""
    s = W.build_donor(DONOR_CORVETTE)
    W.take_parts(s, ('TurretA',))
    W.torn_flange(s, 'trBase', (5.0, 0, 0.75), (0, 0, -1), 0.9, count=6, depth=0.5, width=0.5,
                  seed=3)
    W.apply_damage_state(s, state, seed=51)
    d = drift_spec((-6.0, 30.0, 9.0), tumble_axis=(0.4, -0.7, 0.6), tumble_deg=67.0,
                   note='it tumbles like the thing that threw it was still exploding')
    return _finish_forge(
        s, 'wreck_corvette_turret', 16.0,
        [('SOCKET_Salvage_Weapon', (5.0, 0.0, 1.5), 2.0)],
        _meta('corvette', 'secondary', state,
              'A whole corvette turret, torn from the deck ring.',
              'Gun house with both barrels still on it — firepower drifting loose is the detail '
              'that says the fight was violent, not slow.', drift=d))


def build_deb_corvette_armor_belt(state='cooling'):
    """DEBRIS. A flank armour belt — the layered side slabs with their stripe banding, both rows
    still tied by the frames that carried them."""
    s = W.build_donor(DONOR_CORVETTE)
    W.take_parts(s, ('Belt',))
    for i, x in enumerate((-6.4, -3.2, -0.4)):
        W._mk_beam(s, f'BeltTie{i}', (x, -3.2, -0.4), (x, 3.2, -0.4), 0.16, finish='wk_frame')
    W.torn_flange(s, 'beltTear', (-8.9, 0, -0.4), (-1, 0, 0), 3.0, count=5, depth=0.9, width=0.7,
                  seed=5)
    W.apply_damage_state(s, state, seed=57)
    return _finish_forge(
        s, 'deb_corvette_armor_belt', 23.0, [],
        _meta('corvette', 'debris', state,
              'The corvette\'s flank armour belt, peeled off in one run.',
              'Layered slabs with the warning-stripe edge — warship skin without the warship.'))


def build_deb_corvette_barbette_ring(state='stripped'):
    """DEBRIS. The barbette ring a turret used to sit in — race ring and mount stump."""
    s = W.build_donor(DONOR_CORVETTE)
    W.take_parts(s, ('TurretBRing', 'TurretBRace', 'TurretBBarbette'))
    W.frame_stubs(s, 'barbRim', (1.4, 0, 1.5), (0, 0, 1), 0.95, count=4, stub=0.4, seed=2)
    W.apply_damage_state(s, state, seed=59)
    return _finish_forge(
        s, 'deb_corvette_barbette_ring', 11.0, [],
        _meta('corvette', 'debris', state,
              'The barbette ring under turret B, cut out of the deck.',
              'A gun mount with no gun — pairs with the loose turret drifting in the same field.'))


# ---------------------------------------------------------------------------
# FAMILY 3 — CIVILIAN PASSENGER LINER   (donor: Forge massline_express_liner)

def build_wreck_liner_drum(state='cooling'):
    """PRIMARY. A mid-ship slice of the liner's habitation drum, split open down the keel: two
    half-shells standing apart, deck windows still strung along the flanks. The bore between the
    halves is the pack's second navigable gap."""
    s = W.build_donor(DONOR_LINER)
    W.keep_band(s, lo=-16.0, hi=-6.0, axis=0, seed=61, jag=0.3,
                drop=('NavStarboard', 'NavPort', 'Mast', 'Beacon', 'Dish'))
    W.carve_band(s, -4.9, 4.9, axis=1, seed=67, jag=0.25)
    # end bulkhead ribs still tie the two half-shells together at both cut faces
    for i, x in enumerate((-15.6, -6.4)):
        for j, z in enumerate((-4.55, 4.75)):
            W._mk_beam(s, f'BhRib{i}{j}', (x, -4.85, z), (x, 4.85, z), 0.22, finish='wk_frame')
    W.wound(s, 'woundA', (-16.0, 0, 0.2), (-1, 0, 0), 7.6, seed=10, stub=0.5, squash=0.62)
    W.wound(s, 'woundB', (-6.0, 0, 0.2), (1, 0, 0), 7.6, seed=15, stub=0.5, squash=0.62)
    W.scorch_gradient(s, (-16.0, 0, 0), 4.0)
    W.scorch_gradient(s, (-6.0, 0, 0), 4.0)
    W.apply_damage_state(s, state, cut_at=(-6.0, 4.0, 4.0), seed=61)
    return _finish_forge(
        s, 'wreck_liner_drum', 87.0,
        [('SOCKET_Salvage_Hab', (-11.0, 6.8, 1.0), 2.0),
         ('SOCKET_Hazard_Wound', (-11.0, 4.5, -3.0), 2.0),
         ('SOCKET_BlackBox', (-7.2, 6.4, 3.6), 2.0),
         ('INTERACTION_DrumBore', (-11.0, 0.0, 0.0), 20.0)],
        _meta('liner', 'primary', state,
              'Civilian passenger liner (Forge massline), mid habitation drum, split lengthwise.',
              'Rows of dead cabin windows on two half-shells — the drum cracked along its keel '
              'and the gap between the halves is the way through.',
              ),
        probes=[('INTERACTION_DrumBore', (-11.0, 0.0, 0.0))])


def build_wreck_liner_bow(state='cooling'):
    """SECONDARY. The liner's wedge bow — glazed operations bridge, drum shoulder, skylights —
    parted almost clean. Which is the cruelty of it."""
    s = W.build_donor(DONOR_LINER)
    W.keep_band(s, lo=4.0, hi=None, axis=0, seed=71, jag=0.25,
                drop=('NavStarboard', 'NavPort', 'DockLamp'))
    W.wound(s, 'woundAft', (4.0, 0, 0.2), (-1, 0, 0), 6.8, seed=12, stub=0.55, squash=0.6)
    W.scorch_gradient(s, (4.0, 0, 0), 4.5)
    W.apply_damage_state(s, state, cut_at=(4.0, 2.0, 3.5), seed=71)
    d = drift_spec((30.0, 14.0, -6.0), tumble_axis=(0.14, 0.36, 0.92), tumble_deg=21.0,
                   note='barely tumbled: it parted cleanly and kept the ship attitude')
    return _finish_forge(
        s, 'wreck_liner_bow', 69.0,
        [('SOCKET_Salvage_Bridge', (13.2, 0.0, 3.0), 2.0),
         ('SOCKET_BlackBox', (6.5, 3.0, 5.2), 2.0)],
        _meta('liner', 'secondary', state,
              'Passenger liner forward hull: wedge bow, glazed bridge, drum shoulder.',
              'Almost undamaged — whatever happened, it happened behind this bulkhead.',
              drift=d))


def build_wreck_liner_boatbay(state='cooling'):
    """SECONDARY. The boarding dock sector: a drum section carrying the dock collar and service
    hatch, with the galleries still on the roof."""
    s = W.build_donor(DONOR_LINER)
    W.keep_band(s, lo=-1.5, hi=8.0, axis=0, seed=73, jag=0.3,
                drop=('NavStarboard', 'NavPort'))
    W.wound(s, 'bayA', (-1.5, 0, 0.2), (-1, 0, 0), 7.6, seed=14, stub=0.5, squash=0.62)
    W.wound(s, 'bayB', (8.0, 0, 0.2), (1, 0, 0), 7.2, seed=19, stub=0.5, squash=0.62)
    W.scorch_gradient(s, (-1.5, 0, 0), 4.0)
    W.apply_damage_state(s, state, seed=73)
    return _finish_forge(
        s, 'wreck_liner_boatbay', 54.0,
        [('SOCKET_Salvage_Bay', (3.4, -8.9, 0.4), 2.0),
         ('SOCKET_Evidence_Manifest', (-0.5, -8.4, 3.4), 2.0)],
        _meta('liner', 'secondary', state,
              'Liner boarding sector: dock collar, service hatch, roof galleries.',
              'The yellow dock ring says exactly what this bay was for — passengers used to walk '
              'through this.'))


def build_deb_liner_hull_panel(state='cooling'):
    """DEBRIS. A quarter-shell plate off the drum — the section with two decks of cabin windows."""
    s = W.build_donor(DONOR_LINER)
    W.keep_band(s, lo=-13.5, hi=-9.5, axis=0, also={1: (2.5, None), 2: (0.5, None)},
                seed=79, jag=0.35)
    W.wound(s, 'panelRim', (-11.5, 4.5, 0.6), (-1, 0, 0), 3.4, seed=8, stub=0.35, ribs=6,
            tears=5, squash=0.7)
    W.apply_damage_state(s, state, seed=79)
    return _finish_forge(
        s, 'deb_liner_hull_panel', 29.0, [],
        _meta('liner', 'debris', state,
              'A curved drum plate with two decks of dead windows in it.',
              'A panel of a home, torn off whole — the liner read survives in fragments.'))


def build_deb_liner_drive_pod(state='stripped'):
    """DEBRIS. The liner's stern block — three nozzles in a shouldered housing."""
    s = W.build_donor(DONOR_LINER)
    W.keep_band(s, lo=None, hi=-18.4, axis=0, seed=83, jag=0.3,
                drop=('NavStarboard', 'NavPort', 'Vent'))
    W.wound(s, 'podCut', (-18.4, 0, 0.3), (1, 0, 0), 5.4, seed=6, stub=0.5, squash=0.6)
    W.apply_damage_state(s, state, seed=83)
    return _finish_forge(
        s, 'deb_liner_drive_pod', 18.0, [],
        _meta('liner', 'debris', state,
              'The liner\'s stern drive block with all three nozzles.',
              'An engine face with no ship behind it — the pods read as machinery even without '
              'the hull.'))


# ---------------------------------------------------------------------------
# AFTERMATH COMPONENT KIT — shared donor cuts (the routine-fight debris field)

def build_aft_engine_section(state='cooling'):
    """The barge's whole working tail: drive loft, four bells, radiator fins."""
    s = W.build_donor(DONOR_ORE)
    W.keep_band(s, lo=None, hi=-17.8, axis=0, seed=89, jag=0.35)
    W.wound(s, 'engCut', (-17.8, 0, 0), (1, 0, 0), 3.9, seed=4, stub=0.5, squash=0.6)
    W.apply_damage_state(s, state, seed=89)
    return _finish_forge(
        s, 'aft_engine_section', 25.0,
        [('SOCKET_Salvage_Drive', (-21.0, 1.95, 1.9), 2.0),
         ('SOCKET_Hazard_Core', (-19.6, 0.0, 0.0), 2.0)],
        _meta('aftermath', 'component', state,
              'An ore barge drive block and radiator farm, cut off the hull.',
              'Bells + fins — the silhouette of "engine" at debris scale.'))


def build_aft_weapon_spar(state='cooling'):
    """A corvette turret on the snapped length of its deck mounting spar."""
    s = W.build_donor(DONOR_CORVETTE)
    W.take_parts(s, ('TurretB',))
    W._mk_beam(s, 'Spar', (-4.4, 0.0, 0.5), (5.2, 0.0, 0.5), 0.32, finish='wk_frame')
    W.torn_flange(s, 'sparEnd', (-4.4, 0, 0.5), (-1, 0, 0), 0.5, count=4, depth=0.6, width=0.4,
                  seed=3)
    W.apply_damage_state(s, state, seed=91)
    return _finish_forge(
        s, 'aft_weapon_spar', 28.0,
        [('SOCKET_Salvage_Weapon', (1.4, 0.0, 1.9), 2.0)],
        _meta('aftermath', 'component', state,
              'A corvette turret still bolted to a snapped mounting spar.',
              'A gun that came off with a piece of the ship — the break reads two ways at once.'))


def build_aft_cargo_module(state='cooling'):
    """A hopper bay slice with its ore — the smallest unit of a freighter."""
    s = W.build_donor(DONOR_ORE)
    W.keep_band(s, lo=3.2, hi=6.8, axis=0, seed=97, jag=0.4)
    W.wound(s, 'cargoA', (3.2, 0, 0.3), (-1, 0, 0), 3.8, seed=5, stub=0.35, ribs=6, tears=5)
    W.apply_damage_state(s, state, seed=97)
    return _finish_forge(
        s, 'aft_cargo_module', 15.0,
        [('SOCKET_Salvage_Cargo', (5.0, 0.0, 1.2), 2.0)],
        _meta('aftermath', 'component', state,
              'One hopper section of an ore barge, ore still in the well.',
              'A hold with its cargo — salvage crews read this as "worth boarding".'))


def build_aft_cockpit_section(state='cooling'):
    """The barge command tower — bridge glazing, tower windows, lamp bar — torn off its deck."""
    s = W.build_donor(DONOR_ORE)
    W.take_parts(s, ('Tower', 'Bridge', 'LampBar', 'Mast', 'Beacon', 'Flood'))
    # the torn-off foot of the tower: a scorched skirt plate and frame stubs pointing down
    W._mk_plate(s, 'TowerSkirt', (-16.8, -2.1, 1.35), (-12.5, -2.1, 1.35), 4.2, 0.14, roll=0.0,
                finish='wk_scorch')
    W.frame_stubs(s, 'towerBase', (-14.7, 0, 1.2), (0, 0, -1), 1.7, count=7, stub=0.5, seed=4)
    W.apply_damage_state(s, state, seed=101)
    return _finish_forge(
        s, 'aft_cockpit_section', 21.0,
        [('SOCKET_BlackBox', (-14.2, 1.1, 5.2), 2.0),
         ('SOCKET_Evidence_Registry', (-13.0, -1.3, 4.3), 2.0)],
        _meta('aftermath', 'component', state,
              'The command tower of an ore barge, torn off at its deck.',
              'Bridge glazing and dead flood lamps on a broken footing — the room the crew '
              'watched it happen from.'))


def build_aft_radiator_panel(state='cooling'):
    """The barge's radiator fin farm on its header pipe — shed heat-sink."""
    s = W.build_donor(DONOR_ORE)
    W.take_parts(s, ('Radiator', 'PipeRun', 'PipeClamp'))
    W.apply_damage_state(s, state, seed=103)
    return _finish_forge(
        s, 'aft_radiator_panel', 24.0,
        [('SOCKET_Salvage_Radiator', (-19.9, 2.75, 2.0), 2.0)],
        _meta('aftermath', 'component', state,
              'A radiator fin array off the ore barge stern.',
              'A comb of dark fins — reads as cooling surface from any angle.'))


def build_aft_pressure_tank(state='cooling'):
    """A ruptured pressure vessel: ceramic shell, domed ends, the skin petalled open at a weld."""
    s = _blank_donor(DONOR_LINER)  # liner palette; the tank is authored in wreck-kit language
    W.F.cylinder(s, 'TankBody', (-3.0, 0.0, 0.0), (2.2, 0.0, 0.0), 1.6, material='ceramic',
                 segments=28)
    for i, ex in enumerate((-3.0, 2.2)):
        W.F.cylinder(s, f'TankDome{i}', (ex, 0.0, 0.0),
                     (ex + (-0.9 if ex < 0 else 0.9), 0.0, 0.0), 1.6, 1.2, material='ceramic',
                     segments=28)
    # burst at a weld: keep the capped end of the shell; the far dome is torn away entirely
    W.jagged_bisect(s.objects[0], (-0.4, 0, 0), (1, 0, 0), seed=7, jag=0.5, ship=s)
    dome_far = bpy.data.objects.get('TankDome1')
    if dome_far is not None:
        s.objects.remove(dome_far)
        bpy.data.objects.remove(dome_far, do_unlink=True)
    W.torn_flange(s, 'tankPetals', (-0.4, 0, 0), (1, 0, 0), 1.5, count=7, depth=0.9,
                  width=0.8, seed=11)
    W.F.cylinder(s, 'TankValve', (-2.4, 0.0, 1.5), (-2.4, 0.0, 2.2), 0.22, material='gunmetal',
                 segments=12)
    W.apply_damage_state(s, state, seed=107)
    return _finish_forge(
        s, 'aft_pressure_tank', 17.0,
        [('SOCKET_Hazard_Volatile', (-0.4, 0.0, 0.0), 2.0)],
        _meta('aftermath', 'component', state,
              'A ship-stores pressure tank, blown at a weld seam.',
              'The petals fold OUT — internal pressure did this, nobody shot it.'))


def build_aft_armor_slab(state='derelict'):
    """One slab of corvette flank armour, dead a long time."""
    s = W.build_donor(DONOR_CORVETTE)
    W.take_parts(s, ('Belt1',))
    W.keep_side(s, axis=1, sign=1, at=0.0, seed=109)
    W.torn_flange(s, 'slabEdge', (-5.5, 2.7, -0.4), (0, -0.6, 0.4), 2.4, count=4, depth=0.7,
                  width=0.6, seed=3)
    W.apply_damage_state(s, state, seed=109)
    return _finish_forge(
        s, 'aft_armor_slab', 18.0, [],
        _meta('aftermath', 'component', state,
              'A corvette armour slab, face-up in the field.',
              'Layered chamfered plate with the stripe edge — warship armour as litter.'))


def build_aft_dock_collar(state='stripped'):
    """The liner's boarding collar: pressure ring, hazard rim, dock lamp — cut off the drum."""
    s = W.build_donor(DONOR_LINER)
    W.take_parts(s, ('DockCollar', 'DockRing', 'DockLamp', 'ServiceHatch'))
    W.torn_flange(s, 'collarCut', (3.4, -8.1, 0.4), (0, 1, 0), 1.4, count=6, depth=0.6,
                  width=0.5, seed=6)
    W.apply_damage_state(s, state, seed=113)
    return _finish_forge(
        s, 'aft_dock_collar', 16.0,
        [('SOCKET_Salvage_Collar', (3.4, -9.2, 0.4), 2.0)],
        _meta('aftermath', 'component', state,
              'A docking collar with its hazard ring, pulled off the hull.',
              'A door frame with no door — the smallest possible read of "people used to board '
              'here".'))


# ---------------------------------------------------------------------------
# SHARED FRAGMENT KIT — authored in Forge finishes, small enough to litter a field

def _frag_meta(name, state, was, reads, tumble):
    return _meta('fragments', 'fragment', state, was, reads,
                 drift=drift_spec((0, 0, 0), tumble_axis=tumble[0], tumble_deg=tumble[1]))


def build_frag_plate_curl(state='cooling'):
    s = _blank_donor()
    W._mk_plate(s, 'curl0', (-1.2, -0.6, 0.0), (-1.2, 0.9, 0.5), 1.6, 0.1, roll=0.9,
                finish='wk_torn')
    W._mk_plate(s, 'curl1', (0.1, -0.8, 0.3), (0.3, 0.8, -0.4), 1.4, 0.1, roll=1.4,
                finish='wk_scorch')
    W._mk_plate(s, 'curl2', (0.9, -0.2, -0.2), (1.1, 0.5, 0.7), 1.1, 0.1, roll=0.5,
                finish='wk_torn')
    W.apply_damage_state(s, state, seed=3)
    return _finish_forge(s, 'frag_plate_curl', 6.0, [],
                         _frag_meta('frag_plate_curl', state,
                                    'Skin plating, rolled open like paper.',
                                    'Three curls off the same hull — the field\'s confetti.',
                                    ((0.7, 0.3, 0.6), 140.0)))


def build_frag_rib_cluster(state='cooling'):
    s = _blank_donor()
    W._mk_plate(s, 'ribHub', (-0.3, 0, 0), (0.3, 0, 0), 1.2, 0.4, roll=0.0, finish='wk_frame')
    W.frame_stubs(s, 'ribFan', (0.0, 0, 0), (1, 0.3, 0.2), 0.9, count=6, stub=1.4, thick=0.12,
                  seed=5)
    W.apply_damage_state(s, state, seed=7)
    return _finish_forge(s, 'frag_rib_cluster', 6.0, [],
                         _frag_meta('frag_rib_cluster', state,
                                    'A frame joint with its ribs still on it.',
                                    'The skeleton\'s knuckle — the piece that makes the rest of '
                                    'the debris read as bones.', ((0.4, 0.6, 0.7), 110.0)))


def build_frag_cable_bundle(state='cooling'):
    s = _blank_donor()
    for i in range(5):
        a = i * 1.25
        W.mk_pipe(s, f'cab{i}', [(-1.8, math.cos(a) * 0.5, math.sin(a) * 0.4),
                                 (0.0, math.cos(a + 1.1) * 1.1, math.sin(a + 0.7) * 0.9),
                                 (1.9, math.cos(a + 2.0) * 0.7, math.sin(a + 1.4) * 1.2 - 0.4)],
                  0.09 + 0.02 * (i % 2), finish='wk_cut', verts=5)
    W._mk_plate(s, 'cabCollar', (-1.9, -0.5, -0.4), (-1.9, 0.5, 0.4), 0.9, 0.3, roll=0.0,
                finish='wk_frame')
    W.apply_damage_state(s, state, seed=11)
    return _finish_forge(s, 'frag_cable_bundle', 8.0, [],
                         _frag_meta('frag_cable_bundle', state,
                                    'Severed cable trunking off a ship\'s spine.',
                                    'Bent ends, not cut — this came out with the wall.',
                                    ((0.7, 0.3, 0.6), 150.0)))


def build_frag_grating_sheet(state='derelict'):
    s = _blank_donor()
    W._mk_plate(s, 'grate', (-1.1, -0.8, 0.0), (1.2, -0.4, 0.3), 2.2, 0.1, roll=0.35,
                finish='wk_scorch')
    for i in range(4):
        W._mk_beam(s, f'gBar{i}', (-0.9 + i * 0.7, -0.7, 0.12 + i * 0.03),
                   (-0.8 + i * 0.7, 1.0, 0.35 + i * 0.03), 0.06, finish='wk_frame')
    W.apply_damage_state(s, state, seed=13)
    return _finish_forge(s, 'frag_grating_sheet', 8.0, [],
                         _frag_meta('frag_grating_sheet', state,
                                    'One bay of deck grating.',
                                    'There was a floor here, and therefore people.',
                                    ((0.5, 0.6, 0.6), 61.0)))


def build_frag_pipe_tangle(state='cooling'):
    s = _blank_donor()
    for i in range(4):
        a = i * 1.5
        W.mk_pipe(s, f'pipe{i}', [(-1.2 + i * 0.2, math.cos(a) * 0.6, math.sin(a) * 0.5),
                                  (0.2 - i * 0.1, math.cos(a + 1.0) * 0.9, math.sin(a + 0.6) * 0.8),
                                  (1.1 - i * 0.15, math.cos(a + 2.0) * 0.4, math.sin(a + 1.3) * 0.9)],
                  0.14, finish='wk_cut', verts=5)
    W._mk_beam(s, 'pipeBracket', (-0.2, -0.9, -0.6), (0.4, 0.9, -0.6), 0.18, finish='wk_frame')
    W.apply_damage_state(s, state, seed=17)
    return _finish_forge(s, 'frag_pipe_tangle', 5.0, [],
                         _frag_meta('frag_pipe_tangle', state,
                                    'Service pipework torn out of a run.',
                                    'A tangle that still remembers the wall it came off.',
                                    ((0.66, 0.5, 0.56), 97.0)))


def build_frag_strut_shard(state='cooling'):
    s = _blank_donor()
    W._mk_beam(s, 'strutMain', (-2.0, 0, 0), (2.0, 0.4, 0.6), 0.28, finish='wk_frame', verts=6)
    W._mk_beam(s, 'strutSide', (-0.6, 0.1, 0.1), (1.0, -0.9, -0.8), 0.18, finish='wk_frame',
               verts=5)
    W.frame_stubs(s, 'strutFray', (2.1, 0.42, 0.65), (0.9, 0.2, 0.3), 0.5, count=3, stub=0.6,
                  seed=3)
    W.apply_damage_state(s, state, seed=19)
    return _finish_forge(s, 'frag_strut_shard', 11.0, [],
                         _frag_meta('frag_strut_shard', state,
                                    'A structural strut, snapped.',
                                    'One end frayed, the other cleanly attached to nothing.',
                                    ((0.42, 0.68, 0.6), 133.0)))


# ---------------------------------------------------------------------------
# AUTHORED-DOWN HERO — Forge-derived replacement for the imported mining barge.
# The barge is authored_down-only in the catalog (no source twin): the SAME file is mirrored to
# source/ for provenance and authored_down/ for release promotion, and stays out of the
# 37-asset source report.

def build_wreck_mining_barge(state='derelict'):
    """The mining barge hero — a whole Forge ore barge dead in the field: midship ore bins blown
    out between two frame rings, the halves still slung from the keel chords, cutter station at
    the bow, drives cold. The BinGap is a fly-through wound, measured like the pack's other gaps.
    """
    s = W.build_donor(DONOR_ORE)
    W.keep_band(s, lo=None, hi=None, axis=0, seed=0, jag=0.0,
                drop=('NavStarboard', 'NavPort', 'Mast', 'Beacon', 'LampBar', 'Flood'))
    # bins torn out midship; the wound is wide enough to fly through (measured below). The gap
    # needs 20 m of clear radius: the keel chords hug the hull bottom, so the probe — and the
    # fly-through lane it advertises — rides high in the bore, above the chord line.
    W.carve_band(s, -4.5, 12.5, axis=0, seed=29, jag=0.3)
    for i, rx in enumerate((-3.7, 11.7)):
        W.mk_ring_arc(s, f'BinRing{i}', 4.4, 0.5, 0.4, 0.0, 360.0, center=(rx, 0, 0),
                      segments=26, finish='wk_frame')
    # keel chords are the only things still joining the halves — the bore stays open above them
    for i, cy in enumerate((1.7, -1.7)):
        W._mk_beam(s, f'KeelChord{i}', (-4.4, cy, -4.4), (12.4, cy, -4.4), 0.26,
                   finish='wk_frame')
    W.wound(s, 'woundFore', (-4.5, 0, 0), (1, 0, 0), 4.2, seed=21, stub=0.4, squash=0.55)
    W.wound(s, 'woundAft', (12.5, 0, 0), (-1, 0, 0), 4.2, seed=25, stub=0.4, squash=0.55)
    W.scorch_gradient(s, (-4.5, 0, 0), 4.5)
    W.scorch_gradient(s, (12.5, 0, 0), 4.5)
    W.apply_damage_state(s, state, seed=29)
    return _finish_forge(
        s, 'wreck_mining_barge', 147.0,
        [('SOCKET_BlackBox', (16.9, 1.6, 1.9), 2.0),
         ('SOCKET_Hazard_Break', (11.5, 0.0, 1.2), 2.0),
         ('SOCKET_Hazard_Core', (4.0, 0.0, -3.4), 2.0),
         ('SOCKET_Salvage_Cutter', (18.5, 0.0, 0.5), 2.0),
         ('SOCKET_Salvage_Drive', (-19.5, 0.0, 0.6), 2.0),
         ('SOCKET_Salvage_Ore', (13.1, 0.0, 1.5), 2.0),
         ('INTERACTION_BinGap', (4.0, 0.0, 2.6), 20.0)],
        _meta('ore_freighter', 'hero', state,
              'Asteroid mining barge (Forge ore barge), whole hull, bins blown out.',
              'The whole ship is here — cutter, bins, drives — and it is still dead: the '
              'fly-through BinGap is where the cargo hold used to be.',
              ),
        probes=[('INTERACTION_BinGap', (4.0, 0.0, 2.6))])


# ---------------------------------------------------------------------------
# REFERENCES — the intact donors, for the "as built vs wreck" silhouette sheets.

def build_ore_freighter_intact():
    return _intact(DONOR_ORE, 'ref_ore_freighter_intact',
                   'The Forge ore barge, intact.',
                   'Every piece in the family was this ship once — the silhouette sheet proves it.')

def build_corvette_intact():
    return _intact(DONOR_CORVETTE, 'ref_corvette_intact',
                   'The Forge bastion corvette, intact.',
                   'Casemate, citadel, turrets — the wreck pieces carry all three.')

def build_liner_intact():
    return _intact(DONOR_LINER, 'ref_liner_intact',
                   'The Forge massline express liner, intact.',
                   'Drum, wedge, galleries — the wreck pieces carry the window rows.')

# ===========================================================================
# Registry. `kind` drives review framing: primary/secondary get hero distance bands, debris and
# components get near bands, reference silhouettes are never exported.

BUILDERS = {
    # family 1 -- bulk ore freighter (open ring-frame trunk; truss_break)
    'wreck_ore_freighter_bow': build_wreck_ore_freighter_bow,
    'wreck_ore_freighter_stern': build_wreck_ore_freighter_stern,
    'wreck_ore_freighter_hopper': build_wreck_ore_freighter_hopper,
    'deb_ore_freighter_ring_span': build_deb_ore_freighter_ring_span,
    'deb_ore_freighter_hopper_lid': build_deb_ore_freighter_hopper_lid,
    'deb_ore_freighter_drive_bell': build_deb_ore_freighter_drive_bell,
    # family 2 -- Concord patrol corvette (plated monocoque; break_plane; the restricted class)
    'wreck_corvette_forward': build_wreck_corvette_forward,
    'wreck_corvette_engine': build_wreck_corvette_engine,
    'wreck_corvette_turret': build_wreck_corvette_turret,
    'deb_corvette_armor_belt': build_deb_corvette_armor_belt,
    'deb_corvette_barbette_ring': build_deb_corvette_barbette_ring,
    # family 3 -- civilian passenger liner (pressure vessel; outward petal)
    'wreck_liner_drum': build_wreck_liner_drum,
    'wreck_liner_bow': build_wreck_liner_bow,
    'wreck_liner_boatbay': build_wreck_liner_boatbay,
    'deb_liner_hull_panel': build_deb_liner_hull_panel,
    'deb_liner_drive_pod': build_deb_liner_drive_pod,
    # ordinary aftermath component kit -- what a routine fight leaves
    'aft_engine_section': build_aft_engine_section,
    'aft_weapon_spar': build_aft_weapon_spar,
    'aft_cargo_module': build_aft_cargo_module,
    'aft_cockpit_section': build_aft_cockpit_section,
    'aft_radiator_panel': build_aft_radiator_panel,
    'aft_pressure_tank': build_aft_pressure_tank,
    'aft_armor_slab': build_aft_armor_slab,
    'aft_dock_collar': build_aft_dock_collar,
    # shared fragment kit -- one kit for all families, not one per family
    'frag_plate_curl': build_frag_plate_curl,
    'frag_rib_cluster': build_frag_rib_cluster,
    'frag_cable_bundle': build_frag_cable_bundle,
    'frag_grating_sheet': build_frag_grating_sheet,
    'frag_pipe_tangle': build_frag_pipe_tangle,
    'frag_strut_shard': build_frag_strut_shard,
}

REFERENCES = {
    'ref_ore_freighter_intact': build_ore_freighter_intact,
    'ref_corvette_intact': build_corvette_intact,
    'ref_liner_intact': build_liner_intact,
}

# Which exemplars carry the state ladder. Fiction 3 says "where practical" -- authoring all five
# states on all three hulls would be 15 near-duplicate exports for one readable idea. These three
# were chosen because each carries a DIFFERENT half of the ladder:
#   freighter bow  -- the full arc, fresh through stripped, the fresh/derelict pair on one hull
#   corvette fwd   -- stripped_heavy is the restricted-salvage crime (wreckClasses.js military)
#   liner drum     -- fresh is the horror shot; derelict is the same room decades later
STATE_VARIANTS = {
    'wreck_ore_freighter_bow': ('fresh', 'derelict', 'stripped'),
    'wreck_corvette_forward': ('fresh', 'stripped_heavy'),
    'wreck_liner_drum': ('fresh', 'derelict'),
}

FAMILY_OF = {
    'ore_freighter': ('wreck_ore_freighter_bow', 'wreck_ore_freighter_stern',
                      'wreck_ore_freighter_hopper', 'deb_ore_freighter_ring_span',
                      'deb_ore_freighter_hopper_lid', 'deb_ore_freighter_drive_bell'),
    'corvette': ('wreck_corvette_forward', 'wreck_corvette_engine', 'wreck_corvette_turret',
                 'deb_corvette_armor_belt', 'deb_corvette_barbette_ring'),
    'liner': ('wreck_liner_drum', 'wreck_liner_bow', 'wreck_liner_boatbay',
              'deb_liner_hull_panel', 'deb_liner_drive_pod'),
    'aftermath': ('aft_engine_section', 'aft_weapon_spar', 'aft_cargo_module',
                  'aft_cockpit_section', 'aft_radiator_panel', 'aft_pressure_tank',
                  'aft_armor_slab', 'aft_dock_collar'),
    'fragments': ('frag_plate_curl', 'frag_rib_cluster', 'frag_cable_bundle',
                  'frag_grating_sheet', 'frag_pipe_tangle', 'frag_strut_shard'),
}

# Only hulls get a composition: the component and fragment kits have no parent ship to be staged
# relative to, so staging them would pile every piece on the origin and prove nothing.
COMPOSITION_FAMILIES = ('ore_freighter', 'corvette', 'liner')


# ---------------------------------------------------------------------------
# Export / measure / render machinery. Shape deliberately shared with
# build_everyday_space_kit.py and build_npc_activity_pack.py so review tooling and habits transfer.

def export_glb(root, path):
    bpy.context.view_layer.update()
    path.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.object.select_all(action='DESELECT')
    root.select_set(True)
    for child in root.children_recursive:
        child.select_set(True)
    bpy.context.view_layer.objects.active = root
    bpy.ops.export_scene.gltf(
        filepath=str(path), export_format='GLB', use_selection=True,
        export_apply=True, export_yup=True,
        export_texcoords=True, export_normals=True,
        export_materials='EXPORT', export_extras=True,
    )
    return hashlib.sha256(path.read_bytes()).hexdigest()


def glb_payload(path):
    raw = path.read_bytes()
    if len(raw) < 20 or raw[:4] != b'glTF':
        raise RuntimeError(f'not a GLB 2.0 file: {path}')
    json_len = int.from_bytes(raw[12:16], 'little')
    if raw[16:20] != b'JSON':
        raise RuntimeError(f'GLB JSON chunk missing: {path}')
    return json.loads(raw[20:20 + json_len].decode('utf-8').rstrip(' \t\r\n\x00'))


def verify_sockets(path, expected):
    """Re-parse the exported GLB and prove the socket empties survived. Childless empties are exactly
    the thing that silently vanishes through an exporter, and a socket that exists only in Blender is
    a socket a promotion lane cannot use."""
    payload = glb_payload(path)
    names = {n.get('name', '') for n in payload.get('nodes', [])}
    missing = [s for s in expected if s not in names]
    found = sorted(n for n in names if n.startswith(('SOCKET_', 'INTERACTION_')))
    return found, missing


def tri_count(root):
    total = 0
    for o in [root] + list(root.children_recursive):
        if o.type != 'MESH':
            continue
        total += sum(max(0, len(p.vertices) - 2) for p in o.data.polygons)
    return total


def envelope(root):
    pts = []
    for o in root.children_recursive:
        if o.type != 'MESH':
            continue
        for c in o.bound_box:
            pts.append(o.matrix_world @ Vector(c))
    if not pts:
        z = Vector((0, 0, 0))
        return z, z, z
    lo = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
    hi = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
    return lo, hi, hi - lo


def measure_gaps(root, probes):
    """Assert every advertised navigable gap. Fiction §7: at least 40 m of clear span, measured."""
    meshes = [o for o in root.children_recursive if o.type == 'MESH']
    out = []
    for probe in probes:
        clear, nearest = gap_clearance(meshes, probe['atM'])
        out.append({
            'name': probe['name'],
            'atM': [round(v, 1) for v in probe['atM']],
            'clearRadiusM': round(clear, 2),
            'nearest': nearest,
            'clearSpanM': round(clear * 2.0, 2),
            'playerHullM': PLAYER_HULL_M,
            'requiredRadiusM': MIN_GAP_CLEAR_RADIUS,
            'pass': bool(clear >= MIN_GAP_CLEAR_RADIUS),
        })
    return out


def check_attachment(root, max_gap=2.0):
    """Every surface mark must be ON a surface.

    The everyday-space kit lost a full review round to fittings authored at standoff with nothing
    under them, and this pack found the same class again in a nastier form: a scorch trail authored
    on a hull section that the fracture had removed, burning a mark into empty space. Numbers do not
    catch that and neither does a wide review render. This does: for every mark, measure the distance
    to the nearest piece of structure that is not another mark."""
    marks, structure = [], []
    for o in root.children_recursive:
        if o.type != 'MESH' or not o.data.polygons:
            continue
        (marks if o.name.startswith(('scorch_', 'crack_', 'emerg')) or '_emerg_' in o.name
         or '_crack_' in o.name or '_scorch' in o.name else structure).append(o)
    floating = []
    for mk in marks:
        c = mk.matrix_world.translation
        best, who = float('inf'), None
        for st in structure:
            hit, loc, _n, _i = st.closest_point_on_mesh(st.matrix_world.inverted() @ c)
            if not hit:
                continue
            d = ((st.matrix_world @ loc) - c).length
            if d < best:
                best, who = d, st.name
        if best > max_gap:
            floating.append({'mark': mk.name, 'nearestStructureM': round(best, 2),
                             'nearest': who})
    return floating


def reset_render_cameras():
    for o in [o for o in bpy.data.objects if o.type in {'CAMERA', 'LIGHT'}]:
        bpy.data.objects.remove(o, do_unlink=True)


def setup_render(target, radius, distance=None, key_mul=1.0):
    """Frame the subject. Irradiance falls with distance SQUARED -- linear light scaling turned every
    large subject to mud on the npc pack's round-1 renders. Same reference exposure as the two prior
    packs (E ~= 115 * d^2) so their contact sheets stay comparable to these."""
    d = distance if distance is not None else radius * 2.2
    bpy.ops.object.camera_add(location=(d * 0.62, -d * 0.72, d * 0.44))
    cam = bpy.context.active_object
    cam.data.lens = 50
    cam.data.clip_end = max(4000.0, d * 12.0)
    direction = Vector(target) - cam.location
    cam.rotation_euler = direction.to_track_quat('-Z', 'Y').to_euler()
    bpy.context.scene.camera = cam
    e = max(1.0, d) ** 2
    bpy.ops.object.light_add(type='AREA', location=(d * 1.1, -d * 0.7, d * 1.2))
    key = bpy.context.active_object
    key.data.energy = 88 * e * key_mul
    key.data.size = max(2.0, radius * 2.5)
    key.data.color = (1.0, 0.86, 0.68)
    bpy.ops.object.light_add(type='AREA', location=(-d * 1.0, d * 0.8, d * 0.45))
    fill = bpy.context.active_object
    fill.data.energy = 25 * e * key_mul
    fill.data.size = max(2.0, radius * 3.0)
    fill.data.color = (0.55, 0.68, 1.0)
    bpy.ops.object.light_add(type='AREA', location=(-d * 0.4, -d * 0.3, d * 1.5))
    rim = bpy.context.active_object
    rim.data.energy = 30 * e * key_mul
    rim.data.size = max(2.0, radius * 2.0)
    rim.data.color = (0.75, 0.82, 1.0)
    scene = bpy.context.scene
    scene.render.engine = 'BLENDER_EEVEE'
    scene.render.resolution_x = 1200
    scene.render.resolution_y = 900
    scene.render.film_transparent = False
    scene.world = bpy.data.worlds.new('w')
    scene.world.use_nodes = True
    scene.world.node_tree.nodes['Background'].inputs[0].default_value = (0.030, 0.033, 0.044, 1)


def distance_bands(size_max, kind):
    """Review each piece at the ranges its size class actually occupies on screen. A 12 m drive bell
    at 200 wu is one pixel and proves nothing; a 150 m hero wreck at 30 wu proves nothing either."""
    if kind in ('primary', 'secondary') and size_max > 60.0:
        return (120, 200, 300)
    if size_max > 26.0:
        return (60, 110, 170)
    return (30, 60, 110)


def _label(text, loc, size=3.2):
    bpy.ops.object.text_add(location=loc, rotation=(math.pi / 2, 0, math.pi / 2))
    t = bpy.context.active_object
    t.data.body = text
    t.data.size = size
    t.data.align_x = 'CENTER'
    t.name = f'label_{text}'
    t.data.materials.clear()
    t.data.materials.append(material('wrk_hot_white'))
    return t


RENDER_FAILURES = []


def render_to(path, target, radius, distance=None, res=(1200, 900), key_mul=1.0):
    """Render one frame, tolerating a transient save failure.

    A full pass writes ~170 PNGs over roughly a quarter of an hour on a checkout a concurrent writer
    touches every half hour. One Windows file lock on one frame used to raise
    `cannot save: <path>` and discard the entire build -- including every GLB and measurement
    already produced. A lost review frame is cheap; a lost build is not. Failures are recorded and
    surface in build-report.json rather than being swallowed."""
    reset_render_cameras()
    setup_render(target, radius, distance=distance, key_mul=key_mul)
    bpy.context.scene.render.resolution_x, bpy.context.scene.render.resolution_y = res
    bpy.context.scene.render.filepath = str(path)
    for attempt in (1, 2, 3):
        try:
            bpy.ops.render.render(write_still=True)
            log(f'wrote {path.name}')
            return
        except RuntimeError as exc:
            if attempt == 3:
                RENDER_FAILURES.append({'file': path.name, 'error': str(exc)})
                log(f'RENDER FAILED (continuing): {path.name} -- {exc}')
                return
            import time
            time.sleep(1.5 * attempt)


def render_gap_pass(root, probe, shot_path):
    """A close pass THROUGH the advertised gap. The distance bands never show whether a gap is
    actually flyable -- they frame the whole wreck from outside. This camera sits in the passage."""
    reset_render_cameras()
    at = Vector(probe['atM'])
    cam_at = at + Vector((-46.0, -34.0, 9.0))
    bpy.ops.object.camera_add(location=tuple(cam_at))
    cam = bpy.context.active_object
    cam.data.lens = 28  # wide: this is the pilot's read of whether it fits
    cam.data.clip_end = 4000.0
    cam.rotation_euler = (at - cam_at).to_track_quat('-Z', 'Y').to_euler()
    bpy.context.scene.camera = cam
    d = 60.0
    e = d ** 2
    for loc, energy, col, size in (((d * 0.9, -d * 0.6, d * 1.0), 88 * e, (1.0, 0.86, 0.68), 40),
                                   ((-d * 0.9, d * 0.7, d * 0.4), 26 * e, (0.55, 0.68, 1.0), 46),
                                   ((-d * 0.3, -d * 0.3, d * 1.3), 30 * e, (0.75, 0.82, 1.0), 34)):
        bpy.ops.object.light_add(type='AREA', location=loc)
        lt = bpy.context.active_object
        lt.data.energy = energy
        lt.data.color = col
        lt.data.size = size
    scene = bpy.context.scene
    scene.render.engine = 'BLENDER_EEVEE'
    scene.render.film_transparent = False
    scene.world = bpy.data.worlds.new('wg')
    scene.world.use_nodes = True
    scene.world.node_tree.nodes['Background'].inputs[0].default_value = (0.030, 0.033, 0.044, 1)
    scene.render.resolution_x, scene.render.resolution_y = 1400, 900
    scene.render.filepath = str(shot_path)
    bpy.ops.render.render(write_still=True)
    log(f'wrote {shot_path.name}')


def render_silhouette_sheet(family, intact_id, wreck_ids, shot_path):
    """The acceptance exhibit: what it was, beside what it is. Intact on top.

    This is the sheet the whole pack is judged on -- fiction 0 asks a player with no label to say
    "that used to be a freighter", and the only honest way to check that is to put the intact hull
    directly above its own wreckage and see whether the eye connects them."""
    reset_scene()
    # The intact reference is the ONE live build allowed in a sheet scene: donor build()s wipe
    # everything, so it goes in first and the wreck pieces arrive as GLB imports on top of it.
    ref_root, _meta = REFERENCES[intact_id]()
    _lo, _hi, ref_size = envelope(ref_root)
    wrecks = [(wid, _import_glb_root(OUT_SOURCE / f'{wid}.glb')) for wid in wreck_ids]
    # The donor builds at ship units while the exported pieces are metres. Scale the intact
    # reference up so the "as built" row reads at the same magnitude as the pieces cut from it —
    # a 40-unit hull next to a 180 m wreck reads as a toy, not a donor.
    biggest_wreck = max((max(envelope(r)[2]) for _w, r in wrecks), default=1.0)
    ref_root.scale = tuple(biggest_wreck * 1.35 / max(1.0, max(ref_size)) for _ in range(3))
    bpy.context.view_layer.update()
    # Stack rows down Z; each row's own envelope drives spacing so nothing overlaps.
    rows = [('AS BUILT', ref_root)] + wrecks
    envs = {r.name: envelope(r) for _n, r in rows}
    heights = [envs[r.name][2].z for _n, r in rows]
    maxw = max(envs[r.name][2].x for _n, r in rows)
    gap = max(heights) * 0.20
    cursor = (sum(heights) + gap * (len(rows) - 1)) * 0.5
    for (label, r), h in zip(rows, heights):
        lo, hi, _sz = envs[r.name]
        r.location = Vector((-(lo.x + hi.x) * 0.5, 0.0, cursor - hi.z))
        _label_front(label, (-maxw * 0.62, 0.0, cursor - h * 0.30),
                     max(h * 0.14, maxw * 0.035))
        cursor -= h + gap
    bpy.context.view_layer.update()
    _sheet_frame(shot_path, (1500, 1800))


def _sheet_frame(shot_path, res):
    """Frame a laid-out sheet ORTHOGRAPHICALLY, straight down the -Y axis.

    Two things go wrong with the pack's standard 3/4 review camera on a contact sheet. A grid laid
    out in X and Z renders as a diagonal scatter, because the camera axis is not the layout axis;
    and perspective makes the near tile bigger than the far one, so a sheet meant for COMPARING
    silhouettes stops being a fair comparison. An orthographic elevation fixes both: every tile is
    at the same scale, and the grid lands on the screen axes. It is also simply the right view for
    the acceptance question -- 'what did this used to be' is a silhouette question."""
    # FONT objects count: the row labels sit outboard of the geometry, and leaving them out of the
    # bounds is what cropped them off the left edge of the first orthographic sheet.
    pts = []
    for o in bpy.data.objects:
        if o.type not in {'MESH', 'FONT'}:
            continue
        pts.extend(o.matrix_world @ Vector(c) for c in o.bound_box)
    lo = Vector((min(q.x for q in pts), min(q.y for q in pts), min(q.z for q in pts)))
    hi = Vector((max(q.x for q in pts), max(q.y for q in pts), max(q.z for q in pts)))
    mid, span = (lo + hi) * 0.5, hi - lo
    reset_render_cameras()
    d = max(span.y, 1.0) * 2.0 + max(span.x, span.z)
    bpy.ops.object.camera_add(location=(mid.x, mid.y - d, mid.z), rotation=(math.pi / 2, 0, 0))
    cam = bpy.context.active_object
    cam.data.type = 'ORTHO'
    # Blender maps ortho_scale to the LARGER resolution axis, so a portrait sheet needs the
    # opposite ratio from a landscape one. Getting this backwards cropped the reference hull off
    # the top of the freighter silhouette sheet.
    if res[0] >= res[1]:
        need = max(span.x, span.z * res[0] / res[1])
    else:
        need = max(span.z, span.x * res[1] / res[0])
    cam.data.ortho_scale = need * 1.10
    cam.data.clip_end = d * 4.0
    bpy.context.scene.camera = cam
    e = max(span.x, span.z) ** 2 * 0.25
    for loc, energy, col in (((mid.x + d * 0.5, mid.y - d * 0.7, mid.z + d * 0.5), 82 * e, (1.0, 0.86, 0.68)),
                             ((mid.x - d * 0.6, mid.y - d * 0.6, mid.z - d * 0.3), 30 * e, (0.55, 0.68, 1.0)),
                             ((mid.x, mid.y - d * 0.2, mid.z + d * 0.8), 34 * e, (0.75, 0.82, 1.0))):
        bpy.ops.object.light_add(type='AREA', location=loc)
        lt = bpy.context.active_object
        lt.data.energy = energy * WRECK_KEY_MUL
        lt.data.color = col
        lt.data.size = max(span.x, span.z) * 0.5
    scene = bpy.context.scene
    scene.render.engine = 'BLENDER_EEVEE'
    scene.render.film_transparent = False
    scene.world = bpy.data.worlds.new('ws')
    scene.world.use_nodes = True
    scene.world.node_tree.nodes['Background'].inputs[0].default_value = (0.030, 0.033, 0.044, 1)
    scene.render.resolution_x, scene.render.resolution_y = res
    scene.render.filepath = str(shot_path)
    for attempt in (1, 2, 3):
        try:
            bpy.ops.render.render(write_still=True)
            log(f'wrote {shot_path.name}')
            return
        except RuntimeError as exc:
            if attempt == 3:
                RENDER_FAILURES.append({'file': shot_path.name, 'error': str(exc)})
                log(f'RENDER FAILED (continuing): {shot_path.name}')
                return
            import time
            time.sleep(1.5 * attempt)


def _label_front(text, loc, size):
    """Text lying in the XZ plane, facing the orthographic sheet camera at -Y."""
    bpy.ops.object.text_add(location=loc, rotation=(math.pi / 2, 0, 0))
    t = bpy.context.active_object
    t.data.body = text
    t.data.size = size
    t.data.align_x = 'LEFT'
    t.name = f'label_{text}'
    t.data.materials.clear()
    t.data.materials.append(material('wrk_hot_white'))
    return t


def _import_glb_root(path):
    """Import an exported pack GLB and return its root object.

    Every sheet render must place several pieces in one scene, but each BUILDERS call runs a
    donor's build() which factory-resets the scene -- two built pieces can never coexist. The
    source GLBs the main loop just exported ARE the pieces, so sheets import those instead; the
    picture then shows the shipped files, not a parallel rebuild."""
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=str(path))
    new = [o for o in bpy.data.objects if o not in before]
    roots = [o for o in new if o.parent is None or o.parent not in new]
    if not roots:
        raise RuntimeError(f'no root object after importing {path.name}')
    return next((o for o in roots if o.name.split('.')[0] == path.stem), roots[0])


def render_family_sheet(family, ids, shot_path):
    reset_scene()
    built = []
    for pid in ids:
        r = _import_glb_root(OUT_SOURCE / f'{pid}.glb')
        _lo, _hi, size = envelope(r)
        built.append((pid, r, max(size)))
    sp = max(1.0, max(b[2] for b in built)) * 1.18
    cols = 2 if len(built) <= 4 else 3
    rows = (len(built) + cols - 1) // cols
    for idx, (pid, r, _sz) in enumerate(built):
        col, row = idx % cols, idx // cols
        r.location = Vector((-(cols - 1) * sp * 0.5 + col * sp, 0.0,
                             (rows - 1) * sp * 0.62 - row * sp * 0.62))
        _label_front(pid, (r.location.x - sp * 0.46, 0.0, r.location.z - sp * 0.26), sp * 0.042)
    bpy.context.view_layer.update()
    _sheet_frame(shot_path, (2000, 1400))


def render_state_ladder(base_id, states, shot_path):
    """Fresh beside derelict on the SAME hull. Fiction §3 lives or dies on this one image."""
    reset_scene()
    order = ('fresh',) + tuple(s for s in states if s != 'fresh')
    pieces = [(st, _import_glb_root(OUT_SOURCE / f'{base_id}__{st}.glb')) for st in order]
    envs = {r.name: envelope(r) for _st, r in pieces}
    heights = [envs[r.name][2].z for _st, r in pieces]
    maxw = max(envs[r.name][2].x for _st, r in pieces)
    gap = max(heights) * 0.22
    cursor = (sum(heights) + gap * (len(pieces) - 1)) * 0.5
    for (st, r), h in zip(pieces, heights):
        lo, hi, _sz = envs[r.name]
        r.location = Vector((-(lo.x + hi.x) * 0.5, 0.0, cursor - hi.z))
        _label_front(st.upper(), (-maxw * 0.62, 0.0, cursor - h * 0.30),
                     max(h * 0.14, maxw * 0.04))
        cursor -= h + gap
    bpy.context.view_layer.update()
    _sheet_frame(shot_path, (1500, 1700))


def render_composition(family, metas, shot_path):
    """Put the ship back together as it now lies: every piece at its ship-frame origin PLUS its
    recorded drift. This is the only render in the pack where fiction 1.4 can be judged -- a
    per-asset shot cannot show whether a section drifted away from the break it tore off at, and
    the numbers alone cannot show whether two sections read as parallel (they must not)."""
    reset_scene()
    pts = []
    for pid in FAMILY_OF[family]:
        if pid not in BUILDERS:
            continue
        root = _import_glb_root(OUT_SOURCE / f'{pid}.glb')
        meta = metas.get(pid) or {}
        staged(root, meta.get('shipFrameOriginM') or (0, 0, 0), meta.get('drift'))
    bpy.context.view_layer.update()
    for o in bpy.data.objects:
        if o.type != 'MESH':
            continue
        pts.extend(o.matrix_world @ Vector(c) for c in o.bound_box)
    lo = Vector((min(q.x for q in pts), min(q.y for q in pts), min(q.z for q in pts)))
    hi = Vector((max(q.x for q in pts), max(q.y for q in pts), max(q.z for q in pts)))
    render_to(shot_path, tuple((lo + hi) * 0.5), max(hi - lo) * 0.62, res=(1900, 1300))


def write_catalog(report):
    """KIT_CATALOG.md is GENERATED, never hand-maintained -- a hand-written catalog drifts from the
    build within one session."""
    lines = ['# KIT CATALOG - wreck & aftermath ecology pack', '',
             f"Generated by `{report['builder']}` - Blender {report['blender']} - "
             f"{report['assetCount']} exported assets. Do not hand-edit.", '',
             'Fiction: [THE_LONG_AFTERMATH](../../../../design/fiction/THE_LONG_AFTERMATH.md). '
             'Audit: [EXISTING_COVERAGE](EXISTING_COVERAGE.md). '
             'Promotion: [INTEGRATION](../INTEGRATION.md).', '']
    by_family = {}
    for a in report['assets']:
        by_family.setdefault(a['family'], []).append(a)
    for fam in sorted(by_family):
        lines += [f'## {fam}', '',
                  '| id | kind | state | size (m) | tris | sockets | gap |',
                  '| --- | --- | --- | --- | --- | --- | --- |']
        for a in sorted(by_family[fam], key=lambda r: (r['kind'], r['id'])):
            size = ' x '.join(f"{v:.0f}" for v in a['sizeM'])
            socks = ', '.join(a['sockets']) or '-'
            gaps = a.get('gaps') or []
            gap = '-' if not gaps else ', '.join(
                f"{g['name']} {g['clearSpanM']:.0f} m {'PASS' if g['pass'] else 'FAIL'}" for g in gaps)
            lines.append(f"| `{a['id']}` | {a['kind']} | {a['state']} | {size} | {a['tris']} | "
                         f"{socks} | {gap} |")
        lines.append('')
        for a in sorted(by_family[fam], key=lambda r: (r['kind'], r['id'])):
            lines.append(f"**`{a['id']}`** - *was:* {a['was']}  ")
            lines.append(f"*reads:* {a['reads']}")
            d = a.get('drift')
            if d and d.get('driftDistanceM'):
                lines.append(f"  *drift:* {d['driftDistanceM']} m along {d['offsetM']}, "
                             f"tumbled {d['tumbleDeg']} deg about {d['tumbleAxis']}"
                             + (f" -- {d['note']}" if d.get('note') else ''))
            elif d:
                # component and fragment kits have no parent ship to have drifted FROM, so the
                # offset is zero by definition and only the authored tumble means anything
                lines.append(f"  *attitude:* tumbled {d['tumbleDeg']} deg about {d['tumbleAxis']}")
            lines.append('')
    (OUT_EVIDENCE / 'KIT_CATALOG.md').write_text('\n'.join(lines) + '\n', encoding='utf-8')
    log('wrote KIT_CATALOG.md')


def main():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    ap = argparse.ArgumentParser()
    ap.add_argument('--only', default=None, help='build a single family (e.g. ore_freighter)')
    ap.add_argument('--render', action='store_true')
    ap.add_argument('--distances', action='store_true', help='per-asset distance-band review renders')
    ap.add_argument('--sheets', action='store_true', help='per-family contact sheets')
    ap.add_argument('--silhouettes', action='store_true', help='intact-vs-wreck acceptance sheets')
    ap.add_argument('--states', action='store_true', help='state-ladder exhibits')
    ap.add_argument('--gaps', action='store_true', help='close pass through each navigable gap')
    ap.add_argument('--compositions', action='store_true',
                    help='stage each family by its recorded drift (the drift review)')
    args = ap.parse_args(argv)

    ids = list(BUILDERS)
    if args.only:
        if args.only not in FAMILY_OF:
            raise SystemExit(f'unknown family {args.only!r}; known: {sorted(FAMILY_OF)}')
        ids = [i for i in FAMILY_OF[args.only] if i in BUILDERS]

    OUT_SOURCE.mkdir(parents=True, exist_ok=True)
    OUT_EVIDENCE.mkdir(parents=True, exist_ok=True)

    report = {
        'builder': 'tools/blender/build_wreck_aftermath_pack.py',
        'builderSha256': hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
        'blender': bpy.app.version_string,
        'command': 'blender --background --factory-startup --python '
                   'tools/blender/build_wreck_aftermath_pack.py -- --render --distances --sheets '
                   '--silhouettes --states --gaps --compositions',
        'fiction': 'design/fiction/THE_LONG_AFTERMATH.md',
        'audit': 'assets/incubator/wreck_aftermath_pack/evidence/EXISTING_COVERAGE.md',
        'sourceOnly': True,
        'rng': 'none - every dimension, break, drift and state is authored',
        'playerHullM': PLAYER_HULL_M,
        'minGapClearRadiusM': MIN_GAP_CLEAR_RADIUS,
        'assets': [],
        'socketFailures': [],
        'gapFailures': [],
        'floatingMarkFailures': [],
    }

    for pid in ids:
        reset_scene()
        root, meta = BUILDERS[pid]()
        lo, hi, size = envelope(root)
        gaps = measure_gaps(root, meta.get('gapProbes') or [])
        floating = check_attachment(root)
        path = OUT_SOURCE / f'{pid}.glb'
        sha = export_glb(root, path)
        payload = glb_payload(path)
        found, missing = verify_sockets(path, meta.get('sockets') or [])
        entry = {
            'id': pid, 'family': meta['family'], 'kind': meta['kind'], 'state': meta['state'],
            'was': meta['was'], 'reads': meta['reads'],
            'file': f'assets/incubator/wreck_aftermath_pack/source/{pid}.glb',
            'sha256': sha, 'bytes': path.stat().st_size,
            'generator': payload.get('asset', {}).get('generator', 'unknown'),
            'tris': tri_count(root),
            'sizeM': [round(v, 2) for v in size],
            'centredResidualM': [round(v, 2) for v in ((lo + hi) * 0.5)],
            'shipFrameOriginM': meta.get('shipFrameOriginM'),
            'sockets': found, 'socketsMissing': missing,
            'floatingMarks': floating,
            'drift': meta.get('drift'), 'driftNote': meta.get('driftNote'),
            'gaps': gaps,
            'collisionProxy': {
                'kind': 'compound-box' if meta['kind'] in ('primary', 'secondary') else 'box',
                'suggestion': 'One box per named section for hero pieces so the navigable gap stays '
                              'open; a single AABB would seal it. Debris and components take one box.',
                'aabbM': [round(v, 2) for v in size],
            },
        }
        report['assets'].append(entry)
        if missing:
            report['socketFailures'].append({'id': pid, 'missing': missing})
        for g in gaps:
            if not g['pass']:
                report['gapFailures'].append({'id': pid, **g})
        for f in floating:
            report['floatingMarkFailures'].append({'id': pid, **f})
        gapnote = ''
        if gaps:
            gapnote = f" - GAP {gaps[0]['clearSpanM']}m {'PASS' if gaps[0]['pass'] else 'FAIL'}"
        log(f"{pid}: {entry['sizeM']} m - {entry['tris']} tris - {len(found)} sockets{gapnote}")

        # KEY_MUL: a wreck is the one subject in this project that supplies its own light. At the
        # standard pack exposure the key washed every fire and every hot break to pale salmon --
        # the same failure the everyday kit hit on its radiator cores, but caused by the KEY rather
        # than by the emissive value. Dropping the key lets the colour law read without pushing any
        # emissive past the ~3.0 white-out ceiling.
        if args.render:
            render_to(OUT_EVIDENCE / f'{pid}.png', (0, 0, 0), max(size) * 0.62, key_mul=WRECK_KEY_MUL)
        if args.distances:
            for band in distance_bands(max(size), meta['kind']):
                render_to(OUT_EVIDENCE / f'{pid}@{band}u.png', (0, 0, 0), max(size) * 0.62,
                          distance=float(band), key_mul=WRECK_KEY_MUL)
        if args.gaps and gaps:
            for probe in meta.get('gapProbes') or []:
                render_gap_pass(root, probe, OUT_EVIDENCE / f"{pid}_gap_{probe['name']}.png")

    # State variants ship as their own GLBs. A promotion lane needs a file per state, not a
    # rebuild instruction -- and the wreckClasses.js mapping in INTEGRATION.md points at filenames.
    # These export BEFORE the sheet renders: the state ladder imports the files, and an export
    # after the renders would have it drawing stale (or missing) GLBs.
    for base_id, states in STATE_VARIANTS.items():
        if base_id not in ids:
            continue
        for st in states:
            reset_scene()
            root, meta = BUILDERS[base_id](state=st)
            lo, hi, size = envelope(root)
            vid = f'{base_id}__{st}'
            path = OUT_SOURCE / f'{vid}.glb'
            sha = export_glb(root, path)
            found, missing = verify_sockets(path, meta.get('sockets') or [])
            gaps = measure_gaps(root, meta.get('gapProbes') or [])
            report['assets'].append({
                'id': vid, 'family': meta['family'], 'kind': 'state-variant', 'state': st,
                'was': meta['was'], 'reads': meta['reads'],
                'variantOf': base_id,
                'file': f'assets/incubator/wreck_aftermath_pack/source/{vid}.glb',
                'sha256': sha, 'bytes': path.stat().st_size,
                'generator': glb_payload(path).get('asset', {}).get('generator', 'unknown'),
                'tris': tri_count(root), 'sizeM': [round(v, 2) for v in size],
                'sockets': found, 'socketsMissing': missing,
                'floatingMarks': check_attachment(root),
                'gaps': gaps, 'drift': meta.get('drift'),
                'shipFrameOriginM': meta.get('shipFrameOriginM'),
            })
            # State variants used to compute `missing` and `check_attachment`, hard-code `gaps: []`,
            # and then drop every result on the floor: nothing was appended to the three failure
            # arrays. That made socketFailures/gapFailures/floatingMarkFailures VACUOUSLY empty for
            # 7 of 37 assets - 19% of the pack - while five of those variants ADVERTISE an
            # INTERACTION_* navigable-gap socket, so the pack's headline traversability claim was
            # unmeasured on exactly the files a promotion lane consumes. Measure the gaps for real
            # and aggregate all three like every other asset.
            if missing:
                report['socketFailures'].append({'id': vid, 'missing': missing})
            for g in gaps:
                if not g['pass']:
                    report['gapFailures'].append({'id': vid, **g})
            for f in report['assets'][-1]['floatingMarks']:
                report['floatingMarkFailures'].append({'id': vid, **f})
            log(f'{vid}: {[round(v, 1) for v in size]} m - {tri_count(root)} tris')

    metas = {a['id']: a for a in report['assets']}
    if args.sheets:
        for fam, fam_ids in FAMILY_OF.items():
            if args.only and fam != args.only:
                continue
            render_family_sheet(fam, [i for i in fam_ids if i in BUILDERS],
                                OUT_EVIDENCE / f'family-{fam}.png')
    if args.silhouettes:
        for ref_id in REFERENCES:
            fam = ref_id.replace('ref_', '').replace('_intact', '')
            if args.only and fam != args.only:
                continue
            heroes = [i for i in FAMILY_OF.get(fam, ()) if i in BUILDERS and i.startswith('wreck_')]
            render_silhouette_sheet(fam, ref_id, heroes, OUT_EVIDENCE / f'silhouette-{fam}.png')
    if args.compositions:
        for fam in COMPOSITION_FAMILIES:
            if args.only and fam != args.only:
                continue
            render_composition(fam, metas, OUT_EVIDENCE / f'composition-{fam}.png')
    if args.states:
        for base_id, states in STATE_VARIANTS.items():
            if base_id not in ids:
                continue
            render_state_ladder(base_id, states, OUT_EVIDENCE / f'states-{base_id}.png')

    # The authored-down hero: Forge-derived mining barge, mirrored to authored_down/ for release
    # promotion and to source/ for provenance (the catalog has no source twin for it). Kept OUT
    # of report['assets'] — the 37-source inventory is the release contract — but the same
    # socket / gap / floating-mark assertions apply to it.
    if not args.only:
        reset_scene()
        broot, bmeta = build_wreck_mining_barge()
        blo, bhi, bsize = envelope(broot)
        OUT_AUTHOR.mkdir(parents=True, exist_ok=True)
        for g in measure_gaps(broot, bmeta.get('gapProbes') or []):
            if not g['pass']:
                report['gapFailures'].append({'id': 'wreck_mining_barge', **g})
        for f in check_attachment(broot):
            report['floatingMarkFailures'].append({'id': 'wreck_mining_barge', **f})
        bpath = OUT_AUTHOR / 'wreck_mining_barge.glb'
        bsha = export_glb(broot, bpath)
        bfound, bmissing = verify_sockets(bpath, bmeta.get('sockets') or [])
        if bmissing:
            report['socketFailures'].append({'id': 'wreck_mining_barge', 'missing': bmissing})
        shutil.copy2(bpath, OUT_SOURCE / 'wreck_mining_barge.glb')
        log(f"wreck_mining_barge (authored_down): {[round(v, 1) for v in bsize]} m - "
            f"{tri_count(broot)} tris - {len(bfound)} sockets")

    report['renderFailures'] = RENDER_FAILURES
    report['assetCount'] = len(report['assets'])
    if not args.only:
        write_catalog(report)
        (OUT_EVIDENCE / 'build-report.json').write_text(
            json.dumps(report, indent=2) + '\n', encoding='utf-8')
    else:
        (OUT_EVIDENCE / f'build-report-{args.only}.json').write_text(
            json.dumps(report, indent=2) + '\n', encoding='utf-8')
    log(f"built {report['assetCount']} assets - socket failures: "
        f"{len(report['socketFailures'])} - gap failures: {len(report['gapFailures'])}"
        f" - floating marks: {len(report['floatingMarkFailures'])}"
        f" - render failures: {len(report['renderFailures'])}")

    # FAIL CLOSED. These four arrays were documented as "assertions" while the build exited 0 no
    # matter what they contained: a rebuild with a missing socket, a 36 m gap on a 28 m hull, or a
    # lamp floating in vacuum wrote all 37 GLBs, wrote a report, and returned success. Nothing
    # outside this file checks them either — a repo-wide grep for the four names finds no caller.
    # An assertion that cannot fail a build is not an assertion, so make them one.
    failed = {k: report[k] for k in
              ('socketFailures', 'gapFailures', 'floatingMarkFailures', 'renderFailures')
              if report.get(k)}
    if failed:
        for name, rows in failed.items():
            log(f'FAIL {name}: {len(rows)}')
            for row in rows[:10]:
                log(f'  {row}')
        raise SystemExit(
            'wreck pack build failed its own assertions: '
            + ', '.join(f'{k}={len(v)}' for k, v in failed.items()))


if __name__ == '__main__':
    main()

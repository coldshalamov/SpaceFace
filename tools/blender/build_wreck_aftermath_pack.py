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
import sys
from pathlib import Path

import bpy
from mathutils import Euler, Vector

ROOT = Path(__file__).resolve().parents[2]
OUT_SOURCE = ROOT / 'assets' / 'incubator' / 'wreck_aftermath_pack' / 'source'
OUT_EVIDENCE = ROOT / 'assets' / 'incubator' / 'wreck_aftermath_pack' / 'evidence'

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
    for o in objs:
        if o.type != 'MESH' or not o.data.polygons:
            continue
        try:
            hit, loc, _n, _i = o.closest_point_on_mesh(o.matrix_world.inverted() @ c)
        except (RuntimeError, ValueError):
            continue
        if not hit:
            continue
        best = min(best, ((o.matrix_world @ loc) - c).length)
    return best


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
# FAMILY 1 — BULK ORE FREIGHTER
#
# Identity that survives dismemberment (fiction §5): repeated deep hoppers slung inside an exposed
# open ring-frame trunk. The RINGS are the rhythm, and rings are frames -- so the class stays
# readable even in the heavily-stripped state where the skin is gone.
#
# The ring geometry is also what makes the navigable gap honest. A "missing hopper" slot between
# solid sides gives ~24 m of cross-section and the player hull is 28 m: that gap would be a lie.
# Slung INSIDE ring frames of 22 m inner radius, a torn-out hopper leaves the full ring bore clear,
# and the player flies through the ribcage port-to-starboard. Asserted in the report, not eyeballed.

FR_BAY = 34.0
FR_RING_MAJOR = 23.0
FR_RING_MINOR = 1.0          # inner bore 22.0 -> clear radius 22 > MIN_GAP_CLEAR_RADIUS
FR_RINGS = (119.0, 85.0, 51.0, 17.0, -17.0, -51.0, -85.0, -119.0)
FR_BAYS = (102.0, 68.0, 34.0, 0.0, -34.0, -68.0, -102.0)
FR_BOW_X = 134.0             # bow module centre; hull spans 119..149
FR_STERN_X = -134.0
FR_BREAK_X = 0.0             # fiction §1.1: in the weak BAY, never through a frame
FR_GAP_BAY = 68.0            # the hopper that was torn out


def _fr_hopper(asm, tag, xc, split=False, breached=False):
    """A deep ore hopper: wide mouth at z=+4 tapering to a narrow chute at z=-19, 28 m long.
    Fits inside the 22 m ring bore at every height (checked: 15.5 m at the mouth, 19.9 m at the
    chute corners)."""
    # 26 m, not 28: a hopper is 4 m shorter than its bay so that the bay it is torn OUT of clears
    # the 40 m the fiction promises. At 28 m the empty bay measured 39.4 m -- the 0.6 m bulkhead
    # plates ate the margin, and a gap that misses by 300 mm is still a gap the player cannot fly.
    half = 13.0
    lean = math.atan2(9.0, 23.0)  # slope of the taper, both sides
    for sgn in (1, -1):
        if breached and sgn < 0:
            # a hole torn in the PORT side (-Y), which is what the review camera and the player's
            # approach both see. Fire inside a sealed box is fire nobody ever witnesses.
            for i, (dx, w) in enumerate(((-9.0, 8.0), (9.0, 8.0))):
                asm.add(tag, box(f'{tag}_side_{sgn}_{i}', (w, 0.5, 24.7), (xc + dx, sgn * 10.5, -7.5),
                                 rot=(-sgn * lean, 0, 0)), 'wrk_paint_freight_ochre')
            tear_fringe(asm, tag, (xc, sgn * 10.5, -7.5), (0, -0.93, -0.36), 7.0, 7, squash=1.6,
                        depth=3.0, width=2.6)
            continue
        asm.add(tag, box(f'{tag}_side_{sgn}', (26.0, 0.5, 24.7), (xc, sgn * 10.5, -7.5),
                         rot=(-sgn * lean, 0, 0)), 'wrk_paint_freight_ochre')
        # external stiffeners: the frame rhythm repeats at hopper scale too
        for i, dx in enumerate((-8.5, 0.0, 8.5)):
            asm.add(tag, box(f'{tag}_stiff_{sgn}_{i}', (1.1, 0.9, 24.0),
                             (xc + dx, sgn * 11.1, -7.5), rot=(-sgn * lean, 0, 0)), 'wrk_frame_steel')
    # tapered end bulkheads, stacked in three widths
    for ex, label in ((xc - half, 'f'), (xc + half, 'a')):
        for i, (zc, w, h) in enumerate(((0.0, 26.6, 8.0), (-8.0, 20.4, 8.0), (-15.5, 14.9, 7.0))):
            # painted, not bare grey: round 1 read the stepped bulkheads as a grey slab wedged in
            # the frame rather than as the end of the hopper
            asm.add(tag, box(f'{tag}_end_{label}_{i}', (0.6, w, h), (ex, 0, zc)),
                    'wrk_paint_freight_ochre')
    # loading hatches across the mouth. The middle one is always open -- a hopper is loaded from the
    # gallery above, and an open hatch is what lets the fire inside be SEEN without being a lamp.
    for i, dx in enumerate((-8.4, 8.4)):
        asm.add(tag, box(f'{tag}_hatch_{i}', (7.6, 30.0, 0.5), (xc + dx, 0, 4.3)),
                'wrk_deck_grate')
    asm.add(tag, box(f'{tag}_chute', (26.0, 12.0, 1.4), (xc, 0, -19.0)), 'wrk_hull_bare')
    for sgn in (1, -1):
        asm.add(tag, beam(f'{tag}_rim_{sgn}', (xc - half, sgn * 15.0, 4.0),
                          (xc + half, sgn * 15.0, 4.0), 0.55), 'wrk_frame_steel')
    if split:
        # fiction §1.2: a vessel that lets go PETALS -- the seam splits and folds outward, still
        # anchored. Here the chute seam has opened and the load is leaving.
        for i, sgn in enumerate((1, -1)):
            asm.add(tag, plate(f'{tag}_petal_{i}', (xc - 9, sgn * 5.0, -18.0),
                               (xc + 9, sgn * 12.0, -25.0), 9.0, 0.4, roll=sgn * 0.8), 'wrk_torn_edge')
        for i, (dx, dy, dz, r) in enumerate(((-6, 2, -26, 2.6), (2, -3, -30, 2.0), (9, 4, -24, 1.7),
                                             (-1, 6, -34, 1.3), (6, -7, -38, 1.1))):
            asm.add(tag, sphere(f'{tag}_ore_{i}', r, (xc + dx, dy, dz), seg=8, rings=5), 'wrk_ore_raw')


def _fr_ring(asm, x, idx):
    tag = f'ring_{idx}'
    asm.add(tag, ring_frame(f'fr_ring_{idx}', FR_RING_MAJOR, FR_RING_MINOR, (x, 0, 0)), 'wrk_frame_steel')
    # gusset plates where the ring meets the dorsal spine and the ventral chords
    for sgn in (1, -1):
        asm.add(tag, box(f'fr_ring_{idx}_gusset_{sgn}', (1.6, 3.0, 4.0), (x, sgn * 3.0, 22.0)),
                'wrk_frame_steel')
    return tag


def _fr_ring_broken(asm, x, idx):
    """The frame nearest a break is never pristine. This one is an open arc with both ends torn --
    40 degrees of it went with the section that left, and the gap faces -Y where the review camera
    and the player's approach both see it."""
    tag = f'ring_{idx}'
    e0, e1 = ring_arc(asm, tag, f'fr_ring_{idx}', FR_RING_MAJOR, FR_RING_MINOR, (x, 0, 0),
                      200.0, 520.0)
    for sgn in (1, -1):
        asm.add(tag, box(f'fr_ring_{idx}_gusset_{sgn}', (1.6, 3.0, 4.0), (x, sgn * 3.0, 22.0)),
                'wrk_frame_steel')
    torn_member(asm, f'{tag}_tearA', e0, (0.0, -0.17, 0.98), 1.9, hot='wrk_hot_orange',
                splay=3, length=7.0, peel=2, peel_len=7.0, peel_w=3.4)
    torn_member(asm, f'{tag}_tearB', e1, (0.0, -0.17, -0.98), 1.9, hot='wrk_hot_orange',
                splay=3, length=6.0, peel=2, peel_len=6.0, peel_w=3.0)


def freighter_assembly(x_lo=-152.0, x_hi=152.0, missing_hoppers=(), broken_ring_x=None,
                       breached_hoppers=()):
    """The INTACT bulk ore freighter, authored once and CLIPPED TO AN X RANGE.

    Clipping at author time rather than deleting afterwards is what keeps the continuous members
    honest: the spine, gallery and ventral chords are built to the length this piece actually has,
    so nothing hangs in vacuum past the break and no rib survives 120 m aft of a hull that ended.
    `missing_hoppers` names bay indices whose hopper is not present -- the freighter's navigable gap
    is literally an absent hopper, so the hole and the drifting hopper share one source of truth."""
    asm = Assembly('ore_freighter')

    def inside(x, margin=0.0):
        return (x_lo - margin) <= x <= (x_hi + margin)

    for idx, x in enumerate(FR_RINGS):
        if not inside(x):
            continue
        if broken_ring_x is not None and abs(x - broken_ring_x) < 0.5:
            _fr_ring_broken(asm, x, idx)
        else:
            _fr_ring(asm, x, idx)

    # dorsal spine + loading gallery: the covered trunk running the hopper string
    s_lo, s_hi = max(x_lo, -136.0), min(x_hi, 136.0)
    if s_hi - s_lo > 1.0:
        asm.add('spine', box('fr_spine', (s_hi - s_lo, 6.4, 4.2), ((s_lo + s_hi) * 0.5, 0, 24.6)),
                'wrk_hull_bare')
        g_lo, g_hi = max(s_lo, -125.0), min(s_hi, 125.0)
        asm.add('plating_gallery', box('fr_gallery', (g_hi - g_lo, 11.0, 2.0),
                                       ((g_lo + g_hi) * 0.5, 0, 27.4)), 'wrk_paint_freight_ochre')
        for i in range(13):
            x = -120.0 + i * 20.0
            if g_lo <= x <= g_hi:
                asm.add('plating_gallery', box(f'fr_gallery_rib_{i}', (1.2, 12.4, 1.0), (x, 0, 28.6)),
                        'wrk_frame_steel')
    # ventral chords: the lower load path
    c_lo, c_hi = max(x_lo, -124.0), min(x_hi, 124.0)
    if c_hi - c_lo > 1.0:
        for sgn in (1, -1):
            asm.add('chord', beam(f'fr_chord_{sgn}', (c_lo, sgn * 9.0, -21.2),
                                  (c_hi, sgn * 9.0, -21.2), 1.3), 'wrk_frame_steel')
    # Bay bracing ties each ring to the spine above and the chords below. It is routed OUTSIDE the
    # 22 m ring bore on purpose: bracing through the bore would be the structurally obvious place to
    # put it and would also quietly destroy the navigable gap -- the first build measured 36.1 m of
    # clear span against the 40 m the fiction promises, and this is what caused it.
    for i in range(len(FR_RINGS) - 1):
        xa, xb = FR_RINGS[i], FR_RINGS[i + 1]
        if not (inside(xa) and inside(xb)):
            continue
        for sgn in (1, -1):
            asm.add(f'brace_{i}', beam(f'fr_brace_d_{i}_{sgn}', (xa, sgn * 3.2, 23.4),
                                       (xb, sgn * 6.0, 25.6), 0.5, verts=4), 'wrk_frame_steel')
            asm.add(f'brace_{i}', beam(f'fr_brace_v_{i}_{sgn}', (xa, sgn * 9.0, -22.0),
                                       (xb, sgn * 4.4, -23.4), 0.5, verts=4), 'wrk_frame_steel')

    for i, xc in enumerate(FR_BAYS):
        if inside(xc, margin=-14.0) and i not in missing_hoppers:
            _fr_hopper(asm, f'cargo_hopper_{i}', xc, breached=(i in breached_hoppers))

    if x_hi >= 119.0:
        _fr_bow_module(asm)
    if x_lo <= -119.0:
        _fr_stern_module(asm)
    return asm


def _fr_bow_module(asm):
    """Bridge, window band, ground tackle, sensor head."""
    asm.add('bow_hull', box('fr_bow_hull', (30.0, 26.0, 20.0), (FR_BOW_X, 0, 2.0)),
            'wrk_paint_freight_ochre')
    asm.add('bow_hull', cone('fr_bow_nose', 13.0, 5.0, 12.0, (FR_BOW_X + 20.0, 0, 2.0),
                             rot=(0, math.pi / 2, 0), verts=12), 'wrk_paint_freight_ochre')
    asm.add('bow_bridge', box('fr_bridge', (14.0, 20.0, 8.0), (FR_BOW_X - 4.0, 0, 15.5)),
            'wrk_paint_freight_ochre')
    asm.add('bow_glass', box('fr_bridge_glass', (0.6, 18.0, 3.4), (FR_BOW_X + 3.2, 0, 16.4)),
            'wrk_glass_shattered')
    for sgn in (1, -1):
        asm.add('bow_hull', cyl(f'fr_fairlead_{sgn}', 2.2, 3.0, (FR_BOW_X + 8.0, sgn * 11.0, 9.0),
                                rot=(math.pi / 2, 0, 0), verts=10), 'wrk_hull_bare')
    asm.add('sensor_mast', beam('fr_sensor_mast', (FR_BOW_X - 4.0, 0, 19.5),
                                (FR_BOW_X - 6.0, 0, 32.0), 0.5), 'wrk_frame_steel')
    asm.add('sensor_dish', cone('fr_sensor_dish', 3.4, 0.4, 1.6, (FR_BOW_X - 6.2, 0, 33.0),
                                rot=(0, math.pi / 2, 0), verts=12), 'wrk_hull_bare')

def _fr_stern_module(asm):
    """Drive block, bells, reactor, radiator wings."""
    asm.add('stern_hull', box('fr_stern_hull', (30.0, 24.0, 22.0), (FR_STERN_X, 0, 1.0)),
            'wrk_paint_freight_ochre')
    for sgn in (1, -1):
        asm.add('drive_bell', cone(f'fr_bell_{sgn}', 4.2, 7.2, 11.0, (FR_STERN_X - 20.0, sgn * 8.0, 0),
                                   rot=(0, -math.pi / 2, 0), verts=14), 'wrk_hull_bare')
        asm.add('drive_bell', tube(f'fr_bell_ring_{sgn}', 7.4, 1.2, (FR_STERN_X - 25.2, sgn * 8.0, 0),
                                   rot=(0, math.pi / 2, 0), verts=14), 'wrk_frame_steel')
        asm.add('radiator', box(f'fr_rad_{sgn}', (22.0, 0.7, 15.0),
                                (FR_STERN_X + 2.0, sgn * 17.0, 6.0), rot=(sgn * 0.25, 0, 0)),
                'wrk_hull_bare')
    asm.add('reactor', cyl('fr_reactor', 5.0, 12.0, (FR_STERN_X + 4.0, 0, 4.0),
                           rot=(0, math.pi / 2, 0), verts=14), 'wrk_tank_shell')
    asm.add('reactor', tube('fr_reactor_cage', 6.2, 13.0, (FR_STERN_X + 4.0, 0, 4.0),
                            rot=(0, math.pi / 2, 0), verts=10), 'wrk_frame_steel')
    return asm


def build_wreck_ore_freighter_bow(state='cooling'):
    """PRIMARY. ~150 m. Bow, bridge, three ring bays, two hoppers and the hole where the third was.

    Bay 1 (x=+68) is authored MISSING: its hopper is the drifting secondary section, and the empty
    ring bore it leaves is the navigable gap."""
    asm = freighter_assembly(x_lo=FR_BREAK_X, x_hi=152.0, missing_hoppers=(1,),
                             broken_ring_x=17.0, breached_hoppers=(2,))

    # THE BREAK (fiction 1.1): the spine let go in the bay centred on x=0, between frames. On an open
    # ring-frame trunk the only things that can tear are the members that actually crossed the
    # plane -- spine, gallery skin, and the two ventral chords. Note the gallery gets NO hot metal:
    # thin plate cools first, so heat survives only in the heavy sections (fiction 3).
    truss_break(asm, 'break_main', [
        ((FR_BREAK_X, 0.0, 24.6), (-1, 0, 0), 3.2, 'wrk_hot_white'),     # spine: thickest, whitest
        ((FR_BREAK_X, 0.0, 27.4), (-1, 0, 0), 5.5, None),                # gallery plating: cold
        ((FR_BREAK_X, -9.0, -21.2), (-1, 0, 0), 1.3, 'wrk_hot_orange'),  # port chord
        ((FR_BREAK_X, 9.0, -21.2), (-1, 0, 0), 1.3, 'wrk_hot_orange'),   # starboard chord
    ], cables=7, live_arc='wrk_arc_blue', cable_at=((FR_BREAK_X, 0, 23.6), (-1, 0, 0), 3.4))
    # directional damage (fiction §1.6): something arrived from port-low and raked forward.
    # the fire came from the break aft and washed forward; the bow still wears its owner's ochre
    scorch_from_break(asm, (FR_BREAK_X + 6.0, 0, 4.0), 78.0)
    cooling_cracks(asm, 'crack_spine', [(2.0, -3.2, 24.0), (26.0, -3.2, 24.3), (46.0, -3.0, 24.6),
                                        (70.0, -3.2, 24.6)])
    cooling_cracks(asm, 'crack_ring', [(17.0, -21.0, 8.0), (17.0, -22.6, 0.0), (17.0, -20.0, -9.0)])
    # vents originate at BREACHES, never at intact plating: round 2 put this one on the bridge
    # window, where it read as foam on the glass.
    vent_jet(asm, 'vent_break', (5.0, -3.4, 23.4), (-0.42, -0.86, 0.28), 22.0, r0=0.6)
    vent_jet(asm, 'vent_hold', (34.0, -11.6, -6.0), (0.1, -0.97, 0.22), 17.0, r0=0.45)
    # the ship's own systems still trying (fiction §4): sparse, two marks, not a runway
    asm.add('emerg', sphere('fr_emerg_a', 0.7, (FR_BOW_X + 6.0, -12.0, 12.0), seg=8, rings=5),
            'wrk_emerg_amber')
    asm.add('emerg', sphere('fr_emerg_b', 0.6, (34.0, -6.0, 26.9), seg=8, rings=5), 'wrk_emerg_red')
    # Fire INSIDE the hold, seen only through the open centre hatch (fiction 4: a fire you can see
    # all of is a lamp). The hopper at +34 keeps its two end hatches, so the burn is occluded from
    # most angles and flares as the player passes the opening.
    asm.add('fire_hold', sphere('fr_fire_a', 5.4, (34.0, 0.0, -7.0), seg=12, rings=7),
            'wrk_fire_internal')
    asm.add('fire_hold', sphere('fr_fire_b', 3.2, (30.0, -3.4, -13.0), seg=10, rings=6),
            'wrk_hot_orange')
    # the break itself glows from within the spine box
    asm.add('fire_break', cyl('fr_glow_spine', 2.4, 7.0, (5.0, 0.0, 24.6),
                              rot=(0, math.pi / 2, 0), verts=10), 'wrk_hot_deep_red')

    apply_state(asm, state)
    socks = [
        socket('SOCKET_Salvage_Bridge', (FR_BOW_X - 4.0, 0, 20.0)),
        socket('SOCKET_Salvage_Hopper', (102.0, 0, -6.0)),
        socket('SOCKET_Hazard_Break', (FR_BREAK_X + 3.0, 0, 0)),
        socket('SOCKET_BlackBox', (FR_BOW_X - 8.0, 3.2, 13.0)),
        socket('INTERACTION_RibcageGap', (FR_GAP_BAY, 0, 0), size=20.0),
    ]
    root, origin = finish(asm, 'wreck_ore_freighter_bow', socks)
    # the probe is authored in the intact vessel's frame, so it moves with the recentring
    probe = [FR_GAP_BAY - origin[0], -origin[1], -origin[2]]
    meta = {
        'family': 'ore_freighter',
        'kind': 'primary',
        'state': state,
        'shipFrameOriginM': origin,
        'was': 'Bulk ore freighter, forward two-thirds: bow, bridge and three ring-frame cargo bays.',
        'reads': 'Repeated ring frames and deep hoppers say freighter; the clean bay-centre break '
                 'with its rib fan says the spine snapped under load; the missing hopper says the '
                 'load left with it.',
        'gapProbes': [{'name': 'INTERACTION_RibcageGap', 'atM': probe}],
        'sockets': [s.name for s in socks],
        'drift': None,
    }
    return root, meta


def build_wreck_ore_freighter_stern(state='cooling'):
    """SECONDARY. The drive end, parted at the break and drifted away from it with the tumble the
    parting torque gave it (fiction §1.4). Mass stayed roughly on the lane; area did not."""
    asm = freighter_assembly(x_lo=-152.0, x_hi=-34.0, broken_ring_x=-51.0)
    truss_break(asm, 'break_main', [
        ((-34.0, 0.0, 24.6), (1, 0, 0), 3.2, 'wrk_hot_orange'),
        ((-34.0, 0.0, 27.4), (1, 0, 0), 5.5, None),
        ((-34.0, -9.0, -21.2), (1, 0, 0), 1.3, 'wrk_hot_deep_red'),
        ((-34.0, 9.0, -21.2), (1, 0, 0), 1.3, 'wrk_hot_deep_red'),
    ], cables=5, live_arc='wrk_arc_blue', cable_at=((-34.0, 0, 23.6), (1, 0, 0), 3.4))
    scorch_from_break(asm, (-40.0, 0, 4.0), 66.0)
    cooling_cracks(asm, 'crack_stern_ring', [(-51.0, -20.6, 9.0), (-51.0, -22.8, 0.0),
                                             (-51.0, -20.0, -9.6)])
    cooling_cracks(asm, 'crack_stern_chord', [(-44.0, -9.0, -21.2), (-70.0, -9.0, -21.2),
                                              (-96.0, -9.0, -21.2)])
    asm.add('fire_reactor', sphere('fr_fire_reactor', 4.4, (FR_STERN_X + 4.0, 0, 4.0),
                                   seg=12, rings=7), 'wrk_fire_internal')
    vent_jet(asm, 'vent_stern', (FR_STERN_X + 8.0, -12.4, 4.0), (0, -1, -0.15), 20.0, r0=0.6)
    apply_state(asm, state)
    socks = [
        socket('SOCKET_Salvage_Drive', (FR_STERN_X - 20.0, 8.0, 0)),
        socket('SOCKET_Hazard_Reactor', (FR_STERN_X + 4.0, 0, 4.0)),
        socket('SOCKET_Salvage_Radiator', (FR_STERN_X + 2.0, -17.0, 6.0)),
    ]
    d = drift_spec((-46.0, 31.0, -11.0), tumble_axis=(0.21, 0.88, 0.42), tumble_deg=37.0,
                   note='away from the break plane at x=-34, down-lane and to port')
    root, origin = finish(asm, 'wreck_ore_freighter_stern', socks)
    meta = {
        'family': 'ore_freighter',
        'kind': 'secondary',
        'state': state,
        'was': 'Bulk ore freighter, drive section: reactor, twin bells, radiator wings, two bays.',
        'reads': 'The heavy end. It kept its rings and its bells, tumbled off the lane axis, and '
                 'its break faces back toward the bow it left.',
        'sockets': [s.name for s in socks],
        'shipFrameOriginM': origin,
        'drift': d,
        'driftNote': 'Offset points away from the break plane at x=-34 along -X/+Y; the section '
                     'tumbled 37 deg about a non-aligned axis so it cannot read as parallel to the bow.',
    }
    return root, meta


def build_wreck_ore_freighter_hopper(state='cooling'):
    """SECONDARY. The hopper that was torn out of bay +68 -- the contents of the hole in the primary.
    Split along its chute seam, still spilling."""
    asm = Assembly('ore_freighter_hopper')
    _fr_hopper(asm, 'cargo_hopper_loose', 0.0, split=True)
    # the hanger lugs it tore off the ring frames by
    for sgn in (1, -1):
        for i, dx in enumerate((-12.0, 12.0)):
            asm.add('lug', beam(f'hop_lug_{sgn}_{i}', (dx, sgn * 15.0, 4.0),
                                (dx + sgn * 1.5, sgn * 17.5, 8.4), 0.65, verts=5), 'wrk_torn_edge')
    break_plane(asm, 'break_lug', (0, 0, 5.0), (0, 0, 1), 15.5,
                ribs=7, tears=8, cables=3, squash=0.35, stub=2.2, hot='wrk_hot_orange')
    cooling_cracks(asm, 'crack_hopper', [(-13.0, -10.6, -8.0), (0.0, -11.4, -12.0), (13.0, -10.6, -8.0)])
    apply_state(asm, state)
    socks = [socket('SOCKET_Salvage_Ore', (0, 0, -14.0))]
    d = drift_spec((18.0, -24.0, -13.0), tumble_axis=(0.62, 0.24, 0.75), tumble_deg=63.0,
                   note='fell out of bay +68 and below the lane axis, tumbling hard')
    root, _origin = finish(asm, 'wreck_ore_freighter_hopper', socks)
    return root, {
        'family': 'ore_freighter', 'kind': 'secondary', 'state': state,
        'was': 'Bulk ore freighter, single cargo hopper torn from its ring frames.',
        'reads': 'The thing that used to be in the hole. Lugs sheared at the top rim, chute seam '
                 'petalled outward, load still leaving.',
        'sockets': [s.name for s in socks], 'drift': d,
        'shipFrameOriginM': [FR_GAP_BAY, 0.0, -7.5],
    }


def build_deb_ore_freighter_ring_span(state='cooling'):
    """MEDIUM DEBRIS. One ring frame and the bay bracing that came with it."""
    asm = Assembly('fr_ring_span')
    asm.add('ring', ring_frame('deb_ring', FR_RING_MAJOR, FR_RING_MINOR, (0, 0, 0)), 'wrk_frame_steel')
    for sgn in (1, -1):
        asm.add('brace', beam(f'deb_brace_{sgn}', (0, sgn * 16.0, 16.5), (16.0, sgn * 19.0, -6.0),
                              0.5, verts=4), 'wrk_frame_steel')
    asm.add('spine', box('deb_spine_stub', (17.0, 6.4, 4.2), (7.0, 0, 24.6)), 'wrk_hull_bare')
    break_plane(asm, 'break_a', (16.5, 0, 6.0), (1, 0, 0), 12.0, ribs=6, tears=6, cables=3,
                squash=0.9, stub=2.4)
    tear_fringe(asm, 'tear_ring', (0, 0, -22.0), (0, 0, -1), 6.0, 5)
    apply_state(asm, state)
    d = drift_spec((-8.0, 62.0, 26.0), tumble_axis=(0.75, 0.12, 0.65), tumble_deg=71.0,
                   note='light structure: shed early and travelled far (fiction 1.3)')
    root, _origin = finish(asm, 'deb_ore_freighter_ring_span')
    return root, {'family': 'ore_freighter', 'kind': 'debris', 'state': state,
                  'was': 'Bulk ore freighter, one transverse ring frame with bay bracing.',
                  'reads': 'A frame with nothing left to frame. The 46 m bore names the ship class '
                           'on its own.', 'sockets': [], 'drift': d,
                  'shipFrameOriginM': [51.0, 0.0, 0.0]}


def build_deb_ore_freighter_hopper_lid(state='cooling'):
    """MEDIUM DEBRIS. A hopper's top rim and one side panel, curled back."""
    asm = Assembly('fr_hopper_lid')
    lean = math.atan2(9.0, 23.0)
    asm.add('plate', box('lid_side', (26.0, 0.5, 18.0), (0, 0, 0), rot=(-lean, 0, 0)),
            'wrk_paint_freight_ochre')
    asm.add('rim', beam('lid_rim', (-13.0, 3.6, 8.6), (13.0, 3.6, 8.6), 0.55), 'wrk_frame_steel')
    for i, dx in enumerate((-8.5, 0.0, 8.5)):
        asm.add('stiff', box(f'lid_stiff_{i}', (1.1, 0.9, 17.0), (dx, 0.7, 0), rot=(-lean, 0, 0)),
                'wrk_frame_steel')
    tear_fringe(asm, 'tear_lid', (0, -1.6, -8.4), (0, -0.36, -0.93), 12.0, 8, squash=0.24)
    tear_fringe(asm, 'tear_lid_end', (13.4, 0, 0), (1, 0, 0), 8.0, 6, squash=0.7)
    scorch_trail(asm, 'scorch_lid', (-3.0, -1.2, 2.0), (1, 0, 0), (0, 0.36, 0.93), 11.0)
    apply_state(asm, state)
    d = drift_spec((36.0, -74.0, 19.0), tumble_axis=(0.34, 0.71, 0.62), tumble_deg=118.0,
                   note='largest area-to-mass ratio in the family: the farthest traveller')
    root, _origin = finish(asm, 'deb_ore_freighter_hopper_lid')
    return root, {'family': 'ore_freighter', 'kind': 'debris', 'state': state,
                  'was': 'Bulk ore freighter, hopper side panel and top rim rail.',
                  'reads': 'Large area, low mass -- exactly the class of part that shears off and '
                           'travels (fiction §1.3). Ochre paint still names the owner.',
                  'sockets': [], 'drift': d,
                  'shipFrameOriginM': [FR_GAP_BAY, 12.0, 0.0]}


def build_deb_ore_freighter_drive_bell(state='stripped'):
    """MEDIUM DEBRIS. A drive bell on its mount ring, cut free and then dropped."""
    asm = Assembly('fr_drive_bell')
    asm.add('bell', cone('bell', 4.2, 7.2, 11.0, (0, 0, 0), rot=(0, -math.pi / 2, 0), verts=14),
            'wrk_hull_bare')
    asm.add('bell_ring', tube('bell_ring', 7.4, 1.2, (-5.2, 0, 0), rot=(0, math.pi / 2, 0), verts=14),
            'wrk_frame_steel')
    asm.add('mount', box('bell_mount', (3.0, 9.0, 1.4), (6.4, 0, 0)), 'wrk_frame_steel')
    # fiction §2: drive bells are taken FIRST, and a torch leaves a straight repeated edge
    cut_panel(asm, 'cut_mount', (7.6, -4.4, -0.8), (0, 1, 0), (0, 0, 1), 8.8, 1.6)
    conduit_stubs(asm, 'stub_feed', (7.0, 0, 0), (1, 0, 0), 2.4, 4)
    apply_state(asm, state)
    root, _origin = finish(asm, 'deb_ore_freighter_drive_bell')
    d = drift_spec((14.0, -9.0, -6.0), tumble_axis=(0.5, 0.5, 0.7), tumble_deg=24.0,
                   note='barely moved: it was cut off and released, not blown off')
    return root, {'family': 'ore_freighter', 'kind': 'debris', 'state': state,
                  'was': 'Bulk ore freighter, one drive bell with its mount ring.',
                  'reads': 'Cut free, not blown free: the mount edge is straight and square where '
                           'the torch went round it. Someone was here first.',
                  'sockets': [], 'drift': d,
                  'shipFrameOriginM': [-154.0, 8.0, 0.0]}


def build_ore_freighter_intact():
    """RENDER-ONLY reference silhouette. Deliberately NOT exported: these are wrecks, and shipping a
    flyable-looking intact hull would invite a promotion lane to treat it as a ship. It exists so the
    contact sheet can put 'what it was' beside 'what it is'."""
    asm = freighter_assembly()
    root, _origin = finish(asm, 'ref_ore_freighter_intact')
    return root, {'family': 'ore_freighter', 'kind': 'reference', 'state': 'intact',
                  'was': 'Bulk ore freighter, as built.', 'reads': 'Reference silhouette.',
                  'sockets': [], 'drift': None}




# ===========================================================================
# FAMILY 2 — PATROL CORVETTE (Concord)
#
# Chosen deliberately as the second hull because it is a PLATED MONOCOQUE. The freighter proved
# truss_break() on an open frame; nothing had yet exercised break_plane() on the shape it was
# written for -- a closed tube whose skin tears around a perimeter.
#
# It also carries the law. `military` is the one class flagged restricted: true in
# src/data/wreckClasses.js ("stripping it without a permit is a crime"), so the corvette's stripped
# variant is not a story about scrap value. It is evidence.

CV_LEN = 74.0
CV_R = 7.0             # hull radius: lean, fast proportions
CV_CUT_X = -6.0        # the lance went through here, at an angle -- not square to anything


def _cv_barbette(asm, tag, x, turret=True):
    """A turret ring. The ring is structure and survives; the turret is a bolt-on and does not."""
    asm.add(tag, cyl(f'{tag}_barb', 4.2, 3.0, (x, 0, CV_R * 0.72), verts=14), 'wrk_armor')
    asm.add(tag, tube(f'{tag}_ring', 4.5, 1.1, (x, 0, CV_R * 0.72 + 1.6), verts=14), 'wrk_frame_steel')
    if turret:
        asm.add(f'{tag}_turret', box(f'{tag}_house', (7.0, 6.0, 3.2), (x, 0, CV_R * 0.72 + 3.4)),
                'wrk_paint_navy_concord')
        asm.add(f'{tag}_turret', cyl(f'{tag}_gun', 0.55, 11.0, (x + 6.0, 0, CV_R * 0.72 + 3.6),
                                     rot=(0, math.pi / 2, 0), verts=10), 'wrk_hull_bare')


def corvette_assembly(x_lo=-CV_LEN, x_hi=CV_LEN, turrets=(1, 1), stripped_turret=None):
    asm = Assembly('corvette')

    def inside(x, m=0.0):
        return (x_lo - m) <= x <= (x_hi + m)

    # armoured monocoque: a segmented tube so a break can take a station without taking the ship
    for i in range(10):
        x = -63.0 + i * 14.0
        if not inside(x, m=-7.0):
            continue
        asm.add(f'hull_{i}', cyl(f'cv_hull_{i}', CV_R, 14.0, (x, 0, 0), rot=(0, math.pi / 2, 0),
                                 verts=12), 'wrk_paint_navy_concord')
        # belt armour on the flanks -- the citadel that never gets salvaged (fiction 2)
        for sgn in (1, -1):
            asm.add(f'plating_belt_{i}', box(f'cv_belt_{i}_{sgn}', (13.0, 0.7, 5.0),
                                             (x, sgn * (CV_R - 0.2), -0.5)), 'wrk_armor')
    if inside(66.0, m=-8.0):
        asm.add('prow', cone('cv_prow', CV_R, 1.2, 16.0, (69.0, 0, 0), rot=(0, math.pi / 2, 0),
                             verts=12), 'wrk_paint_navy_concord')
    # bridge citadel + window band
    if inside(24.0, m=-6.0):
        asm.add('bridge', box('cv_bridge', (14.0, 9.0, 4.4), (24.0, 0, CV_R * 0.78)),
                'wrk_paint_navy_concord')
        asm.add('bridge_glass', box('cv_bridge_glass', (0.5, 7.4, 1.6), (30.6, 0, CV_R * 0.78 + 0.5)),
                'wrk_glass_shattered')
    if turrets[0] and inside(46.0, m=-6.0):
        _cv_barbette(asm, 'barbette_fwd', 46.0, turret=(stripped_turret != 'fwd'))
    if turrets[1] and inside(-30.0, m=-6.0):
        _cv_barbette(asm, 'barbette_aft', -30.0, turret=(stripped_turret != 'aft'))
    # dorsal sensor spine + lateral fins
    if inside(6.0, m=-20.0):
        asm.add('sensor_spine', box('cv_spine', (44.0, 2.2, 1.6), (6.0, 0, CV_R + 1.0)),
                'wrk_hull_bare')
    for sgn in (1, -1):
        if inside(-46.0, m=-9.0):
            asm.add('fin', box(f'cv_fin_{sgn}', (18.0, 0.6, 11.0), (-46.0, sgn * 7.4, -1.0),
                               rot=(sgn * 0.34, 0, 0)), 'wrk_armor')
    # drive block
    if inside(-62.0, m=-8.0):
        asm.add('stern_block', cyl('cv_drive_block', CV_R * 1.05, 12.0, (-62.0, 0, 0),
                                   rot=(0, math.pi / 2, 0), verts=12), 'wrk_paint_navy_concord')
        for i, (dy, dz) in enumerate(((0.0, 3.4), (-3.6, -2.2), (3.6, -2.2))):
            asm.add('drive_bell', cone(f'cv_bell_{i}', 2.0, 3.2, 6.0, (-71.0, dy, dz),
                                       rot=(0, -math.pi / 2, 0), verts=12), 'wrk_hull_bare')
        asm.add('reactor', cyl('cv_reactor', 3.0, 7.0, (-54.0, 0, 0), rot=(0, math.pi / 2, 0),
                               verts=12), 'wrk_tank_shell')
    return asm


def build_wreck_corvette_forward(state='cooling'):
    """PRIMARY. Cut through the keel by a lance. The forward barbette is an EMPTY RING: the turret
    was sheared off its bearing and is a separate section."""
    asm = corvette_assembly(x_lo=CV_CUT_X, x_hi=CV_LEN, turrets=(1, 0), stripped_turret='fwd')
    # a plated tube tears around a perimeter -- this is break_plane()'s shape
    break_plane(asm, 'break_lance', (CV_CUT_X, 0, 0), (-1, 0, 0), CV_R * 1.02,
                ribs=10, tears=9, cables=5, hot='wrk_hot_white', live_arc='wrk_arc_blue', stub=5.2)
    # the lance kept going: a second, shallower gouge along the port flank shows its line
    torn_member(asm, 'gouge', (16.0, -CV_R + 0.4, -1.0), (0.30, -0.94, 0.16), 2.2,
                hot='wrk_hot_orange', splay=3, length=6.0, peel=3, peel_len=6.0, peel_w=2.6)
    scorch_from_break(asm, (CV_CUT_X + 4.0, -2.0, 0), 46.0)
    cooling_cracks(asm, 'crack_belt', [(2.0, -CV_R - 0.2, -0.5), (16.0, -CV_R - 0.3, -0.5),
                                       (30.0, -CV_R - 0.2, -0.5)])
    asm.add('fire_core', sphere('cv_fire', 2.6, (4.0, -1.6, -1.0), seg=10, rings=6), 'wrk_fire_internal')
    vent_jet(asm, 'vent_cut', (CV_CUT_X + 1.0, -4.0, 1.0), (-0.2, -0.94, 0.28), 15.0, r0=0.4)
    asm.add('emerg', sphere('cv_emerg', 0.55, (28.0, -4.4, 8.2), seg=8, rings=5), 'wrk_emerg_red')
    apply_state(asm, state)
    socks = [
        socket('SOCKET_Salvage_Barbette', (46.0, 0, CV_R * 0.72 + 2.4)),
        socket('SOCKET_Hazard_Break', (CV_CUT_X + 3.0, 0, 0)),
        socket('SOCKET_BlackBox', (24.0, 2.6, CV_R * 0.78 + 1.0)),
        socket('SOCKET_Evidence_Registry', (58.0, -CV_R + 0.4, 1.0)),
    ]
    root, origin = finish(asm, 'wreck_corvette_forward', socks)
    return root, {
        'family': 'corvette', 'kind': 'primary', 'state': state,
        'was': 'Concord patrol corvette, forward hull: prow, bridge citadel, forward barbette.',
        'reads': 'Belt armour and a gun ring say warship. The cut is angled and clean-edged where '
                 'the lance went through, ragged where the hull let go behind it. The barbette is '
                 'empty -- the turret is somewhere else.',
        'sockets': [s.name for s in socks], 'shipFrameOriginM': origin, 'drift': None,
        'wreckClass': 'military',
        'restricted': True,
    }


def build_wreck_corvette_engine(state='cooling'):
    """SECONDARY. The drive end, still carrying the reactor nobody wants to be near."""
    asm = corvette_assembly(x_lo=-CV_LEN, x_hi=CV_CUT_X, turrets=(0, 1))
    break_plane(asm, 'break_lance', (CV_CUT_X, 0, 0), (1, 0, 0), CV_R * 1.02,
                ribs=9, tears=8, cables=4, hot='wrk_hot_orange', live_arc='wrk_arc_blue', stub=4.4)
    scorch_from_break(asm, (CV_CUT_X - 6.0, -2.0, 0), 40.0)
    asm.add('fire_reactor', sphere('cv_fire_r', 2.9, (-54.0, 0, 0), seg=10, rings=6), 'wrk_fire_internal')
    cooling_cracks(asm, 'crack_drive', [(-56.0, -6.4, -1.0), (-64.0, -6.6, -0.4), (-70.0, -5.0, 0.6)])
    apply_state(asm, state)
    socks = [
        socket('SOCKET_Salvage_Drive', (-71.0, 0, 0)),
        socket('SOCKET_Hazard_Reactor', (-54.0, 0, 0)),
    ]
    d = drift_spec((-24.0, -19.0, 7.0), tumble_axis=(0.18, 0.62, 0.76), tumble_deg=52.0,
                   note='pushed aft and to starboard by its own dying drive')
    root, origin = finish(asm, 'wreck_corvette_engine', socks)
    return root, {
        'family': 'corvette', 'kind': 'secondary', 'state': state,
        'was': 'Concord patrol corvette, drive section: reactor, three bells, aft barbette.',
        'reads': 'The end that kept thrusting for a second after the ship stopped being a ship.',
        'sockets': [s.name for s in socks], 'shipFrameOriginM': origin, 'drift': d,
        'wreckClass': 'military', 'restricted': True,
    }


def build_wreck_corvette_turret(state='cooling'):
    """SECONDARY. Sheared off its bearing ring, gun still trained where it was last pointed."""
    asm = Assembly('corvette_turret')
    asm.add('turret', box('cvt_house', (7.0, 6.0, 3.2), (0, 0, 0)), 'wrk_paint_navy_concord')
    asm.add('turret', cyl('cvt_gun', 0.55, 11.0, (6.0, 0, 0.2), rot=(0, math.pi / 2, 0), verts=10),
            'wrk_hull_bare')
    asm.add('ring', tube('cvt_ring', 4.5, 1.1, (0, 0, -2.0), verts=14), 'wrk_frame_steel')
    # the bearing SHEARED: a ring of broken teeth, not a cut
    rib_fan(asm, 'shear', (0, 0, -2.4), (0, 0, -1), 4.2, 12, stub=1.6, thick=0.22)
    tear_fringe(asm, 'shear', (0, 0, -2.6), (0, 0, -1), 4.6, 8, depth=1.8, width=1.6)
    scorch_from_break(asm, (0, -1.0, -2.0), 7.0)
    apply_state(asm, state)
    socks = [socket('SOCKET_Salvage_Weapon', (2.0, 0, 0.6))]
    d = drift_spec((11.0, 26.0, 14.0), tumble_axis=(0.71, 0.33, 0.62), tumble_deg=104.0,
                   note='light, high, and spinning: sheared parts leave fast')
    root, _o = finish(asm, 'wreck_corvette_turret', socks)
    return root, {
        'family': 'corvette', 'kind': 'secondary', 'state': state,
        'was': 'Concord patrol corvette, main turret with its bearing ring.',
        'reads': 'Milspec, restricted, and lying in the open. Someone will want it and someone will '
                 'be fined for taking it.',
        'sockets': [s.name for s in socks], 'shipFrameOriginM': [46.0, 0.0, 5.0], 'drift': d,
        'wreckClass': 'military', 'restricted': True,
    }


def build_deb_corvette_armor_belt(state='cooling'):
    """MEDIUM DEBRIS. A section of belt armour, holed."""
    asm = Assembly('cv_belt')
    asm.add('plate', box('belt_slab', (15.0, 0.8, 5.0), (0, 0, 0)), 'wrk_armor')
    for i, dx in enumerate((-5.0, 0.5, 5.5)):
        asm.add('rib', box(f'belt_rib_{i}', (0.9, 1.6, 4.6), (dx, 0.9, 0)), 'wrk_frame_steel')
    tear_fringe(asm, 'tear_a', (7.6, 0, 0), (1, 0, 0), 2.6, 6, squash=1.9, depth=2.0, width=1.6)
    tear_fringe(asm, 'tear_b', (-7.6, 0, 0), (-1, 0, 0), 2.6, 6, squash=1.9, depth=1.7, width=1.4)
    scorch_from_break(asm, (3.0, -0.5, 0), 9.0)
    apply_state(asm, state)
    d = drift_spec((22.0, -31.0, -12.0), tumble_axis=(0.26, 0.80, 0.54), tumble_deg=87.0)
    root, _o = finish(asm, 'deb_corvette_armor_belt')
    return root, {'family': 'corvette', 'kind': 'debris', 'state': state,
                  'was': 'Concord patrol corvette, one belt-armour section.',
                  'reads': 'Too heavy to be worth lifting, too obviously milspec to be worth being '
                           'caught with.', 'sockets': [], 'shipFrameOriginM': [16.0, -7.0, -0.5],
                  'drift': d, 'wreckClass': 'military', 'restricted': True}


def build_deb_corvette_barbette_ring(state='stripped'):
    """MEDIUM DEBRIS. A gun ring cut out of the deck -- a salvage cut, not battle damage."""
    asm = Assembly('cv_barb')
    asm.add('ring', tube('barb_ring', 4.5, 1.2, (0, 0, 1.4), verts=14), 'wrk_frame_steel')
    asm.add('barb', cyl('barb_drum', 4.2, 3.0, (0, 0, 0), verts=14), 'wrk_armor')
    asm.add('deck', box('barb_deck', (11.0, 10.0, 0.5), (0, 0, -1.7)), 'wrk_paint_navy_concord')
    # fiction 2: a torch follows the framing, so the deck it came out of is a clean rectangle
    cut_panel(asm, 'cut_deck', (-5.5, -5.0, -1.9), (1, 0, 0), (0, 1, 0), 11.0, 10.0)
    conduit_stubs(asm, 'stub_feed', (0, 0, -1.9), (0, 0, -1), 2.2, 4)
    apply_state(asm, state)
    d = drift_spec((6.0, -8.0, -4.0), tumble_axis=(0.62, 0.44, 0.65), tumble_deg=31.0,
                   note='dropped, not thrown: cut free by a salvage crew')
    root, _o = finish(asm, 'deb_corvette_barbette_ring')
    return root, {'family': 'corvette', 'kind': 'debris', 'state': state,
                  'was': 'Concord patrol corvette, barbette ring cut from the deck.',
                  'reads': 'The straight square edge on the deck plate is the whole story: this was '
                           'taken, and taking it was a crime.',
                  'sockets': [], 'shipFrameOriginM': [-30.0, 0.0, 5.0], 'drift': d,
                  'wreckClass': 'military', 'restricted': True}


def build_corvette_intact():
    asm = corvette_assembly()
    root, _o = finish(asm, 'ref_corvette_intact')
    return root, {'family': 'corvette', 'kind': 'reference', 'state': 'intact',
                  'was': 'Concord patrol corvette, as built.', 'reads': 'Reference silhouette.',
                  'sockets': [], 'drift': None}


# ===========================================================================
# FAMILY 3 — CIVILIAN PASSENGER LINER
#
# Chosen as the third hull because the outward-petalling pressure vessel (fiction 1.2) is the one
# fracture rule nothing else in the pack tests, and because a 46 m hab drum is the only hull here
# big enough to hold a navigable gap INSIDE itself rather than between its sections.

LN_DRUM_X = -6.0
LN_DRUM_R = 23.0
LN_DRUM_L = 44.0
LN_PETAL_SECTORS = (4, 5, 6, 7)     # a 120-degree wound, opened toward -Y


def _ln_drum(asm, tag, petal=True, sectors=12):
    """The pressurised hab drum. Fiction 1.2: a vessel that lets go PETALS -- the shell splits on its
    weld seams and folds outward, still anchored by its saddles. An outward petal is the single
    clearest read of 'this burst from inside', and it is the opposite of a hole punched in."""
    for i in range(sectors):
        a0 = i * (360.0 / sectors)
        mid = math.radians(a0 + 180.0 / sectors)
        outward = Vector((0.0, math.cos(mid), math.sin(mid)))
        if petal and i in LN_PETAL_SECTORS:
            base = Vector((LN_DRUM_X, 0, 0)) + outward * (LN_DRUM_R - 0.6)
            tip = base + outward * 17.0 + Vector((0.0, 0.0, 0.0))
            asm.add(f'{tag}_petal', plate(f'{tag}_petal_{i}', base, tip, LN_DRUM_L * 0.82, 0.5,
                                          roll=0.55 + 0.30 * (i % 3)), 'wrk_torn_edge')
            # the frames the skin tore off stay behind, bare
            asm.add(f'{tag}_petal', beam(f'{tag}_frame_{i}',
                                         Vector((LN_DRUM_X - LN_DRUM_L * 0.42, 0, 0)) + outward * LN_DRUM_R,
                                         Vector((LN_DRUM_X + LN_DRUM_L * 0.42, 0, 0)) + outward * LN_DRUM_R,
                                         0.42, verts=5), 'wrk_frame_steel')
            continue
        tangent = Vector((0.0, -math.sin(mid), math.cos(mid)))
        asm.add(f'{tag}_shell', box(f'{tag}_shell_{i}', (LN_DRUM_L, 0.7, 12.4),
                                    tuple(Vector((LN_DRUM_X, 0, 0)) + outward * LN_DRUM_R),
                                    rot=(math.radians(a0 + 180.0 / sectors), 0, 0)),
                'wrk_paint_liner_bone')
        # continuous window rows: the identity that survives everything (fiction 5)
        if i not in LN_PETAL_SECTORS:
            asm.add(f'{tag}_glass', box(f'{tag}_win_{i}', (LN_DRUM_L * 0.82, 0.3, 2.0),
                                        tuple(Vector((LN_DRUM_X, 0, 0)) + outward * (LN_DRUM_R + 0.4)),
                                        rot=(math.radians(a0 + 180.0 / sectors), 0, 0)),
                    'wrk_glass_shattered')
    for ex in (LN_DRUM_X - LN_DRUM_L * 0.5, LN_DRUM_X + LN_DRUM_L * 0.5):
        asm.add(f'{tag}_bulkhead', tube(f'{tag}_ring_{ex:.0f}', LN_DRUM_R, 1.4, (ex, 0, 0),
                                        rot=(0, math.pi / 2, 0), verts=20), 'wrk_frame_steel')


def build_wreck_liner_drum(state='cooling'):
    """PRIMARY. The hab drum, petalled outward. The wound IS the navigable gap: fly in through the
    hole the decompression made and out through the open bulkhead ring."""
    asm = Assembly('liner_drum')
    _ln_drum(asm, 'drum', petal=True)
    # spine stubs at both ends -- the drum was the middle of a longer ship
    for sgn, d in ((1, (1, 0, 0)), (-1, (-1, 0, 0))):
        x = LN_DRUM_X + sgn * (LN_DRUM_L * 0.5 + 4.0)
        asm.add('spine', cyl(f'ln_spine_{sgn}', 5.0, 9.0, (x, 0, 0), rot=(0, math.pi / 2, 0),
                             verts=12), 'wrk_hull_bare')
        torn_member(asm, f'break_spine_{sgn}', (x + sgn * 4.6, 0, 0), d, 5.0,
                    hot='wrk_hot_orange' if sgn < 0 else None, splay=4, length=8.0,
                    peel=3, peel_len=7.0, peel_w=3.4)
    # ONE deck, in the belly. Two decks at -15 and -19.5 read fine and measured 16.8 m of clear
    # radius: a drum is only flyable if its bore is actually empty, so interior structure has to
    # hug the shell rather than span the middle.
    asm.add('deck', box('ln_deck_0', (LN_DRUM_L * 0.9, 18.0, 0.5), (LN_DRUM_X, 0, -21.0)),
            'wrk_deck_grate')
    # fire against the far wall in an INTACT sector: seen across the bore through the wound, hidden
    # from every other angle by the shell it sits behind (fiction 4)
    asm.add('fire_hold', sphere('ln_fire', 2.6, (LN_DRUM_X + 15.0, 17.5, 8.0), seg=12, rings=7),
            'wrk_fire_internal')
    vent_jet(asm, 'vent_wound', (LN_DRUM_X, -18.0, -8.0), (0.05, -0.92, -0.38), 26.0, r0=0.7)
    cooling_cracks(asm, 'crack_ring', [(LN_DRUM_X - 21.0, -20.0, 9.0), (LN_DRUM_X - 21.6, -22.4, 0.0),
                                       (LN_DRUM_X - 21.0, -19.4, -9.6)])
    scorch_from_break(asm, (LN_DRUM_X, -18.0, -10.0), 34.0)
    # emergency lighting is the horror of this one: the ship is still trying to help
    # lamps ride the shell's inner face at r=22 and only in INTACT sectors -- two of the three were
    # authored at r~19.5, i.e. hanging in the middle of the room, and one was in a sector the
    # decompression had torn away entirely
    for i, a_deg in enumerate((40.0, 100.0, 290.0)):
        a = math.radians(a_deg)
        asm.add('emerg', sphere(f'ln_emerg_{i}', 0.8,
                                (LN_DRUM_X + 14.0 - i * 13.0, math.cos(a) * 22.0, math.sin(a) * 22.0),
                                seg=8, rings=5), 'wrk_emerg_amber')
    apply_state(asm, state)
    socks = [
        socket('SOCKET_Salvage_Hab', (LN_DRUM_X, 0, -12.0)),
        socket('SOCKET_Hazard_Wound', (LN_DRUM_X, -20.0, -6.0)),
        socket('SOCKET_BlackBox', (LN_DRUM_X + 19.0, 4.0, 6.0)),
        socket('INTERACTION_DrumBore', (LN_DRUM_X, 0, 0.0), size=20.0),
    ]
    root, origin = finish(asm, 'wreck_liner_drum', socks)
    probe = [LN_DRUM_X - origin[0], -origin[1], -origin[2]]
    return root, {
        'family': 'liner', 'kind': 'primary', 'state': state,
        'was': 'Civilian passenger liner, pressurised habitation drum.',
        'reads': 'Window rows say people lived here. The shell is folded OUTWARD along four sectors, '
                 'which says it burst from the inside -- nothing hit this ship, its air left it.',
        'gapProbes': [{'name': 'INTERACTION_DrumBore', 'atM': probe}],
        'sockets': [s.name for s in socks], 'shipFrameOriginM': origin, 'drift': None,
    }


def build_wreck_liner_bow(state='cooling'):
    """SECONDARY. The bow survived intact -- which is the cruelty of it."""
    asm = Assembly('liner_bow')
    for i in range(3):
        asm.add(f'hull_{i}', cyl(f'lnb_hull_{i}', 11.0 - i * 1.2, 14.0, (i * -14.0, 0, 0),
                                 rot=(0, math.pi / 2, 0), verts=14), 'wrk_paint_liner_bone')
        asm.add(f'glass_{i}', box(f'lnb_win_{i}', (11.0, 1.8, 0.4), (i * -14.0, -10.4, 1.6)),
                'wrk_glass_shattered')
        asm.add(f'glass_{i}', box(f'lnb_win_t{i}', (11.0, 1.8, 0.4), (i * -14.0, 10.4, 1.6)),
                'wrk_glass_shattered')
    asm.add('prow', cone('lnb_prow', 11.0, 2.0, 14.0, (14.0, 0, 0), rot=(0, math.pi / 2, 0),
                         verts=14), 'wrk_paint_liner_bone')
    asm.add('bridge', box('lnb_bridge', (10.0, 15.0, 4.0), (2.0, 0, 10.0)), 'wrk_paint_liner_bone')
    asm.add('bridge_glass', box('lnb_bridge_glass', (0.5, 13.0, 1.8), (7.2, 0, 10.6)),
            'wrk_glass_shattered')
    torn_member(asm, 'break_aft', (-32.0, 0, 0), (-1, 0, 0), 9.0, hot='wrk_hot_deep_red',
                splay=5, length=9.0, peel=4, peel_len=8.0, peel_w=4.0)
    tear_fringe(asm, 'break_aft', (-32.0, 0, 0), (-1, 0, 0), 9.2, 10, depth=4.0, width=3.0)
    scorch_from_break(asm, (-30.0, -4.0, 0), 30.0)
    asm.add('emerg', sphere('lnb_emerg', 0.7, (0.0, -10.6, 5.0), seg=8, rings=5), 'wrk_emerg_amber')
    apply_state(asm, state)
    socks = [socket('SOCKET_Salvage_Bridge', (2.0, 0, 12.0)),
             socket('SOCKET_BlackBox', (2.0, 3.0, 8.0))]
    d = drift_spec((38.0, 17.0, -9.0), tumble_axis=(0.14, 0.36, 0.92), tumble_deg=28.0,
                   note='barely tumbled: it parted cleanly and kept the ship attitude')
    root, origin = finish(asm, 'wreck_liner_bow', socks)
    return root, {
        'family': 'liner', 'kind': 'secondary', 'state': state,
        'was': 'Civilian passenger liner, forward hull and bridge.',
        'reads': 'Almost undamaged, which is the worst part: whatever happened, it happened behind '
                 'this bulkhead and everyone forward of it knew about it for a while.',
        'sockets': [s.name for s in socks], 'shipFrameOriginM': origin, 'drift': d,
    }


def build_wreck_liner_boatbay(state='cooling'):
    """SECONDARY. The boat bay -- and every davit is EMPTY. Someone got off."""
    asm = Assembly('liner_boatbay')
    asm.add('hull', box('lbb_hull', (30.0, 13.0, 11.0), (0, 0, 0)), 'wrk_paint_liner_bone')
    for i, dx in enumerate((-10.0, -2.0, 6.0)):
        # davit arms swung OUT and empty: the single most eloquent shape in this pack
        asm.add('davit', beam(f'lbb_davit_{i}', (dx, -6.4, 4.0), (dx, -13.0, 7.4), 0.45, verts=6),
                'wrk_frame_steel')
        asm.add('davit', beam(f'lbb_fall_{i}', (dx, -13.0, 7.4), (dx, -12.4, 1.0), 0.12, verts=4),
                'wrk_cable')
        asm.add('bay', box(f'lbb_cradle_{i}', (6.4, 3.0, 0.5), (dx, -5.6, 1.0)), 'wrk_deck_grate')
    asm.add('glass', box('lbb_win', (26.0, 1.8, 0.4), (0, -6.8, 7.4)), 'wrk_glass_shattered')
    torn_member(asm, 'break_f', (16.0, 0, 0), (1, 0, 0), 6.0, hot='wrk_hot_deep_red',
                splay=4, length=6.5, peel=3, peel_len=5.5, peel_w=2.8)
    torn_member(asm, 'break_a', (-16.0, 0, 0), (-1, 0, 0), 6.0, splay=4, length=6.0,
                peel=3, peel_len=5.0, peel_w=2.6)
    scorch_from_break(asm, (14.0, -3.0, 0), 22.0)
    apply_state(asm, state)
    socks = [socket('SOCKET_Salvage_Bay', (0, -5.0, 2.0)),
             socket('SOCKET_Evidence_Manifest', (-8.0, -6.6, 6.0))]
    d = drift_spec((-14.0, -33.0, 12.0), tumble_axis=(0.55, 0.22, 0.80), tumble_deg=66.0)
    root, origin = finish(asm, 'wreck_liner_boatbay', socks)
    return root, {
        'family': 'liner', 'kind': 'secondary', 'state': state,
        'was': 'Civilian passenger liner, boat bay section.',
        'reads': 'Three davits, swung out, falls cut, cradles empty. The lifeboats launched. '
                 'Somebody survived this and the wreck says so without a word.',
        'sockets': [s.name for s in socks], 'shipFrameOriginM': origin, 'drift': d,
    }


def build_deb_liner_hull_panel(state='cooling'):
    """MEDIUM DEBRIS. A hull panel with an intact window row: instantly a PASSENGER ship."""
    asm = Assembly('ln_panel')
    asm.add('plate', box('lnp_skin', (19.0, 8.0, 0.6), (0, 0, 0), rot=(0.22, 0, 0)),
            'wrk_paint_liner_bone')
    asm.add('glass', box('lnp_win', (16.0, 1.7, 0.35), (0, 0, 0.55), rot=(0.22, 0, 0)),
            'wrk_glass_shattered')
    for i, dx in enumerate((-6.5, 0.0, 6.5)):
        asm.add('rib', box(f'lnp_rib_{i}', (0.7, 7.6, 0.9), (dx, 0, -0.7), rot=(0.22, 0, 0)),
                'wrk_frame_steel')
    tear_fringe(asm, 'tear_a', (9.6, 0, 0), (1, 0, 0), 3.8, 7, squash=1.7, depth=2.6, width=2.0)
    tear_fringe(asm, 'tear_b', (-9.6, 0, 0), (-1, 0, 0), 3.8, 7, squash=1.7, depth=2.2, width=1.8)
    apply_state(asm, state)
    d = drift_spec((-31.0, -58.0, 24.0), tumble_axis=(0.42, 0.66, 0.62), tumble_deg=133.0,
                   note='thin skin, huge area: the piece that ends up furthest from the hull')
    root, _o = finish(asm, 'deb_liner_hull_panel')
    return root, {'family': 'liner', 'kind': 'debris', 'state': state,
                  'was': 'Civilian passenger liner, hull panel with cabin window row.',
                  'reads': 'One row of windows is all it takes. Nobody mistakes this for freight.',
                  'sockets': [], 'shipFrameOriginM': [LN_DRUM_X + 8.0, -20.0, 6.0], 'drift': d}


def build_deb_liner_drive_pod(state='stripped'):
    """MEDIUM DEBRIS. An outboard drive pod, bell already taken."""
    asm = Assembly('ln_pod')
    asm.add('pod', cyl('lnd_pod', 3.4, 13.0, (0, 0, 0), rot=(0, math.pi / 2, 0), verts=12),
            'wrk_paint_liner_bone')
    asm.add('pylon', box('lnd_pylon', (7.0, 0.8, 6.0), (1.0, 0, 5.2)), 'wrk_frame_steel')
    asm.add('mount', tube('lnd_mount', 3.6, 1.0, (-6.6, 0, 0), rot=(0, math.pi / 2, 0), verts=12),
            'wrk_frame_steel')
    cut_panel(asm, 'cut_bell', (-7.2, -3.0, -3.0), (0, 1, 0), (0, 0, 1), 6.0, 6.0)
    tear_fringe(asm, 'tear_pylon', (1.0, 0, 8.4), (0, 0, 1), 3.4, 6, squash=0.22, depth=2.0, width=1.6)
    conduit_stubs(asm, 'stub', (-6.8, 0, 0), (-1, 0, 0), 2.0, 4)
    apply_state(asm, state)
    d = drift_spec((-19.0, 24.0, -16.0), tumble_axis=(0.68, 0.51, 0.53), tumble_deg=74.0)
    root, _o = finish(asm, 'deb_liner_drive_pod')
    return root, {'family': 'liner', 'kind': 'debris', 'state': state,
                  'was': 'Civilian passenger liner, outboard drive pod.',
                  'reads': 'Torn off its pylon, and the bell is already gone -- square torch cut '
                           'around the mount. Salvage got here before you did.',
                  'sockets': [], 'shipFrameOriginM': [LN_DRUM_X - 26.0, 14.0, 0.0], 'drift': d}


def build_liner_intact():
    asm = Assembly('liner_intact')
    _ln_drum(asm, 'drum', petal=False)
    for i in range(3):
        asm.add(f'hull_{i}', cyl(f'lni_hull_{i}', 11.0 - i * 1.2, 14.0,
                                 (44.0 + i * 14.0, 0, 0), rot=(0, math.pi / 2, 0), verts=14),
                'wrk_paint_liner_bone')
    asm.add('prow', cone('lni_prow', 11.0, 2.0, 14.0, (86.0, 0, 0), rot=(0, math.pi / 2, 0),
                         verts=14), 'wrk_paint_liner_bone')
    asm.add('bay', box('lni_bay', (30.0, 13.0, 11.0), (-46.0, 0, 0)), 'wrk_paint_liner_bone')
    for sgn in (1, -1):
        asm.add('pod', cyl(f'lni_pod_{sgn}', 3.4, 13.0, (-72.0, sgn * 14.0, -4.0),
                           rot=(0, math.pi / 2, 0), verts=12), 'wrk_paint_liner_bone')
        asm.add('pylon', box(f'lni_pylon_{sgn}', (7.0, 0.8, 6.0), (-71.0, sgn * 14.0, 1.2)),
                'wrk_frame_steel')
    root, _o = finish(asm, 'ref_liner_intact')
    return root, {'family': 'liner', 'kind': 'reference', 'state': 'intact',
                  'was': 'Civilian passenger liner, as built.', 'reads': 'Reference silhouette.',
                  'sockets': [], 'drift': None}


# ===========================================================================
# ORDINARY AFTERMATH KIT (fiction §6)
#
# Most combat should leave something, and it must not be a hero wreck -- a landmark that shows up
# after every skirmish stops being a landmark by the third one. These are eight recognisable
# COMPONENTS that could have come off any hull.
#
# Sized 8-22 m on purpose: the game's own aftermath path pins entity radius at WRECK_RADIUS = 9
# (aftermathWrecks.js), i.e. an ~18 m wreck. A component at this scale can REPLACE that procedural
# wreck rather than garnish it. The dormant foundry fragments are 3-7 m and cannot.
#
# Every one obeys the same three rules as the hero hulls: broken at a joint rather than shattered
# (§1), some showing salvage cuts rather than battle damage (§2), fresh ones still glowing (§4).

def _aft(name, family='aftermath', kind='component', state='cooling', was='', reads='', socks=(),
         origin=None, d=None):
    return {'family': family, 'kind': kind, 'state': state, 'was': was, 'reads': reads,
            'sockets': [s.name for s in socks], 'shipFrameOriginM': origin, 'drift': d}


def build_aft_engine_section(state='cooling'):
    asm = Assembly('aft_engine')
    asm.add('block', cyl('ae_block', 3.4, 8.0, (0, 0, 0), rot=(0, math.pi / 2, 0), verts=14),
            'wrk_hull_bare')
    asm.add('drive_bell', cone('ae_bell', 2.2, 4.4, 7.0, (-7.0, 0, 0), rot=(0, -math.pi / 2, 0),
                               verts=14), 'wrk_hull_bare')
    asm.add('drive_bell', tube('ae_bellring', 4.6, 1.0, (-10.2, 0, 0), rot=(0, math.pi / 2, 0),
                               verts=14), 'wrk_frame_steel')
    for i in range(4):
        a = 0.4 + i * math.pi / 2
        asm.add('pipe', beam(f'ae_manifold_{i}', (2.0, math.cos(a) * 3.2, math.sin(a) * 3.2),
                             (-3.0, math.cos(a) * 4.0, math.sin(a) * 4.0), 0.35, verts=6), 'wrk_pipe')
    torn_member(asm, 'break_mount', (4.4, 0, 0), (1, 0, 0), 3.2, hot='wrk_hot_white',
                splay=5, length=6.0, peel=4, peel_len=5.0, peel_w=2.4)
    conduit_stubs(asm, 'stub', (4.2, 0, 0), (1, 0, 0), 2.4, 4, live='wrk_arc_blue')
    asm.add('fire_core', sphere('ae_fire', 1.9, (-1.0, 0, 0), seg=10, rings=6), 'wrk_fire_internal')
    cooling_cracks(asm, 'crack', [(3.0, -3.3, 0.6), (-1.0, -3.5, 0.4), (-4.6, -2.6, 0.2)])
    scorch_from_break(asm, (3.6, -1.0, 0), 8.0)
    apply_state(asm, state)
    socks = [socket('SOCKET_Salvage_Drive', (-7.0, 0, 0)), socket('SOCKET_Hazard_Core', (0, 0, 0))]
    root, _o = finish(asm, 'aft_engine_section', socks)
    return root, _aft('aft_engine_section', state=state, socks=socks,
                      was='Any hull, engine section: combustion block, bell, feed manifold.',
                      reads='The single most legible "a ship died here" shape there is. Torn off '
                            'its mounts, still hot in the throat.',
                      d=drift_spec((0, 0, 0), tumble_axis=(0.4, 0.6, 0.7), tumble_deg=41.0))


def build_aft_weapon_spar(state='cooling'):
    asm = Assembly('aft_spar')
    asm.add('spar', box('as_spar', (17.0, 2.4, 1.6), (0, 0, 0)), 'wrk_armor')
    asm.add('mount', cyl('as_mount', 1.5, 2.6, (7.0, 0, 0.8), verts=10), 'wrk_frame_steel')
    asm.add('weapon', cyl('as_barrel', 0.45, 7.0, (-4.0, 0, 1.4), rot=(0, math.pi / 2, 0), verts=10),
            'wrk_hull_bare')
    asm.add('weapon', box('as_housing', (4.4, 2.0, 1.8), (0.5, 0, 1.6)), 'wrk_hull_bare')
    for i, dx in enumerate((-6.0, -1.0, 4.0)):
        asm.add('rib', box(f'as_rib_{i}', (0.6, 3.0, 1.2), (dx, 0, -0.5)), 'wrk_frame_steel')
    torn_member(asm, 'break_root', (8.6, 0, 0), (1, 0, 0), 1.6, hot='wrk_hot_orange',
                splay=4, length=5.0, peel=3, peel_len=4.4, peel_w=1.8)
    tear_fringe(asm, 'tear_tip', (-8.6, 0, 0), (-1, 0, 0), 1.4, 5, squash=1.4, depth=1.6, width=1.2)
    scorch_from_break(asm, (7.0, -0.8, 0), 9.0)
    apply_state(asm, state)
    socks = [socket('SOCKET_Salvage_Weapon', (0.5, 0, 2.0))]
    root, _o = finish(asm, 'aft_weapon_spar', socks)
    return root, _aft('aft_weapon_spar', state=state, socks=socks,
                      was='Any hull, weapon spar or hardpoint wing.',
                      reads='Snapped at the root fitting, not mid-span: things break where they '
                            'bolt on.',
                      d=drift_spec((0, 0, 0), tumble_axis=(0.7, 0.2, 0.68), tumble_deg=96.0))


def build_aft_cargo_module(state='cooling'):
    asm = Assembly('aft_cargo')
    # deliberately the Berth-standard 6x3x3 footprint the everyday-space kit established, scaled to
    # a triple module: a shape the player has already learned reads as freight
    asm.add('cargo_box', box('ac_box', (13.0, 6.4, 6.4), (0, 0, 0)), 'wrk_paint_freight_ochre')
    for i, dx in enumerate((-4.4, 0.0, 4.4)):
        asm.add('rib', box(f'ac_rib_{i}', (0.5, 6.8, 6.8), (dx, 0, 0)), 'wrk_frame_steel')
    # split along a seam and spilling
    for i, sgn in enumerate((1, -1)):
        asm.add('petal', plate(f'ac_petal_{i}', (-2.0, sgn * 3.2, -3.2), (4.0, sgn * 6.4, -6.0),
                               5.0, 0.3, roll=sgn * 0.7), 'wrk_torn_edge')
    for i, (dx, dy, dz, r) in enumerate(((1.0, 1.0, -6.0, 1.1), (3.4, -2.0, -8.0, 0.9),
                                         (-1.6, 2.6, -9.2, 0.7))):
        asm.add('spill', box(f'ac_crate_{i}', (r * 2, r * 1.6, r * 1.6), (dx, dy, dz),
                             rot=(0.4 * i, 0.3 * i, 0.2 * i)), 'wrk_paint_freight_ochre')
    tear_fringe(asm, 'tear_seam', (1.0, 0, -3.2), (0, 0, -1), 5.4, 8, depth=2.2, width=1.8)
    scorch_from_break(asm, (2.0, -3.4, -2.0), 8.0)
    apply_state(asm, state)
    socks = [socket('SOCKET_Salvage_Cargo', (0, 0, 0))]
    root, _o = finish(asm, 'aft_cargo_module', socks)
    return root, _aft('aft_cargo_module', state=state, socks=socks,
                      was='Any hull, cargo module on the Berth-standard footprint.',
                      reads='Split on a seam and still shedding. Whoever gets here first gets the '
                            'rest of it.',
                      d=drift_spec((0, 0, 0), tumble_axis=(0.3, 0.8, 0.52), tumble_deg=58.0))


def build_aft_cockpit_section(state='cooling'):
    asm = Assembly('aft_cockpit')
    asm.add('nose', cone('ak_nose', 3.0, 0.8, 7.0, (4.0, 0, 0), rot=(0, math.pi / 2, 0), verts=12),
            'wrk_hull_bare')
    asm.add('cabin', box('ak_cabin', (6.0, 5.0, 3.6), (-2.0, 0, 0.2)), 'wrk_hull_bare')
    asm.add('glass', box('ak_canopy', (4.6, 3.6, 0.4), (-1.4, 0, 2.1)), 'wrk_glass_shattered')
    asm.add('glass', box('ak_canopy_side', (4.6, 0.4, 1.6), (-1.4, -2.5, 0.8)), 'wrk_glass_shattered')
    torn_member(asm, 'break_aft', (-5.4, 0, 0), (-1, 0, 0), 2.6, hot='wrk_hot_orange',
                splay=5, length=5.0, peel=4, peel_len=4.2, peel_w=2.0)
    conduit_stubs(asm, 'stub', (-5.2, 0, 0), (-1, 0, 0), 1.8, 5, live='wrk_arc_blue')
    asm.add('emerg', sphere('ak_emerg', 0.4, (-1.0, -2.7, 1.4), seg=8, rings=5), 'wrk_emerg_red')
    scorch_from_break(asm, (-4.4, -1.4, 0), 7.0)
    apply_state(asm, state)
    socks = [socket('SOCKET_BlackBox', (-3.0, 1.6, -0.6)),
             socket('SOCKET_Evidence_Registry', (2.0, -2.6, 0.6))]
    root, _o = finish(asm, 'aft_cockpit_section', socks)
    return root, _aft('aft_cockpit_section', state=state, socks=socks,
                      was='Any hull, cockpit / control section.',
                      reads='The part with the black box in it, and the part a player will always '
                            'stop for. Canopy gone, cabin lights still on.',
                      d=drift_spec((0, 0, 0), tumble_axis=(0.6, 0.44, 0.67), tumble_deg=77.0))


def build_aft_radiator_panel(state='cooling'):
    asm = Assembly('aft_radiator')
    asm.add('panel', box('ar_panel', (19.0, 0.5, 9.0), (0, 0, 0)), 'wrk_hull_bare')
    for i, dx in enumerate((-7.0, -2.4, 2.2, 6.8)):
        asm.add('rib', box(f'ar_rib_{i}', (0.5, 1.0, 9.4), (dx, 0.4, 0)), 'wrk_frame_steel')
    asm.add('pipe', beam('ar_header_a', (-9.0, 0.5, 4.4), (9.0, 0.5, 4.4), 0.4), 'wrk_pipe')
    asm.add('pipe', beam('ar_header_b', (-9.0, 0.5, -4.4), (9.0, 0.5, -4.4), 0.4), 'wrk_pipe')
    # a big thin panel is the classic thing that shears off and travels (fiction §1.3)
    tear_fringe(asm, 'tear_root', (9.6, 0, 0), (1, 0, 0), 4.6, 8, squash=1.9, depth=2.6, width=2.0)
    # cold: a radiator that still glowed would mean the ship was still running it
    cooling_cracks(asm, 'crack', [(-8.0, -0.4, 2.0), (0.0, -0.4, 0.0), (8.0, -0.4, -2.0)])
    scorch_from_break(asm, (7.0, -0.6, 0), 10.0)
    apply_state(asm, state)
    socks = [socket('SOCKET_Salvage_Radiator', (0, 0, 0))]
    root, _o = finish(asm, 'aft_radiator_panel', socks)
    return root, _aft('aft_radiator_panel', state=state, socks=socks,
                      was='Any hull, radiator wing panel.',
                      reads='Huge area, almost no mass. If this is near the hull it came off, the '
                            'kill was recent.',
                      d=drift_spec((0, 0, 0), tumble_axis=(0.2, 0.75, 0.63), tumble_deg=141.0))


def build_aft_pressure_tank(state='cooling'):
    asm = Assembly('aft_tank')
    asm.add('tank', cyl('at_shell', 3.6, 9.0, (0, 0, 0), rot=(0, math.pi / 2, 0), verts=16),
            'wrk_tank_shell')
    for ex in (-4.5, 4.5):
        asm.add('tank', sphere(f'at_dome_{ex:.0f}', 3.6, (ex, 0, 0), seg=14, rings=8), 'wrk_tank_shell')
    for i, sgn in enumerate((1, -1)):
        asm.add('saddle', box(f'at_saddle_{i}', (1.4, 8.0, 1.0), (sgn * 3.0, 0, -3.6)),
                'wrk_frame_steel')
    # fiction §1.2: it petals, and the saddles hold on
    for i in range(4):
        a = 0.5 + i * 0.55
        base = Vector((0, math.cos(a) * 3.4, math.sin(a) * 3.4))
        tip = base + Vector((0, math.cos(a), math.sin(a))) * 6.0
        asm.add('petal', plate(f'at_petal_{i}', tuple(base), tuple(tip), 5.0, 0.3,
                               roll=0.6 + 0.3 * i), 'wrk_torn_edge')
    vent_jet(asm, 'vent', (0.0, 2.6, 2.6), (0, 0.62, 0.78), 12.0, r0=0.4)
    scorch_from_break(asm, (0, 2.0, 2.0), 7.0)
    apply_state(asm, state)
    socks = [socket('SOCKET_Hazard_Volatile', (0, 0, 0))]
    root, _o = finish(asm, 'aft_pressure_tank', socks)
    return root, _aft('aft_pressure_tank', state=state, socks=socks,
                      was='Any hull, pressure vessel with saddle mounts.',
                      reads='Peeled open from the inside and still anchored by its saddles -- the '
                            'clearest "this burst" shape in the kit.',
                      d=drift_spec((0, 0, 0), tumble_axis=(0.52, 0.3, 0.8), tumble_deg=63.0))


def build_aft_armor_slab(state='derelict'):
    asm = Assembly('aft_armor')
    asm.add('plate', box('aa_slab', (11.0, 1.2, 7.0), (0, 0, 0)), 'wrk_armor')
    for i, dz in enumerate((-2.0, 2.0)):
        asm.add('rib', box(f'aa_rib_{i}', (10.0, 1.6, 0.8), (0, 0.9, dz)), 'wrk_frame_steel')
    # a dish, not a hole: armour that did its job and deformed
    asm.add('dish', sphere('aa_dish', 2.6, (1.6, -1.2, 0.6), seg=12, rings=7), 'wrk_scorch')
    tear_fringe(asm, 'tear_a', (5.6, 0, 0), (1, 0, 0), 3.4, 6, squash=1.6, depth=1.8, width=1.6)
    tear_fringe(asm, 'tear_b', (-5.6, 0, 0), (-1, 0, 0), 3.4, 6, squash=1.6, depth=1.5, width=1.4)
    scorch_from_break(asm, (1.6, -1.4, 0.6), 6.0)
    apply_state(asm, state)
    root, _o = finish(asm, 'aft_armor_slab')
    return root, _aft('aft_armor_slab', state=state,
                      was='Any hull, armour slab with backing ribs.',
                      reads='Dished inward on one face and scorched around it. Something hit this '
                            'from a direction, and the armour won.',
                      d=drift_spec((0, 0, 0), tumble_axis=(0.66, 0.5, 0.56), tumble_deg=38.0))


def build_aft_dock_collar(state='stripped'):
    asm = Assembly('aft_collar')
    asm.add('collar', tube('ad_ring', 4.0, 2.4, (0, 0, 0), rot=(0, math.pi / 2, 0), verts=18),
            'wrk_hull_bare')
    asm.add('collar', tube('ad_seal', 3.4, 0.8, (1.6, 0, 0), rot=(0, math.pi / 2, 0), verts=18),
            'wrk_insulation')
    for i in range(6):
        a = i * math.tau / 6
        asm.add('latch', box(f'ad_latch_{i}', (1.6, 0.9, 0.9),
                             (0.4, math.cos(a) * 4.2, math.sin(a) * 4.2)), 'wrk_frame_steel')
    asm.add('tunnel', cyl('ad_tunnel', 3.0, 5.0, (-3.4, 0, 0), rot=(0, math.pi / 2, 0), verts=14),
            'wrk_hull_bare')
    # severed, and then someone cut the good parts off the severed end
    torn_member(asm, 'break_tunnel', (-6.2, 0, 0), (-1, 0, 0), 3.0, splay=4, length=4.6,
                peel=3, peel_len=4.0, peel_w=2.0)
    cut_panel(asm, 'cut_latch', (0.4, 3.4, -1.0), (1, 0, 0), (0, 0, 1), 2.0, 2.0)
    conduit_stubs(asm, 'stub', (-6.0, 0, 0), (-1, 0, 0), 2.0, 4)
    apply_state(asm, state)
    socks = [socket('SOCKET_Salvage_Collar', (0, 0, 0))]
    root, _o = finish(asm, 'aft_dock_collar', socks)
    return root, _aft('aft_dock_collar', state=state, socks=socks,
                      was='Any hull, severed docking collar and tunnel stub.',
                      reads='A door to nothing. One latch has been cut out square -- the rest are '
                            'still there, so whoever it was left in a hurry.',
                      d=drift_spec((0, 0, 0), tumble_axis=(0.45, 0.62, 0.64), tumble_deg=88.0))


# ===========================================================================
# SHARED FRAGMENT KIT (fiction §6)
#
# SHARED across every family, not authored per-family: at the size a fragment occupies on
# screen there is no legibility to be gained from making it family-specific, and one near-identical
# kit per family would be N times the review surface for no player-visible gain.
#
# "All six families" is what the FICTION specifies (§5). Only THREE are built — ore freighter,
# corvette, liner — so this kit is currently shared across three, sized to serve six if the
# remaining hulls are ever authored. Do not read the six as a count of what exists.
#
# The dormant foundry trio (scenery_wreck_fragment_v01..v03) covers similar ideas at 0.5-7 m; see
# EXISTING_COVERAGE.md §2. These are authored at 4-9 m with drift specs and pack materials, and do
# not touch those files.

def _frag(name, was, reads, tumble, state='cooling'):
    return {'family': 'fragments', 'kind': 'fragment', 'state': state, 'was': was, 'reads': reads,
            'sockets': [], 'shipFrameOriginM': None,
            'drift': drift_spec((0, 0, 0), tumble_axis=tumble[0], tumble_deg=tumble[1])}


def build_frag_plate_curl(state='cooling'):
    asm = Assembly('frag_curl')
    for i, (roll, w) in enumerate(((0.6, 3.4), (1.5, 2.6), (2.4, 1.8))):
        asm.add('plate', plate(f'fc_{i}', (-3.0 + i * 0.6, i * 0.8, i * 0.5),
                               (3.2 - i * 0.5, i * 1.4 + 0.6, i * 1.1), w, 0.16, roll=roll),
                'wrk_paint_freight_ochre' if i == 0 else 'wrk_torn_edge')
    apply_state(asm, state)
    root, _o = finish(asm, 'frag_plate_curl')
    return root, _frag('frag_plate_curl', 'Hull plating, curled back on itself.',
                       'Paint on one face, bare torn metal on the other.', ((0.6, 0.5, 0.62), 122.0),
                       state)


def build_frag_rib_cluster(state='cooling'):
    asm = Assembly('frag_ribs')
    for i in range(5):
        a = 0.3 + i * 0.7
        asm.add('rib', beam(f'fr_rib_{i}', (-3.2 + i * 0.7, math.cos(a) * 0.6, math.sin(a) * 0.6),
                            (3.0 - i * 0.5, math.cos(a) * 2.6, math.sin(a) * 2.8), 0.22, verts=5),
                'wrk_frame_steel')
    asm.add('plate', plate('fr_skin', (-2.0, 0.4, 0.2), (2.4, 1.2, 1.6), 2.2, 0.14, roll=0.9),
            'wrk_torn_edge')
    apply_state(asm, state)
    root, _o = finish(asm, 'frag_rib_cluster')
    return root, _frag('frag_rib_cluster', 'Internal framing with a shred of skin still attached.',
                       'Frames survive what plating does not -- this is that rule at fragment scale.',
                       ((0.3, 0.72, 0.62), 88.0), state)


def build_frag_cable_bundle(state='cooling'):
    asm = Assembly('frag_cable')
    for i in range(7):
        a = i * 0.9
        asm.add('cable', beam(f'fb_c_{i}', (-2.6, math.cos(a) * 0.4, math.sin(a) * 0.4),
                              (2.2 + 0.4 * (i % 3), math.cos(a) * 2.2, math.sin(a) * 1.8 - 0.6),
                              0.13, verts=4), 'wrk_cable')
    asm.add('conduit', cyl('fb_duct', 0.9, 3.0, (-3.0, 0, 0), rot=(0, math.pi / 2, 0), verts=10),
            'wrk_pipe')
    asm.add('arc', sphere('fb_arc', 0.22, (2.4, 1.4, 0.6), seg=8, rings=5), 'wrk_arc_blue')
    apply_state(asm, state)
    root, _o = finish(asm, 'frag_cable_bundle')
    return root, _frag('frag_cable_bundle', 'Severed cable trunk, conduit still on the end.',
                       'Still live: one arc, tiny, the hottest colour in the pack owning the least '
                       'screen area.', ((0.72, 0.32, 0.61), 154.0), state)


def build_frag_grating_sheet(state='derelict'):
    asm = Assembly('frag_grate')
    asm.add('plate', box('fg_sheet', (5.6, 4.0, 0.18), (0, 0, 0), rot=(0.3, 0.2, 0)), 'wrk_deck_grate')
    for i, dx in enumerate((-1.8, 0.6, 2.6)):
        asm.add('rib', box(f'fg_bar_{i}', (0.22, 4.2, 0.3), (dx, 0, -0.2), rot=(0.3, 0.2, 0)),
                'wrk_frame_steel')
    tear_fringe(asm, 'tear', (2.9, 0, 0), (1, 0, 0), 1.8, 5, squash=1.6, depth=1.1, width=0.9)
    apply_state(asm, state)
    root, _o = finish(asm, 'frag_grating_sheet')
    return root, _frag('frag_grating_sheet', 'Deck grating, one bay of it.',
                       'Says there was a floor here, and therefore people.',
                       ((0.5, 0.6, 0.62), 61.0), state)


def build_frag_pipe_tangle(state='cooling'):
    asm = Assembly('frag_pipes')
    for i in range(6):
        a = i * 1.1
        asm.add('pipe', beam(f'fp_{i}', (-2.4 + i * 0.4, math.cos(a) * 1.2, math.sin(a) * 1.0),
                             (2.0 - i * 0.3, math.cos(a + 1.2) * 1.6, math.sin(a + 0.8) * 1.8),
                             0.24, verts=6), 'wrk_pipe')
    asm.add('bracket', box('fp_bracket', (0.5, 2.6, 0.5), (0.4, 0, -1.2)), 'wrk_frame_steel')
    apply_state(asm, state)
    root, _o = finish(asm, 'frag_pipe_tangle')
    return root, _frag('frag_pipe_tangle', 'Service pipework torn out of a run.',
                       'Bent, not cut: this came out with the wall.', ((0.66, 0.5, 0.56), 97.0), state)


def build_frag_strut_shard(state='cooling'):
    asm = Assembly('frag_strut')
    asm.add('strut', beam('fs_main', (-4.0, 0, 0), (3.6, 0.8, 1.2), 0.4, verts=6), 'wrk_frame_steel')
    asm.add('strut', beam('fs_side', (-1.2, 0.2, 0.3), (1.8, -1.6, -1.4), 0.28, verts=5),
            'wrk_frame_steel')
    torn_member(asm, 'break', (3.8, 0.85, 1.3), (0.9, 0.2, 0.3), 0.5, hot='wrk_hot_deep_red',
                splay=3, length=2.0, peel=2, peel_len=1.6, peel_w=0.8)
    apply_state(asm, state)
    root, _o = finish(asm, 'frag_strut_shard')
    return root, _frag('frag_strut_shard', 'Structural strut, snapped.',
                       'One end frayed and faintly warm, the other cleanly attached to nothing.',
                       ((0.42, 0.68, 0.6), 133.0), state)


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
        clear = gap_clearance(meshes, probe['atM'])
        out.append({
            'name': probe['name'],
            'atM': [round(v, 1) for v in probe['atM']],
            'clearRadiusM': round(clear, 2),
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
    ref_root, _meta = REFERENCES[intact_id]()
    _lo, _hi, ref_size = envelope(ref_root)
    span = max(1.0, max(ref_size)) * 0.30
    top = span * len(wreck_ids) * 0.5
    ref_root.location = Vector((0, 0, top))
    _label_front('AS BUILT', (-max(ref_size) * 0.74, 0, top + span * 0.34), span * 0.15)
    for i, wid in enumerate(wreck_ids):
        r, _m = BUILDERS[wid]()
        r.location = Vector((0, 0, top - span * (i + 1)))
        _label_front(wid, (-max(ref_size) * 0.74, 0, top - span * (i + 1) + span * 0.34),
                     span * 0.11)
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
    for loc, energy, col in (((mid.x + d * 0.5, mid.y - d * 0.7, mid.z + d * 0.5), 60 * e, (1.0, 0.86, 0.68)),
                             ((mid.x - d * 0.6, mid.y - d * 0.6, mid.z - d * 0.3), 20 * e, (0.55, 0.68, 1.0)),
                             ((mid.x, mid.y - d * 0.2, mid.z + d * 0.8), 22 * e, (0.75, 0.82, 1.0))):
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


def render_family_sheet(family, ids, shot_path):
    reset_scene()
    built = []
    for pid in ids:
        r, _m = BUILDERS[pid]()
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
    probe, _m = BUILDERS[base_id](state=order[0])
    _lo, _hi, sz = envelope(probe)
    bpy.data.objects.remove(probe, do_unlink=True)
    reset_scene()
    sp = max(1.0, max(sz)) * 0.34
    top = sp * (len(order) - 1) * 0.5
    for i, st in enumerate(order):
        r, _m = BUILDERS[base_id](state=st)
        r.location = Vector((0, 0, top - sp * i))
        _label_front(st.upper(), (-max(sz) * 0.78, 0, top - sp * i + sp * 0.34), sp * 0.16)
    bpy.context.view_layer.update()
    _sheet_frame(shot_path, (1500, 1700))


def render_composition(family, shot_path):
    """Put the ship back together as it now lies: every piece at its ship-frame origin PLUS its
    recorded drift. This is the only render in the pack where fiction 1.4 can be judged -- a
    per-asset shot cannot show whether a section drifted away from the break it tore off at, and
    the numbers alone cannot show whether two sections read as parallel (they must not)."""
    reset_scene()
    pts = []
    for pid in FAMILY_OF[family]:
        if pid not in BUILDERS:
            continue
        root, meta = BUILDERS[pid]()
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
            render_composition(fam, OUT_EVIDENCE / f'composition-{fam}.png')
    if args.states:
        for base_id, states in STATE_VARIANTS.items():
            if base_id not in ids:
                continue
            render_state_ladder(base_id, states, OUT_EVIDENCE / f'states-{base_id}.png')

    # State variants ship as their own GLBs. A promotion lane needs a file per state, not a
    # rebuild instruction -- and the wreckClasses.js mapping in INTEGRATION.md points at filenames.
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

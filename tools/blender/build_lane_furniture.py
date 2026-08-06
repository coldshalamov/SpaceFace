#!/usr/bin/env python3
"""Author the six lane-furniture classes described in design/fiction/LANE_FURNITURE.md.

These are the things BETWEEN stations — the marks a working corridor accumulates and nobody
photographs. They exist because the sector reads as empty at the only scale the camera can see
(design/graphics-sprints/CAMERA_VISIBLE_BUBBLE.md: ~45-50 world units of visible ground-plane
depth), and because six small authored bodies buy more density per triangle than one more hull.

SOURCE ONLY. This writes GLBs under assets/places/lane_furniture/source/ and renders contact
sheets. It publishes no release artifact and touches no manifest; promotion belongs to whoever
holds those exact paths.

DETERMINISM. Every dimension, lean, dent and missing bolt below is AUTHORED, not sampled. There
is no RNG anywhere in this file. Two runs of the same revision produce byte-identical geometry,
which is what makes an adversarial review of one build binding on the next.

WHY THE DAMAGE IS MODELLED RATHER THAN TEXTURED. The fiction is specific about what breaks on
each class and why — an antenna ring crushed flat on one side where a Pelican's scoop brushed it,
two of four rock bolts sheared, one vane replaced with an unpainted flat plate after a strike.
That asymmetry is SILHOUETTE, and silhouette is the channel that survives distance. A dent painted
into a normal map disappears at 200 units; a missing fin does not.

Usage:
    blender --background --python tools/blender/build_lane_furniture.py -- --render
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]
OUT_SOURCE = ROOT / 'assets' / 'places' / 'lane_furniture' / 'source'
OUT_EVIDENCE = ROOT / 'assets' / 'places' / 'lane_furniture' / 'evidence'

# Material roles, named the way the rest of the asset pipeline names them so a later promotion
# does not have to invent a mapping.
ROLES = {
    'furniture_painted_shell': (0.42, 0.24, 0.10, 0.62),   # heat-stained orange-brown over steel
    'furniture_structural_alloy': (0.30, 0.31, 0.33, 0.55),
    'furniture_bare_steel': (0.44, 0.45, 0.47, 0.38),      # unpainted replacement plate, raw bolts
    'furniture_signal_lens': (0.90, 0.62, 0.22, 0.30),
    'furniture_identity_plate': (0.62, 0.60, 0.55, 0.50),
    'furniture_scorch': (0.11, 0.09, 0.08, 0.78),
}


def log(msg):
    print(f'[lane-furniture] {msg}', flush=True)


def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def material(role):
    if role in bpy.data.materials:
        return bpy.data.materials[role]
    r, g, b, rough = ROLES[role]
    mat = bpy.data.materials.new(role)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = (r, g, b, 1.0)
    bsdf.inputs['Roughness'].default_value = rough
    if 'Metallic' in bsdf.inputs:
        bsdf.inputs['Metallic'].default_value = 0.0 if role == 'furniture_signal_lens' else 0.85
    if role == 'furniture_signal_lens' and 'Emission Color' in bsdf.inputs:
        bsdf.inputs['Emission Color'].default_value = (1.0, 0.70, 0.28, 1.0)
        bsdf.inputs['Emission Strength'].default_value = 3.2
    return mat


def put(obj, role, parent=None):
    obj.data.materials.clear()
    obj.data.materials.append(material(role))
    if parent is not None:
        obj.parent = parent
    return obj


def cyl(name, radius, depth, loc, rot=(0, 0, 0), verts=16):
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=radius, depth=depth,
                                        location=loc, rotation=rot)
    o = bpy.context.active_object
    o.name = name
    return o


def box(name, size, loc, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=loc, rotation=rot)
    o = bpy.context.active_object
    o.name = name
    o.scale = Vector(size)
    bpy.ops.object.transform_apply(scale=True)
    return o


def root_for(name):
    bpy.ops.object.empty_add(type='PLAIN_AXES', location=(0, 0, 0))
    r = bpy.context.active_object
    r.name = name
    return r


# ─────────────────────────────────────────────────────────────────────────────────────────────────
# 1. CLAIM MARK — "a 1.8 m hexagonal spike, 0.28 m across flats, 0.9 m radio tick capsule at the
#    tip, 0.6 m base flange with four rock bolts, two often missing or sheared. Antenna ring often
#    crushed flat on one side where a Pelican's scoop brushed it."
# ─────────────────────────────────────────────────────────────────────────────────────────────────
def build_claim_mark():
    r = root_for('place_claim_mark')
    # The lean is authored: "many lean 5-12 degrees after a beam kiss or a bad drive."
    lean = math.radians(8.0)
    put(cyl('claim_flange', 0.30, 0.06, (0, 0, 0.03), verts=12), 'furniture_structural_alloy', r)
    # Four bolt seats; TWO are modelled as empty torn holes rather than bolts. The absence is the
    # point — a full set of four reads as new, and almost none of these are new.
    for i, present in enumerate([True, False, True, False]):
        a = i * math.pi / 2
        p = (math.cos(a) * 0.22, math.sin(a) * 0.22, 0.075)
        if present:
            put(cyl(f'claim_bolt_{i}', 0.035, 0.05, p, verts=6), 'furniture_bare_steel', r)
        else:
            # Torn metal: a shallow raised lip where the bolt tore out, offset off-centre.
            put(cyl(f'claim_tear_{i}', 0.055, 0.014, (p[0] * 1.04, p[1] * 0.96, 0.068), verts=8),
                'furniture_scorch', r)
    shaft = put(cyl('claim_shaft', 0.14, 1.8, (0, 0, 0.96), verts=6), 'furniture_painted_shell', r)
    shaft.rotation_euler = (lean, 0, 0)
    tip = math.sin(lean) * 0.9
    cap = put(cyl('claim_tick_capsule', 0.175, 0.9, (0, -tip * 1.9, 2.24), verts=14),
              'furniture_structural_alloy', r)
    cap.rotation_euler = (lean, 0, 0)
    # Antenna ring, CRUSHED FLAT ON ONE SIDE. Modelled as a scaled torus, not a clean one.
    bpy.ops.mesh.primitive_torus_add(major_radius=0.30, minor_radius=0.022,
                                     location=(0, -tip * 2.4, 2.66), major_segments=18,
                                     minor_segments=6)
    ring = bpy.context.active_object
    ring.name = 'claim_antenna_ring_crushed'
    ring.scale = Vector((1.0, 0.52, 1.0))   # the crush
    bpy.ops.object.transform_apply(scale=True)
    put(ring, 'furniture_structural_alloy', r)
    # Claim plate on the LEE side, hung on two bolts, 0.4 x 0.25 m.
    put(box('claim_plate', (0.40, 0.03, 0.25), (0.19, 0.10, 1.35), rot=(0, 0, math.radians(-14))),
        'furniture_identity_plate', r)
    # Caged miner-amber gel lamp, mid-shaft. The cage is BARS, not a tube — review finding 6 called
    # the first pass's smooth cylinder out, and bars are what make a caged lamp read as caged.
    for i, (oy, oz) in enumerate(((0.055, 0), (-0.055, 0), (0, 0.055), (0, -0.055))):
        put(box(f'claim_cage_bar_{i}', (0.14, 0.014, 0.014), (-0.20, 0.02 + oy, 1.10 + oz)),
            'furniture_structural_alloy', r)
    put(cyl('claim_lamp_lens', 0.052, 0.05, (-0.24, 0.02, 1.10), rot=(0, math.pi / 2, 0), verts=8),
        'furniture_signal_lens', r)
    # Paint-marker nozzle at the capsule tip, CAPPED WITH SLAG after the first cut bloom.
    put(cyl('claim_paint_nozzle', 0.038, 0.12, (0, -tip * 2.9, 2.76), rot=(lean, 0, 0), verts=8),
        'furniture_structural_alloy', r)
    put(cyl('claim_nozzle_slag', 0.052, 0.05, (0, -tip * 3.1, 2.84), rot=(lean, 0, 0), verts=6),
        'furniture_scorch', r)
    # Spare gel puck, taped to the flange. Secondary mass off the vertical, which is what stops the
    # whole thing reading as a nail with a bead past ~150 units.
    put(cyl('claim_spare_puck', 0.040, 0.04, (0.26, -0.10, 0.09), rot=(math.pi / 2, 0, 0), verts=8),
        'furniture_signal_lens', r)
    put(box('claim_puck_tape', (0.11, 0.09, 0.01), (0.26, -0.10, 0.13)), 'furniture_painted_shell', r)
    # Faded flag streamer of heat-cloth, hung off the ring with a mid-bend so it is not a flat card.
    st_a = put(box('claim_streamer_a', (0.40, 0.012, 0.12), (0.30, -tip * 2.2, 2.52)),
               'furniture_painted_shell', r)
    st_a.rotation_euler = (0, math.radians(-16), math.radians(9))
    st_b = put(box('claim_streamer_b', (0.36, 0.012, 0.10), (0.62, -tip * 2.0, 2.36)),
               'furniture_painted_shell', r)
    st_b.rotation_euler = (0, math.radians(-38), math.radians(-14))
    # Scarred tether loop for suit handholds.
    bpy.ops.mesh.primitive_torus_add(major_radius=0.13, minor_radius=0.016,
                                     location=(0.13, -0.02, 0.62), rotation=(math.pi / 2, 0, 0),
                                     major_segments=12, minor_segments=5)
    put(bpy.context.active_object, 'furniture_bare_steel', r)
    bpy.context.active_object.name = 'claim_tether_loop'
    return r


# ─────────────────────────────────────────────────────────────────────────────────────────────────
# 2. LANE PIN — Concord corridor marker.
#
# REBUILT after adversarial review. The first attempt was a clean symmetric toothpick, justified as
# "the control that proves the others are damaged on purpose". The review rejected that: the
# fiction's own modeller block specifies damage on this class too — "9 m vertical spine... planted
# in a 1.2 m hexagonal base drum... at 4 m and 7.5 m: two vane fins... with a third vane that is
# often not a fin at all: a flat unpainted repair plate... upper vane twisted 30 degrees;
# speed-band middle lamp empty socket; annex plate half-sheared."
#
# Concord SERVICES its marks; it does not replace them. A serviced object is one that visibly has
# been repaired, which is a different and more interesting read than one that is factory-new.
# ─────────────────────────────────────────────────────────────────────────────────────────────────
def build_lane_pin():
    r = root_for('place_lane_pin')
    # Hexagonal ballast drum, 1.2 m across flats, 0.8 m deep.
    put(cyl('pin_ballast_drum', 0.60, 0.80, (0, 0, 0.40), verts=6), 'furniture_structural_alloy', r)
    put(cyl('pin_mast', 0.11, 9.0, (0, 0, 4.80), verts=10), 'furniture_painted_shell', r)
    # Vanes at TWO stations, 4.0 m and 7.5 m. At each station the third position is a bare
    # unpainted repair plate rather than a fin — Concord fixes what it can reach.
    for station, (z, twist) in enumerate(((4.0, 0.0), (7.5, math.radians(30)))):
        for i in range(3):
            a = i * (2 * math.pi / 3)
            is_repair = (i == 2)
            v = box(f'pin_vane_{station}_{i}', (1.60, 0.05, 0.40),
                    (math.cos(a) * 0.90, math.sin(a) * 0.90, z), rot=(0, 0, a))
            put(v, 'furniture_bare_steel' if is_repair else 'furniture_structural_alloy', r)
            # The upper station's first vane is twisted 30 degrees — a strike nobody straightened.
            if station == 1 and i == 0:
                v.rotation_euler = (twist, 0, a)
    # Pass-side chevron housing: tells you which side to go by, and it is one-sided by definition.
    put(box('pin_chevron_housing', (0.50, 0.15, 0.35), (0.42, 0, 5.60)), 'furniture_painted_shell', r)
    put(box('pin_chevron_lens', (0.34, 0.04, 0.22), (0.62, 0, 5.60)), 'furniture_signal_lens', r)
    # Speed band: three sockets stacked. The MIDDLE one is an empty hole, not a lamp.
    for i, z in enumerate((8.30, 8.56, 8.82)):
        if i == 1:
            put(cyl('pin_speed_socket_empty', 0.062, 0.10, (0, 0, z), verts=8), 'furniture_scorch', r)
        else:
            put(cyl(f'pin_speed_lamp_{i}', 0.070, 0.12, (0, 0, z), verts=10),
                'furniture_signal_lens', r)
    put(cyl('pin_cap', 0.15, 0.10, (0, 0, 9.05), verts=10), 'furniture_structural_alloy', r)
    # Ref 44-C annex plate on the drum, HALF-SHEARED — modelled as a short plate, not a full one.
    put(box('pin_annex_plate_sheared', (0.16, 0.03, 0.20), (0.30, 0.55, 0.52)),
        'furniture_identity_plate', r)
    return r


# ─────────────────────────────────────────────────────────────────────────────────────────────────
# 3. TALLY POST — Meridian weigh-point.
#
# REBUILT after adversarial review. The first attempt was a fly-through gantry; the fiction
# specifies a TOWER ON A DECK WITH A BOOM: "a 6 m tower on a 3 m square platform deck... primary
# vertical is a 1.1 m diameter hexagonal drum... a boom arm 3.2 m long with a mass-sensor yoke
# (two pads like blunt tongs)... yoke pad one side worn concave, the other replaced with a flat
# unpainted plate... boom droops 8 degrees... deck corner crumpled."
#
# That is a completely different silhouette, and it is a better one: a one-sided boom reads as a
# machine reaching for something, where a symmetric gate reads as architecture.
# ─────────────────────────────────────────────────────────────────────────────────────────────────
def build_tally_post():
    r = root_for('place_tally_post')
    # 3 m square deck, 0.25 m thick, with cut voids so it reads as grating rather than a slab.
    put(box('tally_deck', (3.0, 3.0, 0.25), (0, 0, 0.125)), 'furniture_structural_alloy', r)
    for i in range(4):
        put(box(f'tally_grate_{i}', (2.6, 0.12, 0.28), (0, -0.9 + i * 0.6, 0.14)),
            'furniture_scorch', r)
    # ONE crumpled deck corner. Directional damage: a lower, tilted wedge on a single corner.
    c = put(box('tally_deck_crumple', (0.85, 0.85, 0.14), (1.16, -1.16, 0.06)),
            'furniture_bare_steel', r)
    c.rotation_euler = (math.radians(-11), math.radians(9), 0)
    # Hexagonal scale house, 1.1 m across, 4 m tall.
    put(cyl('tally_scale_house', 0.55, 4.0, (0, 0, 2.25), verts=6), 'furniture_painted_shell', r)
    # The boom: 3.2 m, one side only, drooping 8 degrees. This is the whole silhouette.
    droop = math.radians(-8.0)
    boom = put(box('tally_boom', (3.2, 0.18, 0.22), (1.72, 0, 3.50)), 'furniture_structural_alloy', r)
    boom.rotation_euler = (0, droop, 0)
    tip_x = 3.28
    tip_z = 3.50 + math.sin(droop) * 1.6
    # Yoke: two pads like blunt tongs. Pad A is WORN CONCAVE, pad B is a flat unpainted
    # replacement plate — mismatched, because one of them has been changed and the other has not.
    put(box('tally_yoke_pad_worn', (0.35, 0.25, 0.12), (tip_x, 0.30, tip_z)),
        'furniture_painted_shell', r)
    put(cyl('tally_yoke_wear_cup', 0.11, 0.06, (tip_x, 0.30, tip_z + 0.07), verts=10),
        'furniture_scorch', r)
    put(box('tally_yoke_pad_replacement', (0.35, 0.25, 0.02), (tip_x, -0.30, tip_z)),
        'furniture_bare_steel', r)
    # Thermal hood over the house crown, and the gold invoice pulse on the mast.
    put(cyl('tally_thermal_hood', 0.66, 0.18, (0, 0, 4.34), verts=6), 'furniture_structural_alloy', r)
    put(cyl('tally_mast', 0.07, 1.5, (0, 0, 5.10), verts=8), 'furniture_structural_alloy', r)
    put(cyl('tally_invoice_lamp', 0.12, 0.14, (0, 0, 5.92), verts=10), 'furniture_signal_lens', r)
    put(box('tally_ledger_plate', (0.46, 0.03, 0.30), (0, 0.58, 2.40)), 'furniture_identity_plate', r)
    # Tag chain hanging off the boom root — the soft, swinging thing every real gantry has.
    for i in range(3):
        put(cyl(f'tally_tag_link_{i}', 0.030, 0.16, (0.62, 0.0, 3.30 - i * 0.15),
                rot=(math.radians(90 if i % 2 else 0), 0, 0), verts=6), 'furniture_bare_steel', r)
    return r


# ─────────────────────────────────────────────────────────────────────────────────────────────────
# 4. WHISTLE — Free Frontier distress relay.
#
# REBUILT after adversarial review round 1, finding 4: the first pass was "a tank with sticks" and
# carried the WRONG DAMAGE IDENTITY — a tilted drum and three straight aerials, when the fiction
# specifies "a 2.2 m scavenged fuel drum (1 m diameter) clamped with cargo straps and three unequal
# chains... a 0.7 m jury mast of welded rebar and a lamp cluster in a shopping basket of wire...
# a wide-band antenna bent from a survey paddle... antenna S-curved... one chain replaced with
# polymer line; drum lid warped and held with a clamp."
#
# The distinction matters: asymmetry alone is noise. Asymmetry that names WHICH part failed and what
# it was replaced with is character, and it is what makes two Free Frontier relays differ.
# ─────────────────────────────────────────────────────────────────────────────────────────────────
def build_whistle():
    r = root_for('place_whistle')
    # Scavenged fuel drum, 1.0 m diameter x 2.2 m, upright. The drum is honest; everything on it
    # is not.
    put(cyl('whistle_drum', 0.50, 2.20, (0, 0, 1.20), verts=14), 'furniture_bare_steel', r)
    # Warped lid, held down with a clamp because it no longer seats.
    lid = put(cyl('whistle_lid_warped', 0.52, 0.06, (0, 0, 2.33), verts=14),
              'furniture_structural_alloy', r)
    lid.rotation_euler = (math.radians(7), math.radians(-4), 0)
    put(box('whistle_lid_clamp', (0.16, 0.44, 0.05), (0.28, 0, 2.38)), 'furniture_bare_steel', r)
    # Two cargo straps.
    for i, z in enumerate((0.72, 1.66)):
        put(cyl(f'whistle_strap_{i}', 0.53, 0.07, (0, 0, z), verts=14), 'furniture_painted_shell', r)
    # THREE UNEQUAL CHAINS — 0.9 / 1.3 / 1.1 m. The third is polymer line: thinner, and a different
    # material, because somebody ran out of chain.
    for i, (yaw, ln, rad, role) in enumerate((
        (0.5, 0.90, 0.030, 'furniture_bare_steel'),
        (2.6, 1.30, 0.030, 'furniture_bare_steel'),
        (4.6, 1.10, 0.018, 'furniture_painted_shell'),   # the polymer swap
    )):
        links = 4
        for k in range(links):
            t = (k + 0.5) / links
            put(cyl(f'whistle_chain_{i}_{k}', rad, ln / links,
                    (math.cos(yaw) * (0.54 + t * 0.10), math.sin(yaw) * (0.54 + t * 0.10),
                     0.30 + (1 - t) * 0.9),
                    rot=(math.radians(74), 0, yaw + (0.35 if k % 2 else 0)), verts=4), role, r)
    # A boot, hanging off the longest chain. Nobody knows whose.
    put(box('whistle_boot', (0.28, 0.12, 0.12),
            (math.cos(2.6) * 0.66, math.sin(2.6) * 0.66, 0.24)), 'furniture_painted_shell', r)
    # Jury mast: 0.7 m of welded rebar, three rods that do not agree with each other.
    for i, (dx_, dy_, tilt) in enumerate(((0.0, 0.0, 0.0), (0.06, 0.03, 0.16), (-0.05, 0.05, -0.11))):
        rod = put(cyl(f'whistle_rebar_{i}', 0.018, 0.70, (dx_, dy_, 2.72), verts=4),
                  'furniture_bare_steel', r)
        rod.rotation_euler = (tilt, tilt * 0.6, 0)
    # Lamp cluster in a basket of wire — an open frame, not a housing. Three lamp blobs inside it.
    for i, (ox, oy) in enumerate(((0.17, 0), (-0.17, 0), (0, 0.17), (0, -0.17))):
        put(box(f'whistle_basket_bar_{i}', (0.03, 0.03, 0.30), (ox, oy, 3.18)),
            'furniture_bare_steel', r)
    for i, (ox, oy, oz) in enumerate(((0.05, 0.03, 3.14), (-0.06, -0.02, 3.20), (0.01, -0.06, 3.10))):
        put(cyl(f'whistle_lamp_{i}', 0.062, 0.09, (ox, oy, oz), verts=8), 'furniture_signal_lens', r)
    # Wide-band antenna BENT FROM A SURVEY PADDLE, S-curved: three segments that reverse direction.
    put(box('whistle_paddle_root', (0.45, 0.08, 0.02), (0.30, 0.10, 2.50),
            rot=(0, math.radians(18), math.radians(22))), 'furniture_structural_alloy', r)
    seg = ((0.58, 0.16, 2.66, 0.34), (0.78, 0.30, 2.92, -0.42), (0.88, 0.14, 3.16, 0.28))
    for i, (sx, sy, sz, bend) in enumerate(seg):
        a = put(cyl(f'whistle_antenna_s_{i}', 0.016, 0.42, (sx, sy, sz), verts=4),
                'furniture_structural_alloy', r)
        a.rotation_euler = (bend, math.radians(24), 0)
    # Hand crank on the drum flank — the thing a survivor actually turns.
    put(cyl('whistle_crank_hub', 0.07, 0.10, (-0.52, 0, 1.20), rot=(0, math.pi / 2, 0), verts=8),
        'furniture_structural_alloy', r)
    put(box('whistle_crank_arm', (0.05, 0.26, 0.04), (-0.60, 0.12, 1.20)), 'furniture_bare_steel', r)
    put(box('whistle_plaque', (0.30, 0.02, 0.16), (0, -0.51, 1.60)), 'furniture_identity_plate', r)
    # Scorch collar where it was welded to a rock in a hurry.
    put(cyl('whistle_weld_collar', 0.60, 0.09, (0, 0, 0.06), verts=14), 'furniture_scorch', r)
    return r


# ─────────────────────────────────────────────────────────────────────────────────────────────────
# 5. COLD LOCKER — unmanned bonded cache.
#
# REBUILT after adversarial review. The first attempt was a box fridge; the fiction specifies a
# "4 m hexagonal drum (face-to-face 1.8 m) mounted on a 9 m spine of lattice truss... drum at
# mid-spine so the mass hangs like a tick on a wire... one lattice bay crushed inward... outrigger
# leg sheared and cabled... one petal bent."
#
# The long lattice spine with an off-centre mass is a far stronger distance read than a cube: it is
# mostly negative space, and negative space is a silhouette channel a box simply does not have.
# ─────────────────────────────────────────────────────────────────────────────────────────────────
def build_cold_locker():
    r = root_for('place_cold_locker')
    SPINE = 9.0
    BAY = 0.5
    bays = int(SPINE / BAY)
    put(cyl('locker_root_clamp', 0.34, 0.42, (0, 0, 0.21), verts=8), 'furniture_bare_steel', r)
    # Lattice truss: two rails plus alternating diagonals. ONE mid bay is crushed inward.
    crushed = bays // 2 + 1
    for side in (-1, 1):
        put(cyl(f'locker_rail_{side}', 0.045, SPINE, (side * 0.22, 0, SPINE * 0.5 + 0.4), verts=6),
            'furniture_structural_alloy', r)
    # Rungs, not diagonals. The first attempt rotated each brace about Y after parenting and the
    # bays scattered across an 11 m spread on a 9 m spine — visible immediately in the render as two
    # diverging dashed lines. A horizontal rung between the rails cannot do that, still reads as a
    # truss at distance, and leaves the crushed bay legible as the one rung that does not span.
    for i in range(bays):
        z = 0.55 + i * BAY
        span = 0.30 if i == crushed else 0.44
        put(box(f'locker_rung_{i}', (span, 0.045, 0.045), (0, 0, z)),
            'furniture_bare_steel' if i == crushed else 'furniture_structural_alloy', r)
    # The drum: hexagonal, 1.8 m across flats, hung at MID-spine so the mass is off-centre.
    put(cyl('locker_drum', 0.90, 2.05, (0, 0, SPINE * 0.5 + 0.4), verts=6),
        'furniture_painted_shell', r)
    # Hatch face with THREE dogs — one of them a welded scrap bar rather than a proper lever.
    put(cyl('locker_hatch', 0.62, 0.10, (0, -0.92, SPINE * 0.5 + 0.4), rot=(math.pi / 2, 0, 0),
            verts=10), 'furniture_structural_alloy', r)
    for i, a in enumerate((0.6, 2.7, 4.7)):
        role = 'furniture_bare_steel' if i == 2 else 'furniture_structural_alloy'
        size = (0.36, 0.06, 0.06) if i == 2 else (0.26, 0.05, 0.05)
        dg = put(box(f'locker_dog_{i}', size,
                     (math.cos(a) * 0.42, -0.99, SPINE * 0.5 + 0.4 + math.sin(a) * 0.42)),
                 role, r)
        dg.rotation_euler = (0, 0, a if i != 2 else a + 0.5)
    # Bond lamp ring around the hatch — the bit a pilot actually reads.
    bpy.ops.mesh.primitive_torus_add(major_radius=0.72, minor_radius=0.035,
                                     location=(0, -0.95, SPINE * 0.5 + 0.4),
                                     rotation=(math.pi / 2, 0, 0),
                                     major_segments=14, minor_segments=5)
    ring = bpy.context.active_object
    ring.name = 'locker_bond_ring'
    put(ring, 'furniture_signal_lens', r)
    put(box('locker_manifest_plate', (0.42, 0.03, 0.26), (0.55, -0.95, SPINE * 0.5 - 0.35)),
        'furniture_identity_plate', r)
    # Two outriggers off the root — leg B is SHORTER and its tip is cabled back.
    #
    # Placed by explicit endpoint rather than by stacking Euler rotations. The first attempt
    # composed an X-tilt with a Z-yaw and the legs swung out to an 11.2 m envelope on a body whose
    # spine is 9 m — which then drove the review camera's framing radius and made the whole asset
    # render as a speck. Compute where the strut should END and aim it there.
    for i, (yaw, ln, out, up) in enumerate(((0.8, 1.55, 1.05, 0.62), (3.6, 1.05, 0.72, 0.44))):
        ex = math.cos(yaw) * out
        ey = math.sin(yaw) * out
        leg = put(cyl(f'locker_outrigger_{i}', 0.055, ln, (ex * 0.5, ey * 0.5, 0.20 + up * 0.5),
                      verts=6), 'furniture_structural_alloy', r)
        leg.rotation_euler = Vector((ex, ey, up)).to_track_quat('Z', 'Y').to_euler()
    # Leg B's tip is cabled back to the spine — the shear was never properly repaired.
    bx, by = math.cos(3.6) * 0.72, math.sin(3.6) * 0.72
    for k in range(3):
        t = (k + 0.5) / 3.0
        put(cyl(f'locker_cable_{k}', 0.016, 0.30,
                (bx * (1 - t), by * (1 - t), 0.64 + t * 0.9),
                rot=(math.radians(58), 0, 3.6), verts=4), 'furniture_bare_steel', r)
    # Solar / trickle petals on the drum crown. ONE is bent.
    for i, a in enumerate((0.0, 2.09, 4.19)):
        pet = put(box(f'locker_petal_{i}', (0.40, 0.15, 0.02),
                      (math.cos(a) * 0.78, math.sin(a) * 0.78, SPINE * 0.5 + 1.52)),
                  'furniture_structural_alloy', r)
        pet.rotation_euler = (math.radians(25) if i == 1 else 0, 0, a)
    return r


# ─────────────────────────────────────────────────────────────────────────────────────────────────
# 6. ASH PIN — a memorial where a hull died.
#
# REBUILT after adversarial review round 1, finding 5: the first pass was a tidy plaque-on-slab and
# the review named it "wrong damage language". The fiction says "a 3.5 m slender pin — often a cut
# spar... spar leaned by the explosion... plate half-melted on one corner; lamp cage empty more
# often than not; ballast chain one link wrong alloy."
#
# The lean is the whole read. A memorial that stands straight has been maintained, and the entry's
# closing line is that nobody maintains these.
# ─────────────────────────────────────────────────────────────────────────────────────────────────
def build_ash_pin():
    r = root_for('place_ash_pin')
    LEAN = math.radians(13.0)          # "leaned by the explosion", never straightened
    # Poured base, 1 m across.
    put(cyl('ash_base', 0.50, 0.26, (0, 0, 0.13), verts=10), 'furniture_structural_alloy', r)
    # A cut spar, 3.5 m, slender. It is a piece of the dead hull, not a monument someone ordered.
    spar = put(cyl('ash_spar', 0.07, 3.50, (0, 0, 1.95), verts=8), 'furniture_bare_steel', r)
    spar.rotation_euler = (LEAN, 0, 0)
    # The cut end is ragged: a short offset stub where the torch wandered.
    stub = put(box('ash_spar_cut_end', (0.11, 0.09, 0.22),
                   (0.03, -math.sin(LEAN) * 1.75 - 0.05, 3.62)), 'furniture_bare_steel', r)
    stub.rotation_euler = (LEAN + 0.22, 0, math.radians(11))
    # Name plate, 0.5 x 0.3 m, bolted mid-spar — the only cared-for surface on the whole object.
    plate_y = -math.sin(LEAN) * 0.55
    put(box('ash_name_plate', (0.50, 0.03, 0.30), (0, plate_y - 0.09, 1.72)),
        'furniture_identity_plate', r)
    # ONE CORNER HALF-MELTED. Modelled as a small canted wedge eating into the plate corner, so the
    # silhouette of the plate is no longer a clean rectangle.
    melt = put(box('ash_plate_melt_corner', (0.14, 0.04, 0.14), (0.20, plate_y - 0.10, 1.85)),
               'furniture_scorch', r)
    melt.rotation_euler = (0, 0, math.radians(38))
    # Lamp cage — EMPTY. Four thin bars and no lens. The absence is the signal: the pin does not
    # advertise, it remembers, and nobody has replaced the cell in years.
    cage_y = -math.sin(LEAN) * 1.15
    for i, (ox, oy) in enumerate(((0.055, 0), (-0.055, 0), (0, 0.055), (0, -0.055))):
        put(box(f'ash_cage_bar_{i}', (0.016, 0.016, 0.20), (ox, cage_y + oy, 2.62)),
            'furniture_structural_alloy', r)
    put(cyl('ash_cage_ring', 0.075, 0.018, (0, cage_y, 2.72), verts=8),
        'furniture_structural_alloy', r)
    # Ballast chain from the foot. ONE LINK IS THE WRONG ALLOY — thicker, and a different material.
    for k in range(5):
        wrong = (k == 2)
        put(cyl(f'ash_ballast_link_{k}', 0.030 if wrong else 0.022, 0.15,
                (0.30 + k * 0.09, 0.16 - k * 0.05, 0.16),
                rot=(math.radians(90 if k % 2 else 0), 0, math.radians(24)), verts=5),
            'furniture_bare_steel' if wrong else 'furniture_structural_alloy', r)
    # Tokens left by passing crews, at the foot, at three angles.
    for i, (x, y, sz, a) in enumerate(((0.22, 0.20, 0.11, 0.4), (-0.28, 0.11, 0.08, 1.9),
                                       (0.05, -0.26, 0.09, 3.1))):
        t = put(box(f'ash_token_{i}', (sz, sz, sz * 0.35), (x, y, 0.30)),
                'furniture_painted_shell', r)
        t.rotation_euler = (0, 0, a)
    return r


BUILDERS = {
    'place_claim_mark': build_claim_mark,
    'place_lane_pin': build_lane_pin,
    'place_tally_post': build_tally_post,
    'place_whistle': build_whistle,
    'place_cold_locker': build_cold_locker,
    'place_ash_pin': build_ash_pin,
}


def export_glb(root, path):
    path.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.object.select_all(action='DESELECT')
    root.select_set(True)
    for child in root.children_recursive:
        child.select_set(True)
    bpy.context.view_layer.objects.active = root
    bpy.ops.export_scene.gltf(
        filepath=str(path), export_format='GLB', use_selection=True,
        export_apply=True, export_yup=True,
    )
    return hashlib.sha256(path.read_bytes()).hexdigest()


def tri_count(root):
    total = 0
    for o in [root] + list(root.children_recursive):
        if o.type != 'MESH':
            continue
        total += sum(max(0, len(p.vertices) - 2) for p in o.data.polygons)
    return total


def setup_render(target, radius):
    bpy.ops.object.camera_add(location=(radius * 1.55, -radius * 1.9, radius * 1.15))
    cam = bpy.context.active_object
    cam.data.lens = 62
    direction = Vector(target) - cam.location
    cam.rotation_euler = direction.to_track_quat('-Z', 'Y').to_euler()
    bpy.context.scene.camera = cam
    # Warm key / cool fill, matching the game's authored lighting doctrine so the review is judging
    # the geometry rather than a lighting mismatch.
    bpy.ops.object.light_add(type='AREA', location=(radius * 2.2, -radius * 1.4, radius * 2.4))
    key = bpy.context.active_object
    key.data.energy = 900 * max(1.0, radius)
    key.data.size = radius * 2.5
    key.data.color = (1.0, 0.86, 0.68)
    bpy.ops.object.light_add(type='AREA', location=(-radius * 2.0, radius * 1.6, radius * 0.9))
    fill = bpy.context.active_object
    fill.data.energy = 260 * max(1.0, radius)
    fill.data.size = radius * 3.0
    fill.data.color = (0.55, 0.68, 1.0)
    scene = bpy.context.scene
    scene.render.engine = 'BLENDER_EEVEE'
    scene.render.resolution_x = 900
    scene.render.resolution_y = 900
    scene.render.film_transparent = False
    scene.world = bpy.data.worlds.new('w')
    scene.world.use_nodes = True
    scene.world.node_tree.nodes['Background'].inputs[0].default_value = (0.02, 0.022, 0.03, 1)


def main():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    ap = argparse.ArgumentParser()
    ap.add_argument('--render', action='store_true')
    args = ap.parse_args(argv)

    report = {'schema': 'spaceface.laneFurniture.v1', 'assets': []}
    for name, builder in BUILDERS.items():
        reset_scene()
        root = builder()
        bpy.context.view_layer.update()
        # Envelope from the actual built geometry, not from the authored intent — if a dimension
        # drifts from the fiction, the number here is what says so.
        pts = []
        for o in root.children_recursive:
            if o.type != 'MESH':
                continue
            for c in o.bound_box:
                pts.append(o.matrix_world @ Vector(c))
        if pts:
            lo = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
            hi = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
            size = hi - lo
        else:
            lo = hi = size = Vector((0, 0, 0))
        tris = tri_count(root)
        glb = OUT_SOURCE / f'{name}.glb'
        digest = export_glb(root, glb)
        entry = {
            'id': name,
            'triangles': tris,
            'sizeM': [round(size.x, 3), round(size.y, 3), round(size.z, 3)],
            'parts': len([o for o in root.children_recursive if o.type == 'MESH']),
            'bytes': glb.stat().st_size,
            'sha256': digest,
        }
        if args.render:
            setup_render((0, 0, size.z * 0.45), max(1.2, max(size.x, size.y, size.z)))
            OUT_EVIDENCE.mkdir(parents=True, exist_ok=True)
            shot = OUT_EVIDENCE / f'{name}.png'
            bpy.context.scene.render.filepath = str(shot)
            bpy.ops.render.render(write_still=True)
            entry['render'] = str(shot.relative_to(ROOT)).replace('\\', '/')
        report['assets'].append(entry)
        log(f"{name}: {tris} tris, {entry['parts']} parts, "
            f"{entry['sizeM'][0]}x{entry['sizeM'][1]}x{entry['sizeM'][2]} m")

    OUT_EVIDENCE.mkdir(parents=True, exist_ok=True)
    (OUT_EVIDENCE / 'build-report.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
    log(f"wrote {len(report['assets'])} source GLBs to {OUT_SOURCE.relative_to(ROOT)}")


if __name__ == '__main__':
    main()

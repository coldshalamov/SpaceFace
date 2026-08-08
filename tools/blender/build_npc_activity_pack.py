#!/usr/bin/env python3
"""Author the occupational-craft families described in design/fiction/THE_WORKING_FLEET.md.

A miner, courier, hauler, patrol ship, salvage vessel and repair craft should be identifiable
from what they look like and what they are visibly doing before the HUD says what they are.
This tool builds that vocabulary: ~12 visually distinct working-craft families, each carrying
its trade on its hull — not in its paint.

SOURCE ONLY. This writes GLBs under assets/incubator/npc_activity_pack/source/ and renders
evidence sheets under assets/incubator/npc_activity_pack/evidence/. It publishes no release
artifact, touches no manifest, and wires nothing into runtime; promotion belongs to whoever
holds those exact paths later.

GEOMETRY DETERMINISM. Every dimension, boom angle, patch plate and missing panel below is
AUTHORED, not sampled. There is no RNG anywhere in this file. That makes the authored
geometry deterministic, but it does not by itself prove byte-identical GLBs: Blender and
its glTF exporter are also inputs. The report records the builder hash, Blender version,
exporter generator string and canonical full-build command; promotion must still verify
two full builds under the same pinned toolchain. Per-craft variation comes from authored
per-variant specs, never from noise.

WHY EQUIPMENT IS MODELLED RATHER THAN TEXTURED. The R1 camera (design/graphics-sprints/
CAMERA_VISIBLE_BUBBLE.md, 2026-08-08 revision) shows a working craft at 95-165 world units
in ordinary play, where a 28 m hull spans roughly 9-15% of frame width. At that projection,
surface detail is gone and SILHOUETTE is the only channel left. So a tanker is a row of
formed pressure vessels, a tug is two oversized engines on a spine frame, a surveyor is a
small hull lost among its own booms — masses and asymmetry, not decals.

Usage:
    blender --background --python tools/blender/build_npc_activity_pack.py -- --render
    blender --background --python tools/blender/build_npc_activity_pack.py -- --render --distances
    blender --background --python tools/blender/build_npc_activity_pack.py -- --render --gallery
    # Refused safely: partial builds cannot publish the canonical shared report.
    blender --background --python tools/blender/build_npc_activity_pack.py -- --only prospector_skiff
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
OUT_SOURCE = ROOT / 'assets' / 'incubator' / 'npc_activity_pack' / 'source'
OUT_EVIDENCE = ROOT / 'assets' / 'incubator' / 'npc_activity_pack' / 'evidence'

# Authored at true metres; 1 world unit = 1 m against the 28 m player-hull reference used by
# CAMERA_VISIBLE_BUBBLE.md. Working craft are sized relative to that hull: a skiff well under
# it, a barge/tanker several times it. No family scale multiplier — ships are already at the
# scale the camera was measured against, unlike the matchstick-sized lane furniture.
#
# Axis convention: the runtime contract (src/render/visualFactory.js header) is that a ship
# visual's +X axis is the NOSE — the renderer sets mesh.rotation.y = -entity.rot. glTF yup
# export maps Blender +X to three.js +X, so everything here is authored with +X forward,
# Blender +Z (three.js +Y) up, and +Y (three.js -Z) to PORT. The integration manifest
# records this so a wiring lane inherits, not rediscovers, it.

# ---------------------------------------------------------------------------
# Material roles.
#
# Named the way the rest of the pipeline names roles (one Principled BSDF per role, role name
# is the material name) so a later KTX2/ORM promotion has a stable mapping. Colors follow the
# art direction of the brief: industrial but not muddy — read hulls in mid-value paint with
# role-coded accent and hazard colors, not charcoal boxes with cyan strips.
#
# (r, g, b, roughness, metallic)
ROLES = {
    # structure
    'npcwork_hull_paint_ochre':   (0.58, 0.42, 0.18, 0.55, 0.20),  # mining/industrial working paint
    'npcwork_hull_paint_teal':    (0.16, 0.44, 0.46, 0.52, 0.20),  # logistics/courier fleet paint
    'npcwork_hull_paint_rust':    (0.46, 0.24, 0.14, 0.62, 0.25),  # salvage / worn independents
    'npcwork_hull_paint_bone':    (0.78, 0.74, 0.66, 0.48, 0.10),  # civilian / passenger / medical
    'npcwork_hull_paint_navyarc': (0.20, 0.26, 0.44, 0.45, 0.30),  # customs / authority (arc-blue)
    # Metallic values are deliberately moderate: these flat source materials have no
    # environment to reflect in the review rig (and none in deep space either), and
    # high metallic under a black world reads as tar. Round-1 renders proved it.
    'npcwork_structural_alloy':   (0.42, 0.43, 0.46, 0.50, 0.45),  # trusses, frames, booms
    'npcwork_bare_steel':         (0.62, 0.63, 0.65, 0.35, 0.50),  # unpainted replacement plates
    'npcwork_armor_plate':        (0.36, 0.38, 0.41, 0.60, 0.40),  # rugged mining/impact armor
    'npcwork_tank_shell':         (0.82, 0.80, 0.75, 0.30, 0.30),  # formed pressure vessels
    'npcwork_tank_insulation':    (0.85, 0.55, 0.20, 0.70, 0.05),  # insulated pipe wrap, amber
    'npcwork_scorch':             (0.10, 0.09, 0.08, 0.80, 0.20),  # torch scars, engine soot
    'npcwork_ore_raw':            (0.42, 0.34, 0.22, 0.90, 0.05),  # loaded ore, proud of the rim
    'npcwork_glass_canopy':       (0.12, 0.16, 0.20, 0.10, 0.20),  # crew glazing
    # hazard + identity
    'npcwork_hazard_stripe':      (0.85, 0.62, 0.10, 0.55, 0.10),  # amber industrial hazard
    'npcwork_hazard_volatile':    (0.72, 0.16, 0.10, 0.50, 0.10),  # red volatile-cargo hazard
    'npcwork_id_plate':           (0.88, 0.86, 0.80, 0.45, 0.10),  # registry / name plates
    # emissive work vocabulary (per-role light color IS the role code — see fiction doc)
    'npcwork_light_flood':        (1.00, 0.94, 0.80, 0.30, 0.00),  # white-warm work floods
    'npcwork_light_mining':       (1.00, 0.60, 0.16, 0.30, 0.00),  # amber cutting/drill lights
    'npcwork_light_repair':       (0.62, 0.85, 1.00, 0.30, 0.00),  # blue-white service lights
    'npcwork_light_survey':       (0.35, 1.00, 0.55, 0.30, 0.00),  # green scan emitters
    'npcwork_light_salvage':      (1.00, 0.42, 0.12, 0.30, 0.00),  # orange cutter glow
    'npcwork_light_authority':    (0.30, 0.55, 1.00, 0.30, 0.00),  # customs inspection blue
    'npcwork_light_distress':     (1.00, 0.20, 0.12, 0.30, 0.00),  # rescue / emergency red
    'npcwork_light_nav_green':    (0.20, 1.00, 0.35, 0.30, 0.00),
    'npcwork_light_nav_red':      (1.00, 0.25, 0.20, 0.30, 0.00),
    'npcwork_engine_glow':        (0.55, 0.75, 1.00, 0.30, 0.00),  # drive signature
    'npcwork_light_cabin':        (1.00, 0.88, 0.70, 0.30, 0.00),  # liner window rows
}

# Strengths tuned by looking at round-1 renders: above ~3 the tone mapper whites out
# the color and every trade light reads identical — the exact failure the color code
# exists to prevent. Floods are ALLOWED to blow out; they are the only white-by-design.
EMISSIVE_STRENGTH = {
    'npcwork_light_flood': 4.2,
    'npcwork_light_mining': 2.9,
    'npcwork_light_repair': 2.6,
    'npcwork_light_survey': 2.4,
    'npcwork_light_salvage': 2.8,
    'npcwork_light_authority': 2.3,
    'npcwork_light_distress': 2.6,
    'npcwork_light_nav_green': 2.0,
    'npcwork_light_nav_red': 2.0,
    'npcwork_engine_glow': 2.6,
    'npcwork_light_cabin': 1.8,
}


def log(msg):
    print(f'[npc-activity-pack] {msg}', flush=True)


def reset_scene():
    if not bpy.app.background:
        raise SystemExit('npc activity pack authoring requires Blender --background')

    # Never replace an automation host's preferences or startup state. Remove only
    # scene-owned data from this background authoring process.
    for obj in tuple(bpy.data.objects):
        bpy.data.objects.remove(obj, do_unlink=True)
    for datablocks in (bpy.data.meshes, bpy.data.curves, bpy.data.cameras, bpy.data.lights):
        for block in tuple(datablocks):
            if block.users == 0:
                datablocks.remove(block)


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


def put(obj, role, parent=None):
    obj.data.materials.clear()
    obj.data.materials.append(material(role))
    if parent is not None:
        obj.parent = parent
    return obj


# ---------------------------------------------------------------------------
# Primitive helpers. All dimensions in metres; locations in the craft's local frame
# (+X nose, +Z dorsal, +Y port).

def box(name, size, loc, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=loc, rotation=rot)
    o = bpy.context.active_object
    o.name = name
    o.scale = Vector(size)
    bpy.ops.object.transform_apply(scale=True)
    return o


def cyl(name, radius, depth, loc, rot=(0, 0, 0), verts=16):
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=radius, depth=depth,
                                        location=loc, rotation=rot)
    o = bpy.context.active_object
    o.name = name
    return o


def sphere(name, radius, loc, seg=16, rings=8):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=seg, ring_count=rings, radius=radius,
                                         location=loc)
    o = bpy.context.active_object
    o.name = name
    return o


def cone(name, r1, r2, depth, loc, rot=(0, 0, 0), verts=16):
    bpy.ops.mesh.primitive_cone_add(vertices=verts, radius1=r1, radius2=r2, depth=depth,
                                    location=loc, rotation=rot)
    o = bpy.context.active_object
    o.name = name
    return o


def beam(name, a, b, radius, verts=6):
    """A structural member that physically SPANS from a to b (learned from lane furniture:
    place-and-rotate drifts under compound rotations; span math cannot)."""
    a = Vector(a)
    b = Vector(b)
    mid = (a + b) * 0.5
    d = b - a
    length = d.length
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=radius, depth=length,
                                        location=mid)
    o = bpy.context.active_object
    o.name = name
    o.rotation_mode = 'QUATERNION'
    o.rotation_quaternion = d.to_track_quat('Z', 'Y')
    return o


def socket(name, loc, parent, rot=(0, 0, 0)):
    """Named empty a wiring lane can attach VFX/props to. Exported into the GLB."""
    bpy.ops.object.empty_add(type='PLAIN_AXES', radius=0.5, location=loc, rotation=rot)
    o = bpy.context.active_object
    o.name = name
    o.parent = parent
    return o


def root_of(craft_id):
    bpy.ops.object.empty_add(type='PLAIN_AXES', radius=0.1, location=(0, 0, 0))
    o = bpy.context.active_object
    o.name = craft_id
    return o


# ---------------------------------------------------------------------------
# Shared assemblies — the vocabulary pieces several trades share, so the fleet reads as one
# universe: common engine blocks, cockpit pods, container footprint, light fixtures.

def engine_block(parent, name, loc, radius, length, glow_role='npcwork_engine_glow'):
    """A drive: shroud cylinder along the flight axis + recessed glow disc at the stern
    face (-X). Strong engine signatures are part of the pack's art direction — a tug IS
    its engines, a passenger liner hides them."""
    shroud = put(cyl(f'{name}_shroud', radius, length, loc, rot=(0, math.pi / 2, 0), verts=18),
                 'npcwork_structural_alloy', parent)
    glow = put(cyl(f'{name}_glow', radius * 0.78, length * 0.08,
                   (loc[0] - length * 0.5, loc[1], loc[2]),
                   rot=(0, math.pi / 2, 0), verts=18), glow_role, parent)
    return shroud, glow


def cockpit_pod(parent, name, loc, l, w, h, role='npcwork_hull_paint_bone'):
    """Crew section: painted pod + canopy strip toward the nose. Small on working craft
    by doctrine — the trade hardware is the protagonist, the crew cab is an afterthought
    bolted where it fits."""
    pod = put(box(f'{name}_pod', (l, w, h), loc), role, parent)
    put(box(f'{name}_canopy', (l * 0.30, w * 0.72, h * 0.42),
            (loc[0] + l * 0.36, loc[1], loc[2] + h * 0.18)), 'npcwork_glass_canopy', parent)
    return pod


def cargo_container(parent, name, loc, size=(6.0, 3.0, 3.0), role='npcwork_hull_paint_teal'):
    """The standard freight container everything in this economy moves (long axis = flight
    axis). One footprint, many owners — reuse is what makes a hauler's spine legible as
    'cargo' at range, and what lets a customs cutter's scan lamp mean the same thing on
    every hull it sweeps."""
    c = put(box(f'{name}_body', size, loc), role, parent)
    put(box(f'{name}_frame', (size[0] * 0.08, size[1] * 1.04, size[2] * 1.04),
            (loc[0] + size[0] * 0.46, loc[1], loc[2])), 'npcwork_structural_alloy', parent)
    put(box(f'{name}_frame2', (size[0] * 0.08, size[1] * 1.04, size[2] * 1.04),
            (loc[0] - size[0] * 0.46, loc[1], loc[2])), 'npcwork_structural_alloy', parent)
    return c


def flood_rig(parent, name, loc, role='npcwork_light_flood', rot=(0, 0, 0), scale=1.0):
    """A practical work light: housing + emissive face. The lens faces +X before `rot`
    is applied; aim it by rotating. Bright practical work lights are the pack's signature
    per the art direction."""
    put(box(f'{name}_housing', (0.35 * scale, 0.5 * scale, 0.4 * scale), loc, rot),
        'npcwork_structural_alloy', parent)
    lens_off = Vector((0.14 * scale, 0, 0))
    lens_loc = Vector(loc) + Euler(rot).to_matrix() @ lens_off
    put(box(f'{name}_lens', (0.12 * scale, 0.4 * scale, 0.3 * scale),
            tuple(lens_loc), rot), role, parent)


def nav_lights(parent, name, port_loc, stbd_loc, s=0.22):
    put(sphere(f'{name}_port', s, port_loc, seg=10, rings=6), 'npcwork_light_nav_red', parent)
    put(sphere(f'{name}_stbd', s, stbd_loc, seg=10, rings=6), 'npcwork_light_nav_green', parent)


# ---------------------------------------------------------------------------
# Craft builders are appended below by role family; each returns (root, meta) where meta
# records sockets, collision proxy recommendation, LOD plan and job-kind mapping for the
# integration manifest.

BUILDERS = {}


def register(craft_id):
    def deco(fn):
        BUILDERS[craft_id] = fn
        return fn
    return deco


# ---------------------------------------------------------------------------
# THE TWELVE FAMILIES — design/fiction/THE_WORKING_FLEET.md, one section per builder.
# Construction laws (fiction §0): trade hardware is the protagonist; function is
# asymmetric; engines tell the economics; light color is the trade code; hazard is
# written on the hull.

def _ore_mound(parent, name, loc, r, role='npcwork_armor_plate'):
    """Visible bulk cargo — a low cluster of three flattened lumps proud of a basket rim.
    Guild law: show your mass."""
    for i, (dx, dy, s) in enumerate(((0.0, 0.0, 1.0), (r * 0.55, r * 0.35, 0.62),
                                     (-r * 0.5, -r * 0.4, 0.5))):
        m = sphere(f'{name}_{i}', r * s, (loc[0] + dx, loc[1] + dy, loc[2]), seg=10, rings=6)
        m.scale = Vector((1.0, 1.0, 0.45))
        bpy.ops.object.transform_apply(scale=True)
        put(m, role, parent)


def _basket(parent, name, loc, l, w, h):
    """Open-top ore basket: floor + four walls + a hazard rim strip on the working edge.
    Walls carry the working paint (round 1 proved armor-grey walls swallow the whole
    craft into a charcoal slab — exactly the muddy read the art direction forbids)."""
    put(box(f'{name}_floor', (l, w, 0.3), (loc[0], loc[1], loc[2] - h * 0.5)),
        'npcwork_structural_alloy', parent)
    put(box(f'{name}_wall_f', (0.3, w, h), (loc[0] + l * 0.5, loc[1], loc[2])),
        'npcwork_hull_paint_ochre', parent)
    put(box(f'{name}_wall_a', (0.3, w, h), (loc[0] - l * 0.5, loc[1], loc[2])),
        'npcwork_hull_paint_ochre', parent)
    put(box(f'{name}_wall_p', (l, 0.3, h), (loc[0], loc[1] + w * 0.5, loc[2])),
        'npcwork_hull_paint_ochre', parent)
    put(box(f'{name}_wall_s', (l, 0.3, h), (loc[0], loc[1] - w * 0.5, loc[2])),
        'npcwork_hull_paint_ochre', parent)
    put(box(f'{name}_rim', (l * 1.02, 0.34, 0.18), (loc[0], loc[1] + w * 0.5, loc[2] + h * 0.5)),
        'npcwork_hazard_stripe', parent)
    _ore_mound(parent, f'{name}_ore', (loc[0], loc[1], loc[2] + h * 0.42), min(l, w) * 0.30,
               role='npcwork_ore_raw')


@register('prospector_skiff')
def build_prospector_skiff():
    """THE_WORKING_FLEET §1 — one-crew claim hunter. Half tool-bench: survey wand,
    folded working arms, stake launcher, belly filter drums, one oversized engine."""
    root = root_of('prospector_skiff')
    # Hull: compact wedge — a working boat, not a fighter.
    put(box('psk_hull', (9.0, 3.2, 2.2), (0.5, 0, 0)), 'npcwork_hull_paint_ochre', root)
    put(box('psk_nose', (3.2, 2.2, 1.6), (5.6, 0, -0.1)), 'npcwork_hull_paint_ochre', root)
    cockpit_pod(root, 'psk_cab', (3.4, 0.4, 1.35), 2.6, 1.8, 0.9)
    # One oversized engine: a prospector's margin is being first.
    engine_block(root, 'psk_drive', (-5.6, 0, 0.15), 1.45, 4.2)
    # Survey wand: a wand, not a Ranger spine — one emitter, hand-aimed, canted starboard.
    put(beam('psk_wand', (5.8, -0.6, 0.7), (9.6, -1.5, 1.3), 0.10), 'npcwork_structural_alloy', root)
    put(cone('psk_wand_tip', 0.28, 0.05, 0.7, (9.9, -1.57, 1.35), rot=(0, math.pi / 2, -0.24)),
        'npcwork_light_survey', root)
    # Two working arms folded along the port flank (asymmetry law: work lives to port).
    for i, x0 in enumerate((2.2, -0.6)):
        put(beam(f'psk_arm{i}_a', (x0, 1.7, 0.4), (x0 - 1.6, 2.15, 0.5), 0.16),
            'npcwork_structural_alloy', root)
        put(beam(f'psk_arm{i}_b', (x0 - 1.6, 2.15, 0.5), (x0 - 3.1, 1.75, 0.35), 0.13),
            'npcwork_structural_alloy', root)
        put(box(f'psk_arm{i}_claw', (0.5, 0.3, 0.35), (x0 - 3.35, 1.7, 0.32)),
            'npcwork_bare_steel', root)
    # Claim-stake launcher: starboard bow, three-round rack. The flare gun of the trade.
    put(box('psk_stake_base', (1.5, 0.8, 0.7), (4.2, -1.55, 0.9)), 'npcwork_armor_plate', root)
    for i in range(3):
        put(cyl(f'psk_stake_t{i}', 0.13, 1.7, (4.75, -1.30 - i * 0.25, 1.42),
                rot=(0, math.pi / 2, 0), verts=10), 'npcwork_bare_steel', root)
    # Four filter drums slung under the belly like saddlebags.
    for i in range(4):
        sx = 1.6 - (i % 2) * 2.4
        sy = 0.95 if i < 2 else -0.95
        put(cyl(f'psk_drum{i}', 0.68, 2.2, (sx, sy, -1.55), rot=(0, math.pi / 2, 0), verts=12),
            'npcwork_tank_shell', root)
    # Hand-painted tail chevron, one diode dead on purpose (the diode is authored ABSENT —
    # a lit row of 3 where a factory boat carries 4).
    put(box('psk_chevron', (0.2, 2.2, 0.9), (-7.6, 0, 0.9)), 'npcwork_id_plate', root)
    for i in range(3):
        put(box(f'psk_chevron_led{i}', (0.08, 0.3, 0.14), (-7.72, -0.7 + i * 0.55, 0.95)),
            'npcwork_light_mining', root)
    flood_rig(root, 'psk_flood', (4.6, 0.6, 1.7), role='npcwork_light_mining',
              rot=(0, 0.45, -0.2), scale=0.9)
    nav_lights(root, 'psk_nav', (0.5, 1.75, 0.6), (0.5, -1.75, 0.6))
    socket('SOCKET_Mining_Front', (9.9, -1.57, 1.35), root)
    socket('SOCKET_Stake_Starboard', (5.6, -1.55, 1.42), root)
    socket('SOCKET_Cargo_Ventral', (0.4, 0, -1.6), root)
    socket('SOCKET_Engine_Main', (-7.8, 0, 0.15), root)
    socket('SOCKET_Trail_Main', (-7.9, 0, 0.15), root)
    socket('SOCKET_Utility_Dorsal', (0.5, 0, 1.3), root)
    socket('SOCKET_Camera_Focus', (0.5, 0, 0.3), root)
    meta = {
        'role': 'prospector', 'fiction': 'THE_WORKING_FLEET.md §1 / THE_WORKING_TRADES.md §5',
        'servesJobKind': 'miner', 'servesTrafficRole': 'miner (light variant)',
        'signals': ['reading_the_dark', 'blind_cone', 'home_under_rock'],
        'workState': 'arms unfolded to seam, wand cone lit amber, drums venting dust',
        'socketPurposes': {
            'SOCKET_Mining_Front': 'blind_cone cut-beam origin (wand tip)',
            'SOCKET_Stake_Starboard': 'claim-stake launch + distress flare origin',
            'SOCKET_Cargo_Ventral': 'filter-drum transfer point',
        },
        'lodPlan': 'LOD1: drop arms/stake tubes/drums, keep wand+chevron; LOD2: hull+engine+wand silhouette',
    }
    return root, meta


def _build_ore_barge(craft_id, trough_variant):
    """THE_WORKING_FLEET §2 — bulk ore CARRIER (the Cradle cuts, the barge carries).
    Six proud baskets (or one center trough), a trimming boom that is a shovel not a
    drill, armored bow, basket floods, small drives on a short spine."""
    root = root_of(craft_id)
    boom_y = 1.8 if trough_variant else 0.0
    # Spine + armored bow. Working paint forward is scoured to armor where spill sandblasts it.
    put(box('brg_spine', (34.0, 5.0, 2.6), (-2.0, 0, -0.4)), 'npcwork_hull_paint_ochre', root)
    put(box('brg_bow', (7.0, 6.4, 3.4), (17.5, 0, 0.1)), 'npcwork_armor_plate', root)
    put(box('brg_bow_scar', (2.6, 0.2, 1.8), (17.0, -3.25, 0.4)), 'npcwork_scorch', root)
    cockpit_pod(root, 'brg_cab', (18.6, 1.6, 2.6), 3.0, 2.2, 1.3)
    if trough_variant:
        # Variant B: one continuous center trough — same trade, different yard.
        put(box('brg_trough_floor', (24.0, 6.2, 0.4), (-2.0, 0, 0.9)), 'npcwork_structural_alloy', root)
        put(box('brg_trough_p', (24.0, 0.4, 2.2), (-2.0, 3.2, 1.9)), 'npcwork_armor_plate', root)
        put(box('brg_trough_s', (24.0, 0.4, 2.2), (-2.0, -3.2, 1.9)), 'npcwork_armor_plate', root)
        put(box('brg_trough_rim', (24.2, 0.44, 0.2), (-2.0, 3.2, 3.0)), 'npcwork_hazard_stripe', root)
        for i in range(4):
            _ore_mound(root, f'brg_ore{i}', (7.0 - i * 6.0, 0, 2.1), 1.7, role='npcwork_ore_raw')
    else:
        for i in range(3):
            for j, sy in enumerate((2.05, -2.05)):
                _basket(root, f'brg_basket{i}{j}', (8.0 - i * 8.2, sy, 1.9), 7.0, 3.6, 2.6)
    # Loading boom on a bow pivot — a shovel, not a drill; the barge never claims to cut.
    put(cyl('brg_boom_pivot', 0.9, 2.4, (13.0, boom_y, 2.6), verts=14), 'npcwork_structural_alloy', root)
    put(beam('brg_boom_jib', (13.0, boom_y, 3.4), (2.0, boom_y + 1.2, 6.2), 0.42),
        'npcwork_hazard_stripe', root)
    put(box('brg_boom_scoop', (2.2, 1.8, 1.1), (0.9, boom_y + 1.35, 5.8)), 'npcwork_bare_steel', root)
    # Basket flood masts, lit whenever the baskets are worked.
    for i, mx in enumerate((4.0, -8.0)):
        put(cyl(f'brg_mast{i}', 0.22, 4.4, (mx, 0, 3.4), verts=8), 'npcwork_structural_alloy', root)
        flood_rig(root, f'brg_mast{i}_fl_p', (mx, 0.5, 5.4), rot=(0, 0.9, 2.2), scale=1.2)
        flood_rig(root, f'brg_mast{i}_fl_s', (mx, -0.5, 5.4), rot=(0, 0.9, -2.2), scale=1.2)
    # Drives: small against the body — profit is tonnes, not transit time.
    engine_block(root, 'brg_drive_p', (-20.5, 1.9, 0.2), 1.35, 3.6)
    engine_block(root, 'brg_drive_s', (-20.5, -1.9, 0.2), 1.35, 3.6)
    put(box('brg_id', (0.2, 3.4, 1.2), (-19.2, 0, 0.4)), 'npcwork_id_plate', root)
    nav_lights(root, 'brg_nav', (17.5, 3.3, 1.2), (17.5, -3.3, 1.2))
    socket('SOCKET_Work_Boom', (0.9, boom_y + 1.35, 5.2), root)
    socket('SOCKET_Cargo_Dorsal', (-2.0, 0, 2.4), root)
    socket('SOCKET_Engine_Main', (-22.4, 1.9, 0.2), root)
    socket('SOCKET_Trail_Main', (-22.5, -1.9, 0.2), root)
    socket('SOCKET_Utility_Dorsal', (13.0, boom_y, 3.9), root)
    socket('SOCKET_Camera_Focus', (0, 0, 1.0), root)
    meta = {
        'role': 'ore carrier', 'fiction': 'THE_WORKING_FLEET.md §2',
        'servesJobKind': 'miner (heavy logistics end)', 'servesTrafficRole': 'miner/hauler bulk class',
        'signals': ['heavy_burn', 'home_under_rock', 'spilling_the_count', 'stacking'],
        'workState': 'boom over baskets, floods on, tally lamp stepping its ring',
        'socketPurposes': {
            'SOCKET_Work_Boom': 'trim-boom scoop tip; tally/transfer VFX origin',
            'SOCKET_Cargo_Dorsal': 'basket field center — spilling_the_count dust origin',
        },
        'variant': 'trough' if trough_variant else 'baskets',
        'lodPlan': 'LOD1: merge baskets to solid fills, drop masts; LOD2: spine+bow+drive blocks',
    }
    return root, meta


@register('ore_barge')
def build_ore_barge():
    return _build_ore_barge('ore_barge', trough_variant=False)


@register('ore_barge_b')
def build_ore_barge_b():
    return _build_ore_barge('ore_barge_b', trough_variant=True)


def _build_volatiles_tanker(craft_id, cylinder_variant):
    """THE_WORKING_FLEET §3 — the cargo IS the ship. Formed pressure vessels in a
    stand-off truss, red volatile bands, external dorsal piping, one caged bow
    coupling, crew cab exiled aft behind a blast bulkhead."""
    root = root_of(craft_id)
    # Stand-off truss spine: two chords + cross braces. Tanks never touch the keel.
    put(box('tnk_chord_p', (30.0, 0.5, 0.5), (-1.0, 1.9, -2.2)), 'npcwork_structural_alloy', root)
    put(box('tnk_chord_s', (30.0, 0.5, 0.5), (-1.0, -1.9, -2.2)), 'npcwork_structural_alloy', root)
    for i in range(5):
        bx = 11.0 - i * 6.0
        put(beam(f'tnk_cross{i}', (bx, 1.9, -2.2), (bx, -1.9, -2.2), 0.16), 'npcwork_structural_alloy', root)
    if cylinder_variant:
        # Variant B: four insulated horizontal cylinders in a 2x2 rack, amber lagging.
        for i in range(4):
            tx = 4.0 - (i % 2) * 9.0
            tz = 0.4 if i < 2 else 3.2
            put(cyl(f'tnk_tank{i}', 2.05, 8.2, (tx, 0, tz), rot=(0, math.pi / 2, 0), verts=18),
                'npcwork_tank_shell', root)
            for k in range(2):
                put(cyl(f'tnk_lag{i}{k}', 2.18, 0.7, (tx - 2.4 + k * 4.8, 0, tz),
                        rot=(0, math.pi / 2, 0), verts=18), 'npcwork_tank_insulation', root)
            put(cyl(f'tnk_band{i}', 2.14, 0.35, (tx, 0, tz), rot=(0, math.pi / 2, 0), verts=18),
                'npcwork_hazard_volatile', root)
        tank_tops = [(4.0, 0, 5.25), (-5.0, 0, 5.25)]
    else:
        # Variant A: three formed spheres cradled in rings.
        for i, tx in enumerate((8.0, 0.0, -8.0)):
            put(sphere(f'tnk_tank{i}', 3.35, (tx, 0, 0.8), seg=20, rings=12), 'npcwork_tank_shell', root)
            bpy.ops.mesh.primitive_torus_add(location=(tx, 0, 0.8), major_radius=3.42,
                                             minor_radius=0.16, major_segments=24, minor_segments=8)
            band = bpy.context.active_object
            band.name = f'tnk_band{i}'
            band.rotation_euler = (0, math.pi / 2, 0)
            put(band, 'npcwork_hazard_volatile', root)
            bpy.ops.mesh.primitive_torus_add(location=(tx, 0, -1.4), major_radius=2.6,
                                             minor_radius=0.22, major_segments=20, minor_segments=8)
            cradle = bpy.context.active_object
            cradle.name = f'tnk_cradle{i}'
            put(cradle, 'npcwork_structural_alloy', root)
        tank_tops = [(8.0, 0, 4.3), (0.0, 0, 4.3), (-8.0, 0, 4.3)]
    # External dorsal pipe run, insulated, routed to the bow coupling.
    put(cyl('tnk_pipe_main', 0.30, 26.0, (1.0, 0.55, 4.6), rot=(0, math.pi / 2, 0), verts=10),
        'npcwork_tank_insulation', root)
    for i, (px, py, pz) in enumerate(tank_tops):
        put(beam(f'tnk_riser{i}', (px, 0.55, 4.6), (px, 0, pz - 0.4), 0.18), 'npcwork_bare_steel', root)
    # The one piece of this ship anyone else touches: caged, lit, painted like a warning.
    put(cyl('tnk_probe', 0.55, 3.6, (15.6, 0, 1.2), rot=(0, math.pi / 2, 0), verts=12),
        'npcwork_bare_steel', root)
    put(cone('tnk_probe_tip', 0.55, 0.25, 0.9, (17.8, 0, 1.2), rot=(0, math.pi / 2, 0), verts=12),
        'npcwork_hazard_volatile', root)
    for sy, sz in ((1.1, 2.3), (-1.1, 2.3), (1.1, 0.1), (-1.1, 0.1)):
        put(beam(f'tnk_cage_{sy:+.1f}_{sz:.1f}', (13.9, sy, sz), (17.2, sy * 0.6, 1.2 + (sz - 1.2) * 0.5), 0.17),
            'npcwork_hazard_stripe', root)
    flood_rig(root, 'tnk_probe_fl', (14.2, 0, 2.6), rot=(0, 0.5, 0), scale=0.8)
    # Crew cab far aft, behind a blast disc — regulation, and theatre.
    put(cyl('tnk_blast_disc', 3.0, 0.5, (-12.6, 0, 0.8), rot=(0, math.pi / 2, 0), verts=18),
        'npcwork_armor_plate', root)
    cockpit_pod(root, 'tnk_cab', (-14.6, 0, -0.6), 3.2, 2.4, 1.4)
    engine_block(root, 'tnk_drive_p', (-16.5, 1.7, 0.6), 1.25, 3.4)
    engine_block(root, 'tnk_drive_s', (-16.5, -1.7, 0.6), 1.25, 3.4)
    put(box('tnk_id', (0.2, 2.6, 1.0), (-15.9, 0, 2.2)), 'npcwork_id_plate', root)
    nav_lights(root, 'tnk_nav', (14.0, 1.6, 2.4), (14.0, -1.6, 2.4))
    socket('SOCKET_Coupling_Front', (17.9, 0, 1.2), root)
    socket('SOCKET_Cargo_Dorsal', (0.0, 0, 3.6), root)
    socket('SOCKET_Engine_Main', (-18.4, 1.7, 0.6), root)
    socket('SOCKET_Trail_Main', (-18.5, -1.7, 0.6), root)
    socket('SOCKET_Utility_Dorsal', (1.0, 0.55, 5.0), root)
    socket('SOCKET_Camera_Focus', (0, 0, 1.0), root)
    meta = {
        'role': 'volatiles tanker', 'fiction': 'THE_WORKING_FLEET.md §3',
        'servesJobKind': 'hauler (hazard-cargo variant)', 'servesTrafficRole': 'tanker (new)',
        'signals': ['heavy_burn', 'clean_burn', 'mouth_open (at the BOW coupling)'],
        'workState': 'probe extended, cage lit white, tank-status lamps walking the spine',
        'neverShows': 'a cutting cone — amber near your bow from a tanker is wrong',
        'socketPurposes': {
            'SOCKET_Coupling_Front': 'mouth_open transfer-umbilical origin (bow, not amidships)',
            'SOCKET_Cargo_Dorsal': 'tank-status lamp walk path center',
        },
        'variant': 'cylinders' if cylinder_variant else 'spheres',
        'lodPlan': 'LOD1: drop pipe run/cage bars, keep tanks+bands; LOD2: tanks+truss+drives only',
    }
    return root, meta


@register('volatiles_tanker')
def build_volatiles_tanker():
    return _build_volatiles_tanker('volatiles_tanker', cylinder_variant=False)


@register('volatiles_tanker_b')
def build_volatiles_tanker_b():
    return _build_volatiles_tanker('volatiles_tanker_b', cylinder_variant=True)


@register('scrap_sweeper')
def build_scrap_sweeper():
    """THE_WORKING_FLEET §4 — municipal debris cleanup. The front five metres are
    mouth; the missing cutting gear is what separates it from the salvage cutter."""
    root = root_of('scrap_sweeper')
    put(box('swp_hull', (9.0, 4.4, 3.0), (-1.0, 0, 0)), 'npcwork_hull_paint_rust', root)
    put(box('swp_patch', (2.2, 0.2, 1.4), (-1.6, 2.3, 0.4)), 'npcwork_bare_steel', root)
    cockpit_pod(root, 'swp_cab', (2.4, 0, 2.0), 2.2, 1.7, 0.9)
    # The mouth: two flared lips around a lit collector throat. Chevrons on both edges
    # because the one thing a sweeper must never be ambiguous about is which end swallows.
    put(box('swp_throat', (2.6, 4.0, 2.6), (4.4, 0, 0)), 'npcwork_armor_plate', root)
    put(box('swp_throat_glow', (0.3, 3.2, 1.9), (5.75, 0, 0)), 'npcwork_light_mining', root)
    put(box('swp_lip_top', (3.4, 4.6, 0.35), (6.4, 0, 1.9), rot=(0, -0.42, 0)), 'npcwork_armor_plate', root)
    put(box('swp_lip_bot', (3.4, 4.6, 0.35), (6.4, 0, -1.9), rot=(0, 0.42, 0)), 'npcwork_armor_plate', root)
    # Chevrons on the LEADING edge of both lips (round 1 put them on one side edge
    # each, which read as asymmetric noise instead of "this end swallows").
    put(box('swp_lip_top_hz', (0.4, 4.62, 0.37), (7.95, 0, 2.56), rot=(0, -0.42, 0)),
        'npcwork_hazard_stripe', root)
    put(box('swp_lip_bot_hz', (0.4, 4.62, 0.37), (7.95, 0, -2.56), rot=(0, 0.42, 0)),
        'npcwork_hazard_stripe', root)
    # Dorsal magnet boom for the pieces too big to inhale.
    put(cyl('swp_boom_mast', 0.24, 2.6, (0.6, 0, 2.6), verts=10), 'npcwork_structural_alloy', root)
    put(beam('swp_boom_jib', (0.6, 0, 3.8), (5.2, 1.6, 3.3), 0.18), 'npcwork_structural_alloy', root)
    put(cyl('swp_magnet', 0.85, 0.5, (5.5, 1.72, 3.15), rot=(0.35, 0.6, 0), verts=14),
        'npcwork_bare_steel', root)
    # Open lattice debris cage aft — the catch visible through the bars.
    cx, cl, cw, ch = -7.2, 5.0, 4.0, 3.2
    for sy in (cw * 0.5, -cw * 0.5):
        for sz in (ch * 0.5, -ch * 0.5):
            put(beam(f'swp_cage_x_{sy:+.1f}{sz:+.1f}', (cx - cl * 0.5, sy, sz + 0.3),
                     (cx + cl * 0.5, sy, sz + 0.3), 0.12), 'npcwork_structural_alloy', root)
    for sx in (cx - cl * 0.5, cx + cl * 0.5):
        for sy in (cw * 0.5, -cw * 0.5):
            put(beam(f'swp_cage_z_{sx:+.1f}{sy:+.1f}', (sx, sy, 0.3 - ch * 0.5),
                     (sx, sy, 0.3 + ch * 0.5), 0.12), 'npcwork_structural_alloy', root)
        for sz in (ch * 0.5, -ch * 0.5):
            put(beam(f'swp_cage_y_{sx:+.1f}{sz:+.1f}', (sx, -cw * 0.5, sz + 0.3),
                     (sx, cw * 0.5, sz + 0.3), 0.12), 'npcwork_structural_alloy', root)
    put(box('swp_junk0', (1.4, 1.1, 0.9), (-6.6, 0.6, -0.4), rot=(0.3, 0.2, 0.5)), 'npcwork_scorch', root)
    put(box('swp_junk1', (1.0, 1.3, 0.7), (-7.9, -0.7, 0.2), rot=(-0.2, 0.4, 0.9)), 'npcwork_bare_steel', root)
    put(sphere('swp_junk2', 0.6, (-6.9, -0.9, 1.0), seg=8, rings=5), 'npcwork_armor_plate', root)
    # Stubby paired drives set wide and low, clear of the cage.
    engine_block(root, 'swp_drive_p', (-4.6, 2.6, -1.1), 0.95, 2.6)
    engine_block(root, 'swp_drive_s', (-4.6, -2.6, -1.1), 0.95, 2.6)
    nav_lights(root, 'swp_nav', (2.4, 2.3, 1.0), (2.4, -2.3, 1.0))
    socket('SOCKET_Sweep_Front', (6.2, 0, 0), root)
    socket('SOCKET_Work_Boom', (5.5, 1.72, 3.0), root)
    socket('SOCKET_Cargo_Aft', (-7.2, 0, 0.3), root)
    socket('SOCKET_Engine_Main', (-6.0, 2.6, -1.1), root)
    socket('SOCKET_Trail_Main', (-6.0, -2.6, -1.1), root)
    socket('SOCKET_Camera_Focus', (-0.5, 0, 0.5), root)
    meta = {
        'role': 'debris sweeper', 'fiction': 'THE_WORKING_FLEET.md §4',
        'servesJobKind': 'salvor-adjacent (collector); future cleanup kind',
        'servesTrafficRole': 'debris-cleanup (new)',
        'signals': ['blind_cone (mouth-directed)', 'home_under_rock', 'spilling_the_count'],
        'workState': 'throat lit, magnet boom sweeping, cage filling',
        'neverShows': 'shears or umbrellas — a sweeper collects, it does not cut',
        'socketPurposes': {
            'SOCKET_Sweep_Front': 'collector intake — cone/particle sink',
            'SOCKET_Work_Boom': 'magnet head — pick-up VFX origin',
            'SOCKET_Cargo_Aft': 'cage fill point',
        },
        'lodPlan': 'LOD1: cage to 4 beams + solid junk mass; LOD2: hull+throat+lips only',
    }
    return root, meta


@register('repair_tender')
def build_repair_tender():
    """THE_WORKING_FLEET §5 — Sola Patchline's shop. Freighter frame, port plate rack,
    starboard weld boom, dorsal umbilical drum, red corners, the do-not-push bar."""
    root = root_of('repair_tender')
    put(box('tnd_hull', (16.0, 7.0, 4.4), (-1.0, 0, 0)), 'npcwork_hull_paint_bone', root)
    put(box('tnd_bow', (4.0, 5.2, 3.4), (9.0, 0, -0.2)), 'npcwork_hull_paint_bone', root)
    put(box('tnd_bay_lip_p', (16.2, 0.3, 0.5), (-1.0, 3.55, 1.6)), 'npcwork_hazard_stripe', root)
    put(box('tnd_bay_lip_s', (16.2, 0.3, 0.5), (-1.0, -3.55, 1.6)), 'npcwork_hazard_stripe', root)
    cockpit_pod(root, 'tnd_cab', (10.2, 0, 1.9), 2.8, 2.4, 1.2)
    # Port plate rack: hull skins clamped in a row like books — a striped quarter-circle
    # readable at range. Round 1 authored the plates flush and thin and they vanished
    # into the flank; the rack now projects a full metre proud on a visible A-frame,
    # and the stripes alternate three materials so the "books" count at distance.
    put(beam('tnd_rack_rail_top', (4.2, 4.6, 2.6), (-8.0, 4.6, 2.6), 0.18), 'npcwork_structural_alloy', root)
    put(beam('tnd_rack_rail_bot', (4.2, 4.35, -1.4), (-8.0, 4.35, -1.4), 0.18), 'npcwork_structural_alloy', root)
    for i in range(7):
        px = 3.2 - i * 1.75
        role = ('npcwork_hull_paint_teal', 'npcwork_bare_steel', 'npcwork_hull_paint_ochre')[i % 3]
        put(box(f'tnd_plate{i}', (1.5, 0.22, 3.8), (px, 4.5, 0.6), rot=(0.10, 0, 0)), role, root)
    for i, px in enumerate((3.2, -2.05, -7.3)):
        put(beam(f'tnd_rack_leg{i}', (px, 3.5, -1.6), (px, 4.6, 2.6), 0.14), 'npcwork_structural_alloy', root)
    # Starboard welding boom, elbowed out, lamp-petal head.
    put(box('tnd_boom_shoulder', (1.4, 1.0, 1.0), (6.5, -3.6, 1.2)), 'npcwork_structural_alloy', root)
    put(beam('tnd_boom_a', (6.5, -3.9, 1.4), (8.6, -6.2, 2.2), 0.24), 'npcwork_structural_alloy', root)
    put(beam('tnd_boom_b', (8.6, -6.2, 2.2), (10.8, -6.8, 1.4), 0.20), 'npcwork_structural_alloy', root)
    put(cyl('tnd_weld_head', 0.55, 0.5, (11.1, -6.9, 1.3), rot=(0, math.pi / 2, 0), verts=12),
        'npcwork_bare_steel', root)
    put(cyl('tnd_weld_glow', 0.34, 0.14, (11.4, -6.9, 1.3), rot=(0, math.pi / 2, 0), verts=12),
        'npcwork_light_repair', root)
    for k in range(4):
        pa = k * math.pi / 2 + math.pi / 4
        put(box(f'tnd_petal{k}', (0.5, 0.16, 0.8), (11.15, -6.9 + math.cos(pa) * 0.7,
                                                    1.3 + math.sin(pa) * 0.7),
                rot=(pa, 0.35, 0)), 'npcwork_hull_paint_bone', root)
    # Dorsal umbilical drum + soft-dock collar.
    put(cyl('tnd_drum', 1.3, 2.6, (1.5, 0, 3.1), rot=(math.pi / 2, 0, 0), verts=16),
        'npcwork_structural_alloy', root)
    put(cyl('tnd_collar', 0.9, 0.8, (3.3, 0, 3.3), rot=(0, math.pi / 2, 0), verts=14),
        'npcwork_hull_paint_bone', root)
    # Ventral mag-shoe rails where the crew walk.
    put(box('tnd_rail_p', (14.0, 0.3, 0.25), (-1.0, 1.6, -2.35)), 'npcwork_bare_steel', root)
    put(box('tnd_rail_s', (14.0, 0.3, 0.25), (-1.0, -1.6, -2.35)), 'npcwork_bare_steel', root)
    # Panel breakup so the flank is a workshop wall, not a blank slab.
    for i, vx in enumerate((5.0, 1.2, -4.6)):
        put(box(f'tnd_vent{i}', (1.6, 0.25, 1.0), (vx, -3.6, 0.6)), 'npcwork_armor_plate', root)
    # Four static red corner lamps on short standoffs: crew outside.
    for cxx, cyy in ((6.9, 3.4), (6.9, -3.4), (-8.9, 3.4), (-8.9, -3.4)):
        put(cyl(f'tnd_corner_post_{cxx:+.0f}{cyy:+.0f}', 0.10, 0.7, (cxx, cyy, 2.45), verts=8),
            'npcwork_structural_alloy', root)
        put(sphere(f'tnd_corner_{cxx:+.0f}{cyy:+.0f}', 0.42, (cxx, cyy, 2.95), seg=10, rings=6),
            'npcwork_light_distress', root)
    # The swing-out "do not push" bar across the cold drive, stowed diagonal.
    put(beam('tnd_bar', (-9.2, 2.8, 1.0), (-9.2, -2.8, -0.6), 0.16), 'npcwork_light_flood', root)
    engine_block(root, 'tnd_drive_p', (-10.4, 1.8, 0.2), 1.2, 3.2)
    engine_block(root, 'tnd_drive_s', (-10.4, -1.8, 0.2), 1.2, 3.2)
    put(box('tnd_id', (0.2, 2.8, 1.0), (-9.9, 0, 1.6)), 'npcwork_id_plate', root)
    nav_lights(root, 'tnd_nav', (9.0, 2.7, 0.9), (9.0, -2.7, 0.9))
    socket('SOCKET_Work_Boom', (11.4, -6.9, 1.3), root)
    socket('SOCKET_Umbilical_Dorsal', (3.7, 0, 3.3), root)
    socket('SOCKET_Cargo_Ventral', (-1.0, 0, -2.4), root)
    socket('SOCKET_Engine_Main', (-12.2, 1.8, 0.2), root)
    socket('SOCKET_Trail_Main', (-12.3, -1.8, 0.2), root)
    socket('SOCKET_Utility_Dorsal', (1.5, 0, 4.5), root)
    socket('SOCKET_Camera_Focus', (0, 0, 0.8), root)
    meta = {
        'role': 'repair tender', 'fiction': 'THE_WORKING_FLEET.md §5 / THE_WORKING_TRADES.md §3',
        'servesJobKind': 'tender', 'servesTrafficRole': 'tender',
        'signals': ['hull_open', 'spine_wake', 'clean_burn'],
        'workState': 'boom out, petals lit blue-white, red corners on, bar deployed — four simultaneous silhouette changes',
        'resolves': 'fiction↔code hull contradiction (TRADES says Mule-frame; runtime uses hull_multirole)',
        'socketPurposes': {
            'SOCKET_Work_Boom': 'weld-stitch origin (hull_open men-at-work seam)',
            'SOCKET_Umbilical_Dorsal': 'soft-dock collar / parts transfer',
        },
        'lodPlan': 'LOD1: rack to one striped slab, drop petals/rails; LOD2: hull+drum+boom stub',
    }
    return root, meta


@register('yard_tug')
def build_yard_tug():
    """THE_WORKING_FLEET §6 — Pim Berth-Hand's boat: mostly engine, a padded bow
    cradle scuffed white from a thousand kisses, winch tower aft, high bridge."""
    root = root_of('yard_tug')
    # Spine frame + shoulder pylons. Almost no cargo volume, by economics.
    put(box('tug_spine', (14.0, 3.4, 3.0), (-1.0, 0, 0)), 'npcwork_hull_paint_ochre', root)
    put(box('tug_pylon_p', (5.0, 2.6, 1.6), (-3.0, 3.0, 1.0)), 'npcwork_structural_alloy', root)
    put(box('tug_pylon_s', (5.0, 2.6, 1.6), (-3.0, -3.0, 1.0)), 'npcwork_structural_alloy', root)
    # The economics made visible: two oversized drives on the shoulders.
    engine_block(root, 'tug_drive_p', (-3.0, 4.6, 1.2), 2.5, 8.6)
    engine_block(root, 'tug_drive_s', (-3.0, -4.6, 1.2), 2.5, 8.6)
    put(box('tug_drive_hz_p', (1.8, 0.35, 0.35), (-7.2, 4.6, 3.9)), 'npcwork_hazard_stripe', root)
    put(box('tug_drive_hz_s', (1.8, 0.35, 0.35), (-7.2, -4.6, 3.9)), 'npcwork_hazard_stripe', root)
    # Bow push-cradle: two arms + four padded ribs, concave toward +X.
    put(beam('tug_cradle_arm_p', (5.5, 1.4, 0.2), (8.2, 2.6, 0.4), 0.34), 'npcwork_structural_alloy', root)
    put(beam('tug_cradle_arm_s', (5.5, -1.4, 0.2), (8.2, -2.6, 0.4), 0.34), 'npcwork_structural_alloy', root)
    for i, ry in enumerate((2.4, 0.9, -0.9, -2.4)):
        put(box(f'tug_pad{i}', (0.5, 1.1, 2.2), (8.6 - abs(ry) * 0.22, ry, 0.4), rot=(0, 0, ry * 0.10)),
            'npcwork_hull_paint_bone', root)
    # Hip nudge keels with replaceable polymer shoes.
    put(box('tug_keel_p', (6.0, 0.5, 1.0), (0.5, 2.2, -1.9)), 'npcwork_structural_alloy', root)
    put(box('tug_keel_s', (6.0, 0.5, 1.0), (0.5, -2.2, -1.9)), 'npcwork_structural_alloy', root)
    put(box('tug_shoe_p', (6.2, 0.56, 0.3), (0.5, 2.2, -2.5)), 'npcwork_hull_paint_bone', root)
    put(box('tug_shoe_s', (6.2, 0.56, 0.3), (0.5, -2.2, -2.5)), 'npcwork_hull_paint_bone', root)
    # Aft winch tower: drum + painted capacity plate.
    put(box('tug_tower', (1.6, 1.6, 3.6), (-6.6, 0, 2.6)), 'npcwork_structural_alloy', root)
    put(cyl('tug_winch_drum', 1.0, 2.0, (-6.6, 0, 4.6), rot=(math.pi / 2, 0, 0), verts=14),
        'npcwork_bare_steel', root)
    put(box('tug_capacity_plate', (0.15, 1.3, 0.8), (-7.5, 0, 2.9)), 'npcwork_id_plate', root)
    # High bridge over the cradle: the pilot looks DOWN the client's hull.
    put(box('tug_bridge_mast', (1.0, 1.0, 2.0), (3.6, 0, 2.4)), 'npcwork_structural_alloy', root)
    cockpit_pod(root, 'tug_bridge', (4.2, 0, 3.8), 2.4, 2.0, 1.1, role='npcwork_hull_paint_ochre')
    # Apron beacon mast, amber.
    put(cyl('tug_beacon_mast', 0.12, 2.2, (-1.0, 0, 4.0), verts=8), 'npcwork_structural_alloy', root)
    put(sphere('tug_beacon', 0.32, (-1.0, 0, 5.2), seg=10, rings=6), 'npcwork_light_mining', root)
    flood_rig(root, 'tug_cradle_fl_p', (6.0, 1.8, 1.6), rot=(0, 0.35, -0.3), scale=0.9)
    flood_rig(root, 'tug_cradle_fl_s', (6.0, -1.8, 1.6), rot=(0, 0.35, 0.3), scale=0.9)
    nav_lights(root, 'tug_nav', (5.8, 1.9, 1.1), (5.8, -1.9, 1.1))
    socket('SOCKET_Push_Front', (8.8, 0, 0.4), root)
    socket('SOCKET_Tow_Aft', (-6.6, 0, 4.6), root)
    socket('SOCKET_Engine_Main', (-7.4, 4.6, 1.2), root)
    socket('SOCKET_Trail_Port', (-7.5, 4.6, 1.2), root)
    socket('SOCKET_Trail_Starboard', (-7.5, -4.6, 1.2), root)
    socket('SOCKET_Camera_Focus', (0, 0, 0.8), root)
    meta = {
        'role': 'yard tug / lighter', 'fiction': 'THE_WORKING_FLEET.md §6 / THE_WORKING_TRADES.md §6',
        'servesJobKind': 'none yet — full dossier, zero code presence; future dock-approach choreography',
        'servesTrafficRole': 'tug (new)',
        'signals': ['stacking (flown for the OTHER hull)', 'heavy_burn (under tow, honest combined mass)'],
        'workState': 'cradle floods on, drum turning, nudge thrusters ticking in count',
        'socketPurposes': {
            'SOCKET_Push_Front': 'client contact point — cradle kiss',
            'SOCKET_Tow_Aft': 'tow-line origin (drum)',
        },
        'lodPlan': 'LOD1: drop pads/shoes/beacon, keep drives+cradle arms; LOD2: spine+two drive cylinders',
    }
    return root, meta


def _build_salvage_cutter(craft_id, damaged):
    """THE_WORKING_FLEET §7 — Bram's cutter: hooded umbrellas aimed down, bow shears,
    hip tether reels, open scrap cradle, chained drum stack. Damaged variant loses an
    umbrella arm at the shoulder — the honest wound of the trade."""
    root = root_of(craft_id)
    # Patched hull: soot-brown over freighter grey, plates that match nothing.
    put(box('sal_hull', (13.0, 5.6, 3.6), (0.5, 0, 0)), 'npcwork_hull_paint_rust', root)
    put(box('sal_patch0', (2.4, 0.2, 1.6), (2.0, 2.9, 0.5)), 'npcwork_bare_steel', root)
    put(box('sal_patch1', (1.8, 0.2, 1.2), (-2.4, 2.9, -0.6)), 'npcwork_hull_paint_teal', root)
    put(box('sal_patch2', (2.0, 0.2, 1.3), (-0.4, -2.9, 0.8)), 'npcwork_hull_paint_ochre', root)
    put(box('sal_scorch', (1.8, 0.2, 1.4), (4.2, -2.9, -0.3)), 'npcwork_scorch', root)
    cockpit_pod(root, 'sal_cab', (5.6, 1.2, 2.2), 2.4, 1.9, 1.0, role='npcwork_hull_paint_rust')
    # Three umbrella arms (two if damaged): hooded amber floods aimed DOWN — salvage
    # light is confession light.
    arms = ((2.5, 1.6, 'p'), (0.0, -1.6, 's'), (-2.8, 1.2, 'm'))
    for i, (ax, ay, tag) in enumerate(arms):
        if damaged and tag == 'm':
            # The shoulder stub and the scar. Model the wound, don't texture it.
            put(cyl(f'sal_stub{i}', 0.30, 0.8, (ax, ay, 2.1), rot=(0.5, 0.3, 0), verts=10),
                'npcwork_scorch', root)
            continue
        put(beam(f'sal_arm{i}_a', (ax, ay, 1.9), (ax + 1.2, ay * 1.9, 3.4), 0.20),
            'npcwork_structural_alloy', root)
        put(beam(f'sal_arm{i}_b', (ax + 1.2, ay * 1.9, 3.4), (ax + 2.6, ay * 2.1, 2.6), 0.16),
            'npcwork_structural_alloy', root)
        hx, hy, hz = ax + 2.8, ay * 2.1, 2.4
        put(cone(f'sal_hood{i}', 0.85, 0.3, 1.1, (hx, hy, hz), rot=(math.pi, 0, 0), verts=12),
            'npcwork_armor_plate', root)
        put(cyl(f'sal_hood_glow{i}', 0.5, 0.12, (hx, hy, hz - 0.55), verts=12),
            'npcwork_light_salvage', root)
    # Hydraulic plate-shears on the starboard bow knuckle, jaw open in transit
    # (the closing cylinder leaks; Bram will fix it when it fails).
    put(box('sal_shear_mount', (1.6, 1.2, 1.2), (6.5, -2.2, 0.6)), 'npcwork_structural_alloy', root)
    put(box('sal_jaw_up', (2.6, 0.5, 0.5), (8.2, -2.5, 1.35), rot=(0, -0.5, -0.15)),
        'npcwork_bare_steel', root)
    put(box('sal_jaw_dn', (2.6, 0.5, 0.5), (8.2, -2.5, -0.15), rot=(0, 0.5, -0.15)),
        'npcwork_bare_steel', root)
    put(box('sal_jaw_hz', (1.7, 1.26, 0.3), (6.5, -2.2, 1.35)), 'npcwork_hazard_stripe', root)
    # Tether reels at both hips.
    put(cyl('sal_reel_p', 0.85, 1.1, (-1.5, 3.2, -0.6), rot=(math.pi / 2, 0, 0), verts=14),
        'npcwork_bare_steel', root)
    put(cyl('sal_reel_s', 0.85, 1.1, (-1.5, -3.2, -0.6), rot=(math.pi / 2, 0, 0), verts=14),
        'npcwork_bare_steel', root)
    # Open-backed scrap cradle where a freighter would have a hold.
    for sy in (2.2, -2.2):
        put(beam(f'sal_cradle_rail{sy:+.0f}', (-5.5, sy, -0.8), (-9.5, sy, -0.2), 0.16),
            'npcwork_structural_alloy', root)
        put(beam(f'sal_cradle_post{sy:+.0f}', (-9.5, sy, -0.2), (-9.5, sy, 1.6), 0.14),
            'npcwork_structural_alloy', root)
    put(box('sal_cradle_floor', (4.2, 4.4, 0.25), (-7.5, 0, -0.9)), 'npcwork_structural_alloy', root)
    put(box('sal_scrap0', (1.6, 1.1, 0.8), (-7.0, 0.7, -0.3), rot=(0.2, 0.4, 0.3)), 'npcwork_scorch', root)
    put(box('sal_scrap1', (1.2, 0.9, 0.6), (-8.3, -0.8, -0.4), rot=(-0.3, 0.1, 0.8)),
        'npcwork_bare_steel', root)
    # Chained drum stack riding the dorsal spine.
    for i in range(3):
        put(cyl(f'sal_drumstack{i}', 0.6, 1.8, (-4.2 + i * 0.2, -0.6 + i * 0.62, 2.2 + i * 0.12),
                rot=(0, math.pi / 2, 0), verts=12), 'npcwork_tank_shell', root)
    put(beam('sal_chain', (-3.4, -1.1, 2.0), (-3.2, 1.4, 2.6), 0.06), 'npcwork_bare_steel', root)
    engine_block(root, 'sal_drive_p', (-6.3, 1.5, 0.9), 1.1, 3.0)
    engine_block(root, 'sal_drive_s', (-6.3, -1.5, 0.9), 1.1, 3.0)
    nav_lights(root, 'sal_nav', (6.9, 2.8, 0.9), (6.9, -2.8, 0.9))
    socket('SOCKET_Work_Boom', (8.9, -2.5, 0.6), root)
    socket('SOCKET_Tether_Port', (-1.5, 3.8, -0.6), root)
    socket('SOCKET_Tether_Starboard', (-1.5, -3.8, -0.6), root)
    socket('SOCKET_Cargo_Aft', (-7.5, 0, 0.2), root)
    socket('SOCKET_Engine_Main', (-7.9, 1.5, 0.9), root)
    socket('SOCKET_Trail_Main', (-8.0, -1.5, 0.9), root)
    socket('SOCKET_Camera_Focus', (0, 0, 0.8), root)
    meta = {
        'role': 'salvage cutter', 'fiction': 'THE_WORKING_FLEET.md §7 / THE_WORKING_TRADES.md §2',
        'servesJobKind': 'salvor', 'servesTrafficRole': 'salvor',
        'signals': ['picking_the_bones', 'home_under_rock', 'spilling_the_count'],
        'workState': 'umbrellas out and lit, shears at the seam, scrap arcing into the cradle',
        'resolves': 'fiction↔code hull contradiction (salvor currently reads as a miner via hull_miner)',
        'condition': 'damaged' if damaged else 'worn',
        'socketPurposes': {
            'SOCKET_Work_Boom': 'cut-arc origin (shear jaws)',
            'SOCKET_Tether_Port': 'wrangle tether origin',
            'SOCKET_Tether_Starboard': 'wrangle tether origin',
            'SOCKET_Cargo_Aft': 'scrap-cradle fill point',
        },
        'lodPlan': 'LOD1: drop chain/scrap/patches, keep umbrellas+shears; LOD2: hull+one umbrella+jaw wedge',
    }
    return root, meta


@register('salvage_cutter')
def build_salvage_cutter():
    return _build_salvage_cutter('salvage_cutter', damaged=False)


@register('salvage_cutter_damaged')
def build_salvage_cutter_damaged():
    return _build_salvage_cutter('salvage_cutter_damaged', damaged=True)


@register('survey_pin')
def build_survey_pin():
    """THE_WORKING_FLEET §8 — Ness's boat: low-mass, over-instrumented, flies
    sideways-looking. Gives the VFX-only boom/pin/paddles a real mesh."""
    root = root_of('survey_pin')
    # Slender hull + tapered nose. Ash-grey with one cold-blue strip.
    put(box('svy_hull', (13.0, 2.6, 2.0), (-1.0, 0, 0)), 'npcwork_structural_alloy', root)
    put(cone('svy_nose', 1.15, 0.25, 3.4, (7.2, 0, 0), rot=(0, math.pi / 2, 0), verts=12),
        'npcwork_structural_alloy', root)
    put(box('svy_strip', (12.0, 2.66, 0.28), (-1.0, 0, 0.4)), 'npcwork_hull_paint_teal', root)
    cockpit_pod(root, 'svy_cab', (3.6, 0, 1.35), 2.0, 1.5, 0.8)
    # Dorsal sensor spine half the hull's own length, on pylons, carrying instruments.
    put(cyl('svy_spine', 0.18, 11.0, (-0.5, 0, 2.6), rot=(0, math.pi / 2, 0), verts=10),
        'npcwork_bare_steel', root)
    for i, sx in enumerate((3.0, -0.5, -4.0)):
        put(beam(f'svy_spine_py{i}', (sx, 0, 1.0), (sx, 0, 2.6), 0.10), 'npcwork_structural_alloy', root)
        put(box(f'svy_instr{i}', (0.9, 0.5, 0.5), (sx + 1.0, 0, 2.75)), 'npcwork_armor_plate', root)
    # Two array paddles spread like moth wings ahead of amidships.
    for sy, tag in ((1.0, 'p'), (-1.0, 's')):
        put(beam(f'svy_paddle_arm_{tag}', (2.0, sy * 1.3, 0.6), (3.4, sy * 3.4, 1.5), 0.10),
            'npcwork_structural_alloy', root)
        put(box(f'svy_paddle_{tag}', (2.6, 0.14, 1.8), (3.8, sy * 3.9, 1.7), rot=(sy * 0.35, 0, sy * 0.25)),
            'npcwork_hull_paint_teal', root)
    # Range-mast triangle at the tail.
    put(beam('svy_mast_a', (-7.4, 0.9, 1.0), (-7.4, 0, 3.6), 0.08), 'npcwork_bare_steel', root)
    put(beam('svy_mast_b', (-7.4, -0.9, 1.0), (-7.4, 0, 3.6), 0.08), 'npcwork_bare_steel', root)
    put(beam('svy_mast_c', (-7.4, 0.9, 1.0), (-7.4, -0.9, 1.0), 0.08), 'npcwork_bare_steel', root)
    put(sphere('svy_mast_tip', 0.2, (-7.4, 0, 3.7), seg=8, rings=5), 'npcwork_light_survey', root)
    # The cold boom pin, folded along starboard at rest; it crabs 90° when working.
    put(beam('svy_pin_a', (6.0, -0.9, 0.3), (2.6, -2.4, 0.4), 0.12), 'npcwork_bare_steel', root)
    put(beam('svy_pin_b', (2.6, -2.4, 0.4), (-0.8, -2.7, 0.5), 0.10), 'npcwork_bare_steel', root)
    put(sphere('svy_pin_head', 0.48, (-1.1, -2.75, 0.5), seg=10, rings=6), 'npcwork_light_survey', root)
    # Gel drums for the printers, racked starboard — where a surveyor's real money lives.
    for i in range(3):
        put(cyl(f'svy_gel{i}', 0.35, 1.1, (-3.2 - i * 1.0, -1.55, -0.7), rot=(math.pi / 2, 0, 0),
                verts=10), 'npcwork_tank_shell', root)
    engine_block(root, 'svy_drive', (-8.3, 0, 0.1), 0.95, 2.8)
    nav_lights(root, 'svy_nav', (2.0, 1.4, 0.8), (2.0, -1.4, 0.8))
    socket('SOCKET_Scan_Pin', (-1.1, -2.75, 0.5), root)
    socket('SOCKET_Sensor_Dorsal', (-0.5, 0, 2.9), root)
    socket('SOCKET_Engine_Main', (-9.7, 0, 0.1), root)
    socket('SOCKET_Trail_Main', (-9.8, 0, 0.1), root)
    socket('SOCKET_Camera_Focus', (0, 0, 0.6), root)
    meta = {
        'role': 'surveyor', 'fiction': 'THE_WORKING_FLEET.md §8 / THE_WORKING_TRADES.md §1',
        'servesJobKind': 'surveyor', 'servesTrafficRole': 'surveyor',
        'signals': ['reading_the_dark (every phase but the dock)'],
        'workState': 'boom crabbed 90°, green pulse-ring off the pin, paddles feathering',
        'socketPurposes': {
            'SOCKET_Scan_Pin': 'pulse_ring origin; the pin the reaction keeps between you and the belly',
            'SOCKET_Sensor_Dorsal': 'scan-sweep lamp mount',
        },
        'lodPlan': 'LOD1: drop gel drums/instruments, keep spine+paddles+mast; LOD2: hull+spine line',
    }
    return root, meta


@register('liner_shuttle')
def build_liner_shuttle():
    """THE_WORKING_FLEET §9 — the one family allowed to be pretty. Window row =
    'people inside' at any range where a window row resolves at all."""
    root = root_of('liner_shuttle')
    # Long clean fuselage: cylinder + rounded nose + tapered tail. No greebles by law.
    put(cyl('lnr_fuselage', 2.6, 22.0, (0, 0, 0), rot=(0, math.pi / 2, 0), verts=22),
        'npcwork_hull_paint_bone', root)
    nose = sphere('lnr_nose', 2.6, (11.0, 0, 0), seg=18, rings=10)
    nose.scale = Vector((1.6, 1.0, 1.0))
    bpy.ops.object.transform_apply(scale=True)
    put(nose, 'npcwork_hull_paint_bone', root)
    put(cone('lnr_tail', 2.6, 1.3, 4.0, (-13.0, 0, 0), rot=(0, -math.pi / 2, 0), verts=22),
        'npcwork_hull_paint_bone', root)
    # Full-length lit cabin rows, both flanks — the only window row in the pack.
    put(box('lnr_windows_p', (20.0, 0.12, 0.42), (0.5, 2.62, 0.5)), 'npcwork_light_cabin', root)
    put(box('lnr_windows_s', (20.0, 0.12, 0.42), (0.5, -2.62, 0.5)), 'npcwork_light_cabin', root)
    # Operator's mark and accent line. Dignity is a brand.
    put(box('lnr_accent', (22.0, 0.10, 0.30), (0, 2.64, -0.6)), 'npcwork_hull_paint_teal', root)
    put(box('lnr_mark', (2.2, 0.14, 1.2), (7.5, 2.62, -0.2)), 'npcwork_id_plate', root)
    put(box('lnr_fin', (2.6, 0.3, 2.0), (-11.5, 0, 3.0), rot=(0, -0.35, 0)), 'npcwork_hull_paint_teal', root)
    # Drives faired into the tail: two nacelle pods held proud of the hull (round 1
    # authored them at ±2.4 on a radius-2.6 fuselage — swallowed whole, and the liner
    # read as a featureless capsule). Faired means SMOOTH, not invisible.
    for sy in (3.15, -3.15):
        put(box(f'lnr_pylon{sy:+.0f}', (3.0, 1.0, 0.5), (-10.0, sy * 0.72, -0.4)),
            'npcwork_hull_paint_bone', root)
        put(cyl(f'lnr_nacelle{sy:+.0f}', 1.05, 5.6, (-11.0, sy, -0.6), rot=(0, math.pi / 2, 0),
                verts=16), 'npcwork_hull_paint_bone', root)
        put(cyl(f'lnr_nacelle_glow{sy:+.0f}', 0.78, 0.3, (-13.8, sy, -0.6),
                rot=(0, math.pi / 2, 0), verts=16), 'npcwork_engine_glow', root)
    # Even dignity checks luggage: one universal container footprint, underslung.
    cargo_container(root, 'lnr_pannier', (1.0, 0, -3.1), size=(6.0, 2.6, 1.6),
                    role='npcwork_hull_paint_teal')
    cockpit_pod(root, 'lnr_flightdeck', (9.2, 0, 1.9), 2.6, 1.9, 1.0)
    nav_lights(root, 'lnr_nav', (9.5, 2.2, 0.8), (9.5, -2.2, 0.8))
    socket('SOCKET_Cargo_Ventral', (1.0, 0, -3.4), root)
    socket('SOCKET_Engine_Main', (-14.0, 2.4, -0.6), root)
    socket('SOCKET_Trail_Port', (-14.1, 2.4, -0.6), root)
    socket('SOCKET_Trail_Starboard', (-14.1, -2.4, -0.6), root)
    socket('SOCKET_Utility_Dorsal', (0, 0, 2.9), root)
    socket('SOCKET_Camera_Focus', (0, 0, 0.4), root)
    meta = {
        'role': 'passenger liner', 'fiction': 'THE_WORKING_FLEET.md §9',
        'servesJobKind': 'none (schedule IS the work)', 'servesTrafficRole': 'express / civilian transport',
        'signals': ['clean_burn (fast and level)', 'stacking (long flat buttered approach)'],
        'workState': 'none — a liner working looks like a liner cruising',
        'neverShows': 'external tools of any kind',
        'reference': 'assets/ships/massline_express_liner_v1/ (reference-only art)',
        'socketPurposes': {'SOCKET_Cargo_Ventral': 'baggage pannier transfer'},
        'lodPlan': 'LOD1: drop pannier frames/mark, keep windows; LOD2: fuselage+nacelles, windows as one strip',
    }
    return root, meta


@register('customs_cutter')
def build_customs_cutter():
    """THE_WORKING_FLEET §10 — authority without cartoon. The inspection frame reads
    at range as a ship wearing a judge's collar."""
    root = root_of('customs_cutter')
    # Wedge: wide aft body, narrow fore body, prow plate. Clean navy-arc paint.
    put(box('cst_body_aft', (9.0, 7.0, 2.6), (-4.0, 0, 0)), 'npcwork_hull_paint_navyarc', root)
    put(box('cst_body_fore', (8.0, 4.6, 2.1), (3.5, 0, -0.1)), 'npcwork_hull_paint_navyarc', root)
    put(box('cst_prow', (3.0, 2.4, 1.7), (8.8, 0, -0.2)), 'npcwork_hull_paint_navyarc', root)
    cockpit_pod(root, 'cst_bridge', (1.5, 0, 1.7), 2.8, 2.0, 1.0, role='npcwork_hull_paint_navyarc')
    # Dorsal sensor fin.
    put(box('cst_fin', (3.4, 0.3, 2.4), (-3.0, 0, 2.4), rot=(0, -0.25, 0)), 'npcwork_hull_paint_navyarc', root)
    put(box('cst_fin_tip', (1.2, 0.34, 0.4), (-1.9, 0, 3.6), rot=(0, -0.25, 0)), 'npcwork_light_authority', root)
    # The inspection frame: a squared emitter hoop held ahead of the nose on four struts.
    fx = 11.6
    for sy, sz in ((1.9, 1.9), (-1.9, 1.9), (1.9, -1.9), (-1.9, -1.9)):
        put(beam(f'cst_strut_{sy:+.0f}{sz:+.0f}', (9.8, sy * 0.55, sz * 0.45), (fx, sy, sz), 0.12),
            'npcwork_structural_alloy', root)
        put(box(f'cst_emitter_{sy:+.0f}{sz:+.0f}', (0.5, 0.5, 0.5), (fx, sy, sz)),
            'npcwork_light_authority', root)
    put(beam('cst_hoop_t', (fx, 1.9, 1.9), (fx, -1.9, 1.9), 0.14), 'npcwork_bare_steel', root)
    put(beam('cst_hoop_b', (fx, 1.9, -1.9), (fx, -1.9, -1.9), 0.14), 'npcwork_bare_steel', root)
    put(beam('cst_hoop_p', (fx, 1.9, 1.9), (fx, 1.9, -1.9), 0.14), 'npcwork_bare_steel', root)
    put(beam('cst_hoop_s', (fx, -1.9, 1.9), (fx, -1.9, -1.9), 0.14), 'npcwork_bare_steel', root)
    # Ventral boarding collar; flush hardpoint fairings (procedure, not menace).
    put(cyl('cst_collar', 1.1, 0.9, (-1.0, 0, -1.75), verts=16), 'npcwork_bare_steel', root)
    put(box('cst_fairing_p', (3.6, 1.2, 0.4), (-2.0, 2.6, 1.45)), 'npcwork_armor_plate', root)
    put(box('cst_fairing_s', (3.6, 1.2, 0.4), (-2.0, -2.6, 1.45)), 'npcwork_armor_plate', root)
    # Registry plates lit at all times: the hull that never hides its name takes yours.
    put(box('cst_registry_p', (2.6, 0.16, 1.0), (4.0, 2.36, 0.3)), 'npcwork_id_plate', root)
    put(box('cst_registry_s', (2.6, 0.16, 1.0), (4.0, -2.36, 0.3)), 'npcwork_id_plate', root)
    put(box('cst_authority_p', (6.0, 0.14, 0.3), (-3.0, 3.56, 0.6)), 'npcwork_light_authority', root)
    put(box('cst_authority_s', (6.0, 0.14, 0.3), (-3.0, -3.56, 0.6)), 'npcwork_light_authority', root)
    engine_block(root, 'cst_drive_p', (-9.2, 1.9, 0.1), 1.15, 3.2)
    engine_block(root, 'cst_drive_s', (-9.2, -1.9, 0.1), 1.15, 3.2)
    nav_lights(root, 'cst_nav', (8.8, 1.3, 0.7), (8.8, -1.3, 0.7))
    socket('SOCKET_Inspection_Front', (fx, 0, 0), root)
    socket('SOCKET_Dock_Ventral', (-1.0, 0, -2.2), root)
    socket('SOCKET_Sensor_Dorsal', (-1.9, 0, 3.6), root)
    socket('SOCKET_Engine_Main', (-10.9, 1.9, 0.1), root)
    socket('SOCKET_Trail_Main', (-11.0, -1.9, 0.1), root)
    socket('SOCKET_Camera_Focus', (0, 0, 0.6), root)
    meta = {
        'role': 'customs / interdiction', 'fiction': 'THE_WORKING_FLEET.md §10',
        'servesJobKind': 'patrol (law variant)', 'servesTrafficRole': 'customs (new); patrol_scan encounter surface',
        'signals': ['on_the_pin (regulated blue-white metronome)',
                    'inspection lock — sweep lamp STOPPED on the client'],
        'workState': 'inspection frame lit arc-blue, sweep locked instead of sweeping',
        'neverShows': 'cargo of any kind',
        'socketPurposes': {
            'SOCKET_Inspection_Front': 'inspection emitter frame center — scan-lock beam origin',
            'SOCKET_Dock_Ventral': 'boarding collar',
        },
        'lodPlan': 'LOD1: drop struts, keep hoop+fin; LOD2: wedge+fin silhouette',
    }
    return root, meta


@register('rescue_lifter')
def build_rescue_lifter():
    """THE_WORKING_FLEET §11 — half hospital, half crane. The only hull whose paint
    IS a signal, sanctioned because the point is being seen."""
    root = root_of('rescue_lifter')
    put(box('rsc_hull', (14.0, 6.4, 4.0), (-2.0, 0, 0)), 'npcwork_hull_paint_bone', root)
    # Forward casualty bay: wide soft-lit mouth with padded jaws (soft-dock white —
    # one vocabulary shared with the tug's cradle).
    put(box('rsc_bay', (5.0, 5.6, 3.4), (6.5, 0, 0)), 'npcwork_hull_paint_bone', root)
    put(box('rsc_bay_glow', (0.3, 4.2, 2.2), (9.05, 0, 0)), 'npcwork_light_flood', root)
    put(box('rsc_jaw_top', (2.6, 5.0, 0.5), (9.6, 0, 1.9), rot=(0, -0.3, 0)), 'npcwork_hull_paint_bone', root)
    put(box('rsc_jaw_bot', (2.6, 5.0, 0.5), (9.6, 0, -1.9), rot=(0, 0.3, 0)), 'npcwork_hull_paint_bone', root)
    put(box('rsc_jaw_pad_t', (2.65, 1.2, 0.54), (9.62, 0, 1.95), rot=(0, -0.3, 0)), 'npcwork_bare_steel', root)
    # Red-white identity bars, full flank, both sides — steady where the victim's alternates.
    for sy in (3.24, -3.24):
        for i in range(6):
            role = 'npcwork_light_distress' if i % 2 == 0 else 'npcwork_light_flood'
            put(box(f'rsc_bar_{sy:+.1f}_{i}', (2.1, 0.14, 0.7), (4.4 - i * 2.3, sy, 0.8)), role, root)
    # Dorsal grapple boom with basket stretcher cradle.
    put(cyl('rsc_boom_mast', 0.4, 2.4, (-1.0, 0, 3.0), verts=12), 'npcwork_structural_alloy', root)
    put(beam('rsc_boom_a', (-1.0, 0, 4.0), (2.4, 1.8, 4.6), 0.30), 'npcwork_hull_paint_bone', root)
    put(beam('rsc_boom_b', (2.4, 1.8, 4.6), (5.0, 2.2, 3.6), 0.24), 'npcwork_hull_paint_bone', root)
    for sy in (0.5, -0.5):
        put(beam(f'rsc_basket_rail{sy:+.1f}', (4.4, 2.2 + sy * 0.8, 3.0), (6.0, 2.2 + sy * 0.8, 3.0), 0.08),
            'npcwork_bare_steel', root)
    put(box('rsc_basket_floor', (1.7, 1.0, 0.12), (5.2, 2.2, 2.85)), 'npcwork_bare_steel', root)
    # Four mast floods that light a debris field like a work yard.
    for i, (mx, my) in enumerate(((2.0, 2.6), (2.0, -2.6), (-6.0, 2.6), (-6.0, -2.6))):
        put(cyl(f'rsc_floodmast{i}', 0.14, 1.8, (mx, my, 2.9), verts=8), 'npcwork_structural_alloy', root)
        flood_rig(root, f'rsc_flood{i}', (mx, my, 3.9), rot=(0, 0.7, 0.0 if my > 0 else math.pi),
                  scale=1.0)
    # Underslung triage pods: the universal container footprint, medical white.
    cargo_container(root, 'rsc_pod_p', (-3.0, 1.7, -2.7), size=(5.0, 2.2, 1.4),
                    role='npcwork_hull_paint_bone')
    cargo_container(root, 'rsc_pod_s', (-3.0, -1.7, -2.7), size=(5.0, 2.2, 1.4),
                    role='npcwork_hull_paint_bone')
    cockpit_pod(root, 'rsc_bridge', (3.9, 0, 2.6), 2.6, 2.0, 1.1)
    engine_block(root, 'rsc_drive_p', (-9.8, 2.0, 0.2), 1.3, 3.4)
    engine_block(root, 'rsc_drive_s', (-9.8, -2.0, 0.2), 1.3, 3.4)
    nav_lights(root, 'rsc_nav', (8.5, 2.9, 1.2), (8.5, -2.9, 1.2))
    socket('SOCKET_Bay_Front', (9.4, 0, 0), root)
    socket('SOCKET_Hoist_Dorsal', (5.2, 2.2, 3.4), root)
    socket('SOCKET_Cargo_Ventral', (-3.0, 0, -3.0), root)
    socket('SOCKET_Engine_Main', (-11.7, 2.0, 0.2), root)
    socket('SOCKET_Trail_Main', (-11.8, -2.0, 0.2), root)
    socket('SOCKET_Camera_Focus', (0, 0, 0.8), root)
    meta = {
        'role': 'rescue / emergency', 'fiction': 'THE_WORKING_FLEET.md §11',
        'servesJobKind': 'none yet (responder to breaking_the_pattern)', 'servesTrafficRole': 'rescue',
        'signals': ['responder code: red-white STEADY where the victim alternates',
                    'floods on approach — "we see you"'],
        'workState': 'bay mouth open and lit, grapple out, floods up, red-white steady',
        'costOfWrong': 'faking the lifter\'s bars is the one forgery every faction hangs for',
        'socketPurposes': {
            'SOCKET_Bay_Front': 'casualty intake — soft-dock target',
            'SOCKET_Hoist_Dorsal': 'stretcher basket / grapple line origin',
        },
        'lodPlan': 'LOD1: drop basket/floods masts, keep bars+bay; LOD2: hull+bay+bar strips',
    }
    return root, meta


@register('construction_rig')
def build_construction_rig():
    """THE_WORKING_FLEET §12 — the pack's big silhouette: an open truss spine with two
    tower cranes, prefab rack, habitat spool. Idle folds from 'site' to 'ship'."""
    root = root_of('construction_rig')
    # Twin-chord truss spine with real spanning diagonals (lane-furniture lesson:
    # diagonals must SPAN nodes or they scatter at render).
    for sz, tag in ((2.2, 't'), (-2.2, 'b')):
        put(box(f'rig_chord_{tag}', (44.0, 1.0, 1.0), (0, 0, sz)), 'npcwork_structural_alloy', root)
    for i in range(8):
        bx = 18.9 - i * 5.4
        put(beam(f'rig_post{i}', (bx, 0, -2.2), (bx, 0, 2.2), 0.22), 'npcwork_structural_alloy', root)
        if i < 7:
            put(beam(f'rig_diag{i}', (bx, 0, 2.2 if i % 2 == 0 else -2.2),
                     (bx - 5.4, 0, -2.2 if i % 2 == 0 else 2.2), 0.16), 'npcwork_structural_alloy', root)
    # Two tower cranes on traversing rings. Round 1 authored the rings at radius 1.9
    # against chords at ±2.2 — INSIDE the truss, reading as wheels; a traversing ring
    # must visibly encircle the structure it traverses.
    for ci, cx in enumerate((7.0, -6.0)):
        put(cyl(f'rig_ring{ci}', 3.2, 1.0, (cx, 0, 0), rot=(0, math.pi / 2, 0), verts=20),
            'npcwork_hazard_stripe', root)
        put(cyl(f'rig_crane_mast{ci}', 0.42, 7.0, (cx, 0.0, 5.0), verts=12), 'npcwork_structural_alloy', root)
        jib_y = 6.5 if ci == 0 else -6.5
        put(beam(f'rig_jib{ci}', (cx, 0, 8.3), (cx, jib_y, 7.2), 0.30), 'npcwork_hazard_stripe', root)
        put(beam(f'rig_jib_tie{ci}', (cx, 0, 8.6), (cx, jib_y * 0.6, 7.9), 0.10), 'npcwork_bare_steel', root)
        put(beam(f'rig_hoist_line{ci}', (cx, jib_y, 7.2), (cx, jib_y, 4.2), 0.08), 'npcwork_bare_steel', root)
        put(box(f'rig_hook{ci}', (1.2, 1.2, 1.3), (cx, jib_y, 3.5)), 'npcwork_hazard_stripe', root)
        flood_rig(root, f'rig_crane_fl{ci}', (cx, jib_y * 0.5, 7.6), rot=(0, 1.1, 0), scale=1.1)
    # Prefab truss segments loaded crossways: visible cargo, Guild law. Spaced and
    # alternated so they COUNT as segments at range instead of merging into one slab.
    for i in range(4):
        sz = 3.4 + i * 1.5
        w = 12.0 if i % 2 == 0 else 10.4
        seg = box(f'rig_prefab{i}', (2.0, w, 0.8), (1.5, 0, sz))
        put(seg, 'npcwork_hull_paint_ochre' if i % 2 else 'npcwork_tank_shell', root)
        put(box(f'rig_prefab_strap{i}', (2.1, 1.2, 0.85), (1.5, 0, sz)), 'npcwork_structural_alloy', root)
    # Habitat ring spool aft.
    put(cyl('rig_spool', 3.0, 3.2, (-16.5, 0, 0), rot=(math.pi / 2, 0, 0), verts=20),
        'npcwork_tank_shell', root)
    put(cyl('rig_spool_rim_p', 3.2, 0.4, (-16.5, 1.6, 0), rot=(math.pi / 2, 0, 0), verts=20),
        'npcwork_hazard_stripe', root)
    put(cyl('rig_spool_rim_s', 3.2, 0.4, (-16.5, -1.6, 0), rot=(math.pi / 2, 0, 0), verts=20),
        'npcwork_hazard_stripe', root)
    # Foreman's cab riding the spine like a railcar.
    put(box('rig_cab_rail', (6.0, 0.4, 0.3), (14.0, 1.0, 2.9)), 'npcwork_bare_steel', root)
    cockpit_pod(root, 'rig_cab', (14.0, 0.4, 3.8), 3.0, 2.2, 1.4, role='npcwork_hull_paint_ochre')
    flood_rig(root, 'rig_cab_fl', (15.8, 0.4, 3.6), rot=(0, 0.4, 0), scale=1.0)
    # Red lamps at the working ends; hazard on every crane throat (already striped).
    for ex in (21.6, -21.6):
        put(box(f'rig_end_lamp{ex:+.0f}', (0.4, 0.4, 0.4), (ex, 0, 2.6)), 'npcwork_light_distress', root)
    engine_block(root, 'rig_drive_p', (-20.0, 1.6, -1.2), 1.4, 3.8)
    engine_block(root, 'rig_drive_s', (-20.0, -1.6, -1.2), 1.4, 3.8)
    nav_lights(root, 'rig_nav', (21.0, 1.2, 0.5), (21.0, -1.2, 0.5))
    socket('SOCKET_Hoist_Main', (7.0, 6.5, 3.7), root)
    socket('SOCKET_Hoist_Aux', (-6.0, -6.5, 3.7), root)
    socket('SOCKET_Cargo_Dorsal', (1.5, 0, 4.4), root)
    socket('SOCKET_Engine_Main', (-22.2, 1.6, -1.2), root)
    socket('SOCKET_Trail_Main', (-22.3, -1.6, -1.2), root)
    socket('SOCKET_Utility_Dorsal', (14.0, 0.4, 5.0), root)
    socket('SOCKET_Camera_Focus', (0, 0, 1.5), root)
    meta = {
        'role': 'construction barge', 'fiction': 'THE_WORKING_FLEET.md §12',
        'servesJobKind': 'none yet (hull_open semantics at fleet scale)',
        'servesTrafficRole': 'construction (new); convoy_industrial_route poi family',
        'signals': ['hull_open (fleet scale)', 'on_the_pin (holding over the site)'],
        'workState': 'cranes traversed outboard, segment mid-hoist, weld stars, red corners',
        'idleState': 'cranes parked inboard — the silhouette folds from site to ship',
        'socketPurposes': {
            'SOCKET_Hoist_Main': 'primary crane hook — hoist VFX origin',
            'SOCKET_Hoist_Aux': 'second crane hook',
            'SOCKET_Cargo_Dorsal': 'prefab rack transfer point',
        },
        'lodPlan': 'LOD1: drop diagonals/lines/rails, keep chords+cranes+spool; LOD2: spine slab+two masts+spool',
    }
    return root, meta


# ---------------------------------------------------------------------------
# Export / measure / render machinery (shape shared with build_lane_furniture.py so review
# tooling and habits transfer).

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


def glb_generator_record(path):
    """Read the exact exporter generator string embedded in a GLB asset record."""
    raw = path.read_bytes()
    if len(raw) < 20 or raw[:4] != b'glTF':
        raise RuntimeError(f'not a GLB 2.0 file: {path}')
    json_len = int.from_bytes(raw[12:16], 'little')
    if raw[16:20] != b'JSON':
        raise RuntimeError(f'GLB JSON chunk missing: {path}')
    payload = json.loads(raw[20:20 + json_len].decode('utf-8').rstrip(' \t\r\n\x00'))
    return payload.get('asset', {}).get('generator', 'unknown')


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


def reset_render_cameras():
    for o in [o for o in bpy.data.objects if o.type in {'CAMERA', 'LIGHT'}]:
        bpy.data.objects.remove(o, do_unlink=True)


def setup_render(target, radius, distance=None):
    """Frame the craft. `distance` in world units puts the camera at a real R1 gameplay
    range: 95 WU is the always-visible edge at rest, 125 the normal moving-play edge,
    165 the physics-earned edge (CAMERA_VISIBLE_BUBBLE.md, 2026-08-08). A craft whose
    role is unreadable at 95-125 has failed regardless of how the turntable looks."""
    d = distance if distance is not None else radius * 2.2
    bpy.ops.object.camera_add(location=(d * 0.62, -d * 0.72, d * 0.44))
    cam = bpy.context.active_object
    cam.data.lens = 50   # game camera's 50-degree FOV class
    direction = Vector(target) - cam.location
    cam.rotation_euler = direction.to_track_quat('-Z', 'Y').to_euler()
    bpy.context.scene.camera = cam
    # Irradiance falls with distance SQUARED; round 1 scaled energy linearly and every
    # large craft (whose framing distance is large) rendered as mud while the small
    # ones looked fine. Calibrated against the lane-furniture reference exposure
    # (900 W looked right at d~8 => E = ~115 * d^2).
    e = max(1.0, d) ** 2
    bpy.ops.object.light_add(type='AREA', location=(d * 1.1, -d * 0.7, d * 1.2))
    key = bpy.context.active_object
    key.data.energy = 88 * e
    key.data.size = max(2.0, radius * 2.5)
    key.data.color = (1.0, 0.86, 0.68)
    bpy.ops.object.light_add(type='AREA', location=(-d * 1.0, d * 0.8, d * 0.45))
    fill = bpy.context.active_object
    fill.data.energy = 25 * e
    fill.data.size = max(2.0, radius * 3.0)
    fill.data.color = (0.55, 0.68, 1.0)
    # Rim from behind-above so a dark hull separates from the dark sky at any range.
    bpy.ops.object.light_add(type='AREA', location=(-d * 0.4, -d * 0.3, d * 1.5))
    rim = bpy.context.active_object
    rim.data.energy = 30 * e
    rim.data.size = max(2.0, radius * 2.0)
    rim.data.color = (0.75, 0.82, 1.0)
    scene = bpy.context.scene
    scene.render.engine = 'BLENDER_EEVEE'
    scene.render.resolution_x = 1100
    scene.render.resolution_y = 900
    scene.render.film_transparent = False
    scene.world = bpy.data.worlds.new('w')
    scene.world.use_nodes = True
    scene.world.node_tree.nodes['Background'].inputs[0].default_value = (0.035, 0.038, 0.05, 1)


# ---------------------------------------------------------------------------
# Gallery + lineup scenes. Render-only staging: the props (boulders, wreck slabs,
# work beams, scan rings) demonstrate each craft's ACTIVE WORK STATE in the preview
# without ever entering a GLB. The gallery is the pack's acceptance exhibit: all
# twelve trades at once, each doing its job.

GALLERY_IDS = [
    'prospector_skiff', 'ore_barge', 'volatiles_tanker', 'scrap_sweeper',
    'repair_tender', 'yard_tug', 'salvage_cutter', 'survey_pin',
    'liner_shuttle', 'customs_cutter', 'rescue_lifter', 'construction_rig',
]


def _prop_boulder(name, loc, r):
    """Authored irregular rock: three fused, differently-squashed lumps."""
    for i, (dx, dy, dz, sx, sy, sz) in enumerate((
            (0, 0, 0, 1.0, 0.85, 0.7), (r * 0.6, r * 0.3, -r * 0.2, 0.6, 0.7, 0.55),
            (-r * 0.5, -r * 0.35, r * 0.25, 0.55, 0.5, 0.6))):
        o = sphere(f'{name}_{i}', r, (loc[0] + dx, loc[1] + dy, loc[2] + dz), seg=12, rings=8)
        o.scale = Vector((sx, sy, sz))
        bpy.ops.object.transform_apply(scale=True)
        put(o, 'npcwork_ore_raw')


def _prop_beam(name, a, b, radius, role):
    put(beam(name, a, b, radius), role)


def _prop_slab(name, loc, size, rot=(0, 0, 0)):
    put(box(name, size, loc, rot), 'npcwork_scorch')


def _stage_props(cell):
    """Per-craft work staging, offsets in the craft's local frame (+X nose)."""
    def w(p):
        return (cell[0] + p[0], cell[1] + p[1], cell[2] + p[2])
    cid = cell[3]
    if cid == 'prospector_skiff':
        _prop_boulder('gal_psk_rock', w((16, -4, 0)), 3.4)
        _prop_beam('gal_psk_beam', w((9.9, -1.6, 1.4)), w((14.5, -3.4, 0.6)), 0.14,
                   'npcwork_light_mining')
    elif cid == 'ore_barge':
        _prop_boulder('gal_brg_rock', w((30, 6, -2)), 5.0)
    elif cid == 'volatiles_tanker':
        put(cyl('gal_tnk_mast', 0.5, 9.0, w((24, 0, 1)), verts=10), 'npcwork_structural_alloy')
        _prop_beam('gal_tnk_umb', w((17.9, 0, 1.2)), w((23.6, 0, 2.4)), 0.22,
                   'npcwork_light_flood')
    elif cid == 'scrap_sweeper':
        for i, (dx, dy) in enumerate(((12, 1.5), (14.5, -2), (11, -4))):
            _prop_slab(f'gal_swp_junk{i}', w((dx, dy, 0)), (1.2, 0.9, 0.7), rot=(0.4, 0.3 * i, 0.7))
    elif cid == 'repair_tender':
        _prop_slab('gal_tnd_hulkpanel', w((16, -8, 0)), (6.0, 0.5, 4.0), rot=(0.15, 0, 0.3))
        _prop_beam('gal_tnd_weld', w((11.4, -6.9, 1.3)), w((13.8, -7.6, 1.0)), 0.10,
                   'npcwork_light_repair')
    elif cid == 'yard_tug':
        cargo_container(None, 'gal_tug_client', w((13.5, 0, 0.4)), size=(7.0, 3.2, 3.2),
                        role='npcwork_hull_paint_teal')
    elif cid == 'salvage_cutter':
        _prop_slab('gal_sal_wreck', w((14, -5, -1)), (7.0, 3.0, 2.2), rot=(0.2, 0.5, 0.2))
        _prop_beam('gal_sal_arc', w((8.9, -2.5, 0.6)), w((11.8, -4.2, -0.2)), 0.12,
                   'npcwork_light_salvage')
    elif cid == 'survey_pin':
        bpy.ops.mesh.primitive_torus_add(location=w((-1.1, -8.5, 0.5)), major_radius=4.2,
                                         minor_radius=0.10, major_segments=28, minor_segments=6)
        ring = bpy.context.active_object
        ring.name = 'gal_svy_ring'
        put(ring, 'npcwork_light_survey')
    elif cid == 'customs_cutter':
        cargo_container(None, 'gal_cst_subject', w((22, 0, 0)), size=(6.0, 3.0, 3.0),
                        role='npcwork_hull_paint_teal')
        _prop_beam('gal_cst_scan', w((11.6, 0, 0)), w((18.9, 0, 0.2)), 0.10,
                   'npcwork_light_authority')
    elif cid == 'rescue_lifter':
        _prop_slab('gal_rsc_victim', w((16, 3, 0)), (5.0, 2.2, 1.8), rot=(0.3, 0.2, 0.6))
        _prop_beam('gal_rsc_line', w((5.2, 2.2, 3.4)), w((14.2, 3.0, 1.2)), 0.08,
                   'npcwork_light_flood')
    elif cid == 'construction_rig':
        put(box('gal_rig_lift', (2.0, 10.0, 0.8), w((7.0, 9.5, 1.8))), 'npcwork_tank_shell')
        _prop_beam('gal_rig_weld', w((7.0, 6.5, 3.4)), w((7.0, 9.0, 2.2)), 0.10,
                   'npcwork_light_repair')


def _label(text, loc):
    bpy.ops.object.text_add(location=loc, rotation=(math.pi / 2, 0, math.pi / 2))
    t = bpy.context.active_object
    t.data.body = text
    t.data.size = 3.4
    t.data.align_x = 'CENTER'
    t.name = f'label_{text}'
    put_text_material(t)
    return t


def put_text_material(t):
    mat = material('npcwork_light_flood')
    t.data.materials.clear()
    t.data.materials.append(mat)


def render_grid_scene(shot_path, staged, labels):
    """All twelve base craft in one 4x3 grid. staged=True adds each trade's work
    props; labels=True stamps craft ids under each cell (the identification sheet)."""
    reset_scene()
    cells = []
    for idx, cid in enumerate(GALLERY_IDS):
        col = idx % 4
        row = idx // 4
        cx = 40.0 - row * 62.0
        cy = 105.0 - col * 62.0
        cells.append((cx, cy, 0.0, cid))
    for (cx, cy, cz, cid) in cells:
        root, _meta = BUILDERS[cid]()
        root.location = Vector((cx, cy, cz))
        bpy.context.view_layer.update()
        if staged:
            _stage_props((cx, cy, cz, cid))
        if labels:
            _label(cid, (cx - 26.0, cy, -14.0))
    bpy.context.view_layer.update()
    setup_render((-30, 6, 0), 150.0)
    bpy.context.scene.render.resolution_x = 1920
    bpy.context.scene.render.resolution_y = 1400
    bpy.context.scene.render.filepath = str(shot_path)
    bpy.ops.render.render(write_still=True)
    log(f'wrote {shot_path.name}')


def main():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    ap = argparse.ArgumentParser()
    ap.add_argument('--render', action='store_true')
    ap.add_argument('--distances', action='store_true',
                    help='also render at 95/125/165 world units — the R1 gameplay bands')
    ap.add_argument('--gallery', action='store_true',
                    help='render the combined activity gallery scene')
    ap.add_argument('--only', default=None,
                    help='legacy single-craft selector; refused because the canonical report is full-pack')
    args = ap.parse_args(argv)

    if not bpy.app.background:
        raise SystemExit('npc activity pack authoring requires Blender --background')
    if args.only:
        if args.only not in BUILDERS:
            raise SystemExit(f'unknown craft id: {args.only}')
        raise SystemExit(
            '--only is intentionally refused: a partial build cannot revalidate or publish '
            'the canonical 15-asset report; run the full command instead'
        )

    report = {
        'schema': 'spaceface.npcActivityPack.v1',
        'provenance': {
            'builderPath': str(Path(__file__).resolve().relative_to(ROOT)).replace(chr(92), '/'),
            'builderSha256AtAssetGeneration': hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
            'blenderVersionAtAssetGeneration': bpy.app.version_string,
            'gltfGeneratorRecords': [],
            'canonicalFullBuildCommandForRevalidation': (
                'blender --background --factory-startup --python '
                'tools/blender/build_npc_activity_pack.py -- --render --distances --gallery'
            ),
            'byteReproducibilityStatus': (
                'unverified_until_two_full_builds_match_under_the_same_pinned_toolchain'
            ),
        },
        'assets': [],
    }
    exporter_generators = set()
    ids = list(BUILDERS.keys())
    for name in ids:
        if name not in BUILDERS:
            raise SystemExit(f'unknown craft id: {name}')
        reset_scene()
        root, meta = BUILDERS[name]()
        bpy.context.view_layer.update()
        lo, hi, size = envelope(root)
        tris = tri_count(root)
        # House collision convention: a single COLLISION_HULL EMPTY (a mesh fails the
        # assetLoader material-map contract — tools/blender/build_m4_helios_hub_family.py:1498).
        # Scale carries the recommended box half-extents so the proxy is machine-readable.
        center = (lo + hi) * 0.5
        bpy.ops.object.empty_add(type='CUBE', radius=1.0, location=tuple(center))
        chull = bpy.context.active_object
        chull.name = 'COLLISION_HULL'
        chull.scale = Vector((size.x * 0.5, size.y * 0.5, size.z * 0.5))
        chull['sf_collision'] = True
        chull.parent = root
        glb = OUT_SOURCE / f'{name}.glb'
        digest = export_glb(root, glb)
        exporter_generators.add(glb_generator_record(glb))
        entry = {
            'id': name,
            'status': 'design_candidate',
            'triangles': tris,
            'sizeM': [round(size.x, 3), round(size.y, 3), round(size.z, 3)],
            'parts': len([o for o in root.children_recursive if o.type == 'MESH']),
            'sockets': sorted(o.name for o in root.children_recursive
                              if o.type == 'EMPTY' and o.name.startswith('SOCKET_')),
            'collisionProxy': {'kind': 'box', 'centerM': [round(center.x, 3), round(center.y, 3),
                                                          round(center.z, 3)],
                               'halfExtentsM': [round(size.x * 0.5, 3), round(size.y * 0.5, 3),
                                                round(size.z * 0.5, 3)]},
            'bytes': glb.stat().st_size,
            'sha256': digest,
        }
        entry.update(meta)
        if args.render:
            OUT_EVIDENCE.mkdir(parents=True, exist_ok=True)
            radius = max(2.0, max(size.x, size.y, size.z))
            target = (0, 0, size.z * 0.25)
            setup_render(target, radius)
            shot = OUT_EVIDENCE / f'{name}.png'
            bpy.context.scene.render.filepath = str(shot)
            bpy.ops.render.render(write_still=True)
            entry['render'] = str(shot.relative_to(ROOT)).replace(chr(92), '/')
            if args.distances:
                for dist in (95, 125, 165):
                    reset_render_cameras()
                    setup_render(target, radius, distance=float(dist))
                    dshot = OUT_EVIDENCE / f'{name}@{dist}u.png'
                    bpy.context.scene.render.filepath = str(dshot)
                    bpy.ops.render.render(write_still=True)
                entry['distanceViews'] = [95, 125, 165]
        report['assets'].append(entry)
        log(f"{name}: {tris} tris, {entry['parts']} parts, "
            f"{entry['sizeM'][0]}x{entry['sizeM'][1]}x{entry['sizeM'][2]} m")

    report['provenance']['gltfGeneratorRecords'] = sorted(exporter_generators)
    OUT_EVIDENCE.mkdir(parents=True, exist_ok=True)
    (OUT_EVIDENCE / 'build-report.json').write_text(json.dumps(report, indent=2),
                                                   encoding='utf-8')
    log(f"wrote {len(report['assets'])} source GLBs to {OUT_SOURCE.relative_to(ROOT)}")

    if args.gallery:
        render_grid_scene(OUT_EVIDENCE / 'activity-gallery.png', staged=True, labels=False)
        render_grid_scene(OUT_EVIDENCE / 'role-identification-sheet.png', staged=False, labels=True)


if __name__ == '__main__':
    main()

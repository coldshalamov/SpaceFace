#!/usr/bin/env python3
"""Author the everyday-space infrastructure kit described in design/fiction/THE_COMMON_YARD.md.

SpaceFace has hero nouns (stations, asteroids, wrecks) and working verbs (the six job
kinds), but almost no fixed mid-scale plant between them — no racks, tanks, gantries,
pylons, pods or cages. This tool builds that connective tissue: ~40 base props plus
state variants across six families, so a composition lane can pour a believable
worksite around any hero noun. The audit that proves none of this duplicates a live
asset is assets/incubator/everyday_space_kit/evidence/EXISTING_COVERAGE.md.

SOURCE ONLY. Writes GLBs under assets/incubator/everyday_space_kit/source/ and evidence
under assets/incubator/everyday_space_kit/evidence/. No release artifact, no manifest
row, no runtime wiring; promotion belongs to whoever holds those exact paths later.

GEOMETRY DETERMINISM. Every dimension, lean, patch plate and missing panel is AUTHORED;
there is no RNG anywhere in this file. Variation between "identical" products comes from
authored per-variant specs. The report records builder hash, Blender version, exporter
generator and the canonical full-build command.

BYTE REPRODUCIBILITY. Blender 5.1.2's glTF exporter can emit identical vertices/JSON
but a different triangle index *order* across two clean runs (loop-triangle / primitive
serialization). Before every export we triangulate with FIXED/EAR_CLIP and rebuild each
mesh's faces in a pure function of (material_index, sorted vertex indices, winding).
Export selection is name-sorted. Two factory-startup builds must hash byte-identical.

MANUFACTURING STANDARDS (THE_COMMON_YARD.md §1) are implemented as shared assemblies:
the 6x3x3 Berth-standard pod (same footprint as the working fleet's container), the
1.2 m span-gauge truss bay, the yard mast, formed vessels with end domes and saddles,
and visible cable trunking. Reuse is deliberate — a shape that repeats is a shape the
player learns.

STATES ARE GEOMETRY (fiction §4): cold = stowed booms + dead lamps; abandoned =
subtraction (cargo gone, a panel missing, no light); damaged = authored bends + scorch;
faction-modified = non-matching materials on standard bones. Never an emissive recolor.

Usage:
    blender --background --factory-startup --python tools/blender/build_everyday_space_kit.py -- --render
    blender --background --factory-startup --python tools/blender/build_everyday_space_kit.py -- \
        --render --distances --sheets --compositions
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import sys
from pathlib import Path

import bmesh
import bpy
from mathutils import Euler, Vector

ROOT = Path(__file__).resolve().parents[2]
OUT_SOURCE = ROOT / 'assets' / 'incubator' / 'everyday_space_kit' / 'source'
OUT_EVIDENCE = ROOT / 'assets' / 'incubator' / 'everyday_space_kit' / 'evidence'

# 1 world unit = 1 m against the 28 m player hull (CAMERA_VISIBLE_BUBBLE.md). Props are
# yard plant: authored +Z up, +X = the principal working face where one exists.

# ---------------------------------------------------------------------------
# Material roles. One Principled BSDF per role, role name = material name — the same
# promotion contract as the npcwork_* pack. Mid-value working paint, never charcoal
# (art direction: industrial but not muddy).
#
# (r, g, b, roughness, metallic)
ROLES = {
    # structure
    'esk_struct_alloy':        (0.42, 0.43, 0.46, 0.50, 0.45),
    'esk_truss_galv':          (0.55, 0.56, 0.54, 0.45, 0.50),  # span-gauge lattice
    'esk_bare_steel':          (0.62, 0.63, 0.65, 0.35, 0.50),
    'esk_deck_grate':          (0.30, 0.31, 0.33, 0.70, 0.30),
    'esk_armor_plate':         (0.36, 0.38, 0.41, 0.60, 0.40),
    # family paint (fiction §3)
    'esk_paint_industrial_ochre': (0.58, 0.42, 0.18, 0.55, 0.20),
    'esk_paint_logistics_teal':   (0.16, 0.44, 0.46, 0.52, 0.20),
    'esk_paint_civic_bone':       (0.78, 0.74, 0.66, 0.48, 0.10),
    'esk_paint_authority_navy':   (0.20, 0.26, 0.44, 0.45, 0.30),
    'esk_paint_service_blue':     (0.28, 0.42, 0.60, 0.50, 0.20),
    'esk_paint_rust':             (0.46, 0.24, 0.14, 0.62, 0.25),
    # surfaces
    'esk_tank_shell':          (0.82, 0.80, 0.75, 0.30, 0.30),
    'esk_tank_insulation':     (0.85, 0.55, 0.20, 0.70, 0.05),
    'esk_pipe_steel':          (0.55, 0.56, 0.60, 0.35, 0.55),
    'esk_scorch':              (0.10, 0.09, 0.08, 0.80, 0.20),
    'esk_ore_raw':             (0.42, 0.34, 0.22, 0.90, 0.05),
    'esk_glass':               (0.12, 0.16, 0.20, 0.10, 0.20),
    'esk_solar_cell':          (0.08, 0.10, 0.22, 0.20, 0.30),
    'esk_id_plate':            (0.88, 0.86, 0.80, 0.45, 0.10),
    'esk_patch_plate':         (0.58, 0.48, 0.38, 0.60, 0.35),  # never color-matched
    # hazard
    'esk_hazard_stripe':       (0.85, 0.62, 0.10, 0.55, 0.10),
    'esk_hazard_volatile':     (0.72, 0.16, 0.10, 0.50, 0.10),
    # the light law (fiction §2) — light color IS the trade code
    'esk_light_flood':         (1.00, 0.94, 0.80, 0.30, 0.00),
    'esk_light_mining':        (1.00, 0.60, 0.16, 0.30, 0.00),
    'esk_light_repair':        (0.62, 0.85, 1.00, 0.30, 0.00),
    'esk_light_authority':     (0.30, 0.55, 1.00, 0.30, 0.00),
    'esk_light_nav_green':     (0.20, 1.00, 0.35, 0.30, 0.00),
    'esk_light_nav_red':       (1.00, 0.25, 0.20, 0.30, 0.00),
    'esk_light_cabin':         (1.00, 0.88, 0.70, 0.30, 0.00),
    'esk_light_signal_amber':  (1.00, 0.72, 0.20, 0.30, 0.00),
    'esk_light_hooded_red':    (0.95, 0.18, 0.12, 0.30, 0.00),  # criminal plant: dim
    'esk_radiator_hot':        (1.00, 0.50, 0.22, 0.40, 0.00),
}

# Above ~3 the tone mapper whites a color out and the trade code dies (proven on the
# npc pack's round-1 renders). Floods are the only white-by-design.
EMISSIVE_STRENGTH = {
    'esk_light_flood': 4.2,
    'esk_light_mining': 2.9,
    'esk_light_repair': 2.6,
    'esk_light_authority': 2.3,
    'esk_light_nav_green': 2.0,
    'esk_light_nav_red': 2.0,
    'esk_light_cabin': 1.8,
    'esk_light_signal_amber': 2.2,
    'esk_light_hooded_red': 1.1,   # light that does not want witnesses
    # 2.2, not 1.5: at 1.5 the review key light washed the hot cores to pastel salmon
    # (still safely under the ~3 white-out ceiling)
    'esk_radiator_hot': 2.2,
}


def log(msg):
    print(f'[everyday-space-kit] {msg}', flush=True)


def reset_scene():
    if not bpy.app.background:
        raise SystemExit('everyday space kit authoring requires Blender --background')
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
# Primitive helpers. Dimensions in metres. Direct .parent assignment reinterprets the
# object's current transform as LOCAL to the parent, so parts authored in a group's
# local frame snap into place when parented — that is relied on throughout.

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
    """A member that physically SPANS a->b (lane-furniture lesson: place-and-rotate
    drifts under compound rotations; span math cannot)."""
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


def spike(name, base, tipdir, r, length, verts=10):
    """Cone whose apex points along tipdir from base."""
    tipdir = Vector(tipdir).normalized()
    center = Vector(base) + tipdir * (length * 0.5)
    o = cone(name, r, 0.02, length, tuple(center), verts=verts)
    o.rotation_mode = 'QUATERNION'
    o.rotation_quaternion = tipdir.to_track_quat('Z', 'Y')
    return o


def socket(name, loc, parent, rot=(0, 0, 0)):
    """Named empty a wiring lane can attach VFX/props to. Exported into the GLB."""
    bpy.ops.object.empty_add(type='PLAIN_AXES', radius=0.5, location=loc, rotation=rot)
    o = bpy.context.active_object
    o.name = name
    o.parent = parent
    return o


def root_of(pid):
    bpy.ops.object.empty_add(type='PLAIN_AXES', radius=0.1, location=(0, 0, 0))
    o = bpy.context.active_object
    o.name = pid
    return o


def group(parent, name, loc, yaw=0.0):
    """Sub-frame for a rotated standard assembly (e.g. a pod on a rack at an angle)."""
    bpy.ops.object.empty_add(type='PLAIN_AXES', radius=0.1, location=loc,
                             rotation=(0, 0, yaw))
    g = bpy.context.active_object
    g.name = f'{name}_grp'
    if parent is not None:
        g.parent = parent
    return g


def join_objs(objs, name):
    """Merge a list of meshes into one object (keeps part counts honest on lattice
    work — a truss is one manufactured member, not forty)."""
    if not objs:
        raise RuntimeError(f'join_objs({name}): empty list')
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.join()
    j = bpy.context.view_layer.objects.active
    j.name = name
    return j


# ---------------------------------------------------------------------------
# Manufacturing standards (fiction §1) — the shared assemblies that make forty props
# read as one supply chain.

def truss(parent, name, a, b, w=1.2, h=1.2, r=0.07, role='esk_truss_galv', bay=1.2):
    """Span-gauge lattice member between two points: 4 chords + alternating diagonals
    on the two side faces, joined into ONE mesh."""
    a = Vector(a)
    b = Vector(b)
    d = b - a
    length = d.length
    n = d.normalized()
    up = Vector((0.0, 0.0, 1.0))
    if abs(n.dot(up)) > 0.92:
        up = Vector((1.0, 0.0, 0.0))
    side = n.cross(up).normalized()
    vup = side.cross(n).normalized()
    hw = side * (w * 0.5)
    hv = vup * (h * 0.5)
    parts = []
    for i, off in enumerate((hw + hv, hw - hv, -hw + hv, -hw - hv)):
        parts.append(beam(f'{name}_ch{i}', a + off, b + off, r))
    bays = max(1, int(round(length / bay)))
    for i in range(bays):
        p0 = a + d * (i / bays)
        p1 = a + d * ((i + 1) / bays)
        if i % 2 == 0:
            parts.append(beam(f'{name}_dga{i}', p0 + hw + hv, p1 + hw - hv, r * 0.85))
            parts.append(beam(f'{name}_dgb{i}', p0 - hw - hv, p1 - hw + hv, r * 0.85))
        else:
            parts.append(beam(f'{name}_dga{i}', p0 + hw - hv, p1 + hw + hv, r * 0.85))
            parts.append(beam(f'{name}_dgb{i}', p0 - hw + hv, p1 - hw - hv, r * 0.85))
    return put(join_objs(parts, name), role, parent)


def pod_unit(parent, name, loc, yaw=0.0, role='esk_paint_logistics_teal'):
    """The Berth-standard pod: 6x3x3 end-framed container, long axis = X before yaw.
    Same footprint as the working fleet's shared cargo container — one standard."""
    g = group(parent, name, loc, yaw)
    put(box(f'{name}_body', (6.0, 3.0, 3.0), (0, 0, 0)), role, g)
    put(box(f'{name}_endf', (0.25, 3.2, 3.2), (2.9, 0, 0)), 'esk_struct_alloy', g)
    put(box(f'{name}_enda', (0.25, 3.2, 3.2), (-2.9, 0, 0)), 'esk_struct_alloy', g)
    casts = []
    for i, (cx, cy, cz) in enumerate((
            (2.85, 1.5, 1.4), (2.85, -1.5, 1.4), (-2.85, 1.5, 1.4), (-2.85, -1.5, 1.4),
            (2.85, 1.5, -1.4), (2.85, -1.5, -1.4), (-2.85, 1.5, -1.4), (-2.85, -1.5, -1.4))):
        casts.append(box(f'{name}_cast{i}', (0.42, 0.4, 0.4), (cx, cy, cz)))
    put(join_objs(casts, f'{name}_casts'), 'esk_bare_steel', g)
    put(box(f'{name}_railp', (5.4, 0.16, 0.14), (0, 1.42, 1.56)), 'esk_bare_steel', g)
    put(box(f'{name}_rails', (5.4, 0.16, 0.14), (0, -1.42, 1.56)), 'esk_bare_steel', g)
    # -Y: the review camera and the +X-working-face convention both look at -Y/+X;
    # round 1 put identity marks on +Y and every one of them was invisible.
    put(box(f'{name}_plate', (1.3, 0.05, 0.8), (1.7, -1.55, 0.2)), 'esk_id_plate', g)
    return g


def vessel(parent, name, loc, r, length, rot=(0, math.pi / 2, 0), role='esk_tank_shell',
           saddles=True):
    """Formed pressure vessel: cylinder + two end domes (+ cradle saddles below).
    Nothing volatile ships in a box (fiction §1)."""
    axis = Euler(rot).to_matrix() @ Vector((0, 0, 1))
    put(cyl(f'{name}_shell', r, length, loc, rot=rot, verts=18), role, parent)
    for tag, s in (('f', 1.0), ('a', -1.0)):
        end = Vector(loc) + axis * (length * 0.5 * s)
        put(sphere(f'{name}_dome{tag}', r * 0.98, tuple(end), seg=14, rings=8), role, parent)
    if saddles:
        for tag, s in (('f', 0.3), ('a', -0.3)):
            sp = Vector(loc) + axis * (length * s)
            put(box(f'{name}_saddle{tag}', (r * 1.7, r * 2.3, 0.35),
                    (sp.x, sp.y, loc[2] - r - 0.15)), 'esk_struct_alloy', parent)


def mast_std(parent, name, base, h, w=0.9):
    """The yard mast: lattice column, hazard band at the foot, equipment table at the
    head. Floods, sensors, signals and pirate ears are fittings on this one standard.
    Returns the head-table top location."""
    truss(parent, f'{name}_col', base, (base[0], base[1], base[2] + h), w=w, h=w, r=0.06)
    put(box(f'{name}_foot', (w * 2.2, w * 2.2, 0.5),
            (base[0], base[1], base[2] + 0.25)), 'esk_hazard_stripe', parent)
    put(box(f'{name}_head', (w * 1.8, w * 1.8, 0.3),
            (base[0], base[1], base[2] + h + 0.15)), 'esk_struct_alloy', parent)
    return (base[0], base[1], base[2] + h + 0.3)


def flood(parent, name, loc, rot=(0, 0, 0), role='esk_light_flood', scale=1.0, mount=None):
    """Practical work light: housing + emissive face. Lens faces +X before rot.
    `mount` draws a bracket beam from structure to the housing — round 1 proved a
    flood with no bracket reads as a floating cube, on five different assets."""
    if mount is not None:
        put(beam(f'{name}_bracket', mount, loc, 0.07 * max(0.7, scale)),
            'esk_struct_alloy', parent)
    put(box(f'{name}_housing', (0.35 * scale, 0.5 * scale, 0.4 * scale), loc, rot),
        'esk_struct_alloy', parent)
    lens_loc = Vector(loc) + Euler(rot).to_matrix() @ Vector((0.14 * scale, 0, 0))
    put(box(f'{name}_lens', (0.12 * scale, 0.4 * scale, 0.3 * scale),
            tuple(lens_loc), rot), role, parent)


def strobe(parent, name, loc, role, r=0.22):
    put(sphere(name, r, loc, seg=10, rings=6), role, parent)


def trunk(parent, name, pts, r=0.09):
    """Cable trunking along waypoints — power never teleports (fiction §1)."""
    parts = []
    for i in range(len(pts) - 1):
        parts.append(beam(f'{name}_{i}', pts[i], pts[i + 1], r, verts=6))
    put(join_objs(parts, name), 'esk_pipe_steel', parent)


def dish_unit(parent, name, loc, r, rot=(0, 0, 0), role='esk_struct_alloy'):
    """Comms/sensor dish: shallow truncated cone + feed boom + head."""
    put(cone(f'{name}_dish', r, r * 0.25, r * 0.32, loc, rot=rot, verts=20), role, parent)
    ax = Euler(rot).to_matrix() @ Vector((0, 0, 1))
    tip = Vector(loc) + ax * (r * 0.95)
    put(beam(f'{name}_feed', loc, tuple(tip), 0.06), 'esk_bare_steel', parent)
    put(sphere(f'{name}_lnb', 0.14, tuple(tip), seg=8, rings=6), 'esk_bare_steel', parent)


def hoop_rect(parent, name, center, w, h, r=0.12, role='esk_struct_alloy', open_top=False):
    """Rectangular rib hoop in the Y-Z plane at center (a station rib section).
    open_top=True skips the top edge — a cradle saddle, not a picture frame."""
    cx, cy, cz = center
    pts = ((cx, cy - w / 2, cz + h / 2), (cx, cy - w / 2, cz - h / 2),
           (cx, cy + w / 2, cz - h / 2), (cx, cy + w / 2, cz + h / 2))
    parts = []
    edges = 3 if open_top else 4
    for i in range(edges):
        a = pts[i]
        b = pts[(i + 1) % 4]
        parts.append(beam(f'{name}_e{i}', a, b, r))
    return put(join_objs(parts, name), role, parent)


def railing(parent, name, a, b, h=1.1, role='esk_bare_steel'):
    a = Vector(a)
    b = Vector(b)
    parts = [beam(f'{name}_rail', (a.x, a.y, a.z + h), (b.x, b.y, b.z + h), 0.05)]
    parts.append(beam(f'{name}_p0', tuple(a), (a.x, a.y, a.z + h), 0.05))
    parts.append(beam(f'{name}_p1', tuple(b), (b.x, b.y, b.z + h), 0.05))
    put(join_objs(parts, name), role, parent)


def ore_lumps(parent, name, loc, r, role='esk_ore_raw'):
    """Visible bulk: three flattened lumps proud of a rim."""
    for i, (dx, dy, s) in enumerate(((0.0, 0.0, 1.0), (r * 0.55, r * 0.35, 0.62),
                                     (-r * 0.5, -r * 0.4, 0.5))):
        m = sphere(f'{name}_{i}', r * s, (loc[0] + dx, loc[1] + dy, loc[2]), seg=10, rings=6)
        m.scale = Vector((1.0, 1.0, 0.45))
        bpy.ops.object.transform_apply(scale=True)
        put(m, role, parent)


# ---------------------------------------------------------------------------
# Registration: builders return (root, meta); meta feeds the report and catalog.

BUILDERS = {}


def register(pid):
    def deco(fn):
        BUILDERS[pid] = fn
        return fn
    return deco


# ===========================================================================
# FAMILY 1 — CARGO & LOGISTICS (fiction §5.1). Logistics teal; the pod standard.

@register('cargo_pod_standard')
def build_cargo_pod_standard():
    root = root_of('cargo_pod_standard')
    pod_unit(root, 'pod', (0, 0, 0))
    socket('SOCKET_Clamp_Dorsal', (0, 0, 1.6), root)
    socket('SOCKET_Hoist_Center', (0, 0, 0), root)
    meta = {
        'family': 'cargo', 'role': 'Berth-standard 6x3x3 freight pod — the unit of this economy',
        'states': 'active=racked/clamped; abandoned=drifting loose; see _breached variant',
        'placement': 'racks, hauler spines, platform decks, customs cradles — everywhere',
        'lodPlan': 'LOD1: body+end frames; LOD2: single box',
    }
    return root, meta


@register('cargo_pod_hazmat')
def build_cargo_pod_hazmat():
    root = root_of('cargo_pod_hazmat')
    g = pod_unit(root, 'pod', (0, 0, 0), role='esk_tank_shell')
    for tag, bx in (('f', 1.2), ('a', -1.2)):
        put(box(f'band{tag}', (0.5, 3.06, 3.06), (bx, 0, 0)), 'esk_hazard_volatile', g)
    # diamond placard: square spun 45 deg in the plane of the side face
    put(box('placard', (0.7, 0.06, 0.7), (0, -1.54, 0.2), rot=(0, math.pi / 4, 0)),
        'esk_hazard_volatile', g)
    put(sphere('relief_f', 0.35, (0.8, 0, 1.6), seg=10, rings=6), 'esk_pipe_steel', g)
    put(sphere('relief_a', 0.35, (-0.8, 0, 1.6), seg=10, rings=6), 'esk_pipe_steel', g)
    socket('SOCKET_Clamp_Dorsal', (0, 0, 1.6), root)
    meta = {
        'family': 'cargo', 'role': 'volatile-cargo pod: white shell, red banding, relief domes',
        'states': 'as cargo_pod_standard; hazard read must survive LOD1',
        'placement': 'tanker couplings, refinery aprons, NEVER inside habitat clusters',
        'lodPlan': 'LOD1: body+bands; LOD2: single box (bands baked to texture)',
    }
    return root, meta


@register('cargo_pod_standard_breached')
def build_cargo_pod_standard_breached():
    """Damaged state: torn side, dead pod, spilled cargo. Abandonment is subtraction."""
    root = root_of('cargo_pod_standard_breached')
    g = pod_unit(root, 'pod', (0, 0, 0))
    put(box('breach', (2.2, 0.18, 1.7), (-0.6, -1.5, -0.2)), 'esk_scorch', g)
    # torn metal reads as scorch/steel, not pale board (round 1: "cardboard flaps")
    put(box('flap_a', (1.1, 0.09, 0.9), (-1.7, -1.85, 0.1), rot=(0.55, 0.1, 0.35)),
        'esk_scorch', g)
    put(box('flap_b', (0.9, 0.09, 0.8), (0.4, -1.9, -0.6), rot=(-0.4, 0.2, -0.5)),
        'esk_bare_steel', g)
    put(box('streak_a', (1.8, 0.06, 0.5), (-0.4, -1.53, 0.75), rot=(0, 0, 0.18)),
        'esk_scorch', g)
    put(box('streak_b', (1.2, 0.06, 0.35), (0.9, -1.53, -1.0), rot=(0, 0, -0.3)),
        'esk_scorch', g)
    for i, (dx, dy, dz, rr, s) in enumerate((
            (-0.8, -3.3, -0.7, 0.5, 0.95), (0.7, -3.9, 0.5, 1.1, 0.6),
            (-2.3, -4.4, -1.5, 1.9, 0.5))):
        put(box(f'spill{i}', (s, s * 0.85, s * 0.7), (dx, dy, dz), rot=(rr, rr * 1.7, rr * 0.6)),
            'esk_patch_plate', g)
    meta = {
        'family': 'cargo', 'role': 'breached pod: torn flank, spilled crates, no lights',
        'states': 'this IS the damaged state of cargo_pod_standard',
        'placement': 'wreck fields, salvage yards, pirate ambush sites',
        'lodPlan': 'LOD1: drop spill crates; LOD2: single box',
    }
    return root, meta


@register('ore_bulk_container')
def build_ore_bulk_container():
    root = root_of('ore_bulk_container')
    put(box('floor', (10.0, 5.0, 0.35), (0, 0, -1.85)), 'esk_struct_alloy', root)
    put(box('wall_f', (0.35, 5.0, 4.0), (4.85, 0, 0)), 'esk_paint_industrial_ochre', root)
    put(box('wall_a', (0.35, 5.0, 4.0), (-4.85, 0, 0)), 'esk_paint_industrial_ochre', root)
    put(box('wall_p', (10.0, 0.35, 4.0), (0, 2.35, 0)), 'esk_paint_industrial_ochre', root)
    put(box('wall_s', (10.0, 0.35, 4.0), (0, -2.35, 0)), 'esk_paint_industrial_ochre', root)
    put(box('rim', (10.2, 0.4, 0.2), (0, 2.35, 2.05)), 'esk_hazard_stripe', root)
    put(box('rim_s', (10.2, 0.4, 0.2), (0, -2.35, 2.05)), 'esk_hazard_stripe', root)
    put(box('rub_p', (10.2, 0.25, 0.25), (0, 2.45, -1.9)), 'esk_bare_steel', root)
    put(box('rub_s', (10.2, 0.25, 0.25), (0, -2.45, -1.9)), 'esk_bare_steel', root)
    # two spread clusters so the load FILLS the box (round 1: one centered egg)
    ore_lumps(root, 'ore_a', (-2.2, 0.3, 1.55), 2.1)
    ore_lumps(root, 'ore_b', (2.4, -0.4, 1.7), 2.3)
    put(box('plate', (1.6, 0.05, 0.9), (2.6, -2.55, 0.6)), 'esk_id_plate', root)
    socket('SOCKET_Hoist_Center', (0, 0, 2.2), root)
    meta = {
        'family': 'cargo', 'role': 'open-top bulk ore box, load proud of the rim (show your mass)',
        'states': 'active=ore mound present; abandoned=empty box (subtraction)',
        'placement': 'mining worksites, conveyor discharge, barge loading aprons',
        'lodPlan': 'LOD1: box+ore as one; LOD2: single box',
    }
    return root, meta


@register('container_rack')
def build_container_rack():
    root = root_of('container_rack')
    # legs run past the top tier — round 1 ended them at 4.0 and the third-level pod
    # floated above the frame holding nothing
    for sx in (6.2, -6.2):
        for sy in (3.6, -3.6):
            truss(root, f'leg_{"f" if sx>0 else "a"}{"p" if sy>0 else "s"}',
                  (sx, sy, -4.0), (sx, sy, 6.8), w=1.0, h=1.0, r=0.08)
    for sz in (-3.6, 0.0, 3.6, 6.8):
        truss(root, f'rail_p{int(sz)}', (-6.2, 3.6, sz), (6.2, 3.6, sz), w=0.8, h=0.8, r=0.07)
        truss(root, f'rail_s{int(sz)}', (-6.2, -3.6, sz), (6.2, -3.6, sz), w=0.8, h=0.8, r=0.07)
    # five pods, ONE deliberately empty bay — a working rack, not a showroom
    pod_unit(root, 'pod0', (-3.2, 0, -2.2))
    pod_unit(root, 'pod1', (3.2, 0, -2.2))
    pod_unit(root, 'pod2', (-3.2, 0, 1.4))
    pod_unit(root, 'pod3', (3.2, 0, 1.4), role='esk_tank_shell')
    pod_unit(root, 'pod4', (-3.2, 0, 5.0))
    for i, bx in enumerate((-3.2, 3.2)):
        put(box(f'baylamp{i}_h', (0.3, 0.4, 0.3), (bx, -3.6, 7.35)), 'esk_struct_alloy', root)
        put(box(f'baylamp{i}_l', (0.24, 0.3, 0.1), (bx, -3.6, 7.12)), 'esk_light_flood', root)
    strobe(root, 'bay_free', (3.2, -3.6, 7.45), 'esk_light_nav_green', r=0.18)
    put(box('plate', (2.2, 0.06, 1.0), (0, -4.03, 3.6)), 'esk_id_plate', root)
    socket('SOCKET_Bay_Free', (3.2, 0, 5.0), root)
    socket('SOCKET_Approach', (0, 8.0, 0), root)
    meta = {
        'family': 'cargo', 'role': 'six-bay pod rack; the lit green bay says "space available"',
        'states': 'active=pods+bay lamps; see _abandoned variant',
        'placement': 'station aprons, freight platforms, trade corridors',
        'lodPlan': 'LOD1: rails as boxes, pods keep; LOD2: filled box block',
    }
    return root, meta


@register('container_rack_abandoned')
def build_container_rack_abandoned():
    """Abandoned = subtraction: no pods, no lamps, one leg buckled, one rail fallen."""
    root = root_of('container_rack_abandoned')
    for sx, sy, tag in ((6.2, 3.6, 'fp'), (6.2, -3.6, 'fs'), (-6.2, -3.6, 'as')):
        truss(root, f'leg_{tag}', (sx, sy, -4.0), (sx, sy, 6.8), w=1.0, h=1.0, r=0.08)
    # the buckled leg: two segments with an authored kink (never scaled noise)
    truss(root, 'leg_ap_lo', (-6.2, 3.6, -4.0), (-5.6, 4.3, 0.2), w=1.0, h=1.0, r=0.08)
    truss(root, 'leg_ap_hi', (-5.6, 4.3, 0.2), (-6.2, 3.6, 5.4), w=1.0, h=1.0, r=0.08)
    for sz in (-3.6, 0.0):
        truss(root, f'rail_p{int(sz)}', (-6.2, 3.6, sz), (6.2, 3.6, sz), w=0.8, h=0.8, r=0.07)
        truss(root, f'rail_s{int(sz)}', (-6.2, -3.6, sz), (6.2, -3.6, sz), w=0.8, h=0.8, r=0.07)
    truss(root, 'rail_s_top', (-6.2, -3.6, 3.6), (6.2, -3.6, 3.6), w=0.8, h=0.8, r=0.07)
    truss(root, 'rail_s_crown', (-6.2, -3.6, 6.8), (6.2, -3.6, 6.8), w=0.8, h=0.8, r=0.07)
    # the top port rail tore free and hangs
    truss(root, 'rail_fallen', (-6.2, 3.6, 3.6), (4.0, 3.2, 0.8), w=0.8, h=0.8, r=0.07)
    # burn at the failure point ON the kink joint (round 1: it floated in mid-air)
    put(box('scorch', (1.1, 1.1, 1.3), (-5.6, 4.3, 0.2), rot=(0, 0.2, 0.1)), 'esk_scorch', root)
    put(box('plate', (2.2, 0.06, 1.0), (0, -4.03, 3.6)), 'esk_patch_plate', root)
    meta = {
        'family': 'cargo', 'role': 'stripped dead rack: cargo gone, lamps gone, one leg buckled',
        'states': 'this IS the abandoned state of container_rack',
        'placement': 'derelict claims, pirate fringes, decayed trade corridors',
        'lodPlan': 'LOD1: keep silhouette incl. fallen rail; LOD2: open frame box',
    }
    return root, meta


@register('transfer_arm')
def build_transfer_arm():
    root = root_of('transfer_arm')
    put(cyl('slew', 2.2, 1.6, (0, 0, 0.8), verts=20), 'esk_struct_alloy', root)
    put(box('slew_hazard', (4.6, 4.6, 0.3), (0, 0, 0.1)), 'esk_hazard_stripe', root)
    # alloy post: round 1's teal cylinder read as a glass water column, and the crane
    # lost its industrial identity; teal moves to the counterweight instead
    put(cyl('post', 0.9, 4.0, (0, 0, 3.6), verts=14), 'esk_struct_alloy', root)
    put(box('post_cap', (1.5, 1.5, 0.7), (0, 0, 5.75)), 'esk_struct_alloy', root)
    put(box('counter', (3.0, 2.0, 1.6), (-2.4, 0, 5.35)), 'esk_paint_logistics_teal', root)
    put(beam('counter_tie', (-0.9, 0, 5.6), (0, 0, 5.6), 0.18), 'esk_bare_steel', root)
    truss(root, 'boom_a', (0.0, 0, 5.6), (8.5, 0, 9.5), w=1.0, h=1.0, r=0.06)
    truss(root, 'boom_b', (8.5, 0, 9.5), (15.5, 0, 6.5), w=0.8, h=0.8, r=0.05)
    put(beam('hyd_a', (1.8, 0.7, 1.8), (6.0, 0.4, 8.0), 0.14), 'esk_pipe_steel', root)
    put(beam('hyd_b', (8.5, -0.5, 9.2), (12.4, -0.3, 7.6), 0.11), 'esk_pipe_steel', root)
    put(box('head', (1.8, 1.8, 1.0), (15.5, 0, 5.8)), 'esk_bare_steel', root)
    # fingers curl INWARD (round 1's sign error splayed them out — a dangling stool)
    for i, (fy, fx) in enumerate(((0.55, 0.55), (0.55, -0.55), (-0.55, 0.55), (-0.55, -0.55))):
        put(box(f'finger{i}', (0.24, 0.24, 1.4), (15.5 + fx, fy, 4.9),
                rot=(-fy * 0.45, fx * 0.45, 0)), 'esk_bare_steel', root)
    flood(root, 'head_flood', (15.5, 0, 5.4), rot=(0, math.pi / 2 * 0.85, 0), scale=0.9)
    strobe(root, 'elbow_strobe', (8.5, 0, 10.2), 'esk_light_signal_amber', r=0.2)
    socket('SOCKET_Grapple', (15.5, 0, 4.6), root)
    socket('SOCKET_Slew_Base', (0, 0, 0), root)
    meta = {
        'family': 'cargo', 'role': 'slew-ring cargo crane, two-segment boom, four-finger grapple',
        'states': 'active=boom out+flood on; cold=boom parked over counterweight (pose at instancing)',
        'placement': 'freight platforms, refinery aprons, dock edges — reach must overlap a rack',
        'lodPlan': 'LOD1: booms as boxes; LOD2: post+single bent box',
    }
    return root, meta


@register('tanker_coupling')
def build_tanker_coupling():
    root = root_of('tanker_coupling')
    put(box('base', (8.0, 6.0, 0.6), (0, 0, 0.3)), 'esk_deck_grate', root)
    put(box('base_hazard', (8.2, 0.4, 0.25), (0, 3.0, 0.65)), 'esk_hazard_volatile', root)
    for i, py in enumerate((-1.6, 0.0, 1.6)):
        put(cyl(f'riser{i}', 0.35, 5.0, (-2.4, py, 3.1), verts=12), 'esk_pipe_steel', root)
        put(cyl(f'valve{i}', 0.55, 0.25, (-2.4, py, 4.2), rot=(0, math.pi / 2, 0), verts=12),
            'esk_bare_steel', root)
        put(cyl(f'wrap{i}', 0.42, 1.6, (-2.4, py, 2.0), verts=12), 'esk_tank_insulation', root)
    put(box('manifold', (1.6, 4.4, 1.0), (-2.4, 0, 5.9)), 'esk_struct_alloy', root)
    put(beam('boom', (-2.0, 0, 6.3), (4.4, 0, 7.4), 0.22), 'esk_struct_alloy', root)
    put(beam('hose_a', (4.4, 0, 7.2), (6.4, 0, 5.6), 0.26), 'esk_tank_insulation', root)
    put(beam('hose_b', (6.4, 0, 5.6), (7.2, 0, 3.6), 0.26), 'esk_tank_insulation', root)
    put(cyl('coupler', 0.5, 0.7, (7.2, 0, 3.1), verts=12), 'esk_bare_steel', root)
    put(box('drip_shield', (2.6, 2.2, 0.15), (6.8, 0, 1.2)), 'esk_armor_plate', root)
    put(beam('shield_strut_p', (6.2, 0.8, 0.6), (6.8, 0.8, 1.12), 0.08), 'esk_struct_alloy', root)
    put(beam('shield_strut_s', (6.2, -0.8, 0.6), (6.8, -0.8, 1.12), 0.08), 'esk_struct_alloy', root)
    strobe(root, 'top_strobe', (-2.4, 0, 6.7), 'esk_light_nav_red', r=0.2)
    flood(root, 'coupler_flood', (4.0, 1.6, 6.6), rot=(0, 0.9, -0.5), scale=0.8)
    socket('SOCKET_Coupler', (7.2, 0, 2.7), root)
    socket('SOCKET_Berth_Tanker', (12.0, 0, 3.0), root)
    meta = {
        'family': 'cargo', 'role': 'volatile transfer manifold: risers, insulated hose boom, drip shield',
        'states': 'active=flood lit, hose down to coupler; cold=hose racked vertical (re-pose)',
        'placement': 'refinery flanks, fuel depots; berth socket marks where the tanker holds',
        'lodPlan': 'LOD1: merge risers; LOD2: base+tower box',
    }
    return root, meta


@register('freight_platform')
def build_freight_platform():
    root = root_of('freight_platform')
    put(box('deck', (26.0, 14.0, 0.5), (0, 0, 0)), 'esk_deck_grate', root)
    put(box('deck_frame', (26.4, 14.4, 0.6), (0, 0, -0.55)), 'esk_struct_alloy', root)
    put(box('edge_hazard', (26.0, 0.5, 0.2), (0, -7.0, 0.35)), 'esk_hazard_stripe', root)
    for sx in (-9.0, 0.0, 9.0):
        for sy in (4.5, -4.5):
            truss(root, f'rackpost_{int(sx)}_{"p" if sy>0 else "s"}',
                  (sx, sy, 0.3), (sx, sy, 4.3), w=0.7, h=0.7, r=0.05)
    truss(root, 'rackrail_p', (-9.0, 4.5, 4.3), (9.0, 4.5, 4.3), w=0.6, h=0.6, r=0.05)
    truss(root, 'rackrail_s', (-9.0, -4.5, 4.3), (9.0, -4.5, 4.3), w=0.6, h=0.6, r=0.05)
    pod_unit(root, 'pod0', (-4.5, 4.5, 1.9))
    pod_unit(root, 'pod1', (4.5, 4.5, 1.9), role='esk_tank_shell')
    pod_unit(root, 'pod2', (-4.5, -4.5, 1.9))
    cab = group(root, 'cab', (10.5, -5.0, 1.55))
    put(box('cab_body', (4.0, 3.0, 2.6), (0, 0, 0)), 'esk_paint_civic_bone', cab)
    put(box('cab_glass', (0.2, 2.2, 1.0), (2.0, 0, 0.4)), 'esk_glass', cab)
    put(box('cab_glow', (0.08, 1.8, 0.7), (2.06, 0, 0.4)), 'esk_light_cabin', cab)
    for mx, my in ((-12.0, 6.0), (12.0, 6.0)):
        head = mast_std(root, f'mast{int(mx)}', (mx, my, 0.25), 8.0, w=0.8)
        flood(root, f'mast{int(mx)}_fl', (head[0], head[1] - 0.3, head[2] + 0.3),
              rot=(0, 0.95, -math.pi / 2), scale=1.1)
    strobe(root, 'nav_g', (13.0, -7.0, 0.6), 'esk_light_nav_green', r=0.2)
    strobe(root, 'nav_r', (-13.0, -7.0, 0.6), 'esk_light_nav_red', r=0.2)
    socket('SOCKET_Approach', (0, -12.0, 1.0), root)
    socket('SOCKET_Crane_Mount', (0, 0, 0.3), root)
    meta = {
        'family': 'cargo', 'role': 'open freight deck: rack rows, crew cab, flood masts, handed approach',
        'states': 'active=pods+lights; abandoned=strip pods, kill lights, keep hazard edge',
        'placement': 'trade corridors, station aprons; the small-depot answer (hero hubs stay stations)',
        'lodPlan': 'LOD1: deck+cab+pods; LOD2: slab',
    }
    return root, meta


# ===========================================================================
# FAMILY 2 — MINING & REFINING (fiction §5.2). Industrial ochre; amber trade light.

@register('drill_platform')
def build_drill_platform():
    root = root_of('drill_platform')
    for i, (lx, ly) in enumerate(((4.2, 4.2), (4.2, -4.2), (-4.2, 4.2), (-4.2, -4.2))):
        truss(root, f'leg{i}', (lx * 0.55, ly * 0.55, 0), (lx * 1.5, ly * 1.5, -5.6),
              w=1.1, h=1.1, r=0.08)
        put(box(f'foot{i}', (2.0, 2.0, 0.6), (lx * 1.5, ly * 1.5, -5.9)), 'esk_armor_plate', root)
        put(box(f'foot{i}_hz', (2.1, 2.1, 0.2), (lx * 1.5, ly * 1.5, -5.5)),
            'esk_hazard_stripe', root)
    for i, (rx, ry, rl, rot) in enumerate(((0, 4.6, 9.2, 0.0), (0, -4.6, 9.2, 0.0),
                                           (4.6, 0, 9.2, math.pi / 2),
                                           (-4.6, 0, 9.2, math.pi / 2))):
        put(box(f'ring{i}', (rl, 1.4, 0.7), (rx, ry, 0.35), rot=(0, 0, rot)),
            'esk_paint_industrial_ochre', root)
    put(box('house', (4.2, 4.2, 3.0), (0, 0, 2.2)), 'esk_paint_industrial_ochre', root)
    put(box('house_glass', (0.2, 2.0, 0.8), (2.15, 0, 2.8)), 'esk_glass', root)
    put(cyl('column', 0.8, 6.4, (0, 0, -2.6), verts=14), 'esk_bare_steel', root)
    # lit amber collar just above the bit — round 1 had no visible amber anywhere and
    # the drill read as beige scaffolding with no trade identity
    put(cyl('collar_glow', 0.86, 0.5, (0, 0, -4.4), verts=14), 'esk_light_mining', root)
    o = cone('bit', 1.15, 0.12, 1.8, (0, 0, -6.6), rot=(math.pi, 0, 0), verts=14)
    put(o, 'esk_scorch', root)
    for i, (fx, fy) in enumerate(((3.9, 3.9), (-3.9, 3.9), (3.9, -3.9))):
        flood(root, f'fl{i}', (fx * 0.88, fy * 0.88, -0.75),
              rot=(0, 1.15, math.atan2(-fy, -fx)), role='esk_light_mining', scale=0.9,
              mount=(fx, fy, -0.35))
    strobe(root, 'strobe', (0, 0, 4.0), 'esk_light_signal_amber', r=0.24)
    put(box('plate', (1.8, 0.06, 0.9), (0, 2.25, 2.6)), 'esk_id_plate', root)
    socket('SOCKET_Drill_Bit', (0, 0, -7.5), root)
    socket('SOCKET_Power_In', (-2.2, -2.2, 1.0), root)
    meta = {
        'family': 'mining', 'role': 'anchored seam drill: four outrigger anchors, ring deck, lit bit',
        'states': 'active=amber floods on bit; see _cold variant (stowed+dark)',
        'placement': 'ON an asteroid seam — feet must contact rock; pairs with power_skid via trunk',
        'lodPlan': 'LOD1: legs as boxes; LOD2: house+column silhouette',
    }
    return root, meta


@register('drill_platform_cold')
def build_drill_platform_cold():
    """Cold state: column raised, bit clamped on deck, every lamp dead (fiction §4)."""
    root = root_of('drill_platform_cold')
    for i, (lx, ly) in enumerate(((4.2, 4.2), (4.2, -4.2), (-4.2, 4.2), (-4.2, -4.2))):
        truss(root, f'leg{i}', (lx * 0.55, ly * 0.55, 0), (lx * 1.5, ly * 1.5, -5.6),
              w=1.1, h=1.1, r=0.08)
        put(box(f'foot{i}', (2.0, 2.0, 0.6), (lx * 1.5, ly * 1.5, -5.9)), 'esk_armor_plate', root)
    for i, (rx, ry, rl, rot) in enumerate(((0, 4.6, 9.2, 0.0), (0, -4.6, 9.2, 0.0),
                                           (4.6, 0, 9.2, math.pi / 2),
                                           (-4.6, 0, 9.2, math.pi / 2))):
        put(box(f'ring{i}', (rl, 1.4, 0.7), (rx, ry, 0.35), rot=(0, 0, rot)),
            'esk_paint_industrial_ochre', root)
    put(box('house', (4.2, 4.2, 3.0), (0, 0, 2.2)), 'esk_paint_industrial_ochre', root)
    put(cyl('column_stub', 0.8, 1.6, (0, 0, -0.2), verts=14), 'esk_bare_steel', root)
    # bit lies clamped ON the front ring box — round 1 stowed it at ring-hole
    # coordinates and it hovered over the void
    bit = cone('bit_stowed', 1.15, 0.12, 1.8, (1.5, -4.6, 1.3), rot=(0, math.pi / 2, 0),
               verts=14)
    put(bit, 'esk_scorch', root)
    put(box('bit_clamp', (0.55, 1.7, 0.6), (0.4, -4.6, 0.95)), 'esk_bare_steel', root)
    put(box('hatch_dogged', (2.0, 2.0, 0.25), (0, 0, 3.82)), 'esk_armor_plate', root)
    put(box('plate', (1.8, 0.06, 0.9), (0, 2.25, 2.6)), 'esk_patch_plate', root)
    meta = {
        'family': 'mining', 'role': 'cold drill: bit stowed and clamped on deck, hatch dogged, no light',
        'states': 'this IS the cold/inactive state of drill_platform',
        'placement': 'played-out seams, disputed claims awaiting arbitration',
        'lodPlan': 'as drill_platform',
    }
    return root, meta


@register('crusher_module')
def build_crusher_module():
    root = root_of('crusher_module')
    put(box('body', (7.0, 5.0, 4.0), (0, 0, 0)), 'esk_paint_industrial_ochre', root)
    put(box('cheek_p', (5.0, 0.4, 3.2), (0, 2.6, 0.2)), 'esk_armor_plate', root)
    put(box('cheek_s', (5.0, 0.4, 3.2), (0, -2.6, 0.2)), 'esk_armor_plate', root)
    # one 4-sided pyramid shell — round 1 built the funnel from four rotated plates
    # that crossed into an X mess, then capped it with a solid slab "rim" that hid
    # the feed entirely. Square-in-circle: half-side = circumradius / sqrt(2).
    put(cone('hopper_shell', 1.15, 3.85, 3.3, (0, 0, 3.75), rot=(0, 0, math.pi / 4), verts=4),
        'esk_bare_steel', root)
    put(cone('hopper_throat', 0.95, 3.45, 3.3, (0, 0, 3.95), rot=(0, 0, math.pi / 4), verts=4),
        'esk_scorch', root)
    for tag, loc, size in (('n', (0, 2.75, 5.5), (5.9, 0.4, 0.22)),
                           ('s', (0, -2.75, 5.5), (5.9, 0.4, 0.22)),
                           ('e', (2.75, 0, 5.5), (0.4, 5.9, 0.22)),
                           ('w', (-2.75, 0, 5.5), (0.4, 5.9, 0.22))):
        put(box(f'rim_{tag}', size, loc), 'esk_hazard_stripe', root)
    put(box('chute', (4.0, 2.6, 0.5), (-4.6, 0, -1.6), rot=(0, -0.45, 0)), 'esk_scorch', root)
    put(cyl('motor', 1.0, 2.6, (2.2, -3.2, -0.6), rot=(0, math.pi / 2, 0), verts=14),
        'esk_bare_steel', root)
    put(box('belt_guard', (2.8, 0.7, 1.6), (0.6, -3.2, -0.4)), 'esk_paint_industrial_ochre', root)
    flood(root, 'hopper_fl', (3.1, -3.1, 6.3), rot=(0, 1.0, 2.36), role='esk_light_mining',
          mount=(2.75, -2.75, 5.55))
    strobe(root, 'strobe', (0, -2.75, 5.8), 'esk_light_signal_amber', r=0.22)
    ore_lumps(root, 'feed', (0, 0, 5.0), 1.2)
    socket('SOCKET_Feed', (0, 0, 5.6), root)
    socket('SOCKET_Discharge', (-6.4, 0, -2.4), root)
    meta = {
        'family': 'mining', 'role': 'jaw crusher: funnel hopper, armored cheeks, scorched discharge chute',
        'states': 'active=feed lumps+amber light; cold=empty hopper, no light',
        'placement': 'between drill and conveyor/containers; discharge points at the take-away',
        'lodPlan': 'LOD1: hopper as one box; LOD2: two stacked boxes',
    }
    return root, meta


@register('ore_sorter')
def build_ore_sorter():
    root = root_of('ore_sorter')
    put(box('screen', (8.0, 4.0, 0.5), (0.6, 0, 3.4), rot=(0, 0.34, 0)),
        'esk_bare_steel', root)
    put(box('screen_rail_p', (8.2, 0.25, 0.7), (0.6, 2.05, 3.7), rot=(0, 0.34, 0)),
        'esk_paint_industrial_ochre', root)
    put(box('screen_rail_s', (8.2, 0.25, 0.7), (0.6, -2.05, 3.7), rot=(0, 0.34, 0)),
        'esk_paint_industrial_ochre', root)
    for i, hx in enumerate((-3.0, 0.0, 3.0)):
        o = cone(f'hopper{i}', 1.8, 0.4, 2.6, (hx, 0, 0.3), rot=(math.pi, 0, 0), verts=14)
        put(o, 'esk_paint_industrial_ochre', root)
        put(cyl(f'chute{i}', 0.4, 1.0, (hx, 0, -1.5), verts=10), 'esk_scorch', root)
        put(box(f'grade{i}_lamp', (0.3, 0.3, 0.2), (hx, -2.0, 1.6)), 'esk_light_mining', root)
    for lx, lz in ((4.6, 4.6), (-3.4, 1.8)):
        truss(root, f'leg{int(lx)}', (lx, 1.9, -0.6), (lx, 1.9, lz), w=0.6, h=0.6, r=0.05)
        truss(root, f'leg{int(lx)}b', (lx, -1.9, -0.6), (lx, -1.9, lz), w=0.6, h=0.6, r=0.05)
    # rail-mounted light bars replace round 1's detached head flood; they read as a
    # lit working edge at every distance band
    put(box('bar_p', (7.6, 0.08, 0.14), (0.6, 1.85, 3.58), rot=(0, 0.34, 0)),
        'esk_light_mining', root)
    put(box('bar_s', (7.6, 0.08, 0.14), (0.6, -1.85, 3.58), rot=(0, 0.34, 0)),
        'esk_light_mining', root)
    ore_lumps(root, 'feed', (2.0, 0, 4.2), 0.75)
    socket('SOCKET_Feed', (4.6, 0, 5.2), root)
    socket('SOCKET_Grade_Out', (0, 0, -2.0), root)
    meta = {
        'family': 'mining', 'role': 'inclined grizzly screen over three grade hoppers with tell-tale lamps',
        'states': 'active=feed on screen, lamps lit; cold=bare screen, dark',
        'placement': 'crusher discharge side; hoppers feed containers or barge baskets',
        'lodPlan': 'LOD1: hoppers as cylinders; LOD2: wedge box',
    }
    return root, meta


@register('slurry_tank')
def build_slurry_tank():
    root = root_of('slurry_tank')
    truss(root, 'cradle_p', (-4.4, 1.8, -2.4), (4.4, 1.8, -2.4), w=0.8, h=0.8, r=0.06)
    truss(root, 'cradle_s', (-4.4, -1.8, -2.4), (4.4, -1.8, -2.4), w=0.8, h=0.8, r=0.06)
    put(box('cradle_end_f', (0.6, 4.4, 0.8), (4.4, 0, -2.4)), 'esk_hazard_stripe', root)
    put(box('cradle_end_a', (0.6, 4.4, 0.8), (-4.4, 0, -2.4)), 'esk_hazard_stripe', root)
    for i, sx in enumerate((-3.0, 0.0, 3.0)):
        put(sphere(f'tank{i}', 2.1, (sx, 0, 0), seg=18, rings=12), 'esk_tank_shell', root)
        put(cyl(f'band{i}', 2.14, 0.3, (sx, 0, 0), verts=20), 'esk_struct_alloy', root)
        put(beam(f'stalk{i}', (sx, 0, 1.9), (sx, 0, 2.7), 0.16), 'esk_pipe_steel', root)
    put(beam('header_a', (-3.0, 0, 2.7), (0, 0, 2.7), 0.2), 'esk_pipe_steel', root)
    put(beam('header_b', (0, 0, 2.7), (3.0, 0, 2.7), 0.2), 'esk_pipe_steel', root)
    # routed OUTSIDE the third sphere — round 1 buried the valvebox inside it and the
    # downpipe erupted from the sphere's crown
    put(beam('downpipe_a', (3.0, 0, 2.7), (5.6, 0, 0.9), 0.2), 'esk_tank_insulation', root)
    put(beam('downpipe_b', (5.6, 0, 0.9), (5.6, 0, -1.6), 0.2), 'esk_tank_insulation', root)
    put(cyl('flange', 0.45, 0.5, (5.6, 0, -1.9), verts=12), 'esk_bare_steel', root)
    put(box('valvebox', (0.9, 0.9, 0.9), (5.6, 0, -0.4)), 'esk_paint_industrial_ochre', root)
    put(box('level_lamp', (0.24, 0.24, 0.4), (0, -2.1, 1.2)), 'esk_light_mining', root)
    socket('SOCKET_Pipe_Out', (5.6, 0, -2.2), root)
    meta = {
        'family': 'mining', 'role': 'three formed spheres in a hazard-ended cradle + insulated downpipe',
        'states': 'active=level lamp; abandoned=lamp gone, one dome scorched',
        'placement': 'refinery process side; pipe-out aims at the next vessel',
        'lodPlan': 'LOD1: keep spheres, drop pipes; LOD2: three-lobe blob',
    }
    return root, meta


@register('radiator_bank')
def build_radiator_bank():
    root = root_of('radiator_bank')
    truss(root, 'spine', (-8.0, 0, 0), (8.0, 0, 0), w=1.0, h=1.0, r=0.06)
    put(beam('coolant_f', (-8.0, 0.35, 0.55), (8.0, 0.35, 0.55), 0.14), 'esk_pipe_steel', root)
    put(beam('coolant_r', (-8.0, -0.35, 0.55), (8.0, -0.35, 0.55), 0.14), 'esk_pipe_steel', root)
    for i in range(6):
        px = -6.5 + i * 2.6
        put(box(f'fin{i}_frame', (2.2, 0.22, 5.2), (px, 0, 3.2)), 'esk_struct_alloy', root)
        # core PROUD of the frame on both faces — round 1 sized it 0.10 inside a 0.22
        # frame at the same center, and the entire hot read was invisible
        put(box(f'fin{i}_core', (1.9, 0.30, 4.8), (px, 0, 3.2)), 'esk_radiator_hot', root)
        put(box(f'fin{i}_tip', (2.3, 0.34, 0.2), (px, 0, 5.9)), 'esk_hazard_stripe', root)
    put(box('mount_f', (1.0, 1.6, 1.0), (8.0, 0, -0.55)), 'esk_armor_plate', root)
    put(box('mount_a', (1.0, 1.6, 1.0), (-8.0, 0, -0.55)), 'esk_armor_plate', root)
    socket('SOCKET_Coolant_In', (8.6, 0, 0.55), root)
    meta = {
        'family': 'mining', 'role': 'six-fin heat rejection bank, cores glowing furnace-amber',
        'states': 'active=hot cores; cold=swap cores to esk_bare_steel at instancing (dark fins)',
        'placement': 'shadow side of any process plant; NEVER between a habitat and its view',
        'lodPlan': 'LOD1: fins keep (they ARE the read); LOD2: single glowing slab',
    }
    return root, meta


@register('conveyor_truss')
def build_conveyor_truss():
    root = root_of('conveyor_truss')
    truss(root, 'span', (-12.0, 0, 0), (12.0, 0, 0), w=1.6, h=1.4, r=0.07)
    put(box('belt', (23.4, 1.2, 0.12), (0, 0, 0.85)), 'esk_deck_grate', root)
    for i in range(10):
        bx = -10.6 + i * 2.4
        put(box(f'bucket{i}', (1.5, 1.1, 0.5), (bx, 0, 1.2)), 'esk_bare_steel', root)
        if i in (1, 4, 6, 8):
            ore_lumps(root, f'load{i}', (bx, 0, 1.5), 0.42)
    put(box('drive_house', (3.0, 3.0, 2.5), (12.6, 0, 0.6)), 'esk_paint_industrial_ochre', root)
    put(cyl('drive_motor', 0.7, 1.8, (12.6, -2.2, 0.6), rot=(math.pi / 2, 0, 0), verts=12),
        'esk_bare_steel', root)
    put(cyl('idler', 0.6, 2.0, (-12.3, 0, 0.8), rot=(math.pi / 2, 0, 0), verts=12),
        'esk_bare_steel', root)
    truss(root, 'legA', (-6.0, 0, -0.7), (-6.0, 0, -4.4), w=0.9, h=0.9, r=0.06)
    truss(root, 'legB', (6.0, 0, -0.7), (6.0, 0, -4.4), w=0.9, h=0.9, r=0.06)
    strobe(root, 'drive_strobe', (12.6, 0, 2.2), 'esk_light_signal_amber', r=0.2)
    # belt headlight on the drive-house face — round 1's mid-span flood floated 1.4 m
    # off the belt with nothing holding it
    put(box('belt_lamp', (0.15, 1.6, 0.22), (11.02, 0, 1.5)), 'esk_light_mining', root)
    socket('SOCKET_Feed_End', (-12.6, 0, 1.2), root)
    socket('SOCKET_Discharge_End', (13.6, 0, 0.6), root)
    meta = {
        'family': 'mining', 'role': '24 m span-gauge bucket conveyor with drive house, part-loaded',
        'states': 'active=loaded buckets+lamps; abandoned=empty buckets, belt gap, dark',
        'placement': 'crusher/sorter to containers; chains end-to-end (integer bays)',
        'lodPlan': 'LOD1: buckets merged strip; LOD2: box girder',
    }
    return root, meta


@register('extraction_mast')
def build_extraction_mast():
    root = root_of('extraction_mast')
    head = mast_std(root, 'mast', (0, 0, 0), 12.0, w=0.9)
    for i, ang in enumerate((0.0, 2.09, -2.09)):
        fx, fy = math.cos(ang) * 0.8, math.sin(ang) * 0.8
        flood(root, f'fl{i}', (head[0] + fx, head[1] + fy, head[2] - 0.4),
              rot=(0, 0.8, ang), role='esk_light_mining', scale=1.1)
    strobe(root, 'top', (head[0], head[1], head[2] + 0.5), 'esk_light_signal_amber', r=0.26)
    trunk(root, 'feed', ((0.5, 0.5, 0.5), (2.4, 2.4, 0.3), (4.0, 2.6, 0.3)), r=0.09)
    put(box('junction', (0.9, 0.9, 0.9), (4.5, 2.6, 0.45)), 'esk_paint_industrial_ochre', root)
    socket('SOCKET_Head', tuple(head), root)
    meta = {
        'family': 'mining', 'role': 'yard mast in extraction fit: three amber floods + claim strobe',
        'states': 'active=lit; cold=dark (the unlit yard is a dead yard)',
        'placement': 'worksite perimeter, one per ~40 m of active face',
        'lodPlan': 'LOD1: column as box; LOD2: single post',
    }
    return root, meta


# ===========================================================================
# FAMILY 3 — REPAIR & CONSTRUCTION (fiction §5.3). Service blue; blue-white light.

@register('maintenance_gantry')
def build_maintenance_gantry():
    root = root_of('maintenance_gantry')
    truss(root, 'leg_p', (0, 9.0, 0), (0, 9.0, 10.0), w=1.2, h=1.2, r=0.07)
    truss(root, 'leg_s', (0, -9.0, 0), (0, -9.0, 10.0), w=1.2, h=1.2, r=0.07)
    truss(root, 'cross', (0, -9.6, 10.0), (0, 9.6, 10.0), w=1.2, h=1.2, r=0.07)
    put(box('foot_p', (3.0, 2.0, 0.6), (0, 9.0, 0.3)), 'esk_armor_plate', root)
    put(box('foot_s', (3.0, 2.0, 0.6), (0, -9.0, 0.3)), 'esk_armor_plate', root)
    put(box('foot_p_hz', (3.1, 2.1, 0.2), (0, 9.0, 0.7)), 'esk_hazard_stripe', root)
    put(box('foot_s_hz', (3.1, 2.1, 0.2), (0, -9.0, 0.7)), 'esk_hazard_stripe', root)
    put(box('trolley', (1.8, 2.4, 1.2), (0, 1.5, 9.2)), 'esk_paint_service_blue', root)
    put(beam('hoist', (0, 1.5, 8.6), (0, 1.5, 6.4), 0.10), 'esk_bare_steel', root)
    put(box('hook', (0.6, 0.4, 0.7), (0, 1.5, 6.0)), 'esk_bare_steel', root)
    put(beam('toolboom_p', (0, 8.4, 7.0), (1.8, 6.0, 6.2), 0.12), 'esk_pipe_steel', root)
    put(box('toolhead_p', (0.7, 0.5, 0.5), (2.1, 5.7, 6.1)), 'esk_paint_service_blue', root)
    # ladder rail flush on the leg's OUTER face — round 1 wedged it inside the lattice
    put(box('ladder', (0.5, 0.14, 9.0), (0, -9.68, 5.0)), 'esk_bare_steel', root)
    for fy in (4.0, -4.0):
        flood(root, f'fl{int(fy)}', (0, fy, 9.4), rot=(0, math.pi / 2 * 0.92, 0),
              role='esk_light_repair', scale=1.0)
    put(box('plate', (1.6, 0.06, 0.8), (0, -9.66, 8.6)), 'esk_id_plate', root)
    socket('SOCKET_Berth', (0, 0, 4.5), root)
    socket('SOCKET_Hook', (0, 1.5, 5.6), root)
    meta = {
        'family': 'service', 'role': 'portal gantry a small hull parks under: trolley hoist + tool booms',
        'states': 'active=blue-white floods down; cold=trolley parked at leg, dark',
        'placement': 'repair yards, construction sites; berth socket is the client position',
        'lodPlan': 'LOD1: trusses as box girders; LOD2: portal outline',
    }
    return root, meta


@register('repair_scaffold')
def build_repair_scaffold():
    root = root_of('repair_scaffold')
    posts = ((2.8, 1.4), (2.8, -1.4), (-2.8, 1.4), (-2.8, -1.4))
    for i, (px, py) in enumerate(posts):
        put(beam(f'post{i}', (px, py, 0), (px, py, 7.6), 0.09), 'esk_bare_steel', root)
    parts = []
    for lz in (2.4, 5.0, 7.6):
        parts.append(beam(f'r{int(lz*10)}a', (2.8, 1.4, lz), (2.8, -1.4, lz), 0.07))
        parts.append(beam(f'r{int(lz*10)}b', (-2.8, 1.4, lz), (-2.8, -1.4, lz), 0.07))
        parts.append(beam(f'r{int(lz*10)}c', (2.8, 1.4, lz), (-2.8, 1.4, lz), 0.07))
        parts.append(beam(f'r{int(lz*10)}d', (2.8, -1.4, lz), (-2.8, -1.4, lz), 0.07))
    parts.append(beam('dg0', (2.8, 1.4, 0), (-2.8, 1.4, 2.4), 0.06))
    parts.append(beam('dg1', (-2.8, -1.4, 2.4), (2.8, -1.4, 5.0), 0.06))
    put(join_objs(parts, 'rails'), 'esk_bare_steel', root)
    put(box('deck_a', (5.4, 2.6, 0.15), (0, 0, 2.4)), 'esk_deck_grate', root)
    put(box('deck_b', (5.4, 2.6, 0.15), (0, 0, 5.0)), 'esk_deck_grate', root)
    # jaws hang from visible clamp arms — round 1's jaws floated below the posts
    for i, (px, s) in enumerate(((2.8, 1), (-2.8, -1))):
        put(beam(f'clamparm{i}', (px, 0, 0.05), (px + s * 0.35, 0, -0.75), 0.09),
            'esk_bare_steel', root)
        put(box(f'clampjaw{i}', (0.9, 1.6, 0.7), (px + s * 0.45, 0, -1.05), rot=(0, s * 0.2, 0)),
            'esk_paint_service_blue', root)
    put(box('basket', (1.6, 1.0, 0.8), (1.6, 1.05, 5.65)), 'esk_paint_service_blue', root)
    put(beam('basket_hanger', (1.6, 1.4, 7.6), (1.6, 1.05, 6.05), 0.05), 'esk_bare_steel', root)
    put(box('lamp_a', (0.25, 0.35, 0.2), (2.62, 0, 7.5)), 'esk_light_repair', root)
    put(box('lamp_b', (0.25, 0.35, 0.2), (-2.62, 0, 7.5)), 'esk_light_repair', root)
    socket('SOCKET_Clamp', (0, 0, -1.3), root)
    meta = {
        'family': 'service', 'role': 'clamp-on hull scaffold: two work decks, parts basket, rail lamps',
        'states': 'active=lamps lit; see _bent variant',
        'placement': 'clamped to a hull or frame under repair — clamp jaws must touch the client',
        'lodPlan': 'LOD1: rails merged; LOD2: open box',
    }
    return root, meta


@register('repair_scaffold_bent')
def build_repair_scaffold_bent():
    """Damaged: something hit it. Two posts kinked, one deck sprung, a clamp torn off."""
    root = root_of('repair_scaffold_bent')
    put(beam('post0', (2.8, 1.4, 0), (2.8, 1.4, 7.6), 0.09), 'esk_bare_steel', root)
    put(beam('post1a', (2.8, -1.4, 0), (3.3, -1.9, 4.0), 0.09), 'esk_bare_steel', root)
    put(beam('post1b', (3.3, -1.9, 4.0), (2.9, -1.5, 7.4), 0.09), 'esk_bare_steel', root)
    put(beam('post2', (-2.8, 1.4, 0), (-2.8, 1.4, 7.6), 0.09), 'esk_bare_steel', root)
    put(beam('post3a', (-2.8, -1.4, 0), (-3.4, -1.0, 3.4), 0.09), 'esk_bare_steel', root)
    put(beam('post3b', (-3.4, -1.0, 3.4), (-2.7, -1.6, 7.2), 0.09), 'esk_bare_steel', root)
    parts = []
    for lz in (2.4, 7.6):
        parts.append(beam(f'r{int(lz*10)}a', (2.8, 1.4, lz), (2.8, -1.4, lz), 0.07))
        parts.append(beam(f'r{int(lz*10)}c', (2.8, 1.4, lz), (-2.8, 1.4, lz), 0.07))
        parts.append(beam(f'r{int(lz*10)}d', (2.8, -1.4, lz), (-2.8, -1.4, lz), 0.07))
    put(join_objs(parts, 'rails'), 'esk_bare_steel', root)
    put(box('deck_a', (5.4, 2.6, 0.15), (0, 0, 2.4)), 'esk_deck_grate', root)
    put(box('deck_sprung', (5.4, 2.6, 0.15), (0.4, 0.3, 5.1), rot=(0.28, 0.12, 0.08)),
        'esk_deck_grate', root)
    put(beam('clamparm0', (2.8, 0, 0.05), (3.15, 0, -0.75), 0.09), 'esk_bare_steel', root)
    put(box('clampjaw0', (0.9, 1.6, 0.7), (3.25, 0, -1.05), rot=(0, 0.2, 0)),
        'esk_paint_service_blue', root)
    put(box('scorch', (1.4, 0.12, 2.2), (3.0, -1.6, 3.8), rot=(0, 0.2, 0.3)), 'esk_scorch', root)
    meta = {
        'family': 'service', 'role': 'impact-bent scaffold: kinked posts, sprung deck, one clamp gone',
        'states': 'this IS the damaged state of repair_scaffold',
        'placement': 'accident sites, hard-luck yards, salvage auctions',
        'lodPlan': 'as repair_scaffold — the kink must survive LOD1',
    }
    return root, meta


@register('construction_frame')
def build_construction_frame():
    root = root_of('construction_frame')
    truss(root, 'keel', (-13.0, 0, -2.6), (13.0, 0, -2.6), w=1.6, h=1.6, r=0.08)
    for i in range(7):
        rx = -12.0 + i * 4.0
        hoop_rect(root, f'rib{i}', (rx, 0, 0.6), 8.0, 6.4, r=0.14)
        # welded collar where each rib crosses the keel — round 1's ribs floated
        # around the keel with no visible junction
        put(box(f'ribjoint{i}', (0.7, 2.0, 1.4), (rx, 0, -2.4)), 'esk_struct_alloy', root)
    # aft three bays are skinned; forward bays are bare standard (fiction §4)
    for i in range(3):
        px = -10.0 + i * 4.0
        put(box(f'skin_p{i}', (3.8, 0.15, 6.0), (px, 4.0, 0.6)), 'esk_paint_civic_bone', root)
        put(box(f'skin_s{i}', (3.8, 0.15, 6.0), (px, -4.0, 0.6)), 'esk_paint_civic_bone', root)
        put(box(f'skin_t{i}', (3.8, 7.8, 0.15), (px, 0, 3.75)), 'esk_paint_civic_bone', root)
    put(box('staged_a', (3.6, 0.15, 5.8), (7.0, 6.6, 0.4), rot=(0.12, 0, 0.2)),
        'esk_paint_civic_bone', root)
    put(box('staged_b', (3.6, 0.15, 5.8), (8.2, 7.4, -0.4), rot=(-0.08, 0.1, 0.35)),
        'esk_paint_civic_bone', root)
    flood(root, 'fl_f', (12.0, 1.0, 4.4), rot=(0, 1.1, math.pi), role='esk_light_repair',
          mount=(12.0, 1.6, 3.8))
    flood(root, 'fl_m', (0.0, -4.3, 4.4), rot=(0, 1.0, math.pi / 2), role='esk_light_repair',
          scale=0.9, mount=(0.0, -4.0, 3.8))
    strobe(root, 'end_f', (13.4, 0, -2.6), 'esk_light_repair', r=0.22)
    strobe(root, 'end_a', (-13.4, 0, -2.6), 'esk_light_repair', r=0.22)
    socket('SOCKET_Keel_Fwd', (13.0, 0, -2.6), root)
    socket('SOCKET_Next_Panel', (7.0, 6.6, 0.4), root)
    meta = {
        'family': 'service', 'role': '26 m keel section mid-build: skinned aft, bare ribs forward, panels staged',
        'states': 'this asset IS the under-construction state; completed = a future hull',
        'placement': 'station growth edges, shipyard anchorages; keel axis on the build line',
        'lodPlan': 'LOD1: ribs merged, skins keep; LOD2: half-skinned box',
    }
    return root, meta


@register('welding_drone')
def build_welding_drone():
    root = root_of('welding_drone')
    put(box('body', (1.0, 0.7, 0.6), (0, 0, 0)), 'esk_paint_service_blue', root)
    put(box('eye', (0.12, 0.3, 0.18), (0.53, 0, 0.1)), 'esk_glass', root)
    for i, py in enumerate((0.28, -0.28)):
        put(beam(f'arm{i}_a', (0.4, py, 0.0), (0.88, py * 1.8, 0.1), 0.045), 'esk_bare_steel', root)
        put(beam(f'arm{i}_b', (0.88, py * 1.8, 0.1), (1.3, py * 1.2, 0.05), 0.04), 'esk_bare_steel', root)
    put(box('torch', (0.13, 0.09, 0.09), (1.38, 0.34, 0.05)), 'esk_light_repair', root)
    put(box('gripper', (0.14, 0.12, 0.08), (1.36, -0.34, 0.05)), 'esk_bare_steel', root)
    quads = []
    for qx, qy in ((0.32, 0.42), (0.32, -0.42), (-0.38, 0.42), (-0.38, -0.42)):
        quads.append(cyl(f'thr_{qx}_{qy}', 0.09, 0.16, (qx, qy, -0.32), verts=8))
    put(join_objs(quads, 'thrusters'), 'esk_pipe_steel', root)
    put(box('hook', (0.16, 0.16, 0.1), (0, 0, 0.38)), 'esk_bare_steel', root)
    strobe(root, 'tail', (-0.55, 0, 0.1), 'esk_light_signal_amber', r=0.07)
    socket('SOCKET_Torch', (1.4, 0.34, 0.0), root)
    meta = {
        'family': 'service', 'role': '1.9 m free-flying welder: twin manipulators, torch, quad thrusters',
        'states': 'active=torch lens lit (VFX arc at SOCKET_Torch); stowed=racked on parts_rack',
        'placement': 'swarming any service scene; scale-checks large plant in every board',
        'lodPlan': 'LOD1: body+arms; LOD2: sprite/impostor recommended',
    }
    return root, meta


@register('parts_rack')
def build_parts_rack():
    root = root_of('parts_rack')
    for i, px in enumerate((3.6, -3.6)):
        put(beam(f'aleg{i}_f', (px, 1.8, 0), (px, 0.35, 4.2), 0.11), 'esk_paint_service_blue', root)
        put(beam(f'aleg{i}_a', (px, -1.8, 0), (px, -0.35, 4.2), 0.11), 'esk_paint_service_blue', root)
        put(beam(f'atie{i}', (px, 0.35, 4.2), (px, -0.35, 4.2), 0.10), 'esk_paint_service_blue', root)
        put(box(f'foot{i}', (1.0, 4.0, 0.3), (px, 0, 0.05)), 'esk_struct_alloy', root)
    put(beam('spine', (3.6, 0, 4.25), (-3.6, 0, 4.25), 0.11), 'esk_paint_service_blue', root)
    # plates stand NEAR-VERTICAL leaning against the spine — round 1's rotation math
    # laid them almost flat, sliding out of the frame like a collapsed stack
    plates = (('esk_bare_steel', 0.30, 0.10), ('esk_patch_plate', 0.75, 0.20),
              ('esk_paint_civic_bone', 1.20, 0.30), ('esk_bare_steel', -0.55, -0.16),
              ('esk_paint_industrial_ochre', -1.10, -0.30))
    for i, (role, py, lean) in enumerate(plates):
        put(box(f'plate{i}', (5.6, 0.14, 3.3), (0, py, 1.75), rot=(lean, 0, 0)),
            role, root)
    for i, py in enumerate((0.5, 0.0, -0.5)):
        put(cyl(f'spar{i}', 0.16, 6.4, (0, py * 2.2, 0.55), rot=(0, math.pi / 2, 0), verts=10),
            'esk_pipe_steel', root)
    put(box('sparcradle_f', (0.4, 3.4, 0.5), (2.8, 0, 0.45)), 'esk_struct_alloy', root)
    put(box('sparcradle_a', (0.4, 3.4, 0.5), (-2.8, 0, 0.45)), 'esk_struct_alloy', root)
    flood(root, 'fl', (0, -0.5, 4.75), rot=(0, 1.0, -math.pi / 2), role='esk_light_repair',
          scale=0.7, mount=(0, 0, 4.3))
    put(box('id', (0.8, 0.06, 0.5), (4.12, -1.2, 0.45)), 'esk_id_plate', root)
    meta = {
        'family': 'service', 'role': 'A-frame stock rack: leaning mixed hull plates + spar tubes in cradles',
        'states': 'full=as built; depleted=fewer plates (subtraction at instancing)',
        'placement': 'beside every gantry/scaffold; the "work is ongoing" consumable read',
        'lodPlan': 'LOD1: plates merged wedge; LOD2: wedge box',
    }
    return root, meta


@register('power_skid')
def build_power_skid():
    root = root_of('power_skid')
    put(box('skid', (5.0, 3.0, 0.4), (0, 0, 0.2)), 'esk_struct_alloy', root)
    put(box('runner_p', (5.4, 0.3, 0.3), (0, 1.35, 0.0)), 'esk_bare_steel', root)
    put(box('runner_s', (5.4, 0.3, 0.3), (0, -1.35, 0.0)), 'esk_bare_steel', root)
    put(box('skid_hz_f', (0.3, 3.0, 0.35), (2.55, 0, 0.25)), 'esk_hazard_stripe', root)
    put(box('skid_hz_a', (0.3, 3.0, 0.35), (-2.55, 0, 0.25)), 'esk_hazard_stripe', root)
    vessel(root, 'core', (-0.6, 0, 1.7), 1.15, 2.8, role='esk_tank_shell')
    put(box('fin', (2.2, 0.14, 1.8), (-0.6, 0, 3.8)), 'esk_radiator_hot', root)
    put(box('fin_frame', (2.4, 0.2, 0.2), (-0.6, 0, 4.75)), 'esk_struct_alloy', root)
    put(box('cabinet', (1.4, 2.4, 1.9), (1.9, 0, 1.35)), 'esk_paint_service_blue', root)
    put(box('status', (0.14, 0.5, 0.2), (2.62, 0, 1.8)), 'esk_light_signal_amber', root)
    trunk(root, 'cable', ((2.6, -0.8, 0.5), (3.6, -1.4, 0.3), (4.6, -1.5, 0.3)), r=0.11)
    put(box('plug', (0.5, 0.5, 0.5), (4.9, -1.5, 0.35)), 'esk_bare_steel', root)
    socket('SOCKET_Power_Out', (5.1, -1.5, 0.35), root)
    socket('SOCKET_Hoist_Center', (0, 0, 2.4), root)
    meta = {
        'family': 'service', 'role': 'portable reactor skid: formed core, hot fin, cabinet, visible cable run',
        'states': 'active=amber status+hot fin; cold=dark; see _patched (salvage) variant',
        'placement': 'wherever plant runs — the trunk should visibly reach what it powers',
        'lodPlan': 'LOD1: core+cabinet; LOD2: single box',
    }
    return root, meta


@register('worklight_tower')
def build_worklight_tower():
    root = root_of('worklight_tower')
    put(box('counter', (3.0, 3.0, 0.8), (0, 0, 0.4)), 'esk_armor_plate', root)
    head = mast_std(root, 'mast', (0, 0, 0.8), 14.0, w=0.9)
    for i, ang in enumerate((0.5, 2.6, 4.7)):
        fx, fy = math.cos(ang) * 0.9, math.sin(ang) * 0.9
        flood(root, f'fl{i}', (head[0] + fx, head[1] + fy, head[2] - 0.3),
              rot=(0, 0.75, ang), scale=1.3)
    strobe(root, 'top', (head[0], head[1], head[2] + 0.5), 'esk_light_signal_amber', r=0.22)
    socket('SOCKET_Head', tuple(head), root)
    meta = {
        'family': 'service', 'role': 'yard mast in flood fit: three big white-warm heads (work happens here)',
        'states': 'active=lit; cold=dark',
        'placement': 'every active worksite; aim heads AT the work, not at the camera',
        'lodPlan': 'LOD1: column as box; LOD2: post + one lens',
    }
    return root, meta


# ===========================================================================
# FAMILY 4 — NAVIGATION & LAW (fiction §5.4). Authority navy; arc-blue light.
# Route beacons / warning buoys / billboards exist live and are NOT duplicated
# (evidence/EXISTING_COVERAGE.md).

@register('customs_pylon')
def build_customs_pylon():
    root = root_of('customs_pylon')
    put(box('base', (3.2, 3.2, 1.2), (0, 0, 0.6)), 'esk_struct_alloy', root)
    put(box('base_hz', (3.4, 3.4, 0.3), (0, 0, 1.3)), 'esk_hazard_stripe', root)
    put(box('column', (2.0, 2.0, 10.0), (0, 0, 6.4)), 'esk_paint_authority_navy', root)
    put(box('head', (2.7, 2.7, 2.2), (0, 0, 12.5)), 'esk_paint_authority_navy', root)
    # aperture proud of the HEAD face (1.35 half-depth) — round 1 authored it at
    # column depth and it was buried invisible inside the wider head
    put(box('aperture', (0.25, 0.5, 1.6), (1.32, 0, 12.4)), 'esk_light_authority', root)
    put(box('slot', (0.2, 0.3, 5.2), (1.03, 0, 5.6)), 'esk_light_authority', root)
    for i, py in enumerate((1.05, -1.05)):
        put(box(f'sensor{i}', (0.9, 0.5, 0.9), (0.8, py, 11.6)), 'esk_paint_authority_navy', root)
    put(box('crest', (0.06, 1.2, 1.2), (1.04, 0, 9.4)), 'esk_id_plate', root)
    strobe(root, 'top', (0, 0, 13.9), 'esk_light_authority', r=0.26)
    socket('SOCKET_Scan_Emitter', (1.2, 0, 12.4), root)
    meta = {
        'family': 'law', 'role': 'customs scan pylon: navy monolith, lit aperture slot, white crest',
        'states': 'active=slot+aperture lit; the state machine (sweep/lock) is VFX at the socket',
        'placement': 'paired astride lanes, ahead of transponder gates, at station approaches',
        'lodPlan': 'LOD1: column+head; LOD2: single pillar (slot baked)',
    }
    return root, meta


@register('inspection_platform')
def build_inspection_platform():
    root = root_of('inspection_platform')
    put(box('deck', (20.0, 10.0, 0.5), (0, 0, 0)), 'esk_deck_grate', root)
    put(box('deck_frame', (20.4, 10.4, 0.6), (0, 0, -0.55)), 'esk_struct_alloy', root)
    put(box('strip_p', (19.0, 0.3, 0.15), (0, 4.9, 0.35)), 'esk_light_authority', root)
    put(box('strip_s', (19.0, 0.3, 0.15), (0, -4.9, 0.35)), 'esk_light_authority', root)
    # V-cradle: plinth-mounted jaws, closer and steeper so the pair reads as one
    # holding fixture (round 1's shallow far-apart slabs read as two tilted walls)
    for i, (jx, s) in enumerate(((2.4, 1), (-2.4, -1))):
        put(box(f'jawbase{i}', (1.5, 5.0, 0.9), (jx, 0, 0.65)), 'esk_struct_alloy', root)
        put(box(f'jaw{i}', (1.2, 5.0, 3.0), (jx, 0, 2.2), rot=(0, s * -0.4, 0)),
            'esk_paint_authority_navy', root)
        put(box(f'jawpad{i}', (0.4, 4.2, 2.0), (jx - s * 0.85, 0, 2.55), rot=(0, s * -0.4, 0)),
            'esk_armor_plate', root)
    cab = group(root, 'cab', (-8.0, -3.2, 1.7))
    put(box('cab_body', (3.4, 2.8, 2.8), (0, 0, 0)), 'esk_paint_authority_navy', cab)
    put(box('cab_glass', (0.2, 2.0, 1.0), (1.72, 0, 0.5)), 'esk_glass', cab)
    put(box('cab_glow', (0.08, 1.6, 0.7), (1.78, 0, 0.5)), 'esk_light_cabin', cab)
    for i, (mx, my) in enumerate(((9.0, 4.2), (9.0, -4.2), (-9.0, 4.2))):
        put(beam(f'lpost{i}', (mx, my, 0.3), (mx, my, 4.6), 0.10), 'esk_struct_alloy', root)
        flood(root, f'lfl{i}', (mx, my, 4.6),
              rot=(0, 0.85, math.atan2(-my, -mx)), scale=0.9)
    strobe(root, 'authority', (-8.0, -3.2, 3.6), 'esk_light_authority', r=0.24)
    socket('SOCKET_Berth', (0, 0, 2.2), root)
    socket('SOCKET_Approach', (0, 9.0, 1.0), root)
    meta = {
        'family': 'law', 'role': 'floodlit holding dock: clamp cradle, perimeter arc-blue, watch cab',
        'states': 'active=strips+floods; occupied=held craft at SOCKET_Berth (instancing)',
        'placement': 'off-lane behind customs pylons — where the pulled-over go',
        'lodPlan': 'LOD1: deck+jaws+cab; LOD2: slab with lit edges',
    }
    return root, meta


@register('interdiction_buoy')
def build_interdiction_buoy():
    root = root_of('interdiction_buoy')
    put(cone('core_up', 1.5, 0.05, 2.2, (0, 0, 1.1), verts=12), 'esk_paint_authority_navy', root)
    put(cone('core_dn', 1.5, 0.05, 2.2, (0, 0, -1.1), rot=(math.pi, 0, 0), verts=12),
        'esk_paint_authority_navy', root)
    put(cyl('belt', 1.55, 0.5, (0, 0, 0), verts=14), 'esk_hazard_stripe', root)
    for i in range(6):
        ang = i * math.pi / 3
        d = (math.cos(ang), math.sin(ang), 0)
        put(spike(f'spike{i}', (d[0] * 1.3, d[1] * 1.3, 0), d, 0.22, 2.4),
            'esk_bare_steel', root)
    strobe(root, 'top', (0, 0, 2.5), 'esk_light_authority', r=0.24)
    strobe(root, 'belt_a', (1.62, 0, 0), 'esk_light_nav_red', r=0.16)
    strobe(root, 'belt_b', (-1.62, 0, 0), 'esk_light_nav_red', r=0.16)
    socket('SOCKET_Field_Emitter', (0, 0, 0), root)
    meta = {
        'family': 'law', 'role': 'interdiction buoy: spiked bicone that reads THREAT, not guidance',
        'states': 'armed=strobes lit; the deterrent silhouette works even dark',
        'placement': 'closed lanes, exclusion rings, impound perimeters — in the flight path',
        'lodPlan': 'LOD1: bicone+4 spikes; LOD2: octahedron',
    }
    return root, meta


@register('transponder_gate')
def build_transponder_gate():
    root = root_of('transponder_gate')
    truss(root, 'col_p', (0, 10.0, 0), (0, 10.0, 12.0), w=1.2, h=1.2, r=0.07)
    truss(root, 'col_s', (0, -10.0, 0), (0, -10.0, 12.0), w=1.2, h=1.2, r=0.07)
    truss(root, 'cross', (0, -10.6, 12.0), (0, 10.6, 12.0), w=1.2, h=1.2, r=0.07)
    put(box('cap_p', (1.6, 1.6, 0.8), (0, 10.0, 12.8)), 'esk_paint_authority_navy', root)
    put(box('cap_s', (1.6, 1.6, 0.8), (0, -10.0, 12.8)), 'esk_paint_authority_navy', root)
    put(box('foot_p', (2.4, 2.4, 0.6), (0, 10.0, 0.3)), 'esk_hazard_stripe', root)
    put(box('foot_s', (2.4, 2.4, 0.6), (0, -10.0, 0.3)), 'esk_hazard_stripe', root)
    # approach face is +X per the kit's working-face contract (round 1 faced -X and
    # every lens was invisible to both the review camera and the convention)
    for i, py in enumerate((-6.0, 0.0, 6.0)):
        put(box(f'pod{i}', (1.2, 2.2, 1.4), (0, py, 11.2)), 'esk_paint_authority_navy', root)
        put(box(f'pod{i}_lens', (0.15, 1.4, 0.7), (0.66, py, 11.0)), 'esk_light_nav_green', root)
    put(box('hold_p', (0.2, 0.4, 1.8), (0.6, 9.4, 10.4)), 'esk_light_nav_red', root)
    put(box('hold_s', (0.2, 0.4, 1.8), (0.6, -9.4, 10.4)), 'esk_light_nav_red', root)
    put(box('crest', (0.08, 2.0, 1.6), (0.62, 0, 12.4)), 'esk_id_plate', root)
    socket('SOCKET_Lane_Center', (0, 0, 6.0), root)
    meta = {
        'family': 'law', 'role': 'lane gate: green pass pods on the crossbeam, red hold edges, white crest',
        'states': 'open=green lenses; closed=swap to red at instancing (paired lens boxes)',
        'placement': 'across a lane; approach face is +X (lenses face the incoming pilot)',
        'lodPlan': 'LOD1: portal as box girders; LOD2: goalpost outline',
    }
    return root, meta


@register('sensor_mast')
def build_sensor_mast():
    root = root_of('sensor_mast')
    head = mast_std(root, 'mast', (0, 0, 0), 12.0, w=0.9)
    put(box('cap', (1.2, 1.2, 0.5), (head[0], head[1], head[2] + 0.25)),
        'esk_paint_authority_navy', root)
    dish_unit(root, 'main_dish', (0.6, 0, 11.0), 1.8, rot=(0, 1.15, 0))
    dish_unit(root, 'sub_p', (0, 0.8, 8.0), 0.8, rot=(-1.2, 0, 0))
    dish_unit(root, 'sub_s', (0, -0.8, 6.4), 0.8, rot=(1.2, 0, 0))
    put(cyl('drum', 0.9, 1.6, (0, 0, 9.4), verts=14), 'esk_struct_alloy', root)
    strobe(root, 'top', (head[0], head[1], head[2] + 0.8), 'esk_light_authority', r=0.2)
    trunk(root, 'down', ((0.5, 0.5, 0.4), (2.2, 1.6, 0.25), (3.4, 1.8, 0.25)), r=0.08)
    put(box('junction', (0.8, 0.8, 0.8), (3.9, 1.8, 0.4)), 'esk_paint_authority_navy', root)
    socket('SOCKET_Listen', (0, 0, 9.4), root)
    meta = {
        'family': 'law', 'role': 'listening mast: one big + two small dishes and a signals drum',
        'states': 'active=authority strobe; passive plant otherwise (it just watches)',
        'placement': 'checkpoint flanks, border sectors; big dish aims along the watched lane',
        'lodPlan': 'LOD1: dishes as cones; LOD2: post+cone',
    }
    return root, meta


@register('traffic_signal')
def build_traffic_signal():
    root = root_of('traffic_signal')
    put(cyl('base', 1.1, 1.0, (0, 0, 0.5), verts=14), 'esk_struct_alloy', root)
    put(box('base_hz', (2.4, 2.4, 0.25), (0, 0, 1.05)), 'esk_hazard_stripe', root)
    put(beam('mast', (0, 0, 1.0), (2.4, 0, 7.6), 0.22), 'esk_paint_authority_navy', root)
    put(box('counter', (1.4, 0.9, 0.9), (-1.1, 0, 1.9)), 'esk_armor_plate', root)
    put(box('backboard', (0.25, 2.2, 4.2), (2.7, 0, 6.0)), 'esk_paint_authority_navy', root)
    put(box('lens_go', (0.2, 1.1, 1.0), (2.85, 0, 7.4)), 'esk_light_nav_green', root)
    put(box('lens_hold', (0.2, 1.1, 1.0), (2.85, 0, 6.0)), 'esk_light_signal_amber', root)
    put(box('lens_stop', (0.2, 1.1, 1.0), (2.85, 0, 4.6)), 'esk_light_nav_red', root)
    put(box('panel', (0.5, 1.0, 0.7), (0.6, 0, 3.4), rot=(0, -0.5, 0)), 'esk_solar_cell', root)
    strobe(root, 'top', (2.4, 0, 8.0), 'esk_light_signal_amber', r=0.16)
    socket('SOCKET_Signal_Face', (3.0, 0, 6.0), root)
    meta = {
        'family': 'law', 'role': 'counterweighted lane signal: stacked go/hold/stop faces one approach',
        'states': 'live=all three lenses authored; a wiring lane picks the active one',
        'placement': 'dock throats, one-at-a-time passages, loading apron entries',
        'lodPlan': 'LOD1: mast+board; LOD2: lollipop',
    }
    return root, meta


# ===========================================================================
# FAMILY 5 — CIVILIAN & HABITATION (fiction §5.5). Civic bone; warm cabin glow.

@register('habitat_pod')
def build_habitat_pod():
    root = root_of('habitat_pod')
    vessel(root, 'hull', (0, 0, 0), 2.5, 7.0, role='esk_paint_civic_bone', saddles=False)
    # -Y: round 1 put the window row on +Y and the pod read as a blank pill
    for i in range(5):
        wx = -3.0 + i * 1.5
        put(box(f'win{i}', (0.9, 0.12, 0.6), (wx, -2.44, 0.5)), 'esk_light_cabin', root)
    put(cyl('collar', 1.2, 0.8, (-4.4, 0, 0), rot=(0, math.pi / 2, 0), verts=16),
        'esk_struct_alloy', root)
    put(cyl('hatch', 0.9, 0.3, (-4.95, 0, 0), rot=(0, math.pi / 2, 0), verts=16),
        'esk_bare_steel', root)
    put(beam('mast', (0.8, 0, 2.3), (0.8, 0, 3.6), 0.12), 'esk_struct_alloy', root)
    put(beam('wing_boom', (0.8, -1.9, 3.6), (0.8, 1.9, 3.6), 0.09), 'esk_struct_alloy', root)
    put(box('wing_p', (1.6, 3.4, 0.1), (0.8, 2.1, 3.6)), 'esk_solar_cell', root)
    put(box('wing_s', (1.6, 3.4, 0.1), (0.8, -2.1, 3.6)), 'esk_solar_cell', root)
    put(box('utility', (2.4, 1.6, 0.9), (1.2, 0, -2.9)), 'esk_struct_alloy', root)
    put(box('radfin', (1.4, 0.1, 0.8), (-1.6, 0, -3.1)), 'esk_pipe_steel', root)
    strobe(root, 'nav', (3.6, 0, 1.4), 'esk_light_nav_green', r=0.14)
    put(box('plate', (1.2, 0.05, 0.6), (2.2, -2.5, -0.6)), 'esk_id_plate', root)
    socket('SOCKET_Airlock', (-5.2, 0, 0), root)
    meta = {
        'family': 'civic', 'role': 'crew habitat capsule: lit window row, airlock collar, solar cross',
        'states': 'occupied=windows warm; see _derelict variant',
        'placement': 'clustered near worksites and platforms — proof somebody sleeps here',
        'lodPlan': 'LOD1: capsule+wings; LOD2: capsule (windows baked)',
    }
    return root, meta


@register('habitat_pod_derelict')
def build_habitat_pod_derelict():
    """Derelict: dark windows, snapped wing, open hatch, patched breach. Subtraction."""
    root = root_of('habitat_pod_derelict')
    vessel(root, 'hull', (0, 0, 0), 2.5, 7.0, role='esk_paint_civic_bone', saddles=False)
    for i in range(5):
        wx = -3.0 + i * 1.5
        put(box(f'win{i}', (0.9, 0.12, 0.6), (wx, -2.44, 0.5)), 'esk_glass', root)
    put(cyl('collar', 1.2, 0.8, (-4.4, 0, 0), rot=(0, math.pi / 2, 0), verts=16),
        'esk_struct_alloy', root)
    put(cyl('hatch_open', 0.9, 0.15, (-5.1, 0.9, -0.4), rot=(0.5, math.pi / 2, 0.4), verts=16),
        'esk_bare_steel', root)
    put(beam('mast', (0.8, 0, 2.3), (0.8, 0, 3.6), 0.12), 'esk_struct_alloy', root)
    put(box('wing_p_stub', (1.6, 1.2, 0.1), (0.8, 1.0, 3.6)), 'esk_solar_cell', root)
    put(box('wing_p_snap', (1.5, 2.0, 0.1), (1.4, 2.6, 3.1), rot=(0.7, 0.2, 0.3)),
        'esk_solar_cell', root)
    put(box('wing_s', (1.6, 3.4, 0.1), (0.8, -2.1, 3.6)), 'esk_solar_cell', root)
    put(box('breach_patch', (1.8, 0.16, 1.4), (1.6, -2.42, -0.3)), 'esk_patch_plate', root)
    put(box('scorch', (1.2, 0.14, 1.0), (0.2, -2.46, 0.2), rot=(0, 0, 0.2)), 'esk_scorch', root)
    meta = {
        'family': 'civic', 'role': 'dead habitat: dark windows, snapped wing, hatch swung open',
        'states': 'this IS the derelict state of habitat_pod',
        'placement': 'failed claims, quarantine buffers, pirate territory edges',
        'lodPlan': 'as habitat_pod; the snapped wing must survive LOD1',
    }
    return root, meta


@register('shuttle_dock')
def build_shuttle_dock():
    root = root_of('shuttle_dock')
    put(box('deck', (16.0, 10.0, 0.5), (0, 0, 0)), 'esk_deck_grate', root)
    put(box('deck_frame', (16.4, 10.4, 0.6), (0, 0, -0.55)), 'esk_struct_alloy', root)
    # open-top saddles — round 1's closed hoops read as an empty cube picture frame
    hoop_rect(root, 'cradle_f', (3.0, 0, 3.2), 7.0, 5.4, r=0.22,
              role='esk_paint_civic_bone', open_top=True)
    hoop_rect(root, 'cradle_a', (-3.0, 0, 3.2), 7.0, 5.4, r=0.22,
              role='esk_paint_civic_bone', open_top=True)
    put(beam('cradle_tie_p', (3.0, 3.5, 5.9), (-3.0, 3.5, 5.9), 0.14), 'esk_struct_alloy', root)
    put(beam('cradle_tie_s', (3.0, -3.5, 5.9), (-3.0, -3.5, 5.9), 0.14), 'esk_struct_alloy', root)
    for i in range(5):
        ax = 7.4 - i * 0.0  # approach lights run OUT from the deck edge along +X
        px = 8.6 + i * 2.6
        put(beam(f'appost{i}', (px, 1.6, -0.6), (px, 1.6, 0.6), 0.07), 'esk_bare_steel', root)
        put(beam(f'appost{i}s', (px, -1.6, -0.6), (px, -1.6, 0.6), 0.07), 'esk_bare_steel', root)
        strobe(root, f'apg{i}', (px, 1.6, 0.8), 'esk_light_nav_green', r=0.13)
        strobe(root, f'apr{i}', (px, -1.6, 0.8), 'esk_light_nav_red', r=0.13)
    # fully ON the deck — round 1 hung the walkway 1.7 m off the edge unsupported
    walk = group(root, 'walk', (-2.0, 3.9, 1.3))
    put(box('walk_deck', (10.0, 2.2, 0.3), (0, 0, 0)), 'esk_paint_civic_bone', walk)
    put(box('walk_glass', (9.6, 1.8, 1.6), (0, 0, 1.05)), 'esk_glass', walk)
    put(box('walk_glow', (9.2, 0.3, 0.2), (0, -0.95, 0.6)), 'esk_light_cabin', walk)
    head = mast_std(root, 'mast', (-7.0, -4.2, 0.25), 7.0, w=0.7)
    flood(root, 'mast_fl', (head[0], head[1], head[2]), rot=(0, 0.95, 0.5), scale=1.0)
    put(box('plate', (0.06, 2.0, 0.8), (-8.24, 0, 0.45)), 'esk_id_plate', root)
    socket('SOCKET_Cradle', (0, 0, 3.4), root)
    socket('SOCKET_Approach', (14.0, 0, 1.5), root)
    meta = {
        'family': 'civic', 'role': 'shuttle cradle dock: twin hoops, handed approach light lane, glazed walkway',
        'states': 'active=approach lights+cabin glow; cold=dark lane (closed to traffic)',
        'placement': 'habitat clusters, passenger platforms; approach lane must stay clear',
        'lodPlan': 'LOD1: hoops+walkway; LOD2: slab+arch',
    }
    return root, meta


@register('observation_blister')
def build_observation_blister():
    root = root_of('observation_blister')
    put(cyl('base', 1.6, 0.8, (0, 0, 0.4), verts=16), 'esk_struct_alloy', root)
    put(cyl('stalk', 1.1, 3.2, (0, 0, 2.4), verts=16), 'esk_paint_civic_bone', root)
    put(cyl('ring', 2.9, 0.4, (0, 0, 4.2), verts=20), 'esk_paint_civic_bone', root)
    put(sphere('dome', 2.55, (0, 0, 4.9), seg=20, rings=12), 'esk_glass', root)
    # lit equator band: EEVEE renders the dome opaque, so the interior floor glow of
    # round 1 was invisible — the "occupied" read needs to live on the surface
    put(cyl('glow_band', 2.57, 0.45, (0, 0, 4.85), verts=20), 'esk_light_cabin', root)
    put(cyl('glow', 2.0, 0.15, (0, 0, 4.45), verts=18), 'esk_light_cabin', root)
    posts = []
    for i in range(8):
        ang = i * math.pi / 4
        px, py = math.cos(ang) * 3.1, math.sin(ang) * 3.1
        posts.append(beam(f'rp{i}', (px, py, 4.4), (px, py, 5.3), 0.05))
    for i in range(8):
        a0 = i * math.pi / 4
        a1 = (i + 1) * math.pi / 4
        posts.append(beam(f'rr{i}', (math.cos(a0) * 3.1, math.sin(a0) * 3.1, 5.3),
                          (math.cos(a1) * 3.1, math.sin(a1) * 3.1, 5.3), 0.05))
    put(join_objs(posts, 'balcony'), 'esk_bare_steel', root)
    strobe(root, 'nav', (0, 0, 7.6), 'esk_light_nav_green', r=0.14)
    socket('SOCKET_Dome_Focus', (0, 0, 5.2), root)
    meta = {
        'family': 'civic', 'role': 'glazed observation dome on a stalk, warm-lit floor, ring balcony',
        'states': 'occupied=floor glow; vacant=dark dome',
        'placement': 'platform corners, habitat clusters — pointed at the best view',
        'lodPlan': 'LOD1: dome+stalk; LOD2: ball on post',
    }
    return root, meta


@register('comms_array')
def build_comms_array():
    root = root_of('comms_array')
    put(box('pedestal', (3.4, 3.4, 1.6), (0, 0, 0.8)), 'esk_struct_alloy', root)
    put(cyl('yoke', 0.9, 2.6, (0, 0, 2.9), verts=14), 'esk_paint_civic_bone', root)
    dish_unit(root, 'main', (1.2, 0, 5.2), 3.0, rot=(0, 0.85, 0), role='esk_paint_civic_bone')
    # sub dishes get visible mount stubs — round 1 hung them on thin air
    put(beam('sub_a_stub', (0, 0.6, 3.8), (-1.8, 1.6, 3.6), 0.10), 'esk_struct_alloy', root)
    dish_unit(root, 'sub_a', (-1.8, 1.6, 3.6), 1.0, rot=(0, 1.3, 0.8))
    put(beam('sub_b_stub', (0, -0.6, 3.4), (-1.8, -1.6, 3.2), 0.10), 'esk_struct_alloy', root)
    dish_unit(root, 'sub_b', (-1.8, -1.6, 3.2), 1.0, rot=(0, 1.2, -0.9))
    cab = group(root, 'cab', (2.8, -2.6, 1.1))
    put(box('cab_body', (2.6, 2.0, 2.0), (0, 0, 0)), 'esk_paint_civic_bone', cab)
    put(box('cab_glass', (0.18, 1.4, 0.7), (1.32, 0, 0.3)), 'esk_glass', cab)
    put(box('cab_glow', (0.08, 1.1, 0.5), (1.37, 0, 0.3)), 'esk_light_cabin', cab)
    # ON the tilted dish's actual top rim — round 1's guessed points floated in the sky
    strobe(root, 'rim_a', (-0.78, 0, 7.45), 'esk_light_nav_red', r=0.14)
    strobe(root, 'yoke_strobe', (0, 0, 4.35), 'esk_light_nav_red', r=0.12)
    trunk(root, 'feed', ((1.7, 0, 0.6), (3.2, 1.4, 0.4), (4.4, 1.6, 0.4)), r=0.09)
    socket('SOCKET_Dish_Axis', (2.6, 0, 6.4), root)
    meta = {
        'family': 'civic', 'role': 'relay farm: one big steerable dish, two subs, manned kiosk',
        'states': 'live=kiosk glow+rim strobes; dead=dark (a cut-off outpost)',
        'placement': 'habitat clusters, platform edges, claim sites — aimed at the sky, not the ground',
        'lodPlan': 'LOD1: dishes as cones; LOD2: pedestal+one cone',
    }
    return root, meta


@register('solar_array')
def build_solar_array():
    root = root_of('solar_array')
    put(box('base', (2.6, 2.6, 0.8), (0, 0, 0.4)), 'esk_struct_alloy', root)
    put(cyl('tracker', 1.0, 1.8, (0, 0, 1.7), verts=14), 'esk_bare_steel', root)
    put(cyl('hub', 0.7, 2.4, (0, 0, 3.0), rot=(math.pi / 2, 0, 0), verts=12),
        'esk_paint_civic_bone', root)
    truss(root, 'spine_p', (0, 1.2, 3.0), (0, 9.6, 3.0), w=0.7, h=0.7, r=0.05)
    truss(root, 'spine_s', (0, -1.2, 3.0), (0, -9.6, 3.0), w=0.7, h=0.7, r=0.05)
    for i in range(4):
        py = 2.4 + i * 2.2
        put(box(f'panel_p{i}', (4.6, 2.0, 0.12), (0, py, 3.45)), 'esk_solar_cell', root)
        put(box(f'panel_s{i}', (4.6, 2.0, 0.12), (0, -py, 3.45)), 'esk_solar_cell', root)
    strobe(root, 'tip_p', (0, 10.6, 3.0), 'esk_light_nav_green', r=0.13)
    strobe(root, 'tip_s', (0, -10.6, 3.0), 'esk_light_nav_red', r=0.13)
    put(box('junction', (1.0, 1.0, 1.0), (1.6, 0, 0.5)), 'esk_paint_civic_bone', root)
    put(box('status', (0.14, 0.4, 0.18), (2.12, 0, 0.7)), 'esk_light_signal_amber', root)
    socket('SOCKET_Gimbal', (0, 0, 3.0), root)
    socket('SOCKET_Power_Out', (2.2, 0, 0.5), root)
    meta = {
        'family': 'civic', 'role': 'sun-tracking twin-wing array on span-gauge spines, handed tip lights',
        'states': 'live=amber status; wings feather edge-on when cold (re-pose at instancing)',
        'placement': 'sunward side of anything inhabited; never shadowed by radiators',
        'lodPlan': 'LOD1: wings as two boxes; LOD2: cross silhouette',
    }
    return root, meta


@register('utility_module')
def build_utility_module():
    root = root_of('utility_module')
    put(box('body', (6.0, 4.0, 3.5), (0, 0, 0)), 'esk_paint_civic_bone', root)
    # material separation — round 1 rendered as one monochrome beige box, exactly the
    # muddy read the art direction forbids
    put(box('band', (6.06, 4.06, 0.5), (0, 0, 1.2)), 'esk_paint_logistics_teal', root)
    put(box('rib_f', (0.3, 4.2, 3.7), (2.4, 0, 0)), 'esk_struct_alloy', root)
    put(box('rib_a', (0.3, 4.2, 3.7), (-2.4, 0, 0)), 'esk_struct_alloy', root)
    trunk(root, 'pipe_side', ((-2.6, -2.1, 0.8), (0.4, -2.1, 0.8), (0.4, -2.1, -1.4)), r=0.12)
    parts = []
    for i in range(2):
        parts.append(beam(f'ins{i}', (-2.6, 1.2 - i * 0.5, 1.88), (2.6, 1.2 - i * 0.5, 1.88),
                          0.14, verts=8))
    put(join_objs(parts, 'pipe_top'), 'esk_tank_insulation', root)
    put(box('vent', (1.4, 0.15, 1.0), (0.8, -2.05, 0.6)), 'esk_deck_grate', root)
    put(box('hatch_a', (1.2, 0.12, 1.6), (-1.4, -2.06, -0.6)), 'esk_paint_service_blue', root)
    put(box('hatch_b', (1.0, 0.12, 1.2), (1.8, -2.06, -0.8)), 'esk_bare_steel', root)
    put(box('radfin_a', (1.8, 0.1, 1.2), (-0.6, 0, 2.4)), 'esk_armor_plate', root)
    put(box('radfin_b', (1.8, 0.1, 1.2), (1.2, 0, 2.4)), 'esk_armor_plate', root)
    lugs = []
    for lx, ly in ((2.2, 1.6), (2.2, -1.6), (-2.2, 1.6), (-2.2, -1.6)):
        lugs.append(box(f'lug_{lx}_{ly}', (0.3, 0.3, 0.4), (lx, ly, 1.9)))
    put(join_objs(lugs, 'lugs'), 'esk_bare_steel', root)
    put(box('status', (0.14, 0.5, 0.2), (3.02, 0, 0.8)), 'esk_light_signal_amber', root)
    put(box('plate', (1.1, 0.05, 0.6), (-0.2, -2.07, -1.1)), 'esk_id_plate', root)
    socket('SOCKET_Hoist_Center', (0, 0, 2.0), root)
    meta = {
        'family': 'civic', 'role': 'life-support box: external pipe runs, vent, hatches, lift lugs',
        'states': 'running=amber status; failed=dark + one hatch open (instancing)',
        'placement': 'bolted near habitats and cabs — one per three crewed modules',
        'lodPlan': 'LOD1: body+fins; LOD2: single box',
    }
    return root, meta


@register('passenger_platform')
def build_passenger_platform():
    root = root_of('passenger_platform')
    put(box('deck', (16.0, 4.0, 0.5), (0, 0, 2.0)), 'esk_paint_civic_bone', root)
    for i, lx in enumerate((-6.5, -2.2, 2.2, 6.5)):
        put(beam(f'leg{i}', (lx, 1.4, 0), (lx, 1.4, 1.75), 0.14), 'esk_struct_alloy', root)
        put(beam(f'leg{i}b', (lx, -1.4, 0), (lx, -1.4, 1.75), 0.14), 'esk_struct_alloy', root)
    put(box('canopy', (15.4, 3.6, 0.2), (0, 0, 5.4)), 'esk_glass', root)
    for i, cx in enumerate((-6.0, -2.0, 2.0, 6.0)):
        put(beam(f'cpost{i}', (cx, 1.6, 2.25), (cx, 1.6, 5.3), 0.09), 'esk_struct_alloy', root)
        # clearly BELOW the canopy slab — round 1 buried the glow strips inside it
        put(box(f'cglow{i}', (2.6, 0.3, 0.1), (cx, 0, 5.16)), 'esk_light_cabin', root)
    for i in range(6):
        gx = -6.2 + i * 2.5
        put(box(f'guide{i}', (0.6, 0.18, 0.1), (gx, -1.85, 2.3)), 'esk_light_cabin', root)
    gate = group(root, 'gate', (8.4, 0, 2.25))
    put(beam('gpost_p', (0, 1.5, 0), (0, 1.5, 3.4), 0.12), 'esk_paint_civic_bone', gate)
    put(beam('gpost_s', (0, -1.5, 0), (0, -1.5, 3.4), 0.12), 'esk_paint_civic_bone', gate)
    put(beam('glintel', (0, 1.5, 3.4), (0, -1.5, 3.4), 0.12), 'esk_paint_civic_bone', gate)
    put(box('gsign', (0.15, 1.6, 0.6), (0, 0, 3.0)), 'esk_light_nav_green', gate)
    railing(root, 'rail', (-7.8, 1.9, 2.25), (7.8, 1.9, 2.25))
    # hanging station sign — round 1's plate floated in mid-air off the deck end
    put(beam('sign_hang_p', (-7.4, 0.5, 5.3), (-7.4, 0.5, 5.0), 0.04), 'esk_bare_steel', root)
    put(beam('sign_hang_s', (-7.4, -0.5, 5.3), (-7.4, -0.5, 5.0), 0.04), 'esk_bare_steel', root)
    put(box('plate', (0.08, 1.6, 0.8), (-7.4, 0, 4.6)), 'esk_id_plate', root)
    socket('SOCKET_Gate', (9.0, 0, 3.2), root)
    socket('SOCKET_Shuttle_Side', (0, -6.0, 2.5), root)
    meta = {
        'family': 'civic', 'role': 'covered boarding walkway: glow canopy, guide lights, green gate arch',
        'states': 'boarding=green gate+guides; closed=gate dark',
        'placement': 'between habitat clusters and shuttle docks; gate faces the dock',
        'lodPlan': 'LOD1: deck+canopy; LOD2: lit bar',
    }
    return root, meta


# ===========================================================================
# FAMILY 6 — SALVAGE & CRIMINAL (fiction §5.6). Rust + patch; hooded red light.
# The same standards, stolen: standard bones under non-matching materials.

@register('salvage_clamp')
def build_salvage_clamp():
    root = root_of('salvage_clamp')
    put(box('skid', (5.6, 3.6, 0.5), (0, 0, 0.25)), 'esk_paint_rust', root)
    put(box('winch_stand_a', (0.4, 3.2, 0.9), (-1.9, 0, 0.95)), 'esk_paint_rust', root)
    put(box('winch_stand_b', (0.4, 3.2, 0.9), (-0.9, 0, 0.95)), 'esk_paint_rust', root)
    put(cyl('winch', 1.1, 2.8, (-1.4, 0, 1.75), rot=(math.pi / 2, 0, 0), verts=14),
        'esk_bare_steel', root)
    put(beam('aframe_p', (2.2, 1.5, 0.5), (0.4, 0.2, 7.0), 0.16), 'esk_paint_rust', root)
    put(beam('aframe_s', (2.2, -1.5, 0.5), (0.4, -0.2, 7.0), 0.16), 'esk_paint_rust', root)
    put(box('apex_cap', (0.6, 1.1, 0.3), (0.4, 0, 7.05)), 'esk_bare_steel', root)
    put(beam('brace', (-1.4, 0, 2.9), (0.35, 0, 6.8), 0.13), 'esk_bare_steel', root)
    put(beam('cable_a', (-1.4, 0.4, 2.4), (0.5, 0.25, 6.6), 0.05), 'esk_pipe_steel', root)
    put(beam('drop_a', (0.42, 0.15, 6.9), (0.6, 0.15, 4.9), 0.05), 'esk_pipe_steel', root)
    put(beam('drop_b', (0.42, -0.15, 6.9), (0.6, -0.15, 4.9), 0.05), 'esk_pipe_steel', root)
    put(cyl('hinge', 0.35, 1.5, (0.6, 0, 4.7), rot=(math.pi / 2, 0, 0), verts=10),
        'esk_bare_steel', root)
    # opposing thick grab jaws with teeth — round 1's thin rotated plates hung like
    # tarps off the hinge
    put(box('jaw_p', (1.7, 0.5, 2.0), (0.9, 0.72, 3.55), rot=(0.22, -0.15, 0)),
        'esk_scorch', root)
    put(box('jaw_s', (1.7, 0.5, 2.0), (0.9, -0.72, 3.55), rot=(-0.22, -0.15, 0)),
        'esk_scorch', root)
    put(box('tooth_p', (1.5, 0.3, 0.5), (0.75, 0.55, 2.55), rot=(0.22, -0.15, 0)),
        'esk_bare_steel', root)
    put(box('tooth_s', (1.5, 0.3, 0.5), (0.75, -0.55, 2.55), rot=(-0.22, -0.15, 0)),
        'esk_bare_steel', root)
    hood = group(root, 'hood', (0.4, 0, 7.28))
    put(box('hood_shade', (0.7, 0.7, 0.15), (0, 0, 0.12)), 'esk_paint_rust', hood)
    put(box('hood_lens', (0.4, 0.4, 0.08), (0, 0, -0.02)), 'esk_light_hooded_red', hood)
    socket('SOCKET_Jaw', (0.9, 0, 2.8), root)
    meta = {
        'family': 'salvage', 'role': 'free-standing grab: winch, A-frame, scorched jaws, hooded red lamp',
        'states': 'working=jaws at a carcass; idle=jaws hang empty',
        'placement': 'shipbreaking yards, wreck fields — jaws toward the meat',
        'lodPlan': 'LOD1: frame+jaws; LOD2: tripod blob',
    }
    return root, meta


@register('scrap_cage')
def build_scrap_cage():
    root = root_of('scrap_cage')
    posts = []
    for px, py in ((4.4, 2.9), (4.4, -2.9), (-4.4, 2.9), (-4.4, -2.9)):
        posts.append(beam(f'p_{px}_{py}', (px, py, -2.4), (px, py, 2.6), 0.12))
    for lz in (-2.4, 0.1, 2.6):
        posts.append(beam(f'rl{lz}a', (4.4, 2.9, lz), (-4.4, 2.9, lz), 0.09))
        posts.append(beam(f'rl{lz}b', (4.4, -2.9, lz), (-4.4, -2.9, lz), 0.09))
        posts.append(beam(f'rl{lz}c', (4.4, 2.9, lz), (4.4, -2.9, lz), 0.09))
    for i, x0 in enumerate((-4.0, -1.2, 1.6)):
        posts.append(beam(f'mesh_p{i}', (x0, 2.9, -2.4), (x0 + 1.8, 2.9, 2.6), 0.05))
        posts.append(beam(f'mesh_s{i}', (x0 + 1.8, -2.9, -2.4), (x0, -2.9, 2.6), 0.05))
    put(join_objs(posts, 'cage'), 'esk_paint_rust', root)
    put(box('floor', (8.8, 5.8, 0.25), (0, 0, -2.5)), 'esk_deck_grate', root)
    # a proper rectangular gate panel swung ~50 deg open — round 1's three-beam L at
    # yaw 2.5 read as a bent goalpost floating beside the cage
    gate = group(root, 'gate', (-4.4, -2.9, 0), yaw=0.9)
    gparts = [beam('g_a', (0, 0, -2.4), (0, 0, 2.6), 0.1),
              beam('g_b', (0, 0, 2.6), (0, 2.4, 2.6), 0.08),
              beam('g_c', (0, 2.4, 2.6), (0, 2.4, -2.4), 0.1),
              beam('g_d', (0, 2.4, -2.4), (0, 0, -2.4), 0.08),
              beam('g_dg', (0, 0, -2.4), (0, 2.4, 2.6), 0.05)]
    for gp in gparts:
        gp.parent = gate
    # no parent arg: the joined panel must STAY under the yawed gate group
    put(join_objs(gparts, 'gate_panel'), 'esk_paint_rust')
    # junk stays INSIDE the bars (round 1's chunks poked through the mesh)
    junk = (((0.4, 0.3, -1.6), (2.4, 1.7, 1.2), (0.5, 0.2, 0.8), 'esk_scorch'),
            ((-1.6, -0.8, -1.3), (2.0, 1.5, 1.0), (0.2, 0.7, 0.3), 'esk_patch_plate'),
            ((1.9, -0.9, -1.5), (1.7, 1.3, 1.2), (0.8, 0.1, 0.5), 'esk_bare_steel'),
            ((-0.4, 0.9, -0.5), (1.9, 1.1, 0.9), (0.4, 0.9, 0.1), 'esk_scorch'),
            ((1.2, 0.7, 0.3), (1.5, 1.0, 0.8), (0.1, 0.5, 0.9), 'esk_patch_plate'),
            ((-2.3, 0.1, 0.0), (1.6, 1.2, 0.8), (0.6, 0.3, 0.6), 'esk_bare_steel'))
    for i, (loc, size, rot, role) in enumerate(junk):
        put(box(f'junk{i}', size, loc, rot=rot), role, root)
    hood = group(root, 'hood', (4.4, 2.9, 2.78))
    put(box('hood_shade', (0.6, 0.6, 0.14), (0, 0, 0.1)), 'esk_paint_rust', hood)
    put(box('hood_lens', (0.34, 0.34, 0.07), (0, 0, -0.02)), 'esk_light_hooded_red', hood)
    socket('SOCKET_Gate', (-4.4, -2.9, 0), root)
    meta = {
        'family': 'salvage', 'role': 'scrap holding cage, crushed hull chunks inside, gate swung open',
        'states': 'full=junk load; empty=bare cage (subtraction)',
        'placement': 'shipbreaking yards, black-market aprons; gate faces the work',
        'lodPlan': 'LOD1: cage as lattice box+junk lump; LOD2: solid box',
    }
    return root, meta


@register('hull_rack')
def build_hull_rack():
    root = root_of('hull_rack')
    truss(root, 'frame_f', (8.0, -3.0, 0), (8.0, 3.0, 0), w=1.0, h=1.0, r=0.07)
    truss(root, 'end_f_p', (8.0, 3.0, 0), (8.0, 3.0, 6.5), w=1.0, h=1.0, r=0.07)
    truss(root, 'end_f_s', (8.0, -3.0, 0), (8.0, -3.0, 6.5), w=1.0, h=1.0, r=0.07)
    truss(root, 'frame_a', (-8.0, -3.0, 0), (-8.0, 3.0, 0), w=1.0, h=1.0, r=0.07)
    truss(root, 'end_a_p', (-8.0, 3.0, 0), (-8.0, 3.0, 6.5), w=1.0, h=1.0, r=0.07)
    truss(root, 'end_a_s', (-8.0, -3.0, 0), (-8.0, -3.0, 6.5), w=1.0, h=1.0, r=0.07)
    put(beam('spine_p', (8.0, 3.0, 6.5), (-8.0, 3.0, 6.5), 0.14), 'esk_paint_rust', root)
    put(beam('spine_s', (8.0, -3.0, 6.5), (-8.0, -3.0, 6.5), 0.14), 'esk_paint_rust', root)
    # bottom rest rails: round 1 had nothing between the end frames and the three
    # sections floated in mid-air
    truss(root, 'bed_p', (-8.0, 2.2, 0.55), (8.0, 2.2, 0.55), w=0.6, h=0.6, r=0.06)
    truss(root, 'bed_s', (-8.0, -2.2, 0.55), (8.0, -2.2, 0.55), w=0.6, h=0.6, r=0.06)
    for i, sx in enumerate((-5.0, 0.4, 5.4)):
        sect = group(root, f'sect{i}', (sx, 0, 3.2), yaw=0.12 * (i - 1))
        hoop_rect(sect, f's{i}_rib_a', (-1.6, 0, 0), 5.2, 4.6, r=0.13, role='esk_bare_steel')
        hoop_rect(sect, f's{i}_rib_b', (1.6, 0, 0), 5.2, 4.6, r=0.13, role='esk_bare_steel')
        put(beam(f's{i}_str_a', (-1.6, -2.6, 2.3), (1.6, -2.6, 2.3), 0.1), 'esk_bare_steel', sect)
        put(beam(f's{i}_str_b', (-1.6, -2.6, -2.3), (1.6, -2.6, -2.3), 0.1), 'esk_bare_steel', sect)
        skin_y = -2.62 if i == 0 else 2.62
        if i != 1:
            put(box(f's{i}_skin', (3.0, 0.14, 2.2), (0, skin_y, -0.8)), 'esk_patch_plate', sect)
        # torch scars ride the bottom strap, not the open rib bay
        put(box(f's{i}_scorch', (2.4, 0.2, 0.4), (0, -2.6, -2.15)), 'esk_scorch', sect)
    hood = group(root, 'hood', (8.0, 0, 6.72))
    put(box('hood_shade', (0.7, 0.7, 0.15), (0, 0, 0.12)), 'esk_paint_rust', hood)
    put(box('hood_lens', (0.4, 0.4, 0.08), (0, 0, -0.02)), 'esk_light_hooded_red', hood)
    socket('SOCKET_Next_Section', (0.4, 0, 3.2), root)
    meta = {
        'family': 'salvage', 'role': 'shipbreaking rack: three stripped rib sections, torch scars, part skins',
        'states': 'working=sections racked; picked-clean=empty frame',
        'placement': 'the centerpiece of any breaking yard; sections read as somebody\'s ex-ship',
        'lodPlan': 'LOD1: sections as open boxes; LOD2: goalpost pair',
    }
    return root, meta


@register('illicit_transfer_frame')
def build_illicit_transfer_frame():
    """Two mismatched berths on a patched spine. No strobes, no nav lights — the
    absence of honest light IS the criminal signal (fiction §2)."""
    root = root_of('illicit_transfer_frame')
    put(box('spine', (2.2, 12.0, 1.4), (0, 0, 0)), 'esk_patch_plate', root)
    put(box('spine_patch_a', (2.4, 2.6, 1.5), (0, 2.4, 0.05)), 'esk_bare_steel', root)
    put(box('spine_patch_b', (2.35, 1.8, 1.45), (0, -3.1, -0.05)), 'esk_scorch', root)
    # berths need VERTICAL cradle structure — round 1 authored both as flat frames at
    # one z level and they read as wireframe outlines lying on the ground.
    # berth A: two upright stolen-logistics hoops (teal) the pod nests between
    hoop_rect(root, 'berthA_f', (6.6, 3.9, 1.7), 4.0, 3.4, r=0.16,
              role='esk_paint_logistics_teal', open_top=True)
    hoop_rect(root, 'berthA_a', (3.4, 3.9, 1.7), 4.0, 3.4, r=0.16,
              role='esk_paint_logistics_teal', open_top=True)
    put(beam('berthA_tie', (6.6, 5.9, 3.2), (3.4, 5.9, 3.2), 0.12), 'esk_patch_plate', root)
    pod_unit(root, 'held_pod', (5.0, 3.9, 1.6), yaw=0.08)
    # berth B: stolen mining beams (ochre) as V-posts, a DIFFERENT gauge — no match
    for i, bx in enumerate((3.6, 6.2)):
        put(beam(f'berthB{i}_l', (bx, -2.4, 0.4), (bx, -3.9, 2.4), 0.2),
            'esk_paint_industrial_ochre', root)
        put(beam(f'berthB{i}_r', (bx, -5.4, 0.4), (bx, -3.9, 2.4), 0.2),
            'esk_paint_industrial_ochre', root)
    put(beam('berthB_tie', (3.6, -3.9, 2.4), (6.2, -3.9, 2.4), 0.16),
        'esk_paint_industrial_ochre', root)
    for i, (py, hz) in enumerate(((3.9, 3.5), (-3.9, 2.75))):
        hood = group(root, f'hood{i}', (5.0, py, hz))
        put(box(f'h{i}_shade', (0.9, 0.9, 0.16), (0, 0, 0.12)), 'esk_patch_plate', hood)
        put(box(f'h{i}_lens', (0.5, 0.5, 0.08), (0, 0, -0.02)), 'esk_light_hooded_red', hood)
        put(beam(f'h{i}_post', (0, 0.55, 0.1), (0, 0.9, -0.5), 0.05), 'esk_bare_steel', hood)
    put(box('cut_hazard', (1.1, 0.4, 0.2), (0, 5.9, 0.8)), 'esk_hazard_stripe', root)
    socket('SOCKET_Berth_A', (5.0, 3.9, 1.2), root)
    socket('SOCKET_Berth_B', (4.6, -3.9, 1.2), root)
    meta = {
        'family': 'salvage', 'role': 'smuggler transfer frame: two stolen-parts berths, hooded light only',
        'states': 'live=pod in berth A; the missing nav/strobe lights ARE the tell',
        'placement': 'shadow sides of rocks, off-lane voids, blackmarket approaches',
        'lodPlan': 'LOD1: spine+berth frames; LOD2: H-frame',
    }
    return root, meta


@register('improvised_dock')
def build_improvised_dock():
    """A Berth pod re-plated into a control shack + a docking arm of truss offcuts in
    two gauges. Faction-modified doctrine: non-standard additions on standard bones."""
    root = root_of('improvised_dock')
    g = pod_unit(root, 'shack', (0, 0, 0), role='esk_paint_logistics_teal')
    put(box('shack_window', (0.14, 1.6, 0.9), (3.02, 0, 0.3)), 'esk_glass', g)
    put(box('shack_glow', (0.06, 1.2, 0.6), (3.08, 0, 0.3)), 'esk_light_hooded_red', g)
    put(box('shack_patch_a', (2.0, 0.16, 1.4), (-1.2, -1.55, 0.4)), 'esk_patch_plate', g)
    put(box('shack_patch_b', (1.4, 0.16, 1.0), (0.8, 1.55, -0.6), rot=(0, 0, 0.12)),
        'esk_bare_steel', g)
    # arm roots INTO the shack via a welded mount plate — round 1's truss sprang from
    # thin air above the pod corner, and the catwalk plank floated touching nothing
    put(box('arm_mount', (1.6, 1.2, 0.6), (0, 1.35, 1.5)), 'esk_patch_plate', root)
    truss(root, 'arm_a', (0, 1.3, 1.4), (2.8, 6.2, 2.4), w=0.8, h=0.8, r=0.06)
    truss(root, 'arm_b', (2.8, 6.2, 2.4), (5.4, 9.8, 2.1), w=0.5, h=0.5, r=0.05,
          role='esk_paint_rust')
    put(box('walk', (0.9, 5.0, 0.14), (1.35, 3.85, 1.5), rot=(0, 0, -0.54)),
        'esk_patch_plate', root)
    put(beam('walk_hang_a', (0.7, 2.6, 1.57), (0.7, 2.6, 1.95), 0.04), 'esk_bare_steel', root)
    put(beam('walk_hang_b', (2.0, 5.1, 1.57), (2.0, 5.1, 2.15), 0.04), 'esk_bare_steel', root)
    put(box('hookplate', (1.4, 1.4, 0.3), (5.4, 9.8, 1.85)), 'esk_bare_steel', root)
    put(beam('hook_a', (5.4, 9.8, 1.75), (5.9, 10.4, 1.1), 0.09), 'esk_bare_steel', root)
    put(beam('hook_b', (5.9, 10.4, 1.1), (5.5, 10.7, 0.8), 0.07), 'esk_bare_steel', root)
    hood = group(root, 'hood', (5.4, 9.8, 2.48))
    put(box('hood_shade', (0.6, 0.6, 0.14), (0, 0, 0.1)), 'esk_patch_plate', hood)
    put(box('hood_lens', (0.35, 0.35, 0.07), (0, 0, -0.02)), 'esk_light_hooded_red', hood)
    socket('SOCKET_Berth', (5.4, 12.0, 1.5), root)
    meta = {
        'family': 'salvage', 'role': 'cobbled dock: pod-turned-shack, two-gauge scavenged arm, dim red window',
        'states': 'occupied=window glow; the mismatched gauges never change',
        'placement': 'pirate coves, unlicensed claims, anywhere authority is not',
        'lodPlan': 'LOD1: pod+arm; LOD2: L-shape',
    }
    return root, meta


@register('pirate_sensor_mast')
def build_pirate_sensor_mast():
    """The sensor_mast standard, stolen: leaning column, spliced mid-height, a navy
    authority dish aimed LOW along the lane, asymmetric guys, hooded tell-tale."""
    root = root_of('pirate_sensor_mast')
    lean = 0.105
    top = (11.0 * math.sin(lean), 0, 11.0 * math.cos(lean))
    truss(root, 'col_lo', (0, 0, 0), (top[0] * 0.5, 0, top[2] * 0.5), w=0.9, h=0.9, r=0.06,
          role='esk_paint_rust')
    truss(root, 'col_hi', (top[0] * 0.5, 0, top[2] * 0.5), top, w=0.75, h=0.75, r=0.05)
    put(box('splice', (1.3, 1.3, 1.0), (top[0] * 0.5, 0, top[2] * 0.5)), 'esk_patch_plate', root)
    put(box('foot', (2.0, 2.0, 0.4), (0, 0, 0.2)), 'esk_paint_rust', root)
    dish_unit(root, 'stolen_dish', (top[0] + 0.5, 0, top[2] - 1.2), 1.3,
              rot=(0, 1.45, 0), role='esk_paint_authority_navy')
    dish_unit(root, 'side_dish', (top[0] * 0.6, 1.0, top[2] * 0.6 + 0.4), 0.7,
              rot=(-1.35, 0.3, 0), role='esk_bare_steel')
    put(cyl('drum', 0.7, 1.3, (top[0] * 0.8, -0.6, top[2] * 0.8), verts=12),
        'esk_scorch', root)
    for i, (gy, gx) in enumerate(((3.4, -2.0), (-2.6, -2.6), (-3.8, 2.2))):
        put(beam(f'guy{i}', (top[0] * 0.9, 0, top[2] * 0.9), (gx, gy, 0.1), 0.04),
            'esk_pipe_steel', root)
        put(box(f'guyplate{i}', (0.7, 0.7, 0.2), (gx, gy, 0.05)), 'esk_bare_steel', root)
    put(beam('hood_post', (top[0], 0, top[2]), (top[0], 0, top[2] + 0.35), 0.05),
        'esk_bare_steel', root)
    hood = group(root, 'hood', (top[0], 0, top[2] + 0.42))
    put(box('hood_shade', (0.55, 0.55, 0.13), (0, 0, 0.1)), 'esk_patch_plate', hood)
    put(box('hood_lens', (0.3, 0.3, 0.06), (0, 0, -0.02)), 'esk_light_hooded_red', hood)
    socket('SOCKET_Listen', (top[0] + 0.9, 0, top[2] - 1.2), root)
    meta = {
        'family': 'salvage', 'role': 'pirate ear: leaning spliced mast, stolen navy dish aimed at the lane',
        'states': 'watching=hooded tell-tale only; never a strobe',
        'placement': 'rock shadows overlooking trade lanes; dish axis = the watched lane',
        'lodPlan': 'LOD1: mast+big dish; LOD2: leaning post',
    }
    return root, meta


@register('power_skid_patched')
def build_power_skid_patched():
    """The power_skid standard, faction-modified: mismatched fin, patched core,
    hooded status, rust cabinet. Stolen infrastructure keeps working — barely."""
    root = root_of('power_skid_patched')
    put(box('skid', (5.0, 3.0, 0.4), (0, 0, 0.2)), 'esk_paint_rust', root)
    put(box('runner_p', (5.4, 0.3, 0.3), (0, 1.35, 0.0)), 'esk_bare_steel', root)
    put(box('runner_s', (5.4, 0.3, 0.3), (0, -1.35, 0.0)), 'esk_bare_steel', root)
    vessel(root, 'core', (-0.6, 0, 1.7), 1.15, 2.8, role='esk_tank_shell')
    put(box('core_patch', (1.4, 0.2, 1.2), (-0.6, 1.1, 1.9), rot=(0.3, 0, 0.1)),
        'esk_patch_plate', root)
    put(box('fin_wrong', (1.5, 0.14, 2.6), (-0.7, 0, 4.1), rot=(0, 0, 0.14)),
        'esk_radiator_hot', root)
    put(box('fin_frame', (1.7, 0.2, 0.2), (-0.75, 0, 5.4), rot=(0, 0, 0.14)),
        'esk_patch_plate', root)
    put(box('cabinet', (1.4, 2.4, 1.9), (1.9, 0, 1.35)), 'esk_paint_rust', root)
    put(box('cab_patch', (0.2, 1.1, 0.9), (2.62, 0.5, 1.1)), 'esk_bare_steel', root)
    hood = group(root, 'hood', (2.62, -0.6, 1.9), yaw=0)
    put(box('hood_shade', (0.2, 0.5, 0.3), (0.05, 0, 0.16)), 'esk_paint_rust', hood)
    put(box('hood_lens', (0.1, 0.4, 0.16), (0.06, 0, 0)), 'esk_light_hooded_red', hood)
    trunk(root, 'cable', ((2.6, -0.8, 0.5), (3.6, -1.4, 0.3), (4.6, -1.5, 0.3)), r=0.11)
    put(box('plug_taped', (0.5, 0.5, 0.5), (4.9, -1.5, 0.35)), 'esk_patch_plate', root)
    socket('SOCKET_Power_Out', (5.1, -1.5, 0.35), root)
    meta = {
        'family': 'salvage', 'role': 'stolen reactor skid: patched core, wrong fin, hooded status lamp',
        'states': 'this IS the faction-modified state of power_skid',
        'placement': 'powering illicit frames and improvised docks (trunk must reach)',
        'lodPlan': 'as power_skid',
    }
    return root, meta


# ===========================================================================
# Families and composition scenes.

FAMILIES = {
    'cargo': ['cargo_pod_standard', 'cargo_pod_hazmat', 'cargo_pod_standard_breached',
              'ore_bulk_container', 'container_rack', 'container_rack_abandoned',
              'transfer_arm', 'tanker_coupling', 'freight_platform'],
    'mining': ['drill_platform', 'drill_platform_cold', 'crusher_module', 'ore_sorter',
               'slurry_tank', 'radiator_bank', 'conveyor_truss', 'extraction_mast'],
    'service': ['maintenance_gantry', 'repair_scaffold', 'repair_scaffold_bent',
                'construction_frame', 'welding_drone', 'parts_rack', 'power_skid',
                'worklight_tower'],
    'law': ['customs_pylon', 'inspection_platform', 'interdiction_buoy',
            'transponder_gate', 'sensor_mast', 'traffic_signal'],
    'civic': ['habitat_pod', 'habitat_pod_derelict', 'shuttle_dock', 'observation_blister',
              'comms_array', 'solar_array', 'utility_module', 'passenger_platform'],
    'salvage': ['salvage_clamp', 'scrap_cage', 'hull_rack', 'illicit_transfer_frame',
                'improvised_dock', 'pirate_sensor_mast', 'power_skid_patched'],
}

# Each composition is a placement list a later lane can replay by instancing kit
# pieces: (assetId, x, y, z, yawDeg). Staging props (rocks, client hulls, work beams)
# are render-only and recorded separately in compositions.json.
COMPOSITIONS = {
    'comp1_mining_worksite': {
        'title': 'active mining worksite',
        'instances': [
            ('drill_platform', 0, 0, 0, 0),
            ('crusher_module', 26, -6, 0, 175),
            ('conveyor_truss', 46, 0, 1.2, 20),
            ('ore_bulk_container', 62, 10, 0, 12),
            ('ore_bulk_container', 63, 1, 0, -8),
            ('extraction_mast', -12, 10, 0, 0),
            ('extraction_mast', 14, 16, 0, 40),
            ('radiator_bank', -6, -24, 0, 90),
            ('slurry_tank', 16, -22, 0, 10),
            ('power_skid', -12, -8, 0, 30),
        ],
        'staging': ['seamed boulder under the drill bit', 'amber cut beam bit-to-rock',
                    'cable trunk power_skid-to-drill'],
        'camera': {'target': (22, -2, 0), 'radius': 76},
    },
    'comp2_refinery_loading': {
        'title': 'refinery loading dock',
        'instances': [
            ('freight_platform', 0, 0, 0, 0),
            ('container_rack', 20, 9, 0, 90),
            ('container_rack', 20, -8, 0, 90),
            ('transfer_arm', 4, 13, 0, -35),
            ('tanker_coupling', -17, -10, 0, 25),
            ('worklight_tower', -15, 11, 0, 0),
            ('cargo_pod_standard', 28, 1, 0.8, 5),
            ('cargo_pod_hazmat', -12, -16, 1.0, -12),
            ('traffic_signal', -8, -18, 0, 90),
        ],
        'staging': ['pod hanging at the transfer-arm grapple', 'tanker berth held clear'],
        'camera': {'target': (4, -1, 2), 'radius': 62},
    },
    'comp3_customs_checkpoint': {
        'title': 'customs checkpoint',
        'instances': [
            ('transponder_gate', 0, 0, 0, 0),
            ('customs_pylon', -9, 15, 0, 0),
            ('customs_pylon', -9, -15, 0, 0),
            ('inspection_platform', -30, 19, 0, -15),
            ('interdiction_buoy', 16, 11, 3, 0),
            ('interdiction_buoy', 16, -11, 3, 0),
            ('sensor_mast', -22, -15, 0, 0),
            ('traffic_signal', 8, 13, 0, 180),
        ],
        'staging': ['held pod in the inspection cradle', 'arc-blue scan beam pylon-to-pod'],
        'camera': {'target': (-8, 0, 5), 'radius': 64},
    },
    'comp4_repair_yard': {
        'title': 'repair yard',
        'instances': [
            ('maintenance_gantry', 0, 0, 0, 0),
            ('repair_scaffold', 1.5, 6.8, 1.6, 0),
            ('welding_drone', 3, 4.2, 5.6, -20),
            ('welding_drone', -4, 4.8, 4.4, 160),
            ('welding_drone', 5, -3.8, 5.2, 90),
            ('parts_rack', -15, -8, 0, 10),
            ('power_skid', 14, -10, 0, -5),
            ('worklight_tower', -14, 10, 0, 0),
            ('worklight_tower', 16, 8, 0, 0),
            ('repair_scaffold_bent', -18, 3, 0, 75),
        ],
        'staging': ['scorched client hull slab under the gantry', 'blue weld arcs drone-to-hull',
                    'cable trunk power_skid-to-gantry-leg'],
        'camera': {'target': (-1, 0, 3), 'radius': 56},
    },
    'comp5_shipbreaking_yard': {
        'title': 'salvage / shipbreaking yard',
        'instances': [
            ('hull_rack', 0, 0, 0, 0),
            ('salvage_clamp', 15, -8, 0, -30),
            ('scrap_cage', -14, -11, 0, 8),
            ('scrap_cage', -22, -4, 0, -14),
            ('improvised_dock', -6, 15, 0, 170),
            ('illicit_transfer_frame', 17, 12, 0, -60),
            ('pirate_sensor_mast', -21, 9, 0, 0),
            ('power_skid_patched', 8, -15, 0, 12),
            ('cargo_pod_standard_breached', 24, 2, 0.6, 33),
        ],
        'staging': ['drifting cut slabs', 'orange cutter arc at the clamp jaw'],
        'camera': {'target': (0, 0, 3), 'radius': 62},
    },
    'comp6_station_construction': {
        'title': 'station construction zone',
        'instances': [
            ('construction_frame', 0, 0, 0, 0),
            ('maintenance_gantry', 6, 0, 0, 0),
            ('welding_drone', 10, 2, 4, -140),
            ('welding_drone', -2, -3, 5, 30),
            ('solar_array', -26, 15, 2, 20),
            ('comms_array', 24, -14, 0, -25),
            ('habitat_pod', -22, -13, 1, 5),
            ('utility_module', -15, -13, 0.5, 5),
            ('power_skid', -8, -15, 0, 0),
            ('parts_rack', 14, 11, 0, -80),
            ('worklight_tower', -16, 8, 0, 0),
        ],
        'staging': ['staged skin panels at the bare bays', 'blue weld arcs on the forward ribs'],
        'camera': {'target': (0, -1, 2), 'radius': 58},
    },
}


# ---------------------------------------------------------------------------
# Export / measure / render machinery (shape shared with build_npc_activity_pack.py
# so review tooling and habits transfer).

def stabilize_mesh_for_export(obj):
    """Force a deterministic triangle stream for the glTF exporter.

    Diagnosis (Blender 5.1.2, factory-startup, no RNG authoring): two consecutive
    exports of the same hierarchy produced identical glTF JSON, identical vertex
    buffers, and identical triangle *sets*, but a different triangle *index order*
    on ~half the pack. That alone flips the GLB SHA-256. Cause is exporter-side
    loop-triangle / primitive serialization order on multi-face meshes (esp. joined
    trusses and cylinders), not authored geometry or wall-clock input.

    Cure: triangulate with FIXED/EAR_CLIP, then rebuild the mesh so face order is a
    pure function of (material_index, sorted vertex indices, winding). Vertex order
    is left alone — it is already stable across runs.
    """
    if obj is None or obj.type != 'MESH' or obj.data is None:
        return
    mesh = obj.data
    if len(mesh.polygons) == 0:
        return

    materials = list(mesh.materials)
    use_auto_smooth = bool(getattr(mesh, 'use_auto_smooth', False))
    auto_smooth_angle = float(getattr(mesh, 'auto_smooth_angle', 0.523599))

    bm = bmesh.new()
    try:
        bm.from_mesh(mesh)
        bmesh.ops.triangulate(
            bm,
            faces=list(bm.faces),
            quad_method='FIXED',
            ngon_method='EAR_CLIP',
        )
        bm.faces.ensure_lookup_table()
        bm.verts.ensure_lookup_table()
        bm.normal_update()

        # Preserve vertex order; only faces are reordered.
        verts = [tuple(v.co) for v in bm.verts]
        face_rows = []
        for face in bm.faces:
            idxs = [v.index for v in face.verts]
            if len(idxs) != 3:
                raise RuntimeError(
                    f'stabilize_mesh_for_export({obj.name}): non-triangle face {idxs}'
                )
            face_rows.append((
                int(face.material_index),
                tuple(sorted(idxs)),
                tuple(idxs),
            ))
        face_rows.sort()
        faces = [row[2] for row in face_rows]
        mat_indices = [row[0] for row in face_rows]
    finally:
        bm.free()

    new_mesh = bpy.data.meshes.new(mesh.name)
    new_mesh.from_pydata(verts, [], faces)
    new_mesh.update(calc_edges=True)
    for poly, mat_index in zip(new_mesh.polygons, mat_indices):
        poly.material_index = mat_index
    for mat in materials:
        new_mesh.materials.append(mat)
    if hasattr(new_mesh, 'use_auto_smooth'):
        new_mesh.use_auto_smooth = use_auto_smooth
        new_mesh.auto_smooth_angle = auto_smooth_angle
    # Keep a consistent smooth flag across rebuilds.
    for poly in new_mesh.polygons:
        poly.use_smooth = False
    new_mesh.validate(clean_customdata=True)
    new_mesh.update()

    old_mesh = obj.data
    obj.data = new_mesh
    if old_mesh.users == 0:
        bpy.data.meshes.remove(old_mesh)


def iter_export_objects(root):
    """Name-sorted hierarchy walk so selection/export order never depends on
    Blender's internal object list cursor."""
    objs = [root] + list(root.children_recursive)
    objs.sort(key=lambda o: o.name)
    return objs


def export_glb(root, path):
    bpy.context.view_layer.update()
    # Stabilize every mesh *before* selection so the exporter sees a fixed
    # triangle stream even if it walks objects in an internal order.
    for obj in iter_export_objects(root):
        stabilize_mesh_for_export(obj)
    bpy.context.view_layer.update()
    path.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.object.select_all(action='DESELECT')
    export_objs = iter_export_objects(root)
    for obj in export_objs:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = root
    bpy.ops.export_scene.gltf(
        filepath=str(path), export_format='GLB', use_selection=True,
        export_apply=True, export_yup=True,
        export_texcoords=True, export_normals=True,
        export_materials='EXPORT', export_extras=True,
    )
    return hashlib.sha256(path.read_bytes()).hexdigest()


def glb_generator_record(path):
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
    """Frame the prop. Irradiance falls with distance SQUARED: energy scales with d^2
    (the npc pack's round-1 renders proved linear scaling turns every large subject
    to mud). Calibrated against the same reference exposure (E ~= 115 * d^2)."""
    d = distance if distance is not None else radius * 2.2
    bpy.ops.object.camera_add(location=(d * 0.62, -d * 0.72, d * 0.44))
    cam = bpy.context.active_object
    cam.data.lens = 50
    direction = Vector(target) - cam.location
    cam.rotation_euler = direction.to_track_quat('-Z', 'Y').to_euler()
    bpy.context.scene.camera = cam
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


def distance_bands(size_max):
    """Props are set dressing inside the R1 bubble; review them at the ranges their
    size class actually occupies on screen (a 1.9 m drone at 165 wu is one pixel and
    proves nothing)."""
    if size_max < 8.0:
        return (30, 60, 110)
    if size_max <= 20.0:
        return (60, 95, 145)
    return (95, 125, 165)


def _label(text, loc, size=3.2):
    bpy.ops.object.text_add(location=loc, rotation=(math.pi / 2, 0, math.pi / 2))
    t = bpy.context.active_object
    t.data.body = text
    t.data.size = size
    t.data.align_x = 'CENTER'
    t.name = f'label_{text}'
    mat = material('esk_light_flood')
    t.data.materials.clear()
    t.data.materials.append(mat)
    return t


def render_family_sheet(fam, ids, shot_path):
    """One family per sheet, labelled: the identification exhibit. Members sit on a
    grid; the grid must survive the largest member (26 m construction frame)."""
    reset_scene()
    cols = 3 if len(ids) <= 9 else 4
    sp = 40.0
    rows = (len(ids) + cols - 1) // cols
    for idx, pid in enumerate(ids):
        col = idx % cols
        row = idx // cols
        cx = (rows - 1) * sp * 0.5 - row * sp
        cy = (cols - 1) * sp * 0.5 - col * sp
        root, _meta = BUILDERS[pid]()
        root.location = Vector((cx, cy, 0.0))
        bpy.context.view_layer.update()
        _label(pid, (cx - sp * 0.38, cy, -13.0))
    bpy.context.view_layer.update()
    extent = sp * max(rows, cols)
    setup_render((-6, 0, 0), extent * 0.52)
    bpy.context.scene.render.resolution_x = 1920
    bpy.context.scene.render.resolution_y = 1400
    bpy.context.scene.render.filepath = str(shot_path)
    bpy.ops.render.render(write_still=True)
    log(f'wrote {shot_path.name}')


# --- composition staging props (render-only, never exported) ---------------

def _stage_boulder(name, loc, r):
    for i, (dx, dy, dz, sx, sy, sz) in enumerate((
            (0, 0, 0, 1.0, 0.85, 0.7), (r * 0.6, r * 0.3, -r * 0.2, 0.6, 0.7, 0.55),
            (-r * 0.5, -r * 0.35, r * 0.25, 0.55, 0.5, 0.6))):
        o = sphere(f'{name}_{i}', r, (loc[0] + dx, loc[1] + dy, loc[2] + dz), seg=12, rings=8)
        o.scale = Vector((sx, sy, sz))
        bpy.ops.object.transform_apply(scale=True)
        put(o, 'esk_ore_raw')


def _stage_beam(name, a, b, radius, role):
    put(beam(name, a, b, radius), role)


def _stage_slab(name, loc, size, rot=(0, 0, 0)):
    put(box(name, size, loc, rot), 'esk_scorch')


def _stage_composition(comp_id):
    # staged light beams are board-scale props: at a 50-70 wu camera radius the
    # asset-scale radii vanish, so they are deliberately thick here
    if comp_id == 'comp1_mining_worksite':
        _stage_boulder('stg_seam', (0, 0, -9.5), 5.5)
        _stage_beam('stg_cut', (0, 0, -7.0), (0.6, 0.8, -8.6), 0.32, 'esk_light_mining')
        _stage_beam('stg_trunk', (-7.2, -8.4, 0.3), (-4.4, -3.0, 0.4), 0.14, 'esk_pipe_steel')
        _stage_beam('stg_trunk2', (-4.4, -3.0, 0.4), (-2.6, -1.4, 0.6), 0.14, 'esk_pipe_steel')
    elif comp_id == 'comp2_refinery_loading':
        # pod at the grapple head: arm at (4,13) yawed -35 deg, head 15.5 m out
        hx = 4 + 15.5 * math.cos(math.radians(-35))
        hy = 13 + 15.5 * math.sin(math.radians(-35))
        root, _ = BUILDERS['cargo_pod_standard']()
        root.location = Vector((hx, hy, 3.6))
        root.rotation_euler = (0, 0, math.radians(-35))
    elif comp_id == 'comp3_customs_checkpoint':
        root, _ = BUILDERS['cargo_pod_standard']()
        root.location = Vector((-30, 19, 2.6))
        root.rotation_euler = (0, 0, math.radians(-15))
        _stage_beam('stg_scan', (-8.0, 13.9, 12.4), (-27.5, 19.5, 3.4), 0.24,
                    'esk_light_authority')
    elif comp_id == 'comp4_repair_yard':
        _stage_slab('stg_client', (0, 0, 4.2), (14.0, 6.0, 3.4), rot=(0.05, 0.02, 0.08))
        _stage_beam('stg_weld_a', (2.6, 4.0, 5.4), (1.8, 2.6, 5.0), 0.16, 'esk_light_repair')
        _stage_beam('stg_weld_b', (-3.4, 4.4, 4.4), (-2.4, 2.8, 4.6), 0.16, 'esk_light_repair')
        _stage_beam('stg_trunk', (16.5, -8.6, 0.4), (6.0, -6.0, 0.3), 0.14, 'esk_pipe_steel')
        _stage_beam('stg_trunk2', (6.0, -6.0, 0.3), (0.4, -8.6, 0.4), 0.14, 'esk_pipe_steel')
    elif comp_id == 'comp5_shipbreaking_yard':
        for i, (sx, sy, sz, rr) in enumerate(((10, 4, 4, 0.4), (-4, -16, 2, 0.9),
                                              (20, -2, 6, 1.4), (-12, 4, 5, 0.2))):
            _stage_slab(f'stg_slab{i}', (sx, sy, sz), (3.2, 2.0, 1.1), rot=(rr, rr * 0.7, rr * 1.3))
        _stage_beam('stg_cut', (16.1, -8.0, 3.2), (17.4, -9.2, 2.4), 0.2, 'esk_light_mining')
    elif comp_id == 'comp6_station_construction':
        _stage_slab('stg_panels', (9.5, 7.2, 0.6), (3.6, 0.5, 5.6), rot=(0.1, 0.05, 0.3))
        _stage_beam('stg_weld_a', (9.6, 1.6, 3.8), (8.6, 0.4, 2.6), 0.16, 'esk_light_repair')
        _stage_beam('stg_weld_b', (-1.4, -2.4, 4.6), (-0.6, -1.2, 3.2), 0.16, 'esk_light_repair')


def render_composition(comp_id, spec, shot_path):
    reset_scene()
    for (pid, x, y, z, yaw) in spec['instances']:
        root, _meta = BUILDERS[pid]()
        root.location = Vector((float(x), float(y), float(z)))
        root.rotation_euler = (0, 0, math.radians(float(yaw)))
        bpy.context.view_layer.update()
    _stage_composition(comp_id)
    bpy.context.view_layer.update()
    cam = spec['camera']
    setup_render(cam['target'], cam['radius'])
    bpy.context.scene.render.resolution_x = 1920
    bpy.context.scene.render.resolution_y = 1200
    bpy.context.scene.render.filepath = str(shot_path)
    bpy.ops.render.render(write_still=True)
    log(f'wrote {shot_path.name}')


def write_catalog(report):
    """KIT_CATALOG.md: dimensions and intended role of every piece, per family."""
    by_id = {a['id']: a for a in report['assets']}
    lines = ['# Everyday Space Kit — catalog',
             'Generated by the builder; regenerate rather than hand-editing.', '']
    for fam, ids in FAMILIES.items():
        lines.append(f'## {fam}')
        lines.append('')
        lines.append('| id | size (m) | tris | parts | role | placement |')
        lines.append('|---|---|---|---|---|---|')
        for pid in ids:
            a = by_id[pid]
            sx, sy, sz = a['sizeM']
            lines.append(f"| `{pid}` | {sx} x {sy} x {sz} | {a['triangles']} | {a['parts']} "
                         f"| {a['role']} | {a['placement']} |")
        lines.append('')
    lines.append('## State variants')
    lines.append('')
    for pid in by_id:
        a = by_id[pid]
        lines.append(f"- `{pid}` — {a['states']}")
    lines.append('')
    (OUT_EVIDENCE / 'KIT_CATALOG.md').write_text('\n'.join(lines), encoding='utf-8')
    log('wrote KIT_CATALOG.md')


def main():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    ap = argparse.ArgumentParser()
    ap.add_argument('--render', action='store_true')
    ap.add_argument('--distances', action='store_true',
                    help='also render at the size-class gameplay bands')
    ap.add_argument('--sheets', action='store_true',
                    help='render the six per-family labelled contact sheets')
    ap.add_argument('--compositions', action='store_true',
                    help='render the six composition boards + compositions.json')
    args = ap.parse_args(argv)

    if not bpy.app.background:
        raise SystemExit('everyday space kit authoring requires Blender --background')

    ordered = [pid for ids in FAMILIES.values() for pid in ids]
    missing = [pid for pid in ordered if pid not in BUILDERS]
    extra = [pid for pid in BUILDERS if pid not in ordered]
    if missing or extra:
        raise SystemExit(f'FAMILIES/BUILDERS mismatch: missing={missing} extra={extra}')

    report = {
        'schema': 'spaceface.everydaySpaceKit.v1',
        'provenance': {
            'builderPath': str(Path(__file__).resolve().relative_to(ROOT)).replace(chr(92), '/'),
            'builderSha256AtAssetGeneration': hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
            'blenderVersionAtAssetGeneration': bpy.app.version_string,
            'gltfGeneratorRecords': [],
            'canonicalFullBuildCommandForRevalidation': (
                'blender --background --factory-startup --python '
                'tools/blender/build_everyday_space_kit.py -- '
                '--render --distances --sheets --compositions'
            ),
            'byteReproducibilityStatus': (
                'stabilized_triangle_stream_fixed_triangulate_name_sorted_export; '
                'prove with two clean factory-startup builds and compare sha256'
            ),
            'byteReproducibilityMechanism': (
                'Blender 5.1.2 glTF exporter previously reordered triangle indices '
                'across runs while keeping vertices and JSON equal; pre-export '
                'FIXED triangulation + face rebuild by (material, sorted verts, '
                'winding) and name-sorted selection closes that path.'
            ),
        },
        'assets': [],
    }
    exporter_generators = set()
    for name in ordered:
        reset_scene()
        root, meta = BUILDERS[name]()
        bpy.context.view_layer.update()
        lo, hi, size = envelope(root)
        tris = tri_count(root)
        # House collision convention: one COLLISION_HULL EMPTY (a mesh fails the
        # assetLoader material-map contract); scale carries box half-extents.
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
            'collisionProxy': {'kind': 'box',
                               'centerM': [round(center.x, 3), round(center.y, 3),
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
            target = (float(center.x), float(center.y), float(center.z))
            setup_render(target, radius)
            shot = OUT_EVIDENCE / f'{name}.png'
            bpy.context.scene.render.filepath = str(shot)
            bpy.ops.render.render(write_still=True)
            entry['render'] = str(shot.relative_to(ROOT)).replace(chr(92), '/')
            if args.distances:
                bands = distance_bands(max(size.x, size.y, size.z))
                for dist in bands:
                    reset_render_cameras()
                    setup_render(target, radius, distance=float(dist))
                    dshot = OUT_EVIDENCE / f'{name}@{dist}u.png'
                    bpy.context.scene.render.filepath = str(dshot)
                    bpy.ops.render.render(write_still=True)
                entry['distanceViews'] = list(bands)
        report['assets'].append(entry)
        log(f"{name}: {tris} tris, {entry['parts']} parts, "
            f"{entry['sizeM'][0]}x{entry['sizeM'][1]}x{entry['sizeM'][2]} m")

    report['provenance']['gltfGeneratorRecords'] = sorted(exporter_generators)
    OUT_EVIDENCE.mkdir(parents=True, exist_ok=True)
    (OUT_EVIDENCE / 'build-report.json').write_text(json.dumps(report, indent=2),
                                                   encoding='utf-8')
    write_catalog(report)
    log(f"wrote {len(report['assets'])} source GLBs to {OUT_SOURCE.relative_to(ROOT)}")

    if args.sheets:
        for fam, ids in FAMILIES.items():
            render_family_sheet(fam, ids, OUT_EVIDENCE / f'family-{fam}.png')

    if args.compositions:
        comp_manifest = {'schema': 'spaceface.everydaySpaceKit.compositions.v1',
                         'note': ('replay by instancing source GLBs at positionM/yawDeg; '
                                  'staging entries are render-only props, listed so a '
                                  'wiring lane knows what VFX/geology to substitute'),
                         'scenes': []}
        for comp_id, spec in COMPOSITIONS.items():
            render_composition(comp_id, spec, OUT_EVIDENCE / f'{comp_id}.png')
            comp_manifest['scenes'].append({
                'id': comp_id,
                'title': spec['title'],
                'instances': [{'asset': pid, 'positionM': [x, y, z], 'yawDeg': yaw}
                              for (pid, x, y, z, yaw) in spec['instances']],
                'stagingProps': spec['staging'],
                'camera': {'targetM': list(spec['camera']['target']),
                           'radiusM': spec['camera']['radius']},
            })
        (OUT_EVIDENCE / 'compositions.json').write_text(
            json.dumps(comp_manifest, indent=2), encoding='utf-8')
        log('wrote compositions.json')


main()

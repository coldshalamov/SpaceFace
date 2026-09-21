"""PQ-050.02 Drifter chase-camera form rebuild.

Imports the live Drifter only for root, sockets, and collision. Replaces the
render meshes with one closed workboat that reads at the live chase camera:
changing hull stations, twin nacelles faired from the flanks, a skin-breaking
dorsal cargo well, short thick-root winglets, a framed greenhouse over a cut
tub, and front+rear guns. Principled islands only. No seats. No megatex.
Hitch/Kestrel are never loaded. Hornet interceptor silhouette is not copied.

Does not rescale the root — live sockets already sit in the ~16.5 m authored
space. Runtime display scale is applied by the chase still helper, not here.
"""
from __future__ import annotations

import argparse
import json
import math
import shutil
import sys
from pathlib import Path

import bpy
from mathutils import Vector

REVISION = "chase_form_v17"
ROOT_DIR = Path(__file__).resolve().parents[2]
FAMILY = ROOT_DIR / "assets" / "ships" / "fleet_player_bodies_v1" / "drifter"
LIVE_PARTS = ROOT_DIR / "assets" / "ships" / "parts" / "wholeships"

KEEP_SEPARATE = (
    "LOD0_Glass",
    "LOD0_Bell_",
)

# Distinct color blocks that read at ~15% frame width. No 512-map density trap.
# C8–C13 wins: wells as holes, no teal beam rail, shell-cut lips, light near Hitch.
# C14: one hard-chine workboat beam (sideboards ARE the hull). No paddle lobes.
# C15: no vertical slab at y=beam. Abeam still read spine+flanks (separate nacelle
# bodies + remaining YZ fold). C16: convex diamond YZ; nacelle bodies deleted;
# aft stations widen so drives sit in the primary loft. Armor is keel/bilge only.
# C17: clay abeam spine/flank was Deck+Armor slots surviving a slot-0-only clay
# override. Outer diamond is one Hull value; Armor stays keel. No extra plates.
HONEST = {
    "Material_Hull": {"color": (0.108, 0.132, 0.140), "metallic": 0.16, "roughness": 0.54, "role": "hull"},
    "Material_Armor": {"color": (0.072, 0.082, 0.088), "metallic": 0.22, "roughness": 0.56, "role": "armor"},
    "Material_Deck": {"color": (0.090, 0.100, 0.096), "metallic": 0.12, "roughness": 0.58, "role": "deck"},
    "Material_Canopy": {"color": (0.012, 0.016, 0.022), "metallic": 0.0, "roughness": 0.06, "role": "glass"},
    "Material_Ceramic": {"color": (0.07, 0.065, 0.06), "metallic": 0.08, "roughness": 0.62, "role": "ceramic"},
    "Material_Mechanical": {"color": (0.048, 0.052, 0.058), "metallic": 0.40, "roughness": 0.50, "role": "mechanical"},
    "Material_Radiator": {"color": (0.045, 0.038, 0.036), "metallic": 0.22, "roughness": 0.52, "role": "radiator"},
    "Material_Thruster": {"color": (0.028, 0.028, 0.032), "metallic": 0.28, "roughness": 0.50, "role": "thruster"},
    "Material_Accent": {"color": (0.04, 0.32, 0.30), "metallic": 0.06, "roughness": 0.42, "role": "accent"},
    "Material_Warning": {"color": (0.36, 0.16, 0.05), "metallic": 0.02, "roughness": 0.44, "role": "warning"},
    "Material_Dirt": {"color": (0.07, 0.055, 0.045), "metallic": 0.02, "roughness": 0.78, "role": "dirt"},
}


def parse_args(argv):
    parser = argparse.ArgumentParser()
    parser.add_argument("--source-lod0", type=Path, default=LIVE_PARTS / "drifter_production_v1.glb")
    parser.add_argument("--source-lod1", type=Path, default=LIVE_PARTS / "drifter_production_v1_lod1.glb")
    parser.add_argument("--source-lod2", type=Path, default=LIVE_PARTS / "drifter_production_v1_lod2.glb")
    parser.add_argument("--out-dir", type=Path, default=FAMILY / "source" / "wholeships")
    parser.add_argument("--lods", default="0,1,2")
    parser.add_argument("--promote", action="store_true")
    return parser.parse_args(argv)


def find_root():
    named = bpy.data.objects.get("DRIFTER_LOD0_ROOT")
    if named:
        return named
    matches = [
        obj for obj in bpy.data.objects
        if obj.type == "EMPTY" and "DRIFTER" in obj.name.upper() and "ROOT" in obj.name.upper()
    ]
    if len(matches) == 1:
        return matches[0]
    raise RuntimeError("missing Drifter root")


def snapshot_empties():
    return {
        obj.name: {
            "location": [round(v, 6) for v in obj.location],
            "rotation": [round(v, 6) for v in obj.rotation_euler],
            "scale": [round(v, 6) for v in obj.scale],
            "parent": obj.parent.name if obj.parent else None,
        }
        for obj in bpy.data.objects if obj.type == "EMPTY"
    }


def assert_empties(before):
    after = snapshot_empties()
    if after != before:
        raise RuntimeError("empty contract changed")


def parent_keep_world(obj, root):
    world = obj.matrix_world.copy()
    obj.parent = root
    obj.matrix_world = world


def is_collision(obj):
    name = obj.name.upper()
    return "COLLISION" in name or bool(obj.get("collision")) or bool(obj.get("nonRender"))


def apply_object(obj):
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    obj.select_set(False)


def join_into(target, extras):
    extras = [obj for obj in extras if obj and obj.name in bpy.data.objects and obj != target]
    if not extras:
        return
    bpy.ops.object.select_all(action="DESELECT")
    target.select_set(True)
    for extra in extras:
        extra.select_set(True)
    bpy.context.view_layer.objects.active = target
    bpy.ops.object.join()
    target.select_set(False)


def finish_mesh(obj, material, bevel=0.010):
    obj.data.materials.clear()
    obj.data.materials.append(material)
    if bevel > 0:
        mod = obj.modifiers.new("FormBevel", "BEVEL")
        mod.width = bevel
        mod.segments = 2
        mod.limit_method = "ANGLE"
        mod.angle_limit = math.radians(32)
        bpy.context.view_layer.objects.active = obj
        obj.select_set(True)
        bpy.ops.object.modifier_apply(modifier=mod.name)
        obj.select_set(False)
    wn = obj.modifiers.new("WeightedNormal", "WEIGHTED_NORMAL")
    wn.keep_sharp = True
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    try:
        bpy.ops.object.modifier_apply(modifier=wn.name)
    except Exception:
        if wn.name in obj.modifiers:
            obj.modifiers.remove(wn)
    obj.select_set(False)
    return obj


def circle_ring(origin, axis, radius, n=12):
    axis = Vector(axis).normalized()
    helper = Vector((0.0, 1.0, 0.0)) if abs(axis.y) < 0.85 else Vector((1.0, 0.0, 0.0))
    u = axis.cross(helper).normalized()
    v = axis.cross(u).normalized()
    origin = Vector(origin)
    return [
        tuple(origin + (u * math.cos(i * math.tau / n) + v * math.sin(i * math.tau / n)) * radius)
        for i in range(n)
    ]


def add_open_well(name, size, location, material, *, floor=True, open_aft=False, wall=0.045):
    """Thin walls inside a boolean hole. Not a liner that fills the mouth."""
    sx, sy, sz = size
    x, y, z = location
    bits = []
    if floor:
        bits.append(add_box(
            f"{name}_Floor",
            (sx - 2 * wall, sy - 2 * wall, 0.040),
            (x, y, z - sz * 0.5 + 0.022),
            material, 0.0,
        ))
    bits.append(add_box(f"{name}_Port", (sx, wall, sz * 0.82), (x, y - sy * 0.5 + wall * 0.5, z - 0.04), material, 0.0))
    bits.append(add_box(f"{name}_Stbd", (sx, wall, sz * 0.82), (x, y + sy * 0.5 - wall * 0.5, z - 0.04), material, 0.0))
    bits.append(add_box(f"{name}_Fore", (wall, sy - 2 * wall, sz * 0.82), (x + sx * 0.5 - wall * 0.5, y, z - 0.04), material, 0.0))
    if not open_aft:
        bits.append(add_box(f"{name}_Aft", (wall, sy - 2 * wall, sz * 0.82), (x - sx * 0.5 + wall * 0.5, y, z - 0.04), material, 0.0))
    return bits


def loft_rings(name, rings, material, bevel=0.010, cap=True):
    sides = len(rings[0])
    verts = [vert for ring in rings for vert in ring]
    faces = []
    if cap:
        faces.append(tuple(range(sides - 1, -1, -1)))
        faces.append(tuple(range((len(rings) - 1) * sides, len(rings) * sides)))
    for station in range(len(rings) - 1):
        a = station * sides
        b = (station + 1) * sides
        for i in range(sides):
            j = (i + 1) % sides
            faces.append((a + i, a + j, b + j, b + i))
    mesh = bpy.data.meshes.new(f"{name}_Mesh")
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    return finish_mesh(obj, material, bevel)


def shell_ring(st):
    """Convex diamond YZ. Max beam at mid-height. Sideboard is the slope.

    C14/C15 put a gunwale lip (two points near the same Y, large dZ) — abeam
    read that as a raised spine + darker flanking face + hard root crease.
    One half-beam. No (hw, wing) paddle lobe. Consecutive half-points may not
    share Y while dropping more than 0.22 m (that is a vertical slab).
    """
    x, beam, hh, zc, keel, flat, box, _chine = st
    flat = max(0.0, min(1.0, float(flat)))
    box = max(0.0, min(1.0, float(box)))
    beam = max(0.22, float(beam))
    crown = zc + hh * (0.90 - 0.06 * flat)
    keel_z = zc - hh - keel * (1.0 - 0.18 * box)
    beam_z = zc + hh * 0.02 * (1.0 - box)

    def half(sign):
        return [
            (x, sign * beam * 0.18, crown - hh * 0.02),
            (x, sign * beam * (0.42 + 0.06 * flat), crown - hh * 0.18),
            (x, sign * beam * (0.70 + 0.04 * flat), zc + hh * 0.38),
            (x, sign * beam * (0.92 + 0.02 * (1.0 - box)), zc + hh * 0.14),
            (x, sign * beam, beam_z),
            (x, sign * beam * (0.90 - 0.04 * box), zc - hh * 0.18),
            (x, sign * beam * (0.68 - 0.08 * box), zc - hh * 0.48),
            (x, sign * beam * (0.40 - 0.06 * box), zc - hh * 0.78),
            (x, sign * beam * 0.14, keel_z),
        ]

    pts = half(1.0)
    for a, b in zip(pts, pts[1:]):
        if abs(a[1] - b[1]) < 0.05 and abs(a[2] - b[2]) > 0.22:
            raise RuntimeError(
                f"vertical slab in YZ at x={a[0]:.2f} dy={abs(a[1] - b[1]):.3f} dz={abs(a[2] - b[2]):.3f}"
            )
    return [(x, 0.0, crown)] + pts + [(x, 0.0, keel_z + keel * 0.08)] + list(reversed(half(-1.0)))


def chine_ring(x, hw, hh, zc=0.12, keel=0.10, yc=0.0, flat=0.0, box=0.0):
    """Twelve-point manufactured station. Low box = formed shell; high box = workboat chine."""
    flat = max(0.0, min(1.0, float(flat)))
    box = max(0.0, min(1.0, float(box)))
    crown = zc + hh * (1.0 - 0.10 * flat)
    deck = hw * (0.14 + 0.46 * flat)
    shoulder_y = hw * (0.66 + 0.16 * box)
    shoulder_z = zc + hh * (0.50 - 0.14 * box)
    beam_z = zc - hh * (0.02 + 0.10 * box)
    bilge_y = hw * (0.82 - 0.06 * box)
    bilge_z = zc - hh * (0.52 + 0.08 * box)
    keel_y = hw * (0.26 - 0.06 * box)
    keel_z = zc - hh - keel * (1.0 - 0.22 * box)
    deck_y = max(deck, hw * 0.16)
    return [
        (x, yc + 0.0, crown),
        (x, yc + deck_y * 0.55, crown - hh * 0.03 * flat),
        (x, yc + deck_y, crown - hh * 0.05 * flat),
        (x, yc + shoulder_y, shoulder_z),
        (x, yc + (shoulder_y + hw) * 0.5, (shoulder_z + beam_z) * 0.5),
        (x, yc + hw, beam_z),
        (x, yc + bilge_y, bilge_z),
        (x, yc + keel_y, keel_z),
        (x, yc + 0.0, keel_z + keel * 0.08),
        (x, yc - keel_y, keel_z),
        (x, yc - bilge_y, bilge_z),
        (x, yc - hw, beam_z),
        (x, yc - (shoulder_y + hw) * 0.5, (shoulder_z + beam_z) * 0.5),
        (x, yc - shoulder_y, shoulder_z),
        (x, yc - deck_y, crown - hh * 0.05 * flat),
        (x, yc - deck_y * 0.55, crown - hh * 0.03 * flat),
    ]


def greenhouse_ring(x, hw, hh, zc):
    """Thin-shell visor station: flattened bubble that sits in the tub, not a cube cage."""
    pts = []
    for i in range(16):
        ang = math.tau * i / 16.0
        y = hw * math.sin(ang)
        z = zc + hh * max(math.cos(ang), -0.12)
        pts.append((x, y, z))
    return pts


def side_lip_ring(x, sign, half_y, rise=0.05, outer=0.16):
    """One rail of a dorsal cut. Never spans the mouth (that lofted a lid)."""
    hw, hh, zc = hull_half_at(x)
    z_crown = zc + hh * 0.90
    y = half_y * sign
    return [
        (x, y - 0.05 * sign, z_crown - 0.12),
        (x, y + outer * sign, z_crown + rise),
        (x, y + outer * 0.50 * sign, z_crown - 0.08),
        (x, y - 0.02 * sign, z_crown - 0.20),
    ]


def end_lip_ring(y, x_pos, sign_x, rise=0.04, outer=0.14):
    hw, hh, zc = hull_half_at(x_pos)
    z_crown = zc + hh * 0.90
    return [
        (x_pos - 0.04 * sign_x, y, z_crown - 0.12),
        (x_pos + outer * sign_x, y, z_crown + rise),
        (x_pos + outer * 0.50 * sign_x, y, z_crown - 0.08),
        (x_pos - 0.02 * sign_x, y, z_crown - 0.20),
    ]


def mullion_long_ring(x, y, z, half_w=0.085, drop=0.12):
    """Thin longitudinal glazing bar. Chase-readable stroke, not a cube cage."""
    return [
        (x, y - half_w, z),
        (x, y + half_w, z),
        (x, y + half_w, z - drop),
        (x, y - half_w, z - drop),
    ]


def mullion_athwart_ring(x, y, z, half_w=0.085, drop=0.12):
    return [
        (x - half_w, y, z),
        (x + half_w, y, z),
        (x + half_w, y, z - drop),
        (x - half_w, y, z - drop),
    ]


def airfoil(x_le, y, z, chord, thick):
    """Closed section with a blunt trailing edge so the panel holds thickness at D=144."""
    te = thick * 0.28
    return [
        (x_le, y, z + thick * 0.06),
        (x_le - chord * 0.10, y, z + thick * 0.52),
        (x_le - chord * 0.24, y, z + thick * 0.94),
        (x_le - chord * 0.42, y, z + thick),
        (x_le - chord * 0.64, y, z + thick * 0.82),
        (x_le - chord, y, z + te),
        (x_le - chord, y, z - te * 0.72),
        (x_le - chord * 0.64, y, z - thick * 0.58),
        (x_le - chord * 0.40, y, z - thick * 0.52),
        (x_le - chord * 0.18, y, z - thick * 0.34),
        (x_le - chord * 0.04, y, z - thick * 0.10),
        (x_le, y, z - thick * 0.04),
    ]


def add_cylinder(name, radius, depth, location, material, bevel=0.0, rotation=(0.0, 0.0, 0.0), vertices=10):
    bpy.ops.mesh.primitive_cylinder_add(
        radius=radius, depth=depth, vertices=vertices, location=(0.0, 0.0, 0.0),
    )
    obj = bpy.context.object
    obj.name = name
    obj.rotation_euler = rotation
    obj.location = location
    apply_object(obj)
    obj.select_set(False)
    return finish_mesh(obj, material, bevel)


def add_hose(name, points, radius, material, segments=8):
    pts = [Vector(p) for p in points]
    rings = []
    for index, point in enumerate(pts):
        if index < len(pts) - 1:
            axis = pts[index + 1] - point
        else:
            axis = point - pts[index - 1]
        if axis.length < 1e-5:
            axis = Vector((-1.0, 0.0, 0.0))
        rings.append(circle_ring(point, axis, radius, segments))
    body = loft_rings(name, rings, material, 0.002, cap=True)
    start_axis = pts[1] - pts[0]
    end_axis = pts[-1] - pts[-2]
    start_rot = start_axis.to_track_quat("Z", "Y").to_euler()
    end_rot = end_axis.to_track_quat("Z", "Y").to_euler()
    fittings = [
        add_cylinder(f"{name}_FitFore", radius * 1.45, 0.10, tuple(pts[0]), material, 0.0, (start_rot.x, start_rot.y, start_rot.z), 8),
        add_cylinder(f"{name}_FitAft", radius * 1.45, 0.10, tuple(pts[-1]), material, 0.0, (end_rot.x, end_rot.y, end_rot.z), 8),
    ]
    return [body, *fittings]


def add_letter_d(prefix, origin, height, width, stroke, thick, material):
    """Dorsal D: height along X, width along Y. Chase-readable stroke, not a decal."""
    x, y, z = origin
    bits = [
        add_box(f"{prefix}_Spine", (height, stroke, thick), (x, y - width * 0.5 + stroke * 0.5, z), material, 0.0),
        add_box(f"{prefix}_Top", (stroke, width * 0.62, thick), (x + height * 0.5 - stroke * 0.5, y + width * 0.08, z), material, 0.0),
        add_box(f"{prefix}_Bot", (stroke, width * 0.62, thick), (x - height * 0.5 + stroke * 0.5, y + width * 0.08, z), material, 0.0),
        add_box(f"{prefix}_Bow", (height * 0.62, stroke, thick), (x, y + width * 0.5 - stroke * 0.5, z), material, 0.0),
    ]
    return bits


def add_digit_2(prefix, origin, height, width, stroke, thick, material):
    x, y, z = origin
    bits = [
        add_box(f"{prefix}_Top", (stroke, width, thick), (x + height * 0.5 - stroke * 0.5, y, z), material, 0.0),
        add_box(f"{prefix}_Mid", (stroke, width * 0.85, thick), (x, y, z), material, 0.0),
        add_box(f"{prefix}_Bot", (stroke, width, thick), (x - height * 0.5 + stroke * 0.5, y, z), material, 0.0),
        add_box(f"{prefix}_NE", (height * 0.38, stroke, thick), (x + height * 0.28, y + width * 0.5 - stroke * 0.5, z), material, 0.0),
        add_box(f"{prefix}_SW", (height * 0.38, stroke, thick), (x - height * 0.28, y - width * 0.5 + stroke * 0.5, z), material, 0.0),
    ]
    return bits


def add_digit_0(prefix, origin, height, width, stroke, thick, material):
    x, y, z = origin
    bits = [
        add_box(f"{prefix}_SpineP", (height, stroke, thick), (x, y - width * 0.5 + stroke * 0.5, z), material, 0.0),
        add_box(f"{prefix}_SpineS", (height, stroke, thick), (x, y + width * 0.5 - stroke * 0.5, z), material, 0.0),
        add_box(f"{prefix}_Top", (stroke, width, thick), (x + height * 0.5 - stroke * 0.5, y, z), material, 0.0),
        add_box(f"{prefix}_Bot", (stroke, width, thick), (x - height * 0.5 + stroke * 0.5, y, z), material, 0.0),
    ]
    return bits


def add_flank_digit_2(prefix, origin, length, height, stroke, thick, material):
    """Abeam-readable 2: length along X, height along Z, thick along Y."""
    x, y, z = origin
    bits = [
        add_box(f"{prefix}_Top", (length, thick, stroke), (x, y, z + height * 0.5 - stroke * 0.5), material, 0.0),
        add_box(f"{prefix}_Mid", (length * 0.85, thick, stroke), (x, y, z), material, 0.0),
        add_box(f"{prefix}_Bot", (length, thick, stroke), (x, y, z - height * 0.5 + stroke * 0.5), material, 0.0),
        add_box(f"{prefix}_NE", (stroke, thick, height * 0.38), (x + length * 0.5 - stroke * 0.5, y, z + height * 0.28), material, 0.0),
        add_box(f"{prefix}_SW", (stroke, thick, height * 0.38), (x - length * 0.5 + stroke * 0.5, y, z - height * 0.28), material, 0.0),
    ]
    return bits


def add_flank_digit_0(prefix, origin, length, height, stroke, thick, material):
    x, y, z = origin
    bits = [
        add_box(f"{prefix}_Fore", (stroke, thick, height), (x + length * 0.5 - stroke * 0.5, y, z), material, 0.0),
        add_box(f"{prefix}_Aft", (stroke, thick, height), (x - length * 0.5 + stroke * 0.5, y, z), material, 0.0),
        add_box(f"{prefix}_Top", (length, thick, stroke), (x, y, z + height * 0.5 - stroke * 0.5), material, 0.0),
        add_box(f"{prefix}_Bot", (length, thick, stroke), (x, y, z - height * 0.5 + stroke * 0.5), material, 0.0),
    ]
    return bits


def add_flank_letter_d(prefix, origin, length, height, stroke, thick, material):
    x, y, z = origin
    bits = [
        add_box(f"{prefix}_Aft", (stroke, thick, height), (x - length * 0.5 + stroke * 0.5, y, z), material, 0.0),
        add_box(f"{prefix}_Top", (length * 0.62, thick, stroke), (x + length * 0.08, y, z + height * 0.5 - stroke * 0.5), material, 0.0),
        add_box(f"{prefix}_Bot", (length * 0.62, thick, stroke), (x + length * 0.08, y, z - height * 0.5 + stroke * 0.5), material, 0.0),
        add_box(f"{prefix}_Fore", (stroke, thick, height * 0.62), (x + length * 0.5 - stroke * 0.5, y, z), material, 0.0),
    ]
    return bits


def add_box(name, dimensions, location, material, bevel=0.006, rotation=(0.0, 0.0, 0.0)):
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0.0, 0.0, 0.0))
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = dimensions
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.rotation_euler = rotation
    obj.location = location
    apply_object(obj)
    obj.select_set(False)
    return finish_mesh(obj, material, bevel)


def boolean_difference(target, cutter, solver="FAST"):
    modifier = target.modifiers.new("SF_FormCut", "BOOLEAN")
    modifier.operation = "DIFFERENCE"
    modifier.solver = solver
    modifier.object = cutter
    bpy.context.view_layer.objects.active = target
    target.select_set(True)
    try:
        bpy.ops.object.modifier_apply(modifier=modifier.name)
        ok = True
    except Exception:
        if modifier.name in target.modifiers:
            target.modifiers.remove(modifier)
        ok = False
    target.select_set(False)
    if cutter.name in bpy.data.objects:
        bpy.data.objects.remove(cutter, do_unlink=True)
    return ok


def cut(target, maker):
    cutter = maker()
    ok = boolean_difference(target, cutter, solver="FAST")
    if ok:
        return True
    cutter = maker()
    return boolean_difference(target, cutter, solver="EXACT")


def make_materials():
    mats = {}
    for name, spec in HONEST.items():
        material = bpy.data.materials.get(name) or bpy.data.materials.new(name)
        material.use_nodes = True
        bsdf = next((node for node in material.node_tree.nodes if node.type == "BSDF_PRINCIPLED"), None)
        if bsdf is None:
            continue
        for socket in bsdf.inputs:
            for link in list(socket.links):
                material.node_tree.links.remove(link)
        output = next((node for node in material.node_tree.nodes if node.type == "OUTPUT_MATERIAL"), None)
        if output and not bsdf.outputs["BSDF"].links:
            material.node_tree.links.new(bsdf.outputs["BSDF"], output.inputs["Surface"])
        bsdf.inputs["Base Color"].default_value = (*spec["color"], 1.0)
        bsdf.inputs["Metallic"].default_value = spec["metallic"]
        bsdf.inputs["Roughness"].default_value = spec["roughness"]
        if "Emission Strength" in bsdf.inputs:
            bsdf.inputs["Emission Strength"].default_value = 0.0
        if "Transmission Weight" in bsdf.inputs:
            bsdf.inputs["Transmission Weight"].default_value = 0.0
        if spec["role"] == "glass" and "Coat Weight" in bsdf.inputs:
            bsdf.inputs["Coat Weight"].default_value = 1.0
            bsdf.inputs["Coat Roughness"].default_value = 0.04
        material.blend_method = "OPAQUE"
        material["spacefaceRole"] = spec["role"]
        mats[name] = material
    return mats


def delete_render_meshes():
    for obj in list(bpy.data.objects):
        if obj.type != "MESH":
            continue
        if is_collision(obj):
            continue
        bpy.data.objects.remove(obj, do_unlink=True)


# C16 convex-diamond workboat. Endpoints stay C6 (envelope). Bow/mid beam
# keep the C14 diamond planform (play_chase TUBE_PADDLE NO). Aft stations
# widen so drive volume lives in the primary loft — no separate sponson mesh.
# (x, beam, hh, zc, keel, flat, box, chine)
HULL_STATIONS = [
    (7.95, 0.42, 0.46, 0.10, 0.16, 0.18, 0.22, 0.10),
    (6.70, 0.98, 0.76, 0.16, 0.14, 0.34, 0.28, 0.16),
    (5.40, 1.88, 1.04, 0.20, 0.12, 0.52, 0.32, 0.22),
    (3.80, 2.72, 1.14, 0.16, 0.12, 0.70, 0.38, 0.30),
    (1.60, 3.12, 1.18, 0.14, 0.12, 0.82, 0.42, 0.34),
    (0.15, 3.20, 1.20, 0.14, 0.12, 0.86, 0.44, 0.36),
    (-2.00, 3.14, 1.16, 0.14, 0.10, 0.78, 0.44, 0.34),
    (-4.00, 2.90, 1.10, 0.14, 0.10, 0.60, 0.40, 0.28),
    (-5.70, 2.62, 1.00, 0.16, 0.08, 0.40, 0.36, 0.22),
    (-7.20, 2.20, 0.88, 0.16, 0.08, 0.22, 0.32, 0.16),
    (-8.48, 1.10, 0.70, 0.12, 0.06, 0.14, 0.26, 0.10),
]


def densify_stations(stations, mids=26):
    """Mid-span stations for a smoother loft. Endpoints (envelope) stay C6."""
    out = [stations[0]]
    for a, b in zip(stations, stations[1:]):
        for k in range(1, mids + 1):
            t = k / (mids + 1)
            out.append(tuple(a[i] + (b[i] - a[i]) * t for i in range(len(a))))
        out.append(b)
    return out


def hull_station_at(x):
    stations = HULL_STATIONS
    if x >= stations[0][0]:
        return stations[0]
    if x <= stations[-1][0]:
        return stations[-1]
    for index in range(len(stations) - 1):
        a = stations[index]
        b = stations[index + 1]
        if b[0] <= x <= a[0]:
            t = (a[0] - x) / max(a[0] - b[0], 1e-6)
            return tuple(a[i] + (b[i] - a[i]) * t for i in range(len(a)))
    return stations[5]


def hull_half_at(x):
    st = hull_station_at(x)
    return st[1], st[2], st[3]


def paint_shell(hull, mats):
    """Deck on the inner crown only, armor on keel/bilge, hull on the slope.

    C14's Deck threshold (zc+hh*0.28) painted the upper vertical wall a second
    value — abeam read that as a darker flank. Do not assign Armor by |y|.
    """
    mesh = hull.data
    mesh.materials.clear()
    mesh.materials.append(mats["Material_Hull"])
    mesh.materials.append(mats["Material_Armor"])
    mesh.materials.append(mats["Material_Deck"])
    for poly in mesh.polygons:
        verts = [mesh.vertices[index].co for index in poly.vertices]
        centroid = sum(verts, Vector()) / max(len(verts), 1)
        _beam, hh, zc = hull_half_at(centroid.x)
        if centroid.z < zc - hh * 0.38:
            poly.material_index = 1
        elif centroid.z > zc + hh * 0.70:
            poly.material_index = 2
        else:
            poly.material_index = 0


def build_hull(mats):
    hull_mat = mats["Material_Hull"]
    rings = [shell_ring(st) for st in densify_stations(HULL_STATIONS)]
    hull = loft_rings("LOD0_Hull", rings, hull_mat, 0.016)
    extras = []
    # Formed-shell language: shallow girth + longitudinal stringers on the ONE beam.
    girth_xs = (5.80, 2.20, -1.80, -5.40)
    for index, x in enumerate(girth_xs):
        st = hull_station_at(x)
        beam = st[1]

        def ring_frame(name=f"FrameCut_{index}", loc=(x, 0.0, 0.10), width=min(beam * 2.05, 6.4)):
            return add_box(name, (0.10, width, 2.85), loc, hull_mat, 0.0)

        cut(hull, ring_frame)
    for sign, side in ((-1.0, "P"), (1.0, "S")):
        def dorsal_seam(name=f"DorsalSeam_{side}", loc=(-0.20, 0.85 * sign, 1.18)):
            return add_box(name, (9.2, 0.12, 0.18), loc, hull_mat, 0.0)
        cut(hull, dorsal_seam)
        # C14 MidSeam + GunwaleSeam split the abeam face into spine vs flank.
        def bilge_seam(name=f"BilgeSeam_{side}", loc=(-0.40, 1.55 * sign, -0.36)):
            return add_box(name, (8.0, 0.12, 0.20), loc, hull_mat, 0.0)
        cut(hull, bilge_seam)
    paint_shell(hull, mats)
    return hull, extras


def drive_half_y():
    """Aft drive sits inside the primary beam, not outboard of a tapering tube."""
    return hull_station_at(-6.80)[1] * 0.70


def build_nacelles(hull, mats, lod):
    """Drive throats cut into the primary hull. No separate sponson loft.

    C15 KEEP_SEPARATE nacelle bodies were extra darker volumes on play_chase_abeam.
    Collars/heat bands/fins are small hardware on the hull, not a second body.
    """
    hull_mat = mats["Material_Hull"]
    armor = mats["Material_Armor"]
    ceramic = mats["Material_Ceramic"]
    bits = []
    report = {}
    yc_abs = drive_half_y()
    for sign, tag in ((-1.0, "Port"), (1.0, "Stbd")):
        yc = yc_abs * sign

        def throat(name=f"NacelleThroat_{tag}", loc=(-7.55, yc, 0.28)):
            return add_box(name, (1.55, 0.72, 0.78), loc, hull_mat, 0.0)

        report[f"throat_{tag}"] = cut(hull, throat)
        if lod < 2:
            def slot(name=f"NacelleSlot_{tag}", loc=(-5.10, yc, 0.62)):
                return add_box(name, (1.45, 0.42, 0.32), loc, hull_mat, 0.0)

            report[f"slot_{tag}"] = cut(hull, slot)
        bits.append(add_cylinder(
            f"LOD0_Collar_{tag}", 0.70, 0.22, (-6.85, yc, 0.28), armor, 0.002,
            rotation=(0.0, math.radians(90.0), 0.0), vertices=12,
        ))
        bits.append(add_cylinder(
            f"LOD0_HeatBand_{tag}", 0.58, 0.10, (-7.35, yc, 0.28), ceramic, 0.0,
            rotation=(0.0, math.radians(90.0), 0.0), vertices=12,
        ))
        if lod < 2:
            bits.append(add_box(
                f"LOD0_IntakeGrill_{tag}", (0.12, 0.48, 0.32),
                (-4.85, yc, 0.36), mats["Material_Mechanical"], 0.0,
            ))
            fin_count = 3 if lod == 0 else 2
            for index in range(fin_count):
                bits.append(add_box(
                    f"LOD0_CoolFin_{tag}_{index}",
                    (0.22, 0.08, 0.26),
                    (-5.15 - index * 0.32, yc, 0.78),
                    mats["Material_Radiator"], 0.0,
                ))
    return bits, report


def build_flaps(hull, mats, lod):
    """Trailing-edge tab cut into the workboat beam, not a mid-body paddle."""
    hull_mat = mats["Material_Hull"]
    armor = mats["Material_Armor"]
    bits = []
    if lod != 0:
        return bits
    for sign, tag in ((1.0, "Stbd"), (-1.0, "Port")):
        beam = hull_station_at(-3.10)[1]
        y = beam * 0.78 * sign

        def flap_slot(name=f"FlapSlot_{tag}", loc=(-3.10, y, 0.18)):
            return add_box(name, (0.20, 0.55, 0.32), loc, hull_mat, 0.0)
        cut(hull, flap_slot)
        bits.append(loft_rings(
            f"LOD0_Flap_{tag}",
            [
                airfoil(-2.85, y * 0.92, 0.16, 0.55, 0.16),
                airfoil(-3.25, y, 0.14, 0.40, 0.12),
            ],
            armor, 0.004, cap=True,
        ))
    return bits


def build_cargo_well(hull, mats, lod):
    armor = mats["Material_Armor"]
    mech = mats["Material_Mechanical"]
    hull_mat = mats["Material_Hull"]
    warning = mats["Material_Warning"]

    def mouth():
        return add_box("WellMouthCut", (4.35, 2.05, 1.72), (0.15, 0.0, 1.12), armor, 0.0)

    report = {"mouth": cut(hull, mouth)}
    bits = add_open_well("LOD0_Well", (4.05, 1.88, 1.28), (0.15, 0.0, 0.52), mech, floor=True, open_aft=False, wall=0.070)
    # Four independent rails. One closed loft around the mouth filled the hole.
    well_xs = (2.22, 1.15, 0.15, -0.85, -1.92)
    for sign, tag in ((-1.0, "Port"), (1.0, "Stbd")):
        bits.append(loft_rings(
            f"LOD0_WellLip_{tag}",
            [side_lip_ring(x, sign, 1.04) for x in well_xs],
            mech, 0.004, cap=True,
        ))
    bits.append(loft_rings(
        "LOD0_WellLip_Fore",
        [end_lip_ring(y, 2.22, 1.0) for y in (-1.00, -0.35, 0.35, 1.00)],
        mech, 0.004, cap=True,
    ))
    bits.append(loft_rings(
        "LOD0_WellLip_Aft",
        [end_lip_ring(y, -1.92, -1.0) for y in (-1.00, -0.35, 0.35, 1.00)],
        mech, 0.004, cap=True,
    ))
    bits.append(add_box("LOD0_WellGrate", (1.55, 0.72, 0.05), (0.55, 0.28, 0.08), mats["Material_Radiator"], 0.0))
    bits.append(add_cylinder(
        "LOD0_Winch", 0.22, 0.40, (0.15, 0.0, 0.22), mech, 0.0,
        rotation=(math.radians(90.0), 0.0, 0.0), vertices=10,
    ))
    if lod < 2:
        bits.append(add_box("LOD0_Crate_0", (0.52, 0.38, 0.32), (1.05, -0.42, 0.08), armor, 0.002))
        bits.append(add_box("LOD0_Crate_1", (0.42, 0.32, 0.26), (-0.85, 0.38, 0.08), warning, 0.002))
    return bits, report


def build_greenhouse(hull, mats, lod):
    armor = mats["Material_Armor"]
    mech = mats["Material_Mechanical"]
    hull_mat = mats["Material_Hull"]
    glass = mats["Material_Canopy"]

    def tub():
        return add_box("GreenTubCut", (2.85, 1.42, 1.58), (5.20, 0.0, 1.02), armor, 0.0)

    def windshield():
        return add_box(
            "GreenWindCut", (1.35, 0.88, 1.15), (6.15, 0.0, 1.12), armor, 0.0,
            rotation=(0.0, math.radians(-22.0), 0.0),
        )

    report = {"tub": cut(hull, tub), "windshield": False}
    if lod < 2:
        report["windshield"] = cut(hull, windshield)
    bits = add_open_well("LOD0_Tub", (2.48, 1.18, 0.92), (5.20, 0.0, 0.48), mech, floor=True, open_aft=False)
    # Independent rails around the tub. Do not loft a closed ring across the hole.
    green_xs = (6.38, 5.85, 5.20, 4.55)
    for sign, tag in ((-1.0, "Port"), (1.0, "Stbd")):
        bits.append(loft_rings(
            f"LOD0_GreenLip_{tag}",
            [side_lip_ring(x, sign, 0.64, rise=0.03, outer=0.12) for x in green_xs],
            hull_mat, 0.003, cap=True,
        ))
    bits.append(loft_rings(
        "LOD0_GreenLip_Fore",
        [end_lip_ring(y, 6.38, 1.0, rise=0.03, outer=0.10) for y in (-0.58, -0.20, 0.20, 0.58)],
        hull_mat, 0.003, cap=True,
    ))
    bits.append(loft_rings(
        "LOD0_GreenLip_Aft",
        [end_lip_ring(y, 4.55, -1.0, rise=0.03, outer=0.10) for y in (-0.58, -0.20, 0.20, 0.58)],
        hull_mat, 0.003, cap=True,
    ))
    if lod < 2:
        visor = loft_rings(
            "LOD0_Glass",
            [
                greenhouse_ring(6.42, 0.38, 0.16, 1.06),
                greenhouse_ring(5.90, 0.64, 0.28, 1.12),
                greenhouse_ring(5.20, 0.68, 0.26, 1.10),
                greenhouse_ring(4.52, 0.46, 0.16, 1.04),
            ],
            glass, 0.002, cap=True,
        )
        bits.append(visor)

        def visor_hatch(name="VisorHatchCut", loc=(5.20, 0.0, 1.34)):
            return add_box(name, (0.52, 0.30, 0.10), loc, glass, 0.0)

        cut(visor, visor_hatch)
        bits.append(loft_rings(
            "LOD0_Mullion_Spine",
            [
                mullion_long_ring(6.18, 0.0, 1.24),
                mullion_long_ring(5.20, 0.0, 1.28),
                mullion_long_ring(4.72, 0.0, 1.20),
            ],
            hull_mat, 0.0, cap=True,
        ))
        bits.append(loft_rings(
            "LOD0_Mullion_Port",
            [
                mullion_long_ring(6.05, -0.28, 1.20),
                mullion_long_ring(5.20, -0.32, 1.24),
                mullion_long_ring(4.78, -0.22, 1.16),
            ],
            hull_mat, 0.0, cap=True,
        ))
        bits.append(loft_rings(
            "LOD0_Mullion_Stbd",
            [
                mullion_long_ring(6.05, 0.28, 1.20),
                mullion_long_ring(5.20, 0.32, 1.24),
                mullion_long_ring(4.78, 0.22, 1.16),
            ],
            hull_mat, 0.0, cap=True,
        ))
        bits.append(loft_rings(
            "LOD0_Mullion_Athwart",
            [
                mullion_athwart_ring(5.20, -0.42, 1.22),
                mullion_athwart_ring(5.20, 0.0, 1.26),
                mullion_athwart_ring(5.20, 0.42, 1.22),
            ],
            hull_mat, 0.0, cap=True,
        ))
    return bits, report


def build_drives(mats, lod):
    thruster = mats["Material_Thruster"]
    ceramic = mats["Material_Ceramic"]
    mech = mats["Material_Mechanical"]
    bits = []
    report = {}
    for sign, tag in ((-1.0, "Port"), (1.0, "Stbd")):
        y = drive_half_y() * sign
        rings = [
            circle_ring((-7.85, y, 0.28), (-1.0, 0.0, 0.0), 0.50, 12),
            circle_ring((-8.38, y, 0.28), (-1.0, 0.0, 0.0), 0.42, 12),
            circle_ring((-8.82, y, 0.28), (-1.0, 0.0, 0.0), 0.32, 12),
        ]
        bell = loft_rings(f"LOD0_Bell_{tag}", rings, thruster, 0.006, cap=False)
        bits.append(bell)
        bits.append(add_cylinder(
            f"LOD0_Hub_{tag}", 0.12, 0.28, (-8.15, y, 0.28), mech, 0.0,
            rotation=(0.0, math.radians(90.0), 0.0), vertices=8,
        ))
        bits.append(add_cylinder(
            f"LOD0_HeatRing_{tag}", 0.38, 0.08, (-8.02, y, 0.28), ceramic, 0.0,
            rotation=(0.0, math.radians(90.0), 0.0), vertices=12,
        ))
        vane_count = 4 if lod == 0 else 3 if lod == 1 else 0
        for index in range(vane_count):
            angle = index * math.tau / max(vane_count, 1)
            bits.append(add_box(
                f"LOD0_Vane_{tag}_{index}",
                (0.22, 0.04, 0.28),
                (-8.22, y + math.sin(angle) * 0.22, 0.28 + math.cos(angle) * 0.22),
                ceramic, 0.0,
            ))
        report[tag] = True
    return bits, report


def build_guns(mats, lod):
    mech = mats["Material_Mechanical"]
    armor = mats["Material_Armor"]
    bits = []
    for sign, tag in ((-1.0, "Port"), (1.0, "Stbd")):
        gun = add_box(f"LOD0_GunFore_{tag}", (1.15, 0.16, 0.16), (7.05, 0.48 * sign, 0.42), mech, 0.002)
        bits.append(gun)
        bits.append(add_box(f"LOD0_GunForeHouse_{tag}", (0.48, 0.28, 0.22), (6.48, 0.48 * sign, 0.42), armor, 0.002))
        if lod < 2:
            def bore(name=f"GunBoreFore_{tag}", loc=(7.52, 0.48 * sign, 0.42)):
                return add_cylinder(
                    name, 0.045, 0.22, loc, mech, 0.0,
                    rotation=(0.0, math.radians(90.0), 0.0), vertices=8,
                )
            cut(gun, bore)
        bits.append(add_box(f"LOD0_GunAft_{tag}", (0.85, 0.14, 0.14), (-7.45, 0.42 * sign, 0.72), mech, 0.002))
        bits.append(add_box(f"LOD0_GunAftHouse_{tag}", (0.38, 0.22, 0.18), (-7.05, 0.42 * sign, 0.72), armor, 0.002))
    return bits


def build_hardware(hull, mats, lod):
    hull_mat = mats["Material_Hull"]
    armor = mats["Material_Armor"]
    mech = mats["Material_Mechanical"]
    accent = mats["Material_Accent"]
    warning = mats["Material_Warning"]
    dirt = mats["Material_Dirt"]
    rad = mats["Material_Radiator"]
    bits = []

    # Cluster 1 — radiator crater aft of the hold. No dorsal ladder of bars.
    def rad_cut():
        return add_box("RadWellCut", (1.65, 0.92, 0.48), (-3.05, 0.0, 1.18), mech, 0.0)

    cut(hull, rad_cut)
    bits.extend(add_open_well("LOD0_RadWell", (1.48, 0.80, 0.42), (-3.05, 0.0, 1.02), mech, floor=True, open_aft=False, wall=0.050))
    for index in range(4 if lod == 0 else 2):
        bits.append(add_box(f"LOD0_RadFin_{index}", (0.10, 0.62, 0.26), (-3.55 + index * 0.28, 0.0, 0.98), rad, 0.0))
    bits.append(add_box("LOD0_RadHeader", (1.42, 0.06, 0.06), (-3.05, 0.32, 1.12), rad, 0.0))

    # Cluster 2 — heat dirt on the hull slope (no nacelle-roof plates).
    yc = drive_half_y()
    bits.append(add_box("LOD0_DirtNacelle_Port", (1.45, 0.22, 0.05), (-5.40, -yc * 0.82, 0.62), dirt, 0.0))
    bits.append(add_box("LOD0_DirtNacelle_Stbd", (1.45, 0.22, 0.05), (-5.40, yc * 0.82, 0.62), dirt, 0.0))
    bits.append(add_box("LOD0_HeatPlate_Port", (1.05, 0.28, 0.08), (-6.45, -yc * 0.70, 0.48), mats["Material_Ceramic"], 0.001))
    bits.append(add_box("LOD0_HeatPlate_Stbd", (1.05, 0.28, 0.08), (-6.45, yc * 0.70, 0.48), mats["Material_Ceramic"], 0.001))

    bits.append(add_box("LOD0_RCS_Port", (0.22, 0.18, 0.16), (-1.20, -1.90, 0.15), mech, 0.002))
    bits.append(add_box("LOD0_RCS_Stbd", (0.22, 0.18, 0.16), (-1.20, 1.90, 0.15), mech, 0.002))
    bits.append(add_cylinder("LOD0_RCSCup_Port", 0.06, 0.08, (-1.20, -2.02, 0.15), hull_mat, 0.0, vertices=8))
    bits.append(add_cylinder("LOD0_RCSCup_Stbd", 0.06, 0.08, (-1.20, 2.02, 0.15), hull_mat, 0.0, vertices=8))
    bits.append(add_box("LOD0_RCS_ForePort", (0.22, 0.16, 0.16), (6.35, -0.62, 0.22), mech, 0.002))
    bits.append(add_box("LOD0_RCS_ForeStbd", (0.22, 0.16, 0.16), (6.35, 0.62, 0.22), mech, 0.002))
    bits.append(add_box("LOD0_RCS_AftPort", (0.24, 0.18, 0.16), (-6.85, -0.72, 0.28), mech, 0.002))
    bits.append(add_box("LOD0_RCS_AftStbd", (0.24, 0.18, 0.16), (-6.85, 0.72, 0.28), mech, 0.002))

    bits.append(add_cylinder("LOD0_Beacon_Fore", 0.05, 0.08, (3.85, 0.0, 1.32), accent, 0.0, vertices=8))
    bits.append(add_cylinder("LOD0_Beacon_Aft", 0.05, 0.08, (-6.35, 0.0, 1.14), warning, 0.0, vertices=8))
    bits.append(add_cylinder("LOD0_Nav_Port", 0.05, 0.08, (0.15, -3.24, 0.16), warning, 0.0, vertices=8))
    bits.append(add_cylinder("LOD0_Nav_Stbd", 0.05, 0.08, (0.15, 3.24, 0.16), accent, 0.0, vertices=8))

    if lod == 0:
        bits.extend(add_hose(
            "LOD0_Hose_Nacelle_Stbd",
            [(-3.40, 1.15, 0.55), (-4.90, drive_half_y() * 0.72, 0.48), (-6.10, drive_half_y() * 0.85, 0.42)],
            0.12, mech, 8,
        ))
        bits.extend(add_hose(
            "LOD0_Hose_Nacelle_Port",
            [(-3.40, -1.15, 0.55), (-4.90, -drive_half_y() * 0.72, 0.48), (-6.10, -drive_half_y() * 0.85, 0.42)],
            0.12, mech, 8,
        ))
        bits.append(add_box("LOD0_MiningHouse", (0.55, 0.28, 0.22), (7.35, 0.0, -0.12), armor, 0.002))
        bits.append(add_cylinder(
            "LOD0_MiningBit", 0.07, 0.42, (7.62, 0.0, -0.12), mech, 0.0,
            rotation=(0.0, math.radians(90.0), 0.0), vertices=8,
        ))
    return bits


def shade_objects(objs):
    hard = ("Hull", "Winglet", "Nacelle", "Flap", "Armor", "Accent", "Gun",
            "Repair", "Hatch", "Cable", "RCS", "Nav", "Hose", "Deck",
            "Heat", "Panel", "Dirt", "Crate", "Beacon", "Coaming", "Well",
            "Gantry", "Chevron", "Collar", "Longeron", "Spine", "Letter",
            "Bolt", "Tile", "Lamp", "Plaque", "Fastener", "WalkPlate", "BowPlate",
            "HeatPlate", "Digit", "Flank", "Vent", "LowPanel", "Clamp", "Course",
            "Girth", "Stringer", "Saddle", "Winch", "Chine", "Fairing", "Strake",
            "Cage", "Mullion", "WellLip", "GreenLip", "RoofPlate", "Sponson")
    for obj in objs:
        bpy.context.view_layer.objects.active = obj
        obj.select_set(True)
        try:
            if any(token in obj.name for token in hard):
                bpy.ops.object.shade_flat()
            else:
                bpy.ops.object.shade_smooth_by_angle(angle=math.radians(22))
        except TypeError:
            bpy.ops.object.shade_flat()
        obj.select_set(False)


def purge_stray_meshes():
    for obj in list(bpy.data.objects):
        if obj.type != "MESH":
            continue
        if is_collision(obj):
            continue
        if obj.name.startswith("LOD0_"):
            continue
        bpy.data.objects.remove(obj, do_unlink=True)


def mesh_world_size():
    low = Vector((1e12, 1e12, 1e12))
    high = Vector((-1e12, -1e12, -1e12))
    for obj in bpy.data.objects:
        if obj.type != "MESH" or is_collision(obj):
            continue
        for corner in obj.bound_box:
            point = obj.matrix_world @ Vector(corner)
            for axis in range(3):
                low[axis] = min(low[axis], point[axis])
                high[axis] = max(high[axis], point[axis])
    return high - low, low, high


def triangulate_and_uv():
    for obj in list(bpy.data.objects):
        if obj.type != "MESH" or is_collision(obj):
            continue
        bpy.context.view_layer.objects.active = obj
        obj.select_set(True)
        modifier = obj.modifiers.new("SF_ExportTriangulate", "TRIANGULATE")
        modifier.keep_custom_normals = True
        try:
            bpy.ops.object.modifier_apply(modifier=modifier.name)
        except Exception:
            if modifier.name in obj.modifiers:
                obj.modifiers.remove(modifier)
        try:
            bpy.ops.object.mode_set(mode="EDIT")
            bpy.ops.mesh.select_all(action="SELECT")
            bpy.ops.uv.smart_project(angle_limit=66.0, island_margin=0.02)
            bpy.ops.object.mode_set(mode="OBJECT")
        except Exception:
            if bpy.context.object and bpy.context.object.mode != "OBJECT":
                bpy.ops.object.mode_set(mode="OBJECT")
        obj.select_set(False)


def export_glb(path: Path, root):
    bpy.ops.object.select_all(action="DESELECT")
    for obj in bpy.data.objects:
        if obj.type in {"LIGHT", "CAMERA"}:
            continue
        obj.select_set(True)
    bpy.context.view_layer.objects.active = root
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(".tmp.glb")
    bpy.ops.export_scene.gltf(
        filepath=str(tmp), export_format="GLB", use_selection=True,
        export_yup=True, export_apply=True, export_extras=True,
        export_texcoords=True, export_normals=True, export_tangents=True,
        export_materials="EXPORT", export_image_format="NONE",
        export_animations=False,
    )
    tmp.replace(path)


def keep_separate(obj):
    return obj.name.startswith(KEEP_SEPARATE)


def reset_and_import(source: Path):
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    bpy.ops.import_scene.gltf(filepath=str(source))
    root = find_root()
    for obj in list(bpy.data.objects):
        if obj == root or obj.parent is not None:
            continue
        if obj.type in {"LIGHT", "CAMERA"}:
            continue
        parent_keep_world(obj, root)
    return root


def build_one(source: Path, output: Path, lod: int):
    root = reset_and_import(source)
    empties = snapshot_empties()
    delete_render_meshes()
    mats = make_materials()
    hull, hull_extras = build_hull(mats)
    nacelles, nacelle_report = build_nacelles(hull, mats, lod)
    flaps = build_flaps(hull, mats, lod)
    well_bits, well_report = build_cargo_well(hull, mats, lod)
    green_bits, green_report = build_greenhouse(hull, mats, lod)
    drive_bits, drive_report = build_drives(mats, lod)
    guns = build_guns(mats, lod)
    hardware = build_hardware(hull, mats, lod)
    paint_shell(hull, mats)

    built = [hull, *hull_extras, *nacelles, *flaps, *well_bits, *green_bits, *drive_bits, *guns, *hardware]
    for obj in built:
        if obj and obj.name in bpy.data.objects:
            parent_keep_world(obj, root)

    join_into(hull, hull_extras)
    hull_bits = [
        obj for obj in bpy.data.objects
        if obj.type == "MESH" and obj.data.materials and obj.data.materials[0] == mats["Material_Hull"]
        and obj != hull and not is_collision(obj) and not keep_separate(obj)
    ]
    join_into(hull, hull_bits)
    for material in (
        mats["Material_Ceramic"], mats["Material_Radiator"], mats["Material_Thruster"],
        mats["Material_Mechanical"], mats["Material_Accent"], mats["Material_Canopy"],
        mats["Material_Armor"], mats["Material_Warning"], mats["Material_Dirt"],
        mats["Material_Deck"],
    ):
        group = [
            obj for obj in bpy.data.objects
            if obj.type == "MESH" and obj.data.materials and obj.data.materials[0] == material
            and not is_collision(obj) and not keep_separate(obj)
        ]
        if len(group) > 1:
            join_into(group[0], group[1:])

    purge_stray_meshes()
    assert_empties(empties)
    shade_objects([obj for obj in bpy.data.objects if obj.type == "MESH" and not is_collision(obj)])
    bpy.context.view_layer.update()
    size, low, high = mesh_world_size()
    if size.x < 15.0 or size.x > 18.0 or size.y < 4.8 or size.z > 3.4:
        raise RuntimeError(f"form envelope broken: size=({size.x:.2f},{size.y:.2f},{size.z:.2f})")
    triangulate_and_uv()
    export_glb(output, root)

    meshes = [obj for obj in bpy.data.objects if obj.type == "MESH"]
    tris = 0
    hull_tris = 0
    for obj in meshes:
        obj.data.calc_loop_triangles()
        count = len(obj.data.loop_triangles)
        tris += count
        mats_on = [slot.material.name if slot.material else "" for slot in obj.material_slots]
        if "Hull" in obj.name or any("Hull" in name for name in mats_on):
            hull_tris += count
    report = {
        "ok": True,
        "asset": "ship_drifter",
        "revision": REVISION,
        "lod": lod,
        "source": str(source),
        "output": str(output),
        "greenhouse": green_report,
        "cargoWell": well_report,
        "nacelle": nacelle_report,
        "drive": drive_report,
        "size": [round(float(size.x), 3), round(float(size.y), 3), round(float(size.z), 3)],
        "boundsMin": [round(float(v), 3) for v in low],
        "boundsMax": [round(float(v), 3) for v in high],
        "triangles": tris,
        "hullTriangles": hull_tris,
        "objects": [obj.name for obj in meshes],
        "bytes": output.stat().st_size,
    }
    output.with_suffix(".report.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report))
    return report


def promote_live(out_dir: Path):
    mapping = {
        out_dir / "drifter_production_v1_lod0.glb": LIVE_PARTS / "drifter_production_v1.glb",
        out_dir / "drifter_production_v1_lod1.glb": LIVE_PARTS / "drifter_production_v1_lod1.glb",
        out_dir / "drifter_production_v1_lod2.glb": LIVE_PARTS / "drifter_production_v1_lod2.glb",
    }
    copied = []
    for src, dest in mapping.items():
        if not src.is_file():
            continue
        dest.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(src, dest)
        copied.append({"from": str(src), "to": str(dest), "bytes": dest.stat().st_size})
    return copied


def main():
    args = parse_args(sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else [])
    lods = [int(item.strip()) for item in args.lods.split(",") if item.strip() != ""]
    sources = {0: args.source_lod0, 1: args.source_lod1, 2: args.source_lod2}
    out_dir = args.out_dir.resolve()
    out_dir.mkdir(parents=True, exist_ok=True)
    reports = []
    for lod in lods:
        source = sources[lod].resolve()
        if not source.is_file():
            raise SystemExit(f"missing source {source}")
        output = out_dir / f"drifter_production_v1_lod{lod}.glb"
        reports.append(build_one(source, output, lod))
    promoted = promote_live(out_dir) if args.promote else []
    summary = {"ok": True, "revision": REVISION, "lods": reports, "promoted": promoted}
    (out_dir / "drifter_chase_form_v16.summary.json").write_text(json.dumps(summary, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(summary))


if __name__ == "__main__":
    main()

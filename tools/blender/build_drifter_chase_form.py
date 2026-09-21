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

REVISION = "chase_form_v11"
ROOT_DIR = Path(__file__).resolve().parents[2]
FAMILY = ROOT_DIR / "assets" / "ships" / "fleet_player_bodies_v1" / "drifter"
LIVE_PARTS = ROOT_DIR / "assets" / "ships" / "parts" / "wholeships"

KEEP_SEPARATE = (
    "LOD0_Winglet_",
    "LOD0_Flap_",
    "LOD0_Nacelle_",
    "LOD0_Glass",
    "LOD0_Bell_",
)

# Distinct color blocks that read at ~15% frame width. No 512-map density trap.
# C8–C10 wins: value split ~8%, wells as holes, no teal beam rail, copper/brown ~0.8%.
# C11: formed mid skin like Hitch. Hull sits mid-dark so light>=0.28 stays ~8%
# without restoring black dorsal bars. Armor/deck are plates, not a clay tube.
HONEST = {
    "Material_Hull": {"color": (0.105, 0.132, 0.140), "metallic": 0.16, "roughness": 0.54, "role": "hull"},
    "Material_Armor": {"color": (0.062, 0.074, 0.082), "metallic": 0.24, "roughness": 0.58, "role": "armor"},
    "Material_Deck": {"color": (0.078, 0.086, 0.082), "metallic": 0.12, "roughness": 0.58, "role": "deck"},
    "Material_Canopy": {"color": (0.012, 0.016, 0.022), "metallic": 0.0, "roughness": 0.06, "role": "glass"},
    "Material_Ceramic": {"color": (0.07, 0.065, 0.06), "metallic": 0.08, "roughness": 0.62, "role": "ceramic"},
    "Material_Mechanical": {"color": (0.055, 0.060, 0.066), "metallic": 0.40, "roughness": 0.50, "role": "mechanical"},
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


def flank_plate_ring(x, sign, inset=0.06, thick=0.18):
    """Closed flank-plate station: chine down to bilge, not a wrapping girth hoop."""
    hw, hh, zc = hull_half_at(x)
    y0 = max(0.16, hw - inset)
    y1 = y0 + thick
    z_top = zc + hh * 0.58
    z_beam = zc - hh * 0.02
    z_bilge = zc - hh * 0.54
    pts = [
        (x, y0, z_top),
        (x, y1, z_top - hh * 0.10),
        (x, y1, z_beam),
        (x, y1 * 0.92, z_bilge),
        (x, y0 * 0.86, z_bilge - 0.05),
        (x, y0 * 0.92, z_beam - hh * 0.12),
        (x, y0, z_beam + hh * 0.18),
        (x, y0, z_top - hh * 0.16),
    ]
    return [(px, py * sign, pz) for px, py, pz in pts]


def chine_beam_ring(x, sign):
    """Hull-material beam at the crease. ~0.9 m tall so D=144 reads form, not a rail."""
    hw, hh, zc = hull_half_at(x)
    y = max(0.22, hw * 0.96)
    z_mid = zc - hh * 0.02
    half_h = 0.46
    half_w = 0.24
    pts = [
        (x, y - half_w, z_mid + half_h),
        (x, y + half_w, z_mid + half_h * 0.82),
        (x, y + half_w, z_mid - half_h * 0.48),
        (x, y - half_w * 0.35, z_mid - half_h * 0.72),
        (x, y - half_w, z_mid - half_h * 0.08),
        (x, y - half_w, z_mid + half_h * 0.42),
    ]
    return [(px, py * sign, pz) for px, py, pz in pts]


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


def dorsal_lip_ring(x, half_y, rise=0.05, outer=0.16, inner=0.05):
    """Closed lip around a dorsal cut. Formed shell edge, not four boxes on the deck."""
    hw, hh, zc = hull_half_at(x)
    z_crown = zc + hh * 0.90
    z_in = z_crown - 0.14
    hy = min(half_y, max(0.28, hw * 0.92))
    return [
        (x, -hy + inner, z_in),
        (x, -hy - outer, z_crown + rise),
        (x, -hy - outer * 0.55, z_crown - 0.08),
        (x, -hy + inner, z_in - 0.08),
        (x, hy - inner, z_in - 0.08),
        (x, hy + outer * 0.55, z_crown - 0.08),
        (x, hy + outer, z_crown + rise),
        (x, hy - inner, z_in),
    ]


def mullion_long_ring(x, y, z, half_w=0.028, drop=0.10):
    """Thin longitudinal glazing bar. Chase-readable stroke, not a cube cage."""
    return [
        (x, y - half_w, z),
        (x, y + half_w, z),
        (x, y + half_w, z - drop),
        (x, y - half_w, z - drop),
    ]


def mullion_athwart_ring(x, y, z, half_w=0.028, drop=0.10):
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


# C6 shell stations. Do not retune for occupancy or silhouette gaming.
# C10 raises `box` so the crease lives in the loft (formed beam), not a teal rail.
HULL_STATIONS = [
    (7.95, 0.36, 0.44, 0.10, 0.16, 0.16, 0.22),
    (6.85, 0.74, 0.70, 0.16, 0.16, 0.30, 0.28),
    (5.55, 1.22, 1.02, 0.24, 0.14, 0.50, 0.34),
    (4.05, 1.68, 1.16, 0.20, 0.12, 0.72, 0.40),
    (2.25, 2.08, 1.24, 0.16, 0.12, 0.86, 0.44),
    (0.15, 2.20, 1.28, 0.14, 0.12, 0.90, 0.46),
    (-1.75, 2.10, 1.22, 0.14, 0.10, 0.82, 0.48),
    (-3.55, 1.78, 1.12, 0.16, 0.10, 0.62, 0.48),
    (-5.45, 1.42, 1.02, 0.18, 0.08, 0.40, 0.44),
    (-7.15, 1.10, 0.86, 0.16, 0.08, 0.24, 0.38),
    (-8.48, 0.78, 0.66, 0.12, 0.06, 0.14, 0.28),
]


def densify_stations(stations, mids=4):
    """Mid-span stations for a smoother loft. Endpoints (envelope) stay C6."""
    out = [stations[0]]
    for a, b in zip(stations, stations[1:]):
        for k in range(1, mids + 1):
            t = k / (mids + 1)
            out.append(tuple(a[i] + (b[i] - a[i]) * t for i in range(len(a))))
        out.append(b)
    return out


def hull_half_at(x):
    stations = HULL_STATIONS
    if x >= stations[0][0]:
        return stations[0][1], stations[0][2], stations[0][3]
    if x <= stations[-1][0]:
        return stations[-1][1], stations[-1][2], stations[-1][3]
    for index in range(len(stations) - 1):
        x0, hw0, hh0, zc0 = stations[index][:4]
        x1, hw1, hh1, zc1 = stations[index + 1][:4]
        if x1 <= x <= x0:
            t = (x0 - x) / max(x0 - x1, 1e-6)
            return (
                hw0 + (hw1 - hw0) * t,
                hh0 + (hh1 - hh0) * t,
                zc0 + (zc1 - zc0) * t,
            )
    return stations[5][1], stations[5][2], stations[5][3]


def build_hull(mats):
    hull_mat = mats["Material_Hull"]
    armor = mats["Material_Armor"]
    # One tapering shell. C6 endpoints. Chine lives in the loft + a hull-material beam.
    rings = [
        chine_ring(x, hw, hh, zc, keel, 0.0, flat, box)
        for x, hw, hh, zc, keel, flat, box in densify_stations(HULL_STATIONS)
    ]
    hull = loft_rings("LOD0_Hull", rings, hull_mat, 0.018)
    extras = []
    # Panel joints: keep the girth cuts, drop wrapping belts.
    girth_xs = (6.55, 3.72, 2.85, -2.05, -3.78, -5.55, -7.05)
    for index, x in enumerate(girth_xs):
        def ring_frame(name=f"FrameCut_{index}", loc=(x, 0.0, 0.22)):
            return add_box(name, (0.46, 4.90, 2.90), loc, hull_mat, 0.0)
        cut(hull, ring_frame)
    for sign, side in ((-1.0, "P"), (1.0, "S")):
        def dorsal_fore(name=f"DorsalSeamFore_{side}", loc=(3.72, 1.12 * sign, 1.28)):
            return add_box(name, (1.65, 0.32, 0.28), loc, hull_mat, 0.0)
        cut(hull, dorsal_fore)
        def dorsal_aft(name=f"DorsalSeamAft_{side}", loc=(-4.65, 0.96 * sign, 1.20)):
            return add_box(name, (3.15, 0.32, 0.28), loc, hull_mat, 0.0)
        cut(hull, dorsal_aft)
        def flank_seam(name=f"FlankSeam_{side}", loc=(0.35, 2.08 * sign, 0.42)):
            return add_box(name, (9.4, 0.28, 0.40), loc, hull_mat, 0.0)
        cut(hull, flank_seam)
        def bilge_seam(name=f"BilgeSeam_{side}", loc=(-0.40, 1.72 * sign, -0.28)):
            return add_box(name, (8.2, 0.26, 0.32), loc, hull_mat, 0.0)
        cut(hull, bilge_seam)

        extras.append(loft_rings(
            f"LOD0_ChineBeam_{side}",
            [chine_beam_ring(x, sign) for x in (6.35, 5.15, 3.55, 1.85, 0.15, -1.55, -3.35, -5.15, -6.85)],
            hull_mat, 0.008, cap=True,
        ))
        extras.append(loft_rings(
            f"LOD0_NacFairing_{side}",
            [
                chine_ring(-1.10, 0.42, 0.38, 0.22, 0.04, 1.05 * sign, 0.22, 0.28),
                chine_ring(-2.70, 0.55, 0.50, 0.26, 0.04, 1.34 * sign, 0.16, 0.32),
                chine_ring(-4.40, 0.62, 0.58, 0.28, 0.04, 1.66 * sign, 0.12, 0.36),
                chine_ring(-6.20, 0.48, 0.46, 0.26, 0.04, 1.80 * sign, 0.10, 0.38),
            ],
            hull_mat, 0.010, cap=True,
        ))

    # Longitudinal panel courses spanning girth bays (chine → bilge), not hoop belts.
    for bay_i, (x0, x1) in enumerate(zip(girth_xs, girth_xs[1:])):
        span = abs(x0 - x1)
        steps = 4 if span > 3.0 else 3 if span > 1.4 else 2
        xs = [x0 + (x1 - x0) * (i + 0.08) / (steps + 0.16) for i in range(steps)]
        for sign, tag in ((-1.0, "P"), (1.0, "S")):
            extras.append(loft_rings(
                f"LOD0_PanelCourse_{bay_i}_{tag}",
                [flank_plate_ring(x, sign) for x in xs],
                mats["Material_Deck"], 0.004, cap=True,
            ))

    extras.append(add_box("LOD0_KeelStrake", (12.6, 0.32, 0.12), (-0.20, 0.0, -1.18), armor, 0.002))
    return hull, extras


def build_nacelles(mats, lod):
    hull_mat = mats["Material_Hull"]
    armor = mats["Material_Armor"]
    ceramic = mats["Material_Ceramic"]
    warning = mats["Material_Warning"]
    bits = []
    report = {}
    # First stations sit inside the hull half-width so the pod is a swept fairing, not a trailer.
    station_core = [
        (0.45, 0.48, 0.20, 0.34, 0.16, 0.05, 0.36, 0.20),
        (-1.10, 0.90, 0.32, 0.50, 0.20, 0.05, 0.26, 0.26),
        (-2.70, 1.34, 0.50, 0.66, 0.24, 0.05, 0.16, 0.32),
        (-4.40, 1.66, 0.62, 0.78, 0.26, 0.05, 0.12, 0.36),
        (-6.20, 1.80, 0.68, 0.84, 0.28, 0.04, 0.10, 0.40),
        (-8.10, 1.76, 0.50, 0.62, 0.26, 0.04, 0.08, 0.42),
    ]
    for sign, tag in ((-1.0, "Port"), (1.0, "Stbd")):
        rings = [
            chine_ring(x, hw, hh, zc, keel, yc_abs * sign, flat, box)
            for x, yc_abs, hw, hh, zc, keel, flat, box in station_core
        ]
        nacelle = loft_rings(f"LOD0_Nacelle_{tag}", rings, hull_mat, 0.012)
        bits.append(nacelle)
        yc = 1.80 * sign
        bits.append(loft_rings(
            f"LOD0_NacelleCowl_{tag}",
            [
                chine_ring(-3.05, 0.36, 0.12, 0.92, 0.02, yc, 0.18, 0.20),
                chine_ring(-5.05, 0.48, 0.14, 0.98, 0.02, yc, 0.12, 0.24),
                chine_ring(-6.85, 0.38, 0.12, 0.92, 0.02, yc, 0.10, 0.28),
            ],
            hull_mat, 0.006, cap=True,
        ))
        bits.append(add_cylinder(
            f"LOD0_Collar_{tag}", 0.82, 0.24, (-6.45, yc, 0.28), armor, 0.002,
            rotation=(0.0, math.radians(90.0), 0.0), vertices=12,
        ))
        bits.append(add_cylinder(
            f"LOD0_HeatBand_{tag}", 0.66, 0.12, (-7.25, yc, 0.28), ceramic, 0.0,
            rotation=(0.0, math.radians(90.0), 0.0), vertices=12,
        ))
        if lod < 2:
            def slot(name=f"NacelleSlot_{tag}", loc=(-4.75, yc, 0.98)):
                return add_box(name, (1.65, 0.50, 0.42), loc, hull_mat, 0.0)

            def throat(name=f"NacelleThroat_{tag}", loc=(-7.55, yc, 0.58)):
                return add_box(name, (1.45, 0.76, 0.82), loc, hull_mat, 0.0)

            report[f"slot_{tag}"] = cut(nacelle, slot)
            report[f"throat_{tag}"] = cut(nacelle, throat)
            def nac_girth_fore(name=f"NacGirthFore_{tag}", loc=(-3.55, yc, 0.28)):
                return add_box(name, (0.40, 1.15, 1.15), loc, hull_mat, 0.0)
            def nac_girth_aft(name=f"NacGirthAft_{tag}", loc=(-5.85, yc, 0.28)):
                return add_box(name, (0.40, 1.35, 1.35), loc, hull_mat, 0.0)
            cut(nacelle, nac_girth_fore)
            cut(nacelle, nac_girth_aft)
            bits.append(loft_rings(
                f"LOD0_NacPanel_Fore_{tag}",
                [
                    chine_ring(-2.85, 0.18, 0.42, 0.28, 0.02, yc, 0.20, 0.22),
                    chine_ring(-4.05, 0.20, 0.48, 0.28, 0.02, yc, 0.16, 0.24),
                ],
                armor, 0.002, cap=True,
            ))
            bits.append(loft_rings(
                f"LOD0_NacPanel_Aft_{tag}",
                [
                    chine_ring(-5.15, 0.20, 0.50, 0.28, 0.02, yc, 0.14, 0.26),
                    chine_ring(-6.45, 0.18, 0.44, 0.28, 0.02, yc, 0.12, 0.28),
                ],
                armor, 0.002, cap=True,
            ))
            bits.append(add_box(
                f"LOD0_IntakeGrill_{tag}", (0.12, 0.58, 0.42),
                (-3.15, yc * 0.92, 0.36), mats["Material_Mechanical"], 0.0,
            ))
            fin_count = 3 if lod == 0 else 2
            for index in range(fin_count):
                bits.append(add_box(
                    f"LOD0_CoolFin_{tag}_{index}",
                    (0.22, 0.08, 0.32),
                    (-4.35 - index * 0.32, yc, 1.12),
                    mats["Material_Radiator"], 0.0,
                ))
    return bits, report


def build_winglets(mats, lod):
    hull_mat = mats["Material_Hull"]
    armor = mats["Material_Armor"]
    bits = []
    for sign, tag in ((1.0, "Stbd"), (-1.0, "Port")):
        # Hitch-comparable sponson: long chord along the cargo waist, slow taper,
        # blunt tip. Not a diamond card glued at mid-body.
        rings = [
            airfoil(2.65, 1.02 * sign, 0.16, 3.95, 1.12),
            airfoil(2.25, 1.88 * sign, 0.22, 3.65, 0.98),
            airfoil(1.55, 2.48 * sign, 0.26, 3.25, 0.82),
            airfoil(0.55, 2.98 * sign, 0.28, 2.55, 0.62),
            airfoil(-0.45, 3.38 * sign, 0.24, 1.65, 0.44),
        ]
        wing = loft_rings(f"LOD0_Winglet_{tag}", rings, hull_mat, 0.014)
        bits.append(wing)
        bits.append(loft_rings(
            f"LOD0_WingStrake_{tag}",
            [
                airfoil(2.75, 0.82 * sign, 0.12, 3.15, 0.88),
                airfoil(2.65, 1.02 * sign, 0.16, 3.95, 1.12),
            ],
            hull_mat, 0.012, cap=True,
        ))
        bits.append(add_cylinder(
            f"LOD0_WingTip_{tag}", 0.08, 0.12, (-0.35, 3.38 * sign, 0.24),
            mats["Material_Warning"] if sign < 0 else mats["Material_Accent"],
            0.0, vertices=8,
        ))
        if lod == 0:
            def flap_slot(name=f"FlapSlot_{tag}", loc=(0.35, 2.35 * sign, 0.18)):
                return add_box(name, (0.22, 1.05, 0.36), loc, hull_mat, 0.0)
            cut(wing, flap_slot)
            bits.append(loft_rings(
                f"LOD0_Flap_{tag}",
                [
                    airfoil(0.45, 1.95 * sign, 0.12, 0.85, 0.26),
                    airfoil(-0.25, 2.85 * sign, 0.16, 0.58, 0.20),
                ],
                armor, 0.006, cap=True,
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
    # Lip is a lofted cut-edge of the shell, not four boxes on the deck.
    bits.append(loft_rings(
        "LOD0_WellLip",
        [dorsal_lip_ring(x, 1.04) for x in (2.22, 1.15, 0.15, -0.85, -1.92)],
        hull_mat, 0.006, cap=True,
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
    # Formed hull lip around the tub cut. Greenhouse sits in that hole.
    bits.append(loft_rings(
        "LOD0_GreenLip",
        [
            dorsal_lip_ring(6.38, 0.48, rise=0.03, outer=0.12),
            dorsal_lip_ring(5.85, 0.66, rise=0.04, outer=0.14),
            dorsal_lip_ring(5.20, 0.70, rise=0.04, outer=0.14),
            dorsal_lip_ring(4.55, 0.50, rise=0.03, outer=0.12),
        ],
        hull_mat, 0.005, cap=True,
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
        y = 1.80 * sign
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
    bits.append(add_box("LOD0_DirtTransom", (1.85, 0.40, 0.06), (-6.55, 0.0, 1.08), dirt, 0.0))

    # Cluster 2 — nacelle roots: heat dirt + one hose per pod. Cowl/collar/throat live on the nacelle.
    bits.append(add_box("LOD0_DirtNacelle_Port", (1.65, 0.28, 0.05), (-5.40, -1.80, 1.08), dirt, 0.0))
    bits.append(add_box("LOD0_DirtNacelle_Stbd", (1.65, 0.28, 0.05), (-5.40, 1.80, 1.08), dirt, 0.0))
    bits.append(add_box("LOD0_HeatPlate_Port", (1.15, 0.38, 0.10), (-6.45, -1.48, 0.92), mats["Material_Ceramic"], 0.001))
    bits.append(add_box("LOD0_HeatPlate_Stbd", (1.15, 0.38, 0.10), (-6.45, 1.48, 0.92), mats["Material_Ceramic"], 0.001))

    # Cluster 3 — transom / identity: D2/02 as teal on dark plaques, not orange louder than wells.
    bits.append(add_box("LOD0_LetterPlaque", (1.25, 1.55, 0.05), (0.78, -2.08, -0.18), armor, 0.0))
    bits.extend(add_letter_d("LOD0_LetterD", (0.78, -2.44, -0.10), 1.02, 0.66, 0.20, 0.10, accent))
    bits.extend(add_digit_2("LOD0_Letter2", (0.78, -1.72, -0.10), 1.02, 0.58, 0.18, 0.10, accent))
    bits.append(add_box("LOD0_DigitPlaque", (1.15, 1.45, 0.05), (0.74, 2.04, -0.18), armor, 0.0))
    bits.extend(add_digit_0("LOD0_Letter0", (0.74, 1.68, -0.10), 0.92, 0.50, 0.16, 0.10, accent))
    bits.extend(add_digit_2("LOD0_Letter02", (0.74, 2.34, -0.10), 0.92, 0.50, 0.16, 0.10, accent))

    bits.append(add_box("LOD0_RCS_Port", (0.22, 0.18, 0.16), (-1.20, -1.90, 0.15), mech, 0.002))
    bits.append(add_box("LOD0_RCS_Stbd", (0.22, 0.18, 0.16), (-1.20, 1.90, 0.15), mech, 0.002))
    bits.append(add_cylinder("LOD0_RCSCup_Port", 0.06, 0.08, (-1.20, -2.02, 0.15), hull_mat, 0.0, vertices=8))
    bits.append(add_cylinder("LOD0_RCSCup_Stbd", 0.06, 0.08, (-1.20, 2.02, 0.15), hull_mat, 0.0, vertices=8))
    bits.append(add_box("LOD0_RCS_ForePort", (0.22, 0.16, 0.16), (6.35, -0.62, 0.22), mech, 0.002))
    bits.append(add_box("LOD0_RCS_ForeStbd", (0.22, 0.16, 0.16), (6.35, 0.62, 0.22), mech, 0.002))
    bits.append(add_box("LOD0_RCS_AftPort", (0.24, 0.18, 0.16), (-6.85, -0.72, 0.28), mech, 0.002))
    bits.append(add_box("LOD0_RCS_AftStbd", (0.24, 0.18, 0.16), (-6.85, 0.72, 0.28), mech, 0.002))

    bits.append(add_cylinder("LOD0_SensorDish", 0.14, 0.05, (0.60, 0.0, 1.58), armor, 0.0, vertices=10))
    bits.append(add_cylinder("LOD0_Beacon_Fore", 0.05, 0.08, (3.85, 0.0, 1.32), accent, 0.0, vertices=8))
    bits.append(add_cylinder("LOD0_Beacon_Aft", 0.05, 0.08, (-6.35, 0.0, 1.14), warning, 0.0, vertices=8))
    bits.append(add_cylinder("LOD0_Nav_Port", 0.05, 0.08, (-0.35, -3.38, 0.24), warning, 0.0, vertices=8))
    bits.append(add_cylinder("LOD0_Nav_Stbd", 0.05, 0.08, (-0.35, 3.38, 0.24), accent, 0.0, vertices=8))

    if lod == 0:
        bits.extend(add_hose(
            "LOD0_Hose_Nacelle_Stbd",
            [(-3.40, 1.15, 0.72), (-4.90, 1.52, 0.88), (-6.10, 1.76, 0.92)],
            0.12, mech, 8,
        ))
        bits.extend(add_hose(
            "LOD0_Hose_Nacelle_Port",
            [(-3.40, -1.15, 0.72), (-4.90, -1.52, 0.88), (-6.10, -1.76, 0.92)],
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
            "Cage", "Mullion", "WellLip", "GreenLip")
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
    nacelles, nacelle_report = build_nacelles(mats, lod)
    winglets = build_winglets(mats, lod)
    well_bits, well_report = build_cargo_well(hull, mats, lod)
    green_bits, green_report = build_greenhouse(hull, mats, lod)
    drive_bits, drive_report = build_drives(mats, lod)
    guns = build_guns(mats, lod)
    hardware = build_hardware(hull, mats, lod)

    built = [hull, *hull_extras, *nacelles, *winglets, *well_bits, *green_bits, *drive_bits, *guns, *hardware]
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
    (out_dir / "drifter_chase_form_v11.summary.json").write_text(json.dumps(summary, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(summary))


if __name__ == "__main__":
    main()

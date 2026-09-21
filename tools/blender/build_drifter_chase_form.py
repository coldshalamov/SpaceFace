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

import bmesh
import bpy
from mathutils import Vector

REVISION = "chase_form_v1"
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
# Live Drifter crushed to near-black at D=144 — hull/deck are lifted so the
# workboat still splits value next to Hitch.
HONEST = {
    "Material_Hull": {"color": (0.18, 0.26, 0.28), "metallic": 0.10, "roughness": 0.46, "role": "hull"},
    "Material_Armor": {"color": (0.08, 0.11, 0.13), "metallic": 0.18, "roughness": 0.52, "role": "armor"},
    "Material_Deck": {"color": (0.36, 0.38, 0.34), "metallic": 0.08, "roughness": 0.50, "role": "deck"},
    "Material_Canopy": {"color": (0.012, 0.016, 0.022), "metallic": 0.0, "roughness": 0.06, "role": "glass"},
    "Material_Ceramic": {"color": (0.30, 0.28, 0.26), "metallic": 0.0, "roughness": 0.62, "role": "ceramic"},
    "Material_Mechanical": {"color": (0.05, 0.052, 0.056), "metallic": 0.42, "roughness": 0.48, "role": "mechanical"},
    "Material_Radiator": {"color": (0.08, 0.05, 0.04), "metallic": 0.20, "roughness": 0.50, "role": "radiator"},
    "Material_Thruster": {"color": (0.028, 0.028, 0.032), "metallic": 0.28, "roughness": 0.50, "role": "thruster"},
    "Material_Accent": {"color": (0.06, 0.36, 0.34), "metallic": 0.04, "roughness": 0.40, "role": "accent"},
    "Material_Warning": {"color": (0.82, 0.34, 0.08), "metallic": 0.02, "roughness": 0.40, "role": "warning"},
    "Material_Dirt": {"color": (0.24, 0.14, 0.08), "metallic": 0.02, "roughness": 0.74, "role": "dirt"},
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


def chine_ring(x, hw, hh, zc=0.12, keel=0.10, yc=0.0, flat=0.0, box=0.0):
    """Eight-point manufactured station. flat/box change section language, not just scale."""
    flat = max(0.0, min(1.0, float(flat)))
    box = max(0.0, min(1.0, float(box)))
    crown = zc + hh * (1.0 - 0.18 * flat)
    deck = hw * (0.10 + 0.55 * flat)
    shoulder_y = hw * (0.72 + 0.20 * box)
    shoulder_z = zc + hh * (0.42 - 0.22 * box)
    beam_z = zc - hh * (0.08 + 0.18 * box)
    keel_z = zc - hh - keel * (1.0 - 0.35 * box)
    return [
        (x, yc + 0.0, crown),
        (x, yc + max(deck, hw * 0.18), crown - hh * 0.08 * flat),
        (x, yc + shoulder_y, shoulder_z),
        (x, yc + hw, beam_z),
        (x, yc + hw * (0.38 - 0.10 * box), keel_z),
        (x, yc - hw * (0.38 - 0.10 * box), keel_z),
        (x, yc - hw, beam_z),
        (x, yc - shoulder_y, shoulder_z),
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


def inset_dorsal_seams(hull):
    """Cut panel channels into the skin. Not boxes parked on the spine."""
    mesh = hull.data
    bm = bmesh.new()
    bm.from_mesh(mesh)
    bm.faces.ensure_lookup_table()
    faces = [face for face in bm.faces if face.normal.z > 0.42 and face.calc_area() > 0.05]
    if faces:
        bmesh.ops.inset_region(bm, faces=faces, thickness=0.052, depth=-0.040, use_boundary=True)
    bm.to_mesh(mesh)
    bm.free()
    mesh.update()
    return hull


def build_hull(mats):
    hull_mat = mats["Material_Hull"]
    armor = mats["Material_Armor"]
    deck = mats["Material_Deck"]
    # Blunt-bow workboat: bow shoulder, greenhouse band, cargo waist, machinery, transom.
    # x, hw, hh, zc, keel, flat, box
    stations = [
        (7.92, 0.55, 0.52, 0.10, 0.22, 0.34, 0.40),
        (7.05, 0.92, 0.74, 0.14, 0.22, 0.48, 0.46),
        (5.65, 1.28, 0.92, 0.18, 0.18, 0.70, 0.52),
        (4.05, 1.58, 0.98, 0.16, 0.16, 0.84, 0.60),
        (2.15, 1.82, 1.06, 0.14, 0.14, 0.90, 0.70),
        (0.25, 1.96, 1.10, 0.12, 0.14, 0.92, 0.78),
        (-1.55, 1.86, 1.06, 0.12, 0.12, 0.86, 0.82),
        (-3.45, 1.58, 1.00, 0.14, 0.12, 0.68, 0.86),
        (-5.45, 1.28, 0.96, 0.16, 0.10, 0.46, 0.90),
        (-7.15, 1.10, 0.90, 0.16, 0.10, 0.30, 0.92),
        (-8.42, 0.94, 0.78, 0.14, 0.08, 0.22, 0.94),
    ]
    rings = [chine_ring(x, hw, hh, zc, keel, 0.0, flat, box) for x, hw, hh, zc, keel, flat, box in stations]
    hull = loft_rings("LOD0_Hull", rings, hull_mat, 0.012)
    inset_dorsal_seams(hull)
    extras = []
    # Walkways beside the openings — never a lid over the tub or the hold.
    extras.append(add_box("LOD0_DeckFore_Port", (2.20, 0.42, 0.07), (4.40, -0.92, 1.04), deck, 0.002))
    extras.append(add_box("LOD0_DeckFore_Stbd", (2.20, 0.42, 0.07), (4.40, 0.92, 1.04), deck, 0.002))
    extras.append(add_box("LOD0_DeckWaist_Port", (1.55, 0.38, 0.06), (1.85, -1.05, 1.06), deck, 0.002))
    extras.append(add_box("LOD0_DeckWaist_Stbd", (1.55, 0.38, 0.06), (1.85, 1.05, 1.06), deck, 0.002))
    extras.append(add_box("LOD0_DeckAft", (1.85, 0.85, 0.06), (-4.85, 0.0, 1.00), deck, 0.002))
    extras.append(add_box("LOD0_KeelStrake", (12.4, 0.28, 0.10), (-0.20, 0.0, -0.92), armor, 0.002))
    for sign, tag in ((-1.0, "Port"), (1.0, "Stbd")):
        extras.append(loft_rings(
            f"LOD0_ArmorCheek_{tag}",
            [
                chine_ring(3.40, 0.22, 0.18, 0.22, 0.02, 1.28 * sign, 0.12, 0.24),
                chine_ring(0.80, 0.28, 0.16, 0.18, 0.02, 1.62 * sign, 0.10, 0.20),
                chine_ring(-2.40, 0.22, 0.14, 0.16, 0.02, 1.38 * sign, 0.08, 0.16),
            ],
            armor, 0.006, cap=True,
        ))
    return hull, extras


def build_nacelles(mats, lod):
    hull_mat = mats["Material_Hull"]
    armor = mats["Material_Armor"]
    ceramic = mats["Material_Ceramic"]
    warning = mats["Material_Warning"]
    bits = []
    report = {}
    # yc grows out of the flank: first stations sit inside the hull half-width.
    # x, yc_abs, hw, hh, zc, keel, flat, box
    station_core = [
        (-0.55, 0.72, 0.26, 0.40, 0.22, 0.08, 0.32, 0.54),
        (-1.90, 1.18, 0.40, 0.56, 0.24, 0.08, 0.22, 0.66),
        (-3.40, 1.52, 0.56, 0.72, 0.26, 0.08, 0.14, 0.78),
        (-5.10, 1.76, 0.66, 0.82, 0.28, 0.07, 0.10, 0.86),
        (-6.70, 1.86, 0.70, 0.86, 0.28, 0.06, 0.08, 0.88),
        (-8.12, 1.84, 0.58, 0.70, 0.28, 0.06, 0.08, 0.90),
    ]
    for sign, tag in ((-1.0, "Port"), (1.0, "Stbd")):
        rings = [
            chine_ring(x, hw, hh, zc, keel, yc_abs * sign, flat, box)
            for x, yc_abs, hw, hh, zc, keel, flat, box in station_core
        ]
        nacelle = loft_rings(f"LOD0_Nacelle_{tag}", rings, hull_mat, 0.010)
        bits.append(nacelle)
        yc = 1.86 * sign
        bits.append(add_box(
            f"LOD0_NacelleArmor_{tag}",
            (1.55, 0.62, 0.16),
            (-5.55, yc, 1.05),
            armor, 0.002,
        ))
        bits.append(add_cylinder(
            f"LOD0_Collar_{tag}", 0.78, 0.22, (-6.55, yc, 0.28), warning, 0.002,
            rotation=(0.0, math.radians(90.0), 0.0), vertices=12,
        ))
        bits.append(add_cylinder(
            f"LOD0_HeatBand_{tag}", 0.62, 0.10, (-7.35, yc, 0.28), ceramic, 0.0,
            rotation=(0.0, math.radians(90.0), 0.0), vertices=12,
        ))
        if lod < 2:
            def slot(name=f"NacelleSlot_{tag}", loc=(-4.85, yc, 0.95)):
                return add_box(name, (1.35, 0.42, 0.32), loc, hull_mat, 0.0)

            def throat(name=f"NacelleThroat_{tag}", loc=(-7.55, yc, 0.62)):
                return add_box(name, (1.15, 0.58, 0.62), loc, hull_mat, 0.0)

            report[f"slot_{tag}"] = cut(nacelle, slot)
            report[f"throat_{tag}"] = cut(nacelle, throat)
            bits.append(add_box(
                f"LOD0_IntakeGrill_{tag}", (0.10, 0.52, 0.38),
                (-3.35, yc * 0.92, 0.38), mats["Material_Mechanical"], 0.0,
            ))
            for index in range(4 if lod == 0 else 2):
                bits.append(add_box(
                    f"LOD0_CoolFin_{tag}_{index}",
                    (0.18, 0.07, 0.26),
                    (-4.40 - index * 0.28, yc, 1.10),
                    mats["Material_Radiator"], 0.0,
                ))
    return bits, report


def build_winglets(mats, lod):
    hull_mat = mats["Material_Hull"]
    armor = mats["Material_Armor"]
    warning = mats["Material_Warning"]
    bits = []
    for sign, tag in ((1.0, "Stbd"), (-1.0, "Port")):
        rings = [
            airfoil(1.62, 1.48 * sign, 0.20, 2.05, 0.68),
            airfoil(1.28, 2.02 * sign, 0.22, 1.62, 0.44),
            airfoil(0.88, 2.52 * sign, 0.24, 1.18, 0.26),
            airfoil(0.50, 2.92 * sign, 0.24, 0.78, 0.16),
        ]
        wing = loft_rings(f"LOD0_Winglet_{tag}", rings, hull_mat, 0.012)
        bits.append(wing)
        bits.append(add_box(f"LOD0_WingRoot_{tag}", (1.15, 0.42, 0.22), (0.95, 1.62 * sign, 0.28), armor, 0.002))
        bits.append(add_box(f"LOD0_WingTip_{tag}", (0.28, 0.22, 0.12), (0.55, 2.86 * sign, 0.24), warning, 0.0))
        if lod == 0:
            def flap_slot(name=f"FlapSlot_{tag}", loc=(0.55, 2.28 * sign, 0.20)):
                return add_box(name, (0.10, 0.72, 0.22), loc, hull_mat, 0.0)
            cut(wing, flap_slot)
            bits.append(add_box(f"LOD0_Flap_{tag}", (0.55, 0.62, 0.10), (0.18, 2.32 * sign, 0.18), armor, 0.002))
    return bits


def build_cargo_well(hull, mats, lod):
    armor = mats["Material_Armor"]
    mech = mats["Material_Mechanical"]
    warning = mats["Material_Warning"]
    deck = mats["Material_Deck"]

    def mouth():
        return add_box("WellMouthCut", (2.95, 1.48, 1.35), (0.10, 0.0, 0.95), armor, 0.0)

    report = {"mouth": cut(hull, mouth)}
    bits = add_open_well("LOD0_Well", (2.72, 1.32, 1.12), (0.10, 0.0, 0.58), mech, floor=True, open_aft=False, wall=0.060)
    # Orange rim only — four bars, not a lid over the hold.
    bits.append(add_box("LOD0_WellRim_Port", (2.80, 0.08, 0.10), (0.10, -0.70, 1.16), warning, 0.0))
    bits.append(add_box("LOD0_WellRim_Stbd", (2.80, 0.08, 0.10), (0.10, 0.70, 1.16), warning, 0.0))
    bits.append(add_box("LOD0_WellRim_Fore", (0.08, 1.40, 0.10), (1.46, 0.0, 1.16), warning, 0.0))
    bits.append(add_box("LOD0_WellRim_Aft", (0.08, 1.40, 0.10), (-1.26, 0.0, 1.16), warning, 0.0))
    bits.append(add_box("LOD0_WellGrate", (1.15, 0.55, 0.05), (0.45, 0.22, 0.22), mats["Material_Radiator"], 0.0))
    bits.append(add_box("LOD0_Gantry", (0.12, 1.42, 0.12), (0.10, 0.0, 1.42), mech, 0.001))
    bits.append(add_box("LOD0_GantryRail_Port", (2.20, 0.06, 0.08), (0.10, -0.64, 1.32), mech, 0.0))
    bits.append(add_box("LOD0_GantryRail_Stbd", (2.20, 0.06, 0.08), (0.10, 0.64, 1.32), mech, 0.0))
    if lod < 2:
        crates = [
            ((0.58, 0.42, 0.38), (0.55, -0.28, 0.28), armor),
            ((0.48, 0.36, 0.32), (-0.35, 0.22, 0.26), warning),
            ((0.42, 0.32, 0.28), (0.85, 0.32, 0.24), mats["Material_Accent"]),
        ]
        for index, (dim, loc, mat) in enumerate(crates):
            bits.append(add_box(f"LOD0_Crate_{index}", dim, loc, mat, 0.002))
            bits.append(add_box(
                f"LOD0_CrateLid_{index}",
                (dim[0] + 0.04, dim[1] + 0.04, 0.05),
                (loc[0], loc[1], loc[2] + dim[2] * 0.5 + 0.02),
                deck, 0.0,
            ))
    return bits, report


def build_greenhouse(hull, mats, lod):
    armor = mats["Material_Armor"]
    mech = mats["Material_Mechanical"]
    glass = mats["Material_Canopy"]

    def tub():
        return add_box("GreenTubCut", (1.95, 0.98, 1.28), (4.85, 0.0, 0.92), armor, 0.0)

    def windshield():
        return add_box(
            "GreenWindCut", (1.05, 0.62, 0.95), (5.55, 0.0, 1.02), armor, 0.0,
            rotation=(0.0, math.radians(-20.0), 0.0),
        )

    report = {"tub": cut(hull, tub), "windshield": False}
    if lod < 2:
        report["windshield"] = cut(hull, windshield)
    bits = add_open_well("LOD0_Tub", (1.68, 0.84, 0.78), (4.85, 0.0, 0.48), mech, floor=True, open_aft=False)
    bits.append(add_box("LOD0_Coaming_Port", (1.78, 0.045, 0.10), (4.85, -0.44, 1.18), armor, 0.001))
    bits.append(add_box("LOD0_Coaming_Stbd", (1.78, 0.045, 0.10), (4.85, 0.44, 1.18), armor, 0.001))
    bits.append(add_box("LOD0_Coaming_Fore", (0.16, 0.84, 0.10), (5.68, 0.0, 1.20), armor, 0.001, rotation=(0.0, math.radians(-18.0), 0.0)))
    bits.append(add_box("LOD0_Coaming_Aft", (0.16, 0.84, 0.10), (4.02, 0.0, 1.16), armor, 0.001))
    bits.append(add_box("LOD0_Mullion_Mid", (0.06, 0.78, 0.10), (4.85, 0.0, 1.16), armor, 0.0))
    if lod < 2:
        bits.append(add_box(
            "LOD0_Glass",
            (1.48, 0.62, 0.14),
            (4.85, 0.0, 0.95),
            glass, 0.0,
            rotation=(0.0, math.radians(-12.0), 0.0),
        ))
    return bits, report


def build_drives(mats, lod):
    thruster = mats["Material_Thruster"]
    ceramic = mats["Material_Ceramic"]
    mech = mats["Material_Mechanical"]
    bits = []
    report = {}
    for sign, tag in ((-1.0, "Port"), (1.0, "Stbd")):
        y = 1.86 * sign
        rings = [
            circle_ring((-7.85, y, 0.28), (-1.0, 0.0, 0.0), 0.46, 12),
            circle_ring((-8.35, y, 0.28), (-1.0, 0.0, 0.0), 0.40, 12),
            circle_ring((-8.78, y, 0.28), (-1.0, 0.0, 0.0), 0.32, 12),
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

    bits.append(add_box("LOD0_SpineBow", (2.15, 0.16, 0.10), (3.05, 0.0, 1.14), mech, 0.001))
    bits.append(add_box("LOD0_SpineAft", (2.55, 0.16, 0.10), (-3.55, 0.0, 1.12), mech, 0.001))
    for index, x in enumerate((5.4, 3.15, 1.85, -2.55, -4.65)):
        bits.append(add_box(f"LOD0_Longeron_{index}", (0.10, 1.55, 0.08), (x, 0.0, 1.08), mech, 0.0))

    bits.append(add_box("LOD0_AccentFlank_Port", (4.8, 0.08, 0.16), (1.10, -1.72, 0.22), accent, 0.0))
    bits.append(add_box("LOD0_AccentFlank_Stbd", (4.8, 0.08, 0.16), (1.10, 1.72, 0.22), accent, 0.0))

    bits.append(add_box("LOD0_Chevron_0", (0.55, 0.42, 0.06), (-3.20, 0.0, 1.12), warning, 0.0, rotation=(0.0, 0.0, math.radians(28.0))))
    bits.append(add_box("LOD0_Chevron_1", (0.55, 0.42, 0.06), (-3.70, 0.0, 1.12), warning, 0.0, rotation=(0.0, 0.0, math.radians(-28.0))))

    def rad_cut():
        return add_box("RadWellCut", (1.42, 0.78, 0.42), (-2.55, 0.0, 1.12), mech, 0.0)

    cut(hull, rad_cut)
    bits.extend(add_open_well("LOD0_RadWell", (1.28, 0.68, 0.38), (-2.55, 0.0, 0.98), mech, floor=True, open_aft=False, wall=0.045))
    for index in range(5 if lod == 0 else 3):
        bits.append(add_box(f"LOD0_RadFin_{index}", (0.08, 0.52, 0.22), (-2.95 + index * 0.22, 0.0, 0.95), rad, 0.0))
    bits.append(add_box("LOD0_RadHeader", (1.22, 0.06, 0.06), (-2.55, 0.28, 1.08), rad, 0.0))

    bits.append(add_box("LOD0_HatchLid", (0.78, 0.52, 0.10), (2.35, 0.42, 1.16), armor, 0.002))
    bits.append(add_box("LOD0_HatchHinge", (0.10, 0.52, 0.12), (2.72, 0.42, 1.18), mech, 0.0))

    bits.append(add_box("LOD0_RepairPatch", (1.05, 0.55, 0.07), (2.10, -1.15, 0.48), armor, 0.002))
    bits.append(add_box("LOD0_RepairWeld", (1.05, 0.05, 0.09), (2.10, -0.88, 0.52), mech, 0.0))

    for index, x in enumerate((5.85, 3.15, 2.05, -2.35, -4.45)):
        bits.append(add_box(f"LOD0_Panel_{index}", (0.95, 0.58, 0.07), (x, -0.78 if index % 2 == 0 else 0.82, 1.08), armor, 0.001))
        bits.append(add_box(f"LOD0_PanelSeam_{index}", (0.05, 0.64, 0.08), (x - 0.50, -0.78 if index % 2 == 0 else 0.82, 1.10), mech, 0.0))

    bits.append(add_box("LOD0_LetterPlaque", (0.85, 1.15, 0.05), (2.05, 1.18, 1.10), armor, 0.0))
    bits.extend(add_letter_d("LOD0_LetterD", (2.05, 0.92, 1.16), 0.70, 0.48, 0.14, 0.07, warning))
    bits.extend(add_digit_2("LOD0_Letter2", (2.05, 1.42, 1.16), 0.70, 0.40, 0.12, 0.07, warning))

    bits.append(add_box("LOD0_DirtWell", (2.40, 0.18, 0.05), (0.10, -0.82, 1.20), dirt, 0.0))
    bits.append(add_box("LOD0_DirtSpine", (3.40, 0.16, 0.05), (2.40, 0.08, 1.12), dirt, 0.0))
    bits.append(add_box("LOD0_DirtNacelle_Port", (1.85, 0.14, 0.05), (-5.20, -1.86, 1.08), dirt, 0.0))
    bits.append(add_box("LOD0_DirtNacelle_Stbd", (1.85, 0.14, 0.05), (-5.20, 1.86, 1.08), dirt, 0.0))
    bits.append(add_box("LOD0_DirtBow", (0.85, 0.28, 0.05), (6.85, 0.0, 0.42), dirt, 0.0))

    bits.append(add_box("LOD0_CableTray", (3.20, 0.14, 0.10), (1.80, 0.22, 1.22), mech, 0.001))
    bits.append(add_box("LOD0_CableClamp_Fore", (0.12, 0.20, 0.14), (3.20, 0.22, 1.26), armor, 0.0))
    bits.append(add_box("LOD0_CableClamp_Aft", (0.12, 0.20, 0.14), (0.40, 0.22, 1.26), armor, 0.0))

    bits.append(add_box("LOD0_RCS_Port", (0.22, 0.18, 0.16), (-1.20, -1.90, 0.15), mech, 0.002))
    bits.append(add_box("LOD0_RCS_Stbd", (0.22, 0.18, 0.16), (-1.20, 1.90, 0.15), mech, 0.002))
    bits.append(add_cylinder("LOD0_RCSCup_Port", 0.06, 0.08, (-1.20, -2.02, 0.15), hull_mat, 0.0, vertices=8))
    bits.append(add_cylinder("LOD0_RCSCup_Stbd", 0.06, 0.08, (-1.20, 2.02, 0.15), hull_mat, 0.0, vertices=8))

    bits.append(add_box("LOD0_SensorPedestal", (0.10, 0.10, 0.22), (0.60, 0.0, 1.58), mech, 0.002))
    bits.append(add_cylinder("LOD0_SensorDish", 0.16, 0.06, (0.60, 0.0, 1.72), armor, 0.0, vertices=10))
    bits.append(add_box("LOD0_AntennaMast", (0.08, 0.08, 0.55), (5.15, 0.28, 1.72), mech, 0.0))
    bits.append(add_cylinder("LOD0_AntennaTip", 0.06, 0.10, (5.15, 0.28, 2.02), armor, 0.0, vertices=8))

    bits.append(add_box("LOD0_Beacon_Fore", (0.12, 0.12, 0.10), (3.55, 0.0, 1.28), accent, 0.0))
    bits.append(add_box("LOD0_Beacon_Aft", (0.12, 0.12, 0.10), (-6.20, 0.0, 1.12), warning, 0.0))
    bits.append(add_box("LOD0_Nav_Port", (0.12, 0.12, 0.08), (0.55, -2.86, 0.28), warning, 0.0))
    bits.append(add_box("LOD0_Nav_Stbd", (0.12, 0.12, 0.08), (0.55, 2.86, 0.28), accent, 0.0))

    if lod == 0:
        bits.extend(add_hose(
            "LOD0_Hose_WellRad",
            [(1.35, 0.55, 1.22), (0.40, 0.62, 1.32), (-1.80, 0.40, 1.22), (-2.55, 0.28, 1.18)],
            0.032, mech, 8,
        ))
        bits.extend(add_hose(
            "LOD0_Hose_Nacelle_Stbd",
            [(-3.40, 1.10, 1.10), (-4.60, 1.55, 1.18), (-5.80, 1.82, 1.12)],
            0.028, mech, 8,
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
            "Gantry", "Chevron", "Collar", "Longeron", "Spine", "Letter")
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
    (out_dir / "drifter_chase_form_v1.summary.json").write_text(json.dumps(summary, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(summary))


if __name__ == "__main__":
    main()

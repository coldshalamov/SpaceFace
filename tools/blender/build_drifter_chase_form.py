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

REVISION = "chase_form_v6"
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
    "Material_Hull": {"color": (0.28, 0.37, 0.38), "metallic": 0.10, "roughness": 0.48, "role": "hull"},
    "Material_Armor": {"color": (0.036, 0.048, 0.054), "metallic": 0.24, "roughness": 0.58, "role": "armor"},
    "Material_Deck": {"color": (0.36, 0.38, 0.34), "metallic": 0.08, "roughness": 0.50, "role": "deck"},
    "Material_Canopy": {"color": (0.012, 0.016, 0.022), "metallic": 0.0, "roughness": 0.06, "role": "glass"},
    "Material_Ceramic": {"color": (0.30, 0.28, 0.26), "metallic": 0.0, "roughness": 0.62, "role": "ceramic"},
    "Material_Mechanical": {"color": (0.05, 0.052, 0.056), "metallic": 0.42, "roughness": 0.48, "role": "mechanical"},
    "Material_Radiator": {"color": (0.08, 0.05, 0.04), "metallic": 0.20, "roughness": 0.50, "role": "radiator"},
    "Material_Thruster": {"color": (0.028, 0.028, 0.032), "metallic": 0.28, "roughness": 0.50, "role": "thruster"},
    "Material_Accent": {"color": (0.06, 0.36, 0.34), "metallic": 0.04, "roughness": 0.40, "role": "accent"},
    "Material_Warning": {"color": (0.82, 0.34, 0.08), "metallic": 0.02, "roughness": 0.40, "role": "warning"},
    "Material_Dirt": {"color": (0.16, 0.10, 0.06), "metallic": 0.02, "roughness": 0.78, "role": "dirt"},
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
        (x, yc + deck_y, crown - hh * 0.05 * flat),
        (x, yc + shoulder_y, shoulder_z),
        (x, yc + hw, beam_z),
        (x, yc + bilge_y, bilge_z),
        (x, yc + keel_y, keel_z),
        (x, yc + 0.0, keel_z + keel * 0.08),
        (x, yc - keel_y, keel_z),
        (x, yc - bilge_y, bilge_z),
        (x, yc - hw, beam_z),
        (x, yc - shoulder_y, shoulder_z),
        (x, yc - deck_y, crown - hh * 0.05 * flat),
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


def inset_panel_seams(hull):
    """Unused in C6: full-face insets rectangularized the formed shell at D=144."""
    return hull


def build_hull(mats):
    hull_mat = mats["Material_Hull"]
    armor = mats["Material_Armor"]
    deck = mats["Material_Deck"]
    # Formed workboat: pointed bow, greenhouse band, fuller cargo waist, faired transom.
    # x, hw, hh, zc, keel, flat, box — box stays low so the shell is not a brick stack.
    stations = [
        (7.95, 0.36, 0.44, 0.10, 0.16, 0.16, 0.10),
        (6.85, 0.74, 0.70, 0.16, 0.16, 0.30, 0.14),
        (5.55, 1.22, 1.02, 0.24, 0.14, 0.50, 0.18),
        (4.05, 1.68, 1.16, 0.20, 0.12, 0.72, 0.22),
        (2.25, 2.08, 1.24, 0.16, 0.12, 0.86, 0.26),
        (0.15, 2.20, 1.28, 0.14, 0.12, 0.90, 0.28),
        (-1.75, 2.10, 1.22, 0.14, 0.10, 0.82, 0.32),
        (-3.55, 1.78, 1.12, 0.16, 0.10, 0.62, 0.34),
        (-5.45, 1.42, 1.02, 0.18, 0.08, 0.40, 0.32),
        (-7.15, 1.10, 0.86, 0.16, 0.08, 0.24, 0.28),
        (-8.48, 0.78, 0.66, 0.12, 0.06, 0.14, 0.22),
    ]
    rings = [chine_ring(x, hw, hh, zc, keel, 0.0, flat, box) for x, hw, hh, zc, keel, flat, box in stations]
    hull = loft_rings("LOD0_Hull", rings, hull_mat, 0.014)
    # Four chase-scale ring frames in the skin — not a plate carpet, not voxel seams.
    for index, x in enumerate((5.35, 2.85, -2.05, -5.55)):
        def ring_frame(name=f"FrameCut_{index}", loc=(x, 0.0, 0.28)):
            return add_box(name, (0.22, 4.55, 2.05), loc, hull_mat, 0.0)
        cut(hull, ring_frame)
    extras = []
    extras.append(add_box("LOD0_DeckFore_Port", (2.35, 0.28, 0.06), (5.05, -0.82, 1.12), deck, 0.002))
    extras.append(add_box("LOD0_DeckFore_Stbd", (2.35, 0.28, 0.06), (5.05, 0.82, 1.12), deck, 0.002))
    extras.append(add_box("LOD0_DeckWaist_Port", (2.05, 0.26, 0.06), (0.15, -1.18, 1.18), deck, 0.002))
    extras.append(add_box("LOD0_DeckWaist_Stbd", (2.05, 0.26, 0.06), (0.15, 1.18, 1.18), deck, 0.002))
    extras.append(add_box("LOD0_KeelStrake", (12.6, 0.32, 0.12), (-0.20, 0.0, -1.18), armor, 0.002))
    for sign, tag in ((-1.0, "Port"), (1.0, "Stbd")):
        extras.append(loft_rings(
            f"LOD0_ArmorCheek_{tag}",
            [
                chine_ring(3.20, 0.18, 0.16, 0.18, 0.02, 1.42 * sign, 0.10, 0.18),
                chine_ring(0.40, 0.24, 0.14, 0.16, 0.02, 1.88 * sign, 0.08, 0.16),
                chine_ring(-2.80, 0.18, 0.12, 0.14, 0.02, 1.52 * sign, 0.06, 0.14),
            ],
            armor, 0.006, cap=True,
        ))
        extras.append(add_box(
            f"LOD0_AccentChine_{tag}",
            (7.4, 0.10, 0.18),
            (0.40, 1.95 * sign, 0.18),
            mats["Material_Accent"], 0.0,
        ))
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
            armor, 0.006, cap=True,
        ))
        bits.append(add_cylinder(
            f"LOD0_Collar_{tag}", 0.82, 0.24, (-6.45, yc, 0.28), warning, 0.002,
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
    warning = mats["Material_Warning"]
    bits = []
    for sign, tag in ((1.0, "Stbd"), (-1.0, "Port")):
        rings = [
            airfoil(1.88, 1.68 * sign, 0.16, 2.42, 0.86),
            airfoil(1.48, 2.18 * sign, 0.20, 1.92, 0.54),
            airfoil(1.02, 2.62 * sign, 0.22, 1.38, 0.30),
            airfoil(0.52, 3.02 * sign, 0.22, 0.88, 0.16),
        ]
        wing = loft_rings(f"LOD0_Winglet_{tag}", rings, hull_mat, 0.012)
        bits.append(wing)
        bits.append(add_box(f"LOD0_WingRoot_{tag}", (1.35, 0.38, 0.24), (1.05, 1.72 * sign, 0.26), armor, 0.002))
        bits.append(add_box(f"LOD0_WingTip_{tag}", (0.32, 0.24, 0.12), (0.52, 2.98 * sign, 0.24), warning, 0.0))
        if lod == 0:
            def flap_slot(name=f"FlapSlot_{tag}", loc=(0.52, 2.28 * sign, 0.18)):
                return add_box(name, (0.12, 0.78, 0.24), loc, hull_mat, 0.0)
            cut(wing, flap_slot)
            bits.append(add_box(f"LOD0_Flap_{tag}", (0.58, 0.66, 0.10), (0.16, 2.32 * sign, 0.16), armor, 0.002))
    return bits


def build_cargo_well(hull, mats, lod):
    armor = mats["Material_Armor"]
    mech = mats["Material_Mechanical"]
    warning = mats["Material_Warning"]
    deck = mats["Material_Deck"]

    def mouth():
        return add_box("WellMouthCut", (4.35, 2.05, 1.72), (0.15, 0.0, 1.12), armor, 0.0)

    report = {"mouth": cut(hull, mouth)}
    bits = add_open_well("LOD0_Well", (4.05, 1.88, 1.28), (0.15, 0.0, 0.52), mech, floor=True, open_aft=False, wall=0.070)
    bits.append(add_box("LOD0_WellRim_Port", (4.18, 0.10, 0.12), (0.15, -1.00, 1.28), warning, 0.0))
    bits.append(add_box("LOD0_WellRim_Stbd", (4.18, 0.10, 0.12), (0.15, 1.00, 1.28), warning, 0.0))
    bits.append(add_box("LOD0_WellRim_Fore", (0.10, 2.00, 0.12), (2.24, 0.0, 1.28), warning, 0.0))
    bits.append(add_box("LOD0_WellRim_Aft", (0.10, 2.00, 0.12), (-1.94, 0.0, 1.28), warning, 0.0))
    bits.append(add_box("LOD0_WellGrate", (1.55, 0.72, 0.05), (0.55, 0.28, 0.12), mats["Material_Radiator"], 0.0))
    bits.append(add_box("LOD0_Gantry", (0.14, 1.92, 0.14), (0.15, 0.0, 1.52), mech, 0.001))
    if lod < 2:
        crates = [
            ((0.52, 0.38, 0.32), (1.05, -0.42, 0.12), armor),
            ((0.42, 0.32, 0.26), (-0.85, 0.38, 0.10), warning),
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
    bits.append(add_box("LOD0_Coaming_Port", (2.55, 0.12, 0.14), (5.20, -0.62, 1.32), armor, 0.001))
    bits.append(add_box("LOD0_Coaming_Stbd", (2.55, 0.12, 0.14), (5.20, 0.62, 1.32), armor, 0.001))
    bits.append(add_box("LOD0_Coaming_Fore", (0.22, 1.18, 0.14), (6.38, 0.0, 1.34), armor, 0.001, rotation=(0.0, math.radians(-20.0), 0.0)))
    bits.append(add_box("LOD0_Coaming_Aft", (0.22, 1.18, 0.14), (4.02, 0.0, 1.28), armor, 0.001))
    bits.append(add_box("LOD0_Mullion_Mid", (0.10, 1.08, 0.14), (5.20, 0.0, 1.28), armor, 0.0))
    if lod < 2:
        bits.append(add_box(
            "LOD0_Glass",
            (2.22, 0.98, 0.16),
            (5.20, 0.0, 0.98),
            glass, 0.0,
            rotation=(0.0, math.radians(-14.0), 0.0),
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

    # Cluster 1 — cargo well: radiator crater aft of the hold, spine that stops at the mouth.
    bits.append(add_box("LOD0_SpineBow", (1.85, 0.28, 0.16), (3.55, 0.0, 1.30), mech, 0.001))
    bits.append(add_box("LOD0_SpineAft", (2.15, 0.28, 0.16), (-3.55, 0.0, 1.24), mech, 0.001))

    def rad_cut():
        return add_box("RadWellCut", (1.65, 0.92, 0.48), (-3.05, 0.0, 1.18), mech, 0.0)

    cut(hull, rad_cut)
    bits.extend(add_open_well("LOD0_RadWell", (1.48, 0.80, 0.42), (-3.05, 0.0, 1.02), mech, floor=True, open_aft=False, wall=0.050))
    for index in range(4 if lod == 0 else 2):
        bits.append(add_box(f"LOD0_RadFin_{index}", (0.10, 0.62, 0.26), (-3.55 + index * 0.28, 0.0, 0.98), rad, 0.0))
    bits.append(add_box("LOD0_RadHeader", (1.42, 0.06, 0.06), (-3.05, 0.32, 1.12), rad, 0.0))
    bits.append(add_box("LOD0_DirtWell", (4.25, 0.42, 0.08), (0.15, -1.12, 1.32), dirt, 0.0))
    bits.append(add_box("LOD0_DirtWell_S", (4.25, 0.42, 0.08), (0.15, 1.12, 1.32), dirt, 0.0))

    # Cluster 2 — nacelle roots: heat dirt + one hose per pod. Cowl/collar/throat live on the nacelle.
    bits.append(add_box("LOD0_DirtNacelle_Port", (2.85, 0.48, 0.08), (-5.40, -1.80, 1.10), dirt, 0.0))
    bits.append(add_box("LOD0_DirtNacelle_Stbd", (2.85, 0.48, 0.08), (-5.40, 1.80, 1.10), dirt, 0.0))
    bits.append(add_box("LOD0_HeatPlate_Port", (1.55, 0.48, 0.12), (-6.45, -1.52, 0.92), mats["Material_Ceramic"], 0.001))
    bits.append(add_box("LOD0_HeatPlate_Stbd", (1.55, 0.48, 0.12), (-6.45, 1.52, 0.92), mats["Material_Ceramic"], 0.001))

    # Cluster 3 — transom / identity: one D2, one 02, RCS at live sockets, sensor, nav.
    bits.append(add_box("LOD0_LetterPlaque", (1.45, 1.85, 0.05), (0.78, -2.38, 0.48), armor, 0.0))
    bits.extend(add_letter_d("LOD0_LetterD", (0.78, -2.78, 0.56), 1.18, 0.78, 0.22, 0.10, warning))
    bits.extend(add_digit_2("LOD0_Letter2", (0.78, -1.96, 0.56), 1.18, 0.68, 0.20, 0.10, warning))
    bits.append(add_box("LOD0_DigitPlaque", (1.32, 1.68, 0.05), (0.74, 2.32, 0.48), armor, 0.0))
    bits.extend(add_digit_0("LOD0_Letter0", (0.74, 1.92, 0.56), 1.08, 0.58, 0.18, 0.10, warning))
    bits.extend(add_digit_2("LOD0_Letter02", (0.74, 2.68, 0.56), 1.08, 0.58, 0.18, 0.10, warning))

    bits.append(add_box("LOD0_RCS_Port", (0.22, 0.18, 0.16), (-1.20, -1.90, 0.15), mech, 0.002))
    bits.append(add_box("LOD0_RCS_Stbd", (0.22, 0.18, 0.16), (-1.20, 1.90, 0.15), mech, 0.002))
    bits.append(add_cylinder("LOD0_RCSCup_Port", 0.06, 0.08, (-1.20, -2.02, 0.15), hull_mat, 0.0, vertices=8))
    bits.append(add_cylinder("LOD0_RCSCup_Stbd", 0.06, 0.08, (-1.20, 2.02, 0.15), hull_mat, 0.0, vertices=8))
    bits.append(add_box("LOD0_RCS_ForePort", (0.22, 0.16, 0.16), (6.35, -0.62, 0.22), mech, 0.002))
    bits.append(add_box("LOD0_RCS_ForeStbd", (0.22, 0.16, 0.16), (6.35, 0.62, 0.22), mech, 0.002))
    bits.append(add_box("LOD0_RCS_AftPort", (0.24, 0.18, 0.16), (-6.85, -0.72, 0.28), mech, 0.002))
    bits.append(add_box("LOD0_RCS_AftStbd", (0.24, 0.18, 0.16), (-6.85, 0.72, 0.28), mech, 0.002))

    bits.append(add_box("LOD0_SensorPedestal", (0.10, 0.10, 0.18), (0.60, 0.0, 1.62), mech, 0.002))
    bits.append(add_cylinder("LOD0_SensorDish", 0.16, 0.06, (0.60, 0.0, 1.74), armor, 0.0, vertices=10))
    bits.append(add_box("LOD0_Beacon_Fore", (0.16, 0.16, 0.12), (3.85, 0.0, 1.38), accent, 0.0))
    bits.append(add_box("LOD0_Beacon_Aft", (0.16, 0.16, 0.12), (-6.35, 0.0, 1.18), warning, 0.0))
    bits.append(add_box("LOD0_Nav_Port", (0.16, 0.16, 0.10), (0.52, -2.98, 0.28), warning, 0.0))
    bits.append(add_box("LOD0_Nav_Stbd", (0.16, 0.16, 0.10), (0.52, 2.98, 0.28), accent, 0.0))

    if lod == 0:
        bits.extend(add_hose(
            "LOD0_Hose_WellRad",
            [(2.05, 0.92, 1.32), (0.55, 1.05, 1.38), (-1.55, 0.72, 1.28), (-3.05, 0.42, 1.18)],
            0.16, mech, 8,
        ))
        bits.extend(add_hose(
            "LOD0_Hose_Nacelle_Stbd",
            [(-3.20, 1.05, 1.12), (-4.70, 1.48, 1.22), (-6.00, 1.76, 1.10)],
            0.16, mech, 8,
        ))
        bits.extend(add_hose(
            "LOD0_Hose_Nacelle_Port",
            [(-3.20, -1.05, 1.12), (-4.70, -1.48, 1.22), (-6.00, -1.76, 1.10)],
            0.16, mech, 8,
        ))
        bits.append(add_box("LOD0_MiningHouse", (0.55, 0.28, 0.22), (7.35, 0.0, -0.12), armor, 0.002))
        bits.append(add_cylinder(
            "LOD0_MiningBit", 0.07, 0.42, (7.62, 0.0, -0.12), mech, 0.0,
            rotation=(0.0, math.radians(90.0), 0.0), vertices=8,
        ))
        for i, x in enumerate((-0.55, 0.85)):
            bits.append(add_box(f"LOD0_WellBolt_P_{i}", (0.26, 0.26, 0.12), (x, -1.00, 1.36), mech, 0.0))
            bits.append(add_box(f"LOD0_WellBolt_S_{i}", (0.26, 0.26, 0.12), (x, 1.00, 1.36), mech, 0.0))
    return bits


def shade_objects(objs):
    hard = ("Hull", "Winglet", "Nacelle", "Flap", "Armor", "Accent", "Gun",
            "Repair", "Hatch", "Cable", "RCS", "Nav", "Hose", "Deck",
            "Heat", "Panel", "Dirt", "Crate", "Beacon", "Coaming", "Well",
            "Gantry", "Chevron", "Collar", "Longeron", "Spine", "Letter",
            "Bolt", "Tile", "Lamp", "Plaque", "Fastener", "WalkPlate", "BowPlate",
            "HeatPlate", "Digit", "Flank", "Vent", "LowPanel", "Clamp")
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
    (out_dir / "drifter_chase_form_v6.summary.json").write_text(json.dumps(summary, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(summary))


if __name__ == "__main__":
    main()

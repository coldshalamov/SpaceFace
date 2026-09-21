"""PQ-050.01 Hornet chase-camera form rebuild.

Imports the live Hornet only for root, sockets, and collision. Replaces the
render meshes with one closed interceptor that reads at the live chase camera:
changing hull stations, lofted diamond wings with blunt tips, a cut dorsal
canopy well (glass in the tub, no roof plate), a dorsal radiator cassette, and
a single dorsal-aft drive throat with vanes receding in the bore. No seats.
Hitch/Kestrel are never loaded.

Does not rescale the root — live sockets already sit in the ~10.8 m authored
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
from mathutils import Matrix, Vector

REVISION = "chase_form_v16"
ROOT_DIR = Path(__file__).resolve().parents[2]
FAMILY = ROOT_DIR / "assets" / "ships" / "fleet_player_bodies_v1" / "hornet"
LIVE_PARTS = ROOT_DIR / "assets" / "ships" / "parts" / "wholeships"

KEEP_SEPARATE = (
    "LOD0_Wing_Port",
    "LOD0_Wing_Stbd",
    "LOD0_Flap_",
    "LOD0_Canard_",
    "LOD0_Glass",
    "LOD0_Bell",
)

# Distinct color blocks that read at ~15% frame width. No 512-map density trap.
HONEST = {
    "Material_Hull": {"color": (0.26, 0.28, 0.31), "metallic": 0.10, "roughness": 0.40, "role": "hull"},
    "Material_Armor": {"color": (0.13, 0.145, 0.17), "metallic": 0.18, "roughness": 0.50, "role": "armor"},
    "Material_Canopy": {"color": (0.012, 0.016, 0.022), "metallic": 0.0, "roughness": 0.06, "role": "glass"},
    "Material_Ceramic": {"color": (0.28, 0.18, 0.10), "metallic": 0.0, "roughness": 0.62, "role": "ceramic"},
    "Material_Mechanical": {"color": (0.04, 0.042, 0.048), "metallic": 0.38, "roughness": 0.50, "role": "mechanical"},
    "Material_Radiator": {"color": (0.11, 0.05, 0.03), "metallic": 0.22, "roughness": 0.48, "role": "radiator"},
    "Material_Thruster": {"color": (0.025, 0.026, 0.03), "metallic": 0.30, "roughness": 0.48, "role": "thruster"},
    "Material_Accent": {"color": (0.74, 0.24, 0.06), "metallic": 0.02, "roughness": 0.38, "role": "accent"},
    "Material_Warning": {"color": (0.78, 0.62, 0.10), "metallic": 0.02, "roughness": 0.42, "role": "warning"},
    # Unmirrored teal island — unique albedo at D=144, not a map dump.
    "Material_Marking": {"color": (0.07, 0.28, 0.24), "metallic": 0.04, "roughness": 0.40, "role": "marking"},
}


def parse_args(argv):
    parser = argparse.ArgumentParser()
    parser.add_argument("--source-lod0", type=Path, default=LIVE_PARTS / "hornet_production_v1.glb")
    parser.add_argument("--source-lod1", type=Path, default=LIVE_PARTS / "hornet_production_v1_lod1.glb")
    parser.add_argument("--source-lod2", type=Path, default=LIVE_PARTS / "hornet_production_v1_lod2.glb")
    parser.add_argument("--out-dir", type=Path, default=FAMILY / "source" / "wholeships")
    parser.add_argument("--lods", default="0,1,2")
    parser.add_argument("--promote", action="store_true")
    return parser.parse_args(argv)


def find_root():
    named = bpy.data.objects.get("HORNET_LOD0_ROOT")
    if named:
        return named
    matches = [
        obj for obj in bpy.data.objects
        if obj.type == "EMPTY" and "HORNET" in obj.name.upper() and "ROOT" in obj.name.upper()
    ]
    if len(matches) == 1:
        return matches[0]
    raise RuntimeError("missing Hornet root")


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
            (sx - 2 * wall, sy - 2 * wall, 0.035),
            (x, y, z - sz * 0.5 + 0.02),
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
    """Fat service hose as a lofted tube with end fittings — not a long box."""
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
        bmesh.ops.inset_region(bm, faces=faces, thickness=0.048, depth=-0.038, use_boundary=True)
    bm.to_mesh(mesh)
    bm.free()
    mesh.update()
    return hull


def build_hull(mats):
    hull_mat = mats["Material_Hull"]
    armor = mats["Material_Armor"]
    # x, hw, hh, zc, keel, flat, box — canopy tall, mid wide, waist pinched, transom boxy.
    stations = [
        (5.42, 0.09, 0.07, 0.10, 0.04, 0.05, 0.04),
        (4.32, 0.28, 0.20, 0.15, 0.07, 0.14, 0.08),
        (3.12, 0.50, 0.86, 0.46, 0.10, 0.28, 0.10),  # canopy crown, not a table
        (1.32, 1.08, 0.44, 0.18, 0.12, 0.20, 0.10),  # wing-root beam
        (-0.55, 0.50, 0.24, 0.14, 0.10, 0.08, 0.08),  # waist pinch
        (-2.15, 0.70, 0.38, 0.20, 0.12, 0.12, 0.22),  # radiator house
        (-3.45, 0.80, 0.48, 0.20, 0.12, 0.12, 0.28),  # drive house
        (-5.18, 0.40, 0.22, 0.10, 0.06, 0.06, 0.18),  # tapered transom, not a brick
    ]
    rings = [chine_ring(x, hw, hh, zc, keel, 0.0, flat, box) for x, hw, hh, zc, keel, flat, box in stations]
    hull = loft_rings("LOD0_Hull", rings, hull_mat, 0.012)
    inset_dorsal_seams(hull)
    cheeks = []
    for sign, tag in ((-1.0, "Port"), (1.0, "Stbd")):
        plate = loft_rings(
            f"LOD0_ArmorCheek_{tag}",
            [
                chine_ring(2.35, 0.24, 0.17, 0.24, 0.02, 0.58 * sign, 0.10, 0.22),
                chine_ring(0.70, 0.30, 0.15, 0.20, 0.02, 1.05 * sign, 0.08, 0.16),
                chine_ring(-1.20, 0.22, 0.13, 0.18, 0.02, 0.74 * sign, 0.08, 0.14),
            ],
            armor, 0.006, cap=True,
        )
        cheeks.append(plate)
    return hull, cheeks


def build_wings(mats, lod):
    hull_mat = mats["Material_Hull"]
    armor = mats["Material_Armor"]
    mech = mats["Material_Mechanical"]
    accent = mats["Material_Accent"]
    wings = []
    for sign, tag in ((1.0, "Stbd"), (-1.0, "Port")):
        # Cranked planform, blunt TE, outer stations stay thick so D=144 is a slab not a card.
        rings = [
            airfoil(1.92, 0.88 * sign, 0.16, 3.72, 1.14),
            airfoil(1.22, 1.40 * sign, 0.20, 3.10, 0.82),
            airfoil(0.28, 2.02 * sign, 0.26, 2.42, 0.56),
            airfoil(-0.42, 2.68 * sign, 0.28, 1.62, 0.40),
            airfoil(-0.88, 3.36 * sign, 0.26, 1.08, 0.32),
        ]
        wing = loft_rings(f"LOD0_Wing_{tag}", rings, hull_mat, 0.014)

        def slot_cut(name=f"FlapSlotCut_{tag}", loc=(-0.72, 1.82 * sign, 0.18)):
            return add_box(name, (0.42, 1.55, 0.46), loc, mech, 0.0)

        if lod <= 1:
            cut(wing, slot_cut)

        def panel_cut(name=f"WingPanelCut_{tag}", loc=(0.35, 1.95 * sign, 0.48)):
            return add_box(name, (1.85, 0.08, 0.22), loc, mech, 0.0)

        if lod <= 1:
            cut(wing, panel_cut)
        strake = loft_rings(
            f"LOD0_WingStrake_{tag}",
            [
                airfoil(2.02, 0.68 * sign, 0.12, 2.95, 0.78),
                airfoil(1.92, 0.88 * sign, 0.16, 3.72, 1.14),
            ],
            hull_mat, 0.012,
        )
        dogtooth = loft_rings(
            f"LOD0_WingTooth_{tag}",
            [
                airfoil(0.72, 1.78 * sign, 0.40, 1.12, 0.30),
                airfoil(0.22, 2.08 * sign, 0.30, 0.78, 0.20),
            ],
            armor, 0.004,
        )
        armor_pad = loft_rings(
            f"LOD0_WingArmor_{tag}",
            [
                airfoil(0.18, 2.00 * sign, 0.44, 1.72, 0.18),
                airfoil(-0.38, 2.64 * sign, 0.40, 1.18, 0.14),
                airfoil(-0.78, 3.24 * sign, 0.36, 0.72, 0.12),
            ],
            armor, 0.003,
        )
        fence = add_box(
            f"LOD0_WingFence_{tag}",
            (0.78, 0.058, 0.46),
            (-0.72, 3.38 * sign, 0.34),
            armor, 0.002,
        )
        te_bar = add_box(
            f"LOD0_WingTE_{tag}",
            (0.12, 1.28, 0.18),
            (-1.12, 2.52 * sign, 0.24),
            armor, 0.002,
        )
        wings.extend([wing, strake, dogtooth, armor_pad, fence, te_bar])
        if lod == 0:
            flap = loft_rings(
                f"LOD0_Flap_{tag}",
                [
                    airfoil(-0.62, 1.72 * sign, 0.12, 0.68, 0.14),
                    airfoil(-0.98, 2.14 * sign, 0.16, 0.40, 0.08),
                ],
                armor, 0.006,
            )
            stripe = loft_rings(
                f"LOD0_Accent_{tag}",
                [
                    airfoil(1.94, 1.02 * sign, 0.42, 0.72, 0.07),
                    airfoil(0.92, 1.88 * sign, 0.38, 0.44, 0.05),
                    airfoil(-0.02, 2.58 * sign, 0.32, 0.26, 0.04),
                ],
                accent, 0.002,
            )
            wings.extend([flap, stripe])
    canard_p = loft_rings(
        "LOD0_Canard_Port",
        [
            airfoil(4.62, -0.32, 0.10, 1.05, 0.22),
            airfoil(4.12, -1.08, 0.12, 0.58, 0.12),
        ],
        hull_mat, 0.006,
    )
    canard_s = loft_rings(
        "LOD0_Canard_Stbd",
        [
            airfoil(4.62, 0.32, 0.10, 1.05, 0.22),
            airfoil(4.12, 1.08, 0.12, 0.58, 0.12),
        ],
        hull_mat, 0.006,
    )
    wings.extend([canard_p, canard_s])
    return wings


def build_canopy(hull, mats, lod):
    hull_mat = mats["Material_Hull"]
    armor = mats["Material_Armor"]
    mech = mats["Material_Mechanical"]
    glass = mats["Material_Canopy"]
    report = {}

    def tub():
        # Eat the rounded crown so the chase camera looks into a well, not at a roof plate.
        return add_box("VisorTubCut", (1.88, 0.86, 1.22), (3.18, 0.0, 0.88), hull_mat, 0.0)

    report["tub"] = cut(hull, tub)

    def windshield():
        # Narrower, raked forward bite so the well is a cockpit, not a postage stamp.
        return add_box(
            "VisorWindshieldCut",
            (0.95, 0.52, 0.95),
            (3.82, 0.0, 0.98),
            hull_mat,
            0.0,
            rotation=(0.0, math.radians(-22.0), 0.0),
        )

    report["windshield"] = cut(hull, windshield)
    bits = add_open_well("LOD0_Tub", (1.62, 0.72, 0.78), (3.22, 0.0, 0.48), mech, floor=True, open_aft=False)
    # Dark lips around the well — a framed greenhouse, not a hull-colored roof plate.
    bits.append(add_box("LOD0_VisorRail_Port", (1.70, 0.040, 0.09), (3.22, -0.40, 1.14), armor, 0.001))
    bits.append(add_box("LOD0_VisorRail_Stbd", (1.70, 0.040, 0.09), (3.22, 0.40, 1.14), armor, 0.001))
    bits.append(add_box("LOD0_VisorBrow", (0.20, 0.72, 0.09), (4.02, 0.0, 1.16), armor, 0.001, rotation=(0.0, math.radians(-18.0), 0.0)))
    bits.append(add_box("LOD0_VisorSill", (0.20, 0.72, 0.08), (2.40, 0.0, 1.12), armor, 0.001))
    report["coaming"] = False
    if lod <= 1:
        # Thick dark glass mass in the well, near the rim, so D=144 sees a greenhouse.
        pane = add_box(
            "LOD0_Glass",
            (1.48, 0.62, 0.14),
            (3.22, 0.0, 0.92),
            glass,
            0.0,
            rotation=(0.0, math.radians(-12.0), 0.0),
        )
        bits.append(pane)
    return bits, report


def build_drive(hull, mats, lod):
    """Dorsal-aft well whose mouth faces the 60° chase camera. No floor liner in the throat."""
    hull_mat = mats["Material_Hull"]
    mech = mats["Material_Mechanical"]
    ceramic = mats["Material_Ceramic"]
    thruster = mats["Material_Thruster"]
    bits = []

    def well():
        return add_box("DriveWell", (2.15, 1.22, 1.15), (-4.42, 0.0, 0.48), hull_mat, 0.0)

    ok = cut(hull, well)
    axis = Vector((-0.38, 0.0, 0.925)).normalized()
    mouth = Vector((-4.42, 0.0, 0.36))

    def bore():
        bpy.ops.mesh.primitive_cylinder_add(radius=0.52, depth=1.55, vertices=16, location=(0.0, 0.0, 0.0))
        obj = bpy.context.object
        obj.name = "DriveBoreCut"
        obj.rotation_euler = axis.to_track_quat("Z", "Y").to_euler()
        obj.location = tuple(mouth)
        apply_object(obj)
        return finish_mesh(obj, hull_mat, 0.0)

    ok_bore = cut(hull, bore)
    # Thin walls only — open top, open transom. No dorsal washer plate.
    bits.extend(add_open_well(
        "LOD0_Drive", (1.55, 0.78, 0.52), (-4.22, 0.0, 0.12), mech,
        floor=False, open_aft=True, wall=0.045,
    ))

    orient = axis.to_track_quat("Z", "Y").to_matrix()
    rings = []
    for depth, radius in ((-1.08, 0.07), (-0.76, 0.11), (-0.46, 0.22), (-0.22, 0.32), (-0.04, 0.36)):
        rings.append(circle_ring(mouth + axis * depth, axis, radius, 12))
    bell = loft_rings("LOD0_Bell", rings, thruster, 0.006, cap=False)
    bits.append(bell)
    hub = loft_rings(
        "LOD0_Hub",
        [
            circle_ring(mouth + axis * -0.72, axis, 0.08, 10),
            circle_ring(mouth + axis * -0.50, axis, 0.10, 10),
        ],
        thruster, 0.003, cap=True,
    )
    bits.append(hub)
    if lod <= 1:
        # Heat ring lives inside the bore, not as a gold collar on the mouth.
        heat = loft_rings(
            "LOD0_HeatRing",
            [
                circle_ring(mouth + axis * -0.56, axis, 0.20, 12),
                circle_ring(mouth + axis * -0.48, axis, 0.18, 12),
            ],
            ceramic, 0.002, cap=False,
        )
        bits.append(heat)
    vane_count = 6 if lod == 0 else 4 if lod == 1 else 0
    for index in range(vane_count):
        angle = index * math.tau / max(vane_count, 1)
        local = Vector((0.15 * math.cos(angle), 0.15 * math.sin(angle), -0.42))
        world = mouth + (orient @ local)
        rot = (orient @ Matrix.Rotation(angle, 3, "Z")).to_euler()
        vane = add_box(
            f"LOD0_Vane_{index}",
            (0.046, 0.016, 0.50),
            tuple(world),
            thruster, 0.0,
            rotation=(rot.x, rot.y, rot.z),
        )
        bits.append(vane)
    return bits, {"dorsal": ok, "aft": ok_bore}


def build_radiators(hull, mats, lod):
    rad = mats["Material_Radiator"]
    mech = mats["Material_Mechanical"]
    hull_mat = mats["Material_Hull"]
    bits = []
    report = {}

    def dorsal():
        return add_box("RadiatorDorsalCut", (1.72, 0.82, 0.72), (-2.08, 0.0, 0.52), hull_mat, 0.0)

    report["dorsal"] = cut(hull, dorsal)
    bits.extend(add_open_well("LOD0_RadDorsal", (1.48, 0.68, 0.48), (-2.08, 0.0, 0.22), mech, floor=True, open_aft=False))
    # No hull-colored picture-frame rim. Fins live in the well so D=144 sees a dark cassette.
    dorsal_fins = 9 if lod == 0 else 5 if lod == 1 else 0
    for index in range(dorsal_fins):
        bits.append(add_box(
            f"LOD0_RadiatorFin_Dorsal_{index}",
            (0.055, 0.50, 0.22),
            (-2.62 + index * 0.135, 0.0, 0.08),
            rad, 0.001,
        ))
    if lod <= 1:
        bits.append(add_box("LOD0_RadiatorHeader_Dorsal", (1.38, 0.05, 0.05), (-2.08, 0.24, 0.16), rad, 0.001))

    for sign, tag in ((-1.0, "Port"), (1.0, "Stbd")):
        wing = next((obj for obj in bpy.data.objects if obj.name == f"LOD0_Wing_{tag}"), None)
        if wing is None:
            report[tag] = False
            continue

        def well(name=f"RadiatorCut_{tag}", loc=(0.18, 1.38 * sign, 0.40)):
            return add_box(name, (1.62, 0.82, 0.52), loc, rad, 0.0)

        report[tag] = cut(wing, well)
        bits.extend(add_open_well(
            f"LOD0_Rad_{tag}", (1.38, 0.68, 0.32), (0.18, 1.38 * sign, 0.18), mech,
            floor=True, open_aft=False,
        ))
        count = 8 if lod == 0 else 4 if lod == 1 else 0
        for index in range(count):
            bits.append(add_box(
                f"LOD0_RadiatorFin_{tag}_{index}",
                (0.08, 0.54, 0.16),
                (-0.38 + index * 0.145, 1.38 * sign, 0.12),
                rad, 0.001,
            ))
    return bits, report


def build_guns_and_sensor(mats, lod):
    mech = mats["Material_Mechanical"]
    armor = mats["Material_Armor"]
    bits = []
    if lod > 1:
        return bits
    for sign, tag in ((-1.0, "Port"), (1.0, "Stbd")):
        barrel = add_box(f"LOD0_Gun_{tag}", (0.85, 0.09, 0.09), (5.05, 0.22 * sign, 0.12), mech, 0.003)
        bits.append(barrel)
        if lod == 0:
            def bore(name=f"GunBore_{tag}", loc=(5.20, 0.22 * sign, 0.12)):
                return add_box(name, (0.40, 0.045, 0.045), loc, mech, 0.0)

            cut(barrel, bore)
    if lod == 0:
        dish = loft_rings(
            "LOD0_SensorDish",
            [
                [(0.55, 0.16 * math.cos(a), 0.92 + 0.04 * math.sin(a)) for a in [i * math.tau / 10 for i in range(10)]],
                [(0.55, 0.22 * math.cos(a), 0.98 + 0.02 * math.sin(a)) for a in [i * math.tau / 10 for i in range(10)]],
            ],
            armor, 0.003, cap=True,
        )
        pedestal = add_box("LOD0_SensorPedestal", (0.08, 0.08, 0.16), (0.55, 0.0, 0.82), mech, 0.002)
        bits.extend([dish, pedestal])
    return bits


def build_hardware(mats, lod):
    """Chase-scale unique albedo, dirt, stencil, and hardware. No maps, no seats."""
    hull_mat = mats["Material_Hull"]
    armor = mats["Material_Armor"]
    mech = mats["Material_Mechanical"]
    ceramic = mats["Material_Ceramic"]
    warning = mats["Material_Warning"]
    accent = mats["Material_Accent"]
    marking = mats["Material_Marking"]
    bits = []

    # Unmirrored port repair — 0.9 m plate so D=144 sees a patch, not a rivet.
    bits.append(add_box("LOD0_RepairPatch", (0.92, 0.50, 0.07), (1.42, -0.98, 0.42), armor, 0.002))
    bits.append(add_box("LOD0_RepairWeld", (0.92, 0.05, 0.09), (1.42, -0.74, 0.46), mech, 0.0))

    # Port-wing ochre ID bars (stencil language without a texture dump).
    for index, x in enumerate((0.22, -0.08, -0.38)):
        bits.append(add_box(
            f"LOD0_StencilBar_{index}",
            (0.16, 0.78, 0.06),
            (x, -2.72, 0.54),
            warning, 0.0,
        ))

    # Starboard teal ID plate — unique albedo island, not mirrored.
    bits.append(add_box("LOD0_MarkingPlate", (0.70, 0.26, 0.07), (0.72, 0.48, 0.72), marking, 0.001))

    if lod > 1:
        return bits

    # Offset dorsal hatch + hinge (starboard of spine, not a centered lid).
    bits.append(add_box("LOD0_HatchLid", (0.68, 0.50, 0.10), (1.05, 0.18, 0.78), armor, 0.002))
    bits.append(add_box("LOD0_HatchHinge", (0.10, 0.50, 0.12), (1.42, 0.18, 0.80), mech, 0.0))

    # Spine cable tray sits ON the dorsal skin so D=144 can count a dark line.
    bits.append(add_box("LOD0_CableTray", (2.55, 0.14, 0.12), (0.40, 0.12, 0.74), mech, 0.001))
    bits.append(add_box("LOD0_CableClamp_Fore", (0.12, 0.20, 0.16), (1.48, 0.12, 0.80), armor, 0.0))
    bits.append(add_box("LOD0_CableClamp_Aft", (0.12, 0.20, 0.16), (-0.62, 0.12, 0.80), armor, 0.0))

    # Ceramic heat / soot around the drive — dirt that reads at chase distance.
    bits.append(add_box("LOD0_HeatPlate_Port", (0.78, 0.30, 0.09), (-4.05, -0.58, 0.52), ceramic, 0.001))
    bits.append(add_box("LOD0_HeatPlate_Stbd", (0.78, 0.30, 0.09), (-4.05, 0.58, 0.52), ceramic, 0.001))
    bits.append(add_box("LOD0_SootApron", (0.90, 0.62, 0.07), (-4.95, 0.0, 0.08), ceramic, 0.001))

    # Four RCS blocks with dark cups — hardware density, not skin stickers.
    rcs = (
        ("ForePort", (4.38, -0.32, 0.22), (0.22, 0.16, 0.16)),
        ("ForeStbd", (4.38, 0.32, 0.22), (0.22, 0.16, 0.16)),
        ("AftPort", (-4.78, -0.38, 0.18), (0.24, 0.18, 0.16)),
        ("AftStbd", (-4.78, 0.38, 0.18), (0.24, 0.18, 0.16)),
    )
    for tag, loc, dim in rcs:
        bits.append(add_box(f"LOD0_RCS_{tag}", dim, loc, mech, 0.002))
        cup_loc = (loc[0] + (0.10 if "Fore" in tag else -0.10), loc[1], loc[2])
        bits.append(add_cylinder(
            f"LOD0_RCSCup_{tag}", 0.055, 0.08, cup_loc, hull_mat, 0.0,
            rotation=(0.0, math.radians(90.0), 0.0), vertices=8,
        ))

    # Service hose rides the dorsal skin radiator → drive, not buried in the loft.
    bits.extend(add_hose(
        "LOD0_Hose_RadDrive",
        [(-2.55, 0.38, 0.72), (-3.05, 0.46, 0.78), (-3.55, 0.44, 0.74), (-4.00, 0.38, 0.62)],
        0.085,
        mech,
    ))

    if lod != 0:
        return bits

    antenna = add_box("LOD0_AntennaMast", (0.10, 0.10, 0.62), (2.42, 0.20, 1.28), mech, 0.0)
    bits.append(antenna)
    bits.append(add_cylinder("LOD0_AntennaTip", 0.07, 0.12, (2.42, 0.20, 1.62), armor, 0.0, vertices=8))
    bits.append(add_box("LOD0_Nav_Port", (0.14, 0.14, 0.10), (-0.72, -3.38, 0.58), warning, 0.0))
    bits.append(add_box("LOD0_Nav_Stbd", (0.14, 0.14, 0.10), (-0.72, 3.38, 0.58), accent, 0.0))
    return bits


def shade_objects(objs):
    hard = ("Hull", "Wing", "Canard", "Coaming", "Flap", "Armor", "Accent", "Gun",
            "Repair", "Stencil", "Hatch", "Cable", "RCS", "Nav", "Hose", "Marking", "Heat", "Soot")
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
    hull, courses = build_hull(mats)
    wings = build_wings(mats, lod)
    canopy_bits, canopy_report = build_canopy(hull, mats, lod)
    drive_bits, drive_report = build_drive(hull, mats, lod)
    rad_bits, rad_report = build_radiators(hull, mats, lod)
    extra = build_guns_and_sensor(mats, lod)
    hardware = build_hardware(mats, lod)

    built = [hull, *courses, *wings, *canopy_bits, *drive_bits, *rad_bits, *extra, *hardware]
    for obj in built:
        if obj and obj.name in bpy.data.objects:
            parent_keep_world(obj, root)

    join_into(hull, courses)
    hull_bits = [
        obj for obj in bpy.data.objects
        if obj.type == "MESH" and obj.data.materials and obj.data.materials[0] == mats["Material_Hull"]
        and obj != hull and not is_collision(obj) and not keep_separate(obj)
    ]
    join_into(hull, hull_bits)
    for material in (
        mats["Material_Ceramic"], mats["Material_Radiator"], mats["Material_Thruster"],
        mats["Material_Mechanical"], mats["Material_Accent"], mats["Material_Canopy"],
        mats["Material_Armor"], mats["Material_Warning"], mats["Material_Marking"],
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
    if size.x < 9.5 or size.x > 13.5 or size.y < 4.4 or size.z > 2.8:
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
        "asset": "ship_hornet",
        "revision": REVISION,
        "lod": lod,
        "source": str(source),
        "output": str(output),
        "canopy": canopy_report,
        "drive": drive_report,
        "radiator": rad_report,
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
        out_dir / "hornet_production_v1_lod0.glb": LIVE_PARTS / "hornet_production_v1.glb",
        out_dir / "hornet_production_v1_lod1.glb": LIVE_PARTS / "hornet_production_v1_lod1.glb",
        out_dir / "hornet_production_v1_lod2.glb": LIVE_PARTS / "hornet_production_v1_lod2.glb",
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
        output = out_dir / f"hornet_production_v1_lod{lod}.glb"
        reports.append(build_one(source, output, lod))
    promoted = promote_live(out_dir) if args.promote else []
    summary = {"ok": True, "revision": REVISION, "lods": reports, "promoted": promoted}
    (out_dir / "hornet_chase_form_v16.summary.json").write_text(json.dumps(summary, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(summary))


if __name__ == "__main__":
    main()

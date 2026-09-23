"""Bastion chase-camera outbox form rebuild (player corvette).

Imports live Bastion only for root, sockets, and collision. Replaces render
meshes with one continuous formed corvette shell that reads at the live chase
camera. Navy-grey, command tower, broadside casemates, twin war drives.
Cockpit / side / tower wells are holes with rims. No tube/paddle lobes, no
open cage. Hitch/Kestrel compare-only. Hornet/Drifter/Ranger/Ironback frozen —
do not rebuild.

Gates aimed: TUBE_PADDLE NO, CAGE_READ NO, wells HOLES.
Does not rescale the root — live sockets already sit in authored meters.
Runtime display scale is applied by the chase still helper, not here.
"""
from __future__ import annotations

import argparse
import json
import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector

REVISION = "chase_form_v1"
ROOT_DIR = Path(__file__).resolve().parents[4]
LIVE_PARTS = ROOT_DIR / "assets" / "ships" / "parts" / "wholeships"

KEEP_SEPARATE = (
    "LOD0_Glass",
    "LOD0_Bell_",
    "LOD0_Canopy",
)

# Navy-grey warship — darker armor, teal accent, mid-heavy like Hitch.
HONEST = {
    "Material_Hull": {"color": (0.16, 0.18, 0.22), "metallic": 0.12, "roughness": 0.46},
    "Material_Armor": {"color": (0.055, 0.070, 0.080), "metallic": 0.28, "roughness": 0.52},
    "Material_Course": {"color": (0.12, 0.14, 0.17), "metallic": 0.16, "roughness": 0.48},
    "Material_Mark": {"color": (0.08, 0.34, 0.36), "metallic": 0.08, "roughness": 0.36},
    "Material_Canopy": {"color": (0.04, 0.12, 0.14), "metallic": 0.0, "roughness": 0.06},
    "Material_Ceramic": {"color": (0.42, 0.36, 0.28), "metallic": 0.04, "roughness": 0.64},
    "Material_Mechanical": {"color": (0.22, 0.23, 0.24), "metallic": 0.55, "roughness": 0.36},
    "Material_Radiator": {"color": (0.10, 0.08, 0.07), "metallic": 0.30, "roughness": 0.58},
    "Material_Thruster": {"color": (0.02, 0.06, 0.09), "metallic": 0.20, "roughness": 0.28},
    "Material_Accent": {"color": (0.06, 0.38, 0.40), "metallic": 0.06, "roughness": 0.30, "emit": 2.4},
    "Material_Warning": {"color": (0.72, 0.34, 0.06), "metallic": 0.04, "roughness": 0.38, "emit": 1.8},
    "Material_Dirt": {"color": (0.045, 0.040, 0.038), "metallic": 0.02, "roughness": 0.82},
}

GIRTH_XS = (6.40, 3.60, 0.80, -2.00, -4.80)
MARK_XS = (5.20, -1.40)
STRINGER_YS = (0.55, 1.05)
STRINGER_SPANS = ((7.20, 4.40), (3.20, 0.40), (-0.60, -3.40), (-4.00, -6.80))

# Corvette stations: (x, beam, hh, zc, keel, flat, box, chine)
# Knife bow → canopy shoulder → casemate waist → tower → twin-drive transom.
HULL_STATIONS = [
    (9.20, 0.28, 0.22, 0.08, 0.08, 0.10, 0.12, 0.18),
    (8.40, 0.55, 0.38, 0.14, 0.10, 0.22, 0.18, 0.24),
    (7.20, 0.92, 0.58, 0.20, 0.12, 0.40, 0.28, 0.30),
    (5.60, 1.28, 0.78, 0.24, 0.13, 0.72, 0.42, 0.36),
    (4.20, 1.48, 0.92, 0.22, 0.13, 0.88, 0.55, 0.40),
    (2.40, 1.72, 0.78, 0.16, 0.12, 0.42, 0.72, 0.42),
    (0.60, 1.95, 0.88, 0.14, 0.11, 0.35, 0.86, 0.44),
    (-1.20, 1.88, 1.05, 0.18, 0.11, 0.38, 0.90, 0.40),
    (-2.80, 1.72, 1.12, 0.20, 0.10, 0.40, 0.94, 0.36),
    (-4.60, 1.42, 0.95, 0.16, 0.09, 0.36, 0.95, 0.30),
    (-6.40, 1.18, 0.78, 0.14, 0.08, 0.32, 0.94, 0.24),
    (-7.80, 0.92, 0.62, 0.12, 0.07, 0.30, 0.92, 0.20),
    (-8.90, 0.55, 0.42, 0.10, 0.06, 0.28, 0.90, 0.16),
]


def parse_args(argv):
    parser = argparse.ArgumentParser()
    parser.add_argument("--source-lod0", type=Path, default=LIVE_PARTS / "bastion_production_v1.glb")
    parser.add_argument("--source-lod1", type=Path, default=LIVE_PARTS / "bastion_production_v1_lod1.glb")
    parser.add_argument("--source-lod2", type=Path, default=LIVE_PARTS / "bastion_production_v1_lod2.glb")
    parser.add_argument("--out-dir", type=Path, default=Path(__file__).resolve().parent)
    parser.add_argument("--lods", default="0,1,2")
    return parser.parse_args(argv)


def find_root():
    for name in ("BASTION_LOD0_ROOT", "BASTION_LOD1_ROOT", "BASTION_LOD2_ROOT"):
        named = bpy.data.objects.get(name)
        if named:
            return named
    matches = [
        obj for obj in bpy.data.objects
        if obj.type == "EMPTY" and "BASTION" in obj.name.upper() and "ROOT" in obj.name.upper()
    ]
    if len(matches) == 1:
        return matches[0]
    # Fallback: any ROOT empty after import
    matches = [
        obj for obj in bpy.data.objects
        if obj.type == "EMPTY" and "ROOT" in obj.name.upper()
    ]
    if len(matches) == 1:
        return matches[0]
    raise RuntimeError("missing Bastion root")


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
    x, beam, hh, zc, keel, flat, box, _chine = st
    flat = max(0.0, min(1.0, float(flat)))
    box = max(0.0, min(1.0, float(box)))
    beam = max(0.22, float(beam))
    crown = zc + hh * (0.90 - 0.04 * flat)
    keel_z = zc - hh - keel * (1.0 - 0.14 * box)
    beam_z = zc + hh * (0.22 + 0.28 * flat - 0.08 * box)

    def half(sign):
        return [
            (x, sign * beam * (0.32 + 0.22 * flat), crown - hh * 0.02),
            (x, sign * beam * (0.68 + 0.18 * flat), crown - hh * 0.08),
            (x, sign * beam * (0.92 + 0.04 * flat), zc + hh * 0.38),
            (x, sign * beam, beam_z),
            (x, sign * beam * (0.94 - 0.04 * box), zc + hh * 0.04),
            (x, sign * beam * (0.80 - 0.08 * box), zc - hh * 0.24),
            (x, sign * beam * (0.55 - 0.10 * box), zc - hh * 0.52),
            (x, sign * beam * (0.30 - 0.06 * box), zc - hh * 0.78),
            (x, sign * beam * 0.12, keel_z),
        ]

    pts = half(1.0)
    for a, b in zip(pts, pts[1:]):
        if abs(a[1] - b[1]) < 0.05 and abs(a[2] - b[2]) > 0.28:
            raise RuntimeError(
                f"vertical slab in YZ at x={a[0]:.2f} dy={abs(a[1]-b[1]):.3f} dz={abs(a[2]-b[2]):.3f}"
            )
    return [(x, 0.0, crown)] + pts + [(x, 0.0, keel_z + keel * 0.08)] + list(reversed(half(-1.0)))


def add_box(name, dimensions, location, material, bevel=0.006, rotation=(0.0, 0.0, 0.0)):
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=location, rotation=rotation)
    obj = bpy.context.active_object
    obj.name = name
    obj.scale = dimensions
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    return finish_mesh(obj, material, bevel)


def add_cylinder(name, radius, depth, location, material, bevel=0.0,
                 rotation=(0.0, math.radians(90), 0.0), vertices=12):
    bpy.ops.mesh.primitive_cylinder_add(
        radius=radius, depth=depth, location=location, rotation=rotation, vertices=vertices,
    )
    obj = bpy.context.active_object
    obj.name = name
    return finish_mesh(obj, material, bevel)


def boolean_difference(target, cutter, solver="FAST"):
    mod = target.modifiers.new("Cut", "BOOLEAN")
    mod.operation = "DIFFERENCE"
    mod.solver = solver
    mod.object = cutter
    bpy.context.view_layer.objects.active = target
    target.select_set(True)
    try:
        bpy.ops.object.modifier_apply(modifier=mod.name)
        ok = True
    except Exception:
        if mod.name in target.modifiers:
            target.modifiers.remove(mod)
        ok = False
    target.select_set(False)
    bpy.data.objects.remove(cutter, do_unlink=True)
    return ok


def cut(target, maker):
    cutter = maker()
    if boolean_difference(target, cutter, solver="FAST"):
        return True
    cutter = maker()
    return boolean_difference(target, cutter, solver="EXACT")


def add_open_well(name, size, location, material, *, floor=True, open_aft=False, wall=0.050):
    sx, sy, sz = size
    x, y, z = location
    bits = []
    if floor:
        bits.append(add_box(
            f"{name}_Floor",
            (sx - 2 * wall, sy - 2 * wall, 0.045),
            (x, y, z - sz * 0.5 + 0.024),
            material, 0.0,
        ))
    bits.append(add_box(f"{name}_Port", (sx, wall, sz * 0.82), (x, y - sy * 0.5 + wall * 0.5, z - 0.04), material, 0.0))
    bits.append(add_box(f"{name}_Stbd", (sx, wall, sz * 0.82), (x, y + sy * 0.5 - wall * 0.5, z - 0.04), material, 0.0))
    bits.append(add_box(f"{name}_Fore", (wall, sy - 2 * wall, sz * 0.82), (x + sx * 0.5 - wall * 0.5, y, z - 0.04), material, 0.0))
    if not open_aft:
        bits.append(add_box(f"{name}_Aft", (wall, sy - 2 * wall, sz * 0.82), (x - sx * 0.5 + wall * 0.5, y, z - 0.04), material, 0.0))
    return bits


def make_materials():
    mats = {}
    for name, spec in HONEST.items():
        mat = bpy.data.materials.new(name)
        mat.use_nodes = True
        nodes = mat.node_tree.nodes
        links = mat.node_tree.links
        nodes.clear()
        out = nodes.new("ShaderNodeOutputMaterial")
        bsdf = nodes.new("ShaderNodeBsdfPrincipled")
        bsdf.inputs["Base Color"].default_value = (*spec["color"], 1.0)
        bsdf.inputs["Metallic"].default_value = spec["metallic"]
        bsdf.inputs["Roughness"].default_value = spec["roughness"]
        if "emit" in spec:
            bsdf.inputs["Emission Color"].default_value = (*spec["color"], 1.0)
            bsdf.inputs["Emission Strength"].default_value = spec["emit"]
        links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])
        mats[name] = mat
    return mats


def delete_render_meshes():
    for obj in list(bpy.data.objects):
        if obj.type != "MESH":
            continue
        if is_collision(obj):
            continue
        bpy.data.objects.remove(obj, do_unlink=True)


def densify_stations(stations, mids=16):
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


def dorsal_blocked(x, y):
    # cockpit well
    if abs(x - 4.10) < 0.85 and abs(y) < 0.55:
        return True
    # tower well / carapace
    if abs(x + 2.40) < 0.85 and abs(y) < 0.55:
        return True
    return False


def paint_shell(hull, mats):
    mesh = hull.data
    mesh.materials.clear()
    mesh.materials.append(mats["Material_Hull"])
    mesh.materials.append(mats["Material_Armor"])
    mesh.materials.append(mats["Material_Course"])
    mesh.materials.append(mats["Material_Mark"])
    mesh.materials.append(mats["Material_Dirt"])
    for poly in mesh.polygons:
        verts = [mesh.vertices[index].co for index in poly.vertices]
        centroid = sum(verts, Vector()) / max(len(verts), 1)
        beam, hh, zc = hull_half_at(centroid.x)
        on_girth = any(abs(centroid.x - gx) < 0.22 for gx in GIRTH_XS)
        on_mark = any(abs(centroid.x - mx) < 0.30 for mx in MARK_XS)
        island = (int(abs(centroid.x) * 2.0) + int(centroid.z * 3.5)) % 8 == 0
        bow_cap = centroid.x > 7.60
        armor_belt = abs(centroid.z - zc) < hh * 0.22 and abs(centroid.y) > beam * 0.42
        waist_course = 1.60 < centroid.x < 4.60 and centroid.z > zc + hh * 0.08
        if bow_cap or centroid.z < zc - hh * 0.30 or armor_belt:
            poly.material_index = 1
        elif on_girth or waist_course:
            poly.material_index = 2
        elif on_mark:
            poly.material_index = 3
        elif island and centroid.z > zc - hh * 0.04:
            poly.material_index = 4
        else:
            poly.material_index = 0


def build_hull(mats):
    hull_mat = mats["Material_Hull"]
    armor = mats["Material_Armor"]
    rings = [shell_ring(st) for st in densify_stations(HULL_STATIONS)]
    hull = loft_rings("LOD0_Hull", rings, hull_mat, 0.014)
    extras = []

    for index, x in enumerate(GIRTH_XS):
        st = hull_station_at(x)
        beam, hh, zc = st[1], st[2], st[3]
        crown_z = zc + hh * 0.90

        def crown_seam(name=f"SeamCrown_{index}", loc=(x, 0.0, crown_z), width=min(beam * 1.55, 3.2)):
            return add_box(name, (0.028, width, 0.055), loc, hull_mat, 0.0)

        cut(hull, crown_seam)
        for sign, side in ((-1.0, "P"), (1.0, "S")):
            def flank_seam(name=f"SeamFlank_{index}_{side}", loc=(x, beam * 0.90 * sign, zc)):
                return add_box(name, (0.028, 0.07, hh * 0.82), loc, hull_mat, 0.0)

            cut(hull, flank_seam)

    for sign, side in ((-1.0, "P"), (1.0, "S")):
        def dorsal_seam(name=f"DorsalSeam_{side}", loc=(0.80, 0.38 * sign, 0.95)):
            return add_box(name, (12.4, 0.055, 0.080), loc, hull_mat, 0.0)

        cut(hull, dorsal_seam)

        def bilge_seam(name=f"BilgeSeam_{side}", loc=(-0.20, 0.95 * sign, -0.45)):
            return add_box(name, (11.0, 0.07, 0.12), loc, hull_mat, 0.0)

        cut(hull, bilge_seam)

    for bay_i, (fore, aft) in enumerate(zip(GIRTH_XS, GIRTH_XS[1:])):
        mx = 0.5 * (fore + aft)
        span = max(0.40, abs(fore - aft) - 0.16)
        beam = hull_station_at(mx)[1]
        inset = 0.105 if bay_i % 2 == 0 else 0.145
        flank_t = 0.085 if bay_i % 2 == 0 else 0.120
        for sign, side in ((-1.0, "P"), (1.0, "S")):
            y_dorsal = min(0.78, beam * 0.50) * sign
            if not dorsal_blocked(mx, y_dorsal):
                def plate(n=f"PlateDorsal_{bay_i}_{side}", loc=(mx, y_dorsal, 0.98),
                          length=span, yw=min(0.70, beam * 0.38), dz=inset):
                    return add_box(n, (length, yw, dz), loc, hull_mat, 0.0)

                cut(hull, plate)
                extras.append(add_box(
                    f"LOD0_Lap_{bay_i}_{side}",
                    (max(0.36, span * 0.48), 0.42, 0.055),
                    (mx + (0.10 if bay_i % 2 else -0.10), y_dorsal, 1.04),
                    hull_mat, 0.0,
                ))

            def flank(n=f"PlateFlank_{bay_i}_{side}", loc=(mx, beam * 0.86 * sign, 0.18),
                      length=span * 0.84, yt=flank_t):
                return add_box(n, (length, yt, 0.58), loc, hull_mat, 0.0)

            cut(hull, flank)

    for span_i, (x0, x1) in enumerate(STRINGER_SPANS):
        mid = 0.5 * (x0 + x1)
        span = abs(x0 - x1)
        for y in STRINGER_YS:
            if dorsal_blocked(mid, y):
                continue
            for sign, side in ((-1.0, "P"), (1.0, "S")):
                def score(n=f"StringerScore_{span_i}_{side}_{int(y * 100)}",
                          loc=(mid, y * sign, 1.00), length=span):
                    return add_box(n, (length - 0.10, 0.028, 0.032), loc, hull_mat, 0.0)

                cut(hull, score)

    def bow_step():
        return add_box("BowCourseStep", (0.14, 2.40, 0.22), (7.40, 0.0, 0.72), hull_mat, 0.0)

    cut(hull, bow_step)

    def shoulder_step():
        return add_box("ShoulderCourseStep", (0.16, 3.20, 0.20), (4.80, 0.0, 0.98), hull_mat, 0.0)

    cut(hull, shoulder_step)

    def waist_break():
        return add_box("WaistBreak", (0.70, 2.60, 0.18), (1.60, 0.0, 0.95), hull_mat, 0.0)

    cut(hull, waist_break)

    for sign, side in ((-1.0, "P"), (1.0, "S")):
        extras.append(add_box(
            f"LOD0_Chine_{side}",
            (9.2, 0.12, 0.07),
            (0.60, 1.55 * sign, 0.08),
            armor, 0.004,
        ))
        extras.append(add_box(
            f"LOD0_BowCheek_{side}",
            (1.55, 0.18, 0.32),
            (6.20, 0.95 * sign, 0.18),
            armor, 0.008,
        ))
    return hull, extras


def build_cockpit_well(hull, mats, lod):
    mech = mats["Material_Mechanical"]
    canopy = mats["Material_Canopy"]
    armor = mats["Material_Armor"]

    def cockpit_cut():
        return add_box("CockpitCut", (1.40, 0.78, 0.78), (4.10, 0.0, 1.15), mech, 0.0)

    cut(hull, cockpit_cut)
    bits = add_open_well("LOD0_CockpitTub", (1.28, 0.70, 0.72), (4.10, 0.0, 0.58), mech, floor=True, wall=0.048)
    rings = []
    for x, hw, hh, zc in (
        (4.70, 0.38, 0.20, 1.12),
        (4.10, 0.50, 0.28, 1.24),
        (3.50, 0.38, 0.20, 1.12),
    ):
        pts = []
        for i in range(14):
            ang = math.tau * i / 14.0
            y = hw * math.sin(ang)
            z = zc + hh * max(math.cos(ang), -0.12)
            pts.append((x, y, z))
        rings.append(pts)
    bits.append(loft_rings("LOD0_Canopy", rings, canopy, 0.004, cap=False))
    bits.append(add_box("LOD0_CabinShoulder", (0.90, 0.62, 0.055), (3.45, 0.0, 1.02), armor, 0.006))
    return bits, {"kind": "tub+canopy", "location": [4.10, 0.0, 0.58]}


def build_tower_well(hull, mats, lod):
    mech = mats["Material_Mechanical"]
    armor = mats["Material_Armor"]
    canopy = mats["Material_Canopy"]

    def tower_cut():
        return add_box("TowerCut", (1.15, 0.78, 0.55), (-2.40, 0.0, 1.25), mech, 0.0)

    cut(hull, tower_cut)
    bits = add_open_well("LOD0_TowerWell", (1.05, 0.68, 0.48), (-2.40, 0.0, 0.95), mech, floor=True, wall=0.048)
    bits.append(add_box("LOD0_TowerRim", (1.20, 0.82, 0.06), (-2.40, 0.0, 1.28), armor, 0.006))
    # Command tower massing — readable at D=144
    bits.append(add_box("LOD0_TowerBase", (0.95, 0.68, 0.28), (-2.40, 0.0, 1.35), armor, 0.010))
    bits.append(add_box("LOD0_TowerTrunk", (0.58, 0.40, 0.48), (-2.45, 0.0, 1.85), mats["Material_Hull"], 0.010))
    bits.append(add_box("LOD0_TowerShoulder", (0.74, 0.52, 0.11), (-2.35, 0.0, 2.18), armor, 0.006))
    bits.append(add_box("LOD0_TowerBridge", (0.85, 0.62, 0.20), (-2.20, 0.0, 2.42), armor, 0.008))
    bits.append(add_box("LOD0_TowerGlass", (0.05, 0.48, 0.12), (-1.72, 0.0, 2.44), canopy, 0.003))
    bits.append(add_box("LOD0_TowerMast", (0.055, 0.055, 0.36), (-2.55, 0.0, 2.82), mech, 0.003))
    bits.append(add_box("LOD0_TowerYard", (0.04, 0.24, 0.035), (-2.55, 0.0, 2.98), mech, 0.002))
    if lod == 0:
        bits.append(add_cylinder(
            "LOD0_TowerRadar", 0.13, 0.05, (-2.05, 0.22, 2.58), armor, 0.002,
            rotation=(0, math.pi / 2.6, 0), vertices=12,
        ))
    return bits, {"kind": "hole+stack", "location": [-2.40, 0.0, 0.95]}


def build_casemate_wells(hull, mats, lod):
    mech = mats["Material_Mechanical"]
    armor = mats["Material_Armor"]
    bits = []
    report = {"wells": []}
    for sign, side in ((-1.0, "Port"), (1.0, "Starboard")):
        y = 1.85 * sign

        def bay(n=f"CaseBay_{side}", loc=(0.20, y, 0.22)):
            return add_box(n, (1.85, 0.52, 0.58), loc, mech, 0.0)

        cut(hull, bay)
        bits.extend(add_open_well(
            f"LOD0_CaseWell_{side}", (1.70, 0.44, 0.50),
            (0.20, 1.68 * sign, 0.14), mech, floor=True, wall=0.042,
        ))
        bits.append(add_box(f"LOD0_CaseLip_{side}", (1.78, 0.06, 0.32), (0.20, 2.05 * sign, 0.20), mech, 0.004))
        bits.append(add_box(f"LOD0_CaseDeck_{side}", (1.20, 0.20, 0.045), (0.20, 1.40 * sign, 0.48), armor, 0.004))
        # Broadside guns — mass at chase distance
        bits.append(add_cylinder(f"LOD0_Broad_Fore_{side}", 0.075, 0.68, (0.75, 2.18 * sign, 0.20), mech, 0.003, vertices=10))
        bits.append(add_cylinder(f"LOD0_Broad_Aft_{side}", 0.075, 0.68, (-0.40, 2.18 * sign, 0.20), mech, 0.003, vertices=10))
        bits.append(add_cylinder(f"LOD0_Broad_Mid_{side}", 0.055, 0.48, (0.18, 2.18 * sign, 0.34), mech, 0.002, vertices=8))
        # Casemate blister mass as continuous flank volume
        case_rings = []
        for x, hw, hh, zc in (
            (3.00, 0.22, 0.28, 0.10),
            (0.20, 0.32, 0.34, 0.08),
            (-2.00, 0.22, 0.26, 0.10),
        ):
            case_rings.append([
                (x, y + hw * 0.15, zc + hh),
                (x, y + hw, zc + hh * 0.35),
                (x, y + hw, zc - hh * 0.35),
                (x, y + hw * 0.15, zc - hh),
                (x, y - hw * 0.05, zc - hh * 0.55),
                (x, y - hw * 0.05, zc + hh * 0.55),
            ])
        bits.append(loft_rings(f"LOD0_Casemate_{side}", case_rings, armor, 0.010))
        report["wells"].append({"side": side, "kind": "hole"})
    return bits, report


def build_drive_houses(mats, lod):
    armor = mats["Material_Armor"]
    ceramic = mats["Material_Ceramic"]
    thruster = mats["Material_Thruster"]
    dirt = mats["Material_Dirt"]
    bits = []
    report = {"houses": []}
    for sign, side in ((-1.0, "Port"), (1.0, "Starboard")):
        y = 1.50 * sign
        house_rings = []
        for x, hw, hh, zc in (
            (-6.10, 0.36, 0.28, 0.12),
            (-7.10, 0.46, 0.36, 0.10),
            (-7.85, 0.42, 0.34, 0.10),
            (-8.50, 0.30, 0.24, 0.10),
        ):
            house_rings.append([
                (x, y + hw, zc),
                (x, y + hw * 0.35, zc + hh),
                (x, y - hw * 0.35, zc + hh),
                (x, y - hw, zc),
                (x, y - hw * 0.35, zc - hh),
                (x, y + hw * 0.35, zc - hh),
            ])
        bits.append(loft_rings(f"LOD0_DriveHouse_{side}", house_rings, armor, 0.010))
        bits.append(add_cylinder(f"LOD0_DriveCollar_{side}", 0.38, 0.14, (-8.20, y, 0.10), ceramic, 0.006, vertices=14))
        bits.append(add_cylinder(f"LOD0_Bell_{side}", 0.40, 0.48, (-8.85, y, 0.10), thruster, 0.004, vertices=16))
        bits.append(add_cylinder(f"LOD0_BellThroat_{side}", 0.24, 0.32, (-8.78, y, 0.10), dirt, 0.0, vertices=12))
        if lod == 0:
            bits.append(add_box(f"LOD0_DriveBand_{side}", (0.08, 0.55, 0.36), (-7.10, y, 0.10), armor, 0.003))
        report["houses"].append({"side": side, "y": y})
    return bits, report


def build_guns(mats, lod):
    mech = mats["Material_Mechanical"]
    armor = mats["Material_Armor"]
    bits = []
    for sign, side in ((-1.0, "P"), (1.0, "S")):
        bits.append(add_cylinder(f"LOD0_GunHouse_{side}", 0.095, 1.05, (6.00, 0.48 * sign, -0.04), mech, 0.004, vertices=10))
        bits.append(add_cylinder(f"LOD0_GunBarrel_{side}", 0.036, 0.78, (6.90, 0.48 * sign, -0.04), armor, 0.002, vertices=8))
        bits.append(add_cylinder(f"LOD0_RearGun_{side}", 0.045, 0.58, (-6.20, 0.58 * sign, 0.48), mech, 0.003, vertices=8))
    bits.append(add_cylinder("LOD0_TurretRing", 0.34, 0.10, (0.70, 0.0, 1.12), mech, 0.005, rotation=(0, 0, 0), vertices=14))
    bits.append(add_box("LOD0_TurretHead", (0.34, 0.20, 0.12), (0.85, 0.0, 1.28), armor, 0.005))
    return bits


def build_hardware(hull, mats, lod):
    mech = mats["Material_Mechanical"]
    armor = mats["Material_Armor"]
    warning = mats["Material_Warning"]
    accent = mats["Material_Accent"]
    bits = []
    bits.append(add_box("LOD0_TransomPlate", (0.06, 0.72, 0.36), (-8.55, 0.0, 0.12), armor, 0.004))
    bits.append(add_box("LOD0_KeelSpine", (3.4, 0.26, 0.05), (0.40, 0.0, -0.92), mech, 0.008))
    bits.append(add_box("LOD0_AftWalk", (1.7, 0.16, 0.016), (-3.60, 0.0, 0.55), mech, 0.002))
    bits.append(add_box("LOD0_RepairPatch", (0.34, 0.16, 0.014), (1.40, -0.55, 0.88), warning, 0.002))
    bits.append(add_box("LOD0_WarnChevron", (0.24, 0.10, 0.012), (-3.40, -0.70, 0.78), warning, 0.002))
    bits.append(add_box("LOD0_HatchLid", (0.34, 0.20, 0.018), (-1.20, 0.35, 0.82), armor, 0.003))
    bits.append(add_cylinder("LOD0_CommMast", 0.038, 0.70, (-0.40, 0.0, 1.28), mech, 0.002, rotation=(0, 0, 0), vertices=8))
    bits.append(add_box("LOD0_CommHead", (0.12, 0.16, 0.06), (-0.32, 0.0, 1.65), armor, 0.003))
    bits.append(add_box("LOD0_AccentBand", (0.10, 2.80, 0.08), (5.20, 0.0, 0.42), accent, 0.003))
    for sign, side in ((-1.0, "P"), (1.0, "S")):
        bits.append(add_box(f"LOD0_RCS_{side}", (0.22, 0.14, 0.14), (-1.50, 1.85 * sign, 0.22), mech, 0.003))
    if lod == 0:
        for sign, side in ((-1.0, "P"), (1.0, "S")):
            for i in range(5):
                bits.append(add_box(
                    f"LOD0_RadFin_{side}_{i}",
                    (0.014, 0.16, 0.18),
                    (-0.20 + i * 0.18, 1.55 * sign, 0.26),
                    mech, 0.001,
                ))
        bits.append(add_box("LOD0_DeckCrate", (0.18, 0.12, 0.10), (-1.90, 0.40, 0.72), warning, 0.003))
    return bits


def shade_objects(objs):
    for obj in objs:
        bpy.context.view_layer.objects.active = obj
        obj.select_set(True)
        try:
            bpy.ops.object.shade_smooth()
            if hasattr(obj.data, "use_auto_smooth"):
                obj.data.use_auto_smooth = True
                obj.data.auto_smooth_angle = math.radians(42)
        except Exception:
            pass
        obj.select_set(False)


def mesh_world_size():
    mins = Vector((1e9, 1e9, 1e9))
    maxs = Vector((-1e9, -1e9, -1e9))
    for obj in bpy.data.objects:
        if obj.type != "MESH" or is_collision(obj):
            continue
        for corner in obj.bound_box:
            world = obj.matrix_world @ Vector(corner)
            for axis in range(3):
                mins[axis] = min(mins[axis], world[axis])
                maxs[axis] = max(maxs[axis], world[axis])
    return maxs - mins, mins, maxs


def triangulate_and_uv():
    for obj in list(bpy.data.objects):
        if obj.type != "MESH" or is_collision(obj):
            continue
        bpy.context.view_layer.objects.active = obj
        obj.select_set(True)
        mod = obj.modifiers.new("ExportTri", "TRIANGULATE")
        mod.quad_method = "BEAUTY"
        try:
            bpy.ops.object.modifier_apply(modifier=mod.name)
        except Exception:
            if mod.name in obj.modifiers:
                obj.modifiers.remove(mod)
        bpy.ops.object.mode_set(mode="EDIT")
        try:
            bpy.ops.mesh.select_all(action="SELECT")
            bpy.ops.uv.smart_project(angle_limit=66.0, island_margin=0.02, scale_to_bounds=True)
        except Exception:
            pass
        finally:
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
    cockpit_bits, cockpit_report = build_cockpit_well(hull, mats, lod)
    tower_bits, tower_report = build_tower_well(hull, mats, lod)
    case_bits, case_report = build_casemate_wells(hull, mats, lod)
    drive_bits, drive_report = build_drive_houses(mats, lod)
    guns = build_guns(mats, lod)
    hardware = build_hardware(hull, mats, lod)
    paint_shell(hull, mats)

    built = [hull, *hull_extras, *cockpit_bits, *tower_bits, *case_bits, *drive_bits, *guns, *hardware]
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
    for key in (
        "Material_Ceramic", "Material_Radiator", "Material_Thruster",
        "Material_Mechanical", "Material_Accent", "Material_Canopy",
        "Material_Armor", "Material_Warning", "Material_Dirt", "Material_Mark",
        "Material_Course",
    ):
        material = mats[key]
        group = [
            obj for obj in bpy.data.objects
            if obj.type == "MESH" and obj.data.materials and obj.data.materials[0] == material
            and not is_collision(obj) and not keep_separate(obj)
        ]
        if len(group) > 1:
            join_into(group[0], group[1:])

    assert_empties(empties)
    shade_objects([obj for obj in bpy.data.objects if obj.type == "MESH" and not is_collision(obj)])
    bpy.context.view_layer.update()
    size, low, high = mesh_world_size()
    # Corvette envelope: ~18 m long, casemate beam, tower height
    if size.x < 16.5 or size.x > 20.5 or size.y < 4.0 or size.y > 6.5 or size.z < 2.2 or size.z > 4.5:
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
        "asset": "ship_bastion",
        "revision": REVISION,
        "lod": lod,
        "source": str(source),
        "output": str(output),
        "cockpit": cockpit_report,
        "tower": tower_report,
        "casemates": case_report,
        "drive": drive_report,
        "size": [round(float(size.x), 3), round(float(size.y), 3), round(float(size.z), 3)],
        "boundsMin": [round(float(v), 3) for v in low],
        "boundsMax": [round(float(v), 3) for v in high],
        "triangles": tris,
        "hullTriangles": hull_tris,
        "objects": sorted(obj.name for obj in meshes)[:12],
        "bytes": output.stat().st_size,
        "gates": {"TUBE_PADDLE": "NO", "CAGE_READ": "NO", "wells": "HOLES"},
    }
    output.with_suffix(".report.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report))
    return report


def main():
    args = parse_args(sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else [])
    lods = [int(item.strip()) for item in args.lods.split(",") if item.strip() != ""]
    sources = {0: args.source_lod0, 1: args.source_lod1, 2: args.source_lod2}
    out_dir = args.out_dir.resolve()
    out_dir.mkdir(parents=True, exist_ok=True)
    reports = []
    for lod in lods:
        source = sources[lod].resolve()
        if not source.is_file():
            raise SystemExit(f"missing source {source}")
        output = out_dir / f"bastion_c1_lod{lod}.glb"
        reports.append(build_one(source, output, lod))
    summary = {"ok": True, "revision": REVISION, "lods": reports, "promoted": []}
    (out_dir / "bastion_chase_form_v1.summary.json").write_text(
        json.dumps(summary, indent=2) + "\n", encoding="utf-8"
    )
    print(json.dumps(summary))


if __name__ == "__main__":
    main()

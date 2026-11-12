"""Atlas chase-camera outbox form rebuild (player bulk hauler).

Imports live Atlas only for root, sockets, and collision. Replaces render
meshes with one continuous formed bulk-hauler shell that reads at the live
chase camera. Blunt bow, wide cargo mid with cargo well as a hole, raised
bridge house, four-engine transom, knuckle crane. No tube/paddle lobes, no
open cage. Hitch/Kestrel compare-only. Prior outbox ships frozen — do not rebuild.

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

# Sea-enamel bulk hauler — sandy olive hull, darker armor, amber marks.
HONEST = {
    "Material_Hull": {"color": (0.30, 0.29, 0.24), "metallic": 0.08, "roughness": 0.52},
    "Material_Armor": {"color": (0.070, 0.068, 0.060), "metallic": 0.26, "roughness": 0.56},
    "Material_Course": {"color": (0.20, 0.19, 0.16), "metallic": 0.14, "roughness": 0.50},
    "Material_Mark": {"color": (0.62, 0.38, 0.10), "metallic": 0.06, "roughness": 0.36},
    "Material_Canopy": {"color": (0.04, 0.10, 0.12), "metallic": 0.0, "roughness": 0.06},
    "Material_Ceramic": {"color": (0.38, 0.34, 0.28), "metallic": 0.05, "roughness": 0.64},
    "Material_Mechanical": {"color": (0.18, 0.18, 0.19), "metallic": 0.48, "roughness": 0.40},
    "Material_Radiator": {"color": (0.08, 0.07, 0.06), "metallic": 0.28, "roughness": 0.58},
    "Material_Thruster": {"color": (0.03, 0.05, 0.07), "metallic": 0.22, "roughness": 0.32},
    "Material_Accent": {"color": (0.70, 0.42, 0.08), "metallic": 0.05, "roughness": 0.30, "emit": 2.2},
    "Material_Warning": {"color": (0.78, 0.34, 0.08), "metallic": 0.03, "roughness": 0.36, "emit": 1.9},
    "Material_Dirt": {"color": (0.055, 0.048, 0.040), "metallic": 0.02, "roughness": 0.82},
}

GIRTH_XS = (7.20, 3.60, 0.40, -2.80, -6.00)
MARK_XS = (5.80, -1.60)
STRINGER_YS = (0.85, 1.55)
STRINGER_SPANS = ((8.40, 5.20), (4.00, 1.20), (-0.40, -3.40), (-4.40, -7.60))

# Bulk hauler stations: (x, beam, hh, zc, keel, flat, box, chine)
# Blunt bow → bridge shoulder → dropped cargo mid → raised house → four-drive transom.
HULL_STATIONS = [
    (11.20, 1.45, 0.85, 0.18, 0.14, 0.78, 0.58, 0.30),
    (10.20, 1.95, 1.05, 0.26, 0.16, 0.88, 0.62, 0.34),
    (8.60, 2.55, 1.25, 0.34, 0.18, 0.94, 0.68, 0.38),
    (6.80, 3.05, 1.40, 0.38, 0.18, 0.96, 0.74, 0.42),
    (4.60, 3.35, 1.28, 0.28, 0.16, 0.70, 0.86, 0.44),
    (2.20, 3.50, 1.10, 0.16, 0.14, 0.35, 0.94, 0.44),
    (0.00, 3.55, 1.05, 0.12, 0.14, 0.28, 0.96, 0.42),
    (-2.20, 3.45, 1.12, 0.16, 0.13, 0.32, 0.95, 0.40),
    (-4.40, 3.15, 1.28, 0.24, 0.12, 0.40, 0.94, 0.36),
    (-6.60, 2.70, 1.35, 0.30, 0.11, 0.48, 0.94, 0.32),
    (-8.40, 2.25, 1.20, 0.28, 0.10, 0.45, 0.95, 0.28),
    (-9.80, 1.75, 1.00, 0.22, 0.09, 0.40, 0.94, 0.24),
    (-11.00, 1.20, 0.78, 0.16, 0.08, 0.35, 0.92, 0.20),
]


def parse_args(argv):
    parser = argparse.ArgumentParser()
    parser.add_argument("--source-lod0", type=Path, default=LIVE_PARTS / "atlas_production_v1.glb")
    parser.add_argument("--source-lod1", type=Path, default=LIVE_PARTS / "atlas_production_v1_lod1.glb")
    parser.add_argument("--source-lod2", type=Path, default=LIVE_PARTS / "atlas_production_v1_lod2.glb")
    parser.add_argument("--out-dir", type=Path, default=Path(__file__).resolve().parent)
    parser.add_argument("--lods", default="0,1,2")
    return parser.parse_args(argv)


def find_root():
    for name in ("ATLAS_LOD0_ROOT", "ATLAS_LOD1_ROOT", "ATLAS_LOD2_ROOT"):
        named = bpy.data.objects.get(name)
        if named:
            return named
    matches = [
        obj for obj in bpy.data.objects
        if obj.type == "EMPTY" and "ATLAS" in obj.name.upper() and "ROOT" in obj.name.upper()
    ]
    if len(matches) == 1:
        return matches[0]
    matches = [
        obj for obj in bpy.data.objects
        if obj.type == "EMPTY" and "ROOT" in obj.name.upper()
    ]
    if len(matches) == 1:
        return matches[0]
    raise RuntimeError("missing Atlas root")


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
    # cargo well
    if abs(x - 0.20) < 3.40 and abs(y) < 1.35:
        return True
    # bridge house
    if abs(x - 6.70) < 1.20 and abs(y) < 0.85:
        return True
    # aft house
    if abs(x + 5.20) < 1.40 and abs(y) < 1.10:
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
        on_girth = any(abs(centroid.x - gx) < 0.28 for gx in GIRTH_XS)
        on_mark = any(abs(centroid.x - mx) < 0.36 for mx in MARK_XS)
        island = (int(abs(centroid.x) * 2.0) + int(centroid.z * 3.4)) % 8 == 0
        bow_cap = centroid.x > 9.40
        armor_belt = abs(centroid.z - zc) < hh * 0.22 and abs(centroid.y) > beam * 0.42
        mid_course = 3.60 < centroid.x < 7.40 and centroid.z > zc + hh * 0.10
        if bow_cap or centroid.z < zc - hh * 0.32 or armor_belt:
            poly.material_index = 1
        elif on_girth or mid_course:
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
    hull = loft_rings("LOD0_Hull", rings, hull_mat, 0.016)
    extras = []

    for index, x in enumerate(GIRTH_XS):
        st = hull_station_at(x)
        beam, hh, zc = st[1], st[2], st[3]
        crown_z = zc + hh * 0.90

        def crown_seam(name=f"SeamCrown_{index}", loc=(x, 0.0, crown_z), width=min(beam * 1.45, 4.4)):
            return add_box(name, (0.034, width, 0.070), loc, hull_mat, 0.0)

        cut(hull, crown_seam)
        for sign, side in ((-1.0, "P"), (1.0, "S")):
            def flank_seam(name=f"SeamFlank_{index}_{side}", loc=(x, beam * 0.88 * sign, zc)):
                return add_box(name, (0.034, 0.10, hh * 0.85), loc, hull_mat, 0.0)

            cut(hull, flank_seam)

    for sign, side in ((-1.0, "P"), (1.0, "S")):
        def dorsal_seam(name=f"DorsalSeam_{side}", loc=(0.40, 0.55 * sign, 1.05)):
            return add_box(name, (15.2, 0.070, 0.095), loc, hull_mat, 0.0)

        cut(hull, dorsal_seam)

        def bilge_seam(name=f"BilgeSeam_{side}", loc=(-0.60, 1.35 * sign, -0.45)):
            return add_box(name, (13.5, 0.10, 0.16), loc, hull_mat, 0.0)

        cut(hull, bilge_seam)

    for bay_i, (fore, aft) in enumerate(zip(GIRTH_XS, GIRTH_XS[1:])):
        mx = 0.5 * (fore + aft)
        span = max(0.48, abs(fore - aft) - 0.22)
        beam = hull_station_at(mx)[1]
        inset = 0.120 if bay_i % 2 == 0 else 0.165
        flank_t = 0.100 if bay_i % 2 == 0 else 0.140
        for sign, side in ((-1.0, "P"), (1.0, "S")):
            y_dorsal = min(1.15, beam * 0.52) * sign
            if not dorsal_blocked(mx, y_dorsal):
                def plate(n=f"PlateDorsal_{bay_i}_{side}", loc=(mx, y_dorsal, 1.02),
                          length=span, yw=min(0.95, beam * 0.40), dz=inset):
                    return add_box(n, (length, yw, dz), loc, hull_mat, 0.0)

                cut(hull, plate)
                extras.append(add_box(
                    f"LOD0_Lap_{bay_i}_{side}",
                    (max(0.48, span * 0.50), 0.58, 0.070),
                    (mx + (0.14 if bay_i % 2 else -0.14), y_dorsal, 1.10),
                    hull_mat, 0.0,
                ))

            def flank(n=f"PlateFlank_{bay_i}_{side}", loc=(mx, beam * 0.82 * sign, 0.18),
                      length=span * 0.86, yt=flank_t):
                return add_box(n, (length, yt, 0.72), loc, hull_mat, 0.0)

            cut(hull, flank)

    for span_i, (x0, x1) in enumerate(STRINGER_SPANS):
        mid = 0.5 * (x0 + x1)
        span = abs(x0 - x1)
        for y in STRINGER_YS:
            if dorsal_blocked(mid, y):
                continue
            for sign, side in ((-1.0, "P"), (1.0, "S")):
                def score(n=f"StringerScore_{span_i}_{side}_{int(y * 100)}",
                          loc=(mid, y * sign, 1.06), length=span):
                    return add_box(n, (length - 0.14, 0.034, 0.038), loc, hull_mat, 0.0)

                cut(hull, score)

    def bow_step():
        return add_box("BowCourseStep", (0.18, 5.60, 0.28), (9.20, 0.0, 1.05), hull_mat, 0.0)

    cut(hull, bow_step)

    def shoulder_step():
        return add_box("ShoulderCourseStep", (0.20, 6.40, 0.26), (5.80, 0.0, 1.18), hull_mat, 0.0)

    cut(hull, shoulder_step)

    def cargo_break():
        return add_box("CargoLoadBreak", (1.10, 2.80, 0.22), (0.40, 0.0, 1.00), hull_mat, 0.0)

    cut(hull, cargo_break)

    for sign, side in ((-1.0, "P"), (1.0, "S")):
        extras.append(add_box(
            f"LOD0_Chine_{side}",
            (12.5, 0.16, 0.09),
            (0.20, 2.95 * sign, 0.02),
            armor, 0.004,
        ))
        extras.append(add_box(
            f"LOD0_BowCheek_{side}",
            (1.85, 0.28, 0.48),
            (8.60, 1.85 * sign, 0.28),
            armor, 0.008,
        ))
    return hull, extras


def build_cargo_well(hull, mats, lod):
    mech = mats["Material_Mechanical"]
    armor = mats["Material_Armor"]
    warning = mats["Material_Warning"]

    def cargo_cut():
        return add_box("CargoCut", (6.60, 2.55, 1.25), (0.20, 0.0, 1.15), mech, 0.0)

    cut(hull, cargo_cut)
    bits = add_open_well("LOD0_CargoWell", (6.40, 2.40, 1.10), (0.20, 0.0, 0.45), mech, floor=True, wall=0.060)
    bits.append(add_box("LOD0_CargoRim", (6.70, 2.65, 0.08), (0.20, 0.0, 1.22), armor, 0.006))
    bits.append(add_box("LOD0_CargoLipP", (6.20, 0.08, 0.12), (0.20, -1.22, 1.12), mech, 0.004))
    bits.append(add_box("LOD0_CargoLipS", (6.20, 0.08, 0.12), (0.20, 1.22, 1.12), mech, 0.004))
    # Formed cargo pods as continuous drum bodies sitting in the well — not tube paddles.
    for tag, x, r, length in (
        ("Fore", 2.40, 0.52, 2.10),
        ("Mid", 0.10, 0.56, 2.20),
        ("Aft", -2.20, 0.50, 2.00),
    ):
        bits.append(add_cylinder(
            f"LOD0_CargoPod_{tag}", r, length, (x, 0.0, 0.55), armor, 0.008,
            rotation=(0.0, math.radians(90), 0.0), vertices=14,
        ))
        bits.append(add_cylinder(
            f"LOD0_CargoBand_{tag}", r + 0.04, 0.12, (x, 0.0, 0.55), mech, 0.004,
            rotation=(0.0, math.radians(90), 0.0), vertices=12,
        ))
    if lod == 0:
        bits.append(add_box("LOD0_PalletA", (0.42, 0.28, 0.12), (-0.80, 0.55, 0.22), warning, 0.003))
        bits.append(add_box("LOD0_PalletB", (0.36, 0.24, 0.10), (1.10, -0.60, 0.20), mech, 0.003))
    return bits, {"kind": "hole", "size": [6.40, 2.40, 1.10], "location": [0.20, 0.0, 0.45]}


def build_bridge_house(hull, mats, lod):
    mech = mats["Material_Mechanical"]
    canopy = mats["Material_Canopy"]
    armor = mats["Material_Armor"]

    def bridge_cut():
        return add_box("BridgeCut", (2.05, 1.15, 1.05), (6.70, 0.0, 1.55), mech, 0.0)

    cut(hull, bridge_cut)
    bits = add_open_well("LOD0_BridgeTub", (1.90, 1.05, 0.95), (6.70, 0.0, 0.85), mech, floor=True, wall=0.055)
    # Raised house mass around the tub
    bits.append(add_box("LOD0_BridgeHouse", (1.70, 0.95, 0.55), (6.55, 0.0, 1.55), armor, 0.010))
    bits.append(add_box("LOD0_BridgeShoulder", (1.10, 1.20, 0.08), (5.90, 0.0, 1.28), armor, 0.006))
    rings = []
    for x, hw, hh, zc in (
        (7.40, 0.48, 0.26, 1.70),
        (6.70, 0.62, 0.34, 1.85),
        (6.00, 0.48, 0.26, 1.70),
    ):
        pts = []
        for i in range(14):
            ang = math.tau * i / 14.0
            y = hw * math.sin(ang)
            z = zc + hh * max(math.cos(ang), -0.12)
            pts.append((x, y, z))
        rings.append(pts)
    bits.append(loft_rings("LOD0_Canopy", rings, canopy, 0.004, cap=False))
    return bits, {"kind": "tub+canopy+house", "location": [6.70, 0.0, 0.85]}


def build_aft_house(mats, lod):
    armor = mats["Material_Armor"]
    mech = mats["Material_Mechanical"]
    bits = []
    # Raised aft superstructure over the drive quartet
    house_rings = []
    for x, hw, hh, zc in (
        (-4.20, 1.15, 0.55, 0.85),
        (-5.20, 1.35, 0.70, 0.95),
        (-6.40, 1.25, 0.65, 0.90),
        (-7.20, 0.95, 0.48, 0.80),
    ):
        house_rings.append([
            (x, hw, zc),
            (x, hw * 0.40, zc + hh),
            (x, -hw * 0.40, zc + hh),
            (x, -hw, zc),
            (x, -hw * 0.40, zc - hh * 0.55),
            (x, hw * 0.40, zc - hh * 0.55),
        ])
    bits.append(loft_rings("LOD0_AftHouse", house_rings, armor, 0.012))
    bits.append(add_box("LOD0_AftWalk", (2.4, 0.22, 0.018), (-5.40, 0.0, 1.45), mech, 0.002))
    bits.append(add_box("LOD0_AftStack", (0.32, 0.28, 0.55), (-5.80, 0.0, 1.75), armor, 0.006))
    return bits


def build_drive_houses(mats, lod):
    armor = mats["Material_Armor"]
    ceramic = mats["Material_Ceramic"]
    thruster = mats["Material_Thruster"]
    dirt = mats["Material_Dirt"]
    bits = []
    report = {"houses": []}
    # Four-engine transom: upper/lower port/starboard
    layout = (
        ("PortUpper", -1.55, 0.55),
        ("StbdUpper", 1.55, 0.55),
        ("PortLower", -1.55, -0.15),
        ("StbdLower", 1.55, -0.15),
    )
    for side, y, z in layout:
        house_rings = []
        for x, hw, hh, zc in (
            (-8.20, 0.36, 0.28, z),
            (-9.20, 0.46, 0.36, z),
            (-10.00, 0.44, 0.34, z),
            (-10.60, 0.32, 0.24, z),
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
        bits.append(add_cylinder(f"LOD0_DriveCollar_{side}", 0.38, 0.14, (-10.15, y, z), ceramic, 0.006, vertices=14))
        bits.append(add_cylinder(f"LOD0_Bell_{side}", 0.34, 0.48, (-10.85, y, z), thruster, 0.004, vertices=16))
        bits.append(add_cylinder(f"LOD0_BellThroat_{side}", 0.20, 0.30, (-10.80, y, z), dirt, 0.0, vertices=12))
        if lod == 0:
            bits.append(add_box(f"LOD0_DriveBand_{side}", (0.08, 0.50, 0.32), (-9.15, y, z), armor, 0.003))
        report["houses"].append({"side": side, "y": y, "z": z})
    return bits, report


def build_knuckle_crane(mats, lod):
    mech = mats["Material_Mechanical"]
    armor = mats["Material_Armor"]
    bits = []
    # Cargo-handling knuckle crane — formed boom masses, not tube paddles.
    bits.append(add_box("LOD0_CraneBase", (0.55, 0.55, 0.28), (-1.80, 1.85, 1.25), armor, 0.008))
    bits.append(add_cylinder("LOD0_CranePedestal", 0.16, 0.55, (-1.80, 1.85, 1.55), mech, 0.004, rotation=(0, 0, 0), vertices=12))
    boom_rings = [
        [
            (-1.60, 1.85 + 0.12, 1.85), (-1.60, 1.85, 1.98), (-1.60, 1.85 - 0.12, 1.85),
            (-1.60, 1.85, 1.72),
        ],
        [
            (0.40, 1.55 + 0.10, 2.05), (0.40, 1.55, 2.16), (0.40, 1.55 - 0.10, 2.05),
            (0.40, 1.55, 1.94),
        ],
        [
            (1.60, 1.20 + 0.08, 1.70), (1.60, 1.20, 1.80), (1.60, 1.20 - 0.08, 1.70),
            (1.60, 1.20, 1.60),
        ],
    ]
    bits.append(loft_rings("LOD0_CraneBoom", boom_rings, mech, 0.006))
    bits.append(add_box("LOD0_CraneKnuckle", (0.28, 0.22, 0.22), (0.40, 1.55, 2.05), armor, 0.006))
    bits.append(add_box("LOD0_CraneHook", (0.12, 0.10, 0.28), (1.70, 1.20, 1.45), mech, 0.003))
    if lod == 0:
        bits.append(add_box("LOD0_CraneWinch", (0.18, 0.16, 0.14), (-1.55, 1.85, 1.72), armor, 0.003))
    return bits


def build_guns(mats, lod):
    mech = mats["Material_Mechanical"]
    armor = mats["Material_Armor"]
    bits = []
    for sign, side in ((-1.0, "P"), (1.0, "S")):
        bits.append(add_cylinder(f"LOD0_GunHouse_{side}", 0.10, 1.05, (8.80, 0.70 * sign, 0.10), mech, 0.004, vertices=10))
        bits.append(add_cylinder(f"LOD0_GunBarrel_{side}", 0.038, 0.85, (9.70, 0.70 * sign, 0.10), armor, 0.002, vertices=8))
    bits.append(add_cylinder("LOD0_TurretRing", 0.42, 0.12, (-3.60, 0.0, 1.55), mech, 0.005, rotation=(0, 0, 0), vertices=14))
    bits.append(add_box("LOD0_TurretHead", (0.42, 0.26, 0.14), (-3.40, 0.0, 1.72), armor, 0.005))
    return bits


def build_hardware(hull, mats, lod):
    mech = mats["Material_Mechanical"]
    armor = mats["Material_Armor"]
    warning = mats["Material_Warning"]
    bits = []
    bits.append(add_box("LOD0_TransomPlate", (0.08, 1.20, 0.55), (-10.70, 0.0, 0.20), armor, 0.004))
    bits.append(add_box("LOD0_KeelSpine", (5.5, 0.36, 0.06), (0.40, 0.0, -1.15), mech, 0.008))
    bits.append(add_box("LOD0_RepairPatch", (0.48, 0.22, 0.016), (3.20, -0.95, 1.00), warning, 0.002))
    bits.append(add_box("LOD0_HatchLid", (0.42, 0.26, 0.020), (-2.80, 0.55, 1.35), armor, 0.003))
    bits.append(add_cylinder("LOD0_CommMast", 0.042, 0.85, (-4.80, 0.0, 1.85), mech, 0.002, rotation=(0, 0, 0), vertices=8))
    bits.append(add_box("LOD0_CommHead", (0.14, 0.18, 0.07), (-4.70, 0.0, 2.30), armor, 0.003))
    for sign, side in ((-1.0, "P"), (1.0, "S")):
        def bay(n=f"SideBay_{side}", loc=(0.20, 3.15 * sign, 0.18)):
            return add_box(n, (2.20, 0.65, 0.65), loc, mech, 0.0)

        cut(hull, bay)
        bits.extend(add_open_well(
            f"LOD0_SideWell_{side}", (2.05, 0.55, 0.55),
            (0.20, 2.85 * sign, 0.12), mech, floor=True, wall=0.045,
        ))
        bits.append(add_box(f"LOD0_RCS_{side}", (0.26, 0.16, 0.16), (-1.20, 3.10 * sign, 0.25), mech, 0.003))
        bits.append(add_box(f"LOD0_Fender_{side}", (4.8, 0.12, 0.18), (0.40, 3.35 * sign, -0.05), armor, 0.004))
    if lod == 0:
        for sign, side in ((-1.0, "P"), (1.0, "S")):
            for i in range(5):
                bits.append(add_box(
                    f"LOD0_RadFin_{side}_{i}",
                    (0.018, 0.22, 0.24),
                    (-0.40 + i * 0.24, 2.70 * sign, 0.35),
                    mech, 0.001,
                ))
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
    cargo_bits, cargo_report = build_cargo_well(hull, mats, lod)
    bridge_bits, bridge_report = build_bridge_house(hull, mats, lod)
    aft_bits = build_aft_house(mats, lod)
    drive_bits, drive_report = build_drive_houses(mats, lod)
    crane = build_knuckle_crane(mats, lod)
    guns = build_guns(mats, lod)
    hardware = build_hardware(hull, mats, lod)
    paint_shell(hull, mats)

    built = [hull, *hull_extras, *cargo_bits, *bridge_bits, *aft_bits, *drive_bits, *crane, *guns, *hardware]
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
    # Live Atlas ~23.1 x 7.1 x 4.8; allow formed envelope near that.
    if size.x < 20.0 or size.x > 26.0 or size.y < 6.0 or size.y > 9.0 or size.z > 6.5:
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
        "asset": "ship_atlas",
        "revision": REVISION,
        "lod": lod,
        "source": str(source),
        "output": str(output),
        "cargo": cargo_report,
        "bridge": bridge_report,
        "drive": drive_report,
        "size": [round(float(size.x), 3), round(float(size.y), 3), round(float(size.z), 3)],
        "boundsMin": [round(float(v), 3) for v in low],
        "boundsMax": [round(float(v), 3) for v in high],
        "triangles": tris,
        "hullTriangles": hull_tris,
        "objects": [obj.name for obj in meshes],
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
        output = out_dir / f"atlas_c1_lod{lod}.glb"
        reports.append(build_one(source, output, lod))
    summary = {"ok": True, "revision": REVISION, "lods": reports, "promoted": []}
    (out_dir / "atlas_chase_form_v1.summary.json").write_text(
        json.dumps(summary, indent=2) + "\n", encoding="utf-8"
    )
    print(json.dumps(summary))


if __name__ == "__main__":
    main()

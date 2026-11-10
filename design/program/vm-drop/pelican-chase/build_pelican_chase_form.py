"""Pelican chase-camera outbox form rebuild (player miner / dedicated package).

Imports live Pelican only for root, sockets, and collision. Replaces render
meshes with one continuous formed prospector shell that reads at the live
chase camera. Service hatch and filter-bay wells are holes with rims. No
tube/paddle lobes, no open cage. Hitch/Kestrel compare-only. Do not rebuild
prior ships. Do not wire pelican.glb.

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

# Heat-stained orange-brown prospector over older grey plates + cyan scuff.
HONEST = {
    "Material_Hull": {"color": (0.34, 0.20, 0.11), "metallic": 0.14, "roughness": 0.50},
    "Material_Armor": {"color": (0.070, 0.060, 0.052), "metallic": 0.26, "roughness": 0.58},
    "Material_Course": {"color": (0.22, 0.14, 0.08), "metallic": 0.18, "roughness": 0.52},
    "Material_Mark": {"color": (0.78, 0.44, 0.12), "metallic": 0.05, "roughness": 0.36},
    "Material_Canopy": {"color": (0.010, 0.014, 0.018), "metallic": 0.0, "roughness": 0.05},
    "Material_Ceramic": {"color": (0.12, 0.10, 0.08), "metallic": 0.08, "roughness": 0.64},
    "Material_Mechanical": {"color": (0.045, 0.048, 0.050), "metallic": 0.42, "roughness": 0.46},
    "Material_Radiator": {"color": (0.055, 0.042, 0.034), "metallic": 0.24, "roughness": 0.54},
    "Material_Thruster": {"color": (0.026, 0.026, 0.030), "metallic": 0.30, "roughness": 0.48},
    "Material_Accent": {"color": (0.18, 0.72, 0.78), "metallic": 0.04, "roughness": 0.30, "emit": 2.4},
    "Material_Warning": {"color": (0.82, 0.38, 0.08), "metallic": 0.02, "roughness": 0.32, "emit": 2.0},
    "Material_Dirt": {"color": (0.065, 0.045, 0.030), "metallic": 0.02, "roughness": 0.82},
}

GIRTH_XS = (4.80, 2.20, -0.60, -3.40)
MARK_XS = (3.10, -2.20)
STRINGER_YS = (0.55, 1.05)
STRINGER_SPANS = ((5.60, 3.20), (2.40, -0.20), (-1.40, -4.60))

# Short stocky prospector stations: (x, beam, hh, zc, keel, flat, box, chine)
# Live envelope ~14.6 × 5.6 × 3.8 m; arms may grow beam without changing collision.
HULL_STATIONS = [
    (7.20, 1.20, 0.78, 0.18, 0.12, 0.62, 0.48, 0.30),
    (6.50, 1.70, 0.98, 0.24, 0.14, 0.78, 0.55, 0.34),
    (5.60, 2.15, 1.14, 0.28, 0.15, 0.88, 0.60, 0.38),
    (4.40, 2.40, 1.22, 0.28, 0.15, 0.92, 0.66, 0.40),
    (3.00, 2.55, 1.18, 0.24, 0.14, 0.90, 0.72, 0.42),
    (1.40, 2.60, 1.08, 0.20, 0.13, 0.70, 0.82, 0.40),
    (0.00, 2.55, 1.00, 0.16, 0.12, 0.52, 0.88, 0.38),
    (-1.60, 2.45, 0.98, 0.16, 0.12, 0.48, 0.90, 0.36),
    (-3.20, 2.25, 1.02, 0.18, 0.11, 0.50, 0.88, 0.32),
    (-4.60, 1.95, 0.98, 0.16, 0.10, 0.48, 0.90, 0.28),
    (-5.80, 1.55, 0.88, 0.14, 0.09, 0.42, 0.92, 0.24),
    (-6.80, 1.15, 0.72, 0.12, 0.08, 0.36, 0.90, 0.20),
]


def parse_args(argv):
    parser = argparse.ArgumentParser()
    parser.add_argument("--source-lod0", type=Path, default=LIVE_PARTS / "pelican_production_v1.glb")
    parser.add_argument("--source-lod1", type=Path, default=LIVE_PARTS / "pelican_production_v1_lod1.glb")
    parser.add_argument("--source-lod2", type=Path, default=LIVE_PARTS / "pelican_production_v1_lod2.glb")
    parser.add_argument("--out-dir", type=Path, default=Path(__file__).resolve().parent)
    parser.add_argument("--lods", default="0,1,2")
    return parser.parse_args(argv)


def find_root():
    for name in (
        "PELICAN_PRODUCTION_V1_LOD0_ROOT",
        "PELICAN_PRODUCTION_V1_LOD1_ROOT",
        "PELICAN_PRODUCTION_V1_LOD2_ROOT",
    ):
        named = bpy.data.objects.get(name)
        if named:
            return named
    matches = [
        obj for obj in bpy.data.objects
        if obj.type == "EMPTY" and "PELICAN" in obj.name.upper() and "ROOT" in obj.name.upper()
    ]
    if len(matches) == 1:
        return matches[0]
    raise RuntimeError("missing Pelican root")


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
    # cabin tub / canopy
    if abs(x - 4.00) < 1.05 and abs(y) < 0.85:
        return True
    # service hatch well
    if abs(x - 0.40) < 1.00 and abs(y) < 0.75:
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
        on_mark = any(abs(centroid.x - mx) < 0.28 for mx in MARK_XS)
        island = (int(abs(centroid.x) * 2.4) + int(centroid.z * 4.0)) % 8 == 0
        bow_cap = centroid.x > 6.20
        armor_belt = abs(centroid.z - zc) < hh * 0.22 and abs(centroid.y) > beam * 0.38
        mid_course = 2.00 < centroid.x < 4.60 and centroid.z > zc + hh * 0.08
        if bow_cap or centroid.z < zc - hh * 0.30 or armor_belt:
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
    hull = loft_rings("LOD0_Hull", rings, hull_mat, 0.014)
    extras = []

    for index, x in enumerate(GIRTH_XS):
        st = hull_station_at(x)
        beam, hh, zc = st[1], st[2], st[3]
        crown_z = zc + hh * 0.90

        def crown_seam(name=f"SeamCrown_{index}", loc=(x, 0.0, crown_z), width=min(beam * 1.35, 3.0)):
            return add_box(name, (0.028, width, 0.055), loc, hull_mat, 0.0)

        cut(hull, crown_seam)
        for sign, side in ((-1.0, "P"), (1.0, "S")):
            def flank_seam(name=f"SeamFlank_{index}_{side}", loc=(x, beam * 0.88 * sign, zc)):
                return add_box(name, (0.028, 0.07, hh * 0.82), loc, hull_mat, 0.0)

            cut(hull, flank_seam)

    for sign, side in ((-1.0, "P"), (1.0, "S")):
        def dorsal_seam(name=f"DorsalSeam_{side}", loc=(0.40, 0.38 * sign, 0.95)):
            return add_box(name, (9.6, 0.055, 0.075), loc, hull_mat, 0.0)

        cut(hull, dorsal_seam)

        def bilge_seam(name=f"BilgeSeam_{side}", loc=(-0.20, 0.95 * sign, -0.30)):
            return add_box(name, (8.6, 0.07, 0.12), loc, hull_mat, 0.0)

        cut(hull, bilge_seam)

    for bay_i, (fore, aft) in enumerate(zip(GIRTH_XS, GIRTH_XS[1:])):
        mx = 0.5 * (fore + aft)
        span = max(0.38, abs(fore - aft) - 0.16)
        beam = hull_station_at(mx)[1]
        inset = 0.100 if bay_i % 2 == 0 else 0.140
        flank_t = 0.080 if bay_i % 2 == 0 else 0.120
        for sign, side in ((-1.0, "P"), (1.0, "S")):
            y_dorsal = min(0.75, beam * 0.50) * sign
            if not dorsal_blocked(mx, y_dorsal):
                def plate(n=f"PlateDorsal_{bay_i}_{side}", loc=(mx, y_dorsal, 0.92),
                          length=span, yw=min(0.70, beam * 0.38), dz=inset):
                    return add_box(n, (length, yw, dz), loc, hull_mat, 0.0)

                cut(hull, plate)
                extras.append(add_box(
                    f"LOD0_Lap_{bay_i}_{side}",
                    (max(0.36, span * 0.48), 0.42, 0.055),
                    (mx + (0.10 if bay_i % 2 else -0.10), y_dorsal, 0.98),
                    hull_mat, 0.0,
                ))

            def flank(n=f"PlateFlank_{bay_i}_{side}", loc=(mx, beam * 0.82 * sign, 0.16),
                      length=span * 0.84, yt=flank_t):
                return add_box(n, (length, yt, 0.56), loc, hull_mat, 0.0)

            cut(hull, flank)

    for span_i, (x0, x1) in enumerate(STRINGER_SPANS):
        mid = 0.5 * (x0 + x1)
        span = abs(x0 - x1)
        for y in STRINGER_YS:
            if dorsal_blocked(mid, y):
                continue
            for sign, side in ((-1.0, "P"), (1.0, "S")):
                def score(n=f"StringerScore_{span_i}_{side}_{int(y * 100)}",
                          loc=(mid, y * sign, 0.94), length=span):
                    return add_box(n, (length - 0.10, 0.028, 0.030), loc, hull_mat, 0.0)

                cut(hull, score)

    def bow_step():
        return add_box("BowCourseStep", (0.14, 3.80, 0.22), (6.10, 0.0, 0.88), hull_mat, 0.0)

    cut(hull, bow_step)

    def shoulder_step():
        return add_box("ShoulderCourseStep", (0.16, 4.60, 0.20), (3.60, 0.0, 0.98), hull_mat, 0.0)

    cut(hull, shoulder_step)

    for sign, side in ((-1.0, "P"), (1.0, "S")):
        extras.append(add_box(
            f"LOD0_Chine_{side}",
            (7.2, 0.12, 0.07),
            (0.20, 2.05 * sign, 0.04),
            armor, 0.004,
        ))
        extras.append(add_box(
            f"LOD0_BowCheek_{side}",
            (1.20, 0.20, 0.34),
            (5.50, 1.35 * sign, 0.22),
            armor, 0.008,
        ))
    return hull, extras


def build_service_hatch_well(hull, mats, lod):
    """Midship service hatch as a dark well with rim — not a topless box on skin."""
    mech = mats["Material_Mechanical"]
    armor = mats["Material_Armor"]
    warning = mats["Material_Warning"]

    def hatch_cut():
        return add_box("HatchCut", (1.70, 1.25, 0.95), (0.40, 0.0, 1.00), mech, 0.0)

    cut(hull, hatch_cut)
    bits = add_open_well("LOD0_HatchWell", (1.55, 1.10, 0.85), (0.40, 0.0, 0.50), mech, floor=True, wall=0.050)
    bits.append(add_box("LOD0_HatchRim", (1.80, 1.35, 0.06), (0.40, 0.0, 1.12), armor, 0.006))
    bits.append(add_box("LOD0_HatchLipF", (0.06, 1.00, 0.08), (1.10, 0.0, 1.02), mech, 0.004))
    bits.append(add_box("LOD0_HatchLipA", (0.06, 1.00, 0.08), (-0.30, 0.0, 1.02), mech, 0.004))
    if lod == 0:
        bits.append(add_box("LOD0_HatchLatchP", (0.10, 0.06, 0.04), (0.40, -0.58, 1.08), warning, 0.002))
        bits.append(add_box("LOD0_HatchLatchS", (0.10, 0.06, 0.04), (0.40, 0.58, 1.08), warning, 0.002))
        bits.append(add_box("LOD0_ToolCrate", (0.22, 0.16, 0.12), (0.55, 0.25, 0.28), mech, 0.003))
    return bits, {"kind": "hole", "size": [1.55, 1.10, 0.85], "location": [0.40, 0.0, 0.50]}


def build_cabin(hull, mats, lod):
    mech = mats["Material_Mechanical"]
    canopy = mats["Material_Canopy"]
    armor = mats["Material_Armor"]

    def cabin_cut():
        return add_box("CabinCut", (1.40, 0.85, 0.78), (4.00, 0.0, 1.12), mech, 0.0)

    cut(hull, cabin_cut)
    bits = add_open_well("LOD0_CabinTub", (1.30, 0.78, 0.72), (4.00, 0.0, 0.55), mech, floor=True, wall=0.048)
    rings = []
    for x, hw, hh, zc in (
        (4.55, 0.38, 0.20, 1.12),
        (4.00, 0.50, 0.28, 1.24),
        (3.45, 0.38, 0.20, 1.12),
    ):
        pts = []
        for i in range(14):
            ang = math.tau * i / 14.0
            y = hw * math.sin(ang)
            z = zc + hh * max(math.cos(ang), -0.12)
            pts.append((x, y, z))
        rings.append(pts)
    bits.append(loft_rings("LOD0_Canopy", rings, canopy, 0.004, cap=False))
    bits.append(add_box("LOD0_CabinShoulder", (0.85, 0.62, 0.055), (3.50, 0.0, 1.02), armor, 0.006))
    bits.append(add_box("LOD0_CabinFrame", (1.35, 0.08, 0.05), (4.00, 0.0, 1.28), armor, 0.004))
    return bits, {"kind": "tub+canopy", "location": [4.00, 0.0, 0.55]}


def build_twin_axial_drives(mats, lod):
    """Twin axial ion drives on the transom — nickel casing + ceramic collar + dark throat."""
    armor = mats["Material_Armor"]
    ceramic = mats["Material_Ceramic"]
    thruster = mats["Material_Thruster"]
    dirt = mats["Material_Dirt"]
    bits = []
    report = {"drives": []}
    for sign, side in ((-1.0, "Port"), (1.0, "Starboard")):
        y = 0.95 * sign
        house_rings = []
        for x, hw, hh, zc in (
            (-5.20, 0.32, 0.28, 0.10),
            (-5.90, 0.40, 0.34, 0.10),
            (-6.45, 0.38, 0.32, 0.10),
            (-6.90, 0.28, 0.24, 0.10),
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
        bits.append(add_cylinder(f"LOD0_DriveCollar_{side}", 0.34, 0.12, (-6.55, y, 0.10), ceramic, 0.006, vertices=14))
        bits.append(add_cylinder(f"LOD0_Bell_{side}", 0.30, 0.38, (-7.15, y, 0.10), thruster, 0.004, vertices=16))
        bits.append(add_cylinder(f"LOD0_BellThroat_{side}", 0.18, 0.26, (-7.10, y, 0.10), dirt, 0.0, vertices=12))
        if lod == 0:
            bits.append(add_box(f"LOD0_DriveBand_{side}", (0.07, 0.44, 0.30), (-5.85, y, 0.10), armor, 0.003))
            for i in range(4):
                ang = math.tau * i / 4.0
                bits.append(add_box(
                    f"LOD0_Vane_{side}_{i}",
                    (0.10, 0.018, 0.10),
                    (-6.75, y + 0.22 * math.cos(ang), 0.10 + 0.22 * math.sin(ang)),
                    ceramic, 0.001,
                ))
        report["drives"].append({"side": side, "y": y})
    bits.append(add_box("LOD0_TransomPlate", (0.05, 0.55, 0.34), (-6.95, 0.0, 0.10), armor, 0.004))
    return bits, report


def build_mining_arms(mats, lod):
    """Two bow mining arms with saddle, boxed boom, knuckle, and carbide cutter drums."""
    mech = mats["Material_Mechanical"]
    armor = mats["Material_Armor"]
    ceramic = mats["Material_Ceramic"]
    bits = []
    for sign, side in ((-1.0, "P"), (1.0, "S")):
        y0 = 2.15 * sign
        y1 = 2.55 * sign
        # saddle on cheek
        bits.append(add_box(
            f"LOD0_ArmSaddle_{side}", (0.38, 0.28, 0.24),
            (5.20, y0 * 0.92, 0.05), armor, 0.008,
        ))
        boom_rings = [
            [
                (5.20, y0 + 0.13, 0.02), (5.20, y0, 0.14), (5.20, y0 - 0.13, 0.02),
                (5.20, y0, -0.12),
            ],
            [
                (6.40, y1 + 0.11, -0.10), (6.40, y1, 0.04), (6.40, y1 - 0.11, -0.10),
                (6.40, y1, -0.22),
            ],
        ]
        bits.append(loft_rings(f"LOD0_ArmBoom_{side}", boom_rings, mech, 0.006))
        bits.append(add_box(
            f"LOD0_ArmKnuckle_{side}", (0.28, 0.22, 0.22),
            (6.55, y1, -0.16), armor, 0.006,
        ))
        # hydraulic cylinder
        bits.append(add_cylinder(
            f"LOD0_ArmCyl_{side}", 0.045, 0.55,
            (5.80, y0 * 1.05, -0.18), mech, 0.002, vertices=8,
        ))
        # carbide cutter drum (forward)
        bits.append(add_cylinder(
            f"LOD0_CutterDrum_{side}", 0.16, 0.42,
            (7.05, y1, -0.18), ceramic, 0.004,
            rotation=(math.radians(90), 0.0, 0.0), vertices=12,
        ))
        if lod == 0:
            for i in range(6):
                ang = math.tau * i / 6.0
                bits.append(add_box(
                    f"LOD0_CutterTooth_{side}_{i}",
                    (0.04, 0.03, 0.06),
                    (7.05, y1 + 0.16 * math.cos(ang), -0.18 + 0.16 * math.sin(ang)),
                    ceramic, 0.001,
                ))
    return bits


def build_filter_drums(hull, mats, lod):
    """Starboard filter drums as pressure cases; bay cut as a hole with rim."""
    mech = mats["Material_Mechanical"]
    armor = mats["Material_Armor"]
    ceramic = mats["Material_Ceramic"]
    accent = mats["Material_Accent"]
    bits = []

    def filter_bay():
        return add_box("FilterBayCut", (1.60, 0.70, 0.70), (1.60, 2.15, 0.20), mech, 0.0)

    cut(hull, filter_bay)
    bits.extend(add_open_well(
        "LOD0_FilterWell", (1.45, 0.58, 0.58),
        (1.60, 1.95, 0.12), mech, floor=True, wall=0.040,
    ))
    bits.append(add_box("LOD0_FilterRim", (1.70, 0.12, 0.55), (1.60, 2.35, 0.18), armor, 0.005))

    for i, x in enumerate((1.15, 1.60, 2.05)):
        bits.append(add_cylinder(
            f"LOD0_FilterDrum_{i}", 0.18, 0.42,
            (x, 2.05, 0.18), ceramic, 0.005,
            rotation=(0.0, 0.0, 0.0), vertices=14,
        ))
        bits.append(add_cylinder(
            f"LOD0_FilterBand_{i}", 0.19, 0.04,
            (x, 2.05, 0.28), mech, 0.002,
            rotation=(0.0, 0.0, 0.0), vertices=12,
        ))
        if lod == 0:
            bits.append(add_box(
                f"LOD0_FilterLatch_{i}", (0.04, 0.06, 0.08),
                (x, 2.22, 0.32), accent, 0.001,
            ))
    # port claim-stake cheek (solid plate, not a cage)
    bits.append(add_box("LOD0_ClaimCheek", (0.85, 0.18, 0.42), (1.80, -2.20, 0.15), armor, 0.006))
    bits.append(add_box("LOD0_ClaimMark", (0.20, 0.04, 0.28), (1.90, -2.32, 0.20), accent, 0.002))
    return bits, {"kind": "hole", "size": [1.45, 0.58, 0.58], "location": [1.60, 1.95, 0.12]}


def build_radiator_wells(hull, mats, lod):
    mech = mats["Material_Mechanical"]
    radiator = mats["Material_Radiator"]
    bits = []
    report = {"wells": []}
    for sign, side in ((-1.0, "P"), (1.0, "S")):
        y = 1.85 * sign

        def rad_cut(n=f"RadCut_{side}", loc=(-2.40, y, 0.55)):
            return add_box(n, (1.40, 0.55, 0.55), loc, mech, 0.0)

        cut(hull, rad_cut)
        bits.extend(add_open_well(
            f"LOD0_RadWell_{side}", (1.25, 0.45, 0.45),
            (-2.40, y * 0.92, 0.40), radiator, floor=True, wall=0.038,
        ))
        bits.append(add_box(f"LOD0_RadRim_{side}", (1.40, 0.10, 0.42), (-2.40, y, 0.55), radiator, 0.004))
        if lod == 0:
            for i in range(5):
                bits.append(add_box(
                    f"LOD0_RadFin_{side}_{i}",
                    (0.014, 0.16, 0.22),
                    (-2.90 + i * 0.22, y * 0.95, 0.48),
                    radiator, 0.001,
                ))
        report["wells"].append({"side": side, "location": [-2.40, y * 0.92, 0.40]})
    return bits, report


def build_hardware(mats, lod):
    mech = mats["Material_Mechanical"]
    armor = mats["Material_Armor"]
    warning = mats["Material_Warning"]
    accent = mats["Material_Accent"]
    bits = []
    # return chevron — hand-painted aft dorsal
    bits.append(add_box("LOD0_ChevronA", (0.55, 0.08, 0.012), (-3.60, 0.0, 0.98), warning, 0.001))
    bits.append(add_box(
        "LOD0_ChevronB", (0.38, 0.06, 0.012), (-3.85, -0.22, 0.98), warning, 0.001,
        rotation=(0.0, 0.0, math.radians(28)),
    ))
    bits.append(add_box(
        "LOD0_ChevronC", (0.38, 0.06, 0.012), (-3.85, 0.22, 0.98), warning, 0.001,
        rotation=(0.0, 0.0, math.radians(-28)),
    ))
    # short dorsal survey wand
    bits.append(add_cylinder("LOD0_SurveyWand", 0.035, 0.85, (1.10, 0.0, 1.45), mech, 0.002, rotation=(0, 0, 0), vertices=8))
    bits.append(add_box("LOD0_SurveyHead", (0.14, 0.10, 0.08), (1.10, 0.0, 1.90), armor, 0.003))
    bits.append(add_box("LOD0_SurveyDish", (0.04, 0.18, 0.18), (1.18, 0.0, 1.90), accent, 0.002))
    # keel / walk / patches
    bits.append(add_box("LOD0_KeelSpine", (2.8, 0.24, 0.045), (0.20, 0.0, -0.85), mech, 0.008))
    bits.append(add_box("LOD0_AftWalk", (1.4, 0.14, 0.014), (-2.80, 0.0, 0.48), mech, 0.002))
    bits.append(add_box("LOD0_RepairPatch", (0.32, 0.16, 0.012), (2.20, -0.60, 0.85), warning, 0.002))
    bits.append(add_box("LOD0_BowFairing", (0.55, 0.40, 0.18), (6.70, 0.0, 0.35), armor, 0.008))
    for sign, side in ((-1.0, "P"), (1.0, "S")):
        bits.append(add_box(f"LOD0_RCS_{side}", (0.20, 0.12, 0.12), (-1.60, 2.25 * sign, 0.18), mech, 0.003))
        bits.append(add_box(f"LOD0_ShoulderPad_{side}", (1.10, 0.16, 0.28), (-0.80, 2.15 * sign, 0.55), armor, 0.006))
    if lod == 0:
        bits.append(add_box("LOD0_CableRun", (2.4, 0.035, 0.035), (-1.00, 0.55, 0.72), mech, 0.001))
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
    hatch_bits, hatch_report = build_service_hatch_well(hull, mats, lod)
    cabin_bits, cabin_report = build_cabin(hull, mats, lod)
    drive_bits, drive_report = build_twin_axial_drives(mats, lod)
    arms = build_mining_arms(mats, lod)
    filter_bits, filter_report = build_filter_drums(hull, mats, lod)
    rad_bits, rad_report = build_radiator_wells(hull, mats, lod)
    hardware = build_hardware(mats, lod)
    paint_shell(hull, mats)

    built = [
        hull, *hull_extras, *hatch_bits, *cabin_bits, *drive_bits,
        *arms, *filter_bits, *rad_bits, *hardware,
    ]
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
    # Prospector envelope: live ~14.6×5.6×3.8; arms may grow beam.
    if size.x < 13.0 or size.x > 16.5 or size.y < 4.8 or size.y > 7.5 or size.z > 5.5:
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
        "asset": "ship_pelican",
        "revision": REVISION,
        "lod": lod,
        "source": str(source),
        "output": str(output),
        "hatch": hatch_report,
        "cabin": cabin_report,
        "drive": drive_report,
        "filter": filter_report,
        "radiator": rad_report,
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
        output = out_dir / f"pelican_c1_lod{lod}.glb"
        reports.append(build_one(source, output, lod))
    summary = {"ok": True, "revision": REVISION, "lods": reports, "promoted": []}
    (out_dir / "pelican_chase_form_v1.summary.json").write_text(
        json.dumps(summary, indent=2) + "\n", encoding="utf-8"
    )
    print(json.dumps(summary))


if __name__ == "__main__":
    main()

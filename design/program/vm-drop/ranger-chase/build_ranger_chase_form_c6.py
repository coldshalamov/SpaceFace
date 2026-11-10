"""Ranger chase-camera outbox C6 form rebuild.

Imports the live Ranger only for root, sockets, and collision. Replaces the
render meshes with one closed explorer that reads at the live chase camera.
C6 continues directly from C5 with a chunkier stepped bow, heavier integrated
fore cheek gun houses, broad interlocked armor courses, and stronger formed
skin values. It does not load or modify Hitch/Kestrel/Hornet/Drifter.

C6 keeps the proven gates: CAGE_READ NO, TUBE_PADDLE NO, wells HOLES.

Does not rescale the root — live sockets already sit in the ~18 m authored
space. Runtime display scale is applied by the chase still helper, not here.
"""
from __future__ import annotations

import argparse
import json
import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector

REVISION = "chase_form_v6a"
ROOT_DIR = Path(__file__).resolve().parents[4]
FAMILY = ROOT_DIR / "assets" / "ships" / "fleet_player_bodies_v1" / "ranger"
LIVE_PARTS = ROOT_DIR / "assets" / "ships" / "parts" / "wholeships"

KEEP_SEPARATE = (
    "LOD0_Glass",
    "LOD0_Bell_",
)

# Sand-grey explorer. Mid-heavy like Hitch. Never Deck-on-crown. Never Armor-by-|y|.
# C17: clay overrides every slot. Outer shell is one Hull value; Armor is keel.
HONEST = {
    "Material_Hull": {"color": (0.245, 0.224, 0.190), "metallic": 0.14, "roughness": 0.48, "role": "hull"},
    "Material_Armor": {"color": (0.040, 0.038, 0.036), "metallic": 0.22, "roughness": 0.58, "role": "armor"},
    "Material_Course": {"color": (0.118, 0.108, 0.092), "metallic": 0.18, "roughness": 0.50, "role": "hull"},
    "Material_Mark": {"color": (0.075, 0.255, 0.238), "metallic": 0.10, "roughness": 0.42, "role": "hull"},
    "Material_Canopy": {"color": (0.012, 0.016, 0.020), "metallic": 0.0, "roughness": 0.06, "role": "glass"},
    "Material_Ceramic": {"color": (0.08, 0.072, 0.062), "metallic": 0.06, "roughness": 0.64, "role": "ceramic"},
    "Material_Mechanical": {"color": (0.052, 0.054, 0.056), "metallic": 0.38, "roughness": 0.48, "role": "mechanical"},
    "Material_Radiator": {"color": (0.048, 0.040, 0.036), "metallic": 0.20, "roughness": 0.54, "role": "radiator"},
    "Material_Thruster": {"color": (0.030, 0.030, 0.034), "metallic": 0.26, "roughness": 0.50, "role": "thruster"},
    "Material_Accent": {"color": (0.10, 0.62, 0.58), "metallic": 0.04, "roughness": 0.30, "role": "accent", "emit": 3.4},
    "Material_Warning": {"color": (0.78, 0.36, 0.10), "metallic": 0.02, "roughness": 0.34, "role": "warning", "emit": 2.4},
    "Material_Dirt": {"color": (0.068, 0.054, 0.042), "metallic": 0.02, "roughness": 0.78, "role": "dirt"},
}

# C2: fewer girth stations. Shallow scores in a sheet — not wrapping rings (C1 cage).
GIRTH_XS = (5.55, 1.80, -1.50, -5.20)  # C2b: four shallow scores, not a ring cage
MARK_XS = (2.15, -2.55)
STRINGER_YS = (0.48, 0.86)
STRINGER_SPANS = ((7.10, 4.20), (3.20, -0.10), (-1.90, -5.70))


def parse_args(argv):
    parser = argparse.ArgumentParser()
    parser.add_argument("--source-lod0", type=Path, default=LIVE_PARTS / "ranger_production_v1.glb")
    parser.add_argument("--source-lod1", type=Path, default=LIVE_PARTS / "ranger_production_v1_lod1.glb")
    parser.add_argument("--source-lod2", type=Path, default=LIVE_PARTS / "ranger_production_v1_lod2.glb")
    parser.add_argument("--out-dir", type=Path, default=Path(__file__).resolve().parent)
    parser.add_argument("--lods", default="0,1,2")
    return parser.parse_args(argv)


def find_root():
    named = bpy.data.objects.get("RANGER_LOD0_ROOT")
    if named:
        return named
    matches = [
        obj for obj in bpy.data.objects
        if obj.type == "EMPTY" and "RANGER" in obj.name.upper() and "ROOT" in obj.name.upper()
    ]
    if len(matches) == 1:
        return matches[0]
    raise RuntimeError("missing Ranger root")


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
    """Convex formed explorer YZ. Planform beam reads from the chase camera.

    C3b: chase is 60° dorsal — max half-beam must live near the crown/deck, not
    only at mid-height (that hid C3a planform as a tube). Flat deck carries the
    explorer planform. Sideboard is the slope — not a paddle lobe. No vertical slab.
    """
    x, beam, hh, zc, keel, flat, box, _chine = st
    flat = max(0.0, min(1.0, float(flat)))
    box = max(0.0, min(1.0, float(box)))
    beam = max(0.18, float(beam))
    crown = zc + hh * (0.88 - 0.06 * flat)
    keel_z = zc - hh - keel * (1.0 - 0.16 * box)
    # Beam height sits high so dorsal chase silhouette owns the planform width.
    beam_z = zc + hh * (0.28 + 0.22 * flat - 0.10 * box)

    def half(sign):
        return [
            (x, sign * beam * (0.28 + 0.18 * flat), crown - hh * 0.02),
            (x, sign * beam * (0.62 + 0.16 * flat), crown - hh * 0.10),
            (x, sign * beam * (0.88 + 0.06 * flat), zc + hh * 0.42),
            (x, sign * beam, beam_z),
            (x, sign * beam * (0.92 - 0.04 * box), zc + hh * 0.06),
            (x, sign * beam * (0.78 - 0.08 * box), zc - hh * 0.22),
            (x, sign * beam * (0.52 - 0.10 * box), zc - hh * 0.52),
            (x, sign * beam * (0.28 - 0.06 * box), zc - hh * 0.78),
            (x, sign * beam * 0.12, keel_z),
        ]

    pts = half(1.0)
    for a, b in zip(pts, pts[1:]):
        if abs(a[1] - b[1]) < 0.05 and abs(a[2] - b[2]) > 0.22:
            raise RuntimeError(
                f"vertical slab in YZ at x={a[0]:.2f} dy={abs(a[1] - b[1]):.3f} dz={abs(a[2] - b[2]):.3f}"
            )
    return [(x, 0.0, crown)] + pts + [(x, 0.0, keel_z + keel * 0.08)] + list(reversed(half(-1.0)))


def gun_house_ring(x, sign, y_outer, zc, hw, hh):
    """YZ section of a formed bow cheek house — grown from the shell, not a box."""
    s = float(sign)
    return [
        (x, s * (y_outer - hw * 1.15), zc + hh),
        (x, s * (y_outer - hw * 0.18), zc + hh * 0.70),
        (x, s * y_outer, zc + hh * 0.16),
        (x, s * (y_outer - hw * 0.08), zc - hh * 0.40),
        (x, s * (y_outer - hw * 0.38), zc - hh),
        (x, s * (y_outer - hw * 1.18), zc - hh * 0.26),
        (x, s * (y_outer - hw * 1.22), zc + hh * 0.36),
    ]


def pylon_ring(x, y, z, hw, hh):
    """Horizontal section of the formed survey pylon — not a stick."""
    return [
        (x + hw, y, z),
        (x + hw * 0.42, y + hh, z),
        (x - hw * 0.42, y + hh, z),
        (x - hw, y, z),
        (x - hw * 0.42, y - hh, z),
        (x + hw * 0.42, y - hh, z),
    ]


def greenhouse_ring(x, hw, hh, zc):
    pts = []
    for i in range(16):
        ang = math.tau * i / 16.0
        y = hw * math.sin(ang)
        z = zc + hh * max(math.cos(ang), -0.10)
        pts.append((x, y, z))
    return pts


def side_lip_ring(x, sign, half_y, rise=0.04, outer=0.12):
    hw, hh, zc = hull_half_at(x)
    z_crown = zc + hh * 0.90
    y = half_y * sign
    return [
        (x, y - 0.04 * sign, z_crown - 0.10),
        (x, y + outer * sign, z_crown + rise),
        (x, y + outer * 0.50 * sign, z_crown - 0.06),
        (x, y - 0.02 * sign, z_crown - 0.16),
    ]


def end_lip_ring(y, x_pos, sign_x, rise=0.03, outer=0.10):
    _hw, hh, zc = hull_half_at(x_pos)
    z_crown = zc + hh * 0.90
    return [
        (x_pos - 0.03 * sign_x, y, z_crown - 0.10),
        (x_pos + outer * sign_x, y, z_crown + rise),
        (x_pos + outer * 0.50 * sign_x, y, z_crown - 0.06),
        (x_pos - 0.02 * sign_x, y, z_crown - 0.16),
    ]


def mullion_long_ring(x, y, z, half_w=0.06, drop=0.10):
    return [
        (x, y - half_w, z),
        (x, y + half_w, z),
        (x, y + half_w, z - drop),
        (x, y - half_w, z - drop),
    ]


def mullion_athwart_ring(x, y, z, half_w=0.06, drop=0.10):
    return [
        (x - half_w, y, z),
        (x + half_w, y, z),
        (x + half_w, y, z - drop),
        (x - half_w, y, z - drop),
    ]


def airfoil(x_le, y, z, chord, thick):
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
        add_cylinder(f"{name}_FitFore", radius * 1.45, 0.08, tuple(pts[0]), material, 0.0, (start_rot.x, start_rot.y, start_rot.z), 8),
        add_cylinder(f"{name}_FitAft", radius * 1.45, 0.08, tuple(pts[-1]), material, 0.0, (end_rot.x, end_rot.y, end_rot.z), 8),
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
        emit = float(spec.get("emit") or 0.0)
        if "Emission Strength" in bsdf.inputs:
            bsdf.inputs["Emission Strength"].default_value = emit
        if emit > 0.0 and "Emission Color" in bsdf.inputs:
            bsdf.inputs["Emission Color"].default_value = (*spec["color"], 1.0)
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


# C5 formed explorer. C4 blunt shell kept (TUBE_PADDLE NO). Knuckle pairs are
# load-path breaks / armor-course steps in the loft — not wrapping rings.
# densify mids stay low so those knuckles survive. Planform still lives in the
# primary loft (no paddle lobes, no new fins).
# (x, beam, hh, zc, keel, flat, box, chine)
HULL_STATIONS = [
    # C6 bow is an assembled blunt stack: broad cap, abrupt armored shoulder,
    # then a second load-path shoulder. Width is carried by the shell itself.
    (7.15, 2.42, 0.78, 0.12, 0.08, 0.72, 0.50, 0.26),
    (6.78, 2.50, 0.80, 0.13, 0.08, 0.75, 0.50, 0.26),
    (6.56, 2.98, 1.02, 0.22, 0.10, 0.84, 0.54, 0.30),
    (5.88, 3.30, 1.14, 0.25, 0.11, 0.91, 0.56, 0.34),
    (5.08, 3.42, 1.16, 0.24, 0.11, 0.94, 0.58, 0.36),
    # A real second shoulder, not a smooth capsule interpolation.
    (4.72, 3.40, 1.14, 0.22, 0.11, 0.93, 0.58, 0.35),
    (4.48, 3.23, 1.00, 0.17, 0.10, 0.88, 0.56, 0.34),
    (3.55, 3.26, 1.04, 0.18, 0.10, 0.90, 0.56, 0.34),
    (3.30, 3.10, 0.94, 0.15, 0.10, 0.86, 0.55, 0.33),
    (1.80, 3.24, 0.98, 0.16, 0.10, 0.90, 0.55, 0.34),
    (0.20, 3.38, 1.04, 0.18, 0.10, 0.94, 0.55, 0.35),
    (-1.50, 3.30, 0.98, 0.16, 0.10, 0.90, 0.53, 0.33),
    (-3.40, 3.12, 0.94, 0.16, 0.09, 0.82, 0.51, 0.29),
    (-5.20, 2.74, 0.90, 0.16, 0.08, 0.66, 0.47, 0.25),
    (-6.80, 2.30, 0.82, 0.16, 0.08, 0.50, 0.43, 0.21),
    (-8.45, 1.34, 0.62, 0.12, 0.06, 0.32, 0.34, 0.15),
]


def densify_stations(stations, mids=22):
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
        island = (int(abs(centroid.x) * 2.4) + int(centroid.z * 4.0)) % 8 == 0
        bow_cap = centroid.x > 6.54
        armor_belt = abs(centroid.z - zc) < hh * 0.22 and abs(centroid.y) > beam * 0.38
        mid_course = 3.20 < centroid.x < 4.75 and centroid.z > zc + hh * 0.12
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


def dorsal_blocked(x, y):
    if abs(x - 3.90) < 1.28 and abs(y) < 0.58:
        return True
    if abs(x - 0.70) < 0.88 and abs(y) < 0.50:
        return True
    return False


def build_hull(mats):
    hull_mat = mats["Material_Hull"]
    rings = [shell_ring(st) for st in densify_stations(HULL_STATIONS)]
    hull = loft_rings("LOD0_Hull", rings, hull_mat, 0.014)
    extras = []
    # C2: shallow crown + flank scores. Do not wrap a 2 m hoop through the hull
    # (that was the C1 cage).
    for index, x in enumerate(GIRTH_XS):
        st = hull_station_at(x)
        beam = st[1]
        hh = st[2]
        zc = st[3]
        crown_z = zc + hh * 0.90

        def crown_seam(name=f"SeamCrown_{index}", loc=(x, 0.0, crown_z), width=min(beam * 1.35, 2.6)):
            return add_box(name, (0.028, width, 0.055), loc, hull_mat, 0.0)

        cut(hull, crown_seam)
        for sign, side in ((-1.0, "P"), (1.0, "S")):
            def flank_seam(name=f"SeamFlank_{index}_{side}", loc=(x, beam * 0.86 * sign, zc)):
                return add_box(name, (0.028, 0.07, hh * 0.85), loc, hull_mat, 0.0)

            cut(hull, flank_seam)
    for sign, side in ((-1.0, "P"), (1.0, "S")):
        def dorsal_seam(name=f"DorsalSeam_{side}", loc=(0.40, 0.28 * sign, 0.92)):
            return add_box(name, (10.4, 0.055, 0.08), loc, hull_mat, 0.0)
        cut(hull, dorsal_seam)
        def bilge_seam(name=f"BilgeSeam_{side}", loc=(-0.20, 0.82 * sign, -0.28)):
            return add_box(name, (9.2, 0.07, 0.12), loc, hull_mat, 0.0)
        cut(hull, bilge_seam)

    for bay_i, (fore, aft) in enumerate(zip(GIRTH_XS, GIRTH_XS[1:])):
        mx = 0.5 * (fore + aft)
        span = max(0.42, abs(fore - aft) - 0.18)
        beam = hull_station_at(mx)[1]
        inset = 0.100 if bay_i % 2 == 0 else 0.150
        flank_t = 0.080 if bay_i % 2 == 0 else 0.120
        for sign, side in ((-1.0, "P"), (1.0, "S")):
            y_dorsal = min(0.62, beam * 0.55) * sign
            if not dorsal_blocked(mx, y_dorsal):
                def plate(n=f"PlateDorsal_{bay_i}_{side}", loc=(mx, y_dorsal, 0.88), length=span, yw=min(0.62, beam * 0.42), dz=inset):
                    return add_box(n, (length, yw, dz), loc, hull_mat, 0.0)
                cut(hull, plate)
                def score_a(n=f"ScoreA_{bay_i}_{side}", loc=(mx + span * 0.16, y_dorsal, 0.90)):
                    return add_box(n, (0.036, 0.36, 0.032), loc, hull_mat, 0.0)
                def score_b(n=f"ScoreB_{bay_i}_{side}", loc=(mx - span * 0.16, y_dorsal, 0.90)):
                    return add_box(n, (0.036, 0.36, 0.032), loc, hull_mat, 0.0)
                cut(hull, score_a)
                cut(hull, score_b)
                shift = -0.12 if bay_i % 2 == 0 else 0.12
                extras.append(add_box(
                    f"LOD0_Lap_{bay_i}_{side}",
                    (max(0.36, span * 0.48), 0.42, 0.058),
                    (mx + shift, y_dorsal, 0.94),
                    hull_mat, 0.0,
                ))
            def flank(n=f"PlateFlank_{bay_i}_{side}", loc=(mx, beam * 0.80 * sign, 0.18), length=span * 0.86, yt=flank_t):
                return add_box(n, (length, yt, 0.58), loc, hull_mat, 0.0)
            cut(hull, flank)

    for span_i, (x0, x1) in enumerate(STRINGER_SPANS):
        mid = 0.5 * (x0 + x1)
        span = abs(x0 - x1)
        for y in STRINGER_YS:
            if dorsal_blocked(mid, y):
                continue
            for sign, side in ((-1.0, "P"), (1.0, "S")):
                def score(n=f"StringerScore_{span_i}_{side}_{int(y * 100)}", loc=(mid, y * sign, 0.90), length=span):
                    return add_box(n, (length - 0.10, 0.028, 0.032), loc, hull_mat, 0.0)
                cut(hull, score)

    for sign, side in ((-1.0, "P"), (1.0, "S")):
        def green_lip(n=f"GreenLipScore_{side}", loc=(3.90, 0.62 * sign, 0.98)):
            return add_box(n, (1.85, 0.055, 0.048), loc, hull_mat, 0.0)
        cut(hull, green_lip)
        def survey_lip(n=f"SurveyLipScore_{side}", loc=(0.70, 0.56 * sign, 0.92)):
            return add_box(n, (1.20, 0.050, 0.044), loc, hull_mat, 0.0)
        cut(hull, survey_lip)

    # C6: deep but local course joints expose the two bow shoulders. They do
    # not continue around the belly, so this cannot read as a wrapping cage.
    def bow_step():
        return add_box("BowCourseStep", (0.15, 4.95, 0.24), (6.56, 0.0, 0.83), hull_mat, 0.0)
    cut(hull, bow_step)
    def shoulder_step():
        return add_box("ShoulderCourseStep", (0.18, 5.30, 0.22), (4.60, 0.0, 0.92), hull_mat, 0.0)
    cut(hull, shoulder_step)
    def mid_break():
        return add_box("MidLoadBreak", (0.72, 1.70, 0.18), (3.34, 0.0, 0.89), hull_mat, 0.0)
    cut(hull, mid_break)
    def bow_recess():
        return add_box("BowRecess", (1.12, 1.44, 0.20), (5.92, 0.0, 0.96), hull_mat, 0.0)
    cut(hull, bow_recess)

    armor = mats["Material_Armor"]
    course = mats["Material_Course"]
    for sign, side in ((-1.0, "P"), (1.0, "S")):
        extras.append(add_box(
            f"LOD0_CourseBow_{side}",
            (1.34, 0.68, 0.17),
            (5.96, hull_station_at(5.96)[1] * 0.76 * sign, 0.46),
            armor, 0.004,
        ))
        extras.append(add_box(
            f"LOD0_CourseMid_{side}",
            (1.62, 0.46, 0.12),
            (1.35, hull_station_at(1.35)[1] * 0.74 * sign, 0.34),
            armor, 0.004,
        ))
        extras.append(add_box(
            f"LOD0_CourseShoulder_{side}",
            (1.28, 0.52, 0.14),
            (4.86, hull_station_at(4.86)[1] * 0.78 * sign, 0.56),
            course, 0.003,
        ))

    # Broad interlocked dorsal courses carry at play size. These are shallow,
    # partly buried load plates, not small garnish and not transverse hoops.
    for index, (x, y, sx, sy, z, mat_name, yaw) in enumerate((
        (5.58, -1.08, 1.30, 0.74, 1.16, "Material_Course", -4.0),
        (5.58,  1.08, 1.30, 0.74, 1.16, "Material_Course",  4.0),
        (4.72, -1.62, 0.78, 0.94, 1.08, "Material_Armor",  6.0),
        (4.72,  1.62, 0.78, 0.94, 1.08, "Material_Armor", -6.0),
        (2.38, -1.42, 1.42, 0.68, 1.02, "Material_Course", -3.0),
        (2.38,  1.42, 1.42, 0.68, 1.02, "Material_Course",  3.0),
        (-0.48, -1.52, 1.64, 0.74, 0.96, "Material_Armor",  3.0),
        (-0.48,  1.52, 1.64, 0.74, 0.96, "Material_Armor", -3.0),
        (-3.18, -1.22, 1.52, 0.70, 0.86, "Material_Course", -4.0),
        (-3.18,  1.22, 1.52, 0.70, 0.86, "Material_Course",  4.0),
    )):
        extras.append(add_box(
            f"LOD0_FormCourse_{index}", (sx, sy, 0.105), (x, y, z),
            mats[mat_name], 0.012, rotation=(0.0, 0.0, math.radians(yaw)),
        ))
    extras.append(add_box(
        "LOD0_AftSpineCourse", (1.02, 0.94, 0.11), (-4.72, 0.0, 0.84), armor, 0.010,
    ))
    paint_shell(hull, mats)
    return hull, extras


def drive_half_y():
    return hull_station_at(-6.90)[1] * 0.88


def build_nacelles(hull, mats, lod):
    hull_mat = mats["Material_Hull"]
    armor = mats["Material_Armor"]
    ceramic = mats["Material_Ceramic"]
    bits = []
    report = {}
    yc_abs = drive_half_y()
    for sign, tag in ((-1.0, "Port"), (1.0, "Stbd")):
        yc = yc_abs * sign

        def throat(name=f"NacelleThroat_{tag}", loc=(-7.65, yc, 0.22)):
            return add_box(name, (1.35, 0.52, 0.58), loc, hull_mat, 0.0)

        report[f"throat_{tag}"] = cut(hull, throat)
        if lod < 2:
            def slot(name=f"NacelleSlot_{tag}", loc=(-5.40, yc, 0.48)):
                return add_box(name, (1.15, 0.30, 0.24), loc, hull_mat, 0.0)

            report[f"slot_{tag}"] = cut(hull, slot)
        bits.append(add_cylinder(
            f"LOD0_Collar_{tag}", 0.48, 0.16, (-6.95, yc, 0.22), armor, 0.002,
            rotation=(0.0, math.radians(90.0), 0.0), vertices=12,
        ))
        bits.append(add_cylinder(
            f"LOD0_HeatBand_{tag}", 0.40, 0.08, (-7.40, yc, 0.22), ceramic, 0.0,
            rotation=(0.0, math.radians(90.0), 0.0), vertices=12,
        ))
        if lod < 2:
            bits.append(add_box(
                f"LOD0_IntakeGrill_{tag}", (0.10, 0.34, 0.22),
                (-5.20, yc, 0.28), mats["Material_Mechanical"], 0.0,
            ))
            fin_count = 3 if lod == 0 else 2
            for index in range(fin_count):
                bits.append(add_box(
                    f"LOD0_CoolFin_{tag}_{index}",
                    (0.16, 0.06, 0.18),
                    (-5.45 - index * 0.24, yc, 0.58),
                    mats["Material_Radiator"], 0.0,
                ))
    return bits, report


def build_wings(hull, mats, lod):
    """C4 has no separate wing garnish; the shell itself carries side mass."""
    return []


def build_survey_well(hull, mats, lod):
    armor = mats["Material_Armor"]
    mech = mats["Material_Mechanical"]

    def mouth():
        return add_box("SurveyWellCut", (1.46, 0.82, 1.48), (0.70, 0.0, 0.56), armor, 0.0)

    report = {"mouth": cut(hull, mouth)}
    bits = add_open_well("LOD0_SurveyWell", (1.26, 0.68, 0.88), (0.70, 0.0, 0.22), mech, floor=True, wall=0.058)
    well_xs = (1.22, 0.70, 0.18)
    for sign, tag in ((-1.0, "Port"), (1.0, "Stbd")):
        bits.append(loft_rings(
            f"LOD0_SurveyLip_{tag}",
            [side_lip_ring(x, sign, 0.34, rise=0.03, outer=0.08) for x in well_xs],
            mech, 0.003, cap=True,
        ))
    bits.append(loft_rings(
        "LOD0_SurveyLip_Fore",
        [end_lip_ring(y, 1.22, 1.0) for y in (-0.28, 0.0, 0.28)],
        mech, 0.003, cap=True,
    ))
    bits.append(loft_rings(
        "LOD0_SurveyLip_Aft",
        [end_lip_ring(y, 0.18, -1.0) for y in (-0.28, 0.0, 0.28)],
        mech, 0.003, cap=True,
    ))
    return bits, report


def build_greenhouse(hull, mats, lod):
    armor = mats["Material_Armor"]
    mech = mats["Material_Mechanical"]
    hull_mat = mats["Material_Hull"]
    glass = mats["Material_Canopy"]

    def tub():
        return add_box("GreenTubCut", (2.28, 0.94, 1.62), (3.90, 0.0, 0.50), armor, 0.0)

    def windshield():
        return add_box(
            "GreenWindCut", (1.08, 0.64, 1.10), (4.72, 0.0, 0.58), armor, 0.0,
            rotation=(0.0, math.radians(-18.0), 0.0),
        )

    report = {"tub": cut(hull, tub), "windshield": False}
    if lod < 2:
        report["windshield"] = cut(hull, windshield)
    bits = add_open_well("LOD0_Tub", (2.02, 0.78, 0.96), (3.90, 0.0, 0.16), mech, floor=True, wall=0.058)
    green_xs = (4.82, 4.35, 3.90, 3.42)
    for sign, tag in ((-1.0, "Port"), (1.0, "Stbd")):
        bits.append(loft_rings(
            f"LOD0_GreenLip_{tag}",
            [side_lip_ring(x, sign, 0.38, rise=0.025, outer=0.08) for x in green_xs],
            hull_mat, 0.003, cap=True,
        ))
    bits.append(loft_rings(
        "LOD0_GreenLip_Fore",
        [end_lip_ring(y, 4.82, 1.0, rise=0.025, outer=0.08) for y in (-0.32, 0.0, 0.32)],
        hull_mat, 0.003, cap=True,
    ))
    bits.append(loft_rings(
        "LOD0_GreenLip_Aft",
        [end_lip_ring(y, 3.42, -1.0, rise=0.025, outer=0.08) for y in (-0.32, 0.0, 0.32)],
        hull_mat, 0.003, cap=True,
    ))
    if lod < 2:
        visor = loft_rings(
            "LOD0_Glass",
            [
                greenhouse_ring(4.86, 0.22, 0.12, 0.88),
                greenhouse_ring(4.40, 0.36, 0.22, 0.94),
                greenhouse_ring(3.90, 0.38, 0.20, 0.92),
                greenhouse_ring(3.40, 0.26, 0.12, 0.86),
            ],
            glass, 0.002, cap=True,
        )
        bits.append(visor)

        def visor_hatch(name="VisorHatchCut", loc=(3.90, 0.0, 1.08)):
            return add_box(name, (0.36, 0.20, 0.08), loc, glass, 0.0)

        cut(visor, visor_hatch)
        bits.append(loft_rings(
            "LOD0_Mullion_Spine",
            [
                mullion_long_ring(4.60, 0.0, 1.02),
                mullion_long_ring(3.90, 0.0, 1.06),
                mullion_long_ring(3.50, 0.0, 0.98),
            ],
            hull_mat, 0.0, cap=True,
        ))
        bits.append(loft_rings(
            "LOD0_Mullion_Athwart",
            [
                mullion_athwart_ring(3.90, -0.22, 1.00),
                mullion_athwart_ring(3.90, 0.0, 1.04),
                mullion_athwart_ring(3.90, 0.22, 1.00),
            ],
            hull_mat, 0.0, cap=True,
        ))
    return bits, report


def build_mast(mats, lod):
    """Formed survey pylon grown from the shell. Not a stick, not a glowing hoop."""
    armor = mats["Material_Armor"]
    ceramic = mats["Material_Ceramic"]
    hull_mat = mats["Material_Hull"]
    bits = [
        add_box("LOD0_MastFairing", (0.92, 0.68, 0.24), (0.70, 0.0, 0.90), hull_mat, 0.004),
    ]
    # C2b: formed pylon with real section — not a stick.
    bits.append(loft_rings(
        "LOD0_MastPylon",
        [
            pylon_ring(0.70, 0.0, 0.86, 0.42, 0.34),
            pylon_ring(0.70, 0.0, 1.22, 0.32, 0.26),
            pylon_ring(0.70, 0.0, 1.56, 0.24, 0.20),
            pylon_ring(0.70, 0.0, 1.88, 0.18, 0.16),
        ],
        hull_mat, 0.006, cap=True,
    ))
    bits.append(loft_rings(
        "LOD0_MastYard",
        [
            pylon_ring(0.70, -0.48, 1.70, 0.12, 0.14),
            pylon_ring(0.70, 0.0, 1.76, 0.16, 0.18),
            pylon_ring(0.70, 0.48, 1.70, 0.12, 0.14),
        ],
        armor, 0.004, cap=True,
    ))
    bits.append(add_cylinder("LOD0_Dish_Port", 0.20, 0.06, (0.70, -0.46, 1.66), ceramic, 0.0, vertices=12))
    bits.append(add_cylinder("LOD0_Dish_Stbd", 0.20, 0.06, (0.70, 0.46, 1.66), ceramic, 0.0, vertices=12))
    bits.append(add_cylinder(
        "LOD0_Dish_Fore", 0.16, 0.05, (0.98, 0.0, 1.72), ceramic, 0.0,
        rotation=(0.0, math.radians(90.0), 0.0), vertices=10,
    ))
    if lod == 0:
        bits.append(add_box("LOD0_MastBox", (0.22, 0.16, 0.18), (0.70, 0.0, 1.22), armor, 0.002))
    return bits


def build_drives(mats, lod):
    thruster = mats["Material_Thruster"]
    ceramic = mats["Material_Ceramic"]
    mech = mats["Material_Mechanical"]
    bits = []
    report = {}
    for sign, tag in ((-1.0, "Port"), (1.0, "Stbd")):
        y = drive_half_y() * sign
        rings = [
            circle_ring((-7.88, y, 0.22), (-1.0, 0.0, 0.0), 0.44, 14),
            circle_ring((-8.18, y, 0.22), (-1.0, 0.0, 0.0), 0.36, 14),
            circle_ring((-8.42, y, 0.22), (-1.0, 0.0, 0.0), 0.26, 14),
            circle_ring((-8.62, y, 0.22), (-1.0, 0.0, 0.0), 0.16, 14),
        ]
        bits.append(loft_rings(f"LOD0_Bell_{tag}", rings, thruster, 0.005, cap=False))
        bits.append(add_cylinder(
            f"LOD0_Hub_{tag}", 0.10, 0.24, (-8.12, y, 0.22), mech, 0.0,
            rotation=(0.0, math.radians(90.0), 0.0), vertices=8,
        ))
        bits.append(add_cylinder(
            f"LOD0_HeatRing_{tag}", 0.34, 0.08, (-8.00, y, 0.22), ceramic, 0.0,
            rotation=(0.0, math.radians(90.0), 0.0), vertices=12,
        ))
        vane_count = 6 if lod == 0 else 4 if lod == 1 else 0
        for index in range(vane_count):
            angle = index * math.tau / max(vane_count, 1)
            bits.append(add_box(
                f"LOD0_Vane_{tag}_{index}",
                (0.18, 0.032, 0.22),
                (-8.16, y + math.sin(angle) * 0.20, 0.22 + math.cos(angle) * 0.20),
                ceramic, 0.0,
            ))
        report[tag] = True
    return bits, report


def build_guns(mats, lod):
    """Fore houses are formed cheek volumes on the bow course, not deck boxes.

    C4 sat 0.22 m boxes at y=0.55 inside a 2.8 m half-beam bow, so they vanished
    at D=144. C5 grows them from the chine so they break the bow silhouette.
    """
    mech = mats["Material_Mechanical"]
    armor = mats["Material_Armor"]
    bits = []
    for sign, tag in ((-1.0, "Port"), (1.0, "Stbd")):
        rings = []
        for x, y_outer, hw, hh, zc in (
            (7.00, 2.92, 0.38, 0.28, 0.24),
            (6.62, 3.30, 0.56, 0.43, 0.28),
            (6.05, 3.52, 0.66, 0.49, 0.30),
            (5.42, 3.48, 0.64, 0.47, 0.28),
            (4.92, 3.28, 0.48, 0.34, 0.24),
        ):
            rings.append(gun_house_ring(x, sign, y_outer, zc, hw, hh))
        bits.append(loft_rings(f"LOD0_GunForeHouse_{tag}", rings, armor, 0.010, cap=True))
        # Broad upper course locks the house into the shoulder instead of
        # reading as a small weapon pod pasted onto the skin.
        brow = [
            gun_house_ring(6.58, sign, 3.28, 0.58, 0.48, 0.16),
            gun_house_ring(6.02, sign, 3.46, 0.60, 0.50, 0.18),
            gun_house_ring(5.38, sign, 3.40, 0.54, 0.42, 0.16),
        ]
        bits.append(loft_rings(f"LOD0_GunForeBrow_{tag}", brow, mats["Material_Course"], 0.008, cap=True))
        barrel = loft_rings(
            f"LOD0_GunFore_{tag}",
            [
                gun_house_ring(6.98, sign, 2.94, 0.24, 0.17, 0.12),
                gun_house_ring(7.24, sign, 3.00, 0.24, 0.13, 0.09),
                gun_house_ring(7.46, sign, 3.02, 0.24, 0.09, 0.06),
            ],
            mech, 0.004, cap=True,
        )
        bits.append(barrel)
        if lod < 2:
            y_bore = 3.02 * sign
            def bore(name=f"GunBoreFore_{tag}", loc=(7.47, y_bore, 0.24)):
                return add_cylinder(
                    name, 0.034, 0.14, loc, mech, 0.0,
                    rotation=(0.0, math.radians(90.0), 0.0), vertices=8,
                )
            cut(barrel, bore)
        bits.append(add_box(f"LOD0_GunAft_{tag}", (0.62, 0.10, 0.10), (-6.55, 0.36 * sign, 0.52), mech, 0.002))
    return bits


def add_letter_r(prefix, origin, height, width, stroke, thick, material):
    x, y, z = origin
    return [
        add_box(f"{prefix}_Spine", (height, stroke, thick), (x, y - width * 0.5 + stroke * 0.5, z), material, 0.0),
        add_box(f"{prefix}_Top", (stroke, width * 0.70, thick), (x + height * 0.5 - stroke * 0.5, y + width * 0.08, z), material, 0.0),
        add_box(f"{prefix}_Mid", (stroke, width * 0.55, thick), (x + height * 0.08, y, z), material, 0.0),
        add_box(f"{prefix}_Bow", (height * 0.38, stroke, thick), (x + height * 0.28, y + width * 0.42, z), material, 0.0),
        add_box(f"{prefix}_Leg", (height * 0.42, stroke, thick), (x - height * 0.22, y + width * 0.28, z), material, 0.0,
                rotation=(0.0, 0.0, math.radians(-28.0))),
    ]


def add_digit_4(prefix, origin, height, width, stroke, thick, material):
    x, y, z = origin
    return [
        add_box(f"{prefix}_Spine", (height, stroke, thick), (x, y + width * 0.5 - stroke * 0.5, z), material, 0.0),
        add_box(f"{prefix}_Mid", (stroke, width, thick), (x, y, z), material, 0.0),
        add_box(f"{prefix}_NE", (height * 0.48, stroke, thick), (x + height * 0.22, y - width * 0.5 + stroke * 0.5, z), material, 0.0),
    ]


def add_digit_7(prefix, origin, height, width, stroke, thick, material):
    x, y, z = origin
    return [
        add_box(f"{prefix}_Top", (stroke, width, thick), (x + height * 0.5 - stroke * 0.5, y, z), material, 0.0),
        add_box(f"{prefix}_Stem", (height, stroke, thick), (x, y + width * 0.18, z), material, 0.0,
                rotation=(0.0, 0.0, math.radians(-18.0))),
    ]


def build_hardware(hull, mats, lod):
    hull_mat = mats["Material_Hull"]
    armor = mats["Material_Armor"]
    mech = mats["Material_Mechanical"]
    accent = mats["Material_Accent"]
    warning = mats["Material_Warning"]
    rad = mats["Material_Radiator"]
    bits = []

    def rad_cut():
        return add_box("RadWellCut", (1.15, 0.52, 0.36), (-2.20, 0.0, 0.88), mech, 0.0)

    cut(hull, rad_cut)
    bits.extend(add_open_well("LOD0_RadWell", (1.00, 0.42, 0.30), (-2.20, 0.0, 0.76), mech, floor=True, wall=0.040))
    for index in range(3 if lod == 0 else 2):
        bits.append(add_box(f"LOD0_RadFin_{index}", (0.08, 0.32, 0.18), (-2.52 + index * 0.22, 0.0, 0.74), rad, 0.0))

    yc = drive_half_y()
    for sign, tag in ((-1.0, "Port"), (1.0, "Stbd")):
        def nozzle_cut(name=f"NozzleCut_{tag}", loc=(-7.20, yc * sign, 0.52)):
            return add_cylinder(name, 0.36, 0.42, loc, hull_mat, 0.0, vertices=14)
        cut(hull, nozzle_cut)
        bits.append(add_cylinder(
            f"LOD0_Bell_Nozzle_{tag}", 0.32, 0.08, (-7.20, yc * sign, 0.64),
            mats["Material_Ceramic"], 0.0, vertices=14,
        ))
        bits.append(add_cylinder(
            f"LOD0_Bell_Bore_{tag}", 0.18, 0.30, (-7.20, yc * sign, 0.42),
            mats["Material_Thruster"], 0.0, vertices=12,
        ))
        def vent_cut(name=f"VentPocket_{tag}", loc=(2.20, hull_station_at(2.20)[1] * 0.74 * sign, 0.16)):
            return add_box(name, (0.72, 0.12, 0.32), loc, hull_mat, 0.0)
        cut(hull, vent_cut)
        if lod < 2:
            for index in range(3 if lod == 0 else 2):
                bits.append(add_box(
                    f"LOD0_VentSlat_{tag}_{index}",
                    (0.08, 0.10, 0.24),
                    (1.95 + index * 0.18, hull_station_at(2.20)[1] * 0.74 * sign, 0.16),
                    rad, 0.0,
                ))

    def hatch_cut():
        return add_cylinder("HatchCut_Mid", 0.20, 0.16, (2.40, 0.0, 0.92), hull_mat, 0.0, vertices=12)

    cut(hull, hatch_cut)
    bits.append(add_cylinder("LOD0_HatchRing", 0.18, 0.06, (2.40, 0.0, 0.96), mech, 0.0, vertices=12))
    bits.append(add_cylinder("LOD0_HatchHub", 0.07, 0.08, (2.40, 0.0, 0.98), armor, 0.0, vertices=8))

    bits.append(add_box("LOD0_Jbox_Fore", (0.46, 0.32, 0.16), (2.40, -0.52, 0.96), mech, 0.0))
    bits.append(add_box("LOD0_Jbox_ForeLid", (0.34, 0.22, 0.05), (2.40, -0.52, 1.04), armor, 0.0))
    bits.append(add_cylinder("LOD0_Valve_Fore", 0.08, 0.14, (2.40, -0.74, 0.96), mech, 0.0, vertices=8))
    bits.append(add_box("LOD0_Manifold_Mid", (0.52, 0.34, 0.18), (-1.40, 0.72, 0.88), mech, 0.0))
    bits.append(add_cylinder(
        "LOD0_Pipe_MidX", 0.055, 0.92, (-1.20, 0.72, 0.80),
        mech, 0.0, rotation=(0.0, math.radians(90.0), 0.0), vertices=8,
    ))
    bits.append(add_box("LOD0_WalkPlate_P", (0.78, 0.36, 0.05), (2.40, -0.88, 0.86), armor, 0.0))
    bits.append(add_box("LOD0_WalkPlate_S", (0.78, 0.36, 0.05), (2.40, 0.88, 0.86), armor, 0.0))
    bits.append(add_box("LOD0_Rail_P", (1.05, 0.08, 0.06), (2.30, -0.92, 0.98), mech, 0.0))
    bits.append(add_box("LOD0_Rail_S", (1.05, 0.08, 0.06), (2.30, 0.92, 0.98), mech, 0.0))

    bits.extend(add_letter_r("LOD0_LetterR", (2.05, 0.0, 1.02), 0.42, 0.28, 0.055, 0.04, warning))
    bits.extend(add_digit_4("LOD0_Digit4", (-4.40, 0.22, 0.92), 0.32, 0.22, 0.045, 0.035, warning))
    bits.extend(add_digit_7("LOD0_Digit7", (-4.40, -0.22, 0.92), 0.32, 0.22, 0.045, 0.035, warning))

    bits.append(add_box("LOD0_RCS_Port", (0.16, 0.14, 0.12), (-1.20, -1.42, 0.15), mech, 0.002))
    bits.append(add_box("LOD0_RCS_Stbd", (0.16, 0.14, 0.12), (-1.20, 1.42, 0.15), mech, 0.002))
    bits.append(add_box("LOD0_RCS_ForePort", (0.16, 0.12, 0.12), (6.55, -0.42, 0.16), mech, 0.002))
    bits.append(add_box("LOD0_RCS_ForeStbd", (0.16, 0.12, 0.12), (6.55, 0.42, 0.16), mech, 0.002))
    bits.append(add_cylinder("LOD0_Beacon_Fore", 0.12, 0.14, (2.90, 0.0, 1.04), accent, 0.0, vertices=8))
    bits.append(add_cylinder("LOD0_Beacon_Aft", 0.12, 0.14, (-5.80, 0.0, 0.86), warning, 0.0, vertices=8))
    bits.append(add_cylinder("LOD0_Nav_Port", 0.08, 0.10, (-1.40, -2.58, 0.22), warning, 0.0, vertices=8))
    bits.append(add_cylinder("LOD0_Nav_Stbd", 0.08, 0.10, (-1.40, 2.58, 0.22), accent, 0.0, vertices=8))

    if lod == 0:
        bits.extend(add_hose(
            "LOD0_Hose_Nacelle_Stbd",
            [(-2.40, 0.62, 0.42), (-4.40, drive_half_y() * 0.70, 0.36), (-6.20, drive_half_y() * 0.82, 0.30)],
            0.08, mech, 8,
        ))
        bits.extend(add_hose(
            "LOD0_Hose_Nacelle_Port",
            [(-2.40, -0.62, 0.42), (-4.40, -drive_half_y() * 0.70, 0.36), (-6.20, -drive_half_y() * 0.82, 0.30)],
            0.08, mech, 8,
        ))
        bits.extend(add_hose(
            "LOD0_Hose_Survey",
            [(2.40, 0.48, 0.52), (0.70, 0.62, 0.70), (-1.20, 0.48, 0.48)],
            0.07, mech, 8,
        ))
    return bits


def shade_objects(objs):
    hard = (
        "Hull", "Wing", "Flap", "Armor", "Gun", "Hatch", "RCS", "Nav", "Hose",
        "Heat", "Dirt", "Beacon", "Collar", "Letter", "Digit", "Vent", "Clamp",
        "Course", "Girth", "Mast", "Dish", "Lap", "Walk", "Rail", "Jbox",
        "Manifold", "Pipe", "Valve", "Nozzle", "Well", "Green", "Survey",
    )
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
    wings = build_wings(hull, mats, lod)
    well_bits, well_report = build_survey_well(hull, mats, lod)
    green_bits, green_report = build_greenhouse(hull, mats, lod)
    mast = build_mast(mats, lod)
    drive_bits, drive_report = build_drives(mats, lod)
    guns = build_guns(mats, lod)
    hardware = build_hardware(hull, mats, lod)
    paint_shell(hull, mats)

    built = [hull, *hull_extras, *nacelles, *wings, *well_bits, *green_bits, *mast, *drive_bits, *guns, *hardware]
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
        mats["Material_Mark"],
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
    if size.x < 15.0 or size.x > 18.8 or size.y < 5.5 or size.y > 7.2 or size.z > 4.5:
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
        "asset": "ship_ranger",
        "revision": REVISION,
        "lod": lod,
        "source": str(source),
        "output": str(output),
        "greenhouse": green_report,
        "surveyWell": well_report,
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
        output = out_dir / f"ranger_c6_lod{lod}.glb"
        reports.append(build_one(source, output, lod))
    summary = {"ok": True, "revision": REVISION, "lods": reports, "promoted": []}
    (out_dir / "ranger_chase_form_v6.summary.json").write_text(json.dumps(summary, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(summary))


if __name__ == "__main__":
    main()

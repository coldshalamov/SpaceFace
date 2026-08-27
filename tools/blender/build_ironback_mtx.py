"""PQ-050.04 Ironback MTX builder. Hitch untouched. --mtx-cycle N writes exact-GLB chase stills.

Cycle 21 retains Cycle 20's open-well perimeter barge and corrects remaining
default-camera identity failures: large hopper conveyor/breaker/gates, a broad
armored greenhouse (not a grille), twin stepped pulse beds, heavier tool heads,
and directional dorsal plate relief. Cycle 18–20 source/evidence stay untouched.
Close occupancy remains the locked +X length axis at 41.28 WU; do not fake it.

Usage::

  blender --background --python tools/blender/build_ironback_mtx.py -- --mtx-cycle 21
"""

from __future__ import annotations

import hashlib
import json
import math
import shutil
import sys
from pathlib import Path

import bpy
import bmesh
from mathutils import Vector

TOOLS = Path(__file__).resolve().parent
ROOT = TOOLS.parents[1]
if str(TOOLS) not in sys.path:
    sys.path.insert(0, str(TOOLS))
from fleet_construction import (  # noqa: E402
    add_folded_sheet,
    add_hoop_frame,
    add_overlap_plate,
    add_radiator_cassette,
    add_rcs_cluster,
    apply_modifiers,
    boolean_cut_box,
    boolean_cut_cylinder,
)
from spaceface_chase_camera import (  # noqa: E402
    DISTANCE_CLOSE,
    DISTANCE_DEFAULT,
    FOV_V_DEG,
    PLAY_CHASE_CLOSE_WIDTH_FRAC,
    PLAY_CHASE_WIDTH_FRAC,
    TILT_DEG,
    apply_chase_camera,
    occupancy_in_band,
    render_chase_still,
    render_cycle_chase_stills,
)

FAMILY = ROOT / "assets" / "ships" / "fleet_player_bodies_v1" / "ironback"
TEX_DIR = FAMILY / "source" / "textures"
TEX = 1024
CYCLE = 21
ASSEMBLY_HULL_UNITS = 1.72
IRONBACK_COLLISION_RADIUS = 24.0
for i, tok in enumerate(sys.argv):
    if tok.startswith("--mtx-cycle="):
        CYCLE = int(tok.split("=", 1)[1])
    elif tok == "--mtx-cycle" and i + 1 < len(sys.argv):
        CYCLE = int(sys.argv[i + 1])


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1 << 20), b""):
            digest.update(chunk)
    return digest.hexdigest().upper()


def reset_scene() -> None:
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for bucket in (bpy.data.meshes, bpy.data.curves, bpy.data.materials, bpy.data.cameras, bpy.data.lights, bpy.data.images):
        for item in list(bucket):
            bucket.remove(item)
    for collection in list(bpy.data.collections):
        bpy.data.collections.remove(collection)


def h01(x, y, s=0):
    v = (x * 374761393 + y * 668265263 + s * 362437) & 0xFFFFFFFF
    v = ((v ^ (v >> 13)) * 1274126177) & 0xFFFFFFFF
    return ((v ^ (v >> 16)) & 255) / 255.0


def write_pixels(name, pixels, size, colorspace="sRGB"):
    if name in bpy.data.images:
        bpy.data.images.remove(bpy.data.images[name])
    img = bpy.data.images.new(name, width=size, height=size, alpha=True)
    img.colorspace_settings.name = colorspace
    img.pixels = pixels
    TEX_DIR.mkdir(parents=True, exist_ok=True)
    path = TEX_DIR / f"{name}.png"
    img.filepath_raw = str(path)
    img.file_format = "PNG"
    img.save()
    img.pack()
    return img


def role_maps(role, rgb, size=TEX, prefix=None):
    """Manufacture-specific maps. Not one plate-grid recipe recolored."""
    prefix = prefix or role
    br, bg, bb = rgb
    albedo, orm, nrm = [], [], []
    half = size * 0.5
    for y in range(size):
        for x in range(size):
            gf = h01(x, y, 11)
            gf2 = h01(x // 3, y // 3, 29)
            gf3 = h01(x // 7, y // 7, 47)
            nx, ny = 0.5, 0.5
            if role == "hull":
                # Irregular welded oxide plates, not a cartesian waffle.
                row = y // 96
                stagger = 28 if row % 2 else 0
                col = (x + stagger) // 124
                pid = h01(col, row, 3)
                n_row = (y + 1) // 96
                n_col = (x + 1 + (28 if n_row % 2 else 0)) // 124
                seam = 1.0 if (col != n_col or row != n_row) else 0.0
                if x % 124 < 2 or y % 96 < 2:
                    seam = max(seam, 0.85)
                chip = 1.0 if gf > 0.93 and seam > 0.4 else 0.0
                streak = max(0.0, 0.55 - abs(((x + y * 0.35) % 180) / 180.0 - 0.5) * 2.0) * (0.18 + 0.22 * gf3)
                dirt = min(1.0, seam * 0.45 + gf2 * 0.12 + streak * 0.55 + chip * 0.4)
                r = max(0, min(1, br * (1.0 - dirt * 0.28) + chip * 0.10))
                g = max(0, min(1, bg * (1.0 - dirt * 0.22) + chip * 0.04))
                b = max(0, min(1, bb * (1.0 - dirt * 0.16)))
                if chip:
                    r, g, b = r * 0.45 + 0.22, g * 0.45 + 0.16, b * 0.45 + 0.10
                rough = 0.46 + dirt * 0.28 - seam * 0.06
                metal = 0.04 + chip * 0.55 + seam * 0.12
                nx = 0.5 + (0.10 if seam else 0.0) * (0.5 - (x % 124) / 124)
                ny = 0.5 + (0.08 if seam else 0.0) * (0.5 - (y % 96) / 96)
                ao = max(0.22, 1.0 - seam * 0.35 - dirt * 0.18)
            elif role == "armor":
                row = y // 42
                stagger = 22 if row % 2 else 0
                pw, ph = 58, 42
                dx = min((x + stagger) % pw, pw - ((x + stagger) % pw))
                dy = min(y % ph, ph - (y % ph))
                seam = 1.0 if (dx <= 1 or dy <= 1) else 0.0
                bolt = 1.0 if (dx <= 3 and dy <= 3 and gf > 0.55) else 0.0
                dirt = seam * 0.3 + gf2 * 0.08
                r = max(0, min(1, br * (1.0 - dirt * 0.2) + bolt * 0.08))
                g = max(0, min(1, bg * (1.0 - dirt * 0.16) + bolt * 0.08))
                b = max(0, min(1, bb * (1.0 - dirt * 0.12) + bolt * 0.06))
                rough = 0.28 + dirt * 0.2 - bolt * 0.08
                metal = 0.72 + bolt * 0.12
                nx = 0.5 + (0.12 if seam else 0.0) * (0.5 - dx / max(1, pw))
                ny = 0.5 + (0.10 if seam else 0.0) * (0.5 - dy / max(1, ph))
                ao = max(0.28, 1.0 - seam * 0.28 - bolt * 0.12)
            elif role == "mechanical":
                rad = math.hypot(x - half, y - half)
                groove = 0.5 + 0.5 * math.sin(rad * 0.42 + gf * 0.4)
                mill = 0.5 + 0.5 * math.sin(y * 0.55)
                heat = max(0.0, 0.62 - x / size) * 0.45
                mix = groove * 0.65 + mill * 0.35
                r = max(0, min(1, br * (0.82 + mix * 0.18) + heat * 0.38))
                g = max(0, min(1, bg * (0.86 + mix * 0.12) + heat * 0.10))
                b = max(0, min(1, bb * (0.90 + (1 - mix) * 0.08)))
                rough = 0.18 + (1 - mix) * 0.16 + heat * 0.12
                metal = 0.90
                nx = 0.5 + math.cos(rad * 0.42) * 0.06
                ny = 0.5 + math.sin(rad * 0.42) * 0.06
                ao = 0.78 + mix * 0.12
            elif role == "ceramic":
                grain = gf * 0.55 + gf2 * 0.45
                pit = 1.0 if gf3 > 0.88 else 0.0
                r = max(0, min(1, br * (0.88 + grain * 0.14) - pit * 0.08))
                g = max(0, min(1, bg * (0.86 + grain * 0.10) - pit * 0.06))
                b = max(0, min(1, bb * (0.80 + grain * 0.08) - pit * 0.04))
                rough = 0.62 + grain * 0.16 + pit * 0.12
                metal = 0.0
                nx = 0.5 + (gf - 0.5) * 0.05
                ny = 0.5 + (gf2 - 0.5) * 0.05
                ao = 0.82 - pit * 0.12
            elif role == "radiator":
                louver = 1.0 if (y % 16) < 6 else 0.0
                header = 1.0 if (x % 140) < 8 else 0.0
                r = max(0, min(1, br * (0.7 + louver * 0.35) + header * 0.08))
                g = max(0, min(1, bg * (0.7 + louver * 0.22)))
                b = max(0, min(1, bb * (0.72 + louver * 0.12)))
                rough = 0.48 + (1 - louver) * 0.18
                metal = 0.62 + header * 0.2
                nx = 0.5
                ny = 0.5 + (0.16 if louver else -0.06)
                ao = 0.55 + louver * 0.25 - header * 0.1
            elif role == "warning":
                t = (x + y) % 52
                chev = 1.0 if t < 24 else 0.0
                r = br * (0.35 + 0.65 * chev) * (1 - gf2 * 0.12)
                g = bg * (0.28 + 0.55 * chev) * (1 - gf2 * 0.10)
                b = bb * (0.15 + 0.2 * chev)
                rough = 0.48
                metal = 0.04
                ao = 0.86
            elif role == "glass":
                stria = 0.04 * math.sin(x * 0.18)
                r = max(0, min(1, br + stria))
                g = max(0, min(1, bg + stria * 0.6))
                b = max(0, min(1, bb + 0.02))
                rough = 0.06 + gf * 0.03
                metal = 0.02
                ao = 0.92
            elif role == "thruster":
                flow = (x / max(1, size - 1)) ** 1.35
                soot = gf2 * 0.25
                r = max(0, min(1, 0.10 + flow * 0.42 - soot * 0.08))
                g = max(0, min(1, 0.05 + flow * 0.14 - soot * 0.04))
                b = max(0, min(1, 0.03 + flow * 0.04))
                rough = 0.28 + soot * 0.3 + (1 - flow) * 0.16
                metal = 0.55 + flow * 0.2
                nx = 0.5 + (gf - 0.5) * 0.04
                ny = 0.5 + math.sin(y * 0.2) * 0.03
                ao = 0.70 - flow * 0.12
            else:
                r, g, b = br, bg, bb
                rough, metal, ao = 0.5, 0.2, 0.8
            albedo.extend((r, g, b, 1.0))
            orm.extend((ao, max(0.04, min(0.95, rough)), max(0.0, min(1.0, metal)), 1.0))
            nrm.extend((max(0, min(1, nx)), max(0, min(1, ny)), 1.0, 1.0))
    base = write_pixels(f"ironback_{prefix}_basecolor", albedo, size, "sRGB")
    orm_img = write_pixels(f"ironback_{prefix}_orm", orm, size, "Non-Color")
    nrm_img = write_pixels(f"ironback_{prefix}_normal", nrm, size, "Non-Color")
    return base, orm_img, nrm_img


def principled(material):
    material.use_nodes = True
    material.node_tree.nodes.clear()
    output = material.node_tree.nodes.new("ShaderNodeOutputMaterial")
    bsdf = material.node_tree.nodes.new("ShaderNodeBsdfPrincipled")
    material.node_tree.links.new(bsdf.outputs["BSDF"], output.inputs["Surface"])
    return bsdf


def wire_maps(material, bsdf, maps, coat=0.0, emission=None):
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    uv0 = nodes.new("ShaderNodeUVMap")
    uv0.uv_map = "UVMap"
    tex_a = nodes.new("ShaderNodeTexImage")
    tex_a.image = maps[0]
    tex_o = nodes.new("ShaderNodeTexImage")
    tex_o.image = maps[1]
    tex_n = nodes.new("ShaderNodeTexImage")
    tex_n.image = maps[2]
    links.new(uv0.outputs["UV"], tex_a.inputs["Vector"])
    links.new(uv0.outputs["UV"], tex_o.inputs["Vector"])
    links.new(uv0.outputs["UV"], tex_n.inputs["Vector"])
    sep = nodes.new("ShaderNodeSeparateColor")
    links.new(tex_o.outputs["Color"], sep.inputs["Color"])
    links.new(tex_a.outputs["Color"], bsdf.inputs["Base Color"])
    links.new(sep.outputs["Green"], bsdf.inputs["Roughness"])
    links.new(sep.outputs["Blue"], bsdf.inputs["Metallic"])
    nmap = nodes.new("ShaderNodeNormalMap")
    nmap.space = "TANGENT"
    nmap.inputs["Strength"].default_value = 1.05
    links.new(tex_n.outputs["Color"], nmap.inputs["Color"])
    links.new(nmap.outputs["Normal"], bsdf.inputs["Normal"])
    if "Coat Weight" in bsdf.inputs and coat > 0:
        bsdf.inputs["Coat Weight"].default_value = coat
        bsdf.inputs["Coat Roughness"].default_value = 0.18
    if emission:
        bsdf.inputs["Emission Color"].default_value = (*emission[0], 1)
        bsdf.inputs["Emission Strength"].default_value = emission[1]


def create_materials():
    specs = {
        "Material_Hull": ((0.38, 0.20, 0.10), 0.06, 0.52, "hull", 0.18, None),
        "Material_Armor": ((0.07, 0.09, 0.10), 0.74, 0.30, "armor", 0.08, None),
        "Material_Mechanical": ((0.22, 0.23, 0.24), 0.90, 0.22, "mechanical", 0.0, None),
        "Material_Warning": ((0.68, 0.32, 0.05), 0.04, 0.48, "warning", 0.08, None),
        "Material_Ceramic": ((0.56, 0.48, 0.36), 0.0, 0.66, "ceramic", 0.0, None),
        "Material_Radiator": ((0.14, 0.10, 0.07), 0.64, 0.52, "radiator", 0.0, None),
        "Material_Canopy": ((0.05, 0.13, 0.17), 0.00, 0.08, "glass", 0.22, ((0.03, 0.09, 0.13), 0.08)),
        "Material_Thruster": ((0.12, 0.05, 0.03), 0.48, 0.38, "thruster", 0.0, ((0.28, 0.10, 0.04), 0.06)),
    }
    mats = {}
    for name, (rgb, metal, rough, role, coat, emit) in specs.items():
        material = bpy.data.materials.new(name)
        bsdf = principled(material)
        bsdf.inputs["Base Color"].default_value = (*rgb, 1)
        bsdf.inputs["Metallic"].default_value = metal
        bsdf.inputs["Roughness"].default_value = rough
        maps = role_maps(role, rgb, prefix=name.replace("Material_", "").lower())
        wire_maps(material, bsdf, maps, coat=coat, emission=emit)
        if name == "Material_Canopy":
            if "Transmission Weight" in bsdf.inputs:
                bsdf.inputs["Transmission Weight"].default_value = 0.22
            elif "Transmission" in bsdf.inputs:
                bsdf.inputs["Transmission"].default_value = 0.22
            if "IOR" in bsdf.inputs:
                bsdf.inputs["IOR"].default_value = 1.45
            bsdf.inputs["Alpha"].default_value = 0.78
            if hasattr(material, "blend_method"):
                try:
                    material.blend_method = "BLEND"
                except TypeError:
                    pass
        material["spacefaceRole"] = role
        mats[name] = material
    return mats


def link_object(obj, collection):
    for current in list(obj.users_collection):
        current.objects.unlink(obj)
    collection.objects.link(obj)
    return obj


def finish_mesh(obj, material, bevel=0.03):
    obj.data.materials.clear()
    obj.data.materials.append(material)
    if bevel > 0:
        mod = obj.modifiers.new("ProductionBevel", "BEVEL")
        mod.width = bevel
        mod.segments = 2
        mod.limit_method = "ANGLE"
        mod.angle_limit = math.radians(40)
    wn = obj.modifiers.new("WeightedNormal", "WEIGHTED_NORMAL")
    wn.keep_sharp = True
    obj["spacefaceRole"] = material.get("spacefaceRole", "static")
    return obj


def add_box(name, loc, scale, material, collection, bevel=0.03, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cube_add(location=loc, rotation=rot)
    obj = link_object(bpy.context.object, collection)
    obj.name = name
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return finish_mesh(obj, material, bevel)


def add_subdivided_box(name, loc, scale, material, collection, cuts=3, bevel=0.03):
    """Formed pressure block with enough faces for real well/drive cuts."""
    bpy.ops.mesh.primitive_cube_add(location=loc)
    obj = link_object(bpy.context.object, collection)
    obj.name = name
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.subdivide(number_cuts=cuts)
    bpy.ops.object.mode_set(mode="OBJECT")
    obj.select_set(False)
    return finish_mesh(obj, material, bevel)


def add_cylinder(name, loc, radius, depth, material, collection, vertices=18, bevel=0.02, rot=(0, math.pi / 2, 0)):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=loc, rotation=rot)
    obj = link_object(bpy.context.object, collection)
    obj.name = name
    return finish_mesh(obj, material, bevel)


def add_axis_cylinder(name, start, end, radius, material, collection, vertices=10, bevel=0.003):
    a, b = Vector(start), Vector(end)
    axis = b - a
    depth = max(axis.length, 1e-3)
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=tuple((a + b) * 0.5))
    obj = link_object(bpy.context.object, collection)
    obj.name = name
    obj.rotation_euler = axis.normalized().to_track_quat("Z", "Y").to_euler()
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=False)
    obj.select_set(False)
    return finish_mesh(obj, material, bevel)


def add_hydraulic(name, start, end, mats, collection):
    armor, mech = mats["Material_Armor"], mats["Material_Mechanical"]
    a, b = Vector(start), Vector(end)
    if (b - a).length < 0.08:
        return
    d = b - a
    barrel_end = a + d * 0.62
    add_axis_cylinder(f"{name}_Barrel", a, barrel_end, 0.075, armor, collection, 10, 0.004)
    add_axis_cylinder(f"{name}_Rod", a + d * 0.48, b, 0.036, mech, collection, 8, 0.002)
    add_cylinder(f"{name}_Clevis", tuple(a), 0.055, 0.08, mech, collection, 8, 0.002, (0, 0, 0))


def add_mesh(name, verts, faces, material, collection, bevel=0.012):
    mesh = bpy.data.meshes.new(f"{name}_Mesh")
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)
    return finish_mesh(obj, material, bevel)


def add_oriented_box(name, start, end, yz, material, collection, bevel=0.008):
    a, b = Vector(start), Vector(end)
    mid = (a + b) * 0.5
    axis = b - a
    length = max(axis.length, 1e-4)
    bpy.ops.mesh.primitive_cube_add(location=tuple(mid))
    obj = link_object(bpy.context.object, collection)
    obj.name = name
    obj.scale = (length * 0.5, yz[0], yz[1])
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.rotation_euler = axis.normalized().to_track_quat("X", "Z").to_euler()
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=False)
    obj.select_set(False)
    return finish_mesh(obj, material, bevel)


def add_hat_boom(name, start, end, width, height, material, collection, bevel=0.006):
    """Folded hat-section boom: web plus two flanges."""
    a, b = Vector(start), Vector(end)
    axis = b - a
    if axis.length < 1e-4:
        return add_box(name, tuple(a), (0.1, width, height), material, collection, bevel)
    mid = (a + b) * 0.5
    x_axis = axis.normalized()
    up = Vector((0.0, 0.0, 1.0))
    side = x_axis.cross(up)
    if side.length < 0.15:
        side = x_axis.cross(Vector((0.0, 1.0, 0.0)))
    side.normalize()
    up = side.cross(x_axis).normalized()
    hw, hh, fl = width * 0.5, height, width * 0.22
    profile = ((-hw, hh * 0.18), (-hw, hh), (-hw + fl, hh), (-hw + fl, 0.0), (hw - fl, 0.0), (hw - fl, hh), (hw, hh), (hw, hh * 0.18))
    verts = []
    for end_pt in (a, b):
        for sy, sz in profile:
            verts.append(tuple(end_pt + side * sy + up * sz))
    faces = [(0, 1, 2, 3, 4, 5, 6, 7), (15, 14, 13, 12, 11, 10, 9, 8)]
    for i in range(8):
        j = (i + 1) % 8
        faces.append((i, j, j + 8, i + 8))
    return add_mesh(name, verts, faces, material, collection, bevel)


def add_curve_hose(name, points, material, collection, radius=0.018):
    curve = bpy.data.curves.new(name, "CURVE")
    curve.dimensions = "3D"
    curve.bevel_depth = radius
    curve.bevel_resolution = 2
    spline = curve.splines.new("BEZIER")
    spline.bezier_points.add(len(points) - 1)
    for index, point in enumerate(points):
        bp = spline.bezier_points[index]
        bp.co = point
        bp.handle_left_type = "AUTO"
        bp.handle_right_type = "AUTO"
    obj = bpy.data.objects.new(name, curve)
    collection.objects.link(obj)
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.convert(target="MESH")
    obj = bpy.context.object
    obj.name = name
    obj.select_set(False)
    return finish_mesh(obj, material, bevel=0.003)


def add_empty(name, loc, collection, parent=None):
    obj = bpy.data.objects.new(name, None)
    collection.objects.link(obj)
    obj.empty_display_type = "PLAIN_AXES"
    obj.empty_display_size = 0.2
    obj.location = loc
    if parent:
        obj.parent = parent
    obj["socket"] = True
    return obj


def sockets():
    half, hw, hh = 8.5, 2.6, 1.35
    return {
        "SOCKET_Weapon_Front": (half - 1.2, 0.0, 0.25),
        "SOCKET_Mining_Front": (half - 0.6, 0.0, -0.15),
        "SOCKET_Engine_Main": (-half + 1.2, 0.0, 0.08),
        "SOCKET_Trail_Main": (-half + 0.8, 0.0, 0.08),
        "SOCKET_Trail_Port": (-half + 1.0, -hw * 0.7, 0.08),
        "SOCKET_Trail_Starboard": (-half + 1.0, hw * 0.7, 0.08),
        "SOCKET_Utility_Dorsal": (0.6, 0.0, hh + 0.55),
        "SOCKET_Cargo_Ventral": (-0.4, 0.0, -hh - 0.15),
        "SOCKET_Camera_Focus": (0.8, 0.0, 0.25),
        "SOCKET_RCS_Port": (-1.2, -hw - 0.2, 0.15),
        "SOCKET_RCS_Starboard": (-1.2, hw + 0.2, 0.15),
    }


def shade_and_uv(obj):
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    apply_modifiers(obj)
    try:
        bpy.ops.object.shade_smooth_by_angle(angle=math.radians(28))
    except Exception:
        for poly in obj.data.polygons:
            poly.use_smooth = True
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(angle_limit=66.0, island_margin=0.018, scale_to_bounds=True)
    bpy.ops.object.mode_set(mode="OBJECT")
    if "UV1" in obj.data.uv_layers:
        obj.data.uv_layers.remove(obj.data.uv_layers["UV1"])
    uv1 = obj.data.uv_layers.new(name="UV1")
    uv0 = obj.data.uv_layers.active
    for loop in obj.data.loops:
        uv1.data[loop.index].uv = uv0.data[loop.index].uv * 8.0
    obj.select_set(False)


def bake_ao_into_albedo(obj, samples=8, size=TEX):
    if obj.type != "MESH" or not obj.data.polygons or not obj.data.uv_layers.active:
        return
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.samples = samples
    scene.cycles.device = "CPU"
    scene.cycles.use_denoising = False
    scene.render.bake.use_selected_to_active = False
    scene.render.bake.margin = 6
    img_name = f"AO_{obj.name}"
    if img_name in bpy.data.images:
        bpy.data.images.remove(bpy.data.images[img_name])
    ao = bpy.data.images.new(img_name, width=size, height=size, alpha=False)
    ao.colorspace_settings.name = "Non-Color"
    mat = obj.data.materials[0] if obj.data.materials else None
    if mat is None or not mat.use_nodes:
        return
    node = mat.node_tree.nodes.new("ShaderNodeTexImage")
    node.image = ao
    node.name = "SF_AO_TARGET"
    mat.node_tree.nodes.active = node
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    try:
        bpy.ops.object.bake(type="AO", use_clear=True, margin=6)
    except Exception as exc:
        print(f"AO bake skip {obj.name}: {exc}")
        return
    finally:
        for victim in [n for n in mat.node_tree.nodes if n.name == "SF_AO_TARGET"]:
            mat.node_tree.nodes.remove(victim)
    albedo = next((n.image for n in mat.node_tree.nodes if n.type == "TEX_IMAGE" and n.image and "basecolor" in n.image.name), None)
    if albedo is None:
        return
    ap = list(albedo.pixels)
    op = list(ao.pixels)
    n = min(len(ap) // 4, len(op) // 4)
    for i in range(n):
        factor = 0.84 + 0.16 * op[i * 4]
        ap[i * 4] *= factor
        ap[i * 4 + 1] *= factor
        ap[i * 4 + 2] *= factor
    albedo.pixels = ap
    albedo.pack()


def add_open_rect_well(prefix, cx, cy, floor_z, rim_z, inner_hx, inner_hy, wall, mats, collection, floor_mat=None):
    """Four structural walls plus a lowered floor. Never a lid, roof decal, or through-cut leftover plate."""
    hull, armor = mats["Material_Hull"], mats["Material_Armor"]
    ceramic = mats["Material_Ceramic"]
    floor_mat = floor_mat or mats["Material_Thruster"]
    mid_z = (rim_z + floor_z) * 0.5
    wall_h = (rim_z - floor_z) * 0.5
    wt = wall * 0.5
    add_box(f"{prefix}_WallP", (cx, cy - inner_hy - wt, mid_z), (inner_hx + wall, wt, wall_h), hull, collection, 0.010)
    add_box(f"{prefix}_WallS", (cx, cy + inner_hy + wt, mid_z), (inner_hx + wall, wt, wall_h), hull, collection, 0.010)
    add_box(f"{prefix}_WallF", (cx + inner_hx + wt, cy, mid_z), (wt, inner_hy, wall_h), hull, collection, 0.010)
    add_box(f"{prefix}_WallA", (cx - inner_hx - wt, cy, mid_z), (wt, inner_hy, wall_h), hull, collection, 0.010)
    add_box(f"{prefix}_LinerP", (cx, cy - inner_hy + 0.045, mid_z - 0.04), (inner_hx - 0.10, 0.045, wall_h * 0.84), ceramic, collection, 0.003)
    add_box(f"{prefix}_LinerS", (cx, cy + inner_hy - 0.045, mid_z - 0.04), (inner_hx - 0.10, 0.045, wall_h * 0.84), ceramic, collection, 0.003)
    add_box(f"{prefix}_LinerF", (cx + inner_hx - 0.045, cy, mid_z - 0.04), (0.045, inner_hy - 0.12, wall_h * 0.84), ceramic, collection, 0.003)
    add_box(f"{prefix}_LinerA", (cx - inner_hx + 0.045, cy, mid_z - 0.04), (0.045, inner_hy - 0.12, wall_h * 0.84), ceramic, collection, 0.003)
    add_box(f"{prefix}_Floor", (cx, cy, floor_z + 0.05), (inner_hx - 0.06, inner_hy - 0.06, 0.05), floor_mat, collection, 0.004)
    add_box(f"{prefix}_RimP", (cx, cy - inner_hy - 0.02, rim_z + 0.04), (inner_hx + 0.18, 0.16, 0.08), armor, collection, 0.008)
    add_box(f"{prefix}_RimS", (cx, cy + inner_hy + 0.02, rim_z + 0.04), (inner_hx + 0.18, 0.16, 0.08), armor, collection, 0.008)
    add_box(f"{prefix}_RimF", (cx + inner_hx + 0.02, cy, rim_z + 0.04), (0.16, inner_hy + 0.06, 0.08), armor, collection, 0.008)
    add_box(f"{prefix}_RimA", (cx - inner_hx - 0.02, cy, rim_z + 0.04), (0.16, inner_hy + 0.06, 0.08), armor, collection, 0.008)
    return (cx, cy, floor_z, rim_z, inner_hx, inner_hy)


def add_processing_hopper(lod, mats, collection):
    """Open receiving well. Chase-size ore path: dump deck -> broad conveyor -> breaker -> gates."""
    armor, mech = mats["Material_Armor"], mats["Material_Mechanical"]
    warning, ceramic, thruster = (mats["Material_Warning"], mats["Material_Ceramic"], mats["Material_Thruster"])
    cx, hy, hx = -0.12, 1.12, 2.08
    floor_z, rim_z, wall = -0.72, 1.02, 0.30
    add_open_rect_well("Hopper", cx, 0.0, floor_z, rim_z, hx, hy, wall, mats, collection, thruster)
    add_box("Hopper_HazardP", (cx, -hy - 0.02, rim_z + 0.12), (hx * 0.82, 0.07, 0.03), warning, collection, 0.002)
    add_box("Hopper_HazardS", (cx, hy + 0.02, rim_z + 0.12), (hx * 0.82, 0.07, 0.03), warning, collection, 0.002)
    add_cylinder("Hopper_RimRollP", (cx, -hy, rim_z + 0.02), 0.08, hx * 1.55, armor, collection, 12, 0.004, (0, math.pi / 2, 0))
    add_cylinder("Hopper_RimRollS", (cx, hy, rim_z + 0.02), 0.08, hx * 1.55, armor, collection, 12, 0.004, (0, math.pi / 2, 0))
    add_cylinder("Hopper_RimRollF", (cx + hx, 0.0, rim_z + 0.02), 0.08, hy * 1.45, armor, collection, 12, 0.004, (math.pi / 2, 0, 0))
    add_cylinder("Hopper_RimRollA", (cx - hx, 0.0, rim_z + 0.02), 0.08, hy * 1.45, armor, collection, 12, 0.004, (math.pi / 2, 0, 0))
    # Forward dump / impact deck — first large color mass in the well.
    add_box("Hopper_DumpDeck", (cx + hx - 0.62, 0.0, floor_z + 0.22), (0.52, hy - 0.22, 0.10), ceramic, collection, 0.006)
    add_box("Hopper_DumpLip", (cx + hx - 0.22, 0.0, floor_z + 0.16), (0.14, hy - 0.30, 0.06), armor, collection, 0.004)
    # Broad conveyor: one manufactured bed, not a row of tiny rollers.
    add_box("Hopper_ConveyorBed", (cx + 0.18, 0.0, floor_z + 0.16), (hx * 0.58, 0.52, 0.08), mech, collection, 0.005)
    add_box("Hopper_Belt", (cx + 0.18, 0.0, floor_z + 0.26), (hx * 0.54, 0.38, 0.04), armor, collection, 0.003)
    n_flight = 3 if lod == 0 else (2 if lod == 1 else 1)
    for i in range(n_flight):
        fx = cx - 0.55 + i * 0.72
        add_box(f"Hopper_Flight_{i}", (fx, 0.0, floor_z + 0.32), (0.16, 0.34, 0.05), warning if i == 1 else mech, collection, 0.003)
    # Breaker / crusher house: the dominant aft mass inside the well.
    add_box("Hopper_BreakerHouse", (cx - hx + 0.72, 0.0, floor_z + 0.52), (0.58, 0.92, 0.40), armor, collection, 0.008)
    add_cylinder("Hopper_BreakerDrum", (cx - hx + 0.72, 0.0, floor_z + 0.62), 0.34, 0.88, mech, collection, 14, 0.004, (math.pi / 2, 0, 0))
    add_box("Hopper_BreakerAnvil", (cx - hx + 0.72, 0.0, floor_z + 0.28), (0.40, 0.70, 0.10), ceramic, collection, 0.004)
    add_box("Hopper_FeedThroat", (cx - hx + 0.22, 0.0, floor_z + 0.22), (0.22, 0.52, 0.16), thruster, collection, 0.004)
    # Two large gate leaves spanning the well — readable at D=144.
    add_box("Hopper_GateP", (cx - hx + 0.52, -0.52, floor_z + 0.48), (0.12, 0.38, 0.38), mech, collection, 0.005)
    add_box("Hopper_GateS", (cx - hx + 0.52, 0.52, floor_z + 0.48), (0.12, 0.38, 0.38), mech, collection, 0.005)
    add_box("Hopper_GateBar", (cx - hx + 0.52, 0.0, floor_z + 0.78), (0.10, 0.92, 0.06), armor, collection, 0.003)
    n_rib = 4 if lod == 0 else (3 if lod == 1 else 2)
    rib_span = 2.40
    for i in range(n_rib):
        ox = -rib_span * 0.5 + (rib_span / max(1, n_rib - 1)) * i
        add_box(f"Hopper_RibP_{i}", (cx + ox, -hy + 0.14, 0.08), (0.10, 0.08, 0.74), mech, collection, 0.003)
        add_box(f"Hopper_RibS_{i}", (cx + ox, hy - 0.14, 0.08), (0.10, 0.08, 0.74), mech, collection, 0.003)
    if lod <= 1:
        add_box("Hopper_LinerCapP", (cx, -hy + 0.10, 0.55), (hx * 0.72, 0.04, 0.06), ceramic, collection, 0.002)
        add_box("Hopper_LinerCapS", (cx, hy - 0.10, 0.55), (hx * 0.72, 0.04, 0.06), ceramic, collection, 0.002)


def add_command_cage(lod, mats, collection):
    """Armored greenhouse: two/three broad dark-cyan panes, thick brow, side glass, pressure neck."""
    canopy, armor, mech = (mats["Material_Canopy"], mats["Material_Armor"], mats["Material_Mechanical"])
    hull = mats["Material_Hull"]
    x, y, z = 6.35, 0.0, 1.35
    # Structural pressure neck — reads as the cab's root, not a service box.
    add_box("Cab_Neck", (x - 1.55, y, z - 0.42), (0.88, 1.55, 0.38), hull, collection, 0.014)
    add_box("Cab_NeckRing", (x - 1.12, y, z - 0.08), (0.22, 1.38, 0.16), armor, collection, 0.008)
    add_box("Cab_Tub", (x - 0.08, y, z - 0.22), (1.32, 1.28, 0.16), armor, collection, 0.010)
    add_box("Cab_Sill", (x + 0.22, y, z + 0.02), (1.18, 1.18, 0.06), armor, collection, 0.004)
    # Vertical relief: roof sits well above the bow deck so abeam/chase can see a cab mass.
    add_box("Cab_AftBulk", (x - 1.22, y, z + 0.38), (0.12, 1.22, 0.48), armor, collection, 0.006)
    add_box("Cab_CheekP", (x + 0.05, y - 1.32, z + 0.28), (1.15, 0.14, 0.48), armor, collection, 0.006)
    add_box("Cab_CheekS", (x + 0.05, y + 1.32, z + 0.28), (1.15, 0.14, 0.48), armor, collection, 0.006)
    add_box("Cab_ShoulderP", (x - 0.55, y - 1.72, z - 0.08), (0.78, 0.22, 0.28), hull, collection, 0.006)
    add_box("Cab_ShoulderS", (x - 0.55, y + 1.72, z - 0.08), (0.78, 0.22, 0.28), hull, collection, 0.006)
    # Bridge wings: wheelhouse armor stepping out to the sponson shoulders. Adds useful
    # near-camera beam in the abeam view without lengthening the cutter booms.
    add_box("Cab_BridgeP", (x - 0.20, y - 2.15, z + 0.16), (0.88, 0.42, 0.20), armor, collection, 0.006)
    add_box("Cab_BridgeS", (x - 0.20, y + 2.15, z + 0.16), (0.88, 0.42, 0.20), armor, collection, 0.006)
    add_box("Cab_BridgeCapP", (x + 0.25, y - 2.42, z + 0.34), (0.38, 0.22, 0.08), hull, collection, 0.004)
    add_box("Cab_BridgeCapS", (x + 0.25, y + 2.42, z + 0.34), (0.38, 0.22, 0.08), hull, collection, 0.004)
    # Thick brow visor — the D=144 cab identifier.
    add_box("Cab_Brow", (x + 1.28, y, z + 0.62), (0.22, 1.38, 0.22), armor, collection, 0.008)
    add_box("Cab_BrowCap", (x + 0.92, y, z + 0.82), (0.55, 1.28, 0.07), armor, collection, 0.004)
    add_box("Cab_BrowWingP", (x + 1.05, y - 1.55, z + 0.58), (0.32, 0.22, 0.16), armor, collection, 0.004)
    add_box("Cab_BrowWingS", (x + 1.05, y + 1.55, z + 0.58), (0.32, 0.22, 0.16), armor, collection, 0.004)
    add_box("Cab_RoofFrameP", (x + 0.05, y - 0.92, z + 0.78), (1.05, 0.08, 0.06), armor, collection, 0.003)
    add_box("Cab_RoofFrameS", (x + 0.05, y + 0.92, z + 0.78), (1.05, 0.08, 0.06), armor, collection, 0.003)
    add_box("Cab_RoofFrameA", (x - 1.05, y, z + 0.78), (0.08, 0.92, 0.06), armor, collection, 0.003)
    add_box("Cab_RoofFrameF", (x + 1.08, y, z + 0.78), (0.08, 0.92, 0.06), armor, collection, 0.003)
    pane_h = 0.045
    if lod <= 1:
        # Three broad roof panes (port / center / starboard), not a radiator mullion grid.
        add_box("Cab_RoofPane_P", (x + 0.08, y - 0.62, z + 0.72), (0.88, 0.42, pane_h), canopy, collection, 0.002)
        add_box("Cab_RoofPane_C", (x + 0.08, y, z + 0.72), (0.88, 0.42, pane_h), canopy, collection, 0.002)
        add_box("Cab_RoofPane_S", (x + 0.08, y + 0.62, z + 0.72), (0.88, 0.42, pane_h), canopy, collection, 0.002)
        add_box("Cab_Mullion_P", (x + 0.08, y - 0.32, z + 0.78), (0.92, 0.07, 0.05), armor, collection, 0.002)
        add_box("Cab_Mullion_S", (x + 0.08, y + 0.32, z + 0.78), (0.92, 0.07, 0.05), armor, collection, 0.002)
        # Forward windshield under the brow — two broad panes.
        add_box("Cab_FwdPane_P", (x + 1.32, y - 0.55, z + 0.38), (0.05, 0.48, 0.28), canopy, collection, 0.002)
        add_box("Cab_FwdPane_S", (x + 1.32, y + 0.55, z + 0.38), (0.05, 0.48, 0.28), canopy, collection, 0.002)
        add_box("Cab_FwdMullion", (x + 1.32, y, z + 0.38), (0.06, 0.08, 0.28), armor, collection, 0.002)
        # Side glazing — large vertical panes, not slit vents.
        add_box("Cab_SidePaneP", (x + 0.12, y - 1.42, z + 0.38), (0.72, 0.05, 0.32), canopy, collection, 0.002)
        add_box("Cab_SidePaneS", (x + 0.12, y + 1.42, z + 0.38), (0.72, 0.05, 0.32), canopy, collection, 0.002)
        add_box("Cab_AftPane", (x - 1.28, y, z + 0.42), (0.05, 0.72, 0.28), canopy, collection, 0.002)
    else:
        add_box("Cab_GlassMass", (x + 0.08, y, z + 0.70), (0.92, 1.05, 0.10), canopy, collection, 0.003)
        add_box("Cab_FwdGlass", (x + 1.30, y, z + 0.36), (0.06, 0.95, 0.28), canopy, collection, 0.003)
        add_box("Cab_SideGlassP", (x + 0.10, y - 1.40, z + 0.36), (0.65, 0.05, 0.26), canopy, collection, 0.003)
        add_box("Cab_SideGlassS", (x + 0.10, y + 1.40, z + 0.36), (0.65, 0.05, 0.26), canopy, collection, 0.003)
    if lod == 0:
        add_box("Cab_Wiper", (x + 1.22, y - 0.22, z + 0.48), (0.03, 0.28, 0.02), mech, collection, 0.001)
        add_box("Cab_GuardBar", (x + 1.42, y, z + 0.18), (0.03, 0.85, 0.03), mech, collection, 0.001)
        add_box("Cab_LoadTieP", (x - 0.95, y - 0.95, z + 0.28), (0.28, 0.05, 0.05), mech, collection, 0.002)
        add_box("Cab_LoadTieS", (x - 0.95, y + 0.95, z + 0.28), (0.28, 0.05, 0.05), mech, collection, 0.002)


def add_pulse_plate_drive(side, y, lod, mats, collection):
    """Open dorsal pulse bed: stepped chamber, broad gapped plates, collar, vanes. Not a black square."""
    armor, mech = mats["Material_Armor"], mats["Material_Mechanical"]
    ceramic, thruster, hull = (mats["Material_Ceramic"], mats["Material_Thruster"], mats["Material_Hull"])
    radiator = mats["Material_Radiator"]
    x, z = -6.42, 0.22
    add_box(f"DriveBed_{side}", (x + 1.15, y, z - 0.08), (0.70, 0.82, 0.48), hull, collection, 0.012)
    add_box(f"DriveSaddle_{side}", (x + 1.42, y, z + 0.02), (0.20, 0.98, 0.42), armor, collection, 0.008)
    # Outer well — large enough that the chase camera sees an industrial bed, not a pit.
    add_open_rect_well(f"Pulse_{side}", x - 0.18, y, z - 0.42, z + 0.68, 0.78, 0.52, 0.16, mats, collection, thruster)
    # Stepped refractory WALLS (open frames, never a lid slab).
    add_box(f"PulseStep1P_{side}", (x - 0.18, y - 0.40, z + 0.12), (0.68, 0.07, 0.12), ceramic, collection, 0.003)
    add_box(f"PulseStep1S_{side}", (x - 0.18, y + 0.40, z + 0.12), (0.68, 0.07, 0.12), ceramic, collection, 0.003)
    add_box(f"PulseStep1F_{side}", (x + 0.42, y, z + 0.12), (0.08, 0.38, 0.12), ceramic, collection, 0.003)
    add_box(f"PulseStep1A_{side}", (x - 0.78, y, z + 0.12), (0.08, 0.38, 0.12), ceramic, collection, 0.003)
    add_box(f"PulseStep2P_{side}", (x - 0.18, y - 0.28, z + 0.28), (0.50, 0.06, 0.10), armor, collection, 0.003)
    add_box(f"PulseStep2S_{side}", (x - 0.18, y + 0.28, z + 0.28), (0.50, 0.06, 0.10), armor, collection, 0.003)
    add_box(f"PulseCollarP_{side}", (x - 0.18, y - 0.56, z + 0.74), (0.86, 0.07, 0.055), armor, collection, 0.004)
    add_box(f"PulseCollarS_{side}", (x - 0.18, y + 0.56, z + 0.74), (0.86, 0.07, 0.055), armor, collection, 0.004)
    add_box(f"PulseCollarF_{side}", (x + 0.56, y, z + 0.74), (0.08, 0.52, 0.055), armor, collection, 0.004)
    add_box(f"PulseCollarA_{side}", (x - 0.92, y, z + 0.74), (0.08, 0.52, 0.055), armor, collection, 0.004)
    add_box(f"PulseHeatSkirt_{side}", (x - 0.78, y, z + 0.52), (0.22, 0.50, 0.04), radiator, collection, 0.002)
    # Broad alternating plates with visible gaps — the dorsal bed read.
    n_plates = 5 if lod == 0 else (4 if lod == 1 else 3)
    plate_pitch = 0.22
    for i in range(n_plates):
        px = x - 0.62 + i * plate_pitch
        add_box(
            f"ImpulsePlate_{side}_{i}",
            (px, y, z + 0.18),
            (0.07, 0.36 - i * 0.012, 0.28),
            ceramic if i % 2 == 0 else armor,
            collection,
            0.002,
        )
    add_box(f"ChamberVaneP_{side}", (x - 0.18, y - 0.18, z + 0.20), (0.58, 0.04, 0.22), mech, collection, 0.002)
    add_box(f"ChamberVaneS_{side}", (x - 0.18, y + 0.18, z + 0.20), (0.58, 0.04, 0.22), mech, collection, 0.002)
    add_box(f"CollarFrame_{side}", (x - 0.88, y, z + 0.08), (0.06, 0.56, 0.38), ceramic, collection, 0.003)
    if lod <= 1:
        add_box(f"DriveClampP_{side}", (x + 0.42, y - 0.82, z + 0.12), (0.48, 0.09, 0.14), mech, collection, 0.003)
        add_box(f"DriveClampS_{side}", (x + 0.42, y + 0.82, z + 0.12), (0.48, 0.09, 0.14), mech, collection, 0.003)
        add_folded_sheet(
            f"ChamberVaneA_{side}",
            (x - 0.62, y - 0.22, z + 0.12),
            (x + 0.12, y - 0.22, z + 0.12),
            (x + 0.12, y + 0.22, z + 0.12),
            (x - 0.62, y + 0.22, z + 0.12),
            0.025,
            mech,
            collection,
            0.002,
        )
        add_box(f"AftTransition_{side}", (x + 0.95, y + (0.62 if y > 0 else -0.62), z + 0.26), (0.42, 0.20, 0.10), hull, collection, 0.005)
    if lod == 0:
        add_box(f"HeatSkirt_{side}", (x - 0.28, y, z - 0.48), (0.48, 0.62, 0.04), radiator, collection, 0.003)


def add_cutter_arm(tag, root, out_sign, along, head, lod, mats, collection, repair=False):
    """Heavy compact manipulator. Bigger tool silhouettes and turntable wells; booms stay short."""
    armor, mech = mats["Material_Armor"], mats["Material_Mechanical"]
    ceramic, warning = mats["Material_Ceramic"], mats["Material_Warning"]
    x, y, z = root
    add_cylinder(f"Turntable_{tag}", (x, y, z - 0.04), 0.92, 0.24, armor, collection, 18, 0.010, (0, 0, 0))
    add_cylinder(f"TurntableRing_{tag}", (x, y, z + 0.12), 0.76, 0.08, mech, collection, 14, 0.003, (0, 0, 0))
    add_cylinder(f"TurntablePin_{tag}", (x, y, z + 0.22), 0.22, 0.20, mech, collection, 10, 0.003, (0, 0, 0))
    add_box(f"WellLip_{tag}", (x, y, z + 0.28), (0.55, 0.55, 0.04), armor, collection, 0.004)
    add_box(f"YokeBase_{tag}", (x + 0.06 * along, y + 0.02 * out_sign, z + 0.34), (0.64, 0.50, 0.18), armor, collection, 0.008)
    add_box(f"YokeGusset_{tag}", (x - 0.12 * along, y + 0.02 * out_sign, z + 0.18), (0.24, 0.32, 0.16), armor, collection, 0.005)
    add_box(f"YokeCheekA_{tag}", (x + 0.12 * along, y - 0.24 * out_sign, z + 0.56), (0.36, 0.13, 0.30), mech, collection, 0.005)
    add_box(f"YokeCheekB_{tag}", (x + 0.12 * along, y + 0.22 * out_sign, z + 0.56), (0.36, 0.13, 0.30), mech, collection, 0.005)
    add_cylinder(f"YokePin_{tag}", (x + 0.14 * along, y + 0.02 * out_sign, z + 0.56), 0.09, 0.52, mech, collection, 8, 0.002, (math.pi / 2, 0, 0))
    p0 = (x + 0.28 * along, y + 0.10 * out_sign, z + 0.50)
    p1 = (x + 1.02 * along, y + 0.58 * out_sign, z + 0.18)
    add_hat_boom(f"Boom1_{tag}", p0, p1, 0.78, 0.50, mech, collection, 0.007)
    add_cylinder(f"Elbow_{tag}", p1, 0.26, 0.44, armor, collection, 12, 0.005, (math.pi / 2, 0, 0))
    p2 = (x + 1.42 * along, y + 0.98 * out_sign, z - 0.02)
    if lod <= 1:
        add_hat_boom(f"Boom2_{tag}", p1, p2, 0.58, 0.36, mech, collection, 0.005)
        add_cylinder(f"Wrist_{tag}", p2, 0.18, 0.32, armor, collection, 10, 0.003, (math.pi / 2, 0, 0))
        add_hydraulic(f"Piston_{tag}", (x + 0.10 * along, y + 0.04 * out_sign, z + 0.12), (p1[0], p1[1], p1[2] - 0.10), mats, collection)
    else:
        add_oriented_box(f"Boom2_{tag}", p1, p2, (0.30, 0.24), mech, collection, 0.005)
    # Broader heads, biased inward from the boom tip so jaws/guards grow toward the hull.
    hx, hy, hz = p2[0] + 0.26 * along, p2[1] + 0.04 * out_sign, p2[2] - 0.02
    add_box(f"HeadBlock_{tag}", (hx, hy, hz), (0.46, 0.42, 0.30), armor, collection, 0.008)
    add_box(f"HeadCollar_{tag}", (hx - 0.12 * along, hy, hz), (0.12, 0.40, 0.26), mech, collection, 0.003)
    if head == "saw":
        add_cylinder(f"SawDisk_{tag}", (hx + 0.20 * along, hy, hz), 0.60, 0.10, ceramic, collection, 16, 0.002, (0, math.pi / 2, 0))
        add_box(f"SawGuard_{tag}", (hx + 0.04 * along, hy - 0.02 * out_sign, hz + 0.32), (0.42, 0.50, 0.08), armor, collection, 0.003)
        add_box(f"SawHub_{tag}", (hx + 0.12 * along, hy, hz), (0.10, 0.14, 0.12), mech, collection, 0.002)
    elif head == "crusher":
        add_box(f"JawA_{tag}", (hx + 0.28 * along, hy - 0.20, hz), (0.40, 0.16, 0.24), armor, collection, 0.004)
        add_box(f"JawB_{tag}", (hx + 0.28 * along, hy + 0.20, hz), (0.40, 0.16, 0.24), armor, collection, 0.004)
        add_cylinder(f"JawPin_{tag}", (hx + 0.10 * along, hy, hz), 0.08, 0.46, mech, collection, 8, 0.002, (math.pi / 2, 0, 0))
        add_box(f"JawToothA_{tag}", (hx + 0.52 * along, hy - 0.20, hz), (0.10, 0.10, 0.10), ceramic, collection, 0.002)
        add_box(f"JawToothB_{tag}", (hx + 0.52 * along, hy + 0.20, hz), (0.10, 0.10, 0.10), ceramic, collection, 0.002)
    elif head == "drill":
        add_cylinder(f"DrillCollar_{tag}", (hx + 0.10 * along, hy, hz), 0.24, 0.22, armor, collection, 12, 0.003)
        add_cylinder(f"DrillBit_{tag}", (hx + 0.42 * along, hy, hz), 0.13, 0.58, ceramic, collection, 10, 0.003)
        add_box(f"DrillFlute_{tag}", (hx + 0.42 * along, hy, hz + 0.10), (0.26, 0.05, 0.05), mech, collection, 0.002)
    else:
        add_box(f"GrabA_{tag}", (hx + 0.36 * along, hy - 0.22, hz), (0.40, 0.10, 0.10), mech, collection, 0.003)
        add_box(f"GrabB_{tag}", (hx + 0.36 * along, hy + 0.22, hz), (0.40, 0.10, 0.10), mech, collection, 0.003)
        add_box(f"GrabC_{tag}", (hx + 0.36 * along, hy, hz - 0.16), (0.40, 0.10, 0.10), mech, collection, 0.003)
        add_cylinder(f"GrabHub_{tag}", (hx + 0.10 * along, hy, hz), 0.20, 0.22, armor, collection, 12, 0.003, (math.pi / 2, 0, 0))
    if repair:
        add_box(f"ArmRepair_{tag}", ((p0[0] + p1[0]) * 0.5, (p0[1] + p1[1]) * 0.5, p1[2] + 0.14), (0.26, 0.10, 0.03), warning, collection, 0.002)
    if lod == 0:
        hose_mid = ((p0[0] + p1[0]) * 0.5, (p0[1] + p1[1]) * 0.5, p1[2] + 0.18)
        add_curve_hose(f"ArmHose_{tag}", [p0, hose_mid, p1, p2], mech, collection, 0.018)
        add_box(f"HoseGuard_{tag}", hose_mid, (0.18, 0.08, 0.05), armor, collection, 0.002)
        add_box(f"ServiceRun_{tag}", ((p0[0] + p1[0]) * 0.5, (p0[1] + p1[1]) * 0.5 + 0.10 * out_sign, (p0[2] + p1[2]) * 0.5), (0.14, 0.05, 0.05), armor, collection, 0.002)


def add_winch_cluster(mats, collection):
    mech, armor, warning = (mats["Material_Mechanical"], mats["Material_Armor"], mats["Material_Warning"])
    x, y, z = 1.05, -2.55, 0.92
    add_box("WinchFrame", (x, y, z - 0.08), (0.42, 0.28, 0.16), armor, collection, 0.006)
    add_cylinder("WinchDrum", (x, y, z + 0.08), 0.18, 0.36, mech, collection, 14, 0.004, (math.pi / 2, 0, 0))
    add_box("WinchFairlead", (x + 0.38, y, z + 0.02), (0.10, 0.16, 0.10), mech, collection, 0.003)
    add_box("WinchGuard", (x, y, z + 0.22), (0.32, 0.22, 0.03), armor, collection, 0.003)
    add_box("CableSpool", (x - 0.55, y + 0.35, z - 0.04), (0.16, 0.16, 0.14), warning, collection, 0.004)
    add_cylinder("SpoolHub", (x - 0.55, y + 0.35, z + 0.08), 0.05, 0.12, mech, collection, 8, 0.002, (0, 0, 0))


def build_lod(lod, mats):
    collection = bpy.data.collections.new(f"IRONBACK_LOD{lod}")
    bpy.context.scene.collection.children.link(collection)
    hull, armor, mech = (mats["Material_Hull"], mats["Material_Armor"], mats["Material_Mechanical"])
    warning, ceramic = mats["Material_Warning"], mats["Material_Ceramic"]
    root = add_empty(f"IRONBACK_LOD{lod}_ROOT", (0, 0, 0), collection)
    root["spacefaceAsset"] = {
        "assetId": "SF_IRONBACK_PRODUCTION_V1",
        "partId": "ironback_production_v1",
        "lod": f"lod{lod}",
        "slot": "hull",
        "category": "wholeships",
        "forward": "+X",
        "embeddedPlume": False,
    }

    # Four structural pieces around an OPEN hopper. No centerline dorsal wrap, no solid hold lid.
    # Hopper inner opening is x=-2.20..+1.96, y=-1.12..+1.12 — keep all connecting decks outside that rectangle.
    spon_y, spon_hy, deck_z = 2.58, 0.54, 0.72
    spon_p = add_subdivided_box("Sponson_P", (0.15, -spon_y, 0.02), (4.55, spon_hy, 0.78), hull, collection, cuts=3, bevel=0.018)
    spon_s = add_subdivided_box("Sponson_S", (0.15, spon_y, 0.02), (4.55, spon_hy, 0.78), hull, collection, cuts=3, bevel=0.018)
    boolean_cut_cylinder(spon_p, "ArmWell_ForeP", (2.05, -spon_y, 0.72), 0.88, 0.55, (0, 0, 0), 16)
    boolean_cut_cylinder(spon_p, "ArmWell_AftP", (-1.35, -spon_y, 0.72), 0.88, 0.55, (0, 0, 0), 16)
    boolean_cut_cylinder(spon_s, "ArmWell_ForeS", (2.05, spon_y, 0.72), 0.88, 0.55, (0, 0, 0), 16)
    boolean_cut_cylinder(spon_s, "ArmWell_AftS", (-1.35, spon_y, 0.72), 0.88, 0.55, (0, 0, 0), 16)
    boolean_cut_box(spon_p, "SponCorner_ForeP", (4.40, -spon_y - 0.42, 0.42), (0.50, 0.28, 0.48))
    boolean_cut_box(spon_p, "SponCorner_AftP", (-4.10, -spon_y - 0.42, 0.42), (0.46, 0.28, 0.48))
    boolean_cut_box(spon_s, "SponCorner_ForeS", (4.40, spon_y + 0.42, 0.42), (0.50, 0.28, 0.48))
    boolean_cut_box(spon_s, "SponCorner_AftS", (-4.10, spon_y + 0.42, 0.42), (0.46, 0.28, 0.48))
    boolean_cut_box(spon_p, "Trench_P", (0.20, -spon_y + 0.06, 0.88), (3.35, 0.18, 0.22))
    boolean_cut_box(spon_s, "Trench_S", (0.20, spon_y - 0.06, 0.88), (3.35, 0.18, 0.22))

    fore = add_subdivided_box("Pressure_Fore", (5.15, 0.0, 0.16), (2.95, 1.62, 1.12), hull, collection, cuts=3, bevel=0.020)
    boolean_cut_box(fore, "CabWell", (6.40, 0.0, 1.42), (1.40, 1.22, 0.72))
    boolean_cut_box(fore, "ForeCornerP", (7.85, -1.42, 0.50), (0.36, 0.26, 0.42))
    boolean_cut_box(fore, "ForeCornerS", (7.85, 1.42, 0.50), (0.36, 0.26, 0.42))
    aft = add_subdivided_box("Pressure_Aft", (-5.35, 0.0, 0.04), (2.85, 1.55, 0.86), hull, collection, cuts=3, bevel=0.020)
    boolean_cut_box(aft, "PulseCut_P", (-6.55, -1.48, 0.62), (0.95, 0.62, 0.78))
    boolean_cut_box(aft, "PulseCut_S", (-6.55, 1.48, 0.62), (0.95, 0.62, 0.78))
    boolean_cut_box(aft, "AftCornerP", (-7.95, -1.28, 0.42), (0.34, 0.22, 0.40))
    boolean_cut_box(aft, "AftCornerS", (-7.95, 1.28, 0.42), (0.34, 0.22, 0.40))
    # Keel under the hopper only — connects port/starboard below the floor, never a dorsal lid.
    add_subdivided_box("Keel_HopperSpan", (-0.12, 0.0, -1.12), (2.35, 0.72, 0.12), hull, collection, cuts=2, bevel=0.010)
    print(f"lod{lod} perimeter verts: sponP={len(spon_p.data.vertices)} fore={len(fore.data.vertices)} aft={len(aft.data.vertices)}")

    add_hoop_frame("Frame_ForeStep", 2.15, 1.48, 0.82, 0.06, armor, collection, thick=0.040, half_w=0.06)
    add_hoop_frame("Frame_AftStep", -2.25, 1.52, 0.78, 0.04, armor, collection, thick=0.040, half_w=0.06)

    add_folded_sheet("BowPlate", (8.05, -1.28, 0.42), (8.18, -0.85, -0.18), (8.18, 0.85, -0.18), (8.05, 1.28, 0.42), 0.08, armor, collection, 0.005)
    add_box("BowRam", (7.92, 0.0, -0.08), (0.22, 1.22, 0.32), armor, collection, 0.006)
    add_box("Transom", (-8.12, 0.0, 0.02), (0.14, 1.85, 0.58), armor, collection, 0.006)
    add_folded_sheet("StepDeck_ForeP", (2.15, -1.55, 1.00), (2.85, -1.55, 0.82), (2.85, -0.55, 0.82), (2.15, -0.55, 1.00), 0.055, armor, collection, 0.003)
    add_folded_sheet("StepDeck_ForeS", (2.15, 0.55, 1.00), (2.85, 0.55, 0.82), (2.85, 1.55, 0.82), (2.15, 1.55, 1.00), 0.055, armor, collection, 0.003)
    add_folded_sheet("StepDeck_AftP", (-2.20, -1.65, 0.96), (-2.95, -1.65, 0.80), (-2.95, -0.55, 0.80), (-2.20, -0.55, 0.96), 0.055, armor, collection, 0.003)
    add_folded_sheet("StepDeck_AftS", (-2.20, 0.55, 0.96), (-2.95, 0.55, 0.80), (-2.95, 1.65, 0.80), (-2.20, 1.65, 0.96), 0.055, armor, collection, 0.003)

    add_box("TrenchFloor_P", (0.20, -spon_y + 0.06, 0.68), (3.25, 0.14, 0.04), mech, collection, 0.003)
    add_box("TrenchFloor_S", (0.20, spon_y - 0.06, 0.68), (3.25, 0.14, 0.04), mech, collection, 0.003)
    add_box("TrenchRail_P", (0.20, -spon_y + 0.22, 0.82), (3.15, 0.04, 0.05), armor, collection, 0.002)
    add_box("TrenchRail_S", (0.20, spon_y - 0.22, 0.82), (3.15, 0.04, 0.05), armor, collection, 0.002)

    n_plates = 4 if lod == 0 else (3 if lod == 1 else 2)
    for i in range(n_plates):
        px = -2.65 + i * 1.70
        lift = 0.055 if i % 2 else 0.0
        add_overlap_plate(f"SponPlate_P_{i}", (px, -spon_y, deck_z + 0.16 + lift), (0.92, 0.46, 0.07), hull if i % 2 else armor, collection, 0.006)
        add_overlap_plate(f"SponPlate_S_{i}", (px, spon_y, deck_z + 0.16 + lift), (0.92, 0.46, 0.07), hull if i % 2 else armor, collection, 0.006)
    add_overlap_plate("ForePlate_P", (4.05, -1.22, 1.12), (0.95, 0.42, 0.07), armor, collection, 0.005)
    add_overlap_plate("ForePlate_S", (4.05, 1.22, 1.12), (0.95, 0.42, 0.07), armor, collection, 0.005)
    add_overlap_plate("ForePlate_C", (4.55, 0.0, 1.18), (0.62, 0.55, 0.06), hull, collection, 0.005)
    add_overlap_plate("AftPlate_P", (-3.65, -1.35, 1.02), (0.88, 0.40, 0.07), armor, collection, 0.005)
    add_overlap_plate("AftPlate_S", (-3.65, 1.35, 1.02), (0.88, 0.40, 0.07), armor, collection, 0.005)
    add_box("LoadRib_P", (0.10, -1.78, 0.68), (3.15, 0.10, 0.32), mech, collection, 0.005)
    add_box("LoadRib_S", (0.10, 1.78, 0.68), (3.15, 0.10, 0.32), mech, collection, 0.005)
    add_box("LoadRib_ForeP", (4.35, -0.72, 0.92), (1.05, 0.08, 0.22), mech, collection, 0.004)
    add_box("LoadRib_ForeS", (4.35, 0.72, 0.92), (1.05, 0.08, 0.22), mech, collection, 0.004)
    add_box("LoadRib_Aft", (-4.55, 0.0, 0.72), (1.15, 0.10, 0.20), mech, collection, 0.004)
    add_box("PulseSpine", (-5.15, 0.0, 0.88), (1.35, 0.14, 0.12), armor, collection, 0.005)
    add_box("Stringer_P", (0.15, -spon_y + 0.22, deck_z + 0.24), (3.65, 0.07, 0.07), mech, collection, 0.003)
    add_box("Stringer_S", (0.15, spon_y - 0.22, deck_z + 0.24), (3.65, 0.07, 0.07), mech, collection, 0.003)
    add_box("Chine_P", (0.20, -2.95, -0.48), (3.85, 0.09, 0.18), armor, collection, 0.005)
    add_box("Chine_S", (0.20, 2.95, -0.48), (3.85, 0.09, 0.18), armor, collection, 0.005)
    add_box("ShoulderCap_P", (0.15, -spon_y, 0.90), (1.65, 0.36, 0.08), armor, collection, 0.005)
    add_box("ShoulderCap_S", (0.15, spon_y, 0.90), (1.65, 0.36, 0.08), armor, collection, 0.005)

    add_processing_hopper(lod, mats, collection)
    add_command_cage(lod, mats, collection)
    add_pulse_plate_drive("Port", -1.48, lod, mats, collection)
    add_pulse_plate_drive("Starboard", 1.48, lod, mats, collection)

    add_cutter_arm("ForeP", (2.05, -spon_y, 0.58), -1, 1, "saw", lod, mats, collection)
    add_cutter_arm("ForeS", (2.05, spon_y, 0.58), 1, 1, "crusher", lod, mats, collection)
    add_cutter_arm("AftP", (-1.35, -spon_y, 0.58), -1, -1, "drill", lod, mats, collection)
    add_cutter_arm("AftS", (-1.35, spon_y, 0.58), 1, -1, "grab", lod, mats, collection, repair=True)

    add_winch_cluster(mats, collection)
    add_box("RepairPatch", (1.65, 2.25, 0.98), (0.36, 0.18, 0.03), warning, collection, 0.003)
    add_box("KeelSpine", (0.10, 0.0, -1.32), (5.2, 0.32, 0.09), mech, collection, 0.008)
    add_box("Skid_P", (0.20, -1.35, -1.40), (4.2, 0.14, 0.07), armor, collection, 0.005)
    add_box("Skid_S", (0.20, 1.35, -1.40), (4.2, 0.14, 0.07), armor, collection, 0.005)
    add_box("CargoHardP", (-0.40, -0.95, -1.50), (0.48, 0.16, 0.07), mech, collection, 0.003)
    add_box("CargoHardS", (-0.40, 0.95, -1.50), (0.48, 0.16, 0.07), mech, collection, 0.003)

    if lod <= 1:
        add_radiator_cassette("P", (0.55, -2.35, 0.42), lod, mats, collection, length=1.35, height=0.34)
        add_radiator_cassette("S", (0.55, 2.35, 0.42), lod, mats, collection, length=1.35, height=0.34)
        add_box("ThermalP", (-3.20, -2.25, 0.88), (0.72, 0.38, 0.07), ceramic, collection, 0.004)
        add_box("ThermalS", (-3.20, 2.25, 0.88), (0.72, 0.38, 0.07), ceramic, collection, 0.004)
        add_box("BowCeramicP", (6.15, -1.12, 0.72), (0.58, 0.28, 0.06), ceramic, collection, 0.003)
        add_box("BowCeramicS", (6.15, 1.12, 0.72), (0.58, 0.28, 0.06), ceramic, collection, 0.003)
        add_rcs_cluster("P", (-1.2, -2.75, 0.12), mats, collection, sign=-1)
        add_rcs_cluster("S", (-1.2, 2.75, 0.12), mats, collection, sign=1)
        add_cylinder("TurretRing", (3.55, 0.0, 1.12), 0.26, 0.08, mech, collection, 12, 0.004, (0, 0, 0))
        add_box("TurretHead", (3.68, 0.0, 1.24), (0.22, 0.14, 0.06), armor, collection, 0.003)
        add_box("HatchLid", (3.15, 0.72, 0.96), (0.32, 0.20, 0.035), armor, collection, 0.003)
        add_box("HatchHinge", (2.92, 0.72, 0.98), (0.035, 0.14, 0.025), mech, collection, 0.002)
    else:
        add_box("Radiator_LOD2_P", (0.55, -2.35, 0.42), (0.72, 0.07, 0.18), mats["Material_Radiator"], collection, 0.005)
        add_box("Radiator_LOD2_S", (0.55, 2.35, 0.42), (0.72, 0.07, 0.18), mats["Material_Radiator"], collection, 0.005)
    if lod == 0:
        add_box("CatwalkAft", (-3.35, 0.0, 0.92), (0.85, 0.12, 0.025), mech, collection, 0.002)
        add_box("LightP", (2.85, -2.95, 0.78), (0.07, 0.07, 0.05), warning, collection, 0.002)
        add_box("LightS", (2.85, 2.95, 0.78), (0.07, 0.07, 0.05), warning, collection, 0.002)
        add_cylinder("CommMast", (3.85, 0.48, 1.28), 0.035, 0.42, mech, collection, 8, 0.002, (0, 0, 0))

    mesh_objects = [obj for obj in collection.objects if obj.type == "MESH"]
    for obj in mesh_objects:
        obj.parent = root

    groups = {}
    for obj in mesh_objects:
        name = obj.data.materials[0].name if obj.data.materials else "Material_Hull"
        groups.setdefault(name, []).append(obj)
    merged = []
    for material_name, objects in sorted(groups.items()):
        objects = [obj for obj in objects if obj.data and len(obj.data.vertices) > 0]
        if not objects:
            continue
        bpy.ops.object.select_all(action="DESELECT")
        for obj in objects:
            obj.select_set(True)
        active = objects[0]
        bpy.context.view_layer.objects.active = active
        if len(objects) > 1:
            bpy.ops.object.join()
        active.name = f"LOD{lod}_{material_name.replace('Material_', '')}"
        active.data.name = active.name
        active.parent = root
        shade_and_uv(active)
        tri = active.modifiers.new("ExportTriangulate", "TRIANGULATE")
        tri.quad_method = "BEAUTY"
        bpy.context.view_layer.objects.active = active
        active.select_set(True)
        bpy.ops.object.modifier_apply(modifier=tri.name)
        if lod == 0 and material_name in {"Material_Hull", "Material_Armor", "Material_Mechanical"}:
            bake_ao_into_albedo(active)
        merged.append(active)

    for name, loc in sockets().items():
        add_empty(name, loc, collection, root)
    bm = bmesh.new()
    for point in [
        (8.1, 0, 0.2),
        (0, -4.3, 0.3),
        (0, 4.3, 0.3),
        (-8.0, -2.0, 0.2),
        (-8.0, 2.0, 0.2),
        (2.2, -1.8, -1.35),
        (2.2, 1.8, -1.35),
        (2.6, -4.3, -0.2),
        (2.6, 4.3, -0.2),
        (-2.0, -4.3, -0.2),
        (-2.0, 4.3, -0.2),
        (7.6, -1.8, 0.4),
        (7.6, 1.8, 0.4),
    ]:
        bm.verts.new(point)
    bm.verts.ensure_lookup_table()
    bmesh.ops.convex_hull(bm, input=list(bm.verts), use_existing_faces=False)
    collision_mesh = bpy.data.meshes.new("COLLISION_HULL_MESH")
    bm.to_mesh(collision_mesh)
    bm.free()
    collision = bpy.data.objects.new("COLLISION_HULL", collision_mesh)
    collection.objects.link(collision)
    collision.parent = root
    collision.hide_render = True
    collision["collision"] = True
    collision["nonRender"] = True
    hull_tris = next((sum(max(0, len(p.vertices) - 2) for p in obj.data.polygons) for obj in merged if "Hull" in obj.name), 0)
    return collection, {
        "lod": lod,
        "triangles": sum(sum(max(0, len(p.vertices) - 2) for p in obj.data.polygons) for obj in merged),
        "hullTriangles": hull_tris,
        "draws": len(merged),
        "materials": sorted(groups),
    }


def export_lod(collection, lod):
    out = FAMILY / "source" / "wholeships" / f"ironback_production_v1_lod{lod}.glb"
    out.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.object.select_all(action="DESELECT")
    for obj in collection.all_objects:
        obj.hide_viewport = False
        obj.hide_set(False)
        obj.select_set(True)
    tmp = out.with_suffix(".tmp.glb")
    bpy.ops.export_scene.gltf(
        filepath=str(tmp),
        export_format="GLB",
        use_selection=True,
        export_apply=True,
        export_yup=True,
        export_extras=True,
        export_animations=False,
        export_materials="EXPORT",
        export_texcoords=True,
        export_normals=True,
        export_tangents=True,
        export_image_format="AUTO",
    )
    for attempt in range(6):
        try:
            if out.exists():
                out.unlink()
            shutil.move(str(tmp), str(out))
            break
        except OSError:
            if attempt == 5:
                raise
            import time

            time.sleep(0.35 * (attempt + 1))
    return out


def look_at(obj, target=(0, 0, 0.1)):
    obj.rotation_euler = (Vector(target) - obj.location).to_track_quat("-Z", "Y").to_euler()


def setup_studio():
    scene = bpy.context.scene
    try:
        scene.render.engine = "BLENDER_EEVEE"
    except TypeError:
        scene.render.engine = "BLENDER_EEVEE_NEXT"
    scene.render.resolution_x = 1600
    scene.render.resolution_y = 900
    scene.render.image_settings.file_format = "PNG"
    scene.view_settings.look = "AgX - Medium High Contrast"
    scene.view_settings.exposure = 0.72
    world = scene.world
    world.use_nodes = True
    bg = world.node_tree.nodes.get("Background")
    bg.inputs["Color"].default_value = (0.038, 0.044, 0.052, 1)
    bg.inputs["Strength"].default_value = 0.68
    cam_data = bpy.data.cameras.new("CycleCam")
    camera = bpy.data.objects.new("CycleCam", cam_data)
    scene.collection.objects.link(camera)
    scene.camera = camera
    for name, loc, energy, color, size in (
        ("Key", (16, -18, 12), 9200, (0.90, 0.93, 1), 10),
        ("Fill", (4, 16, 8), 4000, (0.58, 0.65, 0.76), 8),
        ("ForeFill", (20, 2, 10), 4200, (0.72, 0.78, 0.88), 9),
        ("Rim", (-14, -5, 7), 4600, (0.76, 0.84, 0.96), 7),
        ("Kick", (-6, 10, -4), 2000, (0.72, 0.78, 0.88), 6),
    ):
        data = bpy.data.lights.new(name, "AREA")
        data.energy = energy
        data.color = color
        data.size = size
        obj = bpy.data.objects.new(name, data)
        scene.collection.objects.link(obj)
        obj.location = loc
        look_at(obj)
    return camera


def override_emission(meshes, color_fn, clay=False):
    backups = {}
    for obj in meshes:
        backups[obj.name] = [slot.material for slot in obj.material_slots]
        mat = bpy.data.materials.new(f"ISO_{obj.name}")
        mat.use_nodes = True
        mat.node_tree.nodes.clear()
        out = mat.node_tree.nodes.new("ShaderNodeOutputMaterial")
        color, strength = color_fn(obj)
        if clay:
            bsdf = mat.node_tree.nodes.new("ShaderNodeBsdfPrincipled")
            bsdf.inputs["Base Color"].default_value = (0.46, 0.46, 0.47, 1)
            bsdf.inputs["Metallic"].default_value = 0.0
            bsdf.inputs["Roughness"].default_value = 0.58
            mat.node_tree.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])
        else:
            emit = mat.node_tree.nodes.new("ShaderNodeEmission")
            emit.inputs["Color"].default_value = (*color, 1)
            emit.inputs["Strength"].default_value = strength
            mat.node_tree.links.new(emit.outputs["Emission"], out.inputs["Surface"])
        if obj.material_slots:
            obj.material_slots[0].material = mat
    return backups


def override_map_isolation(meshes, suffix):
    backups = {}
    for obj in meshes:
        backups[obj.name] = [slot.material for slot in obj.material_slots]
        src = obj.data.materials[0] if obj.data.materials else None
        img = None
        if src and src.use_nodes:
            img = next((n.image for n in src.node_tree.nodes if n.type == "TEX_IMAGE" and n.image and suffix in n.image.name), None)
        mat = bpy.data.materials.new(f"ISO_{suffix}_{obj.name}")
        mat.use_nodes = True
        mat.node_tree.nodes.clear()
        out = mat.node_tree.nodes.new("ShaderNodeOutputMaterial")
        emit = mat.node_tree.nodes.new("ShaderNodeEmission")
        emit.inputs["Strength"].default_value = 1.0
        if img:
            tex = mat.node_tree.nodes.new("ShaderNodeTexImage")
            tex.image = img
            mat.node_tree.links.new(tex.outputs["Color"], emit.inputs["Color"])
        else:
            emit.inputs["Color"].default_value = (0.3, 0.3, 0.3, 1)
        mat.node_tree.links.new(emit.outputs["Emission"], out.inputs["Surface"])
        if obj.material_slots:
            obj.material_slots[0].material = mat
    return backups


def restore_mats(meshes, backups):
    for obj in meshes:
        mats = backups.get(obj.name, [])
        for index, material in enumerate(mats):
            if index < len(obj.material_slots):
                obj.material_slots[index].material = material


def runtime_display_scale(objects):
    """Match live play size: hull targetLength 1.72 * Ironback collisionRadius 24."""
    mins = Vector((1e9, 1e9, 1e9))
    maxs = Vector((-1e9, -1e9, -1e9))
    for obj in objects:
        if obj.type != "MESH" or obj.hide_render:
            continue
        for corner in obj.bound_box:
            world = obj.matrix_world @ Vector(corner)
            mins.x = min(mins.x, world.x)
            mins.y = min(mins.y, world.y)
            mins.z = min(mins.z, world.z)
            maxs.x = max(maxs.x, world.x)
            maxs.y = max(maxs.y, world.y)
            maxs.z = max(maxs.z, world.z)
    extent_x = maxs.x - mins.x
    if extent_x < 1e-6:
        raise RuntimeError("ironback render import has no measurable +X extent")
    target = ASSEMBLY_HULL_UNITS * IRONBACK_COLLISION_RADIUS
    scale = target / extent_x
    print(f"runtime display scale {scale:.3f} (authored {extent_x:.2f} -> {target:.1f} WU)")
    return scale


def apply_render_scale(scale):
    pivot = bpy.data.objects.new("RuntimeDisplayScale", None)
    bpy.context.scene.collection.objects.link(pivot)
    for obj in list(bpy.context.scene.objects):
        if obj.parent is not None or obj.name == "RuntimeDisplayScale":
            continue
        if obj.type in {"CAMERA", "LIGHT"}:
            continue
        matrix = obj.matrix_world.copy()
        obj.parent = pivot
        obj.matrix_world = matrix
    pivot.scale = (scale, scale, scale)
    bpy.context.view_layer.update()
    return pivot


def projected_occupancy(scene, camera, meshes):
    from bpy_extras.object_utils import world_to_camera_view

    bpy.context.view_layer.update()
    xs, ys = [], []
    for obj in meshes:
        mesh = obj.data
        if not mesh or not mesh.vertices:
            continue
        mw = obj.matrix_world
        step = max(1, len(mesh.vertices) // 6000)
        for index, vert in enumerate(mesh.vertices):
            if index % step:
                continue
            ndc = world_to_camera_view(scene, camera, mw @ vert.co)
            if ndc.z < 0.0:
                continue
            xs.append(ndc.x)
            ys.append(ndc.y)
    if not xs:
        raise RuntimeError("ironback occupancy: no projected vertices")
    min_x, max_x = min(xs), max(xs)
    min_y, max_y = min(ys), max(ys)
    return {
        "minX": round(min_x, 5),
        "maxX": round(max_x, 5),
        "minY": round(min_y, 5),
        "maxY": round(max_y, 5),
        "widthFrac": round(max_x - min_x, 5),
        "heightFrac": round(max_y - min_y, 5),
        "widthPx1600": round((max_x - min_x) * 1600.0, 1),
        "cropped": bool(min_x < 0.0 or max_x > 1.0 or min_y < 0.0 or max_y > 1.0),
    }


def measure_supported_occupancy(camera, meshes, focus):
    scene = bpy.context.scene
    poses = {
        "play_chase": (DISTANCE_DEFAULT, 0.0, PLAY_CHASE_WIDTH_FRAC),
        "play_chase_abeam": (DISTANCE_DEFAULT, 90.0, PLAY_CHASE_WIDTH_FRAC),
        "play_chase_close": (DISTANCE_CLOSE, 0.0, PLAY_CHASE_CLOSE_WIDTH_FRAC),
    }
    measured = {}
    failures = []
    for name, (distance, heading, band) in poses.items():
        apply_chase_camera(camera, distance=distance, heading_deg=heading, focus=focus)
        rec = projected_occupancy(scene, camera, meshes)
        rec["band"] = [band[0], band[1]]
        rec["inBand"] = occupancy_in_band(
            rec["widthFrac"],
            close=name == "play_chase_close",
            cropped=rec["cropped"],
        )
        measured[name] = rec
        print(f"occupancy {name}: {rec['widthPx1600']:.1f}px ({rec['widthFrac']*100:.2f}%) crop={rec['cropped']}")
        if rec["cropped"]:
            failures.append(f"{name} crops the mesh (ndc x={rec['minX']:.3f}..{rec['maxX']:.3f} y={rec['minY']:.3f}..{rec['maxY']:.3f})")
        if not (band[0] <= rec["widthFrac"] <= band[1]):
            failures.append(f"{name} width {rec['widthFrac']*100:.2f}% outside {band[0]*100:.0f}-{band[1]*100:.0f}%")
    return measured, failures


def render_cycle(glb_path):
    """Render the legal review set from the exact finalized exported source GLB."""
    reset_scene()
    bpy.ops.import_scene.gltf(filepath=str(glb_path))
    imported = list(bpy.context.scene.objects)
    for obj in imported:
        if obj.type == "MESH" and (obj.get("collision") or obj.get("nonRender") or "COLLISION" in obj.name.upper()):
            obj.hide_render = True
    meshes = [obj for obj in imported if obj.type == "MESH" and not obj.hide_render]
    if not meshes:
        raise RuntimeError(f"no visible Ironback meshes imported from {glb_path}")
    display_scale = runtime_display_scale(meshes)
    apply_render_scale(display_scale)
    camera = setup_studio()
    out = FAMILY / "evidence" / "ironback" / "cycles" / f"cycle_{CYCLE:02d}"
    out.mkdir(parents=True, exist_ok=True)
    focus = (0.0, 0.0, 0.18 * display_scale)
    occupancy, occupancy_failures = measure_supported_occupancy(camera, meshes, focus)
    render_cycle_chase_stills(camera, out, focus=focus)

    backups = override_emission(meshes, lambda _o: ((0.46, 0.46, 0.47), 1.0), clay=True)
    render_chase_still(camera, out / "clay_play_chase.png", distance=DISTANCE_DEFAULT, heading_deg=0.0, focus=focus)
    restore_mats(meshes, backups)

    world_bg = bpy.context.scene.world.node_tree.nodes.get("Background")
    prior_strength = world_bg.inputs["Strength"].default_value
    world_bg.inputs["Strength"].default_value = 0.12
    render_chase_still(camera, out / "grazing_close.png", distance=DISTANCE_CLOSE, heading_deg=0.0, focus=focus)
    world_bg.inputs["Strength"].default_value = prior_strength

    ids = {
        "Hull": (0.75, 0.42, 0.22),
        "Armor": (0.08, 0.16, 0.18),
        "Mechanical": (0.45, 0.45, 0.48),
        "Canopy": (0.02, 0.08, 0.1),
        "Warning": (0.9, 0.4, 0.05),
        "Ceramic": (0.7, 0.55, 0.35),
        "Thruster": (0.55, 0.22, 0.08),
        "Radiator": (0.35, 0.22, 0.12),
    }

    def id_color(obj):
        for key, color in ids.items():
            if key.lower() in obj.name.lower():
                return color, 1.0
        return (0.4, 0.4, 0.4), 1.0

    backups = override_emission(meshes, id_color)
    render_chase_still(camera, out / "id_or_material_id.png", distance=DISTANCE_CLOSE, heading_deg=0.0, focus=focus)
    restore_mats(meshes, backups)

    backups = override_map_isolation(meshes, "orm")
    render_chase_still(camera, out / "orm_isolation.png", distance=DISTANCE_CLOSE, heading_deg=0.0, focus=focus)
    restore_mats(meshes, backups)
    backups = override_map_isolation(meshes, "normal")
    render_chase_still(camera, out / "normal_isolation.png", distance=DISTANCE_CLOSE, heading_deg=0.0, focus=focus)
    restore_mats(meshes, backups)

    still_hashes = {path.name: sha256(path) for path in sorted(out.glob("*.png"))}
    identity = {
        "schema": "spaceface.exactSourceEvidence.v1",
        "shipId": "ironback",
        "cycle": CYCLE,
        "source": str(glb_path.relative_to(ROOT)).replace("\\", "/"),
        "sourceSha256": sha256(glb_path),
        "renderer": "tools/blender/build_ironback_mtx.py+spaceface_chase_camera.py",
        "cameraContract": {
            "module": "tools/blender/spaceface_chase_camera.py",
            "fov_v_deg": FOV_V_DEG,
            "tilt_deg": TILT_DEG,
            "play_chase": {"distance": DISTANCE_DEFAULT, "heading_deg": 0.0},
            "play_chase_abeam": {"distance": DISTANCE_DEFAULT, "heading_deg": 90.0},
            "play_chase_close": {"distance": DISTANCE_CLOSE, "heading_deg": 0.0},
            "runtimeDisplayScale": display_scale,
            "runtimeDisplayTargetWU": ASSEMBLY_HULL_UNITS * IRONBACK_COLLISION_RADIUS,
            "clay_play_chase": {"distance": DISTANCE_DEFAULT, "heading_deg": 0.0, "material": "neutral_clay"},
            "grazing_close": {"distance": DISTANCE_CLOSE, "heading_deg": 0.0},
            "diagnostics": ["id_or_material_id.png", "orm_isolation.png", "normal_isolation.png"],
        },
        "occupancy": occupancy,
        "occupancyFailures": occupancy_failures,
        "views": ["play_chase.png", "play_chase_abeam.png", "play_chase_close.png", "clay_play_chase.png", "grazing_close.png", "orm_isolation.png", "normal_isolation.png", "id_or_material_id.png"],
        "stillSha256": still_hashes,
    }
    (out / "EVIDENCE_IDENTITY.json").write_text(json.dumps(identity, indent=2) + "\n", encoding="utf-8")
    return out, identity


def main():
    FAMILY.mkdir(parents=True, exist_ok=True)
    reset_scene()
    mats = create_materials()
    reports = []
    outputs = []
    for lod in (0, 1, 2):
        collection, report = build_lod(lod, mats)
        output = export_lod(collection, lod)
        report.update({"path": str(output.relative_to(FAMILY)).replace("\\", "/"), "bytes": output.stat().st_size, "sha256": sha256(output)})
        if report["hullTriangles"] < 800:
            raise RuntimeError(f"ironback lod{lod} hull {report['hullTriangles']} < 800")
        outputs.append(output)
        reports.append(report)
    stills, identity = render_cycle(outputs[0])
    occupancy = identity.get("occupancy", {})
    occupancy_failures = identity.get("occupancyFailures", [])
    report = {
        "schema": "spaceface.ironbackMtx.cycle.v1",
        "shipId": "ironback",
        "cycle": CYCLE,
        "lods": reports,
        "stills": str(stills.relative_to(FAMILY)).replace("\\", "/"),
        "sourceSha256": identity["sourceSha256"],
        "renderer": identity["renderer"],
        "cameraContract": identity["cameraContract"],
        "occupancy": occupancy,
        "stillSha256": identity["stillSha256"],
        "disposition": "revise",
        "method": "open_well_perimeter_barge",
    }
    (FAMILY / "evidence" / "ironback").mkdir(parents=True, exist_ok=True)
    (FAMILY / "evidence" / "ironback" / f"cycle_{CYCLE:02d}.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({
        "ok": True,
        "cycle": CYCLE,
        "hull0": reports[0]["hullTriangles"],
        "tris0": reports[0]["triangles"],
        "sha0": reports[0]["sha256"],
        "occupancy": {name: rec.get("widthFrac") for name, rec in occupancy.items()},
        "occupancyFailures": occupancy_failures,
    }, indent=2))
    if occupancy_failures:
        raise RuntimeError("ironback occupancy failed: " + "; ".join(occupancy_failures))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

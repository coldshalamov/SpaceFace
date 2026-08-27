"""PQ-050.04 Ironback MTX builder. Hitch untouched. --mtx-cycle N writes exact-GLB chase stills.

Cycle 19 is a material correction of the retained Cycle-18 pressure-frame barge:
deep processing hopper, heavy compact arm packaging, forward command cage, twin
pulse-plate beds, and dorsal relief. Cycle 18 source/evidence stay untouched.

Usage::

  blender --background --python tools/blender/build_ironback_mtx.py -- --mtx-cycle 19
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
    add_stepped_wrap,
    apply_modifiers,
    boolean_cut_box,
    boolean_union,
)
from spaceface_chase_camera import (  # noqa: E402
    DISTANCE_CLOSE,
    DISTANCE_DEFAULT,
    FOV_V_DEG,
    PLAY_CHASE_CLOSE_WIDTH_FRAC,
    PLAY_CHASE_WIDTH_FRAC,
    TILT_DEG,
    apply_chase_camera,
    render_chase_still,
    render_cycle_chase_stills,
)

FAMILY = ROOT / "assets" / "ships" / "fleet_player_bodies_v1" / "ironback"
TEX_DIR = FAMILY / "source" / "textures"
TEX = 1024
CYCLE = 19
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
        "Material_Canopy": ((0.06, 0.14, 0.18), 0.00, 0.08, "glass", 0.22, ((0.04, 0.10, 0.14), 0.10)),
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


def add_processing_hopper(lod, mats, collection):
    """Deep receiving well: thick walls, lowered floor, liner, ribs, grizzly, breaker path."""
    hull, armor, mech = (mats["Material_Hull"], mats["Material_Armor"], mats["Material_Mechanical"])
    warning, ceramic, thruster = (mats["Material_Warning"], mats["Material_Ceramic"], mats["Material_Thruster"])
    cx, cy, rim_z, floor_z = -0.20, 0.0, 1.42, -0.92
    hx, hy, wall = 2.05, 1.48, 0.34
    mid_z = (rim_z + floor_z) * 0.5
    wall_h = (rim_z - floor_z) * 0.50
    # Dark processing floor and a still-darker intake pit — not a tan lid.
    add_box("Hopper_Floor", (cx, cy, floor_z), (hx - 0.18, hy - 0.18, 0.08), thruster, collection, 0.006)
    add_box("Hopper_Pit", (cx - 0.35, cy, floor_z + 0.06), (hx * 0.42, hy * 0.38, 0.05), mats["Material_Radiator"], collection, 0.003)
    add_box("Hopper_WallP", (cx, cy - hy, mid_z), (hx + 0.12, wall, wall_h), hull, collection, 0.012)
    add_box("Hopper_WallS", (cx, cy + hy, mid_z), (hx + 0.12, wall, wall_h), hull, collection, 0.012)
    add_box("Hopper_WallF", (cx + hx, cy, mid_z), (wall, hy + 0.08, wall_h), hull, collection, 0.012)
    add_box("Hopper_WallA", (cx - hx, cy, mid_z), (wall, hy + 0.08, wall_h), hull, collection, 0.012)
    add_box("Hopper_LinerP", (cx, cy - hy + 0.22, mid_z - 0.04), (hx - 0.22, 0.055, wall_h * 0.86), ceramic, collection, 0.004)
    add_box("Hopper_LinerS", (cx, cy + hy - 0.22, mid_z - 0.04), (hx - 0.22, 0.055, wall_h * 0.86), ceramic, collection, 0.004)
    add_box("Hopper_LinerF", (cx + hx - 0.22, cy, mid_z - 0.04), (0.055, hy - 0.28, wall_h * 0.86), ceramic, collection, 0.004)
    add_box("Hopper_LinerA", (cx - hx + 0.22, cy, mid_z - 0.04), (0.055, hy - 0.28, wall_h * 0.86), ceramic, collection, 0.004)
    add_box("Hopper_RimF", (cx + hx + 0.06, cy, rim_z), (0.20, hy + 0.28, 0.11), armor, collection, 0.010)
    add_box("Hopper_RimA", (cx - hx - 0.06, cy, rim_z), (0.20, hy + 0.28, 0.11), armor, collection, 0.010)
    add_box("Hopper_RimP", (cx, cy - hy - 0.06, rim_z), (hx + 0.24, 0.20, 0.11), armor, collection, 0.010)
    add_box("Hopper_RimS", (cx, cy + hy + 0.06, rim_z), (hx + 0.24, 0.20, 0.11), armor, collection, 0.010)
    add_box("Hopper_HazardP", (cx, cy - hy - 0.06, rim_z + 0.10), (hx * 0.88, 0.08, 0.035), warning, collection, 0.003)
    add_box("Hopper_HazardS", (cx, cy + hy + 0.06, rim_z + 0.10), (hx * 0.88, 0.08, 0.035), warning, collection, 0.003)
    add_cylinder("Hopper_RimRollP", (cx, cy - hy, rim_z + 0.02), 0.09, hx * 1.65, armor, collection, 12, 0.005, (0, math.pi / 2, 0))
    add_cylinder("Hopper_RimRollS", (cx, cy + hy, rim_z + 0.02), 0.09, hx * 1.65, armor, collection, 12, 0.005, (0, math.pi / 2, 0))
    add_cylinder("Hopper_RimRollF", (cx + hx, cy, rim_z + 0.02), 0.09, hy * 1.55, armor, collection, 12, 0.005, (math.pi / 2, 0, 0))
    add_cylinder("Hopper_RimRollA", (cx - hx, cy, rim_z + 0.02), 0.09, hy * 1.55, armor, collection, 12, 0.005, (math.pi / 2, 0, 0))
    if lod <= 1:
        for i, ox in enumerate((-1.35, -0.55, 0.25, 1.05)):
            add_box(f"Hopper_RibP_{i}", (cx + ox, cy - hy + 0.18, 0.22), (0.07, 0.08, 0.92), mech, collection, 0.004)
            add_box(f"Hopper_RibS_{i}", (cx + ox, cy + hy - 0.18, 0.22), (0.07, 0.08, 0.92), mech, collection, 0.004)
        add_box("Hopper_GateP", (cx - hx + 0.42, cy - 0.52, floor_z + 0.38), (0.16, 0.42, 0.28), mech, collection, 0.006)
        add_box("Hopper_GateS", (cx - hx + 0.42, cy + 0.52, floor_z + 0.38), (0.16, 0.42, 0.28), mech, collection, 0.006)
        add_box("Hopper_BreakerHouse", (cx - hx + 0.55, cy, floor_z + 0.62), (0.42, 0.92, 0.38), armor, collection, 0.008)
        add_cylinder("Hopper_BreakerDrum", (cx - hx + 0.62, cy, floor_z + 0.72), 0.22, 0.78, mech, collection, 12, 0.004, (math.pi / 2, 0, 0))
        add_box("Hopper_FeedThroat", (cx - hx + 0.18, cy, floor_z + 0.22), (0.22, 0.55, 0.16), thruster, collection, 0.004)
        add_box("Hopper_Channel", (cx + 0.15, cy, floor_z + 0.14), (hx * 0.55, 0.22, 0.06), mech, collection, 0.003)
        add_box("Hopper_ImpactA", (cx + 0.55, cy - 0.38, floor_z + 0.12), (0.28, 0.20, 0.05), ceramic, collection, 0.003)
        add_box("Hopper_ImpactB", (cx + 0.15, cy + 0.42, floor_z + 0.12), (0.24, 0.18, 0.05), ceramic, collection, 0.003)
        add_box("Hopper_Walk", (cx + hx + 0.55, cy, rim_z - 0.04), (0.42, 0.16, 0.03), mech, collection, 0.002)
    n_grizzly = 5 if lod == 0 else (3 if lod == 1 else 0)
    for i in range(n_grizzly):
        gx = cx - 0.85 + i * 0.48
        add_box(f"Hopper_Grizzly_{i}", (gx, cy, 0.18), (0.055, hy - 0.42, 0.045), mech, collection, 0.003)
    if lod == 0:
        add_box("Hopper_GrizzlyRailP", (cx, cy - hy + 0.42, 0.22), (hx - 0.35, 0.04, 0.04), armor, collection, 0.002)
        add_box("Hopper_GrizzlyRailS", (cx, cy + hy - 0.42, 0.22), (hx - 0.35, 0.04, 0.04), armor, collection, 0.002)


def add_command_cage(lod, mats, collection):
    """Forward armored greenhouse over the work deck. Not a shoulder console."""
    canopy, armor, mech = (mats["Material_Canopy"], mats["Material_Armor"], mats["Material_Mechanical"])
    hull = mats["Material_Hull"]
    x, y, z = 6.55, 0.0, 1.22
    add_box("Cab_Tub", (x - 0.08, y, z - 0.22), (1.05, 0.92, 0.16), armor, collection, 0.010)
    add_box("Cab_Plinth", (x - 0.12, y, z - 0.38), (1.12, 1.02, 0.10), hull, collection, 0.008)
    add_box("Cab_Sill", (x + 0.12, y, z - 0.02), (0.92, 0.98, 0.05), armor, collection, 0.005)
    add_box("Cab_Brow", (x + 0.88, y, z + 0.42), (0.18, 0.82, 0.22), armor, collection, 0.008)
    add_box("Cab_BrowCap", (x + 0.72, y, z + 0.58), (0.38, 0.70, 0.06), armor, collection, 0.004)
    add_box("Cab_AftBulk", (x - 0.98, y, z + 0.22), (0.10, 0.92, 0.38), armor, collection, 0.006)
    add_box("Cab_CheekP", (x + 0.05, y - 0.92, z + 0.18), (0.78, 0.08, 0.32), armor, collection, 0.005)
    add_box("Cab_CheekS", (x + 0.05, y + 0.92, z + 0.18), (0.78, 0.08, 0.32), armor, collection, 0.005)
    add_box("Cab_RoofBarA", (x - 0.15, y, z + 0.52), (0.72, 0.05, 0.04), armor, collection, 0.002)
    add_box("Cab_RoofBarB", (x + 0.28, y, z + 0.50), (0.05, 0.72, 0.04), armor, collection, 0.002)
    pane_w, pane_d, pane_h = 0.20, 0.12, 0.15
    if lod <= 1:
        for iy, py in enumerate((-0.42, 0.0, 0.42)):
            for ix, px in enumerate((-0.18, 0.28)):
                add_box(f"Cab_Pane_{ix}_{iy}", (x + px, y + py, z + 0.22), (pane_w, pane_d, pane_h), canopy, collection, 0.002)
            add_box(f"Cab_MullionY_{iy}", (x + 0.05, y + py, z + 0.22), (0.05, 0.04, 0.24), armor, collection, 0.002)
        add_box("Cab_MullionX", (x + 0.05, y, z + 0.08), (0.05, 0.82, 0.04), armor, collection, 0.002)
        add_box("Cab_AftPane", (x - 0.92, y, z + 0.28), (0.04, 0.38, 0.14), canopy, collection, 0.002)
    else:
        add_box("Cab_GlassMass", (x + 0.08, y, z + 0.22), (0.72, 0.70, 0.24), canopy, collection, 0.004)
    if lod == 0:
        add_box("Cab_Wiper", (x + 0.62, y - 0.18, z + 0.28), (0.04, 0.28, 0.025), mech, collection, 0.001)
        add_box("Cab_GuardBar", (x + 0.95, y, z + 0.18), (0.03, 0.72, 0.03), mech, collection, 0.001)


def add_pulse_plate_drive(side, y, lod, mats, collection):
    """Rooted pulse-plate bed with a dorsal chamber the chase camera can look into."""
    armor, mech = mats["Material_Armor"], mats["Material_Mechanical"]
    ceramic, thruster, hull = (mats["Material_Ceramic"], mats["Material_Thruster"], mats["Material_Hull"])
    x, z = -6.55, 0.12
    add_box(f"DriveBed_{side}", (x + 0.18, y, z), (1.55, 0.95, 0.82), hull, collection, 0.016)
    add_box(f"DriveArmor_{side}", (x + 0.12, y, z + 0.52), (1.28, 0.78, 0.12), armor, collection, 0.008)
    add_box(f"DriveSaddle_{side}", (x + 1.05, y, z - 0.04), (0.28, 1.08, 0.58), armor, collection, 0.010)
    add_box(f"DriveClampP_{side}", (x + 0.22, y - 0.82, z + 0.18), (0.55, 0.12, 0.16), mech, collection, 0.004)
    add_box(f"DriveClampS_{side}", (x + 0.22, y + 0.82, z + 0.18), (0.55, 0.12, 0.16), mech, collection, 0.004)
    add_box(f"ChamberCase_{side}", (x - 1.05, y, z), (0.58, 0.72, 0.62), mech, collection, 0.008)
    add_box(f"ChamberLiner_{side}", (x - 1.18, y, z), (0.38, 0.52, 0.46), ceramic, collection, 0.004)
    add_box(f"ChamberCollar_{side}", (x - 1.52, y, z), (0.12, 0.68, 0.54), armor, collection, 0.005)
    add_box(f"ChamberThroat_{side}", (x - 1.32, y, z), (0.22, 0.36, 0.32), thruster, collection, 0.003)
    add_box(f"DorsalLip_{side}", (x - 0.18, y, z + 0.92), (1.12, 0.72, 0.06), armor, collection, 0.004)
    add_box(f"DorsalWell_{side}", (x - 0.18, y, z + 0.58), (0.92, 0.58, 0.22), mech, collection, 0.004)
    add_box(f"DorsalPit_{side}", (x - 0.22, y, z + 0.38), (0.72, 0.42, 0.18), thruster, collection, 0.003)
    n_plates = 6 if lod == 0 else (4 if lod == 1 else 2)
    for i in range(n_plates):
        px = x - 0.55 - i * 0.13
        add_box(
            f"ImpulsePlate_{side}_{i}",
            (px, y, z + 0.42),
            (0.035, 0.38 - i * 0.018, 0.28),
            ceramic if i % 2 == 0 else thruster,
            collection,
            0.002,
        )
    if lod <= 1:
        for i, oz in enumerate((-0.14, 0.14)):
            add_folded_sheet(
                f"ChamberVane_{side}_{i}",
                (x - 1.38, y - 0.16, z + oz),
                (x - 0.78, y - 0.16, z + oz),
                (x - 0.78, y + 0.16, z + oz),
                (x - 1.38, y + 0.16, z + oz),
                0.022,
                mech,
                collection,
                0.002,
            )
        add_box(f"CollarFrame_{side}", (x - 1.48, y, z + 0.02), (0.06, 0.62, 0.48), ceramic, collection, 0.003)
        add_box(f"HeatStain_{side}", (x - 0.85, y, z + 0.78), (0.42, 0.38, 0.04), mats["Material_Radiator"], collection, 0.002)
    if lod == 0:
        add_box(f"HeatSkirt_{side}", (x - 0.95, y, z - 0.48), (0.52, 0.68, 0.05), mats["Material_Radiator"], collection, 0.003)
        for i in range(4):
            ang = math.tau * i / 4 + 0.18
            add_box(f"DriveBolt_{side}_{i}", (x - 1.38, y + math.cos(ang) * 0.42, z + math.sin(ang) * 0.28), (0.045, 0.045, 0.045), mech, collection, 0.002)


def add_cutter_arm(tag, root, out_sign, along, head, lod, mats, collection, repair=False):
    """Heavy compact manipulator: embedded turntable, yoke, hat booms, piston, distinct head."""
    armor, mech = mats["Material_Armor"], mats["Material_Mechanical"]
    ceramic, warning = mats["Material_Ceramic"], mats["Material_Warning"]
    x, y, z = root
    add_cylinder(f"Turntable_{tag}", (x, y, z), 0.92, 0.24, armor, collection, 20, 0.012, (0, 0, 0))
    add_cylinder(f"TurntableRing_{tag}", (x, y, z + 0.14), 0.78, 0.08, mech, collection, 16, 0.004, (0, 0, 0))
    add_cylinder(f"TurntablePin_{tag}", (x, y, z + 0.22), 0.22, 0.22, mech, collection, 12, 0.004, (0, 0, 0))
    add_box(f"YokeBase_{tag}", (x + 0.08 * along, y + 0.08 * out_sign, z + 0.36), (0.62, 0.48, 0.18), armor, collection, 0.010)
    add_box(f"YokeCheekA_{tag}", (x + 0.16 * along, y - 0.28 * out_sign, z + 0.62), (0.38, 0.14, 0.36), mech, collection, 0.006)
    add_box(f"YokeCheekB_{tag}", (x + 0.16 * along, y + 0.32 * out_sign, z + 0.62), (0.38, 0.14, 0.36), mech, collection, 0.006)
    add_cylinder(f"YokePin_{tag}", (x + 0.18 * along, y + 0.02 * out_sign, z + 0.62), 0.10, 0.62, mech, collection, 10, 0.003, (math.pi / 2, 0, 0))
    p0 = (x + 0.38 * along, y + 0.22 * out_sign, z + 0.52)
    p1 = (x + 1.28 * along, y + 0.95 * out_sign, z + 0.22)
    add_hat_boom(f"Boom1_{tag}", p0, p1, 0.82, 0.52, mech, collection, 0.008)
    add_cylinder(f"Elbow_{tag}", p1, 0.28, 0.48, armor, collection, 14, 0.006, (math.pi / 2, 0, 0))
    p2 = (x + 1.85 * along, y + 1.22 * out_sign, z - 0.02)
    if lod <= 1:
        add_hat_boom(f"Boom2_{tag}", p1, p2, 0.62, 0.40, mech, collection, 0.006)
        add_cylinder(f"Wrist_{tag}", p2, 0.20, 0.34, armor, collection, 12, 0.004, (math.pi / 2, 0, 0))
        add_hydraulic(f"Piston_{tag}", (x + 0.12 * along, y + 0.05 * out_sign, z + 0.18), (p1[0], p1[1], p1[2] - 0.12), mats, collection)
    else:
        add_oriented_box(f"Boom2_{tag}", p1, p2, (0.32, 0.26), mech, collection, 0.006)
    hx, hy, hz = p2[0] + 0.42 * along, p2[1] + 0.28 * out_sign, p2[2] - 0.04
    add_box(f"HeadBlock_{tag}", (hx, hy, hz), (0.48, 0.38, 0.32), armor, collection, 0.010)
    add_box(f"HeadCollar_{tag}", (hx - 0.12 * along, hy, hz), (0.12, 0.42, 0.28), mech, collection, 0.004)
    if head == "saw":
        add_cylinder(f"SawDisk_{tag}", (hx + 0.38 * along, hy, hz), 0.52, 0.09, ceramic, collection, 18, 0.002, (0, math.pi / 2, 0))
        add_box(f"SawGuard_{tag}", (hx + 0.12 * along, hy, hz + 0.28), (0.38, 0.42, 0.06), armor, collection, 0.003)
        add_box(f"SawHub_{tag}", (hx + 0.22 * along, hy, hz), (0.10, 0.12, 0.12), mech, collection, 0.002)
    elif head == "crusher":
        add_box(f"JawA_{tag}", (hx + 0.42 * along, hy - 0.18, hz), (0.40, 0.14, 0.24), armor, collection, 0.005)
        add_box(f"JawB_{tag}", (hx + 0.42 * along, hy + 0.18, hz), (0.40, 0.14, 0.24), armor, collection, 0.005)
        add_cylinder(f"JawPin_{tag}", (hx + 0.18 * along, hy, hz), 0.08, 0.46, mech, collection, 8, 0.002, (math.pi / 2, 0, 0))
        add_box(f"JawToothA_{tag}", (hx + 0.62 * along, hy - 0.18, hz), (0.08, 0.10, 0.08), ceramic, collection, 0.002)
        add_box(f"JawToothB_{tag}", (hx + 0.62 * along, hy + 0.18, hz), (0.08, 0.10, 0.08), ceramic, collection, 0.002)
    elif head == "drill":
        add_cylinder(f"DrillCollar_{tag}", (hx + 0.18 * along, hy, hz), 0.18, 0.22, armor, collection, 12, 0.004)
        add_cylinder(f"DrillBit_{tag}", (hx + 0.62 * along, hy, hz), 0.14, 0.85, ceramic, collection, 10, 0.003)
        add_box(f"DrillFlute_{tag}", (hx + 0.62 * along, hy, hz + 0.10), (0.32, 0.05, 0.05), mech, collection, 0.002)
    else:
        add_box(f"GrabA_{tag}", (hx + 0.52 * along, hy - 0.22, hz), (0.42, 0.10, 0.10), mech, collection, 0.003)
        add_box(f"GrabB_{tag}", (hx + 0.52 * along, hy + 0.22, hz), (0.42, 0.10, 0.10), mech, collection, 0.003)
        add_box(f"GrabC_{tag}", (hx + 0.52 * along, hy, hz - 0.18), (0.42, 0.10, 0.10), mech, collection, 0.003)
        add_cylinder(f"GrabHub_{tag}", (hx + 0.18 * along, hy, hz), 0.14, 0.22, armor, collection, 10, 0.003, (math.pi / 2, 0, 0))
    if repair:
        add_box(f"ArmRepair_{tag}", ((p0[0] + p1[0]) * 0.5, (p0[1] + p1[1]) * 0.5, p1[2] + 0.18), (0.32, 0.12, 0.04), warning, collection, 0.002)
    if lod == 0:
        hose_mid = ((p0[0] + p1[0]) * 0.5, (p0[1] + p1[1]) * 0.5, p1[2] + 0.22)
        add_curve_hose(f"ArmHose_{tag}", [p0, hose_mid, p1, p2], mech, collection, 0.022)
        add_box(f"HoseGuard_{tag}", hose_mid, (0.22, 0.10, 0.06), armor, collection, 0.002)
        add_box(f"ServiceRun_{tag}", ((p0[0] + p1[0]) * 0.5, (p0[1] + p1[1]) * 0.5 + 0.12 * out_sign, (p0[2] + p1[2]) * 0.5), (0.18, 0.06, 0.06), armor, collection, 0.002)


def add_winch_cluster(mats, collection):
    mech, armor, warning = (mats["Material_Mechanical"], mats["Material_Armor"], mats["Material_Warning"])
    x, y, z = 1.15, -2.55, 1.22
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

    # Stepped pressure frame: longer-than-wide barge, not a square slab or a dart.
    hold = add_subdivided_box("Pressure_Hold", (0.10, 0.0, 0.02), (4.90, 3.18, 1.28), hull, collection, cuts=4, bevel=0.026)
    bow = add_subdivided_box("Pressure_Bow", (6.35, 0.0, 0.04), (2.12, 2.18, 1.02), hull, collection, cuts=3, bevel=0.022)
    stern = add_subdivided_box("Pressure_Stern", (-6.25, 0.0, 0.00), (2.18, 2.82, 1.14), hull, collection, cuts=3, bevel=0.022)
    boolean_union(hold, bow)
    boolean_union(hold, stern)
    hold.name = "Pressure_Hull"
    print(f"lod{lod} hull verts after union: {len(hold.data.vertices)}")
    boolean_cut_box(hold, "HopperCut", (-0.20, 0.0, 0.32), (1.92, 1.32, 1.18))
    boolean_cut_box(hold, "CabCut", (6.55, 0.0, 1.18), (0.92, 0.72, 0.48))
    boolean_cut_box(hold, "DriveCutP", (-7.55, -1.82, 0.10), (0.78, 0.48, 0.42))
    boolean_cut_box(hold, "DriveCutS", (-7.55, 1.82, 0.10), (0.78, 0.48, 0.42))
    boolean_cut_box(hold, "DriveWellP", (-6.72, -1.82, 0.92), (0.82, 0.50, 0.38))
    boolean_cut_box(hold, "DriveWellS", (-6.72, 1.82, 0.92), (0.82, 0.50, 0.38))
    boolean_cut_box(hold, "TrenchP", (0.15, -1.92, 1.22), (3.15, 0.16, 0.20))
    boolean_cut_box(hold, "TrenchS", (0.15, 1.92, 1.22), (3.15, 0.16, 0.20))
    boolean_cut_box(hold, "DeckBayFore", (2.85, 0.0, 1.26), (0.72, 0.82, 0.14))
    boolean_cut_box(hold, "DeckBayAft", (-2.75, 0.85, 1.22), (0.52, 0.38, 0.12))
    print(f"lod{lod} hull verts after cuts: {len(hold.data.vertices)}")
    hold.data.materials.clear()
    hold.data.materials.append(hull)

    add_stepped_wrap(
        "Frame",
        [
            (8.12, 2.02, 0.92),
            (5.35, 2.18, 1.02),
            (4.55, 3.12, 1.24),
            (-4.40, 3.12, 1.22),
            (-5.20, 2.72, 1.10),
            (-8.18, 2.72, 1.08),
        ],
        hull,
        collection,
        thick=0.055,
        zc=0.04,
    )
    add_hoop_frame("Frame_ForeStep", 4.70, 2.55, 1.12, 0.08, armor, collection, thick=0.045, half_w=0.08)
    add_hoop_frame("Frame_AftStep", -4.70, 2.72, 1.10, 0.06, armor, collection, thick=0.045, half_w=0.08)
    add_hoop_frame("Frame_Hopper", -0.20, 2.05, 1.18, 0.10, armor, collection, thick=0.040, half_w=0.06)

    add_subdivided_box("Sponson_P", (0.25, -3.52, 0.04), (3.15, 0.58, 0.78), hull, collection, cuts=2, bevel=0.016)
    add_subdivided_box("Sponson_S", (0.25, 3.52, 0.04), (3.15, 0.58, 0.78), hull, collection, cuts=2, bevel=0.016)
    add_folded_sheet("StepDeck_Fore", (4.70, -2.05, 1.26), (5.35, -2.05, 1.04), (5.35, 2.05, 1.04), (4.70, 2.05, 1.26), 0.07, armor, collection, 0.004)
    add_folded_sheet("StepDeck_Aft", (-4.40, -2.55, 1.22), (-5.15, -2.55, 1.06), (-5.15, 2.55, 1.06), (-4.40, 2.55, 1.22), 0.07, armor, collection, 0.004)
    add_folded_sheet("BowPlate", (8.12, -1.85, 0.52), (8.28, -1.22, -0.12), (8.28, 1.22, -0.12), (8.12, 1.85, 0.52), 0.09, armor, collection, 0.006)
    add_box("BowRam", (7.95, 0.0, -0.02), (0.28, 1.55, 0.40), armor, collection, 0.008)
    add_box("Transom", (-8.22, 0.0, 0.04), (0.16, 2.35, 0.70), armor, collection, 0.008)
    add_overlap_plate("QuietDeck_P", (2.55, -2.15, 1.32), (1.05, 0.62, 0.055), hull, collection, 0.006)
    add_overlap_plate("QuietDeck_S", (2.55, 2.15, 1.32), (1.05, 0.62, 0.055), hull, collection, 0.006)
    add_overlap_plate("LoadPlate_P", (-2.15, -2.35, 1.30), (0.95, 0.48, 0.05), armor, collection, 0.006)
    add_overlap_plate("LoadPlate_S", (-2.15, 2.35, 1.30), (0.95, 0.48, 0.05), armor, collection, 0.006)
    add_box("Stringer_P", (0.10, -2.55, 1.34), (3.85, 0.07, 0.06), mech, collection, 0.004)
    add_box("Stringer_S", (0.10, 2.55, 1.34), (3.85, 0.07, 0.06), mech, collection, 0.004)
    add_box("Stringer_C", (2.40, 0.0, 1.36), (1.15, 0.06, 0.05), mech, collection, 0.003)
    add_box("Chine_P", (0.35, -3.22, -0.42), (3.55, 0.10, 0.22), armor, collection, 0.006)
    add_box("Chine_S", (0.35, 3.22, -0.42), (3.55, 0.10, 0.22), armor, collection, 0.006)
    add_box("ShoulderCap_P", (0.25, -3.52, 0.78), (1.85, 0.42, 0.08), armor, collection, 0.006)
    add_box("ShoulderCap_S", (0.25, 3.52, 0.78), (1.85, 0.42, 0.08), armor, collection, 0.006)

    add_processing_hopper(lod, mats, collection)
    add_command_cage(lod, mats, collection)
    add_pulse_plate_drive("Port", -1.82, lod, mats, collection)
    add_pulse_plate_drive("Starboard", 1.82, lod, mats, collection)

    add_cutter_arm("ForeP", (2.35, -3.52, 0.78), -1, 1, "saw", lod, mats, collection)
    add_cutter_arm("ForeS", (2.35, 3.52, 0.78), 1, 1, "crusher", lod, mats, collection)
    add_cutter_arm("AftP", (-1.55, -3.52, 0.78), -1, -1, "drill", lod, mats, collection)
    add_cutter_arm("AftS", (-1.55, 3.52, 0.78), 1, -1, "grab", lod, mats, collection, repair=True)

    add_winch_cluster(mats, collection)
    add_box("RepairPatch", (1.85, 2.15, 1.40), (0.42, 0.22, 0.035), warning, collection, 0.003)
    add_box("KeelSpine", (0.10, 0.0, -1.28), (5.4, 0.38, 0.10), mech, collection, 0.010)
    add_box("Skid_P", (0.20, -1.55, -1.38), (4.6, 0.16, 0.08), armor, collection, 0.006)
    add_box("Skid_S", (0.20, 1.55, -1.38), (4.6, 0.16, 0.08), armor, collection, 0.006)
    add_box("CargoHardP", (-0.40, -1.10, -1.50), (0.55, 0.18, 0.08), mech, collection, 0.004)
    add_box("CargoHardS", (-0.40, 1.10, -1.50), (0.55, 0.18, 0.08), mech, collection, 0.004)

    if lod <= 1:
        add_radiator_cassette("P", (0.55, -2.62, 0.58), lod, mats, collection, length=1.55, height=0.40)
        add_radiator_cassette("S", (0.55, 2.62, 0.58), lod, mats, collection, length=1.55, height=0.40)
        add_box("ThermalP", (-3.40, -2.55, 1.18), (0.85, 0.48, 0.08), ceramic, collection, 0.005)
        add_box("ThermalS", (-3.40, 2.55, 1.18), (0.85, 0.48, 0.08), ceramic, collection, 0.005)
        add_box("BowCeramicP", (6.55, -1.45, 0.78), (0.72, 0.38, 0.07), ceramic, collection, 0.004)
        add_box("BowCeramicS", (6.55, 1.45, 0.78), (0.72, 0.38, 0.07), ceramic, collection, 0.004)
        add_rcs_cluster("P", (-1.2, -2.8, 0.15), mats, collection, sign=-1)
        add_rcs_cluster("S", (-1.2, 2.8, 0.15), mats, collection, sign=1)
        add_cylinder("TurretRing", (0.60, 0.0, 1.92), 0.32, 0.10, mech, collection, 14, 0.005, (0, 0, 0))
        add_box("TurretHead", (0.72, 0.0, 2.06), (0.28, 0.16, 0.08), armor, collection, 0.004)
        add_box("HatchLid", (-3.10, 0.85, 1.20), (0.38, 0.24, 0.04), armor, collection, 0.004)
        add_box("HatchHinge", (-3.38, 0.85, 1.22), (0.04, 0.18, 0.03), mech, collection, 0.002)
    else:
        add_box("Radiator_LOD2_P", (0.55, -2.62, 0.58), (0.85, 0.08, 0.22), mats["Material_Radiator"], collection, 0.006)
        add_box("Radiator_LOD2_S", (0.55, 2.62, 0.58), (0.85, 0.08, 0.22), mats["Material_Radiator"], collection, 0.006)
    if lod == 0:
        add_box("CatwalkAft", (-3.55, 0.0, 1.28), (1.15, 0.16, 0.03), mech, collection, 0.003)
        add_box("LightP", (3.2, -3.55, 0.92), (0.08, 0.08, 0.06), warning, collection, 0.002)
        add_box("LightS", (3.2, 3.55, 0.92), (0.08, 0.08, 0.06), warning, collection, 0.002)
        add_cylinder("CommMast", (-0.55, 0.55, 1.55), 0.04, 0.55, mech, collection, 8, 0.002, (0, 0, 0))

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
        (0, -5.2, 0.4),
        (0, 5.2, 0.4),
        (-8.0, -2.4, 0.2),
        (-8.0, 2.4, 0.2),
        (2.2, -2.0, -1.35),
        (2.2, 2.0, -1.35),
        (2.6, -5.4, -0.2),
        (2.6, 5.4, -0.2),
        (-2.0, -5.4, -0.2),
        (-2.0, 5.4, -0.2),
        (7.6, -2.4, 0.4),
        (7.6, 2.4, 0.4),
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
        rec["inBand"] = band[0] <= rec["widthFrac"] <= band[1]
        measured[name] = rec
        print(f"occupancy {name}: {rec['widthPx1600']:.1f}px ({rec['widthFrac']*100:.2f}%) crop={rec['cropped']}")
        if rec["cropped"]:
            failures.append(f"{name} crops the mesh (ndc x={rec['minX']:.3f}..{rec['maxX']:.3f} y={rec['minY']:.3f}..{rec['maxY']:.3f})")
        if not rec["inBand"]:
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
        "method": "stepped_pressure_frame_barge",
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

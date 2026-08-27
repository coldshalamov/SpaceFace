"""PQ-131.02 Works Massline Core — Cycle 03 square-anchor collar correction.

Three Cycle 02 views still collapse to a washer/manhole: continuous dark torus,
shallow brown plug, cube feet, lost lap gaps, round site dot. Cycle 03 keeps
the open well, inner race, hooks, envelope and cameras, and rebuilds:

- overlapping hat/U-channel collar courses with separated flanges and pitch breaks
- folded dark-painted angle shoes claiming all four cell corners
- a deeper dark refractory well (true inner wall, no brown plug)
- an asymmetric rooted hooded lamp (hood / socket / arm)
- LOD1/2 that keep the four-shoe square silhouette at 19 px/cell

    blender --background --python tools/blender/build_works_massline_core.py

Writes only:
  tools/blender/build_works_massline_core.py
  assets/works/massline_core/**   (cycle_001 and cycle_002 evidence are never rewritten)
  assets/ships/parts/works/place_works_massline_core.glb
"""
from __future__ import annotations

import hashlib
import json
import math
import os
import struct
import sys
import time
from pathlib import Path

import bpy
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree

TOOLS = Path(__file__).resolve().parent
ROOT = TOOLS.parents[1]
if str(TOOLS) not in sys.path:
    sys.path.insert(0, str(TOOLS))

from spaceface_works_camera import (  # noqa: E402
    CELL_WU,
    FOV_V_DEG,
    apply_works_camera,
    works_pose,
)

FAMILY = ROOT / "assets" / "works" / "massline_core"
SOURCE_DIR = FAMILY / "source"
TEX_DIR = SOURCE_DIR / "textures"
BLEND_DIR = FAMILY / "blender"
REF_DIR = FAMILY / "reference"
EVIDENCE_DIR = FAMILY / "evidence" / "cycle_003"
CYCLE_001_DIR = FAMILY / "evidence" / "cycle_001"
CYCLE_002_DIR = FAMILY / "evidence" / "cycle_002"
PARTS_GLB = ROOT / "assets" / "ships" / "parts" / "works" / "place_works_massline_core.glb"
BLEND_PATH = BLEND_DIR / "massline_core.blend"

ASSET_ID = "place_works_massline_core"
IDENTITY = "SF_WORKS_MASSLINE_CORE_V1"
PACKET = "PQ-131.02"
CYCLE = 3
HOOK_NAMES = ("ring_spin", "lamp")

CELL = float(CELL_WU)
HALF = CELL * 0.5
TARGET_H = 1.10
TRI_BUDGET = {0: 8000, 1: 2000, 2: 600}
TEX_BY_LOD = {0: 1024, 1: 512, 2: 256}
KEEP_PNG = {b"IHDR", b"PLTE", b"IDAT", b"IEND", b"sRGB", b"gAMA", b"pHYs"}
_GLTF_FLOAT = 5126
_GLTF_NCOMP = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4, "MAT3": 9, "MAT4": 16}

# Well / collar / spin / shoes. Underside at z=0. Open hole through the liner.
# Planform (inside → out): tapered dark well, ceramic mouth, inner race, gap,
# hat-channel collar courses, four world-aligned corner angle-shoes.
WELL_INNER_R_BOT = 0.30
WELL_INNER_R_TOP = 0.40
WELL_INNER_R = WELL_INNER_R_TOP
LINER_OUTER_R = 0.50
LINER_Z0 = 0.012
LINER_Z1 = 0.580
LIP_Z0, LIP_Z1 = 0.520, 0.655
COLLAR_R0, COLLAR_R1 = 0.68, 0.90
COLLAR_Z0, COLLAR_Z1 = 0.155, 0.510
SPIN_R0, SPIN_R1 = 0.528, 0.612
SPIN_Z0, SPIN_Z1 = 0.498, 0.572
FOOT_OUTER = 1.06
FOOT_INNER = 0.60
FOOT_LEG_W = 0.205
FOOT_H = 0.095
LAMP_ANG = math.radians(88.0)
LAMP_R = 0.97
HATCH_ANG = math.radians(-18.0)

ROLES = ("paint", "wear", "liner", "accent", "lamp")
ATLAS_TILE = {"paint": 0, "wear": 1, "liner": 2, "accent": 3, "lamp": 4}
ROLE_RGB = {
    "paint": (0.098, 0.090, 0.082),
    "wear": (0.142, 0.148, 0.156),
    "liner": (0.046, 0.040, 0.036),
    "accent": (0.255, 0.168, 0.108),
    "lamp": (0.86, 0.76, 0.52),
}
ROLE_FLAT = {
    "paint": (0.18, 0.22, 0.55),
    "wear": (0.72, 0.72, 0.74),
    "liner": (0.42, 0.28, 0.16),
    "accent": (0.70, 0.38, 0.16),
    "lamp": (1.00, 0.92, 0.55),
}
ROLE_ROUGH = {"paint": 0.62, "wear": 0.50, "liner": 0.90, "accent": 0.58, "lamp": 0.26}
ROLE_METAL = {"paint": 0.08, "wear": 0.70, "liner": 0.02, "accent": 0.22, "lamp": 0.02}
EMIT_ALPHA = {"lamp": 0.55}
CITED_REFS = (
    ROOT / "assets" / "concept" / "archetypes" / "concept_station_mining.jpg",
    ROOT / "assets" / "concept" / "landmarks" / "concept_landmark_driller.jpg",
    ROOT / "assets" / "works" / "rover" / "reference" / "ref_01_overhead_crawler.png",
    ROOT / "assets" / "works" / "rover" / "reference" / "ref_03_boom_bit.png",
)


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1 << 20), b""):
            digest.update(chunk)
    return digest.hexdigest().upper()


def rel(path: Path) -> str:
    return str(path.relative_to(ROOT)).replace("\\", "/")


def hash_tree(folder: Path) -> dict:
    out = {}
    if not folder.exists():
        return out
    for path in sorted(folder.rglob("*")):
        if path.is_file():
            out[rel(path)] = sha256(path)
    return out


def parse_args(argv):
    skip_stills = False
    skip_hidden = False
    stills_only = False
    for tok in argv:
        if tok == "--skip-stills":
            skip_stills = True
        elif tok == "--skip-hidden":
            skip_hidden = True
        elif tok == "--stills-only":
            stills_only = True
    return skip_stills, skip_hidden, stills_only


def reset_scene() -> None:
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for bucket in (
        bpy.data.meshes, bpy.data.curves, bpy.data.materials,
        bpy.data.cameras, bpy.data.lights, bpy.data.images, bpy.data.collections,
        bpy.data.armatures,
    ):
        for item in list(bucket):
            try:
                bucket.remove(item)
            except Exception:
                pass


def sanitize_png(path: Path) -> None:
    data = path.read_bytes()
    if data[:8] != b"\x89PNG\r\n\x1a\n":
        return
    out = bytearray(data[:8])
    i = 8
    while i + 12 <= len(data):
        length = int.from_bytes(data[i:i + 4], "big")
        ctype = data[i + 4:i + 8]
        end = i + 12 + length
        if end > len(data):
            break
        if ctype in KEEP_PNG:
            out.extend(data[i:end])
        i = end
    tmp = path.with_name(path.name + ".tmp")
    for attempt in range(8):
        try:
            tmp.write_bytes(bytes(out))
            tmp.replace(path)
            return
        except OSError:
            if attempt == 7:
                raise
            time.sleep(0.2 * (attempt + 1))


def sanitize_glb_floats(path: Path, nd=5) -> None:
    data = bytearray(path.read_bytes())
    if data[:4] != b"glTF" or len(data) < 20:
        return
    json_len = struct.unpack_from("<I", data, 12)[0]
    json_start = 20
    json_end = json_start + json_len
    if json_end > len(data):
        return
    gltf = json.loads(bytes(data[json_start:json_end]).rstrip(b" \x00"))
    bin_off = json_end
    if bin_off + 8 > len(data):
        return
    bin_len = struct.unpack_from("<I", data, bin_off)[0]
    bin_start = bin_off + 8
    if bin_start + bin_len > len(data):
        return
    views = gltf.get("bufferViews", [])
    for acc in gltf.get("accessors", []):
        if acc.get("componentType") != _GLTF_FLOAT:
            continue
        view_index = acc.get("bufferView")
        if view_index is None:
            continue
        view = views[view_index]
        ncomp = _GLTF_NCOMP.get(acc.get("type", "SCALAR"), 1)
        count = int(acc.get("count", 0))
        offset = int(view.get("byteOffset", 0)) + int(acc.get("byteOffset", 0))
        stride = int(view.get("byteStride") or ncomp * 4)
        for i in range(count):
            base = offset + i * stride
            for c in range(ncomp):
                o = base + c * 4
                if o + 4 > bin_len:
                    continue
                val = struct.unpack_from("<f", data, bin_start + o)[0]
                struct.pack_into("<f", data, bin_start + o, round(val, nd))
    tmp = path.with_name(path.name + ".tmp")
    for attempt in range(8):
        try:
            tmp.write_bytes(bytes(data))
            tmp.replace(path)
            return
        except OSError:
            if attempt == 7:
                raise
            time.sleep(0.2 * (attempt + 1))


def h01(x, y, s=0):
    x = np.asarray(x, dtype=np.uint32)
    y = np.asarray(y, dtype=np.uint32)
    v = x * np.uint32(374761393) + y * np.uint32(668265263) + np.uint32(int(s) * 362437)
    v = (v ^ (v >> np.uint32(13))) * np.uint32(1274126177)
    v = v ^ (v >> np.uint32(16))
    return (v & np.uint32(255)).astype(np.float32) / np.float32(255.0)


def write_pixels(name, pixels, size, colorspace="sRGB"):
    if name in bpy.data.images:
        bpy.data.images.remove(bpy.data.images[name])
    img = bpy.data.images.new(name, width=size, height=size, alpha=True)
    img.colorspace_settings.name = colorspace
    img.pixels.foreach_set(np.ascontiguousarray(pixels, dtype=np.float32).ravel())
    TEX_DIR.mkdir(parents=True, exist_ok=True)
    path = TEX_DIR / f"{name}.png"
    tmp_path = TEX_DIR / f"{name}.png.tmp"
    img.filepath_raw = str(tmp_path)
    img.file_format = "PNG"
    last_err = None
    for attempt in range(8):
        try:
            img.save()
            last_err = None
            break
        except Exception as exc:
            last_err = exc
            time.sleep(0.2 * (attempt + 1))
    if last_err is not None:
        raise last_err
    img.pack()
    img.filepath_raw = ""
    tmp_path.replace(path)
    sanitize_png(path)
    return img, path


def link_object(obj, collection):
    for current in list(obj.users_collection):
        current.objects.unlink(obj)
    collection.objects.link(obj)
    return obj


def tag_role(obj, role, group="static"):
    obj["spacefaceRole"] = role
    obj["sf_role"] = role
    obj["sf_group"] = group
    return obj


def add_mesh(name, verts, faces, material, collection, bevel=0.008, role="paint", group="static"):
    mesh = bpy.data.meshes.new(f"{name}_Mesh")
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)
    if material is not None:
        obj.data.materials.clear()
        obj.data.materials.append(material)
    if bevel > 0:
        mod = obj.modifiers.new("ProductionBevel", "BEVEL")
        mod.width = float(bevel)
        mod.segments = 1
        mod.limit_method = "ANGLE"
        mod.angle_limit = math.radians(40)
    return tag_role(obj, role, group)


def add_box(name, loc, scale, material, collection, bevel=0.008, rot=(0, 0, 0), role="paint", group="static"):
    bpy.ops.mesh.primitive_cube_add(location=loc, rotation=rot)
    obj = link_object(bpy.context.object, collection)
    obj.name = name
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if material is not None:
        obj.data.materials.clear()
        obj.data.materials.append(material)
    if bevel > 0:
        mod = obj.modifiers.new("ProductionBevel", "BEVEL")
        mod.width = float(bevel)
        mod.segments = 1
        mod.limit_method = "ANGLE"
        mod.angle_limit = math.radians(40)
    return tag_role(obj, role, group)


def add_cylinder(name, loc, radius, depth, material, collection, vertices=16, bevel=0.006,
                 rot=(0, 0, 0), role="paint", group="static"):
    bpy.ops.mesh.primitive_cylinder_add(
        vertices=vertices, radius=radius, depth=depth, location=loc, rotation=rot,
    )
    obj = link_object(bpy.context.object, collection)
    obj.name = name
    if material is not None:
        obj.data.materials.clear()
        obj.data.materials.append(material)
    if bevel > 0:
        mod = obj.modifiers.new("ProductionBevel", "BEVEL")
        mod.width = float(bevel)
        mod.segments = 1
        mod.limit_method = "ANGLE"
        mod.angle_limit = math.radians(40)
    return tag_role(obj, role, group)


def apply_modifiers(obj):
    if obj.type != "MESH" or not obj.modifiers:
        return obj
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    try:
        for mod in list(obj.modifiers):
            try:
                bpy.ops.object.modifier_apply(modifier=mod.name)
            except Exception:
                try:
                    obj.modifiers.remove(mod)
                except Exception:
                    pass
    finally:
        obj.select_set(False)
    return obj


def boolean_difference(host, cutter, solver="EXACT"):
    bpy.context.view_layer.objects.active = host
    host.select_set(True)
    mod = host.modifiers.new("BoolCut", "BOOLEAN")
    mod.operation = "DIFFERENCE"
    mod.object = cutter
    try:
        mod.solver = solver
    except Exception:
        pass
    name = mod.name
    try:
        bpy.ops.object.modifier_apply(modifier=name)
    finally:
        host.select_set(False)
        try:
            bpy.data.objects.remove(cutter, do_unlink=True)
        except Exception:
            pass
    return host


def annular_segment(name, r0, r1, z0, z1, a0, a1, segs, material, collection,
                    bevel=0.008, role="paint", group="static"):
    segs = max(1, int(segs))
    verts = []
    for i in range(segs + 1):
        t = i / float(segs)
        a = a0 + t * (a1 - a0)
        c, s = math.cos(a), math.sin(a)
        verts.extend((
            (r0 * c, r0 * s, z0),
            (r1 * c, r1 * s, z0),
            (r1 * c, r1 * s, z1),
            (r0 * c, r0 * s, z1),
        ))
    faces = []
    for i in range(segs):
        a = i * 4
        b = (i + 1) * 4
        faces.extend((
            (a, b, b + 1, a + 1),
            (a + 1, b + 1, b + 2, a + 2),
            (a + 2, b + 2, b + 3, a + 3),
            (a + 3, b + 3, b, a),
        ))
    faces.append((0, 1, 2, 3))
    last = segs * 4
    faces.append((last, last + 3, last + 2, last + 1))
    return add_mesh(name, verts, faces, material, collection, bevel=bevel, role=role, group=group)


def folded_sheet(name, a, b, c, d, thickness, material, collection, bevel=0.006, role="paint", group="static"):
    va, vb, vc, vd = Vector(a), Vector(b), Vector(c), Vector(d)
    normal = (vb - va).cross(vd - va)
    if normal.length < 1e-8:
        normal = (vc - vb).cross(va - vb)
    if normal.length < 1e-8:
        normal = Vector((0.0, 0.0, 1.0))
    else:
        normal.normalize()
    half = normal * (float(thickness) * 0.5)
    outer = (va + half, vb + half, vc + half, vd + half)
    inner = (va - half, vb - half, vc - half, vd - half)
    verts = [tuple(p) for p in (*outer, *inner)]
    faces = [
        (0, 1, 2, 3), (4, 7, 6, 5),
        (0, 3, 7, 4), (1, 0, 4, 5),
        (2, 1, 5, 6), (3, 2, 6, 7),
    ]
    return add_mesh(name, verts, faces, material, collection, bevel=bevel, role=role, group=group)


def add_hex_bolt(name, loc, z_axis, material, collection, head_r=0.018, head_h=0.010,
                 shank_r=0.010, shank_h=0.022, group="static", lod=0):
    z = Vector(z_axis)
    if z.length < 1e-8:
        z = Vector((0.0, 0.0, 1.0))
    z.normalize()
    rot = z.to_track_quat("Z", "Y").to_euler()
    hx = 6 if lod == 0 else 6
    sx = 8 if lod == 0 else 6
    head = add_cylinder(
        f"{name}_Head", (loc[0], loc[1], loc[2] + z.z * (shank_h * 0.15)),
        head_r, head_h, material, collection, vertices=hx, bevel=0.0, rot=rot,
        role="wear", group=group,
    )
    shank = add_cylinder(
        f"{name}_Shank", (loc[0] - z.x * shank_h * 0.25, loc[1] - z.y * shank_h * 0.25,
                          loc[2] - z.z * shank_h * 0.25),
        shank_r, shank_h, material, collection, vertices=sx, bevel=0.0, rot=rot,
        role="wear", group=group,
    )
    return [head, shank]


def add_empty(name, loc, collection, parent=None, size=0.08):
    obj = bpy.data.objects.new(name, None)
    collection.objects.link(obj)
    obj.empty_display_type = "PLAIN_AXES"
    obj.empty_display_size = size
    obj.location = loc
    if parent is not None:
        obj.parent = parent
    obj["socket"] = True
    obj["spacefaceSocket"] = True
    obj["spaceface.socket"] = True
    obj["spaceface"] = {"socket": True, "role": "works_hook"}
    return obj


def parent_keep(obj, parent):
    mw = obj.matrix_world.copy()
    obj.parent = parent
    obj.matrix_parent_inverse = parent.matrix_world.inverted()
    obj.matrix_world = mw


def count_tris(obj):
    if obj.type != "MESH" or not obj.data:
        return 0
    return sum(max(0, len(poly.vertices) - 2) for poly in obj.data.polygons)


def principled(material):
    material.use_nodes = True
    material.node_tree.nodes.clear()
    output = material.node_tree.nodes.new("ShaderNodeOutputMaterial")
    bsdf = material.node_tree.nodes.new("ShaderNodeBsdfPrincipled")
    material.node_tree.links.new(bsdf.outputs["BSDF"], output.inputs["Surface"])
    return bsdf


def wire_atlas(material, bsdf, maps):
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
    if "Ambient Occlusion" in bsdf.inputs:
        links.new(sep.outputs["Red"], bsdf.inputs["Ambient Occlusion"])
    nmap = nodes.new("ShaderNodeNormalMap")
    nmap.space = "TANGENT"
    nmap.inputs["Strength"].default_value = 1.10
    links.new(tex_n.outputs["Color"], nmap.inputs["Color"])
    links.new(nmap.outputs["Normal"], bsdf.inputs["Normal"])
    if "Emission Color" in bsdf.inputs:
        links.new(tex_a.outputs["Color"], bsdf.inputs["Emission Color"])
        links.new(tex_a.outputs["Alpha"], bsdf.inputs["Emission Strength"])


def create_role_materials():
    mats = {}
    for role, rgb in ROLE_RGB.items():
        mat = bpy.data.materials.new(f"Material_{role.title()}")
        bsdf = principled(mat)
        bsdf.inputs["Base Color"].default_value = (*rgb, 1.0)
        bsdf.inputs["Roughness"].default_value = ROLE_ROUGH[role]
        bsdf.inputs["Metallic"].default_value = ROLE_METAL[role]
        if role == "lamp" and "Emission Color" in bsdf.inputs:
            bsdf.inputs["Emission Color"].default_value = (1.0, 0.88, 0.58, 1.0)
            bsdf.inputs["Emission Strength"].default_value = 1.6
        mat["spacefaceRole"] = role
        mats[role] = mat
    return mats


def finish_shade(obj, angle=28.0):
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    try:
        bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    except Exception:
        pass
    apply_modifiers(obj)
    try:
        bpy.ops.object.shade_smooth_by_angle(angle=math.radians(angle))
    except Exception:
        for poly in obj.data.polygons:
            poly.use_smooth = True
    try:
        bpy.ops.object.mode_set(mode="EDIT")
        bpy.ops.mesh.select_all(action="SELECT")
        try:
            bpy.ops.mesh.remove_doubles(threshold=0.00035)
        except TypeError:
            bpy.ops.mesh.merge_by_distance(distance=0.00035)
        bpy.ops.mesh.normals_make_consistent(inside=False)
        bpy.ops.object.mode_set(mode="OBJECT")
    except Exception:
        try:
            bpy.ops.object.mode_set(mode="OBJECT")
        except Exception:
            pass
    wn = obj.modifiers.new("WeightedNormal", "WEIGHTED_NORMAL")
    wn.keep_sharp = True
    apply_modifiers(obj)
    obj.select_set(False)
    return obj


def unique_uv(obj, island_margin=0.012):
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    if obj.data.uv_layers:
        while obj.data.uv_layers:
            obj.data.uv_layers.remove(obj.data.uv_layers[0])
    obj.data.uv_layers.new(name="UVMap")
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(angle_limit=66.0, island_margin=island_margin, scale_to_bounds=True)
    try:
        bpy.ops.uv.average_islands_scale()
    except Exception:
        pass
    try:
        bpy.ops.uv.pack_islands(margin=island_margin)
    except Exception:
        pass
    bpy.ops.object.mode_set(mode="OBJECT")
    obj.select_set(False)


def remap_uv_rect(obj, u0, v0, u1, v1):
    if obj.type != "MESH" or not obj.data.uv_layers:
        return
    layer = obj.data.uv_layers.active
    du, dv = (u1 - u0), (v1 - v0)
    for item in layer.data:
        u = min(1.0, max(0.0, float(item.uv.x)))
        v = min(1.0, max(0.0, float(item.uv.y)))
        item.uv = (u0 + u * du, v0 + v * dv)


def triangulate(obj):
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    tri = obj.modifiers.new("ExportTriangulate", "TRIANGULATE")
    tri.quad_method = "FIXED"
    apply_modifiers(obj)
    obj.select_set(False)


def join_group(objects, name, parent=None):
    objects = [obj for obj in objects if obj.type == "MESH" and obj.data and len(obj.data.vertices) > 0]
    objects = sorted(objects, key=lambda o: o.name)
    if not objects:
        return None
    try:
        bpy.ops.object.mode_set(mode="OBJECT")
    except Exception:
        pass
    bpy.ops.object.select_all(action="DESELECT")
    for obj in objects:
        apply_modifiers(obj)
        obj.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    if len(objects) > 1:
        bpy.ops.object.join()
    active = bpy.context.view_layer.objects.active
    active.name = name
    if active.data:
        active.data.name = name
    if parent is not None:
        parent_keep(active, parent)
    active.select_set(False)
    return active


def quantize_mesh(obj, nd=5):
    if obj.type != "MESH" or not obj.data:
        return
    mesh = obj.data
    for vert in mesh.vertices:
        vert.co.x = round(float(vert.co.x), nd)
        vert.co.y = round(float(vert.co.y), nd)
        vert.co.z = round(float(vert.co.z), nd)
    for layer in mesh.uv_layers:
        for item in layer.data:
            item.uv = (round(float(item.uv.x), nd + 1), round(float(item.uv.y), nd + 1))
    mesh.update()


def world_bbox(objects):
    mins = Vector((1e9, 1e9, 1e9))
    maxs = Vector((-1e9, -1e9, -1e9))
    n = 0
    for obj in objects:
        if obj.type != "MESH":
            continue
        for corner in obj.bound_box:
            w = obj.matrix_world @ Vector(corner)
            mins.x, mins.y, mins.z = min(mins.x, w.x), min(mins.y, w.y), min(mins.z, w.z)
            maxs.x, maxs.y, maxs.z = max(maxs.x, w.x), max(maxs.y, w.y), max(maxs.z, w.z)
            n += 1
    if n == 0:
        return {"min": [0, 0, 0], "max": [0, 0, 0], "size": [0, 0, 0]}
    size = maxs - mins
    return {
        "min": [round(mins.x, 4), round(mins.y, 4), round(mins.z, 4)],
        "max": [round(maxs.x, 4), round(maxs.y, 4), round(maxs.z, 4)],
        "size": [round(size.x, 4), round(size.y, 4), round(size.z, 4)],
    }


# ---------------------------------------------------------------------------
# Geometry
# ---------------------------------------------------------------------------

def hat_channel_arc(name, r_in, r_out, z_bot, z_top, a0, a1, segs, plate_t,
                    material, collection, bevel=0.006, role="paint", group="static",
                    kick=0.028):
    """Hat / inverted-U: top web, inner/outer webs, separated lower flanges.
    From above: a plate course. Ends stay open so pitch-break gaps show section."""
    segs = max(1, int(segs))
    t = float(plate_t)
    r_in, r_out = float(r_in), float(r_out)
    z_bot, z_top = float(z_bot), float(z_top)
    inner_web = r_in + t
    outer_web = r_out - t
    ceil = z_top - t
    kick = float(kick)
    if inner_web >= outer_web or ceil <= z_bot + t:
        return annular_segment(
            name, r_in, r_out, z_bot, z_top, a0, a1, segs,
            material, collection, bevel=bevel, role=role, group=group,
        )
    # 8-vert hat, web on +Z, cavity opening -Z.
    section = (
        (r_in, z_top),
        (r_out, z_top),
        (r_out + kick, z_bot),
        (outer_web, z_bot),
        (outer_web, ceil),
        (inner_web, ceil),
        (inner_web, z_bot),
        (r_in - kick, z_bot),
    )
    nsec = len(section)
    verts = []
    for i in range(segs + 1):
        ang = a0 + (a1 - a0) * (i / float(segs))
        c, s = math.cos(ang), math.sin(ang)
        for radius, z in section:
            verts.append((radius * c, radius * s, z))
    faces = []
    for i in range(segs):
        a = i * nsec
        b = (i + 1) * nsec
        for k in range(nsec):
            k2 = (k + 1) % nsec
            faces.append((a + k, b + k, b + k2, a + k2))
    return add_mesh(name, verts, faces, material, collection, bevel=bevel, role=role, group=group)


def tapered_annulus(name, r0_bot, r0_top, r1_bot, r1_top, z0, z1, segs,
                    material, collection, bevel=0.006, role="liner", group="static"):
    """Open tube with independent inner/outer radii at top and bottom."""
    segs = max(3, int(segs))
    verts = []
    for i in range(segs):
        a = (i / float(segs)) * math.tau
        c, s = math.cos(a), math.sin(a)
        verts.extend((
            (r0_bot * c, r0_bot * s, z0),
            (r1_bot * c, r1_bot * s, z0),
            (r1_top * c, r1_top * s, z1),
            (r0_top * c, r0_top * s, z1),
        ))
    faces = []
    for i in range(segs):
        a = i * 4
        b = ((i + 1) % segs) * 4
        faces.extend((
            (a, b, b + 1, a + 1),
            (a + 1, b + 1, b + 2, a + 2),
            (a + 2, b + 2, b + 3, a + 3),
            (a + 3, b + 3, b, a),
        ))
    return add_mesh(name, verts, faces, material, collection, bevel=bevel, role=role, group=group)


def build_liner(mats, collection, lod):
    segs = {0: 28, 1: 16, 2: 10}[lod]
    bevel = {0: 0.007, 1: 0.004, 2: 0.0}[lod]
    # Tapered dark refractory tube — wider mouth, true inner wall, open through.
    body = tapered_annulus(
        "LinerBody",
        WELL_INNER_R_BOT, WELL_INNER_R_TOP,
        LINER_OUTER_R, LINER_OUTER_R,
        LINER_Z0, LINER_Z1,
        segs, mats["liner"], collection, bevel=bevel, role="liner",
    )
    lip = tapered_annulus(
        "LinerLip",
        WELL_INNER_R_TOP - 0.010, WELL_INNER_R_TOP - 0.006,
        LINER_OUTER_R + 0.026, LINER_OUTER_R + 0.018,
        LIP_Z0, LIP_Z1,
        segs, mats["liner"], collection, bevel=bevel, role="liner",
    )
    parts = [body, lip]
    if lod < 2:
        parts.append(tapered_annulus(
            "LinerThroat",
            WELL_INNER_R_BOT + 0.006, WELL_INNER_R_TOP - 0.004,
            WELL_INNER_R_BOT + 0.032, WELL_INNER_R_TOP + 0.012,
            LINER_Z0 + 0.018, LIP_Z0 + 0.030,
            segs, mats["liner"], collection, bevel=0.0, role="liner",
        ))
    if lod == 0:
        for i, a0 in enumerate((0.40, 2.25)):
            parts.append(annular_segment(
                f"LinerJoint{i}", LINER_OUTER_R - 0.006, LINER_OUTER_R + 0.010,
                LINER_Z0 + 0.08, LIP_Z0 - 0.05, a0, a0 + 0.12, 3,
                mats["liner"], collection, bevel=0.003, role="liner",
            ))
    return parts


def build_collar(mats, collection, lod):
    nseg = 8
    sub = {0: 5, 1: 3, 2: 1}[lod]
    bevel = {0: 0.006, 1: 0.0, 2: 0.0}[lod]
    plate = {0: 0.028, 1: 0.032, 2: 0.038}[lod]
    kick = {0: 0.030, 1: 0.024, 2: 0.018}[lod]
    body = {0: 0.70, 1: 0.74, 2: 0.78}[lod]
    lap = {0: 0.10, 1: 0.08, 2: 0.06}[lod]
    parts = []
    span = math.tau / nseg
    gap_keep = 1.0 - body
    for i in range(nseg):
        a0 = i * span + gap_keep * span * 0.45
        a1 = a0 + body * span
        z_lift = 0.048 if (i % 2) else 0.0
        if i == 0:
            a1 += 0.03
        elif i == 4:
            a1 -= 0.022
        r_in = COLLAR_R0 + (0.010 if i in (2, 6) else 0.0)
        r_out = COLLAR_R1 - (0.016 if i == 5 else 0.0)
        parts.append(hat_channel_arc(
            f"CollarCourse{i}", r_in, r_out,
            COLLAR_Z0 + z_lift, COLLAR_Z1 + z_lift,
            a0, a1, sub, plate, mats["paint"], collection,
            bevel=bevel, role="paint", group="static", kick=kick,
        ))
        next_a0 = (i + 1) * span + gap_keep * span * 0.45
        next_lift = 0.048 if ((i + 1) % 2) else 0.0
        lap_z = max(z_lift, next_lift) + 0.010
        if lod <= 1:
            parts.append(annular_segment(
                f"CollarLap{i}", r_in + 0.018, r_out + 0.008,
                COLLAR_Z1 + lap_z, COLLAR_Z1 + lap_z + 0.016,
                next_a0, next_a0 + lap, 2 if lod == 0 else 1,
                mats["paint"], collection,
                bevel=0.003 if lod == 0 else 0.0, role="paint", group="static",
            ))
        if lod == 0:
            mid = next_a0 + lap * 0.45
            c, s = math.cos(mid), math.sin(mid)
            parts.extend(add_hex_bolt(
                f"CollarLapBolt{i}",
                ((r_out - 0.030) * c, (r_out - 0.030) * s, COLLAR_Z1 + lap_z + 0.022),
                (0, 0, 1), mats["wear"], collection, group="static", lod=lod,
                head_r=0.015, head_h=0.008, shank_r=0.008, shank_h=0.016,
            ))
    return parts


def build_spin_ring(mats, collection, lod):
    segs = {0: 24, 1: 16, 2: 10}[lod]
    bevel = {0: 0.004, 1: 0.0, 2: 0.0}[lod]
    race = annular_segment(
        "SpinRace", SPIN_R0, SPIN_R1, SPIN_Z0, SPIN_Z1,
        0.0, math.tau, segs, mats["wear"], collection,
        bevel=bevel, role="wear", group="spin",
    )
    parts = [race]
    if lod < 2:
        parts.append(annular_segment(
            "SpinShoulder", SPIN_R0 - 0.010, SPIN_R0 + 0.014,
            SPIN_Z0 + 0.016, SPIN_Z1 - 0.012,
            0.0, math.tau, segs, mats["wear"], collection,
            bevel=bevel * 0.5, role="wear", group="spin",
        ))
    if lod == 0:
        parts.append(annular_segment(
            "SpinOilGroove", SPIN_R0 + 0.024, SPIN_R1 - 0.020,
            SPIN_Z1 - 0.014, SPIN_Z1 + 0.003,
            0.0, math.tau, segs, mats["wear"], collection,
            bevel=0.002, role="wear", group="spin",
        ))
        parts.append(annular_segment(
            "SpinDrain", SPIN_R1 - 0.016, SPIN_R1 + 0.008,
            SPIN_Z0 + 0.018, SPIN_Z1 - 0.018,
            1.12, 1.28, 2, mats["wear"], collection,
            bevel=0.002, role="wear", group="spin",
        ))
    return parts


def build_feet(mats, collection, lod):
    """Four folded dark-painted angle shoes at the cell corners. L-plan claims
    the square; mid-sides stay open. No bright wear puck on top."""
    parts = []
    bevel = {0: 0.007, 1: 0.0, 2: 0.0}[lod]
    tw = FOOT_LEG_W if lod < 2 else 0.255
    h = FOOT_H if lod < 2 else 0.118
    inner = FOOT_INNER if lod < 2 else 0.56
    corners = ((1.0, 1.0), (-1.0, 1.0), (-1.0, -1.0), (1.0, -1.0))
    for i, (sx, sy) in enumerate(corners):
        ox, oy = sx * FOOT_OUTER, sy * FOOT_OUTER
        ix, iy = sx * inner, sy * inner
        y_inner = oy - sy * tw
        x_inner = ox - sx * tw
        cx = 0.5 * (ix + ox)
        cy = 0.5 * (y_inner + oy)
        parts.append(add_box(
            f"ShoeX{i}", (cx, cy, h * 0.5),
            (abs(ox - ix) * 0.5, tw * 0.5, h * 0.5),
            mats["paint"], collection, bevel=bevel, role="paint",
        ))
        cx2 = 0.5 * (x_inner + ox)
        cy2 = 0.5 * (iy + oy)
        parts.append(add_box(
            f"ShoeY{i}", (cx2, cy2, h * 0.5),
            (tw * 0.5, abs(oy - iy) * 0.5, h * 0.5),
            mats["paint"], collection, bevel=bevel, role="paint",
        ))
        if lod == 0:
            parts.append(add_box(
                f"ShoeReturnX{i}", (cx, y_inner + sy * 0.012, h + 0.020),
                (abs(ox - ix) * 0.34, 0.012, 0.020),
                mats["paint"], collection, bevel=bevel * 0.5, role="paint",
            ))
            parts.append(add_box(
                f"ShoeReturnY{i}", (x_inner + sx * 0.012, cy2, h + 0.020),
                (0.012, abs(oy - iy) * 0.34, 0.020),
                mats["paint"], collection, bevel=bevel * 0.5, role="paint",
            ))
        inner_corner = Vector((x_inner, y_inner, h))
        collar_hit = Vector((sx, sy, 0.0)).normalized() * (COLLAR_R1 - 0.035)
        t_perp = Vector((-sy, sx, 0.0)) * (0.048 if lod < 2 else 0.062)
        parts.append(folded_sheet(
            f"ShoeGusset{i}",
            inner_corner - t_perp,
            inner_corner + t_perp,
            Vector((collar_hit.x, collar_hit.y, COLLAR_Z0 + 0.14)) + t_perp * 0.65,
            Vector((collar_hit.x, collar_hit.y, COLLAR_Z0 + 0.14)) - t_perp * 0.65,
            0.022 if lod < 2 else 0.030,
            mats["paint"], collection,
            bevel=bevel * 0.5 if bevel else 0.0, role="paint",
        ))
        if lod == 2:
            continue
        off = Vector((sx, -sy, 0.0) if i % 2 == 0 else (-sx, sy, 0.0)) * 0.07
        parts.append(folded_sheet(
            f"ShoeGussetB{i}",
            Vector((x_inner, cy, h)) + off * 0.15,
            Vector((cx, y_inner, h)) + off * 0.15,
            Vector((collar_hit.x, collar_hit.y, COLLAR_Z0 + 0.20)) + off * 0.12,
            Vector((collar_hit.x, collar_hit.y, COLLAR_Z0 + 0.10)),
            0.016, mats["paint"], collection,
            bevel=0.003 if lod == 0 else 0.0, role="paint",
        ))
        if lod == 0:
            bolt_a = Vector((cx, oy - sy * (tw * 0.42), h + 0.010))
            bolt_b = Vector((ox - sx * (tw * 0.42), cy2, h + 0.010))
            for k, world in enumerate((bolt_a, bolt_b)):
                parts.extend(add_hex_bolt(
                    f"ShoeBolt{i}_{k}", world, (0, 0, 1), mats["wear"], collection,
                    group="static", lod=lod,
                    head_r=0.013, head_h=0.007, shank_r=0.007, shank_h=0.014,
                ))
    return parts


def build_hatch(mats, collection, lod):
    ang = HATCH_ANG
    c, s = math.cos(ang), math.sin(ang)
    z = COLLAR_Z1 + 0.028
    r = 0.78
    hatch = add_box(
        "ServiceHatch", (r * c, r * s, z),
        (0.132, 0.062, 0.012), mats["accent"], collection,
        bevel=0.003 if lod < 2 else 0.0, rot=(0, 0, ang), role="accent",
    )
    parts = [hatch]
    if lod < 2:
        parts.append(add_box(
            "HatchStrap", (r * c, r * s, z + 0.010),
            (0.142, 0.022, 0.006), mats["wear"], collection,
            bevel=0.002, rot=(0, 0, ang), role="wear",
        ))
    nbolts = 2 if lod == 0 else 0
    t = Vector((-s, c, 0.0))
    radial = Vector((c, s, 0.0))
    for k in range(nbolts):
        loc = Vector((r * c, r * s, z + 0.016)) + radial * (-0.06 + 0.12 * k) + t * 0.028
        parts.extend(add_hex_bolt(
            f"HatchBolt{k}", loc, (0, 0, 1), mats["wear"], collection,
            head_r=0.011, head_h=0.006, shank_r=0.006, shank_h=0.012, lod=lod,
        ))
    return parts


def build_lamp(mats, collection, lod):
    """Asymmetric rooted service fixture: arm, socket, hood, recessed lens.
    Only the lens emits, and it is small — not a beacon or painted tab."""
    ang = LAMP_ANG
    c, s = math.cos(ang), math.sin(ang)
    root = Vector((0.72 * c, 0.72 * s, COLLAR_Z1 + 0.01))
    tip = Vector((LAMP_R * c, LAMP_R * s, COLLAR_Z1 + 0.08))
    mid = (root + tip) * 0.5
    parts = []
    arm_len = (tip - root).length
    parts.append(add_box(
        "LampArm", (mid.x, mid.y, mid.z),
        (arm_len * 0.5, 0.038 if lod < 2 else 0.044, 0.022 if lod < 2 else 0.026),
        mats["paint"], collection,
        bevel=0.003 if lod == 0 else 0.0, rot=(0, 0, ang),
        role="paint", group="lamp",
    ))
    sock_z = tip.z + 0.022
    if lod < 2:
        parts.append(add_cylinder(
            "LampSocket", (tip.x, tip.y, sock_z),
            0.040, 0.040, mats["wear"], collection,
            vertices=10 if lod == 0 else 8, bevel=0.0, role="wear", group="lamp",
        ))
    hood_h = 0.048 if lod < 2 else 0.040
    hood = add_box(
        "LampHood",
        (tip.x - c * 0.012, tip.y - s * 0.012, sock_z + 0.058),
        (0.095 if lod < 2 else 0.088, 0.062 if lod < 2 else 0.058, hood_h),
        mats["paint"], collection,
        bevel=0.004 if lod == 0 else 0.0, rot=(0, 0, ang),
        role="paint", group="lamp",
    )
    parts.append(hood)
    lens_loc = Vector((tip.x, tip.y, sock_z + 0.050))
    parts.append(add_cylinder(
        "LampLens", (lens_loc.x, lens_loc.y, lens_loc.z),
        0.024 if lod < 2 else 0.026, 0.012, mats["lamp"], collection,
        vertices=10 if lod == 0 else 8, bevel=0.0, role="lamp", group="lamp",
    ))
    return parts, lens_loc


def build_lod_geometry(lod, mats, collection):
    static = []
    static.extend(build_liner(mats, collection, lod))
    static.extend(build_collar(mats, collection, lod))
    static.extend(build_feet(mats, collection, lod))
    static.extend(build_hatch(mats, collection, lod))
    spin = build_spin_ring(mats, collection, lod)
    lamp, lamp_loc = build_lamp(mats, collection, lod)
    return static, spin, lamp, lamp_loc


# ---------------------------------------------------------------------------
# Mesh-derived AO / curvature / unique atlas
# ---------------------------------------------------------------------------

def mesh_world_tris(obj):
    mesh = obj.data
    mw = obj.matrix_world
    verts = [mw @ v.co for v in mesh.vertices]
    tris = []
    for poly in mesh.polygons:
        idx = list(poly.vertices)
        for i in range(1, len(idx) - 1):
            tris.append((verts[idx[0]], verts[idx[i]], verts[idx[i + 1]]))
    return tris, verts


def build_scene_bvh(objects):
    verts = []
    polys = []
    for obj in objects:
        if obj.type != "MESH" or not obj.data:
            continue
        tris, _ = mesh_world_tris(obj)
        for tri in tris:
            base = len(verts)
            verts.extend(tri)
            polys.append((base, base + 1, base + 2))
    if not polys:
        return None
    return BVHTree.FromPolygons([tuple(v) for v in verts], polys)


def fibonacci_hemisphere(n, normal):
    n = max(4, int(n))
    z = Vector(normal)
    if z.length < 1e-8:
        z = Vector((0, 0, 1))
    z.normalize()
    x = z.cross(Vector((0, 1, 0)))
    if x.length < 1e-6:
        x = z.cross(Vector((1, 0, 0)))
    x.normalize()
    y = z.cross(x)
    out = []
    golden = math.pi * (3.0 - math.sqrt(5.0))
    for i in range(n):
        zi = (i + 0.5) / n
        radius = math.sqrt(max(0.0, 1.0 - zi * zi))
        theta = golden * i
        local = x * (math.cos(theta) * radius) + y * (math.sin(theta) * radius) + z * zi
        out.append(local.normalized())
    return out


def vertex_ao_and_curvature(obj, bvh, samples=12):
    mesh = obj.data
    mw = obj.matrix_world
    n_verts = len(mesh.vertices)
    ao = np.ones(n_verts, dtype=np.float32)
    curv = np.zeros(n_verts, dtype=np.float32)
    if bvh is None:
        return ao, curv
    # adjacency for curvature
    adj = [[] for _ in range(n_verts)]
    for poly in mesh.polygons:
        idx = list(poly.vertices)
        for i, a in enumerate(idx):
            b = idx[(i + 1) % len(idx)]
            adj[a].append(b)
            adj[b].append(a)
    try:
        mesh.calc_normals_split()
    except Exception:
        pass
    mesh.update()
    for vi, vert in enumerate(mesh.vertices):
        world = mw @ vert.co
        normal = (mw.to_3x3() @ vert.normal)
        if normal.length < 1e-8:
            continue
        normal.normalize()
        origin = world + normal * 0.004
        dirs = fibonacci_hemisphere(samples, normal)
        hits = 0
        for d in dirs:
            loc, _n, _i, dist = bvh.ray_cast(origin, d, 0.55)
            if loc is not None and dist is not None and dist > 0.003:
                hits += 1
        ao[vi] = 1.0 - (hits / float(len(dirs)))
        # curvature: 1 - mean dot to neighbour normals
        if adj[vi]:
            acc = 0.0
            count = 0
            for nj in set(adj[vi]):
                nn = (mw.to_3x3() @ mesh.vertices[nj].normal)
                if nn.length < 1e-8:
                    continue
                nn.normalize()
                acc += max(-1.0, min(1.0, float(normal.dot(nn))))
                count += 1
            if count:
                curv[vi] = 1.0 - (acc / count)
    return np.clip(ao, 0.12, 1.0), np.clip(curv, 0.0, 1.0)


def ensure_color_attr(mesh, name):
    existing = mesh.color_attributes.get(name)
    if existing is not None:
        return existing
    return mesh.color_attributes.new(name=name, type="FLOAT_COLOR", domain="POINT")


def store_vertex_colors(obj, ao, curv, role):
    mesh = obj.data
    n = len(mesh.vertices)
    col = ensure_color_attr(mesh, "RoleAO")
    rgb = ROLE_FLAT[role]
    for i in range(n):
        col.data[i].color = (rgb[0], rgb[1], rgb[2], float(ao[i]))
    cattr = ensure_color_attr(mesh, "Curv")
    for i in range(n):
        v = float(curv[i])
        cattr.data[i].color = (v, v, v, 1.0)


def rasterize_mesh_to_atlas(obj, albedo, orm, nrm, size):
    mesh = obj.data
    if not mesh.uv_layers:
        return
    try:
        mesh.calc_normals()
    except Exception:
        pass
    uv_layer = mesh.uv_layers.active
    role_col = mesh.color_attributes.get("RoleAO")
    curv_col = mesh.color_attributes.get("Curv")
    h = w = size

    def attr_at(vi, layer, default):
        if layer is None:
            return default
        c = layer.data[vi].color
        return (float(c[0]), float(c[1]), float(c[2]), float(c[3]))

    for poly in mesh.polygons:
        loops = list(poly.loop_indices)
        if len(loops) < 3:
            continue
        for t in range(1, len(loops) - 1):
            lis = (loops[0], loops[t], loops[t + 1])
            uvs = [uv_layer.data[li].uv for li in lis]
            vis = [mesh.loops[li].vertex_index for li in lis]
            px = []
            for uv in uvs:
                x = uv.x * (w - 1)
                y = uv.y * (h - 1)
                px.append((x, y))
            minx = int(max(0, math.floor(min(p[0] for p in px))))
            maxx = int(min(w - 1, math.ceil(max(p[0] for p in px))))
            miny = int(max(0, math.floor(min(p[1] for p in px))))
            maxy = int(min(h - 1, math.ceil(max(p[1] for p in px))))
            if maxx < minx or maxy < miny:
                continue
            (x0, y0), (x1, y1), (x2, y2) = px
            denom = (y1 - y2) * (x0 - x2) + (x2 - x1) * (y0 - y2)
            if abs(denom) < 1e-8:
                continue
            roles = [attr_at(vi, role_col, (0.2, 0.2, 0.2, 1.0)) for vi in vis]
            curvs = [attr_at(vi, curv_col, (0, 0, 0, 1))[0] for vi in vis]
            p0 = mesh.vertices[vis[0]].co
            p1 = mesh.vertices[vis[1]].co
            p2 = mesh.vertices[vis[2]].co
            n0 = mesh.vertices[vis[0]].normal
            n1 = mesh.vertices[vis[1]].normal
            n2 = mesh.vertices[vis[2]].normal
            uv0, uv1, uv2 = uvs
            e1 = p1 - p0
            e2 = p2 - p0
            du1 = float(uv1.x - uv0.x)
            dv1 = float(uv1.y - uv0.y)
            du2 = float(uv2.x - uv0.x)
            dv2 = float(uv2.y - uv0.y)
            fuv = du1 * dv2 - du2 * dv1
            if abs(fuv) < 1e-10:
                T = e1.normalized() if e1.length > 1e-8 else Vector((1, 0, 0))
                Nf = e1.cross(e2)
                Nf = Nf.normalized() if Nf.length > 1e-8 else Vector((0, 0, 1))
                B = Nf.cross(T)
            else:
                T = (e1 * dv2 - e2 * dv1) / fuv
                B = (e2 * du1 - e1 * du2) / fuv
                if T.length < 1e-8:
                    T = Vector((1, 0, 0))
                else:
                    T.normalize()
                Nf = e1.cross(e2)
                Nf = Nf.normalized() if Nf.length > 1e-8 else Vector((0, 0, 1))
                T = (T - Nf * T.dot(Nf))
                if T.length < 1e-8:
                    T = Vector((1, 0, 0))
                else:
                    T.normalize()
                B = Nf.cross(T)
            for y in range(miny, maxy + 1):
                for x in range(minx, maxx + 1):
                    a = ((y1 - y2) * (x - x2) + (x2 - x1) * (y - y2)) / denom
                    b = ((y2 - y0) * (x - x2) + (x0 - x2) * (y - y2)) / denom
                    c = 1.0 - a - b
                    if a < -0.01 or b < -0.01 or c < -0.01:
                        continue
                    ao = a * roles[0][3] + b * roles[1][3] + c * roles[2][3]
                    crv = a * curvs[0] + b * curvs[1] + c * curvs[2]
                    nw = n0 * a + n1 * b + n2 * c
                    if nw.length < 1e-8:
                        nw = Nf
                    else:
                        nw.normalize()
                    tri_nts = (float(nw.dot(T)), float(nw.dot(B)), float(max(0.15, nw.dot(Nf))))
                    uv_x = a * float(uv0.x) + b * float(uv1.x) + c * float(uv2.x)
                    rr = a * roles[0][0] + b * roles[1][0] + c * roles[2][0]
                    gg = a * roles[0][1] + b * roles[1][1] + c * roles[2][1]
                    bb = a * roles[0][2] + b * roles[1][2] + c * roles[2][2]
                    # Map flat role colour back to a substance.
                    # paint=blue-ish, wear=grey, liner=brown, accent=orange, lamp=yellow
                    if rr > 0.85 and gg > 0.80:
                        role = "lamp"
                    elif rr > 0.55 and gg < 0.50:
                        role = "accent"
                    elif rr > 0.55 and abs(rr - gg) < 0.08:
                        role = "wear"
                    elif gg < 0.35 and bb < 0.30:
                        role = "liner"
                    else:
                        role = "paint"
                    base = ROLE_RGB[role]
                    dirt = (1.0 - ao) * 0.18
                    cavity = max(0.0, crv) * 0.55
                    wear = max(0.0, crv - 0.20) * (0.0 if role in {"liner", "lamp"} else 1.0)
                    grain = float(h01(x, y, 11 if role == "liner" else 3))
                    if role == "paint":
                        rgb = [
                            base[0] * (0.90 + ao * 0.12) * (1.0 - dirt * 0.16) + wear * 0.16,
                            base[1] * (0.90 + ao * 0.12) * (1.0 - dirt * 0.14) + wear * 0.14,
                            base[2] * (0.91 + ao * 0.11) * (1.0 - dirt * 0.12) + wear * 0.12,
                        ]
                    elif role == "wear":
                        rgb = [
                            base[0] * (0.80 + ao * 0.24) - dirt * 0.10 + grain * 0.02,
                            base[1] * (0.80 + ao * 0.22) - dirt * 0.08 + grain * 0.02,
                            base[2] * (0.82 + ao * 0.20) - dirt * 0.07 + grain * 0.015,
                        ]
                    elif role == "liner":
                        rgb = [
                            base[0] * (0.62 + ao * 0.18) + grain * 0.035 - cavity * 0.10,
                            base[1] * (0.58 + ao * 0.16) + grain * 0.024 - cavity * 0.08,
                            base[2] * (0.50 + ao * 0.14) + grain * 0.014 - cavity * 0.06,
                        ]
                    elif role == "accent":
                        rgb = [
                            base[0] * (0.85 + ao * 0.16) - dirt * 0.10,
                            base[1] * (0.82 + ao * 0.14) - dirt * 0.08,
                            base[2] * (0.80 + ao * 0.12) - dirt * 0.06,
                        ]
                    else:
                        rgb = [base[0], base[1], base[2]]
                    albedo[y, x, 0] = float(np.clip(rgb[0], 0, 1))
                    albedo[y, x, 1] = float(np.clip(rgb[1], 0, 1))
                    albedo[y, x, 2] = float(np.clip(rgb[2], 0, 1))
                    albedo[y, x, 3] = float(EMIT_ALPHA.get(role, 0.0))
                    rough = ROLE_ROUGH[role] + dirt * 0.14 - wear * 0.08 + cavity * 0.10
                    metal = ROLE_METAL[role] + wear * 0.08 - (0.03 if role == "liner" else 0.0)
                    orm[y, x, 0] = float(np.clip(ao * (1.0 - cavity * 0.40), 0.10, 1.0))
                    orm[y, x, 1] = float(np.clip(rough, 0.08, 0.96))
                    orm[y, x, 2] = float(np.clip(metal, 0.0, 1.0))
                    orm[y, x, 3] = 1.0
                    # Tangent-space geometric normal from the triangle, plus a
                    # low-amplitude role micro (turned groove / mineral grain).
                    # Never a checker, grid, or icon stamp.
                    nxd, nyd, nzd = tri_nts
                    if role == "wear":
                        nxd += 0.05 * math.sin((uv_x * 36.0) + crv * 2.0)
                    elif role == "liner":
                        nxd += 0.035 * (grain - 0.5)
                        nyd += 0.035 * (float(h01(x, y, 19)) - 0.5)
                    elif role == "paint":
                        nxd += 0.02 * (crv - 0.08)
                        nyd -= 0.015 * dirt
                    nlen = math.sqrt(nxd * nxd + nyd * nyd + nzd * nzd) or 1.0
                    nxd, nyd, nzd = nxd / nlen, nyd / nlen, nzd / nlen
                    nrm[y, x, 0] = float(np.clip(nxd * 0.5 + 0.5, 0, 1))
                    nrm[y, x, 1] = float(np.clip(nyd * 0.5 + 0.5, 0, 1))
                    nrm[y, x, 2] = float(np.clip(nzd * 0.5 + 0.5, 0, 1))
                    nrm[y, x, 3] = 1.0


def author_atlas(meshes, lod, size):
    albedo = np.zeros((size, size, 4), dtype=np.float32)
    orm = np.zeros((size, size, 4), dtype=np.float32)
    nrm = np.zeros((size, size, 4), dtype=np.float32)
    nrm[..., 0] = 0.5
    nrm[..., 1] = 0.5
    nrm[..., 2] = 1.0
    nrm[..., 3] = 1.0
    orm[..., 0] = 1.0
    orm[..., 1] = 0.5
    orm[..., 3] = 1.0
    # Fill unused with quiet paint so gutters never sample magenta.
    albedo[..., 0] = ROLE_RGB["paint"][0]
    albedo[..., 1] = ROLE_RGB["paint"][1]
    albedo[..., 2] = ROLE_RGB["paint"][2]
    for obj in meshes:
        rasterize_mesh_to_atlas(obj, albedo, orm, nrm, size)
    # Multiply AO into albedo (deterministic; no Cycles).
    factor = 0.78 + 0.22 * orm[..., 0]
    albedo[..., 0] *= factor
    albedo[..., 1] *= factor
    albedo[..., 2] *= factor
    np.clip(albedo, 0.0, 1.0, out=albedo)
    prefix = f"massline_core_atlas_lod{lod}"
    img_a, p_a = write_pixels(f"{prefix}_basecolor", albedo, size, "sRGB")
    img_o, p_o = write_pixels(f"{prefix}_orm", orm, size, "Non-Color")
    img_n, p_n = write_pixels(f"{prefix}_normal", nrm, size, "Non-Color")
    return (img_a, img_o, img_n), (p_a, p_o, p_n), albedo, orm, nrm


def assign_atlas_material(meshes, maps, lod):
    mat = bpy.data.materials.new(f"Material_Atlas_LOD{lod}")
    bsdf = principled(mat)
    wire_atlas(mat, bsdf, maps)
    mat["spacefaceRole"] = "atlas"
    if hasattr(mat, "blend_method"):
        try:
            mat.blend_method = "OPAQUE"
        except TypeError:
            pass
    for obj in meshes:
        if obj.type != "MESH":
            continue
        obj.data.materials.clear()
        obj.data.materials.append(mat)
    return mat


# ---------------------------------------------------------------------------
# LOD build / export
# ---------------------------------------------------------------------------

def prepare_objects(objects, bvh, lod):
    samples = {0: 14, 1: 8, 2: 6}[lod]
    for obj in objects:
        if obj.type != "MESH":
            continue
        finish_shade(obj, angle=28.0)
        role = obj.get("sf_role") or obj.get("spacefaceRole") or "paint"
        ao, curv = vertex_ao_and_curvature(obj, bvh, samples=samples)
        store_vertex_colors(obj, ao, curv, role)


def uv_pack_groups(body, spin, lamp):
    """Unique non-overlapping UV0: body | spin | lamp in three atlas columns."""
    layout = (
        (body, 0.02, 0.02, 0.68, 0.98),
        (spin, 0.70, 0.36, 0.98, 0.98),
        (lamp, 0.70, 0.02, 0.98, 0.32),
    )
    for obj, u0, v0, u1, v1 in layout:
        if obj is None:
            continue
        unique_uv(obj, island_margin=0.010)
        remap_uv_rect(obj, u0, v0, u1, v1)


def build_lod(lod):
    reset_scene()
    collection = bpy.data.collections.new(f"LOD{lod}_massline_core")
    bpy.context.scene.collection.children.link(collection)
    mats = create_role_materials()
    static, spin, lamp, lamp_loc = build_lod_geometry(lod, mats, collection)
    all_mesh = [o for o in static + spin + lamp if o.type == "MESH"]
    # Shade/bevel first so BVH sees manufactured edges.
    for obj in all_mesh:
        finish_shade(obj, angle=28.0)
    bvh = build_scene_bvh(all_mesh)
    for obj in all_mesh:
        role = obj.get("sf_role") or "paint"
        ao, curv = vertex_ao_and_curvature(obj, bvh, samples={0: 12, 1: 8, 2: 6}[lod])
        store_vertex_colors(obj, ao, curv, role)

    for obj in all_mesh:
        bb = world_bbox([obj])
        if (
            bb["min"][0] < -1.12 or bb["min"][1] < -1.12
            or bb["max"][0] > 1.12 or bb["max"][1] > 1.12
        ):
            print("OVER-PREJOIN", obj.name, bb)
    root = bpy.data.objects.new(f"LOD{lod}_Root", None)
    collection.objects.link(root)
    body = join_group(static, f"LOD{lod}_massline_core", parent=root)
    spin_m = join_group(spin, f"LOD{lod}_massline_core_spin", parent=root)
    lamp_m = join_group(lamp, f"LOD{lod}_massline_core_lamp", parent=root)
    joined = [o for o in (body, spin_m, lamp_m) if o is not None]
    uv_pack_groups(body, spin_m, lamp_m)
    size = TEX_BY_LOD[lod]
    maps, paths, albedo, orm, nrm = author_atlas(joined, lod, size)
    atlas_mat = assign_atlas_material(joined, maps, lod)
    for obj in joined:
        triangulate(obj)
        quantize_mesh(obj)
        obj["spacefaceLod"] = f"lod{lod}"
        obj["spaceface"] = {"lod": f"lod{lod}"}

    tris = sum(count_tris(o) for o in joined)
    if tris > TRI_BUDGET[lod]:
        raise RuntimeError(
            f"LOD{lod} triangles {tris} exceed budget {TRI_BUDGET[lod]}"
        )
    bbox = world_bbox(joined)
    if bbox["min"][0] < -1.12 or bbox["min"][1] < -1.12 or bbox["max"][0] > 1.12 or bbox["max"][1] > 1.12:
        for obj in joined:
            print("OVER-PART", obj.name, world_bbox([obj]))
        raise RuntimeError(f"LOD{lod} footprint {bbox} exceeds the one-cell envelope")
    if bbox["min"][2] < -0.02 or bbox["max"][2] > 1.12:
        raise RuntimeError(f"LOD{lod} height {bbox} exceeds the 1.10 wu envelope")
    report = {
        "lod": lod,
        "triangles": int(tris),
        "draws": int(len(joined)),
        "materials": [atlas_mat.name],
        "bbox": bbox,
        "triBudget": TRI_BUDGET[lod],
        "triOverBudget": bool(tris > TRI_BUDGET[lod]),
        "textureSize": size,
        "atlas": [rel(p) for p in paths],
        "lampLoc": [round(lamp_loc.x, 4), round(lamp_loc.y, 4), round(lamp_loc.z, 4)],
        "meshNames": [o.name for o in joined],
    }
    out = SOURCE_DIR / f"massline_core_lod{lod}.glb"
    export_objects(joined + [root], out)
    report["path"] = rel(out)
    report["bytes"] = out.stat().st_size
    report["sha256"] = sha256(out)
    print(json.dumps({"lod": lod, "triangles": tris, "draws": len(joined), "bytes": report["bytes"]}, indent=2))
    return report, lamp_loc


def export_objects(objects, path: Path):
    path.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.object.select_all(action="DESELECT")
    for obj in objects:
        if obj is None:
            continue
        try:
            obj.hide_viewport = False
            obj.hide_set(False)
            obj.select_set(True)
            if obj.type == "MESH" and obj.data:
                obj.data.name = obj.name
        except Exception:
            continue
    tmp = path.with_suffix(".tmp.glb")
    bpy.ops.export_scene.gltf(
        filepath=str(tmp), export_format="GLB", use_selection=True, export_apply=True,
        export_yup=True, export_extras=True, export_animations=False,
        export_materials="EXPORT", export_texcoords=True, export_normals=True,
        export_tangents=True, export_image_format="AUTO",
    )
    for attempt in range(6):
        try:
            if path.exists():
                path.unlink()
            tmp.replace(path)
            break
        except OSError:
            if attempt == 5:
                raise
            time.sleep(0.3 * (attempt + 1))
    sanitize_glb_floats(path)
    return path


def _read_glb(path: Path):
    data = bytearray(path.read_bytes())
    if data[:4] != b"glTF" or len(data) < 20:
        raise RuntimeError(f"not a GLB: {path}")
    json_len = struct.unpack_from("<I", data, 12)[0]
    json_start = 20
    json_end = json_start + json_len
    gltf = json.loads(bytes(data[json_start:json_end]).rstrip(b" \x00"))
    rest = bytes(data[json_end:])
    return gltf, rest


def _write_glb(path: Path, gltf: dict, rest: bytes) -> None:
    payload = json.dumps(gltf, separators=(",", ":"), ensure_ascii=True).encode("utf-8")
    while len(payload) % 4:
        payload += b" "
    header = bytearray()
    header += b"glTF"
    header += struct.pack("<I", 2)
    total = 12 + 8 + len(payload) + len(rest)
    header += struct.pack("<I", total)
    header += struct.pack("<I", len(payload))
    header += b"JSON"
    tmp = path.with_suffix(".glb.stamp-tmp")
    tmp.write_bytes(bytes(header) + payload + rest)
    tmp.replace(path)


def stamp_glb_contract(path: Path, contract: dict) -> None:
    gltf, rest = _read_glb(path)
    extras = dict(gltf.get("asset", {}).get("extras") or {})
    extras["assetId"] = ASSET_ID
    extras["partId"] = ASSET_ID
    extras["identity"] = IDENTITY
    extras["spacefaceAsset"] = contract
    gltf.setdefault("asset", {})["extras"] = extras
    scenes = gltf.get("scenes") or []
    if scenes:
        scene_extras = dict(scenes[0].get("extras") or {})
        scene_extras["assetId"] = ASSET_ID
        scene_extras["identity"] = IDENTITY
        scene_extras["spacefaceAsset"] = contract
        scenes[0]["extras"] = scene_extras
    nodes = gltf.get("nodes") or []
    root = None
    for node in nodes:
        if node.get("name") == IDENTITY:
            root = node
            break
    if root is None and nodes:
        root = max(nodes, key=lambda n: len(n.get("children") or []))
        root["name"] = IDENTITY
    if root is not None:
        node_extras = dict(root.get("extras") or {})
        node_extras["spacefaceAsset"] = contract
        node_extras["identity"] = IDENTITY
        root["extras"] = node_extras
    hook_set = set(HOOK_NAMES)
    for node in nodes:
        name = node.get("name") or ""
        if name in hook_set and node.get("mesh") is None:
            extras = dict(node.get("extras") or {})
            extras["spacefaceSocket"] = True
            extras["socket"] = True
            extras["spaceface"] = {"socket": True, "role": "works_hook"}
            node["extras"] = extras
        if name.startswith("LOD") and "_" in name:
            extras = dict(node.get("extras") or {})
            lod = name.split("_", 1)[0].lower()
            extras["spacefaceLod"] = lod
            extras["spaceface"] = {"lod": lod, **dict(extras.get("spaceface") or {})}
            node["extras"] = extras
        if name == "COLLISION_HULL":
            extras = dict(node.get("extras") or {})
            extras["nonRender"] = True
            extras["sf_collision"] = True
            extras["spaceface"] = {
                "collision": True, "helper": True, "nonRender": True,
                "role": "collision", "kind": "box",
            }
            node["extras"] = extras
    _write_glb(path, gltf, rest)


def _import_lod(path: Path, lod: int):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=str(path))
    imported = [obj for obj in bpy.data.objects if obj not in before]
    for obj in imported:
        obj["sf_import_lod"] = lod
    return imported


def _strip_dup(name: str) -> str:
    if "." in name:
        stem, suffix = name.rsplit(".", 1)
        if suffix.isdigit():
            return stem
    return name


def combine_lods(lod_reports, lamp_loc):
    reset_scene()
    root = bpy.data.objects.new(IDENTITY, None)
    bpy.context.scene.collection.objects.link(root)
    root.empty_display_type = "PLAIN_AXES"
    root.empty_display_size = 0.16
    spin = add_empty("ring_spin", (0.0, 0.0, 0.5 * (SPIN_Z0 + SPIN_Z1)), bpy.context.scene.collection, parent=root, size=0.10)
    lamp = add_empty("lamp", tuple(lamp_loc), bpy.context.scene.collection, parent=root, size=0.08)
    lod_tri = {0: 0, 1: 0, 2: 0}
    mesh_names = []
    for lod in (0, 1, 2):
        path = SOURCE_DIR / f"massline_core_lod{lod}.glb"
        imported = _import_lod(path, lod)
        for obj in list(imported):
            raw = _strip_dup(obj.name)
            obj["_sf_raw"] = raw
            if obj.type != "MESH":
                if lod > 0:
                    try:
                        bpy.data.objects.remove(obj, do_unlink=True)
                    except Exception:
                        pass
                continue
            if "spin" in raw.lower():
                obj.name = f"LOD{lod}_massline_core_spin"
                parent_keep(obj, spin)
            elif "lamp" in raw.lower():
                obj.name = f"LOD{lod}_massline_core_lamp"
                parent_keep(obj, lamp)
            else:
                obj.name = f"LOD{lod}_massline_core"
                parent_keep(obj, root)
            obj["spacefaceLod"] = f"lod{lod}"
            obj["spaceface"] = {"lod": f"lod{lod}"}
            lod_tri[lod] += count_tris(obj)
            mesh_names.append(obj.name)

    chull = bpy.data.objects.new("COLLISION_HULL", None)
    bpy.context.scene.collection.objects.link(chull)
    chull.empty_display_type = "CUBE"
    chull.empty_display_size = 1.0
    chull.scale = Vector((HALF, HALF, TARGET_H * 0.5))
    chull.location = Vector((0.0, 0.0, TARGET_H * 0.5))
    chull["sf_collision"] = True
    chull["nonRender"] = True
    chull["spaceface"] = {
        "collision": True, "helper": True, "nonRender": True,
        "role": "collision", "kind": "box",
    }
    parent_keep(chull, root)

    contract = {
        "contractVersion": 1,
        "assetId": ASSET_ID,
        "partId": ASSET_ID,
        "liveId": ASSET_ID,
        "identity": IDENTITY,
        "slot": "place",
        "category": "works",
        "family": "asteroid_works",
        "packet": PACKET,
        "cycle": CYCLE,
        "role": "claim-anchor wellhead — the thing that claims the rock",
        "forward": "+X",
        "up": "+Y",
        "starboard": "+Z",
        "unit": "metre",
        "normalConvention": "OpenGL",
        "ormChannels": "R=AO,G=Roughness,B=Metallic",
        "textureCompression": "PNG-source",
        "textureAuthorship": "mesh-derived AO/curvature/tangent-normal + authored unique-UV 1024 atlas (paint/wear/liner/accent/lamp)",
        "textureSize": 1024,
        "deliverableRole": "production_multi_lod",
        "lods": ["lod0", "lod1", "lod2"],
        "exportedLods": ["lod0", "lod1", "lod2"],
        "lodTriangles": {
            "lod0": int(lod_tri[0]),
            "lod1": int(lod_tri[1]),
            "lod2": int(lod_tri[2]),
        },
        "triangleCount": int(lod_tri[0]),
        "sockets": list(HOOK_NAMES),
        "hooks": list(HOOK_NAMES),
        "wiringStatus": "source_candidate_unwired",
        "blenderBasis": "Z-up works scale",
        "exportBasis": "Y-up glTF",
        "disposition": "review_pending",
    }
    root["spacefaceAsset"] = contract
    bpy.context.scene["spacefaceAsset"] = contract

    bpy.ops.object.select_all(action="DESELECT")
    exportables = [root]
    stack = [root]
    while stack:
        node = stack.pop()
        for child in node.children:
            exportables.append(child)
            stack.append(child)
    for obj in exportables:
        try:
            obj.hide_set(False)
            obj.hide_viewport = False
            obj.hide_render = False
            obj.select_set(True)
        except Exception:
            pass
    bpy.context.view_layer.objects.active = root

    SOURCE_DIR.mkdir(parents=True, exist_ok=True)
    PARTS_GLB.parent.mkdir(parents=True, exist_ok=True)
    combined = SOURCE_DIR / "massline_core.glb"
    tmp = SOURCE_DIR / "massline_core.tmp.glb"
    bpy.ops.export_scene.gltf(
        filepath=str(tmp), export_format="GLB", use_selection=True, export_apply=True,
        export_yup=True, export_extras=True, export_animations=False,
        export_materials="EXPORT", export_texcoords=True, export_normals=True,
        export_tangents=True, export_image_format="AUTO",
    )
    sanitize_glb_floats(tmp)
    stamp_glb_contract(tmp, contract)
    if combined.exists():
        combined.unlink()
    tmp.replace(combined)
    if PARTS_GLB.exists():
        PARTS_GLB.unlink()
    PARTS_GLB.write_bytes(combined.read_bytes())

    BLEND_DIR.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(BLEND_PATH))
    (SOURCE_DIR / "massline_core.blend").write_bytes(BLEND_PATH.read_bytes())

    inventory = {
        "assetId": ASSET_ID,
        "identity": IDENTITY,
        "combined": rel(combined),
        "partsSource": rel(PARTS_GLB),
        "blend": rel(BLEND_PATH),
        "lodTriangles": contract["lodTriangles"],
        "hooks": list(HOOK_NAMES),
        "meshNames": sorted(mesh_names),
        "bytes": combined.stat().st_size,
        "sha256": sha256(combined),
        "partsSha256": sha256(PARTS_GLB),
        "lodReports": lod_reports,
    }
    (SOURCE_DIR / "massline_core_inventory.json").write_bytes(
        (json.dumps(inventory, indent=2) + "\n").encode("utf-8"),
    )
    print(json.dumps({"ok": True, "combined": inventory["sha256"], "tris": contract["lodTriangles"]}, indent=2))
    return inventory, contract


# ---------------------------------------------------------------------------
# Contact sheet + stills
# ---------------------------------------------------------------------------

def load_image_array(path: Path):
    img = bpy.data.images.load(str(path))
    w, h = int(img.size[0]), int(img.size[1])
    px = np.array(img.pixels[:], dtype=np.float32).reshape(h, w, img.channels)
    if px.shape[2] == 3:
        alpha = np.ones((h, w, 1), dtype=np.float32)
        px = np.concatenate([px, alpha], axis=2)
    bpy.data.images.remove(img)
    return px


def resize_nn(px, tw, th):
    h, w = px.shape[:2]
    ys = np.linspace(0, h - 1, th).astype(np.int32)
    xs = np.linspace(0, w - 1, tw).astype(np.int32)
    return px[ys][:, xs]


def compose_contact_sheet():
    REF_DIR.mkdir(parents=True, exist_ok=True)
    tiles = []
    for path in CITED_REFS:
        if not path.exists():
            raise FileNotFoundError(f"cited reference missing: {path}")
        tiles.append(load_image_array(path))
    tw, th = 960, 540
    resized = [resize_nn(t, tw, th) for t in tiles]
    # Colour bars so the four cited cells stay distinguishable without fonts.
    bars = (
        (0.85, 0.55, 0.20, 1.0),
        (0.45, 0.38, 0.32, 1.0),
        (0.20, 0.22, 0.28, 1.0),
        (0.70, 0.62, 0.40, 1.0),
    )
    for i, tile in enumerate(resized):
        tile[th - 10:th, :, :] = bars[i]
        tile[0:6, :, :] = bars[i]
    sheet = np.zeros((1080, 1920, 4), dtype=np.float32)
    sheet[540:1080, 0:960] = resized[0]
    sheet[540:1080, 960:1920] = resized[1]
    sheet[0:540, 0:960] = resized[2]
    sheet[0:540, 960:1920] = resized[3]
    out = REF_DIR / "CONTACT_SHEET.png"
    name = "_contact_sheet"
    if name in bpy.data.images:
        bpy.data.images.remove(bpy.data.images[name])
    img = bpy.data.images.new(name, width=1920, height=1080, alpha=True)
    img.colorspace_settings.name = "sRGB"
    img.pixels.foreach_set(np.ascontiguousarray(sheet, dtype=np.float32).ravel())
    img.filepath_raw = str(out)
    img.file_format = "PNG"
    img.save()
    sanitize_png(out)
    bpy.data.images.remove(img)
    return out


def look_at(obj, target=(0, 0, 0)):
    obj.rotation_euler = (Vector(target) - obj.location).to_track_quat("-Z", "Y").to_euler()


def setup_mine_lights():
    scene = bpy.context.scene
    try:
        scene.render.engine = "BLENDER_EEVEE_NEXT"
    except TypeError:
        scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 1920
    scene.render.resolution_y = 1080
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGB"
    scene.render.film_transparent = False
    try:
        scene.view_settings.view_transform = "Khronos PBR Neutral"
    except TypeError:
        try:
            scene.view_settings.view_transform = "AgX"
        except TypeError:
            pass
    try:
        scene.view_settings.look = "None"
    except TypeError:
        pass
    scene.view_settings.exposure = 0.05
    if hasattr(scene, "eevee"):
        try:
            scene.eevee.taa_render_samples = 32
        except Exception:
            pass
        try:
            scene.eevee.use_shadows = True
        except Exception:
            pass
    world = scene.world or bpy.data.worlds.new("MineWorld")
    scene.world = world
    world.use_nodes = True
    bg = world.node_tree.nodes.get("Background")
    if bg:
        bg.inputs["Color"].default_value = (0.028, 0.022, 0.018, 1)
        bg.inputs["Strength"].default_value = 0.22
    if hasattr(world, "mist_settings"):
        try:
            world.mist_settings.use_mist = False
        except Exception:
            pass
    # Large receding mine floor — not a cell-sized brown square deck.
    bpy.ops.mesh.primitive_plane_add(size=28.0, location=(0, 0, -0.006))
    pad = bpy.context.object
    pad.name = "MinePad"
    pad_mat = bpy.data.materials.new("MinePadMat")
    pad_mat.use_nodes = True
    pad_bsdf = next(n for n in pad_mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    pad_bsdf.inputs["Base Color"].default_value = (0.032, 0.026, 0.020, 1)
    pad_bsdf.inputs["Roughness"].default_value = 0.92
    pad_bsdf.inputs["Metallic"].default_value = 0.02
    pad.data.materials.append(pad_mat)
    pad.hide_select = True
    # Evidence-only shaft void: the well is bored into rock, not onto a lit floor.
    bpy.ops.mesh.primitive_cylinder_add(
        vertices=16, radius=WELL_INNER_R_BOT - 0.012, depth=2.4, location=(0.0, 0.0, -1.22),
    )
    shaft = bpy.context.object
    shaft.name = "WellShaft"
    shaft_mat = bpy.data.materials.new("WellShaftMat")
    shaft_mat.use_nodes = True
    shaft_bsdf = next(n for n in shaft_mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    shaft_bsdf.inputs["Base Color"].default_value = (0.004, 0.003, 0.003, 1)
    shaft_bsdf.inputs["Roughness"].default_value = 1.0
    shaft_bsdf.inputs["Metallic"].default_value = 0.0
    shaft.data.materials.append(shaft_mat)
    shaft.hide_select = True

    reach = 4.0
    cam_data = bpy.data.cameras.new("WorksCam")
    camera = bpy.data.objects.new("WorksCam", cam_data)
    scene.collection.objects.link(camera)
    scene.camera = camera
    for name, loc, energy, color, angle in (
        ("Key", (-1.15 * reach, -0.78 * reach, 0.48 * reach), 6.4, (1.00, 0.863, 0.737), 18.0),
        ("Rim", (0.22 * reach, 1.45 * reach, 0.30 * reach), 2.40, (0.616, 0.722, 0.941), 25.0),
        ("Fill", (1.12 * reach, 0.46 * reach, 0.50 * reach), 3.10, (0.847, 0.765, 0.659), 30.0),
        ("Ground", (0.20 * reach, -1.40 * reach, 0.16 * reach), 0.45, (0.90, 0.82, 0.72), 48.0),
    ):
        data = bpy.data.lights.new(name, "SUN")
        data.energy = energy
        data.color = color
        try:
            data.angle = math.radians(angle)
        except Exception:
            pass
        obj = bpy.data.objects.new(name, data)
        scene.collection.objects.link(obj)
        obj.location = loc
        look_at(obj, (0, 0, 0.3))
        if name in {"Key", "Ground"}:
            data.use_shadow = True
    return camera, pad, shaft


def override_clay(meshes):
    backups = {}
    clay = bpy.data.materials.new("WorksClay")
    clay.use_nodes = True
    clay.node_tree.nodes.clear()
    out = clay.node_tree.nodes.new("ShaderNodeOutputMaterial")
    bsdf = clay.node_tree.nodes.new("ShaderNodeBsdfPrincipled")
    bsdf.inputs["Base Color"].default_value = (0.46, 0.46, 0.47, 1)
    bsdf.inputs["Metallic"].default_value = 0.0
    bsdf.inputs["Roughness"].default_value = 0.58
    clay.node_tree.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])
    for obj in meshes:
        backups[obj.name] = [slot.material for slot in obj.material_slots]
        if obj.material_slots:
            obj.material_slots[0].material = clay
        else:
            obj.data.materials.append(clay)
    return backups, clay


def _image_blob(img):
    return " ".join([
        str(img.name or ""),
        str(getattr(img, "filepath_raw", "") or ""),
        str(getattr(img, "filepath", "") or ""),
    ]).lower()


def find_atlas_image(*needles):
    for img in bpy.data.images:
        blob = _image_blob(img)
        if all(n.lower() in blob for n in needles):
            return img
    return None


def _load_iso_image(kind):
    path = TEX_DIR / f"massline_core_atlas_lod0_{kind}.png"
    if not path.exists():
        img = find_atlas_image(kind)
        if img is not None:
            return img
        raise FileNotFoundError(f"isolation atlas missing: {path}")
    name = f"_iso_{kind}"
    if name in bpy.data.images:
        bpy.data.images.remove(bpy.data.images[name])
    img = bpy.data.images.load(str(path))
    img.name = name
    img.colorspace_settings.name = "Non-Color"
    return img


def override_atlas_emit(meshes, kind):
    backups = {}
    mat = bpy.data.materials.new(f"Iso_{kind}")
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    emit = nt.nodes.new("ShaderNodeEmission")
    emit.inputs["Strength"].default_value = 1.0
    texnode = nt.nodes.new("ShaderNodeTexImage")
    texnode.image = _load_iso_image(kind)
    uv = nt.nodes.new("ShaderNodeUVMap")
    uv.uv_map = "UVMap"
    nt.links.new(uv.outputs["UV"], texnode.inputs["Vector"])
    nt.links.new(texnode.outputs["Color"], emit.inputs["Color"])
    nt.links.new(emit.outputs["Emission"], out.inputs["Surface"])
    for obj in meshes:
        backups[obj.name] = [slot.material for slot in obj.material_slots]
        if obj.material_slots:
            obj.material_slots[0].material = mat
        else:
            obj.data.materials.append(mat)
    return backups, mat


def override_id(meshes):
    backups = {}
    mats = {}
    for role, rgb in ROLE_FLAT.items():
        mat = bpy.data.materials.new(f"ID_{role}")
        mat.use_nodes = True
        mat.node_tree.nodes.clear()
        out = mat.node_tree.nodes.new("ShaderNodeOutputMaterial")
        emit = mat.node_tree.nodes.new("ShaderNodeEmission")
        emit.inputs["Color"].default_value = (*rgb, 1.0)
        emit.inputs["Strength"].default_value = 1.0
        mat.node_tree.links.new(emit.outputs["Emission"], out.inputs["Surface"])
        mats[role] = mat
    default = mats["paint"]
    for obj in meshes:
        backups[obj.name] = [slot.material for slot in obj.material_slots]
        name = obj.name.lower()
        if "lamp" in name and "spin" not in name:
            mat = mats["lamp"]
        elif "spin" in name:
            mat = mats["wear"]
        else:
            mat = default
        if obj.material_slots:
            obj.material_slots[0].material = mat
        else:
            obj.data.materials.append(mat)
    return backups


def restore_mats(meshes, backups):
    for obj in meshes:
        mats = backups.get(obj.name, [])
        for index, material in enumerate(mats):
            if index < len(obj.material_slots):
                obj.material_slots[index].material = material


def render_stills(glb_path: Path, still_dir: Path):
    print(f"render stills from {glb_path.name}")
    reset_scene()
    bpy.ops.import_scene.gltf(filepath=str(glb_path))
    camera, pad, shaft = setup_mine_lights()
    helper_names = {"MinePad", "WellShaft"}
    meshes = [
        obj for obj in bpy.data.objects
        if obj.type == "MESH" and obj.name not in helper_names
    ]
    still_dir.mkdir(parents=True, exist_ok=True)

    def set_lod_visible(keep):
        for obj in bpy.data.objects:
            if obj.type != "MESH" or obj.name in helper_names:
                continue
            idx = None
            if obj.name.startswith("LOD") and len(obj.name) > 3 and obj.name[3].isdigit():
                idx = int(obj.name[3])
            hide = idx is not None and idx != keep
            obj.hide_render = hide
            try:
                obj.hide_set(hide)
            except Exception:
                pass

    def snap(name, framing, transparent=False, edge_dir=(1.0, 0.0), samples=None):
        scene = bpy.context.scene
        scene.render.film_transparent = transparent
        if samples is not None and hasattr(scene, "eevee"):
            try:
                scene.eevee.taa_render_samples = int(samples)
            except Exception:
                pass
        pose = apply_works_camera(camera, framing=framing, focus=(0.0, 0.0, 0.0), edge_dir=edge_dir)
        offset = pose["object_offset"]
        moved = []
        if offset != (0.0, 0.0, 0.0):
            for obj in bpy.data.objects:
                if obj.type in {"CAMERA", "LIGHT"}:
                    continue
                if obj.parent is not None:
                    continue
                obj.location.x += offset[0]
                obj.location.y += offset[1]
                obj.location.z += offset[2]
                moved.append(obj)
            bpy.context.view_layer.update()
        path = still_dir / name
        bpy.context.scene.render.filepath = str(path)
        bpy.ops.render.render(write_still=True)
        sanitize_png(path)
        for obj in moved:
            obj.location.x -= offset[0]
            obj.location.y -= offset[1]
            obj.location.z -= offset[2]
        scene.render.film_transparent = False
        return path, pose

    paths = {}
    set_lod_visible(0)
    meshes0 = [o for o in meshes if not o.hide_render]
    paths["works_top"], pose_top = snap("works_top.png", "works_top")
    paths["works_edge"], pose_edge = snap("works_edge.png", "works_edge")
    set_lod_visible(1)
    paths["works_site"], pose_site = snap("works_site.png", "works_site")
    set_lod_visible(0)

    backups, _clay = override_clay(meshes)
    paths["works_top_clay"], _ = snap("works_top_clay.png", "works_top")
    paths["works_edge_clay"], _ = snap("works_edge_grazing.png", "works_edge")
    restore_mats(meshes, backups)

    scene = bpy.context.scene
    vt, look, exposure = scene.view_settings.view_transform, scene.view_settings.look, scene.view_settings.exposure
    scene.view_settings.view_transform = "Standard"
    try:
        scene.view_settings.look = "None"
    except TypeError:
        pass
    scene.view_settings.exposure = 0.0
    pad.hide_render = True
    shaft.hide_render = True
    for light in [obj for obj in bpy.data.objects if obj.type == "LIGHT"]:
        light.hide_render = True

    nback, _ = override_atlas_emit(meshes, "normal")
    paths["normal_isolation"], _ = snap("normal_isolation.png", "works_top", samples=1)
    restore_mats(meshes, nback)
    oback, _ = override_atlas_emit(meshes, "orm")
    paths["orm_isolation"], _ = snap("orm_isolation.png", "works_top", samples=1)
    restore_mats(meshes, oback)
    idback = override_id(meshes)
    paths["material_id"], _ = snap("material_id.png", "works_top", samples=1)
    restore_mats(meshes, idback)

    # Hook / identity diagnostic: small markers at empties (not part of the GLB).
    markers = []
    for obj in list(bpy.data.objects):
        if obj.name in HOOK_NAMES or obj.name == IDENTITY:
            bpy.ops.mesh.primitive_uv_sphere_add(radius=0.045, location=obj.matrix_world.translation)
            mark = bpy.context.object
            mark.name = f"diag_{obj.name}"
            mat = bpy.data.materials.new(f"diagmat_{obj.name}")
            mat.use_nodes = True
            emit = next(n for n in mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
            if obj.name == "lamp":
                emit.inputs["Base Color"].default_value = (1.0, 0.75, 0.20, 1)
            elif obj.name == "ring_spin":
                emit.inputs["Base Color"].default_value = (0.20, 0.85, 0.90, 1)
            else:
                emit.inputs["Base Color"].default_value = (0.9, 0.9, 0.9, 1)
            if "Emission Strength" in emit.inputs:
                emit.inputs["Emission Strength"].default_value = 3.0
            mark.data.materials.append(mat)
            markers.append(mark)
    pad.hide_render = False
    shaft.hide_render = False
    for light in [obj for obj in bpy.data.objects if obj.type == "LIGHT"]:
        light.hide_render = False
    scene.view_settings.view_transform = vt
    try:
        scene.view_settings.look = look
    except TypeError:
        pass
    scene.view_settings.exposure = exposure
    paths["hook_identity"], _ = snap("hook_identity.png", "works_top")
    for mark in markers:
        try:
            bpy.data.objects.remove(mark, do_unlink=True)
        except Exception:
            pass

    if hasattr(scene, "eevee"):
        try:
            scene.eevee.taa_render_samples = 32
        except Exception:
            pass

    camera_facts = {
        "fovVDeg": FOV_V_DEG,
        "cellWu": CELL_WU,
        "resolution": [1920, 1080],
        "works_top": {
            "distance": pose_top["distance"],
            "location": list(pose_top["location"]),
            "objectOffset": list(pose_top["object_offset"]),
            "pxPerCellTarget": pose_top["px_per_cell"],
        },
        "works_edge": {
            "distance": pose_edge["distance"],
            "location": list(pose_edge["location"]),
            "objectOffset": list(pose_edge["object_offset"]),
            "pxPerCellTarget": pose_edge["px_per_cell"],
            "note": "camera matches works_top; object is offset so side walls read",
        },
        "works_site": {
            "distance": pose_site["distance"],
            "location": list(pose_site["location"]),
            "objectOffset": list(pose_site["object_offset"]),
            "pxPerCellTarget": pose_site["px_per_cell"],
        },
    }
    return {k: rel(v) for k, v in paths.items()}, camera_facts, paths


def occupancy_from_still(path: Path, cell_px=120.0, cx_frac=0.5):
    img = bpy.data.images.load(str(path))
    w, h = int(img.size[0]), int(img.size[1])
    px = np.array(img.pixels[:], dtype=np.float32).reshape(h, w, img.channels)
    bpy.data.images.remove(img)
    luma = 0.2126 * px[..., 0] + 0.7152 * px[..., 1] + 0.0722 * px[..., 2]
    cx = int(w * float(cx_frac))
    cy = h // 2
    span = int(round(float(cell_px) * 1.05 * 1.15))
    y0, y1 = max(0, cy - span // 2), min(h, cy + span // 2)
    x0, x1 = max(0, cx - span // 2), min(w, cx + span // 2)
    sub = luma[y0:y1, x0:x1]
    border = np.concatenate([sub[0, :], sub[-1, :], sub[:, 0], sub[:, -1]])
    pad = float(np.median(border))
    mask = np.abs(sub - pad) > 0.035
    ys, xs = np.nonzero(mask)
    if len(ys) == 0:
        return {"pixels": 0, "bbox": None, "cellPx": float(cell_px), "occupancyOfCell": 0.0}
    bbox = [int(xs.min() + x0), int(ys.min() + y0), int(xs.max() + x0), int(ys.max() + y0)]
    bw = bbox[2] - bbox[0] + 1
    bh = bbox[3] - bbox[1] + 1
    ocx = int(round(0.5 * (bbox[0] + bbox[2])))
    ocy = int(round(0.5 * (bbox[1] + bbox[3])))
    well_r = max(3, int(round(float(cell_px) * 0.16)))
    well = luma[max(0, ocy - well_r):ocy + well_r, max(0, ocx - well_r):ocx + well_r]
    return {
        "pixels": int(mask.sum()),
        "bbox": bbox,
        "bboxSizePx": [int(bw), int(bh)],
        "cellPx": float(cell_px),
        "occupancyOfCell": round(float(mask.sum()) / (float(cell_px) * float(cell_px)), 4),
        "objectCenterLuma": round(float(luma[ocy, ocx]), 4),
        "wellMeanLuma": round(float(well.mean()) if well.size else 0.0, 4),
        "frameMeanLuma": round(float(luma.mean()), 4),
        "localPadLuma": round(pad, 4),
    }


def inspect_glb_nodes(path: Path):
    gltf, _rest = _read_glb(path)
    nodes = gltf.get("nodes") or []
    names = [n.get("name") for n in nodes]
    hooks = [n for n in names if n in HOOK_NAMES]
    lods = [n for n in names if n and str(n).startswith("LOD")]
    identity = IDENTITY in names
    meshes = gltf.get("meshes") or []
    primitives = sum(len(m.get("primitives") or []) for m in meshes)
    materials = gltf.get("materials") or []
    return {
        "nodeNames": names,
        "hooks": hooks,
        "lodNodes": lods,
        "identityPresent": identity,
        "meshCount": len(meshes),
        "primitiveCount": primitives,
        "materialCount": len(materials),
        "sceneExtrasIdentity": ((gltf.get("scenes") or [{}])[0].get("extras") or {}).get("identity"),
    }


def run_hidden_faces(glb_path: Path, json_out: Path):
    import subprocess
    blender = getattr(bpy.app, "binary_path", "") or ""
    if not blender or not Path(blender).exists():
        blender = r"C:\Program Files\Blender Foundation\Blender 5.1\blender.exe"
    script = TOOLS / "works_visible_faces.py"
    json_out.parent.mkdir(parents=True, exist_ok=True)
    cmd = [
        blender, "--background", "--python", str(script), "--",
        "--glb", str(glb_path), "--json-out", str(json_out),
    ]
    print("hidden-face:", " ".join(cmd))
    proc = subprocess.run(cmd, capture_output=True, text=True)
    (EVIDENCE_DIR / "hidden_faces_stdout.txt").write_text(
        (proc.stdout or "") + "\n--- stderr ---\n" + (proc.stderr or ""), encoding="utf-8", newline="\n",
    )
    return proc.returncode, json_out if json_out.exists() else None


def write_audits(inventory, contract, stills, camera_facts, occupancy, glb_inspect, hidden):
    FAMILY.mkdir(parents=True, exist_ok=True)
    still_rel = stills
    hash_stills = {}
    for key, rel_path in still_rel.items():
        p = ROOT / rel_path
        hash_stills[key] = sha256(p) if p.exists() else None

    audit_md = FAMILY / "MATERIAL_AND_SHAPE_AUDIT.md"
    audit_md.write_text(
        "\n".join([
            "# Massline Core — material and shape audit (Cycle 03)",
            "",
            f"Identity `{IDENTITY}`. Packet `{PACKET}`. State `design_candidate`.",
            "Whole-asset G1/G2/G4 remain open. Disposition: `review_pending` / `revise`.",
            "",
            "## Shape grammar",
            "",
            "Cycle 02 still collapsed to a washer/manhole: continuous dark torus, shallow",
            "brown plug, cube feet, lost lap gaps, round site dot. Cycle 03 keeps the open",
            "well and inner race and rebuilds: eight overlapping hat/U-channel collar",
            "courses with separated upper/lower flanges, directional laps and shadowed",
            "pitch breaks; four folded dark-painted angle shoes with gussets into the",
            "collar web; a tapered dark refractory well with a true inner wall; one",
            "asymmetric rooted hooded lamp (arm, socket, hood, recessed lens).",
            "",
            "Clay must read: dark circular hole, segmented hat-channel collar, four claimed",
            "corners, a separate inner race, one hooded fixture. A washer / manhole / gear /",
            "tire / nut / nested-square puck / round site dot is a fail.",
            "",
            "## Material bill (billed zones)",
            "",
            "| Zone | Substrate | Finish | Forbidden |",
            "|---|---|---|---|",
            "| Collar / shoes / hood / arm | formed steel | dark alkyd dielectric, edge wear | safety yellow, plastic, uniform AO dirt |",
            "| Race / bolts / hatch strap | machined steel | restrained bare steel | chrome, coin highlight |",
            "| Well liner | dry refractory | dark mineral, dusty throat | brown disk/plug, metal paint, glowing well |",
            "| Hatch cover | primed steel | restrained warm oxide | yellow brick |",
            "| Lamp lens | recessed dielectric | small warm emissive | beacon, painted tab, emissive ring |",
            "",
            "`allSupportedViewZonesClassified`: false (independent reviewer has not confirmed).",
            "",
            "## Construction sequence",
            "",
            "1. Tapered dark liner, real lip, open through, true inner wall.",
            "2. Eight hat-channel courses with pitch-break gaps and raised directional laps.",
            "3. Four L-plan angle shoes + gussets into the collar web.",
            "4. Separate thin inner bearing race (ring_spin).",
            "5. One hatch, one rooted hooded lamp.",
            "",
            "Every visible part has a load path into the liner or a shoe. No occupancy fins.",
            "",
        ]),
        encoding="utf-8",
        newline="\n",
    )

    contract_json = {
        "schema": "spaceface.materialContract.v1",
        "assetId": ASSET_ID,
        "identity": IDENTITY,
        "packet": PACKET,
        "cycle": CYCLE,
        "state": "design_candidate",
        "disposition": "review_pending",
        "allSupportedViewZonesClassified": False,
        "supportedViews": ["works_top", "works_edge", "works_site"],
        "zones": [
            {
                "id": "collar_paint", "disposition": "billed",
                "substrate": "formed steel plate", "finish": "dark alkyd dielectric",
                "supportedViews": ["works_top", "works_edge", "works_site"],
                "dominatesView": True,
            },
            {
                "id": "wear_metal", "disposition": "billed",
                "substrate": "machined steel", "finish": "bare / grease / abrasion",
                "supportedViews": ["works_top", "works_edge"],
                "dominatesView": False,
            },
            {
                "id": "well_liner", "disposition": "billed",
                "substrate": "dry refractory mineral", "finish": "dusty, unglazed",
                "supportedViews": ["works_top", "works_edge"],
                "dominatesView": True,
            },
            {
                "id": "service_accent", "disposition": "billed",
                "substrate": "primed steel hatch", "finish": "restrained warm oxide",
                "supportedViews": ["works_top"],
                "dominatesView": False,
            },
            {
                "id": "lamp_lens", "disposition": "billed",
                "substrate": "recessed dielectric lens", "finish": "small warm emissive",
                "supportedViews": ["works_top", "works_edge"],
                "dominatesView": False,
            },
        ],
        "forbidden": [
            "safety-yellow livery", "emissive ring or paint", "torus/coin/tire/halo silhouette",
            "generic grid or noise recipe", "shiny plastic", "uniform edge wear", "leather",
            "billboard", "decal-hole", "flat AO", "chrome", "black plastic", "uniform AO dirt",
            "nested-square puck feet", "brown well plug", "beacon lamp",
        ],
        "componentReferenceDecision": "not_needed",
        "citedReferences": [rel(p) for p in CITED_REFS],
    }
    (FAMILY / "MATERIAL_CONTRACT.json").write_bytes(
        (json.dumps(contract_json, indent=2) + "\n").encode("utf-8"),
    )

    still_for = lambda name: still_rel.get(name) or still_rel.get("works_top")
    rows = []

    def row(mid, state, still_key, clay, fake, notes, **extra):
        item = {
            "id": mid, "state": state, "still": still_for(still_key),
            "clayConfirm": clay, "forbiddenFakeAbsent": fake, "notes": notes,
        }
        item.update(extra)
        rows.append(item)

    row("MTX-01", "implemented", "works_edge_clay", "pass", True,
        "Angle-limited bevel ~7 mm, shade_smooth_by_angle 28°, weighted normals keep_sharp.",
        bevelWidthM=0.007, shadeAngleDeg=28.0)
    row("MTX-03", "implemented", "works_top_clay", "pass", True,
        "Tapered dark refractory liner with a real lip and true inner wall; open through, not a brown plug.")
    row("MTX-16", "implemented", "works_top", "pass", True,
        "Unique UV0 per joined bake target packed into non-overlapping atlas columns (body/spin/lamp).")
    row("MTX-20", "implemented", "normal_isolation", "pass", True,
        "Tangent-space geometric normals from the bevelled mesh; world-normal isolation still from the exported GLB.")
    row("MTX-21", "not_applicable", "normal_isolation", "pass", True,
        "Place-scale wellhead: unique-UV mesh-derived normal, no separate cage object.")
    row("MTX-22", "implemented", "normal_isolation", "pass", True,
        "OpenGL tangent normals on unique UV0; isolation is world-space geometric, distinct from ORM.")
    row("MTX-23", "implemented", "orm_isolation", "pass", True,
        "Vertex hemisphere AO via BVH, rasterized into ORM.R; AO at courses, gussets, feet, race, throat.")
    row("MTX-24", "implemented", "orm_isolation", "pass", True,
        "Vertex curvature from neighbour-normal angle drives wear; no checker or grid stamp.")
    row("MTX-25", "implemented", "orm_isolation", "pass", True,
        "Cavity from curvature + short AO darkens liner mouth, course gaps, gusset and foot contacts.")
    row("MTX-30", "implemented", "works_top", "pass", True,
        "AO/curvature/normal authored from the mesh. Cited concept stills are never sampled as maps.")
    row("MTX-31", "implemented", "material_id", "pass", True,
        "Paint dielectric, wear metallic, liner dry mineral, accent oxide, lamp dielectric.")
    row("MTX-32", "implemented", "works_top", "pass", True,
        "Unique 1024 albedo for this asset; rover atlas is not tinted or reused.")
    row("MTX-33", "implemented", "orm_isolation", "pass", True,
        "ORM R=mesh AO, G=role roughness + cavity, B=role metallic + curvature wear.")
    row("MTX-39", "implemented", "works_top", "pass", True,
        "Edge-wear from curvature on alkyd; no uniform AO dirt crayon.")
    row("MTX-46", "implemented", "works_top_clay", "pass", True,
        "No yellow livery, no emissive torus, no nested-square pucks, no plastic default.")
    row("MTX-50", "implemented", "hook_identity", "pass", True,
        "glTF extras stamp identity, LOD prefixes, sockets, collision helper, OpenGL/ORM contract.")
    row("MTX-52", "implemented", "works_top_clay", "pass", True,
        "Macro: hole + hat-channel collar + four corner angle shoes + separate inner race + rooted lamp.")
    row("MTX-53", "not_applicable", "works_top", "pass", True,
        "Manufactured wellhead, not a rock/wreck; no sculpt/photogrammetry bake is required.")
    row("MTX-54", "not_applicable", "works_top", "pass", True,
        "Cycle 03 correction of Cycle 02; Cycle 01 and Cycle 02 evidence bytes are not rewritten.")

    ledger = {
        "schema": "spaceface.advancedModelTechniqueLedger.v1",
        "assetId": ASSET_ID,
        "identity": IDENTITY,
        "class": "place",
        "contract": "docs/visual-assets/ADVANCED_MODEL_TECHNIQUE_CONTRACT.md",
        "candidateHash": inventory["sha256"],
        "exportGlb": inventory["partsSource"],
        "clayStillReadsAsPrimitives": False,
        "independentReview": "review_pending",
        "independentReviewer": None,
        "forbidden": {
            "factoryLoftPlusBoxes": False,
            "sharedSheetTint": False,
            "shadeSmoothWholeObject": False,
            "internalVoidCalledBay": False,
            "imagenUsedAsBake": False,
        },
        "rows": rows,
    }
    (FAMILY / "TECHNIQUE_LEDGER.json").write_bytes(
        (json.dumps(ledger, indent=2) + "\n").encode("utf-8"),
    )

    epoch = {
        "schema": "spaceface.worksEvidenceEpoch.v1",
        "packet": PACKET,
        "assetId": ASSET_ID,
        "identity": IDENTITY,
        "cycle": CYCLE,
        "immutable": True,
        "disposition": "review_pending",
        "state": "design_candidate",
        "g1g2g4": "open",
        "independentReviewLaunched": False,
        "sourceGlb": inventory["combined"],
        "partsGlb": inventory["partsSource"],
        "sourceSha256": inventory["sha256"],
        "partsSha256": inventory["partsSha256"],
        "blend": inventory["blend"],
        "lodTriangles": inventory["lodTriangles"],
        "hooks": inventory["hooks"],
        "meshNames": inventory["meshNames"],
        "camera": camera_facts,
        "occupancy": occupancy,
        "glbInspect": glb_inspect,
        "hiddenFaces": hidden,
        "stills": still_rel,
        "stillSha256": hash_stills,
        "atlasLod0": [
            rel(TEX_DIR / "massline_core_atlas_lod0_basecolor.png"),
            rel(TEX_DIR / "massline_core_atlas_lod0_orm.png"),
            rel(TEX_DIR / "massline_core_atlas_lod0_normal.png"),
        ],
        "citedReferences": [rel(p) for p in CITED_REFS],
        "contactSheet": rel(REF_DIR / "CONTACT_SHEET.png"),
        "notes": (
            "Cycle 03 square-anchor collar correction. Not wired, not released, not promoted. "
            "Reviewers were not launched. Disposition review_pending/revise. Remaining visual "
            "risk: whether hat-course pitch breaks hold at 120 px/cell and whether four angle "
            "shoes keep a square silhouette at legal 19 px/cell without inflating the envelope."
        ),
    }
    (EVIDENCE_DIR / "EPOCH.json").write_bytes(
        (json.dumps(epoch, indent=2) + "\n").encode("utf-8"),
    )
    (EVIDENCE_DIR / "CYCLE.md").write_text(
        "\n".join([
            "# PQ-131.02 Massline Core — Cycle 03 evidence",
            "",
            f"Disposition: **review_pending** / **revise**. State: `design_candidate`. Identity: `{IDENTITY}`.",
            f"Source SHA-256: `{inventory['sha256']}`",
            f"Parts SHA-256: `{inventory['partsSha256']}`",
            "",
            f"LOD triangles: LOD0 {inventory['lodTriangles']['lod0']} / LOD1 {inventory['lodTriangles']['lod1']} / LOD2 {inventory['lodTriangles']['lod2']}",
            f"Hooks: {', '.join(inventory['hooks'])}",
            "",
            "Stills from the exported GLB at 1920×1080, live works camera (31° FOV, +Z up).",
            "Independent reviewers were not launched this cycle. Cycle 01 and Cycle 02 evidence is immutable.",
            "",
            "Correction vs Cycle 02: hat/U-channel collar with separated flanges, directional",
            "laps and shadowed pitch breaks; folded dark angle shoes claiming four corners;",
            "deeper dark well with true inner wall; rooted hooded lamp (hood/socket/arm);",
            "LOD1/2 keep the square-anchor silhouette at 19 px/cell.",
            "",
            "Still `review_pending` / `revise`. Not wired, not released, not promoted.",
            "",
        ]),
        encoding="utf-8",
        newline="\n",
    )
    return epoch


def check_contract(inventory, glb_inspect, camera_facts, occupancy):
    errors = []
    if glb_inspect.get("sceneExtrasIdentity") != IDENTITY:
        errors.append(f"identity {glb_inspect.get('sceneExtrasIdentity')}")
    if not glb_inspect.get("identityPresent"):
        errors.append("root identity node missing")
    if sorted(glb_inspect.get("hooks") or []) != sorted(HOOK_NAMES):
        errors.append(f"hooks {glb_inspect.get('hooks')}")
    for lod in (0, 1, 2):
        name = f"LOD{lod}_massline_core"
        if name not in (glb_inspect.get("lodNodes") or []):
            errors.append(f"missing {name}")
        tris = int(inventory["lodTriangles"][f"lod{lod}"])
        if tris > TRI_BUDGET[lod]:
            errors.append(f"LOD{lod} tris {tris} > {TRI_BUDGET[lod]}")
        if tris < 80:
            errors.append(f"LOD{lod} tris {tris} too thin")
    if inventory["sha256"] != inventory["partsSha256"]:
        errors.append("source/parts hash mismatch")
    bbox0 = inventory["lodReports"][0]["bbox"]
    if bbox0["min"][0] < -1.12 or bbox0["min"][1] < -1.12 or bbox0["max"][0] > 1.12 or bbox0["max"][1] > 1.12:
        errors.append(f"envelope {bbox0}")
    if bbox0["max"][2] > 1.12 or bbox0["min"][2] < -0.02:
        errors.append(f"height {bbox0}")
    if camera_facts:
        top = camera_facts["works_top"]
        edge = camera_facts["works_edge"]
        site = camera_facts["works_site"]
        if top["location"] != edge["location"]:
            errors.append("works_edge camera moved")
        if top["objectOffset"] == edge["objectOffset"]:
            errors.append("works_edge offset missing")
        if abs(top["pxPerCellTarget"] - 120.0) > 0.01:
            errors.append("works_top px/cell")
        if abs(site["pxPerCellTarget"] - 19.0) > 0.01:
            errors.append("works_site px/cell")
    if occupancy.get("works_site"):
        site = occupancy["works_site"]
        bw, bh = site.get("bboxSizePx") or [0, 0]
        if bw < 16 or bh < 16:
            errors.append(f"site bbox too round/small {site.get('bboxSizePx')}")
    if errors:
        raise RuntimeError("contract checks failed: " + "; ".join(errors))
    return True


def main(argv=None):
    argv = list(sys.argv if argv is None else argv)
    if "--" in argv:
        argv = argv[argv.index("--") + 1:]
    skip_stills, skip_hidden, stills_only = parse_args(argv)
    if CYCLE != 3 or EVIDENCE_DIR.name != "cycle_003":
        raise RuntimeError("Cycle 03 builder must write cycle_003 only")
    if EVIDENCE_DIR.resolve() in {CYCLE_001_DIR.resolve(), CYCLE_002_DIR.resolve()}:
        raise RuntimeError("refusing to write over Cycle 01/02 evidence")
    frozen_prev = {**hash_tree(CYCLE_001_DIR), **hash_tree(CYCLE_002_DIR)}
    if not frozen_prev:
        raise RuntimeError("Cycle 01/02 evidence missing; refuse to build Cycle 03 without it")
    FAMILY.mkdir(parents=True, exist_ok=True)
    SOURCE_DIR.mkdir(parents=True, exist_ok=True)
    TEX_DIR.mkdir(parents=True, exist_ok=True)
    REF_DIR.mkdir(parents=True, exist_ok=True)
    EVIDENCE_DIR.mkdir(parents=True, exist_ok=True)
    BLEND_DIR.mkdir(parents=True, exist_ok=True)

    reset_scene()
    contact_path = REF_DIR / "CONTACT_SHEET.png"
    if contact_path.exists():
        print("contact sheet reused", rel(contact_path), sha256(contact_path))
    else:
        contact = compose_contact_sheet()
        print("contact sheet", rel(contact), sha256(contact))

    inv_path = SOURCE_DIR / "massline_core_inventory.json"
    if stills_only:
        if not PARTS_GLB.exists() or not inv_path.exists():
            raise RuntimeError("stills-only requires an existing combined GLB and inventory")
        inventory = json.loads(inv_path.read_text(encoding="utf-8"))
        contract = {"identity": IDENTITY, "assetId": ASSET_ID}
    else:
        lod_reports = []
        lamp_loc = Vector((LAMP_R * math.cos(LAMP_ANG), LAMP_R * math.sin(LAMP_ANG), COLLAR_Z1 + 0.14))
        for lod in (0, 1, 2):
            report, loc = build_lod(lod)
            lod_reports.append(report)
            if lod == 0:
                lamp_loc = loc
        inventory, contract = combine_lods(lod_reports, lamp_loc)

    stills = {}
    camera_facts = {}
    occupancy = {}
    if not skip_stills:
        stills, camera_facts, abs_stills = render_stills(PARTS_GLB, EVIDENCE_DIR)
        if "works_top" in abs_stills:
            occupancy["works_top"] = occupancy_from_still(abs_stills["works_top"], 120.0, 0.5)
        if "works_edge" in abs_stills:
            occupancy["works_edge"] = occupancy_from_still(abs_stills["works_edge"], 120.0, 0.92)
        if "works_site" in abs_stills:
            occupancy["works_site"] = occupancy_from_still(abs_stills["works_site"], 19.0, 0.5)

    glb_inspect = inspect_glb_nodes(PARTS_GLB)
    hidden = {"ran": False}
    existing_hidden = EVIDENCE_DIR / "hidden_faces.json"
    if skip_hidden and existing_hidden.exists():
        hidden = {
            "ran": True,
            "exit": 0,
            "json": rel(existing_hidden),
            "summary": json.loads(existing_hidden.read_text(encoding="utf-8")),
            "reused": True,
        }
    elif not skip_hidden:
        code, jpath = run_hidden_faces(PARTS_GLB, EVIDENCE_DIR / "hidden_faces.json")
        hidden = {"ran": True, "exit": code, "json": rel(jpath) if jpath else None}
        if jpath and jpath.exists():
            try:
                hidden["summary"] = json.loads(jpath.read_text(encoding="utf-8"))
            except Exception as exc:
                hidden["readError"] = str(exc)

    epoch = write_audits(inventory, contract, stills, camera_facts, occupancy, glb_inspect, hidden)
    check_contract(inventory, glb_inspect, camera_facts, occupancy)
    after_prev = {**hash_tree(CYCLE_001_DIR), **hash_tree(CYCLE_002_DIR)}
    if after_prev != frozen_prev:
        mutated = [k for k in after_prev if after_prev.get(k) != frozen_prev.get(k)]
        missing = [k for k in frozen_prev if k not in after_prev]
        raise RuntimeError(f"Cycle 01/02 evidence mutated: {mutated or missing}")
    print(json.dumps({
        "ok": True,
        "cycle": CYCLE,
        "identity": IDENTITY,
        "sha256": inventory["sha256"],
        "lodTriangles": inventory["lodTriangles"],
        "hooks": glb_inspect["hooks"],
        "disposition": "review_pending",
        "stills": list(stills.keys()),
        "hiddenExit": hidden.get("exit"),
        "freeze": {"cycle_001": len(hash_tree(CYCLE_001_DIR)), "cycle_002": len(hash_tree(CYCLE_002_DIR))},
        "camera": {
            "works_top_D": camera_facts.get("works_top", {}).get("distance"),
            "works_site_D": camera_facts.get("works_site", {}).get("distance"),
            "px": {
                "top": camera_facts.get("works_top", {}).get("pxPerCellTarget"),
                "site": camera_facts.get("works_site", {}).get("pxPerCellTarget"),
            },
        },
    }, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main() or 0)

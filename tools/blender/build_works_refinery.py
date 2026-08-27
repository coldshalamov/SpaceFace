"""PQ-131.04 Works refinery — Cycle 01 source-candidate builder.

One-cell process train: insulated furnace with a recessed refractory slit,
service burner/manifold, rooted flue/stack with cap and baffles, pipe run
into a saddle tank, one hooded lamp.

    blender --background --python tools/blender/build_works_refinery.py

Exact write set: this file, assets/works/refinery/**, and
assets/ships/parts/works/place_works_refinery.glb.
"""
from __future__ import annotations

import hashlib
import json
import math
import shutil
import struct
import sys
import time
from pathlib import Path

import bpy
import numpy as np
from mathutils import Vector

TOOLS = Path(__file__).resolve().parent
ROOT = TOOLS.parents[1]
if str(TOOLS) not in sys.path:
    sys.path.insert(0, str(TOOLS))

from spaceface_works_camera import (  # noqa: E402
    CELL_WU,
    FOV_V_DEG,
    apply_works_camera,
    measured_px_per_cell,
    works_pose,
)

FAMILY = ROOT / "assets" / "works" / "refinery"
SOURCE_DIR = FAMILY / "source"
TEX_DIR = SOURCE_DIR / "textures"
REF_DIR = FAMILY / "reference"
EVID_DIR = FAMILY / "evidence" / "cycle_001"
PARTS_DIR = ROOT / "assets" / "ships" / "parts" / "works"
COMBINED_NAME = "place_works_refinery.glb"
ASSET_ID = "place_works_refinery"
ROOT_NAME = "SF_WORKS_REFINERY_V1"
HOOK_NAMES = ("furnace_slit", "stack_vent", "lamp")
CYCLE = 1
TEX = 1024
SHADE_ANGLE = 28.0
BEVEL_LOW = {0: 0.012, 1: 0.0, 2: 0.0}
BEVEL_HIGH = {0: 0.004, 1: 0.0, 2: 0.0}
TRI_BUDGET = {0: 8000, 1: 2000, 2: 600}
KEEP_PNG = {b"IHDR", b"PLTE", b"IDAT", b"IEND", b"sRGB", b"gAMA", b"pHYs"}
_GLTF_FLOAT = 5126
_GLTF_NCOMP = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4, "MAT4": 16}

# Plan layout (wu). Origin at cell centre, +Z up, feet on z=0.
FX, FY = -0.20, 0.04
FHX, FHY = 0.54, 0.38
F_Z0, F_CROWN = 0.08, 0.70
WELL_FLOOR = 0.40
SLIT_HX, SLIT_HY = 0.22, 0.065
SX, SY = 0.12, 0.70
STACK_R = 0.15
STACK_TOP = 1.12
TX, TY = 0.68, -0.20
TANK_R, TANK_HALF = 0.16, 0.34
PIPE_R = 0.028

ROLES = (
    "structure",
    "refractory",
    "hotmetal",
    "stack",
    "tank",
    "pipe",
    "lampmetal",
)
ROLE_ID_RGB = {
    "structure": (0.18, 0.19, 0.20),
    "refractory": (0.62, 0.42, 0.24),
    "hotmetal": (0.52, 0.38, 0.22),
    "stack": (0.38, 0.16, 0.08),
    "tank": (0.30, 0.14, 0.10),
    "pipe": (0.46, 0.42, 0.36),
    "lampmetal": (0.22, 0.22, 0.24),
    "slit": (0.95, 0.55, 0.18),
    "lamp": (0.95, 0.88, 0.62),
}
# Authored albedo bases (sRGB-ish display linear-ish for PNG write).
ROLE_ALBEDO = {
    "structure": (0.145, 0.150, 0.148),
    "refractory": (0.46, 0.33, 0.21),
    "hotmetal": (0.42, 0.30, 0.18),
    "stack": (0.24, 0.11, 0.07),
    "tank": (0.28, 0.13, 0.09),
    "pipe": (0.38, 0.34, 0.28),
    "lampmetal": (0.16, 0.16, 0.17),
    "slit": (0.22, 0.10, 0.05),
    "lamp": (0.82, 0.72, 0.48),
}
ROLE_ROUGH = {
    "structure": 0.58, "refractory": 0.78, "hotmetal": 0.38,
    "stack": 0.62, "tank": 0.52, "pipe": 0.42, "lampmetal": 0.48,
    "slit": 0.55, "lamp": 0.18,
}
ROLE_METAL = {
    "structure": 0.04, "refractory": 0.00, "hotmetal": 0.82,
    "stack": 0.70, "tank": 0.06, "pipe": 0.78, "lampmetal": 0.55,
    "slit": 0.00, "lamp": 0.02,
}
REF_IMAGES = (
    ROOT / "assets" / "concept" / "archetypes" / "concept_station_refinery.jpg",
    ROOT / "assets" / "concept" / "archetypes" / "concept_station_mining.jpg",
    ROOT / "assets" / "concept" / "landmarks" / "concept_landmark_driller.jpg",
)


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1 << 20), b""):
            digest.update(chunk)
    return digest.hexdigest().upper()


def argv_after():
    if "--" in sys.argv:
        return sys.argv[sys.argv.index("--") + 1 :]
    return []


def object_mode():
    try:
        if bpy.context.object and bpy.context.object.mode != "OBJECT":
            bpy.ops.object.mode_set(mode="OBJECT")
    except Exception:
        pass


def reset_scene():
    object_mode()
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for bucket in (
        bpy.data.meshes, bpy.data.curves, bpy.data.materials,
        bpy.data.cameras, bpy.data.lights, bpy.data.images, bpy.data.collections,
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
    tmp.write_bytes(bytes(out))
    tmp.replace(path)


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
    tmp.write_bytes(bytes(data))
    tmp.replace(path)


def apply_modifiers(obj):
    if obj is None or obj.type != "MESH":
        return obj
    object_mode()
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    names = [mod.name for mod in obj.modifiers]
    for name in names:
        try:
            bpy.ops.object.modifier_apply(modifier=name)
        except Exception:
            remaining = obj.modifiers.get(name)
            if remaining is not None:
                obj.modifiers.remove(remaining)
    obj.select_set(False)
    return obj


def count_tris(obj):
    if obj is None or obj.type != "MESH" or not obj.data:
        return 0
    return sum(max(0, len(p.vertices) - 2) for p in obj.data.polygons)


def link_new(obj, collection):
    for current in list(obj.users_collection):
        current.objects.unlink(obj)
    collection.objects.link(obj)
    return obj


def add_mesh(name, verts, faces, material, collection, bevel=0.0, role=None):
    mesh = bpy.data.meshes.new(f"{name}_Mesh")
    mesh.from_pydata([tuple(v) for v in verts], [], [tuple(f) for f in faces])
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)
    if material is not None:
        obj.data.materials.clear()
        obj.data.materials.append(material)
    if role:
        obj["spacefaceRole"] = role
        if material is not None:
            material["spacefaceRole"] = role
    if bevel > 0:
        mod = obj.modifiers.new("ProductionBevel", "BEVEL")
        mod.width = bevel
        mod.segments = 2 if bevel >= 0.008 else 1
        mod.limit_method = "ANGLE"
        mod.angle_limit = math.radians(40)
    return obj


def loft_rings(name, rings, material, collection, bevel=0.0, cap=True, role=None):
    sides = len(rings[0])
    verts = [vert for ring in rings for vert in ring]
    faces = []
    if cap:
        faces.append(tuple(range(sides - 1, -1, -1)))
        last = (len(rings) - 1) * sides
        faces.append(tuple(range(last, last + sides)))
    for station in range(len(rings) - 1):
        a = station * sides
        b = (station + 1) * sides
        for i in range(sides):
            j = (i + 1) % sides
            faces.append((a + i, a + j, b + j, b + i))
    return add_mesh(name, verts, faces, material, collection, bevel, role)


def loft_shell(name, outer, inner, material, collection, bevel=0.0, role=None):
    """Closed wall between outer rings and inner rings (same count, same sides)."""
    if len(outer) != len(inner) or len(outer[0]) != len(inner[0]):
        raise RuntimeError(f"shell ring mismatch for {name}")
    n_st = len(outer)
    sides = len(outer[0])
    verts = [v for ring in outer for v in ring] + [v for ring in inner for v in ring]
    inner0 = n_st * sides
    faces = []
    for station in range(n_st - 1):
        a = station * sides
        b = (station + 1) * sides
        ia = inner0 + a
        ib = inner0 + b
        for i in range(sides):
            j = (i + 1) % sides
            faces.append((a + i, a + j, b + j, b + i))
            faces.append((ia + i, ib + i, ib + j, ia + j))
    # bottom annulus
    for i in range(sides):
        j = (i + 1) % sides
        faces.append((i, inner0 + i, inner0 + j, j))
    # top annulus
    a = (n_st - 1) * sides
    ia = inner0 + a
    for i in range(sides):
        j = (i + 1) % sides
        faces.append((a + i, a + j, ia + j, ia + i))
    return add_mesh(name, verts, faces, material, collection, bevel, role)


def rounded_rect(cx, cy, hx, hy, corner, z, n_arc):
    corner = min(corner, hx * 0.95, hy * 0.95)
    pts = []
    corners = (
        (cx + hx - corner, cy + hy - corner, 0.0, 0.5 * math.pi),
        (cx - hx + corner, cy + hy - corner, 0.5 * math.pi, math.pi),
        (cx - hx + corner, cy - hy + corner, math.pi, 1.5 * math.pi),
        (cx + hx - corner, cy - hy + corner, 1.5 * math.pi, 2.0 * math.pi),
    )
    for ox, oy, a0, a1 in corners:
        for i in range(max(1, n_arc)):
            t = i / float(max(1, n_arc))
            ang = a0 + (a1 - a0) * t
            pts.append((ox + math.cos(ang) * corner, oy + math.sin(ang) * corner, z))
    return pts


def circle_ring(cx, cy, radius, z, n, twist=0.0):
    return [
        (
            cx + math.cos(twist + i * 2.0 * math.pi / n) * radius,
            cy + math.sin(twist + i * 2.0 * math.pi / n) * radius,
            z,
        )
        for i in range(n)
    ]


def circle_in_plane(center, tangent, radius, n, up=Vector((0, 0, 1))):
    t = Vector(tangent)
    if t.length < 1e-8:
        t = Vector((1, 0, 0))
    t.normalize()
    binormal = t.cross(Vector(up))
    if binormal.length < 1e-6:
        binormal = t.cross(Vector((0, 1, 0)))
    if binormal.length < 1e-6:
        binormal = t.cross(Vector((1, 0, 0)))
    binormal.normalize()
    normal = binormal.cross(t).normalized()
    c = Vector(center)
    return [
        tuple(c + (math.cos(i * 2.0 * math.pi / n) * radius) * binormal
              + (math.sin(i * 2.0 * math.pi / n) * radius) * normal)
        for i in range(n)
    ]


def rect_in_plane(center, tangent, hx, hy, up=Vector((0, 0, 1))):
    t = Vector(tangent)
    if t.length < 1e-8:
        t = Vector((1, 0, 0))
    t.normalize()
    binormal = t.cross(Vector(up))
    if binormal.length < 1e-6:
        binormal = t.cross(Vector((0, 1, 0)))
    binormal.normalize()
    normal = binormal.cross(t).normalized()
    c = Vector(center)
    corners = ((hx, hy), (-hx, hy), (-hx, -hy), (hx, -hy))
    return [tuple(c + x * binormal + y * normal) for x, y in corners]


def chamfer_path(points, cut):
    if len(points) < 3:
        return [Vector(p) for p in points]
    pts = [Vector(p) for p in points]
    out = [pts[0]]
    for i in range(1, len(pts) - 1):
        prev, cur, nxt = pts[i - 1], pts[i], pts[i + 1]
        a = (cur - prev)
        b = (nxt - cur)
        la, lb = a.length, b.length
        if la < 1e-6 or lb < 1e-6:
            out.append(cur)
            continue
        d = min(cut, 0.42 * la, 0.42 * lb)
        out.append(cur - a.normalized() * d)
        out.append(cur + b.normalized() * d)
    out.append(pts[-1])
    return out


def pipe_along(name, points, radius, n, material, collection, bevel, role):
    path = chamfer_path(points, max(radius * 2.2, 0.04))
    rings = []
    for i, p in enumerate(path):
        if i == 0:
            tang = path[1] - path[0]
        elif i == len(path) - 1:
            tang = path[-1] - path[-2]
        else:
            tang = path[i + 1] - path[i - 1]
        rings.append(circle_in_plane(p, tang, radius, n))
    return loft_rings(name, rings, material, collection, bevel, True, role)


def flange_at(name, center, tangent, radius, thick, material, collection, bevel, role, n=10):
    c = Vector(center)
    t = Vector(tangent).normalized()
    rings = [
        circle_in_plane(c - t * thick * 0.5, t, radius, n),
        circle_in_plane(c + t * thick * 0.5, t, radius, n),
    ]
    return loft_rings(name, rings, material, collection, bevel, True, role)


def hex_bolt(name, loc, axis, radius, depth, material, collection, role):
    c = Vector(loc)
    t = Vector(axis).normalized()
    rings = [
        circle_in_plane(c - t * depth * 0.5, t, radius, 6),
        circle_in_plane(c + t * depth * 0.5, t, radius * 0.72, 6),
    ]
    return loft_rings(name, rings, material, collection, 0.0, True, role)


def principled(material):
    material.use_nodes = True
    material.node_tree.nodes.clear()
    output = material.node_tree.nodes.new("ShaderNodeOutputMaterial")
    bsdf = material.node_tree.nodes.new("ShaderNodeBsdfPrincipled")
    material.node_tree.links.new(bsdf.outputs["BSDF"], output.inputs["Surface"])
    return bsdf


def make_role_materials(lod):
    mats = {}
    for role, rgb in ROLE_ID_RGB.items():
        mat = bpy.data.materials.new(f"Material_{role}_LOD{lod}")
        mat.name = f"Material_{role}_LOD{lod}"
        bsdf = principled(mat)
        albedo = ROLE_ALBEDO.get(role, rgb)
        bsdf.inputs["Base Color"].default_value = (*albedo, 1.0)
        bsdf.inputs["Roughness"].default_value = ROLE_ROUGH.get(role, 0.5)
        bsdf.inputs["Metallic"].default_value = ROLE_METAL.get(role, 0.0)
        if role in {"slit", "lamp"}:
            # Beauty stills keep the slit inactive so the cavity reads as a hole.
            strength = 0.0 if role == "slit" else 0.22
            if "Emission Color" in bsdf.inputs:
                bsdf.inputs["Emission Color"].default_value = (*ROLE_ALBEDO[role], 1.0)
            if "Emission Strength" in bsdf.inputs:
                bsdf.inputs["Emission Strength"].default_value = strength
        mat["spacefaceRole"] = role
        mats[role] = mat
    return mats


def make_atlas_material(lod, maps, emit_strength=0.0):
    mat = bpy.data.materials.new(f"Material_Refinery_LOD{lod}")
    mat.name = f"Material_Refinery_LOD{lod}"
    bsdf = principled(mat)
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    uv0 = nodes.new("ShaderNodeUVMap")
    uv0.uv_map = "UVMap"
    tex_a = nodes.new("ShaderNodeTexImage")
    tex_a.image = maps["basecolor"]
    tex_o = nodes.new("ShaderNodeTexImage")
    tex_o.image = maps["orm"]
    tex_n = nodes.new("ShaderNodeTexImage")
    tex_n.image = maps["normal"]
    for tex in (tex_a, tex_o, tex_n):
        links.new(uv0.outputs["UV"], tex.inputs["Vector"])
    sep = nodes.new("ShaderNodeSeparateColor")
    links.new(tex_o.outputs["Color"], sep.inputs["Color"])
    links.new(tex_a.outputs["Color"], bsdf.inputs["Base Color"])
    links.new(sep.outputs["Green"], bsdf.inputs["Roughness"])
    links.new(sep.outputs["Blue"], bsdf.inputs["Metallic"])
    if "Ambient Occlusion" in bsdf.inputs:
        links.new(sep.outputs["Red"], bsdf.inputs["Ambient Occlusion"])
    nmap = nodes.new("ShaderNodeNormalMap")
    nmap.space = "TANGENT"
    nmap.inputs["Strength"].default_value = 1.05
    links.new(tex_n.outputs["Color"], nmap.inputs["Color"])
    links.new(nmap.outputs["Normal"], bsdf.inputs["Normal"])
    if "Coat Weight" in bsdf.inputs:
        bsdf.inputs["Coat Weight"].default_value = 0.08
        bsdf.inputs["Coat Roughness"].default_value = 0.22
    if emit_strength and "Emission Strength" in bsdf.inputs:
        bsdf.inputs["Emission Strength"].default_value = emit_strength
    mat["spacefaceRole"] = "atlas"
    return mat


def write_pixels(name, pixels, size, colorspace="sRGB"):
    if name in bpy.data.images:
        bpy.data.images.remove(bpy.data.images[name])
    img = bpy.data.images.new(name, width=size, height=size, alpha=True)
    img.colorspace_settings.name = colorspace
    img.pixels.foreach_set(np.ascontiguousarray(pixels, dtype=np.float32).ravel())
    TEX_DIR.mkdir(parents=True, exist_ok=True)
    path = TEX_DIR / f"{name}.png"
    img.filepath_raw = str(path)
    img.file_format = "PNG"
    img.save()
    sanitize_png(path)
    img.pack()
    img.filepath_raw = str(path)
    return img, path


def image_np(img):
    w, h = img.size
    arr = np.zeros(w * h * 4, dtype=np.float32)
    img.pixels.foreach_get(arr)
    return arr.reshape(h, w, 4)


def h01(x, y, s=0):
    x = np.asarray(x, dtype=np.uint32)
    y = np.asarray(y, dtype=np.uint32)
    v = x * np.uint32(374761393) + y * np.uint32(668265263) + np.uint32(int(s) * 362437)
    v = (v ^ (v >> np.uint32(13))) * np.uint32(1274126177)
    v = v ^ (v >> np.uint32(16))
    return (v & np.uint32(255)).astype(np.float32) / np.float32(255.0)


def finish_low(obj, angle=SHADE_ANGLE):
    object_mode()
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    try:
        bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    except Exception:
        pass
    apply_modifiers(obj)
    try:
        bpy.ops.object.mode_set(mode="EDIT")
        bpy.ops.mesh.select_all(action="SELECT")
        try:
            bpy.ops.mesh.remove_doubles(threshold=0.0005)
        except TypeError:
            bpy.ops.mesh.merge_by_distance(distance=0.0005)
        bpy.ops.mesh.normals_make_consistent(inside=False)
        bpy.ops.object.mode_set(mode="OBJECT")
    except Exception:
        object_mode()
    try:
        bpy.ops.object.shade_smooth_by_angle(angle=math.radians(angle))
    except Exception:
        for poly in obj.data.polygons:
            poly.use_smooth = True
    wn = obj.modifiers.new("WeightedNormal", "WEIGHTED_NORMAL")
    wn.keep_sharp = True
    apply_modifiers(obj)
    obj.select_set(False)
    return obj


def unique_uv(obj, margin=0.010):
    object_mode()
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(angle_limit=66.0, island_margin=margin, scale_to_bounds=False)
    try:
        bpy.ops.uv.average_islands_scale()
    except Exception:
        pass
    try:
        bpy.ops.uv.pack_islands(margin=margin)
    except TypeError:
        try:
            bpy.ops.uv.pack_islands(rotate=True, margin=margin)
        except Exception:
            pass
    bpy.ops.object.mode_set(mode="OBJECT")
    obj.select_set(False)
    return uv_overlap_count(obj)


def uv_overlap_count(obj):
    if obj.type != "MESH" or not obj.data.uv_layers.active:
        return 0
    object_mode()
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.uv.select_all(action="DESELECT")
    overlapped = 0
    try:
        bpy.ops.uv.select_overlap()
        mesh = obj.data
        uv = mesh.uv_layers.active
        # Switching to object to read selection is version-sensitive; count via bmesh.
        import bmesh
        bm = bmesh.from_edit_mesh(mesh)
        uv_layer = bm.loops.layers.uv.active
        if uv_layer is not None:
            for face in bm.faces:
                for loop in face.loops:
                    if loop[uv_layer].select:
                        overlapped += 1
        bm.free()
    except Exception:
        overlapped = 0
    bpy.ops.object.mode_set(mode="OBJECT")
    obj.select_set(False)
    return int(overlapped)


def triangulate(obj):
    object_mode()
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    tri = obj.modifiers.new("ExportTriangulate", "TRIANGULATE")
    tri.quad_method = "FIXED"
    apply_modifiers(obj)
    obj.select_set(False)
    return obj


def join_objects(objects, name):
    objects = [obj for obj in objects if obj is not None and obj.type == "MESH" and obj.data]
    objects = sorted(objects, key=lambda o: o.name)
    if not objects:
        return None
    object_mode()
    bpy.ops.object.select_all(action="DESELECT")
    for obj in objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    if len(objects) > 1:
        bpy.ops.object.join()
    objects[0].name = name
    if objects[0].data:
        objects[0].data.name = name
    objects[0].select_set(False)
    return objects[0]


def duplicate_obj(obj, name, collection):
    dup = obj.copy()
    dup.data = obj.data.copy()
    dup.name = name
    collection.objects.link(dup)
    return dup


def inflate_mesh(obj, amount):
    mesh = obj.data
    try:
        mesh.calc_normals_split()
    except Exception:
        pass
    mesh.update()
    for vert in mesh.vertices:
        normal = Vector(vert.normal)
        if normal.length < 1e-8:
            normal = Vector((0.0, 0.0, 1.0))
        vert.co = vert.co + normal.normalized() * float(amount)
    mesh.update()
    return obj


def parent_keep(obj, parent):
    mw = obj.matrix_world.copy()
    obj.parent = parent
    obj.matrix_parent_inverse = parent.matrix_world.inverted()
    obj.matrix_world = mw


def add_empty(name, loc, collection, parent=None, size=0.08):
    obj = bpy.data.objects.new(name, None)
    collection.objects.link(obj)
    obj.empty_display_type = "PLAIN_AXES"
    obj.empty_display_size = size
    obj.location = loc
    obj["socket"] = True
    obj["spacefaceSocket"] = True
    obj["spaceface"] = {"socket": True, "role": "works_hook"}
    if parent:
        parent_keep(obj, parent)
    return obj


# ---------------------------------------------------------------------------
# Geometry
# ---------------------------------------------------------------------------

def lod_res(lod):
    if lod == 0:
        return dict(n_arc=3, n_circ=10, n_pipe=7, straps=True, bolts=True, baffles=True, door=True, gussets=2)
    if lod == 1:
        return dict(n_arc=2, n_circ=8, n_pipe=6, straps=True, bolts=False, baffles=True, door=True, gussets=0)
    return dict(n_arc=2, n_circ=6, n_pipe=5, straps=False, bolts=False, baffles=False, door=False, gussets=0)


def build_furnace(lod, mats, collection, bevel):
    res = lod_res(lod)
    n_arc = res["n_arc"]
    body_parts = []
    # Insulated jacket below the well floor (formed courses, not a cube).
    if lod == 0:
        lower_stations = (
            (F_Z0, FHX * 1.08, FHY * 1.10, 0.18),
            (0.18, FHX * 1.00, FHY * 0.98, 0.20),
            (0.30, FHX * 1.04, FHY * 1.02, 0.22),
            (WELL_FLOOR, FHX * 1.02, FHY * 1.00, 0.22),
        )
    else:
        lower_stations = (
            (F_Z0, FHX * 1.06, FHY * 1.08, 0.18),
            (WELL_FLOOR, FHX * 1.00, FHY * 0.98, 0.20),
        )
    lower_rings = [
        rounded_rect(FX, FY, hx, hy, cr, z, n_arc) for z, hx, hy, cr in lower_stations
    ]
    body = loft_rings("Furnace_Lower", lower_rings, mats["structure"], collection, bevel, True, "structure")
    body_parts.append(body)

    # Jacket walls around the well: outer formed casing / inner refractory opening.
    wall_z = (WELL_FLOOR, 0.52, 0.62, F_CROWN) if lod == 0 else (WELL_FLOOR, F_CROWN)
    outer = []
    inner = []
    for i, z in enumerate(wall_z):
        t = i / max(1, len(wall_z) - 1)
        # Crown insets so the plan shows a formed shoulder, not a cube lid.
        hx, hy = FHX * (1.02 - 0.22 * t), FHY * (1.00 - 0.18 * t)
        cr = 0.20 + 0.06 * t
        outer.append(rounded_rect(FX, FY, hx, hy, cr, z, n_arc))
        inner.append(rounded_rect(FX, FY, SLIT_HX, SLIT_HY, 0.05, z, n_arc))
    jacket = loft_shell("Furnace_Jacket", outer, inner, mats["structure"], collection, bevel, "structure")
    body_parts.append(jacket)

    # Steel lip proud of the crown.
    if lod < 2:
        lip_outer = rounded_rect(FX, FY, SLIT_HX + 0.055, SLIT_HY + 0.045, 0.045, F_CROWN + 0.018, n_arc)
        lip_inner = rounded_rect(FX, FY, SLIT_HX * 0.98, SLIT_HY * 0.98, 0.038, F_CROWN + 0.018, n_arc)
        lip_outer_b = rounded_rect(FX, FY, SLIT_HX + 0.055, SLIT_HY + 0.045, 0.045, F_CROWN - 0.004, n_arc)
        lip_inner_b = rounded_rect(FX, FY, SLIT_HX * 0.98, SLIT_HY * 0.98, 0.038, F_CROWN - 0.004, n_arc)
        lip = loft_shell("Furnace_Lip", [lip_outer_b, lip_outer], [lip_inner_b, lip_inner],
                         mats["hotmetal"], collection, bevel * 0.6, "hotmetal")
        body_parts.append(lip)

    # Refractory well walls — physically recessed, non-emissive.
    well_outer = []
    well_inner = []
    well_stations = (
        ((WELL_FLOOR + 0.004, 1.00), (0.55, 0.98), (F_CROWN - 0.01, 0.96))
        if lod == 0 else
        ((WELL_FLOOR + 0.004, 1.00), (F_CROWN - 0.01, 0.96))
        if lod == 1 else
        ()
    )
    for z, scale in well_stations:
        well_outer.append(rounded_rect(FX, FY, SLIT_HX * 0.98, SLIT_HY * 0.98, 0.036, z, n_arc))
        well_inner.append(rounded_rect(FX, FY, SLIT_HX * scale * 0.78, SLIT_HY * scale * 0.70, 0.028, z, n_arc))
    if well_outer:
        well = loft_shell("Furnace_Well", well_outer, well_inner, mats["refractory"], collection, bevel * 0.5, "refractory")
        body_parts.append(well)

    # Ember lens — the only furnace emissive, at the well floor.
    ember_rings = [
        rounded_rect(FX, FY, SLIT_HX * 0.72, SLIT_HY * 0.62, 0.026, WELL_FLOOR + 0.012, n_arc),
        rounded_rect(FX, FY, SLIT_HX * 0.64, SLIT_HY * 0.52, 0.022, WELL_FLOOR + 0.028, n_arc),
    ]
    ember = loft_rings("Furnace_SlitLens", ember_rings, mats["slit"], collection, 0.0, True, "slit")

    # Insulation straps (proud courses).
    if res["straps"]:
        strap_zs = (0.24, 0.50) if lod == 0 else (0.36,)
        for i, z in enumerate(strap_zs):
            hx, hy, cr = FHX * (1.015 if i == 0 else 0.99), FHY * (1.02 if i == 0 else 0.98), 0.12
            strap = loft_shell(
                f"Furnace_Strap_{i}",
                [rounded_rect(FX, FY, hx + 0.012, hy + 0.012, cr, z - 0.018, n_arc),
                 rounded_rect(FX, FY, hx + 0.012, hy + 0.012, cr, z + 0.018, n_arc)],
                [rounded_rect(FX, FY, hx - 0.004, hy - 0.004, cr * 0.95, z - 0.018, n_arc),
                 rounded_rect(FX, FY, hx - 0.004, hy - 0.004, cr * 0.95, z + 0.018, n_arc)],
                mats["structure"], collection, bevel * 0.4, "structure",
            )
            body_parts.append(strap)
            clamp = add_mesh(
                f"Furnace_Clamp_{i}",
                [
                    (FX + hx + 0.010, FY - 0.05, z - 0.028),
                    (FX + hx + 0.032, FY - 0.05, z - 0.028),
                    (FX + hx + 0.032, FY + 0.05, z - 0.028),
                    (FX + hx + 0.010, FY + 0.05, z - 0.028),
                    (FX + hx + 0.010, FY - 0.05, z + 0.028),
                    (FX + hx + 0.032, FY - 0.05, z + 0.028),
                    (FX + hx + 0.032, FY + 0.05, z + 0.028),
                    (FX + hx + 0.010, FY + 0.05, z + 0.028),
                ],
                [(0, 1, 2, 3), (4, 7, 6, 5), (0, 4, 5, 1), (1, 5, 6, 2), (2, 6, 7, 3), (3, 7, 4, 0)],
                mats["hotmetal"], collection, bevel * 0.3, "hotmetal",
            )
            body_parts.append(clamp)

    # Structural feet with gussets.
    foot_pts = (
        (FX - FHX * 0.78, FY - FHY * 0.78),
        (FX + FHX * 0.78, FY - FHY * 0.78),
        (FX - FHX * 0.78, FY + FHY * 0.72),
        (FX + FHX * 0.55, FY + FHY * 0.72),
    )
    for i, (px, py) in enumerate(foot_pts):
        if lod == 0:
            rings = [
                rounded_rect(px, py, 0.055, 0.045, 0.008, 0.0, max(1, n_arc - 1)),
                rounded_rect(px, py, 0.038, 0.032, 0.006, 0.055, max(1, n_arc - 1)),
                rounded_rect(px, py, 0.028, 0.024, 0.005, F_Z0 + 0.01, max(1, n_arc - 1)),
            ]
        else:
            rings = [
                rounded_rect(px, py, 0.050, 0.040, 0.006, 0.0, max(1, n_arc - 1)),
                rounded_rect(px, py, 0.028, 0.024, 0.005, F_Z0 + 0.01, max(1, n_arc - 1)),
            ]
        body_parts.append(loft_rings(f"Furnace_Foot_{i}", rings, mats["structure"], collection, bevel * 0.5, True, "structure"))
        if i < res.get("gussets", 0):
            gusset = add_mesh(
                f"Furnace_Gusset_{i}",
                [
                    (px, py + 0.01, 0.04),
                    (px + math.copysign(0.09, FX - px + 0.001), py + 0.01, 0.04),
                    (px + math.copysign(0.09, FX - px + 0.001), py + 0.01, 0.14),
                    (px, py + 0.01, 0.18),
                    (px, py - 0.01, 0.04),
                    (px + math.copysign(0.09, FX - px + 0.001), py - 0.01, 0.04),
                    (px + math.copysign(0.09, FX - px + 0.001), py - 0.01, 0.14),
                    (px, py - 0.01, 0.18),
                ],
                [(0, 1, 2, 3), (4, 7, 6, 5), (0, 4, 5, 1), (1, 5, 6, 2), (2, 6, 7, 3), (3, 7, 4, 0)],
                mats["structure"], collection, bevel * 0.3, "structure",
            )
            body_parts.append(gusset)

    # Service door on +X face (breaks left/right symmetry).
    if res["door"]:
        dx = FX + FHX * 0.92
        door = add_mesh(
            "Furnace_Door",
            [
                (dx - 0.012, FY - 0.11, 0.22), (dx + 0.018, FY - 0.11, 0.22),
                (dx + 0.018, FY + 0.11, 0.22), (dx - 0.012, FY + 0.11, 0.22),
                (dx - 0.012, FY - 0.11, 0.48), (dx + 0.018, FY - 0.11, 0.48),
                (dx + 0.018, FY + 0.11, 0.48), (dx - 0.012, FY + 0.11, 0.48),
            ],
            [(0, 1, 2, 3), (4, 7, 6, 5), (0, 4, 5, 1), (1, 5, 6, 2), (2, 6, 7, 3), (3, 7, 4, 0)],
            mats["structure"], collection, bevel * 0.4, "structure",
        )
        body_parts.append(door)
        hinge = loft_rings(
            "Furnace_Hinge",
            [
                circle_ring(dx + 0.004, FY - 0.12, 0.012, 0.24, max(6, res["n_circ"] // 2)),
                circle_ring(dx + 0.004, FY - 0.12, 0.012, 0.46, max(6, res["n_circ"] // 2)),
            ],
            mats["hotmetal"], collection, 0.0, True, "hotmetal",
        )
        body_parts.append(hinge)

    return body_parts, ember


def build_burner(lod, mats, collection, bevel):
    res = lod_res(lod)
    parts = []
    # Stepped plenum on the -Y service face — not a cube: two lofted stations.
    y0 = FY - FHY * 0.98
    rings = [
        rounded_rect(FX - 0.08, y0 - 0.02, 0.22, 0.05, 0.02, 0.18, res["n_arc"]),
        rounded_rect(FX - 0.08, y0 - 0.06, 0.20, 0.055, 0.018, 0.30, res["n_arc"]),
        rounded_rect(FX - 0.08, y0 - 0.05, 0.18, 0.045, 0.016, 0.46, res["n_arc"]),
    ]
    parts.append(loft_rings("Burner_Plenum", rings, mats["hotmetal"], collection, bevel, True, "hotmetal"))
    n = max(6, res["n_circ"] // 2)
    nozzle_xs = (FX - 0.20, FX - 0.08, FX + 0.04) if lod == 0 else ((FX - 0.08, FX + 0.04) if lod == 1 else ())
    for i, x in enumerate(nozzle_xs):
        throat = loft_rings(
            f"Burner_Nozzle_{i}",
            [
                circle_ring(x, y0 - 0.09, 0.028, 0.30, n),
                circle_ring(x, y0 - 0.13, 0.022, 0.30, n),
                circle_ring(x, y0 - 0.15, 0.014, 0.30, n),
            ],
            mats["hotmetal"], collection, bevel * 0.3, True, "hotmetal",
        )
        parts.append(throat)
    if lod < 2:
        flange = flange_at(
            "Burner_Flange", (FX - 0.22, y0 - 0.02, 0.38), (1, 0, 0),
            0.045, 0.018, mats["hotmetal"], collection, 0.0, "hotmetal", n=n,
        )
        parts.append(flange)
    return parts


def build_stack(lod, mats, collection, bevel):
    res = lod_res(lod)
    n = res["n_circ"]
    parts = []
    takeoff = (FX, FY + FHY * 0.92, 0.58)
    stack_base = (SX, SY, 0.58)
    # Rectangular flue: takeoff → out → over → into stack.
    flue_pts = [
        Vector((FX, FY + FHY * 0.70, 0.58)),
        Vector((FX, FY + FHY * 0.92, 0.58)),
        Vector((SX, SY - STACK_R - 0.04, 0.58)),
        Vector((SX, SY, 0.60)),
    ]
    flue_path = chamfer_path(flue_pts, 0.06)
    if lod == 2:
        parts.append(pipe_along("Flue_Duct", flue_pts, 0.055, max(4, n // 2), mats["hotmetal"], collection, 0.0, "hotmetal"))
    else:
        outer_rings = []
        inner_rings = []
        for i, p in enumerate(flue_path):
            if i == 0:
                tang = flue_path[1] - flue_path[0]
            elif i == len(flue_path) - 1:
                tang = flue_path[-1] - flue_path[-2]
            else:
                tang = flue_path[i + 1] - flue_path[i - 1]
            hx, hy = 0.075, 0.055
            outer_rings.append(rect_in_plane(p, tang, hx, hy))
            inner_rings.append(rect_in_plane(p, tang, hx - 0.016, hy - 0.014))
        parts.append(loft_shell("Flue_Duct", outer_rings, inner_rings, mats["hotmetal"], collection, bevel * 0.5, "hotmetal"))
    # Rect-to-round collar at stack base.
    collar = loft_rings(
        "Flue_Collar",
        [
            circle_ring(SX, SY, STACK_R + 0.025, 0.56, n),
            circle_ring(SX, SY, STACK_R + 0.018, 0.62, n),
            circle_ring(SX, SY, STACK_R + 0.004, 0.68, n),
        ],
        mats["hotmetal"], collection, bevel * 0.4, True, "hotmetal",
    )
    parts.append(collar)

    # Tapered stack. Open at the top — vent is the outlet, not the cap apex.
    if lod == 0:
        stack_rings = [
            circle_ring(SX, SY, STACK_R + 0.008, 0.66, n),
            circle_ring(SX, SY, STACK_R, 0.82, n),
            circle_ring(SX, SY, STACK_R * 0.94, 0.98, n),
            circle_ring(SX, SY, STACK_R * 0.90, STACK_TOP - 0.06, n),
            circle_ring(SX, SY, STACK_R * 0.88, STACK_TOP, n),
        ]
    else:
        stack_rings = [
            circle_ring(SX, SY, STACK_R + 0.006, 0.66, n),
            circle_ring(SX, SY, STACK_R * 0.92, 0.92, n),
            circle_ring(SX, SY, STACK_R * 0.88, STACK_TOP, n),
        ]
    if lod == 2:
        parts.append(loft_rings("Stack_Tube", stack_rings, mats["stack"], collection, bevel, True, "stack"))
    else:
        inner_stack = [
            [
                ((p[0] - SX) * 0.78 + SX, (p[1] - SY) * 0.78 + SY, p[2])
                for p in ring
            ]
            for ring in stack_rings
        ]
        parts.append(loft_shell("Stack_Tube", stack_rings, inner_stack, mats["stack"], collection, bevel, "stack"))
    # Hoop rings.
    if lod == 0:
        for i, z in enumerate((0.78, 0.96)):
            hoop = loft_rings(
                f"Stack_Hoop_{i}",
                [
                    circle_ring(SX, SY, STACK_R + 0.016, z - 0.012, n),
                    circle_ring(SX, SY, STACK_R + 0.016, z + 0.012, n),
                ],
                mats["stack"], collection, 0.0, True, "stack",
            )
            parts.append(hoop)
    vent_z = STACK_TOP
    # Rain cap on posts, baffles under the cap. stack_vent stays at the open outlet.
    cap_z = STACK_TOP + 0.055
    cap = loft_rings(
        "Stack_Cap",
        [
            circle_ring(SX, SY, STACK_R * 0.55, cap_z + 0.04, n),
            circle_ring(SX, SY, STACK_R * 1.05, cap_z + 0.012, n),
            circle_ring(SX, SY, STACK_R * 1.12, cap_z, n),
        ],
        mats["stack"], collection, bevel * 0.4, True, "stack",
    )
    parts.append(cap)
    for i in range(3 if lod == 0 else (1 if lod == 1 else 0)):
        ang = i * 2.0 * math.pi / (3 if lod == 0 else 2) + 0.3
        px = SX + math.cos(ang) * (STACK_R * 0.62)
        py = SY + math.sin(ang) * (STACK_R * 0.62)
        post = loft_rings(
            f"Stack_Post_{i}",
            [
                circle_ring(px, py, 0.010, STACK_TOP, max(4, n // 2)),
                circle_ring(px, py, 0.010, cap_z, max(4, n // 2)),
            ],
            mats["stack"], collection, 0.0, True, "stack",
        )
        parts.append(post)
    if res["baffles"]:
        for i, ang in enumerate((0.4, 0.4 + math.pi * 0.5)):
            dx, dy = math.cos(ang) * 0.012, math.sin(ang) * 0.012
            baffle = add_mesh(
                f"Stack_Baffle_{i}",
                [
                    (SX - math.sin(ang) * STACK_R * 0.55 + dx, SY + math.cos(ang) * STACK_R * 0.55 + dy, STACK_TOP - 0.01),
                    (SX + math.sin(ang) * STACK_R * 0.55 + dx, SY - math.cos(ang) * STACK_R * 0.55 + dy, STACK_TOP - 0.01),
                    (SX + math.sin(ang) * STACK_R * 0.55 + dx, SY - math.cos(ang) * STACK_R * 0.55 + dy, cap_z),
                    (SX - math.sin(ang) * STACK_R * 0.55 + dx, SY + math.cos(ang) * STACK_R * 0.55 + dy, cap_z),
                    (SX - math.sin(ang) * STACK_R * 0.55 - dx, SY + math.cos(ang) * STACK_R * 0.55 - dy, STACK_TOP - 0.01),
                    (SX + math.sin(ang) * STACK_R * 0.55 - dx, SY - math.cos(ang) * STACK_R * 0.55 - dy, STACK_TOP - 0.01),
                    (SX + math.sin(ang) * STACK_R * 0.55 - dx, SY - math.cos(ang) * STACK_R * 0.55 - dy, cap_z),
                    (SX - math.sin(ang) * STACK_R * 0.55 - dx, SY + math.cos(ang) * STACK_R * 0.55 - dy, cap_z),
                ],
                [(0, 1, 2, 3), (4, 7, 6, 5), (0, 4, 5, 1), (1, 5, 6, 2), (2, 6, 7, 3), (3, 7, 4, 0)],
                mats["stack"], collection, 0.0, "stack",
            )
            parts.append(baffle)
    return parts, Vector((SX, SY, vent_z))


def build_tank(lod, mats, collection, bevel):
    res = lod_res(lod)
    n = res["n_circ"]
    parts = []
    # Horizontal vessel along Y, dished heads.
    axis = Vector((0, 1, 0))
    zc = 0.28
    if lod == 0:
        stations = (
            (-TANK_HALF, TANK_R * 0.35),
            (-TANK_HALF + 0.05, TANK_R * 0.90),
            (0.0, TANK_R),
            (TANK_HALF - 0.05, TANK_R * 0.90),
            (TANK_HALF, TANK_R * 0.35),
        )
    else:
        stations = (
            (-TANK_HALF, TANK_R * 0.40),
            (0.0, TANK_R),
            (TANK_HALF, TANK_R * 0.40),
        )
    rings = [
        circle_in_plane((TX, TY + y, zc), axis, r, n)
        for y, r in stations
    ]
    parts.append(loft_rings("Tank_Shell", rings, mats["tank"], collection, bevel, True, "tank"))
    # Formed saddles (U-section), not boxes.
    for i, sy in enumerate((TY - TANK_HALF * 0.45, TY + TANK_HALF * 0.42)):
        saddle_outer = [
            (TX - TANK_R - 0.04, sy - 0.04, 0.0),
            (TX + TANK_R + 0.04, sy - 0.04, 0.0),
            (TX + TANK_R + 0.04, sy + 0.04, 0.0),
            (TX - TANK_R - 0.04, sy + 0.04, 0.0),
            (TX - TANK_R - 0.04, sy - 0.04, 0.06),
            (TX + TANK_R + 0.04, sy - 0.04, 0.06),
            (TX + TANK_R + 0.04, sy + 0.04, 0.06),
            (TX - TANK_R - 0.04, sy + 0.04, 0.06),
        ]
        base = add_mesh(
            f"Tank_SaddleBase_{i}",
            saddle_outer,
            [(0, 1, 2, 3), (4, 7, 6, 5), (0, 4, 5, 1), (1, 5, 6, 2), (2, 6, 7, 3), (3, 7, 4, 0)],
            mats["tank"], collection, bevel * 0.4, "tank",
        )
        parts.append(base)
        if lod < 2:
            for sign in (-1, 1):
                cheek = add_mesh(
                    f"Tank_SaddleCheek_{i}_{sign}",
                    [
                        (TX + sign * (TANK_R * 0.15), sy - 0.035, 0.05),
                        (TX + sign * (TANK_R + 0.02), sy - 0.035, 0.05),
                        (TX + sign * (TANK_R + 0.02), sy + 0.035, 0.05),
                        (TX + sign * (TANK_R * 0.15), sy + 0.035, 0.05),
                        (TX + sign * (TANK_R * 0.25), sy - 0.035, zc - 0.02),
                        (TX + sign * (TANK_R * 0.92), sy - 0.035, zc - 0.04),
                        (TX + sign * (TANK_R * 0.92), sy + 0.035, zc - 0.04),
                        (TX + sign * (TANK_R * 0.25), sy + 0.035, zc - 0.02),
                    ],
                    [(0, 1, 2, 3), (4, 7, 6, 5), (0, 4, 5, 1), (1, 5, 6, 2), (2, 6, 7, 3), (3, 7, 4, 0)],
                    mats["tank"], collection, bevel * 0.3, "tank",
                )
                parts.append(cheek)
    if lod == 2:
        return parts
    # Manway.
    man = loft_rings(
        "Tank_Manway",
        [
            circle_ring(TX, TY + 0.04, 0.045, zc + TANK_R * 0.72, max(6, n // 2)),
            circle_ring(TX, TY + 0.04, 0.045, zc + TANK_R * 0.92, max(6, n // 2)),
            circle_ring(TX, TY + 0.04, 0.032, zc + TANK_R * 1.02, max(6, n // 2)),
        ],
        mats["tank"], collection, bevel * 0.3, True, "tank",
    )
    parts.append(man)
    cap = loft_rings(
        "Tank_Cap",
        [
            circle_ring(TX, TY + 0.04, 0.038, zc + TANK_R * 1.00, max(6, n // 2)),
            circle_ring(TX, TY + 0.04, 0.022, zc + TANK_R * 1.08, max(6, n // 2)),
        ],
        mats["hotmetal"], collection, 0.0, True, "hotmetal",
    )
    parts.append(cap)
    return parts


def build_pipe(lod, mats, collection, bevel):
    res = lod_res(lod)
    n = res["n_pipe"]
    parts = []
    start = (FX + FHX * 0.98, FY - 0.06, 0.36)
    end = (TX - TANK_R * 0.15, TY + TANK_HALF * 0.55, 0.36)
    pts = [
        start,
        (start[0] + 0.10, start[1], 0.36),
        (start[0] + 0.10, start[1], 0.50),
        (end[0], start[1], 0.50),
        (end[0], start[1], 0.36),
        end,
    ]
    parts.append(pipe_along("Process_Pipe", pts, PIPE_R, n, mats["pipe"], collection, bevel * 0.4, "pipe"))
    if lod < 2:
        parts.append(flange_at("Pipe_Flange_A", start, (1, 0, 0), PIPE_R + 0.018, 0.016, mats["hotmetal"], collection, 0.0, "hotmetal", n=max(6, n)))
        parts.append(flange_at("Pipe_Flange_B", end, (0, 1, 0), PIPE_R + 0.018, 0.016, mats["hotmetal"], collection, 0.0, "hotmetal", n=max(6, n)))
    # Clamps on a short tray — fittings, not floating hose.
    if lod == 2:
        return parts
    mid = ((start[0] + end[0]) * 0.5, start[1], 0.50)
    clamp = add_mesh(
        "Pipe_Clamp",
        [
            (mid[0] - 0.03, mid[1] - 0.04, mid[2] - 0.04),
            (mid[0] + 0.03, mid[1] - 0.04, mid[2] - 0.04),
            (mid[0] + 0.03, mid[1] + 0.04, mid[2] - 0.04),
            (mid[0] - 0.03, mid[1] + 0.04, mid[2] - 0.04),
            (mid[0] - 0.03, mid[1] - 0.04, mid[2] + 0.04),
            (mid[0] + 0.03, mid[1] - 0.04, mid[2] + 0.04),
            (mid[0] + 0.03, mid[1] + 0.04, mid[2] + 0.04),
            (mid[0] - 0.03, mid[1] + 0.04, mid[2] + 0.04),
        ],
        [(0, 1, 2, 3), (4, 7, 6, 5), (0, 4, 5, 1), (1, 5, 6, 2), (2, 6, 7, 3), (3, 7, 4, 0)],
        mats["structure"], collection, bevel * 0.3, "structure",
    )
    parts.append(clamp)
    return parts


def build_lamp(lod, mats, collection, bevel):
    res = lod_res(lod)
    n = max(6, res["n_circ"] // 2)
    parts = []
    lx, ly, lz = SX + 0.18, SY - 0.16, 0.86
    if lod == 2:
        hood = loft_rings(
            "Lamp_Hood",
            [
                circle_ring(lx, ly, 0.018, lz + 0.018, n),
                circle_ring(lx, ly, 0.048, lz - 0.008, n),
            ],
            mats["lampmetal"], collection, 0.0, False, "lampmetal",
        )
        lens = loft_rings(
            "Lamp_Lens",
            [
                circle_ring(lx, ly, 0.018, lz - 0.004, n),
                circle_ring(lx, ly, 0.016, lz + 0.010, n),
            ],
            mats["lamp"], collection, 0.0, True, "lamp",
        )
        return [hood], lens, Vector((lx, ly, lz))
    # Stalk from furnace shoulder.
    stalk = loft_rings(
        "Lamp_Stalk",
        [
            circle_ring(lx - 0.06, ly, 0.012, 0.68, n),
            circle_ring(lx - 0.02, ly, 0.012, 0.78, n),
            circle_ring(lx, ly, 0.012, lz - 0.04, n),
        ],
        mats["lampmetal"], collection, 0.0, True, "lampmetal",
    )
    parts.append(stalk)
    socket = loft_rings(
        "Lamp_Socket",
        [
            circle_ring(lx, ly, 0.022, lz - 0.03, n),
            circle_ring(lx, ly, 0.028, lz, n),
            circle_ring(lx, ly, 0.024, lz + 0.02, n),
        ],
        mats["lampmetal"], collection, bevel * 0.3, True, "lampmetal",
    )
    parts.append(socket)
    # Hood as a spun dish, not a halo.
    hood = loft_rings(
        "Lamp_Hood",
        [
            circle_ring(lx, ly, 0.018, lz + 0.018, n),
            circle_ring(lx, ly, 0.042, lz + 0.028, n),
            circle_ring(lx, ly, 0.050, lz + 0.012, n),
            circle_ring(lx, ly, 0.048, lz - 0.008, n),
        ],
        mats["lampmetal"], collection, bevel * 0.2, False, "lampmetal",
    )
    parts.append(hood)
    lens = loft_rings(
        "Lamp_Lens",
        [
            circle_ring(lx, ly, 0.018, lz - 0.004, n),
            circle_ring(lx, ly, 0.016, lz + 0.010, n),
        ],
        mats["lamp"], collection, 0.0, True, "lamp",
    )
    return parts, lens, Vector((lx, ly, lz))


def build_high_fasteners(lod, mats, collection):
    if lod != 0:
        return []
    parts = []
    # Strap bolts and flange bolts only — interfaces, not a spray.
    y0 = FY - FHY * 0.98
    locs = [
        ((FX + FHX + 0.02, FY, 0.24), (1, 0, 0)),
        ((FX + FHX + 0.02, FY, 0.50), (1, 0, 0)),
        ((FX - 0.22, y0 - 0.02, 0.38), (0, -1, 0)),
        ((TX, TY + 0.04, 0.28 + TANK_R * 1.02), (0, 0, 1)),
        ((FX + FHX * 0.98, FY - 0.06, 0.36), (1, 0, 0)),
        ((SX + STACK_R + 0.01, SY, 0.78), (1, 0, 0)),
        ((SX + STACK_R + 0.01, SY, 0.96), (1, 0, 0)),
        ((TX - TANK_R, TY - TANK_HALF * 0.45, 0.06), (0, 0, 1)),
    ]
    for i, (loc, axis) in enumerate(locs):
        parts.append(hex_bolt(f"High_Bolt_{i}", loc, axis, 0.010, 0.016, mats["hotmetal"], collection, "hotmetal"))
    return parts


def build_lod_geometry(lod, mats, collection):
    bevel = BEVEL_LOW[lod]
    furnace, ember = build_furnace(lod, mats, collection, bevel)
    burner = build_burner(lod, mats, collection, bevel)
    stack, vent_loc = build_stack(lod, mats, collection, bevel)
    tank = build_tank(lod, mats, collection, bevel)
    pipe = build_pipe(lod, mats, collection, bevel)
    lamp_metal, lens, lamp_loc = build_lamp(lod, mats, collection, bevel)
    body = furnace + burner + stack + tank + pipe + lamp_metal
    high_extra = build_high_fasteners(lod, mats, collection)
    return {
        "body": body,
        "ember": ember,
        "lens": lens,
        "high_extra": high_extra,
        "vent_loc": vent_loc,
        "lamp_loc": lamp_loc,
        "slit_loc": Vector((FX, FY, WELL_FLOOR + 0.02)),
    }


# ---------------------------------------------------------------------------
# Bake + author
# ---------------------------------------------------------------------------

def ensure_uv(obj):
    if obj.type != "MESH":
        return
    if not obj.data.uv_layers:
        obj.data.uv_layers.new(name="UVMap")
    obj.data.uv_layers[0].name = "UVMap"
    obj.data.uv_layers.active = obj.data.uv_layers[0]


def make_bake_image(name, size, colorspace="Non-Color"):
    if name in bpy.data.images:
        bpy.data.images.remove(bpy.data.images[name])
    img = bpy.data.images.new(name, width=size, height=size, alpha=True, float_buffer=True)
    img.colorspace_settings.name = colorspace
    img.generated_color = (0, 0, 0, 1)
    return img


def assign_bake_target(obj, img):
    if not obj.data.materials:
        mat = bpy.data.materials.new("BakeTarget")
        obj.data.materials.append(mat)
    first_tex = None
    for mat in obj.data.materials:
        if mat is None:
            continue
        mat.use_nodes = True
        nodes = mat.node_tree.nodes
        tex = None
        for node in nodes:
            if node.type == "TEX_IMAGE" and node.image == img:
                tex = node
                break
        if tex is None:
            tex = nodes.new("ShaderNodeTexImage")
            tex.image = img
        for node in nodes:
            node.select = False
        tex.select = True
        nodes.active = tex
        if first_tex is None:
            first_tex = tex
    return first_tex


def setup_cycles():
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = 8
    try:
        scene.cycles.bake_type = "AO"
    except Exception:
        pass
    scene.render.bake.margin = 8
    scene.render.bake.use_clear = True
    try:
        scene.cycles.use_denoising = False
    except Exception:
        pass


def bake_pass(low, high, cage, bake_type, img, normal_space="TANGENT"):
    object_mode()
    bpy.ops.object.select_all(action="DESELECT")
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    assign_bake_target(low, img)
    low.select_set(True)
    bpy.context.view_layer.objects.active = low
    kwargs = dict(type=bake_type, margin=8, use_clear=True)
    if high is not None:
        high.select_set(True)
        kwargs["use_selected_to_active"] = True
        kwargs["cage_extrusion"] = 0.03
        if cage is not None:
            kwargs["use_cage"] = True
            kwargs["cage_object"] = cage.name
    if bake_type == "NORMAL":
        kwargs["normal_space"] = normal_space
        kwargs["normal_r"] = "POS_X"
        kwargs["normal_g"] = "POS_Y"
        kwargs["normal_b"] = "POS_Z"
    try:
        bpy.ops.object.bake(**kwargs)
        return True
    except Exception as exc:
        print(f"bake {bake_type} failed: {exc}")
        return False


def emission_id_material(obj):
    role = obj.get("spacefaceRole") or "structure"
    rgb = ROLE_ID_RGB.get(role, (0.5, 0.5, 0.5))
    mat = bpy.data.materials.new(f"EmitID_{obj.name}")
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    emit = nt.nodes.new("ShaderNodeEmission")
    emit.inputs["Color"].default_value = (*rgb, 1.0)
    emit.inputs["Strength"].default_value = 1.0
    nt.links.new(emit.outputs["Emission"], out.inputs["Surface"])
    obj.data.materials.clear()
    obj.data.materials.append(mat)
    return mat


def pointiness_material(obj):
    mat = bpy.data.materials.new(f"EmitCurv_{obj.name}")
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    emit = nt.nodes.new("ShaderNodeEmission")
    geom = nt.nodes.new("ShaderNodeNewGeometry")
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].position = 0.45
    ramp.color_ramp.elements[0].color = (0.0, 0.0, 0.0, 1)
    ramp.color_ramp.elements[1].position = 0.62
    ramp.color_ramp.elements[1].color = (1.0, 1.0, 1.0, 1)
    if "Pointiness" in geom.outputs:
        nt.links.new(geom.outputs["Pointiness"], ramp.inputs["Fac"])
    nt.links.new(ramp.outputs["Color"], emit.inputs["Color"])
    emit.inputs["Strength"].default_value = 1.0
    nt.links.new(emit.outputs["Emission"], out.inputs["Surface"])
    obj.data.materials.clear()
    obj.data.materials.append(mat)
    return mat


def classify_id(id_img):
    arr = image_np(id_img)[..., :3]
    h, w, _ = arr.shape
    labels = np.zeros((h, w), dtype=np.int32)
    keys = list(ROLE_ID_RGB.keys())
    palette = np.array([ROLE_ID_RGB[k] for k in keys], dtype=np.float32)
    pix = arr.reshape(-1, 3)
    # Distance to palette.
    d = ((pix[:, None, :] - palette[None, :, :]) ** 2).sum(axis=2)
    idx = np.argmin(d, axis=1).reshape(h, w)
    lum = arr.mean(axis=2)
    idx = np.where(lum < 0.02, -1, idx)
    return idx, keys


def author_maps(lod, id_img, ao_img, curv_img, nrm_img, size):
    id_idx, keys = classify_id(id_img)
    ao = image_np(ao_img)[..., 0]
    if ao.mean() < 0.05:
        ao = np.ones_like(ao) * 0.85
    ao = np.clip(ao, 0.15, 1.0)
    curv = image_np(curv_img)[..., 0]
    nrm = image_np(nrm_img)
    if abs(float(nrm[..., 2].mean()) - 0.0) < 0.05 and abs(float(nrm[..., 0].mean()) - 0.0) < 0.05:
        nrm[..., 0] = 0.5
        nrm[..., 1] = 0.5
        nrm[..., 2] = 1.0
    h, w = ao.shape
    yy, xx = np.mgrid[0:h, 0:w]
    gf = h01(xx, yy, 3 + lod)
    gf2 = h01(xx // 3, yy // 3, 11 + lod)
    albedo = np.zeros((h, w, 4), dtype=np.float32)
    orm = np.ones((h, w, 4), dtype=np.float32)
    for i, key in enumerate(keys):
        if key in {"slit", "lamp"}:
            continue
        mask = id_idx == i
        if not np.any(mask):
            continue
        br, bg, bb = ROLE_ALBEDO[key]
        dirt = np.clip(0.12 * gf + 0.18 * (1.0 - ao) + 0.10 * gf2, 0, 1)
        edge = np.clip((curv - 0.45) * 2.2, 0, 1)
        heat = 0.0
        if key in {"hotmetal", "stack", "pipe"}:
            heat = np.clip(0.35 * gf2 + 0.15 * (1.0 - ao), 0, 1)
        r = np.clip(br * (1.0 - dirt * 0.35) * (0.55 + 0.45 * ao) + edge * 0.10 + heat * 0.12, 0, 1)
        g = np.clip(bg * (1.0 - dirt * 0.32) * (0.55 + 0.45 * ao) + edge * 0.07 + heat * 0.02, 0, 1)
        b = np.clip(bb * (1.0 - dirt * 0.28) * (0.55 + 0.45 * ao) + edge * 0.04 - heat * 0.06, 0, 1)
        if key == "hotmetal":
            r = np.clip(r + heat * 0.10, 0, 1)
            b = np.clip(b + (1.0 - heat) * 0.04, 0, 1)
        if key == "refractory":
            grain = 0.04 * gf
            r = np.clip(r + grain - (1.0 - ao) * 0.08, 0, 1)
            g = np.clip(g + grain * 0.6 - (1.0 - ao) * 0.06, 0, 1)
        rough = np.clip(ROLE_ROUGH[key] + dirt * 0.18 - edge * 0.10 + (1.0 - ao) * 0.08, 0.05, 0.95)
        metal = np.clip(ROLE_METAL[key] + edge * (0.20 if ROLE_METAL[key] < 0.2 else 0.08) - dirt * 0.05, 0, 1)
        albedo[mask, 0] = r[mask]
        albedo[mask, 1] = g[mask]
        albedo[mask, 2] = b[mask]
        albedo[mask, 3] = 1.0
        orm[mask, 0] = ao[mask]
        orm[mask, 1] = rough[mask]
        orm[mask, 2] = metal[mask]
    empty = albedo[..., 3] < 0.5
    if np.any(empty):
        albedo[empty, 0:3] = ROLE_ALBEDO["structure"]
        albedo[empty, 3] = 1.0
        orm[empty, 0] = ao[empty]
        orm[empty, 1] = ROLE_ROUGH["structure"]
        orm[empty, 2] = ROLE_METAL["structure"]
    nrm[..., 3] = 1.0
    # Mesh-derived normal is authoritative; keep a tiny grit so plates are not chrome-flat.
    grit = (gf - 0.5) * 0.04
    nrm[..., 0] = np.clip(nrm[..., 0] + grit, 0, 1)
    nrm[..., 1] = np.clip(nrm[..., 1] + (gf2 - 0.5) * 0.04, 0, 1)
    return albedo, orm, nrm, ao, curv, id_idx


def bake_and_author(lod, body, high_extra, collection, size):
    setup_cycles()
    for obj in body:
        finish_low(obj)
    low = join_objects(body, f"LOD{lod}_refinery_src")
    if low is None:
        raise RuntimeError("no body meshes")
    ensure_uv(low)
    overlap = unique_uv(low)
    print(f"LOD{lod} UV overlap loops={overlap}")
    cage = duplicate_obj(low, f"LOD{lod}_cage", collection)
    inflate_mesh(cage, 0.028)
    cage.hide_render = True
    cage.hide_set(True)

    high_parts = []
    for obj in list(collection.objects):
        if obj == low or obj == cage:
            continue
        if obj.get("_sf_high"):
            high_parts.append(obj)
    for extra in high_extra:
        finish_low(extra, angle=22.0)
        extra["_sf_high"] = True
        high_parts.append(extra)
    # Duplicate low, tighter bevel already applied; join extras onto a high copy.
    high = duplicate_obj(low, f"LOD{lod}_high", collection)
    if high_parts:
        high = join_objects([high] + high_parts, f"LOD{lod}_high")

    img_ao = make_bake_image(f"BakeAO_L{lod}", size)
    img_n = make_bake_image(f"BakeN_L{lod}", size)
    img_id = make_bake_image(f"BakeID_L{lod}", size, "sRGB")
    img_c = make_bake_image(f"BakeC_L{lod}", size)

    bake_pass(low, None, None, "AO", img_ao)
    ok_n = bake_pass(low, high, cage, "NORMAL", img_n)
    if not ok_n:
        bake_pass(low, None, None, "NORMAL", img_n)

    # ID from original slot colours: temporarily swap to emission.
    backups = [slot.material for slot in low.material_slots]
    # Re-assign per-slot emission by current material role.
    for slot in low.material_slots:
        mat = slot.material
        role = (mat.get("spacefaceRole") if mat else None) or "structure"
        rgb = ROLE_ID_RGB.get(role, (0.5, 0.5, 0.5))
        emit_mat = bpy.data.materials.new(f"ID_{role}_{lod}_{id(slot) % 100000}")
        emit_mat.use_nodes = True
        nt = emit_mat.node_tree
        nt.nodes.clear()
        out = nt.nodes.new("ShaderNodeOutputMaterial")
        emit = nt.nodes.new("ShaderNodeEmission")
        emit.inputs["Color"].default_value = (*rgb, 1.0)
        emit.inputs["Strength"].default_value = 1.0
        nt.links.new(emit.outputs["Emission"], out.inputs["Surface"])
        emit_mat["spacefaceRole"] = role
        slot.material = emit_mat
    bake_pass(low, None, None, "EMIT", img_id)

    pointiness_material(low)
    bake_pass(low, None, None, "EMIT", img_c)

    albedo, orm, nrm, ao, curv, id_idx = author_maps(lod, img_id, img_ao, img_c, img_n, size)
    prefix = f"refinery_lod{lod}"
    maps = {}
    maps["basecolor"], p_bc = write_pixels(f"{prefix}_basecolor", albedo, size, "sRGB")
    maps["orm"], p_orm = write_pixels(f"{prefix}_orm", orm, size, "Non-Color")
    maps["normal"], p_n = write_pixels(f"{prefix}_normal", nrm, size, "Non-Color")
    maps["ao"], p_ao = write_pixels(f"{prefix}_ao", np.dstack([ao, ao, ao, np.ones_like(ao)]), size, "Non-Color")
    maps["curvature"], p_c = write_pixels(f"{prefix}_curvature", np.dstack([curv, curv, curv, np.ones_like(curv)]), size, "Non-Color")
    maps["id"], p_id = write_pixels(f"{prefix}_id", image_np(img_id), size, "sRGB")

    atlas = make_atlas_material(lod, maps)
    low.data.materials.clear()
    low.data.materials.append(atlas)
    low.name = f"LOD{lod}_refinery"
    if low.data:
        low.data.name = f"LOD{lod}_refinery"
    low["spacefaceLod"] = f"lod{lod}"
    low["spacefaceRole"] = "atlas"

    # Cleanup bake helpers.
    for helper in (cage, high):
        if helper is not None:
            try:
                bpy.data.objects.remove(helper, do_unlink=True)
            except Exception:
                pass
    triangulate(low)
    return low, {
        "overlapLoops": overlap,
        "maps": {
            "basecolor": str(p_bc.relative_to(ROOT)).replace("\\", "/"),
            "orm": str(p_orm.relative_to(ROOT)).replace("\\", "/"),
            "normal": str(p_n.relative_to(ROOT)).replace("\\", "/"),
            "ao": str(p_ao.relative_to(ROOT)).replace("\\", "/"),
            "curvature": str(p_c.relative_to(ROOT)).replace("\\", "/"),
            "id": str(p_id.relative_to(ROOT)).replace("\\", "/"),
        },
    }


def finish_emit_mesh(obj, lod, kind):
    finish_low(obj, angle=24.0)
    ensure_uv(obj)
    unique_uv(obj, margin=0.02)
    triangulate(obj)
    obj.name = f"LOD{lod}_{kind}"
    obj["spacefaceLod"] = f"lod{lod}"
    return obj


def bbox_of(objects):
    mins = Vector((1e9, 1e9, 1e9))
    maxs = Vector((-1e9, -1e9, -1e9))
    any_mesh = False
    for obj in objects:
        if obj.type != "MESH":
            continue
        any_mesh = True
        for corner in obj.bound_box:
            w = obj.matrix_world @ Vector(corner)
            mins.x, mins.y, mins.z = min(mins.x, w.x), min(mins.y, w.y), min(mins.z, w.z)
            maxs.x, maxs.y, maxs.z = max(maxs.x, w.x), max(maxs.y, w.y), max(maxs.z, w.z)
    if not any_mesh:
        return None
    return {"min": list(mins), "max": list(maxs), "size": list(maxs - mins)}


def export_lod_glb(objects, lod, path: Path):
    object_mode()
    bpy.ops.object.select_all(action="DESELECT")
    for obj in objects:
        try:
            obj.hide_set(False)
            obj.hide_viewport = False
            obj.hide_render = False
            obj.select_set(True)
        except Exception:
            pass
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(".tmp.glb")
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
    if path.exists():
        path.unlink()
    shutil.move(str(tmp), str(path))
    sanitize_glb_floats(path)
    return path


def save_blend(path: Path):
    path.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(path))


# ---------------------------------------------------------------------------
# Combine + capture
# ---------------------------------------------------------------------------

def read_glb(path: Path):
    data = bytearray(path.read_bytes())
    if data[:4] != b"glTF" or len(data) < 20:
        raise RuntimeError(f"not a GLB: {path}")
    json_len = struct.unpack_from("<I", data, 12)[0]
    json_start = 20
    json_end = json_start + json_len
    gltf = json.loads(bytes(data[json_start:json_end]).rstrip(b" \x00"))
    rest = bytes(data[json_end:])
    return gltf, rest


def write_glb(path: Path, gltf: dict, rest: bytes):
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
    gltf, rest = read_glb(path)
    extras = dict(gltf.get("asset", {}).get("extras") or {})
    extras["assetId"] = ASSET_ID
    extras["partId"] = ASSET_ID
    extras["spacefaceAsset"] = contract
    gltf.setdefault("asset", {})["extras"] = extras
    scenes = gltf.get("scenes") or []
    if scenes:
        scene_extras = dict(scenes[0].get("extras") or {})
        scene_extras["assetId"] = ASSET_ID
        scene_extras["partId"] = ASSET_ID
        scene_extras["spacefaceAsset"] = contract
        scenes[0]["extras"] = scene_extras
    nodes = gltf.get("nodes") or []
    root = None
    for node in nodes:
        if node.get("name") == ROOT_NAME:
            root = node
            break
    if root is None and nodes:
        root = max(nodes, key=lambda n: len(n.get("children") or []))
        root["name"] = ROOT_NAME
    if root is not None:
        node_extras = dict(root.get("extras") or {})
        node_extras["spacefaceAsset"] = contract
        root["extras"] = node_extras
    hook_set = set(HOOK_NAMES)
    for node in nodes:
        name = node.get("name") or ""
        if name in hook_set:
            extras = dict(node.get("extras") or {})
            extras["spacefaceSocket"] = True
            extras["socket"] = True
            space = dict(extras.get("spaceface") or {})
            space["socket"] = True
            space["role"] = "works_hook"
            extras["spaceface"] = space
            node["extras"] = extras
        if name.startswith("LOD") and "_" in name:
            extras = dict(node.get("extras") or {})
            lod = name.split("_", 1)[0].lower()
            extras["spacefaceLod"] = lod
            space = dict(extras.get("spaceface") or {})
            space["lod"] = lod
            extras["spaceface"] = space
            node["extras"] = extras
        if name == "COLLISION_HULL":
            extras = dict(node.get("extras") or {})
            extras["nonRender"] = True
            extras["sf_collision"] = True
            extras["spaceface"] = {"collision": True, "helper": True, "nonRender": True}
            node["extras"] = extras
    write_glb(path, gltf, rest)


def inspect_glb(path: Path):
    gltf, _ = read_glb(path)
    nodes = gltf.get("nodes") or []
    meshes = gltf.get("meshes") or []
    names = [n.get("name") for n in nodes]
    accessors = gltf.get("accessors") or []
    lod_tris = {0: 0, 1: 0, 2: 0}
    lod_draws = {0: 0, 1: 0, 2: 0}
    for node in nodes:
        name = node.get("name") or ""
        mesh_index = node.get("mesh")
        if mesh_index is None:
            continue
        mesh = meshes[mesh_index]
        lod = None
        if name.startswith("LOD0"):
            lod = 0
        elif name.startswith("LOD1"):
            lod = 1
        elif name.startswith("LOD2"):
            lod = 2
        if lod is None:
            continue
        for prim in mesh.get("primitives") or []:
            lod_draws[lod] += 1
            idx = (prim.get("indices"))
            if idx is None:
                continue
            acc = accessors[idx]
            count = int(acc.get("count") or 0)
            lod_tris[lod] += count // 3
    hooks = {h: ("found" if h in names else "MISSING") for h in HOOK_NAMES}
    return {
        "names": names,
        "hooks": hooks,
        "root": ROOT_NAME if ROOT_NAME in names else None,
        "lodTriangles": lod_tris,
        "lodDraws": lod_draws,
        "materials": len(gltf.get("materials") or []),
        "nodes": len(nodes),
    }


def look_at(obj, target=(0, 0, 0)):
    obj.rotation_euler = (Vector(target) - obj.location).to_track_quat("-Z", "Y").to_euler()


def setup_review_scene():
    scene = bpy.context.scene
    try:
        scene.render.engine = "BLENDER_EEVEE_NEXT"
    except TypeError:
        try:
            scene.render.engine = "BLENDER_EEVEE"
        except Exception:
            pass
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
    scene.view_settings.exposure = 0.04
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
    bpy.ops.mesh.primitive_plane_add(size=2.4, location=(0, 0, -0.002))
    pad = bpy.context.object
    pad.name = "MinePad"
    pad_mat = bpy.data.materials.new("MinePadMat")
    pad_mat.use_nodes = True
    bsdf = next(n for n in pad_mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    bsdf.inputs["Base Color"].default_value = (0.07, 0.055, 0.042, 1)
    bsdf.inputs["Roughness"].default_value = 0.86
    bsdf.inputs["Metallic"].default_value = 0.04
    pad.data.materials.append(pad_mat)
    cam_data = bpy.data.cameras.new("WorksCam")
    camera = bpy.data.objects.new("WorksCam", cam_data)
    scene.collection.objects.link(camera)
    scene.camera = camera
    reach = 4.0
    for name, loc, energy, color, angle in (
        ("Key", (-1.15 * reach, -0.78 * reach, 0.54 * reach), 7.0, (1.00, 0.863, 0.737), 18.0),
        ("Rim", (0.22 * reach, 1.45 * reach, 0.30 * reach), 2.10, (0.616, 0.722, 0.941), 25.0),
        ("Fill", (1.12 * reach, 0.46 * reach, 0.50 * reach), 2.20, (0.847, 0.765, 0.659), 30.0),
        ("Grazing", (1.6 * reach, -0.2 * reach, 0.22 * reach), 3.40, (1.00, 0.90, 0.78), 12.0),
    ):
        data = bpy.data.lights.new(name, "SUN")
        data.energy = energy
        data.color = color
        try:
            data.angle = math.radians(angle)
        except Exception:
            pass
        data.use_shadow = name in {"Key", "Grazing"}
        obj = bpy.data.objects.new(name, data)
        scene.collection.objects.link(obj)
        obj.location = loc
        look_at(obj, (0, 0, 0.25))
    return camera, pad


def override_clay(meshes):
    backups = {}
    mat = bpy.data.materials.new("ClayReview")
    bsdf = principled(mat)
    bsdf.inputs["Base Color"].default_value = (0.46, 0.46, 0.45, 1)
    bsdf.inputs["Roughness"].default_value = 0.62
    bsdf.inputs["Metallic"].default_value = 0.0
    if "Emission Strength" in bsdf.inputs:
        bsdf.inputs["Emission Strength"].default_value = 0.0
    for obj in meshes:
        backups[obj.name] = [slot.material for slot in obj.material_slots]
        if obj.material_slots:
            obj.material_slots[0].material = mat
        else:
            obj.data.materials.append(mat)
        for i in range(1, len(obj.material_slots)):
            obj.material_slots[i].material = mat
    return backups, mat


def restore_mats(meshes, backups):
    for obj in meshes:
        mats = backups.get(obj.name)
        if not mats:
            continue
        for i, mat in enumerate(mats):
            if i < len(obj.material_slots):
                obj.material_slots[i].material = mat


def isolation_material(kind, source_mat=None):
    mat = bpy.data.materials.new(f"Iso_{kind}")
    bsdf = principled(mat)
    if source_mat and source_mat.use_nodes:
        img = None
        for node in source_mat.node_tree.nodes:
            if node.type == "TEX_IMAGE" and node.image and kind in (node.image.name or "").lower():
                img = node.image
        if kind == "normal":
            for node in source_mat.node_tree.nodes:
                if node.type == "TEX_IMAGE" and node.image and "normal" in (node.image.name or "").lower():
                    img = node.image
                    break
        if kind == "orm":
            for node in source_mat.node_tree.nodes:
                if node.type == "TEX_IMAGE" and node.image and "orm" in (node.image.name or "").lower():
                    img = node.image
                    break
        if img is not None:
            nt = mat.node_tree
            tex = nt.nodes.new("ShaderNodeTexImage")
            tex.image = img
            emit = nt.nodes.new("ShaderNodeEmission")
            nt.links.new(tex.outputs["Color"], emit.inputs["Color"])
            emit.inputs["Strength"].default_value = 1.0
            out = next(n for n in nt.nodes if n.type == "OUTPUT_MATERIAL")
            nt.links.new(emit.outputs["Emission"], out.inputs["Surface"])
            return mat
    bsdf.inputs["Base Color"].default_value = (0.5, 0.5, 1, 1)
    return mat


def set_lod_visibility(lod_keep):
    for obj in bpy.data.objects:
        if obj.type != "MESH":
            continue
        if obj.name == "MinePad":
            continue
        name = obj.name
        keep = True
        if name.startswith("LOD0") or name.startswith("LOD1") or name.startswith("LOD2"):
            keep = name.startswith(f"LOD{lod_keep}")
        obj.hide_render = not keep
        try:
            obj.hide_set(not keep)
        except Exception:
            pass


def render_path(camera, path, framing, target_roots, edge_dir=(1.0, 0.0)):
    scene = bpy.context.scene
    pose = apply_works_camera(camera, framing=framing, focus=(0.0, 0.0, 0.0), edge_dir=edge_dir)
    offset = Vector(pose["object_offset"])
    moved = []
    if offset.length > 1e-9:
        for obj in target_roots:
            if obj is None:
                continue
            obj.location = obj.location + offset
            moved.append(obj)
        bpy.context.view_layer.update()
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    scene.render.filepath = str(path)
    bpy.ops.render.render(write_still=True)
    sanitize_png(path)
    for obj in moved:
        obj.location = obj.location - offset
    bpy.context.view_layer.update()
    return pose


def measure_object_pixels(path: Path, pad_luma=0.06):
    img = bpy.data.images.load(str(path))
    arr = image_np(img)
    bpy.data.images.remove(img)
    luma = 0.2126 * arr[..., 0] + 0.7152 * arr[..., 1] + 0.0722 * arr[..., 2]
    mask = luma > pad_luma + 0.04
    if not mask.any():
        return {"px": 0, "bbox": None, "array": arr}
    ys, xs = np.nonzero(mask)
    return {
        "px": int(mask.sum()),
        "bbox": [int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max())],
        "width": int(xs.max() - xs.min() + 1),
        "height": int(ys.max() - ys.min() + 1),
        "array": arr,
    }


def write_1to1_crop(src_path: Path, dest: Path, pad=24):
    img = bpy.data.images.load(str(src_path))
    arr = image_np(img)
    bpy.data.images.remove(img)
    h, w = arr.shape[:2]
    luma = 0.2126 * arr[..., 0] + 0.7152 * arr[..., 1] + 0.0722 * arr[..., 2]
    mask = luma > 0.10
    if not mask.any():
        return None
    ys, xs = np.nonzero(mask)
    x0 = max(0, int(xs.min()) - pad)
    y0 = max(0, int(ys.min()) - pad)
    x1 = min(w, int(xs.max()) + pad + 1)
    y1 = min(h, int(ys.max()) + pad + 1)
    crop = arr[y0:y1, x0:x1]
    ch, cw = crop.shape[:2]
    name = f"_crop_{dest.stem}"
    if name in bpy.data.images:
        bpy.data.images.remove(bpy.data.images[name])
    out = bpy.data.images.new(name, width=cw, height=ch, alpha=True)
    out.pixels.foreach_set(np.ascontiguousarray(crop, dtype=np.float32).ravel())
    dest.parent.mkdir(parents=True, exist_ok=True)
    out.filepath_raw = str(dest)
    out.file_format = "PNG"
    out.save()
    sanitize_png(dest)
    bpy.data.images.remove(out)
    return {"crop": [x0, y0, x1, y1], "size": [cw, ch]}


def capture_stills(combined_glb: Path):
    reset_scene()
    bpy.ops.import_scene.gltf(filepath=str(combined_glb))
    camera, pad = setup_review_scene()
    root = bpy.data.objects.get(ROOT_NAME)
    meshes = [obj for obj in bpy.data.objects if obj.type == "MESH" and obj.name != "MinePad"]
    EVID_DIR.mkdir(parents=True, exist_ok=True)
    stills = {}
    roots = [
        obj for obj in bpy.data.objects
        if obj.parent is None and obj.type not in {"CAMERA", "LIGHT"}
    ]

    def snap(name, framing, lod, edge_dir=(1.0, 0.0)):
        set_lod_visibility(lod)
        pose = render_path(camera, EVID_DIR / name, framing, roots, edge_dir)
        stills[name] = str((EVID_DIR / name).relative_to(ROOT)).replace("\\", "/")
        return pose

    pose_top = snap("works_top.png", "works_top", 0)
    snap("works_edge.png", "works_edge", 0)
    snap("works_site.png", "works_site", 1)

    backups, _clay = override_clay(meshes)
    snap("works_top_clay.png", "works_top", 0)
    restore_mats(meshes, backups)

    # Grazing edge: boost grazing sun, clay-ish beauty on edge.
    graz = bpy.data.objects.get("Grazing")
    key = bpy.data.objects.get("Key")
    if graz and graz.data:
        graz.data.energy = 8.5
    if key and key.data:
        key.data.energy = 2.2
    snap("works_edge_grazing.png", "works_edge", 0, edge_dir=(0.85, 0.35))
    if graz and graz.data:
        graz.data.energy = 3.4
    if key and key.data:
        key.data.energy = 7.0

    # Isolation stills from LOD0 close camera.
    set_lod_visibility(0)
    src = None
    for obj in meshes:
        if obj.name.startswith("LOD0_refinery"):
            src = obj.data.materials[0] if obj.data.materials else None
            break
    iso_n = isolation_material("normal", src)
    iso_o = isolation_material("orm", src)
    iso_id = isolation_material("id", src)
    backups = {obj.name: [s.material for s in obj.material_slots] for obj in meshes}

    def apply_iso(mat):
        for obj in meshes:
            if obj.material_slots:
                obj.material_slots[0].material = mat
            else:
                obj.data.materials.append(mat)

    apply_iso(iso_n)
    snap("normal_isolation.png", "works_top", 0)
    apply_iso(iso_o)
    snap("orm_isolation.png", "works_top", 0)
    # Material ID: emission from ROLE_ID if atlas, else a dummy.
    id_mat = bpy.data.materials.new("IsoID")
    id_mat.use_nodes = True
    # Prefer the authored ID map if packed/loaded.
    id_img = None
    for img in bpy.data.images:
        if "refinery_lod0_id" in img.name or img.filepath.endswith("refinery_lod0_id.png"):
            id_img = img
            break
    id_path = TEX_DIR / "refinery_lod0_id.png"
    if id_img is None and id_path.exists():
        id_img = bpy.data.images.load(str(id_path))
    nt = id_mat.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    emit = nt.nodes.new("ShaderNodeEmission")
    if id_img is not None:
        tex = nt.nodes.new("ShaderNodeTexImage")
        tex.image = id_img
        nt.links.new(tex.outputs["Color"], emit.inputs["Color"])
    else:
        emit.inputs["Color"].default_value = (0.4, 0.3, 0.2, 1)
    emit.inputs["Strength"].default_value = 1.0
    nt.links.new(emit.outputs["Emission"], out.inputs["Surface"])
    apply_iso(id_mat)
    snap("id_or_material_id.png", "works_top", 0)
    restore_mats(meshes, backups)

    # Hook identity: small colored markers at hook empties, top view.
    colors = {"furnace_slit": (0.85, 0.15, 0.12), "stack_vent": (0.15, 0.75, 0.22), "lamp": (0.2, 0.45, 0.95)}
    markers = []
    for name, rgb in colors.items():
        hook = bpy.data.objects.get(name)
        loc = hook.matrix_world.translation.copy() if hook else Vector((0, 0, 0))
        bpy.ops.mesh.primitive_uv_sphere_add(radius=0.045, location=loc)
        mk = bpy.context.object
        mk.name = f"HookMarker_{name}"
        mat = bpy.data.materials.new(f"HookMat_{name}")
        bsdf = principled(mat)
        if "Emission Color" in bsdf.inputs:
            bsdf.inputs["Emission Color"].default_value = (*rgb, 1)
        if "Emission Strength" in bsdf.inputs:
            bsdf.inputs["Emission Strength"].default_value = 3.0
        bsdf.inputs["Base Color"].default_value = (*rgb, 1)
        mk.data.materials.append(mat)
        markers.append(mk)
        roots.append(mk)
    snap("hook_identity.png", "works_top", 0)
    for mk in markers:
        bpy.data.objects.remove(mk, do_unlink=True)

    # State diagnostic: raise slit emission.
    for obj in meshes:
        if "furnace_slit" in obj.name.lower() or "Slit" in obj.name or obj.name.endswith("_furnace_slit"):
            for slot in obj.material_slots:
                mat = slot.material
                if not mat or not mat.use_nodes:
                    continue
                for node in mat.node_tree.nodes:
                    if node.type == "BSDF_PRINCIPLED" and "Emission Strength" in node.inputs:
                        node.inputs["Emission Strength"].default_value = 1.0
                        if "Emission Color" in node.inputs:
                            node.inputs["Emission Color"].default_value = (1.0, 0.45, 0.12, 1)
    snap("state_emission.png", "works_top", 0)

    pixel_top = measure_object_pixels(EVID_DIR / "works_top.png")
    pixel_edge = measure_object_pixels(EVID_DIR / "works_edge.png")
    pixel_site = measure_object_pixels(EVID_DIR / "works_site.png")
    for key in ("array",):
        pixel_top.pop(key, None)
        pixel_edge.pop(key, None)
        pixel_site.pop(key, None)
    crops = {}
    for name in (
        "works_top.png", "works_edge.png", "works_site.png",
        "works_top_clay.png", "works_edge_grazing.png",
        "normal_isolation.png", "orm_isolation.png", "id_or_material_id.png",
        "hook_identity.png", "state_emission.png",
    ):
        src = EVID_DIR / name
        if src.exists():
            crops[name] = write_1to1_crop(src, EVID_DIR / f"{src.stem}_1to1.png")
    facts = {
        "resolution": [1920, 1080],
        "fovV": FOV_V_DEG,
        "cellWu": CELL_WU,
        "works_top": {
            "distance": pose_top["distance"],
            "pxPerCell": measured_px_per_cell(pose_top["distance"], 1080),
            "objectPx": pixel_top,
        },
        "works_edge": {"objectPx": pixel_edge, "objectOffsetApplied": True},
        "works_site": {
            "pxPerCell": measured_px_per_cell(works_pose("works_site")["distance"], 1080),
            "objectPx": pixel_site,
        },
        "crops1to1": crops,
    }
    return stills, facts


def write_contact_sheet():
    """Composite the three cited local stills. No geometry copied."""
    tiles = []
    tw, th = 640, 360
    for path in REF_IMAGES:
        if not path.exists():
            raise FileNotFoundError(path)
        img = bpy.data.images.load(str(path))
        w, h = img.size
        arr = image_np(img)
        bpy.data.images.remove(img)
        # Cover-scale into tile.
        scale = max(tw / float(w), th / float(h))
        nw, nh = max(1, int(round(w * scale))), max(1, int(round(h * scale)))
        ys = np.linspace(0, h - 1, nh)
        xs = np.linspace(0, w - 1, nw)
        yi = ys.astype(np.int32)
        xi = xs.astype(np.int32)
        resized = arr[yi][:, xi]
        y0 = max(0, (nh - th) // 2)
        x0 = max(0, (nw - tw) // 2)
        crop = resized[y0:y0 + th, x0:x0 + tw]
        if crop.shape[0] != th or crop.shape[1] != tw:
            pad = np.zeros((th, tw, 4), dtype=np.float32)
            pad[:crop.shape[0], :crop.shape[1]] = crop
            crop = pad
        if crop.shape[2] == 3:
            ones = np.ones((th, tw, 1), dtype=np.float32)
            crop = np.concatenate([crop, ones], axis=2)
        tiles.append(crop)
    gutter = 12
    header = 36
    W = tw * 3 + gutter * 4
    H = th + gutter * 2 + header
    sheet = np.zeros((H, W, 4), dtype=np.float32)
    sheet[..., 3] = 1.0
    sheet[..., 0:3] = 0.06
    x = gutter
    for tile in tiles:
        sheet[header:header + th, x:x + tw] = tile
        x += tw + gutter
    name = "_contact_sheet"
    if name in bpy.data.images:
        bpy.data.images.remove(bpy.data.images[name])
    img = bpy.data.images.new(name, width=W, height=H, alpha=True)
    img.pixels.foreach_set(np.ascontiguousarray(sheet, dtype=np.float32).ravel())
    REF_DIR.mkdir(parents=True, exist_ok=True)
    out = REF_DIR / "CONTACT_SHEET.png"
    img.filepath_raw = str(out)
    img.file_format = "PNG"
    img.save()
    sanitize_png(out)
    bpy.data.images.remove(img)
    return out


def export_uv_layout(obj, path: Path):
    """Rasterize unique UV0 edges. GPU uv.export_layout is illegal in background mode."""
    size = 1024
    canvas = np.zeros((size, size, 4), dtype=np.float32)
    canvas[..., 0:3] = 0.06
    canvas[..., 3] = 1.0
    uv_layer = obj.data.uv_layers.active
    if uv_layer is None:
        return
    mesh = obj.data
    try:
        mesh.calc_loop_triangles()
    except Exception:
        pass

    def draw_line(x0, y0, x1, y1):
        x0, y0, x1, y1 = int(x0), int(y0), int(x1), int(y1)
        steps = max(1, abs(x1 - x0), abs(y1 - y0))
        for i in range(steps + 1):
            t = i / steps
            x = int(round(x0 + (x1 - x0) * t))
            y = int(round(y0 + (y1 - y0) * t))
            if 0 <= x < size and 0 <= y < size:
                canvas[y, x] = (0.92, 0.86, 0.62, 1.0)

    tris = getattr(mesh, "loop_triangles", None)
    if tris:
        for tri in tris:
            pts = []
            for li in tri.loops:
                u, v = uv_layer.data[li].uv
                pts.append((u * (size - 1), v * (size - 1)))
            draw_line(*pts[0], *pts[1])
            draw_line(*pts[1], *pts[2])
            draw_line(*pts[2], *pts[0])
    write_pixels(path.stem, canvas, size, "sRGB")
    src = TEX_DIR / f"{path.stem}.png"
    path.parent.mkdir(parents=True, exist_ok=True)
    if src.exists() and src.resolve() != path.resolve():
        shutil.copy2(src, path)


def combine_lods(lod_paths, hook_locs, lod_reports):
    reset_scene()
    root = bpy.data.objects.new(ROOT_NAME, None)
    bpy.context.scene.collection.objects.link(root)
    root.empty_display_type = "PLAIN_AXES"
    root.empty_display_size = 0.14
    sockets = {
        "furnace_slit": add_empty("furnace_slit", hook_locs["furnace_slit"], bpy.context.scene.collection, root, 0.07),
        "stack_vent": add_empty("stack_vent", hook_locs["stack_vent"], bpy.context.scene.collection, root, 0.07),
        "lamp": add_empty("lamp", hook_locs["lamp"], bpy.context.scene.collection, root, 0.06),
    }
    mesh_names = []
    lod_tri = {0: 0, 1: 0, 2: 0}
    for lod, path in enumerate(lod_paths):
        before = set(bpy.data.objects)
        bpy.ops.import_scene.gltf(filepath=str(path))
        imported = [obj for obj in bpy.data.objects if obj not in before]
        for obj in imported:
            if obj.type != "MESH":
                try:
                    bpy.data.objects.remove(obj, do_unlink=True)
                except Exception:
                    pass
                continue
            raw = obj.name.split(".")[0]
            if "furnace_slit" in raw.lower() or raw.endswith("_furnace_slit") or "SlitLens" in raw or "Slit" in raw:
                obj.name = f"LOD{lod}_furnace_slit"
                parent_keep(obj, sockets["furnace_slit"])
            elif "lamp_lens" in raw.lower() or raw.endswith("_lamp_lens") or raw.endswith("_Lamp_Lens") or "Lamp_Lens" in raw:
                obj.name = f"LOD{lod}_lamp_lens"
                parent_keep(obj, sockets["lamp"])
            elif raw.startswith(f"LOD{lod}_refinery") or "refinery" in raw.lower():
                obj.name = f"LOD{lod}_refinery"
                parent_keep(obj, root)
            else:
                obj.name = f"LOD{lod}_{raw}"
                parent_keep(obj, root)
            obj["spacefaceLod"] = f"lod{lod}"
            lod_tri[lod] += count_tris(obj)
            mesh_names.append(obj.name)

    chull = bpy.data.objects.new("COLLISION_HULL", None)
    bpy.context.scene.collection.objects.link(chull)
    chull.empty_display_type = "CUBE"
    chull.empty_display_size = 1.0
    chull.scale = Vector((1.05, 1.05, 0.60))
    chull.location = Vector((0.0, 0.0, 0.60))
    chull["sf_collision"] = True
    chull["nonRender"] = True
    chull["spaceface"] = {"collision": True, "helper": True, "nonRender": True, "kind": "box"}
    parent_keep(chull, root)

    contract = {
        "contractVersion": 1,
        "assetId": ASSET_ID,
        "partId": ASSET_ID,
        "liveId": ASSET_ID,
        "slot": "place",
        "category": "works",
        "family": "asteroid_works",
        "packet": "PQ-131.04",
        "cycle": CYCLE,
        "role": "one-cell ore-roast refinery — furnace, rooted stack, saddle tank",
        "forward": "+X",
        "up": "+Y",
        "starboard": "+Z",
        "unit": "metre",
        "normalConvention": "OpenGL",
        "ormChannels": "R=AO,G=Roughness,B=Metallic",
        "textureCompression": "PNG-source",
        "textureAuthorship": "unique-UV0 mesh bake + authored 1024 PBR (structure/refractory/hotmetal/stack/tank/pipe/lamp)",
        "textureSize": TEX,
        "deliverableRole": "source_candidate",
        "lods": ["lod0", "lod1", "lod2"],
        "exportedLods": ["lod0", "lod1", "lod2"],
        "lodTriangles": {f"lod{k}": int(v) for k, v in lod_tri.items()},
        "triangleCount": int(lod_tri[0]),
        "sockets": list(HOOK_NAMES),
        "hooks": list(HOOK_NAMES),
        "rootNode": ROOT_NAME,
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
    PARTS_DIR.mkdir(parents=True, exist_ok=True)
    combined_works = SOURCE_DIR / "refinery.glb"
    combined_parts = PARTS_DIR / COMBINED_NAME
    tmp = SOURCE_DIR / "refinery.tmp.glb"
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
    sanitize_glb_floats(tmp)
    stamp_glb_contract(tmp, contract)
    if combined_works.exists():
        combined_works.unlink()
    shutil.move(str(tmp), str(combined_works))
    shutil.copy2(combined_works, combined_parts)
    inventory = {
        "assetId": ASSET_ID,
        "rootNode": ROOT_NAME,
        "combined": str(combined_works.relative_to(ROOT)).replace("\\", "/"),
        "partsSource": str(combined_parts.relative_to(ROOT)).replace("\\", "/"),
        "lodTriangles": contract["lodTriangles"],
        "hooks": list(HOOK_NAMES),
        "meshNames": sorted(mesh_names),
        "bytes": combined_works.stat().st_size,
        "sha256": sha256(combined_works),
        "disposition": "review_pending",
        "cycle": CYCLE,
    }
    (SOURCE_DIR / "refinery_inventory.json").write_text(json.dumps(inventory, indent=2) + "\n", encoding="utf-8")
    save_blend(SOURCE_DIR / "works_refinery.blend")
    return inventory, contract, combined_works, combined_parts


def run_visible_faces(glb: Path, json_out: Path):
    blender = bpy.app.binary_path
    script = TOOLS / "works_visible_faces.py"
    import subprocess
    json_out.parent.mkdir(parents=True, exist_ok=True)
    cmd = [
        blender, "--background", "--python", str(script), "--",
        "--glb", str(glb), "--json-out", str(json_out),
    ]
    proc = subprocess.run(cmd, capture_output=True, text=True)
    print(proc.stdout[-4000:] if proc.stdout else "")
    if proc.returncode != 0:
        print(proc.stderr[-2000:] if proc.stderr else "")
    return proc.returncode, json_out if json_out.exists() else None


def build_all():
    FAMILY.mkdir(parents=True, exist_ok=True)
    TEX_DIR.mkdir(parents=True, exist_ok=True)
    REF_DIR.mkdir(parents=True, exist_ok=True)
    EVID_DIR.mkdir(parents=True, exist_ok=True)

    reset_scene()
    contact = write_contact_sheet()
    print(f"contact sheet {contact}")

    lod_paths = []
    lod_reports = []
    hook_locs = {
        "furnace_slit": (FX, FY, WELL_FLOOR + 0.02),
        "stack_vent": (SX, SY, STACK_TOP),
        "lamp": (SX + 0.18, SY - 0.16, 0.86),
    }
    uv_layout_path = EVID_DIR / "uv0_layout.png"

    for lod in (0, 1, 2):
        reset_scene()
        collection = bpy.data.collections.new(f"Refinery_LOD{lod}")
        bpy.context.scene.collection.children.link(collection)
        mats = make_role_materials(lod)
        built = build_lod_geometry(lod, mats, collection)
        hook_locs["furnace_slit"] = tuple(built["slit_loc"])
        hook_locs["stack_vent"] = tuple(built["vent_loc"])
        hook_locs["lamp"] = tuple(built["lamp_loc"])
        tex_size = TEX if lod < 2 else 512
        body_low, bake_report = bake_and_author(lod, built["body"], built["high_extra"], collection, tex_size)
        ember = finish_emit_mesh(built["ember"], lod, "furnace_slit")
        lens = finish_emit_mesh(built["lens"], lod, "lamp_lens")
        if lod == 0:
            export_uv_layout(body_low, uv_layout_path)
        objects = [body_low, ember, lens]
        tris = sum(count_tris(o) for o in objects)
        if tris > TRI_BUDGET[lod]:
            raise RuntimeError(f"LOD{lod} triangles {tris} exceed budget {TRI_BUDGET[lod]}")
        bb = bbox_of(objects)
        if bb:
            mn, mx = bb["min"], bb["max"]
            if mx[0] - mn[0] > CELL_WU + 0.02 or mx[1] - mn[1] > CELL_WU + 0.02:
                raise RuntimeError(f"LOD{lod} footprint {bb['size']} exceeds cell {CELL_WU}")
            if mn[2] < -0.02:
                raise RuntimeError(f"LOD{lod} underside {mn[2]} below z=0")
        out = SOURCE_DIR / f"refinery_lod{lod}.glb"
        export_lod_glb(objects, lod, out)
        report = {
            "lod": lod,
            "triangles": tris,
            "budget": TRI_BUDGET[lod],
            "draws": len(objects),
            "bbox": bb,
            "path": str(out.relative_to(ROOT)).replace("\\", "/"),
            "bytes": out.stat().st_size,
            "sha256": sha256(out),
            **bake_report,
        }
        print(json.dumps({k: report[k] for k in ("lod", "triangles", "draws", "bytes")}, indent=2))
        lod_paths.append(out)
        lod_reports.append(report)

    inventory, contract, combined, parts = combine_lods(lod_paths, hook_locs, lod_reports)
    stills, pixel_facts = capture_stills(combined)
    vf_json = EVID_DIR / "works_visible_faces.json"
    vf_code, vf_path = run_visible_faces(parts, vf_json)
    inspection = inspect_glb(parts)

    hashes = {
        "cycle": CYCLE,
        "disposition": "review_pending",
        "rootNode": ROOT_NAME,
        "hooks": list(HOOK_NAMES),
        "partsGlb": str(parts.relative_to(ROOT)).replace("\\", "/"),
        "partsSha256": sha256(parts),
        "sourceGlb": inventory["combined"],
        "sourceSha256": inventory["sha256"],
        "lods": {f"lod{r['lod']}": {"path": r["path"], "sha256": r["sha256"], "triangles": r["triangles"]} for r in lod_reports},
        "textures": {f"lod{r['lod']}": r["maps"] for r in lod_reports},
        "blend": "assets/works/refinery/source/works_refinery.blend",
        "builder": "tools/blender/build_works_refinery.py",
    }
    (FAMILY / "HASHES.json").write_text(json.dumps(hashes, indent=2) + "\n", encoding="utf-8")

    vf = {}
    if vf_path and vf_path.exists():
        try:
            vf = json.loads(vf_path.read_text(encoding="utf-8"))
        except Exception:
            vf = {"path": str(vf_path.relative_to(ROOT)).replace("\\", "/")}

    epoch = {
        "schema": "spaceface.worksRefinery.cycle.v1",
        "assetId": ASSET_ID,
        "cycle": CYCLE,
        "disposition": "review_pending",
        "immutable": True,
        "rootNode": ROOT_NAME,
        "packet": "PQ-131.04",
        "reviewersLaunched": False,
        "targetCellWu": CELL_WU,
        "lods": lod_reports,
        "hooks": inspection["hooks"],
        "hookWorld": {k: list(v) for k, v in hook_locs.items()},
        "inspection": inspection,
        "inventory": inventory,
        "stills": stills,
        "pixelFacts": pixel_facts,
        "visibleFaces": vf,
        "visibleFacesExit": vf_code,
        "hashes": hashes,
        "blender": {
            "version": bpy.app.version_string,
            "binary": bpy.app.binary_path,
            "export": "ok",
            "render": "ok",
        },
        "budgets": {"triangles": TRI_BUDGET, "texture": TEX},
        "notes": (
            "Cycle 01 source candidate. Slit emission held low on beauty stills; "
            "state_emission.png shows 1.0. Independent review not launched."
        ),
    }
    (FAMILY / "evidence" / "cycle_001.json").write_text(json.dumps(epoch, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"ok": True, "sha256": hashes["partsSha256"], "lodTriangles": inspection["lodTriangles"], "hooks": inspection["hooks"]}, indent=2))
    return epoch


def main():
    args = argv_after()
    if "--contact-sheet-only" in args:
        reset_scene()
        path = write_contact_sheet()
        print(path)
        return
    if "--inspect" in args:
        glb = PARTS_DIR / COMBINED_NAME
        print(json.dumps(inspect_glb(glb), indent=2))
        return
    build_all()


if __name__ == "__main__":
    main()

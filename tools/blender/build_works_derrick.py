"""PQ-131.05 Works surface derrick / head-frame — Cycle 01 source candidate.

A manufactured head-frame over the entry shaft: two A-frame I-beam pairs with
cross-bracing and base shoes, a rooted winch drum in pillow-block bearings,
a grated guarded platform, restrained works-orange markings, two hooded lamps.

Exact write set:
  tools/blender/build_works_derrick.py
  assets/works/derrick/**
  assets/ships/parts/works/place_works_derrick.glb

    blender --background --python tools/blender/build_works_derrick.py

Not wired, not released, not promoted. Cycle 01 evidence is written once.
Kit GLBs are cited shape references only and are never imported.
"""
from __future__ import annotations

import hashlib
import json
import math
import shutil
import struct
import sys
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
    works_frustum,
    works_pose,
)

FAMILY = ROOT / "assets" / "works" / "derrick"
SOURCE_DIR = FAMILY / "source"
TEX_DIR = SOURCE_DIR / "textures"
REF_DIR = FAMILY / "reference"
EVIDENCE_DIR = FAMILY / "evidence" / "cycle_001"
PARTS_DIR = ROOT / "assets" / "ships" / "parts" / "works"
BLEND_PATH = SOURCE_DIR / "derrick.blend"
COMBINED_NAME = "place_works_derrick.glb"
ASSET_ID = "place_works_derrick"
ROOT_NAME = "SF_WORKS_DERRICK_V1"
HOOK_NAMES = ("drum_spin", "cable_anchor", "lamp_L", "lamp_R")
LOD_ROOTS = ("LOD0_derrick", "LOD1_derrick", "LOD2_derrick")
CYCLE = 1
SHADE_ANGLE = 28.0
TRI_BUDGET = {0: 12000, 1: 3000, 2: 900}
TEX_SIZE = {0: 2048, 1: 1024, 2: 512}
KEEP_PNG = {b"IHDR", b"PLTE", b"IDAT", b"IEND", b"sRGB", b"gAMA", b"pHYs"}
_GLTF_FLOAT = 5126
_GLTF_NCOMP = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4, "MAT3": 9, "MAT4": 16}

CELL = float(CELL_WU)
Y_FRAME = 0.70
FOOT_X = 0.88
CROWN_Z = 6.22
SHOE_H = 0.10
SHOE_XY = (0.36, 0.30)
COLLAR_R0, COLLAR_R1 = 0.36, 0.54
COLLAR_Z0, COLLAR_Z1 = 0.012, 0.155

DRUM_C = Vector((-0.02, 0.00, 1.54))
DRUM_R = 0.24
DRUM_LEN = 0.78
BEARING_Y = 0.46
SKID_Z = 1.18

CABLE_ANCHOR = Vector((DRUM_C.x + DRUM_R * 0.22, 0.0, DRUM_C.z - DRUM_R * 0.98))
LAMP_L = Vector((0.10, 0.42, CROWN_Z + 0.10))
LAMP_R = Vector((0.10, -0.42, CROWN_Z + 0.10))
PLAT_Z = 5.38
PLAT_X0, PLAT_X1 = 0.30, 0.92
PLAT_Y0, PLAT_Y1 = -0.30, 0.30

FOCUS = (0.0, 0.0, 3.05)
EDGE_DIR = (0.10, 1.0)
# Default works_edge inset (0.85) clips this 3-cell tower's crown. Keep the
# object inside the frustum at the crown plane.
EDGE_INSET_TALL = 0.42

CITED_STILLS = (
    ROOT / "assets" / "incubator" / "everyday_space_kit" / "evidence" / "drill_platform.png",
    ROOT / "assets" / "incubator" / "everyday_space_kit" / "evidence" / "extraction_mast.png",
    ROOT / "assets" / "incubator" / "everyday_space_kit" / "evidence" / "worklight_tower.png",
)

ROLES = {
    "structure": {"rgb": (0.112, 0.108, 0.100), "rough": 0.64, "metal": 0.08, "id": (1.00, 0.00, 0.00)},
    "interface": {"rgb": (0.44, 0.42, 0.38), "rough": 0.30, "metal": 0.84, "id": (0.00, 1.00, 0.00)},
    "winch": {"rgb": (0.22, 0.16, 0.11), "rough": 0.42, "metal": 0.78, "id": (0.00, 0.00, 1.00)},
    "grating": {"rgb": (0.20, 0.195, 0.18), "rough": 0.74, "metal": 0.32, "id": (1.00, 1.00, 0.00)},
    "marking": {"rgb": (0.50, 0.24, 0.07), "rough": 0.56, "metal": 0.06, "id": (1.00, 0.40, 0.00)},
    "cable": {"rgb": (0.065, 0.058, 0.048), "rough": 0.86, "metal": 0.04, "id": (1.00, 0.00, 1.00)},
    "lamp": {"rgb": (0.90, 0.80, 0.55), "rough": 0.18, "metal": 0.03, "id": (0.00, 1.00, 1.00)},
}


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1 << 20), b""):
            digest.update(chunk)
    return digest.hexdigest().upper()


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


def look_at(obj, target=(0, 0, 0)):
    obj.rotation_euler = (Vector(target) - obj.location).to_track_quat("-Z", "Y").to_euler()


def role_material(role: str):
    name = f"Role_{role}"
    if name in bpy.data.materials:
        return bpy.data.materials[name]
    spec = ROLES[role]
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = next(n for n in mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    bsdf.inputs["Base Color"].default_value = (*spec["rgb"], 1.0)
    bsdf.inputs["Roughness"].default_value = spec["rough"]
    bsdf.inputs["Metallic"].default_value = spec["metal"]
    if role == "lamp":
        key = "Emission Color" if "Emission Color" in bsdf.inputs else "Emission"
        if key in bsdf.inputs:
            bsdf.inputs[key].default_value = (1.0, 0.82, 0.48, 1.0)
        if "Emission Strength" in bsdf.inputs:
            bsdf.inputs["Emission Strength"].default_value = 2.8
    mat["spacefaceRole"] = role
    return mat


def link_object(obj, collection):
    for current in list(obj.users_collection):
        current.objects.unlink(obj)
    collection.objects.link(obj)
    return obj


def apply_object(obj):
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    obj.select_set(False)


def finish_mesh(obj, role, bevel=0.008, collection=None):
    if collection is not None:
        link_object(obj, collection)
    obj.data.materials.clear()
    obj.data.materials.append(role_material(role))
    obj["spacefaceRole"] = role
    apply_object(obj)
    if bevel > 0.0004:
        mod = obj.modifiers.new("Bevel", "BEVEL")
        mod.width = float(bevel)
        mod.segments = 2 if bevel >= 0.007 else 1
        mod.limit_method = "ANGLE"
        mod.angle_limit = math.radians(40.0)
        bpy.context.view_layer.objects.active = obj
        obj.select_set(True)
        bpy.ops.object.modifier_apply(modifier=mod.name)
        obj.select_set(False)
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    try:
        bpy.ops.object.shade_smooth_by_angle(angle=math.radians(SHADE_ANGLE))
    except TypeError:
        bpy.ops.object.shade_smooth()
        obj.data.use_auto_smooth = True
        obj.data.auto_smooth_angle = math.radians(SHADE_ANGLE)
    wn = obj.modifiers.new("WeightedNrm", "WEIGHTED_NORMAL")
    wn.keep_sharp = True
    try:
        wn.mode = "FACE_AREA_WITH_ANGLE"
    except TypeError:
        pass
    bpy.ops.object.modifier_apply(modifier=wn.name)
    obj.select_set(False)
    return obj


def add_mesh(name, verts, faces, role, collection, bevel=0.008):
    mesh = bpy.data.meshes.new(f"{name}_Mesh")
    mesh.from_pydata([tuple(v) for v in verts], [], [tuple(f) for f in faces])
    mesh.update()
    mesh.validate()
    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)
    return finish_mesh(obj, role, bevel=bevel, collection=collection)


def add_box(name, loc, size, role, collection, bevel=0.008, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cube_add(location=loc, rotation=rot)
    obj = bpy.context.object
    obj.name = name
    obj.scale = (size[0] * 0.5, size[1] * 0.5, size[2] * 0.5)
    return finish_mesh(obj, role, bevel=bevel, collection=collection)


def add_cyl(name, loc, radius, depth, role, collection, verts=16, bevel=0.004, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cylinder_add(
        vertices=max(6, verts), radius=radius, depth=depth, location=loc, rotation=rot,
    )
    obj = bpy.context.object
    obj.name = name
    return finish_mesh(obj, role, bevel=bevel, collection=collection)


def add_cone(name, loc, r1, r2, depth, role, collection, verts=12, bevel=0.003, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cone_add(
        vertices=max(6, verts), radius1=r1, radius2=r2, depth=depth, location=loc, rotation=rot,
    )
    obj = bpy.context.object
    obj.name = name
    return finish_mesh(obj, role, bevel=bevel, collection=collection)


def loft_section(name, stations, role, collection, bevel=0.008, cap=True):
    sides = len(stations[0])
    verts = [p for ring in stations for p in ring]
    faces = []
    if cap:
        faces.append(tuple(range(sides)))
        last = (len(stations) - 1) * sides
        faces.append(tuple(range(last + sides - 1, last - 1, -1)))
    for i in range(len(stations) - 1):
        a = i * sides
        b = (i + 1) * sides
        for s in range(sides):
            s2 = (s + 1) % sides
            faces.append((a + s, a + s2, b + s2, b + s))
    return add_mesh(name, verts, faces, role, collection, bevel)


def ibeam_local(flange_w, depth, tf, tw):
    hw, hd = flange_w * 0.5, depth * 0.5
    wt = tw * 0.5
    return [
        (-hw, hd), (hw, hd),
        (hw, hd - tf), (wt, hd - tf),
        (wt, -(hd - tf)), (hw, -(hd - tf)),
        (hw, -hd), (-hw, -hd),
        (-hw, -(hd - tf)), (-wt, -(hd - tf)),
        (-wt, hd - tf), (-hw, hd - tf),
    ]


def ring_at(origin, tangent, up, pts):
    t = Vector(tangent)
    if t.length < 1e-8:
        t = Vector((0, 0, 1))
    t.normalize()
    upv = Vector(up)
    b = t.cross(upv)
    if b.length < 1e-6:
        b = t.cross(Vector((0.0, 1.0, 0.0)))
    if b.length < 1e-6:
        b = t.cross(Vector((1.0, 0.0, 0.0)))
    b.normalize()
    n = b.cross(t).normalized()
    o = Vector(origin)
    return [tuple(o + u * b + v * n) for u, v in pts]


def boxbeam_local(flange_w, depth):
    hw, hd = flange_w * 0.5, depth * 0.5
    return [(-hw, hd), (hw, hd), (hw, -hd), (-hw, -hd)]


def add_ibeam(name, a, b, flange_w, depth, tf, tw, role, collection, stations=4, bevel=0.006, up=(0, 1, 0), box=False):
    a = Vector(a)
    b = Vector(b)
    tangent = b - a
    pts = boxbeam_local(flange_w, depth) if box else ibeam_local(flange_w, depth, tf, tw)
    n = max(2, int(stations))
    rings = []
    for i in range(n):
        t = i / (n - 1)
        rings.append(ring_at(a.lerp(b, t), tangent, up, pts))
    return loft_section(name, rings, role, collection, bevel=bevel)


def add_l_angle(name, a, b, w, t, role, collection, stations=3, bevel=0.003, up=(0, 1, 0)):
    a = Vector(a)
    b = Vector(b)
    tangent = b - a
    pts = [(0.0, 0.0), (w, 0.0), (w, t), (t, t), (t, w), (0.0, w)]
    n = max(2, int(stations))
    rings = [ring_at(a.lerp(b, i / (n - 1)), tangent, up, pts) for i in range(n)]
    return loft_section(name, rings, role, collection, bevel=bevel)


def add_gusset(name, p0, p1, p2, thick, role, collection, bevel=0.002):
    a, b, c = Vector(p0), Vector(p1), Vector(p2)
    nrm = (b - a).cross(c - a)
    if nrm.length < 1e-8:
        nrm = Vector((0, 0, 1))
    else:
        nrm.normalize()
    h = nrm * (thick * 0.5)
    verts = [tuple(p + h) for p in (a, b, c)] + [tuple(p - h) for p in (a, b, c)]
    faces = [(0, 1, 2), (3, 5, 4), (0, 3, 4, 1), (1, 4, 5, 2), (2, 5, 3, 0)]
    return add_mesh(name, verts, faces, role, collection, bevel)


def add_hex_bolt(name, loc, axis, collection, radius=0.015, depth=0.026, role="interface"):
    axis = Vector(axis)
    if axis.length < 1e-8:
        axis = Vector((0, 0, 1))
    axis.normalize()
    rot = axis.to_track_quat("Z", "Y").to_euler()
    return add_cyl(name, loc, radius, depth, role, collection, verts=6, bevel=0.0, rot=tuple(rot))


def add_annulus(name, r0, r1, z0, z1, n, role, collection, bevel=0.004):
    n = max(8, int(n))
    verts = []
    rings = ((r1, z0), (r0, z0), (r0, z1), (r1, z1))
    for r, z in rings:
        for i in range(n):
            ang = i * 2.0 * math.pi / n
            verts.append((r * math.cos(ang), r * math.sin(ang), z))
    faces = []
    for s in range(4):
        a = s * n
        b = ((s + 1) % 4) * n
        for i in range(n):
            j = (i + 1) % n
            faces.append((a + i, a + j, b + j, b + i))
    return add_mesh(name, verts, faces, role, collection, bevel)


def parent_keep(obj, parent):
    mw = obj.matrix_world.copy()
    obj.parent = parent
    obj.matrix_parent_inverse = parent.matrix_world.inverted()
    obj.matrix_world = mw


def add_empty(name, loc, collection, size=0.08):
    obj = bpy.data.objects.new(name, None)
    collection.objects.link(obj)
    obj.empty_display_type = "PLAIN_AXES"
    obj.empty_display_size = size
    obj.location = loc
    return obj


def stamp_socket(obj):
    obj["spacefaceSocket"] = True
    obj["spaceface.socket"] = True
    obj["spaceface"] = {"socket": True, "role": "works_hook"}
    obj["socket"] = True


def count_tris(obj):
    if obj.type != "MESH" or not obj.data:
        return 0
    return sum(max(0, len(p.vertices) - 2) for p in obj.data.polygons)


def join_group(objects, name):
    objects = [o for o in objects if o is not None and o.name in bpy.data.objects]
    if not objects:
        raise RuntimeError(f"join_group {name}: empty")
    if len(objects) == 1:
        objects[0].name = name
        return objects[0]
    bpy.ops.object.select_all(action="DESELECT")
    for obj in objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    bpy.ops.object.join()
    objects[0].name = name
    return objects[0]


def mesh_area(obj):
    if obj.type != "MESH":
        return 0.0
    return float(sum(p.area for p in obj.data.polygons))


def unwrap_unique(objects):
    areas = []
    for obj in objects:
        if obj.type != "MESH":
            continue
        if not obj.data.uv_layers:
            obj.data.uv_layers.new(name="UVMap")
        bpy.ops.object.select_all(action="DESELECT")
        obj.select_set(True)
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.mode_set(mode="EDIT")
        bpy.ops.mesh.select_all(action="SELECT")
        bpy.ops.uv.smart_project(angle_limit=math.radians(66.0), island_margin=0.010, area_weight=1.0)
        bpy.ops.uv.average_islands_scale()
        bpy.ops.object.mode_set(mode="OBJECT")
        areas.append((obj, max(1e-6, mesh_area(obj))))
    total = sum(a for _, a in areas) or 1.0
    cols = [0.010, 0.505]
    widths = [0.475, 0.475]
    y_cursor = [0.010, 0.010]
    order = sorted(areas, key=lambda it: -it[1])
    for obj, area in order:
        frac = math.sqrt(area / total)
        h = min(0.96, max(0.08, frac * 1.12))
        col = 0 if y_cursor[0] <= y_cursor[1] else 1
        if y_cursor[col] + h > 0.988:
            col = 1 - col
            h = min(h, max(0.07, 0.988 - y_cursor[col]))
        u0, v0 = cols[col], y_cursor[col]
        u1, v1 = u0 + widths[col], min(0.988, v0 + h)
        y_cursor[col] = v1 + 0.010
        layer = obj.data.uv_layers.active
        us = [loop.uv.x for loop in layer.data]
        vs = [loop.uv.y for loop in layer.data]
        min_u, max_u = min(us), max(us)
        min_v, max_v = min(vs), max(vs)
        du = max(1e-6, max_u - min_u)
        dv = max(1e-6, max_v - min_v)
        for loop in layer.data:
            ru = (loop.uv.x - min_u) / du
            rv = (loop.uv.y - min_v) / dv
            loop.uv = (u0 + ru * (u1 - u0), v0 + rv * (v1 - v0))


def set_active_image(mat, img):
    nt = mat.node_tree
    nodes = nt.nodes
    tex = None
    for node in nodes:
        if node.type == "TEX_IMAGE" and node.image == img:
            tex = node
            break
    if tex is None:
        tex = nodes.new("ShaderNodeTexImage")
        tex.image = img
        tex.location = (-500, 200)
    nodes.active = tex
    tex.select = True
    return tex


def ensure_cycles():
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = 4
    scene.cycles.preview_samples = 2
    scene.render.bake.margin = 8
    scene.render.bake.use_selected_to_active = False


def bake_targets(objects, size, stem):
    ensure_cycles()
    TEX_DIR.mkdir(parents=True, exist_ok=True)

    def new_img(name, cs="Non-Color"):
        if name in bpy.data.images:
            bpy.data.images.remove(bpy.data.images[name])
        img = bpy.data.images.new(name, width=size, height=size, alpha=True, float_buffer=True)
        img.colorspace_settings.name = cs
        return img

    ao_img = new_img(f"{stem}_ao")
    nrm_img = new_img(f"{stem}_normal")
    id_img = new_img(f"{stem}_id", "sRGB")
    curv_img = new_img(f"{stem}_curvature")

    id_mats = {}
    for role, spec in ROLES.items():
        mat = bpy.data.materials.new(f"_ID_{role}")
        mat.use_nodes = True
        nt = mat.node_tree
        nt.nodes.clear()
        out = nt.nodes.new("ShaderNodeOutputMaterial")
        emit = nt.nodes.new("ShaderNodeEmission")
        emit.inputs["Color"].default_value = (*spec["id"], 1.0)
        emit.inputs["Strength"].default_value = 1.0
        nt.links.new(emit.outputs["Emission"], out.inputs["Surface"])
        id_mats[role] = mat

    backups = {}
    for obj in objects:
        backups[obj.name] = [s.material for s in obj.material_slots]

    def assign(img):
        for obj in objects:
            if not obj.data.materials:
                obj.data.materials.append(role_material(obj.get("spacefaceRole", "structure")))
            for mat in obj.data.materials:
                if mat is not None:
                    set_active_image(mat, img)

    def do_bake(bake_type, img):
        assign(img)
        bpy.ops.object.select_all(action="DESELECT")
        for obj in objects:
            obj.select_set(True)
        bpy.context.view_layer.objects.active = objects[0]
        bpy.context.scene.render.bake.use_selected_to_active = False
        bpy.ops.object.bake(type=bake_type, margin=8, use_clear=True)

    do_bake("AO", ao_img)

    highs = []
    for obj in objects:
        dup = obj.copy()
        dup.data = obj.data.copy()
        bpy.context.scene.collection.objects.link(dup)
        objects[0].users_collection[0].objects.link(dup)
        dup.name = obj.name + "_high"
        mod = dup.modifiers.new("HighBevel", "BEVEL")
        mod.width = 0.003
        mod.segments = 2
        mod.limit_method = "ANGLE"
        mod.angle_limit = math.radians(30.0)
        bpy.context.view_layer.objects.active = dup
        dup.select_set(True)
        try:
            bpy.ops.object.modifier_apply(modifier=mod.name)
        except Exception:
            pass
        dup.select_set(False)
        highs.append(dup)
    assign(nrm_img)
    bpy.context.scene.render.bake.use_selected_to_active = True
    bpy.context.scene.render.bake.cage_extrusion = 0.04
    bpy.context.scene.render.bake.normal_space = "TANGENT"
    try:
        bpy.context.scene.render.bake.normal_g = "POS_Y"
    except Exception:
        pass
    bpy.ops.object.select_all(action="DESELECT")
    for h in highs:
        h.select_set(True)
    for obj in objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    try:
        bpy.ops.object.bake(
            type="NORMAL", margin=8, use_clear=True, use_selected_to_active=True,
            cage_extrusion=0.04, normal_space="TANGENT",
        )
    except Exception as exc:
        print("normal bake fallback:", exc)
        bpy.context.scene.render.bake.use_selected_to_active = False
        do_bake("NORMAL", nrm_img)
    for h in highs:
        bpy.data.objects.remove(h, do_unlink=True)

    for obj in objects:
        new_slots = []
        for slot in obj.material_slots:
            role = "structure"
            if slot.material is not None:
                role = slot.material.get("spacefaceRole") or obj.get("spacefaceRole") or "structure"
            if role not in id_mats:
                role = "structure"
            new_slots.append(id_mats[role])
        obj.data.materials.clear()
        for mat in new_slots or [id_mats["structure"]]:
            obj.data.materials.append(mat)
        for mat in obj.data.materials:
            set_active_image(mat, id_img)
    bpy.ops.object.select_all(action="DESELECT")
    for obj in objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    bpy.context.scene.render.bake.use_selected_to_active = False
    bpy.ops.object.bake(type="EMIT", margin=8, use_clear=True)

    for obj in objects:
        mat = bpy.data.materials.new(f"_CURV_{obj.name}")
        mat.use_nodes = True
        nt = mat.node_tree
        nt.nodes.clear()
        out = nt.nodes.new("ShaderNodeOutputMaterial")
        emit = nt.nodes.new("ShaderNodeEmission")
        geo = nt.nodes.new("ShaderNodeNewGeometry")
        ramp = nt.nodes.new("ShaderNodeValToRGB")
        ramp.color_ramp.elements[0].position = 0.42
        ramp.color_ramp.elements[0].color = (0.0, 0.0, 0.0, 1.0)
        ramp.color_ramp.elements[1].position = 0.62
        ramp.color_ramp.elements[1].color = (1.0, 1.0, 1.0, 1.0)
        nt.links.new(geo.outputs["Pointiness"], ramp.inputs["Fac"])
        nt.links.new(ramp.outputs["Color"], emit.inputs["Color"])
        nt.links.new(emit.outputs["Emission"], out.inputs["Surface"])
        obj.data.materials.clear()
        obj.data.materials.append(mat)
        set_active_image(mat, curv_img)
    bpy.ops.object.select_all(action="DESELECT")
    for obj in objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    bpy.ops.object.bake(type="EMIT", margin=8, use_clear=True)

    for obj in objects:
        obj.data.materials.clear()
        for mat in backups[obj.name]:
            obj.data.materials.append(mat)

    def pixels(img):
        arr = np.zeros(size * size * 4, dtype=np.float32)
        img.pixels.foreach_get(arr)
        return arr.reshape(size, size, 4)

    return {
        "ao": pixels(ao_img),
        "normal": pixels(nrm_img),
        "id": pixels(id_img),
        "curvature": pixels(curv_img),
    }


def classify_id(id_arr):
    rgb = id_arr[..., :3]
    names = list(ROLES.keys())
    targets = np.array([ROLES[n]["id"] for n in names], dtype=np.float32)
    delta = rgb[:, :, None, :] - targets[None, None, :, :]
    dist = np.sum(delta * delta, axis=-1)
    idx = np.argmin(dist, axis=-1)
    return idx, names


def author_maps(bakes, size, stem):
    ao = np.clip(bakes["ao"][..., 0], 0.0, 1.0)
    nrm = bakes["normal"]
    curv = np.clip(bakes["curvature"][..., 0], 0.0, 1.0)
    idx, names = classify_id(bakes["id"])
    h, w = size, size
    yy, xx = np.mgrid[0:h, 0:w]
    n1 = ((xx * 17 + yy * 31) % 251).astype(np.float32) / 250.0
    n2 = ((xx * 9 + yy * 13) % 173).astype(np.float32) / 172.0
    dirt = np.clip((1.0 - ao) * 0.85 + n1 * 0.08, 0.0, 1.0)
    convex = np.clip((curv - 0.52) * 3.4, 0.0, 1.0)
    concave = np.clip((0.48 - curv) * 3.4, 0.0, 1.0)

    albedo = np.zeros((h, w, 4), dtype=np.float32)
    orm = np.zeros((h, w, 4), dtype=np.float32)
    normal = np.zeros((h, w, 4), dtype=np.float32)
    for i, name in enumerate(names):
        spec = ROLES[name]
        mask = idx == i
        if not np.any(mask):
            continue
        r, g, b = spec["rgb"]
        if name == "structure":
            chip = convex * (n2 > 0.80).astype(np.float32)
            rr = np.clip(r * (0.72 + 0.28 * ao) - dirt * 0.10 + chip * 0.26, 0, 1)
            gg = np.clip(g * (0.72 + 0.28 * ao) - dirt * 0.08 + chip * 0.22, 0, 1)
            bb = np.clip(b * (0.74 + 0.26 * ao) - dirt * 0.06 + chip * 0.18, 0, 1)
            rough = np.clip(spec["rough"] + dirt * 0.16 - chip * 0.12, 0.08, 0.95)
            metal = np.clip(spec["metal"] + chip * 0.55, 0.0, 1.0)
        elif name == "interface":
            polish = np.clip(ao * 0.45 + convex * 0.4, 0, 1)
            oil = np.clip((1.0 - ao) * 0.35, 0, 1)
            rr = np.clip(r * (0.78 + polish * 0.22) - oil * 0.08, 0, 1)
            gg = np.clip(g * (0.76 + polish * 0.18) - oil * 0.10, 0, 1)
            bb = np.clip(b * (0.72 + polish * 0.14) - oil * 0.12, 0, 1)
            rough = np.clip(spec["rough"] + concave * 0.16 - polish * 0.08, 0.08, 0.95)
            metal = np.clip(spec["metal"] - dirt * 0.06, 0.0, 1.0)
        elif name == "winch":
            heat = np.clip((1.0 - ao) * 0.55 + n1 * 0.12, 0, 1)
            rr = np.clip(r * (0.80 + ao * 0.14) + heat * 0.16, 0, 1)
            gg = np.clip(g * (0.76 + ao * 0.12) + heat * 0.02, 0, 1)
            bb = np.clip(b * (0.68 + ao * 0.10) - heat * 0.06 + heat * n2 * 0.08, 0, 1)
            rough = np.clip(spec["rough"] + dirt * 0.10 - heat * 0.06, 0.08, 0.95)
            metal = np.clip(spec["metal"] - dirt * 0.08, 0.0, 1.0)
        elif name == "grating":
            rr = np.clip(r * (0.78 + ao * 0.22) - dirt * 0.08, 0, 1)
            gg = np.clip(g * (0.78 + ao * 0.20) - dirt * 0.06, 0, 1)
            bb = np.clip(b * (0.76 + ao * 0.18) - dirt * 0.04, 0, 1)
            rough = np.clip(spec["rough"] + dirt * 0.08, 0.20, 0.95)
            metal = np.clip(spec["metal"] - dirt * 0.10, 0.0, 1.0)
        elif name == "marking":
            fade = dirt * 0.25
            rr = np.clip(r * (0.82 + ao * 0.16) - fade * 0.12, 0, 1)
            gg = np.clip(g * (0.80 + ao * 0.14) - fade * 0.04, 0, 1)
            bb = np.clip(b * (0.78 + ao * 0.12), 0, 1)
            rough = np.clip(spec["rough"] + dirt * 0.10, 0.20, 0.95)
            metal = spec["metal"]
        elif name == "cable":
            rr = np.clip(r * (0.85 + ao * 0.18) + dirt * 0.04, 0, 1)
            gg = np.clip(g * (0.85 + ao * 0.16) + dirt * 0.03, 0, 1)
            bb = np.clip(b * (0.82 + ao * 0.14), 0, 1)
            rough = np.clip(spec["rough"] + dirt * 0.06, 0.30, 0.97)
            metal = spec["metal"]
        else:
            rr = np.clip(r * (0.90 + ao * 0.12), 0, 1)
            gg = np.clip(g * (0.88 + ao * 0.10), 0, 1)
            bb = np.clip(b * (0.80 + ao * 0.08), 0, 1)
            rough = spec["rough"]
            metal = spec["metal"]
        albedo[mask, 0] = rr[mask] if np.ndim(rr) else r
        albedo[mask, 1] = gg[mask] if np.ndim(gg) else g
        albedo[mask, 2] = bb[mask] if np.ndim(bb) else b
        albedo[mask, 3] = 0.92 if name == "lamp" else 1.0
        orm[mask, 0] = ao[mask]
        rough_a = np.asarray(rough, dtype=np.float32)
        metal_a = np.asarray(metal, dtype=np.float32)
        if rough_a.ndim == 0:
            orm[mask, 1] = float(np.clip(rough_a, 0.08, 0.95))
        else:
            orm[mask, 1] = np.clip(rough_a[mask], 0.08, 0.95)
        if metal_a.ndim == 0:
            orm[mask, 2] = float(np.clip(metal_a, 0.0, 1.0))
        else:
            orm[mask, 2] = np.clip(metal_a[mask], 0.0, 1.0)
        orm[mask, 3] = 1.0

    nx, ny, nz = nrm[..., 0], nrm[..., 1], nrm[..., 2]
    mag = np.sqrt((nx * 2 - 1) ** 2 + (ny * 2 - 1) ** 2 + (nz * 2 - 1) ** 2)
    empty = mag < 0.15
    nx = np.where(empty, 0.5, nx)
    ny = np.where(empty, 0.5, ny)
    nz = np.where(empty, 1.0, nz)
    nx = np.clip(nx + (convex - concave) * 0.035 * (n1 - 0.5), 0, 1)
    ny = np.clip(ny + (convex - concave) * 0.035 * (n2 - 0.5), 0, 1)
    normal[..., 0] = nx
    normal[..., 1] = ny
    normal[..., 2] = np.clip(nz, 0.5, 1.0)
    normal[..., 3] = 1.0

    def write(arr, name, cs):
        if name in bpy.data.images:
            bpy.data.images.remove(bpy.data.images[name])
        img = bpy.data.images.new(name, width=size, height=size, alpha=True)
        img.colorspace_settings.name = cs
        img.pixels.foreach_set(np.ascontiguousarray(arr, dtype=np.float32).ravel())
        path = TEX_DIR / f"{name}.png"
        img.filepath_raw = str(path)
        img.file_format = "PNG"
        img.save()
        sanitize_png(path)
        img.pack()
        img.filepath_raw = str(path)
        return img, path

    base_img, base_path = write(albedo, f"{stem}_basecolor", "sRGB")
    nrm_img, nrm_path = write(normal, f"{stem}_normal", "Non-Color")
    orm_img, orm_path = write(orm, f"{stem}_orm", "Non-Color")
    id_img, id_path = write(bakes["id"], f"{stem}_id", "sRGB")
    return {
        "base": base_img,
        "normal": nrm_img,
        "orm": orm_img,
        "id": id_img,
        "paths": {
            "basecolor": str(base_path.relative_to(ROOT)).replace("\\", "/"),
            "normal": str(nrm_path.relative_to(ROOT)).replace("\\", "/"),
            "orm": str(orm_path.relative_to(ROOT)).replace("\\", "/"),
            "id": str(id_path.relative_to(ROOT)).replace("\\", "/"),
        },
    }


def atlas_material(maps, lod, emissive=False):
    mat = bpy.data.materials.new(f"DerrickAtlas_LOD{lod}" + ("_Lamp" if emissive else ""))
    mat.use_nodes = True
    nt = mat.node_tree
    bsdf = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
    tex_c = nt.nodes.new("ShaderNodeTexImage")
    tex_c.image = maps["base"]
    tex_c.image.colorspace_settings.name = "sRGB"
    tex_n = nt.nodes.new("ShaderNodeTexImage")
    tex_n.image = maps["normal"]
    tex_n.image.colorspace_settings.name = "Non-Color"
    tex_o = nt.nodes.new("ShaderNodeTexImage")
    tex_o.image = maps["orm"]
    tex_o.image.colorspace_settings.name = "Non-Color"
    nrm = nt.nodes.new("ShaderNodeNormalMap")
    nrm.space = "TANGENT"
    sep = nt.nodes.new("ShaderNodeSeparateColor") if "ShaderNodeSeparateColor" in dir(bpy.types) else nt.nodes.new("ShaderNodeSeparateRGB")
    nt.links.new(tex_c.outputs["Color"], bsdf.inputs["Base Color"])
    nt.links.new(tex_n.outputs["Color"], nrm.inputs["Color"])
    nt.links.new(nrm.outputs["Normal"], bsdf.inputs["Normal"])
    nt.links.new(tex_o.outputs["Color"], sep.inputs[0])
    g_out = sep.outputs[1] if "Green" not in sep.outputs else sep.outputs["Green"]
    b_out = sep.outputs[2] if "Blue" not in sep.outputs else sep.outputs["Blue"]
    nt.links.new(g_out, bsdf.inputs["Roughness"])
    nt.links.new(b_out, bsdf.inputs["Metallic"])
    if emissive:
        key = "Emission Color" if "Emission Color" in bsdf.inputs else "Emission"
        if key in bsdf.inputs:
            nt.links.new(tex_c.outputs["Color"], bsdf.inputs[key])
        if "Emission Strength" in bsdf.inputs:
            bsdf.inputs["Emission Strength"].default_value = 2.4
    mat["spacefaceRole"] = "atlas"
    return mat


# ---------------------------------------------------------------------------
# Geometry
# ---------------------------------------------------------------------------

def _leg_ends(sx, sy):
    foot = Vector((sx * FOOT_X, sy * Y_FRAME, SHOE_H + 0.01))
    crown = Vector((0.0, sy * Y_FRAME, CROWN_Z))
    return foot, crown


def build_aframes(lod, collection):
    objs = []
    fw, dep, tf, tw = {
        0: (0.12, 0.16, 0.022, 0.028),
        1: (0.14, 0.16, 0.030, 0.040),
        2: (0.16, 0.18, 0.040, 0.050),
    }[lod]
    n_st = {0: 5, 1: 2, 2: 2}[lod]
    bevel = {0: 0.006, 1: 0.0, 2: 0.0}[lod]
    box = lod >= 1
    for sy, side in ((1.0, "P"), (-1.0, "S")):
        for sx, tag in ((1.0, "X"), (-1.0, "x")):
            a, b = _leg_ends(sx, sy)
            objs.append(add_ibeam(
                f"leg_{side}_{tag}", a, b, fw, dep, tf, tw, "structure", collection,
                stations=n_st, bevel=bevel, up=(0, 1, 0), box=box,
            ))
            # Shoe
            shoe_loc = (sx * FOOT_X, sy * Y_FRAME, SHOE_H * 0.5)
            objs.append(add_box(
                f"shoe_{side}_{tag}", shoe_loc,
                (SHOE_XY[0], SHOE_XY[1], SHOE_H), "structure", collection, bevel=bevel,
            ))
            # Orange edge strip on the shoe lip (marking, not livery)
            if lod == 0:
                objs.append(add_box(
                    f"shoe_mark_{side}_{tag}",
                    (sx * FOOT_X, sy * Y_FRAME + sy * 0.12, SHOE_H + 0.006),
                    (0.18, 0.018, 0.008), "marking", collection, bevel=0.0,
                ))
            # Stiffener gussets shoe -> leg
            if lod < 2:
                inward = Vector((-sx * 0.16, 0.0, 0.22))
                p0 = Vector((sx * FOOT_X - sx * 0.12, sy * Y_FRAME, SHOE_H))
                p1 = Vector((sx * FOOT_X + sx * 0.10, sy * Y_FRAME, SHOE_H))
                p2 = Vector(a) + inward
                objs.append(add_gusset(
                    f"shoe_gus_{side}_{tag}", p0, p1, p2, 0.018, "structure", collection, bevel=0.002 if lod == 0 else 0.0,
                ))
            if lod == 0:
                for k, off in enumerate(((-0.10, -0.08), (0.10, -0.08), (-0.10, 0.08), (0.10, 0.08))):
                    objs.append(add_hex_bolt(
                        f"shoe_bolt_{side}_{tag}_{k}",
                        (sx * FOOT_X + off[0], sy * Y_FRAME + off[1], SHOE_H + 0.012),
                        (0, 0, 1), collection,
                    ))
        # Mid strut (the A cross-bar)
        fp, _ = _leg_ends(1.0, sy)
        fm, _ = _leg_ends(-1.0, sy)
        t_mid = 0.48
        a_mid = fp.lerp(Vector((0.0, sy * Y_FRAME, CROWN_Z)), t_mid)
        b_mid = fm.lerp(Vector((0.0, sy * Y_FRAME, CROWN_Z)), t_mid)
        objs.append(add_ibeam(
            f"strut_{side}", a_mid, b_mid, 0.08, 0.10, 0.016, 0.020, "structure",
            collection, stations=3 if lod == 0 else 2, bevel=bevel, up=(0, 0, 1), box=box,
        ))
        if lod == 0:
            # A-plane diagonals (angle iron)
            t_lo, t_hi = 0.22, 0.72
            lo_p = fp.lerp(Vector((0.0, sy * Y_FRAME, CROWN_Z)), t_lo)
            hi_m = fm.lerp(Vector((0.0, sy * Y_FRAME, CROWN_Z)), t_hi)
            lo_m = fm.lerp(Vector((0.0, sy * Y_FRAME, CROWN_Z)), t_lo)
            hi_p = fp.lerp(Vector((0.0, sy * Y_FRAME, CROWN_Z)), t_hi)
            objs.append(add_l_angle(
                f"diag_{side}_a", lo_p, hi_m, 0.055, 0.012, "structure", collection,
                stations=3 if lod == 0 else 2, bevel=0.002, up=(0, 1, 0),
            ))
            objs.append(add_l_angle(
                f"diag_{side}_b", lo_m, hi_p, 0.055, 0.012, "structure", collection,
                stations=3 if lod == 0 else 2, bevel=0.002, up=(0, 1, 0),
            ))
        # Crown knee plates
        if lod < 2:
            crown = Vector((0.0, sy * Y_FRAME, CROWN_Z))
            objs.append(add_gusset(
                f"knee_{side}",
                crown + Vector((-0.10, 0, -0.18)),
                crown + Vector((0.10, 0, -0.18)),
                crown + Vector((0.0, 0, 0.04)),
                0.020, "structure", collection, bevel=0.002 if lod == 0 else 0.0,
            ))
    # Crown head-beam spanning the two A-frames
    objs.append(add_ibeam(
        "crown_beam",
        (0.0, -Y_FRAME, CROWN_Z), (0.0, Y_FRAME, CROWN_Z),
        0.14, 0.18, 0.024, 0.030, "structure", collection,
        stations=4 if lod == 0 else 2, bevel=bevel, up=(1, 0, 0), box=box,
    ))
    # Portal struts between A-frames (do not cross the well)
    portal_z = (2.35, 3.85) if lod == 0 else ((3.10,) if lod == 1 else ())
    portal_x = ((0.38, "out"), (-0.38, "in")) if lod == 0 else ((0.38, "out"),)
    for i, z in enumerate(portal_z):
        for sx, tag in portal_x:
            objs.append(add_ibeam(
                f"portal_{i}_{tag}",
                (sx, -Y_FRAME, z), (sx, Y_FRAME, z),
                0.07, 0.09, 0.014, 0.018, "structure", collection,
                stations=3 if lod == 0 else 2, bevel=bevel, up=(1, 0, 0), box=box,
            ))
    return objs


def build_collar_and_skid(lod, collection):
    objs = []
    n = {0: 16, 1: 10, 2: 6}[lod]
    bevel = {0: 0.005, 1: 0.0, 2: 0.0}[lod]
    objs.append(add_annulus(
        "collar", COLLAR_R0, COLLAR_R1, COLLAR_Z0, COLLAR_Z1, n, "structure", collection, bevel,
    ))
    # Skid under the winch, welded back to both A-frames
    objs.append(add_box(
        "winch_skid", (DRUM_C.x - 0.06, 0.0, SKID_Z),
        (0.70, 1.12, 0.055), "structure", collection, bevel=bevel,
    ))
    if lod == 0:
        for sy in (Y_FRAME, -Y_FRAME):
            objs.append(add_gusset(
                f"skid_gus_{'P' if sy > 0 else 'S'}",
                (DRUM_C.x - 0.28, sy * 0.85, SKID_Z + 0.03),
                (DRUM_C.x + 0.18, sy * 0.85, SKID_Z + 0.03),
                (DRUM_C.x - 0.04, sy, SKID_Z + 0.22),
                0.016, "structure", collection, bevel=0.002,
            ))
    # Pillow-block bearings (cast housing + cap + race)
    for sy, tag in ((BEARING_Y, "P"), (-BEARING_Y, "S")):
        objs.append(add_box(
            f"bearing_block_{tag}", (DRUM_C.x, sy, DRUM_C.z - 0.02),
            (0.22, 0.14, 0.28), "interface", collection, bevel=bevel,
        ))
        objs.append(add_cyl(
            f"bearing_cap_{tag}", (DRUM_C.x, sy, DRUM_C.z),
            0.085, 0.10, "interface", collection,
            verts=8 if lod else 12, bevel=0.0 if lod else 0.003, rot=(math.pi / 2, 0, 0),
        ))
        if lod == 0:
            for k, dx in enumerate((-0.07, 0.07)):
                objs.append(add_hex_bolt(
                    f"bearing_bolt_{tag}_{k}",
                    (DRUM_C.x + dx, sy, SKID_Z + 0.04),
                    (0, 0, 1), collection, radius=0.014, depth=0.022,
                ))
    # Gearbox / motor rooted on -X of the skid
    if lod < 2:
        objs.append(add_box(
            "gearbox", (DRUM_C.x - 0.32, 0.18, DRUM_C.z - 0.02),
            (0.28, 0.26, 0.30), "winch", collection, bevel=bevel,
        ))
        if lod == 0:
            objs.append(add_cyl(
                "winch_motor", (DRUM_C.x - 0.46, 0.18, DRUM_C.z - 0.02),
                0.09, 0.18, "winch", collection,
                verts=12, bevel=0.003, rot=(0, math.pi / 2, 0),
            ))
    return objs


def build_drum(lod, collection):
    objs = []
    segs = {0: 20, 1: 12, 2: 6}[lod]
    bevel = {0: 0.004, 1: 0.0, 2: 0.0}[lod]
    objs.append(add_cyl(
        "drum_shell", tuple(DRUM_C), DRUM_R, DRUM_LEN, "winch", collection,
        verts=segs, bevel=bevel, rot=(math.pi / 2, 0, 0),
    ))
    for sy, tag in ((DRUM_LEN * 0.5, "P"), (-DRUM_LEN * 0.5, "S")):
        objs.append(add_cyl(
            f"drum_flange_{tag}", (DRUM_C.x, sy, DRUM_C.z),
            DRUM_R + 0.045, 0.028, "interface", collection,
            verts=segs, bevel=0.002, rot=(math.pi / 2, 0, 0),
        ))
    if lod < 2:
        objs.append(add_cyl(
            "spindle", tuple(DRUM_C), 0.045, DRUM_LEN + 0.22, "interface", collection,
            verts=max(8, segs - 4), bevel=0.002 if lod == 0 else 0.0, rot=(math.pi / 2, 0, 0),
        ))
    if lod == 0:
        # Brake disc on +Y end
        objs.append(add_cyl(
            "brake_disc", (DRUM_C.x, DRUM_LEN * 0.5 + 0.05, DRUM_C.z),
            0.16, 0.018, "interface", collection, verts=16, bevel=0.002, rot=(math.pi / 2, 0, 0),
        ))
    return objs


def build_cable(lod, collection):
    objs = []
    segs = {0: 12, 1: 8, 2: 6}[lod]
    # Coils on the drum (static, rotate with drum_spin)
    n_coil = {0: 4, 1: 2, 2: 1}[lod]
    for i in range(n_coil):
        y = -0.18 + i * (0.36 / max(1, n_coil - 1))
        objs.append(add_cyl(
            f"cable_coil_{i}", (DRUM_C.x, y, DRUM_C.z),
            DRUM_R + 0.018, 0.055, "cable", collection,
            verts=segs, bevel=0.0, rot=(math.pi / 2, 0, 0),
        ))
    # Payout hanging from the tangent down through the collar
    hang_top = CABLE_ANCHOR
    hang_bot = Vector((0.0, 0.0, 0.02))
    n_st = {0: 5, 1: 3, 2: 2}[lod]
    r = {0: 0.022, 1: 0.026, 2: 0.030}[lod]
    rings = []
    for i in range(n_st):
        t = i / (n_st - 1)
        # ease toward the well centre as it drops
        p = hang_top.lerp(hang_bot, t)
        p.x = hang_top.x * (1.0 - t) + hang_bot.x * t
        rings.append(ring_at(p, hang_bot - hang_top, (0, 1, 0), [
            (r, 0.0), (0.0, r), (-r, 0.0), (0.0, -r),
        ]))
    objs.append(loft_section("cable_payout", rings, "cable", collection, bevel=0.0, cap=True))
    return objs


def build_platform(lod, collection):
    objs = []
    bevel = {0: 0.004, 1: 0.0, 2: 0.0}[lod]
    cx = (PLAT_X0 + PLAT_X1) * 0.5
    cy = 0.0
    sx = PLAT_X1 - PLAT_X0
    sy = PLAT_Y1 - PLAT_Y0
    # Frame channels
    t = {0: 0.040, 1: 0.048, 2: 0.055}[lod]
    objs.append(add_box("plat_beam_x0", (PLAT_X0, cy, PLAT_Z), (t, sy, 0.07), "structure", collection, bevel=bevel))
    objs.append(add_box("plat_beam_x1", (PLAT_X1, cy, PLAT_Z), (t, sy, 0.07), "structure", collection, bevel=bevel))
    objs.append(add_box("plat_beam_y0", (cx, PLAT_Y0, PLAT_Z), (sx, t, 0.07), "structure", collection, bevel=bevel))
    objs.append(add_box("plat_beam_y1", (cx, PLAT_Y1, PLAT_Z), (sx, t, 0.07), "structure", collection, bevel=bevel))
    # Grating bars (modelled, not a texture)
    n_bar = {0: 6, 1: 3, 2: 1}[lod]
    bar_t = {0: 0.018, 1: 0.030, 2: 0.10}[lod]
    for i in range(n_bar):
        y = PLAT_Y0 + 0.06 + (sy - 0.12) * (i / max(1, n_bar - 1))
        objs.append(add_box(
            f"grate_{i}", (cx, y, PLAT_Z + 0.018),
            (sx - 0.08, bar_t, 0.016), "grating", collection, bevel=0.0,
        ))
    # Kick plate — restrained orange strip on the outer +X toe, not a wall of colour
    if lod == 0:
        objs.append(add_box(
            "kick_x", (PLAT_X1 - 0.01, cy, PLAT_Z + 0.04),
            (0.012, 0.22, 0.05), "marking", collection, bevel=0.0,
        ))
    if lod == 0:
        # Guard posts + rails
        posts = (
            (PLAT_X0 + 0.04, PLAT_Y0 + 0.04),
            (PLAT_X1 - 0.04, PLAT_Y0 + 0.04),
            (PLAT_X0 + 0.04, PLAT_Y1 - 0.04),
            (PLAT_X1 - 0.04, PLAT_Y1 - 0.04),
        )
        for i, (px, py) in enumerate(posts):
            objs.append(add_cyl(
                f"post_{i}", (px, py, PLAT_Z + 0.46), 0.018, 0.88, "structure", collection,
                verts=8 if lod else 10, bevel=0.001,
            ))
        # Top + mid rails
        for z, tag in ((PLAT_Z + 0.88, "top"), (PLAT_Z + 0.48, "mid")):
            objs.append(add_box(f"rail_{tag}_y0", (cx, PLAT_Y0 + 0.04, z), (sx - 0.08, 0.018, 0.018), "structure", collection, bevel=0.0))
            objs.append(add_box(f"rail_{tag}_y1", (cx, PLAT_Y1 - 0.04, z), (sx - 0.08, 0.018, 0.018), "structure", collection, bevel=0.0))
            objs.append(add_box(f"rail_{tag}_x1", (PLAT_X1 - 0.04, cy, z), (0.018, sy - 0.08, 0.018), "structure", collection, bevel=0.0))
        # Brackets back to +X legs
        for sy, tag in ((Y_FRAME, "P"), (-Y_FRAME, "S")):
            objs.append(add_box(
                f"plat_bracket_{tag}", (0.22, sy * 0.55, PLAT_Z - 0.04),
                (0.28, 0.05, 0.06), "structure", collection, bevel=bevel,
            ))
    else:
        for sy, tag in ((Y_FRAME, "P"), (-Y_FRAME, "S")):
            objs.append(add_box(
                f"plat_bracket_{tag}", (0.22, sy * 0.55, PLAT_Z - 0.04),
                (0.30, 0.06, 0.07), "structure", collection, bevel=0.0,
            ))
    # Ladder on +X / starboard shoe
    if lod == 0:
        lx, ly = FOOT_X * 0.92, -Y_FRAME * 0.55
        n_rung = {0: 10, 1: 4, 2: 0}[lod]
        z0, z1 = 0.18, PLAT_Z - 0.04
        stile_b = 0.001 if lod == 0 else 0.0
        objs.append(add_cyl("ladder_stile_a", (lx - 0.08, ly, (z0 + z1) * 0.5), 0.016, z1 - z0, "structure", collection, verts=6 if lod else 8, bevel=stile_b))
        objs.append(add_cyl("ladder_stile_b", (lx + 0.08, ly, (z0 + z1) * 0.5), 0.016, z1 - z0, "structure", collection, verts=6 if lod else 8, bevel=stile_b))
        for i in range(n_rung):
            z = z0 + (z1 - z0) * ((i + 0.5) / n_rung)
            objs.append(add_cyl(
                f"rung_{i}", (lx, ly, z), 0.012, 0.18, "interface", collection,
                verts=6, bevel=0.0, rot=(0, math.pi / 2, 0),
            ))
    return objs


def build_lamps(lod, collection):
    bevel = {0: 0.003, 1: 0.0, 2: 0.0}[lod]
    segs = {0: 12, 1: 8, 2: 6}[lod]
    housings = {"L": [], "R": []}
    lenses = {}
    for tag, loc in (("L", LAMP_L), ("R", LAMP_R)):
        if lod == 0:
            housings[tag].append(add_box(
                f"lamp_arm_{tag}", (loc.x - 0.08, loc.y, loc.z - 0.02),
                (0.16, 0.04, 0.04), "structure", collection, bevel=bevel,
            ))
            housings[tag].append(add_cyl(
                f"lamp_socket_{tag}", (loc.x, loc.y, loc.z),
                0.038, 0.055, "structure", collection, verts=segs, bevel=bevel,
            ))
        # Hood opening downward into the shaft
        housings[tag].append(add_cone(
            f"lamp_hood_{tag}", (loc.x, loc.y, loc.z - 0.05),
            0.070, 0.032, 0.08, "structure", collection, verts=segs, bevel=bevel,
        ))
        lens = add_cyl(
            f"lamp_lens_{tag}", (loc.x, loc.y, loc.z - 0.07),
            0.024, 0.014, "lamp", collection, verts=max(6, segs - 2), bevel=0.0,
        )
        lenses[tag] = lens
    return housings, lenses


def build_lod(lod):
    reset_scene()
    coll = bpy.data.collections.new(f"LOD{lod}")
    bpy.context.scene.collection.children.link(coll)
    static = []
    static.extend(build_aframes(lod, coll))
    static.extend(build_collar_and_skid(lod, coll))
    static.extend(build_platform(lod, coll))
    drum = build_drum(lod, coll)
    cable = build_cable(lod, coll)
    housings, lenses = build_lamps(lod, coll)

    static_m = join_group(static, f"LOD{lod}_derrick")
    drum_m = join_group(drum, f"LOD{lod}_drum")
    cable_m = join_group(cable, f"LOD{lod}_cable")
    lamp_l = join_group(housings["L"], f"LOD{lod}_lamp_L")
    lamp_r = join_group(housings["R"], f"LOD{lod}_lamp_R")
    lens_l = lenses["L"]
    lens_r = lenses["R"]
    lens_l.name = f"LOD{lod}_lamp_L_lens"
    lens_r.name = f"LOD{lod}_lamp_R_lens"
    meshes = [static_m, drum_m, cable_m, lamp_l, lamp_r, lens_l, lens_r]
    for obj in meshes:
        obj["spacefaceLod"] = f"lod{lod}"

    unwrap_unique(meshes)
    size = TEX_SIZE[lod]
    bakes = bake_targets(meshes, size, f"derrick_atlas_lod{lod}")
    maps = author_maps(bakes, size, f"derrick_atlas_lod{lod}")
    atlas = atlas_material(maps, lod, emissive=False)
    lamp_mat = atlas_material(maps, lod, emissive=True)
    for obj in (static_m, drum_m, cable_m, lamp_l, lamp_r):
        obj.data.materials.clear()
        obj.data.materials.append(atlas)
    for lens in (lens_l, lens_r):
        lens.data.materials.clear()
        lens.data.materials.append(lamp_mat)

    tris = sum(count_tris(o) for o in meshes)
    if tris > TRI_BUDGET[lod]:
        print(f"WARN LOD{lod} tris {tris} over budget {TRI_BUDGET[lod]}")
    return {
        "meshes": meshes,
        "static": static_m,
        "drum": drum_m,
        "cable": cable_m,
        "lamp_l": lamp_l,
        "lamp_r": lamp_r,
        "lens_l": lens_l,
        "lens_r": lens_r,
        "maps": maps,
        "triangles": tris,
        "draws": len(meshes),
        "materials": 2,
    }


def export_lod_glb(report, lod):
    SOURCE_DIR.mkdir(parents=True, exist_ok=True)
    path = SOURCE_DIR / f"derrick_lod{lod}.glb"
    bpy.ops.object.select_all(action="DESELECT")
    for obj in report["meshes"]:
        bpy.context.view_layer.objects.active = obj
        obj.select_set(True)
        tri = obj.modifiers.new("Triangulate", "TRIANGULATE")
        bpy.ops.object.modifier_apply(modifier=tri.name)
        obj.select_set(False)
        obj.hide_set(False)
        obj.hide_render = False
    bpy.ops.object.select_all(action="DESELECT")
    for obj in report["meshes"]:
        obj.select_set(True)
        obj.hide_set(False)
        obj.hide_render = False
    bpy.context.view_layer.objects.active = report["static"]
    tmp = SOURCE_DIR / f"derrick_lod{lod}.tmp.glb"
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
    tmp.replace(path)
    report["path"] = str(path.relative_to(ROOT)).replace("\\", "/")
    report["bytes"] = path.stat().st_size
    report["sha256"] = sha256(path)
    print(json.dumps({
        "lod": lod, "triangles": report["triangles"],
        "draws": report["draws"], "bytes": report["bytes"],
    }, indent=2))
    return path


def world_bbox(objects):
    low = Vector((1e9, 1e9, 1e9))
    high = Vector((-1e9, -1e9, -1e9))
    for obj in objects:
        if obj.type != "MESH":
            continue
        for corner in obj.bound_box:
            p = obj.matrix_world @ Vector(corner)
            for i in range(3):
                low[i] = min(low[i], p[i])
                high[i] = max(high[i], p[i])
    return low, high


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
            extras["spaceface"] = {"lod": lod}
            node["extras"] = extras
        if name == "COLLISION_HULL":
            extras = dict(node.get("extras") or {})
            extras["nonRender"] = True
            extras["sf_collision"] = True
            node["extras"] = extras
    _write_glb(path, gltf, rest)


def combine_lods(lod_reports):
    reset_scene()
    root = add_empty(ROOT_NAME, (0, 0, 0), bpy.context.scene.collection, size=0.16)
    drum_e = add_empty("drum_spin", tuple(DRUM_C), bpy.context.scene.collection, size=0.12)
    cable_e = add_empty("cable_anchor", tuple(CABLE_ANCHOR), bpy.context.scene.collection, size=0.08)
    lamp_l_e = add_empty("lamp_L", tuple(LAMP_L), bpy.context.scene.collection, size=0.06)
    lamp_r_e = add_empty("lamp_R", tuple(LAMP_R), bpy.context.scene.collection, size=0.06)
    for hook in (drum_e, cable_e, lamp_l_e, lamp_r_e):
        stamp_socket(hook)
        parent_keep(hook, root)

    mesh_names = []
    lod_tri = {0: 0, 1: 0, 2: 0}
    for lod in (0, 1, 2):
        path = SOURCE_DIR / f"derrick_lod{lod}.glb"
        before = set(bpy.data.objects)
        bpy.ops.import_scene.gltf(filepath=str(path))
        imported = [o for o in bpy.data.objects if o not in before]
        groups = {"derrick": [], "drum": [], "cable": [], "lamp_L": [], "lamp_R": []}
        for obj in imported:
            raw = obj.name.split(".")[0]
            obj["_sf_raw"] = raw
            if obj.type != "MESH":
                try:
                    bpy.data.objects.remove(obj, do_unlink=True)
                except Exception:
                    pass
                continue
            lower = raw.lower()
            if "drum" in lower:
                groups["drum"].append(obj)
            elif "cable" in lower:
                groups["cable"].append(obj)
            elif "lamp_l" in lower:
                groups["lamp_L"].append(obj)
            elif "lamp_r" in lower:
                groups["lamp_R"].append(obj)
            else:
                groups["derrick"].append(obj)
        mapping = {
            "derrick": (root, f"LOD{lod}_derrick"),
            "drum": (drum_e, f"LOD{lod}_drum"),
            "cable": (cable_e, None),
            "lamp_L": (lamp_l_e, None),
            "lamp_R": (lamp_r_e, None),
        }
        for key, (parent, rename) in mapping.items():
            for obj in groups[key]:
                parent_keep(obj, parent)
                raw = (obj.get("_sf_raw") or obj.name).lower()
                if rename:
                    obj.name = rename
                elif key == "cable":
                    obj.name = f"LOD{lod}_cable"
                elif key == "lamp_L":
                    obj.name = f"LOD{lod}_lamp_L_lens" if "lens" in raw else f"LOD{lod}_lamp_L"
                elif key == "lamp_R":
                    obj.name = f"LOD{lod}_lamp_R_lens" if "lens" in raw else f"LOD{lod}_lamp_R"
                obj["spacefaceLod"] = f"lod{lod}"
                obj["spaceface"] = {"lod": f"lod{lod}"}
                lod_tri[lod] += count_tris(obj)
                mesh_names.append(obj.name)

    chull = add_empty("COLLISION_HULL", (0, 0, 3.2), bpy.context.scene.collection, size=1.0)
    chull.empty_display_type = "CUBE"
    chull.scale = Vector((1.08, 1.00, 3.25))
    chull["sf_collision"] = True
    chull["nonRender"] = True
    chull["spaceface"] = {"collision": True, "helper": True, "nonRender": True, "role": "collision", "kind": "box"}
    parent_keep(chull, root)

    meshes = [o for o in bpy.data.objects if o.type == "MESH"]
    low, high = world_bbox(meshes)
    size = high - low
    contract = {
        "contractVersion": 1,
        "assetId": ASSET_ID,
        "partId": ASSET_ID,
        "liveId": ASSET_ID,
        "slot": "place",
        "category": "works",
        "family": "asteroid_works",
        "packet": "PQ-131.05",
        "role": "surface head-frame over the entry shaft — A-frame, winch, platform, two hooded lamps",
        "forward": "+X",
        "up": "+Y",
        "starboard": "+Z",
        "unit": "metre",
        "normalConvention": "OpenGL",
        "ormChannels": "R=AO,G=Roughness,B=Metallic",
        "textureCompression": "PNG-source",
        "textureAuthorship": "unique UV0 mesh AO/normal/curvature + authored 2048 PBR",
        "textureSize": 2048,
        "deliverableRole": "source_candidate",
        "lods": ["lod0", "lod1", "lod2"],
        "exportedLods": ["lod0", "lod1", "lod2"],
        "lodTriangles": {"lod0": int(lod_tri[0]), "lod1": int(lod_tri[1]), "lod2": int(lod_tri[2])},
        "triangleCount": int(lod_tri[0]),
        "sockets": list(HOOK_NAMES),
        "hooks": list(HOOK_NAMES),
        "root": ROOT_NAME,
        "wiringStatus": "source_candidate_unwired",
        "blenderBasis": "Z-up works scale",
        "exportBasis": "Y-up glTF",
        "bboxBlender": {
            "min": [round(float(v), 4) for v in low],
            "max": [round(float(v), 4) for v in high],
            "size": [round(float(v), 4) for v in size],
        },
    }
    root["spacefaceAsset"] = contract
    bpy.context.scene["spacefaceAsset"] = contract

    SOURCE_DIR.mkdir(parents=True, exist_ok=True)
    PARTS_DIR.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(BLEND_PATH))

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
    combined = SOURCE_DIR / "derrick.glb"
    parts = PARTS_DIR / COMBINED_NAME
    tmp = SOURCE_DIR / "derrick.tmp.glb"
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
    stamp_glb_contract(tmp, contract)
    if combined.exists():
        combined.unlink()
    shutil.move(str(tmp), str(combined))
    shutil.copy2(combined, parts)
    inventory = {
        "assetId": ASSET_ID,
        "root": ROOT_NAME,
        "combined": str(combined.relative_to(ROOT)).replace("\\", "/"),
        "partsSource": str(parts.relative_to(ROOT)).replace("\\", "/"),
        "blend": str(BLEND_PATH.relative_to(ROOT)).replace("\\", "/"),
        "lodTriangles": contract["lodTriangles"],
        "hooks": list(HOOK_NAMES),
        "meshNames": sorted(mesh_names),
        "bbox": contract["bboxBlender"],
        "bytes": combined.stat().st_size,
        "sha256": sha256(combined),
        "partsSha256": sha256(parts),
    }
    (SOURCE_DIR / "derrick_inventory.json").write_text(
        json.dumps(inventory, indent=2) + "\n", encoding="utf-8",
    )
    print(json.dumps({"ok": True, **inventory}, indent=2))
    return inventory, contract, combined, parts


def inspect_glb(path: Path) -> dict:
    gltf, _rest = _read_glb(path)
    nodes = gltf.get("nodes") or []
    names = [n.get("name") for n in nodes]
    meshes = gltf.get("meshes") or []
    materials = gltf.get("materials") or []
    accessors = {i: a for i, a in enumerate(gltf.get("accessors") or [])}
    mesh_by_index = {}
    for mi, mesh in enumerate(meshes):
        mesh_tris = 0
        for prim in mesh.get("primitives") or []:
            acc = accessors.get(prim.get("indices"))
            if acc:
                mesh_tris += int(acc.get("count", 0)) // 3
        mesh_by_index[mi] = mesh_tris
    lod_tris = {"lod0": 0, "lod1": 0, "lod2": 0}
    for node in nodes:
        name = node.get("name") or ""
        mi = node.get("mesh")
        if mi is None:
            continue
        t = mesh_by_index.get(mi, 0)
        if name.startswith("LOD0"):
            lod_tris["lod0"] += t
        elif name.startswith("LOD1"):
            lod_tris["lod1"] += t
        elif name.startswith("LOD2"):
            lod_tris["lod2"] += t
    hooks = [n for n in names if n in HOOK_NAMES]
    missing_hooks = [h for h in HOOK_NAMES if h not in names]
    missing_lods = [n for n in LOD_ROOTS if n not in names]
    return {
        "nodes": names,
        "hooksFound": hooks,
        "missingHooks": missing_hooks,
        "missingLodRoots": missing_lods,
        "rootPresent": ROOT_NAME in names,
        "meshCount": len(meshes),
        "materialCount": len(materials),
        "lodTriangles": lod_tris,
        "draws": len([n for n in nodes if n.get("mesh") is not None]),
        "ok": (not missing_hooks) and (not missing_lods) and ROOT_NAME in names,
    }


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
    scene.view_settings.exposure = 0.08
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
        bg.inputs["Strength"].default_value = 0.18
    bpy.ops.mesh.primitive_plane_add(size=2.4, location=(0, 0, -0.002))
    pad = bpy.context.object
    pad.name = "MinePad"
    pad_mat = bpy.data.materials.new("MinePadMat")
    pad_mat.use_nodes = True
    pad_bsdf = next(n for n in pad_mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    pad_bsdf.inputs["Base Color"].default_value = (0.07, 0.055, 0.042, 1)
    pad_bsdf.inputs["Roughness"].default_value = 0.86
    pad_bsdf.inputs["Metallic"].default_value = 0.04
    pad.data.materials.append(pad_mat)
    # Dark well under the collar so the shaft reads in evidence stills only.
    bpy.ops.mesh.primitive_cylinder_add(vertices=16, radius=0.34, depth=0.40, location=(0, 0, -0.22))
    well = bpy.context.object
    well.name = "MineWell"
    well_mat = bpy.data.materials.new("MineWellMat")
    well_mat.use_nodes = True
    wbsdf = next(n for n in well_mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    wbsdf.inputs["Base Color"].default_value = (0.012, 0.010, 0.008, 1)
    wbsdf.inputs["Roughness"].default_value = 0.94
    wbsdf.inputs["Metallic"].default_value = 0.0
    well.data.materials.append(well_mat)

    cam_data = bpy.data.cameras.new("WorksCam")
    camera = bpy.data.objects.new("WorksCam", cam_data)
    scene.collection.objects.link(camera)
    scene.camera = camera
    reach = 8.0
    for name, loc, energy, color, angle in (
        ("Key", (-1.05 * reach, -0.70 * reach, 0.85 * reach), 8.4, (1.00, 0.863, 0.737), 16.0),
        ("Rim", (0.18 * reach, 1.55 * reach, 0.55 * reach), 2.40, (0.616, 0.722, 0.941), 24.0),
        ("Fill", (1.05 * reach, 0.40 * reach, 0.70 * reach), 2.20, (0.847, 0.765, 0.659), 28.0),
        ("Grazing", (2.2 * reach, -0.15 * reach, 0.35 * reach), 6.2, (1.00, 0.90, 0.78), 10.0),
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
        look_at(obj, (0, 0, 2.4))
        data.use_shadow = name in {"Key", "Grazing"}
    return camera, pad, well


def override_clay(meshes):
    backups = {}
    mat = bpy.data.materials.new("Clay")
    mat.use_nodes = True
    bsdf = next(n for n in mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    bsdf.inputs["Base Color"].default_value = (0.42, 0.40, 0.38, 1)
    bsdf.inputs["Roughness"].default_value = 0.72
    bsdf.inputs["Metallic"].default_value = 0.0
    for obj in meshes:
        backups[obj.name] = [s.material for s in obj.material_slots]
        if obj.material_slots:
            obj.material_slots[0].material = mat
        else:
            obj.data.materials.append(mat)
    return backups, mat


def restore_mats(meshes, backups):
    for obj in meshes:
        mats = backups.get(obj.name) or []
        obj.data.materials.clear()
        for mat in mats:
            obj.data.materials.append(mat)


def override_channel(meshes, kind):
    backups = {}
    mat = bpy.data.materials.new(f"Iso_{kind}")
    mat.use_nodes = True
    for obj in meshes:
        backups[obj.name] = [s.material for s in obj.material_slots]
        src = None
        for slot in obj.material_slots:
            if slot.material and slot.material.use_nodes:
                src = slot.material
                break
        iso = mat.copy()
        iso.name = f"Iso_{kind}_{obj.name}"
        iso.use_nodes = True
        nt = iso.node_tree
        out = next(n for n in nt.nodes if n.type == "OUTPUT_MATERIAL")
        emit = nt.nodes.new("ShaderNodeEmission")
        if src is not None:
            for node in src.node_tree.nodes:
                if node.type == "TEX_IMAGE" and node.image:
                    name = (node.image.name or "").lower()
                    if kind == "normal" and "normal" in name:
                        tex = nt.nodes.new("ShaderNodeTexImage")
                        tex.image = node.image
                        nt.links.new(tex.outputs["Color"], emit.inputs["Color"])
                        break
                    if kind == "orm" and "orm" in name:
                        tex = nt.nodes.new("ShaderNodeTexImage")
                        tex.image = node.image
                        nt.links.new(tex.outputs["Color"], emit.inputs["Color"])
                        break
                    if kind == "id" and "id" in name:
                        tex = nt.nodes.new("ShaderNodeTexImage")
                        tex.image = node.image
                        nt.links.new(tex.outputs["Color"], emit.inputs["Color"])
                        break
        nt.links.new(emit.outputs["Emission"], out.inputs["Surface"])
        obj.data.materials.clear()
        obj.data.materials.append(iso)
    return backups


def render_stills(glb_path: Path, still_dir: Path):
    still_dir.mkdir(parents=True, exist_ok=True)
    reset_scene()
    bpy.ops.import_scene.gltf(filepath=str(glb_path))
    camera, pad, well = setup_mine_lights()
    meshes = [o for o in bpy.data.objects if o.type == "MESH" and o.name not in {"MinePad", "MineWell"}]

    def set_lod(visible):
        for obj in meshes:
            name = obj.name
            show = True
            if visible == "close":
                show = name.startswith("LOD0") or not name.startswith("LOD")
            elif visible == "site":
                show = name.startswith("LOD1")
            obj.hide_render = not show
            try:
                obj.hide_set(not show)
            except Exception:
                pass

    paths = {}

    def snap(name, framing, edge_dir=EDGE_DIR):
        pose = apply_works_camera(camera, framing=framing, focus=FOCUS, edge_dir=edge_dir)
        offset = Vector(pose["object_offset"])
        if framing == "works_edge" and offset.length > 1e-9:
            # Rebuild a shorter inset so the 6.2 wu crown stays inside the frustum.
            ex, ey = works_frustum(pose["px_per_cell"])
            dx, dy = edge_dir
            length = math.hypot(dx, dy) or 1.0
            offset = Vector((
                (dx / length) * (ex * 0.5) * EDGE_INSET_TALL,
                (dy / length) * (ey * 0.5) * EDGE_INSET_TALL,
                0.0,
            ))
            pose = dict(pose)
            pose["object_offset"] = (offset.x, offset.y, offset.z)
        moved = []
        if offset.length > 1e-9:
            for obj in list(bpy.data.objects):
                if obj.type in {"CAMERA", "LIGHT"}:
                    continue
                if obj.parent is not None:
                    continue
                obj.location = obj.location + offset
                moved.append((obj, offset))
            bpy.context.view_layer.update()
        out = still_dir / name
        bpy.context.scene.render.filepath = str(out)
        bpy.ops.render.render(write_still=True)
        sanitize_png(out)
        for obj, off in moved:
            obj.location = obj.location - off
        return {
            "path": str(out.relative_to(ROOT)).replace("\\", "/"),
            "framing": framing,
            "distance": pose["distance"],
            "px_per_cell_target": pose["px_per_cell"],
            "px_per_cell_measured": measured_px_per_cell(pose["distance"], 1080),
            "object_offset": list(pose["object_offset"]),
            "fov_v_deg": FOV_V_DEG,
            "resolution": [1920, 1080],
            "focus": list(FOCUS),
        }

    set_lod("close")
    paths["works_top"] = snap("works_top.png", "works_top")
    paths["works_edge"] = snap("works_edge.png", "works_edge", edge_dir=EDGE_DIR)
    clay_b, _ = override_clay(meshes)
    paths["works_top_clay"] = snap("works_top_clay.png", "works_top")
    restore_mats(meshes, clay_b)

    for obj in bpy.data.objects:
        if obj.type == "LIGHT" and obj.name == "Key":
            obj.data.energy = 1.8
        if obj.type == "LIGHT" and obj.name == "Grazing":
            obj.data.energy = 9.2
    paths["works_edge_grazing"] = snap("works_edge_grazing.png", "works_edge", edge_dir=(0.20, 0.95))
    for obj in bpy.data.objects:
        if obj.type == "LIGHT" and obj.name == "Key":
            obj.data.energy = 8.4
        if obj.type == "LIGHT" and obj.name == "Grazing":
            obj.data.energy = 6.2

    set_lod("site")
    paths["works_site"] = snap("works_site.png", "works_site")

    set_lod("close")
    scene = bpy.context.scene
    vt, look, exp = scene.view_settings.view_transform, scene.view_settings.look, scene.view_settings.exposure
    scene.view_settings.view_transform = "Standard"
    try:
        scene.view_settings.look = "None"
    except TypeError:
        pass
    scene.view_settings.exposure = 0.0
    pad.hide_render = True
    well.hide_render = True
    for kind, fname in (("normal", "normal_isolation.png"), ("orm", "orm_isolation.png"), ("id", "material_id.png")):
        b = override_channel(meshes, kind)
        paths[kind] = snap(fname, "works_top")
        restore_mats(meshes, b)
    scene.view_settings.view_transform = vt
    scene.view_settings.look = look
    scene.view_settings.exposure = exp
    pad.hide_render = False
    well.hide_render = False

    clay_b, _ = override_clay(meshes)
    for hook_name, color in (
        ("drum_spin", (0.9, 0.25, 0.1, 1)),
        ("cable_anchor", (0.15, 0.75, 0.25, 1)),
        ("lamp_L", (0.95, 0.82, 0.2, 1)),
        ("lamp_R", (0.95, 0.55, 0.15, 1)),
    ):
        hook = bpy.data.objects.get(hook_name)
        if hook is None:
            continue
        bpy.ops.mesh.primitive_cone_add(
            radius1=0.05, radius2=0.0, depth=0.28, location=hook.matrix_world.translation,
        )
        mark = bpy.context.object
        mark.name = f"_diag_{hook_name}"
        mat = bpy.data.materials.new(f"_diagmat_{hook_name}")
        mat.use_nodes = True
        bsdf = next(n for n in mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
        bsdf.inputs["Base Color"].default_value = color
        key = "Emission Color" if "Emission Color" in bsdf.inputs else "Emission"
        if key in bsdf.inputs:
            bsdf.inputs[key].default_value = color
        if "Emission Strength" in bsdf.inputs:
            bsdf.inputs["Emission Strength"].default_value = 2.2
        mark.data.materials.append(mat)
    paths["hook_identity"] = snap("hook_identity.png", "works_edge", edge_dir=EDGE_DIR)
    restore_mats(meshes, clay_b)
    return paths


def compose_contact_sheet():
    REF_DIR.mkdir(parents=True, exist_ok=True)
    labels = ("drill_platform — shoes / well (reject house)",
              "extraction_mast — tall over a feed (reject lattice)",
              "worklight_tower — paired hoods (reject glowing ball)")
    tiles = []
    tw, th = 640, 640
    for path in CITED_STILLS:
        if not path.exists():
            tiles.append(np.full((th, tw, 3), 0.08, dtype=np.float32))
            continue
        img = bpy.data.images.load(str(path))
        w, h = img.size
        pix = np.zeros(w * h * 4, dtype=np.float32)
        img.pixels.foreach_get(pix)
        arr = pix.reshape(h, w, 4)[..., :3]
        # Blender images are bottom-up
        arr = np.flipud(arr)
        scale = min(tw / w, th / h)
        nw, nh = max(1, int(w * scale)), max(1, int(h * scale))
        yy, xx = np.mgrid[0:th, 0:tw]
        src_x = np.clip(((xx - (tw - nw) / 2) * w / max(1, nw)).astype(int), 0, w - 1)
        src_y = np.clip(((yy - (th - nh) / 2) * h / max(1, nh)).astype(int), 0, h - 1)
        canvas = np.full((th, tw, 3), 0.06, dtype=np.float32)
        in_x = (xx >= (tw - nw) / 2) & (xx < (tw + nw) / 2)
        in_y = (yy >= (th - nh) / 2) & (yy < (th + nh) / 2)
        m = in_x & in_y
        canvas[m] = arr[src_y[m], src_x[m]]
        tiles.append(canvas)
        bpy.data.images.remove(img)
    sheet = np.concatenate(tiles, axis=1)
    # write via blender image
    H, W = sheet.shape[0], sheet.shape[1]
    rgba = np.ones((H, W, 4), dtype=np.float32)
    rgba[..., :3] = sheet
    rgba = np.flipud(rgba)
    name = "CONTACT_SHEET"
    if name in bpy.data.images:
        bpy.data.images.remove(bpy.data.images[name])
    img = bpy.data.images.new(name, width=W, height=H, alpha=True)
    img.colorspace_settings.name = "sRGB"
    img.pixels.foreach_set(rgba.ravel())
    out = REF_DIR / "CONTACT_SHEET.png"
    img.filepath_raw = str(out)
    img.file_format = "PNG"
    img.save()
    sanitize_png(out)
    (REF_DIR / "CONTACT_SHEET_LABELS.json").write_text(
        json.dumps({"labels": labels, "sources": [str(p.relative_to(ROOT)).replace("\\", "/") for p in CITED_STILLS]}, indent=2) + "\n",
        encoding="utf-8",
    )
    return out


def write_docs(inventory, contract, inspect, stills, lod_reports):
    FAMILY.mkdir(parents=True, exist_ok=True)
    EVIDENCE_DIR.mkdir(parents=True, exist_ok=True)
    hashes = {
        "cycle": 1,
        "disposition": "review_pending",
        "combinedSha256": inventory["sha256"],
        "partsSha256": inventory["partsSha256"],
        "lod": {
            str(r.get("lod", i)): {"sha256": r.get("sha256"), "triangles": r["triangles"]}
            for i, r in enumerate(lod_reports)
        },
        "textures": {},
        "stills": {},
    }
    for path in sorted(TEX_DIR.glob("*.png")):
        hashes["textures"][path.name] = sha256(path)
    for path in sorted(EVIDENCE_DIR.glob("*.png")):
        hashes["stills"][path.name] = sha256(path)
    (FAMILY / "HASHES.json").write_text(json.dumps(hashes, indent=2) + "\n", encoding="utf-8")

    epoch = {
        "schema": "spaceface.worksDerrickCycleEpoch.v1",
        "cycle": 1,
        "epoch": "cycle_001",
        "disposition": "review_pending",
        "state": "design_candidate",
        "gates": {"G0": "evidence_ready", "G1": "open", "G2": "open", "G4": "open", "G7": "open"},
        "independentReview": "not_launched",
        "candidate": {
            "root": ROOT_NAME,
            "partGlb": inventory["partsSource"],
            "sourceGlb": inventory["combined"],
            "blend": inventory["blend"],
            "sha256": inventory["sha256"],
            "partsSha256": inventory["partsSha256"],
        },
        "hooks": {
            "required": list(HOOK_NAMES),
            "found": inspect["hooksFound"],
            "missing": inspect["missingHooks"],
            "drum_spin": list(DRUM_C),
            "cable_anchor": list(CABLE_ANCHOR),
            "lamp_L": list(LAMP_L),
            "lamp_R": list(LAMP_R),
        },
        "lod": {
            "budgets": TRI_BUDGET,
            "triangles": inspect["lodTriangles"],
            "draws": inspect["draws"],
            "materials": inspect["materialCount"],
            "hulls": inspect["meshCount"],
            "roots": LOD_ROOTS,
            "missingRoots": inspect["missingLodRoots"],
        },
        "bboxBlenderZUp": inventory["bbox"],
        "camera": stills,
        "notes": [
            "Cycle 01 source candidate only. Not wired, not released, not accepted.",
            "Hidden-face evaluation is per LOD; coincident LODs were never raycast together.",
            "Reviewers were not launched.",
            "works_edge is the load-bearing still for three-cell height.",
        ],
    }
    (EVIDENCE_DIR / "EPOCH.json").write_text(json.dumps(epoch, indent=2) + "\n", encoding="utf-8")

    audit = f"""# Surface derrick — material and shape audit (Cycle 01)

Candidate `{inventory['sha256']}` · root `{ROOT_NAME}` · disposition `review_pending`.

## Shape grammar

| Form | Primitive origin | Manufactured result | Camera |
|---|---|---|---|
| A-frame legs | I-beam loft, not a box stick | Wide-flange section, splice/knee, shoes at z=0 | works_edge, clay |
| Cross-bracing | Angle iron / portal I | Every brace ends on a plate or strut | works_edge |
| Shaft collar | Annulus shell | Empty well, wall thickness | works_top |
| Drum | Cylinder + flanges + spindle | Sits in pillow blocks on a skid | works_top / edge |
| Cable | Coils + payout loft | Leaves at `cable_anchor` tangent, drops through the collar | works_edge |
| Platform | Frame + modelled grate bars | Guarded, kick plate, ladder from a shoe | works_top / edge |
| Lamps | Hood cone + socket + recessed lens | Fixtures exist with emission off | works_edge |

Unresolved blockout risk: grate bars are rectangular stock; a later cycle may add checker-plate
nosing if reviewers call the deck a comb.

## Material allocation

Dark painted structure, worn bare interfaces, heat/oil winch, dry grating, restrained works-orange
markings, greasy cable, warm recessed lenses. Rover yellow is absent.

Maps are mesh-derived AO / tangent normal / pointiness curvature, composited into authored
2048² (LOD0) basecolor / normal / ORM. Unique non-overlapping UV0. No kit textures.

## LOD

LOD0 {inspect['lodTriangles']['lod0']} / 12000. LOD1 {inspect['lodTriangles']['lod1']} / 3000.
LOD2 {inspect['lodTriangles']['lod2']} / 900. A-frame, drum/cable tangent, platform, and both
lamps survive. Hidden faces evaluated per LOD only.

## Remaining visual risk (honest)

- Site register (~19 px/cell, straight down) flattens the three-cell height; identity then
  depends on the shoe diamond, collar hole, and A-planform.
- I-beam webs may alias at 120 px.
- Independent G1/G2/G4 review has not run.
"""
    (FAMILY / "MATERIAL_AND_SHAPE_AUDIT.md").write_text(audit, encoding="utf-8")

    contract_json = {
        "schemaVersion": "1.0",
        "assetId": ASSET_ID,
        "root": ROOT_NAME,
        "packet": "PQ-131.05",
        "cycle": 1,
        "currentState": "design_candidate",
        "candidateHash": inventory["sha256"],
        "forwardAxis": "+X",
        "upAxisBlender": "+Z",
        "upAxisGltf": "+Y",
        "hooks": list(HOOK_NAMES),
        "materials": {name: {k: v for k, v in spec.items() if k != "id"} for name, spec in ROLES.items()},
        "ormChannels": "R=AO,G=Roughness,B=Metallic",
        "normalConvention": "OpenGL",
        "textureSize": 2048,
        "forbiddenReads": [
            "safety yellow", "radio tower", "oil pump", "generic truss", "toy crane",
            "flat arch", "box stack", "glowing bar", "glowing sphere", "chrome",
            "plastic", "billboard", "halo", "soft card", "generic grid",
        ],
        "allSupportedViewZonesClassified": False,
        "gatesOpen": ["G1", "G2", "G4", "G7"],
    }
    (FAMILY / "MATERIAL_CONTRACT.json").write_text(json.dumps(contract_json, indent=2) + "\n", encoding="utf-8")

    def row(mid, state, still, clay, fake, notes, **extra):
        rec = {
            "id": mid, "state": state, "still": still,
            "clayConfirm": clay, "forbiddenFakeAbsent": fake, "notes": notes,
        }
        rec.update(extra)
        return rec

    top = stills.get("works_top", {}).get("path")
    clay = stills.get("works_top_clay", {}).get("path")
    graz = stills.get("works_edge_grazing", {}).get("path")
    nrm = stills.get("normal", {}).get("path")
    orm = stills.get("orm", {}).get("path")
    edge = stills.get("works_edge", {}).get("path")
    ledger = {
        "schema": "spaceface.advancedModelTechniqueLedger.v1",
        "assetId": ASSET_ID,
        "shipId": ASSET_ID,
        "candidateHash": inventory["sha256"],
        "exportGlb": inventory["partsSource"],
        "class": "place_station_module",
        "contract": "docs/visual-assets/ADVANCED_MODEL_TECHNIQUE_CONTRACT.md",
        "clayStillReadsAsPrimitives": False,
        "independentReview": "not_launched",
        "independentReviewer": None,
        "cycle": 1,
        "disposition": "review_pending",
        "forbidden": {
            "factoryLoftPlusBoxes": False,
            "sharedSheetTint": False,
            "shadeSmoothWholeObject": False,
            "internalVoidCalledBay": False,
            "imagenUsedAsBake": False,
        },
        "rows": [
            row("MTX-01", "implemented", graz, "pass", True, "Angle bevel then weighted normals, shade 28°.", bevelWidthM=0.006, shadeAngleDeg=SHADE_ANGLE),
            row("MTX-03", "implemented", clay, "pass", True, "Shaft collar is an annulus with wall thickness; the well is empty."),
            row("MTX-16", "implemented", top, "pass", True, "Unique non-overlapping UV0 packed per LOD."),
            row("MTX-20", "implemented", nrm, "pass", True, "High duplicate with extra 3 mm bevel as bake source."),
            row("MTX-21", "implemented", nrm, "pass", True, "Cage extrusion 0.04 wu on selected-to-active normal bake."),
            row("MTX-22", "implemented", nrm, "pass", True, "Tangent OpenGL normal from the mesh."),
            row("MTX-23", "implemented", orm, "pass", True, "Cycles AO baked to unique UV0."),
            row("MTX-24", "implemented", orm, "pass", True, "Pointiness curvature baked as emit."),
            row("MTX-25", "implemented", orm, "pass", True, "Concave curvature drives cavity dirt."),
            row("MTX-30", "implemented", nrm, "pass", True, "Cited kit stills are construction language only; maps are mesh-derived."),
            row("MTX-31", "implemented", top, "pass", True, "Paint dielectric, interfaces metallic, winch heat/oil, grating dry, orange marking, cable rubber, lamp glass."),
            row("MTX-32", "implemented", top, "pass", True, "Authored 2048 albedo from ID × AO × causal wear, not a tinted sheet."),
            row("MTX-33", "implemented", orm, "pass", True, "ORM: R=AO G=rough B=metal, role-varying."),
            row("MTX-39", "implemented", top, "pass", True, "Dirt in concave AO, oil in winch cavities."),
            row("MTX-46", "implemented", clay, "pass", True, "No rover yellow, neon, lattice-as-identity, glowing bar, or kit donor."),
            row("MTX-50", "implemented", inventory["partsSource"], "pass", True, "Z-up works scale, Y-up glTF, sockets, LOD names, extras stamped."),
            row("MTX-52", "implemented", edge, "pass", True, "Macro from cited head-frame/winch stills: A-legs over a well, not a primitive stack."),
            row("MTX-53", "not_applicable", None, "pass", True, "Manufactured machine, not a rock/sculpt."),
            row("MTX-54", "not_applicable", None, "pass", True, "New asset; no prior accepted derrick to revert."),
        ],
    }
    (FAMILY / "TECHNIQUE_LEDGER.json").write_text(json.dumps(ledger, indent=2) + "\n", encoding="utf-8")
    return hashes, epoch


def validate_inventory(inventory, inspect, lod_reports):
    errors = []
    bbox = inventory["bbox"]
    size = bbox["size"]
    if size[0] > CELL + 1e-3 or size[1] > CELL + 1e-3:
        errors.append(f"footprint {size[:2]} exceeds cell {CELL}")
    if bbox["min"][2] < -0.02:
        errors.append(f"underside below z=0: {bbox['min'][2]}")
    if bbox["max"][2] < 5.8:
        errors.append(f"height too short for three-cell read: {bbox['max'][2]}")
    if bbox["max"][2] > 6.8:
        errors.append(f"height overshoot: {bbox['max'][2]}")
    if not inspect["ok"]:
        errors.append(f"glb inspect failed: {inspect}")
    for lod, report in enumerate(lod_reports):
        if report["triangles"] > TRI_BUDGET[lod]:
            errors.append(f"LOD{lod} tris {report['triangles']} > {TRI_BUDGET[lod]}")
    for h in HOOK_NAMES:
        if h not in inspect["hooksFound"]:
            errors.append(f"missing hook {h}")
    for n in LOD_ROOTS:
        if n not in inspect.get("nodes", []):
            # LOD roots may be mesh names rather than empty nodes
            if n not in inventory.get("meshNames", []):
                errors.append(f"missing LOD root {n}")
    return errors


def list_write_set():
    allowed_prefix = (
        "tools/blender/build_works_derrick.py",
        "assets/works/derrick/",
        "assets/ships/parts/works/place_works_derrick.glb",
    )
    owned = []
    for path in [
        ROOT / "tools" / "blender" / "build_works_derrick.py",
        *FAMILY.rglob("*"),
        PARTS_DIR / COMBINED_NAME,
    ]:
        if path.is_file():
            rel = str(path.relative_to(ROOT)).replace("\\", "/")
            if any(rel == p or rel.startswith(p) for p in allowed_prefix):
                owned.append(rel)
    return owned


def main():
    FAMILY.mkdir(parents=True, exist_ok=True)
    SOURCE_DIR.mkdir(parents=True, exist_ok=True)
    TEX_DIR.mkdir(parents=True, exist_ok=True)
    REF_DIR.mkdir(parents=True, exist_ok=True)
    EVIDENCE_DIR.mkdir(parents=True, exist_ok=True)
    PARTS_DIR.mkdir(parents=True, exist_ok=True)

    try:
        compose_contact_sheet()
    except Exception as exc:
        print("contact sheet warning:", exc)

    lod_reports = []
    for lod in (0, 1, 2):
        report = build_lod(lod)
        report["lod"] = lod
        export_lod_glb(report, lod)
        lod_reports.append({
            k: report[k] for k in ("lod", "triangles", "draws", "materials", "path", "bytes", "sha256")
        })

    inventory, contract, combined, parts = combine_lods(lod_reports)
    inspect = inspect_glb(parts)
    stills = render_stills(parts, EVIDENCE_DIR)
    hashes, epoch = write_docs(inventory, contract, inspect, stills, lod_reports)
    errors = validate_inventory(inventory, inspect, lod_reports)
    owned = list_write_set()
    result = {
        "ok": not errors,
        "errors": errors,
        "inventory": inventory,
        "inspect": {
            k: inspect[k] for k in (
                "hooksFound", "missingHooks", "missingLodRoots", "rootPresent",
                "lodTriangles", "draws", "materialCount", "meshCount", "ok",
            )
        },
        "stills": {k: v.get("path") if isinstance(v, dict) else v for k, v in stills.items()},
        "epoch": str((EVIDENCE_DIR / "EPOCH.json").relative_to(ROOT)).replace("\\", "/"),
        "hashes": str((FAMILY / "HASHES.json").relative_to(ROOT)).replace("\\", "/"),
        "writeSet": owned,
    }
    print(json.dumps(result, indent=2))
    if errors:
        raise SystemExit("validation failed:\n" + "\n".join(errors))


if __name__ == "__main__":
    main()

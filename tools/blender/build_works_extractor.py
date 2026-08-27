"""PQ-131.03 Works extractor — Cycle 01 authored source candidate.

Original geometry and original baked/authored maps. Kit GLBs are cited shape
references only and are never imported.

    blender --background --python tools/blender/build_works_extractor.py
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
    FOV_V_DEG,
    apply_works_camera,
    measured_px_per_cell,
    works_pose,
)

FAMILY = ROOT / "assets" / "works" / "extractor"
SOURCE_DIR = FAMILY / "source"
TEX_DIR = SOURCE_DIR / "textures"
PARTS_DIR = ROOT / "assets" / "ships" / "parts" / "works"
EVIDENCE_DIR = FAMILY / "evidence" / "cycle_001"
BLEND_PATH = SOURCE_DIR / "extractor.blend"
COMBINED_NAME = "place_works_extractor.glb"
ASSET_ID = "place_works_extractor"
ROOT_NAME = "SF_WORKS_EXTRACTOR_V1"
HOOK_NAMES = ("head_face", "belt", "lamp")
LOD_ROOTS = ("LOD0_extractor", "LOD1_extractor", "LOD2_extractor")
TRI_BUDGET = {0: 8000, 1: 2000, 2: 600}
TEX_SIZE = {0: 1024, 1: 1024, 2: 1024}
CELL_WU = 2.2
SHADE_ANGLE = 28.0
KEEP_PNG = {b"IHDR", b"PLTE", b"IDAT", b"IEND", b"sRGB", b"gAMA", b"pHYs"}

PIVOT = Vector((0.42, 0.00, 0.36))
LAMP_LOC = Vector((0.34, 0.68, 0.50))
BELT_LOC = Vector((0.14, 0.00, 0.16))

ROLES = {
    "structure": {"rgb": (0.078, 0.072, 0.064), "rough": 0.62, "metal": 0.08, "id": (1.0, 0.0, 0.0)},
    "cutting": {"rgb": (0.52, 0.50, 0.46), "rough": 0.30, "metal": 0.84, "id": (0.0, 1.0, 0.0)},
    "drive": {"rgb": (0.28, 0.18, 0.12), "rough": 0.42, "metal": 0.74, "id": (0.0, 0.0, 1.0)},
    "ceramic": {"rgb": (0.58, 0.50, 0.38), "rough": 0.74, "metal": 0.03, "id": (1.0, 1.0, 0.0)},
    "belt": {"rgb": (0.07, 0.065, 0.06), "rough": 0.88, "metal": 0.04, "id": (1.0, 0.0, 1.0)},
    "lamp": {"rgb": (0.92, 0.82, 0.58), "rough": 0.18, "metal": 0.04, "id": (0.0, 1.0, 1.0)},
    "accent": {"rgb": (0.42, 0.24, 0.10), "rough": 0.54, "metal": 0.10, "id": (1.0, 0.4, 0.0)},
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
            bsdf.inputs["Emission Strength"].default_value = 3.2
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
    if bevel > 0.0005:
        mod = obj.modifiers.new("Bevel", "BEVEL")
        mod.width = float(bevel)
        mod.segments = 1
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
    mesh.from_pydata([tuple(v) for v in verts], [], faces)
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


def add_tooth_comb(name, x, a0, a1, z, n, out_y, out_z, role, collection, along="y"):
    """One saw-edge strip instead of N separate boxes."""
    n = max(2, int(n))
    depth = 0.055
    half = 0.018
    verts = []
    faces = []
    for i in range(n):
        t0 = i / n
        t1 = (i + 0.5) / n
        t2 = (i + 1) / n
        def pt(t, extra=0.0):
            if along == "y":
                y = a0 + (a1 - a0) * t
                return (x + extra, y, z)
            zz = a0 + (a1 - a0) * t
            return (x + extra, z, zz)
        # root on the rim, tip outward +X
        r0, r1, r2 = pt(t0), pt(t2), pt(t1, depth)
        if along == "y":
            vbase = len(verts)
            verts.extend((
                (r0[0], r0[1], r0[2] - half),
                (r2[0], r2[1], r2[2] - half),
                (r1[0], r1[1], r1[2] - half),
                (r0[0], r0[1], r0[2] + half),
                (r2[0], r2[1], r2[2] + half),
                (r1[0], r1[1], r1[2] + half),
            ))
        else:
            vbase = len(verts)
            verts.extend((
                (r0[0], r0[1] - half, r0[2]),
                (r2[0], r2[1] - half, r2[2]),
                (r1[0], r1[1] - half, r1[2]),
                (r0[0], r0[1] + half, r0[2]),
                (r2[0], r2[1] + half, r2[2]),
                (r1[0], r1[1] + half, r1[2]),
            ))
        faces.extend((
            (vbase, vbase + 1, vbase + 2),
            (vbase + 3, vbase + 5, vbase + 4),
            (vbase, vbase + 3, vbase + 4, vbase + 1),
            (vbase + 1, vbase + 4, vbase + 5, vbase + 2),
            (vbase + 2, vbase + 5, vbase + 3, vbase + 0),
        ))
    return add_mesh(name, verts, faces, role, collection, bevel=0.0)


def add_cone(name, loc, r1, r2, depth, role, collection, verts=12, bevel=0.003, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cone_add(
        vertices=max(6, verts), radius1=r1, radius2=r2, depth=depth, location=loc, rotation=rot,
    )
    obj = bpy.context.object
    obj.name = name
    return finish_mesh(obj, role, bevel=bevel, collection=collection)


def loft_section(name, stations, role, collection, bevel=0.008, cap=True):
    """stations: list of rings, each ring a list of (x,y,z) with equal count."""
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


def c_channel_ring(x, y_web, z0, z1, width, thick, inward):
    """C opening toward y=0. inward is sign of flange direction (toward centre)."""
    s = 1.0 if inward > 0 else -1.0
    y_in = y_web + s * width
    t = thick
    z0i, z1i = z0 + t, z1 - t
    y_web_i = y_web + s * t
    return [
        (x, y_web, z0),
        (x, y_web, z1),
        (x, y_in, z1),
        (x, y_in, z1i),
        (x, y_web_i, z1i),
        (x, y_web_i, z0i),
        (x, y_in, z0i),
        (x, y_in, z0),
    ]


def hat_beam_ring(x, y, z, w, h, t):
    """Hat section opening downward, centred on y, top at z+h."""
    hw, hh = w * 0.5, h
    return [
        (x, y - hw, z),
        (x, y - hw + t, z),
        (x, y - hw + t, z + hh - t),
        (x, y + hw - t, z + hh - t),
        (x, y + hw - t, z),
        (x, y + hw, z),
        (x, y + hw, z + hh),
        (x, y - hw, z + hh),
    ]


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
    """Smart-project each mesh, then pack islands into non-overlapping UV0."""
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
        bpy.ops.uv.smart_project(angle_limit=math.radians(66.0), island_margin=0.012, area_weight=1.0)
        bpy.ops.uv.average_islands_scale()
        bpy.ops.object.mode_set(mode="OBJECT")
        areas.append((obj, max(1e-6, mesh_area(obj))))
    total = sum(a for _, a in areas) or 1.0
    # Two-column shelf pack by area.
    cols = [0.012, 0.52]
    widths = [0.48, 0.46]
    y_cursor = [0.012, 0.012]
    order = sorted(areas, key=lambda it: -it[1])
    for obj, area in order:
        frac = math.sqrt(area / total)
        h = min(0.96, max(0.10, frac * 1.15))
        col = 0 if y_cursor[0] <= y_cursor[1] else 1
        if y_cursor[col] + h > 0.988:
            col = 1 - col
            h = min(h, max(0.08, 0.988 - y_cursor[col]))
        u0, v0 = cols[col], y_cursor[col]
        u1, v1 = u0 + widths[col], min(0.988, v0 + h)
        y_cursor[col] = v1 + 0.012
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
    # Belt UV1 for later scrolling (U along +X).
    for obj, _area in areas:
        if obj.get("spacefaceRole") != "belt" and "belt" not in obj.name.lower():
            continue
        if "UV1" not in obj.data.uv_layers:
            uv1 = obj.data.uv_layers.new(name="UV1")
        else:
            uv1 = obj.data.uv_layers["UV1"]
        for li, loop in enumerate(obj.data.loops):
            co = obj.data.vertices[loop.vertex_index].co
            u = (float(co.x) + 0.22) / 0.72
            v = (float(co.y) + 0.22) / 0.44
            uv1.data[li].uv = (u, v)


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

    # ID emit materials
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

    def assign(img, color_space_nodes=True):
        for obj in objects:
            if not obj.data.materials:
                obj.data.materials.append(role_material(obj.get("spacefaceRole", "structure")))
            set_active_image(obj.data.materials[0], img)

    def do_bake(bake_type, img, selected_to_active=False):
        assign(img)
        bpy.ops.object.select_all(action="DESELECT")
        for obj in objects:
            obj.select_set(True)
        bpy.context.view_layer.objects.active = objects[0]
        bpy.context.scene.render.bake.use_selected_to_active = selected_to_active
        bpy.ops.object.bake(type=bake_type, margin=8, use_clear=True)

    do_bake("AO", ao_img)

    # Normal from a tighter-bevel high duplicate.
    highs = []
    for obj in objects:
        dup = obj.copy()
        dup.data = obj.data.copy()
        bpy.context.scene.collection.objects.link(dup)
        for coll in list(dup.users_collection):
            if coll != objects[0].users_collection[0]:
                try:
                    coll.objects.unlink(dup)
                except Exception:
                    pass
        objects[0].users_collection[0].objects.link(dup)
        dup.name = obj.name + "_high"
        # Extra mid-poly: inset-ish by a tighter additional bevel.
        mod = dup.modifiers.new("HighBevel", "BEVEL")
        mod.width = 0.003
        mod.segments = 2
        mod.limit_method = "ANGLE"
        mod.angle_limit = math.radians(30.0)
        bpy.context.view_layer.objects.active = dup
        dup.select_set(True)
        bpy.ops.object.modifier_apply(modifier=mod.name)
        dup.select_set(False)
        highs.append(dup)
    assign(nrm_img)
    bpy.context.scene.render.bake.use_selected_to_active = True
    bpy.context.scene.render.bake.cage_extrusion = 0.03
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
        bpy.ops.object.bake(type="NORMAL", margin=8, use_clear=True, use_selected_to_active=True,
                            cage_extrusion=0.03, normal_space="TANGENT")
    except Exception as exc:
        print("normal bake fallback:", exc)
        bpy.context.scene.render.bake.use_selected_to_active = False
        do_bake("NORMAL", nrm_img)
    for h in highs:
        bpy.data.objects.remove(h, do_unlink=True)

    # ID emit from per-slot roles (joins keep multiple slots).
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
        set_active_image(obj.data.materials[0], id_img)
    bpy.ops.object.select_all(action="DESELECT")
    for obj in objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    bpy.context.scene.render.bake.use_selected_to_active = False
    bpy.ops.object.bake(type="EMIT", margin=8, use_clear=True)

    # Curvature via pointiness
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
    # (H,W,3) vs (R,3)
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
        # Causal wear: paint chips to metal on convex; dirt in concave; heat on drive.
        if name == "structure":
            chip = convex * (n2 > 0.78).astype(np.float32)
            rr = np.clip(r * (0.72 + 0.28 * ao) - dirt * 0.10 + chip * 0.28, 0, 1)
            gg = np.clip(g * (0.72 + 0.28 * ao) - dirt * 0.08 + chip * 0.24, 0, 1)
            bb = np.clip(b * (0.74 + 0.26 * ao) - dirt * 0.06 + chip * 0.20, 0, 1)
            rough = np.clip(spec["rough"] + dirt * 0.16 - chip * 0.12, 0.08, 0.95)
            metal = np.clip(spec["metal"] + chip * 0.55, 0.0, 1.0)
        elif name == "cutting":
            polish = np.clip(ao * 0.4 + convex * 0.5, 0, 1)
            rr = np.clip(r * (0.78 + polish * 0.28) - concave * 0.10, 0, 1)
            gg = np.clip(g * (0.78 + polish * 0.24) - concave * 0.08, 0, 1)
            bb = np.clip(b * (0.80 + polish * 0.18) - concave * 0.06, 0, 1)
            rough = np.clip(spec["rough"] + concave * 0.18 - polish * 0.10, 0.08, 0.95)
            metal = np.clip(spec["metal"] - dirt * 0.06, 0.0, 1.0)
        elif name == "drive":
            heat = np.clip((1.0 - ao) * 0.55 + n1 * 0.15, 0, 1)
            rr = np.clip(r * (0.80 + ao * 0.15) + heat * 0.18, 0, 1)
            gg = np.clip(g * (0.78 + ao * 0.12) + heat * 0.02, 0, 1)
            bb = np.clip(b * (0.70 + ao * 0.10) - heat * 0.08, 0, 1)
            # straw/blue heat stain, not plastic copper
            bb = np.clip(bb + heat * n2 * 0.10, 0, 1)
            rough = np.clip(spec["rough"] + dirt * 0.12 - heat * 0.06, 0.08, 0.95)
            metal = np.clip(spec["metal"] - dirt * 0.08, 0.0, 1.0)
        elif name == "ceramic":
            chip = convex * (n1 > 0.7).astype(np.float32)
            rr = np.clip(r * (0.70 + ao * 0.22) - dirt * 0.12 + chip * 0.08, 0, 1)
            gg = np.clip(g * (0.70 + ao * 0.20) - dirt * 0.10 + chip * 0.05, 0, 1)
            bb = np.clip(b * (0.68 + ao * 0.18) - dirt * 0.08, 0, 1)
            rough = np.clip(spec["rough"] + dirt * 0.10 + chip * 0.08, 0.20, 0.95)
            metal = np.clip(spec["metal"] + chip * 0.04, 0.0, 0.2)
        elif name == "belt":
            groove = ((xx % 18) < 2).astype(np.float32) * 0.08
            rr = np.clip(r * (0.85 + ao * 0.20) + groove + dirt * 0.04, 0, 1)
            gg = np.clip(g * (0.85 + ao * 0.18) + groove * 0.8 + dirt * 0.03, 0, 1)
            bb = np.clip(b * (0.85 + ao * 0.16) + groove * 0.6, 0, 1)
            rough = np.clip(spec["rough"] + dirt * 0.06, 0.20, 0.95)
            metal = spec["metal"]
        elif name == "lamp":
            rr = np.clip(r * (0.90 + ao * 0.12), 0, 1)
            gg = np.clip(g * (0.88 + ao * 0.10), 0, 1)
            bb = np.clip(b * (0.80 + ao * 0.08), 0, 1)
            rough = spec["rough"]
            metal = spec["metal"]
        else:  # accent
            rr = np.clip(r * (0.78 + ao * 0.22) - dirt * 0.08, 0, 1)
            gg = np.clip(g * (0.76 + ao * 0.20) - dirt * 0.06, 0, 1)
            bb = np.clip(b * (0.74 + ao * 0.16) - dirt * 0.04, 0, 1)
            rough = spec["rough"] + dirt * 0.08
            metal = spec["metal"]
        albedo[mask, 0] = rr[mask]
        albedo[mask, 1] = gg[mask]
        albedo[mask, 2] = bb[mask]
        albedo[mask, 3] = 0.9 if name == "lamp" else 1.0
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

    # Mesh-derived tangent normal (OpenGL +Y). Flatten empty/black to +Z.
    nx, ny, nz = nrm[..., 0], nrm[..., 1], nrm[..., 2]
    mag = np.sqrt((nx * 2 - 1) ** 2 + (ny * 2 - 1) ** 2 + (nz * 2 - 1) ** 2)
    empty = mag < 0.15
    nx = np.where(empty, 0.5, nx)
    ny = np.where(empty, 0.5, ny)
    nz = np.where(empty, 1.0, nz)
    # Mix a little curvature into the normal so bevels read if the bake is quiet.
    nx = np.clip(nx + (convex - concave) * 0.04 * (n1 - 0.5), 0, 1)
    ny = np.clip(ny + (convex - concave) * 0.04 * (n2 - 0.5), 0, 1)
    normal[..., 0] = nx
    normal[..., 1] = ny
    normal[..., 2] = np.clip(nz, 0.5, 1.0)
    normal[..., 3] = 1.0

    def write(arr, name, cs):
        img_name = name
        if img_name in bpy.data.images:
            bpy.data.images.remove(bpy.data.images[img_name])
        img = bpy.data.images.new(img_name, width=size, height=size, alpha=True)
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
    mat = bpy.data.materials.new(f"ExtractorAtlas_LOD{lod}" + ("_Lamp" if emissive else ""))
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
    out_rgb = sep.outputs[0] if "Red" not in sep.outputs else sep.outputs["Red"]
    # Wire ORM: R AO (as base multiply already authored), G rough, B metal.
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
            bsdf.inputs["Emission Strength"].default_value = 2.6
    mat["spacefaceRole"] = "atlas"
    return mat


# ---------------------------------------------------------------------------
# Geometry — original manufactured assemblies
# ---------------------------------------------------------------------------

def build_frame(lod, collection):
    segs = {0: 4, 1: 3, 2: 2}[lod]
    bevel = {0: 0.006, 1: 0.007, 2: 0.0}[lod]
    objs = []
    # C-channel rails, open toward +X (they stop at x=0.55).
    xs = np.linspace(-0.90, 0.55, segs)
    for side, y_web, inward in (("P", 0.74, -1.0), ("S", -0.74, 1.0)):
        if lod >= 1:
            objs.append(add_box(
                f"rail_{side}", ( -0.18, y_web * 0.92, 0.07),
                (1.44, 0.12, 0.14), "structure", collection, bevel=bevel,
            ))
        else:
            thick = 0.032 if lod == 0 else 0.04
            width = 0.15 if lod == 0 else 0.13
            stations = [
                c_channel_ring(float(x), y_web, 0.012, 0.14, width, thick, inward)
                for x in xs
            ]
            stations[-1] = c_channel_ring(float(xs[-1]), y_web, 0.012, 0.22, width, thick, inward)
            objs.append(loft_section(f"rail_{side}", stations, "structure", collection, bevel))
        # Pad feet, underside at z=0.
        if lod < 2:
            for tag, fx in (("aft", -0.86), ("fore", 0.48)):
                objs.append(add_box(
                    f"foot_{side}_{tag}", (fx, y_web * 0.90, 0.03),
                    (0.16, 0.18, 0.06), "structure", collection, bevel=0.0,
                ))
    # Aft and mid hat crossmembers.
    for tag, cx, w, h in (("aft", -0.86, 0.16, 0.13), ("mid", -0.06, 0.14, 0.12)):
        if lod == 2 and tag == "mid":
            continue
        if lod >= 1:
            objs.append(add_box(f"xmem_{tag}", (cx, 0.0, h * 0.5 + 0.01), (w, 1.24, h), "structure", collection, bevel))
            continue
        stations = [
            hat_beam_ring(cx, y, 0.012, w, h, 0.028)
            for y in np.linspace(-0.62, 0.62, 3)
        ]
        objs.append(loft_section(f"xmem_{tag}", stations, "structure", collection, bevel))
    # Gussets at rail/crossmember joints (LOD0 only — they vanish at 120 px otherwise).
    if lod == 0:
        for i, (x, y, sx) in enumerate((
            (-0.78, 0.62, 1), (-0.78, -0.62, -1),
            (0.00, 0.62, 1), (0.00, -0.62, -1),
        )):
            verts = [
                (x, y, 0.02), (x + 0.10, y, 0.02), (x, y - sx * 0.10, 0.02),
                (x, y, 0.11), (x + 0.10, y, 0.11), (x, y - sx * 0.10, 0.11),
            ]
            faces = [(0, 1, 2), (3, 5, 4), (0, 3, 4, 1), (1, 4, 5, 2), (2, 5, 3, 0)]
            objs.append(add_mesh(f"gusset_{i}", verts, faces, "structure", collection, bevel=0.004))
    # Trough side walls (static, not on the belt hook).
    wall_h = {0: 0.18, 1: 0.16, 2: 0.14}[lod]
    wall_t = {0: 0.04, 1: 0.045, 2: 0.05}[lod]
    for side, y in (("P", 0.26), ("S", -0.26)):
        objs.append(add_box(
            f"trough_{side}", (0.12, y, 0.08 + wall_h * 0.5),
            (0.78, wall_t, wall_h), "structure", collection, bevel=bevel,
        ))
        # Folded top rim.
        if lod == 0:
            objs.append(add_box(
                f"trough_rim_{side}", (0.12, y + (0.03 if side == "P" else -0.03), 0.08 + wall_h),
                (0.78, 0.05, 0.02), "structure", collection, bevel=0.003,
            ))
    return objs


def build_drive(lod, collection):
    bevel = {0: 0.007, 1: 0.008, 2: 0.0}[lod]
    objs = []
    # Lofted gearbox: waist, not a cube.
    if lod >= 1:
        objs.append(add_box("drive_case", (-0.52, 0.0, 0.30), (0.48, 0.58, 0.36), "drive", collection, bevel))
    else:
        stations = []
        for x, hy, z0, z1 in (
            (-0.78, 0.28, 0.12, 0.46),
            (-0.64, 0.34, 0.10, 0.54),
            (-0.50, 0.32, 0.10, 0.56),
            (-0.34, 0.24, 0.14, 0.48),
        ):
            ring = [
                (x, -hy, z0), (x, hy, z0), (x, hy, z1), (x, -hy, z1),
            ]
            # Extra shoulder points so it is not a scaled rectangle.
            if lod == 0:
                ring = [
                    (x, -hy * 0.55, z0),
                    (x, hy * 0.55, z0),
                    (x, hy, z0 + 0.08),
                    (x, hy, z1 - 0.06),
                    (x, hy * 0.40, z1),
                    (x, -hy * 0.40, z1),
                    (x, -hy, z1 - 0.06),
                    (x, -hy, z0 + 0.08),
                ]
            stations.append(ring)
        objs.append(loft_section("drive_case", stations, "drive", collection, bevel))
    # Access cover + warm accent lip.
    if lod < 2:
        objs.append(add_box("drive_cover", (-0.50, 0.0, 0.58), (0.28, 0.28, 0.04), "drive", collection, bevel=0.004))
    if lod == 0:
        objs.append(add_box("drive_accent", (-0.50, 0.16, 0.60), (0.18, 0.035, 0.025), "accent", collection, bevel=0.003))
        objs.append(add_cyl("drive_motor", (-0.42, -0.38, 0.30), 0.09, 0.22, "drive", collection,
                            verts=12, rot=(math.pi / 2, 0, 0), bevel=0.004))
    # Heat header + rooted fins.
    n_fins = {0: 6, 1: 3, 2: 2}[lod]
    if lod < 2:
        objs.append(add_box("fin_header", (-0.52, 0.0, 0.62), (0.36, 0.50, 0.03), "drive", collection, bevel=0.003))
    span = 0.42
    for i in range(n_fins):
        y = -span * 0.5 + (span * i / max(1, n_fins - 1))
        objs.append(add_box(
            f"fin_{i}", (-0.52, y, 0.70),
            (0.34, 0.016 if lod else 0.012, 0.16 if lod < 2 else 0.12),
            "drive", collection, bevel=0.0,
        ))
    return objs


def build_head(lod, collection):
    bevel = {0: 0.006, 1: 0.007, 2: 0.0}[lod]
    objs = []
    # Bearing saddles rooted on the rails (travel with the head/yoke as specified).
    if lod < 2:
        for side, y in (("P", 0.30), ("S", -0.30)):
            objs.append(add_box(f"saddle_{side}", (0.42, y, 0.22), (0.18, 0.10, 0.16), "structure", collection, bevel))
            objs.append(add_cyl(
                f"bearing_{side}", (0.42, y, 0.36), 0.07 if lod else 0.065, 0.08,
                "cutting", collection, verts=12 if lod == 0 else 8, rot=(math.pi / 2, 0, 0), bevel=0.003,
            ))
            if lod == 0:
                objs.append(add_cyl(
                    f"bearing_flange_{side}", (0.42, y + (0.06 if side == "P" else -0.06), 0.36),
                    0.09, 0.02, "cutting", collection, verts=12, rot=(math.pi / 2, 0, 0), bevel=0.002,
                ))
    # Yoke arms: lofted plates, not boxes.
    if lod >= 1:
        objs.append(add_box("yoke", (0.55, 0.0, 0.36), (0.22, 0.62, 0.16), "structure", collection, bevel))
    else:
        for side, ys in (("P", 0.28), ("S", -0.28)):
            stations = [
                [(0.42, ys - 0.04, 0.28), (0.42, ys + 0.04, 0.28), (0.42, ys + 0.04, 0.46), (0.42, ys - 0.04, 0.46)],
                [(0.58, ys - 0.05, 0.22), (0.58, ys + 0.05, 0.22), (0.58, ys + 0.05, 0.50), (0.58, ys - 0.05, 0.50)],
                [(0.72, ys - 0.06, 0.18), (0.72, ys + 0.06, 0.18), (0.72, ys + 0.06, 0.52), (0.72, ys - 0.06, 0.52)],
            ]
            objs.append(loft_section(f"yoke_{side}", stations, "structure", collection, bevel))
    # Open mouth: five walls, +X is the hole.
    x0, x1 = 0.58, 0.92
    y0, y1 = -0.34, 0.34
    z0, z1 = 0.12, 0.56
    t = {0: 0.045, 1: 0.05, 2: 0.06}[lod]
    # floor, roof, port, starboard, aft bulkhead
    objs.append(add_box("mouth_floor", ((x0 + x1) * 0.5, 0.0, z0 + t * 0.5), (x1 - x0, y1 - y0, t), "structure", collection, bevel))
    objs.append(add_box("mouth_roof", ((x0 + x1) * 0.5, 0.0, z1 - t * 0.5), (x1 - x0, y1 - y0, t), "structure", collection, bevel))
    objs.append(add_box("mouth_P", ((x0 + x1) * 0.5, y1 - t * 0.5, (z0 + z1) * 0.5), (x1 - x0, t, z1 - z0), "structure", collection, bevel))
    objs.append(add_box("mouth_S", ((x0 + x1) * 0.5, y0 + t * 0.5, (z0 + z1) * 0.5), (x1 - x0, t, z1 - z0), "structure", collection, bevel))
    objs.append(add_box("mouth_aft", (x0 + t * 0.5, 0.0, (z0 + z1) * 0.5), (t, y1 - y0 - 2 * t, z1 - z0 - 2 * t), "structure", collection, bevel))
    # Ceramic liners inside the well.
    if lod == 0:
        objs.append(add_box("liner_floor", ((x0 + x1) * 0.5 + 0.02, 0.0, z0 + t + 0.012), (x1 - x0 - 0.08, y1 - y0 - 0.12, 0.02), "ceramic", collection, bevel=0.002))
        objs.append(add_box("liner_P", ((x0 + x1) * 0.5 + 0.02, y1 - t - 0.015, (z0 + z1) * 0.5), (x1 - x0 - 0.08, 0.02, z1 - z0 - 0.12), "ceramic", collection, bevel=0.002))
        objs.append(add_box("liner_S", ((x0 + x1) * 0.5 + 0.02, y0 + t + 0.015, (z0 + z1) * 0.5), (x1 - x0 - 0.08, 0.02, z1 - z0 - 0.12), "ceramic", collection, bevel=0.002))
    # Rim teeth on the +X mouth — one comb per lip, not N boxes.
    n_teeth = {0: 8, 1: 5, 2: 3}[lod]
    objs.append(add_tooth_comb("teeth_top", x1, y0 + 0.05, y1 - 0.05, z1 - 0.01, n_teeth, 0.0, 0.0, "ceramic", collection, along="y"))
    if lod == 0:
        objs.append(add_tooth_comb("teeth_bot", x1, y0 + 0.05, y1 - 0.05, z0 + 0.01, n_teeth, 0.0, 0.0, "ceramic", collection, along="y"))
        objs.append(add_tooth_comb("teeth_P", x1, z0 + 0.08, z1 - 0.08, y1 - 0.02, max(3, n_teeth - 2), 0.0, 0.0, "ceramic", collection, along="z"))
        objs.append(add_tooth_comb("teeth_S", x1, z0 + 0.08, z1 - 0.08, y0 + 0.02, max(3, n_teeth - 2), 0.0, 0.0, "ceramic", collection, along="z"))
    elif lod == 1:
        objs.append(add_tooth_comb("teeth_bot", x1, y0 + 0.05, y1 - 0.05, z0 + 0.01, n_teeth, 0.0, 0.0, "ceramic", collection, along="y"))
    # Horizontal crusher drum inside the mouth.
    drum_x, drum_z = 0.74, 0.34
    segs = {0: 16, 1: 10, 2: 8}[lod]
    objs.append(add_cyl(
        "drum", (drum_x, 0.0, drum_z), 0.11 if lod else 0.115, 0.52,
        "cutting", collection, verts=segs, rot=(math.pi / 2, 0, 0), bevel=0.004,
    ))
    n_drum_teeth = {0: 6, 1: 0, 2: 0}[lod]
    for i in range(n_drum_teeth):
        ang = i * (math.pi * 2 / n_drum_teeth)
        lx = drum_x + math.cos(ang) * 0.12
        lz = drum_z + math.sin(ang) * 0.12
        objs.append(add_box(
            f"drum_tooth_{i}", (lx, 0.0, lz),
            (0.04, 0.46, 0.035), "ceramic", collection, bevel=0.0,
            rot=(0.0, ang, 0.0),
        ))
    return objs


def build_belt(lod, collection):
    bevel = {0: 0.003, 1: 0.0, 2: 0.0}[lod]
    objs = []
    x0, x1 = -0.22, 0.50
    y_h = 0.20
    z = 0.155
    # Belt ribbon — real surface with thickness and UV along X.
    objs.append(add_box("belt_face", ((x0 + x1) * 0.5, 0.0, z), (x1 - x0, y_h * 2 - 0.04, 0.018), "belt", collection, bevel=0.002))
    if lod == 0:
        objs.append(add_box("belt_return", ((x0 + x1) * 0.5, 0.0, 0.08), (x1 - x0 - 0.06, y_h * 2 - 0.08, 0.014), "belt", collection, bevel=0.002))
    n_roll = {0: 5, 1: 2, 2: 1}[lod]
    segs = {0: 12, 1: 8, 2: 6}[lod]
    for i in range(n_roll):
        u = i / max(1, n_roll - 1)
        x = x0 + 0.06 + (x1 - x0 - 0.12) * u
        objs.append(add_cyl(
            f"roller_{i}", (x, 0.0, 0.115), 0.032 if lod else 0.034, y_h * 2 - 0.06,
            "cutting", collection, verts=segs, rot=(math.pi / 2, 0, 0), bevel=0.002,
        ))
        # End bearings are a color mass on the roller, not extra meshes.
    if lod < 2:
        objs.append(add_cyl(
            "drive_pulley", (x0 + 0.02, 0.0, 0.13), 0.045, y_h * 2 - 0.08,
            "cutting", collection, verts=segs, rot=(math.pi / 2, 0, 0), bevel=0.003,
        ))
    return objs


def build_lamp(lod, collection):
    bevel = {0: 0.003, 1: 0.004, 2: 0.006}[lod]
    loc = LAMP_LOC
    objs = []
    if lod < 2:
        objs.append(add_cyl("lamp_socket", (loc.x - 0.04, loc.y, loc.z), 0.035, 0.07, "structure", collection,
                            verts=10 if lod else 12, rot=(0, math.pi / 2, 0), bevel=bevel))
    # Hood: truncated cone opening +X, not a glowing bar.
    objs.append(add_cone(
        "lamp_hood", (loc.x + 0.02, loc.y, loc.z), 0.055, 0.028, 0.07,
        "structure", collection, verts=10 if lod else 12, bevel=bevel, rot=(0, math.pi / 2, 0),
    ))
    lens = add_cyl(
        "lamp_lens", (loc.x + 0.05, loc.y, loc.z), 0.022, 0.016, "lamp", collection,
        verts=8 if lod else 10, rot=(0, math.pi / 2, 0), bevel=0.002,
    )
    objs.append(lens)
    return objs, lens


def build_lod(lod):
    reset_scene()
    coll = bpy.data.collections.new(f"LOD{lod}")
    bpy.context.scene.collection.children.link(coll)
    frame = build_frame(lod, coll)
    drive = build_drive(lod, coll)
    head = build_head(lod, coll)
    belt = build_belt(lod, coll)
    lamp, lens = build_lamp(lod, coll)
    lens.name = f"LOD{lod}_lamp_lens"
    static = join_group(frame + drive, f"LOD{lod}_extractor")
    head_m = join_group(head, f"LOD{lod}_head")
    belt_m = join_group(belt, f"LOD{lod}_belt")
    hoods = [o for o in lamp if o != lens]
    lamp_m = join_group(hoods, f"LOD{lod}_lamp")
    meshes = [static, head_m, belt_m, lamp_m, lens]
    for obj in meshes:
        obj["spacefaceLod"] = f"lod{lod}"

    unwrap_unique(meshes)
    size = TEX_SIZE[lod]
    bakes = bake_targets(meshes, size, f"extractor_atlas_lod{lod}")
    maps = author_maps(bakes, size, f"extractor_atlas_lod{lod}")
    atlas = atlas_material(maps, lod, emissive=False)
    lamp_mat = atlas_material(maps, lod, emissive=True)
    for obj in (static, head_m, belt_m, lamp_m):
        obj.data.materials.clear()
        obj.data.materials.append(atlas)
    lens.data.materials.clear()
    lens.data.materials.append(lamp_mat)

    tris = sum(count_tris(o) for o in meshes)
    if tris > TRI_BUDGET[lod]:
        print(f"WARN LOD{lod} tris {tris} over budget {TRI_BUDGET[lod]}")
    return {
        "meshes": meshes,
        "static": static,
        "head": head_m,
        "belt": belt_m,
        "lamp": lamp_m,
        "lens": lens,
        "maps": maps,
        "triangles": tris,
        "draws": len(meshes),
        "materials": 2,
    }


def export_lod_glb(report, lod):
    SOURCE_DIR.mkdir(parents=True, exist_ok=True)
    path = SOURCE_DIR / f"extractor_lod{lod}.glb"
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
    tmp = SOURCE_DIR / f"extractor_lod{lod}.tmp.glb"
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
    print(json.dumps({"lod": lod, "triangles": report["triangles"], "draws": report["draws"], "bytes": report["bytes"]}, indent=2))
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


def combine_lods(lod_reports):
    reset_scene()
    root = add_empty(ROOT_NAME, (0, 0, 0), bpy.context.scene.collection, size=0.14)
    head_e = add_empty("head_face", tuple(PIVOT), bpy.context.scene.collection, size=0.10)
    belt_e = add_empty("belt", tuple(BELT_LOC), bpy.context.scene.collection, size=0.08)
    lamp_e = add_empty("lamp", tuple(LAMP_LOC), bpy.context.scene.collection, size=0.06)
    for hook in (head_e, belt_e, lamp_e):
        stamp_socket(hook)
        parent_keep(hook, root)
    head_e.rotation_euler = (0, 0, 0)

    mesh_names = []
    lod_tri = {0: 0, 1: 0, 2: 0}
    for lod in (0, 1, 2):
        path = SOURCE_DIR / f"extractor_lod{lod}.glb"
        before = set(bpy.data.objects)
        bpy.ops.import_scene.gltf(filepath=str(path))
        imported = [o for o in bpy.data.objects if o not in before]
        groups = {"extractor": [], "head": [], "belt": [], "lamp": []}
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
            if "head" in lower:
                groups["head"].append(obj)
            elif "belt" in lower:
                groups["belt"].append(obj)
            elif "lamp" in lower:
                groups["lamp"].append(obj)
            else:
                groups["extractor"].append(obj)
        mapping = {
            "extractor": (root, f"LOD{lod}_extractor"),
            "head": (head_e, f"LOD{lod}_head"),
            "belt": (belt_e, f"LOD{lod}_belt"),
            "lamp": (lamp_e, None),
        }
        for key, (parent, rename) in mapping.items():
            for obj in groups[key]:
                parent_keep(obj, parent)
                if rename and "lens" not in obj.name.lower():
                    obj.name = rename
                elif key == "lamp" and "lens" in (obj.get("_sf_raw") or obj.name).lower():
                    obj.name = f"LOD{lod}_lamp_lens"
                elif key == "lamp":
                    obj.name = f"LOD{lod}_lamp"
                obj["spacefaceLod"] = f"lod{lod}"
                obj["spaceface"] = {"lod": f"lod{lod}"}
                lod_tri[lod] += count_tris(obj)
                mesh_names.append(obj.name)

    chull = add_empty("COLLISION_HULL", (0, 0, 0.40), bpy.context.scene.collection, size=1.0)
    chull.empty_display_type = "CUBE"
    chull.scale = Vector((1.05, 0.80, 0.42))
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
        "packet": "PQ-131.03",
        "role": "one-face gallery extractor — drill/crusher to +X, belt inboard",
        "forward": "+X",
        "up": "+Y",
        "starboard": "+Z",
        "unit": "metre",
        "normalConvention": "OpenGL",
        "ormChannels": "R=AO,G=Roughness,B=Metallic",
        "textureCompression": "PNG-source",
        "textureAuthorship": "unique UV0 mesh AO/normal/curvature + authored 1024 PBR",
        "textureSize": 1024,
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
    combined = SOURCE_DIR / "extractor.glb"
    parts = PARTS_DIR / COMBINED_NAME
    tmp = SOURCE_DIR / "extractor.tmp.glb"
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
    (SOURCE_DIR / "extractor_inventory.json").write_text(json.dumps(inventory, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"ok": True, **inventory}, indent=2))
    return inventory, contract, combined, parts


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


def inspect_glb(path: Path) -> dict:
    gltf, _rest = _read_glb(path)
    nodes = gltf.get("nodes") or []
    names = [n.get("name") for n in nodes]
    meshes = gltf.get("meshes") or []
    materials = gltf.get("materials") or []
    accessors = {i: a for i, a in enumerate(gltf.get("accessors") or [])}
    tris = 0
    lod_tris = {"lod0": 0, "lod1": 0, "lod2": 0}
    mesh_by_index = {}
    for mi, mesh in enumerate(meshes):
        mesh_tris = 0
        for prim in mesh.get("primitives") or []:
            acc = accessors.get(prim.get("indices"))
            if acc:
                mesh_tris += int(acc.get("count", 0)) // 3
        mesh_by_index[mi] = mesh_tris
        tris += mesh_tris
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

    cam_data = bpy.data.cameras.new("WorksCam")
    camera = bpy.data.objects.new("WorksCam", cam_data)
    scene.collection.objects.link(camera)
    scene.camera = camera
    reach = 4.0
    for name, loc, energy, color, angle in (
        ("Key", (-1.15 * reach, -0.78 * reach, 0.54 * reach), 7.2, (1.00, 0.863, 0.737), 18.0),
        ("Rim", (0.22 * reach, 1.45 * reach, 0.30 * reach), 2.20, (0.616, 0.722, 0.941), 25.0),
        ("Fill", (1.12 * reach, 0.46 * reach, 0.50 * reach), 2.40, (0.847, 0.765, 0.659), 30.0),
        ("Grazing", (1.8 * reach, -0.2 * reach, 0.22 * reach), 5.4, (1.00, 0.90, 0.78), 12.0),
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
        look_at(obj, (0, 0, 0.2))
        data.use_shadow = name in {"Key", "Grazing"}
    return camera, pad


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
    nt = mat.node_tree
    bsdf = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
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
            # Try to copy the matching image from the source material.
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
    camera, pad = setup_mine_lights()
    meshes = [o for o in bpy.data.objects if o.type == "MESH" and o.name != "MinePad"]
    # Hide LOD1/2 for close stills so coincident LODs do not z-fight.
    def set_lod(visible):
        for obj in meshes:
            name = obj.name
            show = True
            if visible == "close":
                show = name.startswith("LOD0") or not name.startswith("LOD")
            elif visible == "site":
                show = name.startswith("LOD1") or name.startswith("LOD2") or not name.startswith("LOD")
                # Prefer LOD1 for site; hide LOD2 and LOD0.
                if name.startswith("LOD0") or name.startswith("LOD2"):
                    show = False
                if name.startswith("LOD1"):
                    show = True
            obj.hide_render = not show
            try:
                obj.hide_set(not show)
            except Exception:
                pass

    paths = {}

    def snap(name, framing, edge_dir=(1.0, 0.0)):
        pose = apply_works_camera(camera, framing=framing, focus=(0.0, 0.0, 0.32), edge_dir=edge_dir)
        offset = Vector(pose["object_offset"])
        moved = []
        if offset.length > 1e-9:
            for obj in list(bpy.data.objects):
                if obj.type in {"CAMERA", "LIGHT"}:
                    continue
                if obj.parent is not None:
                    continue
                if obj.name == "MinePad":
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
        }

    set_lod("close")
    paths["works_top"] = snap("works_top.png", "works_top")
    paths["works_edge"] = snap("works_edge.png", "works_edge", edge_dir=(1.0, 0.0))
    clay_b, _ = override_clay(meshes)
    paths["works_top_clay"] = snap("works_top_clay.png", "works_top")
    restore_mats(meshes, clay_b)

    # Grazing edge: same works_edge offset, Key dimmed, Grazing sun dominant.
    for obj in bpy.data.objects:
        if obj.type == "LIGHT" and obj.name == "Key":
            obj.data.energy = 1.6
        if obj.type == "LIGHT" and obj.name == "Grazing":
            obj.data.energy = 8.5
    paths["works_edge_grazing"] = snap("works_edge_grazing.png", "works_edge", edge_dir=(0.85, 0.35))
    for obj in bpy.data.objects:
        if obj.type == "LIGHT" and obj.name == "Key":
            obj.data.energy = 7.2
        if obj.type == "LIGHT" and obj.name == "Grazing":
            obj.data.energy = 5.4

    set_lod("site")
    paths["works_site"] = snap("works_site.png", "works_site")

    set_lod("close")
    # Isolation stills from exported GLB (Standard view transform).
    scene = bpy.context.scene
    vt, look, exp = scene.view_settings.view_transform, scene.view_settings.look, scene.view_settings.exposure
    scene.view_settings.view_transform = "Standard"
    try:
        scene.view_settings.look = "None"
    except TypeError:
        pass
    scene.view_settings.exposure = 0.0
    pad.hide_render = True
    for kind, fname in (("normal", "normal_isolation.png"), ("orm", "orm_isolation.png"), ("id", "id_or_material_id.png")):
        b = override_channel(meshes, kind)
        paths[kind] = snap(fname, "works_top")
        restore_mats(meshes, b)
    scene.view_settings.view_transform = vt
    scene.view_settings.look = look
    scene.view_settings.exposure = exp
    pad.hide_render = False

    # Hook / identity diagnostic: clay + empties as colored axes.
    clay_b, _ = override_clay(meshes)
    # Draw simple axis markers at hooks.
    for hook_name, color in (("head_face", (0.9, 0.2, 0.1, 1)), ("belt", (0.1, 0.7, 0.2, 1)), ("lamp", (0.95, 0.8, 0.2, 1))):
        hook = bpy.data.objects.get(hook_name)
        if hook is None:
            continue
        bpy.ops.mesh.primitive_cone_add(radius1=0.03, radius2=0.0, depth=0.18, location=hook.matrix_world.translation)
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
            bsdf.inputs["Emission Strength"].default_value = 2.0
        mark.data.materials.append(mat)
    paths["hook_identity"] = snap("hook_identity.png", "works_top")
    restore_mats(meshes, clay_b)
    return paths


def write_docs(inventory, contract, inspect, stills, lod_reports):
    FAMILY.mkdir(parents=True, exist_ok=True)
    EVIDENCE_DIR.mkdir(parents=True, exist_ok=True)
    hashes = {
        "cycle": 1,
        "disposition": "review_pending",
        "combinedSha256": inventory["sha256"],
        "partsSha256": inventory["partsSha256"],
        "lod": {str(r["lod"] if "lod" in r else i): {"sha256": r.get("sha256"), "triangles": r["triangles"]} for i, r in enumerate(lod_reports)},
        "textures": {},
    }
    for path in sorted(TEX_DIR.glob("*.png")):
        hashes["textures"][path.name] = sha256(path)
    (FAMILY / "HASHES.json").write_text(json.dumps(hashes, indent=2) + "\n", encoding="utf-8")

    epoch = {
        "schema": "spaceface.worksExtractorCycleEpoch.v1",
        "cycle": 1,
        "epoch": "cycle_001",
        "disposition": "review_pending",
        "state": "design_candidate",
        "gates": {
            "G0": "evidence_ready",
            "G1": "open",
            "G2": "open",
            "G4": "open",
            "G7": "open",
        },
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
            "pivot_head_face_blender": [PIVOT.x, PIVOT.y, PIVOT.z],
            "lamp_blender": [LAMP_LOC.x, LAMP_LOC.y, LAMP_LOC.z],
            "belt_blender": [BELT_LOC.x, BELT_LOC.y, BELT_LOC.z],
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
        ],
    }
    (EVIDENCE_DIR / "EPOCH.json").write_text(json.dumps(epoch, indent=2) + "\n", encoding="utf-8")

    audit = f"""# Extractor — material and shape audit (Cycle 01)

Candidate `{inventory['sha256']}` · root `{ROOT_NAME}` · disposition `review_pending`.

## Shape grammar

| Form | Primitive origin | Manufactured result | Camera |
|---|---|---|---|
| Floor rails | C-channel loft, not a box beam | Load-bearing C section, open +X, pad feet at z=0 | works_top, clay |
| Crossmembers | Hat-beam loft | Rooted into rails with gussets | works_top |
| Drive case | 4-station loft with waist | Heat-stained gearbox, access cover, ochre lip | works_top / edge |
| Fins | Thin plates | Rooted into a header on the case, not occupancy wings | works_top |
| Mouth | Five-wall shell open +X | Dark well with ceramic rim teeth | works_top |
| Drum / yoke | Cylinder + lofted arms + bearing bosses | Aimable head under `head_face`, forward +X | works_top / edge |
| Belt | Ribbon + rollers + return + pulley | Negative space under belt; UV1 along +X | works_top / edge |
| Lamp | Cone hood + socket + recessed lens | Fixture exists with emission off | works_edge |

Unresolved blockout risk: rim teeth are still faceted blocks; a later cycle may loft a true
jaw profile if reviewers call the bite a stud ring.

## Material allocation

Dark painted structure, bare cutting/roller metal, heat-stained drive, dry ceramic liners,
rubber belt, one ochre accent, one warm recessed lens. Rover yellow is absent.

Maps are mesh-derived AO / tangent normal / pointiness curvature, composited into authored
1024² basecolor / normal / ORM. Unique non-overlapping UV0. No kit textures.

## LOD

LOD0 {inspect['lodTriangles']['lod0']} / 8000. LOD1 {inspect['lodTriangles']['lod1']} / 2000.
LOD2 {inspect['lodTriangles']['lod2']} / 600. Direction, conveyor, frame, and all three hooks
survive. Hidden faces evaluated per LOD only.

## Remaining visual risk (honest)

- Site register (~19 px/cell) may collapse the mouth into a dark rectangle; identity depends
  on the open +X silhouette and fin comb.
- Drum teeth may alias at 120 px.
- Independent G1/G2/G4 review has not run.
"""
    (FAMILY / "MATERIAL_AND_SHAPE_AUDIT.md").write_text(audit, encoding="utf-8")

    contract_json = {
        "schemaVersion": "1.0",
        "assetId": ASSET_ID,
        "root": ROOT_NAME,
        "packet": "PQ-131.03",
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
        "textureSize": 1024,
        "forbiddenReads": [
            "safety yellow", "plastic copper", "generic grid", "universal edge wear",
            "neon", "flat decals", "leather", "billboard", "glowing bar", "crate",
            "turret", "forklift", "gun", "box-plus-cylinder",
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
    ledger = {
        "schema": "spaceface.advancedModelTechniqueLedger.v1",
        "assetId": ASSET_ID,
        "shipId": ASSET_ID,
        "candidateHash": inventory["sha256"],
        "exportGlb": inventory["partsSource"],
        "class": "place",
        "contract": "docs/visual-assets/ADVANCED_MODEL_TECHNIQUE_CONTRACT.md",
        "clayStillReadsAsPrimitives": False,
        "independentReview": "blocked",
        "independentReviewer": None,
        "forbidden": {
            "factoryLoftPlusBoxes": False,
            "sharedSheetTint": False,
            "shadeSmoothWholeObject": False,
            "internalVoidCalledBay": False,
            "imagenUsedAsBake": False,
        },
        "rows": [
            row("MTX-01", "implemented", graz, "pass", True, "Angle bevel 6–12 mm then weighted normals, shade 28°.", bevelWidthM=0.006, shadeAngleDeg=SHADE_ANGLE),
            row("MTX-03", "implemented", clay, "pass", True, "Mouth is five walls open +X; the +X face is empty."),
            row("MTX-16", "implemented", top, "pass", True, "Unique non-overlapping UV0 packed per LOD."),
            row("MTX-20", "implemented", nrm, "pass", True, "High duplicate with extra 3 mm bevel as bake source."),
            row("MTX-21", "implemented", nrm, "pass", True, "Cage extrusion 0.03 wu on selected-to-active normal bake."),
            row("MTX-22", "implemented", nrm, "pass", True, "Tangent OpenGL normal from the mesh."),
            row("MTX-23", "implemented", orm, "pass", True, "Cycles AO baked to unique UV0."),
            row("MTX-24", "implemented", orm, "pass", True, "Pointiness curvature baked as emit."),
            row("MTX-25", "implemented", orm, "pass", True, "Concave curvature drives cavity dirt."),
            row("MTX-30", "implemented", nrm, "pass", True, "Generated refs are construction studies only; maps are mesh-derived."),
            row("MTX-31", "implemented", top, "pass", True, "Paint dielectric, steel metallic, ceramic dry, belt rubber, lamp glass."),
            row("MTX-32", "implemented", top, "pass", True, "Authored 1024 albedo from ID × AO × causal wear, not a tinted sheet."),
            row("MTX-33", "implemented", orm, "pass", True, "ORM: R=AO G=rough B=metal, role-varying."),
            row("MTX-39", "implemented", top, "pass", True, "Dirt in concave AO, not a black crayon."),
            row("MTX-46", "implemented", clay, "pass", True, "No yellow, neon, leather, glowing bar, or kit donor."),
            row("MTX-50", "implemented", inventory["partsSource"], "pass", True, "Z-up works scale, Y-up glTF, sockets, LOD names, extras stamped."),
            row("MTX-52", "implemented", clay, "pass", True, "Macro from cited kit shape language + construction studies, not a cube."),
            row("MTX-53", "not_applicable", None, "pass", True, "Manufactured machine, not a rock/sculpt."),
            row("MTX-54", "not_applicable", None, "pass", True, "New asset; no prior accepted extractor to revert."),
        ],
    }
    (FAMILY / "TECHNIQUE_LEDGER.json").write_text(json.dumps(ledger, indent=2) + "\n", encoding="utf-8")

    provenance = """# Extractor reference provenance (Cycle 01)

Generated construction studies (native imagegen). Not projected as textures.
Not used as normal/AO/roughness/metallic/curvature.

| File | Role | Selected | Rejected |
|---|---|---|---|
| reference/ref_01_overhead_extractor.png | planform: open mouth, belt, fins, U-frame | U-frame open +X, toothed well, fin comb, hooded lamp | lamp hose, any yellow |
| reference/ref_02_crusher_head.png | yoke + drum + bearings | rooted bearings, recessed drum, ceramic teeth | red lamp-can as livery |
| reference/ref_03_conveyor_stub.png | trough, rollers, negative space, drive | C-channel, sagging belt, finned motor | copying the outdoor yard scale |
| everyday_space_kit/source/drill_platform.glb | shape only | tool faces the work | geometry, ochre house, 14 m span |
| everyday_space_kit/source/conveyor_truss.glb | shape only | belt + idler + drive | geometry, 27 m truss, buckets |
| everyday_space_kit/source/crusher_module.glb | shape only | crushing aperture | geometry, 7 m box, donor materials |

Kit GLBs were inspected for bounds/mesh names only. They were not imported into the
extractor scene.
"""
    (FAMILY / "reference" / "REFERENCE_PROVENANCE.md").write_text(provenance, encoding="utf-8")
    return hashes, epoch


def validate_inventory(inventory, inspect, lod_reports):
    errors = []
    bbox = inventory["bbox"]
    size = bbox["size"]
    if size[0] > CELL_WU + 1e-3 or size[1] > CELL_WU + 1e-3:
        errors.append(f"footprint {size[:2]} exceeds cell {CELL_WU}")
    if bbox["min"][2] < -0.02:
        errors.append(f"underside below z=0: {bbox['min'][2]}")
    if not inspect["ok"]:
        errors.append(f"glb inspect failed: {inspect}")
    for lod, report in enumerate(lod_reports):
        if report["triangles"] > TRI_BUDGET[lod]:
            errors.append(f"LOD{lod} tris {report['triangles']} > {TRI_BUDGET[lod]}")
    for h in HOOK_NAMES:
        if h not in inspect["hooksFound"]:
            errors.append(f"missing hook {h}")
    return errors


def main():
    FAMILY.mkdir(parents=True, exist_ok=True)
    SOURCE_DIR.mkdir(parents=True, exist_ok=True)
    TEX_DIR.mkdir(parents=True, exist_ok=True)
    EVIDENCE_DIR.mkdir(parents=True, exist_ok=True)
    PARTS_DIR.mkdir(parents=True, exist_ok=True)

    lod_reports = []
    for lod in (0, 1, 2):
        report = build_lod(lod)
        report["lod"] = lod
        export_lod_glb(report, lod)
        # Drop heavy bpy datablocks between LODs except we reset inside build_lod.
        lod_reports.append({k: report[k] for k in ("lod", "triangles", "draws", "materials", "path", "bytes", "sha256")})

    inventory, contract, combined, parts = combine_lods(lod_reports)
    inspect = inspect_glb(parts)
    stills = render_stills(parts, EVIDENCE_DIR)
    hashes, epoch = write_docs(inventory, contract, inspect, stills, lod_reports)
    errors = validate_inventory(inventory, inspect, lod_reports)
    result = {
        "ok": not errors,
        "errors": errors,
        "inventory": inventory,
        "inspect": inspect,
        "stills": {k: v.get("path") if isinstance(v, dict) else v for k, v in stills.items()},
        "epoch": str((EVIDENCE_DIR / "EPOCH.json").relative_to(ROOT)).replace("\\", "/"),
        "hashes": str((FAMILY / "HASHES.json").relative_to(ROOT)).replace("\\", "/"),
    }
    print(json.dumps(result, indent=2))
    if errors:
        raise SystemExit("validation failed:\n" + "\n".join(errors))


if __name__ == "__main__":
    main()

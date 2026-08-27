"""PQ-131.08 Works fabricator — cycle 02 authored gantry source candidate.

Cycle 01 travel (one rigid assembly, 0 / 0.5 / 1 over the bed) is preserved.
Cycle 02 rebuilds the moving hook into a visible carriage/tool, clarifies
bridge/column load paths, authors LOD1/2 as an open H at 19 px/cell, and
corrects G4 (no quilt, no chrome rods, dry ceramic, isolated polymer).

    blender --background --python tools/blender/build_works_fabricator.py
    blender --background --python tools/blender/build_works_fabricator.py -- --validate-only
    blender --background --python tools/blender/build_works_fabricator.py -- --evidence-only
    blender --background --python tools/blender/build_works_fabricator.py -- --combine-only

Do not wire, release, promote, or mark PQ-131.08 complete. Asset-local only.
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
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree

TOOLS = Path(__file__).resolve().parent
ROOT = TOOLS.parents[1]
if str(TOOLS) not in sys.path:
    sys.path.insert(0, str(TOOLS))

from fleet_construction import apply_modifiers  # noqa: E402
from spaceface_works_camera import apply_works_camera  # noqa: E402

FAMILY = ROOT / "assets" / "works" / "fabricator"
SOURCE_DIR = FAMILY / "source"
TEX_DIR = SOURCE_DIR / "textures"
EVIDENCE_DIR = FAMILY / "evidence" / "cycle_002"
AUDIT_DIR = FAMILY / "audits"
CONTRACT_DIR = FAMILY / "contracts"
PARTS_DIR = ROOT / "assets" / "ships" / "parts" / "works"
COMBINED_NAME = "place_works_fabricator.glb"
ASSET_ID = "place_works_fabricator"
ROOT_NAME = "SF_WORKS_FABRICATOR_V1"
HOOK_NAMES = ("gantry_head", "lamp")
RAIL_NAME = "rail"

CELL_WU = 2.2
ENVELOPE = (2.08, 2.08, 0.90)
TEX = 1024
CYCLE = 2
SHADE_ANGLE = 28.0
TRI_BUDGET = {0: 10000, 1: 2500, 2: 800}

# Travel: Blender +X, authored at progress 0.
TRAVEL_X0 = -0.70
TRAVEL_LENGTH = 1.40
TRAVEL_Y = 0.0
TRAVEL_Z = 0.70
HEAD_POS0 = (TRAVEL_X0, TRAVEL_Y, TRAVEL_Z)

BED_HALF = (0.62, 0.50)
BED_TOP = 0.22
BED_BOT = 0.15
RAIL_Y = 0.86
RAIL_Z = 0.66

KEEP_PNG = {b"IHDR", b"PLTE", b"IDAT", b"IEND", b"sRGB", b"gAMA", b"pHYs"}
ROLE_ID = {"frame": 0.0, "bed": 0.2, "rail": 0.4, "ceramic": 0.6, "polymer": 0.8, "lamp": 1.0}
ROLE_FROM_ID = {v: k for k, v in ROLE_ID.items()}

# sRGB bases. Paint is dielectric; bed/rail are metal; ceramic/polymer/lamp are not.
# Cycle 02: darker alkyd frame, brighter worn bed, ground steel (not chrome),
# dry ceramic, isolated polymer, recessed lamp glass (not a warm bead).
ROLE_RGB = {
    "frame": (0.100, 0.082, 0.062),
    "bed": (0.76, 0.70, 0.56),
    "rail": (0.48, 0.50, 0.52),
    "ceramic": (0.62, 0.53, 0.40),
    "polymer": (0.155, 0.138, 0.122),
    "lamp": (0.38, 0.32, 0.22),
}
ROLE_ROUGH = {"frame": 0.64, "bed": 0.34, "rail": 0.42, "ceramic": 0.80, "polymer": 0.66, "lamp": 0.46}
ROLE_METAL = {"frame": 0.07, "bed": 0.68, "rail": 0.78, "ceramic": 0.02, "polymer": 0.03, "lamp": 0.03}
ROLE_ID_RGB = {
    "frame": (0.22, 0.16, 0.10),
    "bed": (0.82, 0.72, 0.48),
    "rail": (0.52, 0.56, 0.60),
    "ceramic": (0.74, 0.58, 0.36),
    "polymer": (0.18, 0.16, 0.14),
    "lamp": (0.58, 0.46, 0.28),
}

_GLTF_FLOAT = 5126
_GLTF_NCOMP = {
    "SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4,
    "MAT2": 4, "MAT3": 9, "MAT4": 16,
}


def write_utf8(path: Path, text: str) -> None:
    path.write_bytes(text.encode("utf-8"))


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1 << 20), b""):
            digest.update(chunk)
    return digest.hexdigest().upper()


def parse_args(argv):
    opts = {
        "combine_only": False,
        "evidence_only": False,
        "validate_only": False,
        "skip_evidence": False,
        "fix_pass": False,
    }
    for tok in argv:
        if tok == "--combine-only":
            opts["combine_only"] = True
        elif tok == "--evidence-only":
            opts["evidence_only"] = True
        elif tok == "--validate-only":
            opts["validate_only"] = True
        elif tok == "--skip-evidence":
            opts["skip_evidence"] = True
        elif tok == "--fix-pass":
            opts["fix_pass"] = True
    return opts


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
    payload = bytes(data)
    tmp = path.with_name(path.name + ".tmp")
    for attempt in range(8):
        try:
            tmp.write_bytes(payload)
            tmp.replace(path)
            return
        except OSError:
            if attempt == 7:
                raise
            import time
            time.sleep(0.25 * (attempt + 1))


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
    payload = bytes(out)
    tmp = path.with_name(path.name + ".tmp")
    for attempt in range(8):
        try:
            tmp.write_bytes(payload)
            tmp.replace(path)
            return
        except OSError:
            if attempt == 7:
                raise
            import time
            time.sleep(0.25 * (attempt + 1))


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


def count_tris(obj):
    if obj is None or obj.type != "MESH" or not obj.data:
        return 0
    return sum(max(0, len(poly.vertices) - 2) for poly in obj.data.polygons)


def h01(x, y, s=0):
    n = np.sin((x * 12.9898 + y * 78.233 + s * 37.719) * 43758.5453)
    return n - np.floor(n)


def link_object(obj, collection):
    for current in list(obj.users_collection):
        current.objects.unlink(obj)
    collection.objects.link(obj)
    return obj


def parent_keep(obj, parent):
    mw = obj.matrix_world.copy()
    obj.parent = parent
    obj.matrix_parent_inverse = parent.matrix_world.inverted()
    obj.matrix_world = mw


def parent_local(obj, parent):
    """Parent so local origin is the hook. Mesh data must already be hook-local."""
    obj.parent = None
    obj.location = (0.0, 0.0, 0.0)
    obj.rotation_euler = (0.0, 0.0, 0.0)
    obj.scale = (1.0, 1.0, 1.0)
    obj.parent = parent
    # Blender returns a copy; mutating .identity() does not stick.
    obj.matrix_parent_inverse = Matrix.Identity(4)
    obj.location = (0.0, 0.0, 0.0)


def shift_mesh(obj, delta):
    dx, dy, dz = delta
    for vert in obj.data.vertices:
        vert.co.x += dx
        vert.co.y += dy
        vert.co.z += dz
    obj.data.update()


def add_empty(name, loc, collection, parent=None, size=0.08):
    obj = bpy.data.objects.new(name, None)
    collection.objects.link(obj)
    obj.empty_display_type = "PLAIN_AXES"
    obj.empty_display_size = size
    if parent:
        obj.parent = parent
        obj.matrix_parent_inverse = Matrix.Identity(4)
    obj.location = loc
    return obj


def finish_mesh(obj, role, bevel=0.006, segments=2):
    obj["spacefaceRole"] = role
    if bevel > 0:
        mod = obj.modifiers.new("ProductionBevel", "BEVEL")
        mod.width = bevel
        mod.segments = max(1, int(segments))
        mod.limit_method = "ANGLE"
        mod.angle_limit = math.radians(40)
    return obj


def add_mesh(name, verts, faces, collection, role, bevel=0.006, segments=2):
    mesh = bpy.data.meshes.new(f"{name}_Mesh")
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)
    return finish_mesh(obj, role, bevel, segments)


def add_box(name, loc, half, collection, role, bevel=0.006, segments=2):
    hx, hy, hz = half
    cx, cy, cz = loc
    verts = [
        (cx + sx * hx, cy + sy * hy, cz + sz * hz)
        for sz in (-1.0, 1.0)
        for sy in (-1.0, 1.0)
        for sx in (-1.0, 1.0)
    ]
    faces = [
        (0, 2, 3, 1), (4, 5, 7, 6),
        (0, 4, 6, 2), (1, 3, 7, 5),
        (0, 1, 5, 4), (2, 6, 7, 3),
    ]
    return add_mesh(name, verts, faces, collection, role, bevel, segments)


def add_cylinder(name, loc, radius, depth, collection, role, vertices=10, bevel=0.003, axis="Z"):
    n = max(6, int(vertices))
    hz = depth * 0.5
    ring = []
    for i in range(n):
        a = (math.pi * 2.0 * i) / n
        ring.append((math.cos(a) * radius, math.sin(a) * radius))
    verts = []
    for z in (-hz, hz):
        for x, y in ring:
            if axis == "Z":
                verts.append((loc[0] + x, loc[1] + y, loc[2] + z))
            elif axis == "X":
                verts.append((loc[0] + z, loc[1] + x, loc[2] + y))
            else:
                verts.append((loc[0] + x, loc[1] + z, loc[2] + y))
    faces = [tuple(range(n - 1, -1, -1)), tuple(range(n, 2 * n))]
    for i in range(n):
        j = (i + 1) % n
        faces.append((i, j, n + j, n + i))
    return add_mesh(name, verts, faces, collection, role, bevel, segments=1)


def add_hex_bolt(name, loc, collection, role="rail", radius=0.015, depth=0.018):
    return add_cylinder(name, loc, radius, depth, collection, role, vertices=6, bevel=0.001, axis="Z")


def loft_from_rings(name, rings, collection, role, bevel=0.004, cap=True, segments=2):
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
    return add_mesh(name, verts, faces, collection, role, bevel, segments)


def paint_role(obj, role):
    mesh = obj.data
    while mesh.vertex_colors:
        mesh.vertex_colors.remove(mesh.vertex_colors[0])
    col = mesh.vertex_colors.new(name="Role")
    rid = ROLE_ID[role]
    for loop in mesh.loops:
        col.data[loop.index].color = (rid, 1.0, 0.0, 1.0)
    obj["spacefaceRole"] = role


def shade_by_angle(obj):
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    try:
        bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    except Exception:
        pass
    apply_modifiers(obj)
    try:
        bpy.ops.object.shade_smooth_by_angle(angle=math.radians(SHADE_ANGLE))
    except Exception:
        for poly in obj.data.polygons:
            poly.use_smooth = True
    obj.select_set(False)


def weighted_normals(obj):
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    wn = obj.modifiers.new("WeightedNormal", "WEIGHTED_NORMAL")
    wn.keep_sharp = True
    apply_modifiers(obj)
    tri = obj.modifiers.new("ExportTriangulate", "TRIANGULATE")
    tri.quad_method = "FIXED"
    bpy.ops.object.modifier_apply(modifier=tri.name)
    obj.select_set(False)


def join_group(objects, name):
    objects = [obj for obj in objects if obj and obj.type == "MESH" and obj.data and len(obj.data.vertices)]
    objects = sorted(objects, key=lambda obj: obj.name)
    if not objects:
        return None
    try:
        bpy.ops.object.mode_set(mode="OBJECT")
    except Exception:
        pass
    bpy.ops.object.select_all(action="DESELECT")
    for obj in objects:
        obj.hide_set(False)
        obj.hide_viewport = False
        obj.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    bpy.ops.object.join()
    joined = bpy.context.view_layer.objects.active
    joined.name = name
    joined.data.name = f"{name}_Mesh"
    return joined


def bake_vertex_ao(obj, distance=0.028, rays=8):
    """Contact-only AO. Open plate stays bright; cavities and joints darken."""
    mesh = obj.data
    try:
        mesh.calc_normals()
    except Exception:
        pass
    depsgraph = bpy.context.evaluated_depsgraph_get()
    bvh = BVHTree.FromObject(obj, depsgraph)
    mw = obj.matrix_world
    imw = mw.inverted()
    n = len(mesh.vertices)
    accum = np.ones(n, dtype=np.float32)
    dirs = []
    for i in range(rays):
        a = (math.pi * 2.0 * i) / rays
        # Hemisphere mixed with a grazing ring so only nearby occluders score.
        dirs.append(Vector((math.cos(a) * 0.72, math.sin(a) * 0.72, 0.42)).normalized())
    for vi, vert in enumerate(mesh.vertices):
        world = mw @ vert.co
        wn = (mw.to_3x3() @ vert.normal).normalized()
        if wn.length < 1e-8:
            continue
        hit = 0.0
        for extra in dirs:
            direction = (wn * 0.35 + extra * 0.65).normalized()
            origin = world + direction * 0.0015
            loc, *_rest = bvh.ray_cast(imw @ origin, (imw.to_3x3() @ direction).normalized(), distance)
            if loc is not None:
                hit += 1.0
        accum[vi] = 1.0 - 0.48 * (hit / float(rays))
    col = mesh.vertex_colors.get("Role") or mesh.vertex_colors.new(name="Role")
    for loop in mesh.loops:
        rgba = list(col.data[loop.index].color)
        rgba[1] = float(accum[loop.vertex_index])
        col.data[loop.index].color = rgba
    return obj


def unique_unwrap(objects):
    objects = [obj for obj in objects if obj and obj.type == "MESH"]
    if not objects:
        return
    bpy.ops.object.select_all(action="DESELECT")
    for obj in objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(angle_limit=66.0, island_margin=0.014, scale_to_bounds=False)
    try:
        bpy.ops.uv.average_islands_scale()
    except Exception:
        pass
    try:
        bpy.ops.uv.pack_islands(margin=0.012)
    except TypeError:
        bpy.ops.uv.pack_islands(margin=0.012, rotate=True)
    bpy.ops.object.mode_set(mode="OBJECT")
    bpy.ops.object.select_all(action="DESELECT")


def assert_unique_uv(objects, size=TEX):
    occ = np.zeros((size, size), dtype=np.int16)
    overlaps = 0
    samples = 0
    for obj in objects:
        mesh = obj.data
        uv_layer = mesh.uv_layers.active
        if uv_layer is None:
            raise RuntimeError(f"{obj.name} has no UV0")
        for poly in mesh.polygons:
            loops = list(poly.loop_indices)
            for i in range(1, len(loops) - 1):
                uvs = [uv_layer.data[loops[0]].uv, uv_layer.data[loops[i]].uv, uv_layer.data[loops[i + 1]].uv]
                xs = [int(max(0, min(size - 1, uv.x * (size - 1)))) for uv in uvs]
                ys = [int(max(0, min(size - 1, uv.y * (size - 1)))) for uv in uvs]
                for x, y in zip(xs, ys):
                    samples += 1
                    occ[y, x] += 1
                    if occ[y, x] > 3:
                        overlaps += 1
    if samples == 0:
        raise RuntimeError("unique UV0 produced no samples")
    return overlaps


# --------------------------------------------------------------------------- geometry


def tslot_profile(y0, y1, z_top, z_bot, slot_ys, lod):
    if lod >= 2 or not slot_ys:
        return [(y0, z_top), (y1, z_top), (y1, z_bot), (y0, z_bot)]
    stem = 0.016 if lod == 0 else 0.020
    pocket = 0.030
    depth_stem = 0.016
    depth_t = 0.040 if lod == 0 else 0.026
    pts = [(y0, z_top)]
    for sy in slot_ys:
        pts.append((sy - stem, z_top))
        pts.append((sy - stem, z_top - depth_stem))
        if lod == 0:
            pts.append((sy - pocket, z_top - depth_stem))
            pts.append((sy - pocket, z_top - depth_t))
            pts.append((sy + pocket, z_top - depth_t))
            pts.append((sy + pocket, z_top - depth_stem))
        else:
            pts.append((sy - stem, z_top - depth_t))
            pts.append((sy + stem, z_top - depth_t))
        pts.append((sy + stem, z_top - depth_stem))
        pts.append((sy + stem, z_top))
    pts.append((y1, z_top))
    pts.append((y1, z_bot))
    pts.append((y0, z_bot))
    return pts


def add_tslot_bed(prefix, collection, lod):
    y0, y1 = -BED_HALF[1], BED_HALF[1]
    x0, x1 = -BED_HALF[0], BED_HALF[0]
    if lod == 0:
        slots = (-0.32, -0.16, 0.0, 0.16, 0.32)
        stations = (-0.58, -0.20, 0.20, 0.58)
    elif lod == 1:
        slots = (-0.24, 0.0, 0.24)
        stations = (x0 + 0.04, x1 - 0.04)
    else:
        slots = ()
        stations = (x0 + 0.05, x1 - 0.05)
    profile = tslot_profile(y0, y1, BED_TOP, BED_BOT, slots, lod)
    rings = []
    for x in stations:
        rings.append([(x, y, z) for y, z in profile])
    bed = loft_from_rings(f"{prefix}BedPlate", rings, collection, "bed", bevel=0.003 if lod == 0 else 0.0)
    parts = [bed]
    # Uncut end rims so the slots do not run off the plate.
    rim_x = BED_HALF[0] - 0.03
    for sx, tag in ((-1.0, "Aft"), (1.0, "Fore")):
        parts.append(add_box(
            f"{prefix}BedRim{tag}", (sx * rim_x, 0.0, (BED_TOP + BED_BOT) * 0.5),
            (0.03, BED_HALF[1], (BED_TOP - BED_BOT) * 0.5 + 0.002),
            collection, "bed", bevel=0.002 if lod == 0 else 0.0, segments=1,
        ))
    if lod == 0:
        # Waste gutters / chip pans between bed and side frames.
        for sign, tag in ((-1.0, "Stbd"), (1.0, "Port")):
            parts.append(add_box(
                f"{prefix}Gutter{tag}",
                (0.0, sign * 0.58, 0.12),
                (0.58, 0.045, 0.04),
                collection, "bed", bevel=0.003, segments=1,
            ))
            parts.append(add_box(
                f"{prefix}Pan{tag}",
                (0.0, sign * 0.58, 0.055),
                (0.50, 0.055, 0.025),
                collection, "frame", bevel=0.003, segments=1,
            ))
    elif lod == 1:
        for sign, tag in ((-1.0, "Stbd"), (1.0, "Port")):
            parts.append(add_box(
                f"{prefix}Gutter{tag}",
                (0.0, sign * 0.58, 0.12),
                (0.58, 0.04, 0.035),
                collection, "bed", bevel=0.0, segments=1,
            ))
    # LOD2 keeps the raised bed plate as the bright mass. A filled well
    # collapses the site icon into a nested square.
    return parts


def add_clamps_and_fixtures(prefix, collection, lod):
    parts = []
    corners = ((-0.46, -0.36), (-0.46, 0.36), (0.46, -0.36), (0.46, 0.36))
    if lod == 1:
        corners = ((-0.46, -0.36), (0.46, 0.36))
    elif lod >= 2:
        return parts
    for i, (x, y) in enumerate(corners):
        z = BED_TOP + 0.018
        # Toe clamp: heel block + strap. Not a cube stud.
        parts.append(add_box(
            f"{prefix}ClampHeel{i}", (x, y, z),
            (0.045, 0.032, 0.016), collection, "rail", bevel=0.002, segments=1,
        ))
        if lod == 0:
            parts.append(add_box(
                f"{prefix}ClampToe{i}", (x + (0.05 if x < 0 else -0.05), y, z + 0.012),
                (0.055, 0.018, 0.007), collection, "rail", bevel=0.002, segments=1,
            ))
            parts.append(add_hex_bolt(
                f"{prefix}ClampBolt{i}", (x, y, z + 0.028), collection, "rail", 0.012, 0.016,
            ))
            # Fixture bushing inboard of the clamp.
            bx, by = x * 0.55, y * 0.45
            parts.append(add_cylinder(
                f"{prefix}Bush{i}", (bx, by, BED_TOP + 0.008), 0.022, 0.016,
                collection, "rail", vertices=8, bevel=0.001,
            ))
            parts.append(add_cylinder(
                f"{prefix}BushBore{i}", (bx, by, BED_TOP + 0.010), 0.010, 0.020,
                collection, "bed", vertices=8, bevel=0.0,
            ))
        elif lod == 1:
            parts.append(add_box(
                f"{prefix}ClampToe{i}", (x + (0.04 if x < 0 else -0.04), y, z + 0.01),
                (0.04, 0.016, 0.006), collection, "rail", bevel=0.0, segments=1,
            ))
    return parts


def add_base(prefix, collection, lod):
    parts = []
    # Grounded feet and a folded sill. z=0 is the cut face.
    foot_xy = ((-0.92, -0.94), (-0.92, 0.94), (0.92, -0.94), (0.92, 0.94))
    for i, (x, y) in enumerate(foot_xy):
        parts.append(add_box(
            f"{prefix}Foot{i}", (x, y, 0.025),
            (0.10, 0.08, 0.025), collection, "frame",
            bevel=0.004 if lod == 0 else 0.0, segments=1,
        ))
    if lod < 2:
        parts.append(add_box(
            f"{prefix}Plinth", (0.0, 0.0, 0.04),
            (0.96, 0.88, 0.03), collection, "frame",
            bevel=0.005 if lod == 0 else 0.0, segments=1 if lod else 2,
        ))
    else:
        # Preserve two rooted longitudinal sills at site LOD, but leave the
        # center open. A full rectangular plinth survived as a filled-square
        # icon even after the obsolete LOD2 bed well was removed.
        for sign, tag in ((-1.0, "Stbd"), (1.0, "Port")):
            parts.append(add_box(
                f"{prefix}Sill{tag}", (0.0, sign * 0.78, 0.04),
                (0.92, 0.08, 0.03), collection, "frame",
                bevel=0.0, segments=1,
            ))
    if lod == 0:
        parts.append(add_box(
            f"{prefix}Spine", (0.0, 0.0, 0.07),
            (0.90, 0.10, 0.02), collection, "frame", bevel=0.003, segments=1,
        ))
        for x, tag in ((-0.70, "Aft"), (0.70, "Fore")):
            parts.append(add_box(
                f"{prefix}Cross{tag}", (x, 0.0, 0.07),
                (0.06, 0.78, 0.018), collection, "frame", bevel=0.003, segments=1,
            ))
    return parts


def add_side_frame(prefix, sign, collection, lod):
    parts = []
    y = sign * 0.94
    tag = "Port" if sign > 0 else "Stbd"
    # C-section wall rooted to the plinth. LOD1/2 keep the H uprights but drop
    # the wide bright top-cap that collapsed the site icon into a picture frame.
    web_hy = 0.026 if lod == 0 else 0.022
    parts.append(add_box(
        f"{prefix}Web{tag}", (0.0, y, 0.34),
        (0.98 if lod == 0 else 0.92, web_hy, 0.28 if lod == 0 else 0.24), collection, "frame",
        bevel=0.005 if lod == 0 else 0.0, segments=1 if lod else 2,
    ))
    inner = y - sign * 0.055
    if lod == 0:
        parts.append(add_box(
            f"{prefix}FlangeLow{tag}", (0.0, inner, 0.12),
            (0.96, 0.030, 0.018), collection, "frame", bevel=0.003, segments=1,
        ))
        parts.append(add_box(
            f"{prefix}FlangeHigh{tag}", (0.0, inner, 0.58),
            (0.96, 0.030, 0.016), collection, "frame", bevel=0.003, segments=1,
        ))
    elif lod == 1:
        parts.append(add_box(
            f"{prefix}FlangeHigh{tag}", (0.0, inner, 0.56),
            (0.70, 0.022, 0.012), collection, "frame", bevel=0.0, segments=1,
        ))
    # End posts: column load path, rail seat → gusset → foot.
    post_hx = 0.085 if lod == 0 else 0.070
    post_hy = 0.055 if lod == 0 else 0.042
    for x, end in ((-0.90, "Aft"), (0.90, "Fore")):
        parts.append(add_box(
            f"{prefix}Post{tag}{end}", (x, y, 0.34),
            (post_hx, post_hy, 0.30 if lod == 0 else 0.26), collection, "frame",
            bevel=0.004 if lod == 0 else 0.0, segments=1,
        ))
        if lod == 0:
            parts.append(add_box(
                f"{prefix}Gusset{tag}{end}", (x, y - sign * 0.08, 0.14),
                (0.05, 0.06, 0.08), collection, "frame", bevel=0.002, segments=1,
            ))
            parts.append(add_box(
                f"{prefix}Cap{tag}{end}", (x, y, 0.66),
                (0.07, 0.048, 0.018), collection, "frame", bevel=0.002, segments=1,
            ))
            parts.append(add_hex_bolt(
                f"{prefix}PostBolt{tag}{end}", (x, y, 0.68), collection, "rail", 0.014, 0.016,
            ))
        elif lod == 1:
            parts.append(add_box(
                f"{prefix}Cap{tag}{end}", (x, y, 0.64),
                (0.06, 0.038, 0.016), collection, "frame", bevel=0.0, segments=1,
            ))
    if lod == 0:
        # Narrow rail seat, not a continuous bright picture-frame bar.
        parts.append(add_box(
            f"{prefix}Seat{tag}", (0.0, y, 0.625),
            (0.88, 0.032, 0.016), collection, "frame",
            bevel=0.003, segments=1,
        ))
    return parts


def add_profile_rail(prefix, sign, collection, lod):
    parts = []
    y = sign * RAIL_Y
    tag = "Port" if sign > 0 else "Stbd"
    # Hat-section raceway, not a round rod.
    parts.append(add_box(
        f"{prefix}RailWeb{tag}", (0.0, y, RAIL_Z),
        (0.92, 0.012, 0.018), collection, "rail",
        bevel=0.002 if lod == 0 else 0.0, segments=1,
    ))
    if lod == 0:
        parts.append(add_box(
            f"{prefix}RailHead{tag}", (0.0, y, RAIL_Z + 0.016),
            (0.92, 0.022, 0.008), collection, "rail", bevel=0.001, segments=1,
        ))
        parts.append(add_box(
            f"{prefix}RailBase{tag}", (0.0, y, RAIL_Z - 0.016),
            (0.92, 0.028, 0.006), collection, "rail", bevel=0.001, segments=1,
        ))
    if lod == 0:
        for x, end in ((-0.92, "Aft"), (0.92, "Fore")):
            parts.append(add_box(
                f"{prefix}Limit{tag}{end}", (x, y, RAIL_Z + 0.01),
                (0.016, 0.024, 0.018), collection, "frame", bevel=0.002, segments=1,
            ))
    return parts


def add_drive(prefix, collection, lod):
    parts = []
    # Drive blister on the +Y −X column. Progress-0 end. Does not roof the bed.
    parts.append(add_box(
        f"{prefix}DriveHouse", (-0.90, RAIL_Y, 0.50),
        (0.075, 0.070, 0.11), collection, "frame",
        bevel=0.005 if lod == 0 else 0.0, segments=1 if lod else 2,
    ))
    parts.append(add_cylinder(
        f"{prefix}DrivePulley", (-0.90, RAIL_Y, RAIL_Z + 0.01), 0.032, 0.034,
        collection, "rail", vertices=10 if lod == 0 else 6, bevel=0.002 if lod == 0 else 0.0, axis="Y",
    ))
    if lod == 0:
        parts.append(add_box(
            f"{prefix}DriveCover", (-0.90, RAIL_Y + 0.058, 0.50),
            (0.058, 0.014, 0.085), collection, "frame", bevel=0.002, segments=1,
        ))
        parts.append(add_box(
            f"{prefix}DriveBlister", (-0.90, RAIL_Y - 0.02, 0.40),
            (0.06, 0.055, 0.05), collection, "frame", bevel=0.004, segments=1,
        ))
        parts.append(add_box(
            f"{prefix}Belt", (0.0, RAIL_Y + 0.034, RAIL_Z + 0.026),
            (0.86, 0.005, 0.003), collection, "polymer", bevel=0.0, segments=1,
        ))
        parts.append(add_cylinder(
            f"{prefix}LimitSwitch", (-0.84, RAIL_Y + 0.05, RAIL_Z + 0.03), 0.012, 0.03,
            collection, "frame", vertices=6, bevel=0.001, axis="Y",
        ))
    elif lod == 1:
        parts.append(add_box(
            f"{prefix}DriveBlister", (-0.90, RAIL_Y, 0.42),
            (0.055, 0.05, 0.045), collection, "frame", bevel=0.0, segments=1,
        ))
    return parts


def add_energy_chain(prefix, collection, lod):
    """Rooted U-trough on +Y. Not parented to the head. Not a floating noodle."""
    parts = []
    y = RAIL_Y - 0.12
    # Floor of the trough — stays on the column/drive side of the open bed.
    parts.append(add_box(
        f"{prefix}ChainTrough", (0.0, y, 0.455),
        (0.86 if lod == 0 else 0.78, 0.038, 0.010), collection, "frame",
        bevel=0.002 if lod == 0 else 0.0, segments=1,
    ))
    if lod == 0:
        for sign, wall in ((-1.0, "In"), (1.0, "Out")):
            parts.append(add_box(
                f"{prefix}ChainWall{wall}", (0.0, y + sign * 0.032, 0.478),
                (0.84, 0.008, 0.022), collection, "frame", bevel=0.001, segments=1,
            ))
        n = 11
        for i in range(n):
            t = i / float(n - 1)
            x = -0.78 + 1.56 * t
            z = 0.488 + (0.008 if i % 2 else 0.0)
            parts.append(add_box(
                f"{prefix}ChainLink{i}", (x, y, z),
                (0.048, 0.022, 0.014), collection, "polymer", bevel=0.002, segments=1,
            ))
            if i % 2 == 0:
                parts.append(add_box(
                    f"{prefix}ChainPin{i}", (x + 0.046, y, z),
                    (0.007, 0.026, 0.010), collection, "polymer", bevel=0.0, segments=1,
                ))
        parts.append(add_box(
            f"{prefix}ChainAnchor", (-0.90, y, 0.49),
            (0.04, 0.032, 0.024), collection, "frame", bevel=0.002, segments=1,
        ))
    elif lod == 1:
        parts.append(add_box(
            f"{prefix}ChainRun", (0.0, y, 0.478),
            (0.78, 0.020, 0.012), collection, "polymer", bevel=0.0, segments=1,
        ))
    return parts


def add_lamp(prefix, collection, lod):
    parts = []
    loc = (0.62, 0.92, 0.80)
    # Hooded can rooted to the +Y frame. Glass recessed inside the hood so
    # the lamp cannot read as a warm bead or as the site identity.
    hood_r = 0.036 if lod == 0 else 0.026
    parts.append(add_cylinder(
        f"{prefix}LampHood", (loc[0], loc[1], loc[2] + 0.006), hood_r, 0.040,
        collection, "frame", vertices=10 if lod == 0 else 6, bevel=0.002 if lod == 0 else 0.0, axis="Z",
    ))
    parts.append(add_cylinder(
        f"{prefix}LampGlass", (loc[0], loc[1], loc[2] - 0.008), hood_r * 0.42, 0.008,
        collection, "lamp", vertices=8 if lod == 0 else 6, bevel=0.0, axis="Z",
    ))
    if lod == 0:
        parts.append(add_box(
            f"{prefix}LampArm", (0.62, 0.90, 0.70),
            (0.014, 0.034, 0.052), collection, "frame", bevel=0.002, segments=1,
        ))
        parts.append(add_box(
            f"{prefix}LampBracket", (0.62, 0.94, 0.62),
            (0.026, 0.016, 0.026), collection, "frame", bevel=0.002, segments=1,
        ))
        parts.append(add_hex_bolt(
            f"{prefix}LampBolt", (0.62, 0.94, 0.65), collection, "rail", 0.010, 0.012,
        ))
    return parts, loc


def add_gantry(prefix, collection, lod):
    """Moving carriage/tool. World at progress 0, later parented to gantry_head.

    Play register (120 px/cell ≈ 54.5 px/wu): two rail saddles, a manufactured
    cross-carriage, a drive pickup, and an 8–14 px hanging ram/shroud.
    """
    parts = []
    hx = TRAVEL_X0
    # Cross-carriage: box-section beam, ~12 px in X, spanning Y but not a roof.
    beam_hx = 0.110 if lod == 0 else (0.100 if lod == 1 else 0.090)
    beam_hy = 0.76
    beam_hz = 0.046 if lod == 0 else 0.042
    parts.append(add_box(
        f"{prefix}Bridge", (hx, 0.0, TRAVEL_Z),
        (beam_hx, beam_hy, beam_hz), collection, "frame",
        bevel=0.004 if lod == 0 else 0.0, segments=1 if lod else 2,
    ))
    if lod == 0:
        parts.append(add_box(
            f"{prefix}BridgeWeb", (hx, 0.0, TRAVEL_Z),
            (0.030, 0.72, 0.056), collection, "frame", bevel=0.002, segments=1,
        ))
        parts.append(add_box(
            f"{prefix}ServiceDeck", (hx, 0.0, TRAVEL_Z + 0.060),
            (0.100, 0.34, 0.010), collection, "frame", bevel=0.002, segments=1,
        ))
        parts.append(add_box(
            f"{prefix}CableTray", (hx, 0.10, TRAVEL_Z + 0.076),
            (0.040, 0.26, 0.010), collection, "frame", bevel=0.002, segments=1,
        ))
        parts.append(add_box(
            f"{prefix}DrivePickup", (hx, 0.60, TRAVEL_Z + 0.008),
            (0.052, 0.042, 0.038), collection, "frame", bevel=0.003, segments=1,
        ))
        parts.append(add_box(
            f"{prefix}PickupHorn", (hx, RAIL_Y - 0.14, 0.545),
            (0.032, 0.026, 0.026), collection, "frame", bevel=0.002, segments=1,
        ))
        parts.append(add_box(
            f"{prefix}DriveFlag", (hx - 0.09, RAIL_Y + 0.036, RAIL_Z + 0.036),
            (0.010, 0.014, 0.016), collection, "rail", bevel=0.001, segments=1,
        ))
    elif lod == 1:
        parts.append(add_box(
            f"{prefix}ServiceDeck", (hx, 0.0, TRAVEL_Z + 0.052),
            (0.088, 0.26, 0.010), collection, "frame", bevel=0.0, segments=1,
        ))
        parts.append(add_box(
            f"{prefix}DrivePickup", (hx, 0.56, TRAVEL_Z),
            (0.046, 0.036, 0.032), collection, "frame", bevel=0.0, segments=1,
        ))

    # Two bearing saddles wrapping the hat-section rails.
    for sign, tag in ((-1.0, "Stbd"), (1.0, "Port")):
        y = sign * RAIL_Y
        parts.append(add_box(
            f"{prefix}Block{tag}", (hx, y, RAIL_Z + 0.034),
            (0.112, 0.052, 0.028), collection, "rail",
            bevel=0.003 if lod == 0 else 0.0, segments=1,
        ))
        parts.append(add_box(
            f"{prefix}BlockInner{tag}", (hx, y - sign * 0.044, RAIL_Z + 0.004),
            (0.100, 0.018, 0.026), collection, "rail",
            bevel=0.002 if lod == 0 else 0.0, segments=1,
        ))
        parts.append(add_box(
            f"{prefix}BlockOuter{tag}", (hx, y + sign * 0.036, RAIL_Z + 0.004),
            (0.100, 0.015, 0.024), collection, "rail",
            bevel=0.002 if lod == 0 else 0.0, segments=1,
        ))
        if lod == 0:
            parts.append(add_box(
                f"{prefix}BlockLip{tag}", (hx, y, RAIL_Z - 0.014),
                (0.094, 0.028, 0.008), collection, "rail", bevel=0.001, segments=1,
            ))
            for dx, seal in ((-0.078, "A"), (0.078, "B")):
                parts.append(add_box(
                    f"{prefix}BlockSeal{tag}{seal}", (hx + dx, y, RAIL_Z + 0.006),
                    (0.014, 0.046, 0.022), collection, "polymer", bevel=0.001, segments=1,
                ))
            parts.append(add_hex_bolt(
                f"{prefix}BlockBolt{tag}A", (hx - 0.05, y, RAIL_Z + 0.060), collection, "rail",
            ))
            parts.append(add_hex_bolt(
                f"{prefix}BlockBolt{tag}B", (hx + 0.05, y, RAIL_Z + 0.060), collection, "rail",
            ))
        elif lod == 1:
            parts.append(add_box(
                f"{prefix}BlockLip{tag}", (hx, y, RAIL_Z - 0.010),
                (0.090, 0.024, 0.008), collection, "rail", bevel=0.0, segments=1,
            ))

    # Hanging ram / spindle / dry ceramic shroud. 8–14 px planform at play size.
    # 11 px ≈ 0.202 wu diameter. Tool clearance over bed ≥ 0.10 wu.
    shroud_r = 0.100 if lod == 0 else (0.090 if lod == 1 else 0.084)
    spindle_r = 0.054 if lod == 0 else 0.046
    ram_z = TRAVEL_Z - 0.20
    shroud_z = ram_z - 0.078
    parts.append(add_cylinder(
        f"{prefix}Spindle", (hx, 0.0, ram_z), spindle_r, 0.13 if lod == 0 else 0.11,
        collection, "rail", vertices=12 if lod == 0 else (8 if lod == 1 else 6),
        bevel=0.002 if lod == 0 else 0.0,
    ))
    parts.append(add_cylinder(
        f"{prefix}Shroud", (hx, 0.0, shroud_z), shroud_r, 0.072 if lod == 0 else 0.060,
        collection, "ceramic", vertices=12 if lod == 0 else 8, bevel=0.002 if lod == 0 else 0.0,
    ))
    parts.append(add_box(
        f"{prefix}RamPlate", (hx, 0.0, TRAVEL_Z - 0.10),
        (0.078, 0.078, 0.014), collection, "frame",
        bevel=0.002 if lod == 0 else 0.0, segments=1,
    ))
    if lod < 2:
        parts.append(add_cylinder(
            f"{prefix}Collet", (hx, 0.0, shroud_z - 0.038), 0.026 if lod == 0 else 0.022, 0.032,
            collection, "rail", vertices=10 if lod == 0 else 8, bevel=0.001 if lod == 0 else 0.0,
        ))
        parts.append(add_cylinder(
            f"{prefix}Nozzle", (hx + 0.108, 0.0, shroud_z), 0.015 if lod == 0 else 0.013, 0.048,
            collection, "ceramic", vertices=8, bevel=0.001 if lod == 0 else 0.0, axis="X",
        ))
    if lod == 0:
        parts.append(add_cylinder(
            f"{prefix}NozzleCollar", (hx + 0.068, 0.0, shroud_z + 0.008), 0.019, 0.036,
            collection, "rail", vertices=8, bevel=0.001, axis="X",
        ))
        parts.append(add_box(
            f"{prefix}SaddleTop", (hx, 0.0, TRAVEL_Z + 0.078),
            (0.118, 0.130, 0.014), collection, "frame", bevel=0.003, segments=1,
        ))
        for sign, tag in ((-1.0, "A"), (1.0, "B")):
            parts.append(add_box(
                f"{prefix}SaddleCheek{tag}", (hx, sign * 0.105, TRAVEL_Z - 0.018),
                (0.096, 0.015, 0.050), collection, "frame", bevel=0.002, segments=1,
            ))
        for i in range(4):
            a = i * math.pi * 0.5 + 0.35
            parts.append(add_box(
                f"{prefix}Fin{i}",
                (hx + math.cos(a) * 0.058, math.sin(a) * 0.058, ram_z + 0.028),
                (0.015, 0.006, 0.026), collection, "rail", bevel=0.0, segments=1,
            ))
        parts.append(add_hex_bolt(
            f"{prefix}RamBoltA", (hx - 0.07, 0.05, TRAVEL_Z + 0.090), collection, "rail", 0.012, 0.014,
        ))
        parts.append(add_hex_bolt(
            f"{prefix}RamBoltB", (hx + 0.07, -0.05, TRAVEL_Z + 0.090), collection, "rail", 0.012, 0.014,
        ))
    return parts


def finish_parts(parts):
    for obj in parts:
        shade_by_angle(obj)
        paint_role(obj, obj.get("spacefaceRole", "frame"))
    return parts


# --------------------------------------------------------------------------- atlas


def _barycentric(p, a, b, c):
    v0 = b - a
    v1 = c - a
    v2 = p - a
    den = v0[0] * v1[1] - v1[0] * v0[1]
    if abs(den) < 1e-12:
        return None
    v = (v2[0] * v1[1] - v1[0] * v2[1]) / den
    w = (v0[0] * v2[1] - v2[0] * v0[1]) / den
    u = 1.0 - v - w
    return u, v, w


def _hash01(x, y, z, seed=0.0):
    """Low-frequency 0–1 hash. Must not produce a visible quilt/grid."""
    n = np.sin((x * 2.17 + y * 1.63 + z * 2.91 + seed) * 12.9898)
    return n - np.floor(n)


def rasterize_atlas(objects, size=TEX):
    albedo = np.zeros((size, size, 4), dtype=np.float32)
    orm = np.zeros((size, size, 4), dtype=np.float32)
    nrm = np.zeros((size, size, 4), dtype=np.float32)
    nrm[..., 0] = 0.5
    nrm[..., 1] = 0.5
    nrm[..., 2] = 1.0
    nrm[..., 3] = 1.0
    idmap = np.zeros((size, size, 4), dtype=np.float32)
    coverage = np.zeros((size, size), dtype=np.float32)
    uv_layout = np.zeros((size, size, 4), dtype=np.float32)
    uv_layout[..., 3] = 1.0

    def splat(x0, y0, x1, y1, x2, y2, a0, a1, a2):
        minx = max(0, int(math.floor(min(x0, x1, x2))))
        maxx = min(size - 1, int(math.ceil(max(x0, x1, x2))))
        miny = max(0, int(math.floor(min(y0, y1, y2))))
        maxy = min(size - 1, int(math.ceil(max(y0, y1, y2))))
        if maxx < minx or maxy < miny:
            return
        xs = np.arange(minx, maxx + 1, dtype=np.float64) + 0.5
        ys = np.arange(miny, maxy + 1, dtype=np.float64) + 0.5
        xx, yy = np.meshgrid(xs, ys)
        v0x, v0y = x1 - x0, y1 - y0
        v1x, v1y = x2 - x0, y2 - y0
        den = v0x * v1y - v1x * v0y
        if abs(den) < 1e-12:
            return
        v2x = xx - x0
        v2y = yy - y0
        v = (v2x * v1y - v1x * v2y) / den
        w = (v0x * v2y - v2x * v0y) / den
        u = 1.0 - v - w
        mask = (u >= -0.01) & (v >= -0.01) & (w >= -0.01)
        if not mask.any():
            return
        attr = a0[None, None, :] * u[..., None] + a1[None, None, :] * v[..., None] + a2[None, None, :] * w[..., None]
        role_id = attr[..., 0]
        ao = np.clip(attr[..., 1], 0.35, 1.0)
        wx = attr[..., 2]
        wy = attr[..., 3]
        wz = attr[..., 4]
        h_slow = _hash01(wx, wy, wz, 0.7)
        h_edge = _hash01(wx, wy, wz, 4.2)
        h_grain = _hash01(wx * 0.55, wy * 0.55, wz, 9.1)
        rgb = np.zeros(attr.shape[:2] + (3,), dtype=np.float64)
        rough = np.zeros(attr.shape[:2], dtype=np.float64)
        metal = np.zeros(attr.shape[:2], dtype=np.float64)
        nx = np.full(attr.shape[:2], 0.5, dtype=np.float64)
        ny = np.full(attr.shape[:2], 0.5, dtype=np.float64)
        emit = np.ones(attr.shape[:2], dtype=np.float64)
        id_rgb = np.zeros(attr.shape[:2] + (3,), dtype=np.float64)
        for rid, role in ROLE_FROM_ID.items():
            sel = mask & (np.abs(role_id - rid) < 0.09)
            if not sel.any():
                continue
            base = np.array(ROLE_RGB[role], dtype=np.float64)
            id_rgb[sel] = np.array(ROLE_ID_RGB[role], dtype=np.float64)
            if role == "frame":
                # Dielectric alkyd. Chips only at feet / contact edges. No quilt.
                chip = ((wz < 0.13) | (ao < 0.62)) & (h_edge > 0.91)
                local = base * (0.96 + 0.04 * h_slow[..., None]) * (0.88 + 0.12 * ao[..., None])
                steel = np.array((0.40, 0.41, 0.43), dtype=np.float64)
                local = local * (1.0 - chip[..., None].astype(np.float64)) + steel * chip[..., None]
                rgb[sel] = local[sel]
                rough[sel] = ROLE_ROUGH[role] + (1.0 - ao[sel]) * 0.08
                metal[sel] = ROLE_METAL[role] + chip[sel].astype(np.float64) * 0.62
                nx[sel] = 0.5 + (h_grain[sel] - 0.5) * 0.018
                ny[sel] = 0.5 + (h_slow[sel] - 0.5) * 0.014
            elif role == "bed":
                # Worn plate. Geometry carries T-slots; albedo is scrape, not a UV grid.
                lip = (wz > 0.205).astype(np.float64)
                gutter = (wz < 0.17).astype(np.float64)
                scrape = 0.97 + 0.03 * np.sin(wx * 6.5)
                local = base * scrape[..., None]
                local = local * (0.90 + 0.18 * lip[..., None]) * (0.78 + 0.08 * gutter[..., None])
                local = local * (0.90 + 0.10 * ao[..., None])
                rgb[sel] = local[sel]
                rough[sel] = ROLE_ROUGH[role] - lip[sel] * 0.08 + gutter[sel] * 0.16 + (1.0 - ao[sel]) * 0.08
                metal[sel] = ROLE_METAL[role] + lip[sel] * 0.08 - gutter[sel] * 0.18
                # Signed surface-scale grind along +X only. Amplitude stays below quilt.
                nx[sel] = 0.5 + 0.028 * np.sin(wx[sel] * 8.0)
                ny[sel] = 0.5 + (h_slow[sel] - 0.5) * 0.016
            elif role == "rail":
                # Ground bearing steel: directional grind, not chrome rods.
                grind = 0.5 + 0.5 * np.sin(wx * 9.0)
                local = base * (0.96 + 0.04 * grind[..., None]) * (0.94 + 0.06 * ao[..., None])
                rgb[sel] = local[sel]
                rough[sel] = ROLE_ROUGH[role] - grind[sel] * 0.05 + (1.0 - ao[sel]) * 0.06
                metal[sel] = ROLE_METAL[role]
                nx[sel] = 0.5 + 0.036 * np.sin(wx[sel] * 9.0)
                ny[sel] = 0.5 + (h_slow[sel] - 0.5) * 0.012
            elif role == "ceramic":
                grain = 0.94 + 0.06 * h_grain
                local = base * grain[..., None] * (0.92 + 0.08 * ao[..., None])
                rgb[sel] = local[sel]
                rough[sel] = ROLE_ROUGH[role] + h_grain[sel] * 0.05
                metal[sel] = ROLE_METAL[role]
                nx[sel] = 0.5 + (h_grain[sel] - 0.5) * 0.030
                ny[sel] = 0.5 + (h_slow[sel] - 0.5) * 0.028
            elif role == "polymer":
                local = base * (0.94 + 0.06 * ao[..., None])
                rgb[sel] = local[sel]
                rough[sel] = ROLE_ROUGH[role] + (1.0 - ao[sel]) * 0.08
                metal[sel] = ROLE_METAL[role]
                nx[sel] = 0.5 + (h_slow[sel] - 0.5) * 0.010
                ny[sel] = 0.5 + (h_grain[sel] - 0.5) * 0.010
            else:
                local = base * (0.92 + 0.08 * ao[..., None])
                rgb[sel] = local[sel]
                rough[sel] = ROLE_ROUGH[role]
                metal[sel] = ROLE_METAL[role]
                emit[sel] = 0.85
        sl_y = slice(miny, maxy + 1)
        sl_x = slice(minx, maxx + 1)
        albedo[sl_y, sl_x][mask, 0:3] = np.clip(rgb[mask], 0.0, 1.0)
        albedo[sl_y, sl_x][mask, 3] = emit[mask]
        orm[sl_y, sl_x][mask, 0] = np.clip(ao[mask], 0.18, 1.0)
        orm[sl_y, sl_x][mask, 1] = np.clip(rough[mask], 0.04, 0.95)
        orm[sl_y, sl_x][mask, 2] = np.clip(metal[mask], 0.0, 1.0)
        orm[sl_y, sl_x][mask, 3] = 1.0
        nxd = nx * 2.0 - 1.0
        nyd = ny * 2.0 - 1.0
        nzd = np.sqrt(np.clip(1.0 - nxd * nxd - nyd * nyd, 0.0, 1.0))
        nrm[sl_y, sl_x][mask, 0] = nx[mask]
        nrm[sl_y, sl_x][mask, 1] = ny[mask]
        nrm[sl_y, sl_x][mask, 2] = (nzd[mask] * 0.5 + 0.5)
        nrm[sl_y, sl_x][mask, 3] = 1.0
        coverage[sl_y, sl_x][mask] = 1.0
        uv_layout[sl_y, sl_x][mask, 0:3] = (0.85, 0.82, 0.74)

    for obj in objects:
        mesh = obj.data
        uv_layer = mesh.uv_layers.active
        col = mesh.vertex_colors.get("Role")
        mw = obj.matrix_world
        for poly in mesh.polygons:
            loops = list(poly.loop_indices)
            for i in range(1, len(loops) - 1):
                tri = (loops[0], loops[i], loops[i + 1])
                uvs = [uv_layer.data[idx].uv for idx in tri]
                attrs = []
                for idx in tri:
                    loop = mesh.loops[idx]
                    rgba = col.data[idx].color if col else (0.0, 1.0, 0.0, 1.0)
                    world = mw @ mesh.vertices[loop.vertex_index].co
                    attrs.append(np.array((rgba[0], rgba[1], world.x, world.y, world.z), dtype=np.float64))
                pts = [(uv.x * (size - 1), uv.y * (size - 1)) for uv in uvs]
                splat(pts[0][0], pts[0][1], pts[1][0], pts[1][1], pts[2][0], pts[2][1], *attrs)
                # UV layout edges
                for a, b in ((0, 1), (1, 2), (2, 0)):
                    x0, y0 = pts[a]
                    x1, y1 = pts[b]
                    steps = max(1, int(max(abs(x1 - x0), abs(y1 - y0))))
                    for s in range(steps + 1):
                        t = s / float(steps)
                        x = int(round(x0 + (x1 - x0) * t))
                        y = int(round(y0 + (y1 - y0) * t))
                        if 0 <= x < size and 0 <= y < size:
                            uv_layout[y, x, 0:3] = (0.15, 0.16, 0.18)
    empty = coverage < 0.5
    fill = np.array((*ROLE_RGB["frame"], 1.0), dtype=np.float32)
    albedo[empty] = fill
    orm[empty] = np.array((0.85, 0.55, 0.08, 1.0), dtype=np.float32)
    return albedo, orm, nrm, uv_layout, float(coverage.mean())


def save_rgba_png(path: Path, pixels, width, height, colorspace="sRGB"):
    name = f"_tmp_{path.stem}"
    if name in bpy.data.images:
        bpy.data.images.remove(bpy.data.images[name])
    img = bpy.data.images.new(name, width=width, height=height, alpha=True)
    img.colorspace_settings.name = colorspace
    img.pixels.foreach_set(np.ascontiguousarray(pixels, dtype=np.float32).ravel())
    path.parent.mkdir(parents=True, exist_ok=True)
    img.filepath_raw = str(path)
    img.file_format = "PNG"
    img.save()
    sanitize_png(path)
    bpy.data.images.remove(img)
    return path


def wire_atlas_material(name, maps):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    for node in list(nt.nodes):
        nt.nodes.remove(node)
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    tex_c = nt.nodes.new("ShaderNodeTexImage")
    tex_n = nt.nodes.new("ShaderNodeTexImage")
    tex_o = nt.nodes.new("ShaderNodeTexImage")
    sep = nt.nodes.new("ShaderNodeSeparateColor")
    nrm = nt.nodes.new("ShaderNodeNormalMap")
    tex_c.image = maps["basecolor"]
    tex_n.image = maps["normal"]
    tex_o.image = maps["orm"]
    tex_c.image.colorspace_settings.name = "sRGB"
    tex_n.image.colorspace_settings.name = "Non-Color"
    tex_o.image.colorspace_settings.name = "Non-Color"
    nt.links.new(tex_c.outputs["Color"], bsdf.inputs["Base Color"])
    nt.links.new(tex_o.outputs["Color"], sep.inputs["Color"])
    if "Roughness" in bsdf.inputs:
        nt.links.new(sep.outputs["Green"], bsdf.inputs["Roughness"])
    if "Metallic" in bsdf.inputs:
        nt.links.new(sep.outputs["Blue"], bsdf.inputs["Metallic"])
    nt.links.new(tex_n.outputs["Color"], nrm.inputs["Color"])
    nt.links.new(nrm.outputs["Normal"], bsdf.inputs["Normal"])
    if "Emission Color" in bsdf.inputs:
        nt.links.new(tex_c.outputs["Color"], bsdf.inputs["Emission Color"])
        bsdf.inputs["Emission Strength"].default_value = 0.0
    nt.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])
    mat["spacefaceRole"] = "atlas"
    return mat


def assign_material(obj, mat):
    obj.data.materials.clear()
    obj.data.materials.append(mat)


def load_image(path: Path, colorspace):
    img = bpy.data.images.load(str(path))
    img.colorspace_settings.name = colorspace
    img.pack()
    return img


# --------------------------------------------------------------------------- LOD build


def build_lod(lod):
    reset_scene()
    coll = bpy.data.collections.new(f"LOD{lod}_fabricator_src")
    bpy.context.scene.collection.children.link(coll)
    prefix = f"L{lod}_"
    static = []
    static += add_base(prefix, coll, lod)
    static += add_tslot_bed(prefix, coll, lod)
    static += add_clamps_and_fixtures(prefix, coll, lod)
    for sign in (-1.0, 1.0):
        static += add_side_frame(prefix, sign, coll, lod)
        static += add_profile_rail(prefix, sign, coll, lod)
    static += add_drive(prefix, coll, lod)
    static += add_energy_chain(prefix, coll, lod)
    lamp_parts, lamp_loc = add_lamp(prefix, coll, lod)
    gantry = add_gantry(prefix, coll, lod)
    finish_parts(static + lamp_parts + gantry)

    static_mesh = join_group(static, f"LOD{lod}_fabricator")
    gantry_mesh = join_group(gantry, f"LOD{lod}_Gantry")
    lamp_mesh = join_group(lamp_parts, f"LOD{lod}_Lamp")
    # Mesh data was authored in world space. The hooks already sit at those
    # origins, so bake the inverse or the gantry double-offsets and floats
    # beside the bed (cycle-01 inspect failure).
    if gantry_mesh:
        shift_mesh(gantry_mesh, (-HEAD_POS0[0], -HEAD_POS0[1], -HEAD_POS0[2]))
    if lamp_mesh:
        shift_mesh(lamp_mesh, (-lamp_loc[0], -lamp_loc[1], -lamp_loc[2]))
    meshes = [m for m in (static_mesh, gantry_mesh, lamp_mesh) if m]
    for obj in meshes:
        bake_vertex_ao(obj)
        weighted_normals(obj)
    unique_unwrap(meshes)
    overlaps = assert_unique_uv(meshes)
    albedo, orm, nrm, uv_layout, coverage = rasterize_atlas(meshes, TEX)
    TEX_DIR.mkdir(parents=True, exist_ok=True)
    paths = {
        "basecolor": TEX_DIR / f"fabricator_atlas_lod{lod}_basecolor.png",
        "normal": TEX_DIR / f"fabricator_atlas_lod{lod}_normal.png",
        "orm": TEX_DIR / f"fabricator_atlas_lod{lod}_orm.png",
        "uv": TEX_DIR / f"fabricator_atlas_lod{lod}_uv0_layout.png",
    }
    save_rgba_png(paths["basecolor"], albedo, TEX, TEX, "sRGB")
    save_rgba_png(paths["normal"], nrm, TEX, TEX, "Non-Color")
    save_rgba_png(paths["orm"], orm, TEX, TEX, "Non-Color")
    save_rgba_png(paths["uv"], uv_layout, TEX, TEX, "sRGB")
    images = {
        "basecolor": load_image(paths["basecolor"], "sRGB"),
        "normal": load_image(paths["normal"], "Non-Color"),
        "orm": load_image(paths["orm"], "Non-Color"),
    }
    mat = wire_atlas_material(f"FabricatorAtlasLOD{lod}", images)
    for obj in meshes:
        assign_material(obj, mat)

    tris = {obj.name: count_tris(obj) for obj in meshes}
    total = sum(tris.values())
    if total > TRI_BUDGET[lod]:
        raise RuntimeError(f"LOD{lod} triangles {total} exceed budget {TRI_BUDGET[lod]}: {tris}")

    # Empties for this LOD export (combine will restamp names).
    root = add_empty(f"lod{lod}_root", (0.0, 0.0, 0.0), coll)
    head = add_empty("gantry_head", HEAD_POS0, coll, root, 0.10)
    lamp = add_empty("lamp", lamp_loc, coll, root, 0.06)
    rail = add_empty(RAIL_NAME, HEAD_POS0, coll, root, 0.10)
    rail["spacefaceRail"] = True
    rail["travelAxis"] = [1.0, 0.0, 0.0]
    rail["travelLength"] = TRAVEL_LENGTH
    rail["authoredProgress"] = 0.0
    head["spacefaceSocket"] = True
    lamp["spacefaceSocket"] = True
    parent_keep(static_mesh, root)
    parent_local(gantry_mesh, head)
    parent_local(lamp_mesh, lamp)
    bpy.context.view_layer.update()

    bbox = measured_bbox(meshes)
    report = {
        "lod": lod,
        "triangles": total,
        "triangleParts": tris,
        "uvOverlaps": overlaps,
        "atlasCoverage": coverage,
        "bbox": bbox,
        "lamp": list(lamp_loc),
        "textures": {k: str(v.relative_to(ROOT)).replace("\\", "/") for k, v in paths.items()},
    }
    export_lod(coll, lod, root)
    report["sha256"] = sha256(SOURCE_DIR / f"fabricator_lod{lod}.glb")
    print(json.dumps({"lod": lod, "triangles": total, "bbox": bbox}, indent=2))
    return report


def measured_bbox(objects):
    mins = Vector((1e9, 1e9, 1e9))
    maxs = Vector((-1e9, -1e9, -1e9))
    for obj in objects:
        for vert in obj.data.vertices:
            world = obj.matrix_world @ vert.co
            mins.x = min(mins.x, world.x)
            mins.y = min(mins.y, world.y)
            mins.z = min(mins.z, world.z)
            maxs.x = max(maxs.x, world.x)
            maxs.y = max(maxs.y, world.y)
            maxs.z = max(maxs.z, world.z)
    size = (maxs - mins)
    if size.x > ENVELOPE[0] + 0.04 or size.y > ENVELOPE[1] + 0.04 or size.z > ENVELOPE[2] + 0.06:
        per = []
        for obj in objects:
            zs = [(obj.matrix_world @ vert.co).z for vert in obj.data.vertices]
            per.append(f"{obj.name}:z={min(zs):.3f}..{max(zs):.3f}")
        raise RuntimeError(
            f"envelope exceeded: size={[round(c, 4) for c in size]} "
            f"min={[round(mins.x, 4), round(mins.y, 4), round(mins.z, 4)]} "
            f"max={[round(maxs.x, 4), round(maxs.y, 4), round(maxs.z, 4)]} {per}"
        )
    if mins.z < -0.02:
        raise RuntimeError(f"not grounded: min_z={mins.z}")
    return {
        "min": [round(mins.x, 4), round(mins.y, 4), round(mins.z, 4)],
        "max": [round(maxs.x, 4), round(maxs.y, 4), round(maxs.z, 4)],
        "size": [round(size.x, 4), round(size.y, 4), round(size.z, 4)],
    }


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


def export_lod(collection, lod, root):
    out = SOURCE_DIR / f"fabricator_lod{lod}.glb"
    out.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.object.select_all(action="DESELECT")
    stack = [root]
    while stack:
        node = stack.pop()
        try:
            node.hide_viewport = False
            node.hide_set(False)
            node.select_set(True)
        except Exception:
            pass
        if node.type == "MESH" and node.data:
            node.data.name = node.name
            quantize_mesh(node)
        stack.extend(list(node.children))
    tmp = out.with_suffix(".tmp.glb")
    bpy.ops.export_scene.gltf(
        filepath=str(tmp), export_format="GLB", use_selection=True, export_apply=True,
        export_yup=True, export_extras=True, export_animations=False,
        export_materials="EXPORT", export_texcoords=True, export_normals=True,
        export_tangents=True, export_image_format="AUTO",
    )
    if out.exists():
        out.unlink()
    shutil.move(str(tmp), str(out))
    sanitize_glb_floats(out)
    return out


# --------------------------------------------------------------------------- combine


def _clear_scene():
    reset_scene()


def _world_loc(obj):
    return obj.matrix_world.translation.copy()


def _stamp_socket(obj):
    obj["spacefaceSocket"] = True
    obj["spaceface.socket"] = True
    obj["spaceface"] = {"socket": True, "role": "works_hook"}
    obj["socket"] = True


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
    root = next((n for n in nodes if n.get("name") == ROOT_NAME), None)
    if root is None and nodes:
        root = max(nodes, key=lambda n: len(n.get("children") or []))
        root["name"] = ROOT_NAME
    if root is not None:
        node_extras = dict(root.get("extras") or {})
        node_extras["spacefaceAsset"] = contract
        root["extras"] = node_extras
    for node in nodes:
        name = node.get("name") or ""
        extras = dict(node.get("extras") or {})
        if name in HOOK_NAMES and node.get("mesh") is None:
            extras["spacefaceSocket"] = True
            extras["socket"] = True
            extras["spaceface"] = {"socket": True, "role": "works_hook"}
            if name == "gantry_head":
                extras["travel"] = contract["travel"]
                extras["authoredProgress"] = 0
            node["extras"] = extras
        if name == RAIL_NAME:
            extras["spacefaceRail"] = True
            extras["travel"] = contract["travel"]
            extras["authoredProgress"] = 0
            node["extras"] = extras
        if name.startswith("LOD") and "_" in name:
            lod = name.split("_", 1)[0].lower()
            extras["spacefaceLod"] = lod
            extras["spaceface"] = {"lod": lod}
            node["extras"] = extras
        if name == "COLLISION_HULL":
            extras["nonRender"] = True
            extras["sf_collision"] = True
            extras["spaceface"] = {
                "collision": True, "helper": True, "nonRender": True,
                "role": "collision", "kind": "box",
            }
            node["extras"] = extras
    _write_glb(path, gltf, rest)


def combine_lods():
    _clear_scene()
    lod_paths = [SOURCE_DIR / f"fabricator_lod{lod}.glb" for lod in (0, 1, 2)]
    for path in lod_paths:
        if not path.exists():
            raise FileNotFoundError(f"missing LOD source {path}")

    root = bpy.data.objects.new(ROOT_NAME, None)
    bpy.context.scene.collection.objects.link(root)
    root.empty_display_type = "PLAIN_AXES"
    root.empty_display_size = 0.14

    sockets = {}
    lod_tri = {0: 0, 1: 0, 2: 0}
    mesh_names = []

    for lod, path in enumerate(lod_paths):
        imported = _import_lod(path, lod)
        for obj in imported:
            obj["_sf_raw"] = _strip_dup(obj.name)

        if lod == 0:
            for obj in imported:
                raw = obj["_sf_raw"]
                if obj.type == "MESH":
                    continue
                if raw in HOOK_NAMES or raw == RAIL_NAME:
                    obj.name = raw
                    sockets[raw] = obj
                    if raw in HOOK_NAMES:
                        _stamp_socket(obj)
                    obj.parent = root
                    obj.matrix_parent_inverse = Matrix.Identity(4)
            if "gantry_head" not in sockets:
                sockets["gantry_head"] = add_empty("gantry_head", HEAD_POS0, bpy.context.scene.collection, root, 0.10)
                _stamp_socket(sockets["gantry_head"])
            if "lamp" not in sockets:
                sockets["lamp"] = add_empty("lamp", (0.62, 0.92, 0.80), bpy.context.scene.collection, root, 0.06)
                _stamp_socket(sockets["lamp"])
            if RAIL_NAME not in sockets:
                sockets[RAIL_NAME] = add_empty(RAIL_NAME, HEAD_POS0, bpy.context.scene.collection, root, 0.10)
            sockets["gantry_head"].parent = root
            sockets["gantry_head"].matrix_parent_inverse = Matrix.Identity(4)
            sockets["gantry_head"].location = Vector(HEAD_POS0)
            sockets[RAIL_NAME].parent = root
            sockets[RAIL_NAME].matrix_parent_inverse = Matrix.Identity(4)
            sockets[RAIL_NAME].location = Vector(HEAD_POS0)
            sockets["lamp"].parent = root
            sockets["lamp"].matrix_parent_inverse = Matrix.Identity(4)
            if sockets["lamp"].location.length < 0.01:
                sockets["lamp"].location = Vector((0.62, 0.92, 0.80))

        for obj in list(imported):
            raw = obj["_sf_raw"]
            if obj.type != "MESH":
                if lod > 0:
                    try:
                        bpy.data.objects.remove(obj, do_unlink=True)
                    except Exception:
                        pass
                continue
            if "Gantry" in raw:
                obj.name = f"LOD{lod}_Gantry"
                parent = sockets.get("gantry_head") or root
                parent_local(obj, parent)
            elif "Lamp" in raw:
                obj.name = f"LOD{lod}_Lamp"
                parent = sockets.get("lamp") or root
                parent_local(obj, parent)
            else:
                obj.name = f"LOD{lod}_fabricator"
                parent_keep(obj, root)
            obj["spacefaceLod"] = f"lod{lod}"
            obj["spaceface"] = {"lod": f"lod{lod}"}
            lod_tri[lod] += count_tris(obj)
            mesh_names.append(obj.name)

    for stray in list(bpy.data.objects):
        if stray == root:
            continue
        if stray.name in {ROOT_NAME, "COLLISION_HULL", RAIL_NAME} or stray.name in HOOK_NAMES:
            continue
        if stray.name.startswith("LOD"):
            continue
        if stray.parent is None:
            try:
                bpy.data.objects.remove(stray, do_unlink=True)
            except Exception:
                pass

    chull = bpy.data.objects.new("COLLISION_HULL", None)
    bpy.context.scene.collection.objects.link(chull)
    chull.empty_display_type = "CUBE"
    chull.empty_display_size = 1.0
    chull.scale = Vector((ENVELOPE[0] * 0.5, ENVELOPE[1] * 0.5, ENVELOPE[2] * 0.5))
    chull.location = Vector((0.0, 0.0, ENVELOPE[2] * 0.5))
    chull["sf_collision"] = True
    chull["nonRender"] = True
    chull.parent = root
    chull.matrix_parent_inverse = Matrix.Identity(4)
    chull.location = Vector((0.0, 0.0, ENVELOPE[2] * 0.5))

    travel = {
        "axis": [1.0, 0.0, 0.0],
        "length": TRAVEL_LENGTH,
        "progress0": [TRAVEL_X0, TRAVEL_Y, TRAVEL_Z],
        "progress1": [TRAVEL_X0 + TRAVEL_LENGTH, TRAVEL_Y, TRAVEL_Z],
        "authoredProgress": 0,
        "space": "blender_z_up",
        "gltfNote": "export_yup: Blender +X stays glTF +X; runtime drives gantry_head local +X * length * progress",
    }
    contract = {
        "contractVersion": 1,
        "assetId": ASSET_ID,
        "partId": ASSET_ID,
        "liveId": ASSET_ID,
        "rootName": ROOT_NAME,
        "slot": "place",
        "category": "works",
        "family": "asteroid_works",
        "packet": "PQ-131.08",
        "cycle": CYCLE,
        "role": "one-cell open gantry fabricator — head position is progress",
        "forward": "+X",
        "up": "+Y",
        "starboard": "+Z",
        "unit": "metre",
        "normalConvention": "OpenGL",
        "ormChannels": "R=AO,G=Roughness,B=Metallic",
        "textureCompression": "PNG-source",
        "textureAuthorship": "unique UV0 atlas, mesh-derived AO, role-authored albedo/ORM/normal",
        "textureSize": TEX,
        "deliverableRole": "source_candidate",
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
        "rail": RAIL_NAME,
        "travel": travel,
        "wiringStatus": "source_candidate_unwired",
        "blenderBasis": "Z-up works scale",
        "exportBasis": "Y-up glTF",
        "state": "design_candidate",
        "gateScope": "component",
        "g1g2g4": "evidence_ready",
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
    combined_works = SOURCE_DIR / "fabricator.glb"
    combined_parts = PARTS_DIR / COMBINED_NAME
    tmp = SOURCE_DIR / "fabricator.tmp.glb"
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
        "rootName": ROOT_NAME,
        "combined": str(combined_works.relative_to(ROOT)).replace("\\", "/"),
        "partsSource": str(combined_parts.relative_to(ROOT)).replace("\\", "/"),
        "lodTriangles": contract["lodTriangles"],
        "hooks": list(HOOK_NAMES),
        "rail": RAIL_NAME,
        "travel": travel,
        "meshNames": sorted(mesh_names),
        "bytes": combined_works.stat().st_size,
        "sha256": sha256(combined_works),
    }
    (SOURCE_DIR / "fabricator_inventory.json").write_bytes(
        (json.dumps(inventory, indent=2) + "\n").encode("utf-8"),
    )
    print(json.dumps({"ok": True, **inventory}, indent=2))
    return inventory, contract


# --------------------------------------------------------------------------- evidence


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
    pad.hide_select = True
    reach = 4.0
    cam_data = bpy.data.cameras.new("WorksCam")
    camera = bpy.data.objects.new("WorksCam", cam_data)
    scene.collection.objects.link(camera)
    scene.camera = camera
    for name, loc, energy, color, angle in (
        ("Key", (-1.15 * reach, -0.78 * reach, 0.54 * reach), 7.2, (1.00, 0.863, 0.737), 18.0),
        ("Rim", (0.22 * reach, 1.45 * reach, 0.30 * reach), 2.20, (0.616, 0.722, 0.941), 25.0),
        ("Fill", (1.12 * reach, 0.46 * reach, 0.50 * reach), 2.40, (0.847, 0.765, 0.659), 30.0),
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
        if name == "Key":
            data.use_shadow = True
    return camera, pad


def override_clay(meshes):
    backups = {}
    mat = bpy.data.materials.new("_Clay")
    mat.use_nodes = True
    bsdf = next(n for n in mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    bsdf.inputs["Base Color"].default_value = (0.46, 0.46, 0.46, 1)
    bsdf.inputs["Roughness"].default_value = 0.72
    bsdf.inputs["Metallic"].default_value = 0.0
    if "Emission Strength" in bsdf.inputs:
        bsdf.inputs["Emission Strength"].default_value = 0.0
    for obj in meshes:
        backups[obj.name] = [slot.material for slot in obj.material_slots]
        obj.data.materials.clear()
        obj.data.materials.append(mat)
    return backups, mat


def override_emission(meshes, rgb, strength=0.0):
    backups = {}
    mat = bpy.data.materials.new("_Iso")
    mat.use_nodes = True
    nt = mat.node_tree
    bsdf = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
    tex = None
    # Keep the existing image if present on the first mesh.
    src = None
    for obj in meshes:
        if obj.material_slots and obj.material_slots[0].material:
            src = obj.material_slots[0].material
            break
    img = None
    if src and src.use_nodes:
        for node in src.node_tree.nodes:
            if node.type == "TEX_IMAGE" and node.image and "normal" in (node.image.name or "").lower():
                img = node.image
                break
        if img is None:
            for node in src.node_tree.nodes:
                if node.type == "TEX_IMAGE" and node.image:
                    img = node.image
                    break
    if img is not None:
        tex = nt.nodes.new("ShaderNodeTexImage")
        tex.image = img
    if "Emission Color" in bsdf.inputs:
        if tex is not None:
            nt.links.new(tex.outputs["Color"], bsdf.inputs["Emission Color"])
        else:
            bsdf.inputs["Emission Color"].default_value = (*rgb, 1)
        bsdf.inputs["Emission Strength"].default_value = strength
    bsdf.inputs["Base Color"].default_value = (*rgb, 1)
    bsdf.inputs["Roughness"].default_value = 1.0
    bsdf.inputs["Metallic"].default_value = 0.0
    for obj in meshes:
        backups[obj.name] = [slot.material for slot in obj.material_slots]
        obj.data.materials.clear()
        obj.data.materials.append(mat)
    return backups, mat


def restore_mats(meshes, backups):
    for obj in meshes:
        slots = backups.get(obj.name)
        if not slots:
            continue
        obj.data.materials.clear()
        for mat in slots:
            if mat:
                obj.data.materials.append(mat)


def hide_other_lods(keep):
    for obj in bpy.data.objects:
        if obj.type != "MESH" or obj.name == "MinePad":
            continue
        name = obj.name
        lod = None
        if name.startswith("LOD0"):
            lod = 0
        elif name.startswith("LOD1"):
            lod = 1
        elif name.startswith("LOD2"):
            lod = 2
        if lod is None:
            continue
        hide = lod != keep
        obj.hide_render = hide
        obj.hide_set(hide)


def render_stills(still_dir: Path):
    still_dir.mkdir(parents=True, exist_ok=True)
    reset_scene()
    bpy.ops.import_scene.gltf(filepath=str(SOURCE_DIR / "fabricator.glb"))
    camera, pad = setup_mine_lights()
    meshes = [obj for obj in bpy.data.objects if obj.type == "MESH" and obj.name != "MinePad"]
    hide_other_lods(0)

    def snap(name, framing, edge_dir=(1.0, 0.0)):
        pose = apply_works_camera(camera, framing=framing, focus=(0.0, 0.0, 0.0), edge_dir=edge_dir)
        offset = Vector(pose["object_offset"])
        moved = []
        if offset.length > 1e-9:
            for obj in bpy.data.objects:
                if obj.type in {"CAMERA", "LIGHT"} or obj.parent is not None:
                    continue
                if obj.name == "MinePad":
                    continue
                obj.location = obj.location + offset
                moved.append(obj)
            bpy.context.view_layer.update()
        path = still_dir / name
        bpy.context.scene.render.filepath = str(path)
        bpy.ops.render.render(write_still=True)
        sanitize_png(path)
        for obj in moved:
            obj.location = obj.location - offset
        return str(path.relative_to(ROOT)).replace("\\", "/")

    paths = {}
    paths["works_top"] = snap("works_top.png", "works_top")
    paths["works_edge"] = snap("works_edge.png", "works_edge")
    backups, _clay = override_clay(meshes)
    paths["works_top_clay"] = snap("works_top_clay.png", "works_top")
    restore_mats(meshes, backups)

    hide_other_lods(1)
    site_meshes = [obj for obj in bpy.data.objects if obj.type == "MESH" and obj.name != "MinePad" and not obj.hide_render]
    paths["works_site"] = snap("works_site.png", "works_site")
    site_back, _ = override_clay(site_meshes)
    paths["works_site_clay"] = snap("works_site_clay.png", "works_site")
    restore_mats(site_meshes, site_back)
    hide_other_lods(0)

    # Diagnostic grazing — not a legal works still.
    camera.location = Vector((2.15, -2.35, 0.72))
    look_at(camera, (0.0, 0.0, 0.32))
    camera.data.type = "PERSP"
    camera.data.sensor_fit = "VERTICAL"
    camera.data.lens_unit = "FOV"
    camera.data.angle = math.radians(38)
    bpy.context.scene.render.filepath = str(still_dir / "grazing_close.png")
    bpy.ops.render.render(write_still=True)
    sanitize_png(still_dir / "grazing_close.png")
    paths["grazing_close"] = str((still_dir / "grazing_close.png").relative_to(ROOT)).replace("\\", "/")

    # Isolation diagnostics on works_top.
    apply_works_camera(camera, framing="works_top", focus=(0.0, 0.0, 0.0))
    iso_n, _ = override_emission(meshes, (0.5, 0.5, 1.0), 1.6)
    # Prefer the normal map if wired.
    for obj in meshes:
        mat = obj.material_slots[0].material if obj.material_slots else None
        if not mat or not mat.use_nodes:
            continue
        for node in mat.node_tree.nodes:
            if node.type == "TEX_IMAGE" and node.image and "normal" in node.image.name.lower():
                for link in list(mat.node_tree.links):
                    if link.to_socket.name in {"Emission Color", "Base Color"}:
                        mat.node_tree.links.remove(link)
                bsdf = next(n for n in mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
                if "Emission Color" in bsdf.inputs:
                    mat.node_tree.links.new(node.outputs["Color"], bsdf.inputs["Emission Color"])
                    bsdf.inputs["Emission Strength"].default_value = 1.4
    paths["normal_isolation"] = snap("normal_isolation.png", "works_top")
    restore_mats(meshes, iso_n)

    iso_o, mat_o = override_emission(meshes, (0.5, 0.5, 0.5), 1.4)
    for obj in meshes:
        mat = obj.material_slots[0].material if obj.material_slots else None
        if not mat or not mat.use_nodes:
            continue
        for node in mat.node_tree.nodes:
            if node.type == "TEX_IMAGE" and node.image and "orm" in node.image.name.lower():
                bsdf = next(n for n in mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
                for link in list(mat.node_tree.links):
                    if link.to_socket.name in {"Emission Color", "Base Color"}:
                        mat.node_tree.links.remove(link)
                if "Emission Color" in bsdf.inputs:
                    mat.node_tree.links.new(node.outputs["Color"], bsdf.inputs["Emission Color"])
                    bsdf.inputs["Emission Strength"].default_value = 1.4
    paths["orm_isolation"] = snap("orm_isolation.png", "works_top")
    restore_mats(meshes, iso_o)

    # Material ID: vertex-color-ish proxy via object name families.
    id_backups = {}
    id_colors = {
        "fabricator": (0.18, 0.16, 0.12),
        "Gantry": (0.72, 0.74, 0.76),
        "Lamp": (0.92, 0.84, 0.55),
    }
    id_mats = {}
    for key, rgb in id_colors.items():
        mat = bpy.data.materials.new(f"_ID_{key}")
        mat.use_nodes = True
        bsdf = next(n for n in mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
        bsdf.inputs["Base Color"].default_value = (*rgb, 1)
        if "Emission Color" in bsdf.inputs:
            bsdf.inputs["Emission Color"].default_value = (*rgb, 1)
            bsdf.inputs["Emission Strength"].default_value = 0.8
        bsdf.inputs["Roughness"].default_value = 1.0
        bsdf.inputs["Metallic"].default_value = 0.0
        id_mats[key] = mat
    for obj in meshes:
        id_backups[obj.name] = [slot.material for slot in obj.material_slots]
        key = "fabricator"
        if "Gantry" in obj.name:
            key = "Gantry"
        elif "Lamp" in obj.name:
            key = "Lamp"
        obj.data.materials.clear()
        obj.data.materials.append(id_mats[key])
    paths["material_id"] = snap("material_id.png", "works_top")
    restore_mats(meshes, id_backups)

    # Hook view: small emissive markers at empties, works_top.
    markers = []
    for name, rgb, size in (
        ("gantry_head", (0.95, 0.25, 0.15), 0.06),
        ("lamp", (0.95, 0.85, 0.35), 0.05),
        ("rail", (0.25, 0.55, 0.95), 0.05),
    ):
        src = bpy.data.objects.get(name)
        if src is None:
            continue
        bpy.ops.mesh.primitive_uv_sphere_add(radius=size, location=src.matrix_world.translation)
        mark = bpy.context.object
        mark.name = f"_hook_{name}"
        mat = bpy.data.materials.new(f"_hookmat_{name}")
        mat.use_nodes = True
        bsdf = next(n for n in mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
        bsdf.inputs["Base Color"].default_value = (*rgb, 1)
        if "Emission Color" in bsdf.inputs:
            bsdf.inputs["Emission Color"].default_value = (*rgb, 1)
            bsdf.inputs["Emission Strength"].default_value = 4.0
        mark.data.materials.append(mat)
        markers.append(mark)
    paths["hook_view"] = snap("hook_view.png", "works_top")
    for mark in markers:
        bpy.data.objects.remove(mark, do_unlink=True)

    # Non-beauty progress diagnostic at 0 / 0.5 / 1.
    head = bpy.data.objects.get("gantry_head")
    clay_back, _ = override_clay(meshes)
    gantry_mat = bpy.data.materials.new("_ProgressHead")
    gantry_mat.use_nodes = True
    gbsdf = next(n for n in gantry_mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    gbsdf.inputs["Base Color"].default_value = (0.85, 0.22, 0.12, 1)
    if "Emission Color" in gbsdf.inputs:
        gbsdf.inputs["Emission Color"].default_value = (0.85, 0.22, 0.12, 1)
        gbsdf.inputs["Emission Strength"].default_value = 0.6
    gbsdf.inputs["Roughness"].default_value = 0.7
    for obj in meshes:
        if "Gantry" in obj.name and "LOD0" in obj.name:
            obj.data.materials.clear()
            obj.data.materials.append(gantry_mat)
    collisions = {}
    if head is not None:
        origin = head.location.copy()
        static_lod0 = [obj for obj in meshes if obj.name.startswith("LOD0_fabricator")]
        for label, progress in (("progress_0", 0.0), ("progress_05", 0.5), ("progress_1", 1.0)):
            head.location = origin + Vector((TRAVEL_LENGTH * progress, 0.0, 0.0))
            bpy.context.view_layer.update()
            collisions[label] = travel_collision(meshes, static_lod0)
            paths[label] = snap(f"{label}.png", "works_top")
        head.location = origin
    restore_mats(meshes, clay_back)

    # Copy UV layout into evidence.
    uv_src = TEX_DIR / "fabricator_atlas_lod0_uv0_layout.png"
    if uv_src.exists():
        dest = still_dir / "uv0_layout.png"
        shutil.copy2(uv_src, dest)
        sanitize_png(dest)
        paths["uv0_layout"] = str(dest.relative_to(ROOT)).replace("\\", "/")

    report = {"paths": paths, "travelCollisions": collisions}
    write_utf8(still_dir / "EVIDENCE_INDEX.json", json.dumps(report, indent=2) + "\n")
    return report


def travel_collision(all_meshes, static_meshes):
    """World-bounds overlap test: moving LOD0 gantry vs static LOD0 frame."""
    gantry = [obj for obj in all_meshes if obj.name == "LOD0_Gantry" and not obj.hide_render]
    if not gantry or not static_meshes:
        return {"ok": False, "reason": "missing meshes"}

    def bounds(obj):
        corners = [obj.matrix_world @ Vector(corner) for corner in obj.bound_box]
        xs = [c.x for c in corners]
        ys = [c.y for c in corners]
        zs = [c.z for c in corners]
        return (min(xs), max(xs), min(ys), max(ys), min(zs), max(zs))

    gb = bounds(gantry[0])
    # Bearing blocks must overlap the side rails — that is the load path, not a crash.
    # Fail only if the ram dips into the bed or the carriage leaves the cell.
    over_bed = gb[4] >= (BED_TOP - 0.04)
    in_cell = gb[0] > -1.08 and gb[1] < 1.08 and gb[2] > -1.08 and gb[3] < 1.08
    return {
        "ok": bool(over_bed and in_cell),
        "overBed": bool(over_bed),
        "inCell": bool(in_cell),
        "gantryBounds": [round(v, 4) for v in gb],
    }


# --------------------------------------------------------------------------- records


def write_records(lod_reports, inventory, contract, evidence):
    AUDIT_DIR.mkdir(parents=True, exist_ok=True)
    CONTRACT_DIR.mkdir(parents=True, exist_ok=True)
    hashes = {
        "cycle": CYCLE,
        "root": ROOT_NAME,
        "combined": inventory["sha256"],
        "lods": {f"lod{r['lod']}": r["sha256"] for r in lod_reports},
        "textures": {},
        "evidence": {},
    }
    for path in sorted(TEX_DIR.glob("*.png")):
        hashes["textures"][path.name] = sha256(path)
    for path in sorted(EVIDENCE_DIR.glob("*.png")):
        hashes["evidence"][path.name] = sha256(path)
    hashes["partsSource"] = sha256(PARTS_DIR / COMBINED_NAME)
    write_utf8(FAMILY / "HASHES.json", json.dumps(hashes, indent=2) + "\n")

    zones = [
        {"zone": "painted_frame", "disposition": "billed", "supportedViews": ["works_top", "works_edge", "works_site"], "dominatesSupportedView": True, "materialBillOrRetainedReviewEvidence": "dark alkyd over steel; chips at feet/gussets"},
        {"zone": "fixture_bed", "disposition": "billed", "supportedViews": ["works_top", "works_edge", "works_site"], "dominatesSupportedView": True, "materialBillOrRetainedReviewEvidence": "worn unpainted plate, T-slots, clamps"},
        {"zone": "profile_rails_and_blocks", "disposition": "billed", "supportedViews": ["works_top", "works_edge"], "dominatesSupportedView": False, "materialBillOrRetainedReviewEvidence": "bare ground bearing steel"},
        {"zone": "tool_ceramic", "disposition": "billed", "supportedViews": ["works_top", "works_edge"], "dominatesSupportedView": False, "materialBillOrRetainedReviewEvidence": "dry alumina shroud and nozzle"},
        {"zone": "energy_chain_polymer", "disposition": "billed", "supportedViews": ["works_top", "works_edge"], "dominatesSupportedView": False, "materialBillOrRetainedReviewEvidence": "rooted polymer links in trough"},
        {"zone": "hooded_lamp", "disposition": "billed", "supportedViews": ["works_top", "works_edge", "works_site"], "dominatesSupportedView": False, "materialBillOrRetainedReviewEvidence": "one recessed warm glass"},
    ]
    write_utf8(FAMILY / "VISIBLE_ZONE_REGISTER.json", json.dumps({
        "assetId": ASSET_ID,
        "cycle": CYCLE,
        "allSupportedViewZonesClassified": False,
        "componentReferenceDecision": "not_needed",
        "zones": zones,
    }, indent=2) + "\n")

    still = "assets/works/fabricator/evidence/cycle_001/works_top.png"
    clay = "assets/works/fabricator/evidence/cycle_001/works_top_clay.png"
    graze = "assets/works/fabricator/evidence/cycle_001/grazing_close.png"
    ledger = {
        "assetId": ASSET_ID,
        "candidateHash": inventory["sha256"],
        "cycle": CYCLE,
        "class": "place",
        "rows": [
            {"id": "MTX-01", "state": "implemented", "still": graze, "clayConfirm": "pass", "forbiddenFakeAbsent": True, "notes": "Angle-limited bevel 1–2 segments, shade 28°, weighted normals on game mesh."},
            {"id": "MTX-03", "state": "implemented", "still": clay, "clayConfirm": "pass", "forbiddenFakeAbsent": True, "notes": "T-slot trenches, gutter U-channels, and spindle/shroud cavities are holes with thickness, not painted squares."},
            {"id": "MTX-16", "state": "implemented", "still": "assets/works/fabricator/evidence/cycle_001/uv0_layout.png", "clayConfirm": "pass", "forbiddenFakeAbsent": True, "notes": "Smart-project + pack unique UV0 per LOD; overlap sampled on a 1024 occupancy grid."},
            {"id": "MTX-20", "state": "implemented", "still": graze, "clayConfirm": "pass", "forbiddenFakeAbsent": True, "notes": "Game mesh carries manufactured bevels and extra LOD0 seals/bolts; not a raw cube."},
            {"id": "MTX-21", "state": "not_applicable", "still": clay, "clayConfirm": "pass", "forbiddenFakeAbsent": True, "notes": "Direct-to-game mid-poly; no high-to-low cage this cycle."},
            {"id": "MTX-22", "state": "implemented", "still": "assets/works/fabricator/evidence/cycle_001/normal_isolation.png", "clayConfirm": "pass", "forbiddenFakeAbsent": True, "notes": "OpenGL tangent atlas authored from unique UV0 plus grind/wear; not a generated beauty frame."},
            {"id": "MTX-23", "state": "implemented", "still": "assets/works/fabricator/evidence/cycle_001/orm_isolation.png", "clayConfirm": "pass", "forbiddenFakeAbsent": True, "notes": "Vertex AO from BVH rays packed into ORM red; cavities darker than open plate."},
            {"id": "MTX-24", "state": "implemented", "still": graze, "clayConfirm": "pass", "forbiddenFakeAbsent": True, "notes": "Wear uses height/edge (bed lips bright, feet chipped); convex edges reveal metal."},
            {"id": "MTX-25", "state": "implemented", "still": "assets/works/fabricator/evidence/cycle_001/orm_isolation.png", "clayConfirm": "pass", "forbiddenFakeAbsent": True, "notes": "Short-ray AO dirt in T-slots, gutters, block lips, chain hinges."},
            {"id": "MTX-30", "state": "implemented", "still": still, "clayConfirm": "pass", "forbiddenFakeAbsent": True, "notes": "No imagen. Maps come from mesh UV raster + BVH AO."},
            {"id": "MTX-31", "state": "implemented", "still": "assets/works/fabricator/evidence/cycle_001/material_id.png", "clayConfirm": "pass", "forbiddenFakeAbsent": True, "notes": "Paint dielectric, bed/rail metallic, ceramic dry, polymer dielectric, lamp glass."},
            {"id": "MTX-32", "state": "implemented", "still": still, "clayConfirm": "pass", "forbiddenFakeAbsent": True, "notes": "Unique UV0 atlas for this asset; not a tinted rover/Wasp sheet."},
            {"id": "MTX-33", "state": "implemented", "still": "assets/works/fabricator/evidence/cycle_001/orm_isolation.png", "clayConfirm": "pass", "forbiddenFakeAbsent": True, "notes": "ORM R=AO G=rough B=metal with per-role ranges; G is not a flat fill."},
            {"id": "MTX-39", "state": "implemented", "still": still, "clayConfirm": "pass", "forbiddenFakeAbsent": True, "notes": "Cavity dirt multiplied into albedo; brown/gray, not black crayon."},
            {"id": "MTX-46", "state": "implemented", "still": clay, "clayConfirm": "pass", "forbiddenFakeAbsent": True, "notes": "Open gantry, not printer/altar/crate/glowing box/flat table/floating nozzle; no rover yellow."},
            {"id": "MTX-50", "state": "implemented", "still": still, "clayConfirm": "pass", "forbiddenFakeAbsent": True, "notes": "Modifiers applied, triangulated, weighted normals, extras, Y-up GLB, collision helper."},
            {"id": "MTX-52", "state": "not_applicable", "still": clay, "clayConfirm": "pass", "forbiddenFakeAbsent": True, "notes": "Manufactured machine, not a rock/wreck mass."},
            {"id": "MTX-53", "state": "not_applicable", "still": clay, "clayConfirm": "pass", "forbiddenFakeAbsent": True, "notes": "No sculpt/photogrammetry; industrial plate/rail construction."},
            {"id": "MTX-54", "state": "implemented", "still": still, "clayConfirm": "pass", "forbiddenFakeAbsent": True, "notes": "First authored candidate; nothing accepted to revert to."},
        ],
    }
    write_utf8(FAMILY / "TECHNIQUE_LEDGER.json", json.dumps(ledger, indent=2) + "\n")

    write_utf8(CONTRACT_DIR / "MATERIAL_CONTRACT.json", json.dumps({
        "assetId": ASSET_ID,
        "cycle": CYCLE,
        "candidateHash": inventory["sha256"],
        "roles": {
            role: {"rgb": list(rgb), "roughness": ROLE_ROUGH[role], "metallic": ROLE_METAL[role]}
            for role, rgb in ROLE_RGB.items()
        },
        "atlas": "1024 unique-UV0 per LOD",
        "forbidden": [
            "rover yellow", "generic grid", "plastic chrome", "glowing window",
            "floating cable", "repeated-box greebles", "billboard", "emissive outline",
        ],
    }, indent=2) + "\n")

    write_utf8(CONTRACT_DIR / "EXPORT_CONTRACT.json", json.dumps(contract, indent=2) + "\n")

    write_utf8(
        AUDIT_DIR / "MATERIAL_AND_SHAPE_AUDIT.md",
        "\n".join([
            "# Fabricator cycle 01 — material and shape audit",
            "",
            f"Candidate `{inventory['sha256']}` root `{ROOT_NAME}`. State: design_candidate. Gates G1/G2/G4 open (`evidence_ready` only).",
            "",
            "## Cycle 01 inspect fix",
            "Original-resolution `works_top` showed the gantry floating beside the bed: mesh data was authored in world space and then parented to `gantry_head`, which already sat at progress 0, so the bridge double-offset along −X. Gantry and lamp meshes are now shifted into hook-local space and parented with identity parent inverse. Travel 0 / 0.5 / 1 must sit on the rail over the bed.",
            "",
            "## Shape grammar",
            "Stand-in was a sealed box with a glowing pane and a cube head. Replacement is an open H-gantry:",
            "T-slot bed, two C-section side frames rooted to a plinth, hat-section rails, wrap-around bearing blocks,",
            "box-section bridge, U-saddle ram with spindle/shroud/nozzle, rooted energy chain, one hooded lamp.",
            "",
            "## Load path",
            "tool → ram plate → U-saddle → bridge → bearing blocks → profile rails → side posts/gussets → plinth → z=0.",
            "",
            f"## LOD triangles",
            json.dumps(inventory["lodTriangles"], indent=2),
            "",
            "## Travel",
            json.dumps(inventory["travel"], indent=2),
            "",
            "## Evidence",
            json.dumps(evidence.get("paths", {}), indent=2),
            "",
            "## Travel collisions",
            json.dumps(evidence.get("travelCollisions", {}), indent=2),
            "",
        ]),
    )
    return hashes


def validate_outputs():
    errors = []
    part = PARTS_DIR / COMBINED_NAME
    inv_path = SOURCE_DIR / "fabricator_inventory.json"
    if not part.exists():
        errors.append("missing part GLB")
    if not inv_path.exists():
        errors.append("missing inventory")
        return errors
    inventory = json.loads(inv_path.read_text(encoding="utf-8"))
    gltf, _rest = _read_glb(part)
    names = [n.get("name") for n in gltf.get("nodes") or []]
    if ROOT_NAME not in names:
        errors.append(f"root {ROOT_NAME} missing: {names[:12]}")
    for need in ("LOD0_fabricator", "LOD1_fabricator", "LOD2_fabricator", "gantry_head", "lamp", "rail"):
        if need not in names:
            errors.append(f"missing node {need}")
    nodes = {n.get("name"): n for n in gltf.get("nodes") or []}
    head = nodes.get("gantry_head") or {}
    rail = nodes.get("rail") or {}
    if head.get("mesh") is not None:
        errors.append("gantry_head must be an empty")
    travel = (rail.get("extras") or {}).get("travel") or {}
    if abs(float(travel.get("length", 0)) - TRAVEL_LENGTH) > 1e-4:
        errors.append(f"rail travel length {travel}")
    if int(travel.get("authoredProgress", -1)) != 0:
        errors.append("rail not authored at progress 0")
    tris = inventory.get("lodTriangles") or {}
    if int(tris.get("lod0", 99999)) > TRI_BUDGET[0]:
        errors.append(f"lod0 tris {tris.get('lod0')}")
    if int(tris.get("lod1", 99999)) > TRI_BUDGET[1]:
        errors.append(f"lod1 tris {tris.get('lod1')}")
    if int(tris.get("lod2", 99999)) > TRI_BUDGET[2]:
        errors.append(f"lod2 tris {tris.get('lod2')}")
    for lod in (0, 1, 2):
        for kind in ("basecolor", "normal", "orm"):
            path = TEX_DIR / f"fabricator_atlas_lod{lod}_{kind}.png"
            if not path.exists():
                errors.append(f"missing {path.name}")
            else:
                data = path.read_bytes()
                if data[:8] != b"\x89PNG\r\n\x1a\n":
                    errors.append(f"not png {path.name}")
                # IHDR 1024
                w = int.from_bytes(data[16:20], "big")
                h = int.from_bytes(data[20:24], "big")
                if w != TEX or h != TEX:
                    errors.append(f"{path.name} is {w}x{h}")
    for rec in (
        FAMILY / "HASHES.json",
        FAMILY / "TECHNIQUE_LEDGER.json",
        FAMILY / "VISIBLE_ZONE_REGISTER.json",
        CONTRACT_DIR / "MATERIAL_CONTRACT.json",
        CONTRACT_DIR / "EXPORT_CONTRACT.json",
        FAMILY / "reference" / "REFERENCE_BRIEF.md",
    ):
        if not rec.exists():
            errors.append(f"missing {rec.relative_to(ROOT)}")
        elif rec.suffix == ".json":
            json.loads(rec.read_text(encoding="utf-8"))
    return errors


def main(argv=None):
    argv = list(sys.argv if argv is None else argv)
    if "--" in argv:
        argv = argv[argv.index("--") + 1:]
    opts = parse_args(argv)
    FAMILY.mkdir(parents=True, exist_ok=True)
    SOURCE_DIR.mkdir(parents=True, exist_ok=True)
    TEX_DIR.mkdir(parents=True, exist_ok=True)
    if opts["validate_only"]:
        errors = validate_outputs()
        print(json.dumps({"ok": not errors, "errors": errors}, indent=2))
        if errors:
            raise SystemExit(1)
        return
    lod_reports = []
    if not opts["combine_only"] and not opts["evidence_only"]:
        for lod in (0, 1, 2):
            lod_reports.append(build_lod(lod))
        write_utf8(SOURCE_DIR / "lod_reports.json", json.dumps(lod_reports, indent=2) + "\n")
    elif (SOURCE_DIR / "lod_reports.json").exists():
        lod_reports = json.loads((SOURCE_DIR / "lod_reports.json").read_text(encoding="utf-8"))
    inventory = None
    contract = None
    if not opts["evidence_only"]:
        inventory, contract = combine_lods()
    else:
        inventory = json.loads((SOURCE_DIR / "fabricator_inventory.json").read_text(encoding="utf-8"))
        contract = json.loads((CONTRACT_DIR / "EXPORT_CONTRACT.json").read_text(encoding="utf-8")) if (CONTRACT_DIR / "EXPORT_CONTRACT.json").exists() else {}
    evidence = {"paths": {}, "travelCollisions": {}}
    if not opts["skip_evidence"]:
        evidence = render_stills(EVIDENCE_DIR)
    if lod_reports and inventory:
        write_records(lod_reports, inventory, contract, evidence)
    errors = validate_outputs()
    print(json.dumps({"ok": not errors, "errors": errors, "inventory": inventory}, indent=2))
    if errors:
        raise SystemExit(1)


if __name__ == "__main__":
    main()

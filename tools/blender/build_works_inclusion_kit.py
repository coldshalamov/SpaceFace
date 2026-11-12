"""PQ-131.10 Works inclusion kit — Cycle 02 production builder.

Geological host/material/site correction. Cycle 01 evidence is immutable and
must not be overwritten. Source kit only: does not wire runtime, release, or
mark the packet complete.

    blender --background --python tools/blender/build_works_inclusion_kit.py
    blender --background --python tools/blender/build_works_inclusion_kit.py -- --skip-render
    blender --background --python tools/blender/build_works_inclusion_kit.py -- --check-only

Master root: SF_WORKS_INCLUSION_KIT_V1
Each variant: local origin, +Z out of the cut face, footprint <= 0.7 cell,
collisionless instancing pivot, LOD0/1/2 roots named LOD{n}_<id>.
Shared original 2048^2 basecolor/normal/ORM atlas. Unique UV0 per bake target.
"""
from __future__ import annotations

import hashlib
import json
import math
import os
import shutil
import struct
import sys
from pathlib import Path

import bpy
import bmesh
import numpy as np
from mathutils import Vector

TOOLS = Path(__file__).resolve().parent
ROOT = TOOLS.parents[1]
if str(TOOLS) not in sys.path:
    sys.path.insert(0, str(TOOLS))
from spaceface_works_camera import (  # noqa: E402
    apply_works_camera, render_works_still, CELL_WU, FOV_V_DEG,
    works_frustum, works_edge_offset, PX_PER_CELL_WORK, EDGE_INSET,
)

FAMILY = ROOT / "assets" / "works" / "inclusion_kit"
SOURCE = FAMILY / "source"
TEX_DIR = SOURCE / "textures"
VAR_DIR = SOURCE / "variants"
EVIDENCE_C1 = FAMILY / "evidence" / "cycle_01"
EVIDENCE = FAMILY / "evidence" / "cycle_02"
PARTS = ROOT / "assets" / "ships" / "parts" / "works"
BLEND_PATH = SOURCE / "inclusion_kit.blend"
MASTER_GLB = SOURCE / "inclusion_kit.glb"
PLACE_GLB = PARTS / "place_works_inclusion_kit.glb"

MASTER_ROOT = "SF_WORKS_INCLUSION_KIT_V1"
ASSET_ID = "place_works_inclusion_kit"
CYCLE = 2
ATLAS = 2048
TILE_COLS, TILE_ROWS = 8, 4
TILE = ATLAS // TILE_COLS
GUTTER = 4
FOOTPRINT = 0.7 * CELL_WU  # 1.54 wu
TRI_BUDGET = {0: 3000, 1: 1400, 2: 700}
TRI_MIN = {0: 900, 1: 180, 2: 50}
HOST_METAL_MAX = 0.08
TEXEL_TARGET = 160.0  # px/wu on visible ore / cavity walls

_GLTF_FLOAT = 5126
_GLTF_NCOMP = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4, "MAT2": 4, "MAT3": 9, "MAT4": 16}
KEEP_PNG = {b"IHDR", b"IDAT", b"IEND", b"PLTE", b"tRNS", b"sRGB", b"gAMA"}

# ---------------------------------------------------------------------------
# Variant register. Structure/material response differs; hue is not the identity.
# ---------------------------------------------------------------------------
VARIANTS = (
    dict(id="SF_INCL_SILVER_WIRE_V1", family="silver", form="wire_dendrite", tile=0,
         host="host_silicate", ore="metal_silver"),
    dict(id="SF_INCL_SILVER_SHEET_V1", family="silver", form="sheet_flake", tile=1,
         host="host_silicate", ore="metal_silver"),
    dict(id="SF_INCL_GOLD_LEAF_V1", family="gold", form="leaf_nest", tile=2,
         host="host_quartz", ore="metal_gold"),
    dict(id="SF_INCL_GOLD_RIBBON_V1", family="gold", form="fracture_ribbon", tile=3,
         host="host_quartz", ore="metal_gold"),
    dict(id="SF_INCL_IRON_CHIP_RIDGE_V1", family="iron", form="chip_ridge", tile=4,
         host="host_mafic", ore="metal_iron"),
    dict(id="SF_INCL_IRON_SPECULAR_V1", family="iron", form="specular_plate", tile=5,
         host="host_mafic", ore="metal_iron_spec"),
    dict(id="SF_INCL_NICKEL_CUBIC_V1", family="nickel", form="cubic_mass", tile=6,
         host="host_ultramafic", ore="metal_nickel"),
    dict(id="SF_INCL_NICKEL_DENDRITE_V1", family="nickel", form="dendrite", tile=7,
         host="host_ultramafic", ore="metal_nickel"),
    dict(id="SF_INCL_EXOTIC_OCTAHEDRAL_CAGE_V1", family="exotic", form="octahedral_cage", tile=8,
         host="host_exotic", ore="crystal_exotic"),
    dict(id="SF_INCL_EXOTIC_PRISMATIC_TRUSS_V1", family="exotic", form="prismatic_truss", tile=9,
         host="host_exotic", ore="crystal_exotic"),
    dict(id="SF_INCL_EXOTIC_HOPPER_CUBE_V1", family="exotic", form="hopper_cube", tile=10,
         host="host_exotic", ore="crystal_exotic"),
    dict(id="SF_INCL_ICE_SHEEN_PLATE_V1", family="ice", form="sheen_plate", tile=11,
         host="host_ice", ore="ice_film"),
    dict(id="SF_INCL_ICE_FRACTURE_VEIN_V1", family="ice", form="fracture_vein", tile=12,
         host="host_ice", ore="ice_film"),
    dict(id="SF_INCL_GAS_FISSURE_RADIAL_V1", family="gas", form="radial_mouth", tile=13,
         host="host_gas", ore="gas_mouth"),
    dict(id="SF_INCL_GAS_FISSURE_BRANCH_V1", family="gas", form="branch_crevice", tile=14,
         host="host_gas", ore="gas_mouth"),
    dict(id="SF_INCL_GAS_FISSURE_SHEAR_V1", family="gas", form="shear_offset", tile=15,
         host="host_gas", ore="gas_mouth"),
    dict(id="SF_INCL_VENTED_SCAR_V1", family="scar", form="vented_split", tile=16,
         host="scar_spent", ore="scar_lip"),
    dict(id="SF_INCL_MK_LOCK_PLATE_V1", family="lock", form="mk_lock_plate", tile=17,
         host="host_lock_rock", ore="lock_steel"),
)

# Role response — billed dielectric hosts, metal only on ore facets.
# Host metallic is clamped to HOST_METAL_MAX at raster time.
ROLES = {
    "host_silicate": dict(rgb=(0.478, 0.412, 0.333), rough=0.84, metal=0.04, cavity=0.0, bump="fracture"),
    "host_quartz": dict(rgb=(0.780, 0.757, 0.698), rough=0.36, metal=0.02, cavity=0.0, bump="quartz"),
    "host_mafic": dict(rgb=(0.435, 0.357, 0.282), rough=0.88, metal=0.06, cavity=0.0, bump="oxide"),
    "host_ultramafic": dict(rgb=(0.392, 0.435, 0.392), rough=0.86, metal=0.05, cavity=0.0, bump="fracture"),
    "host_exotic": dict(rgb=(0.300, 0.245, 0.220), rough=0.88, metal=0.05, cavity=0.0, bump="crust"),
    "host_ice": dict(rgb=(0.620, 0.640, 0.610), rough=0.80, metal=0.02, cavity=0.0, bump="fracture"),
    "host_gas": dict(rgb=(0.235, 0.250, 0.174), rough=0.92, metal=0.02, cavity=0.0, bump="fracture"),
    "host_lock_rock": dict(rgb=(0.365, 0.330, 0.280), rough=0.91, metal=0.05, cavity=0.0, bump="fracture"),
    "metal_silver": dict(rgb=(0.737, 0.776, 0.816), rough=0.20, metal=0.94, cavity=0.0, bump="facet"),
    "metal_gold": dict(rgb=(0.788, 0.600, 0.184), rough=0.28, metal=0.94, cavity=0.0, bump="facet"),
    "metal_iron": dict(rgb=(0.604, 0.435, 0.290), rough=0.42, metal=0.70, cavity=0.0, bump="oxide"),
    "metal_iron_spec": dict(rgb=(0.310, 0.255, 0.235), rough=0.30, metal=0.78, cavity=0.0, bump="facet"),
    "metal_nickel": dict(rgb=(0.388, 0.400, 0.424), rough=0.34, metal=0.80, cavity=0.0, bump="facet"),
    "crystal_exotic": dict(rgb=(0.245, 0.205, 0.300), rough=0.46, metal=0.12, cavity=0.0, bump="facet"),
    "ice_film": dict(rgb=(0.725, 0.839, 0.847), rough=0.12, metal=0.00, cavity=0.0, bump="ice"),
    "gas_mouth": dict(rgb=(0.110, 0.115, 0.078), rough=0.98, metal=0.00, cavity=1.0, bump="none"),
    "gas_lip": dict(rgb=(0.300, 0.335, 0.155), rough=0.92, metal=0.03, cavity=0.0, bump="oxide"),
    "scar_spent": dict(rgb=(0.290, 0.275, 0.247), rough=0.96, metal=0.04, cavity=0.0, bump="fracture"),
    "scar_lip": dict(rgb=(0.340, 0.322, 0.290), rough=0.92, metal=0.05, cavity=0.0, bump="fracture"),
    "scar_depth": dict(rgb=(0.090, 0.080, 0.068), rough=0.98, metal=0.00, cavity=1.0, bump="none"),
    "lock_steel": dict(rgb=(0.427, 0.388, 0.333), rough=0.40, metal=0.76, cavity=0.0, bump="facet"),
    "lock_pane": dict(rgb=(0.231, 0.200, 0.165), rough=0.48, metal=0.62, cavity=0.0, bump="facet"),
    "lock_engrave": dict(rgb=(0.133, 0.110, 0.082), rough=0.52, metal=0.55, cavity=0.0, bump="facet"),
    "lock_gasket": dict(rgb=(0.090, 0.086, 0.078), rough=0.82, metal=0.06, cavity=0.0, bump="none"),
    "lock_latch": dict(rgb=(0.520, 0.500, 0.455), rough=0.32, metal=0.82, cavity=0.0, bump="facet"),
}

HOST_ROLES = {
    "host_silicate", "host_quartz", "host_mafic", "host_ultramafic",
    "host_exotic", "host_ice", "host_gas", "host_lock_rock", "scar_spent", "lock_gasket",
}
CAVITY_ROLES = {"gas_mouth", "scar_depth"}
ORE_ROLES = {
    "metal_silver", "metal_gold", "metal_iron", "metal_iron_spec", "metal_nickel",
    "crystal_exotic", "ice_film", "lock_steel", "lock_pane", "lock_engrave",
    "lock_latch", "scar_lip", "gas_lip",
}

FAMILY_ID_RGB = {
    "silver": (0.55, 0.62, 0.70),
    "gold": (0.78, 0.58, 0.16),
    "iron": (0.62, 0.38, 0.22),
    "nickel": (0.42, 0.45, 0.50),
    "exotic": (0.52, 0.38, 0.78),
    "ice": (0.70, 0.84, 0.86),
    "gas": (0.35, 0.38, 0.18),
    "scar": (0.32, 0.30, 0.27),
    "lock": (0.55, 0.50, 0.42),
}


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1 << 20), b""):
            digest.update(chunk)
    return digest.hexdigest().upper()


def write_json_lf(path: Path, payload) -> None:
    """Deterministic UTF-8 JSON; avoid Windows text-mode CRLF evidence churn."""
    path.write_bytes((json.dumps(payload, indent=2) + "\n").encode("utf-8"))


def h01(i, s=0):
    v = (int(i) * 374761393 + int(s) * 668265263) & 0xFFFFFFFF
    v = (v ^ (v >> 13)) * 1274126177 & 0xFFFFFFFF
    return ((v ^ (v >> 16)) & 255) / 255.0


def parse_args(argv):
    skip_render = False
    check_only = False
    for tok in argv:
        if tok == "--skip-render":
            skip_render = True
        elif tok == "--check-only":
            check_only = True
    return skip_render, check_only


def reset_scene():
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


def tri_count(obj):
    if obj is None or obj.type != "MESH" or not obj.data:
        return 0
    return sum(max(0, len(p.vertices) - 2) for p in obj.data.polygons)


def stamp_pivot(obj):
    obj["spaceface.instancePivot"] = True
    obj["spaceface.collision"] = False
    obj["spaceface"] = {
        "instancePivot": True,
        "collision": False,
        "role": "works_inclusion",
        "up": "+Z",
    }


def tile_uv_rect(index):
    col, row = index % TILE_COLS, index // TILE_COLS
    u0 = (col * TILE + GUTTER) / float(ATLAS)
    v0 = (row * TILE + GUTTER) / float(ATLAS)
    scale = (TILE - 2 * GUTTER) / float(ATLAS)
    return u0, v0, scale


def add_from_pydata(name, verts, faces, collection, role):
    mesh = bpy.data.meshes.new(name + "_Mesh")
    mesh.from_pydata([tuple(v) for v in verts], [], [tuple(f) for f in faces])
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)
    obj["spacefaceRole"] = role
    obj["sf_role"] = role
    for p in mesh.polygons:
        p.use_smooth = False
    return obj


def bm_to_obj(name, bm, collection, role, smooth=False):
    mesh = bpy.data.meshes.new(name + "_Mesh")
    bm.to_mesh(mesh)
    bm.free()
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)
    obj["spacefaceRole"] = role
    obj["sf_role"] = role
    for p in mesh.polygons:
        p.use_smooth = bool(smooth)
    return obj


def box_verts(c, s):
    cx, cy, cz = c
    sx, sy, sz = s
    return [
        (cx - sx, cy - sy, cz - sz), (cx + sx, cy - sy, cz - sz),
        (cx + sx, cy + sy, cz - sz), (cx - sx, cy + sy, cz - sz),
        (cx - sx, cy - sy, cz + sz), (cx + sx, cy - sy, cz + sz),
        (cx + sx, cy + sy, cz + sz), (cx - sx, cy + sy, cz + sz),
    ]


BOX_FACES = (
    (0, 1, 2, 3), (4, 7, 6, 5), (0, 4, 5, 1),
    (1, 5, 6, 2), (2, 6, 7, 3), (3, 7, 4, 0),
)


def add_box(name, center, half, collection, role, rot_z=0.0):
    verts = box_verts(center, half)
    if rot_z:
        cz = math.cos(rot_z)
        sz = math.sin(rot_z)
        cx, cy = center[0], center[1]
        out = []
        for x, y, z in verts:
            dx, dy = x - cx, y - cy
            out.append((cx + dx * cz - dy * sz, cy + dx * sz + dy * cz, z))
        verts = out
    return add_from_pydata(name, verts, BOX_FACES, collection, role)


def add_cyl(name, p0, p1, radius, segs, collection, role):
    a = Vector(p0)
    b = Vector(p1)
    d = b - a
    length = d.length
    if length < 1e-6:
        return None
    axis = d.normalized()
    arb = Vector((0, 0, 1)) if abs(axis.z) < 0.9 else Vector((1, 0, 0))
    x_axis = axis.cross(arb).normalized()
    y_axis = axis.cross(x_axis).normalized()
    verts = []
    for end, origin in ((0, a), (1, b)):
        for i in range(segs):
            ang = (i / segs) * math.pi * 2
            off = x_axis * math.cos(ang) * radius + y_axis * math.sin(ang) * radius
            verts.append(tuple(origin + off))
    faces = []
    for i in range(segs):
        j = (i + 1) % segs
        faces.append((i, j, segs + j, segs + i))
    faces.append(tuple(range(segs - 1, -1, -1)))
    faces.append(tuple(range(segs, 2 * segs)))
    return add_from_pydata(name, verts, faces, collection, role)


def octahedron(center, r, squash=(1, 1, 1)):
    cx, cy, cz = center
    sx, sy, sz = squash
    verts = [
        (cx + r * sx, cy, cz), (cx - r * sx, cy, cz),
        (cx, cy + r * sy, cz), (cx, cy - r * sy, cz),
        (cx, cy, cz + r * sz), (cx, cy, cz - r * sz),
    ]
    faces = [
        (0, 2, 4), (2, 1, 4), (1, 3, 4), (3, 0, 4),
        (2, 0, 5), (1, 2, 5), (3, 1, 5), (0, 3, 5),
    ]
    return verts, faces


def add_oct(name, center, r, collection, role, squash=(1, 1, 1)):
    v, f = octahedron(center, r, squash)
    return add_from_pydata(name, v, f, collection, role)


def is_host_role(role):
    return role in HOST_ROLES or str(role).startswith("host_")


def family_outline(family, form, seed, n, rx, ry):
    """Physically different irregular cut-face silhouette per family/form. Never a circle."""
    pts = []
    for i in range(n):
        a = (i / n) * math.pi * 2.0 + 0.11 * (h01(seed, i) - 0.5)
        # Low-frequency fracture lobes keep dense LOD0 sampling geological.
        # Per-vertex white noise made the first recovery render look saw-cut.
        wave = (0.050 * math.sin(a * 3.0 + seed * 0.17)
                + 0.035 * math.sin(a * 5.0 - seed * 0.11)
                + 0.020 * math.cos(a * 7.0 + seed * 0.07))
        if family in ("silver", "gold"):
            r = 0.92 + wave
            # One broad broken edge, not repeated gear teeth.
            notch = abs(((i / n) - (0.16 if family == "silver" else 0.70) + 0.5) % 1.0 - 0.5)
            if notch < 0.055:
                r *= 0.78 + notch * 2.5
            if form in ("wire_dendrite", "fracture_ribbon", "fracture_vein"):
                sx, sy = 1.22, 0.74
            elif form == "leaf_nest":
                sx, sy = 1.08, 0.92
            else:
                sx, sy = 1.10, 0.90
        elif family == "iron":
            r = 0.90 + wave + 0.035 * math.cos(a * 4.0 + 0.3)
            sx, sy = (1.18, 0.86) if form == "chip_ridge" else (1.08, 0.94)
        elif family == "nickel":
            ca, sa = abs(math.cos(a)), abs(math.sin(a))
            r = 0.78 / max(0.42, max(ca, sa))
            r *= 0.90 + wave * 0.45
            sx, sy = 1.02, 1.00
        elif family == "exotic":
            r = 0.90 + wave
            if form == "hopper_cube":
                ca, sa = abs(math.cos(a + 0.2)), abs(math.sin(a + 0.2))
                r = (0.82 / max(0.45, max(ca, sa))) * (0.95 + wave * 0.3)
            elif form == "prismatic_truss":
                r = 0.89 + 0.055 * math.cos(a * 6.0) + wave * 0.35
            sx, sy = 1.04, 0.96
        elif family == "ice":
            r = 0.92 + wave
            u = i / n
            chip = min(abs(((u - q) + 0.5) % 1.0 - 0.5) for q in (0.12, 0.58, 0.84))
            if chip < 0.035:
                r *= 0.66 + chip * 5.0
            sx, sy = 1.16, 0.88
        elif family == "gas":
            r = 0.91 + wave
            if form == "radial_mouth":
                sx, sy = 1.22, 0.78
            elif form == "branch_crevice":
                sx, sy = 1.06, 1.08
                u = i / n
                if min(abs(u - 0.22), abs(u - 0.72)) < 0.035:
                    r *= 0.74
            else:
                sx, sy = 1.26, 0.70
        elif family == "scar":
            r = 0.91 + wave
            sx, sy = 1.20, 0.76
            if abs((i / n) - 0.24) < 0.065:
                r *= 0.76
        else:
            ca, sa = abs(math.cos(a)), abs(math.sin(a) * 1.35)
            r = (0.86 / max(0.40, max(ca, sa))) * (0.96 + wave * 0.25)
            sx, sy = 1.18, 0.78
        pts.append((math.cos(a) * rx * r * sx, math.sin(a) * ry * r * sy))
    return pts


def cutface_socket(name, collection, role, family, form, seed, lod, rx=0.62, ry=0.54, height=0.12):
    """Irregular cut-face socket with +Z top, side walls, no circular cookie, no underside disc."""
    # Cycle 01's spherical cookie spent most of its LOD0 budget on a generic
    # 1,280-triangle host. Keep that useful surface density, but put it into
    # visible geological strata: dense radial sampling at LOD0, materially
    # cheaper sockets at LOD1/2, and no buried underside cap.
    n = 32 if lod == 0 else (16 if lod == 1 else 8)
    outline = family_outline(family, form, seed, n, rx, ry)
    rings = 17 if lod == 0 else (6 if lod == 1 else 3)
    aperture = family in ("gas", "scar", "lock") or (family == "exotic" and form == "hopper_cube")
    inner_t = 0.0
    if aperture:
        inner_t = {"gas": 0.34, "scar": 0.30, "lock": 0.42}.get(family, 0.36)
    verts = [] if aperture else [(0.0, 0.0, height * 0.34)]
    ring_base = len(verts)
    for r in range(rings):
        t = inner_t + (1.0 - inner_t) * (r / (rings - 1))
        for i, (x, y) in enumerate(outline):
            px, py = x * t, y * t
            strata = math.sin((px * 5.3 + py * 2.1) + seed * 0.31) * height * 0.10
            nibble = (h01(seed, r * 17 + i) - 0.5) * height * 0.08
            edge = (t - inner_t) / max(1e-6, 1.0 - inner_t)
            z = max(0.016, height * (0.36 + 0.64 * edge) + strata + nibble)
            verts.append((px, py, z))
    faces = []
    if not aperture:
        # Shallow geological basin; ore facets sit through rather than on a plate.
        for i in range(n):
            j = (i + 1) % n
            faces.append((0, ring_base + i, ring_base + j))
    for r in range(rings - 1):
        b0 = ring_base + r * n
        b1 = ring_base + (r + 1) * n
        for i in range(n):
            j = (i + 1) % n
            faces.append((b0 + i, b1 + i, b1 + j, b0 + j))
    # side walls down to the cut face (z=0). No bottom cap — the cell is the face.
    outer0 = ring_base + (rings - 1) * n
    wall0 = len(verts)
    for x, y in outline:
        verts.append((x, y, 0.0))
    for i in range(n):
        j = (i + 1) % n
        faces.append((outer0 + i, wall0 + i, wall0 + j, outer0 + j))
    obj = add_from_pydata(name, verts, faces, collection, role)
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    try:
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    except Exception:
        bm.normal_update()
    bm.to_mesh(obj.data)
    bm.free()
    obj.data.update()
    return obj


def make_host(name, collection, role, radius, seed, lod, height=0.12, family="silver", form=""):
    rx = radius
    ry = radius * (0.84 if family in ("silver", "gold", "ice", "gas", "scar", "lock") else 0.92)
    if family == "nickel":
        ry = radius * 0.96
    if family == "iron" and form == "chip_ridge":
        ry = radius * 0.80
    return cutface_socket(name, collection, role, family, form, seed, lod, rx=rx, ry=ry, height=height)


def ridge_along(name, pts, half_w, height, collection, role, end_cap=True):
    if len(pts) < 2:
        return None
    verts = []
    faces = []
    npts = len(pts)

    def normal_at(i):
        if i == 0:
            dx = pts[1][0] - pts[0][0]
            dy = pts[1][1] - pts[0][1]
        elif i == npts - 1:
            dx = pts[-1][0] - pts[-2][0]
            dy = pts[-1][1] - pts[-2][1]
        else:
            dx = pts[i + 1][0] - pts[i - 1][0]
            dy = pts[i + 1][1] - pts[i - 1][1]
        length = math.hypot(dx, dy) or 1.0
        return (-dy / length) * half_w, (dx / length) * half_w

    for i, (x, y) in enumerate(pts):
        nx, ny = normal_at(i)
        zc = height * (0.85 + 0.15 * math.sin(i * 1.2))
        verts.append((x + nx, y + ny, 0.0))
        verts.append((x - nx, y - ny, 0.0))
        verts.append((x, y, zc))
    for i in range(npts - 1):
        a = i * 3
        b = (i + 1) * 3
        faces.append((a, b, b + 2, a + 2))
        faces.append((a + 2, b + 2, b + 1, a + 1))
    if end_cap:
        last = (npts - 1) * 3
        faces.append((0, 2, 1))
        faces.append((last, last + 1, last + 2))
    return add_from_pydata(name, verts, faces, collection, role)


def sheet_poly(name, center, w, h, thick, collection, role, crumple=0.0, rot_z=0.0, seed=0):
    cx, cy, cz = center
    cols = 3 if crumple else 1
    rows = 3 if crumple else 1
    verts = []
    for j in range(rows + 1):
        for i in range(cols + 1):
            u = i / cols if cols else 0.5
            v = j / rows if rows else 0.5
            x = (u - 0.5) * w
            y = (v - 0.5) * h
            z = thick * (0.35 + 0.65 * (1.0 - abs(u - 0.5) * abs(v - 0.5)))
            if crumple:
                z += crumple * math.sin(u * 7.3 + seed) * math.cos(v * 5.1 + seed * 0.4)
                x += crumple * 0.4 * math.sin(v * 6.2 + seed)
                y += crumple * 0.3 * math.cos(u * 5.8 + seed)
            czs = math.cos(rot_z)
            szs = math.sin(rot_z)
            xr = x * czs - y * szs
            yr = x * szs + y * czs
            verts.append((cx + xr, cy + yr, cz + max(0.008, z)))
            verts.append((cx + xr, cy + yr, cz + 0.004))
    faces = []
    stride = (cols + 1) * 2
    for j in range(rows):
        for i in range(cols):
            a = (j * (cols + 1) + i) * 2
            b = a + 2
            c = a + stride
            d = c + 2
            faces.append((a, b, d, c))          # top
            faces.append((a + 1, c + 1, d + 1, b + 1))  # bottom
            if i == 0:
                faces.append((a, c, c + 1, a + 1))
            if i == cols - 1:
                faces.append((b, b + 1, d + 1, d))
            if j == 0:
                faces.append((a, a + 1, b + 1, b))
            if j == rows - 1:
                faces.append((c, d, d + 1, c + 1))
    return add_from_pydata(name, verts, faces, collection, role)


def hex_prism(name, center, radius, height, pyramid, collection, role, segs=6):
    cx, cy, cz = center
    verts = []
    for ring_z, ring_r in ((0.0, radius * 0.92), (height, radius), (height + pyramid, 0.02)):
        if ring_r < 0.03:
            verts.append((cx, cy, cz + ring_z))
            continue
        for i in range(segs):
            a = i / segs * math.pi * 2 + math.pi / segs
            verts.append((cx + math.cos(a) * ring_r, cy + math.sin(a) * ring_r, cz + ring_z))
    faces = []
    # base
    faces.append(tuple(range(segs - 1, -1, -1)))
    for i in range(segs):
        j = (i + 1) % segs
        faces.append((i, j, segs + j, segs + i))
        apex = segs * 2
        faces.append((segs + i, segs + j, apex))
    return add_from_pydata(name, verts, faces, collection, role)


def hopper_cube(name, center, size, steps, collection, role, wall=0.05):
    cx, cy, cz = center
    half = size * 0.5
    verts = []
    faces = []
    # outer shell sitting on the face
    outer = box_verts((cx, cy, cz + half * 0.55), (half, half, half * 0.55))
    verts.extend(outer)
    faces.extend(BOX_FACES)
    # stepped well on +Z
    top_z = cz + half * 1.05
    well_depth = min(size * 0.55, top_z - 0.012)
    for s in range(steps):
        t0 = s / steps
        t1 = (s + 1) / steps
        r0 = half * (0.86 - t0 * 0.72)
        r1 = half * (0.86 - t1 * 0.72)
        z0 = top_z - t0 * well_depth
        z1 = top_z - t1 * well_depth
        ring0 = [
            (cx - r0, cy - r0, z0), (cx + r0, cy - r0, z0),
            (cx + r0, cy + r0, z0), (cx - r0, cy + r0, z0),
        ]
        ring1 = [
            (cx - r1, cy - r1, z1), (cx + r1, cy - r1, z1),
            (cx + r1, cy + r1, z1), (cx - r1, cy + r1, z1),
        ]
        b0 = len(verts)
        verts.extend(ring0)
        verts.extend(ring1)
        for i in range(4):
            j = (i + 1) % 4
            faces.append((b0 + i, b0 + j, b0 + 4 + j, b0 + 4 + i))
        if s == steps - 1:
            faces.append((b0 + 4, b0 + 5, b0 + 6, b0 + 7))
    return add_from_pydata(name, verts, faces, collection, role)


def crevice_groove(name, pts, half_w, depth, collection, lip_role, mouth_role,
                   lip=0.018, surface_z=0.064):
    """V-groove with inner walls (mouth) and raised lips. Dark because it is a hole."""
    if len(pts) < 2:
        return []
    objs = []
    npts = len(pts)

    def nrm(i):
        if i == 0:
            dx, dy = pts[1][0] - pts[0][0], pts[1][1] - pts[0][1]
        elif i == npts - 1:
            dx, dy = pts[-1][0] - pts[-2][0], pts[-1][1] - pts[-2][1]
        else:
            dx, dy = pts[i + 1][0] - pts[i - 1][0], pts[i + 1][1] - pts[i - 1][1]
        length = math.hypot(dx, dy) or 1.0
        return -dy / length, dx / length

    lip_v, mouth_v = [], []
    for i, (x, y) in enumerate(pts):
        nx, ny = nrm(i)
        w = half_w * (0.85 + 0.2 * math.sin(i))
        lip_v.extend([
            (x + nx * (w + lip), y + ny * (w + lip), surface_z + 0.010),
            (x + nx * w, y + ny * w, surface_z),
            (x - nx * w, y - ny * w, surface_z),
            (x - nx * (w + lip), y - ny * (w + lip), surface_z + 0.010),
        ])
        mouth_v.extend([
            (x + nx * w, y + ny * w, surface_z - 0.004),
            (x, y, -depth),
            (x - nx * w, y - ny * w, surface_z - 0.004),
        ])
    lip_f, mouth_f = [], []
    for i in range(npts - 1):
        a, b = i * 4, (i + 1) * 4
        lip_f.append((a, b, b + 1, a + 1))
        lip_f.append((a + 2, b + 2, b + 3, a + 3))
        m, n = i * 3, (i + 1) * 3
        mouth_f.append((m, n, n + 1, m + 1))
        mouth_f.append((m + 1, n + 1, n + 2, m + 2))
    objs.append(add_from_pydata(name + "_lip", lip_v, lip_f, collection, lip_role))
    objs.append(add_from_pydata(name + "_mouth", mouth_v, mouth_f, collection, mouth_role))
    return objs


# ---------------------------------------------------------------------------
# Variant forms
# ---------------------------------------------------------------------------
def form_wire_dendrite(spec, lod, col):
    seed = 11
    host_r = 0.64 if lod == 0 else 0.60
    pieces = [make_host(f"{spec['id']}_host", col, spec["host"], host_r, seed, lod, 0.11,
                        family=spec["family"], form=spec["form"])]
    trunk = [(-0.56, -0.16), (-0.28, -0.06), (0.00, 0.06), (0.30, 0.12), (0.56, 0.24)]
    segs = 8 if lod == 0 else (6 if lod == 1 else 4)
    rad = 0.038 if lod == 0 else 0.044
    for i in range(len(trunk) - 1):
        a, b = trunk[i], trunk[i + 1]
        z0 = 0.055 + 0.012 * i
        pieces.append(add_cyl(f"{spec['id']}_t{i}", (a[0], a[1], z0), (b[0], b[1], z0 + 0.018),
                              rad * (1.0 - i * 0.07), segs, col, spec["ore"]))
    branches = [
        ((-0.28, -0.06), (-0.12, 0.26), (0.02, 0.48)),
        ((0.00, 0.06), (0.22, -0.20), (0.38, -0.42)),
        ((0.30, 0.12), (0.44, 0.34), (0.52, 0.52)),
        ((-0.56, -0.16), (-0.44, -0.36), (-0.34, -0.48)),
    ]
    if lod == 1:
        branches = branches[:3]
    if lod == 2:
        branches = branches[:2]
    for bi, br in enumerate(branches):
        for i in range(len(br) - 1):
            a, b = br[i], br[i + 1]
            pieces.append(add_cyl(f"{spec['id']}_b{bi}_{i}", (a[0], a[1], 0.062), (b[0], b[1], 0.080),
                                  rad * 0.68, max(4, segs - 2), col, spec["ore"]))
    if lod == 0:
        pieces.append(sheet_poly(f"{spec['id']}_fl0", (-0.10, 0.20, 0.048), 0.18, 0.13, 0.010,
                                 col, spec["ore"], crumple=0.010, rot_z=0.5, seed=3))
        pieces.append(sheet_poly(f"{spec['id']}_fl1", (0.20, -0.14, 0.048), 0.16, 0.11, 0.009,
                                 col, spec["ore"], crumple=0.008, rot_z=-0.7, seed=8))
    return pieces


def form_sheet_flake(spec, lod, col):
    pieces = [make_host(f"{spec['id']}_host", col, spec["host"], 0.64, 21, lod, 0.10,
                        family=spec["family"], form=spec["form"])]
    flakes = [
        ((-0.16, 0.10, 0.055), 0.46, 0.34, 0.35),
        ((0.18, -0.12, 0.062), 0.40, 0.30, -0.55),
        ((0.04, 0.26, 0.050), 0.30, 0.24, 1.05),
        ((-0.24, -0.22, 0.052), 0.32, 0.22, 0.18),
        ((0.30, 0.16, 0.058), 0.26, 0.20, -1.15),
        ((-0.02, -0.02, 0.070), 0.28, 0.22, 0.70),
    ]
    if lod == 1:
        flakes = flakes[:4]
    if lod == 2:
        flakes = flakes[:3]
    for i, (c, w, h, rz) in enumerate(flakes):
        pieces.append(sheet_poly(f"{spec['id']}_s{i}", c, w, h, 0.016, col, spec["ore"],
                                 crumple=0.018 if lod == 0 else 0.006, rot_z=rz, seed=30 + i))
    return pieces


def form_leaf_nest(spec, lod, col):
    pieces = [make_host(f"{spec['id']}_host", col, spec["host"], 0.64, 31, lod, 0.10,
                        family=spec["family"], form=spec["form"])]
    sig = [(-0.46, 0.16), (-0.20, 0.22), (0.04, 0.04), (0.22, -0.18), (0.48, -0.22)]
    pieces.append(ridge_along(f"{spec['id']}_qtz", sig, 0.13, 0.12, col, spec["host"]))
    leaves = [
        ((-0.30, 0.06, 0.085), 0.26, 0.18, 0.48),
        ((-0.08, 0.28, 0.085), 0.22, 0.16, -0.38),
        ((0.14, -0.06, 0.085), 0.24, 0.17, 0.95),
        ((0.34, -0.26, 0.085), 0.22, 0.15, 0.22),
        ((0.24, 0.16, 0.082), 0.20, 0.14, -1.05),
        ((-0.18, -0.16, 0.080), 0.20, 0.14, 0.75),
        ((0.02, 0.14, 0.090), 0.18, 0.13, 0.15),
    ]
    if lod >= 1:
        leaves = leaves[:5]
    if lod == 2:
        leaves = leaves[:3]
    for i, (c, w, h, rz) in enumerate(leaves):
        pieces.append(sheet_poly(f"{spec['id']}_l{i}", c, w, h, 0.012, col, spec["ore"],
                                 crumple=0.024 if lod == 0 else 0.010, rot_z=rz, seed=40 + i))
    return pieces


def form_fracture_ribbon(spec, lod, col):
    pieces = [make_host(f"{spec['id']}_host", col, spec["host"], 0.62, 41, lod, 0.10,
                        family=spec["family"], form=spec["form"])]
    ribbon = [(-0.56, -0.22), (-0.30, -0.04), (-0.02, 0.12), (0.26, 0.02), (0.54, 0.22)]
    pieces.append(ridge_along(f"{spec['id']}_rib", ribbon, 0.11, 0.16, col, spec["ore"]))
    if lod < 2:
        pieces.append(sheet_poly(f"{spec['id']}_l0", (-0.24, 0.20, 0.07), 0.14, 0.10, 0.010,
                                 col, spec["ore"], crumple=0.012, rot_z=0.55, seed=5))
        pieces.append(sheet_poly(f"{spec['id']}_l1", (0.28, -0.18, 0.07), 0.13, 0.10, 0.010,
                                 col, spec["ore"], crumple=0.010, rot_z=-0.45, seed=9))
    return pieces


def form_chip_ridge(spec, lod, col):
    pieces = [make_host(f"{spec['id']}_host", col, spec["host"], 0.66, 51, lod, 0.10,
                        family=spec["family"], form=spec["form"])]
    main = [(-0.54, -0.30), (-0.22, -0.08), (0.06, 0.08), (0.34, 0.24), (0.56, 0.40)]
    br = [(0.06, 0.08), (0.22, -0.16), (0.36, -0.40)]
    pieces.append(ridge_along(f"{spec['id']}_main", main, 0.085, 0.15, col, spec["host"]))
    pieces.append(ridge_along(f"{spec['id']}_br", br, 0.065, 0.12, col, spec["host"]))
    chips = [
        ((-0.22, -0.08, 0.14), 0.11, (1.0, 0.82, 0.70)),
        ((0.06, 0.08, 0.15), 0.13, (0.88, 1.0, 0.74)),
        ((0.34, 0.24, 0.14), 0.12, (1.05, 0.78, 0.72)),
        ((0.22, -0.16, 0.13), 0.10, (0.84, 0.92, 0.66)),
        ((-0.42, -0.24, 0.12), 0.09, (1.0, 0.74, 0.80)),
        ((0.48, 0.34, 0.13), 0.10, (0.90, 0.95, 0.70)),
        ((-0.06, 0.02, 0.16), 0.08, (0.92, 0.80, 0.68)),
    ]
    if lod == 1:
        chips = chips[:5]
    if lod == 2:
        chips = chips[:3]
    for i, (c, r, sq) in enumerate(chips):
        pieces.append(add_oct(f"{spec['id']}_c{i}", c, r, col, spec["ore"], sq))
    return pieces


def form_specular_plate(spec, lod, col):
    pieces = [make_host(f"{spec['id']}_host", col, spec["host"], 0.64, 61, lod, 0.09,
                        family=spec["family"], form=spec["form"])]
    plates = [
        ((-0.04, 0.06, 0.055), 0.52, 0.24, 0.18, 0.06),
        ((0.06, -0.12, 0.078), 0.46, 0.20, -0.12, 0.10),
        ((-0.12, 0.22, 0.090), 0.38, 0.18, 0.38, 0.05),
        ((0.18, 0.10, 0.102), 0.32, 0.16, -0.50, 0.11),
        ((-0.18, -0.04, 0.068), 0.30, 0.14, 0.55, 0.07),
    ]
    if lod >= 1:
        plates = plates[:4]
    if lod == 2:
        plates = plates[:3]
    for i, (c, w, h, rz, tilt) in enumerate(plates):
        obj = add_box(f"{spec['id']}_p{i}", c, (w * 0.5, h * 0.5, 0.014), col, spec["ore"], rz)
        obj.rotation_euler[0] = tilt * 0.40
        pieces.append(obj)
    return pieces


def form_cubic_mass(spec, lod, col):
    pieces = [make_host(f"{spec['id']}_host", col, spec["host"], 0.62, 71, lod, 0.10,
                        family=spec["family"], form=spec["form"])]
    cubes = [
        ((-0.10, -0.04, 0.15), 0.15), ((0.14, 0.08, 0.14), 0.13),
        ((0.02, -0.18, 0.12), 0.11), ((-0.22, 0.14, 0.13), 0.12),
        ((0.24, -0.08, 0.12), 0.10), ((-0.02, 0.22, 0.11), 0.10),
        ((0.16, 0.24, 0.10), 0.08), ((-0.16, -0.20, 0.10), 0.08),
        ((0.08, -0.02, 0.22), 0.08), ((-0.08, 0.06, 0.24), 0.07),
        ((-0.28, -0.06, 0.11), 0.08), ((0.30, 0.12, 0.11), 0.08),
    ]
    if lod == 1:
        cubes = cubes[:8]
    if lod == 2:
        cubes = cubes[:5]
    for i, (c, r) in enumerate(cubes):
        pieces.append(add_box(f"{spec['id']}_k{i}", c, (r, r * 0.94, r * 0.90), col, spec["ore"],
                              rot_z=0.18 * i))
    return pieces


def form_dendrite(spec, lod, col):
    pieces = [make_host(f"{spec['id']}_host", col, spec["host"], 0.62, 81, lod, 0.10,
                        family=spec["family"], form=spec["form"])]
    nodes = [
        ((0.0, 0.0, 0.11), 0.09),
        ((0.24, 0.18, 0.12), 0.08), ((-0.22, 0.20, 0.12), 0.08),
        ((0.20, -0.22, 0.11), 0.07), ((-0.26, -0.16, 0.11), 0.07),
        ((0.44, 0.32, 0.11), 0.065), ((-0.42, 0.36, 0.11), 0.065),
        ((0.38, -0.38, 0.10), 0.060), ((-0.40, -0.32, 0.10), 0.055),
    ]
    if lod == 1:
        nodes = nodes[:7]
    if lod == 2:
        nodes = nodes[:5]
    for i, (c, r) in enumerate(nodes):
        pieces.append(add_box(f"{spec['id']}_n{i}", c, (r, r * 0.92, r * 0.88), col, spec["ore"],
                              rot_z=0.28 * i))
    if lod < 2:
        links = [(0, 1), (0, 2), (0, 3), (0, 4), (1, 5), (2, 6), (3, 7), (4, 8)]
        if lod == 1:
            links = links[:6]
        for i, (a, b) in enumerate(links):
            if b >= len(nodes):
                continue
            pa, ra = nodes[a]
            pb, rb = nodes[b]
            pieces.append(add_cyl(f"{spec['id']}_l{i}", pa, pb, min(ra, rb) * 0.38, 6 if lod == 0 else 4,
                                  col, spec["ore"]))
    return pieces


def form_octahedral_cage(spec, lod, col):
    pieces = [make_host(f"{spec['id']}_host", col, spec["host"], 0.56, 91, lod, 0.14,
                        family=spec["family"], form=spec["form"])]
    r = 0.36
    zc = 0.16
    verts = [
        (r, 0.0, zc), (-r, 0.0, zc), (0.0, r, zc), (0.0, -r, zc),
        (0.0, 0.0, zc + r * 0.62), (0.0, 0.0, 0.055),
    ]
    edges = [(0, 2), (2, 1), (1, 3), (3, 0), (0, 4), (2, 4), (1, 4), (3, 4),
             (0, 5), (2, 5), (1, 5), (3, 5)]
    segs = 6 if lod == 0 else 5
    rad = 0.058 if lod == 0 else 0.062
    if lod == 2:
        edges = edges[:8]
        rad = 0.070
    for i, (ia, ib) in enumerate(edges):
        pieces.append(add_cyl(f"{spec['id']}_e{i}", verts[ia], verts[ib], rad, segs, col, spec["ore"]))
    for i, v in enumerate(verts if lod == 0 else verts[:5]):
        pieces.append(add_box(f"{spec['id']}_j{i}", v, (0.055, 0.055, 0.050), col, spec["ore"],
                              rot_z=0.2 * i))
    # four feet seated in the crust
    for i, (x, y) in enumerate(((0.18, 0.18), (-0.18, 0.18), (0.18, -0.18), (-0.18, -0.18))):
        pieces.append(add_cyl(f"{spec['id']}_ft{i}", (x, y, 0.02), (x * 0.55, y * 0.55, 0.12),
                              0.040, segs, col, spec["ore"]))
    return pieces


def hollow_hex_truss(name, center, r_out, r_in, z0, z1, collection, role, segs=6):
    cx, cy, _ = center
    verts = []
    for ring_z in (z0, z1):
        for ring_r in (r_out, r_in):
            for i in range(segs):
                a = i / segs * math.pi * 2 + math.pi / segs
                verts.append((cx + math.cos(a) * ring_r, cy + math.sin(a) * ring_r, ring_z))
    faces = []
    # Each z-level contains an outer and inner ring. Keep the indexing
    # parametric so the same manifold ring works for hex trusses and the
    # 8–12-sided geological gas mouth.
    level_stride = segs * 2
    for zoff in (0, level_stride):
        for i in range(segs):
            j = (i + 1) % segs
            faces.append((zoff + i, zoff + j, zoff + segs + j, zoff + segs + i))
    for i in range(segs):
        j = (i + 1) % segs
        faces.append((i, level_stride + i, level_stride + j, j))
        faces.append((segs + i, segs + j, level_stride + segs + j, level_stride + segs + i))
    return add_from_pydata(name, verts, faces, collection, role)


def form_prismatic_truss(spec, lod, col):
    pieces = [make_host(f"{spec['id']}_host", col, spec["host"], 0.54, 101, lod, 0.12,
                        family=spec["family"], form=spec["form"])]
    segs = 6
    pieces.append(hollow_hex_truss(f"{spec['id']}_hex", (0, 0, 0), 0.30, 0.20, 0.05, 0.28,
                                   col, spec["ore"], segs))
    if lod < 2:
        step = 2 if lod == 1 else 1
        for i in range(0, segs, step):
            a = i / segs * math.pi * 2 + math.pi / segs
            p0 = (math.cos(a) * 0.20, math.sin(a) * 0.20, 0.08)
            p1 = (math.cos(a) * 0.20, math.sin(a) * 0.20, 0.26)
            pieces.append(add_cyl(f"{spec['id']}_up{i}", p0, p1, 0.018, 5, col, spec["ore"]))
            p2 = (math.cos(a + math.pi) * 0.20, math.sin(a + math.pi) * 0.20, 0.17)
            pieces.append(add_cyl(f"{spec['id']}_bar{i}", (math.cos(a) * 0.18, math.sin(a) * 0.18, 0.17),
                                  p2, 0.016, 5, col, spec["ore"]))
    # Annular mineral collar seats the truss without plugging its hollow core.
    pieces.append(hollow_hex_truss(f"{spec['id']}_seat", (0, 0, 0), 0.34, 0.235, 0.012, 0.052,
                                   col, spec["host"], segs))
    return pieces


def skeletal_hopper(name, center, size, steps, collection, role, wall=0.055):
    """Dark stepped skeletal well — walls only, open centre, seated in crust."""
    cx, cy, cz = center
    half = size * 0.5
    verts = []
    faces = []
    top_z = cz + 0.08
    well_depth = size * 0.70
    for s in range(steps):
        t0 = s / steps
        t1 = (s + 1) / steps
        r0 = half * (0.92 - t0 * 0.62)
        r1 = half * (0.92 - t1 * 0.62)
        z0 = top_z - t0 * well_depth
        z1 = top_z - t1 * well_depth
        w0, w1 = wall * (1.0 - t0 * 0.25), wall * (1.0 - t1 * 0.25)
        outer0 = [(cx - r0, cy - r0, z0), (cx + r0, cy - r0, z0),
                  (cx + r0, cy + r0, z0), (cx - r0, cy + r0, z0)]
        inner0 = [(cx - (r0 - w0), cy - (r0 - w0), z0), (cx + (r0 - w0), cy - (r0 - w0), z0),
                  (cx + (r0 - w0), cy + (r0 - w0), z0), (cx - (r0 - w0), cy + (r0 - w0), z0)]
        outer1 = [(cx - r1, cy - r1, z1), (cx + r1, cy - r1, z1),
                  (cx + r1, cy + r1, z1), (cx - r1, cy + r1, z1)]
        inner1 = [(cx - (r1 - w1), cy - (r1 - w1), z1), (cx + (r1 - w1), cy - (r1 - w1), z1),
                  (cx + (r1 - w1), cy + (r1 - w1), z1), (cx - (r1 - w1), cy + (r1 - w1), z1)]
        b = len(verts)
        verts.extend(outer0 + inner0 + outer1 + inner1)
        for i in range(4):
            j = (i + 1) % 4
            faces.append((b + i, b + j, b + 8 + j, b + 8 + i))
            faces.append((b + 4 + i, b + 12 + i, b + 12 + j, b + 4 + j))
            faces.append((b + i, b + 4 + i, b + 4 + j, b + j))
        if s == steps - 1:
            faces.append((b + 12, b + 13, b + 14, b + 15))
    return add_from_pydata(name, verts, faces, collection, role)


def form_hopper(spec, lod, col):
    pieces = [make_host(f"{spec['id']}_host", col, spec["host"], 0.58, 111, lod, 0.12,
                        family=spec["family"], form=spec["form"])]
    steps = 5 if lod == 0 else (4 if lod == 1 else 3)
    pieces.append(skeletal_hopper(f"{spec['id']}_hop", (0, 0, 0.02), 0.70, steps, col, spec["ore"]))
    # Four-piece crust collar: real contact around an open stepped well.
    for suffix, center, half in (
        ("n", (0.0, 0.36, 0.045), (0.40, 0.055, 0.025)),
        ("s", (0.0, -0.36, 0.045), (0.40, 0.055, 0.025)),
        ("e", (0.36, 0.0, 0.045), (0.055, 0.305, 0.025)),
        ("w", (-0.36, 0.0, 0.045), (0.055, 0.305, 0.025)),
    ):
        pieces.append(add_box(f"{spec['id']}_collar_{suffix}", center, half, col, spec["host"]))
    return pieces


def ice_chip_outline(radius, n, seed, skip):
    pts = []
    for i in range(n):
        a = i / n * math.pi * 2
        rr = radius * (0.78 + 0.22 * h01(seed, i))
        if i in skip:
            rr *= 0.62
        pts.append((math.cos(a) * rr, math.sin(a) * rr))
    return pts


def solid_from_outline(name, outline, z0, z1, collection, role, chips=()):
    """Solid plate from an XY outline, with optional chip notches as actual thickness steps."""
    verts = []
    n = len(outline)
    for x, y in outline:
        verts.append((x, y, z1))
    for x, y in outline:
        verts.append((x, y, z0))
    faces = [tuple(range(n))]
    faces.append(tuple(range(2 * n - 1, n - 1, -1)))
    for i in range(n):
        j = (i + 1) % n
        faces.append((i, j, n + j, n + i))
    obj = add_from_pydata(name, verts, faces, collection, role)
    return obj


def form_sheen_plate(spec, lod, col):
    pieces = [make_host(f"{spec['id']}_host", col, spec["host"], 0.66, 121, lod, 0.08,
                        family=spec["family"], form=spec["form"])]
    n = 11 if lod == 0 else (9 if lod == 1 else 7)
    skip = {2, 6, 7} if lod == 0 else {2, 6}
    outline = ice_chip_outline(0.52, n, 5, skip)
    pieces.append(solid_from_outline(f"{spec['id']}_ice", outline, 0.022, 0.072, col, spec["ore"]))
    if lod < 2:
        pieces.append(add_box(f"{spec['id']}_fr0", (0.02, 0.04, 0.050), (0.34, 0.007, 0.014),
                              col, spec["host"], rot_z=0.32))
        pieces.append(add_box(f"{spec['id']}_fr1", (-0.06, -0.08, 0.050), (0.26, 0.006, 0.012),
                              col, spec["host"], rot_z=-0.50))
        pieces.append(add_box(f"{spec['id']}_fr2", (0.10, -0.14, 0.048), (0.16, 0.005, 0.010),
                              col, spec["host"], rot_z=0.90))
    if lod == 0:
        chip_outline = ice_chip_outline(0.14, 6, 9, {1})
        chip_outline = [(x + 0.34, y - 0.20) for x, y in chip_outline]
        pieces.append(solid_from_outline(f"{spec['id']}_chip", chip_outline, 0.018, 0.040, col, spec["ore"]))
    return pieces


def form_fracture_vein(spec, lod, col):
    pieces = [make_host(f"{spec['id']}_host", col, spec["host"], 0.64, 131, lod, 0.08,
                        family=spec["family"], form=spec["form"])]
    vein = [(-0.56, -0.14), (-0.24, -0.02), (0.06, 0.10), (0.32, 0.02), (0.56, 0.16)]
    pieces.append(ridge_along(f"{spec['id']}_ice", vein, 0.12, 0.085, col, spec["ore"]))
    if lod < 2:
        for i, p in enumerate(((-0.20, 0.00, 0.05), (0.08, 0.08, 0.05), (0.34, 0.04, 0.05))):
            pieces.append(add_cyl(f"{spec['id']}_bub{i}", (p[0], p[1], 0.085), (p[0], p[1], 0.012),
                                  0.040, 6, col, spec["host"]))
    return pieces


def cavity_well(name, rx, ry, depth, segs, collection, role, lip_z=0.012):
    """Deep elliptical well with inner walls and a small dark floor — not a painted disc."""
    verts = []
    for i in range(segs):
        a = i / segs * math.pi * 2
        verts.append((math.cos(a) * rx, math.sin(a) * ry, lip_z))
    for i in range(segs):
        a = i / segs * math.pi * 2
        verts.append((math.cos(a) * rx * 0.55, math.sin(a) * ry * 0.55, -depth * 0.55))
    for i in range(segs):
        a = i / segs * math.pi * 2
        verts.append((math.cos(a) * rx * 0.18, math.sin(a) * ry * 0.18, -depth))
    verts.append((0.0, 0.0, -depth - 0.01))
    faces = []
    for ring in (0, 1):
        b = ring * segs
        for i in range(segs):
            j = (i + 1) % segs
            faces.append((b + i, b + j, b + segs + j, b + segs + i))
    apex = segs * 3
    floor = segs * 2
    for i in range(segs):
        j = (i + 1) % segs
        faces.append((floor + i, floor + j, apex))
    return add_from_pydata(name, verts, faces, collection, role)


def form_radial_mouth(spec, lod, col):
    pieces = [make_host(f"{spec['id']}_host", col, spec["host"], 0.66, 141, lod, 0.08,
                        family=spec["family"], form=spec["form"])]
    segs = 12 if lod == 0 else (10 if lod == 1 else 8)
    pieces.append(cavity_well(f"{spec['id']}_mouth", 0.28, 0.20, 0.22, segs, col, spec["ore"],
                              lip_z=0.064))
    pieces.append(hollow_hex_truss(f"{spec['id']}_lip", (0, 0, 0), 0.31, 0.245, 0.052, 0.074,
                                   col, "gas_lip", segs))
    ncr = 8 if lod == 0 else (6 if lod == 1 else 4)
    for i in range(ncr):
        a0 = i / ncr * math.pi * 2 + 0.12
        pts = [(math.cos(a0) * 0.26, math.sin(a0) * 0.18)]
        a = a0
        rr = 0.32
        for k in range(3 if lod == 0 else 2):
            a += (h01(i, k) - 0.5) * 0.35
            rr += 0.11
            pts.append((math.cos(a) * min(0.64, rr), math.sin(a) * min(0.52, rr * 0.82)))
        pieces.extend(crevice_groove(f"{spec['id']}_c{i}", pts, 0.022, 0.07, col, "gas_lip", spec["ore"]))
    return pieces


def form_branch_crevice(spec, lod, col):
    pieces = [make_host(f"{spec['id']}_host", col, spec["host"], 0.64, 151, lod, 0.08,
                        family=spec["family"], form=spec["form"])]
    main = [(-0.54, -0.10), (-0.20, 0.00), (0.10, 0.08), (0.40, 0.26)]
    br = [(0.10, 0.08), (0.22, -0.18), (0.38, -0.40)]
    pieces.extend(crevice_groove(f"{spec['id']}_m", main, 0.055, 0.18, col, "gas_lip", spec["ore"]))
    pieces.extend(crevice_groove(f"{spec['id']}_b", br, 0.040, 0.14, col, "gas_lip", spec["ore"]))
    segs = 10 if lod == 0 else 8
    pieces.append(cavity_well(f"{spec['id']}_mh0", 0.10, 0.08, 0.16, segs, col, spec["ore"],
                              lip_z=0.064))
    # offset the second mouth by building at origin then translating
    well = cavity_well(f"{spec['id']}_mh1", 0.09, 0.07, 0.14, segs, col, spec["ore"],
                       lip_z=0.064)
    for v in well.data.vertices:
        v.co.x += 0.18
        v.co.y -= 0.16
    well.data.update()
    pieces.append(well)
    return pieces


def form_shear_offset(spec, lod, col):
    pieces = [make_host(f"{spec['id']}_host", col, spec["host"], 0.64, 161, lod, 0.08,
                        family=spec["family"], form=spec["form"])]
    a = [(-0.54, 0.14), (-0.12, 0.18), (0.22, 0.22)]
    b = [(-0.22, -0.20), (0.18, -0.14), (0.56, -0.08)]
    pieces.extend(crevice_groove(f"{spec['id']}_a", a, 0.048, 0.14, col, "gas_lip", spec["ore"]))
    pieces.extend(crevice_groove(f"{spec['id']}_b", b, 0.048, 0.14, col, "gas_lip", spec["ore"]))
    slot = [(-0.10, 0.16), (0.08, -0.02), (0.20, -0.16)]
    pieces.extend(crevice_groove(f"{spec['id']}_s", slot, 0.034, 0.20, col, "gas_lip", spec["ore"]))
    return pieces


def form_vented_split(spec, lod, col):
    pieces = [make_host(f"{spec['id']}_host", col, spec["host"], 0.64, 171, lod, 0.09,
                        family=spec["family"], form=spec["form"])]
    # Broken displaced strata — asymmetric ridges, never rectangular slabs.
    north = [(-0.48, 0.13), (-0.24, 0.25), (0.02, 0.19), (0.27, 0.29), (0.48, 0.15)]
    south = [(-0.44, -0.14), (-0.22, -0.27), (0.03, -0.19), (0.24, -0.30), (0.43, -0.16)]
    pieces.append(ridge_along(f"{spec['id']}_lipN", north, 0.105, 0.12, col, spec["ore"]))
    pieces.append(ridge_along(f"{spec['id']}_lipS", south, 0.090, 0.085, col, spec["ore"]))
    # dark depth and asymmetric vent path
    pieces.append(cavity_well(f"{spec['id']}_depth", 0.22, 0.10, 0.18, 8 if lod == 0 else 6,
                              col, "scar_depth", lip_z=0.060))
    vent = [(-0.08, 0.08), (0.16, -0.02), (0.40, -0.18)]
    pieces.extend(crevice_groove(f"{spec['id']}_vent", vent, 0.030, 0.12, col,
                                 spec["ore"], "scar_depth", surface_z=0.060))
    # attached broken lip fragments — not floating shards
    if lod == 0:
        pieces.append(add_box(f"{spec['id']}_chip0", (0.36, 0.30, 0.06), (0.08, 0.05, 0.018),
                              col, spec["ore"], rot_z=0.6))
        pieces.append(add_box(f"{spec['id']}_chip1", (-0.38, -0.28, 0.04), (0.07, 0.04, 0.014),
                              col, spec["ore"], rot_z=-0.4))
    return pieces


def hex_head(name, center, size, collection, role):
    cx, cy, cz = center
    verts = []
    for i in range(6):
        a = i / 6 * math.pi * 2 + math.pi / 6
        verts.append((cx + math.cos(a) * size, cy + math.sin(a) * size, cz + size * 0.35))
    for i in range(6):
        a = i / 6 * math.pi * 2 + math.pi / 6
        verts.append((cx + math.cos(a) * size, cy + math.sin(a) * size, cz))
    faces = [tuple(range(6)), tuple(range(11, 5, -1))]
    for i in range(6):
        j = (i + 1) % 6
        faces.append((i, j, 6 + j, 6 + i))
    return add_from_pydata(name, verts, faces, collection, role)


def mk2_strokes():
    """Shallow groove boxes for MK2 on the recessed pane, local pane space."""
    # letters occupy x in [-0.22, 0.22], y in [-0.07, 0.07]
    s = []
    # M
    s += [(-0.20, 0.00, 0.018, 0.07), (-0.14, 0.00, 0.018, 0.07),
          (-0.17, 0.03, 0.04, 0.016)]
    # K
    s += [(-0.05, 0.00, 0.016, 0.07), (0.00, 0.035, 0.040, 0.014),
          (0.00, -0.035, 0.040, 0.014)]
    # 2
    s += [(0.14, 0.055, 0.055, 0.014), (0.18, 0.02, 0.016, 0.03),
          (0.14, 0.00, 0.055, 0.014), (0.10, -0.035, 0.016, 0.03),
          (0.14, -0.06, 0.055, 0.014)]
    return s


def form_lock_plate(spec, lod, col):
    pieces = [make_host(f"{spec['id']}_rock", col, spec["host"], 0.64, 181, lod, 0.10,
                        family=spec["family"], form=spec["form"])]
    # recessed rectangular socket in the cut face
    pieces.append(add_box(f"{spec['id']}_well", (0, 0, 0.018), (0.60, 0.40, 0.022),
                          col, spec["host"]))
    # gasket seated in the well
    pieces.append(add_box(f"{spec['id']}_gasket", (0, 0, 0.028), (0.58, 0.38, 0.010),
                          col, "lock_gasket"))
    # plate sits in the gasketed socket, not on a cookie
    pieces.append(add_box(f"{spec['id']}_plate", (0, 0, 0.046), (0.52, 0.33, 0.016),
                          col, "lock_steel"))
    pieces.append(add_box(f"{spec['id']}_pane", (0, 0, 0.062), (0.26, 0.15, 0.008),
                          col, "lock_pane"))
    anchors = [(-0.38, 0.22), (0.38, 0.22), (-0.38, -0.22), (0.38, -0.22)]
    for i, (x, y) in enumerate(anchors):
        pieces.append(add_cyl(f"{spec['id']}_wash{i}", (x, y, 0.056), (x, y, 0.068),
                              0.052, 8 if lod == 0 else 6, col, "lock_steel"))
        pieces.append(hex_head(f"{spec['id']}_hex{i}", (x, y, 0.068), 0.036, col, "lock_latch"))
    if lod < 2:
        for i, y in enumerate((-0.14, 0.0, 0.14) if lod == 0 else (-0.12, 0.12)):
            pieces.append(add_cyl(f"{spec['id']}_hk{i}", (-0.56, y, 0.046), (-0.44, y, 0.046),
                                  0.026, 8 if lod == 0 else 6, col, "lock_latch"))
        pieces.append(add_cyl(f"{spec['id']}_pin", (-0.50, -0.20, 0.046), (-0.50, 0.20, 0.046),
                              0.012, 6, col, "lock_steel"))
    pieces.append(add_box(f"{spec['id']}_latch", (0.56, 0.0, 0.054), (0.08, 0.042, 0.014),
                          col, "lock_latch"))
    pieces.append(add_box(f"{spec['id']}_keeper", (0.48, 0.0, 0.062), (0.04, 0.055, 0.010),
                          col, "lock_steel"))
    if lod == 0:
        for i, (x, y, sx, sy) in enumerate(mk2_strokes()):
            pieces.append(add_box(f"{spec['id']}_mk{i}", (x, y, 0.072), (sx, sy, 0.007),
                                  col, "lock_engrave"))
    elif lod == 1:
        pieces.append(add_box(f"{spec['id']}_mk", (0.0, 0.0, 0.072), (0.18, 0.055, 0.006),
                              col, "lock_engrave"))
    return pieces


BUILDERS = {
    "wire_dendrite": form_wire_dendrite,
    "sheet_flake": form_sheet_flake,
    "leaf_nest": form_leaf_nest,
    "fracture_ribbon": form_fracture_ribbon,
    "chip_ridge": form_chip_ridge,
    "specular_plate": form_specular_plate,
    "cubic_mass": form_cubic_mass,
    "dendrite": form_dendrite,
    "octahedral_cage": form_octahedral_cage,
    "prismatic_truss": form_prismatic_truss,
    "hopper_cube": form_hopper,
    "sheen_plate": form_sheen_plate,
    "fracture_vein": form_fracture_vein,
    "radial_mouth": form_radial_mouth,
    "branch_crevice": form_branch_crevice,
    "shear_offset": form_shear_offset,
    "vented_split": form_vented_split,
    "mk_lock_plate": form_lock_plate,
}


def apply_transforms(obj):
    mw = obj.matrix_world.copy()
    obj.data.transform(mw)
    obj.matrix_world.identity()
    obj.data.update()


def footprint_ok(obj):
    xs, ys = [], []
    for v in obj.data.vertices:
        xs.append(v.co.x)
        ys.append(v.co.y)
    span = max(max(xs) - min(xs), max(ys) - min(ys)) if xs else 0
    return span, span <= FOOTPRINT + 0.02


def piece_span(obj):
    xs = [v.co.x for v in obj.data.vertices]
    ys = [v.co.y for v in obj.data.vertices]
    zs = [v.co.z for v in obj.data.vertices]
    return max(max(xs) - min(xs), max(ys) - min(ys), max(zs) - min(zs), 0.04)


def assign_island_uv(obj, su, sv, suw, svh):
    mesh = obj.data
    if not mesh.uv_layers:
        mesh.uv_layers.new(name="UVMap")
    uv = mesh.uv_layers.active
    xs = [v.co.x for v in mesh.vertices]
    ys = [v.co.y for v in mesh.vertices]
    zs = [v.co.z for v in mesh.vertices]
    xmin, xmax = min(xs), max(xs)
    ymin, ymax = min(ys), max(ys)
    zmin, zmax = min(zs), max(zs)
    sx = max(1e-5, xmax - xmin)
    sy = max(1e-5, ymax - ymin)
    sz = max(1e-5, zmax - zmin)
    for li, loop in enumerate(mesh.loops):
        v = mesh.vertices[loop.vertex_index]
        u = (v.co.x - xmin) / sx
        vv = (v.co.y - ymin) / sy
        if sy < 0.05 and sz > sy:
            vv = (v.co.z - zmin) / sz
        elif sz > sy * 1.4 and abs(v.normal.z) < 0.45:
            vv = (v.co.z - zmin) / sz
        uv.data[li].uv = (su + u * suw, sv + vv * svh)


def assign_unique_uv(obj, tile_index, piece_i, piece_n):
    """Back-compat single-piece mapper. Prefer pack_variant_uvs."""
    u0, v0, scale = tile_uv_rect(tile_index)
    role = obj.get("sf_role") or ""
    if is_host_role(role):
        su, sv, suw, svh = u0 + scale * 0.03, v0 + scale * 0.03, scale * 0.36, scale * 0.94
    else:
        rest = max(1, piece_n - 1)
        cols = 2 if rest > 1 else 1
        rows = int(math.ceil(rest / cols))
        idx = max(0, piece_i - 1) if is_host_role(role) is False else piece_i
        c = idx % cols
        r = idx // cols
        du = (scale * 0.58) / cols
        dv = scale / rows
        su = u0 + scale * 0.40 + c * du + du * 0.04
        sv = v0 + r * dv + dv * 0.04
        suw = du * 0.90
        svh = dv * 0.90
    assign_island_uv(obj, su, sv, suw, svh)


def pack_variant_uvs(pieces, tile_index):
    """Host strip + large ore/cavity islands targeting ~160 px/wu on visible walls."""
    u0, v0, scale = tile_uv_rect(tile_index)
    hosts = [p for p in pieces if p is not None and is_host_role(p.get("sf_role") or "")]
    ores = [p for p in pieces if p is not None and p not in hosts]
    # host: left 34% of the tile
    if hosts:
        for i, obj in enumerate(hosts):
            rows = max(1, len(hosts))
            dv = scale * 0.94 / rows
            su = u0 + scale * 0.02
            sv = v0 + scale * 0.03 + i * dv
            assign_island_uv(obj, su, sv + dv * 0.04, scale * 0.32, dv * 0.90)
    # ore / cavity: remaining 62% split by span so walls keep texel density
    if ores:
        weights = [piece_span(o) for o in ores]
        total = sum(weights) or 1.0
        ore_u0 = u0 + scale * 0.36
        ore_w = scale * 0.62
        # pack as rows of 1–2 islands, taller pieces get more height
        n = len(ores)
        cols = 2 if n > 2 else 1
        rows = int(math.ceil(n / cols))
        for i, obj in enumerate(ores):
            c = i % cols
            r = i // cols
            du = ore_w / cols
            dv = scale / rows
            # bias island size by span, keep a usable minimum
            frac = max(0.55, min(1.0, weights[i] / (total / n)))
            su = ore_u0 + c * du + du * 0.04
            sv = v0 + r * dv + dv * 0.04
            assign_island_uv(obj, su, sv, du * 0.90 * frac, dv * 0.90)


def vertex_ao_curv(obj):
    """AO only at ore/host contacts and true cavity interiors. Exposed facets stay 1.0."""
    mesh = obj.data
    role = obj.get("sf_role") or obj.get("spacefaceRole") or ""
    n = len(mesh.vertices)
    ao = np.ones(n, dtype=np.float32)
    curv = np.zeros(n, dtype=np.float32)
    mesh.calc_loop_triangles()
    try:
        mesh.calc_normals_split()
    except Exception:
        mesh.update()
    adj = [[] for _ in range(n)]
    for tri in mesh.loop_triangles:
        idx = list(tri.vertices)
        for a in range(3):
            adj[idx[a]].append(idx[(a + 1) % 3])
            adj[idx[a]].append(idx[(a + 2) % 3])
    normals = np.zeros((n, 3), dtype=np.float32)
    hostish = is_host_role(role)
    cavity = role in CAVITY_ROLES or role == "gas_mouth"
    for i, v in enumerate(mesh.vertices):
        normals[i] = v.normal
        z = v.co.z
        occ = 0.0
        k = 0
        for j in adj[i]:
            d = Vector(mesh.vertices[j].co) - v.co
            if d.length < 1e-8:
                continue
            dn = d.normalized()
            occ += max(0.0, -v.normal.dot(dn))
            curv[i] += 1.0 - max(-1.0, min(1.0, v.normal.dot(mesh.vertices[j].normal)))
            k += 1
        if k:
            occ /= k
            curv[i] /= k
        ao[i] = 1.0
        if cavity or z < -0.02:
            depth = min(1.0, max(0.0, (-z) / 0.22))
            ao[i] = 0.22 + 0.28 * (1.0 - depth)
        elif hostish:
            if occ > 0.62:
                ao[i] = 1.0 - 0.28 * min(1.0, (occ - 0.62) / 0.38)
        else:
            if z < 0.028:
                ao[i] = 0.58 + 0.42 * max(0.0, z / 0.028)
            elif occ > 0.58:
                ao[i] = 1.0 - 0.30 * min(1.0, (occ - 0.58) / 0.42)
        ao[i] = float(max(0.18, min(1.0, ao[i])))
    return ao, curv, normals


def rasterize_object(obj, albedo, orm, nrm):
    mesh = obj.data
    role = obj.get("sf_role") or obj.get("spacefaceRole") or "host_silicate"
    spec = ROLES.get(role, ROLES["host_silicate"])
    base = np.array(spec["rgb"], dtype=np.float32)
    rough0 = spec["rough"]
    metal0 = spec["metal"]
    if not mesh.uv_layers:
        return
    uv_layer = mesh.uv_layers.active
    ao, curv, _vn = vertex_ao_curv(obj)
    mesh.calc_loop_triangles()
    size = albedo.shape[0]
    for tri in mesh.loop_triangles:
        loops = list(tri.loops)
        uvs = [Vector(uv_layer.data[li].uv) for li in loops]
        ids = list(tri.vertices)
        p = [Vector(mesh.vertices[i].co) for i in ids]
        n = [Vector(mesh.vertices[i].normal) for i in ids]
        px = np.array([[uvs[k].x * size, uvs[k].y * size] for k in range(3)], dtype=np.float32)
        xmin = int(max(0, np.floor(px[:, 0].min())))
        xmax = int(min(size - 1, np.ceil(px[:, 0].max())))
        ymin = int(max(0, np.floor(px[:, 1].min())))
        ymax = int(min(size - 1, np.ceil(px[:, 1].max())))
        if xmax <= xmin or ymax <= ymin:
            continue
        e1 = p[1] - p[0]
        e2 = p[2] - p[0]
        duv1 = uvs[1] - uvs[0]
        duv2 = uvs[2] - uvs[0]
        det = duv1.x * duv2.y - duv2.x * duv1.y
        if abs(det) < 1e-10:
            T = Vector((1, 0, 0))
            B = Vector((0, 1, 0))
        else:
            f = 1.0 / det
            T = (e1 * duv2.y - e2 * duv1.y) * f
            B = (-e1 * duv2.x + e2 * duv1.x) * f
            if T.length > 1e-8:
                T.normalize()
            if B.length > 1e-8:
                B.normalize()
        xs = np.arange(xmin, xmax + 1, dtype=np.float32) + 0.5
        ys = np.arange(ymin, ymax + 1, dtype=np.float32) + 0.5
        if xs.size == 0 or ys.size == 0:
            continue
        xx, yy = np.meshgrid(xs, ys)
        v0x, v0y = px[0]
        v1x, v1y = px[1] - px[0]
        v2x, v2y = px[2] - px[0]
        den = v1x * v2y - v2x * v1y
        if abs(den) < 1e-8:
            continue
        w1 = (xx - v0x) * v2y - (yy - v0y) * v2x
        w2 = (yy - v0y) * v1x - (xx - v0x) * v1y
        w1 /= den
        w2 /= den
        w0 = 1.0 - w1 - w2
        mask = (w0 >= -1e-4) & (w1 >= -1e-4) & (w2 >= -1e-4)
        if not np.any(mask):
            continue
        ww0, ww1, ww2 = w0[mask], w1[mask], w2[mask]
        aov = ww0 * ao[ids[0]] + ww1 * ao[ids[1]] + ww2 * ao[ids[2]]
        cv = ww0 * curv[ids[0]] + ww1 * curv[ids[1]] + ww2 * curv[ids[2]]
        nx = ww0 * n[0].x + ww1 * n[1].x + ww2 * n[2].x
        ny = ww0 * n[0].y + ww1 * n[1].y + ww2 * n[2].y
        nz = ww0 * n[0].z + ww1 * n[1].z + ww2 * n[2].z
        # tangent-space encode (OpenGL)
        nts_x = nx * T.x + ny * T.y + nz * T.z
        nts_y = nx * B.x + ny * B.y + nz * B.z
        nts_z = nx * T.cross(B).x + ny * T.cross(B).y + nz * T.cross(B).z
        # fallback if TBN collapsed
        length = np.sqrt(nts_x * nts_x + nts_y * nts_y + nts_z * nts_z)
        length = np.maximum(length, 1e-6)
        nts_x, nts_y, nts_z = nts_x / length, nts_y / length, nts_z / length
        iy = yy[mask].astype(np.int32)
        ix = xx[mask].astype(np.int32)
        exposed = np.clip(aov, 0.16, 1.0)
        col = base * (0.55 + 0.45 * exposed)
        # exposed facets stay cleaner / less rough; cavities darker
        rough = np.clip(rough0 + cv * 0.18 - (exposed - 0.6) * 0.12, 0.04, 0.98)
        metal = np.clip(metal0 * (0.75 + 0.25 * exposed) - cv * 0.08, 0.0, 1.0)
        albedo[iy, ix, 0] = col[:, 0] if col.ndim > 1 else col[0]
        albedo[iy, ix, 1] = col[:, 1] if col.ndim > 1 else col[1]
        albedo[iy, ix, 2] = col[:, 2] if col.ndim > 1 else col[2]
        albedo[iy, ix, 3] = 1.0
        orm[iy, ix, 0] = exposed
        orm[iy, ix, 1] = rough
        orm[iy, ix, 2] = metal
        orm[iy, ix, 3] = 1.0
        nrm[iy, ix, 0] = nts_x * 0.5 + 0.5
        nrm[iy, ix, 1] = nts_y * 0.5 + 0.5
        nrm[iy, ix, 2] = nts_z * 0.5 + 0.5
        nrm[iy, ix, 3] = 1.0
    # col assignment above is awkward if col is (N,3)
    # rewrite pixels properly
    return


def _bump_field(wx, wy, wz, kind):
    """Surface-scale fracture / oxide / ice normals. Not family-ID flat color."""
    if kind in (None, "none", "facet"):
        return np.zeros_like(wx), np.zeros_like(wy)
    if kind == "fracture":
        bx = 0.22 * np.sin(wx * 18.0 + wy * 3.4) * np.cos(wy * 14.0)
        by = 0.18 * np.cos(wx * 11.0 - wy * 16.0)
        seam = np.exp(-((wx * 0.9 + wy * 0.2) * 6.0 - np.round((wx * 0.9 + wy * 0.2) * 6.0)) ** 2 * 40.0)
        bx += 0.16 * seam
    elif kind == "quartz":
        bx = 0.12 * np.sin(wx * 22.0) * np.cos(wy * 19.0)
        by = 0.12 * np.cos(wx * 17.0 + wy * 21.0)
    elif kind == "oxide":
        bx = 0.20 * np.sin(wx * 9.5 + wy * 7.0) + 0.10 * np.sin(wx * 28.0)
        by = 0.16 * np.cos(wy * 10.0 - wx * 6.0)
    elif kind == "crust":
        bx = 0.18 * np.sin(wx * 13.0 + wy * 15.0)
        by = 0.18 * np.cos(wx * 16.0 - wy * 12.0)
    elif kind == "ice":
        crack = np.exp(-((wy * 5.5) - np.round(wy * 5.5)) ** 2 * 80.0)
        crack2 = np.exp(-((wx * 4.2 + wy * 1.1) - np.round(wx * 4.2 + wy * 1.1)) ** 2 * 70.0)
        bx = 0.28 * crack - 0.14 * crack2
        by = 0.22 * crack2 + 0.10 * np.sin(wx * 30.0 + wz * 8.0)
    else:
        bx = 0.10 * np.sin(wx * 12.0)
        by = 0.10 * np.cos(wy * 12.0)
    return bx.astype(np.float32), by.astype(np.float32)


def rasterize_object_fixed(obj, albedo, orm, nrm):
    mesh = obj.data
    role = obj.get("sf_role") or obj.get("spacefaceRole") or "host_silicate"
    spec = ROLES.get(role, ROLES["host_silicate"])
    base = np.array(spec["rgb"], dtype=np.float32)
    host_rgb = np.array(ROLES["host_ice"]["rgb"] if role == "ice_film" else ROLES.get("host_silicate")["rgb"],
                        dtype=np.float32)
    if role == "ice_film":
        host_rgb = np.array(ROLES["host_ice"]["rgb"], dtype=np.float32)
    rough0 = spec["rough"]
    metal0 = spec["metal"]
    hostish = is_host_role(role)
    if hostish:
        metal0 = min(HOST_METAL_MAX, metal0)
    bump_kind = spec.get("bump", "none")
    if not mesh.uv_layers:
        return
    uv_layer = mesh.uv_layers.active
    ao, curv, _vn = vertex_ao_curv(obj)
    mesh.calc_loop_triangles()
    size = albedo.shape[0]
    for tri in mesh.loop_triangles:
        loops = list(tri.loops)
        uvs = [Vector(uv_layer.data[li].uv) for li in loops]
        ids = list(tri.vertices)
        p = [Vector(mesh.vertices[i].co) for i in ids]
        nrm_v = [Vector(mesh.vertices[i].normal) for i in ids]
        px = np.array([[uvs[k].x * size, uvs[k].y * size] for k in range(3)], dtype=np.float32)
        xmin = int(max(0, np.floor(px[:, 0].min())))
        xmax = int(min(size - 1, np.ceil(px[:, 0].max())))
        ymin = int(max(0, np.floor(px[:, 1].min())))
        ymax = int(min(size - 1, np.ceil(px[:, 1].max())))
        if xmax <= xmin or ymax <= ymin:
            continue
        e1 = p[1] - p[0]
        e2 = p[2] - p[0]
        duv1 = uvs[1] - uvs[0]
        duv2 = uvs[2] - uvs[0]
        det = duv1.x * duv2.y - duv2.x * duv1.y
        if abs(det) < 1e-10:
            T = Vector((1, 0, 0))
            B = Vector((0, 1, 0))
        else:
            f = 1.0 / det
            T = (e1 * duv2.y - e2 * duv1.y) * f
            B = (-e1 * duv2.x + e2 * duv1.x) * f
            if T.length > 1e-8:
                T.normalize()
            if B.length > 1e-8:
                B.normalize()
        N = T.cross(B)
        if N.length > 1e-8:
            N.normalize()
        xs = np.arange(xmin, xmax + 1, dtype=np.float32) + 0.5
        ys = np.arange(ymin, ymax + 1, dtype=np.float32) + 0.5
        xx, yy = np.meshgrid(xs, ys)
        v0x, v0y = px[0]
        v1x, v1y = px[1] - px[0]
        v2x, v2y = px[2] - px[0]
        den = v1x * v2y - v2x * v1y
        if abs(den) < 1e-8:
            continue
        w1 = ((xx - v0x) * v2y - (yy - v0y) * v2x) / den
        w2 = ((yy - v0y) * v1x - (xx - v0x) * v1y) / den
        w0 = 1.0 - w1 - w2
        mask = (w0 >= -1e-4) & (w1 >= -1e-4) & (w2 >= -1e-4)
        if not np.any(mask):
            continue
        ww0, ww1, ww2 = w0[mask], w1[mask], w2[mask]
        aov = ww0 * ao[ids[0]] + ww1 * ao[ids[1]] + ww2 * ao[ids[2]]
        cv = ww0 * curv[ids[0]] + ww1 * curv[ids[1]] + ww2 * curv[ids[2]]
        wx = ww0 * p[0].x + ww1 * p[1].x + ww2 * p[2].x
        wy = ww0 * p[0].y + ww1 * p[1].y + ww2 * p[2].y
        wz = ww0 * p[0].z + ww1 * p[1].z + ww2 * p[2].z
        nx = ww0 * nrm_v[0].x + ww1 * nrm_v[1].x + ww2 * nrm_v[2].x
        ny = ww0 * nrm_v[0].y + ww1 * nrm_v[1].y + ww2 * nrm_v[2].y
        nz = ww0 * nrm_v[0].z + ww1 * nrm_v[1].z + ww2 * nrm_v[2].z
        # The mesh already carries its geometric normal. Baking that normal a
        # second time into tangent space made broad ice/exotic faces shade black
        # when planar-projected side islands shared an atlas sub-rect. The map
        # carries only authored micro-relief; geometry supplies macro form.
        nts_x = np.zeros_like(nx)
        nts_y = np.zeros_like(ny)
        nts_z = np.ones_like(nz)
        bx, by = _bump_field(wx, wy, wz, bump_kind)
        nts_x = nts_x + bx
        nts_y = nts_y + by
        length = np.sqrt(nts_x * nts_x + nts_y * nts_y + nts_z * nts_z)
        length = np.maximum(length, 1e-6)
        nts_x, nts_y, nts_z = nts_x / length, nts_y / length, nts_z / length
        iy = yy[mask].astype(np.int32)
        ix = xx[mask].astype(np.int32)
        exposed = np.clip(aov, 0.18, 1.0)
        if role == "ice_film":
            thick = np.clip((wz - 0.018) / 0.055, 0.15, 1.0)
            sheen = np.array((0.902, 0.961, 0.965), dtype=np.float32)
            col = host_rgb[None, :] * (1.0 - thick[:, None]) + base[None, :] * thick[:, None]
            col = col * (0.82 + 0.18 * thick[:, None]) + sheen[None, :] * (0.10 * thick[:, None])
            metal = np.zeros_like(exposed)
            rough = np.clip(rough0 + (1.0 - thick) * 0.12 + cv * 0.08, 0.06, 0.55)
        elif hostish:
            grain = 0.04 * np.sin(wx * 9.0 + wy * 7.0)
            col = base[None, :] * (0.96 + grain[:, None])
            metal = np.full_like(exposed, metal0)
            rough = np.clip(rough0 + cv * 0.10, 0.30, 0.98)
        else:
            col = base[None, :] * (0.92 + 0.08 * exposed[:, None])
            metal = np.clip(metal0, 0.0, 1.0)
            rough = np.clip(rough0 + cv * 0.14 - (exposed - 0.7) * 0.08, 0.04, 0.98)
        albedo[iy, ix, :3] = col
        albedo[iy, ix, 3] = 1.0
        orm[iy, ix, 0] = exposed
        orm[iy, ix, 1] = rough
        orm[iy, ix, 2] = metal
        orm[iy, ix, 3] = 1.0
        nrm[iy, ix, 0] = nts_x * 0.5 + 0.5
        nrm[iy, ix, 1] = nts_y * 0.5 + 0.5
        nrm[iy, ix, 2] = np.clip(nts_z * 0.5 + 0.5, 0, 1)
        nrm[iy, ix, 3] = 1.0


def write_pixels(name, pixels, size, colorspace="sRGB"):
    if name in bpy.data.images:
        bpy.data.images.remove(bpy.data.images[name])
    img = bpy.data.images.new(name, width=size, height=size, alpha=True)
    img.colorspace_settings.name = colorspace
    flat = np.ascontiguousarray(pixels, dtype=np.float32).ravel()
    img.pixels.foreach_set(flat)
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
            import time
            time.sleep(0.2 * (attempt + 1))
    if last_err:
        raise last_err
    if tmp_path.exists():
        if path.exists():
            path.unlink()
        tmp_path.replace(path)
    img.filepath_raw = str(path)
    img.reload()
    sanitize_png(path)
    return img, path


def principled(material):
    material.use_nodes = True
    material.node_tree.nodes.clear()
    output = material.node_tree.nodes.new("ShaderNodeOutputMaterial")
    bsdf = material.node_tree.nodes.new("ShaderNodeBsdfPrincipled")
    material.node_tree.links.new(bsdf.outputs["BSDF"], output.inputs["Surface"])
    return bsdf


def wire_atlas(material, maps):
    bsdf = principled(material)
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
    nmap.inputs["Strength"].default_value = 1.0
    links.new(tex_n.outputs["Color"], nmap.inputs["Color"])
    links.new(nmap.outputs["Normal"], bsdf.inputs["Normal"])
    if "Emission Strength" in bsdf.inputs:
        bsdf.inputs["Emission Strength"].default_value = 0.0
    if hasattr(material, "blend_method"):
        try:
            material.blend_method = "OPAQUE"
        except TypeError:
            pass
    return bsdf


def join_pieces(pieces, name, collection):
    live = [p for p in pieces if p is not None and p.name in bpy.data.objects]
    if not live:
        raise RuntimeError(f"no pieces for {name}")
    if bpy.context.mode != "OBJECT":
        bpy.ops.object.mode_set(mode="OBJECT")
    if len(live) == 1:
        live[0].name = name
        if live[0].data:
            live[0].data.name = name
        return live[0]
    bpy.ops.object.select_all(action="DESELECT")
    for obj in live:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = live[0]
    bpy.ops.object.join()
    joined = bpy.context.view_layer.objects.active
    joined.name = name
    if joined.data:
        joined.data.name = name
        bm = bmesh.new()
        bm.from_mesh(joined.data)
        bmesh.ops.triangulate(bm, faces=bm.faces[:], quad_method="FIXED", ngon_method="EAR_CLIP")
        bm.to_mesh(joined.data)
        bm.free()
        joined.data.update()
    return joined


def variant_grid(index):
    col = index % 6
    row = index // 6
    return ((col - 2.5) * CELL_WU, (1.0 - row) * CELL_WU, 0.0)


def export_selection(path: Path, objects):
    path.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.object.select_all(action="DESELECT")
    for obj in objects:
        try:
            obj.hide_set(False)
            obj.hide_viewport = False
            obj.hide_render = False
            obj.select_set(True)
            if obj.type == "MESH":
                quantize_mesh(obj)
        except Exception:
            pass
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
            shutil.move(str(tmp), str(path))
            break
        except OSError:
            if attempt == 5:
                raise
            import time
            time.sleep(0.3 * (attempt + 1))
    sanitize_glb_floats(path)
    return path


def setup_works_world():
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
            scene.eevee.taa_render_samples = 24
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
        bg.inputs["Strength"].default_value = 0.20
    if hasattr(world, "mist_settings"):
        try:
            world.mist_settings.use_mist = False
        except Exception:
            pass
    # lights
    for name in list(bpy.data.lights):
        bpy.data.lights.remove(name)
    key = bpy.data.lights.new("Key", "SUN")
    key.energy = 5.4
    key.color = (1.0, 0.863, 0.737)
    key_obj = bpy.data.objects.new("Key", key)
    bpy.context.scene.collection.objects.link(key_obj)
    key_obj.rotation_euler = (math.radians(58), 0.0, math.radians(-38))
    fill = bpy.data.lights.new("Fill", "SUN")
    fill.energy = 0.85
    fill.color = (0.847, 0.765, 0.659)
    fill_obj = bpy.data.objects.new("Fill", fill)
    bpy.context.scene.collection.objects.link(fill_obj)
    fill_obj.rotation_euler = (math.radians(70), 0.0, math.radians(140))
    rim = bpy.data.lights.new("Rim", "SUN")
    rim.energy = 1.1
    rim.color = (0.616, 0.722, 0.941)
    rim_obj = bpy.data.objects.new("Rim", rim)
    bpy.context.scene.collection.objects.link(rim_obj)
    rim_obj.rotation_euler = (math.radians(25), 0.0, math.radians(200))
    cam = bpy.data.cameras.new("WorksCam")
    cam_obj = bpy.data.objects.new("WorksCam", cam)
    bpy.context.scene.collection.objects.link(cam_obj)
    bpy.context.scene.camera = cam_obj
    return cam_obj


def make_pad():
    bpy.ops.mesh.primitive_plane_add(size=14.0, location=(0, 0, -0.004))
    pad = bpy.context.object
    pad.name = "MinePad"
    mat = bpy.data.materials.new("MinePadMat")
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    if bsdf:
        bsdf.inputs["Base Color"].default_value = (0.070, 0.055, 0.042, 1)
        bsdf.inputs["Roughness"].default_value = 0.92
        bsdf.inputs["Metallic"].default_value = 0.04
        if "Emission Strength" in bsdf.inputs:
            bsdf.inputs["Emission Strength"].default_value = 0.0
    pad.data.materials.append(mat)
    return pad


def set_lod_visibility(roots, lod_keep):
    for empty, meshes in roots:
        for obj in meshes:
            keep = obj.get("spacefaceLod") == f"lod{lod_keep}"
            obj.hide_render = not keep
            obj.hide_viewport = not keep
            obj.hide_set(not keep)


def override_material(objs, material):
    backup = []
    for obj in objs:
        if obj.type != "MESH":
            continue
        backup.append((obj, list(obj.data.materials)))
        obj.data.materials.clear()
        obj.data.materials.append(material)
    return backup


def restore_material(backup):
    for obj, mats in backup:
        obj.data.materials.clear()
        for m in mats:
            if m:
                obj.data.materials.append(m)


def make_clay_mat():
    mat = bpy.data.materials.new("Clay")
    bsdf = principled(mat)
    bsdf.inputs["Base Color"].default_value = (0.51, 0.50, 0.48, 1)
    bsdf.inputs["Roughness"].default_value = 0.72
    bsdf.inputs["Metallic"].default_value = 0.0
    if "Emission Strength" in bsdf.inputs:
        bsdf.inputs["Emission Strength"].default_value = 0.0
    return mat


def make_id_mat():
    mat = bpy.data.materials.new("FamilyID")
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    nodes.clear()
    out = nodes.new("ShaderNodeOutputMaterial")
    em = nodes.new("ShaderNodeEmission")
    attr = nodes.new("ShaderNodeAttribute")
    attr.attribute_name = "sf_family_color"
    links.new(attr.outputs["Color"], em.inputs["Color"])
    em.inputs["Strength"].default_value = 1.0
    links.new(em.outputs["Emission"], out.inputs["Surface"])
    return mat


def store_family_color(obj, family):
    rgb = FAMILY_ID_RGB.get(family, (0.5, 0.5, 0.5))
    mesh = obj.data
    attr = mesh.attributes.get("sf_family_color") or mesh.attributes.new(
        "sf_family_color", "FLOAT_COLOR", "POINT"
    )
    for i in range(len(mesh.vertices)):
        attr.data[i].color = (*rgb, 1.0)


def isolation_mat(maps, mode):
    mat = bpy.data.materials.new(f"Iso_{mode}")
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    nodes.clear()
    out = nodes.new("ShaderNodeOutputMaterial")
    em = nodes.new("ShaderNodeEmission")
    uv = nodes.new("ShaderNodeUVMap")
    tex = nodes.new("ShaderNodeTexImage")
    tex.image = maps[1] if mode == "orm" else maps[2]
    links.new(uv.outputs["UV"], tex.inputs["Vector"])
    links.new(tex.outputs["Color"], em.inputs["Color"])
    em.inputs["Strength"].default_value = 1.0
    links.new(em.outputs["Emission"], out.inputs["Surface"])
    return mat


def render_named(cam, path, framing, focus, targets, edge_dir=(1.0, 0.0)):
    EVIDENCE.mkdir(parents=True, exist_ok=True)
    render_works_still(cam, path, framing=framing, focus=focus, target=targets, edge_dir=edge_dir)
    sanitize_png(Path(path))
    return Path(path)


def build_kit():
    reset_scene()
    SOURCE.mkdir(parents=True, exist_ok=True)
    TEX_DIR.mkdir(parents=True, exist_ok=True)
    VAR_DIR.mkdir(parents=True, exist_ok=True)
    EVIDENCE.mkdir(parents=True, exist_ok=True)
    PARTS.mkdir(parents=True, exist_ok=True)

    kit = bpy.data.collections.new("InclusionKit")
    bpy.context.scene.collection.children.link(kit)
    master = bpy.data.objects.new(MASTER_ROOT, None)
    kit.objects.link(master)
    master.empty_display_type = "PLAIN_AXES"
    master.empty_display_size = 0.2
    stamp_pivot(master)

    albedo = np.zeros((ATLAS, ATLAS, 4), dtype=np.float32)
    orm = np.zeros((ATLAS, ATLAS, 4), dtype=np.float32)
    nrm = np.zeros((ATLAS, ATLAS, 4), dtype=np.float32)
    nrm[..., 0] = 0.5
    nrm[..., 1] = 0.5
    nrm[..., 2] = 1.0
    nrm[..., 3] = 1.0
    orm[..., 0] = 1.0
    orm[..., 1] = 0.8
    orm[..., 3] = 1.0
    albedo[..., :3] = (0.478, 0.412, 0.333)
    albedo[..., 3] = 1.0

    records = []
    variant_roots = []  # (empty, [lod meshes])
    lod0_pieces_for_bake = []

    for vi, spec in enumerate(VARIANTS):
        empty = bpy.data.objects.new(spec["id"], None)
        kit.objects.link(empty)
        empty.empty_display_type = "PLAIN_AXES"
        empty.empty_display_size = 0.08
        empty.location = variant_grid(vi)
        empty.parent = master
        stamp_pivot(empty)
        empty["sf_family"] = spec["family"]
        empty["sf_form"] = spec["form"]
        lod_meshes = []
        for lod in (0, 1, 2):
            pieces = BUILDERS[spec["form"]](spec, lod, kit)
            live = []
            authored = [p for p in pieces if p is not None]
            for obj in authored:
                apply_transforms(obj)
                obj.parent = empty
                obj.location = (0, 0, 0)
                live.append(obj)
            pack_variant_uvs(live, spec["tile"])
            if lod == 0:
                for obj in live:
                    rasterize_object_fixed(obj, albedo, orm, nrm)
                    lod0_pieces_for_bake.append(obj.name)
            joined = join_pieces(live, f"LOD{lod}_{spec['id']}", kit)
            joined.parent = empty
            joined.location = (0, 0, 0)
            joined["spacefaceLod"] = f"lod{lod}"
            joined["spaceface"] = {"lod": f"lod{lod}", "variant": spec["id"], "family": spec["family"]}
            joined["sf_family"] = spec["family"]
            store_family_color(joined, spec["family"])
            span, ok = footprint_ok(joined)
            if not ok and span > 1e-6:
                scale = FOOTPRINT / span
                for vert in joined.data.vertices:
                    vert.co.x *= scale
                    vert.co.y *= scale
                joined.data.update()
                span, ok = footprint_ok(joined)
            if not ok:
                raise RuntimeError(f"{joined.name} footprint {span:.3f} wu exceeds {FOOTPRINT:.3f}")
            tris = tri_count(joined)
            if tris > TRI_BUDGET[lod]:
                raise RuntimeError(f"{joined.name} {tris} tris over budget {TRI_BUDGET[lod]}")
            if tris < TRI_MIN[lod] and lod == 0:
                raise RuntimeError(f"{joined.name} {tris} tris under LOD0 floor {TRI_MIN[lod]}")
            lod_meshes.append(joined)
        variant_roots.append((empty, lod_meshes))
        records.append({
            "id": spec["id"],
            "family": spec["family"],
            "form": spec["form"],
            "tile": spec["tile"],
            "origin": list(empty.location),
            "lodTriangles": {f"lod{i}": tri_count(lod_meshes[i]) for i in range(3)},
            "footprintWu": footprint_ok(lod_meshes[0])[0],
            "drawsLod0": 1,
        })
        print(json.dumps({
            "variant": spec["id"],
            "lod0": records[-1]["lodTriangles"]["lod0"],
            "lod1": records[-1]["lodTriangles"]["lod1"],
            "lod2": records[-1]["lodTriangles"]["lod2"],
            "span": round(records[-1]["footprintWu"], 4),
        }))

    print(f"atlas rasterized from {len(lod0_pieces_for_bake)} LOD0 pieces")
    np.clip(albedo, 0.0, 1.0, out=albedo)
    np.clip(orm, 0.0, 1.0, out=orm)

    img_a, path_a = write_pixels("inclusion_kit_atlas_basecolor", albedo, ATLAS, "sRGB")
    img_o, path_o = write_pixels("inclusion_kit_atlas_orm", orm, ATLAS, "Non-Color")
    img_n, path_n = write_pixels("inclusion_kit_atlas_normal", nrm, ATLAS, "Non-Color")
    atlas_mat = bpy.data.materials.new("Material_InclusionAtlas")
    wire_atlas(atlas_mat, (img_a, img_o, img_n))
    atlas_mat["spacefaceRole"] = "atlas"

    for empty, meshes in variant_roots:
        for obj in meshes:
            obj.data.materials.clear()
            obj.data.materials.append(atlas_mat)

    # contract extras
    lod_tri_sum = {0: 0, 1: 0, 2: 0}
    for rec in records:
        for i in range(3):
            lod_tri_sum[i] += rec["lodTriangles"][f"lod{i}"]
    contract = {
        "contractVersion": 1,
        "assetId": ASSET_ID,
        "partId": ASSET_ID,
        "liveId": ASSET_ID,
        "slot": "place",
        "category": "works",
        "family": "asteroid_works_inclusions",
        "packet": "PQ-131.10",
        "cycle": CYCLE,
        "role": "authored geological/process inclusion kit",
        "forward": "+X",
        "up": "+Y",
        "blenderUp": "+Z",
        "starboard": "+Z",
        "unit": "metre",
        "normalConvention": "OpenGL",
        "ormChannels": "R=AO,G=Roughness,B=Metallic",
        "textureCompression": "PNG-source",
        "textureAuthorship": "mesh-derived shared 2048 atlas",
        "textureSize": ATLAS,
        "deliverableRole": "source_kit_unwired",
        "lods": ["lod0", "lod1", "lod2"],
        "masterRoot": MASTER_ROOT,
        "variants": [v["id"] for v in VARIANTS],
        "triangleCount": int(lod_tri_sum[0]),
        "lodTriangles": {f"lod{i}": int(lod_tri_sum[i]) for i in range(3)},
        "wiringStatus": "source_only_not_wired",
        "collision": False,
    }
    master["spacefaceAsset"] = contract
    bpy.context.scene["spacefaceAsset"] = contract

    # save blend
    bpy.ops.wm.save_as_mainfile(filepath=str(BLEND_PATH))

    # export master
    exportables = [master]
    stack = [master]
    while stack:
        node = stack.pop()
        for child in node.children:
            exportables.append(child)
            stack.append(child)
    export_selection(MASTER_GLB, exportables)
    shutil.copy2(MASTER_GLB, PLACE_GLB)

    # per-variant GLBs at local origin
    saved_locs = []
    for empty, meshes in variant_roots:
        saved_locs.append(empty.location.copy())
        empty.location = (0.0, 0.0, 0.0)
        bpy.context.view_layer.update()
        objs = [empty] + list(meshes)
        export_selection(VAR_DIR / f"{empty.name}.glb", objs)
        empty.location = saved_locs[-1]
    bpy.context.view_layer.update()

    inventory = {
        "assetId": ASSET_ID,
        "masterRoot": MASTER_ROOT,
        "cycle": CYCLE,
        "combined": str(MASTER_GLB.relative_to(ROOT)).replace("\\", "/"),
        "partsSource": str(PLACE_GLB.relative_to(ROOT)).replace("\\", "/"),
        "blend": str(BLEND_PATH.relative_to(ROOT)).replace("\\", "/"),
        "atlas": {
            "basecolor": str(path_a.relative_to(ROOT)).replace("\\", "/"),
            "orm": str(path_o.relative_to(ROOT)).replace("\\", "/"),
            "normal": str(path_n.relative_to(ROOT)).replace("\\", "/"),
        },
        "variants": records,
        "lodTriangles": {f"lod{i}": int(lod_tri_sum[i]) for i in range(3)},
    }
    return {
        "inventory": inventory,
        "variant_roots": variant_roots,
        "master": master,
        "maps": (img_a, img_o, img_n),
        "atlas_mat": atlas_mat,
        "paths": (path_a, path_o, path_n),
    }


def kit_bbox_xy(variant_roots):
    xs, ys = [], []
    margin = FOOTPRINT * 0.52
    for empty, _ in variant_roots:
        xs.append(empty.location.x)
        ys.append(empty.location.y)
    return min(xs) - margin, max(xs) + margin, min(ys) - margin, max(ys) + margin


def edge_grid_preoffset(variant_roots):
    """Reposition the review grid so the legal works_edge camera keeps all 18 in frame.

    Does not change object size or the 120 px/cell camera. The shared camera still
    applies its object_offset; we slide the kit first so the combined result fits.
    """
    xmin, xmax, ymin, ymax = kit_bbox_xy(variant_roots)
    extent_x, extent_y = works_frustum(PX_PER_CELL_WORK)
    ox, oy, _ = works_edge_offset((1.0, 0.0), PX_PER_CELL_WORK)
    bbox_cx = 0.5 * (xmin + xmax)
    bbox_cy = 0.5 * (ymin + ymax)
    bbox_hx = 0.5 * (xmax - xmin)
    bbox_hy = 0.5 * (ymax - ymin)
    pad = 0.20
    desired_cx = extent_x * 0.5 * EDGE_INSET - bbox_hx - pad
    desired_cy = 0.0
    # After render_works_still adds (ox, oy), we want bbox centre at (desired_cx, desired_cy).
    extra_x = desired_cx - ox - bbox_cx
    extra_y = desired_cy - oy - bbox_cy
    # Keep vertical span inside the frustum too.
    if bbox_hy + abs(extra_y + oy) > extent_y * 0.46:
        extra_y = -oy - bbox_cy
    return extra_x, extra_y


def render_evidence(built):
    cam = setup_works_world()
    pad = make_pad()
    variant_roots = built["variant_roots"]
    maps = built["maps"]
    all_meshes = [m for _, ms in variant_roots for m in ms]
    # Offset empties + pad together. Child meshes inherit; listing meshes too would double-shift.
    targets = [empty for empty, _ in variant_roots] + [pad]

    # kit sheets: LOD0 for top/edge, LOD1 for site
    set_lod_visibility(variant_roots, 0)
    render_named(cam, EVIDENCE / "works_top_kit.png", "works_top", (0, 0, 0.08), targets)
    extra_x, extra_y = edge_grid_preoffset(variant_roots)
    saved = [(e, e.location.copy()) for e, _ in variant_roots]
    pad_saved = pad.location.copy()
    for empty, _ in variant_roots:
        empty.location.x += extra_x
        empty.location.y += extra_y
    pad.location.x += extra_x
    pad.location.y += extra_y
    bpy.context.view_layer.update()
    render_named(cam, EVIDENCE / "works_edge_kit.png", "works_edge", (0, 0, 0.08), targets, (1, 0))
    for empty, loc in saved:
        empty.location = loc
    pad.location = pad_saved
    bpy.context.view_layer.update()
    set_lod_visibility(variant_roots, 1)
    render_named(cam, EVIDENCE / "works_site_kit.png", "works_site", (0, 0, 0.08), targets)

    # family sheets at actual registers
    families = []
    for spec in VARIANTS:
        if spec["family"] not in families:
            families.append(spec["family"])
    for fam in families:
        fam_roots = [(e, ms) for e, ms in variant_roots if e.get("sf_family") == fam]
        saved = [e.location.copy() for e, _ in fam_roots]
        nfam = len(fam_roots)
        for i, (e, _) in enumerate(fam_roots):
            e.location = ((i - (nfam - 1) * 0.5) * CELL_WU, 0.0, 0.0)
        bpy.context.view_layer.update()
        fam_targets = [e for e, _ in fam_roots] + [pad]
        set_lod_visibility(variant_roots, 0)
        for e, ms in variant_roots:
            hide = e.get("sf_family") != fam
            e.hide_render = hide
            for m in ms:
                if hide:
                    m.hide_render = True
        render_named(cam, EVIDENCE / f"family_{fam}_works_top.png", "works_top", (0.0, 0.0, 0.08), fam_targets)
        set_lod_visibility(fam_roots, 1)
        render_named(cam, EVIDENCE / f"family_{fam}_works_site.png", "works_site", (0.0, 0.0, 0.08), fam_targets)
        for (e, _), loc in zip(fam_roots, saved):
            e.location = loc
        bpy.context.view_layer.update()
        for e, ms in variant_roots:
            e.hide_render = False

    set_lod_visibility(variant_roots, 0)
    for e, ms in variant_roots:
        e.hide_render = False
        for m in ms:
            m.hide_set(False)
            m.hide_render = m.get("spacefaceLod") != "lod0"
            m.hide_viewport = m.hide_render

    clay = make_clay_mat()
    backup = override_material(all_meshes, clay)
    render_named(cam, EVIDENCE / "diag_clay_works_top.png", "works_top", (0, 0, 0.08), targets)
    restore_material(backup)

    # grazing: rotate key almost horizontal
    key = bpy.data.objects.get("Key")
    if key:
        old = key.rotation_euler.copy()
        key.rotation_euler = (math.radians(82), 0, math.radians(-20))
    render_named(cam, EVIDENCE / "diag_grazing_works_top.png", "works_top", (0, 0, 0.08), targets)
    if key:
        key.rotation_euler = old

    iso_n = isolation_mat(maps, "normal")
    backup = override_material(all_meshes, iso_n)
    render_named(cam, EVIDENCE / "diag_normal_works_top.png", "works_top", (0, 0, 0.08), targets)
    restore_material(backup)

    iso_o = isolation_mat(maps, "orm")
    backup = override_material(all_meshes, iso_o)
    render_named(cam, EVIDENCE / "diag_orm_works_top.png", "works_top", (0, 0, 0.08), targets)
    restore_material(backup)

    idmat = make_id_mat()
    backup = override_material(all_meshes, idmat)
    render_named(cam, EVIDENCE / "diag_material_id_works_top.png", "works_top", (0, 0, 0.08), targets)
    restore_material(backup)

    render_named(cam, EVIDENCE / "diag_identity_works_top.png", "works_top", (0, 0, 0.08), targets)

    # no-emission site comparison: force emission 0 (already 0) and shoot site + top
    set_lod_visibility(variant_roots, 1)
    render_named(cam, EVIDENCE / "no_emission_works_site.png", "works_site", (0, 0, 0.08), targets)
    set_lod_visibility(variant_roots, 0)
    render_named(cam, EVIDENCE / "no_emission_works_top.png", "works_top", (0, 0, 0.08), targets)

    pad.hide_render = True
    return sorted(p.name for p in EVIDENCE.glob("*.png"))


def uv_overlap_report(obj):
    mesh = obj.data
    if not mesh.uv_layers:
        return True
    # unique per object is guaranteed by subrect packing; check UVs in [0,1]
    uv = mesh.uv_layers.active
    for item in uv.data:
        u, v = float(item.uv.x), float(item.uv.y)
        if u < -0.001 or u > 1.001 or v < -0.001 or v > 1.001:
            return False
    return True


def write_hashes_and_inventory(built, evidence_names):
    inv = built["inventory"]
    hashes = {
        "masterGlb": sha256(MASTER_GLB),
        "placeGlb": sha256(PLACE_GLB),
        "blend": sha256(BLEND_PATH) if BLEND_PATH.exists() else None,
        "atlas": {k: sha256(ROOT / v) for k, v in inv["atlas"].items()},
        "variants": {},
        "evidence": {},
    }
    for rec in inv["variants"]:
        path = VAR_DIR / f"{rec['id']}.glb"
        rec["sha256"] = sha256(path)
        rec["bytes"] = path.stat().st_size
        hashes["variants"][rec["id"]] = rec["sha256"]
    for name in evidence_names:
        p = EVIDENCE / name
        hashes["evidence"][name] = sha256(p)
    inv["bytes"] = MASTER_GLB.stat().st_size
    inv["sha256"] = hashes["masterGlb"]
    inv["placeSha256"] = hashes["placeGlb"]
    write_json_lf(SOURCE / "inclusion_kit_inventory.json", inv)
    write_json_lf(SOURCE / "HASHES.json", hashes)
    write_json_lf(EVIDENCE / "HASHES.json", hashes["evidence"])
    ledger = {
        "assetId": ASSET_ID,
        "cycle": CYCLE,
        "candidateHash": hashes["masterGlb"],
        "state": "evidence_ready",
        "gates": {
            "G1": "open",
            "G2": "open",
            "G4": "open",
            "G7": "open",
        },
        "scope": "kit_cycle_02",
        "notes": "Cycle 02 geological host/material/site correction. Cycle 01 evidence preserved. Not wired. Independent review required before G1/G2/G4.",
        "cycle01MasterGlb": "473A81F922168DEE8C3A622465205B9D68E2F8622F66EC499FD57D672A166D96",
        "hostMetalMax": HOST_METAL_MAX,
        "texelTargetPxPerWu": TEXEL_TARGET,
    }
    write_json_lf(FAMILY / "TECHNIQUE_LEDGER.json", ledger)
    return hashes, inv


def glb_node_names(path: Path):
    data = path.read_bytes()
    if data[:4] != b"glTF" or len(data) < 20:
        return []
    json_len = struct.unpack_from("<I", data, 12)[0]
    payload = bytes(data[20:20 + json_len]).rstrip(b" \x00")
    gltf = json.loads(payload)
    return [n.get("name", "") for n in gltf.get("nodes", [])]


def freeze_cycle_01(errors):
    hash_path = EVIDENCE_C1 / "HASHES.json"
    if not hash_path.exists():
        errors.append("cycle_01 HASHES.json missing")
        return
    frozen = json.loads(hash_path.read_text(encoding="utf-8"))
    for name, digest in frozen.items():
        p = EVIDENCE_C1 / name
        if not p.exists():
            errors.append(f"cycle_01 evidence missing {name}")
            continue
        got = sha256(p)
        if got != digest:
            errors.append(f"cycle_01 evidence mutated {name}")


def run_checks(inv, hashes, require_stills=True):
    errors = []

    def check_digest(label, path, expected):
        if not expected:
            errors.append(f"missing recorded hash {label}")
            return
        if not path.exists():
            errors.append(f"missing hashed file {label}: {path}")
            return
        got = sha256(path)
        if got != expected:
            errors.append(f"hash mismatch {label}: {got} != {expected}")

    if inv.get("cycle") != CYCLE:
        errors.append(f"inventory cycle {inv.get('cycle')} != {CYCLE}")
    names = [v["id"] for v in inv["variants"]]
    expected = [v["id"] for v in VARIANTS]
    if names != expected:
        errors.append("variant id order/set mismatch")
    if len(names) != len(set(names)):
        errors.append("duplicate variant ids")
    if len(names) != 18:
        errors.append("need exactly 18 variants")
    freeze_cycle_01(errors)
    families = {}
    for v in inv["variants"]:
        families.setdefault(v["family"], []).append(v)
    for fam in ("silver", "gold", "iron", "nickel"):
        if len(families.get(fam, [])) < 2:
            errors.append(f"{fam} needs two cluster forms")
    if len(families.get("exotic", [])) < 3:
        errors.append("need three exotic lattices")
    if len(families.get("ice", [])) < 2:
        errors.append("need two ice plates")
    if len(families.get("gas", [])) < 3:
        errors.append("need three gas fissures")
    if "scar" not in families or "lock" not in families:
        errors.append("need scar and lock")
    tiles = [v["tile"] for v in inv["variants"]]
    if len(tiles) != len(set(tiles)):
        errors.append("overlapping atlas tiles")
    for v in inv["variants"]:
        if v["footprintWu"] > FOOTPRINT + 0.02:
            errors.append(f"{v['id']} footprint {v['footprintWu']}")
        t0 = v["lodTriangles"]["lod0"]
        t1 = v["lodTriangles"]["lod1"]
        t2 = v["lodTriangles"]["lod2"]
        if not (TRI_MIN[0] <= t0 <= TRI_BUDGET[0]):
            errors.append(f"{v['id']} lod0 {t0}")
        if t1 >= t0:
            errors.append(f"{v['id']} lod1 not cheaper")
        if t2 >= t1:
            errors.append(f"{v['id']} lod2 not cheaper")
        if v["drawsLod0"] != 1:
            errors.append(f"{v['id']} draw count")
        glb = VAR_DIR / f"{v['id']}.glb"
        if not glb.exists():
            errors.append(f"missing {glb}")
        else:
            check_digest(f"variant {v['id']}", glb, hashes.get("variants", {}).get(v["id"]))
            nodes = glb_node_names(glb)
            if v["id"] not in nodes:
                errors.append(f"{v['id']} missing local root")
            for lod in (0, 1, 2):
                want = f"LOD{lod}_{v['id']}"
                if want not in nodes:
                    errors.append(f"{v['id']} missing {want}")
    for p in (MASTER_GLB, PLACE_GLB, BLEND_PATH):
        if not p.exists():
            errors.append(f"missing {p}")
    check_digest("masterGlb", MASTER_GLB, hashes.get("masterGlb"))
    check_digest("placeGlb", PLACE_GLB, hashes.get("placeGlb"))
    check_digest("blend", BLEND_PATH, hashes.get("blend"))
    master_nodes = glb_node_names(MASTER_GLB) if MASTER_GLB.exists() else []
    if MASTER_ROOT not in master_nodes:
        errors.append("master missing kit root")
    for v in VARIANTS:
        if f"LOD0_{v['id']}" not in master_nodes:
            errors.append(f"master missing LOD0_{v['id']}")
    for key in ("basecolor", "orm", "normal"):
        atlas_path = ROOT / inv["atlas"][key]
        if not atlas_path.exists():
            errors.append(f"missing atlas {key}")
        else:
            check_digest(f"atlas {key}", atlas_path, hashes.get("atlas", {}).get(key))
    if hashes["masterGlb"] != hashes["placeGlb"]:
        errors.append("place glb hash != master")
    required_stills = [
        "works_top_kit.png", "works_edge_kit.png", "works_site_kit.png",
        "diag_clay_works_top.png", "diag_grazing_works_top.png",
        "diag_normal_works_top.png", "diag_orm_works_top.png",
        "diag_material_id_works_top.png", "diag_identity_works_top.png",
        "no_emission_works_site.png", "no_emission_works_top.png",
    ]
    for fam in ("silver", "gold", "iron", "nickel", "exotic", "ice", "gas", "scar", "lock"):
        required_stills.append(f"family_{fam}_works_top.png")
        required_stills.append(f"family_{fam}_works_site.png")
    if require_stills:
        for name in required_stills:
            if not (EVIDENCE / name).exists():
                errors.append(f"missing still {name}")
    for name, expected in hashes.get("evidence", {}).items():
        check_digest(f"evidence {name}", EVIDENCE / name, expected)
    report = {"ok": not errors, "errors": errors, "variants": len(names)}
    write_json_lf(SOURCE / "CHECK_REPORT.json", report)
    if errors:
        raise RuntimeError("checks failed: " + "; ".join(errors))
    return report


def check_only():
    inv_path = SOURCE / "inclusion_kit_inventory.json"
    hash_path = SOURCE / "HASHES.json"
    inv = json.loads(inv_path.read_text(encoding="utf-8"))
    hashes = json.loads(hash_path.read_text(encoding="utf-8"))
    return run_checks(inv, hashes)


def main():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    skip_render, only = parse_args(argv)
    if only:
        report = check_only()
        print(json.dumps(report, indent=2))
        return
    built = build_kit()
    evidence_names = []
    if not skip_render:
        evidence_names = render_evidence(built)
    else:
        evidence_names = [p.name for p in EVIDENCE.glob("*.png")]
    hashes, inv = write_hashes_and_inventory(built, evidence_names)
    report = run_checks(inv, hashes, require_stills=not skip_render)
    print(json.dumps({
        "master": str(MASTER_GLB.relative_to(ROOT)).replace("\\", "/"),
        "place": str(PLACE_GLB.relative_to(ROOT)).replace("\\", "/"),
        "sha256": hashes["masterGlb"],
        "variants": len(inv["variants"]),
        "lodTriangles": inv["lodTriangles"],
        "checks": report,
    }, indent=2))


if __name__ == "__main__":
    main()

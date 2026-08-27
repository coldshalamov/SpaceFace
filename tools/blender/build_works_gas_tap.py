"""PQ-131.07 Works gas tap — Cycle 02 rooted tap and site-asymmetry correction.

Authored at works scale. One-cell wall-mounted valve manifold that taps a gas
pocket rather than breaching it. Cycle 02 keeps the Cycle 01 four-spoke wheel,
offset gauge, dark plate and non-glow materials, then corrects the remaining
wheel-on-plate / site-collapse defects: hat-section clamp with returns and
four corner blocks, coaxial valve/stem/yoke, cylindrical gauge with cream
face, and a short supported lance through a gland into the +X pocket.

Root SF_WORKS_GAS_TAP_V1. LOD roots LOD0_gas_tap / LOD1_gas_tap / LOD2_gas_tap.
Hooks valve_wheel, gauge_needle, lamp. Cycle 01 evidence is frozen; this
builder writes cycle_002 only.

    blender --background --python tools/blender/build_works_gas_tap.py
    blender --background --python tools/blender/build_works_gas_tap.py -- --combine-only
    blender --background --python tools/blender/build_works_gas_tap.py -- --inspect
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
from spaceface_works_camera import apply_works_camera  # noqa: E402

FAMILY = ROOT / "assets" / "works" / "gas_tap"
SOURCE_DIR = FAMILY / "source"
TEX_DIR = SOURCE_DIR / "textures"
EVIDENCE_DIR = FAMILY / "evidence" / "cycle_002"
CYCLE01_DIR = FAMILY / "evidence" / "cycle_001"
DIAG_DIR = EVIDENCE_DIR / "diagnostics"
PARTS_DIR = ROOT / "assets" / "ships" / "parts" / "works"
BLEND_SOURCE = FAMILY / "source" / "gas_tap.blend"

ASSET_ID = "place_works_gas_tap"
ROOT_NAME = "SF_WORKS_GAS_TAP_V1"
COMBINED_NAME = "place_works_gas_tap.glb"
PACKET = "PQ-131.07"
CYCLE = 2
CELL_WU = 2.2
TEX = 1024
SHADE_ANGLE_DEG = 28.0
TRI_BUDGET = {0: 6000, 1: 1500, 2: 500}
HOOK_NAMES = ("valve_wheel", "gauge_needle", "lamp")
KEEP_PNG = {b"IHDR", b"PLTE", b"IDAT", b"IEND", b"sRGB", b"gAMA", b"pHYs"}
CYCLE01_FREEZE = {
    "grazing.png": "DF330186879416E9475628291892CD5F457147BC91CD3515523222315C5FE0F6",
    "hooks_identity.png": "4007E5F39615B068AF91188ED9EA4AAA9922FA745466825C04832D5FB8D9662D",
    "material_id.png": "DD71BF7C875E0790D7E1EC6C6B4D2B9ED0C4F4FEFDE3E6CC1F3BA3341C2CA472",
    "normal_isolation.png": "FE5EE51185804D49C8357F4C2A10A3560E702E00B41C8E11BC0EED59217B5FE7",
    "orm_isolation.png": "021704729E10FF30047302306EC729532A1A1C1A31D0072FE95D953FD28385E3",
    "works_edge.png": "B1FF98A26C4F9FBE5B202A9798309A29EA193A8E020B7A94750575A9DFEC5C20",
    "works_edge_clay.png": "D9F74E1A545C347FD7C09F360E0198379F22F0D9FC16BC61BCFADA3AE460AD0E",
    "works_site.png": "17FB06F6CF078A9F26A0036863D38CF8B6608824D9A585DF383C654C588DC634",
    "works_site_clay.png": "58FC845877B1A34F9A90827C8FBEAB4A74A41362D9EC59E990BE2A82A3E1638D",
    "works_top.png": "34C16BF19C7927631D0FA3E39F851E7B44BA3981DCA59CC15586B4C7AE7BCE57",
    "works_top_clay.png": "FC59AF12BF6FF9F290B09DD75D8AF3EB21D1696775FC65823EF812C56B1AF5CD",
}

ATLAS_TILE = {
    "paint": 0,
    "steel": 1,
    "brass": 2,
    "rubber": 3,
    "face": 4,
    "glass": 5,
    "lamp": 6,
}
ROLE_RGB = {
    "paint": (0.072, 0.068, 0.060),
    "steel": (0.428, 0.439, 0.459),
    "brass": (0.541, 0.420, 0.227),
    "rubber": (0.090, 0.082, 0.075),
    "face": (0.88, 0.84, 0.78),
    "glass": (0.086, 0.063, 0.035),
    "lamp": (0.95, 0.88, 0.62),
}
ROLE_FLAT = {
    "paint": (0.45, 0.32, 0.18),
    "steel": (0.55, 0.58, 0.62),
    "brass": (0.85, 0.62, 0.22),
    "rubber": (0.18, 0.16, 0.14),
    "face": (0.92, 0.88, 0.78),
    "glass": (0.12, 0.08, 0.05),
    "lamp": (1.00, 0.92, 0.55),
}
STEEL_BANDS = (
    (0.00, 0.46, (0.220, 0.224, 0.232), 0.62, 0.28),
    (0.46, 0.78, (0.428, 0.439, 0.459), 0.38, 0.78),
    (0.78, 1.01, (0.545, 0.565, 0.588), 0.26, 0.88),
)
ROLE_V_DEFAULT = {"steel": (0.50, 0.74)}
V_STEEL_PLATE = (0.02, 0.44)
V_STEEL_MACHINED = (0.50, 0.74)
V_STEEL_BRIGHT = (0.82, 0.98)
EMIT_ALPHA = {"lamp": 0.72}

# Geometry contract (works scale, origin at cell centre).
# Hat-section web faces the room; returns and clamp feet go +X to the wall.
PLATE_X0, PLATE_X1 = 0.86, 0.96
PLATE_HY, PLATE_Z0, PLATE_Z1 = 0.68, 0.12, 0.84
HAT_TOP_X0, HAT_TOP_X1 = 0.88, 1.04
HAT_TOP_Z0, HAT_TOP_Z1 = 0.84, 0.94
CLAMP_X0, CLAMP_X1 = 1.00, 1.08
CLAMP_HY = 0.76
VALVE_C = (0.52, 0.08, 0.38)
WHEEL_C = (0.52, 0.08, 0.80)
WHEEL_R = 0.36
GAUGE_C = (0.56, -0.54, 0.72)
GAUGE_R = 0.15
LAMP_C = (0.94, 0.58, 0.96)
LANCE_Y, LANCE_Z = 0.30, 0.38
LANCE_X0, LANCE_X1 = 0.98, 1.16
NEEDLE_Z = GAUGE_C[2] + 0.041
WALL_INNER_X = 1.08

SEG = {
    0: {"cyl": 8, "wheel": 12, "hose": 6, "hose_s": 6, "spokes": 4, "bolts": True},
    1: {"cyl": 7, "wheel": 8, "hose": 4, "hose_s": 6, "spokes": 4, "bolts": True},
    2: {"cyl": 6, "wheel": 8, "hose": 2, "hose_s": 5, "spokes": 4, "bolts": False},
}


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1 << 20), b""):
            digest.update(chunk)
    return digest.hexdigest().upper()


_GLTF_FLOAT = 5126
_GLTF_NCOMP = {
    "SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4,
    "MAT2": 4, "MAT3": 9, "MAT4": 16,
}


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


def object_mode():
    try:
        if bpy.context.mode != "OBJECT":
            bpy.ops.object.mode_set(mode="OBJECT")
    except Exception:
        pass


def h01_arr(x, y, s=0):
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
            time.sleep(0.25 * (attempt + 1))
    if last_err is not None:
        raise last_err
    img.pack()
    img.filepath_raw = ""
    tmp_path.replace(path)
    sanitize_png(path)
    return img


def role_maps(role, rgb, size):
    br, bg, bb = rgb
    y, x = np.mgrid[0:size, 0:size]
    x = x.astype(np.uint32)
    y = y.astype(np.uint32)
    gf = h01_arr(x, y, 11)
    gf2 = h01_arr(x // 3, y // 3, 29)
    gf3 = h01_arr(x // 7, y // 7, 47)
    fx = x.astype(np.float32) / float(size)
    fy = y.astype(np.float32) / float(size)
    dirt = np.clip(0.10 * gf + 0.16 * gf2 + 0.08 * gf3, 0.0, 1.0)

    if role == "paint":
        pw, ph = 96, 72
        mx = np.mod(x, np.uint32(pw)).astype(np.int32)
        my = np.mod(y, np.uint32(ph)).astype(np.int32)
        dx = np.minimum(mx, pw - mx).astype(np.float32)
        dy = np.minimum(my, ph - my).astype(np.float32)
        seam = ((dx <= 1) | (dy <= 1)).astype(np.float32)
        edge = ((dx <= 3) | (dy <= 3)).astype(np.float32)
        chip = (gf > 0.93).astype(np.float32) * edge
        r = np.clip(br * (1.0 - dirt * 0.22 - chip * 0.40) + chip * 0.22, 0, 1)
        g = np.clip(bg * (1.0 - dirt * 0.18 - chip * 0.32) + chip * 0.20, 0, 1)
        b = np.clip(bb * (1.0 - dirt * 0.14 - chip * 0.22) + chip * 0.18, 0, 1)
        rough = np.clip(0.68 + dirt * 0.16 - edge * 0.04 + chip * 0.08, 0.20, 0.95)
        metal = np.clip(0.08 + chip * 0.55 + seam * 0.04, 0.0, 1.0)
        nx = np.clip(0.5 + (dx / 8.0 - 0.5) * edge * 0.18, 0, 1)
        ny = np.clip(0.5 + (dy / 8.0 - 0.5) * edge * 0.18, 0, 1)
        ao = np.clip(1.0 - seam * 0.22 - dirt * 0.16, 0.20, 1.0)
    elif role == "steel":
        grind = (np.mod(x, np.uint32(3)) == 0).astype(np.float32)
        r = np.zeros((size, size), dtype=np.float32)
        g = np.zeros((size, size), dtype=np.float32)
        b = np.zeros((size, size), dtype=np.float32)
        rough = np.zeros((size, size), dtype=np.float32)
        metal = np.zeros((size, size), dtype=np.float32)
        for v_lo, v_hi, (cr, cg, cb), rg, mt in STEEL_BANDS:
            sel = (fy >= v_lo) & (fy < v_hi)
            gnd = grind * (0.0 if v_lo < 0.4 else 1.0)
            r = np.where(sel, np.clip(cr * (0.90 + gf * 0.12 - dirt * 0.20) + gnd * 0.03, 0, 1), r)
            g = np.where(sel, np.clip(cg * (0.92 + gf * 0.10 - dirt * 0.18) + gnd * 0.024, 0, 1), g)
            b = np.where(sel, np.clip(cb * (0.94 + (1 - gf) * 0.08 - dirt * 0.14) + gnd * 0.018, 0, 1), b)
            rough = np.where(sel, np.clip(rg + dirt * 0.14 - gnd * 0.05, 0.08, 0.95), rough)
            metal = np.where(sel, np.clip(mt + gnd * 0.04, 0.0, 1.0), metal)
        nx = np.clip(0.5 + grind * 0.06, 0, 1)
        ny = np.full((size, size), 0.5, dtype=np.float32)
        ao = np.clip(0.92 - dirt * 0.18, 0.25, 1.0)
    elif role == "brass":
        r = np.clip(br * (0.88 + gf * 0.14 - dirt * 0.12), 0, 1)
        g = np.clip(bg * (0.86 + gf * 0.10 - dirt * 0.10), 0, 1)
        b = np.clip(bb * (0.80 + gf * 0.08 - dirt * 0.08), 0, 1)
        rough = np.clip(0.38 + dirt * 0.14, 0.12, 0.85)
        metal = np.clip(0.78 + gf * 0.08, 0.0, 1.0)
        nx = np.clip(0.5 + (np.mod(x, np.uint32(5)) == 0).astype(np.float32) * 0.05, 0, 1)
        ny = np.full((size, size), 0.5, dtype=np.float32)
        ao = np.clip(0.90 - dirt * 0.12, 0.30, 1.0)
    elif role == "rubber":
        ridge = (np.mod(y, np.uint32(10)) <= 2).astype(np.float32)
        r = np.clip(br * (0.92 + gf * 0.12) + ridge * 0.05, 0, 1)
        g = np.clip(bg * (0.92 + gf * 0.10) + ridge * 0.04, 0, 1)
        b = np.clip(bb * (0.90 + gf * 0.08) + ridge * 0.03, 0, 1)
        rough = np.clip(0.86 + dirt * 0.08 - ridge * 0.12, 0.20, 0.98)
        metal = np.clip(0.04 + ridge * 0.28, 0.0, 1.0)
        nx = np.full((size, size), 0.5, dtype=np.float32)
        ny = np.clip(0.5 + (ridge - 0.5) * 0.22, 0, 1)
        ao = np.clip(0.88 - ridge * 0.10 - dirt * 0.10, 0.25, 1.0)
    elif role == "face":
        cx = cy = (size - 1) * 0.5
        dx = x.astype(np.float32) - cx
        dy = y.astype(np.float32) - cy
        rad = np.sqrt(dx * dx + dy * dy) / (size * 0.48)
        ang = np.arctan2(dy, dx)
        ring = ((np.abs(rad - 0.82) < 0.018) | (np.abs(rad - 0.68) < 0.012)).astype(np.float32)
        tick = np.zeros((size, size), dtype=np.float32)
        for i in range(12):
            a = i * (math.pi * 2.0 / 12.0) - math.pi / 2.0
            ca, sa = math.cos(a), math.sin(a)
            proj = dx * ca + dy * sa
            perp = np.abs(-dx * sa + dy * ca)
            long = 0.14 if i % 3 == 0 else 0.08
            wide = 2.4 if i % 3 == 0 else 1.4
            tick = np.maximum(
                tick,
                ((proj > size * 0.28) & (proj < size * (0.28 + long)) & (perp < wide)).astype(np.float32),
            )
        boss = (rad < 0.10).astype(np.float32)
        ink = np.clip(ring + tick, 0, 1)
        r = np.clip(br * (0.96 - dirt * 0.10) - ink * 0.72 + boss * 0.05, 0, 1)
        g = np.clip(bg * (0.96 - dirt * 0.10) - ink * 0.70 + boss * 0.02, 0, 1)
        b = np.clip(bb * (0.96 - dirt * 0.08) - ink * 0.66, 0, 1)
        rough = np.clip(0.70 + dirt * 0.10 - boss * 0.12, 0.20, 0.95)
        metal = np.clip(0.02 + boss * 0.55, 0.0, 1.0)
        nx = np.full((size, size), 0.5, dtype=np.float32)
        ny = np.full((size, size), 0.5, dtype=np.float32)
        ao = np.clip(0.96 - dirt * 0.08, 0.40, 1.0)
    elif role == "glass":
        film = np.clip(0.55 + gf * 0.45, 0, 1)
        r = np.clip(br * (0.90 + film * 0.28) + dirt * 0.03, 0, 1)
        g = np.clip(bg * (0.90 + film * 0.26) + dirt * 0.025, 0, 1)
        b = np.clip(bb * (0.92 + film * 0.22) + dirt * 0.02, 0, 1)
        rough = np.clip(0.14 + dirt * 0.12, 0.04, 0.55)
        metal = np.full((size, size), 0.03, dtype=np.float32)
        nx = np.full((size, size), 0.5, dtype=np.float32)
        ny = np.full((size, size), 0.5, dtype=np.float32)
        ao = np.clip(0.94 - dirt * 0.06, 0.40, 1.0)
    elif role == "lamp":
        r = np.clip(br * (0.92 + gf * 0.08), 0, 1)
        g = np.clip(bg * (0.90 + gf * 0.06), 0, 1)
        b = np.clip(bb * (0.78 + gf * 0.04), 0, 1)
        rough = np.clip(0.22 + dirt * 0.08, 0.06, 0.70)
        metal = np.full((size, size), 0.04, dtype=np.float32)
        nx = np.full((size, size), 0.5, dtype=np.float32)
        ny = np.full((size, size), 0.5, dtype=np.float32)
        ao = np.full((size, size), 0.95, dtype=np.float32)
    else:
        r = np.full((size, size), br, dtype=np.float32)
        g = np.full((size, size), bg, dtype=np.float32)
        b = np.full((size, size), bb, dtype=np.float32)
        rough = np.full((size, size), 0.5, dtype=np.float32)
        metal = np.full((size, size), 0.2, dtype=np.float32)
        nx = np.full((size, size), 0.5, dtype=np.float32)
        ny = np.full((size, size), 0.5, dtype=np.float32)
        ao = np.full((size, size), 0.85, dtype=np.float32)

    nxd = nx * 2.0 - 1.0
    nyd = ny * 2.0 - 1.0
    nzd = np.sqrt(np.clip(1.0 - nxd * nxd - nyd * nyd, 0.0, 1.0))
    nz = np.clip(nzd * 0.5 + 0.5, 0, 1)
    emit = np.full((size, size), float(EMIT_ALPHA.get(role, 0.0)), dtype=np.float32)
    ones = np.ones((size, size, 1), dtype=np.float32)
    albedo = np.concatenate([r[..., None], g[..., None], b[..., None], emit[..., None]], axis=2)
    orm = np.concatenate([ao[..., None], rough[..., None], metal[..., None], ones], axis=2)
    nrm = np.concatenate([nx[..., None], ny[..., None], nz[..., None], ones], axis=2)
    return albedo, orm, nrm


def atlas_gutter(size):
    return max(2, int(round(4 * size / 1024.0)))


def tile_rect_px(index, size):
    tile = size // 4
    col, row = index % 4, index // 4
    gutter = atlas_gutter(size)
    return col * tile, row * tile, tile, gutter


def tile_uv_rect(role, size):
    index = ATLAS_TILE[role]
    u0, v0, tile, gutter = tile_rect_px(index, size)
    ou = (u0 + gutter) / float(size)
    ov = (v0 + gutter) / float(size)
    scale = (tile - 2 * gutter) / float(size)
    return ou, ov, scale, (
        ou, ov,
        (u0 + tile - gutter) / float(size),
        (v0 + tile - gutter) / float(size),
    )


def paste_clamped(atlas, patch, u0, v0, tile, gutter):
    inner = tile - 2 * gutter
    if patch.shape[0] != inner or patch.shape[1] != inner:
        raise RuntimeError(f"tile patch {patch.shape} != inner {inner}")
    ui, vi = u0 + gutter, v0 + gutter
    atlas[vi:vi + inner, ui:ui + inner] = patch
    left, right, top, bot = patch[:, 0], patch[:, -1], patch[0, :], patch[-1, :]
    for g in range(gutter):
        atlas[vi:vi + inner, u0 + g] = left
        atlas[vi:vi + inner, ui + inner + g] = right
        atlas[v0 + g, ui:ui + inner] = top
        atlas[vi + inner + g, ui:ui + inner] = bot
    for gy in range(gutter):
        for gx in range(gutter):
            atlas[v0 + gy, u0 + gx] = patch[0, 0]
            atlas[v0 + gy, ui + inner + gx] = patch[0, -1]
            atlas[vi + inner + gy, u0 + gx] = patch[-1, 0]
            atlas[vi + inner + gy, ui + inner + gx] = patch[-1, -1]


def pack_atlas(size):
    albedo = np.zeros((size, size, 4), dtype=np.float32)
    orm = np.zeros((size, size, 4), dtype=np.float32)
    nrm = np.zeros((size, size, 4), dtype=np.float32)
    nrm[..., 0] = 0.5
    nrm[..., 1] = 0.5
    nrm[..., 2] = 1.0
    nrm[..., 3] = 1.0
    orm[..., 3] = 1.0
    gutter = atlas_gutter(size)
    inner = size // 4 - 2 * gutter
    mapping = {}
    used = set(ATLAS_TILE.values())
    for role, index in ATLAS_TILE.items():
        maps = role_maps(role, ROLE_RGB[role], inner)
        u0, v0, tile_px, gut = tile_rect_px(index, size)
        paste_clamped(albedo, maps[0], u0, v0, tile_px, gut)
        paste_clamped(orm, maps[1], u0, v0, tile_px, gut)
        paste_clamped(nrm, maps[2], u0, v0, tile_px, gut)
        mapping[role] = {"tile": index, "gutter": gut, "inner": inner}
    for index in range(16):
        if index in used:
            continue
        role = "paint" if index % 2 == 0 else "steel"
        maps = role_maps(role, ROLE_RGB[role], inner)
        u0, v0, tile_px, gut = tile_rect_px(index, size)
        paste_clamped(albedo, maps[0], u0, v0, tile_px, gut)
        paste_clamped(orm, maps[1], u0, v0, tile_px, gut)
        paste_clamped(nrm, maps[2], u0, v0, tile_px, gut)
    factor = 0.82 + 0.18 * orm[..., 0]
    albedo[..., 0] *= factor
    albedo[..., 1] *= factor
    albedo[..., 2] *= factor
    np.clip(albedo, 0.0, 1.0, out=albedo)
    np.divide(np.round(albedo * 255.0), 255.0, out=albedo)
    return albedo, orm, nrm, mapping


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


def create_atlas():
    albedo, orm, nrm, mapping = pack_atlas(TEX)
    maps = (
        write_pixels("gas_tap_atlas_basecolor", albedo, TEX, "sRGB"),
        write_pixels("gas_tap_atlas_orm", orm, TEX, "Non-Color"),
        write_pixels("gas_tap_atlas_normal", nrm, TEX, "Non-Color"),
    )
    material = bpy.data.materials.new("Material_GasTapAtlas")
    bsdf = principled(material)
    wire_atlas(material, bsdf, maps)
    material["spacefaceRole"] = "atlas"
    if hasattr(material, "blend_method"):
        try:
            material.blend_method = "OPAQUE"
        except TypeError:
            pass
    return maps, material, mapping


def apply_modifiers(obj):
    object_mode()
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    try:
        for mod in list(obj.modifiers):
            name = mod.name
            try:
                bpy.ops.object.modifier_apply(modifier=name)
            except Exception:
                if obj.modifiers.get(name) is not None:
                    obj.modifiers.remove(mod)
    finally:
        obj.select_set(False)


def link_object(obj, collection):
    for current in list(obj.users_collection):
        current.objects.unlink(obj)
    collection.objects.link(obj)
    return obj


def parent_keep(obj, parent):
    # Blender defers matrix-world evaluation after direct location writes.  A
    # fresh empty therefore still reports the identity matrix unless the view
    # layer is updated first, which silently moved all exported hook pivots to
    # the asset origin.  Evaluate before capturing the world transform so the
    # hook keeps its authored pivot while joined world-space geometry is
    # counter-transformed beneath it.
    bpy.context.view_layer.update()
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
    if parent:
        parent_keep(obj, parent)
    obj["socket"] = True
    obj["spacefaceSocket"] = True
    obj["spaceface"] = {"socket": True, "role": "works_hook"}
    return obj


def add_mesh(name, verts, faces, role, collection, bevel=0.006):
    mesh = bpy.data.meshes.new(f"{name}_Mesh")
    mesh.from_pydata([tuple(v) for v in verts], [], [tuple(f) for f in faces])
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)
    obj["spacefaceRole"] = role
    if bevel > 0:
        mod = obj.modifiers.new("ProductionBevel", "BEVEL")
        mod.width = bevel
        mod.segments = 1
        mod.limit_method = "ANGLE"
        mod.angle_limit = math.radians(40)
    return obj


def box_verts(c, hx, hy, hz):
    x, y, z = c
    return [
        (x - hx, y - hy, z - hz), (x + hx, y - hy, z - hz),
        (x + hx, y + hy, z - hz), (x - hx, y + hy, z - hz),
        (x - hx, y - hy, z + hz), (x + hx, y - hy, z + hz),
        (x + hx, y + hy, z + hz), (x - hx, y + hy, z + hz),
    ]


BOX_FACES = [
    (0, 1, 2, 3), (4, 7, 6, 5), (0, 4, 5, 1),
    (1, 5, 6, 2), (2, 6, 7, 3), (3, 7, 4, 0),
]


def add_box(name, c, hx, hy, hz, role, collection, bevel=0.006):
    return add_mesh(name, box_verts(c, hx, hy, hz), BOX_FACES, role, collection, bevel)


def add_oriented_box(name, center, axis_xy, hx, hy, hz, role, collection, bevel=0.0):
    """Box whose local X follows `axis_xy` in the world XY plane. Verts are world-space; origin stays 0."""
    ax, ay = axis_xy
    length = math.hypot(ax, ay) or 1.0
    ex, ey = ax / length, ay / length
    fx, fy = -ey, ex
    cx, cy, cz = center
    verts = []
    for sx, sy, sz in (
        (-1, -1, -1), (1, -1, -1), (1, 1, -1), (-1, 1, -1),
        (-1, -1, 1), (1, -1, 1), (1, 1, 1), (-1, 1, 1),
    ):
        verts.append((
            cx + sx * hx * ex + sy * hy * fx,
            cy + sx * hx * ey + sy * hy * fy,
            cz + sz * hz,
        ))
    return add_mesh(name, verts, BOX_FACES, role, collection, bevel)


def oriented_ring(point, tangent, radius, n):
    origin = Vector(point)
    t = Vector(tangent)
    if t.length < 1e-8:
        t = Vector((1.0, 0.0, 0.0))
    t.normalize()
    up = Vector((0.0, 0.0, 1.0))
    if abs(t.dot(up)) > 0.92:
        up = Vector((0.0, 1.0, 0.0))
    b = t.cross(up)
    b.normalize()
    c = t.cross(b)
    c.normalize()
    pts = []
    for i in range(n):
        a = (i / n) * math.pi * 2.0
        pts.append(tuple(origin + (b * math.cos(a) + c * math.sin(a)) * radius))
    return pts


def loft_rings(name, rings, role, collection, bevel=0.006, cap=True):
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
    return add_mesh(name, verts, faces, role, collection, bevel)


def circle_ring(cx, cy, cz, rx, ry, n, axis="x"):
    pts = []
    for i in range(n):
        a = (i / n) * math.pi * 2.0
        ca, sa = math.cos(a), math.sin(a)
        if axis == "x":
            pts.append((cx, cy + rx * ca, cz + ry * sa))
        elif axis == "y":
            pts.append((cx + rx * ca, cy, cz + ry * sa))
        else:
            pts.append((cx + rx * ca, cy + ry * sa, cz))
    return pts


def add_cyl(name, c, radius, depth, role, collection, n, axis="z", bevel=0.004):
    h = depth * 0.5
    if axis == "x":
        rings = [
            circle_ring(c[0] - h, c[1], c[2], radius, radius, n, "x"),
            circle_ring(c[0] + h, c[1], c[2], radius, radius, n, "x"),
        ]
    elif axis == "y":
        rings = [
            circle_ring(c[0], c[1] - h, c[2], radius, radius, n, "y"),
            circle_ring(c[0], c[1] + h, c[2], radius, radius, n, "y"),
        ]
    else:
        rings = [
            circle_ring(c[0], c[1], c[2] - h, radius, radius, n, "z"),
            circle_ring(c[0], c[1], c[2] + h, radius, radius, n, "z"),
        ]
    return loft_rings(name, rings, role, collection, bevel, cap=True)


def hex_ring(cx, cy, cz, radius, axis="x"):
    return circle_ring(cx, cy, cz, radius, radius, 6, axis)


def add_hex(name, c, radius, depth, role, collection, axis="x", bevel=0.002):
    h = depth * 0.5
    if axis == "x":
        rings = [hex_ring(c[0] - h, c[1], c[2], radius, "x"), hex_ring(c[0] + h, c[1], c[2], radius, "x")]
    elif axis == "y":
        rings = [hex_ring(c[0], c[1] - h, c[2], radius, "y"), hex_ring(c[0], c[1] + h, c[2], radius, "y")]
    else:
        rings = [hex_ring(c[0], c[1], c[2] - h, radius, "z"), hex_ring(c[0], c[1], c[2] + h, radius, "z")]
    return loft_rings(name, rings, role, collection, bevel, cap=True)


def remap_uvs_to_tile(obj, role, size):
    if obj.type != "MESH":
        return
    if not obj.data.uv_layers:
        obj.data.uv_layers.new(name="UVMap")
    layer = obj.data.uv_layers.active
    ou, ov, scale, _rect = tile_uv_rect(role, size)
    v0f = float(obj.get("sf_v0", 0.0))
    v1f = float(obj.get("sf_v1", 1.0))
    for item in layer.data:
        u = min(1.0, max(0.0, float(item.uv.x)))
        v = min(1.0, max(0.0, float(item.uv.y)))
        v = v0f + v * (v1f - v0f)
        item.uv = (ou + u * scale, ov + v * scale)


def shade_and_uv(obj, skip_uv=False):
    object_mode()
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    try:
        bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    except Exception:
        pass
    apply_modifiers(obj)
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    try:
        bpy.ops.object.shade_smooth_by_angle(angle=math.radians(SHADE_ANGLE_DEG))
    except Exception:
        for poly in obj.data.polygons:
            poly.use_smooth = True
    if not skip_uv:
        bpy.ops.object.mode_set(mode="EDIT")
        bpy.ops.mesh.select_all(action="SELECT")
        bpy.ops.uv.smart_project(angle_limit=66.0, island_margin=0.018, scale_to_bounds=True)
        bpy.ops.object.mode_set(mode="OBJECT")
    wn = obj.modifiers.new("WeightedNormal", "WEIGHTED_NORMAL")
    wn.keep_sharp = True
    apply_modifiers(obj)
    tri = obj.modifiers.new("ExportTriangulate", "TRIANGULATE")
    tri.quad_method = "FIXED"
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.modifier_apply(modifier=tri.name)
    obj.select_set(False)


def finish_for_atlas(obj, atlas_mat, size):
    shade_and_uv(obj)
    role = obj.get("spacefaceRole")
    if obj.get("sf_v0") is None and role in ROLE_V_DEFAULT:
        lo, hi = ROLE_V_DEFAULT[role]
        obj["sf_v0"] = float(lo)
        obj["sf_v1"] = float(hi)
    remap_uvs_to_tile(obj, role, size)
    obj.data.materials.clear()
    obj.data.materials.append(atlas_mat)
    obj["spacefaceRole"] = role
    return role


def join_group(objects, name, parent):
    objects = [obj for obj in objects if obj.data and len(obj.data.vertices) > 0]
    objects = sorted(objects, key=lambda obj: obj.name)
    if not objects:
        return None
    object_mode()
    bpy.ops.object.select_all(action="DESELECT")
    for obj in objects:
        apply_modifiers(obj)
        obj.select_set(True)
    active = objects[0]
    bpy.context.view_layer.objects.active = active
    if len(objects) > 1:
        bpy.ops.object.join()
    active = bpy.context.view_layer.objects.active
    active.name = name
    if active.data:
        active.data.name = name
    if parent:
        parent_keep(active, parent)
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


def tri_count(obj):
    if obj.type != "MESH" or not obj.data:
        return 0
    return sum(max(0, len(p.vertices) - 2) for p in obj.data.polygons)


def steel_band(obj, band):
    obj["sf_v0"] = float(band[0])
    obj["sf_v1"] = float(band[1])
    return obj


# --------------------------------------------------------------------------- geometry
def hat_backplate(collection, lod):
    """Folded hat-section clamp: room-facing web, wall-bound returns, top brim.

    The Cycle 01 grooved square / cell-colored slab is replaced by a formed
    channel. From above the top return is the long dark bar; Y-end legs and
    four corner blocks carry the clamp mass. No service label, no groove rib.
    """
    parts = []
    bv = 0.008 if lod == 0 else 0.0
    web = add_box(
        "BackplateWeb",
        ((PLATE_X0 + PLATE_X1) * 0.5, 0.0, (PLATE_Z0 + PLATE_Z1) * 0.5),
        (PLATE_X1 - PLATE_X0) * 0.5, PLATE_HY, (PLATE_Z1 - PLATE_Z0) * 0.5,
        "paint", collection, bevel=bv,
    )
    parts.append(web)
    top = add_box(
        "HatTopReturn",
        ((HAT_TOP_X0 + HAT_TOP_X1) * 0.5, 0.0, (HAT_TOP_Z0 + HAT_TOP_Z1) * 0.5),
        (HAT_TOP_X1 - HAT_TOP_X0) * 0.5, PLATE_HY + 0.02, (HAT_TOP_Z1 - HAT_TOP_Z0) * 0.5,
        "paint", collection, bevel=bv,
    )
    parts.append(top)
    if lod < 2:
        bot = add_box(
            "HatBotReturn",
            ((HAT_TOP_X0 + HAT_TOP_X1) * 0.5, 0.0, 0.07),
            (HAT_TOP_X1 - HAT_TOP_X0) * 0.5, PLATE_HY + 0.02, 0.06,
            "paint", collection, bevel=0.0,
        )
        parts.append(bot)
    if lod < 2:
        for sign in (-1.0, 1.0):
            leg = add_box(
                f"HatYReturn_{'P' if sign > 0 else 'S'}",
                ((PLATE_X1 + CLAMP_X0) * 0.5, sign * PLATE_HY, (PLATE_Z0 + PLATE_Z1) * 0.5),
                0.07, 0.030, (PLATE_Z1 - PLATE_Z0) * 0.46,
                "paint", collection, bevel=0.004 if lod == 0 else 0.0,
            )
            parts.append(leg)
    if lod == 0:
        cleat = add_box(
            "PlateCleat",
            (PLATE_X0 - 0.012, 0.0, 0.48),
            0.012, 0.16, 0.035,
            "paint", collection, bevel=0.003,
        )
        parts.append(cleat)
    return parts


def clamp_blocks(collection, lod):
    """Four corner clamp blocks, hex bolts, and real standoff posts to the wall."""
    parts = []
    bolts = SEG[lod]["bolts"]
    corners = (
        (0.78, CLAMP_HY),
        (0.78, -CLAMP_HY),
        (0.22, CLAMP_HY),
        (0.22, -CLAMP_HY),
    )
    for i, (zz, yy) in enumerate(corners):
        pad = add_box(
            f"ClampPad_{i}",
            ((CLAMP_X0 + CLAMP_X1) * 0.5, yy, zz),
            (CLAMP_X1 - CLAMP_X0) * 0.5 + 0.012, 0.10, 0.10,
            "paint", collection, bevel=0.005 if lod == 0 else 0.0,
        )
        parts.append(pad)
        if lod < 2:
            throat = add_box(
                f"ClampThroat_{i}",
                ((PLATE_X1 + CLAMP_X0) * 0.5, yy, zz),
                0.055, 0.062, 0.062,
                "paint", collection, bevel=0.0,
            )
            parts.append(throat)
            post = add_cyl(
                f"Standoff_{i}",
                ((PLATE_X1 + CLAMP_X1) * 0.5, yy, zz),
                0.018, (CLAMP_X1 - PLATE_X1),
                "steel", collection, n=max(6, SEG[lod]["cyl"] - 2), axis="x", bevel=0.0,
            )
            steel_band(post, V_STEEL_MACHINED)
            parts.append(post)
        if lod == 0:
            gusset = add_box(
                f"ClampGusset_{i}",
                (PLATE_X1 - 0.01, yy * 0.94, zz),
                0.03, 0.04, 0.07,
                "paint", collection, bevel=0.0,
            )
            parts.append(gusset)
        if bolts:
            bolt = add_hex(
                f"ClampBolt_{i}",
                (PLATE_X0 - 0.018, yy, zz),
                0.024, 0.05, "steel", collection, axis="x", bevel=0.0,
            )
            steel_band(bolt, V_STEEL_BRIGHT)
            parts.append(bolt)
            if i < 2 and lod < 2:
                top_bolt = add_hex(
                    f"ClampTopBolt_{i}",
                    ((CLAMP_X0 + CLAMP_X1) * 0.5, yy, zz + 0.112),
                    0.022, 0.036, "steel", collection, axis="z", bevel=0.0,
                )
                steel_band(top_bolt, V_STEEL_BRIGHT)
                parts.append(top_bolt)
    for i, yy in enumerate((-0.40, 0.40)):
        foot = add_box(
            f"StandFoot_{i}",
            (0.94, yy, 0.045),
            0.09, 0.07, 0.045,
            "paint", collection, bevel=0.0,
        )
        parts.append(foot)
    return parts


def valve_body(collection, lod):
    """Globe body saddled to the plate; stem and yoke coaxial with the wheel."""
    n = SEG[lod]["cyl"]
    parts = []
    vc = VALVE_C
    if lod >= 2:
        stations = [
            (vc[0] + 0.18, 0.12, 0.12),
            (vc[0] + 0.00, 0.16, 0.14),
            (vc[0] - 0.18, 0.12, 0.12),
        ]
    else:
        stations = [
            (vc[0] + 0.20, 0.12, 0.12),
            (vc[0] + 0.13, 0.07, 0.07),
            (vc[0] + 0.00, 0.16, 0.14),
            (vc[0] - 0.13, 0.07, 0.07),
            (vc[0] - 0.20, 0.12, 0.12),
        ]
    rings = [circle_ring(x, vc[1], vc[2], ry, rz, n, "x") for x, ry, rz in stations]
    body = loft_rings("ValveBody", rings, "steel", collection, bevel=0.008 if lod == 0 else 0.0, cap=True)
    steel_band(body, V_STEEL_MACHINED)
    parts.append(body)
    saddle = add_box(
        "ValveSaddle",
        ((vc[0] + PLATE_X0) * 0.5 + 0.10, vc[1], vc[2]),
        0.11, 0.085, 0.075,
        "steel", collection, bevel=0.004 if lod == 0 else 0.0,
    )
    steel_band(saddle, V_STEEL_MACHINED)
    parts.append(saddle)
    if lod == 0:
        uclamp = add_box(
            "ValveUClamp",
            (PLATE_X0 - 0.018, vc[1], vc[2]),
            0.018, 0.095, 0.09,
            "steel", collection, bevel=0.0,
        )
        steel_band(uclamp, V_STEEL_MACHINED)
        parts.append(uclamp)
    if lod < 2:
        for tag, x, hx in (("InletFlange", vc[0] + 0.20, 0.018), ("OutletFlange", vc[0] - 0.20, 0.018)):
            fl = add_cyl(tag, (x, vc[1], vc[2]), 0.13, hx * 2, "steel", collection, n=n, axis="x", bevel=0.0)
            steel_band(fl, V_STEEL_MACHINED)
            parts.append(fl)
    bv = 0.004 if lod == 0 else 0.0
    if lod < 2:
        bonnet_flange = add_cyl(
            "BonnetFlange", (vc[0], vc[1], vc[2] + 0.16), 0.11, 0.03, "steel", collection, n=n, axis="z", bevel=bv,
        )
        steel_band(bonnet_flange, V_STEEL_MACHINED)
        parts.append(bonnet_flange)
    bonnet = add_cyl(
        "Bonnet", (vc[0], vc[1], vc[2] + 0.22), 0.08, 0.12, "steel", collection, n=n, axis="z", bevel=bv,
    )
    steel_band(bonnet, V_STEEL_MACHINED)
    parts.append(bonnet)
    if lod == 0:
        packing = add_cyl(
            "PackingNut", (vc[0], vc[1], vc[2] + 0.30), 0.045, 0.05, "brass", collection, n=max(6, n - 2), axis="z", bevel=0.0,
        )
        parts.append(packing)
    if lod < 2:
        for sign in (-1.0, 1.0):
            leg = add_box(
                f"YokeLeg_{'P' if sign > 0 else 'S'}",
                (vc[0], vc[1] + sign * 0.07, 0.58),
                0.018, 0.016, 0.14,
                "steel", collection, bevel=0.003 if lod == 0 else 0.0,
            )
            steel_band(leg, V_STEEL_MACHINED)
            parts.append(leg)
    cross = add_box(
        "YokeCrosshead", (vc[0], vc[1], 0.70), 0.05, 0.08, 0.025, "steel", collection, bevel=0.0,
    )
    steel_band(cross, V_STEEL_MACHINED)
    stem = add_cyl(
        "Stem", (WHEEL_C[0], WHEEL_C[1], 0.62), 0.018, 0.36, "steel", collection, n=max(6, n - 2), axis="z", bevel=0.0,
    )
    steel_band(stem, V_STEEL_BRIGHT)
    parts.extend([cross, stem])
    return parts


def handwheel(collection, lod):
    n = SEG[lod]["wheel"]
    spokes_n = SEG[lod]["spokes"]
    parts = []
    cx, cy, cz = WHEEL_C
    r_out, r_in, h = WHEEL_R, WHEEL_R - 0.048, 0.026
    section = [
        (r_out, h), (r_out, -h),
        (r_in, -h), (r_in, h),
    ]
    rings = []
    for i in range(n):
        a = (i / n) * math.pi * 2.0
        ca, sa = math.cos(a), math.sin(a)
        ring = []
        for rr, zz in section:
            ring.append((cx + rr * ca, cy + rr * sa, cz + zz))
        rings.append(ring)
    # Close the sweep by repeating first ring via loft of n rings + wrap faces.
    verts = [vert for ring in rings for vert in ring]
    faces = []
    sides = len(section)
    for i in range(n):
        a = i * sides
        b = ((i + 1) % n) * sides
        for k in range(sides):
            j = (k + 1) % sides
            faces.append((a + k, a + j, b + j, b + k))
    rim = add_mesh("WheelRim", verts, faces, "steel", collection, bevel=0.004 if lod == 0 else 0.0)
    steel_band(rim, V_STEEL_MACHINED)
    parts.append(rim)
    hub = add_cyl("WheelHub", (cx, cy, cz), 0.07, 0.05, "steel", collection, n=n, axis="z", bevel=0.003 if lod == 0 else 0.0)
    steel_band(hub, V_STEEL_MACHINED)
    parts.append(hub)
    if lod == 0:
        nut = add_hex("StemNut", (cx, cy, cz + 0.032), 0.032, 0.028, "brass", collection, axis="z", bevel=0.0)
        parts.append(nut)
    for i in range(spokes_n):
        a = (i / spokes_n) * math.pi * 2.0 + 0.12
        ca, sa = math.cos(a), math.sin(a)
        mid_r = (0.085 + (WHEEL_R - 0.06)) * 0.5
        spoke = add_oriented_box(
            f"WheelSpoke_{i}",
            (cx + ca * mid_r, cy + sa * mid_r, cz),
            (ca, sa),
            0.12, 0.012, 0.010,
            "steel", collection, bevel=0.0,
        )
        steel_band(spoke, V_STEEL_MACHINED)
        parts.append(spoke)
    return parts


def gauge_assembly(collection, lod):
    """Cylindrical case, stepped bezel, recessed cream face, needle on a boss.

    Cycle 01 read as a gold torus around a black hole because a dark glass disc
    capped the face. The cream face is now the visible top; glass is a thin
    recessed ring; the needle is dark steel on a brass boss.
    """
    n = SEG[lod]["cyl"]
    gx, gy, gz = GAUGE_C
    case = loft_rings(
        "GaugeCase",
        [
            circle_ring(gx, gy, gz - 0.055, 0.112, 0.112, n, "z"),
            circle_ring(gx, gy, gz + 0.018, 0.122, 0.122, n, "z"),
            circle_ring(gx, gy, gz + 0.036, 0.122, 0.122, n, "z"),
            circle_ring(gx, gy, gz + 0.036, 0.102, 0.102, n, "z"),
        ],
        "steel", collection, bevel=0.0, cap=True,
    )
    steel_band(case, V_STEEL_MACHINED)
    parts_static = [case]
    if lod < 2:
        bezel = loft_rings(
            "GaugeBezel",
            [
                circle_ring(gx, gy, gz + 0.038, 0.126, 0.126, n, "z"),
                circle_ring(gx, gy, gz + 0.048, 0.126, 0.126, n, "z"),
                circle_ring(gx, gy, gz + 0.048, 0.108, 0.108, n, "z"),
                circle_ring(gx, gy, gz + 0.040, 0.108, 0.108, n, "z"),
            ],
            "brass", collection, bevel=0.0, cap=False,
        )
        parts_static.append(bezel)
    face = add_cyl("GaugeFace", (gx, gy, gz + 0.038), 0.104, 0.008, "face", collection, n=n, axis="z", bevel=0.0)
    parts_static.append(face)
    if lod == 0:
        glass = loft_rings(
            "GaugeGlass",
            [
                circle_ring(gx, gy, gz + 0.044, 0.106, 0.106, n, "z"),
                circle_ring(gx, gy, gz + 0.048, 0.106, 0.106, n, "z"),
                circle_ring(gx, gy, gz + 0.048, 0.092, 0.092, n, "z"),
                circle_ring(gx, gy, gz + 0.044, 0.092, 0.092, n, "z"),
            ],
            "glass", collection, bevel=0.0, cap=False,
        )
        parts_static.append(glass)
        stub = add_cyl(
            "GaugeStub", (gx, gy + 0.155, gz - 0.018), 0.022, 0.10, "brass",
            collection, n=max(6, n - 2), axis="y", bevel=0.0,
        )
        riser = add_cyl(
            "GaugeRiser", (gx, gy + 0.20, gz - 0.07), 0.020, 0.12, "brass",
            collection, n=max(6, n - 2), axis="z", bevel=0.0,
        )
        elbow = add_box("GaugeElbow", (gx, gy + 0.20, gz - 0.04), 0.024, 0.028, 0.036, "brass", collection, bevel=0.0)
        parts_static.extend([stub, riser, elbow])
    elif lod == 1:
        stub = add_cyl(
            "GaugeStub", (gx, gy + 0.14, gz - 0.02), 0.022, 0.08, "brass",
            collection, n=max(6, n - 2), axis="y", bevel=0.0,
        )
        parts_static.append(stub)
    needle = add_mesh(
        "GaugeNeedle",
        [
            (gx - 0.010, gy - 0.012, gz + 0.038),
            (gx + 0.010, gy - 0.012, gz + 0.038),
            (gx + 0.003, gy + 0.092, gz + 0.038),
            (gx - 0.003, gy + 0.092, gz + 0.038),
            (gx - 0.010, gy - 0.012, gz + 0.046),
            (gx + 0.010, gy - 0.012, gz + 0.046),
            (gx + 0.003, gy + 0.092, gz + 0.046),
            (gx - 0.003, gy + 0.092, gz + 0.046),
        ],
        BOX_FACES, "steel", collection, bevel=0.0,
    )
    steel_band(needle, V_STEEL_PLATE)
    needle_parts = [needle]
    if lod < 2:
        boss = add_cyl(
            "NeedleBoss", (gx, gy, gz + 0.044), 0.018, 0.012, "brass",
            collection, n=max(6, n - 2), axis="z", bevel=0.0,
        )
        needle_parts.append(boss)
    return parts_static, needle_parts


def hose_and_lance(collection, lod):
    """Supported hose through a hex union and packed gland, lance into +X pocket."""
    n = SEG[lod]["hose_s"]
    n_r = SEG[lod]["hose"]
    parts = []
    p0 = Vector((VALVE_C[0] + 0.22, VALVE_C[1], VALVE_C[2]))
    p1 = Vector((0.78, 0.20, 0.34))
    p2 = Vector((PLATE_X1 - 0.02, LANCE_Y, LANCE_Z))
    ctrl = [p0, p1, p2] if n_r >= 3 else [p0, p2]
    steps = max(2, n_r)
    path = []
    for i in range(steps):
        t = i / max(1, steps - 1)
        if len(ctrl) == 2:
            pt = ctrl[0].lerp(ctrl[1], t)
        else:
            pt = (1 - t) * (1 - t) * ctrl[0] + 2 * (1 - t) * t * ctrl[1] + t * t * ctrl[2]
        path.append(Vector(pt))
    rings = []
    tangents = []
    for i, pt in enumerate(path):
        if i < len(path) - 1:
            tangent = path[i + 1] - pt
        else:
            tangent = pt - path[i - 1]
        tangents.append(tangent)
        rings.append(oriented_ring(pt, tangent, 0.034, n))
    hose = loft_rings("HoseRun", rings, "rubber", collection, bevel=0.0, cap=True)
    parts.append(hose)
    if lod == 0 and len(path) >= 3:
        for i in (1, len(path) - 2):
            pt = path[i]
            tan = tangents[i]
            if tan.length < 1e-6:
                continue
            tn = tan.normalized()
            a = pt - tn * 0.012
            b = pt + tn * 0.012
            armor = loft_rings(
                f"HoseArmor_{i}",
                [oriented_ring(a, tn, 0.042, n), oriented_ring(b, tn, 0.042, n)],
                "steel", collection, bevel=0.0, cap=True,
            )
            steel_band(armor, V_STEEL_MACHINED)
            parts.append(armor)
    if lod < 2:
        u0 = add_hex("HoseUnion_In", (p0.x + 0.02, p0.y, p0.z), 0.038, 0.04, "brass", collection, axis="x", bevel=0.0)
        nipple0 = add_cyl(
            "HoseNipple_In", (p0.x - 0.02, p0.y, p0.z), 0.022, 0.04, "brass",
            collection, n=max(6, n), axis="x", bevel=0.0,
        )
        u1 = add_hex(
            "HoseUnion_Plate", (PLATE_X1 - 0.01, LANCE_Y, LANCE_Z),
            0.042, 0.05, "brass", collection, axis="x", bevel=0.0,
        )
        parts.extend([u0, nipple0, u1])
        saddle = add_box(
            "HoseSaddle", (0.80, 0.20, 0.28), 0.05, 0.045, 0.032, "steel",
            collection, bevel=0.003 if lod == 0 else 0.0,
        )
        steel_band(saddle, V_STEEL_MACHINED)
        parts.append(saddle)
    if lod == 0:
        saddle_arm = add_box("HoseSaddleArm", (0.84, 0.12, 0.22), 0.02, 0.08, 0.016, "steel", collection, bevel=0.0)
        steel_band(saddle_arm, V_STEEL_MACHINED)
        parts.append(saddle_arm)
    if lod < 2:
        gland = add_hex(
            "PackedGland", (PLATE_X1 + 0.03, LANCE_Y, LANCE_Z),
            0.048, 0.06, "brass", collection, axis="x", bevel=0.0,
        )
        parts.append(gland)
    lance = add_cyl(
        "InletLance", ((LANCE_X0 + LANCE_X1) * 0.5, LANCE_Y, LANCE_Z),
        0.026, (LANCE_X1 - LANCE_X0), "steel", collection, n=max(6, n), axis="x", bevel=0.0,
    )
    steel_band(lance, V_STEEL_BRIGHT)
    parts.append(lance)
    if lod < 2:
        guard = add_cyl(
            "LanceGuard", (LANCE_X1 - 0.04, LANCE_Y, LANCE_Z),
            0.036, 0.05, "steel", collection, n=max(6, n), axis="x", bevel=0.0,
        )
        steel_band(guard, V_STEEL_MACHINED)
        parts.append(guard)
    return parts


def lamp_assembly(collection, lod):
    """One hooded lamp, rooted on the hat top return. Small. Not the site identity."""
    n = SEG[lod]["cyl"]
    hood = loft_rings(
        "LampHood",
        [
            circle_ring(LAMP_C[0], LAMP_C[1], LAMP_C[2] - 0.028, 0.042, 0.042, n, "z"),
            circle_ring(LAMP_C[0], LAMP_C[1], LAMP_C[2] + 0.022, 0.030, 0.030, n, "z"),
        ],
        "paint", collection, bevel=0.0, cap=False,
    )
    static = [hood]
    if lod == 0:
        can = add_cyl(
            "LampCan", (LAMP_C[0], LAMP_C[1], LAMP_C[2] - 0.018), 0.024, 0.032, "steel",
            collection, n=n, axis="z", bevel=0.0,
        )
        steel_band(can, V_STEEL_MACHINED)
        static.append(can)
        standoff = add_box(
            "LampStandoff",
            (LAMP_C[0] - 0.04, LAMP_C[1], LAMP_C[2] - 0.04),
            0.04, 0.016, 0.012,
            "paint", collection, bevel=0.0,
        )
        static.append(standoff)
    glass = add_cyl(
        "LampGlass", (LAMP_C[0], LAMP_C[1], LAMP_C[2] + 0.008), 0.020, 0.012, "lamp",
        collection, n=n, axis="z", bevel=0.0,
    )
    return static, [glass]


def outlet_stub(collection, lod):
    n = SEG[lod]["cyl"]
    parts = []
    if lod >= 2:
        cap = add_cyl(
            "OutletCap", (VALVE_C[0] - 0.36, VALVE_C[1], VALVE_C[2]),
            0.07, 0.05, "steel", collection, n=n, axis="x", bevel=0.0,
        )
        steel_band(cap, V_STEEL_MACHINED)
        return [cap]
    pipe = add_cyl(
        "OutletRun", (VALVE_C[0] - 0.32, VALVE_C[1], VALVE_C[2]),
        0.045, 0.16, "steel", collection, n=n, axis="x", bevel=0.004 if lod == 0 else 0.0,
    )
    steel_band(pipe, V_STEEL_MACHINED)
    cap = add_cyl(
        "OutletCap", (VALVE_C[0] - 0.42, VALVE_C[1], VALVE_C[2]),
        0.07, 0.03, "steel", collection, n=n, axis="x", bevel=0.0,
    )
    steel_band(cap, V_STEEL_MACHINED)
    parts.extend([pipe, cap])
    if lod == 0:
        union = add_hex(
            "OutletUnion", (VALVE_C[0] - 0.28, VALVE_C[1], VALVE_C[2]),
            0.05, 0.04, "brass", collection, axis="x", bevel=0.0,
        )
        parts.append(union)
    return parts


def build_lod(lod, atlas_mat):
    object_mode()
    name = f"LOD{lod}_gas_tap"
    collection = bpy.data.collections.new(name)
    bpy.context.scene.collection.children.link(collection)
    root = add_empty(name + "_root", (0.0, 0.0, 0.0), collection, size=0.12)
    static = []
    static.extend(hat_backplate(collection, lod))
    static.extend(clamp_blocks(collection, lod))
    static.extend(valve_body(collection, lod))
    static.extend(hose_and_lance(collection, lod))
    static.extend(outlet_stub(collection, lod))
    lamp_static, lamp_glass = lamp_assembly(collection, lod)
    static.extend(lamp_static)
    wheel_parts = handwheel(collection, lod)
    gauge_static, needle_parts = gauge_assembly(collection, lod)
    static.extend(gauge_static)

    for obj in list(static) + list(wheel_parts) + list(needle_parts) + list(lamp_glass):
        finish_for_atlas(obj, atlas_mat, TEX)

    wheel_hook = add_empty("valve_wheel", Vector(WHEEL_C), collection, parent=root, size=0.10)
    needle_hook = add_empty("gauge_needle", Vector((GAUGE_C[0], GAUGE_C[1], NEEDLE_Z)), collection, parent=root, size=0.06)
    lamp_hook = add_empty("lamp", Vector(LAMP_C), collection, parent=root, size=0.05)

    static_mesh = join_group(static, f"LOD{lod}_gas_tap", root)
    wheel_mesh = join_group(wheel_parts, f"LOD{lod}_valve_wheel", wheel_hook)
    needle_mesh = join_group(needle_parts, f"LOD{lod}_gauge_needle", needle_hook)
    lamp_mesh = join_group(lamp_glass, f"LOD{lod}_lamp", lamp_hook)
    for mesh in (static_mesh, wheel_mesh, needle_mesh, lamp_mesh):
        if mesh is None:
            continue
        mesh["spacefaceLod"] = f"lod{lod}"
        mesh["spaceface"] = {"lod": f"lod{lod}"}
        quantize_mesh(mesh)

    meshes = [m for m in (static_mesh, wheel_mesh, needle_mesh, lamp_mesh) if m]
    tris = sum(tri_count(m) for m in meshes)
    bbox_min = Vector((1e9, 1e9, 1e9))
    bbox_max = Vector((-1e9, -1e9, -1e9))
    for mesh in meshes:
        for corner in mesh.bound_box:
            w = mesh.matrix_world @ Vector(corner)
            bbox_min.x = min(bbox_min.x, w.x)
            bbox_min.y = min(bbox_min.y, w.y)
            bbox_min.z = min(bbox_min.z, w.z)
            bbox_max.x = max(bbox_max.x, w.x)
            bbox_max.y = max(bbox_max.y, w.y)
            bbox_max.z = max(bbox_max.z, w.z)
    report = {
        "lod": lod,
        "triangles": int(tris),
        "budget": TRI_BUDGET[lod],
        "overBudget": tris > TRI_BUDGET[lod],
        "draws": len(meshes),
        "bbox": {
            "min": [round(bbox_min.x, 4), round(bbox_min.y, 4), round(bbox_min.z, 4)],
            "max": [round(bbox_max.x, 4), round(bbox_max.y, 4), round(bbox_max.z, 4)],
        },
        "hooks": {
            "valve_wheel": list(WHEEL_C),
            "gauge_needle": [GAUGE_C[0], GAUGE_C[1], NEEDLE_Z],
            "lamp": list(LAMP_C),
        },
        "undersideZ": round(bbox_min.z, 4),
        "tapMaxX": round(bbox_max.x, 4),
    }
    if bbox_min.z < -0.02:
        raise RuntimeError(f"LOD{lod} underside {bbox_min.z} is below z=0")
    if bbox_max.x > 1.18:
        raise RuntimeError(f"LOD{lod} occupancy tail x={bbox_max.x}")
    if bbox_max.x < 1.12:
        raise RuntimeError(f"LOD{lod} lance does not clear the plate x={bbox_max.x}")
    if abs(bbox_min.x) > 1.12 or abs(bbox_min.y) > 1.12 or abs(bbox_max.y) > 1.12:
        print(f"WARN LOD{lod} near cell edge bbox={report['bbox']}")
    if tris > TRI_BUDGET[lod]:
        raise RuntimeError(f"LOD{lod} triangles {tris} exceed budget {TRI_BUDGET[lod]}")
    return collection, report, root


def export_lod(collection, lod):
    out = SOURCE_DIR / f"gas_tap_lod{lod}.glb"
    out.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.object.select_all(action="DESELECT")
    for obj in list(collection.all_objects):
        try:
            obj.hide_viewport = False
            obj.hide_set(False)
            obj.select_set(True)
        except Exception:
            continue
        if obj.type == "MESH" and obj.data:
            obj.data.name = obj.name
            quantize_mesh(obj)
    tmp = out.with_suffix(".tmp.glb")
    bpy.ops.export_scene.gltf(
        filepath=str(tmp), export_format="GLB", use_selection=True, export_apply=True,
        export_yup=True, export_extras=True, export_animations=False,
        export_materials="EXPORT", export_texcoords=True, export_normals=True,
        export_tangents=True, export_image_format="AUTO",
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
            time.sleep(0.35 * (attempt + 1))
    sanitize_glb_floats(out)
    return out


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
            extras["spaceface"] = {
                "collision": True, "helper": True, "nonRender": True,
                "role": "collision", "kind": "box",
            }
            node["extras"] = extras
    _write_glb(path, gltf, rest)


def _world_loc(obj):
    return obj.matrix_world.translation.copy()


def _strip_dup(name: str) -> str:
    if "." in name:
        stem, suffix = name.rsplit(".", 1)
        if suffix.isdigit():
            return stem
    return name


def _import_lod(path: Path, lod: int):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=str(path))
    imported = [obj for obj in bpy.data.objects if obj not in before]
    for obj in imported:
        obj["sf_import_lod"] = lod
    return imported


def combine_lods():
    reset_scene()
    lod_paths = [SOURCE_DIR / f"gas_tap_lod{lod}.glb" for lod in (0, 1, 2)]
    for path in lod_paths:
        if not path.exists():
            raise FileNotFoundError(f"missing LOD source {path}")
    root = bpy.data.objects.new(ROOT_NAME, None)
    bpy.context.scene.collection.objects.link(root)
    root.empty_display_type = "PLAIN_AXES"
    root.empty_display_size = 0.12
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
                if raw in HOOK_NAMES:
                    obj.name = raw
                    sockets[raw] = obj
                    obj["socket"] = True
                    obj["spacefaceSocket"] = True
                    parent_keep(obj, root)
        # Reparent every mesh while its imported LOD hook hierarchy still
        # exists.  Removing imported empties first can invalidate the mesh
        # world transform and produce a doubled counter-translation beneath
        # the shared hook in the combined GLB.
        for obj in [candidate for candidate in imported if candidate.type == "MESH"]:
            raw = obj["_sf_raw"]
            if raw.startswith(f"LOD{lod}_"):
                obj.name = raw
            else:
                obj.name = f"LOD{lod}_{raw}"
            obj["spacefaceLod"] = f"lod{lod}"
            obj["spaceface"] = {"lod": f"lod{lod}"}
            lod_tri[lod] += tri_count(obj)
            mesh_names.append(obj.name)
            parent = root
            if "valve_wheel" in raw:
                parent = sockets.get("valve_wheel") or root
            elif "gauge_needle" in raw:
                parent = sockets.get("gauge_needle") or root
            elif raw.endswith("_lamp") or raw == f"LOD{lod}_lamp":
                parent = sockets.get("lamp") or root
            parent_keep(obj, parent)
        if lod > 0:
            for obj in [candidate for candidate in imported if candidate.type != "MESH"]:
                try:
                    bpy.data.objects.remove(obj, do_unlink=True)
                except Exception:
                    pass
    for hook in HOOK_NAMES:
        if hook not in sockets:
            loc = {
                "valve_wheel": Vector(WHEEL_C),
                "gauge_needle": Vector((GAUGE_C[0], GAUGE_C[1], NEEDLE_Z)),
                "lamp": Vector(LAMP_C),
            }[hook]
            sockets[hook] = add_empty(hook, loc, bpy.context.scene.collection, parent=root)
    chull = bpy.data.objects.new("COLLISION_HULL", None)
    bpy.context.scene.collection.objects.link(chull)
    chull.empty_display_type = "CUBE"
    chull.empty_display_size = 1.0
    chull.scale = Vector((0.55, 0.90, 0.50))
    chull.location = Vector((0.60, 0.0, 0.48))
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
        "rootName": ROOT_NAME,
        "slot": "place",
        "category": "works",
        "family": "asteroid_works",
        "packet": PACKET,
        "role": "wall-mounted gas-pocket tap manifold",
        "forward": "+X",
        "up": "+Y",
        "starboard": "+Z",
        "unit": "metre",
        "normalConvention": "OpenGL",
        "ormChannels": "R=AO,G=Roughness,B=Metallic",
        "textureCompression": "PNG-source",
        "textureAuthorship": "deterministic 4x4 atlas PBR (paint/steel/brass/rubber/face/glass/lamp)",
        "textureSize": 1024,
        "deliverableRole": "source_candidate",
        "productionState": "design_candidate",
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
        "hookAxes": {
            "valve_wheel": {"pivot": "hub centre", "localAxis": "+Z stem", "motion": "spin about local +Z"},
            "gauge_needle": {"pivot": "face centre", "localAxis": "+Z face normal", "motion": "rotate in face plane; rest +Y"},
            "lamp": {"pivot": "glass centre", "localAxis": "+Z hood", "motion": "emissive slot"},
        },
        "wiringStatus": "source_candidate_unwired",
        "blenderBasis": "Z-up works scale",
        "exportBasis": "Y-up glTF",
        "cycle": CYCLE,
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
    combined_works = SOURCE_DIR / "gas_tap.glb"
    combined_parts = PARTS_DIR / COMBINED_NAME
    tmp = SOURCE_DIR / "gas_tap.tmp.glb"
    bpy.ops.export_scene.gltf(
        filepath=str(tmp), export_format="GLB", use_selection=True, export_apply=True,
        export_yup=True, export_extras=True, export_animations=False,
        export_materials="EXPORT", export_texcoords=True, export_normals=True,
        export_tangents=True, export_image_format="AUTO",
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
        "meshNames": sorted(mesh_names),
        "bytes": combined_works.stat().st_size,
        "sha256": sha256(combined_works),
        "cycle": CYCLE,
        "state": "design_candidate",
    }
    (SOURCE_DIR / "gas_tap_inventory.json").write_text(
        json.dumps(inventory, indent=2) + "\n", encoding="utf-8", newline="\n",
    )
    print(json.dumps({"ok": True, **inventory}, indent=2))
    try:
        bpy.ops.wm.save_as_mainfile(filepath=str(BLEND_SOURCE))
    except Exception as exc:
        print(f"WARN could not save blend: {exc}")
    return inventory, contract


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
    bpy.ops.mesh.primitive_plane_add(size=2.4, location=(0, 0, -0.002))
    pad = bpy.context.object
    pad.name = "MinePad"
    pad_mat = bpy.data.materials.new("MinePadMat")
    pad_mat.use_nodes = True
    pad_bsdf = next(n for n in pad_mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    pad_bsdf.inputs["Base Color"].default_value = (0.036, 0.032, 0.028, 1)
    pad_bsdf.inputs["Roughness"].default_value = 0.90
    pad_bsdf.inputs["Metallic"].default_value = 0.02
    pad.data.materials.append(pad_mat)
    # Rock wall at +X. Inner face at WALL_INNER_X so clamp standoff and the
    # lance pocket both read. A boolean cylinder cuts the gas pocket.
    wall_hx = 0.16
    bpy.ops.mesh.primitive_cube_add(location=(WALL_INNER_X + wall_hx, 0.0, 0.55))
    wall = bpy.context.object
    wall.name = "RockWall"
    wall.scale = (wall_hx, 1.15, 0.70)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    wall_mat = bpy.data.materials.new("RockWallMat")
    wall_mat.use_nodes = True
    wbsdf = next(n for n in wall_mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    wbsdf.inputs["Base Color"].default_value = (0.10, 0.09, 0.075, 1)
    wbsdf.inputs["Roughness"].default_value = 0.94
    wbsdf.inputs["Metallic"].default_value = 0.02
    wall.data.materials.append(wall_mat)
    bpy.ops.mesh.primitive_cylinder_add(
        radius=0.075, depth=0.50,
        location=(WALL_INNER_X + 0.10, LANCE_Y, LANCE_Z),
        rotation=(0.0, math.pi * 0.5, 0.0),
    )
    cutter = bpy.context.object
    cutter.name = "PocketCutter"
    bool_mod = wall.modifiers.new("Pocket", "BOOLEAN")
    bool_mod.operation = "DIFFERENCE"
    bool_mod.object = cutter
    bpy.context.view_layer.objects.active = wall
    try:
        bpy.ops.object.modifier_apply(modifier="Pocket")
    except Exception:
        pass
    bpy.data.objects.remove(cutter, do_unlink=True)
    # Top-open slot so the works_top camera sees the lance enter the pocket
    # instead of dying under the wall's roof.
    bpy.ops.mesh.primitive_cube_add(location=(WALL_INNER_X + 0.10, LANCE_Y, 0.78))
    slot = bpy.context.object
    slot.name = "PocketSlot"
    slot.scale = (0.14, 0.09, 0.55)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    slot_mod = wall.modifiers.new("PocketSlot", "BOOLEAN")
    slot_mod.operation = "DIFFERENCE"
    slot_mod.object = slot
    bpy.context.view_layer.objects.active = wall
    try:
        bpy.ops.object.modifier_apply(modifier="PocketSlot")
    except Exception:
        pass
    bpy.data.objects.remove(slot, do_unlink=True)
    bpy.ops.mesh.primitive_cylinder_add(
        radius=0.070, depth=0.03,
        location=(WALL_INNER_X + 0.28, LANCE_Y, LANCE_Z),
        rotation=(0.0, math.pi * 0.5, 0.0),
    )
    pocket_back = bpy.context.object
    pocket_back.name = "PocketBack"
    back_mat = bpy.data.materials.new("PocketBackMat")
    back_mat.use_nodes = True
    bbsdf = next(n for n in back_mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    bbsdf.inputs["Base Color"].default_value = (0.025, 0.022, 0.018, 1)
    bbsdf.inputs["Roughness"].default_value = 0.96
    pocket_back.data.materials.append(back_mat)
    cam_data = bpy.data.cameras.new("WorksCam")
    camera = bpy.data.objects.new("WorksCam", cam_data)
    scene.collection.objects.link(camera)
    scene.camera = camera
    reach = 4.0
    for name, loc, energy, color, angle in (
        ("Key", (-1.15 * reach, -0.78 * reach, 0.54 * reach), 7.2, (1.00, 0.863, 0.737), 18.0),
        ("Rim", (0.22 * reach, 1.45 * reach, 0.30 * reach), 2.20, (0.616, 0.722, 0.941), 25.0),
        ("Fill", (1.12 * reach, 0.46 * reach, 0.50 * reach), 2.40, (0.847, 0.765, 0.659), 30.0),
        ("Grazing", (0.20 * reach, -2.10 * reach, 0.22 * reach), 6.4, (1.00, 0.90, 0.78), 8.0),
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
        look_at(obj, (0.55, 0.0, 0.4))
    return camera, pad, wall


def make_override_mat(name, color, emit=0.0, roughness=0.5, metallic=0.0):
    mat = bpy.data.materials.new(name)
    bsdf = principled(mat)
    bsdf.inputs["Base Color"].default_value = (*color, 1)
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Metallic"].default_value = metallic
    if emit > 0 and "Emission Color" in bsdf.inputs:
        bsdf.inputs["Emission Color"].default_value = (*color, 1)
        bsdf.inputs["Emission Strength"].default_value = emit
    return mat


def override_mats(meshes, maker):
    backups = {}
    for obj in meshes:
        backups[obj.name] = [slot.material for slot in obj.material_slots]
        mat = maker(obj)
        if obj.material_slots:
            obj.material_slots[0].material = mat
        else:
            obj.data.materials.append(mat)
    return backups


def restore_mats(meshes, backups):
    for obj in meshes:
        mats = backups.get(obj.name)
        if not mats:
            continue
        if obj.material_slots:
            obj.material_slots[0].material = mats[0]
        elif mats[0]:
            obj.data.materials.append(mats[0])


def render_stills(glb_path: Path, still_dir: Path, registers=("close", "site")):
    print(f"render registers={registers} from {glb_path.name}")
    reset_scene()
    bpy.ops.import_scene.gltf(filepath=str(glb_path))
    camera, pad, wall = setup_mine_lights()
    meshes = [
        obj for obj in bpy.data.objects
        if obj.type == "MESH" and obj.name not in {"MinePad", "RockWall", "PocketBack", "PocketCutter"}
    ]
    still_dir.mkdir(parents=True, exist_ok=True)

    def snap(name, framing, edge_dir=(1.0, 0.0), samples=None, hide_wall=False):
        scene = bpy.context.scene
        if samples is not None and hasattr(scene, "eevee"):
            try:
                scene.eevee.taa_render_samples = int(samples)
            except Exception:
                pass
        wall.hide_render = hide_wall
        pose = apply_works_camera(camera, framing=framing, focus=(0.62, 0.0, 0.42), edge_dir=edge_dir)
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
        wall.hide_render = False
        return str(path)

    paths = {}
    if "close" in registers:
        paths["works_top"] = snap("works_top.png", "works_top")
        paths["works_edge"] = snap("works_edge.png", "works_edge", edge_dir=(1.0, 0.0))
        clay = make_override_mat("Clay", (0.62, 0.62, 0.62), roughness=0.55, metallic=0.0)
        backups = override_mats(meshes, lambda _o: clay)
        paths["works_top_clay"] = snap("works_top_clay.png", "works_top")
        paths["works_edge_clay"] = snap("works_edge_clay.png", "works_edge", edge_dir=(1.0, 0.0))
        restore_mats(meshes, backups)
        graz = bpy.data.objects.get("Grazing")
        key = bpy.data.objects.get("Key")
        if graz:
            graz.data.energy = 10.0
        if key:
            key.data.energy = 1.6
        paths["grazing"] = snap("grazing.png", "works_top")
        if graz:
            graz.data.energy = 6.4
        if key:
            key.data.energy = 7.2
    if "site" in registers:
        paths["works_site"] = snap("works_site.png", "works_site", hide_wall=False)
        clay = make_override_mat("ClaySite", (0.62, 0.62, 0.62), roughness=0.55)
        backups = override_mats(meshes, lambda _o: clay)
        paths["works_site_clay"] = snap("works_site_clay.png", "works_site")
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
    wall.hide_render = True
    if "close" in registers:
        def id_mat(obj):
            role = "steel"
            name = obj.name.lower()
            for key in ATLAS_TILE:
                if key in name:
                    role = key
                    break
            mat_name = obj.data.materials[0].name.lower() if obj.data.materials and obj.data.materials[0] else ""
            for key in ATLAS_TILE:
                if key in mat_name:
                    role = key
                    break
            col = ROLE_FLAT.get(role, (0.5, 0.5, 0.5))
            return make_override_mat(f"ID_{obj.name}", col, emit=1.0, roughness=1.0)
        id_back = override_mats(meshes, id_mat)
        paths["material_id"] = snap("material_id.png", "works_top", samples=1)
        restore_mats(meshes, id_back)

        nmat = bpy.data.materials.new("NormalIso")
        nmat.use_nodes = True
        nt = nmat.node_tree
        nt.nodes.clear()
        out = nt.nodes.new("ShaderNodeOutputMaterial")
        em = nt.nodes.new("ShaderNodeEmission")
        geo = nt.nodes.new("ShaderNodeNewGeometry")
        mapr = nt.nodes.new("ShaderNodeVectorMath")
        mapr.operation = "MULTIPLY_ADD"
        mapr.inputs[1].default_value = (0.5, 0.5, 0.5)
        mapr.inputs[2].default_value = (0.5, 0.5, 0.5)
        nt.links.new(geo.outputs["Normal"], mapr.inputs[0])
        nt.links.new(mapr.outputs["Vector"], em.inputs["Color"])
        em.inputs["Strength"].default_value = 1.0
        nt.links.new(em.outputs["Emission"], out.inputs["Surface"])
        nback = override_mats(meshes, lambda _o: nmat)
        paths["normal_isolation"] = snap("normal_isolation.png", "works_top", samples=1)
        restore_mats(meshes, nback)

        def orm_mat(obj):
            src = obj.data.materials[0] if obj.data.materials else None
            mat = bpy.data.materials.new(f"ORM_{obj.name}")
            bsdf = principled(mat)
            if src and src.use_nodes:
                for node in src.node_tree.nodes:
                    if node.type == "TEX_IMAGE" and node.image and "orm" in (node.image.name or "").lower():
                        tex = mat.node_tree.nodes.new("ShaderNodeTexImage")
                        tex.image = node.image
                        em = mat.node_tree.nodes.new("ShaderNodeEmission")
                        mat.node_tree.links.new(tex.outputs["Color"], em.inputs["Color"])
                        outn = next(n for n in mat.node_tree.nodes if n.type == "OUTPUT_MATERIAL")
                        mat.node_tree.links.new(em.outputs["Emission"], outn.inputs["Surface"])
                        return mat
            bsdf.inputs["Base Color"].default_value = (0.5, 0.5, 0.5, 1)
            return mat
        oback = override_mats(meshes, orm_mat)
        paths["orm_isolation"] = snap("orm_isolation.png", "works_top", samples=1)
        restore_mats(meshes, oback)

        # Hook identity: emission markers at the three pivots.
        for hook_name, col in (("valve_wheel", (1, 0.2, 0.1)), ("gauge_needle", (0.2, 1, 0.3)), ("lamp", (1, 0.9, 0.2))):
            empty = bpy.data.objects.get(hook_name)
            loc = empty.matrix_world.translation if empty else Vector((0, 0, 0))
            bpy.ops.mesh.primitive_uv_sphere_add(radius=0.035, location=loc)
            mark = bpy.context.object
            mark.name = f"HookMark_{hook_name}"
            mm = make_override_mat(f"Hook_{hook_name}", col, emit=4.0, roughness=1.0)
            mark.data.materials.append(mm)
        paths["hooks_identity"] = snap("hooks_identity.png", "works_top")
        for obj in list(bpy.data.objects):
            if obj.name.startswith("HookMark_"):
                bpy.data.objects.remove(obj, do_unlink=True)

    scene.view_settings.view_transform = vt
    try:
        scene.view_settings.look = look
    except TypeError:
        pass
    scene.view_settings.exposure = exposure
    if hasattr(scene, "eevee"):
        try:
            scene.eevee.taa_render_samples = 32
        except Exception:
            pass
    return paths


def save_nn_crop(src_png: Path, dest_png: Path, half_px: int, scale: int = 1, center=None) -> str:
    """Diagnostic nearest-neighbour crop. Not a review still. Never writes cycle_001."""
    dest_png.parent.mkdir(parents=True, exist_ok=True)
    img = bpy.data.images.load(str(src_png))
    w, h = img.size
    pixels = np.array(img.pixels[:], dtype=np.float32).reshape((h, w, img.channels))
    if pixels.shape[2] == 3:
        pixels = np.concatenate([pixels, np.ones((h, w, 1), dtype=np.float32)], axis=2)
    if center is None:
        cx, cy = w // 2, h // 2
    else:
        cx, cy = int(center[0]), int(center[1])
    x0, x1 = max(0, cx - half_px), min(w, cx + half_px)
    y0, y1 = max(0, cy - half_px), min(h, cy + half_px)
    crop = pixels[y0:y1, x0:x1]
    if scale > 1:
        crop = np.repeat(np.repeat(crop, scale, axis=0), scale, axis=1)
    ch, cw = crop.shape[:2]
    name = f"diag_{dest_png.stem}"
    if name in bpy.data.images:
        bpy.data.images.remove(bpy.data.images[name])
    out = bpy.data.images.new(name, width=cw, height=ch, alpha=True)
    out.pixels.foreach_set(np.ascontiguousarray(crop, dtype=np.float32).ravel())
    tmp = dest_png.with_suffix(".tmp.png")
    out.filepath_raw = str(tmp)
    out.file_format = "PNG"
    out.save()
    bpy.data.images.remove(out)
    bpy.data.images.remove(img)
    if dest_png.exists():
        dest_png.unlink()
    tmp.replace(dest_png)
    sanitize_png(dest_png)
    return str(dest_png.relative_to(ROOT)).replace("\\", "/")


def write_diagnostics(stills: dict) -> dict:
    DIAG_DIR.mkdir(parents=True, exist_ok=True)
    out = {}
    top = stills.get("works_top")
    if top:
        out["works_top_crop"] = save_nn_crop(Path(top), DIAG_DIR / "works_top_crop.png", 110, 2)
        clay = stills.get("works_top_clay")
        if clay:
            out["works_top_clay_crop"] = save_nn_crop(Path(clay), DIAG_DIR / "works_top_clay_crop.png", 110, 2)
    site = stills.get("works_site")
    if site:
        out["works_site_nn8"] = save_nn_crop(Path(site), DIAG_DIR / "works_site_nn8.png", 16, 8)
        site_clay = stills.get("works_site_clay")
        if site_clay:
            out["works_site_clay_nn8"] = save_nn_crop(Path(site_clay), DIAG_DIR / "works_site_clay_nn8.png", 16, 8)
    edge = stills.get("works_edge")
    if edge:
        # works_edge parks the object near the right of the 1920-wide frame.
        out["works_edge_crop"] = save_nn_crop(
            Path(edge), DIAG_DIR / "works_edge_crop.png", 110, 2, center=(1770, 540),
        )
        clay_edge = stills.get("works_edge_clay")
        if clay_edge:
            out["works_edge_clay_crop"] = save_nn_crop(
                Path(clay_edge), DIAG_DIR / "works_edge_clay_crop.png", 110, 2, center=(1770, 540),
            )
    return out


def assert_cycle01_frozen() -> dict:
    missing = []
    mismatch = []
    for name, expected in CYCLE01_FREEZE.items():
        path = CYCLE01_DIR / name
        if not path.exists():
            missing.append(name)
            continue
        got = sha256(path)
        if got != expected:
            mismatch.append({"file": name, "expected": expected, "got": got})
    if missing or mismatch:
        raise RuntimeError(f"Cycle 01 evidence must stay frozen: missing={missing} mismatch={mismatch}")
    return {"ok": True, "files": len(CYCLE01_FREEZE)}


def inspect_glb(path: Path) -> dict:
    gltf, _rest = _read_glb(path)
    nodes = gltf.get("nodes") or []
    names = [n.get("name") for n in nodes]
    root = next((n for n in nodes if n.get("name") == ROOT_NAME), None)
    hooks = {name: any(n.get("name") == name and n.get("mesh") is None for n in nodes) for name in HOOK_NAMES}
    lods = {f"LOD{i}_gas_tap": any((n.get("name") or "").startswith(f"LOD{i}_gas_tap") for n in nodes) for i in (0, 1, 2)}
    extras = ((gltf.get("asset") or {}).get("extras") or {})
    report = {
        "path": str(path.relative_to(ROOT)).replace("\\", "/"),
        "sha256": sha256(path),
        "bytes": path.stat().st_size,
        "rootPresent": root is not None,
        "rootName": ROOT_NAME,
        "hooks": hooks,
        "lodRoots": lods,
        "nodeCount": len(nodes),
        "nodeNames": names,
        "assetId": extras.get("assetId"),
    }
    missing = [k for k, v in hooks.items() if not v]
    if not report["rootPresent"]:
        raise RuntimeError(f"missing root {ROOT_NAME}")
    if missing:
        raise RuntimeError(f"missing hooks {missing}")
    if not all(lods.values()):
        raise RuntimeError(f"missing LOD roots {lods}")
    return report


def _rel(path_like) -> str:
    path = Path(path_like)
    try:
        return str(path.resolve().relative_to(ROOT)).replace("\\", "/")
    except Exception:
        return str(path).replace("\\", "/")


def write_hashes(inventory, lod_reports, stills, inspect, diagnostics=None):
    stills_rel = {k: _rel(v) for k, v in (stills or {}).items()}
    diag_rel = {k: _rel(v) for k, v in (diagnostics or {}).items()}
    evidence_paths = [Path(path) for path in (stills or {}).values()]
    evidence_paths.extend(ROOT / rel for rel in diag_rel.values())
    payload = {
        "packet": PACKET,
        "cycle": CYCLE,
        "state": "design_candidate",
        "rootName": ROOT_NAME,
        "assetId": ASSET_ID,
        "builder": "tools/blender/build_works_gas_tap.py",
        "inventory": inventory,
        "lodReports": lod_reports,
        "stills": stills_rel,
        "diagnostics": diag_rel,
        "evidenceSha256": {
            _rel(path): sha256(path) for path in sorted(evidence_paths, key=lambda item: _rel(item))
        },
        "cycle01Freeze": CYCLE01_FREEZE,
        "inspect": inspect,
        "textures": {
            p.name: sha256(p) for p in sorted(TEX_DIR.glob("*.png"))
        } if TEX_DIR.exists() else {},
        "maps": {
            "basecolor": "assets/works/gas_tap/source/textures/gas_tap_atlas_basecolor.png",
            "normal": "assets/works/gas_tap/source/textures/gas_tap_atlas_normal.png",
            "orm": "assets/works/gas_tap/source/textures/gas_tap_atlas_orm.png",
            "size": 1024,
        },
        "shadeAngleDeg": SHADE_ANGLE_DEG,
        "triBudget": TRI_BUDGET,
    }
    out = FAMILY / "HASHES.json"
    out.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8", newline="\n")
    return payload


def reports_from_lod_files():
    """Measure existing LOD GLBs without rebuilding geometry.

    The Blender glTF importer round-trips export_yup back to authoring Z-up.
    """
    reports = []
    for lod in (0, 1, 2):
        path = SOURCE_DIR / f"gas_tap_lod{lod}.glb"
        if not path.exists():
            raise FileNotFoundError(path)
        reset_scene()
        bpy.ops.import_scene.gltf(filepath=str(path))
        meshes = [obj for obj in bpy.data.objects if obj.type == "MESH"]
        tris = sum(tri_count(m) for m in meshes)
        bbox_min = Vector((1e9, 1e9, 1e9))
        bbox_max = Vector((-1e9, -1e9, -1e9))
        for mesh in meshes:
            for corner in mesh.bound_box:
                wpt = mesh.matrix_world @ Vector(corner)
                bbox_min.x = min(bbox_min.x, wpt.x)
                bbox_min.y = min(bbox_min.y, wpt.y)
                bbox_min.z = min(bbox_min.z, wpt.z)
                bbox_max.x = max(bbox_max.x, wpt.x)
                bbox_max.y = max(bbox_max.y, wpt.y)
                bbox_max.z = max(bbox_max.z, wpt.z)
        report = {
            "lod": lod,
            "triangles": int(tris),
            "budget": TRI_BUDGET[lod],
            "overBudget": tris > TRI_BUDGET[lod],
            "draws": len(meshes),
            "bbox": {
                "min": [round(bbox_min.x, 4), round(bbox_min.y, 4), round(bbox_min.z, 4)],
                "max": [round(bbox_max.x, 4), round(bbox_max.y, 4), round(bbox_max.z, 4)],
            },
            "hooks": {
                "valve_wheel": list(WHEEL_C),
                "gauge_needle": [GAUGE_C[0], GAUGE_C[1], NEEDLE_Z],
                "lamp": list(LAMP_C),
            },
            "undersideZ": round(bbox_min.z, 4),
            "tapMaxX": round(bbox_max.x, 4),
            "path": str(path.relative_to(ROOT)).replace("\\", "/"),
            "bytes": path.stat().st_size,
            "sha256": sha256(path),
        }
        reports.append(report)
    return reports


def parse_args(argv):
    combine_only = False
    inspect_only = False
    evidence_only = False
    reports_only = False
    for tok in argv:
        if tok == "--combine-only":
            combine_only = True
        elif tok == "--inspect":
            inspect_only = True
        elif tok == "--evidence-only":
            evidence_only = True
        elif tok == "--reports-from-lods":
            reports_only = True
    return combine_only, inspect_only, evidence_only, reports_only


def rebuild_lods():
    FAMILY.mkdir(parents=True, exist_ok=True)
    TEX_DIR.mkdir(parents=True, exist_ok=True)
    reports = []
    reset_scene()
    maps, atlas_mat, _mapping = create_atlas()
    atlas_paths = [TEX_DIR / "gas_tap_atlas_basecolor.png", TEX_DIR / "gas_tap_atlas_orm.png", TEX_DIR / "gas_tap_atlas_normal.png"]
    for lod in (0, 1, 2):
        reset_scene()
        # Recreate atlas images in this scene from the saved PNGs.
        loaded = []
        for path, cs in zip(atlas_paths, ("sRGB", "Non-Color", "Non-Color")):
            img = bpy.data.images.load(str(path))
            img.colorspace_settings.name = cs
            loaded.append(img)
        material = bpy.data.materials.new(f"Material_GasTapAtlas_LOD{lod}")
        bsdf = principled(material)
        wire_atlas(material, bsdf, loaded)
        material["spacefaceRole"] = "atlas"
        collection, report, _root = build_lod(lod, material)
        output = export_lod(collection, lod)
        report.update({
            "path": str(output.relative_to(ROOT)).replace("\\", "/"),
            "bytes": output.stat().st_size,
            "sha256": sha256(output),
        })
        reports.append(report)
        print(json.dumps({"lod": lod, "triangles": report["triangles"], "bytes": report["bytes"]}, indent=2))
    return reports


def main(argv=None):
    argv = list(sys.argv if argv is None else argv)
    if "--" in argv:
        argv = argv[argv.index("--") + 1:]
    combine_only, inspect_only, evidence_only, reports_only = parse_args(argv)
    SOURCE_DIR.mkdir(parents=True, exist_ok=True)
    EVIDENCE_DIR.mkdir(parents=True, exist_ok=True)
    PARTS_DIR.mkdir(parents=True, exist_ok=True)

    if reports_only:
        reports = reports_from_lod_files()
        inv_path = SOURCE_DIR / "gas_tap_inventory.json"
        inventory = json.loads(inv_path.read_text(encoding="utf-8")) if inv_path.exists() else {}
        inventory["lodReports"] = reports
        inv_path.write_text(json.dumps(inventory, indent=2) + "\n", encoding="utf-8", newline="\n")
        hashes_path = FAMILY / "HASHES.json"
        payload = json.loads(hashes_path.read_text(encoding="utf-8")) if hashes_path.exists() else {}
        payload["lodReports"] = reports
        payload["inventory"] = inventory
        hashes_path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8", newline="\n")
        print(json.dumps(reports, indent=2))
        return 0

    if inspect_only:
        path = PARTS_DIR / COMBINED_NAME
        report = inspect_glb(path)
        freeze = assert_cycle01_frozen()
        print(json.dumps({"inspect": report, "cycle01Freeze": freeze}, indent=2))
        return 0

    freeze = assert_cycle01_frozen()
    existing_reports = None
    inv_path = SOURCE_DIR / "gas_tap_inventory.json"
    if inv_path.exists():
        try:
            existing_reports = json.loads(inv_path.read_text(encoding="utf-8")).get("lodReports")
        except Exception:
            existing_reports = None
    reports = None
    if not combine_only and not evidence_only:
        reports = rebuild_lods()
    inventory, contract = combine_lods()
    if reports:
        inventory["lodReports"] = reports
    elif existing_reports:
        inventory["lodReports"] = existing_reports
    if inventory.get("lodReports"):
        (SOURCE_DIR / "gas_tap_inventory.json").write_text(
            json.dumps(inventory, indent=2) + "\n", encoding="utf-8", newline="\n",
        )

    stills = {}
    stills.update(render_stills(SOURCE_DIR / "gas_tap_lod0.glb", EVIDENCE_DIR, registers=("close",)))
    stills.update(render_stills(SOURCE_DIR / "gas_tap_lod1.glb", EVIDENCE_DIR, registers=("site",)))
    diagnostics = write_diagnostics(stills)
    inspect = inspect_glb(PARTS_DIR / COMBINED_NAME)
    payload = write_hashes(
        inventory, reports or inventory.get("lodReports"), stills, inspect, diagnostics,
    )
    print(json.dumps({
        "stills": stills,
        "diagnostics": diagnostics,
        "inspect": inspect,
        "cycle01Freeze": freeze,
        "hashes": str((FAMILY / "HASHES.json").relative_to(ROOT)).replace("\\", "/"),
    }, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

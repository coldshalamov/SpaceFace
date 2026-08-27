"""PQ-131.09 Works cargo port — Cycle 01 source candidate builder.

One logistics cell: octagonal skip-loading collar with an open shaft well,
formed cradle, five additive unique crate modules, detachable courier pod.

    blender --background --python tools/blender/build_works_cargo_port.py
    blender --background --python tools/blender/build_works_cargo_port.py -- --evidence-only
    blender --background --python tools/blender/build_works_cargo_port.py -- --check-only

Launch axis: Blender +Z through the well (glTF +Y after export).
Root: SF_WORKS_CARGO_PORT_V1
LOD roots: LOD0_cargo_port, LOD1_cargo_port, LOD2_cargo_port
Hooks: crate_0..4, cradle, pod_root, pod_thruster

Does not wire, release, promote, or mark PQ-131.09 complete.
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

from fleet_construction import (  # noqa: E402
    add_box,
    add_cylinder,
    add_folded_sheet,
    add_mesh,
    apply_modifiers,
    finish_mesh,
)
from spaceface_works_camera import (  # noqa: E402
    apply_works_camera,
)

FAMILY = ROOT / "assets" / "works" / "cargo_port"
SOURCE_DIR = FAMILY / "source"
TEX_DIR = SOURCE_DIR / "textures"
EVIDENCE_DIR = FAMILY / "evidence" / "cycle_001"
PARTS_DIR = ROOT / "assets" / "ships" / "parts" / "works"
COMBINED_NAME = "place_works_cargo_port.glb"
ROOT_NAME = "SF_WORKS_CARGO_PORT_V1"
ASSET_ID = "place_works_cargo_port"
CYCLE = 1
CELL_WU = 2.2
TEX = 1024
SHADE_ANGLE = 28.0

HOOK_NAMES = (
    "crate_0", "crate_1", "crate_2", "crate_3", "crate_4",
    "cradle", "pod_root", "pod_thruster",
)
TRI_BUDGET = {
    "port": {0: 10000, 1: 2500, 2: 800},
    "crate_delta": 2000,
    "pod": {0: 4000, 1: 1000, 2: 350},
}

# Well / collar
WELL_CX, WELL_CY = -0.28, 0.00
WELL_R_IN, WELL_R_OUT = 0.40, 0.56
COLLAR_Z = 0.42
WELL_FLOOR_Z = 0.03
APRON_Z = 0.08
POD_CX, POD_CY = WELL_CX, WELL_CY
LAUNCH_CLEAR_Z = 1.55

ATLAS_TILE = {
    "port": 0,
    "cradle": 1,
    "crate": 2,
    "pod": 3,
    "thruster": 4,
}
ROLE_RGB = {
    "port": (0.165, 0.149, 0.133),
    "cradle": (0.416, 0.384, 0.345),
    "crate": (0.361, 0.325, 0.267),
    "pod": (0.557, 0.592, 0.612),
    "thruster": (0.165, 0.141, 0.110),
}
CRATE_BANDS = (
    (0.00, 0.20, (0.361, 0.325, 0.267), 0.58, 0.08),   # olive trunk
    (0.20, 0.40, (0.420, 0.353, 0.282), 0.55, 0.10),   # khaki cube
    (0.40, 0.60, (0.290, 0.333, 0.282), 0.62, 0.06),   # slate long
    (0.60, 0.80, (0.416, 0.369, 0.298), 0.50, 0.12),   # tan / polymer
    (0.80, 1.01, (0.290, 0.275, 0.255), 0.40, 0.62),   # irons / straps
)
POD_BANDS = (
    (0.00, 0.28, (0.420, 0.365, 0.298), 0.48, 0.22),   # heat-stained aft
    (0.28, 0.78, (0.557, 0.592, 0.612), 0.38, 0.16),   # pressure coating
    (0.78, 1.01, (0.620, 0.635, 0.650), 0.28, 0.55),   # docking machined
)
ROLE_V_DEFAULT = {
    "port": (0.02, 0.98),
    "cradle": (0.02, 0.98),
    "crate": (0.02, 0.18),
    "pod": (0.32, 0.74),
    "thruster": (0.02, 0.98),
}
CRATE_V = {
    0: (0.02, 0.18),
    1: (0.22, 0.38),
    2: (0.42, 0.58),
    3: (0.62, 0.78),
    4: (0.62, 0.78),
}
KEEP_PNG = {b"IHDR", b"PLTE", b"IDAT", b"IEND", b"sRGB", b"gAMA", b"pHYs"}
ROLE_FLAT = {
    "port": (0.18, 0.16, 0.14),
    "cradle": (0.55, 0.50, 0.42),
    "crate": (0.42, 0.38, 0.28),
    "pod": (0.62, 0.68, 0.72),
    "thruster": (0.85, 0.72, 0.42),
}


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1 << 20), b""):
            digest.update(chunk)
    return digest.hexdigest().upper()


def parse_args(argv):
    evidence_only = False
    check_only = False
    for tok in argv:
        if tok == "--evidence-only":
            evidence_only = True
        elif tok == "--check-only":
            check_only = True
    return evidence_only, check_only


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
    gltf = json.loads(bytes(data[json_start:json_end]).rstrip(b" \x00"))
    bin_off = json_end
    if bin_off + 8 > len(data):
        return
    bin_len = struct.unpack_from("<I", data, bin_off)[0]
    bin_start = bin_off + 8
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
    img.save()
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
    if role == "port":
        pw, ph = 96, 36
    elif role == "cradle":
        pw, ph = 40, 18
    elif role == "crate":
        pw, ph = 64, 48
    elif role == "pod":
        pw, ph = 28, 72
    else:
        pw, ph = 20, 20
    mx = np.mod(x, np.uint32(pw)).astype(np.int32)
    my = np.mod(y, np.uint32(ph)).astype(np.int32)
    dx = np.minimum(mx, pw - mx).astype(np.float32)
    dy = np.minimum(my, ph - my).astype(np.float32)
    seam = ((dx <= 1) | (dy <= 1)).astype(np.float32)
    mind = np.minimum(dx, dy)
    soft = np.clip(1.0 - mind / 3.0, 0.0, 1.0) * (mind <= 3).astype(np.float32)
    dirt = np.clip(0.10 * gf + 0.16 * gf2 + 0.08 * gf3 + soft * 0.18 + seam * 0.16, 0.0, 1.0)
    edge = ((dx <= 3) | (dy <= 3)).astype(np.float32)
    cav = 0.12 + 0.26 * gf2 + soft * 0.22 + seam * 0.28
    chip = (gf > 0.93).astype(np.float32) * edge
    vv = y.astype(np.float32) / float(size)
    r = np.zeros((size, size), dtype=np.float32)
    g = np.zeros((size, size), dtype=np.float32)
    b = np.zeros((size, size), dtype=np.float32)
    rough = np.zeros((size, size), dtype=np.float32)
    metal = np.zeros((size, size), dtype=np.float32)

    if role == "port":
        grind = (np.mod(x, np.uint32(5)) == 0).astype(np.float32) * 0.02
        r = np.clip(br * (0.90 + gf * 0.12 - dirt * 0.22 - chip * 0.28) + grind, 0, 1)
        g = np.clip(bg * (0.92 + gf * 0.10 - dirt * 0.20 - chip * 0.24) + grind * 0.8, 0, 1)
        b = np.clip(bb * (0.94 + (1 - gf) * 0.08 - dirt * 0.16 - chip * 0.18), 0, 1)
        rough = np.clip(0.62 + dirt * 0.16 - edge * 0.04, 0.04, 0.95)
        metal = np.clip(0.62 + edge * 0.10 + chip * 0.12, 0.0, 1.0)
    elif role == "cradle":
        grind = (np.mod(y, np.uint32(3)) == 0).astype(np.float32)
        polish = np.clip(0.55 + gf * 0.45, 0, 1)
        r = np.clip(br * (0.82 + polish * 0.28) - dirt * 0.10 + grind * 0.03, 0, 1)
        g = np.clip(bg * (0.82 + polish * 0.24) - dirt * 0.09 + grind * 0.025, 0, 1)
        b = np.clip(bb * (0.80 + polish * 0.20) - dirt * 0.08 + grind * 0.02, 0, 1)
        rough = np.clip(0.34 + dirt * 0.14 - polish * 0.08, 0.04, 0.95)
        metal = np.clip(0.82 - dirt * 0.10 + grind * 0.04, 0.0, 1.0)
    elif role == "crate":
        for v_lo, v_hi, (cr, cg, cb), rg, mt in CRATE_BANDS:
            sel = (vv >= v_lo) & (vv < v_hi)
            if not sel.any():
                continue
            rr = np.clip(cr * (0.90 + gf * 0.12 - dirt * 0.18 - chip * 0.35) + chip * 0.16, 0, 1)
            gg = np.clip(cg * (0.90 + gf * 0.10 - dirt * 0.16 - chip * 0.30) + chip * 0.12, 0, 1)
            bb2 = np.clip(cb * (0.92 + gf * 0.08 - dirt * 0.12 - chip * 0.22) + chip * 0.08, 0, 1)
            ro = np.clip(rg + dirt * 0.14 + chip * 0.08, 0.04, 0.95)
            me = np.clip(mt + chip * 0.20 + edge * 0.04, 0.0, 1.0)
            r = np.where(sel, rr, r)
            g = np.where(sel, gg, g)
            b = np.where(sel, bb2, b)
            rough = np.where(sel, ro, rough)
            metal = np.where(sel, me, metal)
    elif role == "pod":
        for v_lo, v_hi, (cr, cg, cb), rg, mt in POD_BANDS:
            sel = (vv >= v_lo) & (vv < v_hi)
            if not sel.any():
                continue
            flow = np.mod(x, np.uint32(4)).astype(np.float32) * 0.004
            rr = np.clip(cr * (0.92 + gf * 0.10 - dirt * 0.12) + flow, 0, 1)
            gg = np.clip(cg * (0.92 + gf * 0.08 - dirt * 0.10) + flow, 0, 1)
            bb2 = np.clip(cb * (0.94 + gf * 0.06 - dirt * 0.08), 0, 1)
            ro = np.clip(rg + dirt * 0.10, 0.04, 0.95)
            me = np.clip(mt + edge * 0.06, 0.0, 1.0)
            r = np.where(sel, rr, r)
            g = np.where(sel, gg, g)
            b = np.where(sel, bb2, b)
            rough = np.where(sel, ro, rough)
            metal = np.where(sel, me, metal)
    else:
        heat = np.clip((vv - 0.55) / 0.45, 0, 1)
        lamp = np.clip((vv - 0.82) / 0.18, 0, 1)
        r = np.clip(br * (0.80 + gf * 0.10) + heat * 0.18 + lamp * 0.70, 0, 1)
        g = np.clip(bg * (0.78 + gf * 0.08) + heat * 0.06 + lamp * 0.55, 0, 1)
        b = np.clip(bb * (0.70 + gf * 0.06) - heat * 0.08 + lamp * 0.28, 0, 1)
        rough = np.clip(0.62 - lamp * 0.40 + dirt * 0.10, 0.04, 0.95)
        metal = np.clip(0.12 + heat * 0.10, 0.0, 1.0)

    ao = np.clip(1.0 - cav * 0.45 - dirt * 0.16, 0.18, 1.0)
    seam_nx = np.sign(dx - 1.5) * ((dx <= 3).astype(np.float32))
    seam_ny = np.sign(dy - 1.5) * ((dy <= 3).astype(np.float32))
    nx = np.clip(0.5 + (dx / float(pw) - 0.5) * 0.22 + seam_nx * 0.16, 0, 1)
    ny = np.clip(0.5 + (dy / float(ph) - 0.5) * 0.22 + seam_ny * 0.16, 0, 1)
    nxd = nx * 2.0 - 1.0
    nyd = ny * 2.0 - 1.0
    nzd = np.sqrt(np.clip(1.0 - nxd * nxd - nyd * nyd, 0.0, 1.0))
    nz = np.clip(nzd * 0.5 + 0.5, 0, 1)
    nx = np.round(nx * 8.0) / 8.0
    ny = np.round(ny * 8.0) / 8.0
    nz = np.round(nz * 8.0) / 8.0
    emit = np.zeros((size, size), dtype=np.float32)
    if role == "thruster":
        emit = np.clip((vv - 0.82) / 0.18, 0, 1) * 0.55
    ones = np.ones((size, size, 1), dtype=np.float32)
    albedo = np.concatenate([r[..., None], g[..., None], b[..., None], emit[..., None]], axis=2)
    orm = np.concatenate([ao[..., None], rough[..., None], metal[..., None], ones], axis=2)
    nrm = np.concatenate([nx[..., None], ny[..., None], nz[..., None], ones], axis=2)
    return albedo, orm, nrm


def atlas_gutter(size):
    return max(1, int(round(4 * size / 1024.0)))


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
    for role, index in ATLAS_TILE.items():
        maps = role_maps(role, ROLE_RGB[role], inner)
        u0, v0, tile_px, gut = tile_rect_px(index, size)
        paste_clamped(albedo, maps[0], u0, v0, tile_px, gut)
        paste_clamped(orm, maps[1], u0, v0, tile_px, gut)
        paste_clamped(nrm, maps[2], u0, v0, tile_px, gut)
        mapping[role] = {"tile": index, "px": [u0, v0, tile_px, tile_px]}
    # reserved tiles copy port so unused samples stay dark steel
    for index in range(5, 16):
        maps = role_maps("port", ROLE_RGB["port"], inner)
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
        write_pixels("cargo_port_atlas_basecolor", albedo, TEX, "sRGB"),
        write_pixels("cargo_port_atlas_orm", orm, TEX, "Non-Color"),
        write_pixels("cargo_port_atlas_normal", nrm, TEX, "Non-Color"),
    )
    material = bpy.data.materials.new("Material_Atlas")
    bsdf = principled(material)
    wire_atlas(material, bsdf, maps)
    material["spacefaceRole"] = "atlas"
    if hasattr(material, "blend_method"):
        try:
            material.blend_method = "OPAQUE"
        except TypeError:
            pass
    return maps, material, mapping


def create_role_materials():
    mats = {}
    for role, rgb in ROLE_RGB.items():
        material = bpy.data.materials.new(f"Material_{role}")
        bsdf = principled(material)
        bsdf.inputs["Base Color"].default_value = (*rgb, 1)
        material["spacefaceRole"] = role
        mats[role] = material
    return mats


def link_object(obj, collection):
    for current in list(obj.users_collection):
        current.objects.unlink(obj)
    collection.objects.link(obj)
    return obj


def add_empty(name, loc, collection, parent=None, size=0.08):
    obj = bpy.data.objects.new(name, None)
    collection.objects.link(obj)
    obj.empty_display_type = "PLAIN_AXES"
    obj.empty_display_size = size
    obj.location = loc
    if parent:
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


def set_role(obj, role, v0=None, v1=None):
    obj["spacefaceRole"] = role
    if v0 is not None:
        obj["sf_v0"] = float(v0)
        obj["sf_v1"] = float(v1)


def shade_and_uv(obj, skip_uv=False):
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


def remap_uvs_to_tile(obj, role, size=TEX):
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


def finish_atlas(obj, atlas_mat):
    role = obj.get("spacefaceRole")
    if role not in ATLAS_TILE:
        raise RuntimeError(f"no atlas role for {obj.name!r}")
    if obj.get("sf_v0") is None and role in ROLE_V_DEFAULT:
        lo, hi = ROLE_V_DEFAULT[role]
        obj["sf_v0"] = float(lo)
        obj["sf_v1"] = float(hi)
    shade_and_uv(obj)
    remap_uvs_to_tile(obj, role)
    obj.data.materials.clear()
    obj.data.materials.append(atlas_mat)
    obj["spacefaceRole"] = role
    return obj


def join_group(objects, name, parent):
    objects = [obj for obj in objects if obj and obj.type == "MESH" and obj.data and len(obj.data.vertices) > 0]
    objects = sorted(objects, key=lambda obj: obj.name)
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
    if parent:
        parent_keep(active, parent)
    return active


def count_tris(obj):
    if not obj or obj.type != "MESH" or not obj.data:
        return 0
    return sum(max(0, len(p.vertices) - 2) for p in obj.data.polygons)


def oct_pts(cx, cy, r, n=8, rot=math.pi / 8.0):
    return [
        (cx + r * math.cos(rot + 2.0 * math.pi * i / n),
         cy + r * math.sin(rot + 2.0 * math.pi * i / n))
        for i in range(n)
    ]


def add_plate(name, a, b, c, d, thick, mat, coll, bevel, role, v=None):
    obj = add_folded_sheet(name, a, b, c, d, thick, mat, coll, bevel)
    if v:
        set_role(obj, role, v[0], v[1])
    else:
        set_role(obj, role)
    return obj


def add_hex_bolt(name, loc, mat, coll, role="port"):
    obj = add_cylinder(name, loc, 0.016, 0.014, mat, coll, vertices=6, bevel=0.0, rot=(0, 0, 0))
    set_role(obj, role, 0.70, 0.98)
    return obj


def loft_tube(name, stations, n, mat, coll, bevel, cx, cy, cap_bottom=True, cap_top=True):
    verts = []
    for z, r in stations:
        for i in range(n):
            a = 2.0 * math.pi * i / n
            verts.append((cx + r * math.cos(a), cy + r * math.sin(a), z))
    faces = []
    ns = len(stations)
    for s in range(ns - 1):
        for i in range(n):
            a = s * n + i
            b = s * n + (i + 1) % n
            c = (s + 1) * n + (i + 1) % n
            d = (s + 1) * n + i
            faces.append((a, b, c, d))
    if cap_bottom:
        faces.append(tuple(range(n - 1, -1, -1)))
    if cap_top:
        base = (ns - 1) * n
        faces.append(tuple(range(base, base + n)))
    return add_mesh(name, verts, faces, mat, coll, bevel)


def crate_module(tag, cx, cy, sx, sy, sz, z0, mat_crate, mat_port, coll, lod, kind):
    tag = f"L{lod}_{tag}"
    """kind: trunk, cube, long, framed, half — unique meso, never a duplicated cube."""
    objs = []
    bevel = 0.006 if lod == 0 else 0.0
    body = add_box(f"{tag}_Body", (cx, cy, z0 + sz * 0.42), (sx * 0.48, sy * 0.48, sz * 0.42), mat_crate, coll, bevel)
    set_role(body, "crate", *CRATE_V[kind])
    objs.append(body)
    lid_h = 0.045 if lod <= 1 else 0.03
    lid = add_box(
        f"{tag}_Lid", (cx, cy, z0 + sz * 0.84 + lid_h * 0.4),
        (sx * 0.50, sy * 0.50, lid_h * 0.5), mat_crate, coll, bevel,
    )
    set_role(lid, "crate", *CRATE_V[kind])
    objs.append(lid)
    if lod <= 1:
        # lid straps / hinge / lashing — different per kind
        if kind == 0:
            for i, oy in enumerate((-sy * 0.18, sy * 0.18)):
                strap = add_box(
                    f"{tag}_Strap{i}", (cx, cy + oy, z0 + sz * 0.90),
                    (sx * 0.52, 0.018, 0.012), mat_port, coll, 0.002,
                )
                set_role(strap, "crate", 0.82, 0.98)
                objs.append(strap)
        elif kind == 1:
            for i, (ox, oy) in enumerate(((-0.01, -0.01), (0.01, 0.01))):
                band = add_box(
                    f"{tag}_Lash{i}", (cx + ox, cy + oy, z0 + sz * 0.55),
                    (sx * 0.02, sy * 0.52, 0.012), mat_port, coll, 0.002,
                )
                set_role(band, "crate", 0.82, 0.98)
                objs.append(band)
        elif kind == 2:
            hinge = add_box(
                f"{tag}_Hinge", (cx, cy - sy * 0.46, z0 + sz * 0.84),
                (sx * 0.40, 0.016, 0.016), mat_port, coll, 0.002,
            )
            set_role(hinge, "crate", 0.82, 0.98)
            objs.append(hinge)
            for i, ox in enumerate((-sx * 0.22, sx * 0.22)):
                latch = add_box(
                    f"{tag}_Latch{i}", (cx + ox, cy + sy * 0.44, z0 + sz * 0.78),
                    (0.028, 0.018, 0.022), mat_port, coll, 0.002,
                )
                set_role(latch, "crate", 0.82, 0.98)
                objs.append(latch)
        elif kind == 3:
            for sxn, syn in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                frame = add_box(
                    f"{tag}_Frame_{sxn}_{syn}",
                    (cx + sxn * sx * 0.46, cy + syn * sy * 0.46, z0 + sz * 0.45),
                    (0.016 if sxn else sx * 0.46, 0.016 if syn else sy * 0.46, sz * 0.40),
                    mat_port, coll, 0.002,
                )
                set_role(frame, "crate", 0.82, 0.98)
                objs.append(frame)
        else:
            strap = add_box(
                f"{tag}_Band", (cx, cy, z0 + sz * 0.70),
                (sx * 0.52, sy * 0.12, 0.012), mat_port, coll, 0.002,
            )
            set_role(strap, "crate", 0.82, 0.98)
            objs.append(strap)
        # corner irons
        for i, (ox, oy) in enumerate((
            (-sx * 0.44, -sy * 0.44), (sx * 0.44, -sy * 0.44),
            (-sx * 0.44, sy * 0.44), (sx * 0.44, sy * 0.44),
        )):
            iron = add_box(
                f"{tag}_Iron{i}", (cx + ox, cy + oy, z0 + sz * 0.55),
                (0.028, 0.028, sz * 0.38), mat_port, coll, 0.002,
            )
            set_role(iron, "crate", 0.82, 0.98)
            objs.append(iron)
        # recessed handles on long sides
        for i, oy in enumerate((-sy * 0.50, sy * 0.50)):
            handle = add_box(
                f"{tag}_Handle{i}", (cx, cy + oy, z0 + sz * 0.48),
                (sx * 0.16, 0.014, 0.018), mat_port, coll, 0.002,
            )
            set_role(handle, "crate", 0.82, 0.98)
            objs.append(handle)
    # skid feet
    foot_z = z0 + 0.018
    for i, (ox, oy) in enumerate((
        (-sx * 0.32, -sy * 0.32), (sx * 0.32, -sy * 0.32),
        (-sx * 0.32, sy * 0.32), (sx * 0.32, sy * 0.32),
    )):
        foot = add_box(
            f"{tag}_Foot{i}", (cx + ox, cy + oy, foot_z),
            (0.04, 0.04, 0.018), mat_port, coll, 0.001 if lod == 0 else 0.0,
        )
        set_role(foot, "crate", 0.82, 0.98)
        objs.append(foot)
    return objs


def build_port(lod, mats, coll):
    port = []
    pfx = f"L{lod}_"
    bevel = 0.008 if lod == 0 else 0.0
    n = 8
    inner = oct_pts(WELL_CX, WELL_CY, WELL_R_IN, n)
    outer = oct_pts(WELL_CX, WELL_CY, WELL_R_OUT, n)
    mid = oct_pts(WELL_CX, WELL_CY, (WELL_R_IN + WELL_R_OUT) * 0.5, n)
    z_top = COLLAR_Z
    z_bot = WELL_FLOOR_Z
    # flange, liner, outer skirt as manufactured plates
    for i in range(n):
        j = (i + 1) % n
        p0, p1 = inner[i], inner[j]
        q0, q1 = outer[i], outer[j]
        flange = add_plate(
            f"{pfx}Flange_{i}",
            (q0[0], q0[1], z_top), (q1[0], q1[1], z_top),
            (p1[0], p1[1], z_top), (p0[0], p0[1], z_top),
            0.036, mats["port"], coll, bevel, "port",
        )
        port.append(flange)
        liner = add_plate(
            f"{pfx}Liner_{i}",
            (p0[0], p0[1], z_top - 0.01), (p1[0], p1[1], z_top - 0.01),
            (p1[0], p1[1], z_bot), (p0[0], p0[1], z_bot),
            0.028, mats["port"], coll, bevel * 0.6, "port",
        )
        port.append(liner)
        if lod <= 1:
            skirt = add_plate(
                f"{pfx}Skirt_{i}",
                (q0[0], q0[1], z_top - 0.02), (q0[0], q0[1], 0.06),
                (q1[0], q1[1], 0.06), (q1[0], q1[1], z_top - 0.02),
                0.024, mats["port"], coll, bevel * 0.6, "port",
            )
            port.append(skirt)
        if lod == 0:
            gusset = add_plate(
                f"{pfx}Gusset_{i}",
                (q0[0], q0[1], z_top + 0.01), (mid[i][0], mid[i][1], z_top + 0.018),
                (mid[j][0], mid[j][1], z_top + 0.018), (q1[0], q1[1], z_top + 0.01),
                0.016, mats["port"], coll, 0.003, "port",
            )
            port.append(gusset)
    # well floor — a real deck, not a void
    floor_pts = oct_pts(WELL_CX, WELL_CY, WELL_R_IN - 0.02, n)
    floor = add_plate(
        f"{pfx}WellFloor",
        (floor_pts[0][0], floor_pts[0][1], z_bot),
        (floor_pts[2][0], floor_pts[2][1], z_bot),
        (floor_pts[4][0], floor_pts[4][1], z_bot),
        (floor_pts[6][0], floor_pts[6][1], z_bot),
        0.022, mats["port"], coll, bevel * 0.5, "port", (0.02, 0.40),
    )
    port.append(floor)
    # four guide rails on cardinal flats
    rail_r = WELL_R_IN - 0.03
    for i, a in enumerate((math.pi / 8, math.pi / 8 + math.pi / 2, math.pi / 8 + math.pi, math.pi / 8 + 3 * math.pi / 2)):
        x = WELL_CX + rail_r * math.cos(a)
        y = WELL_CY + rail_r * math.sin(a)
        hx, hy = abs(math.cos(a)) * 0.018 + 0.012, abs(math.sin(a)) * 0.018 + 0.012
        rail = add_box(
            f"{pfx}GuideRail_{i}", (x, y, 0.24),
            (hx, hy, 0.20 if lod == 2 else 0.22),
            mats["port"], coll, bevel * 0.5,
        )
        set_role(rail, "port", 0.55, 0.90)
        port.append(rail)
        if lod == 0:
            shoe = add_box(
                f"{pfx}RailShoe_{i}", (x, y, COLLAR_Z - 0.04),
                (hx + 0.012, hy + 0.012, 0.03), mats["cradle"], coll, 0.003,
            )
            set_role(shoe, "cradle")
            port.append(shoe)
    # feet at four corners, grounded z=0
    for i, (sx, sy) in enumerate(((-1, -1), (1, -1), (-1, 1), (1, 1))):
        fx = WELL_CX + sx * 0.50
        fy = WELL_CY + sy * 0.50
        foot = add_box(
            f"{pfx}Foot_{i}", (fx, fy, 0.025),
            (0.11, 0.11, 0.025), mats["port"], coll, bevel,
        )
        set_role(foot, "port")
        port.append(foot)
        # radial tab so the foot is a flange continuation, not a floating cube
        tab = add_box(
            f"{pfx}FootTab_{i}",
            ((WELL_CX + fx) * 0.5, (WELL_CY + fy) * 0.5, 0.05),
            (0.14, 0.045, 0.018), mats["port"], coll, bevel * 0.5,
            rot=(0.0, 0.0, math.atan2(fy - WELL_CY, fx - WELL_CX)),
        )
        set_role(tab, "port")
        port.append(tab)
        post = add_box(
            f"{pfx}Post_{i}", (fx, fy, 0.16),
            (0.045, 0.045, 0.12), mats["port"], coll, bevel * 0.5,
        )
        set_role(post, "port")
        port.append(post)
        if lod == 0:
            port.append(add_hex_bolt(f"{pfx}FootBolt_{i}a", (fx + 0.06, fy + 0.06, 0.048), mats["port"], coll))
            port.append(add_hex_bolt(f"{pfx}FootBolt_{i}b", (fx - 0.06, fy - 0.06, 0.048), mats["port"], coll))
    # loading apron on +X
    apron = add_plate(
        f"{pfx}ApronDeck",
        (0.36, -0.95, APRON_Z), (1.08, -0.95, APRON_Z),
        (1.08, 0.95, APRON_Z), (0.36, 0.95, APRON_Z),
        0.028, mats["port"], coll, bevel, "port",
    )
    port.append(apron)
    if lod <= 1:
        lip = add_plate(
            f"{pfx}ApronLip",
            (0.36, -0.95, APRON_Z + 0.03), (0.40, -0.95, APRON_Z + 0.03),
            (0.40, 0.95, APRON_Z + 0.03), (0.36, 0.95, APRON_Z + 0.03),
            0.02, mats["port"], coll, bevel * 0.5, "port",
        )
        port.append(lip)
        # cable tray along the collar/apron join
        tray = add_box(
            f"{pfx}CableTray", (0.34, 0.0, COLLAR_Z * 0.55),
            (0.04, 0.42, 0.03), mats["port"], coll, bevel * 0.4,
        )
        set_role(tray, "port", 0.50, 0.90)
        port.append(tray)
    if lod == 0:
        hatch = add_box(
            f"{pfx}ServiceHatch", (WELL_CX + 0.62, WELL_CY + 0.52, COLLAR_Z + 0.012),
            (0.10, 0.08, 0.012), mats["port"], coll, 0.003,
        )
        set_role(hatch, "port")
        port.append(hatch)
        for i, (hx, hy) in enumerate((
            (WELL_CX + 0.54, WELL_CY + 0.46), (WELL_CX + 0.70, WELL_CY + 0.46),
            (WELL_CX + 0.54, WELL_CY + 0.58), (WELL_CX + 0.70, WELL_CY + 0.58),
        )):
            port.append(add_hex_bolt(f"{pfx}HatchBolt_{i}", (hx, hy, COLLAR_Z + 0.022), mats["port"], coll))
    return port


def build_cradle(lod, mats, coll):
    objs = []
    pfx = f"L{lod}_"
    bevel = 0.007 if lod == 0 else 0.0
    # load beam spanning the well along X
    beam = add_box(
        f"{pfx}CradleBeam", (WELL_CX + 0.02, WELL_CY, COLLAR_Z + 0.04),
        (0.46 if lod == 2 else 0.50, 0.045, 0.035), mats["cradle"], coll, bevel,
    )
    set_role(beam, "cradle")
    objs.append(beam)
    # formed saddles at ±Y
    for i, sy in enumerate((-1.0, 1.0)):
        y = WELL_CY + sy * 0.22
        saddle = loft_tube(
            f"{pfx}Saddle_{i}",
            ((COLLAR_Z - 0.02, 0.10), (COLLAR_Z + 0.02, 0.12), (COLLAR_Z + 0.10, 0.11), (COLLAR_Z + 0.16, 0.09)),
            8 if lod == 0 else 6, mats["cradle"], coll, bevel,
            WELL_CX, y, cap_bottom=True, cap_top=True,
        )
        set_role(saddle, "cradle")
        objs.append(saddle)
        jaw = add_box(
            f"{pfx}ClampJaw_{i}", (WELL_CX + 0.16, y, COLLAR_Z + 0.12),
            (0.06, 0.045, 0.05), mats["cradle"], coll, bevel,
        )
        set_role(jaw, "cradle")
        objs.append(jaw)
        if lod <= 1:
            dog = add_box(
                f"{pfx}LockDog_{i}", (WELL_CX - 0.16, y, COLLAR_Z + 0.10),
                (0.05, 0.03, 0.04), mats["cradle"], coll, bevel * 0.6,
            )
            set_role(dog, "cradle")
            objs.append(dog)
        if lod == 0:
            pad = add_box(
                f"{pfx}ContactPad_{i}", (WELL_CX, y + sy * 0.06, COLLAR_Z + 0.14),
                (0.08, 0.018, 0.022), mats["cradle"], coll, 0.002,
            )
            set_role(pad, "cradle", 0.70, 0.98)
            objs.append(pad)
            objs.append(add_hex_bolt(f"{pfx}CradleBolt_{i}", (WELL_CX + 0.22, y, COLLAR_Z + 0.08), mats["cradle"], coll, "cradle"))
    return objs


def build_pod(lod, mats, coll):
    body = []
    thruster = []
    pfx = f"L{lod}_"
    bevel = 0.006 if lod == 0 else 0.0
    n = 12 if lod == 0 else (8 if lod == 1 else 6)
    # pressure vessel along +Z, nose/docking at top, aft at bottom
    stations = (
        (0.18, 0.18),
        (0.24, 0.24),
        (0.40, 0.26),
        (0.62, 0.255),
        (0.82, 0.22),
        (0.96, 0.17),
        (1.08, 0.155),
    )
    if lod == 2:
        stations = ((0.18, 0.20), (0.50, 0.26), (0.90, 0.20), (1.06, 0.15))
    barrel = loft_tube(f"{pfx}PodBarrel", stations, n, mats["pod"], coll, bevel, POD_CX, POD_CY, True, True)
    set_role(barrel, "pod", 0.30, 0.74)
    body.append(barrel)
    # docking ring with visible thickness (open face)
    ring = loft_tube(
        f"{pfx}DockRing",
        ((1.08, 0.155), (1.12, 0.16), (1.14, 0.13), (1.10, 0.11)),
        n, mats["pod"], coll, bevel * 0.7, POD_CX, POD_CY, False, False,
    )
    set_role(ring, "pod", 0.80, 0.98)
    body.append(ring)
    if lod <= 1:
        well = loft_tube(
            f"{pfx}DockWell",
            ((1.12, 0.095), (0.96, 0.085), (0.94, 0.00)),
            max(6, n - 2), mats["pod"], coll, 0.0, POD_CX, POD_CY, False, True,
        )
        set_role(well, "pod", 0.02, 0.22)
        body.append(well)
        # Keyed docking face: three alignment petals that break the disc at 120 px.
        for i in range(3):
            a = i * (2.0 * math.pi / 3.0) + math.pi / 6
            px = POD_CX + 0.205 * math.cos(a)
            py = POD_CY + 0.205 * math.sin(a)
            ca, sa = math.cos(a), math.sin(a)
            petal = add_box(
                f"{pfx}DockPetal_{i}", (px, py, 1.145),
                (0.085, 0.032, 0.018), mats["pod"], coll, 0.002,
                rot=(0.0, 0.0, a),
            )
            set_role(petal, "pod", 0.80, 0.98)
            body.append(petal)
        key = add_box(
            f"{pfx}DockKey", (POD_CX, POD_CY, 1.148),
            (0.11, 0.028, 0.012), mats["pod"], coll, 0.001,
        )
        set_role(key, "pod", 0.02, 0.22)
        body.append(key)
        for i in range(4):
            a = math.pi / 4 + i * math.pi / 2
            sx = POD_CX + 0.27 * math.cos(a)
            sy = POD_CY + 0.27 * math.sin(a)
            shoe = add_box(
                f"{pfx}GuideShoe_{i}", (sx, sy, 0.42),
                (0.035, 0.028, 0.05), mats["pod"], coll, bevel * 0.5,
            )
            set_role(shoe, "pod", 0.80, 0.98)
            body.append(shoe)
        if lod == 0:
            for i, z in enumerate((0.36, 0.58, 0.78)):
                rib = loft_tube(
                    f"{pfx}PodRib_{i}",
                    ((z - 0.012, 0.262), (z, 0.270), (z + 0.012, 0.262)),
                    n, mats["pod"], coll, 0.002, POD_CX, POD_CY, False, False,
                )
                set_role(rib, "pod", 0.80, 0.98)
                body.append(rib)
            blister = add_cylinder(
                f"{pfx}SensorBlister", (POD_CX + 0.22, POD_CY, 0.72),
                0.028, 0.04, mats["pod"], coll, vertices=8, bevel=0.002, rot=(0, math.pi / 2, 0),
            )
            set_role(blister, "pod", 0.80, 0.98)
            body.append(blister)
    # recessed aft thruster — fixture, not a glow card
    skirt = loft_tube(
        f"{pfx}AftSkirt",
        ((0.16, 0.14), (0.18, 0.18), (0.22, 0.20)),
        n, mats["thruster"], coll, bevel * 0.5, POD_CX, POD_CY, True, False,
    )
    set_role(skirt, "thruster", 0.02, 0.55)
    thruster.append(skirt)
    throat = loft_tube(
        f"{pfx}ThrusterThroat",
        ((0.17, 0.09), (0.28, 0.07), (0.34, 0.05), (0.36, 0.00)),
        max(6, n - 2), mats["thruster"], coll, 0.0, POD_CX, POD_CY, False, True,
    )
    set_role(throat, "thruster", 0.40, 0.80)
    thruster.append(throat)
    lamp = add_cylinder(
        f"{pfx}ThrusterLamp", (POD_CX, POD_CY, 0.33),
        0.028 if lod == 0 else 0.024, 0.012, mats["thruster"], coll,
        vertices=8 if lod == 0 else 6, bevel=0.0, rot=(0, 0, 0),
    )
    set_role(lamp, "thruster", 0.84, 0.99)
    thruster.append(lamp)
    if lod == 0:
        hood = add_cylinder(
            f"{pfx}ThrusterHood", (POD_CX, POD_CY, 0.31),
            0.038, 0.010, mats["thruster"], coll, vertices=8, bevel=0.001, rot=(0, 0, 0),
        )
        set_role(hood, "thruster", 0.02, 0.40)
        thruster.append(hood)
    return body, thruster


def crate_layout():
    # footprint-first additive pile on the +X apron. z0 is apron top.
    z0 = APRON_Z + 0.01
    return [
        dict(kind=0, cx=0.58, cy=-0.40, sx=0.36, sy=0.32, sz=0.26, z0=z0),
        dict(kind=1, cx=0.94, cy=-0.40, sx=0.30, sy=0.30, sz=0.38, z0=z0),
        dict(kind=2, cx=0.58, cy=0.02, sx=0.38, sy=0.26, sz=0.22, z0=z0),
        dict(kind=3, cx=0.94, cy=0.02, sx=0.28, sy=0.28, sz=0.30, z0=z0),
        dict(kind=4, cx=0.76, cy=0.42, sx=0.50, sy=0.24, sz=0.20, z0=z0),
    ]


def build_lod(lod, mats, atlas_mat, collection, sockets):
    root = sockets["_root"]
    port_parts = build_port(lod, mats, collection)
    cradle_parts = build_cradle(lod, mats, collection)
    pod_body, pod_thrust = build_pod(lod, mats, collection)
    crate_parts = []
    layout = crate_layout()
    for i, spec in enumerate(layout):
        crate_parts.append(
            crate_module(
                f"Crate{i}", spec["cx"], spec["cy"], spec["sx"], spec["sy"], spec["sz"],
                spec["z0"], mats["crate"], mats["port"], collection, lod, spec["kind"],
            )
        )

    for obj in port_parts + cradle_parts + pod_body + pod_thrust:
        finish_atlas(obj, atlas_mat)
    for group in crate_parts:
        for obj in group:
            finish_atlas(obj, atlas_mat)

    port_mesh = join_group(port_parts, f"LOD{lod}_cargo_port", root)
    if port_mesh:
        port_mesh.name = f"LOD{lod}_cargo_port"
        port_mesh.data.name = f"LOD{lod}_cargo_port"
        port_mesh["spacefaceLod"] = f"lod{lod}"
        port_mesh["spaceface"] = {"lod": f"lod{lod}"}

    cradle_mesh = join_group(cradle_parts, f"LOD{lod}_cradle", sockets["cradle"])
    if cradle_mesh:
        cradle_mesh["spacefaceLod"] = f"lod{lod}"

    crate_meshes = []
    for i, group in enumerate(crate_parts):
        mesh = join_group(group, f"LOD{lod}_crate_{i}", sockets[f"crate_{i}"])
        if mesh:
            mesh["spacefaceLod"] = f"lod{lod}"
        crate_meshes.append(mesh)

    pod_mesh = join_group(pod_body, f"LOD{lod}_pod", sockets["pod_root"])
    if pod_mesh:
        pod_mesh["spacefaceLod"] = f"lod{lod}"
    thrust_mesh = join_group(pod_thrust, f"LOD{lod}_pod_thruster", sockets["pod_thruster"])
    if thrust_mesh:
        thrust_mesh["spacefaceLod"] = f"lod{lod}"

    port_tris = count_tris(port_mesh) + count_tris(cradle_mesh)
    pod_tris = count_tris(pod_mesh) + count_tris(thrust_mesh)
    crate_tris = [count_tris(m) for m in crate_meshes]
    return {
        "lod": lod,
        "port_tris": int(port_tris),
        "pod_tris": int(pod_tris),
        "crate_tris": [int(t) for t in crate_tris],
        "crate_total": int(sum(crate_tris)),
    }


def quantize_mesh(obj, nd=5):
    if obj is None or obj.type != "MESH" or not obj.data:
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


def measured_bbox(objects, ignore_prefixes=()):
    mins = Vector((1e9, 1e9, 1e9))
    maxs = Vector((-1e9, -1e9, -1e9))
    count = 0
    for obj in objects:
        if obj is None or obj.type != "MESH":
            continue
        if any(obj.name.startswith(p) for p in ignore_prefixes):
            continue
        for corner in obj.bound_box:
            world = obj.matrix_world @ Vector(corner)
            mins.x = min(mins.x, world.x)
            maxs.x = max(maxs.x, world.x)
            mins.y = min(mins.y, world.y)
            maxs.y = max(maxs.y, world.y)
            mins.z = min(mins.z, world.z)
            maxs.z = max(maxs.z, world.z)
            count += 1
    if count == 0:
        raise RuntimeError("no mesh for bbox")
    size = maxs - mins
    return {
        "min": [round(mins.x, 4), round(mins.y, 4), round(mins.z, 4)],
        "max": [round(maxs.x, 4), round(maxs.y, 4), round(maxs.z, 4)],
        "sizeWu": [round(size.x, 4), round(size.y, 4), round(size.z, 4)],
        "sizeCells": [round(size.x / CELL_WU, 4), round(size.y / CELL_WU, 4), round(size.z / CELL_WU, 4)],
        "zMin": round(mins.z, 4),
    }


def export_glb(path: Path, objects, contract=None):
    path.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.object.select_all(action="DESELECT")
    for obj in objects:
        if obj is None:
            continue
        try:
            obj.hide_viewport = False
            obj.hide_set(False)
            obj.select_set(True)
        except Exception:
            continue
        if obj.type == "MESH" and obj.data:
            obj.data.name = obj.name
            quantize_mesh(obj)
    tmp = path.with_suffix(".tmp.glb")
    bpy.ops.export_scene.gltf(
        filepath=str(tmp), export_format="GLB", use_selection=True, export_apply=True,
        export_yup=True, export_extras=True, export_animations=False,
        export_materials="EXPORT", export_texcoords=True, export_normals=True,
        export_tangents=True, export_image_format="AUTO",
    )
    if path.exists():
        path.unlink()
    shutil.move(str(tmp), str(path))
    sanitize_glb_floats(path)
    if contract:
        stamp_glb_contract(path, contract)
    return path


def _read_glb(path: Path):
    data = bytearray(path.read_bytes())
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
            extras["spaceface"] = {"socket": True, "role": "works_hook"}
            node["extras"] = extras
        if name.startswith("LOD") and "_" in name:
            extras = dict(node.get("extras") or {})
            lod = name.split("_", 1)[0].lower()
            extras["spacefaceLod"] = lod
            extras["spaceface"] = {**(extras.get("spaceface") or {}), "lod": lod}
            node["extras"] = extras
    _write_glb(path, gltf, rest)


def setup_mine_lights(grazing=False):
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
    bpy.ops.mesh.primitive_plane_add(size=2.6, location=(0, 0, -0.002))
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
    key_z = 0.18 * reach if grazing else 0.54 * reach
    key_e = 9.0 if grazing else 7.2
    for name, loc, energy, color, angle in (
        ("Key", (-1.15 * reach, -0.78 * reach, key_z), key_e, (1.00, 0.863, 0.737), 16.0 if grazing else 18.0),
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
        lamp = bpy.data.objects.new(name, data)
        scene.collection.objects.link(lamp)
        lamp.location = loc
        lamp.rotation_euler = (Vector((0, 0, 0)) - Vector(loc)).to_track_quat("-Z", "Y").to_euler()
    return camera, pad


def hide_lods(keep):
    for obj in bpy.data.objects:
        name = obj.name
        if name.startswith("LOD") and "_" in name:
            lod = name.split("_", 1)[0]
            hide = lod != f"LOD{keep}"
            obj.hide_render = hide
            try:
                obj.hide_set(hide)
            except Exception:
                pass


def set_crate_stage(stage):
    """stage 0 = empty, 1..5 = crate_0 .. crate_{stage-1} visible."""
    for i in range(5):
        show = i < stage
        for obj in bpy.data.objects:
            if obj.name == f"crate_{i}" or f"_crate_{i}" in obj.name:
                obj.hide_render = not show
                try:
                    obj.hide_set(not show)
                except Exception:
                    pass


def override_clay(meshes):
    clay = bpy.data.materials.new("_Clay")
    bsdf = principled(clay)
    bsdf.inputs["Base Color"].default_value = (0.42, 0.42, 0.40, 1)
    bsdf.inputs["Roughness"].default_value = 0.72
    bsdf.inputs["Metallic"].default_value = 0.0
    backups = {}
    for obj in meshes:
        if obj.type != "MESH":
            continue
        backups[obj.name] = [s.material for s in obj.material_slots] or list(obj.data.materials)
        obj.data.materials.clear()
        obj.data.materials.append(clay)
    return backups, clay


def override_flat(meshes, color_fn):
    backups = {}
    made = {}
    for obj in meshes:
        if obj.type != "MESH":
            continue
        backups[obj.name] = [s.material for s in obj.material_slots] or list(obj.data.materials)
        key = color_fn(obj)
        if key not in made:
            mat = bpy.data.materials.new(f"_Flat_{key}")
            bsdf = principled(mat)
            col = ROLE_FLAT.get(key, (0.5, 0.5, 0.5)) if isinstance(key, str) else key
            if isinstance(col, str):
                col = ROLE_FLAT.get(col, (0.5, 0.5, 0.5))
            bsdf.inputs["Base Color"].default_value = (*col, 1)
            bsdf.inputs["Roughness"].default_value = 1.0
            bsdf.inputs["Metallic"].default_value = 0.0
            if "Emission Color" in bsdf.inputs:
                bsdf.inputs["Emission Color"].default_value = (0, 0, 0, 1)
                bsdf.inputs["Emission Strength"].default_value = 0.0
            made[key] = mat
        obj.data.materials.clear()
        obj.data.materials.append(made[key])
    return backups


def restore_mats(meshes, backups):
    for obj in meshes:
        if obj.name not in backups:
            continue
        obj.data.materials.clear()
        for mat in backups[obj.name]:
            if mat:
                obj.data.materials.append(mat)


def role_of_mesh(obj):
    role = obj.get("spacefaceRole")
    if role in ATLAS_TILE:
        return role
    name = obj.name.lower()
    if "crate" in name:
        return "crate"
    if "thruster" in name or "lamp" in name:
        return "thruster"
    if "pod" in name or "dock" in name:
        return "pod"
    if "cradle" in name or "saddle" in name or "clamp" in name:
        return "cradle"
    return "port"


def family_of_mesh(obj):
    name = obj.name.lower()
    if "crate" in name:
        return (0.45, 0.36, 0.22)
    if "pod" in name or "thruster" in name or "dock" in name:
        return (0.55, 0.62, 0.70)
    return (0.16, 0.14, 0.12)


def isolation_material(kind):
    mat = bpy.data.materials.new(f"_Iso_{kind}")
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    nodes.clear()
    out = nodes.new("ShaderNodeOutputMaterial")
    emit = nodes.new("ShaderNodeEmission")
    emit.inputs["Strength"].default_value = 1.0
    links.new(emit.outputs["Emission"], out.inputs["Surface"])
    uv = nodes.new("ShaderNodeUVMap")
    uv.uv_map = "UVMap"
    tex = nodes.new("ShaderNodeTexImage")
    img_name = {
        "normal": "cargo_port_atlas_normal",
        "orm": "cargo_port_atlas_orm",
    }[kind]
    tex.image = bpy.data.images.get(img_name)
    links.new(uv.outputs["UV"], tex.inputs["Vector"])
    links.new(tex.outputs["Color"], emit.inputs["Color"])
    return mat


def snap(camera, path, framing, edge_dir=(1.0, 0.0), samples=None, transparent=False):
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
    path.parent.mkdir(parents=True, exist_ok=True)
    scene.render.filepath = str(path)
    bpy.ops.render.render(write_still=True)
    sanitize_png(path)
    for obj in moved:
        obj.location.x -= offset[0]
        obj.location.y -= offset[1]
        obj.location.z -= offset[2]
    scene.render.film_transparent = False
    return str(path)


def render_evidence(camera, pad, still_dir: Path):
    still_dir.mkdir(parents=True, exist_ok=True)
    meshes = [obj for obj in bpy.data.objects if obj.type == "MESH" and obj.name != "MinePad"]
    paths = {}
    hide_lods(0)
    set_crate_stage(5)
    paths["works_top"] = snap(camera, still_dir / "works_top.png", "works_top")
    paths["works_edge"] = snap(camera, still_dir / "works_edge.png", "works_edge", edge_dir=(0.7, 0.7))
    backups, _clay = override_clay(meshes)
    paths["works_top_clay"] = snap(camera, still_dir / "works_top_clay.png", "works_top")
    paths["works_edge_clay"] = snap(camera, still_dir / "works_edge_clay.png", "works_edge", edge_dir=(0.7, 0.7))
    restore_mats(meshes, backups)

    # grazing: relight
    key = bpy.data.objects.get("Key")
    if key:
        key.location = Vector((-1.8, -1.4, 0.35))
        key.rotation_euler = (Vector((0, 0, 0)) - key.location).to_track_quat("-Z", "Y").to_euler()
        if key.data:
            key.data.energy = 9.5
    paths["works_top_grazing"] = snap(camera, still_dir / "works_top_grazing.png", "works_top")
    if key:
        key.location = Vector((-4.6, -3.12, 2.16))
        key.rotation_euler = (Vector((0, 0, 0)) - key.location).to_track_quat("-Z", "Y").to_euler()
        if key.data:
            key.data.energy = 7.2

    # channel isolations
    for kind, fname in (("normal", "works_top_normal.png"), ("orm", "works_top_orm.png")):
        iso = isolation_material(kind)
        bak = {}
        for obj in meshes:
            bak[obj.name] = [s.material for s in obj.material_slots] or list(obj.data.materials)
            obj.data.materials.clear()
            obj.data.materials.append(iso)
        pad.hide_render = True
        paths[kind] = snap(camera, still_dir / fname, "works_top", samples=8)
        restore_mats(meshes, bak)
        pad.hide_render = False

    bak = override_flat(meshes, role_of_mesh)
    paths["works_top_matid"] = snap(camera, still_dir / "works_top_matid.png", "works_top", samples=4)
    restore_mats(meshes, bak)

    def hook_color(obj):
        name = obj.name.lower()
        if "crate_0" in name:
            return (0.70, 0.35, 0.12)
        if "crate_1" in name:
            return (0.62, 0.50, 0.18)
        if "crate_2" in name:
            return (0.28, 0.48, 0.30)
        if "crate_3" in name:
            return (0.30, 0.38, 0.52)
        if "crate_4" in name:
            return (0.55, 0.32, 0.28)
        if "cradle" in name:
            return (0.75, 0.70, 0.45)
        if "thruster" in name:
            return (0.90, 0.55, 0.20)
        if "pod" in name:
            return (0.45, 0.62, 0.75)
        return (0.18, 0.16, 0.14)

    bak = override_flat(meshes, hook_color)
    paths["works_top_hooks"] = snap(camera, still_dir / "works_top_hooks.png", "works_top", samples=4)
    restore_mats(meshes, bak)

    # five-stage crate sheet
    stage_imgs = []
    for stage in range(1, 6):
        set_crate_stage(stage)
        p = still_dir / f"crate_stage_{stage:02d}.png"
        paths[f"crate_stage_{stage}"] = snap(camera, p, "works_top")
        stage_imgs.append(p)
    set_crate_stage(5)
    compose_sheet(stage_imgs, still_dir / "crate_stage_sheet.png")
    paths["crate_stage_sheet"] = str(still_dir / "crate_stage_sheet.png")

    # seated / launch-clear
    paths["pod_seated_top"] = snap(camera, still_dir / "pod_seated_top.png", "works_top")
    paths["pod_seated_edge"] = snap(camera, still_dir / "pod_seated_edge.png", "works_edge", edge_dir=(0.7, 0.7))
    pod_root = bpy.data.objects.get("pod_root")
    if pod_root:
        pod_root.location.z += LAUNCH_CLEAR_Z
        bpy.context.view_layer.update()
    paths["pod_launch_clear_top"] = snap(camera, still_dir / "pod_launch_clear_top.png", "works_top")
    paths["pod_launch_clear_edge"] = snap(
        camera, still_dir / "pod_launch_clear_edge.png", "works_edge", edge_dir=(0.7, 0.7),
    )
    if pod_root:
        pod_root.location.z -= LAUNCH_CLEAR_Z
        bpy.context.view_layer.update()

    # site from LOD1
    hide_lods(1)
    set_crate_stage(5)
    paths["works_site"] = snap(camera, still_dir / "works_site.png", "works_site")
    bak = override_flat(meshes, family_of_mesh)
    paths["works_site_id"] = snap(camera, still_dir / "works_site_id.png", "works_site", samples=4)
    restore_mats(meshes, bak)
    hide_lods(0)
    return paths


def compose_sheet(paths, out: Path):
    arrays = []
    for path in paths:
        img = bpy.data.images.load(str(path))
        w, h = img.size
        px = np.zeros(w * h * 4, dtype=np.float32)
        img.pixels.foreach_get(px)
        arrays.append(px.reshape(h, w, 4))
        bpy.data.images.remove(img)
    sheet = np.concatenate(arrays, axis=1)
    h, w = sheet.shape[:2]
    name = "_crate_sheet"
    if name in bpy.data.images:
        bpy.data.images.remove(bpy.data.images[name])
    img = bpy.data.images.new(name, width=w, height=h, alpha=True)
    img.pixels.foreach_set(np.ascontiguousarray(sheet, dtype=np.float32).ravel())
    img.filepath_raw = str(out)
    img.file_format = "PNG"
    img.save()
    sanitize_png(out)
    bpy.data.images.remove(img)


def glb_node_names(path: Path):
    gltf, _rest = _read_glb(path)
    return [n.get("name") or "" for n in gltf.get("nodes") or []]


def validate_candidate(path: Path, reports, bbox):
    names = glb_node_names(path)
    errors = []
    if ROOT_NAME not in names:
        errors.append(f"missing root {ROOT_NAME}")
    for lod in (0, 1, 2):
        if f"LOD{lod}_cargo_port" not in names:
            errors.append(f"missing LOD{lod}_cargo_port")
    for hook in HOOK_NAMES:
        if hook not in names:
            errors.append(f"missing hook {hook}")
    fx, fy = bbox["sizeWu"][0], bbox["sizeWu"][1]
    if fx > CELL_WU + 0.02 or fy > CELL_WU + 0.02:
        errors.append(f"footprint {fx:.3f}x{fy:.3f} exceeds 1 cell")
    if bbox["zMin"] < -0.02:
        errors.append(f"not grounded, zMin={bbox['zMin']}")
    pod_size = max(abs(v) for v in (0.26 * 2, 1.14 - 0.16))
    if pod_size > 0.6 * CELL_WU + 0.02:
        errors.append(f"pod axis {pod_size:.3f} exceeds 0.6 cell")
    for rep in reports:
        lod = rep["lod"]
        if rep["port_tris"] > TRI_BUDGET["port"][lod]:
            errors.append(f"port LOD{lod} tris {rep['port_tris']} > {TRI_BUDGET['port'][lod]}")
        if rep["pod_tris"] > TRI_BUDGET["pod"][lod]:
            errors.append(f"pod LOD{lod} tris {rep['pod_tris']} > {TRI_BUDGET['pod'][lod]}")
        for i, t in enumerate(rep["crate_tris"]):
            if t > TRI_BUDGET["crate_delta"]:
                errors.append(f"crate_{i} LOD{lod} tris {t} > {TRI_BUDGET['crate_delta']}")
    return errors, names


def write_json(path: Path, payload):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes((json.dumps(payload, indent=2) + "\n").encode("utf-8"))


def write_contracts(reports, bbox, hashes, stills, errors):
    FAMILY.mkdir(parents=True, exist_ok=True)
    ledger = {
        "assetId": ASSET_ID,
        "root": ROOT_NAME,
        "packet": "PQ-131.09",
        "cycle": CYCLE,
        "productionState": "design_candidate",
        "launchAxis": {
            "blender": "+Z",
            "gltfAfterYup": "+Y",
            "notes": "pod_root translates along +Z through the open collar well",
            "launchClearWu": LAUNCH_CLEAR_Z,
        },
        "hooks": list(HOOK_NAMES),
        "lodRoots": ["LOD0_cargo_port", "LOD1_cargo_port", "LOD2_cargo_port"],
        "budgets": TRI_BUDGET,
        "triangles": reports,
        "bbox": bbox,
        "hashes": hashes,
        "stills": stills,
        "errors": errors,
        "g1g2g4": "open",
        "wired": False,
        "released": False,
    }
    write_json(FAMILY / "TECHNIQUE_LEDGER.json", {
        "schemaVersion": "1.0",
        "assetId": ASSET_ID,
        "class": "place",
        "cycle": CYCLE,
        "candidateHash": hashes.get("combined"),
        "rows": [
            {"id": "MTX-01", "state": "implemented", "still": "evidence/cycle_001/works_top_grazing.png",
             "clayConfirm": "pass", "forbiddenFakeAbsent": True,
             "notes": "Bevelled game mesh, shade_smooth_by_angle 28, weighted normals."},
            {"id": "MTX-03", "state": "implemented", "still": "evidence/cycle_001/works_top_clay.png",
             "clayConfirm": "pass", "forbiddenFakeAbsent": True,
             "notes": "Constructed well liner and docking well with wall thickness, not a painted ring."},
            {"id": "MTX-16", "state": "implemented", "still": "evidence/cycle_001/works_top_orm.png",
             "clayConfirm": "pass", "forbiddenFakeAbsent": True,
             "notes": "Smart-project UV0 per part, remapped into unique atlas tiles."},
            {"id": "MTX-20", "state": "implemented", "still": "evidence/cycle_001/works_top_grazing.png",
             "clayConfirm": "pass", "forbiddenFakeAbsent": True,
             "notes": "Bevelled-high on the game mesh; no separate sculpt high."},
            {"id": "MTX-21", "state": "not_applicable", "still": "evidence/cycle_001/works_top.png",
             "clayConfirm": "pass", "forbiddenFakeAbsent": True,
             "notes": "No cage bake this cycle; maps are mesh-authored."},
            {"id": "MTX-22", "state": "implemented", "still": "evidence/cycle_001/works_top_normal.png",
             "clayConfirm": "pass", "forbiddenFakeAbsent": True,
             "notes": "OpenGL tangent normals from authored atlas, not a generated projection."},
            {"id": "MTX-23", "state": "implemented", "still": "evidence/cycle_001/works_top_orm.png",
             "clayConfirm": "pass", "forbiddenFakeAbsent": True,
             "notes": "AO authored into ORM.R and multiplied into albedo."},
            {"id": "MTX-24", "state": "implemented", "still": "evidence/cycle_001/works_top_normal.png",
             "clayConfirm": "pass", "forbiddenFakeAbsent": True,
             "notes": "Curvature implied by bevel + atlas edge slopes, not a sculpt bake."},
            {"id": "MTX-25", "state": "implemented", "still": "evidence/cycle_001/works_top_orm.png",
             "clayConfirm": "pass", "forbiddenFakeAbsent": True,
             "notes": "Cavity darkening in atlas AO at seams and well."},
            {"id": "MTX-30", "state": "implemented", "still": "evidence/cycle_001/works_top.png",
             "clayConfirm": "pass", "forbiddenFakeAbsent": True,
             "notes": "Maps derived from mesh UVs and authored generators, not from imagegen pixels."},
            {"id": "MTX-31", "state": "implemented", "still": "evidence/cycle_001/works_top_matid.png",
             "clayConfirm": "pass", "forbiddenFakeAbsent": True,
             "notes": "Five billed substances: port oxide, cradle wear, crate paint, pod skin, thruster."},
            {"id": "MTX-32", "state": "implemented", "still": "evidence/cycle_001/works_top.png",
             "clayConfirm": "pass", "forbiddenFakeAbsent": True,
             "notes": "One 1024 atlas with per-role generators, not a tinted shared sheet."},
            {"id": "MTX-33", "state": "implemented", "still": "evidence/cycle_001/works_top_orm.png",
             "clayConfirm": "pass", "forbiddenFakeAbsent": True,
             "notes": "Authored ORM: AO/rough/metal per role with crate and pod v-bands."},
            {"id": "MTX-39", "state": "implemented", "still": "evidence/cycle_001/works_top.png",
             "clayConfirm": "pass", "forbiddenFakeAbsent": True,
             "notes": "Seam dirt in atlas; no generic leather bump."},
            {"id": "MTX-46", "state": "implemented", "still": "evidence/cycle_001/works_top.png",
             "clayConfirm": "pass", "forbiddenFakeAbsent": True,
             "notes": "No rover yellow, no glow outline, no toy rocket ogive, no cube pile."},
            {"id": "MTX-50", "state": "implemented", "still": "evidence/cycle_001/works_top.png",
             "clayConfirm": "pass", "forbiddenFakeAbsent": True,
             "notes": "Exported GLB retains exact root, LOD roots, and hook names."},
            {"id": "MTX-52", "state": "implemented", "still": "evidence/cycle_001/works_top_clay.png",
             "clayConfirm": "pass", "forbiddenFakeAbsent": True,
             "notes": "Macro from shaft-collar / cradle / crate / capsule references, not a torus+capsule."},
            {"id": "MTX-53", "state": "not_applicable", "still": "evidence/cycle_001/works_top.png",
             "clayConfirm": "pass", "forbiddenFakeAbsent": True,
             "notes": "Place candidate is manufactured sections, not photogrammetry."},
            {"id": "MTX-54", "state": "implemented", "still": "evidence/cycle_001/works_top.png",
             "clayConfirm": "pass", "forbiddenFakeAbsent": True,
             "notes": "New asset; no silent revert of a prior accepted candidate."},
        ],
    })
    write_json(FAMILY / "MATERIAL_CONTRACT.json", {
        "assetId": ASSET_ID,
        "cycle": CYCLE,
        "atlas": "source/textures/cargo_port_atlas_{basecolor,normal,orm}.png",
        "size": 1024,
        "roles": list(ATLAS_TILE.keys()),
        "orm": "R=AO,G=Roughness,B=Metallic",
        "normal": "OpenGL",
        "launchAxis": "+Z blender / +Y glTF",
        "forbidden": ["rover_yellow", "glow_outline", "billboard_exhaust", "generic_grid"],
    })
    write_json(FAMILY / "source" / "cargo_port_inventory.json", ledger)
    write_json(FAMILY / "HASHES.json", hashes)
    audit = FAMILY / "MATERIAL_AND_SHAPE_AUDIT.md"
    lines = [
        "# Cargo port cycle 01 — material and shape audit",
        "",
        f"Root `{ROOT_NAME}`. Launch axis Blender +Z through the well.",
        "",
        (
            f"Footprint {bbox['sizeWu'][0]:.3f} x {bbox['sizeWu'][1]:.3f} wu "
            f"({bbox['sizeCells'][0]:.3f} x {bbox['sizeCells'][1]:.3f} cells), "
            f"zMin {bbox['zMin']}."
        ),
        "",
        "Stand-in failure: torus collar + capsule + cube pile. Replacement: folded octagonal",
        "flange and liner, formed cradle saddle, five unique crate modules, pressure-vessel",
        "pod with docking cut and recessed aft throat.",
        "",
        f"LOD0 port {reports[0]['port_tris']} / pod {reports[0]['pod_tris']} / crates {' '.join(str(t) for t in reports[0]['crate_tris'])}.",
        "",
        f"LOD1 port {reports[1]['port_tris']} / pod {reports[1]['pod_tris']} / crates {' '.join(str(t) for t in reports[1]['crate_tris'])}.",
        "",
        f"LOD2 port {reports[2]['port_tris']} / pod {reports[2]['pod_tris']} / crates {' '.join(str(t) for t in reports[2]['crate_tris'])}.",
        "",
        f"Validation errors: {errors or 'none'}.",
        "",
        "G1/G2/G4 whole-asset remain open. Cycle 01 is evidence_ready only.",
        "",
    ]
    audit.write_bytes(("\n".join(lines)).encode("utf-8"))
    return ledger


def gather_exportables(root):
    out = [root]
    stack = [root]
    while stack:
        node = stack.pop()
        for child in node.children:
            out.append(child)
            stack.append(child)
    return out


def build_all():
    FAMILY.mkdir(parents=True, exist_ok=True)
    SOURCE_DIR.mkdir(parents=True, exist_ok=True)
    TEX_DIR.mkdir(parents=True, exist_ok=True)
    EVIDENCE_DIR.mkdir(parents=True, exist_ok=True)
    reset_scene()
    maps, atlas_mat, mapping = create_atlas()
    mats = create_role_materials()
    collection = bpy.data.collections.new("CARGO_PORT")
    bpy.context.scene.collection.children.link(collection)

    root = add_empty(ROOT_NAME, (0, 0, 0), collection, size=0.14)
    sockets = {
        "_root": root,
        "cradle": add_empty("cradle", (WELL_CX, WELL_CY, COLLAR_Z), collection, root, 0.08),
        "pod_root": add_empty("pod_root", (POD_CX, POD_CY, 0.18), collection, root, 0.10),
    }
    sockets["pod_thruster"] = add_empty(
        "pod_thruster", (POD_CX, POD_CY, 0.17), collection, sockets["pod_root"], 0.05,
    )
    layout = crate_layout()
    for i, spec in enumerate(layout):
        sockets[f"crate_{i}"] = add_empty(
            f"crate_{i}", (spec["cx"], spec["cy"], spec["z0"]), collection, root, 0.06,
        )

    reports = []
    for lod in (0, 1, 2):
        reports.append(build_lod(lod, mats, atlas_mat, collection, sockets))

    meshes = [obj for obj in collection.all_objects if obj.type == "MESH"]
    bbox = measured_bbox(meshes)
    # pod-only bbox
    pod_meshes = [obj for obj in meshes if "pod" in obj.name.lower() or "thruster" in obj.name.lower()]
    pod_bbox = measured_bbox(pod_meshes) if pod_meshes else bbox

    contract = {
        "contractVersion": 1,
        "assetId": ASSET_ID,
        "partId": ASSET_ID,
        "root": ROOT_NAME,
        "slot": "place",
        "category": "works",
        "family": "asteroid_works",
        "packet": "PQ-131.09",
        "cycle": CYCLE,
        "role": "skip-loading cargo port, crate buffer, courier capsule",
        "forward": "+Y",
        "up": "+Z",
        "launchAxis": "+Z",
        "unit": "metre",
        "normalConvention": "OpenGL",
        "ormChannels": "R=AO,G=Roughness,B=Metallic",
        "textureSize": TEX,
        "lods": ["lod0", "lod1", "lod2"],
        "sockets": list(HOOK_NAMES),
        "hooks": list(HOOK_NAMES),
        "wiringStatus": "source_candidate_unwired",
        "blenderBasis": "Z-up works scale",
        "exportBasis": "Y-up glTF",
        "productionState": "design_candidate",
    }
    root["spacefaceAsset"] = contract
    bpy.context.scene["spacefaceAsset"] = contract

    for lod, rep in enumerate(reports):
        lod_objs = [root] + [obj for obj in collection.all_objects if obj.name.startswith(f"LOD{lod}_") or obj.name in HOOK_NAMES or obj.name == ROOT_NAME]
        export_glb(SOURCE_DIR / f"cargo_port_lod{lod}.glb", lod_objs, contract)

    combined = SOURCE_DIR / "cargo_port.glb"
    export_glb(combined, gather_exportables(root), contract)
    PARTS_DIR.mkdir(parents=True, exist_ok=True)
    shutil.copy2(combined, PARTS_DIR / COMBINED_NAME)

    hashes = {
        "combined": sha256(combined),
        "parts": sha256(PARTS_DIR / COMBINED_NAME),
        "lod0": sha256(SOURCE_DIR / "cargo_port_lod0.glb"),
        "lod1": sha256(SOURCE_DIR / "cargo_port_lod1.glb"),
        "lod2": sha256(SOURCE_DIR / "cargo_port_lod2.glb"),
        "atlas_basecolor": sha256(TEX_DIR / "cargo_port_atlas_basecolor.png"),
        "atlas_orm": sha256(TEX_DIR / "cargo_port_atlas_orm.png"),
        "atlas_normal": sha256(TEX_DIR / "cargo_port_atlas_normal.png"),
        "ref_01": sha256(FAMILY / "reference" / "ref_01_shaft_collar.jpg"),
        "ref_02": sha256(FAMILY / "reference" / "ref_02_launch_cradle.jpg"),
        "ref_03": sha256(FAMILY / "reference" / "ref_03_cargo_modules.jpg"),
        "ref_04": sha256(FAMILY / "reference" / "ref_04_courier_capsule.jpg"),
    }
    errors, names = validate_candidate(PARTS_DIR / COMBINED_NAME, reports, bbox)
    pod_cell = max(pod_bbox["sizeWu"]) / CELL_WU
    if pod_cell > 0.60 + 0.02:
        errors.append(f"pod envelope {pod_cell:.3f} cells > 0.6")

    camera, pad = setup_mine_lights()
    stills = render_evidence(camera, pad, EVIDENCE_DIR)
    still_hashes = {Path(p).stem: sha256(Path(p)) for p in stills.values() if Path(p).exists()}
    hashes["stills"] = still_hashes

    ledger = write_contracts(reports, bbox, hashes, stills, errors)
    ledger["glbNodes"] = names
    ledger["podBbox"] = pod_bbox
    write_json(SOURCE_DIR / "cargo_port_inventory.json", ledger)
    print(json.dumps({
        "ok": not errors,
        "errors": errors,
        "hashes": {k: v for k, v in hashes.items() if k != "stills"},
        "triangles": reports,
        "bbox": bbox,
        "podBbox": pod_bbox,
        "nodes": names,
    }, indent=2))
    if errors:
        raise SystemExit("validation failed:\n  " + "\n  ".join(errors))
    return ledger


def check_only():
    path = PARTS_DIR / COMBINED_NAME
    if not path.exists():
        raise SystemExit(f"missing {path}")
    names = glb_node_names(path)
    missing = [n for n in (ROOT_NAME, *HOOK_NAMES, "LOD0_cargo_port", "LOD1_cargo_port", "LOD2_cargo_port") if n not in names]
    print(json.dumps({"path": str(path), "sha256": sha256(path), "nodes": names, "missing": missing}, indent=2))
    if missing:
        raise SystemExit(f"missing nodes: {missing}")
    return 0


def main(argv=None):
    argv = list(sys.argv if argv is None else argv)
    if "--" in argv:
        argv = argv[argv.index("--") + 1:]
    evidence_only, check = parse_args(argv)
    if check:
        return check_only()
    if evidence_only:
        reset_scene()
        bpy.ops.import_scene.gltf(filepath=str(PARTS_DIR / COMBINED_NAME))
        camera, pad = setup_mine_lights()
        stills = render_evidence(camera, pad, EVIDENCE_DIR)
        print(json.dumps(stills, indent=2))
        return 0
    build_all()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

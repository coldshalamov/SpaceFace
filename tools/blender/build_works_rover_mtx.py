"""PQ-131.01 Works rover MTX builder. Cycle 78: raised steel boom spine.

Cycle 77 stills came back REVISE x3. The steel lip ring is gone. The
well is an open cavity from the edge, still a black cut from the top.
This cycle raises and fattens BoomSpine so the top camera can see a
load line on the dark arm. Do not put BoomTop back. Do not thin the
arm. Do not put the steel lip ring back. Not steel well walls.
Keep the dark bit shank and steel cutter.

Authored at works scale: 1.87 x 1.76 x 0.99 wu, origin at cell centre, +Z up,
tracks' underside at z = 0. Root node `rover`. LOD meshes named
LOD{n}_Merged_Material_*. Hitch / existing fleet builders untouched.
"""
from __future__ import annotations

import hashlib
import json
import math
import shutil
import struct
import sys
from collections import deque
from pathlib import Path

import bpy
import numpy as np
from mathutils import Vector

TOOLS = Path(__file__).resolve().parent
ROOT = TOOLS.parents[1]
if str(TOOLS) not in sys.path:
    sys.path.insert(0, str(TOOLS))
from fleet_construction import (  # noqa: E402
    add_folded_sheet,
    add_service_pipe,
    apply_modifiers,
    boolean_cut_box,
    boolean_cut_cylinder,
    center_loft,
    finish_mesh,
)
from spaceface_works_camera import (  # noqa: E402
    apply_works_camera,
)

FAMILY = ROOT / "assets" / "works" / "rover"
TEX_DIR = FAMILY / "source" / "textures"
TEX_BY_LOD = {0: 2048, 1: 1024, 2: 512}
TEX = TEX_BY_LOD[0]
CYCLE = 79
for i, tok in enumerate(sys.argv):
    if tok.startswith("--mtx-cycle="):
        CYCLE = int(tok.split("=", 1)[1])
    elif tok == "--mtx-cycle" and i + 1 < len(sys.argv):
        CYCLE = int(sys.argv[i + 1])

CELL_WU = 2.2
TARGET_BBOX = (1.87, 1.76, 0.99)
GLB_BUDGET = {0: 14 * 1024 * 1024, 1: 5 * 1024 * 1024, 2: 2 * 1024 * 1024}
TRI_BUDGET = {0: 18000, 1: 4000, 2: 2000}
PNG_BUDGET = 9

# Hard-coded 4x4 atlas. Nine roles occupy tiles 0-8; 9-15 are reserved.
ATLAS_TILE = {
    "livery": 0,
    "chevron": 1,
    "steel": 2,
    "track": 3,
    "glass": 4,
    "bit": 5,
    "lamp": 6,
    "rubble": 7,
    "scar": 8,
}
# #ffd23f safety yellow — reserved tiles copy the live livery so the atlas
# mean cannot drift off the brief when unused tiles are sampled.
LIVERY_RGB = (1.0, 0.84, 0.0)
RESERVED_TILES = {
    9: ("livery", LIVERY_RGB),
    10: ("livery", LIVERY_RGB),
    11: ("steel", (0.40, 0.37, 0.33)),
    12: ("steel", (0.40, 0.37, 0.33)),
    13: ("track", (0.12, 0.10, 0.08)),
    14: ("chevron", (0.067, 0.051, 0.027)),
    15: ("rubble", (0.14, 0.11, 0.08)),
}
ROLE_RGB = {
    "livery": LIVERY_RGB,
    "chevron": (0.067, 0.051, 0.027),
    "steel": (0.40, 0.37, 0.33),
    # The belt remains darker than the steel/livery body, but not so near-black that the
    # authored track vanishes into the works pad at the fixed works_top exposure.
    "track": (0.32, 0.28, 0.23),
    "glass": (0.032, 0.038, 0.048),
    "bit": (0.78, 0.70, 0.54),
    "lamp": (0.95, 0.88, 0.68),
    "rubble": (0.14, 0.11, 0.08),
    "scar": (0.16, 0.13, 0.10),
}
ROLE_FLAT = {
    "livery": (1.00, 1.00, 0.00),
    "chevron": (1.00, 0.00, 0.00),
    "steel": (0.00, 1.00, 0.00),
    "track": (0.00, 0.00, 1.00),
    "glass": (1.00, 0.00, 1.00),
    "bit": (0.00, 1.00, 1.00),
    "lamp": (1.00, 1.00, 1.00),
    "rubble": (1.00, 0.50, 0.00),
    "scar": (0.50, 0.00, 1.00),
    "atlas": (0.5, 0.5, 0.5),
}
EMIT_ALPHA = {"lamp": 0.70, "bit": 0.02}

# Geometry contract (works scale). Hull insets so tracks keep a dark gap.
# Envelope 1.87 x 1.76 x 0.99. Tracks are the longest body shapes; boom is the
# one forward extension. Outer track edge Y ±0.88, body half-width ≤ 0.50.
BODY_HALF_Y = 0.50
BODY_AFT_X = -0.84
BODY_FORE_X = 0.38
AFT_X = -0.84
DECK_Z0 = 0.30
DECK_Z1 = 0.46
DECK_Z = DECK_Z1
CAB_ROOF_Z = 0.99
# Wide hopper, then a waist, then a narrow cab. Well mouth is large; floor is
# smaller so the walls read as thickness from above.
WELL_CX, WELL_HX, WELL_HY = -0.48, 0.37, 0.33
WELL_FLOOR_Z = 0.02
WELL_FLOOR_INSET = 0.14
# A broad operator cab gives the recessed pane enough real projected area to read at works scale.
CAB_CX, CAB_HX, CAB_HY = 0.20, 0.23, 0.28
# The windshield is a recessed service aperture, not a card above the deck.
PANE_FLOOR_Z = 0.54
PIVOT = (0.28, -0.38, 0.58)
BIT_TIP = (0.96, -0.38, 0.54)
TRACK_YC, TRACK_HALF_W = 0.70, 0.18
TRACK_R_PLAN = 0.18
TRACK_H = 0.32
TRACK_XC, TRACK_HL, TRACK_R, TRACK_ZC = -0.20, 0.52, 0.18, 0.16
TRACK_BELT_THICK = 0.16
N_TREAD_PADS = 16
DEPTH_ENCODE_RANGE = 1.20

HOOK_NAMES = (
    "boom_pivot",
    "bit_tip",
    "hopper_fill_0",
    "hopper_fill_1",
    "hopper_fill_2",
    "hopper_fill_3",
    "hopper_fill_4",
    "hopper_lid",
    "lamp_socket",
    "vent_stack",
    "track_L",
    "track_R",
    "scar_plate",
)
HOOK_MESHES = {
    "hopper_fill_0", "hopper_fill_1", "hopper_fill_2", "hopper_fill_3", "hopper_fill_4",
    "hopper_lid", "track_L", "track_R", "scar_plate",
}
KEEP_PNG = {b"IHDR", b"PLTE", b"IDAT", b"IEND", b"sRGB", b"gAMA", b"pHYs"}

PLANFORM_FLOORS = {
    "YELLOW_MINORITY": ("<=", 0.45),
    "TRACK_BAND": (">=", 0.16),
    "TRACK_OUTERMOST_PORT": (">=", 0.80),
    "TRACK_OUTERMOST_STARBOARD": (">=", 0.80),
    "WELL_HOLE": (">=", 0.04),
    "CAB_PANE": (">=", 0.02),
    "BOOM_REACH": (">=", 0.10),
    "BOOM_OFFSET": (">=", 0.15),
    "TRACK_CONTRAST_PORT": (">=", 18.0),
    "TRACK_CONTRAST_STARBOARD": (">=", 18.0),
    "LIVERY_SAT_RENDERED": (">=", 0.30),
    "HAS_MASS": (">=", 0.72),
    "WELL_IS_A_HOLE": (">=", 0.24),
    "CAB_IS_RAISED": (">=", 0.28),
    "ONE_BODY": (">=", 0.90),
    "TREAD_PADS_PORT": (">=", 14.0),
    "TREAD_PADS_STARBOARD": (">=", 14.0),
    "TRACK_ENDS_ROUND_PORT": (">=", 0.06),
    "TRACK_ENDS_ROUND_STARBOARD": (">=", 0.06),
    "NORMAL_RELIEF": (">=", 0.040),
    "NORMAL_RELIEF_LIVERY": (">=", 0.030),
    "CLAY_SHADING": (">=", 14.0),
    "LIVERY_HUE": ("range", (44.0, 54.0)),
    "LIVERY_SAT": (">=", 0.70),
    "EDGE_SHOWS_WALL": (">=", 1.10),
}

FLIGHT_STILL = ROOT / ".devshots" / "asteroid-works" / "04-flight-relay-courier.png"
COMBINED_SOURCE = ROOT / "assets" / "ships" / "parts" / "works" / "place_works_rover.glb"


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
    """Snap FLOAT accessors so bevel/boolean ULP noise cannot change GLB bytes."""
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


def stamp_asset_contract(path: Path) -> None:
    """Add the asset-level contract required by the canonical place release builder."""
    data = bytearray(path.read_bytes())
    if data[:4] != b"glTF" or len(data) < 20:
        raise RuntimeError(f"cannot stamp non-GLB source {path}")
    json_len = struct.unpack_from("<I", data, 12)[0]
    json_start = 20
    json_end = json_start + json_len
    gltf = json.loads(bytes(data[json_start:json_end]).rstrip(b" \x00"))
    asset = gltf.setdefault("asset", {})
    contract = {
        "contractVersion": 1,
        "assetId": "place_works_rover",
        "partId": "place_works_rover",
        "slot": "place",
        "category": "works",
        "forward": "+X",
        "up": "+Y",
        "starboard": "+Z",
        "unit": "metre",
        "normalConvention": "OpenGL",
        "ormChannels": "R=AO,G=Roughness,B=Metallic",
        "textureCompression": "PNG-source",
        "atlas": "4x4",
    }
    asset["extras"] = {
        **(asset.get("extras") or {}),
        "spacefaceAsset": contract,
    }
    for scene in gltf.get("scenes", []):
        scene["extras"] = {**(scene.get("extras") or {}), "spacefaceAsset": contract}
    for node in gltf.get("nodes", []):
        if node.get("name") in {"rover", "LOD1_rover"}:
            node["extras"] = {**(node.get("extras") or {}), "spacefaceAsset": contract}
    encoded = json.dumps(gltf, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
    encoded += b" " * ((4 - len(encoded) % 4) % 4)
    tail = bytes(data[json_end:])
    total = 12 + 8 + len(encoded) + len(tail)
    out = bytearray(struct.pack("<4sII", b"glTF", 2, total))
    out.extend(struct.pack("<II", len(encoded), 0x4E4F534A))
    out.extend(encoded)
    out.extend(tail)
    path.write_bytes(out)


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
    ):
        for item in list(bucket):
            bucket.remove(item)


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
            import time
            time.sleep(0.25 * (attempt + 1))
    if last_err is not None:
        raise last_err
    img.pack()
    img.filepath_raw = ""
    tmp_path.replace(path)
    sanitize_png(path)
    return img


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


def role_maps(role, rgb, size=None, prefix=None):
    """Return (albedo, orm, normal) float32 HxWx4 arrays. Does not write files."""
    size = TEX if size is None else size
    br, bg, bb = rgb
    y, x = np.mgrid[0:size, 0:size]
    x = x.astype(np.uint32)
    y = y.astype(np.uint32)
    gf = h01_arr(x, y, 11)
    gf2 = h01_arr(x // 3, y // 3, 29)
    gf3 = h01_arr(x // 7, y // 7, 47)

    if role == "livery":
        pw, ph = 192, 128
    elif role == "chevron":
        pw, ph = 48, 48
    elif role == "steel":
        pw, ph = 28, 12
    elif role == "track":
        pw, ph = 40, 18
    elif role == "bit":
        pw, ph = 20, 20
    elif role == "rubble":
        pw, ph = 36, 36
    elif role == "scar":
        pw, ph = 40, 28
    else:
        pw, ph = 0, 0

    if pw == 0:
        dx = np.full((size, size), 99.0, dtype=np.float32)
        dy = np.full((size, size), 99.0, dtype=np.float32)
        seam = np.zeros((size, size), dtype=np.float32)
        soft = np.zeros((size, size), dtype=np.float32)
    else:
        mx = np.mod(x, np.uint32(pw)).astype(np.int32)
        my = np.mod(y, np.uint32(ph)).astype(np.int32)
        dx = np.minimum(mx, pw - mx).astype(np.float32)
        dy = np.minimum(my, ph - my).astype(np.float32)
        dx, dy = np.broadcast_arrays(dx, dy)
        dx = np.ascontiguousarray(dx)
        dy = np.ascontiguousarray(dy)
        seam = ((dx <= 1) | (dy <= 1)).astype(np.float32)
        mind = np.minimum(dx, dy)
        soft = np.clip(1.0 - mind / 3.0, 0.0, 1.0) * (mind <= 3).astype(np.float32)

    dirt = np.clip(0.10 * gf + 0.16 * gf2 + 0.08 * gf3 + soft * 0.22 + seam * 0.18, 0.0, 1.0)
    edge = ((dx <= 3) | (dy <= 3)).astype(np.float32) if pw else np.zeros((size, size), dtype=np.float32)
    cav = 0.12 + 0.28 * gf2 + soft * 0.25 + seam * 0.30
    chip = (gf > 0.92).astype(np.float32) * edge

    if role == "livery":
        panel_x = (x // np.uint32(max(1, pw))).astype(np.int32)
        panel_y = (y // np.uint32(max(1, ph))).astype(np.int32)
        dark_course = ((panel_x + panel_y) % 2 == 0).astype(np.float32)
        r = np.clip(br * (1.0 - dirt * 0.22 - chip * 0.45 - dark_course * 0.16) + chip * 0.18, 0, 1)
        g = np.clip(bg * (1.0 - dirt * 0.20 - chip * 0.40 - dark_course * 0.14) + chip * 0.14, 0, 1)
        b = np.clip(bb * (1.0 - dirt * 0.14 - chip * 0.28 - dark_course * 0.10) + chip * 0.08, 0, 1)
        # Roughness break-up so the key does not clip the deck to cream.
        rough = np.clip(0.62 + dirt * 0.20 - edge * 0.03 + chip * 0.08 + gf * 0.06 + dark_course * 0.08, 0.20, 0.95)
        metal = np.clip(0.05 + chip * 0.28 + edge * 0.02, 0.0, 1.0)
    elif role == "chevron":
        r = np.clip(br * (1.0 - dirt * 0.15) + 0.04 * gf, 0, 1)
        g = np.clip(bg * (1.0 - dirt * 0.12) + 0.03 * gf, 0, 1)
        b = np.clip(bb * (1.0 - dirt * 0.10), 0, 1)
        rough = np.clip(0.64 + dirt * 0.12, 0.04, 0.95)
        metal = np.clip(0.14 + edge * 0.08, 0.0, 1.0)
    elif role == "steel":
        heat = np.clip(0.45 - x.astype(np.float32) / float(size), 0, 1) * 0.28
        r = np.clip(br * (0.88 + gf * 0.14) + heat * 0.30, 0, 1)
        g = np.clip(bg * (0.90 + gf * 0.10) + heat * 0.08, 0, 1)
        b = np.clip(bb * (0.92 + (1 - gf) * 0.08), 0, 1)
        rough = np.clip(0.30 + dirt * 0.18 + heat * 0.10, 0.04, 0.95)
        metal = np.clip(0.82 + edge * 0.08, 0.0, 1.0)
    elif role == "track":
        groove = ((dx <= 2) | ((np.mod(x, np.uint32(8)) <= 1) if pw else False)).astype(np.float32)
        r = np.clip(br * (0.92 + gf * 0.16) - groove * 0.10 + dirt * 0.05, 0, 1)
        g = np.clip(bg * (0.90 + gf * 0.12) - groove * 0.08 + dirt * 0.04, 0, 1)
        b = np.clip(bb * (0.86 + gf * 0.08) - groove * 0.06, 0, 1)
        rough = np.clip(0.82 + dirt * 0.10 - groove * 0.04, 0.04, 0.95)
        metal = np.clip(0.08 + groove * 0.06, 0.0, 1.0)
    elif role == "glass":
        r = np.clip(br + dirt * 0.04, 0, 1)
        g = np.clip(bg + dirt * 0.03, 0, 1)
        b = np.clip(bb + dirt * 0.02, 0, 1)
        rough = np.clip(0.12 + dirt * 0.10, 0.04, 0.95)
        metal = np.full((size, size), 0.04, dtype=np.float32)
    elif role == "bit":
        # Heat tint only in the top fifth of the tile (tip UVs). The rest stays
        # tool steel #848b93 so BIT_NOT_PINK cannot see a salmon field.
        heat = np.clip((y.astype(np.float32) / float(size) - 0.80) / 0.20, 0, 1)
        r = np.clip(br * (0.96 + gf * 0.08) + heat * 0.28, 0, 1)
        g = np.clip(bg * (0.94 + gf * 0.06) + heat * 0.04, 0, 1)
        b = np.clip(bb * (0.96 + (1 - gf) * 0.04) - heat * 0.22, 0, 1)
        rough = np.clip(0.40 + dirt * 0.16 - heat * 0.08, 0.04, 0.95)
        metal = np.clip(0.82 + edge * 0.08, 0.0, 1.0)
    elif role == "lamp":
        r = np.clip(br * (0.92 + gf * 0.08), 0, 1)
        g = np.clip(bg * (0.90 + gf * 0.06), 0, 1)
        b = np.clip(bb * (0.82 + gf * 0.04), 0, 1)
        rough = np.clip(0.24 + dirt * 0.08, 0.04, 0.95)
        metal = np.full((size, size), 0.05, dtype=np.float32)
    elif role == "rubble":
        r = np.clip(br * (0.82 + gf2 * 0.22) - dirt * 0.10, 0, 1)
        g = np.clip(bg * (0.80 + gf * 0.14) - dirt * 0.08, 0, 1)
        b = np.clip(bb * (0.70 + gf3 * 0.10), 0, 1)
        rough = np.clip(0.86 + dirt * 0.08, 0.04, 0.95)
        metal = np.clip(0.08 + gf2 * 0.18, 0.0, 1.0)
    elif role == "scar":
        r = np.clip(br * (0.70 + gf * 0.10) + chip * 0.12, 0, 1)
        g = np.clip(bg * (0.62 + gf * 0.08), 0, 1)
        b = np.clip(bb * (0.48 + gf * 0.06), 0, 1)
        rough = np.clip(0.58 + dirt * 0.16, 0.04, 0.95)
        metal = np.clip(0.58 + chip * 0.20, 0.0, 1.0)
    else:
        r = np.full((size, size), br, dtype=np.float32)
        g = np.full((size, size), bg, dtype=np.float32)
        b = np.full((size, size), bb, dtype=np.float32)
        rough = np.full((size, size), 0.5, dtype=np.float32)
        metal = np.full((size, size), 0.2, dtype=np.float32)

    ao = np.clip(1.0 - cav * 0.45 - dirt * 0.18, 0.18, 1.0)
    if pw:
        seam_nx = np.sign(dx - 1.5) * ((dx <= 3).astype(np.float32))
        seam_ny = np.sign(dy - 1.5) * ((dy <= 3).astype(np.float32))
        slope_x = (dx / float(max(1, pw)) - 0.5) * ((dx <= 10).astype(np.float32) * 0.55 + 0.20)
        slope_y = (dy / float(max(1, ph)) - 0.5) * ((dy <= 10).astype(np.float32) * 0.55 + 0.20)
        nx = np.clip(0.5 + slope_x * 0.22 + seam_nx * 0.16, 0, 1)
        ny = np.clip(0.5 + slope_y * 0.22 + seam_ny * 0.16, 0, 1)
    else:
        nx = np.full((size, size), 0.5, dtype=np.float32)
        ny = np.full((size, size), 0.5, dtype=np.float32)
    nxd = nx * 2.0 - 1.0
    nyd = ny * 2.0 - 1.0
    nzd = np.sqrt(np.clip(1.0 - nxd * nxd - nyd * nyd, 0.0, 1.0))
    nz = np.clip(nzd * 0.5 + 0.5, 0, 1)
    nx = np.round(nx * 8.0) / 8.0
    ny = np.round(ny * 8.0) / 8.0
    nz = np.round(nz * 8.0) / 8.0

    def plane(arr):
        arr = np.asarray(arr, dtype=np.float32)
        if arr.shape != (size, size):
            arr = np.broadcast_to(arr, (size, size)).copy()
        return arr

    r, g, b = plane(r), plane(g), plane(b)
    ao, rough, metal = plane(ao), plane(rough), plane(metal)
    nx, ny, nz = plane(nx), plane(ny), plane(nz)
    emit = np.full((size, size), float(EMIT_ALPHA.get(role, 0.0)), dtype=np.float32)
    ones = np.ones((size, size, 1), dtype=np.float32)
    albedo = np.concatenate([r[..., None], g[..., None], b[..., None], emit[..., None]], axis=2)
    orm = np.concatenate([ao[..., None], rough[..., None], metal[..., None], ones], axis=2)
    nrm = np.concatenate([nx[..., None], ny[..., None], nz[..., None], ones], axis=2)
    return albedo, orm, nrm


def atlas_gutter(size):
    return max(1, int(round(4 * size / 2048.0)))


def tile_rect_px(index, size):
    tile = size // 4
    col, row = index % 4, index // 4
    gutter = atlas_gutter(size)
    u0 = col * tile
    v0 = row * tile
    return u0, v0, tile, gutter


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
    left = patch[:, 0]
    right = patch[:, -1]
    top = patch[0, :]
    bot = patch[-1, :]
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
    tile = size // 4
    inner = tile - 2 * gutter
    mapping = {}
    for role, index in ATLAS_TILE.items():
        maps = role_maps(role, ROLE_RGB[role], size=inner)
        u0, v0, tile_px, gut = tile_rect_px(index, size)
        paste_clamped(albedo, maps[0], u0, v0, tile_px, gut)
        paste_clamped(orm, maps[1], u0, v0, tile_px, gut)
        paste_clamped(nrm, maps[2], u0, v0, tile_px, gut)
        mapping[role] = {
            "tile": index,
            "col": index % 4,
            "row": index // 4,
            "px": [u0, v0, tile_px, tile_px],
            "gutter": gut,
            "inner": inner,
        }
    for index, (role, rgb) in RESERVED_TILES.items():
        maps = role_maps(role, rgb, size=inner)
        u0, v0, tile_px, gut = tile_rect_px(index, size)
        paste_clamped(albedo, maps[0], u0, v0, tile_px, gut)
        paste_clamped(orm, maps[1], u0, v0, tile_px, gut)
        paste_clamped(nrm, maps[2], u0, v0, tile_px, gut)
        mapping[f"reserved_{index}"] = {
            "tile": index,
            "role_neutral": role,
            "col": index % 4,
            "row": index // 4,
            "gutter": gut,
        }
    bake_ao_into_albedo_arrays(albedo, orm)
    return albedo, orm, nrm, mapping


def bake_ao_into_albedo_arrays(albedo, orm):
    """Bake authored atlas AO (ORM.R) into atlas albedo. Cycles bake is not byte-stable on 5.1."""
    factor = 0.82 + 0.18 * orm[..., 0]
    albedo[..., 0] *= factor
    albedo[..., 1] *= factor
    albedo[..., 2] *= factor
    np.clip(albedo, 0.0, 1.0, out=albedo)
    np.divide(np.round(albedo * 255.0), 255.0, out=albedo)


def bake_ao_into_albedo(albedo_img, orm_img):
    """No-op at mesh time: AO is already multiplied into the atlas arrays before the PNG write."""
    return


def principled(material):
    material.use_nodes = True
    material.node_tree.nodes.clear()
    output = material.node_tree.nodes.new("ShaderNodeOutputMaterial")
    bsdf = material.node_tree.nodes.new("ShaderNodeBsdfPrincipled")
    material.node_tree.links.new(bsdf.outputs["BSDF"], output.inputs["Surface"])
    return bsdf


def wire_atlas(material, bsdf, maps, coat=0.0):
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
    nmap.inputs["Strength"].default_value = 1.15
    links.new(tex_n.outputs["Color"], nmap.inputs["Color"])
    links.new(nmap.outputs["Normal"], bsdf.inputs["Normal"])
    if "Coat Weight" in bsdf.inputs and coat > 0:
        bsdf.inputs["Coat Weight"].default_value = coat
        bsdf.inputs["Coat Roughness"].default_value = 0.10
    if "Emission Color" in bsdf.inputs:
        links.new(tex_a.outputs["Color"], bsdf.inputs["Emission Color"])
        links.new(tex_a.outputs["Alpha"], bsdf.inputs["Emission Strength"])


def create_atlas(lod):
    size = TEX_BY_LOD[lod]
    albedo, orm, nrm, mapping = pack_atlas(size)
    prefix = f"rover_atlas_lod{lod}"
    maps = (
        write_pixels(f"{prefix}_basecolor", albedo, size, "sRGB"),
        write_pixels(f"{prefix}_orm", orm, size, "Non-Color"),
        write_pixels(f"{prefix}_normal", nrm, size, "Non-Color"),
    )
    material = bpy.data.materials.new(f"Material_Atlas_LOD{lod}")
    material.name = f"Material_Atlas_LOD{lod}"
    bsdf = principled(material)
    wire_atlas(material, bsdf, maps)
    material["spacefaceRole"] = "atlas"
    if hasattr(material, "blend_method"):
        try:
            material.blend_method = "OPAQUE"
        except TypeError:
            pass
    return maps, material, mapping


def create_role_materials(lod):
    mats = {}
    for name, role in (
        ("Material_Livery", "livery"),
        ("Material_Chevron", "chevron"),
        ("Material_Steel", "steel"),
        ("Material_Track", "track"),
        ("Material_Glass", "glass"),
        ("Material_Bit", "bit"),
        ("Material_Lamp", "lamp"),
        ("Material_Rubble", "rubble"),
        ("Material_Scar", "scar"),
    ):
        material = bpy.data.materials.new(f"{name}_LOD{lod}")
        material.name = f"{name}_LOD{lod}"
        bsdf = principled(material)
        rgb = ROLE_RGB[role]
        bsdf.inputs["Base Color"].default_value = (*rgb, 1)
        material["spacefaceRole"] = role
        mats[name] = material
    mats["Material_Hull"] = mats["Material_Livery"]
    mats["Material_Armor"] = mats["Material_Chevron"]
    mats["Material_Mechanical"] = mats["Material_Steel"]
    mats["Material_Warning"] = mats["Material_Chevron"]
    mats["Material_Canopy"] = mats["Material_Glass"]
    return mats


def role_of(obj):
    role = obj.get("spacefaceRole")
    if role in ATLAS_TILE:
        return role
    if obj.type == "MESH" and obj.data.materials:
        mat = obj.data.materials[0]
        if mat is not None:
            role = mat.get("spacefaceRole")
            if role in ATLAS_TILE:
                return role
            lower = mat.name.lower()
            for key in ATLAS_TILE:
                if key in lower:
                    return key
    raise RuntimeError(f"no atlas role for mesh {obj.name!r}")


def remap_uvs_to_tile(obj, role, size):
    if obj.type != "MESH" or not obj.data.uv_layers:
        uv = obj.data.uv_layers.new(name="UVMap") if obj.type == "MESH" else None
        if uv is None:
            return
    layer = obj.data.uv_layers.active
    ou, ov, scale, _rect = tile_uv_rect(role, size)
    v0f = float(obj.get("sf_v0", 0.0))
    v1f = float(obj.get("sf_v1", 1.0))
    for item in layer.data:
        u = min(1.0, max(0.0, float(item.uv.x)))
        v = min(1.0, max(0.0, float(item.uv.y)))
        v = v0f + v * (v1f - v0f)
        item.uv = (ou + u * scale, ov + v * scale)


def assert_uvs_in_tile(obj, role, size):
    if obj.type != "MESH" or not obj.data.uv_layers.active or not obj.data.loops:
        return
    _ou, _ov, _sc, (u0, v0, u1, v1) = tile_uv_rect(role, size)
    eps = 1.5 / float(size)
    layer = obj.data.uv_layers.active
    for item in layer.data:
        u, v = float(item.uv.x), float(item.uv.y)
        if u < u0 - eps or u > u1 + eps or v < v0 - eps or v > v1 + eps:
            raise RuntimeError(
                f"UV of {obj.name!r} role={role} at ({u:.5f},{v:.5f}) "
                f"outside tile ({u0:.5f},{v0:.5f})-({u1:.5f},{v1:.5f})"
            )


def assign_atlas(obj, atlas_mat):
    role = obj.get("spacefaceRole")
    obj.data.materials.clear()
    obj.data.materials.append(atlas_mat)
    if role in ATLAS_TILE:
        obj["spacefaceRole"] = role


def link_object(obj, collection):
    for current in list(obj.users_collection):
        current.objects.unlink(obj)
    collection.objects.link(obj)
    return obj


def add_empty(name, loc, collection, parent=None, size=0.06):
    obj = bpy.data.objects.new(name, None)
    collection.objects.link(obj)
    obj.empty_display_type = "PLAIN_AXES"
    obj.empty_display_size = size
    obj.location = loc
    if parent:
        obj.parent = parent
    # Runtime contract marker: assetLoader.collectTags reads the namespaced key rather
    # than an ad-hoc DCC property. Keep the legacy `socket` breadcrumb for source audits,
    # but make the marker survive release/package compilation as a real socket.
    obj["socket"] = True
    obj["spacefaceSocket"] = True
    return obj


def parent_keep(obj, parent):
    mw = obj.matrix_world.copy()
    obj.parent = parent
    obj.matrix_parent_inverse = parent.matrix_world.inverted()
    obj.matrix_world = mw


def add_mesh(name, verts, faces, material, collection, bevel=0.008, uvs=None):
    mesh = bpy.data.meshes.new(f"{name}_Mesh")
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    if uvs:
        uv = mesh.uv_layers.new(name="UVMap")
        for loop in mesh.loops:
            uv.data[loop.index].uv = uvs[loop.index]
    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)
    return finish_mesh(obj, material, bevel)


def loft_from_rings(name, rings, material, collection, bevel, cap=True):
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
    return add_mesh(name, verts, faces, material, collection, bevel)


def stadium_xz(xc, zc, half_len, radius, n_st, n_arc):
    pts = []
    for i in range(n_st):
        t = i / max(1, n_st)
        pts.append((xc - half_len + 2.0 * half_len * t, zc - radius))
    for i in range(n_arc):
        a = -math.pi / 2.0 + math.pi * (i / max(1, n_arc))
        pts.append((xc + half_len + math.cos(a) * radius, zc + math.sin(a) * radius))
    for i in range(n_st):
        t = i / max(1, n_st)
        pts.append((xc + half_len - 2.0 * half_len * t, zc + radius))
    for i in range(n_arc):
        a = math.pi / 2.0 + math.pi * (i / max(1, n_arc))
        pts.append((xc - half_len + math.cos(a) * radius, zc + math.sin(a) * radius))
    return pts


def add_stadium_solid(name, xc, y0, y1, zc, half_len, radius, material, collection, bevel, n_st, n_arc):
    ring_a = [(p[0], y0, p[1]) for p in stadium_xz(xc, zc, half_len, radius, n_st, n_arc)]
    ring_b = [(p[0], y1, p[1]) for p in stadium_xz(xc, zc, half_len, radius, n_st, n_arc)]
    return loft_from_rings(name, [ring_a, ring_b], material, collection, bevel, cap=True)


def add_tread_ribbon(name, xc, y0, y1, zc, half_len, radius, thick, material, collection, n_st, n_arc):
    path = stadium_xz(xc, zc, half_len + thick * 0.55, radius + thick * 0.55, n_st, n_arc)
    n = len(path)
    verts = []
    faces = []
    loop_uv = []
    for i, (x, z) in enumerate(path):
        nxt = path[(i + 1) % n]
        tx, tz = nxt[0] - x, nxt[1] - z
        length = math.hypot(tx, tz) or 1.0
        tx, tz = tx / length, tz / length
        nx, nz = tz, -tx
        for oy in (y0, y1):
            verts.append((x + nx * thick * 0.5, oy, z + nz * thick * 0.5))
            verts.append((x - nx * thick * 0.15, oy, z - nz * thick * 0.15))
    for i in range(n):
        a = i * 4
        b = ((i + 1) % n) * 4
        quads = (
            (a, b, b + 2, a + 2),
            (a + 1, a + 3, b + 3, b + 1),
            (a, a + 1, b + 1, b),
            (a + 2, b + 2, b + 3, a + 3),
        )
        u0 = i / float(n)
        u1 = (i + 1) / float(n)
        uv_quads = (
            ((u0, 0.0), (u1, 0.0), (u1, 1.0), (u0, 1.0)),
            ((u0, 0.0), (u0, 1.0), (u1, 1.0), (u1, 0.0)),
            ((u0, 0.15), (u0, 0.0), (u1, 0.0), (u1, 0.15)),
            ((u0, 1.0), (u1, 1.0), (u1, 0.85), (u0, 0.85)),
        )
        for q, uvq in zip(quads, uv_quads):
            faces.append(q)
            loop_uv.extend(uvq)
    return add_mesh(name, verts, faces, material, collection, bevel=0.003, uvs=loop_uv)


def add_box(name, loc, scale, material, collection, bevel=0.008, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cube_add(location=loc, rotation=rot)
    obj = link_object(bpy.context.object, collection)
    obj.name = name
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return finish_mesh(obj, material, bevel)


def add_cylinder(name, loc, radius, depth, material, collection, vertices=12, bevel=0.004, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cylinder_add(
        vertices=vertices, radius=radius, depth=depth, location=loc, rotation=rot,
    )
    obj = link_object(bpy.context.object, collection)
    obj.name = name
    return finish_mesh(obj, material, bevel)


def add_hex_bolt(name, loc, material, collection, bevel=0.001):
    return add_cylinder(name, loc, 0.018, 0.016, material, collection, vertices=6, bevel=bevel, rot=(0, 0, 0))


def add_boxed_beam(name, x0, x1, y, z, w0, w1, h0, h1, material, collection, bevel, stations=3):
    rings = []
    count = max(2, int(stations))
    for i in range(count):
        t = i / float(count - 1)
        x = x0 + (x1 - x0) * t
        w = w0 + (w1 - w0) * t
        h = h0 + (h1 - h0) * t
        hw, hh = w * 0.5, h * 0.5
        rings.append((
            (x, y - hw, z - hh),
            (x, y + hw, z - hh),
            (x, y + hw, z + hh),
            (x, y - hw, z + hh),
        ))
    return loft_from_rings(name, rings, material, collection, bevel, cap=True)


def stadium_xy_ring(xc, yc, half_len, radius, n_st, n_arc):
    pts = []
    n_st = max(1, int(n_st))
    n_arc = max(2, int(n_arc))
    for i in range(n_st):
        t = i / float(n_st)
        pts.append((xc - half_len + 2.0 * half_len * t, yc + radius))
    for i in range(n_arc):
        a = math.pi / 2.0 - math.pi * (i / float(n_arc))
        pts.append((xc + half_len + math.cos(a) * radius, yc + math.sin(a) * radius))
    for i in range(n_st):
        t = i / float(n_st)
        pts.append((xc + half_len - 2.0 * half_len * t, yc - radius))
    for i in range(n_arc):
        a = -math.pi / 2.0 - math.pi * (i / float(n_arc))
        pts.append((xc - half_len + math.cos(a) * radius, yc + math.sin(a) * radius))
    return pts


def add_stadium_xy_solid(name, xc, yc, z0, z1, half_len, radius, material, collection, bevel, n_st, n_arc):
    ring = stadium_xy_ring(xc, yc, half_len, radius, n_st, n_arc)
    ring_a = [(p[0], p[1], z0) for p in ring]
    ring_b = [(p[0], p[1], z1) for p in ring]
    return loft_from_rings(name, [ring_a, ring_b], material, collection, bevel, cap=True)


def add_stadium_xy_belt(name, xc, yc, z0, z1, half_len, radius, thick, material, collection, bevel, n_st, n_arc):
    outer = stadium_xy_ring(xc, yc, half_len, radius, n_st, n_arc)
    inner = stadium_xy_ring(xc, yc, half_len, max(0.02, radius - thick), n_st, n_arc)
    n = len(outer)
    verts = []
    for ring, z in ((outer, z0), (inner, z0), (inner, z1), (outer, z1)):
        for p in ring:
            verts.append((p[0], p[1], z))
    faces = []
    loop_uv = []
    def add_strip(a, b):
        for i in range(n):
            j = (i + 1) % n
            faces.append((a + i, b + i, b + j, a + j))
            u0, u1 = i / float(n), (i + 1) / float(n)
            loop_uv.extend(((u0, 0.0), (u0, 1.0), (u1, 1.0), (u1, 0.0)))
    add_strip(0, n)
    add_strip(n, 2 * n)
    add_strip(2 * n, 3 * n)
    add_strip(3 * n, 0)
    return add_mesh(name, verts, faces, material, collection, bevel=bevel, uvs=loop_uv)


def stadium_xy_path(xc, yc, half_len, radius, n_pts):
    peri = 4.0 * half_len + 2.0 * math.pi * radius
    pts = []
    for i in range(n_pts):
        s = (i / float(n_pts)) * peri
        straight = 2.0 * half_len
        arc = math.pi * radius
        if s < straight:
            t = s / straight
            pts.append((xc - half_len + 2.0 * half_len * t, yc + radius, math.pi / 2.0))
        elif s < straight + arc:
            t = (s - straight) / arc
            a = math.pi / 2.0 - math.pi * t
            pts.append((xc + half_len + math.cos(a) * radius, yc + math.sin(a) * radius, a))
        elif s < 2.0 * straight + arc:
            t = (s - straight - arc) / straight
            pts.append((xc + half_len - 2.0 * half_len * t, yc - radius, -math.pi / 2.0))
        else:
            t = (s - 2.0 * straight - arc) / arc
            a = -math.pi / 2.0 - math.pi * t
            pts.append((xc - half_len + math.cos(a) * radius, yc + math.sin(a) * radius, a))
    return pts


def add_track_pads(prefix, xc, yc, half_len, radius, half_w, z_mid, n_pads, material, collection, bevel):
    pad_len = (4.0 * half_len + 2.0 * math.pi * radius) / float(max(1, n_pads)) * 0.58
    pad_h = 0.110
    pad_t = 0.050
    made = []
    for i, (x, y, ang) in enumerate(stadium_xy_path(xc, yc, half_len, radius, n_pads)):
        loc = (x, y, z_mid)
        rot = (0.0, 0.0, ang - math.pi / 2.0)
        pad = add_box(
            f"{prefix}_Pad_{i:02d}", loc,
            (pad_len * 0.5, pad_t * 0.5, pad_h * 0.5),
            material, collection, bevel=bevel, rot=rot,
        )
        made.append(pad)
    return made


def add_track_lip_catches(prefix, xc, yc, half_len, radius, material, collection, lod):
    """Short steel catches on the outer stadium. Not a continuous wire ring."""
    made = []
    for i, (x, y, ang) in enumerate(stadium_xy_path(xc, yc, half_len, radius, 12)):
        if i % 2:
            continue
        nx, ny = math.cos(ang), math.sin(ang)
        loc = (x - nx * 0.012, y - ny * 0.012, 0.59)
        catch = add_box(
            f"{prefix}_{i:02d}",
            loc,
            (0.055, 0.010, 0.032),
            material, collection,
            bevel=0.002 if lod == 0 else 0.0,
            rot=(0.0, 0.0, ang - math.pi / 2.0),
        )
        catch["sf_body"] = True
        made.append(catch)
    return made


def add_faceted_bit(prefix, loc, bit_mat, steel, collection, lod, bevel):
    tx, ty, tz = loc
    head = add_cylinder(
        f"{prefix}Head", (tx - 0.14, ty, tz), 0.078, 0.26,
        bit_mat, collection, vertices=8 if lod else 8,
        bevel=bevel, rot=(0, math.pi / 2, 0),
    )
    head["sf_boom"] = True
    head["sf_v0"] = 0.0
    head["sf_v1"] = 0.62
    collar = add_box(
        f"{prefix}Collar", (tx - 0.22, ty, tz), (0.050, 0.062, 0.062),
        bit_mat, collection, bevel=bevel, rot=(0, 0, 0),
    )
    collar["sf_boom"] = True
    collar["sf_v0"] = 0.0
    collar["sf_v1"] = 0.50
    tip = add_box(
        f"{prefix}Tip", (tx - 0.02, ty, tz), (0.070, 0.058, 0.058),
        steel, collection, bevel=0.0, rot=(0, 0, math.pi / 8),
    )
    tip["sf_boom"] = True
    tip["sf_v0"] = 0.50
    tip["sf_v1"] = 0.85
    point = add_box(
        f"{prefix}Point", (tx + 0.024, ty, tz), (0.020, 0.016, 0.016),
        steel, collection, bevel=0.0, rot=(0, 0, math.pi / 8),
    )
    point["sf_boom"] = True
    point["sf_v0"] = 0.85
    point["sf_v1"] = 1.0
    return head


def count_tris(obj):
    if obj.type != "MESH" or not obj.data:
        return 0
    return sum(max(0, len(poly.vertices) - 2) for poly in obj.data.polygons)


def decimate_to_budget(collection, budget):
    meshes = [
        obj for obj in collection.all_objects
        if obj.type == "MESH"
        and not obj.name.startswith("hopper_fill_")
        and obj.name not in {"hopper_lid", "track_L", "track_R", "scar_plate"}
    ]
    fixed = sum(
        count_tris(obj) for obj in collection.all_objects
        if obj.type == "MESH" and obj not in meshes
    )
    total = fixed + sum(count_tris(obj) for obj in meshes)
    mutable = total - fixed
    if total <= budget or mutable <= 0:
        return total
    # Keep authored hook meshes intact (treads, hopper lid, scar plate), and spend the
    # reduction on merged static surfaces. This makes the LOD0 budget a real bound without
    # changing silhouette-driving hooks or material assignments.
    target_mutable = max(0.0, float(budget - fixed))
    ratio = max(0.08, min(1.0, (target_mutable / float(mutable)) * 0.96))
    for obj in meshes:
        if count_tris(obj) < 24:
            continue
        bpy.ops.object.select_all(action="DESELECT")
        obj.select_set(True)
        bpy.context.view_layer.objects.active = obj
        mod = obj.modifiers.new("LodDecimate", "DECIMATE")
        mod.decimate_type = "COLLAPSE"
        mod.ratio = ratio
        mod_name = mod.name
        bpy.ops.object.modifier_apply(modifier=mod_name)
        obj.select_set(False)
    return sum(count_tris(obj) for obj in meshes)


def recalc_mesh(obj):
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    try:
        bpy.ops.mesh.remove_doubles(threshold=0.0004)
    except TypeError:
        bpy.ops.mesh.merge_by_distance(distance=0.0004)
    bpy.ops.mesh.normals_make_consistent(inside=False)
    bpy.ops.object.mode_set(mode="OBJECT")
    obj.data.update()
    return obj


def shade_and_uv(obj, skip_uv=False):
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    try:
        bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    except Exception:
        pass
    apply_modifiers(obj)
    try:
        bpy.ops.object.shade_smooth_by_angle(angle=math.radians(28))
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
    mod_name = tri.name
    bpy.ops.object.modifier_apply(modifier=mod_name)
    obj.select_set(False)


def finish_mesh_for_atlas(obj, atlas_mat, size, skip_uv=False):
    shade_and_uv(obj, skip_uv=skip_uv)
    role = role_of(obj)
    remap_uvs_to_tile(obj, role, size)
    assert_uvs_in_tile(obj, role, size)
    assign_atlas(obj, atlas_mat)
    obj["spacefaceRole"] = role
    return role


def join_group(objects, name, parent):
    objects = [obj for obj in objects if obj.data and len(obj.data.vertices) > 0]
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
    active = objects[0]
    bpy.context.view_layer.objects.active = active
    if len(objects) > 1:
        bpy.ops.object.join()
    active = bpy.context.view_layer.objects.active
    active.name = name
    if active.data:
        active.data.name = name
    parent_keep(active, parent)
    return active


def measured_bbox(objects):
    mins = Vector((1e9, 1e9, 1e9))
    maxs = Vector((-1e9, -1e9, -1e9))
    count = 0
    for obj in objects:
        if obj.type != "MESH":
            continue
        if obj.name.startswith("hopper_fill_"):
            continue
        for corner in obj.bound_box:
            world = obj.matrix_world @ Vector(corner)
            mins.x = min(mins.x, world.x)
            mins.y = min(mins.y, world.y)
            mins.z = min(mins.z, world.z)
            maxs.x = max(maxs.x, world.x)
            maxs.y = max(maxs.y, world.y)
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


def assert_bbox(bbox, lod):
    tx, ty, tz = TARGET_BBOX
    got = bbox["sizeWu"]
    errors = []
    for axis, value, want in (("X", got[0], tx), ("Y", got[1], ty), ("Z", got[2], tz)):
        err = abs(value - want) / want
        if err > 0.05:
            errors.append(f"{axis} {value:.4f} vs {want} ({err * 100:.1f}%)")
    if errors:
        raise RuntimeError(f"lod{lod} bbox >5% off: {', '.join(errors)}")


def assert_hooks(collection):
    names = {obj.name for obj in collection.all_objects}
    found = {}
    missing = []
    for hook in HOOK_NAMES:
        ok = hook in names
        found[hook] = "found" if ok else "missing"
        if not ok:
            missing.append(hook)
    if missing:
        raise RuntimeError(f"missing hooks: {missing}")
    return found


def add_chevron_plate(tag, x, y0, y1, z, chevron, steel, collection, lod, bevel):
    plate = add_folded_sheet(
        tag,
        (x - 0.055, y0, z), (x + 0.055, y0, z),
        (x + 0.055, y1, z), (x - 0.055, y1, z),
        0.022, chevron, collection, bevel,
    )
    if lod <= 1:
        add_hex_bolt(f"{tag}_BoltA", (x, y0 + 0.04, z + 0.012), steel, collection, bevel=0.0 if lod else 0.001)
        add_hex_bolt(f"{tag}_BoltB", (x, y1 - 0.04, z + 0.012), steel, collection, bevel=0.0 if lod else 0.001)
    return plate


def build_lod(lod, mats, atlas_mat, atlas_maps):
    size = TEX_BY_LOD[lod]
    collection = bpy.data.collections.new(f"ROVER_LOD{lod}")
    bpy.context.scene.collection.children.link(collection)
    livery = mats["Material_Livery"]
    chevron = mats["Material_Chevron"]
    steel = mats["Material_Steel"]
    track_mat = mats["Material_Track"]
    glass = mats["Material_Glass"]
    bit_mat = mats["Material_Bit"]
    lamp_mat = mats["Material_Lamp"]
    rubble = mats["Material_Rubble"]
    scar_mat = mats["Material_Scar"]

    bevel_body = 0.014 if lod == 0 else 0.0
    bevel_plate = 0.006 if lod == 0 else 0.0
    n_st = 6 if lod == 0 else (4 if lod == 1 else 3)
    n_arc = n_st
    cyl_v = 10 if lod == 0 else (8 if lod == 1 else 6)

    root = add_empty("rover", (0, 0, 0), collection, size=0.12)
    root["spacefaceAsset"] = {
        "contractVersion": 1,
        "assetId": "rover",
        "partId": "rover",
        "lod": f"lod{lod}",
        "slot": "place",
        "category": "works",
        "forward": "+X",
        "up": "+Z",
        "starboard": "-Y",
        "unit": "metre",
        "normalConvention": "OpenGL",
        "ormChannels": "R=AO,G=Roughness,B=Metallic",
        "textureCompression": "PNG-source",
        "atlas": "4x4",
    }

    # One continuous deck at z 0.32–0.46 with real side walls. Cab is a separate
    # raised house. Well is a hole with a floor — not a gap to the pad.
    hull_specs = (
        (BODY_AFT_X, 0.54, DECK_Z0, DECK_Z1),
        (-0.58, 0.54, DECK_Z0, DECK_Z1),
        (-0.18, 0.36, DECK_Z0, DECK_Z1),
        (0.14, 0.26, DECK_Z0, DECK_Z1),
        (BODY_FORE_X, 0.20, DECK_Z0, DECK_Z1),
    )
    hull = center_loft("HullCore", hull_specs, livery, collection, bevel=bevel_body)
    boolean_cut_box(hull, "HopperWell", (WELL_CX, 0.0, 0.38), (WELL_HX, WELL_HY, 0.20))
    recalc_mesh(hull)
    hull["sf_body"] = True

    belly_specs = (
        (-0.18, 0.36, 0.08, DECK_Z0),
        (0.08, 0.34, 0.08, DECK_Z0),
        (0.30, 0.30, 0.08, DECK_Z0),
    )
    belly = center_loft("Belly", belly_specs, steel, collection, bevel=bevel_body)
    belly["sf_body"] = True

    cab = center_loft(
        "CabHouse",
        (
            (CAB_CX - CAB_HX, CAB_HY * 0.78, DECK_Z1, CAB_ROOF_Z),
            (CAB_CX, CAB_HY, DECK_Z1, CAB_ROOF_Z),
            (CAB_CX + CAB_HX, CAB_HY * 0.70, DECK_Z1, CAB_ROOF_Z),
        ),
        livery, collection, bevel=bevel_body,
    )
    recalc_mesh(cab)
    # Cut the windshield pocket through the cab cap so the lowered pane is a true opening,
    # rather than a dark card hidden inside a solid roof when the clay depth pass runs.
    cab_pane_x0 = CAB_CX - CAB_HX + 0.02
    cab_pane_x1 = CAB_CX + CAB_HX + 0.004
    boolean_cut_box(
        cab,
        "CabPaneRecess",
        ((cab_pane_x0 + cab_pane_x1) * 0.5, 0.0, CAB_ROOF_Z - 0.19),
        ((cab_pane_x1 - cab_pane_x0) * 0.5, 0.28, 0.30),
    )
    recalc_mesh(cab)

    inset = WELL_FLOOR_INSET
    floor_hx = WELL_HX - inset
    floor_hy = WELL_HY - inset
    add_folded_sheet(
        "HopperFloor",
        (WELL_CX - floor_hx, -floor_hy, WELL_FLOOR_Z),
        (WELL_CX + floor_hx, -floor_hy, WELL_FLOOR_Z),
        (WELL_CX + floor_hx, floor_hy, WELL_FLOOR_Z),
        (WELL_CX - floor_hx, floor_hy, WELL_FLOOR_Z),
        0.014, rubble, collection, 0.003 if lod == 0 else 0.0,
    )
    add_folded_sheet(
        "HopperWallAft",
        (WELL_CX - WELL_HX, -WELL_HY, DECK_Z1),
        (WELL_CX - WELL_HX, WELL_HY, DECK_Z1),
        (WELL_CX - floor_hx, floor_hy, WELL_FLOOR_Z),
        (WELL_CX - floor_hx, -floor_hy, WELL_FLOOR_Z),
        0.022, rubble, collection, 0.002 if lod == 0 else 0.0,
    )
    add_folded_sheet(
        "HopperWallFore",
        (WELL_CX + WELL_HX, -WELL_HY, DECK_Z1),
        (WELL_CX + WELL_HX, WELL_HY, DECK_Z1),
        (WELL_CX + floor_hx, floor_hy, WELL_FLOOR_Z),
        (WELL_CX + floor_hx, -floor_hy, WELL_FLOOR_Z),
        0.022, rubble, collection, 0.002 if lod == 0 else 0.0,
    )
    add_folded_sheet(
        "HopperWallP",
        (WELL_CX - WELL_HX, WELL_HY, DECK_Z1),
        (WELL_CX + WELL_HX, WELL_HY, DECK_Z1),
        (WELL_CX + floor_hx, floor_hy, WELL_FLOOR_Z),
        (WELL_CX - floor_hx, floor_hy, WELL_FLOOR_Z),
        0.022, rubble, collection, 0.002 if lod == 0 else 0.0,
    )
    add_folded_sheet(
        "HopperWallS",
        (WELL_CX - WELL_HX, -WELL_HY, DECK_Z1),
        (WELL_CX + WELL_HX, -WELL_HY, DECK_Z1),
        (WELL_CX + floor_hx, -floor_hy, WELL_FLOOR_Z),
        (WELL_CX - floor_hx, -floor_hy, WELL_FLOOR_Z),
        0.022, rubble, collection, 0.002 if lod == 0 else 0.0,
    )
    chamfer_z = DECK_Z1 - 0.08
    chamfer_in = 0.08
    add_folded_sheet(
        "HopperChamferAft",
        (WELL_CX - WELL_HX, -WELL_HY, DECK_Z1),
        (WELL_CX - WELL_HX, WELL_HY, DECK_Z1),
        (WELL_CX - WELL_HX + chamfer_in, WELL_HY - 0.02, chamfer_z),
        (WELL_CX - WELL_HX + chamfer_in, -WELL_HY + 0.02, chamfer_z),
        0.018, rubble, collection, bevel_plate,
    )
    add_folded_sheet(
        "HopperChamferFore",
        (WELL_CX + WELL_HX - chamfer_in, -WELL_HY + 0.02, chamfer_z),
        (WELL_CX + WELL_HX - chamfer_in, WELL_HY - 0.02, chamfer_z),
        (WELL_CX + WELL_HX, WELL_HY, DECK_Z1),
        (WELL_CX + WELL_HX, -WELL_HY, DECK_Z1),
        0.018, livery, collection, bevel_plate,
    )
    add_folded_sheet(
        "HopperChamferP",
        (WELL_CX - WELL_HX + 0.02, WELL_HY - chamfer_in, chamfer_z),
        (WELL_CX + WELL_HX - 0.02, WELL_HY - chamfer_in, chamfer_z),
        (WELL_CX + WELL_HX, WELL_HY, DECK_Z1),
        (WELL_CX - WELL_HX, WELL_HY, DECK_Z1),
        0.018, rubble, collection, bevel_plate,
    )
    add_folded_sheet(
        "HopperChamferS",
        (WELL_CX - WELL_HX, -WELL_HY, DECK_Z1),
        (WELL_CX + WELL_HX, -WELL_HY, DECK_Z1),
        (WELL_CX + WELL_HX - 0.02, -WELL_HY + chamfer_in, chamfer_z),
        (WELL_CX - WELL_HX + 0.02, -WELL_HY + chamfer_in, chamfer_z),
        0.018, rubble, collection, bevel_plate,
    )
    # Yellow maintenance shoulders follow the hopper sides and meet the cab bridge.
    # They keep the cavity open while making the vehicle read as one continuous chassis.
    add_folded_sheet(
        "HopperShoulderP",
        (BODY_AFT_X + 0.02, WELL_HY + 0.012, DECK_Z1 + 0.018),
        (WELL_CX + WELL_HX + 0.02, WELL_HY + 0.012, DECK_Z1 + 0.018),
        (WELL_CX + WELL_HX + 0.02, BODY_HALF_Y - 0.012, DECK_Z1 + 0.018),
        (BODY_AFT_X + 0.02, BODY_HALF_Y - 0.012, DECK_Z1 + 0.018),
        0.018, livery, collection, bevel_plate,
    )
    add_folded_sheet(
        "HopperShoulderS",
        (BODY_AFT_X + 0.02, -BODY_HALF_Y + 0.012, DECK_Z1 + 0.018),
        (WELL_CX + WELL_HX + 0.02, -BODY_HALF_Y + 0.012, DECK_Z1 + 0.018),
        (WELL_CX + WELL_HX + 0.02, -WELL_HY - 0.012, DECK_Z1 + 0.018),
        (BODY_AFT_X + 0.02, -WELL_HY - 0.012, DECK_Z1 + 0.018),
        0.018, livery, collection, bevel_plate,
    )
    # C77: HopperLip* deleted. Steel ring read as a framed pane.
    transom_x1 = WELL_CX - WELL_HX
    add_folded_sheet(
        "HopperTransom",
        (BODY_AFT_X, -0.54, DECK_Z1 + 0.014),
        (transom_x1 + 0.04, -0.54, DECK_Z1 + 0.014),
        (transom_x1 + 0.04, 0.54, DECK_Z1 + 0.014),
        (BODY_AFT_X, 0.54, DECK_Z1 + 0.014),
        0.024, scar_mat, collection, bevel_plate,
    )
    add_folded_sheet(
        "HopperTailgate",
        (BODY_AFT_X + 0.02, -WELL_HY - 0.08, DECK_Z1 + 0.028),
        (transom_x1 + 0.02, -WELL_HY - 0.08, DECK_Z1 + 0.028),
        (transom_x1 + 0.02, WELL_HY + 0.08, DECK_Z1 + 0.028),
        (BODY_AFT_X + 0.02, WELL_HY + 0.08, DECK_Z1 + 0.028),
        0.022, scar_mat, collection, bevel_plate,
    )
    add_folded_sheet(
        "HopperOuterAft",
        (BODY_AFT_X, -0.54, DECK_Z1),
        (BODY_AFT_X, 0.54, DECK_Z1),
        (BODY_AFT_X, 0.54, 0.12),
        (BODY_AFT_X, -0.54, 0.12),
        0.016, scar_mat, collection, bevel_plate,
    )
    add_folded_sheet(
        "SideWallP",
        (BODY_AFT_X + 0.02, 0.54, DECK_Z1),
        (BODY_FORE_X - 0.04, 0.20, DECK_Z1),
        (BODY_FORE_X - 0.04, 0.20, 0.12),
        (BODY_AFT_X + 0.02, 0.54, 0.12),
        0.016, scar_mat, collection, bevel_plate,
    )
    add_folded_sheet(
        "SideWallS",
        (BODY_AFT_X + 0.02, -0.54, DECK_Z1),
        (BODY_FORE_X - 0.04, -0.20, DECK_Z1),
        (BODY_FORE_X - 0.04, -0.20, 0.12),
        (BODY_AFT_X + 0.02, -0.54, 0.12),
        0.016, scar_mat, collection, bevel_plate,
    )
    add_folded_sheet(
        "TrackBridgeP",
        (-0.78, 0.40, 0.22),
        (0.18, 0.40, 0.22),
        (0.18, 0.48, 0.22),
        (-0.78, 0.48, 0.22),
        0.022, steel, collection, bevel_plate,
    )
    add_folded_sheet(
        "TrackBridgeS",
        (-0.78, -0.48, 0.22),
        (0.18, -0.48, 0.22),
        (0.18, -0.40, 0.22),
        (-0.78, -0.40, 0.22),
        0.022, steel, collection, bevel_plate,
    )
    add_folded_sheet(
        "DeckCourseFore",
        (-0.13, -0.38, DECK_Z1 + 0.014),
        (0.36, -0.30, DECK_Z1 + 0.014),
        (0.36, 0.30, DECK_Z1 + 0.014),
        (-0.13, 0.38, DECK_Z1 + 0.014),
        0.018, livery, collection, bevel_plate,
    )
    # A four-piece roof frame leaves a real recessed pane instead of putting glass on top of a
    # solid roof. The recess stays legible in the clay check as well as the textured view.
    roof_z = CAB_ROOF_Z + 0.010
    pane_x0 = CAB_CX - CAB_HX + 0.02
    pane_x1 = CAB_CX + CAB_HX + 0.004
    pane_y = 0.24
    add_folded_sheet(
        "CabRoofAft",
        (CAB_CX - CAB_HX, -CAB_HY, roof_z),
        (pane_x0, -CAB_HY, roof_z),
        (pane_x0, CAB_HY, roof_z),
        (CAB_CX - CAB_HX, CAB_HY, roof_z),
        0.016, livery, collection, bevel_plate,
    )
    add_folded_sheet(
        "CabRoofFore",
        (pane_x1, -CAB_HY, roof_z),
        (CAB_CX + CAB_HX, -CAB_HY, roof_z),
        (CAB_CX + CAB_HX, CAB_HY, roof_z),
        (pane_x1, CAB_HY, roof_z),
        0.016, livery, collection, bevel_plate,
    )
    add_folded_sheet(
        "CabRoofSideP",
        (pane_x0, pane_y, roof_z),
        (pane_x1, pane_y, roof_z),
        (pane_x1, CAB_HY, roof_z),
        (pane_x0, CAB_HY, roof_z),
        0.016, livery, collection, bevel_plate,
    )
    add_folded_sheet(
        "CabRoofSideS",
        (pane_x0, -CAB_HY, roof_z),
        (pane_x1, -CAB_HY, roof_z),
        (pane_x1, -pane_y, roof_z),
        (pane_x0, -pane_y, roof_z),
        0.016, livery, collection, bevel_plate,
    )
    _gx = CAB_CX + CAB_HX + 0.004
    add_folded_sheet(
        "CabGlass",
        (_gx, -0.16, CAB_ROOF_Z - 0.18),
        (_gx, 0.16, CAB_ROOF_Z - 0.18),
        (_gx, 0.16, CAB_ROOF_Z - 0.02),
        (_gx, -0.16, CAB_ROOF_Z - 0.02),
        0.008, steel, collection, 0.002 if lod == 0 else 0.0,
    )
    add_folded_sheet(
        "CabGlassLid",
        (CAB_CX - CAB_HX, -pane_y, PANE_FLOOR_Z),
        (CAB_CX + CAB_HX + 0.004, -pane_y, PANE_FLOOR_Z),
        (CAB_CX + CAB_HX + 0.004, pane_y, PANE_FLOOR_Z),
        (CAB_CX - CAB_HX, pane_y, PANE_FLOOR_Z),
        0.006, glass, collection, 0.002 if lod == 0 else 0.0,
    )
    add_folded_sheet(
        "CabShadeAft",
        (CAB_CX - 0.14, -0.18, CAB_ROOF_Z + 0.004),
        (CAB_CX - 0.08, -0.18, CAB_ROOF_Z - 0.02),
        (CAB_CX - 0.08, 0.18, CAB_ROOF_Z - 0.02),
        (CAB_CX - 0.14, 0.18, CAB_ROOF_Z + 0.004),
        0.010, steel, collection, bevel_plate,
    )
    lip = 0.05
    z_lip = CAB_ROOF_Z + 0.006
    add_folded_sheet(
        "CabFrameAft",
        (CAB_CX - CAB_HX - 0.01, -CAB_HY - 0.01, z_lip),
        (CAB_CX - CAB_HX + 0.07, -CAB_HY + 0.08, z_lip),
        (CAB_CX - CAB_HX + 0.07, CAB_HY - 0.08, z_lip),
        (CAB_CX - CAB_HX - 0.01, CAB_HY + 0.01, z_lip),
        0.016, livery, collection, bevel_plate,
    )
    add_folded_sheet(
        "CabFrameFore",
        (CAB_CX + CAB_HX - 0.07, -CAB_HY + 0.08, z_lip),
        (CAB_CX + CAB_HX + 0.01, -CAB_HY - 0.01, z_lip),
        (CAB_CX + CAB_HX + 0.01, CAB_HY + 0.01, z_lip),
        (CAB_CX + CAB_HX - 0.07, CAB_HY - 0.08, z_lip),
        0.016, livery, collection, bevel_plate,
    )
    add_folded_sheet(
        "CabFrameP",
        (CAB_CX - CAB_HX + 0.07, CAB_HY - 0.08, z_lip),
        (CAB_CX + CAB_HX - 0.07, CAB_HY - 0.08, z_lip),
        (CAB_CX + CAB_HX + 0.01, CAB_HY + 0.01, z_lip),
        (CAB_CX - CAB_HX - 0.01, CAB_HY + 0.01, z_lip),
        0.016, livery, collection, bevel_plate,
    )
    add_folded_sheet(
        "CabFrameS",
        (CAB_CX - CAB_HX + 0.07, -CAB_HY + 0.08, z_lip),
        (CAB_CX - CAB_HX - 0.01, -CAB_HY - 0.01, z_lip),
        (CAB_CX + CAB_HX + 0.01, -CAB_HY - 0.01, z_lip),
        (CAB_CX + CAB_HX - 0.07, -CAB_HY + 0.08, z_lip),
        0.016, livery, collection, bevel_plate,
    )
    add_folded_sheet(
        "CabSideP",
        (CAB_CX - CAB_HX, CAB_HY, DECK_Z1),
        (CAB_CX + CAB_HX, CAB_HY, DECK_Z1),
        (CAB_CX + CAB_HX, CAB_HY, CAB_ROOF_Z),
        (CAB_CX - CAB_HX, CAB_HY, CAB_ROOF_Z),
        0.014, scar_mat, collection, bevel_plate,
    )
    add_folded_sheet(
        "CabSideS",
        (CAB_CX - CAB_HX, -CAB_HY, DECK_Z1),
        (CAB_CX + CAB_HX, -CAB_HY, DECK_Z1),
        (CAB_CX + CAB_HX, -CAB_HY, CAB_ROOF_Z),
        (CAB_CX - CAB_HX, -CAB_HY, CAB_ROOF_Z),
        0.014, scar_mat, collection, bevel_plate,
    )
    brow_z = CAB_ROOF_Z + 0.012
    add_folded_sheet(
        "CabCheekP",
        (CAB_CX - 0.08, CAB_HY, DECK_Z1 + 0.012),
        (CAB_CX + CAB_HX, CAB_HY, DECK_Z1 + 0.012),
        (CAB_CX + CAB_HX, 0.44, DECK_Z1 + 0.012),
        (CAB_CX - 0.08, 0.44, DECK_Z1 + 0.012),
        0.018, livery, collection, bevel_plate,
    )
    add_folded_sheet(
        "CabCheekS",
        (CAB_CX - 0.08, -0.44, DECK_Z1 + 0.012),
        (CAB_CX + CAB_HX, -0.44, DECK_Z1 + 0.012),
        (CAB_CX + CAB_HX, -CAB_HY, DECK_Z1 + 0.012),
        (CAB_CX - 0.08, -CAB_HY, DECK_Z1 + 0.012),
        0.018, livery, collection, bevel_plate,
    )
    _bx = CAB_CX + CAB_HX + 0.014
    add_folded_sheet(
        "CabBrow",
        (_bx, -0.12, CAB_ROOF_Z + 0.034),
        (_bx + 0.012, -0.12, CAB_ROOF_Z + 0.034),
        (_bx + 0.012, 0.12, CAB_ROOF_Z + 0.034),
        (_bx, 0.12, CAB_ROOF_Z + 0.034),
        0.002, livery, collection, bevel_plate,
    )

    # Chevrons sit on the steel waist, not on a yellow hat.
    z_chev = DECK_Z1 + 0.024
    add_chevron_plate("Chevron_AP", -0.04, 0.14, 0.32, z_chev, chevron, steel, collection, lod, bevel_plate)
    add_chevron_plate("Chevron_AS", -0.04, -0.32, -0.14, z_chev, chevron, steel, collection, lod, bevel_plate)
    add_chevron_plate("Chevron_BP", 0.12, 0.12, 0.28, z_chev, chevron, steel, collection, lod, bevel_plate)
    add_chevron_plate("Chevron_BS", 0.12, -0.28, -0.12, z_chev, chevron, steel, collection, lod, bevel_plate)

    if lod == 0:
        for i, (bx, by) in enumerate((
            (-0.18, 0.50), (0.08, 0.50), (-0.18, -0.50), (0.08, -0.50),
            (CAB_CX - CAB_HX + 0.04, CAB_HY - 0.04),
            (CAB_CX + CAB_HX - 0.04, CAB_HY - 0.04),
            (CAB_CX - CAB_HX + 0.04, -CAB_HY + 0.04),
            (CAB_CX + CAB_HX - 0.04, -CAB_HY + 0.04),
            (WELL_CX - WELL_HX + 0.04, WELL_HY + 0.04),
            (WELL_CX + WELL_HX - 0.04, WELL_HY + 0.04),
            (WELL_CX - WELL_HX + 0.04, -WELL_HY - 0.04),
            (WELL_CX + WELL_HX - 0.04, -WELL_HY - 0.04),
        )):
            bz = (CAB_ROOF_Z + 0.006) if abs(by) < CAB_HY + 0.02 and bx > 0.0 else (DECK_Z1 + 0.014)
            add_hex_bolt(f"PlateBolt_{i}", (bx, by, bz), steel, collection, bevel=0.001)

    add_cylinder("LampCan", (BODY_FORE_X - 0.02, 0.0, DECK_Z1 + 0.04), 0.045, 0.06, steel, collection, vertices=cyl_v, bevel=0.002 if lod == 0 else 0.0, rot=(0, math.pi / 2, 0))
    add_cylinder("LampLens", (BODY_FORE_X + 0.02, 0.0, DECK_Z1 + 0.04), 0.032, 0.016, lamp_mat, collection, vertices=cyl_v, bevel=0.001 if lod == 0 else 0.0, rot=(0, math.pi / 2, 0))
    add_folded_sheet(
        "LampHood",
        (BODY_FORE_X - 0.06, -0.07, DECK_Z1 + 0.08), (BODY_FORE_X + 0.04, -0.06, DECK_Z1 + 0.05),
        (BODY_FORE_X + 0.04, 0.06, DECK_Z1 + 0.05), (BODY_FORE_X - 0.06, 0.07, DECK_Z1 + 0.08),
        0.010, steel, collection, 0.002 if lod == 0 else 0.0,
    )
    add_cylinder("VentPipe", (CAB_CX - 0.16, CAB_HY - 0.10, CAB_ROOF_Z + 0.01), 0.028, 0.04, steel, collection, vertices=8, bevel=0.002 if lod == 0 else 0.0, rot=(0, 0, 0))
    add_cylinder("VentCap", (CAB_CX - 0.16, CAB_HY - 0.10, CAB_ROOF_Z + 0.03), 0.036, 0.02, steel, collection, vertices=8, bevel=0.001 if lod == 0 else 0.0, rot=(0, 0, 0))

    scar = add_folded_sheet(
        "scar_plate",
        (-0.18, -BODY_HALF_Y - 0.028, 0.12), (0.28, -BODY_HALF_Y - 0.028, 0.14),
        (0.28, -BODY_HALF_Y - 0.028, 0.52), (-0.18, -BODY_HALF_Y - 0.028, 0.50),
        0.024, scar_mat, collection, 0.003 if lod == 0 else 0.0,
    )
    scar["sf_keep"] = True
    if lod == 0:
        add_hex_bolt("ScarBoltA", (-0.12, -BODY_HALF_Y - 0.008, 0.44), steel, collection, bevel=0.001)
        add_hex_bolt("ScarBoltB", (0.22, -BODY_HALF_Y - 0.008, 0.46), steel, collection, bevel=0.001)

    n_pads = N_TREAD_PADS
    n_st_xy = 8 if lod == 0 else 6
    n_arc_xy = 8 if lod == 0 else 6
    for sign, tname in ((1.0, "track_L"), (-1.0, "track_R")):
        yc = sign * TRACK_YC
        frame = add_stadium_xy_belt(
            f"TrackFrame_{tname}", TRACK_XC, yc, 0.0, 0.54,
            TRACK_HL, TRACK_R_PLAN, TRACK_BELT_THICK, track_mat, collection, bevel_body, n_st_xy, n_arc_xy,
        )
        frame["sf_body"] = True
        pads = add_track_pads(
            tname, TRACK_XC, yc, TRACK_HL, TRACK_R_PLAN, TRACK_HALF_W,
            0.40, n_pads, track_mat, collection, 0.002 if lod == 0 else 0.0,
        )
        for pad in pads:
            pad["sf_track_join"] = tname
        track_deck = add_stadium_xy_solid(
            f"TrackDeck_{tname}", TRACK_XC, yc, 0.50, 0.64,
            TRACK_HL * 0.98, TRACK_R_PLAN * 0.97, track_mat, collection, bevel_body, n_st_xy, n_arc_xy,
        )
        track_deck["sf_body"] = True
        add_track_lip_catches(
            f"TrackLip_{tname}", TRACK_XC, yc,
            TRACK_HL + 0.008, TRACK_R_PLAN + 0.010,
            steel, collection, lod,
        )
        sprocket_r = add_cylinder(
            f"SprocketAft_{tname}",
            (TRACK_XC - TRACK_HL, yc, 0.14),
            0.118, 0.13, steel, collection, vertices=cyl_v,
            bevel=0.0, rot=(math.pi / 2, 0, 0),
        )
        sprocket_r["sf_body"] = True
        sprocket_f = add_cylinder(
            f"SprocketFore_{tname}",
            (TRACK_XC + TRACK_HL, yc, 0.14),
            0.108, 0.13, steel, collection, vertices=cyl_v,
            bevel=0.0, rot=(math.pi / 2, 0, 0),
        )
        sprocket_f["sf_body"] = True
        cap_aft = add_cylinder(
            f"SprocketCapAft_{tname}",
            (TRACK_XC - TRACK_HL, yc, 0.33),
            0.100, 0.040, track_mat, collection, vertices=cyl_v,
            bevel=0.0, rot=(0, 0, 0),
        )
        cap_aft["sf_body"] = True
        cap_aft_in = add_cylinder(
            f"SprocketCapAftIn_{tname}",
            (TRACK_XC - TRACK_HL, yc, 0.354),
            0.028, 0.016, steel, collection, vertices=cyl_v,
            bevel=0.0, rot=(0, 0, 0),
        )
        cap_aft_in["sf_body"] = True
        cap_fore = add_cylinder(
            f"SprocketCapFore_{tname}",
            (TRACK_XC + TRACK_HL, yc, 0.33),
            0.092, 0.040, track_mat, collection, vertices=cyl_v,
            bevel=0.0, rot=(0, 0, 0),
        )
        cap_fore["sf_body"] = True
        cap_fore_in = add_cylinder(
            f"SprocketCapForeIn_{tname}",
            (TRACK_XC + TRACK_HL, yc, 0.354),
            0.024, 0.016, steel, collection, vertices=cyl_v,
            bevel=0.0, rot=(0, 0, 0),
        )
        cap_fore_in["sf_body"] = True
        rocker = add_box(
            f"Rocker_{tname}",
            (TRACK_XC, sign * (BODY_HALF_Y + 0.04), 0.10),
            (0.55, 0.04, 0.06),
            steel, collection, bevel=0.003 if lod == 0 else 0.0,
        )
        rocker["sf_body"] = True
        for ix, xw in enumerate((-0.58, -0.19, 0.20)):
            bogie = add_box(
                f"Bogie_{tname}_{ix}",
                (xw, sign * (BODY_HALF_Y + 0.08), 0.16),
                (0.06, 0.07, 0.08),
                steel, collection, bevel=0.002 if lod == 0 else 0.0,
            )
            bogie["sf_body"] = True
            wheel = add_cylinder(
                f"Idler_{tname}_{ix}",
                (xw, yc - sign * 0.02, 0.12),
                0.048, 0.06, steel, collection, vertices=cyl_v,
                bevel=0.0, rot=(math.pi / 2, 0, 0),
            )
            wheel["sf_body"] = True

    boom_pivot = add_empty("boom_pivot", PIVOT, collection, root, size=0.08)
    px, py, pz = PIVOT
    tx, ty, tz = BIT_TIP
    yoke_l = add_box("BoomYokeP", (px - 0.06, py + 0.16, pz), (0.10, 0.040, 0.12), steel, collection, bevel=bevel_body)
    yoke_r = add_box("BoomYokeS", (px - 0.06, py - 0.16, pz), (0.10, 0.040, 0.12), steel, collection, bevel=bevel_body)
    pin = add_cylinder("BoomPin", (px, py, pz), 0.048, 0.34, steel, collection, vertices=8, bevel=0.002 if lod == 0 else 0.0, rot=(math.pi / 2, 0, 0))
    for part in (yoke_l, yoke_r, pin):
        part["sf_boom"] = True
    knuckle = add_box("BoomKnuckle", (px - 0.02, py, pz), (0.05, 0.20, 0.14), chevron, collection, bevel=bevel_body)
    knuckle["sf_boom"] = True
    boom = add_boxed_beam(
        "BoomArm", px + 0.02, tx - 0.08, py, pz,
        0.40, 0.28, 0.34, 0.24,
        chevron, collection, bevel_body, stations=4 if lod == 0 else 3,
    )
    boom["sf_boom"] = True
    spine = add_service_pipe(
        "BoomSpine",
        (px + 0.02, py, pz + 0.26),
        (tx - 0.04, py, pz + 0.20),
        steel, collection, radius=0.022,
    )
    spine["sf_boom"] = True
    if lod == 0:
        web = add_folded_sheet(
            "BoomWebS",
            (px, py - 0.12, pz - 0.05), (tx - 0.14, py - 0.055, pz - 0.022),
            (tx - 0.14, py - 0.055, pz + 0.040), (px, py - 0.12, pz + 0.07),
            0.008, chevron, collection, 0.002,
        )
        web["sf_boom"] = True
        web_p = add_folded_sheet(
            "BoomWebP",
            (px, py + 0.12, pz - 0.05), (tx - 0.14, py + 0.055, pz - 0.022),
            (tx - 0.14, py + 0.055, pz + 0.040), (px, py + 0.12, pz + 0.07),
            0.008, chevron, collection, 0.002,
        )
        web_p["sf_boom"] = True
        ram = add_service_pipe("BoomRam", (px, py, pz - 0.06), (tx - 0.20, py, pz - 0.02), steel, collection, radius=0.028)
        ram["sf_boom"] = True
        ram2 = add_service_pipe("BoomRamB", (px + 0.04, py + 0.05, pz - 0.04), (tx - 0.28, py + 0.04, pz - 0.01), steel, collection, radius=0.016)
        ram2["sf_boom"] = True
    # Keep the forged cutter on its own authored role so heat animation cannot tint the
    # replaceable scar plate that happens to share the boom assembly.
    add_faceted_bit("Bit", BIT_TIP, bit_mat, steel, collection, lod, 0.002 if lod == 0 else 0.0)
    add_empty("bit_tip", BIT_TIP, collection, boom_pivot, size=0.05)

    lid = add_folded_sheet(
        "hopper_lid",
        (BODY_AFT_X - 0.008, -WELL_HY, DECK_Z1 - 0.02),
        (BODY_AFT_X - 0.008, WELL_HY, DECK_Z1 - 0.02),
        (BODY_AFT_X - 0.008, WELL_HY, 0.16),
        (BODY_AFT_X - 0.008, -WELL_HY, 0.16),
        0.012, steel, collection, bevel_plate,
    )
    lid["sf_keep"] = True

    for stage in range(5):
        h = 0.035 + stage * 0.03
        fill = add_box(
            f"hopper_fill_{stage}",
            (WELL_CX, 0.0, WELL_FLOOR_Z + 0.02 + h * 0.5),
            (WELL_HX - 0.04 - stage * 0.012, WELL_HY - 0.04 - stage * 0.010, h * 0.5),
            rubble, collection, bevel=0.003 if lod == 0 else 0.0,
        )
        fill["sf_keep"] = True
        fill.hide_render = True

    add_empty("lamp_socket", (BODY_FORE_X + 0.04, 0.0, DECK_Z1 + 0.04), collection, root, size=0.05)
    add_empty("vent_stack", (CAB_CX - 0.16, CAB_HY - 0.10, CAB_ROOF_Z + 0.04), collection, root, size=0.05)

    for obj in list(collection.objects):
        if obj.get("sf_boom"):
            parent_keep(obj, boom_pivot)

    mesh_objects = [obj for obj in collection.objects if obj.type == "MESH"]
    for obj in mesh_objects:
        finish_mesh_for_atlas(obj, atlas_mat, size, skip_uv=False)

    track_joins = {}
    for obj in list(collection.objects):
        tname = obj.get("sf_track_join")
        if tname:
            track_joins.setdefault(tname, []).append(obj)
    for tname, pads in track_joins.items():
        node = join_group(pads, tname, root)
        if node:
            node["sf_keep"] = True
            node["spacefaceRole"] = "track"
            node["spacefaceLod"] = f"lod{lod}"

    bake_ao_into_albedo(atlas_maps[0], atlas_maps[1])

    body_groups = {}
    boom_groups = {}
    keep = []
    for obj in list(collection.objects):
        if obj.type != "MESH":
            continue
        if obj.get("sf_keep") or obj.name in HOOK_MESHES:
            keep.append(obj)
            continue
        role = obj.get("spacefaceRole") or "livery"
        if obj.get("sf_boom") or obj.parent == boom_pivot:
            boom_groups.setdefault(role, []).append(obj)
        else:
            body_groups.setdefault(role, []).append(obj)

    merged = []
    for role, objects in sorted(body_groups.items()):
        node = join_group(objects, f"LOD{lod}_Merged_Material_{role.title()}", root)
        if node:
            node["spacefaceRole"] = role
            node["spacefaceLod"] = f"lod{lod}"
            merged.append(node)
    for role, objects in sorted(boom_groups.items()):
        node = join_group(objects, f"LOD{lod}_Merged_Material_{role.title()}_Boom", boom_pivot)
        if node:
            node["spacefaceRole"] = role
            node["spacefaceLod"] = f"lod{lod}"
            merged.append(node)

    for obj in keep:
        parent_keep(obj, root)
        if obj.name.startswith("hopper_fill_") or obj.name in {"track_L", "track_R", "scar_plate", "hopper_lid"}:
            obj["spacefaceLod"] = f"lod{lod}"

    scene = bpy.context.scene
    try:
        scene.render.engine = "BLENDER_EEVEE_NEXT"
    except TypeError:
        try:
            scene.render.engine = "BLENDER_EEVEE"
        except TypeError:
            pass

    decimate_to_budget(collection, TRI_BUDGET[lod])

    hooks = assert_hooks(collection)
    bbox = measured_bbox([obj for obj in collection.all_objects if obj.type == "MESH"])
    print(f"lod{lod} bbox wu={bbox['sizeWu']} cells={bbox['sizeCells']} zMin={bbox['zMin']}")
    assert_bbox(bbox, lod)

    tris = 0
    draws = 0
    materials = []
    node_names = ["rover"]
    for obj in collection.all_objects:
        node_names.append(obj.name)
        if obj.type != "MESH":
            continue
        draws += 1
        tris += sum(max(0, len(p.vertices) - 2) for p in obj.data.polygons)
        if obj.data.materials:
            materials.append(obj.data.materials[0].name)
    if tris > TRI_BUDGET[lod]:
        print(f"WARN lod{lod} triangles {tris} over budget {TRI_BUDGET[lod]} (named features kept)")
    return collection, {
        "lod": lod,
        "triangles": tris,
        "draws": draws,
        "materials": sorted(set(materials)),
        "nodeNames": sorted(set(node_names)),
        "bbox": bbox,
        "hooks": hooks,
        "rootNode": "rover",
        "triBudget": TRI_BUDGET[lod],
        "triOverBudget": tris > TRI_BUDGET[lod],
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
    try:
        loop_count = len(mesh.loops)
        if loop_count:
            normals = np.zeros(loop_count * 3, dtype=np.float32)
            mesh.loops.foreach_get("normal", normals)
            normals = np.round(normals, nd).astype(np.float32)
            mesh.normals_split_custom_set(normals.reshape(loop_count, 3))
    except Exception:
        pass
    mesh.update()


def export_lod(collection, lod):
    out = FAMILY / "source" / f"rover_lod{lod}.glb"
    out.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.object.select_all(action="DESELECT")
    for obj in list(collection.all_objects):
        if obj is None or not getattr(obj, "name", None):
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
            import time
            time.sleep(0.35 * (attempt + 1))
    sanitize_glb_floats(out)
    return out


def export_combined_source(lod0_path: Path, lod1_path: Path) -> Path:
    """Publish the single authoring GLB consumed by the works runtime.

    The standalone per-LOD files remain useful for Blender inspection and keep LOD2
    authoring-only.  The runtime source deliberately contains only LOD0 + LOD1.  LOD1
    hook meshes receive a prefix because the exact unprefixed names are the LOD0 control
    surface; the runtime adapter resolves the active LOD's prefixed body meshes while
    the 13 canonical hook names remain present once in the file.
    """
    reset_scene()
    imported = []
    for lod, path in ((0, lod0_path), (1, lod1_path)):
        before = set(bpy.data.objects)
        bpy.ops.import_scene.gltf(filepath=str(path))
        added = [obj for obj in bpy.data.objects if obj not in before]
        if not added:
            raise RuntimeError(f"combined source import produced no objects for lod{lod}")
        imported.extend(added)
        roots = [obj for obj in added if obj.parent is None]
        root = next((obj for obj in roots if obj.name.startswith("rover")), None)
        if root is None:
            raise RuntimeError(f"combined source import has no rover root for lod{lod}")
        root.name = "rover" if lod == 0 else "LOD1_rover"
        if lod == 1:
            # Avoid duplicate marker names while keeping every site LOD body discoverable.
            for obj in added:
                if obj is root:
                    continue
                base_name = obj.name.rsplit(".", 1)[0]
                if base_name in HOOK_NAMES:
                    obj.name = f"LOD1_{base_name}"

    bpy.ops.object.select_all(action="DESELECT")
    for obj in imported:
        obj.hide_viewport = False
        obj.hide_render = False
        obj.hide_set(False)
        obj.select_set(True)
        if obj.type == "MESH" and obj.data:
            obj.data.name = obj.name
            quantize_mesh(obj)
    COMBINED_SOURCE.parent.mkdir(parents=True, exist_ok=True)
    tmp = COMBINED_SOURCE.with_suffix(".tmp.glb")
    bpy.ops.export_scene.gltf(
        filepath=str(tmp), export_format="GLB", use_selection=True, export_apply=True,
        export_yup=True, export_extras=True, export_animations=False,
        export_materials="EXPORT", export_texcoords=True, export_normals=True,
        export_tangents=True, export_image_format="AUTO",
    )
    for attempt in range(6):
        try:
            if COMBINED_SOURCE.exists():
                COMBINED_SOURCE.unlink()
            shutil.move(str(tmp), str(COMBINED_SOURCE))
            break
        except OSError:
            if attempt == 5:
                raise
            import time
            time.sleep(0.35 * (attempt + 1))
    sanitize_glb_floats(COMBINED_SOURCE)
    stamp_asset_contract(COMBINED_SOURCE)
    return COMBINED_SOURCE


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
        ("TrackFill", (0.30 * reach, -1.60 * reach, 0.18 * reach), 5.50, (0.90, 0.82, 0.72), 48.0),
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
            data.use_shadow = False
    return camera, pad


def override_depth(meshes, focus_distance):
    backups = {}
    mat = make_depth_material(focus_distance)
    for obj in meshes:
        backups[obj.name] = [slot.material for slot in obj.material_slots]
        if obj.material_slots:
            obj.material_slots[0].material = mat
        else:
            obj.data.materials.append(mat)
    return backups, mat


def make_depth_material(focus_distance):
    mat = bpy.data.materials.new("DepthEncode")
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    emit = nt.nodes.new("ShaderNodeEmission")
    cam = nt.nodes.new("ShaderNodeCameraData")
    sub = nt.nodes.new("ShaderNodeMath")
    sub.operation = "SUBTRACT"
    sub.inputs[0].default_value = float(focus_distance)
    dist_key = "View Distance" if "View Distance" in cam.outputs else "View Z"
    if dist_key == "View Z":
        absn = nt.nodes.new("ShaderNodeMath")
        absn.operation = "ABSOLUTE"
        nt.links.new(cam.outputs["View Z"], absn.inputs[0])
        nt.links.new(absn.outputs["Value"], sub.inputs[1])
    else:
        nt.links.new(cam.outputs["View Distance"], sub.inputs[1])
    div = nt.nodes.new("ShaderNodeMath")
    div.operation = "DIVIDE"
    div.inputs[1].default_value = float(DEPTH_ENCODE_RANGE)
    nt.links.new(sub.outputs["Value"], div.inputs[0])
    try:
        comb = nt.nodes.new("ShaderNodeCombineColor")
    except Exception:
        comb = nt.nodes.new("ShaderNodeCombineRGB")
    for i in range(3):
        nt.links.new(div.outputs["Value"], comb.inputs[i])
    nt.links.new(comb.outputs[0], emit.inputs["Color"])
    emit.inputs["Strength"].default_value = 1.0
    nt.links.new(emit.outputs["Emission"], out.inputs["Surface"])
    return mat


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


def restore_mats(meshes, backups):
    for obj in meshes:
        mats = backups.get(obj.name, [])
        for index, material in enumerate(mats):
            if index < len(obj.material_slots):
                obj.material_slots[index].material = material


def imported_role(obj):
    role = obj.get("spacefaceRole")
    if role in ATLAS_TILE:
        return role
    name = obj.name.lower()
    for key in ("track", "livery", "chevron", "glass", "steel", "bit", "lamp", "rubble", "scar"):
        if key in name:
            return key
    if "hopper_fill" in name:
        return "rubble"
    if "hopper_lid" in name:
        return "livery"
    return "livery"


def override_flat_mask(meshes):
    backups = {}
    made = {}
    for obj in meshes:
        backups[obj.name] = [slot.material for slot in obj.material_slots]
        role = imported_role(obj)
        if role not in made:
            mat = bpy.data.materials.new(f"Flat_{role}")
            mat.use_nodes = True
            mat.node_tree.nodes.clear()
            out = mat.node_tree.nodes.new("ShaderNodeOutputMaterial")
            emit = mat.node_tree.nodes.new("ShaderNodeEmission")
            rgb = ROLE_FLAT.get(role, (0.4, 0.4, 0.4))
            emit.inputs["Color"].default_value = (*rgb, 1)
            emit.inputs["Strength"].default_value = 1.0
            mat.node_tree.links.new(emit.outputs["Emission"], out.inputs["Surface"])
            made[role] = mat
        if obj.material_slots:
            obj.material_slots[0].material = made[role]
        else:
            obj.data.materials.append(made[role])
    return backups


def load_image_array(path: Path):
    img = bpy.data.images.load(str(path))
    w, h = img.size
    buf = np.zeros(w * h * 4, dtype=np.float32)
    img.pixels.foreach_get(buf)
    arr = buf.reshape(h, w, 4)
    return arr, w, h, img


def connected_components(mask):
    h, w = mask.shape
    labels = np.zeros((h, w), dtype=np.int32)
    sizes = {}
    cents = {}
    nid = 0
    ys, xs = np.nonzero(mask)
    if len(ys) == 0:
        return labels, sizes, cents
    y0, y1 = int(ys.min()), int(ys.max()) + 1
    x0, x1 = int(xs.min()), int(xs.max()) + 1
    for y in range(y0, y1):
        for x in range(x0, x1):
            if not mask[y, x] or labels[y, x]:
                continue
            nid += 1
            q = deque([(y, x)])
            labels[y, x] = nid
            sy = sx = c = 0
            while q:
                cy, cx = q.popleft()
                sy += cy
                sx += cx
                c += 1
                for ny, nx in ((cy - 1, cx), (cy + 1, cx), (cy, cx - 1), (cy, cx + 1)):
                    if y0 <= ny < y1 and x0 <= nx < x1 and mask[ny, nx] and labels[ny, nx] == 0:
                        labels[ny, nx] = nid
                        q.append((ny, nx))
            sizes[nid] = c
            cents[nid] = (sx / c, sy / c)
    return labels, sizes, cents


def _pass(op, value, floor):
    if op == "range":
        lo, hi = floor
        return bool(lo - 1e-9 <= value <= hi + 1e-9)
    if op == "<=":
        return bool(value <= floor + 1e-9)
    return bool(value >= floor - 1e-9)


def measure_planform(arr, mode="mask", sil=None):
    rgb = arr[..., :3]
    luma = 0.2126 * rgb[..., 0] + 0.7152 * rgb[..., 1] + 0.0722 * rgb[..., 2]
    if sil is not None:
        sil = sil.astype(bool)
    elif mode == "mask":
        sil = luma > 0.02
    else:
        pad = (rgb[..., 0] < 0.22) & (rgb[..., 1] < 0.18) & (rgb[..., 2] < 0.16) & (luma > 0.04) & (luma < 0.22)
        bg = luma < 0.05
        sil = (~bg) & (~pad)

    n_sil = int(sil.sum())
    empty = {
        "YELLOW_MINORITY": 0.0,
        "TRACK_BAND": 0.0,
        "TRACK_OUTERMOST_PORT": 0.0,
        "TRACK_OUTERMOST_STARBOARD": 0.0,
        "WELL_HOLE": 0.0,
        "CAB_PANE": 0.0,
        "BOOM_REACH": 0.0,
        "BOOM_OFFSET": 0.0,
        "silhouettePixels": n_sil,
    }
    if n_sil < 50:
        return empty

    ys, xs = np.nonzero(sil)
    x_min, x_max = int(xs.min()), int(xs.max())
    y_min, y_max = int(ys.min()), int(ys.max())
    width = max(1, x_max - x_min)
    height = max(1, y_max - y_min)
    # Image x ~ world X (travel), image y ~ world Y (cross-travel, bottom origin).
    travel_along_x = width >= height * 0.85

    yellow = sil & (rgb[..., 0] > 0.55) & (rgb[..., 1] > 0.35) & (rgb[..., 2] < 0.42)
    if mode == "mask":
        names = [k for k in ROLE_FLAT if k != "atlas"]
        refs = np.array([ROLE_FLAT[k] for k in names], dtype=np.float32)
        pix = rgb.reshape(-1, 3).astype(np.float32)
        dist = ((pix[:, None, :] - refs[None, :, :]) ** 2).sum(axis=2)
        idx = dist.argmin(axis=1).reshape(rgb.shape[0], rgb.shape[1])
        def role_mask(role):
            return sil & (idx == names.index(role))
        yellow = role_mask("livery")
        track = role_mask("track")
        glass = role_mask("glass")
        well_dark = role_mask("rubble")
    else:
        # Clay: tracks own the outline; cavities are low-luma pits.
        yy = np.arange(arr.shape[0])[:, None]
        xx = np.arange(arr.shape[1])[None, :]
        if travel_along_x:
            flank = height
            port = sil & (yy >= (y_max - max(2, int(round(flank * 0.18)))))
            stbd = sil & (yy <= (y_min + max(2, int(round(flank * 0.18)))))
        else:
            flank = width
            port = sil & (xx >= (x_max - max(2, int(round(flank * 0.18)))))
            stbd = sil & (xx <= (x_min + max(2, int(round(flank * 0.18)))))
        track = port | stbd
        mean_l = float(luma[sil].mean())
        well_dark = sil & (~track) & (luma < mean_l * 0.62)
        glass = well_dark
        yellow = np.zeros_like(sil)

    yellow_frac = float(yellow.sum()) / n_sil
    track_frac = float(track.sum()) / n_sil

    band = max(2, int(round((height if travel_along_x else width) * 0.06)))
    if travel_along_x:
        port_band = sil & (np.arange(arr.shape[0])[:, None] >= (y_max - band))
        stbd_band = sil & (np.arange(arr.shape[0])[:, None] <= (y_min + band))
    else:
        port_band = sil & (np.arange(arr.shape[1])[None, :] >= (x_max - band))
        stbd_band = sil & (np.arange(arr.shape[1])[None, :] <= (x_min + band))
    port_n = int(port_band.sum()) or 1
    stbd_n = int(stbd_band.sum()) or 1
    port_track = float((port_band & track).sum()) / port_n
    stbd_track = float((stbd_band & track).sum()) / stbd_n

    # Boom: silhouette past the wide body.
    if travel_along_x:
        col_width = np.array([int(sil[:, x].sum()) for x in range(x_min, x_max + 1)], dtype=np.int32)
    else:
        col_width = np.array([int(sil[y, :].sum()) for y in range(y_min, y_max + 1)], dtype=np.int32)
    max_w = max(1, int(col_width.max()))
    wide = col_width >= int(max_w * 0.72)
    wide_idx = np.nonzero(wide)[0]
    if len(wide_idx):
        body_a, body_b = int(wide_idx[0]), int(wide_idx[-1])
    else:
        body_a, body_b = 0, len(col_width) - 1
    left_extra = body_a
    right_extra = len(col_width) - 1 - body_b
    if right_extra >= left_extra:
        boom_slice = slice(body_b + 1, len(col_width))
        forward_is_high = True
    else:
        boom_slice = slice(0, body_a)
        forward_is_high = False
    boom_len = boom_slice.stop - boom_slice.start
    reach = float(boom_len) / float(max(1, (x_max - x_min) if travel_along_x else (y_max - y_min)))

    if travel_along_x:
        if forward_is_high:
            boom_px = sil[:, (x_min + body_b + 1):(x_max + 1)]
            ox0 = x_min + body_b + 1
        else:
            boom_px = sil[:, x_min:(x_min + body_a)]
            ox0 = x_min
        bys, bxs = np.nonzero(boom_px)
        if len(bxs):
            boom_cx = ox0 + bxs.mean()
            boom_cy = bys.mean()
        else:
            boom_cx = boom_cy = 0.0
        mid_y = 0.5 * (y_min + y_max)
        offset = abs(float(boom_cy) - mid_y) / float(max(1, height))
    else:
        offset = 0.0

    # Dark regions for well / pane.
    dark = well_dark if mode == "mask" else (sil & (luma < float(luma[sil].mean()) * 0.70) & (~track))
    _labels, sizes, cents = connected_components(dark)
    aft_third_hi = x_min + width / 3.0
    mid_lo, mid_hi = x_min + width / 3.0, x_min + 2.0 * width / 3.0
    well = 0.0
    pane = 0.0
    well_id = None
    ranked = sorted(sizes.items(), key=lambda kv: kv[1], reverse=True)
    for cid, sz in ranked:
        cx, cy = cents[cid]
        if cx <= aft_third_hi:
            well = sz / n_sil
            well_id = cid
            break
    for cid, sz in ranked:
        if cid == well_id:
            continue
        cx, cy = cents[cid]
        if mid_lo <= cx <= mid_hi:
            pane = sz / n_sil
            break
    if mode == "mask" and float(glass.sum()) / n_sil > pane:
        pane = float(glass.sum()) / n_sil

    return {
        "YELLOW_MINORITY": round(yellow_frac, 4),
        "TRACK_BAND": round(track_frac, 4),
        "TRACK_OUTERMOST_PORT": round(port_track, 4),
        "TRACK_OUTERMOST_STARBOARD": round(stbd_track, 4),
        "WELL_HOLE": round(well, 4),
        "CAB_PANE": round(pane, 4),
        "BOOM_REACH": round(reach, 4),
        "BOOM_OFFSET": round(offset, 4),
        "silhouettePixels": n_sil,
        "bbox": [x_min, y_min, x_max, y_max],
    }


CYCLE2_TEX_KEYS = (
    "YELLOW_MINORITY", "TRACK_BAND", "TRACK_OUTERMOST_PORT", "TRACK_OUTERMOST_STARBOARD",
    "WELL_HOLE", "CAB_PANE", "BOOM_REACH", "BOOM_OFFSET",
)
CYCLE2_CLAY_KEYS = (
    "TRACK_BAND", "TRACK_OUTERMOST_PORT", "TRACK_OUTERMOST_STARBOARD",
    "WELL_HOLE", "CAB_PANE", "BOOM_REACH", "BOOM_OFFSET",
)


def evaluate_floors(values, keys=None):
    rows = {}
    all_ok = True
    keys = keys if keys is not None else CYCLE2_TEX_KEYS
    for key in keys:
        op, floor = PLANFORM_FLOORS[key]
        val = float(values.get(key, 0.0))
        ok = _pass(op, val, floor)
        rows[key] = {"value": val, "floor": floor, "op": op, "pass": ok}
        all_ok = all_ok and ok
    return rows, all_ok


def rgb_to_hsv_np(rgb):
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    maxc = np.maximum(np.maximum(r, g), b)
    minc = np.minimum(np.minimum(r, g), b)
    v = maxc
    rng = np.maximum(maxc - minc, 1e-8)
    s = np.where(maxc > 1e-8, (maxc - minc) / np.maximum(maxc, 1e-8), 0.0)
    h = np.zeros_like(maxc)
    is_r = (maxc == r)
    is_g = (maxc == g) & (~is_r)
    is_b = ~is_r & ~is_g
    h = np.where(is_r, (g - b) / rng, h)
    h = np.where(is_g, 2.0 + (b - r) / rng, h)
    h = np.where(is_b, 4.0 + (r - g) / rng, h)
    h = (h / 6.0) % 1.0
    return h * 360.0, s, v


def role_masks_from_id(mask_arr, sil):
    rgb = mask_arr[..., :3]
    names = [k for k in ROLE_FLAT if k != "atlas"]
    refs = np.array([ROLE_FLAT[k] for k in names], dtype=np.float32)
    pix = rgb.reshape(-1, 3).astype(np.float32)
    dist = ((pix[:, None, :] - refs[None, :, :]) ** 2).sum(axis=2)
    idx = dist.argmin(axis=1).reshape(rgb.shape[0], rgb.shape[1])
    out = {}
    for name in names:
        out[name] = sil & (idx == names.index(name))
    return out


def dilate_mask(mask, radius=3):
    h, w = mask.shape
    out = mask.copy()
    ys, xs = np.nonzero(mask)
    for y, x in zip(ys, xs):
        out[max(0, y - radius):min(h, y + radius + 1), max(0, x - radius):min(w, x + radius + 1)] = True
    return out


def ring_around(region, domain, radius=4):
    return dilate_mask(region, radius) & domain & (~region)


def luma_of(arr):
    rgb = arr[..., :3]
    return 0.2126 * rgb[..., 0] + 0.7152 * rgb[..., 1] + 0.0722 * rgb[..., 2]


def tread_sign_changes(clay_luma, track_mask):
    ys, xs = np.nonzero(track_mask)
    if len(xs) < 8:
        return 0
    x0, x1 = int(xs.min()), int(xs.max())
    series = []
    for x in range(x0, x1 + 1):
        col = clay_luma[:, x][track_mask[:, x]]
        if col.size:
            series.append(float(col.mean()))
    arr = np.asarray(series, dtype=np.float32)
    if arr.size < 8:
        return 0
    d = np.diff(arr)
    d[np.abs(d) < 0.006] = 0
    signs = np.sign(d)
    signs = signs[signs != 0]
    if signs.size < 2:
        return 0
    return int(np.sum(signs[1:] != signs[:-1]))


def track_roundness(track_mask):
    ys, xs = np.nonzero(track_mask)
    if len(xs) < 8:
        return 0.0
    area = float(track_mask.sum())
    bbox = float((xs.max() - xs.min() + 1) * (ys.max() - ys.min() + 1))
    if bbox < 1:
        return 0.0
    return 1.0 - area / bbox


def track_contrast_levels(beauty_luma, sil, track, travel_along_x):
    h, w = sil.shape
    ys, xs = np.nonzero(sil)
    if len(xs) < 8:
        return 0.0, 0.0
    y_min, y_max = int(ys.min()), int(ys.max())
    x_min, x_max = int(xs.min()), int(xs.max())
    band = 8
    luma255 = beauty_luma * 255.0
    pad_like = (~sil) & (beauty_luma > 0.03) & (beauty_luma < 0.32)
    if travel_along_x:
        port_t = track & (np.arange(h)[:, None] >= (y_max - max(3, int(round((y_max - y_min) * 0.22)))))
        stbd_t = track & (np.arange(h)[:, None] <= (y_min + max(3, int(round((y_max - y_min) * 0.22)))))
        yy = np.arange(h)[:, None]
        xx = np.arange(w)[None, :]
        port_out = pad_like & (yy > y_max) & (yy <= y_max + band) & (xx >= x_min) & (xx <= x_max)
        stbd_out = pad_like & (yy < y_min) & (yy >= y_min - band) & (xx >= x_min) & (xx <= x_max)
    else:
        port_t = track & (np.arange(w)[None, :] >= (x_max - max(3, int(round((x_max - x_min) * 0.22)))))
        stbd_t = track & (np.arange(w)[None, :] <= (x_min + max(3, int(round((x_max - x_min) * 0.22)))))
        yy = np.arange(h)[:, None]
        xx = np.arange(w)[None, :]
        port_out = pad_like & (xx > x_max) & (xx <= x_max + band) & (yy >= y_min) & (yy <= y_max)
        stbd_out = pad_like & (xx < x_min) & (xx >= x_min - band) & (yy >= y_min) & (yy <= y_max)

    def contrast(tmask, omask):
        if tmask.sum() < 4 or omask.sum() < 4:
            return 0.0
        return float(np.median(luma255[tmask]) - np.median(luma255[omask]))

    return contrast(port_t, port_out), contrast(stbd_t, stbd_out)


# 5x7 glyphs, 5 bits per row, bit4 = left.
_FONT = {
    " ": (0, 0, 0, 0, 0, 0, 0),
    "-": (0, 0, 0, 14, 0, 0, 0),
    ".": (0, 0, 0, 0, 0, 0, 4),
    "/": (1, 2, 2, 4, 8, 8, 16),
    "0": (14, 17, 19, 21, 25, 17, 14),
    "1": (4, 12, 4, 4, 4, 4, 14),
    "2": (14, 17, 1, 2, 4, 8, 31),
    "3": (14, 17, 1, 6, 1, 17, 14),
    "4": (2, 6, 10, 18, 31, 2, 2),
    "5": (31, 16, 30, 1, 1, 17, 14),
    "6": (6, 8, 16, 30, 17, 17, 14),
    "7": (31, 1, 2, 4, 8, 8, 8),
    "8": (14, 17, 17, 14, 17, 17, 14),
    "9": (14, 17, 17, 15, 1, 2, 12),
    "A": (14, 17, 17, 31, 17, 17, 17),
    "B": (30, 17, 17, 30, 17, 17, 30),
    "C": (14, 17, 16, 16, 16, 17, 14),
    "D": (30, 17, 17, 17, 17, 17, 30),
    "E": (31, 16, 16, 30, 16, 16, 31),
    "F": (31, 16, 16, 30, 16, 16, 16),
    "G": (14, 17, 16, 19, 17, 17, 14),
    "H": (17, 17, 17, 31, 17, 17, 17),
    "I": (14, 4, 4, 4, 4, 4, 14),
    "K": (17, 18, 20, 24, 20, 18, 17),
    "L": (16, 16, 16, 16, 16, 16, 31),
    "N": (17, 25, 21, 19, 17, 17, 17),
    "O": (14, 17, 17, 17, 17, 17, 14),
    "P": (30, 17, 17, 30, 16, 16, 16),
    "R": (30, 17, 17, 30, 20, 18, 17),
    "S": (14, 17, 16, 14, 1, 17, 14),
    "T": (31, 4, 4, 4, 4, 4, 4),
    "U": (17, 17, 17, 17, 17, 17, 14),
    "V": (17, 17, 17, 17, 17, 10, 4),
    "W": (17, 17, 17, 21, 21, 21, 10),
    "Y": (17, 17, 10, 4, 4, 4, 4),
    "_": (0, 0, 0, 0, 0, 0, 31),
}


def blit_text(img, text, x, y, color, scale=2):
    h, w = img.shape[:2]
    cr, cg, cb = color
    xx = int(x)
    for ch in text.upper():
        glyph = _FONT.get(ch, _FONT.get(".", (0, 0, 0, 0, 0, 0, 4)))
        for row, bits in enumerate(glyph):
            for col in range(5):
                if bits & (1 << (4 - col)):
                    for oy in range(scale):
                        for ox in range(scale):
                            py = y + row * scale + oy
                            px = xx + col * scale + ox
                            if 0 <= py < h and 0 <= px < w:
                                img[py, px, 0] = cr
                                img[py, px, 1] = cg
                                img[py, px, 2] = cb
                                img[py, px, 3] = 1.0
        xx += 6 * scale


def crop_1to1(arr, sil_bbox, size=320):
    h, w = arr.shape[:2]
    if sil_bbox:
        x0, y0, x1, y1 = sil_bbox
        cx = int(round(0.5 * (x0 + x1)))
        cy = int(round(0.5 * (y0 + y1)))
    else:
        cx, cy = w // 2, h // 2
    half = size // 2
    x0 = max(0, min(w - size, cx - half))
    y0 = max(0, min(h - size, cy - half))
    return arr[y0:y0 + size, x0:x0 + size].copy(), (x0, y0, size)


def crop_object_native(arr, pad=10, luma_floor=0.05):
    """Tight original-resolution crop around the object. Does not upscale."""
    luma = luma_of(arr)
    sil = luma > luma_floor
    if sil.sum() < 8:
        return arr
    ys, xs = np.nonzero(sil)
    x0 = max(0, int(xs.min()) - pad)
    x1 = min(arr.shape[1], int(xs.max()) + pad + 1)
    y0 = max(0, int(ys.min()) - pad)
    y1 = min(arr.shape[0], int(ys.max()) + pad + 1)
    return arr[y0:y1, x0:x1].copy()


def _fmt_floor(floor):
    if isinstance(floor, (tuple, list)):
        return f"{floor[0]:.4f}..{floor[1]:.4f}"
    return f"{floor:.4f}"


def _row(key, value, op=None, floor=None, ok=None):
    if op is None or floor is None:
        spec = PLANFORM_FLOORS.get(key)
        if spec:
            op, floor = spec
    if ok is None and op is not None:
        ok = _pass(op, value, floor)
    return {"value": value, "floor": floor, "op": op, "pass": bool(ok)}


def planform_report(still_dir: Path):
    mask_path = still_dir / "works_top_mask.png"
    clay_path = still_dir / "works_top_clay.png"
    top_path = still_dir / "works_top.png"
    depth_path = still_dir / "works_top_depth.png"
    edge_mask_path = still_dir / "works_edge_mask.png"
    mask_arr, _, _, mask_img = load_image_array(mask_path)
    clay_arr, _, _, clay_img = load_image_array(clay_path)
    top_arr, _, _, top_img = load_image_array(top_path)
    obj_sil = luma_of(mask_arr) > 0.02
    textured = measure_planform(mask_arr, mode="mask", sil=obj_sil)
    clay = measure_planform(clay_arr, mode="clay", sil=obj_sil)
    tex_rows, tex_ok = evaluate_floors(textured, CYCLE2_TEX_KEYS)
    clay_rows, clay_ok = evaluate_floors(clay, CYCLE2_CLAY_KEYS)

    roles = role_masks_from_id(mask_arr, obj_sil)
    beauty_luma = luma_of(top_arr)
    clay_luma = luma_of(clay_arr)
    travel_along_x = True
    if textured.get("bbox"):
        x0, y0, x1, y1 = textured["bbox"]
        travel_along_x = (x1 - x0) >= (y1 - y0) * 0.85

    c3 = {}
    port_c, stbd_c = track_contrast_levels(beauty_luma, obj_sil, roles["track"], travel_along_x)
    c3["TRACK_CONTRAST_PORT"] = _row("TRACK_CONTRAST_PORT", round(port_c, 4))
    c3["TRACK_CONTRAST_STARBOARD"] = _row("TRACK_CONTRAST_STARBOARD", round(stbd_c, 4))

    livery_pix = top_arr[..., :3][roles["livery"]]
    if len(livery_pix):
        _h, s, _v = rgb_to_hsv_np(livery_pix[:, None, :])
        s = s.reshape(-1)
        sat_frac = float((s >= 0.70).mean())
    else:
        sat_frac = 0.0
    c3["LIVERY_SAT_RENDERED"] = _row("LIVERY_SAT_RENDERED", round(sat_frac, 4))

    depth_wu = None
    if depth_path.exists():
        depth_arr, _, _, depth_img = load_image_array(depth_path)
        encoded = depth_arr[..., 0]
        rel_z = encoded * float(DEPTH_ENCODE_RANGE)
        sil_z = rel_z[obj_sil]
        p02, p98, has_mass = 0.0, 0.0, 0.0
        if sil_z.size:
            p02, p98 = np.percentile(sil_z, 2), np.percentile(sil_z, 98)
            has_mass = float(p98 - p02)
        well_region = roles["rubble"]
        aft_cut = obj_sil.shape[1]
        if textured.get("bbox"):
            x0, y0, x1, y1 = textured["bbox"]
            aft_cut = x0 + max(1, int((x1 - x0) / 3.0))
            well_region = well_region & (np.arange(obj_sil.shape[1])[None, :] <= aft_cut)
        cab_glass = roles["glass"]
        cab_roof = np.zeros_like(obj_sil)
        cab_box = np.zeros_like(obj_sil)
        if cab_glass.sum() >= 4:
            # Flat-mask antialiasing can classify a thin aft silhouette edge as glass. Keep the
            # physically recessed cab aperture component (the forward/central component) for the
            # relief measurement instead of letting that edge widen the deck comparison region.
            glass_labels, glass_sizes, glass_cents = connected_components(cab_glass)
            sil_xs = np.nonzero(obj_sil)[1]
            sil_x_min = int(sil_xs.min()) if sil_xs.size else 0
            sil_x_max = int(sil_xs.max()) if sil_xs.size else sil_x_min
            cab_forward_cut = sil_x_min + (sil_x_max - sil_x_min) * 0.45
            glass_candidates = [
                cid for cid, size in glass_sizes.items()
                if size >= 4 and glass_cents[cid][0] >= cab_forward_cut
            ]
            if glass_candidates:
                cab_glass = glass_labels == max(glass_candidates, key=lambda cid: glass_sizes[cid])
            gy, gx = np.nonzero(cab_glass)
            gy0, gy1 = max(0, int(gy.min()) - 6), min(obj_sil.shape[0], int(gy.max()) + 7)
            gx0, gx1 = max(0, int(gx.min()) - 6), min(obj_sil.shape[1], int(gx.max()) + 7)
            cab_box[gy0:gy1, gx0:gx1] = True
            cab_roof = roles["livery"] & cab_box & (~cab_glass)
        deck_domain = roles["livery"] & (~cab_box)
        well_ring = ring_around(well_region, deck_domain | obj_sil, 5) & roles["livery"]
        # Deck around the cab house, not the house itself and not the boom (forward of the pane).
        cab_near = dilate_mask(cab_box | cab_glass, 8)
        cab_far = dilate_mask(cab_box | cab_glass, 20)
        cab_ring = cab_far & (~cab_near) & roles["livery"]
        if cab_glass.sum() >= 4:
            gx_max = int(np.nonzero(cab_glass)[1].max())
            cab_ring = cab_ring & (np.arange(obj_sil.shape[1])[None, :] <= (gx_max + 3))
        if well_ring.sum() < 8:
            well_ring = roles["livery"] & (~well_region)
        if cab_ring.sum() < 8:
            cab_ring = roles["livery"] & (~cab_roof) & (~cab_glass)

        def mean_vd(mask):
            if mask.sum() < 4:
                return 0.0
            return float((DEPTH_ENCODE_RANGE - rel_z[mask]).mean())

        well_vd = mean_vd(well_region)
        deck_w = mean_vd(well_ring)
        cab_vd = mean_vd(cab_roof)
        deck_c = mean_vd(cab_ring)
        well_hole = well_vd - deck_w
        cab_raised = deck_c - cab_vd
        c3["HAS_MASS"] = _row("HAS_MASS", round(has_mass, 4))
        c3["WELL_IS_A_HOLE"] = _row("WELL_IS_A_HOLE", round(well_hole, 4))
        c3["CAB_IS_RAISED"] = _row("CAB_IS_RAISED", round(cab_raised, 4))
        well_signed = well_hole
        cab_signed = -cab_raised
        differ_ok = (well_signed > 0) != (cab_signed > 0)
        c3["WELL_CAB_DIFFER"] = {
            "value": [round(well_signed, 4), round(cab_signed, 4)],
            "floor": "opposite signs",
            "op": "signs",
            "pass": bool(differ_ok),
        }
        depth_wu = {
            "hasMass": has_mass,
            "wellMinusDeck": well_hole,
            "cabMinusDeck": cab_raised,
            "p02": float(p02) if sil_z.size else 0.0,
            "p98": float(p98) if sil_z.size else 0.0,
        }
        bpy.data.images.remove(depth_img)
    else:
        for key in ("HAS_MASS", "WELL_IS_A_HOLE", "CAB_IS_RAISED"):
            c3[key] = _row(key, 0.0, ok=False)
        c3["WELL_CAB_DIFFER"] = {"value": [0, 0], "floor": "opposite signs", "op": "signs", "pass": False}

    liv = roles["livery"]
    if liv.sum():
        _lab, sizes, _cents = connected_components(liv)
        total = float(liv.sum())
        one_body = (max(sizes.values()) / total) if sizes else 0.0
    else:
        one_body = 0.0
    c3["ONE_BODY"] = _row("ONE_BODY", round(one_body, 4))

    if travel_along_x and textured.get("bbox"):
        x0, y0, x1, y1 = textured["bbox"]
        h = obj_sil.shape[0]
        mid_y = 0.5 * (y0 + y1)
        port_track = roles["track"] & (np.arange(h)[:, None] >= mid_y)
        stbd_track = roles["track"] & (np.arange(h)[:, None] <= mid_y)
    else:
        port_track = roles["track"]
        stbd_track = roles["track"]
    c3["TREAD_PADS_PORT"] = _row("TREAD_PADS_PORT", float(tread_sign_changes(clay_luma, port_track)))
    c3["TREAD_PADS_STARBOARD"] = _row("TREAD_PADS_STARBOARD", float(tread_sign_changes(clay_luma, stbd_track)))
    c3["TRACK_ENDS_ROUND_PORT"] = _row("TRACK_ENDS_ROUND_PORT", round(track_roundness(port_track), 4))
    c3["TRACK_ENDS_ROUND_STARBOARD"] = _row("TRACK_ENDS_ROUND_STARBOARD", round(track_roundness(stbd_track), 4))

    nrm_path = TEX_DIR / "rover_atlas_lod0_normal.png"
    nrm_std = 0.0
    nrm_liv = 0.0
    if nrm_path.exists():
        nrm_arr, nw, nh, nrm_img = load_image_array(nrm_path)
        nrm_std = float(nrm_arr[..., :3].std())
        u0, v0, tile, _g = tile_rect_px(ATLAS_TILE["livery"], nw)
        tile_px = nrm_arr[v0:v0 + tile, u0:u0 + tile, :3]
        nrm_liv = float(tile_px.std())
        bpy.data.images.remove(nrm_img)
    c3["NORMAL_RELIEF"] = _row("NORMAL_RELIEF", round(nrm_std, 4))
    c3["NORMAL_RELIEF_LIVERY"] = _row("NORMAL_RELIEF_LIVERY", round(nrm_liv, 4))

    body_sil = obj_sil & (~roles["track"])
    if body_sil.sum() > 16:
        clay_std = float(clay_luma[body_sil].std() * 255.0)
    else:
        clay_std = 0.0
    c3["CLAY_SHADING"] = _row("CLAY_SHADING", round(clay_std, 4))

    albedo_path = TEX_DIR / "rover_atlas_lod0_basecolor.png"
    hue = sat = 0.0
    bit_ok = False
    bit_hue = 0.0
    if albedo_path.exists():
        alb, aw, ah, alb_img = load_image_array(albedo_path)
        u0, v0, tile, gut = tile_rect_px(ATLAS_TILE["livery"], aw)
        inner = alb[v0 + gut:v0 + tile - gut, u0 + gut:u0 + tile - gut, :3]
        mean_rgb = inner.reshape(-1, 3).mean(axis=0)
        h, s, v = rgb_to_hsv_np(mean_rgb.reshape(1, 1, 3))
        hue, sat = float(h[0, 0]), float(s[0, 0])
        bu0, bv0, btile, bgut = tile_rect_px(ATLAS_TILE["bit"], aw)
        bit = alb[bv0 + bgut:bv0 + btile - bgut, bu0 + bgut:bu0 + btile - bgut, :3]
        # Heat tint lives in the top fifth of the tile (v high in image = high row in blender).
        heat_cut = int(bit.shape[0] * 0.80)
        steel_band = bit[:heat_cut]
        steel_rgb = steel_band.reshape(-1, 3).mean(axis=0)
        bh, _bs, _bv = rgb_to_hsv_np(steel_rgb.reshape(1, 1, 3))
        bit_hue = float(bh[0, 0])
        bit_ok = not (bit_hue >= 330.0 or bit_hue <= 25.0)
        bpy.data.images.remove(alb_img)
    c3["LIVERY_HUE"] = _row("LIVERY_HUE", round(hue, 4))
    c3["LIVERY_SAT"] = _row("LIVERY_SAT", round(sat, 4))
    c3["BIT_NOT_PINK"] = {
        "value": round(bit_hue, 4),
        "floor": "outside 330-25",
        "op": "hue",
        "pass": bool(bit_ok),
    }

    edge_ratio = 0.0
    if edge_mask_path.exists():
        edge_arr, _, _, edge_img = load_image_array(edge_mask_path)
        edge_n = int((luma_of(edge_arr) > 0.02).sum())
        top_n = max(1, int(obj_sil.sum()))
        edge_ratio = float(edge_n) / float(top_n)
        bpy.data.images.remove(edge_img)
    c3["EDGE_SHOWS_WALL"] = _row("EDGE_SHOWS_WALL", round(edge_ratio, 4))

    c3_ok = all(row.get("pass") for row in c3.values())
    report = {
        "textured": tex_rows,
        "texturedPass": tex_ok,
        "clay": clay_rows,
        "clayHolds": clay_ok,
        "cycle3": c3,
        "cycle3Pass": c3_ok,
        "texturedRaw": textured,
        "clayRaw": clay,
        "objectBboxPx": textured.get("bbox"),
        "objectSilhouettePixels": textured.get("silhouettePixels"),
        "depthWu": depth_wu,
        "normalStdev": nrm_std,
        "normalStdevLivery": nrm_liv,
        "pass": bool(tex_ok and clay_ok and c3_ok),
    }
    print("planform_report textured:")
    for key, row in tex_rows.items():
        flag = "PASS" if row["pass"] else "FAIL"
        print(f"  {key:28s} {float(row['value']):.4f} {row['op']} {_fmt_floor(row['floor'])}  {flag}")
    print("planform_report clay (object silhouette, not pad):")
    for key, row in clay_rows.items():
        flag = "PASS" if row["pass"] else "FAIL"
        print(f"  {key:28s} {float(row['value']):.4f} {row['op']} {_fmt_floor(row['floor'])}  {flag}")
    print(f"  CLAY_HOLDS {clay_ok}")
    print("planform_report cycle3:")
    for key, row in c3.items():
        flag = "PASS" if row["pass"] else "FAIL"
        val = row["value"]
        val_s = f"{val:.4f}" if isinstance(val, (int, float)) else str(val)
        fl = row["floor"]
        fl_s = _fmt_floor(fl) if isinstance(fl, (int, float, tuple, list)) else str(fl)
        print(f"  {key:28s} {val_s} {row['op']} {fl_s}  {flag}")
    print(f"  object bbox px={textured.get('bbox')} sil={textured.get('silhouettePixels')}")

    crop, _ = crop_1to1(top_arr, textured.get("bbox"))
    clay_crop, _ = crop_1to1(clay_arr, textured.get("bbox"))
    save_rgba_png(still_dir / "works_top_1to1.png", crop, crop.shape[1], crop.shape[0])
    save_rgba_png(still_dir / "works_top_clay_1to1.png", clay_crop, clay_crop.shape[1], clay_crop.shape[0])
    review_dir = still_dir / "review_1to1"
    review_dir.mkdir(parents=True, exist_ok=True)
    for name in ("works_edge.png", "works_site.png"):
        src = still_dir / name
        if src.exists():
            frame, _, _, img = load_image_array(src)
            native = crop_object_native(frame, pad=12 if "edge" in name else 8)
            save_rgba_png(review_dir / name.replace(".png", "_1to1.png"), native, native.shape[1], native.shape[0])
            bpy.data.images.remove(img)

    sheet = np.zeros((1080, 1920, 4), dtype=np.float32)
    sheet[..., 3] = 1.0
    ch, cw = crop.shape[:2]
    y_off = (1080 - ch) // 2
    x_left = 160
    x_right = 1920 - 160 - cw
    sheet[y_off:y_off + ch, x_left:x_left + cw] = crop
    if FLIGHT_STILL.exists():
        flight, fw, fh, _fimg = load_image_array(FLIGHT_STILL)
        fcrop, _ = crop_1to1(flight, None, size=cw)
        sheet[y_off:y_off + fcrop.shape[0], x_right:x_right + fcrop.shape[1]] = fcrop
        bpy.data.images.remove(_fimg)
    else:
        print(f"WARN missing flight still {FLIGHT_STILL}")
    blit_text(sheet, f"ASSETS/WORKS/ROVER/EVIDENCE/CYCLE_{CYCLE:03d}/WORKS_TOP_1TO1.PNG", 40, 40, (1, 0.85, 0.3), 2)
    blit_text(sheet, ".DEVSHOTS/ASTEROID-WORKS/04-FLIGHT-RELAY-COURIER.PNG", 1000, 40, (0.7, 0.85, 1.0), 2)
    save_rgba_png(still_dir / "works_beside_flight.png", sheet, 1920, 1080)

    bpy.data.images.remove(mask_img)
    bpy.data.images.remove(clay_img)
    bpy.data.images.remove(top_img)
    out = still_dir / "planform_report.json"
    out.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    return report


def texture_report():
    rows = {}
    pngs = sorted(p for p in TEX_DIR.glob("*.png"))
    for lod, size in TEX_BY_LOD.items():
        maps = {}
        for kind in ("basecolor", "orm", "normal"):
            path = TEX_DIR / f"rover_atlas_lod{lod}_{kind}.png"
            if path.exists():
                maps[kind] = {
                    "path": str(path.relative_to(ROOT)).replace("\\", "/"),
                    "size": size,
                    "bytes": path.stat().st_size,
                }
        rows[f"lod{lod}"] = {"resolution": size, "maps": maps}
    glb_bytes = {}
    for lod in (0, 1, 2):
        path = FAMILY / "source" / f"rover_lod{lod}.glb"
        glb_bytes[f"lod{lod}"] = path.stat().st_size if path.exists() else 0
    tile_map = {role: index for role, index in ATLAS_TILE.items()}
    report = {
        "atlas": "4x4",
        "gutterAt2048": 4,
        "tileMap": tile_map,
        "reserved": {str(k): {"neutralRole": v[0]} for k, v in RESERVED_TILES.items()},
        "lods": rows,
        "pngCount": len(pngs),
        "pngBudget": PNG_BUDGET,
        "pngFiles": [p.name for p in pngs],
        "glbBytes": glb_bytes,
        "glbBudget": {f"lod{k}": v for k, v in GLB_BUDGET.items()},
    }
    print("texture_report:")
    print(f"  pngCount {len(pngs)} <= {PNG_BUDGET}")
    for lod in (0, 1, 2):
        got = glb_bytes[f"lod{lod}"]
        want = GLB_BUDGET[lod]
        flag = "PASS" if got <= want else "FAIL"
        print(f"  rover_lod{lod}.glb {got} <= {want}  {flag}")
    return report


def render_stills_from_glb(glb_path: Path, still_dir: Path):
    reset_scene()
    bpy.ops.import_scene.gltf(filepath=str(glb_path))
    camera, pad = setup_mine_lights()
    for obj in bpy.data.objects:
        if obj.name.startswith(("LOD1_", "LOD2_")):
            obj.hide_render = True
            obj.hide_set(True)
        elif obj.name.startswith("hopper_fill_"):
            obj.hide_render = True
            obj.hide_set(True)
    meshes = [
        obj for obj in bpy.data.objects
        if obj.type == "MESH" and obj.name != "MinePad" and not obj.name.startswith("hopper_fill_")
    ]
    still_dir.mkdir(parents=True, exist_ok=True)

    def snap(name, framing, transparent=False):
        scene = bpy.context.scene
        scene.render.film_transparent = transparent
        pose = apply_works_camera(camera, framing=framing, focus=(0.0, 0.0, 0.0))
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
        return str(path)

    paths = {
        "works_top": snap("works_top.png", "works_top"),
        "works_edge": snap("works_edge.png", "works_edge"),
        "works_site": snap("works_site.png", "works_site"),
    }
    backups, _clay = override_clay(meshes)
    paths["works_top_clay"] = snap("works_top_clay.png", "works_top")
    restore_mats(meshes, backups)

    pad.hide_render = True
    for light in [obj for obj in bpy.data.objects if obj.type == "LIGHT"]:
        light.hide_render = True
    world = bpy.context.scene.world
    if world and world.use_nodes:
        bg = world.node_tree.nodes.get("Background")
        if bg:
            bg.inputs["Color"].default_value = (0, 0, 0, 1)
            bg.inputs["Strength"].default_value = 0.0
    scene = bpy.context.scene
    vt = scene.view_settings.view_transform
    look = scene.view_settings.look
    exposure = scene.view_settings.exposure
    scene.view_settings.view_transform = "Standard"
    try:
        scene.view_settings.look = "None"
    except TypeError:
        pass
    scene.view_settings.exposure = 0.0
    flat_back = override_flat_mask(meshes)
    paths["works_top_mask"] = snap("works_top_mask.png", "works_top", transparent=False)
    paths["works_edge_mask"] = snap("works_edge_mask.png", "works_edge", transparent=False)
    restore_mats(meshes, flat_back)
    pose_top = apply_works_camera(camera, framing="works_top", focus=(0.0, 0.0, 0.0))
    depth_back, _dmat = override_depth(meshes, pose_top["distance"])
    paths["works_top_depth"] = snap("works_top_depth.png", "works_top", transparent=False)
    restore_mats(meshes, depth_back)
    scene.view_settings.view_transform = vt
    scene.view_settings.look = look
    scene.view_settings.exposure = exposure
    pad.hide_render = False
    for light in [obj for obj in bpy.data.objects if obj.type == "LIGHT"]:
        light.hide_render = False
    return paths


def purge_cycle1_textures():
    legal = {f"rover_atlas_lod{lod}_{kind}.png" for lod in (0, 1, 2) for kind in ("basecolor", "orm", "normal")}
    if not TEX_DIR.exists():
        return []
    removed = []
    for path in sorted(TEX_DIR.glob("*.png")):
        if path.name not in legal:
            path.unlink()
            removed.append(path.name)
    return removed


def main():
    global TEX
    FAMILY.mkdir(parents=True, exist_ok=True)
    TEX_DIR.mkdir(parents=True, exist_ok=True)
    still_dir = FAMILY / "evidence" / f"cycle_{CYCLE:03d}"
    still_dir.mkdir(parents=True, exist_ok=True)
    reset_scene()
    print(f"works rover cycle {CYCLE}: atlas 4x4, map ladder {TEX_BY_LOD}")
    reports = []
    lod0_glb = None
    lod1_glb = None
    atlas_maps_by_lod = {}
    for lod in (0, 1, 2):
        reset_scene()
        TEX = TEX_BY_LOD[lod]
        atlas_maps, atlas_mat, tile_mapping = create_atlas(lod)
        atlas_maps_by_lod[lod] = tile_mapping
        role_mats = create_role_materials(lod)
        collection, report = build_lod(lod, role_mats, atlas_mat, atlas_maps)
        output = export_lod(collection, lod)
        nbytes = output.stat().st_size
        if nbytes > 50 * 1024 * 1024:
            raise RuntimeError(f"{output.name} is {nbytes} bytes (>50 MB GitHub hard reject)")
        if nbytes > GLB_BUDGET[lod]:
            print(f"WARN {output.name} {nbytes} over size floor {GLB_BUDGET[lod]} (named features kept)")
        report.update({
            "path": str(output.relative_to(ROOT)).replace("\\", "/"),
            "bytes": nbytes,
            "sha256": sha256(output),
            "byteBudget": GLB_BUDGET[lod],
            "byteOverBudget": nbytes > GLB_BUDGET[lod],
        })
        reports.append(report)
        if lod == 0:
            lod0_glb = output
        elif lod == 1:
            lod1_glb = output
        print(json.dumps({"lod": lod, "triangles": report["triangles"], "draws": report["draws"], "bytes": nbytes, "sha256": report["sha256"]}, indent=2))

    combined_source = export_combined_source(lod0_glb, lod1_glb)
    combined_sha = sha256(combined_source)
    print(json.dumps({"combinedSource": str(combined_source.relative_to(ROOT)).replace("\\", "/"),
                      "bytes": combined_source.stat().st_size, "sha256": combined_sha}, indent=2))

    removed = purge_cycle1_textures()
    print(f"purged cycle-1 textures: {len(removed)}")

    blender_status = {"export": "ok", "render": "ok"}
    stills = {}
    planform = {}
    try:
        stills = render_stills_from_glb(combined_source, still_dir)
        planform = planform_report(still_dir)
    except Exception as exc:
        blender_status["render"] = f"crash: {exc}"
        print(f"RENDER CRASH (GLBs survive): {exc}")
        raise

    tex = texture_report()
    tex["tileMapDetail"] = atlas_maps_by_lod.get(0, {})
    (still_dir / "texture_report.json").write_text(json.dumps(tex, indent=2) + "\n", encoding="utf-8")

    hashes = {f"rover_lod{r['lod']}.glb": r["sha256"] for r in reports}
    hashes["place_works_rover.glb"] = combined_sha
    sidecar = FAMILY / "evidence" / f"cycle_{CYCLE:03d}_hash_sidecar.json"
    determinism = {"note": "first run of this pair; sidecar written"}
    if sidecar.exists():
        prev = json.loads(sidecar.read_text(encoding="utf-8"))
        determinism = {
            "run1": prev,
            "run2": hashes,
            "result": "MATCH" if prev == hashes else "MISMATCH",
        }
        print(f"determinism {determinism['result']}")
    sidecar.write_text(json.dumps(hashes, indent=2) + "\n", encoding="utf-8")

    still_rel = {}
    for key, path in stills.items():
        p = Path(path)
        still_rel[key] = str(p.relative_to(ROOT)).replace("\\", "/") if p.is_absolute() else str(p).replace("\\", "/")
    still_rel["works_top_1to1"] = str((still_dir / "works_top_1to1.png").relative_to(ROOT)).replace("\\", "/")
    still_rel["works_top_clay_1to1"] = str((still_dir / "works_top_clay_1to1.png").relative_to(ROOT)).replace("\\", "/")
    still_rel["works_beside_flight"] = str((still_dir / "works_beside_flight.png").relative_to(ROOT)).replace("\\", "/")
    still_rel["works_top_depth"] = str((still_dir / "works_top_depth.png").relative_to(ROOT)).replace("\\", "/")

    receipt = {
        "schema": "spaceface.worksRover.cycle.v1",
        "assetId": "rover",
        "cycle": CYCLE,
        "rootNode": "rover",
        "targetBboxWu": list(TARGET_BBOX),
        "targetBboxCells": [round(v / CELL_WU, 4) for v in TARGET_BBOX],
        "lods": reports,
        "combinedSource": {
            "path": str(combined_source.relative_to(ROOT)).replace("\\", "/"),
            "bytes": combined_source.stat().st_size,
            "sha256": combined_sha,
            "lods": ["lod0", "lod1"],
        },
        "textures": tex,
        "planform": planform,
        "hooks": reports[0]["hooks"] if reports else {},
        "bbox": reports[0]["bbox"] if reports else {},
        "stills": still_rel,
        "visibleFaces": {"note": "cycle 78 does not run hidden-face culling with --delete"},
        "determinism": determinism,
        "purgedTextures": removed,
        "blender": blender_status,
    }
    out_json = FAMILY / "evidence" / f"cycle_{CYCLE:03d}.json"
    out_json.write_text(json.dumps(receipt, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({
        "ok": True,
        "cycle": CYCLE,
        "tris0": reports[0]["triangles"],
        "bbox": reports[0]["bbox"]["sizeWu"],
        "pngCount": tex["pngCount"],
        "planformPass": planform.get("pass"),
    }, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

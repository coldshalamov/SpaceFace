"""PQ-131.01 Works rover MTX builder. Cycle 84: give the cutter barrel depth.

Cycle 80 put the authored LOD1 mesh on the real site camera and earned a
hash-bound independent KEEP there. Its unchanged LOD0 remained REVISE at top
and edge: the boom read as a striped rectangular bar, the cutter as a small
spark, and the dark material roles compressed into one H.

Cycle 83 exposed the dark cutter face and earned a top-camera KEEP, but its
thin raised disc and bright hub collapsed in the supported edge view to a coin
with a white spark. Cycle 84 repairs that exact close-camera construction:

  * no COLLAPSE decimate on any LOD;
  * LOD0 uses one thick scalloped drum that overlaps its axial housing, so the
    top keeps a round working face while the edge gets a cylindrical side band;
  * the six separate one-pixel tooth boxes are folded into the drum silhouette;
  * the hub becomes a small, non-emissive scar-steel boss instead of a bright
    tool-steel spark;
  * LOD0 glass, hopper liner, and scar steel get their own deliberate value
    bands while track rubber and deck plate stay frozen;
  * LOD1/2 keep the Cycle-80 geometry and atlas values so site readability is
    not traded for close-camera polish;
  * the hopper well stays the cycle-78 cavity: no steel lip ring, no steel
    well walls, no boom cap, and no yellow hull.

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
CYCLE = 84
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
    "drum": 9,
}
# #ffd23f safety yellow — reserved tiles copy the live livery so the atlas
# mean cannot drift off the brief when unused tiles are sampled.
# #ffd23f at 46% value. Hue and saturation are scale-invariant, so the paint is
# still exactly the brief's safety yellow; it just stops being a light. At full
# value it rendered a median of 196.8 against a works pad at 46 and a deck at
# 54, which is the "continuous luminous outline" read the brief bans by name.
LIVERY_SCALE = 0.41
LIVERY_RGB = tuple(c * LIVERY_SCALE for c in (1.0, 210.0 / 255.0, 63.0 / 255.0))
# Body albedo is neutral-to-cool so that the warm works key (1.00, 0.863, 0.737)
# lands the body around hue 28 and leaves the yellow accent a real hue gap to
# sit in. Cycle 78 put every saturated pixel on the machine inside hue 26-31.
STEEL_PLATE_RGB = (0.200, 0.202, 0.206)
TRACK_RUBBER_RGB = (0.071, 0.073, 0.077)
RESERVED_TILES = {
    9: ("livery", LIVERY_RGB),
    10: ("livery", LIVERY_RGB),
    11: ("steel", STEEL_PLATE_RGB),
    12: ("steel", STEEL_PLATE_RGB),
    13: ("track", TRACK_RUBBER_RGB),
    14: ("chevron", (0.058, 0.050, 0.038)),
    15: ("rubble", (0.14, 0.11, 0.08)),
}
# Cycle 79 value ladder, authored as sRGB base colour (these arrays are written
# into an sRGB PNG). Rendered against the works pad, whose Principled Base
# Color socket is LINEAR (0.07, 0.055, 0.042) and reads R72-77 at works_top:
#
#   track rubber   sRGB 0.118 -> linear 0.0128   darkest mass, below everything
#   chevron plate  sRGB 0.062 -> linear 0.0043   dark bars / boom arm
#   scar / sooted  sRGB 0.175 -> linear 0.0251   cab house, side walls, bit body
#   steel plate    sRGB 0.235 -> linear 0.0452   deck/tub — BELOW pad 0.07
#   steel machined sRGB 0.305 -> linear 0.0782   undercarriage, spine, hardware
#   steel bright   sRGB 0.450 -> linear 0.1723   worn edges only
#   livery paint   #ffd23f                       accent, never the brightest object
#
# `steel` and `track` carry that ladder INSIDE their atlas tile as v-bands, so
# one role can serve a dark deck and a bright worn lip without a new tile.
ROLE_RGB = {
    "livery": LIVERY_RGB,
    "chevron": (0.058, 0.050, 0.038),
    "steel": STEEL_PLATE_RGB,
    "track": TRACK_RUBBER_RGB,
    "glass": (0.140, 0.147, 0.160),
    "bit": (0.60, 0.56, 0.47),
    "lamp": (0.95, 0.88, 0.68),
    "rubble": (0.14, 0.11, 0.08),
    "scar": (0.177, 0.167, 0.157),
}
# Cycle 81 changes only the close-camera atlas. The site camera's LOD1 earned
# an exact-candidate KEEP on Cycle 80, so its bytes and value hierarchy remain
# the reference unless a later independent site review names a visible defect.
LOD0_ROLE_RGB = {
    **ROLE_RGB,
    "glass": (0.130, 0.130, 0.145),
    "rubble": (0.215, 0.170, 0.130),
    "scar": (0.220, 0.210, 0.200),
    "drum": (0.060, 0.066, 0.078),
}
# v-bands inside a role tile: (v_lo, v_hi) -> (base rgb, roughness, metallic).
STEEL_BANDS = (
    (0.00, 0.50, STEEL_PLATE_RGB, 0.64, 0.26),
    (0.50, 0.78, (0.268, 0.272, 0.280), 0.44, 0.70),
    (0.78, 1.01, (0.400, 0.406, 0.418), 0.28, 0.85),
)
TRACK_BANDS = (
    (0.00, 0.82, TRACK_RUBBER_RGB, 0.90, 0.04),
    (0.82, 1.01, (0.268, 0.271, 0.278), 0.32, 0.84),
)
# UV v-window an object samples from its role tile. Anything that does not set
# `sf_v0` explicitly falls to the role default, so no surface can inherit the
# whole tile by accident.
ROLE_V_DEFAULT = {
    "steel": (0.02, 0.46),
    "track": (0.02, 0.78),
}
V_STEEL_PLATE = (0.02, 0.46)
V_STEEL_MACHINED = (0.54, 0.74)
V_STEEL_BRIGHT = (0.82, 0.98)
V_TRACK_RUBBER = (0.02, 0.78)
V_TRACK_LIP = (0.85, 0.99)
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
    "drum": (0.00, 0.50, 1.00),
    "atlas": (0.5, 0.5, 0.5),
}
EMIT_ALPHA = {"lamp": 0.85, "bit": 0.02}

# Geometry contract (works scale). Envelope 1.87 x 1.76 x 0.99.
#
# Cycle 79 moves the body INSIDE the tracks. C78 had the deck at half-width
# 0.54 against a track inner edge at 0.52, so at site the deck corners stood
# past the belts and the machine read as a card lying on two smears. The deck
# now stops at 0.46 and the belts run 0.505 -> 0.845 with a 0.02 lip proud of
# that: the tracks are the widest planform mass, with a real dark gap between
# deck edge and belt.
BODY_HALF_Y = 0.46
BODY_AFT_X = -0.84
BODY_FORE_X = 0.38
AFT_X = -0.84
DECK_Z0 = 0.30
DECK_Z1 = 0.46
DECK_Z = DECK_Z1
# Cab house top; the roof SLAB sits on it and the pane is cut through the slab.
CAB_ROOF_Z = 0.93
ROOF_Z0, ROOF_Z1 = 0.93, 0.988
ROOF_RAIL_Z1 = 1.010
# Wide hopper, then a waist, then a narrow cab. Well mouth is large; floor is
# smaller so the walls read as thickness from above. UNCHANGED from cycle 78:
# three reviewers called this cavity the one finished element of the asset.
WELL_CX, WELL_HX, WELL_HY = -0.48, 0.32, 0.28
WELL_FLOOR_Z = 0.02
WELL_FLOOR_INSET = 0.10
CAB_CX, CAB_HX, CAB_HY = 0.20, 0.20, 0.24
# Roof aperture (a real cut through the roof slab, not a painted square).
PANE_CX, PANE_HX, PANE_HY = 0.272, 0.101, 0.186
PANE_GLASS_Z = 0.900
PANE_FLOOR_Z = 0.90
# Boom pushed outboard: C78's BOOM_OFFSET was 0.1466 against a 0.15 floor and
# the reviewers wanted the plan silhouette to stop being square.
PIVOT = (0.26, -0.42, 0.58)
BIT_TIP = (0.93, -0.42, 0.54)
TRACK_YC, TRACK_HALF_W = 0.675, 0.17
TRACK_R_PLAN = 0.17
TRACK_H = 0.40
TRACK_XC, TRACK_HL, TRACK_R, TRACK_ZC = -0.22, 0.50, 0.17, 0.16
TRACK_BELT_THICK = 0.14
TRACK_TOP_Z = 0.40
# Cross-cleats, not longitudinal strips. C78 rotated its pads by (normal - 90),
# which laid every "grouser" ALONG the direction of travel — the measured
# reason the belt top was an unbroken plane and the tread showed only as a
# dashed line on the inboard edge.
N_TREAD_PADS = 18
CLEAT_LEN = 0.055
CLEAT_RISE = 0.048
N_LIP_SAMPLES = 28
LIP_RISE = 0.052
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
    "CUTTER_SPAN_PX": (">=", 10.0),
    "GLASS_LUMA": ("range", (12.0, 16.0)),
    "HOPPER_LUMA": ("range", (22.0, 28.0)),
    "HOPPER_TRACK_DELTA": (">=", 8.0),
    "DECK_HOPPER_DELTA": (">=", 18.0),
    "SCAR_TRACK_DELTA": (">=", 12.0),
    # Cycle 79 additions. TRACK_CONTRAST_* is a SIGNED cycle-3 row: it wants the
    # belts brighter than the pad by 18 levels. Cycle 79's mandate is the exact
    # opposite — the belts must be the darkest mass on the machine — so that row
    # now fails by construction and is left in place, unedited, rather than
    # rewritten to suit this cycle. TRACK_SEPARATION_* measures the thing the
    # cycle-3 row was actually protecting: the belts must not disappear into the
    # pad, in either direction.
    "TRACK_SEPARATION_PORT": (">=", 18.0),
    "TRACK_SEPARATION_STARBOARD": (">=", 18.0),
}

# The four numbers cycle 78's site reviewer set for cycle 79, measured on the
# same 38 px site crop. See site_report() for the exact bucket definitions.
SITE_FLOORS = {
    "SITE_DARK_BUCKET": (">=", 0.20),
    "SITE_LIGHT_PLUS_ACCENT": ("<=", 0.35),
    "SITE_MAX_OVER_MEDIAN": (">=", 4.0),
    "SITE_ACCENT_HUE_SEPARATION": (">", 5.0),
    # MTX-48 at the site register, measured on the LOD1 still. Collapse-decimate
    # closed these; a copy of LOD0 shot at 19 px/cell cannot prove they survived.
    "SITE_TRACK_SHARE": (">=", 0.28),
    "SITE_WELL_PIXELS": (">=", 4.0),
    "SITE_GLASS_PIXELS": (">=", 2.0),
}
SITE_CROP_PX = 38
SITE_ACCENT_MIN_PX = 8

FLIGHT_STILL = ROOT / ".devshots" / "asteroid-works" / "04-flight-relay-courier.png"


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


def role_maps(role, rgb, size=None, prefix=None, lod=None):
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
        pw, ph = 84, 30
    elif role == "track":
        pw, ph = 44, 16
    elif role == "bit":
        pw, ph = 20, 20
    elif role == "rubble":
        pw, ph = 36, 36
    elif role == "scar":
        pw, ph = 40, 28
    elif role == "drum":
        pw, ph = 32, 24
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
        # Three v-bands in one tile: plate (deck/tub), machined (undercarriage,
        # spine, hardware), bright worn edge. An object picks its band with
        # sf_v0/sf_v1, so the deck cannot inherit the hardware's specular.
        vv = y.astype(np.float32) / float(size)
        r = np.zeros((size, size), dtype=np.float32)
        g = np.zeros((size, size), dtype=np.float32)
        b = np.zeros((size, size), dtype=np.float32)
        rough = np.zeros((size, size), dtype=np.float32)
        metal = np.zeros((size, size), dtype=np.float32)
        for v_lo, v_hi, (cr, cg, cb), rg, mt in STEEL_BANDS:
            sel = (vv >= v_lo) & (vv < v_hi)
            if not sel.any():
                continue
            # Plate band gets courses and chipped primer; machined bands get a
            # directional grind, not the same recipe recoloured.
            grind = (np.mod(x, np.uint32(3)) == 0).astype(np.float32) * (0.0 if v_lo < 0.4 else 1.0)
            r = np.where(sel, np.clip(cr * (0.90 + gf * 0.12 - dirt * 0.22 - chip * 0.30) + grind * 0.02, 0, 1), r)
            g = np.where(sel, np.clip(cg * (0.92 + gf * 0.10 - dirt * 0.20 - chip * 0.26) + grind * 0.018, 0, 1), g)
            b = np.where(sel, np.clip(cb * (0.94 + (1 - gf) * 0.08 - dirt * 0.16 - chip * 0.20) + grind * 0.014, 0, 1), b)
            rough = np.where(sel, np.clip(rg + dirt * 0.16 - edge * 0.04 - grind * 0.05, 0.04, 0.95), rough)
            metal = np.where(sel, np.clip(mt + edge * 0.05 + chip * 0.10, 0.0, 1.0), metal)
    elif role == "track":
        # Two v-bands: neutral dark rubber composite (the darkest mass on the
        # machine) and, at the top of the tile, the abraded steel of the belt's
        # outer link edge. The lip rail samples that top band, so the light
        # catch is a real worn surface on a real outboard rail — not a bright
        # ring painted round the whole stadium.
        vv = y.astype(np.float32) / float(size)
        groove = ((dx <= 2) | ((np.mod(x, np.uint32(9)) <= 1) if pw else False)).astype(np.float32)
        polish = np.clip(0.55 + gf * 0.45, 0, 1)
        r = np.zeros((size, size), dtype=np.float32)
        g = np.zeros((size, size), dtype=np.float32)
        b = np.zeros((size, size), dtype=np.float32)
        rough = np.zeros((size, size), dtype=np.float32)
        metal = np.zeros((size, size), dtype=np.float32)
        for v_lo, v_hi, (cr, cg, cb), rg, mt in TRACK_BANDS:
            sel = (vv >= v_lo) & (vv < v_hi)
            if not sel.any():
                continue
            rubber = v_lo < 0.5
            if rubber:
                rr = np.clip(cr * (0.92 + gf * 0.14) - groove * 0.030 + dirt * 0.020, 0, 1)
                gg = np.clip(cg * (0.92 + gf * 0.12) - groove * 0.026 + dirt * 0.017, 0, 1)
                bb2 = np.clip(cb * (0.92 + gf * 0.10) - groove * 0.022 + dirt * 0.014, 0, 1)
                ro = np.clip(rg + dirt * 0.06 - groove * 0.03, 0.04, 0.95)
                me = np.clip(mt + groove * 0.03, 0.0, 1.0)
            else:
                rr = np.clip(cr * (0.82 + polish * 0.26) - dirt * 0.10, 0, 1)
                gg = np.clip(cg * (0.82 + polish * 0.24) - dirt * 0.09, 0, 1)
                bb2 = np.clip(cb * (0.84 + polish * 0.22) - dirt * 0.08, 0, 1)
                ro = np.clip(rg + dirt * 0.14 - polish * 0.08, 0.04, 0.95)
                me = np.clip(mt - dirt * 0.10, 0.0, 1.0)
            r = np.where(sel, rr, r)
            g = np.where(sel, gg, g)
            b = np.where(sel, bb2, b)
            rough = np.where(sel, ro, rough)
            metal = np.where(sel, me, metal)
    elif role == "glass":
        # C78 measured the pane at R1 G1 B5 — the "black crayon cavity" fake.
        # Laminated glass carries a dust film and a sky term; it is dark, never
        # zero, and it must read as glass in the clay pass too.
        film = np.clip(0.55 + gf * 0.45, 0, 1)
        r = np.clip(br * (0.90 + film * 0.30) + dirt * 0.035, 0, 1)
        g = np.clip(bg * (0.90 + film * 0.30) + dirt * 0.030, 0, 1)
        b = np.clip(bb * (0.92 + film * 0.28) + dirt * 0.024, 0, 1)
        if lod == 0:
            rough = np.clip(0.14 + dirt * 0.04, 0.04, 0.95)
        else:
            rough = np.clip(0.40 + dirt * 0.16, 0.04, 0.95)
        metal = np.full((size, size), 0.02, dtype=np.float32)
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
    elif role == "drum":
        # Dark forged cutter steel. Teeth share this role so their silhouette,
        # not a ring of bright pixels, communicates the working face.
        r = np.clip(br * (0.88 + gf * 0.12) - dirt * 0.10, 0, 1)
        g = np.clip(bg * (0.90 + gf * 0.10) - dirt * 0.09, 0, 1)
        b = np.clip(bb * (0.92 + (1 - gf) * 0.08) - dirt * 0.08, 0, 1)
        rough = np.clip(0.52 + dirt * 0.14 - edge * 0.03, 0.18, 0.90)
        metal = np.clip(0.72 + edge * 0.08 - dirt * 0.06, 0.0, 1.0)
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
    emit_value = 0.0 if lod == 0 and role == "bit" else float(EMIT_ALPHA.get(role, 0.0))
    emit = np.full((size, size), emit_value, dtype=np.float32)
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


def pack_atlas(size, lod):
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
    role_rgb = LOD0_ROLE_RGB if lod == 0 else ROLE_RGB
    for role, index in ATLAS_TILE.items():
        if role == "drum" and lod != 0:
            continue
        maps = role_maps(role, role_rgb[role], size=inner, lod=lod)
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
        if lod == 0 and index == ATLAS_TILE["drum"]:
            continue
        maps = role_maps(role, rgb, size=inner, lod=lod)
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
    albedo, orm, nrm, mapping = pack_atlas(size, lod)
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
    role_rows = [
        ("Material_Livery", "livery"),
        ("Material_Chevron", "chevron"),
        ("Material_Steel", "steel"),
        ("Material_Track", "track"),
        ("Material_Glass", "glass"),
        ("Material_Bit", "bit"),
        ("Material_Lamp", "lamp"),
        ("Material_Rubble", "rubble"),
        ("Material_Scar", "scar"),
    ]
    if lod == 0:
        role_rows.append(("Material_Drum", "drum"))
    role_rgb = LOD0_ROLE_RGB if lod == 0 else ROLE_RGB
    for name, role in role_rows:
        material = bpy.data.materials.new(f"{name}_LOD{lod}")
        material.name = f"{name}_LOD{lod}"
        bsdf = principled(material)
        rgb = role_rgb[role]
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
    obj["socket"] = True
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
    bolt = add_cylinder(name, loc, 0.018, 0.016, material, collection, vertices=6, bevel=bevel, rot=(0, 0, 0))
    if bolt.get("spacefaceRole") == "steel":
        bolt["sf_v0"], bolt["sf_v1"] = V_STEEL_MACHINED
    return bolt


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


def band(obj, window):
    """Pin an object to a v-window of its role tile. See ROLE_V_DEFAULT."""
    obj["sf_v0"] = float(window[0])
    obj["sf_v1"] = float(window[1])
    return obj


def set_bevel(obj, width=None, segments=None):
    """Reach into the bevel fleet_construction added. Two segments on every big
    loft is most of the LOD0 triangle bill; one segment still catches the key."""
    mod = obj.modifiers.get("ProductionBevel")
    if mod is None:
        return obj
    if width is not None:
        if width <= 0:
            obj.modifiers.remove(mod)
            return obj
        mod.width = width
    if segments is not None:
        mod.segments = int(segments)
    return obj


def cut_box_checked(host, name, loc, scale, rot=(0, 0, 0)):
    """boolean_cut_box swallows its own failure and prints. A silently skipped
    aperture is exactly how cycle 78 shipped a painted square where the brief
    asked for a hole, so refuse to continue when the mesh did not change."""
    apply_modifiers(host)
    before = len(host.data.polygons)
    boolean_cut_box(host, name, loc, scale, rot=rot)
    after = len(host.data.polygons)
    if after == before:
        raise RuntimeError(
            f"boolean cut {name!r} on {host.name!r} changed nothing "
            f"({before} polygons before and after) — the cut was skipped"
        )
    return host


def cut_cylinder_checked(host, name, loc, radius, depth, rot=(0, math.pi / 2, 0), vertices=12):
    apply_modifiers(host)
    before = len(host.data.polygons)
    boolean_cut_cylinder(host, name, loc, radius, depth, rot=rot, vertices=vertices)
    after = len(host.data.polygons)
    if after == before:
        raise RuntimeError(
            f"boolean cut {name!r} on {host.name!r} changed nothing "
            f"({before} polygons before and after) — the cut was skipped"
        )
    return host


def add_track_cleats(prefix, xc, yc, half_len, radius, thick, z_top, n_pads, material, collection, bevel):
    """Cross-cleats that break the top plane of the belt.

    `stadium_xy_path` returns the OUTWARD NORMAL angle, not the tangent. Cycle
    78 rotated its pads by (ang - pi/2), which aligned their long axis with the
    direction of travel; the belt top stayed an unbroken plane and the tread
    survived only as a dashed line on the inboard edge. Rotating by `ang` lays
    the cleat across the belt, which is what a grouser is.
    """
    made = []
    half_across = thick * 0.5
    seat = radius - half_across
    for i, (x, y, ang) in enumerate(stadium_xy_path(xc, yc, half_len, radius, n_pads)):
        nx, ny = math.cos(ang), math.sin(ang)
        loc = (x - nx * (radius - seat), y - ny * (radius - seat), z_top + CLEAT_RISE * 0.5 - 0.010)
        pad = add_box(
            f"{prefix}_Cleat_{i:02d}", loc,
            (half_across * 0.96, CLEAT_LEN * 0.5, CLEAT_RISE * 0.5),
            material, collection, bevel=bevel, rot=(0.0, 0.0, ang),
        )
        band(pad, V_TRACK_RUBBER)
        made.append(pad)
    return made


def add_track_outer_lip(prefix, xc, yc, half_len, radius, sign, z_top, material, collection, lod):
    """A steel rail proud of the belt's OUTBOARD face, and nowhere else.

    Every profile cycle 78's reviewers cut across the belts found the value only
    dropping as they crossed the outer edge, while the one light-catching line
    ran the inner, deck-side seam. This puts the catch where a track's abraded
    link edge actually is. It is segmented, not a ring: a continuous bright
    outline round the whole stadium is the read the brief bans by name, and this
    is not the hopper lip ring cycle 77 removed.
    """
    made = []
    # Coarse four/eight-segment perimeter boxes overhang the authored stadium
    # at the turns: their long local Y axis becomes an X/Y diagonal after
    # rotation. That made the site LOD physically larger than LOD0. Keep the
    # sparse read, but split the outboard catch often enough that every box
    # stays inside the frozen track envelope.
    n_samples = 28 if lod == 0 else (16 if lod == 1 else 12)
    peri = 4.0 * half_len + 2.0 * math.pi * radius
    seg = peri / float(n_samples) * 0.92
    for i, (x, y, ang) in enumerate(stadium_xy_path(xc, yc, half_len, radius, n_samples)):
        ny = math.sin(ang)
        if ny * sign < 0.30:
            continue
        nx = math.cos(ang)
        rail = add_box(
            f"{prefix}_Lip_{i:02d}",
            (x + nx * 0.008, y + ny * 0.008, z_top - LIP_RISE * 0.5 + 0.006),
            (0.0105, seg * 0.5, LIP_RISE * 0.5),
            material, collection,
            bevel=0.0025 if lod == 0 else 0.0,
            rot=(0.0, 0.0, ang),
        )
        set_bevel(rail, segments=1)
        band(rail, V_TRACK_LIP)
        rail["sf_body"] = True
        made.append(rail)
    if not made:
        raise RuntimeError(f"{prefix}: outer lip produced no segments")
    return made


def add_faceted_bit(prefix, loc, body_mat, drum_mat, tool_mat, collection, lod, bevel):
    tx, ty, tz = loc
    if lod == 0:
        # Cycle 83's thin raised disc fixed the supported top view but became a
        # coin with a bright spark in the supported flank view. Keep the same
        # top-view diameter while giving the working end real barrel depth. A
        # single scalloped prism supplies the teeth in its silhouette instead
        # of six detached one-pixel boxes.
        housing = add_cylinder(
            f"{prefix}Housing", (tx - 0.12, ty, tz), 0.085, 0.22,
            body_mat, collection, vertices=10, bevel=bevel,
            rot=(0, math.pi / 2, 0),
        )
        housing["sf_boom"] = True
        drum_cx = tx - 0.08
        drum_z = tz + 0.04
        drum_half_depth = 0.09
        drum_ring = []
        for i in range(12):
            ang = 2.0 * math.pi * i / 12.0
            radius = 0.122 if i % 2 == 0 else 0.100
            drum_ring.append((
                drum_cx + math.cos(ang) * radius,
                ty + math.sin(ang) * radius,
            ))
        drum = loft_from_rings(
            f"{prefix}Drum",
            [
                [(x, y, drum_z - drum_half_depth) for x, y in drum_ring],
                [(x, y, drum_z + drum_half_depth) for x, y in drum_ring],
            ],
            drum_mat, collection, bevel=bevel, cap=True,
        )
        drum["sf_boom"] = True
        drum["sf_v0"] = 0.10
        drum["sf_v1"] = 0.80
        hub = add_cylinder(
            f"{prefix}Hub",
            (drum_cx, ty, drum_z + drum_half_depth + 0.012),
            0.025, 0.024,
            body_mat, collection, vertices=10, bevel=bevel,
        )
        hub["sf_boom"] = True
        return housing

    # Site LODs retain the compact Cycle-80 head. At 19 px/cell the drum teeth
    # would alias into sparkle and the current silhouette already has KEEP.
    head = add_cylinder(
        f"{prefix}Head", (tx - 0.14, ty, tz), 0.078, 0.26,
        body_mat, collection, vertices=8,
        bevel=bevel, rot=(0, math.pi / 2, 0),
    )
    head["sf_boom"] = True
    head["sf_v0"] = 0.0
    head["sf_v1"] = 0.62
    collar = add_box(
        f"{prefix}Collar", (tx - 0.22, ty, tz), (0.050, 0.062, 0.062),
        body_mat, collection, bevel=bevel, rot=(0, 0, 0),
    )
    collar["sf_boom"] = True
    collar["sf_v0"] = 0.0
    collar["sf_v1"] = 0.50
    # Cycle 78's bit was all one cream-white, so "bright tip" carried no
    # information. The head and collar above are the dark forged body (scar
    # role); only these two carry the tool-steel tile, and only the last one
    # reaches its heat band.
    tip = add_box(
        f"{prefix}Tip", (tx - 0.02, ty, tz), (0.062, 0.052, 0.052),
        tool_mat, collection, bevel=0.0, rot=(0, 0, math.pi / 8),
    )
    tip["sf_boom"] = True
    tip["sf_v0"] = 0.30
    tip["sf_v1"] = 0.72
    point = add_box(
        f"{prefix}Point", (tx + 0.022, ty, tz), (0.030, 0.033, 0.033),
        tool_mat, collection, bevel=0.0, rot=(0, 0, math.pi / 8),
    )
    point["sf_boom"] = True
    point["sf_v0"] = 0.84
    point["sf_v1"] = 1.0
    return head


def count_tris(obj):
    if obj.type != "MESH" or not obj.data:
        return 0
    return sum(max(0, len(poly.vertices) - 2) for poly in obj.data.polygons)


def decimate_to_budget(collection, budget):
    meshes = [
        obj for obj in collection.all_objects
        if obj.type == "MESH" and not obj.name.startswith("hopper_fill_")
    ]
    total = sum(count_tris(obj) for obj in meshes)
    if total <= budget or total == 0:
        return total
    ratio = max(0.08, (budget / float(total)) * 0.96)
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
    # A surface that never chose a band would sample the whole banded tile and
    # smear the value ladder back into one substance. Fail to the role default.
    if obj.get("sf_v0") is None and role in ROLE_V_DEFAULT:
        lo, hi = ROLE_V_DEFAULT[role]
        obj["sf_v0"] = float(lo)
        obj["sf_v1"] = float(hi)
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
    if lod == 0:
        add_hex_bolt(f"{tag}_BoltA", (x, y0 + 0.04, z + 0.012), steel, collection, bevel=0.0)
        add_hex_bolt(f"{tag}_BoltB", (x, y1 - 0.04, z + 0.012), steel, collection, bevel=0.0)
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
    drum_mat = mats.get("Material_Drum", scar_mat)

    bevel_body = 0.012 if lod == 0 else 0.0
    bevel_plate = 0.005 if lod == 0 else 0.0
    n_st = 6 if lod == 0 else (4 if lod == 1 else 3)
    n_arc = n_st
    cyl_v = 10 if lod == 0 else (8 if lod == 1 else 6)

    def machined(obj):
        return band(obj, V_STEEL_MACHINED)

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

    # ------------------------------------------------------------------ deck
    # One continuous deck at z 0.30-0.46, now stopping at half-width 0.46 so the
    # belts own the outline, in plate-band steel so it sits BELOW the pad value.
    hull_specs = (
        (BODY_AFT_X, 0.46, DECK_Z0, DECK_Z1),
        (-0.58, 0.46, DECK_Z0, DECK_Z1),
        (-0.18, 0.42, DECK_Z0, DECK_Z1),
        (0.14, 0.30, DECK_Z0, DECK_Z1),
        (BODY_FORE_X, 0.20, DECK_Z0, DECK_Z1),
    )
    hull = center_loft("HullCore", hull_specs, steel, collection, bevel=bevel_body)
    set_bevel(hull, segments=1)
    band(hull, V_STEEL_PLATE)
    cut_box_checked(hull, "HopperWell", (WELL_CX, 0.0, 0.38), (WELL_HX, WELL_HY, 0.20))
    recalc_mesh(hull)
    hull["sf_body"] = True

    if lod <= 1:
        belly_specs = (
            (-0.18, 0.34, 0.08, DECK_Z0),
            (0.08, 0.32, 0.08, DECK_Z0),
            (0.30, 0.28, 0.08, DECK_Z0),
        )
        belly = center_loft("Belly", belly_specs, steel, collection, bevel=bevel_body)
        set_bevel(belly, segments=1)
        band(belly, V_STEEL_PLATE)
        belly["sf_body"] = True

    # Overlapping plate courses with real gaps between them. Row y=140 of cycle
    # 78 held twenty-eight consecutive pixels of one value; nothing on this deck
    # runs that far unbroken now. LOD1 drops them: 0.01 wu steps do not occupy a
    # pixel at 19 px/cell, and they were the first thing COLLAPSE ate.
    if lod == 0:
        for tag, x0, x1, hy0, hy1, rise in (
            ("DeckCourseAft", -0.82, -0.62, 0.42, 0.42, 0.012),
            ("DeckCourseAftB", -0.60, -0.50, 0.43, 0.42, 0.020),
            ("DeckCourseWaist", -0.14, 0.02, 0.40, 0.34, 0.010),
            ("DeckCourseWaistB", 0.04, 0.14, 0.335, 0.305, 0.022),
            ("DeckCourseMid", 0.05, 0.20, 0.33, 0.28, 0.014),
            ("DeckCourseFore", 0.23, 0.36, 0.26, 0.19, 0.010),
        ):
            course = add_folded_sheet(
                tag,
                (x0, -hy0, DECK_Z1 + rise), (x1, -hy1, DECK_Z1 + rise),
                (x1, hy1, DECK_Z1 + rise), (x0, hy0, DECK_Z1 + rise),
                0.016, steel, collection, bevel_plate,
            )
            band(course, V_STEEL_PLATE)

        # A bolted service hatch on the waist, which is where a deck plate would
        # actually come off. Cycle 78's deck carried no access of any kind.
        hatch = add_box(
            "DeckHatch", (-0.28, 0.235, DECK_Z1 + 0.014),
            (0.085, 0.070, 0.014), steel, collection, bevel=bevel_plate,
        )
        band(hatch, V_STEEL_PLATE)
        for hi, (hx, hy) in enumerate((
            (-0.355, 0.175), (-0.205, 0.175), (-0.355, 0.295), (-0.205, 0.295),
        )):
            add_hex_bolt(f"DeckHatchBolt_{hi}", (hx, hy, DECK_Z1 + 0.022), steel, collection, bevel=0.0)
    add_folded_sheet(
        "HopperOuterAft",
        (BODY_AFT_X, -0.46, DECK_Z1),
        (BODY_AFT_X, 0.46, DECK_Z1),
        (BODY_AFT_X, 0.46, 0.12),
        (BODY_AFT_X, -0.46, 0.12),
        0.016, scar_mat, collection, bevel_plate,
    )
    if lod <= 1:
        add_folded_sheet(
            "SideWallP",
            (BODY_AFT_X + 0.02, 0.46, DECK_Z1),
            (BODY_FORE_X - 0.04, 0.20, DECK_Z1),
            (BODY_FORE_X - 0.04, 0.20, 0.12),
            (BODY_AFT_X + 0.02, 0.46, 0.12),
            0.016, scar_mat, collection, bevel_plate,
        )
        add_folded_sheet(
            "SideWallS",
            (BODY_AFT_X + 0.02, -0.46, DECK_Z1),
            (BODY_FORE_X - 0.04, -0.20, DECK_Z1),
            (BODY_FORE_X - 0.04, -0.20, 0.12),
            (BODY_AFT_X + 0.02, -0.46, 0.12),
            0.016, scar_mat, collection, bevel_plate,
        )
    # Track frames are transverse beams, not a continuous plate, so the gap
    # between deck edge and belt stays a real dark slot from directly above.
    for sign, tag in ((1.0, "P"), (-1.0, "S")):
        bridge_xs = (-0.66, -0.24, 0.14) if lod == 0 else ((-0.66, 0.14) if lod == 1 else (-0.24,))
        for ix, xw in enumerate(bridge_xs):
            beam = add_box(
                f"TrackBridge{tag}_{ix}",
                (xw, sign * 0.50, 0.26),
                (0.075, 0.070, 0.045),
                steel, collection, bevel=bevel_plate,
            )
            machined(beam)
            beam["sf_body"] = True

    # --------------------------------------------------------------- hopper
    # Untouched from cycle 78. Dark interior, lit near and side walls, ribbed
    # floor, chamfered rim. No steel lip ring. No steel well walls.
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
    if lod <= 1:
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
            0.018, rubble, collection, bevel_plate,
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
    # C77: HopperLip* deleted. Steel ring read as a framed pane.
    transom_x1 = WELL_CX - WELL_HX
    add_folded_sheet(
        "HopperTransom",
        (BODY_AFT_X, -0.46, DECK_Z1 + 0.014),
        (transom_x1 + 0.04, -0.46, DECK_Z1 + 0.014),
        (transom_x1 + 0.04, 0.46, DECK_Z1 + 0.014),
        (BODY_AFT_X, 0.46, DECK_Z1 + 0.014),
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

    # ------------------------------------------------------------- coamings
    # Safety yellow as two short bolted kick-plates, set at different stations
    # port and starboard so they cannot close a figure. The first attempt at
    # this cycle ran the coaming right round the hopper mouth and produced a
    # closed glowing rectangle at a median of 196.8 - the luminous outline the
    # brief bans, and the framed-pane read cycle 77 removed the steel lip ring
    # for. Yellow is now bolted-on paint on a deck edge, and nothing else.
    coaming_z = DECK_Z1 + 0.018
    livery_bars = (
        ("Livery_KickP", -0.66, -0.26, 0.330, 0.442),
        ("Livery_KickS", -0.80, -0.52, -0.442, -0.330),
        ("Livery_Transom", -0.815, -0.745, -0.240, 0.180),
    )
    if lod <= 1:
        for tag, x0, x1, y0, y1 in livery_bars:
            bar = add_folded_sheet(
                tag,
                (x0, y0, coaming_z), (x1, y0, coaming_z),
                (x1, y1, coaming_z), (x0, y1, coaming_z),
                0.028, livery, collection, bevel_plate,
            )
            bar["sf_livery"] = True
            if lod == 0:
                for bi, bx in enumerate((x0 + 0.035, 0.5 * (x0 + x1), x1 - 0.035)):
                    add_hex_bolt(
                        f"{tag}_Bolt{bi}", (bx, 0.5 * (y0 + y1), coaming_z + 0.020),
                        steel, collection, bevel=0.0,
                    )

    # ------------------------------------------------------------------ cab
    cab = center_loft(
        "CabHouse",
        (
            (CAB_CX - CAB_HX, CAB_HY * 0.80, DECK_Z1, CAB_ROOF_Z),
            (CAB_CX, CAB_HY, DECK_Z1, CAB_ROOF_Z),
            (CAB_CX + CAB_HX, CAB_HY * 0.72, DECK_Z1, CAB_ROOF_Z),
        ),
        scar_mat, collection, bevel=bevel_body,
    )
    set_bevel(cab, segments=1)
    # A real window through the front wall, with the pane set back behind it.
    cut_box_checked(cab, "CabFrontCut", (CAB_CX + CAB_HX, 0.0, 0.845), (0.060, 0.096, 0.050))
    # Clean between cuts: the EXACT solver returns the host untouched when it is
    # handed the loose geometry the previous boolean left behind, and it does it
    # without raising, which is how a "recessed" pane becomes a painted square.
    recalc_mesh(cab)
    cut_box_checked(
        cab, "CabPaneWell",
        (PANE_CX, 0.0, 0.950),
        (PANE_HX - 0.014, PANE_HY - 0.014, 0.062),
    )
    recalc_mesh(cab)

    # The roof is a SLAB and the pane is a hole cut through it. Cycle 78 laid a
    # flat glass sheet on a flat roof and measured R1 G1 B5, square corners, no
    # rim: the row's own named fake, "a dark plate named Recess". This mouth
    # shows 0.058 wu of shell thickness from directly above and carries a
    # mullion, and the glass under it is dark but never zero.
    roof = add_box(
        "CabRoofSlab",
        (CAB_CX, 0.0, (ROOF_Z0 + ROOF_Z1) * 0.5),
        (CAB_HX + 0.012, CAB_HY + 0.010, (ROOF_Z1 - ROOF_Z0) * 0.5),
        scar_mat, collection, bevel=bevel_plate,
    )
    set_bevel(roof, segments=1)
    cut_box_checked(
        roof, "CabPaneAperture",
        (PANE_CX, 0.0, ROOF_Z1),
        (PANE_HX, PANE_HY, (ROOF_Z1 - ROOF_Z0)),
    )
    recalc_mesh(roof)
    pane = add_folded_sheet(
        "CabPaneGlass",
        (PANE_CX - PANE_HX, -PANE_HY, PANE_GLASS_Z),
        (PANE_CX + PANE_HX, -PANE_HY, PANE_GLASS_Z),
        (PANE_CX + PANE_HX, PANE_HY, PANE_GLASS_Z),
        (PANE_CX - PANE_HX, PANE_HY, PANE_GLASS_Z),
        0.010, glass, collection, 0.002 if lod == 0 else 0.0,
    )
    pane["sf_pane"] = True
    if lod == 0:
        # A mullion that reads at 120 px/cell splits a 2 px site pane into noise.
        mullion = add_box(
            "CabMullion",
            (PANE_CX, 0.0, PANE_GLASS_Z + 0.018),
            (0.017, PANE_HY - 0.012, 0.014),
            steel, collection, bevel=0.002,
        )
        machined(mullion)
    fore_pane = add_folded_sheet(
        "CabGlass",
        (CAB_CX + CAB_HX - 0.032, -0.090, 0.802),
        (CAB_CX + CAB_HX - 0.032, 0.090, 0.802),
        (CAB_CX + CAB_HX - 0.032, 0.090, 0.888),
        (CAB_CX + CAB_HX - 0.032, -0.090, 0.888),
        0.008, glass, collection, 0.002 if lod == 0 else 0.0,
    )
    fore_pane["sf_pane"] = True

    # The brow is a LIP with thickness standing past the glass, painted; not a
    # filament. Cycle 78's bar peaked at 244 against a next-brightest of 98.
    _bx = CAB_CX + CAB_HX + 0.006
    brow = add_folded_sheet(
        "CabBrow",
        (_bx, -0.196, ROOF_Z1 - 0.012),
        (_bx + 0.056, -0.196, ROOF_Z1 - 0.038),
        (_bx + 0.056, 0.196, ROOF_Z1 - 0.038),
        (_bx, 0.196, ROOF_Z1 - 0.012),
        0.024, livery, collection, bevel_plate,
    )
    brow["sf_livery"] = True
    # A grab rail, not a painted roof. Half the width it was, so it reads as
    # hardware standing on the lid rather than a bright slab lying on it.
    if lod <= 1:
        roof_rail = add_box(
            "CabRoofRail",
            (CAB_CX - 0.09, 0.0, (ROOF_Z1 + ROOF_RAIL_Z1) * 0.5),
            (0.022, CAB_HY - 0.040, (ROOF_RAIL_Z1 - ROOF_Z1) * 0.5),
            livery, collection, bevel=bevel_plate,
        )
        roof_rail["sf_livery"] = True
    if lod <= 1:
        for ri, ry in enumerate((-(CAB_HY - 0.045), CAB_HY - 0.045)):
            if lod == 0:
                stanchion = add_box(
                    f"CabRailFoot_{ri}", (CAB_CX - 0.09, ry, ROOF_Z1 + 0.004),
                    (0.022, 0.016, 0.010), steel, collection, bevel=0.0,
                )
                machined(stanchion)
        add_folded_sheet(
            "CabCheekP",
            (CAB_CX - 0.08, CAB_HY, DECK_Z1 + 0.012),
            (CAB_CX + CAB_HX, CAB_HY, DECK_Z1 + 0.012),
            (CAB_CX + CAB_HX, 0.30, DECK_Z1 + 0.012),
            (CAB_CX - 0.08, 0.30, DECK_Z1 + 0.012),
            0.018, steel, collection, bevel_plate,
        )
        add_folded_sheet(
            "CabCheekS",
            (CAB_CX - 0.08, -0.30, DECK_Z1 + 0.012),
            (CAB_CX + CAB_HX, -0.30, DECK_Z1 + 0.012),
            (CAB_CX + CAB_HX, -CAB_HY, DECK_Z1 + 0.012),
            (CAB_CX - 0.08, -CAB_HY, DECK_Z1 + 0.012),
            0.018, steel, collection, bevel_plate,
        )

        # Chevrons sit on the steel waist, not on a yellow hat.
        z_chev = DECK_Z1 + 0.026
        add_chevron_plate("Chevron_AP", -0.04, 0.14, 0.32, z_chev, chevron, steel, collection, lod, bevel_plate)
        add_chevron_plate("Chevron_AS", -0.04, -0.32, -0.14, z_chev, chevron, steel, collection, lod, bevel_plate)
        add_chevron_plate("Chevron_BP", 0.12, 0.12, 0.26, z_chev, chevron, steel, collection, lod, bevel_plate)
        add_chevron_plate("Chevron_BS", 0.12, -0.26, -0.12, z_chev, chevron, steel, collection, lod, bevel_plate)

    if lod == 0:
        for i, (bx, by) in enumerate((
            (-0.20, 0.44), (0.06, 0.44), (-0.20, -0.44), (0.06, -0.44),
            (WELL_CX - WELL_HX - 0.02, WELL_HY + 0.08),
            (WELL_CX + WELL_HX + 0.02, -WELL_HY - 0.08),
        )):
            add_hex_bolt(f"PlateBolt_{i}", (bx, by, DECK_Z1 + 0.014), steel, collection, bevel=0.0)

    # Lamp cluster on its own bracket forward of the cab, still recessed under a
    # hood: the bill allows exactly two emissives, and this is the one that has
    # to survive to the site register as the machine's brightest beat.
    lamp_x = BODY_FORE_X + 0.055
    lamp_z = DECK_Z1 + 0.145
    if lod <= 1:
        bracket = add_box(
            "LampBracket", (BODY_FORE_X - 0.02, 0.0, DECK_Z1 + 0.075),
            (0.030, 0.060, 0.080), steel, collection, bevel=0.0,
        )
        machined(bracket)
    can = add_cylinder("LampCan", (lamp_x - 0.035, 0.0, lamp_z), 0.052, 0.070, steel, collection, vertices=cyl_v, bevel=0.0, rot=(0, math.pi / 2, 0))
    machined(can)
    add_cylinder("LampLens", (lamp_x + 0.006, 0.0, lamp_z), 0.040, 0.018, lamp_mat, collection, vertices=cyl_v, bevel=0.0, rot=(0, math.pi / 2, 0))
    if lod <= 1:
        hood = add_folded_sheet(
            "LampHood",
            (lamp_x - 0.090, -0.070, lamp_z + 0.070), (lamp_x - 0.018, -0.062, lamp_z + 0.052),
            (lamp_x - 0.018, 0.062, lamp_z + 0.052), (lamp_x - 0.090, 0.070, lamp_z + 0.070),
            0.012, steel, collection, 0.002 if lod == 0 else 0.0,
        )
        machined(hood)
        pipe = add_cylinder("VentPipe", (CAB_CX - 0.15, CAB_HY - 0.09, ROOF_Z1 + 0.006), 0.026, 0.036, steel, collection, vertices=8, bevel=0.0, rot=(0, 0, 0))
        machined(pipe)
        vent_cap = add_cylinder("VentCap", (CAB_CX - 0.15, CAB_HY - 0.09, ROOF_Z1 + 0.024), 0.034, 0.016, steel, collection, vertices=8, bevel=0.0, rot=(0, 0, 0))
        machined(vent_cap)

    # ------------------------------------------------------------- beacon
    # A caged amber safety beacon on the aft deck. The works cameras all look
    # straight down, so a forward-facing headlamp shows the camera the SIDE of
    # its can: measured, the front lamp reaches only 81 at works_top and 78 at
    # the site register, where it is half a pixel wide. A machine working a dark
    # bore carries a beacon, it faces up, and it is the one element that gives
    # the rover a third value at 19 px/cell instead of one taupe.
    #
    # It is sunk in a can and shot through a cage, not stuck on a lid: MTX-45's
    # named fake is "a bright disk on a surface", which is what cycle 78's
    # reviewer graded the bare vent cap as.
    beacon_x, beacon_y = -0.72, 0.255
    if lod <= 1:
        beacon_post = add_box(
            "BeaconPost", (beacon_x, beacon_y, DECK_Z1 + 0.048),
            (0.026, 0.026, 0.050), steel, collection, bevel=0.0,
        )
        machined(beacon_post)
    beacon_can = add_cylinder(
        "BeaconCan", (beacon_x, beacon_y, DECK_Z1 + 0.128), 0.095, 0.062,
        steel, collection, vertices=cyl_v, bevel=0.0, rot=(0, 0, 0),
    )
    machined(beacon_can)
    add_cylinder(
        "BeaconLens", (beacon_x, beacon_y, DECK_Z1 + 0.172), 0.076, 0.046,
        lamp_mat, collection, vertices=cyl_v, bevel=0.0, rot=(0, 0, 0),
    )
    if lod == 0:
        for ci in range(4):
            ang = math.pi * 0.25 + ci * math.pi * 0.5
            post = add_box(
                f"BeaconCage_{ci}",
                (beacon_x + math.cos(ang) * 0.086, beacon_y + math.sin(ang) * 0.086, DECK_Z1 + 0.186),
                (0.013, 0.013, 0.058), steel, collection, bevel=0.0, rot=(0.0, 0.0, ang),
            )
            machined(post)
        for bi, brot in enumerate((0.0, math.pi * 0.5)):
            bar = add_box(
                f"BeaconCageBar_{bi}", (beacon_x, beacon_y, DECK_Z1 + 0.238),
                (0.100, 0.011, 0.009), steel, collection, bevel=0.0, rot=(0.0, 0.0, brot),
            )
            machined(bar)

    # ----------------------------------------------------------- scar plate
    # C78's flank carried a blank near-white rectangle at sum 228, the second
    # brightest surface on the vehicle, with no soot, no bolts, no bevel and no
    # gas-breach damage. This plate is sooted steel with a chamfer, a bolt
    # course, a heat blister, and a breach punched right through it.
    # The plate is a CANTED rock guard standing above the starboard belt, not a
    # sheet on the hull side. Every top-down works camera sees a vertical flank
    # at zero area, and a plate hung at the deck edge sits behind the track from
    # any oblique - which is how cycle 78's edge reviewer ended up grading the
    # aft tailgate as the scar plate. Leaning it out over the belt gives it
    # projected area from directly above AND an unoccluded face at works_edge.
    # A rock guard sloping DOWN and OUTBOARD over the starboard belt, at 45
    # degrees. Leaning it the other way turned its face away from the works key
    # (which rakes in from -X -Y) and the plate rendered black; sloping it out
    # gives N.L = 0.62 and about ten pixels of plan area at works_top, while
    # still presenting its whole face at the flank camera.
    scar = add_folded_sheet(
        "scar_plate",
        (-0.30, -0.360, 0.660), (0.20, -0.360, 0.660),
        (0.20, -0.520, 0.480), (-0.30, -0.520, 0.480),
        0.026, scar_mat, collection, 0.006 if lod == 0 else 0.0,
    )
    scar["sf_keep"] = True
    if lod <= 1:
        cut_cylinder_checked(
            scar, "ScarBreach", (-0.02, -0.440, 0.570),
            0.064, 0.30, rot=(math.pi / 2, 0, 0), vertices=10 if lod == 0 else 8,
        )
        recalc_mesh(scar)
    if lod == 0:
        for ti in range(6):
            ang = ti * math.pi / 3.0 + 0.35
            petal = add_box(
                f"ScarBreachPetal_{ti}",
                (
                    -0.02 + math.cos(ang) * 0.078,
                    -0.440 - math.sin(ang) * 0.078 * 0.664 - 0.012,
                    0.570 - math.sin(ang) * 0.078 * 0.747 + 0.012,
                ),
                (0.021, 0.012, 0.012), steel, collection, bevel=0.0,
                rot=(0.0, -ang, 0.0),
            )
            petal["sf_v0"], petal["sf_v1"] = V_STEEL_BRIGHT
            petal["sf_body"] = True
    if lod == 0:
        blister = add_box(
            "ScarBlister", (0.10, -0.482, 0.532),
            (0.052, 0.030, 0.014), scar_mat, collection, bevel=0.005, rot=(-0.79, 0.0, 0.0),
        )
        blister["sf_body"] = True
        for i, (sx, st) in enumerate((
            (-0.26, 0.06), (-0.26, 0.94), (0.16, 0.06), (0.16, 0.94), (-0.05, 0.06), (0.06, 0.94),
        )):
            add_hex_bolt(
                f"ScarBolt_{i}",
                (sx, -0.360 - 0.160 * st - 0.012, 0.660 - 0.180 * st + 0.013),
                steel, collection, bevel=0.0,
            )

    # --------------------------------------------------------------- tracks
    n_pads = N_TREAD_PADS if lod == 0 else 0
    n_st_xy = 7 if lod == 0 else (5 if lod == 1 else 3)
    n_arc_xy = n_st_xy
    for sign, tname in ((1.0, "track_L"), (-1.0, "track_R")):
        yc = sign * TRACK_YC
        belt = add_stadium_xy_belt(
            f"TrackBelt_{tname}", TRACK_XC, yc, 0.0, TRACK_TOP_Z,
            TRACK_HL, TRACK_R_PLAN, TRACK_BELT_THICK, track_mat, collection,
            bevel_body, n_st_xy, n_arc_xy,
        )
        set_bevel(belt, segments=1)
        band(belt, V_TRACK_RUBBER)
        belt["sf_body"] = True
        crown = add_stadium_xy_solid(
            f"TrackCrown_{tname}", TRACK_XC, yc, TRACK_TOP_Z - 0.12, TRACK_TOP_Z,
            TRACK_HL, TRACK_R_PLAN - TRACK_BELT_THICK + 0.010, track_mat, collection,
            bevel_body, n_st_xy, n_arc_xy,
        )
        set_bevel(crown, segments=1)
        band(crown, V_TRACK_RUBBER)
        crown["sf_body"] = True
        if lod == 0:
            cleats = add_track_cleats(
                tname, TRACK_XC, yc, TRACK_HL, TRACK_R_PLAN, TRACK_BELT_THICK,
                TRACK_TOP_Z, n_pads, track_mat, collection, 0.0,
            )
            for pad in cleats:
                pad["sf_track_join"] = tname
        else:
            # UV-scroll hook is the belt itself once the grousers are gone. At
            # 19 px/cell 18 cleats alias into a dashed smear, which is how a
            # solid rubber wall becomes a paperclip.
            belt["sf_track_join"] = tname
            crown["sf_track_join"] = tname
        add_track_outer_lip(
            f"TrackRail_{tname}", TRACK_XC, yc, TRACK_HL, TRACK_R_PLAN,
            sign, TRACK_TOP_Z, track_mat, collection, lod,
        )
        # One driven sprocket aft, one idler forward: the two ends stop being
        # identical mirrored loaves without squaring off the stadium.
        sprocket = add_cylinder(
            f"SprocketAft_{tname}", (TRACK_XC - TRACK_HL, yc, 0.16),
            0.128, 0.16, steel, collection, vertices=cyl_v, bevel=0.0, rot=(math.pi / 2, 0, 0),
        )
        machined(sprocket)
        sprocket["sf_body"] = True
        hub_aft = add_cylinder(
            f"SprocketHub_{tname}", (TRACK_XC - TRACK_HL, yc, TRACK_TOP_Z - 0.03),
            0.072, 0.072, steel, collection, vertices=cyl_v, bevel=0.0, rot=(0, 0, 0),
        )
        machined(hub_aft)
        hub_aft["sf_body"] = True
        if lod == 0:
            for ti in range(7):
                ang = 2.0 * math.pi * ti / 7.0
                tooth = add_box(
                    f"SprocketTooth_{tname}_{ti}",
                    (
                        TRACK_XC - TRACK_HL + math.cos(ang) * 0.098,
                        yc + math.sin(ang) * 0.098,
                        TRACK_TOP_Z + 0.004,
                    ),
                    (0.030, 0.014, 0.014), steel, collection, bevel=0.0,
                    rot=(0.0, 0.0, ang),
                )
                machined(tooth)
                tooth["sf_body"] = True
        idler = add_cylinder(
            f"IdlerFore_{tname}", (TRACK_XC + TRACK_HL, yc, 0.14),
            0.096, 0.15, steel, collection, vertices=cyl_v, bevel=0.0, rot=(math.pi / 2, 0, 0),
        )
        machined(idler)
        idler["sf_body"] = True
        if lod <= 1:
            tensioner = add_box(
                f"IdlerTensioner_{tname}", (TRACK_XC + TRACK_HL - 0.07, yc, TRACK_TOP_Z - 0.05),
                (0.070, 0.036, 0.030), steel, collection, bevel=0.0,
            )
            machined(tensioner)
            tensioner["sf_body"] = True
            rocker = add_box(
                f"Rocker_{tname}", (TRACK_XC, sign * 0.50, 0.10),
                (0.52, 0.032, 0.052), steel, collection, bevel=0.0,
            )
            machined(rocker)
            rocker["sf_body"] = True
        if lod == 0:
            for ix, xw in enumerate((-0.50, -0.06)):
                bogie = add_box(
                    f"Bogie_{tname}_{ix}", (xw, sign * 0.54, 0.15),
                    (0.062, 0.062, 0.070), steel, collection, bevel=0.0,
                )
                machined(bogie)
                bogie["sf_body"] = True

    # ----------------------------------------------------------------- boom
    boom_pivot = add_empty("boom_pivot", PIVOT, collection, root, size=0.08)
    px, py, pz = PIVOT
    tx, ty, tz = BIT_TIP
    yoke_l = add_box("BoomYokeP", (px - 0.06, py + 0.15, pz), (0.09, 0.036, 0.11), steel, collection, bevel=bevel_body)
    yoke_r = add_box("BoomYokeS", (px - 0.06, py - 0.15, pz), (0.09, 0.036, 0.11), steel, collection, bevel=bevel_body)
    pin = add_cylinder("BoomPin", (px, py, pz), 0.044, 0.32, steel, collection, vertices=8, bevel=0.0, rot=(math.pi / 2, 0, 0))
    for part in (yoke_l, yoke_r, pin):
        machined(part)
        part["sf_boom"] = True
    if lod == 0:
        knuckle_scale = (0.10, 0.22, 0.16)
        knuckle_mat = scar_mat
        boom_dims = (0.18, 0.11, 0.16, 0.12)
        boom_mat = scar_mat
    else:
        # Preserve the exact Cycle-80 site LOD construction and atlas bind.
        knuckle_scale = (0.05, 0.18, 0.13)
        knuckle_mat = chevron
        boom_dims = (0.38, 0.26, 0.32, 0.22)
        boom_mat = chevron
    knuckle = add_box("BoomKnuckle", (px - 0.02, py, pz), knuckle_scale, knuckle_mat, collection, bevel=bevel_body)
    knuckle["sf_boom"] = True
    boom = add_boxed_beam(
        "BoomArm", px + 0.02, tx - 0.10, py, pz,
        *boom_dims,
        boom_mat, collection, bevel_body, stations=3,
    )
    set_bevel(boom, segments=1)
    boom["sf_boom"] = True

    # The load spine: a segmented, tapered steel rib with end returns into the
    # arm, in machined-band steel. Cycle 78 shipped one dead-straight pipe at 4x
    # the arm's brightness, with no taper and no end return - a decal doing a
    # structural job. This one reads by its shadow and its silhouette bump.
    spine_x0, spine_x1 = px + 0.06, tx - 0.20
    # One load rail at every LOD. The former five bright LOD0 segments made a
    # barcode on top of the chevron plank instead of a load path.
    rail = add_box(
        "BoomSpine_0",
        (0.5 * (spine_x0 + spine_x1), py, pz + 0.175),
        (0.5 * (spine_x1 - spine_x0), 0.044, 0.026),
        steel, collection, bevel=0.0,
    )
    machined(rail)
    rail["sf_boom"] = True
    for tag, cx, hz in (("Root", spine_x0 - 0.014, 0.062), ("Tip", spine_x1 + 0.012, 0.046)):
        ret = add_box(
            f"BoomSpineReturn{tag}", (cx, py, pz + 0.185 - hz),
            (0.020, 0.046, hz), steel, collection, bevel=0.0,
        )
        machined(ret)
        ret["sf_boom"] = True
    if lod == 0:
        web = add_folded_sheet(
            "BoomWebS",
            (px, py - 0.11, pz - 0.05), (tx - 0.16, py - 0.050, pz - 0.022),
            (tx - 0.16, py - 0.050, pz + 0.040), (px, py - 0.11, pz + 0.07),
            0.008, scar_mat, collection, 0.002,
        )
        web["sf_boom"] = True
        web_p = add_folded_sheet(
            "BoomWebP",
            (px, py + 0.11, pz - 0.05), (tx - 0.16, py + 0.050, pz - 0.022),
            (tx - 0.16, py + 0.050, pz + 0.040), (px, py + 0.11, pz + 0.07),
            0.008, scar_mat, collection, 0.002,
        )
        web_p["sf_boom"] = True
        ram = add_service_pipe("BoomRam", (px, py, pz - 0.06), (tx - 0.22, py, pz - 0.02), steel, collection, radius=0.026)
        machined(ram)
        ram["sf_boom"] = True
    add_faceted_bit("Bit", BIT_TIP, scar_mat, drum_mat, bit_mat, collection, lod, 0.002 if lod == 0 else 0.0)
    add_empty("bit_tip", BIT_TIP, collection, boom_pivot, size=0.05)

    # ------------------------------------------------------------- tailgate
    lid = add_folded_sheet(
        "hopper_lid",
        (BODY_AFT_X - 0.010, -WELL_HY, DECK_Z1 - 0.02),
        (BODY_AFT_X - 0.010, WELL_HY, DECK_Z1 - 0.02),
        (BODY_AFT_X - 0.010, WELL_HY, 0.16),
        (BODY_AFT_X - 0.010, -WELL_HY, 0.16),
        0.014, steel, collection, bevel_plate,
    )
    band(lid, V_STEEL_PLATE)
    lid["sf_keep"] = True
    if lod == 0:
        for ix, lz in enumerate((0.21, 0.31, 0.41)):
            rib = add_folded_sheet(
                f"LidRib_{ix}",
                (BODY_AFT_X - 0.026, -WELL_HY + 0.03, lz),
                (BODY_AFT_X - 0.026, WELL_HY - 0.03, lz),
                (BODY_AFT_X - 0.026, WELL_HY - 0.03, lz + 0.026),
                (BODY_AFT_X - 0.026, -WELL_HY + 0.03, lz + 0.026),
                0.012, steel, collection, 0.002,
            )
            machined(rib)
    if lod == 0:
        for ix, (ly, lz) in enumerate(((-WELL_HY + 0.05, 0.17), (WELL_HY - 0.05, 0.17), (0.0, 0.45))):
            add_hex_bolt(f"LidBolt_{ix}", (BODY_AFT_X - 0.032, ly, lz), steel, collection, bevel=0.0)

    for stage in range(5):
        h = 0.035 + stage * 0.03
        fill = add_box(
            f"hopper_fill_{stage}",
            (WELL_CX, 0.0, WELL_FLOOR_Z + 0.02 + h * 0.5),
            (WELL_HX - 0.04 - stage * 0.012, WELL_HY - 0.04 - stage * 0.010, h * 0.5),
            rubble, collection, bevel=0.0,
        )
        fill["sf_keep"] = True
        fill.hide_render = True

    add_empty("lamp_socket", (BODY_FORE_X + 0.061, 0.0, DECK_Z1 + 0.145), collection, root, size=0.05)
    add_empty("vent_stack", (CAB_CX - 0.15, CAB_HY - 0.09, ROOF_Z1 + 0.04), collection, root, size=0.05)

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

    # Cycle 80: never COLLAPSE-decimate. That is MTX-48 — it closes the hopper
    # and the roof pane and smears glass into hull. LOD1/2 are authored
    # reductions; over-budget is a build failure, not a modifier.
    if lod > 0:
        authored = sum(
            count_tris(obj) for obj in collection.all_objects
            if obj.type == "MESH"
        )
        if authored > TRI_BUDGET[lod]:
            raise RuntimeError(
                f"lod{lod} authored {authored} tris over budget {TRI_BUDGET[lod]}; "
                f"drop micro, do not decimate"
            )

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
    # The key casts again. Cycle 78's edge reviewer measured the pad immediately
    # above the track at 163 against a far-corner 172 and called the rover
    # "decaled onto the pad rather than standing on it"; its site reviewer found
    # no contact shadow anywhere in the frame. A 21-degree raking sun with
    # shadows on is also what makes the mine's benches, berm and muck read as
    # form from straight above.
    #
    # TrackFill drops from 5.5 to 1.9. It was lifting the belts, and cycle 79
    # needs them to be the darkest mass on the machine.
    for name, loc, energy, color, angle in (
        ("Key", (-1.15 * reach, -0.78 * reach, 0.54 * reach), 7.2, (1.00, 0.863, 0.737), 18.0),
        ("Rim", (0.22 * reach, 1.45 * reach, 0.30 * reach), 2.20, (0.616, 0.722, 0.941), 25.0),
        ("Fill", (1.12 * reach, 0.46 * reach, 0.50 * reach), 2.40, (0.847, 0.765, 0.659), 30.0),
        ("TrackFill", (0.30 * reach, -1.60 * reach, 0.18 * reach), 1.90, (0.90, 0.82, 0.72), 48.0),
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
        if name in {"Key", "TrackFill"}:
            data.use_shadow = True
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
    if op == ">":
        return bool(value > floor + 1e-9)
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

    def separation(tmask):
        if tmask.sum() < 4 or pad_like.sum() < 64:
            return 0.0
        return abs(float(np.median(luma255[tmask]) - np.median(luma255[pad_like])))

    return (
        contrast(port_t, port_out), contrast(stbd_t, stbd_out),
        separation(port_t), separation(stbd_t),
    )


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
        spec = PLANFORM_FLOORS.get(key) or SITE_FLOORS.get(key)
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

    def role_median(role):
        pixels = beauty_luma[roles[role]]
        return float(np.median(pixels) * 255.0) if pixels.size else 0.0

    role_luma = {
        role: role_median(role)
        for role in ("track", "steel", "glass", "rubble", "scar", "bit", "drum")
    }
    travel_along_x = True
    if textured.get("bbox"):
        x0, y0, x1, y1 = textured["bbox"]
        travel_along_x = (x1 - x0) >= (y1 - y0) * 0.85

    c3 = {}
    port_c, stbd_c, port_sep, stbd_sep = track_contrast_levels(
        beauty_luma, obj_sil, roles["track"], travel_along_x
    )
    c3["TRACK_CONTRAST_PORT"] = _row("TRACK_CONTRAST_PORT", round(port_c, 4))
    c3["TRACK_CONTRAST_STARBOARD"] = _row("TRACK_CONTRAST_STARBOARD", round(stbd_c, 4))
    # TRACK_CONTRAST_* is signed and wants the belts BRIGHTER than the pad; it
    # already measured -26.99 / -23.78 in cycle 78 and cycle 79 drives it
    # further negative on purpose, because the belts are now the darkest mass.
    # The row is left exactly as cycle 3 wrote it. These two measure what it was
    # protecting: the belts must separate from the pad, in either direction.
    c3["TRACK_SEPARATION_PORT"] = _row("TRACK_SEPARATION_PORT", round(port_sep, 4))
    c3["TRACK_SEPARATION_STARBOARD"] = _row("TRACK_SEPARATION_STARBOARD", round(stbd_sep, 4))

    livery_pix = top_arr[..., :3][roles["livery"]]
    if len(livery_pix):
        _h, s, _v = rgb_to_hsv_np(livery_pix[:, None, :])
        s = s.reshape(-1)
        sat_frac = float((s >= 0.70).mean())
    else:
        sat_frac = 0.0
    c3["LIVERY_SAT_RENDERED"] = _row("LIVERY_SAT_RENDERED", round(sat_frac, 4))

    bit_mask = roles["bit"] | roles["drum"]
    cutter_span_px = 0.0
    if bit_mask.any():
        _bit_y, bit_x = np.nonzero(bit_mask)
        cutter_span_px = float(int(bit_x.max()) - int(bit_x.min()) + 1)
    c3["CUTTER_SPAN_PX"] = _row("CUTTER_SPAN_PX", cutter_span_px)
    c3["GLASS_LUMA"] = _row("GLASS_LUMA", round(role_luma["glass"], 4))
    c3["HOPPER_LUMA"] = _row("HOPPER_LUMA", round(role_luma["rubble"], 4))
    c3["HOPPER_TRACK_DELTA"] = _row(
        "HOPPER_TRACK_DELTA", round(role_luma["rubble"] - role_luma["track"], 4)
    )
    c3["DECK_HOPPER_DELTA"] = _row(
        "DECK_HOPPER_DELTA", round(role_luma["steel"] - role_luma["rubble"], 4)
    )
    c3["SCAR_TRACK_DELTA"] = _row(
        "SCAR_TRACK_DELTA", round(role_luma["scar"] - role_luma["track"], 4)
    )

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
        "roleLumaMedians255": {key: round(value, 4) for key, value in role_luma.items()},
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
    for name in ("works_edge.png", "works_edge_flank.png"):
        src = still_dir / name
        if src.exists():
            frame, _, _, img = load_image_array(src)
            native = crop_object_native(frame, pad=12)
            save_rgba_png(review_dir / name.replace(".png", "_1to1.png"), native, native.shape[1], native.shape[0])
            bpy.data.images.remove(img)

    # site_report writes review_1to1/works_site_1to1.png: a fixed 38 px window
    # on the rover's site-mask centroid, so the crop stays the same size cycle
    # to cycle even though the surround is now a lit mine.
    site = site_report(still_dir, review_dir)
    report["site"] = site
    report["sitePass"] = bool(site.get("pass"))
    print(f"  SITE_GATE {site.get('pass')}")

    # Beside-flight is cut from the SITE view. Cycle 78 put the works_top crop
    # beside the flight ship, so the question the comparison exists to answer -
    # does the mine read as the same game at the site register - was never asked
    # of the site camera. Both panels are native resolution, no resampling.
    sheet = np.zeros((1080, 1920, 4), dtype=np.float32)
    sheet[..., 3] = 1.0
    panel = 320
    site_path = still_dir / "works_site.png"
    left_label = f"ASSETS/WORKS/ROVER/EVIDENCE/CYCLE_{CYCLE:03d}/WORKS_SITE.PNG 1TO1"
    if site_path.exists() and site.get("roverBboxPx"):
        site_arr, _sw, _sh, simg = load_image_array(site_path)
        lcrop, _ = crop_1to1(site_arr, site["roverBboxPx"], size=panel)
        bpy.data.images.remove(simg)
    else:
        lcrop = crop
        left_label = f"ASSETS/WORKS/ROVER/EVIDENCE/CYCLE_{CYCLE:03d}/WORKS_TOP_1TO1.PNG"
        print("WARN beside-flight fell back to the top crop; works_site was unusable")
    ch, cw = lcrop.shape[:2]
    y_off = (1080 - ch) // 2
    x_left = 160
    x_right = 1920 - 160 - panel
    sheet[y_off:y_off + ch, x_left:x_left + cw] = lcrop
    if FLIGHT_STILL.exists():
        flight, fw, fh, _fimg = load_image_array(FLIGHT_STILL)
        fcrop, _ = crop_1to1(flight, None, size=panel)
        sheet[y_off:y_off + fcrop.shape[0], x_right:x_right + fcrop.shape[1]] = fcrop
        bpy.data.images.remove(_fimg)
    else:
        raise RuntimeError(f"beside-flight still missing: {FLIGHT_STILL}")
    blit_text(sheet, left_label, 40, 40, (1, 0.85, 0.3), 2)
    blit_text(sheet, ".DEVSHOTS/ASTEROID-WORKS/04-FLIGHT-RELAY-COURIER.PNG", 1060, 40, (0.7, 0.85, 1.0), 2)
    save_rgba_png(still_dir / "works_beside_flight.png", sheet, 1920, 1080)

    bpy.data.images.remove(mask_img)
    bpy.data.images.remove(clay_img)
    bpy.data.images.remove(top_img)
    report["pass"] = bool(tex_ok and clay_ok and c3_ok and site.get("pass"))
    out = still_dir / "planform_report.json"
    out.write_bytes((json.dumps(report, indent=2) + "\n").encode("utf-8"))
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


def _value_noise(shape, cells, seed):
    """Bilinear, smoothstep-interpolated value noise from the builder's own hash.

    The first attempt at the mine floor sampled `h01_arr(ix // 11, iy // 11)`
    directly, which is nearest-neighbour: the frame came back as a quilt of
    hard rectangular blocks. Deterministic, but it read as tiling, not rock.
    """
    ny, nx = shape
    gx = np.linspace(0.0, float(cells), nx, endpoint=False)
    gy = np.linspace(0.0, float(cells) * ny / float(nx), ny, endpoint=False)
    xx, yy = np.meshgrid(gx, gy)
    x0 = np.floor(xx).astype(np.uint32)
    y0 = np.floor(yy).astype(np.uint32)
    fx = (xx - x0).astype(np.float32)
    fy = (yy - y0).astype(np.float32)
    sx = fx * fx * (3.0 - 2.0 * fx)
    sy = fy * fy * (3.0 - 2.0 * fy)
    v00 = h01_arr(x0, y0, seed)
    v10 = h01_arr(x0 + np.uint32(1), y0, seed)
    v01 = h01_arr(x0, y0 + np.uint32(1), seed)
    v11 = h01_arr(x0 + np.uint32(1), y0 + np.uint32(1), seed)
    a = v00 + (v10 - v00) * sx
    b = v01 + (v11 - v01) * sx
    return (a + (b - a) * sy).astype(np.float32)


def _smoothstep(t):
    t = np.clip(t, 0.0, 1.0)
    return t * t * (3.0 - 2.0 * t)


def _rock_material(name, rgb, rough, metal=0.02):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = next(n for n in mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    bsdf.inputs["Base Color"].default_value = (*rgb, 1)
    bsdf.inputs["Roughness"].default_value = rough
    bsdf.inputs["Metallic"].default_value = metal
    return mat


def build_site_set():
    """A legible mine for `works_site`, built at render time only.

    Cycle 78's site still was 99.98% of a 1920x1080 frame at luminance <= 12,
    with a 22 px rover in it and a maximum of 9 anywhere else: no rock face, no
    bench, no muck, no berm, no contact shadow, no horizon. Its reviewer's
    verdict was that no site verdict was possible from it, this cycle or the
    next. The site camera dollies to 223 wu and frames 222 x 125 wu, so the
    2.4 wu works pad is invisible at that register; the mine has to be built.

    Everything here is created AFTER `export_lod`, from the imported GLB scene,
    so it cannot reach a GLB hash. Variation comes from `h01_arr`, never from
    `random`, so the still is reproducible.
    """
    made = []
    host = _rock_material("SiteHostRock", (0.060, 0.048, 0.037), 0.90)
    face = _rock_material("SiteBenchFace", (0.030, 0.024, 0.019), 0.84)
    muck = _rock_material("SiteMuck", (0.092, 0.071, 0.050), 0.94)

    # ------------------------------------------------------------------ floor
    nx, ny = 340, 224
    span_x, span_y = 320.0, 205.0
    gx = (np.arange(nx, dtype=np.float32) / (nx - 1.0) - 0.5) * span_x
    gy = (np.arange(ny, dtype=np.float32) / (ny - 1.0) - 0.5) * span_y
    xx, yy = np.meshgrid(gx, gy)

    zz = (
        (_value_noise((ny, nx), 5, 3) - 0.5) * 5.2
        + (_value_noise((ny, nx), 11, 17) - 0.5) * 2.1
        + (_value_noise((ny, nx), 27, 41) - 0.5) * 0.85
        + (_value_noise((ny, nx), 61, 73) - 0.5) * 0.30
    )

    # Benches. The terrace boundary is dragged about by its own noise so the
    # toe of each face is ragged rock, not the dead-straight box wall the first
    # attempt drew across the frame.
    # The toe of each bench wanders +/- 22 wu so the step is a rock face, not a
    # ruled line across the frame, and the rise lands over about three grid
    # cells: any steeper and the terrace stairsteps on the grid, any shallower
    # and it renders as a pale contour ribbon.
    ragged = (
        (_value_noise((ny, nx), 4, 101) - 0.5) * 30.0
        + (_value_noise((ny, nx), 13, 103) - 0.5) * 11.0
    )
    edge = yy + ragged
    for y_toe, rise, ramp in ((14.0, 7.4, 3.0), (34.0, 8.6, 3.2), (56.0, 9.4, 3.4)):
        zz += rise * _smoothstep((edge - y_toe) / ramp)
    # Spoil berm along the low side, and a graded haul road between them.
    berm_line = yy + 34.0 + (_value_noise((ny, nx), 7, 131) - 0.5) * 9.0
    zz += np.exp(-(berm_line ** 2) / (2.0 * 5.4 ** 2)) * (3.1 + 1.6 * _value_noise((ny, nx), 15, 149))
    road = np.exp(-(((yy - 1.5) + (_value_noise((ny, nx), 6, 163) - 0.5) * 6.0) ** 2) / (2.0 * 6.4 ** 2))
    zz = zz * (1.0 - 0.80 * road) - road * 0.35
    # Muck and spoil are raised out of the floor itself, so they shade like
    # heaped rock and sit in the ground rather than on it.
    for mx, my, rx, ry, hgt in (
        (-14.0, -7.5, 6.0, 4.4, 2.9), (10.5, 9.0, 4.2, 3.4, 2.0),
        (26.0, -12.0, 8.4, 5.6, 3.8), (-35.0, 14.0, 10.2, 6.8, 4.6),
        (52.0, -5.0, 7.4, 5.2, 3.2), (-62.0, -17.0, 11.0, 7.4, 5.1),
        (76.0, 13.0, 8.6, 6.0, 3.9), (-88.0, 6.0, 7.8, 5.4, 3.4),
        (100.0, -15.0, 9.4, 6.4, 4.2), (-108.0, -7.0, 8.0, 5.6, 3.6),
    ):
        bump = np.exp(-(((xx - mx) ** 2) / (2.0 * rx ** 2) + ((yy - my) ** 2) / (2.0 * ry ** 2)))
        zz += hgt * bump ** 1.35

    # The rover stands on a graded working floor, in contact with it.
    workfloor = np.exp(-((xx ** 2) / (2.0 * 11.0 ** 2) + (yy ** 2) / (2.0 * 7.5 ** 2)))
    zz = zz * (1.0 - 0.97 * workfloor) - 0.02

    verts = [(float(xx[j, i]), float(yy[j, i]), float(zz[j, i])) for j in range(ny) for i in range(nx)]
    faces = []
    for j in range(ny - 1):
        for i in range(nx - 1):
            a = j * nx + i
            faces.append((a, a + 1, a + nx + 1, a + nx))
    mesh = bpy.data.meshes.new("SiteFloor_Mesh")
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    floor = bpy.data.objects.new("SiteFloor", mesh)
    bpy.context.scene.collection.objects.link(floor)
    floor.data.materials.append(host)
    floor.data.materials.append(face)
    # Steep faces get the darker rock, so a bench reads as a value step from
    # straight above rather than relying on the key alone.
    for poly in floor.data.polygons:
        poly.use_smooth = False
        if poly.normal.z < 0.80:
            poly.material_index = 1
    made.append(floor)

    # ------------------------------------------------------- loose rock
    for ix_b in range(52):
        u = float(h01_arr(np.uint32(ix_b), np.uint32(7), 91))
        v = float(h01_arr(np.uint32(ix_b), np.uint32(19), 113))
        w = float(h01_arr(np.uint32(ix_b), np.uint32(29), 137))
        q = float(h01_arr(np.uint32(ix_b), np.uint32(37), 157))
        if ix_b < 8:
            # A close group, so the site crop around the rover has neighbours
            # and the machine is read against something its own size.
            bx = (u - 0.5) * 34.0
            by = (v - 0.5) * 22.0
            scale = 0.7 + w * 1.6
        else:
            bx = (u - 0.5) * 236.0
            by = (v - 0.5) * 132.0
            scale = 1.3 + w * 6.4
        if abs(bx) < 2.2 and abs(by) < 2.2:
            continue
        bpy.ops.mesh.primitive_ico_sphere_add(
            subdivisions=1, radius=scale, location=(bx, by, scale * 0.40 - 0.45),
        )
        rock = bpy.context.object
        rock.name = f"SiteRock_{ix_b:02d}"
        # A bare icosphere is a regular polyhedron and reads as folded paper.
        # Push every vertex out by its own hash so the block is irregular.
        for vi, vert in enumerate(rock.data.vertices):
            k = 0.68 + 0.62 * float(h01_arr(np.uint32(ix_b * 97 + vi), np.uint32(vi), 181))
            vert.co *= k
        rock.data.update()
        rock.scale = (1.0, 0.70 + u * 0.52, 0.56 + v * 0.40)
        rock.rotation_euler = (q * 0.5, v * 0.4, u * 6.28318)
        rock.data.materials.clear()
        rock.data.materials.append(muck if w > 0.72 else (host if w > 0.36 else face))
        for poly in rock.data.polygons:
            poly.use_smooth = False
        made.append(rock)

    for obj in made:
        obj.hide_render = True
        obj.hide_select = True
    return made


def _circular_mean_deg(values):
    if len(values) == 0:
        return 0.0
    rad = np.radians(np.asarray(values, dtype=np.float64))
    return float((math.degrees(math.atan2(np.sin(rad).mean(), np.cos(rad).mean()))) % 360.0)


def _circular_delta_deg(a, b):
    d = abs(float(a) - float(b)) % 360.0
    return d if d <= 180.0 else 360.0 - d


def site_buckets(rgb, lit, accent):
    """The four cycle-79 site numbers, on one explicit definition.

    Buckets are taken relative to the maximum luminance of the lit rover, which
    is the definition that reproduces cycle 78's reviewer exactly: on their
    crop it returns 484 lit px, min/median/max 15.0 / 53.2 / 124.4, max/median
    2.34 and dark 0.8% against their reported 484, 15.0 / 53.2 / 124.4, 2.34
    and 1.0%. `accent` is carved out of the bucket counts and reported on its
    own, which is why light + accent is one gate and not two.
    """
    lum = luma_of(rgb) * 255.0
    n = int(lit.sum())
    if n < 40:
        return None
    body = lit & (~accent)
    l_max = float(lum[lit].max())
    l_med = float(np.median(lum[lit]))
    l_min = float(lum[lit].min())
    p99 = float(np.percentile(lum[lit], 99))
    dark = float((lum[body] < 0.15 * l_max).sum()) / n
    mid = float(((lum[body] >= 0.15 * l_max) & (lum[body] < 0.35 * l_max)).sum()) / n
    light = float((lum[body] >= 0.35 * l_max).sum()) / n
    acc = float(accent.sum()) / n
    hue, sat, _val = rgb_to_hsv_np(rgb[..., :3])
    body_hue = _circular_mean_deg(hue[body])
    accent_hue = _circular_mean_deg(hue[accent]) if accent.sum() else 0.0
    return {
        "litPixels": n,
        "accentPixels": int(accent.sum()),
        "lumMin": round(l_min, 2),
        "lumMedian": round(l_med, 2),
        "lumMax": round(l_max, 2),
        "lumP99": round(p99, 2),
        "dark": round(dark, 4),
        "mid": round(mid, 4),
        "light": round(light, 4),
        "accent": round(acc, 4),
        "lightPlusAccent": round(light + acc, 4),
        "maxOverMedian": round(l_max / max(l_med, 1e-6), 4),
        "bodyHue": round(body_hue, 3),
        "accentHue": round(accent_hue, 3),
        "hueSeparation": round(_circular_delta_deg(accent_hue, body_hue), 3),
        "meanSaturation": round(float(sat[lit].mean()), 4),
    }


def heuristic_accent(rgb, lit):
    """Accent without a role pass, so a cycle with no ID mask can be compared.
    Bright and saturated: sat >= 0.55 and luma >= 0.55 x max."""
    lum = luma_of(rgb) * 255.0
    if not lit.any():
        return np.zeros_like(lit)
    l_max = float(lum[lit].max())
    _h, sat, _v = rgb_to_hsv_np(rgb[..., :3])
    return lit & (sat >= 0.55) & (lum >= 0.55 * l_max)


def site_report(still_dir: Path, review_dir: Path):
    site_path = still_dir / "works_site.png"
    mask_path = still_dir / "works_site_mask.png"
    if not site_path.exists() or not mask_path.exists():
        return {"rows": {}, "pass": False, "note": "works_site or works_site_mask missing"}
    beauty, bw, bh, bimg = load_image_array(site_path)
    mask, _mw, _mh, mimg = load_image_array(mask_path)
    lit_full = luma_of(mask) > 0.02
    if int(lit_full.sum()) < 40:
        bpy.data.images.remove(bimg)
        bpy.data.images.remove(mimg)
        return {"rows": {}, "pass": False, "note": "site mask found no rover"}
    ys, xs = np.nonzero(lit_full)
    cx = int(round(0.5 * (int(xs.min()) + int(xs.max()))))
    cy = int(round(0.5 * (int(ys.min()) + int(ys.max()))))
    size = SITE_CROP_PX
    x0 = max(0, min(bw - size, cx - size // 2))
    y0 = max(0, min(bh - size, cy - size // 2))
    crop = beauty[y0:y0 + size, x0:x0 + size].copy()
    mcrop = mask[y0:y0 + size, x0:x0 + size].copy()
    lit = luma_of(mcrop) > 0.02
    roles = role_masks_from_id(mcrop, lit)
    accent = roles["livery"]
    measured = site_buckets(crop, lit, accent)
    heuristic = site_buckets(crop, lit, heuristic_accent(crop, lit))

    rows = {}
    if measured is None:
        rows = {key: _row(key, 0.0, ok=False) for key in SITE_FLOORS}
    else:
        rows["SITE_DARK_BUCKET"] = _row("SITE_DARK_BUCKET", measured["dark"])
        rows["SITE_LIGHT_PLUS_ACCENT"] = _row("SITE_LIGHT_PLUS_ACCENT", measured["lightPlusAccent"])
        rows["SITE_MAX_OVER_MEDIAN"] = _row("SITE_MAX_OVER_MEDIAN", measured["maxOverMedian"])
        if measured["accentPixels"] >= SITE_ACCENT_MIN_PX:
            rows["SITE_ACCENT_HUE_SEPARATION"] = _row(
                "SITE_ACCENT_HUE_SEPARATION", measured["hueSeparation"]
            )
        else:
            # A hue median over a handful of pixels is noise, and a noisy median
            # is exactly how cycle 78's five accent pixels would have returned a
            # 10.9 degree "separation" its own reviewer said did not exist.
            rows["SITE_ACCENT_HUE_SEPARATION"] = {
                "value": measured["hueSeparation"],
                "floor": SITE_FLOORS["SITE_ACCENT_HUE_SEPARATION"][1],
                "op": ">",
                "pass": False,
                "note": (
                    f"only {measured['accentPixels']} accent px on the crop; "
                    f"{SITE_ACCENT_MIN_PX} required before a hue median is reported"
                ),
            }
        n_lit = max(1, int(lit.sum()))
        rows["SITE_TRACK_SHARE"] = _row(
            "SITE_TRACK_SHARE", float(int(roles["track"].sum())) / n_lit
        )
        rows["SITE_WELL_PIXELS"] = _row("SITE_WELL_PIXELS", float(int(roles["rubble"].sum())))
        rows["SITE_GLASS_PIXELS"] = _row("SITE_GLASS_PIXELS", float(int(roles["glass"].sum())))
    report = {
        "cropOrigin": [x0, y0],
        "cropSize": size,
        "roverBboxPx": [int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max())],
        "roverLitPixelsFullFrame": int(lit_full.sum()),
        "measured": measured,
        "heuristicAccent": heuristic,
        "rows": rows,
        "pass": bool(rows and all(r.get("pass") for r in rows.values())),
    }
    review_dir.mkdir(parents=True, exist_ok=True)
    save_rgba_png(review_dir / "works_site_1to1.png", crop, size, size)
    print("site_report (38 px crop, lit rover from works_site_mask):")
    for key, r in rows.items():
        flag = "PASS" if r["pass"] else "FAIL"
        print(f"  {key:30s} {float(r['value']):.4f} {r['op']} {_fmt_floor(r['floor'])}  {flag}")
    if measured:
        print(
            f"  lit={measured['litPixels']} accent={measured['accentPixels']} "
            f"lum min/med/max={measured['lumMin']}/{measured['lumMedian']}/{measured['lumMax']} "
            f"buckets dark/mid/light={measured['dark']:.3f}/{measured['mid']:.3f}/{measured['light']:.3f}"
        )
    bpy.data.images.remove(bimg)
    bpy.data.images.remove(mimg)
    return report


def render_stills_from_glb(glb_path: Path, still_dir: Path, registers=("close", "site")):
    """Render close (LOD0: top/edge) and/or site (LOD1) registers from one GLB.

    Cycle 79 shot every still, including works_site, from rover_lod0.glb. The
    packet puts LOD1 on the site camera. Passing registers=('site',) with the
    LOD1 file is the only legal site evidence path.
    """
    registers = tuple(registers)
    print(f"render registers={registers} from {glb_path.name}")
    reset_scene()
    bpy.ops.import_scene.gltf(filepath=str(glb_path))
    camera, pad = setup_mine_lights()
    for obj in bpy.data.objects:
        if obj.name.startswith("hopper_fill_"):
            obj.hide_render = True
            obj.hide_set(True)
    meshes = [
        obj for obj in bpy.data.objects
        if obj.type == "MESH" and obj.name != "MinePad" and not obj.name.startswith("hopper_fill_")
    ]
    site_objects = build_site_set() if "site" in registers else []
    still_dir.mkdir(parents=True, exist_ok=True)

    def show_site(visible):
        for obj in site_objects:
            obj.hide_render = not visible
        # The 2.4 wu works pad is smaller than the rover at the site register;
        # the mine floor stands in for it there.
        pad.hide_render = visible

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
                if obj in site_objects:
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

    paths = {}
    if "close" in registers:
        paths["works_top"] = snap("works_top.png", "works_top")
        paths["works_edge"] = snap("works_edge.png", "works_edge")
        # The material bill nominates works_edge as the scar plate's proving
        # view, but the plate sits on the -Y flank and the (1, 0) edge offset
        # projects that face at zero area — which is why cycle 78's reviewer
        # graded the aft tailgate as the scar plate. works_edge is unchanged so
        # the cycle-to-cycle diff still works; this is an ADDITIONAL still with
        # the object parked toward +X+Y, so the aft wall AND the starboard
        # flank, its scar plate and the starboard belt's outer lip all read.
        paths["works_edge_flank"] = snap("works_edge_flank.png", "works_edge", edge_dir=(0.62, 0.78))
        backups, _clay = override_clay(meshes)
        paths["works_top_clay"] = snap("works_top_clay.png", "works_top")
        restore_mats(meshes, backups)

    if "site" in registers:
        show_site(True)
        paths["works_site"] = snap("works_site.png", "works_site")
        show_site(False)
        clay_back, _sc = override_clay(meshes)
        paths["works_site_clay"] = snap("works_site_clay.png", "works_site")
        restore_mats(meshes, clay_back)

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
    if "close" in registers:
        paths["works_top_mask"] = snap("works_top_mask.png", "works_top", transparent=False, samples=1)
        paths["works_edge_mask"] = snap("works_edge_mask.png", "works_edge", transparent=False, samples=1)
        paths["works_edge_flank_mask"] = snap(
            "works_edge_flank_mask.png", "works_edge", transparent=False, edge_dir=(0.62, 0.78), samples=1
        )
    if "site" in registers:
        # The site beauty frame has a lit mine in it, so "everything above
        # luma 0.05 is the rover" stops being true. The site crop and every site
        # number are taken against this role pass instead, from the LOD1 mesh.
        paths["works_site_mask"] = snap("works_site_mask.png", "works_site", transparent=False, samples=1)
    restore_mats(meshes, flat_back)
    if "close" in registers:
        pose_top = apply_works_camera(camera, framing="works_top", focus=(0.0, 0.0, 0.0))
        depth_back, _dmat = override_depth(meshes, pose_top["distance"])
        paths["works_top_depth"] = snap("works_top_depth.png", "works_top", transparent=False, samples=1)
        restore_mats(meshes, depth_back)
    if hasattr(scene, "eevee"):
        try:
            scene.eevee.taa_render_samples = 32
        except Exception:
            pass
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
    lod_paths = {}
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
            "decimate": False,
        })
        reports.append(report)
        lod_paths[lod] = output
        print(json.dumps({"lod": lod, "triangles": report["triangles"], "draws": report["draws"], "bytes": nbytes, "sha256": report["sha256"]}, indent=2))

    removed = purge_cycle1_textures()
    print(f"purged cycle-1 textures: {len(removed)}")

    blender_status = {"export": "ok", "render": "ok"}
    stills = {}
    planform = {}
    try:
        stills.update(render_stills_from_glb(lod_paths[0], still_dir, registers=("close",)))
        stills.update(render_stills_from_glb(lod_paths[1], still_dir, registers=("site",)))
        planform = planform_report(still_dir)
    except Exception as exc:
        blender_status["render"] = f"crash: {exc}"
        print(f"RENDER CRASH (GLBs survive): {exc}")
        raise

    tex = texture_report()
    tex["tileMapDetail"] = atlas_maps_by_lod.get(0, {})
    (still_dir / "texture_report.json").write_bytes((json.dumps(tex, indent=2) + "\n").encode("utf-8"))

    hashes = {f"rover_lod{r['lod']}.glb": r["sha256"] for r in reports}
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
    sidecar.write_bytes((json.dumps(hashes, indent=2) + "\n").encode("utf-8"))

    still_rel = {}
    for key, path in stills.items():
        p = Path(path)
        still_rel[key] = str(p.relative_to(ROOT)).replace("\\", "/") if p.is_absolute() else str(p).replace("\\", "/")
    for extra in (
        "works_top_1to1.png",
        "works_top_clay_1to1.png",
        "works_beside_flight.png",
        "works_top_depth.png",
        "review_1to1/works_edge_1to1.png",
        "review_1to1/works_edge_flank_1to1.png",
        "review_1to1/works_site_1to1.png",
        "works_site_clay.png",
    ):
        target = still_dir / extra
        key = Path(extra).stem
        still_rel[key] = str(target.relative_to(ROOT)).replace("\\", "/")
        if not target.exists():
            raise RuntimeError(f"expected still missing: {target}")

    receipt = {
        "schema": "spaceface.worksRover.cycle.v1",
        "assetId": "rover",
        "cycle": CYCLE,
        "rootNode": "rover",
        "targetBboxWu": list(TARGET_BBOX),
        "targetBboxCells": [round(v / CELL_WU, 4) for v in TARGET_BBOX],
        "lods": reports,
        "textures": tex,
        "planform": planform,
        "hooks": reports[0]["hooks"] if reports else {},
        "bbox": reports[0]["bbox"] if reports else {},
        "stills": still_rel,
        "closeLod": 0,
        "siteLod": 1,
        "siteGlbSha256": reports[1]["sha256"] if len(reports) > 1 else None,
        "visibleFaces": {
            "note": "cycle 80 does not run hidden-face culling with --delete; works_site is LOD1"
        },
        "determinism": determinism,
        "purgedTextures": removed,
        "blender": blender_status,
    }
    out_json = FAMILY / "evidence" / f"cycle_{CYCLE:03d}.json"
    out_json.write_bytes((json.dumps(receipt, indent=2) + "\n").encode("utf-8"))
    print(json.dumps({
        "ok": True,
        "cycle": CYCLE,
        "tris0": reports[0]["triangles"],
        "triBudget0": TRI_BUDGET[0],
        "triOverBudget0": reports[0]["triOverBudget"],
        "bbox": reports[0]["bbox"]["sizeWu"],
        "pngCount": tex["pngCount"],
        "planformPass": planform.get("pass"),
        "sitePass": planform.get("sitePass"),
        "tris1": reports[1]["triangles"] if len(reports) > 1 else None,
        "siteLod": 1,
    }, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

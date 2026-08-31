"""PQ-131.06 Works conduit kit — Cycle 03 construction correction.

Two modular families (power cable, material lane), six topologies each,
authored at works scale (1 cell = 2.2 wu), unique 1024² atlas per family,
individual piece GLBs plus a master kit scene.

Cycle 03 repairs the supported-camera P0/P1 failures on candidate 3d2f0395:
cube junctions, disconnected/overlapping T and cross fittings, unprotected
gold bars, and a lane that still read as a black ribbon with sub-pixel
rollers. Both families are rebuilt. Cycle 01/02 evidence stays on disk.

    blender --background --python tools/blender/build_works_conduit_kit.py
    blender --background --python tools/blender/build_works_conduit_kit.py -- --check
    python tools/blender/build_works_conduit_kit.py --check

Does not wire runtime, does not release, does not mark PQ-131.06 complete.
"""
from __future__ import annotations

import hashlib
import json
import math
import os
import shutil
import struct
import sys
from collections import defaultdict, deque
from pathlib import Path

try:
    import bpy
    import bmesh
    from mathutils import Vector
    IN_BLENDER = True
except ImportError:
    bpy = None  # type: ignore
    bmesh = None  # type: ignore
    Vector = None  # type: ignore
    IN_BLENDER = False

try:
    import numpy as np
    HAS_NP = True
except ImportError:
    np = None  # type: ignore
    HAS_NP = False

TOOLS = Path(__file__).resolve().parent
ROOT = TOOLS.parents[1]
if str(TOOLS) not in sys.path:
    sys.path.insert(0, str(TOOLS))

KIT = ROOT / "assets" / "works" / "conduit_kit"
SOURCE = KIT / "source"
TEX_DIR = SOURCE / "textures"
EVIDENCE_C01 = KIT / "evidence" / "cycle_01"
EVIDENCE_C02 = KIT / "evidence" / "cycle_02"
EVIDENCE = KIT / "evidence" / "cycle_03"
DIAG = EVIDENCE / "diagnostics"
PARTS = ROOT / "assets" / "ships" / "parts" / "works"
REF = KIT / "reference"
BLENDER_EXE = Path(r"C:\Program Files\Blender Foundation\Blender 5.1\blender.exe")
CAMERA_PY = TOOLS / "spaceface_works_camera.py"

CELL = 2.2
HALF = 1.1
ATLAS = 1024
CYCLE = 3
PACKET = "PQ-131.06"
SHADE_ANGLE = 28.0
TRI_LOD0_MAX = 2000
TRI_LOD0_MIN = 700
TRI_LOD1_MAX = 900
TRI_LOD2_MAX = 280

FAMILIES = ("power", "lane")
KINDS = ("straight", "corner", "t", "cross", "end", "junction")
PORT_BITS = {
    "straight": ("-X", "+X"),
    "corner": ("+X", "+Y"),
    "t": ("-X", "+X", "+Y"),
    "cross": ("-X", "+X", "-Y", "+Y"),
    "end": ("+X",),
    "junction": ("-X", "+X", "-Y", "+Y"),
}

# Power ladder tray + SWA cable.
# Tray lips must read at 120 px/cell (~5 px), so the gold jacket sits IN the
# trough and is interrupted by saddles. Outer envelope frozen at 0.48 x 0.20.
P_W, P_H, P_T, P_C = 0.48, 0.20, 0.090, 0.016
P_FLOOR = 0.028
P_CABLE_R = 0.052
P_CABLE_Z = P_FLOOR + P_CABLE_R
P_BEND = 0.38
P_FIT = 0.36
P_JUNC = 0.50
P_JUNC_STUB = 0.52

# Lane framed roller conveyor. Outer envelope frozen at 0.76 x 0.26.
# Rails thick enough to read as C-channel; rollers large enough to read as
# tubes; belt a narrow carcass on the crowns; cover a smoked strip only.
L_W, L_H, L_T = 0.76, 0.26, 0.085
L_RAIL_Y = L_W / 2 - L_T / 2
L_FLANGE = 0.050
L_FLANGE_T = 0.020
L_ROLLER_R = 0.070
L_ROLLER_Z = 0.028 + 0.070
L_ROLLER_LEN = L_W - 2 * L_T - 0.02
L_BELT_W = 0.16
L_BELT_T = 0.010
L_COVER_W = 0.10
L_COVER_Z = L_ROLLER_Z + L_ROLLER_R + 0.024
L_BEND = 0.48
L_FIT = 0.14
L_JUNC = 0.46
L_JUNC_STUB = 0.50
L_SLEEPER = 0.36

KEEP_PNG = {b"IHDR", b"PLTE", b"IDAT", b"IEND", b"sRGB", b"gAMA", b"pHYS"}

ROLE_SPEC = {
    "jacket": {"rgb": (0.50, 0.36, 0.14), "rough": 0.56, "metal": 0.06, "emit": 0.0},
    "armour": {"rgb": (0.44, 0.45, 0.42), "rough": 0.34, "metal": 0.88, "emit": 0.0},
    "tray": {"rgb": (0.40, 0.41, 0.38), "rough": 0.48, "metal": 0.84, "emit": 0.0},
    "clamp": {"rgb": (0.14, 0.13, 0.12), "rough": 0.58, "metal": 0.72, "emit": 0.0},
    "hardware": {"rgb": (0.34, 0.30, 0.22), "rough": 0.36, "metal": 0.80, "emit": 0.0},
    "contact": {"rgb": (0.78, 0.52, 0.18), "rough": 0.26, "metal": 0.82, "emit": 1.0},
    "frame": {"rgb": (0.15, 0.13, 0.11), "rough": 0.62, "metal": 0.22, "emit": 0.0},
    "roller": {"rgb": (0.52, 0.53, 0.50), "rough": 0.28, "metal": 0.86, "emit": 0.0},
    "belt": {"rgb": (0.09, 0.09, 0.08), "rough": 0.82, "metal": 0.03, "emit": 0.0},
    "cover": {"rgb": (0.30, 0.34, 0.36), "rough": 0.14, "metal": 0.02, "emit": 0.0},
    "bracket": {"rgb": (0.20, 0.19, 0.17), "rough": 0.48, "metal": 0.68, "emit": 0.0},
    "lid": {"rgb": (0.32, 0.30, 0.26), "rough": 0.40, "metal": 0.52, "emit": 0.0},
}

ID_COLORS = {
    "jacket": (0.78, 0.52, 0.12),
    "armour": (0.62, 0.64, 0.60),
    "tray": (0.28, 0.46, 0.34),
    "clamp": (0.12, 0.12, 0.14),
    "hardware": (0.55, 0.42, 0.18),
    "contact": (0.95, 0.55, 0.12),
    "frame": (0.22, 0.16, 0.10),
    "roller": (0.70, 0.72, 0.68),
    "belt": (0.06, 0.06, 0.07),
    "cover": (0.38, 0.52, 0.56),
    "bracket": (0.18, 0.18, 0.20),
    "lid": (0.48, 0.40, 0.28),
}

POWER_ROLES = ("tray", "jacket", "armour", "clamp", "hardware", "contact", "bracket")
LANE_ROLES = ("frame", "roller", "belt", "cover", "hardware", "bracket", "lid")
BELT_TILE = (0.0, 0.86, 1.0, 0.985)

# Cycle 01 hashes retained as history. Cycle 03 rebuilds power; do not freeze.
POWER_CYCLE01_HASHES = {
    "place_works_conduit_power_straight": "CA4D71279F5480D878FAE99AA6A3EF4921A6C47F209D743749444808AA8AB74F",
    "place_works_conduit_power_corner": "06C41E5A890935A049EDD6E42616123C96A66D7CB4432AC76C48281AC2BB8F11",
    "place_works_conduit_power_t": "8F15CE7FE47E011CF6D9C6D52FFF4491FB49309ACEAB48473D30101D272348E8",
    "place_works_conduit_power_cross": "8E3D35DDFDC7E91657E27A14562F767B232B94B1C019B183D71ABA5F7BEA649D",
    "place_works_conduit_power_end": "BF514FE9D17CCF435D6D3CFCC677B682D584155B1E5DA8C19DA91C9A499D8F6D",
    "place_works_conduit_power_junction": "7AA12DC794E9427DC3A4D87486AB10FDC773322D2F13FBBEA6C65E0C6C05785D",
    "power_atlas_basecolor.png": "999171C54FA62C9F4FB92CD08344DF6981889ED923CF5DD3FA62ACEBC1D78F0B",
    "power_atlas_orm.png": "B90AE799A4933BB910083FD7CC5001693399BDCAE14F0092A821895FD4479F21",
    "power_atlas_normal.png": "E43519CAE553C7DBA53971C31B95DC9095EE85BF71377B96BA1CCE870BB5FE78",
}

LOD_BANDS = {
    0: (0.00, 0.70),
    1: (0.70, 0.84),
    2: (0.84, 0.86),
}


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1 << 20), b""):
            digest.update(chunk)
    return digest.hexdigest().upper()


def cli_args(argv=None):
    argv = list(sys.argv if argv is None else argv)
    if "--" in argv:
        argv = argv[argv.index("--") + 1 :]
    else:
        argv = [a for a in argv[1:] if not a.endswith(".py")]
    flags = {
        "check": False,
        "skip_evidence": False,
        "skip_build": False,
    }
    for tok in argv:
        if tok in ("--check", "--validate-only"):
            flags["check"] = True
        elif tok == "--skip-evidence":
            flags["skip_evidence"] = True
        elif tok == "--skip-build":
            flags["skip_build"] = True
    return flags


def asset_id(family, kind):
    return f"place_works_conduit_{family}_{kind}"


def type_root_name(family, kind):
    return f"{family}_{kind}"


def blender_to_gltf(p):
    x, y, z = p
    return [float(x), float(z), float(-y)]


def port_origin(axis):
    if axis == "+X":
        return (HALF, 0.0, 0.0)
    if axis == "-X":
        return (-HALF, 0.0, 0.0)
    if axis == "+Y":
        return (0.0, HALF, 0.0)
    if axis == "-Y":
        return (0.0, -HALF, 0.0)
    raise ValueError(axis)


def port_normal(axis):
    return {
        "+X": (1.0, 0.0, 0.0),
        "-X": (-1.0, 0.0, 0.0),
        "+Y": (0.0, 1.0, 0.0),
        "-Y": (0.0, -1.0, 0.0),
    }[axis]


# ---------------------------------------------------------------------------
# GLB / PNG helpers (no bpy required)
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


def write_glb(path: Path, gltf: dict, rest: bytes) -> None:
    payload = json.dumps(gltf, separators=(",", ":"), ensure_ascii=True).encode("utf-8")
    while len(payload) % 4:
        payload += b" "
    header = bytearray(b"glTF")
    header += struct.pack("<I", 2)
    header += struct.pack("<I", 12 + 8 + len(payload) + len(rest))
    header += struct.pack("<I", len(payload))
    header += b"JSON"
    tmp = path.with_suffix(".glb.stamp-tmp")
    tmp.write_bytes(bytes(header) + payload + rest)
    tmp.replace(path)


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


def glb_triangle_counts(gltf: dict) -> dict:
    views = gltf.get("bufferViews") or []
    accessors = gltf.get("accessors") or []
    meshes = gltf.get("meshes") or []
    nodes = gltf.get("nodes") or []
    name_of = {}
    for node in nodes:
        mesh_i = node.get("mesh")
        if mesh_i is not None:
            name_of.setdefault(mesh_i, node.get("name") or f"mesh{mesh_i}")
    out = {}
    for mi, mesh in enumerate(meshes):
        tris = 0
        for prim in mesh.get("primitives") or []:
            acc_i = prim.get("indices")
            if acc_i is not None:
                tris += int(accessors[acc_i].get("count") or 0) // 3
            else:
                pos = (prim.get("attributes") or {}).get("POSITION")
                if pos is not None:
                    tris += int(accessors[pos].get("count") or 0) // 3
        out[name_of.get(mi, mesh.get("name") or f"mesh{mi}")] = tris
    return out


def glb_image_sizes(gltf: dict):
    sizes = []
    for img in gltf.get("images") or []:
        sizes.append({k: img.get(k) for k in ("mimeType", "name", "bufferView") if k in img})
    return sizes


def dump_json(path: Path, data) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes((json.dumps(data, indent=2) + "\n").encode("utf-8"))


# ---------------------------------------------------------------------------
# Validation (stdlib)
# ---------------------------------------------------------------------------

def expected_piece_paths():
    paths = []
    for family in FAMILIES:
        for kind in KINDS:
            paths.append(PARTS / f"{asset_id(family, kind)}.glb")
    return paths


def validate_outputs(strict=True):
    report = {"ok": True, "errors": [], "pieces": [], "atlases": [], "master": None}
    def fail(msg):
        report["ok"] = False
        report["errors"].append(msg)

    for family in FAMILIES:
        for kind in ("basecolor", "normal", "orm"):
            p = TEX_DIR / f"{family}_atlas_{kind}.png"
            if not p.exists():
                fail(f"missing atlas {p}")
                continue
            data = p.read_bytes()
            if data[:8] != b"\x89PNG\r\n\x1a\n":
                fail(f"atlas not PNG {p}")
                continue
            w = int.from_bytes(data[16:20], "big")
            h = int.from_bytes(data[20:24], "big")
            rec = {"path": str(p.relative_to(ROOT)).replace("\\", "/"), "w": w, "h": h, "sha256": sha256(p)}
            report["atlases"].append(rec)
            if w != ATLAS or h != ATLAS:
                fail(f"atlas {p.name} is {w}x{h}, expected {ATLAS}")

    master = SOURCE / "works_conduit_kit.glb"
    if not master.exists():
        fail("missing master kit GLB")
    else:
        report["master"] = {
            "path": str(master.relative_to(ROOT)).replace("\\", "/"),
            "bytes": master.stat().st_size,
            "sha256": sha256(master),
        }

    for family in FAMILIES:
        for kind in KINDS:
            aid = asset_id(family, kind)
            path = PARTS / f"{aid}.glb"
            rec = {"id": aid, "family": family, "kind": kind, "errors": []}
            if not path.exists():
                rec["errors"].append("missing GLB")
                fail(f"missing {path}")
                report["pieces"].append(rec)
                continue
            rec["path"] = str(path.relative_to(ROOT)).replace("\\", "/")
            rec["bytes"] = path.stat().st_size
            rec["sha256"] = sha256(path)
            gltf, _rest = read_glb(path)
            extras = (gltf.get("asset") or {}).get("extras") or {}
            contract = extras.get("spacefaceAsset") or {}
            rec["contract"] = {k: contract.get(k) for k in ("assetId", "family", "kind", "packet", "lods")}
            nodes = gltf.get("nodes") or []
            names = [n.get("name") or "" for n in nodes]
            rec["nodes"] = names
            if aid not in names:
                rec["errors"].append(f"root {aid} missing")
            type_name = type_root_name(family, kind)
            if type_name not in names and aid not in names:
                rec["errors"].append(f"type root {type_name} missing")
            hook = "powered" if family == "power" else "flow_mesh"
            if hook not in names:
                rec["errors"].append(f"hook {hook} missing")
            if kind == "junction" and "service_lid" not in names:
                rec["errors"].append("service_lid missing")
            for lod in (0, 1, 2):
                lod_ok = any(n.startswith(f"LOD{lod}_") for n in names)
                if not lod_ok:
                    rec["errors"].append(f"LOD{lod}_ mesh missing")
            tris = glb_triangle_counts(gltf)
            rec["triangles"] = tris
            lod_tri = {0: 0, 1: 0, 2: 0}
            for name, count in tris.items():
                for lod in (0, 1, 2):
                    if name.startswith(f"LOD{lod}_"):
                        lod_tri[lod] += count
            rec["lodTriangles"] = lod_tri
            if lod_tri[0] > TRI_LOD0_MAX:
                rec["errors"].append(f"LOD0 tris {lod_tri[0]} > {TRI_LOD0_MAX}")
            if lod_tri[0] and lod_tri[0] < 200:
                rec["errors"].append(f"LOD0 tris {lod_tri[0]} implausibly low")
            if lod_tri[1] > lod_tri[0]:
                rec["errors"].append("LOD1 is not cheaper than LOD0")
            if lod_tri[2] > lod_tri[1] and lod_tri[1]:
                rec["errors"].append("LOD2 is not cheaper than LOD1")
            if lod_tri[1] > TRI_LOD1_MAX:
                rec["errors"].append(f"LOD1 tris {lod_tri[1]} > {TRI_LOD1_MAX}")
            if lod_tri[2] > TRI_LOD2_MAX:
                rec["errors"].append(f"LOD2 tris {lod_tri[2]} > {TRI_LOD2_MAX}")
            ports = contract.get("ports") or []
            want = list(PORT_BITS[kind])
            got = [p.get("axis") for p in ports]
            if got != want and set(got) != set(want):
                rec["errors"].append(f"ports {got} != {want}")
            rec["ports"] = ports
            want_w = 0.48 if family == "power" else 0.76
            for port in ports:
                if port.get("ok") and abs(float(port.get("width") or 0) - want_w) > 0.08:
                    rec["errors"].append(
                        f"port {port.get('axis')} width {port.get('width')} off {want_w}"
                    )
            rec["images"] = len(gltf.get("images") or [])
            if rec["images"] < 3:
                rec["errors"].append("expected 3 atlas maps packed in GLB")
            for err in rec["errors"]:
                fail(f"{aid}: {err}")
            report["pieces"].append(rec)

    inv = KIT / "INVENTORY.json"
    if inv.exists():
        try:
            json.loads(inv.read_text(encoding="utf-8"))
        except Exception as exc:
            fail(f"INVENTORY.json: {exc}")
    else:
        fail("missing INVENTORY.json")

    for req in (
        REF / "REFERENCE_BRIEF.md",
        REF / "PORT_CONVENTION.json",
        REF / "MATERIAL_BILL.json",
    ):
        if not req.exists():
            fail(f"missing {req.name}")

    if not EVIDENCE_C01.exists():
        fail("Cycle 01 evidence missing")
    if CYCLE >= 3 and not EVIDENCE.exists() and not strict:
        pass

    report["errorCount"] = len(report["errors"])
    dump_json(KIT / "VALIDATION.json", report)
    if strict and not report["ok"]:
        raise SystemExit("validation failed:\n  " + "\n  ".join(report["errors"][:40]))
    return report


# ---------------------------------------------------------------------------
# Blender construction
# ---------------------------------------------------------------------------

def _v(x, y, z=0.0):
    return Vector((float(x), float(y), float(z)))


def reset_scene():
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


def link_obj(obj, collection):
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
    return obj


def frames_of(centers):
    frames = []
    n = len(centers)
    for i, p in enumerate(centers):
        if i < n - 1:
            t = centers[i + 1] - p
        else:
            t = p - centers[i - 1]
        if t.length < 1e-8:
            t = Vector((1, 0, 0))
        t.normalize()
        up = Vector((0, 0, 1))
        b = t.cross(up)
        if b.length < 1e-6:
            b = t.cross(Vector((0, 1, 0)))
        b.normalize()
        nn = b.cross(t)
        nn.normalize()
        frames.append((p, t, b, nn))
    return frames


def polyline_straight(z, n=8):
    return [_v(-HALF + (HALF * 2) * i / n, 0.0, z) for i in range(n + 1)]


def polyline_arm(axis, start, end, z, n=4):
    pts = []
    for i in range(n + 1):
        t = i / n
        if axis == "X":
            pts.append(_v(start + t * (end - start), 0.0, z))
        else:
            pts.append(_v(0.0, start + t * (end - start), z))
    return pts


def polyline_corner(radius, z, n_arm=3, n_arc=8):
    pts = []
    for i in range(n_arm + 1):
        t = i / n_arm
        pts.append(_v(HALF + t * (radius - HALF), 0.0, z))
    for i in range(1, n_arc + 1):
        t = i / n_arc
        ang = -math.pi / 2 - t * math.pi / 2
        pts.append(_v(radius + radius * math.cos(ang), radius + radius * math.sin(ang), z))
    for i in range(1, n_arm + 1):
        t = i / n_arm
        pts.append(_v(0.0, radius + t * (HALF - radius), z))
    return pts


def polyline_arc(cx, cy, r, a0, a1, z, n):
    pts = []
    for i in range(n + 1):
        t = i / max(1, n)
        a = a0 + (a1 - a0) * t
        pts.append(_v(cx + r * math.cos(a), cy + r * math.sin(a), z))
    return pts


def polyline_xy(x0, y0, x1, y1, z, n):
    pts = []
    for i in range(n + 1):
        t = i / max(1, n)
        pts.append(_v(x0 + t * (x1 - x0), y0 + t * (y1 - y0), z))
    return pts


def bm_new():
    bm = bmesh.new()
    uv = bm.loops.layers.uv.new("UVMap")
    return bm, uv


def bm_box(bm, center, size):
    geom = bmesh.ops.create_cube(bm, size=1.0)
    for v in geom["verts"]:
        v.co.x = center[0] + v.co.x * size[0]
        v.co.y = center[1] + v.co.y * size[1]
        v.co.z = center[2] + v.co.z * size[2]
    return geom["verts"]


def bm_cyl(bm, center, radius, depth, axis="X", segs=8):
    geom = bmesh.ops.create_cone(
        bm, cap_ends=True, cap_tris=False,
        radius1=radius, radius2=radius, depth=depth, segments=max(4, segs),
    )
    rot = None
    if axis == "X":
        rot = (0.0, math.pi / 2, 0.0)
    elif axis == "Y":
        rot = (math.pi / 2, 0.0, 0.0)
    if rot:
        bmesh.ops.rotate(bm, verts=geom["verts"], cent=(0, 0, 0),
                         matrix=_euler_matrix(*rot))
    bmesh.ops.translate(bm, verts=geom["verts"], vec=center)
    return geom["verts"]


def _euler_matrix(rx, ry, rz):
    from mathutils import Euler, Matrix
    return Euler((rx, ry, rz), "XYZ").to_matrix().to_4x4()


def bm_cyl_aligned(bm, center, radius, depth, direction, segs=8):
    from mathutils import Matrix, Vector
    geom = bmesh.ops.create_cone(
        bm, cap_ends=True, cap_tris=False,
        radius1=radius, radius2=radius, depth=depth, segments=max(4, segs),
    )
    direction = Vector(direction)
    if direction.length < 1e-8:
        direction = Vector((1.0, 0.0, 0.0))
    direction.normalize()
    z = Vector((0.0, 0.0, 1.0))
    dot = max(-1.0, min(1.0, direction.dot(z)))
    if abs(dot) > 0.999:
        rot = Matrix.Identity(4) if dot > 0 else Matrix.Rotation(math.pi, 4, "X")
    else:
        axis = z.cross(direction)
        axis.normalize()
        rot = Matrix.Rotation(math.acos(dot), 4, axis)
    bmesh.ops.rotate(bm, verts=geom["verts"], cent=(0, 0, 0), matrix=rot)
    bmesh.ops.translate(bm, verts=geom["verts"], vec=center)
    return geom["verts"]


def rail_c_profile(side):
    """C-channel opening toward the belt. side +1 = +offset rail, -1 = -offset rail."""
    w, h, fl, ft = L_T, L_H, L_FLANGE, L_FLANGE_T
    outer = side * (w / 2.0)
    inner = side * (-w / 2.0)
    tip = inner - side * fl
    return [
        (outer, 0.0),
        (outer, h),
        (inner, h),
        (tip, h),
        (tip, h - ft),
        (inner, h - ft),
        (inner, ft),
        (tip, ft),
        (tip, 0.0),
    ]


def rail_box_profile():
    w, h = L_T, L_H
    return [(-w / 2.0, 0.0), (w / 2.0, 0.0), (w / 2.0, h), (-w / 2.0, h)]


def belt_profile():
    z0 = L_ROLLER_Z + L_ROLLER_R - 0.002
    z1 = z0 + L_BELT_T
    hw = L_BELT_W / 2.0
    return [(-hw, z0), (hw, z0), (hw, z1), (-hw, z1)]


def cover_profile():
    z0 = L_COVER_Z
    z1 = z0 + 0.008
    hw = L_COVER_W / 2.0
    return [(-hw, z0), (hw, z0), (hw, z1), (-hw, z1)]


def bm_sweep(bm, centers, profile, closed=True):
    frames = frames_of(centers)
    n_s = len(frames)
    n_p = len(profile)
    verts = []
    for origin, _t, b, nn in frames:
        ring = []
        for y, z in profile:
            ring.append(bm.verts.new(origin + b * y + nn * z))
        verts.append(ring)
    bm.verts.ensure_lookup_table()
    for i in range(n_s - 1):
        for j in range(n_p if closed else n_p - 1):
            j2 = (j + 1) % n_p if closed else j + 1
            try:
                bm.faces.new((verts[i][j], verts[i][j2], verts[i + 1][j2], verts[i + 1][j]))
            except ValueError:
                pass
    return verts


def power_tray_profile():
    w, h, lip, c, floor = P_W, P_H, P_T, P_C, P_FLOOR
    return [
        (-w / 2, 0.0),
        (w / 2, 0.0),
        (w / 2, h - c),
        (w / 2 - c, h),
        (w / 2 - lip, h),
        (w / 2 - lip, floor),
        (-w / 2 + lip, floor),
        (-w / 2 + lip, h),
        (-w / 2 + c, h),
        (-w / 2, h - c),
    ]


def cable_profile(segs):
    pts = []
    for i in range(segs):
        a = (2 * math.pi) * i / segs
        pts.append((P_CABLE_R * math.cos(a), P_CABLE_Z + P_CABLE_R * math.sin(a)))
    return pts


def finish_bmesh(name, bm, collection, role):
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    mesh = bpy.data.meshes.new(name + "_Mesh")
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)
    obj["spacefaceRole"] = role
    shade_by_angle(obj)
    return obj


def shade_by_angle(obj, angle=SHADE_ANGLE):
    mesh = obj.data
    try:
        mesh.use_auto_smooth = True
        mesh.auto_smooth_angle = math.radians(angle)
    except Exception:
        pass
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    try:
        bpy.ops.object.shade_smooth_by_angle(angle=math.radians(angle))
    except Exception:
        try:
            bpy.ops.object.shade_smooth()
        except Exception:
            pass


def tri_count(obj):
    if obj is None or obj.type != "MESH" or not obj.data:
        return 0
    return sum(max(0, len(p.vertices) - 2) for p in obj.data.polygons)


def triangulate_object(obj):
    if obj is None or obj.type != "MESH" or not obj.data:
        return
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bmesh.ops.triangulate(bm, faces=bm.faces[:])
    bm.to_mesh(obj.data)
    bm.free()
    obj.data.name = obj.name
    obj.data.update()
    try:
        obj.data.calc_tangents()
    except Exception:
        pass


def join_named(objects, name):
    objects = [o for o in objects if o is not None and o.type == "MESH"]
    if not objects:
        return None
    if len(objects) == 1:
        objects[0].name = name
        objects[0].data.name = name
        triangulate_object(objects[0])
        return objects[0]
    bpy.ops.object.select_all(action="DESELECT")
    for obj in objects:
        obj.hide_set(False)
        obj.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    bpy.ops.object.join()
    objects[0].name = name
    objects[0].data.name = name
    triangulate_object(objects[0])
    return objects[0]


def descendants(root):
    out = []
    stack = [root]
    while stack:
        node = stack.pop()
        out.append(node)
        stack.extend(list(node.children))
    return out


def unique_suffix(family, kind):
    return f"__{family}_{kind}"


def apply_canonical_names(root, family, kind, canonical=True):
    suffix = unique_suffix(family, kind)
    shared = {"powered", "flow_mesh", "service_lid"}
    for obj in descendants(root):
        if canonical:
            if obj.name.endswith(suffix):
                obj.name = obj.name[: -len(suffix)]
        else:
            if obj.name != asset_id(family, kind) and not obj.name.endswith(suffix):
                if obj.name in shared or obj.name.startswith("LOD"):
                    obj.name = obj.name + suffix
        if obj.type == "MESH" and obj.data:
            obj.data.name = obj.name


# ----- path recipes -------------------------------------------------------

def path_for(kind, z, lod):
    """Power-family centerlines. T/cross are three/four arms plus inner arcs, never a filled box."""
    n_s = 6 if lod == 0 else (4 if lod == 1 else 2)
    n_arc = 6 if lod == 0 else (4 if lod == 1 else 3)
    n_arm = 2 if lod == 0 else 2
    if kind == "straight":
        return [polyline_straight(z, n_s)]
    if kind == "end":
        return [polyline_arm("X", -0.18, HALF, z, n_s)]
    if kind == "corner":
        return [polyline_corner(P_BEND, z, n_arm, n_arc)]
    if kind == "t":
        g = P_FIT
        paths = [
            polyline_arm("X", -HALF, -g, z, n_arm),
            polyline_arm("X", g, HALF, z, n_arm),
            polyline_arm("Y", g, HALF, z, n_arm),
        ]
        if lod < 2:
            paths.extend([
                polyline_arc(0.0, 0.0, g, math.pi, math.pi / 2, z, n_arc),
                polyline_arc(0.0, 0.0, g, 0.0, math.pi / 2, z, n_arc),
            ])
        return paths
    if kind == "cross":
        g = P_FIT
        paths = [
            polyline_arm("X", -HALF, -g, z, n_arm),
            polyline_arm("X", g, HALF, z, n_arm),
            polyline_arm("Y", -HALF, -g, z, n_arm),
            polyline_arm("Y", g, HALF, z, n_arm),
        ]
        if lod < 2:
            paths.extend([
                polyline_arc(0.0, 0.0, g, math.pi, math.pi / 2, z, n_arc),
                polyline_arc(0.0, 0.0, g, 0.0, math.pi / 2, z, n_arc),
                polyline_arc(0.0, 0.0, g, math.pi, 3 * math.pi / 2, z, n_arc),
                polyline_arc(0.0, 0.0, g, 0.0, -math.pi / 2, z, n_arc),
            ])
        return paths
    if kind == "junction":
        stub = P_JUNC_STUB
        return [
            polyline_arm("X", -HALF, -stub, z, 2),
            polyline_arm("X", stub, HALF, z, 2),
            polyline_arm("Y", -HALF, -stub, z, 2),
            polyline_arm("Y", stub, HALF, z, 2),
        ]
    raise ValueError(kind)


def corner_path(radius, z, lod):
    n_arc = 8 if lod == 0 else (5 if lod == 1 else 3)
    n_arm = 3 if lod == 0 else 2
    return polyline_corner(radius, z, n_arm, n_arc)


def sample_along(path, spacing):
    if len(path) < 2:
        return []
    out = [path[0]]
    acc = 0.0
    for a, b in zip(path, path[1:]):
        seg = (b - a).length
        acc += seg
        if acc >= spacing:
            out.append(b)
            acc = 0.0
    if (out[-1] - path[-1]).length > 0.05:
        out.append(path[-1])
    return out


def clamp_ok(p, kind):
    if abs(p.x) > HALF - 0.18 and abs(p.y) < 0.15:
        return False
    if abs(p.y) > HALF - 0.18 and abs(p.x) < 0.15:
        return False
    return True


# ----- family builders ----------------------------------------------------

def _saddle(clamp_bm, hw_bm, p, ax, lod):
    """Pressed-steel saddle rooted on the tray lips, wrapping the jacket."""
    if ax == "X":
        bm_box(clamp_bm, (p.x, 0.0, P_CABLE_Z + P_CABLE_R + 0.010), (0.08, P_W - 0.08, 0.016))
        bm_box(clamp_bm, (p.x, (P_W - P_T) * 0.5, P_CABLE_Z), (0.08, 0.028, 0.14))
        bm_box(clamp_bm, (p.x, -(P_W - P_T) * 0.5, P_CABLE_Z), (0.08, 0.028, 0.14))
        bm_box(clamp_bm, (p.x, 0.0, P_FLOOR * 0.5 + 0.004), (0.10, P_W - 0.04, 0.014))
    else:
        bm_box(clamp_bm, (0.0, p.y, P_CABLE_Z + P_CABLE_R + 0.010), (P_W - 0.08, 0.08, 0.016))
        bm_box(clamp_bm, ((P_W - P_T) * 0.5, p.y, P_CABLE_Z), (0.028, 0.08, 0.14))
        bm_box(clamp_bm, (-(P_W - P_T) * 0.5, p.y, P_CABLE_Z), (0.028, 0.08, 0.14))
        bm_box(clamp_bm, (0.0, p.y, P_FLOOR * 0.5 + 0.004), (P_W - 0.04, 0.10, 0.014))
    if lod == 0:
        bm_cyl(hw_bm, (p.x if ax == "X" else 0.08, 0.09 if ax == "X" else p.y, 0.04), 0.011, 0.028, axis="Z", segs=6)
        bm_cyl(hw_bm, (p.x if ax == "X" else -0.08, -0.09 if ax == "X" else p.y, 0.04), 0.011, 0.028, axis="Z", segs=6)


def _port_splice(tray_bm, axis, lod):
    """Inboard splice plate at a port. Stays inside the cell face."""
    inset = 0.055
    if axis == "+X":
        bm_box(tray_bm, (HALF - inset, 0.0, P_H * 0.55), (0.04, P_W + 0.03, P_H * 0.7))
    elif axis == "-X":
        bm_box(tray_bm, (-HALF + inset, 0.0, P_H * 0.55), (0.04, P_W + 0.03, P_H * 0.7))
    elif axis == "+Y":
        bm_box(tray_bm, (0.0, HALF - inset, P_H * 0.55), (P_W + 0.03, 0.04, P_H * 0.7))
    else:
        bm_box(tray_bm, (0.0, -HALF + inset, P_H * 0.55), (P_W + 0.03, 0.04, P_H * 0.7))
    if lod == 0:
        if axis in ("+X", "-X"):
            x = HALF - inset if axis == "+X" else -HALF + inset
            bm_cyl(tray_bm, (x, 0.10, P_H * 0.7), 0.008, 0.02, axis="Z", segs=5)
            bm_cyl(tray_bm, (x, -0.10, P_H * 0.7), 0.008, 0.02, axis="Z", segs=5)


def _gland(hw_bm, loc, axis, segs):
    bm_cyl(hw_bm, loc, 0.048, 0.070, axis=axis, segs=segs)
    bm_cyl(hw_bm, loc, 0.062, 0.024, axis=axis, segs=segs)


def build_power(kind, lod, collection, tag):
    segs = 8 if lod == 0 else (6 if lod == 1 else 4)
    tray_bm, _ = bm_new()
    jacket_bm, _ = bm_new()
    armour_bm, _ = bm_new()
    clamp_bm, _ = bm_new()
    hw_bm, _ = bm_new()
    br_bm, _ = bm_new()
    contact_bm, _ = bm_new()
    lid_bm, _ = bm_new()

    paths = path_for(kind, 0.0, lod)
    # Jacket only on the physical cable runs, not on the inner-fillet centerlines
    # of T/cross (those are tray-only so gold does not flood the fitting).
    jacket_paths = paths[:3] if kind == "t" else (paths[:4] if kind == "cross" else paths)
    if kind == "junction" and lod == 2:
        jacket_paths = []
    for path in paths:
        bm_sweep(tray_bm, path, power_tray_profile() if lod < 2 else [
            (-P_W / 2, 0.0), (P_W / 2, 0.0), (P_W / 2, P_H), (-P_W / 2, P_H),
        ], closed=True)
    for path in jacket_paths:
        bm_sweep(jacket_bm, path, cable_profile(segs), closed=True)

    # Ladder rungs on every straight-ish arm so the tray, not the jacket, is the plan.
    if lod <= 1:
        n_rung = 5 if lod == 0 else 3
        for path in jacket_paths:
            if len(path) < 2:
                continue
            for i in range(n_rung):
                t = (i + 0.65) / (n_rung + 0.3)
                idx = min(len(path) - 1, int(round(t * (len(path) - 1))))
                p = path[idx]
                if not clamp_ok(p, kind) and kind not in ("end",):
                    continue
                if kind in ("t", "cross", "junction") and max(abs(p.x), abs(p.y)) < P_FIT + 0.04:
                    continue
                ax = "X" if abs(p.x) >= abs(p.y) else "Y"
                if ax == "X":
                    bm_box(tray_bm, (p.x, 0.0, P_FLOOR + 0.008), (0.036, P_W - 2 * P_T - 0.01, 0.016))
                else:
                    bm_box(tray_bm, (0.0, p.y, P_FLOOR + 0.008), (P_W - 2 * P_T - 0.01, 0.036, 0.016))

    if lod == 0:
        for path in jacket_paths:
            for p in sample_along(path, 0.32):
                if not clamp_ok(p, kind) and kind not in ("end",):
                    continue
                if kind in ("t", "cross", "junction") and max(abs(p.x), abs(p.y)) < P_FIT + 0.06:
                    continue
                ax = "X" if abs(p.x) >= abs(p.y) else "Y"
                bm_cyl(armour_bm, (p.x, p.y, P_CABLE_Z), P_CABLE_R + 0.009, 0.024, axis=ax, segs=8)

    if lod <= 1:
        spacing = 0.42 if lod == 0 else 0.70
        first = True
        for path in jacket_paths:
            for p in sample_along(path, spacing):
                if not clamp_ok(p, kind) and kind not in ("end",):
                    continue
                if kind in ("t", "cross", "junction") and max(abs(p.x), abs(p.y)) < P_FIT + 0.08:
                    continue
                ax = "X" if abs(p.x) >= abs(p.y) else "Y"
                _saddle(clamp_bm, hw_bm, p, ax, lod)
                if first:
                    if ax == "X":
                        bm_box(contact_bm, (p.x, 0.0, P_CABLE_Z + P_CABLE_R + 0.020), (0.046, 0.024, 0.010))
                    else:
                        bm_box(contact_bm, (0.0, p.y, P_CABLE_Z + P_CABLE_R + 0.020), (0.024, 0.046, 0.010))
                    first = False

    if kind in ("t", "cross"):
        # Bonded splice at the fitting, not a filled tray cube.
        bm_cyl(hw_bm, (0.0, 0.0, P_CABLE_Z), 0.046, 0.10, axis="Z", segs=segs)
        bm_box(hw_bm, (0.0, 0.0, P_FLOOR + 0.01), (0.16, 0.16, 0.016))
        if lod == 0:
            for ang in (0.0, math.pi / 2, math.pi, 3 * math.pi / 2)[: (3 if kind == "t" else 4)]:
                if kind == "t" and ang > math.pi:
                    continue
                dx, dy = 0.10 * math.cos(ang), 0.10 * math.sin(ang)
                bm_cyl(hw_bm, (dx, dy, P_FLOOR + 0.02), 0.008, 0.02, axis="Z", segs=5)
        if lod <= 1:
            for axis in PORT_BITS[kind]:
                _port_splice(tray_bm, axis, lod)
    if kind == "junction":
        # Service enclosure in the hollow. Tray stubs remain; the box is not the cell.
        bm_box(hw_bm, (0.0, 0.0, 0.13), (P_JUNC, P_JUNC, 0.24))
        if lod < 2:
            add_service_lid_mesh(lid_bm, hw_bm, 0.0, 0.0, 0.262, P_JUNC - 0.08, P_JUNC - 0.08, lod)
        else:
            bm_box(hw_bm, (0.0, 0.0, 0.255), (P_JUNC - 0.08, P_JUNC - 0.08, 0.02))
        if lod == 0:
            for axis, loc in (
                ("X", (P_JUNC * 0.5, 0.0, P_CABLE_Z)),
                ("X", (-P_JUNC * 0.5, 0.0, P_CABLE_Z)),
                ("Y", (0.0, P_JUNC * 0.5, P_CABLE_Z)),
                ("Y", (0.0, -P_JUNC * 0.5, P_CABLE_Z)),
            ):
                _gland(hw_bm, loc, axis, segs)
        if not any(contact_bm.verts):
            bm_box(contact_bm, (0.12, 0.0, 0.262), (0.05, 0.022, 0.010))
        if lod == 0:
            for axis in PORT_BITS[kind]:
                _port_splice(tray_bm, axis, lod)
    if kind == "end":
        bm_box(hw_bm, (-0.20, 0.0, P_H * 0.5), (0.036, P_W + 0.05, P_H + 0.05))
        _gland(hw_bm, (-0.26, 0.0, P_CABLE_Z), "X", segs)
        bm_cyl(armour_bm, (-0.32, 0.0, P_CABLE_Z), P_CABLE_R + 0.006, 0.05, axis="X", segs=segs)
        bm_box(jacket_bm, (-0.36, 0.0, P_CABLE_Z), (0.04, 0.036, 0.036))
        if not any(contact_bm.verts):
            bm_box(contact_bm, (-0.26, 0.0, P_CABLE_Z + 0.048), (0.024, 0.016, 0.010))
        _port_splice(tray_bm, "+X", lod)
    if kind in ("straight", "corner") and lod <= 1:
        for axis in PORT_BITS[kind]:
            _port_splice(tray_bm, axis, lod)

    if lod <= 1:
        feet = (-P_W * 0.42, P_W * 0.42)
        if kind == "straight":
            xs = (-0.70, 0.70)
            for x in xs:
                for y in feet:
                    bm_box(br_bm, (x, y, 0.012), (0.11, 0.045, 0.024))
                    bm_box(br_bm, (x, y, 0.05), (0.04, 0.04, 0.08))
        elif kind == "end":
            for y in feet:
                bm_box(br_bm, (0.45, y, 0.012), (0.11, 0.045, 0.024))
                bm_box(br_bm, (0.45, y, 0.05), (0.04, 0.04, 0.08))
        elif kind == "corner":
            for y in feet:
                bm_box(br_bm, (0.55, y, 0.012), (0.11, 0.045, 0.024))
            for x in feet:
                bm_box(br_bm, (x, 0.55, 0.012), (0.045, 0.11, 0.024))
        elif kind == "junction":
            for x, y in ((0.62, 0.62), (0.62, -0.62), (-0.62, 0.62), (-0.62, -0.62)):
                bm_box(br_bm, (x, y, 0.012), (0.10, 0.10, 0.024))
                bm_box(br_bm, (x, y, 0.05), (0.04, 0.04, 0.08))
        else:
            for y in feet:
                bm_box(br_bm, (0.55, y, 0.012), (0.11, 0.045, 0.024))

    if not any(contact_bm.verts):
        bm_box(contact_bm, (0.0, 0.0, P_CABLE_Z + P_CABLE_R + 0.018), (0.046, 0.022, 0.010))

    objs = {}

    def emit(bm, role, suffix=""):
        if not bm.verts:
            bm.free()
            return None
        obj = finish_bmesh(f"{tag}_{role}{suffix}", bm, collection, role)
        objs[role] = obj
        return obj

    emit(tray_bm, "tray")
    emit(jacket_bm, "jacket")
    emit(armour_bm, "armour")
    emit(clamp_bm, "clamp")
    emit(hw_bm, "hardware")
    emit(br_bm, "bracket")
    contact = emit(contact_bm, "contact")
    lid = emit(lid_bm, "lid")
    if lid is not None:
        objs.pop("lid", None)
    return objs, contact, lid


def lane_paths(kind, lod):
    """Belt/cover centerlines. T is a through-run plus a branch; never a second overlapping straight."""
    n_s = 8 if lod == 0 else (5 if lod == 1 else 3)
    n_arc = 10 if lod == 0 else (6 if lod == 1 else 4)
    n_arm = 3 if lod == 0 else 2
    if kind == "straight":
        return [polyline_straight(0.0, n_s)]
    if kind == "end":
        return [polyline_arm("X", -0.22, HALF, 0.0, n_s)]
    if kind == "corner":
        return [polyline_corner(L_BEND, 0.0, n_arm, n_arc)]
    if kind == "t":
        return [
            polyline_straight(0.0, n_s),
            polyline_arm("Y", 0.08, HALF, 0.0, n_arm),
        ]
    if kind == "cross":
        g = L_FIT
        return [
            polyline_arm("X", -HALF, -g, 0.0, n_arm),
            polyline_arm("X", g, HALF, 0.0, n_arm),
            polyline_arm("Y", -HALF, -g, 0.0, n_arm),
            polyline_arm("Y", g, HALF, 0.0, n_arm),
        ]
    if kind == "junction":
        return [
            polyline_arm("X", -HALF, -L_JUNC_STUB, 0.0, 2),
            polyline_arm("X", L_JUNC_STUB, HALF, 0.0, 2),
            polyline_arm("Y", -HALF, -L_JUNC_STUB, 0.0, 2),
            polyline_arm("Y", L_JUNC_STUB, HALF, 0.0, 2),
        ]
    raise ValueError(kind)


def lane_rail_polylines(kind, lod):
    """Explicit C-channel paths. T/cross rails do not overlap at the throat."""
    c = L_RAIL_Y
    n = 5 if lod == 0 else (3 if lod == 1 else 2)
    n_arc = 6 if lod == 0 else 4
    if kind == "straight":
        return [
            polyline_xy(-HALF, c, HALF, c, 0.0, n),
            polyline_xy(-HALF, -c, HALF, -c, 0.0, n),
        ]
    if kind == "end":
        x0 = -0.22
        return [
            polyline_xy(x0, c, HALF, c, 0.0, n),
            polyline_xy(x0, -c, HALF, -c, 0.0, n),
        ]
    if kind == "corner":
        path = polyline_corner(L_BEND, 0.0, 3 if lod == 0 else 2, n_arc)
        return [offset_path(path, c), offset_path(path, -c)]
    if kind == "t":
        g = c
        return [
            polyline_xy(-HALF, -c, HALF, -c, 0.0, n),
            polyline_xy(-HALF, c, -g, c, 0.0, n),
            polyline_xy(g, c, HALF, c, 0.0, n),
            polyline_xy(-c, g, -c, HALF, 0.0, n),
            polyline_xy(c, g, c, HALF, 0.0, n),
        ]
    if kind == "cross":
        g = L_FIT
        r = c - g
        rails = [
            polyline_xy(-HALF, c, -g, c, 0.0, n),
            polyline_xy(g, c, HALF, c, 0.0, n),
            polyline_xy(-HALF, -c, -g, -c, 0.0, n),
            polyline_xy(g, -c, HALF, -c, 0.0, n),
            polyline_xy(-c, -HALF, -c, -g, 0.0, n),
            polyline_xy(-c, g, -c, HALF, 0.0, n),
            polyline_xy(c, -HALF, c, -g, 0.0, n),
            polyline_xy(c, g, c, HALF, 0.0, n),
        ]
        if lod == 0:
            n_fillet = 4
            rails.append(polyline_arc(g, g, r, math.pi / 2, 0.0, 0.0, n_fillet))
            rails.append(polyline_arc(g, -g, r, -math.pi / 2, 0.0, 0.0, n_fillet))
            rails.append(polyline_arc(-g, g, r, math.pi / 2, math.pi, 0.0, n_fillet))
            rails.append(polyline_arc(-g, -g, r, -math.pi / 2, math.pi, 0.0, n_fillet))
        return rails
    if kind == "junction":
        s = L_JUNC_STUB
        return [
            polyline_xy(-HALF, c, -s, c, 0.0, 2),
            polyline_xy(-HALF, -c, -s, -c, 0.0, 2),
            polyline_xy(s, c, HALF, c, 0.0, 2),
            polyline_xy(s, -c, HALF, -c, 0.0, 2),
            polyline_xy(-c, -HALF, -c, -s, 0.0, 2),
            polyline_xy(c, -HALF, c, -s, 0.0, 2),
            polyline_xy(-c, s, -c, HALF, 0.0, 2),
            polyline_xy(c, s, c, HALF, 0.0, 2),
        ]
    raise ValueError(kind)


def offset_path(path, y_off):
    frames = frames_of(path)
    return [origin + b * y_off for origin, _t, b, _n in frames]


def lane_skip_detail(p, kind):
    if kind == "junction":
        return max(abs(p.x), abs(p.y)) < (L_JUNC_STUB + 0.02)
    if kind == "cross":
        return abs(p.x) < L_RAIL_Y and abs(p.y) < L_RAIL_Y
    if kind == "t":
        return abs(p.x) < L_RAIL_Y - 0.02 and p.y > 0.02 and p.y < L_RAIL_Y + 0.06
    if kind == "end":
        return p.x < -0.02
    return False


def add_gearmotor(hw_bm, origin, shaft_dir, lod):
    """Rooted MDR gearmotor: gearbox, motor can, feet, output shaft. Not a brick."""
    o = Vector(origin)
    d = Vector(shaft_dir)
    if d.length < 1e-8:
        d = Vector((0.0, -1.0, 0.0))
    d.normalize()
    up = Vector((0.0, 0.0, 1.0))
    side = d.cross(up)
    if side.length < 1e-6:
        side = Vector((1.0, 0.0, 0.0))
    side.normalize()
    gb = o + d * 0.02
    motor = o - d * 0.11
    shaft = o + d * 0.10
    bm_box(hw_bm, (gb.x, gb.y, gb.z), (0.10, 0.09, 0.09))
    bm_cyl_aligned(hw_bm, (motor.x, motor.y, motor.z), 0.038, 0.14, -d, segs=8 if lod == 0 else 5)
    bm_cyl_aligned(hw_bm, (shaft.x, shaft.y, shaft.z), 0.014, 0.10, d, segs=6 if lod == 0 else 4)
    foot = o + up * -0.04 + d * -0.02
    bm_box(hw_bm, (foot.x, foot.y, 0.018), (0.12, 0.05, 0.016))
    bm_box(hw_bm, (foot.x, foot.y, 0.05), (0.04, 0.04, 0.06))
    if lod == 0:
        term = motor + up * 0.04 + side * 0.03
        bm_box(hw_bm, (term.x, term.y, term.z), (0.04, 0.03, 0.03))
        bm_cyl(hw_bm, (foot.x + 0.04, foot.y, 0.032), 0.008, 0.02, axis="Z", segs=6)
        bm_cyl(hw_bm, (foot.x - 0.04, foot.y, 0.032), 0.008, 0.02, axis="Z", segs=6)


def add_service_lid_mesh(lid_bm, hw_bm, cx, cy, cz, sx, sy, lod):
    """Removable lid with lip, reveal, fasteners and a formed handle."""
    lip_z = cz - 0.012
    bm_box(hw_bm, (cx, cy, lip_z), (sx + 0.04, sy + 0.04, 0.012))
    bm_box(lid_bm, (cx, cy, cz), (sx, sy, 0.018))
    # The Cycle 01 lid read as a featureless square at 120 px/cell. Keep the
    # handle as separate dark hardware with two rooted feet and a raised bar so
    # its service purpose survives the supported top camera instead of relying
    # on a texture or object name.
    handle_y = cy + sy * 0.20
    handle_half = sx * 0.14
    bm_box(hw_bm, (cx - handle_half, handle_y, cz + 0.030), (0.030, 0.036, 0.042))
    bm_box(hw_bm, (cx + handle_half, handle_y, cz + 0.030), (0.030, 0.036, 0.042))
    bm_box(hw_bm, (cx, handle_y, cz + 0.052), (sx * 0.34, 0.030, 0.018))
    if lod == 0:
        inset = 0.055
        for dx in (-sx / 2 + inset, sx / 2 - inset):
            for dy in (-sy / 2 + inset, sy / 2 - inset):
                bm_cyl(hw_bm, (cx + dx, cy + dy, cz + 0.014), 0.014, 0.018, axis="Z", segs=6)
                bm_cyl(hw_bm, (cx + dx, cy + dy, cz - 0.01), 0.008, 0.018, axis="Z", segs=6)


def add_splice_lobe(frame_bm, x, y, along="X", lod=0):
    if along == "X":
        bm_box(frame_bm, (x, y, 0.04), (0.10, 0.08, 0.08))
        if lod <= 1:
            bm_box(frame_bm, (x, y, L_H * 0.5), (0.04, 0.08, L_H * 0.7))
    else:
        bm_box(frame_bm, (x, y, 0.04), (0.08, 0.10, 0.08))
        if lod <= 1:
            bm_box(frame_bm, (x, y, L_H * 0.5), (0.08, 0.04, L_H * 0.7))


def build_lane(kind, lod, collection, tag):
    frame_bm, _ = bm_new()
    roller_bm, _ = bm_new()
    belt_bm, _ = bm_new()
    cover_bm, _ = bm_new()
    hw_bm, _ = bm_new()
    br_bm, _ = bm_new()
    lid_bm, _ = bm_new()

    paths = lane_paths(kind, lod)
    rails = lane_rail_polylines(kind, lod)
    rail_prof = rail_box_profile() if lod == 2 else None
    b_prof = belt_profile()
    c_prof = cover_profile()
    segs = 6 if lod == 0 else (5 if lod == 1 else 4)
    if kind in ("t", "cross"):
        segs = 5 if lod == 0 else 4
    roll_space = 0.30 if lod == 0 else (0.50 if lod == 1 else 0.90)
    if kind in ("t", "cross"):
        roll_space = 0.38 if lod == 0 else 0.62
    sleeper_space = L_SLEEPER if lod == 0 else 0.62

    for rail in rails:
        if lod == 2:
            bm_sweep(frame_bm, rail, rail_prof, closed=True)
        else:
            mid = rail[len(rail) // 2]
            dx = abs(rail[0].x - rail[-1].x)
            dy = abs(rail[0].y - rail[-1].y)
            along_x = dx >= dy * 1.15
            along_y = dy >= dx * 1.15
            if along_x:
                # North rail (y>0) opens toward -Y (belt). Matches offset_path(-c) + side -1.
                side = -1 if mid.y > 0 else 1
                bm_sweep(frame_bm, rail, rail_c_profile(side), closed=True)
            elif along_y:
                side = 1 if mid.x > 0 else -1
                bm_sweep(frame_bm, rail, rail_c_profile(side), closed=True)
            else:
                bm_sweep(frame_bm, rail, rail_box_profile(), closed=True)

    for path in paths:
        bm_sweep(belt_bm, path, b_prof, closed=True)
        if lod <= 1:
            bm_sweep(cover_bm, path, c_prof, closed=True)
        frames = frames_of(path)
        if lod <= 1:
            for p in sample_along(path, roll_space):
                if lane_skip_detail(p, kind):
                    continue
                if not clamp_ok(p, kind) and kind not in ("end", "t", "cross", "junction"):
                    continue
                nearest = min(frames, key=lambda fr: (fr[0] - p).length)
                _o, _t, b, _n = nearest
                bm_cyl_aligned(
                    roller_bm, (p.x, p.y, L_ROLLER_Z), L_ROLLER_R, L_ROLLER_LEN, b, segs=segs,
                )
                if lod == 0 and kind in ("straight", "end", "corner"):
                    boss_r = 0.018
                    bm_cyl_aligned(
                        hw_bm, (p.x + b.x * L_RAIL_Y, p.y + b.y * L_RAIL_Y, L_ROLLER_Z),
                        boss_r, 0.040, b, segs=5,
                    )
                    bm_cyl_aligned(
                        hw_bm, (p.x - b.x * L_RAIL_Y, p.y - b.y * L_RAIL_Y, L_ROLLER_Z),
                        boss_r, 0.040, b, segs=5,
                    )
            if lod == 0 and kind != "cross":
                for p in sample_along(path, 0.22):
                    if lane_skip_detail(p, kind):
                        continue
                    nearest = min(frames, key=lambda fr: (fr[0] - p).length)
                    _o, t, b, _n = nearest
                    cz = L_ROLLER_Z + L_ROLLER_R + L_BELT_T * 0.5 + 0.003
                    if abs(t.x) >= abs(t.y):
                        bm_box(belt_bm, (p.x, p.y, cz), (0.020, L_BELT_W * 0.88, 0.007))
                    else:
                        bm_box(belt_bm, (p.x, p.y, cz), (L_BELT_W * 0.88, 0.020, 0.007))
        if lod == 0 or (lod == 1 and kind in ("straight", "end", "corner")):
            for p in sample_along(path, sleeper_space):
                if lane_skip_detail(p, kind):
                    continue
                if not clamp_ok(p, kind) and kind not in ("end", "t", "cross"):
                    continue
                nearest = min(frames, key=lambda fr: (fr[0] - p).length)
                _o, t, b, _n = nearest
                span = L_W - 2 * L_T - 0.04
                if abs(t.x) >= abs(t.y):
                    bm_box(frame_bm, (p.x, p.y, 0.016), (0.036, span, 0.016))
                else:
                    bm_box(frame_bm, (p.x, p.y, 0.016), (span, 0.036, 0.016))

    if kind == "t":
        add_splice_lobe(frame_bm, L_RAIL_Y, L_RAIL_Y, "Y", lod)
        add_splice_lobe(frame_bm, -L_RAIL_Y, L_RAIL_Y, "Y", lod)
        bm_box(hw_bm, (0.0, 0.06, L_ROLLER_Z + L_ROLLER_R + 0.002), (0.24, 0.18, 0.008))
        if lod <= 1:
            add_gearmotor(hw_bm, (0.42, -L_RAIL_Y, L_ROLLER_Z), (0.0, 1.0, 0.0), lod)
        if lod == 2:
            bm_box(frame_bm, (L_RAIL_Y, (L_RAIL_Y + HALF) * 0.5, L_H * 0.5), (L_T * 1.4, HALF - L_RAIL_Y, L_H))
            bm_box(frame_bm, (-L_RAIL_Y, (L_RAIL_Y + HALF) * 0.5, L_H * 0.5), (L_T * 1.4, HALF - L_RAIL_Y, L_H))
    if kind == "cross":
        for sx, sy in ((1, 1), (1, -1), (-1, 1), (-1, -1)):
            add_splice_lobe(frame_bm, sx * L_RAIL_Y * 0.55, sy * L_RAIL_Y * 0.55, "X", lod)
        bm_box(hw_bm, (0.0, 0.0, L_ROLLER_Z + L_ROLLER_R + 0.002), (0.22, 0.22, 0.008))
        if lod <= 1:
            add_gearmotor(hw_bm, (0.36, -L_RAIL_Y, L_ROLLER_Z), (0.0, 1.0, 0.0), lod)
    if kind == "junction":
        bm_box(frame_bm, (0.0, 0.0, 0.11), (L_JUNC, L_JUNC, 0.20))
        add_service_lid_mesh(lid_bm, hw_bm, 0.0, 0.0, 0.230, L_JUNC - 0.08, L_JUNC - 0.08, lod)
        if lod <= 1:
            add_gearmotor(hw_bm, (0.0, -L_JUNC * 0.5 - 0.01, 0.11), (0.0, 1.0, 0.0), lod)
        if lod == 0:
            for axis, loc in (
                ("X", (L_JUNC * 0.5, 0.0, L_ROLLER_Z)),
                ("X", (-L_JUNC * 0.5, 0.0, L_ROLLER_Z)),
                ("Y", (0.0, L_JUNC * 0.5, L_ROLLER_Z)),
                ("Y", (0.0, -L_JUNC * 0.5, L_ROLLER_Z)),
            ):
                bm_cyl(hw_bm, loc, 0.040, 0.06, axis=axis, segs=segs)
        if lod == 2:
            bm_box(frame_bm, (0.0, 0.0, 0.12), (L_JUNC + 0.04, L_JUNC + 0.04, 0.22))
    if kind == "end":
        bm_cyl(hw_bm, (-0.22, 0.0, L_ROLLER_Z), L_ROLLER_R + 0.010, L_ROLLER_LEN, axis="Y", segs=segs)
        bm_box(frame_bm, (-0.34, 0.0, L_H * 0.5), (0.036, L_W + 0.02, L_H + 0.02))
        bm_box(hw_bm, (-0.22, 0.0, L_H + 0.004), (0.14, 0.20, 0.010))
        if lod == 0:
            for dy in (-0.06, 0.06):
                bm_cyl(hw_bm, (-0.18, dy, L_H + 0.012), 0.008, 0.014, axis="Z", segs=6)
        if lod <= 1:
            add_gearmotor(hw_bm, (0.15, L_RAIL_Y, L_ROLLER_Z), (0.0, -1.0, 0.0), lod)

    if lod <= 1:
        for y in (-L_W * 0.48, L_W * 0.48):
            if kind == "straight":
                xs = (-0.70, 0.70)
            elif kind == "end":
                xs = (0.45,)
            elif kind == "corner":
                xs = (0.70,)
            elif kind == "junction":
                xs = ()
            else:
                xs = (0.70,)
            for x in xs:
                bm_box(br_bm, (x, y, 0.012), (0.12, 0.045, 0.024))
                bm_box(br_bm, (x, y, 0.05), (0.045, 0.045, 0.08))
        if kind == "corner":
            for x in (-L_W * 0.48, L_W * 0.48):
                bm_box(br_bm, (x, 0.70, 0.012), (0.045, 0.12, 0.024))
        if kind == "junction":
            for x, y in ((0.70, 0.70), (0.70, -0.70), (-0.70, 0.70), (-0.70, -0.70)):
                bm_box(br_bm, (x, y, 0.012), (0.10, 0.10, 0.024))
                bm_box(br_bm, (x, y, 0.05), (0.04, 0.04, 0.08))

    objs = {}

    def emit(bm, role):
        if not bm.verts:
            bm.free()
            return None
        obj = finish_bmesh(f"{tag}_{role}", bm, collection, role)
        objs[role] = obj
        return obj

    emit(frame_bm, "frame")
    emit(roller_bm, "roller")
    belt = emit(belt_bm, "belt")
    emit(cover_bm, "cover")
    emit(hw_bm, "hardware")
    emit(br_bm, "bracket")
    lid = emit(lid_bm, "lid")
    if lid is not None:
        objs.pop("lid", None)
    return objs, belt, lid


def measure_ports(objs, family, kind):
    axes = PORT_BITS[kind]
    z_ref = P_CABLE_Z if family == "power" else L_ROLLER_Z
    report = []
    meshes = [o for o in objs.values() if o is not None and o.type == "MESH"]
    for axis in axes:
        origin = Vector(port_origin(axis))
        normal = Vector(port_normal(axis))
        ys, zs, xs = [], [], []
        for obj in meshes:
            mw = obj.matrix_world
            for vert in obj.data.vertices:
                w = mw @ vert.co
                along = (w - origin).dot(normal)
                if abs(along) > 0.045:
                    continue
                # plane coords
                if axis in ("+X", "-X"):
                    ys.append(w.y)
                    zs.append(w.z)
                else:
                    ys.append(w.x)
                    zs.append(w.z)
                xs.append(along)
        if not ys:
            report.append({"axis": axis, "ok": False, "reason": "no verts at port"})
            continue
        width = max(ys) - min(ys)
        height = max(zs) - min(zs)
        report.append({
            "axis": axis,
            "ok": True,
            "originBlender": list(origin),
            "originGltf": blender_to_gltf(origin),
            "normalBlender": list(normal),
            "width": round(width, 4),
            "height": round(height, 4),
            "zMin": round(min(zs), 4),
            "zMax": round(max(zs), 4),
            "zRef": z_ref,
        })
    return report


# ----- UV pack + atlas raster --------------------------------------------

def loop_uv_layer(obj):
    mesh = obj.data
    if not mesh.uv_layers:
        mesh.uv_layers.new(name="UVMap")
    return mesh.uv_layers.active


def unique_unwrap(obj):
    mesh = obj.data
    bm = bmesh.new()
    bm.from_mesh(mesh)
    uv = bm.loops.layers.uv.verify()
    bm.faces.ensure_lookup_table()
    # islands: coplanar connected faces
    n = len(bm.faces)
    parent = list(range(n))

    def find(i):
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i

    def union(a, b):
        ra, rb = find(a), find(b)
        if ra != rb:
            parent[rb] = ra

    edge_faces = defaultdict(list)
    for fi, face in enumerate(bm.faces):
        for edge in face.edges:
            edge_faces[edge.index].append(fi)
    for _e, flist in edge_faces.items():
        for i in range(len(flist)):
            for j in range(i + 1, len(flist)):
                a, b = bm.faces[flist[i]], bm.faces[flist[j]]
                if a.normal.length > 0 and b.normal.length > 0 and a.normal.dot(b.normal) > 0.92:
                    union(flist[i], flist[j])
    groups = defaultdict(list)
    for fi in range(n):
        groups[find(fi)].append(fi)

    islands = []
    for faces in groups.values():
        fn = sum((bm.faces[i].normal for i in faces), Vector((0, 0, 0)))
        if fn.length < 1e-8:
            fn = Vector((0, 0, 1))
        fn.normalize()
        if abs(fn.z) >= abs(fn.x) and abs(fn.z) >= abs(fn.y):
            au, av = Vector((1, 0, 0)), Vector((0, 1, 0))
        elif abs(fn.x) >= abs(fn.y):
            au, av = Vector((0, 1, 0)), Vector((0, 0, 1))
        else:
            au, av = Vector((1, 0, 0)), Vector((0, 0, 1))
        pts = []
        for fi in faces:
            for loop in bm.faces[fi].loops:
                p = loop.vert.co
                pts.append((p.dot(au), p.dot(av), loop))
        if not pts:
            continue
        us = [p[0] for p in pts]
        vs = [p[1] for p in pts]
        u0, v0 = min(us), min(vs)
        u1, v1 = max(us), max(vs)
        islands.append((u1 - u0, v1 - v0, u0, v0, pts, au, av))

    islands.sort(key=lambda it: -it[1])
    pad = 0.008
    shelf_x, shelf_y, shelf_h = pad, pad, 0.0
    max_u, max_v = 1.0, 1.0
    packed = []
    for w, h, u0, v0, pts, au, av in islands:
        w = max(w, 1e-4)
        h = max(h, 1e-4)
        # we'll place in local 0-1 later via object pack; store world-metre size
        packed.append((w, h, u0, v0, pts))

    # pack islands into 0-1 for this object
    # scale so total area fits
    area = sum(max(w, 1e-4) * max(h, 1e-4) for w, h, *_ in packed) or 1.0
    scale = min(1.0, 0.92 / math.sqrt(area) * 0.85)
    shelf_x = pad
    shelf_y = pad
    shelf_h = 0.0
    row_w = 1.0 - 2 * pad
    for w, h, u0, v0, pts in packed:
        pw, ph = w * scale + pad, h * scale + pad
        if shelf_x + pw > 1.0 - pad:
            shelf_y += shelf_h + pad
            shelf_x = pad
            shelf_h = 0.0
        for _u, _v, loop in pts:
            uu = shelf_x + (_u - u0) * scale
            vv = shelf_y + (_v - v0) * scale
            loop[uv].uv = (uu, vv)
        shelf_h = max(shelf_h, ph)
        shelf_x += pw
    bm.to_mesh(mesh)
    bm.free()
    mesh.update()


def object_uv_aabb(obj):
    uv = loop_uv_layer(obj)
    us, vs = [], []
    for item in uv.data:
        us.append(item.uv.x)
        vs.append(item.uv.y)
    if not us:
        return (0, 0, 1, 1)
    return (min(us), min(vs), max(us), max(vs))


def transform_uv(obj, a, b, c, d, u0, v0, u1, v1):
    """Map current AABB (a,b)-(c,d) onto (u0,v0)-(u1,v1)."""
    uv = loop_uv_layer(obj)
    sx = (u1 - u0) / max(1e-9, c - a)
    sy = (v1 - v0) / max(1e-9, d - b)
    for item in uv.data:
        item.uv = (u0 + (item.uv.x - a) * sx, v0 + (item.uv.y - b) * sy)


def pack_objects(objects, rect, padding_px=3):
    objects = [o for o in objects if o is not None and o.type == "MESH" and o.data.polygons]
    if not objects:
        return
    u0, v0, u1, v1 = rect
    pad = padding_px / float(ATLAS)
    boxes = []
    for obj in objects:
        unique_unwrap(obj)
        a, b, c, d = object_uv_aabb(obj)
        w = max(1e-4, c - a)
        h = max(1e-4, d - b)
        boxes.append((obj, a, b, c, d, w, h))
    boxes.sort(key=lambda it: -it[6])
    avail_w = (u1 - u0) - 2 * pad
    avail_h = (v1 - v0) - 2 * pad
    area = sum(w * h for *_rest, w, h in boxes) or 1.0
    scale = min(1.0, math.sqrt((avail_w * avail_h * 0.88) / area))
    x = u0 + pad
    y = v0 + pad
    row_h = 0.0
    for obj, a, b, c, d, w, h in boxes:
        pw, ph = w * scale, h * scale
        if x + pw > u1 - pad:
            y += row_h + pad
            x = u0 + pad
            row_h = 0.0
        x1 = min(u1 - pad, x + pw)
        y1 = min(v1 - pad, y + ph)
        transform_uv(obj, a, b, c, d, x, y, x1, y1)
        row_h = max(row_h, ph)
        x += pw + pad


def assign_belt_uv(obj, path_len):
    if obj is None:
        return
    uv = loop_uv_layer(obj)
    bu0, bv0, bu1, bv1 = BELT_TILE
    mesh = obj.data
    # construction: X/Y along run -> U, across -> V
    for poly in mesh.polygons:
        for li in poly.loop_indices:
            loop = mesh.loops[li]
            p = mesh.vertices[loop.vertex_index].co
            along = (p.x + HALF) if abs(p.x) >= abs(p.y) else (p.y + HALF)
            across = p.y if abs(p.x) >= abs(p.y) else p.x
            u = (along / max(0.2, path_len)) % 1.0
            v = 0.5 + across / max(0.2, L_BELT_W)
            v = min(1.0, max(0.0, v))
            uv.data[li].uv = (bu0 + u * (bu1 - bu0), bv0 + v * (bv1 - bv0))


def vertex_ao(obj):
    mesh = obj.data
    n = len(mesh.vertices)
    acc = [Vector((0, 0, 0)) for _ in range(n)]
    cnt = [0] * n
    for poly in mesh.polygons:
        nn = poly.normal
        for i in poly.vertices:
            acc[i] += nn
            cnt[i] += 1
    normals = []
    for i in range(n):
        v = acc[i] / cnt[i] if cnt[i] else Vector((0, 0, 1))
        if v.length > 1e-8:
            v.normalize()
        normals.append(v)
    neigh = [[] for _ in range(n)]
    for poly in mesh.polygons:
        vs = list(poly.vertices)
        for a, b in zip(vs, vs[1:] + vs[:1]):
            neigh[a].append(b)
    ao = []
    for i in range(n):
        p = mesh.vertices[i].co
        nrm = normals[i]
        cav = 0.0
        k = 0
        for j in neigh[i]:
            d = mesh.vertices[j].co - p
            if d.length < 1e-8:
                continue
            d.normalize()
            cav += max(0.0, -d.dot(nrm))
            k += 1
        c = cav / max(1, k)
        ao.append(max(0.25, min(1.0, 1.0 - 0.62 * c)))
    return ao, normals


def rasterize_family(objects, albedo, orm, nrm, id_buf=None):
    if not HAS_NP:
        raise RuntimeError("numpy required")
    size = albedo.shape[0]
    for obj in objects:
        if obj is None or obj.type != "MESH" or not obj.data.polygons:
            continue
        role = obj.get("spacefaceRole") or "hardware"
        spec = ROLE_SPEC.get(role, ROLE_SPEC["hardware"])
        base = spec["rgb"]
        id_col = ID_COLORS.get(role, (0.5, 0.5, 0.5))
        ao_v, n_v = vertex_ao(obj)
        mesh = obj.data
        uv = loop_uv_layer(obj)
        loops = mesh.loops
        for poly in mesh.polygons:
            idxs = list(poly.loop_indices)
            if len(idxs) < 3:
                continue
            for k in range(1, len(idxs) - 1):
                trip = (idxs[0], idxs[k], idxs[k + 1])
                uvs = []
                aos = []
                nrms = []
                cols = []
                for li in trip:
                    loop = loops[li]
                    vi = loop.vertex_index
                    u, v = uv.data[li].uv
                    uvs.append((u * (size - 1), v * (size - 1)))
                    aos.append(ao_v[vi])
                    nrms.append(n_v[vi])
                    cols.append(base)
                _fill_tri(albedo, orm, nrm, uvs, aos, nrms, cols, spec, role)
                if id_buf is not None:
                    _fill_id(id_buf, uvs, id_col)


def _fill_id(id_buf, uvs, col):
    (x0, y0), (x1, y1), (x2, y2) = uvs
    minx = max(0, int(math.floor(min(x0, x1, x2))))
    maxx = min(id_buf.shape[1] - 1, int(math.ceil(max(x0, x1, x2))))
    miny = max(0, int(math.floor(min(y0, y1, y2))))
    maxy = min(id_buf.shape[0] - 1, int(math.ceil(max(y0, y1, y2))))
    if maxx < minx or maxy < miny:
        return
    denom = (y1 - y2) * (x0 - x2) + (x2 - x1) * (y0 - y2)
    if abs(denom) < 1e-8:
        return
    xs = np.arange(minx, maxx + 1, dtype=np.float32) + 0.5
    ys = np.arange(miny, maxy + 1, dtype=np.float32) + 0.5
    px, py = np.meshgrid(xs, ys)
    w0 = ((y1 - y2) * (px - x2) + (x2 - x1) * (py - y2)) / denom
    w1 = ((y2 - y0) * (px - x2) + (x0 - x2) * (py - y2)) / denom
    w2 = 1.0 - w0 - w1
    mask = (w0 >= -0.01) & (w1 >= -0.01) & (w2 >= -0.01)
    if not np.any(mask):
        return
    ys, xs = slice(miny, maxy + 1), slice(minx, maxx + 1)
    id_buf[ys, xs, 0] = np.where(mask, col[0], id_buf[ys, xs, 0])
    id_buf[ys, xs, 1] = np.where(mask, col[1], id_buf[ys, xs, 1])
    id_buf[ys, xs, 2] = np.where(mask, col[2], id_buf[ys, xs, 2])
    id_buf[ys, xs, 3] = np.where(mask, 1.0, id_buf[ys, xs, 3])


def _fill_tri(albedo, orm, nrm, uvs, aos, nrms, cols, spec, role):
    (x0, y0), (x1, y1), (x2, y2) = uvs
    minx = max(0, int(math.floor(min(x0, x1, x2))))
    maxx = min(albedo.shape[1] - 1, int(math.ceil(max(x0, x1, x2))))
    miny = max(0, int(math.floor(min(y0, y1, y2))))
    maxy = min(albedo.shape[0] - 1, int(math.ceil(max(y0, y1, y2))))
    if maxx < minx or maxy < miny:
        return
    denom = (y1 - y2) * (x0 - x2) + (x2 - x1) * (y0 - y2)
    if abs(denom) < 1e-8:
        return
    xs = np.arange(minx, maxx + 1, dtype=np.float32) + 0.5
    ys = np.arange(miny, maxy + 1, dtype=np.float32) + 0.5
    px, py = np.meshgrid(xs, ys)
    w0 = ((y1 - y2) * (px - x2) + (x2 - x1) * (py - y2)) / denom
    w1 = ((y2 - y0) * (px - x2) + (x0 - x2) * (py - y2)) / denom
    w2 = 1.0 - w0 - w1
    mask = (w0 >= -0.01) & (w1 >= -0.01) & (w2 >= -0.01)
    if not np.any(mask):
        return
    ao = w0 * aos[0] + w1 * aos[1] + w2 * aos[2]
    r = (w0 * cols[0][0] + w1 * cols[1][0] + w2 * cols[2][0]) * (0.55 + 0.45 * ao)
    g = (w0 * cols[0][1] + w1 * cols[1][1] + w2 * cols[2][1]) * (0.55 + 0.45 * ao)
    b = (w0 * cols[0][2] + w1 * cols[1][2] + w2 * cols[2][2]) * (0.55 + 0.45 * ao)
    fx = px / float(albedo.shape[1])
    fy = py / float(albedo.shape[0])
    if role == "jacket":
        stripe = 0.04 * np.sin(fx * 80.0)
        r = np.clip(r * (1.0 + stripe), 0, 1)
        g = np.clip(g * (1.0 + stripe * 0.6), 0, 1)
    elif role == "armour":
        band = 0.06 * ((np.floor(fy * 64.0) % 4) == 0).astype(np.float32)
        r = np.clip(r + band, 0, 1)
        g = np.clip(g + band, 0, 1)
        b = np.clip(b + band * 0.8, 0, 1)
    elif role == "roller":
        hoop = 0.05 * np.sin(fy * 90.0)
        r = np.clip(r * (1.0 + hoop), 0, 1)
        g = np.clip(g * (1.0 + hoop * 0.6), 0, 1)
        b = np.clip(b * (1.0 + hoop * 0.4), 0, 1)
    elif role == "cover":
        glass = 0.04 * np.sin(fx * 18.0)
        r = np.clip(r * 0.92 + 0.03 + glass, 0, 1)
        g = np.clip(g * 0.95 + 0.04 + glass, 0, 1)
        b = np.clip(b * 1.02 + 0.05, 0, 1)
    elif role == "belt":
        cleat = 0.08 * ((np.floor(fx * 48.0) % 6) == 0).astype(np.float32)
        r = np.clip(r - cleat, 0, 1)
        g = np.clip(g - cleat, 0, 1)
        b = np.clip(b - cleat, 0, 1)
    elif role in ("tray", "frame"):
        mill = 0.03 * np.sin(fx * 30.0 + fy * 2.0)
        r = np.clip(r + mill, 0, 1)
    emit = spec["emit"] * ao
    ys, xs = slice(miny, maxy + 1), slice(minx, maxx + 1)
    albedo[ys, xs, 0] = np.where(mask, np.clip(r, 0, 1), albedo[ys, xs, 0])
    albedo[ys, xs, 1] = np.where(mask, np.clip(g, 0, 1), albedo[ys, xs, 1])
    albedo[ys, xs, 2] = np.where(mask, np.clip(b, 0, 1), albedo[ys, xs, 2])
    albedo[ys, xs, 3] = np.where(mask, emit, albedo[ys, xs, 3])
    orm[ys, xs, 0] = np.where(mask, ao, orm[ys, xs, 0])
    orm[ys, xs, 1] = np.where(mask, np.clip(spec["rough"] + (1.0 - ao) * 0.18, 0, 0.95), orm[ys, xs, 1])
    orm[ys, xs, 2] = np.where(mask, spec["metal"] * (0.85 + 0.15 * ao), orm[ys, xs, 2])
    orm[ys, xs, 3] = np.where(mask, 1.0, orm[ys, xs, 3])
    nx = np.clip(0.5 + 0.18 * (0.5 - ao) * np.sin(fx * 40.0), 0, 1)
    ny = np.clip(0.5 + 0.18 * (0.5 - ao) * np.cos(fy * 40.0), 0, 1)
    nrm[ys, xs, 0] = np.where(mask, nx, nrm[ys, xs, 0])
    nrm[ys, xs, 1] = np.where(mask, ny, nrm[ys, xs, 1])
    nrm[ys, xs, 2] = np.where(mask, 1.0, nrm[ys, xs, 2])
    nrm[ys, xs, 3] = np.where(mask, 1.0, nrm[ys, xs, 3])


def paint_belt_strip(albedo, orm, nrm):
    u0, v0, u1, v1 = BELT_TILE
    size = albedo.shape[0]
    x0, x1 = int(u0 * size), int(u1 * size)
    y0, y1 = int(v0 * size), int(v1 * size)
    spec = ROLE_SPEC["belt"]
    for y in range(y0, y1):
        for x in range(x0, x1):
            fx = (x - x0) / max(1, x1 - x0)
            fy = (y - y0) / max(1, y1 - y0)
            cleat = 0.22 if (int(fx * 16) % 4 == 0) else 0.0
            groove = 0.10 * (1.0 if int(fy * 8) in (0, 7) else 0.0)
            r = spec["rgb"][0] * (1.0 - cleat) + groove
            g = spec["rgb"][1] * (1.0 - cleat) + groove
            b = spec["rgb"][2] * (1.0 - cleat) + groove
            albedo[y, x, 0:3] = (r, g, b)
            albedo[y, x, 3] = 0.0
            orm[y, x] = (0.85, spec["rough"], spec["metal"], 1.0)
            nrm[y, x] = (0.5, 0.5 + 0.15 * cleat, 1.0, 1.0)


def write_pixels(name, pixels, size, colorspace="sRGB"):
    if name in bpy.data.images:
        bpy.data.images.remove(bpy.data.images[name])
    img = bpy.data.images.new(name, width=size, height=size, alpha=True)
    img.colorspace_settings.name = colorspace
    img.pixels.foreach_set(np.ascontiguousarray(pixels, dtype=np.float32).ravel())
    TEX_DIR.mkdir(parents=True, exist_ok=True)
    path = TEX_DIR / f"{name}.png"
    tmp = TEX_DIR / f"{name}.png.tmp"
    img.filepath_raw = str(tmp)
    img.file_format = "PNG"
    img.save()
    img.pack()
    img.filepath_raw = ""
    tmp.replace(path)
    sanitize_png(path)
    return img, path


def principled(mat):
    mat.use_nodes = True
    mat.node_tree.nodes.clear()
    out = mat.node_tree.nodes.new("ShaderNodeOutputMaterial")
    bsdf = mat.node_tree.nodes.new("ShaderNodeBsdfPrincipled")
    mat.node_tree.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])
    return bsdf


def wire_atlas(mat, bsdf, maps):
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    uv0 = nodes.new("ShaderNodeUVMap")
    uv0.uv_map = "UVMap"
    tex_a = nodes.new("ShaderNodeTexImage")
    tex_a.image = maps[0]
    tex_o = nodes.new("ShaderNodeTexImage")
    tex_o.image = maps[1]
    tex_n = nodes.new("ShaderNodeTexImage")
    tex_n.image = maps[2]
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
    emit_col = "Emission Color" if "Emission Color" in bsdf.inputs else "Emission"
    if emit_col in bsdf.inputs:
        links.new(tex_a.outputs["Color"], bsdf.inputs[emit_col])
    if "Emission Strength" in bsdf.inputs:
        links.new(tex_a.outputs["Alpha"], bsdf.inputs["Emission Strength"])
    try:
        mat.blend_method = "OPAQUE"
    except TypeError:
        pass


def make_atlas_material(family, maps):
    mat = bpy.data.materials.new(f"ConduitAtlas_{family}")
    bsdf = principled(mat)
    wire_atlas(mat, bsdf, maps)
    mat["spacefaceRole"] = "atlas"
    return mat


def assign_atlas(obj, mat):
    if obj is None or obj.type != "MESH":
        return
    obj.data.materials.clear()
    obj.data.materials.append(mat)


# ----- piece assemble / export -------------------------------------------

def stamp_socket(obj, role):
    obj["spacefaceSocket"] = True
    obj["spaceface.socket"] = True
    obj["socket"] = True
    obj["spaceface"] = {"socket": True, "role": role}


def reparent(obj, parent):
    mw = obj.matrix_world.copy()
    obj.parent = parent
    obj.matrix_parent_inverse = parent.matrix_world.inverted()
    obj.matrix_world = mw


def piece_contract(family, kind, lod_tri, ports):
    aid = asset_id(family, kind)
    hook = "powered" if family == "power" else "flow_mesh"
    return {
        "contractVersion": 1,
        "assetId": aid,
        "partId": aid,
        "liveId": aid,
        "slot": "place",
        "category": "works",
        "family": family,
        "kind": kind,
        "packet": PACKET,
        "cycle": CYCLE,
        "role": "armoured power tray" if family == "power" else "roller material lane",
        "forward": "+X",
        "up": "+Y",
        "starboard": "+Z",
        "unit": "metre",
        "normalConvention": "OpenGL",
        "ormChannels": "R=AO,G=Roughness,B=Metallic",
        "textureCompression": "PNG-source",
        "textureSize": ATLAS,
        "deliverableRole": "production_multi_lod",
        "lods": ["lod0", "lod1", "lod2"],
        "exportedLods": ["lod0", "lod1", "lod2"],
        "lodTriangles": {
            "lod0": int(lod_tri[0]),
            "lod1": int(lod_tri[1]),
            "lod2": int(lod_tri[2]),
        },
        "hooks": [hook],
        "ports": ports,
        "portConvention": "+X primary, +Y branch, cell half-extent 1.1 wu, +Z away from mount",
        "cellWu": CELL,
        "blenderBasis": "Z-up works scale",
        "exportBasis": "Y-up glTF",
        "wiringStatus": "source_candidate_unwired",
    }


def stamp_glb(path: Path, contract: dict, hook: str) -> None:
    gltf, rest = read_glb(path)
    extras = dict((gltf.get("asset") or {}).get("extras") or {})
    extras["assetId"] = contract["assetId"]
    extras["partId"] = contract["assetId"]
    extras["spacefaceAsset"] = contract
    gltf.setdefault("asset", {})["extras"] = extras
    scenes = gltf.get("scenes") or []
    if scenes:
        se = dict(scenes[0].get("extras") or {})
        se["spacefaceAsset"] = contract
        scenes[0]["extras"] = se
    nodes = gltf.get("nodes") or []
    root = None
    for node in nodes:
        if node.get("name") == contract["assetId"]:
            root = node
            break
    if root is None and nodes:
        root = max(nodes, key=lambda n: len(n.get("children") or []))
        root["name"] = contract["assetId"]
    if root is not None:
        ne = dict(root.get("extras") or {})
        ne["spacefaceAsset"] = contract
        ne["family"] = contract["family"]
        ne["kind"] = contract["kind"]
        ne["ports"] = contract["ports"]
        root["extras"] = ne
    for node in nodes:
        name = node.get("name") or ""
        if name in {hook, "service_lid"} and node.get("mesh") is None:
            ex = dict(node.get("extras") or {})
            ex["spacefaceSocket"] = True
            ex["socket"] = True
            ex["spaceface"] = {"socket": True, "role": "works_hook"}
            node["extras"] = ex
        if name.startswith("LOD") and "_" in name:
            ex = dict(node.get("extras") or {})
            lod = name.split("_", 1)[0].lower()
            ex["spacefaceLod"] = lod
            sp = dict(ex.get("spaceface") or {})
            sp["lod"] = lod
            if hook in name:
                sp["hook"] = hook
            ex["spaceface"] = sp
            node["extras"] = ex
        if name.startswith(hook + ".") or name == hook:
            ex = dict(node.get("extras") or {})
            ex["spacefaceSocket"] = True
            ex["socket"] = True
            ex["spaceface"] = {"socket": True, "role": "works_hook"}
            node["extras"] = ex
            node["name"] = hook
    write_glb(path, gltf, rest)


def export_hierarchy(root, path: Path, family=None, kind=None):
    path.parent.mkdir(parents=True, exist_ok=True)
    if family and kind:
        apply_canonical_names(root, family, kind, canonical=True)
    bpy.ops.object.select_all(action="DESELECT")
    for node in descendants(root):
        try:
            node.hide_set(False)
            node.hide_viewport = False
            node.hide_render = False
            node.select_set(True)
            if node.type == "MESH" and node.data:
                node.data.name = node.name
        except Exception:
            pass
    bpy.context.view_layer.objects.active = root
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
    if family and kind:
        apply_canonical_names(root, family, kind, canonical=False)
    return path


def assemble_piece(family, kind, lod_objs, hook_objs, collection, atlas_mat, lid_objs=None):
    aid = asset_id(family, kind)
    hook_name = "powered" if family == "power" else "flow_mesh"
    suffix = unique_suffix(family, kind)
    root = add_empty(aid, (0, 0, 0), collection, size=0.12)
    type_root = add_empty(type_root_name(family, kind), (0, 0, 0), collection, parent=root, size=0.08)
    hook = add_empty(hook_name + suffix, (0, 0, 0), collection, parent=type_root, size=0.05)
    stamp_socket(hook, "works_hook")
    lid_empty = None
    if kind == "junction":
        lid_empty = add_empty("service_lid" + suffix, (0, 0, 0.250), collection, parent=type_root, size=0.05)
        stamp_socket(lid_empty, "works_hook")

    lod_tri = {0: 0, 1: 0, 2: 0}
    static_all = []
    lid_objs = lid_objs or {}
    for lod in (0, 1, 2):
        objs = lod_objs[lod]
        hook_obj = hook_objs[lod]
        lid_obj = lid_objs.get(lod)
        static = [o for k, o in objs.items() if o is not None and o != hook_obj and o != lid_obj]
        for obj in static:
            assign_atlas(obj, atlas_mat)
        if hook_obj is not None:
            assign_atlas(hook_obj, atlas_mat)
        if lid_obj is not None:
            assign_atlas(lid_obj, atlas_mat)
        merged = join_named(static, f"LOD{lod}_Merged_Material_Atlas{suffix}")
        if merged is not None:
            merged["spacefaceLod"] = f"lod{lod}"
            reparent(merged, type_root)
            lod_tri[lod] += tri_count(merged)
            static_all.append(merged)
        if hook_obj is not None:
            hook_obj.name = f"LOD{lod}_{hook_name}{suffix}"
            if hook_obj.data:
                hook_obj.data.name = hook_obj.name
            triangulate_object(hook_obj)
            hook_obj["spacefaceLod"] = f"lod{lod}"
            reparent(hook_obj, hook)
            lod_tri[lod] += tri_count(hook_obj)
            if lod == 0:
                hook.location = hook_obj.matrix_world.translation.copy()
        if lid_obj is not None and lid_empty is not None:
            lid_obj.name = f"LOD{lod}_service_lid{suffix}"
            if lid_obj.data:
                lid_obj.data.name = lid_obj.name
            triangulate_object(lid_obj)
            lid_obj["spacefaceLod"] = f"lod{lod}"
            reparent(lid_obj, lid_empty)
            lod_tri[lod] += tri_count(lid_obj)
    port_meshes = {}
    for ob in list(type_root.children) + list(hook.children):
        if ob.type == "MESH":
            port_meshes[ob.name] = ob
    ports = measure_ports(port_meshes, family, kind)
    contract = piece_contract(family, kind, lod_tri, ports)
    root["spacefaceAsset"] = contract
    type_root["family"] = family
    type_root["kind"] = kind
    type_root["ports"] = ports
    return root, contract, lod_tri


# ----- evidence ----------------------------------------------------------

def look_at(obj, target=(0, 0, 0)):
    obj.rotation_euler = (Vector(target) - obj.location).to_track_quat("-Z", "Y").to_euler()


def setup_works_world(pad_size=8.0):
    from spaceface_works_camera import apply_works_camera
    scene = bpy.context.scene
    try:
        scene.render.engine = "BLENDER_EEVEE_NEXT"
    except TypeError:
        scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 1920
    scene.render.resolution_y = 1080
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
    scene.view_settings.exposure = 0.05
    if hasattr(scene, "eevee"):
        try:
            scene.eevee.taa_render_samples = 16
        except Exception:
            pass
        try:
            scene.eevee.use_shadows = True
        except Exception:
            pass
    world = scene.world or bpy.data.worlds.new("WorksWorld")
    scene.world = world
    world.use_nodes = True
    bg = world.node_tree.nodes.get("Background")
    if bg:
        bg.inputs["Color"].default_value = (0.07, 0.055, 0.042, 1)
        bg.inputs["Strength"].default_value = 0.85
    bpy.ops.mesh.primitive_plane_add(size=pad_size, location=(0, 0, -0.002))
    pad = bpy.context.object
    pad.name = "MinePad"
    pad_mat = bpy.data.materials.new("MinePadMat")
    pad_mat.use_nodes = True
    bsdf = next(n for n in pad_mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    bsdf.inputs["Base Color"].default_value = (0.07, 0.055, 0.042, 1)
    bsdf.inputs["Roughness"].default_value = 0.86
    pad.data.materials.append(pad_mat)
    cam_data = bpy.data.cameras.new("WorksCam")
    camera = bpy.data.objects.new("WorksCam", cam_data)
    scene.collection.objects.link(camera)
    scene.camera = camera
    reach = 4.0
    for name, loc, energy, color, angle in (
        ("Key", (-1.15 * reach, -0.78 * reach, 0.54 * reach), 6.4, (1.00, 0.90, 0.78), 18.0),
        ("Rim", (0.22 * reach, 1.45 * reach, 0.30 * reach), 1.35, (0.78, 0.74, 0.68), 25.0),
        ("Fill", (1.12 * reach, 0.46 * reach, 0.50 * reach), 2.2, (0.86, 0.80, 0.72), 30.0),
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
        look_at(obj, (0, 0, 0.12))
        if name == "Key":
            data.use_shadow = True
    apply_works_camera(camera, framing="works_top")
    return camera, pad


def clay_material():
    mat = bpy.data.materials.new("Clay")
    bsdf = principled(mat)
    bsdf.inputs["Base Color"].default_value = (0.42, 0.41, 0.39, 1)
    bsdf.inputs["Roughness"].default_value = 0.62
    bsdf.inputs["Metallic"].default_value = 0.0
    if "Emission Strength" in bsdf.inputs:
        bsdf.inputs["Emission Strength"].default_value = 0.0
    return mat


def emit_uv_material(maps, channel):
    mat = bpy.data.materials.new(f"Diag_{channel}")
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    emit = nt.nodes.new("ShaderNodeEmission")
    tex = nt.nodes.new("ShaderNodeTexImage")
    uv = nt.nodes.new("ShaderNodeUVMap")
    uv.uv_map = "UVMap"
    nt.links.new(uv.outputs["UV"], tex.inputs["Vector"])
    if channel == "normal":
        tex.image = maps[2]
        nt.links.new(tex.outputs["Color"], emit.inputs["Color"])
    elif channel == "orm":
        tex.image = maps[1]
        nt.links.new(tex.outputs["Color"], emit.inputs["Color"])
    elif channel == "id":
        tex.image = maps[0]
        nt.links.new(tex.outputs["Color"], emit.inputs["Color"])
    else:
        tex.image = maps[0]
        nt.links.new(tex.outputs["Color"], emit.inputs["Color"])
    emit.inputs["Strength"].default_value = 1.0
    nt.links.new(emit.outputs["Emission"], out.inputs["Surface"])
    return mat


def override_mats(objects, mat):
    backups = {}
    for obj in objects:
        if obj.type != "MESH":
            continue
        backups[obj.name] = [slot.material for slot in obj.material_slots]
        if obj.material_slots:
            obj.material_slots[0].material = mat
        else:
            obj.data.materials.append(mat)
    return backups


def restore_mats(objects, backups):
    for obj in objects:
        mats = backups.get(obj.name)
        if not mats:
            continue
        if obj.material_slots:
            obj.material_slots[0].material = mats[0]


def iter_meshes(root):
    out = []
    stack = [root]
    while stack:
        n = stack.pop()
        if n.type == "MESH":
            out.append(n)
        stack.extend(list(n.children))
    return out


def render_framing(camera, path, framing, target, focus=(0, 0, 0), edge_dir=(1.0, 0.0)):
    from spaceface_works_camera import render_works_still
    return render_works_still(
        camera, path, framing=framing, focus=focus, target=target, edge_dir=edge_dir,
    )


def load_power_atlas_images():
    maps = []
    colorspaces = ("sRGB", "Non-Color", "Non-Color")
    names = ("power_atlas_basecolor", "power_atlas_orm", "power_atlas_normal")
    for name, cs in zip(names, colorspaces):
        path = TEX_DIR / f"{name}.png"
        if name in bpy.data.images:
            bpy.data.images.remove(bpy.data.images[name])
        img = bpy.data.images.load(str(path))
        img.name = name
        img.colorspace_settings.name = cs
        maps.append(img)
    return tuple(maps)


def frozen_power_piece(kind):
    path = PARTS / f"{asset_id('power', kind)}.glb"
    gltf, _rest = read_glb(path)
    extras = (gltf.get("asset") or {}).get("extras") or {}
    contract = extras.get("spacefaceAsset") or {}
    return {
        "id": asset_id("power", kind),
        "family": "power",
        "kind": kind,
        "lodTriangles": contract.get("lodTriangles") or {},
        "ports": contract.get("ports") or [],
        "hooks": contract.get("hooks") or ["powered"],
        "path": str(path.relative_to(ROOT)).replace("\\", "/"),
        "sha256": sha256(path),
        "bytes": path.stat().st_size,
        "frozen": True,
        "freezeCycle": POWER_CYCLE,
    }


def import_frozen_power_root(kind, collection):
    path = PARTS / f"{asset_id('power', kind)}.glb"
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=str(path))
    imported = [o for o in bpy.data.objects if o not in before]
    imported_set = set(imported)
    roots = [o for o in imported if o.parent not in imported_set]
    aid = asset_id("power", kind)
    root = None
    for obj in imported:
        if obj.name == aid or obj.name.startswith(aid):
            root = obj
            break
    if root is None and roots:
        root = roots[0]
        root.name = aid
    if root is None:
        root = add_empty(aid, (0, 0, 0), collection, size=0.12)
        for obj in imported:
            reparent(obj, root)
    for obj in imported:
        try:
            link_obj(obj, collection)
        except Exception:
            pass
    return root


def assert_power_frozen():
    errors = []
    for kind in KINDS:
        aid = asset_id("power", kind)
        for folder in (PARTS, SOURCE):
            path = folder / f"{aid}.glb"
            digest = sha256(path)
            want = POWER_CYCLE01_HASHES[aid]
            if digest != want:
                errors.append(f"power cycle01 hash {path}: {digest} != {want}")
    for name, want in (
        ("power_atlas_basecolor.png", POWER_CYCLE01_HASHES["power_atlas_basecolor.png"]),
        ("power_atlas_orm.png", POWER_CYCLE01_HASHES["power_atlas_orm.png"]),
        ("power_atlas_normal.png", POWER_CYCLE01_HASHES["power_atlas_normal.png"]),
    ):
        path = TEX_DIR / name
        digest = sha256(path)
        if digest != want:
            errors.append(f"power atlas freeze broken {path}: {digest} != {want}")
    return errors


# ----- main build --------------------------------------------------------

def _blank_maps():
    albedo = np.zeros((ATLAS, ATLAS, 4), dtype=np.float32)
    orm = np.zeros((ATLAS, ATLAS, 4), dtype=np.float32)
    nrm = np.zeros((ATLAS, ATLAS, 4), dtype=np.float32)
    idb = np.zeros((ATLAS, ATLAS, 4), dtype=np.float32)
    nrm[..., 0] = 0.5
    nrm[..., 1] = 0.5
    nrm[..., 2] = 1.0
    nrm[..., 3] = 1.0
    orm[..., 0] = 1.0
    orm[..., 1] = 0.5
    orm[..., 2] = 0.0
    orm[..., 3] = 1.0
    albedo[..., 0:3] = 0.12
    albedo[..., 3] = 0.0
    return albedo, orm, nrm, idb


def producer_binding():
    blender_ver = "unknown"
    blender_hash = None
    if IN_BLENDER:
        blender_ver = bpy.app.version_string
    if BLENDER_EXE.exists():
        blender_hash = sha256(BLENDER_EXE)
    return {
        "packet": PACKET,
        "cycle": CYCLE,
        "builder": {
            "path": str((TOOLS / "build_works_conduit_kit.py").relative_to(ROOT)).replace("\\", "/"),
            "sha256": sha256(TOOLS / "build_works_conduit_kit.py"),
        },
        "camera": {
            "path": str(CAMERA_PY.relative_to(ROOT)).replace("\\", "/"),
            "sha256": sha256(CAMERA_PY) if CAMERA_PY.exists() else None,
        },
        "blender": {
            "version": blender_ver,
            "exe": str(BLENDER_EXE) if BLENDER_EXE.exists() else None,
            "sha256": blender_hash,
        },
    }


def build_all(skip_evidence=False):
    if not IN_BLENDER:
        raise SystemExit("builder must run inside Blender 5.1")
    if not HAS_NP:
        raise SystemExit("numpy is required")

    SOURCE.mkdir(parents=True, exist_ok=True)
    TEX_DIR.mkdir(parents=True, exist_ok=True)
    EVIDENCE.mkdir(parents=True, exist_ok=True)
    DIAG.mkdir(parents=True, exist_ok=True)
    PARTS.mkdir(parents=True, exist_ok=True)

    reset_scene()
    kit_coll = bpy.data.collections.new("CONDUIT_KIT")
    bpy.context.scene.collection.children.link(kit_coll)

    atlas_maps = {}
    atlas_mats = {}
    atlas_paths = {}
    id_maps = {}
    built = {}
    roots = []

    inventory = {
        "packet": PACKET,
        "cycle": CYCLE,
        "cellWu": CELL,
        "note": "Cycle 03 construction correction. Both families rebuilt. Not wired, not released.",
        "pieces": [],
        "atlases": {},
        "master": {},
        "producer": producer_binding(),
    }

    for family in FAMILIES:
        family_static = {0: [], 1: [], 2: []}
        family_hooks = {0: [], 1: [], 2: []}
        family_lids = {0: [], 1: [], 2: []}
        built[family] = {}
        for kind in KINDS:
            coll = bpy.data.collections.new(asset_id(family, kind))
            kit_coll.children.link(coll)
            lod_objs = {}
            hook_objs = {}
            lid_objs = {}
            for lod in (0, 1, 2):
                tag = f"{family}_{kind}_L{lod}"
                if family == "power":
                    objs, hook, lid = build_power(kind, lod, coll, tag)
                else:
                    objs, hook, lid = build_lane(kind, lod, coll, tag)
                lod_objs[lod] = objs
                hook_objs[lod] = hook
                lid_objs[lod] = lid
                for o in objs.values():
                    if o is None:
                        continue
                    family_static[lod].append(o)
                if hook is not None:
                    family_hooks[lod].append(hook)
                if lid is not None:
                    family_lids[lod].append(lid)
                    family_static[lod].append(lid)
            built[family][kind] = {
                "coll": coll, "lod_objs": lod_objs, "hook_objs": hook_objs, "lid_objs": lid_objs,
            }

        albedo, orm, nrm, idb = _blank_maps()
        if family == "lane":
            paint_belt_strip(albedo, orm, nrm)
            for obj in family_hooks[0] + family_hooks[1] + family_hooks[2]:
                assign_belt_uv(obj, CELL)
        for lod, rect_v in LOD_BANDS.items():
            rect = (0.0, rect_v[0], 1.0, min(rect_v[1], BELT_TILE[1] - 0.005) if lod == 2 else rect_v[1])
            to_pack = family_static[lod] + family_lids[lod]
            if family == "power":
                to_pack = to_pack + family_hooks[lod]
            pack_objects(to_pack, rect)
            rasterize_family(family_static[lod], albedo, orm, nrm, id_buf=idb)
            rasterize_family(family_hooks[lod], albedo, orm, nrm, id_buf=idb)
            rasterize_family(family_lids[lod], albedo, orm, nrm, id_buf=idb)
        np.clip(albedo, 0, 1, out=albedo)
        np.clip(orm, 0, 1, out=orm)
        np.clip(nrm, 0, 1, out=nrm)
        img_a, p_a = write_pixels(f"{family}_atlas_basecolor", albedo, ATLAS, "sRGB")
        img_o, p_o = write_pixels(f"{family}_atlas_orm", orm, ATLAS, "Non-Color")
        img_n, p_n = write_pixels(f"{family}_atlas_normal", nrm, ATLAS, "Non-Color")
        img_id, p_id = write_pixels(f"{family}_atlas_id", idb, ATLAS, "sRGB")
        atlas_maps[family] = (img_a, img_o, img_n)
        id_maps[family] = img_id
        atlas_mats[family] = make_atlas_material(family, atlas_maps[family])
        atlas_paths[family] = [p_a, p_o, p_n]
        inventory["atlases"][family] = [
            {"path": str(p.relative_to(ROOT)).replace("\\", "/"), "sha256": sha256(p)}
            for p in atlas_paths[family]
        ]
        inventory["atlases"][family].append({
            "path": str(p_id.relative_to(ROOT)).replace("\\", "/"),
            "sha256": sha256(p_id),
            "role": "material_id_diagnostic",
        })

        row = 0.55 if family == "power" else -0.55
        hook_name = "powered" if family == "power" else "flow_mesh"
        for kind in KINDS:
            rec = built[family][kind]
            root, contract, lod_tri = assemble_piece(
                family, kind, rec["lod_objs"], rec["hook_objs"], rec["coll"],
                atlas_mats[family], lid_objs=rec["lid_objs"],
            )
            col = KINDS.index(kind)
            root.location = Vector(((col - 2.5) * CELL, row * CELL * 1.2, 0.0))
            roots.append(root)
            glb_path = PARTS / f"{asset_id(family, kind)}.glb"
            src_path = SOURCE / f"{asset_id(family, kind)}.glb"
            stored = root.location.copy()
            root.location = Vector((0, 0, 0))
            bpy.context.view_layer.update()
            export_hierarchy(root, glb_path, family=family, kind=kind)
            stamp_glb(glb_path, contract, hook_name)
            shutil.copy2(glb_path, src_path)
            root.location = stored
            inventory["pieces"].append({
                "id": asset_id(family, kind),
                "family": family,
                "kind": kind,
                "lodTriangles": contract["lodTriangles"],
                "ports": contract["ports"],
                "hooks": contract["hooks"],
                "path": str(glb_path.relative_to(ROOT)).replace("\\", "/"),
                "sha256": sha256(glb_path),
                "bytes": glb_path.stat().st_size,
            })

    master_glb = SOURCE / "works_conduit_kit.glb"
    bpy.ops.object.select_all(action="DESELECT")
    for root in roots:
        stack = [root]
        while stack:
            n = stack.pop()
            n.hide_set(False)
            n.select_set(True)
            stack.extend(list(n.children))
    tmp = SOURCE / "works_conduit_kit.tmp.glb"
    bpy.ops.export_scene.gltf(
        filepath=str(tmp), export_format="GLB", use_selection=True, export_apply=True,
        export_yup=True, export_extras=True, export_animations=False,
        export_materials="EXPORT", export_texcoords=True, export_normals=True,
        export_tangents=True, export_image_format="AUTO",
    )
    if master_glb.exists():
        master_glb.unlink()
    shutil.move(str(tmp), str(master_glb))
    blend_path = SOURCE / "works_conduit_kit.blend"
    bpy.ops.wm.save_as_mainfile(filepath=str(blend_path))
    inventory["master"] = {
        "glb": str(master_glb.relative_to(ROOT)).replace("\\", "/"),
        "blend": str(blend_path.relative_to(ROOT)).replace("\\", "/"),
        "sha256": sha256(master_glb),
        "bytes": master_glb.stat().st_size,
        "blendSha256": sha256(blend_path) if blend_path.exists() else None,
    }
    dump_json(KIT / "INVENTORY.json", inventory)

    if not skip_evidence:
        render_evidence(roots, atlas_maps, inventory, id_maps=id_maps)

    return inventory


def set_lod_visibility(root, keep):
    """Evidence cameras must show one LOD. Stacking LOD0+1+2 fills T/cross hollows."""
    token = f"LOD{keep}_"
    for obj in descendants(root):
        name = obj.name or ""
        if "LOD" not in name or obj.type != "MESH":
            continue
        show = token in name
        obj.hide_set(not show)
        obj.hide_render = not show


def hide_all_roots(roots, except_root=None):
    for root in roots:
        vis = root is except_root or except_root is None
        stack = [root]
        while stack:
            n = stack.pop()
            n.hide_set(not vis)
            n.hide_render = not vis
            stack.extend(list(n.children))


def piece_root(roots, family, kind):
    aid = asset_id(family, kind)
    for root in roots:
        if root.name == aid:
            return root
    return None


def crop_png_center(src: Path, dst: Path, cw, ch, center=(0.5, 0.5)):
    img = bpy.data.images.load(str(src))
    w, h = img.size
    cw = min(int(cw), w)
    ch = min(int(ch), h)
    cx = max(0.0, min(1.0, float(center[0]))) * w
    cy = max(0.0, min(1.0, float(center[1]))) * h
    x0 = max(0, min(w - cw, int(round(cx - cw / 2))))
    y0 = max(0, min(h - ch, int(round(cy - ch / 2))))
    pixels = list(img.pixels)
    out = bpy.data.images.new(dst.stem, width=cw, height=ch, alpha=True)
    buf = [0.0] * (cw * ch * 4)
    for y in range(ch):
        src_y = y0 + y
        src_off = src_y * w * 4 + x0 * 4
        dst_off = y * cw * 4
        buf[dst_off:dst_off + cw * 4] = pixels[src_off:src_off + cw * 4]
    out.pixels.foreach_set(buf)
    dst.parent.mkdir(parents=True, exist_ok=True)
    tmp = dst.with_suffix(".png.tmp")
    out.filepath_raw = str(tmp)
    out.file_format = "PNG"
    out.save()
    tmp.replace(dst)
    sanitize_png(dst)
    bpy.data.images.remove(out)
    bpy.data.images.remove(img)


def _show_pair(roots, a, b):
    visible = {a, b}
    for r in roots:
        vis = r in visible
        stack = [r]
        while stack:
            n = stack.pop()
            n.hide_set(not vis)
            n.hide_render = not vis
            stack.extend(list(n.children))
    for extra in visible:
        if extra not in roots:
            stack = [extra]
            while stack:
                n = stack.pop()
                n.hide_set(False)
                n.hide_render = False
                stack.extend(list(n.children))


def duplicate_hierarchy(root):
    bpy.ops.object.select_all(action="DESELECT")
    for node in descendants(root):
        try:
            node.hide_set(False)
            node.select_set(True)
        except Exception:
            pass
    bpy.context.view_layer.objects.active = root
    bpy.ops.object.duplicate()
    return bpy.context.view_layer.objects.active


def render_join(camera, pad, stills, name, a, b, b_loc, b_rot, focus):
    from spaceface_works_camera import render_works_still
    stored_a = a.location.copy()
    stored_b = b.location.copy()
    stored_br = tuple(b.rotation_euler)
    a.location = Vector((0, 0, 0))
    b.location = Vector(b_loc)
    b.rotation_euler = b_rot
    set_lod_visibility(a, 0)
    set_lod_visibility(b, 0)
    bpy.context.view_layer.update()
    meshes = [m for m in iter_meshes(a) + iter_meshes(b) if not m.hide_render]
    for framing in ("works_top", "works_edge"):
        path = EVIDENCE / f"{name}_{framing}.png"
        render_works_still(
            camera, path, framing=framing, focus=focus,
            target=meshes + [pad], edge_dir=(1.0, 0.2),
        )
        sanitize_png(path)
        stills.append({"name": path.name, "sha256": sha256(path), "bytes": path.stat().st_size})
    a.location = stored_a
    b.location = stored_b
    b.rotation_euler = stored_br


def render_evidence(roots, atlas_maps, inventory, id_maps=None):
    from spaceface_works_camera import render_works_still
    if not EVIDENCE_C01.exists():
        raise SystemExit("Cycle 01 evidence missing; refuse to continue")
    EVIDENCE.mkdir(parents=True, exist_ok=True)
    DIAG.mkdir(parents=True, exist_ok=True)
    crops = EVIDENCE / "crops"
    crops.mkdir(parents=True, exist_ok=True)
    camera, pad = setup_works_world(pad_size=64.0)
    id_maps = id_maps or {}
    stills = []

    hide_all_roots(roots, except_root=None)
    for framing, name, lod in (
        ("works_top", "kit_sheet_works_top.png", 0),
        ("works_site", "kit_sheet_works_site.png", 1),
        ("works_top", "family_lineup_works_top.png", 0),
    ):
        for root in roots:
            set_lod_visibility(root, lod)
        path = EVIDENCE / name
        render_works_still(camera, path, framing=framing, focus=(0, 0, 0.1), target=roots + [pad])
        sanitize_png(path)
        stills.append({"name": name, "sha256": sha256(path), "bytes": path.stat().st_size})

    clay = clay_material()
    for family in FAMILIES:
        hook_token = "powered" if family == "power" else "flow_mesh"
        maps = atlas_maps[family]
        id_img = id_maps.get(family)
        for kind in KINDS:
            root = piece_root(roots, family, kind)
            hide_all_roots(roots, root)
            stored = root.location.copy()
            root.location = Vector((0, 0, 0))
            bpy.context.view_layer.update()
            for framing in ("works_top", "works_edge", "works_site"):
                set_lod_visibility(root, 1 if framing == "works_site" else 0)
                meshes = [m for m in iter_meshes(root) if not m.hide_render]
                path = EVIDENCE / f"{family}_{kind}_{framing}.png"
                render_works_still(
                    camera, path, framing=framing, focus=(0, 0, 0.12),
                    target=meshes + [pad], edge_dir=(1.0, 0.35),
                )
                sanitize_png(path)
                stills.append({"name": path.name, "sha256": sha256(path), "bytes": path.stat().st_size})
            set_lod_visibility(root, 0)
            meshes = [m for m in iter_meshes(root) if not m.hide_render]
            backups = override_mats(meshes, clay)
            path = DIAG / f"{family}_{kind}_clay.png"
            render_works_still(camera, path, framing="works_top", focus=(0, 0, 0.12), target=meshes + [pad])
            sanitize_png(path)
            stills.append({"name": path.name, "sha256": sha256(path), "bytes": path.stat().st_size})
            restore_mats(meshes, backups)
            for channel in ("material", "material_id", "normal", "orm"):
                if channel == "material":
                    path = DIAG / f"{family}_{kind}_material.png"
                    render_works_still(camera, path, framing="works_top", focus=(0, 0, 0.12), target=meshes + [pad])
                elif channel == "material_id" and id_img is not None:
                    mat = emit_uv_material((id_img, maps[1], maps[2]), "id")
                    b2 = override_mats(meshes, mat)
                    path = DIAG / f"{family}_{kind}_material_id.png"
                    render_works_still(camera, path, framing="works_top", focus=(0, 0, 0.12), target=meshes + [pad])
                    restore_mats(meshes, b2)
                elif channel in ("normal", "orm"):
                    mat = emit_uv_material(maps, channel)
                    b2 = override_mats(meshes, mat)
                    path = DIAG / f"{family}_{kind}_{channel}.png"
                    render_works_still(camera, path, framing="works_top", focus=(0, 0, 0.12), target=meshes + [pad])
                    restore_mats(meshes, b2)
                else:
                    continue
                sanitize_png(path)
                stills.append({"name": path.name, "sha256": sha256(path), "bytes": path.stat().st_size})
            hidden = []
            for obj in meshes:
                if hook_token not in obj.name:
                    obj.hide_render = True
                    hidden.append(obj)
            path = DIAG / f"{family}_{kind}_hooks.png"
            render_works_still(camera, path, framing="works_top", focus=(0, 0, 0.12), target=meshes + [pad])
            sanitize_png(path)
            stills.append({"name": path.name, "sha256": sha256(path), "bytes": path.stat().st_size})
            for obj in hidden:
                obj.hide_render = False
            if kind == "straight":
                for lod in (0, 1, 2):
                    set_lod_visibility(root, lod)
                    lod_meshes = [m for m in iter_meshes(root) if not m.hide_render]
                    path = DIAG / f"{family}_{kind}_lod{lod}.png"
                    render_works_still(
                        camera, path, framing="works_top" if lod < 2 else "works_site",
                        focus=(0, 0, 0.12), target=lod_meshes + [pad],
                    )
                    sanitize_png(path)
                    stills.append({"name": path.name, "sha256": sha256(path), "bytes": path.stat().st_size})
                set_lod_visibility(root, 0)
            root.location = stored

    hide_all_roots(roots, None)
    join_jobs = (
        ("join_power_straight_straight", "power", "straight", "power", "straight", (CELL, 0, 0), (0, 0, 0), (HALF, 0, 0.12)),
        ("join_power_straight_corner", "power", "straight", "power", "corner", (CELL, 0, 0), (0, 0, math.pi / 2), (HALF, 0, 0.12)),
        ("join_power_straight_t", "power", "straight", "power", "t", (CELL, 0, 0), (0, 0, 0), (HALF, 0, 0.12)),
        ("join_lane_straight_straight", "lane", "straight", "lane", "straight", (CELL, 0, 0), (0, 0, 0), (HALF, 0, 0.12)),
        ("join_lane_straight_corner", "lane", "straight", "lane", "corner", (CELL, 0, 0), (0, 0, math.pi / 2), (HALF, 0, 0.12)),
        ("join_lane_straight_t", "lane", "straight", "lane", "t", (CELL, 0, 0), (0, 0, 0), (HALF, 0, 0.12)),
    )
    extras = []
    for name, fa, ka, fb, kb, bloc, brot, focus in join_jobs:
        a = piece_root(roots, fa, ka)
        b = piece_root(roots, fb, kb)
        extra = None
        if a is b:
            extra = duplicate_hierarchy(a)
            b = extra
            extras.append(extra)
        _show_pair(list(roots) + extras, a, b)
        render_join(camera, pad, stills, name, a, b, bloc, brot, focus)
    for extra in extras:
        try:
            bpy.data.objects.remove(extra, do_unlink=True)
        except Exception:
            pass

    crop_specs = {
        "kit_sheet_works_top.png": (1100, 360),
        "kit_sheet_works_site.png": (280, 160),
        "family_lineup_works_top.png": (1100, 360),
        "lane_straight_works_top.png": (340, 200),
        "lane_straight_works_edge.png": (499, 324, 0.88, 0.65),
        "lane_corner_works_top.png": (340, 200),
        "lane_t_works_top.png": (340, 220),
        "lane_cross_works_top.png": (340, 220),
        "lane_junction_works_top.png": (340, 220),
        "lane_end_works_top.png": (340, 200),
        "power_straight_works_top.png": (340, 180),
        "power_t_works_top.png": (340, 220),
        "power_cross_works_top.png": (340, 220),
        "power_junction_works_top.png": (340, 220),
        "join_lane_straight_corner_works_top.png": (500, 240),
        "join_power_straight_corner_works_top.png": (500, 240),
        "join_lane_straight_t_works_top.png": (500, 260),
        "join_power_straight_t_works_top.png": (500, 260),
        "lane_straight_clay.png": (340, 200),
        "lane_junction_clay.png": (340, 220),
        "power_straight_clay.png": (340, 180),
        "power_junction_clay.png": (340, 220),
    }
    for name, size in crop_specs.items():
        src = EVIDENCE / name
        if not src.exists():
            src = DIAG / name
        if src.exists():
            center = (size[2], size[3]) if len(size) == 4 else (0.5, 0.5)
            crop_png_center(src, crops / (Path(name).stem + "_crop.png"), size[0], size[1], center)

    hide_all_roots(roots, None)
    hashes = {
        "packet": PACKET,
        "cycle": CYCLE,
        "producer": inventory.get("producer") or producer_binding(),
        "cycle01History": POWER_CYCLE01_HASHES,
        "stills": stills,
        "pieces": [{k: p[k] for k in ("id", "sha256", "lodTriangles", "bytes") if k in p} for p in inventory["pieces"]],
        "atlases": inventory["atlases"],
        "master": inventory["master"],
    }
    dump_json(EVIDENCE / "HASHES.json", hashes)
    dump_json(EVIDENCE / "CYCLE_03_REPORT.json", {
        "packet": PACKET,
        "cycle": CYCLE,
        "state": "design_candidate",
        "gates": {
            "G1": "open",
            "G2": "open",
            "G4": "open",
            "G6": "open",
            "G7": "open",
            "technical": "evidence_ready",
        },
        "note": "Cycle 03 construction correction. Source candidate only. Not wired, not released, not accepted. Independent review of this hash is required; this report is not KEEP.",
        "rejectedCandidate": "3d2f0395 Cycle 02",
        "repairedFailures": [
            "P0 power junction was a cell-filling cube",
            "P0 lane junction was a cube with four stubs",
            "P0 lane T was a through-run overlapping a delayed branch, with a hanging motor that confused orientation",
            "P0 lane cross was four disconnected stubs around a hole",
            "P0 power T/cross were overlapping gold bars meeting a filled square",
            "P0 power gold jacket was the unprotected top silhouette",
            "P0 lane rollers/cover/belt still read as a black ribbon at 120 px/cell",
            "P1 end hardware was a blob (power) or motor cube (lane)",
            "P1 site register collapsed both families to colored tracks / gold rails",
        ],
        "construction": [
            "Galvanized ladder tray with lips that occupy ~5 px at works_top; gold jacket sits in the trough and is interrupted by rooted saddles",
            "Power T/cross are U-channel arms plus inner arcs and a bonded splice, not a filled box",
            "Power/lane junctions are smaller service enclosures in the hollow, with lids, glands, and remaining stubs",
            "Lane T: continuous far rail, gapped near rail, branch rails meeting at the opening, thin transfer plate",
            "Lane cross: four arms plus inner fillets and a thin transfer plate",
            "Larger rollers, narrower belt, smoked cover strip over the product path only",
        ],
        "kitSheet": "kit_sheet_works_top.png + kit_sheet_works_site.png + family_lineup_works_top.png",
        "portMatrix": [
            "join_power_straight_straight",
            "join_power_straight_corner",
            "join_power_straight_t",
            "join_lane_straight_straight",
            "join_lane_straight_corner",
            "join_lane_straight_t",
        ],
        "lodBands": "diagnostics/{power,lane}_straight_lod{0,1,2}.png",
        "claimsNotMade": [
            "whole-asset G1/G2/G4",
            "runtime G6",
            "independent G7",
            "release / loadWorksPart wiring",
        ],
        "cycle01Preserved": str(EVIDENCE_C01.relative_to(ROOT)).replace("\\", "/"),
        "cycle02Preserved": str(EVIDENCE_C02.relative_to(ROOT)).replace("\\", "/"),
        "inventory": str((KIT / "INVENTORY.json").relative_to(ROOT)).replace("\\", "/"),
    })


def main():
    flags = cli_args()
    if flags["check"] and flags["skip_build"]:
        report = validate_outputs(strict=True)
        print(json.dumps({"ok": report["ok"], "errors": report["errors"][:20]}, indent=2))
        return
    if flags["check"] and not IN_BLENDER:
        report = validate_outputs(strict=True)
        print(json.dumps({"ok": report["ok"], "errorCount": report["errorCount"]}, indent=2))
        return
    inventory = build_all(skip_evidence=flags["skip_evidence"])
    report = validate_outputs(strict=False)
    print(json.dumps({
        "ok": report["ok"],
        "pieces": len(inventory["pieces"]),
        "errors": report["errors"][:30],
        "inventory": str((KIT / "INVENTORY.json").relative_to(ROOT)).replace("\\", "/"),
    }, indent=2))
    if not report["ok"]:
        raise SystemExit(1)


if __name__ == "__main__":
    main()

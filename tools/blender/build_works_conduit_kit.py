"""PQ-131.06 Works conduit kit — Cycle 01 source candidate.

Two modular families (power cable, material lane), six topologies each,
authored at works scale (1 cell = 2.2 wu), unique 1024² atlas per family,
individual piece GLBs plus a master kit scene.

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
EVIDENCE = KIT / "evidence" / "cycle_01"
DIAG = EVIDENCE / "diagnostics"
PARTS = ROOT / "assets" / "ships" / "parts" / "works"
REF = KIT / "reference"

CELL = 2.2
HALF = 1.1
ATLAS = 1024
CYCLE = 1
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

# Power ladder tray + SWA cable
P_W, P_H, P_T, P_C = 0.48, 0.20, 0.032, 0.012
P_CABLE_R = 0.070
P_CABLE_Z = 0.032 + 0.070
P_BEND = 0.38
P_TEE = 0.44

# Lane framed roller conveyor
L_W, L_H, L_T = 0.76, 0.26, 0.040
L_RAIL_Y = L_W / 2 - L_T / 2
L_ROLLER_R = 0.045
L_ROLLER_Z = 0.028 + 0.045
L_ROLLER_LEN = L_W - 2 * L_T - 0.02
L_BELT_W = 0.50
L_COVER_W = 0.22
L_BEND = 0.46
L_TEE = 0.50

KEEP_PNG = {b"IHDR", b"PLTE", b"IDAT", b"IEND", b"sRGB", b"gAMA", b"pHYS"}

ROLE_SPEC = {
    "jacket": {"rgb": (0.58, 0.42, 0.16), "rough": 0.50, "metal": 0.08, "emit": 0.0},
    "armour": {"rgb": (0.40, 0.41, 0.38), "rough": 0.38, "metal": 0.84, "emit": 0.0},
    "tray": {"rgb": (0.22, 0.23, 0.21), "rough": 0.55, "metal": 0.80, "emit": 0.0},
    "clamp": {"rgb": (0.16, 0.15, 0.14), "rough": 0.58, "metal": 0.70, "emit": 0.0},
    "hardware": {"rgb": (0.36, 0.32, 0.24), "rough": 0.36, "metal": 0.78, "emit": 0.0},
    "contact": {"rgb": (0.78, 0.52, 0.18), "rough": 0.26, "metal": 0.82, "emit": 1.0},
    "frame": {"rgb": (0.18, 0.16, 0.13), "rough": 0.60, "metal": 0.24, "emit": 0.0},
    "roller": {"rgb": (0.42, 0.43, 0.40), "rough": 0.34, "metal": 0.80, "emit": 0.0},
    "belt": {"rgb": (0.10, 0.10, 0.09), "rough": 0.80, "metal": 0.04, "emit": 0.0},
    "cover": {"rgb": (0.12, 0.13, 0.14), "rough": 0.22, "metal": 0.04, "emit": 0.0},
    "bracket": {"rgb": (0.20, 0.19, 0.17), "rough": 0.48, "metal": 0.68, "emit": 0.0},
}

POWER_ROLES = ("tray", "jacket", "armour", "clamp", "hardware", "contact", "bracket")
LANE_ROLES = ("frame", "roller", "belt", "cover", "hardware", "bracket")
BELT_TILE = (0.0, 0.86, 1.0, 0.985)

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
            ports = contract.get("ports") or []
            want = list(PORT_BITS[kind])
            got = [p.get("axis") for p in ports]
            if got != want and set(got) != set(want):
                rec["errors"].append(f"ports {got} != {want}")
            rec["ports"] = ports
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
        radius1=radius, radius2=radius, depth=depth, segments=max(6, segs),
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
    w, h, t, c = P_W, P_H, P_T, P_C
    return [
        (-w / 2, 0.0),
        (w / 2, 0.0),
        (w / 2, h - c),
        (w / 2 - c, h),
        (w / 2 - t, h),
        (w / 2 - t, t),
        (-w / 2 + t, t),
        (-w / 2 + t, h),
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
    n_s = 8 if lod == 0 else (5 if lod == 1 else 3)
    n_arc = 8 if lod == 0 else (5 if lod == 1 else 3)
    n_arm = 3 if lod == 0 else 2
    if kind == "straight":
        return [polyline_straight(z, n_s)]
    if kind == "end":
        return [polyline_arm("X", -0.15, HALF, z, n_s)]
    if kind == "corner":
        return [polyline_corner(P_BEND if z < 0.2 else L_BEND, z, n_arm, n_arc)]
    if kind == "t":
        box = P_TEE if z < 0.2 else L_TEE
        return [
            polyline_arm("X", -HALF, -box * 0.5, z, n_arm),
            polyline_arm("X", box * 0.5, HALF, z, n_arm),
            polyline_arm("Y", box * 0.5, HALF, z, n_arm),
        ]
    if kind == "cross":
        box = P_TEE if z < 0.2 else L_TEE
        return [
            polyline_arm("X", -HALF, -box * 0.5, z, n_arm),
            polyline_arm("X", box * 0.5, HALF, z, n_arm),
            polyline_arm("Y", -HALF, -box * 0.5, z, n_arm),
            polyline_arm("Y", box * 0.5, HALF, z, n_arm),
        ]
    if kind == "junction":
        stub = 0.78
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

def build_power(kind, lod, collection, tag):
    segs = 8 if lod == 0 else (6 if lod == 1 else 5)
    tray_bm, _ = bm_new()
    jacket_bm, _ = bm_new()
    armour_bm, _ = bm_new()
    clamp_bm, _ = bm_new()
    hw_bm, _ = bm_new()
    br_bm, _ = bm_new()
    contact_bm, _ = bm_new()

    paths = path_for(kind, 0.0, lod)
    for path in paths:
        bm_sweep(tray_bm, path, power_tray_profile(), closed=True)
        bm_sweep(jacket_bm, path, cable_profile(segs), closed=True)

    # rungs (ladder)
    if lod <= 1 and kind in ("straight", "end"):
        n_rung = 4 if lod == 0 else 2
        x0, x1 = (-HALF if kind == "straight" else -0.15), HALF
        for i in range(n_rung):
            t = (i + 0.7) / (n_rung + 0.4)
            x = x0 + t * (x1 - x0)
            bm_box(tray_bm, (x, 0.0, P_T * 0.5 + 0.004), (0.04, P_W - 2 * P_T, 0.018))

    # armour bands
    if lod == 0:
        for path in paths:
            for p in sample_along(path, 0.38):
                if not clamp_ok(p, kind):
                    continue
                bm_cyl(armour_bm, (p.x, p.y, P_CABLE_Z), P_CABLE_R + 0.010, 0.028, axis="X" if abs(p.x) >= abs(p.y) else "Y", segs=8)

    # saddle clamps
    if lod <= 1:
        spacing = 0.55 if lod == 0 else 0.9
        first = True
        for path in paths:
            for p in sample_along(path, spacing):
                if not clamp_ok(p, kind):
                    continue
                ax = "X" if abs(p.x) >= abs(p.y) else "Y"
                # strap
                if ax == "X":
                    bm_box(clamp_bm, (p.x, 0.0, P_CABLE_Z + P_CABLE_R + 0.012), (0.07, 0.20, 0.018))
                    bm_box(clamp_bm, (p.x, 0.10, P_CABLE_Z), (0.07, 0.022, 0.16))
                    bm_box(clamp_bm, (p.x, -0.10, P_CABLE_Z), (0.07, 0.022, 0.16))
                    bm_box(clamp_bm, (p.x, 0.0, 0.018), (0.10, 0.22, 0.016))
                else:
                    bm_box(clamp_bm, (0.0, p.y, P_CABLE_Z + P_CABLE_R + 0.012), (0.20, 0.07, 0.018))
                    bm_box(clamp_bm, (0.10, p.y, P_CABLE_Z), (0.022, 0.07, 0.16))
                    bm_box(clamp_bm, (-0.10, p.y, P_CABLE_Z), (0.022, 0.07, 0.16))
                    bm_box(clamp_bm, (0.0, p.y, 0.018), (0.22, 0.10, 0.016))
                if lod == 0:
                    bm_cyl(hw_bm, (p.x, 0.08 if ax == "X" else 0.08, 0.04), 0.012, 0.03, axis="Z", segs=6)
                    bm_cyl(hw_bm, (p.x, -0.08 if ax == "X" else -0.08, 0.04), 0.012, 0.03, axis="Z", segs=6)
                if first:
                    # recessed contact window in the first clamp crown
                    if ax == "X":
                        bm_box(contact_bm, (p.x, 0.0, P_CABLE_Z + P_CABLE_R + 0.022), (0.05, 0.028, 0.012))
                    else:
                        bm_box(contact_bm, (0.0, p.y, P_CABLE_Z + P_CABLE_R + 0.022), (0.028, 0.05, 0.012))
                    first = False

    # fittings
    if kind in ("t", "cross"):
        s = P_TEE
        bm_box(tray_bm, (0.0, 0.0, P_H * 0.5), (s, s, P_H))
        bm_box(hw_bm, (0.0, 0.0, P_CABLE_Z), (s * 0.42, s * 0.42, 0.10))
        if lod == 0:
            for dx, dy in ((0.16, 0.16), (0.16, -0.16), (-0.16, 0.16), (-0.16, -0.16)):
                bm_cyl(hw_bm, (dx, dy, P_H + 0.01), 0.012, 0.03, axis="Z", segs=6)
    if kind == "junction":
        bm_box(hw_bm, (0.0, 0.0, 0.16), (1.12, 1.12, 0.32))
        # removable lid
        bm_box(hw_bm, (0.0, 0.0, 0.345), (1.02, 1.02, 0.03))
        bm_box(hw_bm, (0.0, 0.36, 0.365), (0.22, 0.06, 0.02))  # handle
        if lod == 0:
            for dx, dy in ((0.44, 0.44), (0.44, -0.44), (-0.44, 0.44), (-0.44, -0.44)):
                bm_cyl(hw_bm, (dx, dy, 0.365), 0.016, 0.04, axis="Z", segs=6)
            for axis, loc in (
                ("X", (0.56, 0.0, P_CABLE_Z)),
                ("X", (-0.56, 0.0, P_CABLE_Z)),
                ("Y", (0.0, 0.56, P_CABLE_Z)),
                ("Y", (0.0, -0.56, P_CABLE_Z)),
            ):
                bm_cyl(hw_bm, loc, 0.055, 0.08, axis=axis, segs=8)
                bm_cyl(hw_bm, loc, 0.070, 0.03, axis=axis, segs=8)
        if not any(contact_bm.verts):
            bm_box(contact_bm, (0.22, 0.0, 0.345), (0.06, 0.03, 0.012))
    if kind == "end":
        bm_box(hw_bm, (-0.18, 0.0, P_H * 0.5), (0.04, P_W + 0.04, P_H + 0.04))
        bm_cyl(hw_bm, (-0.22, 0.0, P_CABLE_Z), 0.05, 0.08, axis="X", segs=8)
        bm_box(jacket_bm, (-0.28, 0.0, P_CABLE_Z), (0.06, 0.04, 0.04))
        if not any(contact_bm.verts):
            bm_box(contact_bm, (-0.22, 0.0, P_CABLE_Z + 0.05), (0.03, 0.02, 0.012))

    # L-brackets on the mount
    if lod <= 1:
        for y in (-P_W * 0.42, P_W * 0.42):
            if kind == "straight":
                for x in (-0.7, 0.7):
                    bm_box(br_bm, (x, y, 0.012), (0.10, 0.04, 0.024))
                    bm_box(br_bm, (x, y, 0.05), (0.04, 0.04, 0.08))
            elif kind == "end":
                bm_box(br_bm, (0.4, y, 0.012), (0.10, 0.04, 0.024))
            elif kind in ("corner",):
                bm_box(br_bm, (0.55, y, 0.012), (0.10, 0.04, 0.024))
                bm_box(br_bm, (y, 0.55, 0.012), (0.04, 0.10, 0.024))
            else:
                bm_box(br_bm, (0.0, y if kind != "junction" else y * 1.4, 0.012), (0.12, 0.04, 0.024))

    if not any(contact_bm.verts):
        bm_box(contact_bm, (0.0, 0.0, P_CABLE_Z + P_CABLE_R + 0.02), (0.05, 0.024, 0.01))

    objs = {}
    def emit(bm, role, suffix):
        if not bm.verts:
            bm.free()
            return None
        obj = finish_bmesh(f"{tag}_{role}{suffix}", bm, collection, role)
        objs[role] = obj
        return obj

    emit(tray_bm, "tray", "")
    emit(jacket_bm, "jacket", "")
    emit(armour_bm, "armour", "")
    emit(clamp_bm, "clamp", "")
    emit(hw_bm, "hardware", "")
    emit(br_bm, "bracket", "")
    contact = emit(contact_bm, "contact", "")
    return objs, contact


def lane_rail_boxes(bm, path, lod):
    frames = frames_of(path)
    for origin, _t, b, nn in frames[:: max(1, len(frames) // 8)]:
        for side in (-1, 1):
            c = origin + b * (side * L_RAIL_Y) + nn * (L_H * 0.5)
            # approximate rail segment as a box aligned to the frame
            # skip: we'll sweep a C profile instead
            pass


def rail_profile():
    # two rails encoded as one open frame: deck + two C's via separate sweeps
    return None


def build_lane(kind, lod, collection, tag):
    frame_bm, _ = bm_new()
    roller_bm, _ = bm_new()
    belt_bm, _ = bm_new()
    cover_bm, _ = bm_new()
    hw_bm, _ = bm_new()
    br_bm, _ = bm_new()

    radius = L_BEND
    if kind == "straight":
        paths = [polyline_straight(0.0, 8 if lod == 0 else 4)]
    elif kind == "end":
        paths = [polyline_arm("X", -0.12, HALF, 0.0, 6 if lod == 0 else 3)]
    elif kind == "corner":
        paths = [corner_path(radius, 0.0, lod)]
    elif kind == "t":
        box = L_TEE
        paths = [
            polyline_arm("X", -HALF, -box * 0.5, 0.0, 3),
            polyline_arm("X", box * 0.5, HALF, 0.0, 3),
            polyline_arm("Y", box * 0.5, HALF, 0.0, 3),
        ]
    elif kind == "cross":
        box = L_TEE
        paths = [
            polyline_arm("X", -HALF, -box * 0.5, 0.0, 3),
            polyline_arm("X", box * 0.5, HALF, 0.0, 3),
            polyline_arm("Y", -HALF, -box * 0.5, 0.0, 3),
            polyline_arm("Y", box * 0.5, HALF, 0.0, 3),
        ]
    else:
        stub = 0.78
        paths = [
            polyline_arm("X", -HALF, -stub, 0.0, 2),
            polyline_arm("X", stub, HALF, 0.0, 2),
            polyline_arm("Y", -HALF, -stub, 0.0, 2),
            polyline_arm("Y", stub, HALF, 0.0, 2),
        ]

    deck_h = 0.022
    rail_prof_l = [(-L_T / 2, 0.0), (L_T / 2, 0.0), (L_T / 2, L_H), (-L_T / 2, L_H)]
    cover_prof = [(-L_COVER_W / 2, L_H - 0.01), (L_COVER_W / 2, L_H - 0.01),
                  (L_COVER_W / 2, L_H + 0.008), (-L_COVER_W / 2, L_H + 0.008)]
    belt_prof = [(-L_BELT_W / 2, L_ROLLER_Z + L_ROLLER_R - 0.004),
                 (L_BELT_W / 2, L_ROLLER_Z + L_ROLLER_R - 0.004),
                 (L_BELT_W / 2, L_ROLLER_Z + L_ROLLER_R + 0.010),
                 (-L_BELT_W / 2, L_ROLLER_Z + L_ROLLER_R + 0.010)]

    def offset_path(path, y_off):
        frames = frames_of(path)
        return [origin + b * y_off for origin, _t, b, _n in frames]

    for path in paths:
        # deck
        deck_prof = [(-L_W / 2 + L_T, 0.0), (L_W / 2 - L_T, 0.0),
                     (L_W / 2 - L_T, deck_h), (-L_W / 2 + L_T, deck_h)]
        bm_sweep(frame_bm, path, deck_prof, closed=True)
        bm_sweep(frame_bm, offset_path(path, -L_RAIL_Y), rail_prof_l, closed=True)
        bm_sweep(frame_bm, offset_path(path, L_RAIL_Y), rail_prof_l, closed=True)
        bm_sweep(cover_bm, path, cover_prof, closed=True)
        bm_sweep(belt_bm, path, belt_prof, closed=True)

        segs = 8 if lod == 0 else (6 if lod == 1 else 5)
        spacing = 0.32 if lod == 0 else (0.50 if lod == 1 else 0.9)
        if lod <= 1:
            for p in sample_along(path, spacing):
                if not clamp_ok(p, kind) and kind != "end":
                    continue
                ax = "Y" if abs(p.x) >= abs(p.y) else "X"
                bm_cyl(roller_bm, (p.x, p.y, L_ROLLER_Z), L_ROLLER_R, L_ROLLER_LEN, axis=ax, segs=segs)
                if lod == 0:
                    # bearing bosses in the rails
                    if ax == "Y":
                        bm_cyl(hw_bm, (p.x, p.y + L_RAIL_Y, L_ROLLER_Z), 0.022, 0.05, axis="Y", segs=6)
                        bm_cyl(hw_bm, (p.x, p.y - L_RAIL_Y, L_ROLLER_Z), 0.022, 0.05, axis="Y", segs=6)
                    else:
                        bm_cyl(hw_bm, (p.x + L_RAIL_Y, p.y, L_ROLLER_Z), 0.022, 0.05, axis="X", segs=6)
                        bm_cyl(hw_bm, (p.x - L_RAIL_Y, p.y, L_ROLLER_Z), 0.022, 0.05, axis="X", segs=6)
        if lod == 0:
            # belt cleats
            for p in sample_along(path, 0.22):
                if not clamp_ok(p, kind) and kind != "end":
                    continue
                ax = "X" if abs(p.x) >= abs(p.y) else "Y"
                if ax == "X":
                    bm_box(belt_bm, (p.x, p.y, L_ROLLER_Z + L_ROLLER_R + 0.012), (0.03, L_BELT_W * 0.92, 0.012))
                else:
                    bm_box(belt_bm, (p.x, p.y, L_ROLLER_Z + L_ROLLER_R + 0.012), (L_BELT_W * 0.92, 0.03, 0.012))

    if kind in ("t", "cross"):
        s = L_TEE
        bm_box(frame_bm, (0.0, 0.0, L_H * 0.45), (s, s, L_H * 0.9))
        if lod <= 1:
            bm_box(hw_bm, (0.0, -s * 0.42, 0.10), (0.18, 0.12, 0.16))  # drive stub
            bm_cyl(hw_bm, (0.0, -s * 0.52, 0.10), 0.04, 0.10, axis="Y", segs=8)
    if kind == "junction":
        bm_box(frame_bm, (0.0, 0.0, 0.16), (1.16, 1.16, 0.32))
        bm_box(hw_bm, (0.0, 0.0, 0.345), (1.04, 1.04, 0.03))  # lid
        bm_box(hw_bm, (0.0, 0.38, 0.365), (0.24, 0.06, 0.02))
        if lod == 0:
            bm_box(hw_bm, (0.0, -0.42, 0.12), (0.22, 0.16, 0.18))  # roller drive
            bm_cyl(hw_bm, (0.0, -0.55, 0.12), 0.045, 0.12, axis="Y", segs=8)
            for dx, dy in ((0.46, 0.46), (0.46, -0.46), (-0.46, 0.46), (-0.46, -0.46)):
                bm_cyl(hw_bm, (dx, dy, 0.365), 0.016, 0.04, axis="Z", segs=6)
    if kind == "end":
        bm_box(frame_bm, (-0.16, 0.0, L_H * 0.5), (0.05, L_W + 0.02, L_H))
        bm_box(hw_bm, (-0.22, 0.0, L_ROLLER_Z), (0.08, L_BELT_W, 0.06))  # belt return

    if lod <= 1:
        for y in (-L_W * 0.42, L_W * 0.42):
            xs = (-0.65, 0.65) if kind == "straight" else ((0.45,) if kind != "junction" else (0.0,))
            for x in xs:
                bm_box(br_bm, (x, y, 0.012), (0.12, 0.045, 0.024))
                bm_box(br_bm, (x, y, 0.05), (0.045, 0.045, 0.08))

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
    return objs, belt


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


def rasterize_family(objects, albedo, orm, nrm):
    if not HAS_NP:
        raise RuntimeError("numpy required")
    size = albedo.shape[0]
    for obj in objects:
        if obj is None or obj.type != "MESH" or not obj.data.polygons:
            continue
        role = obj.get("spacefaceRole") or "hardware"
        spec = ROLE_SPEC.get(role, ROLE_SPEC["hardware"])
        base = spec["rgb"]
        ao_v, n_v = vertex_ao(obj)
        mesh = obj.data
        uv = loop_uv_layer(obj)
        loops = mesh.loops
        for poly in mesh.polygons:
            idxs = list(poly.loop_indices)
            if len(idxs) < 3:
                continue
            # fan
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


def assemble_piece(family, kind, lod_objs, hook_objs, collection, atlas_mat):
    aid = asset_id(family, kind)
    hook_name = "powered" if family == "power" else "flow_mesh"
    suffix = unique_suffix(family, kind)
    root = add_empty(aid, (0, 0, 0), collection, size=0.12)
    type_root = add_empty(type_root_name(family, kind), (0, 0, 0), collection, parent=root, size=0.08)
    hook = add_empty(hook_name + suffix, (0, 0, 0), collection, parent=type_root, size=0.05)
    stamp_socket(hook, "works_hook")
    lid = None
    if kind == "junction":
        lid = add_empty("service_lid" + suffix, (0, 0, 0.345), collection, parent=type_root, size=0.05)
        stamp_socket(lid, "works_hook")

    lod_tri = {0: 0, 1: 0, 2: 0}
    static_all = []
    for lod in (0, 1, 2):
        objs = lod_objs[lod]
        hook_obj = hook_objs[lod]
        static = [o for k, o in objs.items() if o is not None and o != hook_obj]
        for obj in static:
            assign_atlas(obj, atlas_mat)
        if hook_obj is not None:
            assign_atlas(hook_obj, atlas_mat)
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
        bg.inputs["Color"].default_value = (0.028, 0.022, 0.018, 1)
        bg.inputs["Strength"].default_value = 0.22
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
        ("Key", (-1.15 * reach, -0.78 * reach, 0.54 * reach), 7.2, (1.00, 0.863, 0.737), 18.0),
        ("Rim", (0.22 * reach, 1.45 * reach, 0.30 * reach), 2.2, (0.616, 0.722, 0.941), 25.0),
        ("Fill", (1.12 * reach, 0.46 * reach, 0.50 * reach), 2.4, (0.847, 0.765, 0.659), 30.0),
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


# ----- main build --------------------------------------------------------

def build_all(skip_evidence=False):
    if not IN_BLENDER:
        raise SystemExit("builder must run inside Blender 5.1")
    if not HAS_NP:
        raise SystemExit("numpy is required")
    from spaceface_works_camera import apply_works_camera

    SOURCE.mkdir(parents=True, exist_ok=True)
    TEX_DIR.mkdir(parents=True, exist_ok=True)
    EVIDENCE.mkdir(parents=True, exist_ok=True)
    DIAG.mkdir(parents=True, exist_ok=True)
    PARTS.mkdir(parents=True, exist_ok=True)

    reset_scene()
    kit_coll = bpy.data.collections.new("CONDUIT_KIT")
    bpy.context.scene.collection.children.link(kit_coll)

    built = {}
    family_static = {f: {0: [], 1: [], 2: []} for f in FAMILIES}
    family_hooks = {f: {0: [], 1: [], 2: []} for f in FAMILIES}

    for family in FAMILIES:
        for kind in KINDS:
            coll = bpy.data.collections.new(asset_id(family, kind))
            kit_coll.children.link(coll)
            lod_objs = {}
            hook_objs = {}
            for lod in (0, 1, 2):
                tag = f"{family}_{kind}_L{lod}"
                if family == "power":
                    objs, hook = build_power(kind, lod, coll, tag)
                else:
                    objs, hook = build_lane(kind, lod, coll, tag)
                lod_objs[lod] = objs
                hook_objs[lod] = hook
                for o in objs.values():
                    if o is None:
                        continue
                    if o is hook and family == "lane":
                        family_hooks[family][lod].append(o)
                    elif o is hook and family == "power":
                        family_static[family][lod].append(o)
                    else:
                        family_static[family][lod].append(o)
            built[(family, kind)] = {"coll": coll, "lod_objs": lod_objs, "hook_objs": hook_objs}

    # unique pack + atlas per family
    atlas_maps = {}
    atlas_mats = {}
    atlas_paths = {}
    for family in FAMILIES:
        albedo = np.zeros((ATLAS, ATLAS, 4), dtype=np.float32)
        orm = np.zeros((ATLAS, ATLAS, 4), dtype=np.float32)
        nrm = np.zeros((ATLAS, ATLAS, 4), dtype=np.float32)
        nrm[..., 0] = 0.5
        nrm[..., 1] = 0.5
        nrm[..., 2] = 1.0
        nrm[..., 3] = 1.0
        orm[..., 0] = 1.0
        orm[..., 1] = 0.5
        orm[..., 2] = 0.0
        orm[..., 3] = 1.0
        albedo[..., 0:3] = 0.12
        if family == "lane":
            paint_belt_strip(albedo, orm, nrm)
            for obj in family_hooks[family][0] + family_hooks[family][1] + family_hooks[family][2]:
                assign_belt_uv(obj, CELL)
        for lod, rect_v in LOD_BANDS.items():
            rect = (0.0, rect_v[0], 1.0, rect_v[1]) if family == "power" else (0.0, rect_v[0], 1.0, min(rect_v[1], BELT_TILE[1] - 0.005) if lod == 2 else rect_v[1])
            pack_objects(family_static[family][lod], rect)
            rasterize_family(family_static[family][lod], albedo, orm, nrm)
            if family == "lane":
                rasterize_family(family_hooks[family][lod], albedo, orm, nrm)
        np.clip(albedo, 0, 1, out=albedo)
        np.clip(orm, 0, 1, out=orm)
        np.clip(nrm, 0, 1, out=nrm)
        img_a, p_a = write_pixels(f"{family}_atlas_basecolor", albedo, ATLAS, "sRGB")
        img_o, p_o = write_pixels(f"{family}_atlas_orm", orm, ATLAS, "Non-Color")
        img_n, p_n = write_pixels(f"{family}_atlas_normal", nrm, ATLAS, "Non-Color")
        maps = (img_a, img_o, img_n)
        atlas_maps[family] = maps
        atlas_mats[family] = make_atlas_material(family, maps)
        atlas_paths[family] = [p_a, p_o, p_n]

    inventory = {
        "packet": PACKET,
        "cycle": CYCLE,
        "cellWu": CELL,
        "pieces": [],
        "atlases": {},
        "master": {},
    }
    roots = []
    for family in FAMILIES:
        for kind in KINDS:
            rec = built[(family, kind)]
            root, contract, lod_tri = assemble_piece(
                family, kind, rec["lod_objs"], rec["hook_objs"], rec["coll"], atlas_mats[family],
            )
            # offset in master kit grid
            col = KINDS.index(kind)
            row = 0 if family == "power" else 1
            root.location = Vector(((col - 2.5) * CELL, (0.55 - row) * CELL * 1.2, 0.0))
            roots.append(root)
            glb_path = PARTS / f"{asset_id(family, kind)}.glb"
            src_path = SOURCE / f"{asset_id(family, kind)}.glb"
            # export at origin
            stored = root.location.copy()
            root.location = Vector((0, 0, 0))
            bpy.context.view_layer.update()
            export_hierarchy(root, glb_path, family=family, kind=kind)
            hook = "powered" if family == "power" else "flow_mesh"
            stamp_glb(glb_path, contract, hook)
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

    for family, paths in atlas_paths.items():
        inventory["atlases"][family] = [
            {"path": str(p.relative_to(ROOT)).replace("\\", "/"), "sha256": sha256(p)}
            for p in paths
        ]

    # master kit GLB + blend
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
    }
    dump_json(KIT / "INVENTORY.json", inventory)

    if not skip_evidence:
        render_evidence(roots, atlas_maps, inventory)

    return inventory


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


def render_evidence(roots, atlas_maps, inventory):
    from spaceface_works_camera import apply_works_camera, render_works_still
    EVIDENCE.mkdir(parents=True, exist_ok=True)
    DIAG.mkdir(parents=True, exist_ok=True)
    camera, pad = setup_works_world(pad_size=18.0)

    stills = []
    # kit sheet — all pieces visible at works_top and works_site
    hide_all_roots(roots, except_root=None)
    for framing, name in (("works_top", "kit_sheet_works_top.png"), ("works_site", "kit_sheet_works_site.png")):
        path = EVIDENCE / name
        render_works_still(camera, path, framing=framing, focus=(0, 0, 0.1), target=roots + [pad])
        stills.append({"name": name, "sha256": sha256(path), "bytes": path.stat().st_size})

    compare = [("power", "straight"), ("power", "corner"), ("power", "junction"),
               ("lane", "straight"), ("lane", "corner"), ("lane", "junction")]
    clay = clay_material()
    for family, kind in compare:
        root = piece_root(roots, family, kind)
        hide_all_roots(roots, root)
        # park at origin for comparison stills
        stored = root.location.copy()
        root.location = Vector((0, 0, 0))
        bpy.context.view_layer.update()
        meshes = iter_meshes(root)
        for framing in ("works_top", "works_edge", "works_site"):
            path = EVIDENCE / f"{family}_{kind}_{framing}.png"
            render_works_still(
                camera, path, framing=framing, focus=(0, 0, 0.12),
                target=meshes + [pad], edge_dir=(1.0, 0.35),
            )
            stills.append({"name": path.name, "sha256": sha256(path), "bytes": path.stat().st_size})
        backups = override_mats(meshes, clay)
        path = DIAG / f"{family}_{kind}_clay.png"
        render_works_still(camera, path, framing="works_top", focus=(0, 0, 0.12), target=meshes + [pad])
        stills.append({"name": path.name, "sha256": sha256(path), "bytes": path.stat().st_size})
        restore_mats(meshes, backups)
        maps = atlas_maps[family]
        for channel in ("material", "normal", "orm"):
            if channel == "material":
                path = DIAG / f"{family}_{kind}_material.png"
                render_works_still(camera, path, framing="works_top", focus=(0, 0, 0.12), target=meshes + [pad])
            else:
                mat = emit_uv_material(maps, channel)
                b2 = override_mats(meshes, mat)
                path = DIAG / f"{family}_{kind}_{channel}.png"
                render_works_still(camera, path, framing="works_top", focus=(0, 0, 0.12), target=meshes + [pad])
                restore_mats(meshes, b2)
            stills.append({"name": path.name, "sha256": sha256(path), "bytes": path.stat().st_size})
        # hook diagnostic: hide non-hook meshes
        hook_token = "powered" if family == "power" else "flow_mesh"
        hidden = []
        for obj in meshes:
            if hook_token not in obj.name:
                obj.hide_render = True
                hidden.append(obj)
        path = DIAG / f"{family}_{kind}_hooks.png"
        render_works_still(camera, path, framing="works_top", focus=(0, 0, 0.12), target=meshes + [pad])
        stills.append({"name": path.name, "sha256": sha256(path), "bytes": path.stat().st_size})
        for obj in hidden:
            obj.hide_render = False
        root.location = stored

    # join proof: two power straights and two lane straights
    hide_all_roots(roots, None)
    for family in FAMILIES:
        a = piece_root(roots, family, "straight")
        b = piece_root(roots, family, "corner")
        for r in roots:
            vis = r in (a, b)
            stack = [r]
            while stack:
                n = stack.pop()
                n.hide_set(not vis)
                n.hide_render = not vis
                stack.extend(list(n.children))
        stored_a = a.location.copy()
        stored_b = b.location.copy()
        a.location = Vector((0, 0, 0))
        # corner rotated 90° so local +Y port faces -X, meeting the straight at x=1.1
        b.location = Vector((CELL, 0, 0))
        b.rotation_euler = (0, 0, math.pi / 2)
        bpy.context.view_layer.update()
        meshes = iter_meshes(a) + iter_meshes(b)
        path = EVIDENCE / f"join_{family}_straight_corner_works_top.png"
        render_works_still(camera, path, framing="works_top", focus=(HALF, 0, 0.12), target=meshes + [pad])
        stills.append({"name": path.name, "sha256": sha256(path), "bytes": path.stat().st_size})
        path = EVIDENCE / f"join_{family}_straight_corner_works_edge.png"
        render_works_still(
            camera, path, framing="works_edge", focus=(HALF, 0, 0.12),
            target=meshes + [pad], edge_dir=(1.0, 0.2),
        )
        stills.append({"name": path.name, "sha256": sha256(path), "bytes": path.stat().st_size})
        a.location = stored_a
        b.location = stored_b
        b.rotation_euler = (0, 0, 0)

    hide_all_roots(roots, None)
    hashes = {
        "packet": PACKET,
        "cycle": CYCLE,
        "stills": stills,
        "pieces": [{k: p[k] for k in ("id", "sha256", "lodTriangles", "bytes")} for p in inventory["pieces"]],
        "atlases": inventory["atlases"],
        "master": inventory["master"],
    }
    dump_json(EVIDENCE / "HASHES.json", hashes)
    dump_json(EVIDENCE / "CYCLE_01_REPORT.json", {
        "packet": PACKET,
        "cycle": CYCLE,
        "state": "design_candidate",
        "gates": {
            "G1": "open",
            "G2": "open",
            "G4": "open",
            "technical": "evidence_ready",
        },
        "note": "Source candidate only. Not wired, not released, not accepted.",
        "kitSheet": "kit_sheet_works_top.png + kit_sheet_works_site.png",
        "siteFamiliesWithoutEmission": "kit_sheet_works_site.png and *_works_site.png stills; identity is section + albedo, not bloom",
        "snap": "join_*_straight_corner_*.png plus INVENTORY.json ports",
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

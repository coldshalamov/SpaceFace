"""PQ-131.04 Works refinery — Cycle 03 source-candidate builder.

Cycle 03 is the formed-jacket / deep-throat / site-gallery correction:
chamfered insulated jacket with waist belt, courses, and corner returns;
deeper blind refractory well with a thin dark lip; four gusseted feet
with a pad gap; stack rooted by elbow, flange/union, and banded
transition; tank on two wrapped saddles with manway and nozzle;
LOD1/2 and site values keep three separated masses and an empty slit.

Preserve Cycle 01 and Cycle 02 evidence. Do not write into those folders.

    blender --background --python tools/blender/build_works_refinery.py

Exact write set: this file, assets/works/refinery/**, and
assets/ships/parts/works/place_works_refinery.glb.
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
from mathutils import Matrix, Vector

TOOLS = Path(__file__).resolve().parent
ROOT = TOOLS.parents[1]
if str(TOOLS) not in sys.path:
    sys.path.insert(0, str(TOOLS))

from spaceface_works_camera import (  # noqa: E402
    CELL_WU,
    FOV_V_DEG,
    apply_works_camera,
    measured_px_per_cell,
    works_pose,
)

FAMILY = ROOT / "assets" / "works" / "refinery"
SOURCE_DIR = FAMILY / "source"
TEX_DIR = SOURCE_DIR / "textures"
REF_DIR = FAMILY / "reference"
EVID_DIR = FAMILY / "evidence" / "cycle_003"
CYCLE01_DIR = FAMILY / "evidence" / "cycle_001"
CYCLE02_DIR = FAMILY / "evidence" / "cycle_002"
PARTS_DIR = ROOT / "assets" / "ships" / "parts" / "works"
COMBINED_NAME = "place_works_refinery.glb"
ASSET_ID = "place_works_refinery"
ROOT_NAME = "SF_WORKS_REFINERY_V1"
HOOK_NAMES = ("furnace_slit", "stack_vent", "lamp")
CYCLE = 3
TEX = 1024
SHADE_ANGLE = 28.0
BEVEL_LOW = {0: 0.010, 1: 0.0, 2: 0.0}
BEVEL_HIGH = {0: 0.004, 1: 0.0, 2: 0.0}
TRI_BUDGET = {0: 8000, 1: 2000, 2: 600}
KEEP_PNG = {b"IHDR", b"PLTE", b"IDAT", b"IEND", b"sRGB", b"gAMA", b"pHYs"}
_GLTF_FLOAT = 5126
_GLTF_NCOMP = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4, "MAT4": 16}

# Plan layout (wu). Origin at cell centre, +Z up, feet on z=0.
# Process-train keep-set: furnace, offset stack, offset tank, empty gallery.
FX, FY = -0.22, 0.04
FHX, FHY = 0.52, 0.38
F_Z0, F_CROWN = 0.15, 0.76
WELL_FLOOR = 0.28
SLIT_HX, SLIT_HY = 0.248, 0.098
SX, SY = 0.18, 0.80
STACK_R = 0.138
STACK_TOP = 1.12
TX, TY = 0.76, -0.28
TANK_R, TANK_HALF = 0.148, 0.32
PIPE_R = 0.020
LAMP_LOC = (SX + 0.13, SY - 0.15, 0.74)
COLLISION_LOC = (0.0, 0.0, 0.60)
COLLISION_SCALE = (1.05, 1.05, 0.60)


def blender_zup_to_gltf(vec):
    x, y, z = (float(vec[0]), float(vec[1]), float(vec[2]))
    return (x, z, -y)


def blender_zup_scale_to_gltf(vec):
    sx, sy, sz = (float(vec[0]), float(vec[1]), float(vec[2]))
    return (sx, sz, sy)

ROLES = (
    "structure",
    "refractory",
    "hotmetal",
    "stack",
    "tank",
    "pipe",
    "lampmetal",
)
ROLE_ID_RGB = {
    "structure": (0.16, 0.18, 0.20),
    "refractory": (0.22, 0.16, 0.12),
    "hotmetal": (0.50, 0.36, 0.20),
    "stack": (0.36, 0.14, 0.07),
    "tank": (0.42, 0.12, 0.08),
    "pipe": (0.40, 0.32, 0.22),
    "lampmetal": (0.20, 0.20, 0.22),
    "slit": (0.08, 0.05, 0.03),
    "lamp": (0.70, 0.58, 0.38),
}
# Authored albedo bases. Jacket is cooler/darker than stack rust and tank oxide-red.
# Hotmetal is heat-stained steel, not copper.
ROLE_ALBEDO = {
    "structure": (0.082, 0.090, 0.102),
    "refractory": (0.102, 0.080, 0.060),
    "hotmetal": (0.165, 0.140, 0.118),
    "stack": (0.255, 0.105, 0.052),
    "tank": (0.220, 0.068, 0.046),
    "pipe": (0.22, 0.175, 0.135),
    "lampmetal": (0.13, 0.135, 0.142),
    "slit": (0.028, 0.020, 0.016),
    "lamp": (0.40, 0.32, 0.18),
}
ROLE_ROUGH = {
    "structure": 0.66, "refractory": 0.86, "hotmetal": 0.42,
    "stack": 0.68, "tank": 0.86, "pipe": 0.40, "lampmetal": 0.52,
    "slit": 0.62, "lamp": 0.28,
}
ROLE_METAL = {
    "structure": 0.03, "refractory": 0.00, "hotmetal": 0.84,
    "stack": 0.72, "tank": 0.02, "pipe": 0.80, "lampmetal": 0.50,
    "slit": 0.00, "lamp": 0.02,
}
CYCLE01_LOCK = {
    "assets/works/refinery/evidence/cycle_001.json": "C0CD39A52297A391BD13EFF08F5DA0A38A8AAF977587A4E598C57718192BFDA6",
    "assets/works/refinery/evidence/cycle_001.md": "97FC5952B8FCEED4D4CD3140A56697626088BBAC8A006E073AD9D0AB3C8D53A2",
    "assets/works/refinery/evidence/cycle_001/hook_identity.png": "DF91BE532876E70848C0D91B26AF3408381562416B4BA20BA4ACEE0FA1C3B2E7",
    "assets/works/refinery/evidence/cycle_001/hook_identity_1to1.png": "A993D9E0CC04B4041DBBE4AEB354A135A5B701B4768B787FAF6A85DCF8C68A01",
    "assets/works/refinery/evidence/cycle_001/id_or_material_id.png": "1E2EBE13162EE93F84B00E2A94DC4DB267A1D27003D6F8B6B426337AFF8A3C5E",
    "assets/works/refinery/evidence/cycle_001/id_or_material_id_1to1.png": "023624DC6990C1484CCA23DB732D9270952DB4F43EBCD8B8E4F28D85F7056BD0",
    "assets/works/refinery/evidence/cycle_001/normal_isolation.png": "EDE9DB0D6E305928ECE4B9C692AE11F949FE4F9BEAF3B4D6DCE9FBF70493FCA2",
    "assets/works/refinery/evidence/cycle_001/normal_isolation_1to1.png": "5451700E6FF305A68F7E88747F9905C39D61ED12CA5B574E245D42374ECCC2E7",
    "assets/works/refinery/evidence/cycle_001/orm_isolation.png": "F3A501AE9D1E4EB00E9ACFD8F8821116FE33E001F1BE7762A880F1E19D47C9A9",
    "assets/works/refinery/evidence/cycle_001/orm_isolation_1to1.png": "AEB3E05C20E96BA39B295C6E537E4B4580C0B96357DB0B174AE04CCF80563FA9",
    "assets/works/refinery/evidence/cycle_001/state_emission.png": "FEB3A559AE95252C1AB58F7CEADE0A6D488167281EDFFF6C574592CD318EB4FC",
    "assets/works/refinery/evidence/cycle_001/state_emission_1to1.png": "5AB8ADA01D0DC050290DD2B7544981AB6A55D697FA07A68414BBC6B9FE58B43B",
    "assets/works/refinery/evidence/cycle_001/uv0_layout.png": "F7BA0DAAB9FF76012E098B90E2D40E867530AB83B27A19261B07107AC126071D",
    "assets/works/refinery/evidence/cycle_001/works_edge.png": "03BA9C4EFD8F168870D8517B3DD166A47813F869C6EF9E747BCC2BF3592B8F19",
    "assets/works/refinery/evidence/cycle_001/works_edge_1to1.png": "0A0C1EF2AD83923A4572A283A50DB11E77686F62E966EA3CDE4791F7DE373E9D",
    "assets/works/refinery/evidence/cycle_001/works_edge_grazing.png": "F48D727FB6178F54B76C732A359E52235142C5A43CEE52C7C28A5295CC8EF63F",
    "assets/works/refinery/evidence/cycle_001/works_edge_grazing_1to1.png": "D91031FA2281C92581942E89B35CEAB92D19A5F0747DDFBC843FE2304638FB97",
    "assets/works/refinery/evidence/cycle_001/works_site.png": "27A76BD40E15588EF4AAABC2C1469E644379E8696CE64EA7D89202B9668DAA66",
    "assets/works/refinery/evidence/cycle_001/works_site_1to1.png": "2D9E5A51127894C09B2B89940135FF6DB4D0B1ECE31FB0F34167C95368421801",
    "assets/works/refinery/evidence/cycle_001/works_top.png": "A9D138523E835EB1332BB773F8AFE092C2B919C2FEA9DA96EACA4BE8FD4D2525",
    "assets/works/refinery/evidence/cycle_001/works_top_1to1.png": "E1AF48E5B574D4448E4D2443FF7F51161BBEEEDB5BDE36C1CFC76C052E4ED00E",
    "assets/works/refinery/evidence/cycle_001/works_top_clay.png": "92CDB27F9E73352AFC099F2F91147FF8BC891EBD2F3D9AADDE974DFF6F828A15",
    "assets/works/refinery/evidence/cycle_001/works_top_clay_1to1.png": "D0A45B24A191C54282AE91CC7A4CF6C7B1F5F9D003EC184729336E839CE92477",
    "assets/works/refinery/evidence/cycle_001/works_visible_faces.json": "F02C60AD8ED292C5BA49082DB0758530DE14764F5523936967B17664672C1E59",
}
CYCLE02_LOCK = {
    "assets/works/refinery/evidence/cycle_002.json": "A2BF5A403889FDA4CA5163907644984DB4BC9A03F24D4E1E5FE338B93897AF2E",
    "assets/works/refinery/evidence/cycle_002.md": "4CBF63742A9A8E7D78ABFBADEAB03D5745270ABDCB0655E6E2BB097BA6733E39",
    "assets/works/refinery/evidence/cycle_002/hook_identity.png": "3F356B543EB65BDAAC2CB971474DEEA573461ADC3D28E65172204CEDC5B5E42B",
    "assets/works/refinery/evidence/cycle_002/hook_identity_1to1.png": "E9CFDFAD9C162AE4DE455B95C316F76796EE415D7412E19A255A7C72FAA2C759",
    "assets/works/refinery/evidence/cycle_002/id_or_material_id.png": "B952DBA2780CB901EE4C4334618E0E15F38A4D97C137BA2F70352D81BB40076F",
    "assets/works/refinery/evidence/cycle_002/id_or_material_id_1to1.png": "6981412A6DC7C1A866F2B72C987FD8132943EB65714FD3C68E0B48DC79847F8A",
    "assets/works/refinery/evidence/cycle_002/normal_isolation.png": "F090074946DA82EB46E559329F4148034CC420D93209B41C8054BB03748687C9",
    "assets/works/refinery/evidence/cycle_002/normal_isolation_1to1.png": "4CC7F0A48A265B93E31732F1E67853139F5889DB8DF05AF09D91F1731B68E2B7",
    "assets/works/refinery/evidence/cycle_002/orm_isolation.png": "4591432E86329FDA814ADFB8AA5F27FD0B8E563EB3A06C9E687191E1FD1BD409",
    "assets/works/refinery/evidence/cycle_002/orm_isolation_1to1.png": "011056DFECD8148B790A9123D982D42E54EFF1E26185640BAD05DD18D833CFFF",
    "assets/works/refinery/evidence/cycle_002/state_emission.png": "A46CE77296FED212A14CE460A6FC524702D8DC0A702FF52BC9669F8858736057",
    "assets/works/refinery/evidence/cycle_002/state_emission_1to1.png": "919DB16C7BD718464D5E5FC5886A36D2C806179CCC01CDB3D40532CFD1A90333",
    "assets/works/refinery/evidence/cycle_002/uv0_layout.png": "1CAF0AB54EA9B2EF64412964742E49871156EAEAFF1059EC7FE99E561FBDB8B2",
    "assets/works/refinery/evidence/cycle_002/works_edge.png": "9E2854421DF28352DE6029F24A0A5FC9441C9B74A2ECAE49B4FB171E63FA72AA",
    "assets/works/refinery/evidence/cycle_002/works_edge_1to1.png": "E194E3F2D2E391344FD70FFE9DF37FD13F4FD609C8478EC489B2BA48CE3B8543",
    "assets/works/refinery/evidence/cycle_002/works_edge_grazing.png": "1AB105DAF305542E1ADEAF5F80CE7F6AB9A4AB54CCC4DAFEF98B73EE25907D07",
    "assets/works/refinery/evidence/cycle_002/works_edge_grazing_1to1.png": "F65876896C14D55FA1DEC317B770458D4D5F4A2CCFAC6ACC0B684038BF42ED11",
    "assets/works/refinery/evidence/cycle_002/works_site.png": "D42EA99C15165F53DE1D1C4F9108EEA3A90C291616785355413776521DC336DA",
    "assets/works/refinery/evidence/cycle_002/works_site_1to1.png": "0E5759FC7E5479379B29540E0D933FCF73CA454618B2B489FFCBAD47F40B5C57",
    "assets/works/refinery/evidence/cycle_002/works_top.png": "82F5A13B92F93FA5CEBE98E7130150A9B066F0BB55901EE39AC2B564AFCB0EEC",
    "assets/works/refinery/evidence/cycle_002/works_top_1to1.png": "52100BC50CFD3B7F11DD006858282BAF31A08C8B6A42D0B0A4789D2CFD057E52",
    "assets/works/refinery/evidence/cycle_002/works_top_clay.png": "86FEBBB61924124E3D8EF1294B1CBEC42131F80295893273CE01B882F91E643F",
    "assets/works/refinery/evidence/cycle_002/works_top_clay_1to1.png": "B86A37BC8373A73D68C68AE9458F582A6660F0B2F83BD2C5295051F5ED1B80DC",
    "assets/works/refinery/evidence/cycle_002/works_visible_faces.json": "2BB7A06C91ABCCACDED501AEE47C8930DC75229608B7C3B0467BCB18662E102C",
}
REF_IMAGES = (
    ROOT / "assets" / "concept" / "archetypes" / "concept_station_refinery.jpg",
    ROOT / "assets" / "concept" / "archetypes" / "concept_station_mining.jpg",
    ROOT / "assets" / "concept" / "landmarks" / "concept_landmark_driller.jpg",
)


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1 << 20), b""):
            digest.update(chunk)
    return digest.hexdigest().upper()


def write_text_lf(path: Path, text: str) -> None:
    """Write tracked receipts deterministically on Windows without CRLF churn."""
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="\n") as stream:
        stream.write(text)


def argv_after():
    if "--" in sys.argv:
        return sys.argv[sys.argv.index("--") + 1 :]
    return []


def object_mode():
    try:
        if bpy.context.object and bpy.context.object.mode != "OBJECT":
            bpy.ops.object.mode_set(mode="OBJECT")
    except Exception:
        pass


def reset_scene():
    object_mode()
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
    tmp = path.with_name(path.name + ".tmp")
    tmp.write_bytes(bytes(data))
    tmp.replace(path)


def apply_modifiers(obj):
    if obj is None or obj.type != "MESH":
        return obj
    object_mode()
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    names = [mod.name for mod in obj.modifiers]
    for name in names:
        try:
            bpy.ops.object.modifier_apply(modifier=name)
        except Exception:
            remaining = obj.modifiers.get(name)
            if remaining is not None:
                obj.modifiers.remove(remaining)
    obj.select_set(False)
    return obj


def count_tris(obj):
    if obj is None or obj.type != "MESH" or not obj.data:
        return 0
    return sum(max(0, len(p.vertices) - 2) for p in obj.data.polygons)


def link_new(obj, collection):
    for current in list(obj.users_collection):
        current.objects.unlink(obj)
    collection.objects.link(obj)
    return obj


def add_mesh(name, verts, faces, material, collection, bevel=0.0, role=None):
    mesh = bpy.data.meshes.new(f"{name}_Mesh")
    mesh.from_pydata([tuple(v) for v in verts], [], [tuple(f) for f in faces])
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)
    if material is not None:
        obj.data.materials.clear()
        obj.data.materials.append(material)
    if role:
        obj["spacefaceRole"] = role
        if material is not None:
            material["spacefaceRole"] = role
    if bevel > 0:
        mod = obj.modifiers.new("ProductionBevel", "BEVEL")
        mod.width = bevel
        mod.segments = 2 if bevel >= 0.008 else 1
        mod.limit_method = "ANGLE"
        mod.angle_limit = math.radians(40)
    return obj


def loft_rings(name, rings, material, collection, bevel=0.0, cap=True, role=None):
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
    return add_mesh(name, verts, faces, material, collection, bevel, role)


def loft_shell(name, outer, inner, material, collection, bevel=0.0, role=None):
    """Closed wall between outer rings and inner rings (same count, same sides)."""
    if len(outer) != len(inner) or len(outer[0]) != len(inner[0]):
        raise RuntimeError(f"shell ring mismatch for {name}")
    n_st = len(outer)
    sides = len(outer[0])
    verts = [v for ring in outer for v in ring] + [v for ring in inner for v in ring]
    inner0 = n_st * sides
    faces = []
    for station in range(n_st - 1):
        a = station * sides
        b = (station + 1) * sides
        ia = inner0 + a
        ib = inner0 + b
        for i in range(sides):
            j = (i + 1) % sides
            faces.append((a + i, a + j, b + j, b + i))
            faces.append((ia + i, ib + i, ib + j, ia + j))
    # bottom annulus
    for i in range(sides):
        j = (i + 1) % sides
        faces.append((i, inner0 + i, inner0 + j, j))
    # top annulus
    a = (n_st - 1) * sides
    ia = inner0 + a
    for i in range(sides):
        j = (i + 1) % sides
        faces.append((a + i, a + j, ia + j, ia + i))
    return add_mesh(name, verts, faces, material, collection, bevel, role)


def rounded_rect(cx, cy, hx, hy, corner, z, n_arc):
    corner = min(corner, hx * 0.95, hy * 0.95)
    pts = []
    corners = (
        (cx + hx - corner, cy + hy - corner, 0.0, 0.5 * math.pi),
        (cx - hx + corner, cy + hy - corner, 0.5 * math.pi, math.pi),
        (cx - hx + corner, cy - hy + corner, math.pi, 1.5 * math.pi),
        (cx + hx - corner, cy - hy + corner, 1.5 * math.pi, 2.0 * math.pi),
    )
    for ox, oy, a0, a1 in corners:
        for i in range(max(1, n_arc)):
            t = i / float(max(1, n_arc))
            ang = a0 + (a1 - a0) * t
            pts.append((ox + math.cos(ang) * corner, oy + math.sin(ang) * corner, z))
    return pts


def jacket_plan(cx, cy, hx, hy, chamfer, z, n_side=1):
    """Formed insulated-jacket plan: straight courses and hard corner returns.

    An 8-sided chamfered rectangle, not a rounded box. n_side subdivides each
    course/return so LODs can share the same silhouette.
    """
    ch = min(max(chamfer, 0.012), hx * 0.42, hy * 0.42)
    pts = [
        (cx + hx, cy + hy - ch, z),
        (cx + hx - ch, cy + hy, z),
        (cx - hx + ch, cy + hy, z),
        (cx - hx, cy + hy - ch, z),
        (cx - hx, cy - hy + ch, z),
        (cx - hx + ch, cy - hy, z),
        (cx + hx - ch, cy - hy, z),
        (cx + hx, cy - hy + ch, z),
    ]
    n_side = max(1, int(n_side))
    if n_side == 1:
        return pts
    out = []
    for i in range(8):
        ax, ay, az = pts[i]
        bx, by, bz = pts[(i + 1) % 8]
        for k in range(n_side):
            t = k / float(n_side)
            out.append((ax + (bx - ax) * t, ay + (by - ay) * t, az + (bz - az) * t))
    return out


def circle_ring(cx, cy, radius, z, n, twist=0.0):
    return [
        (
            cx + math.cos(twist + i * 2.0 * math.pi / n) * radius,
            cy + math.sin(twist + i * 2.0 * math.pi / n) * radius,
            z,
        )
        for i in range(n)
    ]


def circle_in_plane(center, tangent, radius, n, up=Vector((0, 0, 1))):
    t = Vector(tangent)
    if t.length < 1e-8:
        t = Vector((1, 0, 0))
    t.normalize()
    binormal = t.cross(Vector(up))
    if binormal.length < 1e-6:
        binormal = t.cross(Vector((0, 1, 0)))
    if binormal.length < 1e-6:
        binormal = t.cross(Vector((1, 0, 0)))
    binormal.normalize()
    normal = binormal.cross(t).normalized()
    c = Vector(center)
    return [
        tuple(c + (math.cos(i * 2.0 * math.pi / n) * radius) * binormal
              + (math.sin(i * 2.0 * math.pi / n) * radius) * normal)
        for i in range(n)
    ]


def rect_in_plane(center, tangent, hx, hy, up=Vector((0, 0, 1))):
    t = Vector(tangent)
    if t.length < 1e-8:
        t = Vector((1, 0, 0))
    t.normalize()
    binormal = t.cross(Vector(up))
    if binormal.length < 1e-6:
        binormal = t.cross(Vector((0, 1, 0)))
    binormal.normalize()
    normal = binormal.cross(t).normalized()
    c = Vector(center)
    corners = ((hx, hy), (-hx, hy), (-hx, -hy), (hx, -hy))
    return [tuple(c + x * binormal + y * normal) for x, y in corners]


def rect_n_in_plane(center, tangent, hx, hy, n, up=Vector((0, 0, 1))):
    """Rectangle resampled to n points (n multiple of 4) so it can loft into a circle."""
    n = max(4, (n // 4) * 4)
    corners = [Vector(p) for p in rect_in_plane(center, tangent, hx, hy, up)]
    per = n // 4
    out = []
    for i in range(4):
        a = corners[i]
        b = corners[(i + 1) % 4]
        for k in range(per):
            out.append(tuple(a.lerp(b, k / float(per))))
    return out


def chamfer_path(points, cut):
    if len(points) < 3:
        return [Vector(p) for p in points]
    pts = [Vector(p) for p in points]
    out = [pts[0]]
    for i in range(1, len(pts) - 1):
        prev, cur, nxt = pts[i - 1], pts[i], pts[i + 1]
        a = (cur - prev)
        b = (nxt - cur)
        la, lb = a.length, b.length
        if la < 1e-6 or lb < 1e-6:
            out.append(cur)
            continue
        d = min(cut, 0.42 * la, 0.42 * lb)
        out.append(cur - a.normalized() * d)
        out.append(cur + b.normalized() * d)
    out.append(pts[-1])
    return out


def pipe_along(name, points, radius, n, material, collection, bevel, role, cut=None):
    # Small cut keeps elbows as miters instead of a fat torus.
    path = chamfer_path(points, cut if cut is not None else max(radius * 0.9, 0.016))
    rings = []
    for i, p in enumerate(path):
        if i == 0:
            tang = path[1] - path[0]
        elif i == len(path) - 1:
            tang = path[-1] - path[-2]
        else:
            tang = path[i + 1] - path[i - 1]
        rings.append(circle_in_plane(p, tang, radius, n))
    return loft_rings(name, rings, material, collection, bevel, True, role)


def box_mesh(name, cx, cy, cz, hx, hy, hz, material, collection, bevel, role):
    verts = [
        (cx - hx, cy - hy, cz - hz), (cx + hx, cy - hy, cz - hz),
        (cx + hx, cy + hy, cz - hz), (cx - hx, cy + hy, cz - hz),
        (cx - hx, cy - hy, cz + hz), (cx + hx, cy - hy, cz + hz),
        (cx + hx, cy + hy, cz + hz), (cx - hx, cy + hy, cz + hz),
    ]
    faces = [
        (0, 1, 2, 3), (4, 7, 6, 5), (0, 4, 5, 1),
        (1, 5, 6, 2), (2, 6, 7, 3), (3, 7, 4, 0),
    ]
    return add_mesh(name, verts, faces, material, collection, bevel, role)


def freeze_lock(lock, label):
    missing = []
    mismatched = []
    for rel, expected in lock.items():
        path = ROOT / rel
        if not path.exists():
            missing.append(rel)
            continue
        actual = sha256(path)
        if actual != expected:
            mismatched.append((rel, expected, actual))
    if missing or mismatched:
        raise RuntimeError(f"{label} evidence mutated: missing={missing} mismatched={mismatched}")


def freeze_cycle01():
    freeze_lock(CYCLE01_LOCK, "Cycle 01")


def freeze_cycle02():
    freeze_lock(CYCLE02_LOCK, "Cycle 02")


def assert_prior_cycles_untouched():
    freeze_cycle01()
    freeze_cycle02()
    if EVID_DIR.resolve() in {CYCLE01_DIR.resolve(), CYCLE02_DIR.resolve()}:
        raise RuntimeError("Cycle 03 builder must not write into cycle_001 or cycle_002")


def flange_at(name, center, tangent, radius, thick, material, collection, bevel, role, n=10):
    c = Vector(center)
    t = Vector(tangent).normalized()
    rings = [
        circle_in_plane(c - t * thick * 0.5, t, radius, n),
        circle_in_plane(c + t * thick * 0.5, t, radius, n),
    ]
    return loft_rings(name, rings, material, collection, bevel, True, role)


def hex_bolt(name, loc, axis, radius, depth, material, collection, role):
    c = Vector(loc)
    t = Vector(axis).normalized()
    rings = [
        circle_in_plane(c - t * depth * 0.5, t, radius, 6),
        circle_in_plane(c + t * depth * 0.5, t, radius * 0.72, 6),
    ]
    return loft_rings(name, rings, material, collection, 0.0, True, role)


def principled(material):
    material.use_nodes = True
    material.node_tree.nodes.clear()
    output = material.node_tree.nodes.new("ShaderNodeOutputMaterial")
    bsdf = material.node_tree.nodes.new("ShaderNodeBsdfPrincipled")
    material.node_tree.links.new(bsdf.outputs["BSDF"], output.inputs["Surface"])
    return bsdf


def make_role_materials(lod):
    mats = {}
    for role, rgb in ROLE_ID_RGB.items():
        mat = bpy.data.materials.new(f"Material_{role}_LOD{lod}")
        mat.name = f"Material_{role}_LOD{lod}"
        bsdf = principled(mat)
        albedo = ROLE_ALBEDO.get(role, rgb)
        bsdf.inputs["Base Color"].default_value = (*albedo, 1.0)
        bsdf.inputs["Roughness"].default_value = ROLE_ROUGH.get(role, 0.5)
        bsdf.inputs["Metallic"].default_value = ROLE_METAL.get(role, 0.0)
        if role in {"slit", "lamp"}:
            # Beauty stills keep the throat dark and the lamp a fixture, not a speck.
            strength = 0.0
            if "Emission Color" in bsdf.inputs:
                bsdf.inputs["Emission Color"].default_value = (*ROLE_ALBEDO[role], 1.0)
            if "Emission Strength" in bsdf.inputs:
                bsdf.inputs["Emission Strength"].default_value = strength
        mat["spacefaceRole"] = role
        mats[role] = mat
    return mats


def make_atlas_material(lod, maps, emit_strength=0.0):
    mat = bpy.data.materials.new(f"Material_Refinery_LOD{lod}")
    mat.name = f"Material_Refinery_LOD{lod}"
    bsdf = principled(mat)
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    uv0 = nodes.new("ShaderNodeUVMap")
    uv0.uv_map = "UVMap"
    tex_a = nodes.new("ShaderNodeTexImage")
    tex_a.image = maps["basecolor"]
    tex_o = nodes.new("ShaderNodeTexImage")
    tex_o.image = maps["orm"]
    tex_n = nodes.new("ShaderNodeTexImage")
    tex_n.image = maps["normal"]
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
    if "Coat Weight" in bsdf.inputs:
        bsdf.inputs["Coat Weight"].default_value = 0.0
        bsdf.inputs["Coat Roughness"].default_value = 0.90
    if "Specular IOR Level" in bsdf.inputs:
        bsdf.inputs["Specular IOR Level"].default_value = 0.18
    if emit_strength and "Emission Strength" in bsdf.inputs:
        bsdf.inputs["Emission Strength"].default_value = emit_strength
    mat["spacefaceRole"] = "atlas"
    return mat


def write_pixels(name, pixels, size, colorspace="sRGB"):
    if name in bpy.data.images:
        bpy.data.images.remove(bpy.data.images[name])
    img = bpy.data.images.new(name, width=size, height=size, alpha=True)
    img.colorspace_settings.name = colorspace
    img.pixels.foreach_set(np.ascontiguousarray(pixels, dtype=np.float32).ravel())
    TEX_DIR.mkdir(parents=True, exist_ok=True)
    path = TEX_DIR / f"{name}.png"
    img.filepath_raw = str(path)
    img.file_format = "PNG"
    img.save()
    sanitize_png(path)
    img.pack()
    img.filepath_raw = str(path)
    return img, path


def image_np(img):
    w, h = img.size
    arr = np.zeros(w * h * 4, dtype=np.float32)
    img.pixels.foreach_get(arr)
    return arr.reshape(h, w, 4)


def h01(x, y, s=0):
    x = np.asarray(x, dtype=np.uint32)
    y = np.asarray(y, dtype=np.uint32)
    v = x * np.uint32(374761393) + y * np.uint32(668265263) + np.uint32(int(s) * 362437)
    v = (v ^ (v >> np.uint32(13))) * np.uint32(1274126177)
    v = v ^ (v >> np.uint32(16))
    return (v & np.uint32(255)).astype(np.float32) / np.float32(255.0)


def finish_low(obj, angle=SHADE_ANGLE):
    object_mode()
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    try:
        bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    except Exception:
        pass
    apply_modifiers(obj)
    try:
        bpy.ops.object.mode_set(mode="EDIT")
        bpy.ops.mesh.select_all(action="SELECT")
        try:
            bpy.ops.mesh.remove_doubles(threshold=0.0005)
        except TypeError:
            bpy.ops.mesh.merge_by_distance(distance=0.0005)
        bpy.ops.mesh.normals_make_consistent(inside=False)
        bpy.ops.object.mode_set(mode="OBJECT")
    except Exception:
        object_mode()
    try:
        bpy.ops.object.shade_smooth_by_angle(angle=math.radians(angle))
    except Exception:
        for poly in obj.data.polygons:
            poly.use_smooth = True
    wn = obj.modifiers.new("WeightedNormal", "WEIGHTED_NORMAL")
    wn.keep_sharp = True
    apply_modifiers(obj)
    obj.select_set(False)
    return obj


def unique_uv(obj, margin=0.010):
    object_mode()
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(angle_limit=66.0, island_margin=margin, scale_to_bounds=False)
    try:
        bpy.ops.uv.average_islands_scale()
    except Exception:
        pass
    try:
        bpy.ops.uv.pack_islands(margin=margin)
    except TypeError:
        try:
            bpy.ops.uv.pack_islands(rotate=True, margin=margin)
        except Exception:
            pass
    bpy.ops.object.mode_set(mode="OBJECT")
    obj.select_set(False)
    return uv_overlap_count(obj)


def uv_overlap_count(obj):
    if obj.type != "MESH" or not obj.data.uv_layers.active:
        return 0
    object_mode()
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.uv.select_all(action="DESELECT")
    overlapped = 0
    try:
        bpy.ops.uv.select_overlap()
        mesh = obj.data
        uv = mesh.uv_layers.active
        # Switching to object to read selection is version-sensitive; count via bmesh.
        import bmesh
        bm = bmesh.from_edit_mesh(mesh)
        uv_layer = bm.loops.layers.uv.active
        if uv_layer is not None:
            for face in bm.faces:
                for loop in face.loops:
                    if loop[uv_layer].select:
                        overlapped += 1
        bm.free()
    except Exception:
        overlapped = 0
    bpy.ops.object.mode_set(mode="OBJECT")
    obj.select_set(False)
    return int(overlapped)


def triangulate(obj):
    object_mode()
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    tri = obj.modifiers.new("ExportTriangulate", "TRIANGULATE")
    tri.quad_method = "FIXED"
    apply_modifiers(obj)
    obj.select_set(False)
    return obj


def join_objects(objects, name):
    objects = [obj for obj in objects if obj is not None and obj.type == "MESH" and obj.data]
    objects = sorted(objects, key=lambda o: o.name)
    if not objects:
        return None
    object_mode()
    bpy.ops.object.select_all(action="DESELECT")
    for obj in objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    if len(objects) > 1:
        bpy.ops.object.join()
    objects[0].name = name
    if objects[0].data:
        objects[0].data.name = name
    objects[0].select_set(False)
    return objects[0]


def duplicate_obj(obj, name, collection):
    dup = obj.copy()
    dup.data = obj.data.copy()
    dup.name = name
    collection.objects.link(dup)
    return dup


def inflate_mesh(obj, amount):
    mesh = obj.data
    try:
        mesh.calc_normals_split()
    except Exception:
        pass
    mesh.update()
    for vert in mesh.vertices:
        normal = Vector(vert.normal)
        if normal.length < 1e-8:
            normal = Vector((0.0, 0.0, 1.0))
        vert.co = vert.co + normal.normalized() * float(amount)
    mesh.update()
    return obj


def parent_keep(obj, parent):
    # Fresh empties do not report authored location through matrix_world until
    # the dependency graph evaluates. The parent-inverse cancellation used in
    # Cycle 03 preserved Blender world placement but exported hook/collision
    # empties at identity while leaving mesh children at absolute coordinates.
    # Runtime lights and site-register lamp scaling then pivoted at the origin.
    bpy.context.view_layer.update()
    mw = obj.matrix_world.copy()
    obj.parent = parent
    obj.matrix_parent_inverse = Matrix.Identity(4)
    obj.matrix_basis = parent.matrix_world.inverted() @ mw


def add_empty(name, loc, collection, parent=None, size=0.08):
    obj = bpy.data.objects.new(name, None)
    collection.objects.link(obj)
    obj.empty_display_type = "PLAIN_AXES"
    obj.empty_display_size = size
    if parent is not None:
        bpy.context.view_layer.update()
        obj.parent = parent
        obj.matrix_parent_inverse = Matrix.Identity(4)
    obj.location = Vector(loc)
    obj["socket"] = True
    obj["spacefaceSocket"] = True
    obj["spaceface"] = {"socket": True, "role": "works_hook"}
    return obj


# ---------------------------------------------------------------------------
# Geometry
# ---------------------------------------------------------------------------

def lod_res(lod):
    if lod == 0:
        return dict(n_side=2, n_circ=10, n_pipe=8, straps=True, bolts=True, baffles=True, door=True, gussets=4, corners=True)
    if lod == 1:
        return dict(n_side=1, n_circ=8, n_pipe=6, straps=True, bolts=False, baffles=True, door=True, gussets=2, corners=False)
    return dict(n_side=1, n_circ=6, n_pipe=5, straps=False, bolts=False, baffles=False, door=False, gussets=0, corners=False)


def build_furnace(lod, mats, collection, bevel):
    """Formed insulated jacket: waist belt, courses, corner returns, deep blind throat."""
    res = lod_res(lod)
    n_side = res["n_side"]
    body_parts = []
    ch_skirt, ch_body, ch_crown, ch_mouth = 0.070, 0.055, 0.048, 0.028

    def jplan(hx, hy, ch, z):
        return jacket_plan(FX, FY, hx, hy, ch, z, n_side)

    # Solid lower jacket: flared skirt, then a hold that caps the well (blind).
    if lod == 0:
        lower_stations = (
            (F_Z0, FHX * 1.12, FHY * 1.14, ch_skirt),
            (0.20, FHX * 1.04, FHY * 1.05, ch_body),
            (0.24, FHX * 1.00, FHY * 1.00, ch_body),
            (WELL_FLOOR, FHX * 0.98, FHY * 0.97, ch_body),
        )
    else:
        lower_stations = (
            (F_Z0, FHX * 1.10, FHY * 1.12, ch_skirt),
            (0.22, FHX * 1.00, FHY * 1.00, ch_body),
            (WELL_FLOOR, FHX * 0.98, FHY * 0.97, ch_body),
        )
    body_parts.append(loft_rings(
        "Furnace_Lower",
        [jplan(hx, hy, ch, z) for z, hx, hy, ch in lower_stations],
        mats["structure"], collection, bevel, True, "structure",
    ))

    # Upper jacket: waist inset belt, two courses, stepped crown. Inner opening is the mouth.
    if lod == 0:
        wall_stations = (
            (WELL_FLOOR, FHX * 0.98, FHY * 0.97, ch_body),
            (0.34, FHX * 0.78, FHY * 0.76, ch_body),   # waist inset
            (0.42, FHX * 0.78, FHY * 0.76, ch_body),   # waist hold
            (0.50, FHX * 1.00, FHY * 0.98, ch_body),   # course 2 return
            (0.62, FHX * 0.98, FHY * 0.94, ch_crown),  # broad shoulder course
            (F_CROWN, FHX * 0.78, FHY * 0.72, ch_crown),
        )
    elif lod == 1:
        wall_stations = (
            (WELL_FLOOR, FHX * 0.98, FHY * 0.97, ch_body),
            (0.38, FHX * 0.79, FHY * 0.77, ch_body),
            (0.50, FHX * 1.00, FHY * 0.98, ch_body),
            (F_CROWN, FHX * 0.80, FHY * 0.74, ch_crown),
        )
    else:
        wall_stations = (
            (WELL_FLOOR, FHX * 0.98, FHY * 0.97, ch_body),
            (0.40, FHX * 0.82, FHY * 0.80, ch_body),
            (F_CROWN, FHX * 0.80, FHY * 0.74, ch_crown),
        )
    mouth_hx, mouth_hy = SLIT_HX + 0.010, SLIT_HY + 0.010
    floor_hx, floor_hy = SLIT_HX * 0.40, SLIT_HY * 0.38
    outer = [jplan(hx, hy, ch, z) for z, hx, hy, ch in wall_stations]
    inner = []
    n_wall = len(wall_stations)
    for i, (z, hx, hy, ch) in enumerate(wall_stations):
        t = i / max(1, n_wall - 1)
        # Taper the jacket inner so walls and floor separate in plan.
        ihx = floor_hx + (mouth_hx - floor_hx) * t
        ihy = floor_hy + (mouth_hy - floor_hy) * t
        inner.append(jacket_plan(FX, FY, ihx, ihy, ch_mouth, z, n_side))
    body_parts.append(loft_shell("Furnace_Jacket", outer, inner, mats["structure"], collection, bevel, "structure"))

    # Thin dark steel lip — not a copper picture-frame.
    if lod < 2:
        lip_z0, lip_z1 = F_CROWN - 0.004, F_CROWN + 0.010
        lip_out_h, lip_out_v = SLIT_HX + 0.016, SLIT_HY + 0.014
        lip_in_h, lip_in_v = SLIT_HX - 0.002, SLIT_HY - 0.002
        lip_outer = [
            jacket_plan(FX, FY, lip_out_h, lip_out_v, 0.022, lip_z0, n_side),
            jacket_plan(FX, FY, lip_out_h, lip_out_v, 0.022, lip_z1, n_side),
        ]
        lip_inner = [
            jacket_plan(FX, FY, lip_in_h, lip_in_v, 0.018, lip_z0, n_side),
            jacket_plan(FX, FY, lip_in_h * 0.99, lip_in_v * 0.99, 0.016, lip_z1, n_side),
        ]
        body_parts.append(loft_shell("Furnace_Lip", lip_outer, lip_inner, mats["structure"], collection, bevel * 0.4, "structure"))

    # Soot-dark refractory liner: aggressive taper so inner walls and floor both read at 120 px.
    if lod == 0:
        well_z = (WELL_FLOOR + 0.008, 0.46, 0.62, F_CROWN - 0.010)
        scales = (0.40, 0.62, 0.84, 0.97)
    elif lod == 1:
        well_z = (WELL_FLOOR + 0.008, 0.50, F_CROWN - 0.010)
        scales = (0.40, 0.72, 0.97)
    else:
        well_z = ()
        scales = ()
    well_outer = []
    well_inner = []
    for z, scale in zip(well_z, scales):
        well_outer.append(jacket_plan(FX, FY, SLIT_HX * 0.98, SLIT_HY * 0.96, 0.022, z, n_side))
        well_inner.append(jacket_plan(FX, FY, SLIT_HX * scale, SLIT_HY * scale * 0.90, 0.016, z, n_side))
    if well_outer:
        body_parts.append(loft_shell("Furnace_Well", well_outer, well_inner, mats["refractory"], collection, bevel * 0.3, "refractory"))

    if lod < 2:
        floor_scale_o, floor_scale_i = 0.42, 0.26
        floor_outer = jacket_plan(FX, FY, SLIT_HX * floor_scale_o, SLIT_HY * floor_scale_o * 0.92, 0.014, WELL_FLOOR + 0.012, n_side)
        floor_inner = jacket_plan(FX, FY, SLIT_HX * floor_scale_i, SLIT_HY * floor_scale_i * 0.90, 0.010, WELL_FLOOR + 0.012, n_side)
        floor_outer_b = jacket_plan(FX, FY, SLIT_HX * floor_scale_o, SLIT_HY * floor_scale_o * 0.92, 0.014, WELL_FLOOR + 0.004, n_side)
        floor_inner_b = jacket_plan(FX, FY, SLIT_HX * floor_scale_i, SLIT_HY * floor_scale_i * 0.90, 0.010, WELL_FLOOR + 0.004, n_side)
        body_parts.append(loft_shell(
            "Furnace_WellFloor",
            [floor_outer_b, floor_outer], [floor_inner_b, floor_inner],
            mats["refractory"], collection, 0.0, "refractory",
        ))
    ember = loft_rings(
        "Furnace_SlitLens",
        [
            jacket_plan(FX, FY, SLIT_HX * 0.24, SLIT_HY * 0.22, 0.010, WELL_FLOOR + 0.006, n_side),
            jacket_plan(FX, FY, SLIT_HX * 0.20, SLIT_HY * 0.18, 0.008, WELL_FLOOR + 0.014, n_side),
        ],
        mats["slit"], collection, 0.0, True, "slit",
    )

    # Course straps sit in the waist and shoulder insets.
    if res["straps"]:
        clamp_zs = (0.38, 0.50, 0.62) if lod == 0 else ((0.38, 0.58) if lod == 1 else ())
        for i, z in enumerate(clamp_zs):
            hx = FHX * (0.78 if i == 0 else 0.98)
            hy = FHY * (0.76 if i == 0 else 0.94)
            body_parts.append(box_mesh(
                f"Furnace_ClampX_{i}",
                FX + hx + 0.016, FY, z, 0.014, 0.038, 0.018,
                mats["hotmetal"], collection, bevel * 0.3, "hotmetal",
            ))
            if lod == 0:
                body_parts.append(box_mesh(
                    f"Furnace_ClampY_{i}",
                    FX, FY - hy - 0.014, z,
                    0.038, 0.012, 0.018,
                    mats["hotmetal"], collection, bevel * 0.3, "hotmetal",
                ))

    # Structural corner returns — folded plate at each chamfer, proud of the body.
    if res.get("corners"):
        ch = ch_body
        corners = (
            (FX + FHX * 0.98 - ch * 0.10, FY + FHY * 0.94 - ch * 0.10, 1, 1),
            (FX - FHX * 0.98 + ch * 0.10, FY + FHY * 0.94 - ch * 0.10, -1, 1),
            (FX - FHX * 0.98 + ch * 0.10, FY - FHY * 0.94 + ch * 0.10, -1, -1),
            (FX + FHX * 0.98 - ch * 0.10, FY - FHY * 0.94 + ch * 0.10, 1, -1),
        )
        z0, z1 = F_Z0 + 0.02, F_CROWN - 0.015
        for i, (px, py, sx, sy) in enumerate(corners):
            body_parts.append(box_mesh(
                f"Furnace_CornerReturnX_{i}",
                px + sx * 0.036, py, (z0 + z1) * 0.5,
                0.040, 0.014, (z1 - z0) * 0.5,
                mats["structure"], collection, bevel * 0.2, "structure",
            ))
            body_parts.append(box_mesh(
                f"Furnace_CornerReturnY_{i}",
                px, py + sy * 0.036, (z0 + z1) * 0.5,
                0.014, 0.040, (z1 - z0) * 0.5,
                mats["structure"], collection, bevel * 0.2, "structure",
            ))

    # Four tapered gusseted feet with a visible pad gap under the jacket.
    foot_pts = (
        (FX - FHX * 0.82, FY - FHY * 0.82),
        (FX + FHX * 0.82, FY - FHY * 0.82),
        (FX - FHX * 0.82, FY + FHY * 0.76),
        (FX + FHX * 0.62, FY + FHY * 0.76),
    )
    for i, (px, py) in enumerate(foot_pts):
        if lod == 0:
            rings = [
                jacket_plan(px, py, 0.062, 0.050, 0.010, 0.0, 1),
                jacket_plan(px, py, 0.058, 0.046, 0.009, 0.018, 1),
                jacket_plan(px, py, 0.038, 0.030, 0.007, 0.08, 1),
                jacket_plan(px, py, 0.026, 0.020, 0.005, F_Z0 - 0.004, 1),
            ]
        elif lod == 1:
            rings = [
                jacket_plan(px, py, 0.056, 0.044, 0.008, 0.0, 1),
                jacket_plan(px, py, 0.026, 0.020, 0.005, F_Z0 - 0.004, 1),
            ]
        else:
            rings = [
                rounded_rect(px, py, 0.050, 0.038, 0.008, 0.0, 1),
                rounded_rect(px, py, 0.024, 0.018, 0.005, F_Z0 - 0.004, 1),
            ]
        body_parts.append(loft_rings(f"Furnace_Foot_{i}", rings, mats["structure"], collection, bevel * 0.35, True, "structure"))
        if i < res.get("gussets", 0):
            inward_x = math.copysign(0.11, FX - px + 0.001)
            inward_y = math.copysign(0.04, FY - py + 0.001)
            body_parts.append(add_mesh(
                f"Furnace_Gusset_{i}",
                [
                    (px, py + 0.010, 0.020),
                    (px + inward_x, py + inward_y + 0.010, 0.020),
                    (px + inward_x, py + inward_y + 0.010, 0.07),
                    (px, py + 0.010, F_Z0 + 0.02),
                    (px, py - 0.010, 0.020),
                    (px + inward_x, py + inward_y - 0.010, 0.020),
                    (px + inward_x, py + inward_y - 0.010, 0.07),
                    (px, py - 0.010, F_Z0 + 0.02),
                ],
                [(0, 1, 2, 3), (4, 7, 6, 5), (0, 4, 5, 1), (1, 5, 6, 2), (2, 6, 7, 3), (3, 7, 4, 0)],
                mats["structure"], collection, bevel * 0.2, "structure",
            ))

    if res["door"]:
        dx = FX + FHX * 0.92
        body_parts.append(box_mesh(
            "Furnace_Door", dx + 0.006, FY, 0.40, 0.014, 0.10, 0.12,
            mats["structure"], collection, bevel * 0.3, "structure",
        ))
        body_parts.append(loft_rings(
            "Furnace_Hinge",
            [
                circle_ring(dx + 0.006, FY - 0.11, 0.010, 0.30, max(6, res["n_circ"] // 2)),
                circle_ring(dx + 0.006, FY - 0.11, 0.010, 0.50, max(6, res["n_circ"] // 2)),
            ],
            mats["hotmetal"], collection, 0.0, True, "hotmetal",
        ))

    return body_parts, ember


def build_burner(lod, mats, collection, bevel):
    if lod == 2:
        return []
    res = lod_res(lod)
    parts = []
    y0 = FY - FHY * 0.98
    n_arc = max(1, res["n_side"])
    rings = [
        rounded_rect(FX - 0.06, y0 - 0.018, 0.18, 0.044, 0.016, 0.22, n_arc),
        rounded_rect(FX - 0.06, y0 - 0.050, 0.168, 0.048, 0.016, 0.34, n_arc),
        rounded_rect(FX - 0.06, y0 - 0.038, 0.155, 0.036, 0.014, 0.48, n_arc),
    ]
    parts.append(loft_rings("Burner_Plenum", rings, mats["hotmetal"], collection, bevel, True, "hotmetal"))
    n = max(6, res["n_circ"] // 2)
    nozzle_xs = (FX - 0.18, FX - 0.06, FX + 0.06) if lod == 0 else ((FX - 0.08, FX + 0.04) if lod == 1 else ())
    for i, x in enumerate(nozzle_xs):
        parts.append(loft_rings(
            f"Burner_Nozzle_{i}",
            [
                circle_ring(x, y0 - 0.08, 0.026, 0.30, n),
                circle_ring(x, y0 - 0.12, 0.020, 0.30, n),
                circle_ring(x, y0 - 0.145, 0.012, 0.30, n),
            ],
            mats["hotmetal"], collection, bevel * 0.25, True, "hotmetal",
        ))
    if lod < 2:
        parts.append(flange_at(
            "Burner_Flange", (FX - 0.22, y0 - 0.02, 0.38), (1, 0, 0),
            0.042, 0.016, mats["hotmetal"], collection, 0.0, "hotmetal", n=n,
        ))
        # Access lid on the plenum crown.
        parts.append(box_mesh(
            "Burner_Lid", FX - 0.06, y0 - 0.04, 0.475, 0.12, 0.032, 0.010,
            mats["hotmetal"], collection, bevel * 0.3, "hotmetal",
        ))
        if lod == 0:
            parts.append(box_mesh(
                "Burner_LidHandle", FX - 0.06, y0 - 0.04, 0.492, 0.028, 0.010, 0.008,
                mats["structure"], collection, 0.0, "structure",
            ))
    return parts


def build_stack(lod, mats, collection, bevel):
    """Rooted flue: rect takeoff, banded rect-to-round, mitered elbow with unions, rain-capped stack."""
    res = lod_res(lod)
    n = res["n_circ"]
    parts = []
    face_y = FY + FHY * 0.88
    take_z = 0.56
    hx, hy = 0.062, 0.042
    n_fl = max(6, n)
    spool_r = 0.038

    # 1. Rectangular takeoff stub from the furnace +Y shoulder.
    take_pts = [
        Vector((FX, face_y - 0.01, take_z)),
        Vector((FX, face_y + 0.08, take_z)),
    ]
    if lod < 2:
        take_outer = [rect_in_plane(p, (0, 1, 0), hx, hy) for p in take_pts]
        take_inner = [rect_in_plane(p, (0, 1, 0), hx - 0.012, hy - 0.010) for p in take_pts]
        parts.append(loft_shell("Flue_Takeoff", take_outer, take_inner, mats["hotmetal"], collection, bevel * 0.35, "hotmetal"))
        parts.append(flange_at(
            "Flue_TakeoffFlange", (FX, face_y + 0.02, take_z), (0, 1, 0),
            0.072, 0.014, mats["hotmetal"], collection, 0.0, "hotmetal", n=n_fl,
        ))
    else:
        parts.append(pipe_along(
            "Flue_Takeoff",
            [(FX, face_y - 0.01, take_z), (FX, face_y + 0.08, take_z)],
            spool_r, max(5, n // 2), mats["hotmetal"], collection, 0.0, "hotmetal", cut=0.01,
        ))

    # 2. Banded rect-to-round transition (not a copper bar).
    trans_y = face_y + 0.08
    n_trans = max(8, (n // 4) * 4)
    elbow_y = trans_y + 0.16
    if lod < 2:
        parts.append(loft_rings(
            "Flue_Transition",
            [
                rect_n_in_plane((FX, trans_y, take_z), (0, 1, 0), hx * 0.90, hy * 0.90, n_trans),
                circle_in_plane((FX, trans_y + 0.035, take_z), (0, 1, 0), 0.046, n_trans),
                circle_in_plane((FX, trans_y + 0.070, take_z), (0, 1, 0), 0.040, n_trans),
            ],
            mats["hotmetal"], collection, bevel * 0.25, True, "hotmetal",
        ))
        for i, dy in enumerate((0.018, 0.048)):
            parts.append(loft_rings(
                f"Flue_Band_{i}",
                [
                    circle_in_plane((FX, trans_y + dy, take_z), (0, 1, 0), 0.052, n_trans),
                    circle_in_plane((FX, trans_y + dy + 0.012, take_z), (0, 1, 0), 0.052, n_trans),
                ],
                mats["hotmetal"], collection, 0.0, True, "hotmetal",
            ))
        parts.append(flange_at(
            "Flue_Union", (FX, trans_y + 0.074, take_z), (0, 1, 0),
            0.058, 0.016, mats["hotmetal"], collection, 0.0, "hotmetal", n=n_fl,
        ))
        # 3. Discrete mitered elbow: +Y spool, corner union, +X spool, stack inlet flange.
        parts.append(pipe_along(
            "Flue_SpoolY",
            [(FX, trans_y + 0.074, take_z), (FX, elbow_y, take_z)],
            spool_r, max(5, n // 2), mats["hotmetal"], collection, bevel * 0.15, "hotmetal", cut=0.01,
        ))
        parts.append(flange_at(
            "Flue_ElbowUnion", (FX + 0.01, elbow_y, take_z), (1, 0, 0),
            spool_r + 0.018, 0.018, mats["hotmetal"], collection, 0.0, "hotmetal", n=max(6, n // 2),
        ))
        parts.append(pipe_along(
            "Flue_SpoolX",
            [(FX + 0.02, elbow_y, take_z), (SX, elbow_y, take_z), (SX, SY - STACK_R * 0.15, take_z), (SX, SY, take_z + 0.04)],
            spool_r, max(5, n // 2), mats["hotmetal"], collection, bevel * 0.15, "hotmetal", cut=0.016,
        ))
        parts.append(flange_at(
            "Flue_StackInlet", (SX, SY, take_z + 0.05), (0, 0, 1),
            spool_r + 0.020, 0.016, mats["hotmetal"], collection, 0.0, "hotmetal", n=n_fl,
        ))
    else:
        parts.append(pipe_along(
            "Flue_Elbow",
            [
                (FX, trans_y, take_z),
                (FX, elbow_y, take_z),
                (SX, elbow_y, take_z),
                (SX, SY, take_z + 0.04),
            ],
            spool_r, max(4, n // 2), mats["hotmetal"], collection, 0.0, "hotmetal", cut=0.016,
        ))

    # 4. Stack neck then tapered tube. Open at STACK_TOP; rain cap sits above.
    neck_z0, neck_z1 = 0.64, 0.76
    if lod < 2:
        parts.append(loft_rings(
            "Stack_Neck",
            [
                circle_ring(SX, SY, STACK_R + 0.016, neck_z0, n),
                circle_ring(SX, SY, STACK_R + 0.006, neck_z1, n),
            ],
            mats["stack"], collection, bevel * 0.3, True, "stack",
        ))
    else:
        neck_z1 = 0.68
    if lod == 0:
        stack_rings = [
            circle_ring(SX, SY, STACK_R + 0.004, neck_z1, n),
            circle_ring(SX, SY, STACK_R, 0.90, n),
            circle_ring(SX, SY, STACK_R * 0.94, 1.00, n),
            circle_ring(SX, SY, STACK_R * 0.90, STACK_TOP, n),
        ]
    else:
        stack_rings = [
            circle_ring(SX, SY, STACK_R + 0.002, neck_z1, n),
            circle_ring(SX, SY, STACK_R * 0.92, 0.94, n),
            circle_ring(SX, SY, STACK_R * 0.88, STACK_TOP, n),
        ]
    if lod == 2:
        parts.append(loft_rings("Stack_Tube", stack_rings, mats["stack"], collection, bevel, True, "stack"))
    else:
        inner_stack = [
            [((p[0] - SX) * 0.76 + SX, (p[1] - SY) * 0.76 + SY, p[2]) for p in ring]
            for ring in stack_rings
        ]
        parts.append(loft_shell("Stack_Tube", stack_rings, inner_stack, mats["stack"], collection, bevel, "stack"))
    hoop_zs = (0.84, 1.00) if lod == 0 else ((0.92,) if lod == 1 else ())
    for i, z in enumerate(hoop_zs):
        parts.append(loft_rings(
            f"Stack_Hoop_{i}",
            [
                circle_ring(SX, SY, STACK_R + 0.014, z - 0.010, n),
                circle_ring(SX, SY, STACK_R + 0.014, z + 0.010, n),
            ],
            mats["stack"], collection, 0.0, True, "stack",
        ))
    vent_z = STACK_TOP
    cap_z = STACK_TOP + 0.048
    parts.append(loft_rings(
        "Stack_Cap",
        [
            circle_ring(SX, SY, STACK_R * 0.38, cap_z + 0.032, n),
            circle_ring(SX, SY, STACK_R * 0.70, cap_z + 0.010, n),
            circle_ring(SX, SY, STACK_R * 0.74, cap_z, n),
        ],
        mats["stack"], collection, bevel * 0.3, True, "stack",
    ))
    n_posts = 3 if lod == 0 else (2 if lod == 1 else 0)
    for i in range(n_posts):
        ang = i * 2.0 * math.pi / max(1, n_posts) + 0.35
        px = SX + math.cos(ang) * (STACK_R * 0.48)
        py = SY + math.sin(ang) * (STACK_R * 0.48)
        parts.append(loft_rings(
            f"Stack_Post_{i}",
            [
                circle_ring(px, py, 0.009, STACK_TOP, max(4, n // 2)),
                circle_ring(px, py, 0.009, cap_z, max(4, n // 2)),
            ],
            mats["stack"], collection, 0.0, True, "stack",
        ))
    if res["baffles"]:
        for i, ang in enumerate((0.45, 0.45 + math.pi * 0.5)):
            dx, dy = math.cos(ang) * 0.010, math.sin(ang) * 0.010
            s = STACK_R * 0.42
            parts.append(add_mesh(
                f"Stack_Baffle_{i}",
                [
                    (SX - math.sin(ang) * s + dx, SY + math.cos(ang) * s + dy, STACK_TOP - 0.008),
                    (SX + math.sin(ang) * s + dx, SY - math.cos(ang) * s + dy, STACK_TOP - 0.008),
                    (SX + math.sin(ang) * s + dx, SY - math.cos(ang) * s + dy, cap_z - 0.004),
                    (SX - math.sin(ang) * s + dx, SY + math.cos(ang) * s + dy, cap_z - 0.004),
                    (SX - math.sin(ang) * s - dx, SY + math.cos(ang) * s - dy, STACK_TOP - 0.008),
                    (SX + math.sin(ang) * s - dx, SY - math.cos(ang) * s - dy, STACK_TOP - 0.008),
                    (SX + math.sin(ang) * s - dx, SY - math.cos(ang) * s - dy, cap_z - 0.004),
                    (SX - math.sin(ang) * s - dx, SY + math.cos(ang) * s - dy, cap_z - 0.004),
                ],
                [(0, 1, 2, 3), (4, 7, 6, 5), (0, 4, 5, 1), (1, 5, 6, 2), (2, 6, 7, 3), (3, 7, 4, 0)],
                mats["stack"], collection, 0.0, "stack",
            ))
    return parts, Vector((SX, SY, vent_z))


def build_tank(lod, mats, collection, bevel):
    """Rolled vessel on two wrapped saddles, manway, and nozzle connection. Not a rectangular block."""
    res = lod_res(lod)
    n = res["n_circ"]
    parts = []
    axis = Vector((0, 1, 0))
    zc = 0.28
    if lod == 0:
        stations = (
            (-TANK_HALF, TANK_R * 0.20),
            (-TANK_HALF + 0.030, TANK_R * 0.78),
            (-TANK_HALF + 0.072, TANK_R * 0.98),
            (0.0, TANK_R),
            (TANK_HALF - 0.072, TANK_R * 0.98),
            (TANK_HALF - 0.030, TANK_R * 0.78),
            (TANK_HALF, TANK_R * 0.20),
        )
    elif lod == 1:
        stations = (
            (-TANK_HALF, TANK_R * 0.24),
            (-TANK_HALF + 0.055, TANK_R * 0.96),
            (TANK_HALF - 0.055, TANK_R * 0.96),
            (TANK_HALF, TANK_R * 0.24),
        )
    else:
        stations = (
            (-TANK_HALF, TANK_R * 0.26),
            (0.0, TANK_R),
            (TANK_HALF, TANK_R * 0.26),
        )
    rings = [circle_in_plane((TX, TY + y, zc), axis, r, n) for y, r in stations]
    parts.append(loft_rings("Tank_Shell", rings, mats["tank"], collection, bevel, True, "tank"))
    if lod == 0:
        for i, y in enumerate((-TANK_HALF + 0.055, TANK_HALF - 0.055)):
            parts.append(loft_rings(
                f"Tank_Knuckle_{i}",
                [
                    circle_in_plane((TX, TY + y, zc), axis, TANK_R + 0.010, n),
                    circle_in_plane((TX, TY + y + 0.012, zc), axis, TANK_R + 0.010, n),
                ],
                mats["tank"], collection, 0.0, True, "tank",
            ))
    saddle_ys = (TY - TANK_HALF * 0.44, TY + TANK_HALF * 0.42)
    wrap_n = 5 if lod == 0 else 4
    for i, sy in enumerate(saddle_ys):
        # Pad sits on the gallery; visible gap under the wrap.
        parts.append(box_mesh(
            f"Tank_SaddlePad_{i}",
            TX, sy, 0.010, TANK_R * 0.72, 0.032, 0.010,
            mats["tank"], collection, bevel * 0.3, "tank",
        ))
        if lod < 2:
            angs = [(-1.15 + 2.30 * k / (wrap_n - 1)) for k in range(wrap_n)]
            r_s = TANK_R + 0.016
            path = [(TX + math.sin(a) * r_s, sy, zc - math.cos(a) * r_s) for a in angs]
            parts.append(pipe_along(
                f"Tank_SaddleWrap_{i}", path, 0.018 if lod == 0 else 0.016,
                max(5, n // 2), mats["tank"], collection, bevel * 0.15, "tank", cut=0.008,
            ))
        if lod == 0:
            parts.append(box_mesh(
                f"Tank_SaddleClip_{i}",
                TX, sy, zc - TANK_R - 0.004, 0.022, 0.028, 0.010,
                mats["hotmetal"], collection, 0.0, "hotmetal",
            ))
    n_man = max(6, n // 2)
    if lod < 2:
        parts.append(loft_rings(
            "Tank_Manway",
            [
                circle_ring(TX, TY + 0.02, 0.050, zc + TANK_R * 0.68, n_man),
                circle_ring(TX, TY + 0.02, 0.050, zc + TANK_R * 0.92, n_man),
                circle_ring(TX, TY + 0.02, 0.034, zc + TANK_R * 1.06, n_man),
            ],
            mats["tank"], collection, bevel * 0.2, True, "tank",
        ))
        parts.append(loft_rings(
            "Tank_AccessLid",
            [
                circle_ring(TX, TY + 0.02, 0.042, zc + TANK_R * 1.04, n_man),
                circle_ring(TX, TY + 0.02, 0.026, zc + TANK_R * 1.12, n_man),
            ],
            mats["hotmetal"], collection, 0.0, True, "hotmetal",
        ))
    else:
        parts.append(loft_rings(
            "Tank_Manway",
            [
                circle_ring(TX, TY + 0.02, 0.042, zc + TANK_R * 0.72, n_man),
                circle_ring(TX, TY + 0.02, 0.028, zc + TANK_R * 1.02, n_man),
            ],
            mats["tank"], collection, 0.0, True, "tank",
        ))
    return parts


def build_pipe(lod, mats, collection, bevel):
    """Routed process line with mitered elbows, flanges, clamps, and a tank nozzle."""
    res = lod_res(lod)
    n = res["n_pipe"]
    parts = []
    start = (FX + FHX * 0.92, FY - 0.06, 0.36)
    nozzle = (TX - TANK_R * 0.18, TY + TANK_HALF * 0.55, 0.36)
    pts = [
        start,
        (start[0] + 0.07, start[1], 0.36),
        (start[0] + 0.07, start[1], 0.50),
        (nozzle[0], start[1], 0.50),
        (nozzle[0], start[1], 0.36),
        nozzle,
    ]
    parts.append(pipe_along(
        "Process_Pipe", pts, PIPE_R, n, mats["pipe"], collection, bevel * 0.3, "pipe", cut=0.014,
    ))
    n_fl = max(6, n)
    parts.append(loft_rings(
        "Pipe_TankNozzle",
        [
            circle_in_plane((nozzle[0], nozzle[1] - 0.01, nozzle[2]), (0, 1, 0), PIPE_R + 0.010, n),
            circle_in_plane((nozzle[0], nozzle[1] + 0.05, nozzle[2]), (0, 1, 0), PIPE_R + 0.006, n),
        ],
        mats["pipe"], collection, 0.0, True, "pipe",
    ))
    if lod < 2:
        parts.append(flange_at(
            "Pipe_Flange_A", start, (1, 0, 0), PIPE_R + 0.016, 0.014,
            mats["hotmetal"], collection, 0.0, "hotmetal", n=n_fl,
        ))
        parts.append(flange_at(
            "Pipe_Flange_B", (nozzle[0], nozzle[1] + 0.02, nozzle[2]), (0, 1, 0),
            PIPE_R + 0.018, 0.014, mats["hotmetal"], collection, 0.0, "hotmetal", n=n_fl,
        ))
    if lod == 2:
        return parts
    mid = ((start[0] + nozzle[0]) * 0.5, start[1], 0.50)
    parts.append(box_mesh(
        "Pipe_Clamp", mid[0], mid[1], mid[2], 0.016, 0.012, 0.014,
        mats["structure"], collection, bevel * 0.2, "structure",
    ))
    if lod == 0:
        parts.append(flange_at(
            "Pipe_Flange_Mid", (mid[0] - 0.06, mid[1], mid[2]), (1, 0, 0),
            PIPE_R + 0.014, 0.012, mats["hotmetal"], collection, 0.0, "hotmetal", n=n_fl,
        ))
    return parts


def build_lamp(lod, mats, collection, bevel):
    """Hooded work-light at the flue neck: hood, socket, recessed lens. Not a hot speck."""
    res = lod_res(lod)
    n = max(6, res["n_circ"] // 2)
    parts = []
    lx, ly, lz = LAMP_LOC
    if lod == 2:
        hood = loft_rings(
            "Lamp_Hood",
            [
                circle_ring(lx, ly, 0.016, lz + 0.022, n),
                circle_ring(lx, ly, 0.055, lz - 0.006, n),
            ],
            mats["lampmetal"], collection, 0.0, False, "lampmetal",
        )
        lens = loft_rings(
            "Lamp_Lens",
            [
                circle_ring(lx, ly, 0.016, lz + 0.004, n),
                circle_ring(lx, ly, 0.014, lz + 0.012, n),
            ],
            mats["lamp"], collection, 0.0, True, "lamp",
        )
        return [hood], lens, Vector((lx, ly, lz))
    parts.append(loft_rings(
        "Lamp_Stalk",
        [
            circle_ring(SX + 0.04, SY - 0.04, 0.011, 0.70, n),
            circle_ring(lx - 0.02, ly, 0.011, 0.71, n),
            circle_ring(lx, ly, 0.011, lz - 0.03, n),
        ],
        mats["lampmetal"], collection, 0.0, True, "lampmetal",
    ))
    parts.append(loft_rings(
        "Lamp_Socket",
        [
            circle_ring(lx, ly, 0.020, lz - 0.018, n),
            circle_ring(lx, ly, 0.028, lz + 0.006, n),
            circle_ring(lx, ly, 0.022, lz + 0.018, n),
        ],
        mats["lampmetal"], collection, bevel * 0.25, True, "lampmetal",
    ))
    parts.append(loft_rings(
        "Lamp_Hood",
        [
            circle_ring(lx, ly, 0.016, lz + 0.020, n),
            circle_ring(lx, ly, 0.048, lz + 0.028, n),
            circle_ring(lx, ly, 0.060, lz + 0.008, n),
            circle_ring(lx, ly, 0.056, lz - 0.012, n),
        ],
        mats["lampmetal"], collection, bevel * 0.15, False, "lampmetal",
    ))
    lens = loft_rings(
        "Lamp_Lens",
        [
            circle_ring(lx, ly, 0.016, lz + 0.002, n),
            circle_ring(lx, ly, 0.014, lz + 0.014, n),
        ],
        mats["lamp"], collection, 0.0, True, "lamp",
    )
    return parts, lens, Vector((lx, ly, lz))


def build_high_fasteners(lod, mats, collection):
    if lod != 0:
        return []
    parts = []
    # Strap bolts and flange bolts only — interfaces, not a spray.
    y0 = FY - FHY * 0.98
    locs = [
        ((FX + FHX * 0.97, FY, 0.29), (1, 0, 0)),
        ((FX + FHX * 0.97, FY, 0.55), (1, 0, 0)),
        ((FX - 0.22, y0 - 0.02, 0.38), (0, -1, 0)),
        ((TX, TY + 0.02, 0.30 + TANK_R * 1.08), (0, 0, 1)),
        ((FX + FHX * 0.96, FY - 0.08, 0.34), (1, 0, 0)),
        ((SX + STACK_R + 0.012, SY, 0.82), (1, 0, 0)),
        ((SX + STACK_R + 0.012, SY, 0.98), (1, 0, 0)),
        ((TX - TANK_R - 0.04, TY - TANK_HALF * 0.42, 0.04), (0, 0, 1)),
    ]
    for i, (loc, axis) in enumerate(locs):
        parts.append(hex_bolt(f"High_Bolt_{i}", loc, axis, 0.010, 0.016, mats["hotmetal"], collection, "hotmetal"))
    return parts


def build_lod_geometry(lod, mats, collection):
    bevel = BEVEL_LOW[lod]
    furnace, ember = build_furnace(lod, mats, collection, bevel)
    burner = build_burner(lod, mats, collection, bevel)
    stack, vent_loc = build_stack(lod, mats, collection, bevel)
    tank = build_tank(lod, mats, collection, bevel)
    pipe = build_pipe(lod, mats, collection, bevel)
    lamp_metal, lens, lamp_loc = build_lamp(lod, mats, collection, bevel)
    body = furnace + burner + stack + tank + pipe + lamp_metal
    high_extra = build_high_fasteners(lod, mats, collection)
    return {
        "body": body,
        "ember": ember,
        "lens": lens,
        "high_extra": high_extra,
        "vent_loc": vent_loc,
        "lamp_loc": lamp_loc,
        "slit_loc": Vector((FX, FY, WELL_FLOOR + 0.012)),
    }


# ---------------------------------------------------------------------------
# Bake + author
# ---------------------------------------------------------------------------

def ensure_uv(obj):
    if obj.type != "MESH":
        return
    if not obj.data.uv_layers:
        obj.data.uv_layers.new(name="UVMap")
    obj.data.uv_layers[0].name = "UVMap"
    obj.data.uv_layers.active = obj.data.uv_layers[0]


def make_bake_image(name, size, colorspace="Non-Color"):
    if name in bpy.data.images:
        bpy.data.images.remove(bpy.data.images[name])
    img = bpy.data.images.new(name, width=size, height=size, alpha=True, float_buffer=True)
    img.colorspace_settings.name = colorspace
    img.generated_color = (0, 0, 0, 1)
    return img


def assign_bake_target(obj, img):
    if not obj.data.materials:
        mat = bpy.data.materials.new("BakeTarget")
        obj.data.materials.append(mat)
    first_tex = None
    for mat in obj.data.materials:
        if mat is None:
            continue
        mat.use_nodes = True
        nodes = mat.node_tree.nodes
        tex = None
        for node in nodes:
            if node.type == "TEX_IMAGE" and node.image == img:
                tex = node
                break
        if tex is None:
            tex = nodes.new("ShaderNodeTexImage")
            tex.image = img
        for node in nodes:
            node.select = False
        tex.select = True
        nodes.active = tex
        if first_tex is None:
            first_tex = tex
    return first_tex


def setup_cycles():
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = 8
    try:
        scene.cycles.bake_type = "AO"
    except Exception:
        pass
    scene.render.bake.margin = 8
    scene.render.bake.use_clear = True
    try:
        scene.cycles.use_denoising = False
    except Exception:
        pass


def bake_pass(low, high, cage, bake_type, img, normal_space="TANGENT"):
    object_mode()
    bpy.ops.object.select_all(action="DESELECT")
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    assign_bake_target(low, img)
    low.select_set(True)
    bpy.context.view_layer.objects.active = low
    kwargs = dict(type=bake_type, margin=8, use_clear=True)
    if high is not None:
        high.select_set(True)
        kwargs["use_selected_to_active"] = True
        kwargs["cage_extrusion"] = 0.03
        if cage is not None:
            kwargs["use_cage"] = True
            kwargs["cage_object"] = cage.name
    if bake_type == "NORMAL":
        kwargs["normal_space"] = normal_space
        kwargs["normal_r"] = "POS_X"
        kwargs["normal_g"] = "POS_Y"
        kwargs["normal_b"] = "POS_Z"
    try:
        bpy.ops.object.bake(**kwargs)
        return True
    except Exception as exc:
        print(f"bake {bake_type} failed: {exc}")
        return False


def emission_id_material(obj):
    role = obj.get("spacefaceRole") or "structure"
    rgb = ROLE_ID_RGB.get(role, (0.5, 0.5, 0.5))
    mat = bpy.data.materials.new(f"EmitID_{obj.name}")
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    emit = nt.nodes.new("ShaderNodeEmission")
    emit.inputs["Color"].default_value = (*rgb, 1.0)
    emit.inputs["Strength"].default_value = 1.0
    nt.links.new(emit.outputs["Emission"], out.inputs["Surface"])
    obj.data.materials.clear()
    obj.data.materials.append(mat)
    return mat


def pointiness_material(obj):
    mat = bpy.data.materials.new(f"EmitCurv_{obj.name}")
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    emit = nt.nodes.new("ShaderNodeEmission")
    geom = nt.nodes.new("ShaderNodeNewGeometry")
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].position = 0.45
    ramp.color_ramp.elements[0].color = (0.0, 0.0, 0.0, 1)
    ramp.color_ramp.elements[1].position = 0.62
    ramp.color_ramp.elements[1].color = (1.0, 1.0, 1.0, 1)
    if "Pointiness" in geom.outputs:
        nt.links.new(geom.outputs["Pointiness"], ramp.inputs["Fac"])
    nt.links.new(ramp.outputs["Color"], emit.inputs["Color"])
    emit.inputs["Strength"].default_value = 1.0
    nt.links.new(emit.outputs["Emission"], out.inputs["Surface"])
    obj.data.materials.clear()
    obj.data.materials.append(mat)
    return mat


def classify_id(id_img):
    arr = image_np(id_img)[..., :3]
    h, w, _ = arr.shape
    labels = np.zeros((h, w), dtype=np.int32)
    keys = list(ROLE_ID_RGB.keys())
    palette = np.array([ROLE_ID_RGB[k] for k in keys], dtype=np.float32)
    pix = arr.reshape(-1, 3)
    # Distance to palette.
    d = ((pix[:, None, :] - palette[None, :, :]) ** 2).sum(axis=2)
    idx = np.argmin(d, axis=1).reshape(h, w)
    lum = arr.mean(axis=2)
    idx = np.where(lum < 0.02, -1, idx)
    return idx, keys


def author_maps(lod, id_img, ao_img, curv_img, nrm_img, size):
    id_idx, keys = classify_id(id_img)
    ao = image_np(ao_img)[..., 0]
    if ao.mean() < 0.05:
        ao = np.ones_like(ao) * 0.85
    ao = np.clip(ao, 0.15, 1.0)
    curv = image_np(curv_img)[..., 0]
    nrm = image_np(nrm_img)
    if abs(float(nrm[..., 2].mean()) - 0.0) < 0.05 and abs(float(nrm[..., 0].mean()) - 0.0) < 0.05:
        nrm[..., 0] = 0.5
        nrm[..., 1] = 0.5
        nrm[..., 2] = 1.0
    h, w = ao.shape
    yy, xx = np.mgrid[0:h, 0:w]
    gf = h01(xx, yy, 3 + lod)
    gf2 = h01(xx // 3, yy // 3, 11 + lod)
    albedo = np.zeros((h, w, 4), dtype=np.float32)
    orm = np.ones((h, w, 4), dtype=np.float32)
    for i, key in enumerate(keys):
        if key in {"slit", "lamp"}:
            continue
        mask = id_idx == i
        if not np.any(mask):
            continue
        br, bg, bb = ROLE_ALBEDO[key]
        dirt = np.clip(0.08 * gf + 0.16 * (1.0 - ao) + 0.06 * gf2, 0, 1)
        edge = np.clip((curv - 0.45) * 2.2, 0, 1)
        heat = 0.0
        if key in {"hotmetal", "pipe"}:
            heat = np.clip(0.28 * gf2 + 0.12 * (1.0 - ao), 0, 1)
        if key == "stack":
            heat = np.clip(0.18 * gf2, 0, 1)
        r = np.clip(br * (1.0 - dirt * 0.28) * (0.62 + 0.38 * ao) + edge * 0.05 + heat * 0.08, 0, 1)
        g = np.clip(bg * (1.0 - dirt * 0.24) * (0.62 + 0.38 * ao) + edge * 0.03 + heat * 0.01, 0, 1)
        b = np.clip(bb * (1.0 - dirt * 0.20) * (0.62 + 0.38 * ao) + edge * 0.02 - heat * 0.04, 0, 1)
        if key == "hotmetal":
            r = np.clip(r + heat * 0.03, 0, 1)
            b = np.clip(b + (1.0 - heat) * 0.04, 0, 1)
        if key == "refractory":
            soot = np.clip((1.0 - ao) * 0.50 + 0.05 * gf, 0, 1)
            grain = 0.025 * gf
            r = np.clip(br * (0.62 + 0.38 * ao) + grain - soot * 0.04, 0, 1)
            g = np.clip(bg * (0.62 + 0.38 * ao) + grain * 0.5 - soot * 0.03, 0, 1)
            b = np.clip(bb * (0.66 + 0.34 * ao) + grain * 0.3 - soot * 0.02, 0, 1)
        if key == "tank":
            # Matte oxide-red: no peach edge lift, no metal from curvature.
            r = np.clip(br * (0.78 + 0.18 * ao) - dirt * 0.03, 0, 1)
            g = np.clip(bg * (0.80 + 0.16 * ao) - dirt * 0.015, 0, 1)
            b = np.clip(bb * (0.82 + 0.14 * ao), 0, 1)
        if key == "structure":
            # Segment jacket value: waist/course AO goes darker; LOD1/2 stay cool so the
            # site register does not paint the whole cell warm.
            cool = 0.76 if lod >= 1 else 0.98
            r = np.clip(br * (0.48 + 0.52 * ao) * cool - dirt * 0.025 - edge * 0.010, 0, 1)
            g = np.clip(bg * (0.50 + 0.50 * ao) * cool - dirt * 0.020, 0, 1)
            b = np.clip(bb * (0.54 + 0.46 * ao) * cool, 0, 1)
        if key == "hotmetal" and lod >= 1:
            r = np.clip(r * 0.78, 0, 1)
            g = np.clip(g * 0.82, 0, 1)
            b = np.clip(b * 0.88, 0, 1)
        if key == "tank" and lod >= 1:
            r = np.clip(r * 1.06, 0, 1)
        if key == "stack" and lod >= 1:
            r = np.clip(r * 1.04, 0, 1)
        rough = np.clip(ROLE_ROUGH[key] + dirt * 0.12 - edge * 0.04 + (1.0 - ao) * 0.06, 0.08, 0.95)
        metal = np.clip(ROLE_METAL[key] - dirt * 0.04, 0, 1)
        if key == "tank":
            rough = np.clip(0.84 + dirt * 0.06 + (1.0 - ao) * 0.04, 0.78, 0.95)
            metal = np.full_like(rough, 0.015)
        if key == "refractory":
            rough = np.clip(0.86 + (1.0 - ao) * 0.08, 0.78, 0.96)
            metal = np.zeros_like(rough)
        if key == "structure":
            metal = np.clip(0.02 + edge * 0.03, 0, 0.10)
        albedo[mask, 0] = r[mask]
        albedo[mask, 1] = g[mask]
        albedo[mask, 2] = b[mask]
        albedo[mask, 3] = 1.0
        orm[mask, 0] = ao[mask]
        orm[mask, 1] = rough[mask]
        orm[mask, 2] = metal[mask]
    empty = albedo[..., 3] < 0.5
    if np.any(empty):
        albedo[empty, 0:3] = ROLE_ALBEDO["structure"]
        albedo[empty, 3] = 1.0
        orm[empty, 0] = ao[empty]
        orm[empty, 1] = ROLE_ROUGH["structure"]
        orm[empty, 2] = ROLE_METAL["structure"]
    nrm[..., 3] = 1.0
    # Mesh-derived normal is authoritative; keep a tiny grit so plates are not chrome-flat.
    grit = (gf - 0.5) * 0.04
    nrm[..., 0] = np.clip(nrm[..., 0] + grit, 0, 1)
    nrm[..., 1] = np.clip(nrm[..., 1] + (gf2 - 0.5) * 0.04, 0, 1)
    return albedo, orm, nrm, ao, curv, id_idx


def bake_and_author(lod, body, high_extra, collection, size):
    setup_cycles()
    for obj in body:
        finish_low(obj)
    low = join_objects(body, f"LOD{lod}_refinery_src")
    if low is None:
        raise RuntimeError("no body meshes")
    ensure_uv(low)
    overlap = unique_uv(low)
    print(f"LOD{lod} UV overlap loops={overlap}")
    cage = duplicate_obj(low, f"LOD{lod}_cage", collection)
    inflate_mesh(cage, 0.028)
    cage.hide_render = True
    cage.hide_set(True)

    high_parts = []
    for obj in list(collection.objects):
        if obj == low or obj == cage:
            continue
        if obj.get("_sf_high"):
            high_parts.append(obj)
    for extra in high_extra:
        finish_low(extra, angle=22.0)
        extra["_sf_high"] = True
        high_parts.append(extra)
    # Duplicate low, tighter bevel already applied; join extras onto a high copy.
    high = duplicate_obj(low, f"LOD{lod}_high", collection)
    if high_parts:
        high = join_objects([high] + high_parts, f"LOD{lod}_high")

    img_ao = make_bake_image(f"BakeAO_L{lod}", size)
    img_n = make_bake_image(f"BakeN_L{lod}", size)
    img_id = make_bake_image(f"BakeID_L{lod}", size, "sRGB")
    img_c = make_bake_image(f"BakeC_L{lod}", size)

    bake_pass(low, None, None, "AO", img_ao)
    ok_n = bake_pass(low, high, cage, "NORMAL", img_n)
    if not ok_n:
        bake_pass(low, None, None, "NORMAL", img_n)

    # ID from original slot colours: temporarily swap to emission.
    backups = [slot.material for slot in low.material_slots]
    # Re-assign per-slot emission by current material role.
    for slot in low.material_slots:
        mat = slot.material
        role = (mat.get("spacefaceRole") if mat else None) or "structure"
        rgb = ROLE_ID_RGB.get(role, (0.5, 0.5, 0.5))
        emit_mat = bpy.data.materials.new(f"ID_{role}_{lod}_{id(slot) % 100000}")
        emit_mat.use_nodes = True
        nt = emit_mat.node_tree
        nt.nodes.clear()
        out = nt.nodes.new("ShaderNodeOutputMaterial")
        emit = nt.nodes.new("ShaderNodeEmission")
        emit.inputs["Color"].default_value = (*rgb, 1.0)
        emit.inputs["Strength"].default_value = 1.0
        nt.links.new(emit.outputs["Emission"], out.inputs["Surface"])
        emit_mat["spacefaceRole"] = role
        slot.material = emit_mat
    bake_pass(low, None, None, "EMIT", img_id)

    pointiness_material(low)
    bake_pass(low, None, None, "EMIT", img_c)

    albedo, orm, nrm, ao, curv, id_idx = author_maps(lod, img_id, img_ao, img_c, img_n, size)
    prefix = f"refinery_lod{lod}"
    maps = {}
    maps["basecolor"], p_bc = write_pixels(f"{prefix}_basecolor", albedo, size, "sRGB")
    maps["orm"], p_orm = write_pixels(f"{prefix}_orm", orm, size, "Non-Color")
    maps["normal"], p_n = write_pixels(f"{prefix}_normal", nrm, size, "Non-Color")
    maps["ao"], p_ao = write_pixels(f"{prefix}_ao", np.dstack([ao, ao, ao, np.ones_like(ao)]), size, "Non-Color")
    maps["curvature"], p_c = write_pixels(f"{prefix}_curvature", np.dstack([curv, curv, curv, np.ones_like(curv)]), size, "Non-Color")
    maps["id"], p_id = write_pixels(f"{prefix}_id", image_np(img_id), size, "sRGB")

    atlas = make_atlas_material(lod, maps)
    low.data.materials.clear()
    low.data.materials.append(atlas)
    low.name = f"LOD{lod}_refinery"
    if low.data:
        low.data.name = f"LOD{lod}_refinery"
    low["spacefaceLod"] = f"lod{lod}"
    low["spacefaceRole"] = "atlas"

    # Cleanup bake helpers.
    for helper in (cage, high):
        if helper is not None:
            try:
                bpy.data.objects.remove(helper, do_unlink=True)
            except Exception:
                pass
    triangulate(low)
    return low, {
        "overlapLoops": overlap,
        "maps": {
            "basecolor": str(p_bc.relative_to(ROOT)).replace("\\", "/"),
            "orm": str(p_orm.relative_to(ROOT)).replace("\\", "/"),
            "normal": str(p_n.relative_to(ROOT)).replace("\\", "/"),
            "ao": str(p_ao.relative_to(ROOT)).replace("\\", "/"),
            "curvature": str(p_c.relative_to(ROOT)).replace("\\", "/"),
            "id": str(p_id.relative_to(ROOT)).replace("\\", "/"),
        },
    }


def finish_emit_mesh(obj, lod, kind):
    finish_low(obj, angle=24.0)
    ensure_uv(obj)
    unique_uv(obj, margin=0.02)
    triangulate(obj)
    obj.name = f"LOD{lod}_{kind}"
    obj["spacefaceLod"] = f"lod{lod}"
    return obj


def bbox_of(objects):
    mins = Vector((1e9, 1e9, 1e9))
    maxs = Vector((-1e9, -1e9, -1e9))
    any_mesh = False
    for obj in objects:
        if obj.type != "MESH":
            continue
        any_mesh = True
        for corner in obj.bound_box:
            w = obj.matrix_world @ Vector(corner)
            mins.x, mins.y, mins.z = min(mins.x, w.x), min(mins.y, w.y), min(mins.z, w.z)
            maxs.x, maxs.y, maxs.z = max(maxs.x, w.x), max(maxs.y, w.y), max(maxs.z, w.z)
    if not any_mesh:
        return None
    return {"min": list(mins), "max": list(maxs), "size": list(maxs - mins)}


def export_lod_glb(objects, lod, path: Path):
    object_mode()
    bpy.ops.object.select_all(action="DESELECT")
    for obj in objects:
        try:
            obj.hide_set(False)
            obj.hide_viewport = False
            obj.hide_render = False
            obj.select_set(True)
        except Exception:
            pass
    path.parent.mkdir(parents=True, exist_ok=True)
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
    sanitize_glb_floats(path)
    return path


def save_blend(path: Path):
    path.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(path))


# ---------------------------------------------------------------------------
# Combine + capture
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


def write_glb(path: Path, gltf: dict, rest: bytes):
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
    gltf, rest = read_glb(path)
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
        if name in hook_set:
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
            extras["spaceface"] = {"collision": True, "helper": True, "nonRender": True}
            node["extras"] = extras
    write_glb(path, gltf, rest)


def node_translation(node):
    if "matrix" in node:
        matrix = node["matrix"]
        return [float(matrix[12]), float(matrix[13]), float(matrix[14])]
    return [float(v) for v in (node.get("translation") or (0.0, 0.0, 0.0))]


def node_scale(node):
    if "matrix" in node:
        matrix = node["matrix"]
        sx = math.hypot(float(matrix[0]), float(matrix[1]), float(matrix[2]))
        sy = math.hypot(float(matrix[4]), float(matrix[5]), float(matrix[6]))
        sz = math.hypot(float(matrix[8]), float(matrix[9]), float(matrix[10]))
        return [sx, sy, sz]
    return [float(v) for v in (node.get("scale") or (1.0, 1.0, 1.0))]


def inspect_glb(path: Path, hook_locs=None):
    gltf, _ = read_glb(path)
    nodes = gltf.get("nodes") or []
    meshes = gltf.get("meshes") or []
    names = [n.get("name") for n in nodes]
    accessors = gltf.get("accessors") or []
    lod_tris = {0: 0, 1: 0, 2: 0}
    lod_draws = {0: 0, 1: 0, 2: 0}
    by_name = {n.get("name"): n for n in nodes}
    for node in nodes:
        name = node.get("name") or ""
        mesh_index = node.get("mesh")
        if mesh_index is None:
            continue
        mesh = meshes[mesh_index]
        lod = None
        if name.startswith("LOD0"):
            lod = 0
        elif name.startswith("LOD1"):
            lod = 1
        elif name.startswith("LOD2"):
            lod = 2
        if lod is None:
            continue
        for prim in mesh.get("primitives") or []:
            lod_draws[lod] += 1
            idx = (prim.get("indices"))
            if idx is None:
                continue
            acc = accessors[idx]
            count = int(acc.get("count") or 0)
            lod_tris[lod] += count // 3
    hooks = {h: ("found" if h in names else "MISSING") for h in HOOK_NAMES}
    hook_translations = {}
    invalid_hook_translations = []
    expected_hooks = {
        name: blender_zup_to_gltf(loc)
        for name, loc in (hook_locs or {}).items()
        if name in HOOK_NAMES
    }
    for name in HOOK_NAMES:
        node = by_name.get(name)
        if node is None:
            invalid_hook_translations.append({"name": name, "actual": None, "expected": list(expected_hooks.get(name) or [])})
            continue
        actual = node_translation(node)
        hook_translations[name] = actual
        if math.hypot(*actual) < 0.05:
            invalid_hook_translations.append({
                "name": name,
                "actual": actual,
                "expected": list(expected_hooks.get(name) or []),
                "reason": "identity_or_origin",
            })
            continue
        expected = expected_hooks.get(name)
        if expected and any(abs(a - e) > 1e-4 for a, e in zip(actual, expected)):
            invalid_hook_translations.append({
                "name": name,
                "actual": actual,
                "expected": list(expected),
            })
    collision = by_name.get("COLLISION_HULL")
    collision_translation = node_translation(collision) if collision else None
    collision_scale = node_scale(collision) if collision else None
    expected_collision_t = blender_zup_to_gltf(COLLISION_LOC)
    expected_collision_s = blender_zup_scale_to_gltf(COLLISION_SCALE)
    collision_ok = bool(
        collision
        and collision.get("mesh") is None
        and collision_translation
        and collision_scale
        and all(abs(a - e) < 1e-4 for a, e in zip(collision_translation, expected_collision_t))
        and all(abs(a - e) < 1e-4 for a, e in zip(collision_scale, expected_collision_s))
    )
    return {
        "names": names,
        "hooks": hooks,
        "hookTranslations": hook_translations,
        "invalidHookTranslations": invalid_hook_translations,
        "collisionTranslation": collision_translation,
        "collisionScale": collision_scale,
        "collisionOk": collision_ok,
        "root": ROOT_NAME if ROOT_NAME in names else None,
        "lodTriangles": lod_tris,
        "lodDraws": lod_draws,
        "materials": len(gltf.get("materials") or []),
        "nodes": len(nodes),
        "ok": (
            all(v == "found" for v in hooks.values())
            and not invalid_hook_translations
            and collision_ok
            and ROOT_NAME in names
        ),
    }


def look_at(obj, target=(0, 0, 0)):
    obj.rotation_euler = (Vector(target) - obj.location).to_track_quat("-Z", "Y").to_euler()


def setup_review_scene():
    scene = bpy.context.scene
    try:
        scene.render.engine = "BLENDER_EEVEE_NEXT"
    except TypeError:
        try:
            scene.render.engine = "BLENDER_EEVEE"
        except Exception:
            pass
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
    scene.view_settings.exposure = 0.04
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
    bsdf = next(n for n in pad_mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    bsdf.inputs["Base Color"].default_value = (0.07, 0.055, 0.042, 1)
    bsdf.inputs["Roughness"].default_value = 0.86
    bsdf.inputs["Metallic"].default_value = 0.04
    pad.data.materials.append(pad_mat)
    cam_data = bpy.data.cameras.new("WorksCam")
    camera = bpy.data.objects.new("WorksCam", cam_data)
    scene.collection.objects.link(camera)
    scene.camera = camera
    reach = 4.0
    for name, loc, energy, color, angle in (
        ("Key", (-1.15 * reach, -0.78 * reach, 0.54 * reach), 7.0, (1.00, 0.863, 0.737), 18.0),
        ("Rim", (0.22 * reach, 1.45 * reach, 0.30 * reach), 2.10, (0.616, 0.722, 0.941), 25.0),
        ("Fill", (1.12 * reach, 0.46 * reach, 0.50 * reach), 2.20, (0.847, 0.765, 0.659), 30.0),
        ("Grazing", (1.6 * reach, -0.2 * reach, 0.22 * reach), 3.40, (1.00, 0.90, 0.78), 12.0),
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
        look_at(obj, (0, 0, 0.25))
    return camera, pad


def override_clay(meshes):
    backups = {}
    mat = bpy.data.materials.new("ClayReview")
    bsdf = principled(mat)
    bsdf.inputs["Base Color"].default_value = (0.46, 0.46, 0.45, 1)
    bsdf.inputs["Roughness"].default_value = 0.62
    bsdf.inputs["Metallic"].default_value = 0.0
    if "Emission Strength" in bsdf.inputs:
        bsdf.inputs["Emission Strength"].default_value = 0.0
    for obj in meshes:
        backups[obj.name] = [slot.material for slot in obj.material_slots]
        if obj.material_slots:
            obj.material_slots[0].material = mat
        else:
            obj.data.materials.append(mat)
        for i in range(1, len(obj.material_slots)):
            obj.material_slots[i].material = mat
    return backups, mat


def restore_mats(meshes, backups):
    for obj in meshes:
        mats = backups.get(obj.name)
        if not mats:
            continue
        for i, mat in enumerate(mats):
            if i < len(obj.material_slots):
                obj.material_slots[i].material = mat


def isolation_material(kind, source_mat=None):
    mat = bpy.data.materials.new(f"Iso_{kind}")
    bsdf = principled(mat)
    if source_mat and source_mat.use_nodes:
        img = None
        for node in source_mat.node_tree.nodes:
            if node.type == "TEX_IMAGE" and node.image and kind in (node.image.name or "").lower():
                img = node.image
        if kind == "normal":
            for node in source_mat.node_tree.nodes:
                if node.type == "TEX_IMAGE" and node.image and "normal" in (node.image.name or "").lower():
                    img = node.image
                    break
        if kind == "orm":
            for node in source_mat.node_tree.nodes:
                if node.type == "TEX_IMAGE" and node.image and "orm" in (node.image.name or "").lower():
                    img = node.image
                    break
        if img is not None:
            nt = mat.node_tree
            tex = nt.nodes.new("ShaderNodeTexImage")
            tex.image = img
            emit = nt.nodes.new("ShaderNodeEmission")
            nt.links.new(tex.outputs["Color"], emit.inputs["Color"])
            emit.inputs["Strength"].default_value = 1.0
            out = next(n for n in nt.nodes if n.type == "OUTPUT_MATERIAL")
            nt.links.new(emit.outputs["Emission"], out.inputs["Surface"])
            return mat
    bsdf.inputs["Base Color"].default_value = (0.5, 0.5, 1, 1)
    return mat


def set_lod_visibility(lod_keep):
    for obj in bpy.data.objects:
        if obj.type != "MESH":
            continue
        if obj.name == "MinePad":
            continue
        name = obj.name
        keep = True
        if name.startswith("LOD0") or name.startswith("LOD1") or name.startswith("LOD2"):
            keep = name.startswith(f"LOD{lod_keep}")
        obj.hide_render = not keep
        try:
            obj.hide_set(not keep)
        except Exception:
            pass


def render_path(camera, path, framing, target_roots, edge_dir=(1.0, 0.0)):
    scene = bpy.context.scene
    pose = apply_works_camera(camera, framing=framing, focus=(0.0, 0.0, 0.0), edge_dir=edge_dir)
    offset = Vector(pose["object_offset"])
    moved = []
    if offset.length > 1e-9:
        for obj in target_roots:
            if obj is None:
                continue
            obj.location = obj.location + offset
            moved.append(obj)
        bpy.context.view_layer.update()
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    scene.render.filepath = str(path)
    bpy.ops.render.render(write_still=True)
    sanitize_png(path)
    for obj in moved:
        obj.location = obj.location - offset
    bpy.context.view_layer.update()
    return pose


def measure_object_pixels(path: Path, pad_luma=0.06):
    img = bpy.data.images.load(str(path))
    arr = image_np(img)
    bpy.data.images.remove(img)
    luma = 0.2126 * arr[..., 0] + 0.7152 * arr[..., 1] + 0.0722 * arr[..., 2]
    mask = luma > pad_luma + 0.04
    if not mask.any():
        return {"px": 0, "bbox": None, "array": arr}
    ys, xs = np.nonzero(mask)
    return {
        "px": int(mask.sum()),
        "bbox": [int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max())],
        "width": int(xs.max() - xs.min() + 1),
        "height": int(ys.max() - ys.min() + 1),
        "array": arr,
    }


def write_1to1_crop(src_path: Path, dest: Path, pad=24):
    img = bpy.data.images.load(str(src_path))
    arr = image_np(img)
    bpy.data.images.remove(img)
    h, w = arr.shape[:2]
    luma = 0.2126 * arr[..., 0] + 0.7152 * arr[..., 1] + 0.0722 * arr[..., 2]
    mask = luma > 0.10
    if not mask.any():
        return None
    ys, xs = np.nonzero(mask)
    x0 = max(0, int(xs.min()) - pad)
    y0 = max(0, int(ys.min()) - pad)
    x1 = min(w, int(xs.max()) + pad + 1)
    y1 = min(h, int(ys.max()) + pad + 1)
    crop = arr[y0:y1, x0:x1]
    ch, cw = crop.shape[:2]
    name = f"_crop_{dest.stem}"
    if name in bpy.data.images:
        bpy.data.images.remove(bpy.data.images[name])
    out = bpy.data.images.new(name, width=cw, height=ch, alpha=True)
    out.pixels.foreach_set(np.ascontiguousarray(crop, dtype=np.float32).ravel())
    dest.parent.mkdir(parents=True, exist_ok=True)
    out.filepath_raw = str(dest)
    out.file_format = "PNG"
    out.save()
    sanitize_png(dest)
    bpy.data.images.remove(out)
    return {"crop": [x0, y0, x1, y1], "size": [cw, ch]}


def capture_stills(combined_glb: Path):
    reset_scene()
    bpy.ops.import_scene.gltf(filepath=str(combined_glb))
    camera, pad = setup_review_scene()
    root = bpy.data.objects.get(ROOT_NAME)
    meshes = [obj for obj in bpy.data.objects if obj.type == "MESH" and obj.name != "MinePad"]
    EVID_DIR.mkdir(parents=True, exist_ok=True)
    stills = {}
    roots = [
        obj for obj in bpy.data.objects
        if obj.parent is None and obj.type not in {"CAMERA", "LIGHT"}
    ]

    def snap(name, framing, lod, edge_dir=(1.0, 0.0)):
        set_lod_visibility(lod)
        pose = render_path(camera, EVID_DIR / name, framing, roots, edge_dir)
        stills[name] = str((EVID_DIR / name).relative_to(ROOT)).replace("\\", "/")
        return pose

    pose_top = snap("works_top.png", "works_top", 0)
    snap("works_edge.png", "works_edge", 0)
    snap("works_site.png", "works_site", 1)

    backups, _clay = override_clay(meshes)
    snap("works_top_clay.png", "works_top", 0)
    restore_mats(meshes, backups)

    # Grazing edge: boost grazing sun, clay-ish beauty on edge.
    graz = bpy.data.objects.get("Grazing")
    key = bpy.data.objects.get("Key")
    if graz and graz.data:
        graz.data.energy = 8.5
    if key and key.data:
        key.data.energy = 2.2
    snap("works_edge_grazing.png", "works_edge", 0, edge_dir=(0.85, 0.35))
    if graz and graz.data:
        graz.data.energy = 3.4
    if key and key.data:
        key.data.energy = 7.0

    # Isolation stills from LOD0 close camera.
    set_lod_visibility(0)
    src = None
    for obj in meshes:
        if obj.name.startswith("LOD0_refinery"):
            src = obj.data.materials[0] if obj.data.materials else None
            break
    iso_n = isolation_material("normal", src)
    iso_o = isolation_material("orm", src)
    iso_id = isolation_material("id", src)
    backups = {obj.name: [s.material for s in obj.material_slots] for obj in meshes}

    def apply_iso(mat):
        for obj in meshes:
            if obj.material_slots:
                obj.material_slots[0].material = mat
            else:
                obj.data.materials.append(mat)

    apply_iso(iso_n)
    snap("normal_isolation.png", "works_top", 0)
    apply_iso(iso_o)
    snap("orm_isolation.png", "works_top", 0)
    # Material ID: emission from ROLE_ID if atlas, else a dummy.
    id_mat = bpy.data.materials.new("IsoID")
    id_mat.use_nodes = True
    # Prefer the authored ID map if packed/loaded.
    id_img = None
    for img in bpy.data.images:
        if "refinery_lod0_id" in img.name or img.filepath.endswith("refinery_lod0_id.png"):
            id_img = img
            break
    id_path = TEX_DIR / "refinery_lod0_id.png"
    if id_img is None and id_path.exists():
        id_img = bpy.data.images.load(str(id_path))
    nt = id_mat.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    emit = nt.nodes.new("ShaderNodeEmission")
    if id_img is not None:
        tex = nt.nodes.new("ShaderNodeTexImage")
        tex.image = id_img
        nt.links.new(tex.outputs["Color"], emit.inputs["Color"])
    else:
        emit.inputs["Color"].default_value = (0.4, 0.3, 0.2, 1)
    emit.inputs["Strength"].default_value = 1.0
    nt.links.new(emit.outputs["Emission"], out.inputs["Surface"])
    apply_iso(id_mat)
    snap("id_or_material_id.png", "works_top", 0)
    restore_mats(meshes, backups)

    # Hook identity: small colored markers at hook empties, top view.
    colors = {"furnace_slit": (0.85, 0.15, 0.12), "stack_vent": (0.15, 0.75, 0.22), "lamp": (0.2, 0.45, 0.95)}
    markers = []
    for name, rgb in colors.items():
        hook = bpy.data.objects.get(name)
        loc = hook.matrix_world.translation.copy() if hook else Vector((0, 0, 0))
        bpy.ops.mesh.primitive_uv_sphere_add(radius=0.045, location=loc)
        mk = bpy.context.object
        mk.name = f"HookMarker_{name}"
        mat = bpy.data.materials.new(f"HookMat_{name}")
        bsdf = principled(mat)
        if "Emission Color" in bsdf.inputs:
            bsdf.inputs["Emission Color"].default_value = (*rgb, 1)
        if "Emission Strength" in bsdf.inputs:
            bsdf.inputs["Emission Strength"].default_value = 3.0
        bsdf.inputs["Base Color"].default_value = (*rgb, 1)
        mk.data.materials.append(mat)
        markers.append(mk)
        roots.append(mk)
    snap("hook_identity.png", "works_top", 0)
    for mk in markers:
        bpy.data.objects.remove(mk, do_unlink=True)

    # State diagnostic: raise slit emission.
    for obj in meshes:
        if "furnace_slit" in obj.name.lower() or "Slit" in obj.name or obj.name.endswith("_furnace_slit"):
            for slot in obj.material_slots:
                mat = slot.material
                if not mat or not mat.use_nodes:
                    continue
                for node in mat.node_tree.nodes:
                    if node.type == "BSDF_PRINCIPLED" and "Emission Strength" in node.inputs:
                        node.inputs["Emission Strength"].default_value = 1.0
                        if "Emission Color" in node.inputs:
                            node.inputs["Emission Color"].default_value = (1.0, 0.45, 0.12, 1)
    snap("state_emission.png", "works_top", 0)

    pixel_top = measure_object_pixels(EVID_DIR / "works_top.png")
    pixel_edge = measure_object_pixels(EVID_DIR / "works_edge.png")
    pixel_site = measure_object_pixels(EVID_DIR / "works_site.png")
    for key in ("array",):
        pixel_top.pop(key, None)
        pixel_edge.pop(key, None)
        pixel_site.pop(key, None)
    crops = {}
    for name in (
        "works_top.png", "works_edge.png", "works_site.png",
        "works_top_clay.png", "works_edge_grazing.png",
        "normal_isolation.png", "orm_isolation.png", "id_or_material_id.png",
        "hook_identity.png", "state_emission.png",
    ):
        src = EVID_DIR / name
        if src.exists():
            crops[name] = write_1to1_crop(src, EVID_DIR / f"{src.stem}_1to1.png")
    facts = {
        "resolution": [1920, 1080],
        "fovV": FOV_V_DEG,
        "cellWu": CELL_WU,
        "works_top": {
            "distance": pose_top["distance"],
            "pxPerCell": measured_px_per_cell(pose_top["distance"], 1080),
            "objectPx": pixel_top,
        },
        "works_edge": {"objectPx": pixel_edge, "objectOffsetApplied": True},
        "works_site": {
            "pxPerCell": measured_px_per_cell(works_pose("works_site")["distance"], 1080),
            "objectPx": pixel_site,
        },
        "crops1to1": crops,
    }
    return stills, facts


def write_contact_sheet():
    """Composite the three cited local stills. No geometry copied."""
    tiles = []
    tw, th = 640, 360
    for path in REF_IMAGES:
        if not path.exists():
            raise FileNotFoundError(path)
        img = bpy.data.images.load(str(path))
        w, h = img.size
        arr = image_np(img)
        bpy.data.images.remove(img)
        # Cover-scale into tile.
        scale = max(tw / float(w), th / float(h))
        nw, nh = max(1, int(round(w * scale))), max(1, int(round(h * scale)))
        ys = np.linspace(0, h - 1, nh)
        xs = np.linspace(0, w - 1, nw)
        yi = ys.astype(np.int32)
        xi = xs.astype(np.int32)
        resized = arr[yi][:, xi]
        y0 = max(0, (nh - th) // 2)
        x0 = max(0, (nw - tw) // 2)
        crop = resized[y0:y0 + th, x0:x0 + tw]
        if crop.shape[0] != th or crop.shape[1] != tw:
            pad = np.zeros((th, tw, 4), dtype=np.float32)
            pad[:crop.shape[0], :crop.shape[1]] = crop
            crop = pad
        if crop.shape[2] == 3:
            ones = np.ones((th, tw, 1), dtype=np.float32)
            crop = np.concatenate([crop, ones], axis=2)
        tiles.append(crop)
    gutter = 12
    header = 36
    W = tw * 3 + gutter * 4
    H = th + gutter * 2 + header
    sheet = np.zeros((H, W, 4), dtype=np.float32)
    sheet[..., 3] = 1.0
    sheet[..., 0:3] = 0.06
    x = gutter
    for tile in tiles:
        sheet[header:header + th, x:x + tw] = tile
        x += tw + gutter
    name = "_contact_sheet"
    if name in bpy.data.images:
        bpy.data.images.remove(bpy.data.images[name])
    img = bpy.data.images.new(name, width=W, height=H, alpha=True)
    img.pixels.foreach_set(np.ascontiguousarray(sheet, dtype=np.float32).ravel())
    REF_DIR.mkdir(parents=True, exist_ok=True)
    out = REF_DIR / "CONTACT_SHEET.png"
    img.filepath_raw = str(out)
    img.file_format = "PNG"
    img.save()
    sanitize_png(out)
    bpy.data.images.remove(img)
    return out


def export_uv_layout(obj, path: Path):
    """Rasterize unique UV0 edges. GPU uv.export_layout is illegal in background mode."""
    size = 1024
    canvas = np.zeros((size, size, 4), dtype=np.float32)
    canvas[..., 0:3] = 0.06
    canvas[..., 3] = 1.0
    uv_layer = obj.data.uv_layers.active
    if uv_layer is None:
        return
    mesh = obj.data
    try:
        mesh.calc_loop_triangles()
    except Exception:
        pass

    def draw_line(x0, y0, x1, y1):
        x0, y0, x1, y1 = int(x0), int(y0), int(x1), int(y1)
        steps = max(1, abs(x1 - x0), abs(y1 - y0))
        for i in range(steps + 1):
            t = i / steps
            x = int(round(x0 + (x1 - x0) * t))
            y = int(round(y0 + (y1 - y0) * t))
            if 0 <= x < size and 0 <= y < size:
                canvas[y, x] = (0.92, 0.86, 0.62, 1.0)

    tris = getattr(mesh, "loop_triangles", None)
    if tris:
        for tri in tris:
            pts = []
            for li in tri.loops:
                u, v = uv_layer.data[li].uv
                pts.append((u * (size - 1), v * (size - 1)))
            draw_line(*pts[0], *pts[1])
            draw_line(*pts[1], *pts[2])
            draw_line(*pts[2], *pts[0])
    write_pixels(path.stem, canvas, size, "sRGB")
    src = TEX_DIR / f"{path.stem}.png"
    path.parent.mkdir(parents=True, exist_ok=True)
    if src.exists() and src.resolve() != path.resolve():
        shutil.copy2(src, path)


def combine_lods(lod_paths, hook_locs, lod_reports):
    reset_scene()
    root = bpy.data.objects.new(ROOT_NAME, None)
    bpy.context.scene.collection.objects.link(root)
    root.empty_display_type = "PLAIN_AXES"
    root.empty_display_size = 0.14
    sockets = {
        "furnace_slit": add_empty("furnace_slit", hook_locs["furnace_slit"], bpy.context.scene.collection, root, 0.07),
        "stack_vent": add_empty("stack_vent", hook_locs["stack_vent"], bpy.context.scene.collection, root, 0.07),
        "lamp": add_empty("lamp", hook_locs["lamp"], bpy.context.scene.collection, root, 0.06),
    }
    bpy.context.view_layer.update()
    mesh_names = []
    lod_tri = {0: 0, 1: 0, 2: 0}
    for lod, path in enumerate(lod_paths):
        before = set(bpy.data.objects)
        bpy.ops.import_scene.gltf(filepath=str(path))
        imported = [obj for obj in bpy.data.objects if obj not in before]
        for obj in imported:
            if obj.type != "MESH":
                try:
                    bpy.data.objects.remove(obj, do_unlink=True)
                except Exception:
                    pass
                continue
            raw = obj.name.split(".")[0]
            if "furnace_slit" in raw.lower() or raw.endswith("_furnace_slit") or "SlitLens" in raw or "Slit" in raw:
                obj.name = f"LOD{lod}_furnace_slit"
                parent_keep(obj, sockets["furnace_slit"])
            elif "lamp_lens" in raw.lower() or raw.endswith("_lamp_lens") or raw.endswith("_Lamp_Lens") or "Lamp_Lens" in raw:
                obj.name = f"LOD{lod}_lamp_lens"
                parent_keep(obj, sockets["lamp"])
            elif raw.startswith(f"LOD{lod}_refinery") or "refinery" in raw.lower():
                obj.name = f"LOD{lod}_refinery"
                parent_keep(obj, root)
            else:
                obj.name = f"LOD{lod}_{raw}"
                parent_keep(obj, root)
            obj["spacefaceLod"] = f"lod{lod}"
            lod_tri[lod] += count_tris(obj)
            mesh_names.append(obj.name)

    chull = bpy.data.objects.new("COLLISION_HULL", None)
    bpy.context.scene.collection.objects.link(chull)
    chull.empty_display_type = "CUBE"
    chull.empty_display_size = 1.0
    chull["sf_collision"] = True
    chull["nonRender"] = True
    chull["spaceface"] = {"collision": True, "helper": True, "nonRender": True, "kind": "box"}
    bpy.context.view_layer.update()
    chull.parent = root
    chull.matrix_parent_inverse = Matrix.Identity(4)
    chull.location = Vector(COLLISION_LOC)
    chull.scale = Vector(COLLISION_SCALE)

    contract = {
        "contractVersion": 1,
        "assetId": ASSET_ID,
        "partId": ASSET_ID,
        "liveId": ASSET_ID,
        "slot": "place",
        "category": "works",
        "family": "asteroid_works",
        "packet": "PQ-131.04",
        "cycle": CYCLE,
        "role": "one-cell ore-roast refinery — furnace, rooted stack, saddle tank",
        "forward": "+X",
        "up": "+Y",
        "starboard": "+Z",
        "unit": "metre",
        "normalConvention": "OpenGL",
        "ormChannels": "R=AO,G=Roughness,B=Metallic",
        "textureCompression": "PNG-source",
        "textureAuthorship": "unique-UV0 mesh bake + authored 1024 PBR (structure/refractory/hotmetal/stack/tank/pipe/lamp)",
        "textureSize": TEX,
        "deliverableRole": "source_candidate",
        "lods": ["lod0", "lod1", "lod2"],
        "exportedLods": ["lod0", "lod1", "lod2"],
        "lodTriangles": {f"lod{k}": int(v) for k, v in lod_tri.items()},
        "triangleCount": int(lod_tri[0]),
        "sockets": list(HOOK_NAMES),
        "hooks": list(HOOK_NAMES),
        "rootNode": ROOT_NAME,
        "wiringStatus": "source_candidate_unwired",
        "blenderBasis": "Z-up works scale",
        "exportBasis": "Y-up glTF",
        "disposition": "review_pending",
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
    combined_works = SOURCE_DIR / "refinery.glb"
    combined_parts = PARTS_DIR / COMBINED_NAME
    tmp = SOURCE_DIR / "refinery.tmp.glb"
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
        "rootNode": ROOT_NAME,
        "combined": str(combined_works.relative_to(ROOT)).replace("\\", "/"),
        "partsSource": str(combined_parts.relative_to(ROOT)).replace("\\", "/"),
        "lodTriangles": contract["lodTriangles"],
        "hooks": list(HOOK_NAMES),
        "meshNames": sorted(mesh_names),
        "bytes": combined_works.stat().st_size,
        "sha256": sha256(combined_works),
        "disposition": "review_pending",
        "cycle": CYCLE,
    }
    write_text_lf(SOURCE_DIR / "refinery_inventory.json", json.dumps(inventory, indent=2) + "\n")
    save_blend(SOURCE_DIR / "works_refinery.blend")
    inspection = inspect_glb(combined_parts, hook_locs)
    if not inspection.get("ok"):
        raise RuntimeError(
            "combined export lost functional transforms: "
            + json.dumps({
                "invalidHookTranslations": inspection.get("invalidHookTranslations"),
                "collisionTranslation": inspection.get("collisionTranslation"),
                "collisionScale": inspection.get("collisionScale"),
                "collisionOk": inspection.get("collisionOk"),
            }, indent=2)
        )
    return inventory, contract, combined_works, combined_parts, inspection


def run_visible_faces(glb: Path, json_out: Path):
    blender = bpy.app.binary_path
    script = TOOLS / "works_visible_faces.py"
    import subprocess
    json_out.parent.mkdir(parents=True, exist_ok=True)
    cmd = [
        blender, "--background", "--python", str(script), "--",
        "--glb", str(glb), "--json-out", str(json_out),
    ]
    proc = subprocess.run(cmd, capture_output=True, text=True)
    print(proc.stdout[-4000:] if proc.stdout else "")
    if proc.returncode != 0:
        print(proc.stderr[-2000:] if proc.stderr else "")
    if json_out.exists():
        json_out.write_bytes(json_out.read_bytes().replace(b"\r\n", b"\n"))
    return proc.returncode, json_out if json_out.exists() else None


def build_all():
    assert_prior_cycles_untouched()
    FAMILY.mkdir(parents=True, exist_ok=True)
    TEX_DIR.mkdir(parents=True, exist_ok=True)
    REF_DIR.mkdir(parents=True, exist_ok=True)
    EVID_DIR.mkdir(parents=True, exist_ok=True)

    reset_scene()
    contact_path = REF_DIR / "CONTACT_SHEET.png"
    if contact_path.exists():
        print(f"keeping Cycle 01 contact sheet {contact_path}")
        contact = contact_path
    else:
        contact = write_contact_sheet()
        print(f"contact sheet {contact}")

    lod_paths = []
    lod_reports = []
    hook_locs = {
        "furnace_slit": (FX, FY, WELL_FLOOR + 0.012),
        "stack_vent": (SX, SY, STACK_TOP),
        "lamp": LAMP_LOC,
    }
    uv_layout_path = EVID_DIR / "uv0_layout.png"

    for lod in (0, 1, 2):
        reset_scene()
        collection = bpy.data.collections.new(f"Refinery_LOD{lod}")
        bpy.context.scene.collection.children.link(collection)
        mats = make_role_materials(lod)
        built = build_lod_geometry(lod, mats, collection)
        hook_locs["furnace_slit"] = tuple(built["slit_loc"])
        hook_locs["stack_vent"] = tuple(built["vent_loc"])
        hook_locs["lamp"] = tuple(built["lamp_loc"])
        tex_size = TEX if lod < 2 else 512
        body_low, bake_report = bake_and_author(lod, built["body"], built["high_extra"], collection, tex_size)
        ember = finish_emit_mesh(built["ember"], lod, "furnace_slit")
        lens = finish_emit_mesh(built["lens"], lod, "lamp_lens")
        if lod == 0:
            export_uv_layout(body_low, uv_layout_path)
        objects = [body_low, ember, lens]
        tris = sum(count_tris(o) for o in objects)
        if tris > TRI_BUDGET[lod]:
            raise RuntimeError(f"LOD{lod} triangles {tris} exceed budget {TRI_BUDGET[lod]}")
        bb = bbox_of(objects)
        if bb:
            mn, mx = bb["min"], bb["max"]
            if mx[0] - mn[0] > CELL_WU + 0.02 or mx[1] - mn[1] > CELL_WU + 0.02:
                raise RuntimeError(f"LOD{lod} footprint {bb['size']} exceeds cell {CELL_WU}")
            if mn[2] < -0.02:
                raise RuntimeError(f"LOD{lod} underside {mn[2]} below z=0")
        out = SOURCE_DIR / f"refinery_lod{lod}.glb"
        export_lod_glb(objects, lod, out)
        report = {
            "lod": lod,
            "triangles": tris,
            "budget": TRI_BUDGET[lod],
            "draws": len(objects),
            "bbox": bb,
            "path": str(out.relative_to(ROOT)).replace("\\", "/"),
            "bytes": out.stat().st_size,
            "sha256": sha256(out),
            **bake_report,
        }
        print(json.dumps({k: report[k] for k in ("lod", "triangles", "draws", "bytes")}, indent=2))
        lod_paths.append(out)
        lod_reports.append(report)

    inventory, contract, combined, parts, inspection = combine_lods(lod_paths, hook_locs, lod_reports)
    stills, pixel_facts = capture_stills(combined)
    still_hashes = {
        path.name: sha256(path)
        for path in sorted(EVID_DIR.glob("*.png"), key=lambda item: item.name)
    }
    vf_json = EVID_DIR / "works_visible_faces.json"
    vf_code, vf_path = run_visible_faces(parts, vf_json)

    hashes = {
        "cycle": CYCLE,
        "disposition": "review_pending",
        "rootNode": ROOT_NAME,
        "hooks": list(HOOK_NAMES),
        "partsGlb": str(parts.relative_to(ROOT)).replace("\\", "/"),
        "partsSha256": sha256(parts),
        "sourceGlb": inventory["combined"],
        "sourceSha256": inventory["sha256"],
        "lods": {f"lod{r['lod']}": {"path": r["path"], "sha256": r["sha256"], "triangles": r["triangles"]} for r in lod_reports},
        "textures": {f"lod{r['lod']}": r["maps"] for r in lod_reports},
        "blend": "assets/works/refinery/source/works_refinery.blend",
        "blendSha256": sha256(SOURCE_DIR / "works_refinery.blend"),
        "builder": "tools/blender/build_works_refinery.py",
        "builderSha256": sha256(Path(__file__)),
        "lod0Maps": {
            "basecolor": sha256(TEX_DIR / "refinery_lod0_basecolor.png"),
            "normal": sha256(TEX_DIR / "refinery_lod0_normal.png"),
            "orm": sha256(TEX_DIR / "refinery_lod0_orm.png"),
        },
    }
    write_text_lf(FAMILY / "HASHES.json", json.dumps(hashes, indent=2) + "\n")

    vf = {}
    if vf_path and vf_path.exists():
        try:
            vf = json.loads(vf_path.read_text(encoding="utf-8"))
        except Exception:
            vf = {"path": str(vf_path.relative_to(ROOT)).replace("\\", "/")}

    epoch = {
        "schema": "spaceface.worksRefinery.cycle.v1",
        "assetId": ASSET_ID,
        "cycle": CYCLE,
        "disposition": "review_pending",
        "immutable": True,
        "rootNode": ROOT_NAME,
        "packet": "PQ-131.04",
        "reviewersLaunched": False,
        "targetCellWu": CELL_WU,
        "lods": lod_reports,
        "hooks": inspection["hooks"],
        "hookWorld": {k: list(v) for k, v in hook_locs.items()},
        "inspection": inspection,
        "inventory": inventory,
        "stills": stills,
        "stillSha256": still_hashes,
        "pixelFacts": pixel_facts,
        "visibleFaces": vf,
        "visibleFacesExit": vf_code,
        "hashes": hashes,
        "blender": {
            "version": bpy.app.version_string,
            "binary": bpy.app.binary_path,
            "export": "ok",
            "render": "ok",
        },
        "budgets": {"triangles": TRI_BUDGET, "texture": TEX},
        "notes": (
            "Cycle 03 source candidate. Formed chamfered jacket with waist belt, courses, "
            "and corner returns; deeper blind refractory well with a thin dark lip; four "
            "gusseted feet with pad gap; stack rooted by elbow/union/banded transition; "
            "tank on two wrapped saddles with manway and nozzle. Beauty emission off. "
            "Cycle 01 and Cycle 02 evidence immutable."
        ),
    }
    epoch_path = FAMILY / "evidence" / "cycle_003.json"
    write_text_lf(epoch_path, json.dumps(epoch, indent=2) + "\n")
    assert_prior_cycles_untouched()
    print(json.dumps({"ok": True, "sha256": hashes["partsSha256"], "lodTriangles": inspection["lodTriangles"], "hooks": inspection["hooks"]}, indent=2))
    return epoch


def recombine_from_accepted_lods():
    """Rebuild only the combined export from frozen Cycle 03 LOD GLBs.

    Does not regenerate meshes, textures, stills, or Cycle 01/02 evidence.
    Hook locations come from the accepted Cycle 03 hookWorld record.
    """
    hashes_path = FAMILY / "HASHES.json"
    hashes = json.loads(hashes_path.read_text(encoding="utf-8"))
    epoch = json.loads((FAMILY / "evidence" / "cycle_003.json").read_text(encoding="utf-8"))
    hook_locs = {name: tuple(epoch["hookWorld"][name]) for name in HOOK_NAMES}
    lod_paths = []
    lod_reports = []
    for lod in (0, 1, 2):
        row = hashes["lods"][f"lod{lod}"]
        path = ROOT / row["path"]
        digest = sha256(path)
        if digest != row["sha256"]:
            raise RuntimeError(f"accepted LOD{lod} hash drifted: {digest} != {row['sha256']}")
        lod_paths.append(path)
        lod_reports.append({"lod": lod, "triangles": row["triangles"], "path": row["path"], "sha256": digest})
    inventory, _contract, _combined, parts, inspection = combine_lods(lod_paths, hook_locs, lod_reports)
    hashes["partsSha256"] = sha256(parts)
    hashes["sourceSha256"] = inventory["sha256"]
    hashes["blendSha256"] = sha256(SOURCE_DIR / "works_refinery.blend")
    hashes["builderSha256"] = sha256(Path(__file__))
    hashes["hookGltfTranslations"] = inspection["hookTranslations"]
    hashes["collisionGltf"] = {
        "translation": inspection["collisionTranslation"],
        "scale": inspection["collisionScale"],
    }
    write_text_lf(hashes_path, json.dumps(hashes, indent=2) + "\n")
    print(json.dumps({
        "ok": True,
        "mode": "recombine",
        "partsSha256": hashes["partsSha256"],
        "sourceSha256": hashes["sourceSha256"],
        "lodsUnchanged": {f"lod{i}": hashes["lods"][f"lod{i}"]["sha256"] for i in range(3)},
        "hookTranslations": inspection["hookTranslations"],
        "collisionTranslation": inspection["collisionTranslation"],
        "collisionScale": inspection["collisionScale"],
        "bytes": inventory["bytes"],
    }, indent=2))
    return inspection


def main():
    args = argv_after()
    if "--contact-sheet-only" in args:
        reset_scene()
        path = write_contact_sheet()
        print(path)
        return
    if "--inspect" in args:
        glb = PARTS_DIR / COMBINED_NAME
        epoch = json.loads((FAMILY / "evidence" / "cycle_003.json").read_text(encoding="utf-8"))
        hook_locs = {name: tuple(epoch["hookWorld"][name]) for name in HOOK_NAMES}
        print(json.dumps(inspect_glb(glb, hook_locs), indent=2))
        return
    if "--recombine" in args:
        recombine_from_accepted_lods()
        return
    build_all()


if __name__ == "__main__":
    main()

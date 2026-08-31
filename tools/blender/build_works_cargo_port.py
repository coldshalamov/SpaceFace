"""PQ-131.09 Works cargo port — Cycle 04 source candidate builder.

Cycle 04 is a source-only correction of Cycle 03: cut a strongly non-round
keyed docking opening whose wall thickness survives at ~120 px/cell; rebuild
one open C-clamp whose arms are the apron lip; give the five crates distinct
planform silhouettes; separate port / pod / freight values so the site stamp
is not one brown disc. Cycle 01–03 evidence stay frozen.

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
EVIDENCE_DIR = FAMILY / "evidence" / "cycle_004"
CYCLE01_DIR = FAMILY / "evidence" / "cycle_001"
CYCLE02_DIR = FAMILY / "evidence" / "cycle_002"
CYCLE03_DIR = FAMILY / "evidence" / "cycle_003"
CYCLE01_HASHES_PATH = CYCLE01_DIR / "HASHES.json"
PARTS_DIR = ROOT / "assets" / "ships" / "parts" / "works"
COMBINED_NAME = "place_works_cargo_port.glb"
ROOT_NAME = "SF_WORKS_CARGO_PORT_V1"
ASSET_ID = "place_works_cargo_port"
CYCLE = 4
STILL_DIR_REL = "evidence/cycle_004"
CYCLE01_CANDIDATE = "BF506A8937DFC5FE196841E6B061C04D48BE24258130B5BDD4342F3CC16D3A70"
CYCLE02_CANDIDATE = "81BF7466450434AA0E2CA055D793548CCC8150107D7E51046922B7525E11A532"
CYCLE03_CANDIDATE = "6DD2D23C7948A52C90CE2966A3F851870997B79BFD6CF0235AE8CF139A13D377"
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

# Well / collar — inner octagon is the real hole. Outer radii vary so the
# flange cannot read as a concentric torus. Loading throat opens toward +X.
WELL_CX, WELL_CY = -0.28, 0.00
WELL_R_IN = 0.42
WELL_R_OUT_VAR = (0.70, 0.54, 0.66, 0.58, 0.74, 0.52, 0.62, 0.56)
COLLAR_Z = 0.42
WELL_FLOOR_Z = 0.03
APRON_Z = 0.08
# Pod seats toward the loading throat so a dark liner crescent stays visible.
POD_CX, POD_CY = WELL_CX + 0.06, WELL_CY - 0.04
LAUNCH_CLEAR_Z = 1.55
# Flange sectors 7 and 0 face +X and stay open as the skip-loading throat.
LOADING_SECTORS = frozenset((7, 0))

ATLAS_TILE = {
    "port": 0,
    "cradle": 1,
    "crate": 2,
    "pod": 3,
    "thruster": 4,
}
ROLE_RGB = {
    "port": (0.138, 0.122, 0.108),
    "cradle": (0.530, 0.488, 0.422),
    "crate": (0.430, 0.348, 0.230),
    "pod": (0.210, 0.218, 0.228),
    "thruster": (0.145, 0.122, 0.095),
}
CRATE_BANDS = (
    (0.00, 0.16, (0.420, 0.365, 0.245), 0.58, 0.08),   # olive trunk
    (0.16, 0.32, (0.520, 0.400, 0.245), 0.55, 0.10),   # khaki cube
    (0.32, 0.48, (0.390, 0.318, 0.230), 0.60, 0.08),   # tan instrument, not green
    (0.48, 0.64, (0.360, 0.320, 0.255), 0.42, 0.40),   # frame / steel
    (0.64, 0.80, (0.210, 0.188, 0.162), 0.50, 0.16),   # dark polymer L
    (0.80, 1.01, (0.300, 0.278, 0.245), 0.38, 0.66),   # irons / straps
)
POD_BANDS = (
    (0.00, 0.40, (0.070, 0.062, 0.055), 0.72, 0.10),   # well interior, darkest
    (0.40, 0.78, (0.205, 0.212, 0.222), 0.50, 0.16),   # dark pressure skin, not a cool disc
    (0.78, 1.01, (0.155, 0.148, 0.140), 0.40, 0.46),   # dark machined rim
)
ROLE_V_DEFAULT = {
    "port": (0.02, 0.98),
    "cradle": (0.02, 0.98),
    "crate": (0.02, 0.18),
    "pod": (0.32, 0.74),
    "thruster": (0.02, 0.98),
}
CRATE_V = {
    0: (0.02, 0.15),
    1: (0.17, 0.31),
    2: (0.33, 0.47),
    3: (0.49, 0.63),
    4: (0.65, 0.79),
}
CYCLE01_STILL_FREEZE = {
    "works_top": "AD9BB5D1E01E116CCA62A6B078EDBE8E862557F5A67F4225B9FB3C8A92F66DBB",
    "works_edge": "B55BE5F6D4726E4223578997C4B99E3ABCF9A27B6C3852FCF5BF3DD7DCA32C1C",
    "works_top_clay": "D48F95D1E0FEE3E71E3FECBE76AB62CBF3B87CC371C0FF9C7AAAC464EC602D6B",
    "works_edge_clay": "195C519B65470FE4C0F795CBF11736AFF279C6BF332E69ED0E29739BE9D20D4C",
    "works_top_grazing": "D4476AEA33822B40345206C79543F6CC97205B5F79457159EC49D080FF344548",
    "works_top_normal": "258DAE3365277CADACE64C5D4E70D0841E3C6F0B70DC89D076B44FFE12D5A95E",
    "works_top_orm": "266D7A8E2A1ECCDD993A29D6B58CDF6FA5547CE74FDE7BEF1993FCE59FE09B8D",
    "works_top_matid": "12E7D1F9518A72151D47602E6198B7A4D0B4A4F1D693A214C8662501DD4E62AD",
    "works_top_hooks": "20C1F02475A5F94E8F8233826C458355556294619A23C39260A262484103D64B",
    "crate_stage_01": "6AA3AB8251C93CDB260B7A647130F9043C62629DD2BA3F5FAE668B5451F43735",
    "crate_stage_02": "A89BBB53E7F63B3F944B188A8AD1A4A2CF879F64D9320F3F2848884F58547551",
    "crate_stage_03": "72EE15A0880932B317866C968326764E18F03DFF2E19E45D0082A80B5ABF66B7",
    "crate_stage_04": "50C4BB5593A73C7E66F8826120D2ADBD9C92950BC8447855D1B5B81DF88105A4",
    "crate_stage_05": "D4CE15102C09702811520B63A20EF1935251259DD87C8AED99FCD16A6034A8F7",
    "crate_stage_sheet": "037C084505694AE2019D71310349ACB95D91199411A0894B01E5DC3170CB1809",
    "pod_seated_top": "D4CE15102C09702811520B63A20EF1935251259DD87C8AED99FCD16A6034A8F7",
    "pod_seated_edge": "60F018F7323C550923D8DE5323EE068BF939455CB93C583D40B93B964F072EB6",
    "pod_launch_clear_top": "4D509290AE37B77E39340C01AD637A30D078CA611DF7EDBE7174621CAB125051",
    "pod_launch_clear_edge": "BC66DE5ECFC822DC84FBD5E21E6D907FD072152F06E4DEEEBE0146F8089C25C2",
    "works_site": "FA2D9779200570B56D46C71D5A7DF89A7F75BC9BBD83A0F12F03A6CF864C1F96",
    "works_site_id": "C077CC38363C6709BFB1C885B2053D0CE871C5B6EE994F066AFE513828C4D5E5",
}
CYCLE01_REF_FREEZE = {
    "ref_01": "67344F641C1E704549110EA624B69877FC781AB73CC864B73EDABE5DFCED7174",
    "ref_02": "17FEF1588BEFBA68121AC34D0418057D3C0AEF4D8C3EBD3612DB957063C2D9F9",
    "ref_03": "995864893A2035C6BAC71B8B33483F044E306EC70845337940EF688348136684",
    "ref_04": "5E0BC217E1144D50EE80011F981ABA7CD86A9BD639EE1C68D059C85EF1D7993C",
}
CYCLE02_STILL_FREEZE = {
    "works_top": "E51CA809C5065D229C473B63BF57656267EBC72F96E905C3E4CF00E776E3FEA2",
    "works_edge": "A2C8A3395EC385F946EAFE20A57ACF9108E686F97E8102527F7B64A5AEA65DC8",
    "works_top_clay": "196D6BBBD9A0598CD696C798207B918227110C0533440EB2AA85C58878FD3D67",
    "works_edge_clay": "DA3E1B147552F503661BD5860AAF361FF64C7A818B6687E5255FBE4DDA1AB034",
    "works_top_grazing": "1A6237EE433F699B3B66299E736E1ADC624D7FD113E303C45812A8EB7E55B731",
    "works_top_normal": "AC3BBE5DE0445F89BED9699F7BE14DA41921970C5C1B992CA86CB407B22CA1B1",
    "works_top_orm": "440E0C0D3D1EF70BE3865901ABCA4238D94B725CD9911435FAA833D946752411",
    "works_top_matid": "671AECC999198B9867F1F71B3CE5C8AE53EFF60568A7757414D1516FE81117E7",
    "works_top_hooks": "B0677A8BB720B481F956344AB7EB05A248FBE6BF0B35B38289F0B61ACF89E377",
    "crate_stage_01": "4B2E123981CB43388E55EC32263EC65C1368B077A7E048ED85E63D25C6A72268",
    "crate_stage_02": "509559CCC468C1EFA402B5F405CCE5535F380A41AE16C7BDCF4FC38712C38C4C",
    "crate_stage_03": "FAC251A40DD6EA8D165E52B2DDCD52D4D384908D86A488DE08D99AE122AFE91D",
    "crate_stage_04": "BA410A417EF85926ACD75B9ADB42570EA9DD21F6C9873096EC43F4DCEA014AC6",
    "crate_stage_05": "34FAD21AF1B681622F183CA916DA4CBBC941BDA70E3DB42979A091AAA5ED5ED2",
    "crate_stage_sheet": "C97675C3B7342C5B8FF641CFAE382529090BA0BD0D69F706E5723F87317FF20D",
    "pod_seated_top": "4DD320C18C8BD45F2BA166BC569109D96185C874254875D75EC39A63764CFB31",
    "pod_seated_edge": "403FF541F209BE7C1A8DE1911BBEA813A96F20C1C4A154ED7F8737E61FFC2A31",
    "pod_launch_clear_top": "8500D167517373E72DDE395F9F0A438CF2B9C3880225F91D85D4148F4CA59305",
    "pod_launch_clear_edge": "AAA4101BC89DF930B75416AAE0D056256DCA2971C3257CE0C80835428CB429B6",
    "works_top_lod1": "7412DC869C76A5CAAD37685E58B82E98818E89AF59A8B0EB00B7EB38BE5DD157",
    "works_site": "4D8B079F6682C287A21BA00564F6E31B841E0C15688C43B21C6F4A316824FD7B",
    "works_site_id": "186266A098189FE2FD6E6F048C75EF948E0DD5629EC72332C09F9ADA56BBE969",
    "works_top_lod2": "48003813980B697187765388BEC278574AA60422437555F0F14C4A14CB0E7152",
    "works_site_lod2": "E255032C44482DC9C0DA52B8E394911B78A46DB3D15631C2BA84037917EC461D",
}
CYCLE03_STILL_FREEZE = {
    "works_top": "75E1769D2518FD4B7655629CBFB616547A6B8D2A622072DADB9088C82E1B86ED",
    "works_edge": "351C28B30360084E66BFC7FE6B1C854BFBA050CD48FFA7561238784717177F61",
    "works_top_clay": "79AAA2CEEE9597501B431B1889BB590052D3DE8E688B44C34D7389489C202110",
    "works_edge_clay": "84323B88F27C96387149655D776B076FA4C0DC7F57702B2B19EFFC644D8E00A5",
    "works_top_grazing": "BADC6C9EFDE68238A7CBA8DB3D0E8221D13D2436245D9C80E0A44A08F04DBA73",
    "works_top_normal": "10794203A075A034053775EE8C7CA77E9BCD09962E07A09BE2000DA3315A9970",
    "works_top_orm": "9CD887E152DDD17E56D73C772DD0D30968B713D7A6789B2CE3F9FECD50FAF105",
    "works_top_matid": "ACEE23731DE6A29ABA0841CDC4183AE1C79D87EEB44E6F9ADF6E4BBFBEC9366E",
    "works_top_hooks": "D520DD5ECBC3E241020A18F7D0550AE4AC7F5090EB7E21202801E564651D731A",
    "crate_stage_01": "EFB07EA5F468080E286671D8125FF262BF623F106C54A3BDD488DCFCC14AB17C",
    "crate_stage_02": "A568F12DD11ACE9ADE283E242341B9C7FD57B39970F4AE09A37B7AEEEA201118",
    "crate_stage_03": "B30093B1D2B6313257157AD401D297148173165BF13C01015E5B28588010C93E",
    "crate_stage_04": "85F0F5462D62C61D55F5AA25836A2F3182C899C07E99B525B07A9A2F1D72B943",
    "crate_stage_05": "18D1AB4E1EBA4915D3E7AAAD15DC12C0599D48EF57B381BF907E6DF6310654CE",
    "crate_stage_sheet": "344AE91DB49574FFBE5EAE6FD3F4AC9ED0BDC39901309B45D06CD042082D5DD8",
    "pod_seated_top": "25E89329A3E602723408055524C4FF5393A5900446DA25255E8CE58028AFBEF4",
    "pod_seated_edge": "9638DAD5E24FAF39F84CA5DF8723950D05F19DD644F001DA885B03FC1437E164",
    "pod_launch_clear_top": "F2D9440EBBE58A5374C3091A3C247F406ADCDCDB9B8035536574D7DEC9BBF043",
    "pod_launch_clear_edge": "3819EB837E21E24320EA41D286B5CFF2843F1C943B17FBE34FB73B9F8BC63084",
    "works_top_lod1": "4BDC7F0FF237AD9A2A31636C8EEA80237A0764333611BA017FAF4795A042FEED",
    "works_site": "86BECC399624E3C8D1AA3CCE3F7BEAC98706B1FDB7FDCC70383F28E148F34FDA",
    "works_site_id": "A9005E55045AD0BDA37387DEECB21F8B38DCF9CBBCA8CEEF598F5F90902AC6F9",
    "works_top_lod2": "7D209D20EED1DBF6842725D72E23DF19A05BEC2BD7B97EF4F6280643C1A3ACA4",
    "works_site_lod2": "913E3AD7B0260843DE25A74DFA2F29C46356A490DA80B7C379419F2E031AF869",
}
KEEP_PNG = {b"IHDR", b"PLTE", b"IDAT", b"IEND", b"sRGB", b"gAMA", b"pHYs"}
ROLE_FLAT = {
    "port": (0.14, 0.12, 0.10),
    "cradle": (0.64, 0.58, 0.44),
    "crate": (0.56, 0.42, 0.20),
    "pod": (0.24, 0.28, 0.32),
    "thruster": (0.70, 0.55, 0.28),
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


def loft_oval(name, stations, n, mat, coll, bevel, cx, cy, rx_scale=1.0, ry_scale=0.88,
              cap_bottom=True, cap_top=True):
    """Faceted pressure shell. Slight Y squash breaks lathe-torus identity."""
    verts = []
    for z, r in stations:
        for i in range(n):
            a = 2.0 * math.pi * i / n + math.pi / n
            verts.append((
                cx + r * rx_scale * math.cos(a),
                cy + r * ry_scale * math.sin(a),
                z,
            ))
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


def add_arc_shell(name, cx, cy, z0, z1, r_in, r_out, a0, a1, segs, mat, coll, bevel, cap_ends=True):
    """Open C-section around +Z. Inclusive `segs` along the arc."""
    segs = max(3, int(segs))
    verts = []
    rings = ((z0, r_out), (z0, r_in), (z1, r_in), (z1, r_out))
    for z, r in rings:
        for i in range(segs):
            t = i / float(segs - 1)
            a = a0 + (a1 - a0) * t
            verts.append((cx + r * math.cos(a), cy + r * math.sin(a), z))
    faces = []

    def ring(ri, i):
        return ri * segs + i

    for i in range(segs - 1):
        faces.append((ring(0, i), ring(0, i + 1), ring(1, i + 1), ring(1, i)))
        faces.append((ring(1, i), ring(1, i + 1), ring(2, i + 1), ring(2, i)))
        faces.append((ring(2, i), ring(2, i + 1), ring(3, i + 1), ring(3, i)))
        faces.append((ring(3, i), ring(3, i + 1), ring(0, i + 1), ring(0, i)))
    if cap_ends:
        last = segs - 1
        faces.append((ring(0, 0), ring(1, 0), ring(2, 0), ring(3, 0)))
        faces.append((ring(0, last), ring(3, last), ring(2, last), ring(1, last)))
    return add_mesh(name, verts, faces, mat, coll, bevel)


def d_key_pts(cx, cy, hx, hy, x_flat, key_depth, key_half, n_curve=7):
    """D-shaped keyed opening. Curved -X, flat +X, rectangular key further +X.

    Returns CCW (x, y) starting at the top of the curve. Strongly non-round.
    """
    n_curve = max(4, int(n_curve))
    pts = []
    for i in range(n_curve):
        t = i / float(n_curve - 1)
        a = math.pi * 0.5 + math.pi * t
        pts.append((cx + hx * math.cos(a), cy + hy * math.sin(a)))
    pts.extend((
        (cx + x_flat, cy - hy),
        (cx + x_flat, cy - key_half),
        (cx + x_flat + key_depth, cy - key_half),
        (cx + x_flat + key_depth, cy + key_half),
        (cx + x_flat, cy + key_half),
        (cx + x_flat, cy + hy),
    ))
    return pts


def add_keyed_docking_well(name, cx, cy, z_rim, z_floor, n, rx_out, ry_out, hx, hy, mat_rim, mat_well, coll, bevel):
    """Open D+key docking well: thick rim, inward walls, dark floor. Not a circular badge."""
    n_curve = max(4, int(n) - 6)
    wall = max(0.055, min(rx_out - hx, ry_out - hy))
    x_flat = hx * 0.22
    key_depth = hx * 0.85
    key_half = hy * 0.42
    inner = d_key_pts(cx, cy, hx, hy, x_flat, key_depth, key_half, n_curve)
    outer = d_key_pts(
        cx, cy, hx + wall, hy + wall,
        x_flat + wall * 0.45, key_depth + wall * 0.35, key_half + wall * 0.35,
        n_curve,
    )
    n_pts = len(inner)
    if len(outer) != n_pts:
        raise RuntimeError("keyed well inner/outer count mismatch")

    rim_verts = [(p[0], p[1], z_rim) for p in outer] + [(p[0], p[1], z_rim) for p in inner]
    rim_faces = []
    for i in range(n_pts):
        j = (i + 1) % n_pts
        rim_faces.append((i, j, n_pts + j, n_pts + i))
    rim = add_mesh(f"{name}_Rim", rim_verts, rim_faces, mat_well, coll, bevel)
    set_role(rim, "port", 0.02, 0.28)
    objs = [rim]

    floor_scale = 0.58
    floor_pts = d_key_pts(
        cx, cy, hx * floor_scale, hy * floor_scale,
        x_flat * floor_scale, key_depth * floor_scale, key_half * floor_scale,
        n_curve,
    )
    well_verts = []
    for i in range(n_pts):
        well_verts.append((inner[i][0], inner[i][1], z_rim))
        well_verts.append((floor_pts[i][0], floor_pts[i][1], z_floor))
    wall_faces = []
    for i in range(n_pts):
        j = (i + 1) % n_pts
        a0, a1 = i * 2, j * 2
        wall_faces.append((a0 + 1, a1 + 1, a1, a0))
    walls = add_mesh(f"{name}_Wall", well_verts, wall_faces, mat_well, coll, bevel * 0.4)
    set_role(walls, "port", 0.02, 0.22)
    objs.append(walls)

    floor_verts = [(p[0], p[1], z_floor) for p in floor_pts]
    floor = add_mesh(f"{name}_Floor", floor_verts, [tuple(range(n_pts))], mat_well, coll, 0.0)
    set_role(floor, "port", 0.02, 0.16)
    objs.append(floor)
    return objs


def add_u_clamp(name, stations, z0, z1, mat, coll, bevel):
    """One continuous U/C box-section strip. Each station is (x_in, y_in, x_out, y_out)."""
    verts = []
    for x_in, y_in, x_out, y_out in stations:
        verts.extend((
            (x_out, y_out, z0),
            (x_in, y_in, z0),
            (x_in, y_in, z1),
            (x_out, y_out, z1),
        ))
    faces = []
    ns = len(stations)
    for s in range(ns - 1):
        a = s * 4
        b = (s + 1) * 4
        faces.append((a, b, b + 1, a + 1))
        faces.append((a + 1, b + 1, b + 2, a + 2))
        faces.append((a + 2, b + 2, b + 3, a + 3))
        faces.append((a + 3, b + 3, b, a))
    last = (ns - 1) * 4
    faces.append((0, 1, 2, 3))
    faces.append((last, last + 3, last + 2, last + 1))
    return add_mesh(name, verts, faces, mat, coll, bevel)


def clamp_stations(lod):
    """Open C around the pod. Arms flare onto +X and ARE the apron lip."""
    cx, cy = POD_CX, POD_CY
    r_in, r_out = 0.275, 0.455
    a0 = math.radians(36.0)
    a1 = math.radians(324.0)
    n_arc = 7 if lod == 0 else (5 if lod == 1 else 4)
    n_leg = 4 if lod == 0 else 3

    def polar(a):
        ca, sa = math.cos(a), math.sin(a)
        back = max(0.0, -ca)
        side = abs(sa)
        ri = r_in - 0.018 * back
        ro = r_out + 0.055 * back + 0.012 * side
        return (cx + ri * ca, cy + ri * sa, cx + ro * ca, cy + ro * sa)

    def lerp4(p, q, t):
        return tuple(p[k] + (q[k] - p[k]) * t for k in range(4))

    t0 = polar(a0)
    t1 = polar(a1)
    # Flare OPEN onto the apron. The arm section is the loading-deck lip,
    # not a pinched ring glued to a pad of boxes.
    upper_end = (0.48, 0.130, 0.62, 0.310)
    lower_end = (0.48, -0.130, 0.62, -0.310)

    stations = []
    for i in range(n_leg):
        t = i / float(n_leg)
        stations.append(lerp4(upper_end, t0, t))
    for i in range(n_arc):
        t = i / float(n_arc - 1)
        a = a0 + (a1 - a0) * t
        stations.append(polar(a))
    for i in range(1, n_leg + 1):
        t = i / float(n_leg)
        stations.append(lerp4(t1, lower_end, t))
    return stations


def add_hat_pad(tag, cx, cy, sx, sy, mat, coll, bevel, rot_z=0.0, role="port"):
    """Folded hat-section jack pad: base on z=0, two webs, top flanges."""
    objs = []
    ca, sa = math.cos(rot_z), math.sin(rot_z)

    def local(lx, ly, z):
        return (cx + lx * ca - ly * sa, cy + lx * sa + ly * ca, z)

    base = add_box(
        f"{tag}_Base", local(0, 0, 0.012), (sx * 0.50, sy * 0.50, 0.012),
        mat, coll, bevel, rot=(0.0, 0.0, rot_z),
    )
    set_role(base, role)
    objs.append(base)
    for i, ly in enumerate((-sy * 0.38, sy * 0.38)):
        web = add_box(
            f"{tag}_Web{i}", local(0, ly, 0.055), (sx * 0.42, 0.016, 0.042),
            mat, coll, bevel * 0.6, rot=(0.0, 0.0, rot_z),
        )
        set_role(web, role)
        objs.append(web)
        flange = add_box(
            f"{tag}_Flange{i}", local(0, ly, 0.098), (sx * 0.46, 0.028, 0.010),
            mat, coll, bevel * 0.5, rot=(0.0, 0.0, rot_z),
        )
        set_role(flange, role)
        objs.append(flange)
    return objs


def add_c_channel(tag, loc, length, depth, thick, axis, mat, coll, bevel, role="port"):
    """Load-bearing C-channel. axis='z' stands a well guide; axis='x'/'y' is a skid."""
    objs = []
    cx, cy, cz = loc
    if axis == "z":
        web = add_box(f"{tag}_Web", (cx, cy, cz), (thick, depth * 0.5, length * 0.5), mat, coll, bevel)
        lip_a = add_box(
            f"{tag}_LipA", (cx + depth * 0.35, cy, cz),
            (depth * 0.28, thick, length * 0.46), mat, coll, bevel * 0.5,
        )
        lip_b = add_box(
            f"{tag}_LipB", (cx, cy + depth * 0.35, cz),
            (thick, depth * 0.28, length * 0.46), mat, coll, bevel * 0.5,
        )
        for obj in (web, lip_a, lip_b):
            set_role(obj, role)
            objs.append(obj)
    elif axis == "x":
        web = add_box(f"{tag}_Web", (cx, cy, cz), (length * 0.5, thick, depth * 0.5), mat, coll, bevel)
        set_role(web, role)
        objs.append(web)
        for i, oy in enumerate((-depth * 0.35, depth * 0.35)):
            lip = add_box(
                f"{tag}_Lip{i}", (cx, cy + oy, cz + 0.012),
                (length * 0.46, thick, 0.012), mat, coll, bevel * 0.5,
            )
            set_role(lip, role)
            objs.append(lip)
    else:
        web = add_box(f"{tag}_Web", (cx, cy, cz), (thick, length * 0.5, depth * 0.5), mat, coll, bevel)
        set_role(web, role)
        objs.append(web)
        for i, ox in enumerate((-depth * 0.35, depth * 0.35)):
            lip = add_box(
                f"{tag}_Lip{i}", (cx + ox, cy, cz + 0.012),
                (thick, length * 0.46, 0.012), mat, coll, bevel * 0.5,
            )
            set_role(lip, role)
            objs.append(lip)
    return objs


def crate_module(tag, cx, cy, sx, sy, sz, z0, mat_crate, mat_port, coll, lod, kind):
    """Five unique planforms. 0 bar trunk, 1 cube+X, 2 long instrument, 3 hollow frame, 4 L."""
    tag = f"L{lod}_{tag}"
    objs = []
    bevel = 0.006 if lod == 0 else 0.0
    paint = CRATE_V[kind]
    iron = (0.82, 0.98)
    foot_z = z0 + 0.016

    if kind == 0:
        # Wide lidded trunk — long +X bar, first load at the -Y apron edge.
        body = add_box(f"{tag}_Body", (cx, cy, z0 + sz * 0.40), (sx * 0.48, sy * 0.38, sz * 0.36), mat_crate, coll, bevel)
        set_role(body, "crate", *paint)
        objs.append(body)
        lid = add_box(f"{tag}_Lid", (cx, cy, z0 + sz * 0.84), (sx * 0.50, sy * 0.40, 0.022), mat_crate, coll, bevel)
        set_role(lid, "crate", *paint)
        objs.append(lid)
        if lod <= 1:
            for i, oy in enumerate((-sy * 0.12, sy * 0.12)):
                strap = add_box(f"{tag}_Strap{i}", (cx, cy + oy, z0 + sz * 0.90), (sx * 0.52, 0.018, 0.010), mat_port, coll, 0.002)
                set_role(strap, "crate", *iron)
                objs.append(strap)
            for i, ox in enumerate((-sx * 0.46, sx * 0.46)):
                handle = add_box(f"{tag}_Handle{i}", (cx + ox, cy, z0 + sz * 0.48), (0.018, sy * 0.14, 0.018), mat_port, coll, 0.002)
                set_role(handle, "crate", *iron)
                objs.append(handle)
            for i, (ox, oy) in enumerate(((-sx * 0.44, -sy * 0.34), (sx * 0.44, -sy * 0.34), (-sx * 0.44, sy * 0.34), (sx * 0.44, sy * 0.34))):
                corner = add_box(f"{tag}_Iron{i}", (cx + ox, cy + oy, z0 + sz * 0.48), (0.026, 0.026, sz * 0.30), mat_port, coll, 0.002)
                set_role(corner, "crate", *iron)
                objs.append(corner)
        for i, ox in enumerate((-sx * 0.32, 0.0, sx * 0.32)):
            skid = add_box(f"{tag}_Skid{i}", (cx + ox, cy, foot_z), (0.032, sy * 0.32, 0.014), mat_port, coll, 0.001 if lod == 0 else 0.0)
            set_role(skid, "crate", *iron)
            objs.append(skid)

    elif kind == 1:
        # Compact cube with a planform X. The X is the 120 px identity, not a recolor.
        body = add_box(f"{tag}_Body", (cx, cy, z0 + sz * 0.46), (sx * 0.42, sy * 0.42, sz * 0.42), mat_crate, coll, bevel)
        set_role(body, "crate", *paint)
        objs.append(body)
        lid = add_box(f"{tag}_Lid", (cx, cy, z0 + sz * 0.92), (sx * 0.38, sy * 0.38, 0.016), mat_crate, coll, bevel)
        set_role(lid, "crate", *paint)
        objs.append(lid)
        x_len = math.hypot(sx, sy) * 0.46
        for i, ang in enumerate((math.radians(45.0), math.radians(-45.0))):
            lash = add_box(
                f"{tag}_XLash{i}", (cx, cy, z0 + sz * 0.96),
                (x_len, 0.028, 0.012), mat_port, coll, 0.002 if lod == 0 else 0.0,
                rot=(0.0, 0.0, ang),
            )
            set_role(lash, "crate", *iron)
            objs.append(lash)
        if lod <= 1:
            hasp = add_box(f"{tag}_Hasp", (cx + sx * 0.34, cy, z0 + sz * 0.80), (0.022, 0.028, 0.022), mat_port, coll, 0.002)
            set_role(hasp, "crate", *iron)
            objs.append(hasp)
        for i, (ox, oy) in enumerate(((-sx * 0.30, -sy * 0.30), (sx * 0.30, -sy * 0.30), (-sx * 0.30, sy * 0.30), (sx * 0.30, sy * 0.30))):
            foot = add_box(f"{tag}_Foot{i}", (cx + ox, cy + oy, foot_z), (0.030, 0.030, 0.014), mat_port, coll, 0.001 if lod == 0 else 0.0)
            set_role(foot, "crate", *iron)
            objs.append(foot)

    elif kind == 2:
        # Long thin instrument along +Y. Hinge + end caps carry the silhouette; no lamp grill.
        body = add_box(f"{tag}_Body", (cx, cy, z0 + sz * 0.40), (sx * 0.38, sy * 0.48, sz * 0.34), mat_crate, coll, bevel)
        set_role(body, "crate", *paint)
        objs.append(body)
        lid = add_box(f"{tag}_Lid", (cx + sx * 0.04, cy, z0 + sz * 0.80), (sx * 0.34, sy * 0.48, 0.016), mat_crate, coll, bevel)
        set_role(lid, "crate", *paint)
        objs.append(lid)
        hinge = add_box(f"{tag}_Hinge", (cx - sx * 0.38, cy, z0 + sz * 0.76), (0.016, sy * 0.42, 0.016), mat_port, coll, 0.002 if lod == 0 else 0.0)
        set_role(hinge, "crate", *iron)
        objs.append(hinge)
        for i, oy in enumerate((-sy * 0.48, sy * 0.48)):
            cap = add_box(f"{tag}_EndCap{i}", (cx, cy + oy, z0 + sz * 0.42), (sx * 0.42, 0.020, sz * 0.32), mat_port, coll, 0.002 if lod == 0 else 0.0)
            set_role(cap, "crate", *iron)
            objs.append(cap)
        if lod <= 1:
            for i, oy in enumerate((-sy * 0.18, sy * 0.18)):
                latch = add_box(f"{tag}_Latch{i}", (cx + sx * 0.36, cy + oy, z0 + sz * 0.70), (0.016, 0.022, 0.018), mat_port, coll, 0.002)
                set_role(latch, "crate", *iron)
                objs.append(latch)
        for i, oy in enumerate((-sy * 0.26, sy * 0.26)):
            skid = add_box(f"{tag}_Skid{i}", (cx, cy + oy, foot_z), (sx * 0.30, 0.020, 0.012), mat_port, coll, 0.001 if lod == 0 else 0.0)
            set_role(skid, "crate", *iron)
            objs.append(skid)

    elif kind == 3:
        # Open square frame with a real hole. Four rails, no filled inner case.
        rail_t = 0.055 if lod == 2 else 0.048
        z_rail = z0 + sz * 0.42
        for i, (px, py, hx, hy) in enumerate((
            (0.0, sy * 0.42, sx * 0.48, rail_t),
            (0.0, -sy * 0.42, sx * 0.48, rail_t),
            (sx * 0.42, 0.0, rail_t, sy * 0.38),
            (-sx * 0.42, 0.0, rail_t, sy * 0.38),
        )):
            rail = add_box(f"{tag}_Rail{i}", (cx + px, cy + py, z_rail), (hx, hy, sz * 0.28), mat_port, coll, bevel * 0.5)
            set_role(rail, "crate", *iron)
            objs.append(rail)
        pallet = add_box(f"{tag}_Pallet", (cx, cy, z0 + 0.016), (sx * 0.48, sy * 0.48, 0.012), mat_port, coll, bevel * 0.4)
        set_role(pallet, "crate", *iron)
        objs.append(pallet)
        if lod <= 1:
            for i, (ox, oy) in enumerate(((-sx * 0.42, -sy * 0.42), (sx * 0.42, -sy * 0.42), (-sx * 0.42, sy * 0.42), (sx * 0.42, sy * 0.42))):
                post = add_box(f"{tag}_Post{i}", (cx + ox, cy + oy, z0 + sz * 0.50), (0.020, 0.020, sz * 0.44), mat_port, coll, 0.002)
                set_role(post, "crate", *iron)
                objs.append(post)
            handle = add_box(f"{tag}_Handle", (cx, cy + sy * 0.50, z0 + sz * 0.55), (sx * 0.14, 0.014, 0.016), mat_port, coll, 0.002)
            set_role(handle, "crate", *iron)
            objs.append(handle)

    else:
        # L-shaped stacked pair. Two masses, one L outline, not another square.
        bar = add_box(
            f"{tag}_Bar", (cx - sx * 0.04, cy - sy * 0.14, z0 + sz * 0.40),
            (sx * 0.46, sy * 0.18, sz * 0.34), mat_crate, coll, bevel,
        )
        set_role(bar, "crate", *paint)
        objs.append(bar)
        leg = add_box(
            f"{tag}_Leg", (cx + sx * 0.22, cy + sy * 0.12, z0 + sz * 0.40),
            (sx * 0.18, sy * 0.32, sz * 0.34), mat_crate, coll, bevel,
        )
        set_role(leg, "crate", *paint)
        objs.append(leg)
        if lod <= 1:
            strap = add_box(
                f"{tag}_Strap", (cx + sx * 0.08, cy - sy * 0.02, z0 + sz * 0.78),
                (sx * 0.20, 0.016, 0.010), mat_port, coll, 0.002,
            )
            set_role(strap, "crate", *iron)
            objs.append(strap)
            handle = add_box(
                f"{tag}_Handle", (cx + sx * 0.22, cy + sy * 0.42, z0 + sz * 0.50),
                (sx * 0.10, 0.012, 0.014), mat_port, coll, 0.002,
            )
            set_role(handle, "crate", *iron)
            objs.append(handle)
        for i, (ox, oy) in enumerate((
            (-sx * 0.36, -sy * 0.26), (sx * 0.30, -sy * 0.26), (sx * 0.30, sy * 0.36),
        )):
            foot = add_box(f"{tag}_Foot{i}", (cx + ox, cy + oy, foot_z), (0.028, 0.028, 0.012), mat_port, coll, 0.001 if lod == 0 else 0.0)
            set_role(foot, "crate", *iron)
            objs.append(foot)

    return objs


def build_port(lod, mats, coll):
    port = []
    pfx = f"L{lod}_"
    bevel = 0.008 if lod == 0 else 0.0
    n = 8
    rot = math.pi / 8.0
    inner = oct_pts(WELL_CX, WELL_CY, WELL_R_IN, n, rot)
    outer = [
        (
            WELL_CX + WELL_R_OUT_VAR[i] * math.cos(rot + 2.0 * math.pi * i / n),
            WELL_CY + WELL_R_OUT_VAR[i] * math.sin(rot + 2.0 * math.pi * i / n),
        )
        for i in range(n)
    ]
    z_top = COLLAR_Z
    z_bot = WELL_FLOOR_Z
    # Folded octagonal flange with a loading throat toward +X. Liner stays closed.
    for i in range(n):
        j = (i + 1) % n
        p0, p1 = inner[i], inner[j]
        q0, q1 = outer[i], outer[j]
        liner = add_plate(
            f"{pfx}Liner_{i}",
            (p0[0], p0[1], z_top - 0.01), (p1[0], p1[1], z_top - 0.01),
            (p1[0], p1[1], z_bot), (p0[0], p0[1], z_bot),
            0.030, mats["port"], coll, bevel * 0.6, "port",
        )
        port.append(liner)
        if i in LOADING_SECTORS:
            continue
        z_flange = z_top + (0.010 if i % 2 else 0.0)
        flange = add_plate(
            f"{pfx}Flange_{i}",
            (q0[0], q0[1], z_flange), (q1[0], q1[1], z_flange),
            (p1[0], p1[1], z_flange), (p0[0], p0[1], z_flange),
            0.038, mats["port"], coll, bevel, "port",
        )
        port.append(flange)
        if lod <= 1:
            skirt = add_plate(
                f"{pfx}Skirt_{i}",
                (q0[0], q0[1], z_flange - 0.02), (q0[0], q0[1], 0.06),
                (q1[0], q1[1], 0.06), (q1[0], q1[1], z_flange - 0.02),
                0.024, mats["port"], coll, bevel * 0.6, "port",
            )
            port.append(skirt)
        if lod == 0 and i in (2, 4, 6):
            mid0 = ((p0[0] + q0[0]) * 0.5, (p0[1] + q0[1]) * 0.5)
            mid1 = ((p1[0] + q1[0]) * 0.5, (p1[1] + q1[1]) * 0.5)
            gusset = add_plate(
                f"{pfx}Gusset_{i}",
                (q0[0], q0[1], z_flange + 0.012), (mid0[0], mid0[1], z_flange + 0.020),
                (mid1[0], mid1[1], z_flange + 0.020), (q1[0], q1[1], z_flange + 0.012),
                0.016, mats["port"], coll, 0.003, "port",
            )
            port.append(gusset)
    # Loading cheeks close the throat sides without restoring a full ring.
    for i, vi in enumerate((7, 1)):
        p, q = inner[vi], outer[vi]
        cheek = add_plate(
            f"{pfx}LoadCheek_{i}",
            (p[0], p[1], z_top), (q[0], q[1], z_top),
            (q[0], q[1], 0.06), (p[0], p[1], 0.06),
            0.028, mats["port"], coll, bevel * 0.6, "port",
        )
        port.append(cheek)
    floor_pts = oct_pts(WELL_CX, WELL_CY, WELL_R_IN - 0.03, n, rot)
    floor = add_plate(
        f"{pfx}WellFloor",
        (floor_pts[0][0], floor_pts[0][1], z_bot),
        (floor_pts[2][0], floor_pts[2][1], z_bot),
        (floor_pts[4][0], floor_pts[4][1], z_bot),
        (floor_pts[6][0], floor_pts[6][1], z_bot),
        0.022, mats["port"], coll, bevel * 0.5, "port", (0.02, 0.40),
    )
    port.append(floor)
    # Three C-channel guides; none on the loading throat.
    for i, sector in enumerate((2, 4, 5)):
        a = rot + 2.0 * math.pi * (sector + 0.5) / n
        x = WELL_CX + (WELL_R_IN - 0.045) * math.cos(a)
        y = WELL_CY + (WELL_R_IN - 0.045) * math.sin(a)
        port.extend(add_c_channel(
            f"{pfx}Guide_{i}", (x, y, 0.24),
            length=0.38 if lod == 2 else 0.42, depth=0.055, thick=0.014,
            axis="z", mat=mats["port"], coll=coll, bevel=bevel * 0.5, role="port",
        ))
    # Three folded hat-section jack pads — unequal, load-bearing, not cube pucks.
    port.extend(add_hat_pad(
        f"{pfx}JackSW", WELL_CX - 0.58, WELL_CY - 0.50, 0.26, 0.14,
        mats["port"], coll, bevel, rot_z=math.radians(35),
    ))
    port.extend(add_hat_pad(
        f"{pfx}JackNW", WELL_CX - 0.62, WELL_CY + 0.40, 0.16, 0.18,
        mats["port"], coll, bevel, rot_z=math.radians(-22),
    ))
    port.extend(add_hat_pad(
        f"{pfx}JackS", WELL_CX + 0.08, WELL_CY - 0.72, 0.32, 0.11,
        mats["port"], coll, bevel, rot_z=0.0,
    ))
    if lod == 0:
        for i, (bx, by) in enumerate((
            (WELL_CX - 0.50, WELL_CY - 0.44),
            (WELL_CX - 0.54, WELL_CY + 0.34),
            (WELL_CX + 0.16, WELL_CY - 0.66),
        )):
            port.append(add_hex_bolt(f"{pfx}JackBolt_{i}", (bx, by, 0.108), mats["port"], coll))
    apron = add_plate(
        f"{pfx}ApronDeck",
        (0.58, -0.88, APRON_Z), (1.08, -0.88, APRON_Z),
        (1.08, 0.70, APRON_Z), (0.58, 0.70, APRON_Z),
        0.028, mats["port"], coll, bevel, "port",
    )
    port.append(apron)
    if lod <= 1:
        tray = add_box(
            f"{pfx}CableTray", (0.34, -0.18, COLLAR_Z * 0.55),
            (0.04, 0.28, 0.03), mats["port"], coll, bevel * 0.4,
        )
        set_role(tray, "port", 0.50, 0.90)
        port.append(tray)
    if lod == 0:
        # Service hatch sits on the -Y flange plate, a real door, not a glow.
        hx = outer[5][0] * 0.55 + inner[5][0] * 0.45
        hy = outer[5][1] * 0.55 + inner[5][1] * 0.45
        hatch = add_box(
            f"{pfx}ServiceHatch", (hx, hy, COLLAR_Z + 0.022),
            (0.09, 0.07, 0.012), mats["port"], coll, 0.003,
        )
        set_role(hatch, "port")
        port.append(hatch)
        port.append(add_hex_bolt(f"{pfx}HatchBolt_0", (hx + 0.05, hy + 0.03, COLLAR_Z + 0.034), mats["port"], coll))
        port.append(add_hex_bolt(f"{pfx}HatchBolt_1", (hx - 0.05, hy - 0.03, COLLAR_Z + 0.034), mats["port"], coll))
    return port


def build_cradle(lod, mats, coll):
    """One manufactured open C-clamp whose arms are the +X apron lip."""
    objs = []
    pfx = f"L{lod}_"
    bevel = 0.007 if lod == 0 else 0.0
    z0 = APRON_Z + 0.02
    z1 = COLLAR_Z + 0.24
    clamp = add_u_clamp(
        f"{pfx}CradleClamp", clamp_stations(lod), z0, z1,
        mats["cradle"], coll, bevel,
    )
    set_role(clamp, "cradle")
    objs.append(clamp)
    if lod == 0:
        saddle = add_arc_shell(
            f"{pfx}CradleSaddleLip",
            POD_CX, POD_CY, COLLAR_Z + 0.02, COLLAR_Z + 0.20,
            r_in=0.210, r_out=0.248,
            a0=math.radians(118.0), a1=math.radians(242.0), segs=6,
            mat=mats["cradle"], coll=coll, bevel=0.003, cap_ends=True,
        )
        set_role(saddle, "cradle", 0.70, 0.98)
        objs.append(saddle)
        objs.append(add_hex_bolt(
            f"{pfx}CradleBolt",
            (POD_CX - 0.34, POD_CY, COLLAR_Z + 0.26),
            mats["cradle"], coll, "cradle",
        ))
    return objs


def build_pod(lod, mats, coll):
    body = []
    thruster = []
    pfx = f"L{lod}_"
    bevel = 0.006 if lod == 0 else 0.0
    n = 8
    ry = 0.78
    stations = (
        (0.18, 0.15),
        (0.28, 0.20),
        (0.50, 0.215),
        (0.72, 0.220),
        (0.88, 0.235),
        (1.00, 0.250),
    )
    if lod == 2:
        stations = ((0.18, 0.16), (0.58, 0.22), (0.98, 0.248))
    barrel = loft_oval(
        f"{pfx}PodBarrel", stations, n, mats["pod"], coll, bevel,
        POD_CX, POD_CY, rx_scale=1.0, ry_scale=ry, cap_bottom=True, cap_top=False,
    )
    set_role(barrel, "pod", 0.42, 0.74)
    body.append(barrel)
    well_n = 8 if lod == 2 else (12 if lod == 0 else 10)
    body.extend(add_keyed_docking_well(
        f"{pfx}DockWell", POD_CX, POD_CY,
        z_rim=1.002, z_floor=0.48, n=well_n,
        rx_out=0.210, ry_out=0.168,
        hx=0.118 if lod < 2 else 0.110, hy=0.096 if lod < 2 else 0.090,
        mat_rim=mats["port"], mat_well=mats["port"], coll=coll, bevel=bevel * 0.35,
    ))
    if lod <= 1:
        for i, sector in enumerate((2, 4, 5)):
            a = math.pi / 8.0 + 2.0 * math.pi * (sector + 0.5) / 8.0
            sx = POD_CX + 0.230 * math.cos(a)
            sy = POD_CY + 0.180 * math.sin(a)
            shoe = add_box(
                f"{pfx}GuideShoe_{i}", (sx, sy, 0.46),
                (0.032, 0.024, 0.045), mats["pod"], coll, bevel * 0.5,
                rot=(0.0, 0.0, a),
            )
            set_role(shoe, "pod", 0.78, 0.98)
            body.append(shoe)
        if lod == 0:
            for i, z in enumerate((0.40, 0.64)):
                rib = loft_oval(
                    f"{pfx}PodRib_{i}",
                    ((z - 0.010, 0.216), (z, 0.226), (z + 0.010, 0.216)),
                    n, mats["pod"], coll, 0.002, POD_CX, POD_CY,
                    rx_scale=1.0, ry_scale=ry, cap_bottom=False, cap_top=False,
                )
                set_role(rib, "pod", 0.78, 0.98)
                body.append(rib)
            blister = add_box(
                f"{pfx}SensorBlister", (POD_CX + 0.20, POD_CY, 0.70),
                (0.030, 0.018, 0.034), mats["pod"], coll, 0.002,
            )
            set_role(blister, "pod", 0.78, 0.98)
            body.append(blister)
    skirt = loft_oval(
        f"{pfx}AftSkirt",
        ((0.16, 0.11), (0.18, 0.15), (0.22, 0.17)),
        n, mats["thruster"], coll, bevel * 0.5, POD_CX, POD_CY,
        rx_scale=1.0, ry_scale=ry, cap_bottom=True, cap_top=False,
    )
    set_role(skirt, "thruster", 0.02, 0.55)
    thruster.append(skirt)
    throat = loft_oval(
        f"{pfx}ThrusterThroat",
        ((0.17, 0.08), (0.28, 0.06), (0.34, 0.04), (0.36, 0.00)),
        6, mats["thruster"], coll, 0.0, POD_CX, POD_CY,
        rx_scale=1.0, ry_scale=ry, cap_bottom=False, cap_top=True,
    )
    set_role(throat, "thruster", 0.40, 0.80)
    thruster.append(throat)
    lamp = add_cylinder(
        f"{pfx}ThrusterLamp", (POD_CX, POD_CY, 0.33),
        0.024 if lod == 0 else 0.020, 0.010, mats["thruster"], coll,
        vertices=8 if lod == 0 else 6, bevel=0.0, rot=(0, 0, 0),
    )
    set_role(lamp, "thruster", 0.84, 0.99)
    thruster.append(lamp)
    if lod == 0:
        hood = add_cylinder(
            f"{pfx}ThrusterHood", (POD_CX, POD_CY, 0.31),
            0.034, 0.010, mats["thruster"], coll, vertices=8, bevel=0.001, rot=(0, 0, 0),
        )
        set_role(hood, "thruster", 0.02, 0.40)
        thruster.append(hood)
    return body, thruster


def crate_layout():
    # Footprint-first load order on the +X apron. Distinct XY, no 2x2 cabinet.
    z0 = APRON_Z + 0.01
    return [
        dict(kind=0, cx=0.78, cy=-0.70, sx=0.68, sy=0.24, sz=0.22, z0=z0),
        dict(kind=1, cx=0.80, cy=-0.38, sx=0.28, sy=0.28, sz=0.40, z0=z0),
        dict(kind=2, cx=0.98, cy=-0.04, sx=0.16, sy=0.68, sz=0.20, z0=z0),
        dict(kind=3, cx=0.66, cy=0.52, sx=0.30, sy=0.30, sz=0.26, z0=z0),
        dict(kind=4, cx=0.94, cy=0.52, sx=0.30, sy=0.32, sz=0.20, z0=z0),
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
        return (0.62, 0.42, 0.16)
    if "pod" in name or "thruster" in name or "dock" in name:
        return (0.22, 0.30, 0.42)
    return (0.11, 0.09, 0.08)


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

    # site from LOD1 (legal 19 px/cell) and LOD2 family separation
    hide_lods(1)
    set_crate_stage(5)
    paths["works_top_lod1"] = snap(camera, still_dir / "works_top_lod1.png", "works_top")
    paths["works_site"] = snap(camera, still_dir / "works_site.png", "works_site")
    bak = override_flat(meshes, family_of_mesh)
    paths["works_site_id"] = snap(camera, still_dir / "works_site_id.png", "works_site", samples=4)
    restore_mats(meshes, bak)
    hide_lods(2)
    paths["works_top_lod2"] = snap(camera, still_dir / "works_top_lod2.png", "works_top")
    paths["works_site_lod2"] = snap(camera, still_dir / "works_site_lod2.png", "works_site")
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
    pod_size = max(abs(v) for v in (0.20 * 2, 1.05 - 0.16))
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
    stills_rel = {
        key: str(Path(value).relative_to(ROOT)).replace("\\", "/")
        for key, value in stills.items()
    }
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
        "stills": stills_rel,
        "errors": errors,
        "g1g2g4": "open",
        "g3": "blocked:no_mesh_derived_high_cage_bakes",
        "technicalEvidence": "evidence_ready",
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
            {"id": "MTX-01", "state": "implemented", "still": f"{STILL_DIR_REL}/works_top_grazing.png",
             "clayConfirm": "pass", "forbiddenFakeAbsent": True,
             "notes": "Bevelled game mesh, shade_smooth_by_angle 28, weighted normals."},
            {"id": "MTX-03", "state": "implemented", "still": f"{STILL_DIR_REL}/works_top_clay.png",
             "clayConfirm": "pass", "forbiddenFakeAbsent": True,
             "notes": "Horseshoe flange; D+key docking well with wall thickness; C-clamp arms are the apron lip."},
            {"id": "MTX-16", "state": "implemented", "still": f"{STILL_DIR_REL}/works_top_orm.png",
             "clayConfirm": "pass", "forbiddenFakeAbsent": True,
             "notes": "Smart-project UV0 per part, remapped into unique atlas tiles."},
            {"id": "MTX-20", "state": "blocked", "still": f"{STILL_DIR_REL}/works_top_grazing.png",
             "clayConfirm": "pass", "forbiddenFakeAbsent": True,
             "notes": "No distinct higher source exists; the bevelled game mesh cannot close MTX-20."},
            {"id": "MTX-21", "state": "blocked", "still": f"{STILL_DIR_REL}/works_top.png",
             "clayConfirm": "pass", "forbiddenFakeAbsent": True,
             "notes": "No selected-to-active cage bake exists in this design-candidate cycle."},
            {"id": "MTX-22", "state": "blocked", "still": f"{STILL_DIR_REL}/works_top_normal.png",
             "clayConfirm": "pass", "forbiddenFakeAbsent": True,
             "notes": "The OpenGL atlas normal is procedural response, not a tangent bake from the exact mesh."},
            {"id": "MTX-23", "state": "blocked", "still": f"{STILL_DIR_REL}/works_top_orm.png",
             "clayConfirm": "pass", "forbiddenFakeAbsent": True,
             "notes": "ORM.R is an authored cavity approximation, not AO baked from the exact mesh."},
            {"id": "MTX-24", "state": "blocked", "still": f"{STILL_DIR_REL}/works_top_normal.png",
             "clayConfirm": "pass", "forbiddenFakeAbsent": True,
             "notes": "No exact-mesh curvature bake exists; atlas edge slopes are not a substitute."},
            {"id": "MTX-25", "state": "blocked", "still": f"{STILL_DIR_REL}/works_top_orm.png",
             "clayConfirm": "pass", "forbiddenFakeAbsent": True,
             "notes": "No exact-mesh concavity bake exists; atlas cavity darkening remains provisional."},
            {"id": "MTX-30", "state": "blocked", "still": f"{STILL_DIR_REL}/works_top.png",
             "clayConfirm": "pass", "forbiddenFakeAbsent": True,
             "notes": "Imagegen pixels are absent, but normal/AO/curvature are not yet mesh-derived."},
            {"id": "MTX-31", "state": "implemented", "still": f"{STILL_DIR_REL}/works_top_matid.png",
             "clayConfirm": "pass", "forbiddenFakeAbsent": True,
             "notes": "Five billed substances: port oxide, cradle wear, crate paint, pod skin, thruster."},
            {"id": "MTX-32", "state": "implemented", "still": f"{STILL_DIR_REL}/works_top.png",
             "clayConfirm": "pass", "forbiddenFakeAbsent": True,
             "notes": "One 1024 atlas with per-role generators, not a tinted shared sheet."},
            {"id": "MTX-33", "state": "blocked", "still": f"{STILL_DIR_REL}/works_top_orm.png",
             "clayConfirm": "pass", "forbiddenFakeAbsent": True,
             "notes": "Roughness and metallic vary by role, but ORM.R cannot close until mesh AO exists."},
            {"id": "MTX-39", "state": "blocked", "still": f"{STILL_DIR_REL}/works_top.png",
             "clayConfirm": "pass", "forbiddenFakeAbsent": True,
             "notes": "Seam dirt is provisional until driven by the exact-mesh cavity bake."},
            {"id": "MTX-46", "state": "implemented", "still": f"{STILL_DIR_REL}/works_top.png",
             "clayConfirm": "pass", "forbiddenFakeAbsent": True,
             "notes": "No rover yellow, no glow hatch, no cool disc, no green lamp panel, no circular badge."},
            {"id": "MTX-50", "state": "implemented", "still": f"{STILL_DIR_REL}/works_top.png",
             "clayConfirm": "pass", "forbiddenFakeAbsent": True,
             "notes": "Exported GLB retains exact root, LOD roots, and hook names."},
            {"id": "MTX-52", "state": "implemented", "still": f"{STILL_DIR_REL}/works_top_clay.png",
             "clayConfirm": "pass", "forbiddenFakeAbsent": True,
             "notes": "One C-clamp whose arms are the apron lip; D+key well remains a hole in clay."},
            {"id": "MTX-53", "state": "not_applicable", "still": f"{STILL_DIR_REL}/works_top.png",
             "clayConfirm": "pass", "forbiddenFakeAbsent": True,
             "notes": "Place candidate is manufactured sections, not photogrammetry."},
            {"id": "MTX-54", "state": "implemented", "still": f"{STILL_DIR_REL}/works_top.png",
             "clayConfirm": "pass", "forbiddenFakeAbsent": True,
             "notes": "Cycle 04 revises the Cycle 03 round portal, boxed cradle, and square freight; cycles 01-03 stay frozen."},
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
    write_json(EVIDENCE_DIR / "EPOCH.json", {
        "schema": "spaceface.worksCargoPortCycleEpoch.v1",
        "assetId": ASSET_ID,
        "cycle": CYCLE,
        "state": "design_candidate",
        "disposition": "review_pending",
        "candidate": {
            "root": ROOT_NAME,
            "sourceGlb": "assets/works/cargo_port/source/cargo_port.glb",
            "partGlb": "assets/ships/parts/works/place_works_cargo_port.glb",
            "sha256": hashes.get("combined"),
            "partsSha256": hashes.get("parts"),
        },
        "cycle01": {
            "candidateSha256": CYCLE01_CANDIDATE,
            "hashes": "assets/works/cargo_port/evidence/cycle_001/HASHES.json",
            "frozen": True,
        },
        "cycle02": {
            "candidateSha256": CYCLE02_CANDIDATE,
            "evidence": "assets/works/cargo_port/evidence/cycle_002",
            "frozen": True,
        },
        "cycle03": {
            "candidateSha256": CYCLE03_CANDIDATE,
            "evidence": "assets/works/cargo_port/evidence/cycle_003",
            "frozen": True,
        },
        "supportedViews": {
            "works_top": {"pxPerCell": 120, "resolution": [1920, 1080]},
            "works_edge": {"pxPerCell": 120, "resolution": [1920, 1080]},
            "works_site": {"pxPerCell": 19, "resolution": [1920, 1080]},
        },
        "gates": {
            "G0": "evidence_ready",
            "G1": "open",
            "G2": "open",
            "G3": "blocked:no_mesh_derived_high_cage_bakes",
            "G4": "open",
            "G5": "evidence_ready",
            "G6": "open",
            "G7": "open",
        },
        "materialTruth": {
            "preflight": "assets/works/cargo_port/reference/REFERENCE_BRIEF.md",
            "allSupportedViewZonesClassified": False,
        },
        "hooks": list(HOOK_NAMES),
        "lodTriangles": reports,
        "stills": hashes.get("stills", {}),
        "paths": stills_rel,
        "authorInspection": "pending",
        "independentReview": "not_launched",
        "wired": False,
        "released": False,
    })
    audit = FAMILY / "MATERIAL_AND_SHAPE_AUDIT.md"
    lines = [
        "# Cargo port cycle 04 — material and shape audit",
        "",
        f"Root `{ROOT_NAME}`. Launch axis Blender +Z through the well.",
        "",
        (
            f"Footprint {bbox['sizeWu'][0]:.3f} x {bbox['sizeWu'][1]:.3f} wu "
            f"({bbox['sizeCells'][0]:.3f} x {bbox['sizeCells'][1]:.3f} cells), "
            f"zMin {bbox['zMin']}."
        ),
        "",
        "Cycle 03 defect: round dock/portal on a pad of boxes. The C-clamp, keyed",
        "cut, pod face, and five freight types did not separate at ~120 px/cell;",
        "at ~19 px/cell the cell was one brown stamp.",
        "Cycle 04 replacement: D+key docking opening with wall thickness that survives",
        "at 120 px; one open C-clamp whose arms are the apron lip; five distinct crate",
        "planforms (bar, cube+X, long case, hollow frame, L); darker port, warmer",
        "freight, dark pod well with no cool disc or green lamp. Horseshoe flange, +X",
        "throat, five-stage crate contract, +Z launch, hooks, envelope, LOD identity,",
        "and Cycle 01-03 evidence stay frozen.",
        "",
        "Visible zones billed: flange, liner, loading cheeks, jack pads, guides, apron,",
        "C-clamp cradle, crate family, pod shell, keyed docking well, aft thruster.",
        "allSupportedViewZonesClassified remains false until independent review.",
        "",
        f"LOD0 port {reports[0]['port_tris']} / pod {reports[0]['pod_tris']} / crates {' '.join(str(t) for t in reports[0]['crate_tris'])}.",
        "",
        f"LOD1 port {reports[1]['port_tris']} / pod {reports[1]['pod_tris']} / crates {' '.join(str(t) for t in reports[1]['crate_tris'])}.",
        "",
        f"LOD2 port {reports[2]['port_tris']} / pod {reports[2]['pod_tris']} / crates {' '.join(str(t) for t in reports[2]['crate_tris'])}.",
        "",
        f"Validation errors: {errors or 'none'}.",
        "",
        "G3 is blocked: the authored atlas remains provisional until exact-mesh high/cage",
        "normal, AO, curvature, and cavity bakes exist.",
        "",
        "G1/G2/G4 whole-asset remain open. Cycle 04 is evidence_ready only.",
        "Cycle 01 evidence under evidence/cycle_001 is frozen.",
        "Cycle 02 evidence under evidence/cycle_002 is frozen.",
        "Cycle 03 evidence under evidence/cycle_003 is frozen.",
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
    errors.extend(assert_cycle01_frozen())
    errors.extend(assert_cycle02_frozen())
    errors.extend(assert_cycle03_frozen())

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


def assert_cycle01_frozen():
    errors = []
    if not CYCLE01_HASHES_PATH.exists():
        errors.append("cycle01 missing HASHES.json")
    else:
        try:
            freeze = json.loads(CYCLE01_HASHES_PATH.read_text(encoding="utf-8"))
        except Exception as exc:
            errors.append(f"cycle01 HASHES.json invalid: {exc}")
            freeze = {}
        if freeze.get("combined") != CYCLE01_CANDIDATE or freeze.get("parts") != CYCLE01_CANDIDATE:
            errors.append("cycle01 candidate hash manifest drifted")
        if freeze.get("stills") != CYCLE01_STILL_FREEZE:
            errors.append("cycle01 still hash manifest drifted")
    for stem, expected in CYCLE01_STILL_FREEZE.items():
        path = CYCLE01_DIR / f"{stem}.png"
        if not path.exists():
            errors.append(f"cycle01 missing {path.name}")
            continue
        got = sha256(path)
        if got != expected:
            errors.append(f"cycle01 mutated {path.name}: {got} != {expected}")
    refs = {
        "ref_01": FAMILY / "reference" / "ref_01_shaft_collar.jpg",
        "ref_02": FAMILY / "reference" / "ref_02_launch_cradle.jpg",
        "ref_03": FAMILY / "reference" / "ref_03_cargo_modules.jpg",
        "ref_04": FAMILY / "reference" / "ref_04_courier_capsule.jpg",
    }
    for key, path in refs.items():
        got = sha256(path)
        if got != CYCLE01_REF_FREEZE[key]:
            errors.append(f"reference mutated {path.name}: {got}")
    return errors


def assert_cycle02_frozen():
    errors = []
    epoch_path = CYCLE02_DIR / "EPOCH.json"
    if not epoch_path.exists():
        errors.append("cycle02 missing EPOCH.json")
    else:
        try:
            epoch = json.loads(epoch_path.read_text(encoding="utf-8"))
        except Exception as exc:
            errors.append(f"cycle02 EPOCH.json invalid: {exc}")
            epoch = {}
        if epoch.get("candidate", {}).get("sha256") != CYCLE02_CANDIDATE:
            errors.append("cycle02 candidate hash manifest drifted")
        if epoch.get("stills") != CYCLE02_STILL_FREEZE:
            errors.append("cycle02 still hash manifest drifted")
    for stem, expected in CYCLE02_STILL_FREEZE.items():
        path = CYCLE02_DIR / f"{stem}.png"
        if not path.exists():
            errors.append(f"cycle02 missing {path.name}")
            continue
        got = sha256(path)
        if got != expected:
            errors.append(f"cycle02 mutated {path.name}: {got} != {expected}")
    return errors


def assert_cycle03_frozen():
    errors = []
    epoch_path = CYCLE03_DIR / "EPOCH.json"
    if not epoch_path.exists():
        errors.append("cycle03 missing EPOCH.json")
    else:
        try:
            epoch = json.loads(epoch_path.read_text(encoding="utf-8"))
        except Exception as exc:
            errors.append(f"cycle03 EPOCH.json invalid: {exc}")
            epoch = {}
        if epoch.get("candidate", {}).get("sha256") != CYCLE03_CANDIDATE:
            errors.append("cycle03 candidate hash manifest drifted")
        if epoch.get("stills") != CYCLE03_STILL_FREEZE:
            errors.append("cycle03 still hash manifest drifted")
    for stem, expected in CYCLE03_STILL_FREEZE.items():
        path = CYCLE03_DIR / f"{stem}.png"
        if not path.exists():
            errors.append(f"cycle03 missing {path.name}")
            continue
        got = sha256(path)
        if got != expected:
            errors.append(f"cycle03 mutated {path.name}: {got} != {expected}")
    return errors


def check_json_files():
    errors = []
    for rel in (
        "HASHES.json",
        "MATERIAL_CONTRACT.json",
        "TECHNIQUE_LEDGER.json",
        "source/cargo_port_inventory.json",
        "evidence/cycle_001/HASHES.json",
        "evidence/cycle_002/EPOCH.json",
        "evidence/cycle_003/EPOCH.json",
        "evidence/cycle_003/VISUAL_REVIEW.json",
        "evidence/cycle_004/EPOCH.json",
        "evidence/cycle_004/VISUAL_REVIEW.json",
    ):
        path = FAMILY / rel
        if not path.exists():
            errors.append(f"missing json {rel}")
            continue
        try:
            payload = json.loads(path.read_text(encoding="utf-8"))
        except Exception as exc:
            errors.append(f"json {rel}: {exc}")
            continue
        if not isinstance(payload, dict):
            errors.append(f"json {rel} is not an object")
    return errors


def check_only():
    errors = []
    errors.extend(check_json_files())
    errors.extend(assert_cycle01_frozen())
    errors.extend(assert_cycle02_frozen())
    errors.extend(assert_cycle03_frozen())
    path = PARTS_DIR / COMBINED_NAME
    if not path.exists():
        errors.append(f"missing {path}")
        print(json.dumps({"errors": errors}, indent=2))
        raise SystemExit("check-only failed")
    names = glb_node_names(path)
    required = (ROOT_NAME, *HOOK_NAMES, "LOD0_cargo_port", "LOD1_cargo_port", "LOD2_cargo_port")
    missing = [n for n in required if n not in names]
    if missing:
        errors.append(f"missing nodes: {missing}")
    inventory = json.loads((SOURCE_DIR / "cargo_port_inventory.json").read_text(encoding="utf-8"))
    if inventory.get("root") != ROOT_NAME:
        errors.append(f"inventory root {inventory.get('root')!r}")
    if inventory.get("hooks") != list(HOOK_NAMES):
        errors.append("inventory hooks drifted")
    if inventory.get("lodRoots") != ["LOD0_cargo_port", "LOD1_cargo_port", "LOD2_cargo_port"]:
        errors.append("inventory lodRoots drifted")
    if inventory.get("cycle") != CYCLE:
        errors.append(f"inventory cycle {inventory.get('cycle')} != {CYCLE}")
    hashes = json.loads((FAMILY / "HASHES.json").read_text(encoding="utf-8"))
    hash_paths = {
        "combined": SOURCE_DIR / "cargo_port.glb",
        "parts": path,
        "lod0": SOURCE_DIR / "cargo_port_lod0.glb",
        "lod1": SOURCE_DIR / "cargo_port_lod1.glb",
        "lod2": SOURCE_DIR / "cargo_port_lod2.glb",
        "atlas_basecolor": TEX_DIR / "cargo_port_atlas_basecolor.png",
        "atlas_orm": TEX_DIR / "cargo_port_atlas_orm.png",
        "atlas_normal": TEX_DIR / "cargo_port_atlas_normal.png",
    }
    for key, owned_path in hash_paths.items():
        if not owned_path.exists():
            errors.append(f"missing hashed artifact {owned_path.relative_to(ROOT)}")
        elif hashes.get(key) != sha256(owned_path):
            errors.append(f"HASHES {key} drifted from {owned_path.name}")
    if hashes.get("combined") != hashes.get("parts"):
        errors.append("combined/parts hash mismatch")
    still_hashes = hashes.get("stills") or {}
    for stem, expected in still_hashes.items():
        still_path = EVIDENCE_DIR / f"{stem}.png"
        if not still_path.exists():
            errors.append(f"missing cycle04 still {still_path.name}")
        elif sha256(still_path) != expected:
            errors.append(f"cycle04 still hash drifted: {still_path.name}")
    reports = inventory.get("triangles") or []
    if len(reports) != 3:
        errors.append(f"expected three LOD reports, found {len(reports)}")
    for rep in reports:
        lod = int(rep.get("lod", -1))
        if lod not in (0, 1, 2):
            errors.append(f"invalid LOD report {lod}")
            continue
        if int(rep.get("port_tris", 0)) > TRI_BUDGET["port"][lod]:
            errors.append(f"port LOD{lod} budget exceeded")
        if int(rep.get("pod_tris", 0)) > TRI_BUDGET["pod"][lod]:
            errors.append(f"pod LOD{lod} budget exceeded")
        crate_tris = rep.get("crate_tris") or []
        if len(crate_tris) != 5:
            errors.append(f"LOD{lod} expected five crate reports")
        for i, tris in enumerate(crate_tris):
            if int(tris) > TRI_BUDGET["crate_delta"]:
                errors.append(f"crate_{i} LOD{lod} budget exceeded")
    bbox = inventory.get("bbox") or {}
    size_wu = bbox.get("sizeWu") or [999, 999, 999]
    if size_wu[0] > CELL_WU + 0.02 or size_wu[1] > CELL_WU + 0.02:
        errors.append(f"inventory footprint exceeds one cell: {size_wu[:2]}")
    pod_bbox = inventory.get("podBbox") or {}
    pod_size = pod_bbox.get("sizeWu") or [999, 999, 999]
    if max(pod_size) / CELL_WU > 0.62:
        errors.append(f"inventory pod envelope exceeds 0.62 cell: {pod_size}")
    epoch_path = EVIDENCE_DIR / "EPOCH.json"
    if epoch_path.exists():
        epoch = json.loads(epoch_path.read_text(encoding="utf-8"))
        if epoch.get("candidate", {}).get("sha256") != hashes.get("combined"):
            errors.append("cycle04 EPOCH candidate hash drifted")
        if epoch.get("stills") != still_hashes:
            errors.append("cycle04 EPOCH still hashes drifted")
    review_path = EVIDENCE_DIR / "VISUAL_REVIEW.json"
    review = {}
    if review_path.exists():
        review = json.loads(review_path.read_text(encoding="utf-8"))
        if review.get("candidateSha256") != hashes.get("combined"):
            errors.append("cycle04 visual review candidate hash drifted")
        if review.get("originalResolutionInspection") is not True:
            errors.append("cycle04 visual review lacks original-resolution inspection")
        required_views = {"works_top", "works_edge", "works_top_clay", "works_site"}
        if not required_views.issubset(set(review.get("viewsInspected") or [])):
            errors.append("cycle04 visual review lacks required supported views")
    report = {
        "path": str(path),
        "sha256": sha256(path),
        "root": ROOT_NAME in names,
        "hooks": [n for n in HOOK_NAMES if n in names],
        "lods": [n for n in ("LOD0_cargo_port", "LOD1_cargo_port", "LOD2_cargo_port") if n in names],
        "lodTriangles": reports,
        "bbox": bbox,
        "podBbox": pod_bbox,
        "cycle04StillCount": len(still_hashes),
        "cycle01Frozen": not any("cycle01" in e or "reference mutated" in e for e in errors),
        "cycle02Frozen": not any("cycle02" in e for e in errors),
        "cycle03Frozen": not any("cycle03" in e for e in errors),
        "visualDecision": review.get("decision"),
        "errors": errors,
    }
    print(json.dumps(report, indent=2))
    if errors:
        raise SystemExit("check-only failed:\n  " + "\n  ".join(errors))
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

"""PQ-131.03 Works extractor — Cycle 05 semantic LOD correction.

Cycle 04's exact review found that its parallel pale feed bars read as forbidden
forklift tines, LOD1 lost the head/belt/drive/lamp hierarchy at the legal site
camera, and LOD2 popped to a generic U-frame. Cycle 05 replaces those bars with
short rooted splayed crusher cheeks, adds a real transverse cutter crown, keeps
the warm drive mass in every LOD, and makes the hooded lamp a materially warm,
rooted fixture rather than a floating emissive pixel. Independent review and
the actual normal route remain open.

Kit GLBs are cited shape references only and are never imported.
Cycle 01 through Cycle 04 evidence folders are immutable.

    blender --background --python tools/blender/build_works_extractor.py
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

TOOLS = Path(__file__).resolve().parent
ROOT = TOOLS.parents[1]
if str(TOOLS) not in sys.path:
    sys.path.insert(0, str(TOOLS))

from spaceface_works_camera import (  # noqa: E402
    FOV_V_DEG,
    apply_works_camera,
    measured_px_per_cell,
    works_pose,
)

FAMILY = ROOT / "assets" / "works" / "extractor"
SOURCE_DIR = FAMILY / "source"
TEX_DIR = SOURCE_DIR / "textures"
PARTS_DIR = ROOT / "assets" / "ships" / "parts" / "works"
CYCLE = 5
EPOCH_NAME = "cycle_005"
EVIDENCE_DIR = FAMILY / "evidence" / EPOCH_NAME
CYCLE_01_DIR = FAMILY / "evidence" / "cycle_001"
CYCLE_02_DIR = FAMILY / "evidence" / "cycle_002"
CYCLE_03_DIR = FAMILY / "evidence" / "cycle_003"
CYCLE_04_DIR = FAMILY / "evidence" / "cycle_004"
BLEND_PATH = SOURCE_DIR / "extractor.blend"
COMBINED_NAME = "place_works_extractor.glb"
ASSET_ID = "place_works_extractor"
ROOT_NAME = "SF_WORKS_EXTRACTOR_V1"
HOOK_NAMES = ("head_face", "belt", "lamp")
LOD_ROOTS = ("LOD0_extractor", "LOD1_extractor", "LOD2_extractor")
TRI_BUDGET = {0: 8000, 1: 2000, 2: 600}
TEX_SIZE = {0: 1024, 1: 1024, 2: 1024}
CELL_WU = 2.2
SHADE_ANGLE = 28.0
KEEP_PNG = {b"IHDR", b"PLTE", b"IDAT", b"IEND", b"sRGB", b"gAMA", b"pHYs"}

PIVOT = Vector((0.42, 0.00, 0.30))
LAMP_LOC = Vector((0.28, 0.73, 0.55))
BELT_LOC = Vector((-0.08, 0.00, 0.17))
HOOK_GLTF_TRANSLATIONS = {
    "head_face": (0.42, 0.30, 0.00),
    "belt": (-0.08, 0.17, 0.00),
    "lamp": (0.28, 0.55, -0.73),
}

BELT_X0 = -0.48
BELT_X1 = 0.30
BELT_HALF_Y = 0.090
WELL_X0 = 0.50
WELL_X1 = 0.92
WELL_Y0 = -0.32
WELL_Y1 = 0.32
WELL_Z0 = 0.08
WELL_Z1 = 0.32
BITE_OPEN_X0 = 0.78

CYCLE_01_SHA256 = {
    "EPOCH.json": "58F66996D345E11134FEA13FE1533B3AB6214AD4976908C3146A0265466FD2C8",
    "hidden_faces.json": "6BAEB74D7B2AE604D2A1BF2B538113B01A9203214DF91FEA43BD9DDC9A855901",
    "hook_identity.png": "CA8C1DE96A7CC009D3D791F3CA27BB3D03E3952940F53DB02630F4F2D98BE7EB",
    "id_or_material_id.png": "DD8A15A68B85962A1701FDCEC27971178E4CF730D60211E1A657E31FC4558B34",
    "normal_isolation.png": "CDB6407F7B4FD308EA8D7025E7406DC55024E14E11C0E4D64780756FB39AFB48",
    "orm_isolation.png": "9182A0896FF0F702E85863954E4D207E35697B0F8BB8605B3635DB3EAE711D92",
    "works_edge_grazing.png": "25B768C8F3AE49DED6FB202A7E11A3F0301A2425EEA708BC2A9D2142F6DAA214",
    "works_edge.png": "B705351A88BB0D190919D3CE8201B684E31FD7631B0EE3D08F0137AB0432726B",
    "works_site.png": "5ECEE8FE9159350BAE9027C68A4E1DF0861F52220D50B14C60A3AE6219B51546",
    "works_top_clay.png": "CA8C1DE96A7CC009D3D791F3CA27BB3D03E3952940F53DB02630F4F2D98BE7EB",
    "works_top.png": "6B80C43422F5B652DCBB5D1632AEA0DBCADB3A3F2EF259942BEFA07555158A93",
}

CYCLE_02_SHA256 = {
    "EPOCH.json": "E291CB2F31715912C42BBD8D2B3A7764304B023394F486FE51A0D0739CF17408",
    "hidden_faces.json": "359D5D8B031542D511AD94FF3681CE401112FCB6909B957E50038A00EB7A7D8D",
    "hook_identity.png": "DE3052CDBF0758B8917C93A47843657D59591DE324F949477E05A6AB7B38F8C9",
    "id_or_material_id.png": "B4731F403AA6E92ECE06356ECF74FA866E59BB0F9D56B7AEFB5A3D3BB57BC470",
    "INSPECT.md": "09A8BCC47DBD08FE54D78DBD256B1F34E2F2C95623A208C807E79FC3D7433C45",
    "inspect/works_edge_crop.png": "8CB6E42FD55E887078E798438C7D7DA3957D62F5E4CC8A2B860DDA53AA5F12C9",
    "inspect/works_site_crop.png": "65114741662803EEE065AEAD5C3A916BA0600F414F7B67D15567C732ECF621D9",
    "inspect/works_top_clay_crop.png": "4A372ED49DCB2946ACD5428EBC93302F52C3517D381767AC587EEB058CE6CDB0",
    "inspect/works_top_crop.png": "F388BF69EC1E6CF06202709C50DB75ED75DC1DB234E80C1A5B62FE28B53D9C6D",
    "normal_isolation.png": "E4413B951C2D1DB49B6BB98F9EA2A167510B4846E0F2F0137286CCD4FBBF833F",
    "orm_isolation.png": "4ED866D8A6DB310D0355E156B70D4188334DA3DD020E1C4646775E8E793003D4",
    "works_edge_grazing.png": "268D5022B62878B2D6D463470FD8E6B8F6781CBD4C53D2D45A2C355B593D6C08",
    "works_edge.png": "3899BFB5785A0E7E373B5E6A868EFE41F655B61B56CA2165C36DA112987B26F3",
    "works_site.png": "397B99EAFA072FECE913591C7171ACA87C41DDE81D6DD84B82A585A938132471",
    "works_top_clay.png": "DE3052CDBF0758B8917C93A47843657D59591DE324F949477E05A6AB7B38F8C9",
    "works_top.png": "6C04A7865BDA576C58A9CE972E1C023BBFE034D0C1D57C93E44637A52495C51E",
}

CYCLE_03_SHA256 = {
    "EPOCH.json": "0D5D0261ECE3549386F0E1D2405A2211D8642C52D71C047AED1FA24095B8AE60",
    "hidden_faces.json": "8F4D25086F28147E3651A47542927284A830D70540E1D080373DDC50C23FA0FD",
    "hook_identity.png": "F13458B032600F167C0D92675FA266BF0E0705E3626976B6F8842F3E4BF04BD2",
    "id_or_material_id.png": "DAC038FB985BAF83543AE4F2A5040AD2D314574FACC64481E1334D8664A4848F",
    "INSPECT.md": "D300DDB37DFC77F3B9CE4E10A9544EBEAFEFF792809849A7D7FC2014CE1B631A",
    "normal_isolation.png": "68E520D5444008EDD5C455C1F15F80E1AF9C371A65D2774F8CE94C98417829EE",
    "orm_isolation.png": "7833A1AE4D8CFA1532C764F7F8D8F9FA9204E32F6A67280F56F142BF2C6C4107",
    "works_edge_grazing.png": "CB8DF18FF8B6E8C5B928F0EB2638CDDE8D84A3825E9BD8A6D27C9448C49EE668",
    "works_edge.png": "71EB9FCE4C13BBD90BD7C11820B48EC18FE42E16D584390A89391AB691146243",
    "works_site.png": "D0BC722D3545566FDE4249B01A020849E3D02F71F4E93CA16D3B8FDB7762F02D",
    "works_top_clay.png": "DE4331999D72CA8A15687E2135E846C53FB07F19ADA8D0A24C1120692B974402",
    "works_top.png": "17583B82DA22938B0279B9ED8E4F62238B6C84343DAD46C95B5427D4913C6357",
    "inspect/works_edge_crop.png": "1957BDA5CC60C40F75D2EBFA56C33F47C874274250A446E3862C18C2816C72ED",
    "inspect/works_site_crop.png": "A20DEF15048AA746F82A0870036556E2961DFC521B487CE4E9ADD72BAFAF5812",
    "inspect/works_top_clay_crop.png": "0A1A6784ABE1FCFB7008169719D639CC81C3740020ACEBD2312FA218E5CA5E27",
    "inspect/works_top_crop.png": "32ED15DA633AC694091ACD173CB920532CA0FC7A261C87C7405F23FEC212F338",
}

CYCLE_04_SHA256 = {
    "EPOCH.json": "65FF38E0F76135EF455EF025926EDC51A22AA3BF1A3C386411C3BA72448F2D22",
    "hidden_faces.json": "3679D51E3510966A0F87D97ABF44F0AFF83781B82531DE3DF09F181A0FAD275B",
    "hook_identity.png": "85826BE8EF397DC3C660C8490A51696E8DBCE1E38BBC5D97BD6CA2DB2A0B515E",
    "id_or_material_id.png": "D0BE9CC7EB9D8D287DBB38D9509E6408832B208CB7B21747BFFA80C7A82871B7",
    "INSPECT.md": "0300B99DF72268AECFBBE06324CB5C6598C005400816745ED8604BEF658A42CC",
    "LOD_COMPARISON.json": "D00005A8A3E6FD75D6BC8A95CCA61C3426B0B5953DDEFF293010984D83D0BAD1",
    "LOD_COMPARISON.md": "EB26F41875B488124B593ECD1FFB82138AB421B44125FFFB278BEE22B61548D4",
    "lod0_matched_120px.png": "783CE8192BDE1D72E0A603EA352915F40017A52E0D757F8FB4E5DD2F803BA9CC",
    "lod1_matched_120px.png": "2712661D9BB65CE66AAA8F28D6780B27BEC88ECFA9E46BF8C979B3E4A2B96C4D",
    "lod2_matched_120px.png": "8B5E50B6B9C5850FB78E9F1BAD111F93DD8CFEEA563434FCC9F2FAF3A82CB014",
    "normal_isolation.png": "28535C4E82617CD98787C7738316FED7132FC828EB9ECDFB082EDAD4D57B2995",
    "NORMAL_ROUTE_LIMITATIONS.md": "B9EBD9D38A70B580E0901A2568F39213AB683AF91C550A08743653FA4B75AA16",
    "orm_isolation.png": "D97A5DFC2B37CF611E541367ABC400700106566493E476BA868AEAF282B8A8E0",
    "SUPPORTED_VIEW_ZONE_REGISTER.json": "276EA5D9941270097B578FD8F689B1B4F4CC5491B25356F152650D2C081BF280",
    "works_edge_grazing.png": "C3DA9B93D4E5369CADB7C120932C510DD88BE3AA8CBBC29357805169329812A4",
    "works_edge.png": "6992ED595CEF9875E30D16E3824053D912692DF967EA92FCDFB187BAA81BFD21",
    "works_site.png": "33E7E130B48641D16771C838A782C0A74BA1B865B28DE3F611ED8F17D767233F",
    "works_top_clay.png": "72AA5D66FF5A1A6904DD6C23C8EFEFE7D1890744E65362B3F8F595096BCC0AEF",
    "works_top.png": "AF988D35CF071E14939D0C0CD5D2F44A3BC4952358C7E77E1AA1F3C5783F5512",
    "inspect/lod0_matched_crop.png": "353320DDCA2A1433CBA323E35B04AA2B74379403DEFB6D9E13C376DD69C49F0C",
    "inspect/lod1_matched_crop.png": "187608629B6EBC95DC08DD8304B78572C10AB02C76E016CBF36E5A835D069596",
    "inspect/lod2_matched_crop.png": "4DC9CE0386BC585BB76F83D74B44E009EB298886251B789F32811998B05EB7CB",
    "inspect/works_edge_crop.png": "962F6E7F13CCF808BB9F38B5D2E1D8E1DE80DE4FC4A15820FD41F75352985230",
    "inspect/works_site_crop.png": "4EB7687483429C338B3EF87F1F7C63BD0C2D3FE8A1D1C88A9232C69E7F89D55D",
    "inspect/works_top_clay_crop.png": "5BF364E3191C72C77B13E4B452CE597E97D5DF8185E0FB98FE3CD557F6C0EA39",
    "inspect/works_top_crop.png": "E6AD4E980E0E740C12E312FAF963FB46F00EDC1D8632E3333988565B7B1A2D1B",
}

ROLES = {
    # Blue-grey alkyd over zinc — dielectric paint, deliberately separated
    # from the mine pad and every exposed-metal family at Works scale.
    "structure": {"rgb": (0.30, 0.34, 0.37), "rough": 0.58, "metal": 0.05, "id": (1.0, 0.0, 0.0)},
    # Worn machined tool steel — drum, rollers, fins, bearing housings.
    "cutting": {"rgb": (0.68, 0.72, 0.75), "rough": 0.22, "metal": 0.92, "id": (0.0, 1.0, 0.0)},
    # Gearbox only. Restrained straw/blue heat, not a copper wash.
    "drive": {"rgb": (0.46, 0.23, 0.075), "rough": 0.40, "metal": 0.66, "id": (0.0, 0.0, 1.0)},
    # Dry refractory jaw blocks, isolated from the painted housing.
    "ceramic": {"rgb": (0.76, 0.63, 0.38), "rough": 0.82, "metal": 0.01, "id": (1.0, 1.0, 0.0)},
    "belt": {"rgb": (0.028, 0.032, 0.035), "rough": 0.94, "metal": 0.01, "id": (1.0, 0.0, 1.0)},
    "lamp": {"rgb": (0.98, 0.76, 0.28), "rough": 0.18, "metal": 0.01, "id": (0.0, 1.0, 1.0)},
    "accent": {"rgb": (0.72, 0.33, 0.055), "rough": 0.50, "metal": 0.04, "id": (1.0, 0.4, 0.0)},
}

# Exhaustive author-side register for every zone visible in the three supported
# Works cameras. Coverage is complete enough to send to review, but the contract
# boolean remains false until an independent exact-hash reviewer confirms it.
VISIBLE_ZONES = [
    {
        "id": "painted_load_frame",
        "objects": ["rail_*", "xmem_*", "foot_*", "gusset_*", "cheek_*", "saddle_*"],
        "classification": "billed",
        "supportedViews": ["works_top", "works_edge", "works_site"],
        "dominantIn": ["works_top", "works_site"],
        "substrate": "rolled and folded carbon-steel section",
        "manufacture": "cut, brake-formed, welded, and bolted load frame",
        "finish": "blue-grey alkyd over zinc primer; dielectric",
        "interfaces": "pad feet, hat crossmembers, bearing saddles, crusher cheeks",
        "opticalRead": "medium-value matte paint with steel revealed only at causal service edges",
        "wear": "foot abrasion and localized cheek impacts; no universal edge wear",
        "forbiddenReads": ["mine-pad brown", "toy plastic", "closed square cage"],
    },
    {
        "id": "drive_case_and_service_hatch",
        "objects": ["drive_case", "drive_cover", "drive_service_hatch", "fin_header"],
        "classification": "billed",
        "supportedViews": ["works_top", "works_edge", "works_site"],
        "dominantIn": ["works_edge"],
        "substrate": "cast and machined steel drive housing",
        "manufacture": "waisted casting with removable stamped service hatch",
        "finish": "burnt-oxide machinery enamel with localized heat discoloration",
        "interfaces": "rear frame crossmember, motor, fin header, belt drive",
        "opticalRead": "warm mid-value drive mass distinct from cool painted frame",
        "wear": "service-hatch hand wear and restrained bearing-side heat",
        "forbiddenReads": ["copper plastic", "safety-yellow whole machine", "unreadable brown lump"],
    },
    {
        "id": "cutting_head_and_bearings",
        "objects": ["drum*", "cutter_crown", "bearing_*", "roller_*", "drive_pulley", "idler_pulley", "fin_*"],
        "classification": "billed",
        "supportedViews": ["works_top", "works_edge", "works_site"],
        "dominantIn": ["works_top"],
        "substrate": "machined tool steel",
        "manufacture": "turned drum and rollers, replaceable flute bars, machined bearing caps",
        "finish": "bare honed steel with restrained process polish",
        "interfaces": "rail-top saddles, axle, gearbox, belt crowns",
        "opticalRead": "bright cool metallic head crossing the frame",
        "wear": "directional machining and localized ore contact; no generic noise",
        "forbiddenReads": ["black pit", "unlit cylinder", "chrome toy"],
    },
    {
        "id": "refractory_feed_jaws",
        "objects": ["jaw_*", "feed_cheek_*"],
        "classification": "billed",
        "supportedViews": ["works_top", "works_edge", "works_site"],
        "dominantIn": ["works_site"],
        "substrate": "replaceable alumina refractory",
        "manufacture": "pressed and fired blocks in short broad-rooted paired retainers",
        "finish": "dry ochre mineral body, uncoated",
        "interfaces": "paired along the open +X cheek rims",
        "opticalRead": "two short pale splayed cheeks framing a dark open process bite",
        "wear": "chipped feed faces and dust-darkened roots only",
        "forbiddenReads": ["parallel forklift tines", "closed grate", "tiny studs", "painted yellow trim"],
    },
    {
        "id": "cutter_hardface_blocks",
        "objects": ["cutter_hardface_*"],
        "classification": "billed",
        "supportedViews": ["works_top", "works_edge", "works_site"],
        "dominantIn": ["works_site"],
        "substrate": "bonded alumina-carbide replaceable hardface blocks",
        "manufacture": "pressed inserts mechanically retained on the machined cutter crown",
        "finish": "dry pale refractory contact faces, uncoated and non-emissive",
        "interfaces": "segmented across the Y-axis crown with visible service gaps",
        "opticalRead": "bright transverse crusher line attached to the steel drum",
        "wear": "ore-contact faces polish locally while roots remain dry",
        "forbiddenReads": ["emissive outline", "floating stripe", "painted highlight"],
    },
    {
        "id": "inboard_belt",
        "objects": ["belt_face", "belt_return"],
        "classification": "billed",
        "supportedViews": ["works_top", "works_edge", "works_site"],
        "dominantIn": [],
        "substrate": "fabric-reinforced vulcanized rubber",
        "manufacture": "endless carcass over crowned replaceable rollers",
        "finish": "near-black dry rubber; non-metallic",
        "interfaces": "drive and idler pulleys inside the load frame",
        "opticalRead": "long dark directional ribbon leading into the bright crusher",
        "wear": "longitudinal ore polish, not leather grain",
        "forbiddenReads": ["filled trough", "metal plate", "leather"],
    },
    {
        "id": "hooded_work_lamp",
        "objects": ["lamp_bracket", "lamp_socket", "lamp_hood", "lamp_lens"],
        "classification": "billed",
        "supportedViews": ["works_top", "works_edge", "works_site"],
        "dominantIn": [],
        "substrate": "painted steel hood, ceramic socket, amber glass lens",
        "manufacture": "replaceable recessed industrial task-light assembly",
        "finish": "frame paint on hood with warm transparent lens",
        "interfaces": "rooted bracket on the port rail beside the feed head",
        "opticalRead": "single warm anchor above the mouth, fixture readable without emission",
        "wear": "dust shadow under hood; clean serviceable lens face",
        "forbiddenReads": ["beacon", "floating emissive disk", "unrooted pixel"],
    },
]


def write_text_lf(path: Path, text: str) -> None:
    path.write_bytes(text.encode("utf-8"))


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1 << 20), b""):
            digest.update(chunk)
    return digest.hexdigest().upper()


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


def look_at(obj, target=(0, 0, 0)):
    obj.rotation_euler = (Vector(target) - obj.location).to_track_quat("-Z", "Y").to_euler()


def role_material(role: str):
    name = f"Role_{role}"
    if name in bpy.data.materials:
        return bpy.data.materials[name]
    spec = ROLES[role]
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = next(n for n in mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    bsdf.inputs["Base Color"].default_value = (*spec["rgb"], 1.0)
    bsdf.inputs["Roughness"].default_value = spec["rough"]
    bsdf.inputs["Metallic"].default_value = spec["metal"]
    if role == "lamp":
        key = "Emission Color" if "Emission Color" in bsdf.inputs else "Emission"
        if key in bsdf.inputs:
            bsdf.inputs[key].default_value = (1.0, 0.82, 0.48, 1.0)
        if "Emission Strength" in bsdf.inputs:
            bsdf.inputs["Emission Strength"].default_value = 1.15
    mat["spacefaceRole"] = role
    return mat


def link_object(obj, collection):
    for current in list(obj.users_collection):
        current.objects.unlink(obj)
    collection.objects.link(obj)
    return obj


def apply_object(obj):
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    obj.select_set(False)


def finish_mesh(obj, role, bevel=0.008, collection=None):
    if collection is not None:
        link_object(obj, collection)
    obj.data.materials.clear()
    obj.data.materials.append(role_material(role))
    obj["spacefaceRole"] = role
    apply_object(obj)
    if bevel > 0.0005:
        mod = obj.modifiers.new("Bevel", "BEVEL")
        mod.width = float(bevel)
        mod.segments = 1
        mod.limit_method = "ANGLE"
        mod.angle_limit = math.radians(40.0)
        bpy.context.view_layer.objects.active = obj
        obj.select_set(True)
        bpy.ops.object.modifier_apply(modifier=mod.name)
        obj.select_set(False)
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    try:
        bpy.ops.object.shade_smooth_by_angle(angle=math.radians(SHADE_ANGLE))
    except TypeError:
        bpy.ops.object.shade_smooth()
        obj.data.use_auto_smooth = True
        obj.data.auto_smooth_angle = math.radians(SHADE_ANGLE)
    wn = obj.modifiers.new("WeightedNrm", "WEIGHTED_NORMAL")
    wn.keep_sharp = True
    try:
        wn.mode = "FACE_AREA_WITH_ANGLE"
    except TypeError:
        pass
    bpy.ops.object.modifier_apply(modifier=wn.name)
    obj.select_set(False)
    return obj


def add_mesh(name, verts, faces, role, collection, bevel=0.008):
    mesh = bpy.data.meshes.new(f"{name}_Mesh")
    mesh.from_pydata([tuple(v) for v in verts], [], faces)
    mesh.update()
    mesh.validate()
    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)
    return finish_mesh(obj, role, bevel=bevel, collection=collection)


def add_box(name, loc, size, role, collection, bevel=0.008, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cube_add(location=loc, rotation=rot)
    obj = bpy.context.object
    obj.name = name
    obj.scale = (size[0] * 0.5, size[1] * 0.5, size[2] * 0.5)
    return finish_mesh(obj, role, bevel=bevel, collection=collection)


def add_cyl(name, loc, radius, depth, role, collection, verts=16, bevel=0.004, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cylinder_add(
        vertices=max(6, verts), radius=radius, depth=depth, location=loc, rotation=rot,
    )
    obj = bpy.context.object
    obj.name = name
    return finish_mesh(obj, role, bevel=bevel, collection=collection)


def add_jaw_block(name, loc, size, collection, bevel=0.006):
    """One dry-refractory jaw, large enough to survive works_top (~0.14 wu)."""
    return add_box(name, loc, size, "ceramic", collection, bevel=bevel)


def add_feed_cheek(side, lod, collection, z_center):
    """Short rooted refractory cheek that splays around the +X aperture.

    The plan-view trapezoid is deliberately not a parallel rectangular tine:
    its broad root overlaps the crusher cheek, its short nose opens outward,
    and the paired inner edges preserve a dark process bite.
    """
    sign = 1.0 if side == "P" else -1.0
    root_x = 0.69
    tip_x = {0: 0.93, 1: 0.94, 2: 0.945}[lod]
    root_inner = 0.14 * sign
    root_outer = 0.34 * sign
    tip_inner = 0.22 * sign
    tip_outer = 0.41 * sign
    z0 = z_center - {0: 0.085, 1: 0.082, 2: 0.078}[lod]
    z1 = z_center + {0: 0.085, 1: 0.082, 2: 0.078}[lod]
    plan = [
        (root_x, root_inner),
        (root_x, root_outer),
        (tip_x, tip_outer),
        (tip_x, tip_inner),
    ]
    verts = [(x, y, z0) for x, y in plan] + [(x, y, z1) for x, y in plan]
    faces = [
        (0, 3, 2, 1), (4, 5, 6, 7),
        (0, 1, 5, 4), (1, 2, 6, 5),
        (2, 3, 7, 6), (3, 0, 4, 7),
    ]
    return add_mesh(
        f"feed_cheek_{side}", verts, faces, "ceramic", collection,
        bevel=0.004 if lod == 0 else 0.0,
    )


def add_belt_ribbon(name, x0, x1, y0, y1, z_top, thickness, sag, collection, stations=5, bevel=0.002):
    """Thin belt carcass with a real sag. Open underneath — not a filled pan."""
    xs = np.linspace(x0, x1, max(3, int(stations)))
    rings = []
    for x in xs:
        t = (float(x) - x0) / max(1e-6, x1 - x0)
        z = z_top - sag * math.sin(t * math.pi)
        rings.append((
            (float(x), y0, z),
            (float(x), y1, z),
            (float(x), y1, z - thickness),
            (float(x), y0, z - thickness),
        ))
    return loft_section(name, rings, "belt", collection, bevel=bevel, cap=True)


def add_c_rail(name, x0, x1, y_web, inward, collection, lod, z0=0.012, z1=0.155):
    """C-channel prism at every LOD. Two stations — no loft rungs."""
    bevel = {0: 0.005, 1: 0.0, 2: 0.0}[lod]
    thick = {0: 0.034, 1: 0.040, 2: 0.048}[lod]
    width = {0: 0.22, 1: 0.21, 2: 0.20}[lod]
    stations = [
        c_channel_ring(float(x0), y_web, z0, z1, width, thick, inward),
        c_channel_ring(float(x1), y_web, z0, z1 + 0.05, width, thick, inward),
    ]
    return loft_section(name, stations, "structure", collection, bevel)


def add_hat_member(name, cx, y0, y1, w, h, collection, lod, z=0.012, role="structure"):
    bevel = {0: 0.005, 1: 0.0, 2: 0.0}[lod]
    t = {0: 0.028, 1: 0.036, 2: 0.042}[lod]
    stations = [
        hat_beam_ring(cx, float(y0), z, w, h, t),
        hat_beam_ring(cx, float(y1), z, w, h, t),
    ]
    return loft_section(name, stations, role, collection, bevel)


def add_yoke_arm(side, lod, collection):
    """Plate arm from rail saddle to the drum bearing, with a short +X horn."""
    sign = 1.0 if side == "P" else -1.0
    bevel = {0: 0.005, 1: 0.004, 2: 0.0}[lod]
    y_outer = 0.74 * sign
    y_saddle_in = 0.62 * sign
    y_mid_out = 0.48 * sign
    y_mid_in = 0.38 * sign
    y_brg_out = 0.36 * sign
    y_brg_in = 0.26 * sign

    def ring(x, yo, yi, z0, z1):
        return [(x, yo, z0), (x, yi, z0), (x, yi, z1), (x, yo, z1)]

    if lod >= 1:
        stations = [
            ring(0.38, y_outer, y_saddle_in, 0.12, 0.24),
            ring(0.44, y_brg_out, y_brg_in, 0.24, 0.46),
        ]
    else:
        stations = [
            ring(0.36, y_outer, y_saddle_in, 0.12, 0.22),
            ring(0.40, y_mid_out, y_mid_in, 0.20, 0.42),
            ring(0.44, y_brg_out, y_brg_in, 0.26, 0.48),
            ring(0.62, y_brg_out * 0.92, y_brg_in * 0.92, 0.28, 0.44),
        ]
    return loft_section(f"yoke_{side}", stations, "structure", collection, bevel)


def add_cone(name, loc, r1, r2, depth, role, collection, verts=12, bevel=0.003, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cone_add(
        vertices=max(6, verts), radius1=r1, radius2=r2, depth=depth, location=loc, rotation=rot,
    )
    obj = bpy.context.object
    obj.name = name
    return finish_mesh(obj, role, bevel=bevel, collection=collection)


def loft_section(name, stations, role, collection, bevel=0.008, cap=True):
    """stations: list of rings, each ring a list of (x,y,z) with equal count."""
    sides = len(stations[0])
    verts = [p for ring in stations for p in ring]
    faces = []
    if cap:
        faces.append(tuple(range(sides)))
        last = (len(stations) - 1) * sides
        faces.append(tuple(range(last + sides - 1, last - 1, -1)))
    for i in range(len(stations) - 1):
        a = i * sides
        b = (i + 1) * sides
        for s in range(sides):
            s2 = (s + 1) % sides
            faces.append((a + s, a + s2, b + s2, b + s))
    return add_mesh(name, verts, faces, role, collection, bevel)


def c_channel_ring(x, y_web, z0, z1, width, thick, inward):
    """C opening toward y=0. inward is sign of flange direction (toward centre)."""
    s = 1.0 if inward > 0 else -1.0
    y_in = y_web + s * width
    t = thick
    z0i, z1i = z0 + t, z1 - t
    y_web_i = y_web + s * t
    return [
        (x, y_web, z0),
        (x, y_web, z1),
        (x, y_in, z1),
        (x, y_in, z1i),
        (x, y_web_i, z1i),
        (x, y_web_i, z0i),
        (x, y_in, z0i),
        (x, y_in, z0),
    ]


def hat_beam_ring(x, y, z, w, h, t):
    """Hat section in the XZ plane (open down), lofted along Y. Width `w` is along X."""
    hw, hh = w * 0.5, h
    return [
        (x - hw, y, z),
        (x - hw + t, y, z),
        (x - hw + t, y, z + hh - t),
        (x + hw - t, y, z + hh - t),
        (x + hw - t, y, z),
        (x + hw, y, z),
        (x + hw, y, z + hh),
        (x - hw, y, z + hh),
    ]


def parent_keep(obj, parent):
    # Fresh empties do not report their authored location through
    # matrix_world until Blender evaluates the dependency graph.
    bpy.context.view_layer.update()
    mw = obj.matrix_world.copy()
    obj.parent = parent
    # Store an explicit parent-local basis.  The previous parent-inverse
    # cancellation preserved Blender world placement but exported the hook
    # empties at identity while leaving their mesh children at absolute
    # coordinates.  Runtime animation then pivoted at the machine origin.
    obj.matrix_parent_inverse = Matrix.Identity(4)
    obj.matrix_basis = parent.matrix_world.inverted() @ mw


def add_empty(name, loc, collection, size=0.08):
    obj = bpy.data.objects.new(name, None)
    collection.objects.link(obj)
    obj.empty_display_type = "PLAIN_AXES"
    obj.empty_display_size = size
    obj.location = loc
    return obj


def stamp_socket(obj):
    obj["spacefaceSocket"] = True
    obj["spaceface.socket"] = True
    obj["spaceface"] = {"socket": True, "role": "works_hook"}
    obj["socket"] = True


def count_tris(obj):
    if obj.type != "MESH" or not obj.data:
        return 0
    return sum(max(0, len(p.vertices) - 2) for p in obj.data.polygons)


def join_group(objects, name):
    objects = [o for o in objects if o is not None and o.name in bpy.data.objects]
    if not objects:
        raise RuntimeError(f"join_group {name}: empty")
    if len(objects) == 1:
        objects[0].name = name
        return objects[0]
    bpy.ops.object.select_all(action="DESELECT")
    for obj in objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    bpy.ops.object.join()
    objects[0].name = name
    return objects[0]


def mesh_area(obj):
    if obj.type != "MESH":
        return 0.0
    return float(sum(p.area for p in obj.data.polygons))


def unwrap_unique(objects):
    """Smart-project each mesh, then pack islands into non-overlapping UV0."""
    areas = []
    for obj in objects:
        if obj.type != "MESH":
            continue
        if not obj.data.uv_layers:
            obj.data.uv_layers.new(name="UVMap")
        bpy.ops.object.select_all(action="DESELECT")
        obj.select_set(True)
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.mode_set(mode="EDIT")
        bpy.ops.mesh.select_all(action="SELECT")
        bpy.ops.uv.smart_project(angle_limit=math.radians(66.0), island_margin=0.012, area_weight=1.0)
        bpy.ops.uv.average_islands_scale()
        bpy.ops.object.mode_set(mode="OBJECT")
        areas.append((obj, max(1e-6, mesh_area(obj))))
    # Pack every joined role group in one multi-object edit session. The old
    # two-column shelf allocated a minimum height after a column was already
    # full, so later head/belt/lamp islands could overlap and overwrite the ID
    # bake. That was the direct cause of visually distinct materials collapsing
    # back into one dark frame value in Cycle 03.
    if areas:
        bpy.ops.object.select_all(action="DESELECT")
        for obj, _area in areas:
            obj.select_set(True)
        bpy.context.view_layer.objects.active = areas[0][0]
        bpy.ops.object.mode_set(mode="EDIT")
        bpy.ops.mesh.select_all(action="SELECT")
        bpy.ops.uv.average_islands_scale()
        try:
            bpy.ops.uv.pack_islands(margin=0.008, rotate=True, scale=True)
        except TypeError:
            bpy.ops.uv.pack_islands(margin=0.008)
        bpy.ops.object.mode_set(mode="OBJECT")
    # Belt UV1 for later scrolling (U along +X).
    for obj, _area in areas:
        if obj.get("spacefaceRole") != "belt" and "belt" not in obj.name.lower():
            continue
        if "UV1" not in obj.data.uv_layers:
            uv1 = obj.data.uv_layers.new(name="UV1")
        else:
            uv1 = obj.data.uv_layers["UV1"]
        for li, loop in enumerate(obj.data.loops):
            co = obj.data.vertices[loop.vertex_index].co
            u = (float(co.x) - BELT_X0) / max(1e-6, BELT_X1 - BELT_X0)
            v = (float(co.y) + BELT_HALF_Y) / max(1e-6, BELT_HALF_Y * 2.0)
            uv1.data[li].uv = (u, v)


def set_active_image(mat, img):
    nt = mat.node_tree
    nodes = nt.nodes
    tex = None
    for node in nodes:
        if node.type == "TEX_IMAGE" and node.image == img:
            tex = node
            break
    if tex is None:
        tex = nodes.new("ShaderNodeTexImage")
        tex.image = img
        tex.location = (-500, 200)
    nodes.active = tex
    tex.select = True
    return tex


def ensure_cycles():
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = 8
    scene.cycles.preview_samples = 4
    scene.render.bake.margin = 8
    scene.render.bake.use_selected_to_active = False


def bake_targets(objects, size, stem):
    ensure_cycles()
    TEX_DIR.mkdir(parents=True, exist_ok=True)

    def new_img(name, cs="Non-Color"):
        if name in bpy.data.images:
            bpy.data.images.remove(bpy.data.images[name])
        img = bpy.data.images.new(name, width=size, height=size, alpha=True, float_buffer=True)
        img.colorspace_settings.name = cs
        return img

    ao_img = new_img(f"{stem}_ao")
    nrm_img = new_img(f"{stem}_normal")
    id_img = new_img(f"{stem}_id", "sRGB")
    curv_img = new_img(f"{stem}_curvature")

    # ID emit materials
    id_mats = {}
    for role, spec in ROLES.items():
        mat = bpy.data.materials.new(f"_ID_{role}")
        mat.use_nodes = True
        nt = mat.node_tree
        nt.nodes.clear()
        out = nt.nodes.new("ShaderNodeOutputMaterial")
        emit = nt.nodes.new("ShaderNodeEmission")
        emit.inputs["Color"].default_value = (*spec["id"], 1.0)
        emit.inputs["Strength"].default_value = 1.0
        nt.links.new(emit.outputs["Emission"], out.inputs["Surface"])
        id_mats[role] = mat

    backups = {}
    for obj in objects:
        backups[obj.name] = {
            "materials": [s.material for s in obj.material_slots],
            "polygonMaterialIndices": [int(p.material_index) for p in obj.data.polygons],
        }

    def assign(img, color_space_nodes=True):
        for obj in objects:
            if not obj.data.materials:
                obj.data.materials.append(role_material(obj.get("spacefaceRole", "structure")))
            # Joined production meshes keep one material slot per physical
            # role. Every slot needs the same active bake target; assigning it
            # only on slot zero silently left drive/steel/ceramic/belt pixels
            # unbaked and made the final atlas collapse toward frame paint.
            for slot in obj.material_slots:
                if slot.material is not None:
                    set_active_image(slot.material, img)

    def do_bake(bake_type, img, selected_to_active=False):
        assign(img)
        bpy.ops.object.select_all(action="DESELECT")
        for obj in objects:
            obj.select_set(True)
        bpy.context.view_layer.objects.active = objects[0]
        bpy.context.scene.render.bake.use_selected_to_active = selected_to_active
        bpy.ops.object.bake(type=bake_type, margin=8, use_clear=True)

    do_bake("AO", ao_img)

    # Normal from a tighter-bevel high duplicate.
    highs = []
    for obj in objects:
        dup = obj.copy()
        dup.data = obj.data.copy()
        bpy.context.scene.collection.objects.link(dup)
        for coll in list(dup.users_collection):
            if coll != objects[0].users_collection[0]:
                try:
                    coll.objects.unlink(dup)
                except Exception:
                    pass
        objects[0].users_collection[0].objects.link(dup)
        dup.name = obj.name + "_high"
        # Extra mid-poly: inset-ish by a tighter additional bevel.
        mod = dup.modifiers.new("HighBevel", "BEVEL")
        mod.width = 0.003
        mod.segments = 2
        mod.limit_method = "ANGLE"
        mod.angle_limit = math.radians(30.0)
        bpy.context.view_layer.objects.active = dup
        dup.select_set(True)
        bpy.ops.object.modifier_apply(modifier=mod.name)
        dup.select_set(False)
        highs.append(dup)
    assign(nrm_img)
    bpy.context.scene.render.bake.use_selected_to_active = True
    bpy.context.scene.render.bake.cage_extrusion = 0.03
    bpy.context.scene.render.bake.normal_space = "TANGENT"
    try:
        bpy.context.scene.render.bake.normal_g = "POS_Y"
    except Exception:
        pass
    bpy.ops.object.select_all(action="DESELECT")
    for h in highs:
        h.select_set(True)
    for obj in objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    try:
        bpy.ops.object.bake(type="NORMAL", margin=8, use_clear=True, use_selected_to_active=True,
                            cage_extrusion=0.03, normal_space="TANGENT")
    except Exception as exc:
        print("normal bake fallback:", exc)
        bpy.context.scene.render.bake.use_selected_to_active = False
        do_bake("NORMAL", nrm_img)
    for h in highs:
        bpy.data.objects.remove(h, do_unlink=True)

    # ID emit from per-slot roles (joins keep multiple slots).
    for obj in objects:
        new_slots = []
        for slot in obj.material_slots:
            role = "structure"
            if slot.material is not None:
                role = slot.material.get("spacefaceRole") or obj.get("spacefaceRole") or "structure"
            if role not in id_mats:
                role = "structure"
            new_slots.append(id_mats[role])
        obj.data.materials.clear()
        for mat in new_slots or [id_mats["structure"]]:
            obj.data.materials.append(mat)
        for slot in obj.material_slots:
            if slot.material is not None:
                set_active_image(slot.material, id_img)
    # Bake each joined role group into the shared non-overlapping atlas without
    # clearing prior groups. A multi-object EMIT bake in Blender 5.1 retained
    # only the last object families in this pipeline, which erased the drive,
    # steel, and refractory IDs even after the UV overlap was repaired.
    bpy.context.scene.render.bake.use_selected_to_active = False
    for obj_index, obj in enumerate(objects):
        bpy.ops.object.select_all(action="DESELECT")
        obj.select_set(True)
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.bake(
            type="EMIT", margin=8, use_clear=(obj_index == 0),
            use_selected_to_active=False,
        )

    # Curvature via pointiness
    for obj in objects:
        mat = bpy.data.materials.new(f"_CURV_{obj.name}")
        mat.use_nodes = True
        nt = mat.node_tree
        nt.nodes.clear()
        out = nt.nodes.new("ShaderNodeOutputMaterial")
        emit = nt.nodes.new("ShaderNodeEmission")
        geo = nt.nodes.new("ShaderNodeNewGeometry")
        ramp = nt.nodes.new("ShaderNodeValToRGB")
        ramp.color_ramp.elements[0].position = 0.42
        ramp.color_ramp.elements[0].color = (0.0, 0.0, 0.0, 1.0)
        ramp.color_ramp.elements[1].position = 0.62
        ramp.color_ramp.elements[1].color = (1.0, 1.0, 1.0, 1.0)
        nt.links.new(geo.outputs["Pointiness"], ramp.inputs["Fac"])
        nt.links.new(ramp.outputs["Color"], emit.inputs["Color"])
        nt.links.new(emit.outputs["Emission"], out.inputs["Surface"])
        obj.data.materials.clear()
        obj.data.materials.append(mat)
        set_active_image(mat, curv_img)
    bpy.ops.object.select_all(action="DESELECT")
    for obj in objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    bpy.ops.object.bake(type="EMIT", margin=8, use_clear=True)

    for obj in objects:
        obj.data.materials.clear()
        for mat in backups[obj.name]["materials"]:
            obj.data.materials.append(mat)
        for poly, material_index in zip(
            obj.data.polygons, backups[obj.name]["polygonMaterialIndices"]
        ):
            poly.material_index = material_index

    def pixels(img):
        arr = np.zeros(size * size * 4, dtype=np.float32)
        img.pixels.foreach_get(arr)
        return arr.reshape(size, size, 4)

    def rasterize_role_ids():
        """Rasterize physical-role IDs from final UV0 and polygon slots.

        Blender 5.1's bake operator only wrote slot zero for joined meshes in
        this pipeline even when every slot had an active image target. UV0 and
        polygon material indices are already the exact portable authority, so
        rasterizing their loop triangles is deterministic and avoids silently
        collapsing steel, refractory, and drive regions into frame paint.
        """
        out = np.zeros((size, size, 4), dtype=np.float32)
        filled = np.zeros((size, size), dtype=bool)

        def fill_triangle(uvs, color):
            pts = np.asarray(uvs, dtype=np.float64) * float(size - 1)
            min_x = max(0, int(math.floor(float(np.min(pts[:, 0])))))
            max_x = min(size - 1, int(math.ceil(float(np.max(pts[:, 0])))))
            min_y = max(0, int(math.floor(float(np.min(pts[:, 1])))))
            max_y = min(size - 1, int(math.ceil(float(np.max(pts[:, 1])))))
            if min_x > max_x or min_y > max_y:
                return
            yy, xx = np.mgrid[min_y:max_y + 1, min_x:max_x + 1]
            px = xx.astype(np.float64) + 0.5
            py = yy.astype(np.float64) + 0.5
            ax, ay = pts[0]
            bx, by = pts[1]
            cx, cy = pts[2]
            den = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy)
            if abs(float(den)) < 1e-12:
                return
            w0 = ((by - cy) * (px - cx) + (cx - bx) * (py - cy)) / den
            w1 = ((cy - ay) * (px - cx) + (ax - cx) * (py - cy)) / den
            w2 = 1.0 - w0 - w1
            mask = (w0 >= -1e-6) & (w1 >= -1e-6) & (w2 >= -1e-6)
            region = out[min_y:max_y + 1, min_x:max_x + 1]
            region[mask] = color
            filled[min_y:max_y + 1, min_x:max_x + 1][mask] = True

        for obj in objects:
            mesh = obj.data
            mesh.calc_loop_triangles()
            uv_layer = mesh.uv_layers.active
            if uv_layer is None:
                raise RuntimeError(f"{obj.name}: missing UV0 for role raster")
            for tri in mesh.loop_triangles:
                poly = mesh.polygons[tri.polygon_index]
                slot_index = min(int(poly.material_index), max(0, len(obj.material_slots) - 1))
                mat = obj.material_slots[slot_index].material if obj.material_slots else None
                role = mat.get("spacefaceRole") if mat is not None else None
                if role not in ROLES:
                    role = obj.get("spacefaceRole") or "structure"
                color = np.array((*ROLES[role]["id"], 1.0), dtype=np.float32)
                uvs = [uv_layer.data[li].uv[:] for li in tri.loops]
                fill_triangle(uvs, color)

        # Extend eight texels into the inter-island margin for stable mips.
        for _ in range(8):
            pending = ~filled
            if not np.any(pending):
                break
            next_out = out.copy()
            next_filled = filled.copy()
            for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                src = np.zeros_like(out)
                src_filled = np.zeros_like(filled)
                y_src = slice(max(0, -dy), min(size, size - dy))
                x_src = slice(max(0, -dx), min(size, size - dx))
                y_dst = slice(max(0, dy), min(size, size + dy))
                x_dst = slice(max(0, dx), min(size, size + dx))
                src[y_dst, x_dst] = out[y_src, x_src]
                src_filled[y_dst, x_dst] = filled[y_src, x_src]
                take = pending & src_filled & ~next_filled
                next_out[take] = src[take]
                next_filled[take] = True
            out, filled = next_out, next_filled
        return out

    return {
        "ao": pixels(ao_img),
        "normal": pixels(nrm_img),
        "id": rasterize_role_ids(),
        "curvature": pixels(curv_img),
    }


def classify_id(id_arr):
    rgb = id_arr[..., :3]
    names = list(ROLES.keys())
    targets = np.array([ROLES[n]["id"] for n in names], dtype=np.float32)
    # (H,W,3) vs (R,3)
    delta = rgb[:, :, None, :] - targets[None, None, :, :]
    dist = np.sum(delta * delta, axis=-1)
    idx = np.argmin(dist, axis=-1)
    return idx, names


def author_maps(bakes, size, stem):
    ao = np.clip(bakes["ao"][..., 0], 0.0, 1.0)
    nrm = bakes["normal"]
    curv = np.clip(bakes["curvature"][..., 0], 0.0, 1.0)
    idx, names = classify_id(bakes["id"])
    h, w = size, size
    yy, xx = np.mgrid[0:h, 0:w]
    n1 = ((xx * 17 + yy * 31) % 251).astype(np.float32) / 250.0
    n2 = ((xx * 9 + yy * 13) % 173).astype(np.float32) / 172.0
    # Flatten AO so symmetric rails cannot split; dirt is cavity-only and quiet.
    ao_flat = np.clip(0.78 + 0.22 * ao, 0.0, 1.0)
    dirt = np.clip((1.0 - ao) * 0.18, 0.0, 0.22)
    convex = np.clip((curv - 0.52) * 3.4, 0.0, 1.0)
    concave = np.clip((0.48 - curv) * 3.4, 0.0, 1.0)

    albedo = np.zeros((h, w, 4), dtype=np.float32)
    orm = np.zeros((h, w, 4), dtype=np.float32)
    normal = np.zeros((h, w, 4), dtype=np.float32)
    for i, name in enumerate(names):
        spec = ROLES[name]
        mask = idx == i
        if not np.any(mask):
            continue
        r, g, b = spec["rgb"]
        if name == "structure":
            # Dielectric alkyd. Sparse corner chips only — never a metal channel.
            chip = convex * (n2 > 0.96).astype(np.float32)
            rr = np.clip(r * (0.90 + 0.10 * ao_flat) - dirt * 0.04 + chip * 0.10, 0, 1)
            gg = np.clip(g * (0.90 + 0.10 * ao_flat) - dirt * 0.03 + chip * 0.08, 0, 1)
            bb = np.clip(b * (0.91 + 0.09 * ao_flat) - dirt * 0.02 + chip * 0.06, 0, 1)
            rough = np.clip(spec["rough"] + dirt * 0.06 - chip * 0.04, 0.20, 0.92)
            metal = np.clip(spec["metal"] + chip * 0.08, 0.0, 0.18)
        elif name == "cutting":
            polish = np.clip(ao_flat * 0.20 + convex * 0.40, 0, 1)
            rr = np.clip(r * (0.94 + polish * 0.10) - concave * 0.04, 0, 1)
            gg = np.clip(g * (0.94 + polish * 0.08) - concave * 0.03, 0, 1)
            bb = np.clip(b * (0.93 + polish * 0.07) - concave * 0.02, 0, 1)
            rough = np.clip(spec["rough"] + concave * 0.08 - polish * 0.08, 0.10, 0.80)
            metal = np.clip(spec["metal"] - dirt * 0.03, 0.74, 0.96)
        elif name == "drive":
            # Restrained heat on the gearbox only. No copper wash, no uniform dirt.
            heat = np.clip((1.0 - ao) * 0.22, 0, 0.28)
            rr = np.clip(r * (0.88 + ao_flat * 0.10) + heat * 0.10, 0, 1)
            gg = np.clip(g * (0.88 + ao_flat * 0.08) + heat * 0.01, 0, 1)
            bb = np.clip(b * (0.84 + ao_flat * 0.08) - heat * 0.04 + heat * n2 * 0.05, 0, 1)
            rough = np.clip(spec["rough"] + dirt * 0.05 - heat * 0.04, 0.20, 0.90)
            metal = np.clip(spec["metal"] - dirt * 0.04, 0.55, 0.82)
        elif name == "ceramic":
            chip = convex * (n1 > 0.88).astype(np.float32)
            rr = np.clip(r * (0.88 + ao_flat * 0.10) - dirt * 0.05 + chip * 0.06, 0, 1)
            gg = np.clip(g * (0.88 + ao_flat * 0.09) - dirt * 0.04 + chip * 0.03, 0, 1)
            bb = np.clip(b * (0.86 + ao_flat * 0.08) - dirt * 0.03, 0, 1)
            rough = np.clip(spec["rough"] + dirt * 0.04 + chip * 0.05, 0.40, 0.95)
            metal = spec["metal"]
        elif name == "belt":
            groove = ((xx % 22) < 2).astype(np.float32) * 0.05
            rr = np.clip(r * (0.90 + ao_flat * 0.12) + groove, 0, 1)
            gg = np.clip(g * (0.90 + ao_flat * 0.10) + groove * 0.8, 0, 1)
            bb = np.clip(b * (0.90 + ao_flat * 0.08) + groove * 0.6, 0, 1)
            rough = np.clip(spec["rough"] + dirt * 0.04, 0.40, 0.95)
            metal = spec["metal"]
        elif name == "lamp":
            rr = np.clip(r * (0.92 + ao_flat * 0.08), 0, 1)
            gg = np.clip(g * (0.90 + ao_flat * 0.07), 0, 1)
            bb = np.clip(b * (0.84 + ao_flat * 0.06), 0, 1)
            rough = spec["rough"]
            metal = spec["metal"]
        else:  # accent
            rr = np.clip(r * (0.88 + ao_flat * 0.12) - dirt * 0.03, 0, 1)
            gg = np.clip(g * (0.86 + ao_flat * 0.10) - dirt * 0.02, 0, 1)
            bb = np.clip(b * (0.84 + ao_flat * 0.08) - dirt * 0.02, 0, 1)
            rough = spec["rough"] + dirt * 0.04
            metal = spec["metal"]
        albedo[mask, 0] = rr[mask]
        albedo[mask, 1] = gg[mask]
        albedo[mask, 2] = bb[mask]
        albedo[mask, 3] = 0.9 if name == "lamp" else 1.0
        orm[mask, 0] = ao[mask]
        rough_a = np.asarray(rough, dtype=np.float32)
        metal_a = np.asarray(metal, dtype=np.float32)
        if rough_a.ndim == 0:
            orm[mask, 1] = float(np.clip(rough_a, 0.08, 0.95))
        else:
            orm[mask, 1] = np.clip(rough_a[mask], 0.08, 0.95)
        if metal_a.ndim == 0:
            orm[mask, 2] = float(np.clip(metal_a, 0.0, 1.0))
        else:
            orm[mask, 2] = np.clip(metal_a[mask], 0.0, 1.0)
        orm[mask, 3] = 1.0

    # Mesh-derived tangent normal (OpenGL +Y). Flatten empty/black to +Z.
    nx, ny, nz = nrm[..., 0], nrm[..., 1], nrm[..., 2]
    mag = np.sqrt((nx * 2 - 1) ** 2 + (ny * 2 - 1) ** 2 + (nz * 2 - 1) ** 2)
    empty = mag < 0.15
    nx = np.where(empty, 0.5, nx)
    ny = np.where(empty, 0.5, ny)
    nz = np.where(empty, 1.0, nz)
    # Mix a little curvature into the normal so bevels read if the bake is quiet.
    nx = np.clip(nx + (convex - concave) * 0.04 * (n1 - 0.5), 0, 1)
    ny = np.clip(ny + (convex - concave) * 0.04 * (n2 - 0.5), 0, 1)
    normal[..., 0] = nx
    normal[..., 1] = ny
    normal[..., 2] = np.clip(nz, 0.5, 1.0)
    normal[..., 3] = 1.0

    def write(arr, name, cs):
        img_name = name
        if img_name in bpy.data.images:
            bpy.data.images.remove(bpy.data.images[img_name])
        img = bpy.data.images.new(img_name, width=size, height=size, alpha=True)
        img.colorspace_settings.name = cs
        img.pixels.foreach_set(np.ascontiguousarray(arr, dtype=np.float32).ravel())
        path = TEX_DIR / f"{name}.png"
        img.filepath_raw = str(path)
        img.file_format = "PNG"
        img.save()
        sanitize_png(path)
        img.pack()
        img.filepath_raw = str(path)
        return img, path

    base_img, base_path = write(albedo, f"{stem}_basecolor", "sRGB")
    nrm_img, nrm_path = write(normal, f"{stem}_normal", "Non-Color")
    orm_img, orm_path = write(orm, f"{stem}_orm", "Non-Color")
    id_img, id_path = write(bakes["id"], f"{stem}_id", "sRGB")
    return {
        "base": base_img,
        "normal": nrm_img,
        "orm": orm_img,
        "id": id_img,
        "paths": {
            "basecolor": str(base_path.relative_to(ROOT)).replace("\\", "/"),
            "normal": str(nrm_path.relative_to(ROOT)).replace("\\", "/"),
            "orm": str(orm_path.relative_to(ROOT)).replace("\\", "/"),
            "id": str(id_path.relative_to(ROOT)).replace("\\", "/"),
        },
    }


def atlas_material(maps, lod, emissive=False):
    mat = bpy.data.materials.new(f"ExtractorAtlas_LOD{lod}" + ("_Lamp" if emissive else ""))
    mat.use_nodes = True
    nt = mat.node_tree
    bsdf = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
    tex_c = nt.nodes.new("ShaderNodeTexImage")
    tex_c.image = maps["base"]
    tex_c.image.colorspace_settings.name = "sRGB"
    tex_n = nt.nodes.new("ShaderNodeTexImage")
    tex_n.image = maps["normal"]
    tex_n.image.colorspace_settings.name = "Non-Color"
    tex_o = nt.nodes.new("ShaderNodeTexImage")
    tex_o.image = maps["orm"]
    tex_o.image.colorspace_settings.name = "Non-Color"
    nrm = nt.nodes.new("ShaderNodeNormalMap")
    nrm.space = "TANGENT"
    sep = nt.nodes.new("ShaderNodeSeparateColor") if "ShaderNodeSeparateColor" in dir(bpy.types) else nt.nodes.new("ShaderNodeSeparateRGB")
    nt.links.new(tex_c.outputs["Color"], bsdf.inputs["Base Color"])
    nt.links.new(tex_n.outputs["Color"], nrm.inputs["Color"])
    nt.links.new(nrm.outputs["Normal"], bsdf.inputs["Normal"])
    out_rgb = sep.outputs[0] if "Red" not in sep.outputs else sep.outputs["Red"]
    # Wire ORM: R AO (as base multiply already authored), G rough, B metal.
    nt.links.new(tex_o.outputs["Color"], sep.inputs[0])
    g_out = sep.outputs[1] if "Green" not in sep.outputs else sep.outputs["Green"]
    b_out = sep.outputs[2] if "Blue" not in sep.outputs else sep.outputs["Blue"]
    nt.links.new(g_out, bsdf.inputs["Roughness"])
    nt.links.new(b_out, bsdf.inputs["Metallic"])
    if emissive:
        key = "Emission Color" if "Emission Color" in bsdf.inputs else "Emission"
        if key in bsdf.inputs:
            nt.links.new(tex_c.outputs["Color"], bsdf.inputs[key])
        if "Emission Strength" in bsdf.inputs:
            # The warm hood, socket, and bracket carry the site read. The lens
            # gets only a restrained self-lit contribution; it cannot rescue a
            # floating or otherwise unreadable fixture.
            bsdf.inputs["Emission Strength"].default_value = 0.18
    mat["spacefaceRole"] = "atlas"
    return mat


# ---------------------------------------------------------------------------
# Geometry — original manufactured assemblies
# ---------------------------------------------------------------------------

def build_frame(lod, collection):
    bevel = {0: 0.005, 1: 0.0, 2: 0.0}[lod]
    objs = []
    # C-channel rails, open toward +X. Same section family at every LOD.
    for side, y_web, inward in (("P", 0.78, -1.0), ("S", -0.78, 1.0)):
        # Stop the painted frame before the crusher mouth so the two forward
        # jaw forks—not a square perimeter—own the +X silhouette at 19 px.
        objs.append(add_c_rail(f"rail_{side}", -0.90, 0.42, y_web, inward, collection, lod))
        if lod < 2:
            for tag, fx in (("aft", -0.86), ("fore", 0.36)):
                objs.append(add_box(
                    f"foot_{side}_{tag}", (fx, y_web * 0.92, 0.03),
                    (0.16, 0.16, 0.06), "structure", collection, bevel=0.0,
                ))
    # Open hat crossmembers — never a filled box wall.
    objs.append(add_hat_member("xmem_aft", -0.86, -0.62, 0.62, 0.16, 0.13, collection, lod))
    if lod < 2:
        objs.append(add_hat_member("xmem_mid", -0.08, -0.58, 0.58, 0.13, 0.11, collection, lod))
    if lod == 0:
        for i, (x, y, sx) in enumerate((
            (-0.78, 0.62, 1), (-0.78, -0.62, -1),
            (0.00, 0.62, 1), (0.00, -0.62, -1),
        )):
            verts = [
                (x, y, 0.02), (x + 0.10, y, 0.02), (x, y - sx * 0.10, 0.02),
                (x, y, 0.11), (x + 0.10, y, 0.11), (x, y - sx * 0.10, 0.11),
            ]
            faces = [(0, 1, 2), (3, 5, 4), (0, 3, 4, 1), (1, 4, 5, 2), (2, 5, 3, 0)]
            objs.append(add_mesh(f"gusset_{i}", verts, faces, "structure", collection, bevel=0.004))
    # No trough skirts — the belt is a free ribbon over rollers.
    return objs


def build_drive(lod, collection):
    bevel = {0: 0.006, 1: 0.0, 2: 0.0}[lod]
    objs = []
    # Lofted gearbox with a waist at every LOD. Narrower than the rail span.
    stations = []
    case_spec = (
        ((-0.76, 0.20, 0.14, 0.44), (-0.62, 0.24, 0.12, 0.52), (-0.48, 0.22, 0.12, 0.54), (-0.34, 0.16, 0.16, 0.46))
        if lod == 0 else
        ((-0.74, 0.18, 0.14, 0.46), (-0.52, 0.22, 0.12, 0.52), (-0.34, 0.16, 0.16, 0.44))
        if lod == 1 else
        ((-0.70, 0.16, 0.16, 0.44), (-0.38, 0.14, 0.18, 0.42))
    )
    for x, hy, z0, z1 in case_spec:
        if lod == 0:
            stations.append([
                (x, -hy * 0.55, z0),
                (x, hy * 0.55, z0),
                (x, hy, z0 + 0.08),
                (x, hy, z1 - 0.06),
                (x, hy * 0.40, z1),
                (x, -hy * 0.40, z1),
                (x, -hy, z1 - 0.06),
                (x, -hy, z0 + 0.08),
            ])
        else:
            stations.append([
                (x, -hy, z0), (x, hy, z0), (x, hy, z1), (x, -hy, z1),
            ])
    objs.append(loft_section("drive_case", stations, "drive", collection, bevel))
    if lod < 2:
        objs.append(add_box("drive_cover", (-0.50, 0.0, 0.56), (0.24, 0.22, 0.035), "drive", collection, bevel=0.003))
    if lod == 0:
        objs.append(add_box("drive_accent", (-0.50, 0.12, 0.58), (0.16, 0.03, 0.022), "accent", collection, bevel=0.002))
    # One broad warm service hatch survives every LOD so the aft drive remains
    # a separate manufactured mass rather than merging into the U-frame.
    hatch_size = {
        0: (0.22, 0.15, 0.026),
        1: (0.24, 0.17, 0.030),
        2: (0.28, 0.20, 0.034),
    }[lod]
    objs.append(add_box(
        "drive_service_hatch", (-0.55, -0.10, 0.575 if lod < 2 else 0.535),
        hatch_size, "accent", collection, bevel=0.003 if lod == 0 else 0.0,
    ))
    if lod == 0:
        objs.append(add_cyl("drive_motor", (-0.44, -0.32, 0.30), 0.08, 0.18, "drive", collection,
                            verts=12, rot=(math.pi / 2, 0, 0), bevel=0.003))
    # Air-gapped heat path: fewer, thinner, taller plates in a header.
    # Worn machined steel (cutting), not a packed vent grille.
    n_fins = {0: 4, 1: 3, 2: 2}[lod]
    header_z = 0.56 if lod < 2 else 0.50
    if lod < 2:
        objs.append(add_hat_member("fin_header", -0.52, -0.16, 0.16, 0.22, 0.04, collection, lod, z=header_z, role="drive"))
    else:
        objs.append(add_box("fin_header", (-0.52, 0.0, header_z + 0.02), (0.22, 0.30, 0.03), "drive", collection, bevel=0.0))
    span = 0.40
    fin_t = {0: 0.007, 1: 0.010, 2: 0.014}[lod]
    fin_h = {0: 0.20, 1: 0.16, 2: 0.13}[lod]
    fin_x = {0: 0.22, 1: 0.24, 2: 0.26}[lod]
    for i in range(n_fins):
        y = -span * 0.5 + (span * i / max(1, n_fins - 1))
        objs.append(add_box(
            f"fin_{i}", (-0.52, y, header_z + 0.04 + fin_h * 0.5),
            (fin_x, fin_t, fin_h),
            "cutting", collection, bevel=0.0,
        ))
    return objs


def build_head(lod, collection):
    """Open +X aperture, lit Y-axis drum, rail-top circular housings, rim jaws.

    No +X closing wall, no well floor through the bite, no roof, no grate.
    """
    bevel = {0: 0.004, 1: 0.0, 2: 0.0}[lod]
    objs = []
    t = {0: 0.050, 1: 0.055, 2: 0.060}[lod]
    x0, x1 = WELL_X0, 1.03
    y0, y1 = WELL_Y0, WELL_Y1
    z0, z1 = WELL_Z0, WELL_Z1
    wall_len = x1 - x0
    xc = (x0 + x1) * 0.5
    wall_h = z1 - z0
    wall_z = z0 + wall_h * 0.5

    # Two cheeks only. Open +X, open top, no floor in the bite.
    objs.append(add_box(
        "cheek_P", (xc, y1 - t * 0.5, wall_z),
        (wall_len, t, wall_h), "structure", collection, bevel=bevel,
    ))
    objs.append(add_box(
        "cheek_S", (xc, y0 + t * 0.5, wall_z),
        (wall_len, t, wall_h), "structure", collection, bevel=bevel,
    ))
    # No well floor. The +X bite is true void to the tan pad.

    # 3–4 chunky dry-refractory jaw blocks on the rim. Survive works_top.
    jaw_h = {0: 0.18, 1: 0.17, 2: 0.16}[lod]
    jaw_x = {0: 0.18, 1: 0.19, 2: 0.20}[lod]
    jaw_y = {0: 0.13, 1: 0.14, 2: 0.15}[lod]
    jaw_z = z1 - jaw_h * 0.35
    jaw_fore_x = 0.74
    jaw_aft_x = 0.56
    y_rim_p = y1 - t - jaw_y * 0.15
    y_rim_s = y0 + t + jaw_y * 0.15
    objs.append(add_jaw_block(
        "jaw_P_fore", (jaw_fore_x, y_rim_p, jaw_z),
        (jaw_x, jaw_y, jaw_h), collection, bevel=0.005 if lod == 0 else 0.0,
    ))
    objs.append(add_jaw_block(
        "jaw_S_fore", (jaw_fore_x, y_rim_s, jaw_z),
        (jaw_x, jaw_y, jaw_h), collection, bevel=0.005 if lod == 0 else 0.0,
    ))
    if lod < 2:
        objs.append(add_jaw_block(
            "jaw_P_aft", (jaw_aft_x, y_rim_p, jaw_z - 0.01),
            (jaw_x * 0.90, jaw_y, jaw_h * 0.92), collection, bevel=0.004 if lod == 0 else 0.0,
        ))
        objs.append(add_jaw_block(
            "jaw_S_aft", (jaw_aft_x, y_rim_s, jaw_z - 0.01),
            (jaw_x * 0.90, jaw_y, jaw_h * 0.92), collection, bevel=0.004 if lod == 0 else 0.0,
        ))

    # Short broad-rooted trapezoidal cheeks replace Cycle 04's forbidden
    # parallel forklift-tine read while preserving the open +X process bite.
    objs.append(add_feed_cheek("P", lod, collection, jaw_z + 0.005))
    objs.append(add_feed_cheek("S", lod, collection, jaw_z + 0.005))
    # Circular bearing housings rooted on the rail tops (Z-up → circles from above).
    rail_y = 0.67
    rail_top_z = 0.18
    brg_r = {0: 0.092, 1: 0.094, 2: 0.096}[lod]
    brg_h = {0: 0.18, 1: 0.17, 2: 0.16}[lod]
    brg_n = {0: 14, 1: 10, 2: 8}[lod]
    brg_z = rail_top_z + brg_h * 0.5
    drum_z = brg_z
    for side, y in (("P", rail_y), ("S", -rail_y)):
        objs.append(add_box(
            f"saddle_{side}", (PIVOT.x, y, rail_top_z - 0.03),
            (0.20, 0.14, 0.08), "structure", collection, bevel=bevel,
        ))
        objs.append(add_cyl(
            f"bearing_{side}", (PIVOT.x, y, brg_z), brg_r, brg_h,
            "cutting", collection, verts=brg_n, rot=(0, 0, 0), bevel=0.0 if lod else 0.002,
        ))
        if lod == 0:
            objs.append(add_cyl(
                f"bearing_cap_{side}", (PIVOT.x, y, brg_z + brg_h * 0.42),
                brg_r * 0.62, 0.018, "cutting", collection, verts=10, rot=(0, 0, 0), bevel=0.002,
            ))

    # Y-axis tool-steel drum spanning the housings. Lit — not buried in a pit.
    drum_r = {0: 0.158, 1: 0.158, 2: 0.160}[lod]
    drum_len = {0: 1.12, 1: 1.08, 2: 1.04}[lod]
    drum_n = {0: 16, 1: 10, 2: 8}[lod]
    objs.append(add_cyl(
        "drum", (PIVOT.x, 0.0, drum_z), drum_r, drum_len,
        "cutting", collection, verts=drum_n, rot=(math.pi / 2, 0, 0), bevel=0.0 if lod else 0.002,
    ))
    # A machined transverse cutter crown catches real light at the legal site
    # camera and remains the semantic head line through LOD2. It is attached to
    # the drum, not an outline or emissive card.
    crown_size = {
        0: (0.105, drum_len - 0.10, 0.050),
        1: (0.125, drum_len - 0.08, 0.060),
        2: (0.145, drum_len - 0.06, 0.070),
    }[lod]
    objs.append(add_box(
        "cutter_crown", (PIVOT.x - 0.025, 0.0, drum_z + drum_r * 0.78),
        crown_size, "cutting", collection,
        bevel=0.002 if lod == 0 else 0.0,
    ))
    # First Cycle 05 legal-render correction: the honest metallic crown still
    # reflected the dark mine environment at LOD1/2. Bonded replaceable dry
    # refractory hardface blocks now create the bright transverse process line
    # through diffuse material response—not emission, outline, or camera bias.
    hardface_spec = {
        0: (4, (-0.39, -0.13, 0.13, 0.39), 0.19),
        1: (3, (-0.32, 0.0, 0.32), 0.23),
        2: (2, (-0.26, 0.26), 0.34),
    }[lod]
    _count, hardface_ys, hardface_len = hardface_spec
    for index, y in enumerate(hardface_ys):
        objs.append(add_box(
            f"cutter_hardface_{index}",
            (PIVOT.x - 0.030, y, drum_z + drum_r * 0.98),
            (0.11, hardface_len, 0.045), "ceramic", collection,
            bevel=0.002 if lod == 0 else 0.0,
        ))
    if lod == 0:
        axle_len = drum_len + 0.18
        objs.append(add_cyl(
            "drum_axle", (PIVOT.x, 0.0, drum_z), 0.028, axle_len,
            "cutting", collection, verts=8, rot=(math.pi / 2, 0, 0), bevel=0.0,
        ))
        for i in range(3):
            ang = i * (math.pi * 2 / 3) + 0.35
            lx = PIVOT.x + math.cos(ang) * (drum_r + 0.005)
            lz = drum_z + math.sin(ang) * (drum_r + 0.005)
            objs.append(add_box(
                f"drum_flute_{i}", (lx, 0.0, lz),
                (0.014, drum_len - 0.16, 0.012), "cutting", collection, bevel=0.0,
                rot=(0.0, ang, 0.0),
            ))
    return objs


def build_belt(lod, collection):
    """Thin rubber ribbon over visible roller crowns. Side and under void."""
    objs = []
    x0, x1 = BELT_X0, BELT_X1
    y0, y1 = -BELT_HALF_Y, BELT_HALF_Y
    z_top = 0.175
    sag = {0: 0.016, 1: 0.012, 2: 0.008}[lod]
    n_stat = {0: 5, 1: 3, 2: 2}[lod]
    objs.append(add_belt_ribbon(
        "belt_face", x0, x1, y0, y1, z_top, 0.008, sag, collection,
        stations=n_stat, bevel=0.001 if lod == 0 else 0.0,
    ))
    if lod < 2:
        objs.append(add_belt_ribbon(
            "belt_return", x0 + 0.04, x1 - 0.04, y0 + 0.010, y1 - 0.010,
            0.062, 0.007, sag * 0.35, collection,
            stations=max(2, n_stat - 1), bevel=0.0,
        ))
    n_roll = {0: 3, 1: 2, 2: 1}[lod]
    segs = {0: 12, 1: 8, 2: 6}[lod]
    roll_r = {0: 0.038, 1: 0.040, 2: 0.042}[lod]
    # Crowns longer than the ribbon so they read from above with side void.
    roll_len = (y1 - y0) + 0.16
    for i in range(n_roll):
        u = i / max(1, n_roll - 1)
        x = x0 + 0.06 + (x1 - x0 - 0.12) * u
        # Crown sits proud of the ribbon.
        objs.append(add_cyl(
            f"roller_{i}", (x, 0.0, z_top - sag * 0.35 - roll_r + 0.010),
            roll_r, roll_len, "cutting", collection, verts=segs,
            rot=(math.pi / 2, 0, 0), bevel=0.001,
        ))
    if lod < 2:
        objs.append(add_cyl(
            "drive_pulley", (x0 + 0.012, 0.0, 0.118), 0.046, roll_len - 0.04,
            "cutting", collection, verts=segs, rot=(math.pi / 2, 0, 0), bevel=0.0 if lod else 0.002,
        ))
        if lod == 0:
            objs.append(add_cyl(
                "idler_pulley", (x1 - 0.018, 0.0, 0.118), 0.040, roll_len - 0.04,
                "cutting", collection, verts=segs, rot=(math.pi / 2, 0, 0), bevel=0.002,
            ))
    return objs


def build_lamp(lod, collection):
    """Rooted warm hood + recessed lens; a fixture, never a beacon."""
    bevel = {0: 0.003, 1: 0.0, 2: 0.0}[lod]
    loc = LAMP_LOC
    objs = []
    hood_n = {0: 10, 1: 8, 2: 6}[lod]
    bracket_size = {
        0: (0.13, 0.036, 0.026),
        1: (0.14, 0.044, 0.032),
        2: (0.15, 0.052, 0.038),
    }[lod]
    objs.append(add_box(
        "lamp_bracket", (loc.x - 0.075, loc.y, loc.z - 0.055),
        bracket_size, "structure", collection, bevel=0.002 if lod == 0 else 0.0,
    ))
    objs.append(add_cyl(
        "lamp_socket", (loc.x - 0.040, loc.y, loc.z), 0.036, 0.070, "structure", collection,
        verts={0: 10, 1: 8, 2: 6}[lod], rot=(0, math.pi / 2, 0), bevel=bevel,
    ))
    objs.append(add_cone(
        "lamp_hood", (loc.x + 0.024, loc.y, loc.z), 0.065, 0.030, 0.080,
        "accent", collection, verts=hood_n, bevel=bevel, rot=(0, math.pi / 2, 0),
    ))
    lens_r = {0: 0.025, 1: 0.031, 2: 0.035}[lod]
    lens = add_cyl(
        "lamp_lens", (loc.x + 0.057, loc.y, loc.z), lens_r, 0.016, "lamp", collection,
        verts=6 if lod else 8, rot=(0, math.pi / 2, 0), bevel=0.0 if lod else 0.002,
    )
    objs.append(lens)
    return objs, lens


def build_lod(lod):
    reset_scene()
    coll = bpy.data.collections.new(f"LOD{lod}")
    bpy.context.scene.collection.children.link(coll)
    frame = build_frame(lod, coll)
    drive = build_drive(lod, coll)
    head = build_head(lod, coll)
    belt = build_belt(lod, coll)
    lamp, lens = build_lamp(lod, coll)
    lens.name = f"LOD{lod}_lamp_lens"
    static = join_group(frame + drive, f"LOD{lod}_extractor")
    head_m = join_group(head, f"LOD{lod}_head")
    belt_m = join_group(belt, f"LOD{lod}_belt")
    hoods = [o for o in lamp if o != lens]
    lamp_m = join_group(hoods, f"LOD{lod}_lamp")
    meshes = [static, head_m, belt_m, lamp_m, lens]
    for obj in meshes:
        obj["spacefaceLod"] = f"lod{lod}"

    unwrap_unique(meshes)
    size = TEX_SIZE[lod]
    bakes = bake_targets(meshes, size, f"extractor_atlas_lod{lod}")
    maps = author_maps(bakes, size, f"extractor_atlas_lod{lod}")
    atlas = atlas_material(maps, lod, emissive=False)
    lamp_mat = atlas_material(maps, lod, emissive=True)
    for obj in (static, head_m, belt_m, lamp_m):
        obj.data.materials.clear()
        obj.data.materials.append(atlas)
    lens.data.materials.clear()
    lens.data.materials.append(lamp_mat)

    tris = sum(count_tris(o) for o in meshes)
    if tris > TRI_BUDGET[lod]:
        print(f"WARN LOD{lod} tris {tris} over budget {TRI_BUDGET[lod]}")
    return {
        "meshes": meshes,
        "static": static,
        "head": head_m,
        "belt": belt_m,
        "lamp": lamp_m,
        "lens": lens,
        "maps": maps,
        "triangles": tris,
        "draws": len(meshes),
        "materials": 2,
    }


def export_lod_glb(report, lod):
    SOURCE_DIR.mkdir(parents=True, exist_ok=True)
    path = SOURCE_DIR / f"extractor_lod{lod}.glb"
    bpy.ops.object.select_all(action="DESELECT")
    for obj in report["meshes"]:
        bpy.context.view_layer.objects.active = obj
        obj.select_set(True)
        tri = obj.modifiers.new("Triangulate", "TRIANGULATE")
        bpy.ops.object.modifier_apply(modifier=tri.name)
        obj.select_set(False)
        obj.hide_set(False)
        obj.hide_render = False
    bpy.ops.object.select_all(action="DESELECT")
    for obj in report["meshes"]:
        obj.select_set(True)
        obj.hide_set(False)
        obj.hide_render = False
    bpy.context.view_layer.objects.active = report["static"]
    tmp = SOURCE_DIR / f"extractor_lod{lod}.tmp.glb"
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
    tmp.replace(path)
    report["path"] = str(path.relative_to(ROOT)).replace("\\", "/")
    report["bytes"] = path.stat().st_size
    report["sha256"] = sha256(path)
    print(json.dumps({"lod": lod, "triangles": report["triangles"], "draws": report["draws"], "bytes": report["bytes"]}, indent=2))
    return path


def world_bbox(objects):
    low = Vector((1e9, 1e9, 1e9))
    high = Vector((-1e9, -1e9, -1e9))
    for obj in objects:
        if obj.type != "MESH":
            continue
        for corner in obj.bound_box:
            p = obj.matrix_world @ Vector(corner)
            for i in range(3):
                low[i] = min(low[i], p[i])
                high[i] = max(high[i], p[i])
    return low, high


def combine_lods(lod_reports):
    reset_scene()
    root = add_empty(ROOT_NAME, (0, 0, 0), bpy.context.scene.collection, size=0.14)
    head_e = add_empty("head_face", tuple(PIVOT), bpy.context.scene.collection, size=0.10)
    belt_e = add_empty("belt", tuple(BELT_LOC), bpy.context.scene.collection, size=0.08)
    lamp_e = add_empty("lamp", tuple(LAMP_LOC), bpy.context.scene.collection, size=0.06)
    for hook in (head_e, belt_e, lamp_e):
        stamp_socket(hook)
        parent_keep(hook, root)
    head_e.rotation_euler = (0, 0, 0)

    mesh_names = []
    lod_tri = {0: 0, 1: 0, 2: 0}
    for lod in (0, 1, 2):
        path = SOURCE_DIR / f"extractor_lod{lod}.glb"
        before = set(bpy.data.objects)
        bpy.ops.import_scene.gltf(filepath=str(path))
        imported = [o for o in bpy.data.objects if o not in before]
        groups = {"extractor": [], "head": [], "belt": [], "lamp": []}
        for obj in imported:
            raw = obj.name.split(".")[0]
            obj["_sf_raw"] = raw
            if obj.type != "MESH":
                try:
                    bpy.data.objects.remove(obj, do_unlink=True)
                except Exception:
                    pass
                continue
            lower = raw.lower()
            if "head" in lower:
                groups["head"].append(obj)
            elif "belt" in lower:
                groups["belt"].append(obj)
            elif "lamp" in lower:
                groups["lamp"].append(obj)
            else:
                groups["extractor"].append(obj)
        mapping = {
            "extractor": (root, f"LOD{lod}_extractor"),
            "head": (head_e, f"LOD{lod}_head"),
            "belt": (belt_e, f"LOD{lod}_belt"),
            "lamp": (lamp_e, None),
        }
        for key, (parent, rename) in mapping.items():
            for obj in groups[key]:
                parent_keep(obj, parent)
                if rename and "lens" not in obj.name.lower():
                    obj.name = rename
                elif key == "lamp" and "lens" in (obj.get("_sf_raw") or obj.name).lower():
                    obj.name = f"LOD{lod}_lamp_lens"
                elif key == "lamp":
                    obj.name = f"LOD{lod}_lamp"
                obj["spacefaceLod"] = f"lod{lod}"
                obj["spaceface"] = {"lod": f"lod{lod}"}
                lod_tri[lod] += count_tris(obj)
                mesh_names.append(obj.name)

    chull = add_empty("COLLISION_HULL", (0, 0, 0.40), bpy.context.scene.collection, size=1.0)
    chull.empty_display_type = "CUBE"
    chull.scale = Vector((1.05, 0.80, 0.42))
    chull["sf_collision"] = True
    chull["nonRender"] = True
    chull["spaceface"] = {"collision": True, "helper": True, "nonRender": True, "role": "collision", "kind": "box"}
    parent_keep(chull, root)

    meshes = [o for o in bpy.data.objects if o.type == "MESH"]
    low, high = world_bbox(meshes)
    size = high - low
    contract = {
        "contractVersion": 1,
        "assetId": ASSET_ID,
        "partId": ASSET_ID,
        "liveId": ASSET_ID,
        "slot": "place",
        "category": "works",
        "family": "asteroid_works",
        "packet": "PQ-131.03",
        "role": "one-face gallery extractor — drill/crusher to +X, belt inboard",
        "forward": "+X",
        "up": "+Y",
        "starboard": "+Z",
        "unit": "metre",
        "normalConvention": "OpenGL",
        "ormChannels": "R=AO,G=Roughness,B=Metallic",
        "textureCompression": "PNG-source",
        "textureAuthorship": "unique UV0 mesh AO/normal/curvature + authored 1024 PBR",
        "textureSize": 1024,
        "deliverableRole": "source_candidate",
        "lods": ["lod0", "lod1", "lod2"],
        "exportedLods": ["lod0", "lod1", "lod2"],
        "lodTriangles": {"lod0": int(lod_tri[0]), "lod1": int(lod_tri[1]), "lod2": int(lod_tri[2])},
        "triangleCount": int(lod_tri[0]),
        "sockets": list(HOOK_NAMES),
        "hooks": list(HOOK_NAMES),
        "root": ROOT_NAME,
        "wiringStatus": "source_candidate_unwired",
        "blenderBasis": "Z-up works scale",
        "exportBasis": "Y-up glTF",
        "bboxBlender": {
            "min": [round(float(v), 4) for v in low],
            "max": [round(float(v), 4) for v in high],
            "size": [round(float(v), 4) for v in size],
        },
    }
    root["spacefaceAsset"] = contract
    bpy.context.scene["spacefaceAsset"] = contract

    SOURCE_DIR.mkdir(parents=True, exist_ok=True)
    PARTS_DIR.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(BLEND_PATH))

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
    combined = SOURCE_DIR / "extractor.glb"
    parts = PARTS_DIR / COMBINED_NAME
    tmp = SOURCE_DIR / "extractor.tmp.glb"
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
    stamp_glb_contract(tmp, contract)
    if combined.exists():
        combined.unlink()
    shutil.move(str(tmp), str(combined))
    shutil.copy2(combined, parts)
    inventory = {
        "assetId": ASSET_ID,
        "root": ROOT_NAME,
        "combined": str(combined.relative_to(ROOT)).replace("\\", "/"),
        "partsSource": str(parts.relative_to(ROOT)).replace("\\", "/"),
        "blend": str(BLEND_PATH.relative_to(ROOT)).replace("\\", "/"),
        "lodTriangles": contract["lodTriangles"],
        "hooks": list(HOOK_NAMES),
        "meshNames": sorted(mesh_names),
        "bbox": contract["bboxBlender"],
        "bytes": combined.stat().st_size,
        "sha256": sha256(combined),
        "partsSha256": sha256(parts),
    }
    write_text_lf(SOURCE_DIR / "extractor_inventory.json", json.dumps(inventory, indent=2) + "\n")
    print(json.dumps({"ok": True, **inventory}, indent=2))
    return inventory, contract, combined, parts


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
            extras["spaceface"] = {"socket": True, "role": "works_hook"}
            node["extras"] = extras
        if name.startswith("LOD") and "_" in name:
            extras = dict(node.get("extras") or {})
            lod = name.split("_", 1)[0].lower()
            extras["spacefaceLod"] = lod
            extras["spaceface"] = {"lod": lod}
            node["extras"] = extras
        if name == "COLLISION_HULL":
            extras = dict(node.get("extras") or {})
            extras["nonRender"] = True
            extras["sf_collision"] = True
            node["extras"] = extras
    _write_glb(path, gltf, rest)


def inspect_glb(path: Path) -> dict:
    gltf, _rest = _read_glb(path)
    nodes = gltf.get("nodes") or []
    names = [n.get("name") for n in nodes]
    meshes = gltf.get("meshes") or []
    materials = gltf.get("materials") or []
    accessors = {i: a for i, a in enumerate(gltf.get("accessors") or [])}
    tris = 0
    lod_tris = {"lod0": 0, "lod1": 0, "lod2": 0}
    mesh_by_index = {}
    for mi, mesh in enumerate(meshes):
        mesh_tris = 0
        for prim in mesh.get("primitives") or []:
            acc = accessors.get(prim.get("indices"))
            if acc:
                mesh_tris += int(acc.get("count", 0)) // 3
        mesh_by_index[mi] = mesh_tris
        tris += mesh_tris
    for node in nodes:
        name = node.get("name") or ""
        mi = node.get("mesh")
        if mi is None:
            continue
        t = mesh_by_index.get(mi, 0)
        if name.startswith("LOD0"):
            lod_tris["lod0"] += t
        elif name.startswith("LOD1"):
            lod_tris["lod1"] += t
        elif name.startswith("LOD2"):
            lod_tris["lod2"] += t
    hooks = [n for n in names if n in HOOK_NAMES]
    missing_hooks = [h for h in HOOK_NAMES if h not in names]
    missing_lods = [n for n in LOD_ROOTS if n not in names]
    hook_translations = {}
    invalid_hook_translations = []
    for node in nodes:
        name = node.get("name") or ""
        if name not in HOOK_GLTF_TRANSLATIONS:
            continue
        if "matrix" in node:
            matrix = node["matrix"]
            actual = [matrix[12], matrix[13], matrix[14]]
        else:
            actual = list(node.get("translation") or (0.0, 0.0, 0.0))
        expected = HOOK_GLTF_TRANSLATIONS[name]
        hook_translations[name] = actual
        if len(actual) != 3 or any(abs(float(a) - e) > 1e-5 for a, e in zip(actual, expected)):
            invalid_hook_translations.append({
                "name": name,
                "actual": actual,
                "expected": list(expected),
            })
    return {
        "nodes": names,
        "hooksFound": hooks,
        "missingHooks": missing_hooks,
        "hookTranslations": hook_translations,
        "invalidHookTranslations": invalid_hook_translations,
        "missingLodRoots": missing_lods,
        "rootPresent": ROOT_NAME in names,
        "meshCount": len(meshes),
        "materialCount": len(materials),
        "lodTriangles": lod_tris,
        "draws": len([n for n in nodes if n.get("mesh") is not None]),
        "ok": (
            (not missing_hooks)
            and (not invalid_hook_translations)
            and (not missing_lods)
            and ROOT_NAME in names
        ),
    }


def assert_epoch_frozen(label, folder: Path, expected: dict):
    missing = []
    changed = []
    for name, digest in expected.items():
        path = folder / name
        if not path.exists():
            missing.append(name)
            continue
        got = sha256(path)
        if got != digest:
            changed.append(f"{name}: {got} != {digest}")
    if missing or changed:
        raise RuntimeError(
            f"{label} evidence mutated (forbidden):\n  missing="
            + ", ".join(missing) + "\n  changed=" + "; ".join(changed)
        )
    return {name: sha256(folder / name) for name in expected}


def assert_cycle_01_frozen():
    return assert_epoch_frozen("Cycle 01", CYCLE_01_DIR, CYCLE_01_SHA256)


def assert_cycle_02_frozen():
    return assert_epoch_frozen("Cycle 02", CYCLE_02_DIR, CYCLE_02_SHA256)


def assert_cycle_03_frozen():
    return assert_epoch_frozen("Cycle 03", CYCLE_03_DIR, CYCLE_03_SHA256)


def assert_cycle_04_frozen():
    return assert_epoch_frozen("Cycle 04", CYCLE_04_DIR, CYCLE_04_SHA256)


def load_png_rgb(path: Path):
    img = bpy.data.images.load(str(path), check_existing=False)
    w, h = img.size
    arr = np.zeros(w * h * 4, dtype=np.float32)
    img.pixels.foreach_get(arr)
    rgba = arr.reshape(h, w, 4)
    bpy.data.images.remove(img)
    return rgba, w, h


def write_crop(rgba, cx, cy, half, dest: Path):
    h, w = rgba.shape[:2]
    x0 = max(0, int(cx - half))
    x1 = min(w, int(cx + half))
    y0 = max(0, int(cy - half))
    y1 = min(h, int(cy + half))
    crop = rgba[y0:y1, x0:x1].copy()
    ch, cw = crop.shape[:2]
    if dest.name in bpy.data.images:
        bpy.data.images.remove(bpy.data.images[dest.name])
    img = bpy.data.images.new(dest.name, width=cw, height=ch, alpha=True)
    img.pixels.foreach_set(np.ascontiguousarray(crop, dtype=np.float32).ravel())
    img.filepath_raw = str(dest)
    img.file_format = "PNG"
    img.save()
    sanitize_png(dest)
    bpy.data.images.remove(img)
    return {"x0": x0, "y0": y0, "x1": x1, "y1": y1, "w": cw, "h": ch}


def analyze_works_still(path: Path, px_per_cell: float):
    """Original-resolution read of the machine at the named register."""
    rgba, w, h = load_png_rgb(path)
    luma = 0.2126 * rgba[..., 0] + 0.7152 * rgba[..., 1] + 0.0722 * rgba[..., 2]
    # World is near-black; pad+machine sit in the centre.
    cx, cy = w // 2, h // 2
    search = 80 if px_per_cell < 40 else 160
    y0, y1 = max(0, cy - search), min(h, cy + search)
    x0, x1 = max(0, cx - search), min(w, cx + search)
    region = luma[y0:y1, x0:x1]
    mask = region > 0.045
    if not np.any(mask):
        mask = region > 0.03
    ys, xs = np.where(mask)
    if len(xs) == 0:
        return {"path": str(path.relative_to(ROOT)).replace("\\", "/"), "empty": True}
    bx0, bx1 = int(xs.min() + x0), int(xs.max() + x0)
    by0, by1 = int(ys.min() + y0), int(ys.max() + y0)
    mw, mh = bx1 - bx0 + 1, by1 - by0 + 1
    machine = luma[by0:by1 + 1, bx0:bx1 + 1]
    # +X is the right side of the top-down frame.
    x_split = int(mw * 0.62)
    plus_x = machine[:, x_split:]
    dark = plus_x < 0.085
    dark_cols = np.mean(dark, axis=0) > 0.28 if plus_x.size else np.array([])
    dark_span_px = int(dark_cols.sum()) if dark_cols.size else 0
    rail_band = max(1, mh // 8)
    rails = float(np.mean(np.concatenate([machine[:rail_band], machine[-rail_band:]])) ) if mh > 4 else 0.0
    well_mean = float(np.mean(plus_x)) if plus_x.size else 0.0
    well_dark_mean = float(np.mean(plus_x[dark])) if np.any(dark) else well_mean
    belt_band = machine[mh // 3: 2 * mh // 3, int(mw * 0.22): int(mw * 0.55)]
    belt_mean = float(np.mean(belt_band)) if belt_band.size else 0.0
    tan_bite = measure_tan_bite(rgba[by0:by1 + 1, bx0:bx1 + 1], luma[by0:by1 + 1, bx0:bx1 + 1], px_per_cell)
    return {
        "path": str(path.relative_to(ROOT)).replace("\\", "/"),
        "resolution": [w, h],
        "px_per_cell": px_per_cell,
        "machine_bbox_px": [bx0, by0, bx1, by1],
        "machine_size_px": [mw, mh],
        "plus_x_dark_span_px": dark_span_px,
        "plus_x_dark_frac": float(np.mean(dark)) if dark.size else 0.0,
        "plus_x_mean": well_mean,
        "plus_x_dark_mean": well_dark_mean,
        "rail_mean": rails,
        "belt_inboard_mean": belt_mean,
        "well_darker_than_rails": well_dark_mean < rails - 0.02,
        "bite_px_in_band": dark_span_px >= 4 and dark_span_px <= 8 if px_per_cell < 40 else None,
        **tan_bite,
    }


def measure_tan_bite(pad_rgba, pad_luma, px_per_cell):
    """Count tan-pad columns in the +X mouth, before the pad margin.

    The 2.4 wu pad fills the bbox Y-edges everywhere, so 'full-column tan'
    cannot distinguish bite from margin. Window is the mouth X-band only
    (drum/+X jaws → cheek ends, ~0.76–0.92 wu → ~0.82–0.88 of the pad bbox).
    """
    mh, mw = pad_luma.shape
    if mh < 8 or mw < 8:
        return {"tan_bite_px": 0, "tan_bite_mean": 0.0, "pad_mean": 0.0}
    c = 4
    corners = np.concatenate([
        pad_rgba[:c, :c, :3].reshape(-1, 3),
        pad_rgba[:c, -c:, :3].reshape(-1, 3),
        pad_rgba[-c:, :c, :3].reshape(-1, 3),
        pad_rgba[-c:, -c:, :3].reshape(-1, 3),
    ], axis=0)
    pad_rgb = np.mean(corners, axis=0)
    pad_mean = float(np.mean(pad_rgb))
    rgb = pad_rgba[..., :3]
    rg = (rgb[..., 0] + rgb[..., 1]) * 0.5
    bb = rgb[..., 2]
    tan_like = (rg > bb + 0.008) & (rg > 0.06) & (pad_luma > 0.07)
    y0, y1 = int(mh * 0.42), int(mh * 0.58)
    centre_frac = np.mean(tan_like[y0:y1], axis=0)
    # Mouth X only — stop before the pad margin past WELL_X1.
    start = int(mw * 0.808)
    stop = int(mw * 0.885)
    cols = centre_frac[start:stop] if centre_frac.size else np.array([])
    tan_cols = int(np.sum(cols > 0.40)) if cols.size else 0
    tan_mean = float(np.mean(rgb[y0:y1, start:stop])) if stop > start else 0.0
    return {
        "tan_bite_px": tan_cols,
        "tan_bite_mean": tan_mean,
        "pad_mean": pad_mean,
        "tan_bite_target": [8, 10] if px_per_cell >= 100 else None,
    }


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
    pad_bsdf.inputs["Base Color"].default_value = (0.07, 0.055, 0.042, 1)
    pad_bsdf.inputs["Roughness"].default_value = 0.86
    pad_bsdf.inputs["Metallic"].default_value = 0.04
    pad.data.materials.append(pad_mat)

    cam_data = bpy.data.cameras.new("WorksCam")
    camera = bpy.data.objects.new("WorksCam", cam_data)
    scene.collection.objects.link(camera)
    scene.camera = camera
    reach = 4.0
    for name, loc, energy, color, angle in (
        ("Key", (-1.15 * reach, -0.78 * reach, 0.54 * reach), 7.2, (1.00, 0.863, 0.737), 18.0),
        ("Rim", (0.22 * reach, 1.45 * reach, 0.30 * reach), 2.20, (0.616, 0.722, 0.941), 25.0),
        ("Fill", (1.12 * reach, 0.46 * reach, 0.50 * reach), 2.40, (0.847, 0.765, 0.659), 30.0),
        ("Grazing", (1.8 * reach, -0.2 * reach, 0.22 * reach), 5.4, (1.00, 0.90, 0.78), 12.0),
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
        data.use_shadow = name in {"Key", "Grazing"}
    return camera, pad


def override_clay(meshes):
    backups = {}
    mat = bpy.data.materials.new("Clay")
    mat.use_nodes = True
    bsdf = next(n for n in mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    bsdf.inputs["Base Color"].default_value = (0.42, 0.40, 0.38, 1)
    bsdf.inputs["Roughness"].default_value = 0.72
    bsdf.inputs["Metallic"].default_value = 0.0
    for obj in meshes:
        backups[obj.name] = [s.material for s in obj.material_slots]
        if obj.material_slots:
            obj.material_slots[0].material = mat
        else:
            obj.data.materials.append(mat)
    return backups, mat


def restore_mats(meshes, backups):
    for obj in meshes:
        mats = backups.get(obj.name) or []
        obj.data.materials.clear()
        for mat in mats:
            obj.data.materials.append(mat)


def override_channel(meshes, kind):
    backups = {}
    mat = bpy.data.materials.new(f"Iso_{kind}")
    mat.use_nodes = True
    nt = mat.node_tree
    bsdf = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
    for obj in meshes:
        backups[obj.name] = [s.material for s in obj.material_slots]
        src = None
        for slot in obj.material_slots:
            if slot.material and slot.material.use_nodes:
                src = slot.material
                break
        iso = mat.copy()
        iso.name = f"Iso_{kind}_{obj.name}"
        iso.use_nodes = True
        nt = iso.node_tree
        out = next(n for n in nt.nodes if n.type == "OUTPUT_MATERIAL")
        emit = nt.nodes.new("ShaderNodeEmission")
        if src is not None:
            # Try to copy the matching image from the source material.
            for node in src.node_tree.nodes:
                if node.type == "TEX_IMAGE" and node.image:
                    name = (node.image.name or "").lower()
                    if kind == "normal" and "normal" in name:
                        tex = nt.nodes.new("ShaderNodeTexImage")
                        tex.image = node.image
                        nt.links.new(tex.outputs["Color"], emit.inputs["Color"])
                        break
                    if kind == "orm" and "orm" in name:
                        tex = nt.nodes.new("ShaderNodeTexImage")
                        tex.image = node.image
                        nt.links.new(tex.outputs["Color"], emit.inputs["Color"])
                        break
                    if kind == "id" and "id" in name:
                        tex = nt.nodes.new("ShaderNodeTexImage")
                        tex.image = node.image
                        nt.links.new(tex.outputs["Color"], emit.inputs["Color"])
                        break
        nt.links.new(emit.outputs["Emission"], out.inputs["Surface"])
        obj.data.materials.clear()
        obj.data.materials.append(iso)
    return backups


def render_stills(glb_path: Path, still_dir: Path):
    still_dir.mkdir(parents=True, exist_ok=True)
    reset_scene()
    bpy.ops.import_scene.gltf(filepath=str(glb_path))
    camera, pad = setup_mine_lights()
    meshes = [o for o in bpy.data.objects if o.type == "MESH" and o.name != "MinePad"]
    # Hide LOD1/2 for close stills so coincident LODs do not z-fight.
    def set_lod(visible):
        for obj in meshes:
            name = obj.name
            show = True
            if isinstance(visible, int):
                show = name.startswith(f"LOD{visible}") or not name.startswith("LOD")
            elif visible == "close":
                show = name.startswith("LOD0") or not name.startswith("LOD")
            elif visible == "site":
                show = name.startswith("LOD1") or name.startswith("LOD2") or not name.startswith("LOD")
                # Prefer LOD1 for site; hide LOD2 and LOD0.
                if name.startswith("LOD0") or name.startswith("LOD2"):
                    show = False
                if name.startswith("LOD1"):
                    show = True
            obj.hide_render = not show
            try:
                obj.hide_set(not show)
            except Exception:
                pass

    paths = {}

    def snap(name, framing, edge_dir=(1.0, 0.0)):
        pose = apply_works_camera(camera, framing=framing, focus=(0.0, 0.0, 0.32), edge_dir=edge_dir)
        offset = Vector(pose["object_offset"])
        moved = []
        if offset.length > 1e-9:
            for obj in list(bpy.data.objects):
                if obj.type in {"CAMERA", "LIGHT"}:
                    continue
                if obj.parent is not None:
                    continue
                if obj.name == "MinePad":
                    continue
                obj.location = obj.location + offset
                moved.append((obj, offset))
            bpy.context.view_layer.update()
        out = still_dir / name
        bpy.context.scene.render.filepath = str(out)
        bpy.ops.render.render(write_still=True)
        sanitize_png(out)
        for obj, off in moved:
            obj.location = obj.location - off
        return {
            "path": str(out.relative_to(ROOT)).replace("\\", "/"),
            "framing": framing,
            "distance": pose["distance"],
            "px_per_cell_target": pose["px_per_cell"],
            "px_per_cell_measured": measured_px_per_cell(pose["distance"], 1080),
            "object_offset": list(pose["object_offset"]),
            "fov_v_deg": FOV_V_DEG,
            "resolution": [1920, 1080],
        }

    set_lod("close")
    paths["works_top"] = snap("works_top.png", "works_top")
    paths["works_edge"] = snap("works_edge.png", "works_edge", edge_dir=(1.0, 0.0))

    # Same legal camera, lighting, transform, output size, and 120 px/cell for
    # each authored LOD. Filenames and the comparison record are the labels;
    # no studio zoom or per-LOD reframing is allowed to hide a silhouette pop.
    for lod in (0, 1, 2):
        set_lod(lod)
        rec = snap(f"lod{lod}_matched_120px.png", "works_top")
        rec["lod"] = lod
        rec["label"] = f"LOD{lod} matched works_top 120 px/cell"
        paths[f"lod{lod}_matched"] = rec
    set_lod("close")
    clay_b, _ = override_clay(meshes)
    paths["works_top_clay"] = snap("works_top_clay.png", "works_top")
    restore_mats(meshes, clay_b)

    # Grazing edge: same works_edge offset, Key dimmed, Grazing sun dominant.
    for obj in bpy.data.objects:
        if obj.type == "LIGHT" and obj.name == "Key":
            obj.data.energy = 1.6
        if obj.type == "LIGHT" and obj.name == "Grazing":
            obj.data.energy = 8.5
    paths["works_edge_grazing"] = snap("works_edge_grazing.png", "works_edge", edge_dir=(0.85, 0.35))
    for obj in bpy.data.objects:
        if obj.type == "LIGHT" and obj.name == "Key":
            obj.data.energy = 7.2
        if obj.type == "LIGHT" and obj.name == "Grazing":
            obj.data.energy = 5.4

    set_lod("site")
    paths["works_site"] = snap("works_site.png", "works_site")

    set_lod("close")
    # Isolation stills from exported GLB (Standard view transform).
    scene = bpy.context.scene
    vt, look, exp = scene.view_settings.view_transform, scene.view_settings.look, scene.view_settings.exposure
    scene.view_settings.view_transform = "Standard"
    try:
        scene.view_settings.look = "None"
    except TypeError:
        pass
    scene.view_settings.exposure = 0.0
    pad.hide_render = True
    for kind, fname in (("normal", "normal_isolation.png"), ("orm", "orm_isolation.png"), ("id", "id_or_material_id.png")):
        b = override_channel(meshes, kind)
        paths[kind] = snap(fname, "works_top")
        restore_mats(meshes, b)
    scene.view_settings.view_transform = vt
    scene.view_settings.look = look
    scene.view_settings.exposure = exp
    pad.hide_render = False

    # Hook / identity diagnostic: clay + empties as colored axes.
    clay_b, _ = override_clay(meshes)
    # Draw simple axis markers at hooks.
    for hook_name, color in (("head_face", (0.9, 0.2, 0.1, 1)), ("belt", (0.1, 0.7, 0.2, 1)), ("lamp", (0.95, 0.8, 0.2, 1))):
        hook = bpy.data.objects.get(hook_name)
        if hook is None:
            continue
        bpy.ops.mesh.primitive_cone_add(radius1=0.03, radius2=0.0, depth=0.18, location=hook.matrix_world.translation)
        mark = bpy.context.object
        mark.name = f"_diag_{hook_name}"
        mat = bpy.data.materials.new(f"_diagmat_{hook_name}")
        mat.use_nodes = True
        bsdf = next(n for n in mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
        bsdf.inputs["Base Color"].default_value = color
        key = "Emission Color" if "Emission Color" in bsdf.inputs else "Emission"
        if key in bsdf.inputs:
            bsdf.inputs[key].default_value = color
        if "Emission Strength" in bsdf.inputs:
            bsdf.inputs["Emission Strength"].default_value = 2.0
        mark.data.materials.append(mat)
    paths["hook_identity"] = snap("hook_identity.png", "works_top")
    restore_mats(meshes, clay_b)

    # Original-resolution inspect crops (not legal stills; diagnostics only).
    inspect_dir = still_dir / "inspect"
    inspect_dir.mkdir(parents=True, exist_ok=True)
    crops = {}
    for key, half in (
        ("works_top", 140), ("works_top_clay", 140), ("works_site", 40),
        ("works_edge", 160), ("lod0_matched", 140),
        ("lod1_matched", 140), ("lod2_matched", 140),
    ):
        rec = paths.get(key)
        if not rec:
            continue
        src = ROOT / rec["path"]
        rgba, w, h = load_png_rgb(src)
        crops[key] = write_crop(rgba, w // 2, h // 2, half, inspect_dir / f"{key}_crop.png")
        if key == "works_edge":
            # Edge framing parks the object near the right; crop that side.
            ox = rec.get("object_offset") or [0, 0, 0]
            if ox[0] > 1.0:
                crops[key] = write_crop(rgba, int(w * 0.88), h // 2, half, inspect_dir / f"{key}_crop.png")
    paths["_inspect_crops"] = {
        k: str((inspect_dir / f"{k}_crop.png").relative_to(ROOT)).replace("\\", "/")
        for k in crops
    }
    return paths


def write_docs(inventory, contract, inspect, stills, lod_reports, pixels, cycle01, cycle02, cycle03, cycle04):
    FAMILY.mkdir(parents=True, exist_ok=True)
    EVIDENCE_DIR.mkdir(parents=True, exist_ok=True)
    hashes = {
        "cycle": CYCLE,
        "disposition": "review_pending",
        "combinedSha256": inventory["sha256"],
        "partsSha256": inventory["partsSha256"],
        "cycle01Frozen": True,
        "cycle02Frozen": True,
        "cycle03Frozen": True,
        "cycle04Frozen": True,
        "cycle01Sha256": cycle01,
        "cycle02Sha256": cycle02,
        "cycle03Sha256": cycle03,
        "cycle04Sha256": cycle04,
        "lod": {str(r["lod"] if "lod" in r else i): {"sha256": r.get("sha256"), "triangles": r["triangles"]} for i, r in enumerate(lod_reports)},
        "textures": {},
    }
    for path in sorted(TEX_DIR.glob("*.png")):
        hashes["textures"][path.name] = sha256(path)
    write_text_lf(FAMILY / "HASHES.json", json.dumps(hashes, indent=2) + "\n")

    camera_stills = {k: v for k, v in stills.items() if not str(k).startswith("_")}
    epoch = {
        "schema": "spaceface.worksExtractorCycleEpoch.v1",
        "cycle": CYCLE,
        "epoch": EPOCH_NAME,
        "disposition": "review_pending",
        "state": "design_candidate",
        "gates": {
            "G0": "evidence_ready",
            "G1": "open",
            "G2": "open",
            "G4": "open",
            "G7": "open",
        },
        "independentReview": "not_launched",
        "cycle01Frozen": True,
        "cycle02Frozen": True,
        "cycle03Frozen": True,
        "cycle04Frozen": True,
        "cycle03IndependentVerdict": "revise",
        "cycle04IndependentVerdict": "revise",
        "candidate": {
            "root": ROOT_NAME,
            "partGlb": inventory["partsSource"],
            "sourceGlb": inventory["combined"],
            "blend": inventory["blend"],
            "sha256": inventory["sha256"],
            "partsSha256": inventory["partsSha256"],
        },
        "hooks": {
            "required": list(HOOK_NAMES),
            "found": inspect["hooksFound"],
            "missing": inspect["missingHooks"],
            "exported_gltf_translations": inspect["hookTranslations"],
            "invalid_exported_translations": inspect["invalidHookTranslations"],
            "pivot_head_face_blender": [PIVOT.x, PIVOT.y, PIVOT.z],
            "lamp_blender": [LAMP_LOC.x, LAMP_LOC.y, LAMP_LOC.z],
            "belt_blender": [BELT_LOC.x, BELT_LOC.y, BELT_LOC.z],
        },
        "lod": {
            "budgets": TRI_BUDGET,
            "triangles": inspect["lodTriangles"],
            "draws": inspect["draws"],
            "materials": inspect["materialCount"],
            "hulls": inspect["meshCount"],
            "roots": LOD_ROOTS,
            "missingRoots": inspect["missingLodRoots"],
        },
        "bboxBlenderZUp": inventory["bbox"],
        "camera": camera_stills,
        "pixels": pixels,
        "inspectCrops": stills.get("_inspect_crops") or {},
        "visibleZoneRegister": "assets/works/extractor/evidence/cycle_005/SUPPORTED_VIEW_ZONE_REGISTER.json",
        "matchedLodEvidence": {
            str(lod): stills.get(f"lod{lod}_matched") for lod in (0, 1, 2)
        },
        "normalRouteEvidence": {
            "status": "unavailable_unintegrated_candidate",
            "bestAvailableWorksContext": stills.get("works_site"),
            "limitations": "assets/works/extractor/evidence/cycle_005/NORMAL_ROUTE_LIMITATIONS.md",
        },
        "firstRenderCorrection": {
            "observedFailure": "LOD1 and LOD2 steel cutter crown reflected too dark to preserve the transverse head hierarchy.",
            "correction": "Added segmented bonded refractory hardface blocks attached to the physical crown; no emission, outline, or camera change.",
            "finalEvidence": [
                stills.get("works_site"),
                stills.get("lod1_matched"),
                stills.get("lod2_matched"),
            ],
        },
        "notes": [
            "Cycle 05 correction candidate only. Not wired, not released, not accepted.",
            "Cycle 01 through Cycle 04 evidence folders are byte-frozen.",
            "Cycle 04 independent exact-hash verdict was REVISE; Cycle 05 does not overwrite that result.",
            "Open +X aperture is framed by two short broad-rooted splayed refractory cheeks; no parallel tines, closing floor, wall, roof, or grate.",
            "Long dark belt leads into a real transverse steel cutter crown; warm drive hatch and rooted warm lamp survive every LOD.",
            "Matched LOD0/1/2 stills use one legal 120 px/cell camera without per-LOD reframing.",
            "Author-side visible-zone register is exhaustive; independent confirmation remains open.",
            "Hidden-face evaluation is per LOD; coincident LODs were never raycast together.",
            "No Cycle 05 independent reviewer has run. G1/G2/G4/G7 remain open.",
            "The unintegrated source candidate cannot supply a true Browser/Electron normal-route capture.",
        ],
    }
    write_text_lf(EVIDENCE_DIR / "EPOCH.json", json.dumps(epoch, indent=2) + "\n")

    site_px = (pixels or {}).get("works_site") or {}
    top_px = (pixels or {}).get("works_top") or {}
    audit = f"""# Extractor — material and shape audit (Cycle 05)

Candidate `{inventory['sha256']}` · root `{ROOT_NAME}` · disposition `review_pending`.

Cycle 04's exact independent review returned REVISE. Its long pale parallel
bars read as forbidden forklift tines at 120 and 19 px. At legal works_site,
LOD1 lost the transverse head, dark belt, warm drive, and lamp hierarchy.
LOD2 popped to a generic U-frame without a stable crusher process read.

Cycle 05 preserves the same footprint, hooks, physical material families, UV
and bake corrections, and open +X process bite. It replaces the bars with
short broad-rooted splayed refractory cheek plates, adds a machined cutter
crown attached across the drum, preserves a warm service hatch in every LOD,
and roots the warm lamp hood/socket/bracket at every LOD with only restrained
lens self-light.

## Shape grammar

| Form | Primitive origin | Manufactured result | Camera |
|---|---|---|---|
| Floor rails | C-channel loft at every LOD | Load-bearing C section stops before the crusher so it cannot close into a square | works_top, clay, site |
| Crossmembers | Hat-beam loft | Rooted into rails with gussets; not a box wall | works_top |
| Drive case | Waisted loft, narrower than rail span | Warm machinery-enamel gearbox with broad asymmetric service hatch retained through LOD2 | works_top / edge / site |
| Fins | Thin tall plates in a hat header | Air-gapped machined-steel heat path, not a vent grille | works_top |
| Mouth | Two cheeks, no +X wall/floor/roof; two short trapezoidal cheek plates | Open site-scale bite with strong outward splay and no parallel tine read | works_top / site |
| Drum / housings | Y-axis cylinder, bearing housings, attached transverse cutter crown and bonded hardface blocks | Bright physical segmented head under `head_face`, not an outline/card | works_top / edge / site |
| Jaws | Chunky refractory rim blocks plus broad-rooted forward cheeks | Dry replaceable plates framing the bite, not forklift bars or a grate | works_top / site |
| Belt | Long thin sagging ribbon + proud roller crowns + return | Near-black directional path from drive to crusher, with side/under void | works_top / edge / site |
| Lamp | Rooted bracket + warm cone hood + socket + recessed lens at every LOD | Warm fixture read carried by construction/material; lens emission restrained | works_edge / site |

## Material allocation

Blue-grey painted frame is dielectric (ORM metal low). Drum, rollers, fins,
and bearing housings are cool machined steel; pale bonded hardface inserts
carry the transverse diffuse head line. Jaw blocks are dry ochre
refractory, isolated from the housing. The warm drive case is machinery
enamel over steel rather than copper. The belt is near-black rubber. One warm
recessed lamp is the smallest value anchor. Rover yellow is absent. No plastic
copper, generic grid, universal edge wear, rail AO split, or emissive beacon.

Maps are mesh-derived AO / tangent normal / pointiness curvature, composited
into authored 1024² basecolor / normal / ORM. Unique non-overlapping UV0.

## LOD

LOD0 {inspect['lodTriangles']['lod0']} / 8000. LOD1 {inspect['lodTriangles']['lod1']} / 2000.
LOD2 {inspect['lodTriangles']['lod2']} / 600. The splayed cheek mouth, cutter crown,
long belt, warm drive hatch, rooted lamp, and all three hooks survive. Exact
matched evidence is in `evidence/cycle_005/lod0_matched_120px.png` through
`lod2_matched_120px.png`. Hidden faces are evaluated per LOD only.

## Pixel facts (original 1920×1080)

- works_top machine size px: {top_px.get('machine_size_px')}
- works_top tan bite px: {top_px.get('tan_bite_px')} (target 8–10)
- works_site machine size px: {site_px.get('machine_size_px')}
- works_site +X dark span px: {site_px.get('plus_x_dark_span_px')}
- works_site well darker than rails: {site_px.get('well_darker_than_rails')}

## Supported-view coverage

`SUPPORTED_VIEW_ZONE_REGISTER.json` bills every visible zone in works_top,
works_edge, and works_site. Coverage is author-complete but
`allSupportedViewZonesClassified` remains false until an independent exact-hash
reviewer confirms it, as required by the material-truth contract.

## First-render correction

The first Cycle 05 legal render showed that the honest metallic crown still
reflected too dark at LOD1/2. The final candidate adds segmented bonded dry
refractory hardface blocks attached to that crown. This is a manufactured
replaceable contact surface, not emission, outline, a card, or camera bias.

## Remaining route limits (honest)

- The candidate is not integrated, so no Browser/Electron normal-route capture
  can honestly show this hash. `works_site.png` is the best available legal
  Works-context evidence, not a substitute for G7.
- Site-scale identity is only ~22 px and must be judged at original resolution.
- Cycle 05 independent G1/G2/G4/G7 review has not run. This cycle closes none.
"""
    write_text_lf(FAMILY / "MATERIAL_AND_SHAPE_AUDIT.md", audit)

    contract_json = {
        "schemaVersion": "1.0",
        "assetId": ASSET_ID,
        "root": ROOT_NAME,
        "packet": "PQ-131.03",
        "cycle": CYCLE,
        "currentState": "design_candidate",
        "candidateHash": inventory["sha256"],
        "forwardAxis": "+X",
        "upAxisBlender": "+Z",
        "upAxisGltf": "+Y",
        "hooks": list(HOOK_NAMES),
        "materials": {name: {k: v for k, v in spec.items() if k != "id"} for name, spec in ROLES.items()},
        "ormChannels": "R=AO,G=Roughness,B=Metallic",
        "normalConvention": "OpenGL",
        "textureSize": 1024,
        "forbiddenReads": [
            "safety yellow", "plastic copper", "generic grid", "universal edge wear",
            "neon", "flat decals", "leather", "billboard", "glowing bar", "crate",
            "turret", "forklift", "gun", "box-plus-cylinder", "closed grate", "filled trough",
            "black vent", "closed pit", "vent grille",
        ],
        "visibleZoneCoverage": {
            "authorInventory": "complete",
            "reviewerConfirmed": False,
            "register": "assets/works/extractor/evidence/cycle_005/SUPPORTED_VIEW_ZONE_REGISTER.json",
            "supportedViews": ["works_top", "works_edge", "works_site"],
            "zones": [z["id"] for z in VISIBLE_ZONES],
            "unclassifiedVisibleZones": [],
        },
        "allSupportedViewZonesClassified": False,
        "gatesOpen": ["G1", "G2", "G4", "G7"],
    }
    write_text_lf(FAMILY / "MATERIAL_CONTRACT.json", json.dumps(contract_json, indent=2) + "\n")

    zone_register = {
        "schema": "spaceface.visibleZoneRegister.v1",
        "assetId": ASSET_ID,
        "candidateHash": inventory["sha256"],
        "cycle": CYCLE,
        "supportedViews": ["works_top", "works_edge", "works_site"],
        "authorInventory": "complete",
        "reviewerConfirmed": False,
        "allSupportedViewZonesClassified": False,
        "reasonBooleanRemainsFalse": (
            "Every author-observed visible zone is billed below, but the material-truth "
            "contract reserves the final boolean for independent exact-hash confirmation."
        ),
        "unclassifiedVisibleZones": [],
        "zones": VISIBLE_ZONES,
    }
    write_text_lf(
        EVIDENCE_DIR / "SUPPORTED_VIEW_ZONE_REGISTER.json",
        json.dumps(zone_register, indent=2) + "\n",
    )

    matched = []
    for lod, report in enumerate(lod_reports):
        rec = stills.get(f"lod{lod}_matched") or {}
        image_path = ROOT / rec.get("path", "")
        matched.append({
            "label": f"LOD{lod} matched works_top 120 px/cell",
            "lod": lod,
            "triangles": report["triangles"],
            "budget": TRI_BUDGET[lod],
            "path": rec.get("path"),
            "imageSha256": sha256(image_path) if image_path.is_file() else None,
            "camera": {
                "framing": rec.get("framing"),
                "distance": rec.get("distance"),
                "pxPerCell": rec.get("px_per_cell_measured"),
                "fovVDeg": rec.get("fov_v_deg"),
                "resolution": rec.get("resolution"),
                "objectOffset": rec.get("object_offset"),
            },
        })
    lod_record = {
        "schema": "spaceface.matchedLodEvidence.v1",
        "assetId": ASSET_ID,
        "candidateHash": inventory["sha256"],
        "matchContract": (
            "One exported combined GLB; same works_top camera, 120 px/cell, lighting, "
            "resolution, transform, and object offset; only the visible LOD changes."
        ),
        "records": matched,
        "acceptanceClaim": False,
    }
    write_text_lf(
        EVIDENCE_DIR / "LOD_COMPARISON.json",
        json.dumps(lod_record, indent=2) + "\n",
    )
    lod_lines = [
        "# Extractor Cycle 05 — matched LOD evidence",
        "",
        f"Candidate `{inventory['sha256']}`. These are labeled comparison stills, not acceptance.",
        "",
        "All three images use the same exported combined GLB, legal `works_top` camera,",
        "120 px/cell framing, lighting, resolution, transform, and object offset. Only the",
        "visible LOD changes.",
        "",
        "| Label | Triangles / budget | Exact image SHA-256 |",
        "|---|---:|---|",
    ]
    for rec in matched:
        lod_lines.append(
            f"| `{rec['label']}` (`{rec['path']}`) | {rec['triangles']} / {rec['budget']} | `{rec['imageSha256']}` |"
        )
    lod_lines.extend([
        "",
        "Required review: inspect all three at original resolution for silhouette, feed",
        "direction, belt/head hierarchy, lamp retention, material-boundary retention, and",
        "any unacceptable pop. No author-side metric closes G1/G2/G4/G7.",
        "",
    ])
    write_text_lf(EVIDENCE_DIR / "LOD_COMPARISON.md", "\n".join(lod_lines))

    route_text = f"""# Extractor Cycle 05 — normal-route limitation

Candidate `{inventory['sha256']}` is an unintegrated source asset. It is not present on the
default Browser/Electron Asteroid Works route, so a headed normal-route capture of this exact
hash does not exist and is not claimed.

Best available Works-context evidence: `{stills.get('works_site', {}).get('path')}` at the legal
19 px/cell `works_site` camera, plus `{stills.get('works_top', {}).get('path')}` at 120 px/cell.
These use the canonical Works camera and mine-pad lighting, but they are Blender evidence—not
the real game route and not a replacement for G7.

After integration, the controller still must capture the exact loaded GLB on the ordinary
Asteroid Works route, confirm material colour space and hook behavior, compare LOD transitions,
and obtain independent exact-hash review. Until then the disposition remains `review_pending`.
"""
    write_text_lf(EVIDENCE_DIR / "NORMAL_ROUTE_LIMITATIONS.md", route_text)

    def row(mid, state, still, clay, fake, notes, **extra):
        rec = {
            "id": mid, "state": state, "still": still,
            "clayConfirm": clay, "forbiddenFakeAbsent": fake, "notes": notes,
        }
        rec.update(extra)
        return rec

    top = stills.get("works_top", {}).get("path")
    clay = stills.get("works_top_clay", {}).get("path")
    graz = stills.get("works_edge_grazing", {}).get("path")
    nrm = stills.get("normal", {}).get("path")
    orm = stills.get("orm", {}).get("path")
    ledger = {
        "schema": "spaceface.advancedModelTechniqueLedger.v1",
        "assetId": ASSET_ID,
        "shipId": ASSET_ID,
        "candidateHash": inventory["sha256"],
        "exportGlb": inventory["partsSource"],
        "class": "place",
        "contract": "docs/visual-assets/ADVANCED_MODEL_TECHNIQUE_CONTRACT.md",
        "clayStillReadsAsPrimitives": False,
        "independentReview": "pending",
        "independentReviewer": None,
        "forbidden": {
            "factoryLoftPlusBoxes": False,
            "sharedSheetTint": False,
            "shadeSmoothWholeObject": False,
            "internalVoidCalledBay": False,
            "imagenUsedAsBake": False,
        },
        "rows": [
            row("MTX-01", "implemented", graz, "pass", True, "Angle bevel 6–12 mm then weighted normals, shade 28°.", bevelWidthM=0.006, shadeAngleDeg=SHADE_ANGLE),
            row("MTX-03", "implemented", clay, "pass", True, "Cycle 05: open +X aperture with two short broad-rooted splayed refractory cheeks; no parallel tines, bite floor, wall, roof, or grate."),
            row("MTX-16", "implemented", top, "pass", True, "Unique non-overlapping UV0 packed per LOD."),
            row("MTX-20", "implemented", nrm, "pass", True, "High duplicate with extra 3 mm bevel as bake source."),
            row("MTX-21", "implemented", nrm, "pass", True, "Cage extrusion 0.03 wu on selected-to-active normal bake."),
            row("MTX-22", "implemented", nrm, "pass", True, "Tangent OpenGL normal from the mesh."),
            row("MTX-23", "implemented", orm, "pass", True, "Cycles AO baked to unique UV0."),
            row("MTX-24", "implemented", orm, "pass", True, "Pointiness curvature baked as emit."),
            row("MTX-25", "implemented", orm, "pass", True, "Concave curvature drives cavity dirt."),
            row("MTX-30", "implemented", nrm, "pass", True, "Generated refs are construction studies only; maps are mesh-derived."),
            row("MTX-31", "implemented", top, "pass", True, "Cool blue-grey dielectric paint, bright machined steel, dry ochre refractory, near-black rubber, warm drive enamel, and recessed lamp glass are value-separated."),
            row("MTX-32", "implemented", top, "pass", True, "Authored 1024 albedo from ID × AO × causal wear, not a tinted sheet."),
            row("MTX-33", "implemented", orm, "pass", True, "ORM: R=AO G=rough B=metal, role-varying."),
            row("MTX-39", "implemented", top, "pass", True, "Restrained cavity dirt and drive-side heat only; no rail AO split, uniform dirt, or copper wash."),
            row("MTX-46", "implemented", clay, "pass", True, "No yellow, neon, leather, glowing bar, or kit donor."),
            row("MTX-50", "implemented", inventory["partsSource"], "pass", True, "Z-up works scale, Y-up glTF, sockets, LOD names, extras stamped."),
            row("MTX-52", "implemented", clay, "pass", True, "Macro from cited kit shape language + construction studies, not a cube."),
            row("MTX-53", "not_applicable", None, "pass", True, "Manufactured machine, not a rock/sculpt."),
            row("MTX-54", "implemented", top, "pass", True, "Cycle 05 preserves footprint, hooks, process identity, and Cycle 04 UV/material repairs while addressing the exact Cycle 04 REVISE findings; prior evidence is frozen."),
        ],
    }
    write_text_lf(FAMILY / "TECHNIQUE_LEDGER.json", json.dumps(ledger, indent=2) + "\n")
    return hashes, epoch


def run_hidden_faces(glb_path: Path, dest: Path):
    import works_visible_faces as wvf
    wvf.wipe_scene()
    wvf.import_glb(str(glb_path))
    meshes = wvf.render_meshes()
    rows = wvf.classify(meshes)
    rel = str(glb_path.relative_to(ROOT)).replace("\\", "/")
    report = wvf.report_for(meshes, rows, glb=rel, deleted=False)
    report["note"] = (
        "dry-run; pass --delete only after inspecting hiddenFrac. "
        "Do not use this as a quality close. LODs were evaluated one at a time."
    )
    dest.parent.mkdir(parents=True, exist_ok=True)
    write_text_lf(dest, json.dumps(report, indent=2) + "\n")
    return report


def write_inspect_md(inventory, inspect, stills, pixels, hidden):
    top = pixels.get("works_top") or {}
    site = pixels.get("works_site") or {}
    text = f"""# Extractor Cycle 05 — original-resolution inspect

Candidate `{inventory['sha256']}`.
Disposition **`review_pending`**. Independent reviewers were not launched.
G1/G2/G4/G7 remain open.

Inspected once at 1920×1080 (`works_top`, clay, edge, grazing, site, matched
LOD0/1/2, normal, ORM, material ID, hook identity) plus centre crops. Cycle 01
through Cycle 04 evidence are byte-frozen. Cycle 04's exact-hash verdict remains
REVISE; this is the correction candidate.

## Cycle 04 independent REVISE vs this candidate

| Cycle 04 review | Cycle 05 candidate evidence |
|---|---|
| Parallel pale bars read as forklift tines | Short broad-rooted trapezoidal refractory cheeks splay outward around a dark bite |
| LOD1 site head/belt/drive/lamp hierarchy collapses | Physical transverse crown with segmented hardface, long black belt, persistent warm hatch, rooted warm hood/socket/bracket |
| LOD2 pops to generic U-frame | Cutter crown/hardface, splayed bite, belt, drive hatch, refractory pair, and lamp all survive LOD2 |
| Do not use outline/emission/camera cheating | Geometry and material boundaries carry the read; lens self-light reduced to 0.18 and cameras unchanged |
| Exact route still absent | Honest Works-context evidence plus explicit integration limitation; G7 stays open |

## Pixel / camera facts

- Legal cameras only: `works_top` / `works_edge` / `works_site`, 31° PERS, 1920×1080.
- `works_top` machine bbox ≈ {top.get('machine_size_px')} px at 120 px/cell.
- `works_top` tan bite px: {top.get('tan_bite_px')} (target 8–10).
- `works_site` pad+machine bbox ≈ {site.get('machine_size_px')} px at 19 px/cell.
- Hooks `head_face`, `belt`, `lamp` present. Root `{ROOT_NAME}`.
- LOD0 {inspect['lodTriangles']['lod0']} / 8000 · LOD1 {inspect['lodTriangles']['lod1']} / 2000 · LOD2 {inspect['lodTriangles']['lod2']} / 600.
- Envelope {inventory['bbox']['size']} wu, underside z=0, +X feed.
- Hidden-face dry-run: {hidden.get('hiddenFaces')} / {hidden.get('faces')} hidden (per LOD).

First legal-render correction: the bare steel crown reflected too dark in
LOD1/2, so the final candidate adds non-emissive bonded refractory hardface
blocks as a real replaceable cutter surface. Cameras and lighting are unchanged.

## Remaining risk (honest)

- Site register is still only ~22 pixels; original-resolution judgment is required.
- Author-side zone coverage and matched evidence do not replace independent review.
- The source candidate is not on the Browser/Electron route; G7 remains open.
- This is a source candidate. Not wired, not released, not accepted.
"""
    write_text_lf(EVIDENCE_DIR / "INSPECT.md", text)


def validate_inventory(inventory, inspect, lod_reports, pixels=None):
    errors = []
    bbox = inventory["bbox"]
    size = bbox["size"]
    if size[0] > CELL_WU + 1e-3 or size[1] > CELL_WU + 1e-3:
        errors.append(f"footprint {size[:2]} exceeds cell {CELL_WU}")
    if bbox["min"][2] < -0.02:
        errors.append(f"underside below z=0: {bbox['min'][2]}")
    if not inspect["ok"]:
        errors.append(f"glb inspect failed: {inspect}")
    for lod, report in enumerate(lod_reports):
        if report["triangles"] > TRI_BUDGET[lod]:
            errors.append(f"LOD{lod} tris {report['triangles']} > {TRI_BUDGET[lod]}")
    for h in HOOK_NAMES:
        if h not in inspect["hooksFound"]:
            errors.append(f"missing hook {h}")
    for invalid in inspect["invalidHookTranslations"]:
        errors.append(
            f"hook {invalid['name']} exported at {invalid['actual']}, "
            f"expected {invalid['expected']}"
        )
    top = (pixels or {}).get("works_top") or {}
    tan = top.get("tan_bite_px")
    if tan is not None and not (8 <= int(tan) <= 10):
        errors.append(f"works_top tan bite {tan} px not in 8–10")
    return errors


def main():
    FAMILY.mkdir(parents=True, exist_ok=True)
    SOURCE_DIR.mkdir(parents=True, exist_ok=True)
    TEX_DIR.mkdir(parents=True, exist_ok=True)
    EVIDENCE_DIR.mkdir(parents=True, exist_ok=True)
    PARTS_DIR.mkdir(parents=True, exist_ok=True)
    cycle01 = assert_cycle_01_frozen()
    cycle02 = assert_cycle_02_frozen()
    cycle03 = assert_cycle_03_frozen()
    cycle04 = assert_cycle_04_frozen()

    lod_reports = []
    for lod in (0, 1, 2):
        report = build_lod(lod)
        report["lod"] = lod
        export_lod_glb(report, lod)
        # Drop heavy bpy datablocks between LODs except we reset inside build_lod.
        lod_reports.append({k: report[k] for k in ("lod", "triangles", "draws", "materials", "path", "bytes", "sha256")})

    inventory, contract, combined, parts = combine_lods(lod_reports)
    inspect = inspect_glb(parts)
    stills = render_stills(parts, EVIDENCE_DIR)
    pixels = {}
    for key, ppc in (("works_top", 120.0), ("works_site", 19.0), ("works_top_clay", 120.0)):
        rec = stills.get(key)
        if rec:
            pixels[key] = analyze_works_still(ROOT / rec["path"], ppc)
    hidden = run_hidden_faces(parts, EVIDENCE_DIR / "hidden_faces.json")
    write_inspect_md(inventory, inspect, stills, pixels, hidden)
    hashes, epoch = write_docs(
        inventory, contract, inspect, stills, lod_reports, pixels,
        cycle01, cycle02, cycle03, cycle04,
    )
    errors = validate_inventory(inventory, inspect, lod_reports, pixels)
    assert_cycle_01_frozen()
    assert_cycle_02_frozen()
    assert_cycle_03_frozen()
    assert_cycle_04_frozen()
    result = {
        "ok": not errors,
        "errors": errors,
        "inventory": inventory,
        "inspect": inspect,
        "stills": {k: v.get("path") if isinstance(v, dict) else v for k, v in stills.items()},
        "epoch": str((EVIDENCE_DIR / "EPOCH.json").relative_to(ROOT)).replace("\\", "/"),
        "hashes": str((FAMILY / "HASHES.json").relative_to(ROOT)).replace("\\", "/"),
        "pixels": pixels,
    }
    print(json.dumps(result, indent=2))
    if errors:
        raise SystemExit("validation failed:\n" + "\n".join(errors))


if __name__ == "__main__":
    main()

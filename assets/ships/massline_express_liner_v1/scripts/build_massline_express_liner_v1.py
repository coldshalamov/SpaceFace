"""PQ-049.01 Massline express-liner source builder — cycle 36.

Civic pressure-drum liner, not a Mule rename and not a Lark courier.
Chase-camera evidence only. No seats. No studio three-quarter cycle stills.

Cycle 36 keeps Cycle 35's blue-grey recessed glazing, internal drive
centerlines, dry bores, and authored LOD evidence while correcting the
remaining exposed-prong/cross read. A common manufactured aft pressure shroud
now wraps both cases almost to their throat mouths, and the passenger belt is
tucked beneath a longer axial civic crown. Only the two actual bores split at
the stern. Legal cameras and evidence bands remain frozen.

Run from repo root. Do not pass --cycle (Blender steals it as --cycles-*). Use:

  "C:\\Program Files\\Blender Foundation\\Blender 5.1\\blender.exe" --background --python ^
    assets/ships/massline_express_liner_v1/scripts/build_massline_express_liner_v1.py -- --mtx-cycle=36
"""
from __future__ import annotations

import hashlib
import json
import math
import re
import shutil
import struct
import sys
import time
from pathlib import Path

import bmesh
import bpy
from mathutils import Vector

SCRIPT = Path(__file__).resolve()
FAMILY = SCRIPT.parents[1]
ROOT = SCRIPT.parents[4]
TOOLS = ROOT / "tools" / "blender"
if str(TOOLS) not in sys.path:
    sys.path.insert(0, str(TOOLS))

from fleet_construction import (  # noqa: E402
    add_corner_fasteners,
    add_folded_sheet,
    apply_modifiers,
    boolean_cut_box,
    cut_open_bay,
)
from spaceface_chase_camera import (  # noqa: E402
    DISTANCE_CLOSE,
    DISTANCE_DEFAULT,
    FOV_V_DEG,
    PLAY_CHASE_CLOSE_WIDTH_FRAC,
    PLAY_CHASE_WIDTH_FRAC,
    TILT_DEG,
    apply_chase_camera,
    occupancy_in_band,
    render_chase_still,
    render_cycle_chase_stills,
)

TEX_DIR = FAMILY / "source" / "textures"
TEX_BY_LOD = {0: 1024, 1: 512, 2: 256}
TEX = 1024
CYCLE = 36
PROBE_OCCUPANCY = False
RENDER_ONLY = False
for i, tok in enumerate(sys.argv):
    if tok.startswith("--cycle="):
        CYCLE = int(tok.split("=", 1)[1])
    elif tok == "--cycle" and i + 1 < len(sys.argv):
        CYCLE = int(sys.argv[i + 1])
    elif tok.startswith("--mtx-cycle="):
        CYCLE = int(tok.split("=", 1)[1])
    elif tok == "--mtx-cycle" and i + 1 < len(sys.argv):
        CYCLE = int(sys.argv[i + 1])
    elif tok in ("--probe-occupancy", "--probe"):
        PROBE_OCCUPANCY = True
    elif tok in ("--render-only", "--stills-only"):
        RENDER_ONLY = True

# Cycle 36 manufactured envelope. Metres, +X forward.
# Width comes from a tucked inhabited equator, not hanging cards or occupancy
# padding. The longer axial crown carries the dominant abeam read.
# The twin bores sit inside the 6.25 m aft pressure half-width. Keeping their
# centerlines near +/-4.55 m preserves two readable throats while preventing
# the long outboard fork/pincer silhouette rejected in Cycle 34.
DRIVE_Y = 4.55
DRIVE_Z = 0.38
DRIVE_R_FORE = 1.48
DRIVE_R_AFT = 1.30
BOARD_X, BOARD_Z = 14.85, 0.62
FORE_HW, FORE_HH = 7.65, 4.65
PASS_HW, PASS_HH = 8.80, 4.55
AFT_HW, AFT_HH = 6.55, 3.75
MID_HW, MID_HH = PASS_HW, PASS_HH
CORR_Y = PASS_HW
CORR_HW, CORR_HH = 0.55, 1.34
PASS_WALL = 0.22
BELT_OUTER = PASS_HW + CORR_HW
HAT_FORE_X = 10.20
HAT_AFT_X = -1.55
HAT_LOAD_X = -12.45

ASSET_ID = "SF_WHOLESHIP_MASSLINE_EXPRESS_LINER_V1"
PART_ID = "massline_express_liner_v1"
SHADE_ANGLE = 28.0
BEVEL_HULL = 0.016
BEVEL_FRAME = 0.007
BEVEL_HIGH = 0.005
CAGE_INFLATE = 0.038
BAKE_AO_SAMPLES = 16

ROLE_RGB = {
    "ceramic": (0.86, 0.80, 0.68),
    "frame": (0.18, 0.22, 0.27),
    "keel": (0.055, 0.070, 0.090),
    "glass": (0.185, 0.365, 0.500),
    "primer": (0.32, 0.36, 0.34),
    "refractory": (0.16, 0.145, 0.130),
    "cyan": (0.10, 0.58, 0.62),
    "amber": (0.74, 0.44, 0.12),
    "throat": (0.11, 0.11, 0.12),
}


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1 << 20), b""):
            digest.update(chunk)
    return digest.hexdigest().upper()


def spaceface_asset_metadata(lod: int) -> dict:
    return {
        "contractVersion": 1,
        "assetId": ASSET_ID,
        "partId": PART_ID,
        "lod": f"lod{lod}",
        "slot": "hull",
        "category": "wholeships",
        "forward": "+X",
        "up": "+Y",
        "starboard": "+Z",
        "unit": "metre",
        "normalConvention": "OpenGL",
        "ormChannels": "R=AO,G=Roughness,B=Metallic",
        "textureCompression": "PNG-source",
        "embeddedPlume": False,
        "role": "civic_pressure_drum_liner",
    }


def stamp_glb_asset_extras(path: Path, lod: int) -> None:
    """Bind the sanctioned SpaceFace metadata at GLB asset scope.

    Blender exports scene/object custom properties as node extras. The
    repository validator also requires the identical record under
    `asset.extras.spacefaceAsset`, so the reproducible builder stamps that
    JSON chunk before its transactional publish.
    """
    data = path.read_bytes()
    if len(data) < 20 or data[:4] != b"glTF":
        raise RuntimeError(f"invalid GLB header: {path}")
    json_length, json_type = struct.unpack_from("<II", data, 12)
    if json_type != 0x4E4F534A:
        raise RuntimeError(f"GLB first chunk is not JSON: {path}")
    json_start = 20
    json_end = json_start + json_length
    document = json.loads(data[json_start:json_end].decode("utf-8").rstrip(" \t\r\n\x00"))
    document.setdefault("asset", {}).setdefault("extras", {})["spacefaceAsset"] = spaceface_asset_metadata(lod)
    encoded = json.dumps(document, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    encoded += b" " * ((4 - len(encoded) % 4) % 4)
    remainder = data[json_end:]
    total_length = 20 + len(encoded) + len(remainder)
    rebuilt = data[:8] + struct.pack("<I", total_length) + struct.pack("<II", len(encoded), json_type) + encoded + remainder
    stamped = path.with_suffix(".stamp.glb")
    stamped.write_bytes(rebuilt)
    stamped.replace(path)


def reset_scene() -> None:
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for bucket in (
        bpy.data.meshes, bpy.data.curves, bpy.data.materials,
        bpy.data.cameras, bpy.data.lights, bpy.data.images,
    ):
        for item in list(bucket):
            bucket.remove(item)
    for collection in list(bpy.data.collections):
        bpy.data.collections.remove(collection)


def h01(x, y, s=0):
    v = (x * 374761393 + y * 668265263 + s * 362437) & 0xFFFFFFFF
    v = ((v ^ (v >> 13)) * 1274126177) & 0xFFFFFFFF
    return ((v ^ (v >> 16)) & 255) / 255.0


def write_pixels(name, pixels, size, colorspace="sRGB"):
    if name in bpy.data.images:
        bpy.data.images.remove(bpy.data.images[name])
    img = bpy.data.images.new(name, width=size, height=size, alpha=True)
    img.colorspace_settings.name = colorspace
    img.pixels = pixels
    TEX_DIR.mkdir(parents=True, exist_ok=True)
    path = TEX_DIR / f"{name}.png"
    tmp = TEX_DIR / f"{name}.tmp.png"
    img.file_format = "PNG"
    last_error = None
    for attempt in range(8):
        try:
            img.filepath_raw = str(tmp)
            img.save()
            if path.exists():
                try:
                    path.unlink()
                except OSError:
                    time.sleep(0.25 * (attempt + 1))
                    path.unlink()
            tmp.replace(path)
            img.filepath_raw = str(path)
            img.pack()
            return img
        except Exception as exc:
            last_error = exc
            time.sleep(0.35 * (attempt + 1))
    raise last_error


def role_maps(role, rgb, size=TEX, prefix=None):
    """Unique civic maps. Not a Lark/Mule/Wasp tint. Not one recipe recolored."""
    prefix = prefix or role
    br, bg, bb = rgb
    albedo, orm, nrm = [], [], []
    for y in range(size):
        for x in range(size):
            u = x / max(1, size - 1)
            v = y / max(1, size - 1)
            gf = h01(x, y, 19)
            gf2 = h01(x // 5, y // 5, 47)
            gf3 = h01(x // 17, y // 13, 91)
            nx, ny = 0.5, 0.5
            if role == "ceramic":
                speckle = (gf - 0.5) * 0.016
                chalk = (gf3 - 0.5) * 0.010
                r = max(0, min(1, br + speckle + chalk * 0.3))
                g = max(0, min(1, bg + speckle * 0.8 + chalk * 0.2))
                b = max(0, min(1, bb + speckle * 0.5 + chalk * 0.15))
                rough = 0.56 + 0.04 * gf
                metal = 0.02
                ao = 0.97
                nx = 0.5 + (gf - 0.5) * 0.010
                ny = 0.5 + (gf3 - 0.5) * 0.010
            elif role == "frame":
                machine = abs(math.sin(x * 0.42 + y * 0.03))
                r = max(0, min(1, br * (0.96 + gf * 0.04) + machine * 0.02))
                g = max(0, min(1, bg * (0.97 + gf * 0.03) + machine * 0.015))
                b = max(0, min(1, bb * (0.98 + gf * 0.02)))
                rough = 0.30 + machine * 0.06 + gf2 * 0.04
                metal = 0.82 + 0.04 * machine
                ao = 0.90
                nx = 0.5 + (0.5 - machine) * 0.06
                ny = 0.5 + (gf - 0.5) * 0.02
            elif role == "primer":
                spangle = abs(math.sin(x * 0.21) * math.cos(y * 0.19))
                r = max(0, min(1, br * (0.94 + gf * 0.04) + spangle * 0.03))
                g = max(0, min(1, bg * (0.93 + gf * 0.04) + spangle * 0.02))
                b = max(0, min(1, bb * (0.92 + gf * 0.03)))
                rough = 0.58 + spangle * 0.08 + gf2 * 0.04
                metal = 0.14 + spangle * 0.05
                ao = 0.92
                nx = 0.5 + (gf - 0.5) * 0.03
                ny = 0.5 + (spangle - 0.5) * 0.04
            elif role == "keel":
                forge = abs(math.sin(x * 0.28))
                r = max(0, min(1, br * (0.96 + gf * 0.04) + forge * 0.02))
                g = max(0, min(1, bg * (0.97 + gf * 0.03)))
                b = max(0, min(1, bb * (0.98 + gf * 0.02)))
                rough = 0.28 + forge * 0.06 + gf2 * 0.04
                metal = 0.88
                ao = 0.88
                nx = 0.5 + (0.5 - forge) * 0.07
                ny = 0.5 + (gf - 0.5) * 0.02
            elif role == "refractory":
                grain = (gf - 0.5) * 0.05 + (h01(x, y, 73) - 0.5) * 0.04
                r = max(0, min(1, br + grain * 0.35))
                g = max(0, min(1, bg + grain * 0.22))
                b = max(0, min(1, bb + grain * 0.12))
                rough = 0.78 + grain * 0.10
                metal = 0.02
                ao = 0.90
                nx = 0.5 + (gf - 0.5) * 0.035
                ny = 0.5 + (gf3 - 0.5) * 0.035
            elif role == "glass":
                r, g, b = br, bg, bb
                rough, metal, ao = 0.090, 0.0, 0.97
                nx, ny = 0.5, 0.5
            elif role == "cyan":
                pulse = 0.78 + 0.22 * math.sin(x * 0.04)
                r, g, b = br * pulse, bg * pulse, bb * pulse
                rough, metal, ao = 0.22, 0.06, 0.90
            elif role == "amber":
                r, g, b = br, bg, bb
                rough, metal, ao = 0.36, 0.04, 0.90
            else:
                # Dark oxidized throat rim. Not chrome, not directional wood.
                grit = (gf - 0.5) * 0.03
                r = max(0, min(1, br + grit))
                g = max(0, min(1, bg + grit * 0.8))
                b = max(0, min(1, bb + grit * 0.6))
                rough = 0.54 + gf2 * 0.08
                metal = 0.16
                ao = 0.90
                nx = 0.5 + (gf - 0.5) * 0.02
                ny = 0.5 + (gf3 - 0.5) * 0.02
            albedo.extend((r, g, b, 1.0))
            orm.extend((max(0.12, min(1.0, ao)), max(0.05, min(0.94, rough)), max(0.0, min(1.0, metal)), 1.0))
            nrm.extend((max(0.05, min(0.95, nx)), max(0.05, min(0.95, ny)), 1.0, 1.0))
    base = write_pixels(f"liner_{prefix}_{size}_basecolor", albedo, size, "sRGB")
    orm_img = write_pixels(f"liner_{prefix}_{size}_orm", orm, size, "Non-Color")
    nrm_img = write_pixels(f"liner_{prefix}_{size}_normal", nrm, size, "Non-Color")
    return base, orm_img, nrm_img


def principled(material):
    material.use_nodes = True
    material.node_tree.nodes.clear()
    output = material.node_tree.nodes.new("ShaderNodeOutputMaterial")
    bsdf = material.node_tree.nodes.new("ShaderNodeBsdfPrincipled")
    material.node_tree.links.new(bsdf.outputs["BSDF"], output.inputs["Surface"])
    return bsdf


def wire_maps(material, bsdf, maps, coat=0.0, emission=None, transmission=0.0):
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
    nmap = nodes.new("ShaderNodeNormalMap")
    nmap.space = "TANGENT"
    nmap.inputs["Strength"].default_value = 1.0
    links.new(tex_n.outputs["Color"], nmap.inputs["Color"])
    links.new(nmap.outputs["Normal"], bsdf.inputs["Normal"])
    if "Coat Weight" in bsdf.inputs and coat > 0:
        bsdf.inputs["Coat Weight"].default_value = coat
        bsdf.inputs["Coat Roughness"].default_value = 0.10 if coat > 0.2 else 0.16
    if emission:
        if "Emission Color" in bsdf.inputs:
            bsdf.inputs["Emission Color"].default_value = (*emission[0], 1)
        bsdf.inputs["Emission Strength"].default_value = emission[1]
    if transmission and "Transmission Weight" in bsdf.inputs:
        bsdf.inputs["Transmission Weight"].default_value = transmission
        if "IOR" in bsdf.inputs:
            bsdf.inputs["IOR"].default_value = 1.48


def create_materials():
    specs = {
        "Material_Hull": ("MAT_SF_Massline_CeramicPaint_WarmIvory", ROLE_RGB["ceramic"], "ceramic", 0.0, None, 0.0, "ceramic"),
        "Material_Armor": ("MAT_SF_Massline_Frame_DarkAnodized", ROLE_RGB["frame"], "frame", 0.05, None, 0.0, "frame"),
        "Material_Mechanical": ("MAT_SF_Massline_Keel_ForgedDark", ROLE_RGB["keel"], "keel", 0.0, None, 0.0, "keel"),
        "Material_Canopy": ("MAT_SF_Massline_Glazing_SmokedSafety", ROLE_RGB["glass"], "glass", 0.28, None, 0.30, "glass"),
        "Material_Radiator": ("MAT_SF_Massline_ServicePrimer_Galvanized", ROLE_RGB["primer"], "primer", 0.0, None, 0.0, "primer"),
        "Material_Ceramic": ("MAT_SF_Massline_RefractoryHeatAlloy", (0.32, 0.28, 0.24), "refractory", 0.0, None, 0.0, "refractory"),
        "Material_Accent": ("MAT_SF_Massline_WayfindingCyan", (0.10, 0.58, 0.62), "cyan", 0.0, ((0.12, 0.64, 0.68), 0.18), 0.0, "cyan"),
        "Material_Warning": ("MAT_SF_Massline_WayfindingAmber", (0.74, 0.44, 0.12), "amber", 0.0, ((0.78, 0.42, 0.10), 0.16), 0.0, "amber"),
        "Material_Thruster": ("MAT_SF_Massline_Throat_OxidizedDark", (0.16, 0.16, 0.17), "throat", 0.0, None, 0.0, "throat"),
    }
    mats = {}
    for lookup_name, (export_name, rgb, role, coat, emit, trans, prefix) in specs.items():
        material = bpy.data.materials.new(export_name)
        bsdf = principled(material)
        bsdf.inputs["Base Color"].default_value = (*rgb, 1)
        if not PROBE_OCCUPANCY:
            maps = role_maps(role, rgb, size=TEX, prefix=prefix)
            wire_maps(material, bsdf, maps, coat=coat, emission=emit, transmission=trans)
        else:
            bsdf.inputs["Roughness"].default_value = 0.52 if role == "ceramic" else 0.32
            bsdf.inputs["Metallic"].default_value = 0.02 if role in ("ceramic", "glass", "refractory") else 0.82
        material["spacefaceRole"] = role
        if lookup_name == "Material_Canopy":
            if "Transmission Weight" in bsdf.inputs:
                bsdf.inputs["Transmission Weight"].default_value = 0.30
            if "Alpha" in bsdf.inputs:
                bsdf.inputs["Alpha"].default_value = 1.0
            if "IOR" in bsdf.inputs:
                bsdf.inputs["IOR"].default_value = 1.52
            if "Specular IOR Level" in bsdf.inputs:
                bsdf.inputs["Specular IOR Level"].default_value = 0.50
            if "Roughness" in bsdf.inputs:
                bsdf.inputs["Roughness"].default_value = 0.090
            if "Metallic" in bsdf.inputs:
                bsdf.inputs["Metallic"].default_value = 0.0
            try:
                material.blend_method = "HASHED"
            except Exception:
                try:
                    material.blend_method = "BLEND"
                except Exception:
                    pass
            if hasattr(material, "use_screen_refraction"):
                material.use_screen_refraction = True
            if hasattr(material, "refraction_depth"):
                material.refraction_depth = 0.42
            if hasattr(material, "use_raytrace_refraction"):
                material.use_raytrace_refraction = True
            if hasattr(material, "use_backface_culling"):
                material.use_backface_culling = False
        mats[lookup_name] = material
    return mats


def link_object(obj, collection):
    for current in list(obj.users_collection):
        current.objects.unlink(obj)
    collection.objects.link(obj)
    return obj


def finish_mesh(obj, material, bevel=0.012):
    obj.data.materials.clear()
    obj.data.materials.append(material)
    if bevel > 0:
        mod = obj.modifiers.new("ProductionBevel", "BEVEL")
        mod.width = bevel
        mod.segments = 2
        mod.limit_method = "ANGLE"
        mod.angle_limit = math.radians(40)
    wn = obj.modifiers.new("WeightedNormal", "WEIGHTED_NORMAL")
    wn.keep_sharp = True
    obj["spacefaceRole"] = material.get("spacefaceRole", "static")
    return obj


def add_box(name, loc, scale, material, collection, bevel=0.012, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cube_add(location=loc, rotation=rot)
    obj = link_object(bpy.context.object, collection)
    obj.name = name
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return finish_mesh(obj, material, bevel)


def add_cylinder(name, loc, radius, depth, material, collection, vertices=16, bevel=0.008, rot=(0, math.pi / 2, 0)):
    bpy.ops.mesh.primitive_cylinder_add(
        vertices=vertices, radius=radius, depth=depth, location=loc, rotation=rot,
    )
    obj = link_object(bpy.context.object, collection)
    obj.name = name
    return finish_mesh(obj, material, bevel)


def add_empty(name, loc, collection, parent=None):
    obj = bpy.data.objects.new(name, None)
    collection.objects.link(obj)
    obj.location = loc
    obj.empty_display_size = 0.18
    if parent is not None:
        obj.parent = parent
    return obj


def loft_from_rings(name, rings, material, collection, bevel, cap=True):
    sides = len(rings[0])
    verts = [vert for ring in rings for vert in ring]
    faces = []
    if cap is True or cap == "both":
        faces.append(tuple(range(sides - 1, -1, -1)))
        faces.append(tuple(range((len(rings) - 1) * sides, len(rings) * sides)))
    elif cap == "front":
        faces.append(tuple(range(sides - 1, -1, -1)))
    elif cap == "aft":
        faces.append(tuple(range((len(rings) - 1) * sides, len(rings) * sides)))
    for station in range(len(rings) - 1):
        a = station * sides
        b = (station + 1) * sides
        for i in range(sides):
            j = (i + 1) % sides
            faces.append((a + i, a + j, b + j, b + i))
    mesh = bpy.data.meshes.new(f"{name}_Mesh")
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)
    return finish_mesh(obj, material, bevel)


def loft_hollow(name, outer_rings, inner_rings, material, collection, bevel, close_front=True, close_aft=False):
    """Thick-walled tube. Rims join outer to inner; optional inner bulkhead caps."""
    sides = len(outer_rings[0])
    stations = len(outer_rings)
    if len(inner_rings) != stations or len(inner_rings[0]) != sides:
        raise ValueError("loft_hollow rings must match")
    verts = [vert for ring in outer_rings for vert in ring]
    verts.extend(vert for ring in inner_rings for vert in ring)
    inner0 = stations * sides
    faces = []
    for station in range(stations - 1):
        a = station * sides
        b = (station + 1) * sides
        ia = inner0 + a
        ib = inner0 + b
        for i in range(sides):
            j = (i + 1) % sides
            faces.append((a + i, a + j, b + j, b + i))
            faces.append((ia + j, ia + i, ib + i, ib + j))
    last = (stations - 1) * sides
    inn_last = inner0 + last
    for i in range(sides):
        j = (i + 1) % sides
        faces.append((last + i, last + j, inn_last + j, inn_last + i))
        faces.append((j, i, inner0 + i, inner0 + j))
    if close_front:
        faces.append(tuple(range(inner0 + sides - 1, inner0 - 1, -1)))
    if close_aft:
        aft0 = inner0 + last
        faces.append(tuple(range(aft0, aft0 + sides)))
    mesh = bpy.data.meshes.new(f"{name}_Mesh")
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)
    return finish_mesh(obj, material, bevel)


def pressure_ring(x, yc, zc, hw, hh, deck=0.62, wall=0.58, chine=0.12, belly=0.38):
    """8-point occupied pressure station: flat deck, vertical walls, hard chine.

    This is an inhabited octagon, not a rounded egg. All stations share vertex
    count so they can loft. Change deck/wall/chine/hw/hh along X; do not scale
    one ring.
    """
    deck = max(0.12, min(0.92, float(deck)))
    wall = max(0.12, min(0.95, float(wall)))
    chine = max(0.0, min(0.40, float(chine)))
    belly = max(0.10, min(0.90, float(belly)))
    dy_deck = hw * deck
    dz_deck = zc + hh
    dy_wall = hw
    dz_wall = zc + hh * wall
    dy_chine = hw
    dz_chine = zc - hh * chine
    dy_keel = hw * (0.22 + 0.50 * (1.0 - belly))
    dz_keel = zc - hh
    return [
        (x, yc - dy_deck, dz_deck),
        (x, yc + dy_deck, dz_deck),
        (x, yc + dy_wall, dz_wall),
        (x, yc + dy_chine, dz_chine),
        (x, yc + dy_keel, dz_keel),
        (x, yc - dy_keel, dz_keel),
        (x, yc - dy_chine, dz_chine),
        (x, yc - dy_wall, dz_wall),
    ]


def corridor_ring(x, y, z, hw, hh):
    """Octagonal inhabited corridor section with real height and wall faces."""
    return [
        (x, y - hw * 0.55, z + hh),
        (x, y + hw * 0.55, z + hh),
        (x, y + hw, z + hh * 0.38),
        (x, y + hw, z - hh * 0.38),
        (x, y + hw * 0.55, z - hh),
        (x, y - hw * 0.55, z - hh),
        (x, y - hw, z - hh * 0.38),
        (x, y - hw, z + hh * 0.38),
    ]


def regular_ring(x, y, z, radius, sides=8):
    return [
        (x, y + math.cos(math.tau * i / sides + math.pi / sides) * radius,
         z + math.sin(math.tau * i / sides + math.pi / sides) * radius)
        for i in range(sides)
    ]


def drive_case_ring(x, y, z, rx, rz, sides=8):
    """Manufactured octagonal case, slightly squashed, flattened inboard."""
    sign = 1.0 if y >= 0 else -1.0
    pts = []
    for i in range(sides):
        ang = math.tau * i / sides + math.pi / sides
        py = math.cos(ang) * rx
        pz = math.sin(ang) * rz
        if sign * py < 0:
            py *= 0.86
        pts.append((x, y + py, z + pz))
    return pts


def inset_large_faces(obj, thickness=0.045, depth=0.016, min_area=0.55):
    apply_modifiers(obj)
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bm.faces.ensure_lookup_table()
    faces = [face for face in bm.faces if face.calc_area() >= min_area]
    if faces:
        bmesh.ops.inset_individual(bm, faces=faces, thickness=thickness, depth=depth)
    bmesh.ops.remove_doubles(bm, verts=list(bm.verts), dist=0.0004)
    bm.to_mesh(obj.data)
    bm.free()
    obj.data.update()
    finish_mesh(obj, obj.data.materials[0], bevel=0.010)


def try_cut_bay(hull, tag, surface, length, width, depth, outward, mats, collection, kit="empty"):
    try:
        cut_open_bay(hull, tag, surface, length, width, depth, outward, mats, collection, kit=kit, liner=True)
        return True
    except Exception as exc:
        print(f"bay skip {tag}: {exc}")
        return False


def add_boarding_vestibule(hull, lod, mats, collection):
    """Recessed port boarding cut and framed glazed vestibule. No bow visor, no cyan pin."""
    glass = mats["Material_Canopy"]
    frame = mats["Material_Armor"]
    hull_mat = mats["Material_Hull"]
    mech = mats["Material_Mechanical"]
    x, z = BOARD_X, BOARD_Z
    y_face = -FORE_HW
    try_cut_bay(hull, "BoardPort", (x, y_face, z), 2.85, 1.72, 0.78, (0.0, -1.0, 0.0), mats, collection, "empty")
    add_box("Board_JambFore", (x + 1.38, y_face - 0.04, z), (0.12, 0.16, 0.92), frame, collection, 0.003)
    add_box("Board_JambAft", (x - 1.38, y_face - 0.04, z), (0.12, 0.16, 0.92), frame, collection, 0.003)
    add_box("Board_Sill", (x, y_face - 0.02, z - 0.82), (1.42, 0.18, 0.10), frame, collection, 0.003)
    add_box("Board_Header", (x, y_face - 0.02, z + 0.82), (1.42, 0.18, 0.10), frame, collection, 0.003)
    add_box("Board_DoorLeaf", (x - 0.22, y_face - 0.10, z - 0.08), (0.55, 0.06, 0.72), frame, collection, 0.002)
    add_box("Board_DoorLite", (x - 0.22, y_face - 0.18, z + 0.18), (0.28, 0.022, 0.22), glass, collection, 0.001)
    add_box("Board_VestPaneFore", (x + 0.72, y_face - 0.20, z + 0.12), (0.48, 0.022, 0.52), glass, collection, 0.001)
    add_box("Board_VestPaneAft", (x - 0.82, y_face - 0.20, z + 0.12), (0.32, 0.022, 0.52), glass, collection, 0.001)
    add_box("Board_Mull", (x + 0.18, y_face - 0.08, z + 0.08), (0.07, 0.12, 0.78), frame, collection, 0.002)
    add_box("Board_InnerWall", (x, y_face + 0.78, z), (1.15, 0.06, 0.78), mech, collection, 0.003)
    add_box("Board_Threshold", (x, y_face - 0.38, z - 0.92), (1.05, 0.32, 0.08), hull_mat, collection, 0.003)
    add_box("Board_ReturnFore", (x + 1.55, y_face + 0.22, z), (0.10, 0.55, 0.85), frame, collection, 0.003)
    add_box("Board_ReturnAft", (x - 1.55, y_face + 0.22, z), (0.10, 0.55, 0.85), frame, collection, 0.003)
    if lod == 0:
        add_box("Board_Handle", (x - 0.02, y_face - 0.16, z - 0.12), (0.04, 0.03, 0.14), mech, collection, 0.001)


def add_boarding_necks(lod, mats, collection):
    """Short pressure neck from the port vestibule into the passenger belt."""
    frame = mats["Material_Armor"]
    hull = mats["Material_Hull"]
    loft_from_rings("BoardNeck_P", [
        corridor_ring(13.55, -FORE_HW + 0.35, 0.55, 0.72, 0.95),
        corridor_ring(11.85, -8.15, 0.48, 0.70, 1.05),
        corridor_ring(10.35, -PASS_HW + 0.15, 0.42, 0.62, 1.12),
    ], hull, collection, 0.006, cap="both")
    if lod <= 1:
        add_box("BoardNeckFrame_P", (11.85, -8.15, 0.48), (0.10, 0.85, 1.05), frame, collection, 0.003)
        add_box("BoardNeckReturn_P", (10.28, -PASS_HW + 0.05, 0.42), (0.14, 0.72, 1.15), frame, collection, 0.003)


def offset_ring_outward(ring, distance, cy=0.0, cz=0.28):
    """Push a YZ station ring along its local outward so a hat web can stand proud."""
    out = []
    for x, y, z in ring:
        vy, vz = y - cy, z - cz
        length = math.hypot(vy, vz) or 1.0
        out.append((x, y + vy / length * distance, z + vz / length * distance))
    return out


def add_hat_station_ring(name, x, hw, hh, mats, collection, deck, wall, chine, belly, inner_hw=None, inner_hh=None):
    """True hat-section pressure ring: standing flange, web, inner return, directional laps.

    Dark satin anodized metal. Not a crushed-black hoop or spacer tape.
    """
    frame = mats["Material_Armor"]
    inner_hw = hw * 0.94 if inner_hw is None else inner_hw
    inner_hh = hh * 0.94 if inner_hh is None else inner_hh
    skin = pressure_ring(x, 0, 0.28, hw, hh, deck, wall, chine, belly)
    stand = 0.16
    axial = 0.28
    # Outer standing flange + web. Radial gap is the visible hat height.
    loft_hollow(
        f"{name}_Flange",
        [
            offset_ring_outward(pressure_ring(x - axial, 0, 0.28, hw, hh, deck, wall, chine, belly), stand),
            offset_ring_outward(pressure_ring(x + axial, 0, 0.28, hw, hh, deck, wall, chine, belly), stand),
        ],
        [
            offset_ring_outward(pressure_ring(x - axial, 0, 0.28, hw, hh, deck, wall, chine, belly), 0.02),
            offset_ring_outward(pressure_ring(x + axial, 0, 0.28, hw, hh, deck, wall, chine, belly), 0.02),
        ],
        frame, collection, 0.004, close_front=True, close_aft=True,
    )
    # Inner return lip onto the shell.
    loft_hollow(
        f"{name}_Return",
        [
            offset_ring_outward(pressure_ring(x - axial * 0.72, 0, 0.28, hw, hh, deck, wall, chine, belly), 0.03),
            offset_ring_outward(pressure_ring(x + axial * 0.72, 0, 0.28, hw, hh, deck, wall, chine, belly), 0.03),
        ],
        [
            pressure_ring(x - axial * 0.72, 0, 0.28, inner_hw, inner_hh, deck, wall, chine, belly),
            pressure_ring(x + axial * 0.72, 0, 0.28, inner_hw, inner_hh, deck, wall, chine, belly),
        ],
        frame, collection, 0.003, close_front=True, close_aft=True,
    )
    # Directional lap plates at four pitch breaks; skip equatorial corridor collars.
    sides = len(skin)
    for i in (0, 3, 4, 7):
        a = Vector(skin[i])
        b = Vector(skin[(i + 1) % sides])
        mid = (a + b) * 0.5
        lap_x = 0.10 if i % 2 == 0 else -0.10
        along = (b - a)
        if along.length < 1e-4:
            continue
        along.normalize()
        outward = Vector((0.0, mid.y, mid.z - 0.28))
        if outward.length < 1e-4:
            outward = Vector((0.0, 0.0, 1.0))
        else:
            outward.normalize()
        width = min(1.15, (b - a).length * 0.42)
        add_box(
            f"{name}_Lap_{i}",
            (x + lap_x, mid.y + outward.y * 0.09, mid.z + outward.z * 0.09),
            (0.07, max(0.12, abs(along.y) * width + 0.10), max(0.12, abs(along.z) * width + 0.10)),
            frame, collection, 0.002,
        )
    # Corridor collars only on the passenger-span rings; gallery roofs root here.
    if hw >= 8.0:
        for tag, sign in (("P", -1.0), ("S", 1.0)):
            add_box(
                f"{name}_Collar_{tag}",
                (x, sign * (hw - 0.04), 0.48),
                (0.22, 0.38, 1.28),
                frame, collection, 0.003,
            )


def add_dorsal_spine(lod, mats, collection):
    """One equipment well tied to bulkheads. Not a row of identical lids."""
    hull = mats["Material_Hull"]
    primer = mats["Material_Radiator"]
    mech = mats["Material_Mechanical"]
    frame = mats["Material_Armor"]
    hat = loft_from_rings("Spine_Well", [
        [(HAT_FORE_X - 0.15, -0.62, 4.95), (HAT_FORE_X - 0.15, -0.20, 5.32), (HAT_FORE_X - 0.15, 0.20, 5.32), (HAT_FORE_X - 0.15, 0.62, 4.95)],
        [(4.6, -0.88, 5.18), (4.6, -0.26, 5.58), (4.6, 0.26, 5.58), (4.6, 0.88, 5.18)],
        [(HAT_AFT_X + 0.15, -0.80, 5.02), (HAT_AFT_X + 0.15, -0.24, 5.42), (HAT_AFT_X + 0.15, 0.24, 5.42), (HAT_AFT_X + 0.15, 0.80, 5.02)],
        [(-8.2, -0.52, 3.85), (-8.2, -0.16, 4.22), (-8.2, 0.16, 4.22), (-8.2, 0.52, 3.85)],
    ], hull, collection, 0.005, cap="both")
    try:
        boolean_cut_box(hat, "SpineWellCut", (4.4, 0.0, 5.48), (2.15, 0.38, 0.22))
    except Exception as exc:
        print(f"spine well skip: {exc}")
    add_box("Spine_WellLiner", (4.4, 0.0, 5.28), (1.85, 0.26, 0.05), mech, collection, 0.001)
    add_box("RadModule_Fore", (6.35, 0.0, 5.22), (1.55, 0.62, 0.16), primer, collection, 0.004)
    try:
        boolean_cut_box(
            bpy.data.objects.get("RadModule_Fore") or hat,
            "RadForeCut", (6.35, 0.0, 5.32), (1.15, 0.38, 0.12),
        )
    except Exception as exc:
        print(f"rad fore skip: {exc}")
    add_box("RadFin_ForeA", (6.05, 0.0, 5.28), (0.04, 0.42, 0.10), primer, collection, 0.001)
    add_box("RadFin_ForeB", (6.35, 0.0, 5.28), (0.04, 0.42, 0.10), primer, collection, 0.001)
    add_box("RadFin_ForeC", (6.65, 0.0, 5.28), (0.04, 0.42, 0.10), primer, collection, 0.001)
    add_box("RadModule_Aft", (-2.85, -0.22, 4.15), (1.15, 0.48, 0.14), primer, collection, 0.004)
    add_box("RadFin_AftA", (-3.15, -0.22, 4.20), (0.035, 0.32, 0.08), primer, collection, 0.001)
    add_box("RadFin_AftB", (-2.55, -0.22, 4.20), (0.035, 0.32, 0.08), primer, collection, 0.001)
    add_box("RepairPlate_Stbd", (2.15, 0.55, 5.18), (0.85, 0.28, 0.06), frame, collection, 0.003)
    if lod == 0:
        add_box("RepairLatch", (2.45, 0.62, 5.22), (0.10, 0.05, 0.04), mech, collection, 0.001)
        add_box("Spine_RootFore", (HAT_FORE_X, 0.0, 5.05), (0.22, 0.22, 0.08), mech, collection, 0.002)
        add_box("Spine_RootWaist", (HAT_AFT_X, 0.0, 4.95), (0.22, 0.20, 0.08), mech, collection, 0.002)
        add_box("Spine_RootAft", (HAT_LOAD_X, 0.0, 2.65), (0.22, 0.18, 0.07), mech, collection, 0.002)
    add_box("Spine_FeedAft", (-10.4, 0.0, 2.05), (1.45, 0.22, 0.12), mech, collection, 0.004)


def add_service_cassette(lod, mats, collection):
    primer, mech = mats["Material_Radiator"], mats["Material_Mechanical"]
    loft_from_rings("Cassette_Body", [
        pressure_ring(7.2, 0, -4.55, 2.65, 0.48, deck=0.82, wall=0.92, chine=0.08, belly=0.78),
        pressure_ring(1.4, 0, -4.78, 3.05, 0.55, deck=0.88, wall=0.94, chine=0.08, belly=0.84),
        pressure_ring(-3.6, 0, -4.62, 2.75, 0.50, deck=0.82, wall=0.92, chine=0.08, belly=0.80),
        pressure_ring(-8.2, 0, -4.05, 1.85, 0.38, deck=0.72, wall=0.90, chine=0.08, belly=0.68),
    ], primer, collection, 0.006, cap="both")
    add_box("Cassette_Seam", (1.35, 0.0, -4.12), (0.045, 2.25, 0.10), mech, collection, 0.002)
    if lod == 0:
        add_box("Cassette_BayA", (4.4, 0.0, -4.08), (1.45, 1.35, 0.045), primer, collection, 0.003)
        add_box("Cassette_BayB", (-2.4, 0.0, -4.08), (1.35, 1.22, 0.045), primer, collection, 0.003)
        for name, loc in (("LatchA", (3.25, 0.88, -4.02)), ("LatchB", (3.25, -0.88, -4.02)),
                          ("LatchC", (-1.25, 0.80, -4.02)), ("LatchD", (-1.25, -0.80, -4.02))):
            add_box(name, loc, (0.12, 0.055, 0.038), mech, collection, 0.002)


def add_keel_and_saddle(lod, mats, collection):
    keel, frame = mats["Material_Mechanical"], mats["Material_Armor"]
    loft_from_rings("Keel_Beam", [
        pressure_ring(8.4, 0, -3.85, 0.48, 0.38, deck=0.18, wall=0.92, chine=0.06, belly=0.88),
        pressure_ring(1.2, 0, -4.85, 0.78, 0.62, deck=0.14, wall=0.94, chine=0.06, belly=0.92),
        pressure_ring(-4.2, 0, -4.72, 0.70, 0.56, deck=0.14, wall=0.92, chine=0.06, belly=0.90),
        pressure_ring(-13.2, 0, -3.05, 0.42, 0.30, deck=0.12, wall=0.90, chine=0.06, belly=0.80),
    ], keel, collection, 0.006, cap="both")
    add_folded_sheet(
        "Saddle_CheekP",
        (1.35, -1.22, -5.15), (-0.55, -1.22, -5.15),
        (-0.25, -0.34, -3.55), (1.05, -0.34, -3.55),
        0.060, keel, collection, 0.004,
    )
    add_folded_sheet(
        "Saddle_CheekS",
        (1.35, 1.22, -5.15), (1.05, 0.34, -3.55),
        (-0.25, 0.34, -3.55), (-0.55, 1.22, -5.15),
        0.060, keel, collection, 0.004,
    )
    add_box("Saddle_Pad", (0.35, 0.0, -5.28), (1.02, 0.68, 0.080), keel, collection, 0.004)
    add_folded_sheet(
        "Saddle_GussetP",
        (1.10, -0.34, -3.72), (-0.18, -0.34, -3.72),
        (-0.62, -1.02, -4.95), (1.38, -1.02, -4.95),
        0.032, frame, collection, 0.003,
    )
    add_folded_sheet(
        "Saddle_GussetS",
        (1.10, 0.34, -3.72), (1.38, 1.02, -4.95),
        (-0.62, 1.02, -4.95), (-0.18, 0.34, -3.72),
        0.032, frame, collection, 0.003,
    )
    add_cylinder("Saddle_Pin", (0.35, 0.0, -4.95), 0.080, 0.32, frame, collection, 10, 0.002, (0, 0, 0))
    if lod == 0:
        add_corner_fasteners("Saddle", (0.35, 0.0, -5.12), (0.62, 0.42, 0.025), frame, collection)


def add_passenger_corridors(lod, mats, collection, passenger_hull=None):
    """Hollow manufactured passenger gallery: recessed pane bays, mullions, inner dark volume.

    Roof has real thickness and roots into the hat-section collars. Glass sits
    behind the frame over a dark interior, not as an opaque card.
    """
    hull = mats["Material_Hull"]
    frame = mats["Material_Armor"]
    glass = mats["Material_Canopy"]
    mech = mats["Material_Mechanical"]
    wall = 0.18
    outer_hw = CORR_HW
    inner_hw = outer_hw - wall
    zc = 0.48
    x0, x1 = 8.95, -0.45
    pane_xs = (7.45, 4.95, 2.45, 0.05)
    for tag, sign in (("P", -1.0), ("S", 1.0)):
        y = sign * (PASS_HW - 0.06)
        corr = loft_hollow(
            f"Corridor_{tag}",
            [
                corridor_ring(x0, y, zc, outer_hw, CORR_HH),
                corridor_ring(4.20, y, zc, outer_hw, CORR_HH),
                corridor_ring(x1, y, zc, outer_hw, CORR_HH),
            ],
            [
                corridor_ring(x0, y - sign * 0.04, zc, inner_hw, CORR_HH - wall),
                corridor_ring(4.20, y - sign * 0.04, zc, inner_hw, CORR_HH - wall),
                corridor_ring(x1, y - sign * 0.04, zc, inner_hw, CORR_HH - wall),
            ],
            hull, collection, 0.005, close_front=True, close_aft=True,
        )
        # Dark inner volume, set back so pane bays read as occupied space.
        loft_from_rings(f"CorridorInner_{tag}", [
            corridor_ring(x0 - 0.12, y - sign * 0.28, zc, inner_hw - 0.10, CORR_HH - wall - 0.14),
            corridor_ring(4.20, y - sign * 0.28, zc, inner_hw - 0.10, CORR_HH - wall - 0.14),
            corridor_ring(x1 + 0.12, y - sign * 0.28, zc, inner_hw - 0.10, CORR_HH - wall - 0.14),
        ], mech, collection, 0.002, cap="both")
        # A set-back galvanized interior datum catches neutral light through
        # the dielectric pane. It is partial and recessed, so the glazing
        # reads as depth and blue-grey reflection rather than an opaque black
        # card or a luminous screen.
        add_box(
            f"CorridorInteriorDatum_{tag}",
            (4.20, y - sign * 0.34, zc - 0.18),
            (4.72, 0.035, 0.22),
            mats["Material_Radiator"], collection, 0.002,
        )
        # Gallery roof with thickness and hat-collar roots — not a pancake or knife card.
        add_box(
            f"CorrRoof_{tag}",
            (4.20, y + sign * 0.04, zc + CORR_HH - 0.02),
            (5.20, 0.46, 0.10),
            hull, collection, 0.003,
        )
        add_box(
            f"CorrRoofReturnFore_{tag}",
            (HAT_FORE_X - 0.06, y - sign * 0.02, zc + CORR_HH - 0.04),
            (0.20, 0.62, 0.14),
            frame, collection, 0.003,
        )
        add_box(
            f"CorrRoofReturnAft_{tag}",
            (HAT_AFT_X + 0.06, y - sign * 0.02, zc + CORR_HH - 0.04),
            (0.20, 0.62, 0.14),
            frame, collection, 0.003,
        )
        add_box(
            f"CorrSill_{tag}",
            (4.20, y + sign * (outer_hw - 0.01), zc - CORR_HH + 0.14),
            (5.15, 0.12, 0.14),
            frame, collection, 0.003,
        )
        add_box(
            f"CorrHead_{tag}",
            (4.20, y + sign * (outer_hw - 0.01), zc + CORR_HH - 0.16),
            (5.15, 0.14, 0.16),
            frame, collection, 0.003,
        )
        add_box(f"CorrReturnFore_{tag}", (HAT_FORE_X - 0.10, y - sign * 0.06, zc), (0.18, 0.78, 1.28), frame, collection, 0.004)
        add_box(f"CorrReturnAft_{tag}", (HAT_AFT_X + 0.10, y - sign * 0.06, zc), (0.18, 0.78, 1.28), frame, collection, 0.004)
        door_index = 1 if sign < 0 else 2
        if lod >= 2:
            face_y = y + sign * (outer_hw - 0.10)
            add_box(f"CorrGlass_{tag}_0", (4.20, face_y, zc + 0.06), (3.05, 0.04, 0.55), glass, collection, 0.001)
            continue
        for i, px in enumerate(pane_xs):
            face_y = y + sign * (outer_hw + 0.01)
            cut_y = y + sign * (outer_hw - 0.04)
            if lod <= 1:
                boolean_cut_box(
                    corr, f"CorrCut_{tag}_{i}",
                    (px, cut_y, zc + 0.06),
                    (0.92, 0.28, 0.72),
                )
            add_box(f"CorrMull_{tag}_{i}", (px + 1.28, face_y - sign * 0.04, zc), (0.10, 0.14, 1.18), frame, collection, 0.002)
            add_box(f"CorrJambFore_{tag}_{i}", (px + 0.78, face_y - sign * 0.05, zc + 0.04), (0.06, 0.12, 0.78), frame, collection, 0.002)
            add_box(f"CorrJambAft_{tag}_{i}", (px - 0.78, face_y - sign * 0.05, zc + 0.04), (0.06, 0.12, 0.78), frame, collection, 0.002)
            glass_y = y + sign * (outer_hw - 0.14)
            if passenger_hull is not None and lod <= 1:
                boolean_cut_box(
                    passenger_hull, f"PassBay_{tag}_{i}",
                    (px, sign * (PASS_HW - 0.08), zc + 0.06),
                    (0.88, 0.32, 0.68),
                )
            if i == door_index:
                add_box(f"CorrDoor_{tag}", (px, face_y - sign * 0.02, zc - 0.10), (0.70, 0.08, 1.02), frame, collection, 0.003)
                add_box(f"CorrDoorLite_{tag}", (px, glass_y, zc + 0.26), (0.36, 0.028, 0.28), glass, collection, 0.001)
                continue
            add_box(f"CorrGlass_{tag}_{i}", (px, glass_y, zc + 0.08), (0.72, 0.022, 0.58), glass, collection, 0.001)
        if lod == 0:
            add_box(f"CorrPlate_{tag}", (3.15, y - sign * 0.08, zc - CORR_HH - 0.14), (1.15, 0.18, 0.05), mats["Material_Radiator"], collection, 0.002)


def add_passenger_clerestory(lod, mats, collection, passenger_hull):
    """Paired stepped-deck galleries visible at the legal chase and abeam poses.

    Each pressure section owns two large recessed panes near its deck edge.
    The staggered heights and dark hat frames replace the Cycle 33 run of tiny
    central cards with an inhabited window rhythm that survives D=144.
    """
    if passenger_hull is None:
        return
    frame = mats["Material_Armor"]
    glass = mats["Material_Canopy"]
    inner = mats["Material_Mechanical"]
    sections = (
        ("Fore", 8.10, 1.20, 2.95, 4.76),
        ("Mid", 4.35, 1.42, 3.55, 5.10),
        ("Aft", 0.45, 1.20, 2.95, 4.76),
    )
    if lod >= 2:
        for section, px, hx, gallery_y, deck_z in sections:
            for side, sign in (("P", -1.0), ("S", 1.0)):
                cy = sign * gallery_y
                add_box(
                    f"GalleryBandLOD2_{section}_{side}",
                    (px, cy, deck_z + 0.015),
                    (hx, 0.78, 0.045),
                    glass, collection, 0.001,
                )
                add_box(
                    f"GalleryMullLOD2_{section}_{side}",
                    (px, cy, deck_z + 0.065),
                    (0.075, 0.80, 0.055),
                    frame, collection, 0.001,
                )
        return
    for section, px, hx, gallery_y, deck_z in sections:
        for side, sign in (("P", -1.0), ("S", 1.0)):
            cy = sign * gallery_y
            hy = 0.92
            boolean_cut_box(
                passenger_hull, f"GalleryCut_{section}_{side}",
                (px, cy, deck_z + 0.02),
                (hx, hy, 0.36),
            )
            add_box(
                f"GalleryWell_{section}_{side}",
                (px, cy, deck_z - 0.20),
                (hx - 0.14, hy - 0.13, 0.08),
                inner, collection, 0.002,
            )
            add_box(
                f"GalleryInteriorDatum_{section}_{side}",
                (px, cy, deck_z - 0.285),
                (max(0.18, hx * 0.62), max(0.16, hy * 0.48), 0.024),
                mats["Material_Radiator"], collection, 0.001,
            )
            add_box(
                f"GalleryGlass_{section}_{side}",
                (px, cy, deck_z - 0.080),
                (hx - 0.19, hy - 0.18, 0.030),
                glass, collection, 0.001,
            )
            add_box(f"GalleryFrameFore_{section}_{side}", (px + hx - 0.075, cy, deck_z + 0.015), (0.075, hy, 0.10), frame, collection, 0.002)
            add_box(f"GalleryFrameAft_{section}_{side}", (px - hx + 0.075, cy, deck_z + 0.015), (0.075, hy, 0.10), frame, collection, 0.002)
            add_box(f"GalleryFrameInner_{section}_{side}", (px, cy - sign * (hy - 0.075), deck_z + 0.015), (hx, 0.075, 0.10), frame, collection, 0.002)
            add_box(f"GalleryFrameOuter_{section}_{side}", (px, cy + sign * (hy - 0.075), deck_z + 0.015), (hx, 0.075, 0.10), frame, collection, 0.002)
            add_box(f"GalleryMull_{section}_{side}", (px, cy, deck_z + 0.010), (0.065, hy - 0.12, 0.085), frame, collection, 0.001)


def add_passenger_pressure_crown(lod, mats, collection):
    """Long axial pressure crown that dominates the abeam civic silhouette.

    The crown only protrudes beyond the passenger shell at its dorsal and
    ventral arcs. Its side slopes stay inboard of the six recessed gallery
    wells, so the inherited occupied rhythm remains readable without becoming
    a transverse wing. The crown now bridges the operations shoulder through
    the machinery course; dark joints make that longitudinal construction
    survive the legal chase distance and all three LODs.
    """
    hull = mats["Material_Hull"]
    frame = mats["Material_Armor"]
    rings = [
        pressure_ring(14.35, 0.0, 0.34, 2.72, 4.05, deck=0.56, wall=0.62, chine=0.10, belly=0.42),
        pressure_ring(9.62, 0.0, 0.34, 3.35, 4.88, deck=0.58, wall=0.60, chine=0.10, belly=0.46),
        pressure_ring(6.48, 0.0, 0.38, 3.72, 5.18, deck=0.58, wall=0.60, chine=0.10, belly=0.46),
        pressure_ring(2.18, 0.0, 0.38, 3.78, 5.22, deck=0.58, wall=0.60, chine=0.10, belly=0.46),
        pressure_ring(-1.28, 0.0, 0.32, 3.42, 4.92, deck=0.58, wall=0.60, chine=0.10, belly=0.46),
        pressure_ring(-5.65, 0.0, 0.28, 2.92, 4.02, deck=0.54, wall=0.64, chine=0.12, belly=0.40),
        pressure_ring(-9.45, 0.0, 0.24, 2.32, 3.12, deck=0.50, wall=0.68, chine=0.14, belly=0.36),
    ]
    loft_from_rings(
        "PassengerAxialPressureCrown", rings, hull, collection,
        0.010 if lod <= 1 else 0.006, cap="both",
    )
    # Paired longitudinal coaming rails bound the pressure crown without
    # touching the deck-edge gallery wells at y=+/-2.95 and +/-3.55.
    add_box("PassengerCrownRail_P", (2.45, -2.10, 5.25), (11.35, 0.075, 0.075), frame, collection, 0.002)
    add_box("PassengerCrownRail_S", (2.45, 2.10, 5.25), (11.35, 0.075, 0.075), frame, collection, 0.002)
    for index, (x, half_y, z) in enumerate((
        (14.30, 1.58, 4.42),
        (9.55, 1.90, 5.18),
        (6.50, 2.12, 5.52),
        (2.20, 2.16, 5.56),
        (-1.20, 1.96, 5.20),
        (-5.60, 1.66, 4.36),
        (-9.40, 1.38, 3.52),
    )):
        add_box(
            f"PassengerCrownCourseJoint_{index}",
            (x, 0.0, z), (0.075, half_y, 0.075),
            frame, collection, 0.002,
        )


def add_drive_saddle(tag, y, lod, mats, collection):
    """Gusseted load-ring saddle. Housing grows from the aft bulkhead, not a stick boom."""
    frame, mech = mats["Material_Armor"], mats["Material_Mechanical"]
    sign = 1.0 if y > 0 else -1.0
    z = DRIVE_Z
    root_y = sign * 4.45
    saddle_y = sign * 4.55
    loft_from_rings(f"DriveSaddle_{tag}", [
        [
            (HAT_LOAD_X + 0.35, root_y - sign * 1.55, 1.88),
            (HAT_LOAD_X + 0.35, root_y + sign * 1.70, 1.76),
            (HAT_LOAD_X + 0.35, root_y + sign * 1.70, -1.34),
            (HAT_LOAD_X + 0.35, root_y - sign * 1.55, -1.46),
        ],
        [
            (HAT_LOAD_X - 1.15, saddle_y - sign * 1.45, z + 1.68),
            (HAT_LOAD_X - 1.15, saddle_y + sign * 1.25, z + 1.58),
            (HAT_LOAD_X - 1.15, saddle_y + sign * 1.25, z - 1.26),
            (HAT_LOAD_X - 1.15, saddle_y - sign * 1.45, z - 1.36),
        ],
    ], frame, collection, 0.006, cap="both")
    add_folded_sheet(
        f"DriveGusset_{tag}",
        (HAT_LOAD_X + 0.15, root_y - sign * 0.25, 1.98),
        (HAT_LOAD_X + 0.15, root_y - sign * 0.25, -1.45),
        (HAT_LOAD_X - 1.35, saddle_y - sign * 0.60, z - 1.16),
        (HAT_LOAD_X - 1.35, saddle_y - sign * 0.60, z + 1.46),
        0.090, frame, collection, 0.004,
    )
    add_folded_sheet(
        f"DriveGussetOut_{tag}",
        (HAT_LOAD_X + 0.05, root_y + sign * 1.45, 1.72),
        (HAT_LOAD_X + 0.05, root_y + sign * 1.45, -1.22),
        (HAT_LOAD_X - 1.05, saddle_y + sign * 1.00, z - 1.02),
        (HAT_LOAD_X - 1.05, saddle_y + sign * 1.00, z + 1.32),
        0.070, frame, collection, 0.004,
    )
    add_box(f"DriveShoe_{tag}", (HAT_LOAD_X + 0.05, root_y, 0.22), (0.52, 1.22, 1.38), frame, collection, 0.004)
    add_box(f"DriveClampBar_{tag}", (HAT_LOAD_X - 1.55, saddle_y, z + 1.62), (0.90, 0.28, 0.12), frame, collection, 0.003)
    if lod == 0:
        add_box(f"DriveClampBolt_{tag}", (HAT_LOAD_X - 1.25, saddle_y, z + 1.72), (0.07, 0.07, 0.06), mech, collection, 0.001)


def add_rooted_vane(name, origin, material, collection, angle, inner=0.22, outer=0.68):
    """Thin stator blade rooted into the liner wall and the hub. Not a shelf or pizza slice."""
    cx, cy, cz = origin
    ca, sa = math.cos(angle), math.sin(angle)

    def p(x, r, v):
        return (cx + x, cy + ca * r - sa * v, cz + sa * r + ca * v)

    ht, tt = 0.008, 0.005
    verts = [
        p(0.18, inner, -ht), p(0.18, inner, ht), p(0.18, outer, ht * 0.55), p(0.18, outer, -ht * 0.55),
        p(-0.72, inner * 1.04, -tt), p(-0.72, inner * 1.04, tt),
        p(-0.68, outer * 0.94, tt * 0.55), p(-0.68, outer * 0.94, -tt * 0.55),
        p(0.22, inner - 0.05, -ht * 1.8), p(0.22, inner - 0.05, ht * 1.8),
        p(-0.08, inner - 0.05, ht * 1.8), p(-0.08, inner - 0.05, -ht * 1.8),
        p(0.20, outer + 0.04, -ht * 1.3), p(0.20, outer + 0.04, ht * 1.3),
        p(0.02, outer + 0.04, ht * 1.3), p(0.02, outer + 0.04, -ht * 1.3),
    ]
    faces = [
        (0, 1, 2, 3), (4, 7, 6, 5),
        (0, 4, 5, 1), (1, 5, 6, 2), (2, 6, 7, 3), (3, 7, 4, 0),
        (0, 1, 9, 8), (8, 9, 10, 11),
        (0, 8, 11, 3), (1, 2, 10, 9),
        (2, 3, 12, 13), (13, 12, 15, 14),
        (2, 13, 14, 6), (3, 7, 15, 12),
    ]
    mesh = bpy.data.meshes.new(f"{name}_Mesh")
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)
    return finish_mesh(obj, material, bevel=0.001)


def add_civic_drive(tag, y, lod, mats, collection):
    """Continuous load-shoulder drive case with a dry refractory bore and dark hub."""
    hull = mats["Material_Hull"]
    frame = mats["Material_Armor"]
    mech = mats["Material_Mechanical"]
    refractory = mats["Material_Ceramic"]
    throat = mats["Material_Thruster"]
    core = mats["Material_Accent"]
    z = DRIVE_Z
    sign = 1.0 if y > 0 else -1.0
    y0 = sign * 4.45
    x0, x1, x2, x3, x4 = HAT_LOAD_X - 0.15, -13.75, -15.50, -17.80, -20.85
    # The pair remains inside the aft pressure envelope. A small root-to-bore
    # convergence establishes load transfer without the swept horn/prong path
    # that dominated Cycle 34.
    y1, y2, y3 = sign * 4.50, sign * 4.55, y
    case = loft_hollow(
        f"DriveHouse_{tag}",
        [
            drive_case_ring(x0, y0, 0.22, 2.38, 2.02, 8),
            drive_case_ring(x1, y1, z, 2.28, 1.92, 8),
            drive_case_ring(x2, y2, z, 2.05, 1.74, 8),
            drive_case_ring(x3, y3, z, 1.72, 1.48, 8),
            drive_case_ring(x4, y, z, DRIVE_R_AFT, DRIVE_R_AFT * 0.92, 8),
        ],
        [
            drive_case_ring(x0, y0, 0.22, 1.90, 1.60, 8),
            drive_case_ring(x1, y1, z, 1.78, 1.48, 8),
            drive_case_ring(x2, y2, z, 1.53, 1.27, 8),
            drive_case_ring(x3, y3, z, 1.20, 1.00, 8),
            drive_case_ring(x4, y, z, DRIVE_R_AFT - 0.32, DRIVE_R_AFT * 0.92 - 0.28, 8),
        ],
        frame, collection, 0.006, close_front=True,
    )
    # Pale shoulder armor grows out of the aft pressure ring and rides the
    # dark case. It shortens the visual fork without closing the twin-bore
    # centerline negative space.
    loft_from_rings(
        f"DriveShoulderDeck_{tag}",
        [
            [
                (HAT_LOAD_X + 0.02, y0 - sign * 1.62, 1.82),
                (HAT_LOAD_X + 0.02, y0 + sign * 1.62, 1.82),
                (HAT_LOAD_X + 0.02, y0 + sign * 1.45, 1.42),
                (HAT_LOAD_X + 0.02, y0 - sign * 1.45, 1.42),
            ],
            [
                (x2 + 0.12, y2 - sign * 1.12, 1.76),
                (x2 + 0.12, y2 + sign * 1.12, 1.76),
                (x2 + 0.12, y2 + sign * 0.98, 1.38),
                (x2 + 0.12, y2 - sign * 0.98, 1.38),
            ],
        ],
        hull, collection, 0.004, cap="both",
    )
    # Three structural collars and primer inspection lands make the long case
    # read as a manufactured propulsion housing before the eye reaches the
    # bore. They follow the same centerline and never bridge the twin void.
    for index, (cx, cy, rx, rz) in enumerate((
        (-14.25, sign * 4.50, 2.20, 1.86),
        (-16.62, sign * 4.55, 1.84, 1.57),
        (-19.35, y, 1.50, 1.31),
    )):
        loft_hollow(
            f"DriveCaseCollar_{tag}_{index}",
            [
                drive_case_ring(cx + 0.11, cy, z, rx + 0.08, rz + 0.08, 8),
                drive_case_ring(cx - 0.11, cy, z, rx + 0.08, rz + 0.08, 8),
            ],
            [
                drive_case_ring(cx + 0.11, cy, z, rx, rz, 8),
                drive_case_ring(cx - 0.11, cy, z, rx, rz, 8),
            ],
            hull, collection, 0.002, close_front=False, close_aft=False,
        )
        add_box(
            f"DriveInspectionLand_{tag}_{index}",
            (cx, cy, z + rz + 0.07),
            (0.58 if index < 2 else 0.42, 0.22, 0.055),
            mats["Material_Radiator"], collection, 0.002,
        )
    bore_y0 = y
    bore_y1 = y
    # Dry refractory inner wall. Same 8-sided family as the housing, not a 10-gon chrome sleeve.
    loft_hollow(
        f"Liner_{tag}",
        [
            drive_case_ring(-16.85, bore_y0, z, 0.86, 0.78, 8),
            drive_case_ring(-18.65, bore_y1, z, 0.80, 0.72, 8),
            drive_case_ring(-20.55, y, z, 0.84, 0.76, 8),
        ],
        [
            drive_case_ring(-16.85, bore_y0, z, 0.62, 0.56, 8),
            drive_case_ring(-18.65, bore_y1, z, 0.54, 0.48, 8),
            drive_case_ring(-20.55, y, z, 0.58, 0.52, 8),
        ],
        refractory, collection, 0.002, close_front=True,
    )
    # Dark oxidized rim, flush with the housing mouth. No chrome lip, no oversize ring.
    loft_hollow(
        f"Throat_{tag}",
        [
            drive_case_ring(-20.35, y, z, DRIVE_R_AFT - 0.04, DRIVE_R_AFT * 0.92 - 0.04, 8),
            drive_case_ring(-20.82, y, z, DRIVE_R_AFT - 0.06, DRIVE_R_AFT * 0.92 - 0.06, 8),
        ],
        [
            drive_case_ring(-20.35, y, z, 0.78, 0.70, 8),
            drive_case_ring(-20.82, y, z, 0.80, 0.72, 8),
        ],
        throat, collection, 0.002, close_front=False,
    )
    add_cylinder(f"ThroatFloor_{tag}", (-16.85, bore_y0, z), 0.48, 0.10, throat, collection, 8, 0.002)
    add_cylinder(f"Hub_{tag}", (-18.55, bore_y1, z), 0.22, 0.85, throat, collection, 8, 0.002)
    add_cylinder(f"HubCap_{tag}", (-18.95, y, z), 0.16, 0.12, mech, collection, 8, 0.001)
    add_cylinder(f"Core_{tag}", (-18.35, y, z), 0.045, 0.08, core, collection, 8, 0.001)
    add_drive_saddle(tag, y, lod, mats, collection)
    if lod == 0:
        for index in range(6):
            add_rooted_vane(
                f"Vane_{tag}_{index}", (-19.15, y, z), throat, collection,
                math.tau * index / 6,
                inner=0.20, outer=0.66,
            )
    return case


def add_propulsion_load_bridge(lod, mats, collection):
    """Common tapered aft pressure shroud carrying both drive cases.

    The shroud wraps the full outer envelope of both cases and ends just ahead
    of their mouths. At supported cameras the plant is therefore one civic
    pressure/load body with two throat openings, never two exposed prongs. The
    paired dry bores, internal centerlines, and socket contract remain intact.
    """
    hull = mats["Material_Hull"]
    frame = mats["Material_Armor"]
    mech = mats["Material_Mechanical"]
    loft_from_rings(
        "PropulsionLoadBridge",
        [
            pressure_ring(HAT_LOAD_X - 0.05, 0.0, 0.24, 7.08, 2.58, deck=0.60, wall=0.76, chine=0.14, belly=0.42),
            pressure_ring(-14.45, 0.0, 0.30, 6.88, 2.42, deck=0.59, wall=0.75, chine=0.14, belly=0.40),
            pressure_ring(-17.20, 0.0, 0.34, 6.52, 2.12, deck=0.58, wall=0.74, chine=0.14, belly=0.38),
            pressure_ring(-19.72, 0.0, 0.38, 6.18, 1.76, deck=0.56, wall=0.72, chine=0.12, belly=0.34),
        ],
        hull, collection, 0.008 if lod <= 1 else 0.005, cap="front",
    )
    for index, (x, half_y, half_z, deck, wall, chine, belly) in enumerate((
        (HAT_LOAD_X - 0.12, 7.10, 2.50, 0.60, 0.76, 0.14, 0.42),
        (-14.45, 6.90, 2.34, 0.59, 0.75, 0.14, 0.40),
        (-17.20, 6.54, 2.04, 0.58, 0.74, 0.14, 0.38),
        (-19.62, 6.20, 1.68, 0.56, 0.72, 0.12, 0.34),
    )):
        loft_hollow(
            f"PropulsionBridgeFrame_{index}",
            [
                pressure_ring(x + 0.10, 0.0, 0.30, half_y + 0.08, half_z + 0.08, deck=deck, wall=wall, chine=chine, belly=belly),
                pressure_ring(x - 0.10, 0.0, 0.30, half_y + 0.08, half_z + 0.08, deck=deck, wall=wall, chine=chine, belly=belly),
            ],
            [
                pressure_ring(x + 0.10, 0.0, 0.30, half_y - 0.14, half_z - 0.14, deck=deck, wall=wall, chine=chine, belly=belly),
                pressure_ring(x - 0.10, 0.0, 0.30, half_y - 0.14, half_z - 0.14, deck=deck, wall=wall, chine=chine, belly=belly),
            ],
            frame, collection, 0.002, close_front=False, close_aft=False,
        )
    # A set-in centerline service spine makes the load path legible with the
    # paint response disabled; it is not hung in the space between cases.
    add_box(
        "PropulsionBridgeKeel",
        (-16.05, 0.0, -1.72), (3.48, 0.34, 0.18),
        mech, collection, 0.003,
    )


def add_dock_hardware(tag, loc, mats, collection, lod, cyan=True):
    frame, accent = mats["Material_Armor"], (
        mats["Material_Accent"] if cyan else mats["Material_Warning"]
    )
    x, y, z = loc
    sign = 1.0 if y > 0 else -1.0
    add_box(f"Dock_Jamb_{tag}", (x, y, z), (1.15, 0.055, 0.78), frame, collection, 0.003)
    add_box(f"Dock_Frame_{tag}", (x, y + 0.05 * sign, z), (1.28, 0.034, 0.88), frame, collection, 0.002)
    add_box(f"Dock_Plate_{tag}", (x + 0.52, y + 0.03 * sign, z - 0.04), (0.16, 0.032, 0.22), mats["Material_Radiator"], collection, 0.002)
    add_cylinder(f"Dock_Lamp_{tag}", (x, y + 0.07 * sign, z + 0.22), 0.028, 0.04, accent, collection, 10, 0.001, (math.pi / 2, 0, 0))
    if lod == 0:
        for i, (ox, oz) in enumerate(((-0.78, -0.52), (-0.78, 0.52), (0.78, -0.52), (0.78, 0.52))):
            add_cylinder(
                f"Dock_Bolt_{tag}_{i}",
                (x + ox, y + 0.09 * sign, z + oz),
                0.016, 0.034, mats["Material_Mechanical"], collection, 6, 0.001, (math.pi / 2, 0, 0),
            )


def sockets():
    return {
        "SOCKET_Weapon_Front": (17.85, 0.0, 0.55),
        "SOCKET_Engine_Main": (-20.15, 0.0, DRIVE_Z),
        "SOCKET_Trail_Main": (-20.85, 0.0, DRIVE_Z),
        "SOCKET_Trail_Port": (-20.85, -DRIVE_Y, DRIVE_Z),
        "SOCKET_Trail_Starboard": (-20.85, DRIVE_Y, DRIVE_Z),
        "SOCKET_Utility_Dorsal": (4.4, 0.0, 5.55),
        "SOCKET_Cargo_Ventral": (0.35, 0.0, -5.28),
        "SOCKET_Camera_Focus": (0.4, 0.0, 0.45),
        "SOCKET_RCS_Port": (8.8, -(PASS_HW + 0.22), 0.85),
        "SOCKET_RCS_Starboard": (8.8, PASS_HW + 0.22, 0.85),
        "SOCKET_Dock_Port": (3.40, -BELT_OUTER, 0.42),
        "SOCKET_Service_Starboard": (-1.80, BELT_OUTER, 0.42),
        "SOCKET_Tether_Keel": (0.35, 0.0, -5.28),
    }


def apply_shade(obj):
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    apply_modifiers(obj)
    try:
        bpy.ops.object.shade_smooth_by_angle(angle=math.radians(SHADE_ANGLE))
    except Exception:
        for poly in obj.data.polygons:
            poly.use_smooth = True
    obj.select_set(False)


def _ensure_uv(mesh):
    if mesh.uv_layers.get("UVMap") is None:
        mesh.uv_layers.new(name="UVMap")
    mesh.uv_layers.active = mesh.uv_layers["UVMap"]
    return mesh.uv_layers["UVMap"].data


def uv_cylinder_axis(obj, origin, axis=(1.0, 0.0, 0.0), length=42.0):
    """Cylindrical UV around an axis. Caps get a planar YZ/radial map so they cannot box-unwrap."""
    mesh = obj.data
    uv = _ensure_uv(mesh)
    origin = Vector(origin)
    axis = Vector(axis)
    if axis.length < 1e-8:
        axis = Vector((1.0, 0.0, 0.0))
    axis.normalize()
    helper = Vector((0.0, 0.0, 1.0)) if abs(axis.z) < 0.9 else Vector((0.0, 1.0, 0.0))
    u_axis = axis.cross(helper)
    if u_axis.length < 1e-8:
        u_axis = Vector((0.0, 1.0, 0.0))
    u_axis.normalize()
    v_radial = axis.cross(u_axis)
    v_radial.normalize()
    for poly in mesh.polygons:
        n = poly.normal
        cap = abs(n.dot(axis)) > 0.72
        for li in poly.loop_indices:
            co = Vector(mesh.vertices[mesh.loops[li].vertex_index].co) - origin
            along = co.dot(axis)
            radial = co - axis * along
            if cap:
                uu = co.dot(u_axis) / 12.0 + 0.5
                vv = co.dot(v_radial) / 12.0 + 0.5
            else:
                uu = (math.atan2(radial.dot(u_axis), radial.dot(v_radial)) / math.tau) + 0.5
                vv = (along / max(1e-4, length)) + 0.5
            uv[li].uv = (uu, vv)


def uv_box_project(obj, cube_size=6.0):
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    try:
        bpy.ops.uv.cube_project(cube_size=cube_size, correct_aspect=True, scale_to_bounds=True)
    except Exception:
        try:
            bpy.ops.uv.unwrap(method="ANGLE_BASED", margin=0.018)
        except Exception:
            bpy.ops.uv.smart_project(angle_limit=66.0, island_margin=0.018, scale_to_bounds=True)
    bpy.ops.object.mode_set(mode="OBJECT")
    obj.select_set(False)


def uv_for_object(obj):
    """Role-aware unwrap. Drums/rings/housings get cylinder UVs so they cannot wood-grain."""
    name = obj.name.lower()
    apply_shade(obj)
    if any(token in name for token in (
        "drivehouse", "liner_", "throat_", "hub_", "vane_", "core_", "hubcap", "throatfloor",
    )):
        bbox = [Vector(corner) for corner in obj.bound_box]
        center = sum(bbox, Vector((0.0, 0.0, 0.0))) / 8.0
        uv_cylinder_axis(obj, (center.x, center.y, center.z), (1.0, 0.0, 0.0), 12.0)
    elif any(token in name for token in ("station_", "hat_", "corridor", "passliner", "boardneck", "spine_well")):
        uv_cylinder_axis(obj, (0.0, 0.0, 0.28), (1.0, 0.0, 0.0), 42.0)
    else:
        uv_box_project(obj)


def shade_and_uv(obj):
    """Post-join shade only. Per-part UVs are authored before join."""
    apply_shade(obj)
    mesh = obj.data
    _ensure_uv(mesh)
    if "UV1" in mesh.uv_layers:
        mesh.uv_layers.remove(mesh.uv_layers["UV1"])
    uv1 = mesh.uv_layers.new(name="UV1")
    uv0 = mesh.uv_layers["UVMap"]
    for loop in mesh.loops:
        uv1.data[loop.index].uv = uv0.data[loop.index].uv * 7.0


OPS = dict(deck=0.62, wall=0.70, chine=0.16, belly=0.28)
PASS = dict(deck=0.32, wall=0.78, chine=0.14, belly=0.36)
MAC = dict(deck=0.28, wall=0.88, chine=0.22, belly=0.32)


def forward_stations(lod):
    """Operations/boarding shoulder. Snub bow, then a parallel narrower station."""
    if lod >= 2:
        return [
            pressure_ring(19.15, 0, 0.22, 2.18, 1.86, deck=0.38, wall=0.46, chine=0.10, belly=0.18),
            pressure_ring(17.55, 0, 0.30, 3.55, 2.62, deck=0.48, wall=0.56, chine=0.12, belly=0.22),
            pressure_ring(15.55, 0, 0.36, 5.45, 3.85, **OPS),
            pressure_ring(10.55, 0, 0.40, FORE_HW, FORE_HH, **OPS),
        ]
    return [
        pressure_ring(19.15, 0, 0.22, 2.18, 1.86, deck=0.38, wall=0.46, chine=0.10, belly=0.18),
        pressure_ring(17.55, 0, 0.30, 3.55, 2.62, deck=0.48, wall=0.56, chine=0.12, belly=0.22),
        pressure_ring(16.35, 0, 0.36, 4.85, 3.45, deck=0.55, wall=0.62, chine=0.14, belly=0.24),
        pressure_ring(14.15, 0, 0.40, 6.05, 4.05, **OPS),
        pressure_ring(10.55, 0, 0.40, FORE_HW, FORE_HH, **OPS),
    ]


def passenger_stations(lod):
    """Three visibly stepped passenger pressure sections, not one pale slab."""
    if lod >= 2:
        return [
            pressure_ring(9.85, 0, 0.38, 8.20, 4.08, deck=0.38, wall=0.76, chine=0.14, belly=0.34),
            pressure_ring(6.65, 0, 0.40, 8.55, 4.42, deck=0.35, wall=0.77, chine=0.14, belly=0.35),
            pressure_ring(6.35, 0, 0.42, PASS_HW, 4.72, deck=0.32, wall=0.78, chine=0.14, belly=0.36),
            pressure_ring(2.35, 0, 0.42, PASS_HW, 4.72, deck=0.32, wall=0.78, chine=0.14, belly=0.36),
            pressure_ring(2.05, 0, 0.40, 8.55, 4.42, deck=0.35, wall=0.77, chine=0.14, belly=0.35),
            pressure_ring(-1.20, 0, 0.36, 8.25, 4.18, deck=0.37, wall=0.77, chine=0.14, belly=0.34),
        ]
    return [
        pressure_ring(9.85, 0, 0.38, 8.20, 4.08, deck=0.38, wall=0.76, chine=0.14, belly=0.34),
        pressure_ring(9.55, 0, 0.38, 8.20, 4.08, deck=0.38, wall=0.76, chine=0.14, belly=0.34),
        pressure_ring(9.25, 0, 0.40, 8.55, 4.42, deck=0.35, wall=0.77, chine=0.14, belly=0.35),
        pressure_ring(6.65, 0, 0.40, 8.55, 4.42, deck=0.35, wall=0.77, chine=0.14, belly=0.35),
        pressure_ring(6.35, 0, 0.42, PASS_HW, 4.72, deck=0.32, wall=0.78, chine=0.14, belly=0.36),
        pressure_ring(2.35, 0, 0.42, PASS_HW, 4.72, deck=0.32, wall=0.78, chine=0.14, belly=0.36),
        pressure_ring(2.05, 0, 0.40, 8.55, 4.42, deck=0.35, wall=0.77, chine=0.14, belly=0.35),
        pressure_ring(-1.20, 0, 0.36, 8.25, 4.18, deck=0.37, wall=0.77, chine=0.14, belly=0.34),
    ]


def passenger_inner_stations(lod):
    """Inner wall follows every Cycle 34 step with a 0.22 m shell."""
    outer = passenger_stations(lod)
    result = []
    for ring in outer:
        x = ring[0][0]
        cy = sum(p[1] for p in ring) / len(ring)
        zc = (max(p[2] for p in ring) + min(p[2] for p in ring)) * 0.5
        hw = max(abs(p[1] - cy) for p in ring) - PASS_WALL
        hh = (max(p[2] for p in ring) - min(p[2] for p in ring)) * 0.5 - PASS_WALL
        top_half = max(abs(p[1] - cy) for p in ring[:2])
        deck = top_half / max(hw + PASS_WALL, 1e-6)
        wall_z = max(ring[2][2], ring[7][2])
        wall = (wall_z - zc) / max(hh + PASS_WALL, 1e-6)
        chine_z = min(ring[3][2], ring[6][2])
        chine = max(0.0, (zc - chine_z) / max(hh + PASS_WALL, 1e-6))
        keel_half = max(abs(p[1] - cy) for p in ring[4:6])
        belly = 1.0 - max(0.0, (keel_half / max(hw + PASS_WALL, 1e-6) - 0.22) / 0.50)
        result.append(pressure_ring(x, cy, zc, hw, hh, deck=deck, wall=wall, chine=chine, belly=belly))
    return result


def passenger_liner_stations(lod):
    """Set-back dark inner volume matching the stepped passenger shell."""
    result = []
    for ring in passenger_inner_stations(lod):
        x = ring[0][0]
        zc = (max(p[2] for p in ring) + min(p[2] for p in ring)) * 0.5
        hw = max(abs(p[1]) for p in ring) - 0.12
        hh = (max(p[2] for p in ring) - min(p[2] for p in ring)) * 0.5 - 0.12
        result.append(pressure_ring(x, 0, zc, hw, hh, deck=0.35, wall=0.77, chine=0.14, belly=0.35))
    return result


def aft_stations(lod):
    """Aft machinery bulkhead. Boxier, more vertical walls, load-ring face."""
    if lod >= 2:
        return [
            pressure_ring(-1.90, 0, 0.22, AFT_HW, AFT_HH, **MAC),
            pressure_ring(-7.20, 0, 0.16, 6.25, 3.45, **MAC),
            pressure_ring(HAT_LOAD_X, 0, 0.10, 6.25, 2.95, deck=0.22, wall=0.82, chine=0.18, belly=0.24),
        ]
    return [
        pressure_ring(-1.90, 0, 0.22, AFT_HW, AFT_HH, **MAC),
        pressure_ring(-4.80, 0, 0.20, 6.45, 3.65, **MAC),
        pressure_ring(-8.20, 0, 0.16, 6.15, 3.35, **MAC),
        pressure_ring(-11.05, 0, 0.12, 5.55, 2.85, deck=0.24, wall=0.84, chine=0.20, belly=0.26),
        pressure_ring(HAT_LOAD_X, 0, 0.10, 6.25, 2.95, deck=0.22, wall=0.82, chine=0.18, belly=0.24),
    ]


def duplicate_object(obj, name, collection):
    dup = obj.copy()
    dup.data = obj.data.copy()
    dup.name = name
    collection.objects.link(dup)
    return dup


def inflate_mesh(obj, distance):
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bm.normal_update()
    for vert in bm.verts:
        vert.co += vert.normal * distance
    bm.to_mesh(obj.data)
    bm.free()
    obj.data.update()


def raise_high_source(obj):
    """Genuinely higher than the game mesh: tighter bevels and extra panel steps."""
    try:
        inset_large_faces(obj, thickness=0.028, depth=0.014, min_area=0.22)
    except Exception as exc:
        print(f"high inset skip {obj.name}: {exc}")
    mod = obj.modifiers.new("HighBevel", "BEVEL")
    mod.width = BEVEL_HIGH
    mod.segments = 3
    mod.limit_method = "ANGLE"
    mod.angle_limit = math.radians(28)
    apply_modifiers(obj)


def ensure_cycles():
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = BAKE_AO_SAMPLES
    scene.cycles.use_denoising = False
    if hasattr(scene.cycles, "preview_samples"):
        scene.cycles.preview_samples = 4


def bake_pass(low, highs, cage, img, bake_type):
    mat = low.data.materials[0]
    nodes = mat.node_tree.nodes
    tex = nodes.new("ShaderNodeTexImage")
    tex.image = img
    tex.name = "SF_BAKE_TARGET"
    nodes.active = tex
    tex.select = True
    bpy.ops.object.select_all(action="DESELECT")
    for high in highs:
        high.hide_render = False
        high.hide_set(False)
        high.select_set(True)
    low.select_set(True)
    bpy.context.view_layer.objects.active = low
    scene = bpy.context.scene
    scene.cycles.bake_type = bake_type
    scene.render.bake.use_selected_to_active = True
    scene.render.bake.use_cage = True
    try:
        scene.render.bake.cage_object = cage.name
    except TypeError:
        scene.render.bake.cage_object = cage
    scene.render.bake.cage_extrusion = 0.0
    scene.render.bake.margin = 8
    if bake_type == "NORMAL":
        scene.render.bake.normal_space = "TANGENT"
        try:
            scene.render.bake.normal_r = "POS_X"
            scene.render.bake.normal_g = "POS_Y"
            scene.render.bake.normal_b = "POS_Z"
        except Exception:
            pass
    bpy.ops.object.bake(type=bake_type, use_clear=True, margin=8)
    for node in [n for n in nodes if n.name == "SF_BAKE_TARGET"]:
        nodes.remove(node)
    img.pack()
    return img


def pointiness_material(name):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    nodes.clear()
    out = nodes.new("ShaderNodeOutputMaterial")
    emit = nodes.new("ShaderNodeEmission")
    geom = nodes.new("ShaderNodeNewGeometry")
    ramp = nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].position = 0.42
    ramp.color_ramp.elements[0].color = (0.08, 0.08, 0.08, 1)
    ramp.color_ramp.elements[1].position = 0.62
    ramp.color_ramp.elements[1].color = (0.92, 0.92, 0.92, 1)
    links.new(geom.outputs["Pointiness"], ramp.inputs["Fac"])
    links.new(ramp.outputs["Color"], emit.inputs["Color"])
    links.new(emit.outputs["Emission"], out.inputs["Surface"])
    return mat


def bake_curvature(high, low, cage, img):
    backup = [slot.material for slot in high.material_slots]
    mat = pointiness_material(f"CURV_{high.name}")
    if high.material_slots:
        high.material_slots[0].material = mat
    else:
        high.data.materials.append(mat)
    try:
        bake_pass(low, [high], cage, img, "EMIT")
    finally:
        if backup and high.material_slots:
            high.material_slots[0].material = backup[0]


def sanitize_normal_pixels(pixels, size):
    out = list(pixels)
    count = size * size
    for i in range(count):
        r = out[i * 4]
        g = out[i * 4 + 1]
        b = out[i * 4 + 2]
        if b < 0.55 or r < 0.08 or r > 0.92 or g < 0.08 or g > 0.92:
            out[i * 4] = 0.5
            out[i * 4 + 1] = 0.5
            out[i * 4 + 2] = 1.0
    return out


def composite_unique(role, rgb, ao_img, curv_img, nrm_img, size, prefix):
    ao = list(ao_img.pixels) if ao_img else []
    curv = list(curv_img.pixels) if curv_img else []
    nrm = sanitize_normal_pixels(list(nrm_img.pixels), size) if nrm_img else []
    albedo, orm = [], []
    br, bg, bb = rgb
    metal_base = {
        "ceramic": 0.02, "frame": 0.82, "keel": 0.88, "primer": 0.14,
        "refractory": 0.02, "glass": 0.0, "cyan": 0.06, "amber": 0.04, "throat": 0.16,
    }.get(role, 0.12)
    rough_base = {
        "ceramic": 0.56, "frame": 0.30, "keel": 0.28, "primer": 0.58,
        "refractory": 0.78, "glass": 0.090, "cyan": 0.22, "amber": 0.36, "throat": 0.54,
    }.get(role, 0.45)
    count = size * size
    for i in range(count):
        a = ao[i * 4] if ao else 0.92
        c = curv[i * 4] if curv else 0.5
        cavity = max(0.0, 0.48 - c) * 2.1
        edge = max(0.0, c - 0.60) * 2.0
        x = i % size
        y = i // size
        gf = h01(x, y, 19)
        if role == "glass":
            a = max(0.86, a)
            r, g, b = br, bg, bb
            rough = 0.090 + cavity * 0.02
            metal = 0.0
        elif role == "ceramic":
            a = max(0.72, min(1.0, a))
            wear = edge * 0.025 + (gf - 0.5) * 0.012
            r = max(0, min(1, br + wear))
            g = max(0, min(1, bg + wear * 0.7))
            b = max(0, min(1, bb + wear * 0.4))
            rough = max(0.50, min(0.64, rough_base + cavity * 0.05 - edge * 0.03))
            metal = metal_base + edge * 0.03
        elif role == "frame":
            a = max(0.40, a)
            r = max(0, min(1, br + edge * 0.04 + (gf - 0.5) * 0.02))
            g = max(0, min(1, bg + edge * 0.03))
            b = max(0, min(1, bb + edge * 0.02))
            rough = max(0.22, min(0.42, rough_base + cavity * 0.08 - edge * 0.06))
            metal = min(1.0, metal_base + edge * 0.04)
        elif role == "refractory":
            a = max(0.50, a)
            grain = (gf - 0.5) * 0.025
            r = max(0, min(1, br + grain))
            g = max(0, min(1, bg + grain * 0.6))
            b = max(0, min(1, bb + grain * 0.3))
            rough = max(0.70, min(0.88, rough_base + cavity * 0.05))
            metal = metal_base
        elif role == "throat":
            a = max(0.48, a)
            r = max(0, min(1, br + edge * 0.02))
            g = max(0, min(1, bg + edge * 0.015))
            b = max(0, min(1, bb + edge * 0.01))
            rough = max(0.46, min(0.66, rough_base + cavity * 0.05))
            metal = metal_base
        else:
            a = max(0.45, a)
            r = max(0, min(1, br + (gf - 0.5) * 0.02 + edge * 0.03))
            g = max(0, min(1, bg + (gf - 0.5) * 0.015))
            b = max(0, min(1, bb + (gf - 0.5) * 0.01))
            rough = max(0.12, min(0.86, rough_base + cavity * 0.08 - edge * 0.05))
            metal = metal_base
        albedo.extend((r, g, b, 1.0))
        orm.extend((max(0.18, min(1.0, a)), max(0.05, min(0.94, rough)), max(0.0, min(1.0, metal)), 1.0))
    base = write_pixels(f"liner_{prefix}_{size}_basecolor", albedo, size, "sRGB")
    orm_img = write_pixels(f"liner_{prefix}_{size}_orm", orm, size, "Non-Color")
    if nrm:
        nrm_out = write_pixels(f"liner_{prefix}_{size}_normal", nrm, size, "Non-Color")
    else:
        nrm_out = write_pixels(
            f"liner_{prefix}_{size}_normal",
            [0.5, 0.5, 1.0, 1.0] * count,
            size, "Non-Color",
        )
    return base, orm_img, nrm_out


def extra_high_meso(low, collection, material):
    """Meso construction for the bake high, not random corner bolts."""
    extras = []
    name = low.name.lower()
    bbox = [Vector(c) for c in low.bound_box]
    center = sum(bbox, Vector((0, 0, 0))) / 8.0
    size = (
        max(v.x for v in bbox) - min(v.x for v in bbox),
        max(v.y for v in bbox) - min(v.y for v in bbox),
        max(v.z for v in bbox) - min(v.z for v in bbox),
    )
    world = low.matrix_world @ center
    if "hull" in name or "armor" in name:
        extras.append(add_box(
            f"{low.name}_HighSeam",
            (world.x, world.y, world.z + size[2] * 0.18),
            (max(0.18, size[0] * 0.22), 0.018, 0.012),
            material, collection, 0.0,
        ))
    return extras


def bake_lod0_unique(merged, collection, mats):
    """High-to-low cage bake onto unique UV0. MTX-20/21/22/23/24/25."""
    ensure_cycles()
    bake_roles = {
        "Hull": ("ceramic", ROLE_RGB["ceramic"], mats["Material_Hull"], 1024),
        "Armor": ("frame", ROLE_RGB["frame"], mats["Material_Armor"], 512),
        "Mechanical": ("keel", ROLE_RGB["keel"], mats["Material_Mechanical"], 512),
        "Ceramic": ("refractory", ROLE_RGB["refractory"], mats["Material_Ceramic"], 512),
        "Radiator": ("primer", ROLE_RGB["primer"], mats["Material_Radiator"], 512),
        "Thruster": ("throat", ROLE_RGB["throat"], mats["Material_Thruster"], 512),
        "Canopy": ("glass", ROLE_RGB["glass"], mats["Material_Canopy"], 512),
    }
    report = {"baked": [], "failed": []}
    leftovers = []
    key_by_role = {
        "ceramic": "Hull",
        "frame": "Armor",
        "keel": "Mechanical",
        "refractory": "Ceramic",
        "primer": "Radiator",
        "throat": "Thruster",
        "glass": "Canopy",
    }
    for obj in list(merged):
        material = obj.data.materials[0] if obj.data.materials else None
        key = key_by_role.get(material.get("spacefaceRole")) if material else None
        if key is None:
            continue
        role, rgb, material, size = bake_roles[key]
        prefix = f"lod0_{key.lower()}"
        high = duplicate_object(obj, f"{obj.name}_HIGH", collection)
        raise_high_source(high)
        extras = extra_high_meso(high, collection, material)
        if extras:
            bpy.ops.object.select_all(action="DESELECT")
            for extra in extras:
                apply_modifiers(extra)
                extra.select_set(True)
            high.select_set(True)
            bpy.context.view_layer.objects.active = high
            bpy.ops.object.join()
            high = bpy.context.object
            high.name = f"{obj.name}_HIGH"
        cage = duplicate_object(obj, f"{obj.name}_CAGE", collection)
        inflate_mesh(cage, CAGE_INFLATE)
        cage.hide_render = True
        ao = bpy.data.images.new(f"BAKE_AO_{obj.name}", width=size, height=size, alpha=True)
        ao.colorspace_settings.name = "Non-Color"
        nrm = bpy.data.images.new(f"BAKE_NRM_{obj.name}", width=size, height=size, alpha=True)
        nrm.colorspace_settings.name = "Non-Color"
        curv = bpy.data.images.new(f"BAKE_CURV_{obj.name}", width=size, height=size, alpha=True)
        curv.colorspace_settings.name = "Non-Color"
        try:
            bake_pass(obj, [high], cage, nrm, "NORMAL")
            bake_pass(obj, [high], cage, ao, "AO")
            bake_curvature(high, obj, cage, curv)
            maps = composite_unique(role, rgb, ao, curv, nrm, size, prefix)
            bsdf = next((n for n in obj.data.materials[0].node_tree.nodes if n.type == "BSDF_PRINCIPLED"), None)
            if bsdf is None:
                bsdf = principled(obj.data.materials[0])
            else:
                for node in list(obj.data.materials[0].node_tree.nodes):
                    if node.type != "OUTPUT_MATERIAL" and node != bsdf:
                        obj.data.materials[0].node_tree.nodes.remove(node)
            coat = 0.0 if key == "Hull" else (0.35 if key == "Canopy" else 0.05 if key == "Armor" else 0.0)
            trans = 0.30 if key == "Canopy" else 0.0
            wire_maps(obj.data.materials[0], bsdf, maps, coat=coat, transmission=trans)
            if key == "Canopy":
                mat = obj.data.materials[0]
                if "IOR" in bsdf.inputs:
                    bsdf.inputs["IOR"].default_value = 1.52
                if "Specular IOR Level" in bsdf.inputs:
                    bsdf.inputs["Specular IOR Level"].default_value = 0.50
                if "Roughness" in bsdf.inputs:
                    bsdf.inputs["Roughness"].default_value = 0.090
                if "Alpha" in bsdf.inputs:
                    bsdf.inputs["Alpha"].default_value = 1.0
                try:
                    mat.blend_method = "HASHED"
                except Exception:
                    pass
                if hasattr(mat, "use_screen_refraction"):
                    mat.use_screen_refraction = True
            report["baked"].append(obj.name)
            print(f"baked {obj.name} size={size}")
        except Exception as exc:
            report["failed"].append(f"{obj.name}: {exc}")
            print(f"bake fail {obj.name}: {exc}")
        leftovers.extend((high, cage))
    for victim in leftovers:
        try:
            bpy.data.objects.remove(victim, do_unlink=True)
        except Exception:
            pass
    return report


def build_lod(lod, mats):
    collection = bpy.data.collections.new(f"LINER_LOD{lod}")
    bpy.context.scene.collection.children.link(collection)
    hull_mat = mats["Material_Hull"]
    root = add_empty(f"LINER_LOD{lod}_ROOT", (0, 0, 0), collection)
    root["spacefaceAsset"] = spaceface_asset_metadata(lod)
    hull_fore = loft_from_rings("Station_Ops", forward_stations(lod), hull_mat, collection, BEVEL_HULL, cap="both")
    hull_pass = loft_hollow(
        "Station_Passenger",
        passenger_stations(lod),
        passenger_inner_stations(lod),
        hull_mat, collection, BEVEL_HULL, close_front=True, close_aft=True,
    )
    loft_from_rings(
        "PassLiner",
        passenger_liner_stations(lod),
        mats["Material_Mechanical"], collection, 0.002, cap="both",
    )
    hull_aft = loft_from_rings("Station_Machinery", aft_stations(lod), hull_mat, collection, BEVEL_HULL, cap="both")
    hull_obj = hull_fore
    if lod <= 1:
        add_boarding_vestibule(hull_fore, lod, mats, collection)
        add_boarding_necks(lod, mats, collection)
        try_cut_bay(hull_pass, "PortDock", (3.40, -PASS_HW + 0.20, 0.28), 2.15, 1.05, 0.48, (0, -1, 0), mats, collection, "empty")
        try_cut_bay(hull_pass, "StbdService", (-0.55, PASS_HW - 0.20, 0.28), 2.05, 0.98, 0.46, (0, 1, 0), mats, collection, "empty")
        add_dock_hardware("Port", (3.40, -BELT_OUTER, 0.42), mats, collection, lod, cyan=True)
        add_dock_hardware("Stbd", (-1.80, BELT_OUTER, 0.42), mats, collection, lod, cyan=False)
        add_dorsal_spine(lod, mats, collection)
        add_passenger_corridors(lod, mats, collection, passenger_hull=hull_pass)
        add_passenger_clerestory(lod, mats, collection, hull_pass)
        add_hat_station_ring(
            "Hat_Shoulder", HAT_FORE_X, 9.05, 4.18, mats, collection,
            0.38, 0.76, 0.14, 0.34,
            inner_hw=FORE_HW * 0.98, inner_hh=FORE_HH * 0.98,
        )
        add_hat_station_ring(
            "Hat_GalleryFore", 6.50, PASS_HW, 4.72, mats, collection,
            0.32, 0.78, 0.14, 0.36, inner_hw=9.48, inner_hh=4.32,
        )
        add_hat_station_ring(
            "Hat_GalleryAft", 2.20, PASS_HW - 0.20, 4.48, mats, collection,
            0.34, 0.77, 0.14, 0.35, inner_hw=9.08, inner_hh=4.08,
        )
        add_hat_station_ring(
            "Hat_Waist", HAT_AFT_X, PASS_HW - 0.60, 4.22, mats, collection,
            0.37, 0.77, 0.14, 0.34,
            inner_hw=AFT_HW * 0.98, inner_hh=AFT_HH * 0.98,
        )
        add_hat_station_ring(
            "Hat_Load", HAT_LOAD_X, 6.40, 3.08, mats, collection,
            0.22, 0.82, 0.18, 0.24, inner_hw=5.45, inner_hh=2.45,
        )
        roof_z = 0.38 + PASS_HH + 0.05
        for i, rx in enumerate((7.15, 4.20, 1.25)):
            add_box(
                f"PassRoofRib_{i}",
                (rx, 0.0, roof_z),
                (0.09, PASS_HW * PASS["deck"] * 0.90, 0.07),
                mats["Material_Armor"], collection, 0.002,
            )
            try:
                boolean_cut_box(
                    hull_pass, f"PassRoofRecess_{i}",
                    (rx, 0.0, roof_z - 0.04),
                    (1.15, PASS_HW * PASS["deck"] * 0.58, 0.09),
                )
            except Exception as exc:
                print(f"roof recess skip {i}: {exc}")
        for station in (hull_fore, hull_pass, hull_aft):
            try:
                inset_large_faces(station, thickness=0.055, depth=0.014, min_area=2.2)
            except Exception as exc:
                print(f"inset skip {station.name}: {exc}")
    else:
        add_box("Board_CutLOD2", (BOARD_X, -FORE_HW - 0.08, BOARD_Z), (1.35, 0.22, 0.78), mats["Material_Armor"], collection, 0.004)
        add_box("Board_LiteLOD2", (BOARD_X, -FORE_HW - 0.14, BOARD_Z + 0.12), (0.72, 0.04, 0.38), mats["Material_Canopy"], collection, 0.001)
        add_passenger_corridors(lod, mats, collection)
        add_passenger_clerestory(lod, mats, collection, hull_pass)
        add_hat_station_ring(
            "Hat_Shoulder", HAT_FORE_X, 9.05, 4.18, mats, collection,
            0.38, 0.76, 0.14, 0.34,
            inner_hw=FORE_HW, inner_hh=FORE_HH,
        )
        add_hat_station_ring(
            "Hat_GalleryFore", 6.50, PASS_HW, 4.72, mats, collection,
            0.32, 0.78, 0.14, 0.36, inner_hw=9.48, inner_hh=4.32,
        )
        add_hat_station_ring(
            "Hat_GalleryAft", 2.20, PASS_HW - 0.20, 4.48, mats, collection,
            0.34, 0.77, 0.14, 0.35, inner_hw=9.08, inner_hh=4.08,
        )
        add_hat_station_ring(
            "Hat_Waist", HAT_AFT_X, PASS_HW - 0.60, 4.22, mats, collection,
            0.37, 0.77, 0.14, 0.34,
            inner_hw=AFT_HW, inner_hh=AFT_HH,
        )
        add_box("NoseCap", (19.28, 0.0, 0.30), (0.14, 1.42, 0.86), hull_mat, collection, 0.003)
    add_passenger_pressure_crown(lod, mats, collection)
    add_service_cassette(lod, mats, collection)
    add_keel_and_saddle(lod, mats, collection)
    add_box("KeelRoot_Fore", (HAT_FORE_X, 0.0, -3.55), (0.18, 0.55, 0.42), mats["Material_Mechanical"], collection, 0.003)
    add_box("KeelRoot_Waist", (HAT_AFT_X, 0.0, -3.85), (0.18, 0.55, 0.42), mats["Material_Mechanical"], collection, 0.003)
    add_box("KeelRoot_Load", (HAT_LOAD_X, 0.0, -2.55), (0.18, 0.42, 0.32), mats["Material_Mechanical"], collection, 0.003)
    add_propulsion_load_bridge(lod, mats, collection)
    add_civic_drive("Port", -DRIVE_Y, lod, mats, collection)
    add_civic_drive("Stbd", DRIVE_Y, lod, mats, collection)
    add_box("NoseCap_LOD", (19.28, 0.0, 0.30), (0.14, 1.42, 0.86), hull_mat, collection, 0.003)

    mesh_objects = [obj for obj in collection.objects if obj.type == "MESH"]
    for obj in mesh_objects:
        obj.parent = root
        try:
            uv_for_object(obj)
        except Exception as exc:
            print(f"uv skip {obj.name}: {exc}")
    groups = {}
    for obj in mesh_objects:
        name = obj.data.materials[0].name if obj.data.materials else "Material_Hull"
        groups.setdefault(name, []).append(obj)
    merged = []
    for material_name, objects in sorted(groups.items()):
        objects = [obj for obj in objects if obj.data and len(obj.data.vertices) > 0]
        if not objects:
            continue
        bpy.ops.object.select_all(action="DESELECT")
        for obj in objects:
            obj.select_set(True)
        active = objects[0]
        bpy.context.view_layer.objects.active = active
        if len(objects) > 1:
            bpy.ops.object.join()
        role_prefix = "Hull_" if active.data.materials and active.data.materials[0].get("spacefaceRole") == "ceramic" else ""
        active.name = f"LOD{lod}_{role_prefix}{material_name.replace('Material_', '')}"
        active.parent = root
        shade_and_uv(active)
        merged.append(active)
    bake_report = {"baked": [], "failed": []}
    if lod == 0 and not PROBE_OCCUPANCY:
        bake_report = bake_lod0_unique(merged, collection, mats)
    for active in merged:
        tri = active.modifiers.new("ExportTriangulate", "TRIANGULATE")
        tri.quad_method = "BEAUTY"
        bpy.context.view_layer.objects.active = active
        active.select_set(True)
        bpy.ops.object.modifier_apply(modifier=tri.name)
        active.select_set(False)
    for name, loc in sockets().items():
        add_empty(name, loc, collection, root)
    bm = bmesh.new()
    for point in (
        (19.8, 0, 0.3), (15.6, -4.4, 2.4), (15.6, 4.4, 2.4),
        (10.55, -7.75, 0.4), (10.55, 7.75, 0.4),
        (4.2, -BELT_OUTER, 0.5), (4.2, BELT_OUTER, 0.5),
        (HAT_LOAD_X, -5.2, 0.3), (HAT_LOAD_X, 5.2, 0.3),
        (-21.0, -DRIVE_Y, DRIVE_Z), (-21.0, DRIVE_Y, DRIVE_Z),
        (0.35, 0, -5.3), (4.4, 0, 5.6),
    ):
        bm.verts.new(point)
    bm.verts.ensure_lookup_table()
    bmesh.ops.convex_hull(bm, input=list(bm.verts), use_existing_faces=False)
    collision_mesh = bpy.data.meshes.new("COLLISION_HULL_MESH")
    bm.to_mesh(collision_mesh)
    bm.free()
    collision = bpy.data.objects.new("COLLISION_HULL", collision_mesh)
    collection.objects.link(collision)
    collision.parent = root
    collision.hide_render = True
    collision["collision"] = True
    collision["nonRender"] = True
    hull_tris = next((
        sum(max(0, len(p.vertices) - 2) for p in obj.data.polygons)
        for obj in merged
        if obj.data.materials and obj.data.materials[0].get("spacefaceRole") == "ceramic"
    ), 0)
    return collection, {
        "lod": lod,
        "triangles": sum(sum(max(0, len(p.vertices) - 2) for p in obj.data.polygons) for obj in merged),
        "hullTriangles": hull_tris,
        "draws": len(merged),
        # Blender suffixes duplicate datablock names while building LOD1/2 in
        # one scene, but the exported semantic names are intentionally
        # unsuffixed. Record the actual glTF names, not transient `.001/.002`
        # authoring datablock labels.
        "materials": sorted({re.sub(r"\.\d{3}$", "", name) for name in groups}),
        "bake": bake_report,
    }


def export_lod(collection, lod):
    out = FAMILY / "source" / "wholeships" / f"{PART_ID}_lod{lod}.glb"
    out.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.object.select_all(action="DESELECT")
    export_objects = []
    for obj in collection.all_objects:
        if obj.name.endswith("_HIGH") or obj.name.endswith("_CAGE"):
            obj.select_set(False)
            continue
        obj.hide_viewport = False
        obj.hide_set(False)
        export_objects.append(obj)

    # Blender globally suffixes later LOD object/material names even though
    # every GLB is a separate package.  Temporarily reserve the unsuffixed
    # names during export so every LOD keeps the exact socket and semantic
    # node contract instead of leaking .001/.002 into the package.
    def canonical_name(name):
        return re.sub(r"\.\d{3}$", "", name)

    target_object_names = {canonical_name(obj.name) for obj in export_objects}
    if len(target_object_names) != len(export_objects):
        raise RuntimeError(f"LOD{lod} export contains duplicate canonical object names")
    held_objects = []
    for obj in bpy.data.objects:
        if obj in export_objects or obj.name not in target_object_names:
            continue
        held_objects.append((obj, obj.name))
        obj.name = f"__SF_EXPORT_HOLD_OBJECT_{lod}_{len(held_objects):03d}"
    original_object_names = [(obj, obj.name) for obj in export_objects]
    for obj, original in original_object_names:
        obj.name = canonical_name(original)

    export_materials = []
    for obj in export_objects:
        if obj.type != "MESH":
            continue
        for slot in obj.material_slots:
            if slot.material and slot.material not in export_materials:
                export_materials.append(slot.material)
    target_material_names = {canonical_name(mat.name) for mat in export_materials}
    if len(target_material_names) != len(export_materials):
        raise RuntimeError(f"LOD{lod} export contains duplicate canonical material names")
    held_materials = []
    for mat in bpy.data.materials:
        if mat in export_materials or mat.name not in target_material_names:
            continue
        held_materials.append((mat, mat.name))
        mat.name = f"__SF_EXPORT_HOLD_MATERIAL_{lod}_{len(held_materials):03d}"
    original_material_names = [(mat, mat.name) for mat in export_materials]
    for mat, original in original_material_names:
        mat.name = canonical_name(original)

    for obj in export_objects:
        obj.select_set(True)
    tmp = out.with_suffix(".tmp.glb")
    try:
        bpy.ops.export_scene.gltf(
            filepath=str(tmp), export_format="GLB", use_selection=True, export_apply=True,
            export_yup=True, export_extras=True, export_animations=False,
            export_materials="EXPORT", export_texcoords=True, export_normals=True,
            export_tangents=True, export_image_format="AUTO",
        )
        stamp_glb_asset_extras(tmp, lod)
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
    finally:
        for obj, original in original_object_names:
            obj.name = original
        for obj, original in held_objects:
            obj.name = original
        for mat, original in original_material_names:
            mat.name = original
        for mat, original in held_materials:
            mat.name = original
    return out


def look_at(obj, target=(0, 0, 0.2)):
    obj.rotation_euler = (Vector(target) - obj.location).to_track_quat("-Z", "Y").to_euler()


def setup_studio():
    scene = bpy.context.scene
    try:
        scene.render.engine = "BLENDER_EEVEE"
    except TypeError:
        scene.render.engine = "BLENDER_EEVEE_NEXT"
    scene.render.resolution_x = 1600
    scene.render.resolution_y = 900
    scene.render.image_settings.file_format = "PNG"
    scene.render.film_transparent = False
    set_view(standard=False, exposure=0.72)
    eevee = getattr(scene, "eevee", None)
    if eevee:
        for attr, val in (
            ("use_ssr", True), ("use_ssr_refraction", True),
            ("use_raytracing", True), ("use_shadows", True),
        ):
            if hasattr(eevee, attr):
                try:
                    setattr(eevee, attr, val)
                except Exception:
                    pass
    world = scene.world or bpy.data.worlds.new("LinerWorld")
    scene.world = world
    world.use_nodes = True
    bg = world.node_tree.nodes.get("Background")
    bg.inputs["Color"].default_value = (0.042, 0.046, 0.052, 1)
    bg.inputs["Strength"].default_value = 1.35
    for obj in list(scene.objects):
        if obj.type in {"CAMERA", "LIGHT"}:
            bpy.data.objects.remove(obj, do_unlink=True)
    cam_data = bpy.data.cameras.new("CycleCam")
    camera = bpy.data.objects.new("CycleCam", cam_data)
    scene.collection.objects.link(camera)
    scene.camera = camera
    for name, loc, energy, color, size in (
        ("Key", (20, -24, 17), 980, (0.97, 0.97, 1.00), 20),
        ("Fill", (4, 18, 10), 620, (0.78, 0.82, 0.88), 22),
        ("Top", (2, 4, 24), 640, (0.90, 0.92, 0.96), 16),
        ("Rim", (-16, -8, 8), 720, (0.76, 0.82, 0.90), 14),
        ("Kick", (-8, 12, -5), 280, (0.74, 0.78, 0.84), 12),
        ("AftFill", (-14, -14, 9), 480, (0.80, 0.84, 0.90), 16),
    ):
        data = bpy.data.lights.new(name, "AREA")
        data.energy = energy
        data.color = color
        data.size = size
        obj = bpy.data.objects.new(name, data)
        scene.collection.objects.link(obj)
        obj.location = loc
        look_at(obj)
    return camera


def visible_imported_meshes(lod=0):
    meshes = []
    selected_prefix = f"LOD{lod}_"
    for obj in bpy.context.scene.objects:
        if obj.type != "MESH":
            continue
        name = obj.name.upper()
        if "COLLISION" in name or obj.get("collision") or obj.get("nonRender"):
            obj.hide_render = True
            continue
        if name.startswith("LOD") and not name.startswith(selected_prefix):
            obj.hide_render = True
            continue
        meshes.append(obj)
    has_selected_lod = any(obj.name.upper().startswith(selected_prefix) for obj in meshes)
    if has_selected_lod:
        for obj in list(meshes):
            if not obj.name.upper().startswith(selected_prefix):
                obj.hide_render = True
        meshes = [obj for obj in meshes if obj.name.upper().startswith(selected_prefix)]
    return meshes


def mesh_center(meshes):
    low = Vector((1e12, 1e12, 1e12))
    high = Vector((-1e12, -1e12, -1e12))
    for obj in meshes:
        for corner in obj.bound_box:
            point = obj.matrix_world @ Vector(corner)
            for axis in range(3):
                low[axis] = min(low[axis], point[axis])
                high[axis] = max(high[axis], point[axis])
    return (low + high) * 0.5, high - low


def projected_occupancy(scene, camera, meshes):
    from bpy_extras.object_utils import world_to_camera_view
    bpy.context.view_layer.update()
    xs, ys = [], []
    for obj in meshes:
        mesh = obj.data
        if not mesh or not mesh.vertices:
            continue
        mw = obj.matrix_world
        step = max(1, len(mesh.vertices) // 6000)
        for index, vert in enumerate(mesh.vertices):
            if index % step:
                continue
            ndc = world_to_camera_view(scene, camera, mw @ vert.co)
            if ndc.z < 0.0:
                continue
            xs.append(ndc.x)
            ys.append(ndc.y)
    if not xs:
        raise RuntimeError("occupancy: no projected vertices")
    min_x, max_x = min(xs), max(xs)
    min_y, max_y = min(ys), max(ys)
    return {
        "minX": round(min_x, 5),
        "maxX": round(max_x, 5),
        "minY": round(min_y, 5),
        "maxY": round(max_y, 5),
        "widthFrac": round(max_x - min_x, 5),
        "heightFrac": round(max_y - min_y, 5),
        "widthPx1600": round((max_x - min_x) * 1600.0, 1),
        "cropped": bool(min_x < 0.0 or max_x > 1.0 or min_y < 0.0 or max_y > 1.0),
    }


def measure_supported_occupancy(camera, meshes, focus):
    scene = bpy.context.scene
    poses = {
        "play_chase": (DISTANCE_DEFAULT, 0.0, PLAY_CHASE_WIDTH_FRAC),
        "play_chase_abeam": (DISTANCE_DEFAULT, 90.0, PLAY_CHASE_WIDTH_FRAC),
        "play_chase_close": (DISTANCE_CLOSE, 0.0, PLAY_CHASE_CLOSE_WIDTH_FRAC),
    }
    measured = {}
    failures = []
    for name, (distance, heading, band) in poses.items():
        apply_chase_camera(camera, distance=distance, heading_deg=heading, focus=focus)
        rec = projected_occupancy(scene, camera, meshes)
        rec["band"] = [band[0], band[1]]
        rec["inBand"] = occupancy_in_band(
            rec["widthFrac"], close=name == "play_chase_close", cropped=rec["cropped"],
        )
        measured[name] = rec
        print(f"occupancy {name}: {rec['widthPx1600']:.1f}px ({rec['widthFrac']*100:.2f}%) crop={rec['cropped']}")
        if rec["cropped"]:
            failures.append(f"{name} crops")
        if not (band[0] <= rec["widthFrac"] <= band[1]):
            failures.append(f"{name} width {rec['widthFrac']*100:.2f}% outside band")
    return measured, failures


def render_authored_band_evidence(camera, meshes, out, focus, lod):
    """Render labeled, matched chase views at real LOD selection sizes.

    The three legal cycle cameras above remain untouched. These additional
    views prove the simplified sources at their authored on-screen bands and
    supply identical approach/recede poses on both sides of each LOD handoff.
    """
    authored = {
        0: [
            ("transition_near_lod0.png", 200.0, 0.0, None, "LOD0 side of LOD0/LOD1 transition"),
        ],
        1: [
            ("lod_band_play_chase.png", 210.0, 0.0, (90.0, 220.0), "LOD1 authored-band default"),
            ("lod_band_play_chase_abeam.png", 210.0, 90.0, (90.0, 220.0), "LOD1 authored-band abeam"),
            ("transition_near_lod1.png", 200.0, 0.0, (90.0, 220.0), "LOD1 side of LOD0/LOD1 transition"),
            ("transition_far_lod1.png", 439.5, 0.0, (90.0, 220.0), "LOD1 side of LOD1/LOD2 transition"),
        ],
        2: [
            ("lod_band_play_chase.png", 480.0, 0.0, (0.0, 90.0), "LOD2 authored-band default"),
            ("lod_band_play_chase_abeam.png", 480.0, 90.0, (0.0, 90.0), "LOD2 authored-band abeam"),
            ("transition_far_lod2.png", 439.5, 0.0, (0.0, 90.0), "LOD2 side of LOD1/LOD2 transition"),
        ],
    }
    result = {}
    scene = bpy.context.scene
    for name, distance, heading, px_band, purpose in authored[lod]:
        render_chase_still(
            camera, out / name, distance=distance,
            heading_deg=heading, focus=focus,
        )
        rec = projected_occupancy(scene, camera, meshes)
        rec.update({
            "distance": distance,
            "headingDeg": heading,
            "purpose": purpose,
            "authoredBandPx1600": list(px_band) if px_band else None,
            "inAuthoredBand": (
                px_band[0] <= rec["widthPx1600"] <= px_band[1]
                if px_band else None
            ),
        })
        result[name] = rec
        print(
            f"authored evidence lod{lod} {name}: "
            f"{rec['widthPx1600']:.1f}px at D={distance:g}"
        )
    return result


def assign_all_slots(obj, mat):
    if not obj.material_slots:
        obj.data.materials.append(mat)
        return
    for slot in obj.material_slots:
        slot.material = mat


def set_view(standard=False, exposure=0.72):
    scene = bpy.context.scene
    if standard:
        scene.view_settings.view_transform = "Standard"
        try:
            scene.view_settings.look = "None"
        except TypeError:
            pass
        scene.view_settings.exposure = 0.0
        scene.view_settings.gamma = 1.0
        return
    try:
        scene.view_settings.view_transform = "AgX"
    except TypeError:
        pass
    try:
        scene.view_settings.look = "AgX - Medium Contrast"
    except TypeError:
        try:
            scene.view_settings.look = "AgX - Medium High Contrast"
        except TypeError:
            pass
    scene.view_settings.exposure = exposure
    scene.view_settings.gamma = 1.0


def override_emission(meshes, color_fn, clay=False):
    backups = {}
    for obj in meshes:
        backups[obj.name] = [slot.material for slot in obj.material_slots]
        mat = bpy.data.materials.new(f"ISO_{obj.name}")
        mat.use_nodes = True
        mat.node_tree.nodes.clear()
        out = mat.node_tree.nodes.new("ShaderNodeOutputMaterial")
        if clay:
            bsdf = mat.node_tree.nodes.new("ShaderNodeBsdfPrincipled")
            bsdf.inputs["Base Color"].default_value = (0.70, 0.70, 0.71, 1)
            bsdf.inputs["Metallic"].default_value = 0.0
            bsdf.inputs["Roughness"].default_value = 0.52
            mat.node_tree.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])
        else:
            emit = mat.node_tree.nodes.new("ShaderNodeEmission")
            color, strength = color_fn(obj)
            emit.inputs["Color"].default_value = (*color, 1)
            emit.inputs["Strength"].default_value = strength
            mat.node_tree.links.new(emit.outputs["Emission"], out.inputs["Surface"])
        assign_all_slots(obj, mat)
    return backups


def override_map_isolation(meshes, suffix):
    backups = {}
    for obj in meshes:
        backups[obj.name] = [slot.material for slot in obj.material_slots]
        src = None
        for slot in obj.material_slots:
            if slot.material and slot.material.use_nodes:
                src = slot.material
                break
        if src is None and obj.data.materials:
            src = obj.data.materials[0]
        img = None
        if src and src.use_nodes:
            img = next(
                (n.image for n in src.node_tree.nodes if n.type == "TEX_IMAGE" and n.image and suffix in n.image.name.lower()),
                None,
            )
        mat = bpy.data.materials.new(f"ISO_{suffix}_{obj.name}")
        mat.use_nodes = True
        mat.node_tree.nodes.clear()
        out = mat.node_tree.nodes.new("ShaderNodeOutputMaterial")
        emit = mat.node_tree.nodes.new("ShaderNodeEmission")
        emit.inputs["Strength"].default_value = 1.0
        if img:
            tex = mat.node_tree.nodes.new("ShaderNodeTexImage")
            tex.image = img
            tex.image.colorspace_settings.name = "Non-Color"
            uv = mat.node_tree.nodes.new("ShaderNodeUVMap")
            uv.uv_map = obj.data.uv_layers[0].name if obj.data.uv_layers else "UVMap"
            mat.node_tree.links.new(uv.outputs["UV"], tex.inputs["Vector"])
            mat.node_tree.links.new(tex.outputs["Color"], emit.inputs["Color"])
        else:
            emit.inputs["Color"].default_value = (0.18, 0.18, 0.18, 1)
        mat.node_tree.links.new(emit.outputs["Emission"], out.inputs["Surface"])
        assign_all_slots(obj, mat)
    return backups


def restore_mats(meshes, backups):
    for obj in meshes:
        mats = backups.get(obj.name, [])
        for index, material in enumerate(mats):
            if index < len(obj.material_slots):
                obj.material_slots[index].material = material


def render_cycle_from_glb(glb_path, lod=0):
    reset_scene()
    bpy.ops.import_scene.gltf(filepath=str(glb_path))
    meshes = visible_imported_meshes(lod=lod)
    if not meshes:
        raise RuntimeError(f"no visible meshes imported from {glb_path}")
    center, size = mesh_center(meshes)
    focus = (float(center.x), float(center.y), float(center.z))
    camera = setup_studio()
    for lamp in [obj for obj in bpy.context.scene.objects if obj.type == "LIGHT"]:
        lamp.location = Vector(focus) + (lamp.location - Vector((0.4, 0.0, 0.3)))
        look_at(lamp, focus)
    out = FAMILY / "evidence" / "massline_express_liner_v1" / "cycles" / f"cycle_{CYCLE:02d}"
    if lod:
        out = out / f"lod{lod}"
    out.mkdir(parents=True, exist_ok=True)
    occupancy, occupancy_failures = measure_supported_occupancy(camera, meshes, focus)
    render_cycle_chase_stills(camera, out, focus=focus)
    authored_band_evidence = render_authored_band_evidence(camera, meshes, out, focus, lod)

    world_bg = bpy.context.scene.world.node_tree.nodes.get("Background")
    prior_strength = world_bg.inputs["Strength"].default_value
    prior_color = tuple(world_bg.inputs["Color"].default_value)
    world_bg.inputs["Color"].default_value = (0.030, 0.032, 0.036, 1)
    world_bg.inputs["Strength"].default_value = 1.15
    clay_sun = bpy.data.lights.new("ClayKey", "SUN")
    clay_sun.energy = 4.2
    clay_sun.color = (1.0, 0.98, 0.96)
    clay_sun_obj = bpy.data.objects.new("ClayKey", clay_sun)
    bpy.context.scene.collection.objects.link(clay_sun_obj)
    clay_sun_obj.location = Vector(focus) + Vector((12.0, -16.0, 18.0))
    look_at(clay_sun_obj, focus)
    backups = override_emission(meshes, lambda _o: ((0.70, 0.70, 0.71), 1.0), clay=True)
    render_chase_still(camera, out / "clay_play_chase.png", distance=DISTANCE_DEFAULT, heading_deg=0.0, focus=focus)
    restore_mats(meshes, backups)
    bpy.data.objects.remove(clay_sun_obj, do_unlink=True)
    bpy.data.lights.remove(clay_sun)
    world_bg.inputs["Color"].default_value = prior_color
    world_bg.inputs["Strength"].default_value = prior_strength

    target = Vector((focus[0] + 2.2, focus[1] - 7.4, focus[2] + 1.15))
    camera.location = Vector((focus[0] + 9.2, focus[1] - 18.5, focus[2] + 5.4))
    camera.data.lens_unit = "MILLIMETERS"
    camera.data.lens = 32
    look_at(camera, target)
    bpy.context.scene.render.filepath = str(out / "grazing_close.png")
    bpy.ops.render.render(write_still=True)

    bore = bpy.data.lights.new("BoreFill", "AREA")
    bore.energy = 1400
    bore.color = (1.0, 0.90, 0.78)
    bore.size = 3.2
    bore_obj = bpy.data.objects.new("BoreFill", bore)
    bpy.context.scene.collection.objects.link(bore_obj)
    throat = (focus[0] - 18.4, focus[1] - DRIVE_Y, focus[2] + DRIVE_Z)
    bore_obj.location = (throat[0] - 6.4, throat[1] - 1.15, throat[2] + 0.55)
    look_at(bore_obj, throat)
    camera.location = (throat[0] - 7.4, throat[1] - 2.15, throat[2] + 1.15)
    camera.data.lens = 55
    look_at(camera, throat)
    bpy.context.scene.render.filepath = str(out / "drive_rear.png")
    bpy.ops.render.render(write_still=True)

    ids = {
        "CeramicPaint_WarmIvory": (0.86, 0.80, 0.68),
        "Frame_DarkAnodized": (0.18, 0.22, 0.27),
        "Keel_ForgedDark": (0.055, 0.070, 0.090),
        "Glazing_SmokedSafety": (0.08, 0.24, 0.42),
        "ServicePrimer_Galvanized": (0.32, 0.36, 0.34),
        "RefractoryHeatAlloy": (0.42, 0.34, 0.26),
        "WayfindingCyan": (0.08, 0.72, 0.76),
        "WayfindingAmber": (0.78, 0.42, 0.10),
        "Throat_OxidizedDark": (0.12, 0.12, 0.15),
    }

    def id_color(obj):
        names = [obj.name] + [slot.material.name for slot in obj.material_slots if slot.material]
        blob = " ".join(names).lower()
        for key, color in ids.items():
            if key.lower() in blob:
                return color, 1.0
        return (0.4, 0.4, 0.4), 1.0

    set_view(standard=True)
    backups = override_emission(meshes, id_color)
    render_chase_still(camera, out / "id_or_material_id.png", distance=DISTANCE_CLOSE, heading_deg=0.0, focus=focus)
    restore_mats(meshes, backups)
    backups = override_map_isolation(meshes, "orm")
    render_chase_still(camera, out / "orm_isolation.png", distance=DISTANCE_CLOSE, heading_deg=0.0, focus=focus)
    restore_mats(meshes, backups)
    backups = override_map_isolation(meshes, "normal")
    render_chase_still(camera, out / "normal_isolation.png", distance=DISTANCE_CLOSE, heading_deg=0.0, focus=focus)
    restore_mats(meshes, backups)
    set_view(standard=False, exposure=0.72)

    still_hashes = {path.name: sha256(path) for path in sorted(out.glob("*.png"))}
    identity = {
        "schema": "spaceface.exactSourceEvidence.v1",
        "assetId": ASSET_ID,
        "shipId": PART_ID,
        "cycle": CYCLE,
        "lod": lod,
        "source": str(glb_path.relative_to(ROOT)).replace("\\", "/"),
        "sourceSha256": sha256(glb_path),
        "renderer": "assets/ships/massline_express_liner_v1/scripts/build_massline_express_liner_v1.py+tools/blender/spaceface_chase_camera.py",
        "cameraContract": {
            "module": "tools/blender/spaceface_chase_camera.py",
            "fov_v_deg": FOV_V_DEG,
            "tilt_deg": TILT_DEG,
            "play_chase": {"distance": DISTANCE_DEFAULT, "heading_deg": 0.0},
            "play_chase_abeam": {"distance": DISTANCE_DEFAULT, "heading_deg": 90.0},
            "play_chase_close": {"distance": DISTANCE_CLOSE, "heading_deg": 0.0},
            "clay_play_chase": {"distance": DISTANCE_DEFAULT, "heading_deg": 0.0, "material": "neutral_clay"},
            "grazing_close": {"kind": "diagnostic", "lens_mm": 32},
            "drive_rear": {"kind": "diagnostic", "lens_mm": 55},
            "diagnostics": ["id_or_material_id.png", "orm_isolation.png", "normal_isolation.png"],
            "authoredBandAndTransitions": {
                name: {
                    "distance": rec["distance"],
                    "heading_deg": rec["headingDeg"],
                    "purpose": rec["purpose"],
                }
                for name, rec in authored_band_evidence.items()
            },
        },
        "boundsSizeM": [round(float(size.x), 4), round(float(size.y), 4), round(float(size.z), 4)],
        "lengthToBeam": round(float(size.x) / max(1e-6, float(size.y)), 4),
        "occupancy": occupancy,
        "occupancyFailures": occupancy_failures,
        "authoredBandEvidence": authored_band_evidence,
        "views": [
            "play_chase.png", "play_chase_abeam.png", "play_chase_close.png",
            "clay_play_chase.png", "grazing_close.png", "drive_rear.png",
            "orm_isolation.png", "normal_isolation.png", "id_or_material_id.png",
        ] + list(authored_band_evidence.keys()),
        "stillSha256": still_hashes,
        "producer": "build_massline_express_liner_v1.py",
        "verdict": "revise",
        "gateState": "evidence_ready",
    }
    (out / "EVIDENCE_IDENTITY.json").write_bytes((json.dumps(identity, indent=2) + "\n").encode("utf-8"))
    return out, identity


def save_blend():
    path = FAMILY / "blender" / f"{PART_ID}.blend"
    path.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(path))
    return path


def probe_occupancy_from_scene(collection):
    meshes = [
        obj for obj in collection.objects
        if obj.type == "MESH" and not obj.get("collision") and not obj.get("nonRender")
        and "COLLISION" not in obj.name.upper()
    ]
    if not meshes:
        raise RuntimeError("probe: no visible meshes")
    center, size = mesh_center(meshes)
    focus = (float(center.x), float(center.y), float(center.z))
    camera = setup_studio()
    occupancy, failures = measure_supported_occupancy(camera, meshes, focus)
    ratio = float(size.x) / max(1e-6, float(size.y))
    result = {
        "boundsSizeM": [round(float(size.x), 4), round(float(size.y), 4), round(float(size.z), 4)],
        "lengthToBeam": round(ratio, 4),
        "occupancy": occupancy,
        "occupancyFailures": failures,
    }
    print(json.dumps(result, indent=2))
    return result


def main():
    FAMILY.mkdir(parents=True, exist_ok=True)
    TEX_DIR.mkdir(parents=True, exist_ok=True)
    lod0 = FAMILY / "source" / "wholeships" / f"{PART_ID}_lod0.glb"
    if RENDER_ONLY:
        if not lod0.exists():
            raise FileNotFoundError(lod0)
        stills, identity = render_cycle_from_glb(lod0, lod=0)
        evidence = FAMILY / "evidence" / "massline_express_liner_v1"
        report_path = evidence / f"cycle_{CYCLE:02d}.json"
        if report_path.exists():
            report = json.loads(report_path.read_text(encoding="utf-8"))
            report["sourceSha256"] = identity["sourceSha256"]
            report["boundsSizeM"] = identity.get("boundsSizeM")
            report["lengthToBeam"] = identity.get("lengthToBeam")
            report["occupancy"] = identity["occupancy"]
            report["occupancyFailures"] = identity["occupancyFailures"]
            report_path.write_bytes((json.dumps(report, indent=2) + "\n").encode("utf-8"))
        print(json.dumps({k: identity[k] for k in ("sourceSha256", "boundsSizeM", "lengthToBeam")}, indent=2))
        return
    reset_scene()
    reports = []
    collections = []
    global TEX
    outputs = []
    lods = (0,) if PROBE_OCCUPANCY else (0, 1, 2)
    for lod in lods:
        TEX = TEX_BY_LOD[lod]
        mats = create_materials()
        collection, report = build_lod(lod, mats)
        if PROBE_OCCUPANCY:
            probe_occupancy_from_scene(collection)
            print(f"lod{lod} tris={report['triangles']} hull={report['hullTriangles']} draws={report['draws']}")
            return
        output = export_lod(collection, lod)
        report.update({
            "path": str(output.relative_to(FAMILY)).replace("\\", "/"),
            "bytes": output.stat().st_size,
            "sha256": sha256(output),
        })
        collections.append(collection)
        outputs.append(output)
        reports.append(report)
        print(f"lod{lod} tris={report['triangles']} hull={report['hullTriangles']} draws={report['draws']}")
    blend = save_blend()
    identities = {}
    stills = None
    for lod, output in zip(lods, outputs):
        lod_stills, lod_identity = render_cycle_from_glb(output, lod=lod)
        identities[str(lod)] = lod_identity
        if lod == 0:
            stills, identity = lod_stills, lod_identity
    if stills is None:
        raise RuntimeError("Cycle build produced no LOD0 evidence")
    evidence = FAMILY / "evidence" / "massline_express_liner_v1"
    evidence.mkdir(parents=True, exist_ok=True)
    report = {
        "schema": "spaceface.masslineExpressLiner.cycle.v1",
        "assetId": ASSET_ID,
        "shipId": PART_ID,
        "cycle": CYCLE,
        "blend": str(blend.relative_to(FAMILY)).replace("\\", "/"),
        "lods": reports,
        "stills": str(stills.relative_to(FAMILY)).replace("\\", "/"),
        "evidenceByLod": {
            lod: {
                "sourceSha256": record["sourceSha256"],
                "stills": str(
                    (FAMILY / "evidence" / "massline_express_liner_v1" / "cycles" / f"cycle_{CYCLE:02d}" / ("" if lod == "0" else f"lod{lod}"))
                    .resolve().relative_to(FAMILY.resolve())
                ).replace("\\", "/").rstrip("/"),
                "occupancy": record["occupancy"],
                "occupancyFailures": record["occupancyFailures"],
                "authoredBandEvidence": record["authoredBandEvidence"],
            }
            for lod, record in identities.items()
        },
        "sourceSha256": identity["sourceSha256"],
        "boundsSizeM": identity.get("boundsSizeM"),
        "lengthToBeam": identity.get("lengthToBeam"),
        "occupancy": identity["occupancy"],
        "occupancyFailures": identity["occupancyFailures"],
        "cameras": {
            "play_chase": {"distance": DISTANCE_DEFAULT, "heading": 0, "fov": 50, "tilt": 60},
            "play_chase_abeam": {"distance": DISTANCE_DEFAULT, "heading": 90, "fov": 50, "tilt": 60},
            "play_chase_close": {"distance": DISTANCE_CLOSE, "heading": 0, "fov": 50, "tilt": 60},
        },
        "notes": "Source candidate only. Not wired to traffic, manifests, or partsLibrary.",
        "implementingAgentVerdict": "revise",
        "evidenceState": "evidence_ready",
    }
    (evidence / f"cycle_{CYCLE:02d}.json").write_bytes((json.dumps(report, indent=2) + "\n").encode("utf-8"))
    print(json.dumps({k: report[k] for k in ("assetId", "cycle", "stills", "sourceSha256")}, indent=2))


if __name__ == "__main__":
    main()

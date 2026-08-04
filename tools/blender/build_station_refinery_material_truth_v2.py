#!/usr/bin/env python3
"""Build the isolated PQ-022 refinery material-truth V2 candidate.

The builder deliberately reads the current live GLB only for the frozen broadphase collision
geometry.  All visible LOD geometry, UVs, refinery-specific PBR maps, material response, and
review renders are newly authored here.  Blender construction is Z-up; the exported glTF remains
Y-up with the exact root/socket/runtime-envelope contract required by SpaceFace.

This script never writes the live parts tree, release tree, manifests, queue, or NOW state.
"""
from __future__ import annotations

import hashlib
import importlib.util
import json
import math
import struct
import time
import zlib
from pathlib import Path

import bmesh
import bpy
from mathutils import Vector


ROOT = Path(__file__).resolve().parents[2]
ASSET_ROOT = ROOT / "assets" / "ships" / "m5_station_refinery"
BLEND_PATH = ASSET_ROOT / "blender" / "source" / "material_truth_v2" / "place_station_refinery.blend"
SOURCE_GLB = ASSET_ROOT / "source_candidates" / "material_truth_v2" / "places" / "place_station_refinery.glb"
RELEASE_GLB = ASSET_ROOT / "release_candidates" / "material_truth_v2" / "places" / "place_station_refinery.glb"
STAGING_GLB = ASSET_ROOT / "source_candidates" / "material_truth_v2" / "places" / "place_station_refinery.build.glb"
REPORT_ROOT = ASSET_ROOT / "reports" / "material_truth_v2"
TEXTURE_ROOT = REPORT_ROOT / "textures"
RENDER_ROOT = REPORT_ROOT / "renders"
BUILD_REPORT = REPORT_ROOT / "build_report.json"
RENDER_MANIFEST = REPORT_ROOT / "render_manifest.json"
LIVE_GLB = ROOT / "assets" / "ships" / "parts" / "places" / "place_station_refinery.glb"
LIVE_RELEASE = ROOT / "assets" / "ships" / "release" / "parts" / "places" / "place_station_refinery.glb"
LIVE_BLEND = ROOT / "assets" / "ships" / "parts" / "blender" / "place_station_refinery_authored.blend"

EXPORTER_PATH = ROOT / "tools" / "blender" / "spaceface_export.py"
EXPORTER_SPEC = importlib.util.spec_from_file_location("spaceface_export_refinery_v2", EXPORTER_PATH)
spaceface_export = importlib.util.module_from_spec(EXPORTER_SPEC)
EXPORTER_SPEC.loader.exec_module(spaceface_export)

ASSET_ID = "SF_PLACE_STATION_REFINERY"
PART_ID = "place_station_refinery"
ROOT_NAME = "SF_PLACE_STATION_REFINERY_ROOT"
COLLECTION_NAME = "PLACE_STATION_REFINERY_MATERIAL_TRUTH_V2"
CANDIDATE_ID = "pq022-refinery-material-truth-v2"
PACKET = "PQ-022"
DISPATCH_UNIT = "PQ-022.refinery-reauthor"
SOURCE_GENERATOR = "tools/blender/build_station_refinery_material_truth_v2.py"

MATERIAL_NAMES = (
    "Material_Accent",
    "Material_Glass",
    "Material_Hull",
    "Material_Mechanical",
    "Material_Warm",
)
MATERIAL_BUILD_ORDER = (
    "Material_Hull",
    "Material_Mechanical",
    "Material_Warm",
    "Material_Accent",
    "Material_Glass",
)
SOCKETS_BLENDER = {
    "SOCKET_Structure_Core": (0.0, 0.0, 0.0),
    "SOCKET_Dock_Approach": (42.48, 0.0, 0.0),
    # Blender (X, Y starboard, Z up) -> glTF (X, Y up, Z starboard with sign flip).
    "SOCKET_Emissive": (0.0, 31.955, 0.0),
}
SOCKETS_GLTF = {
    "SOCKET_Structure_Core": (0.0, 0.0, 0.0),
    "SOCKET_Dock_Approach": (42.47999954223633, 0.0, 0.0),
    "SOCKET_Emissive": (0.0, 0.0, -31.954999923706055),
}

# Frozen LOD0 envelope.  Runtime order is X/Y-up/Z-starboard; Blender order is X/Y-starboard/Z-up.
GLTF_ENVELOPE_MIN = (-39.0, -25.0, -58.1)
GLTF_ENVELOPE_MAX = (59.0, 30.5, 5.75)
GLTF_ENVELOPE_SIZE = (98.0, 55.5, 63.85)
BLENDER_ENVELOPE_MIN = (-39.0, -5.75, -25.0)
BLENDER_ENVELOPE_MAX = (59.0, 58.1, 30.5)
BLENDER_ENVELOPE_SIZE = (98.0, 63.85, 55.5)

BYTE_CEILING = 23_431_088
LOD_CEILINGS = {0: 141_740, 1: 35_056, 2: 5_440}
COLLISION_TRIANGLES = 44
COLLISION_GEOMETRY_SHA256 = "f6ec9016ce93cc03179c1d8a09ba80aa7c253f798d91cfe8d3d87b6aed26bb7d"

PROCESS_FLOW = (
    "RAW FEED (-X)",
    "CRUSH / TRANSFER",
    "THREE-STACK SEPARATION",
    "THERMAL / HEAT RECOVERY",
    "SLURRY / CHALK STORAGE",
    "+X DOCK / CONTROL",
)
VALIDATION_CHAIN = (
    "blender-5.1-python",
    "glb-source-candidate",
    "foundry-validation",
    "khronos-validation",
    "hash-binding",
)
WIRING = {
    "partId": PART_ID,
    "slot": "place",
    "rootNode": ROOT_NAME,
    "sockets": sorted(SOCKETS_GLTF),
}
CLAIMS = {
    "candidateOnly": True,
    "promoted": False,
    "routeEvidence": False,
    "performanceEvidence": False,
}
MATERIAL_ROLES = {
    "Material_Hull": "structural_coat",
    "Material_Mechanical": "process_alloy",
    "Material_Warm": "thermal_oxide",
    "Material_Accent": "chalk_ceramic",
    "Material_Glass": "control_glass",
}


def rel(path: Path) -> str:
    return str(path.relative_to(ROOT)).replace("\\", "/")


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest().lower()


def json_dump(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")


def write_bytes_in_place(path: Path, payload: bytes) -> None:
    """Update owned GLBs without Windows' truncate-on-open/CopyFile2 mapped-file paths."""
    path.parent.mkdir(parents=True, exist_ok=True)
    if not path.exists():
        path.write_bytes(payload)
        return
    with path.open("r+b") as handle:
        previous_size = handle.seek(0, 2)
        handle.seek(0)
        handle.write(payload)
        if previous_size > len(payload):
            handle.truncate(len(payload))
        handle.flush()


def png_chunk(kind: bytes, data: bytes) -> bytes:
    return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data) & 0xFFFFFFFF)


def write_png(path: Path, width: int, height: int, pixel_fn) -> None:
    """Write a deterministic RGBA PNG without external Python packages."""
    raw = bytearray()
    for y in range(height):
        raw.append(0)
        for x in range(width):
            raw.extend(pixel_fn(x, y, width, height))
    payload = b"\x89PNG\r\n\x1a\n"
    payload += png_chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0))
    payload += png_chunk(b"IDAT", zlib.compress(bytes(raw), 9))
    payload += png_chunk(b"IEND", b"")
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(payload)


def clamp_byte(value: float) -> int:
    return max(0, min(255, int(round(value))))


def texture_pixel(role: str, kind: str, x: int, y: int, width: int, height: int) -> bytes:
    u = x / max(1, width - 1)
    v = y / max(1, height - 1)
    # Smooth incommensurate fields retain substrate-scale response while remaining spatially
    # correlated enough for lossless PNG storage. No role uses block cells or per-pixel hash noise.
    coat_field = 0.5 + 0.25 * math.sin(math.tau * (u * 1.31 + v * 0.57) + 0.43)
    coat_field += 0.15 * math.sin(math.tau * (u * 0.37 - v * 1.09) + 1.71)
    coat_field = max(0.0, min(1.0, coat_field))
    coat_wear = 0.5 + 0.5 * math.sin(math.tau * (u * 4.73 + v * 0.61) + 2.17)
    brush = 0.58 * math.sin(math.tau * (v * 113.0 + u * 0.37))
    brush += 0.42 * math.sin(math.tau * (v * 191.0 - u * 0.11) + 1.31)
    thermal_flow = 0.5 + 0.5 * math.sin(math.tau * (v * 1.45 + u * 0.18) + 0.83)
    ceramic_grain = 0.55 * math.sin(math.tau * (u * 31.7 + v * 17.3) + 0.24)
    ceramic_grain += 0.30 * math.sin(math.tau * (u * 53.1 - v * 29.9) + 1.23)
    ceramic_grain += 0.15 * math.sin(math.tau * (u * 7.1 + v * 11.3) + 2.41)

    if kind == "normal":
        if role == "structural_coat":
            # Broad coated plate: shallow rolled waviness plus one-direction manufactured seams.
            seam = -6 if x % 256 < 3 else 6 if x % 256 > 252 else 0
            nx, ny = 128 + seam, 128 + 2.5 * (coat_field - 0.5)
        elif role == "process_alloy":
            # Fine directional abrasion follows the rolled/machined axis without cross-hatching.
            nx = 128 + 5.0 * brush
            ny = 128 + 1.2 * math.sin(math.tau * (v * 17.9 + u * 0.07) + 0.67)
        elif role == "thermal_oxide":
            # Subtle axial heat scale follows temperature and flow, not a two-axis pattern.
            heat = math.exp(-((v - 0.58) / 0.24) ** 2)
            nx = 128 + 3.0 * (thermal_flow - 0.5) * heat
            ny = 128 + 4.0 * (v - 0.5) * heat
        elif role == "chalk_ceramic":
            liner_seam = -4 if x % 256 < 3 else 4 if x % 256 > 252 else 0
            nx, ny = 128 + liner_seam + 1.8 * ceramic_grain, 128 - 1.5 * ceramic_grain
        else:
            # Clean laminated glass stays optically flat; geometry owns its recessed bezel.
            nx, ny = 128, 128
        return bytes((clamp_byte(nx), clamp_byte(ny), 255, 255))

    if kind == "orm":
        if role == "structural_coat":
            seam = x % 256 < 3
            lower_wear = v > 0.82 and coat_wear > 0.72
            rough = 190 if seam else 142 if lower_wear else 172 + 10 * (coat_field - 0.5)
            metal = 20
        elif role == "process_alloy":
            rough, metal = 48 + 6 * brush, 246
        elif role == "thermal_oxide":
            heat = math.exp(-((v - 0.58) / 0.24) ** 2)
            rough, metal = 132 + 22 * heat + 10 * (thermal_flow - 0.5), 188 - 22 * heat
        elif role == "chalk_ceramic":
            rough, metal = 226 + 6 * ceramic_grain, 0
        else:
            rough, metal = 30, 4
        ao = 238 - (14 if x % 256 < 3 and role == "structural_coat" else 0)
        return bytes((clamp_byte(ao), clamp_byte(rough), clamp_byte(metal), 255))

    if role == "structural_coat":
        seam = 0.84 if x % 256 < 3 else 1.0
        lower_wear = 0.90 if v > 0.82 and coat_wear > 0.72 else 1.0
        base = (58, 78, 98)
        factor = seam * lower_wear * (0.98 + 0.08 * (coat_field - 0.5))
    elif role == "process_alloy":
        base = (158, 171, 180)
        factor = 0.94 + 0.04 * brush
    elif role == "thermal_oxide":
        heat_band = math.exp(-((v - 0.56) / 0.18) ** 2)
        base = (92 + 80 * heat_band, 37 + 42 * heat_band, 19 + 18 * heat_band)
        factor = 0.94 + 0.08 * (thermal_flow - 0.5)
    elif role == "chalk_ceramic":
        seam = 0.90 if x % 256 < 3 else 1.0
        base = (218, 211, 184)
        factor = seam * (0.98 + 0.04 * ceramic_grain)
    else:
        base = (12, 82, 92)
        factor = 1.0
    return bytes(tuple(clamp_byte(channel * factor) for channel in base) + (255,))


def create_texture_files() -> dict[str, dict[str, Path]]:
    result = {}
    for material_name, role in MATERIAL_ROLES.items():
        result[material_name] = {}
        for kind in ("basecolor", "orm", "normal"):
            path = TEXTURE_ROOT / f"refinery_{role}_{kind}.png"
            write_png(path, 512, 512, lambda x, y, w, h, r=role, k=kind: texture_pixel(r, k, x, y, w, h))
            result[material_name][kind] = path
    return result


def reset_scene() -> None:
    # Operator selection skips viewport-hidden LODs.  Direct datablock unlinking removes every
    # in-memory object after an interrupted run without opening, saving, or mutating a disk file.
    if getattr(bpy.context, "object", None) and bpy.context.object.mode != "OBJECT":
        bpy.ops.object.mode_set(mode="OBJECT")
    for obj in list(bpy.data.objects):
        bpy.data.objects.remove(obj, do_unlink=True)
    for collection in list(bpy.data.collections):
        bpy.data.collections.remove(collection, do_unlink=True)
    for datablocks in (
        bpy.data.meshes,
        bpy.data.curves,
        bpy.data.materials,
        bpy.data.images,
        bpy.data.cameras,
        bpy.data.lights,
    ):
        for datablock in list(datablocks):
            if getattr(datablock, "users", 0) == 0:
                datablocks.remove(datablock)


def ensure_collection(name: str):
    collection = bpy.data.collections.get(name)
    if collection is None:
        collection = bpy.data.collections.new(name)
        bpy.context.scene.collection.children.link(collection)
    return collection


def move_to(obj, collection) -> None:
    for previous in list(obj.users_collection):
        previous.objects.unlink(obj)
    collection.objects.link(obj)


def load_image(path: Path, colorspace: str):
    image = bpy.data.images.load(str(path), check_existing=True)
    image.colorspace_settings.name = colorspace
    image.pack()
    return image


def create_materials(texture_files: dict[str, dict[str, Path]]) -> dict[str, object]:
    tuning = {
        "Material_Hull": ((0.23, 0.31, 0.39), 0.10, 0.66, "structural_coat"),
        "Material_Mechanical": ((0.58, 0.66, 0.71), 0.96, 0.22, "process_alloy"),
        "Material_Warm": ((0.69, 0.24, 0.045), 0.68, 0.56, "thermal_oxide"),
        "Material_Accent": ((0.82, 0.78, 0.62), 0.00, 0.88, "chalk_ceramic"),
        "Material_Glass": ((0.015, 0.19, 0.24), 0.04, 0.12, "control_glass"),
    }
    materials = {}
    for name in MATERIAL_BUILD_ORDER:
        color, metallic, roughness, role = tuning[name]
        material = bpy.data.materials.new(name)
        material.use_nodes = True
        nodes = material.node_tree.nodes
        links = material.node_tree.links
        nodes.clear()
        output = nodes.new("ShaderNodeOutputMaterial")
        output.location = (720, 0)
        shader = nodes.new("ShaderNodeBsdfPrincipled")
        shader.name = "Principled BSDF"
        shader.location = (430, 0)
        shader.inputs["Base Color"].default_value = (*color, 1.0)
        shader.inputs["Metallic"].default_value = metallic
        shader.inputs["Roughness"].default_value = roughness
        if name == "Material_Hull" and "Coat Weight" in shader.inputs:
            shader.inputs["Coat Weight"].default_value = 0.28
            shader.inputs["Coat Roughness"].default_value = 0.36
        if name == "Material_Mechanical" and "Anisotropic IOR Level" in shader.inputs:
            shader.inputs["Anisotropic IOR Level"].default_value = 0.48
        if name == "Material_Accent" and "Coat Weight" in shader.inputs:
            shader.inputs["Coat Weight"].default_value = 0.08

        base = nodes.new("ShaderNodeTexImage")
        base.name = f"{name}_BaseColor"
        base.label = f"{role} Base Color"
        base.image = load_image(texture_files[name]["basecolor"], "sRGB")
        base.location = (-520, 170)
        links.new(base.outputs["Color"], shader.inputs["Base Color"])

        orm = nodes.new("ShaderNodeTexImage")
        orm.name = f"{name}_AO_Roughness_Metallic"
        orm.label = f"{role} Packed ORM"
        orm.image = load_image(texture_files[name]["orm"], "Non-Color")
        orm.location = (-520, -40)
        separate = nodes.new("ShaderNodeSeparateColor")
        separate.location = (-260, -35)
        links.new(orm.outputs["Color"], separate.inputs["Color"])
        links.new(separate.outputs["Green"], shader.inputs["Roughness"])
        links.new(separate.outputs["Blue"], shader.inputs["Metallic"])
        gltf_group = bpy.data.node_groups.get("glTF Material Output")
        if gltf_group is None:
            gltf_group = bpy.data.node_groups.new("glTF Material Output", "ShaderNodeTree")
            gltf_group.interface.new_socket(name="Occlusion", in_out="INPUT", socket_type="NodeSocketFloat")
        gltf_output = nodes.new("ShaderNodeGroup")
        gltf_output.node_tree = gltf_group
        gltf_output.location = (160, -260)
        links.new(separate.outputs["Red"], gltf_output.inputs["Occlusion"])

        normal = nodes.new("ShaderNodeTexImage")
        normal.name = f"{name}_Normal"
        normal.label = f"{role} OpenGL Normal"
        normal.image = load_image(texture_files[name]["normal"], "Non-Color")
        normal.location = (-520, -260)
        normal_map = nodes.new("ShaderNodeNormalMap")
        normal_map.location = (-240, -240)
        normal_map.inputs["Strength"].default_value = 0.42 if name != "Material_Accent" else 0.58
        links.new(normal.outputs["Color"], normal_map.inputs["Color"])
        links.new(normal_map.outputs["Normal"], shader.inputs["Normal"])

        if name == "Material_Glass":
            shader.inputs["Emission Color"].default_value = (0.01, 0.25, 0.32, 1.0)
            shader.inputs["Emission Strength"].default_value = 0.42
            if "Transmission Weight" in shader.inputs:
                shader.inputs["Transmission Weight"].default_value = 0.22
            if "IOR" in shader.inputs:
                shader.inputs["IOR"].default_value = 1.46
        links.new(shader.outputs["BSDF"], output.inputs["Surface"])
        material.diffuse_color = (*color, 1.0)
        material["spaceface.semantic"] = name
        material["spaceface.textureRole"] = role
        material["spaceface.materialTruth"] = "refinery_material_truth_v2"
        materials[name] = material
    return materials


def tag(obj, lod: int, material: str, role: str) -> None:
    obj["spaceface.lodLevel"] = lod
    obj["spaceface.chamfered"] = True
    obj["spaceface.materialRole"] = material
    obj["spaceface.structureRole"] = role


def add_box(collection, materials, lod: int, name: str, size, location,
            material="Material_Hull", bevel=0.20, rotation=(0.0, 0.0, 0.0)):
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=location, rotation=rotation)
    obj = bpy.context.object
    obj.name = f"LOD{lod}_{name}"
    obj.dimensions = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(materials[material])
    if bevel > 0:
        modifier = obj.modifiers.new("SF_ServiceChamfer", "BEVEL")
        modifier.width = max(0.025, bevel * (1.0 if lod == 0 else 0.62 if lod == 1 else 0.34))
        modifier.segments = 3 if lod == 0 else 1
        modifier.limit_method = "ANGLE"
    tag(obj, lod, material, name)
    move_to(obj, collection)
    return obj


def add_cylinder(collection, materials, lod: int, name: str, radius: float, depth: float,
                 location, material="Material_Mechanical", rotation=(0.0, 0.0, 0.0),
                 vertices=None, bevel=0.10):
    vertices = vertices or (32 if lod == 0 else 18 if lod == 1 else 8)
    bpy.ops.mesh.primitive_cylinder_add(
        vertices=vertices,
        radius=radius,
        depth=depth,
        end_fill_type="NGON",
        location=location,
        rotation=rotation,
    )
    obj = bpy.context.object
    obj.name = f"LOD{lod}_{name}"
    obj.data.materials.append(materials[material])
    if bevel > 0:
        modifier = obj.modifiers.new("SF_ServiceChamfer", "BEVEL")
        modifier.width = max(0.025, min(radius, depth) * bevel * (1.0 if lod == 0 else 0.65 if lod == 1 else 0.35))
        modifier.segments = 3 if lod == 0 else 1
        modifier.limit_method = "ANGLE"
    tag(obj, lod, material, name)
    move_to(obj, collection)
    return obj


def add_cone(collection, materials, lod: int, name: str, radius_bottom: float, radius_top: float,
             depth: float, location, material="Material_Mechanical", rotation=(0.0, 0.0, 0.0),
             vertices=None, bevel=0.06):
    vertices = vertices or (32 if lod == 0 else 18 if lod == 1 else 8)
    bpy.ops.mesh.primitive_cone_add(
        vertices=vertices,
        radius1=radius_bottom,
        radius2=radius_top,
        depth=depth,
        end_fill_type="NGON",
        location=location,
        rotation=rotation,
    )
    obj = bpy.context.object
    obj.name = f"LOD{lod}_{name}"
    obj.data.materials.append(materials[material])
    if bevel > 0:
        modifier = obj.modifiers.new("SF_ServiceChamfer", "BEVEL")
        modifier.width = max(0.025, min(max(radius_bottom, radius_top), depth) * bevel)
        modifier.segments = 3 if lod == 0 else 1
        modifier.limit_method = "ANGLE"
    tag(obj, lod, material, name)
    move_to(obj, collection)
    return obj


def add_torus(collection, materials, lod: int, name: str, major_radius: float, minor_radius: float,
              location, material="Material_Mechanical", rotation=(0.0, 0.0, 0.0), segments=None):
    major_segments = segments or (48 if lod == 0 else 28 if lod == 1 else 14)
    minor_segments = 10 if lod == 0 else 5 if lod == 1 else 4
    bpy.ops.mesh.primitive_torus_add(
        major_radius=major_radius,
        minor_radius=minor_radius,
        major_segments=major_segments,
        minor_segments=minor_segments,
        location=location,
        rotation=rotation,
    )
    obj = bpy.context.object
    obj.name = f"LOD{lod}_{name}"
    obj.data.materials.append(materials[material])
    tag(obj, lod, material, name)
    move_to(obj, collection)
    return obj


def add_sphere(collection, materials, lod: int, name: str, radius: float, location,
               material="Material_Glass", scale=(1.0, 1.0, 1.0)):
    bpy.ops.mesh.primitive_ico_sphere_add(
        subdivisions=3 if lod == 0 else 2 if lod == 1 else 1,
        radius=radius,
        location=location,
    )
    obj = bpy.context.object
    obj.name = f"LOD{lod}_{name}"
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(materials[material])
    tag(obj, lod, material, name)
    move_to(obj, collection)
    return obj


def add_beam(collection, materials, lod: int, name: str, start, end, width: float,
             material="Material_Mechanical", bevel=0.08):
    a = Vector(start)
    b = Vector(end)
    direction = b - a
    if direction.length <= 1e-6:
        raise ValueError(f"zero-length beam {name}")
    obj = add_box(
        collection,
        materials,
        lod,
        name,
        (width, width, direction.length),
        (a + b) * 0.5,
        material,
        bevel,
    )
    obj.rotation_mode = "QUATERNION"
    obj.rotation_quaternion = direction.to_track_quat("Z", "Y")
    return obj


def add_pipe_segment(collection, materials, lod: int, name: str, start, end, radius: float,
                     material="Material_Mechanical", flange_start=False, flange_end=False):
    """Create a round, mechanically terminated process line instead of a floating beam."""
    a = Vector(start)
    b = Vector(end)
    direction = b - a
    if direction.length <= 1e-6:
        raise ValueError(f"zero-length pipe {name}")
    vertices = (24, 14, 8)[lod]
    pipe = add_cylinder(
        collection,
        materials,
        lod,
        name,
        radius,
        direction.length,
        (a + b) * 0.5,
        material,
        vertices=vertices,
        bevel=0.025,
    )
    pipe.rotation_mode = "QUATERNION"
    pipe.rotation_quaternion = direction.to_track_quat("Z", "Y")
    if lod < 2:
        flange_depth = max(0.24, radius * 0.55)
        flange_radius = radius * 1.62
        for suffix, point, enabled in (("InletFlange", a, flange_start), ("OutletFlange", b, flange_end)):
            if not enabled:
                continue
            unit = direction.normalized()
            neck_center = point + unit * flange_depth * (0.72 if suffix == "InletFlange" else -0.72)
            neck = add_cylinder(
                collection,
                materials,
                lod,
                f"{name}_{suffix}_WallNeck",
                radius * 1.18,
                flange_depth * 1.35,
                neck_center,
                material,
                vertices=(24, 14, 8)[lod],
                bevel=0.025,
            )
            neck.rotation_mode = "QUATERNION"
            neck.rotation_quaternion = direction.to_track_quat("Z", "Y")
            flange = add_cylinder(
                collection,
                materials,
                lod,
                f"{name}_{suffix}",
                flange_radius,
                flange_depth,
                point,
                "Material_Warm" if material != "Material_Warm" else "Material_Mechanical",
                vertices=(24, 14, 8)[lod],
                bevel=0.035,
            )
            flange.rotation_mode = "QUATERNION"
            flange.rotation_quaternion = direction.to_track_quat("Z", "Y")
    return pipe


def add_fabricated_panel(collection, materials, lod: int, name: str, corners, thickness: float,
                         material="Material_Hull", bevel=0.06):
    """Create a closed, thick folded plate from an ordered four-corner face."""
    points = [Vector(corner) for corner in corners]
    normal = (points[1] - points[0]).cross(points[3] - points[0])
    if normal.length <= 1e-6:
        raise ValueError(f"degenerate fabricated panel {name}")
    normal.normalize()
    half = thickness * 0.5
    vertices = [tuple(point + normal * half) for point in points]
    vertices.extend(tuple(point - normal * half) for point in points)
    faces = (
        (0, 1, 2, 3),
        (7, 6, 5, 4),
        (0, 4, 5, 1),
        (1, 5, 6, 2),
        (2, 6, 7, 3),
        (3, 7, 4, 0),
    )
    mesh = bpy.data.meshes.new(f"LOD{lod}_{name}_Mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(f"LOD{lod}_{name}", mesh)
    obj.data.materials.append(materials[material])
    if bevel > 0:
        modifier = obj.modifiers.new("SF_FoldedPlateEdge", "BEVEL")
        modifier.width = bevel * (1.0 if lod == 0 else 0.62)
        modifier.segments = 2 if lod == 0 else 1
        modifier.limit_method = "ANGLE"
    tag(obj, lod, material, name)
    move_to(obj, collection)
    return obj


def add_machine_mount(collection, materials, lod: int, name: str, location, size=(3.0, 2.0, 0.6)):
    """A load-bearing skid with two feet; used to ground motors, pumps, and valve bodies."""
    x, y, z = location
    add_box(collection, materials, lod, f"{name}_Skid", size, (x, y, z), "Material_Hull", 0.10)
    if lod < 2:
        for side in (-1, 1):
            add_box(
                collection,
                materials,
                lod,
                f"{name}_Foot_{'L' if side < 0 else 'R'}",
                (size[0] * 0.24, size[1] * 1.12, 0.42),
                (x + side * size[0] * 0.31, y, z - 0.45),
                "Material_Mechanical",
                0.06,
            )


def add_radial_shoes(collection, materials, lod: int, prefix: str, center, radius: float,
                     count: int, depth: float):
    cx, cy, cz = center
    for index in range(count):
        angle = math.tau * index / count
        x = cx + math.cos(angle) * radius
        z = cz + math.sin(angle) * radius
        add_box(
            collection,
            materials,
            lod,
            f"{prefix}_Hardface_{index:02d}",
            (1.25 if lod == 0 else 1.0, depth, 0.72 if lod == 0 else 0.56),
            (x, cy, z),
            "Material_Warm",
            0.10,
            (0.0, -angle, 0.0),
        )


def build_load_frame(collection, materials, lod: int) -> None:
    # The long rail is both real load structure and the frozen X envelope datum at LOD0.
    rail_length = 98.0 if lod == 0 else 93.0 if lod == 1 else 88.0
    rail_center = 10.0 if lod == 0 else 8.0
    add_box(collection, materials, lod, "KeelDatum", (rail_length, 1.40, 1.40),
            (rail_center, 2.0, -18.0), "Material_Hull", 0.16)
    add_box(collection, materials, lod, "KeelStarboard", (82.0, 1.25, 1.25),
            (5.0, 10.5, -18.1), "Material_Hull", 0.14)
    add_box(collection, materials, lod, "ServiceDeck", (72.0, 9.0, 0.85),
            (7.0, 6.2, -12.7), "Material_Hull", 0.12)
    spacing = 8 if lod == 0 else 12 if lod == 1 else 22
    for index, x in enumerate(range(-30, 48, spacing)):
        add_box(collection, materials, lod, f"DeckCrossmember_{index:02d}", (1.0, 10.4, 1.1),
                (x, 6.2, -16.2), "Material_Mechanical", 0.10)
        if lod < 2 and index % 2 == 0:
            # Sparse triangular gussets communicate load paths without wallpapering the keel in Xs.
            add_beam(collection, materials, lod, f"KeelGussetInboard_{index:02d}",
                     (x - 1.8, 2.0, -17.8), (x + 1.8, 6.2, -13.1), 0.46,
                     "Material_Mechanical", 0.06)
            add_beam(collection, materials, lod, f"KeelGussetOutboard_{index:02d}",
                     (x - 1.8, 10.5, -17.8), (x + 1.8, 6.2, -13.1), 0.46,
                     "Material_Mechanical", 0.06)


def build_raw_feed(collection, materials, lod: int) -> None:
    top = {"xl": -38.0, "xr": -22.0, "yf": -4.2, "yb": 12.2, "z": 15.0}
    throat = {"xl": -33.0, "xr": -27.0, "yf": 1.0, "yb": 7.0, "z": -1.5}
    panel_thickness = 0.52 if lod == 0 else 0.44
    panels = (
        ("Front", ((top["xl"], top["yf"], top["z"]), (top["xr"], top["yf"], top["z"]),
                   (throat["xr"], throat["yf"], throat["z"]), (throat["xl"], throat["yf"], throat["z"]))),
        ("Back", ((top["xr"], top["yb"], top["z"]), (top["xl"], top["yb"], top["z"]),
                  (throat["xl"], throat["yb"], throat["z"]), (throat["xr"], throat["yb"], throat["z"]))),
        ("Port", ((top["xl"], top["yb"], top["z"]), (top["xl"], top["yf"], top["z"]),
                  (throat["xl"], throat["yf"], throat["z"]), (throat["xl"], throat["yb"], throat["z"]))),
        ("Starboard", ((top["xr"], top["yf"], top["z"]), (top["xr"], top["yb"], top["z"]),
                       (throat["xr"], throat["yb"], throat["z"]), (throat["xr"], throat["yf"], throat["z"]))),
    )
    for name, corners in panels:
        add_fabricated_panel(collection, materials, lod, f"RawFeedFolded{name}Panel",
                             corners, panel_thickness, "Material_Hull", 0.08)

    # Thick rectangular abrasion rim, liner throat, and removable grizzly establish wall thickness.
    rim_points = (
        ("Front", (top["xl"], top["yf"], 15.35), (top["xr"], top["yf"], 15.35)),
        ("Back", (top["xl"], top["yb"], 15.35), (top["xr"], top["yb"], 15.35)),
        ("Port", (top["xl"], top["yf"], 15.35), (top["xl"], top["yb"], 15.35)),
        ("Starboard", (top["xr"], top["yf"], 15.35), (top["xr"], top["yb"], 15.35)),
    )
    for name, start, end in rim_points:
        add_beam(collection, materials, lod, f"RawFeedAbrasionRim{name}", start, end,
                 0.92 if lod == 0 else 0.76, "Material_Mechanical", 0.055)
    add_box(collection, materials, lod, "RawFeedLinerThroat", (6.2, 6.2, 3.0),
            (-30.0, 4.0, -3.0), "Material_Mechanical", 0.16)
    grizzly_count = 6 if lod == 0 else 4
    for index in range(grizzly_count):
        x = -36.0 + index * (12.0 / max(1, grizzly_count - 1))
        add_box(collection, materials, lod, f"RawFeedGrizzly_{index}", (0.46, 14.6, 0.62),
                (x, 4.0, 15.85), "Material_Warm", 0.05)

    # Corner seam stiffeners terminate in a four-post load frame with visible gusset roots.
    top_corners = ((-38.0, -4.2, 15.0), (-22.0, -4.2, 15.0),
                   (-38.0, 12.2, 15.0), (-22.0, 12.2, 15.0))
    throat_corners = ((-33.0, 1.0, -1.5), (-27.0, 1.0, -1.5),
                      (-33.0, 7.0, -1.5), (-27.0, 7.0, -1.5))
    for index, (upper, lower) in enumerate(zip(top_corners, throat_corners)):
        add_beam(collection, materials, lod, f"RawFeedFoldSeam_{index}", upper, lower,
                 0.48 if lod == 0 else 0.40, "Material_Warm", 0.045)
        foot = (lower[0] + (-1.8 if lower[0] < -30 else 1.8), lower[1], -12.1)
        add_beam(collection, materials, lod, f"RawFeedLoadPost_{index}", lower, foot,
                 0.72 if lod == 0 else 0.60, "Material_Hull", 0.065)
        add_beam(collection, materials, lod, f"RawFeedGusset_{index}",
                 (foot[0], foot[1], -11.6), (-30.0, 4.0, -5.0),
                 0.34, "Material_Mechanical", 0.045)

    # Supported side service interface reaches the frozen -Y datum as a real maintenance shelf.
    if lod == 0:
        add_box(collection, materials, lod, "RawFeedIntakeDatum", (9.0, 1.0, 2.0),
                (-31.0, -5.25, 7.0), "Material_Hull", 0.10)
    add_beam(collection, materials, lod, "FeedChuteUpper", (-30.0, 4.0, -2.8),
             (-23.0, 5.5, -4.5), 3.0 if lod == 0 else 2.6, "Material_Hull", 0.09)
    add_machine_mount(collection, materials, lod, "RawFeedGateDrive", (-24.0, 1.0, -8.0),
                      (3.8, 2.4, 0.7))
    add_cylinder(collection, materials, lod, "RawFeedGateMotor", 1.05, 2.2,
                 (-24.0, 1.0, -6.8), "Material_Mechanical", (math.pi / 2, 0.0, 0.0),
                 (20, 12, 8)[lod], 0.05)
    add_box(collection, materials, lod, "RawFeedControlHousing", (4.8, 1.1, 2.2),
            (-31.0, -4.35, 7.0), "Material_Hull", 0.12)
    add_box(collection, materials, lod, "RawFeedStatusPanel", (3.6, 0.24, 0.84),
            (-31.0, -4.98, 7.0), "Material_Glass", 0.04)
    for index, x in enumerate((-34.0, -28.0)):
        add_beam(collection, materials, lod, f"RawFeedInterfaceBracket_{index}",
                 (x, -4.7, 6.1), (x, 0.8, -1.4), 0.38,
                 "Material_Mechanical", 0.045)


def build_crush_transfer(collection, materials, lod: int) -> None:
    rotor_vertices = (32, 18, 8)[lod]
    shoe_count = (12, 7, 4)[lod]
    for rotor_index, x in enumerate((-19.5, -12.0)):
        # Open cheek plates expose the twin toothed rotors and their real bearing/load path.
        for side, y in enumerate((0.55, 11.05)):
            add_box(collection, materials, lod, f"CrusherCheek_{rotor_index}_{side}",
                    (5.9, 0.72, 8.0), (x, y, -3.8), "Material_Hull", 0.22)
        add_machine_mount(collection, materials, lod, f"CrusherCradle_{rotor_index}",
                          (x, 5.8, -9.0), (6.6, 11.5, 0.75))
        add_cylinder(collection, materials, lod, f"CrusherRotor_{rotor_index}", 3.55, 10.2,
                     (x, 5.8, -3.6), "Material_Mechanical", (math.pi / 2, 0.0, 0.0),
                     rotor_vertices, 0.045)
        add_radial_shoes(collection, materials, lod, f"Crusher{rotor_index}",
                         (x, 5.8, -3.6), 3.72, shoe_count, 10.55)
        if lod < 2:
            for side, y in enumerate((0.15, 11.45)):
                add_cylinder(collection, materials, lod, f"CrusherBearing_{rotor_index}_{side}",
                             1.25, 0.80, (x, y, -3.6), "Material_Warm",
                             (math.pi / 2, 0.0, 0.0), (20, 12, 8)[lod], 0.06)
            # Front-mounted reduction gear and torque arm make the crushing drive legible.
            add_torus(collection, materials, lod, f"CrusherReductionGear_{rotor_index}", 2.05, 0.34,
                      (x, -0.15, -3.6), "Material_Mechanical", (math.pi / 2, 0.0, 0.0),
                      (36, 22, 12)[lod])
            add_cylinder(collection, materials, lod, f"CrusherDriveHub_{rotor_index}", 0.78, 0.95,
                         (x, -0.42, -3.6), "Material_Warm", (math.pi / 2, 0.0, 0.0),
                         (20, 12, 8)[lod], 0.04)
            add_beam(collection, materials, lod, f"CrusherTorqueArm_{rotor_index}",
                     (x, -0.3, -5.6), (x + (2.6 if rotor_index == 0 else -2.6), 0.3, -8.5),
                     0.42, "Material_Hull", 0.05)
    # V-shaped breaker throat physically lands feed between the counter-rotating drums.
    add_box(collection, materials, lod, "CrusherInfeedApronA", (8.4, 5.0, 0.70),
            (-18.0, 5.8, 2.3), "Material_Warm", 0.08, (0.0, -0.55, 0.0))
    add_box(collection, materials, lod, "CrusherInfeedApronB", (8.4, 5.0, 0.70),
            (-13.4, 5.8, 2.3), "Material_Warm", 0.08, (0.0, 0.55, 0.0))
    add_box(collection, materials, lod, "TransferTrough", (15.5, 5.0, 2.0),
            (-2.0, 6.0, -6.8), "Material_Mechanical", 0.16, (0.0, -0.08, 0.0))
    for side, y in enumerate((3.35, 8.65)):
        add_box(collection, materials, lod, f"TransferTroughGuard_{side}", (15.0, 0.42, 2.4),
                (-2.0, y, -5.7), "Material_Hull", 0.07, (0.0, -0.08, 0.0))
    transfer_rollers = 6 if lod == 0 else 3 if lod == 1 else 1
    for index in range(transfer_rollers):
        add_cylinder(collection, materials, lod, f"TransferRoller_{index}", 0.72, 4.7,
                     (-7.5 + index * (11.0 / max(1, transfer_rollers - 1)), 6.0, -5.8),
                     "Material_Warm", (math.pi / 2, 0.0, 0.0), (18, 12, 8)[lod], 0.04)
    # The transfer discharge is visibly flanged into the primary cyclone inlet.
    add_pipe_segment(collection, materials, lod, "CrusherDischargePipe",
                     (5.1, 6.0, -5.8), (2.0, 9.2, 1.8), 0.68,
                     "Material_Mechanical", flange_start=True, flange_end=True)


def build_separator_tower(collection, materials, lod: int, index: int, x: float, y: float,
                          base_z: float, height: float, radius: float) -> None:
    vertices = (20, 14, 8)[lod]
    if index == 0:
        # Primary hydrocyclone: visibly rolled facets, external seams, tangential feed, and spigot.
        cone_height = height * 0.54
        barrel_height = height * 0.28
        head_height = height - cone_height - barrel_height
        add_cone(collection, materials, lod, "Separator0_CycloneCone", radius * 0.16, radius,
                 cone_height, (x, y, base_z + cone_height * 0.5), "Material_Mechanical",
                 vertices=(14, 10, 8)[lod], bevel=0.028)
        add_cylinder(collection, materials, lod, "Separator0_VortexBarrel", radius, barrel_height,
                     (x, y, base_z + cone_height + 0.12 + barrel_height * 0.5), "Material_Mechanical",
                     vertices=(14, 10, 8)[lod], bevel=0.025)
        add_cone(collection, materials, lod, "Separator0_FoldedShoulder", radius, radius * 0.34,
                 head_height, (x, y, base_z + cone_height + barrel_height + head_height * 0.5),
                 "Material_Hull", vertices=(10, 8, 6)[lod], bevel=0.028)
        seam_count = 6 if lod == 0 else 4
        for seam in range(seam_count):
            angle = math.tau * seam / seam_count
            lower = (x + math.cos(angle) * radius * 0.18,
                     y + math.sin(angle) * radius * 0.18, base_z + 0.4)
            upper = (x + math.cos(angle) * radius * 1.02,
                     y + math.sin(angle) * radius * 1.02, base_z + cone_height - 0.3)
            add_beam(collection, materials, lod, f"Separator0_RolledSeam_{seam}",
                     lower, upper, 0.16, "Material_Hull", 0.028)
        add_torus(collection, materials, lod, "Separator0_ConeBarrelFlange", radius + 0.28, 0.26,
                  (x, y, base_z + cone_height), "Material_Warm", segments=(32, 18, 10)[lod])
        add_pipe_segment(collection, materials, lod, "Separator0_TangentialInlet",
                         (x - 5.2, y - radius * 0.72, base_z + cone_height + 1.6),
                         (x - radius * 0.72, y - radius * 0.72, base_z + cone_height + 1.6),
                         0.72, "Material_Mechanical", flange_start=True, flange_end=True)
        add_pipe_segment(collection, materials, lod, "Separator0_UnderflowSpigot",
                         (x, y, base_z - 0.2), (x, y, base_z - 2.2), 0.46,
                         "Material_Warm", flange_start=True, flange_end=True)
        add_box(collection, materials, lod, "Separator0_AccessShoulder", (2.6, 1.8, 1.4),
                (x + radius + 0.8, y, base_z + cone_height + barrel_height * 0.55),
                "Material_Hull", 0.12)
    elif index == 1:
        # Secondary pressure column: three fabricated rolled diameters and two functional collars.
        skirt_height = 4.2
        riser_height = 3.0
        add_cone(collection, materials, lod, "Separator1_LoadSkirt", radius * 1.18, radius * 0.82,
                 skirt_height, (x, y, base_z + skirt_height * 0.5), "Material_Hull",
                 vertices=(12, 10, 8)[lod], bevel=0.03)
        lower_bottom, lower_top = base_z + 4.4, base_z + 13.0
        mid_bottom, mid_top = base_z + 13.8, base_z + 22.8
        shoulder_bottom, shoulder_top = base_z + 22.95, base_z + 25.0
        upper_bottom, upper_top = base_z + 25.15, base_z + 32.5
        add_cylinder(collection, materials, lod, "Separator1_LowerRolledSection", radius * 1.05,
                     lower_top - lower_bottom, (x, y, (lower_bottom + lower_top) * 0.5),
                     "Material_Mechanical", vertices=vertices, bevel=0.022)
        add_cylinder(collection, materials, lod, "Separator1_MidRolledSection", radius * 0.90,
                     mid_top - mid_bottom, (x, y, (mid_bottom + mid_top) * 0.5),
                     "Material_Mechanical", vertices=vertices, bevel=0.022)
        add_cone(collection, materials, lod, "Separator1_AsymmetricShoulder", radius * 0.90,
                 radius * 1.04, shoulder_top - shoulder_bottom,
                 (x, y, (shoulder_bottom + shoulder_top) * 0.5), "Material_Hull",
                 vertices=(12, 10, 8)[lod], bevel=0.028)
        add_cylinder(collection, materials, lod, "Separator1_UpperRolledSection", radius * 1.04,
                     upper_top - upper_bottom, (x, y, (upper_bottom + upper_top) * 0.5),
                     "Material_Mechanical", vertices=vertices, bevel=0.022)
        add_sphere(collection, materials, lod, "Separator1_DomedHead", radius * 1.04,
                   (x, y, upper_top), "Material_Mechanical", (1.0, 1.0, 0.66))
        add_cylinder(collection, materials, lod, "Separator1_OverheadRiser", radius * 0.28,
                     riser_height, (x, y, base_z + height - riser_height * 0.5),
                     "Material_Warm", vertices=vertices, bevel=0.035)
        for collar, (z, collar_radius) in enumerate(((base_z + 13.4, radius * 1.08),
                                                     (base_z + 25.05, radius * 1.10))):
            add_torus(collection, materials, lod, f"Separator1_FunctionalCollar_{collar}",
                      collar_radius, 0.28, (x, y, z), "Material_Warm",
                      segments=(34, 20, 10)[lod])
        # One vertical rolled seam per section keeps fabrication visible without a ring stack.
        for section, (sy, sz, sh) in enumerate((
            (y - radius * 1.06, (lower_bottom + lower_top) * 0.5, lower_top - lower_bottom - 0.6),
            (y - radius * 0.91, (mid_bottom + mid_top) * 0.5, mid_top - mid_bottom - 0.6),
            (y - radius * 1.05, (upper_bottom + upper_top) * 0.5, upper_top - upper_bottom - 0.6),
        )):
            add_box(collection, materials, lod, f"Separator1_RolledSeam_{section}",
                    (0.26, 0.24, sh), (x + 1.1 * (section - 1), sy, sz),
                    "Material_Hull", 0.035)
        add_pipe_segment(collection, materials, lod, "Separator1_FeedNozzle",
                         (x - radius - 2.8, y, base_z + 15.5),
                         (x - radius * 0.88, y, base_z + 15.5),
                         0.66, "Material_Mechanical", flange_start=True, flange_end=True)
        add_box(collection, materials, lod, "Separator1_AccessDoghouse", (3.2, 2.4, 3.8),
                (x + radius + 1.2, y, base_z + 18.0), "Material_Hull", 0.18)
        add_pipe_segment(collection, materials, lod, "Separator1_SideSampleRoot",
                         (x + radius * 1.0, y, base_z + 18.0),
                         (x + radius + 2.9, y, base_z + 18.0), 0.42,
                         "Material_Mechanical", flange_start=True, flange_end=True)
    else:
        # Tertiary lamella classifier: faceted solids boot and rectangular inclined-plate cell.
        boot_height = height * 0.34
        cell_height = height * 0.49
        hood_height = height * 0.17
        add_cone(collection, materials, lod, "Separator2_SolidsBoot", radius * 0.18, radius * 1.05,
                 boot_height, (x, y, base_z + boot_height * 0.5), "Material_Warm",
                 vertices=(12, 8, 6)[lod], bevel=0.035)
        add_box(collection, materials, lod, "Separator2_LamellaCell",
                (radius * 2.25, radius * 1.55, cell_height),
                (x, y, base_z + boot_height + cell_height * 0.5),
                "Material_Hull", 0.20)
        add_cone(collection, materials, lod, "Separator2_OverflowHood", radius * 1.02, radius * 0.48,
                 hood_height, (x, y, base_z + boot_height + cell_height + hood_height * 0.5),
                 "Material_Mechanical", vertices=(12, 8, 6)[lod], bevel=0.03)
        if lod < 2:
            plate_count = 6 if lod == 0 else 3
            for plate in range(plate_count):
                px = x - radius * 0.78 + plate * (radius * 1.56 / max(1, plate_count - 1))
                add_box(collection, materials, lod, f"Separator2_LamellaPlate_{plate}",
                        (0.24, radius * 1.72, cell_height * 0.72),
                        (px, y - radius * 0.04, base_z + boot_height + cell_height * 0.52),
                        "Material_Mechanical", 0.025, (0.0, math.radians(-18), 0.0))
        add_box(collection, materials, lod, "Separator2_OverflowLaunder",
                (radius * 2.55, radius * 1.78, 0.62),
                (x, y, base_z + boot_height + cell_height - 0.45),
                "Material_Accent", 0.07)
        add_pipe_segment(collection, materials, lod, "Separator2_SolidsOutlet",
                         (x, y, base_z - 0.2), (x + 2.2, y, base_z - 2.1), 0.52,
                         "Material_Warm", flange_start=True, flange_end=True)
        add_fabricated_panel(collection, materials, lod, "Separator2_OverflowShoulder",
                             ((x - radius, y - radius * 0.92, base_z + 15.2),
                              (x + radius, y - radius * 0.92, base_z + 15.2),
                              (x + radius * 0.72, y - radius * 1.15, base_z + 12.5),
                              (x - radius * 0.72, y - radius * 1.15, base_z + 12.5)),
                             0.32, "Material_Hull", 0.045)

    # Each stage gets a differently oriented access interface and cantilevered service deck.
    manway_z = base_z + height * (0.52 if index != 1 else 0.46)
    if index == 1:
        manway_location = (x + radius + 0.30, y, manway_z)
        manway_rotation = (0.0, math.pi / 2, 0.0)
        platform_size = (2.2, radius * 2.5, 0.46)
        platform_location = (x + radius + 1.15, y, manway_z - 1.6)
    else:
        manway_location = (x, y - radius - 0.30, manway_z)
        manway_rotation = (math.pi / 2, 0.0, 0.0)
        platform_size = (radius * 2.5, 2.2, 0.46)
        platform_location = (x, y - radius - 1.15, manway_z - 1.6)
    add_cylinder(collection, materials, lod, f"Separator{index}_ManwayCover", radius * 0.30, 0.42,
                 manway_location, "Material_Mechanical", manway_rotation,
                 (20, 12, 8)[lod], 0.035)
    if index == 1:
        flange_location = (manway_location[0] + 0.23, manway_location[1], manway_location[2])
    else:
        flange_location = (manway_location[0], manway_location[1] - 0.23, manway_location[2])
    add_torus(collection, materials, lod, f"Separator{index}_ManwayFlange", radius * 0.34, 0.11,
              flange_location, "Material_Warm", manway_rotation, (26, 16, 8)[lod])
    add_box(collection, materials, lod, f"Separator{index}_CantileverDeck", platform_size,
            platform_location, "Material_Hull", 0.07)
    if index == 1:
        support_ends = ((x + radius * 0.72, y - radius * 0.55, manway_z - 0.5),
                        (x + radius * 0.72, y + radius * 0.55, manway_z - 0.5))
        support_starts = ((platform_location[0], y - radius * 0.55, manway_z - 1.8),
                          (platform_location[0], y + radius * 0.55, manway_z - 1.8))
    else:
        support_ends = ((x - radius * 0.55, y - radius * 0.72, manway_z - 0.5),
                        (x + radius * 0.55, y - radius * 0.72, manway_z - 0.5))
        support_starts = ((x - radius * 0.55, platform_location[1], manway_z - 1.8),
                          (x + radius * 0.55, platform_location[1], manway_z - 1.8))
    for support, (start, end) in enumerate(zip(support_starts, support_ends)):
        add_beam(collection, materials, lod, f"Separator{index}_DeckKnee_{support}",
                 start, end, 0.24, "Material_Mechanical", 0.035)

    for side in (-1, 1):
        add_beam(collection, materials, lod, f"Separator{index}_LoadLeg_{side}",
                 (x + side * radius * 0.72, y, base_z + 1.0),
                 (x + side * (radius + 1.0), y, -12.1), 0.38,
                 "Material_Hull", 0.05)


def build_separation_stack(collection, materials, lod: int) -> None:
    towers = (
        (0, 2.0, 13.0, -10.0, 24.0, 3.8),
        (1, 11.0, 23.0, -9.0, 39.0, 4.5),
        (2, 20.0, 15.5, -10.0, 27.0, 4.1),
    )
    for args in towers:
        build_separator_tower(collection, materials, lod, *args)
    # Purpose-built stage connections: cyclone overflow -> pressure column -> lamella cell.
    stage_lines = (
        ("CycloneOverflowRiser", (2.0, 13.0, 14.0), (2.0, 13.0, 17.0), 0.48, "Material_Mechanical"),
        ("CycloneToColumnA", (2.0, 13.0, 17.0), (7.0, 18.0, 17.0), 0.48, "Material_Mechanical"),
        ("CycloneToColumnB", (7.0, 18.0, 17.0), (7.0, 23.0, 10.2), 0.48, "Material_Mechanical"),
        ("ColumnBottomsA", (11.0, 23.0, -5.0), (15.0, 20.0, -5.0), 0.62, "Material_Warm"),
        ("ColumnBottomsB", (15.0, 20.0, -5.0), (16.0, 15.5, 2.0), 0.62, "Material_Warm"),
        ("ClarifiedProduct", (20.0, 12.3, 8.0), (25.0, 12.3, 8.0), 0.54, "Material_Accent"),
    )
    for index, (name, start, end, radius, material) in enumerate(stage_lines):
        add_pipe_segment(collection, materials, lod, name, start, end, radius, material,
                         flange_start=index in (0, 3, 5), flange_end=True)
    # Pipe shoes terminate in real deck brackets rather than floating through space.
    if lod < 2:
        for index, (x, y, z) in enumerate(((7.0, 18.0, 17.0), (15.0, 20.0, -5.0), (25.0, 12.3, 8.0))):
            add_beam(collection, materials, lod, f"SeparationPipeRack_{index}",
                     (x, y, -12.0), (x, y, z - 0.7), 0.34, "Material_Hull", 0.045)
            add_box(collection, materials, lod, f"SeparationPipeShoe_{index}",
                    (1.5, 1.5, 0.34), (x, y, z - 0.55), "Material_Hull", 0.04)
    # Frozen crown datum is now the bolted weather cap on the pressure-column overhead riser.
    if lod == 0:
        add_box(collection, materials, lod, "SeparationCrownDatum", (3.2, 3.0, 1.0),
                (11.0, 23.0, 30.0), "Material_Hull", 0.08)
    if lod < 2:
        add_box(collection, materials, lod, "SeparationMaintenanceWalk", (27.0, 2.2, 0.48),
                (10.0, 7.7, 3.2), "Material_Hull", 0.07)
        rail_posts = (-2.5, 4.0, 10.5, 17.0, 23.5) if lod == 0 else (-2.5, 10.5, 23.5)
        for index, x in enumerate(rail_posts):
            add_beam(collection, materials, lod, f"SeparationRailPost_{index}",
                     (x, 6.55, 3.3), (x, 6.55, 5.2), 0.18,
                     "Material_Mechanical", 0.035)
        add_beam(collection, materials, lod, "SeparationHandrail",
                 (-2.5, 6.55, 5.2), (23.5, 6.55, 5.2), 0.18,
                 "Material_Mechanical", 0.035)
        add_box(collection, materials, lod, "SeparationControlHousing", (4.2, 1.1, 2.8),
                (7.0, 8.7, -1.2), "Material_Hull", 0.12)
        add_box(collection, materials, lod, "SeparationControlReadout", (3.2, 0.24, 1.5),
                (7.0, 8.08, -1.1), "Material_Glass", 0.04)
        add_beam(collection, materials, lod, "SeparationControlBracket",
                 (7.0, 9.2, -2.4), (7.0, 10.8, -12.0), 0.34,
                 "Material_Mechanical", 0.045)


def build_thermal_recovery(collection, materials, lod: int) -> None:
    vertices = (28, 16, 8)[lod]
    # A horizontal rotary kiln reads as conversion machinery rather than another storage drum.
    add_cylinder(collection, materials, lod, "ThermalRotaryKiln", 5.7, 15.2,
                 (29.0, 31.0, 0.5), "Material_Warm", (math.pi / 2, 0.0, 0.0),
                 vertices=vertices, bevel=0.035)
    add_cone(collection, materials, lod, "ThermalBurnerThroat", 2.2, 4.5, 3.2,
             (29.0, 21.9, 0.5), "Material_Mechanical", (math.pi / 2, 0.0, 0.0),
             vertices=vertices, bevel=0.035)
    add_pipe_segment(collection, materials, lod, "ThermalFuelManifold",
                     (23.0, 19.9, -0.2), (28.8, 20.3, 0.2), 0.44,
                     "Material_Warm", flange_start=True, flange_end=True)
    tyre_positions = (27.0, 35.0) if lod < 2 else (31.0,)
    for index, y in enumerate(tyre_positions):
        add_torus(collection, materials, lod, f"ThermalSupportTyre_{index}", 6.0, 0.48,
                  (29.0, y, 0.5), "Material_Mechanical", (math.pi / 2, 0.0, 0.0),
                  (40, 22, 10)[lod])
        for side in (-1, 1):
            add_cylinder(collection, materials, lod, f"ThermalTrunnion_{index}_{side}", 0.82, 2.4,
                         (29.0 + side * 4.2, y, -5.4), "Material_Mechanical",
                         (0.0, math.pi / 2, 0.0), (20, 12, 8)[lod], 0.04)
        add_machine_mount(collection, materials, lod, f"ThermalSaddle_{index}",
                          (29.0, y, -7.0), (11.0, 2.2, 0.75))
    if lod < 2:
        add_torus(collection, materials, lod, "ThermalDriveGear", 6.25, 0.34,
                  (29.0, 33.0, 0.5), "Material_Hull", (math.pi / 2, 0.0, 0.0),
                  (44, 24, 12)[lod])
        add_machine_mount(collection, materials, lod, "ThermalDriveMotor", (21.8, 33.0, -7.2),
                          (4.0, 3.0, 0.72))
        add_cylinder(collection, materials, lod, "ThermalDriveMotorBody", 1.35, 3.0,
                     (21.8, 33.0, -5.3), "Material_Mechanical", (math.pi / 2, 0.0, 0.0),
                     (24, 14, 8)[lod], 0.045)
        add_beam(collection, materials, lod, "ThermalDriveTorqueLink",
                 (23.0, 33.0, -5.2), (25.2, 33.0, -2.6), 0.42,
                 "Material_Hull", 0.045)

    # Waste-heat recovery uses two real headers and a supported tube bank.
    add_cylinder(collection, materials, lod, "HeatRecoveryHotHeader", 1.25, 11.0,
                 (29.0, 41.7, 6.8), "Material_Warm", (0.0, math.pi / 2, 0.0),
                 vertices=vertices, bevel=0.04)
    add_cylinder(collection, materials, lod, "HeatRecoveryColdHeader", 1.25, 11.0,
                 (29.0, 56.2, 6.8), "Material_Mechanical", (0.0, math.pi / 2, 0.0),
                 vertices=vertices, bevel=0.04)
    tube_count = 7 if lod == 0 else 4 if lod == 1 else 2
    for index in range(tube_count):
        x = 24.5 + index * (9.0 / max(1, tube_count - 1))
        z = 3.5 + 1.1 * (index % 3)
        add_pipe_segment(collection, materials, lod, f"HeatRecoveryTube_{index:02d}",
                         (x, 42.1, z), (x, 55.8, z), 0.34 if lod < 2 else 0.46,
                         "Material_Mechanical", flange_start=lod == 0, flange_end=lod == 0)
    for index, y in enumerate((44.0, 50.0, 55.0) if lod < 2 else (50.0,)):
        add_box(collection, materials, lod, f"HeatRecoveryBaffle_{index}",
                (11.4, 0.58, 8.6), (29.0, y, 4.7), "Material_Hull", 0.07)
    add_pipe_segment(collection, materials, lod, "KilnToHeatRecoveryRiser",
                     (29.0, 38.6, 2.2), (29.0, 41.7, 6.8), 0.78,
                     "Material_Warm", flange_start=True, flange_end=True)
    if lod < 2:
        for x in (24.2, 33.8):
            add_beam(collection, materials, lod, f"HeatRecoveryRack_{int(x)}",
                     (x, 49.0, -12.0), (x, 49.0, 8.2), 0.45,
                     "Material_Hull", 0.05)
        add_box(collection, materials, lod, "ThermalControlHousing", (4.8, 1.1, 2.8),
                (20.5, 24.0, 4.5), "Material_Hull", 0.14)
        add_box(collection, materials, lod, "ThermalControlReadout", (3.6, 0.24, 1.4),
                (20.5, 23.38, 4.5), "Material_Glass", 0.04)
        add_beam(collection, materials, lod, "ThermalControlBracket",
                 (20.5, 24.6, 3.2), (23.8, 27.0, -4.0), 0.38,
                 "Material_Mechanical", 0.045)
        add_box(collection, materials, lod, "ThermalMaintenanceWalk", (16.0, 2.0, 0.50),
                (29.0, 22.5, 7.5), "Material_Hull", 0.07)
        for index, x in enumerate((21.5, 25.3, 29.0, 32.7, 36.5)):
            add_beam(collection, materials, lod, f"ThermalRailPost_{index}",
                     (x, 21.45, 7.6), (x, 21.45, 9.4), 0.18,
                     "Material_Mechanical", 0.035)
        add_beam(collection, materials, lod, "ThermalHandrail",
                 (21.5, 21.45, 9.4), (36.5, 21.45, 9.4), 0.18,
                 "Material_Mechanical", 0.035)
    if lod == 0:
        # The cold-header service cap is the frozen +Y datum and a functional exchanger endpoint.
        add_box(collection, materials, lod, "HeatRecoveryDatum", (8.0, 1.0, 2.0),
                (29.0, 57.6, 6.8), "Material_Hull", 0.08)


def build_chalk_mass_flow_bin(collection, materials, lod: int, bin_index: int, y: float) -> None:
    x = 39.0
    top_z = 0.4
    upper_bottom_z = -6.85
    hopper_top_z = -7.15
    throat_z = -12.75
    outer = 4.0
    shoulder = 3.35
    throat = 1.0
    thickness = 0.38 if lod == 0 else 0.30

    def wall_panels(prefix, top_half, top_level, bottom_half, bottom_level):
        definitions = (
            ("Front", ((x - top_half, y - top_half, top_level), (x + top_half, y - top_half, top_level),
                       (x + bottom_half, y - bottom_half, bottom_level), (x - bottom_half, y - bottom_half, bottom_level))),
            ("Back", ((x + top_half, y + top_half, top_level), (x - top_half, y + top_half, top_level),
                      (x - bottom_half, y + bottom_half, bottom_level), (x + bottom_half, y + bottom_half, bottom_level))),
            ("Port", ((x - top_half, y + top_half, top_level), (x - top_half, y - top_half, top_level),
                      (x - bottom_half, y - bottom_half, bottom_level), (x - bottom_half, y + bottom_half, bottom_level))),
            ("Starboard", ((x + top_half, y - top_half, top_level), (x + top_half, y + top_half, top_level),
                           (x + bottom_half, y + bottom_half, bottom_level), (x + bottom_half, y - bottom_half, bottom_level))),
        )
        for side, corners in definitions:
            add_fabricated_panel(collection, materials, lod, f"ChalkBin{bin_index}_{prefix}{side}",
                                 corners, thickness, "Material_Accent", 0.055)

    wall_panels("LinerWall", outer, top_z, shoulder, upper_bottom_z)
    wall_panels("MassFlowHopper", shoulder, hopper_top_z, throat, throat_z)

    # Exposed liner rim and shoulder frame make the ceramic wall thickness explicit.
    for level_name, half, z in (("Top", outer, top_z + 0.20), ("Shoulder", shoulder, -7.0)):
        rim = (
            ((x - half, y - half, z), (x + half, y - half, z)),
            ((x - half, y + half, z), (x + half, y + half, z)),
            ((x - half, y - half, z), (x - half, y + half, z)),
            ((x + half, y - half, z), (x + half, y + half, z)),
        )
        for edge, (start, end) in enumerate(rim):
            add_beam(collection, materials, lod, f"ChalkBin{bin_index}_{level_name}Rim_{edge}",
                     start, end, 0.36 if level_name == "Top" else 0.30,
                     "Material_Mechanical" if level_name == "Top" else "Material_Hull", 0.04)

    for corner, (dx, dy) in enumerate(((-outer, -outer), (outer, -outer),
                                       (-outer, outer), (outer, outer))):
        add_beam(collection, materials, lod, f"ChalkBin{bin_index}_PanelSeam_{corner}",
                 (x + dx, y + dy, top_z - 0.2),
                 (x + math.copysign(shoulder, dx), y + math.copysign(shoulder, dy), upper_bottom_z + 0.2),
                 0.20, "Material_Hull", 0.03)
        add_beam(collection, materials, lod, f"ChalkBin{bin_index}_SupportLeg_{corner}",
                 (x + dx * 0.96, y + dy * 0.96, -5.8),
                 (x + dx * 1.02, y + dy * 1.02, -16.0),
                 0.38, "Material_Hull", 0.045)

    add_pipe_segment(collection, materials, lod, f"ChalkBin{bin_index}_ValveNeck",
                     (x, y, throat_z - 0.05), (x, y, -13.35), 0.70,
                     "Material_Mechanical", flange_start=True, flange_end=True)
    add_cylinder(collection, materials, lod, f"ChalkRotaryValve_{bin_index}", 1.08, 2.0,
                 (x, y, -13.65), "Material_Warm", (math.pi / 2, 0.0, 0.0),
                 vertices=(20, 12, 8)[lod], bevel=0.04)
    add_machine_mount(collection, materials, lod, f"ChalkValveFrame_{bin_index}",
                      (x, y, -16.15), (4.0, 3.8, 0.66))


def build_storage(collection, materials, lod: int) -> None:
    vertices = (28, 16, 8)[lod]
    # Agitated slurry thickener: open-rim tank, conical rake boot, gearbox, and pump skid.
    add_cylinder(collection, materials, lod, "SlurryThickenerBasin", 5.8, 7.0,
                 (38.0, 14.0, -3.5), "Material_Hull", vertices=vertices, bevel=0.045)
    add_cone(collection, materials, lod, "SlurryRakeBoot", 1.6, 5.8, 5.6,
             (38.0, 14.0, -9.8), "Material_Mechanical", vertices=vertices, bevel=0.035)
    add_torus(collection, materials, lod, "SlurryOverflowRim", 5.95, 0.34,
              (38.0, 14.0, 0.15), "Material_Mechanical", segments=(40, 22, 10)[lod])
    add_box(collection, materials, lod, "SlurryBridge", (13.2, 1.2, 0.72),
            (38.0, 14.0, 1.0), "Material_Hull", 0.09)
    add_cylinder(collection, materials, lod, "SlurryAgitatorGearbox", 1.35, 2.0,
                 (38.0, 14.0, 2.3), "Material_Mechanical", vertices=vertices, bevel=0.05)
    add_cylinder(collection, materials, lod, "SlurryAgitatorMotor", 0.86, 2.8,
                 (38.0, 14.0, 4.0), "Material_Warm", (0.0, math.pi / 2, 0.0),
                 vertices=vertices, bevel=0.04)
    add_pipe_segment(collection, materials, lod, "SlurryDischarge",
                     (38.0, 14.0, -12.8), (34.0, 12.0, -14.0), 0.66,
                     "Material_Mechanical", flange_start=True, flange_end=True)
    add_machine_mount(collection, materials, lod, "SlurryPump", (31.5, 11.5, -12.0),
                      (4.2, 3.0, 0.70))
    add_cylinder(collection, materials, lod, "SlurryPumpBody", 1.15, 2.6,
                 (31.5, 11.5, -10.4), "Material_Mechanical", (0.0, math.pi / 2, 0.0),
                 vertices=vertices, bevel=0.05)
    if lod < 2:
        add_box(collection, materials, lod, "SlurryGaugeHousing", (1.4, 0.70, 4.8),
                (38.0, 7.95, -3.0), "Material_Hull", 0.08)
        add_box(collection, materials, lod, "SlurryGaugeReadout", (0.76, 0.20, 3.8),
                (38.0, 7.55, -3.0), "Material_Glass", 0.035)
        add_beam(collection, materials, lod, "SlurryGaugeBracket",
                 (38.0, 8.3, -5.4), (38.0, 9.0, -8.0), 0.30,
                 "Material_Mechanical", 0.04)
        for index, x in enumerate((32.0, 38.0, 44.0)):
            add_beam(collection, materials, lod, f"SlurryBridgeRailPost_{index}",
                     (x, 13.2, 1.2), (x, 13.2, 3.0), 0.18,
                     "Material_Mechanical", 0.035)
        add_beam(collection, materials, lod, "SlurryBridgeHandrail",
                 (32.0, 13.2, 3.0), (44.0, 13.2, 3.0), 0.18,
                 "Material_Mechanical", 0.035)

    # Dry product uses thick ceramic liner panels, mass-flow hoppers, and rooted discharge hardware.
    for bin_index, y in enumerate((26.5, 36.0)):
        build_chalk_mass_flow_bin(collection, materials, lod, bin_index, y)
    add_pipe_segment(collection, materials, lod, "SlurryTransferLine", (24.0, 15.5, -7.0),
                     (32.0, 13.0, -7.0), 0.72, "Material_Mechanical",
                     flange_start=True, flange_end=True)
    add_pipe_segment(collection, materials, lod, "ChalkPneumaticLineA", (25.0, 12.3, 8.0),
                     (34.0, 25.0, 2.0), 0.54, "Material_Accent",
                     flange_start=True, flange_end=True)
    add_pipe_segment(collection, materials, lod, "ChalkPneumaticLineB", (34.0, 25.0, 2.0),
                     (39.0, 31.0, 2.2), 0.54, "Material_Accent",
                     flange_start=True, flange_end=True)
    for bin_index, y in enumerate((26.5, 36.0)):
        add_pipe_segment(collection, materials, lod, f"ChalkBinFeedDrop_{bin_index}",
                         (39.0, 31.0, 2.2), (39.0, y, 0.65), 0.48,
                         "Material_Accent", flange_start=True, flange_end=True)
    add_pipe_segment(collection, materials, lod, "ChalkScrewConveyor", (39.0, 25.5, -14.2),
                     (39.0, 37.0, -14.2), 0.82, "Material_Mechanical",
                     flange_start=True, flange_end=True)
    add_machine_mount(collection, materials, lod, "ChalkScrewDrive", (39.0, 39.0, -13.5),
                      (3.6, 2.8, 0.68))
    add_cylinder(collection, materials, lod, "ChalkScrewMotor", 0.92, 2.4,
                 (39.0, 39.0, -12.0), "Material_Warm", (math.pi / 2, 0.0, 0.0),
                 vertices=(20, 12, 8)[lod], bevel=0.04)
    if lod == 0:
        # The sump is the deliberate frozen -Z datum, not an invisible bounds spike.
        add_box(collection, materials, lod, "SlurrySumpDatum", (8.0, 4.0, 1.5),
                (33.0, 16.0, -24.25), "Material_Mechanical", 0.10)
        add_pipe_segment(collection, materials, lod, "SlurrySumpDowncomer", (34.0, 12.0, -14.0),
                         (33.0, 16.0, -23.3), 0.75, "Material_Mechanical",
                         flange_start=True, flange_end=True)


def build_dock_control(collection, materials, lod: int) -> None:
    # Two folded faceted frames and diagonal ties replace the former torus silhouette.
    segments = 10 if lod == 0 else 8
    front_x, front_radius = 47.2, 5.2
    rear_x, rear_radius = 51.8, 4.45
    front_points = []
    rear_points = []
    for index in range(segments):
        angle = math.tau * index / segments
        front_points.append((front_x, math.cos(angle) * front_radius, math.sin(angle) * front_radius))
        rear_points.append((rear_x, math.cos(angle) * rear_radius, math.sin(angle) * rear_radius))
    for index in range(segments):
        next_index = (index + 1) % segments
        add_beam(collection, materials, lod, f"DockFrontYokePanel_{index}",
                 front_points[index], front_points[next_index], 0.66,
                 "Material_Hull", 0.055)
        add_beam(collection, materials, lod, f"DockRearYokePanel_{index}",
                 rear_points[index], rear_points[next_index], 0.52,
                 "Material_Hull", 0.05)
        if index % 2 == 0 or lod == 0:
            add_beam(collection, materials, lod, f"DockYokeTruss_{index}",
                     front_points[index], rear_points[(index + 1) % segments], 0.34,
                     "Material_Mechanical", 0.04)

    # Four approach rails root the exact X=42.48 socket corridor into the front yoke.
    for index, (y, z) in enumerate(((3.4, 3.4), (-3.4, 3.4), (3.4, -3.4), (-3.4, -3.4))):
        add_beam(collection, materials, lod, f"DockApproachRail_{index}",
                 (42.8, y * 0.72, z * 0.72), (47.2, y, z), 0.42,
                 "Material_Mechanical", 0.045)
    add_box(collection, materials, lod, "DockGuideSillPort", (14.5, 0.60, 0.60),
            (49.5, -3.8, -5.2), "Material_Mechanical", 0.07)
    add_box(collection, materials, lod, "DockGuideSillStarboard", (14.5, 0.60, 0.60),
            (49.5, 3.8, -5.2), "Material_Mechanical", 0.07)

    # A recessed pod is armored by folded side/back/roof panels and tied into yoke plus keel.
    add_box(collection, materials, lod, "DockControlInnerCell", (7.4, 5.4, 4.6),
            (52.0, 8.5, 5.0), "Material_Mechanical", 0.20)
    add_fabricated_panel(collection, materials, lod, "DockControlPortArmor",
                         ((48.2, 5.5, 2.3), (48.2, 11.5, 2.3),
                          (49.0, 10.9, 8.2), (49.0, 6.1, 8.2)),
                         0.42, "Material_Hull", 0.07)
    add_fabricated_panel(collection, materials, lod, "DockControlStarboardArmor",
                         ((55.8, 11.5, 2.3), (55.8, 5.5, 2.3),
                          (55.0, 6.1, 8.2), (55.0, 10.9, 8.2)),
                         0.42, "Material_Hull", 0.07)
    add_fabricated_panel(collection, materials, lod, "DockControlRearArmor",
                         ((55.8, 11.5, 2.3), (48.2, 11.5, 2.3),
                          (49.0, 10.9, 8.2), (55.0, 10.9, 8.2)),
                         0.42, "Material_Hull", 0.07)
    add_fabricated_panel(collection, materials, lod, "DockControlRoofArmor",
                         ((49.0, 6.1, 8.2), (55.0, 6.1, 8.2),
                          (55.0, 10.9, 8.2), (49.0, 10.9, 8.2)),
                         0.44, "Material_Hull", 0.07)
    add_box(collection, materials, lod, "DockControlWindow", (5.8, 0.28, 1.55),
            (52.0, 5.70, 5.25), "Material_Glass", 0.05)
    window_frame = (
        ((49.0, 5.48, 4.25), (55.0, 5.48, 4.25)),
        ((49.0, 5.48, 6.25), (55.0, 5.48, 6.25)),
        ((49.0, 5.48, 4.25), (49.0, 5.48, 6.25)),
        ((55.0, 5.48, 4.25), (55.0, 5.48, 6.25)),
    )
    for index, (start, end) in enumerate(window_frame):
        add_beam(collection, materials, lod, f"DockWindowFrame_{index}", start, end,
                 0.26, "Material_Hull", 0.035)
    for index, point in enumerate(((49.0, 6.0, 2.4), (55.0, 6.0, 2.4))):
        add_beam(collection, materials, lod, f"DockPodYokeTie_{index}",
                 point, rear_points[(2 + index * (segments // 2)) % segments], 0.46,
                 "Material_Mechanical", 0.05)
    for side, x in enumerate((49.0, 55.0)):
        add_beam(collection, materials, lod, f"DockControlLoadLeg_{side}",
                 (x, 7.0, 2.0), (x - 2.0, 5.8, -12.0), 0.58,
                 "Material_Hull", 0.06)
    add_pipe_segment(collection, materials, lod, "DockControlPowerConduit",
                     (44.0, 5.8, -11.2), (49.0, 6.8, 2.2), 0.32,
                     "Material_Mechanical", flange_start=lod < 2, flange_end=lod < 2)
    pad_count = 3 if lod == 0 else 2
    for index in range(pad_count):
        add_box(collection, materials, lod, f"DockHazardPad_{index}", (1.0, 0.42, 0.32),
                (46.5 + index * 3.0, -4.45, -0.4),
                "Material_Accent", 0.035)
    add_cylinder(collection, materials, lod, "DockBeaconSocket", 0.62, 0.55,
                 (56.0, 8.4, 8.55), "Material_Mechanical", vertices=(18, 12, 8)[lod], bevel=0.04)
    add_sphere(collection, materials, lod, "DockRangeBeacon", 0.75,
               (56.0, 8.4, 9.2), "Material_Glass", (1.0, 1.0, 1.4))
    add_box(collection, materials, lod, "DockServiceWalk", (10.0, 2.0, 0.55),
            (51.5, 3.5, 0.0), "Material_Hull", 0.08)
    for x in (47.0, 56.0):
        add_beam(collection, materials, lod, f"DockServiceRailPost_{int(x)}",
                 (x, 2.7, 0.2), (x, 2.7, 2.1), 0.18,
                 "Material_Mechanical", 0.035)
    add_beam(collection, materials, lod, "DockServiceHandrail",
             (47.0, 2.7, 2.1), (56.0, 2.7, 2.1), 0.18,
             "Material_Mechanical", 0.035)


def build_process_logic(collection, materials, lod: int) -> None:
    # Interface markings exist only at operated consoles; process reading comes from massing/pipes.
    if lod == 0:
        add_box(collection, materials, lod, "CrusherControlHousing", (3.8, 1.0, 2.5),
                (-8.5, 1.1, -1.2), "Material_Hull", 0.12)
        add_box(collection, materials, lod, "CrusherControlReadout", (2.8, 0.24, 1.2),
                (-8.5, 0.54, -1.1), "Material_Glass", 0.04)
        add_beam(collection, materials, lod, "CrusherControlBracket",
                 (-8.5, 1.6, -2.3), (-8.5, 3.0, -11.9), 0.34,
                 "Material_Mechanical", 0.045)


def build_lod2_proxy(collection, materials) -> None:
    """Purpose-built low-poly process silhouette; LOD0/1 retain the full authored machinery."""
    lod = 2
    add_box(collection, materials, lod, "ProxyKeel", (88.0, 1.2, 1.2),
            (8.0, 2.0, -18.0), "Material_Hull", 0.0)
    add_box(collection, materials, lod, "ProxyDeck", (72.0, 8.0, 0.8),
            (7.0, 6.2, -12.7), "Material_Hull", 0.0)

    add_cone(collection, materials, lod, "ProxyRawFeed", 3.2, 8.2, 18.0,
             (-30.0, 4.0, 6.0), "Material_Hull", vertices=8, bevel=0.0)
    for index, x in enumerate((-19.5, -12.0)):
        add_cylinder(collection, materials, lod, f"ProxyCrusherRotor_{index}", 3.5, 9.4,
                     (x, 5.8, -3.6), "Material_Mechanical", (math.pi / 2, 0.0, 0.0),
                     vertices=8, bevel=0.0)
        add_box(collection, materials, lod, f"ProxyCrusherCheek_{index}", (5.8, 0.7, 7.6),
                (x, 0.7, -3.8), "Material_Warm", 0.0)

    add_cone(collection, materials, lod, "ProxyCycloneCone", 0.7, 3.8, 12.4,
             (2.0, 13.0, -3.8), "Material_Mechanical", vertices=8, bevel=0.0)
    add_cylinder(collection, materials, lod, "ProxyCycloneBarrel", 3.8, 7.6,
                 (2.0, 13.0, 6.3), "Material_Mechanical", vertices=8, bevel=0.0)
    add_cylinder(collection, materials, lod, "ProxyPressureColumn", 4.5, 31.0,
                 (11.0, 23.0, 7.0), "Material_Mechanical", vertices=8, bevel=0.0)
    add_cone(collection, materials, lod, "ProxyColumnHead", 4.5, 1.4, 5.0,
             (11.0, 23.0, 25.0), "Material_Hull", vertices=8, bevel=0.0)
    add_cone(collection, materials, lod, "ProxyLamellaBoot", 0.8, 4.4, 8.5,
             (20.0, 15.5, -5.8), "Material_Warm", vertices=6, bevel=0.0)
    add_box(collection, materials, lod, "ProxyLamellaCell", (8.6, 6.2, 13.0),
            (20.0, 15.5, 5.0), "Material_Hull", 0.0)

    add_cylinder(collection, materials, lod, "ProxyRotaryKiln", 5.7, 15.0,
                 (29.0, 31.0, 0.5), "Material_Warm", (math.pi / 2, 0.0, 0.0),
                 vertices=8, bevel=0.0)
    add_box(collection, materials, lod, "ProxyHeatBank", (11.0, 14.0, 8.0),
            (29.0, 49.0, 5.0), "Material_Hull", 0.0)
    add_cylinder(collection, materials, lod, "ProxyHeatHeader", 1.2, 11.0,
                 (29.0, 56.0, 7.0), "Material_Mechanical", (0.0, math.pi / 2, 0.0),
                 vertices=8, bevel=0.0)

    add_cylinder(collection, materials, lod, "ProxySlurryBasin", 5.8, 7.0,
                 (38.0, 14.0, -3.5), "Material_Hull", vertices=8, bevel=0.0)
    add_cone(collection, materials, lod, "ProxySlurryBoot", 1.6, 5.8, 5.6,
             (38.0, 14.0, -9.8), "Material_Mechanical", vertices=8, bevel=0.0)
    for index, y in enumerate((26.5, 36.0)):
        add_box(collection, materials, lod, f"ProxyChalkBin_{index}", (7.4, 7.4, 6.8),
                (39.0, y, -4.1), "Material_Accent", 0.0)
        add_cone(collection, materials, lod, f"ProxyChalkHopper_{index}", 1.1, 5.1, 5.2,
                 (39.0, y, -10.2), "Material_Accent", (0.0, 0.0, math.pi / 4),
                 vertices=4, bevel=0.0)

    add_torus(collection, materials, lod, "ProxyDockYoke", 4.6, 0.7,
              (48.0, 0.0, 0.0), "Material_Hull", (0.0, math.pi / 2, 0.0), segments=12)
    add_box(collection, materials, lod, "ProxyDockPod", (9.0, 6.5, 5.5),
            (52.0, 8.5, 5.0), "Material_Hull", 0.0)
    add_box(collection, materials, lod, "ProxyDockWindow", (6.8, 0.3, 1.8),
            (51.8, 5.1, 5.8), "Material_Glass", 0.0)


def build_lod(collection, materials, lod: int) -> None:
    if lod == 2:
        build_lod2_proxy(collection, materials)
        return
    build_load_frame(collection, materials, lod)
    build_raw_feed(collection, materials, lod)
    build_crush_transfer(collection, materials, lod)
    build_separation_stack(collection, materials, lod)
    build_thermal_recovery(collection, materials, lod)
    build_storage(collection, materials, lod)
    build_dock_control(collection, materials, lod)
    build_process_logic(collection, materials, lod)


def apply_object(obj) -> None:
    bpy.ops.object.select_all(action="DESELECT")
    obj.hide_viewport = False
    obj.hide_set(False)
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    for modifier in list(obj.modifiers):
        bpy.ops.object.modifier_apply(modifier=modifier.name)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)


def cube_project_uv(obj) -> None:
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.cube_project(cube_size=4.0, correct_aspect=True, clip_to_bounds=False, scale_to_bounds=False)
    bpy.ops.object.mode_set(mode="OBJECT")


def triangulate(obj) -> int:
    expected = sum(max(0, len(poly.vertices) - 2) for poly in obj.data.polygons)
    mesh = bmesh.new()
    try:
        mesh.from_mesh(obj.data)
        bmesh.ops.triangulate(mesh, faces=list(mesh.faces), quad_method="FIXED", ngon_method="EAR_CLIP")
        mesh.to_mesh(obj.data)
    finally:
        mesh.free()
    obj.data.update()
    if len(obj.data.polygons) != expected or any(len(poly.vertices) != 3 for poly in obj.data.polygons):
        raise RuntimeError(f"triangulation mismatch for {obj.name}")
    return expected


def topology(obj) -> dict:
    welded = {}
    vertex_weld = {}
    for vertex in obj.data.vertices:
        point = obj.matrix_world @ vertex.co
        key = tuple(round(float(value), 6) for value in point)
        vertex_weld[vertex.index] = welded.setdefault(key, len(welded))
    edge_uses = {}
    degenerate = 0
    for polygon in obj.data.polygons:
        indices = [vertex_weld[index] for index in polygon.vertices]
        if len(set(indices)) != 3:
            degenerate += 1
        for left, right in ((indices[0], indices[1]), (indices[1], indices[2]), (indices[2], indices[0])):
            edge = tuple(sorted((left, right)))
            edge_uses[edge] = edge_uses.get(edge, 0) + 1
    nonmanifold = sum(count != 2 for count in edge_uses.values())
    return {
        "vertices": len(obj.data.vertices),
        "weldedVertices": len(welded),
        "triangles": len(obj.data.polygons),
        "degenerateTriangles": degenerate,
        "nonManifoldEdges": nonmanifold,
    }


def join_draw_groups(collection, materials, lod: int, root) -> tuple[list[object], dict]:
    source = [obj for obj in collection.objects if obj.type == "MESH" and obj.name.startswith(f"LOD{lod}_")]
    for obj in source:
        apply_object(obj)
    groups = []
    group_report = {}
    for material_name in MATERIAL_NAMES:
        # Joining one material destroys its component objects.  Re-read the live collection for
        # each subsequent group instead of retaining invalid StructRNA references in ``source``.
        members = [
            obj
            for obj in list(collection.objects)
            if obj.type == "MESH"
            and obj.name.startswith(f"LOD{lod}_")
            and obj.data.materials
            and obj.data.materials[0].name == material_name
        ]
        if not members:
            raise RuntimeError(f"LOD{lod} has no geometry for {material_name}")
        bpy.ops.object.select_all(action="DESELECT")
        for obj in members:
            obj.select_set(True)
        bpy.context.view_layer.objects.active = members[0]
        bpy.ops.object.join()
        obj = bpy.context.object
        obj.name = f"LOD{lod}_Station_{material_name}"
        obj.data.name = f"LOD{lod}_Station_{material_name}_Mesh"
        obj.data.materials.clear()
        obj.data.materials.append(materials[material_name])
        for polygon in obj.data.polygons:
            polygon.material_index = 0
        tag(obj, lod, material_name, "merged_process_draw_group")
        cube_project_uv(obj)
        triangulate(obj)
        obj.parent = root
        obj.hide_render = lod != 0
        obj.hide_viewport = lod != 0
        obj.hide_set(False)
        audit = topology(obj)
        if audit["degenerateTriangles"] or audit["nonManifoldEdges"]:
            raise RuntimeError(f"closed topology failed for {obj.name}: {audit}")
        group_report[obj.name] = audit
        groups.append(obj)
    return groups, group_report


def read_glb(path: Path) -> tuple[dict, bytes, list[tuple[int, bytes]]]:
    payload = path.read_bytes()
    if payload[:4] != b"glTF" or struct.unpack_from("<I", payload, 4)[0] != 2:
        raise RuntimeError(f"not GLB2: {path}")
    chunks = []
    document = None
    binary = None
    offset = 12
    while offset < len(payload):
        length, kind = struct.unpack_from("<II", payload, offset)
        data = payload[offset + 8:offset + 8 + length]
        chunks.append((kind, data))
        if kind == 0x4E4F534A:
            document = json.loads(data.decode("utf-8").rstrip("\x00 "))
        elif kind == 0x004E4942:
            binary = data
        offset += 8 + length
    if document is None or binary is None:
        raise RuntimeError(f"missing JSON/BIN chunk: {path}")
    return document, binary, chunks


def accessor_values(document: dict, binary: bytes, accessor_index: int):
    accessor = document["accessors"][accessor_index]
    view = document["bufferViews"][accessor["bufferView"]]
    component = {
        5120: ("b", 1), 5121: ("B", 1), 5122: ("h", 2),
        5123: ("H", 2), 5125: ("I", 4), 5126: ("f", 4),
    }[accessor["componentType"]]
    width = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4}[accessor["type"]]
    stride = view.get("byteStride", component[1] * width)
    start = view.get("byteOffset", 0) + accessor.get("byteOffset", 0)
    unpack = "<" + component[0] * width
    values = []
    for index in range(accessor["count"]):
        value = struct.unpack_from(unpack, binary, start + index * stride)
        values.append(value[0] if width == 1 else value)
    return values


def frozen_collision_geometry() -> tuple[list[tuple[float, float, float]], list[tuple[int, int, int]]]:
    document, binary, _ = read_glb(LIVE_GLB)
    node = next((item for item in document["nodes"] if item.get("name") == "COLLISION_HULL"), None)
    if node is None or node.get("mesh") is None:
        raise RuntimeError("live refinery collision node is missing")
    if any(key in node for key in ("translation", "rotation", "scale", "matrix")):
        raise RuntimeError("live refinery collision unexpectedly has a local transform")
    primitives = document["meshes"][node["mesh"]]["primitives"]
    if len(primitives) != 1:
        raise RuntimeError("live refinery collision must remain one primitive")
    primitive = primitives[0]
    positions_gltf = accessor_values(document, binary, primitive["attributes"]["POSITION"])
    indices = accessor_values(document, binary, primitive["indices"])
    if len(indices) // 3 != COLLISION_TRIANGLES:
        raise RuntimeError("live refinery collision triangle count drifted")
    # Exact axis inverse: glTF (X,Y-up,Z-starboard) -> Blender (X,-Z-starboard,Y-up).
    positions_blender = [(x, -z, y) for x, y, z in positions_gltf]
    faces = [tuple(indices[index:index + 3]) for index in range(0, len(indices), 3)]
    return positions_blender, faces


def create_collision(collection, materials, root):
    vertices, faces = frozen_collision_geometry()
    mesh = bpy.data.meshes.new("COLLISION_HULL_Mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new("COLLISION_HULL", mesh)
    collection.objects.link(obj)
    obj.data.materials.append(materials["Material_Mechanical"])
    obj.parent = root
    obj.display_type = "WIRE"
    obj["spaceface.collision"] = "broadphase_only"
    obj["spaceface.lodLevel"] = 2
    obj["spaceface.chamfered"] = True
    obj["spaceface.materialRole"] = "Material_Mechanical"
    obj["spaceface.structureRole"] = "COLLISION_HULL"
    cube_project_uv(obj)
    obj.hide_render = True
    obj.hide_viewport = True
    if len(obj.data.polygons) != COLLISION_TRIANGLES:
        raise RuntimeError("reconstructed collision triangle count drifted")
    return obj


def bounds(objects) -> tuple[Vector, Vector, Vector]:
    minimum = Vector((1e9, 1e9, 1e9))
    maximum = Vector((-1e9, -1e9, -1e9))
    for obj in objects:
        for corner in obj.bound_box:
            point = obj.matrix_world @ Vector(corner)
            for axis in range(3):
                minimum[axis] = min(minimum[axis], point[axis])
                maximum[axis] = max(maximum[axis], point[axis])
    return minimum, maximum, maximum - minimum


def assert_vector(actual, expected, label: str, epsilon=1e-4) -> None:
    if len(actual) != len(expected) or any(abs(float(a) - float(e)) > epsilon for a, e in zip(actual, expected)):
        raise RuntimeError(f"{label}: expected {expected}, got {actual}")


def make_socket(collection, root, name: str, location):
    socket = bpy.data.objects.new(name, None)
    socket.empty_display_type = "PLAIN_AXES"
    socket.empty_display_size = 1.5
    socket.location = location
    socket.parent = root
    socket["spaceface.socketRole"] = name.removeprefix("SOCKET_").lower()
    collection.objects.link(socket)
    return socket


def look_at(obj, target) -> None:
    obj.rotation_euler = (Vector(target) - obj.location).to_track_quat("-Z", "Y").to_euler()


def configure_render_scene(scene) -> None:
    # Blender 5.1 identifies Eevee Next with the stable public enum ``BLENDER_EEVEE``.
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 1600
    scene.render.resolution_y = 900
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.film_transparent = False
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.image_settings.color_depth = "8"
    scene.render.resolution_percentage = 100
    try:
        scene.view_settings.look = "AgX - Medium High Contrast"
    except Exception:
        try:
            scene.view_settings.look = "AgX - Medium High Contrast"
        except Exception:
            pass
    scene.view_settings.exposure = 1.85
    scene.view_settings.gamma = 1.0
    world = scene.world or bpy.data.worlds.new("RefineryReviewWorld")
    scene.world = world
    world.use_nodes = True
    background = world.node_tree.nodes.get("Background")
    background.inputs["Color"].default_value = (0.0025, 0.006, 0.012, 1.0)
    background.inputs["Strength"].default_value = 0.18


def add_preview_rig(scene, collection, target=(10.0, 23.0, 2.75)):
    configure_render_scene(scene)
    camera_data = bpy.data.cameras.new("PREVIEW_Camera_Data")
    camera = bpy.data.objects.new("PREVIEW_Camera", camera_data)
    collection.objects.link(camera)
    camera.location = Vector(target) + Vector((1.35, -1.25, 0.72)).normalized() * 225.0
    camera_data.lens = 55.0
    camera_data.clip_start = 0.1
    camera_data.clip_end = 2000.0
    look_at(camera, target)
    scene.camera = camera

    lights = (
        ("PREVIEW_Key", "AREA", (-45.0, -45.0, 75.0), (1.0, 0.97, 0.92), 7200.0, 42.0),
        ("PREVIEW_Fill", "AREA", (70.0, 10.0, 55.0), (0.76, 0.86, 1.0), 5600.0, 34.0),
        ("PREVIEW_Rim", "AREA", (10.0, 90.0, 20.0), (0.48, 0.70, 1.0), 6800.0, 38.0),
    )
    for name, kind, location, color, energy, size in lights:
        data = bpy.data.lights.new(f"{name}_Data", type=kind)
        data.energy = energy
        data.color = color
        data.shape = "DISK"
        data.size = size
        light = bpy.data.objects.new(name, data)
        collection.objects.link(light)
        light.location = location
        look_at(light, target)
    sun_data = bpy.data.lights.new("PREVIEW_Sun_Data", type="SUN")
    sun_data.energy = 1.2
    sun_data.color = (0.58, 0.72, 1.0)
    sun = bpy.data.objects.new("PREVIEW_Sun", sun_data)
    collection.objects.link(sun)
    sun.rotation_euler = (math.radians(32), math.radians(-18), math.radians(-42))
    return camera


def rewrite_glb_metadata(path: Path, stamp: dict) -> None:
    document, _binary, chunks = read_glb(path)
    document.setdefault("asset", {}).setdefault("extras", {})["assetId"] = ASSET_ID
    document["asset"]["extras"]["partId"] = PART_ID
    document["asset"]["extras"]["spacefaceAsset"] = stamp
    scene = document["scenes"][document.get("scene", 0)]
    scene_extras = scene.setdefault("extras", {})
    scene_extras.update({"assetId": ASSET_ID, "partId": PART_ID, "spacefaceAsset": stamp})
    canonical_root = next((node for node in document.get("nodes", []) if node.get("name") == ROOT_NAME), None)
    if canonical_root is None:
        raise RuntimeError(f"canonical root node missing during metadata rewrite: {ROOT_NAME}")
    canonical_root.setdefault("extras", {})["spacefaceAsset"] = stamp

    json_payload = json.dumps(document, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
    json_payload += b" " * ((4 - len(json_payload) % 4) % 4)
    rebuilt_chunks = [(0x4E4F534A, json_payload)] + [item for item in chunks if item[0] != 0x4E4F534A]
    body = bytearray()
    for kind, data in rebuilt_chunks:
        body.extend(struct.pack("<II", len(data), kind))
        body.extend(data)
    path.write_bytes(b"glTF" + struct.pack("<II", 2, 12 + len(body)) + bytes(body))


def primitive_triangles(document: dict, primitive: dict) -> int:
    if primitive.get("mode", 4) != 4:
        return 0
    accessor = document["accessors"][primitive.get("indices", primitive["attributes"]["POSITION"])]
    return accessor["count"] // 3


def js_number(value: float) -> str:
    """Format a six-decimal stable number like JavaScript Array.join()."""
    stable = float(f"{float(value):.6f}")
    if stable == 0.0:
        return "0"
    if stable.is_integer():
        return str(int(stable))
    return f"{stable:.6f}".rstrip("0").rstrip(".")


def primitive_geometry_sha256(document: dict, binary: bytes, primitive: dict) -> str:
    positions = accessor_values(document, binary, primitive["attributes"]["POSITION"])
    if primitive.get("indices") is None:
        indices = list(range(len(positions)))
    else:
        indices = accessor_values(document, binary, primitive["indices"])
    triangles = []
    for offset in range(0, len(indices), 3):
        vertices = []
        for index in indices[offset:offset + 3]:
            vertices.append(",".join(js_number(value) for value in positions[index]))
        triangles.append("|".join(sorted(vertices)))
    triangles.sort()
    payload = json.dumps(triangles, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
    return hashlib.sha256(payload).hexdigest()


def visible_geometry_sha256(document: dict, binary: bytes) -> str:
    records = []
    for node in document.get("nodes", []):
        name = node.get("name", "")
        if not name.startswith(("LOD0_Station_", "LOD1_Station_", "LOD2_Station_")):
            continue
        level, material = name.split("_Station_", 1)
        for primitive in document["meshes"][node["mesh"]]["primitives"]:
            records.append({
                "level": level,
                "material": document["materials"][primitive["material"]]["name"],
                "geometrySha256": primitive_geometry_sha256(document, binary, primitive),
            })
    records.sort(key=lambda record: f"{record['level']}:{record['material']}")
    payload = json.dumps(records, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
    return hashlib.sha256(payload).hexdigest()


def inspect_export(path: Path) -> dict:
    document, binary, _chunks = read_glb(path)
    nodes = {node.get("name"): node for node in document.get("nodes", [])}
    expected_names = {ROOT_NAME, "COLLISION_HULL", *SOCKETS_GLTF.keys()}
    for lod in range(3):
        expected_names.update(f"LOD{lod}_Station_{name}" for name in MATERIAL_NAMES)
    if set(nodes) != expected_names or len(nodes) != len(expected_names):
        raise RuntimeError(f"unexpected exported node set: {sorted(set(nodes) ^ expected_names)}")
    scene_roots = [document["nodes"][index].get("name") for index in document["scenes"][document.get("scene", 0)]["nodes"]]
    if scene_roots != [ROOT_NAME]:
        raise RuntimeError(f"sole root contract failed: {scene_roots}")
    root_node = nodes[ROOT_NAME]
    assert_vector(root_node.get("translation", (0, 0, 0)), (0, 0, 0), "root translation")
    assert_vector(root_node.get("rotation", (0, 0, 0, 1)), (0, 0, 0, 1), "root rotation")
    assert_vector(root_node.get("scale", (1, 1, 1)), (1, 1, 1), "root scale")
    for name, expected in SOCKETS_GLTF.items():
        assert_vector(nodes[name].get("translation", (0, 0, 0)), expected, f"{name} glTF translation")
        assert_vector(nodes[name].get("rotation", (0, 0, 0, 1)), (0, 0, 0, 1), f"{name} rotation")
        assert_vector(nodes[name].get("scale", (1, 1, 1)), (1, 1, 1), f"{name} scale")

    material_names = sorted(material.get("name") for material in document.get("materials", []))
    if material_names != sorted(MATERIAL_NAMES):
        raise RuntimeError(f"exact five-material contract failed: {material_names}")
    if len(document.get("images", [])) != 15 or len(document.get("textures", [])) != 15:
        raise RuntimeError(
            f"exact PBR source set failed: {len(document.get('images', []))} images / "
            f"{len(document.get('textures', []))} textures"
        )
    material_by_index = {index: item["name"] for index, item in enumerate(document["materials"])}
    lod_triangles = {}
    for lod in range(3):
        total = 0
        used = []
        for material_name in MATERIAL_NAMES:
            node = nodes[f"LOD{lod}_Station_{material_name}"]
            primitives = document["meshes"][node["mesh"]]["primitives"]
            if len(primitives) != 1:
                raise RuntimeError(f"LOD{lod}/{material_name} is not one primitive")
            primitive = primitives[0]
            if material_by_index[primitive["material"]] != material_name:
                raise RuntimeError(f"LOD{lod}/{material_name} material drift")
            required = primitive["attributes"]
            if not all(name in required for name in ("POSITION", "NORMAL", "TEXCOORD_0", "TANGENT")):
                raise RuntimeError(f"LOD{lod}/{material_name} missing visible vertex attributes")
            total += primitive_triangles(document, primitive)
            used.append(material_by_index[primitive["material"]])
        if sorted(used) != sorted(MATERIAL_NAMES):
            raise RuntimeError(f"LOD{lod} material coverage drift")
        if total > LOD_CEILINGS[lod]:
            raise RuntimeError(f"LOD{lod} triangle ceiling exceeded: {total} > {LOD_CEILINGS[lod]}")
        lod_triangles[f"lod{lod}"] = total
    if not (lod_triangles["lod0"] > lod_triangles["lod1"] > lod_triangles["lod2"]):
        raise RuntimeError(f"LOD reduction is not strict: {lod_triangles}")

    collision_primitives = document["meshes"][nodes["COLLISION_HULL"]["mesh"]]["primitives"]
    collision_count = sum(primitive_triangles(document, primitive) for primitive in collision_primitives)
    if len(collision_primitives) != 1 or collision_count != COLLISION_TRIANGLES:
        raise RuntimeError("collision primitive/triangle contract drifted")

    minimum = [1e9, 1e9, 1e9]
    maximum = [-1e9, -1e9, -1e9]
    for material_name in MATERIAL_NAMES:
        node = nodes[f"LOD0_Station_{material_name}"]
        transform_keys = set(node) & {"translation", "rotation", "scale", "matrix"}
        if transform_keys:
            # Identity translations can be emitted; explicitly verify if present.
            assert_vector(node.get("translation", (0, 0, 0)), (0, 0, 0), f"{node['name']} translation")
            assert_vector(node.get("rotation", (0, 0, 0, 1)), (0, 0, 0, 1), f"{node['name']} rotation")
            assert_vector(node.get("scale", (1, 1, 1)), (1, 1, 1), f"{node['name']} scale")
            if "matrix" in node:
                assert_vector(node["matrix"], (1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1), f"{node['name']} matrix")
        primitive = document["meshes"][node["mesh"]]["primitives"][0]
        accessor = document["accessors"][primitive["attributes"]["POSITION"]]
        for axis in range(3):
            minimum[axis] = min(minimum[axis], accessor["min"][axis])
            maximum[axis] = max(maximum[axis], accessor["max"][axis])
    size = [maximum[axis] - minimum[axis] for axis in range(3)]
    assert_vector(minimum, GLTF_ENVELOPE_MIN, "LOD0 glTF minimum", 1e-3)
    assert_vector(maximum, GLTF_ENVELOPE_MAX, "LOD0 glTF maximum", 1e-3)
    assert_vector(size, GLTF_ENVELOPE_SIZE, "LOD0 glTF size", 1e-3)
    if max(size) > 144.0:
        raise RuntimeError(f"runtime envelope exceeds 144 units: {size}")
    if path.stat().st_size > BYTE_CEILING:
        raise RuntimeError(f"candidate byte ceiling exceeded: {path.stat().st_size} > {BYTE_CEILING}")
    return {
        "nodeCount": len(document["nodes"]),
        "meshCount": len(document["meshes"]),
        "materialCount": len(document["materials"]),
        "imageCount": len(document["images"]),
        "textureCount": len(document["textures"]),
        "visibleGroupCount": 15,
        "visibleGeometrySha256": visible_geometry_sha256(document, binary),
        "textureRoleBindings": 15,
        "lodTriangles": lod_triangles,
        "collisionTriangles": collision_count,
        "gltfEnvelope": {
            "min": [round(value, 4) for value in minimum],
            "max": [round(value, 4) for value in maximum],
            "size": [round(value, 4) for value in size],
        },
    }


def render_exact_source(candidate_hash: str) -> dict:
    reset_scene()
    bpy.ops.import_scene.gltf(filepath=str(SOURCE_GLB))
    scene = bpy.context.scene
    review_collection = ensure_collection("PQ022_EXACT_SOURCE_REVIEW_RIG")
    configure_render_scene(scene)
    visible = []
    for obj in bpy.data.objects:
        if obj.type != "MESH":
            continue
        is_lod0 = obj.name.startswith("LOD0_")
        obj.hide_render = not is_lod0
        obj.hide_viewport = not is_lod0
        if is_lod0:
            visible.append(obj)
    minimum, maximum, dimensions = bounds(visible)
    target = (minimum + maximum) * 0.5
    camera_data = bpy.data.cameras.new("PQ022_ReviewCamera_Data")
    camera_data.lens = 55.0
    camera_data.clip_start = 0.1
    camera_data.clip_end = 2000.0
    camera = bpy.data.objects.new("PQ022_ReviewCamera", camera_data)
    review_collection.objects.link(camera)
    scene.camera = camera

    light_specs = (
        ("PQ022_Key", (-45.0, -45.0, 78.0), (1.0, 0.97, 0.92), 16200.0, 44.0),
        ("PQ022_Fill", (80.0, 15.0, 58.0), (0.86, 0.90, 1.0), 14500.0, 40.0),
        ("PQ022_Rim", (5.0, 100.0, 28.0), (0.72, 0.80, 1.0), 15800.0, 44.0),
        ("PQ022_Under", (10.0, 10.0, -55.0), (0.85, 0.87, 0.92), 9800.0, 38.0),
    )
    for name, location, color, energy, size in light_specs:
        data = bpy.data.lights.new(f"{name}_Data", type="AREA")
        data.energy = energy
        data.color = color
        data.shape = "DISK"
        data.size = size
        obj = bpy.data.objects.new(name, data)
        review_collection.objects.link(obj)
        obj.location = location
        look_at(obj, target)
    sun_data = bpy.data.lights.new("PQ022_Sun_Data", type="SUN")
    sun_data.energy = 1.1
    sun_data.color = (0.54, 0.68, 1.0)
    sun = bpy.data.objects.new("PQ022_Sun", sun_data)
    review_collection.objects.link(sun)
    sun.rotation_euler = (math.radians(34), math.radians(-14), math.radians(-38))

    views = (
        ("process_three_quarter", (1.35, -1.25, 0.72), 225.0),
        ("feed_three_quarter", (-1.42, -1.15, 0.70), 225.0),
        ("side_process", (0.05, -1.82, 0.34), 236.0),
        ("top_flow", (0.0, -0.24, 2.20), 244.0),
    )
    images = []
    camera_records = []
    for name, direction, distance in views:
        camera.location = target + Vector(direction).normalized() * distance
        look_at(camera, target)
        output = RENDER_ROOT / f"{name}.png"
        scene.render.filepath = str(output)
        bpy.ops.render.render(write_still=True)
        images.append(output)
        camera_records.append({
            "name": name,
            "position": [round(float(value), 4) for value in camera.location],
            "target": [round(float(value), 4) for value in target],
            "lensMm": camera_data.lens,
            "distance": distance,
        })

    # Exact same source/camera/lighting with only the candidate emissive strength removed.
    emission_strengths = []
    for material in bpy.data.materials:
        if not material.use_nodes:
            continue
        shader = material.node_tree.nodes.get("Principled BSDF")
        if shader is None or "Emission Strength" not in shader.inputs:
            continue
        emission_strengths.append((shader, shader.inputs["Emission Strength"].default_value))
        shader.inputs["Emission Strength"].default_value = 0.0
    process = camera_records[0]
    camera.location = process["position"]
    look_at(camera, process["target"])
    emissive_off = RENDER_ROOT / "process_three_quarter_emissive_off.png"
    scene.render.filepath = str(emissive_off)
    bpy.ops.render.render(write_still=True)
    images.append(emissive_off)
    for shader, strength in emission_strengths:
        shader.inputs["Emission Strength"].default_value = strength

    manifest = {
        "schema": "spaceface.refineryExactSourceRenderManifest.v1",
        "assetId": PART_ID,
        "candidateId": CANDIDATE_ID,
        "source": rel(SOURCE_GLB),
        "sourceSha256": candidate_hash,
        "exactSourceReimport": True,
        "renderer": "BLENDER_EEVEE",
        "blenderVersion": bpy.app.version_string,
        "resolution": [1600, 900],
        "viewTransform": scene.view_settings.view_transform,
        "look": scene.view_settings.look,
        "exposure": scene.view_settings.exposure,
        "lighting": [item[0] for item in light_specs] + ["PQ022_Sun"],
        "cameras": camera_records,
        "emissiveOff": {
            "path": rel(emissive_off),
            "camera": "process_three_quarter",
            "onlyEmissionStrengthChanged": True,
        },
        "images": [
            {"path": rel(path), "sha256": sha256(path), "bytes": path.stat().st_size}
            for path in images
        ],
        "lod0ImportedBoundsBlender": {
            "min": [round(float(value), 4) for value in minimum],
            "max": [round(float(value), 4) for value in maximum],
            "size": [round(float(value), 4) for value in dimensions],
        },
    }
    json_dump(RENDER_MANIFEST, manifest)
    return manifest


def build() -> dict:
    started = time.time()
    for path in (BLEND_PATH, SOURCE_GLB, RELEASE_GLB, REPORT_ROOT, TEXTURE_ROOT, RENDER_ROOT):
        path.mkdir(parents=True, exist_ok=True) if path.suffix == "" else path.parent.mkdir(parents=True, exist_ok=True)
    texture_files = create_texture_files()
    reset_scene()
    scene = bpy.context.scene
    scene.unit_settings.system = "METRIC"
    scene.unit_settings.scale_length = 1.0
    scene["spaceface.authoringAxes"] = "Blender X process / Y starboard / Z up"
    scene["spaceface.exportAxes"] = "glTF X process / Y up / Z starboard"
    collection = ensure_collection(COLLECTION_NAME)
    preview_collection = ensure_collection("PQ022_REFINERY_PREVIEW_RIG")
    materials = create_materials(texture_files)

    root = bpy.data.objects.new(ROOT_NAME, None)
    root.empty_display_type = "CUBE"
    root.empty_display_size = 4.0
    collection.objects.link(root)
    root["spaceface.assetId"] = ASSET_ID
    root["spaceface.partId"] = PART_ID
    root["spaceface.role"] = "industrial_refinery"
    root["spaceface.candidateId"] = CANDIDATE_ID
    root["spaceface.wiringStatus"] = "isolated_candidate"
    root["spaceface.builder"] = rel(Path(__file__).resolve())

    for lod in range(3):
        build_lod(collection, materials, lod)

    draw_groups = []
    topology_report = {}
    lod_report = {}
    for lod in range(3):
        groups, group_topology = join_draw_groups(collection, materials, lod, root)
        draw_groups.extend(groups)
        topology_report.update(group_topology)
        lod_report[f"lod{lod}"] = {
            "triangles": sum(len(obj.data.polygons) for obj in groups),
            "drawGroups": len(groups),
            "materials": sorted(obj.data.materials[0].name for obj in groups),
        }
        if lod_report[f"lod{lod}"]["triangles"] > LOD_CEILINGS[lod]:
            raise RuntimeError(f"Blender LOD{lod} ceiling exceeded: {lod_report[f'lod{lod}']}")
    if not (lod_report["lod0"]["triangles"] > lod_report["lod1"]["triangles"] > lod_report["lod2"]["triangles"]):
        raise RuntimeError(f"Blender LOD reduction is not strict: {lod_report}")

    collision = create_collision(collection, materials, root)
    sockets = [make_socket(collection, root, name, location) for name, location in SOCKETS_BLENDER.items()]
    bpy.context.view_layer.update()
    lod0 = [obj for obj in draw_groups if obj.name.startswith("LOD0_")]
    minimum, maximum, dimensions = bounds(lod0)
    assert_vector(minimum, BLENDER_ENVELOPE_MIN, "LOD0 Blender minimum", 1e-3)
    assert_vector(maximum, BLENDER_ENVELOPE_MAX, "LOD0 Blender maximum", 1e-3)
    assert_vector(dimensions, BLENDER_ENVELOPE_SIZE, "LOD0 Blender size", 1e-3)

    stamp = {
        "contractVersion": 1,
        "assetId": ASSET_ID,
        "partId": PART_ID,
        "liveId": PART_ID,
        "slot": "place",
        "forward": "+X",
        "up": "+Y",
        "starboard": "+Z",
        "unit": "metre",
        "normalConvention": "OpenGL",
        "ormChannels": "R=AO,G=Roughness,B=Metallic",
        "textureCompression": "PNG-source",
        "textureSize": 512,
        "chamfered": True,
        "bevelRadiusM": 0.05,
        "family": "helios_industrial_station_family",
        "packet": PACKET,
        "dispatchUnit": DISPATCH_UNIT,
        "state": "candidate_only",
        "claims": CLAIMS,
        "role": "industrial_refinery",
        "title": "Helios Fractionation Refinery V2",
        "kind": "station_landmark",
        "deliverableRole": "production_multi_lod",
        "lods": ["lod0", "lod1", "lod2"],
        "triangleCount": lod_report["lod0"]["triangles"],
        "lodTriangles": {key: value["triangles"] for key, value in lod_report.items()},
        "drawGroupsPerLod": {key: value["drawGroups"] for key, value in lod_report.items()},
        "lod0AabbSize": list(BLENDER_ENVELOPE_SIZE),
        "wiringStatus": "isolated_candidate",
        "wiring": WIRING,
        "candidateId": CANDIDATE_ID,
        "revisionPass": "whole_asset_material_coherence_final",
        "sourceGenerator": SOURCE_GENERATOR,
        "sourceGeneratorSha256": sha256(Path(__file__).resolve()),
        "sourceGeneratorBytes": Path(__file__).resolve().stat().st_size,
        "sourceBlenderVersion": bpy.app.version_string,
        "authoringAxes": "X process / Y starboard / Z up",
        "processChain": list(VALIDATION_CHAIN),
        "processFlow": list(PROCESS_FLOW),
    }
    metadata_text = json.dumps(stamp, separators=(",", ":"))
    root["spacefaceAssetJson"] = metadata_text
    scene["spacefaceAssetJson"] = metadata_text
    add_preview_rig(scene, preview_collection)

    # Save the fully surfaced authoring scene with only LOD0 visible by default.
    for obj in draw_groups:
        lod = int(obj.name[3])
        obj.hide_viewport = lod != 0
        obj.hide_render = lod != 0
    collision.hide_viewport = True
    collision.hide_render = True
    bpy.ops.wm.save_as_mainfile(filepath=str(BLEND_PATH))

    export_objects = [root, collision, *sockets, *draw_groups]
    export_spec = {
        "kind": "landmark",
        "id": PART_ID,
        "assetId": ASSET_ID,
        "slot": "place",
        "tri_budget": None,
        "min_hull_tris": 0,
        "required_maps": ["ao", "roughness"],
        "textureCompression": "PNG-source",
    }
    diagnostics = spaceface_export.export_gltf(str(STAGING_GLB), export_spec, export_objects)
    rewrite_glb_metadata(STAGING_GLB, stamp)
    export_audit = inspect_export(STAGING_GLB)
    candidate_payload = STAGING_GLB.read_bytes()
    write_bytes_in_place(SOURCE_GLB, candidate_payload)
    write_bytes_in_place(RELEASE_GLB, candidate_payload)
    STAGING_GLB.unlink(missing_ok=True)
    if sha256(SOURCE_GLB) != sha256(RELEASE_GLB):
        raise RuntimeError("release candidate mirror is not byte-identical")

    candidate_hash = sha256(SOURCE_GLB)
    render_manifest = render_exact_source(candidate_hash)

    texture_report = []
    for material_name in MATERIAL_BUILD_ORDER:
        role = MATERIAL_ROLES[material_name]
        for kind, path in texture_files[material_name].items():
            texture_report.append({
                "material": material_name,
                "role": role,
                "map": kind,
                "path": rel(path),
                "resolution": [512, 512],
                "sha256": sha256(path),
                "bytes": path.stat().st_size,
            })

    report = {
        "schema": "spaceface.pq022RefineryBuildReport.v1",
        "packet": PACKET,
        "dispatchUnit": DISPATCH_UNIT,
        "assetId": PART_ID,
        "spacefaceAssetId": ASSET_ID,
        "candidateId": CANDIDATE_ID,
        "unit": "metre",
        "builtAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "elapsedSeconds": round(time.time() - started, 2),
        "builder": rel(Path(__file__).resolve()),
        "buildAttempts": 8,
        "namedDefectBuildAttempts": 1,
        "materialCoherenceBuildAttempts": 1,
        "revisionPass": "whole_asset_material_coherence_final",
        "predecessorCandidateSha256": "d49f11279a7f59658919fb2d821f45309f3542e6f1ec647ebaa3161943d4803c",
        "correctiveBuildUsed": True,
        "preRenderCorrections": [
            "Reduced only LOD1 bevel and torus tessellation after a 39,736-triangle ceiling failure.",
            "Replaced only LOD2 with a dedicated silhouette proxy after a 7,320-triangle ceiling failure.",
            "Separated one exact LOD2 coplanar shell seam after an eight-edge topology failure.",
            "Replaced Windows CopyFile2 mirroring with a deterministic byte write after WinError 1224 on the mapped existing mirror.",
            "Exported through an owned staging GLB and updated final paths in place after Blender retained the prior source path handle.",
        ],
        "actualDefectCorrected": (
            "The named-form correction closed G1, G2, and emissive dependence, but its cell-divided "
            "procedural noise survived UV projection as a conspicuous quilt across unrelated coated, "
            "hot, and service surfaces. This final material-coherence correction changes no geometry: "
            "it replaces block noise with substrate-specific continuous responses and recovers dark "
            "coated edge separation under neutral grazing light."
        ),
        "correctiveChanges": [
            "Removed all cell-divided X/Y texture noise and replaced it with broad continuous coated-plate variation plus one-direction manufactured seams.",
            "Separated fine directional alloy abrasion, subtle axial thermal response, matte ceramic micrograin, and optically flat glass into distinct scale-correct recipes.",
            "Raised the coated-structure base value and strengthened neutral fill, rim, and under-light response while preserving a black-space background and unchanged emission strength.",
        ],
        "processFlow": list(PROCESS_FLOW),
        "state": "candidate_only",
        "claims": CLAIMS,
        "baseline": {
            "source": {"path": rel(LIVE_GLB), "sha256": sha256(LIVE_GLB), "bytes": LIVE_GLB.stat().st_size},
            "release": {"path": rel(LIVE_RELEASE), "sha256": sha256(LIVE_RELEASE), "bytes": LIVE_RELEASE.stat().st_size},
            "blender": {"path": rel(LIVE_BLEND), "sha256": sha256(LIVE_BLEND), "bytes": LIVE_BLEND.stat().st_size},
        },
        "candidate": {"path": rel(SOURCE_GLB), "sha256": candidate_hash, "bytes": SOURCE_GLB.stat().st_size},
        "releaseMirror": {"path": rel(RELEASE_GLB), "sha256": sha256(RELEASE_GLB), "bytes": RELEASE_GLB.stat().st_size},
        "blender": {"path": rel(BLEND_PATH), "sha256": sha256(BLEND_PATH), "bytes": BLEND_PATH.stat().st_size},
        "generator": {
            "path": SOURCE_GENERATOR,
            "sha256": sha256(Path(__file__).resolve()),
            "bytes": Path(__file__).resolve().stat().st_size,
        },
        "producer": {
            "sourceGenerator": {
                "path": SOURCE_GENERATOR,
                "sha256": sha256(Path(__file__).resolve()),
                "bytes": Path(__file__).resolve().stat().st_size,
            },
            "processChain": list(VALIDATION_CHAIN),
        },
        "axes": {
            "authoring": "Blender X process / Y starboard / Z up",
            "runtime": "glTF X process / Y up / Z starboard",
            "conversion": "(blenderX, blenderY, blenderZ) -> (gltfX, gltfY, gltfZ) = (X, Z, -Y)",
            "verifiedSockets": {name: list(value) for name, value in SOCKETS_GLTF.items()},
        },
        "bounds": {
            "blender": {
                "min": [round(float(value), 4) for value in minimum],
                "max": [round(float(value), 4) for value in maximum],
                "size": [round(float(value), 4) for value in dimensions],
            },
            "gltf": export_audit["gltfEnvelope"],
            "maximumRuntimeDimension": max(export_audit["gltfEnvelope"]["size"]),
            "ceiling": 144,
        },
        "lod": lod_report,
        "topology": topology_report,
        "materials": list(MATERIAL_NAMES),
        "textures": texture_report,
        "frozenContract": {
            "rootNode": ROOT_NAME,
            "sockets": {
                name: {
                    "translation": list(value),
                    "rotation": [0, 0, 0, 1],
                    "scale": [1, 1, 1],
                }
                for name, value in SOCKETS_GLTF.items()
            },
            "materials": list(MATERIAL_NAMES),
            "envelope": {
                "min": list(GLTF_ENVELOPE_MIN),
                "max": list(GLTF_ENVELOPE_MAX),
                "size": list(GLTF_ENVELOPE_SIZE),
            },
            "collision": {
                "node": "COLLISION_HULL",
                "triangles": COLLISION_TRIANGLES,
                "geometrySha256": COLLISION_GEOMETRY_SHA256,
            },
            "lodTriangles": {
                "LOD0": export_audit["lodTriangles"]["lod0"],
                "LOD1": export_audit["lodTriangles"]["lod1"],
                "LOD2": export_audit["lodTriangles"]["lod2"],
            },
            "visibleGroups": export_audit["visibleGroupCount"],
            "visibleGeometrySha256": export_audit["visibleGeometrySha256"],
            "textureRoleBindings": export_audit["textureRoleBindings"],
            "embeddedPngImages": export_audit["imageCount"],
        },
        "export": {
            **export_audit,
            "diagnostics": diagnostics,
            "sourceByteCeiling": BYTE_CEILING,
            "sourceWithinCeiling": SOURCE_GLB.stat().st_size <= BYTE_CEILING,
            "releaseMirrorByteIdentical": True,
        },
        "renders": {
            "manifest": rel(RENDER_MANIFEST),
            "manifestSha256": sha256(RENDER_MANIFEST),
            "exactSourceReimport": True,
            "images": render_manifest["images"],
        },
        "canonicalAssetsModified": False,
    }
    json_dump(BUILD_REPORT, report)

    # Leave the connected Blender application on the authored, surfaced candidate rather than the
    # temporary exact-source review scene.
    bpy.ops.wm.open_mainfile(filepath=str(BLEND_PATH))
    return report


BUILD_RESULT = None
if __name__ == "__main__":
    BUILD_RESULT = build()
    print(json.dumps({
        "ok": True,
        "candidate": BUILD_RESULT["candidate"],
        "lod": BUILD_RESULT["lod"],
        "bounds": BUILD_RESULT["bounds"],
        "renders": BUILD_RESULT["renders"],
    }, indent=2))

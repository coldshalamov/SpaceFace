#!/usr/bin/env python3
"""Build isolated PQ-022 material-truth V2 navigation-infrastructure candidates.

The one deterministic run emits three candidate-only assets:

* ``place_station_billboard`` — shared, faction-neutral station information infrastructure;
* ``place_memorial_array`` — the unique Helios 24-light Candle Fleet monument;
* ``place_nav_buoy`` — shared, faction-neutral navigation hardware.

Visible geometry is newly authored. Existing live GLBs are read only for frozen identity evidence and
the exact non-mesh collision-helper contract. The script never writes live parts, release assets,
manifests, runtime maps, program documents, tests, or harness files.
"""
from __future__ import annotations

import hashlib
import importlib.util
import json
import math
import struct
import time
import zlib
from array import array
from pathlib import Path

import bmesh
import bpy
from mathutils import Vector


ROOT = Path(__file__).resolve().parents[2]
ASSET_ROOT = ROOT / "assets" / "ships" / "m5_navigation_infrastructure"
SOURCE_ROOT = ASSET_ROOT / "source_candidates" / "material_truth_v2" / "places"
MIRROR_ROOT = ASSET_ROOT / "release_candidates" / "material_truth_v2" / "places"
BLEND_ROOT = ASSET_ROOT / "blender" / "source" / "material_truth_v2"
REPORT_ROOT = ASSET_ROOT / "reports" / "material_truth_v2"
TEXTURE_ROOT = REPORT_ROOT / "textures"
RENDER_ROOT = REPORT_ROOT / "renders"
SOURCE_REPORT_ROOT = REPORT_ROOT / "source"
BUILD_REPORT = REPORT_ROOT / "build_report.json"
RENDER_MANIFEST = REPORT_ROOT / "render_manifest.json"
BINDING_REPORT = REPORT_ROOT / "validation_binding.json"

EXPORTER_PATH = ROOT / "tools" / "blender" / "spaceface_export.py"
EXPORTER_SPEC = importlib.util.spec_from_file_location("spaceface_export_navigation_v2", EXPORTER_PATH)
spaceface_export = importlib.util.module_from_spec(EXPORTER_SPEC)
EXPORTER_SPEC.loader.exec_module(spaceface_export)

PACKET = "PQ-022"
DISPATCH_UNIT = "PQ-022.billboard-buoy-reauthor"
CANDIDATE_SET_ID = "pq022-navigation-infrastructure-material-truth-v2"
SOURCE_GENERATOR = "tools/blender/build_navigation_infrastructure_material_truth_v2.py"
LOD_CEILINGS = {0: 3000, 1: 1000, 2: 300}
PROCESS_CHAIN = [
    "blender-5.1-python",
    "glb-source-candidate",
    "exact-source-validation",
    "hash-binding",
]
CLAIMS = {
    "candidateOnly": True,
    "promoted": False,
    "routeEvidence": False,
    "performanceEvidence": False,
}

ASSETS = {
    "place_station_billboard": {
        "asset_id": "SF_PLACE_HELIOS_SUPPORT_DOCK_ARM",
        "root": "SF_M4_HELIOS_DOCK_ARM_ROOT",
        "candidate_id": "pq022-station-billboard-material-truth-v2",
        "role": "core_station_information_display",
        "title": "Core Station Information Display",
        "kind": "station_infrastructure",
        "tier": "B",
        "materials": (
            "Display_Frame_Coat",
            "Display_Screen_Glass",
            "Display_Service_Alloy",
            "Display_Backplate",
            "Display_Safety_Marking",
        ),
        "material_roles": {
            "Display_Frame_Coat": "formed_neutral_frame_coat",
            "Display_Screen_Glass": "smoked_information_glass",
            "Display_Service_Alloy": "machined_service_alloy",
            "Display_Backplate": "folded_dark_backplate",
            "Display_Safety_Marking": "finite_amber_status_marking",
        },
        "gltf_min": (-1.5, -1.2000000476837158, -1.5),
        "gltf_max": (13.300000190734863, 1.850000023841858, 1.5),
        "collision_translation_gltf": (5.900000095367432, 0.32499998807907104, 0.0),
        "collision_node_bounds": {
            "min": [-0.9079999923706055, -1.3799999952316284, -1.0780000686645508],
            "max": [12.708000183105469, 1.3799999952316284, 1.7280001640319824],
            "size": [13.616000175476074, 2.759999990463257, 2.806000232696533],
        },
        "collision_runtime_bounds": {
            "min": [-6.808000087738037, -1.4030001163482666, -1.3799999952316284],
            "max": [6.808000087738037, 1.4030001163482666, 1.3799999952316284],
            "size": [13.616000175476074, 2.806000232696533, 2.759999990463257],
            "center": [0.0, 0.0, 0.0],
        },
        "collision_coverage": {
            "perAxis": [0.92, 0.9200000547190169, 0.9199999968210856],
            "min": 0.9199999968210856,
            "mean": 0.9200000171800342,
        },
        "collision_digest": "f9602e2004fd84494e4ab55890a3b9f9eaed88982172311b393f4fe3c70d9dd2",
        "baseline_source": ROOT / "assets/ships/parts/places/place_station_billboard.glb",
        "baseline_release": ROOT / "assets/ships/release/parts/places/place_station_billboard.glb",
        "byte_ceiling": 4_486_260,
        "build": "display",
    },
    "place_memorial_array": {
        "asset_id": "SF_PLACE_MEMORIAL_ARRAY",
        "root": "SF_PLACE_MEMORIAL_ARRAY_ROOT",
        "candidate_id": "pq022-memorial-array-material-truth-v2",
        "role": "helios_candle_fleet_memorial",
        "title": "The Candle Fleet Memorial Array",
        "kind": "hero_landmark",
        "tier": "A",
        "materials": (
            "Memorial_Frame_Coat",
            "Memorial_Recovered_Hull",
            "Memorial_Candle_Optic",
            "Memorial_Service_Alloy",
            "Memorial_Inscribed_Bronze",
        ),
        "material_roles": {
            "Memorial_Frame_Coat": "maintained_memorial_frame_coat",
            "Memorial_Recovered_Hull": "dark_recovered_convoy_hull",
            "Memorial_Candle_Optic": "warm_recessed_candle_optic",
            "Memorial_Service_Alloy": "machined_power_service_alloy",
            "Memorial_Inscribed_Bronze": "aged_registry_bronze",
        },
        "gltf_min": (-1.5, -1.2000000476837158, -1.5),
        "gltf_max": (13.300000190734863, 1.850000023841858, 1.5),
        "collision_translation_gltf": (5.900000095367432, 0.32499998807907104, 0.0),
        "collision_node_bounds": {
            "min": [-0.9079999923706055, -1.3799999952316284, -1.0780000686645508],
            "max": [12.708000183105469, 1.3799999952316284, 1.7280001640319824],
            "size": [13.616000175476074, 2.759999990463257, 2.806000232696533],
        },
        "collision_runtime_bounds": {
            "min": [-6.808000087738037, -1.4030001163482666, -1.3799999952316284],
            "max": [6.808000087738037, 1.4030001163482666, 1.3799999952316284],
            "size": [13.616000175476074, 2.806000232696533, 2.759999990463257],
            "center": [0.0, 0.0, 0.0],
        },
        "collision_coverage": {
            "perAxis": [0.92, 0.9200000547190169, 0.9199999968210856],
            "min": 0.9199999968210856,
            "mean": 0.9200000171800342,
        },
        "collision_digest": "f9602e2004fd84494e4ab55890a3b9f9eaed88982172311b393f4fe3c70d9dd2",
        "baseline_source": None,
        "baseline_release": None,
        "predecessor_representation": ROOT / "assets/ships/parts/places/place_station_billboard.glb",
        "byte_ceiling": 4_486_260,
        "build": "memorial",
    },
    "place_nav_buoy": {
        "asset_id": "SF_PLACE_HELIOS_NAV_SPIRE",
        "root": "SF_M4_HELIOS_NAV_SPIRE_ROOT",
        "candidate_id": "pq022-nav-buoy-material-truth-v2",
        "role": "faction_neutral_navigation_buoy",
        "title": "Standard Navigation Buoy",
        "kind": "navigation_infrastructure",
        "tier": "B",
        "materials": (
            "Buoy_Pressure_Shell",
            "Buoy_Stabilizer_Frame",
            "Buoy_Nav_Optic",
            "Buoy_Solar_Cell",
            "Buoy_Service_Marking",
        ),
        "material_roles": {
            "Buoy_Pressure_Shell": "neutral_coated_pressure_shell",
            "Buoy_Stabilizer_Frame": "cast_inertial_stabilizer_frame",
            "Buoy_Nav_Optic": "recessed_multiface_navigation_optic",
            "Buoy_Solar_Cell": "segmented_photovoltaic_laminate",
            "Buoy_Service_Marking": "finite_tow_service_marking",
        },
        "gltf_min": (-1.399999976158142, -5.0, -1.399999976158142),
        "gltf_max": (1.5749999284744263, 10.300000190734863, 1.399999976158142),
        "collision_translation_gltf": (0.08749997615814209, 2.6500000953674316, 0.0),
        "collision_node_bounds": {
            "min": [-1.281000018119812, -1.2879999876022339, -4.388000011444092],
            "max": [1.4559999704360962, 1.2879999876022339, 9.687999725341797],
            "size": [2.736999988555908, 2.5759999752044678, 14.075999736785889],
        },
        "collision_runtime_bounds": {
            "min": [-1.368499994277954, -7.038000106811523, -1.2879999876022339],
            "max": [1.368499994277954, 7.038000106811523, 1.2879999876022339],
            "size": [2.736999988555908, 14.076000213623047, 2.5759999752044678],
            "center": [0.0, 0.0, 0.0],
        },
        "collision_coverage": {
            "perAxis": [0.9200000256450245, 0.9200000024932662, 0.9200000068119595],
            "min": 0.9200000024932662,
            "mean": 0.9200000116500834,
        },
        "collision_digest": "0d0e0455be674c98915f10f8ec2e70eed67adf48e703e5bb363ddb3ec0fc972d",
        "baseline_source": ROOT / "assets/ships/parts/places/place_nav_buoy.glb",
        "baseline_release": ROOT / "assets/ships/release/parts/places/place_nav_buoy.glb",
        "byte_ceiling": 3_775_832,
        "build": "buoy",
    },
}


MATERIAL_TUNING = {
    "Display_Frame_Coat": ((0.22, 0.30, 0.35), 0.05, 0.58, "coat"),
    "Display_Screen_Glass": ((0.012, 0.045, 0.065), 0.02, 0.17, "glass"),
    "Display_Service_Alloy": ((0.42, 0.47, 0.49), 0.88, 0.31, "machined"),
    "Display_Backplate": ((0.055, 0.070, 0.075), 0.26, 0.72, "folded"),
    "Display_Safety_Marking": ((0.78, 0.31, 0.025), 0.01, 0.48, "marking"),
    "Memorial_Frame_Coat": ((0.19, 0.28, 0.33), 0.06, 0.53, "coat"),
    "Memorial_Recovered_Hull": ((0.045, 0.052, 0.052), 0.54, 0.78, "recovered"),
    "Memorial_Candle_Optic": ((0.42, 0.11, 0.018), 0.00, 0.21, "optic_warm"),
    "Memorial_Service_Alloy": ((0.34, 0.38, 0.39), 0.90, 0.34, "machined"),
    "Memorial_Inscribed_Bronze": ((0.40, 0.17, 0.045), 0.82, 0.42, "bronze"),
    "Buoy_Pressure_Shell": ((0.33, 0.37, 0.36), 0.03, 0.61, "coat"),
    "Buoy_Stabilizer_Frame": ((0.15, 0.18, 0.19), 0.78, 0.49, "cast"),
    "Buoy_Nav_Optic": ((0.015, 0.16, 0.20), 0.01, 0.19, "optic_cool"),
    "Buoy_Solar_Cell": ((0.012, 0.035, 0.075), 0.18, 0.28, "solar"),
    "Buoy_Service_Marking": ((0.72, 0.23, 0.018), 0.00, 0.66, "marking"),
}


def rel(path: Path) -> str:
    return str(path.relative_to(ROOT)).replace("\\", "/")


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest().lower()


def identity(path: Path) -> dict:
    return {"path": rel(path), "sha256": sha256(path), "bytes": path.stat().st_size}


def json_dump(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")


def write_bytes_in_place(path: Path, payload: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    if not path.exists():
        path.write_bytes(payload)
        return
    with path.open("r+b") as handle:
        old_size = handle.seek(0, 2)
        handle.seek(0)
        handle.write(payload)
        if old_size > len(payload):
            handle.truncate(len(payload))
        handle.flush()


def png_chunk(kind: bytes, data: bytes) -> bytes:
    return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data) & 0xFFFFFFFF)


def write_png(path: Path, width: int, height: int, pixel_fn) -> None:
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


def texture_pixel(material_name: str, kind: str, x: int, y: int, width: int, height: int) -> bytes:
    base, metallic, roughness, family = MATERIAL_TUNING[material_name]
    u = x / max(1, width - 1)
    v = y / max(1, height - 1)
    broad = 0.58 * math.sin(math.tau * (u * 0.73 + v * 0.31) + 0.41)
    broad += 0.42 * math.sin(math.tau * (u * 1.19 - v * 0.47) + 1.27)
    directional = 0.65 * math.sin(math.tau * (v * 83.0 + u * 0.13))
    directional += 0.35 * math.sin(math.tau * (v * 149.0 - u * 0.08) + 0.73)
    granular = 0.55 * math.sin(math.tau * (u * 31.0 + v * 17.0) + 0.19)
    granular += 0.45 * math.sin(math.tau * (u * 47.0 - v * 29.0) + 1.81)
    service_wear = max(0.0, math.sin(math.tau * (u * 2.1 + v * 0.4) + 0.8)) * max(0.0, v - 0.62)

    if kind == "normal":
        if family in {"machined", "bronze"}:
            nx, ny = 128 + 4.5 * directional, 128 + 0.8 * broad
        elif family in {"recovered", "cast"}:
            nx, ny = 128 + 3.4 * granular, 128 - 2.6 * granular
        elif family == "folded":
            nx, ny = 128 + 1.8 * broad, 128 + 0.9 * broad
        elif family == "solar":
            nx, ny = 128 + 1.2 * math.sin(math.tau * v * 24.0), 128
        elif family.startswith("optic") or family == "glass":
            nx, ny = 128, 128
        elif family == "marking":
            nx, ny = 128 + 0.7 * broad, 128 - 0.5 * broad
        else:
            nx, ny = 128 + 1.3 * broad, 128 - 0.8 * broad
        return bytes((clamp_byte(nx), clamp_byte(ny), 255, 255))

    if kind == "orm":
        if family in {"machined", "bronze"}:
            rough = roughness * 255 + directional * 5
        elif family in {"recovered", "cast"}:
            rough = roughness * 255 + granular * 7 + service_wear * 10
        elif family == "solar":
            rough = roughness * 255 + 3 * math.sin(math.tau * v * 12.0)
        else:
            rough = roughness * 255 + broad * 4
        ao = 241 - (8 if family in {"folded", "recovered", "cast"} and v > 0.91 else 0)
        return bytes((clamp_byte(ao), clamp_byte(rough), clamp_byte(metallic * 255), 255))

    factor = 0.97 + broad * (0.018 if family in {"glass", "optic_warm", "optic_cool"} else 0.045)
    if family in {"recovered", "cast"}:
        factor *= 1.0 - service_wear * 0.08
    rgb = tuple(clamp_byte(channel * 255 * factor) for channel in base)
    return bytes((*rgb, 255))


def create_texture_files(asset_key: str, config: dict) -> dict[str, dict[str, Path]]:
    result = {}
    for material_name in config["materials"]:
        result[material_name] = {}
        role = config["material_roles"][material_name]
        for kind in ("basecolor", "orm", "normal"):
            path = TEXTURE_ROOT / asset_key / f"{role}_{kind}.png"
            write_png(path, 256, 256, lambda x, y, w, h, m=material_name, k=kind: texture_pixel(m, k, x, y, w, h))
            result[material_name][kind] = path
    return result


def reset_scene() -> None:
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


def create_materials(config: dict, texture_files: dict[str, dict[str, Path]]) -> dict[str, object]:
    materials = {}
    for name in config["materials"]:
        color, metallic, roughness, family = MATERIAL_TUNING[name]
        material = bpy.data.materials.new(name)
        material.use_nodes = True
        nodes = material.node_tree.nodes
        links = material.node_tree.links
        nodes.clear()
        output = nodes.new("ShaderNodeOutputMaterial")
        output.location = (720, 0)
        shader = nodes.new("ShaderNodeBsdfPrincipled")
        shader.name = "Principled BSDF"
        shader.location = (420, 0)
        shader.inputs["Base Color"].default_value = (*color, 1.0)
        shader.inputs["Metallic"].default_value = metallic
        shader.inputs["Roughness"].default_value = roughness
        if "Coat Weight" in shader.inputs and family in {"coat", "glass", "optic_warm", "optic_cool"}:
            shader.inputs["Coat Weight"].default_value = 0.28 if family == "coat" else 0.52
            shader.inputs["Coat Roughness"].default_value = 0.34 if family == "coat" else 0.15
        if "Anisotropic IOR Level" in shader.inputs and family in {"machined", "bronze"}:
            shader.inputs["Anisotropic IOR Level"].default_value = 0.34

        base_node = nodes.new("ShaderNodeTexImage")
        base_node.name = f"{name}_BaseColor"
        base_node.image = load_image(texture_files[name]["basecolor"], "sRGB")
        base_node.location = (-560, 160)
        links.new(base_node.outputs["Color"], shader.inputs["Base Color"])

        orm_node = nodes.new("ShaderNodeTexImage")
        orm_node.name = f"{name}_AO_Roughness_Metallic"
        orm_node.image = load_image(texture_files[name]["orm"], "Non-Color")
        orm_node.location = (-560, -40)
        separate = nodes.new("ShaderNodeSeparateColor")
        separate.location = (-290, -40)
        links.new(orm_node.outputs["Color"], separate.inputs["Color"])
        links.new(separate.outputs["Green"], shader.inputs["Roughness"])
        links.new(separate.outputs["Blue"], shader.inputs["Metallic"])
        gltf_group = bpy.data.node_groups.get("glTF Material Output")
        if gltf_group is None:
            gltf_group = bpy.data.node_groups.new("glTF Material Output", "ShaderNodeTree")
            gltf_group.interface.new_socket(name="Occlusion", in_out="INPUT", socket_type="NodeSocketFloat")
        gltf_output = nodes.new("ShaderNodeGroup")
        gltf_output.node_tree = gltf_group
        gltf_output.location = (120, -270)
        links.new(separate.outputs["Red"], gltf_output.inputs["Occlusion"])

        normal_node = nodes.new("ShaderNodeTexImage")
        normal_node.name = f"{name}_Normal"
        normal_node.image = load_image(texture_files[name]["normal"], "Non-Color")
        normal_node.location = (-560, -270)
        normal_map = nodes.new("ShaderNodeNormalMap")
        normal_map.location = (-280, -250)
        normal_map.inputs["Strength"].default_value = 0.34
        links.new(normal_node.outputs["Color"], normal_map.inputs["Color"])
        links.new(normal_map.outputs["Normal"], shader.inputs["Normal"])

        if family == "optic_warm":
            shader.inputs["Emission Color"].default_value = (1.0, 0.20, 0.018, 1.0)
            shader.inputs["Emission Strength"].default_value = 3.2
        elif family == "optic_cool":
            shader.inputs["Emission Color"].default_value = (0.02, 0.62, 0.85, 1.0)
            shader.inputs["Emission Strength"].default_value = 2.7
        elif name == "Display_Safety_Marking":
            shader.inputs["Emission Color"].default_value = (0.62, 0.10, 0.008, 1.0)
            shader.inputs["Emission Strength"].default_value = 0.75
        links.new(shader.outputs["BSDF"], output.inputs["Surface"])
        material.diffuse_color = (*color, 1.0)
        material["spaceface.semantic"] = name
        material["spaceface.textureRole"] = config["material_roles"][name]
        material["spaceface.materialTruth"] = "navigation_infrastructure_material_truth_v2"
        materials[name] = material
    return materials


def tag(obj, lod: int, material: str, role: str) -> None:
    obj["spaceface.lodLevel"] = lod
    obj["spaceface.chamfered"] = True
    obj["spaceface.materialRole"] = material
    obj["spaceface.structureRole"] = role


def add_box(collection, materials, lod: int, name: str, size, location, material: str,
            bevel=0.04, rotation=(0.0, 0.0, 0.0)):
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=location, rotation=rotation)
    obj = bpy.context.object
    obj.name = f"LOD{lod}_{name}"
    obj.dimensions = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(materials[material])
    if bevel > 0 and lod < 2:
        modifier = obj.modifiers.new("SF_ManufacturedEdge", "BEVEL")
        modifier.width = max(0.008, bevel * (1.0 if lod == 0 else 0.62))
        modifier.segments = 2 if lod == 0 else 1
        modifier.limit_method = "ANGLE"
    tag(obj, lod, material, name)
    move_to(obj, collection)
    return obj


def add_cylinder(collection, materials, lod: int, name: str, radius: float, depth: float,
                 location, material: str, rotation=(0.0, 0.0, 0.0), vertices=None, bevel=0.025):
    vertices = vertices or (12 if lod == 0 else 8 if lod == 1 else 6)
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
    if bevel > 0 and lod < 2:
        modifier = obj.modifiers.new("SF_MachinedEdge", "BEVEL")
        modifier.width = max(0.006, bevel * (1.0 if lod == 0 else 0.62))
        modifier.segments = 2 if lod == 0 else 1
        modifier.limit_method = "ANGLE"
    tag(obj, lod, material, name)
    move_to(obj, collection)
    return obj


def add_torus(collection, materials, lod: int, name: str, major_radius: float, minor_radius: float,
              location, material: str, rotation=(0.0, 0.0, 0.0), major_segments=None, minor_segments=None):
    bpy.ops.mesh.primitive_torus_add(
        major_radius=major_radius,
        minor_radius=minor_radius,
        major_segments=major_segments or (12 if lod == 0 else 8),
        minor_segments=minor_segments or (4 if lod == 0 else 3),
        location=location,
        rotation=rotation,
    )
    obj = bpy.context.object
    obj.name = f"LOD{lod}_{name}"
    obj.data.materials.append(materials[material])
    tag(obj, lod, material, name)
    move_to(obj, collection)
    return obj


def add_beam(collection, materials, lod: int, name: str, start, end, radius: float, material: str,
             vertices=None, bevel=None):
    start_v, end_v = Vector(start), Vector(end)
    delta = end_v - start_v
    obj = add_cylinder(
        collection,
        materials,
        lod,
        name,
        radius,
        delta.length,
        (start_v + end_v) * 0.5,
        material,
        vertices=vertices or (8 if lod == 0 else 6),
        bevel=radius * 0.15 if bevel is None else bevel,
    )
    obj.rotation_euler = delta.to_track_quat("Z", "Y").to_euler()
    return obj


def add_frustum_z(collection, materials, lod: int, name: str, stations, material: str, segments=8,
                  phase=math.pi / 8.0):
    vertices = []
    for z, radius_x, radius_y, offset_x, offset_y in stations:
        for index in range(segments):
            angle = phase + math.tau * index / segments
            vertices.append((
                offset_x + radius_x * math.cos(angle),
                offset_y + radius_y * math.sin(angle),
                z,
            ))
    faces = []
    for ring in range(len(stations) - 1):
        left = ring * segments
        right = (ring + 1) * segments
        for index in range(segments):
            nxt = (index + 1) % segments
            faces.append((left + index, left + nxt, right + nxt, right + index))
    faces.append(tuple(reversed(tuple(range(segments)))))
    last = (len(stations) - 1) * segments
    faces.append(tuple(last + index for index in range(segments)))
    mesh = bpy.data.meshes.new(f"LOD{lod}_{name}_Mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(f"LOD{lod}_{name}", mesh)
    collection.objects.link(obj)
    obj.data.materials.append(materials[material])
    tag(obj, lod, material, name)
    return obj


def add_plinth_x(collection, materials, lod: int, name: str, stations, material: str):
    vertices = []
    for x, half_y, bottom_z, top_z in stations:
        vertices.extend(((x, -half_y, bottom_z), (x, half_y, bottom_z),
                         (x, half_y, top_z), (x, -half_y, top_z)))
    faces = []
    for section in range(len(stations) - 1):
        left, right = section * 4, (section + 1) * 4
        faces.extend((
            (left, right, right + 1, left + 1),
            (left + 1, right + 1, right + 2, left + 2),
            (left + 2, right + 2, right + 3, left + 3),
            (left + 3, right + 3, right, left),
        ))
    faces.append((0, 1, 2, 3))
    last = (len(stations) - 1) * 4
    faces.append((last + 3, last + 2, last + 1, last))
    mesh = bpy.data.meshes.new(f"LOD{lod}_{name}_Mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(f"LOD{lod}_{name}", mesh)
    collection.objects.link(obj)
    obj.data.materials.append(materials[material])
    tag(obj, lod, material, name)
    return obj


def add_quad_array(collection, materials, lod: int, name: str, centers, size, y, material: str):
    half_x, half_z = size[0] * 0.5, size[1] * 0.5
    vertices, faces = [], []
    for center_x, center_z in centers:
        offset = len(vertices)
        vertices.extend((
            (center_x - half_x, y, center_z - half_z),
            (center_x + half_x, y, center_z - half_z),
            (center_x + half_x, y, center_z + half_z),
            (center_x - half_x, y, center_z + half_z),
        ))
        faces.append((offset, offset + 1, offset + 2, offset + 3))
    mesh = bpy.data.meshes.new(f"LOD{lod}_{name}_Mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(f"LOD{lod}_{name}", mesh)
    collection.objects.link(obj)
    obj.data.materials.append(materials[material])
    tag(obj, lod, material, name)
    return obj


def display_geometry(collection, materials, lod: int) -> None:
    frame = "Display_Frame_Coat"
    glass = "Display_Screen_Glass"
    service = "Display_Service_Alloy"
    back = "Display_Backplate"
    marking = "Display_Safety_Marking"
    # End shoes alone touch the exact frozen X/Y/min-Z envelope; the information assembly stays
    # inset and readable rather than inheriting the old blank-beam silhouette.
    add_box(collection, materials, lod, "PortLoadShoe", (0.70, 3.0, 0.70), (-1.15, 0.0, -0.85), frame, 0.07)
    add_box(collection, materials, lod, "StarboardLoadShoe", (0.70, 3.0, 0.70), (12.95, 0.0, -0.85), frame, 0.07)
    add_box(collection, materials, lod, "FoldedBackplate", (13.50, 0.62, 2.30), (5.9, 0.24, 0.33), back, 0.055)
    add_box(collection, materials, lod, "UpperVisorRail", (13.40, 0.78, 0.25), (5.9, -0.18, 1.725), frame, 0.045)
    add_box(collection, materials, lod, "LowerSillRail", (13.40, 0.70, 0.24), (5.9, -0.22, -0.67), frame, 0.04)
    add_box(collection, materials, lod, "LeftFrameRail", (0.27, 0.76, 2.20), (-0.67, -0.18, 0.45), frame, 0.035)
    add_box(collection, materials, lod, "CenterServiceBridge", (0.34, 0.92, 2.18), (5.9, -0.20, 0.45), service, 0.035)
    add_box(collection, materials, lod, "RightFrameRail", (0.27, 0.76, 2.20), (12.47, -0.18, 0.45), frame, 0.035)
    add_box(collection, materials, lod, "LeftScreenCavity", (5.75, 0.22, 1.70), (2.52, -0.56, 0.48), glass, 0.035)
    add_box(collection, materials, lod, "RightScreenCavity", (5.75, 0.22, 1.70), (9.28, -0.56, 0.48), glass, 0.035)
    if lod < 2:
        trunk_count = 3 if lod == 0 else 2
        for index in range(trunk_count):
            x = 1.25 + index * (4.65 if trunk_count == 3 else 9.3)
            add_box(collection, materials, lod, f"RearServiceTrunk{index + 1:02d}",
                    (1.05, 0.38, 1.45), (x, 0.76, 0.25), service, 0.05)
        add_beam(collection, materials, lod, "RearPowerBridgeA", (1.8, 0.96, 0.82),
                 (5.35, 0.96, 0.82), 0.07, service)
        add_beam(collection, materials, lod, "RearPowerBridgeB", (6.45, 0.96, 0.82),
                 (10.0, 0.96, 0.82), 0.07, service)
        status_count = 6 if lod == 0 else 4
        for index in range(status_count):
            x = 0.55 + index * (10.70 / max(1, status_count - 1))
            add_cylinder(collection, materials, lod, f"HoodedStatusCell{index + 1:02d}", 0.10, 0.12,
                         (x, -0.78, -0.43), marking, rotation=(math.pi / 2, 0.0, 0.0),
                         vertices=10 if lod == 0 else 6, bevel=0.0)
        add_box(collection, materials, lod, "OffsetReplacementCassette", (0.72, 0.25, 0.48),
                (10.85, 0.62, -0.25), service, 0.035)
    else:
        add_box(collection, materials, lod, "ServiceProxy", (1.1, 0.18, 1.3), (5.9, 0.70, 0.25), service, 0.0)
        add_quad_array(collection, materials, lod, "StatusProxy", [(2.0, -0.43), (9.8, -0.43)],
                       (0.22, 0.18), -0.72, marking)


def memorial_light_centers():
    # The offset is deliberately shared by every LOD so all twenty-four physical lights remain
    # countable without the upper bezel crossing the frozen 1.85 m envelope.
    return [(0.40 + column * 2.18, -0.55 + row * 0.47) for row in range(4) for column in range(6)]


def memorial_geometry(collection, materials, lod: int) -> None:
    frame = "Memorial_Frame_Coat"
    hull = "Memorial_Recovered_Hull"
    optic = "Memorial_Candle_Optic"
    service = "Memorial_Service_Alloy"
    bronze = "Memorial_Inscribed_Bronze"
    stations = (
        (-1.5, 0.72, -0.98, -0.58),
        (-0.92, 1.50, -1.20, -0.34),
        (3.50, 1.28, -1.07, -0.22),
        (8.15, 1.34, -1.10, -0.18),
        (12.78, 1.50, -1.20, -0.36),
        (13.30, 0.74, -0.98, -0.60),
    )
    if lod == 2:
        stations = (stations[0], stations[1], stations[3], stations[-2], stations[-1])
    add_plinth_x(collection, materials, lod, "RecoveredHullPlinth", stations, hull)
    add_box(collection, materials, lod, "UpperMemorialRail", (13.15, 0.44, 0.24), (5.9, -0.10, 1.73), frame, 0.045)
    add_box(collection, materials, lod, "LowerMemorialRail", (13.15, 0.42, 0.22), (5.9, -0.10, -0.30), frame, 0.04)
    for index, x in enumerate((-0.55, 1.49, 3.67, 5.90, 8.13, 10.31, 12.35)):
        if lod == 2 and index not in {0, 3, 6}:
            continue
        add_box(collection, materials, lod, f"FrameStation{index + 1:02d}", (0.19, 0.48, 1.94),
                (x, -0.10, 0.70), frame, 0.03)
    centers = memorial_light_centers()
    if lod == 0:
        for index, (x, z) in enumerate(centers):
            add_cylinder(collection, materials, lod, f"CandleBezel{index + 1:02d}", 0.165, 0.20,
                         (x, -0.48, z + 0.62), service, rotation=(math.pi / 2, 0.0, 0.0),
                         vertices=8, bevel=0.0)
            add_cylinder(collection, materials, lod, f"CandleLens{index + 1:02d}", 0.112, 0.055,
                         (x, -0.61, z + 0.62), optic, rotation=(math.pi / 2, 0.0, 0.0),
                         vertices=8, bevel=0.0)
    elif lod == 1:
        for index, (x, z) in enumerate(centers):
            add_box(collection, materials, lod, f"CandleBezel{index + 1:02d}", (0.28, 0.12, 0.28),
                    (x, -0.49, z + 0.62), service, 0.0)
        add_quad_array(collection, materials, lod, "CandleLensArray", centers=[(x, z + 0.62) for x, z in centers],
                       size=(0.18, 0.18), y=-0.565, material=optic)
    else:
        add_quad_array(collection, materials, lod, "CandleLensArray", centers=[(x, z + 0.62) for x, z in centers],
                       size=(0.16, 0.16), y=-0.39, material=optic)
        add_box(collection, materials, lod, "ServiceProxy", (0.34, 0.22, 1.45), (5.9, 0.22, 0.62), service, 0.0)
    add_box(collection, materials, lod, "RegistryRailUpper", (11.40, 0.10, 0.075),
            (5.9, -0.51 if lod < 2 else -0.36, 1.51), bronze, 0.0)
    add_box(collection, materials, lod, "RegistryRailLower", (11.40, 0.10, 0.075),
            (5.9, -0.51 if lod < 2 else -0.36, -0.17), bronze, 0.0)
    if lod < 2:
        trunk_count = 3 if lod == 0 else 2
        for index in range(trunk_count):
            x = 1.25 + index * (4.65 if trunk_count == 3 else 9.3)
            add_box(collection, materials, lod, f"RearCandleServiceTrunk{index + 1:02d}",
                    (0.78, 0.34, 1.35), (x, 0.50, 0.65), service, 0.045)
        add_box(collection, materials, lod, "ScarfRepairPlate", (1.15, 0.08, 0.48),
                (9.85, -1.345, -0.66), bronze, 0.018)


def buoy_geometry(collection, materials, lod: int) -> None:
    shell = "Buoy_Pressure_Shell"
    stabilizer = "Buoy_Stabilizer_Frame"
    optic = "Buoy_Nav_Optic"
    solar = "Buoy_Solar_Cell"
    marking = "Buoy_Service_Marking"
    segments = 10 if lod == 0 else 8 if lod == 1 else 6
    # The lower mass is an inertial-control assembly in zero-g.  A cruciform yoke and four
    # open load struts preserve the frozen extrema while leaving the orthogonal wheels, gimbals,
    # dampers, and service clearance physically inspectable from outside.
    boss_vertices = 8 if lod == 0 else 6 if lod == 1 else 3
    cage_vertices = 6 if lod == 0 else 3
    add_cylinder(collection, materials, lod, "LowerLoadBoss", 0.78, 0.36,
                 (0.0, 0.0, -4.82), stabilizer, vertices=boss_vertices, bevel=0.0)
    add_box(collection, materials, lod, "CruciformYokeForward", (2.80, 0.22, 0.22),
            (0.0, 0.0, -4.55), stabilizer, 0.0)
    add_box(collection, materials, lod, "CruciformYokeStarboard", (0.22, 2.80, 0.22),
            (0.0, 0.0, -4.55), stabilizer, 0.0)
    add_cylinder(collection, materials, lod, "UpperLoadCollar", 0.72, 0.30,
                 (0.0, 0.0, -2.70), stabilizer, vertices=boss_vertices, bevel=0.0)
    cage_struts = (
        ((-1.25, 0.0, -4.55), (-0.58, 0.0, -2.68)),
        ((1.25, 0.0, -4.55), (0.58, 0.0, -2.68)),
        ((0.0, -1.25, -4.55), (0.0, -0.58, -2.68)),
        ((0.0, 1.25, -4.55), (0.0, 0.58, -2.68)),
    )
    for index, (start, end) in enumerate(cage_struts):
        add_beam(collection, materials, lod, f"OpenCageStrut{index + 1:02d}",
                 start, end, 0.07, stabilizer, vertices=cage_vertices, bevel=0.0)
    add_cylinder(collection, materials, lod, "ReactionWheelPitch", 0.72, 0.34, (0.0, 0.0, -3.75),
                 stabilizer, rotation=(math.pi / 2, 0.0, 0.0), vertices=segments, bevel=0.0)
    add_cylinder(collection, materials, lod, "ReactionWheelYaw", 0.62, 0.30, (0.0, 0.0, -3.75),
                 shell, rotation=(0.0, math.pi / 2, 0.0), vertices=segments, bevel=0.0)
    if lod < 2:
        add_torus(collection, materials, lod, "GimbalOuter", 0.92, 0.065, (0.0, 0.0, -3.75),
                  stabilizer, rotation=(math.pi / 2, 0.0, 0.0))
        add_torus(collection, materials, lod, "GimbalInner", 0.79, 0.055, (0.0, 0.0, -3.75),
                  stabilizer, rotation=(0.0, math.pi / 2, 0.0))
        for index, (x, y) in enumerate(((-0.82, -0.78), (0.82, -0.78), (-0.82, 0.78), (0.82, 0.78))):
            add_beam(collection, materials, lod, f"StabilizerDamper{index + 1:02d}",
                     (x, y, -4.45), (x * 0.55, y * 0.55, -2.75), 0.055, stabilizer,
                     bevel=0.0)
    add_frustum_z(collection, materials, lod, "ServiceSpine", (
        (-2.68, 0.52, 0.50, 0.0, 0.0),
        (-2.30, 0.60, 0.58, 0.0, 0.0),
        (4.85, 0.45, 0.43, 0.0, 0.0),
        (5.35, 0.68, 0.66, 0.0, 0.0),
    ), shell, segments)
    if lod < 2:
        add_box(collection, materials, lod, "PortBatteryCase", (0.45, 1.10, 2.65),
                (-0.72, 0.0, 1.25), shell, 0.055)
        add_box(collection, materials, lod, "StarboardBatteryCase", (0.45, 1.10, 2.65),
                (0.72, 0.0, 1.25), shell, 0.055)
        add_box(collection, materials, lod, "PortSolarLaminate", (0.08, 0.86, 2.25),
                (-0.965, 0.0, 1.25), solar, 0.015)
        add_box(collection, materials, lod, "StarboardSolarLaminate", (0.08, 0.86, 2.25),
                (0.965, 0.0, 1.25), solar, 0.015)
        add_box(collection, materials, lod, "OffsetServiceTrunk", (0.35, 0.48, 3.85),
                (1.08, 0.0, 1.65), stabilizer, 0.045)
        for index, z in enumerate((-0.25, 1.25, 2.75)):
            add_beam(collection, materials, lod, f"ServiceCable{index + 1:02d}",
                     (0.55, -0.44, z), (1.08, -0.28, z + 0.30), 0.045, stabilizer,
                     bevel=0.0)
    else:
        add_box(collection, materials, lod, "SolarProxy", (0.12, 0.92, 2.1), (-0.66, 0.0, 1.25), solar, 0.0)
    add_frustum_z(collection, materials, lod, "SignalHead", (
        (5.20, 0.72, 0.72, 0.0, 0.0),
        (5.75, 1.18, 1.18, 0.0, 0.0),
        (8.25, 1.18, 1.18, 0.0, 0.0),
        (8.72, 0.80, 0.80, 0.0, 0.0),
    ), shell, segments)
    # Four finite apertures are true multi-azimuth hardware, not a glowing crown.
    aperture_specs = (
        ("Fore", (1.23, 0.0, 7.05), (0.0, math.pi / 2, 0.0)),
        ("Aft", (-1.23, 0.0, 7.05), (0.0, math.pi / 2, 0.0)),
        ("Port", (0.0, -1.23, 7.05), (math.pi / 2, 0.0, 0.0)),
        ("Starboard", (0.0, 1.23, 7.05), (math.pi / 2, 0.0, 0.0)),
    )
    for label, location, rotation in aperture_specs:
        if lod == 2:
            optic_size = (0.12, 0.44, 0.44) if label in {"Fore", "Aft"} else (0.44, 0.12, 0.44)
            add_box(collection, materials, lod, f"{label}NavOptic", optic_size,
                    location, optic, 0.0)
        else:
            add_cylinder(collection, materials, lod, f"{label}NavOptic", 0.27,
                         0.12, location, optic, rotation=rotation,
                         vertices=8 if lod == 0 else 6, bevel=0.0)
        if lod < 2:
            hood_location = (location[0] * 0.91, location[1] * 0.91, location[2] + 0.28)
            add_box(collection, materials, lod, f"{label}OpticHood", (0.50, 0.50, 0.18),
                    hood_location, stabilizer, 0.0)
    add_cylinder(collection, materials, lod, "TelemetryMast", 0.12 if lod < 2 else 0.10, 1.58,
                 (0.0, 0.0, 9.51), stabilizer, vertices=segments, bevel=0.0)
    add_box(collection, materials, lod, "ServiceMarkingPlate", (0.35, 0.42, 0.62),
            (1.3999999284744263, 0.0, 3.90), marking, 0.025 if lod < 2 else 0.0)
    if lod < 2:
        add_box(collection, materials, lod, "TelemetryVanePort", (0.50, 0.07, 0.22),
                (-0.34, 0.0, 9.30), stabilizer, 0.0)
        add_box(collection, materials, lod, "TelemetryVaneStarboard", (0.50, 0.07, 0.22),
                (0.34, 0.0, 9.62), stabilizer, 0.0)


def candidate_path(asset_key: str) -> Path:
    return SOURCE_ROOT / f"{asset_key}.glb"


def mirror_path(asset_key: str) -> Path:
    return MIRROR_ROOT / f"{asset_key}.glb"


def staging_path(asset_key: str) -> Path:
    return SOURCE_ROOT / f"{asset_key}.build.glb"


def blend_path(asset_key: str) -> Path:
    return BLEND_ROOT / f"{asset_key}.blend"


def source_report_path(asset_key: str) -> Path:
    return SOURCE_REPORT_ROOT / f"{asset_key}.report.json"


def blender_min_max(config: dict):
    gltf_min, gltf_max = config["gltf_min"], config["gltf_max"]
    # Blender (X, Y-starboard, Z-up) -> glTF (X, Y-up, Z-starboard) = (X, Z, -Y).
    return (
        (gltf_min[0], -gltf_max[2], gltf_min[1]),
        (gltf_max[0], -gltf_min[2], gltf_max[1]),
    )


def assert_vector(actual, expected, label: str, epsilon=1e-4) -> None:
    if len(actual) != len(expected) or any(abs(float(a) - float(e)) > epsilon for a, e in zip(actual, expected)):
        raise RuntimeError(f"{label}: expected {expected}, got {actual}")


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
    bpy.ops.uv.cube_project(cube_size=2.5, correct_aspect=True)
    bpy.ops.object.mode_set(mode="OBJECT")


def triangulate(obj) -> int:
    mesh = obj.data
    bm = bmesh.new()
    bm.from_mesh(mesh)
    bmesh.ops.triangulate(bm, faces=list(bm.faces))
    bm.to_mesh(mesh)
    bm.free()
    mesh.update()
    return len(mesh.polygons)


def topology(obj) -> dict:
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bm.verts.ensure_lookup_table()
    bm.edges.ensure_lookup_table()
    bm.faces.ensure_lookup_table()
    degenerate = sum(1 for face in bm.faces if face.calc_area() <= 1e-10)
    boundary = sum(1 for edge in bm.edges if len(edge.link_faces) == 1)
    non_manifold = sum(1 for edge in bm.edges if len(edge.link_faces) not in {1, 2})
    result = {
        "vertices": len(bm.verts),
        "edges": len(bm.edges),
        "triangles": len(bm.faces),
        "degenerateTriangles": degenerate,
        "boundaryEdges": boundary,
        "invalidNonManifoldEdges": non_manifold,
    }
    bm.free()
    if degenerate or non_manifold:
        raise RuntimeError(f"{obj.name}: invalid topology {result}")
    return result


def join_draw_groups(collection, materials, lod: int, root, material_names) -> tuple[list[object], dict]:
    groups, report = [], {}
    for material_name in material_names:
        objects = [
            obj for obj in list(collection.objects)
            if obj.type == "MESH"
            and obj.get("spaceface.lodLevel") == lod
            and obj.get("spaceface.materialRole") == material_name
        ]
        if not objects:
            raise RuntimeError(f"LOD{lod}/{material_name}: no authored geometry")
        for obj in objects:
            apply_object(obj)
        bpy.ops.object.select_all(action="DESELECT")
        for obj in objects:
            obj.select_set(True)
        bpy.context.view_layer.objects.active = objects[0]
        bpy.ops.object.join()
        merged = bpy.context.object
        merged.name = f"LOD{lod}_{material_name}"
        merged.data.name = f"LOD{lod}_{material_name}_Mesh"
        for polygon in merged.data.polygons:
            polygon.material_index = 0
        merged.data.materials.clear()
        merged.data.materials.append(materials[material_name])
        cube_project_uv(merged)
        triangle_count = triangulate(merged)
        merged.parent = root
        merged["spaceface.lodLevel"] = lod
        merged["spaceface.lod"] = f"lod{lod}"
        merged["spaceface.materialRole"] = material_name
        merged["spaceface.chamfered"] = True
        merged["spaceface.detailLevel"] = 0 if lod == 0 else lod
        report[merged.name] = topology(merged)
        report[merged.name]["triangles"] = triangle_count
        groups.append(merged)
    return groups, report


def object_bounds(objects) -> tuple[Vector, Vector, Vector]:
    minimum = Vector((1e9, 1e9, 1e9))
    maximum = Vector((-1e9, -1e9, -1e9))
    for obj in objects:
        for corner in obj.bound_box:
            point = obj.matrix_world @ Vector(corner)
            for axis in range(3):
                minimum[axis] = min(minimum[axis], point[axis])
                maximum[axis] = max(maximum[axis], point[axis])
    return minimum, maximum, maximum - minimum


def make_socket(collection, root):
    socket = bpy.data.objects.new("SOCKET_Structure_Core", None)
    socket.empty_display_type = "PLAIN_AXES"
    socket.empty_display_size = 0.5
    socket.parent = root
    socket["spaceface"] = {"socket": True, "role": "structure", "forward": [1, 0, 0]}
    socket["spaceface.socket"] = True
    socket["role"] = "structure"
    socket["forward"] = [1, 0, 0]
    collection.objects.link(socket)
    return socket


def make_collision_helper(collection, root, config: dict):
    helper = bpy.data.objects.new("COLLISION_HULL", None)
    x, gltf_y, gltf_z = config["collision_translation_gltf"]
    helper.location = (x, -gltf_z, gltf_y)
    helper.empty_display_type = "CUBE"
    helper.empty_display_size = 0.8
    helper.parent = root
    bounds_meta = config["collision_node_bounds"]
    helper["spaceface"] = {
        "collision": True,
        "helper": True,
        "nonRender": True,
        "role": "collision",
        "bounds": bounds_meta,
        "lod": "lod0",
        "chamfered": True,
        "bevelRadiusM": 0.05,
    }
    helper["sf_collision"] = True
    helper["sf_non_render"] = True
    helper["bounds"] = bounds_meta
    helper["collision"] = True
    helper["nonRender"] = True
    helper.hide_render = True
    helper.hide_viewport = True
    collection.objects.link(helper)
    return helper


def read_glb(path: Path) -> tuple[dict, bytes, list[tuple[int, bytes]]]:
    payload = path.read_bytes()
    if len(payload) < 20 or payload[:4] != b"glTF" or struct.unpack_from("<I", payload, 4)[0] != 2:
        raise RuntimeError(f"{path}: invalid GLB")
    chunks = []
    offset = 12
    while offset < len(payload):
        length, kind = struct.unpack_from("<II", payload, offset)
        data = payload[offset + 8: offset + 8 + length]
        chunks.append((kind, data))
        offset += 8 + length
    json_chunk = next((data for kind, data in chunks if kind == 0x4E4F534A), None)
    binary = next((data for kind, data in chunks if kind == 0x004E4942), b"")
    if json_chunk is None:
        raise RuntimeError(f"{path}: missing JSON chunk")
    document = json.loads(json_chunk.decode("utf-8").rstrip(" \t\r\n\0"))
    return document, binary, chunks


def rewrite_glb_metadata(path: Path, config: dict, stamp: dict) -> None:
    document, _binary, chunks = read_glb(path)
    asset_extras = document.setdefault("asset", {}).setdefault("extras", {})
    asset_extras.update({"assetId": config["asset_id"], "partId": stamp["partId"], "spacefaceAsset": stamp})
    scene = document["scenes"][document.get("scene", 0)]
    scene.setdefault("extras", {}).update({
        "assetId": config["asset_id"],
        "partId": stamp["partId"],
        "spacefaceAsset": stamp,
    })
    nodes = {node.get("name"): node for node in document.get("nodes", [])}
    root_node = nodes.get(config["root"])
    if root_node is None:
        raise RuntimeError(f"{path}: missing canonical root {config['root']}")
    root_node.setdefault("extras", {})["spacefaceAsset"] = stamp
    collision = nodes.get("COLLISION_HULL")
    if collision is None:
        raise RuntimeError(f"{path}: missing COLLISION_HULL")
    collision.pop("mesh", None)
    collision["translation"] = list(config["collision_translation_gltf"])
    collision.pop("rotation", None)
    collision.pop("scale", None)
    collision["extras"] = {
        "spaceface": {
            "collision": True,
            "helper": True,
            "nonRender": True,
            "role": "collision",
            "bounds": config["collision_node_bounds"],
            "lod": "lod0",
            "chamfered": True,
            "bevelRadiusM": 0.05,
        },
        "sf_collision": True,
        "sf_non_render": True,
        "bounds": config["collision_node_bounds"],
        "collision": True,
        "nonRender": True,
    }
    socket = nodes.get("SOCKET_Structure_Core")
    if socket is None:
        raise RuntimeError(f"{path}: missing SOCKET_Structure_Core")
    socket.pop("translation", None)
    socket.pop("rotation", None)
    socket.pop("scale", None)
    socket["extras"] = {
        "spaceface": {"socket": True, "role": "structure", "forward": [1, 0, 0]},
        "spaceface.socket": True,
        "role": "structure",
        "forward": [1, 0, 0],
    }
    for lod in range(3):
        for material_name in config["materials"]:
            node = nodes.get(f"LOD{lod}_{material_name}")
            if node is None:
                raise RuntimeError(f"{path}: missing LOD{lod}_{material_name}")
            node.setdefault("extras", {}).update({
                "spaceface.lod": f"lod{lod}",
                "spaceface_chamfered": True,
                "spaceface": {"lod": f"lod{lod}", "chamfered": True, "bevelRadiusM": 0.05},
            })

    json_payload = json.dumps(document, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
    json_payload += b" " * ((4 - len(json_payload) % 4) % 4)
    rebuilt = [(0x4E4F534A, json_payload)] + [item for item in chunks if item[0] != 0x4E4F534A]
    body = bytearray()
    for kind, data in rebuilt:
        body.extend(struct.pack("<II", len(data), kind))
        body.extend(data)
    path.write_bytes(b"glTF" + struct.pack("<II", 2, 12 + len(body)) + bytes(body))


def primitive_triangles(document: dict, primitive: dict) -> int:
    if primitive.get("mode", 4) != 4:
        return 0
    accessor = document["accessors"][primitive.get("indices", primitive["attributes"]["POSITION"])]
    return accessor["count"] // 3


def accessor_payload(document: dict, binary: bytes, accessor_index: int) -> bytes:
    accessor = document["accessors"][accessor_index]
    view = document["bufferViews"][accessor["bufferView"]]
    start = int(view.get("byteOffset", 0))
    end = start + int(view["byteLength"])
    descriptor = json.dumps(accessor, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return descriptor + b"\0" + binary[start:end]


def primitive_geometry_sha256(document: dict, binary: bytes, primitive: dict) -> str:
    digest = hashlib.sha256()
    for semantic, accessor_index in sorted(primitive.get("attributes", {}).items()):
        if semantic in {"POSITION", "NORMAL", "TEXCOORD_0", "TANGENT"}:
            digest.update(semantic.encode("utf-8") + b"\0")
            digest.update(accessor_payload(document, binary, accessor_index))
    if primitive.get("indices") is not None:
        digest.update(b"INDICES\0" + accessor_payload(document, binary, primitive["indices"]))
    return digest.hexdigest()


def inspect_export(path: Path, config: dict) -> dict:
    document, binary, _chunks = read_glb(path)
    nodes = {node.get("name"): node for node in document.get("nodes", [])}
    expected = {config["root"], "COLLISION_HULL", "SOCKET_Structure_Core"}
    for lod in range(3):
        expected.update(f"LOD{lod}_{name}" for name in config["materials"])
    if set(nodes) != expected or len(nodes) != len(expected):
        raise RuntimeError(f"{path}: unexpected node set {sorted(set(nodes) ^ expected)}")
    scene_roots = [document["nodes"][index].get("name") for index in document["scenes"][document.get("scene", 0)]["nodes"]]
    if scene_roots != [config["root"]]:
        raise RuntimeError(f"{path}: sole-root contract failed {scene_roots}")
    root_node = nodes[config["root"]]
    assert_vector(root_node.get("translation", (0, 0, 0)), (0, 0, 0), f"{path}: root translation")
    assert_vector(root_node.get("rotation", (0, 0, 0, 1)), (0, 0, 0, 1), f"{path}: root rotation")
    assert_vector(root_node.get("scale", (1, 1, 1)), (1, 1, 1), f"{path}: root scale")
    socket = nodes["SOCKET_Structure_Core"]
    assert_vector(socket.get("translation", (0, 0, 0)), (0, 0, 0), f"{path}: socket translation")
    assert_vector(socket.get("rotation", (0, 0, 0, 1)), (0, 0, 0, 1), f"{path}: socket rotation")
    assert_vector(socket.get("scale", (1, 1, 1)), (1, 1, 1), f"{path}: socket scale")
    collision = nodes["COLLISION_HULL"]
    if collision.get("mesh") is not None:
        raise RuntimeError(f"{path}: collision helper accidentally has a mesh")
    assert_vector(collision.get("translation", (0, 0, 0)), config["collision_translation_gltf"],
                  f"{path}: collision translation")
    if collision.get("extras", {}).get("spaceface", {}).get("bounds") != config["collision_node_bounds"]:
        raise RuntimeError(f"{path}: collision node bounds metadata drift")

    material_names = [material.get("name") for material in document.get("materials", [])]
    if sorted(material_names) != sorted(config["materials"]):
        raise RuntimeError(f"{path}: material contract drift {material_names}")
    if len(document.get("images", [])) != len(config["materials"]) * 3:
        raise RuntimeError(f"{path}: expected 3 embedded maps per material")
    if len(document.get("textures", [])) != len(config["materials"]) * 3:
        raise RuntimeError(f"{path}: expected 3 texture bindings per material")
    material_by_index = {index: item.get("name") for index, item in enumerate(document["materials"])}
    minimum, maximum = [1e9] * 3, [-1e9] * 3
    lod_triangles, geometry_records = {}, []
    for lod in range(3):
        total = 0
        for material_name in config["materials"]:
            node = nodes[f"LOD{lod}_{material_name}"]
            primitives = document["meshes"][node["mesh"]]["primitives"]
            if len(primitives) != 1:
                raise RuntimeError(f"{path}: LOD{lod}/{material_name} is not one primitive")
            primitive = primitives[0]
            if material_by_index[primitive["material"]] != material_name:
                raise RuntimeError(f"{path}: LOD{lod}/{material_name} material mismatch")
            required = primitive.get("attributes", {})
            if not all(name in required for name in ("POSITION", "NORMAL", "TEXCOORD_0", "TANGENT")):
                raise RuntimeError(f"{path}: LOD{lod}/{material_name} missing exported vertex attributes")
            triangles = primitive_triangles(document, primitive)
            total += triangles
            geometry_records.append({
                "node": node["name"],
                "material": material_name,
                "triangles": triangles,
                "geometrySha256": primitive_geometry_sha256(document, binary, primitive),
            })
            if lod == 0:
                accessor = document["accessors"][required["POSITION"]]
                for axis in range(3):
                    minimum[axis] = min(minimum[axis], accessor["min"][axis])
                    maximum[axis] = max(maximum[axis], accessor["max"][axis])
        if total > LOD_CEILINGS[lod]:
            raise RuntimeError(f"{path}: LOD{lod} ceiling exceeded {total} > {LOD_CEILINGS[lod]}")
        lod_triangles[f"lod{lod}"] = total
    if not (lod_triangles["lod0"] > lod_triangles["lod1"] > lod_triangles["lod2"]):
        raise RuntimeError(f"{path}: LOD reduction is not strict {lod_triangles}")
    assert_vector(minimum, config["gltf_min"], f"{path}: LOD0 minimum", 1e-3)
    assert_vector(maximum, config["gltf_max"], f"{path}: LOD0 maximum", 1e-3)
    size = [maximum[index] - minimum[index] for index in range(3)]
    expected_size = [config["gltf_max"][index] - config["gltf_min"][index] for index in range(3)]
    assert_vector(size, expected_size, f"{path}: LOD0 size", 1e-3)
    if path.stat().st_size > config["byte_ceiling"]:
        raise RuntimeError(f"{path}: candidate byte ceiling exceeded {path.stat().st_size} > {config['byte_ceiling']}")
    visible_digest = hashlib.sha256(json.dumps(geometry_records, sort_keys=True, separators=(",", ":")).encode("utf-8")).hexdigest()
    return {
        "nodeCount": len(document["nodes"]),
        "meshCount": len(document.get("meshes", [])),
        "materialCount": len(document["materials"]),
        "imageCount": len(document.get("images", [])),
        "textureCount": len(document.get("textures", [])),
        "visibleGroupCount": len(config["materials"]) * 3,
        "visibleGeometrySha256": visible_digest,
        "geometryGroups": geometry_records,
        "lodTriangles": lod_triangles,
        "collision": {
            "node": "COLLISION_HULL",
            "representation": "non_mesh_helper",
            "triangles": 0,
            "geometrySha256": None,
            "translation": list(config["collision_translation_gltf"]),
            "nodeBounds": config["collision_node_bounds"],
            "runtimeBounds": config["collision_runtime_bounds"],
            "coverageRatio": config["collision_coverage"],
        },
        "gltfEnvelope": {"min": minimum, "max": maximum, "size": size},
    }


def look_at(obj, target) -> None:
    obj.rotation_euler = (Vector(target) - obj.location).to_track_quat("-Z", "Y").to_euler()


def configure_render_scene(scene, asset_key: str) -> None:
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 1600
    scene.render.resolution_y = 900
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.image_settings.color_depth = "8"
    scene.render.film_transparent = False
    scene.render.use_file_extension = True
    try:
        scene.render.image_settings.color_mode = "RGBA"
        scene.view_settings.look = "AgX - Medium High Contrast"
    except Exception:
        pass
    scene.view_settings.exposure = 1.15
    scene.view_settings.gamma = 1.0
    world = scene.world or bpy.data.worlds.new(f"PQ022_{asset_key}_World")
    scene.world = world
    world.use_nodes = True
    background = world.node_tree.nodes.get("Background")
    background.inputs["Color"].default_value = (0.002, 0.005, 0.011, 1.0)
    background.inputs["Strength"].default_value = 0.12


def create_review_rig(scene, collection, asset_key: str, target: Vector):
    configure_render_scene(scene, asset_key)
    camera_data = bpy.data.cameras.new(f"PQ022_{asset_key}_ReviewCamera_Data")
    camera_data.lens = 50.0
    camera_data.sensor_width = 36.0
    camera_data.clip_start = 0.05
    camera_data.clip_end = 500.0
    camera = bpy.data.objects.new(f"PQ022_{asset_key}_ReviewCamera", camera_data)
    collection.objects.link(camera)
    scene.camera = camera

    if asset_key == "place_nav_buoy":
        offsets = (
            ("Key", (-8.0, -10.0, 12.0), (1.0, 0.91, 0.78), 2300.0, 7.0),
            ("Fill", (9.0, -5.0, 5.0), (0.55, 0.78, 1.0), 1500.0, 8.0),
            ("Rim", (-2.0, 10.0, 8.0), (0.50, 0.70, 1.0), 2100.0, 6.0),
        )
    else:
        offsets = (
            ("Key", (-7.0, -9.0, 8.0), (1.0, 0.91, 0.79), 2400.0, 8.0),
            ("Fill", (10.0, -3.0, 5.0), (0.58, 0.79, 1.0), 1650.0, 9.0),
            ("Rim", (3.0, 10.0, 6.0), (0.50, 0.70, 1.0), 2300.0, 7.0),
        )
    lights = {}
    for suffix, offset, color, energy, size in offsets:
        name = f"PQ022_{asset_key}_{suffix}"
        data = bpy.data.lights.new(f"{name}_Data", type="AREA")
        data.energy = energy
        data.color = color
        data.shape = "DISK"
        data.size = size
        light = bpy.data.objects.new(name, data)
        collection.objects.link(light)
        light.location = target + Vector(offset)
        look_at(light, target)
        lights[suffix.lower()] = light
    sun_data = bpy.data.lights.new(f"PQ022_{asset_key}_Sun_Data", type="SUN")
    sun_data.energy = 1.0
    sun_data.color = (0.58, 0.72, 1.0)
    sun = bpy.data.objects.new(f"PQ022_{asset_key}_Sun", sun_data)
    collection.objects.link(sun)
    sun.rotation_euler = (math.radians(36), math.radians(-18), math.radians(-40))
    lights["sun"] = sun
    return camera, lights


def set_lod_visibility(lod: int) -> list[object]:
    visible = []
    for obj in bpy.data.objects:
        if obj.type != "MESH" or not obj.name.startswith("LOD"):
            continue
        is_visible = obj.name.startswith(f"LOD{lod}_")
        obj.hide_render = not is_visible
        obj.hide_viewport = not is_visible
        obj.hide_set(not is_visible)
        if is_visible:
            visible.append(obj)
    if not visible:
        raise RuntimeError(f"exact-source review has no LOD{lod} meshes")
    return visible


def render_view(scene, camera, output: Path, name: str, direction, distance: float,
                target, lod: int, purpose: str, lens=50.0, resolution=(1600, 900)) -> dict:
    set_lod_visibility(lod)
    target_v = Vector(target)
    camera.data.lens = lens
    camera.location = target_v + Vector(direction).normalized() * distance
    look_at(camera, target_v)
    scene.render.resolution_x = resolution[0]
    scene.render.resolution_y = resolution[1]
    scene.render.resolution_percentage = 100
    output.parent.mkdir(parents=True, exist_ok=True)
    scene.render.filepath = str(output)
    bpy.ops.render.render(write_still=True)
    return {
        "name": name,
        "path": rel(output),
        "sha256": sha256(output),
        "bytes": output.stat().st_size,
        "resolution": list(resolution),
        "lod": f"lod{lod}",
        "purpose": purpose,
        "cameraPosition": [round(float(value), 5) for value in camera.location],
        "cameraTarget": [round(float(value), 5) for value in target_v],
        "cameraDistanceM": distance,
        "lensMm": lens,
    }


def emission_strengths_zeroed():
    records = []
    for material in bpy.data.materials:
        if not material.use_nodes:
            continue
        shader = material.node_tree.nodes.get("Principled BSDF")
        if shader is None or "Emission Strength" not in shader.inputs:
            continue
        input_socket = shader.inputs["Emission Strength"]
        records.append((input_socket, input_socket.default_value))
        input_socket.default_value = 0.0
    return records


def restore_emission(records) -> None:
    for input_socket, value in records:
        input_socket.default_value = value


def apply_material_id_override(objects: list[object], config: dict):
    palette = (
        (0.95, 0.10, 0.08, 1.0),
        (0.08, 0.75, 0.98, 1.0),
        (0.18, 0.92, 0.24, 1.0),
        (0.92, 0.16, 0.82, 1.0),
        (1.0, 0.64, 0.04, 1.0),
    )
    overrides = {}
    for material_name, color in zip(config["materials"], palette):
        material = bpy.data.materials.new(f"DIAGNOSTIC_ID_{material_name}")
        material.use_nodes = True
        shader = material.node_tree.nodes.get("Principled BSDF")
        shader.inputs["Base Color"].default_value = color
        shader.inputs["Metallic"].default_value = 0.0
        shader.inputs["Roughness"].default_value = 0.72
        shader.inputs["Emission Color"].default_value = color
        shader.inputs["Emission Strength"].default_value = 0.35
        overrides[material_name] = material
    originals = []
    for obj in objects:
        if not obj.data.materials:
            continue
        original = obj.data.materials[0]
        originals.append((obj, original))
        obj.data.materials[0] = overrides[original.name]
    return originals, list(overrides.values())


def restore_materials(records, diagnostic_materials) -> None:
    for obj, material in records:
        obj.data.materials[0] = material
    for material in diagnostic_materials:
        bpy.data.materials.remove(material, do_unlink=True)


def set_grazing_light(lights: dict, target: Vector, asset_key: str):
    records = []
    for light in lights.values():
        records.append((light, float(light.data.energy), light.location.copy(), light.rotation_euler.copy()))
        light.data.energy = 0.0
    key = lights["key"]
    key.data.energy = 2600.0
    key.data.size = 3.0
    if asset_key == "place_nav_buoy":
        key.location = target + Vector((-8.0, -4.0, -1.0))
    else:
        key.location = target + Vector((-18.0, -3.2, 1.7))
    look_at(key, target)
    return records


def restore_lights(records) -> None:
    for light, energy, location, rotation in records:
        light.data.energy = energy
        light.location = location
        light.rotation_euler = rotation


def compose_contact_sheet(panel_paths: list[Path], output: Path) -> None:
    if len(panel_paths) != 4:
        raise RuntimeError("contact sheet requires exactly four panels")
    panel_width, panel_height = 800, 450
    width, height = panel_width * 2, panel_height * 2
    pixels = array("f", [0.0]) * (width * height * 4)
    placements = ((0, panel_height), (panel_width, panel_height), (0, 0), (panel_width, 0))
    loaded = []
    try:
        for panel_path, (offset_x, offset_y) in zip(panel_paths, placements):
            image = bpy.data.images.load(str(panel_path), check_existing=False)
            loaded.append(image)
            if tuple(image.size) != (panel_width, panel_height):
                raise RuntimeError(f"contact panel resolution drift: {panel_path} -> {tuple(image.size)}")
            source = array("f", [0.0]) * (panel_width * panel_height * 4)
            image.pixels.foreach_get(source)
            stride = panel_width * 4
            for row in range(panel_height):
                source_start = row * stride
                target_start = ((offset_y + row) * width + offset_x) * 4
                pixels[target_start:target_start + stride] = source[source_start:source_start + stride]
        # Neutral dividers keep the four azimuths visually distinct without modifying source pixels.
        for x in range(width):
            for y in range(panel_height - 2, panel_height + 2):
                index = (y * width + x) * 4
                pixels[index:index + 4] = array("f", (0.10, 0.13, 0.16, 1.0))
        for y in range(height):
            for x in range(panel_width - 2, panel_width + 2):
                index = (y * width + x) * 4
                pixels[index:index + 4] = array("f", (0.10, 0.13, 0.16, 1.0))
        sheet = bpy.data.images.new("PQ022_Buoy_Azimuth_Contact_Sheet", width=width, height=height, alpha=True)
        loaded.append(sheet)
        sheet.pixels.foreach_set(pixels)
        sheet.filepath_raw = str(output)
        sheet.file_format = "PNG"
        sheet.save()
    finally:
        for image in loaded:
            if image.name in bpy.data.images:
                bpy.data.images.remove(image, do_unlink=True)


def render_exact_source(asset_key: str, config: dict, candidate_hash: str) -> dict:
    reset_scene()
    bpy.ops.import_scene.gltf(filepath=str(candidate_path(asset_key)))
    scene = bpy.context.scene
    review_collection = ensure_collection(f"PQ022_{asset_key}_EXACT_SOURCE_REVIEW")
    lod0 = set_lod_visibility(0)
    minimum, maximum, dimensions = object_bounds(lod0)
    expected_minimum, expected_maximum = blender_min_max(config)
    assert_vector(minimum, expected_minimum, f"{asset_key}: exact-source Blender minimum", 1e-3)
    assert_vector(maximum, expected_maximum, f"{asset_key}: exact-source Blender maximum", 1e-3)
    target = (minimum + maximum) * 0.5
    camera, lights = create_review_rig(scene, review_collection, asset_key, target)
    output_root = RENDER_ROOT / asset_key
    output_root.mkdir(parents=True, exist_ok=True)
    images = []

    if asset_key == "place_station_billboard":
        primary = ((0.55, -1.0, 0.34), 26.5, target)
        views = (
            ("front_three_quarter", primary[0], primary[1], primary[2], 0, "dominant information face and load frame"),
            ("rear_three_quarter", (-0.48, 1.0, 0.38), 26.5, target, 0, "rear service trunks, backplate, and load path"),
        )
        lod1_distance, lod2_distance = 26.5, 48.0
    elif asset_key == "place_memorial_array":
        primary = ((0.48, -1.0, 0.30), 26.5, target)
        views = (
            ("face_count", (0.0, -1.0, 0.04), 25.0, target, 0, "direct count of twenty-four physical memorial lights"),
            ("front_three_quarter", primary[0], primary[1], primary[2], 0, "whole-asset memorial hierarchy"),
            ("rear_service_three_quarter", (-0.42, 1.0, 0.36), 26.5, target, 0, "rear service access and plinth support"),
            ("end_load_path", (-1.0, -0.30, 0.24), 9.2, (-0.65, 0.0, 0.15), 0, "recovered-hull end shoe and frame load path"),
            ("top", (0.0, -0.10, 1.0), 25.0, target, 0, "top silhouette and service depth"),
        )
        lod1_distance, lod2_distance = 26.5, 48.0
    else:
        primary = ((0.86, -1.0, 0.24), 45.0, target)
        views = (
            ("full_three_quarter", primary[0], primary[1], primary[2], 0, "full stabilizer-spine-head hierarchy"),
            ("service_side", (1.0, -0.24, 0.16), 45.0, target, 0, "offset service trunk, marking, and power path"),
            ("top_head", (0.50, -0.62, 0.78), 9.5, (0.0, 0.0, 7.0), 0, "navigation head, apertures, mast, and vanes"),
            ("stabilization_close", (1.0, -1.0, 0.0), 9.5, (0.0, 0.0, -3.775), 0, "zero-g reaction wheels, gimbals, dampers, and clearance"),
        )
        lod1_distance, lod2_distance = 27.2, 52.0

    for name, direction, distance, view_target, lod, purpose in views:
        images.append(render_view(
            scene, camera, output_root / f"{name}.png", name, direction, distance,
            view_target, lod, purpose,
        ))

    # Same source, camera, and lights as the principal beauty view; only emission strength changes.
    emission_records = emission_strengths_zeroed()
    emissive_name = (
        "front_three_quarter_emissive_off" if asset_key != "place_nav_buoy"
        else "full_three_quarter_emissive_off"
    )
    images.append(render_view(
        scene, camera, output_root / f"{emissive_name}.png", emissive_name,
        primary[0], primary[1], primary[2], 0,
        "matched diagnostic with only authored emission strength disabled",
    ))
    restore_emission(emission_records)

    visible = set_lod_visibility(0)
    material_records, diagnostic_materials = apply_material_id_override(visible, config)
    images.append(render_view(
        scene, camera, output_root / "material_id.png", "material_id",
        primary[0], primary[1], primary[2], 0,
        "diagnostic five-zone material assignment override",
    ))
    restore_materials(material_records, diagnostic_materials)

    light_records = set_grazing_light(lights, target, asset_key)
    images.append(render_view(
        scene, camera, output_root / "grazing_light.png", "grazing_light",
        primary[0], primary[1], primary[2], 0,
        "single hard grazing-light surface and edge diagnostic",
    ))
    restore_lights(light_records)

    lod1_name = "lod1_27_2m" if asset_key == "place_nav_buoy" else "lod1_26_5m"
    images.append(render_view(
        scene, camera, output_root / f"{lod1_name}.png", lod1_name,
        primary[0], lod1_distance, primary[2], 1,
        f"LOD1 readability at exact {lod1_distance:.1f} metre camera distance",
        lens=29.0 if asset_key == "place_nav_buoy" else 50.0,
    ))
    images.append(render_view(
        scene, camera, output_root / "lod2_far.png", "lod2_far",
        primary[0], lod2_distance, primary[2], 2,
        "far-range LOD2 silhouette and anchor diagnostic",
    ))

    contact_sheet = None
    if asset_key == "place_nav_buoy":
        panel_root = output_root / ".azimuth_panels"
        panel_root.mkdir(parents=True, exist_ok=True)
        panel_specs = (
            ("fore", (1.0, 0.0, 0.08)),
            ("aft", (-1.0, 0.0, 0.08)),
            ("port", (0.0, -1.0, 0.08)),
            ("starboard", (0.0, 1.0, 0.08)),
        )
        panels = []
        panel_records = []
        for label, direction in panel_specs:
            path = panel_root / f"{label}.png"
            panel_records.append(render_view(
                scene, camera, path, f"head_{label}", direction, 6.2,
                (0.0, 0.0, 7.05), 0, f"{label} navigation-head azimuth",
                lens=58.0, resolution=(800, 450),
            ))
            panels.append(path)
        contact_path = output_root / "head_azimuth_contact_sheet.png"
        compose_contact_sheet(panels, contact_path)
        contact_sheet = {
            "name": "head_azimuth_contact_sheet",
            "path": rel(contact_path),
            "sha256": sha256(contact_path),
            "bytes": contact_path.stat().st_size,
            "resolution": [1600, 900],
            "lod": "lod0",
            "purpose": "four-azimuth navigation-head coverage from exact-source panels",
            "panelOrder": ["top-left:fore", "top-right:aft", "bottom-left:port", "bottom-right:starboard"],
            "panelCameras": panel_records,
            "diagnosticDividerOnly": True,
        }
        images.append(contact_sheet)
        for path in panels:
            path.unlink(missing_ok=True)
        try:
            panel_root.rmdir()
        except OSError:
            pass

    scene.render.resolution_x = 1600
    scene.render.resolution_y = 900
    set_lod_visibility(0)
    expected_order = {
        "place_station_billboard": [
            "front_three_quarter", "rear_three_quarter", "front_three_quarter_emissive_off",
            "material_id", "grazing_light", "lod1_26_5m", "lod2_far",
        ],
        "place_memorial_array": [
            "face_count", "front_three_quarter", "rear_service_three_quarter", "end_load_path",
            "top", "front_three_quarter_emissive_off", "material_id", "grazing_light",
            "lod1_26_5m", "lod2_far",
        ],
        "place_nav_buoy": [
            "full_three_quarter", "service_side", "top_head", "head_azimuth_contact_sheet",
            "stabilization_close", "full_three_quarter_emissive_off", "material_id",
            "grazing_light", "lod1_27_2m", "lod2_far",
        ],
    }[asset_key]
    image_by_name = {record["name"]: record for record in images}
    if set(image_by_name) != set(expected_order):
        raise RuntimeError(f"{asset_key}: exact-source view set drifted: {sorted(set(image_by_name) ^ set(expected_order))}")
    images = [image_by_name[name] for name in expected_order]
    return {
        "assetId": asset_key,
        "partId": asset_key,
        "spacefaceAssetId": config["asset_id"],
        "candidateId": config["candidate_id"],
        "source": identity(candidate_path(asset_key)),
        "sourceSha256": candidate_hash,
        "exactSourceReimport": True,
        "renderer": "BLENDER_EEVEE",
        "blenderVersion": bpy.app.version_string,
        "resolution": [1600, 900],
        "viewTransform": scene.view_settings.view_transform,
        "look": scene.view_settings.look,
        "exposure": scene.view_settings.exposure,
        "images": images,
        "emissiveOff": {
            "path": next(record["path"] for record in images if record["name"].endswith("emissive_off")),
            "onlyEmissionStrengthChanged": True,
        },
        "lod0ImportedBoundsBlender": {
            "min": [round(float(value), 6) for value in minimum],
            "max": [round(float(value), 6) for value in maximum],
            "size": [round(float(value), 6) for value in dimensions],
        },
        "materialIdOverrideIsDiagnosticOnly": True,
        "grazingLightChangesLightingOnly": True,
        "emissiveOffChangesEmissionStrengthOnly": True,
        "contactSheet": contact_sheet,
    }


def baseline_record(config: dict) -> dict:
    result = {}
    if config.get("baseline_source"):
        result["source"] = identity(config["baseline_source"])
    if config.get("baseline_release"):
        result["release"] = identity(config["baseline_release"])
    if config.get("predecessor_representation"):
        result["predecessorRepresentation"] = identity(config["predecessor_representation"])
    return result


def texture_records(asset_key: str, config: dict, texture_files: dict) -> list[dict]:
    result = []
    for material_name in config["materials"]:
        for map_name, path in texture_files[material_name].items():
            result.append({
                "material": material_name,
                "role": config["material_roles"][material_name],
                "map": map_name,
                "path": rel(path),
                "resolution": [256, 256],
                "sha256": sha256(path),
                "bytes": path.stat().st_size,
            })
    return result


def create_preflight_materials(config: dict) -> dict[str, object]:
    """Create material placeholders without images or filesystem writes."""
    result = {}
    for name in config["materials"]:
        material = bpy.data.materials.new(name)
        material.diffuse_color = (*MATERIAL_TUNING[name][0], 1.0)
        result[name] = material
    return result


def preflight_all_geometry() -> dict:
    """Evaluate every asset before the build is permitted to write candidate evidence."""
    failures = []
    records = []
    geometry_builders = {
        "display": display_geometry,
        "memorial": memorial_geometry,
        "buoy": buoy_geometry,
    }
    for asset_key, config in ASSETS.items():
        record = {"partId": asset_key, "pass": True, "lods": {}, "envelope": None, "failures": []}
        try:
            reset_scene()
            scene = bpy.context.scene
            scene.unit_settings.system = "METRIC"
            scene.unit_settings.scale_length = 1.0
            collection = ensure_collection(f"PQ022_{asset_key}_GEOMETRY_PREFLIGHT")
            materials = create_preflight_materials(config)
            root = bpy.data.objects.new(config["root"], None)
            collection.objects.link(root)
            builder = geometry_builders[config["build"]]
            for lod in range(3):
                builder(collection, materials, lod)

            all_groups = []
            for lod in range(3):
                groups, _topology = join_draw_groups(collection, materials, lod, root, config["materials"])
                all_groups.extend(groups)
                per_material = {
                    obj.data.materials[0].name: len(obj.data.polygons)
                    for obj in groups
                }
                total = sum(per_material.values())
                record["lods"][f"LOD{lod}"] = {
                    "triangles": total,
                    "ceiling": LOD_CEILINGS[lod],
                    "perMaterial": per_material,
                }
                if total > LOD_CEILINGS[lod]:
                    record["failures"].append(
                        f"LOD{lod} triangle ceiling exceeded: {total} > {LOD_CEILINGS[lod]}"
                    )

            totals = [record["lods"][f"LOD{lod}"]["triangles"] for lod in range(3)]
            if not (totals[0] > totals[1] > totals[2]):
                record["failures"].append(f"LOD reduction is not strict: {totals}")
            lod0 = [obj for obj in all_groups if obj.name.startswith("LOD0_")]
            minimum, maximum, dimensions = object_bounds(lod0)
            expected_minimum, expected_maximum = blender_min_max(config)
            record["envelope"] = {
                "min": [float(value) for value in minimum],
                "max": [float(value) for value in maximum],
                "size": [float(value) for value in dimensions],
                "expectedMin": list(expected_minimum),
                "expectedMax": list(expected_maximum),
            }
            if any(abs(float(actual) - float(expected)) > 1e-3
                   for actual, expected in zip(minimum, expected_minimum)):
                record["failures"].append(
                    f"LOD0 Blender minimum drift: {[float(value) for value in minimum]} != {list(expected_minimum)}"
                )
            if any(abs(float(actual) - float(expected)) > 1e-3
                   for actual, expected in zip(maximum, expected_maximum)):
                record["failures"].append(
                    f"LOD0 Blender maximum drift: {[float(value) for value in maximum]} != {list(expected_maximum)}"
                )
        except Exception as error:
            record["failures"].append(f"geometry evaluation error: {error}")
        record["pass"] = not record["failures"]
        if not record["pass"]:
            failures.append({"partId": asset_key, "failures": record["failures"]})
        records.append(record)
    if failures:
        raise RuntimeError(
            "all-three geometry preflight failed before candidate/export/render writes: "
            + json.dumps(failures, separators=(",", ":"))
        )
    return {
        "pass": True,
        "failures": [],
        "assetCount": len(records),
        "assets": records,
        "candidateExportRenderWritesBeforePass": False,
    }


def build_asset(asset_key: str, config: dict) -> dict:
    asset_started = time.time()
    texture_files = create_texture_files(asset_key, config)
    reset_scene()
    scene = bpy.context.scene
    scene.unit_settings.system = "METRIC"
    scene.unit_settings.scale_length = 1.0
    scene["spaceface.authoringAxes"] = "Blender X forward / Y starboard / Z up"
    scene["spaceface.exportAxes"] = "glTF X forward / Y up / Z starboard"
    collection = ensure_collection(f"PQ022_{asset_key}_CANDIDATE")
    preview_collection = ensure_collection(f"PQ022_{asset_key}_PREVIEW_RIG")
    materials = create_materials(config, texture_files)

    root = bpy.data.objects.new(config["root"], None)
    root.empty_display_type = "CUBE"
    root.empty_display_size = 0.8
    collection.objects.link(root)
    root["spaceface.assetId"] = config["asset_id"]
    root["spaceface.partId"] = asset_key
    root["spaceface.role"] = config["role"]
    root["spaceface.candidateId"] = config["candidate_id"]
    root["spaceface.wiringStatus"] = "isolated_candidate"
    root["spaceface.builder"] = SOURCE_GENERATOR

    geometry_builder = {
        "display": display_geometry,
        "memorial": memorial_geometry,
        "buoy": buoy_geometry,
    }[config["build"]]
    for lod in range(3):
        geometry_builder(collection, materials, lod)

    draw_groups = []
    topology_report = {}
    lod_report = {}
    for lod in range(3):
        groups, group_topology = join_draw_groups(collection, materials, lod, root, config["materials"])
        triangles = sum(len(obj.data.polygons) for obj in groups)
        if triangles > LOD_CEILINGS[lod]:
            raise RuntimeError(f"{asset_key}: Blender LOD{lod} ceiling exceeded before export/render: {triangles} > {LOD_CEILINGS[lod]}")
        draw_groups.extend(groups)
        topology_report.update(group_topology)
        lod_report[f"lod{lod}"] = {
            "triangles": triangles,
            "ceiling": LOD_CEILINGS[lod],
            "drawGroups": len(groups),
            "materials": [obj.data.materials[0].name for obj in groups],
        }
    if not (lod_report["lod0"]["triangles"] > lod_report["lod1"]["triangles"] > lod_report["lod2"]["triangles"]):
        raise RuntimeError(f"{asset_key}: Blender LOD reduction is not strict before export/render: {lod_report}")

    collision = make_collision_helper(collection, root, config)
    socket = make_socket(collection, root)
    bpy.context.view_layer.update()
    lod0 = [obj for obj in draw_groups if obj.name.startswith("LOD0_")]
    minimum, maximum, dimensions = object_bounds(lod0)
    expected_minimum, expected_maximum = blender_min_max(config)
    assert_vector(minimum, expected_minimum, f"{asset_key}: LOD0 Blender minimum", 1e-3)
    assert_vector(maximum, expected_maximum, f"{asset_key}: LOD0 Blender maximum", 1e-3)

    stamp = {
        "contractVersion": 1,
        "assetId": config["asset_id"],
        "partId": asset_key,
        "liveId": asset_key,
        "slot": "place",
        "forward": "+X",
        "up": "+Y",
        "starboard": "+Z",
        "unit": "metre",
        "normalConvention": "OpenGL",
        "ormChannels": "R=AO,G=Roughness,B=Metallic",
        "textureCompression": "PNG-source",
        "textureSize": 256,
        "triBudget": 3000,
        "chamfered": True,
        "bevelRadiusM": 0.04,
        "packet": PACKET,
        "dispatchUnit": DISPATCH_UNIT,
        "state": "candidate_only",
        "claims": CLAIMS,
        "role": config["role"],
        "title": config["title"],
        "kind": config["kind"],
        "tier": config["tier"],
        "deliverableRole": "production_multi_lod",
        "lods": ["lod0", "lod1", "lod2"],
        "triangleCount": lod_report["lod0"]["triangles"],
        "collisionTriangleCount": 0,
        "lodTriangles": {key: value["triangles"] for key, value in lod_report.items()},
        "drawGroupsPerLod": {key: value["drawGroups"] for key, value in lod_report.items()},
        "wiringStatus": "isolated_candidate",
        "candidateId": config["candidate_id"],
        "revisionPass": "navigation_infrastructure_material_truth_v2",
        "sourceGenerator": SOURCE_GENERATOR,
        "sourceGeneratorSha256": sha256(Path(__file__).resolve()),
        "sourceGeneratorBytes": Path(__file__).resolve().stat().st_size,
        "sourceBlenderVersion": bpy.app.version_string,
        "authoringAxes": "X forward / Y starboard / Z up",
        "processChain": PROCESS_CHAIN,
        "wiring": {
            "partId": asset_key,
            "slot": "place",
            "rootNode": config["root"],
            "sockets": ["SOCKET_Structure_Core"],
        },
        "materials": list(config["materials"]),
        "materialRoles": config["material_roles"],
        "lod0AabbSize": [
            config["gltf_max"][index] - config["gltf_min"][index]
            for index in range(3)
        ],
        "collisionBounds": config["collision_runtime_bounds"],
        "collisionCoverageRatio": config["collision_coverage"],
        "collision": {
            "representation": "non_mesh_helper",
            "triangles": 0,
            "translation": list(config["collision_translation_gltf"]),
            "nodeBounds": config["collision_node_bounds"],
            "runtimeBounds": config["collision_runtime_bounds"],
            "coverageRatio": config["collision_coverage"],
        },
    }
    metadata_text = json.dumps(stamp, separators=(",", ":"))
    root["spacefaceAssetJson"] = metadata_text
    scene["spacefaceAssetJson"] = metadata_text

    target = (minimum + maximum) * 0.5
    preview_camera, _lights = create_review_rig(scene, preview_collection, asset_key, target)
    preview_direction = (0.86, -1.0, 0.24) if asset_key == "place_nav_buoy" else (0.52, -1.0, 0.34)
    preview_distance = 45.0 if asset_key == "place_nav_buoy" else 26.5
    preview_camera.location = target + Vector(preview_direction).normalized() * preview_distance
    look_at(preview_camera, target)
    for obj in draw_groups:
        is_lod0 = obj.name.startswith("LOD0_")
        obj.hide_viewport = not is_lod0
        obj.hide_render = not is_lod0
        obj.hide_set(not is_lod0)
    collision.hide_viewport = True
    collision.hide_render = True
    collision.hide_set(True)
    blend_path(asset_key).parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(blend_path(asset_key)))

    export_objects = [root, collision, socket, *draw_groups]
    export_spec = {
        "kind": "landmark" if config["tier"] == "A" else "prop",
        "id": asset_key,
        "assetId": config["asset_id"],
        "slot": "place",
        "tri_budget": None,
        "min_hull_tris": 0,
        "required_maps": ["ao", "roughness"],
        "textureCompression": "PNG-source",
    }
    staging_path(asset_key).parent.mkdir(parents=True, exist_ok=True)
    diagnostics = spaceface_export.export_gltf(str(staging_path(asset_key)), export_spec, export_objects)
    rewrite_glb_metadata(staging_path(asset_key), config, stamp)
    export_audit = inspect_export(staging_path(asset_key), config)
    payload = staging_path(asset_key).read_bytes()
    write_bytes_in_place(candidate_path(asset_key), payload)
    write_bytes_in_place(mirror_path(asset_key), payload)
    staging_path(asset_key).unlink(missing_ok=True)
    if sha256(candidate_path(asset_key)) != sha256(mirror_path(asset_key)):
        raise RuntimeError(f"{asset_key}: candidate mirror is not byte-identical")

    candidate_hash = sha256(candidate_path(asset_key))
    render_record = render_exact_source(asset_key, config, candidate_hash)
    upper_lod_triangles = {
        f"LOD{lod}": export_audit["lodTriangles"][f"lod{lod}"]
        for lod in range(3)
    }
    source_report = {
        "schema": "spaceface.navigationInfrastructureExactSourceReport.v1",
        "packet": PACKET,
        "dispatchUnit": DISPATCH_UNIT,
        "assetId": asset_key,
        "spacefaceAssetId": config["asset_id"],
        "candidateId": config["candidate_id"],
        "partId": asset_key,
        "state": "candidate_only",
        "claims": CLAIMS,
        "baseline": baseline_record(config),
        "candidate": identity(candidate_path(asset_key)),
        "spacefaceCandidate": identity(candidate_path(asset_key)),
        "releaseMirror": identity(mirror_path(asset_key)),
        "blender": identity(blend_path(asset_key)),
        "generator": identity(Path(__file__).resolve()),
        "export": {**export_audit, "diagnostics": diagnostics},
        "exactSourceReimport": True,
        "pass": True,
        "failures": [],
        "warnings": [],
        "facts": {
            "lodTriangles": upper_lod_triangles,
            "materials": list(config["materials"]),
            "textureSize": 256,
            "collisionTriangleCount": 0,
            "collisionContractDigestSha256": config["collision_digest"],
            "envelope": export_audit["gltfEnvelope"],
        },
        "lod": lod_report,
        "topology": topology_report,
        "materials": list(config["materials"]),
        "materialRoles": config["material_roles"],
        "textures": texture_records(asset_key, config, texture_files),
        "renders": {
            "manifest": rel(RENDER_MANIFEST),
            "exactSourceReimport": True,
            "images": render_record["images"],
        },
        "gateBoundary": {
            "candidateSideG0": True,
            "candidateSideG1G2G4Evidence": True,
            "g3DeterministicMaterialSources": True,
            "g5StructuralCostOnly": True,
            "g6RouteOrBrowserEvidence": False,
            "g7IndependentAcceptance": False,
            "promotionAuthorized": False,
        },
        "builtAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "elapsedSeconds": round(time.time() - asset_started, 2),
    }
    json_dump(source_report_path(asset_key), source_report)
    return {
        "assetId": asset_key,
        "spacefaceAssetId": config["asset_id"],
        "candidateId": config["candidate_id"],
        "baseline": source_report["baseline"],
        "candidate": source_report["candidate"],
        "releaseMirror": source_report["releaseMirror"],
        "blender": source_report["blender"],
        "sourceReport": identity(source_report_path(asset_key)),
        "export": export_audit,
        "lod": lod_report,
        "materials": list(config["materials"]),
        "textures": source_report["textures"],
        "render": render_record,
        "elapsedSeconds": source_report["elapsedSeconds"],
        "validatorFacts": source_report["facts"],
    }


def build() -> dict:
    started = time.time()
    geometry_preflight = preflight_all_geometry()
    for path in (SOURCE_ROOT, MIRROR_ROOT, BLEND_ROOT, REPORT_ROOT, TEXTURE_ROOT, RENDER_ROOT, SOURCE_REPORT_ROOT):
        path.mkdir(parents=True, exist_ok=True)
    asset_records = {}
    for asset_key, config in ASSETS.items():
        asset_records[asset_key] = build_asset(asset_key, config)

    render_manifest = {
        "schema": "spaceface.navigationInfrastructureExactSourceRenderManifest.v1",
        "packet": PACKET,
        "dispatchUnit": DISPATCH_UNIT,
        "candidateSetId": CANDIDATE_SET_ID,
        "epoch": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "renderer": "BLENDER_EEVEE",
        "blenderVersion": bpy.app.version_string,
        "oneBoundedBuildEpoch": True,
        "exactSourceReimport": True,
        "resolution": [1600, 900],
        "assets": [record["render"] for record in asset_records.values()],
        "claims": CLAIMS,
    }
    json_dump(RENDER_MANIFEST, render_manifest)

    report = {
        "schema": "spaceface.pq022NavigationInfrastructureBuildReport.v1",
        "packet": PACKET,
        "dispatchUnit": DISPATCH_UNIT,
        "candidateSetId": CANDIDATE_SET_ID,
        "state": "candidate_only",
        "claims": CLAIMS,
        "builtAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "elapsedSeconds": round(time.time() - started, 2),
        "builder": identity(Path(__file__).resolve()),
        "generator": identity(Path(__file__).resolve()),
        "buildAttempts": 5,
        "namedVisualCorrectionAttempts": 2,
        "geometryBudgetCorrectionPasses": 3,
        "namedCorrection": {
            "assetId": "place_station_billboard",
            "defect": "Six tiny status-cell housings inherited two-segment bevels and consumed 1,224 of the measured 3,176 LOD0 triangles.",
            "change": "Removed bevel tessellation only from the recessed status cells and retained ten-sided physical housings.",
            "preserved": [
                "paired information bays",
                "frame and load path",
                "all five semantic materials",
                "frozen envelope and helper contract",
            ],
        },
        "namedVisualCorrection": {
            "assetId": "place_nav_buoy",
            "defect": "The closed stabilizer shoulder shell completely occluded the authored reaction wheels, gimbals, and dampers, while the whole-asset and LOD1 evidence cameras cropped the buoy ends.",
            "change": "Replaced only the closed shoulder shell with an open cruciform yoke and four-strut cage, then widened the exact-source whole-asset framing while preserving the exact LOD1 distance with a 29 mm lens.",
            "preserved": [
                "frozen asset identity, envelope, collision, socket, and navigation head",
                "bottom boss, cardinal yoke extrema, and upper collar interface",
                "reaction wheels, gimbals, dampers, and all five semantic materials",
                "billboard and memorial source geometry and accepted evidence cameras",
            ],
        },
        "preBuildReviewAdjustments": [
            "Lowered the 6-by-4 memorial grid before authoring so all physical bezels remain inside the frozen envelope.",
            "Removed memorial light bevel inflation at LOD0 and LOD1 so the physical count survives within measured ceilings.",
            "Fixed the buoy stabilizer shoulder to an eight-sided cardinal profile so its exact frozen transverse extrema are intentional.",
            "Reduced only the repeated memorial cassette cylinders to eight sides and removed bevels from the two long registry rails after measuring the full per-material cost.",
            "Inserted a zero-file-write all-three geometry preflight so every LOD/material/envelope failure is collected before export or render begins.",
            "Removed bevel amplification only from repeated buoy optics, dampers, service cables, reaction wheels, optic hoods, and mast after the all-three preflight measured their cost.",
            "Removed the same sub-pixel bevel from the paired telemetry vanes to leave deliberate LOD1 headroom; their physical plates and silhouette remain unchanged.",
            "Replaced only the four LOD2 optic cylinders with four axis-aligned physical contact boxes while retaining all azimuths and the optic material role.",
            "Opened the buoy stabilizer shoulder into a cruciform yoke and four-strut cage after exact-source review proved the closed shell hid all stabilization mechanics.",
            "Reframed the buoy whole-asset, service, emissive-off, material-ID, grazing-light, and exact-distance LOD1 evidence to keep both ends visible.",
        ],
        "geometryPreflight": geometry_preflight,
        "assets": [
            {
                "partId": key,
                "candidateId": record["candidateId"],
                "candidate": record["candidate"],
                "releaseMirror": record["releaseMirror"],
                "blender": record["blender"],
                "validatorReport": record["sourceReport"],
                "lodTriangles": record["validatorFacts"]["lodTriangles"],
                "textureSize": 256,
                "collisionTriangleCount": 0,
                "materials": record["materials"],
                "pass": True,
            }
            for key, record in asset_records.items()
        ],
        "assetDetails": asset_records,
        "renderManifest": identity(RENDER_MANIFEST),
        "candidateAssetCount": len(asset_records),
        "canonicalAssetsModified": False,
        "liveRuntimeWiringModified": False,
        "browserOrElectronRun": False,
        "performanceClaim": False,
        "promotionAuthorized": False,
        "pass": True,
        "failures": [],
    }
    json_dump(BUILD_REPORT, report)

    binding = {
        "schema": "spaceface.pq022NavigationInfrastructureCandidateBinding.v1",
        "packet": PACKET,
        "dispatchUnit": DISPATCH_UNIT,
        "candidateSetId": CANDIDATE_SET_ID,
        "state": "candidate_only",
        "claims": CLAIMS,
        "generator": identity(Path(__file__).resolve()),
        "buildReport": identity(BUILD_REPORT),
        "renderManifest": identity(RENDER_MANIFEST),
        "preflight": identity(REPORT_ROOT / "MATERIAL_TRUTH_PREFLIGHT.md"),
        "assets": [
            {
                "partId": key,
                "candidateId": record["candidateId"],
                "spacefaceAssetId": record["spacefaceAssetId"],
                "candidate": record["candidate"],
                "releaseMirror": record["releaseMirror"],
                "blender": record["blender"],
                "validatorReport": record["sourceReport"],
                "visibleGeometrySha256": record["export"]["visibleGeometrySha256"],
                "lodTriangles": record["export"]["lodTriangles"],
                "collisionRepresentation": "non_mesh_helper",
                "collisionTriangles": 0,
                "renderImages": record["render"]["images"],
                "candidateMirrorByteIdentical": record["candidate"]["sha256"] == record["releaseMirror"]["sha256"],
            }
            for key, record in asset_records.items()
        ],
        "allCandidateMirrorsByteIdentical": all(
            record["candidate"]["sha256"] == record["releaseMirror"]["sha256"]
            for record in asset_records.values()
        ),
        "renderEvidence": {
            "path": rel(RENDER_MANIFEST),
            "sha256": sha256(RENDER_MANIFEST),
            "exactSourceReimport": True,
            "viewCount": sum(len(record["render"]["images"]) for record in asset_records.values()),
        },
        "gateBoundary": {
            "candidateEvidenceBound": True,
            "livePromotion": False,
            "routeAcceptance": False,
            "performanceAcceptance": False,
            "independentVisualAcceptance": False,
        },
    }
    json_dump(BINDING_REPORT, binding)

    # Leave the connected app on the unique hero asset in its fully surfaced authoring scene.
    bpy.ops.wm.open_mainfile(filepath=str(blend_path("place_memorial_array")))
    return {
        "ok": True,
        "assets": {
            key: {
                "candidate": record["candidate"],
                "lodTriangles": record["export"]["lodTriangles"],
                "gltfEnvelope": record["export"]["gltfEnvelope"],
                "renderCount": len(record["render"]["images"]),
            }
            for key, record in asset_records.items()
        },
        "buildReport": identity(BUILD_REPORT),
        "renderManifest": identity(RENDER_MANIFEST),
        "binding": identity(BINDING_REPORT),
        "elapsedSeconds": round(time.time() - started, 2),
    }


BUILD_RESULT = None
if __name__ == "__main__":
    BUILD_RESULT = build()
    print(json.dumps(BUILD_RESULT, indent=2))

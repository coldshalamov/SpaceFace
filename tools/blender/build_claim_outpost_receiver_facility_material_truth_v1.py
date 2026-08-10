#!/usr/bin/env python3
"""Build the two isolated PQ-019 receiver-facility material-truth candidates.

This is deliberately not a family builder.  It opens only the frozen base/refinery authoring
Blends, replaces only their LOD presentation meshes, and writes isolated candidate outputs.  It
never enumerates or writes the relay, bastion, family summary, canonical parts, release assets, or
live manifests.
"""
from __future__ import annotations

import hashlib
import importlib.util
import json
import math
import shutil
import subprocess
import sys
from array import array
from pathlib import Path

import bmesh
import bpy
from mathutils import Vector


ROOT = Path(__file__).resolve().parents[2]
HELPERS = ROOT / "tools" / "blender" / "build_station_visual_family.py"
MODULE_SPEC = importlib.util.spec_from_file_location("station_family_helpers", HELPERS)
sf = importlib.util.module_from_spec(MODULE_SPEC)
MODULE_SPEC.loader.exec_module(sf)

ASSET_ROOT = ROOT / "assets" / "ships" / "m5_claim_outposts"
EVIDENCE_ROOT = ASSET_ROOT / "evidence" / "pq019-receivers-material-truth-v1"
PREFLIGHT = EVIDENCE_ROOT / "MATERIAL_TRUTH_PREFLIGHT.md"
BASELINE_MANIFEST = EVIDENCE_ROOT / "baseline-manifest.json"
BUILD_REPORT = EVIDENCE_ROOT / "build-report.json"
CANDIDATE_ID = "receiver_facility_material_truth_v1"
DISPATCH_UNIT = "PQ-019.receiver-facility-reauthor"
UV_STABILIZATION_GRID_DENOMINATOR = 32768
ATTRIBUTE_STABILIZATION = {
    "texcoordGridDenominator": UV_STABILIZATION_GRID_DENOMINATOR,
    "maxTexelDisplacementAt1024": 0.015625,
    "timing": "post_triangulation_pre_save_fresh_process_export",
    "derivedTangents": "exporter_recomputed_from_stabilized_texcoords",
    "sceneNormalization": "save_then_fresh_blender_process_export",
}
MATERIAL_NAMES = (
    "Material_Hull",
    "Material_Mechanical",
    "Material_Accent",
    "Material_Glass",
    "Material_Warm",
)
SOCKET_NAMES = (
    "SOCKET_Structure_Core",
    "SOCKET_Dock_Approach",
    "SOCKET_Emissive",
    "SOCKET_Module_Depot",
    "SOCKET_Module_Refinery",
    "SOCKET_Module_Defense",
    "SOCKET_Module_Teleporter",
)
TARGET_ORDER = (
    "place_claim_outpost_base",
    "place_claim_outpost_refinery",
)

TARGETS = {
    "place_claim_outpost_base": {
        "assetId": "SF_PLACE_CLAIM_OUTPOST_BASE",
        "root": "SF_PLACE_CLAIM_OUTPOST_BASE_ROOT",
        "collection": "PLACE_CLAIM_OUTPOST_BASE",
        "role": "claim_base",
        "title": "Claim Anchor",
        "aabb": {
            "min": (-47.0226, -17.6696, -47.0226),
            "max": (55.5, 12.5, 47.0226),
            "size": (102.5226, 30.1696, 94.0452),
        },
        "visualCenterXZ": {"x": 4.2387, "z": 0.0},
        # Lawful catcher: institutional cool shell, steel mechanism, restrained liner, readable without emission.
        "materialProfiles": {
            "Material_Hull": ((0.50, 0.56, 0.62), 0.04, 0.52, "rolled_coating", 11),
            "Material_Mechanical": ((0.30, 0.34, 0.38), 0.88, 0.28, "machined_alloy", 17),
            "Material_Accent": ((0.10, 0.46, 0.56), 0.02, 0.46, "capture_liner", 23),
            "Material_Glass": ((0.04, 0.11, 0.15), 0.00, 0.14, "smoked_optic", 29),
            "Material_Warm": ((0.64, 0.38, 0.14), 0.10, 0.42, "damped_contact", 31),
        },
    },
    "place_claim_outpost_refinery": {
        "assetId": "SF_PLACE_CLAIM_OUTPOST_REFINERY",
        "root": "SF_PLACE_CLAIM_OUTPOST_REFINERY_ROOT",
        "collection": "PLACE_CLAIM_OUTPOST_REFINERY",
        "role": "spec_refinery",
        "title": "Industrial Refinery Claim",
        "aabb": {
            "min": (-50.8652, -17.6696, -50.8652),
            "max": (55.5, 30.93, 47.0226),
            "size": (106.3652, 48.5996, 97.8878),
        },
        "visualCenterXZ": {"x": 2.3174, "z": -1.9213},
        # Covert fence: charcoal guarded plates, warmer worked alloy, ochre service plates — not a recolor of catcher.
        "materialProfiles": {
            "Material_Hull": ((0.16, 0.18, 0.17), 0.05, 0.68, "guarded_plate", 41),
            "Material_Mechanical": ((0.40, 0.34, 0.26), 0.84, 0.34, "worked_alloy", 43),
            "Material_Accent": ((0.46, 0.36, 0.16), 0.03, 0.50, "service_plate", 47),
            "Material_Glass": ((0.05, 0.06, 0.05), 0.00, 0.18, "smoked_optic", 53),
            "Material_Warm": ((0.58, 0.30, 0.10), 0.20, 0.46, "transfer_interface", 59),
        },
    },
}


def repo_path(path: Path) -> str:
    return str(path.relative_to(ROOT)).replace("\\", "/")


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest().lower()


def file_identity(path: Path) -> dict:
    if not path.is_file():
        raise FileNotFoundError(path)
    return {"path": repo_path(path), "bytes": path.stat().st_size, "sha256": sha256(path)}


def candidate_paths(asset_id: str) -> dict[str, Path]:
    return {
        "canonicalBlend": ASSET_ROOT / "blender" / f"{asset_id}.blend",
        "candidateBlend": ASSET_ROOT / "blender" / f"{asset_id}_{CANDIDATE_ID}.blend",
        "sourceCandidate": ASSET_ROOT / "source_candidates" / CANDIDATE_ID / "places" / f"{asset_id}.glb",
        "releaseCandidate": ASSET_ROOT / "release_candidates" / CANDIDATE_ID / "places" / f"{asset_id}.glb",
    }


def require_preflight_and_baseline() -> tuple[dict, dict]:
    if not PREFLIGHT.is_file() or not BASELINE_MANIFEST.is_file():
        raise RuntimeError("PQ-019 material-truth preflight and baseline manifest are required")
    baseline = json.loads(BASELINE_MANIFEST.read_text(encoding="utf-8"))
    if baseline.get("schema") != "spaceface.pq019ReceiverFacilityBaseline.v1":
        raise RuntimeError("unsupported PQ-019 receiver baseline schema")
    targets = baseline.get("targets")
    if not isinstance(targets, dict) or tuple(targets) != TARGET_ORDER:
        raise RuntimeError("baseline must bind exactly base then refinery and no other asset")
    for asset_id in TARGET_ORDER:
        expected = TARGETS[asset_id]
        row = targets[asset_id]
        for key in ("min", "max", "size"):
            if tuple(row.get("aabb", {}).get(key, ())) != expected["aabb"][key]:
                raise RuntimeError(f"{asset_id}: baseline AABB {key} drift")
        for key in ("blend", "packetSource", "canonicalSource", "evidence"):
            identity = row.get(key)
            if not isinstance(identity, dict):
                raise RuntimeError(f"{asset_id}: missing baseline {key}")
            path = ROOT / identity["path"]
            actual = file_identity(path)
            if actual["bytes"] != identity["bytes"] or actual["sha256"] != identity["sha256"]:
                raise RuntimeError(f"{asset_id}: frozen baseline {key} changed")
    helper_identity = baseline.get("candidateToolchain", {}).get("stationVisualFamily")
    if not isinstance(helper_identity, dict) or helper_identity.get("path") != repo_path(HELPERS):
        raise RuntimeError("receiver candidate baseline must bind the station visual-family helper")
    actual_helper = file_identity(HELPERS)
    if (actual_helper["bytes"] != helper_identity.get("bytes")
            or actual_helper["sha256"] != helper_identity.get("sha256")):
        raise RuntimeError("receiver candidate station visual-family helper changed")
    return baseline, {
        "preflight": file_identity(PREFLIGHT),
        "baselineManifest": file_identity(BASELINE_MANIFEST),
        "stationVisualFamily": actual_helper,
    }


def json_value(value):
    if isinstance(value, (str, int, float, bool)) or value is None:
        return value
    if hasattr(value, "to_list"):
        return json_value(value.to_list())
    if isinstance(value, dict) or hasattr(value, "items"):
        return {str(key): json_value(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)) or hasattr(value, "__iter__"):
        return [json_value(item) for item in value]
    return str(value)


def matrix_values(obj) -> list[float]:
    return [round(value, 9) for row in obj.matrix_local for value in row]


def evaluated_mesh_contract(obj) -> dict | None:
    if obj.type != "MESH":
        return None
    depsgraph = bpy.context.evaluated_depsgraph_get()
    evaluated = obj.evaluated_get(depsgraph)
    mesh = evaluated.to_mesh()
    try:
        return {
            "vertices": [[round(value, 9) for value in vertex.co] for vertex in mesh.vertices],
            "polygons": [list(polygon.vertices) for polygon in mesh.polygons],
            "triangles": sum(max(0, len(polygon.vertices) - 2) for polygon in mesh.polygons),
        }
    finally:
        evaluated.to_mesh_clear()


def object_contract(obj, *, root=False) -> dict:
    ignored = {"spacefaceAssetJson", "spaceface.candidateId", "spaceface.builder"} if root else set()
    return {
        "type": obj.type,
        "parent": obj.parent.name if obj.parent else None,
        "matrixLocal": matrix_values(obj),
        "properties": {
            key: json_value(obj[key]) for key in sorted(obj.keys()) if key not in ignored
        },
        "materials": [material.name for material in obj.data.materials] if obj.type == "MESH" else [],
        "mesh": evaluated_mesh_contract(obj),
    }


def frozen_contract(spec: dict) -> dict:
    names = (spec["root"], "COLLISION_HULL", *SOCKET_NAMES)
    missing = [name for name in names if bpy.data.objects.get(name) is None]
    if missing:
        raise RuntimeError(f"missing frozen contract objects: {missing}")
    return {
        name: object_contract(bpy.data.objects[name], root=name == spec["root"])
        for name in names
    }


def assert_frozen(before: dict, spec: dict) -> None:
    after = frozen_contract(spec)
    if before != after:
        changed = [name for name in before if before[name] != after.get(name)]
        raise RuntimeError(f"frozen root/socket/collision contract mutated: {changed}")


def move_to(obj, collection) -> None:
    for previous in list(obj.users_collection):
        previous.objects.unlink(obj)
    collection.objects.link(obj)


def generated_map(name: str, colorspace: str, pixel) -> tuple[object, str]:
    preview_size = 256
    image = bpy.data.images.new(name, width=preview_size, height=preview_size, alpha=True)
    image.colorspace_settings.name = colorspace
    pixels = array("f")
    for y in range(preview_size):
        v = y / preview_size
        for x in range(preview_size):
            pixels.extend(pixel(x / preview_size, v))
    pixel_hash = hashlib.sha256(pixels.tobytes()).hexdigest()
    image.pixels.foreach_set(pixels)
    image.update()
    image.scale(1024, 1024)
    image.pack()
    image["spaceface.pixelSha256"] = pixel_hash
    return image, pixel_hash


def material_maps(asset_id: str, name: str, profile: tuple) -> dict:
    color, metallic, roughness, grammar, seed = profile

    def base_pixel(u, v):
        # Directional manufacture, not flat tint: panel seams, tool paths, and localized service wear.
        if grammar in {"machined_alloy", "worked_alloy"}:
            tool = 0.045 * math.sin(math.tau * (u * (22 + seed % 7) + v * 0.28))
            band = 0.018 * math.sin(math.tau * (v * 3.2 + seed * 0.029))
            wear = 0.012 * max(0.0, math.sin(math.tau * (u * 2.4 + v * 1.1 + seed * 0.02)))
            variation = tool + band + wear
        elif grammar == "rolled_coating":
            panel = 0.040 * math.sin(math.tau * (u * 1.15 + seed * 0.013))
            seam = 0.028 * math.cos(math.tau * (v * 2.8 - seed * 0.009))
            patch = 0.016 * max(0.0, math.sin(math.tau * (u * 4.0 + v * 0.7)))
            variation = panel + seam + patch
        elif grammar == "guarded_plate":
            panel = 0.034 * math.sin(math.tau * (u * 0.95 + seed * 0.015))
            scrape = 0.022 * math.cos(math.tau * (v * 3.4 - u * 0.5 + seed * 0.01))
            soot = -0.018 * max(0.0, math.sin(math.tau * (u * 1.6 + v * 2.1)))
            variation = panel + scrape + soot
        elif grammar in {"capture_liner", "service_plate"}:
            stripe = 0.030 * math.cos(math.tau * (u * 6.0 + v * 0.4 + seed * 0.017))
            edge = 0.018 * math.sin(math.tau * (v * 5.0 + seed * 0.011))
            variation = stripe + edge
        elif grammar in {"damped_contact", "transfer_interface"}:
            polish = 0.040 * math.sin(math.tau * (u * 3.6 + v * 1.5 + seed * 0.012))
            heat = 0.020 * math.cos(math.tau * (v * 2.0 - u * 0.8))
            variation = polish + heat
        else:
            variation = 0.012 * math.cos(math.tau * (u * 1.1 + v * 0.7))
        factor = max(0.78, min(1.18, 1.0 + variation))
        return tuple(min(1.0, channel * factor) for channel in color) + (1.0,)

    def orm_pixel(u, v):
        if grammar in {"machined_alloy", "worked_alloy"}:
            delta = 0.048 * math.sin(math.tau * (u * 16.0 + seed * 0.019))
            delta -= 0.020 * max(0.0, math.sin(math.tau * (v * 4.0 + u)))
        elif grammar == "rolled_coating":
            delta = 0.030 * math.cos(math.tau * (v * 2.4 + seed * 0.015))
            delta += 0.018 * math.sin(math.tau * (u * 1.6))
        elif grammar == "guarded_plate":
            delta = 0.036 * math.cos(math.tau * (v * 2.6 + seed * 0.014))
            delta += 0.022 * max(0.0, math.sin(math.tau * (u * 3.0 + v)))
        elif grammar == "smoked_optic":
            delta = 0.010 * math.sin(math.tau * (u + v))
        else:
            delta = 0.024 * math.sin(math.tau * (u * 3.4 + v * 1.9 + seed * 0.01))
        ao = 0.88 + 0.12 * abs(math.sin(math.tau * (u * 2.0 + v * 1.3 + seed * 0.007)))
        return (ao, max(0.08, min(0.95, roughness + delta)), metallic, 1.0)

    def normal_pixel(u, v):
        if grammar in {"machined_alloy", "worked_alloy"}:
            nx = 0.5 + 0.016 * math.sin(math.tau * (u * 28.0 + seed * 0.01))
            ny = 0.5 + 0.006 * math.cos(math.tau * v * 4.0)
        elif grammar in {"rolled_coating", "guarded_plate"}:
            nx = 0.5 + 0.010 * math.sin(math.tau * (u * 3.2 + seed * 0.008))
            ny = 0.5 + 0.012 * math.cos(math.tau * (v * 5.0 - seed * 0.006))
            # Soft plate-seam ridges.
            nx += 0.008 * math.sin(math.tau * (u * 1.0 + seed * 0.02))
        elif grammar in {"damped_contact", "transfer_interface"}:
            nx = 0.5 + 0.010 * math.sin(math.tau * (u * 6.0 + v * 2.0))
            ny = 0.5 + 0.010 * math.cos(math.tau * (v * 5.0 - u))
        elif grammar == "smoked_optic":
            nx = ny = 0.5
        else:
            nx = 0.5 + 0.007 * math.sin(math.tau * (u * 5.0 + seed * 0.01))
            ny = 0.5 + 0.007 * math.cos(math.tau * (v * 4.0 - seed * 0.01))
        return (nx, ny, 1.0, 1.0)

    token = asset_id.removeprefix("place_claim_outpost_").title()
    stem = name.removeprefix("Material_")
    base, base_hash = generated_map(f"PQ019_{token}_{stem}_BaseColor", "sRGB", base_pixel)
    orm, orm_hash = generated_map(f"PQ019_{token}_{stem}_ORM", "Non-Color", orm_pixel)
    normal, normal_hash = generated_map(f"PQ019_{token}_{stem}_Normal", "Non-Color", normal_pixel)
    return {
        "base": base,
        "orm": orm,
        "normal": normal,
        "report": {
            "grammar": grammar,
            "baseColor": {"name": base.name, "pixelSha256": base_hash},
            "orm": {"name": orm.name, "pixelSha256": orm_hash},
            "normal": {"name": normal.name, "pixelSha256": normal_hash},
            "size": [1024, 1024],
        },
    }


def retune_materials(asset_id: str, spec: dict) -> tuple[dict, dict]:
    materials = {}
    report = {}
    for name in MATERIAL_NAMES:
        material = bpy.data.materials.get(name)
        if material is None:
            raise RuntimeError(f"{asset_id}: missing frozen semantic material {name}")
        material.use_nodes = True
        material.node_tree.nodes.clear()
        color, metallic, roughness, grammar, _seed = spec["materialProfiles"][name]
        maps = material_maps(asset_id, name, spec["materialProfiles"][name])
        nodes = material.node_tree.nodes
        links = material.node_tree.links
        output = nodes.new("ShaderNodeOutputMaterial")
        shader = nodes.new("ShaderNodeBsdfPrincipled")
        shader.inputs["Base Color"].default_value = (*color, 1.0)
        shader.inputs["Metallic"].default_value = metallic
        shader.inputs["Roughness"].default_value = roughness
        if shader.inputs.get("Coat Weight") is not None and grammar == "smoked_optic":
            shader.inputs["Coat Weight"].default_value = 0.28
            shader.inputs["Coat Roughness"].default_value = 0.16
        links.new(shader.outputs["BSDF"], output.inputs["Surface"])
        base_node = nodes.new("ShaderNodeTexImage")
        base_node.name = f"{name}_BaseColor"
        base_node.image = maps["base"]
        links.new(base_node.outputs["Color"], shader.inputs["Base Color"])
        orm_node = nodes.new("ShaderNodeTexImage")
        orm_node.name = f"{name}_ORM"
        orm_node.image = maps["orm"]
        separate = nodes.new("ShaderNodeSeparateColor")
        links.new(orm_node.outputs["Color"], separate.inputs["Color"])
        links.new(separate.outputs["Green"], shader.inputs["Roughness"])
        links.new(separate.outputs["Blue"], shader.inputs["Metallic"])
        gltf_group = bpy.data.node_groups.get("glTF Material Output")
        if gltf_group is None:
            gltf_group = bpy.data.node_groups.new("glTF Material Output", "ShaderNodeTree")
            gltf_group.interface.new_socket(name="Occlusion", in_out="INPUT", socket_type="NodeSocketFloat")
        gltf_output = nodes.new("ShaderNodeGroup")
        gltf_output.node_tree = gltf_group
        links.new(separate.outputs["Red"], gltf_output.inputs["Occlusion"])
        normal_node = nodes.new("ShaderNodeTexImage")
        normal_node.name = f"{name}_Normal"
        normal_node.image = maps["normal"]
        normal_map = nodes.new("ShaderNodeNormalMap")
        normal_map.inputs["Strength"].default_value = 0.42 if grammar != "smoked_optic" else 0.0
        links.new(normal_node.outputs["Color"], normal_map.inputs["Color"])
        links.new(normal_map.outputs["Normal"], shader.inputs["Normal"])
        material.diffuse_color = (*color, 1.0)
        material["spaceface.semantic"] = name
        material["spaceface.materialTruth"] = CANDIDATE_ID
        material["spaceface.textureRole"] = grammar
        materials[name] = material
        report[name] = maps["report"] | {
            "baseColorFactor": list(color),
            "metallic": metallic,
            "roughness": roughness,
            "embeddedEmission": False,
        }
    return materials, report


def add_bevel(obj, lod: int, width: float) -> None:
    modifier = obj.modifiers.new("SF_ManufacturedEdge", "BEVEL")
    modifier.width = max(0.035, width * (1.0 if lod == 0 else 0.68 if lod == 1 else 0.42))
    modifier.segments = 3 if lod == 0 else 2 if lod == 1 else 1
    modifier.limit_method = "ANGLE"


def loft_case(collection, materials, lod: int, name: str, sections, center_y: float, center_z: float,
              material="Material_Hull", bevel=0.18):
    """Axis-aligned +X loft used sparingly for tapered channels, never as the whole facility."""
    vertices = []
    for x, half_y, half_z in sections:
        vertices.extend((
            (x, center_y - half_y, center_z - half_z),
            (x, center_y - half_y, center_z + half_z),
            (x, center_y + half_y, center_z + half_z),
            (x, center_y + half_y, center_z - half_z),
        ))
    last = len(vertices) - 4
    faces = [(0, 1, 2, 3), (last, last + 3, last + 2, last + 1)]
    for index in range(len(sections) - 1):
        a = index * 4
        b = (index + 1) * 4
        faces.extend((
            (a, a + 3, b + 3, b),
            (a + 1, b + 1, b + 2, a + 2),
            (a, b, b + 1, a + 1),
            (a + 3, a + 2, b + 2, b + 3),
        ))
    mesh = bpy.data.meshes.new(f"LOD{lod}_{name}_Mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(f"LOD{lod}_{name}", mesh)
    collection.objects.link(obj)
    obj.data.materials.append(materials[material])
    add_bevel(obj, lod, bevel)
    sf.tag(obj, lod, material, name)
    return obj


def vertical_loft(collection, materials, lod: int, name: str, sections, center_x: float, center_z: float,
                  material="Material_Hull", bevel=0.16):
    vertices = []
    for y, half_x, half_z in sections:
        vertices.extend((
            (center_x - half_x, y, center_z - half_z),
            (center_x + half_x, y, center_z - half_z),
            (center_x + half_x, y, center_z + half_z),
            (center_x - half_x, y, center_z + half_z),
        ))
    last = len(vertices) - 4
    faces = [(0, 1, 2, 3), (last, last + 3, last + 2, last + 1)]
    for index in range(len(sections) - 1):
        a = index * 4
        b = (index + 1) * 4
        faces.extend(((a, b, b + 1, a + 1), (a + 1, b + 1, b + 2, a + 2),
                      (a + 2, b + 2, b + 3, a + 3), (a + 3, b + 3, b, a)))
    mesh = bpy.data.meshes.new(f"LOD{lod}_{name}_Mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(f"LOD{lod}_{name}", mesh)
    collection.objects.link(obj)
    obj.data.materials.append(materials[material])
    add_bevel(obj, lod, bevel)
    sf.tag(obj, lod, material, name)
    return obj


def cylinder_between(collection, materials, lod: int, name: str, start, end, radius: float,
                     material="Material_Mechanical"):
    start = Vector(start)
    end = Vector(end)
    delta = end - start
    if delta.length < 1e-6:
        raise RuntimeError(f"{name}: zero-length cylinder")
    vertices = (20, 14, 8)[lod]
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=delta.length,
                                       end_fill_type="NGON", location=(start + end) * 0.5)
    obj = bpy.context.object
    obj.name = f"LOD{lod}_{name}"
    obj.rotation_mode = "QUATERNION"
    obj.rotation_quaternion = Vector((0.0, 0.0, 1.0)).rotation_difference(delta.normalized())
    obj.rotation_mode = "XYZ"
    obj.data.materials.append(materials[material])
    add_bevel(obj, lod, min(radius * 0.18, 0.12))
    sf.tag(obj, lod, material, name)
    move_to(obj, collection)
    return obj


def bounded_box(collection, materials, lod, name, size, location, material, bevel=0.18, rotation=(0, 0, 0)):
    return sf.box(collection, materials, lod, name, size, location, material, bevel, rotation)


def panel_plate(collection, materials, lod, name, size, location, material="Material_Hull",
                bevel=0.12, rotation=(0, 0, 0)):
    """Thin folded plate with plate-thickness bevel — not a blank blockout slab."""
    thickness = min(size)
    return bounded_box(collection, materials, lod, name, size, location, material,
                       max(0.06, min(bevel, thickness * 0.35)), rotation)


def channel_rail(collection, materials, lod, name, x0, x1, y, z, half_height, flange, web,
                 material="Material_Mechanical"):
    """U-channel guide: two flanges + web so the capture path reads as formed steel, not a bar."""
    mid_x = (x0 + x1) * 0.5
    length = abs(x1 - x0)
    panel_plate(collection, materials, lod, f"{name}_Web", (length, web, half_height * 2.0),
                (mid_x, y, z), material, 0.10)
    panel_plate(collection, materials, lod, f"{name}_FlangeIn", (length, half_height * 2.0, flange),
                (mid_x, y, z - half_height + flange * 0.5), material, 0.08)
    panel_plate(collection, materials, lod, f"{name}_FlangeOut", (length, half_height * 2.0, flange),
                (mid_x, y, z + half_height - flange * 0.5), material, 0.08)


def rectangular_frame(collection, materials, lod, name, center, outer_size, inner_size,
                      depth, material="Material_Hull", bevel=0.12, axis="x"):
    """Closed manufactured frame with real thickness around an open mouth."""
    cx, cy, cz = center
    if axis == "x":
        # Opening faces +X; frame lies in YZ with depth along X.
        outer_y, outer_z = (value * 0.5 for value in outer_size)
        inner_y, inner_z = (value * 0.5 for value in inner_size)
        low_x, high_x = cx - depth * 0.5, cx + depth * 0.5
        outer = ((-outer_y, -outer_z), (outer_y, -outer_z), (outer_y, outer_z), (-outer_y, outer_z))
        inner = ((-inner_y, -inner_z), (inner_y, -inner_z), (inner_y, inner_z), (-inner_y, inner_z))
        vertices = [
            (x, cy + y, cz + z)
            for x in (low_x, high_x)
            for loop in (outer, inner)
            for y, z in loop
        ]
    else:
        # Opening faces +Z; frame lies in XY with depth along Z.
        outer_x, outer_y = (value * 0.5 for value in outer_size)
        inner_x, inner_y = (value * 0.5 for value in inner_size)
        low_z, high_z = cz - depth * 0.5, cz + depth * 0.5
        outer = ((-outer_x, -outer_y), (outer_x, -outer_y), (outer_x, outer_y), (-outer_x, outer_y))
        inner = ((-inner_x, -inner_y), (inner_x, -inner_y), (inner_x, inner_y), (-inner_x, inner_y))
        vertices = [
            (cx + x, cy + y, z)
            for z in (low_z, high_z)
            for loop in (outer, inner)
            for x, y in loop
        ]
    faces = []
    outer_back, inner_back, outer_front, inner_front = range(0, 4), range(4, 8), range(8, 12), range(12, 16)
    for index in range(4):
        nxt = (index + 1) % 4
        faces.extend((
            (outer_front[index], outer_front[nxt], inner_front[nxt], inner_front[index]),
            (outer_back[nxt], outer_back[index], inner_back[index], inner_back[nxt]),
            (outer_back[index], outer_back[nxt], outer_front[nxt], outer_front[index]),
            (inner_back[nxt], inner_back[index], inner_front[index], inner_front[nxt]),
        ))
    mesh = bpy.data.meshes.new(f"LOD{lod}_{name}_Mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(f"LOD{lod}_{name}", mesh)
    collection.objects.link(obj)
    obj.data.materials.append(materials[material])
    add_bevel(obj, lod, bevel)
    sf.tag(obj, lod, material, name)
    return obj


def clevis_yoke(collection, materials, lod, name, origin, side: int) -> None:
    """Rooted jaw pivot: cheek plates, pin, and clevis fork carrying load into the frame."""
    ox, oy, oz = origin
    z = oz + side * 0.0
    bounded_box(collection, materials, lod, f"{name}_CheekA", (2.4, 3.6, 0.7),
                (ox - 1.2, oy, z + side * 1.6), "Material_Mechanical", 0.10)
    bounded_box(collection, materials, lod, f"{name}_CheekB", (2.4, 3.6, 0.7),
                (ox - 1.2, oy, z + side * 3.4), "Material_Mechanical", 0.10)
    cylinder_between(collection, materials, lod, f"{name}_Pin",
                     (ox - 1.2, oy, z + side * 1.4), (ox - 1.2, oy, z + side * 3.6),
                     (0.42, 0.52, 0.68)[lod], "Material_Warm")
    bounded_box(collection, materials, lod, f"{name}_Fork", (3.2, 2.0, 1.4),
                (ox + 1.4, oy, z + side * 2.5), "Material_Mechanical", 0.12)
    if lod < 2:
        cylinder_between(collection, materials, lod, f"{name}_Bolt",
                         (ox + 1.4, oy - 1.1, z + side * 2.5), (ox + 1.4, oy + 1.1, z + side * 2.5),
                         (0.22, 0.30, 0.40)[lod], "Material_Warm")


def build_module_interfaces(collection, materials, lod: int) -> None:
    sockets = ((-20, 1, -20), (-20, 1, 20), (20, 1, -20), (20, 1, 20))
    for index, location in enumerate(sockets):
        # Reinforced collar + load beam, not a floating warm cube.
        rectangular_frame(collection, materials, lod, f"ModuleCollar_{index}",
                          location, (7.2, 7.2), (4.6, 4.6), 1.6, "Material_Warm", 0.14, axis="x")
        bounded_box(collection, materials, lod, f"ModulePad_{index}", (5.2, 0.7, 5.2),
                    (location[0], location[1] - 0.9, location[2]), "Material_Mechanical", 0.10)
        sf.beam_between(collection, materials, lod, f"ModuleLoadRoot_{index}",
                        (location[0] * 0.54, -4.0, location[2] * 0.54), location,
                        (0.86, 1.02, 1.22)[lod], "Material_Mechanical")


def build_catcher(collection, materials, lod: int) -> None:
    """Lawful catcher: open fork mouth, rooted jaws/load path, partial impound — not a lofted blob."""
    # ---- Envelope shoes (exact frozen AABB extrema) ----
    bounded_box(collection, materials, lod, "AftAnchorShoe", (4.0, 5.0, 12.0),
                (-45.0226, -8.5, 0.0), "Material_Mechanical", 0.25)
    bounded_box(collection, materials, lod, "PortAnchorShoe", (12.0, 5.0, 4.0),
                (-5.0, -8.5, -45.0226), "Material_Mechanical", 0.25)
    bounded_box(collection, materials, lod, "StarboardAnchorShoe", (12.0, 5.0, 4.0),
                (-5.0, -8.5, 45.0226), "Material_Mechanical", 0.25)
    bounded_box(collection, materials, lod, "KeelAnchorShoe", (12.0, 2.0, 8.0),
                (-5.0, -16.6696, 0.0), "Material_Mechanical", 0.20)
    for index, (start, end) in enumerate((
        ((-24, -6, 0), (-43, -8.5, 0)), ((-9, -6, -15), (-5, -8.5, -43)),
        ((-9, -6, 15), (-5, -8.5, 43)), ((-5, -10, 0), (-5, -15.7, 0)),
    )):
        sf.beam_between(collection, materials, lod, f"AnchorLoadPath_{index}", start, end,
                        (1.15, 1.38, 1.65)[lod], "Material_Mechanical")
        if lod < 2:
            sf.beam_between(collection, materials, lod, f"AnchorGusset_{index}",
                            (start[0], start[1] + 2.0, start[2]), end,
                            (0.62, 0.78, 0.95)[lod], "Material_Warm")

    # ---- Stepped claim-base shell as panel assembly (not one smooth loft) ----
    panel_plate(collection, materials, lod, "ShellKeel", (42.0, 3.2, 22.0),
                (-4.0, -8.0, 0.0), "Material_Hull", 0.20)
    panel_plate(collection, materials, lod, "ShellAftBulkhead", (4.5, 14.0, 28.0),
                (-28.0, -1.0, 0.0), "Material_Hull", 0.22)
    panel_plate(collection, materials, lod, "ShellPortPlate", (30.0, 12.0, 3.4),
                (-6.0, -1.0, -16.5), "Material_Hull", 0.18)
    panel_plate(collection, materials, lod, "ShellStarboardPlate", (30.0, 12.0, 3.4),
                (-6.0, -1.0, 16.5), "Material_Hull", 0.18)
    panel_plate(collection, materials, lod, "ShellRoofAft", (22.0, 2.4, 24.0),
                (-14.0, 6.2, 0.0), "Material_Hull", 0.16)
    panel_plate(collection, materials, lod, "ShellRoofForward", (16.0, 2.0, 18.0),
                (8.0, 5.0, 0.0), "Material_Hull", 0.14)
    # Shoulders / recess breaks so the shell reads manufactured plate, not clay.
    panel_plate(collection, materials, lod, "ShellPortShoulder", (10.0, 4.0, 2.2),
                (6.0, 3.5, -12.0), "Material_Hull", 0.12)
    panel_plate(collection, materials, lod, "ShellStarboardShoulder", (10.0, 4.0, 2.2),
                (6.0, 3.5, 12.0), "Material_Hull", 0.12)
    if lod < 2:
        access_count = (3, 2)[lod]
        for index in range(access_count):
            x = -18.0 + index * 8.0
            panel_plate(collection, materials, lod, f"ServiceHatch_{index}", (3.2, 2.4, 0.35),
                        (x, 1.0, -18.1), "Material_Mechanical", 0.06)
            panel_plate(collection, materials, lod, f"ServiceHatchMirror_{index}", (3.2, 2.4, 0.35),
                        (x, 1.0, 18.1), "Material_Mechanical", 0.06)

    # ---- Open +X capture fork: U-channel rails, truss crossmembers, clear centerline ----
    for side in (-1, 1):
        channel_rail(collection, materials, lod, f"CaptureGuideRail_{side}",
                     14.0, 50.0, -0.4, side * 7.6, 1.35, 0.55, 0.72, "Material_Mechanical")
        # Outer secondary rail for mouth depth / silhouette fork.
        channel_rail(collection, materials, lod, f"CaptureOuterRail_{side}",
                     28.0, 52.0, 1.8, side * 12.4, 1.55, 0.48, 0.64, "Material_Hull")
    # Crossmembers sit BELOW the dock centerline sample y=2 so approach stays clear.
    for index, x in enumerate((18.0, 28.0, 38.0, 46.0)[: (4, 3, 2)[lod]]):
        sf.beam_between(collection, materials, lod, f"CaptureCrossmember_{index}",
                        (x, -1.6, -7.0), (x, -1.6, 7.0),
                        (1.05, 1.25, 1.55)[lod], "Material_Hull")
        if lod < 2:
            sf.beam_between(collection, materials, lod, f"CaptureBrace_{index}",
                            (x - 2.0, -1.0, -6.5), (x + 2.0, -1.0, 6.5),
                            (0.55, 0.70, 0.90)[lod], "Material_Mechanical")
    # Mouth throat as separated manufactured lips — open centerline (AABB must not cover y=2,z=0).
    panel_plate(collection, materials, lod, "MouthUpperLip", (3.2, 2.0, 18.0),
                (51.5, 7.5, 0.0), "Material_Hull", 0.12)
    panel_plate(collection, materials, lod, "MouthLowerLip", (3.2, 1.6, 16.0),
                (51.5, -3.2, 0.0), "Material_Hull", 0.12)
    for side in (-1, 1):
        panel_plate(collection, materials, lod, f"MouthCheek_{side}",
                    (3.2, 8.0, 2.8), (51.5, 2.0, side * 10.5), "Material_Hull", 0.12)
        bounded_box(collection, materials, lod, f"MouthBumper_{side}",
                    (3.0, 6.5, 3.8), (54.0, 2.2, side * 12.2),
                    "Material_Warm", 0.20)

    # ---- Paired jaw carriages: clevis roots, carriages, replaceable liners, dampers ----
    for side in (-1, 1):
        clevis_yoke(collection, materials, lod, f"JawPivot_{side}",
                    (30.0, 3.2, side * 10.5), side)
        # Carriage body as stepped plate stack, not a single loft slab.
        panel_plate(collection, materials, lod, f"JawCarriageBody_{side}",
                    (14.0, 4.2, 3.6), (40.0, 2.4, side * 11.2), "Material_Mechanical", 0.18)
        panel_plate(collection, materials, lod, f"JawCarriageArm_{side}",
                    (8.0, 2.6, 2.2), (48.0, 2.0, side * 9.4), "Material_Mechanical", 0.14)
        # Replaceable contact liner faces the corridor (accent, non-emissive).
        panel_plate(collection, materials, lod, f"JawContactLiner_{side}",
                    (11.0, 3.4, 0.55), (44.0, 2.2, side * 7.55), "Material_Accent", 0.06)
        if lod < 2:
            bolt_count = (3, 2)[lod]
            for index in range(bolt_count):
                x = 40.0 + index * 3.5
                cylinder_between(collection, materials, lod, f"LinerBolt_{side}_{index}",
                                 (x, 0.6, side * 7.55), (x, 3.8, side * 7.55),
                                 (0.16, 0.22, 0.30)[lod], "Material_Warm")
        # Short-stroke damper into crossmember root.
        cylinder_between(collection, materials, lod, f"JawDamper_{side}",
                         (29.0, 5.6, side * 17.5), (38.5, 3.6, side * 13.0),
                         (0.78, 0.92, 1.10)[lod], "Material_Warm")
        cylinder_between(collection, materials, lod, f"DamperRod_{side}",
                         (38.3, 3.6, side * 12.9), (43.0, 2.6, side * 10.0),
                         (0.36, 0.46, 0.60)[lod], "Material_Mechanical")
        bounded_box(collection, materials, lod, f"DamperMount_{side}",
                    (2.4, 2.8, 2.0), (28.5, 5.4, side * 17.8), "Material_Mechanical", 0.12)

    # ---- Partial impound / quarantine: stepped walls with real inspection gap ----
    panel_plate(collection, materials, lod, "ImpoundPortWall", (22.0, 10.0, 2.8),
                (4.0, 2.5, -17.5), "Material_Hull", 0.16)
    panel_plate(collection, materials, lod, "ImpoundStarboardWall", (22.0, 10.0, 2.8),
                (4.0, 2.5, 17.5), "Material_Hull", 0.16)
    panel_plate(collection, materials, lod, "ImpoundRoof", (18.0, 1.8, 28.0),
                (4.0, 8.0, 0.0), "Material_Hull", 0.12)
    panel_plate(collection, materials, lod, "ImpoundAftReturn", (2.2, 10.0, 26.0),
                (-6.0, 2.5, 0.0), "Material_Mechanical", 0.12)
    # Inspection strip: hooded optics on a recessed return plate (readable without emission).
    panel_plate(collection, materials, lod, "InspectionReturn", (14.0, 6.5, 1.0),
                (6.0, 3.2, -14.5), "Material_Mechanical", 0.08)
    window_count = (4, 3, 2)[lod]
    for index in range(window_count):
        x = 1.0 + index * (10.0 / max(1, window_count - 1))
        bounded_box(collection, materials, lod, f"InspectionOptic_{index}",
                    (1.5, 1.15, 0.28), (x, 4.6, -14.0), "Material_Glass", 0.04)
        if lod == 0:
            panel_plate(collection, materials, lod, f"OpticHood_{index}",
                        (1.8, 0.35, 0.9), (x, 5.4, -14.2), "Material_Warm", 0.04)

    # ---- Authority / service mast (exact +Y) and status fixtures ----
    cylinder_between(collection, materials, lod, "AuthorityMast",
                     (-20.0, 5.5, -12.0), (-20.0, 11.2, -12.0),
                     (0.55, 0.68, 0.85)[lod], "Material_Mechanical")
    bounded_box(collection, materials, lod, "AuthorityCap", (3.0, 1.0, 2.6),
                (-20.0, 12.0, -12.0), "Material_Accent", 0.10)
    panel_plate(collection, materials, lod, "AuthorityBase", (4.5, 1.2, 3.5),
                (-20.0, 5.0, -12.0), "Material_Hull", 0.10)
    if lod < 2:
        panel_plate(collection, materials, lod, "StatusBoard", (0.4, 2.8, 4.0),
                    (-18.5, 3.5, -10.0), "Material_Accent", 0.05)
        bounded_box(collection, materials, lod, "StatusOptic", (0.3, 1.2, 1.6),
                    (-18.25, 3.5, -10.0), "Material_Glass", 0.04)

    # Thermal / service trunk on aft roof.
    if lod < 2:
        panel_plate(collection, materials, lod, "ThermalSink", (8.0, 1.6, 3.0),
                    (-16.0, 7.6, 8.0), "Material_Mechanical", 0.08)
        for index in range((4, 2)[lod]):
            x = -18.5 + index * 1.6
            panel_plate(collection, materials, lod, f"ThermalFin_{index}",
                        (0.35, 1.8, 2.4), (x, 8.2, 8.0), "Material_Warm", 0.04)

    build_module_interfaces(collection, materials, lod)


def build_refinery(collection, materials, lod: int) -> None:
    """Covert fence: offset baffle, deep handoff bay, cassette, process tower — not a catcher recolor."""
    # ---- Envelope feet (exact frozen AABB extrema) ----
    bounded_box(collection, materials, lod, "AftProcessFoot", (4.0, 5.0, 12.0),
                (-48.8652, -8.5, -8.0), "Material_Mechanical", 0.24)
    bounded_box(collection, materials, lod, "DeepShieldFoot", (11.0, 5.0, 4.0),
                (-7.0, -8.5, -48.8652), "Material_Hull", 0.24)
    bounded_box(collection, materials, lod, "OuterBayFoot", (11.0, 5.0, 4.0),
                (12.0, -8.5, 45.0226), "Material_Hull", 0.24)
    bounded_box(collection, materials, lod, "KeelProcessFoot", (12.0, 2.0, 8.0),
                (-5.0, -16.6696, -4.0), "Material_Mechanical", 0.20)
    for index, (start, end) in enumerate((
        ((-31, -6, -7), (-47, -8.5, -8)), ((-12, -6, -19), (-7, -8.5, -47)),
        ((5, -6, 16), (12, -8.5, 43)), ((-5, -10, -4), (-5, -15.7, -4)),
    )):
        sf.beam_between(collection, materials, lod, f"ProcessLoadPath_{index}", start, end,
                        (1.18, 1.42, 1.70)[lod], "Material_Mechanical")
        if lod < 2:
            sf.beam_between(collection, materials, lod, f"ProcessGusset_{index}",
                            (start[0], start[1] + 1.8, start[2]), end,
                            (0.65, 0.80, 0.98)[lod], "Material_Warm")

    # ---- Asymmetric industrial process mass (L-shaped; not the catcher shell) ----
    panel_plate(collection, materials, lod, "ProcessKeel", (48.0, 3.4, 20.0),
                (-8.0, -8.2, -6.0), "Material_Hull", 0.20)
    panel_plate(collection, materials, lod, "ProcessAftMass", (14.0, 14.0, 26.0),
                (-30.0, -1.0, -8.0), "Material_Hull", 0.22)
    panel_plate(collection, materials, lod, "ProcessPortWing", (28.0, 11.0, 4.0),
                (-8.0, -1.5, -18.0), "Material_Hull", 0.18)
    panel_plate(collection, materials, lod, "ProcessStarboardStagger", (18.0, 9.0, 3.5),
                (4.0, -2.0, 6.0), "Material_Hull", 0.16)
    panel_plate(collection, materials, lod, "ProcessRoof", (26.0, 2.2, 22.0),
                (-12.0, 6.5, -6.0), "Material_Hull", 0.14)
    # Quiet process tank / vessel — one supported form, not a drum row.
    if lod < 2:
        sf.cyl(collection, materials, lod, "ProcessVessel",
               (4.2, 4.6, 5.2)[lod], 10.0, (-22.0, 2.0, 4.0), "Material_Mechanical",
               vertices=(16, 12, 8)[lod], rot=(0.0, math.pi / 2, 0.15))
        cylinder_between(collection, materials, lod, "VesselSaddleA",
                         (-26.0, -4.0, 4.0), (-26.0, 0.5, 4.0),
                         (0.55, 0.68, 0.85)[lod], "Material_Warm")
        cylinder_between(collection, materials, lod, "VesselSaddleB",
                         (-18.0, -4.0, 4.0), (-18.0, 0.5, 4.0),
                         (0.55, 0.68, 0.85)[lod], "Material_Warm")

    # ---- Offset privacy baffle: layered shield blocking direct bay sightline ----
    panel_plate(collection, materials, lod, "BaffleOuter", (4.5, 18.0, 16.0),
                (48.0, 3.5, -14.0), "Material_Hull", 0.20)
    panel_plate(collection, materials, lod, "BaffleInner", (3.0, 15.0, 12.0),
                (44.0, 3.0, -16.5), "Material_Hull", 0.16)
    panel_plate(collection, materials, lod, "BaffleReturn", (6.0, 14.0, 2.5),
                (50.5, 3.0, -6.0), "Material_Mechanical", 0.14)
    panel_plate(collection, materials, lod, "BaffleExtentLip", (4.0, 8.0, 3.0),
                (53.5, 2.0, -23.0), "Material_Hull", 0.14)
    # Root brackets from process mass into baffle.
    for index, (start, end) in enumerate((
        ((20.0, 0.0, -12.0), (44.0, 1.5, -15.0)),
        ((18.0, 4.0, -10.0), (43.0, 5.0, -14.0)),
        ((16.0, -2.0, -8.0), (45.0, 0.0, -12.0)),
    )[: (3, 2, 1)[lod]]):
        sf.beam_between(collection, materials, lod, f"BaffleRoot_{index}", start, end,
                        (1.05, 1.25, 1.55)[lod], "Material_Mechanical")

    # ---- Deep recessed handoff bay (rim / walls / floor / return / shutter pocket) ----
    # Floor and roof establish cavity depth; walls leave +X approach open at z=0 centerline.
    panel_plate(collection, materials, lod, "BayFloor", (26.0, 1.6, 18.0),
                (36.0, -3.2, 14.0), "Material_Mechanical", 0.12)
    panel_plate(collection, materials, lod, "BayRoof", (26.0, 1.8, 18.0),
                (36.0, 10.8, 14.0), "Material_Hull", 0.12)
    panel_plate(collection, materials, lod, "BayOuterWall", (26.0, 14.0, 2.0),
                (36.0, 3.8, 23.5), "Material_Hull", 0.14)
    panel_plate(collection, materials, lod, "BayInnerWall", (18.0, 14.0, 2.0),
                (32.0, 3.8, 4.5), "Material_Hull", 0.14)
    panel_plate(collection, materials, lod, "BayRearReturn", (2.2, 14.0, 18.0),
                (22.5, 3.8, 14.0), "Material_Mechanical", 0.12)
    # Mouth rim frame faces +X into the handoff corridor (offset to +Z, not on frozen z=0 path).
    rectangular_frame(collection, materials, lod, "BayMouthRim",
                      (50.0, 3.5, 14.0), (12.0, 16.0), (7.0, 10.0), 2.2,
                      "Material_Hull", 0.14, axis="x")
    panel_plate(collection, materials, lod, "ShutterPocket", (5.5, 9.0, 1.6),
                (26.0, 4.0, 22.2), "Material_Accent", 0.10)
    if lod < 2:
        panel_plate(collection, materials, lod, "ShutterEdge", (0.5, 8.0, 1.2),
                    (28.5, 4.0, 22.2), "Material_Warm", 0.05)
    # Transfer rails and capture clamps inside the bay.
    for side in (-1, 1):
        channel_rail(collection, materials, lod, f"TransferRail_{side}",
                     24.0, 50.0, -0.6, 14.0 + side * 4.6, 0.85, 0.40, 0.55, "Material_Warm")
        panel_plate(collection, materials, lod, f"TransferClampBody_{side}",
                    (4.5, 3.2, 2.0), (39.0, 1.6, 14.0 + side * 7.0), "Material_Mechanical", 0.12)
        panel_plate(collection, materials, lod, f"TransferClampLiner_{side}",
                    (3.5, 2.4, 0.4), (39.0, 1.6, 14.0 + side * 5.6), "Material_Accent", 0.05)
        if lod < 2:
            cylinder_between(collection, materials, lod, f"ClampPivot_{side}",
                             (37.0, 1.6, 14.0 + side * 7.0), (41.0, 1.6, 14.0 + side * 7.0),
                             (0.28, 0.36, 0.48)[lod], "Material_Warm")
    bounded_box(collection, materials, lod, "BayMouthStop", (3.0, 5.0, 4.0),
                (54.0, 0.0, 20.0), "Material_Warm", 0.16)
    bounded_box(collection, materials, lod, "BayInspectionOptic", (0.45, 2.0, 3.5),
                (23.7, 4.5, 14.0), "Material_Glass", 0.04)
    if lod == 0:
        panel_plate(collection, materials, lod, "BayOpticHood", (0.8, 0.4, 4.0),
                    (23.9, 5.7, 14.0), "Material_Warm", 0.04)

    # ---- Shielded off-axis storage cassette ----
    panel_plate(collection, materials, lod, "CassetteHull", (28.0, 10.0, 12.0),
                (4.0, 3.0, -26.0), "Material_Hull", 0.18)
    panel_plate(collection, materials, lod, "CassetteDoor", (1.8, 9.0, 10.0),
                (18.5, 3.0, -26.0), "Material_Accent", 0.12)
    panel_plate(collection, materials, lod, "CassetteDoorReturn", (1.2, 8.0, 9.0),
                (17.2, 3.0, -26.0), "Material_Mechanical", 0.08)
    hinge_count = (4, 3, 2)[lod]
    for index in range(hinge_count):
        y = -1.0 + index * (7.5 / max(1, hinge_count - 1))
        cylinder_between(collection, materials, lod, f"CassetteHinge_{index}",
                         (18.8, y, -31.0), (18.8, y + 1.4, -31.0),
                         (0.32, 0.42, 0.54)[lod], "Material_Mechanical")
    if lod < 2:
        for index in range((3, 2)[lod]):
            z = -30.0 + index * 3.5
            panel_plate(collection, materials, lod, f"CassetteLatch_{index}",
                        (0.5, 1.2, 1.6), (19.2, 5.5, z), "Material_Warm", 0.05)
    # Cassette load frame into process mass.
    sf.beam_between(collection, materials, lod, "CassetteLoadA",
                    (-8.0, 0.0, -18.0), (0.0, 1.0, -24.0),
                    (1.10, 1.30, 1.55)[lod], "Material_Mechanical")
    sf.beam_between(collection, materials, lod, "CassetteLoadB",
                    (-6.0, 4.0, -16.0), (2.0, 4.5, -22.0),
                    (1.00, 1.20, 1.45)[lod], "Material_Mechanical")

    # ---- Process separator tower (exact +Y) — industrial height cue ----
    vertical_loft(collection, materials, lod, "ProcessSeparator",
                  ((4.0, 4.8, 4.4), (12.0, 4.2, 3.8), (20.0, 3.4, 3.0),
                   (26.0, 2.6, 2.4), (29.6, 2.0, 1.9)),
                  -23.0, 17.0, "Material_Mechanical", 0.18)
    bounded_box(collection, materials, lod, "SeparatorCap", (4.8, 1.0, 4.4),
                (-23.0, 30.43, 17.0), "Material_Warm", 0.10)
    if lod < 2:
        for index, y in enumerate((10.0, 18.0, 24.0)[: (3, 2)[lod]]):
            panel_plate(collection, materials, lod, f"SeparatorRing_{index}",
                        (6.5, 0.6, 6.0), (-23.0, y, 17.0), "Material_Hull", 0.08)
        cylinder_between(collection, materials, lod, "SeparatorRiser",
                         (-23.0, 4.0, 12.0), (-23.0, 8.0, 15.0),
                         (0.45, 0.55, 0.70)[lod], "Material_Warm")

    # ---- Service manifold and protected conduits ----
    panel_plate(collection, materials, lod, "ServiceManifold", (10.0, 4.5, 3.5),
                (-5.0, 4.5, 18.5), "Material_Mechanical", 0.12)
    valve_count = (4, 3, 2)[lod]
    for index in range(valve_count):
        x = -8.0 + index * (6.0 / max(1, valve_count - 1))
        cylinder_between(collection, materials, lod, f"ManifoldValve_{index}",
                         (x, 6.5, 20.2), (x, 8.8, 20.2),
                         (0.40, 0.50, 0.64)[lod], "Material_Warm")
        if lod == 0:
            bounded_box(collection, materials, lod, f"ValveHandwheel_{index}",
                        (0.9, 0.25, 0.9), (x, 9.0, 20.2), "Material_Accent", 0.04)
    routes = (
        ((-5, 4, 17), (12, 1, 14), (24, 0, 14)),
        ((-8, 6, 18), (-14, 12, 17), (-20, 18, 17)),
        ((-4, 5, 19), (6, 3, 16), (20, 2, 15)),
    )
    for route_index, route in enumerate(routes[: (3, 2, 1)[lod]]):
        for segment in range(len(route) - 1):
            cylinder_between(collection, materials, lod, f"ProtectedConduit_{route_index}_{segment}",
                             route[segment], route[segment + 1],
                             (0.32, 0.44, 0.58)[lod], "Material_Mechanical")
            if lod == 0 and segment == 0:
                bounded_box(collection, materials, lod, f"ConduitSaddle_{route_index}",
                            (1.2, 0.8, 1.2), route[segment], "Material_Warm", 0.06)

    # Low-output covert status fixtures — no neon identity.
    if lod < 2:
        bounded_box(collection, materials, lod, "CovertOpticA",
                    (0.4, 1.0, 1.4), (42.0, 8.0, -10.0), "Material_Glass", 0.04)
        bounded_box(collection, materials, lod, "CovertOpticB",
                    (0.4, 1.0, 1.4), (24.0, 7.5, 20.0), "Material_Glass", 0.04)
        panel_plate(collection, materials, lod, "CovertHoodA",
                    (0.8, 0.3, 1.8), (42.0, 8.7, -10.0), "Material_Warm", 0.04)

    build_module_interfaces(collection, materials, lod)


def calculate_bounds(objects):
    minimum = Vector((1e9, 1e9, 1e9))
    maximum = Vector((-1e9, -1e9, -1e9))
    for obj in objects:
        for corner in obj.bound_box:
            point = obj.matrix_world @ Vector(corner)
            for axis in range(3):
                minimum[axis] = min(minimum[axis], point[axis])
                maximum[axis] = max(maximum[axis], point[axis])
    return minimum, maximum, maximum - minimum


def triangles(obj) -> int:
    return sum(max(0, len(polygon.vertices) - 2) for polygon in obj.data.polygons)


def triangulate_draw_group(obj) -> None:
    expected = triangles(obj)
    edit_mesh = bmesh.new()
    try:
        edit_mesh.from_mesh(obj.data)
        bmesh.ops.triangulate(edit_mesh, faces=list(edit_mesh.faces), quad_method="FIXED", ngon_method="EAR_CLIP")
        edit_mesh.to_mesh(obj.data)
    finally:
        edit_mesh.free()
    obj.data.update()
    if len(obj.data.polygons) != expected or any(len(face.vertices) != 3 for face in obj.data.polygons):
        raise RuntimeError(f"deterministic triangulation failed for {obj.name}")


def stabilize_draw_group_texcoords(obj) -> dict:
    """Snap bevel UVs to an exact binary grid below visible texture sampling."""
    layers = 0
    loops = 0
    values_rounded = 0
    for uv_layer in obj.data.uv_layers:
        layers += 1
        for loop_uv in uv_layer.data:
            loops += 1
            before = (float(loop_uv.uv.x), float(loop_uv.uv.y))
            after = tuple(
                round(value * UV_STABILIZATION_GRID_DENOMINATOR)
                / UV_STABILIZATION_GRID_DENOMINATOR
                for value in before
            )
            values_rounded += sum(left != right for left, right in zip(before, after))
            loop_uv.uv = after
    obj.data.update()
    return {
        "layers": layers,
        "loops": loops,
        "valuesRounded": values_rounded,
    }


def export_saved_candidate(asset_id: str, destination: Path) -> None:
    if asset_id not in TARGETS:
        raise RuntimeError(f"unknown receiver-facility target: {asset_id}")
    spec = TARGETS[asset_id]
    draw_group_names = [
        f"LOD{lod}_Station_{material_name}"
        for lod in range(3)
        for material_name in MATERIAL_NAMES
    ]
    export_object_names = [spec["root"], "COLLISION_HULL", *SOCKET_NAMES, *draw_group_names]
    if len(set(export_object_names)) != 24:
        raise RuntimeError(f"{asset_id}: saved export set must contain exactly 24 unique objects")
    missing = [name for name in export_object_names if bpy.data.objects.get(name) is None]
    if missing:
        raise RuntimeError(f"{asset_id}: saved candidate is missing export objects: {missing}")
    export_objects = [bpy.data.objects[name] for name in export_object_names]
    hidden = [obj.name for obj in export_objects if obj.hide_viewport or obj.hide_get()]
    if hidden:
        raise RuntimeError(f"{asset_id}: saved candidate has viewport-hidden export objects: {hidden}")
    destination.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.object.select_all(action="DESELECT")
    for obj in export_objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = bpy.data.objects[spec["root"]]
    bpy.ops.export_scene.gltf(
        filepath=str(destination), export_format="GLB", use_selection=True,
        export_yup=True, export_apply=True, export_extras=True, export_texcoords=True,
        export_normals=True, export_tangents=True, export_materials="EXPORT",
    )


def export_saved_candidate_in_fresh_process(asset_id: str, candidate_blend: Path, destination: Path) -> None:
    command = [
        bpy.app.binary_path,
        "--background",
        str(candidate_blend),
        "--python",
        str(Path(__file__).resolve()),
        "--",
        "--export-saved-candidate",
        asset_id,
        str(destination),
    ]
    subprocess.run(command, check=True)


def topology_report(obj) -> dict:
    edge_uses = {}
    for polygon in obj.data.polygons:
        indices = list(polygon.vertices)
        for left, right in zip(indices, indices[1:] + indices[:1]):
            edge = (left, right) if left < right else (right, left)
            edge_uses[edge] = edge_uses.get(edge, 0) + 1
    bad = sum(count != 2 for count in edge_uses.values())
    return {"vertices": len(obj.data.vertices), "edges": len(edge_uses), "badEdges": bad}


def assert_exact_bounds(asset_id: str, minimum, maximum, dimensions) -> None:
    expected = TARGETS[asset_id]["aabb"]
    for label, actual, target in (("min", minimum, expected["min"]),
                                  ("max", maximum, expected["max"]),
                                  ("size", dimensions, expected["size"])):
        for axis in range(3):
            if abs(actual[axis] - target[axis]) > 0.001:
                raise RuntimeError(
                    f"{asset_id}: frozen AABB {label}[{axis}] {actual[axis]:.6f} != {target[axis]:.6f}"
                )


def assert_open_approach(collection) -> None:
    # Centerline samples are intentionally conservative.  The billed jaws/baffle may flank them but
    # no presentation mesh may occupy the frozen +X dock approach itself.
    samples = [Vector((x, 2.0, 0.0)) for x in (48.0, 50.0, 52.0, 54.0, 55.0)]
    blockers = []
    for obj in collection.objects:
        if obj.type != "MESH" or not obj.name.startswith("LOD0_"):
            continue
        corners = [obj.matrix_world @ Vector(corner) for corner in obj.bound_box]
        minimum = Vector(tuple(min(point[axis] for point in corners) for axis in range(3)))
        maximum = Vector(tuple(max(point[axis] for point in corners) for axis in range(3)))
        if any(all(minimum[axis] <= sample[axis] <= maximum[axis] for axis in range(3)) for sample in samples):
            blockers.append(obj.name)
    if blockers:
        raise RuntimeError(f"frozen dock-approach centerline blocked by {blockers}")


def build_one(asset_id: str, baseline_row: dict, evidence_binding: dict) -> dict:
    spec = TARGETS[asset_id]
    paths = candidate_paths(asset_id)
    canonical = paths["canonicalBlend"]
    if sha256(canonical) != baseline_row["blend"]["sha256"]:
        raise RuntimeError(f"{asset_id}: canonical Blend no longer matches frozen baseline")
    if Path(bpy.data.filepath).resolve() != canonical.resolve():
        bpy.ops.wm.open_mainfile(filepath=str(canonical))
    canonical_hash = sha256(canonical)
    frozen = frozen_contract(spec)
    root = bpy.data.objects[spec["root"]]
    collection = bpy.data.collections.get(spec["collection"])
    if collection is None:
        raise RuntimeError(f"{asset_id}: missing collection {spec['collection']}")
    materials, material_report = retune_materials(asset_id, spec)
    for obj in list(collection.objects):
        if obj.type == "MESH" and obj.name.startswith("LOD"):
            bpy.data.objects.remove(obj, do_unlink=True)

    builder = build_catcher if asset_id == "place_claim_outpost_base" else build_refinery
    for lod in range(3):
        builder(collection, materials, lod)
    bpy.context.view_layer.update()
    assert_open_approach(collection)

    draw_groups = []
    lod_report = {}
    topology = {}
    stabilized_texcoords = {}
    for lod in range(3):
        groups = sf.join_draw_groups(collection, lod)
        for obj in groups:
            bpy.ops.object.select_all(action="DESELECT")
            obj.select_set(True)
            bpy.context.view_layer.objects.active = obj
            bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
            obj.parent = root
            triangulate_draw_group(obj)
            stabilized_texcoords[obj.name] = stabilize_draw_group_texcoords(obj)
            closed = topology_report(obj)
            if closed["badEdges"]:
                raise RuntimeError(f"{asset_id}: open draw-group topology {obj.name}: {closed['badEdges']}")
            topology[obj.name] = closed
            obj.hide_render = lod != 0
            obj.hide_viewport = False
        materials_for_lod = sorted(obj.data.materials[0].name for obj in groups)
        if len(groups) != 5 or materials_for_lod != sorted(MATERIAL_NAMES):
            raise RuntimeError(f"{asset_id}: LOD{lod} must contain exactly five semantic draw groups")
        draw_groups.extend(groups)
        lod_report[f"lod{lod}"] = {
            "triangles": sum(triangles(obj) for obj in groups),
            "drawGroups": len(groups),
            "materials": materials_for_lod,
        }
    counts = [lod_report[f"lod{lod}"]["triangles"] for lod in range(3)]
    if not counts[0] > counts[1] > counts[2] > 0:
        raise RuntimeError(f"{asset_id}: LOD triangle counts must strictly decrease: {counts}")

    bpy.context.view_layer.update()
    lod0 = [obj for obj in draw_groups if obj.name.startswith("LOD0_")]
    minimum, maximum, dimensions = calculate_bounds(lod0)
    assert_exact_bounds(asset_id, minimum, maximum, dimensions)
    assert_frozen(frozen, spec)

    metadata = json.loads(root.get("spacefaceAssetJson", "{}"))
    metadata.update({
        "triangleCount": lod_report["lod0"]["triangles"],
        "lodTriangles": {key: value["triangles"] for key, value in lod_report.items()},
        "drawGroupsPerLod": {key: value["drawGroups"] for key, value in lod_report.items()},
        "lod0AabbMin": [round(value, 4) for value in minimum],
        "lod0AabbMax": [round(value, 4) for value in maximum],
        "lod0AabbSize": [round(value, 4) for value in dimensions],
        "wiringStatus": "isolated_candidate",
        "candidateId": CANDIDATE_ID,
        "builder": repo_path(Path(__file__)),
        "visualCenterXZ": spec["visualCenterXZ"],
    })
    metadata_text = json.dumps(metadata, separators=(",", ":"), sort_keys=True)
    root["spacefaceAssetJson"] = metadata_text
    root["spaceface.candidateId"] = CANDIDATE_ID
    root["spaceface.builder"] = repo_path(Path(__file__))
    bpy.context.scene["spacefaceAssetJson"] = metadata_text
    bpy.context.scene["spaceface.baselineManifestSha256"] = evidence_binding["baselineManifest"]["sha256"]
    bpy.context.scene["spaceface.preflightSha256"] = evidence_binding["preflight"]["sha256"]

    for path in paths.values():
        path.parent.mkdir(parents=True, exist_ok=True)
    export_objects = [bpy.data.objects[spec["root"]], bpy.data.objects["COLLISION_HULL"]]
    export_objects.extend(bpy.data.objects[name] for name in SOCKET_NAMES)
    export_objects.extend(draw_groups)
    if len({obj.name for obj in export_objects}) != 24:
        raise RuntimeError(f"{asset_id}: export set must be root + collision + seven sockets + fifteen draw groups")
    hidden = [obj.name for obj in export_objects if obj.hide_viewport or obj.hide_get()]
    if hidden:
        raise RuntimeError(f"{asset_id}: viewport-hidden export contract objects: {hidden}")
    bpy.ops.wm.save_as_mainfile(filepath=str(paths["candidateBlend"]))

    # Blender's evaluated UV/tangent state can retain process-local float noise after
    # modifier application even after an in-process reopen. Export the exact serialized
    # candidate in a fresh Blender process so glTF observes canonical saved mesh state,
    # not transient depsgraph/exporter state from the authoring process.
    export_saved_candidate_in_fresh_process(asset_id, paths["candidateBlend"], paths["sourceCandidate"])
    shutil.copy2(paths["sourceCandidate"], paths["releaseCandidate"])
    if sha256(paths["sourceCandidate"]) != sha256(paths["releaseCandidate"]):
        raise RuntimeError(f"{asset_id}: isolated source/release candidate mirrors differ")

    return {
        "assetId": asset_id,
        "runtimeAssetId": spec["assetId"],
        "role": spec["role"],
        "title": spec["title"],
        "canonicalBlend": repo_path(canonical),
        "canonicalBlendSha256": canonical_hash,
        "candidateBlend": repo_path(paths["candidateBlend"]),
        "candidateBlendSha256": sha256(paths["candidateBlend"]),
        "sourceCandidate": repo_path(paths["sourceCandidate"]),
        "sourceCandidateSha256": sha256(paths["sourceCandidate"]),
        "releaseCandidate": repo_path(paths["releaseCandidate"]),
        "releaseCandidateSha256": sha256(paths["releaseCandidate"]),
        "bytes": {
            "candidateBlend": paths["candidateBlend"].stat().st_size,
            "source": paths["sourceCandidate"].stat().st_size,
            "release": paths["releaseCandidate"].stat().st_size,
        },
        "bounds": {
            "min": [round(value, 4) for value in minimum],
            "max": [round(value, 4) for value in maximum],
            "size": [round(value, 4) for value in dimensions],
            "verifiedExactMinAndMax": True,
            "extremaAreVisibleBilledConstruction": True,
        },
        "visualCenterXZ": spec["visualCenterXZ"],
        "lod": lod_report,
        "materials": list(MATERIAL_NAMES),
        "materialMaps": material_report,
        "frozenContract": {
            "root": spec["root"],
            "collision": "COLLISION_HULL",
            "collisionTriangles": frozen["COLLISION_HULL"]["mesh"]["triangles"],
            "sockets": list(SOCKET_NAMES),
            "snapshot": frozen,
            "verifiedUnchanged": True,
        },
        "approachCorridor": {"axis": "+X", "socket": "SOCKET_Dock_Approach", "centerlineClear": True},
        "topology": {"allDrawGroupsClosed": True, "drawGroups": topology},
        "attributeStabilization": {
            **ATTRIBUTE_STABILIZATION,
            "drawGroups": stabilized_texcoords,
        },
        "validation": {
            "status": "pending",
            "binding": None,
            "candidateSha256": sha256(paths["sourceCandidate"]),
            "foundryReportSha256": None,
            "khronosReportSha256": None,
        },
    }


def build() -> dict:
    baseline, evidence_binding = require_preflight_and_baseline()
    results = {}
    for asset_id in TARGET_ORDER:
        results[asset_id] = build_one(asset_id, baseline["targets"][asset_id], evidence_binding)
    report = {
        "schema": "spaceface.claimOutpostReceiverFacilityMaterialTruthBuild.v1",
        "dispatchUnit": DISPATCH_UNIT,
        "candidateId": CANDIDATE_ID,
        "builder": repo_path(Path(__file__)),
        "toolchain": {
            "builder": file_identity(Path(__file__)),
            "stationVisualFamily": evidence_binding["stationVisualFamily"],
        },
        "attributeStabilization": ATTRIBUTE_STABILIZATION,
        "releaseCandidateSemantics": "isolated_source_mirror_not_release_proof",
        "sourceCommit": baseline.get("sourceCommit"),
        "evidenceBinding": evidence_binding,
        "targets": results,
        "targetOrder": list(TARGET_ORDER),
        "exactTwoTargetPipeline": True,
        "canonicalAssetsModified": False,
        "liveManifestsModified": False,
        "protectedSiblingEnumeration": False,
    }
    BUILD_REPORT.parent.mkdir(parents=True, exist_ok=True)
    BUILD_REPORT.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    return report


if __name__ == "__main__":
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    if argv and argv[0] == "--export-saved-candidate":
        if len(argv) != 3:
            raise RuntimeError("saved-candidate export requires asset id and destination")
        export_saved_candidate(argv[1], Path(argv[2]).resolve())
    elif argv:
        raise RuntimeError(f"unsupported receiver-facility builder arguments: {argv}")
    else:
        print(json.dumps(build(), indent=2, sort_keys=True))

#!/usr/bin/env python3
"""Apply semantic PBR maps to a canonical M4 production blend and export a candidate.

The input blend is opened by Blender and never overwritten. Example:
  blender helios_rock_a_production.blend --background \
    --python tools/blender/remaster_m4_surface_roles.py -- \
    --asset helios_rock_a --output-root .devshots/graphics/surface-candidates/rock-a
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
from pathlib import Path
import sys

import bpy
import bmesh


ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from assets.ships.m4_helios_hub.scripts.surface_remaster_v2 import (  # noqa: E402
    ROCK_REFERENCE_FILES,
    REMASTER_ID,
    apply_to_blender_images,
)
from tools.blender.surface_export_contract import (  # noqa: E402
    assert_tangent_receipts,
    deterministic_mesh_data_name,
    measure_tangent_vectors,
)


ASSETS = {
    "helios_hub_station": {
        "roles": ("hull", "armor", "armor_dark", "structure_light", "mechanical", "radiator", "docking", "service", "marking", "window")
    },
    "helios_rock_a": {"roles": ("rock", "warm")},
}

GLTF_MATERIAL_OUTPUT_GROUP = "glTF Material Output"
PERIMETER_UV_METRES_PER_TILE = 4.0


def args() -> argparse.Namespace:
    tail = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--asset", required=True, choices=sorted(ASSETS))
    parser.add_argument("--output-root", type=Path, required=True)
    parser.add_argument("--maps-root", type=Path)
    parser.add_argument(
        "--surface-only",
        action="store_true",
        help="Preserve an already-normalized production mesh and update only materials/images.",
    )
    return parser.parse_args(tail)


def sha256(path: Path) -> str:
    value = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            value.update(chunk)
    return value.hexdigest().upper()


def find_principled(material):
    if not material or not material.node_tree:
        return None
    return next((node for node in material.node_tree.nodes if node.type == "BSDF_PRINCIPLED"), None)


def _replace_input_link(links, output_socket, input_socket) -> None:
    for link in list(input_socket.links):
        links.remove(link)
    links.new(output_socket, input_socket)


def _ensure_gltf_group_input(node_group, name: str) -> None:
    try:
        items = list(node_group.interface.items_tree)
        if any(
            getattr(item, "item_type", None) == "SOCKET"
            and getattr(item, "in_out", None) == "INPUT"
            and item.name == name
            for item in items
        ):
            return
        node_group.interface.new_socket(name=name, in_out="INPUT", socket_type="NodeSocketFloat")
        return
    except (AttributeError, TypeError):
        pass
    if node_group.inputs.get(name) is None:
        node_group.inputs.new("NodeSocketFloat", name)


def ensure_gltf_occlusion_binding(material, orm_node) -> dict:
    """Bind one ORM image to AO/Roughness/Metallic using Blender's glTF convention."""
    if material.node_tree is None:
        raise RuntimeError(f"{material.name}: cannot bind ORM without a node tree")
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    principled = find_principled(material)
    if principled is None:
        raise RuntimeError(f"{material.name}: missing Principled BSDF for ORM binding")

    color_output = orm_node.outputs.get("Color")
    if color_output is None:
        raise RuntimeError(f"{material.name}: ORM image node has no Color output")
    separate_by_name = {
        link.to_node.name: link.to_node
        for link in color_output.links
        if link.to_node.type == "SEPARATE_COLOR"
    }
    separate_nodes = [separate_by_name[name] for name in sorted(separate_by_name)]
    if len(separate_nodes) > 1:
        raise RuntimeError(f"{material.name}: ORM image feeds multiple Separate Color nodes")
    if separate_nodes:
        separate = separate_nodes[0]
    else:
        separate = nodes.new("ShaderNodeSeparateColor")
        separate.name = "SF_ORM_Separate"
        separate.label = "ORM: R=AO G=Roughness B=Metallic"
        separate.location = (orm_node.location.x + 280.0, orm_node.location.y)
        links.new(color_output, separate.inputs["Color"])

    roughness = principled.inputs.get("Roughness")
    metallic = principled.inputs.get("Metallic")
    if roughness is None or metallic is None:
        raise RuntimeError(f"{material.name}: Principled BSDF lacks roughness or metallic input")
    _replace_input_link(links, separate.outputs["Green"], roughness)
    _replace_input_link(links, separate.outputs["Blue"], metallic)

    node_group = bpy.data.node_groups.get(GLTF_MATERIAL_OUTPUT_GROUP)
    if node_group is None:
        node_group = bpy.data.node_groups.new(GLTF_MATERIAL_OUTPUT_GROUP, "ShaderNodeTree")
    _ensure_gltf_group_input(node_group, "Occlusion")
    group_nodes = sorted(
        (
            node for node in nodes
            if node.type == "GROUP" and node.node_tree is node_group
        ),
        key=lambda node: node.name,
    )
    if len(group_nodes) > 1:
        raise RuntimeError(f"{material.name}: multiple {GLTF_MATERIAL_OUTPUT_GROUP} nodes")
    if group_nodes:
        gltf_node = group_nodes[0]
    else:
        gltf_node = nodes.new("ShaderNodeGroup")
        gltf_node.node_tree = node_group
        gltf_node.name = "SF_glTF_Material_Output"
        gltf_node.label = "glTF ORM Export"
        gltf_node.location = (separate.location.x + 260.0, separate.location.y - 220.0)
    occlusion = gltf_node.inputs.get("Occlusion")
    if occlusion is None:
        raise RuntimeError(f"{material.name}: glTF output group has no Occlusion input")
    _replace_input_link(links, separate.outputs["Red"], occlusion)

    material["spacefaceOrmContract"] = "R=AO,G=Roughness,B=Metallic"
    material["spacefaceAoBinding"] = "glTF Occlusion <- ORM Red"
    return {
        "ormNode": orm_node.name,
        "ormImage": orm_node.image.name if orm_node.image else None,
        "separateNode": separate.name,
        "occlusionNode": gltf_node.name,
        "channels": {"occlusion": "Red", "roughness": "Green", "metallic": "Blue"},
        "sharedOrmImage": True,
    }


def role_images(role: str):
    images = {}
    for channel in ("basecolor", "normal", "orm"):
        stem = f"{role}_{channel}"
        image = next((item for item in bpy.data.images if Path(item.name).stem.lower() == stem), None)
        if not image:
            raise RuntimeError(f"missing loaded image for material role {role}/{channel}")
        images[channel] = image
    return images


def assign_role_images(material, role: str) -> dict:
    """Retarget a known glTF-compatible Principled texture graph to one semantic role."""
    images = role_images(role)
    matched = {channel: [] for channel in images}
    for node in material.node_tree.nodes:
        if node.type != "TEX_IMAGE" or not node.image:
            continue
        stem = Path(node.image.name).stem.lower()
        channel = next((name for name in ("basecolor", "normal", "orm") if name in stem), None)
        if not channel:
            continue
        node.image = images[channel]
        node.label = f"{role} {channel}"
        matched[channel].append(node)
    # Blender's glTF round-trip graph may contain two nodes using the same ORM image: one for
    # metallic/roughness and one for AO. Retarget both to the same authored image, but keep the
    # metallic/roughness node as the canonical source when consolidating glTF occlusion binding.
    ambiguous = {
        channel: len(nodes)
        for channel, nodes in matched.items()
        if (channel != "orm" and len(nodes) != 1) or (channel == "orm" and len(nodes) < 1)
    }
    if ambiguous:
        raise RuntimeError(f"{material.name}: ambiguous PBR graph while binding {role}: {ambiguous}")
    def feeds_principled_response(node) -> bool:
        color = node.outputs.get("Color")
        if color is None:
            return False
        return any(
            downstream.to_node.type == "BSDF_PRINCIPLED"
            and downstream.to_socket.name in {"Roughness", "Metallic"}
            for link in color.links
            if link.to_node.type == "SEPARATE_COLOR"
            for output in link.to_node.outputs
            for downstream in output.links
        )

    primary_orm = next((node for node in matched["orm"] if feeds_principled_response(node)), matched["orm"][0])
    pbr_binding = ensure_gltf_occlusion_binding(material, primary_orm)
    material["spacefaceMaterialRole"] = role
    material["spacefaceSurfaceRemaster"] = REMASTER_ID
    return {
        "baseColorNode": matched["basecolor"][0].name,
        "normalNode": matched["normal"][0].name,
        "ormNodes": [node.name for node in matched["orm"]],
        **pbr_binding,
    }


def clone_role_material(template_name: str, material_name: str, role: str):
    existing = bpy.data.materials.get(material_name)
    if existing:
        return existing, assign_role_images(existing, role)
    template = bpy.data.materials.get(template_name)
    if not template or not template.node_tree:
        raise RuntimeError(f"missing PBR material template: {template_name}")
    material = template.copy()
    material.name = material_name
    return material, assign_role_images(material, role)


def refresh_image_binding_counts(image_report: list[dict]) -> None:
    """Correct receipts for role materials cloned after source images were prepared."""
    for item in image_report:
        image = bpy.data.images.get(item["image"])
        item["boundNodes"] = sum(
            1
            for material in bpy.data.materials
            if material.node_tree
            for node in material.node_tree.nodes
            if node.type == "TEX_IMAGE" and node.image is image
        )


def remove_superseded_surface_images() -> list[dict]:
    """Drop packed maps displaced by a later deterministic surface pass.

    Blender retains renamed image datablocks after every rebind. Leaving those zero-user PNGs in
    the authoring blend silently grows it by another full texture set on each iteration.
    """
    removed = []
    for image in list(bpy.data.images):
        if not image.name.startswith("__source_"):
            continue
        if image.users != 0:
            raise RuntimeError(f"superseded surface image still has users: {image.name} ({image.users})")
        removed.append({
            "name": image.name,
            "packed": bool(image.packed_file),
        })
        bpy.data.images.remove(image)
    return removed


def externalize_station_surface_images(image_report: list[dict]) -> list[dict]:
    """Reference the tracked deterministic PNGs instead of duplicating them inside the blend.

    The candidate blend is a promotion payload for ``assets/ships/m4_helios_hub/blender``. Its
    relative paths are therefore authored for that final location, not for the ignored scratch
    directory that temporarily holds the reviewed candidate.
    """
    texture_root = ROOT / "assets" / "ships" / "m4_helios_hub" / "textures"
    externalized = []
    for item in image_report:
        image = bpy.data.images.get(item["image"])
        if image is None:
            raise RuntimeError(f"missing surface image during externalization: {item['image']}")
        source = Path(item["source"]).resolve()
        canonical = texture_root / f"{item['role']}_{item['channel']}.png"
        if not canonical.is_file() or sha256(canonical) != sha256(source):
            raise RuntimeError(f"tracked surface map does not match candidate source: {canonical}")
        image.filepath_raw = str(canonical)
        if image.packed_file:
            image.unpack(method="REMOVE")
        image.filepath_raw = f"//../textures/{canonical.name}"
        image.reload()
        externalized.append({
            "image": image.name,
            "path": image.filepath_raw,
            "sha256": sha256(canonical),
        })
    return externalized


def replace_material_users(source_name: str, replacement) -> int:
    replaced = 0
    for obj in bpy.data.objects:
        if obj.type != "MESH":
            continue
        for slot in obj.material_slots:
            if slot.material and slot.material.name == source_name:
                slot.material = replacement
                replaced += 1
    return replaced


def bind_station_material_roles() -> list[dict]:
    """Separate physical roles that were collapsed into three generic station surfaces."""
    report = []
    direct = {
        "SF_HullMid_K0PBR": "hull",
        "SF_Armor_K0PBR": "armor",
        "SF_HullDark_K0PBR": "armor_dark",
        "SF_Machinery_K0PBR": "mechanical",
    }
    for name, role in direct.items():
        material = bpy.data.materials.get(name)
        if not material:
            raise RuntimeError(f"missing station material: {name}")
        binding = assign_role_images(material, role)
        report.append({"material": name, "role": role, "mode": "direct", "pbrBinding": binding})

    radiator, radiator_binding = clone_role_material("SF_Machinery_K0PBR", "SF_Radiator_PBR", "radiator")
    radiator_count = replace_material_users("SF_Radiator", radiator)
    report.append({
        "material": radiator.name, "role": "radiator", "mode": "replacement",
        "slots": radiator_count, "pbrBinding": radiator_binding,
    })

    window, window_binding = clone_role_material("SF_HullMid_K0PBR", "SF_Window_PBR", "window")
    window_bsdf = find_principled(window)
    if window_bsdf:
        if window_bsdf.inputs.get("Emission Color"):
            window_bsdf.inputs["Emission Color"].default_value = (0.025, 0.34, 0.58, 1.0)
        if window_bsdf.inputs.get("Emission Strength"):
            window_bsdf.inputs["Emission Strength"].default_value = 1.65
        if window_bsdf.inputs.get("Coat Weight"):
            window_bsdf.inputs["Coat Weight"].default_value = 0.28
        if window_bsdf.inputs.get("Coat Roughness"):
            window_bsdf.inputs["Coat Roughness"].default_value = 0.11
    window_count = replace_material_users("SF_Window", window)
    report.append({
        "material": window.name, "role": "window", "mode": "replacement",
        "slots": window_count, "pbrBinding": window_binding,
    })

    docking, docking_binding = clone_role_material("SF_Machinery_K0PBR", "SF_DockingContact_PBR", "docking")
    service, service_binding = clone_role_material("SF_HullMid_K0PBR", "SF_ServiceAccess_PBR", "service")
    marking, marking_binding = clone_role_material("SF_HullMid_K0PBR", "SF_IndustrialMarking_PBR", "marking")
    # Golden Station geometry consumes this role in the next deterministic authoring
    # stage.  Preserve the otherwise-unused datablock across the intermediate save.
    marking.use_fake_user = True
    structure_light, structure_binding = clone_role_material(
        "SF_HullMid_K0PBR", "SF_StructuralLight_PBR", "structure_light"
    )
    docking_slots = 0
    service_slots = 0
    structural_light_slots = 0
    donor_trim_bindings = {"docking": 0, "service": 0, "structure_light": 0}
    for obj in bpy.data.objects:
        if obj.type != "MESH":
            continue
        lowered = obj.name.lower()
        for slot in obj.material_slots:
            if not slot.material:
                continue
            current = slot.material.name
            # The Quaternius donor trim was the last uniformly white/plastic station role. Resolve it
            # by functional assembly rather than swapping one global tint for another: docking skins
            # become impact/contact metal, industrial skins receive maintained service coating, and
            # inhabited/citadel skins retain a light but spatially varied structural coating.
            if current == "SF_QuaterniusTrim_CC0":
                if "docking" in lowered:
                    slot.material = docking
                    docking_slots += 1
                    donor_trim_bindings["docking"] += 1
                elif "industrial" in lowered:
                    slot.material = service
                    service_slots += 1
                    donor_trim_bindings["service"] += 1
                else:
                    slot.material = structure_light
                    structural_light_slots += 1
                    donor_trim_bindings["structure_light"] += 1
                continue
            # Contact plating is the hull/armor skin on named docking structures; machinery
            # and dark backing retain their own physical response.
            if "docking" in lowered and current in {"SF_HullMid_K0PBR", "SF_Armor_K0PBR"}:
                slot.material = docking
                docking_slots += 1
            # Cargo, freight and industrial access skins are maintained more heavily than civic hull.
            elif any(token in lowered for token in ("cargo", "freight", "industrial")) and current == "SF_HullMid_K0PBR":
                slot.material = service
                service_slots += 1
    report.append({
        "material": docking.name, "role": "docking", "mode": "semantic-object",
        "slots": docking_slots, "pbrBinding": docking_binding,
    })
    report.append({
        "material": service.name, "role": "service", "mode": "semantic-object",
        "slots": service_slots, "pbrBinding": service_binding,
    })
    report.append({
        "material": marking.name, "role": "marking", "mode": "authored-signage",
        "slots": 0, "pbrBinding": marking_binding,
    })
    report.append({
        "material": structure_light.name,
        "role": "structure_light",
        "mode": "functional-donor-trim-replacement",
        "slots": structural_light_slots,
        "donorTrimBindings": donor_trim_bindings,
        "pbrBinding": structure_binding,
    })
    return report


def calibrate_materials(asset: str) -> list[dict]:
    if asset == "helios_rock_a":
        warm = find_principled(bpy.data.materials.get("Material_Warm"))
        if warm:
            if warm.inputs.get("Emission Color"):
                warm.inputs["Emission Color"].default_value = (0.0, 0.0, 0.0, 1.0)
            if warm.inputs.get("Emission Strength"):
                warm.inputs["Emission Strength"].default_value = 0.0
        return [{"material": "Material_Warm", "emissionStrength": 0.0}]

    # Station structural roles are bound in bind_station_material_roles(). Their physical scale and
    # response are intentionally role-specific: the previous universal 2.4x transform, 0.72 normal
    # scale, and broad runtime palette mutation filtered every authored surface into the same pale
    # plastic response at the game camera.
    station_profiles = {
        "SF_HullMid_K0PBR": {"textureScale": 0.55, "normalStrength": 0.95, "coatWeight": 0.035, "coatRoughness": 0.42},
        "SF_Armor_K0PBR": {"textureScale": 0.62, "normalStrength": 1.05, "coatWeight": 0.025, "coatRoughness": 0.48},
        "SF_HullDark_K0PBR": {"textureScale": 0.75, "normalStrength": 1.00, "coatWeight": 0.0, "coatRoughness": 0.50},
        "SF_StructuralLight_PBR": {"textureScale": 0.48, "normalStrength": 1.00, "coatWeight": 0.020, "coatRoughness": 0.46},
        "SF_Machinery_K0PBR": {"textureScale": 1.10, "normalStrength": 1.10, "coatWeight": 0.0, "coatRoughness": 0.50},
        "SF_Radiator_PBR": {"textureScale": 1.10, "normalStrength": 1.15, "coatWeight": 0.0, "coatRoughness": 0.55},
        "SF_DockingContact_PBR": {"textureScale": 0.75, "normalStrength": 1.10, "coatWeight": 0.0, "coatRoughness": 0.48},
        "SF_ServiceAccess_PBR": {"textureScale": 0.55, "normalStrength": 1.00, "coatWeight": 0.020, "coatRoughness": 0.50},
        "SF_IndustrialMarking_PBR": {"textureScale": 0.75, "normalStrength": 0.85, "coatWeight": 0.015, "coatRoughness": 0.55},
        "SF_Window_PBR": {"textureScale": 1.00, "normalStrength": 0.28, "coatWeight": 0.24, "coatRoughness": 0.12},
    }
    runtime_roles = {
        "SF_HullMid_K0PBR": "hull",
        "SF_Armor_K0PBR": "hull",
        "SF_HullDark_K0PBR": "mechanical",
        "SF_StructuralLight_PBR": "hull",
        "SF_Machinery_K0PBR": "mechanical",
        "SF_Radiator_PBR": "radiator",
        "SF_DockingContact_PBR": "docking",
        "SF_ServiceAccess_PBR": "service",
        "SF_IndustrialMarking_PBR": "warning",
        "SF_Window_PBR": "glass",
    }
    report = []
    for material_name, profile in station_profiles.items():
        material = bpy.data.materials.get(material_name)
        if material is None or material.node_tree is None:
            raise RuntimeError(f"missing station material for physical calibration: {material_name}")
        material["spacefaceMaterialRole"] = runtime_roles[material_name]
        material["spacefacePaletteTint"] = "none"
        material["spacefaceSurfacePhysicalScale"] = "role-specific-v1"
        material.use_backface_culling = True

        mapping_nodes = [node for node in material.node_tree.nodes if node.type == "MAPPING"]
        for mapping in mapping_nodes:
            current = mapping.inputs["Scale"].default_value
            current[0] = profile["textureScale"]
            current[1] = profile["textureScale"]

        normal_nodes = [node for node in material.node_tree.nodes if node.type == "NORMAL_MAP"]
        if len(normal_nodes) != 1:
            raise RuntimeError(f"{material_name}: expected one Normal Map node, found {len(normal_nodes)}")
        normal_nodes[0].inputs["Strength"].default_value = profile["normalStrength"]

        principled = find_principled(material)
        if principled is None:
            raise RuntimeError(f"{material_name}: missing Principled BSDF during physical calibration")
        if principled.inputs.get("Coat Weight"):
            principled.inputs["Coat Weight"].default_value = profile["coatWeight"]
        if principled.inputs.get("Coat Roughness"):
            principled.inputs["Coat Roughness"].default_value = profile["coatRoughness"]

        report.append({
            "material": material_name,
            "runtimeRole": runtime_roles[material_name],
            "paletteTint": "none",
            "backfaceCulling": True,
            "textureScale": profile["textureScale"],
            "normalStrength": profile["normalStrength"],
            "coatWeight": profile["coatWeight"],
            "coatRoughness": profile["coatRoughness"],
            "mappingNodes": len(mapping_nodes),
        })
    return report


def reproject_rock_uvs() -> list[dict]:
    """Give each rock LOD one coherent spherical geological frame across both material shells."""
    report = []
    bpy.context.view_layer.update()
    for lod in range(3):
        objects = [
            obj for obj in bpy.data.objects
            if obj.type == "MESH" and obj.name.startswith(f"LOD{lod}_Merged_Material_")
        ]
        points = [obj.matrix_world @ vertex.co for obj in objects for vertex in obj.data.vertices]
        if not points:
            continue
        lower = [min(point[axis] for point in points) for axis in range(3)]
        upper = [max(point[axis] for point in points) for axis in range(3)]
        center = [(lower[axis] + upper[axis]) * 0.5 for axis in range(3)]
        extent = [max((upper[axis] - lower[axis]) * 0.5, 1e-5) for axis in range(3)]
        loop_count = 0
        for obj in objects:
            mesh = obj.data
            uv_layer = mesh.uv_layers.get("UVMap") or mesh.uv_layers.new(name="UVMap")
            for polygon in mesh.polygons:
                samples = []
                for loop_index in polygon.loop_indices:
                    vertex = mesh.vertices[mesh.loops[loop_index].vertex_index]
                    point = obj.matrix_world @ vertex.co
                    nx = (point.x - center[0]) / extent[0]
                    ny = (point.y - center[1]) / extent[1]
                    nz = (point.z - center[2]) / extent[2]
                    radius = max(math.sqrt(nx * nx + ny * ny + nz * nz), 1e-6)
                    u = 0.5 + math.atan2(nz, nx) / (math.pi * 2.0)
                    v = 0.5 - math.asin(max(-1.0, min(1.0, ny / radius))) / math.pi
                    samples.append([loop_index, u, v])
                if samples and max(item[1] for item in samples) - min(item[1] for item in samples) > 0.5:
                    for item in samples:
                        if item[1] < 0.5:
                            item[1] += 1.0
                for loop_index, u, v in samples:
                    uv_layer.data[loop_index].uv = (u, v)
                    loop_count += 1
            mesh.update()
        report.append({"lod": lod, "objects": [obj.name for obj in objects], "loops": loop_count})
    return report


def export_objects(asset: str):
    if asset == "helios_rock_a":
        names = {
            "COLLISION_HULL",
            "LOD0_Merged_Material_Rock", "LOD0_Merged_Material_Warm",
            "LOD1_Merged_Material_Rock", "LOD1_Merged_Material_Warm",
            "LOD2_Merged_Material_Rock", "LOD2_Merged_Material_Warm",
            "SOCKET_Structure_Core", "SF_M4_HELIOS_ROCK_A_ROOT",
        }
        return [bpy.data.objects[name] for name in sorted(names) if name in bpy.data.objects]
    return sorted([
        obj for obj in bpy.data.objects
        if obj.type == "MESH" or obj.name.startswith("LOD") or obj.name == "SOCKET_Structure_Core"
    ], key=lambda obj: obj.name)


def _activate_mesh_object(obj) -> None:
    bpy.ops.object.select_all(action="DESELECT")
    obj.hide_set(False)
    obj.hide_viewport = False
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj


def apply_render_mirror_modifiers(obj) -> list[str]:
    """Bake exporter-visible Mirror modifiers into this in-memory candidate copy."""
    applied = []
    modifier_names = sorted(
        modifier.name for modifier in obj.modifiers
        if modifier.type == "MIRROR" and modifier.show_render
    )
    if modifier_names and obj.data.users > 1:
        obj.data = obj.data.copy()
    for modifier_name in modifier_names:
        _activate_mesh_object(obj)
        result = bpy.ops.object.modifier_apply(modifier=modifier_name)
        if "FINISHED" not in result:
            raise RuntimeError(f"{obj.name}: failed to apply Mirror modifier {modifier_name}: {sorted(result)}")
        applied.append(modifier_name)
    remaining = [
        modifier.name for modifier in obj.modifiers
        if modifier.type == "MIRROR" and modifier.show_render
    ]
    if remaining:
        raise RuntimeError(f"{obj.name}: render Mirror modifiers remain after bake: {sorted(remaining)}")
    return applied


def claim_deterministic_mesh_data_name(obj) -> str:
    target = deterministic_mesh_data_name(obj.name)
    if obj.data.users > 1:
        obj.data = obj.data.copy()
    conflict = bpy.data.meshes.get(target)
    if conflict is not None and conflict is not obj.data:
        if conflict.users:
            raise RuntimeError(f"{obj.name}: deterministic mesh name {target} is already in use")
        bpy.data.meshes.remove(conflict)
    obj.data.name = target
    if obj.data.name != target:
        raise RuntimeError(f"{obj.name}: Blender changed deterministic mesh name to {obj.data.name}")
    return target


def project_perimeter_uvs(obj) -> dict | None:
    """Use deterministic box projection so mirrored perimeter seams retain valid tangents."""
    if "_perimeter_" not in obj.name.lower():
        return None
    mesh = obj.data
    uv_layer = mesh.uv_layers.get("UVMap") or mesh.uv_layers.new(name="UVMap")
    scale = PERIMETER_UV_METRES_PER_TILE
    for polygon in mesh.polygons:
        normal = polygon.normal
        dominant = max(range(3), key=lambda axis: abs(float(normal[axis])))
        axes = ((1, 2), (0, 2), (0, 1))[dominant]
        for loop_index in polygon.loop_indices:
            vertex = mesh.vertices[mesh.loops[loop_index].vertex_index]
            uv_layer.data[loop_index].uv = (
                float(vertex.co[axes[0]]) / scale,
                float(vertex.co[axes[1]]) / scale,
            )
    mesh.update()
    obj["spacefaceUvContract"] = "deterministic-box-projection-v1"
    obj["spacefaceUvMetresPerTile"] = scale
    return {
        "method": "deterministic-box-projection-v1",
        "uvLayer": uv_layer.name,
        "loops": len(mesh.loops),
        "metresPerTile": scale,
    }


def validate_mesh_tangents(obj) -> dict | None:
    mesh = obj.data
    if not mesh.uv_layers or not mesh.loops:
        return None
    uv_layer = mesh.uv_layers.active or mesh.uv_layers[0]
    try:
        mesh.calc_tangents(uvmap=uv_layer.name)
        tangent_vectors = [tuple(float(value) for value in loop.tangent) for loop in mesh.loops]
        metrics = measure_tangent_vectors(tangent_vectors)
        invalid_loop_indices = []
        for loop_index, vector in enumerate(tangent_vectors):
            length = math.sqrt(sum(value * value for value in vector))
            if (
                not math.isfinite(length)
                or length <= 1.0e-6
                or abs(length - 1.0) > 1.0e-3
            ):
                invalid_loop_indices.append(loop_index)
        metrics["invalidLoopIndices"] = invalid_loop_indices
    except Exception as error:
        metrics = {
            "total": len(mesh.loops),
            "zero": 0,
            "nonFinite": 0,
            "nonUnit": 0,
            "invalid": max(1, len(mesh.loops)),
            "minLength": None,
            "maxLength": None,
            "valid": False,
            "error": str(error),
        }
    finally:
        try:
            mesh.free_tangents()
        except Exception:
            pass
    return {"uvLayer": uv_layer.name, **metrics}


def prune_pathological_tangent_slivers(obj) -> dict | None:
    """Remove only microscopic perimeter faces whose corner topology defeats MikkTSpace.

    The mirrored station perimeter donors contain a few nearly collinear sliver faces.
    Their tangent-space collapse cannot be repaired by UV reprojection, triangulation,
    flat shading, or custom normals.  Removing the exact failing faces is preferable to
    exporting zero tangent vectors, but the fraction guard keeps this from becoming a
    general-purpose quality-erasing cleanup.
    """
    if "_perimeter_" not in obj.name.lower():
        return None
    before = validate_mesh_tangents(obj)
    invalid_loop_indices = list((before or {}).get("invalidLoopIndices", ()))
    if not invalid_loop_indices:
        return {
            "method": "pathological-tangent-sliver-prune-v1",
            "removedPolygons": 0,
            "removedAreaTotal": 0.0,
            "removedAreaMax": 0.0,
            "removedFraction": 0.0,
        }

    invalid_loops = set(invalid_loop_indices)
    polygon_indices = [
        polygon.index
        for polygon in obj.data.polygons
        if any(loop_index in invalid_loops for loop_index in polygon.loop_indices)
    ]
    polygon_count = len(obj.data.polygons)
    removed_fraction = len(polygon_indices) / max(1, polygon_count)
    if removed_fraction > 0.005:
        raise RuntimeError(
            f"{obj.name}: refusing tangent-sliver prune of {len(polygon_indices)}/{polygon_count} "
            f"faces ({removed_fraction:.4%}); repair the source topology instead"
        )
    areas = [float(obj.data.polygons[index].area) for index in polygon_indices]
    mesh = bmesh.new()
    mesh.from_mesh(obj.data)
    mesh.faces.ensure_lookup_table()
    doomed_faces = [mesh.faces[index] for index in polygon_indices]
    bmesh.ops.delete(mesh, geom=doomed_faces, context="FACES")
    isolated_vertices = [vertex for vertex in mesh.verts if not vertex.link_faces]
    if isolated_vertices:
        bmesh.ops.delete(mesh, geom=isolated_vertices, context="VERTS")
    mesh.to_mesh(obj.data)
    mesh.free()
    obj.data.update()
    project_perimeter_uvs(obj)
    return {
        "method": "pathological-tangent-sliver-prune-v1",
        "sourceInvalidLoops": len(invalid_loop_indices),
        "removedPolygons": len(polygon_indices),
        "removedAreaTotal": sum(areas),
        "removedAreaMax": max(areas) if areas else 0.0,
        "removedFraction": removed_fraction,
    }


def normalize_export_geometry(asset: str) -> list[dict]:
    """Realize modifiers, repair UVs, and fail before export on invalid loop tangents."""
    report = []
    for obj in export_objects(asset):
        if obj.type != "MESH":
            continue
        prior_scale = [float(value) for value in obj.scale]
        if any(abs(value - 1.0) > 1e-5 for value in obj.scale):
            _activate_mesh_object(obj)
            bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
            obj.select_set(False)
        applied_mirrors = apply_render_mirror_modifiers(obj)
        mesh_validation_before = {
            "vertices": len(obj.data.vertices),
            "polygons": len(obj.data.polygons),
            "loops": len(obj.data.loops),
        }
        mesh_validation_changed = bool(obj.data.validate(verbose=False, clean_customdata=False))
        if mesh_validation_changed:
            obj.data.update()
        mesh_validation_after = {
            "vertices": len(obj.data.vertices),
            "polygons": len(obj.data.polygons),
            "loops": len(obj.data.loops),
        }
        ngon_count = sum(1 for polygon in obj.data.polygons if polygon.loop_total > 4)
        if ngon_count:
            mesh = bmesh.new()
            mesh.from_mesh(obj.data)
            bmesh.ops.triangulate(mesh, faces=list(mesh.faces), quad_method="BEAUTY", ngon_method="BEAUTY")
            mesh.to_mesh(obj.data)
            mesh.free()
            obj.data.update()
        uv_repair = project_perimeter_uvs(obj) if asset == "helios_hub_station" else None
        tangent_sliver_prune = (
            prune_pathological_tangent_slivers(obj)
            if asset == "helios_hub_station" and uv_repair is not None
            else None
        )
        mesh_data_name = claim_deterministic_mesh_data_name(obj)
        tangent_validation = validate_mesh_tangents(obj)
        report.append({
            "object": obj.name,
            "meshData": mesh_data_name,
            "priorScale": prior_scale,
            "appliedMirrorModifiers": applied_mirrors,
            "meshValidation": {
                "changed": mesh_validation_changed,
                "before": mesh_validation_before,
                "after": mesh_validation_after,
            },
            "triangulatedNgons": ngon_count,
            "uvRepair": uv_repair,
            "tangentSliverPrune": tangent_sliver_prune,
            "tangentValidation": tangent_validation,
        })
    assert_tangent_receipts(report)
    return report


def export_glb(target: Path, objects) -> None:
    if bpy.context.object and bpy.context.object.mode != "OBJECT":
        bpy.ops.object.mode_set(mode="OBJECT")
    bpy.ops.object.select_all(action="DESELECT")
    for obj in objects:
        obj.hide_set(False)
        obj.hide_viewport = False
        obj.select_set(True)
    target.parent.mkdir(parents=True, exist_ok=True)
    options = dict(
        filepath=str(target), export_format="GLB", use_selection=True, export_apply=True,
        export_yup=True, export_extras=True, export_animations=False, export_materials="EXPORT",
        export_texcoords=True, export_normals=True, export_tangents=True,
        export_image_format="AUTO", export_keep_originals=False,
    )
    try:
        bpy.ops.export_scene.gltf(**options)
    except TypeError:
        bpy.ops.export_scene.gltf(
            filepath=str(target), export_format="GLB", use_selection=True,
            export_apply=True, export_yup=True, export_extras=True,
            export_texcoords=True, export_normals=True, export_tangents=True,
        )
    bpy.ops.object.select_all(action="DESELECT")


def write_previews(output: Path, roles: tuple[str, ...]) -> list[str]:
    preview = output / "textures"
    preview.mkdir(parents=True, exist_ok=True)
    written = []
    for role in roles:
        for channel in ("basecolor", "normal", "orm"):
            stem = f"{role}_{channel}"
            image = next((item for item in bpy.data.images if Path(item.name).stem.lower() == stem), None)
            if not image:
                continue
            target = preview / f"{stem}.png"
            image.filepath_raw = str(target)
            image.file_format = "PNG"
            image.save()
            written.append(str(target))
    return written


def main() -> None:
    parsed = args()
    source = Path(bpy.data.filepath).resolve()
    output = parsed.output_root.resolve()
    output.mkdir(parents=True, exist_ok=True)
    config = ASSETS[parsed.asset]
    maps_root = parsed.maps_root.resolve() if parsed.maps_root else None
    if parsed.asset == "helios_rock_a" and maps_root is None:
        raise RuntimeError("helios_rock_a requires CLI-generated --maps-root")
    image_report = apply_to_blender_images(bpy, config["roles"], maps_root)
    material_role_report = bind_station_material_roles() if parsed.asset == "helios_hub_station" else []
    refresh_image_binding_counts(image_report)
    superseded_images = remove_superseded_surface_images()
    material_calibration = calibrate_materials(parsed.asset)
    uv_report = reproject_rock_uvs() if parsed.asset == "helios_rock_a" else []
    geometry_normalization = (
        [{
            "mode": "preserved-production-geometry",
            "reason": "surface-only authoring pass",
            "meshObjects": len([obj for obj in export_objects(parsed.asset) if obj.type == "MESH"]),
        }]
        if parsed.surface_only
        else normalize_export_geometry(parsed.asset)
    )

    for scene in bpy.data.scenes:
        scene["spacefaceSurfaceRemaster"] = REMASTER_ID
    for obj in export_objects(parsed.asset):
        if obj.type == "EMPTY" and (obj.name.startswith("LOD") or obj.name.endswith("ROOT")):
            obj["spacefaceSurfaceRemaster"] = REMASTER_ID

    previews = write_previews(output, config["roles"])
    externalized_images = (
        externalize_station_surface_images(image_report)
        if parsed.asset == "helios_hub_station" and maps_root is not None
        else []
    )
    blend = output / f"{parsed.asset}_{REMASTER_ID}.blend"
    glb = output / f"{parsed.asset}_{REMASTER_ID}.glb"
    # Keep the authoritative authoring source below repository hosting limits without duplicating
    # the tracked deterministic maps. Blender's lossless file compression does not alter export data.
    bpy.ops.wm.save_as_mainfile(filepath=str(blend), check_existing=False, compress=True)
    export_glb(glb, export_objects(parsed.asset))
    report = {
        "schema": "spaceface.m4SurfaceRemaster.v2",
        "asset": parsed.asset,
        "remasterId": REMASTER_ID,
        "sourceBlend": str(source),
        "sourceBlendSha256": sha256(source),
        "candidateBlend": str(blend),
        "candidateBlendSha256": sha256(blend),
        "candidateGlb": str(glb),
        "candidateGlbSha256": sha256(glb),
        "images": image_report,
        "supersededImagesRemoved": superseded_images,
        "externalizedImages": externalized_images,
        "materialRoles": material_role_report,
        "materialCalibration": material_calibration,
        "geometryNormalization": geometry_normalization,
        "uvProjection": uv_report,
        "surfaceSource": [
            {"role": key, "path": str(path), "sha256": sha256(path)}
            for key, path in ROCK_REFERENCE_FILES.items()
        ] if parsed.asset == "helios_rock_a" else [],
        "previews": [{"path": item, "sha256": sha256(Path(item))} for item in previews],
    }
    report_path = output / "surface-remaster-report.json"
    report_path.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps({"ok": True, "report": str(report_path), "glb": str(glb)}))


if __name__ == "__main__":
    main()

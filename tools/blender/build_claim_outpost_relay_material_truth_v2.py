#!/usr/bin/env python3
"""Build the candidate-only material-truth V2 claim relay.

The canonical relay is opened read-only as the contract source.  This builder replaces only the
LOD presentation meshes, preserving the root, collision proxy, and seven socket transforms.  It
writes isolated source/release candidates; canonical assets and manifests are never touched.
"""
from __future__ import annotations

import hashlib
import importlib.util
import json
import math
import shutil
import time
from array import array
from pathlib import Path

import bmesh
import bpy
from mathutils import Vector


ROOT = Path(__file__).resolve().parents[2]
HELPERS = ROOT / "tools" / "blender" / "build_station_visual_family.py"
SPEC = importlib.util.spec_from_file_location("station_family_helpers", HELPERS)
sf = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(sf)

ASSET_ROOT = ROOT / "assets" / "ships" / "m5_claim_outposts"
CANONICAL_BLEND = ASSET_ROOT / "blender" / "place_claim_outpost_relay.blend"
CANDIDATE_BLEND = ASSET_ROOT / "blender" / "place_claim_outpost_relay_material_truth_v2.blend"
SOURCE_GLB = ASSET_ROOT / "source_candidates" / "material_truth_v2" / "places" / "place_claim_outpost_relay.glb"
RELEASE_GLB = ASSET_ROOT / "release_candidates" / "material_truth_v2" / "places" / "place_claim_outpost_relay.glb"
EVIDENCE_ROOT = ASSET_ROOT / "evidence" / "place_claim_outpost_relay_material_truth_v2"
BUILD_REPORT = EVIDENCE_ROOT / "build_report.json"

ASSET_ID = "place_claim_outpost_relay"
ROOT_NAME = "SF_PLACE_CLAIM_OUTPOST_RELAY_ROOT"
COLLECTION_NAME = "PLACE_CLAIM_OUTPOST_RELAY"
MATERIAL_NAMES = (
    "Material_Hull",
    "Material_Mechanical",
    "Material_Accent",
    "Material_Glass",
    "Material_Warm",
)
FROZEN_NAMES = (
    ROOT_NAME,
    "COLLISION_HULL",
    "SOCKET_Structure_Core",
    "SOCKET_Dock_Approach",
    "SOCKET_Emissive",
    "SOCKET_Module_Depot",
    "SOCKET_Module_Refinery",
    "SOCKET_Module_Defense",
    "SOCKET_Module_Teleporter",
)


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest().upper()


def matrix_values(obj) -> list[float]:
    return [round(value, 9) for row in obj.matrix_local for value in row]


def mesh_values(obj) -> list[list[float]] | None:
    if obj.type != "MESH":
        return None
    return [[round(value, 9) for value in vertex.co] for vertex in obj.data.vertices]


def frozen_contract() -> dict:
    contract = {}
    for name in FROZEN_NAMES:
        obj = bpy.data.objects.get(name)
        if obj is None:
            raise RuntimeError(f"missing frozen contract object: {name}")
        contract[name] = {
            "type": obj.type,
            "parent": obj.parent.name if obj.parent else None,
            "matrixLocal": matrix_values(obj),
            "meshVertices": mesh_values(obj),
            "properties": {key: obj[key] for key in obj.keys()},
        }
    return contract


def assert_frozen(before: dict) -> None:
    after = frozen_contract()
    if before != after:
        changed = [name for name in FROZEN_NAMES if before.get(name) != after.get(name)]
        raise RuntimeError(f"frozen contract mutated: {changed}")


def move_to(obj, collection) -> None:
    for previous in list(obj.users_collection):
        previous.objects.unlink(obj)
    collection.objects.link(obj)


def retune_materials(materials) -> None:
    """Install a restrained glTF-native value hierarchy for dark-space readability.

    The inherited packed textures crushed almost every non-emissive zone to black in the matched
    review rig.  Plain Principled factors keep Blender and runtime GLB response identical while
    separating coated hull, machined load members, warm service hardware, glass, and diagnostics.
    """
    response = {
        "Material_Hull": ((0.32, 0.40, 0.50), 0.58, 0.46, None, 1),
        "Material_Mechanical": ((0.25, 0.30, 0.36), 0.82, 0.34, None, 2),
        "Material_Warm": ((0.62, 0.28, 0.08), 0.64, 0.48, None, 3),
        "Material_Accent": ((0.03, 0.50, 0.72), 0.34, 0.24, ((0.02, 0.30, 0.48, 1.0), 0.65), 4),
        "Material_Glass": ((0.03, 0.13, 0.20), 0.12, 0.15, ((0.015, 0.07, 0.11, 1.0), 0.16), 5),
    }
    for material in materials.values():
        material.use_nodes = True
        material.node_tree.nodes.clear()
    for image in list(bpy.data.images):
        if image.users == 0:
            bpy.data.images.remove(image)

    def generated_map(name, colorspace, pixel):
        preview_size = 256
        image = bpy.data.images.new(name, width=preview_size, height=preview_size, alpha=True)
        image.colorspace_settings.name = colorspace
        pixels = array("f")
        for y in range(preview_size):
            for x in range(preview_size):
                pixels.extend(pixel(x / preview_size, y / preview_size))
        image.pixels.foreach_set(pixels)
        image.update()
        image.scale(1024, 1024)
        image.pack()
        return image

    for name, (color, metallic, roughness, emission, seed) in response.items():
        material = materials[name]
        nodes = material.node_tree.nodes
        links = material.node_tree.links
        output = nodes.new("ShaderNodeOutputMaterial")
        shader = nodes.new("ShaderNodeBsdfPrincipled")
        shader.inputs["Base Color"].default_value = (*color, 1.0)
        shader.inputs["Metallic"].default_value = metallic
        shader.inputs["Roughness"].default_value = roughness
        if emission:
            shader.inputs["Emission Color"].default_value = emission[0]
            shader.inputs["Emission Strength"].default_value = emission[1]
        links.new(shader.outputs["BSDF"], output.inputs["Surface"])

        def base_pixel(u, v, base=color, phase=seed):
            broad = 0.055 * math.sin(math.tau * (u * (1.4 + phase * 0.11) + phase * 0.17))
            directional = 0.025 * math.cos(math.tau * (v * (2.0 + phase * 0.07) - phase * 0.13))
            factor = max(0.78, min(1.18, 1.0 + broad + directional))
            return (
                min(1.0, base[0] * factor),
                min(1.0, base[1] * factor),
                min(1.0, base[2] * factor),
                1.0,
            )

        def orm_pixel(u, v, metal=metallic, rough=roughness, phase=seed):
            response_wave = 0.045 * math.sin(math.tau * (u * 2.3 + v * 1.1 + phase * 0.19))
            return (1.0, max(0.08, min(0.95, rough + response_wave)), metal, 1.0)

        def normal_pixel(u, v, phase=seed):
            nx = 0.5 + 0.012 * math.sin(math.tau * (u * 4.0 + phase * 0.23))
            ny = 0.5 + 0.010 * math.cos(math.tau * (v * 3.0 - phase * 0.11))
            return (nx, ny, 1.0, 1.0)

        stem = name.removeprefix("Material_")
        base_image = generated_map(f"RelayV2_{stem}_BaseColor", "sRGB", base_pixel)
        orm_image = generated_map(f"RelayV2_{stem}_ORM", "Non-Color", orm_pixel)
        normal_image = generated_map(f"RelayV2_{stem}_Normal", "Non-Color", normal_pixel)

        base_node = nodes.new("ShaderNodeTexImage")
        base_node.name = f"{name}_BaseColor"
        base_node.image = base_image
        links.new(base_node.outputs["Color"], shader.inputs["Base Color"])
        orm_node = nodes.new("ShaderNodeTexImage")
        orm_node.name = f"{name}_ORM"
        orm_node.image = orm_image
        separate = nodes.new("ShaderNodeSeparateColor")
        links.new(orm_node.outputs["Color"], separate.inputs["Color"])
        links.new(separate.outputs["Green"], shader.inputs["Roughness"])
        links.new(separate.outputs["Blue"], shader.inputs["Metallic"])
        group = bpy.data.node_groups.get("glTF Material Output")
        if group is None:
            group = bpy.data.node_groups.new("glTF Material Output", "ShaderNodeTree")
            group.interface.new_socket(name="Occlusion", in_out="INPUT", socket_type="NodeSocketFloat")
        gltf_output = nodes.new("ShaderNodeGroup")
        gltf_output.node_tree = group
        links.new(separate.outputs["Red"], gltf_output.inputs["Occlusion"])
        normal_node = nodes.new("ShaderNodeTexImage")
        normal_node.name = f"{name}_Normal"
        normal_node.image = normal_image
        normal_map = nodes.new("ShaderNodeNormalMap")
        normal_map.inputs["Strength"].default_value = 0.34
        links.new(normal_node.outputs["Color"], normal_map.inputs["Color"])
        links.new(normal_map.outputs["Normal"], shader.inputs["Normal"])

        material.diffuse_color = (*color, 1.0)
        material["spaceface.semantic"] = name
        material["spaceface.materialTruth"] = "relay_material_truth_v2"
        material["spaceface.textureRole"] = stem.lower()


def cone(collection, materials, lod, name, radius_a, radius_b, depth, location,
         material="Material_Mechanical", rotation=(0.0, 0.0, 0.0), vertices=None):
    vertices = vertices or (32 if lod == 0 else 20 if lod == 1 else 12)
    bpy.ops.mesh.primitive_cone_add(
        vertices=vertices,
        radius1=radius_a,
        radius2=radius_b,
        depth=depth,
        end_fill_type="NGON",
        location=location,
        rotation=rotation,
    )
    obj = bpy.context.object
    obj.name = f"LOD{lod}_{name}"
    obj.data.materials.append(materials[material])
    bevel = obj.modifiers.new("SF_Chamfer", "BEVEL")
    bevel.width = 0.10 if lod == 0 else 0.07 if lod == 1 else 0.04
    bevel.segments = 2 if lod < 2 else 1
    sf.tag(obj, lod, material, name)
    move_to(obj, collection)
    return obj


def dish(collection, materials, lod, center=(-3.8, 30.2, 0.0), radius=7.2, depth=2.4):
    """Create a shallow faceted paraboloid opening toward +X, not a luminous ring."""
    segments = (32, 20, 12)[lod]
    rings = (6, 4, 3)[lod]
    verts = [(center[0], center[1], center[2])]
    for ring in range(1, rings + 1):
        frac = ring / rings
        x = center[0] + depth * frac * frac
        rr = radius * frac
        for index in range(segments):
            angle = math.tau * index / segments
            verts.append((x, center[1] + rr * math.cos(angle), center[2] + rr * math.sin(angle)))
    faces = []
    for index in range(segments):
        faces.append((0, 1 + index, 1 + (index + 1) % segments))
    for ring in range(1, rings):
        a0 = 1 + (ring - 1) * segments
        b0 = 1 + ring * segments
        for index in range(segments):
            nxt = (index + 1) % segments
            faces.append((a0 + index, b0 + index, b0 + nxt, a0 + nxt))
    mesh = bpy.data.meshes.new(f"LOD{lod}_RelayReflector_mesh")
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(f"LOD{lod}_RelayReflector", mesh)
    obj.data.materials.append(materials["Material_Hull"])
    collection.objects.link(obj)
    solidify = obj.modifiers.new("SF_ReflectorThickness", "SOLIDIFY")
    solidify.thickness = (0.22, 0.18, 0.14)[lod]
    bevel = obj.modifiers.new("SF_ReflectorEdge", "BEVEL")
    bevel.width = (0.10, 0.07, 0.04)[lod]
    bevel.segments = 2 if lod == 0 else 1
    sf.tag(obj, lod, "Material_Hull", "relay_reflector")
    return obj


def segmented_frame(collection, materials, lod, prefix, center, radius, segment_length,
                    depth, thickness, material, count=8):
    """Build a load-bearing segmented frame in the YZ plane."""
    for index in range(count):
        angle = math.tau * index / count
        y = center[1] + radius * math.cos(angle)
        z = center[2] + radius * math.sin(angle)
        sf.box(
            collection,
            materials,
            lod,
            f"{prefix}_{index:02d}",
            (depth, thickness, segment_length),
            (center[0], y, z),
            material,
            min(thickness, depth) * 0.16,
            (angle, 0.0, 0.0),
        )


def truss_run(collection, materials, lod, prefix, x0, x1, y, z, half_height=3.1, half_width=2.7):
    rails = [
        (y - half_height, z - half_width),
        (y - half_height, z + half_width),
        (y + half_height, z - half_width),
        (y + half_height, z + half_width),
    ]
    rail_width = (0.72, 0.82, 1.00)[lod]
    for index, (rail_y, rail_z) in enumerate(rails):
        sf.beam_between(
            collection, materials, lod, f"{prefix}_Rail_{index}",
            (x0, rail_y, rail_z), (x1, rail_y, rail_z), rail_width, "Material_Mechanical",
        )
    bays = (5, 3, 2)[lod]
    for bay in range(bays + 1):
        x = x0 + (x1 - x0) * bay / bays
        sf.beam_between(
            collection, materials, lod, f"{prefix}_FrameA_{bay}",
            (x, y - half_height, z - half_width), (x, y + half_height, z - half_width),
            rail_width * 0.76, "Material_Mechanical",
        )
        sf.beam_between(
            collection, materials, lod, f"{prefix}_FrameB_{bay}",
            (x, y - half_height, z + half_width), (x, y + half_height, z + half_width),
            rail_width * 0.76, "Material_Mechanical",
        )
    if lod < 2:
        for bay in range(bays):
            xa = x0 + (x1 - x0) * bay / bays
            xb = x0 + (x1 - x0) * (bay + 1) / bays
            low, high = (y - half_height, y + half_height) if bay % 2 == 0 else (y + half_height, y - half_height)
            sf.beam_between(
                collection, materials, lod, f"{prefix}_Brace_{bay}",
                (xa, low, z - half_width), (xb, high, z - half_width),
                rail_width * 0.62, "Material_Warm",
            )


def build_anchor_system(collection, materials, lod):
    sf.ico(collection, materials, lod, "ClaimRock", 18.0, (-4.0, -5.0, 0.0),
           "Material_Hull", (1.16, 0.70, 1.08), 113)

    # Axis-aligned terminal shoes preserve the frozen 104.3364 x 55.3196 x 95.859 m envelope.
    sf.box(collection, materials, lod, "AftAnchorShoe", (4.0, 5.0, 12.0),
           (-46.8364, -5.0, 0.0), "Material_Mechanical", 0.30)
    sf.box(collection, materials, lod, "PortAnchorShoe", (12.0, 5.0, 6.0),
           (-5.0, -5.0, -44.9295), "Material_Mechanical", 0.30)
    sf.box(collection, materials, lod, "StarboardAnchorShoe", (12.0, 5.0, 6.0),
           (-5.0, -5.0, 44.9295), "Material_Mechanical", 0.30)
    sf.box(collection, materials, lod, "KeelAnchorShoe", (12.0, 2.0, 8.0),
           (-5.0, -16.6696, 0.0), "Material_Mechanical", 0.24)

    anchors = [
        ((-18.0, -3.0, 0.0), (-44.9, -5.0, 0.0)),
        ((-7.0, -3.0, -17.0), (-5.0, -5.0, -41.9)),
        ((-7.0, -3.0, 17.0), (-5.0, -5.0, 41.9)),
        ((-7.0, -10.0, 0.0), (-5.0, -15.6, 0.0)),
    ]
    for index, (start, end) in enumerate(anchors):
        sf.beam_between(collection, materials, lod, f"AnchorLoadPath_{index}", start, end,
                        (1.35, 1.55, 1.85)[lod], "Material_Mechanical")
        if lod < 2:
            offset = Vector((0.0, 2.3, 2.1 if index % 2 == 0 else -2.1))
            sf.beam_between(collection, materials, lod, f"AnchorGusset_{index}",
                            Vector(start) + offset, Vector(end), 0.72 if lod == 0 else 0.92,
                            "Material_Warm")

    shoe_count = (10, 6, 4)[lod]
    for index in range(shoe_count):
        angle = math.tau * index / shoe_count
        x = -4.0 + 22.0 * math.cos(angle)
        z = 20.0 * math.sin(angle)
        sf.box(collection, materials, lod, f"RockClampShoe_{index:02d}",
               (5.4, 2.4, 3.0), (x, -3.2, z), "Material_Warm", 0.24,
               (0.0, -angle, 0.0))
        if lod == 0:
            sf.cyl(collection, materials, lod, f"RockBolt_{index:02d}", 0.34, 4.0,
                   (x, -5.0, z), "Material_Mechanical", vertices=12,
                   rot=(math.pi / 2, 0.0, 0.0))


def rectangular_frame(collection, materials, lod, name, center, outer_size, inner_size,
                      depth, material="Material_Hull", bevel=0.12):
    """Build one closed frame solid instead of four overlapping beveled boxes."""
    center_x, center_y, center_z = center
    outer_x, outer_y = (value * 0.5 for value in outer_size)
    inner_x, inner_y = (value * 0.5 for value in inner_size)
    low_z = center_z - depth * 0.5
    high_z = center_z + depth * 0.5
    outer = (
        (-outer_x, -outer_y),
        (outer_x, -outer_y),
        (outer_x, outer_y),
        (-outer_x, outer_y),
    )
    inner = (
        (-inner_x, -inner_y),
        (inner_x, -inner_y),
        (inner_x, inner_y),
        (-inner_x, inner_y),
    )
    vertices = [
        (center_x + x, center_y + y, z)
        for z in (low_z, high_z)
        for loop in (outer, inner)
        for x, y in loop
    ]
    faces = []
    outer_back, inner_back, outer_front, inner_front = range(0, 4), range(4, 8), range(8, 12), range(12, 16)
    for index in range(4):
        next_index = (index + 1) % 4
        faces.extend((
            # Front and back annuli.
            (outer_front[index], outer_front[next_index], inner_front[next_index], inner_front[index]),
            (outer_back[next_index], outer_back[index], inner_back[index], inner_back[next_index]),
            # Outer wall and the oppositely wound wall facing the opening.
            (outer_back[index], outer_back[next_index], outer_front[next_index], outer_front[index]),
            (inner_back[next_index], inner_back[index], inner_front[index], inner_front[next_index]),
        ))
    mesh = bpy.data.meshes.new(f"LOD{lod}_{name}_Mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(f"LOD{lod}_{name}", mesh)
    collection.objects.link(obj)
    obj.data.materials.append(materials[material])
    modifier = obj.modifiers.new("SF_Chamfer", "BEVEL")
    modifier.width = max(0.035, bevel * (1.0 if lod == 0 else 0.7 if lod == 1 else 0.45))
    modifier.segments = 3 if lod == 0 else 2 if lod == 1 else 1
    modifier.limit_method = "ANGLE"
    sf.tag(obj, lod, material, name)
    return obj


def build_core_and_hardpoints(collection, materials, lod):
    sf.cyl(collection, materials, lod, "SteppedCorePressureShell", 12.2, 20.0,
           (0.0, 7.0, 0.0), "Material_Hull", vertices=(12, 10, 8)[lod],
           rot=(0.0, math.pi / 2, 0.0))
    sf.cyl(collection, materials, lod, "CoreAftFrame", 13.1, 2.2,
           (-10.4, 7.0, 0.0), "Material_Mechanical", vertices=(12, 10, 8)[lod],
           rot=(0.0, math.pi / 2, 0.0))
    sf.cyl(collection, materials, lod, "CoreForwardFrame", 13.1, 2.2,
           (10.4, 7.0, 0.0), "Material_Mechanical", vertices=(12, 10, 8)[lod],
           rot=(0.0, math.pi / 2, 0.0))
    sf.box(collection, materials, lod, "ServiceBayRecess", (10.0, 7.0, 1.0),
           (0.0, 7.0, 12.0), "Material_Mechanical", 0.10)
    rectangular_frame(
        collection,
        materials,
        lod,
        "ServiceBayFrame",
        (0.0, 7.0, 12.0),
        (12.0, 9.0),
        (10.0, 7.0),
        1.8,
    )
    slit_count = (5, 3, 2)[lod]
    for index in range(slit_count):
        x = (index - (slit_count - 1) / 2) * 1.65
        sf.box(collection, materials, lod, f"ServiceStatus_{index}", (0.8, 0.35, 0.32),
               (x, 7.0, 12.75), "Material_Glass", 0.04)

    hardpoints = {
        "Depot": (-20.0, 1.0, -20.0),
        "Refinery": (-20.0, 1.0, 20.0),
        "Defense": (20.0, 1.0, -20.0),
        "Teleporter": (20.0, 1.0, 20.0),
    }
    for name, location in hardpoints.items():
        sf.box(collection, materials, lod, f"ModuleHardpoint_{name}", (7.2, 2.0, 7.2),
               location, "Material_Warm", 0.30)
        sf.beam_between(collection, materials, lod, f"ModuleClevis_{name}",
                        (-6.0 if location[0] < 0 else 6.0, -1.0, -7.0 if location[2] < 0 else 7.0),
                        location, 0.95 if lod < 2 else 1.30, "Material_Mechanical")


def build_freight_vessels(collection, materials, lod):
    for side in (-1, 1):
        z = side * 27.0
        radius = 6.8 if side < 0 else 7.5
        vessel_y = 6.4 if side < 0 else 8.0
        vessel_depth = 19.5 if side < 0 else 16.5
        low_y = vessel_y - vessel_depth * 0.5
        high_y = vessel_y + vessel_depth * 0.5
        sf.cyl(collection, materials, lod, f"FreightVessel_{'P' if side < 0 else 'S'}",
               radius, vessel_depth, (-9.0, vessel_y, z), "Material_Hull",
               vertices=(32, 20, 12)[lod], rot=(math.pi / 2, 0.0, 0.0))
        sf.sphere(collection, materials, lod, f"FreightCapLow_{side}", radius,
                  (-9.0, low_y, z), "Material_Hull", (1.0, 0.34, 1.0))
        sf.sphere(collection, materials, lod, f"FreightCapHigh_{side}", radius,
                  (-9.0, high_y, z), "Material_Hull", (1.0, 0.34, 1.0))
        for offset in (-5.1, 5.1):
            sf.box(collection, materials, lod, f"VesselSaddle_{side}_{offset}",
                   (3.2, 5.0, 4.2), (-9.0 + offset, -2.0, z),
                   "Material_Mechanical", 0.25)
        straps = (-4.5, 4.5) if lod < 2 else (0.0,)
        for index, y in enumerate(straps):
            segmented_frame(collection, materials, lod, f"VesselClamp_{side}_{index}",
                            (-9.0, vessel_y + y, z), radius + 0.15,
                            (radius + 0.15) * 0.80, 0.55, 0.65,
                            "Material_Warm", count=(8 if lod < 2 else 6))
        outward = z + side * (radius + 0.05)
        sf.cyl(collection, materials, lod, f"VesselManway_{side}", 1.7, 0.75,
               (-9.0, 8.5 if side < 0 else 5.5, outward), "Material_Warm",
               vertices=(20, 14, 10)[lod])
        if lod == 0:
            sf.box(collection, materials, lod, f"VesselJunction_{side}", (3.2, 3.0, 1.0),
                   (-4.0, 11.0 if side < 0 else 3.0, outward), "Material_Mechanical", 0.12)
            sf.box(collection, materials, lod, f"VesselIndicator_{side}", (1.4, 0.6, 0.32),
                   (-4.0, 11.0 if side < 0 else 3.0, outward + side * 0.65), "Material_Glass", 0.04)


def build_transfer_and_receiver(collection, materials, lod):
    for side in (-1, 1):
        z = side * 20.0
        truss_run(collection, materials, lod, f"TransferSpine_{side}", 8.5, 37.0, 6.0, z)
        sf.box(collection, materials, lod, f"TransferRoot_{side}", (6.0, 9.0, 10.0),
               (10.5, 6.0, z), "Material_Hull", 0.38)
        sf.cyl(collection, materials, lod, f"TransferFlange_{side}", 5.1, 2.2,
               (38.0, 6.0, z), "Material_Hull", vertices=(12, 10, 8)[lod],
               rot=(0.0, math.pi / 2, 0.0))
        for height in (3.0, 9.0):
            sf.beam_between(collection, materials, lod, f"ReceiverCollector_{side}_{height}",
                            (37.0, height, z), (44.0, 2.0 + (height - 6.0) * 0.45, side * 6.0),
                            (0.85, 1.0, 1.2)[lod], "Material_Mechanical")

    receiver_center = (48.0, 2.0, 0.0)
    segmented_frame(collection, materials, lod, "RecoveryOuterFrame", receiver_center,
                    9.0, 7.2, 7.0, 2.1, "Material_Hull", count=8)
    segmented_frame(collection, materials, lod, "RecoveryInnerWall", (48.0, 2.0, 0.0),
                    5.7, 4.8, 5.6, 1.2, "Material_Mechanical", count=8)
    sf.cyl(collection, materials, lod, "RecoveryBackplate", 5.0, 0.9,
           (44.7, 2.0, 0.0), "Material_Mechanical", vertices=(32, 20, 12)[lod],
           rot=(0.0, math.pi / 2, 0.0))
    for index in range(8 if lod < 2 else 4):
        angle = math.tau * index / (8 if lod < 2 else 4)
        y = 2.0 + 6.8 * math.cos(angle)
        z = 6.8 * math.sin(angle)
        sf.box(collection, materials, lod, f"RecoveryLockLug_{index}", (2.0, 2.0, 3.0),
               (54.5, y, z), "Material_Warm", 0.18, (angle, 0.0, 0.0))
    for index, angle in enumerate((math.pi / 4, 3 * math.pi / 4, 5 * math.pi / 4, 7 * math.pi / 4)):
        y = 2.0 + 7.7 * math.cos(angle)
        z = 7.7 * math.sin(angle)
        sf.box(collection, materials, lod, f"RecoveryDiagnostic_{index}", (0.42, 0.55, 1.7),
               (52.15, y, z), "Material_Accent", 0.05, (angle, 0.0, 0.0))
    sf.box(collection, materials, lod, "ReceiverInspectionWindow", (0.35, 2.4, 3.4),
           (44.15, 2.0, 0.0), "Material_Glass", 0.06)


def build_mast_and_aperture(collection, materials, lod):
    base_y = 16.0
    top_y = 27.0
    corners = ((-5.5, -2.0), (-5.5, 2.0), (-1.5, -2.0), (-1.5, 2.0))
    for index, (x, z) in enumerate(corners):
        sf.beam_between(collection, materials, lod, f"MastLeg_{index}",
                        (x, base_y, z), (x + 0.5, top_y, z * 0.65),
                        (0.72, 0.88, 1.05)[lod], "Material_Mechanical")
    levels = (4, 3, 2)[lod]
    for level in range(levels):
        y0 = base_y + (top_y - base_y) * level / levels
        y1 = base_y + (top_y - base_y) * (level + 1) / levels
        sf.beam_between(collection, materials, lod, f"MastCrossA_{level}",
                        (-5.5, y0, -2.0), (-1.0, y1, 1.3),
                        (0.42, 0.55, 0.72)[lod], "Material_Warm")
        sf.beam_between(collection, materials, lod, f"MastCrossB_{level}",
                        (-5.5, y1, 2.0), (-1.0, y0, -1.3),
                        (0.42, 0.55, 0.72)[lod], "Material_Warm")

    dish(collection, materials, lod)
    sf.cyl(collection, materials, lod, "ApertureGimbal", 2.5, 5.2,
           (-5.2, 30.2, 0.0), "Material_Mechanical", vertices=(20, 14, 10)[lod],
           rot=(0.0, math.pi / 2, 0.0))
    ribs = (8, 4, 3)[lod]
    for index in range(ribs):
        angle = math.tau * index / ribs
        rim = (-1.4, 30.2 + 7.2 * math.cos(angle), 7.2 * math.sin(angle))
        sf.beam_between(collection, materials, lod, f"ReflectorRib_{index}",
                        (-5.7, 30.2, 0.0), rim,
                        (0.32, 0.44, 0.58)[lod], "Material_Mechanical")
    cone(collection, materials, lod, "FeedHorn", 1.1, 0.42, 2.6,
         (3.7, 30.2, 0.0), "Material_Warm", (0.0, math.pi / 2, 0.0))
    sf.beam_between(collection, materials, lod, "FeedSupportTop",
                    (-1.0, 35.0, 0.0), (3.0, 30.2, 0.0),
                    (0.30, 0.42, 0.58)[lod], "Material_Mechanical")
    sf.beam_between(collection, materials, lod, "FeedSupportBottom",
                    (-1.0, 25.4, 0.0), (3.0, 30.2, 0.0),
                    (0.30, 0.42, 0.58)[lod], "Material_Mechanical")
    sf.box(collection, materials, lod, "ApertureTopBeacon", (1.1, 1.0, 1.1),
           (-3.8, 37.15, 0.0), "Material_Accent", 0.10)

    # Rooted waveguide segments terminate at the feed and the core junction box.
    route = [(-3.8, 26.0, -2.1), (-3.8, 20.0, -2.1), (1.5, 16.0, -4.0), (2.0, 12.0, -6.5)]
    for index in range(len(route) - 1):
        sf.beam_between(collection, materials, lod, f"Waveguide_{index}", route[index], route[index + 1],
                        (0.48, 0.60, 0.82)[lod], "Material_Warm")
    sf.box(collection, materials, lod, "WaveguideJunction", (3.2, 3.2, 1.8),
           (2.0, 12.0, -6.5), "Material_Mechanical", 0.16)


def build_cables_and_markers(collection, materials, lod):
    cable_routes = [
        [(-2.0, 11.0, -8.0), (-6.0, 7.0, -15.0), (-9.0, 7.0, -20.0)],
        [(-2.0, 10.0, 8.0), (-6.0, 5.0, 15.0), (-9.0, 5.0, 20.0)],
        [(9.0, 5.0, -8.0), (18.0, 2.0, -12.0), (30.0, 3.0, -17.0)],
        [(9.0, 7.0, 8.0), (18.0, 4.0, 12.0), (30.0, 6.0, 17.0)],
    ]
    for route_index, route in enumerate(cable_routes[: (4, 3, 2)[lod]]):
        for segment in range(len(route) - 1):
            sf.beam_between(collection, materials, lod, f"ServiceCable_{route_index}_{segment}",
                            route[segment], route[segment + 1],
                            (0.34, 0.46, 0.66)[lod], "Material_Mechanical")
        for end_index, endpoint in enumerate((route[0], route[-1])):
            sf.cyl(collection, materials, lod, f"CableGland_{route_index}_{end_index}",
                   (0.62, 0.72, 0.86)[lod], 0.85, endpoint, "Material_Warm",
                   vertices=(14, 10, 8)[lod])
    for index, z in enumerate((-9.0, 9.0)):
        sf.box(collection, materials, lod, f"OwnershipMarker_{index}", (2.8, 0.55, 0.55),
               (8.5, 13.0, z), "Material_Accent", 0.05)


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


def triangulate_draw_group(obj) -> int:
    """Bake a stable triangle topology so Blender can export portable tangents."""
    expected_triangles = triangles(obj)
    mesh = obj.data
    edit_mesh = bmesh.new()
    try:
        edit_mesh.from_mesh(mesh)
        bmesh.ops.triangulate(
            edit_mesh,
            faces=list(edit_mesh.faces),
            quad_method="FIXED",
            ngon_method="EAR_CLIP",
        )
        edit_mesh.to_mesh(mesh)
    finally:
        edit_mesh.free()
    mesh.update()
    if len(mesh.polygons) != expected_triangles or any(
        len(polygon.vertices) != 3 for polygon in mesh.polygons
    ):
        raise RuntimeError(f"deterministic triangulation failed for {obj.name}")
    return expected_triangles


def welded_edge_topology(obj) -> dict:
    """Mirror the candidate admission's 1e-6 position-welded edge-use regression."""
    welded_by_position = {}
    welded_by_vertex = {}
    for vertex in obj.data.vertices:
        point = obj.matrix_world @ vertex.co
        key = tuple(math.floor(value * 1_000_000 + 0.5) for value in point)
        welded_by_vertex[vertex.index] = welded_by_position.setdefault(
            key, len(welded_by_position)
        )

    edge_uses = {}
    for polygon in obj.data.polygons:
        if len(polygon.vertices) != 3:
            raise RuntimeError(f"topology audit requires triangles: {obj.name}")
        triangle = [welded_by_vertex[index] for index in polygon.vertices]
        for left, right in (
            (triangle[0], triangle[1]),
            (triangle[1], triangle[2]),
            (triangle[2], triangle[0]),
        ):
            edge = (left, right) if left < right else (right, left)
            edge_uses[edge] = edge_uses.get(edge, 0) + 1

    histogram = {}
    for count in edge_uses.values():
        histogram[str(count)] = histogram.get(str(count), 0) + 1
    bad_edges = sum(count != 2 for count in edge_uses.values())
    return {
        "vertices": len(obj.data.vertices),
        "weldedVertices": len(welded_by_position),
        "edges": len(edge_uses),
        "badEdges": bad_edges,
        "edgeUseHistogram": dict(sorted(histogram.items(), key=lambda item: int(item[0]))),
    }


def build() -> dict:
    if not CANONICAL_BLEND.exists():
        raise FileNotFoundError(CANONICAL_BLEND)
    # Opening a main file invalidates Blender's current operator context.  Interactive MCP callers
    # therefore open the canonical file in a preceding call; background/CLI callers can still use
    # this entry point directly because their context is rebuilt by the file-open operator.
    if Path(bpy.data.filepath).resolve() != CANONICAL_BLEND.resolve():
        bpy.ops.wm.open_mainfile(filepath=str(CANONICAL_BLEND))
    source_hash = sha256(CANONICAL_BLEND)
    frozen = frozen_contract()
    root = bpy.data.objects[ROOT_NAME]
    collection = bpy.data.collections.get(COLLECTION_NAME)
    if collection is None:
        raise RuntimeError(f"missing collection {COLLECTION_NAME}")
    materials = {name: bpy.data.materials[name] for name in MATERIAL_NAMES}
    retune_materials(materials)

    for obj in list(collection.objects):
        if obj.type == "MESH" and obj.name.startswith("LOD"):
            bpy.data.objects.remove(obj, do_unlink=True)

    for lod in range(3):
        build_anchor_system(collection, materials, lod)
        build_core_and_hardpoints(collection, materials, lod)
        build_freight_vessels(collection, materials, lod)
        build_transfer_and_receiver(collection, materials, lod)
        build_mast_and_aperture(collection, materials, lod)
        build_cables_and_markers(collection, materials, lod)

    draw_groups = []
    topology_report = {}
    lod_report = {}
    for lod in range(3):
        groups = sf.join_draw_groups(collection, lod)
        for obj in groups:
            # The shared join helper retains the active primitive's transform.  Bake that transform
            # so exported draw groups are identity-local and their bounds describe real geometry,
            # not a rotated object-space bounding box.
            bpy.ops.object.select_all(action="DESELECT")
            obj.select_set(True)
            bpy.context.view_layer.objects.active = obj
            bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
            obj.parent = root
            triangulate_draw_group(obj)
            topology = welded_edge_topology(obj)
            if topology["badEdges"]:
                raise RuntimeError(
                    f"non-manifold welded edge use in {obj.name}: {topology['badEdges']}"
                )
            topology_report[obj.name] = topology
            obj.hide_render = lod != 0
            # Selected glTF export still excludes viewport-hidden objects.  Keep all three LODs
            # exportable; render visibility continues to make LOD0 the candidate scene default.
            obj.hide_viewport = False
        draw_groups.extend(groups)
        lod_report[f"lod{lod}"] = {
            "triangles": sum(triangles(obj) for obj in groups),
            "drawGroups": len(groups),
            "materials": sorted(obj.data.materials[0].name for obj in groups),
        }

    bpy.context.view_layer.update()
    lod0 = [obj for obj in draw_groups if obj.name.startswith("LOD0_")]
    minimum, maximum, dimensions = calculate_bounds(lod0)
    expected = Vector((104.3364, 55.3196, 95.8590))
    for axis in range(3):
        if abs(dimensions[axis] - expected[axis]) > 0.001:
            raise RuntimeError(
                f"frozen envelope mismatch axis {axis}: {dimensions[axis]:.6f} vs {expected[axis]:.6f}"
            )
    assert_frozen(frozen)

    metadata = json.loads(root.get("spacefaceAssetJson", "{}"))
    metadata.update({
        "triangleCount": lod_report["lod0"]["triangles"],
        "lodTriangles": {key: value["triangles"] for key, value in lod_report.items()},
        "drawGroupsPerLod": {key: value["drawGroups"] for key, value in lod_report.items()},
        "lod0AabbSize": [round(value, 4) for value in dimensions],
        "wiringStatus": "isolated_candidate",
        "candidateId": "material_truth_v2",
        "builder": "tools/blender/build_claim_outpost_relay_material_truth_v2.py",
    })
    metadata_text = json.dumps(metadata, separators=(",", ":"))
    root["spacefaceAssetJson"] = metadata_text
    root["spaceface.candidateId"] = "material_truth_v2"
    root["spaceface.builder"] = "tools/blender/build_claim_outpost_relay_material_truth_v2.py"
    bpy.context.scene["spacefaceAssetJson"] = metadata_text
    bpy.context.scene["spaceface.sourceBlendSha256"] = source_hash

    CANDIDATE_BLEND.parent.mkdir(parents=True, exist_ok=True)
    SOURCE_GLB.parent.mkdir(parents=True, exist_ok=True)
    RELEASE_GLB.parent.mkdir(parents=True, exist_ok=True)
    EVIDENCE_ROOT.mkdir(parents=True, exist_ok=True)

    export_objects = [bpy.data.objects[name] for name in FROZEN_NAMES] + draw_groups
    hidden_export_objects = [
        obj.name for obj in export_objects if obj.hide_viewport or obj.hide_get()
    ]
    if hidden_export_objects:
        raise RuntimeError(f"viewport-hidden export objects: {hidden_export_objects}")
    if len({obj.name for obj in export_objects}) != len(FROZEN_NAMES) + 15:
        raise RuntimeError("export set must contain the frozen contract and fifteen LOD draw groups")
    bpy.ops.wm.save_as_mainfile(filepath=str(CANDIDATE_BLEND))

    bpy.ops.object.select_all(action="DESELECT")
    for obj in export_objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = root
    bpy.ops.export_scene.gltf(
        filepath=str(SOURCE_GLB),
        export_format="GLB",
        use_selection=True,
        export_yup=True,
        export_apply=True,
        export_extras=True,
        export_texcoords=True,
        export_normals=True,
        export_tangents=True,
        export_materials="EXPORT",
    )
    shutil.copy2(SOURCE_GLB, RELEASE_GLB)

    report = {
        "schema": "spaceface.claimOutpostRelayMaterialTruthBuild.v1",
        "assetId": ASSET_ID,
        "candidateId": "material_truth_v2",
        "builtAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "builder": str(Path(__file__).relative_to(ROOT)).replace("\\", "/"),
        "canonicalBlend": str(CANONICAL_BLEND.relative_to(ROOT)).replace("\\", "/"),
        "canonicalBlendSha256": source_hash,
        "candidateBlend": str(CANDIDATE_BLEND.relative_to(ROOT)).replace("\\", "/"),
        "candidateBlendSha256": sha256(CANDIDATE_BLEND),
        "sourceCandidate": str(SOURCE_GLB.relative_to(ROOT)).replace("\\", "/"),
        "sourceCandidateSha256": sha256(SOURCE_GLB),
        "releaseCandidate": str(RELEASE_GLB.relative_to(ROOT)).replace("\\", "/"),
        "releaseCandidateSha256": sha256(RELEASE_GLB),
        "bytes": {"source": SOURCE_GLB.stat().st_size, "release": RELEASE_GLB.stat().st_size},
        "bounds": {
            "min": [round(value, 4) for value in minimum],
            "max": [round(value, 4) for value in maximum],
            "size": [round(value, 4) for value in dimensions],
        },
        "lod": lod_report,
        "export": {
            "objectCount": len(export_objects),
            "meshNodeCount": len(draw_groups) + 1,
            "lodMeshNodes": {
                f"lod{lod}": sum(1 for obj in draw_groups if obj.name.startswith(f"LOD{lod}_"))
                for lod in range(3)
            },
            "collisionMeshNodes": 1,
            "drawGroupsTriangulated": len(draw_groups),
            "nonTriangleDrawGroupFaces": sum(
                1
                for obj in draw_groups
                for polygon in obj.data.polygons
                if len(polygon.vertices) != 3
            ),
        },
        "weldedEdgeTopology": {
            "positionPrecision": 0.000001,
            "allDrawGroupsClosed": True,
            "drawGroups": topology_report,
        },
        "materials": list(MATERIAL_NAMES),
        "frozenContract": {
            "root": ROOT_NAME,
            "collision": "COLLISION_HULL",
            "sockets": list(FROZEN_NAMES[2:]),
            "verifiedUnchanged": True,
        },
        "canonicalAssetsModified": False,
    }
    BUILD_REPORT.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    return report


if __name__ == "__main__":
    result = build()
    print(json.dumps(result, indent=2))

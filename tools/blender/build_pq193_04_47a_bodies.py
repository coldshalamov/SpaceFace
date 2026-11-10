#!/usr/bin/env python3
"""PQ-193.04 — 47-A story bodies that read as designed objects at the chase camera.

Two packaged bodies, built with the PQ-193.03 manufacturing family (same primitives, bevel families,
UV projection, join/export path and GLB metadata contract):

  pod_47a_evidence_spindle   the mission's evidence can. Same ISO can language as the ordinary tow can,
                             but sealed: custody straps, evidence chevron bands, a bolted access cover,
                             a ledger case with a recessed status lamp, and a padlocked door seal bar.
  place_47a_rescue_capsule   the civilian lifeboat. A lofted pressure hull (not a tube with rings), a
                             painted distress band, recessed viewport with cabin light, dorsal beacon
                             housing, docking collar with clamps, keel skids, RCS quads, and an aft
                             skirt with heat shield and bells.

Usage:
  blender --background --python tools/blender/build_pq193_04_47a_bodies.py -- \\
    --asset pod_47a_evidence_spindle --output <glb>
  blender --background --python tools/blender/build_pq193_04_47a_bodies.py -- \\
    --asset place_47a_rescue_capsule --output <glb>
"""
from __future__ import annotations

import argparse
import json
import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector

TOOLS = Path(__file__).resolve().parent
if str(TOOLS) not in sys.path:
    sys.path.insert(0, str(TOOLS))
import build_pq193_03_manufactured as base  # noqa: E402

ASSETS = {
    "pod_47a_evidence_spindle": {
        "root": "pod_47a_evidence_spindle",
        "asset_id": "SF_POD_47A_EVIDENCE_SPINDLE",
        "slot": "pod",
        "materials": ("Material_Hull", "Material_Mechanical", "Material_Evidence", "Material_Seal", "Material_Lamp"),
        "join_names": {
            "Material_Hull": "Spindle_Shell",
            "Material_Mechanical": "Spindle_Mechanical_Merged",
            "Material_Evidence": "Spindle_Evidence_Bands",
            "Material_Seal": "Spindle_Custody_Seals",
            "Material_Lamp": "HOOK_EMISSIVE",
        },
        "mount_translation_gltf": (5.0, 1.0, 0.0),
        "build": "spindle",
        "lods": False,
        "texture_size": 256,
        "lamp": ((1.0, 0.56, 0.12), 2.6),
    },
    "place_47a_rescue_capsule": {
        "root": "SF_PLACE_47A_RESCUE_CAPSULE_ROOT",
        "asset_id": "SF_PLACE_47A_RESCUE_CAPSULE",
        "slot": "place",
        "materials": ("Material_Ceramic", "Material_Mechanical", "Material_Distress", "Material_Glass", "Material_Lamp"),
        "join_names": {
            "Material_Ceramic": "Capsule_Pressure_Hull",
            "Material_Mechanical": "Capsule_Mechanical_Merged",
            "Material_Distress": "Capsule_Distress_Paint",
            "Material_Glass": "Capsule_Viewport_Glass",
            "Material_Lamp": "HOOK_EMISSIVE",
        },
        "build": "capsule",
        "lods": False,
        "texture_size": 256,
        "lamp": ((1.0, 0.24, 0.10), 3.2),
    },
}

# (base colour, metallic, roughness, family)
MATERIAL_TUNING = {
    "Material_Hull": ((0.072, 0.078, 0.082), 0.14, 0.52, "coat"),
    "Material_Mechanical": ((0.36, 0.39, 0.41), 0.88, 0.30, "machined"),
    "Material_Evidence": ((0.86, 0.60, 0.06), 0.08, 0.48, "chevron"),
    "Material_Seal": ((0.66, 0.05, 0.06), 0.04, 0.42, "tape"),
    "Material_Lamp": ((0.95, 0.62, 0.30), 0.0, 0.20, "lamp"),
    "Material_Ceramic": ((0.70, 0.68, 0.62), 0.02, 0.62, "ceramic"),
    "Material_Distress": ((0.74, 0.16, 0.07), 0.04, 0.46, "distress"),
    "Material_Glass": ((0.028, 0.045, 0.060), 0.0, 0.08, "glass"),
}


def texture_pixel(material_name: str, kind: str, x: int, y: int, width: int, height: int) -> bytes:
    base_rgb, metallic, roughness, family = MATERIAL_TUNING[material_name]
    u = x / max(1, width - 1)
    v = y / max(1, height - 1)
    broad = 0.58 * math.sin(math.tau * (u * 0.73 + v * 0.31) + 0.41) + 0.42 * math.sin(math.tau * (u * 1.19 - v * 0.47) + 1.27)
    directional = 0.65 * math.sin(math.tau * (v * 83.0 + u * 0.13)) + 0.35 * math.sin(math.tau * (v * 149.0 - u * 0.08) + 0.73)
    diagonal = ((u + v) * 5.0) % 1.0
    seam_u = min(u % 0.25, 0.25 - (u % 0.25)) < 0.006
    seam_v = min(v % 0.5, 0.5 - (v % 0.5)) < 0.006

    if kind == "normal":
        if family == "machined":
            nx, ny = 128 + 5.0 * directional, 128 + 0.7 * broad
        elif family in ("glass", "lamp"):
            nx, ny = 128, 128
        elif family == "ceramic":
            nx, ny = 128 + (18 if seam_u else 0) + 1.2 * broad, 128 + (18 if seam_v else 0) - 0.8 * broad
        else:
            nx, ny = 128 + 1.6 * broad, 128 - 1.1 * broad
        return bytes((base.clamp_byte(nx), base.clamp_byte(ny), 255, 255))

    if kind == "orm":
        rough = roughness * 255 + (directional * 6 if family == "machined" else broad * 5)
        if family == "ceramic" and (seam_u or seam_v):
            rough += 22
        ao = 236 - (26 if family == "ceramic" and (seam_u or seam_v) else 0)
        return bytes((base.clamp_byte(ao), base.clamp_byte(rough), base.clamp_byte(metallic * 255), 255))

    factor = 0.96 + broad * 0.05
    rgb = [channel * 255 * factor for channel in base_rgb]
    if family == "chevron" and diagonal < 0.46:
        rgb = [22, 22, 20]
    elif family == "tape" and 0.18 < diagonal < 0.36:
        rgb = [226, 222, 212]
    elif family == "distress" and abs(((u * 3.0) % 1.0) - 0.5) < 0.12:
        rgb = [232, 228, 218]
    elif family == "ceramic":
        grime = 0.9 + 0.1 * broad
        rgb = [channel * grime for channel in rgb]
        if seam_u or seam_v:
            rgb = [channel * 0.55 for channel in rgb]
    return bytes((base.clamp_byte(rgb[0]), base.clamp_byte(rgb[1]), base.clamp_byte(rgb[2]), 255))


def create_texture_files(asset_key: str, config: dict, root_dir: Path) -> dict:
    result = {}
    size = int(config["texture_size"])
    for material_name in config["materials"]:
        result[material_name] = {}
        for kind in ("basecolor", "orm", "normal"):
            path = root_dir / asset_key / f"{material_name}_{kind}.png"
            base.write_png(path, size, size, lambda px, py, w, h, m=material_name, k=kind: texture_pixel(m, k, px, py, w, h))
            result[material_name][kind] = path
    return result


def create_materials(config: dict, texture_files: dict) -> dict:
    materials = {}
    lamp_color, lamp_strength = config["lamp"]
    for name in config["materials"]:
        color, metallic, roughness, family = MATERIAL_TUNING[name]
        material = bpy.data.materials.new(name)
        material.use_nodes = True
        nodes = material.node_tree.nodes
        links = material.node_tree.links
        nodes.clear()
        output = nodes.new("ShaderNodeOutputMaterial")
        shader = nodes.new("ShaderNodeBsdfPrincipled")
        shader.inputs["Metallic"].default_value = metallic
        shader.inputs["Roughness"].default_value = roughness
        base_node = nodes.new("ShaderNodeTexImage")
        base_node.image = base.load_image(texture_files[name]["basecolor"], "sRGB")
        links.new(base_node.outputs["Color"], shader.inputs["Base Color"])
        orm_node = nodes.new("ShaderNodeTexImage")
        orm_node.image = base.load_image(texture_files[name]["orm"], "Non-Color")
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
        normal_node.image = base.load_image(texture_files[name]["normal"], "Non-Color")
        normal_map = nodes.new("ShaderNodeNormalMap")
        normal_map.inputs["Strength"].default_value = 0.32
        links.new(normal_node.outputs["Color"], normal_map.inputs["Color"])
        links.new(normal_map.outputs["Normal"], shader.inputs["Normal"])
        if family == "lamp":
            shader.inputs["Emission Color"].default_value = (*lamp_color, 1.0)
            shader.inputs["Emission Strength"].default_value = lamp_strength
        links.new(shader.outputs["BSDF"], output.inputs["Surface"])
        material.diffuse_color = (*color, 1.0)
        materials[name] = material
    return materials


def add_loft_x(collection, materials, lod, name, stations, material, sides=20, bevel=0.03):
    """Closed elliptical loft along +X. stations: (x, radius_y, radius_z, z_offset)."""
    vertices = []
    for x, ry, rz, zoff in stations:
        for side in range(sides):
            angle = math.tau * side / sides
            vertices.append((x, math.cos(angle) * ry, math.sin(angle) * rz + zoff))
    faces = []
    for section in range(len(stations) - 1):
        a, b = section * sides, (section + 1) * sides
        for side in range(sides):
            n = (side + 1) % sides
            faces.append((a + side, a + n, b + n, b + side))
    faces.append(tuple(reversed(range(sides))))
    last = (len(stations) - 1) * sides
    faces.append(tuple(last + side for side in range(sides)))
    mesh = bpy.data.meshes.new(f"LOD{lod}_{name}_Mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(f"LOD{lod}_{name}", mesh)
    collection.objects.link(obj)
    obj.data.materials.append(materials[material])
    if bevel > 0:
        modifier = obj.modifiers.new("SF_RolledEdge", "BEVEL")
        modifier.width = bevel
        modifier.segments = 2
        modifier.limit_method = "ANGLE"
        modifier.angle_limit = math.radians(40)
    base.tag(obj, lod, material, name)
    return obj


def spindle_geometry(collection, materials, lod: int) -> None:
    c, m = collection, materials
    hull, mech, evidence, seal, lamp = (
        "Material_Hull", "Material_Mechanical", "Material_Evidence", "Material_Seal", "Material_Lamp",
    )
    # The ordinary tow can's ISO body, so the evidence can still reads as freight hardware.
    base.add_box(c, m, lod, "Shell", (5.05, 2.88, 2.12), (2.10, 0.0, 1.06), hull, 0.045)
    base.add_box(c, m, lod, "RoofLid", (4.92, 2.72, 0.10), (2.10, 0.0, 2.16), hull, 0.02)
    for index in range(8):
        x = 0.18 + index * (4.55 / 7)
        base.add_box(c, m, lod, f"CorrugationP{index}", (0.16, 0.08, 1.85), (x, 1.46, 1.02), hull, 0.008)
        base.add_box(c, m, lod, f"CorrugationS{index}", (0.16, 0.08, 1.85), (x, -1.46, 1.02), hull, 0.008)
    for x in (-0.38, 4.58):
        for y in (-1.38, 1.38):
            for z in (0.10, 2.02):
                tag_name = f"ISO_{'A' if x < 1 else 'F'}{'P' if y > 0 else 'S'}{'U' if z > 1 else 'L'}"
                base.add_box(c, m, lod, tag_name, (0.24, 0.24, 0.24), (x, y, z), mech, 0.012)
    base.add_box(c, m, lod, "DoorFace", (0.08, 2.55, 1.95), (-0.42, 0.0, 1.05), hull, 0.02)
    base.add_box(c, m, lod, "DoorLatchP", (0.08, 0.10, 1.45), (-0.48, 0.62, 1.05), mech, 0.008)
    base.add_box(c, m, lod, "DoorLatchS", (0.08, 0.10, 1.45), (-0.48, -0.62, 1.05), mech, 0.008)
    for index, z in enumerate((0.35, 0.75, 1.15, 1.55, 1.95)):
        base.add_box(c, m, lod, f"DoorHinge{index}", (0.07, 0.18, 0.12), (-0.46, 1.18, z), mech, 0.006)

    # Tell 1 — the access hatch is sealed shut: a bolted cover plate instead of an open well.
    base.add_box(c, m, lod, "SealedCover", (1.66, 1.02, 0.08), (1.45, 0.0, 2.25), mech, 0.014)
    for index, (x, y) in enumerate(((0.78, 0.40), (1.45, 0.40), (2.12, 0.40), (0.78, -0.40), (1.45, -0.40), (2.12, -0.40))):
        base.add_cyl(c, m, lod, f"CoverBolt{index}", 0.045, 0.06, (x, y, 2.31), mech, vertices=8, bevel=0.0)

    # Tell 2 — custody seal straps wrap the roof and both flanks at two stations.
    for index, x in enumerate((0.62, 3.30)):
        base.add_box(c, m, lod, f"StrapRoof{index}", (0.30, 2.86, 0.05), (x, 0.0, 2.235), seal, 0.006)
        base.add_box(c, m, lod, f"StrapP{index}", (0.30, 0.05, 2.16), (x, 1.53, 1.08), seal, 0.006)
        base.add_box(c, m, lod, f"StrapS{index}", (0.30, 0.05, 2.16), (x, -1.53, 1.08), seal, 0.006)
        base.add_box(c, m, lod, f"StrapBuckle{index}", (0.40, 0.10, 0.26), (x, 1.575, 1.62), mech, 0.008)

    # Tell 3 — evidence chevrons replace the freight stripe, on both flanks and both roof edges.
    base.add_box(c, m, lod, "EvidenceBandP", (4.70, 0.06, 0.46), (2.10, 1.50, 1.08), evidence, 0.01)
    base.add_box(c, m, lod, "EvidenceBandS", (4.70, 0.06, 0.46), (2.10, -1.50, 1.08), evidence, 0.01)
    base.add_box(c, m, lod, "EvidenceRailP", (4.40, 0.24, 0.04), (2.10, 1.20, 2.23), evidence, 0.006)
    base.add_box(c, m, lod, "EvidenceRailS", (4.40, 0.24, 0.04), (2.10, -1.20, 2.23), evidence, 0.006)

    # Tell 4 — a custody ledger case rides the roof: status lamp recessed in a rim, whip antenna.
    base.add_box(c, m, lod, "LedgerCase", (0.92, 0.70, 0.30), (3.95, -0.45, 2.36), mech, 0.03)
    base.add_box(c, m, lod, "LedgerCaseLid", (0.74, 0.54, 0.05), (3.95, -0.45, 2.535), hull, 0.01)
    base.add_cyl(c, m, lod, "LampRim", 0.16, 0.10, (3.72, -0.45, 2.60), mech, vertices=16, bevel=0.01)
    base.add_cyl(c, m, lod, "LampLens", 0.11, 0.06, (3.72, -0.45, 2.62), lamp, vertices=16, bevel=0.0)
    base.add_cyl(c, m, lod, "Antenna", 0.022, 1.10, (4.26, -0.66, 3.06), mech, vertices=6, bevel=0.0)
    base.add_cyl(c, m, lod, "AntennaBase", 0.07, 0.10, (4.26, -0.66, 2.55), mech, vertices=10, bevel=0.0)

    # Tell 5 — the door is padlocked: a seal bar across both leaves, lock body and tag plate.
    base.add_box(c, m, lod, "DoorSealBar", (0.12, 2.46, 0.18), (-0.54, 0.0, 1.52), seal, 0.01)
    base.add_box(c, m, lod, "PadlockBody", (0.18, 0.30, 0.34), (-0.62, 0.0, 1.26), mech, 0.02)
    base.add_box(c, m, lod, "CustodyTag", (0.03, 0.34, 0.26), (-0.66, 0.0, 0.98), seal, 0.004)


def capsule_geometry(collection, materials, lod: int) -> None:
    c, m = collection, materials
    ceramic, mech, distress, glass, lamp = (
        "Material_Ceramic", "Material_Mechanical", "Material_Distress", "Material_Glass", "Material_Lamp",
    )
    # Pressure hull: authored sections, nose shoulder to aft waist, with a flush painted distress band.
    add_loft_x(c, m, lod, "HullForward", (
        (3.55, 0.80, 0.74, 0.02), (3.30, 1.10, 1.02, 0.02), (2.85, 1.36, 1.26, 0.03), (2.05, 1.50, 1.40, 0.04),
    ), ceramic)
    add_loft_x(c, m, lod, "HullDistressBand", (
        (2.05, 1.50, 1.40, 0.04), (1.25, 1.54, 1.44, 0.04),
    ), distress, bevel=0.0)
    add_loft_x(c, m, lod, "HullAft", (
        (1.25, 1.54, 1.44, 0.04), (-0.60, 1.54, 1.44, 0.03), (-2.05, 1.46, 1.36, 0.02), (-2.70, 1.30, 1.22, 0.01),
    ), ceramic)
    # Aft service skirt and heat shield with three thruster bells.
    add_loft_x(c, m, lod, "AftSkirt", (
        (-2.62, 1.34, 1.26, 0.01), (-3.05, 1.24, 1.16, 0.01), (-3.20, 1.08, 1.02, 0.01),
    ), mech, bevel=0.02)
    base.add_cyl(c, m, lod, "HeatShield", 0.98, 0.10, (-3.22, 0.0, 0.01), mech, rotation=(0.0, math.pi / 2, 0.0), vertices=24, bevel=0.01)
    for index, (y, z) in enumerate(((0.0, 0.46), (-0.40, -0.24), (0.40, -0.24))):
        add_loft_x(c, m, lod, f"Bell{index}", (
            (-3.24, 0.16, 0.16, 0.0), (-3.46, 0.22, 0.22, 0.0), (-3.62, 0.30, 0.30, 0.0),
        ), mech, sides=12, bevel=0.0)
        for obj in [o for o in collection.objects if o.name == f"LOD{lod}_Bell{index}"]:
            obj.location = (0.0, y, z)

    # Docking collar at the nose: short machined ring, recessed hatch, six clamp blocks.
    base.add_cyl(c, m, lod, "DockingCollar", 0.74, 0.34, (3.70, 0.0, 0.02), mech, rotation=(0.0, math.pi / 2, 0.0), vertices=24, bevel=0.02)
    base.add_cyl(c, m, lod, "HatchPlate", 0.52, 0.06, (3.88, 0.0, 0.02), mech, rotation=(0.0, math.pi / 2, 0.0), vertices=20, bevel=0.01)
    for index in range(6):
        angle = math.tau * index / 6
        base.add_box(c, m, lod, f"CollarClamp{index}", (0.30, 0.20, 0.16),
                     (3.62, math.cos(angle) * 0.80, math.sin(angle) * 0.80 + 0.02), mech, 0.01,
                     rotation=(angle, 0.0, 0.0))

    # Viewport strip, both flanks: machined frame, dark glass, warm cabin light behind.
    for side, name in ((1, "P"), (-1, "S")):
        base.add_box(c, m, lod, f"ViewportFrame{name}", (2.60, 0.10, 0.52), (-0.10, side * 1.47, 0.52), mech, 0.02)
        base.add_box(c, m, lod, f"ViewportGlass{name}", (2.36, 0.08, 0.34), (-0.10, side * 1.505, 0.52), glass, 0.0)
        for index, x in enumerate((-1.00, -0.40, 0.20, 0.80)):
            base.add_box(c, m, lod, f"ViewportMullion{name}{index}", (0.05, 0.10, 0.36), (x, side * 1.52, 0.52), mech, 0.0)
        base.add_box(c, m, lod, f"CabinGlow{name}", (1.90, 0.02, 0.14), (-0.10, side * 1.46, 0.46), lamp, 0.0)

    # Dorsal distress beacon housing with a recessed strobe, plus a spine fairing and handrails.
    base.add_box(c, m, lod, "BeaconHousing", (0.80, 0.70, 0.30), (1.65, 0.0, 1.58), mech, 0.04)
    base.add_cyl(c, m, lod, "BeaconRim", 0.26, 0.12, (1.65, 0.0, 1.78), mech, vertices=18, bevel=0.01)
    base.add_cyl(c, m, lod, "BeaconStrobe", 0.19, 0.10, (1.65, 0.0, 1.80), lamp, vertices=18, bevel=0.0)
    base.add_box(c, m, lod, "SpineFairing", (3.20, 0.36, 0.14), (-0.60, 0.0, 1.49), mech, 0.03)
    for side in (1, -1):
        base.add_box(c, m, lod, f"Handrail{'P' if side > 0 else 'S'}", (2.80, 0.05, 0.05), (-0.40, side * 0.62, 1.52), mech, 0.0)
        for index, x in enumerate((-1.60, -0.40, 0.80)):
            base.add_box(c, m, lod, f"RailPost{'P' if side > 0 else 'S'}{index}", (0.05, 0.05, 0.12), (x, side * 0.62, 1.46), mech, 0.0)

    # Keel skids on standoffs and four RCS quads.
    for side in (1, -1):
        tag_side = 'P' if side > 0 else 'S'
        base.add_box(c, m, lod, f"KeelSkid{tag_side}", (3.60, 0.14, 0.12), (-0.20, side * 0.72, -1.46), mech, 0.02)
        for index, x in enumerate((-1.50, 0.00, 1.20)):
            base.add_box(c, m, lod, f"SkidStandoff{tag_side}{index}", (0.12, 0.10, 0.22), (x, side * 0.72, -1.36), mech, 0.0)
    for index, (x, side) in enumerate(((2.55, 1), (2.55, -1), (-2.20, 1), (-2.20, -1))):
        base.add_box(c, m, lod, f"RcsQuad{index}", (0.30, 0.24, 0.30), (x, side * 1.34, 0.62), mech, 0.02)
        base.add_cyl(c, m, lod, f"RcsNozzle{index}", 0.06, 0.12, (x, side * 1.50, 0.62), mech,
                     rotation=(math.pi / 2, 0.0, 0.0), vertices=10, bevel=0.0)

    # Painted distress chevron patches on the flanks near the hatch and an ID plate.
    base.add_box(c, m, lod, "DistressPatchP", (0.70, 0.04, 0.44), (2.60, 1.24, -0.52), distress, 0.0)
    base.add_box(c, m, lod, "DistressPatchS", (0.70, 0.04, 0.44), (2.60, -1.24, -0.52), distress, 0.0)
    base.add_box(c, m, lod, "IdPlate", (0.62, 0.04, 0.26), (-1.60, 1.46, -0.30), mech, 0.0)


def stamp_root(root, config, asset_key):
    stamp = {
        "contractVersion": 1,
        "assetId": config["asset_id"],
        "partId": asset_key,
        "liveId": asset_key,
        "slot": config["slot"],
        "forward": "+X",
        "up": "+Y",
        "starboard": "+Z",
        "unit": "metre",
        "normalConvention": "OpenGL",
        "ormChannels": "R=AO,G=Roughness,B=Metallic",
        "textureCompression": "PNG-source",
        "textureSize": config["texture_size"],
        "chamfered": True,
        "bevelRadiusM": 0.04,
        "packet": "PQ-193.04",
        "campaign": "GRAPHICS_3D 47-A family",
        "revision": "chase_read_v1",
        "sourceGenerator": "tools/blender/build_pq193_04_47a_bodies.py",
    }
    root["spacefaceAssetJson"] = json.dumps(stamp, separators=(",", ":"))
    bpy.context.scene["spacefaceAssetJson"] = root["spacefaceAssetJson"]
    return stamp


def world_bounds(objects):
    bpy.context.view_layer.update()
    lo = Vector((1e9, 1e9, 1e9))
    hi = Vector((-1e9, -1e9, -1e9))
    for obj in objects:
        for corner in obj.bound_box:
            world = obj.matrix_world @ Vector(corner)
            lo = Vector(min(lo[i], world[i]) for i in range(3))
            hi = Vector(max(hi[i], world[i]) for i in range(3))
    return lo, hi


def build(asset_key: str, output: Path) -> dict:
    config = dict(ASSETS[asset_key])
    texture_files = create_texture_files(asset_key, config, output.parent / "_textures")
    base.reset_scene()
    scene = bpy.context.scene
    scene.unit_settings.system = "METRIC"
    scene.unit_settings.scale_length = 1.0
    collection = base.ensure_collection(f"PQ19304_{asset_key}")
    materials = create_materials(config, texture_files)

    root = bpy.data.objects.new(config["root"], None)
    root.empty_display_type = "CUBE"
    root.empty_display_size = 0.6
    collection.objects.link(root)
    root["spaceface.assetId"] = config["asset_id"]
    root["spaceface.partId"] = asset_key

    builder = spindle_geometry if config["build"] == "spindle" else capsule_geometry
    builder(collection, materials, 0)
    groups = base.join_draw_groups(collection, materials, 0, root, config)

    helpers = []
    lo, hi = world_bounds(groups)
    if config["slot"] == "pod":
        helpers.append(base.make_empty(
            collection, root, "MOUNT_Child", base.blender_from_gltf(config["mount_translation_gltf"]),
            {"role": "stack", "forward": [1, 0, 0], "spacefaceMount": True},
        ))
    else:
        # glTF bounds (x, y=up, z=-blender y) for the collision helper.
        gmin = [lo.x, lo.z, -hi.y]
        gmax = [hi.x, hi.z, -lo.y]
        center = [(a + b) / 2 for a, b in zip(gmin, gmax)]
        size = [b - a for a, b in zip(gmin, gmax)]
        half = [s / 2 for s in size]
        config["collision_translation_gltf"] = tuple(center)
        config["collision_node_bounds"] = {"min": [-h for h in half], "max": half, "size": size}
        helpers.append(base.make_empty(
            collection, root, "COLLISION_HULL", base.blender_from_gltf(config["collision_translation_gltf"]),
            {"spaceface": {"collision": True, "helper": True, "nonRender": True, "role": "collision",
                           "bounds": config["collision_node_bounds"], "lod": "lod0", "chamfered": True},
             "sf_collision": True, "sf_non_render": True, "collision": True, "nonRender": True,
             "bounds": config["collision_node_bounds"]},
            display="CUBE", size=0.8,
        ))
        helpers.append(base.make_empty(
            collection, root, "SOCKET_Airlock", (3.92, 0.0, 0.02),
            {"spaceface": {"socket": True, "role": "airlock", "forward": [1, 0, 0]},
             "spaceface.socket": True, "role": "airlock", "forward": [1, 0, 0]},
        ))

    stamp = stamp_root(root, config, asset_key)
    bpy.context.view_layer.update()
    base.export_glb(output, root, groups + helpers)
    base.rewrite_glb_metadata(output, config, stamp, asset_key)
    report = {
        "asset": asset_key,
        "output": str(output),
        "bytes": output.stat().st_size,
        "groups": {obj.name: len(obj.data.polygons) for obj in groups},
        "triangles": sum(len(obj.data.polygons) for obj in groups),
        "boundsBlender": {"min": [round(v, 3) for v in lo], "max": [round(v, 3) for v in hi]},
        "helpers": [obj.name for obj in helpers],
    }
    output.with_suffix(".report.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    return report


def parse_args(argv):
    parser = argparse.ArgumentParser()
    parser.add_argument("--asset", required=True, choices=sorted(ASSETS))
    parser.add_argument("--output", required=True, type=Path)
    return parser.parse_args(argv)


def main():
    args = parse_args(sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else [])
    report = build(args.asset, args.output.resolve())
    print("PQ193_04_BUILD", json.dumps(report))


if __name__ == "__main__":
    main()

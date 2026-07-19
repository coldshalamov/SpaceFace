#!/usr/bin/env python3
"""Author a production dock-interior candidate in Blender.

The legacy docks are 636-triangle procedural box rooms with a flat normal map.
This candidate replaces them with a functional maintenance environment while
preserving the 52 x 36 x 17.4 metre gameplay envelope and semantic hooks.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
from pathlib import Path
import sys

import bpy
from mathutils import Vector


MATERIAL_ROLES = {
    "Material_Hull": "dock_painted_armor",
    "Material_Structure": "dock_structural_alloy",
    "Material_Floor": "dock_floor_plate",
    "Material_Mechanical": "dock_machinery",
    "Material_Radiator": "dock_radiator",
    "Material_Safety": "dock_safety_surface",
    "Material_Glass": "dock_optic",
    "Material_Accent": "dock_worklight",
    "Material_Decal": "dock_identity_decal",
    "Material_Rubber": "dock_rubber",
}

NORMAL_STRENGTH = {
    "dock_painted_armor": 0.18,
    "dock_structural_alloy": 0.15,
    "dock_floor_plate": 0.22,
    "dock_machinery": 0.19,
    "dock_radiator": 0.16,
    "dock_safety_surface": 0.14,
    "dock_optic": 0.07,
    "dock_worklight": 0.06,
    "dock_identity_decal": 0.08,
    "dock_rubber": 0.20,
}


def cli() -> argparse.Namespace:
    values = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--variant", choices=("industrial", "military", "grit"), required=True)
    parser.add_argument("--maps-root", type=Path, required=True)
    parser.add_argument("--output-blend", type=Path, required=True)
    parser.add_argument("--output-glb", type=Path, required=True)
    parser.add_argument("--report", type=Path, required=True)
    parser.add_argument("--render-dir", type=Path)
    return parser.parse_args(values)


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest().upper()


def load_image(path: Path, colorspace: str):
    image = bpy.data.images.load(str(path.resolve()), check_existing=True)
    image.name = path.name
    image.colorspace_settings.name = colorspace
    image.pack()
    return image


def make_material(name: str, role: str, maps_root: Path):
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    nodes.clear()
    output = nodes.new("ShaderNodeOutputMaterial")
    output.name = "SF_Surface_Output"
    principled = nodes.new("ShaderNodeBsdfPrincipled")
    principled.name = "SF_Principled"

    base = nodes.new("ShaderNodeTexImage")
    base.name = f"SF_{role}_BaseColor"
    base.image = load_image(maps_root / f"{role}_basecolor.png", "sRGB")
    base.interpolation = "Linear"
    links.new(base.outputs["Color"], principled.inputs["Base Color"])

    orm = nodes.new("ShaderNodeTexImage")
    orm.name = f"SF_{role}_ORM"
    orm.image = load_image(maps_root / f"{role}_orm.png", "Non-Color")
    orm.interpolation = "Linear"
    separate = nodes.new("ShaderNodeSeparateColor")
    separate.name = "SF_ORM_Channels"
    links.new(orm.outputs["Color"], separate.inputs["Color"])
    links.new(separate.outputs["Green"], principled.inputs["Roughness"])
    links.new(separate.outputs["Blue"], principled.inputs["Metallic"])
    group = bpy.data.node_groups.get("glTF Material Output")
    if group is None:
        group = bpy.data.node_groups.new("glTF Material Output", "ShaderNodeTree")
        group.interface.new_socket(name="Occlusion", in_out="INPUT", socket_type="NodeSocketFloat")
    gltf = nodes.new("ShaderNodeGroup")
    gltf.name = "SF_glTF_Occlusion"
    gltf.node_tree = group
    links.new(separate.outputs["Red"], gltf.inputs["Occlusion"])

    normal = nodes.new("ShaderNodeTexImage")
    normal.name = f"SF_{role}_Normal"
    normal.image = load_image(maps_root / f"{role}_normal.png", "Non-Color")
    normal.interpolation = "Linear"
    normal_map = nodes.new("ShaderNodeNormalMap")
    normal_map.name = "SF_Tangent_Normal"
    normal_map.inputs["Strength"].default_value = NORMAL_STRENGTH[role]
    links.new(normal.outputs["Color"], normal_map.inputs["Color"])
    links.new(normal_map.outputs["Normal"], principled.inputs["Normal"])

    emissive_path = maps_root / f"{role}_emissive.png"
    if emissive_path.exists():
        emissive = nodes.new("ShaderNodeTexImage")
        emissive.name = f"SF_{role}_Emissive"
        emissive.image = load_image(emissive_path, "sRGB")
        emissive.interpolation = "Linear"
        links.new(emissive.outputs["Color"], principled.inputs["Emission Color"])
        principled.inputs["Emission Strength"].default_value = 2.1

    if role == "dock_painted_armor":
        principled.inputs["Coat Weight"].default_value = 0.10
        principled.inputs["Coat Roughness"].default_value = 0.37
    elif role == "dock_structural_alloy":
        # Blender has renamed this socket across Principled revisions. The glTF
        # texture response remains authoritative; set anisotropy when exposed.
        for socket_name in ("Anisotropic IOR Level", "Anisotropic", "Anisotropy"):
            if socket_name in principled.inputs:
                principled.inputs[socket_name].default_value = 0.18
                break
    elif role == "dock_optic":
        principled.inputs["Coat Weight"].default_value = 0.42
        principled.inputs["Coat Roughness"].default_value = 0.15
        principled.inputs["IOR"].default_value = 1.48

    links.new(principled.outputs["BSDF"], output.inputs["Surface"])
    material["spaceface.semantic"] = name
    material["spaceface.textureRole"] = role
    material["spaceface.ormChannels"] = "R=AO,G=Roughness,B=Metallic"
    material["spaceface.normalConvention"] = "OpenGL tangent space"
    return material


def clear_scene() -> None:
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for datablocks in (bpy.data.meshes, bpy.data.curves, bpy.data.materials, bpy.data.images):
        for item in list(datablocks):
            datablocks.remove(item)


def tag(obj, lod: int, material_name: str, role: str, root) -> None:
    obj.parent = root
    obj["spaceface.lod"] = f"lod{lod}"
    obj["spaceface.lodLevel"] = lod
    obj["spaceface.materialRole"] = material_name
    obj["spaceface.structureRole"] = role
    obj["spaceface.authoredConstruction"] = True


def add_bevel(obj, width: float, lod: int) -> None:
    modifier = obj.modifiers.new("SF_PhysicalEdge", "BEVEL")
    modifier.width = max(0.012, width * (1.0 if lod == 0 else 0.68 if lod == 1 else 0.45))
    modifier.segments = 3 if lod == 0 else 2 if lod == 1 else 1
    modifier.limit_method = "ANGLE"


def box(name, dimensions, location, mat, lod, role, root, rotation=(0, 0, 0), bevel=0.08):
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=location, rotation=rotation)
    obj = bpy.context.object
    obj.name = f"LOD{lod}_Dock_{name}"
    obj.dimensions = dimensions
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    obj.data.materials.append(mat)
    add_bevel(obj, bevel, lod)
    tag(obj, lod, mat.name, role, root)
    return obj


def cylinder(name, radius, depth, location, mat, lod, role, root, rotation=(0, 0, 0), vertices=24, bevel=0.06):
    count = max(8, vertices if lod == 0 else vertices // 2 if lod == 1 else vertices // 3)
    bpy.ops.mesh.primitive_cylinder_add(vertices=count, radius=radius, depth=depth, end_fill_type="NGON", location=location, rotation=rotation)
    obj = bpy.context.object
    obj.name = f"LOD{lod}_Dock_{name}"
    obj.data.materials.append(mat)
    add_bevel(obj, min(radius, depth) * bevel, lod)
    tag(obj, lod, mat.name, role, root)
    return obj


def beam(name, start, end, width, mat, lod, role, root, bevel=0.06):
    a, b = Vector(start), Vector(end)
    delta = b - a
    obj = box(name, (width, width, delta.length), (a + b) * 0.5, mat, lod, role, root, bevel=bevel)
    obj.rotation_mode = "QUATERNION"
    obj.rotation_quaternion = delta.to_track_quat("Z", "Y")
    obj.rotation_mode = "XYZ"
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    obj.select_set(False)
    return obj


def add_worklight(name, location, rotation, mats, lod, root, width=2.8):
    box(f"{name}_Housing", (width + 0.32, 0.42, 0.48), location, mats["Material_Mechanical"], lod, "serviceable_worklight_housing", root, rotation, 0.06)
    lens_location = (location[0], location[1] - 0.23 * math.cos(rotation[2]), location[2] - 0.23 * math.sin(rotation[2]))
    box(f"{name}_Lens", (width, 0.10, 0.28), lens_location, mats["Material_Accent"], lod, "bounded_worklight_lens", root, rotation, 0.035)


def build_shell(lod: int, mats, root, variant: str) -> None:
    # Foundation and individually readable floor plates.  The open camera corner is -X/-Y.
    box("Underfloor", (52.0, 36.0, 0.50), (0, 0, -4.45), mats["Material_Structure"], lod, "load_bearing_underfloor", root, bevel=0.11)
    panel_x = (-21, -14, -7, 0, 7, 14, 21)
    panel_y = (-13.2, -6.6, 0, 6.6, 13.2)
    if lod == 0:
        for ix, x in enumerate(panel_x):
            for iy, y in enumerate(panel_y):
                material = mats["Material_Floor"] if (ix + iy) % 4 else mats["Material_Hull"]
                box(f"FloorPanel_{ix}_{iy}", (6.72, 6.25, 0.16), (x, y, -4.08), material, lod, "replaceable_traffic_floor_panel", root, bevel=0.07)
                if (ix + iy) % 3 == 0:
                    for side in (-1, 1):
                        cylinder(f"FloorFastener_{ix}_{iy}_{side}", 0.085, 0.05, (x + side * 2.65, y - 2.35, -3.96), mats["Material_Decal"], lod, "flush_floor_fastener", root, vertices=12, bevel=0.03)
    else:
        box("FloorMacroPlate", (50.8, 34.8, 0.16), (0, 0, -4.08), mats["Material_Floor"], lod, "macro_floor_plate", root, bevel=0.06)

    # Central service pad, rails, capture clamps, and recessed side trenches.
    box("PadBed", (23.0, 16.5, 0.20), (-1.0, 0, -3.85), mats["Material_Mechanical"], lod, "docking_service_pad_bed", root, bevel=0.10)
    box("PadDeck", (20.6, 14.0, 0.14), (-1.0, 0, -3.68), mats["Material_Floor"], lod, "replaceable_docking_pad", root, bevel=0.06)
    for y in (-7.55, 7.55):
        box(f"PadSafety_{y}", (23.4, 0.58, 0.13), (-1.0, y, -3.62), mats["Material_Safety"], lod, "docking_contact_exclusion", root, bevel=0.04)
    for y in (-10.8, 10.8):
        box(f"ServiceTrench_{y}", (39.0, 2.0, 0.34), (-1.5, y, -3.92), mats["Material_Mechanical"], lod, "recessed_power_and_fluid_trench", root, bevel=0.05)
        if lod == 0:
            for index, x in enumerate(range(-19, 20, 2)):
                box(f"TrenchGrate_{y}_{index}", (0.28, 1.84, 0.12), (x, y, -3.66), mats["Material_Structure"], lod, "removable_trench_grate", root, bevel=0.025)
    for y in (-5.4, 5.4):
        box(f"CaptureRail_{y}", (18.0, 0.42, 0.42), (-1.0, y, -3.42), mats["Material_Structure"], lod, "docking_capture_rail", root, bevel=0.07)
        for x in (-7.0, 5.0):
            box(f"CaptureClamp_{y}_{x}", (2.25, 1.45, 1.25), (x, y, -2.92), mats["Material_Mechanical"], lod, "hydraulic_capture_clamp", root, rotation=(0, 0, 0.12 if y > 0 else -0.12), bevel=0.15)
            if lod == 0:
                cylinder(f"ClampRam_{y}_{x}", 0.22, 1.55, (x + 0.85, y, -2.30), mats["Material_Structure"], lod, "capture_clamp_hydraulic_ram", root, rotation=(0, math.pi / 2, 0), vertices=16, bevel=0.04)

    # Panelized far walls with ribs, deep service bays and observation glazing.
    box("FarWallFrame", (51.5, 0.72, 16.8), (0, 17.45, 4.25), mats["Material_Structure"], lod, "pressure_bulkhead_frame", root, bevel=0.12)
    for index, x in enumerate((-21, -14, -7, 0, 7, 14, 21)):
        panel_mat = mats["Material_Hull"] if index % 3 else mats["Material_Mechanical"]
        box(f"FarWallPanel_{index}", (6.45, 0.30, 7.1), (x, 16.98, 1.1), panel_mat, lod, "removable_bulkhead_panel", root, bevel=0.10)
        box(f"FarWallUpper_{index}", (6.45, 0.30, 5.0), (x, 16.98, 8.0), mats["Material_Hull"], lod, "overhead_service_panel", root, bevel=0.10)
        if lod == 0:
            box(f"FarWallRib_{index}", (0.34, 1.00, 15.6), (x - 3.35, 16.85, 4.15), mats["Material_Structure"], lod, "bulkhead_load_rib", root, bevel=0.055)
    box("ObservationBrow", (12.6, 1.18, 4.3), (8.0, 16.45, 7.1), mats["Material_Structure"], lod, "armored_observation_brow", root, bevel=0.15)
    box("ObservationGlass", (11.7, 0.22, 3.25), (8.0, 15.80, 6.85), mats["Material_Glass"], lod, "protected_control_room_glazing", root, bevel=0.09)
    if lod == 0:
        for x in (3.8, 8.0, 12.2):
            box(f"ObservationMullion_{x}", (0.28, 0.42, 3.45), (x, 15.62, 6.85), mats["Material_Structure"], lod, "observation_window_mullion", root, bevel=0.04)

    box("SideWallFrame", (0.72, 34.8, 16.8), (25.65, 0, 4.25), mats["Material_Structure"], lod, "side_pressure_bulkhead_frame", root, bevel=0.12)
    for index, y in enumerate((-13.2, -6.6, 0, 6.6, 13.2)):
        box(f"SideWallPanel_{index}", (0.30, 6.15, 12.7), (25.15, y, 3.0), mats["Material_Hull"], lod, "side_bulkhead_service_panel", root, bevel=0.10)
        if lod == 0:
            box(f"SideWallRib_{index}", (1.0, 0.34, 15.6), (25.05, y - 3.2, 4.15), mats["Material_Structure"], lod, "side_bulkhead_load_rib", root, bevel=0.055)

    # Overhead structural load path, suspended utilities, crane and finite work lights.
    for y in (-9.0, 9.0):
        box(f"GantryLong_{y}", (46.0, 1.15, 0.90), (1.0, y, 12.1), mats["Material_Structure"], lod, "overhead_crane_runway", root, bevel=0.14)
        if lod < 2:
            for index, x in enumerate((-18, -9, 0, 9, 18)):
                beam(f"GantryBrace_{y}_{index}", (x, y, 11.7), (x + 3.2, y, 8.9), 0.30, mats["Material_Structure"], lod, "triangulated_gantry_brace", root, 0.04)
    box("GantryBridge", (1.15, 19.0, 0.95), (-2.0, 0, 11.75), mats["Material_Structure"], lod, "traveling_crane_bridge", root, bevel=0.14)
    box("CraneCarriage", (4.0, 3.0, 1.35), (-2.0, 0, 10.75), mats["Material_Mechanical"], lod, "service_crane_carriage", root, bevel=0.16)
    cylinder("CraneHoist", 0.48, 2.8, (-2.0, 0, 8.65), mats["Material_Mechanical"], lod, "service_crane_hoist", root, vertices=20, bevel=0.08)
    if lod == 0:
        beam("CraneCable", (-2.0, 0, 7.3), (-2.0, 0, 3.0), 0.11, mats["Material_Rubber"], lod, "load_rated_crane_cable", root, 0.02)
        box("CraneHook", (0.75, 0.50, 0.95), (-2.0, 0, 2.6), mats["Material_Safety"], lod, "service_crane_hook", root, rotation=(0.0, 0.25, 0.0), bevel=0.09)
    for index, x in enumerate((-16, -7, 2, 11, 20)):
        add_worklight(f"FarWorklight_{index}", (x, 15.95, 10.15), (0, 0, 0), mats, lod, root, 2.6)
    for index, y in enumerate((-12, -4, 4, 12)):
        add_worklight(f"SideWorklight_{index}", (24.55, y, 9.5), (0, 0, math.pi / 2), mats, lod, root, 2.4)

    # Recessed machinery and heat rejection are clustered against service walls.
    for index, x in enumerate((-18, -12, -6)):
        box(f"PowerCabinet_{index}", (4.1, 1.4, 5.2), (x, 15.65, 0.25), mats["Material_Mechanical"], lod, "replaceable_power_cabinet", root, bevel=0.13)
        box(f"CabinetDoor_{index}", (3.55, 0.18, 4.25), (x, 14.88, 0.25), mats["Material_Hull"], lod, "power_cabinet_access_door", root, bevel=0.08)
        if lod == 0:
            for vent in (-0.9, 0.0, 0.9):
                box(f"CabinetVent_{index}_{vent}", (2.45, 0.12, 0.22), (x, 14.73, 0.65 + vent), mats["Material_Radiator"], lod, "cabinet_cooling_slot", root, bevel=0.025)
    for index, y in enumerate((-11, -5, 1, 7, 13)):
        box(f"RadiatorBank_{index}", (0.65, 4.35, 3.0), (24.62, y, 6.6), mats["Material_Radiator"], lod, "directional_bulkhead_radiator", root, bevel=0.07)
        if lod == 0:
            for fin in range(5):
                box(f"RadiatorFin_{index}_{fin}", (0.35, 3.7, 0.12), (24.18, y, 5.55 + fin * 0.52), mats["Material_Structure"], lod, "radiator_fin_guard", root, bevel=0.025)

    if lod == 0:
        # Cable trays and pipes are rooted in machinery rather than scattered greeble.
        for pipe_index, (y, z, radius) in enumerate(((14.9, 11.0, 0.18), (14.55, 10.55, 0.13), (14.2, 10.15, 0.10))):
            cylinder(f"UtilityPipe_{pipe_index}", radius, 31.0, (-3, y, z), mats["Material_Structure"], lod, "bulkhead_utility_pipe", root, rotation=(0, math.pi / 2, 0), vertices=14, bevel=0.04)
        box("CableTray", (34.0, 0.72, 0.35), (-3.0, 15.0, 9.25), mats["Material_Mechanical"], lod, "segregated_power_cable_tray", root, bevel=0.05)

    build_variant_zone(lod, mats, root, variant)


def build_variant_zone(lod: int, mats, root, variant: str) -> None:
    if variant == "industrial":
        # A repair bay with tool chest, consumable rack and articulated service arms.
        for row, z in enumerate((-2.7, -0.3, 2.1)):
            for column, x in enumerate((16.5, 20.0)):
                box(f"IndustrialRack_{row}_{column}", (3.0, 2.0, 1.75), (x, 11.7, z), mats["Material_Hull"], lod, "indexed_consumable_cassette", root, bevel=0.12)
        if lod < 2:
            for side in (-1, 1):
                beam(f"ServiceArmUpper_{side}", (12.0, side * 8.0, -1.0), (9.2, side * 7.0, 2.1), 0.42, mats["Material_Structure"], lod, "articulated_service_arm", root, 0.06)
                beam(f"ServiceArmLower_{side}", (9.2, side * 7.0, 2.1), (6.6, side * 5.8, 1.1), 0.34, mats["Material_Mechanical"], lod, "articulated_service_arm", root, 0.05)
                cylinder(f"ServiceArmJoint_{side}", 0.58, 0.75, (9.2, side * 7.0, 2.1), mats["Material_Safety"], lod, "service_arm_joint_guard", root, rotation=(math.pi / 2, 0, 0), vertices=18, bevel=0.06)
    elif variant == "military":
        # Armored baffles and controlled equipment lockers distinguish the military bay structurally.
        for side in (-1, 1):
            for index, x in enumerate((-17, -10, -3, 4, 11, 18)):
                box(f"BlastBaffle_{side}_{index}", (1.8, 0.75, 5.8), (x, side * 15.7, 2.0), mats["Material_Hull"], lod, "faceted_blast_baffle", root, rotation=(0, 0, 0.16 * side), bevel=0.16)
        for index, y in enumerate((-11, -6, -1, 4, 9)):
            box(f"WeaponLocker_{index}", (1.2, 3.7, 4.4), (23.7, y, 0.1), mats["Material_Mechanical"], lod, "secured_ordnance_locker", root, bevel=0.12)
            box(f"WeaponLockerStripe_{index}", (0.18, 2.9, 0.45), (23.0, y, 0.7), mats["Material_Safety"], lod, "ordnance_exclusion_mark", root, bevel=0.04)
    else:
        # Patchwork, exposed process lines and an asymmetric scaffold tell a repair history.
        for index, (x, y, z, sx, sy) in enumerate(((-18, 16.3, 5.1, 5.0, 0.25), (-7, 16.2, 9.2, 6.2, 0.25), (24.6, -7, 1.6, 0.25, 5.5))):
            box(f"GritPatch_{index}", (sx, sy, 3.2), (x, y, z), mats["Material_Hull"], lod, "field_repair_plate", root, rotation=(0, 0, 0.06 * (index - 1)), bevel=0.07)
        if lod == 0:
            for index, (y, z, radius) in enumerate(((-14.8, 5.2, 0.22), (-14.4, 4.4, 0.14), (-14.0, 3.7, 0.11))):
                cylinder(f"GritExposedPipe_{index}", radius, 36.0, (0, y, z), mats["Material_Structure"], lod, "exposed_repair_process_line", root, rotation=(0, math.pi / 2, 0), vertices=14, bevel=0.04)
            for level in range(3):
                box(f"GritScaffoldDeck_{level}", (9.0, 2.0, 0.24), (16.0, -13.6, -2.0 + level * 3.0), mats["Material_Floor"], lod, "temporary_maintenance_scaffold", root, bevel=0.05)
                for x in (12.2, 19.8):
                    beam(f"GritScaffoldPost_{level}_{x}", (x, -14.3, -3.7), (x, -14.3, 4.7), 0.18, mats["Material_Structure"], lod, "temporary_scaffold_post", root, 0.03)


def add_identity(mats, root, variant: str) -> None:
    labels = {
        "industrial": ("H-04  SERVICE", "MERIDIAN YARDS"),
        "military": ("BAY 03  CONTROLLED", "SOLAR CONCORD NAVY"),
        "grit": ("DOCK 7  HOT WORK", "BELT CO-OPERATIVE"),
    }[variant]
    for index, (text, size, location) in enumerate(((labels[0], 1.0, (-1.0, 16.70, 11.0)), (labels[1], 0.48, (-1.0, 16.68, 9.8)))):
        curve = bpy.data.curves.new(f"DockIdentity_{index}", "FONT")
        curve.body = text
        curve.align_x = "CENTER"
        curve.align_y = "CENTER"
        curve.size = size
        curve.extrude = 0.018
        curve.bevel_depth = 0.004
        curve.bevel_resolution = 1
        obj = bpy.data.objects.new(f"LOD0_Dock_Identity_{index}", curve)
        bpy.context.scene.collection.objects.link(obj)
        obj.location = location
        obj.rotation_euler = (math.pi / 2, 0, 0)
        obj.data.materials.append(mats["Material_Decal"])
        tag(obj, 0, "Material_Decal", "non_emissive_dock_identity", root)
        bpy.context.view_layer.objects.active = obj
        obj.select_set(True)
        bpy.ops.object.convert(target="MESH")
        obj.select_set(False)


def apply_modifiers_and_uv() -> list[str]:
    failures = []
    for obj in sorted((item for item in bpy.data.objects if item.type == "MESH"), key=lambda item: item.name):
        bpy.context.view_layer.objects.active = obj
        obj.select_set(True)
        for modifier in list(obj.modifiers):
            try:
                bpy.ops.object.modifier_apply(modifier=modifier.name)
            except Exception as exc:
                failures.append(f"{obj.name}/{modifier.name}: {exc}")
        bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
        obj.data.validate(clean_customdata=False)
        for polygon in obj.data.polygons:
            polygon.use_smooth = True
        if not obj.data.uv_layers:
            obj.data.uv_layers.new(name="UVMap")
        try:
            bpy.ops.object.mode_set(mode="EDIT")
            bpy.ops.mesh.select_all(action="SELECT")
            bpy.ops.uv.smart_project(angle_limit=math.radians(58), island_margin=0.009)
            bpy.ops.object.mode_set(mode="OBJECT")
        except Exception as exc:
            failures.append(f"{obj.name}/UV: {exc}")
            if obj.mode != "OBJECT":
                bpy.ops.object.mode_set(mode="OBJECT")
        obj.select_set(False)
    return failures


def join_draw_groups(materials, root) -> None:
    for lod in range(3):
        for material_name, material in materials.items():
            matches = [obj for obj in bpy.data.objects if obj.type == "MESH" and obj.name.startswith(f"LOD{lod}_") and obj.data.materials and obj.data.materials[0] == material]
            if not matches:
                continue
            bpy.ops.object.select_all(action="DESELECT")
            for obj in matches:
                obj.select_set(True)
            bpy.context.view_layer.objects.active = matches[0]
            if len(matches) > 1:
                bpy.ops.object.join()
            joined = bpy.context.object
            joined.name = f"LOD{lod}_Dock_{material_name}"
            joined.parent = root
            joined["spaceface.lod"] = f"lod{lod}"
            joined["spaceface.lodLevel"] = lod
            joined["spaceface.materialRole"] = material_name
            joined["spaceface.structureRole"] = "merged_functional_draw_group"
            triangulate = joined.modifiers.new("SF_ExportTriangulate", "TRIANGULATE")
            triangulate.keep_custom_normals = True
            bpy.ops.object.modifier_apply(modifier=triangulate.name)
            joined.select_set(False)


def triangle_count(obj) -> int:
    obj.data.calc_loop_triangles()
    return len(obj.data.loop_triangles)


def validate_tangents() -> list[dict]:
    results = []
    for obj in sorted((item for item in bpy.data.objects if item.type == "MESH"), key=lambda item: item.name):
        error = None
        valid = False
        try:
            obj.data.calc_tangents(uvmap=obj.data.uv_layers[0].name)
            lengths = [loop.tangent.length for loop in obj.data.loops]
            valid = bool(lengths) and min(lengths) > 0.985 and max(lengths) < 1.015
        except Exception as exc:
            error = str(exc)
        finally:
            try:
                obj.data.free_tangents()
            except Exception:
                pass
        results.append({"object": obj.name, "valid": valid, "error": error})
    return results


def export_glb(path: Path, root) -> None:
    bpy.ops.object.select_all(action="DESELECT")
    for obj in bpy.data.objects:
        if obj.type not in {"CAMERA", "LIGHT"}:
            obj.select_set(True)
    bpy.context.view_layer.objects.active = root
    path.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.export_scene.gltf(filepath=str(path), export_format="GLB", use_selection=True, export_yup=True, export_apply=True, export_extras=True, export_texcoords=True, export_normals=True, export_tangents=True, export_materials="EXPORT")
    bpy.ops.object.select_all(action="DESELECT")


def look_at(obj, target) -> None:
    obj.rotation_euler = (Vector(target) - obj.location).to_track_quat("-Z", "Y").to_euler()


def render_proofs(render_dir: Path, variant: str) -> list[Path]:
    render_dir.mkdir(parents=True, exist_ok=True)
    for obj in bpy.data.objects:
        if obj.type == "MESH":
            # Preserve caller-supplied exclusions such as collision-only donor
            # meshes while selecting the dock's production LOD0 for proof.
            obj.hide_render = obj.hide_render or obj.name.startswith(("LOD1_", "LOD2_"))
    scene = bpy.context.scene
    # Blender 5.1 exposes Eevee under BLENDER_EEVEE; older 4.x used
    # BLENDER_EEVEE_NEXT. Choose the available identifier for reproducibility.
    try:
        scene.render.engine = "BLENDER_EEVEE"
    except TypeError:
        scene.render.engine = "BLENDER_EEVEE_NEXT"
    scene.render.resolution_x = 1280
    scene.render.resolution_y = 720
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.film_transparent = False
    scene.world.color = (0.0025, 0.004, 0.006)
    scene.view_settings.look = "AgX - Medium High Contrast"
    scene.view_settings.exposure = 0.85

    camera_data = bpy.data.cameras.new("DockReviewCamera")
    camera = bpy.data.objects.new("DockReviewCamera", camera_data)
    bpy.context.scene.collection.objects.link(camera)
    camera_data.lens = 42
    scene.camera = camera

    def area(name, location, energy, color, size):
        data = bpy.data.lights.new(name, "AREA")
        data.energy = energy
        data.color = color
        data.shape = "DISK"
        data.size = size
        obj = bpy.data.objects.new(name, data)
        bpy.context.scene.collection.objects.link(obj)
        obj.location = location
        look_at(obj, (0, 0, 1.5))

    area("OpenBay_Key", (-20, -22, 17), 3900, (0.63, 0.78, 1.0), 14)
    area("Overhead_Fill", (0, 0, 15), 2750, (0.78, 0.88, 1.0), 12)
    area("Service_Warm", (22, 13, 5), 1850, (1.0, 0.52, 0.24), 9)

    outputs = []
    for name, location, lens in (("default", (-31, -31, 18), 45), ("close", (-21, -24, 10), 38), ("top", (-19, -15, 28), 46)):
        camera.location = location
        camera.data.lens = lens
        look_at(camera, (1.0, 2.0, 1.3))
        path = render_dir / f"dock-{variant}-{name}.png"
        scene.render.filepath = str(path)
        bpy.ops.render.render(write_still=True)
        outputs.append(path)
    return outputs


def main() -> None:
    args = cli()
    args.maps_root = args.maps_root.resolve()
    args.output_blend = args.output_blend.resolve()
    args.output_glb = args.output_glb.resolve()
    args.report = args.report.resolve()
    clear_scene()
    root = bpy.data.objects.new("DockInterior_ROOT", None)
    bpy.context.scene.collection.objects.link(root)
    hook = bpy.data.objects.new("HOOK_Emissive", None)
    socket = bpy.data.objects.new("SOCKET_Structure_Core", None)
    bpy.context.scene.collection.objects.link(hook)
    bpy.context.scene.collection.objects.link(socket)
    hook.parent = root
    socket.parent = root
    materials = {name: make_material(name, role, args.maps_root) for name, role in MATERIAL_ROLES.items()}
    for lod in range(3):
        build_shell(lod, materials, root, args.variant)
    add_identity(materials, root, args.variant)
    failures = apply_modifiers_and_uv()
    join_draw_groups(materials, root)
    tangent_results = validate_tangents()
    failed_tangents = [entry for entry in tangent_results if not entry["valid"]]
    if failures or failed_tangents:
        raise RuntimeError(f"Surface validation failed: modifiers={failures[:4]} tangents={failed_tangents[:4]}")
    mesh_scale_failures = [obj.name for obj in bpy.data.objects if obj.type == "MESH" and any(abs(float(value) - 1.0) > 1e-5 for value in obj.scale)]
    if mesh_scale_failures:
        raise RuntimeError(f"Unapplied transforms: {mesh_scale_failures[:8]}")
    lod_stats = {}
    for lod in range(3):
        meshes = [obj for obj in bpy.data.objects if obj.type == "MESH" and obj.name.startswith(f"LOD{lod}_")]
        lod_stats[f"lod{lod}"] = {"triangles": sum(triangle_count(obj) for obj in meshes), "drawGroups": len(meshes), "objects": sorted(obj.name for obj in meshes)}
    root["spaceface.family"] = "meridian_authored_dock_family_v1"
    root["spaceface.surfaceRevision"] = f"dock_interior_{args.variant}_v1"
    root["spaceface.variant"] = args.variant
    root["spacefaceAssetJson"] = json.dumps({
        "contractVersion": 1,
        "assetId": "DockInterior_ROOT",
        "partId": "place_dock_interior" if args.variant == "industrial" else f"place_dock_interior_{args.variant if args.variant != 'industrial' else ''}",
        "slot": "place",
        "forward": "+X",
        "up": "+Y",
        "starboard": "+Z",
        "unit": "metre",
        "normalConvention": "OpenGL",
        "ormChannels": "R=AO,G=Roughness,B=Metallic",
        "family": "meridian_authored_dock_family_v1",
        "variant": args.variant,
        "boundsMetres": [52.0, 17.4, 36.0],
        "lods": ["lod0", "lod1", "lod2"],
        "lodTriangles": {key: value["triangles"] for key, value in lod_stats.items()},
        "wiringStatus": "candidate_not_promoted",
    }, separators=(",", ":"))
    bpy.context.scene["spacefaceAssetJson"] = root["spacefaceAssetJson"]
    args.output_blend.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(args.output_blend), check_existing=False)
    export_glb(args.output_glb, root)
    rendered = render_proofs(args.render_dir.resolve(), args.variant) if args.render_dir else []
    report = {
        "schema": "spaceface.dockInteriorRemaster.v1",
        "status": "candidate-not-promoted",
        "variant": args.variant,
        "surfaceManifest": {"path": str((args.maps_root / "surface-map-build.json").resolve()), "sha256": sha256(args.maps_root / "surface-map-build.json")},
        "outputs": {"blend": {"path": str(args.output_blend), "sha256": sha256(args.output_blend)}, "glb": {"path": str(args.output_glb), "sha256": sha256(args.output_glb)}},
        "renders": [{"path": str(path), "sha256": sha256(path)} for path in rendered],
        "lods": lod_stats,
        "materials": sorted(MATERIAL_ROLES),
        "tangentResults": tangent_results,
        "knownRisks": ["candidate is not wired to the live Shipworks route", "real preview exposure and ship occlusion still require player-route capture"],
    }
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps({"ok": True, "report": str(args.report), "lods": lod_stats, "renders": [str(path) for path in rendered]}))


if __name__ == "__main__":
    main()

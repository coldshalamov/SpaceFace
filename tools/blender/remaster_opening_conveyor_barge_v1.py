#!/usr/bin/env python3
"""Conveyor-barge material-truth remaster (v1, non-promoting candidate).

Replaces the 2026-07 bevel-only bundle of five boxes with a manufactured ore-transfer
barge: continuous keel and ribs, three deck cradles with seated corrugated containers,
a drive block whose four refractory throats flank the preserved trail hook, a glazed
command tower, and a forked loading boom whose tips carry the status optics at their
frozen world positions (70, +/-7.5, 6.2).

Frozen contracts: root, SOCKET_Trail_Main at (-2.5, 0, 2.2), HOOK_DRIVE_PLUME at
(-2.5, 0, 2.2), HOOK_Emissive at (26, 0, 6.2), Barge_Status lights at world
(70, +/-7.5, 6.2), envelope [-2.5, -9, -2] to [70.175, 9, 8).  Runtime scale, spawn,
docking and docking-corridor math must not notice the remaster happened.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector


ROLE_BY_MATERIAL = {
    "Material_Hull": "barge_painted_hull",
    "Material_Structure": "barge_structural_alloy",
    "Material_Deck": "barge_deck_grip",
    "Material_Drive": "barge_machine_casing",
    "Material_Glass": "barge_bridge_glass",
    "Material_Radiator": "barge_radiator",
    "Material_Safety": "barge_safety_marking",
    "Material_Container": "barge_container_shell",
    "Material_Accent": "barge_nav_optic",
}
NORMAL_STRENGTH = {
    "barge_painted_hull": 0.12,
    "barge_structural_alloy": 0.12,
    "barge_deck_grip": 0.13,
    "barge_machine_casing": 0.12,
    "barge_bridge_glass": 0.05,
    "barge_radiator": 0.11,
    "barge_safety_marking": 0.075,
    "barge_container_shell": 0.12,
    "barge_nav_optic": 0.05,
}
SOURCE_BOUNDS = {
    "min": (-2.5, -9.0, -2.0),
    "max": (70.175, 9.0, 8.0),
    "size": (72.675, 18.0, 10.0),
}
MARKER_NAMES = (
    "place_conveyor_barge", "SOCKET_Trail_Main", "HOOK_DRIVE_PLUME", "HOOK_Emissive",
    "Barge_Bridge", "Barge_Container_12.0", "Barge_Container_22.0", "Barge_Container_32.0",
    "Barge_Status_-7.5", "Barge_Status_7.5",
)


def cli() -> argparse.Namespace:
    values = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--maps-root", type=Path, required=True)
    parser.add_argument("--output-blend", type=Path, required=True)
    parser.add_argument("--output-glb", type=Path, required=True)
    parser.add_argument("--report", type=Path, required=True)
    return parser.parse_args(values)


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest().upper()


def load_image(path: Path, colorspace: str):
    image = bpy.data.images.load(str(path.resolve()), check_existing=True)
    image.name = path.name
    image.colorspace_settings.name = colorspace
    image.pack()
    return image


def material(name: str, role: str, maps_root: Path):
    value = bpy.data.materials.new(name)
    value.use_nodes = True
    nodes = value.node_tree.nodes
    links = value.node_tree.links
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
    gltf_output = nodes.new("ShaderNodeGroup")
    gltf_output.name = "SF_glTF_Occlusion"
    gltf_output.node_tree = group
    links.new(separate.outputs["Red"], gltf_output.inputs["Occlusion"])
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
        principled.inputs["Emission Strength"].default_value = 1.6 if role == "barge_nav_optic" else 1.1
        principled.inputs["Coat Weight"].default_value = 0.3
        principled.inputs["Coat Roughness"].default_value = 0.15
    elif name == "Material_Hull":
        principled.inputs["Coat Weight"].default_value = 0.08
        principled.inputs["Coat Roughness"].default_value = 0.36
    links.new(principled.outputs["BSDF"], output.inputs["Surface"])
    value["spaceface.semantic"] = name
    value["spaceface.textureRole"] = role
    value["spaceface.ormChannels"] = "R=AO,G=Roughness,B=Metallic"
    value["spaceface.normalConvention"] = "OpenGL tangent space"
    return value


def tag(obj, lod: int, mat, role: str, root) -> None:
    obj.parent = root
    obj["spaceface.lod"] = f"lod{lod}"
    obj["spaceface.lodLevel"] = lod
    obj["spaceface.materialRole"] = mat.name
    obj["spaceface.structureRole"] = role
    obj["spaceface.functionalZone"] = "structure/deck/cargo/drive/bridge/navigation"


def bevel(obj, width: float, lod: int) -> None:
    modifier = obj.modifiers.new("SF_PhysicalEdge", "BEVEL")
    modifier.width = max(0.012, width * (1.0 if lod == 0 else 0.68 if lod == 1 else 0.44))
    modifier.segments = 2 if lod == 0 else 2 if lod == 1 else 1
    modifier.limit_method = "ANGLE"


def strip_edge(obj) -> None:
    for modifier in list(obj.modifiers):
        if modifier.type == "BEVEL":
            obj.modifiers.remove(modifier)


def box(name, dimensions, location, rotation, mat, lod, role, root, edge=0.06):
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=location, rotation=rotation)
    obj = bpy.context.object
    obj.name = f"LOD{lod}_Barge_{name}"
    obj.dimensions = dimensions
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    obj.data.materials.append(mat)
    bevel(obj, edge, lod)
    tag(obj, lod, mat, role, root)
    return obj


def cylinder(name, radius, depth, location, rotation, mat, lod, role, root, vertices=20, edge=0.05):
    count = max(8, vertices if lod == 0 else vertices // 2 if lod == 1 else vertices // 3)
    bpy.ops.mesh.primitive_cylinder_add(vertices=count, radius=radius, depth=depth, end_fill_type="NGON", location=location, rotation=rotation)
    obj = bpy.context.object
    obj.name = f"LOD{lod}_Barge_{name}"
    obj.data.materials.append(mat)
    bevel(obj, min(radius, depth) * edge, lod)
    tag(obj, lod, mat, role, root)
    return obj


def beam(name, start, end, width, mat, lod, role, root, edge=0.10):
    a, b = Vector(start), Vector(end)
    delta = b - a
    obj = box(name, (width, width, delta.length), (a + b) * 0.5, (0, 0, 0), mat, lod, role, root, edge)
    obj.rotation_mode = "QUATERNION"
    obj.rotation_quaternion = delta.to_track_quat("Z", "Y")
    obj.rotation_mode = "XYZ"
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    obj.select_set(False)
    return obj


def apply_modifiers_uv() -> list[str]:
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
            bpy.ops.uv.smart_project(angle_limit=math.radians(58), island_margin=0.012)
            bpy.ops.object.mode_set(mode="OBJECT")
        except Exception as exc:
            failures.append(f"{obj.name}/UV: {exc}")
            if obj.mode != "OBJECT":
                bpy.ops.object.mode_set(mode="OBJECT")
        obj.select_set(False)
    return failures


def parent_preserve_world(obj, parent) -> None:
    matrix = obj.matrix_world.copy()
    obj.parent = parent
    obj.matrix_world = matrix


# --------------------------------------------------------------------------
# Geometry
# --------------------------------------------------------------------------

def build_drive_block(lod: int, mats, root) -> None:
    # Aft drive block x -2.5..6: the housing terminates at x=-2.45 so the frozen
    # trail hook at (-2.5,0,2.2) sits exactly on the thrust face between the throats.
    box("DriveBlock", (8.6, 6.8, 6.6), (1.85, 0, 1.6), (0, 0, 0), mats["Material_Drive"], lod, "engine_reaction_mass_housing", root, 0.20)
    box("DriveRearPlate", (0.30, 6.9, 4.6), (-2.30, 0, 2.3), (0, 0, 0), mats["Material_Structure"], lod, "thrust_frame_aft_plate", root, 0.06)
    for row, z in ((0, 0.9), (1, 3.5)):
        for index, y in ((-1.7, -1.7), (1.7, 1.7)):
            tag = f"{row}_{index}"
            box(f"NozzleHousing_{tag}", (1.9, 2.1, 2.4), (-1.55, y, z), (0, 0, 0), mats["Material_Drive"], lod, "refractory_nozzle_housing", root, 0.14)
            throat = cylinder(f"NozzleThroat_{tag}", 0.55, 0.30, (-2.42, y, z), (0, math.pi / 2, 0), mats["Material_Structure"], lod, "recessed_nozzle_throat", root, 18, 0.05)
            strip_edge(throat)
    # Converter cassette + pipe runs feed the throats from the hull spine.
    box("ConverterCassette", (3.4, 4.2, 2.4), (4.6, 0, 3.9), (0, 0, 0), mats["Material_Drive"], lod, "power_converter_cassette", root, 0.14)
    for side in (-1, 1):
        beam(f"DriveFeedLine_{side}", (5.8, side * 2.4, 0.9), (4.9, side * 2.0, 3.4), 0.18, mats["Material_Cable" if "Material_Cable" in mats else "Material_Structure"], lod, "drive_feed_hardline", root, 0.03)
    # Cooling fins read their duty: four short directional stacks on the block crown.
    fin_count = 4 if lod == 0 else 3
    for index in range(fin_count):
        y = -2.6 + index * (5.2 / max(1, fin_count - 1))
        box(f"DriveRadiatorFin_{index}", (2.6, 0.14, 1.7), (0.6, y, 5.2), (0, 0, 0), mats["Material_Radiator"], lod, "drive_heat_rejection_fin", root, 0.03)
    if lod == 0:
        # Service releases and junction runs.
        for side in (-1, 1):
            box(f"DriveServiceHatch_{side}", (2.0, 0.12, 1.3), (2.2, side * 3.47, 1.4), (0, 0, 0), mats["Material_Safety"], lod, "drive_service_release", root, 0.04)
            strip_edge(cylinder(f"PumpCoupling_{side}", 0.30, 0.60, (3.2, side * 3.1, 3.6), (math.pi / 2, 0, 0), mats["Material_Drive"], lod, "coolant_pump_coupling", root, 12, 0.04))


def build_deck(lod: int, mats, root) -> None:
    # Continuous keel x 4..52, five transverse ribs, side hull plates, open work deck.
    box("KeelSpine", (48.0, 1.5, 1.4), (26.0, 0, -1.3), (0, 0, 0), mats["Material_Structure"], lod, "continuous_keel_spine", root, 0.12)
    for index, x in enumerate((8.0, 17.0, 26.0, 35.0, 44.0)):
        box(f"KeelRib_{index}", (1.2, 8.8, 1.0), (x, 0, -1.0), (0, 0, 0), mats["Material_Structure"], lod, "transverse_keel_rib", root, 0.10)
        for side in (-1, 1):
            beam(f"RibBrace_{index}_{side}", (x, side * 4.15, -0.6), (x + 1.6, side * 4.15, 1.9), 0.30, mats["Material_Structure"], lod, "keel_rib_brace", root, 0.06)
    for side in (-1, 1):
        box(f"HullSide_{side}", (46.0, 0.16, 3.7), (26.0, side * 4.42, 2.15), (0, 0, 0), mats["Material_Hull"], lod, "outer_hull_side_plate", root, 0.10)
    # Deck slabs with real negative space between cradle bays.
    for index, x in enumerate((8.0, 17.0, 27.0, 37.0)):
        box(f"DeckSlab_{index}", (8.6, 8.6, 0.5), (x, 0, 4.75), (0, 0, 0), mats["Material_Deck"], lod, "work_deck_plate", root, 0.10)
    # Safety kick plates along the deck edges: chevron zones at human contact lines.
    for side in (-1, 1):
        box(f"DeckKick_{side}", (45.0, 0.16, 0.55), (26.0, side * 4.42, 5.30), (0, 0, 0), mats["Material_Safety"], lod, "deck_edge_kick_plate", root, 0.06)
    # Conveyor rollers bridging the bays: the barge moves its own pallets.
    if lod == 0:
        for bay_index, x in enumerate((9.4, 14.6, 19.4, 24.6, 29.4, 34.6)):
            cylinder(f"ConveyorRoller_{bay_index}", 0.16, 7.6, (x, 0, 5.12), (math.pi / 2, 0, 0), mats["Material_Structure"], lod, "deck_conveyor_roller", root, 14, 0.04)
            for side in (-1, 1):
                box(f"ConveyorBearing_{bay_index}_{side}", (0.34, 0.30, 0.42), (x, side * 4.0, 5.12), (0, 0, 0), mats["Material_Structure"], lod, "roller_bearing_block", root, 0.05)


def build_bays(lod: int, mats, root) -> None:
    # Three cradles at the frozen container markers.  Each: four posts, two beams,
    # twistlocks, one seated corrugated container with corner castings and end-door bars.
    for bay, x in ((0, 12.0), (1, 22.0), (2, 32.0)):
        for side in (-1, 1):
            for dx in (-3.4, 3.4):
                box(f"Bay{bay}_Post_{dx}_{side}", (0.42, 0.42, 2.9), (x + dx, side * 3.55, 6.15), (0, 0, 0), mats["Material_Structure"], lod, "cradle_frame_post", root, 0.07)
            box(f"Bay{bay}_Beam_{side}", (7.7, 0.42, 0.5), (x, side * 3.55, 7.55), (0, 0, 0), mats["Material_Structure"], lod, "cradle_frame_beam", root, 0.07)
            if lod == 0:
                for dx in (-3.4, 3.4):
                    strip_edge(cylinder(f"Bay{bay}_Twistlock_{dx}_{side}", 0.14, 0.24, (x + dx, side * 3.3, 7.72), (0, 0, 0), mats["Material_Safety"], lod, "container_twistlock_socket", root, 10, 0.03))
        # The container itself: corrugated shell, corner castings, +X end-door hardware.
        box(f"Bay{bay}_Container", (8.6, 3.2, 2.88), (x, 0, 6.44), (0, 0, 0), mats["Material_Container"], lod, "seated_cargo_container_shell", root, 0.10)
        rib_count = 14 if lod == 0 else 6 if lod == 1 else 0
        for r in range(rib_count):
            rx = x - 3.75 + r * (7.5 / max(1, rib_count - 1))
            for side in (-1, 1):
                strip_edge(box(f"Bay{bay}_Rib_{r}_{side}", (0.10, 0.09, 2.95), (rx, side * 1.65, 6.55), (0, 0, 0), mats["Material_Container"], lod, "container_cold_formed_cleat", root, 0.0))
        for dx in (-4.12, 4.12):
            for side in (-1, 1):
                for dz in (5.30, 7.80):
                    strip_edge(box(f"Bay{bay}_Corner_{dx}_{side}_{dz}", (0.30, 0.30, 0.30), (x + dx, side * 1.62, dz), (0, 0, 0), mats["Material_Safety"], lod, "iso_corner_casting", root, 0.0))
        # End-door frame and bars face +X (toward the bridge and crew).
        box(f"Bay{bay}_DoorFrame", (0.16, 3.2, 2.95), (x + 4.38, 0, 6.55), (0, 0, 0), mats["Material_Structure"], lod, "container_end_door_frame", root, 0.05)
        if lod < 2:
            for dy in (-0.55, 0.55):
                box(f"Bay{bay}_DoorBar_{dy}", (0.09, 0.12, 2.7), (x + 4.50, dy, 6.55), (0, 0, 0), mats["Material_Structure"], lod, "container_locking_bar", root, 0.03)


def build_tower(lod: int, mats, root) -> None:
    # Machinery house at x 40..50, tower x 42..47, glazed band ahead over the bow path.
    box("BaseHouse", (10.4, 9.2, 6.6), (45.0, 0, 1.6), (0, 0, 0), mats["Material_Hull"], lod, "midship_machinery_house", root, 0.16)
    box("BaseHouseShoulder", (6.2, 10.0, 4.2), (46.5, 0, 1.9), (0, 0, 0), mats["Material_Hull"], lod, "machinery_shoulder_plate", root, 0.14)
    box("TowerLower", (5.0, 6.8, 1.6), (44.5, 0, 6.0), (0, 0, 0), mats["Material_Hull"], lod, "command_tower_lower_mass", root, 0.12)
    # Glazed band with real recess and mullions: not a glowing rectangle.
    box("TowerGlassBand", (5.02, 5.4, 0.62), (44.5, 0, 6.95), (0, 0, 0), mats["Material_Glass"], lod, "recessed_bridge_glazing_band", root, 0.02)
    mullion_count = 6 if lod == 0 else 3
    for index in range(mullion_count):
        y = -2.4 + index * (4.8 / max(1, mullion_count - 1))
        strip_edge(box(f"BridgeMullion_{index}", (5.10, 0.10, 0.62), (44.5, y, 6.95), (0, 0, 0), mats["Material_Structure"], lod, "bridge_band_mullion", root, 0.0))
    box("TowerCrown", (5.0, 6.8, 0.5), (44.5, 0, 7.5), (0, 0, 0), mats["Material_Hull"], lod, "command_tower_crown_plate", root, 0.10)
    # Sensor dome + short mast stay inside the z<=8 envelope.
    cylinder("SensorMast", 0.10, 0.5, (44.5, 1.6, 7.70), (0, 0, 0), mats["Material_Structure"], lod, "bridge_sensor_mast_stub", root, 10, 0.04)
    cylinder("SensorDome", 0.30, 0.22, (44.5, 1.6, 7.80), (0, 0, 0), mats["Material_Glass"], lod, "bridge_sensor_radome", root, 16, 0.03)
    # Directional radiator panels alongside the house convert drive power.
    for side in (-1, 1):
        for index in range(2):
            box(f"TowerRadiator_{side}_{index}", (2.0, 0.12, 1.6), (40.5 + index * 3.4, side * 4.66, 3.6), (0, 0, math.radians(4)), mats["Material_Radiator"], lod, "converter_heat_rejection_panel", root, 0.04)
    if lod < 2:
        for side in (-1, 1):
            box(f"HouseServiceHatch_{side}", (1.6, 0.14, 1.1), (43.0, side * 4.63, 1.0), (0, 0, 0), mats["Material_Safety"], lod, "machinery_service_release", root, 0.05)


def build_keel_to_bow(lod: int, mats, root) -> None:
    # Bow zone x 50..70: a lowered foredeck plus a forked loading boom whose two prongs
    # sweep outboard to the frozen status-optic positions at (70, +/-7.5, 6.2).
    box("ForeDeck", (20.0, 7.6, 0.5), (56.0, 0, 4.75), (0, 0, 0), mats["Material_Deck"], lod, "forward_work_deck", root, 0.10)
    for side in (-1, 1):
        box(f"ForeKick_{side}", (20.0, 0.16, 0.55), (56.0, side * 3.86, 5.30), (0, 0, 0), mats["Material_Safety"], lod, "forward_deck_kick_plate", root, 0.06)
    # Stem: the hull's forward skin narrows between the tower and the boom root.
    box("StemSheath", (6.0, 6.0, 3.4), (51.5, 0, 3.0), (0, 0, 0), mats["Material_Hull"], lod, "bow_stem_sheath_plate", root, 0.12)
    for side in (-1, 1):
        # Each prong is a built member from the bow to its optic tip.
        beam(f"BoomProng_{side}", (52.5, side * 2.4, 4.9), (69.6, side * 7.5, 6.1), 1.35, mats["Material_Hull"], lod, "loading_boom_prong_backbone", root, 0.14)
        beam(f"BoomProngRail_{side}", (53.0, side * 2.2, 4.35), (69.2, side * 7.35, 5.65), 0.30, mats["Material_Structure"], lod, "loading_boom_guide_rail", root, 0.06)
        beam(f"BoomBrace_{side}", (55.0, side * 3.9, 4.9), (60.5, side * 1.6, 4.85), 0.26, mats["Material_Structure"], lod, "loading_boom_knee_brace", root, 0.05)
        # Fork cross-ties keep the two prongs honest under load.
        beam(f"BoomCrossTie_{side}", (59.0, 0.0, 5.0), (59.0, side * 5.6, 5.25), 0.24, mats["Material_Structure"], lod, "loading_boom_cross_tie", root, 0.05)
    # Status pods at the exact frozen positions; the prong-tip vane restores the barge's
    # authored 18m beam: the legacy art reached y= +/-9 at these fins.
    for side in (-1, 1):
        box(f"StatusHousing_{side}", (0.55, 0.55, 0.65), (70.0, side * 7.5, 6.2), (0, 0, 0), mats["Material_Structure"], lod, "status_optic_machined_housing", root, 0.06)
        strip_edge(cylinder(f"StatusOptic_{side}", 0.16, 0.20, (70.16, side * 7.5, 6.2), (0, math.pi / 2, 0), mats["Material_Accent"], lod, "bounded_forward_status_optic", root, 14, 0.02))
        beam(f"StatusVane_{side}", (68.2, side * 7.9, 5.4), (69.6, side * 8.86, 6.7), 0.42, mats["Material_Hull"], lod, "prong_tip_lane_vane", root, 0.08)


def build_piping(lod: int, mats, root) -> None:
    cable_mat = mats["Material_Structure"]
    # Port drive-feed trunk runs the keel from the converter to the drive block.
    beam("PowerTrunk_Port", (4.9, -2.0, 0.4), (39.8, -3.9, 0.4), 0.20, cable_mat, lod, "drive_power_trunk_hardline", root, 0.03)
    beam("PowerTrunk_PortRise", (39.8, -3.9, 0.4), (40.6, -3.9, 2.7), 0.20, cable_mat, lod, "converter_riser_hardline", root, 0.03)
    if lod == 0:
        # Starboard side carries the data conduit on clamp saddles.
        beam("DataConduit_Starboard", (6.0, 3.95, 4.60), (38.0, 3.95, 4.60), 0.10, cable_mat, lod, "deck_data_bus_conduit", root, 0.02)
        for index in range(5):
            strip_edge(box(f"ConduitSaddle_{index}", (0.16, 0.12, 0.22), (8.0 + index * 7.2, 3.95, 4.60), (0, 0, 0), mats["Material_Structure"], lod, "conduit_saddle_clamp", root, 0.0))


def build_lod(lod: int, mats, root) -> None:
    build_drive_block(lod, mats, root)
    build_deck(lod, mats, root)
    build_bays(lod, mats, root)
    build_tower(lod, mats, root)
    build_keel_to_bow(lod, mats, root)
    if lod < 2:
        build_piping(lod, mats, root)


def join_groups(materials, root, drive_hook, emissive_hook) -> None:
    counts = []
    for obj in sorted((o for o in bpy.data.objects if o.type == "MESH"), key=lambda o: o.name):
        obj.data.calc_loop_triangles()
        counts.append({"name": obj.name, "tris": len(obj.data.loop_triangles)})
    counts.sort(key=lambda c: -c["tris"])
    print(f"[piece-cost] {json.dumps(counts[:20])}", flush=True)
    for lod in range(3):
        for material_name, material_value in materials.items():
            matches = [obj for obj in bpy.data.objects if obj.type == "MESH" and obj.name.startswith(f"LOD{lod}_") and obj.data.materials and obj.data.materials[0] == material_value]
            if not matches:
                continue
            bpy.ops.object.select_all(action="DESELECT")
            for obj in matches:
                obj.select_set(True)
            bpy.context.view_layer.objects.active = matches[0]
            if len(matches) > 1:
                bpy.ops.object.join()
            joined = bpy.context.object
            joined.name = f"LOD{lod}_Barge_{material_name}"
            if material_name == "Material_Drive":
                owner = drive_hook
            elif material_name in {"Material_Glass", "Material_Accent"}:
                owner = emissive_hook
            else:
                owner = root
            parent_preserve_world(joined, owner)
            joined["spaceface.lod"] = f"lod{lod}"
            joined["spaceface.lodLevel"] = lod
            joined["spaceface.materialRole"] = material_name
            joined["spaceface.structureRole"] = "merged_functional_draw_group"
            modifier = joined.modifiers.new("SF_ExportTriangulate", "TRIANGULATE")
            modifier.keep_custom_normals = True
            bpy.ops.object.modifier_apply(modifier=modifier.name)
            joined.select_set(False)


def tangent_results() -> list[dict]:
    results = []
    for obj in sorted((item for item in bpy.data.objects if item.type == "MESH"), key=lambda item: item.name):
        mesh = obj.data
        mesh.calc_loop_triangles()
        valid = False
        error = None
        try:
            mesh.calc_tangents(uvmap=mesh.uv_layers[0].name)
            lengths = [loop.tangent.length for loop in mesh.loops]
            valid = bool(lengths) and min(lengths) > 0.985 and max(lengths) < 1.015
            if not valid and lengths:
                bad = sum(1 for v in lengths if v <= 0.985 or v >= 1.015)
                print(f"[tangent-detail] {obj.name}: min={min(lengths):.4f} max={max(lengths):.4f} bad={bad}/{len(lengths)}", flush=True)
        except Exception as exc:
            error = str(exc)
        finally:
            try:
                mesh.free_tangents()
            except Exception:
                pass
        results.append({"object": obj.name, "valid": valid, "error": error, "loops": len(mesh.loops)})
    return results


def triangles(obj) -> int:
    obj.data.calc_loop_triangles()
    return len(obj.data.loop_triangles)


def bounds(objects):
    points = [obj.matrix_world @ Vector(corner) for obj in objects for corner in obj.bound_box]
    low = [min(point[axis] for point in points) for axis in range(3)]
    high = [max(point[axis] for point in points) for axis in range(3)]
    return {"min": low, "max": high, "size": [high[i] - low[i] for i in range(3)]}


def export_glb(target: Path, root) -> None:
    bpy.ops.object.select_all(action="DESELECT")
    for obj in bpy.data.objects:
        if obj.type not in {"LIGHT", "CAMERA"}:
            obj.select_set(True)
    bpy.context.view_layer.objects.active = root
    target.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.export_scene.gltf(filepath=str(target), export_format="GLB", use_selection=True, export_yup=True, export_apply=True, export_extras=True, export_texcoords=True, export_normals=True, export_tangents=True, export_materials="EXPORT")
    bpy.ops.object.select_all(action="DESELECT")


def main() -> None:
    args = cli()
    args.maps_root = args.maps_root.resolve()
    args.output_blend = args.output_blend.resolve()
    args.output_glb = args.output_glb.resolve()
    args.report = args.report.resolve()
    source_path = Path(bpy.data.filepath).resolve()
    maps_manifest = args.maps_root / "surface-map-build.json"
    root = bpy.data.objects.get("place_conveyor_barge")
    if root is None:
        raise RuntimeError("Expected conveyor barge root")
    markers = {name: bpy.data.objects.get(name) for name in MARKER_NAMES}
    missing = [name for name, obj in markers.items() if obj is None]
    if missing:
        raise RuntimeError(f"Missing contract empties: {missing}")
    preserved = {name: {"location": list(markers[name].location), "parent": markers[name].parent.name if markers[name].parent else None} for name in MARKER_NAMES}
    for obj in list(bpy.data.objects):
        if obj.type == "MESH":
            bpy.data.objects.remove(obj, do_unlink=True)
    for item in list(bpy.data.materials):
        bpy.data.materials.remove(item, do_unlink=True)
    for item in list(bpy.data.images):
        bpy.data.images.remove(item, do_unlink=True)
    materials = {name: material(name, role, args.maps_root) for name, role in ROLE_BY_MATERIAL.items()}
    drive_hook = markers["HOOK_DRIVE_PLUME"]
    emissive_hook = markers["HOOK_Emissive"]
    for lod in range(3):
        build_lod(lod, materials, root)
    failures = apply_modifiers_uv()
    join_groups(materials, root, drive_hook, emissive_hook)
    tangents = tangent_results()
    invalid = [entry for entry in tangents if not entry["valid"]]
    if invalid:
        raise RuntimeError(f"Tangent validation failed: {invalid[:5]}")
    scale_failures = [obj.name for obj in bpy.data.objects if obj.type == "MESH" and any(abs(float(v) - 1) > 1e-5 for v in obj.scale)]
    if scale_failures:
        raise RuntimeError(f"Unapplied scale: {scale_failures[:8]}")
    lod_meshes = {lod: sorted([obj for obj in bpy.data.objects if obj.type == "MESH" and obj.name.startswith(f"LOD{lod}_Barge_")], key=lambda item: item.name) for lod in range(3)}
    lod_stats = {f"lod{lod}": {"triangles": sum(triangles(obj) for obj in meshes), "drawGroups": len(meshes), "objects": [obj.name for obj in meshes]} for lod, meshes in lod_meshes.items()}
    candidate_bounds = bounds(lod_meshes[0])
    size_drift = [abs(candidate_bounds["size"][axis] - SOURCE_BOUNDS["size"][axis]) / SOURCE_BOUNDS["size"][axis] for axis in range(3)]
    corner_drift = [abs(candidate_bounds["min"][axis] - SOURCE_BOUNDS["min"][axis]) for axis in range(3)]
    if any(value > 0.08 for value in size_drift) or any(value > 0.16 for value in corner_drift):
        raise RuntimeError(f"Source scale/pivot drift outside guard: size={size_drift}, min={corner_drift}, bounds={candidate_bounds}")
    # Markers must not have moved; this is how runtime math survives the remaster.
    post = {name: {"location": list(markers[name].location), "parent": markers[name].parent.name if markers[name].parent else None} for name in MARKER_NAMES}
    if json.dumps(preserved, sort_keys=True) != json.dumps(post, sort_keys=True):
        raise RuntimeError(f"Marker drift: before={preserved} after={post}")
    root["spaceface.family"] = "opening_route_industrial_props_v1"
    root["spaceface.surfaceRevision"] = "opening_conveyor_barge_v1"
    root["spacefaceAssetJson"] = json.dumps({"contractVersion": 1, "assetId": "place_conveyor_barge", "partId": "place_conveyor_barge", "liveId": "place_conveyor_barge", "slot": "place", "forward": "+X", "up": "+Z(blender-source)", "unit": "metre", "normalConvention": "OpenGL", "ormChannels": "R=AO,G=Roughness,B=Metallic", "textureCompression": "PNG-source/KTX2-release-candidate", "textureSize": 1024, "family": "opening_route_industrial_props_v1", "role": "autonomous_ore_transfer_barge", "deliverableRole": "production_multi_lod_candidate", "lods": ["lod0", "lod1", "lod2"], "lodTriangles": {key: value["triangles"] for key, value in lod_stats.items()}, "drawGroupsPerLod": {key: value["drawGroups"] for key, value in lod_stats.items()}, "wiringStatus": "candidate_not_promoted"}, separators=(",", ":"))
    bpy.context.scene["spacefaceAssetJson"] = root["spacefaceAssetJson"]
    args.output_blend.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(args.output_blend), check_existing=False)
    export_glb(args.output_glb, root)
    hierarchy = {obj.name: obj.parent.name if obj.parent else None for obj in bpy.data.objects if obj.type == "MESH"}
    report = {
        "schema": "spaceface.openingConveyorBargeRemaster.v1",
        "status": "candidate-not-promoted",
        "source": {"path": str(source_path), "sha256": sha256(source_path)},
        "surfaceManifest": {"path": str(maps_manifest), "sha256": sha256(maps_manifest)},
        "outputs": {"blend": {"path": str(args.output_blend), "sha256": sha256(args.output_blend)}, "glb": {"path": str(args.output_glb), "sha256": sha256(args.output_glb)}},
        "preservedContract": {"sourceBounds": SOURCE_BOUNDS, "candidateBounds": candidate_bounds, "relativeSizeDrift": size_drift, "minimumCornerDriftM": corner_drift, "markers": post, "meshHierarchy": hierarchy},
        "materials": [{"name": name, "textureRole": role} for name, role in ROLE_BY_MATERIAL.items()],
        "lod": lod_stats,
        "modifierOrUvFailures": failures,
        "tangents": tangents,
        "knownDefects": [
            "Candidate has not been promoted or inspected on the live player route.",
            "Drive plume VFX origin and emissive status behavior must be validated on the normal route after promotion.",
            "KTX2 binding, release optimization, collision and LOD thresholds remain controller-owned integration work.",
        ],
    }
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps({"ok": True, "blend": str(args.output_blend), "glb": str(args.output_glb), "report": str(args.report), "lod": lod_stats, "bounds": candidate_bounds}))


if __name__ == "__main__":
    main()

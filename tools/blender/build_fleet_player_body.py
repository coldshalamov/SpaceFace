"""Build remastered player wholeship bodies for the remaining live roster.

Does not touch Hitch. Outputs per-ship source GLBs + stills under
assets/ships/fleet_player_bodies_v1/<id>/.

Run:
  blender --background --python tools/blender/build_fleet_player_body.py -- --only mule
  blender --background --python tools/blender/build_fleet_player_body.py -- --only hornet,ironback,drifter
"""
from __future__ import annotations

from contextlib import contextmanager
import hashlib
import json
import math
import os
import shutil
import struct
import sys
import tempfile
import time
from pathlib import Path

import bpy
import bmesh
from mathutils import Vector

TOOLS = Path(__file__).resolve().parent
if str(TOOLS) not in sys.path:
    sys.path.insert(0, str(TOOLS))
from fleet_construction import (  # noqa: E402
    add_armor_tile,
    add_manufactured_drive,
    add_panel_seams,
    add_radiator_cassette,
    add_rcs_cluster,
    add_sensor_dish,
    add_service_hatch,
    add_service_pipe,
    add_midship_kit,
    add_cockpit_glazing,
    cut_open_bay,
)

ROOT = Path(__file__).resolve().parents[2]
FAMILY = ROOT / "assets" / "ships" / "fleet_player_bodies_v1"
TEXTURE_SRC = ROOT / "assets" / "ships" / "wasp_production_v1" / "textures"
TEXTURE_SETS = {
    "Material_Hull": "hull",
    "Material_Armor": "armor_dark",
    "Material_Mechanical": "mechanical",
    "Material_Accent": "frontier_cyan",
    "Material_Warning": "warning_orange",
}
WING_ARMOR_BEVEL = 0.01
HORNET_WING_ARMOR_TERMINAL_HZ = 0.065
HORNET_WING_ARMOR_TERMINAL_CHAMFER = 0.018

# Distinct live bodies. Hitch is excluded. Pelican/Wasp already have dedicated packages.
SPECS = {
    "mule": {
        "assetId": "SF_MULE_PRODUCTION_V1", "defId": "ship_mule",
        "hullTint": (0.22, 0.24, 0.18, 1.0), "role": "hauler",
        "length": 18.0, "halfW": 2.0, "height": 1.15,
        "drives": [(-7.6, -1.45), (-7.6, 1.45)], "bridge": True, "pods": 2,
        "guns": "rear",
    },
    "drifter": {
        "assetId": "SF_DRIFTER_PRODUCTION_V1", "defId": "ship_drifter",
        "hullTint": (0.28, 0.32, 0.34, 1.0), "role": "multirole",
        "length": 16.0, "halfW": 1.7, "height": 0.95,
        "drives": [(-6.4, -1.55), (-6.4, 1.55)], "winglets": True, "nacelles": True,
        "guns": "front_rear",
    },
    "hornet": {
        "assetId": "SF_HORNET_PRODUCTION_V1", "defId": "ship_hornet",
        "hullTint": (0.14, 0.16, 0.18, 1.0), "role": "interceptor",
        "length": 16.5, "halfW": 2.4, "height": 0.72,
        "drives": [(-7.0, 0.0)], "wings": True, "canards": True, "turret": True,
        "guns": "twin_front",
    },
    "ironback": {
        "assetId": "SF_IRONBACK_PRODUCTION_V1", "defId": "ship_ironback",
        "hullTint": (0.30, 0.16, 0.08, 1.0), "role": "barge",
        "length": 17.0, "halfW": 2.6, "height": 1.35,
        "drives": [(-6.8, -1.7), (-6.8, 1.7)], "arms": 4, "hoppers": True,
        "guns": "turret",
    },
    "bastion": {
        "assetId": "SF_BASTION_PRODUCTION_V1", "defId": "ship_bastion",
        "hullTint": (0.16, 0.18, 0.22, 1.0), "role": "corvette",
        "length": 18.5, "halfW": 2.1, "height": 1.05,
        "drives": [(-7.8, -1.5), (-7.8, 1.5)], "tower": True, "broadsides": True,
        "guns": "twin_front",
    },
    "atlas": {
        "assetId": "SF_ATLAS_PRODUCTION_V1", "defId": "ship_atlas",
        "hullTint": (0.20, 0.22, 0.17, 1.0), "role": "bulk",
        "length": 22.0, "halfW": 2.4, "height": 1.45,
        "drives": [(-9.4, -1.7), (-9.4, 1.7), (-9.4, -0.7), (-9.4, 0.7)],
        "bridge": True, "pods": 3, "guns": "front_rear",
    },
    "ranger": {
        "assetId": "SF_RANGER_PRODUCTION_V1", "defId": "ship_ranger",
        "hullTint": (0.30, 0.28, 0.22, 1.0), "role": "explorer",
        "length": 18.0, "halfW": 1.65, "height": 0.92,
        "drives": [(-7.4, -1.2), (-7.4, 1.2)], "mast": True, "winglets": True,
        "guns": "twin_front",
    },
    "warden": {
        "assetId": "SF_WARDEN_PRODUCTION_V1", "defId": "ship_warden",
        "hullTint": (0.15, 0.16, 0.18, 1.0), "role": "gunship",
        "length": 20.0, "halfW": 2.5, "height": 1.2,
        "drives": [(-8.6, -1.8), (-8.6, 1.8), (-8.6, 0.0)], "tower": True, "broadsides": True,
        "guns": "twin_front",
    },
    "colossus": {
        "assetId": "SF_COLOSSUS_PRODUCTION_V1", "defId": "ship_colossus",
        "hullTint": (0.17, 0.18, 0.20, 1.0), "role": "capital",
        "length": 24.0, "halfW": 2.9, "height": 1.45,
        "drives": [(-10.2, -2.0), (-10.2, 2.0), (-10.2, -0.75), (-10.2, 0.75)],
        "tower": True, "broadsides": True, "fins": True,
        "guns": "triple_front",
    },
    "leviathan": {
        "assetId": "SF_LEVIATHAN_PRODUCTION_V1", "defId": "ship_leviathan",
        "hullTint": (0.13, 0.14, 0.16, 1.0), "role": "flagship",
        "length": 27.0, "halfW": 3.2, "height": 1.7,
        "drives": [(-11.4, -2.3), (-11.4, 2.3), (-11.4, -0.85), (-11.4, 0.85)],
        "tower": True, "broadsides": True, "fins": True,
        "guns": "triple_front",
    },
    "ashline_dart": {
        "assetId": "SF_ASHLINE_DART_V1", "defId": "wasp_swarmer",
        "hullTint": (0.22, 0.10, 0.08, 1.0), "role": "hostile_dart",
        "length": 12.0, "halfW": 1.6, "height": 0.55,
        "drives": [(-5.2, 0.0)], "wings": True, "canards": True, "guns": "twin_front",
    },
    "ashline_lode": {
        "assetId": "SF_ASHLINE_LODE_V1", "defId": "bruiser_brawler",
        "hullTint": (0.24, 0.12, 0.08, 1.0), "role": "hostile_bruiser",
        "length": 16.0, "halfW": 2.1, "height": 0.95,
        "drives": [(-6.6, -1.2), (-6.6, 1.2)], "tower": True, "guns": "twin_front",
    },
    "ashline_rig": {
        "assetId": "SF_ASHLINE_RIG_V1", "defId": "reaver_pirate",
        "hullTint": (0.18, 0.10, 0.08, 1.0), "role": "hostile_rig",
        "length": 15.0, "halfW": 2.0, "height": 0.85,
        "drives": [(-6.2, -1.1), (-6.2, 1.1)], "winglets": True, "guns": "front_rear",
    },
    "helios_lark": {
        "assetId": "SF_HELIOS_LARK_V1", "defId": "courier",
        "hullTint": (0.55, 0.52, 0.46, 1.0), "role": "courier",
        "length": 13.0, "halfW": 1.3, "height": 0.62,
        "drives": [(-5.6, 0.0)], "winglets": True,
    },
    "helios_cradle": {
        "assetId": "SF_HELIOS_CRADLE_V1", "defId": "miner",
        "hullTint": (0.42, 0.40, 0.34, 1.0), "role": "civilian_miner",
        "length": 15.0, "halfW": 1.9, "height": 0.95,
        "drives": [(-6.2, -1.2), (-6.2, 1.2)], "arms": 2, "hoppers": True,
    },
    "helios_span": {
        "assetId": "SF_HELIOS_SPAN_V1", "defId": "hauler",
        "hullTint": (0.48, 0.46, 0.40, 1.0), "role": "civilian_hauler",
        "length": 18.0, "halfW": 2.0, "height": 1.05,
        "drives": [(-7.6, -1.3), (-7.6, 1.3)], "bridge": True, "pods": 2,
    },
    "ore_barge": {
        "assetId": "SF_ORE_BARGE_V1", "defId": "ore_carrier",
        "hullTint": (0.28, 0.22, 0.14, 1.0), "role": "ore_barge",
        "length": 19.0, "halfW": 2.4, "height": 1.2,
        "drives": [(-8.0, -1.5), (-8.0, 1.5)], "hoppers": True, "pods": 1,
    },
    "repair_tender": {
        "assetId": "SF_REPAIR_TENDER_V1", "defId": "tender",
        "hullTint": (0.32, 0.34, 0.28, 1.0), "role": "tender",
        "length": 14.0, "halfW": 1.6, "height": 0.8,
        "drives": [(-5.8, -1.0), (-5.8, 1.0)], "bridge": True,
    },
    "salvage_cutter": {
        "assetId": "SF_SALVAGE_CUTTER_V1", "defId": "salvor",
        "hullTint": (0.26, 0.22, 0.16, 1.0), "role": "salvor",
        "length": 15.0, "halfW": 1.8, "height": 0.85,
        "drives": [(-6.2, -1.1), (-6.2, 1.1)], "arms": 2,
    },
    "survey_pin": {
        "assetId": "SF_SURVEY_PIN_V1", "defId": "surveyor",
        "hullTint": (0.34, 0.36, 0.32, 1.0), "role": "surveyor",
        "length": 11.0, "halfW": 1.1, "height": 0.55,
        "drives": [(-4.6, 0.0)], "mast": True,
    },
}


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest().upper()


def parse_only(argv=None) -> list[str]:
    tokens = list(argv) if argv is not None else (
        sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    )
    positions = [index for index, token in enumerate(tokens) if token == "--only"]
    if not positions:
        raise ValueError("--only is required; name one or more comma-separated fleet IDs")
    if len(positions) != 1:
        raise ValueError("--only may be specified only once")

    option_index = positions[0]
    if option_index + 1 >= len(tokens) or tokens[option_index + 1].startswith("--"):
        raise ValueError("--only requires a comma-separated value")
    ship_ids = [part.strip() for part in tokens[option_index + 1].split(",")]
    if not ship_ids or any(not ship_id for ship_id in ship_ids):
        raise ValueError("--only contains an empty fleet ID")

    seen = set()
    duplicates = []
    for ship_id in ship_ids:
        if ship_id in seen and ship_id not in duplicates:
            duplicates.append(ship_id)
        seen.add(ship_id)
    if duplicates:
        raise ValueError(f"--only contains duplicate fleet IDs: {', '.join(duplicates)}")

    unknown = [ship_id for ship_id in ship_ids if ship_id not in SPECS]
    if unknown:
        raise ValueError(f"--only contains unknown fleet IDs: {', '.join(unknown)}")
    return ship_ids


def parse_skip_renders() -> bool:
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    return "--skip-renders" in argv


def reset_scene() -> None:
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for bucket in (bpy.data.meshes, bpy.data.curves, bpy.data.materials, bpy.data.cameras, bpy.data.lights):
        for item in list(bucket):
            bucket.remove(item)
    for collection in list(bpy.data.collections):
        bpy.data.collections.remove(collection)


def principled(material):
    material.use_nodes = True
    material.node_tree.nodes.clear()
    output = material.node_tree.nodes.new("ShaderNodeOutputMaterial")
    bsdf = material.node_tree.nodes.new("ShaderNodeBsdfPrincipled")
    material.node_tree.links.new(bsdf.outputs["BSDF"], output.inputs["Surface"])
    return bsdf


def make_pbr_material(name, prefix, texture_dir, tint, metallic, roughness):
    material = bpy.data.materials.new(name)
    bsdf = principled(material)
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    texcoord = nodes.new("ShaderNodeTexCoord")
    mapping = nodes.new("ShaderNodeMapping")
    links.new(texcoord.outputs["UV"], mapping.inputs["Vector"])
    mapping.inputs["Scale"].default_value = (1.3, 1.3, 1.3)
    base = nodes.new("ShaderNodeTexImage")
    base.image = bpy.data.images.load(str(texture_dir / f"{prefix}_basecolor.png"), check_existing=True)
    base.image.pack()
    base.image.colorspace_settings.name = "sRGB"
    mix = nodes.new("ShaderNodeMixRGB")
    mix.blend_type = "MIX"
    mix.inputs[0].default_value = 0.74
    mix.inputs[2].default_value = tint
    links.new(mapping.outputs["Vector"], base.inputs["Vector"])
    links.new(base.outputs["Color"], mix.inputs[1])
    links.new(mix.outputs["Color"], bsdf.inputs["Base Color"])
    normal = nodes.new("ShaderNodeTexImage")
    normal.image = bpy.data.images.load(str(texture_dir / f"{prefix}_normal.png"), check_existing=True)
    normal.image.pack()
    normal.image.colorspace_settings.name = "Non-Color"
    links.new(mapping.outputs["Vector"], normal.inputs["Vector"])
    nmap = nodes.new("ShaderNodeNormalMap")
    nmap.inputs["Strength"].default_value = 0.42
    links.new(normal.outputs["Color"], nmap.inputs["Color"])
    links.new(nmap.outputs["Normal"], bsdf.inputs["Normal"])
    orm = nodes.new("ShaderNodeTexImage")
    orm.image = bpy.data.images.load(str(texture_dir / f"{prefix}_orm.png"), check_existing=True)
    orm.image.pack()
    orm.image.colorspace_settings.name = "Non-Color"
    links.new(mapping.outputs["Vector"], orm.inputs["Vector"])
    separate = nodes.new("ShaderNodeSeparateColor")
    links.new(orm.outputs["Color"], separate.inputs["Color"])
    links.new(separate.outputs["Green"], bsdf.inputs["Roughness"])
    links.new(separate.outputs["Blue"], bsdf.inputs["Metallic"])
    material["spacefaceRole"] = name.replace("Material_", "").lower()
    return material


def create_materials(texture_dir, hull_tint):
    mats = {
        "Material_Hull": make_pbr_material("Material_Hull", "hull", texture_dir, hull_tint, 0.18, 0.50),
        "Material_Armor": make_pbr_material("Material_Armor", "armor_dark", texture_dir, (0.12, 0.13, 0.145, 1), 0.28, 0.44),
        "Material_Mechanical": make_pbr_material("Material_Mechanical", "mechanical", texture_dir, (0.32, 0.33, 0.34, 1), 0.78, 0.30),
        "Material_Accent": make_pbr_material("Material_Accent", "frontier_cyan", texture_dir, (0.06, 0.62, 0.78, 1), 0.18, 0.40),
        "Material_Warning": make_pbr_material("Material_Warning", "warning_orange", texture_dir, (0.78, 0.42, 0.08, 1), 0.08, 0.46),
    }
    canopy = bpy.data.materials.new("Material_Canopy")
    bsdf = principled(canopy)
    bsdf.inputs["Base Color"].default_value = (0.015, 0.04, 0.055, 1)
    bsdf.inputs["Metallic"].default_value = 0.08
    bsdf.inputs["Roughness"].default_value = 0.06
    bsdf.inputs["Coat Weight"].default_value = 1.0
    bsdf.inputs["Coat Roughness"].default_value = 0.03
    # Opaque dark glass. Volume transmission turned the loft into a teal leather brick.
    canopy["spacefaceRole"] = "glass"
    mats[canopy.name] = canopy
    thruster = bpy.data.materials.new("Material_Thruster")
    bsdf = principled(thruster)
    bsdf.inputs["Base Color"].default_value = (0.02, 0.10, 0.14, 1)
    bsdf.inputs["Emission Color"].default_value = (0.18, 0.55, 0.72, 1)
    bsdf.inputs["Emission Strength"].default_value = 1.3
    thruster["spacefaceRole"] = "thruster"
    thruster["embeddedPlume"] = False
    mats[thruster.name] = thruster
    ceramic = bpy.data.materials.new("Material_Ceramic")
    bsdf = principled(ceramic)
    bsdf.inputs["Base Color"].default_value = (0.62, 0.58, 0.48, 1)
    bsdf.inputs["Metallic"].default_value = 0.0
    bsdf.inputs["Roughness"].default_value = 0.58
    ceramic["spacefaceRole"] = "ceramic"
    mats[ceramic.name] = ceramic
    radiator = bpy.data.materials.new("Material_Radiator")
    bsdf = principled(radiator)
    bsdf.inputs["Base Color"].default_value = (0.22, 0.18, 0.14, 1)
    bsdf.inputs["Metallic"].default_value = 0.72
    bsdf.inputs["Roughness"].default_value = 0.62
    radiator["spacefaceRole"] = "radiator"
    mats[radiator.name] = radiator
    return mats


def link_object(obj, collection):
    for current in list(obj.users_collection):
        current.objects.unlink(obj)
    collection.objects.link(obj)
    return obj


def finish_mesh(obj, material, bevel=0.04):
    obj.data.materials.clear()
    obj.data.materials.append(material)
    if bevel > 0:
        mod = obj.modifiers.new("ProductionBevel", "BEVEL")
        mod.width = bevel
        mod.segments = 2
        mod.limit_method = "ANGLE"
        mod.angle_limit = math.radians(40)
    obj["spacefaceRole"] = material.get("spacefaceRole", "static")
    return obj


def add_box(name, loc, scale, material, collection, bevel=0.04, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cube_add(location=loc, rotation=rot)
    obj = link_object(bpy.context.object, collection)
    obj.name = name
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return finish_mesh(obj, material, bevel)


def add_cylinder(name, loc, radius, depth, material, collection, vertices=20, bevel=0.025, rot=(0, math.pi / 2, 0)):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=loc, rotation=rot)
    obj = link_object(bpy.context.object, collection)
    obj.name = name
    return finish_mesh(obj, material, bevel)


def chamfer_ring(x, yc, zc, hw, hh, chamfer):
    c = min(chamfer, hw * 0.45, hh * 0.45)
    return [
        (x, yc + hw - c, zc + hh), (x, yc + hw, zc + hh - c),
        (x, yc + hw, zc - hh + c), (x, yc + hw - c, zc - hh),
        (x, yc - hw + c, zc - hh), (x, yc - hw, zc - hh + c),
        (x, yc - hw, zc + hh - c), (x, yc - hw + c, zc + hh),
    ]


def add_chamfer_loft(name, stations, material, collection, bevel=0.04):
    rings = [chamfer_ring(*station) for station in stations]
    sides = 8
    verts = [vert for ring in rings for vert in ring]
    faces = [tuple(range(sides - 1, -1, -1)), tuple(range((len(rings) - 1) * sides, len(rings) * sides))]
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


def span_ring(x, y, z, hx, hz, chamfer):
    c = min(chamfer, hx * 0.45, hz * 0.45)
    return [
        (x + hx - c, y, z + hz), (x + hx, y, z + hz - c),
        (x + hx, y, z - hz + c), (x + hx - c, y, z - hz),
        (x - hx + c, y, z - hz), (x - hx, y, z - hz + c),
        (x - hx, y, z + hz - c), (x - hx + c, y, z + hz),
    ]


def wing_armor_terminal_has_bevel_clearance(half_thickness, chamfer, bevel):
    """Keep a terminal chamfer wide enough for the two adjacent bevel edges."""
    minimum_half_thickness = chamfer + bevel
    return (
        half_thickness > minimum_half_thickness
        and math.hypot(chamfer, chamfer) > bevel * 2
    )


def wing_armor_stations(ship_id, hw, sign):
    terminal_hz = HORNET_WING_ARMOR_TERMINAL_HZ if ship_id == "hornet" else 0.022
    terminal_chamfer = HORNET_WING_ARMOR_TERMINAL_CHAMFER if ship_id == "hornet" else 0.01
    if ship_id == "hornet" and not wing_armor_terminal_has_bevel_clearance(
        terminal_hz, terminal_chamfer, WING_ARMOR_BEVEL,
    ):
        raise ValueError("Hornet WingArmor terminal section is too thin for its chamfer and bevel")
    return [
        (-0.05, (hw + 0.40) * sign, 0.14, 1.05, 0.05, 0.02),
        (-0.40, (hw + 1.20) * sign, 0.10, 0.82, 0.035, 0.015),
        (-0.80, (hw + 1.90) * sign, 0.05, 0.48, terminal_hz, terminal_chamfer),
    ]


def add_span_loft(name, stations, material, collection, bevel=0.02):
    """Loft along +Y so wings have a real root-to-tip section, not a flat card."""
    rings = [span_ring(*station) for station in stations]
    sides = 8
    verts = [vert for ring in rings for vert in ring]
    faces = [tuple(range(sides - 1, -1, -1)), tuple(range((len(rings) - 1) * sides, len(rings) * sides))]
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


def add_empty(name, loc, collection, parent=None):
    obj = bpy.data.objects.new(name, None)
    collection.objects.link(obj)
    obj.empty_display_type = "PLAIN_AXES"
    obj.empty_display_size = 0.2
    obj.location = loc
    if parent:
        obj.parent = parent
    obj["socket"] = True
    return obj


def add_drive(tag, x, y, lod, mats, collection):
    add_manufactured_drive(tag, x, y, lod, mats, collection, scale=1.0, z=0.08)


def add_cutter_arm(tag, x, y, z, lod, mats, collection):
    mech = mats["Material_Mechanical"]
    armor = mats["Material_Armor"]
    add_box(f"Arm_Saddle_{tag}", (x, y, z), (0.35, 0.22, 0.22), mats["Material_Hull"], collection, 0.02)
    add_box(f"Arm_Boom_{tag}", (x + 1.15, y, z - 0.12), (0.95, 0.12, 0.12), mech, collection, 0.02)
    add_box(f"Arm_Knuckle_{tag}", (x + 2.15, y, z - 0.22), (0.18, 0.16, 0.16), mech, collection, 0.015)
    add_cylinder(f"Arm_Cutter_{tag}", (x + 2.55, y, z - 0.28), 0.26, 0.24, armor, collection, vertices=14, bevel=0.012, rot=(math.pi / 2, 0, 0))
    if lod == 0:
        for tooth in range(8):
            angle = math.tau * tooth / 8
            add_box(
                f"Arm_Tooth_{tag}_{tooth}",
                (x + 2.55, y + math.cos(angle) * 0.27, z - 0.28 + math.sin(angle) * 0.27),
                (0.04, 0.025, 0.06), armor, collection, 0.003, (angle, 0, 0),
            )


def sockets_for(spec):
    half = spec["length"] * 0.5
    return {
        "SOCKET_Weapon_Front": (half - 1.2, 0.0, 0.25),
        "SOCKET_Mining_Front": (half - 0.6, 0.0, -0.15),
        "SOCKET_Engine_Main": (-half + 1.2, 0.0, 0.08),
        "SOCKET_Trail_Main": (-half + 0.8, 0.0, 0.08),
        "SOCKET_Trail_Port": (-half + 1.0, -spec["halfW"] * 0.7, 0.08),
        "SOCKET_Trail_Starboard": (-half + 1.0, spec["halfW"] * 0.7, 0.08),
        "SOCKET_Utility_Dorsal": (0.6, 0.0, spec["height"] + 0.55),
        "SOCKET_Cargo_Ventral": (-0.4, 0.0, -spec["height"] - 0.15),
        "SOCKET_Camera_Focus": (0.8, 0.0, 0.25),
        "SOCKET_RCS_Port": (-1.2, -spec["halfW"] - 0.2, 0.15),
        "SOCKET_RCS_Starboard": (-1.2, spec["halfW"] + 0.2, 0.15),
    }


def build_ship(ship_id, spec, lod, mats):
    collection = bpy.data.collections.new(f"{ship_id.upper()}_LOD{lod}")
    bpy.context.scene.collection.children.link(collection)
    hull, armor, mech = mats["Material_Hull"], mats["Material_Armor"], mats["Material_Mechanical"]
    canopy, warning, accent = mats["Material_Canopy"], mats["Material_Warning"], mats["Material_Accent"]
    half = spec["length"] * 0.5
    hw, hh = spec["halfW"], spec["height"]
    root = add_empty(f"{ship_id.upper()}_LOD{lod}_ROOT", (0, 0, 0), collection)
    root["spacefaceAsset"] = {
        "assetId": spec["assetId"], "partId": f"{ship_id}_production_v1",
        "lod": f"lod{lod}", "slot": "hull", "category": "wholeships",
        "forward": "+X", "embeddedPlume": False,
    }
    hull_obj = add_chamfer_loft("Pressure_Hull", [
        (half, 0, 0.08, hw * 0.28, hh * 0.38, 0.08),
        (half * 0.72, 0, 0.10, hw * 0.62, hh * 0.68, 0.14),
        (half * 0.40, 0, 0.11, hw * 0.88, hh * 0.90, 0.18),
        (0.0, 0, 0.08, hw, hh, 0.20),
        (-half * 0.32, 0, 0.08, hw * 0.94, hh * 0.92, 0.18),
        (-half * 0.68, 0, 0.10, hw * 0.70, hh * 0.72, 0.14),
        (-half + 0.85, 0, 0.12, hw * 0.38, hh * 0.42, 0.08),
    ], hull, collection, 0.045)
    course_xs = [half * t for t in (0.72, 0.48, 0.24, 0.0, -0.24, -0.48, -0.68)]
    for i, x in enumerate(course_xs):
        add_box(f"Hull_Course_{i}", (x, 0, 0.08), (0.045, hw * 0.88, hh * 0.78), hull, collection, 0.01)
    add_box("Hull_Chine_Port", (half * 0.38, -hw * 0.92, 0.05), (half * 0.26, 0.05, hh * 0.45), hull, collection, 0.012)
    add_box("Hull_Chine_Starboard", (half * 0.38, hw * 0.92, 0.05), (half * 0.26, 0.05, hh * 0.45), hull, collection, 0.012)
    add_box("Hull_Belly_Plate", (0, 0, -hh * 0.85), (half * 0.6, hw * 0.55, 0.05), hull, collection, 0.012)
    add_box("Ventral_Keel", (0, 0, -hh - 0.08), (half * 0.75, hw * 0.28, 0.07), mech, collection, 0.025)
    add_cylinder("Tail_Fairing", (-half + 0.15, 0, 0.10), max(0.28, hw * 0.28), 0.42, armor, collection, vertices=16, bevel=0.015)

    if spec.get("bridge"):
        bridge_pedestal = add_box("Bridge_Pedestal", (half * 0.55, 0, hh + 0.15), (0.85, 0.65, 0.45), armor, collection, 0.025)
        if lod <= 1:
            cut_open_bay(
                bridge_pedestal, "Cockpit",
                (half * 0.52, 0.0, hh + 0.55),
                0.55, 0.42, 0.38, (0.0, 0.0, 1.0),
                mats, collection, kit="cockpit",
            )
        add_cockpit_glazing("Bridge", (half * 0.52, 0.0, hh + 0.55), 0.55, 0.42, hh, mats, collection, raised=0.12)
        add_box("Bridge_Brow", (half * 0.54, 0, hh + 1.05), (0.45, 0.40, 0.05), armor, collection, 0.01)
    else:
        if lod <= 1:
            cut_open_bay(
                hull_obj, "Cockpit",
                (half * 0.30, 0.0, hh),
                half * 0.16, hw * 0.28, 0.34, (0.0, 0.0, 1.0),
                mats, collection, kit="cockpit",
            )
        add_cockpit_glazing("Canopy", (half * 0.30, 0.0, hh), half * 0.16, hw * 0.28, hh, mats, collection)

    for index, (x, y) in enumerate(spec["drives"]):
        drive_x = min(x, -half - 0.35)
        add_manufactured_drive(f"{index}", drive_x, y, lod, mats, collection, scale=1.7, z=0.08)

    if spec.get("wings"):
        for sign, side in ((-1, "Port"), (1, "Starboard")):
            add_span_loft(f"Wing_{side}", [
                (0.05, hw * 0.90 * sign, 0.06, 1.55, 0.28, 0.08),
                (-0.35, (hw + 1.00) * sign, 0.03, 1.25, 0.18, 0.06),
                (-0.85, (hw + 1.85) * sign, -0.02, 0.88, 0.11, 0.04),
                (-1.25, (hw + 2.35) * sign, -0.06, 0.55, 0.06, 0.025),
            ], hull, collection, 0.018)
            add_cylinder(
                f"WingLeading_{side}",
                (-0.15, (hw + 1.05) * sign, 0.10),
                0.055, 1.55, armor, collection, vertices=12, bevel=0.008,
                rot=(math.pi / 2, 0.12 * sign, 0),
            )
            add_box(f"WingRoot_{side}", (0.10, hw * 0.86 * sign, 0.08), (0.95, 0.28, 0.20), hull, collection, 0.02)
            add_box(f"WingRootFairing_{side}", (-0.15, hw * 0.78 * sign, -0.02), (0.55, 0.16, 0.12), mech, collection, 0.012)
            add_span_loft(
                f"WingArmor_{side}", wing_armor_stations(ship_id, hw, sign),
                armor, collection, WING_ARMOR_BEVEL,
            )
            add_box(f"WingFlap_{side}", (-1.55, (hw + 1.35) * sign, -0.04), (0.22, 0.62, 0.035), mech, collection, 0.006)
            add_box(f"WingFlapGap_{side}", (-1.28, (hw + 1.35) * sign, -0.02), (0.03, 0.58, 0.05), mech, collection, 0.002)
            add_box(f"WingFence_{side}", (-0.35, (hw + 0.85) * sign, 0.18), (0.7, 0.018, 0.11), armor, collection, 0.005)
            add_box(f"Hardpoint_{side}", (-0.15, (hw + 1.10) * sign, -0.18), (0.48, 0.08, 0.07), mech, collection, 0.007)
            add_box(f"Pylon_{side}", (-0.15, (hw + 1.10) * sign, -0.28), (0.18, 0.05, 0.10), mech, collection, 0.006)
            add_box(f"Accent_Rail_{side}", (-0.25, (hw + 1.15) * sign, 0.16), (0.7, 0.025, 0.016), accent, collection, 0.003)
            add_box(f"WingSeamA_{side}", (-0.55, (hw + 1.25) * sign, 0.12), (0.018, 0.55, 0.02), mech, collection, 0.003)
            add_box(f"WingSeamB_{side}", (-0.95, (hw + 1.65) * sign, 0.08), (0.018, 0.40, 0.016), mech, collection, 0.003)
    if spec.get("canards"):
        for sign, side in ((-1, "Port"), (1, "Starboard")):
            add_box(f"Canard_{side}", (half * 0.35, (hw * 0.7) * sign, 0.12), (0.85, 0.35, 0.05), armor, collection, 0.015)
    if spec.get("winglets"):
        for sign, side in ((-1, "Port"), (1, "Starboard")):
            add_box(f"Winglet_{side}", (-half * 0.15, (hw + 0.35) * sign, 0.15), (1.1, 0.18, 0.05), hull, collection, 0.015)
    if spec.get("nacelles"):
        for sign, side in ((-1, "Port"), (1, "Starboard")):
            add_chamfer_loft(f"Nacelle_{side}", [
                (1.4, hw * 0.85 * sign, 0.1, 0.32, 0.28, 0.06),
                (-1.2, hw * 0.85 * sign, 0.08, 0.42, 0.34, 0.07),
                (-4.6, hw * 0.85 * sign, 0.08, 0.30, 0.26, 0.05),
            ], armor, collection, 0.02)
    if spec.get("turret"):
        add_cylinder("Turret_Base", (0.0, 0.0, hh + 0.35), 0.38, 0.18, mech, collection, vertices=14, bevel=0.015, rot=(0, 0, 0))
        add_box("Turret_Head", (0.15, 0.0, hh + 0.55), (0.35, 0.22, 0.12), armor, collection, 0.012)
    if spec.get("tower"):
        add_box("Tower", (half * 0.12, 0.0, hh + 0.55), (1.1, 0.55, 0.55), armor, collection, 0.03)
        add_box("Tower_Glass", (half * 0.22, 0.0, hh + 0.95), (0.35, 0.38, 0.18), canopy, collection, 0.012)
    if spec.get("broadsides"):
        for sign, side in ((-1, "Port"), (1, "Starboard")):
            add_box(f"Broadside_{side}", (0.2, (hw + 0.15) * sign, 0.25), (0.85, 0.22, 0.22), mech, collection, 0.02)
            add_cylinder(f"Broadside_Barrel_{side}", (0.85, (hw + 0.15) * sign, 0.25), 0.07, 0.7, armor, collection, vertices=10, bevel=0.008)
    if spec.get("mast"):
        add_cylinder("Survey_Mast", (-half * 0.15, 0.0, hh + 0.85), 0.05, 1.2, mech, collection, vertices=10, bevel=0.008, rot=(0, 0, 0))
        add_box("Survey_Head", (-half * 0.15, 0.0, hh + 1.5), (0.22, 0.16, 0.10), armor, collection, 0.01)
    if spec.get("fins"):
        for sign, side in ((-1, "Port"), (1, "Starboard")):
            add_box(f"Fin_{side}", (-half * 0.25, hw * 0.4 * sign, hh + 0.55), (1.4, 0.06, 0.45), armor, collection, 0.02)
    if spec.get("pods"):
        rows = spec["pods"]
        for sign, side in ((-1, "Port"), (1, "Starboard")):
            for row in range(rows):
                z = 0.35 + row * 1.15
                for col, x in enumerate((half * 0.12, -half * 0.18)):
                    add_box(f"Pod_{side}_{row}_{col}", (x, (hw + 0.55) * sign, z), (1.05, 0.62, 0.52), armor, collection, 0.025)
                    if lod == 0:
                        add_box(f"PodLock_{side}_{row}_{col}", (x + 0.95, (hw + 0.55) * sign, z), (0.06, 0.10, 0.10), mech, collection, 0.005)
                        add_box(f"PodMark_{side}_{row}_{col}", (x, (hw + 0.70) * sign, z), (0.16, 0.02, 0.14), warning, collection, 0.004)
    if spec.get("arms"):
        count = spec["arms"]
        for i in range(count):
            sign = -1 if i % 2 == 0 else 1
            row = i // 2
            add_cutter_arm(f"{i}", half * 0.35 - row * 1.6, hw * 0.75 * sign, 0.05, lod, mats, collection)
    if spec.get("hoppers"):
        add_box("Hopper_Bay", (half * 0.15, 0.0, hh * 0.15), (1.6, hw * 0.7, 0.35), mech, collection, 0.03)
    if spec.get("guns") in {"twin_front", "triple_front"}:
        add_box("Gun_Port", (half * 0.62, -0.35, 0.18), (0.85, 0.12, 0.10), mech, collection, 0.015)
        add_box("Gun_Starboard", (half * 0.62, 0.35, 0.18), (0.85, 0.12, 0.10), mech, collection, 0.015)
    if spec.get("guns") == "rear" or spec.get("guns") == "front_rear":
        add_box("Rear_Gun", (-half + 0.55, 0.0, 0.55), (0.32, 0.16, 0.14), mech, collection, 0.015)

    if lod <= 1:
        add_midship_kit(half, hw, hh, lod, mats, collection)
        cut_open_bay(
            hull_obj, "Port",
            (half * 0.08, -hw, hh * 0.08),
            half * 0.18, max(0.22, hh * 0.48), 0.46, (0.0, -1.0, 0.0),
            mats, collection, kit="radiator",
        )
        cut_open_bay(
            hull_obj, "Starboard",
            (half * 0.08, hw, hh * 0.08),
            half * 0.18, max(0.22, hh * 0.48), 0.46, (0.0, 1.0, 0.0),
            mats, collection, kit="rack",
        )
        cut_open_bay(
            hull_obj, "DorsalAft",
            (-half * 0.32, 0.0, hh),
            half * 0.16, hw * 0.28, 0.30, (0.0, 0.0, 1.0),
            mats, collection, kit="rack",
        )
        hull_obj.data.materials.clear()
        hull_obj.data.materials.append(hull)
        add_box("Armor_Belt_Port", (half * 0.36, -hw * 0.98, -hh * 0.15), (half * 0.22, 0.04, hh * 0.28), armor, collection, 0.01)
        add_box("Armor_Belt_Starboard", (half * 0.36, hw * 0.98, -hh * 0.15), (half * 0.22, 0.04, hh * 0.28), armor, collection, 0.01)
        add_box("Armor_Cheek_Port", (-half * 0.42, -hw * 0.90, hh * 0.05), (half * 0.16, 0.05, hh * 0.32), armor, collection, 0.01)
        add_box("Armor_Cheek_Starboard", (-half * 0.42, hw * 0.90, hh * 0.05), (half * 0.16, 0.05, hh * 0.32), armor, collection, 0.01)

    if lod == 0:
        add_box("Accent_Plate", (half * 0.05, -hw + 0.08, 0.35), (0.45, 0.02, 0.12), accent, collection, 0.006)
        for sign, side in ((-1, "Port"), (1, "Starboard")):
            add_rcs_cluster(side, (-1.2, (hw + 0.28) * sign, 0.15), mats, collection, sign=sign)
        add_sensor_dish("Dorsal", (half * 0.18, 0.0, hh + 0.72), mats, collection)
        add_service_hatch("Dorsal", (-half * 0.12, 0.0, hh + 0.12), mats, collection, sx=0.38, sy=0.28)
        add_service_hatch("PortShoulder", (half * 0.08, -hw * 0.82, hh * 0.35), mats, collection, sx=0.28, sy=0.18)
        add_radiator_cassette("DorsalWell", (-half * 0.38, 0.0, hh - 0.02), lod, mats, collection, length=min(1.6, half * 0.40), height=0.22)
        add_panel_seams("Hull", [half * t for t in (0.62, 0.28, -0.08, -0.42)], hw * 0.78, hh * 0.92, mech, collection)
        add_service_pipe("Pipe_Port_A", (half * 0.35, -hw * 0.88, -hh * 0.15), (-half * 0.35, -hw * 0.88, -hh * 0.05), mech, collection)
        add_service_pipe("Pipe_Stbd_A", (half * 0.35, hw * 0.88, -hh * 0.15), (-half * 0.35, hw * 0.88, -hh * 0.05), mech, collection)

    mesh_objects = [obj for obj in collection.objects if obj.type == "MESH"]
    for obj in mesh_objects:
        obj.parent = root
        bpy.context.view_layer.objects.active = obj
        obj.select_set(True)
        for mod in list(obj.modifiers):
            bpy.ops.object.modifier_apply(modifier=mod.name)
        try:
            bpy.ops.object.shade_smooth_by_angle(angle=math.radians(28))
        except Exception:
            for poly in obj.data.polygons:
                poly.use_smooth = True
        bpy.ops.object.mode_set(mode="EDIT")
        bpy.ops.mesh.select_all(action="SELECT")
        bpy.ops.uv.smart_project(angle_limit=66.0, island_margin=0.02, scale_to_bounds=True)
        bpy.ops.object.mode_set(mode="OBJECT")
        obj.select_set(False)

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
        active.name = f"LOD{lod}_{material_name.replace('Material_', '')}"
        active.parent = root
        tri = active.modifiers.new("ExportTriangulate", "TRIANGULATE")
        tri.quad_method = "BEAUTY"
        bpy.ops.object.modifier_apply(modifier=tri.name)
        merged.append(active)

    for name, loc in sockets_for(spec).items():
        add_empty(name, loc, collection, root)

    bm = bmesh.new()
    for point in [
        (half - 0.3, 0, 0.1), (0, -hw - 0.2, hh), (0, hw + 0.2, hh),
        (-half + 0.4, -hw * 0.6, 0.2), (-half + 0.4, hw * 0.6, 0.2),
        (half * 0.3, -hw * 0.5, -hh), (half * 0.3, hw * 0.5, -hh),
    ]:
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
    hull_tris = next((sum(max(0, len(p.vertices) - 2) for p in obj.data.polygons) for obj in merged if "Hull" in obj.name), 0)
    return collection, {
        "lod": lod,
        "triangles": sum(sum(max(0, len(p.vertices) - 2) for p in obj.data.polygons) for obj in merged),
        "hullTriangles": hull_tris,
        "draws": len(merged),
        "materials": sorted(groups),
        "sockets": sorted(sockets_for(spec)),
    }


class TangentValidationError(RuntimeError):
    pass


def _read_glb_layout(stream, path: Path):
    header = stream.read(12)
    if len(header) != 12:
        raise TangentValidationError(f"{path} has a truncated GLB header")
    magic, version, declared_length = struct.unpack("<4sII", header)
    if magic != b"glTF" or version != 2:
        raise TangentValidationError(f"{path} is not GLB 2.0")
    if declared_length != path.stat().st_size:
        raise TangentValidationError(f"{path} GLB length does not match the file size")

    gltf = None
    binary_offset = None
    binary_length = None
    cursor = 12
    while cursor < declared_length:
        stream.seek(cursor)
        chunk_header = stream.read(8)
        if len(chunk_header) != 8:
            raise TangentValidationError(f"{path} has a truncated GLB chunk header")
        chunk_length, chunk_type = struct.unpack("<II", chunk_header)
        chunk_start = cursor + 8
        chunk_end = chunk_start + chunk_length
        if chunk_length % 4 or chunk_end > declared_length:
            raise TangentValidationError(f"{path} has an invalid GLB chunk range")
        if chunk_type == 0x4E4F534A:
            if gltf is not None:
                raise TangentValidationError(f"{path} contains multiple JSON chunks")
            payload = stream.read(chunk_length).rstrip(b" \t\r\n\x00")
            try:
                gltf = json.loads(payload.decode("utf-8"))
            except (UnicodeDecodeError, json.JSONDecodeError) as error:
                raise TangentValidationError(f"{path} contains invalid glTF JSON") from error
        elif chunk_type == 0x004E4942:
            if binary_offset is not None:
                raise TangentValidationError(f"{path} contains multiple BIN chunks")
            binary_offset = chunk_start
            binary_length = chunk_length
        cursor = chunk_end

    if gltf is None or binary_offset is None or binary_length is None:
        raise TangentValidationError(f"{path} must contain one JSON chunk and one BIN chunk")
    if not isinstance(gltf, dict):
        raise TangentValidationError(f"{path} glTF JSON root must be an object")
    return gltf, binary_offset, binary_length


def _nonnegative_int(value, default=None):
    if value is None:
        value = default
    if isinstance(value, bool) or not isinstance(value, int) or value < 0:
        return None
    return value


def validate_glb_tangents(path: Path) -> int:
    """Reject malformed, zero-length, or non-unit exported tangent vectors."""
    try:
        stream = path.open("rb")
    except OSError as error:
        raise TangentValidationError(f"cannot read exported GLB {path}") from error

    with stream:
        gltf, binary_offset, binary_length = _read_glb_layout(stream, path)
        accessors = gltf.get("accessors")
        views = gltf.get("bufferViews")
        buffers = gltf.get("buffers")
        meshes = gltf.get("meshes")
        if not all(isinstance(rows, list) for rows in (accessors, views, buffers, meshes)):
            raise TangentValidationError(f"{path} is missing glTF mesh/accessor storage")
        if not buffers or not isinstance(buffers[0], dict) or "uri" in buffers[0]:
            raise TangentValidationError(f"{path} must use embedded GLB buffer 0")
        buffer_length = _nonnegative_int(buffers[0].get("byteLength"))
        if buffer_length is None or buffer_length > binary_length or binary_length - buffer_length > 3:
            raise TangentValidationError(f"{path} embedded buffer length does not match its BIN chunk")

        tangent_accessors = set()
        for mesh_index, mesh in enumerate(meshes):
            if not isinstance(mesh, dict) or not isinstance(mesh.get("primitives"), list):
                raise TangentValidationError(f"{path} mesh {mesh_index} is malformed")
            for primitive_index, primitive in enumerate(mesh["primitives"]):
                attributes = primitive.get("attributes") if isinstance(primitive, dict) else None
                if not isinstance(attributes, dict):
                    raise TangentValidationError(
                        f"{path} mesh {mesh_index} primitive {primitive_index} has malformed attributes"
                    )
                tangent_index = attributes.get("TANGENT")
                if "TEXCOORD_0" in attributes and "NORMAL" in attributes and primitive.get("material") is not None:
                    if _nonnegative_int(tangent_index) is None:
                        raise TangentValidationError(
                            f"{path} mesh {mesh_index} primitive {primitive_index} is missing TANGENT"
                        )
                if tangent_index is not None:
                    if _nonnegative_int(tangent_index) is None:
                        raise TangentValidationError(
                            f"{path} mesh {mesh_index} primitive {primitive_index} has invalid TANGENT"
                        )
                    tangent_accessors.add(tangent_index)
        if not tangent_accessors:
            raise TangentValidationError(f"{path} contains no TANGENT accessors")

        tangent_count = 0
        for accessor_index in sorted(tangent_accessors):
            if accessor_index >= len(accessors) or not isinstance(accessors[accessor_index], dict):
                raise TangentValidationError(f"{path} TANGENT accessor {accessor_index} is missing")
            accessor = accessors[accessor_index]
            if "sparse" in accessor:
                raise TangentValidationError(
                    f"{path} TANGENT accessor {accessor_index} contains unsupported sparse storage"
                )
            normalized = accessor.get("normalized", False)
            if (
                accessor.get("componentType") != 5126
                or accessor.get("type") != "VEC4"
                or not isinstance(normalized, bool)
                or normalized
            ):
                raise TangentValidationError(
                    f"{path} TANGENT accessor {accessor_index} must be unnormalized dense float32 VEC4"
                )
            count = _nonnegative_int(accessor.get("count"))
            view_index = _nonnegative_int(accessor.get("bufferView"))
            if not count or view_index is None or view_index >= len(views):
                raise TangentValidationError(f"{path} TANGENT accessor {accessor_index} has invalid storage")
            view = views[view_index]
            if not isinstance(view, dict) or view.get("buffer") != 0:
                raise TangentValidationError(
                    f"{path} TANGENT accessor {accessor_index} must use embedded buffer 0"
                )
            view_offset = _nonnegative_int(view.get("byteOffset"), 0)
            accessor_offset = _nonnegative_int(accessor.get("byteOffset"), 0)
            view_length = _nonnegative_int(view.get("byteLength"))
            stride = _nonnegative_int(view.get("byteStride"), 16)
            if (
                view_offset is None
                or accessor_offset is None
                or not view_length
                or stride is None
                or stride < 16
                or stride > 252
                or stride % 4
                or view_offset % 4
                or accessor_offset % 4
            ):
                raise TangentValidationError(f"{path} TANGENT accessor {accessor_index} has invalid layout")
            required = accessor_offset + stride * (count - 1) + 16
            view_end = view_offset + view_length
            if required > view_length or view_end > buffer_length or view_end > binary_length:
                raise TangentValidationError(f"{path} TANGENT accessor {accessor_index} is out of range")

            element_start = binary_offset + view_offset + accessor_offset
            for element_index in range(count):
                stream.seek(element_start + element_index * stride)
                packed = stream.read(16)
                if len(packed) != 16:
                    raise TangentValidationError(
                        f"{path} TANGENT accessor {accessor_index} is truncated"
                    )
                x, y, z, handedness = struct.unpack("<4f", packed)
                length = math.sqrt(x * x + y * y + z * z)
                if not math.isfinite(length) or length < 1e-6:
                    raise TangentValidationError(
                        f"{path} TANGENT accessor {accessor_index} element {element_index} is zero or non-finite"
                    )
                if abs(length - 1.0) > 1e-4:
                    raise TangentValidationError(
                        f"{path} TANGENT accessor {accessor_index} element {element_index} is non-unit ({length:.8g})"
                    )
                if not math.isfinite(handedness) or abs(abs(handedness) - 1.0) > 1e-4:
                    raise TangentValidationError(
                        f"{path} TANGENT accessor {accessor_index} element {element_index} has invalid handedness"
                    )
                tangent_count += 1
    return tangent_count


def export_lod(collection, out_dir: Path, ship_id: str, lod: int) -> Path:
    out = out_dir / "source" / "wholeships" / f"{ship_id}_production_v1_lod{lod}.glb"
    out.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.object.select_all(action="DESELECT")
    for obj in collection.all_objects:
        obj.hide_viewport = False
        obj.hide_set(False)
        obj.select_set(True)
    tmp = out.with_suffix(".tmp.glb")
    last_error = None
    for attempt in range(6):
        try:
            tmp.unlink(missing_ok=True)
            bpy.ops.export_scene.gltf(
                filepath=str(tmp), export_format="GLB", use_selection=True, export_apply=True,
                export_yup=True, export_extras=True, export_animations=False,
                export_materials="EXPORT", export_texcoords=True, export_normals=True,
                export_tangents=True, export_image_format="NONE",
            )
            if not tmp.is_file():
                raise RuntimeError(f"exporter did not create {tmp}")
            validate_glb_tangents(tmp)
            tmp.replace(out)
            return out
        except TangentValidationError:
            tmp.unlink(missing_ok=True)
            raise
        except Exception as error:
            last_error = error
            if attempt < 5:
                time.sleep(0.4 * (attempt + 1))
    tmp.unlink(missing_ok=True)
    raise RuntimeError(f"failed to export {out} after 6 attempts") from last_error


def look_at(obj, target=(0, 0, 0)):
    obj.rotation_euler = (Vector(target) - obj.location).to_track_quat("-Z", "Y").to_euler()


def render_evidence(collection, out_dir: Path, ship_id: str, spec):
    for other in bpy.data.collections:
        other.hide_render = other is not collection
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 1280
    scene.render.resolution_y = 720
    scene.render.image_settings.file_format = "PNG"
    scene.view_settings.look = "AgX - Medium High Contrast"
    scene.view_settings.exposure = 1.05
    world = scene.world
    world.use_nodes = True
    bg = world.node_tree.nodes.get("Background")
    bg.inputs["Color"].default_value = (0.012, 0.014, 0.018, 1)
    bg.inputs["Strength"].default_value = 0.42
    cam_data = bpy.data.cameras.new("EvidenceCamera")
    camera = bpy.data.objects.new("EvidenceCamera", cam_data)
    scene.collection.objects.link(camera)
    scene.camera = camera
    for name, loc, energy, color, size in (
        ("Key", (14, -16, 11), 7200, (0.88, 0.92, 1), 10),
        ("Fill", (5, 14, 8), 3600, (0.55, 0.62, 0.72), 8),
        ("Rim", (-12, -6, 6), 4200, (1.0, 0.62, 0.28), 7),
    ):
        data = bpy.data.lights.new(name, "AREA")
        data.energy = energy
        data.color = color
        data.size = size
        obj = bpy.data.objects.new(name, data)
        scene.collection.objects.link(obj)
        obj.location = loc
        look_at(obj)
    evidence = out_dir / "evidence" / "iter09"
    evidence.mkdir(parents=True, exist_ok=True)
    half = spec["length"] * 0.45
    views = [
        (f"{ship_id}_three_quarter", (half + 6.5, -half - 5.5, 4.8), (0, 0, 0.15), 46),
        (f"{ship_id}_starboard", (half + 3.5, half + 5.5, 3.8), (0, 0.2, 0.15), 46),
        (f"{ship_id}_rear", (-half - 6.5, -3.5, 3.2), (-0.6, 0, 0.1), 48),
        (f"{ship_id}_grazing", (2.2, -half - 3.8, 0.9), (0, 0, 0.15), 42),
    ]
    receipts = []
    for name, loc, target, lens in views:
        camera.location = loc
        camera.data.lens = lens
        look_at(camera, target)
        path = evidence / f"{name}.png"
        scene.render.filepath = str(path)
        bpy.ops.render.render(write_still=True)
        receipts.append({"view": name, "path": str(path.relative_to(out_dir)).replace("\\", "/"), "bytes": path.stat().st_size})
    return receipts


def build_one(ship_id: str, spec: dict, texture_dir: Path) -> dict:
    out_dir = FAMILY / ship_id
    reset_scene()
    mats = create_materials(texture_dir, spec["hullTint"])
    collections, reports = [], []
    for lod in (0, 1, 2):
        collection, report = build_ship(ship_id, spec, lod, mats)
        output = export_lod(collection, out_dir, ship_id, lod)
        report.update({"path": str(output.relative_to(out_dir)).replace("\\", "/"), "bytes": output.stat().st_size, "sha256": sha256(output)})
        collections.append(collection)
        reports.append(report)
    renders = [] if parse_skip_renders() else render_evidence(collections[0], out_dir, ship_id, spec)
    report = {
        "schema": "spaceface.fleetPlayerBody.build.v1",
        "assetId": spec["assetId"],
        "defId": spec["defId"],
        "shipId": ship_id,
        "iteration": 9,
        "lods": reports,
        "renders": renders,
    }
    (out_dir / "evidence").mkdir(parents=True, exist_ok=True)
    report_path = out_dir / "evidence" / "build_report.json"
    with report_path.open("w", encoding="utf-8", newline="\n") as stream:
        json.dump(report, stream, indent=2)
        stream.write("\n")
    if any(entry["hullTriangles"] < 800 for entry in reports):
        raise RuntimeError(f"{ship_id} hull below 800 tris")
    return report


def load_summary_records(path: Path) -> dict[str, dict]:
    """Load only identity-coherent records so partial builds cannot erase the family."""
    if not path.exists():
        return {}
    try:
        rows = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise RuntimeError(f"cannot preserve existing fleet summary at {path}") from error
    if not isinstance(rows, list):
        raise RuntimeError(f"fleet summary at {path} must contain a list")

    records = {}
    for index, row in enumerate(rows):
        if not isinstance(row, dict):
            raise RuntimeError(f"fleet summary record {index} is not an object")
        ship_id = row.get("shipId")
        if not isinstance(ship_id, str) or ship_id not in SPECS:
            raise RuntimeError(f"fleet summary record {index} has an unknown shipId {ship_id!r}")
        spec = SPECS[ship_id]
        if (
            row.get("schema") != "spaceface.fleetPlayerBody.build.v1"
            or row.get("assetId") != spec["assetId"]
            or row.get("defId") != spec["defId"]
        ):
            raise RuntimeError(f"fleet summary record {index} does not match {ship_id!r}")
        if ship_id in records:
            raise RuntimeError(f"fleet summary contains duplicate record for {ship_id!r}")
        records[ship_id] = row
    return records


def merge_summary_records(existing: dict[str, dict], refreshed: dict[str, dict]) -> list[dict]:
    merged = dict(existing)
    merged.update(refreshed)
    return [merged[ship_id] for ship_id in SPECS if ship_id in merged]


@contextmanager
def summary_publication_lock(summary_path: Path, timeout_seconds=30.0):
    lock_root = Path(tempfile.gettempdir()) / "spaceface-fleet-summary-locks"
    lock_root.mkdir(parents=True, exist_ok=True)
    lock_key = hashlib.sha256(str(summary_path.resolve()).casefold().encode("utf-8")).hexdigest()
    lock_path = lock_root / f"{lock_key}.lock"
    stream = lock_path.open("a+b")
    acquired = False
    try:
        stream.seek(0, os.SEEK_END)
        if stream.tell() == 0:
            stream.write(b"\0")
            stream.flush()
        deadline = time.monotonic() + timeout_seconds
        while True:
            try:
                stream.seek(0)
                if os.name == "nt":
                    import msvcrt

                    msvcrt.locking(stream.fileno(), msvcrt.LK_NBLCK, 1)
                else:
                    import fcntl

                    fcntl.flock(stream.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
                acquired = True
                break
            except OSError as error:
                if time.monotonic() >= deadline:
                    raise TimeoutError(f"timed out locking fleet summary {summary_path}") from error
                time.sleep(0.05)
        yield
    finally:
        if acquired:
            stream.seek(0)
            if os.name == "nt":
                import msvcrt

                msvcrt.locking(stream.fileno(), msvcrt.LK_UNLCK, 1)
            else:
                import fcntl

                fcntl.flock(stream.fileno(), fcntl.LOCK_UN)
        stream.close()


def atomic_write_summary(path: Path, rows: list[dict]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    handle, temp_name = tempfile.mkstemp(prefix=f".{path.name}.", suffix=".tmp", dir=path.parent)
    temp_path = Path(temp_name)
    try:
        with os.fdopen(handle, "w", encoding="utf-8", newline="\n") as stream:
            json.dump(rows, stream, indent=2)
            stream.write("\n")
            stream.flush()
            os.fsync(stream.fileno())
        temp_path.replace(path)
    finally:
        temp_path.unlink(missing_ok=True)


def publish_summary_records(path: Path, refreshed: dict[str, dict]) -> list[dict]:
    with summary_publication_lock(path):
        existing = load_summary_records(path)
        rows = merge_summary_records(existing, refreshed)
        atomic_write_summary(path, rows)
    return rows


def main() -> int:
    try:
        wanted = parse_only()
    except ValueError as error:
        raise SystemExit(f"[fleet] {error}") from error
    FAMILY.mkdir(parents=True, exist_ok=True)
    texture_dir = FAMILY / "textures"
    texture_dir.mkdir(parents=True, exist_ok=True)
    for prefix in TEXTURE_SETS.values():
        for suffix in ("basecolor.png", "normal.png", "orm.png"):
            src = TEXTURE_SRC / f"{prefix}_{suffix}"
            dest = texture_dir / f"{prefix}_{suffix}"
            if src.exists() and not dest.exists():
                shutil.copy2(src, dest)
    refreshed = {}
    for ship_id in wanted:
        print(f"[fleet] building {ship_id}")
        refreshed[ship_id] = build_one(ship_id, SPECS[ship_id], texture_dir)
    summaries = publish_summary_records(FAMILY / "build_summary.json", refreshed)
    print(json.dumps({"ok": True, "ships": [row["shipId"] for row in summaries]}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

"""Author, export, and render the isolated SpaceFace Pelican production candidate.

Manufactured prospector body. Uses in-repo Wasp/Hitch PBR sheets as first-party
material treatment only — no Hitch or Wasp geometry is copied.

Run:
  blender --background --python build_pelican_v1.py
"""
from __future__ import annotations

import hashlib
import json
import math
import shutil
import sys
from pathlib import Path

import bpy
import bmesh
from mathutils import Vector


FAMILY = Path(__file__).resolve().parents[1]
ROOT = FAMILY.parents[2]
TEXTURE_SRC = ROOT / "assets" / "ships" / "wasp_production_v1" / "textures"
PACKET = "SF-PELICAN-PRODUCTION-V1-001"
ASSET_ID = "SF_PELICAN_PRODUCTION_V1"
REQUIRED_SOCKETS = {
    "SOCKET_Weapon_Front": (6.4, 0.0, 0.35),
    "SOCKET_Mining_Front": (7.6, 0.0, -0.15),
    "SOCKET_Engine_Main": (-6.4, 0.0, 0.05),
    "SOCKET_Trail_Main": (-6.8, 0.0, 0.05),
    "SOCKET_Trail_Port": (-6.55, -1.35, 0.08),
    "SOCKET_Trail_Starboard": (-6.55, 1.35, 0.08),
    "SOCKET_Utility_Dorsal": (1.1, 0.0, 2.05),
    "SOCKET_Cargo_Ventral": (-0.8, 0.0, -1.35),
    "SOCKET_Camera_Focus": (1.4, 0.0, 0.35),
    "SOCKET_RCS_Port": (-1.6, -2.55, 0.15),
    "SOCKET_RCS_Starboard": (-1.6, 2.55, 0.15),
}
TEXTURE_SETS = {
    "Material_Hull": "hull",
    "Material_Armor": "armor_dark",
    "Material_Mechanical": "mechanical",
    "Material_Accent": "frontier_cyan",
    "Material_Warning": "warning_orange",
}


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest().upper()


def reset_scene() -> None:
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for bucket in (bpy.data.meshes, bpy.data.curves, bpy.data.materials, bpy.data.cameras, bpy.data.lights):
        for item in list(bucket):
            bucket.remove(item)
    for collection in list(bpy.data.collections):
        bpy.data.collections.remove(collection)


def principled(material: bpy.types.Material):
    material.use_nodes = True
    material.node_tree.nodes.clear()
    output = material.node_tree.nodes.new("ShaderNodeOutputMaterial")
    bsdf = material.node_tree.nodes.new("ShaderNodeBsdfPrincipled")
    material.node_tree.links.new(bsdf.outputs["BSDF"], output.inputs["Surface"])
    return bsdf


def make_pbr_material(name: str, prefix: str, texture_dir: Path, tint, metallic: float, roughness: float) -> bpy.types.Material:
    material = bpy.data.materials.new(name)
    bsdf = principled(material)
    bsdf.inputs["Base Color"].default_value = tint
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Metallic"].default_value = metallic
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    texcoord = nodes.new("ShaderNodeTexCoord")
    mapping = nodes.new("ShaderNodeMapping")
    links.new(texcoord.outputs["UV"], mapping.inputs["Vector"])
    mapping.inputs["Scale"].default_value = (1.35, 1.35, 1.35)
    base = nodes.new("ShaderNodeTexImage")
    base.image = bpy.data.images.load(str(texture_dir / f"{prefix}_basecolor.png"), check_existing=True)
    base.image.pack()
    base.image.colorspace_settings.name = "sRGB"
    links.new(mapping.outputs["Vector"], base.inputs["Vector"])
    mix = nodes.new("ShaderNodeMixRGB")
    mix.blend_type = "MIX"
    mix.inputs[0].default_value = 0.62
    mix.inputs[2].default_value = tint
    links.new(base.outputs["Color"], mix.inputs[1])
    links.new(mix.outputs["Color"], bsdf.inputs["Base Color"])
    normal = nodes.new("ShaderNodeTexImage")
    normal.image = bpy.data.images.load(str(texture_dir / f"{prefix}_normal.png"), check_existing=True)
    normal.image.pack()
    normal.image.colorspace_settings.name = "Non-Color"
    links.new(mapping.outputs["Vector"], normal.inputs["Vector"])
    normal_map = nodes.new("ShaderNodeNormalMap")
    normal_map.inputs["Strength"].default_value = 0.22
    links.new(normal.outputs["Color"], normal_map.inputs["Color"])
    links.new(normal_map.outputs["Normal"], bsdf.inputs["Normal"])
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


def create_materials(texture_dir: Path) -> dict[str, bpy.types.Material]:
    mats = {
        "Material_Hull": make_pbr_material(
            "Material_Hull", "hull", texture_dir, (0.28, 0.13, 0.07, 1.0), 0.18, 0.50),
        "Material_Armor": make_pbr_material(
            "Material_Armor", "armor_dark", texture_dir, (0.12, 0.13, 0.145, 1.0), 0.28, 0.44),
        "Material_Mechanical": make_pbr_material(
            "Material_Mechanical", "mechanical", texture_dir, (0.32, 0.33, 0.34, 1.0), 0.78, 0.30),
        "Material_Accent": make_pbr_material(
            "Material_Accent", "frontier_cyan", texture_dir, (0.06, 0.62, 0.78, 1.0), 0.18, 0.40),
        "Material_Warning": make_pbr_material(
            "Material_Warning", "warning_orange", texture_dir, (0.78, 0.42, 0.08, 1.0), 0.08, 0.46),
    }
    canopy = bpy.data.materials.new("Material_Canopy")
    bsdf = principled(canopy)
    bsdf.inputs["Base Color"].default_value = (0.008, 0.018, 0.028, 1)
    bsdf.inputs["Metallic"].default_value = 0.12
    bsdf.inputs["Roughness"].default_value = 0.14
    bsdf.inputs["Coat Weight"].default_value = 0.78
    bsdf.inputs["Coat Roughness"].default_value = 0.07
    bsdf.inputs["Transmission Weight"].default_value = 0.55
    canopy["spacefaceRole"] = "glass"
    mats[canopy.name] = canopy

    thruster = bpy.data.materials.new("Material_Thruster")
    bsdf = principled(thruster)
    bsdf.inputs["Base Color"].default_value = (0.02, 0.10, 0.14, 1)
    bsdf.inputs["Emission Color"].default_value = (0.18, 0.55, 0.72, 1)
    bsdf.inputs["Emission Strength"].default_value = 1.35
    bsdf.inputs["Roughness"].default_value = 0.22
    bsdf.inputs["Metallic"].default_value = 0.12
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
    bsdf.inputs["Base Color"].default_value = (0.07, 0.075, 0.08, 1)
    bsdf.inputs["Metallic"].default_value = 0.74
    bsdf.inputs["Roughness"].default_value = 0.46
    bsdf.inputs["Anisotropic"].default_value = 0.55
    radiator["spacefaceRole"] = "radiator"
    mats[radiator.name] = radiator
    return mats


def link_object(obj: bpy.types.Object, collection: bpy.types.Collection) -> bpy.types.Object:
    for current in list(obj.users_collection):
        current.objects.unlink(obj)
    collection.objects.link(obj)
    return obj


def finish_mesh(obj: bpy.types.Object, material: bpy.types.Material, bevel: float = 0.04) -> bpy.types.Object:
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


def add_cylinder(name, loc, radius, depth, material, collection, vertices=24, bevel=0.03, rot=(0, math.pi / 2, 0)):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=loc, rotation=rot)
    obj = link_object(bpy.context.object, collection)
    obj.name = name
    return finish_mesh(obj, material, bevel)


def chamfer_ring(x, yc, zc, hw, hh, chamfer):
    c = min(chamfer, hw * 0.45, hh * 0.45)
    return [
        (x, yc + hw - c, zc + hh),
        (x, yc + hw, zc + hh - c),
        (x, yc + hw, zc - hh + c),
        (x, yc + hw - c, zc - hh),
        (x, yc - hw + c, zc - hh),
        (x, yc - hw, zc - hh + c),
        (x, yc - hw, zc + hh - c),
        (x, yc - hw + c, zc + hh),
    ]


def add_chamfer_loft(name, stations, material, collection, bevel=0.04):
    """stations: (x, y_center, z_center, half_width, half_height, chamfer)."""
    rings = [chamfer_ring(*station) for station in stations]
    sides = 8
    verts = [vert for ring in rings for vert in ring]
    faces = [tuple(range(sides - 1, -1, -1))]
    offset = (len(rings) - 1) * sides
    faces.append(tuple(offset + i for i in range(sides)))
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


def add_loft(name, stations, material, collection, sides=12, bevel=0.05):
    verts = []
    for x, y_center, z_center, y_radius, z_radius in stations:
        for index in range(sides):
            angle = math.tau * index / sides
            verts.append((
                x,
                y_center + math.cos(angle) * y_radius,
                z_center + math.sin(angle) * z_radius,
            ))
    faces = [tuple(range(sides - 1, -1, -1))]
    offset = (len(stations) - 1) * sides
    faces.append(tuple(offset + i for i in range(sides)))
    for station in range(len(stations) - 1):
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


def add_extruded_polygon(name, points, z0, z1, material, collection, bevel=0.04):
    n = len(points)
    verts = [(x, y, z0) for x, y in points] + [(x, y, z1) for x, y in points]
    faces = [tuple(range(n - 1, -1, -1)), tuple(range(n, 2 * n))]
    for i in range(n):
        j = (i + 1) % n
        faces.append((i, j, n + j, n + i))
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
    obj.empty_display_size = 0.22
    obj.location = loc
    if parent:
        obj.parent = parent
    obj["socket"] = True
    return obj


def add_drive(side_name: str, y: float, lod: int, mats, collection) -> None:
    mech = mats["Material_Mechanical"]
    armor = mats["Material_Armor"]
    ceramic = mats["Material_Ceramic"]
    thruster = mats["Material_Thruster"]
    add_box(f"Drive_Bulkhead_{side_name}", (-5.42, y, 0.08), (0.12, 0.78, 0.78), armor, collection, 0.02)
    add_cylinder(f"Drive_Casing_{side_name}", (-5.95, y, 0.08), 0.46, 0.88, mech, collection, vertices=20, bevel=0.02)
    add_cylinder(f"Drive_ServiceBand_{side_name}", (-5.95, y, 0.08), 0.48, 0.08, armor, collection, vertices=20, bevel=0.01)
    add_cylinder(f"Drive_Collar_{side_name}", (-6.42, y, 0.08), 0.38, 0.14, ceramic, collection, vertices=16, bevel=0.012)
    add_cylinder(f"Drive_ThroatRing_{side_name}", (-6.55, y, 0.08), 0.26, 0.08, mech, collection, vertices=16, bevel=0.008)
    add_cylinder(f"Drive_Throat_{side_name}", (-6.62, y, 0.08), 0.17, 0.07, thruster, collection, vertices=16, bevel=0.006)
    if lod <= 1:
        for index in range(6):
            angle = math.tau * index / 6
            add_box(
                f"Drive_Clamp_{side_name}_{index}",
                (-6.42, y + math.cos(angle) * 0.40, 0.08 + math.sin(angle) * 0.40),
                (0.07, 0.05, 0.04),
                mech,
                collection,
                0.008,
                (angle, 0, 0),
            )
    if lod == 0:
        for index in range(16):
            angle = math.tau * index / 16
            add_box(
                f"Drive_Vane_{side_name}_{index}",
                (-6.68, y + math.cos(angle) * 0.21, 0.08 + math.sin(angle) * 0.21),
                (0.055, 0.008, 0.055),
                armor,
                collection,
                0.003,
                (angle, 0, 0),
            )


def add_mining_arm(side_name: str, sign: float, lod: int, mats, collection) -> None:
    mech = mats["Material_Mechanical"]
    hull = mats["Material_Hull"]
    armor = mats["Material_Armor"]
    warning = mats["Material_Warning"]
    y = 1.62 * sign
    add_chamfer_loft(f"Arm_Saddle_{side_name}", [
        (4.15, y, 0.02, 0.34, 0.28, 0.06),
        (4.70, y, -0.02, 0.30, 0.26, 0.05),
        (5.05, y, -0.08, 0.22, 0.20, 0.04),
    ], hull, collection, 0.02)
    add_chamfer_loft(f"Arm_Boom_{side_name}", [
        (5.05, y, -0.10, 0.16, 0.16, 0.03),
        (5.85, y, -0.18, 0.14, 0.14, 0.03),
        (6.70, y, -0.28, 0.13, 0.13, 0.03),
    ], mech, collection, 0.02)
    add_cylinder(f"Arm_Cylinder_{side_name}", (5.70, y + 0.20 * sign, 0.10), 0.055, 0.85, mech, collection, vertices=12, bevel=0.008, rot=(0, 1.12, 0.10 * sign))
    add_cylinder(f"Arm_Rod_{side_name}", (6.35, y + 0.16 * sign, -0.02), 0.028, 0.55, armor, collection, vertices=10, bevel=0.004, rot=(0, 1.12, 0.10 * sign))
    add_box(f"Arm_Knuckle_{side_name}", (7.00, y, -0.36), (0.22, 0.20, 0.20), mech, collection, 0.018)
    add_cylinder(f"Arm_Cutter_{side_name}", (7.52, y, -0.42), 0.30, 0.28, armor, collection, vertices=18, bevel=0.015, rot=(math.pi / 2, 0, 0))
    add_cylinder(f"Arm_CutterHub_{side_name}", (7.52, y, -0.42), 0.10, 0.32, mech, collection, vertices=12, bevel=0.008, rot=(math.pi / 2, 0, 0))
    if lod == 0:
        add_box(f"Arm_Flange_{side_name}", (5.08, y, -0.10), (0.04, 0.20, 0.20), mech, collection, 0.008)
        add_box(f"Arm_Warning_{side_name}", (6.05, y, 0.02), (0.14, 0.14, 0.025), warning, collection, 0.006)
        for tooth in range(10):
            angle = math.tau * tooth / 10
            add_box(
                f"Arm_Tooth_{side_name}_{tooth}",
                (7.52, y + math.cos(angle) * 0.32, -0.42 + math.sin(angle) * 0.32),
                (0.045, 0.03, 0.07),
                armor,
                collection,
                0.004,
                (angle, 0, 0),
            )


def add_filter_drums(lod: int, mats, collection) -> None:
    mech = mats["Material_Mechanical"]
    armor = mats["Material_Armor"]
    warning = mats["Material_Warning"]
    hull = mats["Material_Hull"]
    for index, (x, z) in enumerate(((0.55, -0.05), (0.55, -0.92))):
        add_cylinder(f"Filter_Drum_{index}", (x, 2.48, z), 0.36, 1.25, armor, collection, vertices=16, bevel=0.025)
        add_cylinder(f"Filter_Cap_Fore_{index}", (x + 0.60, 2.48, z), 0.37, 0.06, mech, collection, vertices=16, bevel=0.008)
        add_cylinder(f"Filter_Cap_Aft_{index}", (x - 0.60, 2.48, z), 0.37, 0.06, mech, collection, vertices=16, bevel=0.008)
        add_cylinder(f"Filter_Band_{index}", (x, 2.48, z), 0.39, 0.07, mech, collection, vertices=16, bevel=0.01)
        add_box(f"Filter_Saddle_{index}", (x, 2.12, z), (0.45, 0.10, 0.22), hull, collection, 0.015)
        if lod == 0:
            add_box(f"Filter_Latch_{index}", (x, 2.84, z + 0.10), (0.10, 0.05, 0.08), mech, collection, 0.006)
            add_box(f"Filter_Tag_{index}", (x - 0.18, 2.82, z), (0.12, 0.02, 0.08), warning, collection, 0.004)


def build_ship(lod: int, mats: dict[str, bpy.types.Material]):
    collection = bpy.data.collections.new(f"PELICAN_PRODUCTION_V1_LOD{lod}")
    bpy.context.scene.collection.children.link(collection)
    hull = mats["Material_Hull"]
    armor = mats["Material_Armor"]
    mech = mats["Material_Mechanical"]
    accent = mats["Material_Accent"]
    warning = mats["Material_Warning"]
    canopy = mats["Material_Canopy"]
    radiator = mats["Material_Radiator"]

    root = add_empty(f"PELICAN_PRODUCTION_V1_LOD{lod}_ROOT", (0, 0, 0), collection)
    root["spacefaceAsset"] = {
        "assetId": ASSET_ID, "partId": "pelican_production_v1", "packet": PACKET,
        "lod": f"lod{lod}", "slot": "hull", "category": "wholeships",
        "forward": "+X", "up": "+Y", "starboard": "+Z", "unit": "metre",
        "normalConvention": "OpenGL", "ormChannels": "R=AO,G=Roughness,B=Metallic",
        "embeddedPlume": False, "wiringStatus": "isolated_candidate",
    }

    add_chamfer_loft("Pressure_Hull", [
        (6.15, 0, 0.06, 0.38, 0.34, 0.08),
        (5.10, 0, 0.08, 0.95, 0.72, 0.16),
        (3.60, 0, 0.10, 1.45, 1.00, 0.22),
        (1.80, 0, 0.10, 1.95, 1.18, 0.26),
        (0.00, 0, 0.08, 2.08, 1.22, 0.28),
        (-1.80, 0, 0.06, 2.05, 1.20, 0.26),
        (-3.60, 0, 0.04, 1.75, 1.05, 0.22),
        (-5.10, 0, 0.04, 1.25, 0.82, 0.16),
        (-6.15, 0, 0.06, 0.82, 0.58, 0.10),
    ], hull, collection, 0.05)
    for index, x in enumerate((4.4, 2.6, 0.6, -1.4, -3.4)):
        add_box(f"Hull_Course_{index}", (x, 0.0, 0.08), (0.035, 1.85 - abs(x) * 0.08, 1.05), hull, collection, 0.01)
    add_box("Hull_Chine_Port", (0.2, -1.95, 0.05), (4.6, 0.05, 0.55), hull, collection, 0.015)
    add_box("Hull_Chine_Starboard", (0.2, 1.95, 0.05), (4.6, 0.05, 0.55), hull, collection, 0.015)
    add_box("Hull_Belly_Plate", (0.4, 0.0, -1.18), (3.8, 1.15, 0.05), hull, collection, 0.015)

    add_extruded_polygon("Dorsal_Armor", [
        (4.6, 0), (2.4, -1.15), (-2.8, -1.35), (-5.2, -0.7), (-5.6, 0),
        (-5.2, 0.7), (-2.8, 1.35), (2.4, 1.15),
    ], 1.05, 1.42, armor, collection, 0.06)
    add_extruded_polygon("Ventral_Keel", [
        (4.2, 0), (1.2, -0.85), (-4.4, -0.7), (-5.6, 0), (-4.4, 0.7), (1.2, 0.85),
    ], -1.42, -0.95, mech, collection, 0.05)
    add_box("Chin_Scoop", (5.35, 0, -0.55), (0.85, 0.55, 0.28), armor, collection, 0.04)
    add_box("Bow_Cap", (6.05, 0, 0.08), (0.28, 0.55, 0.48), armor, collection, 0.03)

    add_chamfer_loft("Canopy_Glass", [
        (3.80, 0, 1.32, 0.28, 0.10, 0.04),
        (3.00, 0, 1.58, 0.62, 0.26, 0.06),
        (1.90, 0, 1.60, 0.72, 0.28, 0.06),
        (1.05, 0, 1.38, 0.42, 0.14, 0.04),
    ], canopy, collection, 0.015)
    add_box("Canopy_Frame_Fore", (3.55, 0, 1.48), (0.06, 0.68, 0.10), armor, collection, 0.012)
    add_box("Canopy_Frame_Aft", (1.15, 0, 1.44), (0.06, 0.66, 0.10), armor, collection, 0.012)
    add_box("Canopy_Frame_Center", (2.35, 0, 1.82), (1.05, 0.04, 0.04), armor, collection, 0.008)
    add_box("Canopy_Brow", (3.20, 0, 1.78), (0.48, 0.38, 0.06), armor, collection, 0.012)

    add_drive("Port", -1.35, lod, mats, collection)
    add_drive("Starboard", 1.35, lod, mats, collection)
    add_mining_arm("Port", -1.0, lod, mats, collection)
    add_mining_arm("Starboard", 1.0, lod, mats, collection)
    add_filter_drums(lod, mats, collection)

    add_cylinder("Survey_Mast", (2.55, 0.0, 1.95), 0.055, 0.85, mech, collection, vertices=10, bevel=0.01, rot=(0, 0, 0))
    add_box("Survey_Head", (2.55, 0.0, 2.42), (0.18, 0.12, 0.10), armor, collection, 0.015)
    add_box("Claim_Stake", (4.85, -1.55, 0.15), (0.35, 0.12, 0.10), mech, collection, 0.02)
    add_extruded_polygon("Return_Chevron", [
        (2.35, -2.05), (1.55, -2.18), (1.85, -2.05), (1.55, -1.92),
    ], 0.22, 0.38, warning, collection, 0.01)
    add_box("Cyan_Scuff_Plate", (0.35, -2.08, 0.42), (0.42, 0.018, 0.12), accent, collection, 0.006)

    if lod <= 1:
        add_box("Hatch_Rim", (-0.35, -0.05, 1.46), (0.72, 0.62, 0.06), mech, collection, 0.02)
        add_box("Hatch_Lid", (-0.35, -0.05, 1.52), (0.58, 0.48, 0.04), armor, collection, 0.015)
        for sign, side in ((-1, "Port"), (1, "Starboard")):
            add_box(f"Radiator_Well_{side}", (-2.35, 1.62 * sign, 0.72), (1.05, 0.06, 0.28), radiator, collection, 0.01)
            add_box(f"Radiator_Frame_{side}", (-2.35, 1.70 * sign, 0.72), (1.10, 0.03, 0.32), mech, collection, 0.008)
            if lod == 0:
                for fin in range(7):
                    add_box(
                        f"Radiator_Fin_{side}_{fin}",
                        (-2.85 + fin * 0.16, 1.62 * sign, 0.72),
                        (0.018, 0.07, 0.24),
                        radiator,
                        collection,
                        0.003,
                    )
                add_box(f"Hatch_Latch_{side}", (-0.35, 0.28 * sign, 1.58), (0.08, 0.05, 0.05), mech, collection, 0.006)
        add_box("Shoulder_Plate_Port", (0.8, -1.85, 0.72), (1.4, 0.12, 0.35), armor, collection, 0.03)
        add_box("Shoulder_Plate_Starboard", (0.8, 1.85, 0.72), (1.4, 0.12, 0.35), armor, collection, 0.03)

    if lod == 0:
        for index, x in enumerate((3.4, 1.8, 0.2, -1.4, -3.0)):
            add_box(f"Hull_Seam_{index}", (x, 0, 1.08), (0.03, 1.55, 0.03), mech, collection, 0.006)
        for sign, side in ((-1, "Port"), (1, "Starboard")):
            add_cylinder(f"RCS_{side}", (-1.6, 2.55 * sign, 0.15), 0.10, 0.18, mech, collection, vertices=10, bevel=0.008, rot=(math.pi / 2, 0, 0))
            add_box(f"Service_Cable_{side}", (1.2, 1.95 * sign, 0.35), (1.6, 0.03, 0.03), mech, collection, 0.004, (0, 0.08 * sign, 0))

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
        bpy.ops.uv.cube_project(cube_size=2.6, correct_aspect=True)
        bpy.ops.object.mode_set(mode="OBJECT")
        obj.select_set(False)

    groups: dict[str, list] = {}
    for obj in mesh_objects:
        material_name = obj.data.materials[0].name if obj.data.materials else "Material_Hull"
        groups.setdefault(material_name, []).append(obj)
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
        active["spacefaceRole"] = bpy.data.materials[material_name].get("spacefaceRole", "static")
        active.parent = root
        triangulate = active.modifiers.new("ExportTriangulate", "TRIANGULATE")
        triangulate.quad_method = "BEAUTY"
        triangulate.ngon_method = "BEAUTY"
        bpy.context.view_layer.objects.active = active
        active.select_set(True)
        bpy.ops.object.modifier_apply(modifier=triangulate.name)
        active.select_set(False)
        merged.append(active)

    for socket_name, loc in REQUIRED_SOCKETS.items():
        add_empty(socket_name, loc, collection, root)

    bm = bmesh.new()
    for point in [
        (6.2, 0, 0.1), (4.0, -2.1, 1.1), (4.0, 2.1, 1.1),
        (1.0, -2.6, 0.4), (1.0, 2.6, 0.4), (-4.5, -2.2, 0.3),
        (-4.5, 2.2, 0.3), (-6.3, -1.5, 0.2), (-6.3, 1.5, 0.2),
        (3.5, -1.4, -1.2), (3.5, 1.4, -1.2), (-4.0, -1.2, -1.2), (-4.0, 1.2, -1.2),
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
    collision["spaceface"] = {"collision": True, "helper": True, "nonRender": True}

    triangles = sum(sum(max(0, len(poly.vertices) - 2) for poly in obj.data.polygons) for obj in merged)
    hull_tris = next((sum(max(0, len(poly.vertices) - 2) for poly in obj.data.polygons)
                      for obj in merged if "Hull" in obj.name), 0)
    return collection, {
        "lod": lod, "triangles": triangles, "hullTriangles": hull_tris,
        "draws": len(merged), "materials": sorted(groups),
        "meshNodes": [obj.name for obj in merged],
        "sockets": sorted(REQUIRED_SOCKETS), "embeddedPlume": False,
    }


def export_lod(collection: bpy.types.Collection, lod: int) -> Path:
    out = FAMILY / "source" / "wholeships" / f"pelican_production_v1_lod{lod}.glb"
    out.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.object.select_all(action="DESELECT")
    for obj in collection.all_objects:
        obj.hide_viewport = False
        obj.hide_set(False)
        obj.select_set(True)
    bpy.ops.export_scene.gltf(
        filepath=str(out), export_format="GLB", use_selection=True, export_apply=True,
        export_yup=True, export_extras=True, export_animations=False,
        export_materials="EXPORT", export_texcoords=True, export_normals=True,
        export_tangents=True, export_attributes=True, export_image_format="NONE",
        export_unused_images=False, export_hierarchy_full_collections=False,
    )
    bpy.ops.object.select_all(action="DESELECT")
    if out.stat().st_size >= 100 * 1024 * 1024:
        raise RuntimeError(f"{out.name} exceeds GitHub 100 MiB limit")
    return out


def look_at(obj, target=(0, 0, 0)):
    obj.rotation_euler = (Vector(target) - obj.location).to_track_quat("-Z", "Y").to_euler()


def setup_studio():
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 1280
    scene.render.resolution_y = 720
    scene.render.image_settings.file_format = "PNG"
    scene.render.film_transparent = False
    scene.view_settings.look = "AgX - Medium High Contrast"
    scene.view_settings.exposure = 1.05
    world = scene.world
    world.use_nodes = True
    bg = world.node_tree.nodes.get("Background")
    bg.inputs["Color"].default_value = (0.012, 0.014, 0.018, 1)
    bg.inputs["Strength"].default_value = 0.42
    camera_data = bpy.data.cameras.new("EvidenceCamera")
    camera = bpy.data.objects.new("EvidenceCamera", camera_data)
    scene.collection.objects.link(camera)
    camera_data.lens = 55
    scene.camera = camera

    def area(name, loc, energy, color, size):
        data = bpy.data.lights.new(name, "AREA")
        data.energy = energy
        data.color = color
        data.shape = "DISK"
        data.size = size
        obj = bpy.data.objects.new(name, data)
        scene.collection.objects.link(obj)
        obj.location = loc
        look_at(obj)
        return obj

    area("Key_Area", (16, -22, 18), 4800, (0.85, 0.90, 1.0), 12)
    area("Fill_Area", (6, 20, 10), 2400, (0.55, 0.62, 0.72), 10)
    area("Rim_Area", (-18, -8, 8), 3200, (1.0, 0.62, 0.28), 8)
    area("Grazing", (4, -14, 2), 2100, (0.95, 0.88, 0.75), 6)
    bpy.ops.mesh.primitive_plane_add(size=80, location=(0, 0, -2.2))
    floor = bpy.context.object
    floor.name = "EvidenceFloor"
    floor_mat = bpy.data.materials.new("EvidenceFloorMaterial")
    bsdf = principled(floor_mat)
    bsdf.inputs["Base Color"].default_value = (0.03, 0.032, 0.036, 1)
    bsdf.inputs["Roughness"].default_value = 0.55
    floor.data.materials.append(floor_mat)
    return camera, floor


def render_evidence(collection):
    for other in bpy.data.collections:
        other.hide_render = other is not collection
    camera, floor = setup_studio()
    out_dir = FAMILY / "evidence" / "iter03"
    out_dir.mkdir(parents=True, exist_ok=True)
    views = [
        ("pelican_three_quarter", (18, -20, 10), (0, 0, 0.2), 52),
        ("pelican_starboard", (16, 20, 9), (0, 0.4, 0.1), 52),
        ("pelican_front", (22, 0, 4), (0, 0, 0.1), 55),
        ("pelican_rear", (-20, -8, 6), (-1, 0, 0.1), 55),
        ("pelican_top", (0, 0, 28), (0, 0, 0), 60),
        ("pelican_grazing", (6, -16, 1.2), (0, 0, 0.2), 50),
        ("pelican_drive_close", (-12, -4, 1.5), (-6.2, 1.35, 0.1), 70),
        ("pelican_arm_close", (14, -6, 1.2), (7.2, 1.5, -0.3), 70),
    ]
    receipts = []
    scene = bpy.context.scene
    for name, location, target, lens in views:
        camera.location = location
        camera.data.lens = lens
        look_at(camera, target)
        target_path = out_dir / f"{name}.png"
        scene.render.filepath = str(target_path)
        bpy.ops.render.render(write_still=True)
        receipts.append({
            "view": name, "path": str(target_path.relative_to(FAMILY)).replace("\\", "/"),
            "bytes": target_path.stat().st_size, "sha256": sha256(target_path),
            "camera": list(location), "target": list(target), "lensMm": lens,
        })
    floor.hide_render = True
    return receipts


def save_blend():
    out = FAMILY / "blender" / "pelican_production_v1.blend"
    out.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(out), compress=True)
    return out


def copy_textures(dest: Path) -> dict[str, str]:
    dest.mkdir(parents=True, exist_ok=True)
    hashes = {}
    for prefix in TEXTURE_SETS.values():
        for suffix in ("basecolor.png", "normal.png", "orm.png"):
            src = TEXTURE_SRC / f"{prefix}_{suffix}"
            if not src.exists():
                raise RuntimeError(f"missing first-party texture {src}")
            out = dest / f"{prefix}_{suffix}"
            shutil.copy2(src, out)
            hashes[out.name] = sha256(out)
    return hashes


def main() -> int:
    skip_renders = "--skip-renders" in sys.argv
    texture_dir = FAMILY / "textures"
    texture_hashes = copy_textures(texture_dir)
    reset_scene()
    mats = create_materials(texture_dir)
    collections = []
    reports = []
    for lod in (0, 1, 2):
        collection, report = build_ship(lod, mats)
        output = export_lod(collection, lod)
        report.update({
            "path": str(output.relative_to(FAMILY)).replace("\\", "/"),
            "bytes": output.stat().st_size, "sha256": sha256(output),
        })
        collections.append(collection)
        reports.append(report)
    renders = [] if skip_renders else render_evidence(collections[0])
    production_blend = save_blend()
    report = {
        "schema": "spaceface.pelicanProductionV1.build.v1",
        "packet": PACKET,
        "assetId": ASSET_ID,
        "status": "isolated_candidate",
        "iteration": 3,
        "textureSourceHashes": texture_hashes,
        "productionBlend": str(production_blend.relative_to(FAMILY)).replace("\\", "/"),
        "lods": reports,
        "renders": renders,
        "contracts": {
            "forward": "+X", "upAfterExport": "+Y", "embeddedPlume": False,
            "requiredSockets": sorted(REQUIRED_SOCKETS),
        },
    }
    evidence = FAMILY / "evidence"
    evidence.mkdir(parents=True, exist_ok=True)
    (evidence / "build_report.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, indent=2))
    if any(entry["hullTriangles"] < 800 for entry in reports):
        raise SystemExit("hull body below 800 triangles")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

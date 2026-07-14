"""Author, export, and render the isolated SpaceFace Wasp production candidate.

This is a new fighter authored for SpaceFace.  It uses the user-provided
Borrowed-Time Revamp package only as a first-party material/provenance source;
no Borrowed-Time geometry is copied.  The ship is +X forward, +Y starboard,
+Z up in Blender and exports to glTF with +Y up.

Run:
  blender --background --python build_wasp_v1.py -- --source-zip <Revamp.zip>
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import sys
import tempfile
import zipfile
from pathlib import Path

import bpy
import bmesh
from mathutils import Matrix, Vector


FAMILY = Path(__file__).resolve().parents[1]
DEFAULT_ZIP = Path(r"C:\Users\93rob\Downloads\SpaceFace_SF-K0_Borrowed-Time_Revamp.zip")
EXPECTED_ZIP_SHA256 = "5457DACD44B63CF170ECF65DB253BB607D7615B8DDBD3CF97666D155BA355000"
ZIP_PREFIX = "SpaceFace_SF-K0_Borrowed-Time_Revamp/textures/"
PACKET = "SF-WASP-PRODUCTION-V1-001"
ASSET_ID = "SF_WASP_PRODUCTION_V1"
REQUIRED_SOCKETS = {
    "SOCKET_Weapon_Front": (10.6, 0.0, 0.1),
    "SOCKET_Mining_Front": (10.2, 0.0, -0.35),
    "SOCKET_Engine_Main": (-9.7, 0.0, 0.0),
    "SOCKET_Trail_Main": (-10.0, 0.0, 0.0),
    "SOCKET_Trail_Port": (-9.8, -5.55, 0.0),
    "SOCKET_Trail_Starboard": (-9.8, 5.55, 0.0),
    "SOCKET_Utility_Dorsal": (-1.1, 0.0, 1.5),
    "SOCKET_Cargo_Ventral": (-2.2, 0.0, -1.15),
    "SOCKET_Camera_Focus": (0.2, 0.0, 0.35),
    "SOCKET_RCS_Port": (-1.8, -7.0, 0.05),
    "SOCKET_RCS_Starboard": (-1.8, 7.0, 0.05),
}
TEXTURE_SETS = {
    "Material_Hull": "hull",
    "Material_Armor": "armor_dark",
    "Material_Mechanical": "mechanical",
    "Material_Accent": "frontier_cyan",
    "Material_Warning": "warning_orange",
}


def parse_args() -> argparse.Namespace:
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--source-zip", type=Path, default=DEFAULT_ZIP)
    parser.add_argument("--skip-renders", action="store_true")
    return parser.parse_args(argv)


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest().upper()


def reset_scene() -> None:
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for bucket in (bpy.data.meshes, bpy.data.curves, bpy.data.materials, bpy.data.cameras, bpy.data.lights):
        for item in list(bucket):
            bucket.remove(item)
    for collection in list(bpy.data.collections):
        bpy.data.collections.remove(collection)


def extract_material_maps(source_zip: Path) -> tuple[Path, dict[str, str]]:
    zip_hash = sha256(source_zip)
    if zip_hash != EXPECTED_ZIP_SHA256:
        raise RuntimeError(f"Borrowed-Time source hash mismatch: {zip_hash}")
    # Keep the selected first-party PBR sheets inside the isolated packet.  The
    # finalizer embeds these exact PNG payloads into every runtime GLB, avoiding
    # exporter-dependent JPEG conversion and making provenance reproducible.
    target = FAMILY / "textures"
    target.mkdir(parents=True, exist_ok=True)
    hashes = {}
    with zipfile.ZipFile(source_zip) as archive:
        names = set(archive.namelist())
        for prefix in TEXTURE_SETS.values():
            for suffix in ("basecolor.png", "normal.png", "orm.png"):
                entry = f"{ZIP_PREFIX}{prefix}_{suffix}"
                if entry not in names:
                    raise RuntimeError(f"Missing first-party material source: {entry}")
                payload = archive.read(entry)
                out = target / f"{prefix}_{suffix}"
                out.write_bytes(payload)
                hashes[out.name] = hashlib.sha256(payload).hexdigest().upper()
    return target, hashes


def principled(material: bpy.types.Material):
    material.use_nodes = True
    material.node_tree.nodes.clear()
    output = material.node_tree.nodes.new("ShaderNodeOutputMaterial")
    bsdf = material.node_tree.nodes.new("ShaderNodeBsdfPrincipled")
    material.node_tree.links.new(bsdf.outputs["BSDF"], output.inputs["Surface"])
    return bsdf


def make_pbr_material(name: str, prefix: str, texture_dir: Path, tint: tuple[float, float, float, float]) -> bpy.types.Material:
    material = bpy.data.materials.new(name)
    bsdf = principled(material)
    bsdf.inputs["Base Color"].default_value = tint
    bsdf.inputs["Roughness"].default_value = 0.48
    bsdf.inputs["Metallic"].default_value = 0.55
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    texcoord = nodes.new("ShaderNodeTexCoord")
    mapping = nodes.new("ShaderNodeMapping")
    links.new(texcoord.outputs["UV"], mapping.inputs["Vector"])
    mapping.inputs["Scale"].default_value = (1.45, 1.45, 1.45)
    base = nodes.new("ShaderNodeTexImage")
    base.image = bpy.data.images.load(str(texture_dir / f"{prefix}_basecolor.png"), check_existing=True)
    base.image.pack()
    base.image.colorspace_settings.name = "sRGB"
    links.new(mapping.outputs["Vector"], base.inputs["Vector"])
    mix = nodes.new("ShaderNodeMixRGB")
    # Preserve the authored first-party PBR value range.  A heavy multiply here
    # crushed the candidate to black under representative space lighting.
    mix.blend_type = "MIX"
    mix.inputs[0].default_value = 0.22
    mix.inputs[2].default_value = tint
    links.new(base.outputs["Color"], mix.inputs[1])
    links.new(mix.outputs["Color"], bsdf.inputs["Base Color"])
    normal = nodes.new("ShaderNodeTexImage")
    normal.image = bpy.data.images.load(str(texture_dir / f"{prefix}_normal.png"), check_existing=True)
    normal.image.pack()
    normal.image.colorspace_settings.name = "Non-Color"
    links.new(mapping.outputs["Vector"], normal.inputs["Vector"])
    normal_map = nodes.new("ShaderNodeNormalMap")
    normal_map.inputs["Strength"].default_value = 0.38
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
    colors = {
        "Material_Hull": (0.62, 0.70, 0.76, 1.0),
        "Material_Armor": (0.20, 0.26, 0.34, 1.0),
        "Material_Mechanical": (0.34, 0.40, 0.46, 1.0),
        "Material_Accent": (0.05, 0.72, 0.92, 1.0),
        "Material_Warning": (0.96, 0.29, 0.025, 1.0),
    }
    mats = {name: make_pbr_material(name, prefix, texture_dir, colors[name])
            for name, prefix in TEXTURE_SETS.items()}

    canopy = bpy.data.materials.new("Material_Canopy")
    bsdf = principled(canopy)
    bsdf.inputs["Base Color"].default_value = (0.006, 0.025, 0.04, 1)
    bsdf.inputs["Metallic"].default_value = 0.18
    bsdf.inputs["Roughness"].default_value = 0.16
    bsdf.inputs["Coat Weight"].default_value = 0.72
    bsdf.inputs["Coat Roughness"].default_value = 0.08
    canopy["spacefaceRole"] = "glass"
    mats[canopy.name] = canopy

    thruster = bpy.data.materials.new("Material_Thruster")
    bsdf = principled(thruster)
    bsdf.inputs["Base Color"].default_value = (0.01, 0.18, 0.24, 1)
    bsdf.inputs["Emission Color"].default_value = (0.015, 0.55, 0.78, 1)
    bsdf.inputs["Emission Strength"].default_value = 1.8
    bsdf.inputs["Roughness"].default_value = 0.22
    bsdf.inputs["Metallic"].default_value = 0.15
    thruster["spacefaceRole"] = "thruster"
    thruster["embeddedPlume"] = False
    mats[thruster.name] = thruster
    return mats


def link_object(obj: bpy.types.Object, collection: bpy.types.Collection) -> bpy.types.Object:
    for current in list(obj.users_collection):
        current.objects.unlink(obj)
    collection.objects.link(obj)
    return obj


def finish_mesh(obj: bpy.types.Object, material: bpy.types.Material, bevel: float = 0.08, smooth: bool = True) -> bpy.types.Object:
    obj.data.materials.append(material)
    if bevel > 0:
        mod = obj.modifiers.new("ProductionBevel", "BEVEL")
        mod.width = bevel
        mod.segments = 2
        mod.limit_method = "ANGLE"
    if smooth:
        for poly in obj.data.polygons:
            poly.use_smooth = True
    obj["spacefaceRole"] = material.get("spacefaceRole", "static")
    return obj


def add_box(name: str, loc, scale, material, collection, bevel=0.08, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cube_add(location=loc, rotation=rot)
    obj = link_object(bpy.context.object, collection)
    obj.name = name
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return finish_mesh(obj, material, bevel)


def add_cylinder(name: str, loc, radius, depth, material, collection, vertices=24, bevel=0.05, rot=(0, math.pi / 2, 0)):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=loc, rotation=rot)
    obj = link_object(bpy.context.object, collection)
    obj.name = name
    return finish_mesh(obj, material, bevel)


def add_uv_sphere(name: str, loc, scale, material, collection, segments=24):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments, ring_count=max(8, segments // 2), location=loc)
    obj = link_object(bpy.context.object, collection)
    obj.name = name
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return finish_mesh(obj, material, 0.02)


def add_extruded_polygon(name: str, points: list[tuple[float, float]], z0: float, z1: float,
                         material, collection, bevel=0.06) -> bpy.types.Object:
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


def add_loft(name: str, stations: list[tuple[float, float, float, float]], material,
             collection, sides=8, bevel=0.05) -> bpy.types.Object:
    # station: x, y_center, z_center, radius tuple encoded as y_radius then z_radius
    verts = []
    for x, y_center, z_center, y_radius, z_radius in stations:
        for index in range(sides):
            angle = math.tau * index / sides
            verts.append((x, y_center + math.cos(angle) * y_radius,
                          z_center + math.sin(angle) * z_radius))
    faces = []
    faces.append(tuple(range(sides - 1, -1, -1)))
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


def add_empty(name: str, loc, collection, parent=None) -> bpy.types.Object:
    obj = bpy.data.objects.new(name, None)
    collection.objects.link(obj)
    obj.empty_display_type = "PLAIN_AXES"
    obj.empty_display_size = 0.28
    obj.location = loc
    if parent:
        obj.parent = parent
    obj["socket"] = True
    return obj


def mirror(points: list[tuple[float, float]], sign: int) -> list[tuple[float, float]]:
    return [(x, y * sign) for x, y in points]


def build_ship(lod: int, mats: dict[str, bpy.types.Material]) -> tuple[bpy.types.Collection, dict]:
    collection = bpy.data.collections.new(f"WASP_PRODUCTION_V1_LOD{lod}")
    bpy.context.scene.collection.children.link(collection)
    hull = mats["Material_Hull"]
    armor = mats["Material_Armor"]
    mech = mats["Material_Mechanical"]
    accent = mats["Material_Accent"]
    warning = mats["Material_Warning"]
    canopy = mats["Material_Canopy"]
    thruster = mats["Material_Thruster"]

    root = add_empty(f"WASP_PRODUCTION_V1_LOD{lod}_ROOT", (0, 0, 0), collection)
    root["spacefaceAsset"] = {
        "assetId": ASSET_ID, "partId": "wasp_production_v1", "packet": PACKET,
        "lod": f"lod{lod}", "slot": "hull", "category": "wholeships",
        "forward": "+X", "up": "+Y", "starboard": "+Z", "unit": "metre",
        "normalConvention": "OpenGL", "ormChannels": "R=AO,G=Roughness,B=Metallic",
        "textureCompression": "PNG-source",
        "factorOnlyMaterials": ["Material_Canopy", "Material_Thruster"],
        "embeddedPlume": False, "wiringStatus": "isolated_candidate_no_promote",
    }

    # Macro silhouette: arrowhead fuselage, swept wings, and separated twin nacelles.
    add_loft("Fuselage_Core", [
        (12.0, 0, -0.05, 0.10, 0.14), (9.2, 0, 0.05, 1.55, 0.55),
        (4.0, 0, 0.05, 3.10, 1.20), (-2.4, 0, 0.0, 3.45, 1.30),
        (-7.6, 0, -0.05, 2.30, 0.92), (-10.0, 0, -0.05, 1.15, 0.60),
    ], hull, collection, sides=10, bevel=0.10)
    add_extruded_polygon("Dorsal_Armor_Spine",
        [(9.0, 0), (5.1, -1.45), (-3.5, -1.75), (-7.5, -0.9), (-8.7, 0),
         (-7.5, 0.9), (-3.5, 1.75), (5.1, 1.45)], 0.78, 1.36, armor, collection, 0.11)
    add_extruded_polygon("Ventral_Keel",
        [(7.0, 0), (2.0, -1.15), (-6.8, -0.8), (-9.0, 0), (-6.8, 0.8), (2.0, 1.15)],
        -1.38, -0.88, mech, collection, 0.08)

    wing_shape = [(6.0, 2.15), (3.0, 5.3), (-2.2, 8.1), (-6.8, 7.25), (-8.0, 4.1), (-3.0, 2.55)]
    wing_plate = [(4.3, 2.8), (1.6, 5.3), (-2.1, 7.0), (-5.6, 6.35), (-5.9, 4.6), (-2.4, 3.05)]
    for sign, side in [(-1, "Port"), (1, "Starboard")]:
        add_extruded_polygon(f"Wing_{side}", mirror(wing_shape, sign), -0.32, 0.42, hull, collection, 0.10)
        add_extruded_polygon(f"Wing_Armor_{side}", mirror(wing_plate, sign), 0.43, 0.68, armor, collection, 0.07)
        # Outboard engine pods sit beyond a real negative-space channel.
        yc = 5.55 * sign
        add_loft(f"Engine_Nacelle_{side}", [
            (3.6, yc, 0.05, 0.65, 0.56), (1.5, yc, 0.05, 1.28, 0.95),
            (-5.5, yc, 0.0, 1.38, 1.05), (-8.8, yc, 0.0, 1.05, 0.82),
            (-9.7, yc, 0.0, 0.82, 0.68),
        ], armor, collection, sides=12, bevel=0.08)
        add_cylinder(f"Engine_Ring_{side}", (-9.45, yc, 0), 0.89, 0.38, mech, collection, vertices=32, bevel=0.04)
        add_cylinder(f"Engine_Inner_{side}", (-9.69, yc, 0), 0.63, 0.12, thruster, collection, vertices=32, bevel=0.02)
        add_cylinder(f"Gun_Housing_{side}", (4.4, 4.0 * sign, 0.2), 0.44, 3.1, mech, collection, vertices=20, bevel=0.06)
        add_cylinder(f"Gun_Barrel_{side}", (6.2, 4.0 * sign, 0.2), 0.16, 1.4, armor, collection, vertices=16, bevel=0.03)
        add_extruded_polygon(f"Nacelle_Strake_{side}", mirror([
            (1.9, 4.85), (-4.8, 4.65), (-8.1, 5.05), (-4.8, 5.32)], sign),
            0.93, 1.18, accent, collection, 0.04)
        add_extruded_polygon(f"Wing_Warning_{side}", mirror([
            (-0.6, 6.15), (-1.8, 6.70), (-2.45, 6.45), (-1.1, 5.85)], sign),
            0.68, 0.78, warning, collection, 0.025)

    # Low faceted canopy: deliberately compact, dark, and below the dorsal silhouette.
    add_loft("Cockpit_Canopy", [
        (7.8, 0, 0.78, 0.22, 0.10), (6.4, 0, 1.12, 0.78, 0.34),
        (3.2, 0, 1.25, 1.15, 0.42), (1.1, 0, 0.96, 0.78, 0.25),
    ], canopy, collection, sides=8, bevel=0.04)
    add_box("Canopy_Center_Frame", (4.35, 0, 1.55), (2.5, 0.055, 0.055), armor, collection, 0.025, (0, -0.075, 0))
    add_box("Canopy_Rear_Frame", (1.9, 0, 1.31), (0.12, 1.02, 0.08), armor, collection, 0.025)

    # Strong top-down cue language: center accent spear and mechanical intake triangles.
    add_extruded_polygon("Accent_Spear", [(8.6, 0), (4.7, -0.22), (-5.1, -0.18), (-7.2, 0), (-5.1, 0.18), (4.7, 0.22)],
                         1.37, 1.46, accent, collection, 0.025)
    for sign, side in [(-1, "Port"), (1, "Starboard")]:
        add_extruded_polygon(f"Intake_{side}", mirror([(3.3, 2.15), (0.3, 3.1), (-2.9, 2.85), (-0.1, 2.0)], sign),
                             0.58, 0.82, mech, collection, 0.05)

    if lod <= 1:
        # Meso layer: armor break-up, rear shoulders, vents, and service channels.
        for sign, side in [(-1, "Port"), (1, "Starboard")]:
            add_extruded_polygon(f"Shoulder_Plate_{side}", mirror([
                (2.2, 1.8), (-1.4, 2.2), (-5.4, 1.7), (-4.5, 1.15), (-0.8, 1.45)], sign),
                0.90, 1.12, armor, collection, 0.05)
            add_box(f"Engine_Rail_{side}", (-3.4, 6.02 * sign, 1.03), (3.5, 0.10, 0.10), accent, collection, 0.025)
            add_box(f"Wing_Rail_{side}", (-1.8, 4.05 * sign, 0.73), (2.4, 0.09, 0.09), mech, collection, 0.02, (0, 0, 0.10 * sign))
            for index, x in enumerate((0.3, -0.8, -1.9, -3.0, -4.1)):
                add_box(f"Engine_Vent_{side}_{index}", (x, 5.52 * sign, 1.09), (0.30, 0.70, 0.07), mech, collection, 0.025)
        add_extruded_polygon("Rear_Armor_Crown", [(-3.5, -1.2), (-7.3, -0.85), (-9.0, 0), (-7.3, 0.85), (-3.5, 1.2), (-4.4, 0)],
                             1.03, 1.28, armor, collection, 0.05)
        for x in (0.8, -1.0, -2.8, -4.6):
            add_box(f"Dorsal_Service_Band_{x}", (x, 0, 1.39), (0.10, 1.55, 0.045), mech, collection, 0.018)

    if lod == 0:
        # Micro layer remains geometry so it reads in real runtime lighting after glTF export.
        for sign, side in [(-1, "Port"), (1, "Starboard")]:
            for index, x in enumerate((2.5, 0.9, -0.7, -2.3, -3.9, -5.5)):
                add_box(f"Nacelle_Rib_{side}_{index}", (x, 5.55 * sign, 1.01), (0.055, 1.14, 0.075), mech, collection, 0.018)
            for index, x in enumerate((3.2, 1.2, -0.8, -2.8, -4.8)):
                add_box(f"Wing_Panel_Seam_{side}_{index}", (x, 4.15 * sign, 0.695), (0.035, 1.15, 0.028), armor, collection, 0.01, (0, 0, 0.10 * sign))
            # RCS hardware and tiny navigation cues, restrained in screen footprint.
            add_cylinder(f"RCS_Nozzle_{side}", (-1.7, 7.0 * sign, 0.0), 0.22, 0.36, mech, collection, vertices=16, bevel=0.02, rot=(math.pi / 2, 0, 0))
            add_uv_sphere(f"Nav_Light_{side}", (-2.0, 7.88 * sign, 0.48), (0.10, 0.10, 0.08), accent, collection, 16)
        for index, x in enumerate((5.9, 4.9, 3.9, 2.9)):
            add_box(f"Nose_Panel_Band_{index}", (x, 0, 0.83 + index * 0.045), (0.045, 1.25 - index * 0.10, 0.035), mech, collection, 0.012)
        add_box("Dorsal_Antenna_Base", (-1.0, 0, 1.55), (0.42, 0.38, 0.10), mech, collection, 0.03)
        add_box("Dorsal_Antenna_Fin", (-1.15, 0, 1.86), (0.52, 0.06, 0.32), armor, collection, 0.025, (0, -0.32, 0))

    # Parent, UV-project, apply modifiers, and merge all static meshes per semantic material.
    mesh_objects = [obj for obj in collection.objects if obj.type == "MESH"]
    for obj in mesh_objects:
        obj.parent = root
        bpy.context.view_layer.objects.active = obj
        obj.select_set(True)
        for mod in list(obj.modifiers):
            bpy.ops.object.modifier_apply(modifier=mod.name)
        bpy.ops.object.mode_set(mode="EDIT")
        bpy.ops.mesh.select_all(action="SELECT")
        bpy.ops.uv.cube_project(cube_size=3.0, correct_aspect=True)
        bpy.ops.object.mode_set(mode="OBJECT")
        obj.select_set(False)

    groups: dict[str, list[bpy.types.Object]] = {}
    for obj in mesh_objects:
        material_name = obj.data.materials[0].name if obj.data.materials else "Material_Hull"
        groups.setdefault(material_name, []).append(obj)
    merged = []
    for material_name, objects in sorted(groups.items()):
        bpy.ops.object.select_all(action="DESELECT")
        for obj in objects:
            obj.select_set(True)
        active = objects[0]
        bpy.context.view_layer.objects.active = active
        bpy.ops.object.join()
        active.name = f"LOD{lod}_{material_name.replace('Material_', '')}"
        active["spacefaceRole"] = bpy.data.materials[material_name].get("spacefaceRole", "static")
        active.parent = root
        triangulate = active.modifiers.new("ExportTriangulate", "TRIANGULATE")
        triangulate.quad_method = "BEAUTY"
        triangulate.ngon_method = "BEAUTY"
        if hasattr(triangulate, "keep_custom_normals"):
            triangulate.keep_custom_normals = True
        bpy.context.view_layer.objects.active = active
        active.select_set(True)
        bpy.ops.object.modifier_apply(modifier=triangulate.name)
        active.select_set(False)
        merged.append(active)

    for socket_name, loc in REQUIRED_SOCKETS.items():
        add_empty(socket_name, loc, collection, root)

    # Convex non-render collision hull sized to the macro body, not the wingtip lights.
    bm = bmesh.new()
    for point in [
        (11.2, 0, 0), (5.0, -3.0, 1.15), (5.0, 3.0, 1.15),
        (1.0, -7.5, 0.35), (1.0, 7.5, 0.35), (-7.5, -6.6, 0.2),
        (-7.5, 6.6, 0.2), (-9.5, -2.2, 0.2), (-9.5, 2.2, 0.2),
        (4.5, -2.5, -1.05), (4.5, 2.5, -1.05), (-7.0, -2.0, -1.0), (-7.0, 2.0, -1.0),
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
    report = {
        "lod": lod, "triangles": triangles, "draws": len(merged),
        "materials": sorted(groups), "meshNodes": [obj.name for obj in merged],
        "sockets": sorted(REQUIRED_SOCKETS), "embeddedPlume": False,
    }
    return collection, report


def export_lod(collection: bpy.types.Collection, lod: int) -> Path:
    out = FAMILY / "source" / "wholeships" / f"wasp_production_v1_lod{lod}.glb"
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
        # Blender 5.1 removed the explicit PNG enum; NONE preserves the packed
        # source PNG payloads without AUTO converting opaque sheets to JPEG.
        export_tangents=True, export_attributes=True, export_image_format="NONE",
        export_unused_images=False, export_hierarchy_full_collections=False,
    )
    bpy.ops.object.select_all(action="DESELECT")
    if out.stat().st_size >= 100 * 1024 * 1024:
        raise RuntimeError(f"{out.name} exceeds GitHub 100 MiB limit")
    return out


def look_at(obj: bpy.types.Object, target=(0, 0, 0)) -> None:
    direction = Vector(target) - obj.location
    obj.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()


def setup_studio() -> tuple[bpy.types.Object, bpy.types.Object]:
    scene = bpy.context.scene
    # Blender 5.1 exposes Eevee Next under the historical API enum.
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 1024
    scene.render.resolution_y = 1024
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.film_transparent = False
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.resolution_percentage = 100
    scene.render.use_file_extension = True
    scene.view_settings.look = "AgX - Medium High Contrast"
    scene.view_settings.exposure = 1.15
    scene.world.color = (0.002, 0.006, 0.012)
    world = scene.world
    world.use_nodes = True
    bg = world.node_tree.nodes.get("Background")
    bg.inputs["Color"].default_value = (0.002, 0.007, 0.014, 1)
    bg.inputs["Strength"].default_value = 0.48

    camera_data = bpy.data.cameras.new("EvidenceCamera")
    camera = bpy.data.objects.new("EvidenceCamera", camera_data)
    scene.collection.objects.link(camera)
    camera_data.lens = 58
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

    area("Key_Area", (18, -24, 30), 5200, (0.78, 0.90, 1.0), 14)
    area("Fill_Area", (8, 26, 15), 3100, (0.34, 0.58, 0.82), 12)
    area("Rim_Area", (-25, -12, 12), 3900, (0.18, 0.66, 1.0), 10)
    area("Warm_Kicker", (14, 15, -8), 1800, (1.0, 0.38, 0.12), 8)

    bpy.ops.mesh.primitive_plane_add(size=120, location=(0, 0, -2.0))
    floor = bpy.context.object
    floor.name = "EvidenceFloor"
    floor_mat = bpy.data.materials.new("EvidenceFloorMaterial")
    bsdf = principled(floor_mat)
    bsdf.inputs["Base Color"].default_value = (0.008, 0.013, 0.020, 1)
    bsdf.inputs["Roughness"].default_value = 0.31
    bsdf.inputs["Metallic"].default_value = 0.35
    floor.data.materials.append(floor_mat)
    return camera, floor


def render_evidence(collection: bpy.types.Collection) -> list[dict]:
    for other in bpy.data.collections:
        other.hide_render = other is not collection
    camera, floor = setup_studio()
    out_dir = FAMILY / "evidence" / "blender"
    out_dir.mkdir(parents=True, exist_ok=True)
    views = [
        ("wasp_v1_front_34", (30, -31, 24), (0, 0, 0.1), 58, 1024),
        ("wasp_v1_rear_34", (-30, -30, 21), (-0.5, 0, 0.1), 58, 1024),
        ("wasp_v1_top", (0, 0, 52), (0, 0, 0), 62, 1024),
        ("wasp_v1_gameplay_scale", (0, -3, 66), (0, 0, 0), 72, 512),
    ]
    receipts = []
    scene = bpy.context.scene
    for name, location, target, lens, resolution in views:
        camera.location = location
        camera.data.lens = lens
        look_at(camera, target)
        scene.render.resolution_x = resolution
        scene.render.resolution_y = resolution
        target_path = out_dir / f"{name}.png"
        scene.render.filepath = str(target_path)
        bpy.ops.render.render(write_still=True)
        receipts.append({"view": name, "path": str(target_path.relative_to(FAMILY)).replace("\\", "/"),
                         "bytes": target_path.stat().st_size, "sha256": sha256(target_path),
                         "camera": list(location), "target": list(target), "lensMm": lens,
                         "resolution": resolution, "exposure": 1.15})
    floor.hide_render = True
    return receipts


def save_blend(collections: list[bpy.types.Collection]) -> Path:
    for image in bpy.data.images:
        if image.size[0] and not image.packed_file:
            image.pack()
    out = FAMILY / "blender" / "wasp_production_v1.blend"
    out.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(out), compress=True)
    if out.stat().st_size >= 100 * 1024 * 1024:
        raise RuntimeError("production blend exceeds GitHub 100 MiB limit")
    return out


def main() -> int:
    args = parse_args()
    texture_dir, texture_hashes = extract_material_maps(args.source_zip)
    reset_scene()
    mats = create_materials(texture_dir)
    collections = []
    reports = []
    outputs = []
    for lod in (0, 1, 2):
        collection, report = build_ship(lod, mats)
        output = export_lod(collection, lod)
        report.update({"path": str(output.relative_to(FAMILY)).replace("\\", "/"),
                       "bytes": output.stat().st_size, "sha256": sha256(output)})
        collections.append(collection)
        reports.append(report)
        outputs.append(output)
    if args.skip_renders:
        prior_report = FAMILY / "evidence" / "build_report.json"
        renders = []
        if prior_report.exists():
            try:
                renders = json.loads(prior_report.read_text(encoding="utf-8")).get("renders", [])
            except (OSError, json.JSONDecodeError):
                renders = []
    else:
        renders = render_evidence(collections[0])
    production_blend = save_blend(collections)
    report = {
        "schema": "spaceface.waspProductionV1.build.v1",
        "packet": PACKET,
        "assetId": ASSET_ID,
        "status": "isolated_candidate_no_promote",
        "sourceZip": str(args.source_zip),
        "sourceZipSha256": sha256(args.source_zip),
        "sourceUse": "first-party PBR material treatment only; no geometry copied",
        "textureSourceHashes": texture_hashes,
        "productionBlend": str(production_blend.relative_to(FAMILY)).replace("\\", "/"),
        "productionBlendBytes": production_blend.stat().st_size,
        "productionBlendSha256": sha256(production_blend),
        "lods": reports,
        "renders": renders,
        "contracts": {
            "forward": "+X", "upAfterExport": "+Y", "starboardAfterExport": "+Z",
            "meters": True, "embeddedPlume": False, "semanticMaterials": sorted(mats),
            "requiredSockets": sorted(REQUIRED_SOCKETS), "maxFileBytes": 100 * 1024 * 1024,
        },
    }
    evidence = FAMILY / "evidence"
    evidence.mkdir(parents=True, exist_ok=True)
    target = evidence / "build_report.json"
    target.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

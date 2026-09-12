#!/usr/bin/env python3
"""PQ-193.03 same-slot remaster: manufactured lane beacon + cargo pod.

Chase camera only. Hitch-family dark hardware, not tube-plus-ring.
The live nav buoy already reads as a lantern at D=58 and is not rebuilt here.

Usage:
  blender --background --python tools/blender/build_pq193_03_manufactured.py -- \\
    --asset place_lane_beacon --output <glb>
  blender --background --python tools/blender/build_pq193_03_manufactured.py -- \\
    --asset pod_cargo_container --output <glb>
"""
from __future__ import annotations

import argparse
import json
import math
import struct
import sys
import zlib
from pathlib import Path

import bmesh
import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]
EVIDENCE = ROOT / "assets" / "ships" / "parts" / "places" / "evidence" / "graphics_3d" / "pq193_03"
POD_EVIDENCE = ROOT / "assets" / "ships" / "parts" / "pods" / "evidence" / "graphics_3d" / "pq193_03"

ASSETS = {
    "place_lane_beacon": {
        "root": "SF_M4_HELIOS_GANTRY_ROOT",
        "asset_id": "SF_PLACE_HELIOS_SUPPORT_GANTRY",
        "slot": "place",
        "materials": ("Material_Hull", "Material_Mechanical", "Material_Warm", "Material_Accent"),
        "join_names": {
            "Material_Hull": "Merged_Material_Hull",
            "Material_Mechanical": "Merged_Material_Mechanical",
            "Material_Warm": "Merged_Material_Warm",
            "Material_Accent": "HOOK_EMISSIVE",
        },
        "gltf_min": (-1.75, -5.1, -1.75),
        "gltf_max": (9.1, 9.4, 1.75),
        "collision_translation_gltf": (3.6750001907348633, 2.1499998569488525, 0.0),
        "collision_node_bounds": {
            "min": [-1.315999984741211, -1.6100000143051147, -4.520000457763672],
            "max": [8.666000366210938, 1.6100000143051147, 8.819999694824219],
            "size": [9.982000350952148, 3.2200000286102295, 13.34000015258789],
        },
        "build": "beacon",
        "lods": True,
        "texture_size": 256,
    },
    "pod_cargo_container": {
        "root": "pod_cargo_container",
        "asset_id": "SF_POD_CARGO_CONTAINER",
        "slot": "pod",
        "materials": ("Material_Hull", "Material_Mechanical", "Material_Accent"),
        "join_names": {
            "Material_Hull": "Cargo_Shell",
            "Material_Mechanical": "pod_cargo_container_Material_Mechanical_Merged",
            "Material_Accent": "Cargo_ID_Plate",
        },
        "gltf_min": (-0.51, -0.125, -1.5),
        "gltf_max": (4.7, 2.3, 1.5),
        "mount_translation_gltf": (5.0, 1.0, 0.0),
        "build": "pod",
        "lods": False,
        "texture_size": 256,
    },
}

MATERIAL_TUNING = {
    "Material_Hull": ((0.072, 0.078, 0.082), 0.14, 0.52, "coat"),
    "Material_Mechanical": ((0.36, 0.39, 0.41), 0.88, 0.30, "machined"),
    "Material_Warm": ((0.84, 0.76, 0.62), 0.04, 0.50, "coat"),
    "Material_Accent": ((0.018, 0.52, 0.72), 0.02, 0.18, "optic_cool"),
}


def parse_args(argv):
    parser = argparse.ArgumentParser()
    parser.add_argument("--asset", required=True, choices=sorted(ASSETS))
    parser.add_argument("--output", required=True, type=Path)
    return parser.parse_args(argv)


def clamp_byte(value: float) -> int:
    return max(0, min(255, int(round(value))))


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
    chevron = 1.0 if (abs(((u * 6.0) % 1.0) - 0.5) < 0.09 and 0.18 < v < 0.82) else 0.0
    panel = 1.0 if ((int(u * 8) + int(v * 4)) % 2 == 0) else 0.0

    if kind == "normal":
        if family == "machined":
            nx, ny = 128 + 5.0 * directional, 128 + 0.7 * broad
        elif family.startswith("optic"):
            nx, ny = 128, 128
        else:
            nx, ny = 128 + 1.6 * broad + 2.2 * panel, 128 - 1.1 * broad
        return bytes((clamp_byte(nx), clamp_byte(ny), 255, 255))

    if kind == "orm":
        rough = roughness * 255 + (directional * 6 if family == "machined" else broad * 5)
        ao = 236 - (10 if v > 0.92 else 0)
        return bytes((clamp_byte(ao), clamp_byte(rough), clamp_byte(metallic * 255), 255))

    factor = 0.96 + broad * 0.05
    rgb = [channel * 255 * factor for channel in base]
    if material_name == "Material_Hull" and chevron:
        rgb = [rgb[0] * 0.35 + 230, rgb[1] * 0.35 + 96, rgb[2] * 0.35 + 18]
    if material_name == "Material_Accent" and family == "optic_cool":
        rgb = [8, 150 + 20 * broad, 198]
    return bytes((clamp_byte(rgb[0]), clamp_byte(rgb[1]), clamp_byte(rgb[2]), 255))


def create_texture_files(asset_key: str, config: dict) -> dict[str, dict[str, Path]]:
    tex_root = (EVIDENCE if config["build"] == "beacon" else POD_EVIDENCE) / "textures" / asset_key
    result = {}
    size = int(config["texture_size"])
    for material_name in config["materials"]:
        result[material_name] = {}
        for kind in ("basecolor", "orm", "normal"):
            path = tex_root / f"{material_name}_{kind}.png"
            write_png(path, size, size, lambda x, y, w, h, m=material_name, k=kind: texture_pixel(m, k, x, y, w, h))
            result[material_name][kind] = path
    return result


def reset_scene() -> None:
    if getattr(bpy.context, "object", None) and bpy.context.object.mode != "OBJECT":
        bpy.ops.object.mode_set(mode="OBJECT")
    for obj in list(bpy.data.objects):
        bpy.data.objects.remove(obj, do_unlink=True)
    for collection in list(bpy.data.collections):
        bpy.data.collections.remove(collection)
    for datablocks in (bpy.data.meshes, bpy.data.materials, bpy.data.images, bpy.data.cameras, bpy.data.lights):
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
    image.name = path.name
    image.colorspace_settings.name = colorspace
    image.pack()
    return image


def create_materials(config: dict, texture_files: dict) -> dict:
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
        shader.location = (420, 0)
        shader.inputs["Base Color"].default_value = (*color, 1.0)
        shader.inputs["Metallic"].default_value = metallic
        shader.inputs["Roughness"].default_value = roughness
        base_node = nodes.new("ShaderNodeTexImage")
        base_node.image = load_image(texture_files[name]["basecolor"], "sRGB")
        base_node.location = (-560, 160)
        links.new(base_node.outputs["Color"], shader.inputs["Base Color"])
        orm_node = nodes.new("ShaderNodeTexImage")
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
        normal_node.image = load_image(texture_files[name]["normal"], "Non-Color")
        normal_node.location = (-560, -270)
        normal_map = nodes.new("ShaderNodeNormalMap")
        normal_map.location = (-280, -250)
        normal_map.inputs["Strength"].default_value = 0.32
        links.new(normal_node.outputs["Color"], normal_map.inputs["Color"])
        links.new(normal_map.outputs["Normal"], shader.inputs["Normal"])
        if family == "optic_cool":
            shader.inputs["Emission Color"].default_value = (0.05, 0.72, 1.0, 1.0)
            shader.inputs["Emission Strength"].default_value = 4.8 if config["build"] == "beacon" else 0.0
        links.new(shader.outputs["BSDF"], output.inputs["Surface"])
        material.diffuse_color = (*color, 1.0)
        materials[name] = material
    return materials


def tag(obj, lod: int, material: str, role: str) -> None:
    obj["spaceface.lodLevel"] = lod
    obj["spaceface.chamfered"] = True
    obj["spaceface.materialRole"] = material
    obj["spaceface.structureRole"] = role


def add_box(collection, materials, lod, name, size, location, material, bevel=0.035, rotation=(0.0, 0.0, 0.0)):
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=location, rotation=rotation)
    obj = bpy.context.object
    obj.name = f"LOD{lod}_{name}"
    obj.dimensions = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(materials[material])
    if bevel > 0 and lod < 2:
        modifier = obj.modifiers.new("SF_ManufacturedEdge", "BEVEL")
        modifier.width = max(0.006, bevel * (1.0 if lod == 0 else 0.55))
        modifier.segments = 2 if lod == 0 else 1
        modifier.limit_method = "ANGLE"
        modifier.angle_limit = math.radians(30)
    tag(obj, lod, material, name)
    move_to(obj, collection)
    return obj


def add_cyl(collection, materials, lod, name, radius, depth, location, material, rotation=(0.0, 0.0, 0.0), vertices=None, bevel=0.02):
    vertices = vertices or (16 if lod == 0 else 10 if lod == 1 else 8)
    bpy.ops.mesh.primitive_cylinder_add(
        vertices=vertices, radius=radius, depth=depth, end_fill_type="NGON",
        location=location, rotation=rotation,
    )
    obj = bpy.context.object
    obj.name = f"LOD{lod}_{name}"
    obj.data.materials.append(materials[material])
    if bevel > 0 and lod < 2:
        modifier = obj.modifiers.new("SF_MachinedEdge", "BEVEL")
        modifier.width = max(0.005, bevel)
        modifier.segments = 2 if lod == 0 else 1
        modifier.limit_method = "ANGLE"
    tag(obj, lod, material, name)
    move_to(obj, collection)
    return obj


def add_tapered_column(collection, materials, lod, name, stations, material):
    """stations: (z, half_x, half_y) along Blender Z-up."""
    vertices = []
    for z, hx, hy in stations:
        vertices.extend((( -hx, -hy, z), (hx, -hy, z), (hx, hy, z), (-hx, hy, z)))
    faces = []
    for section in range(len(stations) - 1):
        a, b = section * 4, (section + 1) * 4
        faces.extend((
            (a, b, b + 1, a + 1),
            (a + 1, b + 1, b + 2, a + 2),
            (a + 2, b + 2, b + 3, a + 3),
            (a + 3, b + 3, b, a),
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
    if lod < 2:
        modifier = obj.modifiers.new("SF_ManufacturedEdge", "BEVEL")
        modifier.width = 0.04 if lod == 0 else 0.02
        modifier.segments = 2 if lod == 0 else 1
        modifier.limit_method = "ANGLE"
    tag(obj, lod, material, name)
    return obj


def add_ibeam(collection, materials, lod, name, start, end, web, flange, material):
    start_v, end_v = Vector(start), Vector(end)
    delta = end_v - start_v
    center = (start_v + end_v) * 0.5
    length = delta.length
    direction = delta.normalized()
    web_obj = add_box(collection, materials, lod, f"{name}_Web", (web[0], web[1], length), center, material, 0.012)
    web_obj.rotation_euler = direction.to_track_quat("Z", "Y").to_euler()
    off = Vector((-direction.y, direction.x, 0.0))
    if off.length < 1e-4:
        off = Vector((1.0, 0.0, 0.0))
    off.normalize()
    * _axis, = off
    flange_a = add_box(collection, materials, lod, f"{name}_FlangeA", (flange[0], flange[1], length),
                       center + off * (web[0] * 0.5), material, 0.01)
    flange_b = add_box(collection, materials, lod, f"{name}_FlangeB", (flange[0], flange[1], length),
                       center - off * (web[0] * 0.5), material, 0.01)
    for obj in (flange_a, flange_b):
        obj.rotation_euler = web_obj.rotation_euler.copy()
    return web_obj


def apply_object(obj) -> None:
    bpy.ops.object.select_all(action="DESELECT")
    obj.hide_viewport = False
    obj.hide_set(False)
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    for modifier in list(obj.modifiers):
        try:
            bpy.ops.object.modifier_apply(modifier=modifier.name)
        except Exception:
            if modifier.name in obj.modifiers:
                obj.modifiers.remove(modifier)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)


def cube_project_uv(obj) -> None:
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.cube_project(cube_size=2.4, correct_aspect=True)
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


def shade_hard_edges(obj, angle=28.0) -> None:
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    try:
        bpy.ops.object.shade_smooth_by_angle(angle=math.radians(angle))
    except Exception:
        bpy.ops.object.shade_smooth()


def join_draw_groups(collection, materials, lod, root, config) -> list:
    groups = []
    for material_name in config["materials"]:
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
        live_name = config["join_names"][material_name]
        merged.name = f"LOD{lod}_{live_name}" if config["lods"] else live_name
        merged.data.name = f"{merged.name}_Mesh"
        for polygon in merged.data.polygons:
            polygon.material_index = 0
        merged.data.materials.clear()
        merged.data.materials.append(materials[material_name])
        cube_project_uv(merged)
        triangulate(merged)
        shade_hard_edges(merged)
        merged.parent = root
        merged["spaceface.lodLevel"] = lod
        merged["spaceface.lod"] = f"lod{lod}"
        merged["spaceface.materialRole"] = material_name
        merged["spaceface.chamfered"] = True
        groups.append(merged)
    return groups


def make_empty(collection, root, name, location, extras, display="PLAIN_AXES", size=0.4):
    empty = bpy.data.objects.new(name, None)
    empty.empty_display_type = display
    empty.empty_display_size = size
    empty.location = location
    empty.parent = root
    for key, value in extras.items():
        empty[key] = value
    collection.objects.link(empty)
    return empty


def blender_from_gltf(translation):
    x, gltf_y, gltf_z = translation
    return (x, -gltf_z, gltf_y)


def beacon_geometry(collection, materials, lod: int) -> None:
    hull, mech, warm, accent = "Material_Hull", "Material_Mechanical", "Material_Warm", "Material_Accent"
    # Plinth: folded plate with hatch, not a cube.
    add_box(collection, materials, lod, "PlinthShell", (3.15, 3.15, 0.72), (0.0, 0.0, -4.72), hull, 0.05)
    add_box(collection, materials, lod, "PlinthInset", (2.35, 2.35, 0.10), (0.0, 0.0, -4.34), warm, 0.03)
    add_box(collection, materials, lod, "PlinthHatch", (1.55, 1.55, 0.08), (0.0, 0.0, -4.26), warm, 0.02)
    add_box(collection, materials, lod, "PlinthHatchRim", (1.72, 1.72, 0.05), (0.0, 0.0, -4.22), mech, 0.015)
    for index, (x, y) in enumerate(((-1.28, -1.28), (1.28, -1.28), (-1.28, 1.28), (1.28, 1.28))):
        add_box(collection, materials, lod, f"PlinthFoot{index}", (0.46, 0.46, 0.22), (x, y, -5.02), mech, 0.02)
        add_box(collection, materials, lod, f"PlinthGusset{index}", (0.18, 0.55, 0.42), (x * 0.72, y * 0.18, -4.55), mech, 0.015)
    if lod == 0:
        for index, (x, y) in enumerate(((-0.95, 0.0), (0.95, 0.0), (0.0, -0.95), (0.0, 0.95))):
            add_cyl(collection, materials, lod, f"PlinthBolt{index}", 0.045, 0.08, (x, y, -4.18), mech, vertices=8, bevel=0.0)

    # Tapered mast with inset service wells.
    add_tapered_column(
        collection, materials, lod, "MastShell",
        ((-4.28, 0.72, 0.72), (0.6, 0.62, 0.62), (4.8, 0.52, 0.52), (8.55, 0.42, 0.42)),
        hull,
    )
    well_depth = 0.16 if lod == 0 else 0.12
    well_z = (0.35, 2.55, 4.85, 6.85) if lod == 0 else (1.2, 4.2, 6.8)
    for index, z in enumerate(well_z):
        add_box(collection, materials, lod, f"MastWellFront{index}", (0.42, well_depth, 0.72),
                (0.52, 0.0, z), mech, 0.012)
        add_box(collection, materials, lod, f"MastWellCavity{index}", (0.32, 0.08, 0.55),
                (0.38, 0.0, z), hull, 0.0)
    if lod < 2:
        add_box(collection, materials, lod, "MastServiceDoor", (0.08, 0.55, 1.15), (-0.62, 0.0, -1.4), mech, 0.02)
        add_box(collection, materials, lod, "MastCollar", (1.55, 1.55, 0.18), (0.0, 0.0, -4.12), mech, 0.02)

    # Recessed cyan lamp fixture — not a glowing cube.
    add_box(collection, materials, lod, "LampHood", (0.92, 0.92, 0.22), (0.0, 0.0, 9.12), mech, 0.02)
    add_box(collection, materials, lod, "LampBezel", (0.72, 0.72, 0.18), (0.0, 0.0, 8.92), mech, 0.015)
    add_cyl(collection, materials, lod, "LampGlass", 0.28, 0.16, (0.0, 0.0, 8.96), accent, vertices=12 if lod == 0 else 8)
    add_cyl(collection, materials, lod, "LampCore", 0.14, 0.10, (0.0, 0.0, 9.06), accent, vertices=12 if lod == 0 else 8)

    # Twin lattice rails (I-section chords + braces), not two black tubes.
    rail_y = 0.42
    rail_z = 2.55
    for side, y in (("P", rail_y), ("S", -rail_y)):
        add_box(collection, materials, lod, f"RailChordTop{side}", (6.6, 0.10, 0.10), (4.35, y, rail_z + 0.28), mech, 0.01)
        add_box(collection, materials, lod, f"RailChordBot{side}", (6.6, 0.10, 0.10), (4.35, y, rail_z - 0.28), mech, 0.01)
        if lod < 2:
            add_box(collection, materials, lod, f"RailWeb{side}", (6.5, 0.045, 0.42), (4.35, y, rail_z), mech, 0.008)
        posts = 6 if lod == 0 else 4 if lod == 1 else 2
        for index in range(posts):
            x = 1.35 + index * (6.0 / max(1, posts - 1))
            add_box(collection, materials, lod, f"RailPost{side}{index}", (0.08, 0.08, 0.58),
                    (x, y, rail_z), mech, 0.006)
            if lod == 0 and index < posts - 1:
                mid = x + (6.0 / max(1, posts - 1)) * 0.5
                add_box(collection, materials, lod, f"RailDiag{side}{index}", (0.90, 0.05, 0.05),
                        (mid, y, rail_z), mech, 0.004, rotation=(0.0, 0.55 if index % 2 else -0.55, 0.0))
    add_box(collection, materials, lod, "RailRootSaddle", (0.55, 1.15, 0.72), (0.85, 0.0, rail_z), hull, 0.03)
    add_box(collection, materials, lod, "RailRootGusset", (0.28, 0.95, 0.55), (0.55, 0.0, 2.05), mech, 0.02)
    # Planform deck so chase camera sees a lattice, not two tubes.
    add_box(collection, materials, lod, "RailDeck", (6.35, 0.78, 0.06), (4.35, 0.0, rail_z + 0.34), mech, 0.01)
    if lod == 0:
        for index in range(5):
            x = 1.6 + index * 1.2
            add_box(collection, materials, lod, f"RailDeckSlot{index}", (0.55, 0.42, 0.04),
                    (x, 0.0, rail_z + 0.38), hull, 0.0)
    add_box(collection, materials, lod, "RailOutboardCap", (0.28, 1.05, 0.62), (7.55, 0.0, rail_z), mech, 0.02)

    # Outbound transponder pod: formed housing + circular well.
    add_box(collection, materials, lod, "PodBody", (1.55, 1.55, 0.72), (8.25, 0.0, 2.42), hull, 0.05)
    add_box(collection, materials, lod, "PodShoulder", (0.42, 1.25, 0.55), (7.38, 0.0, 2.48), hull, 0.03)
    add_cyl(collection, materials, lod, "PodWellRim", 0.52, 0.10, (8.32, 0.0, 2.78), mech,
            rotation=(0.0, 0.0, 0.0), vertices=16 if lod == 0 else 10)
    add_cyl(collection, materials, lod, "PodWellCavity", 0.38, 0.16, (8.32, 0.0, 2.68), hull, vertices=12)
    add_cyl(collection, materials, lod, "PodWellFloor", 0.30, 0.04, (8.32, 0.0, 2.58), mech, vertices=12)
    add_cyl(collection, materials, lod, "PodOptic", 0.16, 0.05, (8.32, 0.0, 2.74), accent, vertices=12)
    if lod == 0:
        add_box(collection, materials, lod, "PodServiceLid", (0.55, 0.42, 0.06), (8.55, 0.42, 2.78), mech, 0.01)


def pod_geometry(collection, materials, lod: int) -> None:
    hull, mech, accent = "Material_Hull", "Material_Mechanical", "Material_Accent"
    # Closed ISO can, dark Hitch-family coating. Origin at the door end, +X length.
    add_box(collection, materials, lod, "Shell", (5.05, 2.88, 2.12), (2.10, 0.0, 1.06), hull, 0.045)
    add_box(collection, materials, lod, "RoofLid", (4.92, 2.72, 0.10), (2.10, 0.0, 2.16), hull, 0.02)
    # Recessed roof hatch well with rim and cavity.
    add_box(collection, materials, lod, "HatchRim", (1.72, 1.05, 0.08), (1.55, 0.0, 2.24), mech, 0.015)
    add_box(collection, materials, lod, "HatchCavity", (1.48, 0.84, 0.18), (1.55, 0.0, 2.08), hull, 0.0)
    add_box(collection, materials, lod, "HatchFloor", (1.38, 0.74, 0.05), (1.55, 0.0, 1.98), mech, 0.01)
    if lod == 0:
        add_box(collection, materials, lod, "HatchLidParked", (0.62, 0.84, 0.05), (2.55, 0.0, 2.26), mech, 0.01)

    # Side corrugation — manufactured sheet, not a smooth slab.
    rib_count = 8 if lod == 0 else 5
    for index in range(rib_count):
        x = 0.18 + index * (4.55 / max(1, rib_count - 1))
        add_box(collection, materials, lod, f"CorrugationP{index}", (0.16, 0.08, 1.85),
                (x, 1.46, 1.02), hull, 0.008)
        add_box(collection, materials, lod, f"CorrugationS{index}", (0.16, 0.08, 1.85),
                (x, -1.46, 1.02), hull, 0.008)

    # ISO corner castings + door-end locking bar.
    for x in (-0.38, 4.58):
        for y in (-1.38, 1.38):
            for z in (0.10, 2.02):
                tag_name = f"ISO_{'A' if x < 1 else 'F'}{'P' if y > 0 else 'S'}{'U' if z > 1 else 'L'}"
                add_box(collection, materials, lod, tag_name, (0.24, 0.24, 0.24), (x, y, z), mech, 0.012)
    add_box(collection, materials, lod, "DoorBar", (0.10, 2.18, 0.14), (-0.48, 0.0, 1.15), mech, 0.01)
    add_box(collection, materials, lod, "DoorLatchP", (0.08, 0.10, 1.45), (-0.48, 0.62, 1.05), mech, 0.008)
    add_box(collection, materials, lod, "DoorLatchS", (0.08, 0.10, 1.45), (-0.48, -0.62, 1.05), mech, 0.008)
    add_box(collection, materials, lod, "DoorFace", (0.08, 2.55, 1.95), (-0.42, 0.0, 1.05), hull, 0.02)
    if lod == 0:
        for index, z in enumerate((0.35, 0.75, 1.15, 1.55, 1.95)):
            add_box(collection, materials, lod, f"DoorHinge{index}", (0.07, 0.18, 0.12),
                    (-0.46, 1.18, z), mech, 0.006)

    # Waist stripe + ID plate (Accent is paint, not a lamp).
    add_box(collection, materials, lod, "StripeP", (4.70, 0.06, 0.42), (2.10, 1.47, 1.08), accent, 0.01)
    add_box(collection, materials, lod, "StripeS", (4.70, 0.06, 0.42), (2.10, -1.47, 1.08), accent, 0.01)
    add_box(collection, materials, lod, "IDPlate", (0.95, 0.06, 0.55), (3.55, 1.48, 0.62), accent, 0.01)
    if lod == 0:
        for index, x in enumerate((0.35, 1.55, 2.75, 3.95)):
            add_cyl(collection, materials, lod, f"RoofBolt{index}", 0.04, 0.05, (x, 0.55, 2.22), mech, vertices=8, bevel=0.0)


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
        "packet": "PQ-193.03",
        "campaign": "GRAPHICS_3D unit 1-2 remaster",
        "revision": "manufactured_chase_v1",
        "sourceGenerator": "tools/blender/build_pq193_03_manufactured.py",
    }
    root["spacefaceAssetJson"] = json.dumps(stamp, separators=(",", ":"))
    bpy.context.scene["spacefaceAssetJson"] = root["spacefaceAssetJson"]
    return stamp


def export_glb(path: Path, root, objects):
    path.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.object.select_all(action="DESELECT")
    exportables = [root, *objects]
    for obj in exportables:
        obj.hide_viewport = False
        obj.hide_render = False
        obj.hide_set(False)
        obj.select_set(True)
    bpy.context.view_layer.objects.active = root
    bpy.ops.export_scene.gltf(
        filepath=str(path),
        export_format="GLB",
        use_selection=True,
        export_apply=True,
        export_texcoords=True,
        export_normals=True,
        export_tangents=True,
        export_materials="EXPORT",
        export_extras=True,
        export_yup=True,
    )


def rewrite_glb_metadata(path: Path, config: dict, stamp: dict, asset_key: str) -> None:
    buf = path.read_bytes()
    json_len = struct.unpack_from("<I", buf, 12)[0]
    document = json.loads(buf[20:20 + json_len].decode("utf-8").rstrip(" \t\r\n\0"))
    extras = document.setdefault("asset", {}).setdefault("extras", {})
    extras.update({"assetId": config["asset_id"], "partId": asset_key, "spacefaceAsset": stamp})
    scene = document["scenes"][document.get("scene", 0)]
    scene.setdefault("extras", {}).update({
        "assetId": config["asset_id"], "partId": asset_key, "spacefaceAsset": stamp,
    })
    nodes = {node.get("name"): node for node in document.get("nodes", [])}
    root_node = nodes.get(config["root"])
    if root_node is None:
        raise RuntimeError(f"missing root {config['root']} in {sorted(nodes)}")
    root_node.setdefault("extras", {})["spacefaceAsset"] = stamp
    if "COLLISION_HULL" in nodes:
        collision = nodes["COLLISION_HULL"]
        collision.pop("mesh", None)
        collision["translation"] = list(config["collision_translation_gltf"])
        collision.pop("rotation", None)
        collision.pop("scale", None)
        collision["extras"] = {
            "spaceface": {
                "collision": True, "helper": True, "nonRender": True, "role": "collision",
                "bounds": config["collision_node_bounds"], "lod": "lod0", "chamfered": True, "bevelRadiusM": 0.05,
            },
            "sf_collision": True, "sf_non_render": True, "bounds": config["collision_node_bounds"],
            "collision": True, "nonRender": True,
        }
    if "SOCKET_Structure_Core" in nodes:
        socket = nodes["SOCKET_Structure_Core"]
        socket.pop("translation", None)
        socket.pop("rotation", None)
        socket.pop("scale", None)
        socket["extras"] = {
            "spaceface": {"socket": True, "role": "structure", "forward": [1, 0, 0]},
            "spaceface.socket": True, "role": "structure", "forward": [1, 0, 0],
        }
    if "MOUNT_Child" in nodes:
        mount = nodes["MOUNT_Child"]
        mount["translation"] = list(config["mount_translation_gltf"])
        mount["extras"] = {"role": "stack", "forward": [1, 0, 0], "spacefaceMount": True}
    json_payload = json.dumps(document, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
    json_payload += b" " * ((4 - len(json_payload) % 4) % 4)
    bin_start = 20 + json_len
    rest = buf[bin_start:]
    body = struct.pack("<II", len(json_payload), 0x4E4F534A) + json_payload + rest
    path.write_bytes(b"glTF" + struct.pack("<II", 2, 12 + len(body)) + body)


def build(asset_key: str, output: Path) -> dict:
    config = ASSETS[asset_key]
    texture_files = create_texture_files(asset_key, config)
    reset_scene()
    scene = bpy.context.scene
    scene.unit_settings.system = "METRIC"
    scene.unit_settings.scale_length = 1.0
    collection = ensure_collection(f"PQ19303_{asset_key}")
    materials = create_materials(config, texture_files)

    root = bpy.data.objects.new(config["root"], None)
    root.empty_display_type = "CUBE"
    root.empty_display_size = 0.6
    collection.objects.link(root)
    root["spaceface.assetId"] = config["asset_id"]
    root["spaceface.partId"] = asset_key

    lods = (0, 1, 2) if config["lods"] else (0,)
    builder = beacon_geometry if config["build"] == "beacon" else pod_geometry
    for lod in lods:
        builder(collection, materials, lod)

    groups = []
    for lod in lods:
        groups.extend(join_draw_groups(collection, materials, lod, root, config))

    helpers = []
    if config["build"] == "beacon":
        helpers.append(make_empty(
            collection, root, "SOCKET_Structure_Core", (0.0, 0.0, 0.0),
            {"spaceface": {"socket": True, "role": "structure", "forward": [1, 0, 0]},
             "spaceface.socket": True, "role": "structure", "forward": [1, 0, 0]},
        ))
        helpers.append(make_empty(
            collection, root, "COLLISION_HULL", blender_from_gltf(config["collision_translation_gltf"]),
            {"spaceface": {"collision": True, "helper": True, "nonRender": True, "role": "collision",
                           "bounds": config["collision_node_bounds"], "lod": "lod0", "chamfered": True},
             "sf_collision": True, "sf_non_render": True, "collision": True, "nonRender": True,
             "bounds": config["collision_node_bounds"]},
            display="CUBE", size=0.8,
        ))
    else:
        helpers.append(make_empty(
            collection, root, "MOUNT_Child", blender_from_gltf(config["mount_translation_gltf"]),
            {"role": "stack", "forward": [1, 0, 0], "spacefaceMount": True},
        ))

    stamp = stamp_root(root, config, asset_key)
    bpy.context.view_layer.update()
    export_glb(output, root, groups + helpers)
    rewrite_glb_metadata(output, config, stamp, asset_key)
    report = {
        "asset": asset_key,
        "output": str(output),
        "bytes": output.stat().st_size,
        "groups": [obj.name for obj in groups],
        "helpers": [obj.name for obj in helpers],
    }
    report_path = output.with_suffix(".report.json")
    report_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    return report


def main():
    args = parse_args(sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else [])
    report = build(args.asset, args.output.resolve())
    print("PQ193_03_BUILD", json.dumps(report))


if __name__ == "__main__":
    main()

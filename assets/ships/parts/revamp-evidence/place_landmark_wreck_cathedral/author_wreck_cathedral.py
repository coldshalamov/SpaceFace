#!/usr/bin/env python3
"""Author the PQ-018 Wreck Cathedral SOURCE_GLB candidate in Blender 5.1.

The construction is deterministic and structural: armor follows hull frames, damage follows the
catastrophic break behind the bridge, and exposed machinery occupies service/propulsion zones.
Runtime registration, placement, release promotion, and interaction wiring are intentionally absent.
"""
from __future__ import annotations

import importlib.util
import json
import math
import os
import re
import struct
import sys
import time
import zlib
from hashlib import sha256
from pathlib import Path
from typing import Any, Iterable

import bpy
from mathutils import Euler, Matrix, Vector
from mathutils.bvhtree import BVHTree


ASSET_ID = "place_landmark_wreck_cathedral"
ASSET_CONTRACT_ID = "SF_LANDMARK_PLACE_LANDMARK_WRECK_CATHEDRAL"
PACKET = "PQ-018"
SUBSLICE = "source_asset"
ROOT = Path(__file__).resolve().parents[5]
EVIDENCE = ROOT / "assets" / "ships" / "parts" / "revamp-evidence" / ASSET_ID
TEXTURES = EVIDENCE / "textures"
REPORTS = EVIDENCE / "reports"
BLEND = ROOT / "assets" / "ships" / "parts" / "blender" / f"{ASSET_ID}.blend"
GLB = ROOT / "assets" / "ships" / "parts" / "places" / f"{ASSET_ID}.glb"
EXPORTER = ROOT / "tools" / "blender" / "spaceface_export.py"
BUILD_SEED = 18072026
REBUILD_TEXTURES = "--rebuild-textures" in sys.argv

MATERIAL_SPECS: dict[str, dict[str, Any]] = {
    "Material_Hull_ConcordGray": {
        "role": "hull", "paletteTint": "none", "base": (0.235, 0.255, 0.275),
        "rough": 0.61, "metal": 0.72, "pattern": "panel", "size": 512,
    },
    "Material_Armor_Scorched": {
        "role": "heat_affected_alloy", "paletteTint": "none", "base": (0.105, 0.112, 0.120),
        "rough": 0.76, "metal": 0.66, "pattern": "scorch", "size": 512,
    },
    "Material_Accent_ConcordBlue_Burned": {
        "role": "maintenance_mark", "paletteTint": "none", "base": (0.035, 0.125, 0.315),
        "rough": 0.67, "metal": 0.34, "pattern": "burned_paint", "size": 512,
    },
    "Material_Mechanical_Exposed": {
        "role": "mechanical", "paletteTint": "none", "base": (0.075, 0.083, 0.092),
        "rough": 0.50, "metal": 0.90, "pattern": "machinery", "size": 512,
    },
    "Material_Interior_ExposedAlloy": {
        "role": "exposed_alloy", "paletteTint": "none", "base": (0.255, 0.225, 0.190),
        "rough": 0.54, "metal": 0.82, "pattern": "brushed", "size": 512,
    },
    "Material_Conduit_Copper": {
        "role": "copper_coil", "paletteTint": "none", "base": (0.315, 0.115, 0.035),
        "rough": 0.43, "metal": 0.91, "pattern": "conduit", "size": 512,
    },
    "Material_Emissive_ColdEmergency": {
        "role": "signal", "paletteTint": "none", "base": (0.018, 0.105, 0.155),
        "rough": 0.28, "metal": 0.28, "pattern": "lamp", "size": 256,
        "emission": (0.10, 0.62, 0.92), "emissionStrength": 3.0,
    },
    "Material_Emissive_MarkerAmber": {
        "role": "warning", "paletteTint": "none", "base": (0.205, 0.055, 0.004),
        "rough": 0.24, "metal": 0.24, "pattern": "marker", "size": 256,
        "emission": (1.0, 0.245, 0.008), "emissionStrength": 7.5,
    },
}

ROLE_TOKEN = {
    "Material_Hull_ConcordGray": "Hull",
    "Material_Armor_Scorched": "ArmorScorched",
    "Material_Accent_ConcordBlue_Burned": "AccentConcordBlueBurned",
    "Material_Mechanical_Exposed": "MechanicalExposed",
    "Material_Interior_ExposedAlloy": "InteriorExposedAlloy",
    "Material_Conduit_Copper": "ConduitCopper",
    "Material_Emissive_ColdEmergency": "EmissiveColdEmergency",
    "Material_Emissive_MarkerAmber": "EmissiveMarkerAmber",
}


def log(message: str) -> None:
    print(f"[wreck-cathedral] {message}", flush=True)


def rel(path: Path) -> str:
    return str(path.relative_to(ROOT)).replace("\\", "/")


def sha256_file(path: Path) -> str:
    digest = sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def stable_role_seed(role: str) -> int:
    return sum((index + 1) * ord(char) for index, char in enumerate(role)) + BUILD_SEED


def hash01(x: int, y: int, seed: int) -> float:
    value = (x * 374761393 + y * 668265263 + seed * 2246822519) & 0xFFFFFFFF
    value = (value ^ (value >> 13)) * 1274126177 & 0xFFFFFFFF
    return ((value ^ (value >> 16)) & 0xFFFF) / 65535.0


def reset_scene() -> None:
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for collection in list(bpy.data.collections):
        if collection != bpy.context.scene.collection:
            bpy.data.collections.remove(collection)
    for datablocks in (bpy.data.meshes, bpy.data.curves, bpy.data.materials, bpy.data.images,
                       bpy.data.cameras, bpy.data.lights):
        for item in list(datablocks):
            try:
                datablocks.remove(item)
            except Exception:
                pass


def new_collection(name: str) -> bpy.types.Collection:
    collection = bpy.data.collections.new(name)
    bpy.context.scene.collection.children.link(collection)
    return collection


def move_to_collection(obj: bpy.types.Object, collection: bpy.types.Collection) -> None:
    for current in list(obj.users_collection):
        current.objects.unlink(obj)
    collection.objects.link(obj)


def select_only(obj: bpy.types.Object) -> None:
    if bpy.context.object and bpy.context.object.mode != "OBJECT":
        bpy.ops.object.mode_set(mode="OBJECT")
    bpy.ops.object.select_all(action="DESELECT")
    obj.hide_set(False)
    obj.hide_viewport = False
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj


def transform_matrix(location=(0.0, 0.0, 0.0), rotation=(0.0, 0.0, 0.0)) -> Matrix:
    return Matrix.Translation(Vector(location)) @ Euler(rotation, "XYZ").to_matrix().to_4x4()


FORE = transform_matrix((30.0, 12.0, 10.0), (math.radians(3.0), math.radians(-1.2), math.radians(7.0)))
AFT = transform_matrix((-25.0, -18.0, -8.0), (math.radians(-4.5), math.radians(1.8), math.radians(-11.0)))
IDENTITY = Matrix.Identity(4)


def point(matrix: Matrix, xyz: Iterable[float]) -> Vector:
    return matrix @ Vector(tuple(xyz))


def matrix_for(matrix: Matrix, location, rotation=(0.0, 0.0, 0.0)) -> Matrix:
    return matrix @ transform_matrix(location, rotation)


def set_object_matrix(obj: bpy.types.Object, matrix: Matrix, scale=(1.0, 1.0, 1.0)) -> None:
    loc, rotation, inherited_scale = matrix.decompose()
    obj.location = loc
    obj.rotation_mode = "QUATERNION"
    obj.rotation_quaternion = rotation
    obj.scale = tuple(float(scale[index]) * float(inherited_scale[index]) for index in range(3))
    select_only(obj)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.rotation_mode = "XYZ"


def tag(obj: bpy.types.Object, lod: int, material_name: str, structure_role: str,
        damage_history: str = "constructed_then_broken") -> None:
    semantic = {
        "lod": f"lod{lod}",
        "lodLevel": lod,
        "materialRole": MATERIAL_SPECS[material_name]["role"],
        "structureRole": structure_role,
        "damageHistory": damage_history,
        "chamfered": True,
    }
    obj["spaceface"] = semantic
    obj["spaceface.lod"] = f"lod{lod}"
    obj["spaceface.lodLevel"] = lod
    obj["spaceface.materialRole"] = material_name
    obj["spaceface.structureRole"] = structure_role
    obj["spaceface.damageHistory"] = damage_history
    obj["spaceface_chamfered"] = True


def apply_bevel_and_normals(obj: bpy.types.Object, width: float, lod: int) -> None:
    if obj.type != "MESH" or width <= 0:
        return
    bevel = obj.modifiers.new("WC_PhysicalEdge", "BEVEL")
    bevel.width = max(0.035, width * (1.0 if lod == 0 else 0.68 if lod == 1 else 0.40))
    bevel.segments = 3 if lod == 0 else 2 if lod == 1 else 1
    bevel.limit_method = "ANGLE"
    bevel.angle_limit = math.radians(28.0)
    if hasattr(bevel, "harden_normals"):
        bevel.harden_normals = True
    try:
        normal = obj.modifiers.new("WC_WeightedNormal", "WEIGHTED_NORMAL")
        if hasattr(normal, "keep_sharp"):
            normal.keep_sharp = True
        if hasattr(normal, "weight"):
            normal.weight = 50
    except Exception:
        pass


def material_for(obj: bpy.types.Object, material: bpy.types.Material) -> None:
    obj.data.materials.clear()
    obj.data.materials.append(material)


def make_box(collection: bpy.types.Collection, materials: dict[str, bpy.types.Material], lod: int,
             name: str, size, location, material_name: str, structure_role: str,
             matrix: Matrix = IDENTITY, rotation=(0.0, 0.0, 0.0), bevel=0.35,
             damage_history="constructed_then_broken") -> bpy.types.Object:
    bpy.ops.mesh.primitive_cube_add(size=1.0)
    obj = bpy.context.object
    obj.name = f"LOD{lod}_{name}"
    set_object_matrix(obj, matrix_for(matrix, location, rotation), tuple(float(v) for v in size))
    move_to_collection(obj, collection)
    material_for(obj, materials[material_name])
    tag(obj, lod, material_name, structure_role, damage_history)
    apply_bevel_and_normals(obj, bevel, lod)
    return obj


def make_wedge(collection: bpy.types.Collection, materials: dict[str, bpy.types.Material], lod: int,
               name: str, length: float, width: float, height: float, location,
               material_name: str, structure_role: str, matrix: Matrix = IDENTITY,
               rotation=(0.0, 0.0, 0.0), bevel=0.45,
               damage_history: str | None = None) -> bpy.types.Object:
    lx, wy, hz = length * 0.5, width * 0.5, height * 0.5
    verts = [
        (-lx, -wy, -hz), (-lx, wy, -hz), (-lx, -wy, hz), (-lx, wy, hz),
        (lx, -wy * 0.58, -hz * 0.70), (lx, wy * 0.58, -hz * 0.70),
        (lx, -wy * 0.38, hz * 0.45), (lx, wy * 0.38, hz * 0.45),
    ]
    faces = [(0, 4, 5, 1), (2, 3, 7, 6), (0, 2, 6, 4), (1, 5, 7, 3),
             (0, 1, 3, 2), (4, 6, 7, 5)]
    mesh = bpy.data.meshes.new(f"{name}_Mesh")
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(f"LOD{lod}_{name}", mesh)
    collection.objects.link(obj)
    obj.matrix_world = matrix_for(matrix, location, rotation)
    material_for(obj, materials[material_name])
    tag(obj, lod, material_name, structure_role, damage_history)
    apply_bevel_and_normals(obj, bevel, lod)
    return obj


def make_cylinder(collection: bpy.types.Collection, materials: dict[str, bpy.types.Material], lod: int,
                  name: str, radius: float, depth: float, location, material_name: str,
                  structure_role: str, matrix: Matrix = IDENTITY, vertices: int | None = None,
                  rotation=(0.0, 0.0, 0.0), bevel=0.16) -> bpy.types.Object:
    vertices = vertices or (40 if lod == 0 else 24 if lod == 1 else 12)
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth)
    obj = bpy.context.object
    obj.name = f"LOD{lod}_{name}"
    set_object_matrix(obj, matrix_for(matrix, location, rotation))
    move_to_collection(obj, collection)
    material_for(obj, materials[material_name])
    tag(obj, lod, material_name, structure_role)
    apply_bevel_and_normals(obj, min(bevel, radius * 0.18, depth * 0.08), lod)
    return obj


def make_torus(collection: bpy.types.Collection, materials: dict[str, bpy.types.Material], lod: int,
               name: str, major: float, minor: float, location, material_name: str,
               structure_role: str, matrix: Matrix = IDENTITY, rotation=(0.0, 0.0, 0.0),
               segments: int | None = None) -> bpy.types.Object:
    major_segments = segments or (64 if lod == 0 else 40 if lod == 1 else 20)
    minor_segments = 14 if lod == 0 else 9 if lod == 1 else 6
    bpy.ops.mesh.primitive_torus_add(major_radius=major, minor_radius=minor,
                                    major_segments=major_segments, minor_segments=minor_segments)
    obj = bpy.context.object
    obj.name = f"LOD{lod}_{name}"
    set_object_matrix(obj, matrix_for(matrix, location, rotation))
    move_to_collection(obj, collection)
    material_for(obj, materials[material_name])
    tag(obj, lod, material_name, structure_role)
    return obj


def make_sphere(collection: bpy.types.Collection, materials: dict[str, bpy.types.Material], lod: int,
                name: str, radius: float, location, material_name: str, structure_role: str,
                matrix: Matrix = IDENTITY, scale=(1.0, 1.0, 1.0)) -> bpy.types.Object:
    segments = 48 if lod == 0 else 28 if lod == 1 else 16
    rings = 24 if lod == 0 else 14 if lod == 1 else 8
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments, ring_count=rings, radius=radius)
    obj = bpy.context.object
    obj.name = f"LOD{lod}_{name}"
    set_object_matrix(obj, matrix_for(matrix, location), scale)
    move_to_collection(obj, collection)
    material_for(obj, materials[material_name])
    tag(obj, lod, material_name, structure_role)
    return obj


def make_beam(collection: bpy.types.Collection, materials: dict[str, bpy.types.Material], lod: int,
              name: str, start, end, width: float, material_name: str, structure_role: str,
              matrix: Matrix = IDENTITY, bevel=0.20, damage_history: str | None = None) -> bpy.types.Object:
    a, b = point(matrix, start), point(matrix, end)
    delta = b - a
    midpoint = (a + b) * 0.5
    bpy.ops.mesh.primitive_cube_add(size=1.0)
    obj = bpy.context.object
    obj.name = f"LOD{lod}_{name}"
    obj.location = midpoint
    obj.rotation_mode = "QUATERNION"
    obj.rotation_quaternion = delta.to_track_quat("X", "Z")
    obj.scale = (delta.length, width, width)
    select_only(obj)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.rotation_mode = "XYZ"
    move_to_collection(obj, collection)
    material_for(obj, materials[material_name])
    tag(obj, lod, material_name, structure_role, damage_history)
    apply_bevel_and_normals(obj, bevel, lod)
    return obj


def make_curve_tube(collection: bpy.types.Collection, materials: dict[str, bpy.types.Material], lod: int,
                    name: str, points_local, radius: float, material_name: str,
                    structure_role: str, matrix: Matrix = IDENTITY) -> bpy.types.Object:
    curve_data = bpy.data.curves.new(f"{name}_Curve", "CURVE")
    curve_data.dimensions = "3D"
    curve_data.resolution_u = 2 if lod == 0 else 1
    curve_data.bevel_depth = radius
    curve_data.bevel_resolution = 3 if lod == 0 else 1
    spline = curve_data.splines.new("BEZIER")
    spline.bezier_points.add(len(points_local) - 1)
    for control, local in zip(spline.bezier_points, points_local):
        control.co = point(matrix, local)
        control.handle_left_type = "AUTO"
        control.handle_right_type = "AUTO"
    obj = bpy.data.objects.new(f"LOD{lod}_{name}", curve_data)
    collection.objects.link(obj)
    obj.data.materials.append(materials[material_name])
    tag(obj, lod, material_name, structure_role)
    return obj


def make_frustum_shell(collection: bpy.types.Collection, materials: dict[str, bpy.types.Material], lod: int,
                       name: str, x_center: float, y_center: float, z_center: float,
                       length: float, rear_radius: float, front_radius: float,
                       material_name: str, structure_role: str, matrix: Matrix = IDENTITY,
                       damaged=False, cant=(0.0, 0.0, 0.0)) -> bpy.types.Object:
    segments = 28 if lod == 0 else 18 if lod == 1 else 10
    omit = {2, 3, 4} if damaged and lod < 2 else ({2} if damaged else set())
    verts: list[tuple[float, float, float]] = []
    for ring_x, radius in ((-length * 0.5, rear_radius), (length * 0.5, front_radius)):
        for index in range(segments):
            angle = math.tau * index / segments
            verts.append((ring_x, math.cos(angle) * radius, math.sin(angle) * radius))
    faces = []
    for index in range(segments):
        if index in omit:
            continue
        next_index = (index + 1) % segments
        if next_index in omit and damaged:
            continue
        faces.append((index, next_index, segments + next_index, segments + index))
    mesh = bpy.data.meshes.new(f"{name}_Mesh")
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(f"LOD{lod}_{name}", mesh)
    collection.objects.link(obj)
    obj.matrix_world = matrix_for(matrix, (x_center, y_center, z_center), cant)
    material_for(obj, materials[material_name])
    tag(obj, lod, material_name, structure_role,
        "impact_torn_engine_bell" if damaged else "propulsion_zone_heat_damage")
    apply_bevel_and_normals(obj, 0.18, lod)
    return obj


def write_png_rgba8(path: Path, size: int, pixels: bytearray) -> None:
    """Write a deterministic, color-management-neutral RGBA8 PNG.

    Blender 5.1 can silently preserve the blank allocation when a large generated byte image is
    saved from Python. Writing the authored byte buffer directly also guarantees that normal/ORM
    channels are not altered by a display transform before the image is packed into the BLEND.
    """
    stride = size * 4
    scanlines = b"".join(
        b"\x00" + bytes(pixels[offset:offset + stride])
        for offset in range(0, len(pixels), stride)
    )

    def chunk(kind: bytes, payload: bytes) -> bytes:
        body = kind + payload
        return struct.pack(">I", len(payload)) + body + struct.pack(">I", zlib.crc32(body) & 0xFFFFFFFF)

    png = (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0))
        + chunk(b"IDAT", zlib.compress(scanlines, level=9))
        + chunk(b"IEND", b"")
    )
    path.write_bytes(png)


def write_texture_image(name: str, spec: dict[str, Any], channel: str) -> tuple[bpy.types.Image, Path]:
    size = int(spec["size"])
    path = TEXTURES / f"{name}_{channel}.png"
    image_name = f"WC_{name}_{channel}"
    if path.exists() and not REBUILD_TEXTURES:
        image = bpy.data.images.load(str(path), check_existing=False)
        image.name = image_name
        image.colorspace_settings.name = "sRGB" if channel in {"basecolor", "emissive"} else "Non-Color"
        image.pack()
        return image, path
    existing = bpy.data.images.get(image_name)
    if existing:
        bpy.data.images.remove(existing)
    seed = stable_role_seed(name)
    base = spec["base"]
    roughness = float(spec["rough"])
    metallic = float(spec["metal"])
    pattern = str(spec["pattern"])
    pixels = bytearray()
    panel = max(24, size // 8)
    fine = max(8, size // 32)
    for y in range(size):
        for x in range(size):
            noise = hash01(x, y, seed)
            broad = hash01(x // 7, y // 7, seed + 91)
            seam_x = x % panel
            seam_y = y % panel
            seam = seam_x <= 1 or seam_y <= 1
            fastener = ((x - panel // 7) % panel <= 2 and (y - panel // 7) % panel <= 2)
            burn = math.sin((x * 0.037) + (y * 0.021) + seed) * math.cos((x - y) * 0.016)
            burned = burn > 0.74 or (pattern == "scorch" and burn > 0.38)
            brush = math.sin(x * 0.42 + y * 0.035) * 0.5 + 0.5
            cable = (x % fine) < max(2, fine // 4)
            if channel == "basecolor":
                wear = (noise - 0.5) * 0.055 + (broad - 0.5) * 0.025
                if seam:
                    wear -= 0.075
                if fastener:
                    wear += 0.09
                if burned and pattern in {"scorch", "burned_paint"}:
                    factor = 0.18 if pattern == "burned_paint" else 0.34
                    rgb = tuple(max(0.003, value * factor + wear * 0.15) for value in base)
                elif pattern == "conduit" and cable:
                    rgb = (base[0] * 1.18, base[1] * 1.08, base[2] * 0.82)
                else:
                    rgb = tuple(max(0.003, min(1.0, value + wear)) for value in base)
            elif channel == "normal":
                sx = -0.13 if seam_x == 0 else 0.13 if seam_x == 1 else (noise - 0.5) * 0.026
                sy = -0.13 if seam_y == 0 else 0.13 if seam_y == 1 else (brush - 0.5) * 0.022
                if pattern == "brushed":
                    sx += (brush - 0.5) * 0.075
                if pattern == "conduit" and cable:
                    sy += 0.075
                rgb = (0.5 + sx, 0.5 + sy, 0.91 if seam else 0.985)
            elif channel == "orm":
                ao = 0.62 if seam else 0.78 if fastener else 0.92 - noise * 0.055
                local_rough = roughness + (0.14 if seam else 0.0) + (broad - 0.5) * 0.11
                if burned:
                    local_rough += 0.10
                local_metal = metallic - (0.22 if pattern == "burned_paint" and not burned else 0.0)
                rgb = (ao, max(0.04, min(0.98, local_rough)), max(0.0, min(1.0, local_metal)))
            elif channel == "emissive":
                emit = spec.get("emission", (0.0, 0.0, 0.0))
                aperture = (x % panel) > panel * 0.18 and (x % panel) < panel * 0.82
                aperture = aperture and (y % fine) > fine * 0.18
                strength = 1.0 if aperture else 0.16
                rgb = tuple(value * strength for value in emit)
            else:
                raise ValueError(channel)
            pixels.extend(max(0, min(255, round(float(value) * 255.0))) for value in rgb)
            pixels.append(255)
    write_png_rgba8(path, size, pixels)
    image = bpy.data.images.load(str(path), check_existing=False)
    image.name = image_name
    image.colorspace_settings.name = "sRGB" if channel in {"basecolor", "emissive"} else "Non-Color"
    image.pack()
    return image, path


def ensure_gltf_occlusion_group() -> bpy.types.NodeTree:
    group = bpy.data.node_groups.get("glTF Material Output")
    if group is None:
        group = bpy.data.node_groups.new("glTF Material Output", "ShaderNodeTree")
    has_occlusion = any(item.name == "Occlusion" for item in group.interface.items_tree)
    if not has_occlusion:
        group.interface.new_socket(name="Occlusion", in_out="INPUT", socket_type="NodeSocketFloat")
    return group


def create_materials() -> tuple[dict[str, bpy.types.Material], dict[str, dict[str, str]]]:
    materials: dict[str, bpy.types.Material] = {}
    texture_paths: dict[str, dict[str, str]] = {}
    gltf_output_group = ensure_gltf_occlusion_group()
    for name, spec in MATERIAL_SPECS.items():
        channels = ["basecolor", "normal", "orm"]
        if spec.get("emission"):
            channels.append("emissive")
        images: dict[str, bpy.types.Image] = {}
        texture_paths[name] = {}
        for channel in channels:
            image, path = write_texture_image(name, spec, channel)
            images[channel] = image
            texture_paths[name][channel] = rel(path)

        material = bpy.data.materials.new(name)
        material.use_nodes = True
        material.diffuse_color = (*spec["base"], 1.0)
        material["spacefaceMaterialRole"] = spec["role"]
        material["spacefacePaletteTint"] = spec["paletteTint"]
        material["spacefaceSourceAsset"] = ASSET_ID
        material["spacefaceSurfaceIntent"] = spec["pattern"]
        nodes = material.node_tree.nodes
        links = material.node_tree.links
        nodes.clear()
        output = nodes.new("ShaderNodeOutputMaterial")
        output.location = (560, 0)
        bsdf = nodes.new("ShaderNodeBsdfPrincipled")
        bsdf.location = (270, 0)
        links.new(bsdf.outputs["BSDF"], output.inputs["Surface"])

        base_tex = nodes.new("ShaderNodeTexImage")
        base_tex.name = f"{name}_BaseColor"
        base_tex.label = "Base Color"
        base_tex.image = images["basecolor"]
        base_tex.location = (-620, 260)
        links.new(base_tex.outputs["Color"], bsdf.inputs["Base Color"])

        orm_tex = nodes.new("ShaderNodeTexImage")
        # The repository export gate recognizes packed occlusion by an explicit AO token while the
        # glTF exporter recognizes the red-channel link into "glTF Material Output" below.
        orm_tex.name = f"{name}_AO_Roughness_Metallic"
        orm_tex.label = "AO Roughness Metallic"
        orm_tex.image = images["orm"]
        orm_tex.location = (-620, -20)
        separate = nodes.new("ShaderNodeSeparateColor")
        separate.location = (-340, -20)
        links.new(orm_tex.outputs["Color"], separate.inputs["Color"])
        links.new(separate.outputs["Green"], bsdf.inputs["Roughness"])
        links.new(separate.outputs["Blue"], bsdf.inputs["Metallic"])
        gltf_group = nodes.new("ShaderNodeGroup")
        gltf_group.node_tree = gltf_output_group
        gltf_group.location = (20, -260)
        links.new(separate.outputs["Red"], gltf_group.inputs["Occlusion"])

        normal_tex = nodes.new("ShaderNodeTexImage")
        normal_tex.name = f"{name}_Normal"
        normal_tex.label = "OpenGL Normal"
        normal_tex.image = images["normal"]
        normal_tex.location = (-620, -340)
        normal_map = nodes.new("ShaderNodeNormalMap")
        normal_map.space = "TANGENT"
        normal_map.inputs["Strength"].default_value = 0.68 if spec["pattern"] != "lamp" else 0.30
        normal_map.location = (-300, -340)
        links.new(normal_tex.outputs["Color"], normal_map.inputs["Color"])
        links.new(normal_map.outputs["Normal"], bsdf.inputs["Normal"])

        if spec.get("emission"):
            emissive_tex = nodes.new("ShaderNodeTexImage")
            emissive_tex.name = f"{name}_Emissive"
            emissive_tex.label = "Emissive Mask"
            emissive_tex.image = images["emissive"]
            emissive_tex.location = (-620, 500)
            links.new(emissive_tex.outputs["Color"], bsdf.inputs["Emission Color"])
            bsdf.inputs["Emission Strength"].default_value = float(spec["emissionStrength"])
        materials[name] = material
    return materials, texture_paths


def build_hull_mass(collection, materials, lod: int) -> None:
    # Both hull banks preserve a 72 m-wide, 58 m-high navigable central channel.
    fore_centers = [28, 76, 124, 172, 216]
    aft_centers = [-28, -76, -124, -172]
    for side in (-1, 1):
        for index, x in enumerate(fore_centers):
            outer = 58 + index * 2.4
            make_box(collection, materials, lod, f"ForeHull_{'P' if side < 0 else 'S'}_{index}",
                     (46, 19, 34), (x, side * outer, 7 + (index % 2) * 4),
                     "Material_Hull_ConcordGray", "layered_exterior_hull", FORE,
                     rotation=(math.radians(side * 0.8), math.radians(-2.0 + index * 0.3),
                               math.radians(side * (1.5 + index * 0.35))), bevel=0.72)
            make_box(collection, materials, lod, f"ForeArmor_{'P' if side < 0 else 'S'}_{index}",
                     (34 if index < 4 else 25, 4.0, 22),
                     (x + 2, side * (outer + 11.0), 14 + (index % 2) * 5),
                     "Material_Armor_Scorched", "outer_armor_layer", FORE,
                     rotation=(0, math.radians(-3 + index), math.radians(side * 2.0)), bevel=0.38)
            if index in ({0, 2, 4} if side < 0 else {1, 3, 4}):
                make_box(collection, materials, lod,
                         f"ConcordStripeFore_{'P' if side < 0 else 'S'}_{index}",
                         (22 if index < 4 else 16, 1.2, 5.5),
                         (x + 4, side * (outer + 13.1), 25 + (index % 2) * 4),
                         "Material_Accent_ConcordBlue_Burned", "partially_burned_identification_stripe",
                         FORE, rotation=(0, math.radians(-3 + index), math.radians(side * 2.0)), bevel=0.14,
                         damage_history="paint_burned_away_at_break_and_impact_faces")
        for index, x in enumerate(aft_centers):
            outer = 61 + index * 3.5
            make_box(collection, materials, lod, f"AftHull_{'P' if side < 0 else 'S'}_{index}",
                     (47, 21, 36), (x, side * outer, -1 - (index % 2) * 3),
                     "Material_Hull_ConcordGray", "layered_exterior_hull", AFT,
                     rotation=(math.radians(side * -1.2), math.radians(1.0 - index * 0.4),
                               math.radians(side * (2.0 + index * 0.55))), bevel=0.78)
            make_box(collection, materials, lod, f"AftArmor_{'P' if side < 0 else 'S'}_{index}",
                     (36, 4.2, 23), (x - 2, side * (outer + 12), 7 - (index % 2) * 3),
                     "Material_Armor_Scorched", "outer_armor_layer", AFT,
                     rotation=(0, math.radians(2 - index), math.radians(side * -2.6)), bevel=0.42)
            if index in ({1, 3} if side < 0 else {0, 2}):
                make_box(collection, materials, lod,
                         f"ConcordStripeAft_{'P' if side < 0 else 'S'}_{index}",
                         (20, 1.2, 5.5), (x - 4, side * (outer + 14.1), 18 - (index % 2) * 3),
                         "Material_Accent_ConcordBlue_Burned", "partially_burned_identification_stripe",
                         AFT, rotation=(0, math.radians(2 - index), math.radians(side * -2.6)), bevel=0.14,
                         damage_history="paint_burned_away_at_break_and_engine_fire")

        # Shoulder and lower-rail layers make the cruiser read as constructed around decks.
        for matrix, prefix, x_center, length, y, z in (
            (FORE, "Fore", 125, 205, side * 47, 46),
            (AFT, "Aft", -103, 178, side * 49, 39),
            (FORE, "ForeLower", 122, 200, side * 47, -31),
            (AFT, "AftLower", -102, 176, side * 50, -34),
        ):
            make_box(collection, materials, lod, f"{prefix}LongitudinalRail_{'P' if side < 0 else 'S'}",
                     (length, 9.0, 9.0), (x_center, y, z), "Material_Mechanical_Exposed",
                     "longitudinal_frame_rail", matrix, bevel=0.46)

    # Broken keel and upper spine stop on either side of the catastrophic break.
    make_box(collection, materials, lod, "ForeKeel", (206, 15, 15), (128, 0, -51),
             "Material_Mechanical_Exposed", "broken_keel_fore", FORE, bevel=0.58,
             damage_history="keel_shear_terminates_at_catastrophic_break")
    make_box(collection, materials, lod, "AftKeel", (174, 16, 16), (-106, 0, -54),
             "Material_Mechanical_Exposed", "broken_keel_aft", AFT, bevel=0.60,
             damage_history="keel_shear_terminates_at_catastrophic_break")
    make_box(collection, materials, lod, "ForeUpperSpine", (167, 14, 13), (140, 0, 61),
             "Material_Hull_ConcordGray", "upper_superstructure_spine", FORE, bevel=0.62)
    make_box(collection, materials, lod, "AftUpperSpine", (142, 15, 14), (-112, 0, 55),
             "Material_Armor_Scorched", "upper_superstructure_spine", AFT, bevel=0.62)

    # Two pointed bow cheeks retain the Concord cruiser silhouette without closing the hangar axis.
    make_wedge(collection, materials, lod, "BowPort", 72, 54, 55, (246, -69, 8),
               "Material_Hull_ConcordGray", "recognizable_cruiser_bow", FORE,
               rotation=(0, math.radians(-3), math.radians(-3)), bevel=0.80)
    make_wedge(collection, materials, lod, "BowStarboard", 72, 54, 55, (246, 69, 8),
               "Material_Hull_ConcordGray", "recognizable_cruiser_bow", FORE,
               rotation=(0, math.radians(-3), math.radians(3)), bevel=0.80)


def build_ribcage_and_hangar(collection, materials, lod: int) -> None:
    rib_x = (-150, -112, -74, -36, 18, 58, 98, 138, 178)
    if lod == 1:
        rib_x = (-150, -100, -50, 18, 72, 126, 178)
    elif lod == 2:
        rib_x = (-150, -82, 18, 96, 170)
    for index, x in enumerate(rib_x):
        matrix = AFT if x < 0 else FORE
        side_scale = 1.0 + abs(x) / 1200.0
        for side in (-1, 1):
            prefix = "P" if side < 0 else "S"
            # The frame rises outboard then folds inward, like opened cruiser ribs.
            make_beam(collection, materials, lod, f"Rib_{index}_{prefix}_Lower",
                      (x, side * 42, -29), (x, side * 69 * side_scale, 18), 5.2,
                      "Material_Interior_ExposedAlloy", "exposed_hangar_frame", matrix, bevel=0.34)
            make_beam(collection, materials, lod, f"Rib_{index}_{prefix}_Upper",
                      (x, side * 69 * side_scale, 18), (x, side * 40, 60), 4.7,
                      "Material_Mechanical_Exposed", "exposed_hangar_frame", matrix, bevel=0.32)
            make_box(collection, materials, lod, f"RibFoot_{index}_{prefix}", (8, 12, 7),
                     (x, side * 42, -30), "Material_Armor_Scorched", "rib_deck_joint", matrix,
                     rotation=(0, 0, math.radians(side * 2.2)), bevel=0.32)

    # Decks are layered ledges on the cavity walls; none intrudes into the fly-through envelope.
    deck_segments = ((-128, 168, AFT), (104, 168, FORE))
    for side in (-1, 1):
        for level, z in enumerate((-23, 2, 27)):
            for segment_index, (x_center, length, matrix) in enumerate(deck_segments):
                make_box(collection, materials, lod,
                         f"InteriorDeck_{'P' if side < 0 else 'S'}_{level}_{segment_index}",
                         (length, 8.0, 3.8), (x_center, side * (42 + level * 4.0), z),
                         "Material_Interior_ExposedAlloy", "exposed_interior_deck", matrix,
                         bevel=0.24, damage_history="deck_ends_torn_open_at_break")
                if lod < 2:
                    make_box(collection, materials, lod,
                             f"DeckEdgeArmor_{'P' if side < 0 else 'S'}_{level}_{segment_index}",
                             (length * 0.92, 2.0, 5.5),
                             (x_center, side * (37.6 + level * 4.0), z + 3.5),
                             "Material_Armor_Scorched", "deck_edge_armor", matrix, bevel=0.20)

    # Jagged structural ends explain the separation instead of reading as two clean kit pieces.
    shards = [
        (AFT, (-12, -48, 48), (22, -73, 71), 5.0, "AftPort"),
        (AFT, (-8, 44, 28), (18, 83, 50), 4.5, "AftStarboard"),
        (FORE, (8, -44, -24), (-16, -82, -50), 4.6, "ForePort"),
        (FORE, (10, 45, 48), (-14, 77, 83), 5.1, "ForeStarboard"),
        (FORE, (2, 0, -50), (-22, 18, -79), 6.0, "KeelFore"),
        (AFT, (-4, 0, -52), (18, -12, -82), 6.4, "KeelAft"),
    ]
    for matrix, start, end, width, label in shards[: (6 if lod == 0 else 4 if lod == 1 else 3)]:
        make_beam(collection, materials, lod, f"BreakShard_{label}", start, end, width,
                  "Material_Interior_ExposedAlloy", "catastrophic_break_exposed_structure", matrix,
                  bevel=0.20)


def build_cathedral_arches_and_break(collection, materials, lod: int) -> None:
    """Complete the exposed ribs into credible hangar portals and reinforce the shear faces."""
    arch_x = (-148, -102, -56, 24, 72, 120, 168)
    if lod == 1:
        arch_x = (-145, -82, 28, 92, 160)
    elif lod == 2:
        arch_x = (-138, -64, 34, 118)
    for index, x in enumerate(arch_x):
        matrix = AFT if x < 0 else FORE
        # These crown and sill frames remain outside the 72 x 58 m navigation envelope.
        make_box(collection, materials, lod, f"HangarArchCrown_{index}", (7.5, 86, 5.5),
                 (x, 0, 63), "Material_Interior_ExposedAlloy", "hangar_portal_crown",
                 matrix, bevel=0.30)
        make_box(collection, materials, lod, f"HangarArchSill_{index}", (8.0, 84, 5.5),
                 (x, 0, -35), "Material_Mechanical_Exposed", "hangar_portal_sill",
                 matrix, bevel=0.32)
        if lod < 2 and index % 2 == 0:
            # A construction brace turns each second portal into a cathedral-like truss.
            make_beam(collection, materials, lod, f"HangarArchBraceP_{index}",
                      (x, -42, 59), (x + 8, -65, 29), 3.0,
                      "Material_Mechanical_Exposed", "hangar_portal_buttress", matrix, bevel=0.20)
            make_beam(collection, materials, lod, f"HangarArchBraceS_{index}",
                      (x, 42, 59), (x - 8, 65, 29), 3.0,
                      "Material_Mechanical_Exposed", "hangar_portal_buttress", matrix, bevel=0.20)

    # U-shaped torn pressure bulkheads make the two halves read as one cruiser that failed here.
    for matrix, x, prefix, cant in ((AFT, -13, "Aft", -1), (FORE, 12, "Fore", 1)):
        for side in (-1, 1):
            make_beam(collection, materials, lod, f"{prefix}BreakBulkhead_{side}",
                      (x, side * 51, -31), (x + cant * 3, side * 54, 58), 5.8,
                      "Material_Armor_Scorched", "torn_pressure_bulkhead", matrix, bevel=0.24)
        make_box(collection, materials, lod, f"{prefix}BreakBulkheadCrown", (8, 108, 6),
                 (x + cant * 3, 0, 59), "Material_Armor_Scorched", "torn_pressure_bulkhead",
                 matrix, rotation=(math.radians(cant * 3), 0, math.radians(cant * 2)), bevel=0.22,
                 damage_history="blast_loaded_bulkhead_tore_behind_bridge")
        make_box(collection, materials, lod, f"{prefix}BreakBulkheadSill", (9, 104, 7),
                 (x - cant * 2, 0, -34), "Material_Interior_ExposedAlloy", "torn_pressure_bulkhead",
                 matrix, rotation=(math.radians(cant * -2), 0, math.radians(cant * -3)), bevel=0.24,
                 damage_history="keel_and_hangar_sill_sheared_together")

    # One collapsed starboard crown and a surviving port longitudinal truss establish asymmetry.
    collapsed = (
        (FORE, (54, 42, 61), (83, 70, 19), "ForeCollapsedStarboard"),
        (AFT, (-78, -43, 61), (-116, -69, 30), "AftCollapsedPort"),
    )
    for matrix, start, end, label in collapsed[: (2 if lod < 2 else 1)]:
        make_beam(collection, materials, lod, label, start, end, 4.4,
                  "Material_Interior_ExposedAlloy", "collapsed_hangar_truss", matrix, bevel=0.24,
                  damage_history="progressive_collapse_followed_catastrophic_break")

    # Dorsal shoulder shelves reveal armor-over-frame construction without roofing the cavity.
    for matrix, prefix, x, length in ((AFT, "Aft", -108, 142), (FORE, "Fore", 126, 164)):
        for side in (-1, 1):
            make_box(collection, materials, lod, f"{prefix}DorsalShelf_{side}",
                     (length, 19, 5.5), (x, side * 53, 50),
                     "Material_Hull_ConcordGray", "dorsal_armor_shelf", matrix,
                     rotation=(math.radians(side * 1.5), 0, math.radians(side * 1.0)), bevel=0.34)
            if lod < 2:
                make_box(collection, materials, lod, f"{prefix}DorsalScorchPlate_{side}",
                         (length * 0.72, 9, 2.2), (x - (10 if matrix == AFT else -8), side * 57, 54),
                         "Material_Armor_Scorched", "heat_lifted_dorsal_armor", matrix,
                         rotation=(math.radians(side * 2.5), 0, math.radians(side * 1.8)), bevel=0.18,
                         damage_history="armor_lifted_from_frames_by_internal_overpressure")


def build_bridge_and_service_zones(collection, materials, lod: int) -> None:
    make_wedge(collection, materials, lod, "BridgeCitadel", 92, 60, 29, (152, 0, 75),
               "Material_Hull_ConcordGray", "recognizable_bridge_zone", FORE,
               rotation=(0, math.radians(-3.5), 0), bevel=0.78)
    make_box(collection, materials, lod, "BridgeArmorCap", (62, 48, 7), (145, 0, 93),
             "Material_Armor_Scorched", "bridge_armor_cap", FORE,
             rotation=(0, math.radians(-4), 0), bevel=0.46)
    # Layered bridge cheeks and a smaller forward crown break up the monolithic citadel silhouette.
    for side in (-1, 1):
        make_wedge(collection, materials, lod, f"BridgeCheek_{side}", 57, 15, 19,
                   (165, side * 27, 76), "Material_Armor_Scorched", "bridge_side_armor", FORE,
                   rotation=(math.radians(side * 2), math.radians(-4), math.radians(side * 2.5)), bevel=0.42,
                   damage_history="bridge_armor_scorched_but_structurally_recognizable")
    make_wedge(collection, materials, lod, "BridgeForwardCrown", 48, 42, 11, (177, 0, 94),
               "Material_Hull_ConcordGray", "bridge_forward_crown", FORE,
               rotation=(0, math.radians(-5), 0), bevel=0.38)
    window_count = 9 if lod == 0 else 6 if lod == 1 else 4
    for index in range(window_count):
        y = (index - (window_count - 1) / 2) * (5.1 if lod == 0 else 7.0)
        make_box(collection, materials, lod, f"BridgeWindow_{index}", (1.4, 3.1, 5.5),
                 (197.2, y, 78.0), "Material_Emissive_ColdEmergency", "bridge_emergency_window",
                 FORE, rotation=(0, math.radians(-4), 0), bevel=0.10,
                 damage_history="cold_emergency_power_only")

    # Service machinery follows the interior deck line and gives future salvage hooks a visual owner.
    machine_count = 12 if lod == 0 else 7 if lod == 1 else 3
    for index in range(machine_count):
        matrix = AFT if index < machine_count // 2 else FORE
        side = -1 if index % 3 else 1
        x = (-150 + index * 24) if matrix == AFT else (25 + (index - machine_count // 2) * 29)
        y = side * (46 + (index % 2) * 7)
        z = -4 + (index % 4) * 12
        make_box(collection, materials, lod, f"ServiceMachine_{index}",
                 (13 + (index % 3) * 3, 10, 9 + (index % 2) * 4), (x, y, z),
                 "Material_Mechanical_Exposed", "salvageable_service_machinery", matrix,
                 rotation=(math.radians(index % 2 * 4), 0, math.radians(side * (index % 4))), bevel=0.32)
        if lod < 2:
            make_cylinder(collection, materials, lod, f"ServiceDrum_{index}", 3.2, 11,
                          (x + 3, y - side * 6, z + 4), "Material_Interior_ExposedAlloy",
                          "service_pressure_or_drive_unit", matrix, rotation=(0, math.pi / 2, 0), bevel=0.18)

    # Exposed conduits are routed along frames/decks, never sprinkled as detached greebles.
    conduit_count = 14 if lod == 0 else 7 if lod == 1 else 3
    for index in range(conduit_count):
        matrix = AFT if index < conduit_count // 2 else FORE
        side = -1 if index % 2 else 1
        x0 = -165 + (index % 7) * 22 if matrix == AFT else 18 + (index % 7) * 25
        z = -8 + (index % 4) * 11
        path = [
            (x0, side * 43, z),
            (x0 + 10, side * 50, z + 5),
            (x0 + 24, side * 54, z + 4 + (index % 2) * 5),
            (x0 + 36, side * 47, z + 12),
        ]
        make_curve_tube(collection, materials, lod, f"ConduitRun_{index}", path,
                        0.72 if lod == 0 else 1.05 if lod == 1 else 1.45,
                        "Material_Conduit_Copper", "routed_salvage_conduit", matrix)


def build_propulsion_zone(collection, materials, lod: int) -> None:
    # The propulsion bulkhead is a structural ring, not a solid wall: it preserves the hangar route.
    for z, label in ((43, "Dorsal"), (-43, "Ventral")):
        make_box(collection, materials, lod, f"EngineCrossmember{label}", (42, 150, 10),
                 (-189, 0, z), "Material_Mechanical_Exposed", "propulsion_crossmember", AFT,
                 bevel=0.50)
    for side, label in ((-1, "Port"), (1, "Starboard")):
        make_box(collection, materials, lod, f"EngineArmorBack{label}", (25, 20, 68),
                 (-206, side * 65, 0), "Material_Armor_Scorched", "propulsion_armor_bulkhead", AFT,
                 bevel=0.58, damage_history="engine_fire_and_secondary_detonation")
    # Surviving top/bottom cowl rails frame the bell cluster; starboard plates carry the worst tear.
    make_box(collection, materials, lod, "EngineCowlDorsal", (48, 143, 7), (-209, 0, 39),
             "Material_Armor_Scorched", "damaged_propulsion_cowl", AFT,
             rotation=(0, math.radians(2.5), math.radians(-1.5)), bevel=0.42,
             damage_history="propulsion_cowl_opened_by_secondary_detonation")
    make_box(collection, materials, lod, "EngineCowlVentral", (45, 136, 7), (-207, -2, -39),
             "Material_Mechanical_Exposed", "propulsion_cowl_frame", AFT,
             rotation=(0, math.radians(-2), math.radians(2.2)), bevel=0.40)
    if lod < 2:
        make_wedge(collection, materials, lod, "EngineCowlPortShoulder", 43, 26, 31,
                   (-213, -72, 2), "Material_Hull_ConcordGray", "propulsion_cowl_shoulder", AFT,
                   rotation=(math.radians(-3), math.radians(2), math.radians(-4)), bevel=0.48)
        make_wedge(collection, materials, lod, "EngineCowlStarboardTorn", 31, 21, 23,
                   (-207, 73, 7), "Material_Armor_Scorched", "torn_propulsion_cowl_shoulder", AFT,
                   rotation=(math.radians(11), math.radians(-8), math.radians(9)), bevel=0.34,
                   damage_history="starboard_engine_cowl_missing_after_blast")
    # Bells surround the cavity like a machinery rose; no bell occupies the navigation envelope.
    engine_positions = [(-62, -31), (-62, 31), (0, 54), (62, 31), (62, -31)]
    for index, (y, z) in enumerate(engine_positions):
        if index == 3:
            # A torn mounting cradle tells where the missing bell used to be.
            make_torus(collection, materials, lod, "MissingEngineMount", 14.5, 2.6,
                       (-217, y, z), "Material_Interior_ExposedAlloy", "missing_engine_mount",
                       AFT, rotation=(0, math.pi / 2, 0))
            continue
        damaged = index in {0, 4}
        cant = (math.radians(0), math.radians((index - 2) * 1.7), math.radians((index - 2) * 2.4))
        make_frustum_shell(collection, materials, lod, f"EngineBell_{index}", -231, y, z,
                           38, 18 if index in {0, 4} else 16, 9.5 if index in {0, 4} else 8.5,
                           "Material_Interior_ExposedAlloy", "damaged_engine_bell", AFT,
                           damaged=damaged, cant=cant)
        make_torus(collection, materials, lod, f"EngineBellRing_{index}",
                   17.5 if index in {0, 4} else 15.5, 1.9, (-250, y, z),
                   "Material_Mechanical_Exposed", "engine_bell_reinforcement", AFT,
                   rotation=(0, math.pi / 2, 0), segments=36 if lod == 0 else 24 if lod == 1 else 14)
        if lod < 2:
            make_cylinder(collection, materials, lod, f"EngineFeed_{index}", 2.8, 31,
                          (-199, y, z), "Material_Conduit_Copper", "engine_feed_machinery", AFT,
                          rotation=(0, math.pi / 2, 0), bevel=0.18)


def build_lights_marker_and_debris(collection, materials, lod: int) -> None:
    light_x = (-146, -108, -70, -32, 24, 66, 108, 150)
    if lod == 1:
        light_x = (-140, -88, -34, 30, 90, 148)
    elif lod == 2:
        light_x = (-130, -44, 44, 135)
    for index, x in enumerate(light_x):
        matrix = AFT if x < 0 else FORE
        side = -1 if index % 2 else 1
        make_box(collection, materials, lod, f"ColdEmergencyLight_{index}", (9.0, 1.3, 2.4),
                 (x, side * 39.5, 17 + (index % 3) * 13), "Material_Emissive_ColdEmergency",
                 "restrained_cold_emergency_light", matrix, bevel=0.10,
                 damage_history="isolated_emergency_bus_power")

    # The Marker: one amber obstruction light, compactly caged and hard-mounted to the bridge cap.
    make_cylinder(collection, materials, lod, "MarkerMast", 1.55, 26, (113, 0, 111),
                  "Material_Mechanical_Exposed", "marker_support_mast", FORE,
                  rotation=(0, 0, 0), bevel=0.18)
    make_torus(collection, materials, lod, "MarkerCageLower", 5.2, 0.85, (113, 0, 125),
               "Material_Interior_ExposedAlloy", "marker_protective_cage", FORE)
    if lod < 2:
        make_torus(collection, materials, lod, "MarkerCageUpper", 4.4, 0.70, (113, 0, 132),
                   "Material_Interior_ExposedAlloy", "marker_protective_cage", FORE)
        for index, angle in enumerate((0, math.pi / 2, math.pi, math.pi * 1.5)):
            start = (113, math.cos(angle) * 4.9, 125)
            end = (113, math.cos(angle) * 4.1, 132)
            # Alternate in Y/Z so the cage reads from every approach.
            if index % 2:
                start = (113, 0, 125 + math.sin(angle) * 4.9)
                end = (113, 0, 132 + math.sin(angle) * 4.1)
            make_beam(collection, materials, lod, f"MarkerCageBrace_{index}", start, end, 0.72,
                      "Material_Interior_ExposedAlloy", "marker_protective_cage", FORE, bevel=0.10)
    make_sphere(collection, materials, lod, "MarkerAmberCore", 3.55 if lod == 0 else 3.9,
                (113, 0, 129), "Material_Emissive_MarkerAmber", "the_marker", FORE,
                scale=(1.0, 1.0, 1.4))

    # Asymmetric detached slabs follow the blast vector from the starboard break.
    debris = [
        ((8, 103, 28), (24, 9, 38), (math.radians(18), math.radians(-13), math.radians(24))),
        ((-7, 126, -22), (31, 8, 19), (math.radians(-20), math.radians(9), math.radians(-31))),
        ((32, 87, 73), (17, 6, 26), (math.radians(33), math.radians(17), math.radians(11))),
        ((-28, -102, 57), (22, 7, 16), (math.radians(-26), math.radians(-8), math.radians(37))),
    ]
    for index, (location, size, rotation) in enumerate(debris[: (4 if lod == 0 else 3 if lod == 1 else 2)]):
        make_box(collection, materials, lod, f"DetachedArmorSlab_{index}", size, location,
                 "Material_Armor_Scorched", "blast_vector_detached_armor", IDENTITY,
                 rotation=rotation, bevel=0.28,
                 damage_history="catastrophic_break_ejected_along_starboard_blast_vector")


def build_microdetail(collection, materials, lod: int) -> None:
    if lod > 1:
        return
    bolt_count = 36 if lod == 0 else 14
    for index in range(bolt_count):
        matrix = FORE if index >= bolt_count // 2 else AFT
        side = -1 if index % 2 else 1
        x = (28 + (index % 9) * 23) if matrix == FORE else (-24 - (index % 9) * 19)
        y = side * (70 + (index % 3) * 3)
        z = -12 + (index % 6) * 11
        make_cylinder(collection, materials, lod, f"ArmorFastener_{index}", 0.75, 1.8,
                      (x, y, z), "Material_Interior_ExposedAlloy", "armor_fastener", matrix,
                      vertices=12 if lod == 0 else 8,
                      rotation=(math.pi / 2, 0, 0), bevel=0.05)

    # Purposeful service panels cluster near salvage machinery, not uniformly across the hull.
    panel_count = 16 if lod == 0 else 7
    for index in range(panel_count):
        matrix = AFT if index % 3 == 0 else FORE
        side = -1 if index % 2 else 1
        x = min(-38, -145 + index * 13) if matrix == AFT else (45 + index * 10)
        make_box(collection, materials, lod, f"ServiceAccessPanel_{index}",
                 (12 + (index % 3) * 3, 1.5, 8 + (index % 2) * 4),
                 (x, side * 46.0, -3 + (index % 4) * 13), "Material_Armor_Scorched",
                 "service_access_panel", matrix, bevel=0.12)


def build_lod(collection, materials, lod: int) -> list[bpy.types.Object]:
    before = set(bpy.data.objects)
    build_hull_mass(collection, materials, lod)
    build_ribcage_and_hangar(collection, materials, lod)
    build_cathedral_arches_and_break(collection, materials, lod)
    build_bridge_and_service_zones(collection, materials, lod)
    build_propulsion_zone(collection, materials, lod)
    build_lights_marker_and_debris(collection, materials, lod)
    build_microdetail(collection, materials, lod)
    return [obj for obj in bpy.data.objects if obj not in before and obj.type in {"MESH", "CURVE"}]


def apply_all_modifiers(obj: bpy.types.Object) -> None:
    if obj.type != "MESH":
        return
    select_only(obj)
    for modifier in list(obj.modifiers):
        try:
            bpy.ops.object.modifier_apply(modifier=modifier.name)
        except Exception as error:
            log(f"WARN modifier {obj.name}.{modifier.name}: {error}")


def convert_curves(objects: list[bpy.types.Object]) -> None:
    for obj in list(objects):
        if obj.type != "CURVE":
            continue
        select_only(obj)
        bpy.ops.object.convert(target="MESH")


def ensure_uvs_and_normals(obj: bpy.types.Object) -> dict[str, Any]:
    if obj.type != "MESH" or not obj.data.polygons:
        return {"uvLayers": 0, "uvLoops": 0}
    select_only(obj)
    if not obj.data.uv_layers:
        obj.data.uv_layers.new(name="UVMap")
    try:
        bpy.ops.object.mode_set(mode="EDIT")
        bpy.ops.mesh.select_all(action="SELECT")
        bpy.ops.uv.smart_project(angle_limit=math.radians(58.0), island_margin=0.012)
        bpy.ops.object.mode_set(mode="OBJECT")
    except Exception as error:
        log(f"WARN UV {obj.name}: {error}")
        try:
            bpy.ops.object.mode_set(mode="OBJECT")
        except Exception:
            pass
    # Final triangulation makes tangent generation deterministic for joined curve tubes, engine
    # shells, and mixed hard-surface groups. Without it Blender omits tangents on some primitives.
    select_only(obj)
    try:
        triangulate = obj.modifiers.new("WC_ExportTriangulate", "TRIANGULATE")
        triangulate.keep_custom_normals = True
        bpy.ops.object.modifier_apply(modifier=triangulate.name)
    except Exception as error:
        log(f"WARN triangulate {obj.name}: {error}")
    select_only(obj)
    try:
        bpy.ops.object.shade_smooth()
    except Exception:
        pass
    uv = obj.data.uv_layers.active
    coords = [(float(loop.uv.x), float(loop.uv.y)) for loop in uv.data] if uv else []
    non_finite = sum(1 for u, v in coords if not math.isfinite(u) or not math.isfinite(v))
    out_of_range = sum(1 for u, v in coords if u < -1e-4 or u > 1.0001 or v < -1e-4 or v > 1.0001)
    return {
        "uvLayers": len(obj.data.uv_layers),
        "activeUv": uv.name if uv else None,
        "uvLoops": len(coords),
        "nonFiniteUvLoops": non_finite,
        "outOfUnitRangeUvLoops": out_of_range,
        "uvMin": [min((c[index] for c in coords), default=0.0) for index in range(2)],
        "uvMax": [max((c[index] for c in coords), default=0.0) for index in range(2)],
    }


def triangle_count(obj: bpy.types.Object) -> int:
    return sum(max(0, len(poly.vertices) - 2) for poly in obj.data.polygons) if obj.type == "MESH" else 0


def join_by_material(collection: bpy.types.Collection, materials: dict[str, bpy.types.Material],
                     lod_objects: dict[int, list[bpy.types.Object]]) -> tuple[dict[int, list[bpy.types.Object]], dict[str, Any]]:
    merged: dict[int, list[bpy.types.Object]] = {0: [], 1: [], 2: []}
    uv_report: dict[str, Any] = {}
    for lod, objects in lod_objects.items():
        convert_curves(objects)
        # Blender replaces a curve Object RNA instance when converting it to mesh. Re-enumerate the
        # live collection instead of retaining the invalidated Python references from build_lod().
        current_names = [
            obj.name for obj in collection.objects
            if obj.type == "MESH" and int(obj.get("spaceface.lodLevel", -1)) == lod
        ]
        for object_name in current_names:
            live = bpy.data.objects.get(object_name)
            if live is not None:
                apply_all_modifiers(live)
        for material_name, material in materials.items():
            # object.join() removes every selected donor Object. Re-enumerate the collection for
            # each material group so later groups never dereference those intentionally removed RNAs.
            group = [
                obj for obj in collection.objects
                if obj.type == "MESH"
                and int(obj.get("spaceface.lodLevel", -1)) == lod
                and obj.data.materials
                and obj.data.materials[0] == material
            ]
            if not group:
                continue
            active = group[0]
            if len(group) > 1:
                bpy.ops.object.select_all(action="DESELECT")
                for obj in group:
                    obj.hide_set(False)
                    obj.hide_viewport = False
                    obj.select_set(True)
                bpy.context.view_layer.objects.active = active
                bpy.ops.object.join()
            active.name = f"LOD{lod}_{ROLE_TOKEN[material_name]}"
            active.data.name = f"{active.name}_Mesh"
            active.data.materials.clear()
            active.data.materials.append(material)
            tag(active, lod, material_name, f"merged_{MATERIAL_SPECS[material_name]['role']}_draw_group")
            uv_report[active.name] = ensure_uvs_and_normals(active)
            merged[lod].append(active)
    return merged, uv_report


def bounds(objects: list[bpy.types.Object]) -> dict[str, list[float]]:
    bpy.context.view_layer.update()
    minimum = Vector((1e12, 1e12, 1e12))
    maximum = Vector((-1e12, -1e12, -1e12))
    for obj in objects:
        for corner in obj.bound_box:
            world = obj.matrix_world @ Vector(corner)
            minimum.x, minimum.y, minimum.z = min(minimum.x, world.x), min(minimum.y, world.y), min(minimum.z, world.z)
            maximum.x, maximum.y, maximum.z = max(maximum.x, world.x), max(maximum.y, world.y), max(maximum.z, world.z)
    size = maximum - minimum
    return {
        "min": [round(value, 4) for value in minimum],
        "max": [round(value, 4) for value in maximum],
        "size": [round(value, 4) for value in size],
    }


def add_empty(collection: bpy.types.Collection, name: str, location, role: str,
              parent: bpy.types.Object, metadata: dict[str, Any] | None = None) -> bpy.types.Object:
    obj = bpy.data.objects.new(name, None)
    obj.empty_display_type = "ARROWS" if name.startswith("SOCKET") else "CUBE"
    obj.empty_display_size = 4.0 if name.startswith("SOCKET") else 8.0
    obj.location = location
    obj.parent = parent
    obj["spaceface"] = {"semanticRole": role, **(metadata or {})}
    obj["spaceface.semanticRole"] = role
    collection.objects.link(obj)
    return obj


def rich_metadata(lod_stats: dict[str, Any], lod0_bounds: dict[str, Any]) -> dict[str, Any]:
    return {
        "contractVersion": 1,
        "assetId": ASSET_CONTRACT_ID,
        "partId": ASSET_ID,
        "liveId": ASSET_ID,
        "kind": "landmark",
        "slot": "place",
        "packet": PACKET,
        "subslice": SUBSLICE,
        "forward": "+X",
        "up": "+Y",
        "starboard": "+Z",
        "unit": "metre",
        "normalConvention": "OpenGL",
        "ormChannels": "R=AO,G=Roughness,B=Metallic",
        "textureCompression": "PNG-source; release compression intentionally deferred",
        "deliverableRole": "professional_editable_source_glb_candidate",
        "lifecycle": "SOURCE_GLB",
        "runtimeWired": False,
        "routeAccepted": False,
        "lods": ["lod0", "lod1", "lod2"],
        "lodTriangles": {key: value["triangles"] for key, value in lod_stats.items()},
        "drawGroupsPerLod": {key: value["drawGroups"] for key, value in lod_stats.items()},
        "lod0Aabb": lod0_bounds,
        "authoredFlythroughEnvelopeM": {
            "axis": "+X/-X",
            "minimumClearWidth": 72.0,
            "minimumClearHeight": 58.0,
            "designedChannel": {"y": [-35.5, 35.5], "z": [-24.0, 34.0]},
        },
        "semanticZones": ["bridge", "propulsion", "service", "structure", "hangar_cavity",
                          "salvage_machinery", "the_marker"],
        "authoringIntent": "constructed Concord cruiser, broken behind bridge; no random greeble",
    }


def parse_glb(path: Path) -> tuple[dict[str, Any], list[tuple[int, bytes]]]:
    data = path.read_bytes()
    if data[:4] != b"glTF":
        raise ValueError("not a GLB")
    offset = 12
    chunks: list[tuple[int, bytes]] = []
    document = None
    while offset + 8 <= len(data):
        length, chunk_type = struct.unpack_from("<II", data, offset)
        payload = data[offset + 8: offset + 8 + length]
        chunks.append((chunk_type, payload))
        if chunk_type == 0x4E4F534A:
            document = json.loads(payload.decode("utf-8").rstrip(" \t\r\n\x00"))
        offset += 8 + length
    if document is None:
        raise ValueError("GLB JSON chunk missing")
    return document, chunks


def patch_glb_metadata(path: Path, metadata: dict[str, Any]) -> dict[str, Any]:
    document, chunks = parse_glb(path)
    document.setdefault("asset", {}).setdefault("extras", {})["spacefaceAsset"] = metadata
    document["asset"]["generator"] = f"SpaceFace PQ-018 / Blender {bpy.app.version_string}"
    role_by_token = {token.lower(): name for name, token in ROLE_TOKEN.items()}
    for material in document.get("materials", []):
        source_name = material.get("name", "")
        spec = MATERIAL_SPECS.get(source_name)
        if spec:
            extras = material.setdefault("extras", {})
            extras["spacefaceMaterialRole"] = spec["role"]
            extras["spacefacePaletteTint"] = spec["paletteTint"]
            extras["spacefaceSourceAsset"] = ASSET_ID
    for node in document.get("nodes", []):
        name = node.get("name", "")
        match = re.match(r"^LOD([012])_([^.]*)", name, re.IGNORECASE)
        if match:
            role_name = role_by_token.get(match.group(2).lower())
            spec = MATERIAL_SPECS.get(role_name) if role_name else None
            spaceface = node.setdefault("extras", {}).setdefault("spaceface", {})
            spaceface["lod"] = f"lod{match.group(1)}"
            spaceface["lodLevel"] = int(match.group(1))
            spaceface["chamfered"] = True
            if spec:
                spaceface["materialRole"] = spec["role"]
        elif name.startswith(("SOCKET_", "ZONE_", "SALVAGE_", "INTERACTION_")):
            node.setdefault("extras", {}).setdefault("spaceface", {})["semanticMarker"] = True

    encoded = json.dumps(document, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
    encoded += b" " * ((4 - len(encoded) % 4) % 4)
    rebuilt_chunks: list[bytes] = []
    replaced = False
    for chunk_type, payload in chunks:
        if chunk_type == 0x4E4F534A and not replaced:
            payload = encoded
            replaced = True
        rebuilt_chunks.append(struct.pack("<II", len(payload), chunk_type) + payload)
    body = b"".join(rebuilt_chunks)
    final = struct.pack("<4sII", b"glTF", 2, 12 + len(body)) + body
    temporary = path.with_suffix(".glb.tmp")
    temporary.write_bytes(final)
    os.replace(temporary, path)
    return document


def glb_geometry_report(document: dict[str, Any]) -> dict[str, Any]:
    accessors = document.get("accessors", [])
    meshes = document.get("meshes", [])
    materials = document.get("materials", [])
    totals = {"lod0": 0, "lod1": 0, "lod2": 0, "untagged": 0}
    primitives = {"lod0": 0, "lod1": 0, "lod2": 0, "untagged": 0}
    uv_primitives = 0
    tangent_primitives = 0
    mesh_by_index = {index: mesh for index, mesh in enumerate(meshes)}
    for node in document.get("nodes", []):
        if node.get("mesh") is None:
            continue
        mesh = mesh_by_index[node["mesh"]]
        nested = (node.get("extras") or {}).get("spaceface") or {}
        lod = nested.get("lod", "untagged")
        if lod not in totals:
            lod = "untagged"
        for primitive in mesh.get("primitives", []):
            index_accessor = primitive.get("indices")
            position_accessor = (primitive.get("attributes") or {}).get("POSITION")
            count = accessors[index_accessor]["count"] if index_accessor is not None else accessors[position_accessor]["count"]
            totals[lod] += int(count // 3)
            primitives[lod] += 1
            uv_primitives += int("TEXCOORD_0" in (primitive.get("attributes") or {}))
            tangent_primitives += int("TANGENT" in (primitive.get("attributes") or {}))
    return {
        "schema": "spaceface.wreckCathedralGeometryMaterialTextureReport.v1",
        "assetId": ASSET_ID,
        "glb": rel(GLB),
        "glbBytes": GLB.stat().st_size,
        "trianglesByLod": totals,
        "primitivesByLod": primitives,
        "materialCount": len(materials),
        "materials": [material.get("name") for material in materials],
        "imageCount": len(document.get("images", [])),
        "textureCount": len(document.get("textures", [])),
        "uvPrimitiveCount": uv_primitives,
        "tangentPrimitiveCount": tangent_primitives,
        "lodOrderStrictlyReducing": totals["lod0"] > totals["lod1"] > totals["lod2"] > 0,
    }


def flythrough_clearance_probe(objects: list[bpy.types.Object]) -> dict[str, Any]:
    """Ray-sample the authored route in each splayed half and across the open fracture."""
    depsgraph = bpy.context.evaluated_depsgraph_get()
    vertices: list[Vector] = []
    polygons: list[tuple[int, ...]] = []
    polygon_owners: list[str] = []
    for obj in objects:
        evaluated = obj.evaluated_get(depsgraph)
        mesh = evaluated.to_mesh()
        base = len(vertices)
        vertices.extend(evaluated.matrix_world @ vertex.co for vertex in mesh.vertices)
        polygons.extend(tuple(base + index for index in polygon.vertices) for polygon in mesh.polygons)
        polygon_owners.extend([obj.name] * len(mesh.polygons))
        evaluated.to_mesh_clear()
    bvh = BVHTree.FromPolygons(vertices, polygons, all_triangles=False)
    if bvh is None:
        raise RuntimeError("Unable to build fly-through clearance BVH")

    route_segments = (
        ("aft_hangar", AFT, (-270.0, -5.0)),
        ("fore_hangar", FORE, (5.0, 290.0)),
    )
    offsets_y = (-32.0, -16.0, 0.0, 16.0, 32.0)
    offsets_z = (-25.0, -12.5, 0.0, 12.5, 25.0)
    samples: list[tuple[str, float, float, Vector, Vector]] = []
    for label, matrix, (start_x, end_x) in route_segments:
        for y in offsets_y:
            for z in offsets_z:
                samples.append((label, y, z, point(matrix, (start_x, y, z)),
                                point(matrix, (end_x, y, z))))
    for y in offsets_y:
        for z in offsets_z:
            samples.append(("catastrophic_break_transition", y, z, point(AFT, (-5.0, y, z)),
                            point(FORE, (5.0, y, z))))

    hits = []
    for label, offset_y, offset_z, start, end in samples:
        delta = end - start
        distance = delta.length
        direction = delta.normalized()
        location, _normal, face_index, hit_distance = bvh.ray_cast(
            start + direction * 0.15, direction, distance - 0.30)
        if location is not None:
            hits.append({
                "segment": label,
                "crossSectionOffsetM": [offset_y, offset_z],
                "locationM": [round(value, 4) for value in location],
                "distanceM": round(float(hit_distance), 4),
                "faceIndex": int(face_index),
                "object": polygon_owners[int(face_index)] if face_index is not None and int(face_index) < len(polygon_owners) else None,
            })
    return {
        "method": "75 deterministic BVH ray samples across a 64 m x 50 m inset of the 72 m x 58 m envelope",
        "sampleCount": len(samples),
        "hitCount": len(hits),
        "pass": not hits,
        "hits": hits[:20],
    }


def build() -> None:
    started = time.time()
    for directory in (EVIDENCE, TEXTURES, REPORTS, BLEND.parent, GLB.parent):
        directory.mkdir(parents=True, exist_ok=True)
    reset_scene()
    scene = bpy.context.scene
    scene.name = "Wreck Cathedral Source Asset"
    # The delivery permits only the named BLEND; keep Blender from leaving adjacent .blend1 files.
    bpy.context.preferences.filepaths.save_version = 0
    scene.unit_settings.system = "METRIC"
    scene.unit_settings.scale_length = 1.0
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.film_transparent = False
    materials, texture_paths = create_materials()
    collection = new_collection("WC_EXPORT_GEOMETRY")
    root = bpy.data.objects.new("SF_PLACE_LANDMARK_WRECK_CATHEDRAL_ROOT", None)
    root.empty_display_type = "CUBE"
    root.empty_display_size = 16.0
    collection.objects.link(root)

    # Validate the highest-detail construction before spending time building and unwrapping LODs.
    source_objects = {0: build_lod(collection, materials, 0)}
    clearance_probe = flythrough_clearance_probe(source_objects[0])
    (REPORTS / "flythrough_clearance_probe.json").write_text(
        json.dumps(clearance_probe, indent=2), encoding="utf-8")
    if not clearance_probe["pass"]:
        raise RuntimeError(f"Fly-through clearance probe found geometry: {clearance_probe['hits'][:4]}")
    source_objects[1] = build_lod(collection, materials, 1)
    source_objects[2] = build_lod(collection, materials, 2)
    merged, uv_objects = join_by_material(collection, materials, source_objects)
    lod_roots: dict[int, bpy.types.Object] = {}
    for lod in range(3):
        lod_root = bpy.data.objects.new(f"LOD{lod}_ROOT", None)
        lod_root.empty_display_type = "CUBE"
        lod_root.empty_display_size = 12.0
        lod_root["spaceface"] = {"lod": f"lod{lod}", "lodLevel": lod, "preservesFlythrough": True}
        lod_root.parent = root
        collection.objects.link(lod_root)
        lod_roots[lod] = lod_root
        for obj in merged[lod]:
            obj.parent = lod_root
        hidden = lod != 0
        lod_root.hide_viewport = hidden
        lod_root.hide_render = hidden
        # Object visibility is not inherited from an Empty parent. Persist the same authored LOD
        # state on each draw group so the editable source opens without three coincident LODs.
        for obj in merged[lod]:
            obj.hide_viewport = hidden
            obj.hide_render = hidden

    lod_stats = {
        f"lod{lod}": {
            "triangles": sum(triangle_count(obj) for obj in merged[lod]),
            "drawGroups": len(merged[lod]),
            "objects": [obj.name for obj in merged[lod]],
            "bounds": bounds(merged[lod]),
        }
        for lod in range(3)
    }
    lod0_bounds = lod_stats["lod0"]["bounds"]
    metadata = rich_metadata(lod_stats, lod0_bounds)
    metadata["flythroughClearanceProbe"] = clearance_probe
    root["spacefaceAssetJson"] = json.dumps(metadata, separators=(",", ":"))
    root["spaceface"] = {"assetId": ASSET_CONTRACT_ID, "partId": ASSET_ID, "slot": "place",
                         "kind": "landmark", "packet": PACKET, "lifecycle": "SOURCE_GLB"}

    # Stable semantic attachment points for later world-site, salvage, and marker wiring.
    add_empty(collection, "SOCKET_Flythrough_Entry", point(AFT, (-258, 0, 0)), "flythrough_entry", root,
              {"clearanceWidthM": 72.0, "clearanceHeightM": 58.0})
    add_empty(collection, "SOCKET_Flythrough_Exit", point(FORE, (276, 0, 8)), "flythrough_exit", root,
              {"clearanceWidthM": 72.0, "clearanceHeightM": 58.0})
    add_empty(collection, "SOCKET_TheMarker", point(FORE, (113, 0, 129)), "the_marker", root,
              {"lightColor": "amber", "unique": True})
    add_empty(collection, "ZONE_Bridge", point(FORE, (160, 0, 76)), "bridge_zone", root)
    add_empty(collection, "ZONE_Propulsion", point(AFT, (-220, 0, 0)), "propulsion_zone", root)
    add_empty(collection, "ZONE_Service_Port", point(AFT, (-92, -50, 8)), "service_zone", root)
    add_empty(collection, "ZONE_Service_Starboard", point(FORE, (88, 52, 14)), "service_zone", root)
    add_empty(collection, "ZONE_BrokenKeel", (0, 0, -58), "broken_keel_zone", root)
    add_empty(collection, "SALVAGE_EngineMachinery", point(AFT, (-201, -27, 12)), "future_salvage_node", root)
    add_empty(collection, "SALVAGE_ConduitBank", point(FORE, (76, 48, 10)), "future_salvage_node", root)
    add_empty(collection, "SALVAGE_ServiceRack", point(AFT, (-112, 48, 6)), "future_salvage_node", root)
    add_empty(collection, "INTERACTION_HangarCavity", (0, 0, 5), "future_world_site_cavity", root,
              {"runtimeWiring": "deferred_to_PQ-018_integration"})

    if not (lod_stats["lod0"]["triangles"] > lod_stats["lod1"]["triangles"] > lod_stats["lod2"]["triangles"] > 0):
        raise RuntimeError(f"LOD triangles are not strictly reducing: {lod_stats}")
    if any(item["outOfUnitRangeUvLoops"] or item["nonFiniteUvLoops"] for item in uv_objects.values()):
        raise RuntimeError("UV report contains non-finite or out-of-range coordinates")

    scene["spacefaceAssetJson"] = json.dumps(metadata, separators=(",", ":"))
    scene["spacefaceBuild"] = {"packet": PACKET, "subslice": SUBSLICE, "seed": BUILD_SEED,
                               "script": rel(Path(__file__).resolve())}
    bpy.ops.wm.save_as_mainfile(filepath=str(BLEND), compress=True)

    # Export only candidate geometry + semantic empties. Studio evidence never enters the GLB.
    export_objects = [root, *lod_roots.values(), *sum((merged[lod] for lod in range(3)), [])]
    export_objects.extend([obj for obj in collection.objects if obj.type == "EMPTY" and obj not in export_objects])
    for obj in export_objects:
        obj.hide_viewport = False
        obj.hide_render = False
        obj.hide_set(False)
    spec = importlib.util.spec_from_file_location("spaceface_export_gate", EXPORTER)
    export_gate = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(export_gate)
    diagnostics = export_gate.export_gltf(str(GLB), {
        "kind": "landmark",
        "id": ASSET_ID,
        "assetId": ASSET_CONTRACT_ID,
        "slot": "place",
        "tri_budget": None,
        "min_hull_tris": 0,
        "required_maps": ["ao", "roughness"],
        "textureCompression": "PNG-source",
    }, export_objects)
    document = patch_glb_metadata(GLB, metadata)
    geometry_report = glb_geometry_report(document)
    geometry_report["flythroughClearanceProbe"] = clearance_probe

    unique_texture_bytes = 0
    texture_entries = []
    for material_name, channels in texture_paths.items():
        size = MATERIAL_SPECS[material_name]["size"]
        for channel, path_text in channels.items():
            texture_path = ROOT / path_text
            base_gpu_bytes = size * size * 4
            mip_gpu_bytes = math.ceil(base_gpu_bytes * 4 / 3)
            unique_texture_bytes += mip_gpu_bytes
            texture_entries.append({
                "material": material_name,
                "channel": channel,
                "path": path_text,
                "dimensions": [size, size],
                "fileBytes": texture_path.stat().st_size,
                "estimatedGpuBytesRgba8WithMips": mip_gpu_bytes,
                "sha256": sha256_file(texture_path),
            })
    geometry_report["textures"] = texture_entries
    geometry_report["estimatedUniqueTextureMemoryBytesRgba8WithMips"] = unique_texture_bytes
    geometry_report["estimatedUniqueTextureMemoryMiB"] = round(unique_texture_bytes / 1024 / 1024, 3)
    geometry_report["materialReuse"] = "same semantic material set reused by LOD0/LOD1/LOD2"

    uv_material_report = {
        "schema": "spaceface.wreckCathedralUvMaterialRoleReport.v1",
        "assetId": ASSET_ID,
        "uvContract": "UVMap smart-project, unit-square bounded, OpenGL tangent normal maps",
        "objects": uv_objects,
        "materials": [
            {
                "name": name,
                "semanticRole": spec["role"],
                "paletteTint": spec["paletteTint"],
                "surfaceIntent": spec["pattern"],
                "textures": texture_paths[name],
                "authoredPbr": {"baseColor": True, "normal": True, "ao": True,
                                "roughness": True, "metallic": True,
                                "emissive": bool(spec.get("emission"))},
            }
            for name, spec in MATERIAL_SPECS.items()
        ],
        "semanticMarkers": sorted(obj.name for obj in collection.objects if obj.type == "EMPTY" and obj != root),
        "failures": [],
    }
    build_manifest = {
        "schema": "spaceface.wreckCathedralSourceBuild.v1",
        "packet": PACKET,
        "subslice": SUBSLICE,
        "stateReached": "IMPLEMENTED",
        "lifecycle": "SOURCE_GLB",
        "terminal": False,
        "runtimeWired": False,
        "routeAccepted": False,
        "assetId": ASSET_ID,
        "baseCommit": "aec26203573e1d78a499ddbb3ce586420acd8c4f",
        "blender": {"version": bpy.app.version_string, "binary": bpy.app.binary_path},
        "deterministicBuildSeed": BUILD_SEED,
        "script": rel(Path(__file__).resolve()),
        "command": f'"{bpy.app.binary_path}" --background --python "{rel(Path(__file__).resolve())}"',
        "outputs": {"blend": rel(BLEND), "glb": rel(GLB)},
        "sourceHashes": {"blend": sha256_file(BLEND), "glb": sha256_file(GLB)},
        "lod": lod_stats,
        "flythroughEnvelopeM": metadata["authoredFlythroughEnvelopeM"],
        "flythroughClearanceProbe": clearance_probe,
        "exporter": {"path": rel(EXPORTER), "diagnostics": diagnostics},
        "authorship": "project-original deterministic Blender construction; no external donor assets",
        "constructionLogic": [
            "keel, spine, frames, decks, armor and propulsion occupy coherent cruiser zones",
            "catastrophic break behind bridge terminates decks and keels with directional torn structure",
            "service machinery and conduit runs follow exposed interior deck and frame routes",
            "partially burned blue Concord identification plates disappear near break and engine fire",
            "one amber Marker remains visually and semantically unique",
        ],
        "knownDefects": [
            "SOURCE_GLB only: release compression, manifest registration and runtime LOD policy are deferred",
            "collision proxies and World Site component proxies are intentionally deferred to PQ-017/PQ-018 integration",
            "no browser/Electron normal-route or measured zone-performance acceptance is claimed",
        ],
        "elapsedSeconds": round(time.time() - started, 3),
        "builtAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    }
    (REPORTS / "geometry_material_texture_report.json").write_text(
        json.dumps(geometry_report, indent=2), encoding="utf-8")
    (REPORTS / "uv_material_role_report.json").write_text(
        json.dumps(uv_material_report, indent=2), encoding="utf-8")
    (REPORTS / "source_build_manifest.json").write_text(
        json.dumps(build_manifest, indent=2), encoding="utf-8")
    log(f"BLEND {BLEND} ({BLEND.stat().st_size:,} bytes)")
    log(f"GLB   {GLB} ({GLB.stat().st_size:,} bytes)")
    log(f"LOD   {geometry_report['trianglesByLod']}")
    log(f"texture memory {geometry_report['estimatedUniqueTextureMemoryMiB']} MiB RGBA8+mips")
    log(f"completed in {build_manifest['elapsedSeconds']}s")


if __name__ == "__main__":
    build()

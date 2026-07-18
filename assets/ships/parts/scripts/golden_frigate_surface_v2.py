#!/usr/bin/env python3
"""Build a scratch-only functional PBR and construction-detail candidate for hull_frigate.

The recipe imports the current immutable source GLB, preserves its root, sockets, mounts, silhouette
and in-file LOD family, replaces flat material reuse with semantic Principled roles, adds bounded
command-frigate construction, and emits inspectable PNG/GLB/Blend evidence. It refuses production
or release destinations and never edits the input asset.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
import sys
import traceback
from pathlib import Path
from typing import Any, Iterable, Sequence

import bpy
from mathutils import Vector


SCRIPT_PATH = Path(__file__).resolve()
REPO_ROOT = SCRIPT_PATH.parents[4]
SPEC_PATH = SCRIPT_PATH.with_suffix(".spec.json")
RECIPE_ID = "golden-frigate-surface-v2"
PREFIX = "SF_FRIGATE_GOLDEN_V2__"
SEMANTIC_PREFIXES = ("MOUNT_", "SOCKET_")
ROLE_ORDER = (
    "coated_armor",
    "exposed_alloy",
    "dark_composite",
    "recessed_machinery",
    "heat_affected_alloy",
    "docking_contact",
    "identity_marking",
)


def parse_args() -> argparse.Namespace:
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", default=str(REPO_ROOT / "assets/ships/parts/hulls/hull_frigate.glb"))
    parser.add_argument("--output-dir", default=str(REPO_ROOT / ".devshots/graphics/fleet-frigate-golden-v2/candidate"))
    parser.add_argument("--texture-size", type=int, default=1024)
    parser.add_argument("--reuse-textures", action="store_true", help="Reuse an already-generated same-resolution PNG set for geometry-only review iterations.")
    return parser.parse_args(argv)


def load_spec() -> dict[str, Any]:
    spec = json.loads(SPEC_PATH.read_text(encoding="utf-8"))
    if spec.get("recipeId") != RECIPE_ID:
        raise RuntimeError(f"recipe/spec mismatch: {spec.get('recipeId')}")
    return spec


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest().upper()


def is_within(path: Path, parent: Path) -> bool:
    try:
        path.resolve().relative_to(parent.resolve())
        return True
    except ValueError:
        return False


def guard_paths(source: Path, output_dir: Path) -> None:
    if not source.is_file():
        raise FileNotFoundError(source)
    forbidden = (
        REPO_ROOT / "assets/ships/parts",
        REPO_ROOT / "assets/ships/release",
        REPO_ROOT / "assets/ships/release.__building",
        REPO_ROOT / "assets/ships/release.__previous",
    )
    if any(is_within(output_dir, root) for root in forbidden):
        raise RuntimeError(f"refusing production/release output: {output_dir}")


def atomic_json(path: Path, payload: dict[str, Any]) -> None:
    temp = path.with_suffix(path.suffix + ".tmp")
    temp.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    temp.replace(path)


def clamp01(value: float) -> float:
    return min(1.0, max(0.0, value))


def smooth(value: float) -> float:
    return value * value * (3.0 - 2.0 * value)


def hash_noise(ix: int, iy: int, seed: int) -> float:
    value = (ix * 0x1F123BB5) ^ (iy * 0x5F356495) ^ (seed * 0x2C1B3C6D)
    value &= 0xFFFFFFFF
    value ^= value >> 15
    value = (value * 0x2C1B3C6D) & 0xFFFFFFFF
    value ^= value >> 12
    value = (value * 0x297A2D39) & 0xFFFFFFFF
    value ^= value >> 15
    return value / 0xFFFFFFFF


def value_noise(u: float, v: float, scale: float, seed: int) -> float:
    period = max(1, int(round(scale)))
    x = u * period
    y = v * period
    ix, iy = math.floor(x), math.floor(y)
    fx, fy = smooth(x - ix), smooth(y - iy)
    a = hash_noise(ix % period, iy % period, seed)
    b = hash_noise((ix + 1) % period, iy % period, seed)
    c = hash_noise(ix % period, (iy + 1) % period, seed)
    d = hash_noise((ix + 1) % period, (iy + 1) % period, seed)
    return (a + (b - a) * fx) + ((c + (d - c) * fx) - (a + (b - a) * fx)) * fy


def surface_sample(profile: dict[str, Any], u: float, v: float, seed: int) -> tuple[list[float], float, float, float, float]:
    macro = value_noise(u, v, 3.0, seed)
    mid = value_noise(u, v, 11.0, seed + 41)
    micro = value_noise(u, v, 83.0, seed + 97)
    pattern = profile["pattern"]
    feature = (micro - 0.5) * 0.12
    wear = 0.0
    seam = 0.0
    roughness_bias = 0.0
    contact_dirt = 0.0
    if pattern == "painted_panels":
        panel_u = (u * 5.0) % 1.0
        panel_v = (v * 4.0) % 1.0
        grid_u = min(panel_u, 1.0 - panel_u)
        grid_v = min(panel_v, 1.0 - panel_v)
        seam = clamp01((0.036 - min(grid_u, grid_v)) / 0.036)
        orange_peel = (micro - 0.5) * 0.31
        shallow_waviness = (macro - 0.5) * 0.12
        directional_scratch = max(0.0, math.sin((u * 91.0 + mid * 1.7) * math.tau) - 0.965)
        feature = orange_peel + shallow_waviness - seam * 0.34 + directional_scratch * 0.18
        wear = seam * clamp01((value_noise(u, v, 19.0, seed + 211) - 0.72) * 2.9)
        panel_index = (int(u * 5.0) * 7 + int(v * 4.0) * 11 + seed) % 7
        roughness_bias = (-0.12, 0.04, 0.13, -0.03, 0.09, -0.07, 0.16)[panel_index]
        contact_dirt = seam * (0.22 + (1.0 - mid) * 0.44)
    elif pattern == "brushed_alloy":
        brush = math.sin((u * 173.0 + mid * 2.2) * math.tau)
        cross_brush = math.sin((u * 41.0 + v * 3.0) * math.tau)
        feature = brush * 0.12 + cross_brush * 0.025 + (micro - 0.5) * 0.11
        wear = clamp01((0.12 - abs(v - 0.28)) * 4.0) * 0.28
    elif pattern == "composite_laminate":
        weave = math.sin(u * math.tau * 47.0) * math.sin(v * math.tau * 41.0)
        ply = math.sin((u * 7.0 + v * 2.0) * math.tau)
        feature = weave * 0.18 + ply * 0.05 + (micro - 0.5) * 0.08
    elif pattern == "machinery_channels":
        groove = abs(math.sin(v * math.tau * 22.0))
        channel = clamp01((0.13 - groove) * 5.0)
        feature = (micro - 0.5) * 0.25 - channel * 0.54
        wear = (1.0 - mid) * 0.27 + channel * 0.22
        contact_dirt = channel * 0.46
    elif pattern == "thermal_bands":
        band = math.sin((u * 6.0 + macro * 0.72) * math.pi)
        axial_brush = math.sin((u * 137.0 + mid * 1.5) * math.tau)
        feature = band * 0.11 + axial_brush * 0.045 + (micro - 0.5) * 0.13
        wear = clamp01(band * 0.5 + 0.5) * clamp01(1.28 - u) * 0.72
        contact_dirt = clamp01((0.13 - min(u, 1.0 - u)) * 5.0) * 0.38
    elif pattern == "contact_scuff":
        streak = abs(math.sin((u * 31.0 + mid * 2.0) * math.pi))
        contact = clamp01((0.18 - abs(v - 0.5)) * 4.2)
        feature = (micro - 0.5) * 0.20 - contact * streak * 0.31
        wear = contact * (0.34 + streak * 0.44)
    elif pattern == "worn_marking":
        chip = value_noise(u, v, 29.0, seed + 53)
        wear = 1.0 if chip > 0.90 and macro < 0.56 else 0.0
        feature = (micro - 0.5) * 0.17 - wear * 0.34

    base = profile["baseRgb"]
    secondary = profile["secondaryRgb"]
    blend = clamp01(0.18 + macro * 0.54 + mid * 0.18)
    color = [clamp01(float(base[i]) + (float(secondary[i]) - float(base[i])) * blend) for i in range(3)]
    if pattern == "painted_panels":
        panel_sequence = (0.83, 0.94, 1.08, 0.89, 1.02, 0.79, 0.97)
        panel_step = panel_sequence[(int(u * 5.0) * 7 + int(v * 4.0) * 11 + seed) % len(panel_sequence)]
        color = [clamp01(channel * panel_step * (1.0 - seam * 0.38 - contact_dirt * 0.10)) for channel in color]
        if wear > 0.34:
            color = [clamp01(channel * 0.48 + exposed) for channel, exposed in zip(color, (0.08, 0.09, 0.095))]
    elif pattern == "thermal_bands":
        # Directional oxide/temper response: steel -> straw -> violet/blue near sustained heat.
        temper = clamp01(wear * 1.22)
        color[0] = clamp01(color[0] + temper * 0.12)
        color[1] = clamp01(color[1] + 0.035 - temper * 0.045)
        color[2] = clamp01(color[2] + 0.050 + temper * 0.018)
    elif pattern == "contact_scuff":
        color = [clamp01(channel + wear * 0.10) for channel in color]
    elif pattern == "worn_marking" and wear > 0.5:
        color = [channel * 0.34 for channel in color]

    rough_min, rough_max = profile["roughnessRange"]
    metal_min, metal_max = profile["metallicRange"]
    ao_min, ao_max = profile["aoRange"]
    roughness = rough_min + (rough_max - rough_min) * clamp01(0.10 + macro * 0.38 + mid * 0.32 + micro * 0.18 + wear * 0.28 + roughness_bias)
    metallic = metal_min + (metal_max - metal_min) * clamp01(0.24 + mid * 0.58 + wear * 0.16)
    ao = ao_min + (ao_max - ao_min) * clamp01(0.32 + macro * 0.42 + mid * 0.26 - seam * 0.34 - contact_dirt * 0.32)
    height = macro * 0.065 + mid * 0.105 + feature * float(profile["normalStrength"])
    return color, roughness, metallic, ao, height


def generate_role_textures(role: str, profile: dict[str, Any], size: int, texture_dir: Path) -> dict[str, Any]:
    seed = sum((index + 1) * ord(char) for index, char in enumerate(role)) + 22079
    base_pixels: list[float] = []
    orm_pixels: list[float] = []
    heights = [0.0] * (size * size)
    stats = {"roughnessMin": 1.0, "roughnessMax": 0.0, "metallicMin": 1.0, "metallicMax": 0.0, "aoMin": 1.0, "aoMax": 0.0}
    for y in range(size):
        v = (y + 0.5) / size
        for x in range(size):
            u = (x + 0.5) / size
            color, roughness, metallic, ao, height = surface_sample(profile, u, v, seed)
            base_pixels.extend((*color, 1.0))
            orm_pixels.extend((ao, roughness, metallic, 1.0))
            heights[y * size + x] = height
            stats["roughnessMin"] = min(stats["roughnessMin"], roughness)
            stats["roughnessMax"] = max(stats["roughnessMax"], roughness)
            stats["metallicMin"] = min(stats["metallicMin"], metallic)
            stats["metallicMax"] = max(stats["metallicMax"], metallic)
            stats["aoMin"] = min(stats["aoMin"], ao)
            stats["aoMax"] = max(stats["aoMax"], ao)

    normal_pixels: list[float] = []
    strength = float(profile["normalStrength"]) * 2.8
    for y in range(size):
        for x in range(size):
            left = heights[y * size + ((x - 1) % size)]
            right = heights[y * size + ((x + 1) % size)]
            down = heights[((y - 1) % size) * size + x]
            up = heights[((y + 1) % size) * size + x]
            nx, ny, nz = (left - right) * strength, (down - up) * strength, 1.0
            inv = 1.0 / math.sqrt(nx * nx + ny * ny + nz * nz)
            normal_pixels.extend((nx * inv * 0.5 + 0.5, ny * inv * 0.5 + 0.5, nz * inv * 0.5 + 0.5, 1.0))

    outputs: dict[str, str] = {}
    for channel, pixels, colorspace in (
        ("basecolor", base_pixels, "sRGB"),
        ("normal", normal_pixels, "Non-Color"),
        ("orm", orm_pixels, "Non-Color"),
    ):
        name = f"SF_FRIGATE_V2_{role}_{channel}"
        image = bpy.data.images.new(name, width=size, height=size, alpha=True, float_buffer=False)
        # Blender 5.1 reallocates/clears a generated image when its color-space role changes.
        # Establish the role first, then populate the authoritative buffer.
        image.colorspace_settings.name = colorspace
        image.pixels.foreach_set(pixels)
        # Blender's generated image buffer is lazily synchronized. Without update(), the saved PNG
        # can be a valid all-black allocation even though the in-memory float array is populated.
        image.update()
        path = texture_dir / f"frigate_v2_{role}_{channel}.png"
        image.filepath_raw = str(path)
        image.file_format = "PNG"
        image.save()
        image.pack()
        outputs[channel] = str(path)
    return {"files": outputs, "stats": {key: round(value, 5) for key, value in stats.items()}}


def load_role_textures(role: str, profile: dict[str, Any], size: int, texture_dir: Path) -> dict[str, Any]:
    outputs: dict[str, str] = {}
    for channel, colorspace in (("basecolor", "sRGB"), ("normal", "Non-Color"), ("orm", "Non-Color")):
        path = texture_dir / f"frigate_v2_{role}_{channel}.png"
        if not path.is_file():
            raise FileNotFoundError(f"--reuse-textures missing {path}")
        image = bpy.data.images.load(str(path), check_existing=False)
        if tuple(image.size) != (size, size):
            raise RuntimeError(f"--reuse-textures resolution mismatch for {path}: {tuple(image.size)} vs {(size, size)}")
        image.name = f"SF_FRIGATE_V2_{role}_{channel}"
        image.colorspace_settings.name = colorspace
        image.pack()
        outputs[channel] = str(path)
    return {
        "files": outputs,
        "reused": True,
        "stats": {
            "roughnessMin": profile["roughnessRange"][0],
            "roughnessMax": profile["roughnessRange"][1],
            "metallicMin": profile["metallicRange"][0],
            "metallicMax": profile["metallicRange"][1],
            "aoMin": profile["aoRange"][0],
            "aoMax": profile["aoRange"][1],
        },
    }


def input_socket(node: bpy.types.Node, *names: str):
    for name in names:
        if name in node.inputs:
            return node.inputs[name]
    return None


def set_socket(node: bpy.types.Node, value: Any, *names: str) -> None:
    socket = input_socket(node, *names)
    if socket is not None:
        socket.default_value = value


def ensure_group_input(group: bpy.types.NodeTree, name: str) -> None:
    if any(getattr(item, "name", None) == name and getattr(item, "in_out", None) == "INPUT" for item in group.interface.items_tree):
        return
    group.interface.new_socket(name=name, in_out="INPUT", socket_type="NodeSocketFloat")


def create_material(role: str, profile: dict[str, Any]) -> bpy.types.Material:
    name = f"SF_FRIGATE_V2_{role.upper()}"
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    material.use_backface_culling = True
    material.diffuse_color = (*profile["baseRgb"], 1.0)
    material["spacefaceMaterialRole"] = role
    material["spacefaceSurfaceRecipe"] = RECIPE_ID
    material["spacefaceRoughnessRange"] = profile["roughnessRange"]
    material["spacefaceMetallicRange"] = profile["metallicRange"]
    material["spacefacePattern"] = profile["pattern"]
    nodes, links = material.node_tree.nodes, material.node_tree.links
    nodes.clear()
    output = nodes.new("ShaderNodeOutputMaterial")
    output.location = (540, 40)
    shader = nodes.new("ShaderNodeBsdfPrincipled")
    shader.location = (230, 40)
    set_socket(shader, (*profile["baseRgb"], 1.0), "Base Color")
    set_socket(shader, sum(profile["roughnessRange"]) * 0.5, "Roughness")
    set_socket(shader, sum(profile["metallicRange"]) * 0.5, "Metallic")
    set_socket(shader, float(profile.get("coatWeight", 0.0)), "Coat Weight", "Clearcoat")
    set_socket(shader, float(profile.get("coatRoughness", 0.35)), "Coat Roughness", "Clearcoat Roughness")
    set_socket(shader, float(profile.get("anisotropy", 0.0)), "Anisotropic IOR Level", "Anisotropic")
    links.new(shader.outputs["BSDF"], output.inputs["Surface"])

    base_image = bpy.data.images[f"SF_FRIGATE_V2_{role}_basecolor"]
    normal_image = bpy.data.images[f"SF_FRIGATE_V2_{role}_normal"]
    orm_image = bpy.data.images[f"SF_FRIGATE_V2_{role}_orm"]
    base = nodes.new("ShaderNodeTexImage")
    base.image = base_image
    base.label = "sRGB base color variation"
    base.location = (-720, 250)
    links.new(base.outputs["Color"], input_socket(shader, "Base Color"))
    orm = nodes.new("ShaderNodeTexImage")
    orm.image = orm_image
    orm.label = "R=AO G=roughness B=metallic"
    orm.location = (-720, -20)
    separate = nodes.new("ShaderNodeSeparateColor")
    separate.location = (-460, -20)
    links.new(orm.outputs["Color"], separate.inputs["Color"])
    links.new(separate.outputs["Green"], input_socket(shader, "Roughness"))
    links.new(separate.outputs["Blue"], input_socket(shader, "Metallic"))
    gltf_group = bpy.data.node_groups.get("glTF Material Output") or bpy.data.node_groups.new("glTF Material Output", "ShaderNodeTree")
    ensure_group_input(gltf_group, "Occlusion")
    gltf_output = nodes.new("ShaderNodeGroup")
    gltf_output.node_tree = gltf_group
    gltf_output.location = (-210, -175)
    links.new(separate.outputs["Red"], gltf_output.inputs["Occlusion"])
    normal = nodes.new("ShaderNodeTexImage")
    normal.image = normal_image
    normal.label = "OpenGL tangent-space normal"
    normal.location = (-720, -330)
    normal_map = nodes.new("ShaderNodeNormalMap")
    normal_map.location = (-420, -330)
    normal_map.inputs["Strength"].default_value = float(profile["normalStrength"])
    links.new(normal.outputs["Color"], normal_map.inputs["Color"])
    links.new(normal_map.outputs["Normal"], input_socket(shader, "Normal"))
    return material


def clear_scene() -> None:
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for material in list(bpy.data.materials):
        bpy.data.materials.remove(material)
    for image in list(bpy.data.images):
        bpy.data.images.remove(image)


def mesh_triangles(obj: bpy.types.Object) -> int:
    return sum(max(0, len(poly.vertices) - 2) for poly in obj.data.polygons) if obj.type == "MESH" else 0


def snapshot_semantics() -> dict[str, Any]:
    return {
        obj.name: {
            "parent": obj.parent.name if obj.parent else None,
            "location": [round(value, 7) for value in obj.location],
            "rotation": [round(value, 7) for value in obj.rotation_euler],
            "scale": [round(value, 7) for value in obj.scale],
        }
        for obj in bpy.context.scene.objects
        if obj.name == "HULL_FRIGATE_ROOT" or obj.name.startswith(SEMANTIC_PREFIXES)
    }


def world_bounds(objects: Iterable[bpy.types.Object]) -> tuple[list[float], list[float]]:
    points: list[Vector] = []
    for obj in objects:
        if obj.type != "MESH" or not obj.data:
            continue
        points.extend(obj.matrix_world @ Vector(corner) for corner in obj.bound_box)
    return ([min(point[i] for point in points) for i in range(3)], [max(point[i] for point in points) for i in range(3)])


def apply_transform(obj: bpy.types.Object) -> None:
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)


def unwrap_metric(obj: bpy.types.Object, cube_size: float = 1.15) -> None:
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.cube_project(cube_size=cube_size, correct_aspect=True, scale_to_bounds=False)
    bpy.ops.object.mode_set(mode="OBJECT")


def finish_mesh(obj: bpy.types.Object, name: str, material: bpy.types.Material, root: bpy.types.Object, bevel: float = 0.025) -> bpy.types.Object:
    obj.name = name
    apply_transform(obj)
    if bevel > 0.0:
        modifier = obj.modifiers.new("SF_PhysicalEdgeBevel", "BEVEL")
        modifier.width = bevel
        modifier.segments = 2
        modifier.limit_method = "ANGLE"
        if hasattr(modifier, "harden_normals"):
            modifier.harden_normals = True
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.modifier_apply(modifier=modifier.name)
    try:
        bpy.ops.object.shade_smooth_by_angle()
    except Exception:
        pass
    unwrap_metric(obj)
    obj.data.materials.clear()
    obj.data.materials.append(material)
    obj["spacefaceSurfaceRecipe"] = RECIPE_ID
    obj["spacefaceMaterialRole"] = material.get("spacefaceMaterialRole")
    world = obj.matrix_world.copy()
    obj.parent = root
    obj.matrix_world = world
    return obj


def add_box(name: str, location: Sequence[float], size: Sequence[float], material: bpy.types.Material, root: bpy.types.Object, rotation: Sequence[float] = (0.0, 0.0, 0.0), bevel: float = 0.025) -> bpy.types.Object:
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=location, rotation=rotation)
    obj = bpy.context.object
    obj.dimensions = size
    return finish_mesh(obj, name, material, root, bevel)


def add_tapered_plate(
    name: str,
    location: Sequence[float],
    length: float,
    aft_width: float,
    forward_width: float,
    thickness: float,
    material: bpy.types.Material,
    root: bpy.types.Object,
    bevel: float = 0.025,
    shear: float = 0.0,
) -> bpy.types.Object:
    """Create a seated, tapered armor plate with actual sidewall thickness.

    The source grammar is +X forward. A small shear offsets the forward edge in Y so paired plates
    can follow the hull shoulder without becoming generic axis-aligned boxes.
    """
    half_l = length * 0.5
    half_t = thickness * 0.5
    aft = aft_width * 0.5
    forward = forward_width * 0.5
    vertices = [
        (-half_l, -aft, -half_t), (-half_l, aft, -half_t),
        (half_l, -forward + shear, -half_t), (half_l, forward + shear, -half_t),
        (-half_l, -aft, half_t), (-half_l, aft, half_t),
        (half_l, -forward + shear, half_t), (half_l, forward + shear, half_t),
    ]
    faces = [
        (0, 2, 3, 1), (4, 5, 7, 6),
        (0, 1, 5, 4), (2, 6, 7, 3),
        (0, 4, 6, 2), (1, 3, 7, 5),
    ]
    mesh = bpy.data.meshes.new(f"{name}_MESH")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    obj.location = location
    return finish_mesh(obj, name, material, root, bevel)


def add_conformal_plate(
    name: str,
    source: bpy.types.Object,
    x_start: float,
    x_end: float,
    aft_width: float,
    forward_width: float,
    thickness: float,
    material: bpy.types.Material,
    root: bpy.types.Object,
    stations: int = 6,
) -> bpy.types.Object:
    """Build a low-cost plate whose underside is sampled from a coarse LOD dorsal surface."""
    if source.type != "MESH":
        raise RuntimeError(f"conformal plate source is not a mesh: {source.name}")
    vertices: list[tuple[float, float, float]] = []
    faces: list[tuple[int, ...]] = []
    station_count = max(2, stations)
    for index in range(station_count):
        alpha = index / (station_count - 1)
        x = x_start + (x_end - x_start) * alpha
        width = aft_width + (forward_width - aft_width) * alpha
        sampled: list[float] = []
        for y in (-width * 0.5, width * 0.5):
            hit, location, _, _ = source.ray_cast(Vector((x, y, 8.0)), Vector((0.0, 0.0, -1.0)))
            if not hit:
                raise RuntimeError(f"conformal plate {name} missed {source.name} at {(x, y)}")
            sampled.append(location.z)
        # Four vertices per station: bottom P/S then top P/S. A 6 mm stand-off prevents z-fighting;
        # the remaining thickness supplies a real edge highlight without changing the coarse outline.
        vertices.extend((
            (x, -width * 0.5, sampled[0] + 0.006),
            (x, width * 0.5, sampled[1] + 0.006),
            (x, -width * 0.5, sampled[0] + thickness),
            (x, width * 0.5, sampled[1] + thickness),
        ))
    for index in range(station_count - 1):
        current = index * 4
        nxt = (index + 1) * 4
        faces.extend((
            (current + 2, nxt + 2, nxt + 3, current + 3),
            (current, current + 1, nxt + 1, nxt),
            (current, nxt, nxt + 2, current + 2),
            (current + 1, current + 3, nxt + 3, nxt + 1),
        ))
    faces.extend(((0, 2, 3, 1),))
    last = (station_count - 1) * 4
    faces.extend(((last, last + 1, last + 3, last + 2),))
    mesh = bpy.data.meshes.new(f"{name}_MESH")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    return finish_mesh(obj, name, material, root, 0.008)


def add_cylinder(name: str, location: Sequence[float], radius: float, depth: float, material: bpy.types.Material, root: bpy.types.Object, rotation: Sequence[float] = (0.0, 0.0, 0.0), vertices: int = 12) -> bpy.types.Object:
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=location, rotation=rotation)
    return finish_mesh(bpy.context.object, name, material, root, min(0.008, radius * 0.18))


def add_text(name: str, body: str, location: Sequence[float], size: float, material: bpy.types.Material, root: bpy.types.Object, rotation: Sequence[float] = (0.0, 0.0, 0.0)) -> bpy.types.Object:
    bpy.ops.object.text_add(location=location, rotation=rotation)
    text = bpy.context.object
    text.data.body = body
    text.data.align_x = "CENTER"
    text.data.align_y = "CENTER"
    text.data.size = size
    text.data.extrude = 0.0025
    text.data.bevel_depth = 0.0012
    text.data.bevel_resolution = 1
    bpy.ops.object.convert(target="MESH")
    return finish_mesh(bpy.context.object, name, material, root, 0.0)


def join_objects(objects: Sequence[bpy.types.Object], name: str) -> bpy.types.Object:
    if len(objects) == 1:
        objects[0].name = name
        return objects[0]
    bpy.ops.object.select_all(action="DESELECT")
    for obj in objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    bpy.ops.object.join()
    result = bpy.context.object
    result.name = name
    return result


def triangulate_mesh(obj: bpy.types.Object) -> None:
    """Resolve ngon tangent ambiguity before glTF export without changing the visible surface."""
    if obj.type != "MESH" or obj.data is None:
        return
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    modifier = obj.modifiers.new("SF_ExportTriangulate", "TRIANGULATE")
    modifier.quad_method = "BEAUTY"
    modifier.ngon_method = "BEAUTY"
    bpy.ops.object.modifier_apply(modifier=modifier.name)


def assign_source_materials(materials: dict[str, bpy.types.Material]) -> dict[str, dict[str, int]]:
    summaries: dict[str, dict[str, int]] = {}
    for obj in [item for item in bpy.context.scene.objects if item.type == "MESH"]:
        if obj.name.startswith(PREFIX):
            continue
        # Existing scaled detail cubes become clean authored meshes without moving sockets or roots.
        apply_transform(obj)
        # Blender emits multi-material primitives beneath a group and names those children from the
        # mesh datablock. The runtime inherits then locally overrides LOD tags, so a stale donor name
        # like LOD0_HULL_CORVETTE on the LOD1 node would misclassify every split primitive as LOD0.
        obj.data.name = obj.name
        for old in list(obj.data.materials):
            obj.data.materials.pop(index=0)
        for role in ROLE_ORDER:
            obj.data.materials.append(materials[role])
        counts = {role: 0 for role in ROLE_ORDER}
        lower_name = obj.name.lower()
        if "authority_stencil" in lower_name or "squadron_stripe" in lower_name or "field_insignia" in lower_name:
            fixed_role = "identity_marking"
        elif "engine_vent" in lower_name:
            fixed_role = "heat_affected_alloy"
        elif "sensor_mast" in lower_name:
            fixed_role = "recessed_machinery"
        elif "turret_collar" in lower_name:
            fixed_role = "exposed_alloy"
        elif "disciplined_wear" in lower_name:
            fixed_role = "docking_contact"
        elif "bridge_super" in lower_name:
            fixed_role = "dark_composite"
        else:
            fixed_role = None
        for polygon in obj.data.polygons:
            role = fixed_role
            if role is None:
                center = polygon.center
                x, y, z = center.x, center.y, center.z
                if obj.name.startswith("LOD2_"):
                    if x < -2.65:
                        role = "heat_affected_alloy"
                    elif z < -0.18:
                        role = "dark_composite"
                    elif abs(y) > 1.18:
                        role = "exposed_alloy"
                    else:
                        role = "coated_armor"
                elif x < -3.45 and (abs(y) > 0.46 or z < 0.82):
                    role = "heat_affected_alloy"
                elif z < -0.62:
                    role = "dark_composite" if x > 0.35 else "exposed_alloy"
                elif abs(y) > 1.72 and x < 2.1:
                    role = "exposed_alloy"
                elif abs(y) < 0.48 and z > 0.62 and -2.5 < x < 3.7:
                    role = "dark_composite"
                else:
                    role = "coated_armor"
            polygon.material_index = ROLE_ORDER.index(role)
            counts[role] += 1
        summaries[obj.name] = {role: count for role, count in counts.items() if count}
    return summaries


def build_detail(materials: dict[str, bpy.types.Material], root: bpy.types.Object) -> list[bpy.types.Object]:
    created: list[bpy.types.Object] = []
    # A dark gasket below the dorsal armor makes the plate stack read as assembled construction,
    # rather than colored polygons painted directly onto one uninterrupted slab.
    created.append(add_tapered_plate(f"{PREFIX}LOD0_DorsalGasket", (0.35, 0.0, 1.765), 5.75, 1.18, 0.72, 0.105, materials["dark_composite"], root, bevel=0.035))

    # ZONE 1 — forward command/sensor armor: stepped, tapered panels with a service hatch and rails.
    dorsal_plates = (
        (2.85, 1.44, 0.72, 1.02, 1.835),
        (1.35, 1.42, 1.03, 1.18, 1.875),
        (-0.15, 1.42, 1.18, 1.32, 1.845),
        (-1.62, 1.37, 1.31, 1.14, 1.805),
    )
    for index, (x, length, aft_w, forward_w, z) in enumerate(dorsal_plates):
        created.append(add_tapered_plate(f"{PREFIX}LOD0_DorsalArmor_{index}", (x, 0.0, z), length, aft_w, forward_w, 0.115, materials["coated_armor"], root, bevel=0.045))
        created.append(add_box(f"{PREFIX}LOD0_DorsalForwardSeam_{index}", (x + length * 0.43, 0.0, z + 0.065), (0.055, min(aft_w, forward_w) * 0.74, 0.026), materials["exposed_alloy"], root, bevel=0.006))
    # The very thin tapered inset stays unbeveled: beveling this 30 mm recess generates two
    # degenerate tangent vertices after role joining/export. The overlying hatch supplies the edge
    # highlight while this layer remains a clean, valid dark gasket.
    created.append(add_tapered_plate(f"{PREFIX}LOD0_CommandAccessInset", (1.30, 0.0, 1.946), 0.76, 0.53, 0.59, 0.030, materials["recessed_machinery"], root, bevel=0.0))
    created.append(add_tapered_plate(f"{PREFIX}LOD0_CommandAccessHatch", (1.30, 0.0, 1.972), 0.58, 0.39, 0.45, 0.030, materials["coated_armor"], root, bevel=0.014))
    for y in (-0.25, 0.25):
        created.append(add_box(f"{PREFIX}LOD0_CommandHatchRail_{'P' if y < 0 else 'S'}", (1.30, y, 1.995), (0.48, 0.035, 0.025), materials["docking_contact"], root, bevel=0.006))

    # ZONE 2 — three-piece shoulder armor and readable attachment logic around the service spine.
    shoulder_sections = (
        (2.75, 1.20, 0.43, 0.29, 1.24),
        (1.32, 1.44, 0.50, 0.43, 1.28),
        (-0.25, 1.48, 0.54, 0.48, 1.25),
        (-1.82, 1.43, 0.48, 0.38, 1.19),
    )
    for side in (-1.0, 1.0):
        side_name = 'P' if side < 0 else 'S'
        for index, (x, length, aft_w, forward_w, z) in enumerate(shoulder_sections):
            y = side * (1.34 + 0.035 * (index % 2))
            created.append(add_tapered_plate(f"{PREFIX}LOD0_ShoulderArmor_{side_name}_{index}", (x, y, z), length, aft_w, forward_w, 0.13, materials["coated_armor"], root, bevel=0.045, shear=side * 0.035))
            created.append(add_box(f"{PREFIX}LOD0_ShoulderRoot_{side_name}_{index}", (x - length * 0.36, side * 1.16, z - 0.16), (0.20, 0.38, 0.24), materials["recessed_machinery"], root, bevel=0.025))
        created.append(add_box(f"{PREFIX}LOD0_RadiatorRoot_{side_name}", (-0.35, side * 1.72, 0.72), (2.75, 0.105, 0.50), materials["dark_composite"], root, bevel=0.022))
        for index, x in enumerate((-1.28, -0.72, -0.16, 0.40)):
            created.append(add_box(f"{PREFIX}LOD0_RadiatorFin_{side_name}_{index}", (x, side * 1.79, 0.72), (0.065, 0.045, 0.39), materials["exposed_alloy"], root, bevel=0.006))
        created.append(add_box(f"{PREFIX}LOD0_DockingContact_{side_name}", (-0.45, side * 2.14, -0.26), (0.92, 0.12, 0.54), materials["docking_contact"], root, bevel=0.035))

    created.append(add_tapered_plate(f"{PREFIX}LOD0_ProtectedServiceSpine", (-0.55, 0.0, 2.035), 3.58, 0.38, 0.28, 0.12, materials["dark_composite"], root, bevel=0.04))
    created.append(add_box(f"{PREFIX}LOD0_VentralKeel", (-0.25, 0.0, -1.26), (4.8, 0.42, 0.18), materials["exposed_alloy"], root, bevel=0.05))
    created.append(add_box(f"{PREFIX}LOD0_AftMachineryBay", (-3.05, 0.0, 1.34), (1.36, 1.06, 0.20), materials["recessed_machinery"], root, bevel=0.035))

    # ZONE 3 — propulsion service and heat-management cluster. The shrouds are segmented metal,
    # with dark vent roots and visible mounting bridges, so the aft zone no longer reads as a brown
    # triangular color polygon.
    for side in (-1.0, 1.0):
        side_name = 'P' if side < 0 else 'S'
        created.append(add_tapered_plate(f"{PREFIX}LOD0_ThermalShroud_{side_name}", (-4.28, side * 1.05, 0.61), 1.72, 0.78, 0.56, 0.18, materials["heat_affected_alloy"], root, bevel=0.06, shear=side * 0.08))
        created.append(add_box(f"{PREFIX}LOD0_ThermalRoot_{side_name}", (-3.82, side * 0.74, 0.68), (1.08, 0.20, 0.24), materials["recessed_machinery"], root, bevel=0.025))
        for index, x in enumerate((-4.78, -4.38, -3.98, -3.58)):
            created.append(add_box(f"{PREFIX}LOD0_HeatBaffle_{side_name}_{index}", (x, side * 0.82, 1.35), (0.19, 0.36, 0.105), materials["heat_affected_alloy"], root, bevel=0.018))
            created.append(add_box(f"{PREFIX}LOD0_HeatBaffleGap_{side_name}_{index}", (x + 0.115, side * 0.82, 1.31), (0.045, 0.28, 0.085), materials["recessed_machinery"], root, bevel=0.004))
        created.append(add_box(f"{PREFIX}LOD0_EngineServiceBridge_{side_name}", (-4.62, side * 0.41, 1.14), (0.62, 0.22, 0.17), materials["exposed_alloy"], root, bevel=0.03))

    # Restrained non-emissive identity: a repeated Varden split-chevron, hull number, and service
    # stencil. It shares the marking roughness/wear map, so it reads as painted/maintained structure.
    for side in (-1.0, 1.0):
        side_name = 'P' if side < 0 else 'S'
        created.append(add_box(f"{PREFIX}LOD0_VardenChevronLong_{side_name}", (2.06, side * 1.615, 1.10), (1.16, 0.025, 0.105), materials["identity_marking"], root, rotation=(0.0, 0.0, side * 0.10), bevel=0.006))
        created.append(add_box(f"{PREFIX}LOD0_VardenChevronShort_{side_name}", (2.52, side * 1.621, 0.94), (0.62, 0.025, 0.085), materials["identity_marking"], root, rotation=(0.0, 0.0, side * -0.10), bevel=0.006))
        created.append(add_text(f"{PREFIX}LOD0_HullId_{side_name}", "VN-407", (0.78, side * 1.645, 1.03), 0.145, materials["identity_marking"], root, rotation=(side * math.pi * 0.5, 0.0, 0.0)))
    created.append(add_text(f"{PREFIX}LOD0_ServiceStencil", "A7  WARDEN", (0.0, 0.0, 2.105), 0.17, materials["identity_marking"], root))

    # Joined fastener rails and hatch latches add highlight cadence without per-object runtime draws.
    for side in (-1.0, 1.0):
        side_name = 'P' if side < 0 else 'S'
        for x in (-1.92, -1.22, -0.52, 0.18, 0.88, 1.58, 2.28, 2.98):
            created.append(add_cylinder(f"{PREFIX}LOD0_Fastener_{side_name}_{x:+.2f}", (x, side * 1.385, 1.355), 0.048, 0.042, materials["exposed_alloy"], root, vertices=10))

    # LOD1 preserves command spine, shoulder segmentation and aft thermal identity.
    created.append(add_tapered_plate(f"{PREFIX}LOD1_ServiceSpine", (-0.10, 0.0, 1.82), 4.80, 0.82, 0.55, 0.13, materials["dark_composite"], root, bevel=0.04))
    for side in (-1.0, 1.0):
        side_name = 'P' if side < 0 else 'S'
        created.append(add_tapered_plate(f"{PREFIX}LOD1_ShoulderArmor_{side_name}", (0.55, side * 1.36, 1.20), 3.92, 0.52, 0.34, 0.12, materials["coated_armor"], root, bevel=0.045))
        created.append(add_tapered_plate(f"{PREFIX}LOD1_ThermalShoulder_{side_name}", (-4.20, side * 1.05, 0.51), 1.42, 0.68, 0.48, 0.18, materials["heat_affected_alloy"], root, bevel=0.05))
        created.append(add_box(f"{PREFIX}LOD1_IdentityBar_{side_name}", (1.78, side * 1.62, 1.04), (1.42, 0.024, 0.11), materials["identity_marking"], root, bevel=0.006))

    # LOD2 stays cheap but retains the dominant service spine, heat-zone and manufacturer stripe.
    lod2_body = bpy.data.objects.get("LOD2_HULL_FRIGATE_SILHOUETTE")
    if lod2_body is None:
        raise RuntimeError("LOD2 body missing before conformal surface pass")
    created.append(add_conformal_plate(f"{PREFIX}LOD2_ServiceSpine", lod2_body, -2.10, 1.72, 0.54, 0.38, 0.045, materials["dark_composite"], root))
    created.append(add_conformal_plate(f"{PREFIX}LOD2_AftHeatMass", lod2_body, -4.48, -2.82, 1.02, 0.78, 0.052, materials["heat_affected_alloy"], root, stations=5))
    # The manufacturer bar follows the source skin just outside the central spine, keeping it
    # readable without becoming a free-floating billboard on the reduced mesh.
    created.append(add_conformal_plate(f"{PREFIX}LOD2_IdentityBar", lod2_body, 0.38, 1.55, 0.16, 0.13, 0.058, materials["identity_marking"], root, stations=3))

    # Join same-LOD/same-role construction into bounded draw groups while retaining metadata.
    grouped: dict[tuple[str, str], list[bpy.types.Object]] = {}
    for obj in created:
        lod = "LOD2" if "LOD2_" in obj.name else "LOD1" if "LOD1_" in obj.name else "LOD0"
        role = str(obj.get("spacefaceMaterialRole"))
        grouped.setdefault((lod, role), []).append(obj)
    joined: list[bpy.types.Object] = []
    for (lod, role), objects in grouped.items():
        result = join_objects(objects, f"{lod}_SURFACE_FRIGATE_{role.upper()}")
        result["spacefaceSurfaceRecipe"] = RECIPE_ID
        result["spacefaceMaterialRole"] = role
        joined.append(result)
    return joined


def export_candidate(output_path: Path) -> None:
    bpy.ops.object.select_all(action="SELECT")
    kwargs = {
        "filepath": str(output_path),
        "export_format": "GLB",
        "use_selection": True,
        "export_apply": True,
        "export_yup": True,
        "export_extras": True,
        "export_texcoords": True,
        "export_normals": True,
        "export_tangents": True,
        "export_materials": "EXPORT",
        "export_cameras": False,
        "export_lights": False,
    }
    try:
        bpy.ops.export_scene.gltf(**kwargs)
    except TypeError:
        bpy.ops.export_scene.gltf(**{key: value for key, value in kwargs.items() if key not in {"export_tangents", "export_cameras", "export_lights"}})


def main() -> dict[str, Any]:
    args = parse_args()
    spec = load_spec()
    source = Path(args.input).resolve()
    output_dir = Path(args.output_dir).resolve()
    guard_paths(source, output_dir)
    if args.texture_size < 256 or args.texture_size > 1024 or args.texture_size & (args.texture_size - 1):
        raise RuntimeError("--texture-size must be a power of two from 256 through 1024")
    expected = spec["input"]
    source_hash = sha256_file(source)
    if source_hash != expected["sha256"] or source.stat().st_size != expected["bytes"]:
        raise RuntimeError(f"immutable source drift: {source_hash} / {source.stat().st_size}")
    output_dir.mkdir(parents=True, exist_ok=True)
    texture_dir = output_dir / "textures"
    texture_dir.mkdir(parents=True, exist_ok=True)

    clear_scene()
    bpy.ops.import_scene.gltf(filepath=str(source))
    root = bpy.data.objects.get("HULL_FRIGATE_ROOT")
    if root is None:
        raise RuntimeError("HULL_FRIGATE_ROOT missing")
    before_semantics = snapshot_semantics()
    before_bounds = world_bounds(bpy.context.scene.objects)
    source_triangles = sum(mesh_triangles(obj) for obj in bpy.context.scene.objects)

    texture_receipts = {}
    for role in ROLE_ORDER:
        generator = load_role_textures if args.reuse_textures else generate_role_textures
        texture_receipts[role] = generator(role, spec["materialProfiles"][role], args.texture_size, texture_dir)
    materials = {role: create_material(role, spec["materialProfiles"][role]) for role in ROLE_ORDER}
    source_assignments = assign_source_materials(materials)
    added = build_detail(materials, root)
    for mesh_object in [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]:
        triangulate_mesh(mesh_object)
    if snapshot_semantics() != before_semantics:
        raise RuntimeError("root/mount/socket transforms changed")
    after_bounds = world_bounds(bpy.context.scene.objects)
    # Detail must remain within the original hull volume envelope; tolerance is exporter precision.
    if any(after_bounds[0][axis] < before_bounds[0][axis] - 0.012 or after_bounds[1][axis] > before_bounds[1][axis] + 0.012 for axis in range(3)):
        raise RuntimeError(f"surface construction escaped silhouette bounds: before={before_bounds} after={after_bounds}")
    unapplied_mesh_scales = {obj.name: list(obj.scale) for obj in bpy.context.scene.objects if obj.type == "MESH" and any(abs(value - 1.0) > 1e-6 for value in obj.scale)}
    if unapplied_mesh_scales:
        raise RuntimeError(f"unapplied mesh scale: {unapplied_mesh_scales}")

    blend_path = output_dir / "hull_frigate_golden_v2.blend"
    glb_path = output_dir / "hull_frigate_golden_v2.glb"
    bpy.ops.wm.save_as_mainfile(filepath=str(blend_path), check_existing=False)
    export_candidate(glb_path)
    if sha256_file(source) != source_hash:
        raise RuntimeError("input source changed during build")

    report = {
        "schema": "spaceface.goldenFrigateSurface.blenderRun.v2",
        "recipeId": RECIPE_ID,
        "status": "scratch_candidate_generated",
        "visualAcceptance": "controller_review_required",
        "blenderVersion": bpy.app.version_string,
        "input": {"path": str(source), "bytes": source.stat().st_size, "sha256": source_hash, "unchanged": True},
        "candidate": {
            "blend": {"path": str(blend_path), "bytes": blend_path.stat().st_size, "sha256": sha256_file(blend_path)},
            "glb": {"path": str(glb_path), "bytes": glb_path.stat().st_size, "sha256": sha256_file(glb_path)},
            "sourceTriangles": source_triangles,
            "addedObjectsAfterRoleJoin": len(added),
            "addedTriangles": sum(mesh_triangles(obj) for obj in added),
            "materialRoles": list(ROLE_ORDER),
            "beforeBounds": [[round(value, 6) for value in row] for row in before_bounds],
            "afterBounds": [[round(value, 6) for value in row] for row in after_bounds],
            "semanticNodes": sorted(before_semantics),
            "meshScalesApplied": True,
            "sourceMaterialAssignments": source_assignments,
        },
        "textures": texture_receipts,
        "unresolved": [
            "Controller must inspect Blender and Three.js captures before integration.",
            "Scratch KTX2/meshopt candidate and Khronos validation are produced by the companion CLI step.",
            "Runtime manifest, release output and player route remain intentionally untouched.",
        ],
    }
    report_path = output_dir / "blender-run-report.json"
    atomic_json(report_path, report)
    return {"ok": True, "report": str(report_path), "reportSha256": sha256_file(report_path), "glb": str(glb_path)}


def cli_entrypoint() -> None:
    try:
        receipt = main()
    except BaseException:
        traceback.print_exc(file=sys.stderr)
        sys.stdout.flush()
        sys.stderr.flush()
        os._exit(1)
    print(json.dumps(receipt, sort_keys=True))


if __name__ == "__main__":
    cli_entrypoint()

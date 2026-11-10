#!/usr/bin/env python3
"""Build scratch-only Varden cockpit, engine, and stabilator candidates for ship_warden.

The recipe validates immutable snapshots of the three current donor GLBs, preserves their root and
hook semantics, repairs the proportions that the runtime X-length normalizer exposes, and authors a
shared but function-specific Principled/PBR material language. It never edits canonical inputs,
manifests, release outputs, locks, or runtime maps.
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
RECIPE_ID = "golden-warden-module-triad-v1"
PREFIX = "SF_WARDEN_TRIAD_V1__"
ROLE_ORDER = (
    "varden_armor", "varden_alloy", "dark_composite", "cockpit_glass",
    "engine_ceramic", "heat_alloy", "radiator_laminate", "recessed_machinery",
    "identity_marking", "powered_aperture",
)
ASSET_ROLES = {
    "cockpit_recessed": ("varden_armor", "varden_alloy", "dark_composite", "cockpit_glass", "recessed_machinery", "identity_marking", "powered_aperture"),
    "engine_plasma_ring": ("varden_armor", "varden_alloy", "dark_composite", "engine_ceramic", "heat_alloy", "recessed_machinery", "identity_marking", "powered_aperture"),
    "fin_stabilator": ("varden_armor", "varden_alloy", "dark_composite", "radiator_laminate", "recessed_machinery", "identity_marking"),
}


def parse_args() -> argparse.Namespace:
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input-root", default=str(REPO_ROOT / ".devshots/graphics/warden-module-triad-v1/input"))
    parser.add_argument("--output-dir", default=str(REPO_ROOT / ".devshots/graphics/warden-module-triad-v1/candidate"))
    parser.add_argument("--texture-size", type=int, default=512)
    parser.add_argument("--reuse-textures", action="store_true")
    return parser.parse_args(argv)


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest().upper()


def atomic_json(path: Path, payload: dict[str, Any]) -> None:
    temp = path.with_suffix(path.suffix + ".tmp")
    temp.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    temp.replace(path)


def is_within(path: Path, parent: Path) -> bool:
    try:
        path.resolve().relative_to(parent.resolve())
        return True
    except ValueError:
        return False


def guard_paths(input_root: Path, output_dir: Path) -> None:
    scratch = REPO_ROOT / ".devshots/graphics/warden-module-triad-v1"
    if not is_within(input_root, scratch) or not is_within(output_dir, scratch):
        raise RuntimeError("recipe requires immutable input and output below the Warden scratch root")
    forbidden = (
        REPO_ROOT / "assets/ships/parts", REPO_ROOT / "assets/ships/release",
        REPO_ROOT / "assets/ships/release.__building", REPO_ROOT / "assets/ships/release.__previous",
    )
    if any(is_within(output_dir, root) for root in forbidden):
        raise RuntimeError(f"refusing canonical/release output: {output_dir}")


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
    x, y = u * period, v * period
    ix, iy = math.floor(x), math.floor(y)
    fx, fy = smooth(x - ix), smooth(y - iy)
    a = hash_noise(ix % period, iy % period, seed)
    b = hash_noise((ix + 1) % period, iy % period, seed)
    c = hash_noise(ix % period, (iy + 1) % period, seed)
    d = hash_noise((ix + 1) % period, (iy + 1) % period, seed)
    top = a + (b - a) * fx
    bottom = c + (d - c) * fx
    return top + (bottom - top) * fy


def surface_sample(profile: dict[str, Any], u: float, v: float, seed: int) -> tuple[list[float], float, float, float, float, float]:
    macro = value_noise(u, v, 3.0, seed)
    mid = value_noise(u, v, 13.0, seed + 37)
    micro = value_noise(u, v, 91.0, seed + 101)
    pattern = profile["pattern"]
    feature = (micro - 0.5) * 0.13
    rough_bias = 0.0
    grime = 0.0
    emissive = 0.0
    if pattern == "painted_panels":
        gu, gv = min((u * 5.0) % 1.0, 1.0 - (u * 5.0) % 1.0), min((v * 4.0) % 1.0, 1.0 - (v * 4.0) % 1.0)
        seam = clamp01((0.035 - min(gu, gv)) / 0.035)
        scratch = max(0.0, math.sin((u * 83.0 + mid * 1.6) * math.tau) - 0.972)
        feature += (macro - 0.5) * 0.12 - seam * 0.38 + scratch * 0.19
        grime = seam * (0.24 + (1.0 - mid) * 0.38)
        rough_bias = (int(u * 5) * 5 + int(v * 4) * 3 + seed) % 7 / 26.0 - 0.1
    elif pattern == "brushed_alloy":
        feature += math.sin((u * 181.0 + mid * 1.5) * math.tau) * 0.11 + math.sin((u * 37.0 + v * 2.0) * math.tau) * 0.025
    elif pattern == "composite_laminate":
        feature += math.sin(u * math.tau * 43.0) * math.sin(v * math.tau * 39.0) * 0.17 + math.sin((u * 7 + v * 2) * math.tau) * 0.045
    elif pattern == "glass_laminate":
        feature += math.sin((u * 9.0 + v * 4.0) * math.tau) * 0.018 + (macro - 0.5) * 0.022
        rough_bias = -0.08 + mid * 0.04
    elif pattern == "ceramic_tiles":
        gu, gv = abs(math.sin(u * math.pi * 7.0)), abs(math.sin(v * math.pi * 5.0))
        seam = clamp01((0.12 - min(gu, gv)) * 3.3)
        feature += (macro - 0.5) * 0.12 - seam * 0.28
        grime = seam * 0.42
        rough_bias = seam * 0.12
    elif pattern == "thermal_bands":
        band = math.sin((u * 6.0 + macro * 0.8) * math.pi)
        feature += band * 0.12 + math.sin((u * 149.0 + mid) * math.tau) * 0.04
        rough_bias = band * 0.13
        grime = clamp01(0.12 - min(u, 1.0 - u)) * 2.9
    elif pattern == "radiator_channels":
        channel = clamp01((0.12 - abs(math.sin(v * math.pi * 18.0))) * 4.0)
        feature += (micro - 0.5) * 0.19 - channel * 0.48
        grime = channel * 0.48
        rough_bias = channel * 0.14
    elif pattern == "machinery_channels":
        channel = clamp01((0.14 - abs(math.sin(v * math.pi * 23.0))) * 4.3)
        feature += (micro - 0.5) * 0.25 - channel * 0.52
        grime = channel * 0.55 + (1.0 - mid) * 0.16
    elif pattern == "worn_marking":
        chip = 1.0 if mid > 0.87 and macro < 0.58 else 0.0
        feature += (micro - 0.5) * 0.15 - chip * 0.34
        grime = chip * 0.62
    elif pattern == "powered_aperture":
        pulse = 0.72 + math.sin((u * 5.0 + macro * 0.4) * math.tau) * 0.16
        emissive = clamp01(pulse * (0.74 + mid * 0.26))
        feature += math.sin(v * math.tau * 17.0) * 0.08
        rough_bias = -0.1

    base, secondary = profile["baseRgb"], profile["secondaryRgb"]
    blend = clamp01(0.16 + macro * 0.54 + mid * 0.2)
    color = [clamp01(base[i] + (secondary[i] - base[i]) * blend) for i in range(3)]
    if pattern == "thermal_bands":
        temper = clamp01(0.36 + math.sin((u * 5.5 + macro * 0.4) * math.pi) * 0.45)
        color = [clamp01(color[0] + temper * 0.12), clamp01(color[1] - temper * 0.035), clamp01(color[2] + temper * 0.045)]
    if grime:
        color = [channel * (1.0 - grime * 0.28) for channel in color]
    if pattern == "worn_marking" and grime > 0.4:
        color = [channel * 0.32 for channel in color]

    rough_min, rough_max = profile["roughnessRange"]
    metal_min, metal_max = profile["metallicRange"]
    ao_min, ao_max = profile["aoRange"]
    roughness = rough_min + (rough_max - rough_min) * clamp01(0.1 + macro * 0.38 + mid * 0.31 + micro * 0.18 + rough_bias + grime * 0.18)
    metallic = metal_min + (metal_max - metal_min) * clamp01(0.2 + mid * 0.62 + grime * 0.09)
    ao = ao_min + (ao_max - ao_min) * clamp01(0.35 + macro * 0.4 + mid * 0.24 - grime * 0.4)
    height = macro * 0.065 + mid * 0.1 + feature * float(profile["normalStrength"])
    return color, roughness, metallic, ao, height, emissive


def generate_role_textures(role: str, profile: dict[str, Any], size: int, texture_dir: Path) -> dict[str, Any]:
    seed = sum((index + 1) * ord(char) for index, char in enumerate(role)) + 31091
    base_pixels: list[float] = []
    orm_pixels: list[float] = []
    emissive_pixels: list[float] = []
    heights = [0.0] * (size * size)
    stats = {"roughnessMin": 1.0, "roughnessMax": 0.0, "metallicMin": 1.0, "metallicMax": 0.0, "aoMin": 1.0, "aoMax": 0.0}
    for y in range(size):
        v = (y + 0.5) / size
        for x in range(size):
            u = (x + 0.5) / size
            color, roughness, metallic, ao, height, emissive = surface_sample(profile, u, v, seed)
            base_pixels.extend((*color, 1.0))
            orm_pixels.extend((ao, roughness, metallic, 1.0))
            if profile.get("emissiveRgb"):
                emissive_pixels.extend((*(channel * emissive for channel in profile["emissiveRgb"]), 1.0))
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
            left, right = heights[y * size + ((x - 1) % size)], heights[y * size + ((x + 1) % size)]
            down, up = heights[((y - 1) % size) * size + x], heights[((y + 1) % size) * size + x]
            nx, ny, nz = (left - right) * strength, (down - up) * strength, 1.0
            inv = 1.0 / math.sqrt(nx * nx + ny * ny + nz * nz)
            normal_pixels.extend((nx * inv * 0.5 + 0.5, ny * inv * 0.5 + 0.5, nz * inv * 0.5 + 0.5, 1.0))
    outputs: dict[str, str] = {}
    channels = [("basecolor", base_pixels, "sRGB"), ("normal", normal_pixels, "Non-Color"), ("orm", orm_pixels, "Non-Color")]
    if emissive_pixels:
        channels.append(("emissive", emissive_pixels, "sRGB"))
    for channel, pixels, colorspace in channels:
        name = f"SF_WARDEN_V1_{role}_{channel}"
        image = bpy.data.images.new(name, width=size, height=size, alpha=True, float_buffer=False)
        image.colorspace_settings.name = colorspace
        image.pixels.foreach_set(pixels)
        image.update()
        path = texture_dir / f"warden_v1_{role}_{channel}.png"
        image.filepath_raw = str(path)
        image.file_format = "PNG"
        image.save()
        image.pack()
        outputs[channel] = str(path)
    return {"files": outputs, "stats": {key: round(value, 5) for key, value in stats.items()}}


def load_role_textures(role: str, profile: dict[str, Any], size: int, texture_dir: Path) -> dict[str, Any]:
    channels = [("basecolor", "sRGB"), ("normal", "Non-Color"), ("orm", "Non-Color")]
    if profile.get("emissiveRgb"):
        channels.append(("emissive", "sRGB"))
    outputs: dict[str, str] = {}
    for channel, colorspace in channels:
        path = texture_dir / f"warden_v1_{role}_{channel}.png"
        if not path.is_file():
            raise FileNotFoundError(f"--reuse-textures missing {path}")
        image = bpy.data.images.load(str(path), check_existing=False)
        if tuple(image.size) != (size, size):
            raise RuntimeError(f"texture resolution drift: {path}")
        image.name = f"SF_WARDEN_V1_{role}_{channel}"
        image.colorspace_settings.name = colorspace
        image.pack()
        outputs[channel] = str(path)
    return {"files": outputs, "reused": True}


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
    material = bpy.data.materials.new(f"SF_WARDEN_V1_{role.upper()}")
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
    output.location = (560, 40)
    shader = nodes.new("ShaderNodeBsdfPrincipled")
    shader.location = (260, 40)
    set_socket(shader, (*profile["baseRgb"], 1.0), "Base Color")
    set_socket(shader, sum(profile["roughnessRange"]) * 0.5, "Roughness")
    set_socket(shader, sum(profile["metallicRange"]) * 0.5, "Metallic")
    set_socket(shader, float(profile.get("coatWeight", 0.0)), "Coat Weight", "Clearcoat")
    set_socket(shader, float(profile.get("coatRoughness", 0.35)), "Coat Roughness", "Clearcoat Roughness")
    set_socket(shader, float(profile.get("anisotropy", 0.0)), "Anisotropic IOR Level", "Anisotropic")
    links.new(shader.outputs["BSDF"], output.inputs["Surface"])
    base = nodes.new("ShaderNodeTexImage")
    base.image = bpy.data.images[f"SF_WARDEN_V1_{role}_basecolor"]
    base.location = (-720, 260)
    links.new(base.outputs["Color"], input_socket(shader, "Base Color"))
    orm = nodes.new("ShaderNodeTexImage")
    orm.image = bpy.data.images[f"SF_WARDEN_V1_{role}_orm"]
    orm.location = (-720, -30)
    separate = nodes.new("ShaderNodeSeparateColor")
    separate.location = (-460, -30)
    links.new(orm.outputs["Color"], separate.inputs["Color"])
    links.new(separate.outputs["Green"], input_socket(shader, "Roughness"))
    links.new(separate.outputs["Blue"], input_socket(shader, "Metallic"))
    gltf_group = bpy.data.node_groups.get("glTF Material Output") or bpy.data.node_groups.new("glTF Material Output", "ShaderNodeTree")
    ensure_group_input(gltf_group, "Occlusion")
    gltf_output = nodes.new("ShaderNodeGroup")
    gltf_output.node_tree = gltf_group
    gltf_output.location = (-210, -180)
    links.new(separate.outputs["Red"], gltf_output.inputs["Occlusion"])
    normal = nodes.new("ShaderNodeTexImage")
    normal.image = bpy.data.images[f"SF_WARDEN_V1_{role}_normal"]
    normal.location = (-720, -350)
    normal_map = nodes.new("ShaderNodeNormalMap")
    normal_map.location = (-430, -350)
    normal_map.inputs["Strength"].default_value = float(profile["normalStrength"])
    links.new(normal.outputs["Color"], normal_map.inputs["Color"])
    links.new(normal_map.outputs["Normal"], input_socket(shader, "Normal"))
    if profile.get("emissiveRgb"):
        emissive = nodes.new("ShaderNodeTexImage")
        emissive.image = bpy.data.images[f"SF_WARDEN_V1_{role}_emissive"]
        emissive.location = (-420, 360)
        links.new(emissive.outputs["Color"], input_socket(shader, "Emission Color", "Emission"))
        set_socket(shader, float(profile.get("emissiveStrength", 1.0)), "Emission Strength")
    return material


def clear_scene() -> None:
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for collection in list(bpy.data.collections):
        if collection.name != "Collection":
            bpy.data.collections.remove(collection)
    for material in list(bpy.data.materials):
        bpy.data.materials.remove(material)
    for image in list(bpy.data.images):
        bpy.data.images.remove(image)


def apply_transform(obj: bpy.types.Object) -> None:
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)


def unwrap_metric(obj: bpy.types.Object, cube_size: float = 1.05) -> None:
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.cube_project(cube_size=cube_size, correct_aspect=True, scale_to_bounds=False)
    bpy.ops.object.mode_set(mode="OBJECT")


def finish_mesh(obj: bpy.types.Object, name: str, material: bpy.types.Material, parent: bpy.types.Object, bevel: float = 0.018) -> bpy.types.Object:
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
    obj.parent = parent
    obj.matrix_world = world
    return obj


def add_box(name: str, location: Sequence[float], size: Sequence[float], material: bpy.types.Material, parent: bpy.types.Object, rotation: Sequence[float] = (0, 0, 0), bevel: float = 0.018) -> bpy.types.Object:
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=location, rotation=rotation)
    obj = bpy.context.object
    obj.dimensions = size
    return finish_mesh(obj, name, material, parent, bevel)


def add_tapered_plate(name: str, location: Sequence[float], length: float, aft_width: float, forward_width: float, thickness: float, material: bpy.types.Material, parent: bpy.types.Object, bevel: float = 0.018) -> bpy.types.Object:
    half_l, half_t = length * 0.5, thickness * 0.5
    aft, forward = aft_width * 0.5, forward_width * 0.5
    vertices = [
        (-half_l, -aft, -half_t), (-half_l, aft, -half_t), (half_l, -forward, -half_t), (half_l, forward, -half_t),
        (-half_l, -aft, half_t), (-half_l, aft, half_t), (half_l, -forward, half_t), (half_l, forward, half_t),
    ]
    faces = [(0, 2, 3, 1), (4, 5, 7, 6), (0, 1, 5, 4), (2, 6, 7, 3), (0, 4, 6, 2), (1, 3, 7, 5)]
    mesh = bpy.data.meshes.new(f"{name}_MESH")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    obj.location = location
    return finish_mesh(obj, name, material, parent, bevel)


def add_sloped_wedge(name: str, location: Sequence[float], length: float, aft_width: float, forward_width: float, aft_height: float, forward_height: float, material: bpy.types.Material, parent: bpy.types.Object, bevel: float = 0.018) -> bpy.types.Object:
    """Create a closed, protected canopy segment with a sloped reflective crown."""
    half_l = length * 0.5
    aft, forward = aft_width * 0.5, forward_width * 0.5
    vertices = [
        (-half_l, -aft, 0.0), (-half_l, aft, 0.0), (half_l, -forward, 0.0), (half_l, forward, 0.0),
        (-half_l, -aft, aft_height), (-half_l, aft, aft_height), (half_l, -forward, forward_height), (half_l, forward, forward_height),
    ]
    faces = [(0, 2, 3, 1), (4, 5, 7, 6), (0, 1, 5, 4), (2, 6, 7, 3), (0, 4, 6, 2), (1, 3, 7, 5)]
    mesh = bpy.data.meshes.new(f"{name}_MESH")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    obj.location = location
    return finish_mesh(obj, name, material, parent, bevel)


def add_cylinder(name: str, location: Sequence[float], radius: float, depth: float, material: bpy.types.Material, parent: bpy.types.Object, axis: str = "X", vertices: int = 24, bevel: float = 0.012) -> bpy.types.Object:
    rotation = (0, math.pi * 0.5, 0) if axis == "X" else (math.pi * 0.5, 0, 0) if axis == "Y" else (0, 0, 0)
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=location, rotation=rotation)
    return finish_mesh(bpy.context.object, name, material, parent, min(bevel, radius * 0.16))


def add_torus_segment(name: str, location: Sequence[float], major_radius: float, minor_radius: float, theta0: float, theta1: float, material: bpy.types.Material, parent: bpy.types.Object, major_steps: int = 18, minor_steps: int = 8) -> bpy.types.Object:
    vertices: list[tuple[float, float, float]] = []
    faces: list[tuple[int, int, int, int]] = []
    for i in range(major_steps + 1):
        theta = theta0 + (theta1 - theta0) * (i / major_steps)
        for j in range(minor_steps):
            phi = math.tau * j / minor_steps
            vertices.append((
                location[0] + minor_radius * math.cos(phi),
                location[1] + (major_radius + minor_radius * math.sin(phi)) * math.cos(theta),
                location[2] + (major_radius + minor_radius * math.sin(phi)) * math.sin(theta),
            ))
    for i in range(major_steps):
        for j in range(minor_steps):
            a, b = i * minor_steps + j, i * minor_steps + (j + 1) % minor_steps
            c, d = (i + 1) * minor_steps + (j + 1) % minor_steps, (i + 1) * minor_steps + j
            faces.append((a, b, c, d))
    mesh = bpy.data.meshes.new(f"{name}_MESH")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    return finish_mesh(obj, name, material, parent, 0.0)


def join_role_groups(objects: Iterable[bpy.types.Object], asset: str, main_name: str | None = None) -> list[bpy.types.Object]:
    grouped: dict[tuple[str, str], list[bpy.types.Object]] = {}
    for obj in objects:
        lod = "LOD2" if "LOD2_" in obj.name else "LOD1" if "LOD1_" in obj.name else "LOD0"
        role = str(obj.get("spacefaceMaterialRole"))
        grouped.setdefault((lod, role), []).append(obj)
    joined: list[bpy.types.Object] = []
    for (lod, role), members in grouped.items():
        bpy.ops.object.select_all(action="DESELECT")
        for obj in members:
            obj.select_set(True)
        bpy.context.view_layer.objects.active = members[0]
        if len(members) > 1:
            bpy.ops.object.join()
        result = bpy.context.object
        if main_name and lod == "LOD0" and role == "engine_ceramic":
            result.name = main_name
        else:
            result.name = f"{lod}_{asset.upper()}_{role.upper()}"
        result.data.name = result.name
        result["spacefaceSurfaceRecipe"] = RECIPE_ID
        result["spacefaceMaterialRole"] = role
        joined.append(result)
    return joined


def add_empty(name: str, parent: bpy.types.Object | None = None, location: Sequence[float] = (0, 0, 0)) -> bpy.types.Object:
    obj = bpy.data.objects.new(name, None)
    bpy.context.collection.objects.link(obj)
    obj.empty_display_type = "PLAIN_AXES"
    obj.empty_display_size = 0.12
    obj.location = location
    obj.parent = parent
    return obj


def build_cockpit(materials: dict[str, bpy.types.Material]) -> bpy.types.Object:
    root = add_empty("cockpit_recessed")
    root["spacefaceSurfaceRecipe"] = RECIPE_ID
    lods = {level: add_empty(f"LOD{level}_COCKPIT_RECESSED_ROOT", root) for level in range(3)}
    created: list[bpy.types.Object] = []
    # LOD0: low protected canopy, real armor thickness, frame ribs, sensor aperture, and rooted service hardware.
    created += [
        add_tapered_plate(f"{PREFIX}LOD0_CockpitUndertray", (1.95, 0, -0.08), 5.7, 1.62, 0.58, 0.18, materials["dark_composite"], lods[0], 0.032),
        add_tapered_plate(f"{PREFIX}LOD0_CockpitLowerArmor", (1.92, 0, 0.04), 5.46, 1.56, 0.52, 0.18, materials["varden_armor"], lods[0], 0.045),
        add_sloped_wedge(f"{PREFIX}LOD0_CanopyGlassA", (0.96, 0, 0.19), 1.22, 1.0, 1.14, 0.25, 0.34, materials["cockpit_glass"], lods[0], 0.045),
        add_sloped_wedge(f"{PREFIX}LOD0_CanopyGlassB", (2.15, 0, 0.19), 1.18, 1.14, 1.03, 0.34, 0.31, materials["cockpit_glass"], lods[0], 0.045),
        add_sloped_wedge(f"{PREFIX}LOD0_CanopyGlassC", (3.28, 0, 0.19), 1.12, 1.03, 0.76, 0.31, 0.18, materials["cockpit_glass"], lods[0], 0.042),
        add_tapered_plate(f"{PREFIX}LOD0_ArmoredBrow", (4.28, 0, 0.24), 0.78, 0.78, 0.42, 0.25, materials["varden_armor"], lods[0], 0.055),
        add_tapered_plate(f"{PREFIX}LOD0_RearServiceGasket", (-0.34, 0, 0.08), 0.92, 1.42, 1.1, 0.2, materials["recessed_machinery"], lods[0], 0.04),
        add_tapered_plate(f"{PREFIX}LOD0_RearServiceArmor", (-0.30, 0, 0.22), 0.72, 1.2, 0.92, 0.16, materials["varden_armor"], lods[0], 0.04),
    ]
    for side in (-1, 1):
        created.append(add_box(f"{PREFIX}LOD0_FrameRail_{side:+}", (2.18, side * 0.64, 0.32), (3.68, 0.16, 0.13), materials["varden_alloy"], lods[0], rotation=(0, side * -0.025, 0), bevel=0.03))
        created.append(add_box(f"{PREFIX}LOD0_LowerGasket_{side:+}", (1.52, side * 0.77, 0.02), (3.92, 0.14, 0.16), materials["dark_composite"], lods[0], bevel=0.025))
        created.append(add_box(f"{PREFIX}LOD0_IdentitySlash_{side:+}", (0.02, side * 0.78, 0.20), (0.68, 0.018, 0.11), materials["identity_marking"], lods[0], rotation=(side * math.pi * 0.5, 0, 0.15), bevel=0.004))
    for index, (x, z, width) in enumerate(((0.36, 0.40, 1.03), (1.57, 0.51, 1.16), (2.73, 0.49, 1.06), (3.83, 0.36, 0.78))):
        created.append(add_box(f"{PREFIX}LOD0_CanopyRib_{index}", (x, 0, z), (0.065, width, 0.075), materials["varden_alloy"], lods[0], bevel=0.015))
    for index, y in enumerate((-0.34, 0.0, 0.34)):
        created.append(add_box(f"{PREFIX}LOD0_RearServiceVent_{index}", (-0.32, y, 0.325), (0.46, 0.12, 0.035), materials["recessed_machinery"], lods[0], bevel=0.006))
    created.append(add_box(f"{PREFIX}LOD0_ProtectedSensorAperture", (4.66, 0, 0.19), (0.13, 0.34, 0.12), materials["powered_aperture"], lods[0], bevel=0.018))
    for side in (-1, 1):
        for x in (-0.55, 0.15, 0.85, 1.55, 2.25, 2.95, 3.65):
            created.append(add_cylinder(f"{PREFIX}LOD0_FrameFastener_{side:+}_{x:+.2f}", (x, side * 0.80, 0.09), 0.045, 0.025, materials["varden_alloy"], lods[0], axis="Y", vertices=10, bevel=0.005))
    # LOD1 and LOD2 retain protected glass and frame identity without micro hardware.
    created += [
        add_tapered_plate(f"{PREFIX}LOD1_CockpitBody", (1.95, 0, 0.0), 5.7, 1.6, 0.58, 0.28, materials["varden_armor"], lods[1], 0.045),
        add_tapered_plate(f"{PREFIX}LOD1_Canopy", (2.25, 0, 0.34), 3.75, 1.14, 0.72, 0.28, materials["cockpit_glass"], lods[1], 0.055),
        add_box(f"{PREFIX}LOD1_Frame", (2.23, 0, 0.44), (0.15, 1.23, 0.18), materials["varden_alloy"], lods[1], bevel=0.025),
        add_box(f"{PREFIX}LOD1_ServiceRoot", (-0.32, 0, 0.16), (0.96, 1.46, 0.42), materials["recessed_machinery"], lods[1], bevel=0.05),
        add_tapered_plate(f"{PREFIX}LOD2_CockpitBody", (1.95, 0, 0.0), 5.7, 1.56, 0.56, 0.3, materials["varden_armor"], lods[2], 0.045),
        add_tapered_plate(f"{PREFIX}LOD2_Canopy", (2.38, 0, 0.3), 3.45, 1.06, 0.66, 0.24, materials["cockpit_glass"], lods[2], 0.05),
        add_box(f"{PREFIX}LOD2_Root", (-0.3, 0, 0.12), (0.92, 1.4, 0.38), materials["dark_composite"], lods[2], bevel=0.045),
    ]
    join_role_groups(created, "cockpit_recessed")
    add_empty("HOOK_Emissive", root)
    return root


def build_engine(materials: dict[str, bpy.types.Material]) -> bpy.types.Object:
    root = add_empty("engine_plasma_ring")
    root["spacefaceSurfaceRecipe"] = RECIPE_ID
    lods = {level: add_empty(f"LOD{level}_ENGINE_PLASMA_RING_ROOT", root) for level in range(3)}
    created: list[bpy.types.Object] = []
    created += [
        add_cylinder(f"{PREFIX}LOD0_CoreSleeve", (1.015, 0, 0), 0.33, 2.75, materials["recessed_machinery"], lods[0], "X", 28, 0.035),
        add_cylinder(f"{PREFIX}LOD0_ForwardCeramicHousing", (1.54, 0, 0), 0.49, 1.62, materials["engine_ceramic"], lods[0], "X", 28, 0.04),
        add_cylinder(f"{PREFIX}LOD0_HeatSleeve", (0.34, 0, 0), 0.39, 1.12, materials["heat_alloy"], lods[0], "X", 28, 0.025),
        add_cylinder(f"{PREFIX}LOD0_ApertureGasket", (-0.265, 0, 0), 0.31, 0.18, materials["dark_composite"], lods[0], "X", 28, 0.018),
        add_cylinder(f"{PREFIX}LOD0_PoweredAperture", (-0.355, 0, 0), 0.19, 0.025, materials["powered_aperture"], lods[0], "X", 24, 0.004),
    ]
    for index, x in enumerate((0.86, 1.58, 2.18)):
        created.append(add_cylinder(f"{PREFIX}LOD0_CeramicPanelBand_{index}", (x, 0, 0), 0.505, 0.055, materials["varden_alloy"], lods[0], "X", 28, 0.008))
    # Opaque segmented ceramic collar replaces the former full-body emissive ring.
    for segment in range(8):
        theta0 = segment * math.tau / 8 + math.radians(4.0)
        theta1 = (segment + 1) * math.tau / 8 - math.radians(4.0)
        created.append(add_torus_segment(f"{PREFIX}LOD0_CeramicCollar_{segment}", (-0.02, 0, 0), 0.49, 0.11, theta0, theta1, materials["engine_ceramic"], lods[0], 12, 8))
    for index, angle in enumerate((0, math.pi * 0.5, math.pi, math.pi * 1.5)):
        y, z = math.cos(angle) * 0.45, math.sin(angle) * 0.45
        created.append(add_box(f"{PREFIX}LOD0_ServiceRail_{index}", (1.16, y, z), (1.88, 0.1, 0.1), materials["varden_alloy"], lods[0], rotation=(angle, 0, 0), bevel=0.018))
        created.append(add_box(f"{PREFIX}LOD0_RailRoot_{index}", (0.34, y * 0.88, z * 0.88), (0.22, 0.16, 0.16), materials["recessed_machinery"], lods[0], rotation=(angle, 0, 0), bevel=0.025))
    for index, angle in enumerate(range(0, 360, 60)):
        rad = math.radians(angle)
        y, z = math.cos(rad) * 0.22, math.sin(rad) * 0.22
        created.append(add_box(f"{PREFIX}LOD0_ApertureVane_{index}", (-0.32, y, z), (0.12, 0.07, 0.21), materials["heat_alloy"], lods[0], rotation=(rad, 0, 0), bevel=0.01))
    created.append(add_box(f"{PREFIX}LOD0_VardenEngineMark", (1.48, 0, 0.515), (0.66, 0.18, 0.026), materials["identity_marking"], lods[0], bevel=0.006))
    created += [
        add_cylinder(f"{PREFIX}LOD1_EngineBody", (1.015, 0, 0), 0.47, 2.77, materials["engine_ceramic"], lods[1], "X", 20, 0.04),
        add_cylinder(f"{PREFIX}LOD1_HeatSleeve", (0.26, 0, 0), 0.36, 0.86, materials["heat_alloy"], lods[1], "X", 20, 0.025),
        # Keep the aft functional read at normal distance. The aperture well sits just proud of
        # the generated cylinder cap, while the physical lip stays inside the accepted LOD0 bounds.
        add_torus_segment(f"{PREFIX}LOD1_AftNozzleLip", (-0.33, 0, 0), 0.35, 0.045, 0.0, math.tau, materials["heat_alloy"], lods[1], 24, 8),
        add_cylinder(f"{PREFIX}LOD1_ApertureWell", (-0.365, 0, 0), 0.295, 0.024, materials["dark_composite"], lods[1], "X", 20, 0.002),
        add_cylinder(f"{PREFIX}LOD1_Aperture", (-0.378, 0, 0), 0.15, 0.004, materials["powered_aperture"], lods[1], "X", 16, 0.001),
        add_cylinder(f"{PREFIX}LOD1_StructuralBand", (1.15, 0, 0), 0.485, 0.075, materials["varden_alloy"], lods[1], "X", 20, 0.008),
        add_box(f"{PREFIX}LOD1_Identity", (1.4, 0, 0.49), (0.68, 0.16, 0.026), materials["identity_marking"], lods[1], bevel=0.005),
        add_cylinder(f"{PREFIX}LOD2_EngineBody", (1.015, 0, 0), 0.44, 2.77, materials["engine_ceramic"], lods[2], "X", 14, 0.035),
        add_cylinder(f"{PREFIX}LOD2_AftHeat", (-0.04, 0, 0), 0.34, 0.66, materials["heat_alloy"], lods[2], "X", 14, 0.02),
        add_torus_segment(f"{PREFIX}LOD2_AftNozzleLip", (-0.335, 0, 0), 0.325, 0.04, 0.0, math.tau, materials["heat_alloy"], lods[2], 16, 6),
        add_cylinder(f"{PREFIX}LOD2_ApertureWell", (-0.365, 0, 0), 0.265, 0.024, materials["dark_composite"], lods[2], "X", 14, 0.002),
        add_cylinder(f"{PREFIX}LOD2_Aperture", (-0.378, 0, 0), 0.12, 0.004, materials["powered_aperture"], lods[2], "X", 12, 0.001),
        add_cylinder(f"{PREFIX}LOD2_StructuralBand", (1.08, 0, 0), 0.455, 0.07, materials["varden_alloy"], lods[2], "X", 14, 0.007),
    ]
    join_role_groups(created, "engine_plasma_ring", "LOD0_ENGINE_PLASMA_RING_MAIN")
    add_empty("HOOK_DRIVE_CORE", root, (-0.05, 0, 0))
    add_empty("HOOK_DRIVE_FAN", root, (0.25, 0, 0))
    add_empty("HOOK_DRIVE_PLUME", root, (-0.22, 0, 0))
    return root


def build_fin(materials: dict[str, bpy.types.Material]) -> bpy.types.Object:
    root = add_empty("fin_stabilator")
    root["spacefaceSurfaceRecipe"] = RECIPE_ID
    lods = {level: add_empty(f"LOD{level}_FIN_STABILATOR_ROOT", root) for level in range(3)}
    created: list[bpy.types.Object] = []
    created += [
        add_tapered_plate(f"{PREFIX}LOD0_FinCompositeCore", (2.2, 0, 0), 4.8, 1.6, 0.3, 0.18, materials["dark_composite"], lods[0], 0.045),
        add_tapered_plate(f"{PREFIX}LOD0_FinArmorCap", (2.26, 0, 0.13), 4.52, 1.42, 0.26, 0.1, materials["varden_armor"], lods[0], 0.04),
        add_tapered_plate(f"{PREFIX}LOD0_RadiatorField", (2.05, 0, 0.205), 3.66, 1.16, 0.34, 0.045, materials["radiator_laminate"], lods[0], 0.012),
        add_cylinder(f"{PREFIX}LOD0_HingeSpine", (0.18, 0, 0.03), 0.14, 1.48, materials["varden_alloy"], lods[0], "Y", 20, 0.018),
        add_box(f"{PREFIX}LOD0_HingeRoot", (0.35, 0, -0.05), (0.7, 1.44, 0.26), materials["recessed_machinery"], lods[0], bevel=0.035),
    ]
    for side in (-1, 1):
        created.append(add_box(f"{PREFIX}LOD0_RootBracket_{side:+}", (0.52, side * 0.62, 0.0), (0.76, 0.24, 0.34), materials["varden_alloy"], lods[0], bevel=0.032))
        created.append(add_box(f"{PREFIX}LOD0_IdentityTick_{side:+}", (1.12, side * 0.58, 0.275), (0.72, 0.14, 0.025), materials["identity_marking"], lods[0], rotation=(0, 0.05, side * 0.08), bevel=0.005))
    for index, x in enumerate((1.12, 1.68, 2.24, 2.8, 3.36)):
        width = max(0.22, 1.18 - index * 0.18)
        created.append(add_box(f"{PREFIX}LOD0_RadiatorRib_{index}", (x, 0, 0.245), (0.07, width, 0.055), materials["varden_alloy"], lods[0], bevel=0.008))
    for side in (-1, 1):
        for x in (0.65, 1.25, 1.85, 2.45, 3.05):
            created.append(add_cylinder(f"{PREFIX}LOD0_FinFastener_{side:+}_{x:+.2f}", (x, side * max(0.18, 0.68 - x * 0.12), 0.268), 0.035, 0.028, materials["varden_alloy"], lods[0], "Z", 10, 0.004))
    created += [
        add_tapered_plate(f"{PREFIX}LOD1_FinBody", (2.2, 0, 0), 4.8, 1.56, 0.3, 0.24, materials["dark_composite"], lods[1], 0.045),
        add_tapered_plate(f"{PREFIX}LOD1_ArmorShoulder", (2.1, 0, 0.145), 4.05, 1.38, 0.28, 0.065, materials["varden_armor"], lods[1], 0.018),
        add_tapered_plate(f"{PREFIX}LOD1_Radiator", (2.05, 0, 0.195), 3.55, 1.1, 0.26, 0.05, materials["radiator_laminate"], lods[1], 0.012),
        add_cylinder(f"{PREFIX}LOD1_Hinge", (0.2, 0, 0), 0.15, 1.46, materials["varden_alloy"], lods[1], "Y", 14, 0.018),
        add_box(f"{PREFIX}LOD1_ServiceEdge", (1.48, -0.52, 0.232), (1.55, 0.09, 0.026), materials["identity_marking"], lods[1], rotation=(0, 0.035, -0.055), bevel=0.005),
        add_tapered_plate(f"{PREFIX}LOD2_FinBody", (2.2, 0, 0), 4.8, 1.5, 0.28, 0.24, materials["dark_composite"], lods[2], 0.045),
        add_tapered_plate(f"{PREFIX}LOD2_ArmorShoulder", (2.12, 0, 0.145), 4.0, 1.32, 0.27, 0.065, materials["varden_armor"], lods[2], 0.017),
        add_tapered_plate(f"{PREFIX}LOD2_Radiator", (2.08, 0, 0.192), 3.35, 1.02, 0.25, 0.048, materials["radiator_laminate"], lods[2], 0.011),
        add_box(f"{PREFIX}LOD2_HingeRoot", (0.35, 0, 0), (0.72, 1.32, 0.3), materials["varden_alloy"], lods[2], bevel=0.035),
    ]
    join_role_groups(created, "fin_stabilator")
    add_empty("HOOK_Emissive", root)
    return root


def descendants(root: bpy.types.Object) -> list[bpy.types.Object]:
    result = [root]
    for child in root.children:
        result.extend(descendants(child))
    return result


def mesh_triangles(root: bpy.types.Object) -> int:
    return sum(sum(max(0, len(poly.vertices) - 2) for poly in obj.data.polygons) for obj in descendants(root) if obj.type == "MESH")


def world_bounds(root: bpy.types.Object) -> tuple[list[float], list[float]]:
    points: list[Vector] = []
    for obj in descendants(root):
        if obj.type == "MESH":
            points.extend(obj.matrix_world @ Vector(corner) for corner in obj.bound_box)
    return ([min(point[i] for point in points) for i in range(3)], [max(point[i] for point in points) for i in range(3)])


def triangulate_meshes(root: bpy.types.Object) -> None:
    for obj in descendants(root):
        if obj.type != "MESH":
            continue
        bpy.ops.object.select_all(action="DESELECT")
        obj.select_set(True)
        bpy.context.view_layer.objects.active = obj
        modifier = obj.modifiers.new("SF_ExportTriangulate", "TRIANGULATE")
        modifier.quad_method = "BEAUTY"
        modifier.ngon_method = "BEAUTY"
        bpy.ops.object.modifier_apply(modifier=modifier.name)


def export_root(root: bpy.types.Object, output: Path) -> None:
    # Blender object names are scene-global, while standalone module contracts may legitimately
    # reuse HOOK_Emissive. Temporarily give the selected hierarchy the exact export semantic and
    # park the other module's duplicate, then restore the inspectable triad Blend afterwards.
    rename_restore: list[tuple[bpy.types.Object, str]] = []
    if root.name in {"cockpit_recessed", "fin_stabilator"}:
        selected_objects = set(descendants(root))
        hook = next((obj for obj in selected_objects if obj.name.startswith("HOOK_Emissive")), None)
        if hook is None:
            raise RuntimeError(f"{root.name}: HOOK_Emissive authoring node missing")
        for obj in bpy.data.objects:
            if obj not in selected_objects and obj.name == "HOOK_Emissive":
                rename_restore.append((obj, obj.name))
                obj.name = f"{obj.name}__PARKED_FOR_{root.name.upper()}"
        rename_restore.append((hook, hook.name))
        hook.name = "HOOK_Emissive"
    bpy.ops.object.select_all(action="DESELECT")
    for obj in descendants(root):
        obj.select_set(True)
    bpy.context.view_layer.objects.active = root
    kwargs = {
        "filepath": str(output), "export_format": "GLB", "use_selection": True,
        "export_apply": True, "export_yup": True, "export_extras": True,
        "export_texcoords": True, "export_normals": True, "export_tangents": True,
        "export_materials": "EXPORT", "export_cameras": False, "export_lights": False,
    }
    try:
        bpy.ops.export_scene.gltf(**kwargs)
    except TypeError:
        bpy.ops.export_scene.gltf(**{key: value for key, value in kwargs.items() if key not in {"export_tangents", "export_cameras", "export_lights"}})
    finally:
        # Restore the selected hook first so the parked exact name can be reclaimed without a .001.
        for obj, old_name in reversed(rename_restore):
            obj.name = old_name


def main() -> dict[str, Any]:
    args = parse_args()
    spec = json.loads(SPEC_PATH.read_text(encoding="utf-8"))
    if spec.get("recipeId") != RECIPE_ID:
        raise RuntimeError("recipe/spec mismatch")
    input_root, output_dir = Path(args.input_root).resolve(), Path(args.output_dir).resolve()
    guard_paths(input_root, output_dir)
    if args.texture_size < 256 or args.texture_size > 1024 or args.texture_size & (args.texture_size - 1):
        raise RuntimeError("--texture-size must be a power of two from 256 through 1024")
    receipts = {}
    for asset, expected in spec["inputs"].items():
        path = input_root / expected["file"]
        if not path.is_file():
            raise FileNotFoundError(path)
        actual = {"path": str(path), "bytes": path.stat().st_size, "sha256": sha256_file(path)}
        if actual["bytes"] != expected["bytes"] or actual["sha256"] != expected["sha256"]:
            raise RuntimeError(f"immutable snapshot drift for {asset}: {actual}")
        receipts[asset] = actual
    output_dir.mkdir(parents=True, exist_ok=True)
    texture_dir = output_dir / "textures"
    texture_dir.mkdir(parents=True, exist_ok=True)
    clear_scene()
    texture_receipts = {}
    for role in ROLE_ORDER:
        generator = load_role_textures if args.reuse_textures else generate_role_textures
        texture_receipts[role] = generator(role, spec["materialProfiles"][role], args.texture_size, texture_dir)
    materials = {role: create_material(role, spec["materialProfiles"][role]) for role in ROLE_ORDER}
    roots = {
        "cockpit_recessed": build_cockpit(materials),
        "engine_plasma_ring": build_engine(materials),
        "fin_stabilator": build_fin(materials),
    }
    outputs = {}
    for asset, root in roots.items():
        triangulate_meshes(root)
        unapplied = {obj.name: list(obj.scale) for obj in descendants(root) if obj.type == "MESH" and any(abs(value - 1.0) > 1e-6 for value in obj.scale)}
        if unapplied:
            raise RuntimeError(f"unapplied scale in {asset}: {unapplied}")
        glb = output_dir / f"{asset}_golden_v1.glb"
        export_root(root, glb)
        bounds = world_bounds(root)
        outputs[asset] = {
            "glb": {"path": str(glb), "bytes": glb.stat().st_size, "sha256": sha256_file(glb)},
            "triangles": mesh_triangles(root),
            "boundsBlender": [[round(value, 6) for value in row] for row in bounds],
            "roles": list(ASSET_ROLES[asset]),
            "semanticNodes": sorted(obj.name for obj in descendants(root) if obj.type == "EMPTY"),
        }
    blend = output_dir / "warden_module_triad_golden_v1.blend"
    bpy.ops.wm.save_as_mainfile(filepath=str(blend), check_existing=False)
    for asset, expected in spec["inputs"].items():
        if sha256_file(input_root / expected["file"]) != receipts[asset]["sha256"]:
            raise RuntimeError(f"input changed during build: {asset}")
    report = {
        "schema": "spaceface.goldenWardenModuleTriad.blenderRun.v1",
        "recipeId": RECIPE_ID,
        "status": "scratch_candidate_generated",
        "visualAcceptance": "controller_review_required",
        "blenderVersion": bpy.app.version_string,
        "inputs": receipts,
        "candidateBlend": {"path": str(blend), "bytes": blend.stat().st_size, "sha256": sha256_file(blend)},
        "assets": outputs,
        "textures": texture_receipts,
        "unresolved": [
            "Matched isolated and assembled Warden captures require controller visual review.",
            "KTX2/meshopt candidates, Khronos validation, and draw counts are produced by companion CLI checks.",
            "Canonical assets, manifests, release outputs, locks, and runtime maps remain intentionally untouched."
        ],
    }
    report_path = output_dir / "blender-run-report.json"
    atomic_json(report_path, report)
    return {"ok": True, "report": str(report_path), "reportSha256": sha256_file(report_path), "assets": len(outputs)}


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

#!/usr/bin/env python3
"""Build scratch-only golden candidates for three weak reusable ship modules.

This recipe imports immutable GLB snapshots, preserves their root transforms and semantic nodes,
adds deterministic macro/meso/micro construction, authors role-specific Principled PBR texture sets,
and exports scratch LOD candidates. It refuses to write into any production asset or release tree.

Coordinate contract: recipe geometry is expressed in SpaceFace/glTF coordinates
(+X forward, +Y up, +Z starboard, metres) and converted to Blender's Z-up coordinates at creation.
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
PREFIX = "GOLDEN_REUSABLE_V1__"
COLLECTION_PREFIX = "SF_GOLDEN_REUSABLE_V1__"
RECIPE_ID = "golden-reusable-modules-v1"
TIER_MAX_LOD = {"macro": 2, "meso": 1, "micro": 0}
LOD_TIERS = {0: {"macro", "meso", "micro"}, 1: {"macro", "meso"}, 2: {"macro"}}


def parse_args() -> argparse.Namespace:
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--module", choices=("all", "cockpit_slab", "engine_industrial", "weapon_railgun"), default="all")
    parser.add_argument(
        "--input-root",
        default=str(REPO_ROOT / ".devshots" / "graphics" / "golden-reusable-input-v1"),
        help="Immutable scratch snapshot root containing cockpits/, engines/, and weapons/.",
    )
    parser.add_argument(
        "--output-dir",
        default=str(REPO_ROOT / ".devshots" / "graphics" / "golden-reusable-modules-v1"),
        help="Disposable candidate/evidence output. Production asset roots are rejected.",
    )
    parser.add_argument("--texture-size", type=int, default=256)
    parser.add_argument("--lods", default="0,1,2")
    parser.add_argument("--no-export", action="store_true", help="Save inspected .blend sources but skip GLB export.")
    return parser.parse_args(argv)


def load_spec() -> dict[str, Any]:
    data = json.loads(SPEC_PATH.read_text(encoding="utf-8"))
    if data.get("recipeId") != RECIPE_ID:
        raise RuntimeError(f"recipe/spec mismatch: expected {RECIPE_ID}")
    return data


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest().upper()


def normalize_path(path: Path) -> Path:
    return path.expanduser().resolve()


def is_within(path: Path, parent: Path) -> bool:
    try:
        path.relative_to(parent)
        return True
    except ValueError:
        return False


def guard_output_path(output_dir: Path) -> None:
    forbidden = (
        REPO_ROOT / "assets" / "ships" / "parts",
        REPO_ROOT / "assets" / "ships" / "release",
        REPO_ROOT / "assets" / "ships" / "release.__building",
        REPO_ROOT / "assets" / "ships" / "release.__previous",
    )
    if any(is_within(output_dir, root.resolve()) for root in forbidden):
        raise RuntimeError(f"refusing production/release output path: {output_dir}")


def gltf_to_blender(point: Sequence[float]) -> tuple[float, float, float]:
    x, y, z = (float(value) for value in point)
    return x, -z, y


def blender_to_gltf(point: Sequence[float]) -> tuple[float, float, float]:
    x, y, z = (float(value) for value in point)
    return x, z, -y


def gltf_size_to_blender(size: Sequence[float]) -> tuple[float, float, float]:
    x, y, z = (abs(float(value)) for value in size)
    return x, z, y


def clear_scene() -> None:
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for collection in list(bpy.data.collections):
        if collection.name != bpy.context.scene.collection.name:
            bpy.data.collections.remove(collection)
    # Retain only the shared golden library between modules so a stale imported donor cannot force
    # canonical material names to gain .001 suffixes on the next immutable source snapshot.
    for material in list(bpy.data.materials):
        if material.get("spacefaceSurfaceRecipe") != RECIPE_ID:
            bpy.data.materials.remove(material)
    for image in list(bpy.data.images):
        if not image.name.startswith("SF_GOLDEN_V1_"):
            bpy.data.images.remove(image)


def remove_prior_pass() -> None:
    for obj in list(bpy.data.objects):
        if obj.name.startswith(PREFIX) or obj.get("sf_golden_recipe") == RECIPE_ID:
            data = obj.data
            bpy.data.objects.remove(obj, do_unlink=True)
            if data is not None and getattr(data, "users", 1) == 0 and isinstance(data, bpy.types.Mesh):
                bpy.data.meshes.remove(data)
    for collection in list(bpy.data.collections):
        if collection.name.startswith(COLLECTION_PREFIX):
            bpy.data.collections.remove(collection)


def _hash_noise(ix: int, iy: int, seed: int) -> float:
    value = (ix * 0x1F123BB5) ^ (iy * 0x5F356495) ^ (seed * 0x2C1B3C6D)
    value &= 0xFFFFFFFF
    value ^= value >> 15
    value = (value * 0x2C1B3C6D) & 0xFFFFFFFF
    value ^= value >> 12
    value = (value * 0x297A2D39) & 0xFFFFFFFF
    value ^= value >> 15
    return value / 0xFFFFFFFF


def _smooth(value: float) -> float:
    return value * value * (3.0 - 2.0 * value)


def value_noise(u: float, v: float, scale: float, seed: int) -> float:
    # Periodic lattice noise keeps the generated maps tileable when metric UVs cross 0..1.
    period = max(1, int(round(scale)))
    x = u * period
    y = v * period
    ix = math.floor(x)
    iy = math.floor(y)
    fx = _smooth(x - ix)
    fy = _smooth(y - iy)
    a = _hash_noise(ix % period, iy % period, seed)
    b = _hash_noise((ix + 1) % period, iy % period, seed)
    c = _hash_noise(ix % period, (iy + 1) % period, seed)
    d = _hash_noise((ix + 1) % period, (iy + 1) % period, seed)
    ab = a + (b - a) * fx
    cd = c + (d - c) * fx
    return ab + (cd - ab) * fy


def clamp01(value: float) -> float:
    return min(1.0, max(0.0, value))


def surface_sample(profile: dict[str, Any], u: float, v: float, seed: int) -> tuple[list[float], float, float, float, float]:
    macro = value_noise(u, v, float(profile["macroScale"]), seed)
    broad = value_noise(u, v, max(0.7, float(profile["macroScale"]) * 0.43), seed + 41)
    micro = value_noise(u, v, float(profile["microScale"]), seed + 97)
    pattern = profile["pattern"]
    feature = 0.0
    wear = 0.0

    if pattern == "paint_orange_peel":
        feature = (micro - 0.5) * 0.56 + (broad - 0.5) * 0.2
        wear = 1.0 if value_noise(u, v, 17.0, seed + 211) > 0.935 and macro < 0.43 else 0.0
    elif pattern == "directional_brush":
        brush = math.sin((u * 137.0 + value_noise(u, v, 8.0, seed + 17) * 2.4) * math.tau)
        feature = brush * 0.18 + (micro - 0.5) * 0.2
        wear = max(0.0, 0.48 - abs(v - 0.5)) * 0.35
    elif pattern == "composite_weave":
        weave = math.sin(u * math.tau * 43.0) * math.sin(v * math.tau * 37.0)
        feature = weave * 0.2 + (micro - 0.5) * 0.12
    elif pattern == "optical_waviness":
        feature = (broad - 0.5) * 0.22 + math.sin((u + v * 0.37) * math.tau * 2.0) * 0.035
    elif pattern == "worn_marking":
        chip = value_noise(u, v, 23.0, seed + 53)
        wear = 1.0 if chip > 0.89 and macro < 0.5 else 0.0
        feature = (micro - 0.5) * 0.24 - wear * 0.42
    elif pattern == "thermal_ceramic":
        heat_band = math.sin((u * 3.5 + broad * 0.65) * math.pi)
        feature = (micro - 0.5) * 0.34 + heat_band * 0.12
        wear = max(0.0, 0.55 - u) * 0.32
    elif pattern == "thermal_oxidation":
        heat_band = math.sin((u * 4.0 + macro * 0.8) * math.pi)
        feature = (micro - 0.5) * 0.24 + heat_band * 0.14
        wear = (heat_band * 0.5 + 0.5) * 0.32
    elif pattern == "machined_grime":
        groove = abs(math.sin(v * math.tau * 19.0))
        feature = (micro - 0.5) * 0.32 - max(0.0, 0.18 - groove) * 0.65
        wear = (1.0 - broad) * 0.2

    base = profile["baseRgb"]
    tint = profile["macroTintRgb"]
    variation = (macro - 0.5) * 1.7
    color = [clamp01(float(base[i]) + float(tint[i]) * variation) for i in range(3)]
    if wear > 0.5 and pattern in {"paint_orange_peel", "worn_marking"}:
        color = [value * 0.44 for value in color]
    if pattern == "thermal_oxidation":
        color[0] = clamp01(color[0] + wear * 0.09)
        color[2] = clamp01(color[2] + (1.0 - wear) * 0.055)

    rough_min, rough_max = (float(value) for value in profile["roughnessRange"])
    metal_min, metal_max = (float(value) for value in profile["metallicRange"])
    ao_min, ao_max = (float(value) for value in profile["aoRange"])
    roughness = rough_min + (rough_max - rough_min) * clamp01(0.2 + macro * 0.52 + micro * 0.22 + wear * 0.2)
    metallic = metal_min + (metal_max - metal_min) * clamp01(0.28 + broad * 0.62)
    ao = ao_min + (ao_max - ao_min) * clamp01(0.35 + broad * 0.65)
    height = broad * 0.28 + macro * 0.36 + feature * float(profile["normalStrength"])
    return color, roughness, metallic, ao, height


def generate_role_textures(role: str, profile: dict[str, Any], size: int, texture_dir: Path) -> dict[str, Path]:
    texture_dir.mkdir(parents=True, exist_ok=True)
    seed = sum((index + 1) * ord(char) for index, char in enumerate(role)) + 17011
    base_pixels: list[float] = []
    orm_pixels: list[float] = []
    heights = [0.0] * (size * size)
    for y in range(size):
        v = (y + 0.5) / size
        for x in range(size):
            u = (x + 0.5) / size
            color, roughness, metallic, ao, height = surface_sample(profile, u, v, seed)
            base_pixels.extend((color[0], color[1], color[2], 1.0))
            orm_pixels.extend((ao, roughness, metallic, 1.0))
            heights[y * size + x] = height

    normal_pixels: list[float] = []
    strength = float(profile["normalStrength"]) * 4.0
    for y in range(size):
        for x in range(size):
            left = heights[y * size + ((x - 1) % size)]
            right = heights[y * size + ((x + 1) % size)]
            down = heights[((y - 1) % size) * size + x]
            up = heights[((y + 1) % size) * size + x]
            nx = (left - right) * strength
            ny = (down - up) * strength
            nz = 1.0
            inv = 1.0 / math.sqrt(nx * nx + ny * ny + nz * nz)
            normal_pixels.extend((nx * inv * 0.5 + 0.5, ny * inv * 0.5 + 0.5, nz * inv * 0.5 + 0.5, 1.0))

    outputs: dict[str, Path] = {}
    for channel, pixels, colorspace in (
        ("basecolor", base_pixels, "sRGB"),
        ("normal", normal_pixels, "Non-Color"),
        ("orm", orm_pixels, "Non-Color"),
    ):
        image_name = f"SF_GOLDEN_V1_{role}_{channel}"
        old = bpy.data.images.get(image_name)
        if old is not None:
            bpy.data.images.remove(old)
        image = bpy.data.images.new(image_name, width=size, height=size, alpha=True, float_buffer=False)
        image.pixels.foreach_set(pixels)
        image.colorspace_settings.name = colorspace
        path = texture_dir / f"{role}_{channel}.png"
        image.filepath_raw = str(path)
        image.file_format = "PNG"
        image.save()
        image.pack()
        outputs[channel] = path
    return outputs


def principled_input(node: bpy.types.Node, *names: str):
    for name in names:
        if name in node.inputs:
            return node.inputs[name]
    return None


def set_principled(node: bpy.types.Node, names: Sequence[str], value: Any) -> None:
    socket = principled_input(node, *names)
    if socket is not None:
        socket.default_value = value


def require_principled(node: bpy.types.Node, *names: str):
    socket = principled_input(node, *names)
    if socket is None:
        raise RuntimeError(f"Blender {bpy.app.version_string} is missing required Principled input {names}")
    return socket


def ensure_group_input(group: bpy.types.NodeTree, name: str) -> None:
    items = getattr(group.interface, "items_tree", ())
    if any(getattr(item, "name", None) == name and getattr(item, "in_out", None) == "INPUT" for item in items):
        return
    group.interface.new_socket(name=name, in_out="INPUT", socket_type="NodeSocketFloat")


def create_material(role: str, profile: dict[str, Any], paths: dict[str, Path]) -> bpy.types.Material:
    name = f"SF_GOLDEN_V1_{role.upper()}"
    old = bpy.data.materials.get(name)
    if old is not None:
        bpy.data.materials.remove(old)
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    material.use_backface_culling = True
    material.diffuse_color = (*profile["baseRgb"], 1.0)
    material["spacefaceMaterialRole"] = role
    material["spacefaceSurfaceRecipe"] = RECIPE_ID
    material["spacefaceRoughnessRange"] = profile["roughnessRange"]
    material["spacefaceMetallicRange"] = profile["metallicRange"]
    material["spacefacePattern"] = profile["pattern"]
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    nodes.clear()

    output = nodes.new("ShaderNodeOutputMaterial")
    output.location = (520, 40)
    shader = nodes.new("ShaderNodeBsdfPrincipled")
    shader.location = (230, 40)
    set_principled(shader, ("Base Color",), (*profile["baseRgb"], 1.0))
    set_principled(shader, ("Roughness",), sum(profile["roughnessRange"]) * 0.5)
    set_principled(shader, ("Metallic",), sum(profile["metallicRange"]) * 0.5)
    set_principled(shader, ("IOR",), float(profile.get("ior", 1.5)))
    if role == "painted_armor":
        set_principled(shader, ("Coat Weight", "Clearcoat"), 0.16)
        set_principled(shader, ("Coat Roughness", "Clearcoat Roughness"), 0.31)
    elif role in {"exposed_alloy", "copper_coil"}:
        set_principled(shader, ("Anisotropic IOR Level", "Anisotropic"), 0.38 if role == "exposed_alloy" else 0.5)
    elif role in {"canopy_glass", "sensor_lens"}:
        set_principled(shader, ("Coat Weight", "Clearcoat"), 0.58)
        set_principled(shader, ("Coat Roughness", "Clearcoat Roughness"), 0.13)
        transmission = float(profile["transmissionWeight"])
        ior = float(profile["ior"])
        thickness = float(profile["thicknessM"])
        require_principled(shader, "Transmission Weight", "Transmission").default_value = transmission
        require_principled(shader, "IOR").default_value = ior
        material["spacefaceTransmissionIntent"] = transmission
        material["spacefaceAuthoredIOR"] = ior
        material["spacefaceAuthoredThicknessM"] = thickness
        material["spacefaceRuntimeSinglePassTransmission"] = float(profile["runtimeSinglePassTransmission"])
        material["spacefaceRuntimeOpticsPolicy"] = "preserve-authored-optics-metadata-disable-live-transmission-sampling"
        absorption = nodes.new("ShaderNodeVolumeAbsorption")
        absorption.location = (210, -270)
        absorption.inputs["Color"].default_value = (*profile["attenuationColorRgb"], 1.0)
        absorption.inputs["Density"].default_value = 1.0 / max(0.001, float(profile["attenuationDistanceM"]))
        links.new(absorption.outputs["Volume"], output.inputs["Volume"])
    elif role == "engine_ceramic":
        set_principled(shader, ("Coat Weight", "Clearcoat"), 0.1)
        set_principled(shader, ("Coat Roughness", "Clearcoat Roughness"), 0.48)
    if "emissionRgb" in profile:
        set_principled(shader, ("Emission Color", "Emission"), (*profile["emissionRgb"], 1.0))
        set_principled(shader, ("Emission Strength",), float(profile.get("emissionStrength", 1.0)))
    links.new(shader.outputs["BSDF"], output.inputs["Surface"])

    base_image = bpy.data.images.get(f"SF_GOLDEN_V1_{role}_basecolor")
    orm_image = bpy.data.images.get(f"SF_GOLDEN_V1_{role}_orm")
    normal_image = bpy.data.images.get(f"SF_GOLDEN_V1_{role}_normal")
    if not all((base_image, orm_image, normal_image)):
        raise RuntimeError(f"generated PBR image set missing for {role}")
    base = nodes.new("ShaderNodeTexImage")
    base.name = f"{name}_BaseColor"
    base.image = base_image
    base.location = (-760, 250)
    links.new(base.outputs["Color"], principled_input(shader, "Base Color"))
    orm = nodes.new("ShaderNodeTexImage")
    orm.name = f"{name}_ORM"
    orm.image = orm_image
    orm.location = (-760, -20)
    split = nodes.new("ShaderNodeSeparateColor")
    split.location = (-500, -20)
    links.new(orm.outputs["Color"], split.inputs["Color"])
    links.new(split.outputs["Green"], principled_input(shader, "Roughness"))
    links.new(split.outputs["Blue"], principled_input(shader, "Metallic"))

    gltf_group = bpy.data.node_groups.get("glTF Material Output")
    if gltf_group is None:
        gltf_group = bpy.data.node_groups.new("glTF Material Output", "ShaderNodeTree")
    ensure_group_input(gltf_group, "Occlusion")
    if role in {"canopy_glass", "sensor_lens"}:
        ensure_group_input(gltf_group, "Thickness")
    gltf_output = nodes.new("ShaderNodeGroup")
    gltf_output.node_tree = gltf_group
    gltf_output.location = (-210, -170)
    if "Occlusion" in gltf_output.inputs:
        links.new(split.outputs["Red"], gltf_output.inputs["Occlusion"])
    if role in {"canopy_glass", "sensor_lens"} and "Thickness" in gltf_output.inputs:
        thickness_value = nodes.new("ShaderNodeValue")
        thickness_value.label = "glTF KHR_materials_volume thickness"
        thickness_value.outputs[0].default_value = float(profile["thicknessM"])
        links.new(thickness_value.outputs[0], gltf_output.inputs["Thickness"])

    normal = nodes.new("ShaderNodeTexImage")
    normal.name = f"{name}_Normal"
    normal.image = normal_image
    normal.location = (-760, -330)
    normal_map = nodes.new("ShaderNodeNormalMap")
    normal_map.location = (-450, -330)
    normal_map.inputs["Strength"].default_value = float(profile["normalStrength"])
    links.new(normal.outputs["Color"], normal_map.inputs["Color"])
    links.new(normal_map.outputs["Normal"], principled_input(shader, "Normal"))
    return material


def prepare_materials(spec: dict[str, Any], size: int, output_dir: Path) -> dict[str, bpy.types.Material]:
    if size < 128 or size > 1024 or size & (size - 1):
        raise RuntimeError("--texture-size must be a power of two from 128 through 1024")
    texture_dir = output_dir / "textures"
    paths_by_role = {
        role: generate_role_textures(role, profile, size, texture_dir)
        for role, profile in spec["materialProfiles"].items()
    }
    return {
        role: create_material(role, spec["materialProfiles"][role], paths)
        for role, paths in paths_by_role.items()
    }


def mesh_triangles(obj: bpy.types.Object) -> int:
    if obj.type != "MESH" or obj.data is None:
        return 0
    return sum(max(0, len(poly.vertices) - 2) for poly in obj.data.polygons)


def apply_active_transform(obj: bpy.types.Object) -> None:
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)


def apply_bevel(obj: bpy.types.Object, width: float, segments: int) -> None:
    if width <= 0.0:
        return
    bpy.context.view_layer.objects.active = obj
    modifier = obj.modifiers.new("SF_Golden_Bevel", "BEVEL")
    modifier.width = width
    modifier.segments = max(1, int(segments))
    modifier.limit_method = "ANGLE"
    if hasattr(modifier, "harden_normals"):
        modifier.harden_normals = True
    bpy.ops.object.modifier_apply(modifier=modifier.name)
    try:
        bpy.ops.object.shade_smooth_by_angle()
    except Exception:
        for polygon in obj.data.polygons:
            polygon.use_smooth = True
    try:
        weighted = obj.modifiers.new("SF_Golden_WeightedNormal", "WEIGHTED_NORMAL")
        weighted.keep_sharp = True
        bpy.ops.object.modifier_apply(modifier=weighted.name)
    except Exception:
        for polygon in obj.data.polygons:
            polygon.use_smooth = True


def unwrap_metric(obj: bpy.types.Object) -> None:
    """Create deterministic repeating UVs with one texture tile per metre."""
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.cube_project(cube_size=1.0, correct_aspect=True, scale_to_bounds=False)
    bpy.ops.object.mode_set(mode="OBJECT")


class DetailMaker:
    def __init__(self, module_id: str, collection: bpy.types.Collection, root: bpy.types.Object, materials: dict[str, bpy.types.Material]):
        self.module_id = module_id
        self.collection = collection
        self.root = root
        self.materials = materials
        self.objects: list[bpy.types.Object] = []

    def _finish(self, obj: bpy.types.Object, logical_name: str, tier: str, role: str, bevel: float = 0.0, segments: int = 2) -> bpy.types.Object:
        obj.name = f"{PREFIX}{self.module_id.upper()}__{logical_name}"
        apply_active_transform(obj)
        apply_bevel(obj, bevel, segments)
        unwrap_metric(obj)
        for old_collection in list(obj.users_collection):
            old_collection.objects.unlink(obj)
        self.collection.objects.link(obj)
        world = obj.matrix_world.copy()
        obj.parent = self.root
        obj.matrix_world = world
        obj.data.materials.clear()
        obj.data.materials.append(self.materials[role])
        obj["sf_golden_recipe"] = RECIPE_ID
        obj["sf_module"] = self.module_id
        obj["sf_logical_name"] = logical_name
        obj["sf_detail_tier"] = tier
        obj["sf_material_role"] = role
        obj["sf_uv_scale_metres"] = 1.0
        self.objects.append(obj)
        return obj

    def box(self, name: str, center: Sequence[float], size: Sequence[float], tier: str, role: str, bevel: float = 0.025, segments: int = 2) -> bpy.types.Object:
        bpy.ops.mesh.primitive_cube_add(size=1.0, location=gltf_to_blender(center))
        obj = bpy.context.object
        obj.dimensions = gltf_size_to_blender(size)
        return self._finish(obj, name, tier, role, bevel, segments)

    def cylinder(self, name: str, center: Sequence[float], length: float, radius: float, axis: str, tier: str, role: str, segments: int = 20, bevel: float = 0.015) -> bpy.types.Object:
        rotation = (0.0, 0.0, 0.0)
        if axis == "x":
            rotation = (0.0, math.pi / 2.0, 0.0)
        elif axis == "z":
            rotation = (math.pi / 2.0, 0.0, 0.0)
        elif axis != "y":
            raise ValueError(f"unknown glTF cylinder axis: {axis}")
        bpy.ops.mesh.primitive_cylinder_add(vertices=segments, radius=radius, depth=length, end_fill_type="NGON", location=gltf_to_blender(center), rotation=rotation)
        return self._finish(bpy.context.object, name, tier, role, bevel, 2)

    def torus_x(self, name: str, center: Sequence[float], major_radius: float, minor_radius: float, tier: str, role: str, major_segments: int = 24, minor_segments: int = 8) -> bpy.types.Object:
        bpy.ops.mesh.primitive_torus_add(
            align="WORLD",
            major_segments=major_segments,
            minor_segments=minor_segments,
            location=gltf_to_blender(center),
            rotation=(0.0, math.pi / 2.0, 0.0),
            major_radius=major_radius,
            minor_radius=minor_radius,
        )
        return self._finish(bpy.context.object, name, tier, role, 0.0, 1)

    def tube(self, name: str, start: Sequence[float], end: Sequence[float], radius: float, tier: str, role: str, segments: int = 12) -> bpy.types.Object:
        a = Vector(gltf_to_blender(start))
        b = Vector(gltf_to_blender(end))
        direction = b - a
        center = (a + b) * 0.5
        bpy.ops.mesh.primitive_cylinder_add(vertices=segments, radius=radius, depth=direction.length, end_fill_type="NGON", location=center)
        obj = bpy.context.object
        obj.rotation_mode = "QUATERNION"
        obj.rotation_quaternion = direction.to_track_quat("Z", "Y")
        obj.rotation_mode = "XYZ"
        return self._finish(obj, name, tier, role, min(radius * 0.24, 0.018), 2)

    def join(self, name: str, objects: Sequence[bpy.types.Object], tier: str, role: str) -> bpy.types.Object:
        if not objects:
            raise RuntimeError(f"cannot join empty object set for {name}")
        for obj in objects:
            if obj in self.objects:
                self.objects.remove(obj)
        bpy.ops.object.select_all(action="DESELECT")
        for obj in objects:
            obj.select_set(True)
        bpy.context.view_layer.objects.active = objects[0]
        bpy.ops.object.join()
        joined = bpy.context.object
        joined.name = f"{PREFIX}{self.module_id.upper()}__{name}"
        for polygon in joined.data.polygons:
            polygon.material_index = 0
        joined.data.materials.clear()
        joined.data.materials.append(self.materials[role])
        joined["sf_golden_recipe"] = RECIPE_ID
        joined["sf_module"] = self.module_id
        joined["sf_logical_name"] = name
        joined["sf_detail_tier"] = tier
        joined["sf_material_role"] = role
        self.objects.append(joined)
        return joined


def build_cockpit_slab(m: DetailMaker) -> None:
    m.box("DorsalArmorLayer", (1.25, 1.69, 0.0), (3.0, 0.16, 3.12), "macro", "painted_armor", 0.055, 3)
    m.box("PortCheekArmor", (1.2, 0.78, -1.72), (3.45, 1.1, 0.18), "macro", "painted_armor", 0.045, 3)
    m.box("StarboardCheekArmor", (1.2, 0.78, 1.72), (3.45, 1.1, 0.18), "macro", "painted_armor", 0.045, 3)
    m.box("CanopyGlazingBank", (3.28, 0.91, 0.0), (1.45, 0.2, 3.05), "macro", "canopy_glass", 0.035, 2)
    m.box("ServiceSpine", (0.55, 1.785, 0.0), (2.4, 0.05, 0.26), "macro", "exposed_alloy", 0.018, 2)

    m.box("CanopyTopRail", (3.28, 1.32, 0.0), (1.55, 0.12, 3.15), "meso", "exposed_alloy", 0.025, 2)
    m.box("CanopyBottomRail", (3.28, 0.79, 0.0), (1.55, 0.12, 3.15), "meso", "exposed_alloy", 0.025, 2)
    m.box("CanopyFramePort", (3.28, 1.055, -1.55), (1.55, 0.55, 0.12), "meso", "exposed_alloy", 0.022, 2)
    m.box("CanopyFrameStarboard", (3.28, 1.055, 1.55), (1.55, 0.55, 0.12), "meso", "exposed_alloy", 0.022, 2)
    mullions = [m.box(f"_Mullion{index}", (3.31, 1.055, z), (0.12, 0.55, 0.1), "meso", "exposed_alloy", 0.018, 2) for index, z in enumerate((-0.77, 0.0, 0.77))]
    m.join("CanopyMullionCluster", mullions, "meso", "exposed_alloy")
    m.box("DorsalAccessRecess", (0.85, 1.755, 0.0), (1.25, 0.06, 1.15), "meso", "recessed_mechanical", 0.018, 2)
    m.box("DorsalAccessHatch", (0.85, 1.793, 0.0), (1.1, 0.03, 0.98), "meso", "painted_armor", 0.012, 2)
    m.box("SensorBar", (3.91, 1.52, 0.0), (0.18, 0.18, 2.5), "meso", "sensor_lens", 0.035, 3)
    sensors = [m.box(f"_SensorPod{index}", (3.9, 1.58, z), (0.22, 0.22, 0.22), "meso", "sensor_lens", 0.055, 3) for index, z in enumerate((-1.35, 1.35))]
    m.join("SensorPodPair", sensors, "meso", "sensor_lens")
    panels = [m.box(f"_SidePanel{index}", (0.6, 0.72, z), (1.25, 0.62, 0.04), "meso", "dark_composite", 0.012, 2) for index, z in enumerate((-1.82, 1.82))]
    m.join("SideServicePanelPair", panels, "meso", "dark_composite")

    latches = [m.box(f"_HatchLatch{index}", (x, 1.805, 0.0), (0.22, 0.008, 0.16), "micro", "exposed_alloy", 0.003, 1) for index, x in enumerate((0.45, 1.25))]
    m.join("HatchLatchPair", latches, "micro", "exposed_alloy")
    fasteners = [m.cylinder(f"_FrameFastener{index}", (x, 1.801, z), 0.015, 0.035, "y", "micro", "exposed_alloy", 10, 0.004) for index, (x, z) in enumerate(((2.62, -1.61), (3.28, -1.61), (3.94, -1.61), (2.62, 1.61), (3.28, 1.61), (3.94, 1.61)))]
    m.join("FrameFastenerBank", fasteners, "micro", "exposed_alloy")
    stripes = [m.box(f"_MaintenanceStripe{index}", (x, 1.806, z), (0.58, 0.006, 0.14), "micro", "maintenance_mark", 0.002, 1) for index, (x, z) in enumerate(((0.0, -0.53), (1.72, 0.53)))]
    m.join("MaintenanceStripePair", stripes, "micro", "maintenance_mark")
    m.box("ServiceStencilPlate", (0.1, 0.75, 1.842), (0.55, 0.24, 0.008), "micro", "maintenance_mark", 0.002, 1)


def build_engine_industrial(m: DetailMaker) -> None:
    m.cylinder("NozzleThroat", (-0.12, 0.0, 0.0), 0.12, 0.72, "x", "macro", "recessed_mechanical", 28, 0.025)
    m.torus_x("CeramicThroatRing", (-0.02, 0.0, 0.0), 0.91, 0.11, "macro", "engine_ceramic", 32, 10)
    m.box("HeatShieldDorsal", (1.45, 1.31, 0.0), (1.9, 0.17, 0.72), "macro", "engine_ceramic", 0.04, 3)
    m.box("HeatShieldVentral", (1.45, -1.28, 0.0), (1.9, 0.17, 0.72), "macro", "engine_ceramic", 0.04, 3)
    m.box("HeatShieldPort", (1.45, 0.0, -1.28), (1.9, 0.72, 0.17), "macro", "engine_ceramic", 0.04, 3)
    m.box("HeatShieldStarboard", (1.45, 0.0, 1.28), (1.9, 0.72, 0.17), "macro", "engine_ceramic", 0.04, 3)
    m.torus_x("StructuralCradle", (2.75, 0.0, 0.0), 0.86, 0.1, "macro", "exposed_alloy", 28, 8)

    injectors = []
    for index in range(6):
        angle = math.tau * index / 6.0
        injectors.append(m.cylinder(f"_Injector{index}", (0.24, math.cos(angle) * 0.72, math.sin(angle) * 0.72), 0.24, 0.1, "x", "meso", "heat_affected_alloy", 14, 0.012))
    m.join("InjectorCluster", injectors, "meso", "heat_affected_alloy")
    m.torus_x("InjectorManifold", (0.35, 0.0, 0.0), 0.75, 0.05, "meso", "exposed_alloy", 26, 7)
    m.box("ServiceHatchRecess", (1.78, 1.36, 0.64), (1.45, 0.08, 0.72), "meso", "recessed_mechanical", 0.022, 2)
    m.box("ServiceHatch", (1.78, 1.415, 0.64), (1.25, 0.05, 0.58), "meso", "painted_armor", 0.018, 2)
    rails = [m.box(f"_MaintenanceRail{index}", (1.6, 1.15, z), (2.0, 0.12, 0.12), "meso", "exposed_alloy", 0.025, 2) for index, z in enumerate((-0.9, 0.9))]
    m.join("MaintenanceRailPair", rails, "meso", "exposed_alloy")
    trunks = [
        m.tube("_CableTrunk0", (0.55, 0.95, -0.75), (2.8, 0.88, -0.68), 0.05, "meso", "recessed_mechanical", 12),
        m.tube("_CableTrunk1", (0.62, -0.9, 0.72), (2.72, -0.82, 0.78), 0.045, "meso", "recessed_mechanical", 12),
    ]
    m.join("CableTrunkPair", trunks, "meso", "recessed_mechanical")
    m.torus_x("HeatBandAft", (0.62, 0.0, 0.0), 1.07, 0.045, "meso", "heat_affected_alloy", 24, 7)
    m.torus_x("HeatBandFore", (2.35, 0.0, 0.0), 0.93, 0.05, "meso", "heat_affected_alloy", 24, 7)

    clamps = []
    for index in range(6):
        angle = math.tau * index / 6.0
        clamps.append(m.torus_x(f"_InjectorClamp{index}", (0.37, math.cos(angle) * 0.72, math.sin(angle) * 0.72), 0.13, 0.022, "micro", "exposed_alloy", 12, 5))
    m.join("InjectorClampBank", clamps, "micro", "exposed_alloy")
    fasteners = [m.cylinder(f"_ShieldFastener{index}", (x, 1.405, z), 0.02, 0.035, "y", "micro", "exposed_alloy", 10, 0.003) for index, (x, z) in enumerate(((0.85, -0.24), (1.55, -0.24), (2.05, -0.24), (0.85, 0.24), (1.55, 0.24), (2.05, 0.24)))]
    m.join("HeatShieldFastenerBank", fasteners, "micro", "exposed_alloy")
    pipe_clamps = [m.box(f"_PipeClamp{index}", (x, 0.955, -0.75), (0.09, 0.13, 0.13), "micro", "maintenance_mark", 0.015, 2) for index, x in enumerate((0.9, 1.65, 2.4))]
    m.join("PipeClampBank", pipe_clamps, "micro", "maintenance_mark")
    stripes = [m.box(f"_WarningStripe{index}", (x, 1.444, 0.64), (0.22, 0.008, 0.42), "micro", "maintenance_mark", 0.002, 1) for index, x in enumerate((1.48, 2.08))]
    m.join("WarningStripePair", stripes, "micro", "maintenance_mark")
    m.box("ServiceStencilPlate", (2.43, 1.04, 0.95), (0.5, 0.22, 0.025), "micro", "maintenance_mark", 0.006, 1)


def build_weapon_railgun(m: DetailMaker) -> None:
    m.box("PortRail", (3.4, 0.18, -0.28), (4.6, 0.24, 0.14), "macro", "exposed_alloy", 0.028, 3)
    m.box("StarboardRail", (3.4, 0.18, 0.28), (4.6, 0.24, 0.14), "macro", "exposed_alloy", 0.028, 3)
    m.box("ChannelRecess", (3.4, 0.13, 0.0), (4.65, 0.1, 0.32), "macro", "dark_composite", 0.018, 2)
    m.box("BreechArmorLayer", (0.72, 0.43, 0.0), (1.6, 0.16, 0.82), "macro", "painted_armor", 0.035, 3)
    m.box("MountShoe", (0.75, -0.36, 0.0), (1.45, 0.16, 0.78), "macro", "recessed_mechanical", 0.032, 3)
    m.box("MuzzleBridge", (5.75, 0.18, 0.0), (0.22, 0.34, 0.78), "macro", "heat_affected_alloy", 0.028, 3)

    m.box("PortInnerWearFace", (3.4, 0.31, -0.19), (4.55, 0.05, 0.07), "meso", "heat_affected_alloy", 0.012, 2)
    m.box("StarboardInnerWearFace", (3.4, 0.31, 0.19), (4.55, 0.05, 0.07), "meso", "heat_affected_alloy", 0.012, 2)
    port_caps = [m.box(f"_PortCap{index}", (x, 0.02, -0.4), (0.34, 0.22, 0.1), "meso", "dark_composite", 0.02, 2) for index, x in enumerate((1.55, 2.35, 3.15, 3.95))]
    m.join("PortCapacitorBank", port_caps, "meso", "dark_composite")
    star_caps = [m.box(f"_StarboardCap{index}", (x, 0.02, 0.4), (0.34, 0.22, 0.1), "meso", "dark_composite", 0.02, 2) for index, x in enumerate((1.55, 2.35, 3.15, 3.95))]
    m.join("StarboardCapacitorBank", star_caps, "meso", "dark_composite")
    buses = [m.box(f"_CopperBus{index}", (2.8, 0.28, z), (3.2, 0.08, 0.07), "meso", "copper_coil", 0.012, 2) for index, z in enumerate((-0.4, 0.4))]
    m.join("CopperBusPair", buses, "meso", "copper_coil")
    accesses = [m.box(f"_BreechAccess{index}", (0.7, 0.18, z), (0.9, 0.35, 0.04), "meso", "painted_armor", 0.012, 2) for index, z in enumerate((-0.43, 0.43))]
    m.join("BreechAccessPair", accesses, "meso", "painted_armor")
    braces = [m.box(f"_RecoilBrace{index}", (1.2, -0.24, z), (1.7, 0.15, 0.12), "meso", "exposed_alloy", 0.024, 2) for index, z in enumerate((-0.31, 0.31))]
    m.join("RecoilBracePair", braces, "meso", "exposed_alloy")
    m.tube("ChargeConduit", (0.4, 0.46, -0.2), (4.7, 0.34, -0.2), 0.02, "meso", "copper_coil", 10)
    thermal_breaks = [m.box(f"_ThermalBreak{index}", (5.15, 0.2, z), (0.16, 0.3, 0.12), "meso", "engine_ceramic", 0.022, 2) for index, z in enumerate((-0.28, 0.28))]
    m.join("ThermalBreakPair", thermal_breaks, "meso", "engine_ceramic")

    abrasion = [m.box(f"_AbrasionStrip{index}", (4.1, 0.342, z), (2.6, 0.012, 0.035), "micro", "heat_affected_alloy", 0.003, 1) for index, z in enumerate((-0.205, 0.205))]
    m.join("AbrasionStripPair", abrasion, "micro", "heat_affected_alloy")
    fasteners = [m.cylinder(f"_Fastener{index}", (x, 0.51, z), 0.015, 0.025, "y", "micro", "exposed_alloy", 10, 0.003) for index, (x, z) in enumerate(((0.25, -0.32), (0.75, -0.32), (1.2, -0.32), (0.25, 0.32), (0.75, 0.32), (1.2, 0.32)))]
    m.join("FastenerBank", fasteners, "micro", "exposed_alloy")
    m.box("ServiceStripe", (0.7, 0.515, 0.0), (0.62, 0.006, 0.18), "micro", "maintenance_mark", 0.002, 1)
    m.box("ChargeIndicator", (5.72, 0.42, 0.0), (0.12, 0.08, 0.18), "micro", "sensor_lens", 0.018, 2)
    m.box("SerialPlate", (0.22, 0.12, 0.442), (0.46, 0.22, 0.012), "micro", "maintenance_mark", 0.003, 1)


BUILDERS = {
    "cockpit_slab": build_cockpit_slab,
    "engine_industrial": build_engine_industrial,
    "weapon_railgun": build_weapon_railgun,
}


def matrix_signature(obj: bpy.types.Object) -> tuple[float, ...]:
    return tuple(round(value, 7) for row in obj.matrix_world for value in row)


def semantic_snapshot(objects: Iterable[bpy.types.Object]) -> dict[str, tuple[float, ...]]:
    return {
        obj.name: matrix_signature(obj)
        for obj in objects
        if obj.name.startswith(("HOOK_", "SOCKET_", "MOUNT_"))
    }


def root_snapshot(objects: Iterable[bpy.types.Object]) -> dict[str, tuple[float, ...]]:
    return {obj.name: matrix_signature(obj) for obj in objects if obj.parent is None}


def gltf_bounds(objects: Iterable[bpy.types.Object]) -> tuple[list[float], list[float]]:
    points: list[tuple[float, float, float]] = []
    for obj in objects:
        if obj.type != "MESH" or obj.data is None:
            continue
        for corner in obj.bound_box:
            world = obj.matrix_world @ Vector(corner)
            points.append(blender_to_gltf(world))
    if not points:
        raise RuntimeError("no mesh bounds available")
    return (
        [min(point[axis] for point in points) for axis in range(3)],
        [max(point[axis] for point in points) for axis in range(3)],
    )


def close_vector(actual: Sequence[float], expected: Sequence[float], tolerance: float = 0.008) -> bool:
    return all(abs(float(a) - float(b)) <= tolerance for a, b in zip(actual, expected))


def find_asset_root(objects: Sequence[bpy.types.Object], module_id: str) -> bpy.types.Object:
    direct = next((obj for obj in objects if obj.name == module_id), None)
    if direct is not None:
        return direct
    roots = [obj for obj in objects if obj.parent is None]
    if len(roots) == 1:
        return roots[0]
    named = next((obj for obj in roots if module_id.lower() in obj.name.lower()), None)
    if named is not None:
        return named
    raise RuntimeError(f"cannot identify stable asset root for {module_id}: {[obj.name for obj in roots]}")


def validate_detail_contract(module_spec: dict[str, Any], maker: DetailMaker) -> None:
    expected = {entry["name"]: entry for entry in module_spec["details"]}
    actual = {obj.get("sf_logical_name"): obj for obj in maker.objects}
    if set(actual) != set(expected):
        raise RuntimeError(f"detail contract mismatch missing={sorted(set(expected) - set(actual))} extra={sorted(set(actual) - set(expected))}")
    for name, entry in expected.items():
        obj = actual[name]
        if obj.get("sf_detail_tier") != entry["tier"] or obj.get("sf_material_role") != entry["role"]:
            raise RuntimeError(f"detail metadata mismatch: {name}")
        if any(abs(value - 1.0) > 1e-6 for value in obj.scale):
            raise RuntimeError(f"unapplied scale on detail: {name} {tuple(obj.scale)}")


def export_lod(module_id: str, lod: int, source_objects: Sequence[bpy.types.Object], maker: DetailMaker, detail_root: bpy.types.Object, output_path: Path) -> dict[str, Any]:
    allowed = LOD_TIERS[lod]
    selected = list(source_objects) + [detail_root] + [obj for obj in maker.objects if obj.get("sf_detail_tier") in allowed]
    previous_hash = sha256_file(output_path) if output_path.exists() else None
    bpy.ops.object.select_all(action="DESELECT")
    for obj in selected:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = source_objects[0]
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
        fallback = {key: value for key, value in kwargs.items() if key not in {"export_tangents", "export_cameras", "export_lights"}}
        bpy.ops.export_scene.gltf(**fallback)
    current_hash = sha256_file(output_path)
    return {
        "lod": lod,
        "path": str(output_path),
        "bytes": output_path.stat().st_size,
        "sha256": current_hash,
        "matchesPreviousRun": previous_hash == current_hash if previous_hash else None,
        "includedDetailTiers": sorted(allowed),
        "includedDetailObjects": sum(1 for obj in maker.objects if obj.get("sf_detail_tier") in allowed),
        "includedAddedTriangles": sum(mesh_triangles(obj) for obj in maker.objects if obj.get("sf_detail_tier") in allowed),
    }


def build_module(module_id: str, module_spec: dict[str, Any], input_root: Path, output_dir: Path, materials: dict[str, bpy.types.Material], lods: Sequence[int], export: bool) -> dict[str, Any]:
    source_path = input_root / module_spec["input"]
    if not source_path.is_file():
        raise FileNotFoundError(f"immutable scratch input missing: {source_path}")
    expected_hash = module_spec["sourceSnapshot"]["sha256"].upper()
    before_hash = sha256_file(source_path)
    if before_hash != expected_hash:
        raise RuntimeError(f"snapshot hash drift for {module_id}: expected {expected_hash}, got {before_hash}")
    if source_path.stat().st_size != int(module_spec["sourceSnapshot"]["bytes"]):
        raise RuntimeError(f"snapshot size drift for {module_id}")

    clear_scene()
    bpy.ops.import_scene.gltf(filepath=str(source_path))
    remove_prior_pass()
    source_objects = list(bpy.context.scene.objects)
    source_bounds = gltf_bounds(source_objects)
    baseline = module_spec["baseline"]
    if not close_vector(source_bounds[0], baseline["boundsMin"]) or not close_vector(source_bounds[1], baseline["boundsMax"]):
        raise RuntimeError(f"imported bounds drift for {module_id}: {source_bounds} vs {baseline['boundsMin'], baseline['boundsMax']}")
    source_tris = sum(mesh_triangles(obj) for obj in source_objects)
    if source_tris != int(baseline["triangles"]):
        raise RuntimeError(f"source triangle drift for {module_id}: expected {baseline['triangles']}, got {source_tris}")
    roots_before = root_snapshot(source_objects)
    semantics_before = semantic_snapshot(source_objects)
    expected_semantics = sorted(baseline["hooks"] + baseline["sockets"])
    missing_semantics = sorted(set(expected_semantics) - set(semantics_before))
    if missing_semantics:
        raise RuntimeError(f"source semantic nodes missing for {module_id}: {missing_semantics}")

    asset_root = find_asset_root(source_objects, module_id)
    collection = bpy.data.collections.new(f"{COLLECTION_PREFIX}{module_id.upper()}")
    bpy.context.scene.collection.children.link(collection)
    detail_root = bpy.data.objects.new(f"{PREFIX}{module_id.upper()}__DETAIL_ROOT", None)
    detail_root["sf_golden_recipe"] = RECIPE_ID
    detail_root["sf_module"] = module_id
    collection.objects.link(detail_root)
    root_world = detail_root.matrix_world.copy()
    detail_root.parent = asset_root
    detail_root.matrix_world = root_world
    maker = DetailMaker(module_id, collection, detail_root, materials)
    BUILDERS[module_id](maker)
    validate_detail_contract(module_spec, maker)

    candidate_objects = list(bpy.context.scene.objects)
    candidate_bounds = gltf_bounds(candidate_objects)
    bounds_inside = all(candidate_bounds[0][axis] >= source_bounds[0][axis] - 0.008 and candidate_bounds[1][axis] <= source_bounds[1][axis] + 0.008 for axis in range(3))
    if not bounds_inside:
        raise RuntimeError(f"golden detail escaped source bounds for {module_id}: source={source_bounds} candidate={candidate_bounds}")
    if root_snapshot(source_objects) != roots_before:
        raise RuntimeError(f"root transform changed for {module_id}")
    if semantic_snapshot(source_objects) != semantics_before:
        raise RuntimeError(f"semantic node transform changed for {module_id}")

    module_output = output_dir / module_id
    module_output.mkdir(parents=True, exist_ok=True)
    blend_path = module_output / f"{module_id}_golden_v1_source.blend"
    bpy.ops.wm.save_as_mainfile(filepath=str(blend_path), check_existing=False)
    lod_outputs = []
    if export:
        for lod in lods:
            lod_outputs.append(export_lod(module_id, lod, source_objects, maker, detail_root, module_output / f"{module_id}_golden_v1_lod{lod}.glb"))

    after_hash = sha256_file(source_path)
    if after_hash != before_hash:
        raise RuntimeError(f"input snapshot changed during build: {source_path}")
    tier_metrics = {
        tier: {
            "objects": sum(1 for obj in maker.objects if obj.get("sf_detail_tier") == tier),
            "triangles": sum(mesh_triangles(obj) for obj in maker.objects if obj.get("sf_detail_tier") == tier),
        }
        for tier in TIER_MAX_LOD
    }
    roles = sorted({obj.get("sf_material_role") for obj in maker.objects})
    return {
        "moduleId": module_id,
        "status": "scratch_candidate_generated",
        "visualAcceptance": "not_assessed",
        "input": {
            "path": str(source_path),
            "bytes": source_path.stat().st_size,
            "sha256Before": before_hash,
            "sha256After": after_hash,
            "unchanged": before_hash == after_hash,
        },
        "source": {
            "triangles": source_tris,
            "boundsMin": [round(value, 6) for value in source_bounds[0]],
            "boundsMax": [round(value, 6) for value in source_bounds[1]],
            "rootTransformsPreserved": root_snapshot(source_objects) == roots_before,
            "semanticNodesPreserved": semantic_snapshot(source_objects) == semantics_before,
            "semanticNodeNames": sorted(semantics_before),
        },
        "candidate": {
            "blendPath": str(blend_path),
            "blendSha256": sha256_file(blend_path),
            "boundsMin": [round(value, 6) for value in candidate_bounds[0]],
            "boundsMax": [round(value, 6) for value in candidate_bounds[1]],
            "boundsInsideSource": bounds_inside,
            "addedObjects": len(maker.objects),
            "addedTriangles": sum(mesh_triangles(obj) for obj in maker.objects),
            "tierMetrics": tier_metrics,
            "materialRoles": roles,
            "lodOutputs": lod_outputs,
        },
        "unresolved": [
            "Blender and Three.js visual inspection has not been performed by this recipe packet.",
            "Khronos validation, release KTX2 conversion, runtime material inspection, and player-camera proof remain required.",
            "Current modular-part separate-file LOD selection must be verified before wiring LOD1/LOD2 outputs.",
        ],
    }


def verify_candidate_artifacts(report: dict[str, Any]) -> None:
    expected_lods = set(report["requestedLods"])
    for module in report["modules"]:
        candidate = module["candidate"]
        blend_path = Path(candidate["blendPath"])
        if not blend_path.is_file() or sha256_file(blend_path) != candidate["blendSha256"]:
            raise RuntimeError(f"candidate blend receipt mismatch: {blend_path}")
        lod_outputs = candidate["lodOutputs"]
        if report["exportRequested"] and {entry["lod"] for entry in lod_outputs} != expected_lods:
            raise RuntimeError(f"candidate LOD receipt set mismatch for {module['moduleId']}")
        if not report["exportRequested"] and lod_outputs:
            raise RuntimeError(f"unexpected GLB receipts in --no-export run for {module['moduleId']}")
        for output in lod_outputs:
            output_path = Path(output["path"])
            if not output_path.is_file() or sha256_file(output_path) != output["sha256"]:
                raise RuntimeError(f"candidate GLB receipt mismatch: {output_path}")
            if output_path.stat().st_size != output["bytes"]:
                raise RuntimeError(f"candidate GLB byte receipt mismatch: {output_path}")


def atomic_write_json(path: Path, payload: dict[str, Any]) -> None:
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    temporary.replace(path)


def verify_final_receipt(report_path: Path, report: dict[str, Any]) -> str:
    if not report_path.is_file():
        raise RuntimeError(f"final run report missing after atomic publish: {report_path}")
    decoded = json.loads(report_path.read_text(encoding="utf-8"))
    if decoded != report:
        raise RuntimeError(f"final run report content mismatch: {report_path}")
    verify_candidate_artifacts(decoded)
    return sha256_file(report_path)


def main() -> dict[str, Any]:
    args = parse_args()
    spec = load_spec()
    input_root = normalize_path(Path(args.input_root))
    output_dir = normalize_path(Path(args.output_dir))
    guard_output_path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    lods = tuple(sorted({int(value.strip()) for value in args.lods.split(",") if value.strip()}))
    if any(lod not in LOD_TIERS for lod in lods):
        raise RuntimeError(f"unsupported LOD list: {lods}")
    selected = list(spec["modules"]) if args.module == "all" else [args.module]
    materials = prepare_materials(spec, args.texture_size, output_dir)
    reports = [build_module(module_id, spec["modules"][module_id], input_root, output_dir, materials, lods, not args.no_export) for module_id in selected]
    report = {
        "schema": "spaceface.goldenReusableModules.blenderRun.v1",
        "recipeId": RECIPE_ID,
        "blenderVersion": bpy.app.version_string,
        "inputRoot": str(input_root),
        "outputDir": str(output_dir),
        "textureSize": args.texture_size,
        "requestedLods": list(lods),
        "exportRequested": not args.no_export,
        "productionAssetsMutated": False,
        "modules": reports,
    }
    report_path = output_dir / "blender-run-report.json"
    verify_candidate_artifacts(report)
    atomic_write_json(report_path, report)
    report_hash = verify_final_receipt(report_path, report)
    return {
        "ok": True,
        "report": str(report_path),
        "reportSha256": report_hash,
        "modules": selected,
    }


def cli_entrypoint() -> None:
    try:
        receipt = main()
    except BaseException:
        traceback.print_exc(file=sys.stderr)
        sys.stdout.flush()
        sys.stderr.flush()
        # Blender can consume a Python SystemExit and still return process code 0. os._exit is the
        # final CLI trust boundary: no failure can be mistaken for a successful foundry run.
        os._exit(1)
    print(json.dumps(receipt, sort_keys=True))
    sys.stdout.flush()
    sys.stderr.flush()


if __name__ == "__main__":
    cli_entrypoint()

"""Build a non-destructive golden geology candidate for live Rock A.

This script intentionally opens the canonical authoring blend afresh and writes only beneath
``assets/ships/m4_helios_hub/candidates/golden_geology_v3``. It never promotes, edits a manifest,
or writes into ``assets/ships/parts`` / ``assets/ships/release``.

Run after the release lock is gone:

    "C:\\Program Files\\Blender Foundation\\Blender 5.1\\blender.exe" --background \
      --python assets/ships/m4_helios_hub/scripts/golden_geology_v3.py -- \
      --input-blend assets/ships/m4_helios_hub/blender/helios_rock_a_production.blend

The output remains a candidate. Normal-route captures, glTF validation, KTX2 finalization, LOD
continuity, collision behavior, and independent visual review are still required before promotion.
"""
from __future__ import annotations

import argparse
from dataclasses import asdict, dataclass
import hashlib
import json
import math
import os
from pathlib import Path
import random
import struct
import sys
import traceback
from typing import Iterable

import bmesh
import bpy
from mathutils import Vector
import numpy as np


SCRIPT = Path(__file__).resolve()
ROOT = SCRIPT.parents[4]
PACKET_ROOT = ROOT / "assets" / "ships" / "m4_helios_hub"
DEFAULT_INPUT = PACKET_ROOT / "blender" / "helios_rock_a_production.blend"
DEFAULT_OUTPUT_ROOT = PACKET_ROOT / "candidates" / "golden_geology_v3"
RELEASE_LOCK = ROOT / "assets" / "ships" / "release.__lock"

RECIPE_ID = "helios-rock-a-golden-geology-v3"
SOURCE_ASSET_ID = "place_asteroid_rock_a"
ROOT_NAME = "SF_M4_HELIOS_ROCK_A_ROOT"
SEED = 0x524F434B41335633
EXPECTED_LODS = ("lod0", "lod1", "lod2")


@dataclass(frozen=True)
class MaterialRecipe:
    name: str
    semantic_role: str
    source_role: str
    base_multiplier: tuple[float, float, float]
    saturation: float
    roughness_center: float
    roughness_span: float
    metallic_center: float
    metallic_span: float
    ao_floor: float
    normal_strength: float


@dataclass(frozen=True)
class FractureRecipe:
    name: str
    normal: tuple[float, float, float]
    tangent: tuple[float, float, float]
    offset: float
    half_length: float
    half_height: float
    width: float
    depth: float
    warp: float
    phase: float
    ferrite: bool = False


@dataclass(frozen=True)
class CraterRecipe:
    direction: tuple[float, float, float]
    angular_radius: float
    depth: float
    rim_height: float


# Each role has a different physical response and frequency amplitude. The source photographs are
# reused deliberately, but every derived map set changes normal, roughness, metal and AO response;
# this is not a color-swap family.
SEMANTIC_MATERIALS: dict[str, MaterialRecipe] = {
    "matrix": MaterialRecipe(
        "Asteroid_Geology_Matrix", "geology", "rock", (0.98, 0.96, 0.92), 0.92,
        0.84, 0.14, 0.035, 0.045, 0.76, 1.05,
    ),
    "fracture": MaterialRecipe(
        "Asteroid_Fracture_Wall", "geology", "rock", (0.62, 0.59, 0.55), 0.78,
        0.79, 0.18, 0.055, 0.07, 0.62, 1.36,
    ),
    "regolith": MaterialRecipe(
        "Asteroid_Regolith_Matrix", "geology", "rock", (1.08, 1.04, 0.97), 0.64,
        0.92, 0.085, 0.012, 0.018, 0.82, 0.68,
    ),
    "ferrite": MaterialRecipe(
        "Asteroid_Ore_Matrix_Ferrite", "geology", "warm", (1.02, 0.84, 0.64), 1.10,
        0.57, 0.16, 0.44, 0.22, 0.69, 0.92,
    ),
}


# These are explicit, oriented geological structures. They intentionally avoid an isotropic noise
# modifier, which is what made the earlier family read as round bark-covered lumps.
FRACTURES: tuple[FractureRecipe, ...] = (
    FractureRecipe(
        "primary_shear", (0.61, -0.16, -0.78), (0.21, 0.97, -0.04), -0.05,
        0.92, 0.57, 0.052, 0.052, 0.022, 0.7, True,
    ),
    FractureRecipe(
        "cross_fault", (-0.29, 0.88, -0.37), (0.91, 0.36, 0.20), 0.18,
        0.69, 0.48, 0.036, 0.037, 0.016, 2.1, False,
    ),
    FractureRecipe(
        "rear_spall", (0.82, 0.43, 0.36), (-0.33, 0.88, -0.34), -0.27,
        0.58, 0.43, 0.044, 0.043, 0.018, 4.0, True,
    ),
)

CRATERS: tuple[CraterRecipe, ...] = (
    CraterRecipe((0.31, -0.18, 0.93), 0.31, 0.068, 0.027),
    CraterRecipe((-0.71, 0.38, 0.59), 0.22, 0.042, 0.018),
)

STRATA_AXIS = (0.13, 0.94, 0.32)
STRATA_EXPOSURE = (0.74, -0.26, 0.62)


def parse_args() -> argparse.Namespace:
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input-blend", type=Path, default=DEFAULT_INPUT)
    parser.add_argument("--output-root", type=Path, default=DEFAULT_OUTPUT_ROOT)
    parser.add_argument("--skip-export", action="store_true", help="Write blend/report but not GLB.")
    parser.add_argument("--skip-subdivision", action="store_true", help="Diagnostic only; not a final candidate.")
    return parser.parse_args(argv)


def _resolved(path: Path) -> Path:
    return path.expanduser().resolve()


def _inside(path: Path, parent: Path) -> bool:
    try:
        path.relative_to(parent)
        return True
    except ValueError:
        return False


def validate_paths(input_blend: Path, output_root: Path) -> tuple[Path, Path]:
    input_blend = _resolved(input_blend)
    output_root = _resolved(output_root)
    allowed_source_root = _resolved(PACKET_ROOT / "blender")
    allowed_output_root = _resolved(PACKET_ROOT / "candidates")
    forbidden = tuple(_resolved(path) for path in (
        ROOT / "assets" / "ships" / "parts",
        ROOT / "assets" / "ships" / "release",
        ROOT / "assets" / "ships" / "release.__building",
    ))
    if not input_blend.is_file() or input_blend.suffix.lower() != ".blend":
        raise RuntimeError(f"missing Blender source: {input_blend}")
    if not _inside(input_blend, allowed_source_root):
        raise RuntimeError(f"input must remain inside canonical authoring root: {allowed_source_root}")
    if not _inside(output_root, allowed_output_root):
        raise RuntimeError(f"candidate output must remain inside: {allowed_output_root}")
    if any(_inside(output_root, path) for path in forbidden) or output_root == input_blend.parent:
        raise RuntimeError(f"refusing live/generated output path: {output_root}")
    if RELEASE_LOCK.exists():
        raise RuntimeError(f"active release ownership signal; retry after it is gone: {RELEASE_LOCK}")
    return input_blend, output_root


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def normalized(value: Iterable[float]) -> Vector:
    vector = Vector(tuple(float(v) for v in value))
    if vector.length < 1e-8:
        raise ValueError("zero-length recipe vector")
    return vector.normalized()


def clamp(value: float, low: float, high: float) -> float:
    return min(high, max(low, value))


def smoothstep(low: float, high: float, value: float) -> float:
    if high <= low:
        return float(value >= high)
    t = clamp((value - low) / (high - low), 0.0, 1.0)
    return t * t * (3.0 - 2.0 * t)


def cap_weight(direction: Vector, cap_direction: Iterable[float], start: float, full: float) -> float:
    return smoothstep(start, full, direction.dot(normalized(cap_direction)))


def lod_of(obj: bpy.types.Object) -> str | None:
    tagged = str(obj.get("spaceface.lod", "") or obj.get("spaceface_lod", "")).lower()
    if tagged in EXPECTED_LODS:
        return tagged
    name = obj.name.lower()
    for lod in EXPECTED_LODS:
        if lod in name:
            return lod
    return None


def descendants(root: bpy.types.Object) -> list[bpy.types.Object]:
    result = []
    stack = list(root.children)
    while stack:
        obj = stack.pop()
        result.append(obj)
        stack.extend(obj.children)
    return result


def material_names(obj: bpy.types.Object) -> set[str]:
    return {slot.material.name.split(".")[0] for slot in obj.material_slots if slot.material}


def find_targets(root: bpy.types.Object) -> dict[str, bpy.types.Object]:
    candidates: dict[str, list[bpy.types.Object]] = {lod: [] for lod in EXPECTED_LODS}
    for obj in descendants(root):
        lod = lod_of(obj)
        if obj.type != "MESH" or lod not in candidates:
            continue
        if any("rock" in name.lower() or "geolog" in name.lower() for name in material_names(obj)):
            candidates[lod].append(obj)
    selected: dict[str, bpy.types.Object] = {}
    for lod, objects in candidates.items():
        if not objects:
            raise RuntimeError(f"{ROOT_NAME} has no geological {lod} mesh")
        selected[lod] = max(objects, key=lambda obj: len(obj.data.polygons))
    return selected


def remove_legacy_warm_primitives(root: bpy.types.Object, targets: dict[str, bpy.types.Object]) -> list[str]:
    protected = set(targets.values())
    removed: list[str] = []
    for obj in list(descendants(root)):
        if obj in protected or obj.type != "MESH":
            continue
        names = {name.lower() for name in material_names(obj)}
        token = obj.name.lower()
        if "material_warm" in names and ("ore" in token or "merged_material_warm" in token):
            removed.append(obj.name)
            bpy.data.objects.remove(obj, do_unlink=True)
    return sorted(removed)


def activate(obj: bpy.types.Object) -> None:
    bpy.ops.object.select_all(action="DESELECT")
    obj.hide_set(False)
    obj.hide_viewport = False
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj


def apply_scale(obj: bpy.types.Object, *, rotation: bool = False) -> None:
    activate(obj)
    bpy.ops.object.transform_apply(location=False, rotation=rotation, scale=True)
    obj.select_set(False)


def subdivide_once(obj: bpy.types.Object) -> int:
    before = sum(max(0, len(poly.vertices) - 2) for poly in obj.data.polygons)
    mesh = obj.data
    bm = bmesh.new()
    bm.from_mesh(mesh)
    bmesh.ops.subdivide_edges(
        bm,
        edges=list(bm.edges),
        cuts=1,
        use_grid_fill=True,
        smooth=0.0,
    )
    bm.to_mesh(mesh)
    bm.free()
    mesh.update()
    after = sum(max(0, len(poly.vertices) - 2) for poly in mesh.polygons)
    if after <= before:
        raise RuntimeError(f"subdivision made no new geology samples on {obj.name}")
    return after - before


def local_bounds(obj: bpy.types.Object) -> tuple[Vector, Vector, Vector]:
    coords = [vertex.co for vertex in obj.data.vertices]
    if not coords:
        raise RuntimeError(f"empty geology mesh: {obj.name}")
    low = Vector((min(v.x for v in coords), min(v.y for v in coords), min(v.z for v in coords)))
    high = Vector((max(v.x for v in coords), max(v.y for v in coords), max(v.z for v in coords)))
    center = (low + high) * 0.5
    extent = (high - low) * 0.5
    if min(extent) <= 1e-5:
        raise RuntimeError(f"degenerate geology bounds: {obj.name} {tuple(extent)}")
    return center, extent, high - low


def normalized_coordinate(co: Vector, center: Vector, extent: Vector) -> Vector:
    return Vector(((co.x - center.x) / extent.x, (co.y - center.y) / extent.y, (co.z - center.z) / extent.z))


def fracture_components(q: Vector, recipe: FractureRecipe) -> tuple[float, float, float]:
    plane_normal = normalized(recipe.normal)
    source_tangent = normalized(recipe.tangent)
    tangent = (source_tangent - plane_normal * plane_normal.dot(source_tangent)).normalized()
    bitangent = plane_normal.cross(tangent).normalized()
    along = q.dot(tangent)
    across = q.dot(bitangent)
    warped = q.dot(plane_normal) - recipe.offset
    warped += recipe.warp * math.sin(along * 7.0 + across * 3.2 + recipe.phase)
    band = math.exp(-((warped / recipe.width) ** 2))
    length_gate = 1.0 - smoothstep(recipe.half_length * 0.74, recipe.half_length, abs(along))
    height_gate = 1.0 - smoothstep(recipe.half_height * 0.72, recipe.half_height, abs(across))
    return band * length_gate * height_gate, along, across


def strata_field(direction: Vector) -> float:
    exposure = cap_weight(direction, STRATA_EXPOSURE, 0.02, 0.62)
    coordinate = direction.dot(normalized(STRATA_AXIS))
    terrace = ((coordinate * 8.0 + 0.37) % 1.0) - 0.5
    # A broad ledge with a short undercut, not high-frequency sinusoidal embossing.
    ledge = clamp(terrace * 3.4, -0.62, 0.36)
    return ledge * exposure * 0.012


def crater_field(direction: Vector, recipe: CraterRecipe) -> float:
    target = normalized(recipe.direction)
    angle = math.acos(clamp(direction.dot(target), -1.0, 1.0))
    radius = recipe.angular_radius
    if angle > radius * 1.34:
        return 0.0
    bowl_t = clamp(angle / radius, 0.0, 1.0)
    bowl = -recipe.depth * (1.0 - bowl_t * bowl_t) ** 2 if angle < radius else 0.0
    rim_sigma = radius * 0.13
    rim = recipe.rim_height * math.exp(-(((angle - radius) / max(rim_sigma, 1e-5)) ** 2))
    return bowl + rim


def macro_field(direction: Vector) -> float:
    # Breakaway face, opposing compressed lobe, and a shoulder shelf establish a specific crag
    # silhouette. These structures remain in every LOD.
    breakaway = cap_weight(direction, (-0.83, 0.18, 0.53), 0.34, 0.88)
    compression = cap_weight(direction, (0.72, 0.51, -0.47), 0.28, 0.86)
    shelf = cap_weight(direction, (0.20, -0.43, 0.88), 0.18, 0.79)
    cleft = cap_weight(direction, (-0.14, -0.95, -0.28), 0.46, 0.92)
    return -0.070 * breakaway + 0.054 * compression + 0.038 * shelf - 0.031 * cleft


def deform_geology(obj: bpy.types.Object, lod: str) -> dict:
    center, extent, size = local_bounds(obj)
    reference_radius = min(size) * 0.5
    meso_factor = {"lod0": 1.0, "lod1": 0.72, "lod2": 0.38}[lod]
    max_abs_displacement = 0.0
    for vertex in obj.data.vertices:
        q = normalized_coordinate(vertex.co, center, extent)
        direction = q.normalized() if q.length > 1e-7 else Vector((1.0, 0.0, 0.0))
        displacement = macro_field(direction)
        displacement += strata_field(direction) * meso_factor
        displacement += sum(crater_field(direction, crater) for crater in CRATERS) * meso_factor
        for fracture in FRACTURES:
            influence, _, _ = fracture_components(q, fracture)
            displacement -= influence * fracture.depth * meso_factor
        world_delta = direction * displacement * reference_radius
        vertex.co += world_delta
        max_abs_displacement = max(max_abs_displacement, world_delta.length)
    obj.data.update()
    for polygon in obj.data.polygons:
        polygon.use_smooth = True
    obj["sf_golden_geology_recipe"] = RECIPE_ID
    obj["sf_geology_seed"] = str(SEED)
    obj["sf_geology_structure"] = "breakaway+terrace+oriented-fractures+localized-impacts"
    return {
        "referenceRadiusM": float(reference_radius),
        "maxDisplacementM": float(max_abs_displacement),
        "mesoFactor": meso_factor,
    }


def _source_texture_paths() -> dict[str, dict[str, Path]]:
    texture_root = PACKET_ROOT / "textures"
    paths = {
        role: {channel: texture_root / f"{role}_{channel}.png" for channel in ("basecolor", "normal", "orm")}
        for role in ("rock", "warm")
    }
    missing = [str(path) for role in paths.values() for path in role.values() if not path.is_file()]
    if missing:
        raise RuntimeError("missing surface-foundry inputs; generate them before Blender binding:\n" + "\n".join(missing))
    return paths


def _read_image(path: Path, non_color: bool) -> tuple[np.ndarray, bpy.types.Image]:
    image = bpy.data.images.load(str(path), check_existing=True)
    image.colorspace_settings.name = "Non-Color" if non_color else "sRGB"
    width, height = int(image.size[0]), int(image.size[1])
    pixels = np.empty(width * height * 4, dtype=np.float32)
    image.pixels.foreach_get(pixels)
    return pixels.reshape((height, width, 4)), image


def _write_image(path: Path, name: str, pixels: np.ndarray, non_color: bool) -> bpy.types.Image:
    path.parent.mkdir(parents=True, exist_ok=True)
    height, width, channels = pixels.shape
    if channels != 4:
        raise RuntimeError(f"expected RGBA pixels for {name}")
    prior = bpy.data.images.get(name)
    if prior:
        bpy.data.images.remove(prior)
    image = bpy.data.images.new(name, width=width, height=height, alpha=True, float_buffer=False)
    image.colorspace_settings.name = "Non-Color" if non_color else "sRGB"
    image.pixels.foreach_set(np.ascontiguousarray(pixels, dtype=np.float32).ravel())
    image.filepath_raw = str(path)
    image.file_format = "PNG"
    image.save()
    image.pack()
    return image


def _derive_base(source: np.ndarray, recipe: MaterialRecipe) -> np.ndarray:
    rgba = source.copy()
    rgb = np.clip(rgba[:, :, :3], 0.0, 1.0)
    luminance = rgb[:, :, 0] * 0.2126 + rgb[:, :, 1] * 0.7152 + rgb[:, :, 2] * 0.0722
    gray = luminance[:, :, None]
    rgb = gray + (rgb - gray) * recipe.saturation
    # Derive broad value structure from the photographed geology itself. This preserves strata and
    # avoids laying an unrelated uniform noise field over the rock.
    broad = (
        luminance
        + np.roll(luminance, 29, axis=0)
        + np.roll(luminance, -37, axis=1)
        + np.roll(luminance, (53, -61), axis=(0, 1))
    ) * 0.25
    broad = (broad - float(broad.mean())) / max(float(broad.std()), 1e-5)
    multiplier = np.asarray(recipe.base_multiplier, dtype=np.float32)[None, None, :]
    rgba[:, :, :3] = np.clip(rgb * multiplier * (1.0 + broad[:, :, None] * 0.045), 0.004, 0.92)
    rgba[:, :, 3] = 1.0
    return rgba


def _derive_normal(source: np.ndarray, strength: float) -> np.ndarray:
    rgba = source.copy()
    vector = np.clip(rgba[:, :, :3], 0.0, 1.0) * 2.0 - 1.0
    vector[:, :, :2] *= strength
    length = np.maximum(np.linalg.norm(vector, axis=-1, keepdims=True), 1e-6)
    rgba[:, :, :3] = vector / length * 0.5 + 0.5
    rgba[:, :, 3] = 1.0
    return rgba


def _derive_orm(source: np.ndarray, recipe: MaterialRecipe) -> np.ndarray:
    rgba = source.copy()
    src = np.clip(source[:, :, :3], 0.0, 1.0)
    ao = recipe.ao_floor + src[:, :, 0] * (1.0 - recipe.ao_floor)
    roughness = recipe.roughness_center + (src[:, :, 1] - 0.5) * recipe.roughness_span
    metallic = recipe.metallic_center + (src[:, :, 2] - 0.5) * recipe.metallic_span
    rgba[:, :, 0] = np.clip(ao, 0.0, 1.0)
    rgba[:, :, 1] = np.clip(roughness, 0.08, 0.99)
    rgba[:, :, 2] = np.clip(metallic, 0.0, 0.82)
    rgba[:, :, 3] = 1.0
    return rgba


def derive_role_textures(output_root: Path) -> tuple[dict[str, dict[str, bpy.types.Image]], dict]:
    sources = _source_texture_paths()
    source_arrays: dict[str, dict[str, np.ndarray]] = {}
    for role, channels in sources.items():
        source_arrays[role] = {}
        for channel, path in channels.items():
            pixels, _ = _read_image(path, non_color=channel != "basecolor")
            source_arrays[role][channel] = pixels

    images: dict[str, dict[str, bpy.types.Image]] = {}
    metrics: dict[str, dict] = {}
    for key, recipe in SEMANTIC_MATERIALS.items():
        source = source_arrays[recipe.source_role]
        maps = {
            "basecolor": _derive_base(source["basecolor"], recipe),
            "normal": _derive_normal(source["normal"], recipe.normal_strength),
            "orm": _derive_orm(source["orm"], recipe),
        }
        images[key] = {}
        for channel, pixels in maps.items():
            path = output_root / "textures" / f"rock_a_{key}_{channel}.png"
            images[key][channel] = _write_image(
                path, f"rock_a_{key}_{channel}", pixels, non_color=channel != "basecolor",
            )
        metrics[key] = {
            "roughnessMean": float(maps["orm"][:, :, 1].mean()),
            "roughnessStd": float(maps["orm"][:, :, 1].std()),
            "metallicMean": float(maps["orm"][:, :, 2].mean()),
            "normalXyStd": float(maps["normal"][:, :, :2].std()),
            "textureSha256": {
                channel: sha256(output_root / "textures" / f"rock_a_{key}_{channel}.png")
                for channel in maps
            },
        }
        if metrics[key]["roughnessStd"] <= 0.003:
            raise RuntimeError(f"{key} roughness collapsed to an effectively constant response")
    return images, metrics


def _principled_input(shader: bpy.types.Node, *names: str):
    for name in names:
        if name in shader.inputs:
            return shader.inputs[name]
    raise RuntimeError(f"Principled BSDF missing one of: {names}")


def create_material(recipe: MaterialRecipe, images: dict[str, bpy.types.Image]) -> bpy.types.Material:
    material = bpy.data.materials.get(recipe.name) or bpy.data.materials.new(recipe.name)
    material.use_nodes = True
    material.use_backface_culling = True
    material.diffuse_color = (*(clamp(value, 0.0, 1.0) for value in recipe.base_multiplier), 1.0)
    material["spacefaceMaterialRole"] = recipe.semantic_role
    material["spacefaceSurfaceRecipe"] = RECIPE_ID
    material["spacefacePhysicalResponse"] = {
        "roughnessCenter": recipe.roughness_center,
        "roughnessSpan": recipe.roughness_span,
        "metallicCenter": recipe.metallic_center,
        "metallicSpan": recipe.metallic_span,
        "normalStrength": recipe.normal_strength,
    }
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    nodes.clear()

    output = nodes.new("ShaderNodeOutputMaterial")
    output.location = (520, 40)
    shader = nodes.new("ShaderNodeBsdfPrincipled")
    shader.location = (210, 40)
    shader.label = recipe.semantic_role
    _principled_input(shader, "Roughness").default_value = recipe.roughness_center
    _principled_input(shader, "Metallic").default_value = recipe.metallic_center
    links.new(shader.outputs["BSDF"], output.inputs["Surface"])

    base = nodes.new("ShaderNodeTexImage")
    base.name = f"{recipe.name}_BaseColor"
    base.image = images["basecolor"]
    base.location = (-760, 270)
    links.new(base.outputs["Color"], _principled_input(shader, "Base Color"))

    orm = nodes.new("ShaderNodeTexImage")
    orm.name = f"{recipe.name}_ORM"
    orm.image = images["orm"]
    orm.location = (-760, -10)
    split = nodes.new("ShaderNodeSeparateColor")
    split.location = (-480, -10)
    links.new(orm.outputs["Color"], split.inputs["Color"])
    links.new(split.outputs["Green"], _principled_input(shader, "Roughness"))
    links.new(split.outputs["Blue"], _principled_input(shader, "Metallic"))

    gltf_group = bpy.data.node_groups.get("glTF Material Output")
    if gltf_group is None:
        gltf_group = bpy.data.node_groups.new("glTF Material Output", "ShaderNodeTree")
        try:
            gltf_group.interface.new_socket(name="Occlusion", in_out="INPUT", socket_type="NodeSocketFloat")
        except Exception:
            pass
    ao_output = nodes.new("ShaderNodeGroup")
    ao_output.node_tree = gltf_group
    ao_output.location = (-190, -180)
    if "Occlusion" in ao_output.inputs:
        links.new(split.outputs["Red"], ao_output.inputs["Occlusion"])

    normal_texture = nodes.new("ShaderNodeTexImage")
    normal_texture.name = f"{recipe.name}_Normal"
    normal_texture.image = images["normal"]
    normal_texture.location = (-760, -330)
    normal_map = nodes.new("ShaderNodeNormalMap")
    normal_map.location = (-430, -330)
    normal_map.inputs["Strength"].default_value = 1.0
    links.new(normal_texture.outputs["Color"], normal_map.inputs["Color"])
    links.new(normal_map.outputs["Normal"], _principled_input(shader, "Normal"))
    return material


def assign_material_roles(obj: bpy.types.Object, materials: dict[str, bpy.types.Material], lod: str) -> dict[str, int]:
    obj.data.materials.clear()
    role_order = ("matrix", "fracture", "regolith", "ferrite")
    for role in role_order:
        obj.data.materials.append(materials[role])
    center, extent, _ = local_bounds(obj)
    counts = {role: 0 for role in role_order}
    for polygon in obj.data.polygons:
        polygon_center = sum((obj.data.vertices[index].co for index in polygon.vertices), Vector()) / len(polygon.vertices)
        q = normalized_coordinate(polygon_center, center, extent)
        direction = q.normalized() if q.length > 1e-7 else Vector((1.0, 0.0, 0.0))
        fracture_values = [fracture_components(q, recipe)[0] for recipe in FRACTURES]
        strongest = max(fracture_values)
        ferrite_strength = max(
            (value for value, recipe in zip(fracture_values, FRACTURES) if recipe.ferrite),
            default=0.0,
        )
        ferrite_patch = 0.5 + 0.5 * math.sin(q.dot(normalized((0.34, 0.88, -0.32))) * 8.0 + 1.7)
        upward = max(0.0, polygon.normal.z)
        basin = 1.0 - smoothstep(0.88, 1.06, q.length)
        sheltered = cap_weight(direction, (-0.26, -0.18, 0.95), -0.10, 0.72)
        regolith_score = upward * 0.50 + basin * 0.34 + sheltered * 0.28

        if ferrite_strength > (0.54 if lod == "lod0" else 0.47) and ferrite_patch > 0.56:
            role = "ferrite"
        elif strongest > (0.27 if lod == "lod0" else 0.22):
            role = "fracture"
        elif regolith_score > 0.66:
            role = "regolith"
        else:
            role = "matrix"
        polygon.material_index = role_order.index(role)
        counts[role] += 1
    obj.data.update()
    return counts


def set_parent_keep_world(obj: bpy.types.Object, parent: bpy.types.Object) -> None:
    world = obj.matrix_world.copy()
    obj.parent = parent
    obj.matrix_world = world


def ensure_uv_and_tangents(obj: bpy.types.Object, warnings: list[str]) -> None:
    if not obj.data.uv_layers:
        activate(obj)
        bpy.ops.object.mode_set(mode="EDIT")
        bpy.ops.mesh.select_all(action="SELECT")
        bpy.ops.uv.smart_project(angle_limit=math.radians(58.0), island_margin=0.018)
        bpy.ops.object.mode_set(mode="OBJECT")
    try:
        uv_name = obj.data.uv_layers.active.name
        if hasattr(obj.data, "free_tangents"):
            obj.data.free_tangents()
        obj.data.calc_tangents(uvmap=uv_name)
    except Exception as exc:
        warnings.append(f"tangent calculation requires later repair on {obj.name}: {exc}")


def create_ferrite_inclusions(
    root: bpy.types.Object,
    targets: dict[str, bpy.types.Object],
    material: bpy.types.Material,
    warnings: list[str],
) -> list[bpy.types.Object]:
    rng = random.Random(SEED)
    directions = (
        (0.67, -0.18, 0.72),
        (-0.42, 0.84, 0.35),
        (0.74, 0.55, -0.38),
    )
    created: list[bpy.types.Object] = []
    for lod, count in (("lod0", 3), ("lod1", 2)):
        target = targets[lod]
        center, extent, size = local_bounds(target)
        base_scale = min(size) * (0.038 if lod == "lod0" else 0.044)
        for index, direction_values in enumerate(directions[:count]):
            direction = normalized(direction_values)
            chosen = max(
                target.data.vertices,
                key=lambda vertex: normalized_coordinate(vertex.co, center, extent).normalized().dot(direction),
            )
            local_normal = normalized_coordinate(chosen.co, center, extent).normalized()
            world_normal = (target.matrix_world.to_3x3() @ local_normal).normalized()
            world_position = target.matrix_world @ chosen.co - world_normal * base_scale * 0.34
            bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1, radius=1.0, location=world_position)
            inclusion = bpy.context.object
            inclusion.name = f"{lod.upper()}_Geology_FerriteNodule_{index:02d}"
            inclusion.rotation_euler = world_normal.to_track_quat("Z", "Y").to_euler()
            inclusion.rotation_euler.rotate_axis("Z", rng.uniform(-0.48, 0.48))
            inclusion.scale = (
                base_scale * rng.uniform(1.10, 1.38),
                base_scale * rng.uniform(0.48, 0.72),
                base_scale * rng.uniform(0.26, 0.42),
            )
            apply_scale(inclusion, rotation=True)
            inclusion.data.materials.append(material)
            for polygon in inclusion.data.polygons:
                polygon.use_smooth = False
            bevel = inclusion.modifiers.new("GeologyEdgeRelief", "BEVEL")
            bevel.width = max(0.006, base_scale * 0.055)
            bevel.segments = 1
            bevel.limit_method = "ANGLE"
            activate(inclusion)
            try:
                bpy.ops.object.modifier_apply(modifier=bevel.name)
            except Exception as exc:
                warnings.append(f"mineral edge relief deferred on {inclusion.name}: {exc}")
            set_parent_keep_world(inclusion, root)
            inclusion["spaceface.lod"] = lod
            inclusion["spacefaceMaterialRole"] = "geology"
            inclusion["sf_geology_feature"] = "fracture-rooted-ferrite-inclusion"
            inclusion["sf_golden_geology_recipe"] = RECIPE_ID
            ensure_uv_and_tangents(inclusion, warnings)
            created.append(inclusion)
    return created


def world_bounds(objects: Iterable[bpy.types.Object]) -> tuple[Vector, Vector]:
    low = Vector((1e12, 1e12, 1e12))
    high = Vector((-1e12, -1e12, -1e12))
    found = False
    for obj in objects:
        if obj.type != "MESH":
            continue
        found = True
        for corner in obj.bound_box:
            point = obj.matrix_world @ Vector(corner)
            low.x = min(low.x, point.x); low.y = min(low.y, point.y); low.z = min(low.z, point.z)
            high.x = max(high.x, point.x); high.y = max(high.y, point.y); high.z = max(high.z, point.z)
    if not found:
        raise RuntimeError("no LOD0 meshes for collision bounds")
    return low, high


def update_collision(root: bpy.types.Object, lod0_meshes: list[bpy.types.Object]) -> dict:
    collision = next((obj for obj in descendants(root) if obj.name == "COLLISION_HULL"), None)
    if collision is None:
        raise RuntimeError("candidate source lost COLLISION_HULL helper")
    low, high = world_bounds(lod0_meshes)
    size = (high - low) * 0.92
    center = (low + high) * 0.5
    collision.matrix_parent_inverse.identity()
    collision.location = root.matrix_world.inverted() @ center
    collision.empty_display_size = max(size) * 0.5
    bounds = {
        "min": [float(v) for v in low],
        "max": [float(v) for v in high],
        "size": [float(v) for v in size],
        "center": [float(v) for v in center],
        "coverage": 0.92,
    }
    collision["spaceface"] = {
        "collision": True, "helper": True, "nonRender": True, "role": "collision", "bounds": bounds,
    }
    collision["sf_collision"] = True
    collision["sf_non_render"] = True
    collision["bounds"] = bounds
    return bounds


def triangle_count(obj: bpy.types.Object) -> int:
    return sum(max(0, len(polygon.vertices) - 2) for polygon in obj.data.polygons)


def geometry_fingerprint(objects: Iterable[bpy.types.Object]) -> str:
    digest = hashlib.sha256()
    for obj in sorted(objects, key=lambda item: item.name):
        digest.update(obj.name.encode("utf-8"))
        for vertex in obj.data.vertices:
            digest.update(struct.pack("<3d", float(vertex.co.x), float(vertex.co.y), float(vertex.co.z)))
        for polygon in obj.data.polygons:
            digest.update(struct.pack("<II", int(polygon.material_index), len(polygon.vertices)))
            digest.update(struct.pack(f"<{len(polygon.vertices)}I", *polygon.vertices))
    return digest.hexdigest()


def stamp_root(root: bpy.types.Object, source_hash: str) -> None:
    current = dict(root.get("spacefaceAsset", {}))
    current.update({
        "partId": SOURCE_ASSET_ID,
        "liveId": SOURCE_ASSET_ID,
        "goldenGeologyRecipe": RECIPE_ID,
        "goldenGeologySeed": str(SEED),
        "surfaceLanguage": "oriented-fracture-ferrite-regolith-v3",
        "promotion": "candidate_requires_normal_route_visual_acceptance",
        "sourceBlendSha256": source_hash,
    })
    root["spacefaceAsset"] = current


def export_glb(path: Path, root: bpy.types.Object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.object.select_all(action="DESELECT")
    objects = [root, *descendants(root)]
    for obj in objects:
        obj.hide_set(False)
        obj.hide_viewport = False
        if obj.name != "COLLISION_HULL":
            obj.hide_render = False
        obj.select_set(True)
    kwargs = dict(
        filepath=str(path),
        export_format="GLB",
        use_selection=True,
        export_apply=True,
        export_yup=True,
        export_extras=True,
        export_animations=False,
        export_materials="EXPORT",
        export_texcoords=True,
        export_normals=True,
        export_tangents=True,
        export_attributes=True,
        export_image_format="AUTO",
        export_unused_images=False,
    )
    try:
        bpy.ops.export_scene.gltf(**kwargs)
    except TypeError:
        for optional in ("export_unused_images", "export_attributes"):
            kwargs.pop(optional, None)
        bpy.ops.export_scene.gltf(**kwargs)
    bpy.ops.object.select_all(action="DESELECT")


def _verify_success_artifacts(
    report_path: Path,
    candidate_blend: Path,
    candidate_glb: Path,
    *,
    require_glb: bool,
) -> dict:
    """Reread the controller-facing contract before allowing a success receipt."""
    if not candidate_blend.is_file() or candidate_blend.stat().st_size <= 0:
        raise RuntimeError(f"candidate blend missing after save: {candidate_blend}")
    if require_glb and (not candidate_glb.is_file() or candidate_glb.stat().st_size <= 0):
        raise RuntimeError(f"candidate GLB missing after export: {candidate_glb}")
    if not report_path.is_file() or report_path.stat().st_size <= 0:
        raise RuntimeError(f"candidate report missing after write: {report_path}")

    report = json.loads(report_path.read_text(encoding="utf-8"))
    if report.get("recipeId") != RECIPE_ID or report.get("status") != "candidate_requires_visual_acceptance":
        raise RuntimeError("candidate report identity/status mismatch")
    validation = report.get("validation")
    if not isinstance(validation, dict) or validation.get("reportContract") != "pass":
        raise RuntimeError("candidate report validation contract was not written")
    artifacts = report.get("artifacts")
    if not isinstance(artifacts, dict):
        raise RuntimeError("candidate report artifacts block missing")
    if artifacts.get("blendSha256") != sha256(candidate_blend):
        raise RuntimeError("candidate blend hash differs from the written report")
    if artifacts.get("blendBytes") != candidate_blend.stat().st_size:
        raise RuntimeError("candidate blend byte count differs from the written report")
    if require_glb:
        if validation.get("candidateGlb") != "pass":
            raise RuntimeError("candidate GLB validation was not recorded as pass")
        if artifacts.get("glbSha256") != sha256(candidate_glb):
            raise RuntimeError("candidate GLB hash differs from the written report")
        if artifacts.get("glbBytes") != candidate_glb.stat().st_size:
            raise RuntimeError("candidate GLB byte count differs from the written report")
    elif validation.get("candidateGlb") != "skipped_by_explicit_flag":
        raise RuntimeError("skip-export result was not recorded explicitly")

    texture_metrics = report.get("textureMetrics")
    if not isinstance(texture_metrics, dict) or set(texture_metrics) != set(SEMANTIC_MATERIALS):
        raise RuntimeError("semantic texture validation fields are incomplete")
    for role, metrics in texture_metrics.items():
        if not isinstance(metrics, dict) or not metrics.get("textureSha256"):
            raise RuntimeError(f"texture hashes missing for {role}")
        if float(metrics.get("roughnessStd", 0.0)) <= 0.003:
            raise RuntimeError(f"roughness validation failed after report reread for {role}")
        for channel, expected_hash in metrics["textureSha256"].items():
            texture_path = report_path.parent / "textures" / f"rock_a_{role}_{channel}.png"
            if not texture_path.is_file() or sha256(texture_path) != expected_hash:
                raise RuntimeError(f"written texture hash mismatch for {role}/{channel}")

    return {
        "ok": True,
        "status": report["status"],
        "candidate": str(candidate_glb if require_glb else candidate_blend),
        "candidateSha256": sha256(candidate_glb if require_glb else candidate_blend),
        "report": str(report_path),
        "reportSha256": sha256(report_path),
        "geometryFingerprintSha256": report.get("geometryFingerprintSha256"),
        "validation": validation,
        "warnings": report.get("warnings", []),
    }


def main() -> dict:
    args = parse_args()
    input_blend, output_root = validate_paths(args.input_blend, args.output_root)
    source_hash = sha256(input_blend)
    output_root.mkdir(parents=True, exist_ok=True)
    candidate_blend = output_root / "blender" / "helios_rock_a_golden_geology_v3.blend"
    candidate_glb = output_root / "places" / "place_asteroid_rock_a.glb"
    report_path = output_root / "recipe-report.json"
    report_temp = report_path.with_suffix(".json.tmp")
    # Known candidate outputs are cleared only after output-root containment has been proven. This
    # prevents any failed rerun from leaving a stale prior success report for a controller to find.
    for stale in (candidate_blend, candidate_glb, report_path, report_temp):
        stale.unlink(missing_ok=True)

    # Reopening the immutable canonical source is the idempotency mechanism. Running the command
    # twice cannot accumulate a second deformation pass or duplicate candidate geometry.
    bpy.ops.wm.open_mainfile(filepath=str(input_blend))
    if any(obj.get("sf_golden_geology_recipe") == RECIPE_ID for obj in bpy.data.objects):
        raise RuntimeError("input is already a generated candidate; reopen the canonical production source")
    root = bpy.data.objects.get(ROOT_NAME)
    if root is None:
        raise RuntimeError(f"canonical root not found: {ROOT_NAME}")

    targets = find_targets(root)
    removed = remove_legacy_warm_primitives(root, targets)
    role_images, texture_metrics = derive_role_textures(output_root)
    materials = {
        role: create_material(recipe, role_images[role])
        for role, recipe in SEMANTIC_MATERIALS.items()
    }

    warnings: list[str] = []
    lod_report: dict[str, dict] = {}
    for lod, obj in targets.items():
        apply_scale(obj)
        added_triangles = 0
        if not args.skip_subdivision and lod in {"lod0", "lod1"}:
            added_triangles = subdivide_once(obj)
        deformation = deform_geology(obj, lod)
        role_faces = assign_material_roles(obj, materials, lod)
        ensure_uv_and_tangents(obj, warnings)
        lod_report[lod] = {
            "object": obj.name,
            "triangles": triangle_count(obj),
            "subdivisionTrianglesAdded": added_triangles,
            "materialFaceCounts": role_faces,
            "scaleApplied": all(abs(float(value) - 1.0) < 1e-6 for value in obj.scale),
            **deformation,
        }

    inclusions = create_ferrite_inclusions(root, targets, materials["ferrite"], warnings)
    lod0_objects = [targets["lod0"], *(obj for obj in inclusions if lod_of(obj) == "lod0")]
    collision_bounds = update_collision(root, lod0_objects)
    stamp_root(root, source_hash)

    candidate_blend.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(candidate_blend), check_existing=False)
    if not candidate_blend.is_file() or candidate_blend.stat().st_size <= 0:
        raise RuntimeError(f"Blender reported save but candidate blend is absent: {candidate_blend}")
    if not args.skip_export:
        export_glb(candidate_glb, root)
        if not candidate_glb.is_file() or candidate_glb.stat().st_size <= 0:
            raise RuntimeError(f"Blender reported export but candidate GLB is absent: {candidate_glb}")

    mesh_objects = [obj for obj in [*targets.values(), *inclusions] if obj.type == "MESH"]
    report = {
        "recipeId": RECIPE_ID,
        "status": "candidate_requires_visual_acceptance",
        "sourceAssetId": SOURCE_ASSET_ID,
        "sourceBlend": str(input_blend.relative_to(ROOT)),
        "sourceBlendSha256": source_hash,
        "seed": str(SEED),
        "idempotency": "every run reloads the canonical source before mutation",
        "removedLegacyGeometry": removed,
        "semanticMaterials": {role: asdict(recipe) for role, recipe in SEMANTIC_MATERIALS.items()},
        "fractures": [asdict(recipe) for recipe in FRACTURES],
        "craters": [asdict(recipe) for recipe in CRATERS],
        "lods": lod_report,
        "ferriteInclusions": [obj.name for obj in inclusions],
        "collisionBounds": collision_bounds,
        "textureMetrics": texture_metrics,
        "geometryFingerprintSha256": geometry_fingerprint(mesh_objects),
        "artifacts": {
            "blend": str(candidate_blend.relative_to(ROOT)),
            "blendSha256": sha256(candidate_blend),
            "blendBytes": candidate_blend.stat().st_size,
            "glb": None if args.skip_export else str(candidate_glb.relative_to(ROOT)),
        },
        "integrationCommands": [
            "python scripts/check-golden-geology-v3.py",
            '"C:\\Program Files\\Blender Foundation\\Blender 5.1\\blender.exe" --background '
            "--python assets/ships/m4_helios_hub/scripts/golden_geology_v3.py -- "
            "--input-blend assets/ships/m4_helios_hub/blender/helios_rock_a_production.blend",
            "npx gltf-transform inspect assets/ships/m4_helios_hub/candidates/golden_geology_v3/places/place_asteroid_rock_a.glb",
        ],
        "warnings": warnings,
        "validation": {
            "reportContract": "pass",
            "candidateBlend": "pass",
            "candidateGlb": "skipped_by_explicit_flag" if args.skip_export else "pass",
            "sourceReloadedBeforeMutation": "pass",
            "semanticTextureRoles": "pass",
            "roughnessVariation": "pass",
            "collisionBoundsRegenerated": "pass",
            "visualAcceptance": "pending_normal_route_review",
        },
        "expectedMetrics": {
            "lodSet": list(EXPECTED_LODS),
            "semanticMaterialRoles": sorted(SEMANTIC_MATERIALS),
            "roughnessMustRemainSpatiallyNonuniform": True,
            "materialEmissionAllowed": False,
            "lod0AndLod1SubdivisionRequiredForFinalCandidate": not args.skip_subdivision,
            "scaleApplied": True,
            "collisionBoundsRegenerated": True,
        },
        "unresolvedAcceptanceNeeds": [
            "Khronos glTF validation and glTF Transform inspection",
            "KTX2/meshopt finalization through the repository release pipeline",
            "matched close/default/max gameplay captures without HUD or shield interference",
            "motion and LOD-transition capture proving no shimmer, pop, flicker, or detached inclusions",
            "mining/drilling interaction proof from the default player route",
            "measured texture residency, draw calls, and normal/tangent correctness",
        ],
    }
    if candidate_glb.is_file():
        report["artifacts"]["glbSha256"] = sha256(candidate_glb)
        report["artifacts"]["glbBytes"] = candidate_glb.stat().st_size
    report_temp.parent.mkdir(parents=True, exist_ok=True)
    report_temp.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    report_temp.replace(report_path)
    # No success text is emitted in main(). The top-level guard prints only this independently
    # verified receipt after all required artifacts and report hashes survive a reread.
    receipt = _verify_success_artifacts(
        report_path,
        candidate_blend,
        candidate_glb,
        require_glb=not args.skip_export,
    )
    return receipt


def _flush_streams() -> None:
    for stream in (sys.stderr, sys.stdout):
        try:
            stream.flush()
        except Exception:
            pass


def blender_cli_entry() -> int:
    try:
        receipt = main()
        if not isinstance(receipt, dict) or receipt.get("ok") is not True:
            raise RuntimeError("main returned without a verified success receipt")
        sys.stdout.write(json.dumps(receipt, sort_keys=True) + "\n")
        _flush_streams()
    except BaseException as exc:
        # Blender's --python runner can print a traceback and still return process status 0. Force a
        # controller-detectable failure after flushing both the traceback and a compact JSON reason.
        try:
            traceback.print_exc(file=sys.stderr)
            sys.stderr.write(json.dumps({
                "ok": False,
                "recipeId": RECIPE_ID,
                "errorType": type(exc).__name__,
                "error": str(exc),
            }, sort_keys=True) + "\n")
        finally:
            _flush_streams()
            os._exit(1)
    return 0


if __name__ == "__main__":
    blender_cli_entry()

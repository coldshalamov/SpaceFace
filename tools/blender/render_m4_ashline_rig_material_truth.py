#!/usr/bin/env python3
"""Render exact-source Ashline Rig material-truth evidence.

Eligible Rig evidence is derived from semantic root-local bounds in the finalized GLB. The builder
computes those bounds from exact named pre-merge component sets, preserving their names and bounds
without adding dozens of runtime draw nodes. Close frames fail closed when the imported root no
longer exposes that contract; there is no material-mesh or guessed-coordinate fallback. Overview
frames use the contract's named ``fullRig`` compound group while retaining ``authoredRig`` as
material-focus provenance; neither is reconstructed from an untracked mesh union. The receipt binds
the exact source, producer, rendered bytes, semantic bounds, camera solution, lighting, and
authored-emission state used for every frame.
"""
from __future__ import annotations

import hashlib
import importlib.util
import json
import math
import os
from pathlib import Path
import secrets
import shutil
import struct
import tempfile
from typing import Any, Callable, Iterable, Sequence
import uuid
import zlib

import bpy
from mathutils import Vector


ROOT = Path(__file__).resolve().parents[2]
FAMILY = ROOT / "assets" / "ships" / "m4_ashline_v2"
BASE_RENDERER = ROOT / "tools" / "blender" / "render_m4_ashline_material_truth.py"
TOOL_RELATIVE = "tools/blender/render_m4_ashline_rig_material_truth.py"
BASE_RENDERER_RELATIVE = "tools/blender/render_m4_ashline_material_truth.py"
SCHEMA = "spaceface.ashlineMaterialTruthArtifacts.v1"
SHIP_KEY = "rig"
SHIP_ID = "ashline_v2_rig"
LAST_RESULT: dict[str, Any] = {}
LAST_RENDER_METADATA: dict[str, dict[str, Any]] = {}
LAST_RENDER_PROVENANCE: dict[str, Any] = {}
SEMANTIC_BOUNDS_SCHEMA = "spaceface.m4-ashline-v2.rig-semantic-bounds.v1"
SEMANTIC_BOUNDS_BASIS = "rig-root-local-aabb"
SEMANTIC_IMPORT_CONVERSION = "runtime-x-y-up-z-starboard_to_blender-x-neg-z-y"
RIG_ROOT_NAME = "SF_M4_ASHLINE_V2_RIG_ROOT"
EXPECTED_BLENDER_VERSION = (5, 1, 2)
CAMERA_FIT_SAFETY = 1.00005
PROMOTION_LOCK_SCHEMA = "spaceface.materialTruthEvidencePromotionLock.v1"

ARTIFACT_NAMES = (
    "neutral_front34.png",
    "neutral_rear34.png",
    "capture_boom_close.png",
    "jaw_clevis_close.png",
    "tether_winch_close.png",
    "paired_drive_mount_close.png",
    "hard_grazing.png",
    "top_ortho.png",
    "emission_off.png",
    "game_120px.png",
    "game_45px.png",
)

LUMA_LIMITS = {
    "neutral_front34.png": {
        "minimumMean": 16.0, "maximumBelowEight": 0.78,
        "maximumAbove247Fraction": 0.06, "minimumP5P95Spread": 24.0,
    },
    "neutral_rear34.png": {
        "minimumMean": 16.0, "maximumBelowEight": 0.78,
        "maximumAbove247Fraction": 0.06, "minimumP5P95Spread": 24.0,
    },
    "capture_boom_close.png": {
        "minimumMean": 15.0, "maximumBelowEight": 0.80,
        "maximumAbove247Fraction": 0.08, "minimumP5P95Spread": 20.0,
    },
    "jaw_clevis_close.png": {
        "minimumMean": 15.0, "maximumBelowEight": 0.80,
        "maximumAbove247Fraction": 0.08, "minimumP5P95Spread": 20.0,
    },
    "tether_winch_close.png": {
        "minimumMean": 15.0, "maximumBelowEight": 0.80,
        "maximumAbove247Fraction": 0.08, "minimumP5P95Spread": 20.0,
    },
    "paired_drive_mount_close.png": {
        "minimumMean": 15.0, "maximumBelowEight": 0.80,
        "maximumAbove247Fraction": 0.08, "minimumP5P95Spread": 20.0,
    },
    "hard_grazing.png": {
        "minimumMean": 12.0, "maximumBelowEight": 0.86,
        "maximumAbove247Fraction": 0.10, "minimumP5P95Spread": 24.0,
    },
    "top_ortho.png": {
        "minimumMean": 15.0, "maximumBelowEight": 0.80,
        "maximumAbove247Fraction": 0.06, "minimumP5P95Spread": 20.0,
    },
    "emission_off.png": {
        "minimumMean": 14.0, "maximumBelowEight": 0.82,
        "maximumAbove247Fraction": 0.08, "minimumP5P95Spread": 20.0,
    },
    "game_120px.png": {
        "minimumMean": 16.0, "maximumBelowEight": 0.78,
        "maximumAbove247Fraction": 0.08, "minimumP5P95Spread": 20.0,
    },
    "game_45px.png": {
        "minimumMean": 16.0, "maximumBelowEight": 0.78,
        "maximumAbove247Fraction": 0.08, "minimumP5P95Spread": 16.0,
    },
}
LUMA_UPPER_CLIP_THRESHOLD = 247.0
EMISSION_DELTA_LIMITS = {
    "pixelChannelThreshold": 2,
    "minimumChangedPixels": 16,
    "minimumAggregateRgbDelta": 512,
    "minimumPeakChannelDelta": 4,
    "maximumChangedPixelFraction": 0.02,
    "maximumBoundingBoxFraction": 0.25,
}

# Prefix counts are deliberately exact-source requirements, not prose labels. Bounds for close
# views are computed only from the union of nodes matched by these rules.
SEMANTIC_GROUP_REQUIREMENTS: dict[str, tuple[tuple[str, int], ...]] = {
    "capture_boom": (
        ("Hook_BoomRootDoubler_", 2),
        ("Hook_BoomRootGusset_", 2),
        ("Hook_BoomChord_", 4),
        ("Hook_BoomWeb_", 6),
        ("Hook_BoomWebFrame_", 2),
        ("Hook_ClevisEar_", 4),
        ("Hook_ClevisPin_", 2),
        ("Hook_ClevisCollar_", 2),
    ),
    "jaw_clevis": (
        ("Hook_ClevisEar_", 4),
        ("Hook_ClevisPin_", 2),
        ("Hook_ClevisCollar_", 2),
        ("Hook_ClevisRetainer_", 2),
        ("Hook_JawArm_", 2),
        ("Hook_JawForging_", 2),
        ("Hook_JawKeeper_", 2),
        ("Hook_JawPad_", 6),
        ("Hook_JawPin_", 4),
        ("Hook_JawActuatorEnd_", 2),
        ("Hook_JawHydraulicCase_", 2),
        ("Hook_JawHydraulicRod_", 2),
        ("Hook_JawHydraulicClevis_", 2),
        ("Hook_JawHydraulicHose_", 2),
    ),
    "tether_winch": (
        ("Hook_TetherDrum_Grooved", 1),
        ("Hook_TetherDrum_KeyedShaft", 1),
        ("Hook_TetherDrum_CableWrap", 1),
        ("Hook_TetherDrum_Bearing_", 2),
        ("Hook_TetherBearingCap_", 2),
        ("Hook_TetherDrum_BrakeBand", 1),
        ("Hook_TetherBrake_ServiceCover", 1),
        ("Hook_TetherDrum_ClutchLever", 1),
        ("Hook_TetherGuard_", 2),
        ("Hook_TetherFairlead_Sheave", 1),
        ("Hook_TetherFairlead_Guide", 1),
        ("Hook_TetherFairlead_DrumRun", 1),
        ("Hook_TetherFairlead_BraidedRun", 1),
        ("Hook_TetherFairlead_Terminal_", 2),
    ),
    "paired_drive": (
        ("Hook_DrivePressureCase_", 2),
        ("Hook_DriveHotSection_", 2),
        ("Hook_DriveBell_", 2),
        ("Hook_DriveRefractoryThroat_", 2),
        ("Hook_DriveInternalCue_", 2),
        ("Hook_DriveClamp_", 4),
        ("Hook_DriveTrussNodeLower_", 8),
        ("Hook_DriveTrussNodeUpper_", 8),
        ("Hook_DriveTrussWeb_", 4),
        ("Hook_DriveThrustSaddle_", 2),
        ("Hook_DriveSaddleWeb_", 2),
        ("Hook_DriveRootDoubler_", 2),
        ("Hook_DriveEngineGusset_", 2),
        ("Hook_DriveRootGusset_", 2),
    ),
}

SEMANTIC_CONTRACT_GROUPS = {
    "authored_rig": "authoredRig",
    "full_rig": "fullRig",
    "capture_boom": "capture",
    "jaw_clevis": "jaw",
    "tether_winch": "winch",
    "paired_drive": "drives",
}

VIEW_SPECS: tuple[dict[str, Any], ...] = (
    {
        "name": "neutral_front34.png",
        "group": "full_rig",
        "direction": (0.72, -0.59, 0.38),
        "lens": 62.0,
        "size": (1280, 720),
        "margin": 1.11,
        "lighting": "neutral",
    },
    {
        "name": "neutral_rear34.png",
        "group": "full_rig",
        "direction": (-0.74, -0.58, 0.34),
        "lens": 62.0,
        "size": (1280, 720),
        "margin": 1.11,
        "lighting": "neutral",
    },
    {
        "name": "capture_boom_close.png",
        "group": "capture_boom",
        # Service-side elevation keeps the long root-to-collar load path broadside enough to show
        # the A-frame voids rather than collapsing its chords into a single bar.
        "direction": (0.32, 0.88, 0.35),
        "lens": 70.0,
        "size": (1280, 720),
        "margin": 1.13,
        "lighting": "neutral",
    },
    {
        "name": "jaw_clevis_close.png",
        "group": "jaw_clevis",
        "direction": (0.45, 0.87, -0.20),
        "lens": 74.0,
        "size": (1280, 720),
        "margin": 1.14,
        "lighting": "neutral",
    },
    {
        "name": "tether_winch_close.png",
        "group": "tether_winch",
        # The recovery machine is on the imported +Y service side. Stay on that side so the
        # material-merged donor hull cannot occlude the drum-to-fairlead route.
        "direction": (0.20, 0.95, 0.24),
        "lens": 72.0,
        "size": (1280, 720),
        "margin": 1.13,
        "lighting": "neutral",
    },
    {
        "name": "paired_drive_mount_close.png",
        "group": "paired_drive",
        # Rear-biased three-quarter view preserves port/starboard bell separation while retaining
        # the pressure-case-to-saddle-to-root load path.
        "direction": (-0.76, -0.50, 0.41),
        "lens": 78.0,
        "size": (1280, 720),
        "margin": 1.13,
        "lighting": "neutral",
    },
    {
        "name": "hard_grazing.png",
        "group": "paired_drive",
        "direction": (-0.74, -0.66, 0.10),
        "lens": 84.0,
        "size": (1280, 720),
        "margin": 1.13,
        "lighting": "hard-grazing",
    },
    {
        "name": "top_ortho.png",
        "group": "full_rig",
        "direction": (0.0, 0.0, 1.0),
        "lens": 50.0,
        "size": (1280, 720),
        "margin": 1.11,
        "lighting": "neutral",
        "orthographic": True,
    },
    {
        "name": "emission_off.png",
        "group": "paired_drive",
        "direction": (-0.76, -0.50, 0.41),
        "lens": 78.0,
        "size": (1280, 720),
        "margin": 1.13,
        "lighting": "neutral",
        "emission": "off",
    },
    {
        "name": "game_120px.png",
        "group": "full_rig",
        "direction": (0.72, -0.59, 0.38),
        "lens": 62.0,
        "size": (120, 120),
        "margin": 1.09,
        "lighting": "neutral",
    },
    {
        "name": "game_45px.png",
        "group": "full_rig",
        "direction": (0.72, -0.59, 0.38),
        "lens": 62.0,
        "size": (45, 45),
        "margin": 1.09,
        "lighting": "neutral",
    },
)


def load_base_renderer():
    spec = importlib.util.spec_from_file_location("spaceface_ashline_dart_renderer", BASE_RENDERER)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Cannot load {BASE_RENDERER}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


base = load_base_renderer()


def sha256(path: Path) -> str:
    value = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1 << 20), b""):
            value.update(chunk)
    return value.hexdigest().upper()


def canonical_json_sha256(value: Any) -> str:
    def normalized(item: Any) -> Any:
        if isinstance(item, float) and item.is_integer():
            return int(item)
        if isinstance(item, list):
            return [normalized(child) for child in item]
        if isinstance(item, tuple):
            return [normalized(child) for child in item]
        if isinstance(item, dict):
            return {str(key): normalized(child) for key, child in item.items()}
        return item

    return hashlib.sha256(
        json.dumps(normalized(value), sort_keys=True, separators=(",", ":")).encode("utf-8"),
    ).hexdigest().upper()


def relative(path: Path) -> str:
    return str(path.relative_to(ROOT)).replace("\\", "/")


def png_dimensions(path: Path) -> tuple[int, int]:
    """Read actual PNG dimensions so the receipt binds rendered bytes, not view presets."""
    header = path.read_bytes()[:24]
    if header[:8] != b"\x89PNG\r\n\x1a\n" or header[12:16] != b"IHDR":
        raise ValueError(f"Expected PNG artifact: {path}")
    return struct.unpack(">II", header[16:24])


def paeth_predictor(left: int, above: int, upper_left: int) -> int:
    estimate = left + above - upper_left
    left_distance = abs(estimate - left)
    above_distance = abs(estimate - above)
    upper_left_distance = abs(estimate - upper_left)
    if left_distance <= above_distance and left_distance <= upper_left_distance:
        return left
    if above_distance <= upper_left_distance:
        return above
    return upper_left


def decode_png_rgb(path: Path) -> tuple[int, int, bytes]:
    """CRC-check and decode Blender's non-interlaced 8-bit RGB(A) evidence PNG."""
    data = path.read_bytes()
    if data[:8] != b"\x89PNG\r\n\x1a\n":
        raise ValueError(f"Expected PNG artifact: {path}")
    offset = 8
    ihdr: bytes | None = None
    compressed = bytearray()
    saw_iend = False
    chunk_index = 0
    while offset + 12 <= len(data):
        length = struct.unpack(">I", data[offset:offset + 4])[0]
        chunk_type = data[offset + 4:offset + 8]
        chunk_start = offset + 8
        chunk_end = chunk_start + length
        if chunk_end + 4 > len(data):
            raise ValueError(f"Truncated PNG chunk in {path}")
        chunk = data[chunk_start:chunk_end]
        stored_crc = struct.unpack(">I", data[chunk_end:chunk_end + 4])[0]
        actual_crc = zlib.crc32(chunk, zlib.crc32(chunk_type)) & 0xFFFFFFFF
        if stored_crc != actual_crc:
            raise ValueError(
                f"PNG CRC mismatch for {chunk_type!r} in {path}: "
                f"{stored_crc:08X} != {actual_crc:08X}",
            )
        if chunk_index == 0 and chunk_type != b"IHDR":
            raise ValueError(f"PNG IHDR is not first in {path}")
        if chunk_type == b"IHDR":
            if ihdr is not None or chunk_index != 0:
                raise ValueError(f"PNG contains duplicate or misplaced IHDR: {path}")
            ihdr = chunk
        elif chunk_type == b"IDAT":
            compressed.extend(chunk)
        elif chunk_type == b"IEND":
            if length != 0:
                raise ValueError(f"PNG IEND must be empty in {path}")
            saw_iend = True
            offset = chunk_end + 4
            if offset != len(data):
                raise ValueError(f"PNG contains trailing bytes after IEND: {path}")
            break
        offset = chunk_end + 4
        chunk_index += 1
    if ihdr is None or len(ihdr) != 13 or not compressed or not saw_iend:
        raise ValueError(f"Incomplete PNG structure: {path}")
    width, height, bit_depth, color_type, compression, filtering, interlace = struct.unpack(
        ">IIBBBBB",
        ihdr,
    )
    if (
        bit_depth != 8
        or color_type not in (2, 6)
        or compression != 0
        or filtering != 0
        or interlace != 0
    ):
        raise ValueError(
            f"Unsupported evidence PNG encoding in {path}: "
            f"depth={bit_depth} color={color_type} interlace={interlace}",
        )
    channels = 3 if color_type == 2 else 4
    stride = width * channels
    decompressed = zlib.decompress(bytes(compressed))
    expected_bytes = height * (stride + 1)
    if len(decompressed) != expected_bytes:
        raise ValueError(
            f"Unexpected PNG scanline payload in {path}: "
            f"{len(decompressed)} != {expected_bytes}",
        )

    previous = bytearray(stride)
    rgb = bytearray(width * height * 3)
    rgb_offset = 0
    source_offset = 0
    for _row in range(height):
        filter_type = decompressed[source_offset]
        source_offset += 1
        scanline = decompressed[source_offset:source_offset + stride]
        source_offset += stride
        reconstructed = bytearray(stride)
        for index, encoded in enumerate(scanline):
            left = reconstructed[index - channels] if index >= channels else 0
            above = previous[index]
            upper_left = previous[index - channels] if index >= channels else 0
            if filter_type == 0:
                value = encoded
            elif filter_type == 1:
                value = encoded + left
            elif filter_type == 2:
                value = encoded + above
            elif filter_type == 3:
                value = encoded + ((left + above) // 2)
            elif filter_type == 4:
                value = encoded + paeth_predictor(left, above, upper_left)
            else:
                raise ValueError(f"Unsupported PNG filter {filter_type} in {path}")
            reconstructed[index] = value & 0xFF
        for index in range(0, stride, channels):
            rgb[rgb_offset:rgb_offset + 3] = reconstructed[index:index + 3]
            rgb_offset += 3
        previous = reconstructed
    return width, height, bytes(rgb)


def png_luma_metrics(path: Path) -> dict[str, float]:
    """Measure dark floor, upper clipping, and histogram contrast after strict decoding."""
    width, height, rgb = decode_png_rgb(path)
    total_luma = 0.0
    below_eight = 0
    above_247 = 0
    histogram = [0] * 256
    for index in range(0, len(rgb), 3):
        luma = 0.2126 * rgb[index] + 0.7152 * rgb[index + 1] + 0.0722 * rgb[index + 2]
        total_luma += luma
        if luma < 8.0:
            below_eight += 1
        if luma >= LUMA_UPPER_CLIP_THRESHOLD:
            above_247 += 1
        histogram[max(0, min(255, int(math.floor(luma))))] += 1
    pixel_count = width * height

    def percentile(fraction: float) -> float:
        target = max(1, math.ceil(pixel_count * fraction))
        cumulative = 0
        for value, count in enumerate(histogram):
            cumulative += count
            if cumulative >= target:
                return float(value)
        raise AssertionError("Luma histogram does not contain every decoded pixel")

    p5 = percentile(0.05)
    p95 = percentile(0.95)
    return {
        "mean": total_luma / pixel_count,
        "belowEightFraction": below_eight / pixel_count,
        "above247Fraction": above_247 / pixel_count,
        "p5": p5,
        "p95": p95,
        "p5P95Spread": p95 - p5,
    }


def assert_luma_eligible(
    label: str,
    metrics: dict[str, float],
    limits: dict[str, float],
) -> None:
    failures = []
    if metrics["mean"] < limits["minimumMean"]:
        failures.append("mean")
    if metrics["belowEightFraction"] > limits["maximumBelowEight"]:
        failures.append("belowEightFraction")
    if metrics["above247Fraction"] > limits["maximumAbove247Fraction"]:
        failures.append("above247Fraction")
    if metrics["p5P95Spread"] < limits["minimumP5P95Spread"]:
        failures.append("p5P95Spread")
    if failures:
        raise RuntimeError(
            f"{label} is content-ineligible: failed {failures}, "
            f"metrics={metrics}, limits={limits}",
        )


def png_emission_delta(first: Path, second: Path) -> dict[str, Any]:
    first_width, first_height, first_rgb = decode_png_rgb(first)
    second_width, second_height, second_rgb = decode_png_rgb(second)
    if (first_width, first_height) != (second_width, second_height):
        raise RuntimeError("Matched emission frames have different dimensions")
    threshold = EMISSION_DELTA_LIMITS["pixelChannelThreshold"]
    changed_pixels = 0
    aggregate_delta = 0
    meaningful_delta = 0
    peak_delta = 0
    min_x, min_y = first_width, first_height
    max_x = max_y = -1
    for pixel_index, offset in enumerate(range(0, len(first_rgb), 3)):
        deltas = [
            abs(first_rgb[offset + channel] - second_rgb[offset + channel])
            for channel in range(3)
        ]
        aggregate_delta += sum(deltas)
        pixel_peak = max(deltas)
        peak_delta = max(peak_delta, pixel_peak)
        if pixel_peak >= threshold:
            changed_pixels += 1
            meaningful_delta += sum(deltas)
            x = pixel_index % first_width
            y = pixel_index // first_width
            min_x, min_y = min(min_x, x), min(min_y, y)
            max_x, max_y = max(max_x, x), max(max_y, y)
    pixel_count = first_width * first_height
    bounding_area = (
        (max_x - min_x + 1) * (max_y - min_y + 1)
        if changed_pixels
        else 0
    )
    return {
        "changedPixels": changed_pixels,
        "aggregateRgbDelta": aggregate_delta,
        "meaningfulRgbDelta": meaningful_delta,
        "peakChannelDelta": peak_delta,
        "changedPixelFraction": changed_pixels / pixel_count,
        "boundingBoxFraction": bounding_area / pixel_count,
        "boundingBox": (
            {"min": [min_x, min_y], "max": [max_x, max_y]}
            if changed_pixels
            else None
        ),
    }


def assert_emission_delta(metrics: dict[str, Any]) -> None:
    limits = EMISSION_DELTA_LIMITS
    failures = []
    if metrics["changedPixels"] < limits["minimumChangedPixels"]:
        failures.append("changedPixels")
    if metrics["meaningfulRgbDelta"] < limits["minimumAggregateRgbDelta"]:
        failures.append("meaningfulRgbDelta")
    if metrics["peakChannelDelta"] < limits["minimumPeakChannelDelta"]:
        failures.append("peakChannelDelta")
    if metrics["changedPixelFraction"] > limits["maximumChangedPixelFraction"]:
        failures.append("changedPixelFraction")
    if metrics["boundingBoxFraction"] > limits["maximumBoundingBoxFraction"]:
        failures.append("boundingBoxFraction")
    if failures:
        raise RuntimeError(
            f"Authored emission delta is not meaningful and localized: failed {failures}, "
            f"metrics={metrics}, limits={limits}",
        )


def rounded(values: Iterable[float]) -> list[float]:
    return [round(float(value), 6) for value in values]


def id_property_value(owner: Any, key: str) -> Any:
    try:
        return owner.get(key)
    except (AttributeError, TypeError):
        return None


def plain_property(value: Any) -> Any:
    """Convert imported glTF ID properties into ordinary Python containers."""
    if value is None or isinstance(value, (str, int, float, bool)):
        return value
    if hasattr(value, "keys"):
        return {str(key): plain_property(value[key]) for key in value.keys()}
    if hasattr(value, "to_list"):
        return [plain_property(item) for item in value.to_list()]
    if isinstance(value, (list, tuple)):
        return [plain_property(item) for item in value]
    return value


def is_collision_helper(obj: bpy.types.Object) -> bool:
    name = obj.name.upper()
    if name.startswith("COLLISION_"):
        return True
    if bool(id_property_value(obj, "sf_collision")):
        return True
    metadata = id_property_value(obj, "spaceface")
    try:
        return bool(metadata.get("collision") or metadata.get("nonRender"))
    except (AttributeError, TypeError):
        return False


def is_lod0_mesh(obj: bpy.types.Object) -> bool:
    if obj.type != "MESH" or is_collision_helper(obj):
        return False
    name = obj.name
    if name.startswith("LOD0_"):
        return True
    lod = id_property_value(obj, "spaceface.lod")
    if str(lod).lower() == "lod0":
        return True
    metadata = id_property_value(obj, "spaceface")
    try:
        if str(metadata.get("lod", "")).lower() == "lod0":
            return True
    except (AttributeError, TypeError):
        pass
    return False


def import_visible_lod0(source: Path) -> list[bpy.types.Object]:
    bpy.ops.import_scene.gltf(filepath=str(source))
    visible: list[bpy.types.Object] = []
    for obj in bpy.data.objects:
        if obj.type != "MESH":
            continue
        enabled = is_lod0_mesh(obj)
        obj.hide_render = not enabled
        obj.hide_viewport = not enabled
        if enabled:
            visible.append(obj)
    if not visible:
        raise RuntimeError(f"{source} imported no visible LOD0 render meshes")
    return sorted(visible, key=lambda obj: obj.name)


def semantic_component_audit(
    group: str,
) -> tuple[tuple[str, int], ...]:
    if group in {"authored_rig", "full_rig"}:
        combined: list[tuple[str, int]] = []
        seen: set[str] = set()
        for source_group in ("capture_boom", "jaw_clevis", "tether_winch", "paired_drive"):
            for prefix, minimum in SEMANTIC_GROUP_REQUIREMENTS[source_group]:
                if prefix not in seen:
                    combined.append((prefix, minimum))
                    seen.add(prefix)
        return tuple(combined)
    rules = SEMANTIC_GROUP_REQUIREMENTS.get(group)
    if rules is None:
        raise KeyError(f"Unknown Rig semantic group: {group}")
    return rules


def audit_component_names(
    group: str,
    components: Sequence[str],
) -> list[dict[str, Any]]:
    if not components or any(not isinstance(name, str) for name in components):
        raise RuntimeError(f"Rig semantic group {group} has no valid named components")
    if list(components) != sorted(set(components)):
        raise RuntimeError(f"Rig semantic group {group} component names must be sorted and unique")
    if any(not name.startswith("Hook_") for name in components):
        raise RuntimeError(f"Rig semantic group {group} contains a non-Hook component")
    audit: list[dict[str, Any]] = []
    for prefix, minimum in semantic_component_audit(group):
        matches = [name for name in components if name.startswith(prefix)]
        if len(matches) < minimum:
            raise RuntimeError(
                f"Finalized Rig GLB cannot frame {group}: semantic prefix {prefix!r} "
                f"matched {len(matches)}, expected at least {minimum}",
            )
        audit.append({
            "namePrefix": prefix,
            "minimumCount": minimum,
            "matchedCount": len(matches),
        })
    return audit


def xyz_vector(value: Any, label: str) -> Vector:
    if not isinstance(value, dict) or any(axis not in value for axis in ("x", "y", "z")):
        raise RuntimeError(f"{label} must be an x/y/z object")
    numbers = [value[axis] for axis in ("x", "y", "z")]
    if any(isinstance(number, bool) or not isinstance(number, (int, float)) for number in numbers):
        raise RuntimeError(f"{label} must contain numeric x/y/z values")
    if any(not math.isfinite(float(number)) for number in numbers):
        raise RuntimeError(f"{label} must contain finite x/y/z values")
    return Vector(tuple(float(number) for number in numbers))


def validate_local_group(group_name: str, value: Any) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise RuntimeError(f"Rig semantic bounds group {group_name} must be an object")
    components = value.get("components")
    if (
        not isinstance(components, list)
        or any(not isinstance(name, str) for name in components)
    ):
        raise RuntimeError(f"Rig semantic bounds group {group_name} has no component list")
    normalized_components = list(components)
    if normalized_components != sorted(set(normalized_components)):
        raise RuntimeError(
            f"Rig semantic bounds group {group_name} components must be sorted and unique",
        )
    vectors = {
        field: xyz_vector(value.get(field), f"semanticBounds.groups.{group_name}.{field}")
        for field in ("min", "max", "center", "size")
    }
    size = vectors["max"] - vectors["min"]
    center = (vectors["min"] + vectors["max"]) * 0.5
    tolerance = 1e-5
    if min(size) <= 1e-6:
        raise RuntimeError(f"Rig semantic bounds group {group_name} is degenerate")
    if (vectors["size"] - size).length > tolerance:
        raise RuntimeError(f"Rig semantic bounds group {group_name} size is inconsistent")
    if (vectors["center"] - center).length > tolerance:
        raise RuntimeError(f"Rig semantic bounds group {group_name} center is inconsistent")
    normalized = {
        "components": normalized_components,
        **vectors,
    }
    if group_name == "fullRig":
        raw_nodes = value.get("visualNodes")
        if not isinstance(raw_nodes, list) or not raw_nodes:
            raise RuntimeError("Rig fullRig group has no visualNodes")
        visual_nodes: list[dict[str, Any]] = []
        for entry in raw_nodes:
            if not isinstance(entry, dict) or not isinstance(entry.get("name"), str):
                raise RuntimeError("Rig fullRig visualNodes entry has no valid name")
            materials = entry.get("materials")
            if (
                not isinstance(materials, list)
                or not materials
                or any(not isinstance(name, str) for name in materials)
                or materials != sorted(set(materials))
            ):
                raise RuntimeError(
                    f"Rig fullRig visual node {entry['name']} has invalid materials",
                )
            visual_nodes.append({
                "name": entry["name"],
                "materials": list(materials),
            })
        if visual_nodes != sorted(visual_nodes, key=lambda entry: entry["name"]):
            raise RuntimeError("Rig fullRig visualNodes must be sorted")
        if len({entry["name"] for entry in visual_nodes}) != len(visual_nodes):
            raise RuntimeError("Rig fullRig visualNodes must be unique")
        normalized["visualNodes"] = visual_nodes
    return normalized


def imported_semantic_contract() -> tuple[bpy.types.Object, dict[str, Any]]:
    root = bpy.data.objects.get(RIG_ROOT_NAME)
    if root is None:
        raise RuntimeError(f"Finalized Rig GLB has no exact root {RIG_ROOT_NAME}")
    spaceface = plain_property(id_property_value(root, "spaceface"))
    try:
        contract = spaceface["materialTruth"]["semanticBounds"]
    except (KeyError, TypeError):
        raise RuntimeError(
            "Finalized Rig GLB has no spaceface.materialTruth.semanticBounds contract",
        ) from None
    if not isinstance(contract, dict):
        raise RuntimeError("Rig semanticBounds contract must be an object")
    if contract.get("schema") != SEMANTIC_BOUNDS_SCHEMA:
        raise RuntimeError(f"Unsupported Rig semanticBounds schema: {contract.get('schema')!r}")
    if contract.get("basis") != SEMANTIC_BOUNDS_BASIS:
        raise RuntimeError(f"Unsupported Rig semanticBounds basis: {contract.get('basis')!r}")
    raw_groups = contract.get("groups")
    required_group_names = {
        "capture", "jaw", "winch", "drives", "authoredRig", "fullRig",
    }
    if not isinstance(raw_groups, dict) or set(raw_groups) != required_group_names:
        raise RuntimeError(
            f"Rig semanticBounds groups must be exactly {sorted(required_group_names)}",
        )
    groups = {
        name: validate_local_group(name, raw_groups[name])
        for name in sorted(required_group_names)
    }

    close_names = ("capture", "jaw", "winch", "drives")
    expected_components = sorted({
        component
        for name in close_names
        for component in groups[name]["components"]
    })
    if groups["authoredRig"]["components"] != expected_components:
        raise RuntimeError("Rig authoredRig components must equal the semantic-group union")
    union_min = Vector(tuple(
        min(groups[name]["min"][axis] for name in close_names)
        for axis in range(3)
    ))
    union_max = Vector(tuple(
        max(groups[name]["max"][axis] for name in close_names)
        for axis in range(3)
    ))
    if (groups["authoredRig"]["min"] - union_min).length > 1e-5:
        raise RuntimeError("Rig authoredRig minimum must equal the semantic-group union")
    if (groups["authoredRig"]["max"] - union_max).length > 1e-5:
        raise RuntimeError("Rig authoredRig maximum must equal the semantic-group union")
    if groups["fullRig"]["components"] != groups["authoredRig"]["components"]:
        raise RuntimeError("Rig fullRig components must retain authoredRig provenance")
    for axis in range(3):
        if (
            groups["fullRig"]["min"][axis] > groups["authoredRig"]["min"][axis] + 1e-5
            or groups["fullRig"]["max"][axis] < groups["authoredRig"]["max"][axis] - 1e-5
        ):
            raise RuntimeError("Rig fullRig bounds must contain authoredRig")
    return root, {
        "schema": contract["schema"],
        "basis": contract["basis"],
        "groups": groups,
    }


def bounds_from_points(points: Sequence[Vector]) -> dict[str, Any]:
    if not points:
        raise RuntimeError("Cannot derive evidence bounds from an empty point set")
    lo = Vector((
        min(point.x for point in points),
        min(point.y for point in points),
        min(point.z for point in points),
    ))
    hi = Vector((
        max(point.x for point in points),
        max(point.y for point in points),
        max(point.z for point in points),
    ))
    size = hi - lo
    if min(size) <= 1e-6:
        raise RuntimeError(f"Degenerate evidence bounds: min={tuple(lo)} max={tuple(hi)}")
    return {
        "min": lo,
        "max": hi,
        "center": (lo + hi) * 0.5,
        "size": size,
        "radius": max(size.length * 0.5, 0.25),
        "points": list(points),
    }


def semantic_world_bounds(
    root: bpy.types.Object,
    local_group: dict[str, Any],
) -> dict[str, Any]:
    lo, hi = local_group["min"], local_group["max"]
    points = [
        # The root extras remain in exported/runtime Y-up coordinates. Blender's glTF importer
        # converts mesh coordinates back to Z-up but does not rewrite numeric extras, so apply the
        # inverse of the builder's runtime_point_from_blender mapping before root.matrix_world.
        root.matrix_world @ Vector((x, -z, y))
        for x in (lo.x, hi.x)
        for y in (lo.y, hi.y)
        for z in (lo.z, hi.z)
    ]
    return bounds_from_points(points)


def local_group_receipt(local_group: dict[str, Any]) -> dict[str, Any]:
    receipt = {
        "components": list(local_group["components"]),
        "min": dict(zip(("x", "y", "z"), rounded(local_group["min"]))),
        "max": dict(zip(("x", "y", "z"), rounded(local_group["max"]))),
        "center": dict(zip(("x", "y", "z"), rounded(local_group["center"]))),
        "size": dict(zip(("x", "y", "z"), rounded(local_group["size"]))),
    }
    if "visualNodes" in local_group:
        receipt["visualNodes"] = [
            {"name": entry["name"], "materials": list(entry["materials"])}
            for entry in local_group["visualNodes"]
        ]
    return receipt


def receipt_bounds(bounds: dict[str, Any]) -> dict[str, list[float]]:
    return {
        "min": rounded(bounds["min"]),
        "max": rounded(bounds["max"]),
        "center": rounded(bounds["center"]),
        "size": rounded(bounds["size"]),
    }


def fit_camera_to_bounds(
    camera: bpy.types.Object,
    bounds: dict[str, Any],
    *,
    direction_values: Sequence[float],
    lens: float,
    size: tuple[int, int],
    margin: float,
    orthographic: bool,
) -> tuple[dict[str, Any], dict[str, Vector]]:
    target: Vector = bounds["center"].copy()
    direction = Vector(direction_values)
    if direction.length <= 1e-6:
        raise ValueError("Evidence camera direction must be non-zero")
    direction.normalize()
    rotation = (target - (target + direction)).to_track_quat("-Z", "Y")
    right = rotation @ Vector((1.0, 0.0, 0.0))
    up = rotation @ Vector((0.0, 1.0, 0.0))
    deltas = [point - target for point in bounds["points"]]
    aspect = float(size[0]) / float(size[1])
    fit_margin = margin * CAMERA_FIT_SAFETY

    if orthographic:
        half_width = max(abs(delta.dot(right)) for delta in deltas)
        half_height = max(abs(delta.dot(up)) for delta in deltas)
        ortho_scale = max(
            2.0 * half_height * fit_margin,
            2.0 * half_width * fit_margin / aspect,
        )
        distance = max(bounds["radius"] * 3.0, 2.0)
        location = target + direction * distance
        camera_mode: dict[str, Any] = {
            "projection": "orthographic",
            "orthoScale": round(ortho_scale, 6),
        }
    else:
        camera.data.sensor_fit = "HORIZONTAL"
        tan_horizontal = camera.data.sensor_width / (2.0 * lens)
        tan_vertical = tan_horizontal / aspect
        distance = max(
            max(
                fit_margin * abs(delta.dot(right)) / tan_horizontal + delta.dot(direction),
                fit_margin * abs(delta.dot(up)) / tan_vertical + delta.dot(direction),
            )
            for delta in deltas
        )
        nearest_safe = max(delta.dot(direction) for delta in deltas) + 0.1
        distance = max(distance, nearest_safe, bounds["radius"] * 1.05)
        location = target + direction * distance
        camera_mode = {
            "projection": "perspective",
            "lensMm": round(lens, 6),
        }

    metadata = {
        **camera_mode,
        "location": rounded(location),
        "target": rounded(target),
        "direction": rounded(direction),
        "right": rounded(right),
        "up": rounded(up),
        "sensorWidthMm": round(float(camera.data.sensor_width), 6),
        "aspect": round(aspect, 9),
        "margin": round(margin, 6),
        "fitSafetyFactor": CAMERA_FIT_SAFETY,
        "projectedCornerLimit": round(1.0 / margin, 9),
        "resolution": [int(size[0]), int(size[1])],
    }
    return metadata, {"direction": direction, "right": right, "up": up}


def assert_camera_contains_bounds(
    camera_metadata: dict[str, Any],
    bounds: dict[str, Any],
) -> list[float]:
    """Project all eight semantic AABB corners and fail before rendering on any crop."""
    location = Vector(camera_metadata["location"])
    direction = Vector(camera_metadata["direction"])
    right = Vector(camera_metadata["right"])
    up = Vector(camera_metadata["up"])
    forward = -direction
    maximum_x = maximum_y = 0.0
    for point in bounds["points"]:
        offset = point - location
        if camera_metadata["projection"] == "perspective":
            depth = offset.dot(forward)
            if depth <= 0.0:
                raise RuntimeError("Semantic evidence corner lies behind its fitted camera")
            tan_horizontal = (
                camera_metadata["sensorWidthMm"] / (2.0 * camera_metadata["lensMm"])
            )
            tan_vertical = tan_horizontal / camera_metadata["aspect"]
            projected_x = abs(offset.dot(right)) / (depth * tan_horizontal)
            projected_y = abs(offset.dot(up)) / (depth * tan_vertical)
        else:
            projected_x = (
                2.0 * abs(offset.dot(right))
                / (camera_metadata["orthoScale"] * camera_metadata["aspect"])
            )
            projected_y = (
                2.0 * abs(offset.dot(up))
                / camera_metadata["orthoScale"]
            )
        maximum_x = max(maximum_x, projected_x)
        maximum_y = max(maximum_y, projected_y)
    limit = float(camera_metadata["projectedCornerLimit"])
    if maximum_x > limit or maximum_y > limit:
        raise RuntimeError(
            "Fitted evidence camera crops semantic bounds: "
            f"maximum=({maximum_x:.9f}, {maximum_y:.9f}) limit={limit:.9f}",
        )
    return [round(maximum_x, 9), round(maximum_y, 9)]


def place_light(
    name: str,
    location: Vector,
    target: Vector,
    *,
    energy: float,
    size: float,
    color: tuple[float, float, float],
) -> None:
    light = bpy.data.objects.get(name)
    if light is None or light.type != "LIGHT":
        raise RuntimeError(f"Missing evidence light {name}")
    light.location = location
    light.data.energy = energy
    light.data.color = color
    light.data.shape = "DISK"
    light.data.size = size
    base.point_at(light, tuple(target))


def configure_view_lighting(
    bounds: dict[str, Any],
    basis: dict[str, Vector],
    profile: str,
) -> dict[str, Any]:
    target: Vector = bounds["center"]
    radius = bounds["radius"]
    direction, right, up = basis["direction"], basis["right"], basis["up"]
    neutral_energy = max(1900.0, min(7600.0, 52.0 * radius * radius))

    if profile == "hard-grazing":
        place_light(
            "ASHLINE_KEY",
            target + right * (2.45 * radius) + up * (0.28 * radius) - direction * (0.15 * radius),
            target,
            energy=neutral_energy * 1.22,
            size=max(0.42, radius * 0.16),
            color=(1.0, 0.83, 0.68),
        )
        place_light(
            "ASHLINE_FILL",
            target - right * (1.15 * radius) + direction * (1.10 * radius) + up * (0.55 * radius),
            target,
            energy=neutral_energy * 0.34,
            size=max(1.4, radius * 0.70),
            color=(0.62, 0.76, 1.0),
        )
        place_light(
            "ASHLINE_RIM",
            target - direction * (1.70 * radius) + up * (0.85 * radius),
            target,
            energy=neutral_energy * 0.72,
            size=max(0.7, radius * 0.28),
            color=(1.0, 0.33, 0.16),
        )
        place_light(
            "ASHLINE_DETAIL",
            target + direction * (0.70 * radius) - right * (0.40 * radius) + up * (1.35 * radius),
            target,
            energy=neutral_energy * 0.30,
            size=max(0.65, radius * 0.30),
            color=(0.88, 0.93, 1.0),
        )
    elif profile == "neutral":
        place_light(
            "ASHLINE_KEY",
            target + direction * (1.25 * radius) - right * (1.10 * radius) + up * (1.45 * radius),
            target,
            energy=neutral_energy,
            size=max(1.8, radius * 0.58),
            color=(1.0, 0.94, 0.86),
        )
        place_light(
            "ASHLINE_FILL",
            target + direction * (0.55 * radius) + right * (1.45 * radius) + up * (0.55 * radius),
            target,
            energy=neutral_energy * 0.76,
            size=max(2.1, radius * 0.74),
            color=(0.70, 0.82, 1.0),
        )
        place_light(
            "ASHLINE_RIM",
            target - direction * (1.55 * radius) - right * (0.45 * radius) + up * (0.80 * radius),
            target,
            energy=neutral_energy * 0.52,
            size=max(1.4, radius * 0.48),
            color=(1.0, 0.43, 0.24),
        )
        place_light(
            "ASHLINE_DETAIL",
            target + direction * (0.85 * radius) + right * (0.20 * radius) + up * (1.55 * radius),
            target,
            energy=neutral_energy * 0.58,
            size=max(1.0, radius * 0.36),
            color=(0.90, 0.95, 1.0),
        )
    else:
        raise ValueError(f"Unknown evidence lighting profile {profile}")

    light_states = {}
    for name in ("ASHLINE_KEY", "ASHLINE_FILL", "ASHLINE_RIM", "ASHLINE_DETAIL"):
        light = bpy.data.objects[name]
        light_states[name] = {
            "location": rounded(light.location),
            "energy": round(float(light.data.energy), 3),
            "size": round(float(light.data.size), 3),
            "color": rounded(light.data.color),
        }
    return {
        "profile": profile,
        "exposure": round(float(bpy.context.scene.view_settings.exposure), 3),
        "worldStrength": 0.38,
        "energyScale": round(neutral_energy, 3),
        "lights": light_states,
    }


class AuthoredEmission:
    """Temporarily disable the authored Rig cue while preserving linked shader inputs exactly."""

    def __init__(
        self,
        visible_objects: Sequence[bpy.types.Object],
        drive_components: Sequence[str],
    ) -> None:
        materials: dict[str, bpy.types.Material] = {}
        cue_names = [
            name for name in drive_components if name.startswith("Hook_DriveInternalCue_")
        ]
        if len(cue_names) < 2:
            raise RuntimeError("Paired-drive emission proof requires both named internal cues")
        for obj in visible_objects:
            for slot in obj.material_slots:
                material = slot.material
                if material is not None and material.name.startswith("Material_Cyan"):
                    materials[material.name] = material
        if not materials:
            raise RuntimeError("Visible LOD0 has no authored Material_Cyan emission role")

        self.states: list[dict[str, Any]] = []
        for material in materials.values():
            if not material.use_nodes or material.node_tree is None:
                continue
            for node in material.node_tree.nodes:
                strength = node.inputs.get("Emission Strength")
                if strength is None and node.type == "EMISSION":
                    strength = node.inputs.get("Strength")
                if strength is None:
                    continue
                incoming = [
                    link.from_socket
                    for link in material.node_tree.links
                    if link.to_socket == strength
                ]
                default_value = float(strength.default_value)
                if default_value <= 0.0 and not incoming:
                    continue
                self.states.append({
                    "material": material,
                    "tree": material.node_tree,
                    "node": node,
                    "socket": strength,
                    "default": default_value,
                    "incoming": incoming,
                })
        if not self.states:
            raise RuntimeError(
                "Authored Material_Cyan has no non-zero or linked emission-strength input",
            )
        self.material_names = sorted({state["material"].name for state in self.states})
        self.bindings = sorted(
            (
                {
                    "material": state["material"].name,
                    "node": state["node"].name,
                    "socket": state["socket"].name,
                    "authoredStrength": round(float(state["default"]), 6),
                    "incomingLinks": len(state["incoming"]),
                }
                for state in self.states
            ),
            key=lambda binding: (binding["material"], binding["node"], binding["socket"]),
        )

    def set_enabled(self, enabled: bool) -> None:
        for state in self.states:
            tree = state["tree"]
            socket = state["socket"]
            for link in list(tree.links):
                if link.to_socket == socket:
                    tree.links.remove(link)
            socket.default_value = state["default"] if enabled else 0.0
            if enabled:
                for from_socket in state["incoming"]:
                    tree.links.new(from_socket, socket)


def configure_scene() -> bpy.types.Object:
    camera = base.configure_scene()
    scene = bpy.context.scene
    if tuple(bpy.app.version) != EXPECTED_BLENDER_VERSION:
        raise RuntimeError(
            f"Rig evidence requires Blender {EXPECTED_BLENDER_VERSION}, "
            f"got {tuple(bpy.app.version)}",
        )
    bpy.context.preferences.system.gpu_backend = "OPENGL"
    scene.render.engine = "BLENDER_EEVEE"
    scene.eevee.taa_samples = 64
    scene.eevee.taa_render_samples = 64
    scene.eevee.use_taa_reprojection = False
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.image_settings.color_depth = "8"
    scene.render.image_settings.compression = 15
    scene.render.film_transparent = False
    scene.render.use_file_extension = True
    scene.render.dither_intensity = 0.0
    scene.view_settings.view_transform = "AgX"
    scene.view_settings.look = "AgX - Medium High Contrast"
    scene.view_settings.exposure = 1.0
    scene.view_settings.gamma = 1.0
    scene.view_settings.use_curve_mapping = False
    world = scene.world
    if world is None or not world.use_nodes or world.node_tree is None:
        raise RuntimeError("Material-truth scene has no node world")
    background = world.node_tree.nodes.get("Background")
    if background is None:
        raise RuntimeError("Material-truth scene has no world Background node")
    background.inputs["Color"].default_value = (0.016, 0.024, 0.038, 1.0)
    background.inputs["Strength"].default_value = 0.38
    camera.data.clip_start = 0.02
    camera.data.clip_end = 2000.0
    return camera


def render_provenance() -> dict[str, Any]:
    scene = bpy.context.scene
    return {
        "blender": {
            "version": bpy.app.version_string,
            "versionTuple": list(bpy.app.version),
        },
        "settings": {
            "engine": scene.render.engine,
            "device": {
                "class": "GPU_RASTER",
                "backend": bpy.context.preferences.system.gpu_backend,
            },
            "samples": {
                "viewportTaa": int(scene.eevee.taa_samples),
                "renderTaa": int(scene.eevee.taa_render_samples),
                "taaReprojection": bool(scene.eevee.use_taa_reprojection),
            },
            "png": {
                "format": scene.render.image_settings.file_format,
                "colorMode": scene.render.image_settings.color_mode,
                "colorDepth": scene.render.image_settings.color_depth,
                "compression": int(scene.render.image_settings.compression),
                "useFileExtension": bool(scene.render.use_file_extension),
            },
            "colorManagement": {
                "viewTransform": scene.view_settings.view_transform,
                "look": scene.view_settings.look,
                "exposure": float(scene.view_settings.exposure),
                "gamma": float(scene.view_settings.gamma),
                "curveMapping": bool(scene.view_settings.use_curve_mapping),
                "ditherIntensity": float(scene.render.dither_intensity),
            },
            "filmTransparent": bool(scene.render.film_transparent),
            "resolutionPercentage": int(scene.render.resolution_percentage),
        },
    }


def render_frame(
    camera: bpy.types.Object,
    output: Path,
    camera_metadata: dict[str, Any],
) -> None:
    scene = bpy.context.scene
    camera.location = camera_metadata["location"]
    base.point_at(camera, tuple(camera_metadata["target"]))
    if camera_metadata["projection"] == "orthographic":
        camera.data.type = "ORTHO"
        camera.data.ortho_scale = camera_metadata["orthoScale"]
    else:
        camera.data.type = "PERSP"
        camera.data.lens = camera_metadata["lensMm"]
    scene.render.resolution_x, scene.render.resolution_y = camera_metadata["resolution"]
    scene.render.filepath = str(output)
    bpy.ops.render.render(write_still=True)


def render_rig(source: Path, output_dir: Path) -> list[Path]:
    global LAST_RENDER_METADATA, LAST_RENDER_PROVENANCE
    base.clear_scene()
    visible = import_visible_lod0(source)
    camera = configure_scene()
    LAST_RENDER_PROVENANCE = render_provenance()
    output_dir.mkdir(parents=True, exist_ok=True)

    root, semantic_contract = imported_semantic_contract()
    groups: dict[str, dict[str, Any]] = {}
    for group, contract_group in SEMANTIC_CONTRACT_GROUPS.items():
        local_group = semantic_contract["groups"][contract_group]
        audit = audit_component_names(group, local_group["components"])
        bounds = semantic_world_bounds(root, local_group)
        groups[group] = {
            "components": list(local_group["components"]),
            "audit": audit,
            "bounds": bounds,
            "contractGroup": contract_group,
            "localGroup": local_group,
        }
    emission = AuthoredEmission(
        visible,
        semantic_contract["groups"]["drives"]["components"],
    )

    written: list[Path] = []
    metadata: dict[str, dict[str, Any]] = {}
    try:
        for spec in VIEW_SPECS:
            name = str(spec["name"])
            group = str(spec["group"])
            group_data = groups[group]
            bounds = group_data["bounds"]
            camera_metadata, basis = fit_camera_to_bounds(
                camera,
                bounds,
                direction_values=spec["direction"],
                lens=float(spec["lens"]),
                size=spec["size"],
                margin=float(spec["margin"]),
                orthographic=bool(spec.get("orthographic")),
            )
            camera_metadata["projectedCornerMaximum"] = assert_camera_contains_bounds(
                camera_metadata,
                bounds,
            )
            lighting = configure_view_lighting(bounds, basis, str(spec["lighting"]))
            emission_state = str(spec.get("emission", "authored-on"))
            emission.set_enabled(emission_state != "off")
            output = output_dir / name
            render_frame(camera, output, camera_metadata)
            written.append(output)
            semantic_metadata = {
                "group": group,
                "boundsSource": (
                    "root-semantic-full-rig-bounds"
                    if group == "full_rig"
                    else "root-semantic-component-bounds"
                ),
                "components": group_data["components"],
                "requirements": group_data["audit"],
                "bounds": receipt_bounds(bounds),
            }
            semantic_metadata["contract"] = {
                "root": root.name,
                "schema": semantic_contract["schema"],
                "basis": semantic_contract["basis"],
                "importConversion": SEMANTIC_IMPORT_CONVERSION,
                "group": group_data["contractGroup"],
            }
            semantic_metadata["rootLocalBounds"] = local_group_receipt(
                group_data["localGroup"],
            )
            if group == "full_rig":
                authored_group = semantic_contract["groups"]["authoredRig"]
                semantic_metadata["materialFocusProvenance"] = {
                    "contractGroup": "authoredRig",
                    "components": list(authored_group["components"]),
                    "rootLocalBounds": local_group_receipt(authored_group),
                }
            metadata[name] = {
                "semantic": semantic_metadata,
                "camera": camera_metadata,
                "lighting": lighting,
                "emission": {
                    "state": emission_state,
                    "materials": emission.material_names,
                    "bindings": emission.bindings,
                },
            }
    finally:
        emission.set_enabled(True)

    names = tuple(path.name for path in written)
    if names != ARTIFACT_NAMES:
        raise RuntimeError(f"Rig evidence set drifted: {names}")
    paired_path = output_dir / "paired_drive_mount_close.png"
    off_path = output_dir / "emission_off.png"
    if sha256(paired_path) == sha256(off_path):
        raise RuntimeError(
            "Matched paired-drive emission-on/off frames are byte-identical; "
            "the authored cue was not honestly demonstrated",
        )
    emission_delta = png_emission_delta(paired_path, off_path)
    assert_emission_delta(emission_delta)
    emission_delta_receipt = {
        **emission_delta,
        "changedPixelFraction": round(emission_delta["changedPixelFraction"], 9),
        "boundingBoxFraction": round(emission_delta["boundingBoxFraction"], 9),
        "limits": dict(EMISSION_DELTA_LIMITS),
    }
    for name in ("paired_drive_mount_close.png", "emission_off.png"):
        metadata[name]["emission"]["delta"] = emission_delta_receipt
    if set(LUMA_LIMITS) != set(ARTIFACT_NAMES):
        raise RuntimeError("Every Rig artifact must have an explicit luma eligibility intent")
    for path in written:
        metrics = png_luma_metrics(path)
        limits = LUMA_LIMITS[path.name]
        assert_luma_eligible(path.name, metrics, limits)
        metadata[path.name]["luma"] = {
            "mean": round(metrics["mean"], 3),
            "belowEightFraction": round(metrics["belowEightFraction"], 6),
            "above247Fraction": round(metrics["above247Fraction"], 6),
            "p5": metrics["p5"],
            "p95": metrics["p95"],
            "p5P95Spread": metrics["p5P95Spread"],
            "limits": dict(limits),
        }
    LAST_RENDER_METADATA = metadata
    return written


def build_receipt(
    *,
    transaction_id: str,
    source: Path,
    source_hash: str,
    staged_paths: Sequence[Path],
    output_dir: Path,
    producer_hash: str,
    base_renderer_hash: str,
) -> dict[str, Any]:
    """Bind validated staged bytes to their eventual canonical paths."""
    names = tuple(path.name for path in staged_paths)
    if names != ARTIFACT_NAMES:
        raise RuntimeError(f"Cannot receipt incomplete Rig evidence set: {names}")
    if set(LAST_RENDER_METADATA) != set(ARTIFACT_NAMES):
        raise RuntimeError("Rig render metadata is incomplete; receipt withheld")
    if not LAST_RENDER_PROVENANCE:
        raise RuntimeError("Rig render provenance is absent; receipt withheld")

    producer = {"path": TOOL_RELATIVE, "sha256": producer_hash}
    producer_dependencies = [{
        "path": BASE_RENDERER_RELATIVE,
        "sha256": base_renderer_hash,
    }]
    provenance_hash = canonical_json_sha256(LAST_RENDER_PROVENANCE)
    artifacts = []
    for staged_path in staged_paths:
        width, height = png_dimensions(staged_path)
        canonical_path = output_dir / staged_path.name
        artifacts.append({
            "path": relative(canonical_path),
            "sha256": sha256(staged_path),
            "bytes": staged_path.stat().st_size,
            "width": width,
            "height": height,
            "dimensions": [width, height],
            "inputBindings": [{"shipKey": SHIP_KEY, "sourceSha256": source_hash}],
            "producer": producer,
            "producerDependencies": producer_dependencies,
            "renderProvenanceSha256": provenance_hash,
            **LAST_RENDER_METADATA[staged_path.name],
        })
    return {
        "schema": SCHEMA,
        "transactionId": transaction_id,
        "shipKey": SHIP_KEY,
        "source": relative(source),
        "sourceSha256": source_hash,
        "producer": producer,
        "producerDependencies": producer_dependencies,
        "renderProvenance": LAST_RENDER_PROVENANCE,
        "renderProvenanceSha256": provenance_hash,
        "artifacts": artifacts,
    }


def validate_receipt_against_staging(
    staged_paths: Sequence[Path],
    output_dir: Path,
    receipt: dict[str, Any],
    *,
    canonical_path_label: Callable[[Path], str] = relative,
) -> dict[str, str]:
    """Fail before canonical mutation unless receipt, names, paths, and staged bytes agree."""
    names = tuple(path.name for path in staged_paths)
    if names != ARTIFACT_NAMES or len(set(staged_paths)) != len(staged_paths):
        raise RuntimeError(f"Staged Rig evidence set drifted: {names}")
    if any(not path.is_file() for path in staged_paths):
        raise RuntimeError("Every staged Rig evidence artifact must be a regular file")
    stage_parents = {path.parent.resolve() for path in staged_paths}
    if len(stage_parents) != 1:
        raise RuntimeError("Rig evidence artifacts must share one staging directory")

    artifacts = receipt.get("artifacts")
    if not isinstance(artifacts, list) or len(artifacts) != len(staged_paths):
        raise RuntimeError("Rig receipt artifact set is incomplete")
    artifacts_by_name: dict[str, dict[str, Any]] = {}
    for artifact in artifacts:
        if not isinstance(artifact, dict) or not isinstance(artifact.get("path"), str):
            raise RuntimeError("Rig receipt contains an invalid artifact record")
        name = Path(artifact["path"]).name
        if name in artifacts_by_name:
            raise RuntimeError(f"Rig receipt duplicates artifact {name}")
        artifacts_by_name[name] = artifact

    staged_hashes = {path.name: sha256(path) for path in staged_paths}
    for path in staged_paths:
        artifact = artifacts_by_name.get(path.name)
        expected_path = canonical_path_label(output_dir / path.name)
        if artifact is None or artifact.get("path") != expected_path:
            raise RuntimeError(f"Rig receipt canonical path mismatch for {path.name}")
        if artifact.get("sha256") != staged_hashes[path.name]:
            raise RuntimeError(f"Rig receipt byte hash mismatch for {path.name}")
        if artifact.get("bytes") != path.stat().st_size:
            raise RuntimeError(f"Rig receipt byte count mismatch for {path.name}")
    return staged_hashes


def canonical_file_state(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {"exists": False}
    if not path.is_file():
        return {"exists": True, "kind": "non-file"}
    return {
        "exists": True,
        "kind": "file",
        "sha256": sha256(path),
        "bytes": path.stat().st_size,
    }


def canonical_bundle_precondition(
    output_dir: Path,
    receipt_path: Path,
) -> dict[str, Any]:
    """Snapshot only owned canonical targets so a stale renderer cannot overwrite a newer bundle."""
    return {
        "receipt": canonical_file_state(receipt_path),
        "artifacts": [
            {
                "name": name,
                **canonical_file_state(output_dir / name),
            }
            for name in ARTIFACT_NAMES
        ],
    }


def promotion_lock_record(
    receipt: dict[str, Any],
    staged_paths: Sequence[Path],
    staged_hashes: dict[str, str],
    owner_token: str,
    canonical_precondition: dict[str, Any],
) -> dict[str, Any]:
    """Describe the exact transaction an exclusive canonical-evidence owner may perform."""
    transaction_id = receipt.get("transactionId")
    if not isinstance(transaction_id, str) or not transaction_id:
        raise RuntimeError("Rig receipt has no transactionId for promotion ownership")
    source_path = receipt.get("source")
    source_hash = receipt.get("sourceSha256")
    producer = receipt.get("producer")
    if (
        not isinstance(source_path, str)
        or not isinstance(source_hash, str)
        or not isinstance(producer, dict)
        or not isinstance(producer.get("path"), str)
        or not isinstance(producer.get("sha256"), str)
    ):
        raise RuntimeError("Rig receipt cannot identify source and renderer for its owner lock")
    return {
        "schema": PROMOTION_LOCK_SCHEMA,
        "shipKey": SHIP_KEY,
        "transactionId": transaction_id,
        "ownerToken": owner_token,
        "processId": os.getpid(),
        "source": {
            "path": source_path,
            "sha256": source_hash,
        },
        "renderer": dict(producer),
        "rendererDependencies": receipt.get("producerDependencies", []),
        "canonicalPrecondition": canonical_precondition,
        "artifacts": [
            {
                "name": path.name,
                "sha256": staged_hashes[path.name],
                "bytes": path.stat().st_size,
            }
            for path in staged_paths
        ],
    }


def acquire_promotion_lock(
    lock_path: Path,
    lock_record: dict[str, Any],
) -> str:
    """Atomically create the cooperative owner lock; an existing lock always fails closed."""
    lock_text = json.dumps(lock_record, sort_keys=True, separators=(",", ":")) + "\n"
    try:
        # Python's text ``x`` mode is the atomic O_EXCL equivalent of Node's ``wx``.
        with lock_path.open("x", encoding="utf-8", newline="\n") as handle:
            handle.write(lock_text)
            handle.flush()
            os.fsync(handle.fileno())
    except FileExistsError as error:
        raise RuntimeError(
            f"Rig evidence promotion lock already exists; canonical paths untouched: {lock_path}",
        ) from error
    return lock_text


def assert_promotion_lock_owner(lock_path: Path, expected_text: str) -> None:
    try:
        actual_text = lock_path.read_text(encoding="utf-8")
    except FileNotFoundError as error:
        raise RuntimeError(
            f"Rig evidence promotion owner lock disappeared: {lock_path}",
        ) from error
    if actual_text != expected_text:
        raise RuntimeError(
            f"Rig evidence promotion owner lock changed; canonical mutation refused: {lock_path}",
        )


def release_promotion_lock(lock_path: Path, expected_text: str) -> None:
    """Release only the exact lock bytes this transaction atomically created."""
    assert_promotion_lock_owner(lock_path, expected_text)
    lock_path.unlink()


def promote_evidence_bundle(
    staged_paths: Sequence[Path],
    output_dir: Path,
    receipt_path: Path,
    receipt: dict[str, Any],
    *,
    canonical_precondition: dict[str, Any],
    validate_before_receipt: Callable[[], None] | None = None,
    failure_point: str | None = None,
    canonical_path_label: Callable[[Path], str] = relative,
    owner_token: str | None = None,
    promotion_hook: Callable[[str, Path, dict[str, Any]], None] | None = None,
) -> list[Path]:
    """Exclusively and recoverably promote images, then atomically replace the receipt last."""
    staged_paths = list(staged_paths)
    # Preparation may inspect only this contender's staging directory. Canonical preconditions and
    # all input revalidation are repeated after exclusive ownership is acquired.
    staged_hashes = validate_receipt_against_staging(
        staged_paths,
        output_dir,
        receipt,
        canonical_path_label=canonical_path_label,
    )
    receipt_text = json.dumps(receipt, indent=2) + "\n"
    stage_dir = staged_paths[0].parent
    staged_receipt = stage_dir / f".{receipt_path.name}.staged"
    staged_receipt.write_text(receipt_text, encoding="utf-8")
    # Reparse before any canonical mutation so serialization errors cannot strand a partial set.
    if json.loads(staged_receipt.read_text(encoding="utf-8")) != receipt:
        raise RuntimeError("Staged Rig receipt failed its serialization round trip")
    staged_receipt_hash = sha256(staged_receipt)

    if not receipt_path.parent.is_dir():
        raise RuntimeError("Rig evidence canonical parent must already exist")
    lock_path = receipt_path.parent / f".{SHIP_KEY}-material-truth.owner.lock"
    owner_token = owner_token or secrets.token_hex(32)
    lock_record = promotion_lock_record(
        receipt,
        staged_paths,
        staged_hashes,
        owner_token,
        canonical_precondition,
    )
    lock_text = acquire_promotion_lock(lock_path, lock_record)

    backup_dir: Path | None = None
    output_dir_created = False
    artifact_backups: list[tuple[Path, Path, str]] = []
    promoted: list[tuple[Path, Path]] = []
    receipt_backup: tuple[Path, str] | None = None
    receipt_promoted = False

    def checkpoint(point: str) -> None:
        assert_promotion_lock_owner(lock_path, lock_text)
        if promotion_hook is not None:
            promotion_hook(point, lock_path, lock_record)
        assert_promotion_lock_owner(lock_path, lock_text)
        if failure_point == point:
            raise RuntimeError(f"Injected Rig evidence transaction failure at {point}")

    try:
        checkpoint("after-lock-acquired")
        # Repeat every staged and canonical precondition while holding the owner lock.
        locked_hashes = validate_receipt_against_staging(
            staged_paths,
            output_dir,
            receipt,
            canonical_path_label=canonical_path_label,
        )
        if locked_hashes != staged_hashes:
            raise RuntimeError("Rig staged bytes changed while acquiring promotion ownership")
        if canonical_bundle_precondition(output_dir, receipt_path) != canonical_precondition:
            raise RuntimeError(
                "Rig canonical evidence changed since rendering began; promotion refused",
            )
        if not output_dir.parent.is_dir() or receipt_path.parent != output_dir.parent:
            raise RuntimeError("Rig evidence targets must share one existing canonical parent")
        if output_dir.exists() and not output_dir.is_dir():
            raise RuntimeError(f"Rig evidence target is not a directory: {output_dir}")
        if receipt_path.exists() and not receipt_path.is_file():
            raise RuntimeError(f"Rig evidence receipt target is not a file: {receipt_path}")
        if any((output_dir / path.name).is_dir() for path in staged_paths):
            raise RuntimeError("Rig evidence target collides with a directory")
        if validate_before_receipt is not None:
            validate_before_receipt()
        checkpoint("after-locked-preconditions")

        backup_dir = Path(tempfile.mkdtemp(
            prefix=f".{SHIP_KEY}-material-truth-backup-",
            dir=output_dir.parent,
        ))
        output_dir_created = not output_dir.exists()
        if output_dir_created:
            checkpoint("before-output-directory")
            output_dir.mkdir()
        for index, staged_path in enumerate(staged_paths, start=1):
            checkpoint(f"before-artifact:{index}")
            target = output_dir / staged_path.name
            if target.exists():
                backup = backup_dir / staged_path.name
                old_hash = sha256(target)
                target.replace(backup)
                artifact_backups.append((backup, target, old_hash))
                if sha256(backup) != old_hash:
                    raise RuntimeError(f"Rig backup hash drifted for {target.name}")
            checkpoint(f"before-artifact-install:{index}")
            if target.exists():
                raise RuntimeError(f"Rig evidence target unexpectedly reappeared: {target}")
            staged_path.replace(target)
            promoted.append((target, staged_path))
            if sha256(target) != staged_hashes[target.name]:
                raise RuntimeError(f"Promoted Rig evidence hash drifted for {target.name}")
            checkpoint(f"after-artifact:{index}")

        # Moving a file does not change its bytes, but verify the complete promoted image set before
        # allowing the receipt to point at it.
        for target, _staged_path in promoted:
            if sha256(target) != staged_hashes[target.name]:
                raise RuntimeError(f"Promoted Rig evidence hash drifted for {target.name}")
        checkpoint("after-artifact-validation")
        if validate_before_receipt is not None:
            validate_before_receipt()
        checkpoint("before-receipt-backup")

        if receipt_path.exists():
            backup_path = backup_dir / receipt_path.name
            old_receipt_hash = sha256(receipt_path)
            receipt_path.replace(backup_path)
            receipt_backup = (backup_path, old_receipt_hash)
            if sha256(backup_path) != old_receipt_hash:
                raise RuntimeError("Rig receipt backup hash drifted")
        checkpoint("after-receipt-backup")
        if receipt_path.exists():
            raise RuntimeError("Rig receipt target unexpectedly reappeared")
        staged_receipt.replace(receipt_path)
        receipt_promoted = True
        if sha256(receipt_path) != staged_receipt_hash:
            raise RuntimeError("Promoted Rig receipt hash drifted")
        checkpoint("after-receipt-replace")
    except Exception as promotion_error:
        rollback_errors: list[str] = []

        def rollback(label: str, operation: Callable[[], Any]) -> None:
            try:
                assert_promotion_lock_owner(lock_path, lock_text)
                operation()
            except Exception as error:  # pragma: no cover - retained backup is the recovery path.
                rollback_errors.append(f"{label}: {error}")

        if receipt_promoted and receipt_path.exists():
            def return_new_receipt() -> None:
                if sha256(receipt_path) != staged_receipt_hash:
                    raise RuntimeError("new receipt no longer belongs to this transaction")
                if staged_receipt.exists():
                    raise RuntimeError("staged receipt destination is occupied")
                receipt_path.replace(staged_receipt)

            rollback("return new receipt to staging", return_new_receipt)
        if receipt_backup is not None and receipt_backup[0].exists():
            def restore_prior_receipt() -> None:
                backup_path, expected_hash = receipt_backup
                if receipt_path.exists():
                    raise RuntimeError("receipt target is occupied by another output")
                if sha256(backup_path) != expected_hash:
                    raise RuntimeError("prior receipt backup hash changed")
                backup_path.replace(receipt_path)

            rollback("restore prior receipt", restore_prior_receipt)
        for target, staged_path in reversed(promoted):
            if target.exists():
                def return_promoted_artifact(
                    target: Path = target,
                    staged_path: Path = staged_path,
                ) -> None:
                    if sha256(target) != staged_hashes[target.name]:
                        raise RuntimeError("promoted target no longer belongs to this transaction")
                    if staged_path.exists():
                        raise RuntimeError("staged artifact destination is occupied")
                    target.replace(staged_path)

                rollback(f"return {target.name} to staging", return_promoted_artifact)
        for backup, target, expected_hash in reversed(artifact_backups):
            if backup.exists():
                def restore_prior_artifact(
                    backup: Path = backup,
                    target: Path = target,
                    expected_hash: str = expected_hash,
                ) -> None:
                    if target.exists():
                        raise RuntimeError("artifact target is occupied by another output")
                    if sha256(backup) != expected_hash:
                        raise RuntimeError("prior artifact backup hash changed")
                    backup.replace(target)

                rollback(f"restore prior {target.name}", restore_prior_artifact)
        if output_dir_created and output_dir.exists():
            rollback("remove empty output directory", output_dir.rmdir)

        if rollback_errors:
            raise RuntimeError(
                "Rig evidence promotion failed and rollback was incomplete; "
                f"owner lock and recovery backup retained at {backup_dir}: {rollback_errors}",
            ) from promotion_error
        if backup_dir is not None:
            assert_promotion_lock_owner(lock_path, lock_text)
            shutil.rmtree(backup_dir)
        release_promotion_lock(lock_path, lock_text)
        raise

    # A successful receipt-last promotion is complete, but ownership remains held until every
    # recoverable backup has been cleaned.
    checkpoint("before-backup-cleanup")
    if backup_dir is not None:
        shutil.rmtree(backup_dir)
    checkpoint("before-lock-release")
    release_promotion_lock(lock_path, lock_text)
    return [output_dir / path.name for path in staged_paths]


def transaction_fixture_self_test() -> dict[str, Any]:
    """Exercise ownership, contention, safe rollback, and receipt-last success in temp fixtures."""
    fixture_root = Path(tempfile.mkdtemp(prefix="spaceface-rig-transaction-fixture-"))
    try:
        evidence_root = fixture_root / "material_truth_v2"
        evidence_root.mkdir()
        output_dir = evidence_root / SHIP_KEY
        output_dir.mkdir()
        receipt_path = evidence_root / "eligible_artifacts_rig.json"
        old_receipt = b'{"fixture":"old"}\n'
        receipt_path.write_bytes(old_receipt)
        old_bytes = {}
        for name in ARTIFACT_NAMES:
            value = f"old:{name}".encode("utf-8")
            old_bytes[name] = value
            (output_dir / name).write_bytes(value)

        stage_dir = Path(tempfile.mkdtemp(prefix=".fixture-stage-", dir=evidence_root))
        staged_paths = []
        new_bytes = {}
        for name in ARTIFACT_NAMES:
            value = f"new:{name}".encode("utf-8")
            new_bytes[name] = value
            path = stage_dir / name
            path.write_bytes(value)
            staged_paths.append(path)

        def fixture_relative(path: Path) -> str:
            return str(path).replace("\\", "/")

        def fixture_receipt(paths: Sequence[Path], transaction_id: str) -> dict[str, Any]:
            return {
                "transactionId": transaction_id,
                "source": "fixture/source.glb",
                "sourceSha256": "A" * 64,
                "producer": {"path": "fixture/renderer.py", "sha256": "B" * 64},
                "producerDependencies": [],
                "artifacts": [
                    {
                        "path": fixture_relative(output_dir / path.name),
                        "sha256": sha256(path),
                        "bytes": path.stat().st_size,
                    }
                    for path in paths
                ],
            }

        receipt = fixture_receipt(staged_paths, "fixture-primary")
        lock_path = evidence_root / f".{SHIP_KEY}-material-truth.owner.lock"
        old_precondition = canonical_bundle_precondition(output_dir, receipt_path)

        def assert_old_state(point: str) -> None:
            if receipt_path.read_bytes() != old_receipt:
                raise AssertionError(f"Receipt rollback failed at {point}")
            for path in staged_paths:
                if path.read_bytes() != new_bytes[path.name]:
                    raise AssertionError(f"Staging rollback failed for {path.name} at {point}")
                if (output_dir / path.name).read_bytes() != old_bytes[path.name]:
                    raise AssertionError(f"Canonical rollback failed for {path.name} at {point}")
            if lock_path.exists():
                raise AssertionError(f"Owner lock leaked after clean rollback at {point}")

        invalid_receipt = json.loads(json.dumps(receipt))
        invalid_receipt["artifacts"][0]["sha256"] = "0" * 64
        try:
            promote_evidence_bundle(
                staged_paths,
                output_dir,
                receipt_path,
                invalid_receipt,
                canonical_precondition=old_precondition,
                canonical_path_label=fixture_relative,
            )
        except RuntimeError as error:
            if "receipt byte hash mismatch" not in str(error):
                raise
        else:
            raise AssertionError("Pre-promotion receipt mismatch did not fail")
        assert_old_state("prepromotion-receipt-hash")

        def reject_changed_inputs() -> None:
            raise RuntimeError("Injected fixture input-hash drift")

        try:
            promote_evidence_bundle(
                staged_paths,
                output_dir,
                receipt_path,
                receipt,
                canonical_precondition=old_precondition,
                validate_before_receipt=reject_changed_inputs,
                canonical_path_label=fixture_relative,
                owner_token="fixture-input-validator-owner",
            )
        except RuntimeError as error:
            if "Injected fixture input-hash drift" not in str(error):
                raise
        else:
            raise AssertionError("Input-hash drift inside promotion did not fail")
        assert_old_state("input-validator")

        contender_stage = Path(tempfile.mkdtemp(
            prefix=".fixture-contender-stage-",
            dir=evidence_root,
        ))
        contender_paths = []
        for name in ARTIFACT_NAMES:
            path = contender_stage / name
            path.write_bytes(f"contender:{name}".encode("utf-8"))
            contender_paths.append(path)
        contender_receipt = fixture_receipt(contender_paths, "fixture-contender")
        contender_rejections = 0

        def canonical_snapshot() -> dict[str, str]:
            return {
                "receipt": sha256(receipt_path),
                **{
                    name: sha256(output_dir / name)
                    for name in ARTIFACT_NAMES
                },
            }

        def reject_second_contender(
            point: str,
            _lock_path: Path,
            _lock_record: dict[str, Any],
        ) -> None:
            nonlocal contender_rejections
            if point != "after-lock-acquired":
                return
            if (
                _lock_record.get("schema") != PROMOTION_LOCK_SCHEMA
                or _lock_record.get("source") != {
                    "path": receipt["source"],
                    "sha256": receipt["sourceSha256"],
                }
                or _lock_record.get("renderer") != receipt["producer"]
                or [item.get("name") for item in _lock_record.get("artifacts", [])]
                != list(ARTIFACT_NAMES)
                or _lock_record.get("canonicalPrecondition") != old_precondition
            ):
                raise AssertionError("Owner lock does not identify the exact primary transaction")
            before = canonical_snapshot()
            try:
                promote_evidence_bundle(
                    contender_paths,
                    output_dir,
                    receipt_path,
                    contender_receipt,
                    canonical_precondition=old_precondition,
                    canonical_path_label=fixture_relative,
                    owner_token=f"fixture-contender-owner-{contender_rejections + 1}",
                )
            except RuntimeError as error:
                if "promotion lock already exists" not in str(error):
                    raise
            else:
                raise AssertionError("Second contender acquired occupied canonical evidence")
            if canonical_snapshot() != before:
                raise AssertionError("Rejected second contender touched canonical paths")
            contender_rejections += 1

        for point in ("after-artifact:3", "after-receipt-replace"):
            try:
                promote_evidence_bundle(
                    staged_paths,
                    output_dir,
                    receipt_path,
                    receipt,
                    canonical_precondition=old_precondition,
                    failure_point=point,
                    canonical_path_label=fixture_relative,
                    owner_token=f"fixture-rollback-owner-{point}",
                    promotion_hook=(
                        reject_second_contender
                        if point == "after-artifact:3"
                        else None
                    ),
                )
            except RuntimeError as error:
                if "Injected Rig evidence transaction failure" not in str(error):
                    raise
            else:
                raise AssertionError(f"Fixture failure point did not fail: {point}")
            assert_old_state(point)

        def change_owner_lock(
            point: str,
            fixture_lock_path: Path,
            lock_record: dict[str, Any],
        ) -> None:
            if point != "after-lock-acquired":
                return
            changed = {**lock_record, "ownerToken": "changed-by-another-owner"}
            fixture_lock_path.write_text(
                json.dumps(changed, sort_keys=True, separators=(",", ":")) + "\n",
                encoding="utf-8",
            )

        try:
            promote_evidence_bundle(
                staged_paths,
                output_dir,
                receipt_path,
                receipt,
                canonical_precondition=old_precondition,
                canonical_path_label=fixture_relative,
                owner_token="fixture-lock-change-owner",
                promotion_hook=change_owner_lock,
            )
        except RuntimeError as error:
            if "owner lock changed" not in str(error):
                raise
        else:
            raise AssertionError("Changed owner token did not fail closed")
        # No canonical mutation occurred; this temp-only fixture removes the intentionally poisoned
        # stale lock after proving production code refused to release or mutate through it.
        if canonical_snapshot() != {
            "receipt": hashlib.sha256(old_receipt).hexdigest().upper(),
            **{
                name: hashlib.sha256(old_bytes[name]).hexdigest().upper()
                for name in ARTIFACT_NAMES
            },
        }:
            raise AssertionError("Changed lock allowed a canonical mutation")
        lock_path.unlink()
        assert_old_state("changed-owner-lock")

        def replace_promoted_with_other_output(
            point: str,
            _lock_path: Path,
            _lock_record: dict[str, Any],
        ) -> None:
            if point == "after-artifact:1":
                (output_dir / ARTIFACT_NAMES[0]).write_bytes(b"other-owner-output")

        try:
            promote_evidence_bundle(
                staged_paths,
                output_dir,
                receipt_path,
                receipt,
                canonical_precondition=old_precondition,
                failure_point="after-artifact:1",
                canonical_path_label=fixture_relative,
                owner_token="fixture-foreign-output-owner",
                promotion_hook=replace_promoted_with_other_output,
            )
        except RuntimeError as error:
            if (
                "rollback was incomplete" not in str(error)
                or "no longer belongs to this transaction" not in str(error)
            ):
                raise
        else:
            raise AssertionError("Rollback touched a foreign replacement output")
        foreign_target = output_dir / ARTIFACT_NAMES[0]
        if foreign_target.read_bytes() != b"other-owner-output":
            raise AssertionError("Rollback moved or overwrote another owner's output")
        if not lock_path.exists():
            raise AssertionError("Incomplete rollback released its fail-closed owner lock")
        retained_backups = list(evidence_root.glob(
            f".{SHIP_KEY}-material-truth-backup-*",
        ))
        if len(retained_backups) != 1:
            raise AssertionError("Incomplete rollback did not retain exactly one recovery backup")
        # Temp-fixture recovery only: restore the old baseline so subsequent clean success can run.
        foreign_target.unlink()
        retained_old = retained_backups[0] / ARTIFACT_NAMES[0]
        retained_old.replace(foreign_target)
        staged_paths[0].write_bytes(new_bytes[ARTIFACT_NAMES[0]])
        shutil.rmtree(retained_backups[0])
        lock_path.unlink()
        assert_old_state("foreign-output-protection")

        promoted = promote_evidence_bundle(
            staged_paths,
            output_dir,
            receipt_path,
            receipt,
            canonical_precondition=old_precondition,
            canonical_path_label=fixture_relative,
            owner_token="fixture-success-owner",
            promotion_hook=reject_second_contender,
        )
        if [path.name for path in promoted] != list(ARTIFACT_NAMES):
            raise AssertionError("Fixture successful promotion set drifted")
        if json.loads(receipt_path.read_text(encoding="utf-8")) != receipt:
            raise AssertionError("Fixture receipt was not replaced last with the new payload")
        for path in promoted:
            if path.read_bytes() != new_bytes[path.name]:
                raise AssertionError(f"Fixture success bytes drifted for {path.name}")
        if lock_path.exists():
            raise AssertionError("Successful promotion leaked its owner lock")
        if contender_rejections != 2:
            raise AssertionError(
                f"Expected two deterministic contender rejections, got {contender_rejections}",
            )
        completed_snapshot = canonical_snapshot()
        try:
            promote_evidence_bundle(
                contender_paths,
                output_dir,
                receipt_path,
                contender_receipt,
                canonical_precondition=old_precondition,
                canonical_path_label=fixture_relative,
                owner_token="fixture-stale-contender-owner",
            )
        except RuntimeError as error:
            if "changed since rendering began" not in str(error):
                raise
        else:
            raise AssertionError("Stale contender overwrote a newer completed bundle")
        if canonical_snapshot() != completed_snapshot or lock_path.exists():
            raise AssertionError("Stale contender changed canonical state or leaked its lock")
        return {
            "status": "complete",
            "failurePoints": [
                "prepromotion-receipt-hash",
                "input-validator",
                "after-artifact:3",
                "after-receipt-replace",
                "changed-owner-lock",
                "foreign-output-protection",
            ],
            "contenderRejections": contender_rejections,
            "staleContenderRejections": 1,
            "artifactCount": len(promoted),
        }
    finally:
        shutil.rmtree(fixture_root)


def png_decoder_fixture_self_test() -> dict[str, Any]:
    """Prove CRC and terminal-IEND rejection against isolated synthetic PNG fixtures."""
    fixture_root = Path(tempfile.mkdtemp(prefix="spaceface-rig-png-fixture-"))

    def chunk(kind: bytes, payload: bytes) -> bytes:
        checksum = zlib.crc32(payload, zlib.crc32(kind)) & 0xFFFFFFFF
        return struct.pack(">I", len(payload)) + kind + payload + struct.pack(">I", checksum)

    def encode_rgb(width: int, height: int, pixels: Sequence[tuple[int, int, int]]) -> bytes:
        if len(pixels) != width * height:
            raise AssertionError("Synthetic PNG pixel count drifted")
        scanlines = bytearray()
        for row in range(height):
            scanlines.append(0)
            for pixel in pixels[row * width:(row + 1) * width]:
                scanlines.extend(pixel)
        ihdr = struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0)
        return (
            b"\x89PNG\r\n\x1a\n"
            + chunk(b"IHDR", ihdr)
            + chunk(b"IDAT", zlib.compress(bytes(scanlines)))
            + chunk(b"IEND", b"")
        )

    try:
        valid_bytes = encode_rgb(1, 1, [(1, 2, 3)])
        valid = fixture_root / "valid.png"
        valid.write_bytes(valid_bytes)
        if decode_png_rgb(valid) != (1, 1, b"\x01\x02\x03"):
            raise AssertionError("Synthetic valid PNG did not decode exactly")

        corrupt_bytes = bytearray(valid_bytes)
        corrupt_bytes[29] ^= 0x01
        fixtures = {
            "crc": bytes(corrupt_bytes),
            "trailing": valid_bytes + b"trailing",
            "missingIend": valid_bytes[:-12],
        }
        rejected = []
        for name, payload in fixtures.items():
            path = fixture_root / f"{name}.png"
            path.write_bytes(payload)
            try:
                decode_png_rgb(path)
            except ValueError:
                rejected.append(name)
            else:
                raise AssertionError(f"Malformed PNG fixture was accepted: {name}")

        width = height = 16
        rich_pixels = [
            (
                (20, 20, 20)
                if x < 2
                else (180, 180, 180)
                if x >= 12
                else (90, 90, 90)
            )
            for _y in range(height)
            for x in range(width)
        ]
        content_fixtures = {
            "contentRich": rich_pixels,
            "flatWhite": [(255, 255, 255)] * (width * height),
            "flatGray": [(96, 96, 96)] * (width * height),
        }
        content_metrics = {}
        for name, pixels in content_fixtures.items():
            path = fixture_root / f"{name}.png"
            path.write_bytes(encode_rgb(width, height, pixels))
            content_metrics[name] = png_luma_metrics(path)
        fixture_limits = LUMA_LIMITS["neutral_front34.png"]
        assert_luma_eligible("contentRich", content_metrics["contentRich"], fixture_limits)
        content_rejected = []
        for name in ("flatWhite", "flatGray"):
            try:
                assert_luma_eligible(name, content_metrics[name], fixture_limits)
            except RuntimeError:
                content_rejected.append(name)
            else:
                raise AssertionError(f"Content-free luma fixture was accepted: {name}")
        return {
            "status": "complete",
            "pngStructureRejected": rejected,
            "contentRejected": content_rejected,
            "contentAccepted": ["valid", "contentRich"],
            "contentMetrics": content_metrics,
        }
    finally:
        shutil.rmtree(fixture_root)


def nonrender_acceptance_self_test(source: Path | None = None) -> dict[str, Any]:
    """Exercise exact import, pinned settings, camera containment, and emission restoration."""
    source = source or (
        FAMILY / "source" / "wholeships" / f"{SHIP_ID}.glb"
    )
    base.clear_scene()
    visible = import_visible_lod0(source)
    camera = configure_scene()
    provenance = render_provenance()
    expected_provenance = {
        "blender": {
            "version": "5.1.2",
            "versionTuple": [5, 1, 2],
        },
        "settings": {
            "engine": "BLENDER_EEVEE",
            "device": {"class": "GPU_RASTER", "backend": "OPENGL"},
            "samples": {
                "viewportTaa": 64,
                "renderTaa": 64,
                "taaReprojection": False,
            },
            "png": {
                "format": "PNG",
                "colorMode": "RGBA",
                "colorDepth": "8",
                "compression": 15,
                "useFileExtension": True,
            },
            "colorManagement": {
                "viewTransform": "AgX",
                "look": "AgX - Medium High Contrast",
                "exposure": 1.0,
                "gamma": 1.0,
                "curveMapping": False,
                "ditherIntensity": 0.0,
            },
            "filmTransparent": False,
            "resolutionPercentage": 100,
        },
    }
    if provenance != expected_provenance:
        raise AssertionError(
            f"Pinned Rig render provenance drifted: {provenance} != {expected_provenance}",
        )

    root, semantic_contract = imported_semantic_contract()
    groups = {}
    for group, contract_group in SEMANTIC_CONTRACT_GROUPS.items():
        local_group = semantic_contract["groups"][contract_group]
        audit_component_names(group, local_group["components"])
        groups[group] = semantic_world_bounds(root, local_group)
    camera_audits = {}
    for spec in VIEW_SPECS:
        metadata, _basis = fit_camera_to_bounds(
            camera,
            groups[str(spec["group"])],
            direction_values=spec["direction"],
            lens=float(spec["lens"]),
            size=spec["size"],
            margin=float(spec["margin"]),
            orthographic=bool(spec.get("orthographic")),
        )
        camera_audits[str(spec["name"])] = assert_camera_contains_bounds(
            metadata,
            groups[str(spec["group"])],
        )

    emission = AuthoredEmission(
        visible,
        semantic_contract["groups"]["drives"]["components"],
    )

    def emission_snapshot() -> list[dict[str, Any]]:
        snapshot = []
        for state in emission.states:
            links = sorted(
                (
                    link.from_node.name,
                    link.from_socket.name,
                )
                for link in state["tree"].links
                if link.to_socket == state["socket"]
            )
            snapshot.append({
                "material": state["material"].name,
                "node": state["node"].name,
                "socket": state["socket"].name,
                "default": float(state["socket"].default_value),
                "links": links,
            })
        return snapshot

    authored_snapshot = emission_snapshot()
    emission.set_enabled(False)
    disabled_snapshot = emission_snapshot()
    if any(state["default"] != 0.0 or state["links"] for state in disabled_snapshot):
        raise AssertionError("Rig emission-off state retained an authored signal")
    emission.set_enabled(True)
    if emission_snapshot() != authored_snapshot:
        raise AssertionError("Rig authored emission state was not restored exactly")
    return {
        "status": "complete",
        "sourceSha256": sha256(source),
        "semanticGroups": sorted(semantic_contract["groups"]),
        "fullRigRootLocalBounds": local_group_receipt(
            semantic_contract["groups"]["fullRig"],
        ),
        "cameraAudits": camera_audits,
        "emissionBindings": emission.bindings,
        "renderProvenance": provenance,
        "renderProvenanceSha256": canonical_json_sha256(provenance),
    }


def main() -> int:
    global LAST_RESULT
    source = FAMILY / "source" / "wholeships" / f"{SHIP_ID}.glb"
    output_dir = FAMILY / "evidence" / "material_truth_v2" / SHIP_KEY
    receipt_path = (
        FAMILY / "evidence" / "material_truth_v2" / "eligible_artifacts_rig.json"
    )
    if not source.exists():
        raise FileNotFoundError(source)
    source_hash = sha256(source)
    producer_hash = sha256(ROOT / TOOL_RELATIVE)
    base_renderer_hash = sha256(BASE_RENDERER)
    transaction_id = uuid.uuid4().hex
    output_dir.parent.mkdir(parents=True, exist_ok=True)
    canonical_precondition = canonical_bundle_precondition(output_dir, receipt_path)
    stage_dir = Path(tempfile.mkdtemp(
        prefix=f".{SHIP_KEY}-material-truth-stage-",
        dir=output_dir.parent,
    ))

    def validate_inputs_unchanged() -> None:
        if sha256(source) != source_hash:
            raise RuntimeError("Rig source changed during evidence rendering; receipt withheld")
        if sha256(ROOT / TOOL_RELATIVE) != producer_hash:
            raise RuntimeError("Rig evidence producer changed during rendering; receipt withheld")
        if sha256(BASE_RENDERER) != base_renderer_hash:
            raise RuntimeError(
                "Rig base-renderer dependency changed during rendering; receipt withheld",
            )

    try:
        staged = render_rig(source, stage_dir)
        validate_inputs_unchanged()
        receipt = build_receipt(
            transaction_id=transaction_id,
            source=source,
            source_hash=source_hash,
            staged_paths=staged,
            output_dir=output_dir,
            producer_hash=producer_hash,
            base_renderer_hash=base_renderer_hash,
        )
        written = promote_evidence_bundle(
            staged,
            output_dir,
            receipt_path,
            receipt,
            canonical_precondition=canonical_precondition,
            validate_before_receipt=validate_inputs_unchanged,
        )
    finally:
        shutil.rmtree(stage_dir, ignore_errors=True)

    LAST_RESULT = {
        "status": "complete",
        "shipKey": SHIP_KEY,
        "sourceSha256": source_hash,
        "producerSha256": producer_hash,
        "artifacts": [relative(path) for path in written],
        "receipt": relative(receipt_path),
    }
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

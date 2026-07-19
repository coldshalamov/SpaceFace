#!/usr/bin/env python3
"""Author the scratch-only Wasp fleet hero candidate with deterministic PBR surfaces.

The recipe imports the immutable production Wasp authoring script from the packet snapshot, uses
it only to reconstruct the accepted macro silhouette/collision/socket substrate, then adds a new
functional detail and material hierarchy. It never writes to canonical assets, release outputs,
manifests, locks, or runtime maps.
"""
from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
import math
import os
import sys
import traceback
from pathlib import Path
from typing import Any, Iterable, Sequence

import bmesh
import bpy
import numpy as np
from mathutils import Vector


SCRIPT_PATH = Path(__file__).resolve()
REPO_ROOT = SCRIPT_PATH.parents[4]
SPEC_PATH = SCRIPT_PATH.with_suffix(".spec.json")
RECIPE_ID = "golden-wasp-fleet-hero-v1"
SCRATCH_REL = Path(".devshots/graphics/wasp-fleet-hero-v1")
ROLE_ORDER = (
    "coated_armor", "dark_composite", "structural_alloy", "identity_cyan",
    "service_marking", "sensor_glass", "drive_aperture", "heat_alloy",
    "radiator_laminate", "recessed_machinery",
)
ROLE_TO_MATERIAL = {
    "coated_armor": "Material_Hull",
    "dark_composite": "Material_Armor",
    "structural_alloy": "Material_Mechanical",
    "identity_cyan": "Material_Accent",
    "service_marking": "Material_Warning",
    "sensor_glass": "Material_Canopy",
    "drive_aperture": "Material_Thruster",
    "heat_alloy": "Material_HeatMetal",
    "radiator_laminate": "Material_Radiator",
    "recessed_machinery": "Material_Recessed",
}
MATERIAL_TO_ROLE = {value: key for key, value in ROLE_TO_MATERIAL.items()}
EXPECTED_SOURCE_HASHES = {
    0: "FDFD7C76C793C5BE9593E9C095BADE0708C36163086F181FF08BDDFBE5173E5A",
    1: "10E47344EB1974B4428312A9D25673AE64647794E68A13C8A8B87436F1A98DD0",
    2: "885028EB6B575AC77D9DD6351FDF248CE2FCF527E61C225A70B296DEFE576583",
}
EXPECTED_SOURCE_BYTES = {0: 12797604, 1: 12615760, 2: 12505480}
SOURCE_FILES = {
    0: "assets/ships/parts/wholeships/wasp_production_v1.glb",
    1: "assets/ships/parts/wholeships/wasp_production_v1_lod1.glb",
    2: "assets/ships/parts/wholeships/wasp_production_v1_lod2.glb",
}
SOURCE_BOUNDS = {
    0: ([-10.0, -8.08183, -1.38], [12.0, 8.08183, 2.319466]),
    1: ([-10.0, -8.08183, -1.38], [12.0, 8.08183, 1.790296]),
    2: ([-10.0, -8.08183, -1.38], [12.0, 8.08183, 1.790296]),
}


def parse_args() -> argparse.Namespace:
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input-root", default=str(REPO_ROOT / SCRATCH_REL / "input/repo"))
    parser.add_argument("--output-dir", default=str(REPO_ROOT / SCRATCH_REL / "candidate"))
    parser.add_argument("--texture-size", type=int, default=1024)
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
    scratch = (REPO_ROOT / SCRATCH_REL).resolve()
    if not is_within(input_root, scratch) or not is_within(output_dir, scratch):
        raise RuntimeError("Wasp recipe requires immutable input and output below its scratch root")
    forbidden = (
        REPO_ROOT / "assets/ships/parts", REPO_ROOT / "assets/ships/release",
        REPO_ROOT / "assets/ships/release.__building", REPO_ROOT / "assets/ships/release.__previous",
    )
    if any(is_within(output_dir, path) for path in forbidden):
        raise RuntimeError(f"refusing canonical/release output: {output_dir}")


def load_base_builder(input_root: Path):
    path = input_root / "assets/ships/wasp_production_v1/scripts/build_wasp_v1.py"
    if not path.is_file():
        raise FileNotFoundError(path)
    spec = importlib.util.spec_from_file_location("spaceface_immutable_wasp_v1", path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"unable to import immutable builder: {path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def smoothstep(value: np.ndarray) -> np.ndarray:
    return value * value * (3.0 - 2.0 * value)


def periodic_noise(u: np.ndarray, v: np.ndarray, seed: int, scale: float) -> np.ndarray:
    """Deterministic tileable layered signal without uniform random grunge."""
    phase = (seed % 997) / 997.0 * math.tau
    signal = (
        np.sin((u * scale + phase * 0.13) * math.tau)
        + np.sin((v * scale * 0.73 + phase * 0.29) * math.tau) * 0.72
        + np.sin(((u + v) * scale * 0.41 + phase * 0.47) * math.tau) * 0.51
        + np.sin(((u * 1.7 - v) * scale * 0.23 + phase * 0.71) * math.tau) * 0.34
    ) / 2.57
    return np.clip(signal * 0.5 + 0.5, 0.0, 1.0)


def tileable_value_noise(
    u: np.ndarray,
    v: np.ndarray,
    seed: int,
    cells: int | tuple[int, int],
) -> np.ndarray:
    """Deterministic smooth value noise with independent manufacturing axes.

    Unequal cell counts create brushed, rolled, or laminated responses without crossing two regular
    sine fields into a checker. Both axes still wrap exactly, so generated maps remain mip-safe.
    """
    cells_x, cells_y = (cells, cells) if isinstance(cells, int) else cells
    if cells_x < 1 or cells_y < 1:
        raise ValueError("tileable value-noise cells must be positive")
    x = u * cells_x
    y = v * cells_y
    x0 = np.floor(x).astype(np.int64) % cells_x
    y0 = np.floor(y).astype(np.int64) % cells_y
    x1 = (x0 + 1) % cells_x
    y1 = (y0 + 1) % cells_y
    tx = smoothstep(x - np.floor(x))
    ty = smoothstep(y - np.floor(y))

    def lattice_hash(ix: np.ndarray, iy: np.ndarray) -> np.ndarray:
        value = (ix.astype(np.uint64) * np.uint64(374761393)
                 + iy.astype(np.uint64) * np.uint64(668265263)
                 + np.uint64(seed & 0xFFFFFFFF) * np.uint64(69069)) & np.uint64(0xFFFFFFFF)
        value = ((value ^ (value >> np.uint64(13))) * np.uint64(1274126177)) & np.uint64(0xFFFFFFFF)
        value ^= value >> np.uint64(16)
        return (value & np.uint64(0xFFFFFF)).astype(np.float32) / float(0xFFFFFF)

    n00 = lattice_hash(x0, y0)
    n10 = lattice_hash(x1, y0)
    n01 = lattice_hash(x0, y1)
    n11 = lattice_hash(x1, y1)
    nx0 = n00 + (n10 - n00) * tx
    nx1 = n01 + (n11 - n01) * tx
    return nx0 + (nx1 - nx0) * ty


def manufacturing_spectral_noise(
    u: np.ndarray,
    v: np.ndarray,
    seed: int,
    frequency_x: tuple[int, int],
    frequency_y: tuple[int, int],
    components: int = 12,
) -> np.ndarray:
    """Tileable multi-directional manufacturing variation without a visible lattice.

    Integer Fourier modes preserve exact wrapping, while a deterministic LCG chooses unrelated
    frequencies, phase, direction, and amplitude. Unlike value-noise at meso scale, this cannot
    reveal square cells in roughness-only proof or after cube projection rotates an island.
    """
    state = (seed ^ 0x9E3779B9) & 0xFFFFFFFF

    def next_u32() -> int:
        nonlocal state
        state = (1664525 * state + 1013904223) & 0xFFFFFFFF
        return state

    fx_min, fx_max = frequency_x
    fy_min, fy_max = frequency_y
    signal = np.zeros_like(u)
    weight_total = 0.0
    # A sufficiently dense, near-equal spectrum prevents any single diagonal mode from reading as
    # a repeated stripe in roughness-only proof while retaining a controlled directional bias.
    for index in range(max(components, 24)):
        fx = fx_min + next_u32() % max(1, fx_max - fx_min + 1)
        fy = fy_min + next_u32() % max(1, fy_max - fy_min + 1)
        direction = -1.0 if next_u32() & 1 else 1.0
        phase = (next_u32() / float(0xFFFFFFFF)) * math.tau
        weight = 1.0 / math.sqrt(1.0 + index * 0.025)
        signal += np.sin((u * fx + v * fy * direction) * math.tau + phase) * weight
        weight_total += weight
    return np.clip(signal / max(weight_total, 1e-6) * 0.5 + 0.5, 0.0, 1.0)


def bounded_handling_scratches(u: np.ndarray, v: np.ndarray, seed: int) -> np.ndarray:
    """A few finite maintenance-direction strokes, never a texture-wide scratch field."""
    result = np.zeros_like(u)
    for index, (cx, cy, angle, length, width) in enumerate((
        (0.24, 0.31, 0.18, 0.17, 0.0024),
        (0.71, 0.63, -0.27, 0.13, 0.0018),
        (0.43, 0.81, 0.09, 0.09, 0.0016),
    )):
        phase = ((seed + index * 83) % 251) / 251.0
        local_cx = (cx + (phase - 0.5) * 0.045) % 1.0
        local_cy = (cy + (0.5 - phase) * 0.04) % 1.0
        dx, dy = u - local_cx, v - local_cy
        along = dx * math.cos(angle) + dy * math.sin(angle)
        cross = -dx * math.sin(angle) + dy * math.cos(angle)
        finite = np.clip((length * 0.5 - np.abs(along)) / (length * 0.12), 0.0, 1.0)
        stroke = np.exp(-((cross / width) ** 2)) * smoothstep(finite)
        result = np.maximum(result, stroke)
    return np.clip(result, 0.0, 1.0)


VECTOR_FONT_STROKES = {
    "-": (((0.08, 0.5), (0.92, 0.5)),),
    "0": (((0.12, 0.08), (0.88, 0.08)), ((0.88, 0.08), (0.88, 0.92)), ((0.88, 0.92), (0.12, 0.92)), ((0.12, 0.92), (0.12, 0.08)), ((0.2, 0.82), (0.8, 0.18))),
    "1": (((0.28, 0.2), (0.5, 0.08)), ((0.5, 0.08), (0.5, 0.92)), ((0.22, 0.92), (0.8, 0.92))),
    "3": (((0.1, 0.08), (0.86, 0.08)), ((0.86, 0.08), (0.86, 0.92)), ((0.14, 0.5), (0.84, 0.5)), ((0.1, 0.92), (0.86, 0.92))),
    "7": (((0.08, 0.08), (0.92, 0.08)), ((0.92, 0.08), (0.35, 0.92))),
    "9": (((0.12, 0.08), (0.88, 0.08)), ((0.12, 0.08), (0.12, 0.5)), ((0.12, 0.5), (0.88, 0.5)), ((0.88, 0.08), (0.88, 0.92)), ((0.18, 0.92), (0.88, 0.92))),
    "F": (((0.12, 0.08), (0.12, 0.92)), ((0.12, 0.08), (0.92, 0.08)), ((0.12, 0.5), (0.76, 0.5))),
    "P": (((0.12, 0.92), (0.12, 0.08)), ((0.12, 0.08), (0.78, 0.08)), ((0.78, 0.08), (0.88, 0.22)), ((0.88, 0.22), (0.78, 0.48)), ((0.78, 0.48), (0.12, 0.48))),
    "R": (((0.12, 0.92), (0.12, 0.08)), ((0.12, 0.08), (0.76, 0.08)), ((0.76, 0.08), (0.88, 0.22)), ((0.88, 0.22), (0.76, 0.48)), ((0.76, 0.48), (0.12, 0.48)), ((0.5, 0.48), (0.9, 0.92))),
    "S": (((0.86, 0.08), (0.18, 0.08)), ((0.18, 0.08), (0.1, 0.18)), ((0.1, 0.18), (0.1, 0.46)), ((0.1, 0.46), (0.82, 0.54)), ((0.82, 0.54), (0.9, 0.66)), ((0.9, 0.66), (0.9, 0.84)), ((0.9, 0.84), (0.82, 0.92)), ((0.82, 0.92), (0.12, 0.92))),
    "V": (((0.08, 0.08), (0.5, 0.92)), ((0.5, 0.92), (0.92, 0.08))),
    "W": (((0.06, 0.08), (0.22, 0.92)), ((0.22, 0.92), (0.5, 0.56)), ((0.5, 0.56), (0.78, 0.92)), ((0.78, 0.92), (0.94, 0.08))),
}


def surface_arrays(role: str, profile: dict[str, Any], size: int, seed: int) -> dict[str, np.ndarray]:
    axis = (np.arange(size, dtype=np.float32) + 0.5) / size
    u, v = np.meshgrid(axis, axis)
    macro = manufacturing_spectral_noise(u, v, seed, (1, 5), (1, 4), 11)
    mid = manufacturing_spectral_noise(u, v, seed + 37, (5, 19), (3, 17), 13)
    micro = manufacturing_spectral_noise(u, v, seed + 101, (37, 109), (29, 97), 15)
    pattern = profile["pattern"]
    feature = (micro - 0.5) * 0.12
    grime = np.zeros_like(u)
    rough_bias = np.zeros_like(u)
    emissive = np.zeros_like(u)
    painted_peel = np.zeros_like(u)
    painted_wear = np.zeros_like(u)
    painted_panel = np.zeros_like(u)
    painted_scratch = np.zeros_like(u)
    painted_seam = np.zeros_like(u)

    if pattern == "painted_panels":
        # Geometry owns panel breaks. The texture supplies sprayed-paint waviness, orange peel,
        # bounded handling strokes, and sparse recess dust without projecting a UV-space grid.
        broad = manufacturing_spectral_noise(u, v, seed + 211, (1, 5), (1, 4), 11)
        broad_secondary = manufacturing_spectral_noise(u, v, seed + 263, (4, 13), (3, 9), 13)
        peel_a = tileable_value_noise(u, v, seed + 307, 83)
        peel_b = tileable_value_noise(u, v, seed + 401, 173)
        painted_peel = (peel_a - 0.5) * 0.68 + (peel_b - 0.5) * 0.32
        painted_panel = manufacturing_spectral_noise(u, v, seed + 449, (2, 8), (2, 6), 10) - 0.5
        dust_field = manufacturing_spectral_noise(u, v, seed + 467, (7, 19), (5, 15), 12)
        painted_seam = np.clip((0.235 - dust_field) * 5.2, 0.0, 1.0) * 0.12
        painted_scratch = bounded_handling_scratches(u, v, seed) * np.clip((mid - 0.55) * 2.4, 0.0, 1.0)
        contact = painted_seam * np.clip((0.44 - broad_secondary) * 1.9, 0.0, 1.0)
        painted_wear = contact + painted_scratch * 0.34
        feature = painted_peel * 0.20 - painted_scratch * 0.075 - painted_seam * 0.025
        grime = painted_seam * 0.22 + contact * 0.08
        rough_bias = ((broad - 0.5) * 0.13 + (broad_secondary - 0.5) * 0.07
                      + painted_panel * 0.12 + painted_peel * 0.13
                      + painted_scratch * 0.19 + painted_seam * 0.12)
    elif pattern == "integrated_stencil":
        broad = manufacturing_spectral_noise(u, v, seed + 211, (1, 5), (1, 4), 11)
        peel_a = tileable_value_noise(u, v, seed + 307, 83)
        peel_b = tileable_value_noise(u, v, seed + 401, 173)
        painted_peel = (peel_a - 0.5) * 0.68 + (peel_b - 0.5) * 0.32
        feature = painted_peel * 0.13
        rough_bias = (broad - 0.5) * 0.1 + painted_peel * 0.1
    elif pattern == "composite_laminate":
        tow = manufacturing_spectral_noise(u, v, seed + 541, (117, 181), (7, 23), 14) - 0.5
        sub_tow = manufacturing_spectral_noise(u, v, seed + 557, (53, 103), (5, 17), 12) - 0.5
        resin = manufacturing_spectral_noise(u, v, seed + 571, (5, 17), (3, 11), 10) - 0.5
        feature += tow * 0.31 + sub_tow * 0.13 + resin * 0.07
        rough_bias = tow * 0.105 + sub_tow * 0.045 + resin * 0.08
    elif pattern == "brushed_alloy":
        brush = manufacturing_spectral_noise(u, v, seed + 587, (149, 211), (5, 17), 14) - 0.5
        rolling = manufacturing_spectral_noise(u, v, seed + 593, (23, 41), (3, 9), 10) - 0.5
        feature += brush * 0.21 + rolling * 0.065
        rough_bias = brush * 0.12 + rolling * 0.055
    elif pattern == "worn_marking":
        chip = ((mid > 0.86) & (macro < 0.56)).astype(np.float32)
        feature += (micro - 0.5) * 0.13 - chip * 0.31
        grime = chip * 0.58
    elif pattern == "glass_laminate":
        feature += np.sin((u * 9.0 + v * 4.0) * math.tau) * 0.014 + (macro - 0.5) * 0.018
        rough_bias = -0.085 + mid * 0.035
    elif pattern == "powered_aperture":
        bands = 0.71 + np.sin((u * 5.0 + macro * 0.38) * math.tau) * 0.17
        emissive = np.clip(bands * (0.75 + mid * 0.25), 0.0, 1.0)
        feature += np.sin(v * math.tau * 17.0) * 0.075
        rough_bias = -0.1 + np.zeros_like(u)
    elif pattern == "thermal_bands":
        temper_drift = manufacturing_spectral_noise(u, v, seed + 613, (5, 15), (1, 5), 11) - 0.5
        axial_score = manufacturing_spectral_noise(u, v, seed + 617, (113, 173), (5, 15), 13) - 0.5
        feature += temper_drift * 0.34 + axial_score * 0.19
        rough_bias = temper_drift * 0.24 + axial_score * 0.09
        grime = np.clip((0.25 - manufacturing_spectral_noise(u, v, seed + 619, (9, 21), (3, 9), 10)) * 4.0, 0.0, 1.0) * 0.34
    elif pattern == "radiator_channels":
        laminate = manufacturing_spectral_noise(u, v, seed + 631, (67, 109), (7, 19), 13) - 0.5
        thermal_drift = manufacturing_spectral_noise(u, v, seed + 641, (5, 15), (3, 9), 10) - 0.5
        feature += laminate * 0.39 + thermal_drift * 0.12
        grime = np.clip((0.2 - manufacturing_spectral_noise(u, v, seed + 643, (11, 23), (5, 13), 10)) * 4.6, 0.0, 1.0) * 0.31
        rough_bias = laminate * 0.14 + thermal_drift * 0.18 + grime * 0.08
    elif pattern == "machinery_channels":
        machining = manufacturing_spectral_noise(u, v, seed + 647, (53, 89), (7, 19), 13) - 0.5
        recess_field = manufacturing_spectral_noise(u, v, seed + 653, (5, 13), (3, 11), 10)
        grime = np.clip((0.31 - recess_field) * 3.8, 0.0, 1.0) * 0.46
        feature += machining * 0.34 - grime * 0.24
        rough_bias = machining * 0.12 + grime * 0.2

    base = np.asarray(profile["baseRgb"], dtype=np.float32)
    secondary = np.asarray(profile["secondaryRgb"], dtype=np.float32)
    if pattern in ("painted_panels", "integrated_stencil"):
        broad = manufacturing_spectral_noise(u, v, seed + 211, (1, 5), (1, 4), 11)
        panel_term = painted_panel * 0.16 if pattern == "painted_panels" else 0.0
        blend = np.clip(0.5 + (broad - 0.5) * 0.34 + (macro - 0.5) * 0.09 + panel_term, 0.25, 0.75)[..., None]
    else:
        blend = np.clip(0.16 + macro * 0.52 + mid * 0.21, 0.0, 1.0)[..., None]
    color = base + (secondary - base) * blend
    if pattern == "thermal_bands":
        temper = manufacturing_spectral_noise(u, v, seed + 659, (4, 12), (1, 5), 11)
        color[..., 0] += temper * 0.12
        color[..., 1] -= temper * 0.035
        color[..., 2] += temper * 0.045
    color *= (1.0 - grime[..., None] * 0.27)
    if pattern == "worn_marking":
        color *= np.where((grime > 0.4)[..., None], 0.34, 1.0)
    if pattern == "painted_panels":
        color *= (1.0 - painted_seam[..., None] * 0.075 - painted_wear[..., None] * 0.045)
        exposed = np.asarray([0.21, 0.235, 0.245], dtype=np.float32)
        wear_mix = np.clip(painted_scratch * 0.18 + painted_wear * 0.08, 0.0, 0.22)[..., None]
        color = color * (1.0 - wear_mix) + exposed * wear_mix
    color = np.clip(color, 0.0, 1.0)

    rough_min, rough_max = profile["roughnessRange"]
    metal_min, metal_max = profile["metallicRange"]
    ao_min, ao_max = profile["aoRange"]
    if pattern in ("painted_panels", "integrated_stencil"):
        rough_mix = np.clip(0.5 + rough_bias, 0.12, 0.9)
    else:
        rough_mix = np.clip(0.1 + macro * 0.38 + mid * 0.31 + micro * 0.18 + rough_bias + grime * 0.18, 0.0, 1.0)
    metal_mix = np.clip(0.2 + mid * 0.62 + grime * 0.09, 0.0, 1.0)
    ao_mix = np.clip(0.35 + macro * 0.4 + mid * 0.24 - grime * 0.4, 0.0, 1.0)
    roughness = rough_min + (rough_max - rough_min) * rough_mix
    metallic = metal_min + (metal_max - metal_min) * metal_mix
    ao = ao_min + (ao_max - ao_min) * ao_mix
    if pattern == "painted_panels":
        height = (painted_peel * 0.22
                  + (manufacturing_spectral_noise(u, v, seed + 503, (2, 8), (2, 6), 10) - 0.5) * 0.032
                  + painted_panel * 0.006
                  - painted_scratch * 0.025
                  - painted_seam * 0.01)
    elif pattern == "integrated_stencil":
        height = painted_peel * 0.18 + (manufacturing_spectral_noise(u, v, seed + 503, (2, 8), (2, 6), 10) - 0.5) * 0.024
    else:
        height = macro * 0.065 + mid * 0.1 + feature * float(profile["normalStrength"])
    dx = np.roll(height, 1, axis=1) - np.roll(height, -1, axis=1)
    dy = np.roll(height, 1, axis=0) - np.roll(height, -1, axis=0)
    strength = float(profile["normalStrength"]) * 6.4
    normal = np.stack((dx * strength, dy * strength, np.ones_like(height)), axis=-1)
    normal /= np.linalg.norm(normal, axis=-1, keepdims=True)
    normal = normal * 0.5 + 0.5
    return {"basecolor": color, "normal": normal, "ao": ao, "roughness": roughness, "metallic": metallic, "emissive": emissive}


def save_image(name: str, path: Path, rgb: np.ndarray, colorspace: str) -> bpy.types.Image:
    height, width = rgb.shape[:2]
    rgba = np.concatenate((rgb.astype(np.float32), np.ones((height, width, 1), dtype=np.float32)), axis=-1)
    image = bpy.data.images.new(name, width=width, height=height, alpha=True, float_buffer=False)
    image.colorspace_settings.name = colorspace
    image.pixels.foreach_set(rgba.ravel())
    image.update()
    image.filepath_raw = str(path)
    image.file_format = "PNG"
    image.save()
    image.pack()
    return image


def generate_role_textures(role: str, profile: dict[str, Any], size: int, texture_dir: Path) -> dict[str, Any]:
    seed = sum((index + 1) * ord(char) for index, char in enumerate(role)) + 63017
    arrays = surface_arrays(role, profile, size, seed)
    receipts: dict[str, Any] = {}
    for channel, colorspace in (("basecolor", "sRGB"), ("normal", "Non-Color")):
        path = texture_dir / f"wasp_fleet_v1_{role}_{channel}.png"
        save_image(f"SF_WASP_FLEET_V1_{role}_{channel}", path, arrays[channel], colorspace)
        receipts[channel] = {"path": str(path), "bytes": path.stat().st_size, "sha256": sha256_file(path)}
    orm = np.stack((arrays["ao"], arrays["roughness"], arrays["metallic"]), axis=-1)
    orm_path = texture_dir / f"wasp_fleet_v1_{role}_orm.png"
    save_image(f"SF_WASP_FLEET_V1_{role}_orm", orm_path, orm, "Non-Color")
    receipts["orm"] = {"path": str(orm_path), "bytes": orm_path.stat().st_size, "sha256": sha256_file(orm_path)}
    if profile.get("emissiveRgb"):
        emissive = arrays["emissive"][..., None] * np.asarray(profile["emissiveRgb"], dtype=np.float32)
        path = texture_dir / f"wasp_fleet_v1_{role}_emissive.png"
        save_image(f"SF_WASP_FLEET_V1_{role}_emissive", path, emissive, "sRGB")
        receipts["emissive"] = {"path": str(path), "bytes": path.stat().st_size, "sha256": sha256_file(path)}
    receipts["stats"] = {
        "roughnessMin": round(float(arrays["roughness"].min()), 5), "roughnessMax": round(float(arrays["roughness"].max()), 5),
        "metallicMin": round(float(arrays["metallic"].min()), 5), "metallicMax": round(float(arrays["metallic"].max()), 5),
        "aoMin": round(float(arrays["ao"].min()), 5), "aoMax": round(float(arrays["ao"].max()), 5),
    }
    return receipts


def load_role_textures(role: str, profile: dict[str, Any], size: int, texture_dir: Path) -> dict[str, Any]:
    receipts = {}
    channels = (("basecolor", "sRGB"), ("normal", "Non-Color"), ("orm", "Non-Color"))
    if profile.get("emissiveRgb"):
        channels += (("emissive", "sRGB"),)
    for channel, colorspace in channels:
        path = texture_dir / f"wasp_fleet_v1_{role}_{channel}.png"
        if not path.is_file():
            raise FileNotFoundError(path)
        image = bpy.data.images.load(str(path), check_existing=False)
        if tuple(image.size) != (size, size):
            raise RuntimeError(f"texture resolution drift: {path}")
        image.name = f"SF_WASP_FLEET_V1_{role}_{channel}"
        image.colorspace_settings.name = colorspace
        image.pack()
        receipts[channel] = {"path": str(path), "bytes": path.stat().st_size, "sha256": sha256_file(path)}
    receipts["reused"] = True
    return receipts


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
    name = ROLE_TO_MATERIAL[role]
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    material.use_backface_culling = True
    material.diffuse_color = (*profile["baseRgb"], 1.0)
    material["spacefaceRole"] = role
    material["spacefaceMaterialRole"] = role
    material["spacefaceSurfaceRecipe"] = RECIPE_ID
    material["spacefaceRoughnessRange"] = profile["roughnessRange"]
    material["spacefaceMetallicRange"] = profile["metallicRange"]
    material["spacefacePattern"] = profile["pattern"]
    nodes, links = material.node_tree.nodes, material.node_tree.links
    nodes.clear()
    output = nodes.new("ShaderNodeOutputMaterial")
    shader = nodes.new("ShaderNodeBsdfPrincipled")
    links.new(shader.outputs["BSDF"], output.inputs["Surface"])
    set_socket(shader, (*profile["baseRgb"], 1.0), "Base Color")
    set_socket(shader, sum(profile["roughnessRange"]) * 0.5, "Roughness")
    set_socket(shader, sum(profile["metallicRange"]) * 0.5, "Metallic")
    set_socket(shader, float(profile.get("coatWeight", 0.0)), "Coat Weight", "Clearcoat")
    set_socket(shader, float(profile.get("coatRoughness", 0.35)), "Coat Roughness", "Clearcoat Roughness")
    set_socket(shader, float(profile.get("anisotropy", 0.0)), "Anisotropic IOR Level", "Anisotropic")
    base = nodes.new("ShaderNodeTexImage")
    base.image = bpy.data.images[f"SF_WASP_FLEET_V1_{role}_basecolor"]
    links.new(base.outputs["Color"], input_socket(shader, "Base Color"))
    orm = nodes.new("ShaderNodeTexImage")
    orm.image = bpy.data.images[f"SF_WASP_FLEET_V1_{role}_orm"]
    separate = nodes.new("ShaderNodeSeparateColor")
    links.new(orm.outputs["Color"], separate.inputs["Color"])
    links.new(separate.outputs["Green"], input_socket(shader, "Roughness"))
    links.new(separate.outputs["Blue"], input_socket(shader, "Metallic"))
    gltf_group = bpy.data.node_groups.get("glTF Material Output") or bpy.data.node_groups.new("glTF Material Output", "ShaderNodeTree")
    ensure_group_input(gltf_group, "Occlusion")
    gltf_output = nodes.new("ShaderNodeGroup")
    gltf_output.node_tree = gltf_group
    links.new(separate.outputs["Red"], gltf_output.inputs["Occlusion"])
    normal = nodes.new("ShaderNodeTexImage")
    normal.image = bpy.data.images[f"SF_WASP_FLEET_V1_{role}_normal"]
    normal_map = nodes.new("ShaderNodeNormalMap")
    normal_map.inputs["Strength"].default_value = float(profile["normalStrength"])
    links.new(normal.outputs["Color"], normal_map.inputs["Color"])
    links.new(normal_map.outputs["Normal"], input_socket(shader, "Normal"))
    if profile.get("emissiveRgb"):
        emissive = nodes.new("ShaderNodeTexImage")
        emissive.image = bpy.data.images[f"SF_WASP_FLEET_V1_{role}_emissive"]
        links.new(emissive.outputs["Color"], input_socket(shader, "Emission Color", "Emission"))
        set_socket(shader, float(profile.get("emissiveStrength", 1.0)), "Emission Strength")
    return material


def apply_transform(obj: bpy.types.Object) -> None:
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)


def unwrap_metric(obj: bpy.types.Object, cube_size: float = 2.1) -> None:
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.cube_project(cube_size=cube_size, correct_aspect=True, scale_to_bounds=False)
    bpy.ops.object.mode_set(mode="OBJECT")


def finish_mesh(obj: bpy.types.Object, name: str, material: bpy.types.Material, root: bpy.types.Object, bevel: float) -> bpy.types.Object:
    obj.name = name
    target_collection = root.users_collection[0]
    for current in list(obj.users_collection):
        current.objects.unlink(obj)
    target_collection.objects.link(obj)
    apply_transform(obj)
    if bevel > 0:
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
    obj.parent = root
    return obj


def add_box(name: str, location: Sequence[float], size: Sequence[float], material: bpy.types.Material, root: bpy.types.Object, rotation=(0, 0, 0), bevel=0.035):
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=location, rotation=rotation)
    obj = bpy.context.object
    obj.dimensions = size
    return finish_mesh(obj, name, material, root, bevel)


def add_marking_strokes(
    name: str,
    location: Sequence[float],
    size: Sequence[float],
    text: str,
    material: bpy.types.Material,
    root: bpy.types.Object,
) -> list[bpy.types.Object]:
    """Build a flush, mask-only stencil with no rectangular carrier outside the glyphs.

    Each vector stroke is embedded into the verified planar hull surface. The warning PBR role is
    therefore present only where ink exists: there is no transparent card, unmatched UV sample, or
    plate rectangle to catch a highlight. World-X is reversed to preserve the established starboard
    inspection reading direction.
    """
    width, height, thickness = (float(value) for value in size)
    advance = width / max(len(text), 1)
    glyph_width = advance * 0.72
    glyph_height = height * 0.82
    stroke_width = max(0.02, height * 0.095)
    strokes: list[bpy.types.Object] = []
    for glyph_index, char in enumerate(text):
        glyph = VECTOR_FONT_STROKES.get(char)
        if glyph is None:
            continue
        glyph_center_x = location[0] - width * 0.5 + advance * (glyph_index + 0.5)
        for stroke_index, ((ax, ay), (bx, by)) in enumerate(glyph):
            start_x = glyph_center_x + (ax - 0.5) * glyph_width
            end_x = glyph_center_x + (bx - 0.5) * glyph_width
            start_y = location[1] + (0.5 - ay) * glyph_height
            end_y = location[1] + (0.5 - by) * glyph_height
            delta_x, delta_y = end_x - start_x, end_y - start_y
            length = math.hypot(delta_x, delta_y)
            segment = add_box(
                f"{name}_{glyph_index:02d}_{stroke_index:02d}",
                ((start_x + end_x) * 0.5, (start_y + end_y) * 0.5, location[2]),
                (length + stroke_width * 0.42, stroke_width, thickness),
                material,
                root,
                rotation=(0, 0, math.atan2(delta_y, delta_x)),
                bevel=min(0.0025, stroke_width * 0.12),
            )
            segment["spacefaceMarkingText"] = text
            segment["spacefaceMarkingCarrier"] = "none_mask_only_vector_strokes"
            strokes.append(segment)
    return strokes


def add_cylinder(name: str, location: Sequence[float], radius: float, depth: float, material: bpy.types.Material, root: bpy.types.Object, axis="X", vertices=24, bevel=0.022):
    rotation = (0, math.pi * 0.5, 0) if axis == "X" else (math.pi * 0.5, 0, 0) if axis == "Y" else (0, 0, 0)
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=location, rotation=rotation)
    return finish_mesh(bpy.context.object, name, material, root, min(bevel, radius * 0.18))


def add_tapered_plate(name: str, location: Sequence[float], length: float, aft_width: float, forward_width: float, thickness: float, material: bpy.types.Material, root: bpy.types.Object, bevel=0.035):
    half_l, half_t = length * 0.5, thickness * 0.5
    aft, forward = aft_width * 0.5, forward_width * 0.5
    verts = [
        (-half_l, -aft, -half_t), (-half_l, aft, -half_t), (half_l, -forward, -half_t), (half_l, forward, -half_t),
        (-half_l, -aft, half_t), (-half_l, aft, half_t), (half_l, -forward, half_t), (half_l, forward, half_t),
    ]
    faces = [(0, 2, 3, 1), (4, 5, 7, 6), (0, 1, 5, 4), (2, 6, 7, 3), (0, 4, 6, 2), (1, 3, 7, 5)]
    mesh = bpy.data.meshes.new(f"{name}_MESH")
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    obj.location = location
    return finish_mesh(obj, name, material, root, bevel)


def add_torus(name: str, location: Sequence[float], major_radius: float, minor_radius: float, material: bpy.types.Material, root: bpy.types.Object, major_segments=32, minor_segments=8):
    bpy.ops.mesh.primitive_torus_add(major_radius=major_radius, minor_radius=minor_radius, major_segments=major_segments, minor_segments=minor_segments, location=location, rotation=(0, math.pi * 0.5, 0))
    return finish_mesh(bpy.context.object, name, material, root, 0.0)


def remove_old_thruster(collection: bpy.types.Collection) -> None:
    for obj in list(collection.objects):
        if obj.type == "MESH" and obj.name.startswith("LOD") and "Thruster" in obj.name:
            bpy.data.objects.remove(obj, do_unlink=True)


def remove_inherited_accent(lod: int, collection: bpy.types.Collection) -> None:
    """Replace long donor cyan ribbons with bounded inspection/power-system segments."""
    for obj in list(collection.objects):
        if obj.type == "MESH" and obj.name.startswith(f"LOD{lod}_Accent"):
            bpy.data.objects.remove(obj, do_unlink=True)


def remap_inherited_warning_panels(collection: bpy.types.Collection, hull_material: bpy.types.Material) -> int:
    """Reserve the warning draw for mask-only ink; donor plates return to coated hull paint."""
    remapped = 0
    for obj in collection.objects:
        if obj.type != "MESH" or not obj.data.materials:
            continue
        if obj.data.materials[0].name != "Material_Warning":
            continue
        obj.data.materials[0] = hull_material
        obj["spacefaceInheritedWarningRemap"] = "coated_armor_before_vector_ink"
        remapped += 1
    return remapped


def remove_lod0_stick_greeble(collection: bpy.types.Collection) -> None:
    """Replace the inherited all-in-one mechanical draw with fewer rooted functional assemblies.

    The accepted source merged its keel, engine rings, gun housings, vents, panel seam rods, antenna
    base, and RCS into one material object. At close/default cameras the thin seam rods read as
    decoration laid on top of the ship. LOD0 deliberately rebuilds the required mechanical functions
    after removing that merged object; LOD1/2 keep the lighter source group.
    """
    for obj in list(collection.objects):
        if obj.type == "MESH" and obj.name.startswith("LOD0_Mechanical"):
            bpy.data.objects.remove(obj, do_unlink=True)


def remove_armor_slivers(lod: int, collection: bpy.types.Collection) -> int:
    """Delete disconnected armor islands whose two minor dimensions prove they are card/needle detail."""
    source = next((obj for obj in collection.objects if obj.type == "MESH" and obj.name.startswith(f"LOD{lod}_Armor")), None)
    if source is None:
        return 0
    bpy.ops.object.select_all(action="DESELECT")
    source.select_set(True)
    bpy.context.view_layer.objects.active = source
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.mesh.separate(type="LOOSE")
    bpy.ops.object.mode_set(mode="OBJECT")
    parts = [obj for obj in bpy.context.selected_objects if obj.type == "MESH"]
    removed = 0
    for part in parts:
        dimensions = sorted(float(value) for value in part.dimensions)
        if dimensions[0] * dimensions[1] < 0.022 and dimensions[2] > 0.45:
            bpy.data.objects.remove(part, do_unlink=True)
            removed += 1
    if not any(obj.type == "MESH" and obj.name.startswith(f"LOD{lod}_Armor") for obj in collection.objects):
        raise RuntimeError(f"armor sliver cleanup removed the entire LOD{lod} armor substrate")
    return removed


def separate_source_material_islands(lod: int, collection: bpy.types.Collection) -> None:
    """Undo the immutable donor's bulk per-material join so final ordering can be canonical."""
    for obj in list(collection.objects):
        if obj.type != "MESH" or obj.get("collision") or not obj.name.startswith(f"LOD{lod}_") or "Armor" in obj.name:
            continue
        bpy.ops.object.select_all(action="DESELECT")
        obj.select_set(True)
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.mode_set(mode="EDIT")
        bpy.ops.mesh.select_all(action="SELECT")
        bpy.ops.mesh.separate(type="LOOSE")
        bpy.ops.object.mode_set(mode="OBJECT")


def stable_mesh_key(obj: bpy.types.Object) -> tuple[Any, ...]:
    corners = [obj.matrix_world @ Vector(corner) for corner in obj.bound_box]
    minimum = tuple(round(min(corner[axis] for corner in corners), 6) for axis in range(3))
    maximum = tuple(round(max(corner[axis] for corner in corners), 6) for axis in range(3))
    return minimum + maximum + (len(obj.data.vertices), len(obj.data.polygons), obj.name)


def join_meshes_in_order(members: list[bpy.types.Object]) -> bpy.types.Object:
    ordered = sorted(members, key=stable_mesh_key)
    active = ordered[0]
    for member in ordered[1:]:
        bpy.ops.object.select_all(action="DESELECT")
        active.select_set(True)
        member.select_set(True)
        bpy.context.view_layer.objects.active = active
        bpy.ops.object.join()
    return active


def rebuild_semantic_normals(obj: bpy.types.Object, material_name: str) -> None:
    """Clear inherited split normals and restore continuous plate/fillet shading by role.

    The donor and final triangulation can both carry sharp flags through visually continuous armor.
    Re-evaluating every manifold edge after triangulation clears those internal splits while keeping
    open panel boundaries and genuinely hard construction breaks. This deliberately avoids a global
    weighted-normal pass, which previously printed large triangle facets into grazing highlights.
    """
    thresholds = {
        "Material_Hull": 38.0,
        "Material_Armor": 35.0,
        "Material_Mechanical": 32.0,
        "Material_Accent": 34.0,
        "Material_Warning": 38.0,
        "Material_Canopy": 40.0,
        "Material_Thruster": 34.0,
        "Material_HeatMetal": 32.0,
        "Material_Radiator": 30.0,
        "Material_Recessed": 30.0,
    }
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    try:
        bpy.ops.object.mode_set(mode="EDIT")
        bpy.ops.mesh.select_all(action="SELECT")
        bpy.ops.mesh.customdata_custom_splitnormals_clear()
    except (RuntimeError, AttributeError):
        # Blender may report no custom layer on generated-only meshes; their edge flags still need
        # the same semantic rebuild below.
        pass
    finally:
        if obj.mode != "OBJECT":
            bpy.ops.object.mode_set(mode="OBJECT")

    threshold = math.radians(thresholds.get(material_name, 32.0))
    mesh = obj.data
    bm = bmesh.new()
    bm.from_mesh(mesh)
    for face in bm.faces:
        face.smooth = True
    for edge in bm.edges:
        if len(edge.link_faces) != 2:
            edge.smooth = False
            continue
        edge.smooth = edge.calc_face_angle(0.0) <= threshold
    bm.to_mesh(mesh)
    bm.free()
    mesh.update()
    obj["spacefaceNormalPolicy"] = "selective_angle_rebuild_after_triangulation"
    obj["spacefaceNormalAngleDegrees"] = thresholds.get(material_name, 32.0)


def enhance_lod(lod: int, collection: bpy.types.Collection, materials: dict[str, bpy.types.Material]) -> None:
    root = next(obj for obj in collection.objects if obj.type == "EMPTY" and obj.name.endswith("_ROOT"))
    remove_old_thruster(collection)
    remove_inherited_accent(lod, collection)
    if lod == 0:
        remove_lod0_stick_greeble(collection)
    separate_source_material_islands(lod, collection)
    hull, armor = materials["coated_armor"], materials["dark_composite"]
    remapped_warning_panels = remap_inherited_warning_panels(collection, hull)
    removed_slivers = remove_armor_slivers(lod, collection)
    alloy, cyan = materials["structural_alloy"], materials["identity_cyan"]
    warning, heat = materials["service_marking"], materials["heat_alloy"]
    radiator, recessed = materials["radiator_laminate"], materials["recessed_machinery"]
    aperture = materials["drive_aperture"]
    created: list[bpy.types.Object] = []

    if lod == 0:
        # Rebuilt functional skeleton: broad keel, rooted gun sleeves/intakes, RCS, and antenna foot.
        created += [
            add_tapered_plate("WASP_GOLDEN_LOD0_VentralStructuralKeel", (-1.0, 0, -1.21), 14.2, 2.4, 0.62, 0.34, alloy, root, 0.065),
            add_box("WASP_GOLDEN_LOD0_DorsalAntennaFoot", (-1.0, 0, 1.55), (0.86, 0.76, 0.2), alloy, root, bevel=0.045),
            add_box("WASP_GOLDEN_LOD0_DorsalHeatVane", (-1.15, 0, 1.76), (0.72, 0.22, 0.28), heat, root, rotation=(0, -0.24, 0), bevel=0.055),
        ]
        for sign, side in ((-1, "PORT"), (1, "STARBOARD")):
            created += [
                add_cylinder(f"WASP_GOLDEN_LOD0_{side}_GunStructuralSleeve", (4.62, 4.0 * sign, 0.2), 0.35, 2.15, recessed, root, "X", 24, 0.035),
                add_tapered_plate(f"WASP_GOLDEN_LOD0_{side}_IntakeWell", (0.15, 2.55 * sign, 0.77), 3.35, 1.34, 0.56, 0.11, recessed, root, 0.028),
                add_cylinder(f"WASP_GOLDEN_LOD0_{side}_RCSBody", (-1.7, 7.0 * sign, 0.0), 0.21, 0.36, alloy, root, "Y", 18, 0.018),
            ]

    if lod <= 1:
        created.append(add_box(
            f"WASP_GOLDEN_LOD{lod}_CanopyServiceSpine", (4.35, 0, 1.5),
            (2.4, 0.22, 0.14), armor, root, rotation=(0, -0.075, 0), bevel=0.045,
        ))

    # Layered nose shoulders turn a broad slab into a maintained armor assembly.
    created += [
        add_tapered_plate(f"WASP_GOLDEN_LOD{lod}_NoseCheek", (6.2, 0, 0.92), 5.6, 3.55, 0.72, 0.18 if lod < 2 else 0.15, hull, root, 0.065),
        add_tapered_plate(f"WASP_GOLDEN_LOD{lod}_NoseCompositeUnderlay", (5.7, 0, 0.82), 4.4, 3.8, 1.2, 0.12, armor, root, 0.045),
        add_box(f"WASP_GOLDEN_LOD{lod}_WeaponRootSpine", (4.7, 0, 1.12), (2.2, 0.8, 0.24), recessed, root, bevel=0.055),
        add_box(f"WASP_GOLDEN_LOD{lod}_CenterAccessWell", (1.7, 0, 1.16), (1.8, 0.92, 0.07), recessed, root, bevel=0.028),
        add_box(f"WASP_GOLDEN_LOD{lod}_CenterMaintenanceCover", (1.7, 0, 1.225), (1.52, 0.68, 0.075), hull, root, bevel=0.035),
    ]
    for sign, side in ((-1, "PORT"), (1, "STARBOARD")):
        created += [
            add_tapered_plate(f"WASP_GOLDEN_LOD{lod}_{side}_NosePlateUnderstep", (6.5, 1.05 * sign, 1.02), 2.65, 0.98, 0.42, 0.07, armor, root, 0.028),
            add_tapered_plate(f"WASP_GOLDEN_LOD{lod}_{side}_NosePlateOverlay", (6.58, 1.05 * sign, 1.085), 2.3, 0.78, 0.34, 0.075, hull, root, 0.035),
        ]
    created += add_marking_strokes(
        f"WASP_GOLDEN_LOD{lod}_ManufacturerSerialInk", (-4.5, 7.0, 0.4205),
        (1.72 if lod < 2 else 1.42, 0.34 if lod < 2 else 0.3, 0.003),
        "FPW-W17", warning, root,
    )
    for sign, side in ((-1, "PORT"), (1, "STARBOARD")):
        y = 5.55 * sign
        # The former emissive rear disc becomes a recessed, heat-surrounded drive aperture.
        created += [
            add_torus(f"WASP_GOLDEN_LOD{lod}_{side}_DriveHeatLip", (-9.69, y, 0), 0.67, 0.10 if lod == 0 else 0.085, heat, root, 32 if lod == 0 else 20, 10 if lod == 0 else 6),
            add_cylinder(f"WASP_GOLDEN_LOD{lod}_{side}_DriveWell", (-9.775, y, 0), 0.58, 0.105, recessed, root, "X", 32 if lod == 0 else 20, 0.008),
            add_cylinder(f"WASP_GOLDEN_LOD{lod}_{side}_DriveAperture", (-9.835, y, 0), 0.35 if lod < 2 else 0.29, 0.018, aperture, root, "X", 28 if lod == 0 else 16, 0.002),
            add_cylinder(f"WASP_GOLDEN_LOD{lod}_{side}_ThermalCollar", (-8.72, y, 0), 0.94, 0.32, heat, root, "X", 32 if lod == 0 else 18, 0.025),
            add_torus(f"WASP_GOLDEN_LOD{lod}_{side}_CeramicClampA", (-9.34, y, 0), 0.74, 0.055, armor, root, 28 if lod == 0 else 18, 8 if lod == 0 else 5),
            add_torus(f"WASP_GOLDEN_LOD{lod}_{side}_HeatClampB", (-8.96, y, 0), 0.82, 0.065, heat, root, 28 if lod == 0 else 18, 8 if lod == 0 else 5),
            add_box(f"WASP_GOLDEN_LOD{lod}_{side}_CeramicShroudTop", (-9.15, y, 0.64), (1.25, 1.05, 0.14), armor, root, bevel=0.045),
            add_box(f"WASP_GOLDEN_LOD{lod}_{side}_CeramicShroudBottom", (-9.15, y, -0.64), (1.25, 1.05, 0.14), armor, root, bevel=0.045),
            add_box(f"WASP_GOLDEN_LOD{lod}_{side}_CeramicShroudInboard", (-9.15, y - 0.58 * sign, 0), (1.25, 0.14, 0.78), armor, root, bevel=0.045),
            add_box(f"WASP_GOLDEN_LOD{lod}_{side}_CeramicShroudOutboard", (-9.15, y + 0.58 * sign, 0), (1.25, 0.14, 0.78), armor, root, bevel=0.045),
            add_tapered_plate(f"WASP_GOLDEN_LOD{lod}_{side}_WingRadiator", (-1.7, 4.7 * sign, 0.77), 4.9, 1.55, 0.92, 0.075, radiator, root, 0.018),
            add_box(f"WASP_GOLDEN_LOD{lod}_{side}_GunRootBay", (3.3, 4.0 * sign, 0.42), (1.15, 1.05, 0.42), recessed, root, bevel=0.07),
            add_cylinder(f"WASP_GOLDEN_LOD{lod}_{side}_GunTrunnion", (3.72, 4.0 * sign, 0.2), 0.58, 0.42, alloy, root, "X", 24 if lod == 0 else 16, 0.035),
            add_torus(f"WASP_GOLDEN_LOD{lod}_{side}_GunRootClamp", (4.1, 4.0 * sign, 0.2), 0.46, 0.052, heat, root, 24 if lod == 0 else 16, 7 if lod == 0 else 5),
            add_box(f"WASP_GOLDEN_LOD{lod}_{side}_GunFeedBlock", (3.65, 4.0 * sign, 0.74), (0.72, 0.78, 0.22), recessed, root, bevel=0.045),
            add_box(f"WASP_GOLDEN_LOD{lod}_{side}_NacelleAccess", (-3.15, y, 1.17), (2.25, 1.35, 0.11), armor, root, bevel=0.035),
            add_box(f"WASP_GOLDEN_LOD{lod}_{side}_NacelleServiceRecess", (-3.2, y, 1.245), (1.1, 0.76, 0.035), recessed, root, bevel=0.012),
            add_box(f"WASP_GOLDEN_LOD{lod}_{side}_NacelleArmorStep", (-0.25, y, 1.2), (1.7, 1.18, 0.1), hull, root, bevel=0.045),
            add_box(f"WASP_GOLDEN_LOD{lod}_{side}_PowerIndexA", (-4.65, 6.13 * sign, 1.02), (0.72, 0.16, 0.09), cyan, root, bevel=0.022),
            add_box(f"WASP_GOLDEN_LOD{lod}_{side}_PowerIndexB", (-1.35, 6.13 * sign, 0.93), (0.62, 0.16, 0.09), cyan, root, bevel=0.022),
            add_box(f"WASP_GOLDEN_LOD{lod}_{side}_PowerIndexC", (1.15, 5.55 * sign, 0.98), (0.5, 0.14, 0.08), cyan, root, bevel=0.02),
        ]
        if sign > 0:
            created += add_marking_strokes(
                f"WASP_GOLDEN_LOD{lod}_STARBOARD_ServiceHistoryInk", (-1.0, 7.0, 0.4205),
                (1.5 if lod < 2 else 1.25, 0.34 if lod < 2 else 0.3, 0.003),
                "SV09-R3", warning, root,
            )
        if lod <= 1:
            for index, x in enumerate((-5.8, -4.8, -3.8, -2.8, -1.8, -0.8)):
                created.append(add_box(f"WASP_GOLDEN_LOD{lod}_{side}_RadiatorRib_{index}", (x, 4.72 * sign, 0.835), (0.14, 1.12, 0.075), alloy, root, bevel=0.018))
            for index, x in enumerate((-6.9, -5.7, -4.5, -3.3)):
                created.append(add_box(f"WASP_GOLDEN_LOD{lod}_{side}_ThermalServiceClamp_{index}", (x, y, 1.07), (0.26, 1.32, 0.11), heat, root, bevel=0.028))
        if lod == 0:
            # Engine architecture is resolved as an injector/actuator assembly inside segmented
            # ceramic shielding. These parts remain dark without a plume and read as maintainable
            # propulsion hardware rather than a pair of generic cylinders.
            created += [
                add_torus(f"WASP_GOLDEN_LOD0_{side}_InjectorRing", (-9.66, y, 0), 0.46, 0.045, alloy, root, 32, 8),
                add_torus(f"WASP_GOLDEN_LOD0_{side}_InjectorHeatSeal", (-9.54, y, 0), 0.56, 0.035, heat, root, 32, 8),
                add_box(f"WASP_GOLDEN_LOD0_{side}_UpperActuatorBridge", (-9.12, y, 0.46), (0.74, 0.62, 0.10), alloy, root, bevel=0.022),
                add_box(f"WASP_GOLDEN_LOD0_{side}_LowerActuatorBridge", (-9.12, y, -0.46), (0.74, 0.62, 0.10), alloy, root, bevel=0.022),
            ]
            for actuator_index, (lateral, vertical) in enumerate(((-0.43, 0.0), (0.43, 0.0), (0.0, -0.43), (0.0, 0.43))):
                created += [
                    add_cylinder(
                        f"WASP_GOLDEN_LOD0_{side}_InjectorActuator_{actuator_index}",
                        (-9.12, y + lateral, vertical), 0.052, 0.68, alloy, root, "X", 12, 0.008,
                    ),
                    add_cylinder(
                        f"WASP_GOLDEN_LOD0_{side}_InjectorActuatorCap_{actuator_index}",
                        (-9.48, y + lateral, vertical), 0.083, 0.08, heat, root, "X", 12, 0.008,
                    ),
                ]
            for fastener_index, fastener_x in enumerate((-9.48, -9.05)):
                for lateral_index, lateral in enumerate((-0.34, 0.34)):
                    created.append(add_cylinder(
                        f"WASP_GOLDEN_LOD0_{side}_EngineClampFastener_{fastener_index}_{lateral_index}",
                        (fastener_x, y + lateral, 0.735), 0.045, 0.028, alloy, root, "Z", 10, 0.004,
                    ))
            for index, x in enumerate((-3.95, -3.4, -2.85, -2.3)):
                created.append(add_box(f"WASP_GOLDEN_LOD0_{side}_AccessVent_{index}", (x, y, 1.27), (0.28, 0.72, 0.045), recessed, root, bevel=0.008))
            for fastener_index, (x, lateral) in enumerate(((-3.65, -0.3), (-3.65, 0.3), (-2.75, -0.3), (-2.75, 0.3))):
                created.append(add_cylinder(
                    f"WASP_GOLDEN_LOD0_{side}_ServiceHatchFastener_{fastener_index}",
                    (x, y + lateral, 1.275), 0.042, 0.024, alloy, root, "Z", 10, 0.004,
                ))
            for index, x in enumerate((3.65, 4.05, 4.45)):
                created.append(add_cylinder(f"WASP_GOLDEN_LOD0_{side}_TrunnionFastener_{index}", (x, 4.55 * sign, 0.38), 0.055, 0.035, alloy, root, "Y", 10, 0.005))
    if lod == 0:
        for side in (-1, 1):
            for index, x in enumerate((3.9, 4.9, 5.9, 6.9, 7.9)):
                created.append(add_cylinder(f"WASP_GOLDEN_LOD0_NoseFastener_{side:+}_{index}", (x, side * (1.05 - index * 0.08), 1.08), 0.05, 0.026, alloy, root, "Z", 10, 0.004))

    # Join candidate detail and inherited substrate by semantic material: fixed draw count, no per-frame allocation.
    meshes = [obj for obj in collection.objects if obj.type == "MESH" and not obj.get("collision")]
    groups: dict[str, list[bpy.types.Object]] = {}
    for obj in meshes:
        if not obj.data.materials:
            raise RuntimeError(f"unmaterialed render mesh: {obj.name}")
        groups.setdefault(obj.data.materials[0].name, []).append(obj)
    for material_name, members in sorted(groups.items()):
        result = join_meshes_in_order(members)
        result.name = f"LOD{lod}_{material_name.replace('Material_', '')}"
        result.data.name = result.name
        result.parent = root
        result["spacefaceSurfaceRecipe"] = RECIPE_ID
        result["spacefaceMaterialRole"] = MATERIAL_TO_ROLE[material_name]
        result["spacefaceRemovedArmorSlivers"] = removed_slivers
        result["spacefaceRemappedInheritedWarningPanels"] = remapped_warning_panels
        modifier = result.modifiers.new("SF_ExportTriangulate", "TRIANGULATE")
        modifier.quad_method = "BEAUTY"
        modifier.ngon_method = "BEAUTY"
        bpy.context.view_layer.objects.active = result
        bpy.ops.object.modifier_apply(modifier=modifier.name)
        rebuild_semantic_normals(result, material_name)

    root["spacefaceAsset"]["surfaceRecipe"] = RECIPE_ID
    root["spacefaceAsset"]["manufacturer"] = "Frontier Pursuit Works"
    root["spacefaceAsset"]["family"] = "Needlewing enforcement fighter"
    root["spacefaceAsset"]["factorOnlyMaterials"] = []
    root["spacefaceAsset"]["textureCompression"] = "PNG source; companion KTX2 candidate"
    root["spacefaceAsset"]["wiringStatus"] = "scratch_candidate_no_promote"


def descendants(root: bpy.types.Object) -> list[bpy.types.Object]:
    result = [root]
    for child in root.children:
        result.extend(descendants(child))
    return result


def mesh_triangles(collection: bpy.types.Collection) -> int:
    return sum(sum(max(0, len(poly.vertices) - 2) for poly in obj.data.polygons) for obj in collection.objects if obj.type == "MESH" and not obj.get("collision"))


def render_bounds(collection: bpy.types.Collection) -> tuple[list[float], list[float]]:
    points: list[Vector] = []
    for obj in collection.objects:
        if obj.type == "MESH" and not obj.get("collision"):
            points.extend(obj.matrix_world @ Vector(corner) for corner in obj.bound_box)
    return ([min(point[i] for point in points) for i in range(3)], [max(point[i] for point in points) for i in range(3)])


def export_collection(collection: bpy.types.Collection, lod: int, output: Path) -> None:
    selected = set(collection.all_objects)
    desired = list(getattr(load_base_builder, "required_sockets", []))
    desired = [
        "SOCKET_Weapon_Front", "SOCKET_Mining_Front", "SOCKET_Engine_Main", "SOCKET_Trail_Main",
        "SOCKET_Trail_Port", "SOCKET_Trail_Starboard", "SOCKET_Utility_Dorsal", "SOCKET_Cargo_Ventral",
        "SOCKET_Camera_Focus", "SOCKET_RCS_Port", "SOCKET_RCS_Starboard", "COLLISION_HULL",
    ]
    restore: list[tuple[bpy.types.Object, str]] = []
    for name in desired:
        target = next((obj for obj in selected if obj.name == name or obj.name.startswith(name + ".")), None)
        if target is None:
            raise RuntimeError(f"LOD{lod} missing export semantic {name}")
        for obj in bpy.data.objects:
            if obj not in selected and obj.name == name:
                restore.append((obj, obj.name))
                obj.name = f"{name}__PARKED_FOR_LOD{lod}"
        restore.append((target, target.name))
        target.name = name
    bpy.ops.object.select_all(action="DESELECT")
    for obj in selected:
        obj.hide_viewport = False
        obj.hide_set(False)
        obj.select_set(True)
    kwargs = {
        "filepath": str(output), "export_format": "GLB", "use_selection": True,
        "export_apply": True, "export_yup": True, "export_extras": True,
        "export_animations": False, "export_materials": "EXPORT", "export_texcoords": True,
        "export_normals": True, "export_tangents": True, "export_attributes": True,
        "export_unused_images": False,
    }
    try:
        bpy.ops.export_scene.gltf(**kwargs)
    finally:
        for obj, old_name in reversed(restore):
            obj.name = old_name
        bpy.ops.object.select_all(action="DESELECT")


def main() -> dict[str, Any]:
    args = parse_args()
    spec = json.loads(SPEC_PATH.read_text(encoding="utf-8"))
    if spec.get("recipeId") != RECIPE_ID:
        raise RuntimeError("recipe/spec mismatch")
    input_root, output_dir = Path(args.input_root).resolve(), Path(args.output_dir).resolve()
    guard_paths(input_root, output_dir)
    if args.texture_size < 512 or args.texture_size > 2048 or args.texture_size & (args.texture_size - 1):
        raise RuntimeError("--texture-size must be a power of two from 512 through 2048")
    source_receipts = {}
    for lod, relative in SOURCE_FILES.items():
        path = input_root / relative
        if not path.is_file():
            raise FileNotFoundError(path)
        actual = {"path": str(path), "bytes": path.stat().st_size, "sha256": sha256_file(path)}
        if actual["bytes"] != EXPECTED_SOURCE_BYTES[lod] or actual["sha256"] != EXPECTED_SOURCE_HASHES[lod]:
            raise RuntimeError(f"immutable Wasp LOD{lod} drift: {actual}")
        source_receipts[f"lod{lod}"] = actual
    output_dir.mkdir(parents=True, exist_ok=True)
    texture_dir = output_dir / "textures"
    texture_dir.mkdir(parents=True, exist_ok=True)
    base = load_base_builder(input_root)
    base.reset_scene()
    texture_receipts = {}
    for role in ROLE_ORDER:
        generator = load_role_textures if args.reuse_textures else generate_role_textures
        texture_receipts[role] = generator(role, spec["materialProfiles"][role], args.texture_size, texture_dir)
    materials = {role: create_material(role, spec["materialProfiles"][role]) for role in ROLE_ORDER}
    base_materials = {ROLE_TO_MATERIAL[role]: material for role, material in materials.items()}
    collections = []
    assets = {}
    for lod in (0, 1, 2):
        collection, _base_report = base.build_ship(lod, base_materials)
        enhance_lod(lod, collection, materials)
        output = output_dir / ("wasp_production_v1_golden.glb" if lod == 0 else f"wasp_production_v1_golden_lod{lod}.glb")
        export_collection(collection, lod, output)
        collections.append(collection)
        bounds = render_bounds(collection)
        assets[f"lod{lod}"] = {
            "glb": {"path": str(output), "bytes": output.stat().st_size, "sha256": sha256_file(output)},
            "triangles": mesh_triangles(collection),
            "draws": len({obj.data.materials[0].name for obj in collection.objects if obj.type == "MESH" and not obj.get("collision")}),
            "materials": sorted({obj.data.materials[0].name for obj in collection.objects if obj.type == "MESH" and not obj.get("collision")}),
            "boundsBlender": [[round(value, 6) for value in row] for row in bounds],
        }
    blend = output_dir / "wasp_fleet_hero_golden_v1.blend"
    bpy.ops.wm.save_as_mainfile(filepath=str(blend), check_existing=False, compress=True)
    for lod, relative in SOURCE_FILES.items():
        if sha256_file(input_root / relative) != source_receipts[f"lod{lod}"]["sha256"]:
            raise RuntimeError(f"input changed during build: LOD{lod}")
    report = {
        "schema": "spaceface.goldenWaspFleetHero.blenderRun.v1",
        "recipeId": RECIPE_ID, "status": "scratch_candidate_generated",
        "visualAcceptance": "controller_review_required", "blenderVersion": bpy.app.version_string,
        "inputManifestSha256": spec["inputManifestSha256"], "inputs": source_receipts,
        "candidateBlend": {"path": str(blend), "bytes": blend.stat().st_size, "sha256": sha256_file(blend)},
        "assets": assets, "textures": texture_receipts,
        "contracts": {
            "forward": "+X", "upAfterExport": "+Y", "starboardAfterExport": "+Z", "meters": True,
            "embeddedPlume": False, "semanticMaterials": [ROLE_TO_MATERIAL[role] for role in ROLE_ORDER],
            "requiredSockets": sorted(base.REQUIRED_SOCKETS), "collision": "exact source convex envelope",
        },
        "unresolved": [
            "Matched source/candidate game-camera captures require controller visual review.",
            "KTX2/Meshopt candidates, strict contract checks, and Khronos validation are companion CLI stages.",
            "Canonical assets, manifests, release outputs, locks, runtime maps, mining, and drilling remain untouched.",
        ],
    }
    report_path = output_dir / "blender-run-report.json"
    atomic_json(report_path, report)
    return {"ok": True, "report": str(report_path), "reportSha256": sha256_file(report_path), "lods": 3}


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

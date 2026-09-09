#!/usr/bin/env python3
"""Deterministic PBR maps for PQ-045 Ceres wreck dressing.

Generates basecolor / normal / ORM for the seven material roles used by the
wreck-aftermath author-down. Construction seams stay in geometry; maps carry
material-scale response only.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import sys
from dataclasses import dataclass
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from tools.art.surface_foundry import (  # noqa: E402
    manufactured_field,
    normal_from_height,
    normalized,
    spectral_noise,
)


@dataclass(frozen=True)
class Role:
    base_rgb: tuple[float, float, float]
    roughness: float
    roughness_variation: float
    metallic: float
    normal_strength: float
    albedo_strength: float
    seed: int
    brushed: bool = False
    heat_band: bool = False


# Role names match Material_* textureRole bindings in the Blender author.
ROLES = {
    "wreck_painted_hull": Role((0.210, 0.175, 0.130), 0.62, 0.055, 0.03, 0.12, 0.070, 8101),
    "wreck_armor_dark": Role((0.095, 0.115, 0.128), 0.50, 0.045, 0.32, 0.11, 0.050, 8211, True),
    "wreck_structural_alloy": Role((0.115, 0.140, 0.155), 0.40, 0.040, 0.88, 0.13, 0.055, 8321, True),
    "wreck_rupture_insulation": Role((0.320, 0.275, 0.210), 0.84, 0.050, 0.01, 0.18, 0.080, 8431),
    "wreck_service_trunks": Role((0.040, 0.065, 0.075), 0.62, 0.045, 0.22, 0.10, 0.050, 8541, True),
    "wreck_dead_glass": Role((0.014, 0.028, 0.034), 0.62, 0.030, 0.06, 0.050, 0.030, 8651, True),
    "wreck_heat_affected": Role((0.210, 0.065, 0.030), 0.56, 0.065, 0.68, 0.15, 0.085, 8761, heat_band=True),
}

ROLE_RESOLUTION_SCALE = {
    "wreck_painted_hull": 1.0,
    "wreck_armor_dark": 1.0,
    "wreck_structural_alloy": 1.0,
    "wreck_rupture_insulation": 0.5,
    "wreck_service_trunks": 0.5,
    "wreck_dead_glass": 0.25,
    "wreck_heat_affected": 0.5,
}


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest().upper()


def save_rgb(path: Path, value: np.ndarray) -> None:
    if value.ndim == 2:
        value = np.repeat(value[:, :, None], 3, axis=2)
    encoded = np.clip(value[:, :, :3] * 255.0 + 0.5, 0.0, 255.0).astype(np.uint8)
    Image.fromarray(encoded, "RGB").save(path, optimize=True)


def periodic_lines(size: int, *, count: int, width: float, phase: float = 0.0) -> np.ndarray:
    coordinate = np.arange(size, dtype=np.float32) / size
    distance = np.abs(np.mod(coordinate * count + phase + 0.5, 1.0) - 0.5)
    line = np.exp(-((distance / width) ** 2))
    return np.broadcast_to(line[None, :], (size, size)).copy()


def role_maps(role_name: str, role: Role, size: int) -> dict[str, np.ndarray]:
    macro, detail = manufactured_field(size, size, role.seed, brushed=role.brushed)
    micro = spectral_noise(size, size, role.seed + 83, size / 220.0, anisotropy=0.12 if role.brushed else 1.0)
    broad = spectral_noise(size, size, role.seed + 131, size / 7.5)
    albedo_field = normalized(macro * 0.55 + broad * 0.45)
    rough_field = normalized(detail * 0.62 - broad * 0.25 + micro * 0.13)
    height = normalized(detail * 0.58 + micro * 0.32 + broad * 0.10)
    process = periodic_lines(
        size,
        count=41 if role.brushed else 13,
        width=0.038 if role.brushed else 0.020,
        phase=(role.seed % 29) / 29.0,
    )

    if role.brushed:
        height = normalized(height * 0.76 + process * 0.24)
        rough_field = normalized(rough_field * 0.82 + process * 0.18)
    if role.heat_band:
        heat_band = np.sin(np.linspace(0.0, np.pi * 10.0, size, dtype=np.float32))[:, None]
        albedo_field = normalized(albedo_field * 0.72 + heat_band * 0.28)
        rough_field = normalized(rough_field * 0.68 + heat_band * 0.32)

    base = np.asarray(role.base_rgb, dtype=np.float32)[None, None, :]
    basecolor = np.clip(base * (1.0 + albedo_field[:, :, None] * role.albedo_strength), 0.003, 0.92)
    roughness = np.clip(role.roughness + rough_field * role.roughness_variation, 0.12, 0.96)
    # Metallic is stored as a spatial field with small manufacture variation — never a flat
    # scalar baked as a constant-blue ORM cheat for the whole role.
    metallic_field = np.clip(
        role.metallic + (detail - 0.5) * (0.04 if role.metallic > 0.2 else 0.01),
        0.0,
        1.0,
    ).astype(np.float32)
    ao = np.clip(0.965 - np.maximum(0.0, detail) * 0.035 - process * 0.018, 0.84, 1.0)

    return {
        "basecolor": basecolor,
        "normal": normal_from_height(height, role.normal_strength),
        "orm": np.stack((ao, roughness, metallic_field), axis=2),
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=ROOT / "assets/incubator/wreck_aftermath_pack/maps",
    )
    parser.add_argument("--size", type=int, default=512)
    args = parser.parse_args()
    args.output_dir.mkdir(parents=True, exist_ok=True)

    artifacts = []
    for role_name, role in ROLES.items():
        role_size = max(256, int(round(args.size * ROLE_RESOLUTION_SCALE[role_name])))
        for channel, pixels in role_maps(role_name, role, role_size).items():
            output = args.output_dir / f"{role_name}_{channel}.png"
            save_rgb(output, pixels)
            artifacts.append({
                "role": role_name,
                "channel": channel,
                "path": output.name,
                "sha256": sha256(output),
                "dimensions": [role_size, role_size],
            })

    report = {
        "schema": "spaceface.wreckAftermathSurfaceBuild.v1",
        "generator": "tools/art/build_wreck_aftermath_maps.py",
        "deterministic": True,
        "baseSize": args.size,
        "ormChannels": "R=AO,G=Roughness,B=Metallic",
        "normalConvention": "OpenGL tangent space",
        "roles": list(ROLES),
        "artifacts": artifacts,
    }
    report_path = args.output_dir / "map-build-report.json"
    report_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(f"wrote {len(artifacts)} maps -> {args.output_dir}")
    print(f"report {report_path}")


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""Build deterministic, role-specific PBR maps for the authored dock family.

The three docks share manufacturing standards, not one recolored material.  Each
variant gets different maintenance, abrasion, heat and patch fields while the
Blender authoring step owns panels, trenches, fasteners and silhouette detail.
"""
from __future__ import annotations

import argparse
import hashlib
import json
from dataclasses import dataclass
from pathlib import Path
import sys

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from tools.art.surface_foundry import manufactured_field, normal_from_height, normalized, spectral_noise


@dataclass(frozen=True)
class Role:
    base: tuple[float, float, float]
    rough: float
    rough_span: float
    metal: float
    normal: float
    albedo_span: float
    seed: int
    process: str
    resolution_scale: float = 1.0
    emissive: tuple[float, float, float] | None = None


ROLES = {
    "dock_painted_armor": Role((0.245, 0.285, 0.325), 0.47, 0.075, 0.035, 0.12, 0.060, 7103, "orange_peel"),
    "dock_structural_alloy": Role((0.205, 0.220, 0.235), 0.34, 0.055, 0.86, 0.10, 0.045, 7211, "brushed"),
    "dock_floor_plate": Role((0.180, 0.190, 0.198), 0.58, 0.095, 0.70, 0.15, 0.050, 7331, "traffic"),
    "dock_machinery": Role((0.085, 0.095, 0.105), 0.50, 0.075, 0.63, 0.13, 0.050, 7451, "machined"),
    "dock_radiator": Role((0.105, 0.135, 0.150), 0.53, 0.065, 0.48, 0.11, 0.045, 7561, "finned", 0.5),
    "dock_safety_surface": Role((0.73, 0.285, 0.030), 0.57, 0.090, 0.025, 0.10, 0.060, 7681, "safety", 0.5),
    "dock_optic": Role((0.010, 0.035, 0.052), 0.19, 0.025, 0.035, 0.055, 0.030, 7793, "glass", 0.5),
    "dock_worklight": Role((0.055, 0.080, 0.085), 0.24, 0.035, 0.04, 0.055, 0.025, 7817, "lens", 0.5, (0.44, 0.78, 0.88)),
    "dock_identity_decal": Role((0.70, 0.73, 0.72), 0.43, 0.045, 0.01, 0.065, 0.035, 7933, "decal", 0.5),
    "dock_rubber": Role((0.020, 0.023, 0.025), 0.79, 0.055, 0.0, 0.14, 0.040, 8053, "rubber", 0.5),
}

VARIANTS = {
    "industrial": {"seed": 0, "wear": 0.52, "dust": (0.145, 0.125, 0.095), "light": (0.44, 0.78, 0.88)},
    "military": {"seed": 113, "wear": 0.24, "dust": (0.095, 0.100, 0.090), "light": (0.82, 0.58, 0.25)},
    "grit": {"seed": 271, "wear": 0.82, "dust": (0.205, 0.125, 0.075), "light": (0.90, 0.32, 0.12)},
}


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest().upper()


def save_rgb(path: Path, pixels: np.ndarray) -> None:
    data = np.clip(pixels[:, :, :3] * 255.0 + 0.5, 0, 255).astype(np.uint8)
    Image.fromarray(data, "RGB").save(path, optimize=True)


def directional_lines(size: int, count: float, width: float, angle: float = 0.0) -> np.ndarray:
    yy, xx = np.mgrid[0:size, 0:size].astype(np.float32)
    u = (xx * np.cos(angle) + yy * np.sin(angle)) / size
    distance = np.abs(np.mod(u * count + 0.5, 1.0) - 0.5)
    return np.exp(-((distance / width) ** 2))


def role_maps(role_name: str, role: Role, variant_name: str, size: int) -> dict[str, np.ndarray]:
    variant = VARIANTS[variant_name]
    seed = role.seed + variant["seed"]
    brushed = role.process in {"brushed", "machined", "finned"}
    macro, detail = manufactured_field(size, size, seed, brushed=brushed)
    broad = spectral_noise(size, size, seed + 37, max(2.0, size / 8.5))
    micro = spectral_noise(size, size, seed + 83, max(2.0, size / 245.0), anisotropy=0.15 if brushed else 1.0)
    scratches = directional_lines(size, 91 if brushed else 47, 0.010 if brushed else 0.006, 0.11)
    service = directional_lines(size, 7, 0.050, -0.42)
    traffic = directional_lines(size, 3, 0.20, 0.0)

    height = normalized(detail * 0.48 + micro * 0.34 + broad * 0.18)
    rough_field = normalized(detail * 0.48 - broad * 0.27 + micro * 0.25)
    color_field = normalized(macro * 0.57 + broad * 0.43)

    if role.process == "orange_peel":
        height = normalized(height * 0.72 + micro * 0.28)
    elif role.process in {"brushed", "machined"}:
        height = normalized(height * 0.62 + scratches * 0.38)
        rough_field = normalized(rough_field * 0.78 + scratches * 0.22)
    elif role.process == "finned":
        fins = directional_lines(size, 32, 0.08)
        height = normalized(height * 0.45 + fins * 0.55)
        rough_field = normalized(rough_field * 0.70 + fins * 0.30)
    elif role.process == "traffic":
        # Broad directional abrasion and sparse oiling tell where vehicles and crews move.
        height = normalized(height * 0.52 + scratches * 0.22 + service * 0.26)
        rough_field = normalized(rough_field * 0.55 + traffic * 0.25 - service * 0.20)
    elif role.process == "rubber":
        height = normalized(micro * 0.75 + directional_lines(size, 58, 0.08) * 0.25)

    base = np.asarray(role.base, dtype=np.float32)[None, None, :]
    basecolor = np.clip(base * (1.0 + color_field[:, :, None] * role.albedo_span), 0.002, 0.92)
    roughness = np.clip(role.rough + rough_field * role.rough_span, 0.13, 0.96)
    metallic = np.full((size, size), role.metal, dtype=np.float32)

    # Wear is directional and role-aware.  It never turns every edge into bare metal.
    wear = float(variant["wear"])
    if role_name in {"dock_floor_plate", "dock_machinery", "dock_structural_alloy"}:
        abrasion = np.clip((scratches * 0.58 + service * 0.42 - 0.48) * (0.24 + wear * 0.24), 0.0, 0.28)
        basecolor = np.clip(basecolor * (1.0 - abrasion[:, :, None]), 0.002, 0.92)
        roughness = np.clip(roughness + abrasion * (0.34 if role_name != "dock_floor_plate" else -0.18), 0.13, 0.96)

    if role_name == "dock_floor_plate":
        dust_rgb = np.asarray(variant["dust"], dtype=np.float32)[None, None, :]
        recess_dust = np.clip((-broad + detail * 0.20) * (0.022 + wear * 0.034), 0.0, 0.075)
        basecolor = basecolor * (1.0 - recess_dust[:, :, None]) + dust_rgb * recess_dust[:, :, None]
        roughness = np.clip(roughness + recess_dust * 0.38, 0.13, 0.96)

    if role_name == "dock_safety_surface":
        yy, xx = np.mgrid[0:size, 0:size].astype(np.float32)
        chevron = (np.mod((xx + yy * 0.70) / size * 9.0, 1.0) > 0.52).astype(np.float32)
        dark = np.asarray((0.018, 0.021, 0.024), dtype=np.float32)
        amber = np.asarray(role.base, dtype=np.float32)
        basecolor = dark[None, None, :] * (1.0 - chevron[:, :, None]) + amber[None, None, :] * chevron[:, :, None]
        chip = np.clip((micro + broad - 0.52) * wear * 0.28, 0.0, 0.19)
        basecolor *= 1.0 - chip[:, :, None]
        roughness = np.clip(roughness + chip * 0.30, 0.2, 0.92)

    ao = np.clip(0.965 - np.maximum(detail, 0.0) * 0.035 - np.maximum(service, 0.0) * 0.012, 0.84, 1.0)
    result = {
        "basecolor": basecolor,
        "normal": normal_from_height(height, role.normal),
        "orm": np.stack((ao, roughness, metallic), axis=2),
    }
    if role.emissive is not None:
        emissive_rgb = np.asarray(variant["light"], dtype=np.float32)
        yy, xx = np.mgrid[0:size, 0:size].astype(np.float32)
        lens = np.clip(1.0 - np.abs(xx / size - 0.5) * 2.0, 0.0, 1.0)
        lens *= np.clip(1.0 - np.abs(yy / size - 0.5) * 2.0, 0.0, 1.0)
        result["emissive"] = (lens ** 0.55)[:, :, None] * emissive_rgb[None, None, :]
    return result


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output-dir", type=Path, required=True)
    parser.add_argument("--variant", choices=tuple(VARIANTS), required=True)
    parser.add_argument("--size", type=int, default=1024)
    args = parser.parse_args()
    args.output_dir.mkdir(parents=True, exist_ok=True)
    artifacts = []
    for role_name, role in ROLES.items():
        role_size = max(256, int(round(args.size * role.resolution_scale)))
        for channel, pixels in role_maps(role_name, role, args.variant, role_size).items():
            path = args.output_dir / f"{role_name}_{channel}.png"
            save_rgb(path, pixels)
            artifacts.append({"role": role_name, "channel": channel, "path": path.name, "sha256": sha256(path), "dimensions": [role_size, role_size]})
    report = {
        "schema": "spaceface.dockInteriorSurfaceBuild.v1",
        "generator": "tools/art/build_dock_interior_maps.py",
        "deterministic": True,
        "variant": args.variant,
        "ormChannels": "R=AO,G=Roughness,B=Metallic",
        "normalConvention": "OpenGL tangent space",
        "separationRule": "shared manufacturing language; variant-specific maintenance and wear fields",
        "roles": {name: {"roughnessCenter": role.rough, "roughnessVariation": role.rough_span, "metallicCenter": role.metal, "process": role.process, "textureSize": max(256, int(round(args.size * role.resolution_scale)))} for name, role in ROLES.items()},
        "artifacts": artifacts,
    }
    report_path = args.output_dir / "surface-map-build.json"
    report_path.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps({"ok": True, "report": str(report_path), "artifacts": len(artifacts)}))


if __name__ == "__main__":
    main()

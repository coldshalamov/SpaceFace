#!/usr/bin/env python3
"""Generate deterministic, role-specific PBR maps for opening-route infrastructure.

The maps deliberately provide material-scale response only. Construction seams, access
panels, couplers, radiators and safety zones remain authored geometry so this generator
cannot turn every asset into the same sheet of procedural grunge.
"""
from __future__ import annotations

import argparse
import hashlib
import json
from dataclasses import dataclass
from pathlib import Path
import subprocess
import sys

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from tools.art.surface_foundry import (  # noqa: E402
    SurfaceProfile,
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
    feature_scale_mm: tuple[float, float]
    seed: int
    brushed: bool = False
    emissive_rgb: tuple[float, float, float] | None = None


ROLES = {
    "gate_painted_armor": Role((0.205, 0.235, 0.270), 0.44, 0.037, 0.035, 0.10, 0.050, (0.28, 240.0), 4101),
    "gate_exposed_alloy": Role((0.175, 0.195, 0.212), 0.32, 0.030, 0.86, 0.09, 0.045, (0.12, 95.0), 4207, True),
    "gate_thermal_ceramic": Role((0.072, 0.061, 0.054), 0.69, 0.047, 0.025, 0.11, 0.065, (0.45, 180.0), 4337),
    "gate_power_bus": Role((0.038, 0.054, 0.074), 0.30, 0.027, 0.24, 0.075, 0.055, (0.20, 80.0), 4441, True, (0.12, 0.67, 1.0)),
    "gate_sensor_glass": Role((0.018, 0.046, 0.067), 0.17, 0.018, 0.04, 0.10, 0.025, (0.08, 32.0), 4513, True, (0.025, 0.18, 0.26)),
    "gate_radiator": Role((0.082, 0.096, 0.108), 0.55, 0.040, 0.53, 0.11, 0.055, (0.35, 210.0), 4639, True),
    "gate_safety_surface": Role((0.62, 0.245, 0.035), 0.52, 0.035, 0.08, 0.18, 0.050, (0.30, 140.0), 4721),
    "gate_identity_decal": Role((0.63, 0.69, 0.71), 0.41, 0.024, 0.04, 0.11, 0.030, (0.10, 25.0), 4813),
    "beacon_painted_shell": Role((0.175, 0.215, 0.250), 0.46, 0.038, 0.035, 0.09, 0.045, (0.24, 170.0), 5107),
    "beacon_structural_alloy": Role((0.145, 0.165, 0.182), 0.34, 0.030, 0.82, 0.085, 0.042, (0.10, 72.0), 5219, True),
    "beacon_signal_ceramic": Role((0.048, 0.070, 0.087), 0.54, 0.040, 0.08, 0.075, 0.045, (0.22, 95.0), 5303),
    "beacon_signal_lens": Role((0.018, 0.050, 0.072), 0.20, 0.018, 0.06, 0.055, 0.025, (0.08, 24.0), 5413, True, (0.11, 0.62, 0.92)),
    "beacon_solar_coldplate": Role((0.035, 0.060, 0.079), 0.49, 0.036, 0.42, 0.095, 0.045, (0.18, 110.0), 5521, True),
    "beacon_safety_surface": Role((0.66, 0.275, 0.035), 0.55, 0.034, 0.07, 0.08, 0.045, (0.24, 110.0), 5639),
    "beacon_identity_decal": Role((0.68, 0.72, 0.73), 0.43, 0.022, 0.03, 0.045, 0.025, (0.08, 18.0), 5741),
    # The debris family is intentionally worn, but its major construction layers must remain
    # separable under SpaceFace's dark flight lighting. These values are mid-dark material
    # identities, not baked illumination or a beauty-render exposure compensation.
    "debris_painted_skin": Role((0.340, 0.270, 0.180), 0.58, 0.052, 0.025, 0.11, 0.065, (0.32, 220.0), 6101),
    "debris_structural_alloy": Role((0.120, 0.150, 0.170), 0.42, 0.043, 0.88, 0.10, 0.050, (0.12, 85.0), 6211, True),
    "debris_insulation": Role((0.340, 0.310, 0.250), 0.78, 0.050, 0.015, 0.13, 0.070, (0.45, 150.0), 6317),
    "debris_heat_affected": Role((0.220, 0.080, 0.035), 0.54, 0.060, 0.70, 0.12, 0.075, (0.28, 120.0), 6421),
    "debris_cable_polymer": Role((0.022, 0.028, 0.033), 0.66, 0.045, 0.02, 0.09, 0.050, (0.16, 42.0), 6533),
    "debris_radiator": Role((0.042, 0.058, 0.067), 0.49, 0.038, 0.48, 0.10, 0.052, (0.18, 115.0), 6647, True),
    "debris_identity_decal": Role((0.620, 0.480, 0.160), 0.50, 0.030, 0.025, 0.055, 0.035, (0.10, 24.0), 6761),
    "drone_painted_armor": Role((0.39, 0.205, 0.047), 0.49, 0.045, 0.025, 0.10, 0.060, (0.24, 150.0), 7103),
    "drone_structural_alloy": Role((0.095, 0.116, 0.126), 0.37, 0.036, 0.86, 0.095, 0.045, (0.10, 68.0), 7211, True),
    "drone_cutter_carbide": Role((0.145, 0.158, 0.164), 0.34, 0.040, 0.76, 0.11, 0.050, (0.12, 55.0), 7321, True),
    "drone_sensor_optic": Role((0.014, 0.045, 0.061), 0.18, 0.018, 0.05, 0.045, 0.022, (0.06, 18.0), 7433, True, (0.08, 0.54, 0.82)),
    "drone_radiator": Role((0.036, 0.054, 0.065), 0.51, 0.037, 0.45, 0.095, 0.050, (0.16, 86.0), 7541, True),
    "drone_cable_polymer": Role((0.024, 0.030, 0.034), 0.64, 0.041, 0.02, 0.085, 0.045, (0.12, 34.0), 7657),
    "drone_safety_surface": Role((0.68, 0.29, 0.035), 0.53, 0.032, 0.045, 0.07, 0.040, (0.18, 72.0), 7759),
}
ROLE_RESOLUTION_SCALE = {
    "gate_painted_armor": 1.0,
    "gate_exposed_alloy": 1.0,
    "gate_thermal_ceramic": 0.5,
    "gate_power_bus": 0.5,
    "gate_sensor_glass": 0.25,
    "gate_radiator": 0.5,
    "gate_safety_surface": 0.5,
    "gate_identity_decal": 0.5,
    "beacon_painted_shell": 0.5,
    "beacon_structural_alloy": 0.5,
    "beacon_signal_ceramic": 0.25,
    "beacon_signal_lens": 0.25,
    "beacon_solar_coldplate": 0.25,
    "beacon_safety_surface": 0.25,
    "beacon_identity_decal": 0.25,
    "debris_painted_skin": 0.5,
    "debris_structural_alloy": 0.5,
    "debris_insulation": 0.25,
    "debris_heat_affected": 0.25,
    "debris_cable_polymer": 0.25,
    "debris_radiator": 0.25,
    "debris_identity_decal": 0.25,
    "drone_painted_armor": 0.5,
    "drone_structural_alloy": 0.5,
    "drone_cutter_carbide": 0.25,
    "drone_sensor_optic": 0.25,
    "drone_radiator": 0.25,
    "drone_cable_polymer": 0.25,
    "drone_safety_surface": 0.25,
}

CONSTRUCTION_USE = {
    "gate_painted_armor": "coated load-bearing shells and major service doors",
    "gate_exposed_alloy": "structural spines, couplers and fastener rails",
    "gate_thermal_ceramic": "emitter insulation and heat-affected interfaces",
    "gate_power_bus": "energized bus bars and aperture emitter faces",
    "gate_sensor_glass": "protected rangefinding and transit-status optics",
    "gate_radiator": "directional heat rejection fins and cold plates",
    "gate_safety_surface": "maintenance exclusion and contact zones",
    "gate_identity_decal": "manufacturer, gate ID and service markings",
    "beacon_painted_shell": "weathered nonmetallic signal-head and service-cassette armor",
    "beacon_structural_alloy": "load-bearing mast, foot clevises, fasteners and replaceable frame",
    "beacon_signal_ceramic": "dark nonmetallic insulation around the signal cartridge",
    "beacon_signal_lens": "bounded lane-status optics and rangefinder apertures",
    "beacon_solar_coldplate": "directional power collection and signal-head heat rejection",
    "beacon_safety_surface": "physical contact, exclusion and service-release markings",
    "beacon_identity_decal": "non-emissive lane number, maker and inspection identity",
    "debris_painted_skin": "surviving coated exterior plates with damage authored at break geometry",
    "debris_structural_alloy": "recognizable load-bearing ship or station frame, rails and tether clevis",
    "debris_insulation": "exposed pressure, thermal and micrometeoroid blanket layers",
    "debris_heat_affected": "shorn members and material transitions at the destructive break",
    "debris_cable_polymer": "bounded service harnesses rooted to trays and severed equipment",
    "debris_radiator": "surviving directional heat-exchanger and cold-plate fragments",
    "debris_identity_decal": "non-emissive donor registration and salvage classification",
    "drone_painted_armor": "industrial nonmetallic battery, avionics and actuator service covers",
    "drone_structural_alloy": "compact load frame, cutter yoke, hardpoints and replaceable rails",
    "drone_cutter_carbide": "rotating cutter drum and mechanically indexed teeth",
    "drone_sensor_optic": "bounded work-volume ranging and material-analysis apertures",
    "drone_radiator": "directional motor-controller and battery heat rejection",
    "drone_cable_polymer": "rooted hydraulic, power and sensor harnesses",
    "drone_safety_surface": "tool guard, pinch-point and service-release warning regions",
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

    # Only explicitly manufactured roles receive aligned process marks. They are
    # directional and sparse, not isotropic noise pasted over every surface.
    process = periodic_lines(size, count=41 if role.brushed else 13, width=0.038 if role.brushed else 0.020,
                             phase=(role.seed % 29) / 29.0)
    if role_name in {"gate_exposed_alloy", "gate_radiator", "beacon_structural_alloy", "beacon_solar_coldplate", "debris_structural_alloy", "debris_radiator", "drone_structural_alloy", "drone_cutter_carbide", "drone_radiator"}:
        height = normalized(height * 0.76 + process * 0.24)
        rough_field = normalized(rough_field * 0.82 + process * 0.18)
    elif role_name in {"gate_thermal_ceramic", "beacon_signal_ceramic", "debris_heat_affected"}:
        heat_band = np.sin(np.linspace(0.0, np.pi * 10.0, size, dtype=np.float32))[:, None]
        albedo_field = normalized(albedo_field * 0.72 + heat_band * 0.28)
        rough_field = normalized(rough_field * 0.68 + heat_band * 0.32)

    base = np.asarray(role.base_rgb, dtype=np.float32)[None, None, :]
    basecolor = np.clip(base * (1.0 + albedo_field[:, :, None] * role.albedo_strength), 0.003, 0.92)
    roughness = np.clip(role.roughness + rough_field * role.roughness_variation, 0.12, 0.96)
    metallic = np.full((size, size), role.metallic, dtype=np.float32)
    # Texture AO is deliberately restrained. Contact AO comes from authored overlaps;
    # this channel only adds shallow material-scale occlusion.
    ao = np.clip(0.965 - np.maximum(0.0, detail) * 0.035 - process * 0.018, 0.84, 1.0)

    if role_name in {"gate_safety_surface", "beacon_safety_surface", "drone_safety_surface"}:
        u = np.arange(size, dtype=np.float32)[None, :] / size
        v = np.arange(size, dtype=np.float32)[:, None] / size
        chevron = (np.mod((u + v * 0.72) * 8.0, 1.0) > 0.52).astype(np.float32)
        dark = np.array((0.026, 0.031, 0.035), dtype=np.float32)
        amber = np.array(role.base_rgb, dtype=np.float32)
        basecolor = dark[None, None, :] * (1.0 - chevron[:, :, None]) + amber[None, None, :] * chevron[:, :, None]
        roughness = np.clip(roughness + (1.0 - chevron) * 0.07, 0.2, 0.9)

    result = {
        "basecolor": basecolor,
        "normal": normal_from_height(height, role.normal_strength),
        "orm": np.stack((ao, roughness, metallic), axis=2),
    }
    if role.emissive_rgb is not None:
        u = np.arange(size, dtype=np.float32)[None, :] / size
        v = np.arange(size, dtype=np.float32)[:, None] / size
        lane = np.exp(-((np.mod(v * 8.0 + 0.5, 1.0) - 0.5) / 0.10) ** 2)
        breaker = (np.mod(u * 5.0, 1.0) > 0.12).astype(np.float32)
        mask = np.clip(lane * breaker, 0.0, 1.0)
        result["emissive"] = mask[:, :, None] * np.asarray(role.emissive_rgb, dtype=np.float32)[None, None, :]
    return result


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output-dir", type=Path, required=True)
    parser.add_argument("--size", type=int, default=1024)
    parser.add_argument("--roles", nargs="+", choices=tuple(ROLES))
    parser.add_argument("--toktx", type=Path)
    parser.add_argument("--ktx-output-dir", type=Path)
    args = parser.parse_args()
    if bool(args.toktx) != bool(args.ktx_output_dir):
        parser.error("--toktx and --ktx-output-dir must be supplied together")
    args.output_dir.mkdir(parents=True, exist_ok=True)
    selected_roles = args.roles or list(ROLES)
    artifacts = []
    for role_name in selected_roles:
        role = ROLES[role_name]
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
    ktx2_artifacts = []
    if args.toktx:
        args.ktx_output_dir.mkdir(parents=True, exist_ok=True)
        for source in sorted(args.output_dir.glob("*.png")):
            target = args.ktx_output_dir / f"{source.stem}.ktx2"
            oetf = "linear" if source.stem.endswith(("_normal", "_orm")) else "srgb"
            command = [
                str(args.toktx), "--t2", "--encode", "uastc", "--uastc_quality", "2",
                "--zcmp", "8", "--genmipmap", "--filter", "lanczos4",
                "--assign_oetf", oetf, "--assign_primaries", "bt709",
                str(target), str(source),
            ]
            result = subprocess.run(command, check=False, text=True, capture_output=True)
            if result.returncode:
                raise RuntimeError(f"toktx failed for {source.name}: {result.stderr or result.stdout}")
            ktx2_artifacts.append({
                "source": source.name,
                "sourceSha256": sha256(source),
                "path": target.name,
                "sha256": sha256(target),
                "bytes": target.stat().st_size,
                "oetf": oetf,
                "encoding": "UASTC quality 2 + Zstandard level 8 + Lanczos4 mip chain",
            })

    report = {
        "schema": "spaceface.openingInfrastructureSurfaceBuild.v1",
        "generator": "tools/art/build_opening_infrastructure_maps.py",
        "deterministic": True,
        "baseSize": args.size,
        "ormChannels": "R=AO,G=Roughness,B=Metallic",
        "normalConvention": "OpenGL tangent space",
        "roles": {
            name: {
                "baseRgb": role.base_rgb,
                "roughnessCenter": role.roughness,
                "roughnessVariation": role.roughness_variation,
                "metallicCenter": role.metallic,
                "featureScaleMm": role.feature_scale_mm,
                "textureSize": max(256, int(round(args.size * ROLE_RESOLUTION_SCALE[name]))),
                "constructionUse": CONSTRUCTION_USE[name],
            }
            for name in selected_roles
            for role in (ROLES[name],)
        },
        "artifacts": artifacts,
        "ktx2Artifacts": ktx2_artifacts,
        "ktx2Recipe": {
            "tool": "KTX-Software toktx",
            "arguments": "--t2 --encode uastc --uastc_quality 2 --zcmp 8 --genmipmap --filter lanczos4",
            "baseColorAndEmissiveOetf": "srgb",
            "normalAndOrmOetf": "linear",
            "runtimeStatus": "candidate-only; controller must wire loader/transcoder and release manifest",
        },
    }
    report_path = args.output_dir / "surface-map-build.json"
    report_path.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps({"ok": True, "report": str(report_path), "artifacts": len(artifacts)}))


if __name__ == "__main__":
    main()

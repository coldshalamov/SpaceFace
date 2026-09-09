#!/usr/bin/env python3
"""Build deterministic, asset-specific PBR maps for navigation infrastructure.

The lane beacon and nav buoy share a manufacturer, not identical surfaces.  Each
role has an explicit physical use, feature scale, roughness envelope, and metallic
envelope.  Geometry owns panels, fasteners, apertures, and load paths; these maps
only provide material-scale variation and never substitute random grunge for design.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from tools.art.surface_foundry import normal_from_height, normalized, spectral_noise  # noqa: E402


@dataclass(frozen=True)
class Role:
    asset: str
    material_use: str
    base_rgb: tuple[float, float, float]
    roughness: tuple[float, float]
    metallic: tuple[float, float]
    normal_strength: float
    albedo_strength: float
    macro_px: float
    meso_px: float
    micro_px: float
    feature_scale_mm: tuple[float, float]
    seed: int
    process: str
    resolution: int
    emissive_rgb: tuple[float, float, float] | None = None


ROLES = {
    # Maintained long-range route authority: durable coated cassettes over a dark,
    # regularly serviced structural mast and deliberate thermal/signal assemblies.
    "lane_beacon_painted_shell": Role("place_lane_beacon", "coated authority cassettes and head armor", (0.37, 0.44, 0.45), (0.50, 0.68), (0.00, 0.025), 0.085, 0.045, 150.0, 28.0, 3.6, (0.22, 210.0), 1103, "orange_peel", 512),
    "lane_beacon_service_alloy": Role("place_lane_beacon", "coated load mast, collars, clevises and protected fasteners", (0.30, 0.335, 0.345), (0.40, 0.60), (0.32, 0.56), 0.070, 0.028, 110.0, 18.0, 2.4, (0.10, 92.0), 1201, "brushed_axial", 512),
    "lane_beacon_signal_ceramic": Role("place_lane_beacon", "electrically isolated long-range signal cartridge", (0.052, 0.064, 0.069), (0.68, 0.84), (0.00, 0.035), 0.07, 0.040, 82.0, 20.0, 4.4, (0.32, 125.0), 1301, "sintered", 256),
    "lane_beacon_longrange_optic": Role("place_lane_beacon", "finite protected rangefinding and lane-status apertures", (0.020, 0.072, 0.087), (0.24, 0.38), (0.02, 0.08), 0.045, 0.030, 34.0, 8.0, 1.6, (0.06, 26.0), 1409, "optical", 256, (0.16, 0.63, 0.74)),
    "lane_beacon_coldplate": Role("place_lane_beacon", "coated directional high-duty signal-head heat rejection", (0.23, 0.275, 0.285), (0.50, 0.70), (0.20, 0.42), 0.080, 0.032, 92.0, 12.0, 2.0, (0.12, 100.0), 1511, "brushed_cross", 256),
    "lane_beacon_contact_marking": Role("place_lane_beacon", "anchoring, service-release and exclusion contact faces", (0.66, 0.285, 0.030), (0.58, 0.79), (0.00, 0.045), 0.075, 0.050, 52.0, 10.0, 2.4, (0.18, 78.0), 1601, "safety", 256),
    "lane_beacon_authority_decal": Role("place_lane_beacon", "non-emissive route ID, maker and inspection identity", (0.66, 0.69, 0.65), (0.54, 0.74), (0.00, 0.025), 0.045, 0.040, 42.0, 9.0, 1.8, (0.08, 32.0), 1709, "decal", 256),
    "lane_beacon_cable_jacket": Role("place_lane_beacon", "shielded power and telemetry cable jacket", (0.018, 0.022, 0.024), (0.73, 0.90), (0.00, 0.012), 0.055, 0.028, 48.0, 9.0, 2.0, (0.14, 42.0), 1801, "rubber_jacket", 256),
    "lane_beacon_lane_retroreflector": Role("place_lane_beacon", "bounded route-facing retroreflective chevrons", (0.16, 0.50, 0.54), (0.30, 0.47), (0.00, 0.020), 0.035, 0.025, 38.0, 8.0, 1.8, (0.08, 30.0), 1901, "retroreflective", 256, (0.055, 0.24, 0.26)),

    # Smaller field-serviceable local equipment: warmer replaceable shell, rougher
    # repaired alloy, battery heat management, tow-contact wear, and lower-power optics.
    "nav_buoy_coated_pressure_shell": Role("place_nav_buoy", "field-replaceable pressure, ballast and battery armor", (0.34, 0.215, 0.052), (0.48, 0.66), (0.00, 0.020), 0.075, 0.038, 128.0, 24.0, 3.2, (0.18, 135.0), 2101, "coated_metal", 512),
    "nav_buoy_field_alloy": Role("place_nav_buoy", "ballast keel and impact load frame", (0.19, 0.205, 0.210), (0.51, 0.73), (0.66, 0.84), 0.085, 0.035, 72.0, 12.0, 2.0, (0.08, 66.0), 2203, "service_brush", 512),
    "nav_buoy_sensor_ceramic": Role("place_nav_buoy", "compact telemetry and battery insulation", (0.047, 0.042, 0.036), (0.74, 0.91), (0.00, 0.025), 0.10, 0.070, 46.0, 12.0, 3.1, (0.24, 76.0), 2309, "sintered", 256),
    "nav_buoy_local_optic": Role("place_nav_buoy", "finite recessed local-navigation apertures", (0.024, 0.062, 0.069), (0.30, 0.46), (0.015, 0.065), 0.050, 0.035, 24.0, 6.0, 1.2, (0.05, 18.0), 2411, "optical", 256, (0.10, 0.46, 0.53)),
    "nav_buoy_battery_coldplate": Role("place_nav_buoy", "replaceable solar and battery heat-spreader plates", (0.075, 0.083, 0.080), (0.59, 0.77), (0.34, 0.56), 0.11, 0.070, 54.0, 8.0, 1.5, (0.09, 62.0), 2503, "brushed_cross", 256),
    "nav_buoy_tow_marking": Role("place_nav_buoy", "tow pin and field-service release contact faces", (0.69, 0.245, 0.025), (0.65, 0.84), (0.00, 0.035), 0.09, 0.060, 34.0, 7.0, 1.8, (0.12, 48.0), 2609, "safety", 256),
    "nav_buoy_service_decal": Role("place_nav_buoy", "non-emissive NB service identity and solar bus marks", (0.58, 0.60, 0.54), (0.61, 0.80), (0.00, 0.025), 0.050, 0.050, 28.0, 6.0, 1.1, (0.06, 24.0), 2707, "decal", 256),
    "nav_buoy_cast_collar": Role("place_nav_buoy", "cast load-transfer collars and hinge sockets", (0.20, 0.212, 0.214), (0.58, 0.76), (0.52, 0.72), 0.070, 0.025, 94.0, 18.0, 3.4, (0.20, 96.0), 2801, "cast_alloy", 256),
    "nav_buoy_exposed_boom_alloy": Role("place_nav_buoy", "directionally finished tow booms, frames and antenna structure", (0.245, 0.270, 0.280), (0.37, 0.57), (0.74, 0.89), 0.060, 0.028, 86.0, 14.0, 1.9, (0.08, 72.0), 2903, "service_brush", 256),
    "nav_buoy_cable_jacket": Role("place_nav_buoy", "flexible tow, solar and sensor cable jacket", (0.016, 0.019, 0.020), (0.76, 0.91), (0.00, 0.010), 0.048, 0.024, 42.0, 8.0, 1.8, (0.12, 36.0), 3001, "rubber_jacket", 256),
    "nav_buoy_sensor_housing": Role("place_nav_buoy", "coated sensor cassettes, pressure head and maintenance panel", (0.12, 0.17, 0.20), (0.47, 0.66), (0.10, 0.28), 0.055, 0.026, 84.0, 16.0, 2.5, (0.16, 82.0), 3109, "coated_instrument", 256),
    "nav_buoy_solar_cell": Role("place_nav_buoy", "segmented photovoltaic cell laminate", (0.018, 0.060, 0.12), (0.30, 0.46), (0.12, 0.30), 0.022, 0.016, 64.0, 10.0, 1.4, (0.04, 55.0), 3203, "photovoltaic", 256),
}

ASSET_ROLES = {
    "place_lane_beacon": tuple(name for name, role in ROLES.items() if role.asset == "place_lane_beacon"),
    "place_nav_buoy": tuple(name for name, role in ROLES.items() if role.asset == "place_nav_buoy"),
}


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest().upper()


def unit_field(field: np.ndarray) -> np.ndarray:
    """Map surface_foundry's signed [-3, 3] standard field into [0, 1]."""
    return np.clip(normalized(field) / 6.0 + 0.5, 0.0, 1.0)


def save_rgb(path: Path, value: np.ndarray) -> None:
    if value.ndim == 2:
        value = np.repeat(value[:, :, None], 3, axis=2)
    encoded = np.clip(value[:, :, :3] * 255.0 + 0.5, 0.0, 255.0).astype(np.uint8)
    Image.fromarray(encoded, "RGB").save(path, optimize=True)


def line_field(size: int, count: int, width: float, *, axis: str = "u", phase: float = 0.0) -> np.ndarray:
    coord = np.arange(size, dtype=np.float32) / size
    distance = np.abs(np.mod(coord * count + phase + 0.5, 1.0) - 0.5)
    line = np.exp(-((distance / width) ** 2))
    return np.broadcast_to(line[None, :] if axis == "u" else line[:, None], (size, size)).copy()


def role_maps(name: str, role: Role) -> dict[str, np.ndarray]:
    size = role.resolution
    macro = spectral_noise(size, size, role.seed + 11, role.macro_px)
    meso = spectral_noise(size, size, role.seed + 31, role.meso_px, anisotropy=0.24 if "brush" in role.process else 1.0)
    micro = spectral_noise(size, size, role.seed + 53, role.micro_px, anisotropy=0.10 if "brush" in role.process else 1.0)
    cross = spectral_noise(size, size, role.seed + 79, max(2.0, role.micro_px * 1.8), anisotropy=2.8 if "cross" in role.process else 1.0)

    process = np.zeros((size, size), dtype=np.float32)
    if role.process in {"brushed_axial", "service_brush"}:
        process = line_field(size, 61 if role.asset == "place_lane_beacon" else 43, 0.024, axis="u", phase=0.17)
    elif role.process == "brushed_cross":
        process = np.maximum(line_field(size, 31, 0.026, axis="u", phase=0.31), line_field(size, 19, 0.022, axis="v", phase=0.11))
    elif role.process in {"sintered", "cast_alloy"}:
        process = np.clip(unit_field(micro) ** 5, 0.0, 1.0)

    signed_albedo = np.clip(normalized(macro * 0.56 + meso * 0.31 + micro * 0.13) / 3.0, -1.0, 1.0)
    base = np.asarray(role.base_rgb, dtype=np.float32)[None, None, :]
    hue_bias = np.stack((macro * 0.010, meso * 0.007, -macro * 0.006), axis=2)
    basecolor = np.clip(base * (1.0 + signed_albedo[:, :, None] * role.albedo_strength) + hue_bias, 0.004, 0.78)

    if role.process == "safety":
        u = np.arange(size, dtype=np.float32)[None, :] / size
        v = np.arange(size, dtype=np.float32)[:, None] / size
        stripe = (np.mod((u + v * 0.74) * (7.0 if role.asset == "place_lane_beacon" else 5.0), 1.0) > 0.53).astype(np.float32)
        dark = np.asarray((0.025, 0.029, 0.028), dtype=np.float32)
        basecolor = dark[None, None, :] * (1.0 - stripe[:, :, None]) + base * stripe[:, :, None]
    elif role.process == "decal":
        # Decal geometry owns the glyph. This merely gives printed coating a
        # different, slightly worn response without random holes in legibility.
        basecolor = np.clip(basecolor * (0.94 + unit_field(meso)[:, :, None] * 0.10), 0.01, 0.76)

    rough_field = unit_field(meso * 0.52 + micro * 0.31 - macro * 0.12 + process * 0.22)
    roughness = role.roughness[0] + rough_field * (role.roughness[1] - role.roughness[0])
    metal_field = unit_field(macro * 0.48 + meso * 0.40 + micro * 0.12)
    metallic = role.metallic[0] + metal_field * (role.metallic[1] - role.metallic[0])

    height = normalized(meso * 0.45 + micro * 0.36 + cross * 0.12 + process * 0.07)
    cavity = np.clip((-height + 0.20) / 3.2, 0.0, 1.0)
    ao_floor = 0.89 if role.process in {"sintered", "cast_alloy"} else 0.92
    ao = np.clip(0.992 - cavity * (0.992 - ao_floor), ao_floor, 1.0)

    result = {
        "basecolor": basecolor,
        "normal": normal_from_height(height, role.normal_strength),
        "orm": np.stack((ao, roughness, metallic), axis=2),
    }
    if role.emissive_rgb is not None:
        u = np.arange(size, dtype=np.float32)[None, :] / size
        v = np.arange(size, dtype=np.float32)[:, None] / size
        aperture = np.exp(-(((u - 0.5) / 0.39) ** 8 + ((v - 0.5) / 0.34) ** 8))
        service_breaks = 0.82 + line_field(size, 7 if role.asset == "place_lane_beacon" else 5, 0.030, axis="v") * 0.18
        mask = np.clip(aperture * service_breaks, 0.0, 1.0)
        result["emissive"] = mask[:, :, None] * np.asarray(role.emissive_rgb, dtype=np.float32)[None, None, :]
    return result


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--asset", choices=tuple(ASSET_ROLES), required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    parser.add_argument("--toktx", type=Path)
    parser.add_argument("--ktx-output-dir", type=Path)
    args = parser.parse_args()
    if bool(args.toktx) != bool(args.ktx_output_dir):
        parser.error("--toktx and --ktx-output-dir must be supplied together")

    args.output_dir.mkdir(parents=True, exist_ok=True)
    if args.ktx_output_dir:
        args.ktx_output_dir.mkdir(parents=True, exist_ok=True)

    artifacts = []
    ktx_artifacts = []
    metrics = {}
    for name in ASSET_ROLES[args.asset]:
        role = ROLES[name]
        maps = role_maps(name, role)
        for channel, pixels in maps.items():
            target = args.output_dir / f"{name}_{channel}.png"
            save_rgb(target, pixels)
            artifacts.append({"role": name, "channel": channel, "path": target.name, "bytes": target.stat().st_size, "sha256": sha256(target), "size": role.resolution})
            if channel == "orm":
                metrics[name] = {
                    "roughness": {"mean": float(np.mean(pixels[:, :, 1])), "p10": float(np.percentile(pixels[:, :, 1], 10)), "p90": float(np.percentile(pixels[:, :, 1], 90)), "declared": list(role.roughness)},
                    "metallic": {"mean": float(np.mean(pixels[:, :, 2])), "p10": float(np.percentile(pixels[:, :, 2], 10)), "p90": float(np.percentile(pixels[:, :, 2], 90)), "declared": list(role.metallic)},
                }

            if args.toktx:
                ktx = args.ktx_output_dir / target.with_suffix(".ktx2").name
                command = [str(args.toktx.resolve()), "--t2", "--encode", "uastc", "--uastc_quality", "3"]
                if channel in {"normal", "orm"}:
                    command.append("--linear")
                command += [str(ktx.resolve()), str(target.resolve())]
                completed = subprocess.run(command, capture_output=True, text=True)
                if completed.returncode:
                    raise RuntimeError(f"toktx failed for {target.name}: {completed.stderr or completed.stdout}")
                ktx_artifacts.append({"role": name, "channel": channel, "path": ktx.name, "bytes": ktx.stat().st_size, "sha256": sha256(ktx)})

    manifest = {
        "schema": "spaceface.navigationInfrastructureSurfaceMaps.v1",
        "status": "candidate-not-promoted",
        "asset": args.asset,
        "generator": Path(__file__).as_posix(),
        "generatorSha256": sha256(Path(__file__)),
        "ormChannels": "R=AO,G=Roughness,B=Metallic",
        "normalConvention": "OpenGL tangent space",
        "roles": [{"name": name, "materialUse": ROLES[name].material_use, "featureScaleMm": list(ROLES[name].feature_scale_mm), "process": ROLES[name].process, "resolution": ROLES[name].resolution, "emissive": ROLES[name].emissive_rgb is not None} for name in ASSET_ROLES[args.asset]],
        "metrics": metrics,
        "artifacts": artifacts,
        "ktx2Artifacts": ktx_artifacts,
    }
    report = args.output_dir / "surface-map-build.json"
    report.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    print(json.dumps({"ok": True, "asset": args.asset, "png": len(artifacts), "ktx2": len(ktx_artifacts), "report": str(report)}))


if __name__ == "__main__":
    main()

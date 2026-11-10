#!/usr/bin/env python3
"""Generate deterministic, role-specific PBR maps for geology landmarks.

Macro form, fractures, strata, survey hardware and graffiti remain authored geometry.
This generator supplies physically scaled material response: multi-scale regolith,
directional bedding, recess dust, mineral inclusions, weathered paint and worked alloy.
It intentionally does not create emissive maps; neither landmark is a molten hazard.
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

from tools.art.surface_foundry import normal_from_height, normalized, spectral_noise  # noqa: E402


@dataclass(frozen=True)
class Role:
    base_rgb: tuple[float, float, float]
    roughness: tuple[float, float]
    metallic: tuple[float, float]
    normal_strength: float
    seed: int
    kind: str
    physical_scale_mm: tuple[float, float]


ROLES = {
    "seamed_regolith_matrix": Role((0.310, 0.285, 0.240), (0.93, 0.997), (0.0, 0.003), 0.17, 11003, "regolith", (0.35, 920.0)),
    "seamed_strata_exposure": Role((0.320, 0.290, 0.235), (0.74, 0.94), (0.0, 0.02), 0.30, 11117, "strata", (0.8, 2400.0)),
    "seamed_mineral_vein": Role((0.380, 0.310, 0.180), (0.46, 0.78), (0.08, 0.42), 0.22, 11239, "mineral", (0.25, 640.0)),
    "seamed_fracture_dust": Role((0.056, 0.050, 0.045), (0.92, 0.99), (0.0, 0.004), 0.16, 11351, "dust", (0.18, 360.0)),
    "seamed_survey_alloy": Role((0.155, 0.165, 0.170), (0.35, 0.62), (0.72, 0.92), 0.13, 11467, "alloy", (0.08, 120.0)),
    "seamed_survey_marking": Role((0.72, 0.47, 0.09), (0.48, 0.76), (0.0, 0.03), 0.10, 11579, "paint_amber", (0.12, 180.0)),
    "graffiti_regolith_matrix": Role((0.265, 0.235, 0.205), (0.93, 0.997), (0.0, 0.003), 0.17, 21011, "regolith", (0.30, 760.0)),
    "graffiti_fresh_break": Role((0.325, 0.300, 0.260), (0.72, 0.92), (0.0, 0.020), 0.32, 21121, "fresh_break", (0.20, 620.0)),
    "graffiti_recess_dust": Role((0.045, 0.040, 0.036), (0.93, 0.995), (0.0, 0.003), 0.15, 21227, "dust", (0.12, 280.0)),
    "graffiti_paint_red": Role((0.59, 0.120, 0.055), (0.49, 0.80), (0.0, 0.02), 0.12, 21341, "paint_red", (0.08, 140.0)),
    "graffiti_paint_bone": Role((0.74, 0.680, 0.535), (0.54, 0.83), (0.0, 0.02), 0.11, 21467, "paint_bone", (0.08, 140.0)),
    "graffiti_hardware_alloy": Role((0.145, 0.155, 0.160), (0.38, 0.68), (0.68, 0.91), 0.14, 21587, "alloy", (0.07, 110.0)),
}


CONSTRUCTION_USE = {
    "seamed_regolith_matrix": "old nonmetallic matrix with coarse aggregate and fine regolith response",
    "seamed_strata_exposure": "directional bedding exposed by large-scale geological failure",
    "seamed_mineral_vein": "non-emissive altered zone and metallic mineral inclusion inside the primary seam",
    "seamed_fracture_dust": "dark high-roughness fines accumulated in deep fracture recesses",
    "seamed_survey_alloy": "restrained claim-site survey pins, clamps and tethered measurement plate",
    "seamed_survey_marking": "non-emissive industrial survey identity and calibration paint",
    "graffiti_regolith_matrix": "dark natural host rock with several scales of regolith response",
    "graffiti_fresh_break": "angular recently exposed fracture planes distinct from weathered host rock",
    "graffiti_recess_dust": "fine dark dust trapped in concavities and attachment scars",
    "graffiti_paint_red": "weathered oxide-red prospector marks with broken paint coverage",
    "graffiti_paint_bone": "aged bone-white claim lettering and directional marks",
    "graffiti_hardware_alloy": "drilled anchor clamps, strap fittings and abandoned occupation hardware",
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


def field(size: int, seed: int) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    macro = spectral_noise(size, size, seed, max(4.0, size / 8.0))
    meso = spectral_noise(size, size, seed + 31, max(2.0, size / 26.0))
    micro = spectral_noise(size, size, seed + 73, max(1.0, size / 150.0))
    return normalized(macro), normalized(meso), normalized(micro)


def directional_bedding(size: int, seed: int) -> np.ndarray:
    rng = np.random.default_rng(seed)
    x = np.linspace(-1.0, 1.0, size, dtype=np.float32)[None, :]
    y = np.linspace(-1.0, 1.0, size, dtype=np.float32)[:, None]
    angle = rng.uniform(0.30, 0.75)
    u = x * np.cos(angle) + y * np.sin(angle)
    warp = spectral_noise(size, size, seed + 19, max(3.0, size / 12.0)) * 0.13
    bands = np.sin((u + warp) * np.pi * rng.uniform(12.0, 18.0))
    fine = np.sin((u * 2.7 + warp * 0.45) * np.pi * rng.uniform(20.0, 28.0))
    return normalized(bands * 0.72 + fine * 0.28)


def chipped_mask(size: int, seed: int) -> np.ndarray:
    broad = spectral_noise(size, size, seed, max(3.0, size / 18.0))
    fine = spectral_noise(size, size, seed + 23, max(1.0, size / 80.0))
    chips = normalized(broad * 0.68 + fine * 0.32)
    return np.clip((chips - 0.30) / 0.70, 0.0, 1.0)


def role_maps(name: str, role: Role, size: int) -> dict[str, np.ndarray]:
    macro, meso, micro = field(size, role.seed)
    bedding = directional_bedding(size, role.seed + 101)
    rng = np.random.default_rng(role.seed + 211)

    if role.kind == "strata":
        height = normalized(bedding * 0.58 + meso * 0.30 + micro * 0.12)
        albedo = normalized(bedding * 0.45 + macro * 0.38 + meso * 0.17)
    elif role.kind == "fresh_break":
        height = normalized(macro * 0.10 + meso * 0.55 + micro * 0.35)
        albedo = normalized(macro * 0.25 + meso * 0.50 + micro * 0.25)
    elif role.kind == "mineral":
        vein = np.abs(np.sin((bedding + macro * 0.25) * np.pi * 2.1))
        height = normalized(vein * 0.52 + meso * 0.28 + micro * 0.20)
        albedo = normalized(vein * 0.64 + macro * 0.20 + micro * 0.16)
    elif role.kind == "dust":
        height = normalized(macro * 0.22 + meso * 0.48 + micro * 0.30)
        albedo = normalized(macro * 0.62 + meso * 0.30 + micro * 0.08)
    elif role.kind == "alloy":
        scratches = np.abs(np.sin(np.linspace(0.0, np.pi * 94.0, size, dtype=np.float32)))[None, :]
        scratches = np.broadcast_to(scratches, (size, size))
        height = normalized(meso * 0.40 + micro * 0.34 + scratches * 0.26)
        albedo = normalized(macro * 0.46 + meso * 0.28 + scratches * 0.26)
    elif role.kind.startswith("paint"):
        chips = chipped_mask(size, role.seed + 307)
        height = normalized(meso * 0.34 + micro * 0.28 + chips * 0.38)
        albedo = normalized(macro * 0.32 + meso * 0.18 + chips * 0.50)
    elif role.kind == "regolith":
        height = normalized(macro * 0.15 + meso * 0.50 + micro * 0.35)
        albedo = normalized(macro * 0.22 + meso * 0.46 + micro * 0.32)
    else:
        height = normalized(macro * 0.28 + meso * 0.46 + micro * 0.26)
        albedo = normalized(macro * 0.58 + meso * 0.30 + micro * 0.12)

    base = np.asarray(role.base_rgb, dtype=np.float32)[None, None, :]
    amplitude = 0.11 if role.kind == "regolith" else 0.18 if role.kind in {"fresh_break", "strata"} else 0.12
    value_variation = (albedo - 0.5)[:, :, None] * amplitude
    hue_scale = 0.40 if role.kind == "regolith" else 1.0
    hue_bias = np.stack((macro * 0.022, -meso * 0.012, bedding * 0.018), axis=2) * hue_scale
    basecolor = np.clip(base * (1.0 + value_variation) + hue_bias, 0.008, 0.84)

    if role.kind.startswith("paint"):
        chips = chipped_mask(size, role.seed + 307)
        substrate = np.asarray((0.10, 0.095, 0.085), dtype=np.float32)[None, None, :]
        # Geometry carries the hand-authored letter/stroke silhouette. Keep most of
        # that silhouette painted at gameplay distance and reserve loss for bounded
        # chips, rather than turning the entire mark into mottled substrate noise.
        paint_value = 0.86 + albedo[:, :, None] * 0.18
        basecolor = np.clip(base * paint_value, 0.012, 0.88)
        coverage = np.clip(0.66 + chips * 0.34, 0.0, 1.0)[:, :, None]
        basecolor = basecolor * coverage + substrate * (1.0 - coverage)

    if role.kind == "regolith":
        rough_field = normalized(meso * 0.36 + micro * 0.59 + bedding * 0.05)
    elif role.kind == "dust":
        rough_field = normalized(meso * 0.44 + micro * 0.56)
    else:
        rough_field = normalized(meso * 0.46 - macro * 0.22 + micro * 0.24 + bedding * 0.08)
    # surface_foundry.normalized() intentionally returns a signed, standardised
    # field in [-3, 3] for height/albedo work. Material-role bounds are semantic
    # contracts, however, so remap the signed field into [0, 1] before applying
    # those bounds. This prevents the final ORM safety clamp from silently
    # flattening many unrelated roles to the same 0.16/0.98 extremes.
    rough_field = np.clip(rough_field / 6.0 + 0.5, 0.0, 1.0)
    roughness = role.roughness[0] + rough_field * (role.roughness[1] - role.roughness[0])
    metal_field = normalized(macro * 0.54 + meso * 0.34 + micro * 0.12)
    metal_field = np.clip(metal_field / 6.0 + 0.5, 0.0, 1.0)
    metallic = role.metallic[0] + metal_field * (role.metallic[1] - role.metallic[0])

    # Recess-scale AO remains restrained; major contact shadows come from authored geometry.
    cavities = np.clip((-height + 0.18) / 1.18, 0.0, 1.0)
    ao_floor = 0.77 if role.kind == "dust" else 0.88 if role.kind in {"regolith", "strata", "fresh_break"} else 0.91
    ao = np.clip(0.985 - cavities * (0.985 - ao_floor), ao_floor, 1.0)

    # Tiny deterministic flecks exist only in mineral-bearing roles and never emit.
    if role.kind == "mineral":
        flecks = rng.random((size, size), dtype=np.float32)
        flecks = (flecks > 0.986).astype(np.float32)
        basecolor = np.clip(basecolor + flecks[:, :, None] * np.asarray((0.20, 0.16, 0.08), dtype=np.float32), 0.0, 0.90)
        metallic = np.clip(metallic + flecks * 0.18, 0.0, 0.92)

    return {
        "basecolor": basecolor,
        "normal": normal_from_height(height, role.normal_strength),
        "orm": np.stack((ao, np.clip(roughness, 0.16, 0.98), np.clip(metallic, 0.0, 0.95)), axis=2),
    }


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
    selected = args.roles or list(ROLES)
    artifacts = []
    roughness_metrics = {}
    for name in selected:
        role = ROLES[name]
        for channel, pixels in role_maps(name, role, args.size).items():
            output = args.output_dir / f"{name}_{channel}.png"
            save_rgb(output, pixels)
            artifacts.append({
                "role": name,
                "channel": channel,
                "path": output.name,
                "sha256": sha256(output),
                "bytes": output.stat().st_size,
                "width": args.size,
                "height": args.size,
            })
            if channel == "orm":
                roughness = pixels[:, :, 1]
                roughness_metrics[name] = {
                    "mean": float(np.mean(roughness)),
                    "p10": float(np.percentile(roughness, 10.0)),
                    "p90": float(np.percentile(roughness, 90.0)),
                    "declaredRange": list(role.roughness),
                }
    ktx_artifacts = []
    if args.toktx:
        args.ktx_output_dir.mkdir(parents=True, exist_ok=True)
        for artifact in artifacts:
            source = args.output_dir / artifact["path"]
            target = args.ktx_output_dir / source.with_suffix(".ktx2").name
            command = [str(args.toktx.resolve()), "--t2", "--encode", "uastc", "--uastc_quality", "3"]
            if artifact["channel"] in {"normal", "orm"}:
                command.append("--linear")
            command += [str(target.resolve()), str(source.resolve())]
            completed = subprocess.run(command, capture_output=True, text=True)
            if completed.returncode != 0:
                raise RuntimeError(f"toktx failed for {source.name}: {completed.stderr or completed.stdout}")
            ktx_artifacts.append({
                "role": artifact["role"], "channel": artifact["channel"],
                "path": target.name, "sha256": sha256(target), "bytes": target.stat().st_size,
            })
    manifest = {
        "schema": "spaceface.geologyLandmarkSurfaceMaps.v1",
        "generator": Path(__file__).as_posix(),
        "generatorSha256": sha256(Path(__file__)),
        "size": args.size,
        "roles": [{
            "name": name,
            "constructionUse": CONSTRUCTION_USE[name],
            "physicalScaleMm": list(ROLES[name].physical_scale_mm),
            "emissive": False,
        } for name in selected],
        "artifacts": artifacts,
        "ktx2Artifacts": ktx_artifacts,
        "ormChannels": "R=AO,G=Roughness,B=Metallic",
        "normalConvention": "OpenGL tangent space",
        "roughnessMetrics": roughness_metrics,
        "status": "candidate-not-promoted",
    }
    report = args.output_dir / "surface-map-build.json"
    report.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    print(json.dumps({"ok": True, "report": str(report), "artifacts": len(artifacts), "ktx2": len(ktx_artifacts)}))


if __name__ == "__main__":
    main()

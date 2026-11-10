"""Stronger Hitch role maps: readable normals, ORM variation, and heat-aware ceramic.

V6 maps were technically present but near-flat in the game camera. This pass keeps the same
tileable role files and raises amplitude so coated paint, brushed metal, ceramic, and radiators
actually separate under IBL. Mesh-derived AO is composited on top by the V7 builder.
"""
from __future__ import annotations

from pathlib import Path

import numpy as np

from surface_maps_v2 import (
    SurfaceProfile,
    _directionality,
    _linear_to_srgb,
    _localized_chip_mask,
    _material_field,
    _normalized,
    _recess_mask,
    _scratch_mask,
)


REMASTER_ID = "kestrel-hitch-polish-v7-surface"

PROFILES = {
    "hull": SurfaceProfile((0.065, 0.075, 0.085), 0.018, 0.006, 0.43, 0.12, 0.025, 0.085,
                           macro_waviness=0.042, orange_peel=0.028, scratch_density=22,
                           chip_density=0.018, recess_dust=0.22, coated_metal=True),
    "mechanical": SurfaceProfile((0.035, 0.042, 0.048), 0.012, 0.005, 0.38, 0.11, 0.82, 0.11,
                                 macro_waviness=0.018, orange_peel=0.010, scratch_density=42,
                                 recess_dust=0.20, brushed=True),
    "armor_dark": SurfaceProfile((0.052, 0.063, 0.077), 0.016, 0.005, 0.58, 0.11, 0.28, 0.095,
                                 macro_waviness=0.038, orange_peel=0.022, scratch_density=16,
                                 chip_density=0.012, recess_dust=0.16, coated_metal=True),
    "brushed_metal": SurfaceProfile((0.19, 0.205, 0.215), 0.010, 0.010, 0.34, 0.10, 0.92, 0.16,
                                    brushed=True, macro_waviness=0.014, orange_peel=0.008,
                                    scratch_density=48, recess_dust=0.08),
    "frontier_cyan": SurfaceProfile((0.018, 0.16, 0.19), 0.022, 0.010, 0.48, 0.12, 0.035, 0.10,
                                    macro_waviness=0.032, orange_peel=0.040, scratch_density=12,
                                    chip_density=0.008, recess_dust=0.12, coated_metal=True),
    "warning_orange": SurfaceProfile((0.32, 0.080, 0.012), 0.024, 0.010, 0.52, 0.13, 0.03, 0.11,
                                     macro_waviness=0.032, orange_peel=0.040, scratch_density=16,
                                     chip_density=0.012, recess_dust=0.14, coated_metal=True),
    "repair_green": SurfaceProfile((0.035, 0.105, 0.052), 0.032, 0.014, 0.67, 0.14, 0.025, 0.12,
                                   macro_waviness=0.048, orange_peel=0.070, scratch_density=18,
                                   chip_density=0.016, recess_dust=0.28, coated_metal=True),
    "rubber": SurfaceProfile((0.014, 0.018, 0.020), 0.022, 0.016, 0.84, 0.09, 0.0, 0.12,
                             macro_waviness=0.028, orange_peel=0.090, scratch_density=8,
                             recess_dust=0.10),
    "engine_ceramic": SurfaceProfile((0.055, 0.046, 0.039), 0.028, 0.012, 0.72, 0.14, 0.02, 0.18,
                                     macro_waviness=0.036, orange_peel=0.040, scratch_density=10,
                                     recess_dust=0.18),
    "radiator": SurfaceProfile((0.026, 0.031, 0.035), 0.018, 0.014, 0.50, 0.13, 0.70, 0.16,
                               brushed=True, macro_waviness=0.022, orange_peel=0.012,
                               scratch_density=30, recess_dust=0.16),
}


def generate_maps(role: str, width: int, height: int) -> dict[str, np.ndarray]:
    profile = PROFILES[role]
    seed = 0x48544348 + list(PROFILES).index(role) * 1009
    broad, detail, micro = _material_field(height, width, seed, profile.brushed)
    scratches = _scratch_mask(height, width, seed + 131, profile.scratch_density, profile.brushed)
    chips = _localized_chip_mask(broad, detail, profile.chip_density, seed + 173)
    recess = _recess_mask(broad, detail)

    base = np.asarray(profile.base_rgb, dtype=np.float32)[None, None, :]
    warm_cool = np.stack((broad * 0.90, broad * 0.25, -broad * 0.45), axis=-1)
    scalar = broad[:, :, None] * profile.albedo_macro + detail[:, :, None] * profile.albedo_micro
    base_rgb = np.clip(base * (1.0 + scalar) + warm_cool * profile.albedo_micro * 0.28, 0.003, 0.92)
    if role == "engine_ceramic":
        # Straw-to-blue heat tint on the hot face, not a rainbow toy film.
        heat = np.clip(broad * 0.55 + detail * 0.20, -1.0, 1.0)
        tint = np.stack((0.08 * heat, -0.03 * heat, -0.10 * heat), axis=-1)
        base_rgb = np.clip(base_rgb + tint, 0.004, 0.55)
    base_rgb *= (1.0 - recess[:, :, None] * profile.recess_dust * 0.22)
    base_rgb *= (1.0 - scratches[:, :, None] * (0.045 if profile.brushed else 0.080))
    if profile.coated_metal:
        exposed = np.asarray((0.19, 0.205, 0.215), dtype=np.float32)[None, None, :]
        base_rgb = base_rgb * (1.0 - chips[:, :, None] * 0.78) + exposed * chips[:, :, None] * 0.78

    ao = np.clip(0.86 + broad * 0.07 + detail * 0.035 - recess * 0.22 - scratches * 0.04, 0.42, 1.0)
    roughness = np.clip(
        profile.roughness + broad * profile.roughness_variation * 0.70
        + detail * profile.roughness_variation * 0.35
        + micro * profile.roughness_variation * 0.16
        + recess * profile.recess_dust * 0.28
        + scratches * (0.10 if not profile.brushed else -0.07)
        - chips * 0.16,
        0.16,
        0.96,
    )
    metallic = np.clip(profile.metallic + broad * min(0.06, max(0.01, profile.metallic * 0.04)), 0.0, 1.0)
    if profile.coated_metal:
        metallic = metallic * (1.0 - chips) + chips * 0.84
    orm_rgb = np.stack((ao, roughness, metallic), axis=-1).astype(np.float32)

    height_field = _normalized(
        broad * profile.macro_waviness
        + detail * 0.055
        + micro * profile.orange_peel
        - scratches * 0.85
        - chips * 0.55
        - recess * 0.18
    )
    dy, dx = np.gradient(height_field)
    nx = -dx * profile.normal_strength
    ny = -dy * profile.normal_strength
    nz = np.ones_like(nx)
    length = np.sqrt(nx * nx + ny * ny + nz * nz)
    normal_rgb = np.stack((nx / length, ny / length, nz / length), axis=-1)
    normal_rgb = (normal_rgb * 0.5 + 0.5).astype(np.float32)

    base_rgb = _linear_to_srgb(base_rgb)
    alpha = np.ones((height, width, 1), dtype=np.float32)
    return {
        "basecolor": np.concatenate((base_rgb, alpha), axis=-1).astype(np.float32, copy=False),
        "orm": np.concatenate((orm_rgb, alpha), axis=-1).astype(np.float32, copy=False),
        "normal": np.concatenate((normal_rgb, alpha), axis=-1).astype(np.float32, copy=False),
    }


def apply_to_blender_images(bpy_module) -> list[dict]:
    report = []
    for role, profile in PROFILES.items():
        names = {channel: f"{role}_{channel}.png" for channel in ("basecolor", "orm", "normal")}
        images = {channel: bpy_module.data.images.get(name) for channel, name in names.items()}
        missing = [name for channel, name in names.items() if not images[channel] or images[channel].size[0] == 0]
        if missing:
            raise RuntimeError(f"missing packed Kestrel surface maps: {', '.join(missing)}")
        sizes = {(int(image.size[0]), int(image.size[1])) for image in images.values()}
        if len(sizes) != 1:
            raise RuntimeError(f"surface map dimensions disagree for {role}: {sorted(sizes)}")
        width, height = next(iter(sizes))
        generated = generate_maps(role, width, height)
        for channel, image in images.items():
            rgba = generated[channel]
            image.pixels.foreach_set(rgba.reshape(-1))
            image.update()
            image.pack()
            report.append({
                "image": names[channel],
                "role": role,
                "channel": channel,
                "width": width,
                "height": height,
                "mean": [float(value) for value in np.mean(rgba[:, :, :3], axis=(0, 1))],
                "std": [float(value) for value in np.std(rgba[:, :, :3], axis=(0, 1))],
                "directionality": _directionality(rgba[:, :, :3]),
                "metallicTarget": profile.metallic if channel == "orm" else None,
                "macroWaviness": profile.macro_waviness,
                "orangePeel": profile.orange_peel,
                "scratchDensity": profile.scratch_density,
                "chipDensity": profile.chip_density,
                "recessDust": profile.recess_dust,
            })
    return report


def composite_ao_into_orm(bpy_module, role: str, ao: np.ndarray) -> None:
    image = bpy_module.data.images.get(f"{role}_orm.png")
    if image is None or image.size[0] == 0:
        raise RuntimeError(f"missing ORM image for {role}")
    width, height = int(image.size[0]), int(image.size[1])
    pixels = np.empty(width * height * 4, dtype=np.float32)
    image.pixels.foreach_get(pixels)
    rgba = pixels.reshape((height, width, 4))
    ao_map = np.clip(ao.astype(np.float32), 0.0, 1.0)
    if ao_map.shape != (height, width):
        raise RuntimeError(f"AO shape {ao_map.shape} != ORM {(height, width)}")
    rgba[:, :, 0] = np.clip(rgba[:, :, 0] * (0.35 + 0.65 * ao_map), 0.20, 1.0)
    image.pixels.foreach_set(rgba.reshape(-1))
    image.update()
    image.pack()


def write_preview_images(bpy_module, output_dir: Path) -> list[Path]:
    output_dir = output_dir.resolve()
    output_dir.mkdir(parents=True, exist_ok=True)
    written = []
    for role in PROFILES:
        for channel in ("basecolor", "orm", "normal"):
            image = bpy_module.data.images[f"{role}_{channel}.png"]
            target = output_dir / f"{role}_{channel}.png"
            image.filepath_raw = str(target)
            image.file_format = "PNG"
            image.save()
            written.append(target)
    return written

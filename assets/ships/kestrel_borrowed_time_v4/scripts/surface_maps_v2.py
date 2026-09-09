"""Deterministic, role-specific PBR maps for the Borrowed Time Kestrel.

The donor maps repeat the same long horizontal scratch field in base color, ORM, and normal.
That pattern is unrelated to the ship's geometry and reads as texture wallpaper at the game camera.
This module replaces it with restrained material response. Structural seams, fasteners, decals,
and edge wear remain geometry/decal responsibilities until a curvature-aware bake is authored.
"""
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import numpy as np


REMASTER_ID = "kestrel-role-surface-v6-material-truth"


@dataclass(frozen=True)
class SurfaceProfile:
    # Physical linear-light reflectance. Base-color PNGs are encoded to sRGB
    # only after the material variation, wear, and dust operations are applied.
    base_rgb: tuple[float, float, float]
    albedo_macro: float
    albedo_micro: float
    roughness: float
    roughness_variation: float
    metallic: float
    normal_strength: float
    brushed: bool = False
    macro_waviness: float = 0.08
    orange_peel: float = 0.08
    scratch_density: int = 0
    chip_density: float = 0.0
    recess_dust: float = 0.0
    coated_metal: bool = False


PROFILES = {
    # Painted aerospace panels: broad shallow waviness and orange peel are separate frequency
    # bands. Sparse chips reveal metal only where the coating is actually broken.
    "hull": SurfaceProfile((0.065, 0.075, 0.085), 0.008, 0.002, 0.43, 0.055, 0.025, 0.010,
                           macro_waviness=0.005, orange_peel=0.005, scratch_density=18,
                           chip_density=0.014, recess_dust=0.12, coated_metal=True),
    # Exposed mechanisms carry directional machining and service scratches, not paint chips.
    "mechanical": SurfaceProfile((0.035, 0.042, 0.048), 0.006, 0.002, 0.40, 0.055, 0.78, 0.015,
                                 macro_waviness=0.003, orange_peel=0.003, scratch_density=34,
                                 recess_dust=0.16, brushed=True),
    "armor_dark": SurfaceProfile((0.052, 0.063, 0.077), 0.008, 0.002, 0.60, 0.055, 0.30, 0.012,
                                 macro_waviness=0.006, orange_peel=0.006, scratch_density=12,
                                 chip_density=0.008, recess_dust=0.10, coated_metal=True),
    "brushed_metal": SurfaceProfile((0.19, 0.205, 0.215), 0.006, 0.006, 0.36, 0.055, 0.92, 0.025,
                                    brushed=True, macro_waviness=0.003, orange_peel=0.002,
                                    scratch_density=42, recess_dust=0.06),
    "frontier_cyan": SurfaceProfile((0.018, 0.16, 0.19), 0.015, 0.006, 0.50, 0.080, 0.035, 0.035,
                                    macro_waviness=0.018, orange_peel=0.030, scratch_density=10,
                                    chip_density=0.006, recess_dust=0.08, coated_metal=True),
    "warning_orange": SurfaceProfile((0.32, 0.080, 0.012), 0.016, 0.006, 0.54, 0.085, 0.03, 0.038,
                                     macro_waviness=0.018, orange_peel=0.030, scratch_density=14,
                                     chip_density=0.009, recess_dust=0.10, coated_metal=True),
    # Field repair paint is intentionally rougher, brushier, and dirtier than factory coating.
    "repair_green": SurfaceProfile((0.035, 0.105, 0.052), 0.024, 0.009, 0.67, 0.100, 0.025, 0.052,
                                   macro_waviness=0.030, orange_peel=0.055, scratch_density=16,
                                   chip_density=0.012, recess_dust=0.20, coated_metal=True),
    # Rubber gets molded grain and compression scuffing; no metallic substrate or paint wear.
    "rubber": SurfaceProfile((0.014, 0.018, 0.020), 0.016, 0.012, 0.84, 0.070, 0.0, 0.070,
                             macro_waviness=0.015, orange_peel=0.080, scratch_density=6,
                             recess_dust=0.08),
    # Refractory engine liners are nonmetallic, heat-darkened, and rougher than
    # the adjacent machined alloy. This is a real material identity rather than
    # a tint of the generic mechanical surface.
    "engine_ceramic": SurfaceProfile((0.055, 0.046, 0.039), 0.016, 0.006, 0.74, 0.070, 0.02, 0.040,
                                     macro_waviness=0.016, orange_peel=0.025, scratch_density=8,
                                     recess_dust=0.14),
    # Radiator faces use a directional, oxidized metallic response. The darker
    # albedo and mid roughness keep them distinct from bright structural alloy.
    "radiator": SurfaceProfile((0.026, 0.031, 0.035), 0.012, 0.010, 0.52, 0.080, 0.68, 0.045,
                               brushed=True, macro_waviness=0.010, orange_peel=0.006,
                               scratch_density=26, recess_dust=0.11),
}

GENERATED_NEW_ROLES = frozenset({"engine_ceramic", "radiator"})


def _normalized(field: np.ndarray) -> np.ndarray:
    field = field.astype(np.float32, copy=False)
    field -= np.mean(field, dtype=np.float64)
    std = float(np.std(field, dtype=np.float64))
    if std > 1e-7:
        field /= std
    return np.clip(field, -3.0, 3.0)


def _linear_to_srgb(value: np.ndarray) -> np.ndarray:
    """Encode physical linear base color for an sRGB-tagged glTF texture."""
    value = np.clip(value, 0.0, 1.0).astype(np.float32, copy=False)
    return np.where(
        value <= 0.0031308,
        value * 12.92,
        1.055 * np.power(value, 1.0 / 2.4) - 0.055,
    ).astype(np.float32, copy=False)


def _spectral_noise(height: int, width: int, seed: int, scale: float, *, anisotropy: float = 1.0) -> np.ndarray:
    """Seamless band-limited noise without directional scratch primitives."""
    rng = np.random.default_rng(seed)
    fy = np.fft.fftfreq(height)[:, None]
    fx = np.fft.rfftfreq(width)[None, :]
    radius = np.sqrt((fx * anisotropy) ** 2 + fy ** 2)
    cutoff = max(1.0 / max(height, width), 1.0 / max(scale, 1.0))
    spectrum = np.exp(-0.5 * (radius / cutoff) ** 2)
    spectrum[0, 0] = 0.0
    phase = rng.normal(size=spectrum.shape) + 1j * rng.normal(size=spectrum.shape)
    return _normalized(np.fft.irfft2(phase * spectrum, s=(height, width)).real)


def _material_field(height: int, width: int, seed: int, brushed: bool) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    macro = _spectral_noise(height, width, seed + 11, max(width, height) / 18.0)
    meso = _spectral_noise(height, width, seed + 29, max(width, height) / 52.0)
    micro = _spectral_noise(height, width, seed + 47, max(width, height) / 180.0)
    if brushed:
        # Fine manufacturing grain is intentionally directional, but continuous and low contrast.
        grain = _spectral_noise(height, width, seed + 73, max(width, height) / 260.0, anisotropy=0.14)
        micro = _normalized(micro * 0.28 + grain * 0.72)
    broad = _normalized(macro * 0.70 + meso * 0.30)
    detail = _normalized(meso * 0.30 + micro * 0.70)
    orange_peel = _spectral_noise(height, width, seed + 91, max(width, height) / 380.0)
    return broad, detail, orange_peel


def _scratch_mask(height: int, width: int, seed: int, count: int, brushed: bool) -> np.ndarray:
    """Sparse finite scratches, with directional service marks only on manufactured metal."""
    if count <= 0:
        return np.zeros((height, width), dtype=np.float32)
    rng = np.random.default_rng(seed)
    yy, xx = np.mgrid[0:height, 0:width].astype(np.float32)
    xx /= max(1, width - 1)
    yy /= max(1, height - 1)
    mask = np.zeros((height, width), dtype=np.float32)
    for _ in range(count):
        cx, cy = rng.uniform(0.06, 0.94, size=2)
        angle = rng.normal(0.0, 0.12) if brushed else rng.uniform(-np.pi, np.pi)
        half_length = rng.uniform(0.025, 0.13 if brushed else 0.085)
        half_width = rng.uniform(0.00055, 0.00145)
        dx, dy = np.cos(angle), np.sin(angle)
        along = (xx - cx) * dx + (yy - cy) * dy
        across = -(xx - cx) * dy + (yy - cy) * dx
        body = np.exp(-0.5 * (across / half_width) ** 2)
        ends = np.clip(1.0 - np.maximum(0.0, np.abs(along) - half_length) / (half_length * 0.18), 0.0, 1.0)
        mask = np.maximum(mask, body * ends)
    return np.clip(mask, 0.0, 1.0)


def _localized_chip_mask(broad: np.ndarray, detail: np.ndarray, density: float, seed: int) -> np.ndarray:
    if density <= 0:
        return np.zeros_like(broad, dtype=np.float32)
    rng = np.random.default_rng(seed)
    height, width = broad.shape
    yy, xx = np.mgrid[0:height, 0:width].astype(np.float32)
    xx /= max(1, width - 1)
    yy /= max(1, height - 1)
    access = np.zeros_like(broad, dtype=np.float32)
    for _ in range(5):
        cx, cy = rng.uniform(0.08, 0.92, size=2)
        sx, sy = rng.uniform(0.035, 0.12, size=2)
        access = np.maximum(access, np.exp(-0.5 * (((xx - cx) / sx) ** 2 + ((yy - cy) / sy) ** 2)))
    candidate = _normalized(detail * 0.68 + broad * 0.32) + access * 1.35
    threshold = float(np.quantile(candidate, 1.0 - density))
    chips = (candidate >= threshold).astype(np.float32) * np.clip(access * 1.8, 0.0, 1.0)
    # One-pixel shoulder creates a chipped-paint boundary without outlining every UV island.
    shoulder = np.maximum.reduce((chips, np.roll(chips, 1, 0), np.roll(chips, -1, 0),
                                  np.roll(chips, 1, 1), np.roll(chips, -1, 1)))
    return np.clip(chips * 0.8 + shoulder * 0.2, 0.0, 1.0)


def _recess_mask(broad: np.ndarray, detail: np.ndarray) -> np.ndarray:
    """Low-frequency accumulation proxy; deliberately excludes high-frequency uniform dirt."""
    return np.clip((-broad - 0.30) * 0.55 + (-detail - 1.0) * 0.10, 0.0, 1.0)


def generate_maps(role: str, width: int, height: int) -> dict[str, np.ndarray]:
    profile = PROFILES[role]
    seed = 0x4B455354 + list(PROFILES).index(role) * 1009
    broad, detail, micro = _material_field(height, width, seed, profile.brushed)
    scratches = _scratch_mask(height, width, seed + 131, profile.scratch_density, profile.brushed)
    chips = _localized_chip_mask(broad, detail, profile.chip_density, seed + 173)
    recess = _recess_mask(broad, detail)

    base = np.asarray(profile.base_rgb, dtype=np.float32)[None, None, :]
    warm_cool = np.stack((broad * 0.90, broad * 0.25, -broad * 0.45), axis=-1)
    scalar = broad[:, :, None] * profile.albedo_macro + detail[:, :, None] * profile.albedo_micro
    base_rgb = np.clip(base * (1.0 + scalar) + warm_cool * profile.albedo_micro * 0.20, 0.003, 0.92)
    base_rgb *= (1.0 - recess[:, :, None] * profile.recess_dust * 0.18)
    base_rgb *= (1.0 - scratches[:, :, None] * (0.035 if profile.brushed else 0.065))
    if profile.coated_metal:
        exposed = np.asarray((0.19, 0.205, 0.215), dtype=np.float32)[None, None, :]
        base_rgb = base_rgb * (1.0 - chips[:, :, None] * 0.78) + exposed * chips[:, :, None] * 0.78

    ao = np.clip(0.975 + broad * 0.012 + detail * 0.006, 0.91, 1.0)
    roughness = np.clip(
        profile.roughness + broad * profile.roughness_variation * 0.52
        + detail * profile.roughness_variation * 0.25
        + micro * profile.roughness_variation * 0.10
        + recess * profile.recess_dust * 0.20
        + scratches * (0.08 if not profile.brushed else -0.055)
        - chips * 0.13,
        0.20,
        0.96,
    )
    metallic = np.clip(profile.metallic + broad * min(0.035, profile.metallic * 0.025), 0.0, 1.0)
    if profile.coated_metal:
        metallic = metallic * (1.0 - chips) + chips * 0.82
    orm_rgb = np.stack((ao, roughness, metallic), axis=-1).astype(np.float32)

    height_field = _normalized(
        broad * profile.macro_waviness
        + detail * 0.035
        + micro * profile.orange_peel
        - scratches * 0.72
        - chips * 0.46
        - recess * 0.12
    )
    dy, dx = np.gradient(height_field)
    nx = -dx * profile.normal_strength
    ny = -dy * profile.normal_strength
    nz = np.ones_like(nx)
    length = np.sqrt(nx * nx + ny * ny + nz * nz)
    normal_rgb = np.stack((nx / length, ny / length, nz / length), axis=-1)
    normal_rgb = (normal_rgb * 0.5 + 0.5).astype(np.float32)

    # Blender and glTF tag this PNG as sRGB. Store the transfer-encoded value
    # so the renderer recovers the physical linear reflectance above instead of
    # decoding an already-linear number a second time.
    base_rgb = _linear_to_srgb(base_rgb)
    alpha = np.ones((height, width, 1), dtype=np.float32)
    return {
        "basecolor": np.concatenate((base_rgb, alpha), axis=-1).astype(np.float32, copy=False),
        "orm": np.concatenate((orm_rgb, alpha), axis=-1).astype(np.float32, copy=False),
        "normal": np.concatenate((normal_rgb, alpha), axis=-1).astype(np.float32, copy=False),
    }


def _directionality(rgb: np.ndarray) -> float:
    luminance = rgb[:, :, 0] * 0.2126 + rgb[:, :, 1] * 0.7152 + rgb[:, :, 2] * 0.0722
    gx = float(np.mean(np.abs(np.diff(luminance, axis=1))))
    gy = float(np.mean(np.abs(np.diff(luminance, axis=0))))
    return gx / max(gy, 1e-8)


def apply_to_blender_images(bpy_module) -> list[dict]:
    report = []
    for role, profile in PROFILES.items():
        names = {channel: f"{role}_{channel}.png" for channel in ("basecolor", "orm", "normal")}
        images = {channel: bpy_module.data.images.get(name) for channel, name in names.items()}
        if role in GENERATED_NEW_ROLES:
            for channel, name in names.items():
                if images[channel] is not None and images[channel].size[0] > 0:
                    continue
                image = bpy_module.data.images.new(name, width=1024, height=1024, alpha=True)
                image.colorspace_settings.name = "sRGB" if channel == "basecolor" else "Non-Color"
                images[channel] = image
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

"""Deterministic semantic PBR texture primitives shared by Blender asset remasters."""
from __future__ import annotations

from dataclasses import dataclass

import numpy as np


@dataclass(frozen=True)
class SurfaceProfile:
    base_rgb: tuple[float, float, float]
    roughness: float
    metallic: float
    albedo_strength: float
    roughness_variation: float
    normal_strength: float


def normalized(field: np.ndarray) -> np.ndarray:
    value = field.astype(np.float32, copy=True)
    value -= np.mean(value, dtype=np.float64)
    deviation = float(np.std(value, dtype=np.float64))
    if deviation > 1e-7:
        value /= deviation
    return np.clip(value, -3.0, 3.0)


def spectral_noise(height: int, width: int, seed: int, feature_px: float, *, anisotropy: float = 1.0) -> np.ndarray:
    """Seamless, band-limited noise with a physical feature-size control."""
    rng = np.random.default_rng(seed)
    fy = np.fft.fftfreq(height)[:, None]
    fx = np.fft.rfftfreq(width)[None, :]
    radius = np.sqrt((fx * anisotropy) ** 2 + fy ** 2)
    cutoff = max(1.0 / max(height, width), 1.0 / max(feature_px, 1.0))
    spectrum = np.exp(-0.5 * (radius / cutoff) ** 2)
    spectrum[0, 0] = 0.0
    phase = rng.normal(size=spectrum.shape) + 1j * rng.normal(size=spectrum.shape)
    return normalized(np.fft.irfft2(phase * spectrum, s=(height, width)).real)


def manufactured_field(height: int, width: int, seed: int, *, brushed: bool = False) -> tuple[np.ndarray, np.ndarray]:
    macro = spectral_noise(height, width, seed + 11, max(width, height) / 14.0)
    meso = spectral_noise(height, width, seed + 29, max(width, height) / 48.0)
    micro = spectral_noise(height, width, seed + 47, max(width, height) / 190.0,
                           anisotropy=0.16 if brushed else 1.0)
    structure = normalized(macro * 0.68 + meso * 0.32)
    detail = normalized(meso * 0.34 + micro * 0.66)
    return structure, detail


def periodic_voronoi_fractures(height: int, width: int, seed: int, *, cells: int = 18) -> np.ndarray:
    """Sparse seamless rock fractures from warped periodic Voronoi boundaries."""
    rng = np.random.default_rng(seed)
    y, x = np.mgrid[0:height, 0:width].astype(np.float32)
    u = x / max(1, width)
    v = y / max(1, height)
    warp_u = spectral_noise(height, width, seed + 101, max(width, height) / 5.0) * 0.022
    warp_v = spectral_noise(height, width, seed + 131, max(width, height) / 5.0) * 0.022
    u = np.mod(u + warp_u, 1.0)
    v = np.mod(v + warp_v, 1.0)
    nearest = np.full((height, width), np.inf, dtype=np.float32)
    second = np.full((height, width), np.inf, dtype=np.float32)
    for point_u, point_v in rng.random((cells, 2), dtype=np.float32):
        du = np.abs(u - point_u)
        dv = np.abs(v - point_v)
        du = np.minimum(du, 1.0 - du)
        dv = np.minimum(dv, 1.0 - dv)
        distance = du * du + dv * dv
        replace = distance < nearest
        second = np.where(replace, nearest, np.minimum(second, distance))
        nearest = np.where(replace, distance, nearest)
    boundary_gap = np.sqrt(second) - np.sqrt(nearest)
    primary = np.exp(-boundary_gap * 145.0)
    # Break the network into varied geological segments instead of equally strong cell outlines.
    strength = np.clip(
        0.42 + spectral_noise(height, width, seed + 173, max(width, height) / 8.0) * 0.30,
        0.0,
        1.0,
    )
    return np.clip(primary * strength, 0.0, 1.0).astype(np.float32)


def geological_field(height: int, width: int, seed: int) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Seamless macro strata, fractures, and regolith at deliberately different scales."""
    y, x = np.mgrid[0:height, 0:width].astype(np.float32)
    u = x / max(1, width)
    v = y / max(1, height)
    warp = spectral_noise(height, width, seed + 7, max(width, height) / 7.0)
    macro = spectral_noise(height, width, seed + 19, max(width, height) / 6.0)
    strata_phase = (v * 9.0 + u * 2.25 + warp * 0.16) * np.pi * 2.0
    strata = normalized(np.sin(strata_phase) * 0.72 + np.sin(strata_phase * 0.47 + 1.3) * 0.28)
    fracture = periodic_voronoi_fractures(height, width, seed + 79)
    regolith = normalized(
        spectral_noise(height, width, seed + 31, max(width, height) / 34.0) * 0.30
        + spectral_noise(height, width, seed + 53, max(width, height) / 170.0) * 0.70
    )
    return normalized(macro * 0.42 + strata * 0.58), fracture, regolith


def normal_from_height(height_field: np.ndarray, strength: float) -> np.ndarray:
    dy, dx = np.gradient(height_field.astype(np.float32, copy=False))
    nx = -dx * strength
    ny = -dy * strength
    nz = np.ones_like(nx)
    length = np.sqrt(nx * nx + ny * ny + nz * nz)
    normal = np.stack((nx / length, ny / length, nz / length), axis=-1)
    return (normal * 0.5 + 0.5).astype(np.float32)


def pack_surface(
    profile: SurfaceProfile,
    albedo_field: np.ndarray,
    height_field: np.ndarray,
    roughness_field: np.ndarray,
    *,
    ao_field: np.ndarray | None = None,
    metallic_field: np.ndarray | None = None,
) -> dict[str, np.ndarray]:
    h, w = albedo_field.shape
    base = np.asarray(profile.base_rgb, dtype=np.float32)[None, None, :]
    albedo = np.clip(base * (1.0 + albedo_field[:, :, None] * profile.albedo_strength), 0.002, 0.92)
    roughness = np.clip(
        profile.roughness + roughness_field * profile.roughness_variation,
        0.12,
        0.98,
    )
    ao = np.ones((h, w), dtype=np.float32) if ao_field is None else np.clip(ao_field, 0.45, 1.0)
    metallic = np.full((h, w), profile.metallic, dtype=np.float32) if metallic_field is None else np.clip(metallic_field, 0.0, 1.0)
    alpha = np.ones((h, w, 1), dtype=np.float32)
    return {
        "basecolor": np.concatenate((albedo, alpha), axis=-1),
        "normal": np.concatenate((normal_from_height(height_field, profile.normal_strength), alpha), axis=-1),
        "orm": np.concatenate((np.stack((ao, roughness, metallic), axis=-1), alpha), axis=-1),
    }

"""Semantic surface recipes for the live Helios trade hub and Rock A."""
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
import sys

import numpy as np
try:
    from PIL import Image
except ModuleNotFoundError:  # Blender's bundled Python intentionally stays dependency-light.
    Image = None

ROOT = Path(__file__).resolve().parents[4]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from tools.art.surface_foundry import (  # noqa: E402
    SurfaceProfile,
    normalized,
)


REMASTER_ID = "helios-functional-surfaces-v3"

ROCK023_ROOT = ROOT / "assets/third_party/helios_v8/ambientcg/Rock023"
ROCK_REFERENCE_FILES = {
    "basecolor": ROCK023_ROOT / "Rock023_1K-JPG_Color.jpg",
    "normal": ROCK023_ROOT / "Rock023_1K-JPG_NormalGL.jpg",
    "ao": ROCK023_ROOT / "Rock023_1K-JPG_AmbientOcclusion.jpg",
    "roughness": ROCK023_ROOT / "Rock023_1K-JPG_Roughness.jpg",
    "license": ROCK023_ROOT / "LICENSE_CC0.txt",
}

@dataclass(frozen=True)
class ManufacturedProfile:
    base_rgb: tuple[float, float, float]
    roughness: float
    roughness_variation: float
    metallic: float
    normal_strength: float
    macro_waviness: float
    micro_detail: float
    scratch_density: int
    scratch_directional: bool = False
    chip_density: float = 0.0
    recess_dust: float = 0.0
    coated_metal: bool = False


PROFILES = {
    # These roles intentionally use different physical frequency bands and response ranges.
    # Hull is coated structural steel; armor is a tougher, rougher coating rather than hull tint.
    "hull": ManufacturedProfile((0.185, 0.197, 0.212), 0.51, 0.14, 0.035, 0.11,
                                0.12, 0.15, 12, chip_density=0.004,
                                recess_dust=0.12, coated_metal=True),
    "armor": ManufacturedProfile((0.135, 0.146, 0.162), 0.58, 0.15, 0.08, 0.12,
                                 0.08, 0.12, 18, chip_density=0.006,
                                 recess_dust=0.10, coated_metal=True),
    "armor_dark": ManufacturedProfile((0.048, 0.058, 0.074), 0.69, 0.11, 0.24, 0.10,
                                       0.07, 0.10, 10, chip_density=0.003,
                                       recess_dust=0.08, coated_metal=True),
    # The licensed donor trim previously remained near-white and spatially uniform across the
    # habitat/citadel modules. Keep the maintained light industrial identity, but move it into a
    # physically coated mid-value response with visible orange-peel, course variation, localized
    # substrate exposure, and enough roughness separation to stop reading as molded plastic.
    "structure_light": ManufacturedProfile((0.285, 0.302, 0.326), 0.57, 0.19, 0.025, 0.11,
                                             0.13, 0.18, 18, chip_density=0.004,
                                             recess_dust=0.16, coated_metal=True),
    # Machinery is exposed, directional brushed metal with service scratches and oily recesses.
    "mechanical": ManufacturedProfile((0.105, 0.115, 0.125), 0.43, 0.15, 0.86, 0.15,
                                      0.035, 0.05, 38, scratch_directional=True,
                                      recess_dust=0.18),
    # Radiators are thermally cycled metal, rough and directionally striated rather than glossy trim.
    "radiator": ManufacturedProfile((0.275, 0.105, 0.045), 0.72, 0.12, 0.52, 0.14,
                                    0.035, 0.08, 28, scratch_directional=True,
                                    recess_dust=0.06),
    # Docking faces are impact-polished, abraded, and dirty; they must not read as ordinary hull.
    "docking": ManufacturedProfile((0.085, 0.092, 0.10), 0.61, 0.18, 0.48, 0.16,
                                   0.05, 0.10, 58, scratch_directional=True,
                                   recess_dust=0.24),
    # Service/access modules receive coarser maintenance paint and accumulation in recesses.
    "service": ManufacturedProfile((0.18, 0.195, 0.215), 0.65, 0.17, 0.06, 0.14,
                                   0.17, 0.20, 24, chip_density=0.008,
                                   recess_dust=0.28, coated_metal=True),
    # Non-emissive safety ochre gives orientation and hazard graphics a painted,
    # abraded identity instead of turning every readable marking into a neon light.
    "marking": ManufacturedProfile((0.50, 0.255, 0.048), 0.59, 0.16, 0.025, 0.10,
                                   0.08, 0.14, 20, chip_density=0.010,
                                   recess_dust=0.10, coated_metal=True),
    # Glazing varies only subtly; its identity comes from low roughness and restrained micro scuffing.
    "window": ManufacturedProfile((0.012, 0.035, 0.055), 0.17, 0.035, 0.08, 0.055,
                                  0.008, 0.025, 5, recess_dust=0.02),
    "rock": SurfaceProfile((0.105, 0.088, 0.073), 0.84, 0.045, 0.24, 0.105, 0.28),
    "warm": SurfaceProfile((0.19, 0.075, 0.028), 0.58, 0.38, 0.18, 0.14, 0.36),
}


def _reference_pixels(key: str, width: int, height: int, mode: str) -> np.ndarray:
    path = ROCK_REFERENCE_FILES[key]
    if not path.is_file():
        raise FileNotFoundError(f"missing Rock023 reference channel: {path}")
    if Image is None:
        raise RuntimeError("Rock023 maps must be generated by the CLI surface-foundry step before Blender binding")
    image = Image.open(path).convert(mode)
    if image.size != (width, height):
        image = image.resize((width, height), Image.Resampling.LANCZOS)
    return np.asarray(image, dtype=np.float32) / 255.0


def _rgba(rgb: np.ndarray) -> np.ndarray:
    return np.concatenate((rgb.astype(np.float32), np.ones((*rgb.shape[:2], 1), dtype=np.float32)), axis=-1)


def _rock023_maps(role: str, width: int, height: int) -> dict[str, np.ndarray]:
    color = _reference_pixels("basecolor", width, height, "RGB")
    normal_rgb = _reference_pixels("normal", width, height, "RGB")
    ao_source = _reference_pixels("ao", width, height, "L")
    rough_source = _reference_pixels("roughness", width, height, "L")
    vector = normal_rgb * 2.0 - 1.0
    vector[:, :, :2] *= 0.58 if role == "rock" else 0.42
    vector /= np.maximum(np.linalg.norm(vector, axis=-1, keepdims=True), 1e-6)
    normal = vector * 0.5 + 0.5
    luminance = np.mean(color, axis=-1)
    if role == "rock":
        # Retain photographed strata and fracture logic while moving the value range into dark-space
        # lighting. A slight warm bias keeps it geological rather than neutral concrete.
        basecolor = np.clip(color * np.array([0.43, 0.39, 0.34], dtype=np.float32), 0.015, 0.48)
        ao = np.clip(0.93 + normalized(ao_source) * 0.07, 0.70, 1.0)
        roughness = np.clip(0.82 + normalized(rough_source) * 0.075, 0.58, 0.97)
        metallic = np.clip(0.018 + np.maximum(0.0, luminance - 0.58) * 0.08, 0.01, 0.08)
    else:
        mineral = np.clip((luminance - 0.30) / 0.45, 0.0, 1.0)
        basecolor = np.stack((0.105 + mineral * 0.11, 0.090 + mineral * 0.085, 0.065 + mineral * 0.055), axis=-1)
        ao = np.clip(0.95 + normalized(ao_source) * 0.055, 0.76, 1.0)
        roughness = np.clip(0.58 + normalized(rough_source) * 0.065, 0.42, 0.78)
        metallic = np.clip(0.24 + mineral * 0.32, 0.20, 0.62)
    orm = np.stack((ao, roughness, metallic), axis=-1)
    return {"basecolor": _rgba(basecolor), "normal": _rgba(normal), "orm": _rgba(orm)}


def _spectral_noise(height: int, width: int, seed: int, scale: float, *, anisotropy: float = 1.0) -> np.ndarray:
    """Deterministic seamless, band-limited detail at a declared physical scale."""
    rng = np.random.default_rng(seed)
    fy = np.fft.fftfreq(height)[:, None]
    fx = np.fft.rfftfreq(width)[None, :]
    radius = np.sqrt((fx * anisotropy) ** 2 + fy ** 2)
    cutoff = max(1.0 / max(height, width), 1.0 / max(scale, 1.0))
    spectrum = np.exp(-0.5 * (radius / cutoff) ** 2)
    spectrum[0, 0] = 0.0
    phase = rng.normal(size=spectrum.shape) + 1j * rng.normal(size=spectrum.shape)
    return normalized(np.fft.irfft2(phase * spectrum, s=(height, width)).real).astype(np.float32)


def _station_fields(height: int, width: int, seed: int, directional: bool) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    macro = _spectral_noise(height, width, seed + 11, max(width, height) / 15.0)
    meso = _spectral_noise(height, width, seed + 29, max(width, height) / 56.0)
    micro = _spectral_noise(height, width, seed + 47, max(width, height) / 260.0)
    if directional:
        grain = _spectral_noise(height, width, seed + 71, max(width, height) / 330.0, anisotropy=0.12)
        micro = normalized(micro * 0.22 + grain * 0.78).astype(np.float32)
    return (
        normalized(macro * 0.72 + meso * 0.28).astype(np.float32),
        normalized(meso * 0.36 + micro * 0.64).astype(np.float32),
        micro,
    )


def _scratch_mask(height: int, width: int, seed: int, count: int, directional: bool) -> np.ndarray:
    if count <= 0:
        return np.zeros((height, width), dtype=np.float32)
    rng = np.random.default_rng(seed)
    yy, xx = np.mgrid[0:height, 0:width].astype(np.float32)
    xx /= max(1, width - 1)
    yy /= max(1, height - 1)
    mask = np.zeros((height, width), dtype=np.float32)
    for _ in range(count):
        cx, cy = rng.uniform(0.04, 0.96, size=2)
        angle = rng.normal(0.0, 0.10) if directional else rng.uniform(-np.pi, np.pi)
        half_length = rng.uniform(0.025, 0.17 if directional else 0.10)
        half_width = rng.uniform(0.0006, 0.0017)
        dx, dy = np.cos(angle), np.sin(angle)
        along = (xx - cx) * dx + (yy - cy) * dy
        across = -(xx - cx) * dy + (yy - cy) * dx
        body = np.exp(-0.5 * (across / half_width) ** 2)
        ends = np.clip(1.0 - np.maximum(0.0, np.abs(along) - half_length) / (half_length * 0.18), 0.0, 1.0)
        mask = np.maximum(mask, body * ends)
    return np.clip(mask, 0.0, 1.0)


def _localized_mask(broad: np.ndarray, detail: np.ndarray, density: float, seed: int) -> np.ndarray:
    if density <= 0.0:
        return np.zeros_like(broad, dtype=np.float32)
    rng = np.random.default_rng(seed)
    height, width = broad.shape
    yy, xx = np.mgrid[0:height, 0:width].astype(np.float32)
    xx /= max(1, width - 1)
    yy /= max(1, height - 1)
    access = np.zeros_like(broad, dtype=np.float32)
    for _ in range(7):
        cx, cy = rng.uniform(0.06, 0.94, size=2)
        sx, sy = rng.uniform(0.025, 0.11, size=2)
        access = np.maximum(access, np.exp(-0.5 * (((xx - cx) / sx) ** 2 + ((yy - cy) / sy) ** 2)))
    candidate = normalized(detail * 0.70 + broad * 0.30) + access * 1.45
    threshold = float(np.quantile(candidate, 1.0 - density))
    chips = (candidate >= threshold).astype(np.float32) * np.clip(access * 1.8, 0.0, 1.0)
    shoulder = np.maximum.reduce((chips, np.roll(chips, 1, 0), np.roll(chips, -1, 0),
                                  np.roll(chips, 1, 1), np.roll(chips, -1, 1)))
    return np.clip(chips * 0.78 + shoulder * 0.22, 0.0, 1.0)


def _soft_band(distance: np.ndarray, core: float, feather: float) -> np.ndarray:
    """Return an antialiased 1-at-center band for deterministic manufactured details."""
    value = np.clip((distance - core) / max(feather, 1e-6), 0.0, 1.0)
    value = value * value * (3.0 - 2.0 * value)
    return (1.0 - value).astype(np.float32)


def _periodic_grooves(coordinate: np.ndarray, frequency: float, core: float = 0.035) -> np.ndarray:
    phase = np.mod(coordinate * frequency, 1.0)
    distance = np.minimum(phase, 1.0 - phase)
    return _soft_band(distance, core, core * 1.65)


def _manufactured_structure_fields(role: str, width: int, height: int, seed: int) -> dict[str, np.ndarray]:
    """Author coherent UV-space construction detail instead of material-agnostic grunge.

    These masks are deliberately shared by color, ORM, and normal generation. A seam that is
    visually dark is therefore also recessed and AO-heavy; a docking abrasion is smoother and
    more metallic; radiator grooves have directional relief. The layouts differ by functional
    role so station identity is not a color swap.
    """
    layouts = {
        "hull": (3, 2, 0.42),
        "armor": (2, 2, 0.34),
        "armor_dark": (3, 2, 0.24),
        "structure_light": (3, 2, 0.48),
        "mechanical": (4, 3, 0.32),
        "radiator": (2, 2, 0.18),
        "docking": (2, 2, 0.28),
        "service": (2, 2, 0.68),
        "marking": (3, 2, 0.20),
        "window": (2, 1, 0.08),
    }
    columns, rows, hatch_coverage = layouts[role]
    rng = np.random.default_rng(seed)
    yy, xx = np.mgrid[0:height, 0:width].astype(np.float32)
    xx /= max(1, width - 1)
    yy /= max(1, height - 1)

    # A small deterministic row offset avoids a wallpaper-perfect square grid while keeping
    # every boundary stable and mip-friendly.
    row_index = np.minimum((yy * rows).astype(np.int32), rows - 1)
    row_offsets = rng.uniform(-0.12, 0.12, size=rows).astype(np.float32)
    shifted_x = xx * columns + row_offsets[row_index]
    column_index = np.mod(np.floor(shifted_x).astype(np.int32), columns)
    local_u = np.mod(shifted_x, 1.0)
    local_v = np.mod(yy * rows, 1.0)

    edge_distance = np.minimum.reduce((local_u, 1.0 - local_u, local_v, 1.0 - local_v))
    seam = _soft_band(edge_distance, 0.006, 0.016)
    panel_values = rng.uniform(-1.0, 1.0, size=(rows, columns)).astype(np.float32)
    panel = panel_values[row_index, column_index]

    selected = rng.random((rows, columns)) < hatch_coverage
    selected_pixels = selected[row_index, column_index].astype(np.float32)
    du = np.abs(local_u - 0.5)
    dv = np.abs(local_v - 0.5)
    hatch_sdf = np.maximum(du - 0.305, dv - 0.255)
    hatch = _soft_band(np.abs(hatch_sdf), 0.010, 0.018) * selected_pixels

    # Fasteners sit at consistent inset corners and appear only on panels selected for access or
    # high-load construction. This prevents the indiscriminate "rivets everywhere" look.
    fastener_selection = np.logical_or(selected, rng.random((rows, columns)) < 0.24)
    fastener_pixels = fastener_selection[row_index, column_index].astype(np.float32)
    corner_u = np.minimum(np.abs(local_u - 0.16), np.abs(local_u - 0.84))
    corner_v = np.minimum(np.abs(local_v - 0.17), np.abs(local_v - 0.83))
    fastener_radius = np.sqrt((corner_u / 0.020) ** 2 + (corner_v / 0.024) ** 2)
    fastener = np.exp(-0.5 * fastener_radius * fastener_radius).astype(np.float32) * fastener_pixels

    directional = np.zeros((height, width), dtype=np.float32)
    if role == "mechanical":
        directional = _periodic_grooves(yy + xx * 0.035, 62.0, 0.028)
    elif role == "radiator":
        directional = _periodic_grooves(xx + yy * 0.018, 46.0, 0.045)
    elif role == "docking":
        directional = _periodic_grooves(xx * 0.72 + yy * 0.28, 21.0, 0.055)
    elif role == "marking":
        # Smooth alternating diagonal hazard bands; wear and chips are applied later.
        directional = (0.5 + 0.5 * np.tanh(np.sin((xx + yy * 0.78) * np.pi * 14.0) * 4.0)).astype(np.float32)
    elif role == "window":
        directional = _periodic_grooves(xx + yy * 0.08, 18.0, 0.018) * 0.20

    return {
        "panel": panel.astype(np.float32),
        "seam": seam,
        "hatch": hatch.astype(np.float32),
        "fastener": fastener,
        "directional": directional,
    }


def _manufactured_maps(role: str, width: int, height: int) -> dict[str, np.ndarray]:
    profile = PROFILES[role]
    if not isinstance(profile, ManufacturedProfile):
        raise TypeError(f"{role} is not a manufactured surface")
    seed = 0x48454C49 + list(PROFILES).index(role) * 1613
    broad, detail, micro = _station_fields(height, width, seed, profile.scratch_directional)
    scratches = _scratch_mask(height, width, seed + 113, profile.scratch_density, profile.scratch_directional)
    chips = _localized_mask(broad, detail, profile.chip_density, seed + 167)
    recess = np.clip((-broad - 0.28) * 0.56 + (-detail - 1.05) * 0.11, 0.0, 1.0)
    structure = _manufactured_structure_fields(role, width, height, seed + 223)
    panel = structure["panel"]
    seam = structure["seam"]
    hatch = structure["hatch"]
    fastener = structure["fastener"]
    directional = structure["directional"]

    base = np.asarray(profile.base_rgb, dtype=np.float32)[None, None, :]
    warm_cool = np.stack((broad * 0.65, broad * 0.12, -broad * 0.32), axis=-1)
    # Color carries restrained coating drift and panel-to-panel maintenance history. Fine
    # manufacture belongs in roughness/normal response; putting it into albedo creates grunge.
    base_rgb = np.clip(base * (1.0 + broad[:, :, None] * 0.022 + detail[:, :, None] * 0.006
                                      + panel[:, :, None] * 0.065)
                       + warm_cool * 0.0015, 0.002, 0.92)
    base_rgb *= 1.0 - recess[:, :, None] * profile.recess_dust * 0.20
    base_rgb *= 1.0 - scratches[:, :, None] * (0.045 if profile.scratch_directional else 0.065)
    base_rgb *= 1.0 - seam[:, :, None] * (0.10 if role == "window" else 0.18)
    base_rgb *= 1.0 - hatch[:, :, None] * (0.05 if role == "window" else 0.13)
    base_rgb *= 1.0 - fastener[:, :, None] * 0.16
    if role == "radiator":
        base_rgb *= 1.0 - directional[:, :, None] * 0.14
    elif role == "mechanical":
        base_rgb *= 1.0 - directional[:, :, None] * 0.055
    elif role == "docking":
        base_rgb *= 1.0 + directional[:, :, None] * 0.075
    elif role == "marking":
        base_rgb *= 0.66 + directional[:, :, None] * 0.34
    if profile.coated_metal:
        exposed = np.asarray((0.18, 0.195, 0.205), dtype=np.float32)[None, None, :]
        base_rgb = base_rgb * (1.0 - chips[:, :, None] * 0.80) + exposed * chips[:, :, None] * 0.80

    ao = np.clip(0.982 + broad * 0.008 + detail * 0.004
                 - recess * profile.recess_dust * 0.05
                 - seam * 0.18 - hatch * 0.10 - fastener * 0.12
                 - directional * (0.055 if role in {"mechanical", "radiator"} else 0.018),
                 0.66, 1.0)
    roughness = np.clip(
        profile.roughness + broad * profile.roughness_variation * 0.30
        + detail * profile.roughness_variation * 0.12
        + micro * profile.roughness_variation * 0.045
        + panel * profile.roughness_variation * 0.28
        + recess * profile.recess_dust * 0.18
        + scratches * (-0.07 if profile.scratch_directional else 0.075)
        - chips * 0.14 + seam * 0.13 + hatch * 0.08
        + fastener * 0.035
        + directional * (-0.14 if role == "docking" else 0.055),
        0.09 if role == "window" else 0.18,
        0.94,
    )
    metallic = np.clip(profile.metallic + broad * min(0.04, profile.metallic * 0.03), 0.0, 1.0)
    if profile.coated_metal:
        metallic = metallic * (1.0 - chips) + chips * 0.84
    metallic = metallic * (1.0 - fastener * 0.82) + fastener * 0.76
    if role == "docking":
        metallic = np.clip(metallic + directional * 0.12, 0.0, 1.0)

    directional_depth = 0.16 if role in {"mechanical", "radiator"} else 0.07
    height_field = (
        broad * profile.macro_waviness + detail * 0.07 + micro * profile.micro_detail * 0.30
        + panel * 0.035 - scratches * 0.24 - chips * 0.18 - recess * 0.08
        - seam * 0.38 - hatch * 0.24 - fastener * 0.20
        - directional * directional_depth
    ).astype(np.float32)
    dy, dx = np.gradient(height_field)
    texel_scale = max(1.0, min(width, height) / 256.0)
    nx, ny = -dx * profile.normal_strength * texel_scale, -dy * profile.normal_strength * texel_scale
    nz = np.ones_like(nx)
    length = np.sqrt(nx * nx + ny * ny + nz * nz)
    normal = (np.stack((nx / length, ny / length, nz / length), axis=-1) * 0.5 + 0.5).astype(np.float32)
    orm = np.stack((ao, roughness, metallic), axis=-1).astype(np.float32)
    return {"basecolor": _rgba(base_rgb), "normal": _rgba(normal), "orm": _rgba(orm)}


def generate_maps(role: str, width: int, height: int) -> dict[str, np.ndarray]:
    if role in {"rock", "warm"}:
        return _rock023_maps(role, width, height)
    return _manufactured_maps(role, width, height)


def _find_image(bpy_module, stem: str):
    for image in bpy_module.data.images:
        if Path(image.name).stem.lower() == stem.lower():
            return image
    return None


def apply_to_blender_images(bpy_module, roles: tuple[str, ...], maps_root: Path | None = None) -> list[dict]:
    report = []
    for role in roles:
        if maps_root is not None:
            for channel in ("basecolor", "normal", "orm"):
                stem = f"{role}_{channel}"
                path = maps_root / f"{stem}.png"
                if not path.is_file():
                    raise RuntimeError(f"missing generated surface map: {path}")
                target_nodes = []
                for material in bpy_module.data.materials:
                    if not material.node_tree:
                        continue
                    target_nodes.extend(
                        node for node in material.node_tree.nodes
                        if node.type == "TEX_IMAGE" and node.image
                        and Path(node.image.name).stem.lower() == stem.lower()
                    )
                existing = _find_image(bpy_module, stem)
                if existing:
                    existing.name = f"__source_{existing.name}"
                image = bpy_module.data.images.load(str(path), check_existing=False)
                image.name = f"{stem}.png"
                image.colorspace_settings.name = "sRGB" if channel == "basecolor" else "Non-Color"
                for node in target_nodes:
                    node.image = image
                bound_nodes = len(target_nodes)
                image.pack()
                report.append({
                    "role": role,
                    "channel": channel,
                    "image": image.name,
                    "size": [int(image.size[0]), int(image.size[1])],
                    "source": str(path),
                    "boundNodes": bound_nodes,
                })
            continue
        images = {channel: _find_image(bpy_module, f"{role}_{channel}") for channel in ("basecolor", "normal", "orm")}
        missing = [channel for channel, image in images.items() if image is None or image.size[0] == 0]
        if missing:
            raise RuntimeError(f"missing {role} image channels: {', '.join(missing)}")
        sizes = {(int(image.size[0]), int(image.size[1])) for image in images.values()}
        if len(sizes) != 1:
            raise RuntimeError(f"surface dimensions disagree for {role}: {sorted(sizes)}")
        width, height = next(iter(sizes))
        maps = generate_maps(role, width, height)
        for channel, image in images.items():
            pixels = maps[channel]
            image.pixels.foreach_set(pixels.reshape(-1))
            image.update()
            image.pack()
            report.append({
                "role": role,
                "channel": channel,
                "image": image.name,
                "size": [width, height],
                "mean": [float(value) for value in np.mean(pixels[:, :, :3], axis=(0, 1))],
                "std": [float(value) for value in np.std(pixels[:, :, :3], axis=(0, 1))],
            })
    return report

"""bake_textures — the deckplate surface finishes, as seamless PNG tiles.

Every tile is an OVERLAY: per pixel it is white (lifts the surface) or black (sinks it) with the
strength in alpha, so a surface layers it over its base colour with plain alpha compositing — no
blend modes, no per-frame cost. Tiles are periodic by construction (noise is shaped in the
frequency domain, strokes are drawn with wrap-around copies), so they repeat without a seam.

    python assets/ui/deckplate/tools/bake_textures.py          # writes assets/ui/deckplate/tex/

Deterministic: every tile has a fixed seed, so a re-bake is byte-stable for the same numpy.
"""
from __future__ import annotations

import math
import os

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "tex")


def _periodic_noise(size: int, sigma_x: float, sigma_y: float, seed: int) -> np.ndarray:
    """Gaussian-filtered white noise, shaped in the frequency domain (so it tiles), in [-1, 1].
    sigma_* are in cycles per pixel: a small sigma_x correlates the noise along x (brushing)."""
    rng = np.random.default_rng(seed)
    white = rng.standard_normal((size, size))
    fy = np.fft.fftfreq(size)[:, None]
    fx = np.fft.fftfreq(size)[None, :]
    shape = np.exp(-((fx / sigma_x) ** 2) - ((fy / sigma_y) ** 2))
    field = np.real(np.fft.ifft2(np.fft.fft2(white) * shape))
    field -= field.mean()
    peak = np.percentile(np.abs(field), 99.5) or 1.0
    return np.clip(field / peak, -1.0, 1.0)


def _overlay(field: np.ndarray, strength: float, gamma: float = 1.0) -> Image.Image:
    """Signed field -> white/black RGBA overlay with |field| ** gamma * strength in alpha."""
    mag = np.abs(field) ** gamma
    alpha = np.clip(mag * strength * 255.0, 0, 255).astype(np.uint8)
    rgb = np.where(field[..., None] > 0, 255, 0).astype(np.uint8).repeat(3, axis=2)
    return Image.fromarray(np.dstack([rgb, alpha]), "RGBA")


def brushed(size: int = 512) -> Image.Image:
    """Anodised gunmetal, brushed along x: long fine streaks over a faint slow mottle."""
    streaks = _periodic_noise(size, sigma_x=0.0035, sigma_y=0.30, seed=11)
    fibres = _periodic_noise(size, sigma_x=0.0012, sigma_y=0.45, seed=12)
    mottle = _periodic_noise(size, sigma_x=0.010, sigma_y=0.010, seed=13)
    field = 0.55 * streaks + 0.30 * fibres + 0.25 * mottle
    field = np.clip(field / np.percentile(np.abs(field), 99.5), -1, 1)
    return _overlay(field, strength=0.085, gamma=1.15)


def grain(size: int = 256) -> Image.Image:
    """Fine isotropic grain: film on glass, tooth on paint. Nearly invisible alone; it kills the
    'flat vector' read of large dark fields."""
    field = _periodic_noise(size, sigma_x=0.35, sigma_y=0.35, seed=21)
    return _overlay(field, strength=0.07, gamma=1.3)


def _wrap_line(draw: ImageDraw.ImageDraw, size: int, p0, p1, fill, width: int) -> None:
    for ox in (-size, 0, size):
        for oy in (-size, 0, size):
            draw.line([(p0[0] + ox, p0[1] + oy), (p1[0] + ox, p1[1] + oy)], fill=fill, width=width)


def scratches(size: int = 1024) -> Image.Image:
    """Service wear: many faint hairline scuffs near the brushing direction, a few brighter
    specular scratches that catch the key light. Mostly white (a scratch is bright metal)."""
    rng = np.random.default_rng(31)
    layer = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(layer)
    for i in range(170):
        x, y = rng.uniform(0, size, 2)
        angle = rng.normal(0.0, 0.22) if i % 7 else rng.uniform(-math.pi, math.pi)
        length = rng.uniform(10, 90) if i % 11 else rng.uniform(90, 260)
        x1, y1 = x + math.cos(angle) * length, y + math.sin(angle) * length
        bright = i % 41 == 0
        alpha = int(rng.uniform(18, 30) if bright else rng.uniform(5, 12))
        _wrap_line(draw, size, (x, y), (x1, y1), (255, 255, 255, alpha), 1)
    # A handful of dark gouges (paint pushed into the scratch).
    for _ in range(16):
        x, y = rng.uniform(0, size, 2)
        angle = rng.normal(0.0, 0.3)
        length = rng.uniform(6, 30)
        _wrap_line(draw, size, (x, y), (x + math.cos(angle) * length, y + math.sin(angle) * length),
                   (0, 0, 0, int(rng.uniform(30, 60))), 1)
    return layer.filter(ImageFilter.GaussianBlur(0.35))


def smudge(size: int = 512) -> Image.Image:
    """Glass handling: soft low-frequency haze plus a few wiped arcs. White only (a smudge
    scatters light), very low alpha, so it reads only where the key light crosses it."""
    haze = _periodic_noise(size, sigma_x=0.008, sigma_y=0.008, seed=41)
    haze = np.clip(haze, 0, 1) ** 1.6
    rgba = np.zeros((size, size, 4), np.uint8)
    rgba[..., :3] = 255
    rgba[..., 3] = np.clip(haze * 0.035 * 255, 0, 255).astype(np.uint8)
    img = Image.fromarray(rgba, "RGBA")
    draw = ImageDraw.Draw(img)
    rng = np.random.default_rng(42)
    for _ in range(4):
        cx, cy = rng.uniform(0, size, 2)
        r = rng.uniform(40, 150)
        start = rng.uniform(0, 360)
        for k in range(5):
            bbox = [cx - r - k * 3, cy - r * 0.6 - k * 2, cx + r + k * 3, cy + r * 0.6 + k * 2]
            for ox in (-size, 0, size):
                for oy in (-size, 0, size):
                    draw.arc([bbox[0] + ox, bbox[1] + oy, bbox[2] + ox, bbox[3] + oy],
                             start, start + rng.uniform(40, 110), fill=(255, 255, 255, 4), width=2)
    return img.filter(ImageFilter.GaussianBlur(1.4))


def scanlines(size: int = 4) -> Image.Image:
    """A 4 px phosphor row for glass displays: one faint dark line. Tiled, it gives emitted
    content the texture of a display instead of a web page, at no cost."""
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    for x in range(size):
        img.putpixel((x, size - 1), (0, 0, 0, 34))
    return img


def main() -> None:
    os.makedirs(OUT, exist_ok=True)
    tiles = {
        "brushed.png": brushed(),
        "grain.png": grain(),
        "scratches.png": scratches(),
        "smudge.png": smudge(),
        "scanlines.png": scanlines(),
    }
    for name, img in tiles.items():
        path = os.path.join(OUT, name)
        img.save(path, optimize=True)
        print(f"{name:14s} {img.size[0]}x{img.size[1]}  {os.path.getsize(path) // 1024} KB")


if __name__ == "__main__":
    main()

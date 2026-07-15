#!/usr/bin/env python3
"""Offline REPAIR1 texture lift + industrial micro-variation for game-sky read."""
from pathlib import Path
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
TEX = ROOT / "assets/ships/m4_helios_hub_v8/textures"

# Base plate colors (linear-ish 0-1) for roles with enough separation under dark sky
PLATE = {
    "mechanical": np.array([0.38, 0.40, 0.44], np.float32),
    "hull": np.array([0.78, 0.73, 0.66], np.float32),
    "warm": np.array([0.72, 0.42, 0.18], np.float32),
    "accent": np.array([0.22, 0.55, 0.72], np.float32),
    "rock": np.array([0.42, 0.40, 0.38], np.float32),
    "glass": np.array([0.28, 0.36, 0.42], np.float32),
}


def fbm(h, w, seed, octaves=4):
    rng = np.random.default_rng(seed)
    acc = np.zeros((h, w), np.float32)
    amp = 0.5
    for o in range(octaves):
        sh, sw = max(4, h // (2 ** (octaves - o))), max(4, w // (2 ** (octaves - o)))
        grid = rng.random((sh, sw), dtype=np.float32)
        # upscale
        ys = (np.linspace(0, sh - 1, h)).astype(np.float32)
        xs = (np.linspace(0, sw - 1, w)).astype(np.float32)
        y0 = np.floor(ys).astype(int)
        x0 = np.floor(xs).astype(int)
        y1 = np.clip(y0 + 1, 0, sh - 1)
        x1 = np.clip(x0 + 1, 0, sw - 1)
        fy = ys - y0
        fx = xs - x0
        # bilinear
        g00 = grid[y0][:, x0]
        g01 = grid[y0][:, x1]
        g10 = grid[y1][:, x0]
        g11 = grid[y1][:, x1]
        # fix broadcasting
        g00 = grid[np.ix_(y0, x0)] if False else grid[y0[:, None], x0[None, :]]
        g01 = grid[y0[:, None], x1[None, :]]
        g10 = grid[y1[:, None], x0[None, :]]
        g11 = grid[y1[:, None], x1[None, :]]
        top = g00 * (1 - fx) + g01 * fx
        bot = g10 * (1 - fx) + g11 * fx
        layer = top * (1 - fy)[:, None] + bot * fy[:, None]
        acc += layer * amp
        amp *= 0.5
    acc = (acc - acc.min()) / max(1e-6, acc.max() - acc.min())
    return acc


for role, base_col in PLATE.items():
    path = TEX / f"{role}_basecolor.png"
    # Prefer regenerating a readable industrial plate over crushed seeds
    n = 1024
    noise = fbm(n, n, seed=hash(role) % 10_000 + 17)
    panel = fbm(n, n, seed=hash(role) % 10_000 + 91, octaves=3)
    # Panelize
    tiles = 12 if role != "rock" else 7
    gy = (np.arange(n)[:, None] // (n // tiles))
    gx = (np.arange(n)[None, :] // (n // tiles))
    panel_id = (gy * 13 + gx).astype(np.float32)
    panel_var = (np.sin(panel_id * 1.7) * 0.5 + 0.5) * 0.12
    wear = np.clip(noise * 0.35 + panel * 0.25 + panel_var, 0, 1)
    rgb = base_col[None, None, :] * (0.75 + 0.35 * wear[..., None])
    # Edge darken for plate seams
    seam = ((np.arange(n) % (n // tiles)) < 2) | ((np.arange(n)[:, None] % (n // tiles)) < 2)
    rgb = rgb * np.where(seam[..., None] if seam.ndim == 2 else seam, 0.82, 1.0)
    if role == "mechanical":
        rgb = np.clip(rgb + 0.06, 0, 1)  # lift graphite floor
    if role == "hull":
        rgb = np.clip(rgb * np.array([1.02, 0.99, 0.95], np.float32), 0, 1)
    alpha = np.ones((n, n, 1), np.float32)
    out = np.concatenate([rgb, alpha], axis=-1)
    Image.fromarray((out * 255 + 0.5).astype(np.uint8), "RGBA").save(path)
    print("wrote", path.name, path.stat().st_size)

print("done")

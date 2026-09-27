"""Forge shared surface set: tileable panel textures every forged hull shares.

One 1024 px tile covers TILE_METERS x TILE_METERS of hull at a world-locked box projection, so every
ship in the fleet carries the same texel density (256 px/m) and the same panel language. The maps
carry *manufacture* (panel seams, fasteners, access plates, per-panel tone), never noise: broadband
grain is what made the old fleet read as leather at the chase camera.

Outputs (PNG, linear except albedo):
  forge_panel_albedo.png   near-white multiplier; paint colour comes from the material factor
  forge_panel_normal.png   OpenGL tangent-space normal
  forge_panel_orm.png      R = occlusion, G = roughness multiplier, B = metalness (1.0; factor sets it)
  forge_grille_*.png       dense machinery tile (vents/grating) for mechanical surfaces

Pure numpy; runs inside Blender's Python or any CPython with numpy (+ optional PIL for writing).
"""
from __future__ import annotations

import os
import struct
import zlib

import numpy as np

SIZE = 1024
TILE_METERS = 4.0


def _write_png(path, rgb):
    """Minimal PNG writer (8-bit RGB) so we do not depend on PIL inside Blender."""
    arr = np.clip(np.round(rgb * 255.0), 0, 255).astype(np.uint8)
    h, w, c = arr.shape
    raw = b''.join(b'\x00' + arr[y].tobytes() for y in range(h))
    def chunk(tag, data):
        return struct.pack('>I', len(data)) + tag + data + struct.pack('>I', zlib.crc32(tag + data) & 0xffffffff)
    png = b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 2, 0, 0, 0))
    png += chunk(b'IDAT', zlib.compress(raw, 9)) + chunk(b'IEND', b'')
    with open(path, 'wb') as f:
        f.write(png)


def _blur(img, radius):
    """Separable box blur x3 (≈ gaussian), wrapping (tileable)."""
    out = img.astype(np.float32)
    for _ in range(3):
        for axis in (0, 1):
            acc = np.zeros_like(out)
            for d in range(-radius, radius + 1):
                acc += np.roll(out, d, axis=axis)
            out = acc / (2 * radius + 1)
    return out


def _smooth_noise(rng, size, cells):
    """Tileable value noise with `cells` lattice cells across the tile (low frequency only)."""
    lattice = rng.random((cells, cells)).astype(np.float32)
    t = np.linspace(0, cells, size, endpoint=False, dtype=np.float32)
    i0 = np.floor(t).astype(int) % cells
    i1 = (i0 + 1) % cells
    f = t - np.floor(t)
    f = f * f * (3 - 2 * f)
    a = lattice[i0][:, i0]
    b = lattice[i0][:, i1]
    c = lattice[i1][:, i0]
    d = lattice[i1][:, i1]
    fx = f[None, :]
    fy = f[:, None]
    return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy


def _panel_layout(rng, grid):
    """Merge a grid of cells into rectangular plates. Returns (id map at grid res, rect list)."""
    ids = -np.ones((grid, grid), dtype=int)
    rects = []
    shapes = [(1, 1), (2, 1), (1, 2), (2, 2), (3, 1), (1, 3), (2, 3), (3, 2), (4, 2), (2, 4)]
    weights = np.array([6, 5, 5, 4, 2, 2, 2, 2, 1, 1], dtype=float)
    weights /= weights.sum()
    for y in range(grid):
        for x in range(grid):
            if ids[y, x] >= 0:
                continue
            for _ in range(8):
                w, h = shapes[rng.choice(len(shapes), p=weights)]
                cells = [((y + j) % grid, (x + i) % grid) for j in range(h) for i in range(w)]
                if all(ids[c] < 0 for c in cells):
                    break
            else:
                w, h = 1, 1
                cells = [(y, x)]
            for c in cells:
                ids[c] = len(rects)
            rects.append((x, y, w, h))
    return ids, rects


def _rect_mask(size, x0, y0, w, h, inset, radius):
    """Signed-distance rounded-rect (wrapping) evaluated on the tile in pixels."""
    yy, xx = np.mgrid[0:size, 0:size].astype(np.float32)
    cx = x0 + w / 2.0
    cy = y0 + h / 2.0
    dx = (xx - cx + size / 2) % size - size / 2
    dy = (yy - cy + size / 2) % size - size / 2
    hx = w / 2.0 - inset - radius
    hy = h / 2.0 - inset - radius
    qx = np.abs(dx) - hx
    qy = np.abs(dy) - hy
    outside = np.sqrt(np.maximum(qx, 0) ** 2 + np.maximum(qy, 0) ** 2)
    inside = np.minimum(np.maximum(qx, qy), 0)
    return outside + inside - radius  # <0 inside


def generate_panel_set(out_dir, seed=7, size=SIZE):
    rng = np.random.default_rng(seed)
    grid = 8  # 8 cells over 4 m -> 0.5 m module
    cell = size // grid
    ids, rects = _panel_layout(rng, grid)
    idmap = np.kron(ids, np.ones((cell, cell), dtype=int))

    height = np.zeros((size, size), np.float32)
    tone = np.zeros((size, size), np.float32)
    rough = np.zeros((size, size), np.float32)
    groove = np.zeros((size, size), np.float32)
    for k, (x, y, w, h) in enumerate(rects):
        mask = idmap == k
        height[mask] = rng.uniform(-0.05, 0.05)
        tone[mask] = rng.uniform(-0.035, 0.035)
        rough[mask] = rng.uniform(-0.05, 0.05)
    # Seams: wherever the plate id changes, a 3 px groove with a soft shoulder.
    edge = (idmap != np.roll(idmap, 1, 0)) | (idmap != np.roll(idmap, 1, 1))
    edge = edge.astype(np.float32)
    seam = np.clip(_blur(edge, 1) * 3.2, 0, 1)
    groove = np.maximum(groove, seam)
    height -= seam * 0.55

    # Fasteners along a subset of seams (every 20 px, inset 7 px).
    fasten = np.zeros((size, size), np.float32)
    yy, xx = np.mgrid[0:size, 0:size]
    for k, (x, y, w, h) in enumerate(rects):
        if rng.random() > 0.45:
            continue
        x0, y0, pw, ph = x * cell, y * cell, w * cell, h * cell
        step = 20
        pts = []
        for px in range(x0 + 10, x0 + pw - 6, step):
            pts += [(px, y0 + 7), (px, y0 + ph - 7)]
        for py in range(y0 + 10, y0 + ph - 6, step):
            pts += [(x0 + 7, py), (x0 + pw - 7, py)]
        for px, py in pts:
            px %= size
            py %= size
            ys = slice(max(py - 3, 0), min(py + 4, size))
            xs = slice(max(px - 3, 0), min(px + 4, size))
            d = np.sqrt((yy[ys, xs] - py) ** 2 + (xx[ys, xs] - px) ** 2)
            fasten[ys, xs] = np.maximum(fasten[ys, xs], np.clip(1.8 - d, 0, 1))
    height += fasten * 0.22

    # Access plates: a recessed rounded outline inside ~30% of the larger plates.
    for k, (x, y, w, h) in enumerate(rects):
        if w * h < 2 or rng.random() > 0.35:
            continue
        x0, y0 = x * cell, y * cell
        pw, ph = rng.integers(cell // 3, int(cell * min(w, 2) * 0.7)), rng.integers(cell // 3, int(cell * min(h, 2) * 0.7))
        ox = x0 + rng.integers(14, max(15, w * cell - pw - 14))
        oy = y0 + rng.integers(14, max(15, h * cell - ph - 14))
        sd = _rect_mask(size, ox, oy, pw, ph, 0, 6)
        line = np.clip(1.4 - np.abs(sd), 0, 1)
        height -= line * 0.35
        groove = np.maximum(groove, line * 0.7)
        inner = (sd < -1.5).astype(np.float32)
        tone += inner * rng.uniform(-0.03, 0.03)
    # Very broad, very gentle variation (a few cells per tile), never grain.
    broad = _smooth_noise(rng, size, 4) - 0.5
    tone += broad * 0.03
    rough += broad * 0.05

    # Normal map (OpenGL convention: +Y up = green).
    strength = 5.0
    gx = (np.roll(height, -1, 1) - np.roll(height, 1, 1)) * 0.5 * strength
    gy = (np.roll(height, -1, 0) - np.roll(height, 1, 0)) * 0.5 * strength
    n = np.stack([-gx, gy, np.ones_like(gx)], -1)
    n /= np.linalg.norm(n, axis=-1, keepdims=True)
    normal = n * 0.5 + 0.5

    cavity = np.clip((_blur(height, 3) - height) * 2.2, 0, 1)
    ao = np.clip(1.0 - cavity * 0.75 - groove * 0.25, 0, 1)
    rough_mul = np.clip(0.88 + rough + groove * 0.12, 0, 1)
    orm = np.stack([ao, rough_mul, np.ones_like(ao)], -1)

    albedo_v = np.clip(0.93 + tone - groove * 0.28 + fasten * 0.03, 0, 1)
    albedo = np.stack([albedo_v] * 3, -1)

    os.makedirs(out_dir, exist_ok=True)
    _write_png(os.path.join(out_dir, 'forge_panel_albedo.png'), albedo ** (1 / 2.2) if False else albedo)
    _write_png(os.path.join(out_dir, 'forge_panel_normal.png'), normal)
    _write_png(os.path.join(out_dir, 'forge_panel_orm.png'), orm)
    return {k: os.path.join(out_dir, f'forge_panel_{k}.png') for k in ('albedo', 'normal', 'orm')}


def generate_machinery_set(out_dir, seed=11, size=512):
    """Dense machinery tile: louvres, grating and bolt rows for gunmetal/dark roles."""
    rng = np.random.default_rng(seed)
    height = np.zeros((size, size), np.float32)
    yy, xx = np.mgrid[0:size, 0:size].astype(np.float32)
    band = size // 4
    for b in range(4):
        y0 = b * band
        kind = b % 4
        region = (yy >= y0) & (yy < y0 + band)
        if kind == 0:  # louvres: sawtooth ridges
            saw = ((yy - y0) % 16) / 16.0
            height[region] = (saw * 0.6)[region]
        elif kind == 1:  # square grating
            g = (((xx % 24) < 3) | (((yy - y0) % 24) < 3)).astype(np.float32)
            height[region] = (0.4 - g * 0.6)[region]
        elif kind == 2:  # ribbed plate
            rib = 0.5 + 0.5 * np.cos((xx % 32) / 32.0 * 2 * np.pi)
            height[region] = (rib * 0.35)[region]
        else:  # plate with bolt rows
            d = np.sqrt(((xx % 32) - 16) ** 2 + (((yy - y0) % 32) - 16) ** 2)
            height[region] = np.clip(2.5 - d, 0, 1)[region] * 0.4
        height[(yy >= y0) & (yy < y0 + 3)] = -0.5
    height = _blur(height, 1)
    strength = 4.0
    gx = (np.roll(height, -1, 1) - np.roll(height, 1, 1)) * 0.5 * strength
    gy = (np.roll(height, -1, 0) - np.roll(height, 1, 0)) * 0.5 * strength
    n = np.stack([-gx, gy, np.ones_like(gx)], -1)
    n /= np.linalg.norm(n, axis=-1, keepdims=True)
    cavity = np.clip((_blur(height, 2) - height) * 2.5, 0, 1)
    ao = np.clip(1.0 - cavity * 0.8, 0, 1)
    rough_mul = np.clip(0.85 + cavity * 0.15 + (_smooth_noise(rng, size, 4) - 0.5) * 0.06, 0, 1)
    albedo_v = np.clip(0.9 - cavity * 0.35 + height * 0.05, 0, 1)
    os.makedirs(out_dir, exist_ok=True)
    _write_png(os.path.join(out_dir, 'forge_machinery_albedo.png'), np.stack([albedo_v] * 3, -1))
    _write_png(os.path.join(out_dir, 'forge_machinery_normal.png'), n * 0.5 + 0.5)
    _write_png(os.path.join(out_dir, 'forge_machinery_orm.png'), np.stack([ao, rough_mul, np.ones_like(ao)], -1))
    return {k: os.path.join(out_dir, f'forge_machinery_{k}.png') for k in ('albedo', 'normal', 'orm')}


if __name__ == '__main__':
    import sys
    out = sys.argv[-1] if len(sys.argv) > 1 and not sys.argv[-1].endswith('.py') else os.path.join(os.path.dirname(__file__), 'textures')
    print(generate_panel_set(out))
    print(generate_machinery_set(out))

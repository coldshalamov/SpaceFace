"""Forge shared surface set: tileable panel textures every forged hull shares.

One 1024 px tile covers TILE_METERS x TILE_METERS of hull at a world-locked box projection, so every
ship in the fleet carries the same texel density (256 px/m) and the same panel language. The maps
carry *manufacture* (recessed seams, dog-eared plates, hatches, vents, fasteners), never noise:
broadband grain is what made the old fleet read as leather at the chase camera. Albedo stays
near-uniform so the tile cannot read as a checkerboard of tinted squares; relief and occlusion
carry the panel lines.

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
    shapes = [(1, 1), (2, 1), (1, 2), (2, 2), (3, 1), (1, 3), (2, 3), (3, 2), (4, 2), (2, 4), (4, 1), (3, 3)]
    # Larger plates and long strakes dominate; single-module squares are the exception. A field
    # of small equal squares is what reads as bathroom tile.
    weights = np.array([1.5, 3, 3, 5, 4, 3, 4, 4, 3, 3, 3, 2], dtype=float)
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


def _plate_sdf(xx, yy, size, x0, y0, w, h, inset, radius, cuts):
    """Signed distance (px, <0 inside) to one hull plate on the wrapping tile.

    A plate is a rounded rectangle; `cuts` lists corners (sx, sy in {-1, +1}) that are clipped at
    45 degrees by `cut` px, the dog-eared corner of pressed aerospace skin.
    """
    cx = x0 + w / 2.0
    cy = y0 + h / 2.0
    dx = (xx - cx + size / 2) % size - size / 2
    dy = (yy - cy + size / 2) % size - size / 2
    hx = w / 2.0 - inset - radius
    hy = h / 2.0 - inset - radius
    qx = np.abs(dx) - hx
    qy = np.abs(dy) - hy
    d = np.sqrt(np.maximum(qx, 0) ** 2 + np.maximum(qy, 0) ** 2) + np.minimum(np.maximum(qx, qy), 0) - radius
    for sx, sy, cut in cuts:
        # Half-plane through the clipped corner: keep the side toward the plate centre.
        plane = (dx * sx + dy * sy - (w / 2.0 + h / 2.0 - 2 * inset - cut)) * 0.70710678
        d = np.maximum(d, plane)
    return d


def _capsule_sdf(xx, yy, size, ax, ay, bx, by, r):
    """Signed distance to a wrapping capsule from (ax, ay) to (bx, by) with radius r."""
    px = (xx - ax + size / 2) % size - size / 2
    py = (yy - ay + size / 2) % size - size / 2
    vx, vy = bx - ax, by - ay
    t = np.clip((px * vx + py * vy) / max(vx * vx + vy * vy, 1e-6), 0, 1)
    return np.sqrt((px - vx * t) ** 2 + (py - vy * t) ** 2) - r


def _downsample(img, k):
    """Box-filter a supersampled tile down by k (anti-aliases every seam and fastener)."""
    if k == 1:
        return img
    h, w = img.shape[:2]
    shape = (h // k, k, w // k, k) + img.shape[2:]
    return img.reshape(shape).mean(axis=(1, 3))


def generate_panel_set(out_dir, seed=7, size=SIZE):
    """Hull plating, v2 (2026-09-30).

    The tile is drawn from signed-distance fields at 2x and box-filtered down, so seams and
    fasteners are anti-aliased rather than stair-stepped. What it carries:
      - plates with pressed, dog-eared corners, separated by a recessed seam (a dark gap with a
        bevelled shoulder: shadow and relief, never a painted grout line);
      - access hatches, vent slot groups and sparse fastener rows at hand-sized scale;
      - near-uniform albedo (paint colour is the material factor; the tile must not read as a
        checkerboard at the chase camera), with occlusion pooled softly around every recess;
      - roughness that is slightly lower at plate edges (handled, polished) and higher in recesses.
    """
    rng = np.random.default_rng(seed)
    ss = 2
    S = size * ss
    grid = 8  # 8 cells over 4 m -> 0.5 m module
    cell = S // grid
    ids, rects = _panel_layout(rng, grid)
    yy, xx = np.mgrid[0:S, 0:S].astype(np.float32)

    gap = 1.6 * ss            # half-width of the seam between plates
    nearest = np.full((S, S), 1e9, np.float32)   # distance to the nearest plate (<0 inside one)
    tone = np.zeros((S, S), np.float32)
    rough = np.zeros((S, S), np.float32)
    lift = np.zeros((S, S), np.float32)
    plates = []
    for k, (x, y, w, h) in enumerate(rects):
        cuts = []
        if w * h >= 2:
            for sx, sy in ((-1, -1), (1, -1), (-1, 1), (1, 1)):
                if rng.random() < 0.30:
                    cuts.append((sx, sy, float(rng.integers(cell // 5, cell // 2))))
        d = _plate_sdf(xx, yy, S, x * cell, y * cell, w * cell, h * cell, gap, 3.0 * ss, cuts)
        inside = d < nearest
        t, r, l = rng.uniform(-0.012, 0.012), rng.uniform(-0.05, 0.05), rng.uniform(-0.04, 0.04)
        tone = np.where(inside, t, tone)
        rough = np.where(inside, r, rough)
        lift = np.where(inside, l, lift)
        nearest = np.minimum(nearest, d)
        plates.append((x * cell, y * cell, w * cell, h * cell, w * h))

    # The seam is a thin gap hugging each plate edge. Where a dog-eared corner leaves a wider
    # opening, the opening is a gusset plate set slightly below its neighbours, not a hole.
    gusset = np.clip((nearest - 2.6 * ss) / (1.2 * ss), 0, 1)
    seam = np.clip(nearest / (0.9 * ss) + 0.5, 0, 1) * (1 - gusset)    # 1 in the gap between plates
    shoulder = np.clip(1.0 + nearest / (4.5 * ss), 0, 1) ** 2           # bevel rolling into the gap
    edge_polish = np.clip(1.0 + nearest / (9.0 * ss), 0, 1) * (1 - seam) * (1 - gusset)
    height = lift * (1 - gusset) - shoulder * 0.55 * (1 - gusset) - seam * 0.45 - gusset * 0.30
    tone = tone * (1 - gusset) - gusset * 0.035
    rough = rough * (1 - gusset) + gusset * 0.06

    recess = np.zeros((S, S), np.float32)     # hatch outlines and vent slots
    fasten = np.zeros((S, S), np.float32)
    for x0, y0, pw, ph, area in plates:
        roll = rng.random()
        # Access hatch: a thin recessed rounded outline with a fastener in each corner.
        if area >= 2 and roll < 0.42:
            hw = float(rng.integers(int(cell * 0.45), int(min(pw, 2 * cell) * 0.72)))
            hh = float(rng.integers(int(cell * 0.40), int(min(ph, 2 * cell) * 0.72)))
            ox = x0 + rng.integers(int(cell * 0.18), max(int(cell * 0.2), int(pw - hw - cell * 0.18)))
            oy = y0 + rng.integers(int(cell * 0.18), max(int(cell * 0.2), int(ph - hh - cell * 0.18)))
            sd = _plate_sdf(xx, yy, S, ox, oy, hw, hh, 0, 5.0 * ss, [])
            recess = np.maximum(recess, np.clip(1.0 - np.abs(sd) / (0.9 * ss), 0, 1) * 0.85)
            tone += (sd < -ss) * rng.uniform(-0.010, 0.010)
            for fx, fy in ((ox + 7 * ss, oy + 7 * ss), (ox + hw - 7 * ss, oy + 7 * ss),
                           (ox + 7 * ss, oy + hh - 7 * ss), (ox + hw - 7 * ss, oy + hh - 7 * ss)):
                fasten = np.maximum(fasten, np.clip(1.4 - _capsule_sdf(xx, yy, S, fx, fy, fx, fy, 1.4 * ss) / ss, 0, 1))
        # Vent group: a short rank of slots near one edge of a big plate.
        elif area >= 3 and roll < 0.62:
            n = int(rng.integers(3, 6))
            length = cell * rng.uniform(0.34, 0.52)
            horizontal = pw >= ph
            bx = x0 + pw * rng.uniform(0.18, 0.55)
            by = y0 + ph * rng.uniform(0.18, 0.55)
            for i in range(n):
                off = i * 7.0 * ss
                ax, ay = (bx, by + off) if horizontal else (bx + off, by)
                ex, ey = (bx + length, by + off) if horizontal else (bx + off, by + length)
                sd = _capsule_sdf(xx, yy, S, ax, ay, ex, ey, 1.5 * ss)
                recess = np.maximum(recess, np.clip(0.5 - sd / ss, 0, 1))
        # Fastener row along one long edge of some plates, inset from the seam.
        if rng.random() < 0.34:
            step = 28.0 * ss
            inset = 9.0 * ss
            along_x = pw >= ph
            count = int(((pw if along_x else ph) - 2 * inset) // step)
            for i in range(max(count, 0) + 1):
                fx = x0 + inset + i * step if along_x else x0 + inset
                fy = y0 + inset if along_x else y0 + inset + i * step
                fasten = np.maximum(fasten, np.clip(1.4 - _capsule_sdf(xx, yy, S, fx, fy, fx, fy, 1.2 * ss) / ss, 0, 1))

    recess = np.maximum(recess * (1 - seam), 0)
    height = height - recess * 0.42 + fasten * (1 - seam) * 0.16

    # Very broad, very gentle variation (a few cells per tile), never grain.
    broad = np.kron(_smooth_noise(rng, size, 4) - 0.5, np.ones((ss, ss), np.float32))
    tone += broad * 0.014
    rough += broad * 0.05

    # Normal map (OpenGL convention: +Y up = green). The gradient is taken at the supersampled
    # resolution, so the shoulder keeps its slope after the downsample.
    strength = 5.2 / ss
    gx = (np.roll(height, -1, 1) - np.roll(height, 1, 1)) * 0.5 * strength * ss
    gy = (np.roll(height, -1, 0) - np.roll(height, 1, 0)) * 0.5 * strength * ss
    n = np.stack([-gx, gy, np.ones_like(gx)], -1)
    n = _downsample(n, ss)
    n /= np.linalg.norm(n, axis=-1, keepdims=True)
    normal = n * 0.5 + 0.5

    pit = np.maximum(seam, recess)                      # every recessed feature
    pool = np.clip(_blur(_downsample(pit, ss), 3) * 1.5, 0, 1)   # occlusion pooled around it
    pit_lo = _downsample(pit, ss)
    ao = np.clip(1.0 - pit_lo * 0.80 - pool * 0.30, 0, 1)
    rough_mul = np.clip(0.86 + _downsample(rough - edge_polish * 0.06, ss) + pit_lo * 0.12, 0, 1)
    orm = np.stack([ao, rough_mul, np.ones_like(ao)], -1)

    albedo_v = np.clip(0.95 + _downsample(tone, ss) - pit_lo * 0.50 - pool * 0.05
                       + _downsample(fasten, ss) * 0.02, 0, 1)
    albedo = np.stack([albedo_v] * 3, -1)

    os.makedirs(out_dir, exist_ok=True)
    _write_png(os.path.join(out_dir, 'forge_panel_albedo.png'), albedo)
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

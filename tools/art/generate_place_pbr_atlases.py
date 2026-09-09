"""Generate original UV PBR atlases for place assets (basecolor/normal/ORM)."""
from __future__ import annotations

import math
import os
import random
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "assets" / "ships" / "parts" / "textures"
SZ = 1024


def noise(w, h, scale=8, seed=0):
    rng = random.Random(seed)
    lw, lh = max(4, w // scale), max(4, h // scale)
    base = Image.new("RGB", (lw, lh))
    px = base.load()
    for y in range(lh):
        for x in range(lw):
            v = rng.randint(0, 255)
            px[x, y] = (v, v, v)
    return base.resize((w, h), Image.BILINEAR)


def fbm(w, h, octaves=4, seed=1):
    acc = Image.new("L", (w, h), 0)
    for o in range(octaves):
        n = noise(w, h, scale=max(2, 16 // (2**o)), seed=seed + o * 17).convert("L")
        n = n.point(lambda p, oo=o: p // (2**oo))
        acc = ImageChops.add(acc, n)
    return acc


def panel_grid(w, h, cell=64, color=(40, 40, 42), line_c=(18, 18, 20)):
    img = Image.new("RGB", (w, h), color)
    d = ImageDraw.Draw(img)
    line = 2
    for x in range(0, w, cell):
        d.rectangle([x, 0, x + line - 1, h], fill=line_c)
    for y in range(0, h, cell):
        d.rectangle([0, y, w, y + line - 1], fill=line_c)
    for x in range(0, w, cell):
        for y in range(0, h, cell):
            if ((x // cell) + (y // cell)) % 3 == 0:
                d.rectangle(
                    [x + 4, y + 4, x + cell - 6, y + cell // 2],
                    fill=(color[0] + 8, color[1] + 6, color[2] + 4),
                )
    return img


def scuffs(img, seed=2, count=400):
    rng = random.Random(seed)
    d = ImageDraw.Draw(img)
    w, h = img.size
    for _ in range(count):
        x, y = rng.randint(0, w - 1), rng.randint(0, h - 1)
        length = rng.randint(3, 28)
        a = rng.random() * math.pi
        x2 = int(x + math.cos(a) * length)
        y2 = int(y + math.sin(a) * length)
        c = rng.randint(20, 70)
        d.line([(x, y), (x2, y2)], fill=(c, c, c + 5), width=1)
    return img


def normal_from_height(height_img):
    h = height_img.convert("L")
    w, hh = h.size
    src = h.load()
    nimg = Image.new("RGB", (w, hh))
    npx = nimg.load()
    for y in range(hh):
        for x in range(w):
            xl = src[(x - 1) % w, y] / 255.0
            xr = src[(x + 1) % w, y] / 255.0
            yu = src[x, (y - 1) % hh] / 255.0
            yd = src[x, (y + 1) % hh] / 255.0
            dx = (xl - xr) * 2.5
            dy = (yu - yd) * 2.5  # OpenGL green-up
            dz = 1.0
            inv = 1.0 / math.sqrt(dx * dx + dy * dy + dz * dz + 1e-8)
            nx, ny, nz = dx * inv, dy * inv, dz * inv
            npx[x, y] = (
                int((nx * 0.5 + 0.5) * 255),
                int((ny * 0.5 + 0.5) * 255),
                int((nz * 0.5 + 0.5) * 255),
            )
    return nimg


def orm_from_maps(ao_img, rough_img, metal_img):
    w, h = ao_img.size
    out = Image.new("RGB", (w, h))
    a = ao_img.convert("L").load()
    r = rough_img.convert("L").load()
    m = metal_img.convert("L").load()
    o = out.load()
    for y in range(h):
        for x in range(w):
            o[x, y] = (a[x, y], r[x, y], m[x, y])
    return out


def save_set(folder: Path, basecolor, height, metal_val=120, rough_bias=140):
    folder.mkdir(parents=True, exist_ok=True)
    w, h = basecolor.size
    height = height.resize((w, h))
    normal = normal_from_height(height)
    ao = ImageChops.multiply(height.point(lambda p: 255 - p // 3), Image.new("L", (w, h), 200))
    rough = height.point(lambda p: min(255, max(40, rough_bias + (p - 128) // 2)))
    metal = Image.new("L", (w, h), metal_val)
    metal = ImageChops.add(metal, height.point(lambda p: (p - 128) // 8))
    orm = orm_from_maps(ao, rough, metal)
    basecolor.save(folder / "basecolor.png")
    normal.save(folder / "normal.png")
    orm.save(folder / "orm.png")
    print("wrote", folder)


def rock_set(name, seed, mineral_rgb):
    rng = random.Random(seed)
    bc = Image.new("RGB", (SZ, SZ))
    px = bc.load()
    ht = fbm(SZ, SZ, 6, seed=seed)
    hl = ht.load()
    for y in range(SZ):
        for x in range(SZ):
            v = hl[x, y]
            base = 35 + v // 5
            band = int(20 * math.sin(y / 40.0 + v / 80.0))
            r = max(0, min(255, base + band // 2 + 8))
            g = max(0, min(255, base + band // 3))
            b = max(0, min(255, base - 5 + band // 4))
            px[x, y] = (r, g, b)
    d = ImageDraw.Draw(bc)
    mr, mg, mb = mineral_rgb
    for _vein in range(5):
        points = []
        x = rng.randint(0, SZ)
        y = rng.randint(0, SZ)
        for _s in range(80):
            points.append((x, y))
            x = (x + rng.randint(-8, 14)) % SZ
            y = (y + rng.randint(-6, 12)) % SZ
        d.line(points, fill=(mr, mg, mb), width=rng.randint(4, 10))
        d.line(points, fill=(min(255, mr + 30), min(255, mg + 20), mb), width=2)
    for _ in range(30):
        x, y = rng.randint(0, SZ - 40), rng.randint(0, SZ - 40)
        d.polygon(
            [
                (x, y),
                (x + rng.randint(10, 40), y + rng.randint(-5, 15)),
                (x + rng.randint(5, 30), y + rng.randint(20, 50)),
            ],
            fill=(22, 20, 18),
        )
    ht2 = ImageChops.add(ht, fbm(SZ, SZ, 3, seed + 50).point(lambda p: p // 3))
    save_set(OUT / name, bc, ht2, metal_val=40, rough_bias=180)


def main():
    bc = panel_grid(SZ, SZ, cell=80, color=(92, 88, 82), line_c=(48, 46, 42))
    d = ImageDraw.Draw(bc)
    for y in range(0, SZ, 160):
        d.rectangle([0, y + 4, SZ, y + 14], fill=(180, 130, 40))
    for x in range(0, SZ, 200):
        d.rectangle([x + 10, 0, x + 18, SZ], fill=(70, 120, 150))
    bc = scuffs(bc, seed=7, count=600)
    ht = fbm(SZ, SZ, 5, seed=3)
    for x in range(0, SZ, 80):
        ImageDraw.Draw(ht).rectangle([x, 0, x + 2, SZ], fill=40)
    for y in range(0, SZ, 80):
        ImageDraw.Draw(ht).rectangle([0, y, SZ, y + 2], fill=40)
    save_set(OUT / "place_station_trade_hub", bc, ht, metal_val=150, rough_bias=110)

    bc = panel_grid(SZ, SZ, cell=96, color=(58, 64, 72), line_c=(28, 30, 34))
    d = ImageDraw.Draw(bc)
    for y in (100, 400, 700):
        d.rectangle([0, y, SZ, y + 18], fill=(40, 160, 190))
    bc = scuffs(bc, seed=11, count=500)
    ht = fbm(SZ, SZ, 5, seed=9)
    for x in range(0, SZ, 96):
        ImageDraw.Draw(ht).rectangle([x, 0, x + 3, SZ], fill=30)
    save_set(OUT / "place_gate_jump_ring", bc, ht, metal_val=170, rough_bias=100)

    rock_set("place_asteroid_rock_a", 21, (170, 110, 40))
    rock_set("place_asteroid_rock_b", 33, (60, 140, 150))
    rock_set("place_asteroid_rock_c", 47, (180, 90, 50))
    print("ALL TEXTURES DONE")


if __name__ == "__main__":
    main()

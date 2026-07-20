#!/usr/bin/env python3
"""Procedural trim/wear texture generator for Full Finish Bar surfacing."""
from __future__ import annotations

import argparse
import os
import random
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[3]
TEX_ROOT = ROOT / 'assets' / 'ships' / 'parts' / 'textures'

PALETTES: dict[str, dict] = {
    'place_asteroid_rock_c': {
        'trim': [(72, 58, 48), (58, 46, 40), (88, 70, 55), (45, 38, 34), (95, 78, 62)],
        'wear_bias': 0.45,
        'accent_wear': (140, 90, 55),
    },
    'place_asteroid_graffiti': {
        'trim': [(55, 48, 42), (70, 35, 55), (40, 55, 70), (85, 70, 45), (35, 38, 42)],
        'wear_bias': 0.55,
        'accent_wear': (200, 60, 120),
    },
    'place_station_refinery': {
        'trim': [(90, 55, 35), (120, 75, 45), (70, 48, 38), (140, 90, 55), (55, 40, 32)],
        'wear_bias': 0.55,
        'accent_wear': (180, 90, 40),
    },
    'place_station_military': {
        'trim': [(45, 52, 58), (60, 68, 75), (35, 42, 48), (80, 88, 95), (25, 55, 70)],
        'wear_bias': 0.35,
        'accent_wear': (40, 180, 210),
    },
    'place_station_blackmarket': {
        'trim': [(28, 28, 32), (40, 38, 42), (22, 24, 28), (55, 45, 40), (18, 20, 24)],
        'wear_bias': 0.65,
        'accent_wear': (120, 30, 50),
    },
    'place_gate_jump_ring': {
        'trim': [(50, 55, 65), (70, 75, 85), (40, 45, 55), (90, 95, 105), (30, 50, 80)],
        'wear_bias': 0.4,
        'accent_wear': (60, 140, 220),
    },
    'place_station_mining': {
        'trim': [(85, 60, 40), (110, 80, 55), (65, 50, 38), (95, 70, 48), (50, 42, 35)],
        'wear_bias': 0.6,
        'accent_wear': (200, 140, 60),
    },
    'place_station_fab': {
        'trim': [(75, 70, 65), (95, 88, 80), (60, 58, 55), (110, 100, 90), (45, 42, 40)],
        'wear_bias': 0.5,
        'accent_wear': (220, 120, 40),
    },
    'place_station_research': {
        'trim': [(180, 185, 190), (150, 155, 165), (200, 205, 210), (120, 130, 145), (90, 100, 115)],
        'wear_bias': 0.25,
        'accent_wear': (50, 180, 220),
    },
}


def _noise_layer(size: int, seed: int, scale: float = 1.0) -> Image.Image:
    rng = random.Random(seed)
    img = Image.new('L', (size, size))
    px = img.load()
    for y in range(size):
        for x in range(size):
            v = int(rng.random() * 255 * scale)
            px[x, y] = min(255, v)
    return img.filter(ImageFilter.GaussianBlur(radius=1.2))


def make_trim(part_id: str, size: int = 1024) -> Image.Image:
    pal = PALETTES[part_id]
    rng = random.Random(hash(part_id) & 0xFFFFFFFF)
    img = Image.new('RGB', (size, size), (12, 12, 14))
    draw = ImageDraw.Draw(img)
    colors = pal['trim']
    for _ in range(90):
        c = colors[rng.randint(0, len(colors) - 1)]
        w = rng.randint(8, 120)
        h = rng.randint(4, 48)
        x = rng.randint(0, size - w)
        y = rng.randint(0, size - h)
        draw.rectangle([x, y, x + w, y + h], fill=c)
    noise = _noise_layer(size, hash(part_id + 'trim'), 0.15)
    img = Image.blend(img, Image.merge('RGB', (noise, noise, noise)), 0.12)
    return img


def make_wear(part_id: str, size: int = 1024) -> Image.Image:
    pal = PALETTES[part_id]
    rng = random.Random(hash(part_id + 'wear') & 0xFFFFFFFF)
    r = Image.new('L', (size, size), 30)
    g = Image.new('L', (size, size), int(140 + pal['wear_bias'] * 60))
    b = Image.new('L', (size, size), 20)
    draw_r = ImageDraw.Draw(r)
    draw_g = ImageDraw.Draw(g)
    accent = pal['accent_wear']
    for _ in range(40):
        w = rng.randint(20, 180)
        h = rng.randint(6, 40)
        x = rng.randint(0, size - w)
        y = rng.randint(0, size - h)
        draw_g.rectangle([x, y, x + w, y + h], fill=rng.randint(160, 230))
    for _ in range(12):
        w = rng.randint(30, 100)
        h = rng.randint(30, 100)
        x = rng.randint(0, size - w)
        y = rng.randint(0, size - h)
        draw_r.rectangle([x, y, x + w, y + h], fill=rng.randint(80, 200))
    g = g.filter(ImageFilter.GaussianBlur(radius=2.0))
    accent_img = Image.new('RGB', (size, size), accent)
    accent_mask = _noise_layer(size, hash(part_id + 'acc'), 0.4)
    b = accent_mask
    return Image.merge('RGB', (r, g, b))


def generate(part_id: str) -> tuple[str, str]:
    if part_id not in PALETTES:
        raise SystemExit(f'unknown part_id: {part_id}')
    out_dir = TEX_ROOT / part_id
    out_dir.mkdir(parents=True, exist_ok=True)
    trim_path = out_dir / f'{part_id}_trim_sheet_1k.jpg'
    wear_path = out_dir / f'{part_id}_wear_mask_1k.jpg'
    make_trim(part_id).save(trim_path, quality=88)
    make_wear(part_id).save(wear_path, quality=88)
    return str(trim_path), str(wear_path)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument('part_ids', nargs='+')
    args = ap.parse_args()
    for pid in args.part_ids:
        trim, wear = generate(pid)
        print(f'{pid}: {trim} {wear}')


if __name__ == '__main__':
    main()
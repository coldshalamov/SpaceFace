#!/usr/bin/env python3
"""Generate palette-distinct concept reference JPGs for cities, landmarks, people, styles.

Output under assets/concept/ — mood/silhouette references for Blender MCP iteration.
No baked caption text (runtime-safe reference sheets).
"""
from __future__ import annotations

import hashlib
import json
import math
import os
import random
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'assets' / 'concept'
INDEX = OUT / 'index.json'

SECTORS = [
    ('sector_helios_prime', 'helios', (57, 208, 255), (10, 20, 48)),
    ('sector_ceres_belt', 'ceres', (255, 179, 92), (16, 24, 32)),
    ('sector_tethys_junction', 'tethys', (136, 200, 255), (8, 24, 40)),
    ('sector_vesta_forge', 'vesta', (255, 140, 64), (24, 8, 8)),
    ('sector_pallas_drift', 'pallas', (255, 92, 92), (12, 16, 28)),
    ('sector_io_reach', 'io', (255, 176, 120), (8, 16, 20)),
    ('sector_charon_expanse', 'charon', (255, 150, 80), (20, 8, 8)),
    ('sector_sker_haven', 'sker', (255, 100, 100), (8, 12, 20)),
    ('sector_veil_nebula', 'veil', (141, 102, 255), (12, 28, 24)),
    ('sector_ashfall_reach', 'ashfall', (180, 120, 255), (16, 12, 20)),
]


def lerp(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))


def save_jpg(path: Path, img: Image.Image):
    path.parent.mkdir(parents=True, exist_ok=True)
    img.save(path, 'JPEG', quality=88, optimize=True)


def city_ref(sector_id: str, slug: str, accent, bg):
    rng = random.Random(hashlib.sha256(sector_id.encode()).hexdigest())
    w, h = 1280, 720
    img = Image.new('RGB', (w, h), bg)
    draw = ImageDraw.Draw(img)
    for y in range(h):
        t = y / h
        draw.line([(0, y), (w, y)], fill=lerp(bg, (max(0, bg[0] - 6), max(0, bg[1] - 6), min(255, bg[2] + 8)), t))
    draw = ImageDraw.Draw(img)
    base_y = int(h * 0.72)
    blocks = 8 + rng.randint(0, 5)
    x = 40
    while x < w - 80:
        bw = rng.randint(50, 140)
        bh = rng.randint(80, 280)
        col = lerp(accent, (40, 44, 52), rng.random() * 0.55)
        draw.rectangle([x, base_y - bh, x + bw, base_y], fill=col, outline=lerp(accent, (20, 20, 28), 0.3))
        for wy in range(base_y - bh + 12, base_y - 8, 18):
            for wx in range(x + 8, x + bw - 8, 14):
                if rng.random() > 0.35:
                    draw.rectangle([wx, wy, wx + 6, wy + 8], fill=lerp(accent, (255, 255, 220), 0.25))
        x += bw + rng.randint(8, 24)
    ring_cx, ring_cy, ring_r = w // 2, int(h * 0.38), int(h * 0.22)
    draw.ellipse([ring_cx - ring_r, ring_cy - ring_r, ring_cx + ring_r, ring_cy + ring_r], outline=accent, width=4)
    img = img.filter(ImageFilter.GaussianBlur(radius=0.4))
    path = OUT / 'cities' / f'concept_{slug}_city.jpg'
    save_jpg(path, img)
    return {
        'concept_id': f'concept_{slug}_city',
        'path': f'cities/concept_{slug}_city.jpg',
        'target_asset_role': f'{sector_id}/city_hub',
        'blender_part_id': None,
        'sector_placement_id': None,
        'story_citation': 'PLACE-IDENTITY-GAP-FILL city district',
    }


def landmark_ref(sector_id: str, slug: str, accent, bg, name: str):
    w, h = 1024, 576
    img = Image.new('RGB', (w, h), bg)
    draw = ImageDraw.Draw(img)
    cx, cy = w // 2, h // 2
    for i in range(6):
        ang = i / 6 * math.tau
        r = 140 + i * 18
        x0 = cx + math.cos(ang) * r
        y0 = cy + math.sin(ang) * r * 0.35
        draw.polygon([
            (x0, y0), (x0 + 40, y0 - 120), (x0 + 90, y0 - 20), (x0 + 30, y0 + 40),
        ], fill=lerp(accent, (48, 52, 60), 0.35))
    draw.ellipse([cx - 90, cy - 90, cx + 90, cy + 90], outline=accent, width=6)
    draw.rectangle([cx - 30, cy - 160, cx + 30, cy - 90], fill=lerp(accent, (30, 34, 40), 0.2))
    path = OUT / 'landmarks' / f'concept_landmark_{slug}.jpg'
    save_jpg(path, img)
    return {
        'concept_id': f'concept_landmark_{slug}',
        'path': f'landmarks/concept_landmark_{slug}.jpg',
        'target_asset_role': f'{sector_id}/landmark_poi',
        'blender_part_id': None,
        'sector_placement_id': f'poi_{slug}',
        'story_citation': f'PLACE-IDENTITY-GAP-FILL {name}',
    }


def people_ref(role: str, accent, bg):
    w, h = 768, 1024
    img = Image.new('RGB', (w, h), bg)
    draw = ImageDraw.Draw(img)
    draw.ellipse([w // 2 - 90, 120, w // 2 + 90, 300], fill=lerp(accent, (36, 40, 48), 0.5))
    draw.rectangle([w // 2 - 120, 300, w // 2 + 120, h - 80], fill=lerp(accent, (28, 32, 40), 0.45))
    draw.rectangle([w // 2 - 160, 360, w // 2 - 40, 520], fill=accent)
    draw.rectangle([w // 2 + 40, 360, w // 2 + 160, 520], fill=lerp(accent, (20, 24, 30), 0.3))
    path = OUT / 'people' / f'concept_npc_{role}.jpg'
    save_jpg(path, img)
    return {
        'concept_id': f'concept_npc_{role}',
        'path': f'people/concept_npc_{role}.jpg',
        'target_asset_role': f'npc/{role}',
        'blender_part_id': None,
        'sector_placement_id': None,
        'story_citation': 'NPC-ECOLOGY dress reference',
    }


def style_ref():
    w, h = 1600, 900
    img = Image.new('RGB', (w, h), (8, 12, 20))
    draw = ImageDraw.Draw(img)
    swatches = [
        ('core', (57, 208, 255)), ('belt', (255, 179, 92)), ('fringe', (255, 92, 92)), ('anomaly', (141, 102, 255)),
    ]
    for i, (_, col) in enumerate(swatches):
        x0 = 80 + i * 360
        draw.rectangle([x0, 120, x0 + 300, 420], fill=col)
        draw.rectangle([x0, 460, x0 + 300, 760], fill=lerp(col, (24, 28, 36), 0.55))
    path = OUT / 'styles' / 'concept_style_bible.jpg'
    save_jpg(path, img)
    return {
        'concept_id': 'concept_style_bible',
        'path': 'styles/concept_style_bible.jpg',
        'target_asset_role': 'style/master_bible',
        'blender_part_id': None,
        'sector_placement_id': None,
        'story_citation': 'GRAPHICS_STYLE_GUIDE palette classes',
    }


def ship_ref(name: str, accent, bg):
    w, h = 1280, 720
    img = Image.new('RGB', (w, h), bg)
    draw = ImageDraw.Draw(img)
    draw.polygon([(200, 400), (900, 320), (1050, 380), (900, 440)], fill=lerp(accent, (40, 44, 52), 0.35))
    draw.polygon([(900, 340), (1100, 360), (1080, 400), (900, 390)], fill=accent)
    path = OUT / 'ships' / f'concept_ship_{name}.jpg'
    save_jpg(path, img)
    return {
        'concept_id': f'concept_ship_{name}',
        'path': f'ships/concept_ship_{name}.jpg',
        'target_asset_role': f'ship/{name}',
        'blender_part_id': None,
        'sector_placement_id': None,
        'story_citation': 'VISUAL_ASSET_PLAN hull reference',
    }


def planet_ref(name: str, accent, bg):
    w, h = 1024, 1024
    img = Image.new('RGB', (w, h), (2, 4, 12))
    draw = ImageDraw.Draw(img)
    cx, cy, r = w // 2, h // 2, 320
    draw.ellipse([cx - r, cy - r, cx + r, cy + r], fill=lerp(accent, bg, 0.25))
    draw.ellipse([cx - r + 60, cy - r + 40, cx + r - 80, cy + r - 50], fill=lerp(accent, (20, 24, 32), 0.4))
    path = OUT / 'planets' / f'concept_planet_{name}.jpg'
    save_jpg(path, img)
    return {
        'concept_id': f'concept_planet_{name}',
        'path': f'planets/concept_planet_{name}.jpg',
        'target_asset_role': f'planet/{name}',
        'blender_part_id': None,
        'sector_placement_id': None,
        'story_citation': 'CURATED_SPACE_FEATURES F07',
    }


def main():
    idx = json.loads(INDEX.read_text(encoding='utf-8'))
    existing = {e['concept_id'] for e in idx['entries']}
    new_entries = []

    for sector_id, slug, accent, bg in SECTORS:
        cid = f'concept_{slug}_city'
        if cid not in existing:
            new_entries.append(city_ref(sector_id, slug, accent, bg))
        lid = f'concept_landmark_{slug}'
        if lid not in existing and slug not in ('helios', 'ceres'):
            new_entries.append(landmark_ref(sector_id, slug, accent, bg, slug))

    for role, accent, bg in [
        ('dock_worker', (57, 208, 255), (10, 20, 48)),
        ('belt_foreman', (255, 179, 92), (16, 24, 32)),
        ('fringe_smuggler', (255, 92, 92), (12, 16, 28)),
    ]:
        cid = f'concept_npc_{role}'
        if cid not in existing:
            new_entries.append(people_ref(role, accent, bg))

    if 'concept_style_bible' not in existing:
        new_entries.append(style_ref())

    for name, accent, bg in [
        ('concord_patrol', (57, 208, 255), (8, 16, 32)),
        ('drift_hauler', (255, 179, 92), (16, 20, 28)),
    ]:
        cid = f'concept_ship_{name}'
        if cid not in existing:
            new_entries.append(ship_ref(name, accent, bg))

    for name, accent, bg in [
        ('ceres', (255, 179, 92), (32, 24, 16)),
        ('veil', (141, 102, 255), (16, 32, 28)),
    ]:
        cid = f'concept_planet_{name}'
        if cid not in existing:
            new_entries.append(planet_ref(name, accent, bg))

    if new_entries:
        idx['entries'].extend(new_entries)
        INDEX.write_text(json.dumps(idx, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({'added': len(new_entries), 'total': len(idx['entries'])}, indent=2))


if __name__ == '__main__':
    main()
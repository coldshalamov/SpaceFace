#!/usr/bin/env python3
"""Render deterministic inspection sheets for the M4 surface-foundry maps."""
from __future__ import annotations

import argparse
from pathlib import Path
import sys

import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from assets.ships.m4_helios_hub.scripts.surface_remaster_v2 import (  # noqa: E402
    PROFILES,
    generate_maps,
)


def _rgb_image(pixels: np.ndarray) -> Image.Image:
    rgb = np.clip(pixels[:, :, :3] * 255.0 + 0.5, 0.0, 255.0).astype(np.uint8)
    return Image.fromarray(rgb, "RGB")


def _channel_image(pixels: np.ndarray, channel: int) -> Image.Image:
    gray = np.clip(pixels[:, :, channel] * 255.0 + 0.5, 0.0, 255.0).astype(np.uint8)
    return Image.fromarray(gray, "L").convert("RGB")


def render_role(role: str, size: int, output_dir: Path) -> Path:
    maps = generate_maps(role, size, size)
    panels = [
        ("BASE COLOR", _rgb_image(maps["basecolor"])),
        ("NORMAL", _rgb_image(maps["normal"])),
        ("AO", _channel_image(maps["orm"], 0)),
        ("ROUGHNESS", _channel_image(maps["orm"], 1)),
        ("METALLIC", _channel_image(maps["orm"], 2)),
    ]
    label_height = 30
    sheet = Image.new("RGB", (size * len(panels), size + label_height), (8, 10, 13))
    draw = ImageDraw.Draw(sheet)
    for index, (label, panel) in enumerate(panels):
        left = index * size
        sheet.paste(panel, (left, label_height))
        draw.text((left + 8, 8), f"{role.upper()} / {label}", fill=(225, 231, 236))
    output_dir.mkdir(parents=True, exist_ok=True)
    output_path = output_dir / f"{role}-surface-sheet.png"
    sheet.save(output_path, optimize=True)
    return output_path


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output-dir", type=Path, required=True)
    parser.add_argument("--size", type=int, default=512)
    parser.add_argument("--roles", nargs="*", choices=tuple(PROFILES), default=tuple(PROFILES))
    args = parser.parse_args()
    if args.size < 64:
        parser.error("--size must be at least 64")
    for role in args.roles:
        print(render_role(role, args.size, args.output_dir))


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""Rasterize the SpaceFace SVG masters. No game, network, or npm changes required.

  python -m pip install -r assets/brand/requirements.txt
  python assets/brand/export-icons.py --out assets/brand/exports

Each raster is rendered from a vector optical master, not from another raster.
The ICO preserves the individually rendered small-size masters.
"""
from __future__ import annotations
import argparse
import hashlib
import io
import json
from pathlib import Path
import re
import struct
import sys
import xml.etree.ElementTree as ET

try:
    import cairosvg
    from PIL import Image
except ImportError as exc:
    raise SystemExit("Install the adjacent requirements.txt before exporting icons.") from exc

HERE = Path(__file__).resolve().parent
SVG_NAMES = (
    "spaceface-emblem.svg", "spaceface-emblem-flat.svg",
    "spaceface-emblem-mono.svg", "spaceface-emblem-reverse.svg",
    "spaceface-emblem-small.svg", "spaceface-launcher.svg", "spaceface-favicon.svg",
)
PNG_SIZES = (16, 20, 24, 32, 40, 48, 64, 128, 256, 512, 1024)
ICO_SIZES = (16, 20, 24, 32, 40, 48, 64, 128, 256)
ALLOWED_TAGS = {"svg", "title", "desc", "defs", "linearGradient", "stop", "g", "path", "rect", "clipPath"}


def validate_svg(path: Path) -> dict[str, str | int]:
    """Reject external dependencies and check local references before rendering."""
    data = path.read_bytes()
    if b"<!DOCTYPE" in data or b"<!ENTITY" in data:
        raise ValueError(f"{path.name}: DTD/entity is not allowed")
    root = ET.fromstring(data)
    if root.attrib.get("viewBox") != "0 0 512 512":
        raise ValueError(f"{path.name}: expected a 512-unit square viewBox")
    ids: set[str] = set()
    refs: list[str] = []
    for node in root.iter():
        tag = node.tag.rsplit("}", 1)[-1]
        if tag not in ALLOWED_TAGS:
            raise ValueError(f"{path.name}: unsupported element {tag}")
        ident = node.attrib.get("id")
        if ident:
            if ident in ids:
                raise ValueError(f"{path.name}: duplicate ID {ident}")
            ids.add(ident)
        for attr, value in node.attrib.items():
            local = attr.rsplit("}", 1)[-1]
            if local.startswith("on") or local in {"href", "style"}:
                raise ValueError(f"{path.name}: unexpected active/external attribute {local}")
            for ref in re.findall(r"url\((.*?)\)", value):
                if not ref.startswith("#"):
                    raise ValueError(f"{path.name}: external URL")
                refs.append(ref[1:])
        refs.extend(node.attrib.get("aria-labelledby", "").split())
    missing = set(refs) - ids
    if missing:
        raise ValueError(f"{path.name}: unresolved IDs: {sorted(missing)}")
    return {"bytes": len(data), "sha256": hashlib.sha256(data).hexdigest()}


def raster(path: Path, size: int) -> Image.Image:
    # Supersample to stabilize curved edges; every size starts from its SVG.
    factor = 4 if size <= 256 else 2
    png = cairosvg.svg2png(url=str(path), output_width=size * factor, output_height=size * factor)
    with Image.open(io.BytesIO(png)) as im:
        return im.convert("RGBA").resize((size, size), Image.Resampling.LANCZOS)


def save_ico(path: Path, frames: dict[int, Image.Image]) -> None:
    """Write PNG-compressed ICO entries without resampling the optical masters."""
    chunks = []
    for size in ICO_SIZES:
        buf = io.BytesIO()
        frames[size].save(buf, format="PNG", optimize=True)
        chunks.append((size, buf.getvalue()))
    offset = 6 + 16 * len(chunks)
    directory = bytearray(struct.pack("<HHH", 0, 1, len(chunks)))
    for size, png in chunks:
        directory.extend(struct.pack("<BBBBHHII", size % 256, size % 256, 0, 0, 1, 32, len(png), offset))
        offset += len(png)
    path.write_bytes(bytes(directory) + b"".join(png for _, png in chunks))
    with Image.open(path) as check:
        if check.ico.sizes() != {(s, s) for s in ICO_SIZES}:
            raise ValueError("ICO directory did not round-trip")
        for size in ICO_SIZES:
            restored = check.ico.getimage((size, size)).convert("RGBA")
            if restored.tobytes() != frames[size].tobytes():
                raise ValueError(f"ICO {size}px frame did not round-trip exactly")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", type=Path, default=HERE / "exports")
    args = parser.parse_args()
    out = args.out.resolve()
    out.mkdir(parents=True, exist_ok=True)
    sources = {name: validate_svg(HERE / name) for name in SVG_NAMES}
    frames: dict[int, Image.Image] = {}
    for size in PNG_SIZES:
        source = "spaceface-favicon.svg" if size <= 32 else "spaceface-launcher.svg"
        im = raster(HERE / source, size)
        im.save(out / f"spaceface-launcher-{size}.png", optimize=True)
        frames[size] = im
    for size in (256, 512, 1024, 2048):
        raster(HERE / "spaceface-emblem.svg", size).save(out / f"spaceface-emblem-{size}.png", optimize=True)
    save_ico(out / "spaceface.ico", frames)
    frames[1024].save(out / "spaceface.icns", format="ICNS")
    with Image.open(out / "spaceface.icns") as check:
        check.load()
        if check.size != (1024, 1024):
            raise ValueError("ICNS largest representation did not round-trip")
    receipt = {
        "sources": sources,
        "launcher_png_sizes": list(PNG_SIZES),
        "ico_sizes": list(ICO_SIZES),
        "small_optical_master_used_through_px": 32,
        "svg_checks": "XML, allowed elements, unique IDs, internal-only references",
        "native_file_checks": "ICO all frames decoded and compared byte-for-byte; ICNS largest frame decoded",
        "scope": "Asset export checks only; not a native launcher or in-game integration test.",
    }
    (out / "export-receipt.json").write_text(json.dumps(receipt, indent=2) + "\n", encoding="utf-8")
    print(f"Exported {len(PNG_SIZES) + 4} PNGs, ICO and ICNS to {out}")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except (ValueError, OSError, ET.ParseError) as exc:
        raise SystemExit(f"Icon export failed: {exc}") from exc

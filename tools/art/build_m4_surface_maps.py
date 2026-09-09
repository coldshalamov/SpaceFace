#!/usr/bin/env python3
"""Generate immutable PNG channels for the M4 semantic surface recipes."""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
import sys

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from assets.ships.m4_helios_hub.scripts.surface_remaster_v2 import (  # noqa: E402
    PROFILES,
    ROCK_REFERENCE_FILES,
    generate_maps,
)


def sha256(path: Path) -> str:
    value = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            value.update(chunk)
    return value.hexdigest().upper()


def repository_path(path: Path) -> str:
    """Return stable provenance without leaking a controller/worktree path."""
    return path.resolve().relative_to(ROOT.resolve()).as_posix()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output-dir", type=Path, required=True)
    parser.add_argument("--size", type=int, default=1024)
    parser.add_argument("--roles", nargs="+", choices=tuple(PROFILES), required=True)
    args = parser.parse_args()
    args.output_dir.mkdir(parents=True, exist_ok=True)
    artifacts = []
    for role in args.roles:
        for channel, pixels in generate_maps(role, args.size, args.size).items():
            target = args.output_dir / f"{role}_{channel}.png"
            encoded = np.clip(pixels * 255.0 + 0.5, 0.0, 255.0).astype(np.uint8)
            Image.fromarray(encoded, "RGBA").save(target, optimize=True)
            artifacts.append({
                "role": role,
                "channel": channel,
                "path": target.relative_to(args.output_dir).as_posix(),
                "sha256": sha256(target),
            })
    provenance = [
        {"role": key, "path": repository_path(path), "sha256": sha256(path)}
        for key, path in ROCK_REFERENCE_FILES.items()
        if any(role in {"rock", "warm"} for role in args.roles)
    ]
    report = {
        "schema": "spaceface.m4SurfaceMapBuild.v1",
        "size": args.size,
        "roles": args.roles,
        "artifacts": artifacts,
        "sourceProvenance": provenance,
    }
    report_path = args.output_dir / "surface-map-build.json"
    report_path.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps({"ok": True, "report": str(report_path), "artifacts": len(artifacts)}))


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""Render an authored dock candidate with a real production ship at route scale."""
from __future__ import annotations

import argparse
import json
from pathlib import Path
import sys

import bpy

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from tools.blender.remaster_dock_interior_family_v1 import render_proofs  # noqa: E402


def cli() -> argparse.Namespace:
    values = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--ship", type=Path, required=True)
    parser.add_argument("--variant", choices=("industrial", "military", "grit"), required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    parser.add_argument("--report", type=Path, required=True)
    return parser.parse_args(values)


def main() -> None:
    args = cli()
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=str(args.ship.resolve()))
    imported = sorted(set(bpy.data.objects) - before, key=lambda value: value.name)
    for obj in imported:
        obj["spaceface.reviewDonor"] = args.ship.name
        if obj.type == "MESH":
            collision_only = "COLLISION" in obj.name.upper() or bool(obj.get("spaceface.collisionOnly"))
            lower_lod = obj.name.startswith(("LOD1_", "LOD2_"))
            if collision_only or lower_lod:
                obj.hide_render = True
    outputs = render_proofs(args.output_dir.resolve(), args.variant)
    report = {
        "schema": "spaceface.dockShipCompositionProof.v1",
        "dockBlend": bpy.data.filepath,
        "ship": str(args.ship.resolve()),
        "variant": args.variant,
        "importedObjects": [obj.name for obj in imported],
        "renders": [str(path) for path in outputs],
        "status": "scratch-composition-proof-not-runtime-acceptance",
    }
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps({"ok": True, "renders": report["renders"], "report": str(args.report)}))


if __name__ == "__main__":
    main()

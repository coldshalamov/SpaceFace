"""Apply the Kestrel v2 maps in memory and export inspectable PNGs without saving the blend."""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import bpy

sys.path.insert(0, str(Path(__file__).resolve().parent))
from surface_maps_v2 import REMASTER_ID, apply_to_blender_images, write_preview_images


def main() -> int:
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args(argv)
    report = apply_to_blender_images(bpy)
    written = write_preview_images(bpy, args.output)
    payload = {
        "schema": "spaceface.kestrelSurfacePreview.v2",
        "remasterId": REMASTER_ID,
        "sourceBlend": bpy.data.filepath,
        "images": report,
        "written": [str(path) for path in written],
    }
    (args.output / "surface-report.json").write_text(
        json.dumps(payload, indent=2) + "\n", encoding="utf-8"
    )
    print("KESTREL_SURFACE_PREVIEW=" + json.dumps(payload))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

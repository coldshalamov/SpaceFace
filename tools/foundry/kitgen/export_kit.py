"""export_kit.py — headless exporter for the LANE D microdetail kit.

Runs as:
    blender -b --factory-startup -P tools/foundry/kitgen/export_kit.py

Builds every family x variant, exports each as a standalone GLB into
``assets/ships/foundry/fleet_breadth_20260720/kit/kit_<family>_v<NN>.glb``,
and writes ``kit_manifest.json`` next to them. Each manifest entry records:
``family``, ``variant``, ``seed``, ``tris``, ``dims_m``, ``materials``,
``glb`` (filename), ``sha256`` (of the GLB bytes).
"""

from __future__ import annotations

import os
import sys
import json
import hashlib
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import bpy
import kitgen

HERE = Path(__file__).resolve().parent
WORKTREE = HERE.parents[2]
KIT_DIR = WORKTREE / "assets" / "ships" / "foundry" / "fleet_breadth_20260720" / "kit"
MANIFEST_PATH = KIT_DIR / "kit_manifest.json"

SEED = 0xC0FFEE  # stable public seed; all pieces derive from (family, variant, SEED)


def clear_default_scene():
    """Remove Blender's startup Cube/Camera/Light."""
    for block in (bpy.data.objects, bpy.data.meshes, bpy.data.materials,
                  bpy.data.cameras, bpy.data.lights):
        for item in list(block):
            block.remove(item)


def export_object_glb(obj: bpy.types.Object, glb_path: Path):
    """Export a single object (selected/active only) as a GLB file."""
    # Ensure the target dir exists
    glb_path.parent.mkdir(parents=True, exist_ok=True)
    # Configure selection: only this object
    for o in bpy.context.scene.objects:
        o.select_set(False)
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    # glTF 2.0 binary export; Yup to match Three.js convention.
    bpy.ops.export_scene.gltf(
        filepath=str(glb_path),
        export_format='GLB',
        export_yup=True,
        export_apply=True,
        use_selection=True,
        export_cameras=False,
        export_lights=False,
        export_extras=False,
    )


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


def tris_of(obj: bpy.types.Object) -> int:
    mesh = obj.data
    return sum(1 for p in mesh.polygons if len(p.vertices) == 3) + \
           sum(max(0, len(p.vertices) - 2) for p in mesh.polygons if len(p.vertices) > 3)


def dims_of(obj: bpy.types.Object) -> list[float]:
    d = obj.dimensions
    return [round(float(d.x), 6), round(float(d.y), 6), round(float(d.z), 6)]


def materials_of(obj: bpy.types.Object) -> list[str]:
    return sorted({slot.name for slot in obj.data.materials if slot is not None})


def main():
    KIT_DIR.mkdir(parents=True, exist_ok=True)
    kitgen.ensure_materials()

    pieces = []
    errors = []
    for family in kitgen.list_families():
        n = kitgen.variant_count(family)
        for v in range(1, n + 1):
            kitgen.clear_scene()
            try:
                objs = kitgen.build(family, v, SEED)
            except Exception as e:
                errors.append({"family": family, "variant": v, "phase": "build", "error": str(e)})
                print(f"  FAIL build: {family} v{v}: {e}")
                continue
            if len(objs) != 1:
                errors.append({"family": family, "variant": v, "phase": "build",
                               "error": f"expected 1 object, got {len(objs)}"})
                print(f"  FAIL: {family} v{v}: expected 1 object, got {len(objs)}")
                continue
            obj = objs[0]
            # File naming: kit_<family>_v<NN>.glb
            glb_name = f"kit_{family}_v{v:02d}.glb"
            glb_path = KIT_DIR / glb_name
            try:
                export_object_glb(obj, glb_path)
            except Exception as e:
                errors.append({"family": family, "variant": v, "phase": "export", "error": str(e)})
                print(f"  FAIL export: {family} v{v}: {e}")
                continue
            digest = sha256_file(glb_path)
            pieces.append({
                "family": family,
                "variant": v,
                "seed": SEED,
                "tris": tris_of(obj),
                "dims_m": dims_of(obj),
                "materials": materials_of(obj),
                "glb": glb_name,
                "sha256": digest,
            })
            print(f"  ok: {family} v{v} -> {glb_name}  tris={tris_of(obj)}  sha={digest[:12]}...")

    # Sort for determinism: family alphabetical, then variant ascending.
    pieces.sort(key=lambda p: (p["family"], p["variant"]))

    manifest = {
        "tool": "export_kit.py",
        "schema_version": 1,
        "seed": SEED,
        "piece_count": len(pieces),
        "pieces": pieces,
        "errors": errors,
    }
    MANIFEST_PATH.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    print(f"\nManifest written: {MANIFEST_PATH}  ({len(pieces)} pieces, {len(errors)} errors)")
    if errors:
        sys.exit(1)


if __name__ == "__main__":
    main()

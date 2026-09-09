"""Export a Golden Station authoring blend with exact runtime LOD node names.

Golden Station keeps semantic ``sf_lod_membership`` on authored objects while the
runtime deliberately accepts only exact LOD0/LOD1/LOD2 names.  This controller-owned
export step expands two-level membership into named nodes without changing the
authoring blend, then writes a GLB and a machine-readable receipt.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
import sys
import traceback

import bpy


RECIPE_ID = "helios-golden-station-v4"
LEVELS = ("lod0", "lod1", "lod2")


def _args() -> argparse.Namespace:
    tail = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output-glb", type=Path, required=True)
    parser.add_argument("--report", type=Path, required=True)
    return parser.parse_args(tail)


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest().upper()


def _golden_objects() -> list:
    return sorted(
        [obj for obj in bpy.data.objects if obj.get("spacefaceGoldenRecipe") == RECIPE_ID],
        key=lambda obj: obj.name,
    )


def _expand_runtime_lod_nodes() -> dict:
    source = _golden_objects()
    if not source:
        raise RuntimeError(f"opened blend contains no {RECIPE_ID} objects")
    exact_counts = {level: 0 for level in LEVELS}
    common = 0
    created = []
    for obj in source:
        raw = str(obj.get("sf_lod_membership", ""))
        membership = tuple(item.strip().lower() for item in raw.split(",") if item.strip())
        if not membership or any(level not in LEVELS for level in membership):
            raise RuntimeError(f"{obj.name}: invalid sf_lod_membership={raw!r}")
        if membership == LEVELS:
            common += 1
            obj["spacefaceRuntimeLodMode"] = "common-all-levels"
            continue
        base_name = obj.name
        collections = list(obj.users_collection)
        if not collections:
            raise RuntimeError(f"{base_name}: authored object is not linked to a collection")
        for index, level in enumerate(membership):
            target = obj if index == 0 else obj.copy()
            if index > 0:
                target.data = obj.data
                for collection in collections:
                    collection.objects.link(target)
            target.name = f"{level.upper()}_{base_name}"
            target["spacefaceRuntimeLod"] = level
            target["spacefaceRuntimeLodSource"] = base_name
            exact_counts[level] += 1
            created.append(target.name)
    duplicates = [name for name in created if sum(1 for obj in bpy.data.objects if obj.name == name) != 1]
    if duplicates:
        raise RuntimeError(f"runtime LOD node names are not unique: {duplicates}")
    return {
        "authoredObjectCount": len(source),
        "commonAllLevels": common,
        "exactLevelNodes": exact_counts,
        "expandedNodeCount": len(created),
    }


def _export_objects() -> list:
    return sorted(
        [
            obj for obj in bpy.data.objects
            if obj.type == "MESH" or obj.name.startswith("LOD") or obj.name == "SOCKET_Structure_Core"
        ],
        key=lambda obj: obj.name,
    )


def _export_glb(target: Path, objects: list) -> None:
    if bpy.context.object and bpy.context.object.mode != "OBJECT":
        bpy.ops.object.mode_set(mode="OBJECT")
    bpy.ops.object.select_all(action="DESELECT")
    for obj in objects:
        obj.hide_set(False)
        obj.hide_viewport = False
        obj.select_set(True)
    target.parent.mkdir(parents=True, exist_ok=True)
    options = dict(
        filepath=str(target), export_format="GLB", use_selection=True, export_apply=True,
        export_yup=True, export_extras=True, export_animations=False, export_materials="EXPORT",
        export_texcoords=True, export_normals=True, export_tangents=True,
        export_image_format="AUTO", export_keep_originals=False,
    )
    try:
        bpy.ops.export_scene.gltf(**options)
    except TypeError:
        bpy.ops.export_scene.gltf(
            filepath=str(target), export_format="GLB", use_selection=True,
            export_apply=True, export_yup=True, export_extras=True,
            export_texcoords=True, export_normals=True, export_tangents=True,
        )


def main() -> int:
    parsed = _args()
    source = Path(bpy.data.filepath).resolve()
    if not source.is_file():
        raise RuntimeError("open an explicit Golden Station candidate blend before export")
    lod_receipt = _expand_runtime_lod_nodes()
    objects = _export_objects()
    _export_glb(parsed.output_glb.resolve(), objects)
    output = parsed.output_glb.resolve()
    report = {
        "schema": "spaceface.heliosGoldenStationExport.v1",
        "recipeId": RECIPE_ID,
        "sourceBlend": str(source),
        "sourceBlendSha256": _sha256(source),
        "outputGlb": str(output),
        "outputGlbSha256": _sha256(output),
        "outputBytes": output.stat().st_size,
        "selectedObjectCount": len(objects),
        "lod": lod_receipt,
        "runtimeContract": "exact LOD0_/LOD1_/LOD2_ node names; all-level geometry remains untagged",
    }
    parsed.report.resolve().parent.mkdir(parents=True, exist_ok=True)
    parsed.report.resolve().write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps({"ok": True, "glb": str(output), "report": str(parsed.report.resolve())}))
    return 0


if __name__ == "__main__":
    try:
        status = main()
    except BaseException:
        traceback.print_exc()
        sys.stderr.flush()
        sys.stdout.flush()
        os._exit(1)
    if status:
        os._exit(int(status))
